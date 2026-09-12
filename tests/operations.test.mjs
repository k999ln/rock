import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { operations, OperationError } from '../lib/operations.ts';

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  for (const name of readdirSync(new URL('../drizzle', import.meta.url))
    .filter((n) => n.endsWith('.sql'))
    .sort())
    sqlite.exec(
      readFileSync(new URL('../drizzle/' + name, import.meta.url), 'utf8'),
    );
  let now = Date.parse('2026-09-05T12:00:00Z');
  const db = {
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      let args = [];
      return {
        bind(...values) {
          args = values;
          return this;
        },
        async first() {
          return statement.get(...args) || null;
        },
        async all() {
          return { success: true, results: statement.all(...args) };
        },
        async run() {
          const meta = statement.run(...args);
          return { success: true, results: [], meta };
        },
      };
    },
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const s of statements) results.push(await s.all());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
  return {
    sqlite,
    db,
    a: operations(db, 'a', () => now),
    b: operations(db, 'b', () => now),
    advance: (ms) => {
      now += ms;
    },
  };
}
const job = (changes = {}) => ({
  id: crypto.randomUUID(),
  tool: 'mr-citations',
  transport: 'browser',
  sample: false,
  inputBytes: 100,
  ...changes,
});
const finish = {
  action: 'finish',
  status: 'completed',
  durationMs: 30,
  outputBytes: 150,
};
const rejects = (f, code) =>
  assert.rejects(f, (e) => e instanceof OperationError && e.status === code);

