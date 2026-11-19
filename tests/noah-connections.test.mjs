import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { createNoahConnectionManager } from '../scripts/noah-connection-manager.mjs';
import { createTextCheckAdapter } from '../scripts/noah-connection-adapters.mjs';
import { noahConnectionMiddleware } from '../scripts/noah-connections.mjs';
import { NOAH_TEST_MANIFEST_SHA256 } from '../lib/noah-local-connection.ts';

const context = (suffix = 'a', id = 'd8a4be55-6864-4dae-9a6e-659bc18cc5e5') => ({ ownerScope: `owner-v1:${suffix.repeat(64)}`, agent: { id, manifestSha256: NOAH_TEST_MANIFEST_SHA256, uploadState: 'ready' } });
async function fixture(t, adapter = createTextCheckAdapter()) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'noah-connection-'));
  const manager = createNoahConnectionManager({ directory, adapters: [adapter] });
  t.after(async () => { await manager.close(); await rm(directory, { recursive: true, force: true }); });
  return { manager, directory, adapter };
}
function fakeAdapter(overrides = {}) {
  let starts = 0, stops = 0, runs = 0;
  return { id: 'fake/1', manifestSha256: NOAH_TEST_MANIFEST_SHA256,
    start: async () => { starts++; return {}; }, probe: async () => {},
    run: async () => { runs++; return { text: 'result', inputLines: 1, uniqueLines: 1, removedLines: 0 }; }, stop: async () => { stops++; },
    counts: () => ({ starts, stops, runs }), ...overrides };
}

