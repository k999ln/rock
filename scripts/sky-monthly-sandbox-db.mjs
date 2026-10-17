import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
export function openMonthlySandboxDatabase(path = ':memory:') {
  const sqlite = new DatabaseSync(path);
  sqlite.exec('PRAGMA foreign_keys=ON');
  sqlite.exec('CREATE TABLE IF NOT EXISTS local_sandbox_migrations(name TEXT PRIMARY KEY)');
  for (const name of readdirSync(new URL('../drizzle/', import.meta.url)).filter(name => name.endsWith('.sql') && !name.startsWith('._')).sort()) {
    if (sqlite.prepare('SELECT name FROM local_sandbox_migrations WHERE name=?').get(name)) continue;
    sqlite.exec('BEGIN IMMEDIATE');
    try {
      sqlite.exec(readFileSync(new URL(`../drizzle/${name}`, import.meta.url), 'utf8'));
      sqlite.prepare('INSERT INTO local_sandbox_migrations(name) VALUES(?)').run(name);
      sqlite.exec('COMMIT');
    } catch(error) { sqlite.exec('ROLLBACK'); throw error; }
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
