import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const bridge = read('drizzle/0017_primary_quality_compatibility.sql');
const journal = JSON.parse(read('drizzle/meta/_journal.json'));
const prior = journal.entries.slice(0, 17).map(({ tag }) => read(`drizzle/${tag}.sql`));
const chunks = (sql) => sql.split('--> statement-breakpoint').map((part) => part.trim()).filter(Boolean);
// An explicit transport model, not a claim that the undisclosed hosted parser uses this code.
const lineSplit = (sql) => sql.replace(/^\s*--[^\n]*$/gm, '').split(/;\s*\n/).map((part) => part.trim()).filter(Boolean);
const triggerParts = chunks(bridge).filter((sql) => /^CREATE TRIGGER\b/.test(sql));

void test('each complete bridge trigger occupies one transport line and no statement is lost', () => {
  assert.equal(triggerParts.length, 47);
  for (const sql of triggerParts) {
    assert.doesNotMatch(sql, /[\r\n]/);
    assert.match(sql, /\bBEGIN\b.*\bEND;$/);
  }
  assert.equal(chunks(bridge).length, 201);
  assert.equal(lineSplit(bridge).length, 201);
});

void test('a newline-semicolon importer reproduces incomplete input for the unchanged original multiline guard', () => {
  const db = new DatabaseSync(':memory:');
  try {
    for (const sql of prior) db.exec(sql);
    for (const sql of chunks(bridge)) if (!/^CREATE TRIGGER\b/.test(sql)) db.exec(sql);
    const original = read('tests/fixtures/site-migration-reference/primary/0025_a2a_shared_budget_reservations.sql');
    const guard = chunks(original).find((sql) => sql.includes('CREATE TRIGGER') && sql.includes('a2a_budget_release_before_external_send'));
    assert.ok(guard, 'the immutable primary source must contain the actual deployed guard');
    assert.throws(() => db.exec(lineSplit(guard)[0] + ';'), /incomplete input/);
    const complete = triggerParts.find((sql) => sql.includes('a2a_budget_release_before_external_send'));
    db.exec(complete);
    assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name='a2a_budget_release_before_external_send'").get());
  } finally { db.close(); }
});

void test('real D1 imports complete formatted statements and retains all guards', async (t) => {
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: 'export default { fetch() { return new Response("fixture"); } }', compatibilityDate: '2026-08-18', d1Databases: ['DB'], host: '127.0.0.1', port: 0 }));
  t.after(() => mf.dispose());
  const db = await mf.getD1Database('DB');
  for (const raw of prior) for (const sql of chunks(raw)) await db.prepare(sql).run();
  const oldTriggers = (await db.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type='trigger'").first()).count;
  await db.batch(lineSplit(bridge).map((sql) => db.prepare(sql + ';')));
  assert.equal((await db.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'").first()).count, 90);
  assert.equal((await db.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type='trigger'").first()).count, oldTriggers + 47);
  await assert.rejects(() => db.prepare("INSERT INTO marketplace_approvals VALUES('orphan','missing','owner','digest','scope',1)").run(), /marketplace approval relation mismatch/);
  assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results, []);
});


// Model the former BEGIN-only splitter condition linked from workers-sdk#4326.
// END) stays inside the CASE expression; END; terminates the trigger compound.
// This is a regression model, not a claim about the undisclosed current native service.
function legacyCompoundSplit(sql) {
  let statement = '', depth = 0;
  const statements = [];
  const input = sql.replace(/^\s*--[^\n]*$/gm, '');
  const segments = input.match(/'(?:''|[^'])*'|"(?:""|[^"])*"|`(?:``|[^`])*`|[\s\S]/g) ?? [];
  for (const segment of segments) {
    if (depth && /\sEND[;\s]$/.test(statement + segment)) depth--;
    if (segment === ';' && depth === 0) { statements.push(statement); statement = ''; }
    else statement += segment;
    if (/\sBEGIN\s$/.test(statement)) depth++;
  }
  if (statement.trim()) statements.push(statement);
  return statements.map((part) => part.trim()).filter(Boolean);
}

void test('all20 CASE guards use the documented parenthesized D1 input shape without changing semantics', () => {
  assert.doesNotMatch(bridge, /SELECT\s+CASE\b/);
  assert.equal((bridge.match(/SELECT \(CASE\b/g) ?? []).length, 20);
  for (const wrapped of [false, true]) {
    const db = new DatabaseSync(':memory:');
    try {
      db.exec('CREATE TABLE guard_probe(value INTEGER)');
      const expression = "CASE WHEN NEW.value < 0 THEN RAISE(ABORT, 'negative fixture value') END";
      db.exec(`CREATE TRIGGER fixture_guard BEFORE INSERT ON guard_probe BEGIN SELECT ${wrapped ? `(${expression})` : expression}; END;`);
      assert.throws(() => db.exec('INSERT INTO guard_probe VALUES(-1)'), /negative fixture value/);
      for (const value of [null, 0, 1]) db.prepare('INSERT INTO guard_probe VALUES(?)').run(value);
      assert.deepEqual(db.prepare('SELECT value FROM guard_probe ORDER BY rowid').all().map(({ value }) => value), [null, 0, 1]);
    } finally { db.close(); }
  }
});

void test('known D1 CASE-END splitting failure is reproduced and the full wrapped bridge stays complete', () => {
  // https://github.com/cloudflare/workers-sdk/issues/4727 and /issues/4326
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('CREATE TABLE guard_probe(value INTEGER)');
    const original = "CREATE TRIGGER fixture_guard BEFORE INSERT ON guard_probe BEGIN SELECT CASE WHEN NEW.value < 0 THEN RAISE(ABORT, 'negative fixture value') END; END;";
    assert.throws(() => db.exec(legacyCompoundSplit(original)[0] + ';'), /incomplete input/);
    const wrapped = original.replace('SELECT CASE', 'SELECT (CASE').replace(' END;', ' END);');
    assert.equal(legacyCompoundSplit(wrapped).length, 1);
    db.exec(legacyCompoundSplit(wrapped)[0] + ';');
    assert.throws(() => db.exec('INSERT INTO guard_probe VALUES(-1)'), /negative fixture value/);
    for (const raw of prior) db.exec(raw);
    const transported = legacyCompoundSplit(bridge);
    assert.equal(transported.length, 201);
    for (const sql of transported) db.exec(sql + ';');
    assert.equal(db.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type='trigger'").get().count, 57);
  } finally { db.close(); }
});
