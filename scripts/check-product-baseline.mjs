import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname, isAbsolute, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export function validateBaseline(
  data,
  read = (path) => readFileSync(path, 'utf8'),
) {
  const requireValue = (ok, message) => {
    if (!ok) throw new Error(`product-baseline: ${message}`);
  };
  requireValue(data.repository === 'k999ln/rock', '製品正本が違います');
  requireValue(/^\d+\.\d+$/.test(data.version), '版が必要です');
  requireValue(/^\d{4}-\d{2}-\d{2}$/.test(data.decidedAt), '決定日が必要です');
  const documents = {};
  for (const key of [
    'authority',
    'promptRules',
    'audit',
    'nextPrompt',
    'acceptanceTemplate',
    'designReview',
    'alignmentAudit',
  ]) {
    const path = data[key];
    requireValue(
      typeof path === 'string' && !isAbsolute(path),
      `${key}: 相対pathが必要です`,
    );
    const resolved = resolve(root, path);
    requireValue(
      !relative(root, resolved).startsWith('..'),
      `${key}: repository外の参照です`,
    );
    documents[key] = read(resolved);
    requireValue(documents[key].length > 100, `${key}: 本文がありません`);
  }
  const expected = Array.from(
    { length: 42 },
    (_, i) => `RQ${String(i + 1).padStart(2, '0')}`,
  );
  requireValue(
    JSON.stringify(data.requirements) === JSON.stringify(expected),
    '確定要望RQ01〜RQ42の順序/欠落/重複を確認してください',
  );
  for (const id of expected) {
    requireValue(
      documents.authority.split(`## ${id} `).length === 2,
      `${id}: 正本の見出しが一意ではありません`,
    );
  }
  requireValue(
    data.auditInputs?.isLiveStatus === false,
    '監査snapshotを最新状態にしないでください',
  );
  for (const field of ['main', 'nativeHead', 'designHead']) {
    requireValue(
      /^[a-f0-9]{40}$/.test(data.auditInputs[field]),
      `${field}: 40桁SHAが必要です`,
    );
    requireValue(
      documents.audit.includes(data.auditInputs[field]),
      `${field}: 監査本文とSHAが一致しません`,
    );
    requireValue(
      documents.nextPrompt.includes(data.auditInputs[field]),
      `${field}: プロンプトの起点SHAがありません`,
    );
  }
  requireValue(
    data.supplyRoleExclusivity === 'unspecified',
    'tobの供給元/独占性は未確定です',
  );
  requireValue(
    data.sky?.displayName === 'Sky',
    '自動化の利用者向け名称はSkyです',
  );
  requireValue(
    data.sky?.legacyInternalName === 'hub',
    '既存データ/API用の内部hub互換名が必要です',
  );
  requireValue(
    data.primaryCapabilities?.includes('sky-automation-control'),
    'Skyの制御能力が必要です',
  );
  requireValue(
    data.primaryCapabilities?.includes('goal-driven-brand-operations'),
    '目標駆動のブランド運営能力が必要です',
  );
  requireValue(
    data.primaryCapabilities?.includes('local-offline-ai-runtime') &&
      data.localAiRuntime?.status ===
        'client_and_server_source_implemented_native_not_built' &&
      data.localAiRuntime?.sourceCommit ===
        '99b1c40d76f719cbba9c72d9f481c1b2df245504' &&
      data.localAiRuntime?.engine === 'llama.rn' &&
      data.localAiRuntime?.engineVersion === '0.12.9' &&
      data.localAiRuntime?.modelFormat === 'GGUF' &&
      data.localAiRuntime?.modelBundled === false &&
      data.localAiRuntime?.releaseNetwork === 'none' &&
      data.localAiRuntime?.trustMode === 'fixed_package_same_signer' &&
      data.localAiRuntime?.mutationConfirmation === 'required_separate_call' &&
      data.localAiRuntime?.apkBuilt === false &&
      data.localAiRuntime?.soongBuilt === false &&
      data.localAiRuntime?.imageBuilt === false &&
      data.localAiRuntime?.deviceInferenceVerified === false,
    'ローカルLLMの固定source・オフライン・署名・別確認・未build境界を維持してください',
  );
  for (const field of ['sourceLock', 'artifactLock', 'contract', 'record']) {
    const path = data.localAiRuntime?.[field];
    requireValue(
      typeof path === 'string' && existsSync(resolve(root, path)),
      `localAiRuntime.${field}: repository内の証拠が必要です`,
    );
  }
  requireValue(
    data.primaryCapabilities?.includes('os-platform-core') &&
      data.androidPlatformCore?.status ===
        'source_implemented_native_and_sepolicy_build_not_run' &&
      data.androidPlatformCore?.apiVersion === 1 &&
      JSON.stringify(data.androidPlatformCore?.componentKinds) ===
        JSON.stringify(['TOOL', 'MCP', 'PROVIDER']) &&
      data.androidPlatformCore?.identityVerification ===
        'installed_apk_uid_version_and_signer' &&
      data.androidPlatformCore?.runtimeSelinuxGrant === false &&
      data.androidPlatformCore?.approval ===
        'proposal_then_device_credential_then_single_use' &&
      data.androidPlatformCore?.ledger ===
        'append_only_owner_scoped_idempotent_receipts' &&
      data.androidPlatformCore?.backup ===
        'aes_256_gcm_android_keystore_owner_scoped' &&
      data.androidPlatformCore?.schemaVersion === 2 &&
      data.androidPlatformCore?.migration === 'transactional_fail_closed' &&
      data.androidPlatformCore?.androidBuilt === false &&
      data.androidPlatformCore?.aospImageBuilt === false &&
      data.androidPlatformCore?.selinuxEnforcingVerified === false &&
      data.androidPlatformCore?.productionSigningVerified === false &&
      data.androidPlatformCore?.otaRollbackVerified === false,
    'OS Platform Coreの署名・UID・承認・台帳・暗号化・未build境界を維持してください',
  );
  for (const field of ['contract', 'record']) {
    const path = data.androidPlatformCore?.[field];
    requireValue(
      typeof path === 'string' && existsSync(resolve(root, path)),
      `androidPlatformCore.${field}: repository内の証拠が必要です`,
    );
  }
  requireValue(
    data.primaryCapabilities?.includes('csv-paid-work-pilot') &&
      data.csvBusinessPilot?.productId === 'rockstar-csv-cleanup' &&
      data.csvBusinessPilot?.buyerPriceMinor === 300000 &&
      data.csvBusinessPilot?.retentionDays === 7 &&
      data.csvBusinessPilot?.monthlyThresholdUsdMinor === 3000 &&
      data.csvBusinessPilot?.monthlyFeeUsdMinor === 888 &&
      data.csvBusinessPilot?.periodTimezone === 'Asia/Tokyo' &&
      data.csvBusinessPilot?.manualPaymentCountsAsVerifiedRevenue === false &&
      data.csvBusinessPilot?.liveBillingEnabled === false &&
      data.csvBusinessPilot?.externalMarketplaceAutomationEnabled === false,
    'CSV販売実証の価格・保管・月額境界・外部作用gateを維持してください',
  );
  requireValue(
    data.primaryCapabilities?.includes('sky-tool-developer-platform') &&
      data.skyToolDeveloperPlatform?.status ===
        'developer_preview_registered_and_declared_publication' &&
      data.skyToolDeveloperPlatform?.packageSchema === 'sky-tool-package/1' &&
      data.skyToolDeveloperPlatform?.frontend ===
        'copy_sdk_code_into_existing_tool' &&
      data.skyToolDeveloperPlatform?.rawCodeUploaded === false &&
      data.skyToolDeveloperPlatform?.automaticPackageGeneration === true &&
      data.skyToolDeveloperPlatform?.mcpDiscoveryAndCallImplemented === true &&
      data.skyToolDeveloperPlatform?.anonymousUsageFieldsOnly === true &&
      data.skyToolDeveloperPlatform?.declaredPublicationInstallable === false &&
      data.skyToolDeveloperPlatform?.verifiedPublicationImplemented === false &&
      data.skyToolDeveloperPlatform?.productionSandboxImplemented === false,
    'Sky Tool StudioのSDKコード組込みと宣言公開/検証済み公開の境界を維持してください',
  );
  requireValue(
    data.fashionBrandOperations?.externalEffectsExecutedByAutopilot === false,
    'Autopilotが外部作用を直接実行してはいけません',
  );
  const skyInventory = resolve(root, data.sky?.inventory || '');
  requireValue(
    !relative(root, skyInventory).startsWith('..') &&
      read(skyInventory).includes('Web / PCで現在使える11件'),
    'Skyの役割と収録ツールの正本が必要です',
  );
  requireValue(data.atmFees?.rockFeeMinor === 0, 'ATMの自社手数料は0です');
  requireValue(
    data.gameExchange?.atmDependency === false,
    'ゲーム交換をATM必須にしないでください',
  );
  requireValue(
    data.marketExploration?.appShellAuthorized === true &&
      data.marketExploration?.paperRuntimeAuthorized === true &&
      data.marketExploration?.liveRuntimeAuthorized === false &&
      data.marketExploration?.realValueEnabled === false,
    '汎用市場はPAPER runtimeのみ承認され、外部接続・実資金は無効です',
  );
  requireValue(
    data.autonomousFundRuntime?.refreshIntervalSeconds === 30 &&
      data.autonomousFundRuntime?.unverifiedYield === null &&
      data.autonomousFundRuntime?.automaticCapitalMovement === false &&
      data.autonomousFundRuntime?.realFundsEnabled === false,
    '自律型ファンドは実績再計算と提案までに限定してください',
  );
  requireValue(
    data.externalFinancialProviderBoundary?.status ===
      'approved_design_provider_adapters_not_connected' &&
      data.externalFinancialProviderBoundary?.osRole ===
        'capability_discovery_consent_instruction_status_receipt_reconciliation' &&
      data.externalFinancialProviderBoundary?.integrationModel ===
        'versioned_capability_manifest_and_provider_adapter' &&
      data.externalFinancialProviderBoundary?.unsupportedCapabilityEmulation ===
        false &&
      data.externalFinancialProviderBoundary
        ?.osRebuildRequiredForProviderAddition === false &&
      data.externalFinancialProviderBoundary?.providerDirectLedgerWrite ===
        false &&
      data.externalFinancialProviderBoundary?.providerArbitraryShell ===
        false &&
      data.externalFinancialProviderBoundary?.liveProvidersConnected ===
        false &&
      data.externalFinancialProviderBoundary?.realFundsEnabled === false,
    'Wallet／ファンドは外部Providerの受け身設計とし、Rockが保管・運用主体を兼ねないでください',
  );
  requireValue(
    data.firstPartySettlementProvider?.providerId ===
      'org.rockstar.settlement-wallet' &&
      data.firstPartySettlementProvider?.ownership === 'rock_first_party' &&
      data.firstPartySettlementProvider?.purpose ===
        'collect_verified_allocated_sky_fee_only' &&
      data.firstPartySettlementProvider?.mode === 'SANDBOX' &&
      data.firstPartySettlementProvider?.status ===
        'contract_fixture_verified' &&
      JSON.stringify(data.firstPartySettlementProvider?.capabilities) ===
        JSON.stringify(['collect_platform_fee', 'reporting']) &&
      data.firstPartySettlementProvider?.monthlyFeeCapMinor === 888 &&
      data.firstPartySettlementProvider?.userFundsCustodied === false &&
      data.firstPartySettlementProvider?.fundManagementEnabled === false &&
      data.firstPartySettlementProvider?.arbitraryReceiveOrPayoutEnabled ===
        false &&
      data.firstPartySettlementProvider?.liveCollectionEnabled === false &&
      data.firstPartySettlementProvider?.realFundsEnabled === false &&
      data.firstPartySettlementProvider?.usesCommonProviderAdapter === true,
    'Rock Settlement Walletは確定済み自社利用料のsandbox回収だけに限定してください',
  );
  requireValue(
    data.productionReceiveRail?.status ===
      'deployed_owner_private_pending_signature' &&
      data.productionReceiveRail?.network === 'base' &&
      data.productionReceiveRail?.chainId === 8453 &&
      data.productionReceiveRail?.assetSymbol === 'USDC' &&
      data.productionReceiveRail?.assetContract ===
        '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' &&
      data.productionReceiveRail?.assetDecimals === 6 &&
      data.productionReceiveRail?.walletConnection === 'eip1193_injected' &&
      data.productionReceiveRail?.privateKeysStored === false &&
      data.productionReceiveRail?.userFundsCustodied === false &&
      data.productionReceiveRail?.automaticTransferEnabled === false &&
      data.productionReceiveRail?.collectionSource ===
        'signed_earning_receipt_sky_service_fee_only' &&
      data.productionReceiveRail?.monthlyFeeCapMinor === 888 &&
      data.productionReceiveRail?.exactRecipientAndAmountRequired === true &&
      data.productionReceiveRail?.finalizedBlockRequired === true &&
      data.productionReceiveRail
        ?.operatorClaimRequiresPrivateSiteOwnerAccess === true &&
      data.productionReceiveRail?.ownerWalletRegistration ===
        'pending_user_signature' &&
      data.productionReceiveRail?.firstLiveTransfer === 'not_performed',
    '本番受取レールはBase USDCの所有確認・限定回収・finalized照合とし、秘密鍵保管・自動送金・完了の先取りを禁止してください',
  );
  requireValue(
    data.chatInteraction?.connectedMcpPresentation ===
      'one_bot_per_connected_server_or_ready_product' &&
      data.chatInteraction?.controlSurface === 'chat_thread' &&
      data.chatInteraction?.genericExecutionContract ===
        'passport_tool_schema_then_prepare_confirm_execute',
    'Chatの接続bot管理契約が必要です',
  );
  requireValue(
    data.webDeliveryIntegrity?.sourceAndPrivateSiteCommitMustMatch === true &&
      data.webDeliveryIntegrity?.assetClosureCheck ===
        'npm run release:web-assets:check' &&
      data.webDeliveryIntegrity?.publicAccessAuthorized === false,
    'Web画面と配備assetを同一commitへ固定してください',
  );
  requireValue(
    data.homeExperience?.defaultRoute === '/' &&
      data.homeExperience?.skyRoute === '/sky' &&
      data.homeExperience?.systemUtility === 'settings' &&
      data.homeExperience?.preferencesStorage === 'device_local' &&
      data.homeExperience?.customizable?.includes('app_order') &&
      data.homeExperience?.settingsFunctions?.includes('pc_connector') &&
      data.homeExperience?.settingsFunctions?.includes(
        'install_recovery_guidance',
      ),
    'ホームと設定アプリの入口・端末内設定・運用機能を維持してください',
  );
  requireValue(
    data.homeExperience.returnPolicy ===
      'every_non_home_route_has_a_direct_home_affordance',
    'Home以外の全画面に直接Homeへ戻る契約が必要です',
  );
  const launchPageSource = read(resolve(root, 'app/rockstaros/page.tsx'));
  requireValue(
    data.launchPage?.route === '/rockstaros' &&
      data.launchPage?.primaryAction === 'install_os' &&
      data.launchPage?.publicDownloadFallback ===
        '/rockstaros/guide#install' &&
      data.launchPage?.studioUrl ===
        'https://rockstaros-kaiya.noellesugar1.chatgpt.site/studio' &&
      launchPageSource.includes('OSをインストール') &&
      launchPageSource.includes(data.launchPage.studioUrl) &&
      launchPageSource.includes('createSkyToolApp'),
    'Developer Preview紹介のインストール・Sky開発者コード・Studio導線を維持してください',
  );
  const studioSource = read(resolve(root, 'components/rock-studio.tsx'));
  const homeSource = read(resolve(root, 'components/home-screen.tsx'));
  const shellSource = read(resolve(root, 'components/workspace-shell.tsx'));
  const workspaceStyles = read(resolve(root, 'app/workspace.css'));
  requireValue(
    data.visualSystem?.surfaces?.includes('/') &&
    data.visualSystem?.surfaces?.includes('/rockstaros') &&
      data.visualSystem?.surfaces?.includes('/studio') &&
      data.visualSystem?.surfaces?.includes('workspace_shell') &&
      data.visualSystem?.accent === 'acid_green' &&
      data.visualSystem?.studioPrimarySurface === 'sdk_code_installation' &&
      data.visualSystem?.homePrimaryApps?.includes('work') &&
      data.visualSystem?.homePrimaryApps?.includes('csv') &&
      data.visualSystem?.businessFunctionalityChanged === false &&
      data.visualSystem?.interactionFunctionalityImproved === true &&
      studioSource.includes('studio-code-first') &&
      homeSource.includes("id: 'work'") &&
      homeSource.includes("id: 'csv'") &&
      homeSource.includes('WEB / LOCAL') &&
      shellSource.includes('function isCurrentRoute') &&
      shellSource.includes('aria-disabled={running || undefined}') &&
      workspaceStyles.includes('RockstarOS / Studio — shared dark launch system') &&
      workspaceStyles.includes('RockstarOS 1.0 — unified OS chrome') &&
      workspaceStyles.includes('--studio-green: #c8ff2e'),
    'RockstarOS全体の共通visual systemとフロント機能性改善を維持してください',
  );
  requireValue(
    data.systemMaintenance?.route === '/settings/system' &&
      data.systemMaintenance?.runtime === 'web_pwa_device_local' &&
      data.systemMaintenance?.diagnostics?.includes('rockstar_api') &&
      data.systemMaintenance?.diagnostics?.includes('pc_connector') &&
      data.systemMaintenance?.diagnostics?.includes('secure_context') &&
      data.systemMaintenance?.diagnostics?.includes('notifications') &&
      data.systemMaintenance?.diagnostics?.includes('persistent_storage') &&
      data.systemMaintenance?.backup?.format === 'rockstaros-device-backup/1' &&
      data.systemMaintenance?.backup?.cipher === 'AES-GCM-256' &&
      data.systemMaintenance?.backup?.kdf === 'PBKDF2-SHA256' &&
      data.systemMaintenance?.backup?.iterations === 310000 &&
      data.systemMaintenance?.backup?.scope ===
        'allowlisted_rockstaros_home_preferences_only' &&
      data.systemMaintenance?.backup?.tamperDetection === true &&
      data.systemMaintenance?.backup?.excludes?.includes(
        'device_session_token',
      ) &&
      data.systemMaintenance?.operations?.notificationPermission ===
        'explicit_user_request_and_test_only' &&
      data.systemMaintenance?.operations?.diagnosticExport ===
        'sanitized_no_identity_token_wallet_personal_number_or_content' &&
      data.systemMaintenance?.operations?.deviceReset ===
        'confirmed_allowlisted_home_preferences_only' &&
      data.systemMaintenance?.releaseReadiness?.androidCompatibility ===
        'cdd_cts_not_run' &&
      data.systemMaintenance?.releaseReadiness?.googleMobileServices ===
        'not_applied' &&
      data.systemMaintenance?.releaseReadiness?.personalNumberHandling ===
        'not_enabled_requires_separate_compliance_review' &&
      data.systemMaintenance?.releaseReadiness?.manifest ===
        'data/release-readiness.json' &&
      data.systemMaintenance?.releaseReadiness?.qemuAudit ===
        'data/qemu-release-audit.json' &&
      data.systemMaintenance?.releaseReadiness?.androidAudit ===
        'data/android-physical-release-audit.json' &&
      data.systemMaintenance?.releaseReadiness?.androidAuditStatus ===
        '0_of_5_required_gates_passed' &&
      data.systemMaintenance?.releaseReadiness?.personalNumberAudit ===
        'data/personal-number-release-audit.json' &&
      data.systemMaintenance?.releaseReadiness?.personalNumberAuditStatus ===
        '1_of_7_required_gates_passed_feature_disabled' &&
      data.systemMaintenance?.releaseReadiness?.automatedCheck ===
        'npm run release:check' &&
      data.systemMaintenance?.releaseReadiness?.sbom ===
        'web_current_rc2_and_historical_native_cyclonedx_1_6_generated_to_separate_ignored_files' &&
      data.systemMaintenance?.releaseReadiness?.qemuCandidateStatus ===
        '6_of_10_current_candidate_requirements_passed' &&
      data.systemMaintenance?.releaseReadiness?.currentNativeInventory ===
        'data/qemu-rc2-legal-info' &&
      data.systemMaintenance?.releaseReadiness?.signingMechanics
        ?.automatedCheck === 'npm run release:signing:check' &&
      data.systemMaintenance?.releaseReadiness?.signingMechanics
        ?.publicFixtureTests === 62 &&
      data.systemMaintenance?.releaseReadiness?.signingMechanics?.status ===
        'mechanics_verified_production_key_and_owner_approval_not_executed' &&
      data.systemMaintenance?.releaseReadiness
        ?.historicalNativeInventoryRule ===
        'never_substitute_9ab_inventory_for_rc2' &&
      data.systemMaintenance?.physicalDeviceStatus ===
        'blocked_until_exact_model_bsp_bootloader_recovery' &&
      data.systemMaintenance?.productionSigning ===
        'blocked_until_owner_key_ceremony',
    'OS運用・暗号化保全・公開審査gateを維持してください',
  );
  requireValue(
    data.skyNetworkEconomy?.tobSkyFeeMinor === 0,
    'tobのSky利用料は0です',
  );
  requireValue(
    data.skyNetworkEconomy?.tobSkySalesCommissionBps === 0,
    'tob売上のSky手数料は0%です',
  );
  requireValue(
    data.skyNetworkEconomy?.tocMonthlyFeeCapMinor === 888 &&
      data.skyNetworkEconomy?.tocUpfrontCharge === false &&
      data.skyNetworkEconomy?.debtCarryForward === false,
    'ToCは検証済み収益からだけ月最大888 centsを精算してください',
  );
  requireValue(
    data.skyMonthlyBilling?.status === 'retired' &&
      data.skyMonthlyBilling?.upfrontChargeEnabled === false &&
      data.skyEarningsSettlement?.monthlyFeeCapMinor === 888 &&
      data.skyEarningsSettlement?.zeroEarningsFeeMinor === 0 &&
      data.skyEarningsSettlement?.debtCarryForward === false &&
      data.skyEarningsSettlement?.tobFeeMinor === 0 &&
      data.skyEarningsSettlement?.liveCollectionEnabled === false &&
      data.skyEarningsSettlement?.livePayoutEnabled === false,
    '先払い月額を使わず、収益連動精算と本番資金gateを維持してください',
  );
  requireValue(
    data.mercariRevenueLoop?.catalogTool === 'mercari-revenue' &&
      data.mercariRevenueLoop?.consumerCredentialsCollected === false &&
      data.mercariRevenueLoop?.directSitesApiCall === false &&
      data.mercariRevenueLoop?.manualSalesAreVerified === false &&
      data.mercariRevenueLoop?.salesOrProfitGuaranteed === false,
    'メルカリ個人版の手動境界とProvider検証前の精算禁止を維持してください',
  );
  requireValue(
    data.skyNetworkEconomy?.liveMcpConnectionEnabled === false &&
      data.skyNetworkEconomy?.livePayoutEnabled === false,
    'Sky Networkの設計previewを実接続・実送金として扱わないでください',
  );
  requireValue(
    data.skyNetworkEconomy?.primarySurface === 'inside_sky' &&
      data.skyNetworkEconomy?.standaloneNavigation === false,
    'MCP接続・管理はSky本体の機能として表示してください',
  );
  requireValue(
    data.skyNetworkEconomy?.providerSubmissionSurface === 'inside_sky' &&
      data.skyNetworkEconomy?.persistentSidebarOnSky === false,
    'Sky機能はSky内へ集約し、Sky画面に常設sidebarを置かないでください',
  );
  requireValue(
    data.skyNetworkEconomy?.externalMcpConnectionEnabled === false &&
      data.skyNetworkEconomy?.localMcpConnection?.status ===
        'implemented_requires_user_pc' &&
      data.skyNetworkEconomy?.localMcpConnection?.toolCount === 4 &&
      data.skyNetworkEconomy?.localMcpConnection?.installSurface ===
        'inside_sky' &&
      data.skyNetworkEconomy?.localMcpConnection?.realSessionStateDisplayed ===
        true &&
      data.skyNetworkEconomy?.localMcpConnection?.syntheticUrlCheckRemoved ===
        true,
    '実在するローカルMCPの4機能とSky内導入画面を、未実装の外部MCP接続と区別してください',
  );
  requireValue(
    data.skyNetworkEconomy?.connectionTargets?.default === 'device_local' &&
      data.skyNetworkEconomy?.connectionTargets?.selectionSurface ===
        'inside_sky' &&
      data.skyNetworkEconomy?.connectionTargets?.deviceLocal === 'available' &&
      data.skyNetworkEconomy?.connectionTargets?.skyCloud === 'planned' &&
      data.skyNetworkEconomy?.connectionTargets?.providerMcp === 'planned' &&
      data.skyNetworkEconomy?.connectionTargets?.unavailableTargetsDisabled ===
        true &&
      data.skyNetworkEconomy?.connectionTargets?.externalOneTapEnabled ===
        false,
    'MCP接続先をSky内の3系統で区別し、未実装先を選択不能にしてください',
  );
  requireValue(
    data.skyNetworkEconomy?.multiMcpConnector?.status ===
      'local_package_and_sky_ui_verified' &&
      data.skyNetworkEconomy?.multiMcpConnector?.registryServers === 2 &&
      data.skyNetworkEconomy?.multiMcpConnector?.serverDiscoveryVerified ===
        true &&
      data.skyNetworkEconomy?.multiMcpConnector?.singleUseApprovalVerified ===
        true &&
      data.skyNetworkEconomy?.multiMcpConnector
        ?.streamableHttpAdapterImplemented === true &&
      data.skyNetworkEconomy?.multiMcpConnector?.remoteInteropVerified ===
        false &&
      data.skyNetworkEconomy?.multiMcpConnector?.distributionPackageBuilt ===
        true &&
      data.skyNetworkEconomy?.multiMcpConnector?.oauthEnabled === false &&
      data.skyNetworkEconomy?.multiMcpConnector?.skyUiConnected === true,
    '複数MCP Connectorの配布・Sky接続とremote/OAuth未受入の境界を維持してください',
  );
  requireValue(
    data.releaseInstallation?.releaseName === 'RockstarOS 1.0',
    '1.0の発表名が必要です',
  );
  for (const field of ['architecture', 'plan']) {
    const path = data.releaseInstallation[field];
    requireValue(
      typeof path === 'string' && !isAbsolute(path),
      `releaseInstallation.${field}: 相対pathが必要です`,
    );
    const resolved = resolve(root, path);
    requireValue(
      !relative(root, resolved).startsWith('..') && read(resolved).length > 100,
      `releaseInstallation.${field}: repository内の本文が必要です`,
    );
  }
  const devicePolicy = data.deviceSupportPolicy;
  requireValue(
    devicePolicy?.status === 'approved_design_implemented_not_physical_support',
    '多機種対応は設計済み・実機未対応として記録してください',
  );
  requireValue(
    JSON.stringify(devicePolicy?.deliveryModes) ===
      JSON.stringify([
        'native_os',
        'gsi_experimental',
        'client_only',
        'unsupported',
      ]),
    '多機種対応の4提供区分が必要です',
  );
  for (const field of ['architecture', 'matrix']) {
    const path = devicePolicy[field];
    requireValue(
      typeof path === 'string' && !isAbsolute(path),
      `deviceSupportPolicy.${field}: 相対pathが必要です`,
    );
    const resolved = resolve(root, path);
    requireValue(
      !relative(root, resolved).startsWith('..') && read(resolved).length > 100,
      `deviceSupportPolicy.${field}: repository内の本文が必要です`,
    );
  }
  requireValue(
    devicePolicy.validation === 'npm run device-support:check',
    '多機種対応台帳の検査commandが必要です',
  );
  requireValue(
    devicePolicy.firstPhysicalTarget === null,
    '最初の物理端末は未確定です',
  );
  requireValue(
    devicePolicy.cloudSpendApproved === false,
    'クラウド課金は未承認です',
  );
  requireValue(
    devicePolicy.physicalFlashAuthorized === false,
    '実機flashは未承認です',
  );
  for (const file of [
    'AGENTS.md',
    'README.md',
    'project.md',
    'docs/product.md',
    'docs/architecture.md',
    'docs/fund-and-mcp.md',
    'docs/os-development-design.md',
    'docs/os-prototype.md',
  ]) {
    requireValue(
      read(resolve(root, file)).includes('product-baseline.md'),
      `${file}: ベースへの入口がありません`,
    );
  }
  requireValue(
    read(resolve(root, 'AGENTS.md')).includes('prompt-playbook.md'),
    'AGENTSに作成規約がありません',
  );
  return data;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  validateBaseline(
    JSON.parse(
      readFileSync(resolve(root, 'data/product-baseline.json'), 'utf8'),
    ),
  );
  console.log(
    '製品ベース: RQ01〜RQ42、Android OS Platform Core、物理Android版ローカルLLM、RockstarOS全体の共通visual systemとフロント機能性、Developer Preview紹介とRock Studio、CSV整形、Rock First-party Settlement Walletのsandbox契約、Base USDC本番受取レール、秘密鍵非保管、所有署名、exact/finalized着金照合、外部Wallet／ファンドProvider受け身設計、汎用PAPER市場、自律型ファンド実績再計算、Chatの接続bot管理、組込み型Sky Tool SDK、Web画面/asset同一commit、メルカリ収益ループ、ホーム・設定utility、OS運用・暗号化保全・QEMU同一候補10gate/SBOM境界、検証済み収益から月最大888 cents、先払い/債務化なし、Sky内MCP、ローカルMCP4機能、共通MCP Connector、MCP接続先3系統、tob利用料/売上手数料0、owner署名/初回実transfer未完了、ATM手数料0、ATM独立、1.0構成、導入計画、受入雛形、入口、監査SHA、作成規約を確認（意味の一致と最新進捗は別途レビュー）',
  );
}
