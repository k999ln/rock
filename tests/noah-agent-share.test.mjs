import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadNoahShareAgent, noahAgentShareMetadata, noahAgentShareUrl, noahShareId } from '../lib/noah-agent-share.ts';

const sample = { id: 'mcp-registry:ai.axad/language-tutor', name: 'Axad', summary: 'Language tutor', provider: 'ai.axad', listed: true, connection: { secret: 'private' }, ownerScope: 'private' };
void test('Agent URL preserves the exact public ID and carries no viewer context', () => {
  const url = new URL(noahAgentShareUrl(sample.id));
  assert.equal(url.origin, 'https://avoado.si');
  assert.equal(url.pathname, '/noah/ready/agent');
  assert.deepEqual([...url.searchParams], [['id', sample.id]]);
  assert.equal(new URL(noahAgentShareUrl('registry:日本語/a&b?x=y')).searchParams.get('id'), 'registry:日本語/a&b?x=y');
  for (const value of [null, ['abc'], 'ab', 'a'.repeat(401), 'abc\nsecret']) assert.equal(noahShareId(value), null);
});
void test('previews use public anonymous listing and explicitly project fields', async () => {
  const agent = await loadNoahShareAgent(sample.id, { publicListing: true, detail: async (...args) => { assert.deepEqual(args, [sample.id, null, false]); return sample; } });
  assert.deepEqual(agent, { id: sample.id, name: 'Axad', summary: 'Language tutor', provider: 'ai.axad' });
  const metadata = noahAgentShareMetadata(agent);
  assert.equal(metadata.twitter.card, 'summary_large_image');
  assert.equal(new URL(metadata.openGraph.url).searchParams.get('id'), sample.id);
  assert.equal(new URL(metadata.openGraph.images[0].url).searchParams.get('id'), sample.id);
  assert(!JSON.stringify(metadata).includes('private'));
});
void test('closed, hidden, unknown, mismatched and malformed records cannot produce public previews', async () => {
  let calls = 0;
  const detail = async () => { calls++; return sample; };
  assert.equal(await loadNoahShareAgent(sample.id, { publicListing: false, detail }), null);
  assert.equal(await loadNoahShareAgent(['abc'], { publicListing: true, detail }), null);
  assert.equal(calls, 0);
  for (const result of [{ ...sample, listed: false }, { ...sample, id: 'other' }]) {
    assert.equal(await loadNoahShareAgent(sample.id, { publicListing: true, detail: async () => result }), null);
  }
  assert.equal(await loadNoahShareAgent(sample.id, { publicListing: true, detail: async () => { throw new Error('not found'); } }), null);
  const metadata = noahAgentShareMetadata(null);
  assert.equal(metadata.robots.index, false);
  assert.equal(metadata.openGraph, undefined);
});

void test('share ID controls and text cleanup preserve their exact Unicode boundary', async () => {
  for (let code = 0; code <= 255; code++) {
    const value = `a${String.fromCharCode(code)}b`;
    assert.equal(noahShareId(value), code <= 31 || code === 127 ? null : value, `code point ${code}`);
  }
  assert.equal(noahShareId('日本語😀'), '日本語😀');
  const result = await loadNoahShareAgent(sample.id, { publicListing: true, detail: async () => ({
    ...sample, name: 'A\u0000B\nC\u007fD 😀', summary: '説明\tです', provider: 'a\u0085b',
  }) });
  assert.deepEqual(result, { id: sample.id, name: 'A B C D 😀', summary: '説明 です', provider: 'a\u0085b' });
});
