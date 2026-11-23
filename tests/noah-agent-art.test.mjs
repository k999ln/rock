import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveNoahAgentArt } from '../lib/noah-agent-art.ts';

void test('published agents with similar subjects show their own documented operations', () => {
  const works = [
    ['Cerebrium Docs', 'manual'], ['法人のsi導入準備', 'intake'], ['CertifiKit COI tools', 'verify'],
    ['CFO+', 'ledger'], ['Capital Company', 'capital'], ['Carfinity car marketplace', 'car-search'],
    ['Car Background AI', 'photo'], ['Memory', 'memory'], ['ArcReel', 'film'], ['LinguaGacha', 'translate'],
  ];
  const signatures = works.map(([name, scene]) => {
    const art = resolveNoahAgentArt('wrapped-id', name);
    assert.equal(art.scene, scene);
    assert.match(art.signature, /^[0-9a-f]{8}$/u);
    return art.signature;
  });
  assert.equal(new Set(signatures).size, works.length);
  assert.deepEqual(resolveNoahAgentArt('mcp-registry:ai.cerebrium/docs', '資料'), resolveNoahAgentArt('installed-id', 'CEREBRIUM DOCS'));
  assert.deepEqual(resolveNoahAgentArt('sky-citation-agent', '別名'), resolveNoahAgentArt('other-wrapper', '出典整理Agent'));
});

void test('future registrations keep stable independent identities even with the same display name or work', () => {
  const entry = resolveNoahAgentArt('dev.creator-a.widget@1.0.0', '提案');
  assert.equal(entry.scene, 'signature');
  assert.deepEqual(entry, resolveNoahAgentArt('dev.creator-a.widget@2.0.0', 'Renamed'));
  assert.notEqual(entry.seed, resolveNoahAgentArt('dev.creator-b.widget', '提案').seed);
  assert.equal(resolveNoahAgentArt('new-id', 'Archive', 'Organize files locally').scene, 'files');
  assert.equal(resolveNoahAgentArt('new-id', 'Archive', 'file service').scene, 'signature');
  assert.equal(resolveNoahAgentArt('new-id', '映像', 'Storyboards and video production.').scene, 'film');
});
