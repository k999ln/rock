import assert from 'node:assert/strict';
import test from 'node:test';
import { cloudMonthlyCost } from '../lib/cloud-cost.ts';
import { ingestCloudUsage } from '../lib/cloud-operations-store.ts';
import { NoahAgentError } from '../lib/noah-agent-upload.ts';
import * as usage from '../lib/noah-usage.ts';
import { openMonthlySandboxDatabase } from '../scripts/sky-monthly-sandbox-db.mjs';
import { loadRouteFixture } from './route-fixture.mjs';

function database(t) {
  const db = openMonthlySandboxDatabase();
  t.after(() => db.close());
  return db;
}

void test('the operator meter matches the existing price table across the UTC month boundary', async (t) => {
  const db = database(t);
  const now = Date.UTC(2026, 11, 12);
  const events = [
    { kind: 'container', at: Date.UTC(2026, 9, 31, 23, 59), vcpuSeconds: 10_000_000, gibSeconds: 0, gbSeconds: 0 },
    { kind: 'container', at: Date.UTC(2026, 10, 30, 23, 59), vcpuSeconds: 10_000_000, gibSeconds: 0, gbSeconds: 0 },
    { kind: 'container', at: Date.UTC(2026, 11, 1), vcpuSeconds: 3600, gibSeconds: 7200, gbSeconds: 1800 },
    { kind: 'model', at: Date.UTC(2026, 11, 3), model: 'qwen3-30b-a3b-fp8', inputTokens: 3000, outputTokens: 1000 },
  ];
  for (const [index, event] of events.entries()) {
    await ingestCloudUsage(db, { id: `usage-${index}`, userId: 'fixture-owner', usage: event }, now);
  }
  await ingestCloudUsage(db, {
    id: 'future-report', userId: null, usage: { ...events[0], at: now + 1000 },
  }, now + 1000);
  const report = await usage.noahCloudUsageReport(db, undefined, now);
  assert.deepEqual(report.months.map((month) => ({ ...month })), cloudMonthlyCost(events));
  assert.equal(report.currentMonth, '2026-12');
  assert.equal(report.remainingUsd, 189.909386);
  assert.equal(report.trigger.thresholdUsd, 190);
  assert.equal(report.trigger.triggered, true);
  assert.equal(report.trigger.streak, 2);
  assert.equal(report.trigger.lastCompleteMonth, '2026-11');
  assert.equal((await usage.noahCloudUsageReport(db, '200', now)).trigger.triggered, false);
  assert.equal((await usage.noahCloudUsageReport(db, '201.5', now)).remainingUsd, 201.409386);
});

void test('unpriced and missing months never appear as measured zero or a certain remaining amount', async (t) => {
  const db = database(t);
  const now = Date.UTC(2026, 10, 15);
  const empty = await usage.noahCloudUsageReport(db, undefined, now);
  assert.equal(empty.current, null);
  assert.equal(empty.remainingUsd, null);
  await ingestCloudUsage(db, {
    id: 'unknown-model', userId: 'fixture-owner',
    usage: { kind: 'model', at: now, model: 'unpriced-model', inputTokens: 3000, outputTokens: 1000 },
  }, now);
  const report = await usage.noahCloudUsageReport(db, undefined, now);
  assert.equal(report.current.unpriced, 1);
  assert.equal(report.remainingUsd, null);
  assert.equal(report.trigger.triggered, false);
  await assert.rejects(usage.noahCloudUsageReport(db, '', now), { status: 503 });
});

void test('the usage route serves cloud meter totals only for the unfiltered operator view', async (t) => {
  const db = database(t);
  let owner = 'operator-fixture';
  const env = { NOAH_USAGE_ADMIN_USER_IDS: JSON.stringify([owner]), NOAH_CLOUD_TRIGGER_USD: '199' };
  const deps = new Map([
    ['cloudflare:workers', { env }],
    ['@/lib/fund-store', { database: () => db, requestUser: async () => owner }],
    ['@/lib/noah-agent-upload', { NoahAgentError }],
    ['@/lib/noah-usage', usage],
  ]);
  const route = loadRouteFixture(new URL('../app/api/noah/usage/route.ts', import.meta.url), deps);
  const get = (query) => route.GET(new Request(`https://fixture.test/api/noah/usage?${query}`));
  const operator = await get('scope=operator');
  assert.equal(operator.status, 200);
  assert.equal((await operator.json()).cloud.trigger.thresholdUsd, 199);
  assert.equal((await (await get('scope=operator&agent=model%3Atest')).json()).cloud, undefined);
  assert.equal((await (await get('scope=personal')).json()).cloud, undefined);
  owner = 'ordinary-fixture';
  assert.equal((await get('scope=operator')).status, 403);
});
