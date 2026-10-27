import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ownerScopeFor } from '../lib/owner-intent.ts';
import { compositionPayloadFingerprint, suggestComposition } from '../lib/work-composition.ts';
import { createWorkJob } from '../lib/workflow.ts';
import { EVE_PENDING_RECOVERY_PREFIX, readEvePendingRecovery, prepareEvePendingRecovery, loadEvePendingRecovery, saveEvePendingRecovery as saveRecovery, clearEvePendingRecovery as clearRecovery, evePendingRecoveryConfirms } from '../lib/eve-pending-recovery.ts';
// Older supported Node hosts use a test-only Web Locks model. Node 26 uses
// its actual LockManager; this does not polyfill production browser support.
function testLockManager() {
  const tails = new Map(), waiting = new Set(), held = new Set();
  return {
    request(name, options, callback) {
      if (typeof options === 'function') { callback = options; options = { mode: 'exclusive' }; }
      const lock = { name, mode: options.mode }, previous = tails.get(name) ?? Promise.resolve();
      let release; const next = new Promise(resolve => { release = resolve; });
      tails.set(name, next); waiting.add(lock);
      return (async () => {
        await previous; waiting.delete(lock); held.add(lock);
        try { return await callback(lock); }
        finally { held.delete(lock); release(); if (tails.get(name) === next) tails.delete(name); }
      })();
    },
    async query() { return { held: [...held], pending: [...waiting] }; },
  };
}
const recoveryTestLocks = globalThis.navigator?.locks ?? testLockManager();
const saveEvePendingRecovery = (record, storage, locks = recoveryTestLocks) => saveRecovery(record, storage, locks);
const clearEvePendingRecovery = (record, storage, locks = recoveryTestLocks) => clearRecovery(record, storage, locks);
function store() { const data = new Map(); return { data, getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) }; }
async function fixture() {
  const owner = await ownerScopeFor('synthetic-A'), payload = { action: 'create', jobId: randomUUID(), plan: { ...suggestComposition('synthetic objective', 'text'), acceptance: 'synthetic accepted' } };
  const fingerprint = await compositionPayloadFingerprint(payload);
  return { owner, payload, record: await prepareEvePendingRecovery(owner, payload, fingerprint) };
}
void test('passive metadata contains no original material, objective, consent, quote or credential', async () => {
  const f = await fixture(), s = store(); await saveEvePendingRecovery(f.record, s);
  assert.deepEqual(loadEvePendingRecovery(f.owner, s), f.record);
  assert.deepEqual(Object.keys(f.record).sort(), ['fingerprint','jobId','kind','operationId','owner','revision','version']);
  assert.doesNotMatch([...s.data.values()].join(''), /synthetic objective|plan|source|consent|credential|quote|authorization/i);
  assert.equal(loadEvePendingRecovery(await ownerScopeFor('synthetic-B'), s), null);
});
void test('closed metadata rejects malformed IDs, owner mismatch, revision, unsupported kind and extra fields', async () => {
  const f = await fixture();
  for (const delta of [{ owner: await ownerScopeFor('B') }, { jobId: 'a'.repeat(36) }, { operationId: '../id' }, { revision: -1 }, { revision: 1 }, { kind: 'send' }, { fingerprint: 'X'.repeat(64) }, { source: 'private' }])
    assert.throws(() => readEvePendingRecovery({ ...f.record, ...delta }, f.owner));
  assert.throws(() => readEvePendingRecovery(f.record, 'invalid-owner'));
});
void test('invalid, oversized and unreadable storage remains blocked without erasing unknown metadata', async () => {
  const f = await fixture(), s = store(), key = EVE_PENDING_RECOVERY_PREFIX + f.owner;
  for (const raw of ['', '{', 'x'.repeat(1025)]) { s.data.set(key, raw); assert.throws(() => loadEvePendingRecovery(f.owner, s)); assert.equal(s.data.get(key), raw); }
  await assert.rejects(() => saveEvePendingRecovery(f.record, { ...s, getItem() { throw new Error('denied'); } }));
});
void test('another unresolved target cannot be overwritten or cleared by a stale operation', async () => {
  const f = await fixture(), other = await fixture(), s = store(); await saveEvePendingRecovery(f.record, s);
  await assert.rejects(() => saveEvePendingRecovery(other.record, s));
  await assert.rejects(() => clearEvePendingRecovery(other.record, s));
  assert.deepEqual(loadEvePendingRecovery(f.owner, s), f.record);
  await clearEvePendingRecovery(f.record, s); assert.equal(loadEvePendingRecovery(f.owner, s), null);
});
void test('write failure or failed read-after-write never reports durable preparation', async () => {
  const f = await fixture(), s = store();
  await assert.rejects(() => saveEvePendingRecovery(f.record, { ...s, setItem() { throw new Error('quota'); } }));
  await assert.rejects(() => saveEvePendingRecovery(f.record, { ...s, setItem() {} }));
});
void test('readback matches current authenticated owner, target and creation fingerprint, not metadata authority', async () => {
  const f = await fixture(), job = createWorkJob({ id: f.payload.jobId, title: 'synthetic', templateId: 'composition', plan: f.payload.plan });
  job.composition.creationFingerprint = f.record.fingerprint;
  assert.equal(await evePendingRecoveryConfirms(f.record, job, f.owner), true);
  assert.equal(await evePendingRecoveryConfirms({ ...f.record, fingerprint: '0'.repeat(64) }, job, f.owner), false);
  assert.equal(await evePendingRecoveryConfirms({ ...f.record, jobId: randomUUID(), operationId: randomUUID(), kind: 'composition' }, job, f.owner), false);
  await assert.rejects(evePendingRecoveryConfirms(f.record, job, await ownerScopeFor('B')));
});
void test('storage removal failure keeps confirmation unresolved', async () => {
  const f = await fixture(), s = store(); await saveEvePendingRecovery(f.record, s);
  await assert.rejects(() => clearEvePendingRecovery(f.record, { ...s, removeItem() {} }));
  assert.deepEqual(loadEvePendingRecovery(f.owner, s), f.record);
});

