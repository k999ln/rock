import { randomUUID } from 'node:crypto';
import { sourceProject } from '../lib/noah-source-project.ts';
import { parseTerminalRuntime, TERMINAL_SURFACE } from '../lib/noah-terminal-contract.mjs';
import { containerArgs, engineSocket, ensureEngine, localModel, runIsolatedProtocol } from './noah-isolated-runtime.mjs';
import { projectContainer, VALIDATION_IMAGES } from './noah-project-validation.mjs';
import { InstallError, runCommand, sha256 } from './noah-source-fetch.mjs';
import { LIMITS } from './noah-execution-recipes.mjs';
import { getNoahModelManager } from './noah-model-manager.mjs';

const STAGE = `import fs from 'node:fs';import path from 'node:path';let data='';for await(const c of process.stdin)data+=c;const p=JSON.parse(data);for(const f of p.files){const n=path.join('/input',f.name);fs.mkdirSync(path.dirname(n),{recursive:true});fs.writeFileSync(n,f.content,{flag:'wx',mode:0o444});}console.log('staged');`;

export async function terminalSource(name, bytes, expectedSha, definition) {
  const runtime = parseTerminalRuntime(definition);
  if (!/^[a-f0-9]{64}$/.test(expectedSha) || sha256(bytes) !== expectedSha) throw new InstallError('保存したコードと取得したコードのhashが一致しません。', 409);
  const project = await sourceProject(name, bytes);
  const entry = (project.root ? project.root + '/' : '') + runtime.entrypoint;
  if (!project.files.some(f => f.name === entry)) throw new InstallError('実行定義のファイルが保存したコードにありません。', 422);
  return { runtime, project, entry, sourceSha256: expectedSha };
}

export function terminalContainerArgs(name, image, volume, project, entry, language, stage = false) {
  if (!/^noah-terminal-[a-f0-9-]{36}$/.test(volume)) throw new InstallError('隔離コード領域を確認できません。');
  const args = containerArgs(name, image);
  if (stage) args[args.indexOf('--user') + 1] = '0:0';
  const command = stage ? ['node', '--input-type=module', '-e', STAGE] : language === 'node'
    ? ['node', '--experimental-strip-types', '/input/' + entry]
    : ['python', '-I', '-u', '-c', `import runpy,sys;sys.path.insert(0,${JSON.stringify('/input' + (project.root ? '/' + project.root : ''))});runpy.run_path(${JSON.stringify('/input/' + entry)},run_name='__main__')`];
  args.splice(args.length - 1, 0, '--mount', `type=volume,src=${volume},dst=/input,volume-nocopy${stage ? '' : ',readonly'}`,
    '--workdir', stage ? '/input' : '/workspace', '--env', 'PYTHONDONTWRITEBYTECODE=1', '--env', 'HOME=/home/agent',
    '--env', 'DISPLAY=', '--env', 'WAYLAND_DISPLAY=', '--env', 'DBUS_SESSION_BUS_ADDRESS=', '--env', 'XAUTHORITY=', '--entrypoint', command[0]);
  args.push(...command.slice(1));
  return args;
}

export async function prepareTerminalRuntime({ root, name, bytes, expectedSha, definition, signal, seconds = 240 }) {
  if (!Number.isInteger(seconds) || seconds < 1 || seconds > 240) throw new InstallError('実行時間の上限を確認してください。');
  // Parse and bound the whole snapshot before staging; no shell, installer,
  // symlink or path from uploaded code runs with the Mac user's permissions.
  const source = await terminalSource(name, bytes, expectedSha, definition);
  await ensureEngine(root, signal);
  const docker = (args, options = {}) => runCommand('docker', ['--host', engineSocket(root), ...args], { signal, ...options });
  let image;
  for (const pinned of new Set([VALIDATION_IMAGES.node, VALIDATION_IMAGES[source.runtime.language]])) {
    try { await docker(['image', 'inspect', pinned]); } catch { signal.throwIfAborted(); await docker(['pull', pinned]); }
    if (pinned === VALIDATION_IMAGES[source.runtime.language]) image = (await docker(['image', 'inspect', pinned, '--format', '{{.Id}}'])).trim();
  }
  if (!/^sha256:[a-f0-9]{64}$/.test(image)) throw new InstallError('固定した実行imageを確認できません。');
  const modelHandle=source.runtime.model==='none'?null:await(await getNoahModelManager(root)).acquire(source.runtime.model,signal);
  const controllers = new Map(); let stopped = false;
  const run = async (prompt, runSignal, onModel = async () => {}) => {
    if (stopped) throw new InstallError('接続は停止しています。');
    const controller = new AbortController(), current = AbortSignal.any([controller.signal, runSignal]);
    const task = (async () => {
      current.throwIfAborted();
      const volume = `noah-terminal-${randomUUID()}`;
      await docker(['volume', 'create', '--label', 'noah.purpose=terminal-source', volume], { signal: current });
      try {
        const stage = await projectContainer(root, terminalContainerArgs(`noah-stage-${randomUUID()}`, VALIDATION_IMAGES.node, volume, source.project, source.entry, source.runtime.language, true), source.project, current);
        if (!stage.passed) throw new InstallError('コードを隔離環境へ配置できません。');
        current.throwIfAborted();
        return await runIsolatedProtocol({ root, args: terminalContainerArgs(`noah-terminal-run-${randomUUID()}`, image, volume, source.project, source.entry, source.runtime.language),
          request: { schema: 'noah-terminal-input/1', prompt }, signal: current, onModel, seconds, requireModel: source.runtime.model !== 'none',
          ...(modelHandle ? { model: (body, s) => localModel(body, s, fetch, source.runtime.model, LIMITS.outputTokens, modelHandle) } : {}) });
      } finally {
        // Teardown of the process is confirmed by runIsolatedProtocol first.
        await docker(['volume', 'rm', volume], { signal: undefined, timeout: 15000 }).catch(() => {});
      }
    })();
    controllers.set(controller, task);
    try { return await task; } finally { controllers.delete(controller); }
  };
  return { source, execution: { image, model: source.runtime.model, ...(modelHandle?{modelSha256:modelHandle.digest}:{}), isolation: TERMINAL_SURFACE, limits: { ...LIMITS, seconds },
    capability: '登録したコードを専用環境で実行します。本人の画面・入力・ブラウザには接続しません。' }, run,
    async stop() { stopped = true; for (const c of controllers.keys()) c.abort(); await Promise.allSettled(controllers.values());modelHandle?.release(); } };
}
