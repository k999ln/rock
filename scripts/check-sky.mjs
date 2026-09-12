import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const requireValue = (ok, message) => {
  if (!ok) throw new Error(`sky: ${message}`);
};

const catalogSource = read('lib/catalog.ts');
const readyCount = (catalogSource.match(/"status": "ready"/g) || []).length;
const candidateCount = (catalogSource.match(/status:'candidate'/g) || [])
  .length;
requireValue(readyCount === 4, `Web/PC readyは4件です（実際: ${readyCount}）`);
requireValue(
  candidateCount === 3,
  `導入候補は3件です（実際: ${candidateCount}）`,
);

const registry = resolve(root, 'systems/rock-star-os/examples/registry');
const packages = readdirSync(registry).filter((name) =>
  name.endsWith('.rock.json'),
);
const identities = packages.map((name) => {
  const value = JSON.parse(readFileSync(resolve(registry, name), 'utf8'));
  return `${value.manifest.id}@${value.manifest.version}`;
});
const toolKinds = new Set(identities.map((identity) => identity.split('@')[0]));
requireValue(
  packages.length === 9,
  `native内蔵packageは9版です（実際: ${packages.length}）`,
);
requireValue(
  toolKinds.size === 6,
  `native内蔵Toolは6種類です（実際: ${toolKinds.size}）`,
);

for (const path of [
  'app/layout.tsx',
  'app/manifest.ts',
  'app/rockstaros/page.tsx',
  'app/rockstaros/guide/page.tsx',
  'components/sky-workspace.tsx',
  'components/workspace-shell.tsx',
  'systems/rock-star-os/src/blackberryrock/web/index.html',
  'systems/rock-star-os/src/blackberryrock/web/app.js',
]) {
  requireValue(
    !/Automation Hub|自動化Hub|YOUR AUTOMATION HUB|\bHub\b/.test(read(path)),
    `${path}に旧製品名Hubが残っています`,
  );
}

const nativeUi = read('systems/rock-star-os/os/ui/ui.c');
requireValue(
  nativeUi.includes('static const char *tabs[] = { "Sky",'),
  'native画面の先頭tabがSkyではありません',
);
const sky = read('docs/sky.md');
for (const marker of [
  '探す',
  '権限・料金',
  '端末・PC・Cloud',
  '実行・停止',
  '結果・実行記録',
])
  requireValue(sky.includes(marker), `Skyの説明に「${marker}」がありません`);

console.log(
  `Sky: Web/PC ready ${readyCount}件、候補 ${candidateCount}件、native内蔵 ${toolKinds.size}種類/${packages.length}版、表示名を確認`,
);
