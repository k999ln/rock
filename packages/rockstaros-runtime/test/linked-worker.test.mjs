import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runtimeFixture } from '../../../tests/helpers/eve-runtime-fixture.mjs';
import { createLinkedTextWorker } from '../src/linked-worker.mjs';
import { RuntimeError } from '../src/index.mjs';
import { openNodeExecutorJournal } from '../src/node-host.mjs';

async function setup(t, faults = {}) {
  const f = runtimeFixture(t),
    p = await f.announce(),
    { entry } = await f.enqueue();
  const store = f.store(),
    counters = { generated: 0, claimed: 0 };
  const lose = (key, result) => {
    if (!faults[key]) return result;
    faults[key] = false;
    throw new RuntimeError('SIMULATED_RESPONSE_LOSS', 0, 'unknown');
  };
  const runtime = {
    executions: {
      inspect: async () => ({
        ownerUserId: 'alice',
        deviceId: f.device,
        commands: await store.commands(f.device),
      }),
      read: async (id) => ({ execution: await store.read(id, f.device) }),
      claim: async (value) => {
        counters.claimed++;
        return lose('claim', await store.claim(f.device, value));
      },
      authorize: (id, claimId) => store.authorize(f.device, id, claimId),
      publish: async (value) =>
        lose('publish', await store.publish(f.device, value)),
      acknowledge: async (id, claimId) =>
        lose('ack', await store.acknowledge(f.device, id, claimId)),
    },
  };
  const directory = await mkdtemp(join(tmpdir(), 'rock-linked-worker-'));
  const journal = await openNodeExecutorJournal(directory, {
    owner: 'alice',
    deviceId: f.device,
  });
  t.after(async () => {
    await journal.close();
    await rm(directory, { recursive: true, force: true });
  });
  const driver = {
    describe: async () => p.executor,
    generate: async (request) => {
      counters.generated++;
      if (faults.onGenerate) await faults.onGenerate(f);
      if (faults.generate) throw Error('SIMULATED_ENGINE_FAILURE');
      return {
        text: '共通本体が作った合成下書き',
        model: request.model,
        durationMs: 1,
      };
    },
  };
  const worker = () =>
    createLinkedTextWorker({
      runtime,
      owner: 'alice',
      deviceId: f.device,
      journal,
      driver,
      host: async () => p.host,
      output: { describe: async () => p.output },
    });
  return {
    ...f,
    p,
    entry,
    counters,
    runtime,
    directory,
    journal,
    driver,
    worker,
  };
}

