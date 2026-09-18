import { existsSync, readFileSync } from 'node:fs';
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
fail(index.requiredDesignFields?.length === 11, '詳細設計の11必須項目を保持してください');
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
  fail(existsSync(resolve(root, document)), `設計書が存在しません: ${document}`);
}

const catalogPairs = catalog.map(({ id, status }) => `${id}:${status}`).sort();
const indexPairs = index.catalogTools
  .map(({ id, catalogStatus }) => `${id}:${catalogStatus}`)
  .sort();
fail(
  JSON.stringify(indexPairs) === JSON.stringify(catalogPairs),
  'Sky catalogの全ready／candidate Toolを設計台帳へ同期してください',
);
const toolsBook = readFileSync(
  resolve(root, 'docs/sky-tools-complete-design.md'),
  'utf8',
);
for (const { id } of index.catalogTools) {
  fail(toolsBook.includes(id), `${id}: 全Tool詳細設計に記載がありません`);
}
fail(index.nativeToolFamilies?.length === 6, 'native Tool 6 familyを保持してください');

console.log(
  `全設計台帳: ${index.systemDomains.length}領域 / catalog ${index.catalogTools.length} Tool / native ${index.nativeToolFamilies.length} family`,
);
