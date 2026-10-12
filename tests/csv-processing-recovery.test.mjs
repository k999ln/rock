import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import * as transform from '../lib/csv-transform.ts';
import * as money from '../lib/csv-money.ts';

const bytes = (value) => new TextEncoder().encode(value);
function fixture(t) {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  for (const name of readdirSync(new URL('../drizzle/', import.meta.url)).filter((name) => name.endsWith('.sql')).sort())
    sqlite.exec(readFileSync(new URL(`../drizzle/${name}`, import.meta.url), 'utf8'));
  const objects = new Map(), tasks = [], backgroundErrors = [];
  let heldEvent = null, heldPut = null, failedEvent = null, loseCompletion = false, failPut = null;
  let fixedTime = null, loseInsert = false, insertReadFailures = 0;
  class FixtureDate extends Date { static now() { return fixedTime ?? Date.now(); } }
  let claimReadFailures = 0, completionReadFailures = 0, readFailures = 0, inBatch = false;
  const db = { prepare(sql) { let values = []; return {
    bind(...args) { values = args; return this; },
    async first() {
      if (readFailures > 0) { readFailures--; throw Error('synthetic read outage'); }
      return sqlite.prepare(sql).get(...values) ?? null;
    },
    async all() { return { results: sqlite.prepare(sql).all(...values) }; },
    async run() {
      const name = sql.startsWith('INSERT INTO csv_job_events') ? (sql.includes("'delivered'") ? 'delivered' : values[2]) : null;
      if (heldEvent && name === heldEvent.name) {
        const held = heldEvent; heldEvent = null;
        held.ready.resolve(); await held.release.promise;
      }
      if (name && name === failedEvent) { failedEvent = null; throw Error('synthetic event write failure'); }
      const changes = Number(sqlite.prepare(sql).run(...values).changes);
      if (loseInsert && sql.startsWith('INSERT INTO csv_jobs')) { loseInsert = false; readFailures = insertReadFailures; throw Error('synthetic lost insertion response'); }
      if (!inBatch && sql.includes("SET status = 'processing'")) readFailures = claimReadFailures;
      return { meta: { changes } };
    },
  }; }, async batch(statements) {
    sqlite.exec('BEGIN'); inBatch = true;
    let results;
    try { results = []; for (const statement of statements) results.push(await statement.run()); sqlite.exec('COMMIT'); }
    catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    finally { inBatch = false; }
    if (results.length === 3 && results[0].meta.changes === 1 && loseCompletion) {
      loseCompletion = false; readFailures = completionReadFailures;
      throw Error('synthetic response lost after finalization commit');
    }
    if (results.length === 3) readFailures = completionReadFailures;
    return results;
  } };
  const bucket = {
    async put(key, value) {
      if (heldPut && key.endsWith(heldPut.name)) {
        const held = heldPut; heldPut = null; held.ready.resolve(); await held.release.promise;
        if (held.fail) throw Error('synthetic delayed old lease failure');
      }
      if (failPut && key.endsWith(failPut)) { failPut = null; throw Error('synthetic object write failure'); }
      objects.set(key, typeof value === 'string' ? bytes(value) : new Uint8Array(value));
    },
    async get(key) { const value = objects.get(key); return value ? { arrayBuffer: async () => value.slice().buffer } : null; },
    async delete(keys) { for (const key of Array.isArray(keys) ? keys : [keys]) objects.delete(key); },
  };
  const exports = {};
  const modules = { 'cloudflare:workers': { env: { DB: db, BUCKET: bucket }, waitUntil(promise) { tasks.push(promise); } },
    './csv-money': money, './csv-transform': transform };
  const source = process.env.CSV_RECOVERY_SOURCE ? readFileSync(process.env.CSV_RECOVERY_SOURCE, 'utf8') : readFileSync(new URL('../lib/csv-job-store.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(compiled, { exports, crypto, TextEncoder, TextDecoder, Uint8Array, Date: FixtureDate, Error, Response, btoa,
    console: { error(...args) { backgroundErrors.push(args); } },
    require(name) { assert.ok(modules[name], name); return modules[name]; } });
  return { ...exports, objects, sqlite, bucket, backgroundErrors,
    async settled(start = 0) { let count = start; while (count < tasks.length) { const next = tasks.slice(count); count = tasks.length; await Promise.all(next); } },
    holdEvent(name) { const held = { name, ready: Promise.withResolvers(), release: Promise.withResolvers() }; heldEvent = held; return { ready: held.ready.promise, release: () => held.release.resolve() }; },
    holdPut(name, fail = false) { const held = { name, fail, ready: Promise.withResolvers(), release: Promise.withResolvers() }; heldPut = held; return { ready: held.ready.promise, release: () => held.release.resolve() }; },
    freezeTime(value) { fixedTime = value; }, loseInsert(readFailureCount = 0) { loseInsert = true; insertReadFailures = readFailureCount; },
    failClaimReads(count) { claimReadFailures = count; }, failCompletionReads(count) { completionReadFailures = count; },
    failEvent(name) { failedEvent = name; }, loseCompletion() { loseCompletion = true; }, failPut(name) { failPut = name; },
    stored(id) { return sqlite.prepare('SELECT * FROM csv_jobs WHERE id = ?').get(id); },
    create(user = 'alice', input = {}) { return exports.createCsvJob(user, { id: crypto.randomUUID(), name: 'synthetic.csv',
      bytes: bytes('id,name,note\r\n001, A ,=1+1\r\n002, B ,safe\r\n'),
      specification: { trim: ['name'], spreadsheetSafe: true }, sample: true, ...input }); },
  };
}
async function deliver(h, job, user = 'alice') { await h.acceptCsvJob(user, job.id, { revision: job.revision }); await h.settled(); return h.stored(job.id); }
async function readable(h, id) { for (const kind of ['result', 'spreadsheet-safe', 'report-json', 'report-html']) assert.ok((await h.csvArtifact('alice', id, kind)).object, kind); }

