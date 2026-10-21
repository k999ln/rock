import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { workStore } from '../lib/work-store.ts';
import { createWorkJob } from '../lib/workflow.ts';
import { a2aDelegationStore } from '../lib/a2a-delegation-store.ts';
import { encryptA2AArtifact } from '../lib/a2a-input-crypto.ts';
import { exportSkyOwnerWork } from '../lib/sky-owner-export.server.ts';

function database(t) {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  for (const file of readdirSync(new URL('../drizzle/', import.meta.url)).filter((name) => name.endsWith('.sql') && !name.startsWith('._')).sort())
    sqlite.exec(readFileSync(new URL(`../drizzle/${file}`, import.meta.url), 'utf8'));
  const control = { readOnly: false, onRead: () => {} };
  const db = {
    prepare(sql) {
      if (control.readOnly) assert.match(sql.trim(), /^SELECT/i, 'export may only read');
      return { bind(...values) { return {
        async first() { control.onRead(sql); return sqlite.prepare(sql).get(...values) ?? null; },
        async all() { control.onRead(sql); return { results: sqlite.prepare(sql).all(...values) }; },
        async run() { return { meta: { changes: Number(sqlite.prepare(sql).run(...values).changes) } }; },
      }; } };
    },
    async batch(statements) { return Promise.all(statements.map((statement) => statement.run())); },
  };
  return { db, sqlite, control };
}
async function fixture(t) {
  const context = database(t);
  const { db, sqlite } = context;
  const owner = 'synthetic-alice';
  const job = createWorkJob({ id: randomUUID(), title: '持出しfixture', templateId: 'article' });
  await workStore(db).create(owner, job);
  const id = randomUUID();
  const agents = a2aDelegationStore(db);
  await agents.prepare(owner, { id, parentJobId: job.id, idempotencyKey: 'export-fixture', messageId: randomUUID(),
    targetOrigin: 'https://agent.example.test', targetAgentName: 'Fixture agent', targetAgentVersion: '1', protocolVersion: '1.0',
    inputSha256: 'b'.repeat(64), authorizationSha256: 'c'.repeat(64), budgetCurrency: 'USD', budgetLimitMinor: 5,
    parentBudgetLimitMinor: 10, continueWhileDeviceOffline: true, deadlineAt: 20000 }, 1000);
  const remoteTask = 'synthetic-remote-task';
  sqlite.prepare("UPDATE agent_delegations SET state='remote_completed', remote_task_id=?, artifacts_captured=1 WHERE id=?").run(remoteTask, id);
  const serialized = JSON.stringify({ schemaVersion: 1, artifacts: [{ textParts: ['本人の保存済み成果'] }], omittedNonTextParts: 0, truncated: false });
  const key = 'a'.repeat(64);
  const encrypted = await encryptA2AArtifact(serialized, key, owner, id, remoteTask);
  await agents.saveArtifact(owner, id, remoteTask, encrypted, Buffer.byteLength(serialized), 2000);
  return { ...context, owner, job, id, key };
}

void test('real owner-scoped stores export decrypted text without mutating jobs, approvals or budgets', async (t) => {
  const f = await fixture(t);
  const changesBefore = f.sqlite.prepare('SELECT total_changes() AS n').get().n;
  f.control.readOnly = true;
  const result = await exportSkyOwnerWork(f.db, f.owner, f.job.id, f.job.revision, f.key);
  assert.match(result.html, /本人の保存済み成果/);
  assert.equal(f.sqlite.prepare('SELECT total_changes() AS n').get().n, changesBefore);
  assert.equal(result.manifest.scope.jobId, f.job.id);
  await assert.rejects(exportSkyOwnerWork(f.db, 'synthetic-bob', f.job.id, f.job.revision, f.key), { code: 'NOT_FOUND' });
  await assert.rejects(exportSkyOwnerWork(f.db, f.owner, f.job.id, 99999, f.key), { code: 'REVISION_CONFLICT' });
});

void test('a changed job while collecting artifacts cannot produce a mixed snapshot', async (t) => {
  const f = await fixture(t);
  let reads = 0;
  f.control.onRead = (sql) => {
    if (sql.includes('SELECT payload FROM work_jobs') && ++reads === 3)
      f.sqlite.prepare("UPDATE work_jobs SET revision=revision+1, payload=json_set(payload, '$.revision', revision+1) WHERE id=?").run(f.job.id);
  };
  await assert.rejects(exportSkyOwnerWork(f.db, f.owner, f.job.id, f.job.revision, f.key), { code: 'REVISION_CONFLICT' });
});

void test('missing encryption key, altered ciphertext and captured-but-missing files fail closed', async (t) => {
  const f = await fixture(t);
  await assert.rejects(exportSkyOwnerWork(f.db, f.owner, f.job.id, f.job.revision), { code: 'UNAVAILABLE' });
  f.sqlite.prepare("UPDATE agent_delegation_artifacts SET payload_ciphertext='tampered'").run();
  await assert.rejects(exportSkyOwnerWork(f.db, f.owner, f.job.id, f.job.revision, f.key));
  f.sqlite.prepare('DELETE FROM agent_delegation_artifacts').run();
  await assert.rejects(exportSkyOwnerWork(f.db, f.owner, f.job.id, f.job.revision, f.key), { code: 'INVALID_ARTIFACT' });
});
