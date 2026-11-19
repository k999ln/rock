import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  mkdir,
  readdir,
  writeFile,
  rename,
  open,
} from 'node:fs/promises';
import { constants } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { createInstallationManager } from './noah-managed-installations.mjs';
import { createTerminalInstallations } from './noah-terminal-installations.mjs';
import { closeNoahModelManager } from './noah-model-manager.mjs';
import { recipeFor } from '../lib/noah-execution-contract.mjs';
import { configureNoahEngine } from './noah-isolated-runtime.mjs';
import { macService, lockRunner } from './noah-mac-service.mjs';
import { InstallError, runCommand } from './noah-source-fetch.mjs';

export function runnerOrigin(value, allowLocal = false) {
  const u = new URL(value);
  if (
    u.username ||
    u.password ||
    u.search ||
    u.hash ||
    u.pathname !== '/' ||
    !(
      (u.protocol === 'https:' && u.hostname === 'avoado.si' && !u.port) ||
      (allowLocal && u.protocol === 'http:' && u.hostname === '127.0.0.1')
    )
  )
    throw new Error('Noahの接続先は https://avoado.si を指定してください。');
  return u.origin;
}
export async function inspectRunnerReceipts(root, api) {
  const overview = await api.json('/api/noah/launch');
  const names = await readdir(path.join(root, 'receipts')).catch((e) => {
    if (e.code === 'ENOENT') return [];
    throw e;
  });
  return names
    .filter((n) => /^[a-f0-9-]{36}\.json$/.test(n))
    .sort()
    .slice(-100)
    .map((name) => {
      const id = name.slice(0, -5),
        command = overview.commands.find((c) => c.id === id);
      return {
        id,
        serverState: command?.state ?? '履歴範囲外・未確認',
        localReceipt: path.join(root, 'receipts', name),
      };
    });
}
export async function boundedResponse(response, max = 2 * 1024 * 1024) {
  if (!response.body) throw new Error('応答がありません。');
  const reader = response.body.getReader(),
    parts = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.length;
    if (n > max) {
      await reader.cancel();
      throw new Error('応答が大きすぎます。');
    }
    parts.push(value);
  }
  return Buffer.concat(parts);
}
export function runnerClient(origin, token, fetcher = fetch) {
  async function request(route, body) {
    if (
      !/^\/api\/(noah|rockstar)\//.test(route) ||
      route.includes('..') ||
      route.includes('#')
    )
      throw new Error('APIの宛先を確認してください。');
    return fetcher(origin + route, {
      method: body ? 'POST' : 'GET',
      headers: {
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
    });
  }
  return {
    async json(route, body) {
      const r = await request(route, body),
        v = JSON.parse((await boundedResponse(r)).toString());
      if (!r.ok)
        throw new InstallError(v.error || 'Noahへ接続できません。', r.status);
      return v;
    },
    async bytes(route) {
      const r = await request(route);
      if (!r.ok) throw new InstallError('保存版を取得できません。', r.status);
      return boundedResponse(r);
    },
  };
}
export async function runnerDoctor({
  platform = process.platform,
  arch = process.arch,
  run = runCommand,
} = {}) {
  const checks = [
    {
      name: 'Apple Silicon Mac',
      ok: platform === 'darwin' && arch === 'arm64',
    },
    {
      name: 'Node 24以上',
      ok: Number(process.versions.node.split('.')[0]) >= 24,
    },
  ];
  for (const name of ['docker', 'colima', 'ollama', 'git']) {
    try {
      await run(name, ['--version'], {
        env: { PATH: process.env.PATH, HOME: process.env.HOME },
        timeout: 5000,
      });
      checks.push({ name, ok: true });
    } catch {
      checks.push({ name, ok: false });
    }
  }
  return { ready: checks.every((c) => c.ok), checks };
}
export async function saveRunnerConfig(file, value) {
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = file + '.' + randomUUID();
  await writeFile(temporary, JSON.stringify(value), {
    mode: 0o600,
    flag: 'wx',
  });
  await rename(temporary, file);
}
export async function readRunnerConfig(file) {
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const s = await handle.stat();
    if (
      !s.isFile() ||
      s.nlink !== 1 ||
      s.uid !== process.getuid() ||
      (s.mode & 0o077) !== 0
    )
      throw new Error('本人所有の通常ファイルを権限600で保存してください。');
    const value = JSON.parse(await handle.readFile('utf8'));
    if (!/^rock_session_[A-Za-z0-9_-]{43}$/.test(value.token))
      throw new Error('Macの認証をやり直してください。');
    return value;
  } finally {
    await handle.close();
  }
}

