import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { build } from 'esbuild';
const built = await build({ entryPoints: ['lib/campus-store.ts'], bundle: true, write: false, format: 'esm', platform: 'node' });
const { campusStore } = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
function fixture(t) {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  for (const name of readdirSync('drizzle').filter((name) => name.endsWith('.sql')).sort()) sqlite.exec(readFileSync('drizzle/' + name, 'utf8'));
  const db = { prepare(sql) {
    const statement = sqlite.prepare(sql); let args = [];
    return { bind(...values) { args = values; return this; },
      async first() { return statement.get(...args) ?? null; },
      async all() { return { success: true, results: statement.all(...args) }; },
      async run() { return { success: true, results: [], meta: statement.run(...args) }; } };
  }, async batch(statements) {
    sqlite.exec('BEGIN');
    try { const results = []; for (const statement of statements) results.push(await statement.all()); sqlite.exec('COMMIT'); return results; }
    catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  } };
  return { store: campusStore(db), sqlite };
}
const profile = (handle) => ({ campusId: 'nyu', handle, displayName: handle, affiliation: 'student', headline: '', bio: '', skills: [], interests: [], lookingFor: [], links: [], isPublic: true });
const post = { campusId: 'nyu', kind: 'project', title: 'Film project', summary: 'A student project', tags: [], details: {}, visibility: 'campus', startsAt: null, endsAt: null };

test('Campus item writes are owner scoped and anonymous readers only see public posts', async (t) => {
  const { store } = fixture(t);
  const item = await store.createItem('owner', post);
  assert.equal((await store.listItems('nyu', undefined, null)).length, 0);
  assert.equal((await store.listItems('nyu', undefined, 'viewer')).length, 1);
  await assert.rejects(store.updateItem('other', item.id, { ...post, visibility: 'public' }), /見つかりません/);
  await assert.rejects(store.archiveItem('other', item.id), /見つかりません/);
  await store.updateItem('owner', item.id, { ...post, visibility: 'public' });
  assert.equal((await store.listItems('nyu', undefined, null)).length, 1);
  await store.archiveItem('owner', item.id);
  assert.equal((await store.listItems('nyu', undefined, 'owner')).length, 0);
});

test('only the request recipient can accept a Campus collaboration and only its sender can remove it', async (t) => {
  const { store } = fixture(t);
  await store.upsertProfile('sender', profile('sender'), false);
  const recipient = await store.upsertProfile('recipient', profile('recipient'), false);
  const edge = await store.setEdge('sender', 'nyu', 'collaborator_request', 'profile', recipient.id, 'Let us collaborate');
  await assert.rejects(store.respondEdge('outsider', edge.id, 'accepted'), /見つかりません/);
  assert.equal((await store.respondEdge('recipient', edge.id, 'accepted')).status, 'accepted');
  await assert.rejects(store.removeEdge('recipient', edge.id), /見つかりません/);
  await store.removeEdge('sender', edge.id);
});

test('Campus tag controls and analytics stay private to their owner', async (t) => {
  const { store } = fixture(t);
  const [tag] = await store.registerTagBatch('owner', 'nyu', { prefix: 'nyu-library', start: 1, count: 1, mode: 'campus', label: 'Library', placement: '' });
  await store.recordTagEvent(tag.tagId, 'qr');
  assert.equal((await store.tagAnalytics('owner', 'nyu'))[0].total, 1);
  assert.deepEqual(await store.tagAnalytics('other', 'nyu'), []);
  await assert.rejects(store.setTagActive('other', tag.tagId, false), /見つかりません/);
  await assert.rejects(store.clearTagAnalytics('other', tag.tagId), /見つかりません/);
  await store.setTagActive('owner', tag.tagId, false);
  assert.equal(await store.recordTagEvent(tag.tagId, 'qr'), false);
  await store.clearTagAnalytics('owner', tag.tagId);
  assert.equal((await store.tagAnalytics('owner', 'nyu'))[0].total, 0);
});
