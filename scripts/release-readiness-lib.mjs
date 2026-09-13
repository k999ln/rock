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
const versionedControl = (value) => typeof value === 'string' && /^.+@[^@]+$/.test(value);

const qemuPostSigningCheckIds = [
  'authentication',
  'fresh-install',
  'update',
  'rollback',
  'backup',
  'restore',
  'interruption-recovery',
  'diagnostics',
  'normal-shutdown',
  'removal',
];

const validateHashedEvidence = (root, evidence, label, requiredPins = null) => {
  if (!Array.isArray(evidence) || evidence.length === 0) fail(label + ': 根拠がありません');
  if (requiredPins) {
    const requiredRoles = Object.keys(requiredPins);
    const actualRoles = evidence.map(({ role }) => role);
    if (
      actualRoles.length !== requiredRoles.length ||
      new Set(actualRoles).size !== actualRoles.length ||
      requiredRoles.some((role) => !actualRoles.includes(role)) ||
      new Set(evidence.map(({ path }) => path)).size !== evidence.length
    ) {
      fail(label + ': 必須roleごとの別file根拠が必要です');
    }
  }
  for (const item of evidence) {
    if (
      !item ||
      typeof item.path !== 'string' ||
      !inside(root, item.path) ||
      !existsSync(resolve(root, item.path)) ||
      !sha256Pattern.test(item.sha256 || '')
    ) {
      fail(label + ': repository内の根拠pathとSHA-256が必要です');
    }
    const actual = sha256(readFileSync(resolve(root, item.path)));
    if (actual !== item.sha256) fail(label + ': 根拠hashが不一致です: ' + item.path);
    if (requiredPins && requiredPins[item.role] !== item.sha256) {
      fail(label + ': roleとpinが不一致です: ' + item.role);
    }
  }
};

const validateExactHashedEvidenceRoles = (root, evidence, label, requiredRoles) => {
  if (!Array.isArray(requiredRoles) || requiredRoles.length === 0) {
    fail(label + ': 必須role定義がありません');
  }
  if (
    !Array.isArray(evidence) ||
    evidence.length !== requiredRoles.length ||
    new Set(evidence.map(({ role }) => role)).size !== evidence.length ||
    requiredRoles.some((role) => !evidence.some((item) => item.role === role)) ||
    new Set(evidence.map(({ path }) => path)).size !== evidence.length
  ) {
    fail(label + ': 必須roleごとの別file根拠が必要です');
  }
  validateHashedEvidence(root, evidence, label);
};