export async function pairRunner({
  origin,
  file,
  fetcher = fetch,
  signal = new AbortController().signal,
  print = console.log,
}) {
  const api = runnerClient(origin, null, fetcher),
    started = await api.json('/api/rockstar/device-authorizations', {
      action: 'begin',
      deviceName: 'Noah Mac Runner',
    });
  if (
    !/^[A-Z2-9]{8}$/.test(started.userCode) ||
    !/^rock_device_[A-Za-z0-9_-]{43}$/.test(started.deviceCode)
  )
    throw new Error('本人確認の応答を確認できません。');
  print(
    `NoahでこのMacを承認してください: ${origin}/connect/device?user_code=${started.userCode}`,
  );
  const end = Date.now() + Math.min(started.expiresIn, 600) * 1000;
  while (Date.now() < end) {
    await delay(5000, undefined, { signal });
    const result = await api.json('/api/rockstar/device-authorizations', {
      action: 'poll',
      deviceCode: started.deviceCode,
    });
    if (result.status === 'authorized') {
      if (
        !/^rock_session_[A-Za-z0-9_-]{43}$/.test(result.accessToken) ||
        typeof result.ownerUserId !== 'string'
      )
        throw new Error('認証応答が不正です。');
      await saveRunnerConfig(file, {
        origin,
        token: result.accessToken,
        expiresAt: result.expiresAt,
        owner: result.ownerUserId,
      });
      print('このMacの接続を保存しました。');
      return;
    }
    if (!['authorization_pending', 'slow_down'].includes(result.status))
      throw new Error('Macの承認が終了しました。再度接続してください。');
  }
  throw new Error('Mac承認の期限が切れました。');
}

