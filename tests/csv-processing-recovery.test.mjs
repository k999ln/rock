import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import * as retention from '../lib/csv-retention.ts';
import * as limits from '../lib/csv-request-limit.ts';
import * as sample from '../lib/csv-trial-sample.ts';
import * as stripe from '../lib/sky-stripe.ts';
import * as transform from '../lib/csv-transform.ts';

function fixture(t) {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  for (const name of readdirSync(new URL('../drizzle/', import.meta.url)).filter((n) => n.endsWith('.sql')).sort())
    sqlite.exec(readFileSync(new URL(`../drizzle/${name}`, import.meta.url), 'utf8'));
  const objects = new Map();
  let heldEvent = null;
  let failedEvent = null, loseCompletion = false, failPut = null, completionReadFailures = 0, readFailures = 0, claimReadFailures = 0;
  const db = { prepare(sql) { let values = []; return {
    bind(...args) { values = args; return this; },
    async first() {
      if (readFailures > 0) { readFailures--; throw Error('synthetic read outage'); }
      return sqlite.prepare(sql).get(...values) ?? null;
    },
    async all() { return { results: sqlite.prepare(sql).all(...values) }; },
    async run() {
      if (heldEvent && sql.startsWith('INSERT INTO csv_job_events') && values[2] === heldEvent.name) {
        const held = heldEvent; heldEvent = null;
        held.ready.resolve(); await held.release.promise;
      }
      if (sql.startsWith('INSERT INTO csv_job_events') && values[2] === failedEvent) {
        failedEvent = null; throw Error('synthetic event write failure');
      }
      const changes = Number(sqlite.prepare(sql).run(...values).changes);
      if (sql.includes("SET status = 'processing'")) readFailures = claimReadFailures;
      if (sql.includes("SET status = 'completed'")) readFailures = completionReadFailures;
      if (loseCompletion && sql.includes("SET status = 'completed'")) {
        loseCompletion = false; throw Error('synthetic response lost after finalization commit');
      }
      return { meta: { changes } };
    },
  }; }, async batch(statements) { sqlite.exec('BEGIN'); try {
    const results = []; for (const statement of statements) results.push(await statement.run());
    sqlite.exec('COMMIT'); return results;
  } catch (error) { sqlite.exec('ROLLBACK'); throw error; } } };
  const bucket = {
    async put(key, value) {
      if (failPut && key.endsWith(failPut)) { failPut = null; throw Error('synthetic object write failure'); }
      objects.set(key, typeof value === 'string' ? new TextEncoder().encode(value) : new Uint8Array(value));
    },
    async get(key) { const value = objects.get(key); return value ? { arrayBuffer: async () => value.slice().buffer } : null; },
    async delete(keys) { for (const key of Array.isArray(keys) ? keys : [keys]) objects.delete(key); },
  };
  const exports = {};
  const modules = { 'cloudflare:workers': { env: { DB: db, BUCKET: bucket } },
    './csv-retention': retention, './csv-request-limit': limits, './csv-trial-sample': sample,
    './sky-stripe': stripe, './csv-transform': transform };
  const compiled = ts.transpileModule(readFileSync(new URL('../lib/csv-job-store.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  runInNewContext(compiled, { exports, crypto, TextEncoder, TextDecoder, Uint8Array, Date, Error, Response,
    require(name) { assert.ok(modules[name], name); return modules[name]; } });
  return { ...exports, objects, sqlite, bucket,
    holdEvent(name) {
      const held = { name, ready: Promise.withResolvers(), release: Promise.withResolvers() };
      heldEvent = held;
      return { ready: held.ready.promise, release: () => held.release.resolve() };
    },
    failClaimReads(count) { claimReadFailures = count; },
    failCompletionReads(count) { completionReadFailures = count; },
    failEvent(name) { failedEvent = name; }, loseCompletion() { loseCompletion = true; }, failPut(name) { failPut = name; },
    stored(id) { return sqlite.prepare('SELECT * FROM csv_jobs WHERE id = ?').get(id); },
    create() { return exports.createCsvJob('alice', { id: crypto.randomUUID(), name: 'synthetic.csv',
      bytes: new TextEncoder().encode('id,name,note\r\n001, A ,=1+1\r\n002, B ,safe\r\n'),
      specification: { trim: ['name'], spreadsheetSafe: true }, sample: true }); },
  };
}

void test('completed event failure cannot delete committed CSV artifacts', async (t) => {
  const h = fixture(t), job = await h.create(); h.failEvent('completed');
  await h.acceptCsvJob('alice', job.id, { revision: job.revision }).catch(() => undefined);
  const row = h.stored(job.id);
  assert.equal(row.status, 'completed');
  for (const kind of ['result', 'spreadsheet-safe', 'report-json', 'report-html'])
    assert.ok((await h.csvArtifact('alice', job.id, kind)).object);
  const recovered = await h.acceptCsvJob('alice', job.id, { revision: job.revision });
  assert.equal(recovered.status, 'completed'); assert.equal(recovered.attempt, 1);
  await assert.rejects(() => h.csvArtifact('bob', job.id, 'result'), (e) => e.status === 404);
});

void test('an ambiguous completion commit retains outputs and reconciles the terminal row', async (t) => {
  const h = fixture(t), job = await h.create(); h.loseCompletion();
  await h.acceptCsvJob('alice', job.id, { revision: job.revision }).catch(() => undefined);
  const row = h.stored(job.id); assert.equal(row.status, 'completed');
  assert.ok((await h.csvArtifact('alice', job.id, 'result')).object);
  const recovered = await h.acceptCsvJob('alice', job.id, { revision: job.revision });
  assert.equal(recovered.status, 'completed'); assert.equal(recovered.attempt, 1);
});

void test('processing event failure leaves a retryable job instead of a permanent processing state', async (t) => {
  const h = fixture(t), job = await h.create(); h.failEvent('processing');
  await assert.rejects(() => h.acceptCsvJob('alice', job.id, { revision: job.revision }));
  const row = h.stored(job.id); assert.equal(row.status, 'quality_failed');
  const retried = await h.retryCsvJob('alice', job.id, row.revision);
  assert.equal(retried.status, 'completed'); assert.equal(retried.attempt, 2);
});

void test('accepted event failure remains resumable through the existing accept operation', async (t) => {
  const h = fixture(t), job = await h.create(); h.failEvent('accepted');
  await assert.rejects(() => h.acceptCsvJob('alice', job.id, { revision: job.revision }));
  const row = h.stored(job.id); assert.equal(row.status, 'accepted');
  const resumed = await h.acceptCsvJob('alice', job.id, { revision: row.revision });
  assert.equal(resumed.status, 'completed'); assert.equal(resumed.attempt, 1);
});

void test('unavailable finalization readback retains output until an explicit owner read recovers', async (t) => {
  const h = fixture(t), job = await h.create(); h.failCompletionReads(2);
  await assert.rejects(() => h.acceptCsvJob('alice', job.id, { revision: job.revision }));
  const row = h.stored(job.id); assert.equal(row.status, 'completed');
  assert.ok(h.objects.has(row.result_key)); assert.ok(h.objects.has(row.report_html_key));
  const recovered = await h.acceptCsvJob('alice', job.id, { revision: job.revision });
  assert.equal(recovered.status, 'completed'); assert.equal(recovered.attempt, 1);
  assert.ok((await h.csvArtifact('alice', job.id, 'result')).object);
});

void test('partial object failure remains private and retries once; explicit deletion removes retained partials', async (t) => {
  const h = fixture(t), job = await h.create(); h.failPut('report.html');
  await assert.rejects(() => h.acceptCsvJob('alice', job.id, { revision: job.revision }));
  const row = h.stored(job.id); assert.equal(row.status, 'quality_failed');
  await assert.rejects(() => h.csvArtifact('alice', job.id, 'result'), (e) => e.status === 404);
  const resumed = await h.retryCsvJob('alice', job.id, row.revision);
  assert.equal(resumed.status, 'completed'); assert.equal(resumed.attempt, 2);
  for (const kind of resumed.artifacts) assert.ok((await h.csvArtifact('alice', job.id, kind)).object);
  const partial = await h.create(); h.failPut('report.html');
  await assert.rejects(() => h.acceptCsvJob('alice', partial.id, { revision: partial.revision }));
  assert.ok([...h.objects.keys()].filter((key) => key.startsWith(`csv/${partial.id}/`)).length > 1);
  await h.deleteCsvJob('alice', partial.id);
  assert.equal([...h.objects.keys()].filter((key) => key.startsWith(`csv/${partial.id}/`)).length, 0);
  assert.equal(h.stored(partial.id), undefined);
});

void test('accepted resume retains prior payment decision and still enforces owner, revision, and expiry', async (t) => {
  const h = fixture(t), job = await h.create(); h.failEvent('accepted');
  await assert.rejects(() => h.acceptCsvJob('alice', job.id, { revision: job.revision }));
  const row = h.stored(job.id);
  await assert.rejects(() => h.acceptCsvJob('bob', job.id, { revision: row.revision }), (e) => e.status === 404);
  await assert.rejects(() => h.acceptCsvJob('alice', job.id, { revision: job.revision }), (e) => e.code === 'REVISION');
  const results = await Promise.all([
    h.acceptCsvJob('alice', job.id, { revision: row.revision, paymentMethod: 'changed', paymentReference: 'changed' }),
    h.acceptCsvJob('alice', job.id, { revision: row.revision }),
  ]);
  assert.ok(results.some((result) => result.status === 'completed'));
  const saved = h.stored(job.id); assert.equal(saved.attempt, 1); assert.equal(saved.payment_status, 'sample');
  assert.equal(saved.payment_method, null); assert.equal(saved.payment_reference, null);
  const expired = await h.create(); h.failEvent('accepted');
  await assert.rejects(() => h.acceptCsvJob('alice', expired.id, { revision: expired.revision }));
  h.sqlite.prepare('UPDATE csv_jobs SET expires_at = 0 WHERE id = ?').run(expired.id);
  await assert.rejects(() => h.acceptCsvJob('alice', expired.id, { revision: h.stored(expired.id).revision }), (e) => e.status === 410);
  assert.equal(h.stored(expired.id), undefined);
});

void test('event fault recovery cannot bypass the existing three processing attempts', async (t) => {
  const h = fixture(t), job = await h.create(); h.failEvent('processing');
  await assert.rejects(() => h.acceptCsvJob('alice', job.id, { revision: job.revision }));
  for (let attempt = 2; attempt <= 3; attempt++) {
    h.failEvent('processing'); const row = h.stored(job.id);
    await assert.rejects(() => h.retryCsvJob('alice', job.id, row.revision));
    assert.equal(h.stored(job.id).attempt, attempt);
  }
  const row = h.stored(job.id);
  await assert.rejects(() => h.retryCsvJob('alice', job.id, row.revision), (e) => e.code === 'ATTEMPTS');
  assert.equal(h.stored(job.id).attempt, 3);
});

void test('a one-shot post-claim read failure preserves the exact fence and permits explicit retry', async (t) => {
  const h = fixture(t), job = await h.create(); h.failClaimReads(1);
  await assert.rejects(() => h.acceptCsvJob('alice', job.id, { revision: job.revision }));
  const row = h.stored(job.id);
  assert.equal(row.status, 'quality_failed'); assert.equal(row.attempt, 1);
  assert.ok(h.objects.has(row.input_key));
  h.failClaimReads(0);
  const retried = await h.retryCsvJob('alice', job.id, row.revision);
  assert.equal(retried.status, 'completed'); assert.equal(retried.attempt, 2);
  assert.ok((await h.csvArtifact('alice', job.id, 'result')).object);
});

for (const recreate of [false, true]) void test(`late CSV completion event cannot survive deletion${recreate ? ' or join a new input with the same id' : ''}`, async (t) => {
  const h = fixture(t), job = await h.create(), held = h.holdEvent('completed');
  const processing = h.acceptCsvJob('alice', job.id, { revision: job.revision });
  t.after(held.release);
  await held.ready;
  const completed = h.stored(job.id); assert.equal(completed.status, 'completed');
  await h.deleteCsvJob('alice', job.id);
  assert.equal(h.stored(job.id), undefined);
  assert.equal(h.sqlite.prepare('SELECT COUNT(*) AS count FROM csv_job_events WHERE job_id = ?').get(job.id).count, 0);
  assert.equal(h.objects.size, 0);
  if (recreate) await h.createCsvJob('alice', { id: job.id, name: 'new-generation.csv',
    bytes: new TextEncoder().encode('id,name\r\n003,new input\r\n'), specification: {}, sample: true });
  held.release(); await processing;
  const events = h.sqlite.prepare('SELECT event FROM csv_job_events WHERE job_id = ? ORDER BY id').all(job.id).map(row => row.event);
  assert.deepEqual(events, recreate ? ['quoted'] : []);
  if (recreate) {
    assert.equal(h.stored(job.id).status, 'quoted');
    assert.notEqual(h.stored(job.id).input_key, completed.input_key);
    assert.equal(h.objects.size, 1);
  }
});

void test('current CSV generation keeps the existing event body and order', async (t) => {
  const h = fixture(t), job = await h.create();
  const completed = await h.acceptCsvJob('alice', job.id, { revision: job.revision });
  const events = h.sqlite.prepare('SELECT * FROM csv_job_events WHERE job_id = ? ORDER BY id').all(job.id);
  assert.deepEqual(events.map(row => row.event), ['quoted', 'accepted', 'processing', 'completed']);
  assert.ok(events.every(row => row.user_id === 'alice' && row.job_id === job.id && Number.isSafeInteger(row.created_at)));
  assert.ok(events.every((row, index) => index === 0 || row.id > events[index - 1].id));
  assert.deepEqual(JSON.parse(events[2].detail_json), { attempt: 1 });
  assert.equal(JSON.parse(events[3].detail_json).outputSha256, completed.outputSha256);
  assert.deepEqual(JSON.parse(events[3].detail_json).validation, JSON.parse(JSON.stringify(completed.validation)));
});

void test('delayed accepted event remains in same-generation history after concurrent explicit resume', async (t) => {
  const h = fixture(t), job = await h.create(), held = h.holdEvent('accepted');
  const first = h.acceptCsvJob('alice', job.id, { revision: job.revision });
  t.after(held.release);
  await held.ready;
  const accepted = h.stored(job.id); assert.equal(accepted.status, 'accepted');
  const completed = await h.acceptCsvJob('alice', job.id, { revision: accepted.revision });
  assert.equal(completed.status, 'completed'); assert.equal(completed.attempt, 1);
  held.release(); await first;
  const events = h.sqlite.prepare('SELECT event FROM csv_job_events WHERE job_id = ? ORDER BY id').all(job.id).map(row => row.event);
  assert.equal(events.filter(event => event === 'accepted').length, 1);
  assert.equal(events.filter(event => event === 'processing').length, 1);
  assert.equal(events.filter(event => event === 'completed').length, 1);
});

void test('cleanup-pending CSV row cannot regain a delayed completion event', async (t) => {
  const h = fixture(t), job = await h.create(), held = h.holdEvent('completed');
  const processing = h.acceptCsvJob('alice', job.id, { revision: job.revision });
  t.after(held.release); await held.ready;
  const remove = h.bucket.delete.bind(h.bucket);
  h.bucket.delete = async () => { throw Error('synthetic cleanup interruption'); };
  await assert.rejects(() => h.deleteCsvJob('alice', job.id), /cleanup interruption/);
  assert.equal(h.stored(job.id).status, 'cleanup_pending');
  held.release(); await processing;
  assert.equal(h.sqlite.prepare("SELECT COUNT(*) AS count FROM csv_job_events WHERE job_id = ? AND event = 'completed'").get(job.id).count, 0);
  h.bucket.delete = remove;
  await h.deleteCsvJob('alice', job.id);
  assert.equal(h.stored(job.id), undefined); assert.equal(h.objects.size, 0);
});
