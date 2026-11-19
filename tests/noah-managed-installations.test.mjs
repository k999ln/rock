import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { PassThrough, Readable, Writable } from 'node:stream';
import { createInstallationManager, installationMiddleware, catalogLoader } from '../scripts/noah-managed-installations.mjs';
import { sourcePlan, InstallError, acquireSource, runCommand } from '../scripts/noah-source-fetch.mjs';
import { codexChannel } from '../scripts/noah-managed-adapters.mjs';

const a = 'owner-v1:' + 'a'.repeat(64), b = 'owner-v1:' + 'b'.repeat(64);
const id = 'research-' + '1'.repeat(20), id2 = 'research-' + '2'.repeat(20), id3 = 'research-' + '3'.repeat(20);
const entry = (ident = id) => ({ id: ident, name: 'External agent', kind: 'agent', identity: 'distribution', sources: [{ type: 'primary', url: 'https://github.com/example/agent' }] });
const receipt = { url: 'https://github.com/example/agent.git', commit: 'f'.repeat(40), sha256: 'e'.repeat(64), bytes: 1024, detected: ['pyproject.toml'] };
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
async function fixture(t, options = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'noah-install-test-'));
  const settings = { root, getEntry: async key => entry(key), acquire: async () => receipt, startAdapter: async () => null, ...options };
  const manager = createInstallationManager(settings);
  t.after(async () => { await manager.close(); await rm(root, { recursive: true, force: true }); });
  return { manager, root, settings };
}
async function settled(manager, owner = a, ident = id) {
  for (let tries = 0; tries < 300; tries++) { const status = await manager.status(owner, ident); if (!status.busy) return status; await new Promise(r => setTimeout(r, 5)); }
  throw new Error('installation did not settle');
}

void test('source resolution accepts public distribution repositories, never service pages or client commands', () => {
  assert.equal(sourcePlan(entry()).url, 'https://github.com/example/agent.git');
  const hf = entry(); hf.sources[0].url = 'https://huggingface.co/spaces/team/agent';
  assert.equal(sourcePlan(hf).url, 'https://huggingface.co/spaces/team/agent.git');
  for (const url of ['http://github.com/a/b', 'https://github.com.evil/a/b', 'https://u:p@github.com/a/b', 'https://github.com/a/b?command=run', 'https://github.com/a/b#install', 'https://github.com:8443/a/b', 'https://127.0.0.1/a/b', 'file:///etc/passwd', 'https://github.com/a/b/tree/main', 'https://botpress.com']) {
    const e = entry(); e.sources[0].url = url; assert.equal(sourcePlan(e).type, 'unavailable', url);
  }
  assert.equal(sourcePlan({ ...entry(), identity: 'name_group' }).type, 'unavailable');
  assert.equal(sourcePlan({ ...entry(), kind: 'model' }).type, 'unavailable');
  assert.equal(sourcePlan({ ...entry(), sources: [{ type: 'directory', url: 'https://github.com/a/b' }] }).type, 'unavailable');
});

void test('catalog resolver resolves the imported IDs and rejects path traversal', async () => {
  const loader = catalogLoader(path.resolve('.'));
  const codex = await loader('research-adc2fb98c295eaf3fc52');
  assert.equal(sourcePlan(codex).adapter, 'codex');
  assert.equal(sourcePlan(await loader('anicca')).pin, '28e7f3f333474f18b5da51acfe18b063cf727ad0');
  assert.equal(sourcePlan(await loader('research-5c04c1ebeaf57681227c')).type, 'unavailable');
  await assert.rejects(loader('../../secret'), e => e.status === 404);
  await assert.rejects(loader('research-' + '0'.repeat(20)), e => e.status === 404);
});