void test('real child: one-click prepare/probe, actual transformation, reload state and disconnect', async t => {
  const { manager, directory } = await fixture(t), c = context();
  assert.equal((await manager.status(c)).state, 'disconnected');
  const connected = await manager.connect(c); assert.equal(connected.state, 'ready'); assert.ok(connected.checkedAt);
  const run = await manager.run(c, { requestId: randomUUID(), text: '  資料\n連絡\n資料\n \n' });
  assert.equal(run.run.state, 'succeeded');
  assert.deepEqual(run.run.result, { text: '資料\n連絡', inputLines: 3, uniqueLines: 2, removedLines: 1 });
  assert.equal((await manager.status(c)).connectionId, connected.connectionId);
  const files = await readdir(directory); assert.equal(files.length, 1); assert.equal((await stat(path.join(directory, files[0]))).mode & 0o777, 0o600);
  assert.equal((await manager.disconnect(c)).state, 'disconnected');
  await assert.rejects(manager.run(c, { requestId: randomUUID(), text: 'blocked' }), /接続/);
});
void test('parallel connects and repeated run IDs execute once; changed input conflicts', async t => {
  const adapter = fakeAdapter(), { manager } = await fixture(t, adapter), c = context();
  const connections = await Promise.all(Array.from({ length: 10 }, () => manager.connect(c)));
  assert.equal(new Set(connections.map(r => r.connectionId)).size, 1); assert.equal(adapter.counts().starts, 1);
  const input = { requestId: randomUUID(), text: 'same' };
  await Promise.all(Array.from({ length: 5 }, () => manager.run(c, input)));
  assert.equal(adapter.counts().runs, 1);
  await assert.rejects(manager.run(c, { ...input, text: 'changed' }), e => e.status === 409);
});
void test('failed preparation never becomes ready and explicit retry recovers', async t => {
  let fail = true; const adapter = fakeAdapter({ probe: async () => { if (fail) throw new Error('offline'); } });
  const { manager } = await fixture(t, adapter), c = context();
  const failed = await manager.connect(c); assert.equal(failed.state, 'failed'); assert.equal(failed.connectionId, null); assert.equal(adapter.counts().stops, 1);
  fail = false; assert.equal((await manager.connect(c)).state, 'ready'); assert.equal(adapter.counts().starts, 2);
});
void test('real child termination is detected; reconnect creates a new runtime', async t => {
  const actual = createTextCheckAdapter(); let handle;
  const { manager } = await fixture(t, { ...actual, start: async () => { handle = await actual.start(); return handle; } });
  const c = context(), first = await manager.connect(c);
  await actual.stop(handle);
  assert.equal((await manager.status(c)).state, 'failed');
  const second = await manager.connect(c); assert.equal(second.state, 'ready'); assert.notEqual(second.connectionId, first.connectionId);
});
void test('unresponsive child times out and is stopped', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'noah-hung-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const runnerPath = path.join(directory, 'hung.mjs');
  await writeFile(runnerPath, "process.on('message', () => {}); process.on('disconnect', () => process.exit(0));");
  const { manager } = await fixture(t, createTextCheckAdapter({ timeoutMs: 100, runnerPath }));
  assert.equal((await manager.connect(context())).state, 'failed');
});
void test('restart retains results and deduplication but never resurrects a ready connection', async t => {
  const { manager, directory, adapter } = await fixture(t, fakeAdapter()), c = context();
  await manager.connect(c); const input = { requestId: randomUUID(), text: 'saved' }; await manager.run(c, input); await manager.close();
  const restarted = createNoahConnectionManager({ directory, adapters: [adapter] }); t.after(() => restarted.close());
  const status = await restarted.status(c); assert.equal(status.state, 'disconnected'); assert.equal(status.runs[0].state, 'succeeded');
  assert.equal((await restarted.run(c, input)).run.state, 'succeeded'); assert.equal(adapter.counts().runs, 1);
});
void test('unknown results are not automatically resubmitted, including after host restart', async t => {
  let count = 0; const adapter = fakeAdapter({ run: async () => { count++; throw new Error('lost response'); } });
  const { manager, directory } = await fixture(t, adapter), c = context();
  await manager.connect(c); const input = { requestId: randomUUID(), text: 'unknown' };
  assert.equal((await manager.run(c, input)).run.state, 'unknown');
  assert.equal((await manager.run(c, input)).run.state, 'unknown'); assert.equal(count, 1);
  await manager.close(); const file = path.join(directory, (await readdir(directory))[0]);
  const journal = JSON.parse(await readFile(file, 'utf8')); journal.runs[0].state = 'running'; await writeFile(file, JSON.stringify(journal));
  const restarted = createNoahConnectionManager({ directory, adapters: [adapter] }); t.after(() => restarted.close());
  assert.equal((await restarted.run(c, input)).run.state, 'unknown'); assert.equal(count, 1);
});
void test('owners and Agent IDs have separate connections and histories; definitions must match', async t => {
  const { manager } = await fixture(t, fakeAdapter()), a = context(), b = context('b'), c = context('a', randomUUID());
  await manager.connect(a); await manager.run(a, { requestId: randomUUID(), text: 'private' });
  for (const other of [b, c]) { const status = await manager.status(other); assert.equal(status.state, 'disconnected'); assert.deepEqual(status.runs, []); }
  assert.equal((await manager.connect({ ...a, agent: { ...a.agent, manifestSha256: 'other' } })).supported, false);
  assert.equal((await manager.connect({ ...a, agent: { ...a.agent, uploadState: 'pending' } })).supported, false);
});
void test('second adapter uses the same manager without a per-Agent conditional', async t => {
  const { directory } = await fixture(t), first = fakeAdapter(), second = fakeAdapter({ id: 'second/1', manifestSha256: 'second' });
  const manager = createNoahConnectionManager({ directory, adapters: [first, second] }); t.after(() => manager.close());
  const a = context(), b = { ...context('b'), agent: { ...context('b').agent, manifestSha256: 'second' } };
  assert.equal((await manager.connect(a)).adapter, 'fake/1'); assert.equal((await manager.connect(b)).adapter, 'second/1');
  assert.equal(first.counts().starts, 1); assert.equal(second.counts().starts, 1);
});
void test('full or unreadable journal fails closed before the Agent processes input', async t => {
  const adapter = fakeAdapter(), { manager, directory } = await fixture(t, adapter), c = context();
  await manager.connect(c); await manager.run(c, { requestId: randomUUID(), text: 'first' }); await manager.close();
  const file = path.join(directory, (await readdir(directory))[0]);
  const journal = JSON.parse(await readFile(file, 'utf8'));
  journal.runs = Array.from({ length: 1000 }, () => ({ ...journal.runs[0], requestId: randomUUID(), state: 'expired', result: undefined }));
  await writeFile(file, JSON.stringify(journal));
  const full = createNoahConnectionManager({ directory, adapters: [adapter] }); t.after(() => full.close());
  await assert.rejects(full.run(c, { requestId: randomUUID(), text: 'new' }), e => e.status === 429);
  await full.close(); await writeFile(file, '{broken');
  const corrupt = createNoahConnectionManager({ directory, adapters: [adapter] }); t.after(() => corrupt.close());
  await assert.rejects(corrupt.connect(c), e => e.status === 503); assert.equal(adapter.counts().runs, 1);
});
void test('invalid inputs are rejected before execution; journal is bounded', async t => {
  const adapter = fakeAdapter(), { manager } = await fixture(t, adapter), c = context(); await manager.connect(c);
  for (const input of [{}, { requestId: randomUUID(), text: '' }, { requestId: randomUUID(), text: 'x'.repeat(4001) }, { requestId: randomUUID(), text: 'x', command: 'anything' }]) await assert.rejects(manager.run(c, input), e => e.status === 400);
  assert.equal(adapter.counts().runs, 0);
  const original = { requestId: randomUUID(), text: 'expired' }; await manager.run(c, original);
  for (let i = 0; i < 22; i++) await manager.run(c, { requestId: randomUUID(), text: String(i) });
  assert.equal((await manager.status(c)).runs.length, 20);
  await assert.rejects(manager.run(c, original), e => e.status === 410); assert.equal(adapter.counts().runs, 23);
});

