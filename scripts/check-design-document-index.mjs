import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { catalog } from '../lib/catalog.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const index = JSON.parse(
  readFileSync(resolve(root, 'data/design-document-index.json'), 'utf8'),
);
const fail = (condition, message) => {
  if (!condition) throw new Error(message);
};

fail(
  index.schema === 'rockstaros-design-document-index/1',
  '全設計台帳schemaが不正です',
);
fail(
  index.completionMeaning ===
    'current_scope_documented_with_explicit_open_decisions_not_all_implementations_complete',
  '設計記載と実装完成を分離してください',
);
fail(
  index.requiredDesignFields?.length === 11,
  '詳細設計の11必須項目を保持してください',
);
fail(index.systemDomains?.length >= 15, 'OS全領域の設計入口が不足しています');

const referenced = new Set(index.primaryBooks);
for (const domain of index.systemDomains) {
  fail(domain.id && domain.coverage, 'system domainのIDとcoverageが必要です');
  fail(domain.documents?.length > 0, `${domain.id}: 設計書が必要です`);
  fail(
    !domain.coverage.includes('COMPLETE'),
    `${domain.id}: open decisionを含む領域を無条件COMPLETEにしないでください`,
  );
  for (const document of domain.documents) referenced.add(document);
}
for (const document of referenced) {
  fail(
    existsSync(resolve(root, document)),
    `設計書が存在しません: ${document}`,
  );
}

fail(index.sourceArtifacts?.length >= 1, '原本設計artifactの台帳が必要です');
for (const artifact of index.sourceArtifacts) {
  for (const path of [
    artifact.pdf,
    artifact.searchableText,
    artifact.integrityRecord,
  ]) {
    fail(existsSync(resolve(root, path)), `設計原本の関連fileが存在しません: ${path}`);
  }
}

const completeDesign = JSON.parse(
  readFileSync(
    resolve(root, 'data/rockstaros-complete-design-v1.0.json'),
    'utf8',
  ),
);
const sha256 = (path) =>
  createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex');
fail(
  completeDesign.schema === 'rockstaros-complete-design-source/1' &&
    completeDesign.source?.pageCount === 41 &&
    completeDesign.scope?.chapterCount === 32 &&
    completeDesign.scope?.deploymentProfileCount === 5 &&
    completeDesign.scope?.logicalServiceCount === 13 &&
    completeDesign.scope?.requirementCount === 60 &&
    completeDesign.scope?.structuralAndDdlChecksPassed === 43 &&
    completeDesign.scope?.structuralAndDdlChecksTotal === 43 &&
    completeDesign.implementationBoundary?.implementationComplete === false &&
    completeDesign.implementationBoundary?.physicalAcceptanceComplete ===
      false,
  '完全版v1.0の範囲と未完了境界を保持してください',
);
fail(
  sha256(completeDesign.source.pdf) === completeDesign.source.pdfSha256 &&
    sha256(completeDesign.source.searchableText) ===
      completeDesign.source.searchableTextSha256,
  '完全版v1.0の原本または抽出テキストのSHA-256が一致しません',
);
const completeText = readFileSync(
  resolve(root, completeDesign.source.searchableText),
  'utf8',
);
for (const term of [
  '01 この完全版の範囲と設計の読み方',
  '13の論理サービス',
  'GROUND-REF-v1',
  'OSR-060',
  '32 用語と根拠資料',
]) {
  fail(completeText.includes(term), `完全版v1.0の抽出テキストが不足しています: ${term}`);
}

const catalogPairs = catalog.map(({ id, status }) => `${id}:${status}`).sort();
const indexPairs = index.catalogTools
  .map(({ id, catalogStatus }) => `${id}:${catalogStatus}`)
  .sort();
fail(
  new Set(catalog.map(({ id }) => id)).size === catalog.length,
  'Sky catalogのTool IDを重複させないでください',
);
fail(
  new Set(index.catalogTools.map(({ id }) => id)).size ===
    index.catalogTools.length,
  '設計台帳のTool IDを重複させないでください',
);
fail(
  JSON.stringify(indexPairs) === JSON.stringify(catalogPairs),
  'Sky catalogの全ready／candidate Toolを設計台帳へ同期してください',
);
fail(
  catalog.filter(({ status }) => status === 'ready').length === 12,
  'ready Tool 12件を保持してください',
);
fail(
  catalog.filter(({ status }) => status === 'candidate').length === 22,
  'candidate Tool 22件を保持してください',
);
const toolsBook = readFileSync(
  resolve(root, 'docs/sky-tools-complete-design.md'),
  'utf8',
);
for (const { id } of index.catalogTools) {
  fail(toolsBook.includes(id), `${id}: 全Tool詳細設計に記載がありません`);
}
const jevBook = readFileSync(
  resolve(root, 'docs/jev-ecosystem-integration-design.md'),
  'utf8',
);
for (const id of [
  'jev-ultrafast',
  'openjev',
  'jevlike',
  'jev-trader',
  'awesome-jev-by-typesafe',
  'typesafe-computer-use',
  'jev-review',
  'jev-router',
  'jev-browser',
  'mobile-jev',
]) {
  fail(jevBook.includes(id), `${id}: Jev ecosystem詳細設計に記載がありません`);
}
const decisionBook = readFileSync(
  resolve(root, 'docs/jev-local-qwen-decision-fabric-design.md'),
  'utf8',
);
for (const term of [
  'DecisionProvider',
  'Decision Router',
  'Local Qwen',
  'TypeSafeJevProvider',
  'Codex統合',
  'RAG / Knowledge Engine',
  'Market Intelligence',
  'Wallet / MCP / Hub',
  'Result Verifier',
  'MVP実装順',
]) {
  fail(
    decisionBook.includes(term),
    `${term}: Decision Fabric詳細設計に記載がありません`,
  );
}
const decisionPolicy = JSON.parse(
  readFileSync(resolve(root, 'data/decision-fabric-policy.json'), 'utf8'),
);
fail(
  decisionPolicy.status === 'DESIGN_APPROVED_IMPLEMENTATION_PENDING',
  'Decision Fabric設計をruntime完成と表示しないでください',
);
for (const [key, value] of Object.entries({
  confidenceIsAuthority: false,
  providerMayGrantCapability: false,
  providerMayReadSecrets: false,
  providerMayCallToolsDirectly: false,
  providerMayWriteWalletLedger: false,
  providerMayExecuteLiveMarketOrder: false,
  providerMayControlPhysicalEquipment: false,
  cloudFallbackWithoutConsent: false,
  externalWriteAutomaticRetryAfterUnknownResult: false,
  resultSelfReportCountsAsVerified: false,
  chainOfThoughtStored: false,
})) {
  fail(
    decisionPolicy.hardInvariants?.[key] === value,
    `Decision Fabric安全不変条件が不正です: ${key}`,
  );
}
fail(
  decisionPolicy.marketMode === 'PAPER_ONLY',
  'MarketをPAPER限定にしてください',
);
fail(
  decisionPolicy.walletAiRole === 'ADVISORY_ONLY',
  'Wallet AIを助言限定にしてください',
);
fail(
  decisionPolicy.physicalExecutionAllowed === false,
  'AIの物理実行を許可しないでください',
);
fail(
  index.nativeToolFamilies?.length === 6,
  'native Tool 6 familyを保持してください',
);

console.log(
  `全設計台帳: ${index.systemDomains.length}領域 / catalog ${index.catalogTools.length} Tool / native ${index.nativeToolFamilies.length} family`,
);
