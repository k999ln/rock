import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';

const sha256Pattern = /^[0-9a-f]{64}$/;
const expectedRoles = new Map([
  ['production-signing-key-lifecycle', [
    'avb-key-fingerprint',
    'ota-key-fingerprint',
    'key-custody-and-loss-drill',
    'rotation-and-revocation-drill',
  ]],
  ['rollback-index-operations', [
    'rollback-index-policy',
    'device-index-readback',
    'upgrade-and-rejected-downgrade-test',
  ]],
  ['google-stock-recovery-artifacts', [
    'google-terms-and-download-record',
    'factory-image-identity',
    'full-ota-identity',
  ]],
  ['keystore-loss-backup-restore', [
    'backup-format-and-key-wrapping',
    'keystore-loss-restore-drill',
    'recovery-secret-custody',
  ]],
]);

const fail = (message) => {
  throw new Error(`first-flash-gate: ${message}`);
};

const safePath = (root, path) => {
  if (
    typeof path !== 'string' ||
    !path ||
    isAbsolute(path) ||
    path.includes('\\') ||
    path.split('/').some((part) => !part || part === '.' || part === '..')
  ) {
    fail('unsafe evidence path');
  }
  const absolute = resolve(root, path);
  const rel = relative(root, absolute);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) fail('evidence path escapes repository');
  return absolute;
};

const validateEvidence = ({ root, gate, roles }) => {
  if (JSON.stringify(gate.requiredEvidence) !== JSON.stringify(roles)) {
    fail(`${gate.id}: required evidence roles changed`);
  }
  if (gate.status !== 'pass') {
    if (!Array.isArray(gate.evidence) || gate.evidence.length !== 0) {
      fail(`${gate.id}: blocked gate cannot carry pass evidence`);
    }
    return;
  }
  if (!Array.isArray(gate.evidence) || gate.evidence.length !== roles.length) {
    fail(`${gate.id}: exact hashed evidence is required`);
  }
  const byRole = new Map(gate.evidence.map((item) => [item?.role, item]));
  if (byRole.size !== roles.length) fail(`${gate.id}: duplicate evidence role`);
  for (const role of roles) {
    const item = byRole.get(role);
    if (!item || !sha256Pattern.test(item.sha256 || '')) {
      fail(`${gate.id}: missing evidence for ${role}`);
    }
    const absolute = safePath(root, item.path);
    if (!existsSync(absolute) || lstatSync(absolute).isSymbolicLink() || !lstatSync(absolute).isFile()) {
      fail(`${gate.id}: evidence is not a regular file for ${role}`);
    }
    const actual = createHash('sha256').update(readFileSync(absolute)).digest('hex');
    if (actual !== item.sha256) fail(`${gate.id}: evidence hash mismatch for ${role}`);
  }
};

const isDigest = (value) => sha256Pattern.test(value || '');
const isText = (value) => typeof value === 'string' && value.trim().length > 0;
const isPositiveBytes = (value) => Number.isSafeInteger(value) && value > 0;

