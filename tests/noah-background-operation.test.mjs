import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createNoahConnectionManager } from '../scripts/noah-connection-manager.mjs';
import { createTextCheckAdapter } from '../scripts/noah-connection-adapters.mjs';
import { NOAH_TEST_MANIFEST_SHA256 } from '../lib/noah-local-connection.ts';

function fakeClock() {
  let now = 1800000000000, sequence = 0;
  const timers = new Map();
  return {
    now: () => now,
    setTimeout: (callback, delay) => { const id = ++sequence; timers.set(id, { at: now + delay, callback }); return id; },
    clearTimeout: id => timers.delete(id),
    size: () => timers.size,
    async advance(ms) {
      now += ms;
      for (;;) {
        const due = [...timers].find(([, timer]) => timer.at <= now);
        if (!due) return;
        timers.delete(due[0]); await due[1].callback();
      }
    },
  };
}
function context(owner = 'a') {
  const c = { ownerScope: `owner-v1:${owner.repeat(64)}`, agent: { id: 'd8a4be55-6864-4dae-9a6e-659bc18cc5e5', manifestSha256: NOAH_TEST_MANIFEST_SHA256, uploadState: 'ready' } };
  return { ...c, revalidate: async () => c };
}
const input = () => ({ requestId: randomUUID(), text: '  調べる\n作る\n調べる', intervalSeconds: 10 });
function adapter(overrides = {}) {
  let runs = 0, starts = 0;
  return { id: 'test/1', manifestSha256: NOAH_TEST_MANIFEST_SHA256, start: async () => { starts++; return {}; }, probe: async () => {}, stop: async () => {}, run: async () => { runs++; return { text: 'done', inputLines: 3, uniqueLines: 2, removedLines: 1 }; }, counts: () => ({ runs, starts }), ...overrides };
}
async function fixture(t, a = adapter()) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'noah-background-')), clock = fakeClock();
  const manager = createNoahConnectionManager({ directory, clock, adapters: [a] });
  t.after(async () => { await manager.close(); await rm(directory, { force: true, recursive: true }); });
  return { manager, directory, clock, a };
}

