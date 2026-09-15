import { existsSync, readFileSync, statSync } from 'node:fs';
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
    { length: 27 },
    (_, i) => `RQ${String(i + 1).padStart(2, '0')}`,
  );
  requireValue(
    JSON.stringify(data.requirements) === JSON.stringify(expected),
    '確定要望RQ01〜RQ27の順序/欠落/重複を確認してください',
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
      read(skyInventory).includes('Web / PCで現在使える6件'),
    'Skyの役割と収録ツールの正本が必要です',
  );
  requireValue(data.atmFees?.rockFeeMinor === 0, 'ATMの自社手数料は0です');
  requireValue(
    data.gameExchange?.atmDependency === false,
    'ゲーム交換をATM必須にしないでください',
  );
  requireValue(
    data.marketExploration?.runtimeAuthorized === false &&
      data.marketExploration?.realValueEnabled === false,
    '市場案は検討のみで実装・実資金未承認です',
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
    data.primaryCapabilities?.includes('sky-tool-developer-platform') &&
      data.skyToolDeveloperPlatform?.status ===
        'developer_preview_registered_and_declared_publication' &&
      data.skyToolDeveloperPlatform?.packageSchema === 'sky-tool-package/1' &&
      data.skyToolDeveloperPlatform?.frontend === 'chat_code_or_file_only' &&
      data.skyToolDeveloperPlatform?.rawCodeUploaded === false &&
      data.skyToolDeveloperPlatform?.automaticPackageGeneration === true &&
      data.skyToolDeveloperPlatform?.mcpDiscoveryAndCallImplemented === true &&
      data.skyToolDeveloperPlatform?.anonymousUsageFieldsOnly === true &&
      data.skyToolDeveloperPlatform?.declaredPublicationInstallable === false &&
      data.skyToolDeveloperPlatform?.verifiedPublicationImplemented === false &&
      data.skyToolDeveloperPlatform?.productionSandboxImplemented === false,
    'Sky Tool SDKの雛形・匿名利用集計と宣言公開/検証済み公開の境界を維持してください',
  );
  for (const field of ['studio', 'sdk', 'record']) {
    const path = data.skyToolDeveloperPlatform?.[field];
    requireValue(
      typeof path === 'string' &&
        !isAbsolute(path) &&
        !relative(root, resolve(root, path)).startsWith('..') &&
        existsSync(resolve(root, path)) &&
        (statSync(resolve(root, path)).isDirectory() ||
          read(resolve(root, path)).length > 100),
      `skyToolDeveloperPlatform.${field}: repository内の実装または本文が必要です`,
    );
  }
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
    '製品ベース: RQ01〜RQ27、検証済み収益から月最大888 cents、先払い/債務化なし、Sky内MCP、ローカルMCP4機能、共通MCP Connector、Sky Tool SDK雛形、チャット型コード取込、宣言公開/検証済み公開の分離、MCP接続先3系統、tob利用料/売上手数料0、外部実接続/実送金OFF、ATM手数料0、ATM独立、1.0構成、導入計画、受入雛形、入口、監査SHA、作成規約を確認（意味の一致と最新進捗は別途レビュー）',
  );
}
