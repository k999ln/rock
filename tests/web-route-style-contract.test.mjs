import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const workspace = [
  readFileSync(resolve(root, 'app/workspace.css'), 'utf8'),
  readFileSync(resolve(root, 'app/globals.css'), 'utf8'),
].join('\n');

const surfaces = {
  workspace: [
    '.rock-workspace',
    '.rock-topbar',
    '.rock-main',
    '.rock-bottom-note',
  ],
  sky: ['.sky-main-feed', '.sky-feed-post', '.sky-one-tap-connect'],
  chat: [
    '.sky-chat-simple',
    '.sky-chat-commandbar',
    '.sky-chat-bot-board',
    '.sky-chat-live-progress',
    '.mcp-bot-runner',
  ],
  wallet: ['.wallet-app', '.wallet-balance', '.wallet-transactions'],
  market: [
    '.everything-market-page',
    '.everything-market',
    '.market-search',
    '.market-grid',
    '.market-ticket',
    '.market-proposal',
    '.market-safety',
  ],
};

for (const [surface, selectors] of Object.entries(surfaces)) {
  void test(`${surface} route keeps its required visual contract`, () => {
    for (const selector of selectors) {
      assert.match(
        workspace,
        new RegExp(`\\${selector}[^,{\\n]*[,{]`),
        `${selector} is rendered by the route but missing from workspace.css`,
      );
    }
  });
}

void test('module-styled home, Campus and settings keep their stylesheet bindings', () => {
  const home = readFileSync(
    resolve(root, 'components/home-screen.tsx'),
    'utf8',
  );
  const campus = readFileSync(
    resolve(root, 'components/campus-workspace.tsx'),
    'utf8',
  );
  const settings = readFileSync(
    resolve(root, 'components/system-settings.tsx'),
    'utf8',
  );
  assert.match(home, /from '\.\/home-screen\.module\.css'/);
  assert.match(campus, /from '\.\/campus-workspace\.module\.css'/);
  assert.match(campus, /Avocado Campus is not an official university system/);
  assert.match(settings, /from '\.\/system-settings\.module\.css'/);
  assert.match(settings, /<WorkspaceShell title="設定" hideTopActions>/);
});

