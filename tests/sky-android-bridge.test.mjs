import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

void test('Pixel bridge bounds local requests, results and gateway discovery without proxy leakage', () => {
  const run = spawnSync('python3', ['-m', 'unittest', 'discover', '-s', 'tests', '-p', 'test_sky_android_bridge.py'], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
});
