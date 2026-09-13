import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  createCurrentNativeSbom,
  createHistoricalNativeSbom,
  validateQemuReleaseAudit,
  validateReleaseReadiness,
} from '../scripts/release-readiness-lib.mjs';

const root = resolve(import.meta.dirname, '..');
const read = (name) => JSON.parse(readFileSync(resolve(root, name), 'utf8'));
const readiness = read('data/release-readiness.json');
const ownerIntent = read('data/release-owner-intent-20260911.json');
const lock = read('package-lock.json');
const qemuAudit = read('data/qemu-release-audit.json');
const qemuAcceptance = read('docs/evidence/rls01/final-b7-rc2/acceptance-result.json');
const qemuInventory = read('docs/evidence/rls01/remaining-b7-rc2/inventory.json');
const preview = read('data/rockstaros-preview.json');
const historicalNativeInventory = read('docs/evidence/rls01/legal-final-9abf78a/inventory.json');
const lifecycle = read('docs/evidence/rls01/remaining-b7-rc2/lifecycle.json');
const d4 = read('docs/evidence/rls01/remaining-b7-rc2/d4.json');
const d6 = read('docs/evidence/rls01/remaining-b7-rc2/d6.json');

const validateQemu = (audit = qemuAudit) =>
  validateQemuReleaseAudit({
    root,
    audit,
    acceptance: qemuAcceptance,
    inventory: qemuInventory,
    preview,
    historicalInventory: historicalNativeInventory,
    readiness,
    lifecycle,
    d4,
    d6,
  });

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

void test('QEMU audit binds every pass to the exact rc2 source and archive', () => {
  const result = validateQemu();
  assert.equal(result.candidate, '1.0.0-preview.20260911-rc2');
  assert.equal(result.passed, 6);
  assert.equal(result.required, 10);
  assert.deepEqual(result.blocked, [
    'product-license',
    'production-signing',
    'post-signing-same-candidate-acceptance',
    'public-distribution-approval',
  ]);
});

void test('QEMU audit rejects an archive hash that differs from acceptance evidence', () => {
  const changed = structuredClone(qemuAudit);
  changed.candidate.archive.sha256 = '0'.repeat(64);
  assert.throws(() => validateQemu(changed), /archive SHA-256が根拠と不一致/);
});

void test('QEMU audit rejects missing scoped lifecycle or soak evidence', () => {
  assert.throws(
    () =>
      validateQemuReleaseAudit({
        root,
        audit: qemuAudit,
        acceptance: qemuAcceptance,
        inventory: qemuInventory,
        preview,
        historicalInventory: historicalNativeInventory,
        readiness,
        lifecycle: { ...lifecycle, operations: 15 },
        d4,
        d6,
      }),
    /update\/rollback証拠が不足/,
  );
});

void test('historical 9ab native inventory cannot replace the current rc2 manifests', () => {
  const changed = structuredClone(qemuAudit);
  changed.currentNativeInventory.sourceCommit = historicalNativeInventory.source_commit;
  assert.throws(() => validateQemu(changed), /candidate結合が不正/);
});

void test('current rc2 manifest tampering is rejected before SBOM generation', () => {
  const changed = structuredClone(qemuAudit);
  changed.currentNativeInventory.targetManifest.sha256 = '0'.repeat(64);
  assert.throws(() => validateQemu(changed), /manifestのhashが不一致/);
});

void test('current rc2 native SBOM binds 61 scoped components to the exact archive', () => {
  const outputPath = 'work/release/test-native-rc2.cdx.json';
  try {
    const result = createCurrentNativeSbom({ root, audit: qemuAudit, outputPath });
    const sbom = read(outputPath);
    assert.equal(result.count, 61);
    assert.equal(result.targetCount, 24);
    assert.equal(result.hostCount, 37);
    assert.deepEqual(sbom.metadata.component.hashes, [
      { alg: 'SHA-256', content: qemuAudit.candidate.archive.sha256 },
    ]);
    assert.equal(
      sbom.metadata.properties.find(({ name }) => name === 'rockstaros:source-commit').value,
      qemuAudit.candidate.sourceCommit,
    );
    assert.match(
      sbom.metadata.properties.find(({ name }) => name === 'rockstaros:product-license').value,
      /not cleared/,
    );
    assert.equal(
      sbom.components.filter((component) =>
        component.properties.some(({ name, value }) => name === 'rockstaros:scope' && value === 'target'),
      ).length,
      24,
    );
    assert.equal(
      sbom.components.filter((component) =>
        component.properties.some(({ name, value }) => name === 'rockstaros:scope' && value === 'host-build'),
      ).length,
      37,
    );
  } finally {
    unlinkSync(resolve(root, outputPath));
  }
});

void test('historical native SBOM is labeled as evidence-only and keeps target and host scope separate', () => {
  const outputPath = 'work/release/test-native-historical.cdx.json';
  try {
    const result = createHistoricalNativeSbom({
      root,
      inventory: historicalNativeInventory,
      outputPath,
    });
    const sbom = read(outputPath);
    assert.equal(result.count, 61);
    assert.equal(result.targetCount, 24);
    assert.equal(result.hostCount, 37);
    assert.match(
      sbom.metadata.properties.find(({ name }) => name === 'rockstaros:disposition').value,
      /historical evidence only/,
    );
    assert.equal(new Set(sbom.components.map(({ 'bom-ref': bomRef }) => bomRef)).size, 61);
  } finally {
    unlinkSync(resolve(root, outputPath));
  }
});
