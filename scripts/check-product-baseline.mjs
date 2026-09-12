import { readFileSync } from 'node:fs';
import { resolve, dirname, isAbsolute, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export function validateBaseline(data, read = (path) => readFileSync(path, 'utf8')) {
  const requireValue = (ok, message) => {
    if (!ok) throw new Error(`product-baseline: ${message}`);
  };
  requireValue(data.repository === 'k999ln/rock', '製品正本が違います');
  requireValue(/^\d+\.\d+$/.test(data.version), '版が必要です');
  requireValue(/^\d{4}-\d{2}-\d{2}$/.test(data.decidedAt), '決定日が必要です');
  const documents = {};
  for (const key of ['authority', 'promptRules', 'audit', 'nextPrompt', 'acceptanceTemplate', 'designReview', 'alignmentAudit']) {
    const path = data[key];
    requireValue(typeof path === 'string' && !isAbsolute(path), `${key}: 相対pathが必要です`);
    const resolved = resolve(root, path);
    requireValue(!relative(root, resolved).startsWith('..'), `${key}: repository外の参照です`);
    documents[key] = read(resolved);
    requireValue(documents[key].length > 100, `${key}: 本文がありません`);
  }
  const expected = Array.from({ length: 18 }, (_, i) => `RQ${String(i + 1).padStart(2, '0')}`);
  requireValue(JSON.stringify(data.requirements) === JSON.stringify(expected), '確定要望RQ01〜RQ18の順序/欠落/重複を確認してください');
  for (const id of expected) {
    requireValue(documents.authority.split(`## ${id} `).length === 2, `${id}: 正本の見出しが一意ではありません`);
  }
  requireValue(data.auditInputs?.isLiveStatus === false, '監査snapshotを最新状態にしないでください');
  for (const field of ['main', 'nativeHead', 'designHead']) {
    requireValue(/^[a-f0-9]{40}$/.test(data.auditInputs[field]), `${field}: 40桁SHAが必要です`);
    requireValue(documents.audit.includes(data.auditInputs[field]), `${field}: 監査本文とSHAが一致しません`);
    requireValue(documents.nextPrompt.includes(data.auditInputs[field]), `${field}: プロンプトの起点SHAがありません`);
  }
  requireValue(data.supplyRoleExclusivity === 'unspecified', 'tobの供給元/独占性は未確定です');
  requireValue(data.sky?.displayName === 'Sky', '自動化の利用者向け名称はSkyです');
  requireValue(data.sky?.legacyInternalName === 'hub', '既存データ/API用の内部hub互換名が必要です');
  requireValue(data.primaryCapabilities?.includes('sky-automation-control'), 'Skyの制御能力が必要です');
  const skyInventory = resolve(root, data.sky?.inventory || '');
  requireValue(!relative(root, skyInventory).startsWith('..') && read(skyInventory).includes('Web / PCで現在使える6件'),
    'Skyの役割と収録ツールの正本が必要です');
  requireValue(data.atmFees?.rockFeeMinor === 0, 'ATMの自社手数料は0です');
  requireValue(data.gameExchange?.atmDependency === false, 'ゲーム交換をATM必須にしないでください');
  requireValue(data.marketExploration?.runtimeAuthorized === false && data.marketExploration?.realValueEnabled === false, '市場案は検討のみで実装・実資金未承認です');
  requireValue(data.releaseInstallation?.releaseName === 'RockstarOS 1.0', '1.0の発表名が必要です');
  for (const field of ['architecture', 'plan']) {
    const path = data.releaseInstallation[field];
    requireValue(typeof path === 'string' && !isAbsolute(path), `releaseInstallation.${field}: 相対pathが必要です`);
    const resolved = resolve(root, path);
    requireValue(!relative(root, resolved).startsWith('..') && read(resolved).length > 100,
      `releaseInstallation.${field}: repository内の本文が必要です`);
  }
  const devicePolicy = data.deviceSupportPolicy;
  requireValue(devicePolicy?.status === 'approved_design_implemented_not_physical_support',
    '多機種対応は設計済み・実機未対応として記録してください');
  requireValue(JSON.stringify(devicePolicy?.deliveryModes) === JSON.stringify([
    'native_os',
    'gsi_experimental',
    'client_only',
    'unsupported'
  ]), '多機種対応の4提供区分が必要です');
  for (const field of ['architecture', 'matrix']) {
    const path = devicePolicy[field];
    requireValue(typeof path === 'string' && !isAbsolute(path), `deviceSupportPolicy.${field}: 相対pathが必要です`);
    const resolved = resolve(root, path);
    requireValue(!relative(root, resolved).startsWith('..') && read(resolved).length > 100,
      `deviceSupportPolicy.${field}: repository内の本文が必要です`);
  }
  requireValue(devicePolicy.validation === 'npm run device-support:check',
    '多機種対応台帳の検査commandが必要です');
  requireValue(devicePolicy.firstPhysicalTarget === null, '最初の物理端末は未確定です');
  requireValue(devicePolicy.cloudSpendApproved === false, 'クラウド課金は未承認です');
  requireValue(devicePolicy.physicalFlashAuthorized === false, '実機flashは未承認です');
  for (const file of ['AGENTS.md', 'README.md', 'project.md', 'docs/product.md', 'docs/architecture.md', 'docs/fund-and-mcp.md', 'docs/os-development-design.md', 'docs/os-prototype.md']) {
    requireValue(read(resolve(root, file)).includes('product-baseline.md'), `${file}: ベースへの入口がありません`);
  }
  requireValue(read(resolve(root, 'AGENTS.md')).includes('prompt-playbook.md'), 'AGENTSに作成規約がありません');
  return data;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  validateBaseline(JSON.parse(readFileSync(resolve(root, 'data/product-baseline.json'), 'utf8')));
  console.log('製品ベース: RQ01〜RQ18、ATM手数料0、ATM独立、1.0構成、導入計画、受入雛形、入口、監査SHA、作成規約を確認（意味の一致と最新進捗は別途レビュー）');
}
