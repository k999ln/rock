import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir, userInfo } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { isLocalRuntimeHost, isLocalRuntimeRequest } from '../lib/sky-private-loopback.mjs';
import { beginLinuxRun, finishLinuxRun, cancelLinuxRun, confirmLinuxRun, linuxRunExport, parseLinuxAgent } from '../lib/sky-linux-local.ts';
import { createWorkJob } from '../lib/workflow.ts';
import { createLinuxLocalManager, createSkyLinuxLocalPlugin, linuxRuntimeDownloadUrl } from '../scripts/sky-linux-local-runtime.mjs';

const modelSha256 = 'a'.repeat(64);
const agent = { id: randomUUID(), name: '担当', instructions: '文章を整理する', modelId: 'local', sha256: 'b'.repeat(64) };
const output = { text: '実際に作った下書き', modelSha256, durationMs: 12 };
void test('Pixel initial browser navigation may load static UI; API still requires same origin', () => {
  const initial = { socket: { remoteAddress: '127.0.0.1' }, headers: { host: '127.0.0.1:5199', 'sec-fetch-site': 'cross-site' } };
  assert.equal(isLocalRuntimeHost(initial, 5199), true);
  assert.equal(isLocalRuntimeRequest(initial, 5199), false);
  assert.equal(isLocalRuntimeRequest({ ...initial, headers: { ...initial.headers, origin: 'http://127.0.0.1:5199' } }, 5199), false);
  assert.equal(isLocalRuntimeRequest({ ...initial, headers: { host: '127.0.0.1:5199', origin: 'http://127.0.0.1:5199', 'sec-fetch-site': 'same-origin' } }, 5199), true);
  assert.equal(isLocalRuntimeHost({ ...initial, socket: { remoteAddress: '192.168.1.2' } }, 5199), false);
  assert.equal(isLocalRuntimeHost({ ...initial, headers: { host: 'attacker.example:5199' } }, 5199), false);
});
void test('Linux text work uses shared review/confirm/cancel/revision; private templates are not public', () => {
  const run = beginLinuxRun(agent, '依頼', randomUUID(), modelSha256);
  assert.equal(run.job.status, 'active');
  assert.throws(() => createWorkJob({ id: randomUUID(), title: 'x', templateId: run.job.templateId }));
  const ready = finishLinuxRun(run, output);
  assert.equal(ready.job.status, 'review'); assert.equal(ready.job.revision, 1);
  assert.equal(confirmLinuxRun(ready).job.status, 'completed');
  assert.throws(() => finishLinuxRun(cancelLinuxRun(run), output));
  assert.throws(() => finishLinuxRun(run, { ...output, modelSha256: 'c'.repeat(64) }));
  assert.throws(() => linuxRunExport(cancelLinuxRun(ready)));
  const exported = linuxRunExport(ready);
  assert.match(exported, /Skyなし/); assert.match(exported, /未計測/); assert.match(exported, /未確定/);
  assert.equal(ready.usage.cloudTokensUsed, 0); assert.equal(ready.usage.cloudUsageMinor, 0);
});
void test('agent input cannot introduce arbitrary code, endpoint or unbounded material', () => {
  for (const patch of [{ code: 'sh' }, { endpoint: 'http://evil' }, { instructions: 'x'.repeat(1201) }, { name: '' }, { permissions: ['root'] }])
    assert.throws(() => parseLinuxAgent({ name: '担当', instructions: '文章作成', modelId: 'local', ...patch }));
  assert.equal(parseLinuxAgent({ name: '担当', instructions: '$(touch /tmp/no)', modelId: 'local' }).instructions, '$(touch /tmp/no)');
  assert.throws(() => beginLinuxRun(agent, 'x'.repeat(4001), randomUUID(), modelSha256));
  const source = 'a'.repeat(2000);
  assert.equal(beginLinuxRun(agent, source, randomUUID(), modelSha256).input, source);
});
void test('a reused PID from an earlier Linux boot does not block the owner server', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'sky-reused-pid-'));
  await writeFile(join(dir, 'manager.lock'), JSON.stringify({ pid: process.pid, boot: 'earlier-guest', start: 'earlier-process' }));
  const manager = await createLinuxLocalManager({ stateDir: dir });
  try { await assert.rejects(createLinuxLocalManager({ stateDir: dir }), /別のSky/); }
  finally { await manager.close(); await rm(dir, { recursive: true, force: true }); }
});
void test('a stale Linux lock pointing at a protected system PID is reclaimable', { skip: process.platform !== 'linux' }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'sky-protected-pid-'));
  await writeFile(join(dir, 'manager.lock'), JSON.stringify({ pid: 1, boot: 'earlier-boot', start: 'earlier-process' }));
  const manager = await createLinuxLocalManager({ stateDir: dir });
  try { await assert.rejects(createLinuxLocalManager({ stateDir: dir }), /別のSky/); }
  finally { await manager.close(); await rm(dir, { recursive: true, force: true }); }
});
void test('owner store, idempotent same work, late-result stop and restart reconciliation', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'sky-linux-test-'));
  const lock = JSON.parse(await readFile(new URL('../toolkits/sky-linux-local/runtime-lock.json', import.meta.url)));
  let resolveRun, dispatched = 0, stops = 0;
  const ownAgent = { ...agent, modelId: lock.model.id };
  const state = { schema: 1, owner: `local-uid:${userInfo().uid}`, phase: 'ready', models: [lock.model], agents: [ownAgent], runs: [], error: null };
  await writeFile(join(dir, 'state.json'), JSON.stringify(state));
  const exec = args => {
    if (args.at(-1) === 'Path.home())') return { promise: Promise.resolve('/home/test') };
    if (args.includes('-c')) return { promise: Promise.resolve('/home/test') };
    if (args.at(-1) === 'run') { dispatched++; return { promise: new Promise(r => { resolveRun = r; }) }; }
    if (args.includes('stop')) { stops++; return { promise: Promise.resolve(JSON.stringify({ confirmed: true })) }; }
    throw new Error('unexpected fixed command ' + JSON.stringify(args));
  };
  let manager;
  try {
    manager = await createLinuxLocalManager({ stateDir: dir, exec });
    await assert.rejects(createLinuxLocalManager({ stateDir: dir, exec }), /別のSky/);
    const id = randomUUID(); const request = { action: 'run', agentId: ownAgent.id, input: '依頼', accepted: true, requestId: id };
    await assert.rejects(manager.action({ ...request, surface: 'eve', agentSha256: 'changed', modelSha256: lock.model.sha256 }), /変わり/);
    await assert.rejects(manager.action({ ...request, surface: 'eve', agentSha256: ownAgent.sha256, modelSha256: 'changed' }), /変わり/);
    assert.equal(dispatched, 0);
    await manager.action(request); await manager.action(request);
    assert.equal(dispatched, 1);
    await assert.rejects(manager.action({ ...request, input: '別の依頼' }), /異な/);
    await manager.action({ action: 'stop', jobId: id }); assert.equal(stops, 1);
    resolveRun(JSON.stringify({ ...output, modelSha256: lock.model.sha256, platform: 'linux', architecture: 'aarch64' }));
    await new Promise(r => setTimeout(r, 30));
    assert.equal(manager.snapshot().runs[0].text, null);
    assert.equal(manager.snapshot().runs[0].stop, 'confirmed');
    await manager.close(); manager = null;
    const saved = JSON.parse(await readFile(join(dir, 'state.json')));
    saved.runs[0] = { ...beginLinuxRun(ownAgent, '中断した依頼', randomUUID(), lock.model.sha256), inputSha256: 'x' };
    await writeFile(join(dir, 'state.json'), JSON.stringify(saved));
    manager = await createLinuxLocalManager({ stateDir: dir, exec });
    assert.equal(manager.snapshot().runs[0].job.status, 'cancelled');
    assert.equal(manager.snapshot().runs[0].stop, 'confirmed');
    assert.equal(dispatched, 1);
  } finally { await manager?.close(); await rm(dir, { recursive: true, force: true }); }
});
void test('Eve and Sky read the same Linux job, model, usage and artifact after reopen', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'eve-linux-shared-'));
  const lock = JSON.parse(await readFile(new URL('../toolkits/sky-linux-local/runtime-lock.json', import.meta.url)));
  const ownAgent = { ...agent, modelId: lock.model.id };
  await writeFile(join(dir, 'state.json'), JSON.stringify({ schema: 1, owner: `local-uid:${userInfo().uid}`, phase: 'ready', models: [lock.model], agents: [ownAgent], runs: [], error: null }));
  let calls = 0;
  const exec = args => ({ promise: args.at(-1) === 'run' ? (calls++, Promise.resolve(JSON.stringify({ ...output, modelSha256: lock.model.sha256, platform: 'linux', architecture: 'aarch64' }))) : Promise.resolve('/home/test') });
  let manager;
  try {
    manager = await createLinuxLocalManager({ stateDir: dir, exec });
    const request = { action: 'run', surface: 'eve', agentSha256: ownAgent.sha256, modelSha256: lock.model.sha256, agentId: ownAgent.id, input: 'Eveからの依頼', accepted: true, requestId: randomUUID() };
    await manager.action(request); await new Promise(r => setTimeout(r, 20)); await manager.action(request);
    const run = manager.snapshot().runs[0]; assert.equal(calls, 1); assert.equal(run.surface, 'eve');
    assert.equal(run.job.id, request.requestId); assert.equal(run.job.status, 'review'); assert.equal(run.usage.cloudUsageMinor, 0);
    assert.deepEqual(run.handoff, { agentSha256: ownAgent.sha256, modelSha256: lock.model.sha256 });
    await assert.rejects(manager.action({ ...request, surface: undefined }), /入口/);
    await manager.close(); manager = await createLinuxLocalManager({ stateDir: dir, exec });
    assert.deepEqual(manager.snapshot().runs[0], run); assert.equal(calls, 1);
  } finally { await manager?.close(); await rm(dir, { recursive: true, force: true }); }
});
void test('private middleware is dev-only, rejects remote/no-origin and never exposes production routes', async () => {
  const plugin = createSkyLinuxLocalPlugin(); assert.equal(plugin.apply, 'serve');
  let middleware; plugin.configureServer({ httpServer: { address: () => ({ port: 4000 }) }, middlewares: { use: fn => { middleware = fn; } } });
  for (const request of [
    { socket: { remoteAddress: '10.0.0.1' }, headers: { host: 'localhost:4000', origin: 'http://localhost:4000' } },
    { socket: { remoteAddress: '127.0.0.1' }, headers: { host: 'localhost:4000', origin: 'https://evil.test' } },
    { socket: { remoteAddress: '127.0.0.1' }, headers: { host: 'localhost:4000' } },
  ]) {
    let status; await middleware({ ...request, url: '/__sky/linux', method: 'POST' }, { writeHead: s => { status = s; }, end: () => {} }, () => {});
    assert.equal(status, 403);
  }
});

