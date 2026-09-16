import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

void test('whole-system composition audit passes and preserves honest boundaries', () => {
  const result = spawnSync(
    process.execPath,
    ['scripts/check-system-composition.mjs'],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
    },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /11層 \/ 6経路/);
  assert.match(result.stdout, /統合未完了/);
});

void test('whole-system composition audit records the first value path before full build', async () => {
  const audit = (
    await import('../data/system-composition-audit.json', {
      with: { type: 'json' },
    })
  ).default;
  assert.equal(audit.priorityOrder[0].includes('Sky and Zema'), true);
  assert.equal(audit.priorityOrder[4].includes('full build'), true);
  assert.equal(audit.verdict.productionReady, false);
});
