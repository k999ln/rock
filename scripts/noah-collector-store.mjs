import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

export const COLLECTOR_LEASE_MS = 180_000;
export function writeCollectorJson(path, value) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temp = `${path}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temp, JSON.stringify(value), { mode: 0o600, flag: 'wx' });
    renameSync(temp, path);
  } finally { rmSync(temp, { force: true }); }
}

/** Local-only metadata/lease. Product tables are the unchanged canonical migrations. */
export function openCollectorStore(directory, { now = Date.now } = {}) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const sql = new DatabaseSync(join(directory, 'intake.sqlite'));
  sql.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;');
  sql.exec('CREATE TABLE IF NOT EXISTS _noah_collector_lock(id INTEGER PRIMARY KEY CHECK(id=1),owner TEXT,expires_at INTEGER NOT NULL); INSERT OR IGNORE INTO _noah_collector_lock VALUES(1,NULL,0);');
  const token = randomUUID();
  if (sql.prepare('UPDATE _noah_collector_lock SET owner=?,expires_at=? WHERE id=1 AND expires_at<=?').run(token, now() + COLLECTOR_LEASE_MS, now()).changes !== 1) {
    sql.close(); throw Error('collector_already_running');
  }
  const close = () => {
    try { sql.prepare('UPDATE _noah_collector_lock SET owner=NULL,expires_at=0 WHERE owner=?').run(token); }
    finally { sql.close(); }
  };
  try {
    // An old noah-local-patrol database can be copied here while stopped.
    const discovery = ['noah_discovery_sources', 'noah_discovery_candidates', 'noah_discovery_versions'];
    const found = discovery.filter(name => sql.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
    if (found.length && found.length !== discovery.length) throw Error('collector_incomplete_schema');
    const migrations = [
      ...(found.length ? [] : ['0041_noah_discovery']),
      '0043_noah_runner', '0044_noah_intake', '0047_noah_connections', '0048_noah_asks', '0049_noah_connections_connecting',
    ];
    sql.exec('BEGIN');
    try {
      for (const name of migrations) sql.exec(readFileSync(new URL(`../drizzle/${name}.sql`, import.meta.url), 'utf8'));
      sql.exec('COMMIT');
    } catch (error) { sql.exec('ROLLBACK'); throw error; }
  } catch (error) { close(); throw error; }
  function assertLease() {
    if (!sql.prepare('SELECT 1 FROM _noah_collector_lock WHERE id=1 AND owner=? AND expires_at>?').get(token, now())) throw Error('collector_lease_lost');
  }
  const db = {
    prepare(query) {
      const statement = {
        query, args: [],
        bind(...args) { return { ...statement, args }; },
        async first() { assertLease(); return sql.prepare(query).get(...this.args) ?? null; },
        async all() { assertLease(); return { results: sql.prepare(query).all(...this.args) }; },
        async run() { assertLease(); return { meta: { changes: Number(sql.prepare(query).run(...this.args).changes) } }; },
      };
      return statement;
    },
    async batch(statements) {
      assertLease(); sql.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) {
          const read = /^\s*SELECT\b/iu.test(statement.query) || (/^\s*WITH\b/iu.test(statement.query) && !/\b(?:INSERT|UPDATE|DELETE|REPLACE)\b/iu.test(statement.query));
          results.push(read ? { ...(await statement.all()), meta: { changes: 0 } } : await statement.run());
        }
        sql.exec('COMMIT'); return results;
      } catch (error) { sql.exec('ROLLBACK'); throw error; }
    },
  };
  return { sql, db, close, assertLease,
    renew() {
      if (sql.prepare('UPDATE _noah_collector_lock SET expires_at=? WHERE owner=? AND expires_at>?').run(now() + COLLECTOR_LEASE_MS, token, now()).changes !== 1) throw Error('collector_lease_lost');
    },
  };
}

export function collectorCounts(sql) {
  return {
    registry: sql.prepare('SELECT COUNT(*) AS total FROM noah_intake_candidates').get().total,
    active: sql.prepare("SELECT COUNT(*) AS total FROM noah_intake_candidates WHERE state='active'").get().total,
    families: sql.prepare('SELECT COUNT(*) AS total FROM noah_intake_families WHERE hidden_at IS NULL AND withdrawn_at IS NULL').get().total,
    handshake: sql.prepare('SELECT COUNT(*) AS total FROM noah_intake_checks WHERE level>=1').get().total,
    listed: sql.prepare('SELECT COUNT(*) AS total FROM noah_intake_families WHERE listed=1 AND hidden_at IS NULL AND withdrawn_at IS NULL').get().total,
    unchecked: sql.prepare("SELECT COUNT(*) AS total FROM noah_intake_checks WHERE result='unchecked'").get().total,
    discovery: sql.prepare("SELECT provider,COUNT(*) AS total FROM noah_discovery_candidates WHERE state='active' GROUP BY provider ORDER BY provider").all(),
  };
}

export function collectorSources(sql) {
  return [
    ...sql.prepare('SELECT id,last_success_at,next_run_at,error_code,failure_count,sweep_started_at FROM noah_intake_sources ORDER BY id').all(),
    ...sql.prepare('SELECT id,last_success_at,next_run_at,error_code,failure_count,NULL AS sweep_started_at FROM noah_discovery_sources ORDER BY id').all(),
  ];
}

export function readCollectorStatus(directory, now = Date.now()) {
  const state = JSON.parse(readFileSync(join(directory, 'status.json'), 'utf8'));
  const sql = new DatabaseSync(join(directory, 'intake.sqlite'), { readOnly: true });
  try {
    const lock = sql.prepare('SELECT owner,expires_at FROM _noah_collector_lock WHERE id=1').get();
    return { ...state, running: !!lock?.owner && lock.expires_at > now };
  } finally { sql.close(); }
}
