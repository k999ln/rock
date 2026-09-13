import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { createHash } from 'node:crypto';

const allowedGateStates = new Set(['pass', 'blocked', 'not_applicable']);
const allowedTargetStates = new Set(['ready', 'blocked']);
const allowedQemuRequirementStates = new Set(['pass', 'blocked']);

const fail = (message) => {
  throw new Error(`release-readiness: ${message}`);
};

const inside = (root, path) => {
  const candidate = resolve(root, path);
  return !isAbsolute(path) && !relative(root, candidate).startsWith('..');
};

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const sha256Pattern = /^[0-9a-f]{64}$/;

const assertExactIds = (items, expectedIds, label) => {
  const actualIds = items.map(({ id }) => id);
  if (actualIds.length !== new Set(actualIds).size) fail(label + ': IDが重複しています');
  if (
    actualIds.length !== expectedIds.length ||
    expectedIds.some((id) => !actualIds.includes(id))
  ) {
    fail(label + ': 必須ID集合が不一致です');
  }
};

const validateOfficialReferences = (references, allowedHosts, label) => {
  if (!Array.isArray(references) || references.length === 0) fail(label + ': 公式参照がありません');
  const ids = references.map(({ id }) => id);
  if (ids.some((id) => !id) || ids.length !== new Set(ids).size) fail(label + ': 公式参照IDが不正です');
  for (const reference of references) {
    let url;
    try {
      url = new URL(reference.url);
    } catch {
      fail(label + ': 公式参照URLが不正です');
    }
    if (url.protocol !== 'https:' || !allowedHosts.has(url.hostname) || !reference.scope) {
      fail(label + ': 許可されていない、または説明のない公式参照です');
    }
  }
};

const validateAuditRequirements = ({ root, requirements, expected, label }) => {
  if (!Array.isArray(requirements)) fail(label + ': requirementsがありません');
  assertExactIds(requirements, [...expected.keys()], label + ' requirements');
  for (const requirement of requirements) {
    if (
      requirement.required !== expected.get(requirement.id) ||
      !allowedGateStates.has(requirement.status)
    ) {
      fail(label + '/' + requirement.id + ': requirement状態が不正です');
    }
    if (requirement.status === 'not_applicable' && (requirement.required || !requirement.reason)) {
      fail(label + '/' + requirement.id + ': 適用外の宣言が不正です');
    }
    if (requirement.status === 'blocked' && !requirement.ownerAction && !requirement.nextAction) {
      fail(label + '/' + requirement.id + ': 未達時の必要行動がありません');
    }
    if (requirement.status === 'pass') {
      if (!Array.isArray(requirement.evidence) || requirement.evidence.length === 0) {
        fail(label + '/' + requirement.id + ': 合格根拠がありません');
      }
      for (const evidence of requirement.evidence) {
        if (!inside(root, evidence) || !existsSync(resolve(root, evidence))) {
          fail(label + '/' + requirement.id + ': 根拠がありません: ' + evidence);
        }
      }
    }
  }
};

export function parseBuildrootCsv(source) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"') quoted = true;
    else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n') {
      row.push(field.replace(/\r$/, ''));
      if (row.some((value) => value.length)) rows.push(row);
      row = [];
      field = '';
    } else field += character;
  }
  if (quoted) fail('Buildroot CSVの引用符が閉じていません');
  if (field.length || row.length) {
    row.push(field.replace(/\r$/, ''));
    rows.push(row);
  }
  if (rows.length < 2) fail('Buildroot CSVにpackage行がありません');
  const headers = rows[0];
  const packages = rows.slice(1).map((values) =>
    Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])),
  );
  if (packages.some((pkg) => !pkg.PACKAGE || !pkg.VERSION || !pkg.LICENSE)) {
    fail('Buildroot CSVのpackage metadataが不完全です');
  }
  return packages;
}

export function deriveTargetStatus(target) {
  return target.gates.every(
    (gate) => !gate.required || gate.status === 'pass',
  )
    ? 'ready'
    : 'blocked';
}

export function packageEntries(lock) {
  return Object.entries(lock.packages || {})
    .filter(([path, value]) => path && value?.version)
    .map(([path, value]) => ({
      path,
      name: value.name || path.split('node_modules/').at(-1),
      ...value,
    }));
}

