import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

void test('owner guest updater uses real files/locks/receipts and preserves data across synthetic service failures', () => {
  const result = spawnSync('python3', ['-m', 'unittest', 'discover', '-s', 'tests', '-p', 'test_pixel_guest_update.py'], {
    cwd: new URL('..', import.meta.url), encoding: 'utf8', timeout: 30000,
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stderr, /Ran 18 tests/);
});
