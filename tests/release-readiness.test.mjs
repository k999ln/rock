import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateReleaseReadiness } from '../scripts/release-readiness-lib.mjs';

const root = resolve(import.meta.dirname, '..');
const read = (name) => JSON.parse(readFileSync(resolve(root, name), 'utf8'));
const readiness = read('data/release-readiness.json');
const ownerIntent = read('data/release-owner-intent-20260911.json');
const lock = read('package-lock.json');

void test('current release matrix passes while preserving real blockers', () => {
  const result = validateReleaseReadiness({ root, readiness, ownerIntent, lock });
  assert.deepEqual(result.readyTargets, ['web-pwa-owner-preview']);
  assert.equal(result.blockedTargets.length, 5);
  assert.equal(result.missingDependencyLicenses, 0);
});

void test('cannot label a target ready while a required gate is blocked', () => {
  const changed = structuredClone(readiness);
  changed.targets.find(({ id }) => id === 'qemu-developer-preview').declaredStatus = 'ready';
  assert.throws(
    () => validateReleaseReadiness({ root, readiness: changed, ownerIntent, lock }),
    /宣言readyと算出blocked/,
  );
});

void test('cannot pass product license without an owner selection and LICENSE', () => {
  const changed = structuredClone(readiness);
  const target = changed.targets.find(({ id }) => id === 'web-pwa-public-preview');
  target.gates.find(({ id }) => id === 'product-license').status = 'pass';
  target.gates.find(({ id }) => id === 'public-access-approval').status = 'pass';
  target.declaredStatus = 'ready';
  assert.throws(
    () => validateReleaseReadiness({ root, readiness: changed, ownerIntent, lock }),
    /所有者選択とLICENSEなし/,
  );
});

void test('cannot pass production signing without a provisioned owner key', () => {
  const changed = structuredClone(readiness);
  const target = changed.targets.find(({ id }) => id === 'qemu-developer-preview');
  target.gates.find(({ id }) => id === 'production-signing').status = 'pass';
  assert.throws(
    () => validateReleaseReadiness({ root, readiness: changed, ownerIntent, lock }),
    /正式鍵と実施記録なし/,
  );
});

void test('dependency inventory rejects a package without license metadata', () => {
  const changedLock = structuredClone(lock);
  const entry = Object.entries(changedLock.packages).find(([path, value]) => path && value?.version)?.[1];
  delete entry.license;
  assert.throws(
    () => validateReleaseReadiness({ root, readiness, ownerIntent, lock: changedLock }),
    /license表記がありません/,
  );
});
