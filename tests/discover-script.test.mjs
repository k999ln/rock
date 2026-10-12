import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

void test('discovery stays review-only and supports scheduled watching', async () => {
  const source = await readFile(new URL('../scripts/discover.mjs', import.meta.url), 'utf8');
  assert.match(source, /PRODUCT_HUNT_BUSINESS_APPROVED === 'true'/);
  assert.match(source, /mode: 'review-only'/);
  assert.match(source, /executionEnabled: false/);
  assert.match(source, /args\.includes\('--watch'\)/);
});
