import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const matrix = JSON.parse(
  readFileSync(resolve(root, 'data/device-support-matrix.json'), 'utf8'),
);
const sourceLockPath = resolve(root, 'os/physical/frankel-source-lock.json');
const sourceLock = JSON.parse(readFileSync(sourceLockPath, 'utf8'));
const sourceAuditPath = resolve(
  root,
  'docs/evidence/android-pixel-10-gl066-dsp-source-audit-20260916.json',
);
const sourceAuditBytes = readFileSync(sourceAuditPath);
const sourceAudit = JSON.parse(sourceAuditBytes);
const androidAudit = JSON.parse(
  readFileSync(resolve(root, 'data/android-physical-release-audit.json'), 'utf8'),
);

const requireValue = (condition, message) => {
  if (!condition) throw new Error(`device-support: ${message}`);
};

requireValue(
  matrix.schema === 'rockstaros-device-support/1',
  'schemaが違います',
);
requireValue(
  matrix.policy?.architecture === 'shared-core-plus-device-support-package',
  '共通Coreと機種別packageの境界が必要です',
);
const modes = ['native_os', 'gsi_experimental', 'client_only', 'unsupported'];
requireValue(
  JSON.stringify(matrix.policy?.deliveryModes) === JSON.stringify(modes),
  '対応区分の順序または内容が違います',
);
requireValue(
  Array.isArray(matrix.targets) && matrix.targets.length > 0,
  '対象台帳が空です',
);

const ids = new Set();
for (const target of matrix.targets) {
  requireValue(
    typeof target.id === 'string' && target.id.length > 0,
    '対象IDが必要です',
  );
  requireValue(!ids.has(target.id), `${target.id}: 対象IDが重複しています`);
  ids.add(target.id);
  requireValue(
    modes.includes(target.deliveryMode),
    `${target.id}: 対応区分が不正です`,
  );
  requireValue(
    typeof target.status === 'string' && target.status.length > 0,
    `${target.id}: 状態が必要です`,
  );
  requireValue(
    target.flashReady === false,
    `${target.id}: 実機flash合格の証拠がありません`,
  );
  if (target.physicalDevice && target.exactModelRequired) {
    requireValue(
      Object.hasOwn(target, 'confirmedSku'),
      `${target.id}: SKU確認欄が必要です`,
    );
  }
}

const byId = (id) => matrix.targets.find((target) => target.id === id);
requireValue(
  byId('blackberry-legacy')?.deliveryMode === 'unsupported',
  '旧BlackBerryを対応済みにできません',
);
requireValue(
  byId('apple-ios-ipados')?.deliveryMode === 'client_only',
  'Apple mobile端末はOS置換ではなくclientです',
);
const pixel7 = byId('pixel-7-panther');
requireValue(
  pixel7?.confirmedSku === null,
  'pixel-7-panther: SKU確認は未実施です',
);
requireValue(
  pixel7?.status === 'DEFERRED_AFTER_PIXEL_10_SELECTION',
  'pixel-7-panther: Pixel 10受入前は保留です',
);
const pixel10 = byId('pixel-10-frankel');
requireValue(
  pixel10?.confirmedSku === 'GL066',
  'pixel-10-frankel: 実機readbackで確定したSKUが必要です',
);
requireValue(
  pixel10?.status === 'SELECTED_FIRST_PHYSICAL_TARGET_READBACK_CONFIRMED',
  'pixel-10-frankel: 最初の実機対象のreadback確定状態が必要です',
);

