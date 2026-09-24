import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { catalog } from '../lib/catalog.ts';
import { JOB_TOOLS } from '../lib/operations.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const requireValue = (ok, message) => {
  if (!ok) throw new Error(`sky: ${message}`);
};

const catalogSource = read('lib/catalog.ts');
const operationsSource = read('lib/operations.ts');
const readyCount = catalog.filter(({ status }) => status === 'ready').length;
const candidateCount = catalog.filter(({ status }) => status === 'candidate').length;
requireValue(
  readyCount === 12,
  `Web/PC readyは12件です（実際: ${readyCount}）`,
);
requireValue(
  candidateCount === 22,
  `導入候補は22件です（実際: ${candidateCount}）`,
);
const jobTools = new Set(JOB_TOOLS);
for (const tool of catalog.filter(({ status }) => status === 'candidate'))
  requireValue(jobTools.has(tool.id), `導入候補がジョブ受付にありません: ${tool.id}`);
for (const marker of [
  "id: 'rockstar-legal-intake'",
  "name: '法務受付'",
  "runner: 'legal-intake'",
  "id: 'rockstar-patent-assistant'",
  "name: '特許アシスタント'",
  "runner: 'patent-assistant'",
])
  requireValue(
    catalogSource.includes(marker),
    `Sky catalogに法務受付・特許アシスタントの登録がありません: ${marker}`,
  );

const registry = resolve(root, 'systems/rock-star-os/examples/registry');
const packages = readdirSync(registry).filter((name) =>
  name.endsWith('.rock.json'),
);
const connectionSource = operationsSource.slice(
  Math.min(
    operationsSource.indexOf('SKY_CANDIDATE_TOOLS'),
    operationsSource.indexOf('SKY_CONNECTION_TOOLS'),
  ),
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

const projectGuide = read('PROJECTS.md');
requireValue(
  projectGuide.includes('AI自動化チームのTool'),
  'プロジェクト別ガイドにToolチームの入口がありません',
);
const teamGuide = projectGuide.split('## SkyのAI自動化チーム\n')[1]?.split('## 実装・配備単位\n')[0] ?? '';
const commonGuide = projectGuide.split('| AIチームを支える共通機能 |')[1]?.split('## SkyのAI自動化チーム\n')[0] ?? '';
for (const name of ['CSV業務', 'メルカリ収益ループ', 'Fashion Brand Ops', 'Material Invention Studio']) {
  requireValue(teamGuide.includes(`**${name}**`), `Skyのチーム一覧に${name}がありません`);
  requireValue(!commonGuide.includes(`**${name}**`), `${name}を共通機能へ分離しています`);
}
requireValue(
  teamGuide.includes('操作画面とSky接続は未実装') &&
    teamGuide.includes('Sky Tool SDKの開発者向け画面'),
  'Material Inventionの接続状態または/studioの用途が不明です',
);
for (const path of [
  'app/activity/',
  'app/work/',
  'app/settings/',
  'app/studio/',
  'app/sky/publish/',
  'app/rockstaros/',
])
  requireValue(
    projectGuide.includes(`(${path})`),
    `プロジェクト別ガイドにWeb内の画面がありません: ${path}`,
  );
const readme = read('README.md');
requireValue(
  readme.includes('現行Tower20 E3の4本とEdge Hub') &&
    readme.includes('Material Inventionの操作画面とSky接続は未実装'),
  'READMEの現行E3またはMaterial Inventionの実装状態が不明です',
);
for (const { id } of catalog)
  requireValue(
    projectGuide.includes(`\`${id}\``),
    `プロジェクト別ガイドにSky Toolがありません: ${id}`,
  );
for (const id of toolKinds)
  requireValue(
    projectGuide.includes(`\`${id}\``),
    `プロジェクト別ガイドにnative Toolがありません: ${id}`,
  );
for (const entry of readdirSync(resolve(root, 'toolkits'), {
  withFileTypes: true,
}).filter((entry) => entry.isDirectory()))
  requireValue(
    projectGuide.includes(`toolkits/${entry.name}/`),
    `プロジェクト別ガイドにToolKitがありません: ${entry.name}`,
  );
for (const path of [
  'android/article-tool/',
  'android/tool-sdk/',
  'systems/rock-star-os/examples/tools/hello/',
])
  requireValue(
    projectGuide.includes(`(${path})`),
    `プロジェクト別ガイドにToolの実装・作成例がありません: ${path}`,
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
const skyZemaHandoff = read('lib/sky-zema-handoff.ts');
const mcpBot = read('components/mcp-bot-runner.tsx');
const workspaceCss = read('app/workspace.css');
for (const marker of [
  'fashion-brand-ops',
  'Instagram運用・受注型ブランド管理',
  'PCなしのブラウザ簡易版',
])
  requireValue(
    catalogSource.includes(marker) || workspace.includes(marker),
    `Fashion Brand OpsのSky登録に「${marker}」がありません`,
  );

const fashionRunner = read('components/fashion-brand-ops-runner.tsx');
for (const marker of [
  'Producerモード',
  'プロデュース開始',
  'ワンクリックで接続',
])
  requireValue(
    fashionRunner.includes(marker),
    `Fashion Brand Opsの簡易版/MCP導線に「${marker}」がありません`,
  );

const fashionClient = read('lib/fashion-mcp-client.ts');
for (const marker of [
  'FASHION_MCP_TOOL_COUNT = 41',
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
  'aria-label="担当を選ぶ"',
  'handleComposerKeyDown',
  'messagesEndRef',
  'maxLength={2000}',
  '<MrToolRunner',
  'sky-chat-workflow',
  'listMcpConnections',
  'zema-sidebar',
  'zema-model-settings',
  'consumeSkyZemaHandoff',
  'SKY_ZEMA_JOB_EVENT',
  'sky-chat-launch-tool',
  '<McpBotRunner',
])
  requireValue(
    chat.includes(marker),
    `Zemaの会話操作に「${marker}」がありません`,
  );

for (const marker of [
  'sessionStorage',
  'SKY_ZEMA_HANDOFF_TTL_MS',
  'removeItem(SKY_ZEMA_HANDOFF_KEY)',
  'MAX_REQUEST_LENGTH',
])
  requireValue(
    skyZemaHandoff.includes(marker),
    `SkyからZemaへの一回引き継ぎに「${marker}」がありません`,
  );
for (const marker of [
  '.sky-chat-simple',
  '.sky-chat-messages',
  '.sky-chat-composer textarea',
  '.sky-chat-receipt.is-attention',
  '.sky-chat-workflow-steps',
  '.zema-sidebar',
  '.mcp-bot-direction',
  '.mcp-bot-result',
  '@media (max-width: 420px)',
])
  requireValue(
    workspaceCss.includes(marker),
    `ZemaのレスポンシブCSSに「${marker}」がありません`,
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
    `ZemaのMCP bot管理に「${marker}」がありません`,
  );
for (const tool of [
  'rockstar-csv-cleanup',
  'rockstar-markets-analysis',
  'mercari-revenue',
  'rockstar-ledger',
  'rockstar-legal-intake',
  'rockstar-patent-assistant',
  'jev-evaluation',
  ...catalog
    .filter(({ status }) => status === 'candidate')
    .map(({ id }) => id),
])
  requireValue(
    connectionSource.includes(`'${tool}'`),
    `Zemaで使うready担当「${tool}」がSky接続許可リストにありません`,
  );

console.log(
  `Sky: Web/PC ready ${readyCount}件、候補 ${candidateCount}件、native内蔵 ${toolKinds.size}種類/${packages.length}版、表示名を確認`,
);
