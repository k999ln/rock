import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const platform = JSON.parse(read('contracts/platform-api.json'));
assert.equal(platform.schemaVersion, 1);
assert.equal(platform.apiVersion, 1);
assert.deepEqual(platform.componentKinds, ['TOOL', 'MCP', 'PROVIDER']);
assert.equal(platform.registrationTrust, 'installed_apk_signer_and_uid_verified_by_os_broker');
assert.deepEqual(platform.approvalFlow, ['PROPOSED', 'DEVICE_CREDENTIAL', 'ISSUED', 'CONSUMED']);
assert.equal(platform.ledger.mutation, 'compensating_reversal_only');
assert.equal(platform.storage.encryption, 'AES-256-GCM_ANDROID_KEYSTORE');
assert.equal(platform.storage.backupFormat, 'rockstar-platform-backup/1');
assert.equal(platform.storage.recoverableBackupFormat, 'avocadoos-recoverable-backup/2');
assert.equal(platform.storage.recoverableBackupStateFormat, 'avocadoos-platform-state/2');
assert.equal(
  platform.storage.recoverableBackupEncryption,
  'AES-256-GCM_FRESH_DEK_DUAL_WRAPPED_BY_ANDROID_KEYSTORE_AND_HKDF_SHA256_OWNER_RECOVERY',
);
assert.equal(
  platform.storage.recoverableBackupStatus,
  'SHELL_API_V4_UI_TRANSACTIONAL_IMPORT_AND_NEW_KEYSTORE_BINDING_EMULATOR_PASS_PHYSICAL_WIPE_PENDING',
);
assert.deepEqual(platform.storage.recoverableBackupRestoreSafety, {
  emptyTargetRequired: true,
  restoredAutomationPaused: true,
  restoredSkySelectionTokenRotated: true,
  restoredApprovalsStopped: true,
  installedComponentAuthorityRestored: false,
  operatorUniversalRecoveryKey: false,
  walletSeed: false,
});
assert.equal(platform.storage.schemaVersion, 2);
assert.equal(platform.isolation.runtimeRegistrationCanGrantDomain, false);
assert.equal(platform.isolation.shellBinderPermission, 'dev.rock.permission.USE_SHELL_API');
assert.equal(platform.isolation.shellMayRequestManagementPermission, false);
assert.equal(platform.isolation.currentLayout, 'dev.rock.shell_ui_separate_from_dev.rock.automation_broker');
assert.equal(platform.isolation.targetLayout, 'dev.rock.shell_ui_separate_from_dev.rock.automation_headless_broker');
assert.equal(platform.isolation.targetPolicy, 'data/android-release-architecture-policy.json');
assert.equal(platform.isolation.targetStateImplemented, true);
assert.deepEqual(platform.nativeSkyHandoff, {
  shellApiVersion: 4,
  selectionStore: 'broker_sqlite',
  selectionSchemaVersion: 2,
  selectionTokenRequiredByZema: true,
  selectionSurvivesUiAndDeviceRestart: true,
  browserSessionStorageUsed: false,
  v1ToolAllowlist: ['article-preparation@1'],
});
assert.equal(platform.releaseStatus, 'NOT_PRODUCTION_READY');
const platformAidl = read('android/tool-sdk/src/main/aidl/dev/rock/sdk/IPlatformApi.aidl');
const platformStore = read('android/core/src/main/java/dev/rock/core/platform/PlatformStore.java');
const platformService = read('android/automation/src/main/java/dev/rock/automation/RockPlatformService.java');
const encryptedBackup = read('android/core/src/main/java/dev/rock/core/platform/EncryptedBackup.java');
const recoveryPhrase = read('android/core/src/main/java/dev/rock/core/platform/RecoveryPhrase.java');
const recoverableManager = read('android/automation/src/main/java/dev/rock/automation/RecoverableBackupManager.java');
assert.ok(platformAidl.includes('const int API_VERSION = 1'));
for (const call of ['registerComponent', 'requestApproval', 'stopComponent', 'revokeComponent', 'recordLedgerReceipt', 'recordProviderReceipt', 'createEncryptedBackup']) assert.ok(platformAidl.includes(`${call}(`));
assert.ok(platformStore.includes("'PROPOSED','ISSUED','CONSUMED','STOPPED','REVOKED','EXPIRED'"));
assert.ok(platformStore.includes('ALTER TABLE platform_approvals RENAME TO platform_approvals_v1'));
assert.ok(platformStore.includes('UNIQUE(owner,provider_ref)'));
assert.ok(platformStore.includes('UNIQUE(owner,reverses_receipt)'));
assert.ok(platformService.includes('PackageManager.GET_SIGNING_CERTIFICATES'));
assert.ok(platformService.includes('RecoverableBackupManager'));
assert.ok(encryptedBackup.includes('PlatformApi.RECOVERABLE_BACKUP_FORMAT'));
assert.ok(encryptedBackup.includes('openWithRecoverySecret'));
assert.ok(recoveryPhrase.includes('backup-recovery-phrase'));
assert.ok(recoveryPhrase.includes('does not use the BIP-39 word list'));
assert.ok(recoverableManager.includes('AndroidKeyStore'));
assert.ok(platformStore.includes('restoreRecoverableState'));
assert.ok(platformStore.includes('RESTORE_TARGET_NOT_EMPTY'));
assert.ok(read('android/automation/src/main/AndroidManifest.xml').includes(platform.managementPermission));
assert.ok(!read('android/automation/src/main/AndroidManifest.xml').includes('.MainActivity'));
assert.ok(read('android/shell/src/main/AndroidManifest.xml').includes('.MainActivity'));
assert.ok(read('android/shell/src/main/AndroidManifest.xml').includes('dev.rock.permission.USE_SHELL_API'));
assert.ok(!read('android/shell/src/main/AndroidManifest.xml').includes(platform.managementPermission));
assert.ok(!read('android/shell/src/main/AndroidManifest.xml').includes('android.permission.INTERNET'));
assert.ok(!read('android/automation/src/main/AndroidManifest.xml').includes('sharedUserId'));
assert.ok(!read('android/article-tool/src/main/AndroidManifest.xml').includes('sharedUserId'));
assert.ok(read('os/device/rock_cf_x86_64_phone.mk').includes('PRODUCT_PRIVATE_SEPOLICY_DIRS'));
assert.ok(read('os/physical/rockstaros.mk').includes('PRODUCT_PRIVATE_SEPOLICY_DIRS'));
const seapp = read('android/sepolicy/private/seapp_contexts');
assert.ok(seapp.includes('name=dev.rock.automation'));
assert.ok(seapp.includes('name=dev.rock.shell domain=rock_shell_app'));
assert.ok(seapp.includes('name=com.localactionassistant domain=rock_local_ai_app'));
assert.ok(seapp.includes('name=dev.rock.tools.article'));
assert.ok(seapp.includes('name=dev.rock.operator.agent domain=rock_operator_agent'));
assert.ok(!seapp.includes('seinfo=rockstar_tool'));
const contract = JSON.parse(read('contracts/article-tool.json'));
assert.deepEqual(Object.keys(contract).sort(), ['schemaVersion', 'packageId', 'versionCode', 'toolApi', 'minAndroidApi', 'service', 'operations', 'effects', 'capabilities', 'network', 'maxPayloadBytes', 'trustMode', 'thirdPartyInstallEnabled'].sort());
assert.equal(contract.schemaVersion, 1);
assert.equal(contract.network, 'none');
assert.equal(contract.trustMode, 'fixed-own-author');
assert.equal(contract.thirdPartyInstallEnabled, false);
assert.deepEqual(contract.operations, ['citations@1', 'free-article@1']);
assert.deepEqual(contract.capabilities, ['artifact.read:input', 'artifact.write:output']);
assert.equal(contract.maxPayloadBytes, 32768);
assert.equal(contract.minAndroidApi, 35);
assert.equal(contract.versionCode, 1);
const manifest = read('android/article-tool/src/main/AndroidManifest.xml');
assert.ok(!/uses-permission|sharedUserId/.test(manifest));
assert.ok(manifest.includes('android:permission="dev.rock.permission.RUN_TOOL"'));
assert.ok(read('android/article-tool/build.gradle').includes(`applicationId '${contract.packageId}'`));
assert.ok(read('android/automation/src/main/java/dev/rock/automation/ToolConnection.java').includes(`PACKAGE = "${contract.packageId}"`));
assert.ok(read('android/automation/src/main/AndroidManifest.xml').includes('android:protectionLevel="signature"'));
for (const operation of contract.operations) {
  assert.ok(read('android/core/src/main/java/dev/rock/core/Engine.java').includes(`"${operation}"`));
  assert.ok(read('android/article-tool/src/main/java/dev/rock/tools/article/ArticleService.java').includes(`"${operation}"`));
}
const lock = JSON.parse(read('os/source-lock.json'));
assert.match(lock.manifestCommit, /^[a-f0-9]{40}$/);
assert.equal(lock.pixelSupported, false);
assert.equal(lock.imageBuildVerified, false);
assert.equal(lock.imageBootVerified, false);
assert.ok(read('os/device/AndroidProducts.mk').includes(`${lock.product}-${lock.releaseConfig}-${lock.variant}`));
assert.ok(read('android/Android.bp').includes('RockAutomationPrototype'));
assert.ok(read('android/Android.bp').includes('name: "RockShell"'));
const shellApi = read('android/shell-api/src/main/aidl/dev/rock/shellapi/IShellApi.aidl');
assert.ok(shellApi.includes('const int API_VERSION = 4'));
for (const call of ['snapshot', 'submit', 'setPaused', 'result', 'complete', 'retry', 'cancel', 'localAiStatus', 'submitZema', 'skySelection', 'selectSkyTool', 'recoveryStatus', 'beginRecoverySetup', 'confirmRecoverySetup', 'createRecoverableBackup', 'restoreRecoverableBackup']) assert.ok(shellApi.includes(`${call}(`));
const shellService = read('android/automation/src/main/java/dev/rock/automation/RockShellService.java');
assert.ok(shellService.includes('SHELL_PACKAGE = "dev.rock.shell"'));
assert.ok(shellService.includes('getPackagesForUid(uid)'));
assert.ok(shellService.includes('checkSignatures(getPackageName(), SHELL_PACKAGE)'));
assert.ok(shellService.includes('new ZemaOrchestrator'));
assert.ok(shellService.includes('engine().selectSkyTool(toolId)'));
const engine = read('android/core/src/main/java/dev/rock/core/Engine.java');
assert.ok(engine.includes('SCHEMA_VERSION = 2'));
assert.ok(engine.includes('CREATE TABLE sky_selection'));
assert.ok(engine.includes('requireSkySelection'));
const zemaPlan = read('android/tool-sdk/src/main/java/dev/rock/sdk/ZemaToolPlan.java');
assert.ok(zemaPlan.includes('ZEMA_TOOL_SUBSTITUTION'));
assert.ok(zemaPlan.includes('ArticlePayload.validateExecutable(canonical)'));
const shellMain = read('android/shell/src/main/java/dev/rock/shell/MainActivity.java');
assert.ok(shellMain.includes('new ShellConnection(this)'));
assert.ok(shellMain.includes('connection.selectSkyTool(ARTICLE_TOOL)'));
assert.ok(shellMain.includes('selectionToken'));
assert.ok(!/dev\.rock\.core|AndroidDatabase|RockApplication/.test(shellMain));
const localAi = JSON.parse(read('contracts/local-ai-runtime.json'));
const localAiLock = JSON.parse(read(localAi.sourceLock));
const localAiValidation = JSON.parse(read(localAi.sourceValidation));
const localAiOverlayValidation = JSON.parse(read(localAi.overlayValidation));
const localAiArtifact = JSON.parse(read(localAi.artifactLock));
assert.equal(localAi.schemaVersion, 1);
assert.equal(localAi.routeId, 'local-action-assistant');
assert.equal(localAi.executionTarget, 'local');
assert.equal(localAi.apiVersion, 2);
assert.equal(localAi.androidPackage, 'com.localactionassistant');
assert.equal(localAi.androidService, 'com.localactionassistant.RockLocalAiService');
assert.equal(localAi.androidPermission, 'dev.rock.permission.USE_LOCAL_AI');
assert.equal(localAi.trustedCallerPackage, 'dev.rock.automation');
assert.equal(localAi.trustMode, 'fixed_package_same_signer');
assert.equal(localAi.engine, 'llama.rn');
assert.equal(localAi.engineVersion, '0.12.9');
assert.equal(localAi.modelFormat, 'GGUF');
assert.equal(localAi.modelBundled, false);
assert.equal(localAi.releaseNetwork, 'none');
assert.deepEqual(localAi.tools, ['get_current_datetime', 'calculate', 'search_notes', 'list_reminders', 'create_note', 'create_reminder']);
assert.deepEqual(localAi.mutatingTools, ['create_note', 'create_reminder']);
assert.equal(localAi.mutationConfirmation, 'required');
assert.deepEqual(localAi.planOnly, {
  schemaId: 'article-preparation@1/input-v1',
  toolId: 'article-preparation@1',
  responseFormat: 'json_schema',
  toolCallsAllowed: false,
  unknownFieldsAllowed: false,
  brokerExecutablePreflight: true,
});
assert.deepEqual(localAi.events, ['token', 'proposal', 'completed', 'failed']);
assert.equal(localAi.maxPayloadBytes, 32768);
assert.equal(localAi.timeoutSeconds, 90);
assert.equal(localAi.aospModule, 'RockLocalActionAssistant');
assert.equal(localAi.aospStagingPath, 'vendor/rockstaros-local-ai');
assert.equal(localAi.aospSigning, 'testkey_then_release_key_mapping');
assert.equal(localAi.sourceStatus, 'pinned_overlay_extensions_native_apk_built');
assert.equal(localAi.osBridgeStatus, 'plan_v2_emulator_and_physical_pixel_verified');
assert.equal(localAi.signedApkStatus, 'unsigned_release_plan_v2_reviewed_test_signed_emulator_and_physical_pixel');
assert.equal(localAi.imageStatus, 'not_built');
assert.equal(localAi.deviceInferenceStatus, 'physical_pixel_plan_tool_result_history_pass_not_os_image');
assert.equal(localAiLock.commit, '99b1c40d76f719cbba9c72d9f481c1b2df245504');
assert.equal(localAiLock.packageName, localAi.androidPackage);
assert.equal(localAiLock.runtime.engine, localAi.engine);
assert.equal(localAiLock.runtime.version, localAi.engineVersion);
assert.equal(localAiLock.runtime.modelBundled, localAi.modelBundled);
assert.equal(localAiLock.sourceLicense, 'MIT');
assert.equal(createHash('sha256').update(readFileSync(new URL(`../${localAiLock.overlay.path}`, import.meta.url))).digest('hex'), localAiLock.overlay.sha256);
assert.equal(localAiLock.overlay.extensions.length, 1);
for (const extension of localAiLock.overlay.extensions) {
  assert.match(extension.path, /^os\/physical\/.+\.patch$/);
  assert.equal(createHash('sha256').update(readFileSync(new URL(`../${extension.path}`, import.meta.url))).digest('hex'), extension.sha256);
}
assert.equal(localAiLock.integration.osBridge, 'PLAN_V2_NATIVE_COMPILED_EMULATOR_AND_PHYSICAL_BOUND');
assert.equal(localAiLock.integration.signedApk, 'UNSIGNED_RELEASE_APK_REVIEWED');
assert.equal(localAiLock.integration.productPackage, 'STAGING_READY_NOT_IMAGE_INTEGRATED');
assert.equal(localAiLock.imageBuildVerified, false);
assert.equal(localAiLock.deviceInferenceVerified, true);
assert.equal(localAiValidation.commit, localAiLock.commit);
assert.equal(localAiValidation.results.typescript, 'PASS');
assert.equal(localAiValidation.results.jestTests, 10);
assert.equal(localAiValidation.results.jest, 'PASS');
assert.equal(localAiValidation.results.eslint, 'PASS');
assert.equal(localAiValidation.results.offlineManifestSourceCheck, 'PASS');
assert.equal(localAiValidation.results.npmAuditVulnerabilities, 0);
assert.ok(localAiValidation.notRun.includes('Android Gradle build'));
assert.ok(localAiValidation.notRun.includes('physical device inference'));
assert.equal(localAiOverlayValidation.sourceCommit, localAiLock.commit);
assert.equal(localAiOverlayValidation.overlaySha256, localAiLock.overlay.sha256);
assert.equal(localAiOverlayValidation.results.cleanArchiveOverlayApply, 'PASS');
assert.equal(localAiOverlayValidation.results.aidlClientServerByteParity, 'PASS');
assert.equal(localAiOverlayValidation.results.mutationProposalTtl, '5_MINUTES_FAIL_CLOSED');
assert.equal(localAiOverlayValidation.results.typescript, 'PASS');
assert.equal(localAiOverlayValidation.results.jestTests, 15);
assert.equal(localAiOverlayValidation.results.kotlinCompilation, 'PASS');
assert.equal(localAiOverlayValidation.results.androidGradleBuild, 'PASS');
assert.equal(localAiOverlayValidation.results.mergedApkManifestInspection, 'PASS');
assert.equal(localAiOverlayValidation.results.binderInstrumentation, 'PASS');
assert.equal(localAiArtifact.stage, 'APK_REVIEWED_NOT_IN_IMAGE');
assert.equal(localAiArtifact.sourceCommit, localAiLock.commit);
assert.equal(localAiArtifact.moduleName, localAi.aospModule);
assert.equal(localAiArtifact.packageName, localAi.androidPackage);
assert.deepEqual(localAiArtifact.requiredAbis, ['arm64-v8a']);
assert.equal(localAiArtifact.internetPermission, false);
assert.match(localAiArtifact.apkSha256, /^[a-f0-9]{64}$/);
assert.ok(localAiArtifact.apkSizeBytes > 0);
assert.equal(localAiArtifact.imageIntegrated, false);
assert.ok(read('os/physical/rockstaros.mk').includes('ro.rockstaros.local_ai.stage=source-pinned'));
assert.ok(read('os/physical/rockstaros.mk').includes('ro.rockstaros.local_ai.bridge=source-ready'));
const localAiService = read('android/local-ai-api/src/main/aidl/dev/rock/localai/ILocalAiService.aidl');
const localAiClient = read('android/automation/src/main/java/dev/rock/automation/LocalAiConnection.java');
assert.ok(localAiService.includes('int getApiVersion()'));
assert.ok(localAiService.includes('void complete('));
assert.ok(localAiService.includes('void confirm('));
assert.ok(localAiService.includes('void cancel('));
assert.ok(localAiService.includes('void completePlan('));
assert.ok(localAiClient.includes(`PACKAGE = "${localAi.androidPackage}"`));
assert.ok(localAiClient.includes(`SERVICE = PACKAGE + ".RockLocalAiService"`));
assert.ok(localAiClient.includes('checkSignatures'));
assert.ok(localAiClient.includes('Engine.MAX_BYTES'));
assert.ok(localAiClient.includes('private synchronized <T> T withService'));
assert.ok(localAiClient.includes('remote.completePlan('));
assert.ok(read('android/automation/src/main/AndroidManifest.xml').includes(localAi.androidPermission));
assert.ok(read('android/Android.bp').includes('name: "rock-local-ai-api"'));
assert.ok(read('scripts/stage-local-ai-apk.py').includes('android_app_import'));
assert.ok(read('scripts/build-phone-bringup.sh').includes('stage-local-ai-apk.py'));
const operatorOverlayStager = read('scripts/stage-operator-agent-overlay.py');
assert.ok(operatorOverlayStager.includes('runtime_resource_overlay'));
assert.ok(operatorOverlayStager.includes('Production Operator input must stay outside the Rock repository'));
assert.ok(operatorOverlayStager.includes('production Operator identity must require StrongBox'));
assert.ok(operatorOverlayStager.includes('factory reset must stay disabled'));
assert.ok(read('scripts/build-phone-bringup.sh').includes('ROCK_OPERATOR_AGENT_CONFIG'));
assert.ok(read('scripts/build-phone-bringup.sh').includes('stage-operator-agent-overlay.py" verify'));
const phoneInputFreezer = read('scripts/freeze-phone-build-inputs.py');
assert.ok(phoneInputFreezer.includes('avocadoos-google-stock-recovery-artifacts/1'));
assert.ok(phoneInputFreezer.includes('factory image and full OTA build IDs do not match'));
assert.ok(phoneInputFreezer.includes('Google artifact URL must be the exact official download URL'));
assert.ok(phoneInputFreezer.includes('local recovery bytes differ from the Google official selection record'));
assert.ok(phoneInputFreezer.includes('generated vendor tree changed after inventory freeze'));
assert.ok(phoneInputFreezer.includes('avocadoos-android-signing-plan-freeze/1'));
assert.ok(phoneInputFreezer.includes('productionSigningReady'));
const phoneBuild = read('scripts/build-phone-bringup.sh');
assert.ok(phoneBuild.includes('--mode bringup|release'));
assert.ok(phoneBuild.includes('ROCK_OPERATOR_AGENT_MODE=excluded'));
assert.ok(phoneBuild.includes('releaseFlashAllowed'));
for (const value of [
  'ROCK_GOOGLE_FACTORY_IMAGE',
  'ROCK_GOOGLE_FULL_OTA',
  'ROCK_GOOGLE_TERMS_RECORD',
  'freeze-phone-build-inputs.py" recovery',
  'freeze-phone-build-inputs.py" vendor',
  'freeze-phone-build-inputs.py" verify-vendor',
  'freeze-phone-build-inputs.py" signing-plan',
]) assert.ok(phoneBuild.includes(value));
const physicalProduct = read('os/physical/rockstaros.mk');
assert.ok(physicalProduct.includes('ifeq ($(ROCK_OPERATOR_AGENT_MODE),excluded)'));
assert.ok(physicalProduct.includes('ro.rockstaros.release_flash_allowed=false'));
const operatorOverlayable = read('android/operator-agent/src/main/res/values/overlayable.xml');
assert.ok(operatorOverlayable.includes('<overlayable name="OperatorAgentConfig">'));
assert.ok(operatorOverlayable.includes('<policy type="product">'));
assert.ok(read('scripts/build-local-ai-apk.sh').includes('prepare-local-ai-runtime.py'));
assert.ok(read('scripts/build-local-ai-apk.sh').includes('app-release-unsigned.apk'));
const localAiWorkflow = read('.github/workflows/local-ai-apk.yml');
assert.ok(localAiWorkflow.includes("'ndk;27.1.12297006'"));
assert.ok(localAiWorkflow.includes('stage-local-ai-apk.py inspect'));
assert.ok(localAiWorkflow.includes('This job emits an unsigned inspection artifact only'));
assert.ok(read('scripts/prepare-local-ai-runtime.py').includes('git", "apply", "--check"'));
const localAiOverlay = read('os/physical/local-ai-overlay.patch');
assert.ok(localAiOverlay.includes('class RockLocalAiService : HeadlessJsTaskService()'));
assert.ok(localAiOverlay.includes('AppRegistry.registerHeadlessTask'));
assert.ok(localAiOverlay.includes('PROPOSAL_MISMATCH'));
assert.ok(localAiOverlay.includes('PROPOSAL_EXPIRED'));
const localAiPlanOverlay = read('os/physical/local-ai-plan-v2.patch');
assert.ok(localAiPlanOverlay.includes("response_format: responseFormat"));
assert.ok(localAiPlanOverlay.includes("result.tool_calls"));
assert.ok(localAiPlanOverlay.includes("article-preparation@1/input-v1"));
assert.ok(localAiPlanOverlay.includes("strictPlanText"));
assert.ok(read('os/physical/rockstaros.mk').includes('vendor/rockstaros-local-ai/product.mk'));
for (const moduleName of ['automation', 'shell', 'article-tool', 'tool-sdk']) {
  const aosp = read(`android/${moduleName}/src/aosp/AndroidManifest.xml`);
  const standard = read(`android/${moduleName}/src/main/AndroidManifest.xml`);
  assert.ok(aosp.includes('package="dev.rock.'));
  if (moduleName !== 'tool-sdk') assert.ok(aosp.includes('android:versionCode="1"'));
  const normalized = aosp.replace(/ (?:package|android:versionCode|android:versionName)="[^"]*"/g, '');
  assert.equal(normalized, standard, `${moduleName}: Soong/Gradle manifest drift`);
}
const shellApiAosp = read('android/shell-api/src/aosp/AndroidManifest.xml');
const shellApiStandard = read('android/shell-api/src/main/AndroidManifest.xml');
assert.equal(shellApiAosp.replace(/ package="[^"]*"/g, ''), shellApiStandard, 'shell-api: Soong/Gradle manifest drift');
const localAiAosp = read('android/local-ai-api/src/aosp/AndroidManifest.xml');
const localAiStandard = read('android/local-ai-api/src/main/AndroidManifest.xml');
assert.equal(localAiAosp.replace(/ package="[^"]*"/g, ''), localAiStandard, 'local-ai-api: Soong/Gradle manifest drift');
for (const name of ['android/tool-sdk/src/main/aidl/dev/rock/sdk/ITool.aidl', 'android/local-ai-api/src/main/aidl/dev/rock/localai/ILocalAiService.aidl', 'android/core/src/main/resources/schema.sql']) assert.ok(existsSync(new URL(`../${name}`, import.meta.url)));
console.log('OS source/contract consistency passed. This is not an Android sandbox or OS boot test.');
