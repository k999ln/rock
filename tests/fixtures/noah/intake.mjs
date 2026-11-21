import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createIntakeStore } from '../../../lib/noah-intake-store.ts';
export const NOW = Date.UTC(2026, 10, 20, 10);
export const entry = (i, change = {}, status = 'active') => ({ server: { name: `test.provider/agent-${i}`, title: `Agent ${i}`, description: 'Public registry fixture', version: '1.0.0', remotes: [{ type: 'streamable-http', url: `https://agent-${i}.example.com/mcp` }], ...change }, _meta: { 'io.modelcontextprotocol.registry/official': { status, updatedAt: new Date(NOW).toISOString() } } });
export const page = (entries, cursor = null) => Response.json({ servers: entries, metadata: { nextCursor: cursor } });
export function fixture(t, fetcher = async () => page([]), extra = {}) {
  const sql = new DatabaseSync(':memory:'); t.after(() => sql.close());
  // 家の端末の表（接続の表が指す）・取り込みの表・接続の表・依頼の表・後始末の索引。本番と同じ migration を、順に流す。
  for (const name of ['0043_noah_runner', '0044_noah_intake', '0047_noah_connections', '0048_noah_asks', '0049_noah_connections_connecting']) sql.exec(readFileSync(new URL(`../../../drizzle/${name}.sql`, import.meta.url), 'utf8'));
  // 成果の正本（Work）の表。大きな migration（0021）から、その表を作る文だけを、そのまま取り出して流す。
  sql.exec(/CREATE TABLE IF NOT EXISTS `work_jobs` \([^;]+\);/.exec(readFileSync(new URL('../../../drizzle/0021_sites_schema_convergence.sql', import.meta.url), 'utf8'))[0]);
  const batches = [], queries = [], hooks = {}; let clock = NOW;
  const db = {
    prepare(query) {
      const statement = {
        bind(...args) { if (args.length > 100) throw Error('D1 binding limit'); return { ...statement, args }; },
        query, args: [],
        async first() { queries.push(query); return sql.prepare(query).get(...this.args) ?? null; },
        async all() { queries.push(query); return { results: sql.prepare(query).all(...this.args) }; },
        async run() { queries.push(query); return { meta: { changes: Number(sql.prepare(query).run(...this.args).changes) } }; },
      }; return statement;
    },
    async batch(statements) {
      if (statements.length > 50) throw Error('D1 batch limit'); batches.push(statements.map(s => s.query));
      hooks.beforeBatch?.(statements); sql.exec('BEGIN');
      // D1 の batch は、読む文には行（results）を、書く文には変えた数（meta.changes）を返す。読む文は、SELECT と、書く語の無い WITH。
      const reads = (query) => /^\s*SELECT\b/i.test(query) || (/^\s*WITH\b/i.test(query) && !/\b(?:INSERT|UPDATE|DELETE|REPLACE)\b/i.test(query));
      const answer = async (statement) => (reads(statement.query) ? { ...(await statement.all()), meta: { changes: 0 } } : statement.run());
      try { const results = []; for (const statement of statements) { if (hooks.fail?.(statement.query)) throw Error('Synthetic batch failure'); results.push(await answer(statement)); } sql.exec('COMMIT'); return results; }
      catch (error) { sql.exec('ROLLBACK'); throw error; }
    },
  };
  const deps = { db, now: () => clock, fetcher: (...args) => fetcher(...args), ...extra };
  return { sql, db, deps, store: createIntakeStore(deps), batches, queries, hooks, advance: ms => { clock += ms; }, time: () => clock,
    source: () => sql.prepare('SELECT * FROM noah_intake_sources').get(), candidate: (i = 1) => sql.prepare('SELECT * FROM noah_intake_candidates WHERE external_key=?').get(`test.provider/agent-${i}`), check: (i = 1) => sql.prepare('SELECT * FROM noah_intake_checks WHERE candidate_id=?').get(`mcp-registry:test.provider/agent-${i}`),
  };
}
export function markListed(f, i, level = 1) {
  const id = `mcp-registry:test.provider/agent-${i}`;
  f.sql.prepare("UPDATE noah_intake_checks SET auth='none',level=?,result='ok',tools_sha256=?,l1_at=?,l2_at=?,form_tools=1,one_tap_tools=1,tool_count=2,checked_at=? WHERE candidate_id=?").run(level, 'a'.repeat(64), NOW, level === 2 ? NOW + i : null, NOW, id);
  f.sql.prepare("UPDATE noah_intake_families SET listed=1,level=?,l2_at=?,one_tap=1,shuffle=?,badge_hint='unverified' WHERE id=?").run(level, level === 2 ? NOW + i : null, i, id);
}
