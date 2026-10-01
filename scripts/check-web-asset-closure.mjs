import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const textExtensions = new Set(['.html', '.js', '.json', '.mjs', '.txt']);
const assetPattern = /(?:\/?)(_next\/static\/[A-Za-z0-9_./-]+\.(?:css|js|png|svg|webp|woff2?))/g;
const serverAssetIndexes = new Set([
  '__vite_rsc_assets_manifest.js',
  'vinext-client-assets.js',
]);

function filesBelow(directory) {
  if (!existsSync(directory)) return [];
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...filesBelow(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

function isTextCandidate(path) {
  const suffix = path.slice(path.lastIndexOf('.'));
  return textExtensions.has(suffix) && statSync(path).size <= 32 * 1024 * 1024;
}

function isDeliveryReferenceIndex(path, dist) {
  const source = relative(dist, path);
  if (source.startsWith('server/')) {
    return serverAssetIndexes.has(source.slice(source.lastIndexOf('/') + 1));
  }
  if (!source.startsWith('client/')) return false;
  return (
    source.endsWith('.html') ||
    source.endsWith('/.vite/manifest.json') ||
    source.endsWith('/vinext-client-entry-manifest.json') ||
    source.endsWith('/sw.js')
  );
}

export function auditWebAssetClosure(distDirectory) {
  const dist = resolve(distDirectory);
  const client = resolve(dist, 'client');
  const references = new Map();
  for (const source of filesBelow(dist).filter(
    (path) => isTextCandidate(path) && isDeliveryReferenceIndex(path, dist),
  )) {
    const contents = readFileSync(source, 'utf8');
    for (const match of contents.matchAll(assetPattern)) {
      const asset = match[1];
      const sources = references.get(asset) ?? new Set();
      sources.add(relative(dist, source));
      references.set(asset, sources);
    }
  }
  const missing = [...references]
    .filter(([asset]) => !existsSync(resolve(client, asset)))
    .map(([asset, sources]) => ({
      asset,
      sources: [...sources].sort((left, right) => left.localeCompare(right)),
    }))
    .sort((left, right) => left.asset.localeCompare(right.asset));
  return { references: references.size, missing };
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const result = auditWebAssetClosure(resolve(root, 'dist'));
  if (result.references < 1) {
    throw new Error('配備asset参照を検出できませんでした。先にWeb buildを実行してください。');
  }
  if (result.missing.length > 0) {
    const summary = result.missing
      .map(({ asset, sources }) => `${asset} <- ${sources.join(', ')}`)
      .join('\n');
    throw new Error(`配備に存在しないasset参照があります:\n${summary}`);
  }
  console.log(`Web asset closure: ${result.references} references、missing 0`);
}
