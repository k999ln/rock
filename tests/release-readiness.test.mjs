import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  createCurrentNativeSbom,
  createHistoricalNativeSbom,
  validateAndroidPhysicalReleaseAudit,
  validateOwnerPrivateSitesAudit,
  validatePersonalNumberReleaseAudit,
  validateQemuPostSigningAcceptance,
  validateQemuReleaseAudit,
  validateReleaseReadiness,
  validateWebSecurityPolicy,
} from '../scripts/release-readiness-lib.mjs';

const root = resolve(import.meta.dirname, '..');
const read = (name) => JSON.parse(readFileSync(resolve(root, name), 'utf8'));
const readiness = read('data/release-readiness.json');
const ownerIntent = read('data/release-owner-intent-20260911.json');
const lock = read('package-lock.json');
const androidAudit = read('data/android-physical-release-audit.json');
const personalNumberAudit = read('data/personal-number-release-audit.json');
const sitesAudit = read('data/sites-owner-preview-audit.json');
const sitesHosting = read('.openai/hosting.json');
const webSecurityPolicy = read('data/web-security-policy.json');
const webLicenseAudit = read('data/web-third-party-license-audit.json');
const qemuAudit = read('data/qemu-release-audit.json');
const qemuAcceptance = read('docs/evidence/rls01/final-b7-rc2/acceptance-result.json');
const qemuInventory = read('docs/evidence/rls01/remaining-b7-rc2/inventory.json');
const preview = read('data/rockstaros-preview.json');
const historicalNativeInventory = read('docs/evidence/rls01/legal-final-9abf78a/inventory.json');
const lifecycle = read('docs/evidence/rls01/remaining-b7-rc2/lifecycle.json');
const d4 = read('docs/evidence/rls01/remaining-b7-rc2/d4.json');
const d6 = read('docs/evidence/rls01/remaining-b7-rc2/d6.json');

const validateMatrix = ({
  matrix = readiness,
  intent = ownerIntent,
  dependencyLock = lock,
  android = androidAudit,
  personalNumber = personalNumberAudit,
  sites = sitesAudit,
  hosting = sitesHosting,
  webSecurity = webSecurityPolicy,
  webLicense = webLicenseAudit,
} = {}) =>
  validateReleaseReadiness({
    root,
    readiness: matrix,
    ownerIntent: intent,
    lock: dependencyLock,
    androidAudit: android,
    personalNumberAudit: personalNumber,
    sitesAudit: sites,
    sitesHosting: hosting,
    webSecurityPolicy: webSecurity,
    webLicenseAudit: webLicense,
  });

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
  const result = validateMatrix();
  assert.deepEqual(result.readyTargets, []);
  assert.equal(result.blockedTargets.length, 6);
  assert.equal(result.missingDependencyLicenses, 0);
  assert.deepEqual(result.webLicense, {
    packageEntries: 887,
    uniqueComponents: 854,
    reviewRequired: 47,
  });
  assert.equal(result.sites.status, 'OUTDATED');
  assert.deepEqual(result.webSecurity, { status: 'PASS_SOURCE_POLICY', headers: 8 });
});

void test('Web security source policy is exact and current deployment must prove it independently', () => {
  assert.deepEqual(
    validateWebSecurityPolicy({ root, policy: webSecurityPolicy, readiness }),
    { status: 'PASS_SOURCE_POLICY', headers: 8 },
  );
  const weakened = structuredClone(webSecurityPolicy);
  weakened.universalHeaders['X-Frame-Options'] = 'SAMEORIGIN';
  assert.throws(
    () => validateMatrix({ webSecurity: weakened }),
    /universal header集合または値が不一致/,
  );

  const falselyCurrent = structuredClone(sitesAudit);
  falselyCurrent.sync.status = 'CURRENT';
  falselyCurrent.sync.comparedReviewHead = falselyCurrent.latestVersion.sourceCommit;
  falselyCurrent.sync.commitsBehind = 0;
  falselyCurrent.sync.authorization = 'OWNER_APPROVED_AND_DEPLOYED';
  falselyCurrent.claims.latestApprovedSourceDeployed = true;
  falselyCurrent.deploymentSecurity.status = 'VERIFIED';
  falselyCurrent.deploymentSecurity.observedHeaders = {};
  delete falselyCurrent.deploymentSecurity.nextAction;
  const changed = structuredClone(readiness);
  const target = changed.targets.find(({ id }) => id === 'web-pwa-owner-preview');
  target.gates.find(({ id }) => id === 'latest-approved-source-sync').status = 'pass';
  target.declaredStatus = 'ready';
  assert.throws(
    () =>
      validateOwnerPrivateSitesAudit({
        audit: falselyCurrent,
        hosting: sitesHosting,
        readiness: changed,
        webSecurityPolicy,
      }),
    /security header実読取り/,
  );
});