await test('Site committed delivery survives a lost batch response with one revision and private artifacts', async (t) => {
  const h = fixture(t), job = await h.create(); h.loseCompletion();
  const row = await deliver(h, job); assert.equal(row.status, 'delivered'); await readable(h, job.id);
  const replay = await h.acceptCsvJob('alice', job.id, { revision: job.revision }); assert.equal(replay.attempt, 1); assert.equal(replay.deliveryRevision, 1);
  assert.equal(h.sqlite.prepare('SELECT COUNT(*) AS n FROM csv_delivery_revisions WHERE job_id = ?').get(job.id).n, 1);
  assert.equal(h.sqlite.prepare("SELECT COUNT(*) AS n FROM csv_job_events WHERE job_id = ? AND event = 'delivered'").get(job.id).n, 1);
  await assert.rejects(() => h.csvArtifact('bob', job.id, 'result'), (error) => error.status === 404);
});

await test('Site processing event failure releases only its lease for explicit retry', async (t) => {
  const h = fixture(t), job = await h.create(); h.failEvent('processing');
  let row = await deliver(h, job); assert.equal(row.status, 'quality_failed'); assert.equal(row.lease_id, null); assert.equal(row.attempt, 1);
  await h.retryCsvJob('alice', job.id, row.revision); await h.settled(); row = h.stored(job.id);
  assert.equal(row.status, 'delivered'); assert.equal(row.attempt, 2); await readable(h, job.id);
});

await test('Site post-claim read failure enters the existing retry flow without waiting for lease expiry', async (t) => {
  const h = fixture(t), job = await h.create(); h.failClaimReads(1);
  let row = await deliver(h, job); assert.equal(row.status, 'quality_failed'); assert.equal(row.lease_id, null);
  h.failClaimReads(0); await h.retryCsvJob('alice', job.id, row.revision); await h.settled(); row = h.stored(job.id);
  assert.equal(row.status, 'delivered'); assert.equal(row.attempt, 2);
});

