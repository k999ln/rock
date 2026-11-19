import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import ts from 'typescript';
import { containerArgs, engineSocket, ensureEngine } from './noah-isolated-runtime.mjs';
import { InstallError, runCommand } from './noah-source-fetch.mjs';

export const VALIDATION_IMAGES = Object.freeze({
  node: 'node:24-bookworm-slim@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54',
  python: 'python:3.12-slim-bookworm@sha256:935c3c5b12357a7e10caa9c1e6ca5692344d97cf229832ef584be2cec9fc03df',
});

export function checkProjectTypes(project) {
  const root = '/input', library = path.dirname(ts.getDefaultLibFilePath({}));
  const files = new Map(project.files.map(f => [root + '/' + f.name, f.content]));
  const options = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext,
    strict: true, noEmit: true, allowJs: true, checkJs: false, skipLibCheck: true, types: [], allowImportingTsExtensions: true, lib: ['lib.es2022.d.ts'] };
  const base = ts.createCompilerHost(options);
  const read = name => files.get(name) ?? (path.dirname(name) === library && /^lib\..*\.d\.ts$/.test(path.basename(name)) ? ts.sys.readFile(name) : undefined);
  const host = { ...base, getCurrentDirectory: () => root + (project.root ? '/' + project.root : ''), readFile: read, fileExists: name => read(name) !== undefined,
    directoryExists: name => name === root || name === library || [...files.keys()].some(f => f.startsWith(name + '/')),
    getSourceFile: (name, version) => { const text = read(name); return text === undefined ? undefined : ts.createSourceFile(name, text, version, true); } };
  const roots = project.editable.filter(name => /\.[cm]?[jt]s$/i.test(name)).map(name => root + '/' + name);
  const program = ts.createProgram(roots, options, host);
  return ts.getPreEmitDiagnostics(program).filter(d => d.category === ts.DiagnosticCategory.Error).slice(0, 12)
    .map(d => `${d.file ? path.posix.relative(root, d.file.fileName) : 'code'}: ${ts.flattenDiagnosticMessageText(d.messageText, ' ').slice(0, 300)}`);
}

const STAGE = `import fs from 'node:fs';import path from 'node:path';let data='';for await(const c of process.stdin)data+=c;const p=JSON.parse(data);for(const f of p.files){const n=path.join('/input',f.name);fs.mkdirSync(path.dirname(n),{recursive:true});fs.writeFileSync(n,f.content,{flag:'wx',mode:0o444});}console.log('staged');`;
const PYTHON_CHECK = `import ast,json,pathlib,sys
p=json.loads(sys.stdin.read()); names={pathlib.PurePosixPath(f['name']).parts[0] for f in p['files']}; names|={pathlib.PurePosixPath(f['name']).stem for f in p['files']}; errors=[]; missing=set()
for f in p['files']:
 if not f['name'].endswith('.py'): continue
 try:
  tree=ast.parse(f['content'], filename=f['name']); compile(tree, f['name'], 'exec')
  for n in ast.walk(tree):
   modules=[a.name.split('.')[0] for a in n.names] if isinstance(n,ast.Import) else [n.module.split('.')[0]] if isinstance(n,ast.ImportFrom) and n.module and not n.level else []
   for m in modules:
    if m not in sys.stdlib_module_names and m not in names: missing.add(m)
 except (SyntaxError,ValueError) as e: errors.append(f['name']+': '+str(e)[:300])
print(json.dumps({'errors':errors[:12], 'missing':sorted(missing)}))`;
const PYTHON_TEST = `import json,sys,unittest
p=json.loads(sys.stdin.read()); sys.path.insert(0, '.'); suite=unittest.TestSuite(); loader=unittest.TestLoader()
for name in p['tests']: suite.addTests(loader.loadTestsFromName(name[:-3].replace('/','.')))
result=unittest.TextTestRunner(verbosity=2).run(suite)
sys.exit(0 if result.wasSuccessful() and result.testsRun>0 and not result.skipped else 1)`;

