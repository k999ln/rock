import assert from 'node:assert/strict';
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