await test('Site delayed quoted event cannot reappear after explicit deletion', async (t) => {
  const h = fixture(t), held = h.holdEvent('quoted'), id = crypto.randomUUID();
  const creating = h.create('alice', { id }); await held.ready;
  await h.deleteCsvJob('alice', id); held.release(); await creating;
  assert.equal(h.stored(id), undefined); assert.equal(h.sqlite.prepare('SELECT COUNT(*) AS n FROM csv_job_events WHERE job_id = ?').get(id).n, 0);
});

await test('Site delayed old event cannot attach to a replacement input or another owner', async (t) => {
  const h = fixture(t), held = h.holdEvent('quoted'), id = crypto.randomUUID();
  const creating = h.create('alice', { id }); await held.ready;
  await h.deleteCsvJob('alice', id); const replacement = await h.create('bob', { id, bytes: bytes('id,name,note\n7,New,safe\n') });
  held.release(); await creating;
  const events = h.sqlite.prepare('SELECT user_id,event FROM csv_job_events WHERE job_id = ?').all(id);
  assert.deepEqual(events.map((event) => [event.user_id, event.event]), [['bob', 'quoted']]);
  assert.equal(h.stored(id).input_sha256, replacement.inputSha256);
});

await test('Site normal delayed accepted event remains after authenticated poll resumes the same input', async (t) => {
  const h = fixture(t), job = await h.create(), held = h.holdEvent('accepted');
  const accepting = h.acceptCsvJob('alice', job.id, { revision: job.revision }); await held.ready;
  await h.listCsvJobs('alice'); await h.settled(); assert.equal(h.stored(job.id).status, 'delivered');
  held.release(); await accepting; await h.settled();
  for (const name of ['quoted', 'accepted', 'processing', 'delivered']) assert.equal(h.sqlite.prepare('SELECT COUNT(*) AS n FROM csv_job_events WHERE job_id = ? AND event = ?').get(job.id, name).n, 1, name);
  assert.equal(h.stored(job.id).attempt, 1);
});

await test('Site delivery event failure rolls back the full existing publication batch and then retries', async (t) => {
  const h = fixture(t), job = await h.create(); h.failEvent('delivered');
  let row = await deliver(h, job); assert.equal(row.status, 'quality_failed'); assert.equal(row.result_key, null);
  assert.equal(h.sqlite.prepare('SELECT COUNT(*) AS n FROM csv_delivery_revisions WHERE job_id = ?').get(job.id).n, 0);
  assert.equal(h.objects.size, 1);
  await h.retryCsvJob('alice', job.id, row.revision); await h.settled(); row = h.stored(job.id);
  assert.equal(row.status, 'delivered'); assert.equal(row.attempt, 2); await readable(h, job.id);
});

await test('Site unavailable completion readback retains all committed artifacts', async (t) => {
  const h = fixture(t), job = await h.create(); h.loseCompletion(); h.failCompletionReads(1);
  const row = await deliver(h, job); assert.equal(row.status, 'delivered'); assert.ok(h.objects.has(row.result_key)); assert.ok(h.objects.has(row.report_html_key));
  const recovered = await h.acceptCsvJob('alice', job.id, { revision: job.revision }); assert.equal(recovered.attempt, 1); await readable(h, job.id);
});

await test('Site failed output attempt stays private and does not affect the next lease artifacts', async (t) => {
  const h = fixture(t), job = await h.create(); h.failPut('report.html');
  const failed = await deliver(h, job); assert.equal(failed.status, 'quality_failed'); assert.equal(h.objects.size, 1);
  await assert.rejects(() => h.csvArtifact('alice', job.id, 'result'), (error) => error.status === 404);
  await h.retryCsvJob('alice', job.id, failed.revision); await h.settled(); await readable(h, job.id); assert.equal(h.stored(job.id).attempt, 2);
});