export function validateAndroidPhysicalReleaseAudit({ root, audit, readiness }) {
  const label = 'Android物理端末監査';
  if (audit?.schema !== 'rockstaros-android-physical-release-audit/1') fail(label + ': schemaが違います');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(audit.evaluatedAt || '')) fail(label + ': 評価日が必要です');
  const expected = new Map([
    ['exact-model-and-sku', true],
    ['bsp-driver-boot-recovery', true],
    ['android-cdd-cts', true],
    ['gms', false],
    ['production-signing', true],
    ['regional-radio-and-sales', true],
  ]);
  validateAuditRequirements({ root, requirements: audit.requirements, expected, label });
  validateOfficialReferences(
    audit.references,
    new Set(['source.android.com', 'www.android.com', 'laws.e-gov.go.jp']),
    label,
  );

  const target = readiness.targets.find(({ id }) => id === 'android-physical-preview');
  if (
    readiness.policy?.androidPhysicalAudit !== 'data/android-physical-release-audit.json' ||
    target?.candidateAudit !== 'data/android-physical-release-audit.json'
  ) {
    fail(label + ': 公開台帳から監査正本への参照がありません');
  }
  for (const requirement of audit.requirements) {
    const gate = target.gates.find(({ id }) => id === requirement.id);
    if (
      !gate ||
      gate.required !== requirement.required ||
      gate.status !== requirement.status
    ) {
      fail(label + '/' + requirement.id + ': 公開台帳と監査が不一致です');
    }
  }
  if (target.gates.length !== audit.requirements.length) fail(label + ': 公開台帳のgate数が不一致です');

  const requirement = (id) => audit.requirements.find((item) => item.id === id);
  const deviceValues = Object.values(audit.candidate?.device || {});
  const buildValues = Object.values(audit.candidate?.build || {});
  if (audit.candidate?.selectionStatus === 'not_selected') {
    if (
      deviceValues.some((value) => value !== null) ||
      buildValues.some((value) => value !== null) ||
      requirement('exact-model-and-sku').status !== 'blocked'
    ) {
      fail(label + ': 未選択候補に端末/build識別子または合格状態を設定できません');
    }
  } else if (audit.candidate?.selectionStatus === 'selected') {
    const device = audit.candidate.device || {};
    const strings = ['manufacturer', 'commercialModel', 'modelNumber', 'sku', 'region', 'codename', 'observedBootloaderState'];
    if (
      strings.some((key) => typeof device[key] !== 'string' || !device[key].trim()) ||
      typeof device.bootloaderUnlockable !== 'boolean'
    ) {
      fail(label + ': 選択済み端末の型番/SKU/bootloader実測が不足しています');
    }
  } else {
    fail(label + ': selectionStatusが不正です');
  }

  const claims = audit.claims || {};
  for (const key of [
    'androidCompatible',
    'gmsIncluded',
    'gmsLicensed',
    'saleReady',
    'physicalFlashVerified',
  ]) {
    if (typeof claims[key] !== 'boolean') fail(label + ': claimの真偽値がありません: ' + key);
  }
  if (claims.androidCompatible && requirement('android-cdd-cts').status !== 'pass') {
    fail(label + ': CDD/CTS合格なしにAndroid互換を表示できません');
  }
  if (requirement('android-cdd-cts').status === 'pass' && !claims.androidCompatible) {
    fail(label + ': CDD/CTS合格後の互換表示状態が一致しません');
  }
  if (claims.physicalFlashVerified && requirement('bsp-driver-boot-recovery').status !== 'pass') {
    fail(label + ': BSP/復旧合格なしに物理flash済みと表示できません');
  }
  if (
    claims.gmsIncluded ||
    claims.gmsLicensed ||
    audit.gms?.policy !== 'aosp_without_gms' ||
    audit.gms?.licenseStatus !== 'not_requested' ||
    requirement('gms').status !== 'not_applicable'
  ) {
    fail(label + ': 現在のAOSP Developer PreviewへGMS同梱・許諾を表示できません');
  }
  if (
    claims.saleReady &&
    requirement('regional-radio-and-sales').status !== 'pass'
  ) {
    fail(label + ': 地域審査なしに販売可能と表示できません');
  }
  if (
    claims.physicalFlashVerified === false &&
    requirement('bsp-driver-boot-recovery').status === 'pass'
  ) {
    fail(label + ': BSP/復旧gate合格には物理flash実測が必要です');
  }

  if (requirement('bsp-driver-boot-recovery').status === 'pass') {
    const roles = new Set((audit.artifacts || []).map(({ role }) => role));
    for (const role of ['bsp', 'vendor-drivers', 'boot-chain', 'recovery']) {
      if (!roles.has(role)) fail(label + ': 必須artifactがありません: ' + role);
    }
    if ((audit.artifacts || []).some(({ sha256: hash }) => !sha256Pattern.test(hash || ''))) {
      fail(label + ': artifact SHA-256が不正です');
    }
  }
  if (requirement('android-cdd-cts').status === 'pass') {
    const build = audit.candidate.build || {};
    const compatibility = audit.compatibility || {};
    if (
      !build.androidRelease ||
      !Number.isInteger(build.apiLevel) ||
      !build.buildFingerprint ||
      !sha256Pattern.test(build.sourceCommit || '') ||
      !sha256Pattern.test(build.imageSha256 || '') ||
      !compatibility.cddVersion ||
      !compatibility.ctsRevision ||
      !sha256Pattern.test(compatibility.ctsResultSha256 || '') ||
      !sha256Pattern.test(compatibility.ctsVerifierResultSha256 || '')
    ) {
      fail(label + ': 同一buildのCDD/CTS/CTS Verifier識別子が不足しています');
    }
  }
  if (requirement('production-signing').status === 'pass') {
    if (
      audit.signing?.status !== 'verified' ||
      !audit.signing.keyId ||
      !audit.signing.rollbackPolicyEvidence ||
      !audit.signing.rotationAndRevocationEvidence
    ) {
      fail(label + ': production署名・rollback・rotation/失効証拠が不足しています');
    }
  }
  if (requirement('regional-radio-and-sales').status === 'pass') {
    if (
      !audit.regionalDistribution?.salesModel ||
      !audit.regionalDistribution?.radioOperation ||
      !Array.isArray(audit.regionalDistribution?.regions) ||
      audit.regionalDistribution.regions.length === 0 ||
      !Array.isArray(audit.regionalDistribution?.complianceEvidence) ||
      audit.regionalDistribution.complianceEvidence.length === 0
    ) {
      fail(label + ': 販売形態・地域・radio影響・適合審査が不足しています');
    }
  }
  if (
    audit.personalNumberBoundary?.status !== 'disabled_separate_gate' ||
    audit.personalNumberBoundary?.audit !== 'data/personal-number-release-audit.json'
  ) {
    fail(label + ': マイナンバーをAndroid互換gateへ混在させられません');
  }

  const derived = audit.requirements.every(({ required, status }) => !required || status === 'pass')
    ? 'ready'
    : 'blocked';
  if (audit.declaredStatus !== derived || target.declaredStatus !== derived) {
    fail(label + ': 宣言状態と算出状態が不一致です');
  }
  return {
    passed: audit.requirements.filter(({ required, status }) => required && status === 'pass').length,
    required: audit.requirements.filter(({ required }) => required).length,
    blocked: audit.requirements.filter(({ required, status }) => required && status === 'blocked').map(({ id }) => id),
  };
}

