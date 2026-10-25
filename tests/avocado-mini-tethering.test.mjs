import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
await test('Mini satellite tethering durable control-plane and negative cases', () => {
  const result = spawnSync('python3', ['-B', '-m', 'unittest', 'discover', '-s',
    'systems/rock-star-os/targets/avocado-mini/tethering', '-p', 'test_*.py'],
  // Broker/entitlement + real Unix socket regressions share a loaded host with
  // the full Node suite. This is the suite budget, not a transport deadline.
  { cwd: root, encoding: 'utf8', timeout: 180_000, maxBuffer: 256 * 1024 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stderr, /Ran \d+ tests/);
});