void test('owner-private delivery stays safe while latest source sync remains blocked', () => {
  const changed = structuredClone(readiness);
  const target = changed.targets.find(({ id }) => id === 'web-pwa-owner-preview');
  target.gates.find(({ id }) => id === 'latest-approved-source-sync').status = 'pass';
  target.declaredStatus = 'ready';
  assert.throws(
    () => validateOwnerPrivateSitesAudit({ audit: sitesAudit, hosting: sitesHosting, readiness: changed, webSecurityPolicy }),
    /未同期状態または必要な所有者行動/,
  );
});

void test('owner-private delivery rejects public or external access readback', () => {
  const changed = structuredClone(sitesAudit);
  changed.site.externalVisitors = 1;
  assert.throws(
    () => validateOwnerPrivateSitesAudit({ audit: changed, hosting: sitesHosting, readiness, webSecurityPolicy }),
    /本人1名限定/,
  );
});

void test('cannot label a target ready while a required gate is blocked', () => {
  const changed = structuredClone(readiness);
  changed.targets.find(({ id }) => id === 'qemu-developer-preview').declaredStatus = 'ready';
  assert.throws(
    () => validateMatrix({ matrix: changed }),
    /宣言readyと算出blocked/,
  );
});

void test('a target cannot become ready by deleting or downgrading a required gate', () => {
  const deleted = structuredClone(readiness);
  const publicTarget = deleted.targets.find(({ id }) => id === 'web-pwa-public-preview');
  publicTarget.gates = publicTarget.gates.filter(({ id }) => id !== 'product-license');
  assert.throws(() => validateMatrix({ matrix: deleted }), /必須ID集合が不一致/);

  const downgraded = structuredClone(readiness);
  downgraded.targets
    .find(({ id }) => id === 'iphone-ipad-client')
    .gates.find(({ id }) => id === 'client-distribution').required = false;
  assert.throws(() => validateMatrix({ matrix: downgraded }), /必須区分が不正/);
});

void test('cannot pass product license with only a license string or placeholder file', () => {
  const changed = structuredClone(readiness);
  const changedIntent = structuredClone(ownerIntent);
  const target = changed.targets.find(({ id }) => id === 'web-pwa-public-preview');
  target.gates.find(({ id }) => id === 'product-license').status = 'pass';
  target.gates.find(({ id }) => id === 'public-access-approval').status = 'pass';
  target.declaredStatus = 'ready';
  changedIntent.ownCodeIntent.specificLicense = 'MIT';
  changedIntent.ownCodeIntent.proposalStatus = 'OWNER_SELECTED';
  assert.throws(
    () => validateMatrix({ matrix: changed, intent: changedIntent }),
    /自作部分だけの適用範囲/,
  );
});

void test('cannot pass production signing with an arbitrary status and provisioned flag', () => {
  const changed = structuredClone(readiness);
  const changedIntent = structuredClone(ownerIntent);
  const target = changed.targets.find(({ id }) => id === 'qemu-developer-preview');
  target.gates.find(({ id }) => id === 'production-signing').status = 'pass';
  changedIntent.signing.keyProvisioned = true;
  changedIntent.signing.status = 'DONE';
  assert.throws(
    () => validateMatrix({ matrix: changed, intent: changedIntent }),
    /確定方式、実施状態、公開鍵pin、UTC完了時刻/,
  );
});

void test('dependency inventory rejects a package without license metadata', () => {
  const changedLock = structuredClone(lock);
  const entry = Object.entries(changedLock.packages).find(([path, value]) => path && value?.version)?.[1];
  delete entry.license;
  assert.throws(
    () => validateMatrix({ dependencyLock: changedLock }),
    /license表記がありません/,
  );
});

