import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveSkyOsPolicy } from '../lib/sky-os-policy.ts';
const shared = {
  label: 'Fixture OS',
  profiles: 'multiple',
  purchaseSharing: 'device_profiles',
  savedProfileLimit: null,
  hardwareLimits: { 'fixture-mini': 4, 'fixture-large': 8 },
};
const config = {
  SKY_OS_POLICIES: JSON.stringify({
    fixture: shared,
    personal: {
      ...shared,
      profiles: 'single',
      savedProfileLimit: 1,
      hardwareLimits: {},
      purchaseSharing: 'buyer',
    },
  }),
};
// All capacities below are fixtures, not product limits.
void test('OS chooses sharing and profile mode independently', () => {
  const mini = resolveSkyOsPolicy({
    ...config,
    SKY_OS_ID: 'fixture',
    SKY_HARDWARE_MODEL: 'fixture-mini',
  });
  const personal = resolveSkyOsPolicy({ ...config, SKY_OS_ID: 'personal' });
  assert.equal(mini.policy.purchaseSharing, 'device_profiles');
  assert.equal(mini.policy.profiles, 'multiple');
  assert.equal(personal.policy.purchaseSharing, 'buyer');
  assert.equal(personal.policy.savedProfileLimit, 1);
});
void test('hardware overrides capacity; unknown capacity stays unknown', () => {
  assert.equal(
    resolveSkyOsPolicy({
      ...config,
      SKY_OS_ID: 'fixture',
      SKY_HARDWARE_MODEL: 'fixture-large',
    }).policy.savedProfileLimit,
    8,
  );
  assert.equal(
    resolveSkyOsPolicy({
      ...config,
      SKY_OS_ID: 'fixture',
      SKY_HARDWARE_MODEL: 'unknown',
    }).policy.savedProfileLimit,
    null,
  );
  assert.equal(
    resolveSkyOsPolicy({ ...config, SKY_OS_ID: 'fixture' }).policy
      .savedProfileLimit,
    null,
  );
});
void test('missing OS and invalid configuration never fall back to another OS sharing rights', () => {
  for (const bindings of [
    { ...config, SKY_OS_ID: 'unknown' },
    { SKY_OS_POLICIES: 'broken' },
    { SKY_OS_POLICIES: '[]' },
    { SKY_OS_ID: '__proto__' },
    { SKY_OS_ID: 12 },
    { SKY_HARDWARE_MODEL: 12 },
  ]) {
    assert.equal(resolveSkyOsPolicy(bindings).state, 'unconfigured');
    assert.equal(resolveSkyOsPolicy(bindings).policy, null);
  }
});
void test('reject invalid bounds, unknown fields and inconsistent single-user profiles', () => {
  for (const change of [
    { savedProfileLimit: 0 },
    { savedProfileLimit: -1 },
    { savedProfileLimit: 1.5 },
    { hardwareLimits: { mini: 0 } },
    { profiles: 'single' },
    { purchaseSharing: 'all_accounts' },
    { grantAccess: true },
  ]) {
    const result = resolveSkyOsPolicy({
      SKY_OS_ID: 'fixture',
      SKY_OS_POLICIES: JSON.stringify({ fixture: { ...shared, ...change } }),
    });
    assert.equal(result.policy, null);
  }
});
void test('default web reflects existing buyer access; results are isolated', () => {
  const result = resolveSkyOsPolicy({});
  assert.equal(result.osId, 'web');
  assert.equal(result.policy.profiles, 'account');
  assert.equal(result.policy.purchaseSharing, 'buyer');
  result.policy.purchaseSharing = 'device_profiles';
  assert.equal(resolveSkyOsPolicy({}).policy.purchaseSharing, 'buyer');
});
void test('per-product sharing remains a separate policy, never an access grant', () => {
  const result = resolveSkyOsPolicy({
    SKY_OS_ID: 'fixture',
    SKY_OS_POLICIES: JSON.stringify({
      fixture: { ...shared, purchaseSharing: 'per_product' },
    }),
  });
  assert.equal(result.policy.purchaseSharing, 'per_product');
  assert.equal(Object.hasOwn(result, 'access'), false);
});
