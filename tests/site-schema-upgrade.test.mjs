import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { drizzle } from 'drizzle-orm/d1';
import { migrate } from 'drizzle-orm/d1/migrator';

const root = new URL('../', import.meta.url);
const reference = new URL('./fixtures/site-migration-reference/', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('manifest.json', reference), 'utf8'));
const digest = (value) => createHash('sha256').update(value).digest('hex');
const bridgeName = '0017_primary_quality_compatibility.sql';
const bridge = read(`drizzle/${bridgeName}`);
const priorNames = manifest.liveJournal.entries.map(({ tag }) => `${tag}.sql`);
const objects = (db) => db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name").all();
const applyPrior = (db) => { for (const name of priorNames) db.exec(read(`drizzle/${name}`)); };
// Preserve quoted literals/identifiers exactly while accepting transport-only whitespace.
const sqlTokens = (sql) => sql.match(/'(?:''|[^'])*'|"(?:""|[^"])*"|`(?:``|[^`])*`|[^\s'"`]+/g);


void test('Site applied SQL, snapshots, and journal prefix stay byte-for-byte immutable', () => {
  for (const { path, sha256 } of manifest.liveFiles) {
    if (path === 'drizzle/meta/_journal.json') continue;
    assert.equal(digest(read(path)), sha256, path);
  }
  const journal = JSON.parse(read('drizzle/meta/_journal.json'));
  assert.deepEqual(journal.entries.slice(0, 17), manifest.liveJournal.entries);
  assert.equal(journal.entries[17].tag + '.sql', bridgeName);
  const snapshot = JSON.parse(read('drizzle/meta/0017_snapshot.json'));
  assert.equal(snapshot.prevId, JSON.parse(read('drizzle/meta/0016_snapshot.json')).id);
  assert.doesNotMatch(bridge, /\b(?:DROP|ALTER|DELETE|INSERT|UPDATE)\s+(?:TABLE|FROM|INTO)\b/i);
  assert.equal(readdirSync(new URL('../drizzle/', import.meta.url)).filter((name) => name.endsWith('.sql')).length, 18);
});