void test('dependency license review cannot hide reciprocal, choice, or attribution metadata', () => {
  const changedAudit = structuredClone(webLicenseAudit);
  changedAudit.licenses = changedAudit.licenses.filter(
    ({ expression }) => expression !== 'MPL-2.0',
  );
  assert.throws(
    () => validateMatrix({ webLicense: changedAudit }),
    /review分類が不一致/,
  );
});

void test('dependency license review cannot omit an exact review component', () => {
  const changedAudit = structuredClone(webLicenseAudit);
  changedAudit.reviewComponents = changedAudit.reviewComponents.slice(1);
  assert.throws(
    () => validateMatrix({ webLicense: changedAudit }),
    /要review component一覧が不一致/,
  );
});

void test('dependency license review cannot relabel production reachability or optionality', () => {
  const changedAudit = structuredClone(webLicenseAudit);
  const component = changedAudit.reviewComponents.find(
    ({ lockScope, optional }) => lockScope === 'production-reachable' && optional === false,
  );
  component.lockScope = 'development-only';
  component.optional = true;
  assert.throws(
    () => validateMatrix({ webLicense: changedAudit }),
    /要review component一覧が不一致/,
  );
});

void test('dependency license audit is pinned to the complete package-lock', () => {
  const changedAudit = structuredClone(webLicenseAudit);
  changedAudit.packageLockSha256 = '0'.repeat(64);
  assert.throws(
    () => validateMatrix({ webLicense: changedAudit }),
    /review分類が不一致/,
  );
});

void test('Android and personal-number audits preserve exact real blockers', () => {
  const result = validateMatrix();
  assert.equal(result.android.passed, 0);
  assert.equal(result.android.required, 5);
  assert.deepEqual(result.android.blocked, [
    'exact-model-and-sku',
    'bsp-driver-boot-recovery',
    'android-cdd-cts',
    'production-signing',
    'regional-radio-and-sales',
  ]);
  assert.equal(result.personalNumber.passed, 1);
  assert.equal(result.personalNumber.required, 7);
  assert.deepEqual(result.personalNumber.blocked, [
    'purpose-and-necessity',
    'authorized-operator-and-provider',
    'data-flow-retention-and-deletion',
    'security-and-privacy-review',
    'incident-and-vendor-governance',
    'activation-approval',
  ]);
});

void test('Android compatibility and physical flash claims require their exact gates', () => {
  const changedCompatibility = structuredClone(androidAudit);
  changedCompatibility.claims.androidCompatible = true;
  assert.throws(
    () => validateAndroidPhysicalReleaseAudit({ root, audit: changedCompatibility, readiness }),
    /CDD\/CTS合格なし/,
  );

  const changedFlash = structuredClone(androidAudit);
  changedFlash.claims.physicalFlashVerified = true;
  assert.throws(
    () => validateAndroidPhysicalReleaseAudit({ root, audit: changedFlash, readiness }),
    /BSP\/復旧合格なし/,
  );

  const missingClaim = structuredClone(androidAudit);
  delete missingClaim.claims.androidCompatible;
  assert.throws(
    () => validateAndroidPhysicalReleaseAudit({ root, audit: missingClaim, readiness }),
    /claimの真偽値がありません/,
  );
});

void test('Android gate list and public matrix cannot drift apart', () => {
  const missingGate = structuredClone(androidAudit);
  missingGate.requirements.pop();
  assert.throws(
    () => validateAndroidPhysicalReleaseAudit({ root, audit: missingGate, readiness }),
    /必須ID集合が不一致/,
  );

  const changedMatrix = structuredClone(readiness);
  changedMatrix.targets
    .find(({ id }) => id === 'android-physical-preview')
    .gates.find(({ id }) => id === 'exact-model-and-sku').status = 'pass';
  assert.throws(
    () => validateMatrix({ matrix: changedMatrix }),
    /公開台帳と監査が不一致/,
  );
});