export function validatePersonalNumberReleaseAudit({ root, audit, readiness }) {
  const label = 'マイナンバー監査';
  if (audit?.schema !== 'rockstaros-personal-number-release-audit/1') fail(label + ': schemaが違います');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(audit.evaluatedAt || '')) fail(label + ': 評価日が必要です');
  const expected = new Map([
    ['disabled-until-approved', true],
    ['purpose-and-necessity', true],
    ['authorized-operator-and-provider', true],
    ['data-flow-retention-and-deletion', true],
    ['security-and-privacy-review', true],
    ['incident-and-vendor-governance', true],
    ['activation-approval', true],
  ]);
  validateAuditRequirements({ root, requirements: audit.requirements, expected, label });
  validateOfficialReferences(audit.references, new Set(['www.ppc.go.jp']), label);

  const target = readiness.targets.find(({ id }) => id === 'personal-number-identity');
  if (
    readiness.policy?.personalNumberAudit !== 'data/personal-number-release-audit.json' ||
    target?.candidateAudit !== 'data/personal-number-release-audit.json'
  ) {
    fail(label + ': 公開台帳から監査正本への参照がありません');
  }
  for (const requirement of audit.requirements) {
    const gate = target.gates.find(({ id }) => id === requirement.id);
    if (
      !gate ||
      gate.required !== requirement.required ||
      gate.status !== requirement.status
    ) {
      fail(label + '/' + requirement.id + ': 公開台帳と監査が不一致です');
    }
  }
  if (target.gates.length !== audit.requirements.length) fail(label + ': 公開台帳のgate数が不一致です');

  const requirement = (id) => audit.requirements.find((item) => item.id === id);
  if (requirement('disabled-until-approved').status !== 'pass') {
    fail(label + ': 審査完了までdefault-deny境界を維持してください');
  }
  if (!['disabled', 'enabled'].includes(audit.activationState)) {
    fail(label + ': activationStateが不正です');
  }
  const capture = audit.dataCapture || {};
  for (const key of [
    'collectsPersonalNumber',
    'storesPersonalNumber',
    'storesCardImage',
    'normalProfileField',
  ]) {
    if (typeof capture[key] !== 'boolean') fail(label + ': 取得状態の真偽値がありません: ' + key);
  }
  if (!Array.isArray(capture.processors)) fail(label + ': 委託・processor一覧がありません');
  const captureEnabled =
    capture.collectsPersonalNumber === true ||
    capture.storesPersonalNumber === true ||
    capture.storesCardImage === true ||
    capture.normalProfileField === true;
  if (requirement('activation-approval').status !== 'pass') {
    if (audit.activationState !== 'disabled' || captureEnabled) {
      fail(label + ': 最終承認前に番号・カード画像・通常profile項目を有効化できません');
    }
  } else {
    const prerequisites = audit.requirements.filter(
      ({ id }) => !['disabled-until-approved', 'activation-approval'].includes(id),
    );
    if (
      audit.activationState !== 'enabled' ||
      prerequisites.some(({ status }) => status !== 'pass') ||
      !capture.controller ||
      !capture.authorizedPurpose ||
      !capture.identityProvider ||
      !capture.retentionPeriod ||
      !capture.deletionTrigger
    ) {
      fail(label + ': 有効化には全前提gateと主体・目的・provider・保存/削除条件が必要です');
    }
  }

  const derived = audit.requirements.every(({ required, status }) => !required || status === 'pass')
    ? 'ready'
    : 'blocked';
  if (audit.declaredStatus !== derived || target.declaredStatus !== derived) {
    fail(label + ': 宣言状態と算出状態が不一致です');
  }
  if (audit.activationState === 'enabled' && derived !== 'ready') {
    fail(label + ': 未合格状態で機能を有効化できません');
  }
  return {
    passed: audit.requirements.filter(({ required, status }) => required && status === 'pass').length,
    required: audit.requirements.filter(({ required }) => required).length,
    blocked: audit.requirements.filter(({ required, status }) => required && status === 'blocked').map(({ id }) => id),
  };
}