export function validateAndroidFirstFlashGate({
  root,
  gate,
  sourceLock,
  signingCustody,
  rollbackPolicy,
  stockRecoveryPolicy,
  backupRecoveryPolicy,
}) {
  if (gate?.schema !== 'avocadoos-android-first-flash-gate/1') fail('schema mismatch');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(gate.evaluatedAt || '')) fail('evaluatedAt is required');
  if (
    gate.target?.product !== 'avocadoOS' ||
    gate.target?.manufacturer !== 'Google' ||
    gate.target?.model !== 'Pixel 10' ||
    gate.target?.codename !== 'frankel' ||
    gate.target?.sku !== 'GL066'
  ) {
    fail('target must remain Pixel 10 / frankel / GL066');
  }
  if (
    gate.policy?.decision !== 'ALL_FOUR_GATES_MUST_PASS_BEFORE_FIRST_FLASH' ||
    gate.policy?.privateKeysStoredInRepository !== false ||
    gate.policy?.recoverySecretsStoredInRepository !== false ||
    gate.policy?.signingCustodyDecision !==
      'OFFLINE_WORKSTATION_WITH_PRIMARY_AND_SEPARATE_STANDBY_PHYSICAL_HSM' ||
    gate.policy?.signingCustodyPolicy !== 'data/android-signing-custody-policy.json' ||
    gate.policy?.rollbackIndexDecision !==
      'SIGNED_RELEASE_UTC_EPOCH_MONOTONIC_AND_COMMIT_AFTER_SUCCESSFUL_SLOT' ||
    gate.policy?.rollbackIndexPolicy !== 'data/android-rollback-index-policy.json' ||
    gate.policy?.stockRecoveryDecision !==
      'LATEST_STABLE_MATCHING_FACTORY_AND_FULL_OTA_PAIR_AT_FIRMWARE_FREEZE' ||
    gate.policy?.stockRecoveryPolicy !== 'data/android-stock-recovery-policy.json' ||
    gate.policy?.backupRecoveryDecision !==
      'DUAL_WRAPPED_RANDOM_DATA_KEY_WITH_DEVICE_KEYSTORE_AND_OWNER_RECOVERY_PHRASE' ||
    gate.policy?.backupRecoveryPolicy !== 'data/android-backup-recovery-policy.json' ||
    gate.policy?.authoritativeDocument !== 'docs/android-first-flash-gate-20260916.md'
  ) {
    fail('policy boundary changed');
  }
  if (
    signingCustody?.schema !== 'avocadoos-android-signing-custody/1' ||
    signingCustody?.product !== 'avocadoOS' ||
    signingCustody?.status !==
      'architecture_approved_provisioning_and_end_to_end_signing_pending' ||
    signingCustody?.architecture?.signingHost !== 'dedicated_offline_workstation' ||
    signingCustody?.architecture?.primarySigner !== 'local_physical_hsm' ||
    signingCustody?.architecture?.standbySigner !==
      'sealed_secondary_physical_hsm_in_separate_location' ||
    signingCustody?.architecture?.hsmVendor !== 'Yubico' ||
    signingCustody?.architecture?.hsmModel !== 'YubiHSM 2' ||
    signingCustody?.architecture?.hsmQuantity !== 2 ||
    signingCustody?.architecture?.independentVerificationHostRequired !== true ||
    signingCustody?.architecture?.rawPrivateKeyExportAllowed !== false ||
    signingCustody?.architecture?.wrappedBackupOnly !== true ||
    signingCustody?.architecture?.onlinePrivateKeyUseAllowed !== false ||
    signingCustody?.architecture?.cloudKmsAsSoleSigningRootAllowed !== false ||
    signingCustody?.architecture?.twoPersonApprovalRequired !== false ||
    signingCustody?.architecture?.singleAuthorizedOperatorRecoveryAllowed !== true ||
    signingCustody?.keySeparation?.oneKeyForAllRolesAllowed !== false ||
    JSON.stringify(signingCustody?.keySeparation?.requiredRoleClasses) !==
      JSON.stringify(['avb', 'ota', 'system-applications', 'apex-system-components']) ||
    signingCustody?.keySeparation?.exactKeyInventoryDerivedFromFinalTargetFiles !== true ||
    signingCustody?.keySeparation?.operatorDeviceAccessCredentialSeparated !== true ||
    signingCustody?.androidIntegration?.vendorAndModelSelected !== true ||
    signingCustody?.rotationAndRevocation?.policyVersion !== '1.0' ||
    signingCustody?.rotationAndRevocation?.status !== 'approved_not_drilled' ||
    signingCustody?.rotationAndRevocation?.avb?.schedule !==
      'long_lived_event_driven' ||
    signingCustody?.rotationAndRevocation?.avb?.calendarRotationRequired !== false ||
    signingCustody?.rotationAndRevocation?.ota?.schedule !==
      'event_driven_with_staged_overlap' ||
    signingCustody?.rotationAndRevocation?.systemApplications
      ?.platformIdentitySchedule !== 'long_lived_event_driven' ||
    signingCustody?.rotationAndRevocation?.systemApplications
      ?.ordinaryApplicationKeyTargetMonths !== 24 ||
    signingCustody?.rotationAndRevocation?.systemApplications
      ?.proofOfRotationRequiredWhenSupported !== true ||
    signingCustody?.rotationAndRevocation?.apex?.schedule !==
      'long_lived_event_driven' ||
    signingCustody?.rotationAndRevocation?.apex?.payloadAndContainerMigratedTogether !== true ||
    signingCustody?.rotationAndRevocation?.stagedMigration
      ?.oldAndNewTrustIntroducedBeforeNewOnlySigning !== true ||
    signingCustody?.rotationAndRevocation?.stagedMigration?.minimumTransitionReleases !== 1 ||
    signingCustody?.rotationAndRevocation?.stagedMigration
      ?.newKeyAcceptanceAndRecoveryVerifiedBeforeOldKeyRetirement !== true ||
    signingCustody?.rotationAndRevocation?.stagedMigration?.strandUnupdatedDevicesAllowed !==
      false ||
    signingCustody?.rotationAndRevocation?.incidentResponse
      ?.stopAffectedSigningImmediately !== true ||
    signingCustody?.rotationAndRevocation?.incidentResponse?.compromisedKeyMaySignAgain !==
      false ||
    signingCustody?.rotationAndRevocation?.incidentResponse?.replacementUsesFreshKeyMaterial !==
      true ||
    signingCustody?.recovery?.primaryAndStandbyStoredTogetherAllowed !== false ||
    signingCustody?.recovery?.publicTestKeyFallbackAllowed !== false ||
    signingCustody?.separateIncidentChannel?.operatorDiagnosticPluginIsSigningRecovery !== false ||
    signingCustody?.separateIncidentChannel?.operatorDiagnosticPluginMayRecoverBrickedDevice !== false ||
    signingCustody?.separateIncidentChannel?.operatorDiagnosticPluginMayExtractSigningKeys !== false ||
    signingCustody?.authoritativeDocument !== 'docs/android-production-signing-custody.md'
  ) {
    fail('production signing custody architecture changed');
  }
  if (
    rollbackPolicy?.schema !== 'avocadoos-avb-rollback-index-policy/1' ||
    rollbackPolicy?.product !== 'avocadoOS' ||
    rollbackPolicy?.target !== 'Google Pixel 10 / frankel / GL066' ||
    rollbackPolicy?.status !==
      'policy_approved_exact_locations_values_and_device_test_pending' ||
    rollbackPolicy?.valuePolicy?.avocadoManagedSource !==
      'signed_release_manifest.releaseEpochUtcSeconds' ||
    rollbackPolicy?.valuePolicy?.fixedBeforeSigning !== true ||
    rollbackPolicy?.valuePolicy?.integerUnixSecondsUtc !== true ||
    rollbackPolicy?.valuePolicy?.strictlyGreaterThanPreviousProductionRelease !== true ||
    rollbackPolicy?.valuePolicy?.marketingVersionCoupled !== false ||
    rollbackPolicy?.valuePolicy?.wallClockReadDuringBuildAllowed !== false ||
    rollbackPolicy?.googleControlledPolicy?.preserveExactUpstreamValues !== true ||
    rollbackPolicy?.googleControlledPolicy?.synthesizeReplacementValues !== false ||
    rollbackPolicy?.googleControlledPolicy?.flashOlderAndroid16BootloaderAllowed !== false ||
    rollbackPolicy?.googleControlledPolicy?.factoryOrFullOtaMayBypassRollback !== false ||
    rollbackPolicy?.locations?.deriveFromFinalTargetFilesAndSignedAvbMetadata !== true ||
    rollbackPolicy?.locations?.guessBeforeFullBuildAllowed !== false ||
    !rollbackPolicy?.locations?.approvedMap ||
    Array.isArray(rollbackPolicy.locations.approvedMap) ||
    Object.keys(rollbackPolicy.locations.approvedMap).length !== 0 ||
    rollbackPolicy?.abCommit?.advanceStoredIndexOnlyFromSlotMarkedSuccessful !== true ||
    rollbackPolicy?.abCommit?.advanceFromUnsuccessfulTrialSlot !== false ||
    rollbackPolicy?.abCommit?.failedUpdateMayReturnToPreviouslyBootableSlot !== true ||
    rollbackPolicy?.abCommit?.failedUpdateMayDecreaseStoredIndex !== false ||
    rollbackPolicy?.downgradeAndRecovery?.signedOlderIndexAccepted !== false ||
    rollbackPolicy?.downgradeAndRecovery?.recoveryExceptionAllowed !== false ||
    rollbackPolicy?.downgradeAndRecovery?.lowerIndexForDataRescueAllowed !== false ||
    rollbackPolicy?.downgradeAndRecovery?.matchingCurrentFullOtaOrFactoryImageRequired !== true ||
    rollbackPolicy?.authoritativeDocument !== 'docs/android-rollback-index-policy.md'
  ) {
    fail('rollback index policy changed');
  }
  if (
    stockRecoveryPolicy?.schema !== 'avocadoos-google-stock-recovery-policy/1' ||
    stockRecoveryPolicy?.product !== 'avocadoOS' ||
    stockRecoveryPolicy?.target?.manufacturer !== 'Google' ||
    stockRecoveryPolicy?.target?.model !== 'Pixel 10' ||
    stockRecoveryPolicy?.target?.codename !== 'frankel' ||
    stockRecoveryPolicy?.target?.sku !== 'GL066' ||
    stockRecoveryPolicy?.status !==
      'design_approved_owner_terms_and_exact_artifacts_pending' ||
    stockRecoveryPolicy?.selection?.channel !==
      'latest_stable_at_avocadoos_firmware_freeze' ||
    stockRecoveryPolicy?.selection?.factoryAndFullOtaSameBuildRequired !== true ||
    stockRecoveryPolicy?.selection?.previewOrBetaAllowed !== false ||
    stockRecoveryPolicy?.selection?.olderAndroid16BuildAllowed !== false ||
    stockRecoveryPolicy?.selection?.refreshWithEveryFirmwareBaselineChange !== true ||
    stockRecoveryPolicy?.uses?.fullOta !==
      'non_wipe_recovery_and_both_slot_bootability' ||
    stockRecoveryPolicy?.uses?.factoryImage !== 'last_resort_wipe_recovery' ||
    stockRecoveryPolicy?.uses?.factoryImageMayBeUsedWithoutExplicitWipeAcknowledgement !==
      false ||
    stockRecoveryPolicy?.uses?.downloadAloneAuthorizesFlash !== false ||
    stockRecoveryPolicy?.antiRollback?.may2026Pixel10BootloaderIncreaseApplies !== true ||
    stockRecoveryPolicy?.antiRollback?.bothSlotsMadeBootableWithMatchingFullOtaBeforeRiskyFlash !==
      true ||
    stockRecoveryPolicy?.antiRollback?.downgradeForRecoveryAllowed !== false ||
    stockRecoveryPolicy?.custody?.artifactBytesStoredInGit !== false ||
    stockRecoveryPolicy?.custody?.offlineArtifactCopiesRequired !== true ||
    stockRecoveryPolicy?.custody?.repositoryStoresFileNameBytesSha256AndBuildOnly !== true ||
    stockRecoveryPolicy?.ownerTerms?.ownerAcceptanceRecorded !== false ||
    stockRecoveryPolicy?.artifacts?.buildId !== null ||
    stockRecoveryPolicy?.artifacts?.factoryImage?.fileName !== null ||
    stockRecoveryPolicy?.artifacts?.fullOta?.fileName !== null ||
    stockRecoveryPolicy?.authoritativeDocument !== 'docs/android-google-stock-recovery.md'
  ) {
    fail('Google stock recovery policy changed');
  }
  if (
    backupRecoveryPolicy?.schema !== 'avocadoos-android-backup-recovery-policy/1' ||
    backupRecoveryPolicy?.product !== 'avocadoOS' ||
    backupRecoveryPolicy?.target !== 'Google Pixel 10 / frankel / GL066' ||
    backupRecoveryPolicy?.status !==
      'design_approved_core_envelope_implemented_ui_import_and_device_drill_pending' ||
    backupRecoveryPolicy?.decision !==
      'DUAL_WRAPPED_RANDOM_DATA_KEY_WITH_DEVICE_KEYSTORE_AND_OWNER_RECOVERY_PHRASE' ||
    backupRecoveryPolicy?.envelope?.format !== 'avocadoos-recoverable-backup/2' ||
    backupRecoveryPolicy?.envelope?.maximumPlaintextBytes !== 4 * 1024 * 1024 ||
    backupRecoveryPolicy?.envelope?.contentCipher !== 'AES-256-GCM' ||
    backupRecoveryPolicy?.envelope?.dataKey !== 'fresh_256_bit_random_per_backup' ||
    backupRecoveryPolicy?.envelope?.authenticationTagBits !== 128 ||
    backupRecoveryPolicy?.envelope?.nonceBytes !== 12 ||
    backupRecoveryPolicy?.envelope?.nonceReuseAllowed !== false ||
    backupRecoveryPolicy?.envelope?.saltBytes !== 32 ||
    backupRecoveryPolicy?.envelope?.ownerBinding !==
      'SHA-256 of the canonical owner identity' ||
    backupRecoveryPolicy?.envelope?.trailingBytesAllowed !== false ||
    backupRecoveryPolicy?.wrapping?.deviceRoute?.key !==
      'non_exportable_hardware_backed_android_keystore_aes_256' ||
    backupRecoveryPolicy?.wrapping?.deviceRoute?.cipher !== 'AES-256-GCM' ||
    backupRecoveryPolicy?.wrapping?.ownerRoute?.entropyBits !== 256 ||
    backupRecoveryPolicy?.wrapping?.ownerRoute?.presentation !==
      '24_word_checksum_protected_owner_recovery_phrase' ||
    backupRecoveryPolicy?.wrapping?.ownerRoute?.phraseIsWalletSeed !== false ||
    backupRecoveryPolicy?.wrapping?.ownerRoute?.kdf !== 'HKDF-SHA-256' ||
    backupRecoveryPolicy?.wrapping?.ownerRoute?.passwordOnlyRecoveryAllowed !== false ||
    backupRecoveryPolicy?.wrapping?.sameDataKeyWrappedByBothRoutes !== true ||
    backupRecoveryPolicy?.wrapping?.operatorUniversalRecoveryKeyAllowed !== false ||
    backupRecoveryPolicy?.wrapping?.serverEscrowOfOwnerRecoverySecretAllowed !== false ||
    backupRecoveryPolicy?.recoverySecretCustody?.generatedLocally !== true ||
    backupRecoveryPolicy?.recoverySecretCustody?.networkRequired !== false ||
    backupRecoveryPolicy?.recoverySecretCustody?.storedInGit !== false ||
    backupRecoveryPolicy?.recoverySecretCustody?.storedByOperator !== false ||
    backupRecoveryPolicy?.recoverySecretCustody?.ownerOfflineCopies !== 2 ||
    backupRecoveryPolicy?.recoverySecretCustody?.copiesStoredInSeparatePlaces !== true ||
    backupRecoveryPolicy?.recoverySecretCustody?.storedTogetherWithBackupFileAllowed !== false ||
    backupRecoveryPolicy?.backupScope?.allowlistOnly !== true ||
    !backupRecoveryPolicy?.backupScope?.excluded?.includes('Wallet private keys and seed phrases') ||
    !backupRecoveryPolicy?.backupScope?.excluded?.includes(
      'operator credentials and emergency-access credentials',
    ) ||
    backupRecoveryPolicy?.restore?.wrongPhraseRejected !== true ||
    backupRecoveryPolicy?.restore?.wrongOwnerRejected !== true ||
    backupRecoveryPolicy?.restore?.tamperingRejected !== true ||
    backupRecoveryPolicy?.restore?.unsupportedFormatRejected !== true ||
    backupRecoveryPolicy?.restore?.restoreMayActivateOldApprovalsOrSessions !== false ||
    backupRecoveryPolicy?.migration?.legacyReadWithOriginalDeviceKeyRetained !== true ||
    backupRecoveryPolicy?.migration?.newLegacyBackupsAllowedAfterV2Activation !== false ||
    backupRecoveryPolicy?.migration?.legacyBackupCanSurviveKeystoreLoss !== false ||
    backupRecoveryPolicy?.implementation?.coreDualWrappedEnvelope !==
      'implemented_host_34_tests_passed' ||
    backupRecoveryPolicy?.implementation?.ownerPhraseCodecAndConfirmationUi !== 'pending' ||
    backupRecoveryPolicy?.implementation?.platformImportAndTransactionalRestore !== 'pending' ||
    backupRecoveryPolicy?.implementation?.newDeviceKeystoreRebinding !== 'pending' ||
    backupRecoveryPolicy?.implementation?.physicalWipeAndRestoreDrill !== 'pending' ||
    backupRecoveryPolicy?.gate?.policyApprovalIsPassEvidence !== false ||
    backupRecoveryPolicy?.gate?.hostCryptoTestIsPhysicalRestoreEvidence !== false ||
    backupRecoveryPolicy?.gate?.passRequiresPhysicalKeystoreLossRestore !== true ||
    backupRecoveryPolicy?.authoritativeDocument !== 'docs/android-backup-recovery.md'
  ) {
    fail('backup recovery policy changed');
  }
  if (!Array.isArray(gate.gates) || gate.gates.length !== expectedRoles.size) {
    fail('exactly four gates are required');
  }
  const byId = new Map(gate.gates.map((item) => [item?.id, item]));
  if (byId.size !== expectedRoles.size) fail('gate ID is missing or duplicated');
  for (const [id, roles] of expectedRoles) {
    const item = byId.get(id);
    if (!item || !['blocked', 'pass'].includes(item.status)) fail(`${id}: invalid status`);
    if (item.status === 'blocked' && !isText(item.blocker)) fail(`${id}: blocker is required`);
    validateEvidence({ root, gate: item, roles });
  }

  const signing = byId.get('production-signing-key-lifecycle');
  if (signing.custodyProcedure !== 'docs/android-production-signing-custody.md') {
    fail('production signing custody procedure is not bound');
  }
  if (
    signing.lossRotationAndRevocationProcedure !==
    'docs/android-production-signing-custody.md'
  ) {
    fail('production signing rotation and revocation procedure is not bound');
  }
  if (
    signing.status === 'pass' &&
    (!isText(signing.keySetId) ||
      !isDigest(signing.avbPublicKeySha256) ||
      !isDigest(signing.otaPublicKeySha256) ||
      !isText(signing.custodyProcedure) ||
      !isText(signing.lossRotationAndRevocationProcedure))
  ) {
    fail('production signing identity and lifecycle are incomplete');
  }

  const rollback = byId.get('rollback-index-operations');
  if (
    rollback.status === 'pass' &&
    (!isText(rollback.policyVersion) ||
      !rollback.indexLocations ||
      Array.isArray(rollback.indexLocations) ||
      Object.keys(rollback.indexLocations).length === 0 ||
      Object.entries(rollback.indexLocations).some(
        ([location, value]) => !/^\d+$/.test(location) || !Number.isSafeInteger(value) || value < 0,
      ) ||
      !isText(rollback.increaseRule) ||
      !isText(rollback.downgradeRule) ||
      !isText(rollback.recoveryExceptionRule))
  ) {
    fail('rollback index operations are incomplete');
  }

  const stock = byId.get('google-stock-recovery-artifacts');
  const validArtifact = (artifact) =>
    isText(artifact?.fileName) &&
    isPositiveBytes(artifact?.bytes) &&
    isDigest(artifact?.sha256);
  if (stock.status === 'pass' && (!validArtifact(stock.factoryImage) || !validArtifact(stock.fullOta))) {
    fail('exact factory image and full OTA identities are incomplete');
  }

  const backup = byId.get('keystore-loss-backup-restore');
  if (
    backup.formatVersion !== backupRecoveryPolicy.envelope.format ||
    !isText(backup.recoveryMechanism)
  ) {
    fail('Keystore-loss restore design is not bound');
  }
  if (
    backup.status === 'pass' &&
    (backup.formatVersion !== 'avocadoos-recoverable-backup/2' ||
      backup.keystoreLossRecoverySupported !== true ||
      !isText(backup.recoveryMechanism) ||
      !isText(backup.restoreDrillResult))
  ) {
    fail('Keystore-loss restore is incomplete');
  }

  const derived = [...byId.values()].every(({ status }) => status === 'pass');
  if (gate.passed !== derived) fail('passed does not match the four gate states');
  if (
    sourceLock?.firstFlashGate?.schema !== gate.schema ||
    sourceLock?.firstFlashGate?.path !== 'data/android-first-flash-gate.json' ||
    sourceLock?.firstFlashGate?.passed !== gate.passed
  ) {
    fail('phone source lock is not bound to this gate');
  }
  if (sourceLock?.flashReady === true && !gate.passed) {
    fail('flashReady cannot be true before all four gates pass');
  }
  return {
    target: 'Pixel 10 / frankel / GL066',
    passed: derived,
    passedCount: [...byId.values()].filter(({ status }) => status === 'pass').length,
    blocked: [...byId.values()].filter(({ status }) => status !== 'pass').map(({ id }) => id),
  };
}
