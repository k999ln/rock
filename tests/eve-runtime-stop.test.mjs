import test from 'node:test';
import assert from 'node:assert/strict';
import { runtimeFixture } from './helpers/eve-runtime-fixture.mjs';
import { eveRuntimeSyncStore } from '../lib/eve-runtime-sync.ts';
import { describeAdapter } from '../lib/rockstar-adapters.ts';
const stop = (f, id) =>
  f.store().requestStop({ id, confirm: 'stop-owner-local-text' });
async function supported(f) {
  await f.announce({
    executor: describeAdapter('test-executor', 'executor', 'macos', {
      'text.generate': true,
      'model.pin': true,
      'execution.stop': true,
    }),
  });
}
const receipt = (r, state) => ({
  id: r.id,
  claimId: r.claimId,
  requestSha256: r.requestSha256,
  state,
});
function interleave(f, pattern, before) {
  let used = false;
  const wrap = (q, stmt) => ({
    bind(...args) {
      return wrap(q, stmt.bind(...args));
    },
    first: () => stmt.first(),
    all: () => stmt.all(),
    async run() {
      if (!used && pattern.test(q)) {
        used = true;
        await before();
      }
      return stmt.run();
    },
  });
  return eveRuntimeSyncStore(
    { prepare: (q) => wrap(q, f.db.prepare(q)), batch: f.db.batch },
    'alice',
    f.keys,
  );
}

void test('preclaim cancellation is durable, idempotent, owner scoped, and creates no worker report', async (t) => {
  const f = runtimeFixture(t),
    { entry } = await f.enqueue(),
    id = entry.command.request.id;
  await assert.rejects(
    f.store('bob').requestStop({ id, confirm: 'stop-owner-local-text' }),
    (e) => e.status === 404,
  );
  await assert.rejects(f.store().requestStop({ id, confirm: 'yes' }));
  await assert.rejects(
    f.store().requestStop({
      id,
      confirm: 'stop-owner-local-text',
      claimId: crypto.randomUUID(),
    }),
  );
  const r = await stop(f, id);
  assert.equal(r.state, 'cancelled-before-start');
  assert.equal(r.stopConfirmed, true);
  assert.deepEqual(await stop(f, id), r);
  assert.deepEqual(await f.store().commands(f.device), []);
  assert.equal((await f.store().pendingOwner())[0].canStop, false);
  assert.equal(
    (await f.history().get(entry.command.request.threadId)).session.messages
      .length,
    1,
  );
  assert.deepEqual(await f.store().list(), []);
  await assert.rejects(f.report(entry), (e) => e.status === 409);
  assert.equal(
    (await eveRuntimeSyncStore(f.db, 'alice', f.keys).pendingOwner())[0].state,
    'cancelled-before-start',
  );
});
void test('active stop requires explicit capability and denies subsequent authorization; request alone is not confirmation', async (t) => {
  const f = runtimeFixture(t),
    { entry } = await f.enqueue(),
    r = await f.report(entry);
  await assert.rejects(
    stop(f, r.id),
    (e) => e.message === 'RUNTIME_STOP_UNAVAILABLE',
  );
  await supported(f);
  const s = await stop(f, r.id);
  assert.equal(s.state, 'stop-requested');
  assert.equal(s.stopConfirmed, false);
  await assert.rejects(
    f.store().authorize(f.device, r.id, r.claimId),
    (e) => e.status === 409,
  );
  assert.equal(
    (await f.store().commands(f.device))[0].state,
    'runtime-stop:' + r.claimId,
  );
  assert.equal((await f.store().pendingOwner())[0].state, 'stop-requested');
  await assert.rejects(
    f.store().publish(f.device, { report: r, revision: 0 }),
    (e) => e.status === 409,
  );
});
void test('receipt binds device/job/claim/hash, keeps unknown, and cannot overwrite actual confirmation', async (t) => {
  const f = runtimeFixture(t);
  await supported(f);
  const { entry } = await f.enqueue(),
    r = await f.report(entry);
  await assert.rejects(
    f.store().stopReceipt(f.device, receipt(r, 'confirmed')),
    (e) => e.status === 409,
  );
  await stop(f, r.id);
  for (const bad of [
    { claimId: crypto.randomUUID() },
    { requestSha256: 'ef'.repeat(32) },
    { state: 'completed' },
  ])
    await assert.rejects(
      f.store().stopReceipt(f.device, { ...receipt(r, 'confirmed'), ...bad }),
      (e) => e.status === 409,
    );
  await assert.rejects(
    f.store().stopReceipt(f.addDevice(), receipt(r, 'confirmed')),
    (e) => e.status === 404,
  );
  await f.store().stopReceipt(f.device, receipt(r, 'pending'));
  assert.equal((await f.store().pendingOwner())[0].state, 'stop-requested');
  await f.store().stopReceipt(f.device, receipt(r, 'unknown'));
  assert.equal((await stop(f, r.id)).stopConfirmed, false);
  assert.equal((await f.store().commands(f.device)).length, 1);
  await f.store().stopReceipt(f.device, receipt(r, 'confirmed'));
  await f.store().stopReceipt(f.device, receipt(r, 'confirmed'));
  assert.deepEqual(await f.store().commands(f.device), []);
  assert.equal((await stop(f, r.id)).stopConfirmed, true);
  await assert.rejects(
    f.store().stopReceipt(f.device, receipt(r, 'unknown')),
    (e) => e.status === 409,
  );
  assert.deepEqual(await f.store().list(), []);
});
void test('a finished output which was saved first is retained byte for byte', async (t) => {
  const f = runtimeFixture(t);
  await supported(f);
  const { entry } = await f.enqueue(),
    r = await f.report(entry);
  await f.store().publish(f.device, { report: r, revision: 0 });
  const before = await f.store().read(r.id);
  assert.equal((await stop(f, r.id)).state, 'result-retained');
  assert.deepEqual(await f.store().read(r.id), before);
  await f.store().acknowledge(f.device, r.id, r.claimId);
  assert.equal((await stop(f, r.id)).state, 'result-retained');
});
void test('finished receipt permits only the same claimed result, preserving actual output after a stop race', async (t) => {
  const f = runtimeFixture(t);
  await supported(f);
  const { entry } = await f.enqueue(),
    r = await f.report(entry);
  await stop(f, r.id);
  await f.store().stopReceipt(f.device, receipt(r, 'finished'));
  assert.equal((await f.store().pendingOwner())[0].state, 'stop-finished');
  await assert.rejects(
    f.store().authorize(f.device, r.id, r.claimId),
    (e) => e.status === 409,
  );
  await f.store().publish(f.device, { report: r, revision: 0 });
  assert.equal((await f.store().read(r.id)).report.text, r.text);
});
for (const priorUnknown of [false, true])
  void test(`stop wins inside ${priorUnknown ? 'UPDATE' : 'INSERT'} report SQL window`, async (t) => {
    const f = runtimeFixture(t);
    await supported(f);
    const { entry } = await f.enqueue(),
      r = await f.report(entry);
    if (priorUnknown)
      await f.store().publish(f.device, {
        report: {
          ...r,
          state: 'unknown',
          text: null,
          outputSha256: null,
          durationMs: null,
          errorCode: 'OUTCOME_UNKNOWN',
        },
        revision: 0,
      });
    const store = interleave(f, /^(INSERT INTO|UPDATE) eve_device_jobs/, () =>
      stop(f, r.id),
    );
    await assert.rejects(
      store.publish(f.device, { report: r, revision: priorUnknown ? 1 : 0 }),
      (e) => e.status === 409,
    );
    if (priorUnknown)
      assert.equal((await f.store().read(r.id)).report.state, 'unknown');
    else assert.deepEqual(await f.store().list(), []);
    assert.equal((await f.store().pendingOwner())[0].state, 'stop-requested');
    assert.equal(
      (await f.history().get(entry.command.request.threadId)).session.messages
        .length,
      1,
    );
  });
