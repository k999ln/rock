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
  for (const key of ['authority', 'promptRules', 'audit', 'nextPrompt', 'acceptanceTemplate', 'designReview']) {
    const path = data[key];
    requireValue(typeof path === 'string' && !isAbsolute(path), `${key}: 相対pathが必要です`);
    const resolved = resolve(root, path);
    requireValue(!relative(root, resolved).startsWith('..'), `${key}: repository外の参照です`);
    documents[key] = read(resolved);
    requireValue(documents[key].length > 100, `${key}: 本文がありません`);
  }
  const expected = Array.from({ length: 15 }, (_, i) => `RQ${String(i + 1).padStart(2, '0')}`);
  requireValue(JSON.stringify(data.requirements) === JSON.stringify(expected), '確定要望RQ01〜RQ15の順序/欠落/重複を確認してください');
  for (const id of expected) {
    requireValue(documents.authority.split(`## ${id} `).length === 2, `${id}: 正本の見出しが一意ではありません`);
  }
  requireValue(data.auditInputs?.isLiveStatus === false, '監査snapshotを最新状態にしないでください');
  for (const field of ['main', 'nativeHead']) {
    requireValue(/^[a-f0-9]{40}$/.test(data.auditInputs[field]), `${field}: 40桁SHAが必要です`);
    requireValue(documents.audit.includes(data.auditInputs[field]), `${field}: 監査本文とSHAが一致しません`);
    requireValue(documents.nextPrompt.includes(data.auditInputs[field]), `${field}: プロンプトの起点SHAがありません`);
  }
  requireValue(data.supplyRoleExclusivity === 'unspecified', 'tobの供給元/独占性は未確定です');
  requireValue(data.atmFees?.rockFeeMinor === 0, 'ATMの自社手数料は0です');
  requireValue(data.gameExchange?.atmDependency === false, 'ゲーム交換をATM必須にしないでください');
  for (const file of ['AGENTS.md', 'README.md', 'project.md', 'docs/product.md', 'docs/architecture.md', 'docs/fund-and-mcp.md', 'docs/os-development-design.md', 'docs/os-prototype.md']) {
    requireValue(read(resolve(root, file)).includes('product-baseline.md'), `${file}: ベースへの入口がありません`);
  }
  requireValue(read(resolve(root, 'AGENTS.md')).includes('prompt-playbook.md'), 'AGENTSに作成規約がありません');
  return data;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  validateBaseline(JSON.parse(readFileSync(resolve(root, 'data/product-baseline.json'), 'utf8')));
  console.log('製品ベース: RQ01〜RQ15、ATM手数料0、ATM独立、受入雛形、入口、監査SHA、作成規約を確認（意味の一致と最新進捗は別途レビュー）');
}
