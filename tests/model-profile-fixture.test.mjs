import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const contract = JSON.parse(read('contracts/local-ai-runtime.json'));
const fixture = JSON.parse(read('android/core/src/test/resources/model-profiles-fixture.json'));
const registry = read('android/core/src/main/java/dev/rock/core/ModelProfiles.java');

void test('AI02 fixture profiles target the single contracted runtime adapter without changing it', () => {
  assert.equal(fixture.runtimeAdapter.apiVersion, contract.apiVersion);
  assert.deepEqual(fixture.runtimeAdapter.formats, [contract.modelFormat]);
  assert.equal(fixture.runtimeAdapter.planSchema, contract.planOnly.schemaId);
  assert.equal(fixture.profiles.length, 2);
  const ids = fixture.profiles.map((profile) => `${profile.modelId}@${profile.version}`);
  assert.equal(new Set(ids).size, 2);
  for (const profile of fixture.profiles) {
    assert.equal(profile.planSchema, contract.planOnly.schemaId);
    assert.equal(profile.format, contract.modelFormat);
    assert.ok(profile.runtimeApiMin <= contract.apiVersion && contract.apiVersion <= profile.runtimeApiMax);
    assert.match(profile.measuredOn, /^fixture-/);
    assert.match(profile.qualityResult, /^fixture-/);
  }
});

void test('AI02 registry stays host/fixture only and keeps the pin and rollback rules', () => {
  assert.doesNotMatch(registry, /^import\s+(android\.|java\.net\.|dev\.rock\.automation\.)/m);
  assert.doesNotMatch(registry, /new\s+LocalAiConnection|HttpURLConnection/);
  for (const rule of [
    'INCOMPATIBLE_MODEL_PROFILE',
    'MODEL_PROFILE_CONFLICT',
    'MODEL_PROFILE_NOT_READY',
    'MODEL_PROFILE_MISMATCH',
    'MODEL_PROFILE_PINNED',
    'MODEL_PROFILE_UNAVAILABLE',
    'MODEL_UNAVAILABLE',
    'REPLAN_NOT_REQUIRED',
  ])
    assert.ok(registry.includes(`"${rule}"`), rule);
  assert.ok(read('android/core/src/main/java/dev/rock/core/Engine.java').includes('public void hold(Ticket ticket, String reason)'));
});