await test('Site unpaid input cannot bypass payment approval and paid audit metadata cannot be deleted', async (t) => {
  const h = fixture(t), job = await h.create('alice', { sample: false });
  await assert.rejects(() => h.acceptCsvJob('alice', job.id, { revision: job.revision }), (error) => error.code === 'PAYMENT_AMOUNT_MISMATCH' && error.status === 409);
  assert.equal(h.stored(job.id).attempt, 0);
  await h.recordProviderCsvPayment({ provider: 'fixture', providerEventId: 'paid-1', jobId: job.id, type: 'buyer_paid', amountMinor: 3000, currency: 'JPY', occurredAt: Date.now(), evidenceDigest: 'a'.repeat(64), source: 'provider' });
  await assert.rejects(() => h.deleteCsvJob('alice', job.id), (error) => error.code === 'DELETE_FINANCIAL_RECORD');
  const paid = h.stored(job.id); await deliver(h, { ...job, revision: paid.revision }); await readable(h, job.id);
  const link = await h.createCsvDeliveryLink('alice', job.id); const token = link.url.split('#token=')[1];
  const delivery = await h.csvBuyerDelivery(job.id, token); assert.equal(delivery.job.deliveryRevision, 1);
  await h.revokeCsvDeliveryLinks('alice', job.id); await assert.rejects(() => h.csvBuyerDelivery(job.id, token), (error) => error.status === 404);
});

await test('Site delayed event cannot attach to the same owner new input under a reused ID', async (t) => {
  const h = fixture(t), held = h.holdEvent('quoted'), id = crypto.randomUUID();
  const creating = h.create('alice', { id }); await held.ready;
  await h.deleteCsvJob('alice', id); const replacement = await h.create('alice', { id, bytes: bytes('id,name,note\n7,New,safe\n') });
  held.release(); await creating;
  assert.equal(h.sqlite.prepare('SELECT COUNT(*) AS n FROM csv_job_events WHERE job_id = ?').get(id).n, 1);
  assert.equal(h.stored(id).input_sha256, replacement.inputSha256);
});

await test('Site an expired old lease failure cannot delete a newer published delivery', async (t) => {
  const h = fixture(t), job = await h.create(), held = h.holdPut('result.csv', true);
  await h.acceptCsvJob('alice', job.id, { revision: job.revision }); await held.ready;
  const oldLease = h.stored(job.id).lease_id;
  h.sqlite.prepare('UPDATE csv_jobs SET lease_expires_at = 0 WHERE id = ?').run(job.id);
  await h.listCsvJobs('alice'); await h.settled(1);
  const published = h.stored(job.id); assert.equal(published.status, 'delivered'); assert.equal(published.attempt, 2);
  assert.ok(!published.result_key.includes(oldLease));
  held.release(); await h.settled();
  assert.equal(h.stored(job.id).result_key, published.result_key); await readable(h, job.id);
  assert.equal(h.sqlite.prepare('SELECT COUNT(*) AS n FROM csv_delivery_revisions WHERE job_id = ?').get(job.id).n, 1);
});

await test('Site processing failures retain the original three-attempt ceiling', async (t) => {
  const h = fixture(t), job = await h.create(); h.failEvent('processing'); await deliver(h, job);
  for (let attempt = 2; attempt <= 3; attempt++) {
    const row = h.stored(job.id); h.failEvent('processing');
    await h.retryCsvJob('alice', job.id, row.revision); await h.settled();
    assert.equal(h.stored(job.id).attempt, attempt); assert.equal(h.stored(job.id).status, 'quality_failed');
  }
  await assert.rejects(() => h.retryCsvJob('alice', job.id, h.stored(job.id).revision), (error) => error.code === 'ATTEMPTS');
  assert.equal(h.stored(job.id).attempt, 3);
});

await test('Site accepted event failure resumes through owner polling with no new payment decision', async (t) => {
  const h = fixture(t), job = await h.create(); h.failEvent('accepted');
  await assert.rejects(() => h.acceptCsvJob('alice', job.id, { revision: job.revision }));
  assert.equal(h.stored(job.id).status, 'accepted');
  await h.listCsvJobs('bob'); await h.settled(); assert.equal(h.stored(job.id).attempt, 0);
  await h.listCsvJobs('alice'); await h.settled(); assert.equal(h.stored(job.id).status, 'delivered');
  assert.equal(h.stored(job.id).attempt, 1); assert.equal(h.stored(job.id).payment_status, 'sample');
});


