import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const requireValue = (ok, message) => {
  if (!ok) throw new Error(`sky: ${message}`);
};

const catalogSource = read('lib/catalog.ts');
const operationsSource = read('lib/operations.ts');
const catalogBody = catalogSource.slice(
  catalogSource.indexOf('export const catalog'),
);
const readyCount = (
  catalogBody.match(/["']?status["']?\s*:\s*['"]ready['"]/g) || []
).length;
const candidateCount = (
  catalogBody.match(/["']?status["']?\s*:\s*['"]candidate['"]/g) || []
).length;
requireValue(readyCount === 8, `Web/PC readyは8件です（実際: ${readyCount}）`);
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
const workspace = read('components/sky-workspace.tsx');
const chat = read('components/sky-chat-workspace.tsx');
const mcpBot = read('components/mcp-bot-runner.tsx');
const workspaceCss = read('app/workspace.css');
for (const marker of [
  'fashion-brand-ops',
  'Instagram運用・受注型ブランド管理',
  '1クリック接続',
])
  requireValue(
    catalogSource.includes(marker) || workspace.includes(marker),
    `Fashion Brand OpsのSky登録に「${marker}」がありません`,
  );

const fashionClient = read('lib/fashion-mcp-client.ts');
for (const marker of [
  'FASHION_MCP_TOOL_COUNT = 38',
  "'initialize'",
  "'notifications/initialized'",
  "'tools/list'",
  "'/disconnect'",
])
  requireValue(
    fashionClient.includes(marker),
    `Fashion Brand Opsのワンクリック接続に「${marker}」がありません`,
  );
requireValue(
  read('components/fashion-brand-ops-runner.tsx').includes(
    '/toolkits/fashion-brand-ops-connector.zip',
  ),
  'Fashion Brand OpsのPC接続アプリ導線がありません',
);
const fashionConnector = resolve(
  root,
  'public/toolkits/fashion-brand-ops-connector.zip',
);
requireValue(
  existsSync(fashionConnector) && statSync(fashionConnector).size > 0,
  'Fashion Brand OpsのPC接続アプリ配布ZIPがありません',
);
for (const marker of [
  'RockstarOS Sky接続アプリを起動しました',
  '--env-file=.env',
  'ROCKSTAR_APPROVAL_SECRET',
])
  requireValue(
    read('toolkits/fashion-brand-ops/RockstarOS Sky接続.command').includes(
      marker,
    ),
    `Fashion Brand Ops接続アプリに「${marker}」がありません`,
  );
for (const marker of [
  '探す',
  '権限・料金',
  '端末・PC・Cloud',
  '実行・停止',
  '結果・実行記録',
])
  requireValue(sky.includes(marker), `Skyの説明に「${marker}」がありません`);

requireValue(
  (workspace.match(/rock-tool-dialog sky-tool-dialog/g) || []).length >= 2,
  'Skyのツール・PC接続Dialogに統一外観が適用されていません',
);
for (const marker of [
  '.rock-main-column:has(.sky-main-feed)',
  '.sky-tool-dialog .fashion-ops-runner',
  'translate: 0 0 !important',
  'max-height: calc(100dvh',
])
  requireValue(
    workspaceCss.includes(marker),
    `Skyの画面・モバイルDialog CSSに「${marker}」がありません`,
  );

for (const marker of [
  'role="log"',
  'aria-pressed=',
  'handleComposerKeyDown',
  'messagesEndRef',
  'maxLength={2000}',
  '<MrToolRunner',
  'sky-chat-workflow',
  'listMcpConnections',
  'sky-chat-bot-board',
  '<McpBotRunner',
])
  requireValue(
    chat.includes(marker),
    `Chatの会話操作に「${marker}」がありません`,
  );
for (const marker of [
  '.sky-chat-simple',
  '.sky-chat-messages',
  '.sky-chat-composer textarea',
  '.sky-chat-receipt.is-attention',
  '.sky-chat-workflow-steps',
  '.sky-chat-bot-board',
  '.mcp-bot-direction',
  '.mcp-bot-result',
  '@media (max-width: 420px)',
])
  requireValue(
    workspaceCss.includes(marker),
    `ChatのレスポンシブCSSに「${marker}」がありません`,
  );
for (const marker of [
  'prepareMcpTool',
  'executeApprovedMcpTool',
  'disconnectMcp',
  '方向・修正指示',
  '実行中の処理への割り込みではありません',
])
  requireValue(
    mcpBot.includes(marker),
    `ChatのMCP bot管理に「${marker}」がありません`,
  );
for (const tool of [
  'rockstar-ledger',
  'rockstar-legal-intake',
  'rockstar-patent-assistant',
])
  requireValue(
    operationsSource
      .slice(operationsSource.indexOf('SKY_CONNECTION_TOOLS'))
      .includes(`'${tool}'`),
    `Chatで使うready担当「${tool}」がSky接続許可リストにありません`,
  );

console.log(
  `Sky: Web/PC ready ${readyCount}件、候補 ${candidateCount}件、native内蔵 ${toolKinds.size}種類/${packages.length}版、表示名を確認`,
);
