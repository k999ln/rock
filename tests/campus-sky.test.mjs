import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { mcpPlanStore } from '../lib/sky-mcp-plan.ts';
import { CAMPUS_IDS, campusTagLaunchDestination, safeRelativeCampusDestination } from '../lib/campus.ts';
import { catalog } from '../lib/catalog.ts';
import {
  buildCampusBrief,
  CAMPUS_TASK_EXAMPLES,
  CAMPUS_TOOL_STARTERS,
  findCampus,
  campusSkyPath,
} from '../lib/campus-sky.ts';

function fixture(t) {
  const sql = new DatabaseSync(':memory:');
  t.after(() => sql.close());
  for (const name of readdirSync('drizzle')
    .filter((name) => name.endsWith('.sql'))
    .sort())
    sql.exec(readFileSync(`drizzle/${name}`, 'utf8'));
  const db = {
    prepare(text) {
      const stmt = sql.prepare(text);
      let args = [];
      return {
        bind(...values) {
          args = values;
          return this;
        },
        async first() {
          return stmt.get(...args) ?? null;
        },
        async all() {
          return { results: stmt.all(...args) };
        },
        async run() {
          return { meta: stmt.run(...args) };
        },
      };
    },
  };
  function profile(user, campus, affiliation = 'student', verified = true) {
    sql
      .prepare(`INSERT INTO sky_campus_profiles (id,user_id,campus_id,handle,display_name,affiliation,affiliation_status,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(
        crypto.randomUUID(),
        user,
        campus,
        user,
        user,
        affiliation,
        verified ? 'domain_verified' : 'self_declared',
        '2026-10-12',
        '2026-10-12',
      );
  }
  return { sql, profile, plan: (user) => mcpPlanStore(db, user) };
}
const key = (index) => `${'a'.repeat(64)}:server-${index}`;
const fill = (plan, count) =>
  Promise.all(
    Array.from({ length: count }, (_, i) =>
      plan.reserve(key(i), `Server ${i}`),
    ),
  );

void test('general quota is atomic, idempotent, account scoped and reusable after disconnect', async (t) => {
  const { plan } = fixture(t);
  const a = plan('a'),
    b = plan('b');
  const results = await Promise.allSettled(
    Array.from({ length: 8 }, (_, i) => a.reserve(key(i), 'Server')),
  );
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 5);
  assert.equal(
    results.filter((r) => r.status === 'rejected' && r.reason.status === 402)
      .length,
    3,
  );
  assert.equal((await a.reserve(key(0), 'Renamed')).used, 5);
  assert.equal((await b.reserve(key(0), 'Other owner')).used, 1);
  await b.release(key(1));
  assert.equal((await a.read()).used, 5);
  await a.release(key(0));
  assert.equal((await a.reserve(key(6), 'Sixth')).used, 5);
  assert.equal((await a.read()).paidExpansionAvailable, false);
});

void test('each of the five universities grants exactly six slots only with a verified student profile', async (t) => {
  const { profile, plan } = fixture(t);
  for (const campus of CAMPUS_IDS) {
    profile(campus, campus);
    const store = plan(campus);
    await fill(store, 6);
    assert.equal((await store.read()).freeLimit, 6);
    await assert.rejects(
      store.reserve(key(6), 'Seventh'),
      (error) => error.status === 402,
    );
  }
  profile('unverified', 'nyu', 'student', false);
  profile('staff', 'fit', 'staff', true);
  assert.equal((await plan('unverified').read()).freeLimit, 5);
  assert.equal((await plan('staff').read()).freeLimit, 5);
  assert.equal((await plan('tag-only-user').read()).freeLimit, 5);
});

void test('loss of student proof keeps existing slots, permits disconnect, and blocks expansion', async (t) => {
  const { profile, plan, sql } = fixture(t);
  profile('student', 'nyu');
  const store = plan('student');
  await fill(store, 6);
  sql
    .prepare(
      "UPDATE sky_campus_profiles SET affiliation_status = 'self_declared' WHERE user_id = 'student'",
    )
    .run();
  assert.equal((await store.read()).freeLimit, 5);
  assert.equal((await store.reserve(key(0), 'Existing')).used, 6);
  await assert.rejects(
    store.reserve(key(9), 'New'),
    (error) => error.status === 402,
  );
  await store.release(key(0));
  await store.release(key(1));
  assert.equal((await store.reserve(key(9), 'Replacement')).used, 5);
});

void test('university entry allowlist and tailored brief preserve input without creating an AI claim', () => {
  for (const id of CAMPUS_IDS) {
    assert.equal(findCampus(id).id, id);
    assert.equal(CAMPUS_TASK_EXAMPLES[id].length, 3);
    assert.equal(CAMPUS_TOOL_STARTERS[id].length, 3);
    assert.equal(new Set(CAMPUS_TOOL_STARTERS[id].map((tool) => tool.id)).size, 3);
    for (const tool of CAMPUS_TOOL_STARTERS[id]) {
      assert.equal(catalog.find((entry) => entry.id === tool.id)?.status, 'ready');
      assert.ok(tool.label && tool.use);
    }
    assert.ok(CAMPUS_TASK_EXAMPLES[id].every((example) => example.label && example.prompt.length > 40 && example.prompt.length <= 2000));
    assert.equal(
      safeRelativeCampusDestination(campusSkyPath(id)),
      `/sky/campus/${id}`,
    );
    assert.equal(
      safeRelativeCampusDestination(`/sky/campus/${id}/hub?tag=${id}-0001`),
      `/sky/campus/${id}/hub?tag=${id}-0001`,
    );
    assert.equal(
      campusTagLaunchDestination({ campusId: id, mode: 'sky', destination: `/sky/campus/${id}?tag=${id}-0001` }),
      `/sky/campus/${id}/hub?tag=${id}-0001`,
    );
    assert.equal(
      campusTagLaunchDestination({ campusId: id, mode: 'sky', destination: `/sky/campus/${id}/hub?tag=${id}-0002` }),
      `/sky/campus/${id}/hub?tag=${id}-0002`,
    );
    const brief = buildCampusBrief(id, [
      ' My idea ',
      'My evidence',
      'My next step',
    ]);
    assert.match(brief, /My idea/);
    assert.match(brief, /My evidence/);
    assert.ok(
      buildCampusBrief(id, ['a'.repeat(500), 'b'.repeat(500), 'c'.repeat(500)])
        .length < 2000,
    );
    assert.throws(() => buildCampusBrief(id, ['a', '', 'c']));
  }
  assert.equal(findCampus('constructor'), null);
  assert.equal(campusTagLaunchDestination({ campusId: 'nyu', mode: 'creative', destination: '/campus?campus=nyu' }), '/campus?campus=nyu');
  for (const path of [
    '//evil.example/campus',
    '/campus-evil',
    '/sky/campus/unknown',
    '/sky/campus/nyu/../../admin',
    '/sky/campus/nyu/hub/extra',
  ])
    assert.throws(() => safeRelativeCampusDestination(path));
});