export function validateQemuPostSigningAcceptance({ root, record, candidate }) {
  const label = 'QEMU署名後受入';
  if (record?.schema !== 'rockstaros-qemu-post-signing-acceptance/1') {
    fail(label + ': schemaが違います');
  }
  if (
    record.status !== 'PASS_POST_SIGNING_SAME_CANDIDATE' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(record.completedAt || '')
  ) {
    fail(label + ': 完了状態またはUTC完了時刻が不正です');
  }
  if (
    record.candidate?.version !== candidate.version ||
    record.candidate?.sourceCommit !== candidate.sourceCommit ||
    record.candidate?.archive?.name !== candidate.archive.name ||
    record.candidate?.archive?.bytes !== candidate.archive.bytes ||
    record.candidate?.archive?.sha256 !== candidate.archive.sha256
  ) {
    fail(label + ': auditと同じ候補ではありません');
  }
  if (
    record.immutableCandidate?.beforeSha256 !== candidate.archive.sha256 ||
    record.immutableCandidate?.afterSha256 !== candidate.archive.sha256 ||
    record.immutableCandidate?.bytesUnchanged !== true
  ) {
    fail(label + ': 署名後候補byteの不変性がありません');
  }

  const signing = record.signing || {};
  if (
    signing.status !== 'PRODUCTION_SIGNATURE_VERIFIED' ||
    signing.authenticationStatus !== 'AUTHENTICATED_NOT_LAUNCH_ACCEPTED' ||
    ['releaseManifestSha256', 'releaseAuthenticationSha256', 'publicKeySha256', 'trustBundleSha256']
      .some((key) => !sha256Pattern.test(signing[key] || ''))
  ) {
    fail(label + ': production署名の独立検証pinが不足しています');
  }
  validateHashedEvidence(root, signing.evidence, label + '/signing', {
    'release-manifest': signing.releaseManifestSha256,
    'release-authentication': signing.releaseAuthenticationSha256,
    'public-key': signing.publicKeySha256,
    'trust-bundle': signing.trustBundleSha256,
  });

  const legal = record.legal || {};
  if (
    typeof legal.productLicense !== 'string' ||
    !legal.productLicense.trim() ||
    ['licenseFileSha256', 'noticeSha256', 'sbomSha256'].some(
      (key) => !sha256Pattern.test(legal[key] || ''),
    )
  ) {
    fail(label + ': license・NOTICE・SBOMのpinが不足しています');
  }
  validateHashedEvidence(root, legal.evidence, label + '/legal', {
    license: legal.licenseFileSha256,
    notice: legal.noticeSha256,
    sbom: legal.sbomSha256,
  });

  if (
    record.freshWorkspace !== true ||
    record.sourceDeviceReused !== false ||
    typeof record.environment?.hostOs !== 'string' ||
    typeof record.environment?.hostVersion !== 'string' ||
    typeof record.environment?.architecture !== 'string' ||
    typeof record.environment?.qemuVersion !== 'string' ||
    record.environment?.machine !== 'virt-10.0'
  ) {
    fail(label + ': fresh環境またはQEMU実行環境の識別が不足しています');
  }
  if (!Array.isArray(record.checks)) fail(label + ': checksがありません');
  assertExactIds(record.checks, qemuPostSigningCheckIds, label + ' checks');
  for (const check of record.checks) {
    if (check.status !== 'PASS') fail(label + '/' + check.id + ': PASSではありません');
    validateHashedEvidence(root, check.evidence, label + '/' + check.id);
  }
  return { status: record.status, checks: record.checks.length };
}

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
  const androidEvidenceRoles = {
    'exact-model-and-sku': ['read-only-device-inventory', 'bootloader-state-observation'],
    'bsp-driver-boot-recovery': ['bsp', 'vendor-drivers', 'boot-chain', 'recovery'],
    'android-cdd-cts': ['cdd-version', 'cts-revision', 'cts-result', 'cts-verifier-result'],
    'production-signing': ['key-identity', 'avb-and-ota-verification', 'rollback-policy', 'rotation-and-revocation'],
    'regional-radio-and-sales': ['distribution-model', 'target-regions', 'radio-impact-determination', 'regional-compliance-review'],
  };
  for (const [id, roles] of Object.entries(androidEvidenceRoles)) {
    if (JSON.stringify(requirement(id).requiredEvidence) !== JSON.stringify(roles)) {
      fail(label + '/' + id + ': 必須証拠role定義が不一致です');
    }
  }
  for (const id of ['bsp-driver-boot-recovery', 'android-cdd-cts', 'production-signing', 'regional-radio-and-sales']) {
    if (requirement(id).status === 'pass' && requirement('exact-model-and-sku').status !== 'pass') {
      fail(label + '/' + id + ': 型番/SKU gateより先に合格にできません');
    }
  }
  for (const id of ['android-cdd-cts', 'production-signing']) {
    if (requirement(id).status === 'pass' && requirement('bsp-driver-boot-recovery').status !== 'pass') {
      fail(label + '/' + id + ': BSP/boot/recovery gateより先に合格にできません');
    }
  }
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
  if (requirement('exact-model-and-sku').status === 'pass') {
    if (audit.candidate?.selectionStatus !== 'selected') {
      fail(label + ': 型番/SKU gate合格には選択済み実機が必要です');
    }
    validateExactHashedEvidenceRoles(
      root,
      audit.deviceEvidence,
      label + '/exact-model-and-sku',
      androidEvidenceRoles['exact-model-and-sku'],
    );
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
    validateExactHashedEvidenceRoles(
      root,
      audit.artifacts,
      label + '/bsp-driver-boot-recovery',
      androidEvidenceRoles['bsp-driver-boot-recovery'],
    );
    if (
      audit.candidate?.selectionStatus !== 'selected' ||
      audit.artifacts.some(({ sku }) => sku !== audit.candidate.device.sku)
    ) fail(label + ': BSP/boot/recoveryが同じSKUへ結合されていません');
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
      !sha256Pattern.test(compatibility.cddDocumentSha256 || '') ||
      !sha256Pattern.test(compatibility.ctsPackageSha256 || '') ||
      !sha256Pattern.test(compatibility.ctsResultSha256 || '') ||
      !sha256Pattern.test(compatibility.ctsVerifierResultSha256 || '')
    ) {
      fail(label + ': 同一buildのCDD/CTS/CTS Verifier識別子が不足しています');
    }
    validateHashedEvidence(root, compatibility.evidence, label + '/android-cdd-cts', {
      'cdd-version': compatibility.cddDocumentSha256,
      'cts-revision': compatibility.ctsPackageSha256,
      'cts-result': compatibility.ctsResultSha256,
      'cts-verifier-result': compatibility.ctsVerifierResultSha256,
    });
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
    validateExactHashedEvidenceRoles(
      root,
      audit.signing.evidence,
      label + '/production-signing',
      androidEvidenceRoles['production-signing'],
    );
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
    validateExactHashedEvidenceRoles(
      root,
      audit.regionalDistribution.complianceEvidence,
      label + '/regional-radio-and-sales',
      androidEvidenceRoles['regional-radio-and-sales'],
    );
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
  const personalNumberEvidenceRoles = {
    'purpose-and-necessity': ['authorized-processing', 'necessity-assessment', 'legal-review', 'notice'],
    'authorized-operator-and-provider': ['controller', 'authorized-personnel', 'identity-provider', 'processor-contracts'],
    'data-flow-retention-and-deletion': ['data-flow', 'retention', 'deletion', 'media-disposal', 'audit-log'],
    'security-and-privacy-review': ['organizational', 'personnel', 'physical', 'technical', 'key-management', 'external-environment'],
    'incident-and-vendor-governance': ['incident-response', 'regulator-notification', 'data-subject-notification', 'vendor-oversight'],
    'activation-approval': ['independent-review', 'owner-activation'],
  };
  for (const [id, roles] of Object.entries(personalNumberEvidenceRoles)) {
    if (JSON.stringify(requirement(id).requiredEvidence) !== JSON.stringify(roles)) {
      fail(label + '/' + id + ': 必須証拠role定義が不一致です');
    }
    if (requirement(id).status === 'pass') {
      validateExactHashedEvidenceRoles(
        root,
        audit.gateEvidence?.[id],
        label + '/' + id,
        roles,
      );
    }
  }
  for (const id of ['data-flow-retention-and-deletion', 'security-and-privacy-review', 'incident-and-vendor-governance']) {
    if (
      requirement(id).status === 'pass' &&
      (requirement('purpose-and-necessity').status !== 'pass' ||
        requirement('authorized-operator-and-provider').status !== 'pass')
    ) {
      fail(label + '/' + id + ': 目的・取扱主体gateより先に合格にできません');
    }
  }
  if (
    requirement('incident-and-vendor-governance').status === 'pass' &&
    requirement('security-and-privacy-review').status !== 'pass'
  ) {
    fail(label + '/incident-and-vendor-governance: security gateより先に合格にできません');
  }
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
  const controls = audit.controls || {};
  if (
    requirement('purpose-and-necessity').status === 'pass' &&
    (!capture.authorizedPurpose || !controls.legalBasis || !controls.necessityAssessment)
  ) {
    fail(label + ': 目的gateには許された事務・法的根拠・必要性評価が必要です');
  }
  if (
    requirement('authorized-operator-and-provider').status === 'pass' &&
    (!capture.controller || !capture.identityProvider || !controls.authorizedPersonnelRegister)
  ) {
    fail(label + ': 取扱主体gateには主体・provider・担当者台帳が必要です');
  }
  if (
    requirement('data-flow-retention-and-deletion').status === 'pass' &&
    (!capture.retentionPeriod || !capture.deletionTrigger || !versionedControl(controls.dataFlowVersion))
  ) {
    fail(label + ': data flow gateには保存期間・削除trigger・版付きdata flowが必要です');
  }
  if (
    requirement('security-and-privacy-review').status === 'pass' &&
    !versionedControl(controls.securityReviewVersion)
  ) {
    fail(label + ': security gateには版付き審査記録が必要です');
  }
  if (
    requirement('incident-and-vendor-governance').status === 'pass' &&
    (!versionedControl(controls.incidentPlanVersion) || !versionedControl(controls.vendorOversightVersion))
  ) {
    fail(label + ': incident gateには事故対応と委託先監督の版付き記録が必要です');
  }
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
      capture.collectsPersonalNumber !== true ||
      capture.normalProfileField !== false ||
      !capture.controller ||
      !capture.authorizedPurpose ||
      !capture.identityProvider ||
      !capture.retentionPeriod ||
      !capture.deletionTrigger ||
      !audit.activation?.environment ||
      !audit.activation?.startDate ||
      !audit.activation?.responsiblePerson ||
      !audit.activation?.independentReviewer
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
  const postSigningTemplate = audit.postSigningAcceptance?.template;
  if (
    typeof postSigningTemplate !== 'string' ||
    !postSigningTemplate ||
    !inside(root, postSigningTemplate) ||
    !existsSync(resolve(root, postSigningTemplate))
  ) {
    fail('署名後の同一候補受入templateがありません');
  }
  if (postSigning?.status === 'pass' && (productLicense?.status !== 'pass' || productionSigning?.status !== 'pass')) {
    fail('licenseとproduction署名より先に最終候補受入を合格にできません');
  }
  if (postSigning?.status === 'pass') {
    const resultPath = audit.postSigningAcceptance?.result;
    if (
      typeof resultPath !== 'string' ||
      !resultPath ||
      !inside(root, resultPath) ||
      !existsSync(resolve(root, resultPath))
    ) {
      fail('署名後の同一候補受入resultがありません');
    }
    let result;
    try {
      result = JSON.parse(readFileSync(resolve(root, resultPath), 'utf8'));
    } catch {
      fail('署名後の同一候補受入resultを読めません');
    }
    validateQemuPostSigningAcceptance({ root, record: result, candidate });
    if (!postSigning.evidence?.includes(resultPath)) {
      fail('署名後の同一候補受入resultがgate根拠にありません');
    }
  } else if (audit.postSigningAcceptance?.result !== null) {
    fail('署名後受入が未達なのにresultを設定できません');
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