void test('Site bridge retains every live definition and all final primary guards/checks', () => {
  const site = new DatabaseSync(':memory:');
  const primary = new DatabaseSync(':memory:');
  try {
    applyPrior(site);
    const before = objects(site);
    for (const { path: name, sha256: hash } of manifest.primaryFiles) {
      const sql = readFileSync(new URL(`primary/${name}`, reference), 'utf8');
      assert.equal(digest(sql), hash, name);
      primary.exec(sql);
    }
    site.exec(bridge);
    const after = new Map(objects(site).map((row) => [row.name, row]));
    for (const row of before) assert.deepEqual(after.get(row.name), row);
    const priorSet = new Set(before.map((row) => row.name));
    for (const row of objects(primary)) if (!priorSet.has(row.name)) {
      const actual = after.get(row.name);
      if (row.type === 'trigger') {
        assert.deepEqual({ ...actual, sql: sqlTokens(actual.sql) }, { ...row, sql: sqlTokens(row.sql) });
        assert.doesNotMatch(actual.sql, /[\r\n]/, `${row.name}: preserve the whole trigger at a hosted statement boundary`);
      } else assert.deepEqual(actual, row);
    }
    assert.equal([...after.values()].filter((row) => row.type === 'table').length, 90);
    assert.deepEqual(site.prepare('PRAGMA foreign_key_check').all(), []);
    assert.equal(site.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
    assert.throws(() => site.exec("INSERT INTO sky_provider_connections VALUES('fixture','instagram','ready','{}',NULL,1,1,0)"), /CHECK/);
    assert.throws(() => site.exec("INSERT INTO marketplace_approvals VALUES('orphan','missing','owner','digest','scope',1)"), /marketplace approval relation mismatch/);
    assert.ok(after.has('a2a_budget_reservation_before_insert'));
    assert.ok(after.has('remote_ai_text_reserve_guard'));
    assert.ok(after.has('remote_ai_text_dispatch_guard'));
  } finally { site.close(); primary.close(); }
});

function seedLegacy(db) {
  // Synthetic raw/financial records, never copied from a customer database.
  for (const table of manifest.preservedLiveTables.filter((name) => name.startsWith('csv_'))) {
    const columns = db.prepare(`PRAGMA table_info("${table}")`).all();
    const values = columns.map((column) => {
      const name = column.name;
      if (name === 'id' && /INT/i.test(column.type)) return 123;
      if (name === 'id') return table === 'csv_jobs' ? 'saved-csv' : `saved-${table}`;
      if (name === 'job_id') return 'saved-csv';
      if (name === 'user_id') return 'fixture-owner';
      if (name === 'status') return 'fixture-retained';
      if (name.endsWith('_json')) return '{"synthetic":"retained"}';
      if (name.endsWith('_key')) return `csv/fixture-owner/saved-csv/lease-1/${name}`;
      if (name === 'revision') return 7;
      if (/INT/i.test(column.type)) return 123;
      if (!column.notnull) return null;
      return `synthetic-${name}`;
    });
    db.prepare(`INSERT INTO "${table}" (${columns.map(({ name }) => `"${name}"`).join(',')}) VALUES(${columns.map(() => '?').join(',')})`).run(...values);
  }
  db.exec(`INSERT INTO fund_plans VALUES('fixture-owner','{"saved":true}','2026-10-12');
    INSERT INTO work_jobs VALUES('saved-work','fixture-owner','{"steps":["keep"]}',7,'2026-10-12');
    INSERT INTO book_records VALUES('saved-book','fixture-owner','revenue',888,'manual','2026-10-12',NULL,1);
    INSERT INTO sky_code_repositories VALUES('saved-repo','fixture-owner',1,'saved-commit',0,123);
    INSERT INTO sky_code_commits VALUES('saved-commit','saved-repo',1,NULL,'{"code":"retained"}',123);`);
}

void test('saved v49 CSV/payment/delivery/account and general records survive the additive upgrade unchanged', () => {
  const db = new DatabaseSync(':memory:');
  try {
    applyPrior(db); seedLegacy(db);
    const before = new Map(manifest.preservedLiveTables.map((name) => [name, db.prepare(`SELECT * FROM "${name}"`).all()]));
    db.exec(bridge);
    for (const [name, rows] of before) assert.deepEqual(db.prepare(`SELECT * FROM "${name}"`).all(), rows, name);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
    assert.throws(() => db.exec("UPDATE sky_code_commits SET payload='changed'"), /immutable/);
  } finally { db.close(); }
});

void test('real D1 resumes after the applied v49 journal and a second migration pass is inert', async (t) => {
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: 'export default { fetch() { return new Response("fixture"); } }', compatibilityDate: '2026-08-18', d1Databases: ['DB'], r2Buckets: ['BUCKET'], host: '127.0.0.1', port: 0 }));
  t.after(() => mf.dispose());
  const db = await mf.getD1Database('DB');
  for (const name of priorNames) for (const sql of read(`drizzle/${name}`).split('--> statement-breakpoint').filter((sql) => sql.trim())) await db.prepare(sql).run();
  const bucket = await mf.getR2Bucket('BUCKET');
  const resultKey = 'csv/fixture-owner/saved-csv/lease-1/result_key';
  await bucket.put(resultKey, 'name,value\r\nsynthetic,retained\r\n');
  const legacy = new DatabaseSync(':memory:');
  const retained = new Map();
  try {
    applyPrior(legacy); seedLegacy(legacy);
    const tables = [...manifest.preservedLiveTables.filter((name) => name.startsWith('csv_')), 'fund_plans', 'work_jobs', 'book_records', 'sky_code_repositories', 'sky_code_commits'];
    for (const table of tables) {
      const rows = legacy.prepare(`SELECT * FROM "${table}"`).all();
      retained.set(table, rows.map((row) => ({ ...row })));
      for (const row of rows) await db.prepare(`INSERT INTO "${table}" (${Object.keys(row).map((name) => `"${name}"`).join(',')}) VALUES(${Object.keys(row).map(() => '?').join(',')})`).bind(...Object.values(row)).run();
    }
  } finally { legacy.close(); }
  await db.prepare('CREATE TABLE __drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric)').run();
  for (const entry of manifest.liveJournal.entries) await db.prepare('INSERT INTO __drizzle_migrations(hash,created_at) VALUES (?,?)').bind(digest(read(`drizzle/${entry.tag}.sql`)), entry.when).run();
  const folder = new URL('../drizzle/', import.meta.url).pathname;
  await migrate(drizzle(db), { migrationsFolder: folder });
  const before = (await db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE '_cf_%' ORDER BY name").all()).results;
  await migrate(drizzle(db), { migrationsFolder: folder });
  assert.deepEqual((await db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE '_cf_%' ORDER BY name").all()).results, before);
  for (const [table, rows] of retained) assert.deepEqual((await db.prepare(`SELECT * FROM "${table}"`).all()).results, rows, table);
  assert.equal(await (await bucket.get(resultKey)).text(), 'name,value\r\nsynthetic,retained\r\n');
  assert.equal((await db.prepare('SELECT count(*) AS count FROM __drizzle_migrations').first()).count, 18);
  assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results, []);
});
