import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createResearchCatalog, ResearchQueryError } from '../lib/noah-research-query.ts';

const root = new URL('../', import.meta.url);
const read = p => JSON.parse(readFileSync(new URL(p, root), 'utf8'));
const index = read('data/noah-research-index.json');
const catalog = createResearchCatalog(index);
const params = value => new URLSearchParams(value);

void test('all imported public records have one stable detail and source coverage reconciles to snapshots', () => {
  const dir = new URL(`public/noah-research/${index.revision}/`, root);
  const locations = new Map();
  const records = readdirSync(dir).flatMap(f => {
    const rows = Object.values(JSON.parse(readFileSync(new URL(f, dir), 'utf8')));
    for (const row of rows) locations.set(row.id, `/noah-research/${index.revision}/${f}`);
    return rows;
  });
  assert.equal(records.length, index.stats.total);
  assert.equal(index.rows.length, records.length);
  assert.equal(new Set(records.map(r => r.id)).size, records.length);
  const sources = new Map(), counts = {}, kinds = {};
  const article = read('data/noah-research-sources/explorax-github-100.json');
  const articleByPosition = new Map(article.repositories.map(item => [String(item.position), item]));
  const citedRecords = new Map();
  for (const r of records) {
    assert.ok(catalog.get(r.id));
    assert.equal(catalog.get(r.id).entry.detailPath, locations.get(r.id));
    assert.ok(['name_group', 'distribution'].includes(r.identity));
    assert.equal(r.connection, r.id === 'anicca' ? 'existing_anicca' : 'not_tested');
    assert.equal(Object.hasOwn(r, 'manifest'), false);
    for (const s of r.sources) {
      assert.equal(new URL(s.url).protocol, 'https:');
      assert.equal(new URL(s.url).username, '');
      if (s.type === 'citation') continue;
      assert.ok(!sources.has(s.url), `duplicate URL ${s.url}`);
      sources.set(s.url, r.id);
    }
    for (const ref of r.references) {
      counts[ref.dataset] = (counts[ref.dataset] || 0) + 1;
      if (ref.dataset !== 'explorax_github_100') continue;
      assert.ok(!citedRecords.has(ref.ref));
      const item = articleByPosition.get(ref.ref);
      assert.ok(r.sources.some(s => s.type === 'citation' && s.url === article.sourceUrl));
      assert.ok(r.sources.some(s => s.type === 'primary' && s.url === `https://github.com/${item.repository.toLowerCase()}`));
      if (item.archived) assert.ok(r.notes.some(note => note.includes('アーカイブ済み')));
      citedRecords.set(ref.ref, r.id);
    }
    kinds[r.kind] = (kinds[r.kind] || 0) + 1;
  }
  assert.deepEqual(counts, index.stats.coverage);
  assert.deepEqual(kinds, index.stats.kinds);
  const snapshot = name => JSON.parse(gunzipSync(readFileSync(new URL(`data/noah-research-sources/${name}.json.gz`, root))));
  const census = snapshot('census'), metadata = snapshot('primary-metadata'), review = snapshot('primary-review');
  assert.equal(counts.directory_listings, census.groups.reduce((n, g) => n + g.listings.length, 0));
  assert.equal(index.stats.nameGroups, census.groups.length);
  assert.equal(counts.metadata, metadata.length);
  assert.equal(counts.primary_review, review.github.length + review.huggingFace.length);
  assert.equal(counts.landscape, snapshot('landscape').entries.length);
  assert.equal(counts.ongoing_research, snapshot('expansion').reduce((n, x) => n + x.records.length, 0));
  assert.equal(counts.x_leads, snapshot('discovery').x.leads.length);
  assert.equal(counts.discovery_examples, snapshot('discovery').examples.length);
  assert.equal(counts.explorax_github_100, articleByPosition.size);
  assert.equal(new Set(citedRecords.values()).size, articleByPosition.size);
  assert.equal(catalog.list(params({ q: 'exploraX_' })).total, articleByPosition.size);
  assert.equal(records.filter(r => r.id === 'anicca').length, 1);
  // Stable repository ID merges a renamed source; names alone do not merge repos.
  assert.equal(records.filter(r => r.references.some(x => x.ref === 'GH003')).length, 1);
});

void test('search and classification expose candidates and related assets without claiming runnable agents', () => {
  const all = catalog.list(params({ limit: '50' }));
  assert.equal(all.total, index.stats.total); assert.equal(all.entries.length, 50);
  const related = catalog.list(params({ kind: 'related' }));
  assert.equal(related.total, index.stats.total - index.stats.kinds.agent - index.stats.kinds.candidate);
  assert.ok(related.entries.every(x => !['agent', 'candidate'].includes(x.kind)));
  for (const kind of ['agent', 'candidate', 'model', 'dataset']) assert.equal(catalog.list(params({ kind })).total, index.stats.kinds[kind]);
  for (const q of ['OpenHands', 'ＣＬＩＮＥ', 'smolagents computer-agent', 'ココナラ']) {
    const page = catalog.list(params({ q }));
    if (q !== 'ココナラ') assert.ok(page.total > 0, q);
    assert.ok(page.entries.length <= 20);
  }
  assert.equal(catalog.list(params({ q: 'zzzz_missing_79643_xxxx' })).total, 0);
  assert.equal(catalog.get('../../secrets'), null);
});

void test('pagination covers every Agent candidate exactly once, rejects changed queries and stale snapshots', () => {
  let p = params({ kind: 'agent', limit: '17' }), result;
  const ids = [];
  do {
    result = catalog.list(p); ids.push(...result.entries.map(x => x.id));
    if (result.nextCursor) p = params({ kind: 'agent', limit: '17', cursor: result.nextCursor });
  } while (result.nextCursor);
  assert.equal(ids.length, index.stats.kinds.agent); assert.equal(new Set(ids).size, ids.length);
  const first = catalog.list(params({ kind: 'agent' }));
  assert.throws(() => catalog.list(params({ kind: 'model', cursor: first.nextCursor })), ResearchQueryError);
  const other = createResearchCatalog({ ...index, revision: 'another-revision' });
  assert.throws(() => other.list(params({ kind: 'agent', cursor: first.nextCursor })), ResearchQueryError);
  for (const input of [{ limit: '0' }, { limit: '51' }, { limit: '1.5' }, { q: 'a'.repeat(201) }, { kind: 'bogus' }, { cursor: '%broken' }, { order: 'random' }])
    assert.throws(() => catalog.list(params(input)), ResearchQueryError);
});

void test('snapshot hashes match and offline reimport reproduces every output without duplicates', () => {
  for (const item of read('data/noah-research-sources/manifest.json').inputs) {
    const bytes = gunzipSync(readFileSync(new URL(`data/noah-research-sources/${item.name}.json.gz`, root)));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), item.snapshotSha256);
  }
  execFileSync('python3', ['scripts/import-noah-research.py', '--check'], { cwd: root, timeout: 30000, stdio: 'pipe' });
});
