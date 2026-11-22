import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { checkNoahSourceTypes } from './noah-source-typecheck.mjs';
import { containerArgs, engineSocket } from './noah-isolated-runtime.mjs';
import { InstallError, runCommand } from './noah-source-fetch.mjs';

export function codeSnapshot(value) {
  if (!value || !Array.isArray(value.files) || value.files.length < 2 || value.files.length > 16 || typeof value.target !== 'string' || typeof value.test !== 'string') throw new InstallError('対象コードと固定テストを指定してください。', 400);
  const names = new Set(); let bytes = 0;
  for (const f of value.files) {
    if (!f || typeof f.name !== 'string' || !/^[a-zA-Z0-9_][a-zA-Z0-9_./-]*\.(?:mjs|cjs|js|ts)$/.test(f.name) || f.name.startsWith('/') || f.name.split('/').some(p => !p || p.startsWith('.')) || names.has(f.name) || typeof f.content !== 'string' || Buffer.byteLength(f.content) > 16384) throw new InstallError('対応外のファイルです。相対パスのJS/TSだけを指定してください。', 400);
    names.add(f.name); bytes += Buffer.byteLength(f.content);
  }
  if (bytes > 65536 || value.target === value.test || !names.has(value.target) || !names.has(value.test) || !value.test.endsWith('.test.mjs')) throw new InstallError('対象とテストの組を確認してください。', 400);
  return { files: value.files.map(({ name, content }) => ({ name, content })), target: value.target, test: value.test };
}
// The compiler reads only supplied source and its own standard library. It never
// evaluates the input, loads project plugins, or follows workspace configuration.
export function checkCodeTypes(snapshot) {
  return checkNoahSourceTypes({ files: snapshot.files, root: '/noah-input', entrypoints: [snapshot.target], maxErrors: 8, maxMessageLength: 400 });
}
const RUNNER = `import fs from 'node:fs';import{spawnSync}from'node:child_process';import path from'node:path';let raw='';for await(const c of process.stdin)raw+=c;const x=JSON.parse(raw);for(const f of x.files){const p=path.join('/workspace',f.name);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,f.content);}fs.writeFileSync('/workspace/package.json','{"type":"module"}');const r=spawnSync(process.execPath,['--experimental-strip-types','--test',x.test],{cwd:'/workspace',encoding:'utf8',timeout:20000,maxBuffer:32768,env:{PATH:process.env.PATH,HOME:'/tmp',NODE_NO_WARNINGS:'1'}});console.log(JSON.stringify({passed:r.status===0&&!r.error,exitCode:r.status,output:((r.stdout||'')+(r.stderr||'')+(r.error?.message||'')).slice(-16000)}));`;

export async function validateCode({ root, snapshot: input, signal }) {
  const snapshot = codeSnapshot(input), errors = checkCodeTypes(snapshot);
  if (errors.length) return { passed: false, stage: 'typecheck', output: errors.join('\n') };
  const image = 'node:24-bookworm-slim@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54';
  const docker = args => runCommand('docker', ['--host', engineSocket(root), ...args], { signal, timeout: 180000 });
  try { await docker(['image', 'inspect', image]); } catch { signal.throwIfAborted(); await docker(['pull', image]); }
  signal.throwIfAborted();
  const name = `noah-code-check-${randomUUID()}`, args = containerArgs(name, image);
  args.splice(args.length - 1, 0, '--entrypoint', 'node');
  args.push('--input-type=module', '-e', RUNNER);
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const child = spawn('docker', ['--host', engineSocket(root), ...args], { stdio: ['pipe', 'pipe', 'ignore'] });
    let text = '', failure;
    const stop = () => { failure ||= new InstallError('コード検証を停止しました。'); const cleanup = spawn('docker', ['--host', engineSocket(root), 'rm', '-f', name], { stdio: 'ignore' }); cleanup.on('error', () => {}); child.kill('SIGTERM'); };
    const timer = setTimeout(stop, 30000); signal.addEventListener('abort', stop, { once: true });
    child.stdout.setEncoding('utf8'); child.stdout.on('data', data => { text += data; if (Buffer.byteLength(text) > 65536) stop(); });
    child.stdin.on('error', stop);
    child.on('error', () => { failure = new InstallError('隔離した検証器を起動できません。'); });
    child.once('close', code => {
      clearTimeout(timer); signal.removeEventListener('abort', stop);
      if (failure || code !== 0) return reject(failure || new InstallError('コード検証器が正常終了しませんでした。'));
      try { const result = JSON.parse(text); if (typeof result.passed !== 'boolean' || typeof result.output !== 'string') throw new Error(); resolve({ ...result, stage: 'tests', typecheck: 'passed' }); }
      catch { reject(new InstallError('検証結果を確認できません。')); }
    });
    child.stdin.end(JSON.stringify(snapshot));
  });
}
