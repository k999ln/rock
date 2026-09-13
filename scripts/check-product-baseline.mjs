import { readFileSync } from 'node:fs';
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
    { length: 31 },
    (_, i) => `RQ${String(i + 1).padStart(2, '0')}`,
  );
  requireValue(
    JSON.stringify(data.requirements) === JSON.stringify(expected),
    '確定要望RQ01〜RQ31の順序/欠落/重複を確認してください',
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
    data.fashionBrandOperations?.externalEffectsExecutedByAutopilot === false,
    'Autopilotが外部作用を直接実行してはいけません',
  );
  const skyInventory = resolve(root, data.sky?.inventory || '');
  requireValue(
    !relative(root, skyInventory).startsWith('..') &&
      read(skyInventory).includes('Web / PCで現在使える9件'),
    'Skyの役割と収録ツールの正本が必要です',
  );
  requireValue(data.atmFees?.rockFeeMinor === 0, 'ATMの自社手数料は0です');
  requireValue(
    data.gameExchange?.atmDependency === false,
    'ゲーム交換をATM必須にしないでください',
  );
  requireValue(
    data.marketExploration?.appShellAuthorized === true &&
      data.marketExploration?.runtimeAuthorized === false &&
      data.marketExploration?.realValueEnabled === false,
    'Polymarketは基本アプリ枠のみ承認され、実接続・実資金は未承認です',
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
      data.systemMaintenance?.backup?.excludes?.includes('device_session_token') &&
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
      data.systemMaintenance?.releaseReadiness?.signingMechanics?.automatedCheck ===
        'npm run release:signing:check' &&
      data.systemMaintenance?.releaseReadiness?.signingMechanics?.publicFixtureTests === 62 &&
      data.systemMaintenance?.releaseReadiness?.signingMechanics?.status ===
        'mechanics_verified_production_key_and_owner_approval_not_executed' &&
      data.systemMaintenance?.releaseReadiness?.historicalNativeInventoryRule ===
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
    '製品ベース: RQ01〜RQ31、メルカリ収益ループ、ホーム・設定utility、OS運用・暗号化保全・QEMU同一候補10gate/SBOM境界、検証済み収益から月最大888 cents、先払い/債務化なし、Sky内MCP、ローカルMCP4機能、共通MCP Connector、MCP接続先3系統、tob利用料/売上手数料0、外部実接続/実送金OFF、ATM手数料0、ATM独立、1.0構成、導入計画、受入雛形、入口、監査SHA、作成規約を確認（意味の一致と最新進捗は別途レビュー）',
  );
}
