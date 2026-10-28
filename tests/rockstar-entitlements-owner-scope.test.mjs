import assert from 'node:assert/strict';
import test from 'node:test';
import { loadRouteFixture } from './route-fixture.mjs';
import { ownerScopeFor } from '../lib/owner-intent.ts';

void test('entitlement response is scoped to the identity that was authenticated for this request', async () => {
  const calls = [];
  const modules = new Map([
    ['cloudflare:workers', { env: {} }],
    ['@/lib/fund-store', { database: () => ({}) }],
    ['@/lib/rockstar-device-link', { requestRockstarUser: async request => request.headers.get('x-fixture-owner') }],
    ['@/lib/esim-cloud-access', { esimCloudAccessStore: () => ({ listActive: async owner => { calls.push(['esim', owner]); return []; } }) }],
    ['@/lib/rockstar-entitlement-claim', { rockstarEntitlementStore: () => ({ list: async owner => { calls.push(['entitlements', owner]); return []; } }),
      hasActiveRockstarEntitlementIssuer: () => false }],
    ['@/lib/sky-tool-package-store', { skyToolPackageStore: () => ({ listRegistry: async () => [] }) }],
    ['@/lib/rockstar-service-offers', { describeRockstarServiceOfferProfile: async () => null }],
    ['@/lib/owner-intent', { ownerScopeFor }],
  ]);
  const route = loadRouteFixture(new URL('../app/api/rockstar/entitlements/route.ts', import.meta.url), modules);
  for (const owner of ['fixture-alice', 'fixture-bob']) {
    const response = await route.GET(new Request('https://fixture.invalid/api/rockstar/entitlements', { headers: { 'x-fixture-owner': owner } }));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).ownerScope, await ownerScopeFor(owner));
    assert.deepEqual(calls.splice(0), [['entitlements', owner], ['esim', owner]]);
  }
  assert.notEqual(await ownerScopeFor('fixture-alice'), await ownerScopeFor('fixture-bob'));
});