export async function createMacRunner({
  root,
  api,
  platform = process.platform + '-' + process.arch,
  prepareCatalog,
  prepareTerminal,
  engineDirectory = path.join(
    os.homedir(),
    '.noah-engine',
    createHash('sha256').update(path.resolve(root)).digest('hex').slice(0, 12),
  ),
  signal = new AbortController().signal,
}) {
  configureNoahEngine(root, engineDirectory);
  const bootId = randomUUID(),
    enrolled = await api.json('/api/noah/runner', {
      action: 'enroll',
      bootId,
      name: 'Noah Mac Runner',
      platform,
    }),
    deviceId = enrolled.device.id,
    scope = enrolled.ownerScope;
  const catalog =
    prepareCatalog ??
    createInstallationManager({
      root,
      getEntry: async (id) => {
        if (!recipeFor(id)) throw new Error('未対応Agentです。');
        return { id, kind: 'agent', name: recipeFor(id).name };
      },
    });
  const terminal = prepareTerminal ?? createTerminalInstallations({ root });
  const base = { deviceId, bootId },
    connections = new Map();
  let active = null,
    closed = false;
  const call = (action, input = {}) =>
    api.json('/api/noah/runner', { ...base, ...input, action });
  async function loadSource(pin, download) {
    const isRelease = pin.kind === 'release';
    if (!isRelease && pin.kind !== 'upload')
      throw new Error('配布形式を確認してください。');
    const data = await api.json(
      isRelease
        ? '/api/noah/releases?manifest=' + pin.manifestSha256
        : '/api/noah/agents/' + pin.agentId,
    );
    if (data.ownerScope !== scope)
      throw new Error('アカウントが変わりました。');
    const r = data.release,
      a = isRelease
        ? {
            id: r.id,
            manifest: {
              name: r.manifest.name,
              version: r.manifest.version,
              runtime: r.artifact.runtime,
            },
            manifestSha256: r.manifestSha256,
            source: r.artifact,
            uploadState: 'ready',
            release: {
              packageKey: r.packageKey,
              manifestSha256: r.manifestSha256,
              sourceSha256: r.artifact.sha256,
              runtime: r.artifact.runtime,
              timeoutSeconds: r.manifest.execution.timeoutSeconds,
            },
          }
        : data.agent;
    if (
      a?.id !== pin.agentId ||
      a.manifestSha256 !== pin.manifestSha256 ||
      a.source?.sha256 !== pin.sourceSha256
    )
      throw new Error('保存した配布版と一致しません。');
    if (!download) return { agent: a };
    const bytes = await api.bytes(
      isRelease
        ? '/api/noah/releases/' +
            encodeURIComponent(r.packageKey) +
            '/source?manifest=' +
            pin.manifestSha256
        : '/api/noah/agents/' + pin.agentId + '/source',
    );
    return { agent: a, bytes };
  }
  async function processCommand(c) {
    signal.throwIfAborted();
    const controller = new AbortController(),
      abort = () => controller.abort();
    signal.addEventListener('abort', abort, { once: true });
    active = { controller, command: c };
    let heartbeatBusy = false,
      lost = false,
      calls = 0;
    const beat = async () => {
      if (heartbeatBusy) return;
      heartbeatBusy = true;
      try {
        const v = await call('heartbeat', { id: c.id, lease: c.lease });
        if (v.stop) controller.abort();
      } catch {
        lost = true;
        controller.abort();
      } finally {
        heartbeatBusy = false;
      }
    };
    const timer = setInterval(() => void beat(), 4000);
    let prepared, attemptedFinish;
    const persist = async (receipt) => {
      await mkdir(path.join(root, 'receipts'), {
        recursive: true,
        mode: 0o700,
      });
      await writeFile(
        path.join(root, 'receipts', c.id + '.json'),
        JSON.stringify(receipt),
        { mode: 0o600 },
      );
    };
    try {
      await beat();
      controller.signal.throwIfAborted();
      const pin = c.payload.pin;
      if (c.kind === 'connect') {
        const engine = pin.kind === 'catalog' ? catalog : terminal;
        const prior = connections.get(pin.agentId);
        if (prior) await prior.engine.disconnect(scope, pin.agentId);
        if (pin.kind === 'catalog')
          await engine.connect(scope, pin.agentId, async () => {
            await beat();
            controller.signal.throwIfAborted();
          });
        else
          await engine.connect(scope, pin.agentId, (download) =>
            loadSource(pin, download),
          );
        const cancel = () =>
          void engine.disconnect(scope, pin.agentId).catch(() => {});
        controller.signal.addEventListener('abort', cancel, { once: true });
        try {
          for (;;) {
            controller.signal.throwIfAborted();
            const status = await (engine.status
              ? engine.status(scope, pin.agentId)
              : engine.get(scope, pin.agentId));
            if (status.state === 'connected') {
              prepared = await engine.execution(scope, pin.agentId);
              break;
            }
            if (
              [
                'failed',
                'setup_required',
                'unavailable',
                'adapter_required',
                'disconnected',
              ].includes(status.state)
            )
              throw new Error(status.message || '接続を完了できません。');
            await delay(500, undefined, { signal: controller.signal });
          }
        } finally {
          controller.signal.removeEventListener('abort', cancel);
          if (controller.signal.aborted)
            await engine.disconnect(scope, pin.agentId);
        }
        await beat();
        controller.signal.throwIfAborted();
        await call('finish', {
          id: c.id,
          lease: c.lease,
          state: 'succeeded',
          execution: {
            ...prepared.execution,
            ...(prepared.binding?.provider
              ? { provider: prepared.binding.provider }
              : {}),
          },
        });
        connections.set(pin.agentId, { commandId: c.id, engine });
      } else {
        const connection = connections.get(pin.agentId);
        if (!connection || connection.commandId !== c.payload.connectionId)
          throw new Error('この実行器でAgentへ再接続してください。');
        prepared = await connection.engine.execution(scope, pin.agentId);
        await prepared.revalidate?.();
        await beat();
        controller.signal.throwIfAborted();
        // A lost start response is never retried: it could already have started.
        await call('start', { id: c.id, lease: c.lease });
        const result = await prepared.run(
          c.payload.prompt,
          controller.signal,
          async (n) => {
            await beat();
            controller.signal.throwIfAborted();
            await prepared.revalidate?.();
            calls = n;
          },
        );
        await beat();
        controller.signal.throwIfAborted();
        attemptedFinish = {
          id: c.id,
          lease: c.lease,
          state: 'succeeded',
          result,
          calls,
        };
        await persist({ ...base, action: 'finish', ...attemptedFinish });
        await call('finish', attemptedFinish);
      }
    } catch (e) {
      if (c.kind === 'connect') {
        const pin = c.payload.pin;
        await (pin.kind === 'catalog' ? catalog : terminal)
          .disconnect(scope, pin.agentId)
          .catch(() => {});
        connections.delete(pin.agentId);
      }
      const receipt = {
        ...base,
        id: c.id,
        lease: c.lease,
        action: 'finish',
        state:
          lost || (attemptedFinish && !e.status)
            ? 'unknown'
            : controller.signal.aborted
              ? 'cancelled'
              : 'failed',
        calls,
        error: e instanceof Error ? e.message : '処理失敗',
        ...(attemptedFinish ? { attemptedFinish } : {}),
      };
      // Keep only this account's private recovery receipt; never auto-reexecute.
      await persist(receipt);
      const { attemptedFinish: _savedOnly, ...report } = receipt;
      await api.json('/api/noah/runner', report).catch(() => {});
    } finally {
      clearInterval(timer);
      signal.removeEventListener('abort', abort);
      active = null;
    }
  }
  return {
    deviceId,
    bootId,
    async tick() {
      if (closed || active) return;
      const data = await call('poll');
      for (const id of data.disconnect ?? []) {
        for (const [agent, connection] of connections) {
          if (connection.commandId === id) {
            await connection.engine.disconnect(scope, agent);
            connections.delete(agent);
          }
        }
        try {
          await call('disconnected', { id });
        } catch (e) {
          if (e.status !== 409) throw e;
        }
      }
      if (data.command) await processCommand(data.command);
    },
    async close() {
      closed = true;
      active?.controller.abort();
      await Promise.all([catalog.close(), terminal.close()]);
      await closeNoahModelManager(root);
    },
    async run() {
      while (!closed && !signal.aborted) {
        try {
          await this.tick();
        } catch {
          await this.close();
          throw new Error(
            'Noahとの接続が切れました。仕事は再実行しません。再接続してください。',
          );
        }
        await delay(1500, undefined, { signal }).catch(() => {});
      }
    },
  };
}

