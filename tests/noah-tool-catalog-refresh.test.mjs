// 道具の定義の写しの取り直し（scripts/noah-tool-catalog-refresh.mjs）と、写しが 2 つある系列の読み方（lib/noah-tool-catalog.ts）。task 128 の 9.8。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  NOAH_CATALOG_KEEP, noahCatalogDefinition, noahCatalogMerge, noahCatalogRegistryRecord, noahCatalogSummary, noahCatalogText,
} from '../scripts/noah-tool-catalog-refresh.mjs';
import { noahCatalogTools } from '../lib/noah-tool-catalog.ts';

void test('the summary is the provider\'s first sentence, cut to 160 characters', () => {
  assert.equal(noahCatalogSummary('Book a visit with a company. Only when the customer asked.'), 'Book a visit with a company.');
  assert.equal(noahCatalogSummary('  Find\n  things   now.  '), 'Find things now.', 'spaces and line breaks fold');
  assert.equal(noahCatalogSummary('Use e.g. the zip code. Then book.'), 'Use e.g. the zip code.', 'a lower-case continuation is not a sentence end');
  assert.equal(noahCatalogSummary('天気を調べます。週末の予報も出します。'), '天気を調べます。');
  assert.equal(noahCatalogSummary('Find venues near a landmark (e.g. "Dubai Marina"). Returns 10.'), 'Find venues near a landmark (e.g. "Dubai Marina").', 'an abbreviation is not a sentence end');
  assert.equal(noahCatalogSummary('List plans (free. Paid soon) for a site. Then pick.'), 'List plans (free. Paid soon) for a site.', 'no sentence ends inside brackets');
  assert.equal(noahCatalogSummary('Runs on U.S. Federal data. Updated daily.'), 'Runs on U.S. Federal data.');
  assert.equal(noahCatalogSummary('Read-only. Lists the projects in your workspace. Paged.'), 'Read-only. Lists the projects in your workspace.', 'a label-only first sentence runs on to the next');
  assert.equal(noahCatalogSummary('Free.'), 'Free.');
  assert.equal(noahCatalogSummary(''), '');
  assert.equal(noahCatalogSummary(undefined), '');
  const long = noahCatalogSummary(`${'word '.repeat(60)}end.`);
  assert.equal(Array.from(long).length, 160);
  assert.match(long, /…$/);
  assert.equal(noahCatalogSummary(`${'x'.repeat(157)}, more words here.`), `${'x'.repeat(157)}…`, 'no comma or space is left before the ellipsis');
});

void test('a definition keeps only names, types and whether a field is required', () => {
  const tool = {
    name: 'find_pros',
    description: 'Find a pro by ZIP code. Returns up to 5.',
    inputSchema: { type: 'object', required: ['zip'], properties: { service: { type: 'string', description: 'ignored' }, zip: { type: 'string' }, when: { anyOf: [{ type: 'string' }, { type: 'null' }] } } },
  };
  assert.deepEqual(noahCatalogDefinition(tool), {
    name: 'find_pros',
    inputs: [{ field: 'service', type: 'string', required: false }, { field: 'zip', type: 'string', required: true }, { field: 'when', type: null, required: false }],
    outputs: null,
    summary: 'Find a pro by ZIP code.',
  });
  const withOutput = noahCatalogDefinition({ name: 'get', description: '', inputSchema: { type: 'object' }, outputSchema: { type: 'object', required: ['price'], properties: { price: { type: 'number' } } } });
  assert.deepEqual(withOutput, { name: 'get', inputs: [], outputs: [{ field: 'price', type: 'number', required: true }] }, 'no sentence is invented when the provider wrote none');
  const secret = noahCatalogDefinition({ name: 'x', description: 'Use key sk-abc.', inputSchema: {} }, (text) => text.includes('sk-'));
  assert.equal(secret.summary, undefined, 'a sentence that looks like a secret is not kept');
});

void test('a series keeps at most two copies, newest first, and an unchanged copy is not rewritten', () => {
  const a = { toolsSha256: 'a'.repeat(64), tools: [{ name: 'one', inputs: [], outputs: null, summary: 'Old wording.' }] };
  const b = { toolsSha256: 'b'.repeat(64), tools: [{ name: 'one', inputs: [], outputs: null }, { name: 'two', inputs: [], outputs: null }] };
  const c = { toolsSha256: 'c'.repeat(64), tools: [{ name: 'three', inputs: [], outputs: null }] };
  assert.deepEqual(noahCatalogMerge(undefined, a), { value: a, changed: true, added: true });
  const same = noahCatalogMerge(a, { ...a, tools: [{ name: 'one', inputs: [], outputs: null, summary: 'New wording.' }] });
  assert.deepEqual(same, { value: a, changed: false, added: false }, 'the copy already held stays as it was');
  assert.deepEqual(noahCatalogMerge(a, b).value, [b, a]);
  assert.deepEqual(noahCatalogMerge([b, a], c).value, [c, b], 'the oldest copy is dropped');
  assert.equal(NOAH_CATALOG_KEEP, 2);
  const back = noahCatalogMerge([b, a], a);
  assert.deepEqual(back, { value: [a, b], changed: true, added: false }, 'a provider that went back to the old tools moves that copy first');
});

void test('the registry record is reduced to the fields the intake hashes', () => {
  const record = noahCatalogRegistryRecord({ name: 'ai.x/y', title: 'Y', description: 'd', version: '1', websiteUrl: 'https://x.ai', remotes: [{ type: 'streamable-http', url: 'https://x.ai/mcp' }], repository: { url: 'https://github.com/x/y', source: 'github' }, $schema: 'ignored', icons: [] });
  assert.deepEqual(record, { name: 'ai.x/y', title: 'Y', description: 'd', version: '1', websiteUrl: 'https://x.ai', remotes: [{ type: 'streamable-http', url: 'https://x.ai/mcp' }], repository: { url: 'https://github.com/x/y' } });
  assert.equal(noahCatalogRegistryRecord(null), null);
  assert.equal(noahCatalogRegistryRecord({ title: 'no name' }), null);
});

void test('the catalog file is one sorted line, and every copy in it can be used when its hash and count match', () => {
  const text = readFileSync(new URL('../data/noah-tool-catalog.json', import.meta.url), 'utf8');
  const catalog = JSON.parse(text);
  assert.equal(noahCatalogText(catalog), text, 'written the way the refresh writes it');
  assert.equal(catalog.schema, 'noah-tool-catalog/1');
  for (const [id, value] of Object.entries(catalog.series)) {
    const copies = Array.isArray(value) ? value : [value];
    assert.ok(copies.length >= 1 && copies.length <= NOAH_CATALOG_KEEP, id);
    assert.equal(new Set(copies.map((copy) => copy.toolsSha256)).size, copies.length, `${id}: two copies with one hash`);
    for (const copy of copies) {
      assert.match(copy.toolsSha256, /^[0-9a-f]{64}$/, id);
      assert.ok(copy.tools.length > 0, id);
      assert.equal(new Set(copy.tools.map((tool) => tool.name)).size, copy.tools.length, `${id}: tool names repeat`);
      assert.deepEqual(noahCatalogTools(id, { toolsSha256: copy.toolsSha256, toolCount: copy.tools.length }), copy.tools, id);
      assert.equal(noahCatalogTools(id, { toolsSha256: copy.toolsSha256, toolCount: copy.tools.length + 1 }), null, `${id}: count`);
    }
  }
});