export function validateReleaseReadiness({
  root,
  readiness,
  ownerIntent,
  lock,
  androidAudit,
  personalNumberAudit,
}) {
  if (readiness.schema !== 'rockstaros-release-readiness/1') fail('schemaが違います');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(readiness.evaluatedAt)) fail('評価日が必要です');
  if (!Array.isArray(readiness.targets) || readiness.targets.length < 5) fail('配布対象が不足しています');

  const targetIds = new Set();
  const requiredTargets = new Set([
    'web-pwa-owner-preview',
    'web-pwa-public-preview',
    'qemu-developer-preview',
    'android-physical-preview',
    'iphone-ipad-client',
    'personal-number-identity',
  ]);
  for (const target of readiness.targets) {
    if (!target.id || targetIds.has(target.id)) fail(`${target.id || 'unknown'}: 対象IDが不正です`);
    targetIds.add(target.id);
    if (!allowedTargetStates.has(target.declaredStatus)) fail(`${target.id}: 対象状態が不正です`);
    if (!Array.isArray(target.gates) || target.gates.length === 0) fail(`${target.id}: gateがありません`);
    const gateIds = new Set();
    for (const gate of target.gates) {
      if (!gate.id || gateIds.has(gate.id)) fail(`${target.id}: gate IDが不正です`);
      gateIds.add(gate.id);
      if (typeof gate.required !== 'boolean' || !allowedGateStates.has(gate.status)) {
        fail(`${target.id}/${gate.id}: gate状態が不正です`);
      }
      if (gate.status === 'not_applicable' && (!gate.reason || gate.required)) {
        fail(`${target.id}/${gate.id}: 適用外には理由が必要で、必須にはできません`);
      }
      if (gate.status === 'blocked' && !gate.ownerAction && !gate.nextAction) {
        fail(`${target.id}/${gate.id}: 未達時の必要行動がありません`);
      }
      for (const evidence of gate.evidence || []) {
        if (!inside(root, evidence) || !existsSync(resolve(root, evidence))) {
          fail(`${target.id}/${gate.id}: 根拠がありません: ${evidence}`);
        }
      }
    }
    const derived = deriveTargetStatus(target);
    if (target.declaredStatus !== derived) fail(`${target.id}: 宣言${target.declaredStatus}と算出${derived}が不一致です`);
  }
  for (const id of requiredTargets) if (!targetIds.has(id)) fail(`${id}: 必須対象がありません`);

  if (!androidAudit || !personalNumberAudit) fail('Android/マイナンバー監査正本が必要です');
  const androidResult = validateAndroidPhysicalReleaseAudit({ root, audit: androidAudit, readiness });
  const personalNumberResult = validatePersonalNumberReleaseAudit({
    root,
    audit: personalNumberAudit,
    readiness,
  });

  const byId = (id) => readiness.targets.find((target) => target.id === id);
  const gate = (target, id) => byId(target)?.gates.find((item) => item.id === id);
  const licenseSelected = typeof ownerIntent.ownCodeIntent?.specificLicense === 'string';
  const licenseFileExists = existsSync(resolve(root, 'LICENSE')) || existsSync(resolve(root, 'LICENSE.md'));
  for (const target of ['web-pwa-public-preview', 'qemu-developer-preview']) {
    const productLicense = gate(target, 'product-license');
    if (productLicense?.status === 'pass' && (!licenseSelected || !licenseFileExists)) {
      fail(`${target}: 所有者選択とLICENSEなしに製品ライセンスを合格にできません`);
    }
  }
  const signingExecuted =
    ownerIntent.signing?.keyProvisioned === true &&
    !String(ownerIntent.signing?.status || '').includes('NOT_EXECUTED');
  for (const target of ['qemu-developer-preview', 'android-physical-preview']) {
    if (gate(target, 'production-signing')?.status === 'pass' && !signingExecuted) {
      fail(`${target}: 正式鍵と実施記録なしに署名を合格にできません`);
    }
  }
  const dependencies = packageEntries(lock);
  const missingLicense = dependencies.filter((entry) => !entry.license);
  if (missingLicense.length) fail(`依存${missingLicense.length}件にlicense表記がありません`);

  return {
    targetCount: readiness.targets.length,
    readyTargets: readiness.targets.filter((target) => target.declaredStatus === 'ready').map((target) => target.id),
    blockedTargets: readiness.targets.filter((target) => target.declaredStatus === 'blocked').map((target) => target.id),
    dependencyCount: dependencies.length,
    missingDependencyLicenses: missingLicense.length,
    android: androidResult,
    personalNumber: personalNumberResult,
  };
}

