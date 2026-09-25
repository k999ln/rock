import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const design = read('docs/ai-native-os-architecture.md');
const outbox = read('android/core/src/main/java/dev/rock/core/ExternalWriteOutbox.java');

void test('AI04 outbox keeps the designed effect classes and external-write states', () => {
  assert.ok(design.includes('`local-pure / remote-read / external-write`'));
  assert.ok(design.includes('`prepared → dispatched → confirmed | rejected | uncertain`'));
  assert.ok(outbox.includes('enum Effect { LOCAL_PURE, REMOTE_READ, EXTERNAL_WRITE }'));
  for (const state of ['prepared', 'dispatched', 'confirmed', 'rejected', 'uncertain'])
    assert.ok(outbox.includes(`'${state}'`), state);
});

void test('AI04 outbox stays host/fixture only and keeps the no-resend rules', () => {
  assert.doesNotMatch(outbox, /^import\s+(android\.|java\.net\.|dev\.rock\.automation\.)/m);
  for (const rule of [
    'NOT_AN_EXTERNAL_WRITE',
    'OPERATION_CONFLICT',
    'PROVIDER_KEY_REUSED',
    'REAUTHORIZATION_REQUIRED',
    'APPROVAL_EXPIRED',
    'PROVIDER_RETRY_NOT_GUARANTEED',
    'RECONCILIATION_REQUIRED',
    'COMPENSATION_REQUIRED',
  ])
    assert.ok(outbox.includes(`"${rule}"`), rule);
});
