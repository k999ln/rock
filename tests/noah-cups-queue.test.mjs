import assert from 'node:assert/strict';
import test from 'node:test';
import { resumeQueue } from '../scripts/noah-cups-queue.mjs';

void test('CUPS resume plans first, writes once only with consent, then reads the same queue', async () => {
  const calls = [];
  let enabled = false;
  const run = async (command, args) => {
    calls.push([command, ...args]);
    if (command === '/usr/sbin/cupsenable') enabled = true;
    return enabled ? 'printer demo is idle. enabled since yesterday\n' : 'printer demo disabled since yesterday\n';
  };
  const plan = await resumeQueue('demo', { platform: 'linux', run });
  assert.equal(plan.status, 'ready-to-resume');
  assert.equal(calls.length, 1);
  const repaired = await resumeQueue('demo', { platform: 'linux', apply: true, run });
  assert.equal(repaired.status, 'queue-resumed');
  assert.deepEqual(calls.slice(1), [
    ['/usr/bin/lpstat', '-h', '127.0.0.1:631', '-p', 'demo'],
    ['/usr/sbin/cupsenable', '-h', '127.0.0.1:631', 'demo'],
    ['/usr/bin/lpstat', '-h', '127.0.0.1:631', '-p', 'demo'],
  ]);
});

void test('CUPS resume rejects unchecked destinations and reports an unknown outcome after an attempted write', async () => {
  const run = async (command) => {
    if (command === '/usr/sbin/cupsenable') throw new Error('network failure');
    return 'printer demo disabled since yesterday\n';
  };
  assert.equal((await resumeQueue('--release', { platform: 'linux', apply: true, run })).status, 'invalid-queue');
  assert.equal((await resumeQueue('demo', { platform: 'darwin', apply: true, run })).status, 'unsupported-platform');
  const result = await resumeQueue('demo', { platform: 'linux', apply: true, run });
  assert.equal(result.status, 'result-unverified');
  assert.equal(result.writes, 'unknown');
});