void test('Pixel environment uses only its local spawn/prepare/stop adapter and the same work contract', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'sky-pixel-linux-test-'));
  const model = JSON.parse(await readFile(new URL('../toolkits/sky-linux-local/runtime-lock.json', import.meta.url))).model;
  let ran = 0, stopped = 0, prepared = 0;
  const environment = {
    id: 'pixel-linux', phaseLabels: { stopped: 'AIの実行を停止しました' },
    async prepare() { prepared++; return { ready: true, platform: 'linux', architecture: 'aarch64', modelSha256: model.sha256 }; },
    async stop() { stopped++; },
    spawn(args) {
      if (args.includes('-c')) return { promise: Promise.resolve('/home/droid') };
      assert.equal(args[0], 'python3'); assert.equal(args.at(-1), 'run'); ran++;
      return { promise: Promise.resolve(JSON.stringify({ ...output, modelSha256: model.sha256, platform: 'linux', architecture: 'aarch64' })) };
    },
  };
  const manager = await createLinuxLocalManager({ stateDir: dir, environment, exec: () => { throw new Error('Pixel cannot dispatch to a PC VM'); } });
  try {
    await manager.action({ action: 'add-model', modelId: model.id, accepted: true });
    await manager.action({ action: 'prepare', accepted: true });
    for (let i = 0; i < 20 && manager.snapshot().phase !== 'ready'; i++) await new Promise(r => setTimeout(r, 5));
    await manager.action({ action: 'add-agent', agent: { name: '担当', instructions: '文章を整理', modelId: model.id } });
    await manager.action({ action: 'run', accepted: true, agentId: manager.snapshot().agents[0].id, input: '依頼', requestId: randomUUID() });
    for (let i = 0; i < 20 && manager.snapshot().runs[0].job.status === 'active'; i++) await new Promise(r => setTimeout(r, 5));
    assert.equal(manager.snapshot().vm, 'pixel-linux'); assert.equal(manager.snapshot().runs[0].job.status, 'review');
    assert.equal(ran, 1); assert.equal(prepared, 1);
    await manager.action({ action: 'stop-environment' });
    assert.equal(stopped, 1); assert.equal(manager.snapshot().phase, 'stopped');
    assert.match((await manager.action({ action: 'export', jobId: manager.snapshot().runs[0].job.id })).text, /下書き/);
  } finally { await manager.close(); await rm(dir, { recursive: true, force: true }); }
});

