import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { catalog } from '../lib/catalog.ts';
import { rankSkyFeed, SKY_FEED_WEIGHTS } from '../lib/sky-feed-ranking.ts';

const tool = (id) => {
  const found = catalog.find((item) => item.id === id);
  assert.ok(found, `${id} exists in the catalog`);
  return found;
};

const fixtures = [
  tool('rockstar-amc'),
  tool('rockstar-csv-cleanup'),
  tool('coconala'),
  tool('mr-citations'),
  tool('faster-whisper'),
];

void test('recommended ranking is deterministic and independent of input order', () => {
  const signals = {
    now: 1_800_000_000_000,
    savedAt: { coconala: 1_799_999_000_000 },
    connectedAt: { 'mr-citations': 1_799_900_000_000 },
    availableToolIds: new Set(['rockstar-amc', 'rockstar-csv-cleanup']),
  };
  const ranked = rankSkyFeed(fixtures, 'recommended', signals);
  const reversed = rankSkyFeed([...fixtures].reverse(), 'recommended', signals);
  assert.deepEqual(
    ranked.map(({ tool: item }) => item.id),
    reversed.map(({ tool: item }) => item.id),
  );
  assert.equal(ranked[0].tool.id, 'coconala');
  assert.equal(ranked[0].reasonCode, 'saved');
});

void test('the current routed Tool wins without passing request text to the ranker', () => {
  const ranked = rankSkyFeed(fixtures, 'recommended', {
    now: 1_800_000_000_000,
    routedToolId: 'faster-whisper',
    availableToolIds: new Set(['rockstar-amc']),
  });
  assert.equal(ranked[0].tool.id, 'faster-whisper');
  assert.equal(ranked[0].reasonCode, 'current-request');
  assert.equal(ranked[0].reason, '今の依頼に関連');
  assert.equal(SKY_FEED_WEIGHTS.routedRequest, 60);
});

void test('my feed contains only saved or connected Tools, newest relationship first', () => {
  const ranked = rankSkyFeed(fixtures, 'library', {
    now: 1_800_000_000_000,
    savedAt: { coconala: 300 },
    connectedAt: {
      'mr-citations': 500,
      'rockstar-amc': 100,
    },
  });
  assert.deepEqual(
    ranked.map(({ tool: item }) => item.id),
    ['mr-citations', 'coconala', 'rockstar-amc'],
  );
});

void test('availability explanations require the authoritative availability input', () => {
  const withoutRuntime = rankSkyFeed([tool('rockstar-amc')], 'recommended', {
    now: 1_800_000_000_000,
  });
  const withRuntime = rankSkyFeed([tool('rockstar-amc')], 'recommended', {
    now: 1_800_000_000_000,
    availableToolIds: new Set(['rockstar-amc']),
  });
  assert.notEqual(withoutRuntime[0].reasonCode, 'available');
  assert.equal(withRuntime[0].reasonCode, 'available');
});

void test('ranking API has no request, result, token or engagement-history inputs', () => {
  const source = readFileSync(
    resolve(import.meta.dirname, '../lib/sky-feed-ranking.ts'),
    'utf8',
  );
  const signalBlock = source.match(
    /export type SkyFeedSignals = \{([\s\S]*?)\n\};/,
  );
  assert.ok(signalBlock);
  assert.doesNotMatch(
    signalBlock[1],
    /requestText|prompt|result|token|click|dwell|userId|email/,
  );
});