void test('serialized storage interleaving cannot acknowledge two different unresolved targets', async () => {
  const first = await fixture(), second = await fixture(), s = store();
  const write = s.setItem;
  let interleave = true, secondOutcome = Promise.resolve('not-started');
  s.setItem = (key, value) => {
    if (interleave && key.startsWith(EVE_PENDING_RECOVERY_PREFIX)) {
      interleave = false;
      try {
        secondOutcome = Promise.resolve(saveEvePendingRecovery(second.record, s))
          .then(() => 'fulfilled', () => 'rejected');
      } catch { secondOutcome = Promise.resolve('rejected'); }
    }
    write(key, value);
  };
  await saveEvePendingRecovery(first.record, s);
  assert.equal(await secondOutcome, 'rejected');
  assert.deepEqual(loadEvePendingRecovery(first.owner, s), first.record);
});

void test('missing, denied or nonfunctional exclusive locking refuses storage mutations', async () => {
  const f = await fixture(), s = store();
  const unsupported = [
    { request: undefined },
    { request: async () => { throw new Error('lock denied'); } },
    { request: async () => {} },
    { request: async (_name, _options, callback) => callback(null) },
    { request: async (_name, _options, callback) => callback({ name: 'wrong-owner-lock', mode: 'exclusive' }) },
  ];
  for (const locks of unsupported) {
    await assert.rejects(saveEvePendingRecovery(f.record, s, locks));
    assert.equal(s.data.size, 0);
  }
  await saveEvePendingRecovery(f.record, s);
  for (const locks of unsupported) {
    await assert.rejects(clearEvePendingRecovery(f.record, s, locks));
    assert.deepEqual(loadEvePendingRecovery(f.owner, s), f.record);
  }
});

void test('queued save snapshots lookup metadata before callers can mutate it', async () => {
  const f = await fixture(), s = store(), original = { ...f.record };
  let enter, release;
  const entered = new Promise(resolve => { enter = resolve; });
  const barrier = new Promise(resolve => { release = resolve; });
  const held = recoveryTestLocks.request(EVE_PENDING_RECOVERY_PREFIX + f.owner, async () => { enter(); await barrier; });
  await entered;
  const pending = saveEvePendingRecovery(f.record, s);
  f.record.owner = await ownerScopeFor('synthetic-B');
  f.record.jobId = randomUUID(); f.record.operationId = f.record.jobId;
  release(); await held; await pending;
  assert.deepEqual(loadEvePendingRecovery(f.owner, s), original);
  assert.equal(loadEvePendingRecovery(f.record.owner, s), null);
});
