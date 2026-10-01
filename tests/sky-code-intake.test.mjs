import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeSkyCodeIntake } from '../lib/sky-code-intake.ts';

void test('a pasted function becomes a local Sky package without another form', async () => {
  const result = await analyzeSkyCodeIntake({
    fileName: 'count.ts',
    code: `export function countCharacters(text: string) {
      return { characters: [...text].length };
    }`,
  });
  assert.equal(result.language, 'TypeScript');
  assert.equal(result.entrypoint, 'countCharacters');
  assert.equal(result.manifest.source.kind, 'inline_code');
  assert.equal(result.manifest.source.url, null);
  assert.equal(result.manifest.capabilities.connectivity, 'offline');
  assert.deepEqual(result.manifest.io.inputSchema.required, ['text']);
  assert.match(result.integrationCode, /createSkyToolApp/);
  assert.match(result.sourceSha256, /^[0-9a-f]{64}$/);
});

void test('financial code receives a per-run confirmation contract', async () => {
  const result = await analyzeSkyCodeIntake({
    fileName: 'charge.js',
    code: `export async function chargeCustomer(amount) {
      return stripe.paymentIntents.create({ amount });
    }`,
  });
  assert.deepEqual(result.manifest.capabilities.sideEffects, ['financial']);
  assert.ok(result.manifest.capabilities.permissions.includes('financial_action'));
  assert.equal(result.manifest.execution.confirmation, 'per_run');
  assert.equal(result.manifest.execution.maxAttempts, 1);
});