export function validateQemuReleaseAudit({
  root,
  audit,
  acceptance,
  inventory,
  preview,
  historicalInventory,
  readiness,
  lifecycle,
  d4,
  d6,
}) {
  if (audit.schema !== 'rockstaros-qemu-release-audit/1') fail('QEMU audit schemaが違います');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(audit.evaluatedAt)) fail('QEMU audit評価日が必要です');
  if (!Array.isArray(audit.requirements) || audit.requirements.length < 8) {
    fail('QEMU配布要件が不足しています');
  }

  const ids = new Set();
  for (const requirement of audit.requirements) {
    if (!requirement.id || ids.has(requirement.id)) fail('QEMU要件IDが不正です');
    ids.add(requirement.id);
    if (typeof requirement.required !== 'boolean' || !allowedQemuRequirementStates.has(requirement.status)) {
      fail(`${requirement.id}: QEMU要件状態が不正です`);
    }
    if (requirement.status === 'blocked' && !requirement.ownerAction && !requirement.nextAction) {
      fail(`${requirement.id}: 未達時の次の行動がありません`);
    }
    for (const evidence of requirement.evidence || []) {
      if (!inside(root, evidence) || !existsSync(resolve(root, evidence))) {
        fail(`${requirement.id}: QEMU根拠がありません: ${evidence}`);
      }
    }
  }

  const candidate = audit.candidate;
  const candidates = [
    {
      sourceCommit: acceptance.source_commit,
      version: acceptance.version,
      archive: acceptance.archive,
    },
    {
      sourceCommit: inventory.source_commit,
      archive: { sha256: inventory.archive_sha256 },
    },
    {
      sourceCommit: preview.reviewCandidate?.sourceCommit,
      version: preview.reviewCandidate?.version,
    },
  ];
  for (const observed of candidates) {
    if (observed.sourceCommit !== candidate.sourceCommit) fail('QEMU候補のsource commitが根拠と不一致です');
    if (observed.version && observed.version !== candidate.version) fail('QEMU候補のversionが根拠と不一致です');
    if (observed.archive?.sha256 && observed.archive.sha256 !== candidate.archive.sha256) {
      fail('QEMU候補のarchive SHA-256が根拠と不一致です');
    }
    if (observed.archive?.bytes && observed.archive.bytes !== candidate.archive.bytes) {
      fail('QEMU候補のarchive sizeが根拠と不一致です');
    }
    if (observed.archive?.name && observed.archive.name !== candidate.archive.name) {
      fail('QEMU候補のarchive名が根拠と不一致です');
    }
  }
  if (acceptance.release_ready !== false || inventory.legal_status === 'CLEARED') {
    fail('現在のQEMU候補の未公開・未許諾境界が根拠と不一致です');
  }
  if (
    acceptance.status !== 'PASS_INTERNAL_INSTALL_SAVE_RESTART_RECOVERY' ||
    acceptance.checks?.restore?.status !== 'PASS' ||
    acceptance.checks?.restore?.retired_source_start_refused?.length < 1 ||
    acceptance.checks?.interruption?.pending_guards?.length !== 3 ||
    !Object.values(acceptance.checks?.boot_logs || {}).every(
      (boot) => boot.ab_health_confirmed === true && boot.power_down === true,
    )
  ) {
    fail('QEMU候補のsecurity/recovery受入証拠が不足しています');
  }
  if (
    lifecycle.source_commit !== candidate.sourceCommit ||
    lifecycle.result !== 'PASS_SCOPED_CORROBORATED' ||
    lifecycle.operations !== 16 ||
    lifecycle.cycles?.length !== 2 ||
    !lifecycle.cycles.every((cycle) => cycle.normal_guest_shutdown_correlated === true)
  ) {
    fail('QEMU候補の範囲付きupdate/rollback証拠が不足しています');
  }
  if (
    d4.source_commit !== candidate.sourceCommit ||
    d4.status !== 'PASS_ROOT_STREAMED_ALL_RAW_D4_SCOPED' ||
    d6.source_commit !== candidate.sourceCommit ||
    d6.status !== 'PASS_SCOPED_CORROBORATED' ||
    d6.normal_shutdowns !== 5 ||
    d6.soak_jobs !== 61
  ) {
    fail('QEMU候補の範囲付き診断・反復受入証拠が不足しています');
  }

  const historical = audit.historicalNativeInventory;
  if (
    historical.sourceCommit !== historicalInventory.source_commit ||
    historical.sourceCommit === candidate.sourceCommit
  ) {
    fail('旧native inventoryを現在のQEMU候補へ転用できません');
  }
  if (historicalInventory.legal?.status === 'CLEARED') {
    fail('旧native inventoryはlicense clearanceではありません');
  }

  const currentSbom = audit.requirements.find(({ id }) => id === 'current-native-component-sbom');
  const nativeInventory = audit.currentNativeInventory;
  if (
    nativeInventory?.sourceCommit !== candidate.sourceCommit ||
    nativeInventory?.archiveSha256 !== candidate.archive.sha256 ||
    nativeInventory?.legalBundleSha256 !== inventory.legal_bundle_sha256 ||
    nativeInventory?.status !== 'component_inventory_complete_product_license_not_cleared'
  ) {
    fail('rc2固有native inventoryのcandidate結合が不正です');
  }
  for (const manifest of [nativeInventory.targetManifest, nativeInventory.hostManifest]) {
    if (!inside(root, manifest.path) || !existsSync(resolve(root, manifest.path))) {
      fail(`rc2固有native manifestがありません: ${manifest.path}`);
    }
    const source = readFileSync(resolve(root, manifest.path), 'utf8');
    if (sha256(source) !== manifest.sha256) fail(`rc2固有native manifestのhashが不一致です: ${manifest.path}`);
    if (parseBuildrootCsv(source).length !== manifest.components) {
      fail(`rc2固有native manifestのcomponent数が不一致です: ${manifest.path}`);
    }
  }
  if (currentSbom?.status !== 'pass') {
    fail('rc2固有native inventoryが揃っているためSBOM gate状態を更新してください');
  }
  const productLicense = audit.requirements.find(({ id }) => id === 'product-license');
  const productionSigning = audit.requirements.find(({ id }) => id === 'production-signing');
  const postSigning = audit.requirements.find(({ id }) => id === 'post-signing-same-candidate-acceptance');
  if (postSigning?.status === 'pass' && (productLicense?.status !== 'pass' || productionSigning?.status !== 'pass')) {
    fail('licenseとproduction署名より先に最終候補受入を合格にできません');
  }

  const qemuTarget = readiness.targets.find(({ id }) => id === 'qemu-developer-preview');
  if (!qemuTarget || qemuTarget.candidateAudit !== 'data/qemu-release-audit.json') {
    fail('公開台帳からQEMU auditへの参照がありません');
  }
  for (const requirement of audit.requirements) {
    const gate = qemuTarget.gates.find(({ id }) => id === requirement.id);
    if (!gate || gate.required !== requirement.required || gate.status !== requirement.status) {
      fail(`${requirement.id}: QEMU auditと公開台帳が不一致です`);
    }
  }
  if (qemuTarget.gates.length !== audit.requirements.length) {
    fail('QEMU auditと公開台帳の要件数が不一致です');
  }

  const derived = audit.requirements.every(
    (requirement) => !requirement.required || requirement.status === 'pass',
  )
    ? 'ready'
    : 'blocked';
  if (audit.declaredStatus !== derived) fail(`QEMU audit宣言${audit.declaredStatus}と算出${derived}が不一致です`);

  return {
    candidate: candidate.version,
    sourceCommit: candidate.sourceCommit,
    passed: audit.requirements.filter(({ required, status }) => required && status === 'pass').length,
    required: audit.requirements.filter(({ required }) => required).length,
    blocked: audit.requirements.filter(({ required, status }) => required && status === 'blocked').map(({ id }) => id),
  };
}