await test('job lifecycle records completion and history exactly once; terminal state is immutable', async () => {
  const { a, sqlite } = fixture(),
    input = job();
  assert.equal((await a.createJob(input)).status, 'queued');
  assert.equal((await a.createJob(input)).id, input.id);
  await a.changeJob(input.id, { action: 'start' });
  await rejects(() => a.changeJob(input.id, { action: 'start' }), 409);
  await a.changeJob(input.id, finish);
  await a.changeJob(input.id, finish);
  await rejects(
    () => a.changeJob(input.id, { ...finish, status: 'failed' }),
    409,
  );
  assert.equal(
    sqlite.prepare('SELECT COUNT(*) AS n FROM tool_runs').get().n,
    1,
  );
  assert.deepEqual(
    sqlite
      .prepare('SELECT status FROM job_events ORDER BY id')
      .all()
      .map((r) => r.status),
    ['queued', 'running', 'completed'],
  );
  assert.equal((await a.overview()).usage.processedBytes, 250);
});
await test('ownership is checked for every job, device, control and book operation', async () => {
  const { a, b } = fixture(),
    input = job(),
    device = crypto.randomUUID(),
    entry = crypto.randomUUID();
  await a.createJob(input);
  assert.equal(await b.getJob(input.id), null);
  await rejects(() => b.changeJob(input.id, { action: 'start' }), 404);
  await a.device({ id: device, name: 'PC', action: 'connect' });
  await rejects(() => b.device({ id: device, action: 'revoke' }), 409);
  await a.book({
    id: entry,
    kind: 'revenue',
    amount: 10000,
    source: 'coconala',
    occurredOn: '2026-09-04',
  });
  await rejects(
    () => b.book({ id: crypto.randomUUID(), reversesId: entry }),
    404,
  );
  const view = await b.overview();
  assert.equal(view.jobs.length, 0);
  assert.equal(view.book.revenue, 0);
  assert.equal(view.devices.length, 0);
});
await test('Sky connections are one-tap, idempotent and isolated per user', async () => {
  const { a, b } = fixture();
  const first = await a.connectSky({ tool: 'coconala' });
  const replay = await a.connectSky({ tool: 'coconala' });
  assert.equal(first.tool, 'coconala');
  assert.equal(first.scope, 'execute');
  assert.equal(replay.consentVersion, first.consentVersion);
  assert.deepEqual(
    (await a.listSkyConnections()).map(({ tool }) => tool),
    ['coconala'],
  );
  assert.deepEqual(await b.listSkyConnections(), []);
  await rejects(() => a.connectSky({ tool: 'shell' }), 400);
  await rejects(
    () => a.connectSky({ tool: 'coconala', personalNumber: 'hidden' }),
    400,
  );
});
await test('active slot, hourly limit and disabled tools are enforced before dispatch', async () => {
  const { a, advance } = fixture(),
    first = job();
  await a.createJob(first);
  await rejects(() => a.createJob(job()), 409);
  await a.changeJob(first.id, { action: 'cancel' });
  await a.control({ tool: 'mr-citations', enabled: false });
  await rejects(() => a.createJob(job()), 409);
  await a.control({ tool: 'mr-citations', enabled: true });
  for (let i = 1; i < 120; i++) {
    const j = job();
    await a.createJob(j);
    await a.changeJob(j.id, { action: 'cancel' });
  }
  await rejects(() => a.createJob(job()), 409);
  advance(3600001);
  await a.createJob(job());
});
await test('disabled-after-queue blocks start and timeout frees the slot without re-executing', async () => {
  const { a, advance, sqlite } = fixture(),
    input = job();
  await a.createJob(input);
  await a.control({ tool: 'mr-citations', enabled: false });
  await rejects(() => a.changeJob(input.id, { action: 'start' }), 409);
  advance(120000);
  assert.equal((await a.listJobs())[0].status, 'interrupted');
  await rejects(() => a.changeJob(input.id, finish), 409);
  await a.control({ tool: 'mr-citations', enabled: true });
  await a.createJob(job());
  assert.equal(
    sqlite.prepare('SELECT COUNT(*) AS n FROM tool_runs').get().n,
    0,
  );
});
await test('timeout rejects late completion, and active work cannot be claimed as cancelled', async () => {
  const { a, advance } = fixture(),
    input = job();
  await a.createJob(input);
  await a.changeJob(input.id, { action: 'start' });
  await rejects(() => a.changeJob(input.id, { action: 'cancel' }), 409);
  advance(120001);
  await rejects(() => a.changeJob(input.id, finish), 409);
  assert.equal((await a.listJobs())[0].status, 'interrupted');
});
await test('MCP dispatch requires recent owned device; revocation and stale connections block new work', async () => {
  const { a, advance } = fixture(),
    deviceId = crypto.randomUUID();
  await rejects(
    () => a.createJob(job({ transport: 'local-mcp', deviceId })),
    409,
  );
  await a.device({ id: deviceId, name: 'PC', action: 'connect' });
  advance(90001);
  assert.equal((await a.overview()).devices[0].online, false);
  await rejects(
    () => a.createJob(job({ transport: 'local-mcp', deviceId })),
    409,
  );
  await a.device({ id: deviceId, action: 'heartbeat' });
  const j = job({ tool: 'mr-delivery', transport: 'local-mcp', deviceId });
  await a.createJob(j);
  await a.changeJob(j.id, { action: 'cancel' });
  await a.device({ id: deviceId, action: 'revoke' });
  await rejects(() => a.device({ id: deviceId, action: 'heartbeat' }), 409);
  await rejects(
    () => a.createJob(job({ transport: 'local-mcp', deviceId })),
    409,
  );
});
await test('job and accounting validation reject forged fields, invalid dates and unsafe values', async () => {
  const { a } = fixture();
  for (const change of [
    { tool: 'shell' },
    { id: '1' },
    { sample: 0 },
    { inputBytes: Infinity },
    { inputBytes: -1 },
    { inputBytes: 16000001 },
    { tool: 'mr-delivery' },
    { userId: 'b' },
    { input: 'secret' },
  ])
    await rejects(() => a.createJob(job(change)), 400);
  for (const change of [
    { amount: 0 },
    { amount: 1.2 },
    { amount: NaN },
    { amount: -50 },
    { occurredOn: '2026-02-30' },
    { occurredOn: '2027-01-01' },
    { verified: true },
    { source: 'fake' },
  ])
    await rejects(
      () =>
        a.book({
          id: crypto.randomUUID(),
          kind: 'revenue',
          amount: 100,
          source: 'note',
          occurredOn: '2026-09-04',
          ...change,
        }),
      400,
    );
});
await test('device revocation after queuing prevents the start claim', async () => {
  const { a } = fixture(),
    deviceId = crypto.randomUUID();
  await a.device({ id: deviceId, name: 'PC', action: 'connect' });
  const input = job({ transport: 'local-mcp', deviceId });
  await a.createJob(input);
  await a.device({ id: deviceId, action: 'revoke' });
  await rejects(() => a.changeJob(input.id, { action: 'start' }), 409);
});
await test('book originals are immutable, retries are idempotent, reversals conserve totals and cannot be reversed twice', async () => {
  const { a } = fixture(),
    input = {
      id: crypto.randomUUID(),
      kind: 'revenue',
      amount: 130000,
      source: 'coconala',
      occurredOn: '2026-09-04',
    };
  await a.book(input);
  await a.book(input);
  await rejects(() => a.book({ ...input, amount: 140000 }), 409);
  await a.book({
    ...input,
    id: crypto.randomUUID(),
    kind: 'expense',
    amount: 5000,
    source: 'electricity',
  });
  let view = await a.overview();
  assert.equal(view.book.revenue, 130000);
  assert.equal(view.book.expense, 5000);
  assert.equal(view.book.verified, false);
  const reversal = { id: crypto.randomUUID(), reversesId: input.id };
  await a.book(reversal);
  await a.book(reversal);
  await rejects(
    () => a.book({ id: crypto.randomUUID(), reversesId: input.id }),
    409,
  );
  await rejects(
    () => a.book({ id: crypto.randomUUID(), reversesId: reversal.id }),
    404,
  );
  view = await a.overview();
  assert.equal(view.book.revenue, 0);
  assert.equal(view.book.expense, 5000);
  assert.equal(view.book.records.find((r) => r.id === input.id).reversed, 1);
  assert.equal(view.usage.networkBytes, null);
  assert.equal(view.usage.electricityWh, null);
  assert.equal(view.integrations.payments, 'not-configured');
});
await test('history failure rolls back completion so a report can safely be retried', async () => {
  const { a, sqlite } = fixture(),
    input = job();
  await a.createJob(input);
  await a.changeJob(input.id, { action: 'start' });
  sqlite.exec(
    "CREATE TRIGGER reject_history BEFORE INSERT ON tool_runs BEGIN SELECT RAISE(ABORT, 'test failure'); END",
  );
  await assert.rejects(() => a.changeJob(input.id, finish));
  assert.equal((await a.getJob(input.id)).status, 'running');
  sqlite.exec('DROP TRIGGER reject_history');
  await a.changeJob(input.id, finish);
  assert.equal((await a.getJob(input.id)).status, 'completed');
});
