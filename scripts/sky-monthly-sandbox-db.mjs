import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
/** Synthetic restored-schema precondition, for local test databases only.
 * Existing-production ALTER 0020 is intentionally not an empty-DB bootstrap.
 * Neither this initializer nor its historical fixture is a production migration.
 */
export function applySourceSandboxSchema(sqlite, { persistMigrationJournal = false } = {}) {
  // Generic store fixtures count every application table. Keep this test-only
  // bookkeeping outside sqlite_master; file-backed monthly sandboxes opt in.
  sqlite.exec(`CREATE ${persistMigrationJournal ? '' : 'TEMP '}TABLE IF NOT EXISTS local_sandbox_migrations(name TEXT PRIMARY KEY)`);
  // Exercise the retained Sites deployment lineage; retired SQL files are not ordered migrations.
  const migrationRoot=new URL('../drizzle-main/',import.meta.url);
  const entries=JSON.parse(readFileSync(new URL('meta/_journal.json',migrationRoot),'utf8')).entries;
  for (const name of entries.map(entry=>`${entry.tag}.sql`)) {
    if (sqlite.prepare('SELECT name FROM local_sandbox_migrations WHERE name=?').get(name)) continue;
    if(name==='0020_main_legacy_columns.sql'&&!sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='agent_delegations'").get()){
      // Existing-production-only ALTERs precede the idempotent 0021 full-schema bridge.
      // A fresh synthetic database starts with that bridge, which includes these columns.
      sqlite.prepare('INSERT INTO local_sandbox_migrations(name) VALUES(?)').run(name);continue;
    }
    sqlite.exec('BEGIN IMMEDIATE');
    try {
      sqlite.exec(readFileSync(new URL(name, migrationRoot), 'utf8'));
      sqlite.prepare('INSERT INTO local_sandbox_migrations(name) VALUES(?)').run(name);
      sqlite.exec('COMMIT');
    } catch(error) { sqlite.exec('ROLLBACK'); throw error; }
  }
  sqlite.exec('BEGIN IMMEDIATE');
  try {
    sqlite.exec(readFileSync(new URL('../tests/fixtures/sky-monthly-historical-schema.sql', import.meta.url), 'utf8'));
    sqlite.exec('COMMIT');
  } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
}
export function openMonthlySandboxDatabase(path = ':memory:') {
  const sqlite = new DatabaseSync(path);
  try { sqlite.exec('PRAGMA foreign_keys=ON'); applySourceSandboxSchema(sqlite, { persistMigrationJournal: true }); }
  catch (error) { sqlite.close(); throw error; }
  class Statement {
    constructor(sql, values = []) { this.sql = sql; this.values = values; }
    bind(...values) { return new Statement(this.sql, values); }
    async first() { return sqlite.prepare(this.sql).get(...this.values) ?? null; }
    async all() { return { success: true, results: sqlite.prepare(this.sql).all(...this.values) }; }
    run() { return { success: true, meta: { changes: Number(sqlite.prepare(this.sql).run(...this.values).changes) } }; }
  }
  return { sqlite, prepare: sql => new Statement(sql), batch(statements) {
    sqlite.exec('BEGIN IMMEDIATE');
    try { const results = statements.map(s => s.run()); sqlite.exec('COMMIT'); return Promise.resolve(results); }
    catch(error) { sqlite.exec('ROLLBACK'); return Promise.reject(error); }
  }, close: () => sqlite.close() };
}

/** Build an empty local restored-schema fixture for real D1 integration tests.
 * No application rows, filename migration receipts, owner data or production
 * migration are exported. Published-main upgrade acceptance is tested separately.
 */
export function sourceSandboxRestoreStatements() {
  const database = new DatabaseSync(':memory:');
  try {
    applySourceSandboxSchema(database);
    const definitions = database.prepare(`SELECT type,name,sql FROM sqlite_master
      WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'
      ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END,name`).all();
    return definitions.map(({ sql }) => sql.replace(/;\s*$/, ''));
  } finally { database.close(); }
}

export function sourceSandboxRestoreSql() {
  return sourceSandboxRestoreStatements().map(sql => sql + ';').join('\n');
}