export function createCycloneDxSbom({ root, lock, outputPath }) {
  const dependencies = packageEntries(lock);
  const componentMap = new Map();
  for (const entry of dependencies) {
    const purl = `pkg:npm/${encodeURIComponent(entry.name)}@${entry.version}`;
    const existing = componentMap.get(purl);
    if (existing) {
      existing.properties.push({ name: 'rockstaros:package-lock-path', value: entry.path });
      continue;
    }
    componentMap.set(purl, {
      type: 'library',
      'bom-ref': purl,
      name: entry.name,
      version: entry.version,
      purl,
      licenses: [{ license: { name: entry.license } }],
      properties: [{ name: 'rockstaros:package-lock-path', value: entry.path }],
    });
  }
  const components = [...componentMap.values()];
  const serialHash = createHash('sha256')
    .update(JSON.stringify(components.map(({ purl }) => purl)))
    .digest('hex');
  const sbom = {
    bomFormat: 'CycloneDX',
    specVersion: '1.6',
    serialNumber: `urn:uuid:${serialHash.slice(0, 8)}-${serialHash.slice(8, 12)}-4${serialHash.slice(13, 16)}-a${serialHash.slice(17, 20)}-${serialHash.slice(20, 32)}`,
    version: 1,
    metadata: {
      component: { type: 'application', name: 'rock-star', version: lock.packages?.['']?.version || '0.0.0' },
      properties: [{ name: 'rockstaros:scope', value: 'npm package-lock inventory; native Buildroot inventory remains separate' }],
    },
    components,
  };
  const destination = resolve(root, outputPath);
  if (!inside(root, outputPath)) fail('SBOM出力先はrepository内の相対pathにしてください');
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, `${JSON.stringify(sbom, null, 2)}\n`);
  return { destination, count: components.length };
}