requireValue(
  sourceLock.schema === 'rock-phone-source/2' &&
    sourceLock.stage ===
      'SOURCE_TAG_AND_DEVICE_LAYOUT_FROZEN_RECOVERY_ARTIFACTS_PENDING' &&
    sourceLock.device === 'frankel' &&
    sourceLock.confirmedSku === 'GL066' &&
    sourceLock.targetConfirmedByOwner === true &&
    sourceLock.fullBuildInputGatePassed === false &&
    sourceLock.imageBuildVerified === false &&
    sourceLock.imageBootVerified === false &&
    sourceLock.flashReady === false,
  'Pixel 10 source lockの段階またはfull build停止境界が違います',
);
requireValue(
  sourceLock.manifestUrl ===
      'https://github.com/GrapheneOS/platform_manifest.git' &&
    sourceLock.manifestTag === '2026091000' &&
    sourceLock.manifestTagObject ===
      '6c939d124f3ea8dd545c1e4045f26359f501d80e' &&
    sourceLock.manifestCommit ===
      'ac9f2fdf0badebea2f6ac6c3e93b125aba02116a' &&
    sourceLock.manifestDefaultXmlSha256 ===
      'f5969292b4b68b5718e158d344e7e99b044814738889fef70311de1210d21f7f' &&
    sourceLock.allowedSignersSha256 ===
      '344f59c6f058699e63fea68e35953b341c14e3bf1fbc1256f6baa84aa2aca1d0' &&
    sourceLock.adevtoolCommit ===
      '117ef1de94510854f3fc25154c8246819e56f049' &&
    sourceLock.hookSha256 ===
      '3a24ad3ad1f68ca806b181f192d4cd8468c8a57316b2152b953939966c766a2d',
  '署名検証済み2026091000 source chainが固定値と一致しません',
);
requireValue(
  sourceLock.kernel?.platform === 'laguna' &&
    sourceLock.kernel?.codename === 'muzel' &&
    sourceLock.kernel?.version === '6.6' &&
    sourceLock.kernel?.prebuiltCommit ===
      'e10186c8b757f4658dc38973a37c0034b05fc0b6' &&
    sourceLock.kernel?.artifactTree ===
      '1c1a65e54c92adb11979a73fcc9acea9cc8183b1' &&
    sourceLock.kernel?.genericGkiPrebuiltCommit ===
      '350899556b7cae26d5981c7055759428aef7598d',
  'laguna／muzel 6.6 kernel入力が固定値と一致しません',
);
const requiredPartitions = [
  'boot_a',
  'boot_b',
  'dtbo_a',
  'dtbo_b',
  'init_boot_a',
  'init_boot_b',
  'metadata',
  'super',
  'userdata',
  'vbmeta_a',
  'vbmeta_b',
  'vbmeta_system_a',
  'vbmeta_system_b',
  'vbmeta_vendor_a',
  'vbmeta_vendor_b',
  'vendor_boot_a',
  'vendor_boot_b',
  'vendor_kernel_boot_a',
  'vendor_kernel_boot_b',
];
requireValue(
  sourceLock.deviceLayout?.dynamicPartitions === true &&
    sourceLock.deviceLayout?.virtualAb === true &&
    sourceLock.deviceLayout?.abUpdate === true &&
    sourceLock.deviceLayout?.avbVersion === '1.4' &&
    sourceLock.deviceLayout?.vbmetaDeviceState === 'locked' &&
    JSON.stringify(sourceLock.deviceLayout?.requiredNamedPartitions) ===
      JSON.stringify(requiredPartitions),
  '実機readbackのDynamic Partition／Virtual A/B／AVB境界が違います',
);
requireValue(
  sourceLock.vendor?.generationCommand ===
      'adevtool generate-all -d frankel' &&
    sourceLock.vendor?.generatedAndInventoried === false &&
    sourceLock.vendor?.redistributionApproved === false &&
    sourceLock.recovery?.factoryImageStatus ===
      'PENDING_OWNER_TERMS_DOWNLOAD_AND_SHA256' &&
    sourceLock.recovery?.fullOtaStatus ===
      'PENDING_OWNER_TERMS_DOWNLOAD_AND_SHA256' &&
    sourceLock.recovery?.factoryImageSha256 === null &&
    sourceLock.recovery?.fullOtaSha256 === null &&
    sourceLock.recovery?.may2026BootloaderAntiRollbackApplies === true &&
    sourceLock.recovery?.olderAndroid16BootloaderFlashForbidden === true &&
    sourceLock.recovery?.bothSlotsBootableViaMatchingFullOtaBeforeRiskyFlash ===
      true &&
    sourceLock.recovery?.factoryRestoreTested === false &&
    sourceLock.recovery?.bootloaderRelockTested === false,
  'vendor／純正復旧artifactの未完了gateまたはanti-rollback境界が違います',
);
requireValue(
  sourceLock.externalProviderBoundary?.includedInFirstOsFullBuild === false &&
    sourceLock.externalProviderBoundary?.implementation === 'APP_AND_SERVER' &&
    sourceLock.externalProviderBoundary?.requiredBeforePublicEarningLaunch ===
      true &&
    sourceLock.externalProviderBoundary
      ?.liveEarningsClaimsAllowedBeforeAcceptance === false,
  '外部Providerを初回OS buildから分離し公開前gateにする決定が必要です',
);
requireValue(
  sourceAudit.schema === 'avocadoos-android-dsp-source-audit/1' &&
    sourceAudit.result === 'PASS_WITH_RECOVERY_ARTIFACT_GATE_BLOCKED' &&
    sourceAudit.stage === sourceLock.stage &&
    sourceAudit.device?.serialStored === false &&
    sourceAudit.device?.deviceWritten === false &&
    sourceAudit.source?.manifestCommit === sourceLock.manifestCommit &&
    sourceAudit.source?.tagSignatureVerified === true &&
    sourceAudit.deviceLayoutReadback?.dynamicPartitions === true &&
    sourceAudit.deviceLayoutReadback?.virtualAb === true &&
    sourceAudit.deviceLayoutReadback?.partitionNames?.includes('super') &&
    sourceAudit.deviceLayoutReadback?.partitionNames?.includes('vbmeta_a') &&
    sourceAudit.recovery?.factoryRestoreTested === false,
  'source／device layout監査証拠がlockと一致しません',
);
const sourceAuditDigest = createHash('sha256')
  .update(sourceAuditBytes)
  .digest('hex');
const recordedSourceAudit = androidAudit.preFullBuildEvidence?.find(
  ({ role }) => role === 'dsp-source-and-device-layout',
);
requireValue(
  recordedSourceAudit?.path ===
      'docs/evidence/android-pixel-10-gl066-dsp-source-audit-20260916.json' &&
    recordedSourceAudit?.sha256 === sourceAuditDigest,
  'Android物理監査にsource／layout証拠の実byte SHA-256がありません',
);

console.log(
  `端末対応: ${matrix.targets.length}対象、GL066の署名source tag＋layout固定、純正復旧artifact待ち、実機flash 0件を確認`,
);
