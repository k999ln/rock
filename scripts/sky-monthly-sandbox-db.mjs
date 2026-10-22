import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
export function openMonthlySandboxDatabase(path = ':memory:') {
  const sqlite = new DatabaseSync(path);
  sqlite.exec('PRAGMA foreign_keys=ON');
  sqlite.exec('CREATE TABLE IF NOT EXISTS local_sandbox_migrations(name TEXT PRIMARY KEY)');
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
  // Test/Sandbox-only bootstrap from retained Drizzle metadata. These ten tables
  // predate the Sites bridge and are absent from its migration payload. This is
  // not a production migration and never changes the hosted D1 database.
  const snapshot=JSON.parse(readFileSync(new URL('../drizzle-main/meta/0006_snapshot.json',import.meta.url),'utf8'));
  const quote=value=>'"'+value.replaceAll('"','""')+'"';
  for(const name of ['sky_recurring_contracts','sky_recurring_charges','sky_cloud_monthly_invoices','sky_cloud_monthly_items','sky_cloud_monthly_events','sky_hosted_monthly_events','sky_hosted_monthly_tests','sky_monthly_sandbox_invoices','sky_monthly_sandbox_quotes','sky_monthly_sandbox_usage']){
    const table=snapshot.tables[name];if(!table)throw Error('Retained Sandbox schema missing: '+name);
    const fields=Object.values(table.columns).map(c=>`${quote(c.name)} ${c.type}${c.primaryKey?' PRIMARY KEY':''}${c.notNull?' NOT NULL':''}${c.default!==undefined?' DEFAULT '+c.default:''}`);
    for(const constraint of Object.values(table.compositePrimaryKeys??{}))fields.push(`PRIMARY KEY (${constraint.columns.map(quote).join(',')})`);
    for(const constraint of Object.values(table.uniqueConstraints??{}))fields.push(`UNIQUE (${constraint.columns.map(quote).join(',')})`);
    for(const check of Object.values(table.checkConstraints??{}))fields.push(`CONSTRAINT ${quote(check.name)} CHECK (${check.value})`);
    for(const fk of Object.values(table.foreignKeys??{}))fields.push(`FOREIGN KEY (${fk.columnsFrom.map(quote).join(',')}) REFERENCES ${quote(fk.tableTo)} (${fk.columnsTo.map(quote).join(',')}) ON UPDATE ${fk.onUpdate} ON DELETE ${fk.onDelete}`);
    sqlite.exec(`CREATE TABLE IF NOT EXISTS ${quote(name)} (${fields.join(',')})`);
    for(const index of Object.values(table.indexes??{}))sqlite.exec(`CREATE ${index.isUnique?'UNIQUE ':''}INDEX IF NOT EXISTS ${quote(index.name)} ON ${quote(name)} (${index.columns.map(quote).join(',')})${index.where?' WHERE '+index.where:''}`);
  }
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
