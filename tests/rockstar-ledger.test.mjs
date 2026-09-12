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
  assert.match(ledger.environment, /PC・MCP/);
  assert.match(ledger.cost, /PC内のSQLite/);
  assert.match(ledger.note, /解約、支払い、税務申告を自動実行せず/);
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
  assert.match(component, /OSに導入して起動/);
  assert.match(component, new RegExp(service.sha256));
  assert.match(component, /sky_service_activate/);
  assert.match(device, /DEVICE_TOOLS/);
});