void test('report wins inside owner stop CAS window; owner retries observation and retains output', async (t) => {
  const f = runtimeFixture(t);
  await supported(f);
  const { entry } = await f.enqueue(),
    r = await f.report(entry);
  const store = interleave(f, /^UPDATE eve_device_commands SET state=/, () =>
    f.store().publish(f.device, { report: r, revision: 0 }),
  );
  const result = await store.requestStop({
    id: r.id,
    confirm: 'stop-owner-local-text',
  });
  assert.equal(result.state, 'result-retained');
  assert.equal((await f.store().read(r.id)).report.text, r.text);
});
void test('revoked device and deleted thread fence stop receipts and report writes', async (t) => {
  const f = runtimeFixture(t);
  await supported(f);
  const { entry } = await f.enqueue(),
    r = await f.report(entry);
  await stop(f, r.id);
  f.sql.prepare('UPDATE rockstar_device_sessions SET revoked_at=1').run();
  await assert.rejects(
    f.store().stopReceipt(f.device, receipt(r, 'confirmed')),
    (e) => e.status === 401,
  );
  f.sql.prepare('UPDATE rockstar_device_sessions SET revoked_at=NULL').run();
  const h = await f.history().get(entry.command.request.threadId);
  await f.history().remove(h.session.id, h.revision);
  await assert.rejects(
    f.store().stopReceipt(f.device, receipt(r, 'confirmed')),
    (e) => e.status === 404,
  );
});

void test('an acknowledged UNKNOWN stays stoppable without replacing its report or repeating inference', async (t) => {
  const f = runtimeFixture(t);
  await supported(f);
  const { entry } = await f.enqueue(),
    r = await f.report(entry);
  const unknown = {
    ...r,
    state: 'unknown',
    text: null,
    outputSha256: null,
    durationMs: null,
    errorCode: 'OUTCOME_UNKNOWN',
  };
  await f.store().publish(f.device, { report: unknown, revision: 0 });
  await f.store().acknowledge(f.device, r.id, r.claimId);
  assert.equal((await f.store().pendingOwner())[0].canStop, true);
  const before = await f.store().read(r.id);
  assert.equal((await stop(f, r.id)).state, 'stop-requested');
  await f.store().stopReceipt(f.device, receipt(r, 'confirmed'));
  assert.deepEqual(await f.store().read(r.id), before);
});
