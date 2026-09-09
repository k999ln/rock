import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

void test('PC citations runs the real fixed CLI with bounded failure and cleanup', () => {
  const result = spawnSync('python3', ['-B', '-W', 'error::ResourceWarning', 'tests/mr_pc_adapter.py', '-v'], {
    encoding: 'utf8', timeout: 45000, maxBuffer: 1024 * 1024,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /Ran 19 tests/);
  assert.match(result.stderr, /\nOK\s*$/);
  assert.doesNotMatch(result.stderr, /ResourceWarning:|Exception ignored|skipped=/);
});
