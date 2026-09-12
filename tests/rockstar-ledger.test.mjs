import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

import { catalog } from '../lib/catalog.ts';

void test('Sky exposes Rockstar Ledger as a ready local tool', () => {
  const ledger = catalog.find((tool) => tool.id === 'rockstar-ledger');

  assert.ok(ledger);
  assert.equal(ledger.name, 'サブスク顧問');
  assert.equal(ledger.status, 'ready');
  assert.equal(ledger.runner, 'subscription-ledger');
  assert.equal(ledger.origin, 'rockstaros');
  assert.match(ledger.environment, /RockstarOS端末/);
  assert.match(ledger.cost, /実行端末内のSQLite/);
  assert.match(ledger.note, /解約、支払い、税務申告を自動実行せず/);
  assert.equal(ledger.execution.primaryHost, 'rockstaros_device');
  assert.deepEqual(ledger.execution.supportedHosts, [
    'rockstaros_device',
    'user_pc',
  ]);
  assert.equal(ledger.execution.cloudDependency, 'none');
  assert.equal(ledger.execution.codexRole, 'optional_client');
  assert.equal(ledger.execution.unattended, true);
});

void test('Sky distribution contains the ledger package and license', () => {
  assert.equal(existsSync('public/toolkits/rockstar-ledger.zip'), true);
  const license = readFileSync(
    'public/toolkits/rockstar-ledger-LICENSE.txt',
    'utf8',
  );
  assert.match(license, /^MIT License/);
});

void test('Sky exposes an OS-reviewed one-tap ledger installer', () => {
  const bundle = readFileSync('public/toolkits/rockstar-ledger.zip');
  const catalog = JSON.parse(
    readFileSync('systems/rock-star-os/os/sky-services/catalog.json', 'utf8'),
  );
  const component = readFileSync(
    'components/subscription-ledger-runner.tsx',
    'utf8',
  );
  const device = readFileSync('lib/device.ts', 'utf8');
  const service = catalog.services.find(
    (item) => item.id === 'rockstar-ledger',
  );

  assert.ok(service);
  assert.equal(
    service.sha256,
    createHash('sha256').update(bundle).digest('hex'),
  );
  assert.deepEqual(service.permissions, [
    'subscription.read',
    'subscription.write',
    'local.files',
  ]);
  assert.deepEqual(service.data_policy, {
    storage: 'device_private',
    network: 'loopback_only',
  });
  assert.deepEqual(service.execution_profile, {
    primary_host: 'rockstaros_hardware',
    supported_hosts: ['rockstaros_hardware', 'connected_pc'],
    host_operator: 'rockstaros_or_user',
    controller: 'sky',
    transport: 'local_mcp_loopback',
    cloud_dependency: 'none',
    codex_role: 'optional_client',
    offline_capable: true,
    unattended: true,
    data_residency: 'device_private',
    power_source: 'host_supplied',
    self_generation: 'not_verified',
  });
  assert.match(component, /OSに導入して起動/);
  assert.match(component, new RegExp(service.sha256));
  assert.match(component, /sky_service_activate/);
  assert.match(device, /DEVICE_TOOLS/);
});

void test('Sky shows an execution passport without claiming self-generation', () => {
  const passport = readFileSync('components/execution-passport.tsx', 'utf8');
  const submission = readFileSync('lib/sky-submission.ts', 'utf8');

  assert.match(passport, /どこで、何を経由して動くか/);
  assert.match(passport, /Cloud/);
  assert.match(passport, /Codex/);
  assert.match(passport, /自家発電装置との接続確認はまだありません/);
  assert.match(submission, /runtimeProfile/);
  assert.match(submission, /主な実行場所/);
});