// This helper never uses a shell or a host bind mount. stdin contains bounded
// source data. Always remove the container on abort/timeout/output overflow.
export async function projectContainer(root, args, input, signal) {
  signal.throwIfAborted();
  const name = args[args.indexOf('--name') + 1];
  return new Promise((resolve, reject) => {
    const child = spawn('docker', ['--host', engineSocket(root), ...args], { stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '', failure, removing;
    const stop = () => {
      failure ||= new InstallError('隔離検証を停止しました。', 409);
      removing ||= runCommand('docker', ['--host', engineSocket(root), 'rm', '-f', name], { timeout: 15000 }).catch(() => {}); child.kill('SIGTERM');
    };
    const timer = setTimeout(stop, 30000); signal.addEventListener('abort', stop, { once: true });
    const append = data => { output += data.toString(); if (Buffer.byteLength(output) > 65536) stop(); };
    child.stdout.on('data', append); child.stderr.on('data', append);
    child.stdin.on('error', () => {});
    child.on('error', () => { failure = new InstallError('隔離検証器を起動できません。', 503); });
    child.once('close', async code => { clearTimeout(timer); signal.removeEventListener('abort', stop); await removing; if (failure) reject(failure); else resolve({ passed: code === 0, exitCode: code, output: output.slice(-16000) }); });
    child.stdin.end(JSON.stringify(input));
    if (signal.aborted) stop();
  });
}

export async function validateProject({ root, project, signal, run = projectContainer }) {
  signal.throwIfAborted();
  if (!project.tests.length || !project.editable.length) return { passed: false, stage: 'unverified', message: '元コードの固定テストがありません。テスト付きのZIPを指定してください。' };
  const types = checkProjectTypes(project);
  if (types.length) return { passed: false, stage: 'typecheck', output: types.join('\n') };
  await ensureEngine(root, signal);
  const docker = (args, options = {}) => runCommand('docker', ['--host', engineSocket(root), ...args], { signal, timeout: 180000, ...options });
  for (const image of new Set([VALIDATION_IMAGES.node, ...(project.files.some(f => f.name.endsWith('.py')) ? [VALIDATION_IMAGES.python] : [])])) {
    try { await docker(['image', 'inspect', image]); } catch { signal.throwIfAborted(); await docker(['pull', image]); }
  }
  const volume = `noah-validation-${randomUUID()}`;
  await docker(['volume', 'create', '--label', 'noah.purpose=source-validation', volume]);
  const args = (image, command, writable = false) => {
    const a = containerArgs(`noah-project-${randomUUID()}`, image);
    if (writable) a[a.indexOf('--user') + 1] = '0:0';
    a.splice(a.length - 1, 0, '--mount', `type=volume,src=${volume},dst=/input,volume-nocopy${writable ? '' : ',readonly'}`, '--workdir', '/input' + (project.root ? '/' + project.root : ''), '--env', 'PYTHONDONTWRITEBYTECODE=1', '--entrypoint', command[0]);
    a.push(...command.slice(1)); return a;
  };
  const results = [];
  try {
    const stageArgs = args(VALIDATION_IMAGES.node, ['node', '--input-type=module', '-e', STAGE], true);
    stageArgs[stageArgs.indexOf('--workdir') + 1] = '/input';
    const staged = await run(root, stageArgs, project, signal);
    if (!staged.passed) throw new InstallError('検証する原本を隔離領域へ配置できません。', 503);
    if (project.files.some(f => f.name.endsWith('.py'))) {
      const syntax = await run(root, args(VALIDATION_IMAGES.python, ['python', '-I', '-c', PYTHON_CHECK]), project, signal);
      let check; try { check = JSON.parse(syntax.output); } catch { throw new InstallError('Pythonの構文検査を確認できません。', 503); }
      if (!syntax.passed || check.errors.length) return { passed: false, stage: 'syntax', output: check.errors.join('\n') };
      if (check.missing.length) return { passed: false, stage: 'dependencies', message: '必要なPython依存が未配備です。自動インストールせず原本を保持します。', missing: check.missing };
    }
    for (const language of ['node', 'python']) {
      const tests = project.tests.filter(f => language === 'python' ? f.endsWith('.py') : /\.[cm]?[jt]s$/.test(f)).map(f => project.root ? f.slice(project.root.length + 1) : f);
      if (!tests.length) continue;
      const command = language === 'node' ? ['node', '--experimental-strip-types', '--test', '--test-reporter=tap', ...tests] : ['python', '-I', '-c', PYTHON_TEST];
      const result = await run(root, args(VALIDATION_IMAGES[language], command), { tests }, signal);
      // Node can exit successfully without executing an assertion-bearing test.
      // A declared suite must actually execute tests; skipped cases are not pass.
      if (language === 'node') result.passed &&= /# tests [1-9]\d*/.test(result.output) && /# fail 0(?:\r?\n|$)/.test(result.output) && /# skipped 0(?:\r?\n|$)/.test(result.output);
      results.push({ language, ...result });
    }
    return { passed: results.length > 0 && results.every(r => r.passed), stage: 'tests', typecheck: project.editable.some(f => /\.[cm]?ts$/.test(f)) ? 'passed' : 'not_applicable', results, images: VALIDATION_IMAGES, sourceSha256: project.digest };
  } finally {
    // Cancellation must not prevent cleanup. Remove only this run's volume.
    await runCommand('docker', ['--host', engineSocket(root), 'volume', 'rm', volume], { timeout: 15000 }).catch(() => {});
  }
}
