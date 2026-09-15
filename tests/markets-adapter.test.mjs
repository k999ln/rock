import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MARKETS_ADAPTER_POLICY,
  normalizeMarketAnalysis,
  readMarketAnalysis,
} from '../lib/markets-adapter.ts';
import { fundCandidatesFromCatalog } from '../lib/automation-fund-catalog.ts';
import { catalog } from '../lib/catalog.ts';

void test('Markets adapter accepts only labeled live market data', async () => {
  const snapshot = await readMarketAnalysis(30, async (url) => {
    const href =
      url instanceof Request ? url.url : url instanceof URL ? url.href : url;
    assert.match(href, /limit=12$/u);
    return Response.json({
      source: 'live',
      fetchedAt: '2026-09-13T00:00:00.000Z',
      markets: [
        {
          id: 'market-1',
          question: 'Verified live question?',
          slug: 'market-1',
          probability: 0.62,
          volume: 100,
          liquidity: 50,
          source: 'live',
        },
        {
          id: 'sample',
          question: 'Fallback sample',
          probability: 0.5,
          source: 'fallback',
        },
      ],
    });
  });
  assert.equal(snapshot.markets.length, 1);
  assert.equal(snapshot.policy.executionEnabled, false);
  assert.equal(snapshot.policy.countsAsFundRevenue, false);
});

void test('Markets adapter enforces its own limit when upstream ignores it', async () => {
  const snapshot = await readMarketAnalysis(2, async () =>
    Response.json({
      source: 'live',
      markets: [1, 2, 3, 4].map((id) => ({
        id: String(id),
        question: `Live market ${id}?`,
        probability: 0.5,
        volume: id,
        liquidity: id,
        source: 'live',
      })),
    }),
  );
  assert.equal(snapshot.markets.length, 2);
});

void test('Markets adapter rejects fallback-only payloads', async () => {
  await assert.rejects(
    () =>
      readMarketAnalysis(5, async () =>
        Response.json({ source: 'fallback', markets: [] }),
      ),
    /MARKETS_ADAPTER_LIVE_DATA_REQUIRED/u,
  );
});

void test('Market analysis never recognizes projected values as fund revenue', () => {
  assert.equal(MARKETS_ADAPTER_POLICY.revenueRecognition,
    'provider_confirmed_realized_pnl_only');
  assert.equal(
    normalizeMarketAnalysis({
      id: 'sample',
      question: 'Sample?',
      probability: 0.5,
      source: 'fallback',
    }),
    null,
  );
});

void test('Markets joins the dynamic fund catalog with zero unverified revenue', () => {
  const candidate = fundCandidatesFromCatalog(catalog).find(
    (item) => item.toolId === 'rockstar-markets-analysis',
  );
  assert.equal(candidate?.ready, true);
  assert.equal(candidate?.verifiedGrossMinor, 0);
  assert.equal(candidate?.operatingCostMinor, 0);
  assert.equal(candidate?.completedReceipts, 0);
});
