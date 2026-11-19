import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import worker from '../worker/index.js';

const origin = 'https://avocadomini.example.test';
const migrations = readdirSync(new URL('../drizzle/', import.meta.url)).filter(name => name.endsWith('.sql')).sort()
  .map(name => readFileSync(new URL(`../drizzle/${name}`, import.meta.url), 'utf8'));
function database() {
  const sqlite = new DatabaseSync(':memory:');
  for (const sql of migrations) sqlite.exec(sql);
  return {
    sqlite,
    prepare(sql) {
      return {
        bind(...values) {
          const statement = sqlite.prepare(sql);
          return {
            async run() { const result = statement.run(...values); return { meta: { changes: result.changes } }; },
            async first() { return statement.get(...values) || null; },
            async all() { return { results: statement.all(...values) }; },
          };
        },
        async all() { return { results: sqlite.prepare(sql).all() }; },
      };
    },
  };
}
function environment(db, more = {}) { return { DB: db, PARTICIPATION_ABUSE_KEY: 'test-only-secret', ...more }; }
function submit(data, headers = {}) {
  return new Request(`${origin}/api/participation/submissions`, {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.1', ...headers },
    body: JSON.stringify({ kind: 'idea', category: 'play', title: 'Better room game', description: 'A cooperative game that makes movement easy to understand.', reviewConsent: true, ...data }),
  });
}

test('queue only opens with its own secret and migrated storage', async t => {
  const db = database(); t.after(() => db.sqlite.close());
  const unavailable = await worker.fetch(new Request(`${origin}/api/participation/availability`), environment(db, { PARTICIPATION_ABUSE_KEY: '' }));
  assert.deepEqual(await unavailable.json(), { open: false });
  const available = await worker.fetch(new Request(`${origin}/api/participation/availability`), environment(db));
  assert.deepEqual(await available.json(), { open: true, types: ['idea', 'game'] });
});

test('idea and game links are stored privately with a removal receipt', async t => {
  const db = database(); t.after(() => db.sqlite.close());
  const ideaResponse = await worker.fetch(submit({}), environment(db));
  assert.equal(ideaResponse.status, 201);
  const idea = await ideaResponse.json();
  assert.match(idea.id, /^[0-9a-f-]{36}$/);
  assert.equal(idea.removalCode.length, 72);
  const row = db.sqlite.prepare('SELECT * FROM mini_creator_submissions WHERE id = ?').get(idea.id);
  assert.equal(row.status, 'received');
  assert.equal(row.kind, 'idea');
  assert.equal(row.category, 'play');
  assert.equal(row.demo_url, null);
  assert.equal(JSON.stringify(row).includes(idea.removalCode), false);
  assert.equal(JSON.stringify(row).includes('203.0.113.1'), false);
  const gameResponse = await worker.fetch(submit({ kind: 'game', category: null, demoUrl: 'https://example.com/game', sourceUrl: 'https://github.com/example/game' }), environment(db));
  assert.equal(gameResponse.status, 201);
  const game = db.sqlite.prepare('SELECT kind, demo_url, source_url FROM mini_creator_submissions WHERE id = ?').get((await gameResponse.json()).id);
  assert.equal(game.kind, 'game');
  assert.equal(game.demo_url, 'https://example.com/game');
  assert.equal(game.source_url, 'https://github.com/example/game');
  const wrong = await worker.fetch(new Request(`${origin}/api/participation/submissions`, { method: 'DELETE', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ id: idea.id, removalCode: '0'.repeat(72) }) }), environment(db));
  assert.deepEqual(await wrong.json(), { removed: false });
  const removed = await worker.fetch(new Request(`${origin}/api/participation/submissions`, { method: 'DELETE', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ id: idea.id, removalCode: idea.removalCode }) }), environment(db));
  assert.deepEqual(await removed.json(), { removed: true });
  assert.equal(db.sqlite.prepare('SELECT id FROM mini_creator_submissions WHERE id = ?').get(idea.id), undefined);
});

test('same-origin, size, consent, game URL, and daily rate are enforced', async t => {
  const db = database(); t.after(() => db.sqlite.close());
  const env = environment(db);
  assert.equal((await worker.fetch(submit({}, { origin: 'https://other.example' }), env)).status, 403);
  assert.equal((await worker.fetch(submit({ reviewConsent: false }), env)).status, 400);
  assert.equal((await worker.fetch(submit({ kind: 'game', demoUrl: 'http://example.com/game' }), env)).status, 400);
  assert.equal((await worker.fetch(submit({ description: 'x'.repeat(5000) }), env)).status, 413);
  assert.equal((await worker.fetch(submit({ website: 'bot' }), env)).status, 400);
  assert.equal(db.sqlite.prepare('SELECT count(*) AS n FROM mini_creator_submissions').get().n, 0);
  for (let index = 0; index < 10; index += 1) assert.equal((await worker.fetch(submit({ title: `Idea number ${index}` }), env)).status, 201);
  assert.equal((await worker.fetch(submit({ title: 'One too many' }), env)).status, 429);
  assert.equal(db.sqlite.prepare('SELECT count(*) AS n FROM mini_creator_submissions').get().n, 10);
});
