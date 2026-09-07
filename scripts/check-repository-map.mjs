import { createHash } from 'node:crypto';
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const map = JSON.parse(
  readFileSync(resolve(root, 'data/repository-map.json'), 'utf8'),
);

const repositories = new Map(
  map.repositories.map((entry) => [entry.repository, entry]),
);
if (repositories.size !== map.repositories.length)
  throw new Error('repository-map: repositoryが重複しています。');

const productOwners = map.repositories.filter(
  (entry) => entry.role === 'product-ssot',
);
if (
  productOwners.length !== 1 ||
  productOwners[0].repository !== 'k999ln/rock' ||
  map.product.productRepository !== 'k999ln/rock'
)
  throw new Error('repository-map: 製品正本はk999ln/rockの1件だけです。');

const operations = repositories.get('k999ln/Mr.');
if (
  operations?.role !== 'private-operations-component' ||
  operations.visibility !== 'private'
)
  throw new Error('repository-map: Mr.の非公開運用境界が不正です。');

const legacy = repositories.get('k999ln/vvvv');
if (legacy?.role !== 'legacy-history' || legacy.newWork !== false)
  throw new Error('repository-map: vvvvは旧履歴・新規作業禁止です。');

if (!existsSync(resolve(root, 'docs/git-consolidation.md')))
  throw new Error('repository-map: 統合方針文書がありません。');

function* filesBelow(path) {
  if (!existsSync(path)) return;
  for (const name of readdirSync(path)) {
    const child = resolve(path, name);
    if (statSync(child).isDirectory()) yield* filesBelow(child);
    else yield child;
  }
}

const forbiddenLegacyReference = 'github.com/k999ln/vvvv';
for (const sourceRoot of map.activeSourceRoots) {
  for (const file of filesBelow(resolve(root, sourceRoot))) {
    if (file === fileURLToPath(import.meta.url)) continue;
    const contents = readFileSync(file);
    if (contents.includes(forbiddenLegacyReference))
      throw new Error(
        `repository-map: active sourceが旧repositoryを参照しています: ${file}`,
      );
  }
}

const provenance = JSON.parse(
  readFileSync(resolve(root, 'vendor/mr/provenance.json'), 'utf8'),
);
if (
  provenance.repository !== 'https://github.com/k999ln/Mr.' ||
  provenance.commit !== map.sharing.mrVendorSnapshot.commit
)
  throw new Error('repository-map: Mr. snapshotの取得元が一致しません。');

for (const entry of provenance.files) {
  const file = resolve(root, 'vendor/mr', entry.file);
  if (!existsSync(file))
    throw new Error(`repository-map: Mr. snapshotがありません: ${entry.file}`);
  const contents = readFileSync(file);
  const blob = createHash('sha1')
    .update(`blob ${contents.length}\0`)
    .update(contents)
    .digest('hex');
  const sha256 = createHash('sha256').update(contents).digest('hex');
  if (blob !== entry.blobSha || sha256 !== entry.sha256)
    throw new Error(`repository-map: Mr. snapshotが変わっています: ${entry.file}`);
}

console.log(
  `repository map: ${map.repositories.length}件、製品正本1件、legacy参照なし、Mr. snapshot ${provenance.files.length}件一致`,
);
