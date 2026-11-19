import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
export function eveAgentFixture(t) {
  const sqlite = new DatabaseSync(':memory:'); t.after(() => sqlite.close());
  for (const f of readdirSync(new URL('../../drizzle/', import.meta.url)).filter(f => f.endsWith('.sql') && !f.startsWith('._')).sort()) sqlite.exec(readFileSync(new URL('../../drizzle/' + f, import.meta.url), 'utf8'));
  const prepare = (query, args = []) => ({ bind(...values) { return prepare(query, values); }, async first() { return sqlite.prepare(query).get(...args) ?? null; }, async all() { return { results: sqlite.prepare(query).all(...args) }; }, async run() { return { meta: { changes: Number(sqlite.prepare(query).run(...args).changes) } }; } });
  const db = { prepare, async batch(items) { sqlite.exec('BEGIN IMMEDIATE'); try { const results = []; for (const item of items) results.push(await item.run()); sqlite.exec('COMMIT'); return results; } catch (e) { sqlite.exec('ROLLBACK'); throw e; } } };
  return { db, sqlite, keys: { current: 'fixture', keys: { fixture: '12'.repeat(32) } } };
}
