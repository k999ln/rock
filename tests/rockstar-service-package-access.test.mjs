import assert from 'node:assert/strict';
import test from 'node:test';
import { includedRockstarServicePackageKeys } from '../lib/rockstar-service-package-access.ts';

void test('active eSIM grants include their Starter Pack without a separate purchase claim', () => {
  const packageKey = 'dev.agent@1.0.0';
  assert.deepEqual([...includedRockstarServicePackageKeys({ entitlements: [], esimAccess: [
    { state: 'active', starterAgentPack: { packages: [{ packageKey }] } },
    { state: 'suspended', starterAgentPack: { packages: [{ packageKey: 'dev.revoked@1.0.0' }] } },
    { state: 'active', starterAgentPack: { packages: [{ packageKey: 'invalid' }] } },
  ] })], [packageKey]);
});

void test('only ready packages from active included profiles suppress a separate purchase', () => {
  const packageKey = 'health.local-guide@1.2.3';
  const keys = includedRockstarServicePackageKeys({ entitlements: [
    { status: 'active', serviceProfile: { state: 'review_required', activation: 'owner_choice_required', packages: [
      { packageKey, state: 'ready' }, { packageKey: 'dev.agent@2.0.0', state: 'unavailable' },
    ] } },
    { status: 'revoked', serviceProfile: { state: 'ready', activation: 'owner_choice_required', packages: [
      { packageKey: 'revoked.agent@1.0.0', state: 'ready' },
    ] } },
    { status: 'active', serviceProfile: { state: 'catalog_unavailable', activation: 'owner_choice_required', packages: [
      { packageKey: 'stale.agent@1.0.0', state: 'ready' },
    ] } },
  ] });
  assert.deepEqual([...keys], [packageKey]);
});

void test('malformed or missing entitlement payloads fail closed', () => {
  assert.deepEqual([...includedRockstarServicePackageKeys(null)], []);
  assert.deepEqual([...includedRockstarServicePackageKeys({ entitlements: {} })], []);
  assert.deepEqual([...includedRockstarServicePackageKeys({ entitlements: [
    { status: 'active', serviceProfile: { state: 'ready', packages: [{ packageKey: '../agent', state: 'ready' }] } },
  ] })], []);
});