void test('Android gate PASS requires hashed role evidence from the selected device', () => {
  const changed = structuredClone(androidAudit);
  changed.candidate.selectionStatus = 'selected';
  changed.candidate.device = {
    manufacturer: 'Fixture',
    commercialModel: 'Fixture Phone',
    modelNumber: 'MODEL-1',
    sku: 'SKU-1',
    region: 'JP',
    codename: 'fixture',
    bootloaderUnlockable: true,
    observedBootloaderState: 'locked',
  };
  const requirement = changed.requirements.find(({ id }) => id === 'exact-model-and-sku');
  requirement.status = 'pass';
  requirement.evidence = ['docs/android-and-personal-number-gates-20260913.md'];
  const matrix = structuredClone(readiness);
  matrix.targets
    .find(({ id }) => id === 'android-physical-preview')
    .gates.find(({ id }) => id === 'exact-model-and-sku').status = 'pass';
  assert.throws(
    () => validateAndroidPhysicalReleaseAudit({ root, audit: changed, readiness: matrix }),
    /必須roleごとの別file根拠/,
  );
});

void test('Android build gates cannot pass before exact device and BSP gates', () => {
  const changed = structuredClone(androidAudit);
  const requirement = changed.requirements.find(({ id }) => id === 'android-cdd-cts');
  requirement.status = 'pass';
  requirement.evidence = ['docs/android-and-personal-number-gates-20260913.md'];
  const matrix = structuredClone(readiness);
  matrix.targets
    .find(({ id }) => id === 'android-physical-preview')
    .gates.find(({ id }) => id === 'android-cdd-cts').status = 'pass';
  assert.throws(
    () => validateAndroidPhysicalReleaseAudit({ root, audit: changed, readiness: matrix }),
    /型番\/SKU gateより先/,
  );
});

void test('GMS cannot appear in the default AOSP preview without its separate license gate', () => {
  const changed = structuredClone(androidAudit);
  changed.claims.gmsIncluded = true;
  assert.throws(
    () => validateAndroidPhysicalReleaseAudit({ root, audit: changed, readiness }),
    /GMS同梱・許諾を表示できません/,
  );
});

void test('personal number and card images stay disabled before final approval', () => {
  for (const field of ['collectsPersonalNumber', 'storesPersonalNumber', 'storesCardImage', 'normalProfileField']) {
    const changed = structuredClone(personalNumberAudit);
    changed.dataCapture[field] = true;
    assert.throws(
      () => validatePersonalNumberReleaseAudit({ root, audit: changed, readiness }),
      /最終承認前/,
    );
  }

  const missingFlag = structuredClone(personalNumberAudit);
  delete missingFlag.dataCapture.storesCardImage;
  assert.throws(
    () => validatePersonalNumberReleaseAudit({ root, audit: missingFlag, readiness }),
    /取得状態の真偽値がありません/,
  );
});

void test('personal-number gate list and official-source boundary are fail closed', () => {
  const missingGate = structuredClone(personalNumberAudit);
  missingGate.requirements.splice(2, 1);
  assert.throws(
    () => validatePersonalNumberReleaseAudit({ root, audit: missingGate, readiness }),
    /必須ID集合が不一致/,
  );

  const untrustedReference = structuredClone(personalNumberAudit);
  untrustedReference.references[0].url = 'https://example.com/my-number';
  assert.throws(
    () => validatePersonalNumberReleaseAudit({ root, audit: untrustedReference, readiness }),
    /許可されていない/,
  );
});

