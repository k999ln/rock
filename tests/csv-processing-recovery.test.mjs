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
  let failedEvent = null, loseCompletion = false, failPut = null, completionReadFailures = 0, readFailures = 0, claimReadFailures = 0;
  const db = { prepare(sql) { let values = []; return {
    bind(...args) { values = args; return this; },
    async first() {
      if (readFailures > 0) { readFailures--; throw Error('synthetic read outage'); }
      return sqlite.prepare(sql).get(...values) ?? null;
    },
    async all() { return { results: sqlite.prepare(sql).all(...values) }; },
    async run() {
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