async function call({ action = 'connect', method = 'POST', body = '{}', headers = {}, remote = '127.0.0.1', denied = false, mismatch = false } = {}) {
  const c = context(); let calls = 0, status, data;
  const manager = Object.fromEntries(['status', 'connect', 'disconnect', 'run', 'startOperation', 'stopOperation'].map(name => [name, async () => { calls++; return { supported: true, state: 'ready' }; }]));
  const req = Readable.from([Buffer.from(body)]);
  Object.assign(req, { url: '/__noah/connections/' + c.agent.id + (action ? '/' + action : ''), method, headers: { host: '127.0.0.1:3107', origin: 'http://127.0.0.1:3107', 'content-type': 'application/json', 'x-rock-owner-scope': c.ownerScope, ...headers }, socket: { remoteAddress: remote } });
  const response = { writeHead(code) { status = code; }, end(raw) { data = JSON.parse(raw); } };
  const getAgent = async () => denied ? null : mismatch ? { ...c, agent: { ...c.agent, id: randomUUID() } } : c;
  await noahConnectionMiddleware({ manager, port: 3107, getAgent })(req, response, () => {});
  return { calls, status, data };
}
void test('bridge verifies owner, local Host/socket and same-Origin before mutation', async () => {
  assert.equal((await call()).status, 200);
  for (const args of [{ headers: { origin: 'https://evil.example' } }, { headers: { host: 'evil.example:3107' } }, { remote: '192.168.1.2' }, { headers: { 'sec-fetch-site': 'cross-site' } }]) { const r = await call(args); assert.equal(r.status, 403); assert.equal(r.calls, 0); }
  for (const args of [{ denied: true }, { mismatch: true }, { headers: { 'x-rock-owner-scope': context('b').ownerScope } }]) assert.equal((await call(args)).calls, 0);
  assert.equal((await call({ action: '', method: 'GET', denied: true })).status, 404);
});
void test('bridge rejects command injection, oversized input, invalid JSON, unknown routes and methods', async () => {
  for (const body of ['{"command":"anything"}', 'null', '[]', '{invalid']) { const r = await call({ body }); assert.equal(r.status, 400); assert.equal(r.calls, 0); }
  assert.equal((await call({ body: ' '.repeat(32769) })).status, 413);
  assert.equal((await call({ action: 'unknown' })).status, 404);
  assert.equal((await call({ method: 'GET' })).status, 405);
  assert.equal((await call({ headers: { 'content-type': 'text/plain' } })).status, 415);
  assert.equal((await call({ action: '', method: 'GET' })).status, 200);
});
void test('operation routes retain method, origin and owner-scope checks', async () => {
  for (const action of ['operation/start', 'operation/stop']) {
    assert.equal((await call({ action })).status, 200);
    for (const args of [{ method: 'GET' }, { headers: { origin: 'https://evil.example' } }, { headers: { 'x-rock-owner-scope': context('b').ownerScope } }, { denied: true }]) assert.equal((await call({ action, ...args })).calls, 0);
  }
  assert.equal((await call({ action: 'operation/stop', body: '{"command":"stop"}' })).status, 400);
});
