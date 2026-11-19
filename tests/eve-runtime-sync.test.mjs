import test from 'node:test';
import assert from 'node:assert/strict';
import { runtimeFixture } from './helpers/eve-runtime-fixture.mjs';
import { eveRuntimeSyncStore } from '../lib/eve-runtime-sync.ts';
import { beginLinuxRun, finishLinuxRun } from '../lib/sky-linux-local.ts';

void test('negotiated runtime advertises only pinned model/agent capability, with owner isolation', async (t) => {
  const f = runtimeFixture(t),
    p = await f.announce();
  assert.equal((await f.store().devices())[0].deviceId, f.device);
  assert.equal((await f.store('bob').devices()).length, 0);
  await assert.rejects(
    f.store('bob').presence(p, f.device),
    (e) => e.status === 401,
  );
  await assert.rejects(
    f
      .store()
      .presence(
        { ...p, executor: { ...p.executor, protocols: [999] } },
        f.device,
      ),
  );
  await assert.rejects(
    f
      .store()
      .presence(
        { ...p, agents: [{ ...p.agents[0], sha256: 'ef'.repeat(32) }] },
        f.device,
      ),
  );
  await assert.rejects(
    f
      .store()
      .presence(
        { ...p, host: { ...p.host, expiresAt: Date.now() - 1 } },
        f.device,
      ),
  );
  assert.equal((await f.legacy().devices()).length, 0);
});
void test('approval pins executor and digest scheme; exact retry creates one command', async (t) => {
  const f = runtimeFixture(t),
    { request, entry } = await f.enqueue();
  await f.store().enqueue(request);
  assert.equal((await f.store().commands(f.device)).length, 1);
  assert.equal(entry.command.request.model.scheme, 'ollama-manifest-sha256');
  assert.equal((await f.legacy().pending(f.device)).length, 0);
  await assert.rejects(
    f.store().enqueue({ ...request, input: '変更' }),
    (e) => e.status === 409,
  );
  await assert.rejects(
    f.store().enqueue({
      ...request,
      id: crypto.randomUUID(),
      modelScheme: 'gguf-sha256',
    }),
    (e) => e.status === 409,
  );
  await assert.rejects(
    f.store().enqueue({
      ...request,
      id: crypto.randomUUID(),
      confirm: 'run-on-pixel',
    }),
  );
  await assert.rejects(
    f.store('bob').enqueue({ ...request, id: crypto.randomUUID() }),
  );
});
void test('concurrent claims fence the same approved command; no timeout takeover', async (t) => {
  const f = runtimeFixture(t),
    { entry } = await f.enqueue(),
    c = entry.command;
  const a = {
      id: c.request.id,
      claimId: crypto.randomUUID(),
      requestSha256: c.requestSha256,
    },
    b = { ...a, claimId: crypto.randomUUID() };
  const results = await Promise.allSettled([
    f.store().claim(f.device, a),
    f.store().claim(f.device, b),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  const winner = results[0].status === 'fulfilled' ? a : b;
  assert.equal(
    (await f.store().claim(f.device, winner)).claimId,
    winner.claimId,
  );
  f.sql.prepare('UPDATE eve_device_commands SET expires_at=0').run();
  await assert.rejects(
    f.store().claim(f.device, { ...a, claimId: crypto.randomUUID() }),
  );
  await assert.rejects(
    f.store().authorize(f.device, c.request.id, winner.claimId),
  );
  assert.equal(
    (await f.store().commands(f.device))[0].state,
    'runtime-claimed:' + winner.claimId,
  );
});
void test('runtime publication uses the existing encrypted replica and same Eve messages exactly once', async (t) => {
  const f = runtimeFixture(t),
    { entry } = await f.enqueue(),
    report = await f.report(entry),
    value = { report, revision: 0 };
  const result = await f.store().publish(f.device, value);
  assert.deepEqual(
    await f.store().read(report.id),
    (await f.store().list())[0],
  );
  assert.equal((await f.store().read(report.id)).usage.cloudUsageMinor, 0);
  assert.equal(
    (await f.store().read(report.id)).input,
    entry.command.displayInput,
  );
  assert.deepEqual(await f.store().publish(f.device, value), result);
  assert.equal((await f.store().list())[0].report.text, report.text);
  assert.equal(
    (await f.history().get(entry.command.request.threadId)).session.messages
      .length,
    2,
  );
  assert.equal((await f.legacy().list()).length, 0);
  assert.equal((await f.store('bob').list()).length, 0);
  await assert.rejects(
    f.store().read(report.id, f.addDevice()),
    (e) => e.status === 404,
  );
  assert.doesNotMatch(
    JSON.stringify(f.sql.prepare('SELECT * FROM eve_device_jobs').all()),
    /合成|ひとつ|保存結果/,
  );
  await f.store().acknowledge(f.device, report.id, report.claimId);
  assert.equal((await f.store().commands(f.device)).length, 0);
});
void test('owner queue reports receipt separately from completion and disappears only after saved acknowledgement', async (t) => {
  const f = runtimeFixture(t),
    { entry } = await f.enqueue();
  let queue = await f.store().pendingOwner();
  assert.equal(queue.length, 1);
  assert.equal(queue[0].state, 'pending');
  assert.equal(queue[0].id, entry.command.request.id);
  assert.equal(queue[0].input, entry.command.displayInput);
  assert.deepEqual(await f.store('bob').pendingOwner(), []);
  const report = await f.report(entry);
  queue = await f.store().pendingOwner();
  assert.equal(queue[0].state, 'received');
  assert.equal((await f.store().list()).length, 0);
  await f.store().publish(f.device, { report, revision: 0 });
  assert.equal((await f.store().pendingOwner()).length, 1);
  await f.store().acknowledge(f.device, report.id, report.claimId);
  assert.deepEqual(await f.store().pendingOwner(), []);
});
void test('a bound device cannot replace a saved output or forge a model, request hash, claim or price', async (t) => {
  const f = runtimeFixture(t),
    { entry } = await f.enqueue(),
    report = await f.report(entry);
  await f.store().publish(f.device, { report, revision: 0 });
  for (const patch of [
    { text: '改ざん' },
    { model: { ...report.model, scheme: 'gguf-sha256' } },
    { requestSha256: '01'.repeat(32) },
    { claimId: crypto.randomUUID() },
    { state: 'completed' },
    { price: 5 },
  ])
    await assert.rejects(
      f
        .store()
        .publish(f.device, { report: { ...report, ...patch }, revision: 1 }),
    );
  const other = f.addDevice();
  await assert.rejects(f.store().publish(other, { report, revision: 1 }));
  assert.equal((await f.store().list())[0].usage.cloudUsageMinor, 0);
});
void test('UNKNOWN is saved without text, never changes to completed and never requeues inference', async (t) => {
  const f = runtimeFixture(t),
    { entry } = await f.enqueue();
  const report = await f.report(entry, {
    state: 'unknown',
    text: null,
    outputSha256: null,
    durationMs: null,
    errorCode: 'EXECUTION_DEADLINE',
  });
  await f.store().publish(f.device, { report, revision: 0 });
  await f.store().acknowledge(f.device, report.id, report.claimId);
  assert.equal((await f.store().commands(f.device)).length, 0);
  assert.equal(
    (await f.history().get(entry.command.request.threadId)).session.messages
      .length,
    1,
  );
  assert.equal((await f.store().list())[0].report.state, 'unknown');
});
void test('revocation, expired presence and deleted threads fence new claims and late publication', async (t) => {
  const f = runtimeFixture(t),
    { entry } = await f.enqueue(),
    report = await f.report(entry);
  await f.store().publish(f.device, { report, revision: 0 });
  const thread = await f.history().get(entry.command.request.threadId);
  await f.history().remove(thread.session.id, thread.revision);
  await assert.rejects(
    f.store().publish(f.device, { report, revision: 0 }),
    (e) => e.status === 410 || e.status === 404,
  );
  assert.equal((await f.store().list()).length, 0);
  f.sql.prepare('UPDATE rockstar_device_sessions SET revoked_at=1').run();
  await assert.rejects(f.store().commands(f.device), (e) => e.status === 401);
  await assert.rejects(
    f.store().publish(f.device, { report, revision: 0 }),
    (e) => e.status === 401,
  );
});
void test('new and legacy jobs retain their own IDs, model identity and original history', async (t) => {
  const f = runtimeFixture(t),
    legacyDevice = f.addDevice(),
    agent = {
      id: crypto.randomUUID(),
      name: '従来の担当',
      instructions: '短く',
      modelId: 'gguf',
      sha256: 'ab'.repeat(32),
    };
  const old = finishLinuxRun(
    beginLinuxRun(agent, '従来の入力', crypto.randomUUID(), '12'.repeat(32)),
    { text: '従来の成果', modelSha256: '12'.repeat(32), durationMs: 1 },
  );
  await f
    .legacy()
    .publish({ run: old, threadId: old.job.id, revision: 0 }, legacyDevice);
  const { entry } = await f.enqueue({ threadId: old.job.id }),
    report = await f.report(entry);
  await f.store().publish(f.device, { report, revision: 0 });
  assert.deepEqual((await f.legacy().list())[0].run, old);
  assert.equal((await f.legacy().list()).length, 1);
  assert.equal((await f.store().list()).length, 1);
  const messages = (await f.history().get(old.job.id)).session.messages;
  assert.equal(messages.length, 4);
  assert.equal(messages[0].text, old.input);
  assert.equal(messages[2].text, '[合成試験] ひとつの下書き');
  assert.match(entry.command.request.input, /従来の成果/);
});

void test('publication repairs the same replica if the history append response fails after commit', async (t) => {
  const f = runtimeFixture(t),
    { entry } = await f.enqueue(),
    report = await f.report(entry);
  let fail = true;
  const db = {
    ...f.db,
    batch: async (values) => {
      if (fail) {
        fail = false;
        throw Error('SIMULATED_HISTORY_UNAVAILABLE');
      }
      return f.db.batch(values);
    },
  };
  const store = eveRuntimeSyncStore(db, 'alice', f.keys);
  await assert.rejects(
    store.publish(f.device, { report, revision: 0 }),
    /SIMULATED_HISTORY_UNAVAILABLE/,
  );
  assert.equal(
    f.sql.prepare('SELECT COUNT(*) AS n FROM eve_device_jobs').get().n,
    1,
  );
  await store.publish(f.device, { report, revision: 0 });
  assert.equal(
    (await f.history().get(entry.command.request.threadId)).session.messages
      .length,
    2,
  );
  assert.equal(
    f.sql.prepare('SELECT COUNT(*) AS n FROM eve_device_jobs').get().n,
    1,
  );
});
