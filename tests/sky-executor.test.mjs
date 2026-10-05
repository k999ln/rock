import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const design = read('docs/ai-native-os-architecture.md');
const sky = read('android/core/src/main/java/dev/rock/core/SkyExecutor.java');

const fields = 'protocolVersion, deviceRef, coreApiRange, toolVersions, planSchemas, effects, storageSchemaRange, modelProfiles, limits, connectivity, observedAt, expiresAt, generation';

void test('AI05 capability response keeps the designed field list (design read-only)', () => {
  assert.ok(design.includes(`\`${fields}\``));
  assert.ok(sky.includes(fields));
  for (const name of fields.split(', ')) assert.ok(sky.includes(`"${name}"`), name);
  assert.ok(design.includes('選択時だけでなくsubmit/claim時にもOSが再検査する'));
  assert.ok(design.includes('一台の永続selection'));
});

void test('AI05 executor stays host/fixture only and keeps its refusal rules', () => {
  assert.doesNotMatch(sky, /^import\s+(android\.|java\.net\.|dev\.rock\.automation\.)/m);
  for (const rule of [
    'CAPABILITY_MISSING',
    'CAPABILITY_STALE',
    'UNKNOWN_REQUIRED_CAPABILITY:',
    'CORE_API_RANGE_MISMATCH',
    'STORAGE_SCHEMA_RANGE_MISMATCH',
    'EFFECT_NOT_OFFERED',
    'MODEL_PROFILE_MISSING',
    'SELECTION_REVALIDATION_REQUIRED',
    'NOT_DESIGNATED_EXECUTOR',
    'AUTHORITY_DEVICE_MISMATCH',
    'EXECUTOR_CONFIRMATION_REQUIRED',
    'OWNER_MISMATCH',
    'REVISION_CONFLICT',
    'SNAPSHOT_CORRUPT',
    'CAPABILITY_RECORD_CORRUPT',
  ])
    assert.ok(sky.includes(`"${rule}`), rule);
});