void test('Pixel package pins Node and native runner, serves only local assets, and preserves plain original output', async () => {
  const node = JSON.parse(await readFile(new URL('../toolkits/sky-linux-local/node-lock.json', import.meta.url)));
  assert.match(node.url, /^https:\/\/nodejs\.org\/dist\/v22\./);
  assert.match(node.sha256, /^[a-f0-9]{64}$/); assert.ok(node.bytes > 10000000);
  const source = await readFile(new URL('../toolkits/sky-linux-local/pixel-server.mjs', import.meta.url), 'utf8');
  assert.match(source, /process\.platform !== 'linux'/); assert.match(source, /server\.listen\(port, '127\.0\.0\.1'/);
  assert.match(source, /isLocalRuntimeRequest\(request, port\)/); assert.doesNotMatch(source, /0\.0\.0\.0|wrangler|limactl|ollama/);
  const client = await readFile(new URL('../components/sky-linux-local-lab.tsx', import.meta.url), 'utf8');
  assert.match(client, /pixelLocal/); assert.match(client, /このPixel本体のLinux/); assert.doesNotMatch(client, /dangerouslySetInnerHTML/);
});

void test('stopping the Pixel environment only stops live own jobs and preserves completed raw output', () => {
  const result = spawnSync('python3', ['-c', `
import importlib.util, tempfile, json
from pathlib import Path
spec = importlib.util.spec_from_file_location('worker', 'toolkits/sky-linux-local/worker.py')
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)
with tempfile.TemporaryDirectory(prefix='sky-stop-test-') as folder:
    worker.ROOT = Path(folder)
    complete = worker.job_dir('a' * 36)
    active = worker.job_dir('b' * 36)
    (complete / 'process.json').write_text(json.dumps({'pid': 1}))
    (active / 'process.json').write_text(json.dumps({'pid': 2}))
    (complete / 'output.txt').write_text('original result')
    worker.alive = lambda receipt: receipt and receipt['pid'] == 2
    calls = []
    def stop(key):
        calls.append(key)
        return {'confirmed': True}
    worker.stop = stop
    assert worker.stop_all() == {'confirmed': True}
    assert calls == ['b' * 36]
    assert (complete / 'output.txt').read_text() == 'original result'
`], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});

void test('Pixel memory failure cannot become ready, and a changed guest boot requires new preparation', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'sky-pixel-boot-test-'));
  const model = JSON.parse(await readFile(new URL('../toolkits/sky-linux-local/runtime-lock.json', import.meta.url))).model;
  let small = true;
  const environment = { id: 'pixel-linux', bootId: 'first', spawn() { throw new Error('not needed'); },
    async prepare() { return small ? { ready: false, errorCode: 'memory-too-small' } : { ready: true, platform: 'linux', architecture: 'aarch64', modelSha256: model.sha256, bootId: 'first' }; } };
  let manager = await createLinuxLocalManager({ stateDir: dir, environment });
  try {
    await manager.action({ action: 'add-model', modelId: model.id, accepted: true });
    await manager.action({ action: 'prepare', accepted: true });
    for (let i = 0; i < 30 && manager.snapshot().phase === 'preparing'; i++) await new Promise(r => setTimeout(r, 5));
    assert.equal(manager.snapshot().phase, 'failed'); assert.match(manager.snapshot().error, /メモリ.*4GB/);
    small = false; await manager.action({ action: 'prepare', accepted: true });
    for (let i = 0; i < 30 && manager.snapshot().phase === 'preparing'; i++) await new Promise(r => setTimeout(r, 5));
    assert.equal(manager.snapshot().phase, 'ready'); await manager.close();
    manager = await createLinuxLocalManager({ stateDir: dir, environment: { ...environment, bootId: 'second' } });
    assert.equal(manager.snapshot().phase, 'stopped'); assert.match(manager.snapshot().error, /再起動/);
    assert.equal(manager.snapshot().models.length, 1);
  } finally { await manager.close(); await rm(dir, { recursive: true, force: true }); }
});

void test('runtime lock files cannot redirect a download or send local file values to arbitrary endpoints', () => {
  const pinned = 'https://github.com/ggml-org/llama.cpp/releases/download/b11723/llama-b11723-bin-ubuntu-arm64.tar.gz';
  assert.equal(linuxRuntimeDownloadUrl(pinned), pinned);
  for (const url of ['http://127.0.0.1/private','https://attacker.invalid/collect?secret=local-file', pinned+'?token=private', pinned.replace('github.com','github.com.attacker.invalid'), undefined]) {
    assert.throws(() => linuxRuntimeDownloadUrl(url), /取得元/);
  }
});