void test('Sky Home has its own post timeline theme while other OS surfaces retain the common shell', () => {
  const homeStyles = readFileSync(
    resolve(root, 'components/home-screen.module.css'),
    'utf8',
  );
  const csvStyles = readFileSync(
    resolve(root, 'components/csv-business-workspace.module.css'),
    'utf8',
  );
  const settingsStyles = readFileSync(
    resolve(root, 'components/system-settings.module.css'),
    'utf8',
  );
  const sky = readFileSync(
    resolve(root, 'components/sky-workspace.tsx'),
    'utf8',
  );
  assert.match(workspace, /RockstarOS 1\.0 — unified app surfaces/);
  assert.match(workspace, /avokado OS: the product's graphite shell/);
  assert.match(homeStyles, /\.home \{[\s\S]*--tl-bg: #f6f4ef/);
  assert.match(homeStyles, /\.home \{[\s\S]*--tl-blue: #315b4d/);
  assert.match(csvStyles, /\.primary \{[\s\S]*#172631/);
  assert.match(settingsStyles, /\.itemIcon \{[\s\S]*#bedce6/);
  assert.doesNotMatch(sky, /showSidebar/);
});

void test('Sky feed stays explainable and hands work to the existing Zema path', () => {
  const sky = readFileSync(
    resolve(root, 'components/sky-workspace.tsx'),
    'utf8',
  );
  assert.match(sky, /rankSkyFeed\(candidates, feedMode/);
  assert.match(sky, /label: 'おすすめ'/);
  assert.match(sky, /label: 'マイフィード'/);
  assert.match(sky, /className="sky-feed-reason"/);
  assert.match(sky, /queueSkyZemaHandoff\(tool\.id, request\)/);
  assert.match(sky, /operationRequest<\{ tool: string; saved: boolean \}>/);
  assert.match(sky, /おすすめを学習/);
  assert.match(sky, /\/api\/sky\/feed-history/);
  assert.match(sky, /clearSkyPhoenixHistory/);
  assert.doesNotMatch(sky, /rankSkyFeed\([^)]*requestText/);
});

void test('Sky Home uses native posts and keeps Work and CSV in their own flows', () => {
  const home = readFileSync(resolve(root, 'components/home-screen.tsx'), 'utf8');
  const homeStyles = readFileSync(resolve(root, 'components/home-screen.module.css'), 'utf8');
  for (const route of ['/chat', '/campus', '/wallet', '/market', '/settings'])
    assert.match(home, new RegExp(`href: '${route}'`));
  assert.match(home, /<SkySocialTimeline/);
  assert.match(home, /<SkyDiscoveryFeed/);
  assert.match(home, /\/api\/work-jobs/);
  assert.doesNotMatch(home, /href: '\/work'|href: '\/csv'|iframe/);
  assert.doesNotMatch(home, /BatteryFull|\bWifi\b|\bSignal\b/);
  assert.match(homeStyles, /grid-template-columns: 260px minmax\(0, 600px\) minmax\(0, 350px\)/);
});

void test('workspace shell stays sidebar-free and preserves running-state affordances', () => {
  const shell = readFileSync(
    resolve(root, 'components/workspace-shell.tsx'),
    'utf8',
  );
  assert.doesNotMatch(shell, /Sidebar|rock-sidebar|rock-navigation/);
  assert.match(shell, /rock-main-column rock-main-column-full/);
  assert.match(shell, /className="rock-home-link"/);
  assert.match(shell, /aria-disabled=\{running \|\| undefined\}/);
  assert.match(workspace, /data-running='true'/);
});

void test('OS surfaces keep a smartphone viewport and safe-area contract', () => {
  const layout = readFileSync(resolve(root, 'app/layout.tsx'), 'utf8');
  const homeStyles = readFileSync(
    resolve(root, 'components/home-screen.module.css'),
    'utf8',
  );
  const csvStyles = readFileSync(
    resolve(root, 'components/csv-business-workspace.module.css'),
    'utf8',
  );
  assert.match(layout, /width: 'device-width'/);
  assert.match(layout, /initialScale: 1/);
  assert.match(workspace, /Smartphone contract: 320-767px/);
  assert.match(workspace, /overflow-x: clip/);
  assert.match(workspace, /env\(safe-area-inset-top\)/);
  assert.match(workspace, /min-height: 44px/);
  assert.match(homeStyles, /@media \(max-width: 430px\)/);
  assert.match(homeStyles, /env\(safe-area-inset-bottom\)/);
  assert.match(csvStyles, /@media \(max-width: 520px\)/);
});

void test('Zema owns work management while Sky keeps CSV as a catalog Tool', () => {
  const sky = readFileSync(
    resolve(root, 'components/sky-workspace.tsx'),
    'utf8',
  );
  const chat = readFileSync(
    resolve(root, 'components/sky-chat-workspace.tsx'),
    'utf8',
  );
  const workRoute = readFileSync(resolve(root, 'app/work/page.tsx'), 'utf8');
  const activityRoute = readFileSync(
    resolve(root, 'app/activity/page.tsx'),
    'utf8',
  );
  const catalog = readFileSync(resolve(root, 'lib/catalog.ts'), 'utf8');
  const routing = readFileSync(resolve(root, 'lib/sky-routing.ts'), 'utf8');
  assert.doesNotMatch(sky, /href="\/work"/);
  assert.doesNotMatch(sky, /href="\/csv"/);
  assert.match(catalog, /id: 'rockstar-csv-cleanup'/);
  assert.match(routing, /label: 'CSV自動化役'/);
  assert.match(chat, /href="\/chat\?view=work"/);
  assert.match(
    chat,
    /<Workbench embedded cloudDraft=\{cloudWorkDraft\} initialPackageKey=\{preferredPackage\} packageRuntimeServers=\{mcpServers\} agentRequired=\{Boolean\(requestedAgentId\)\} agentReference=\{activeAgent \? \{ id: activeAgent\.id, revision: activeAgent\.revision \} : null\} \/>/,
  );
  assert.match(chat, /<ChatLiveProgress/);
  assert.match(chat, /<h1>Jennifer<\/h1>/);
  assert.doesNotMatch(chat, /<h1>Chat<\/h1>/);
  assert.match(chat, /Zemaが実行を管理/);
  assert.match(chat, /Zemaの実行計画を開く/);
  assert.match(chat, /useSkyChatSession\(/);
  const chatSession = readFileSync(
    resolve(root, 'components/use-sky-chat-session.ts'),
    'utf8',
  );
  assert.match(
    chatSession,
    /consumeSkyZemaHandoff\(preferredTool, undefined, undefined, requestedThreadId\)/,
  );
  assert.match(chat, /SKY_ZEMA_JOB_EVENT/);
  assert.match(chat, /className="sky-chat-launch-tool"/);
  assert.match(sky, /queueSkyZemaHandoff\(tool\.id, request\)/);
  assert.match(sky, /Zemaへ引き継ぐ/);
  assert.match(chat, /setInterval\(refresh, hasActiveJob \? 3_000 : 15_000\)/);
  assert.match(chat, /setInterval\(refresh, 30_000\)/);
  const liveProgress = readFileSync(
    resolve(root, 'components/chat-live-progress.tsx'),
    'utf8',
  );
  assert.match(liveProgress, /内部思考や未確認の収益は表示しません/);
  assert.match(liveProgress, /analytics\?\.observedReturnBps == null/);
  assert.match(liveProgress, /CSV自動化役の進捗/);
  const csv = readFileSync(
    resolve(root, 'components/csv-business-workspace.tsx'),
    'utf8',
  );
  assert.doesNotMatch(
    csv,
    /router\.push\('\/chat\?tool=rockstar-csv-cleanup'\)/,
  );
  assert.match(csv, /needsSignin &&/);
  assert.match(csv, /reason\.status === 401/);
  assert.match(workRoute, /redirect\('\/chat\?view=work'\)/);
  assert.match(activityRoute, /redirect\('\/chat\?view=work'\)/);
});

void test('Zema keeps the composer in view and explains a selected candidate before sending', () => {
  const chat = readFileSync(
    resolve(root, 'components/sky-chat-workspace.tsx'),
    'utf8',
  );
  assert.match(
    workspace,
    /\.sky-chat-page \.sky-chat-simple \{[^}]*height: 100dvh;/,
  );
  assert.match(
    workspace,
    /\.sky-chat-page \.sky-chat-messages \{[^}]*min-height: 0;[^}]*flex: 1 1 auto;/,
  );
  assert.match(chat, /className="zema-empty-status"/);
  assert.match(chat, /依頼を書く/);
  assert.match(chat, /composerRef\.current\?\.focus\(\)/);
  assert.match(chat, /専用画面を開く/);
  assert.match(chat, /ツール本体の実行は未対応です/);
  assert.match(
    chat,
    /const \[allBotsOpen, setAllBotsOpen\] = useState\(false\)/,
  );
  assert.match(chat, /ツールと会話を検索/);
  assert.match(chat, /AVOKADO \/ JENNIFER/);
  assert.match(chat, /jennifer-project-list/);
  assert.match(chat, /jennifer-flow-card/);
});

void test('routes inside the OS keep a direct OS home affordance', () => {
  const contracts = [
    [
      'workspace shell',
      'components/workspace-shell.tsx',
      /className="rock-home-link"[\s\S]{0,120}aria-label="ホームへ戻る"/,
    ],
    [
      'mobile chat command bar',
      'components/sky-chat-workspace.tsx',
      /<Link href="\/" aria-label="ホームへ戻る"/,
    ],
    [
      'settings',
      'components/system-settings.tsx',
      /<WorkspaceShell title="設定" hideTopActions>/,
    ],
    [
      'system maintenance',
      'components/system-maintenance.tsx',
      /<Link href="\/" aria-label="ホームへ戻る"/,
    ],
    [
      'automation fund',
      'app/fund/page.tsx',
      /<Link href="\/">⌂ ホーム<\/Link>/,
    ],
    [
      'legacy fund',
      'app/fund/legacy/page.tsx',
      /<Link href="\/">⌂ ホーム<\/Link>/,
    ],
    [
      'rock studio',
      'components/rock-studio.tsx',
      /<Link href="\/" className="studio-wordmark" aria-label="ホームへ戻る"/,
    ],
  ];
  for (const [name, path, pattern] of contracts) {
    const source = readFileSync(resolve(root, path), 'utf8');
    assert.match(source, pattern, `${name} lost its direct Home route`);
  }
});

void test('public product and install guide stay outside the OS home', () => {
  const product = readFileSync(
    resolve(root, 'app/rockstaros/page.tsx'),
    'utf8',
  );
  const guide = readFileSync(
    resolve(root, 'app/rockstaros/guide/page.tsx'),
    'utf8',
  );
  assert.doesNotMatch(product, /href="\/"/);
  assert.match(product, /href="\/rockstaros\/guide"/);
  assert.match(
    guide,
    /<Link href="\/rockstaros" className=\{styles\.brand\} aria-label="製品ホームへ戻る"/,
  );
});

void test('Campus route keeps physical-entry and privacy boundaries visible in source', () => {
  const route = readFileSync(resolve(root, 'app/t/[tagId]/route.ts'), 'utf8');
  const api = readFileSync(resolve(root, 'app/api/campus/route.ts'), 'utf8');
  const store = readFileSync(resolve(root, 'lib/campus-store.ts'), 'utf8');
  const design = readFileSync(resolve(root, 'docs/campus-layer.md'), 'utf8');
  assert.match(route, /recordTagEvent\(tagId, source\)/);
  assert.match(route, /Response\.redirect/);
  assert.match(api, /leaveCampus/);
  assert.match(api, /clearTagAnalytics/);
  assert.match(store, /source, occurred_at/);
  assert.doesNotMatch(store, /user_agent|ip_address|latitude|longitude/i);
  assert.match(design, /大学の公式サービスではありません/);
  assert.match(
    design,
    /IP address、認証email、precise location、raw User-Agent/,
  );
});
