const fail = (message) => {
  throw new Error(`android-architecture: ${message}`);
};

const equal = (actual, expected, message) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(message);
};

const includesAll = (source, values, message) => {
  for (const value of values) if (!source.includes(value)) fail(`${message}: ${value}`);
};

export function validateAndroidReleaseArchitecture({
  policy,
  platform,
  localAi,
  emergency,
  backup,
  firstFlash,
  androidAudit,
  readiness,
  sepolicy,
  seapp,
  automationManifest,
  shellManifest,
  shellSource,
  shellService,
  platformService,
}) {
  if (policy?.schema !== 'avocadoos-android-release-architecture/1') fail('schemaが違います');
  if (
    policy.product?.displayName !== 'avocadoOS' ||
    policy.product?.internalNamespace !== 'dev.rock' ||
    policy.product?.internalNamespaceMutable !== false ||
    policy.product?.publicVersionIndependentFromPackageIdentity !== true
  ) fail('製品名、固定namespace、公開versionの境界が違います');
  if (
    policy.target?.firstDevice !== 'Google Pixel 10' ||
    policy.target?.codename !== 'frankel' ||
    policy.target?.sku !== 'GL066' ||
    policy.target?.architecture !== 'shared_os_core_plus_exact_device_support_package'
  ) fail('最初の正確な端末または共通Core/DSP境界が違います');

  equal(
    policy.releaseDecisions?.map(({ id }) => id),
    [
      'exact-device-and-sku',
      'bsp-vendor-and-partitions',
      'bootloader-recovery-and-stock-restore',
      'ota-and-rollback',
      'selinux-enforcing-isolation',
      'keystore-loss-backup-restore',
      'device-acceptance',
    ],
    '7つのrelease decisionが揃っていません',
  );

  const expectedComponents = {
    shell: ['dev.rock.shell', 'rock_shell_app'],
    platformBroker: ['dev.rock.automation', 'rockstar_platform_app'],
    localAi: ['com.localactionassistant', 'rock_local_ai_app'],
    firstPartyTool: ['dev.rock.tools.article', 'rock_tool_app'],
    mcp: ['exact_package_required_per_connector', 'rock_mcp_app'],
    provider: ['exact_package_required_per_provider', 'rock_provider_app'],
    operatorAgent: ['dev.rock.operator.agent', 'rock_operator_agent'],
  };
  for (const [id, [packageName, domain]] of Object.entries(expectedComponents)) {
    if (
      policy.components?.[id]?.package !== packageName ||
      policy.components?.[id]?.selinuxDomain !== domain
    ) fail(`${id}のpackage/domainが違います`);
  }
  if (
    policy.components?.shell?.internet !== 'none_direct_use_mcp_or_provider_through_broker' ||
    policy.components?.shell?.binderPermission !== 'dev.rock.permission.USE_SHELL_API' ||
    policy.components?.shell?.platformManagementPermission !== false ||
    policy.components?.platformBroker?.internet !== 'none' ||
    policy.components?.localAi?.internet !== 'none' ||
    policy.components?.firstPartyTool?.internet !== 'none'
  ) fail('UI、Broker、Local AI、Toolの直接network禁止が崩れています');
  if (
    policy.components?.shell?.currentState !== 'implemented_as_separate_unprivileged_apk_broker_only_access' ||
    policy.components?.platformBroker?.currentState !== 'implemented_as_separate_broker_apk_with_non_exported_trusted_approval_activity'
  ) fail('Shell/Broker分離の実装状態が違います');
  if (
    policy.components?.operatorDock?.deployment !== 'separate_cloudflare_worker_and_d1' ||
    policy.components?.operatorDock?.includedInUserOs !== false ||
    policy.components?.operatorDock?.visibleInUserLauncher !== false
  ) fail('Operator Dockは利用者OSの外に分離する必要があります');

  const expectedEdges = [
    'rock_shell_app->rockstar_platform_app',
    'rockstar_platform_app->rock_shell_app',
    'rockstar_platform_app->rock_local_ai_app',
    'rock_local_ai_app->rockstar_platform_app',
    'rockstar_platform_app->rock_tool_app',
    'rock_tool_app->rockstar_platform_app',
    'rockstar_platform_app->rock_mcp_app',
    'rock_mcp_app->rockstar_platform_app',
    'rockstar_platform_app->rock_provider_app',
    'rock_provider_app->rockstar_platform_app',
  ];
  equal(policy.allowedBinderEdges, expectedEdges, '許可Binder graphが違います');
  includesAll(policy.forbidden || [], [
    'runtime-registration-grants-selinux-domain',
    'direct-cross-component-data-file-access',
    'local-ai-direct-tool-mcp-provider-or-wallet-access',
    'operator-agent-platform-database-or-private-content-access',
    'arbitrary-shell-or-root-shell',
    'universal-operator-backup-recovery-key',
    'operator-access-to-release-signing-keys',
    'operator-dock-in-user-os-or-launcher',
  ], '禁止境界が不足しています');

  const acceptance = policy.acceptance || {};
  if (
    acceptance.samePhysicalDeviceAndBuildFingerprintRequired !== true ||
    acceptance.selinux?.buildUserVariant !== true ||
    acceptance.selinux?.getenforce !== 'Enforcing' ||
    acceptance.selinux?.permissiveDomainsAllowed !== false ||
    acceptance.selinux?.upstreamNeverallowMayBeWeakened !== false ||
    acceptance.selinux?.negativeCrossDomainTestsRequired !== true
  ) fail('SELinux final-build受入条件が不足しています');
  if (
    acceptance.compatibility?.androidRelease !== '17' ||
    acceptance.compatibility?.cddExactVersionRequired !== true ||
    acceptance.compatibility?.ctsRequired !== true ||
    acceptance.compatibility?.ctsVerifierApplicableTestsRequired !== true ||
    acceptance.compatibility?.vtsRequired !== true ||
    acceptance.compatibility?.vtsHalRequired !== true ||
    acceptance.compatibility?.vtsKernelRequired !== true ||
    acceptance.compatibility?.manualSuppressionOfApplicableFailuresAllowed !== false ||
    acceptance.compatibility?.gmsOrGtsRequiredForAospWithoutGms !== false
  ) fail('CDD/CTS/CTS Verifier/VTS受入条件が不足しています');

  const completion = policy.completion || {};
  if (
    completion.specificationAligned !== true ||
    completion.sourceAligned !== false ||
    completion.runtimeAligned !== false ||
    completion.fullBuildVerified !== false ||
    completion.physicalAcceptancePassed !== false
  ) fail('未実装を完了扱いにできません');
  includesAll(completion.blockers || [], [
    'complete-physical-keystore-loss-wipe-restore-drill',
    'implement-and-isolate-operator-agent',
    'integrate-local-ai-domain-into-final-image',
    'build-user-image-and-prove-selinux-enforcing-isolation',
    'run-cdd-cts-cts-verifier-vts-hal-and-kernel-on-the-same-final-build',
    'complete-first-flash-gate-four-of-four',
  ], '実装blockerが不足しています');

  if (
    platform.isolation?.currentLayout !== 'dev.rock.shell_ui_separate_from_dev.rock.automation_broker' ||
    platform.isolation?.targetLayout !== 'dev.rock.shell_ui_separate_from_dev.rock.automation_headless_broker' ||
    platform.isolation?.targetPolicy !== 'data/android-release-architecture-policy.json' ||
    platform.isolation?.targetStateImplemented !== true ||
    platform.isolation?.shellBinderPermission !== 'dev.rock.permission.USE_SHELL_API' ||
    platform.isolation?.shellMayRequestManagementPermission !== false ||
    platform.isolation?.runtimeRegistrationCanGrantDomain !== false
  ) fail('Platform APIの現在地と分離先がpolicyと一致しません');
  if (automationManifest.includes('<activity android:name=".MainActivity"'))
    fail('Platform Broker APKへlauncher MainActivityを戻せません');
  includesAll(automationManifest, [
    '<permission android:name="dev.rock.permission.USE_SHELL_API" android:protectionLevel="signature" />',
    '<service android:name=".RockShellService" android:exported="true" android:permission="dev.rock.permission.USE_SHELL_API" />',
    '<service android:name=".RockPlatformService" android:exported="true" android:permission="dev.rock.permission.MANAGE_PLATFORM" />',
  ], 'BrokerのShell専用permissionまたはPlatform管理permissionが違います');
  if (
    !shellManifest.includes('<activity android:name=".MainActivity"') ||
    !shellManifest.includes('dev.rock.permission.USE_SHELL_API') ||
    shellManifest.includes('dev.rock.permission.MANAGE_PLATFORM') ||
    shellManifest.includes('android.permission.INTERNET')
  ) fail('Shell APKのlauncher、Broker permission、offline境界が違います');
  if (
    shellSource.includes('dev.rock.core') ||
    shellSource.includes('AndroidDatabase') ||
    shellSource.includes('RockApplication') ||
    !shellSource.includes('ShellConnection')
  ) fail('Shell UIがBrokerを迂回してCoreまたはdatabaseへ直接接続しています');
  includesAll(shellService, [
    'SHELL_PACKAGE = "dev.rock.shell"',
    'MAX_SNAPSHOT_WORKS = 25',
    'getPackagesForUid(uid)',
    'checkSignatures(getPackageName(), SHELL_PACKAGE)',
    'ArticlePayload.parse(inputJson)',
    'Engine.bounded(result)',
  ], 'Shell Broker APIのexact package/signer/schema/bounds検査が不足しています');
  includesAll(platformService, [
    'new RecoverableBackupManager(this).createBytes(owner)',
    '".arb"',
  ], 'Platform serviceのbackup v2経路が不足しています');
  includesAll(shellService, [
    'beginRecoverySetup()',
    'confirmRecoverySetup(',
    'createRecoverableBackup(',
    'restoreRecoverableBackup(',
    'RecoveryPhrase.encode(',
  ], 'Shell API v4のowner recovery経路が不足しています');
  if (
    backup.envelope?.format !== platform.storage?.recoverableBackupFormat ||
    backup.implementation?.ownerPhraseCodecAndConfirmationUi !==
      'implemented_shell_api_v4_emulator_pass' ||
    backup.implementation?.platformImportAndTransactionalRestore !==
      'implemented_android_sqlite_emulator_pass' ||
    backup.implementation?.newDeviceKeystoreRebinding !==
      'implemented_android_keystore_emulator_pass' ||
    backup.implementation?.physicalWipeAndRestoreDrill !== 'pending'
  ) fail('backup v2のsource/emulator合格と物理未完了境界が一致しません');
  if (
    firstFlash.policy?.backupRecoveryPolicy !== 'data/android-backup-recovery-policy.json' ||
    firstFlash.passed !== false
  ) fail('first-flash gateとbackup policyの結合が違います');
  if (
    localAi.androidPackage !== policy.components.localAi.package ||
    localAi.trustedCallerPackage !== policy.components.platformBroker.package ||
    localAi.releaseNetwork !== 'none' ||
    localAi.imageStatus !== 'not_built'
  ) fail('Local AIのpackage、Broker、offline、image状態が一致しません');
  if (
    emergency.implementation?.includedInUserOs !== false ||
    emergency.implementation?.androidServiceImplemented !== false ||
    emergency.forbiddenCapabilities?.includes('root_shell') !== true ||
    emergency.forbiddenCapabilities?.includes('read_private_user_content') !== true
  ) fail('Operator Dock/Agentの分離または未実装境界が違います');

  includesAll(seapp, [
    'name=dev.rock.automation domain=rockstar_platform_app',
    'name=dev.rock.shell domain=rock_shell_app',
    'name=com.localactionassistant domain=rock_local_ai_app',
    'name=dev.rock.tools.article domain=rock_tool_app',
    'name=dev.rock.operator.agent domain=rock_operator_agent',
  ], 'build-time package/domain mappingが不足しています');
  includesAll(sepolicy, [
    'type rock_shell_app, domain;',
    'type rock_local_ai_app, domain;',
    'type rock_operator_agent, domain;',
    'binder_call(rock_shell_app, rockstar_platform_app)',
    'binder_call(rockstar_platform_app, rock_local_ai_app)',
    'neverallow rock_local_ai_app { rock_tool_app rock_mcp_app rock_provider_app rock_operator_agent }:binder call;',
    'neverallow rock_operator_agent { rockstar_platform_app rock_shell_app rock_local_ai_app rock_tool_app rock_mcp_app rock_provider_app }:binder call;',
  ], 'SELinux source policyが選択graphと一致しません');
  if (/binder_call\(rock_operator_agent,/.test(sepolicy)) fail('Operator Agentをproduct data planeへBinder接続できません');

  if (
    androidAudit.architecturePolicy !== 'data/android-release-architecture-policy.json' ||
    androidAudit.claims?.selinuxIsolationVerified !== false ||
    androidAudit.isolation?.policy !== 'data/android-release-architecture-policy.json'
  ) fail('Android物理監査がarchitecture policyを参照していません');
  const selinuxGate = androidAudit.requirements?.find(({ id }) => id === 'selinux-enforcing-isolation');
  const compatibilityGate = androidAudit.requirements?.find(({ id }) => id === 'android-cdd-cts-vts');
  equal(
    selinuxGate?.requiredEvidence,
    ['sepolicy-build', 'upstream-neverallow', 'enforcing-readback', 'domain-map', 'negative-isolation-tests', 'avc-audit'],
    'Android物理監査のSELinux証拠roleが不足しています',
  );
  equal(
    compatibilityGate?.requiredEvidence,
    ['cdd-version', 'cts-revision', 'cts-result', 'cts-verifier-result', 'vts-revision', 'vts-result', 'vts-hal-result', 'vts-kernel-result'],
    'Android物理監査のCDD/CTS/VTS証拠roleが不足しています',
  );
  for (const field of ['vtsRevision', 'vtsPackageSha256', 'vtsResultSha256', 'vtsHalResultSha256', 'vtsKernelResultSha256']) {
    if (!Object.hasOwn(androidAudit.compatibility || {}, field)) fail(`VTS監査fieldがありません: ${field}`);
  }
  if (readiness.policy?.androidReleaseArchitecture !== 'data/android-release-architecture-policy.json') {
    fail('公開準備台帳からarchitecture policyへの参照がありません');
  }
  const releaseTarget = readiness.targets?.find(({ id }) => id === 'android-physical-preview');
  if (
    releaseTarget?.gates?.find(({ id }) => id === 'selinux-enforcing-isolation')?.status !== 'blocked' ||
    releaseTarget?.gates?.find(({ id }) => id === 'android-cdd-cts-vts')?.status !== 'blocked'
  ) fail('公開準備台帳が未実証のSELinuxまたはCDD/CTS/VTSを合格扱いしています');

  return {
    decisionCount: policy.releaseDecisions.length,
    componentCount: Object.keys(policy.components).length,
    specificationAligned: true,
    sourceAligned: false,
    runtimeAligned: false,
    physicalAcceptancePassed: false,
  };
}