void test('same service command uses the shared executor and existing Eve history exactly once', async (t) => {
  const f = await setup(t),
    result = await f.worker().run(f.entry);
  assert.equal(result.state, 'reported');
  assert.equal(result.execution.report.state, 'review');
  assert.equal(result.execution.id, f.entry.command.request.id);
  assert.equal(f.counters.generated, 1);
  assert.equal(
    (await f.history().get(result.execution.threadId)).session.messages.length,
    2,
  );
  assert.equal((await f.worker().run(f.entry)).state, 'reported');
  assert.equal(f.counters.generated, 1);
});
void test('concurrent callbacks on one worker share the same computation and claim', async (t) => {
  const f = await setup(t),
    worker = f.worker();
  const values = await Promise.all([worker.run(f.entry), worker.run(f.entry)]);
  assert.equal(values[0].state, 'reported');
  assert.equal(values[1].state, 'reported');
  assert.equal(f.counters.generated, 1);
  assert.equal(f.counters.claimed, 1);
});
void test('lost server-claim response never calls the model, even after a new controller', async (t) => {
  const f = await setup(t, { claim: true });
  assert.equal((await f.worker().run(f.entry)).state, 'unknown');
  assert.equal(
    (await f.worker().run(f.entry)).errorCode,
    'CLAIM_WITHOUT_LOCAL_RECORD',
  );
  assert.equal(f.counters.generated, 0);
  assert.equal(f.counters.claimed, 1);
});
void test('lost publication response reconciles the same persisted result without another inference', async (t) => {
  const f = await setup(t, { publish: true });
  assert.equal((await f.worker().run(f.entry)).state, 'report_unknown');
  const next = await f.worker().run(f.entry);
  assert.equal(next.state, 'reported');
  assert.equal(f.counters.generated, 1);
  assert.equal(
    (await f.history().get(next.execution.threadId)).session.messages.length,
    2,
  );
});
void test('lost acknowledgement is read back with the same job and never submitted again', async (t) => {
  const f = await setup(t, { ack: true });
  assert.equal((await f.worker().run(f.entry)).state, 'ack_unknown');
  assert.equal((await f.worker().run(f.entry)).state, 'reported');
  assert.equal(f.counters.generated, 1);
});
void test('uncertain engine failure becomes UNKNOWN, not a retry or external success', async (t) => {
  const f = await setup(t, { generate: true }),
    result = await f.worker().run(f.entry);
  assert.equal(result.execution.report.state, 'unknown');
  assert.equal(result.execution.report.text, null);
  assert.equal(result.execution.externalToolSuccess, false);
  await f.worker().run(f.entry);
  assert.equal(f.counters.generated, 1);
});
void test('revocation during inference fences report publication and keeps the local unknown record', async (t) => {
  const f = await setup(t, {
    onGenerate: (x) =>
      x.sql.prepare('UPDATE rockstar_device_sessions SET revoked_at=1').run(),
  });
  await assert.rejects(f.worker().run(f.entry), (e) => e.status === 401);
  assert.equal(
    (await f.journal.get(f.entry.command.request.id)).state,
    'unknown',
  );
  assert.equal((await f.store().list()).length, 0);
  assert.equal(f.counters.generated, 1);
});
void test('driver identity or unsupported model fails before the server claim and before prompt execution', async (t) => {
  const f = await setup(t);
  f.driver.describe = async () => ({
    ...f.p.executor,
    id: 'different-executor',
  });
  await assert.rejects(
    f.worker().run(f.entry),
    /COMMAND_EXECUTOR_BINDING_MISMATCH/,
  );
  assert.equal(f.counters.generated, 0);
  assert.equal(f.counters.claimed, 0);
});
void test('foreign service owner and changed request cannot use this host binding', async (t) => {
  const f = await setup(t);
  await assert.rejects(
    f
      .worker()
      .run({ ...f.entry, command: { ...f.entry.command, owner: 'bob' } }),
  );
  await assert.rejects(
    f.worker().run({
      ...f.entry,
      command: {
        ...f.entry.command,
        request: { ...f.entry.command.request, input: 'changed' },
      },
    }),
  );
  assert.equal(f.counters.generated, 0);
  assert.equal(f.counters.claimed, 0);
});
void test('account journal cannot silently adopt a different device or a prior private UID journal', async (t) => {
  const f = await setup(t);
  await f.journal.close();
  await assert.rejects(
    openNodeExecutorJournal(f.directory, {
      owner: 'alice',
      deviceId: crypto.randomUUID(),
    }),
    /JOURNAL_DEVICE_BINDING_MISMATCH/,
  );
  await assert.rejects(
    openNodeExecutorJournal(f.directory),
    /JOURNAL_DEVICE_BINDING_MISMATCH/,
  );
});

void test('reopening the durable journal after a lost publication repairs the same service job', async (t) => {
  const f = await setup(t, { publish: true });
  assert.equal((await f.worker().run(f.entry)).state, 'report_unknown');
  await f.journal.close();
  const reopened = await openNodeExecutorJournal(f.directory, {
    owner: 'alice',
    deviceId: f.device,
  });
  try {
    const worker = createLinkedTextWorker({
      runtime: f.runtime,
      owner: 'alice',
      deviceId: f.device,
      journal: reopened,
      driver: f.driver,
      host: async () => f.p.host,
      output: { describe: async () => f.p.output },
    });
    assert.equal((await worker.run(f.entry)).state, 'reported');
    assert.equal(f.counters.generated, 1);
  } finally {
    await reopened.close();
  }
});
void test('unsupported installed model fails before a claim or a prompt is sent', async (t) => {
  const f = await setup(t);
  f.driver.describe = async () => {
    throw Error('REMOTE_MODEL_NOT_ALLOWED');
  };
  await assert.rejects(f.worker().run(f.entry), /REMOTE_MODEL_NOT_ALLOWED/);
  assert.equal(f.counters.claimed, 0);
  assert.equal(f.counters.generated, 0);
});