await test('Site concurrent same-byte conflicting quote never deletes the saved winner input', async (t) => {
  const h = fixture(t), id = crypto.randomUUID(), held = h.holdPut('.csv');
  const losing = h.create('alice', { id }); const outcome = losing.then((value) => ({ value }), (error) => ({ error }));
  await held.ready;
  const winner = await h.create('alice', { id, specification: { trim: [], spreadsheetSafe: true } });
  held.release(); const result = await outcome; assert.ok(result.error, 'different specification cannot overwrite the same request');
  const saved = h.stored(id); assert.ok(h.objects.has(saved.input_key), 'loser cleanup must not delete the winning input');
  assert.equal(h.objects.size, 1, 'only the losing attempt input is removed');
  await deliver(h, winner); await readable(h, id);
});

await test('Site concurrent identical quote replays one saved input and cleans only its own losing upload', async (t) => {
  const h = fixture(t), id = crypto.randomUUID(), held = h.holdPut('.csv');
  const first = h.create('alice', { id }); await held.ready;
  const winner = await h.create('alice', { id }); held.release(); const replay = await first;
  assert.equal(replay.id, winner.id); assert.equal(replay.inputSha256, winner.inputSha256);
  assert.equal(h.objects.size, 1); assert.ok(h.objects.has(h.stored(id).input_key));
  await deliver(h, winner); await readable(h, id);
});

await test('Site same-clock same-input recreation cannot revive a retired quoted event', async (t) => {
  const h = fixture(t), id = crypto.randomUUID(), held = h.holdEvent('quoted'); h.freezeTime(Date.now());
  const original = h.create('alice', { id }); await held.ready;
  const old = h.stored(id); await h.deleteCsvJob('alice', id); await h.create('alice', { id });
  assert.equal(h.stored(id).created_at, old.created_at, 'the clock deliberately gives both incarnations the same timestamp');
  held.release(); await original;
  assert.equal(h.sqlite.prepare('SELECT COUNT(*) AS n FROM csv_job_events WHERE job_id = ?').get(id).n, 1, 'only the current incarnation event survives');
  assert.ok(h.objects.has(h.stored(id).input_key));
});

for (const readFailures of [0, 1]) await test(`Site uncertain insert (${readFailures} reconciliation read failures) retains its committed input`, async (t) => {
  const h = fixture(t), id = crypto.randomUUID(); h.loseInsert(readFailures);
  const result = await h.create('alice', { id }).then((value) => ({ value }), (error) => ({ error }));
  if (readFailures) assert.ok(result.error); else assert.equal(result.value.id, id);
  const row = h.stored(id); assert.ok(row); assert.ok(h.objects.has(row.input_key)); assert.equal(h.objects.size, 1);
  const replay = await h.create('alice', { id }); await deliver(h, replay); await readable(h, id);
});

await test('Site legacy persisted input keys remain readable and removable without migration', async (t) => {
  const h = fixture(t), job = await h.create(), row = h.stored(job.id);
  const inputHash = String(row.input_sha256); assert.match(inputHash, /^[a-f0-9]{64}$/);
  const legacy = `csv/${await transform.sha256(bytes('alice'))}/${job.id}/${inputHash}.csv`;
  if (legacy !== row.input_key) { h.objects.set(legacy, h.objects.get(row.input_key)); h.objects.delete(row.input_key); }
  h.sqlite.prepare('UPDATE csv_jobs SET input_key = ? WHERE id = ?').run(legacy, job.id);
  await deliver(h, job); await readable(h, job.id); await h.deleteCsvJob('alice', job.id);
  assert.equal(h.objects.size, 0); assert.equal(h.stored(job.id), undefined);
});