void test('concurrent clicks acquire once; source receipt does not falsely mean connected; owners stay isolated', async t => {
  const gate = deferred(); let calls = 0;
  const { manager } = await fixture(t, { acquire: async () => { calls++; await gate.promise; return receipt; } });
  const clicked = await Promise.all(Array.from({ length: 10 }, () => manager.connect(a, id)));
  assert.ok(clicked.every(s => s.busy)); gate.resolve();
  const done = await settled(manager); assert.equal(calls, 1); assert.equal(done.state, 'adapter_required'); assert.deepEqual(done.source, receipt);
  assert.equal((await manager.status(b, id)).state, 'idle'); assert.equal((await manager.list(b)).length, 0);
  assert.equal((await manager.list(a)).length, 1);
});

void test('cancel stops the preparation before an adapter can start, then retry succeeds', async t => {
  const gate = deferred(); let started = 0;
  const { manager } = await fixture(t, { acquire: async () => { await gate.promise; return receipt; }, startAdapter: async () => { started++; return null; } });
  await manager.connect(a, id); const stop = manager.disconnect(a, id); gate.resolve(); await stop;
  assert.equal((await settled(manager)).state, 'disconnected'); assert.equal(started, 0);
  await manager.connect(a, id); assert.equal((await settled(manager)).state, 'adapter_required'); assert.equal(started, 1);
});

void test('real connection depends on a live probe; restart never trusts stored ready; remove owns only its cache', async t => {
  let alive = true, stops = 0;
  const { manager, settings, root } = await fixture(t, { startAdapter: async () => ({ probe: async () => { if (!alive) throw new Error(); return { state: 'connected', message: 'verified' }; }, stop: async () => { stops++; } }) });
  await manager.connect(a, id); assert.equal((await settled(manager)).state, 'connected');
  const restored = createInstallationManager(settings); t.after(() => restored.close());
  assert.equal((await restored.status(a, id)).state, 'disconnected');
  alive = false; assert.equal((await manager.status(a, id)).state, 'disconnected'); assert.equal(stops, 1);
  await mkdir(path.join(root, 'unrelated')); await writeFile(path.join(root, 'unrelated/keep'), 'keep');
  await manager.remove(a, id); assert.equal((await manager.list(a)).length, 0); assert.deepEqual(await readdir(path.join(root, 'unrelated')), ['keep']);
});

void test('host parallel limit is enforced, and revoked ownership prevents adapter execution', async t => {
  const gate = deferred(); let started = 0, auth = 0;
  const { manager } = await fixture(t, { acquire: async () => { await gate.promise; return receipt; }, startAdapter: async () => { started++; return null; } });
  await manager.connect(a, id, async () => { if (++auth > 1) throw new InstallError('revoked', 403); });
  await manager.connect(a, id2); await assert.rejects(manager.connect(a, id3), e => e.status === 429);
  gate.resolve(); assert.equal((await settled(manager)).state, 'failed'); await settled(manager, a, id2); assert.equal(started, 1);
});

void test('unavailable sources do not trigger downloads; retrieval failures never report ready', async t => {
  let acquire = 0;
  const { manager } = await fixture(t, { getEntry: async ident => ident === id ? { ...entry(ident), sources: [] } : entry(ident), acquire: async () => { acquire++; throw new InstallError('download failed'); } });
  await manager.connect(a, id); assert.equal((await settled(manager)).state, 'unavailable'); assert.equal(acquire, 0);
  await manager.connect(a, id2); const failed = await settled(manager, a, id2); assert.equal(failed.state, 'failed'); assert.equal(failed.source, null);
});