export function createHistoricalNativeSbom({ root, inventory, outputPath }) {
  const manifests = inventory.original_package_metadata || {};
  const scopes = [
    ['target', manifests['manifest.csv']],
    ['host-build', manifests['host-manifest.csv']],
  ];
  const components = [];
  for (const [scope, packages] of scopes) {
    if (!Array.isArray(packages) || packages.length === 0) fail(`native ${scope} manifestがありません`);
    for (const pkg of packages) {
      const name = pkg.PACKAGE;
      const version = pkg.VERSION;
      if (!name || !version || !pkg.LICENSE) fail(`native ${scope} package metadataが不完全です`);
      const purl = `pkg:generic/${encodeURIComponent(name)}@${encodeURIComponent(version)}`;
      components.push({
        type: 'library',
        'bom-ref': `${purl}?rockstaros-scope=${scope}`,
        name,
        version,
        purl,
        licenses: [{ license: { name: pkg.LICENSE } }],
        properties: [
          { name: 'rockstaros:scope', value: scope },
          { name: 'rockstaros:source-archive', value: pkg['SOURCE ARCHIVE'] || 'not recorded' },
          { name: 'rockstaros:license-files', value: pkg['LICENSE FILES'] || 'not recorded' },
        ],
      });
    }
  }
  const serialHash = createHash('sha256')
    .update(JSON.stringify(components.map(({ 'bom-ref': bomRef }) => bomRef)))
    .digest('hex');
  const sbom = {
    bomFormat: 'CycloneDX',
    specVersion: '1.6',
    serialNumber: `urn:uuid:${serialHash.slice(0, 8)}-${serialHash.slice(8, 12)}-4${serialHash.slice(13, 16)}-a${serialHash.slice(17, 20)}-${serialHash.slice(20, 32)}`,
    version: 1,
    metadata: {
      component: {
        type: 'operating-system',
        name: 'RockstarOS QEMU Developer Preview historical native inventory',
        version: inventory.source_commit.slice(0, 7),
      },
      properties: [
        { name: 'rockstaros:source-commit', value: inventory.source_commit },
        { name: 'rockstaros:status', value: inventory.status },
        { name: 'rockstaros:disposition', value: 'historical evidence only; not current rc2 and not license clearance' },
      ],
    },
    components,
  };
  const destination = resolve(root, outputPath);
  if (!inside(root, outputPath)) fail('native SBOM出力先はrepository内の相対pathにしてください');
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, `${JSON.stringify(sbom, null, 2)}\n`);
  return {
    destination,
    count: components.length,
    targetCount: manifests['manifest.csv'].length,
    hostCount: manifests['host-manifest.csv'].length,
  };
}

