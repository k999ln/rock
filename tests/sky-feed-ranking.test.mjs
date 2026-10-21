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

void test('Phoenix history learns repeated explicit use without request or result bodies', () => {
  const now = 1_800_000_000_000;
  const history = Array.from({ length: 5 }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    sessionId: '10000000-0000-4000-8000-000000000001',
    toolId: 'faster-whisper',
    type: index < 2 ? 'detail' : 'launch',
    at: now - index * 1_000,
  }));
  const ranked = rankSkyFeed(fixtures, 'recommended', { now, history });
  assert.equal(ranked[0].tool.id, 'faster-whisper');
  assert.equal(ranked[0].reasonCode, 'history');
  assert.ok(ranked[0].prediction.launch > ranked[1].prediction.launch);
});

void test('an impression without an action does not become a positive recommendation', () => {
  const now = 1_800_000_000_000;
  const baseline = rankSkyFeed(fixtures, 'recommended', { now });
  const ranked = rankSkyFeed(fixtures, 'recommended', {
    now,
    history: [
      {
        id: '00000000-0000-4000-8000-000000000001',
        sessionId: '10000000-0000-4000-8000-000000000001',
        toolId: 'faster-whisper',
        type: 'impression',
        at: now - 1_000,
        dwellMs: 1_000,
        position: 3,
      },
    ],
  });
  assert.ok(
    ranked.find(({ tool: item }) => item.id === 'faster-whisper').score <=
      baseline.find(({ tool: item }) => item.id === 'faster-whisper').score,
  );
});

void test('ranking API accepts bounded semantic history but no private bodies or identity', () => {
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
    /requestText|prompt|result|token|userId|email|deviceId/,
  );
});