export async function main(args = process.argv.slice(2)) {
  const command = args[0] ?? 'doctor',
    root = path.resolve(
      process.env.NOAH_RUNNER_HOME ??
        path.join(os.homedir(), 'Library/Application Support/Noah/runner'),
    );
  const origin = runnerOrigin(
      process.env.NOAH_ORIGIN ?? 'https://avoado.si',
      process.env.NOAH_RUNNER_TEST_LOCAL === '1',
    ),
    file = path.join(root, 'account.json');
  if (command === 'doctor') {
    console.log(JSON.stringify(await runnerDoctor(), null, 2));
    return;
  }
  const controller = new AbortController();
  process.once('SIGTERM', () => controller.abort());
  process.once('SIGINT', () => controller.abort());
  if (command === 'pair')
    return pairRunner({ origin, file, signal: controller.signal });
  if (['stop', 'status'].includes(command)) {
    console.log(
      await macService(command, {
        root,
        entry: fileURLToPath(import.meta.url),
      }),
    );
    return;
  }
  if (!['run', 'start', 'receipts'].includes(command))
    throw new Error(
      '使用方法: noah doctor | pair | start | stop | status | run | receipts',
    );
  const config = await readRunnerConfig(file);
  if (config.origin !== origin || config.expiresAt <= Date.now())
    throw new Error('Noahの認証をやり直してください。');
  if (command === 'receipts') {
    console.log(
      JSON.stringify(
        await inspectRunnerReceipts(root, runnerClient(origin, config.token)),
        null,
        2,
      ),
    );
    return;
  }
  const health = await runnerDoctor();
  if (!health.ready)
    throw new Error(
      '導入が未完了です。noah doctorで必要なものを確認してください。',
    );
  if (command === 'start') {
    console.log(
      await macService('start', {
        root,
        entry: fileURLToPath(import.meta.url),
      }),
    );
    return;
  }
  const unlock = await lockRunner(root);
  // Runtime assets are installed beside this entrypoint; data stays in root.
  let runner;
  try {
    runner = await createMacRunner({
      root,
      api: runnerClient(origin, config.token),
      signal: controller.signal,
    });
    console.log(
      'Noah Runnerを接続しました。依頼・成果・停止はNoahで操作できます。',
    );
    await runner.run();
  } finally {
    await runner?.close();
    await unlock();
  }
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url)
  main().catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