async function call({ method = 'POST', suffix = `${id}/connect`, origin = 'http://127.0.0.1:3107', host = '127.0.0.1:3107', remote = '127.0.0.1', owner = a, scope = a, local = true, type = 'application/json', body = '{}', site = 'same-origin' } = {}) {
  let calls = 0, status, data;
  const request = Readable.from([Buffer.from(body)]);
  Object.assign(request, { url: '/__noah/installations' + (suffix ? '/' + suffix : ''), method, socket: { remoteAddress: remote }, headers: { host, origin, 'x-rock-owner-scope': scope, 'content-type': type, 'sec-fetch-site': site } });
  const manager = Object.fromEntries(['status', 'connect', 'disconnect', 'remove', 'list'].map(name => [name, async () => { calls++; return { busy: false }; }]));
  await installationMiddleware({ manager, port: 3107, getOwner: async () => ({ ownerScope: owner, localHostOwner: local }) })(request, { writeHead(code) { status = code; }, end(value) { data = JSON.parse(value); } }, () => {});
  return { calls, status, data };
}
void test('installation HTTP gate rejects foreign origins, remote hosts, owner switches, commands and oversized input', async () => {
  assert.equal((await call()).calls, 1);
  for (const args of [{ origin: 'https://evil.example' }, { remote: '10.0.0.2' }, { host: 'evil.example:3107' }, { site: 'cross-site' }, { scope: b }, { local: false }, { body: '{"command":"run"}' }, { body: 'null' }, { body: '[]' }, { body: 'x'.repeat(65) }, { type: 'text/plain' }, { method: 'GET' }]) {
    const r = await call(args); assert.ok(r.status >= 400); assert.equal(r.calls, 0);
  }
  assert.equal((await call({ method: 'GET', suffix: '' })).status, 200);
  assert.equal((await call({ method: 'GET', suffix: id })).status, 200);
  assert.equal((await call({ suffix: '../../etc' })).status, 404);
});

void test('Codex protocol uses initialize + account/read, does not export identity or permit tools', async () => {
  const child = new EventEmitter(); child.exitCode = null; child.signalCode = null; child.stdout = new PassThrough(); child.stderr = new PassThrough();
  const calls = []; let authenticated = true;
  child.stdin = new Writable({ write(data, _encoding, done) {
    const message = JSON.parse(data.toString()); calls.push(message);
    if (message.id) queueMicrotask(() => child.stdout.write(JSON.stringify({ id: message.id, result: message.method === 'account/read' ? { account: authenticated ? { type: 'chatgpt', email: 'private@example.com' } : null, requiresOpenaiAuth: true } : {} }) + '\n'));
    done();
  } });
  child.kill = () => { child.signalCode = 'SIGTERM'; queueMicrotask(() => child.emit('close', 0)); };
  const channel = codexChannel('/fixed/codex', '/fixed/workspace', { spawnProcess: () => child });
  await channel.initialize(); const probe = await channel.probe();
  assert.equal(probe.state, 'connected'); assert.ok(!JSON.stringify(probe).includes('private@example'));
  authenticated = false; assert.equal((await channel.probe()).state, 'setup_required');
  assert.deepEqual(calls.map(m => m.method), ['initialize', 'initialized', 'account/read', 'account/read']);
  assert.ok(calls.filter(m => m.method === 'account/read').every(m => m.params.refreshToken === false));
  await channel.stop();
});

void test('cached source corruption is rejected, and arbitrary download URLs cannot invoke Git', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'noah-source-corrupt-')); t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(path.join(directory, 'source')); await writeFile(path.join(directory, 'source/source.tar'), 'tampered'); await writeFile(path.join(directory, 'source/receipt.json'), JSON.stringify(receipt));
  await assert.rejects(acquireSource({ plan: { type: 'git', url: receipt.url }, directory }), /一致/);
  await assert.rejects(acquireSource({ plan: { type: 'git', url: 'https://127.0.0.1/secret.git' }, directory }), /配布元/);
});

void test('owned subprocess is canceled or times out without a shell', async () => {
  const c = new AbortController(); const p = runCommand(process.execPath, ['-e', 'setTimeout(()=>{},60000)'], { signal: c.signal, timeout: 2000 });
  c.abort(new InstallError('cancelled')); await assert.rejects(p, /cancelled/);
  await assert.rejects(runCommand(process.execPath, ['-e', 'setTimeout(()=>{},60000)'], { timeout: 30 }), /時間切れ/);
});