export function createCurrentNativeSbom({ root, audit, outputPath }) {
  const nativeInventory = audit.currentNativeInventory;
  const manifests = [
    ['target', nativeInventory.targetManifest],
    ['host-build', nativeInventory.hostManifest],
  ];
  const components = [];
  for (const [scope, manifest] of manifests) {
    const source = readFileSync(resolve(root, manifest.path), 'utf8');
    if (sha256(source) !== manifest.sha256) fail(`native ${scope} manifestのhashが不一致です`);
    const packages = parseBuildrootCsv(source);
    if (packages.length !== manifest.components) fail(`native ${scope} component数が不一致です`);
    for (const pkg of packages) {
      const purl = `pkg:generic/${encodeURIComponent(pkg.PACKAGE)}@${encodeURIComponent(pkg.VERSION)}`;
      components.push({
        type: 'library',
        'bom-ref': `${purl}?rockstaros-scope=${scope}`,
        name: pkg.PACKAGE,
        version: pkg.VERSION,
        purl,
        licenses: [{ license: { name: pkg.LICENSE } }],
        properties: [
          { name: 'rockstaros:scope', value: scope },
          { name: 'rockstaros:source-archive', value: pkg['SOURCE ARCHIVE'] || 'not recorded' },
          { name: 'rockstaros:source-site', value: pkg['SOURCE SITE'] || 'not recorded' },
          { name: 'rockstaros:license-files', value: pkg['LICENSE FILES'] || 'not recorded' },
        ],
      });
    }
  }
  const serialHash = sha256(JSON.stringify(components.map(({ 'bom-ref': bomRef }) => bomRef)));
  const sbom = {
    bomFormat: 'CycloneDX',
    specVersion: '1.6',
    serialNumber: `urn:uuid:${serialHash.slice(0, 8)}-${serialHash.slice(8, 12)}-4${serialHash.slice(13, 16)}-a${serialHash.slice(17, 20)}-${serialHash.slice(20, 32)}`,
    version: 1,
    metadata: {
      component: {
        type: 'operating-system',
        name: 'RockstarOS QEMU Developer Preview',
        version: audit.candidate.version,
        hashes: [{ alg: 'SHA-256', content: audit.candidate.archive.sha256 }],
      },
      properties: [
        { name: 'rockstaros:source-commit', value: audit.candidate.sourceCommit },
        { name: 'rockstaros:archive-name', value: audit.candidate.archive.name },
        { name: 'rockstaros:legal-bundle-sha256', value: nativeInventory.legalBundleSha256 },
        { name: 'rockstaros:status', value: nativeInventory.status },
        { name: 'rockstaros:product-license', value: 'not cleared; see separate product-license gate' },
      ],
    },
    components,
  };
  const destination = resolve(root, outputPath);
  if (!inside(root, outputPath)) fail('current native SBOM出力先はrepository内の相対pathにしてください');
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, `${JSON.stringify(sbom, null, 2)}\n`);
  return {
    destination,
    count: components.length,
    targetCount: nativeInventory.targetManifest.components,
    hostCount: nativeInventory.hostManifest.components,
  };
}

export function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}