void test('personal-number purpose PASS requires exact hashed legal evidence roles', () => {
  const changed = structuredClone(personalNumberAudit);
  const requirement = changed.requirements.find(({ id }) => id === 'purpose-and-necessity');
  requirement.status = 'pass';
  requirement.evidence = ['docs/android-and-personal-number-gates-20260913.md'];
  const matrix = structuredClone(readiness);
  matrix.targets
    .find(({ id }) => id === 'personal-number-identity')
    .gates.find(({ id }) => id === 'purpose-and-necessity').status = 'pass';
  assert.throws(
    () => validatePersonalNumberReleaseAudit({ root, audit: changed, readiness: matrix }),
    /必須roleごとの別file根拠/,
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

void test('QEMU audit rejects post-signing PASS without a same-candidate result', () => {
  const changed = structuredClone(qemuAudit);
  for (const id of ['product-license', 'production-signing', 'post-signing-same-candidate-acceptance']) {
    changed.requirements.find((requirement) => requirement.id === id).status = 'pass';
  }
  assert.throws(() => validateQemu(changed), /署名後の同一候補受入resultがありません/);
});

void test('post-signing acceptance binds ten PASS checks and every evidence hash', () => {
  const fixtureDirectory = resolve(root, 'work/release/post-signing-fixture');
  mkdirSync(fixtureDirectory, { recursive: true });
  const makeEvidence = (role) => {
    const path = `work/release/post-signing-fixture/${role}.json`;
    const source = `${JSON.stringify({ role, fixture: 'synthetic-not-release-evidence' })}\n`;
    const sha256 = createHash('sha256').update(source).digest('hex');
    writeFileSync(resolve(root, path), source);
    return { role, path, sha256 };
  };
  const signingEvidence = [
    'release-manifest', 'release-authentication', 'public-key', 'trust-bundle',
  ].map(makeEvidence);
  const legalEvidence = ['license', 'notice', 'sbom'].map(makeEvidence);
  const checkEvidence = [makeEvidence('check-report')].map(({ path, sha256 }) => ({ path, sha256 }));
  const evidenceSha = (items, role) => items.find((item) => item.role === role).sha256;
  const record = {
    schema: 'rockstaros-qemu-post-signing-acceptance/1',
    status: 'PASS_POST_SIGNING_SAME_CANDIDATE',
    completedAt: '2026-09-13T04:00:00Z',
    candidate: structuredClone(qemuAudit.candidate),
    immutableCandidate: {
      beforeSha256: qemuAudit.candidate.archive.sha256,
      afterSha256: qemuAudit.candidate.archive.sha256,
      bytesUnchanged: true,
    },
    signing: {
      status: 'PRODUCTION_SIGNATURE_VERIFIED',
      authenticationStatus: 'AUTHENTICATED_NOT_LAUNCH_ACCEPTED',
      releaseManifestSha256: evidenceSha(signingEvidence, 'release-manifest'),
      releaseAuthenticationSha256: evidenceSha(signingEvidence, 'release-authentication'),
      publicKeySha256: evidenceSha(signingEvidence, 'public-key'),
      trustBundleSha256: evidenceSha(signingEvidence, 'trust-bundle'),
      evidence: signingEvidence,
    },
    legal: {
      productLicense: 'TEST-ONLY',
      licenseFileSha256: evidenceSha(legalEvidence, 'license'),
      noticeSha256: evidenceSha(legalEvidence, 'notice'),
      sbomSha256: evidenceSha(legalEvidence, 'sbom'),
      evidence: legalEvidence,
    },
    freshWorkspace: true,
    sourceDeviceReused: false,
    environment: {
      hostOs: 'fixture',
      hostVersion: '1',
      architecture: 'arm64',
      qemuVersion: 'fixture',
      machine: 'virt-10.0',
    },
    checks: [
      'authentication', 'fresh-install', 'update', 'rollback', 'backup', 'restore',
      'interruption-recovery', 'diagnostics', 'normal-shutdown', 'removal',
    ].map((id) => ({ id, status: 'PASS', evidence: checkEvidence })),
  };
  try {
    assert.deepEqual(
      validateQemuPostSigningAcceptance({ root, record, candidate: qemuAudit.candidate }),
      { status: 'PASS_POST_SIGNING_SAME_CANDIDATE', checks: 10 },
    );
    const mismatchedRole = structuredClone(record);
    mismatchedRole.signing.releaseManifestSha256 = record.signing.publicKeySha256;
    assert.throws(
      () => validateQemuPostSigningAcceptance({ root, record: mismatchedRole, candidate: qemuAudit.candidate }),
      /roleとpinが不一致/,
    );
    writeFileSync(resolve(root, checkEvidence[0].path), '{}\n');
    assert.throws(
      () => validateQemuPostSigningAcceptance({ root, record, candidate: qemuAudit.candidate }),
      /根拠hashが不一致/,
    );
  } finally {
    rmSync(fixtureDirectory, { recursive: true, force: true });
  }
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
