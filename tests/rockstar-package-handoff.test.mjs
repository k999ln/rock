import assert from 'node:assert/strict';
import test from 'node:test';
import { rockstarPackageHandoffMessage } from '../lib/rockstar-package-handoff.ts';

void test('package handoff pins the exact reviewed capability into the quote-bound A2A task', () => {
  const packageKey = 'health.local-guide@1.2.3';
  const manifestSha256 = 'a'.repeat(64);
  const message = rockstarPackageHandoffMessage({
    packageKey, manifestSha256, name: 'Local Guide', summary: '健康相談の初期ガイド',
  }, '症状に応じた受診先の候補を整理してください。');
  assert.ok(message.includes(packageKey));
  assert.ok(message.includes(manifestSha256));
  assert.match(message, /実行できる保証はありません/);
  assert.match(message, /実行したと偽らないでください/);
  assert.match(message, /症状に応じた受診先の候補を整理してください/);
});

void test('package handoff rejects malformed identity and messages over A2A bounds', () => {
  const base = {
    packageKey: 'health.local-guide@1.2.3', manifestSha256: 'b'.repeat(64),
    name: 'Local Guide', summary: '案内',
  };
  assert.throws(() => rockstarPackageHandoffMessage({ ...base, packageKey: '../fake' }, '依頼'),
    { message: 'ROCKSTAR_PACKAGE_HANDOFF_INVALID' });
  assert.throws(() => rockstarPackageHandoffMessage(base, '依頼'.repeat(4_000)),
    { message: 'ROCKSTAR_PACKAGE_HANDOFF_TOO_LARGE' });
});
