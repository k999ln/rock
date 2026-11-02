import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { applySourceSandboxSchema, openMonthlySandboxDatabase, sourceSandboxRestoreSql, sourceSandboxRestoreStatements } from '../scripts/sky-monthly-sandbox-db.mjs';
import { seedMonthlyCloudFixture } from '../scripts/sky-cloud-monthly-fixture.mjs';
import { skyCloudMonthlyStore } from '../lib/sky-cloud-monthly-store.ts';

void test('historical fixture is pinned and restores all ten tables and eleven guards', t => {
  const fixture = readFileSync(new URL('fixtures/sky-monthly-historical-schema.sql', import.meta.url));
  const provenance = JSON.parse(readFileSync(new URL('fixtures/sky-monthly-historical-provenance.json', import.meta.url), 'utf8'));
  assert.equal(createHash('sha256').update(fixture).digest('hex'), provenance.fixtureSha256);
  const db = openMonthlySandboxDatabase(); t.after(() => db.close());
  const names = {
    table: ['sky_monthly_sandbox_invoices','sky_monthly_sandbox_quotes','sky_monthly_sandbox_usage','sky_cloud_monthly_invoices','sky_cloud_monthly_items','sky_cloud_monthly_events','sky_recurring_contracts','sky_recurring_charges','sky_hosted_monthly_events','sky_hosted_monthly_tests'],
    trigger: ['sky_monthly_sandbox_usage_cap','sky_monthly_sandbox_usage_total','sky_cloud_monthly_item_guard','sky_cloud_monthly_item_total','sky_cloud_monthly_item_no_update','sky_cloud_monthly_item_no_delete','sky_recurring_llm_reserve','sky_recurring_llm_dispatch','sky_recurring_llm_send','sky_recurring_a2a_reserve','sky_recurring_a2a_send'],
  };
  for (const [type, values] of Object.entries(names)) for (const name of values)
    assert.ok(db.sqlite.prepare('SELECT 1 FROM sqlite_master WHERE type=? AND name=?').get(type, name), name);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM sky_recurring_contracts').get().n, 0);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM sky_cloud_monthly_invoices').get().n, 0);
});

void test('caller-owned SQLite keeps its adapter semantics and accepts repeat schema initialization', () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    applySourceSandboxSchema(sqlite);
    assert.equal(sqlite.prepare("SELECT 1 FROM sqlite_master WHERE name='local_sandbox_migrations'").get(), undefined);
    const before = sqlite.prepare('SELECT name,sql FROM sqlite_master ORDER BY name').all();
    applySourceSandboxSchema(sqlite);
    assert.deepEqual(sqlite.prepare('SELECT name,sql FROM sqlite_master ORDER BY name').all(), before);
    const journal = JSON.parse(readFileSync(new URL('../drizzle-main/meta/_journal.json', import.meta.url), 'utf8'));
    assert.deepEqual(sqlite.prepare('SELECT name FROM local_sandbox_migrations ORDER BY name').all().map(row => row.name), journal.entries.map(entry => `${entry.tag}.sql`).sort());
  } finally { sqlite.close(); }
});

void test('same file reopens without duplicate invoice totals or parent budget settlement', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'rock-monthly-reopen-')), path = join(dir, 'test.sqlite');
  let db = openMonthlySandboxDatabase(path);
  t.after(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });
  const source = await seedMonthlyCloudFixture(db, 'synthetic-owner');
  const row = await skyCloudMonthlyStore(db, 'acct_fixture').importUsage('synthetic-owner', source.kind, source.id);
  const pool = db.sqlite.prepare('SELECT * FROM agent_delegation_budget_pools').all();
  db.close(); db = openMonthlySandboxDatabase(path);
  const replay = await skyCloudMonthlyStore(db, 'acct_fixture').importUsage('synthetic-owner', source.kind, source.id);
  assert.equal(replay.id, row.id); assert.equal(replay.total_minor, 100);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM sky_cloud_monthly_items').get().n, 1);
  assert.deepEqual(db.sqlite.prepare('SELECT * FROM agent_delegation_budget_pools').all(), pool);
});

void test('partial initialization restores missing immutability guard and preserves saved rows', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'rock-monthly-partial-')), path = join(dir, 'test.sqlite');
  let db = openMonthlySandboxDatabase(path);
  t.after(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });
  const source = await seedMonthlyCloudFixture(db, 'synthetic-owner');
  await skyCloudMonthlyStore(db, 'acct_fixture').importUsage('synthetic-owner', source.kind, source.id);
  const rows = db.sqlite.prepare('SELECT * FROM sky_cloud_monthly_items').all();
  db.sqlite.exec('DROP TRIGGER sky_cloud_monthly_item_no_update'); db.close(); db = openMonthlySandboxDatabase(path);
  assert.deepEqual(db.sqlite.prepare('SELECT * FROM sky_cloud_monthly_items').all(), rows);
  assert.throws(() => db.sqlite.exec('UPDATE sky_cloud_monthly_items SET amount_minor=1'), /MONTHLY_USAGE_IMMUTABLE/);
  assert.equal(db.sqlite.prepare('SELECT total_minor FROM sky_cloud_monthly_invoices').get().total_minor, 100);
});

void test('D1 restored-schema export preserves all definitions without exporting application rows or migration receipts', t => {
  const original = new DatabaseSync(':memory:'), restored = new DatabaseSync(':memory:');
  t.after(() => { original.close(); restored.close(); });
  applySourceSandboxSchema(original);
  restored.exec(sourceSandboxRestoreSql());
  const definitions = database => database.prepare(`SELECT type,name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type,name`).all();
  assert.deepEqual(definitions(restored), definitions(original));
  const tables = restored.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`).all();
  assert.ok(tables.some(({ name }) => name === 'agent_delegations'));
  for (const { name } of tables) {
    assert.ok(!['d1_migrations', '__drizzle_migrations', 'local_sandbox_migrations'].includes(name));
    assert.equal(restored.prepare(`SELECT COUNT(*) AS count FROM "${name.replaceAll('"', '""')}"`).get().count, 0, name);
  }
});

void test('D1 restore statements preserve complete triggers and match the SQL export', t => {
  const database = new DatabaseSync(':memory:'); t.after(() => database.close());
  const statements = sourceSandboxRestoreStatements();
  assert.equal(statements.map(sql => sql + ';').join('\n'), sourceSandboxRestoreSql());
  assert.ok(statements.some(sql => /CREATE TRIGGER[\s\S]+BEGIN[\s\S]+;[\s\S]+END/i.test(sql)));
  for (const sql of statements) database.prepare(sql).run();
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM agent_delegations').get().count, 0);
  assert.ok(database.prepare("SELECT 1 FROM sqlite_master WHERE name='sky_cloud_monthly_item_no_update' AND type='trigger'").get());
});
