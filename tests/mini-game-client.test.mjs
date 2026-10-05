import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { inspect, handoff } from '../toolkits/mini-game-client/client.mjs';

await test('GTA VI PC cannot be launched even when every local dependency exists', async () => {
  let launches = 0;
  const result = await handoff('pro', 'open', { platform: 'darwin', exists: () => true, run: () => { launches++; } });
  assert.equal(result.state, 'blocked');
  assert.equal(result.reason, 'gta6_pc_release_and_requirements_unconfirmed');
  assert.equal(launches, 0);
});

await test('PS5 requires a present client and implemented local launcher', async () => {
  for (const [platform, exists] of [['darwin', (p) => p === '/usr/bin/open'], ['linux', () => true]]) {
    const result = await handoff('ps5', 'open', { platform, exists, run: () => assert.fail('must not launch') });
    assert.equal(result.state, 'blocked');
    assert.equal(result.gameRunning, 'unknown');
  }
});

await test('official client handoff is fixed argv and never claims game or console success', async () => {
  const calls = [];
  const result = await handoff('ps5', 'open', { platform: 'darwin', exists: () => true, run: async (...args) => calls.push(args) });
  assert.deepEqual(calls, [['/usr/bin/open', ['/Applications/PS Remote Play.app']]]);
  assert.equal(result.state, 'client_handoff_requested');
  assert.equal(result.consoleConnection, 'unknown');
  assert.equal(result.gameRunning, 'unknown');
  assert.equal(result.miniHardwareAccepted, false);
});

await test('Xbox uses remote console entry, not a cloud game entitlement', async () => {
  const calls = [];
  const result = await handoff('xbox', 'open', { platform: 'linux', exists: () => true, run: async (...args) => calls.push(args) });
  assert.deepEqual(calls, [['/usr/bin/xdg-open', ['https://www.xbox.com/remoteplay']]]);
  assert.equal(result.titleInstalledAndLicensed, 'unknown');
  assert.equal(result.remotePlayTitleCompatibility, 'unverified');
});

await test('failed launch is not retried or promoted and cannot leak child error details', async () => {
  let count = 0;
  const result = await handoff('xbox', 'open', { platform: 'darwin', exists: () => true, run: async () => { count++; throw new Error('private-process-detail'); } });
  assert.equal(count, 1);
  assert.equal(result.state, 'handoff_failed');
  assert.doesNotMatch(JSON.stringify(result), /private-process-detail/);
});

await test('unknown targets and actions cannot become command arguments', async () => {
  assert.throws(() => inspect('https://example.test/'), /invalid_target/);
  await assert.rejects(handoff('xbox', 'open;whoami'), /invalid_action/);
  const result = spawnSync(process.execPath, ['toolkits/mini-game-client/cli.mjs', 'open', 'xbox', '--url=https://example.test'], { encoding: 'utf8' });
  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
});

await test('real CLI default is read-only diagnosis with unknown runtime state', () => {
  const result = spawnSync(process.execPath, ['toolkits/mini-game-client/cli.mjs'], { encoding: 'utf8' });
  assert.equal(result.status, 0);
  const reports = JSON.parse(result.stdout);
  assert.equal(reports.length, 3);
  for (const report of reports) assert.equal(report.gameRunning, 'unknown');
  assert.equal(reports.find((r) => r.target === 'pro').canRequestClientHandoff, false);
});