void test('actual child keeps processing scheduled work without status polling or browser requests', async t => {
  const { manager, clock } = await fixture(t, createTextCheckAdapter()), c = context(), request = input();
  const started = await manager.startOperation(c, request); assert.equal(started.operation.state, 'running');
  // No status, run, heartbeat, or browser requests between the scheduled ticks.
  await clock.advance(0); await clock.advance(10000); await clock.advance(10000);
  const result = await manager.status(c);
  assert.equal(result.operation.id, request.requestId); assert.equal(result.operation.succeededCount, 3);
  assert.deepEqual(result.runs.map(r => r.sequence), [1, 2, 3]);
  assert.deepEqual(result.runs[2].result, { text: '調べる\n作る', inputLines: 3, uniqueLines: 2, removedLines: 1 });
  await manager.stopOperation(c); await clock.advance(120000);
  assert.equal((await manager.status(c)).operation.succeededCount, 3); assert.equal(clock.size(), 0);
});
void test('start is idempotent and stale starts cannot restart stopped operation', async t => {
  const { manager, clock, a } = await fixture(t), c = context(), request = input();
  const responses = await Promise.all(Array.from({ length: 5 }, () => manager.startOperation(c, request)));
  assert.equal(new Set(responses.map(r => r.operation.id)).size, 1); assert.equal(a.counts().starts, 1); assert.equal(clock.size(), 1);
  await assert.rejects(manager.startOperation(c, { ...request, text: 'changed' }), e => e.status === 409);
  await assert.rejects(manager.startOperation(c, input()), e => e.status === 409);
  await manager.stopOperation(c);
  assert.equal((await manager.startOperation(c, request)).operation.state, 'stopped');
  await clock.advance(60000); assert.equal(a.counts().runs, 0);
  await manager.startOperation(c, input());
  await assert.rejects(manager.startOperation(c, request), e => e.status === 409);
});
void test('stop during an active run drains that result and prevents another dispatch', async t => {
  let accept, release;
  const begun = new Promise(resolve => { accept = resolve; });
  const pending = new Promise(resolve => { release = resolve; });
  let count = 0;
  const { manager, clock } = await fixture(t, adapter({ run: async () => { count++; accept(); await pending; return { text: 'done' }; } }));
  const c = context(); await manager.startOperation(c, input()); const tick = clock.advance(0); await begun;
  let stopped = false; const stopping = manager.stopOperation(c).then(result => { stopped = true; return result; });
  assert.equal(stopped, false); release(); await tick;
  const status = await stopping; assert.equal(status.operation.state, 'stopped'); assert.equal(status.operation.succeededCount, 1);
  await clock.advance(100000); assert.equal(count, 1); assert.equal(clock.size(), 0);
});
void test('stop wins while authorization is in flight, before any processing', async t => {
  let accept, release;
  const begun = new Promise(resolve => { accept = resolve; }), pending = new Promise(resolve => { release = resolve; });
  const { manager, clock, a } = await fixture(t), c = context();
  c.revalidate = async () => { accept(); await pending; return c; };
  await manager.startOperation(c, input()); const tick = clock.advance(0); await begun;
  const stopping = manager.stopOperation(c); release(); await tick; await stopping;
  assert.equal(a.counts().runs, 0); assert.equal(clock.size(), 0);
});
void test('owner, definition, ready state and revocation are rechecked on every tick', async t => {
  for (const change of [c => ({ ...c, ownerScope: context('b').ownerScope }), c => ({ ...c, agent: { ...c.agent, manifestSha256: 'changed' } }), c => ({ ...c, agent: { ...c.agent, uploadState: 'pending' } }), () => { throw new Error('deleted'); }]) {
    const { manager, clock, a } = await fixture(t), c = context(); let revoked = false;
    c.revalidate = async () => revoked ? change(c) : c;
    await manager.startOperation(c, input()); await clock.advance(0); revoked = true; await clock.advance(10000);
    assert.equal((await manager.status(c)).operation.state, 'blocked'); assert.equal(a.counts().runs, 1); assert.equal(clock.size(), 0);
  }
});
void test('a different owner cannot inspect or stop an existing operation', async t => {
  const { manager, clock } = await fixture(t), a = context(), b = context('b');
  await manager.startOperation(a, input()); await manager.stopOperation(b);
  assert.equal((await manager.status(b)).operation, null); assert.deepEqual((await manager.status(b)).runs, []);
  await clock.advance(0); assert.equal((await manager.status(a)).operation.succeededCount, 1);
});
void test('unreconciled processing blocks automatic retries and preserves an unknown result', async t => {
  let attempts = 0;
  const { manager, clock } = await fixture(t, adapter({ run: async () => { attempts++; throw new Error('lost result'); } })), c = context();
  await manager.startOperation(c, input()); await clock.advance(0); await clock.advance(60000);
  const status = await manager.status(c); assert.equal(status.operation.state, 'blocked'); assert.equal(status.runs[0].state, 'unknown'); assert.equal(attempts, 1);
});
void test('health failure stops the schedule immediately when observed', async t => {
  let healthy = true;
  const { manager, clock, a } = await fixture(t, adapter({ probe: async () => { if (!healthy) throw new Error('offline'); } })), c = context();
  await manager.startOperation(c, input()); await clock.advance(0); healthy = false;
  assert.equal((await manager.status(c)).operation.state, 'blocked');
  await clock.advance(10000); assert.equal(a.counts().runs, 1); assert.equal(clock.size(), 0);
});
void test('failed pre-dispatch storage never executes and displays a skipped tick', async t => {
  const { manager, clock, directory, a } = await fixture(t), c = context();
  await manager.startOperation(c, input());
  await rename(directory, directory + '-saved'); await writeFile(directory, 'blocked');
  try {
    await clock.advance(0); const status = await manager.status(c);
    assert.equal(status.operation.state, 'blocked'); assert.equal(status.runs[0].state, 'skipped'); assert.equal(a.counts().runs, 0); assert.equal(clock.size(), 0);
  } finally { await rm(directory); await rename(directory + '-saved', directory); }
});
void test('history and counts survive restart, while execution requires an explicit new start', async t => {
  const { manager, clock, directory, a } = await fixture(t), c = context();
  await manager.startOperation(c, input()); await clock.advance(0); await clock.advance(10000); await manager.close();
  assert.equal(clock.size(), 0);
  const restarted = createNoahConnectionManager({ directory, clock, adapters: [a] }); t.after(() => restarted.close());
  const state = await restarted.status(c); assert.equal(state.operation.state, 'interrupted'); assert.equal(state.operation.succeededCount, 2); assert.equal(state.runs.length, 2);
  await clock.advance(60000); assert.equal(a.counts().runs, 2);
  await restarted.startOperation(c, input()); await clock.advance(0); assert.equal(a.counts().runs, 3);
  const journal = JSON.parse(await readFile(path.join(directory, (await readdir(directory)).find(name => name.endsWith('.json'))), 'utf8'));
  assert.equal(journal.version, 2); assert.equal(JSON.stringify(journal).includes('revalidate'), false);
});
void test('late host wake does not catch up missed intervals; history remains bounded', async t => {
  const { manager, clock, a } = await fixture(t), c = context();
  await manager.startOperation(c, input()); await clock.advance(3600000); assert.equal(a.counts().runs, 1);
  for (let i = 0; i < 25; i++) await clock.advance(10000);
  const state = await manager.status(c); assert.equal(state.operation.succeededCount, 26); assert.equal(state.runs.length, 20); assert.equal(state.runs[0].sequence, 7);
});
void test('disconnect stops scheduling, and invalid operation settings never start work', async t => {
  const { manager, clock, a } = await fixture(t), c = context();
  for (const patch of [{ intervalSeconds: 1 }, { intervalSeconds: '10' }, { text: '' }, { command: 'anything' }, { requestId: 'invalid' }]) await assert.rejects(manager.startOperation(c, { ...input(), ...patch }), e => e.status === 400);
  await assert.rejects(manager.startOperation({ ...c, revalidate: undefined }, input()), e => e.status === 503);
  assert.equal(a.counts().starts, 0);
  await manager.startOperation(c, input()); await clock.advance(0);
  await assert.rejects(manager.run(c, { requestId: randomUUID(), text: 'manual' }), e => e.status === 409);
  assert.equal((await manager.disconnect(c)).operation.state, 'stopped'); await clock.advance(10000); assert.equal(a.counts().runs, 1);
});
