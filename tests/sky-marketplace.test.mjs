import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { catalog } from '../lib/catalog.ts';
import { marketplaceCommissionMinor, marketplaceProviderNetMinor } from '../lib/sky-marketplace-policy.ts';
import { skyAiMarketplaceEntries } from '../lib/sky-ai-marketplace.ts';
import { skyToolDetailActionLabel, skyToolUiState } from '../lib/sky-tool-ui.ts';
import {
  catalogHostMismatch,
  detectSkyHost,
  registryHostMismatch,
} from '../lib/sky-tool-compatibility.ts';

const [page, marketplace, sky, registry, detail, publisher, overview, coconala, commerce, workspaceShell, esimPurchase] = await Promise.all([
  readFile(new URL('../app/sky/marketplace/page.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../components/sky-marketplace.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../components/sky-workspace.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../lib/sky-tool-package-store.ts', import.meta.url), 'utf8'),
  readFile(new URL('../components/sky-tool-workspace.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../components/sky-publisher-form.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../components/sky-tool-overview.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../components/coconala-team-workspace.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../components/sky-commerce.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../components/workspace-shell.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../components/esim-purchase-setup.tsx', import.meta.url), 'utf8'),
]);

void test('Sky paid-order eSIM setup is owner-driven, does not issue profiles, and protects install material', () => {
  assert.match(commerce, /order\.status === 'paid' && <EsimPurchaseSetup/);
  assert.match(esimPurchase, /body \? 'install-material' : 'status'/);
  assert.match(esimPurchase, /action: 'fetch'/);
  assert.match(esimPurchase, /action: 'acknowledge'/);
  assert.match(esimPurchase, /sessionStorage/);
  assert.match(esimPurchase, /esimsetup\.apple\.com/);
  assert.match(esimPurchase, /esimsetup\.android\.com/);
  assert.match(esimPurchase, /referrerPolicy="no-referrer"/);
  assert.match(esimPurchase, /導入情報を表示/);
  assert.match(esimPurchase, /サーバーから消去/);
  assert.match(esimPurchase, /active_on_authenticated_device/);
  assert.match(esimPurchase, /revoked_or_stale/);
  assert.match(esimPurchase, /署名付き証明でeSIM導入を確認しました/);
  assert.match(esimPurchase, /OSの追加確認が表示される場合があります/);
  assert.match(esimPurchase, /無人で導入・有効化できるかは/);
  assert.match(esimPurchase, /署名付き証明が届くまでは/);
  assert.match(esimPurchase, /各Toolの権限・本人承認は別途必要です/);
  assert.doesNotMatch(esimPurchase, /\/issue/);
  assert.doesNotMatch(esimPurchase, /dangerouslySetInnerHTML/);
});

void test('commerce uses the workspace main landmark without nesting a second main', () => {
  assert.equal([...workspaceShell.matchAll(/<main(?:\s|>)/g)].length, 1);
  assert.match(commerce, /<WorkspaceShell/);
  assert.doesNotMatch(commerce, /<main(?:\s|>)/);
});

void test('buyer purchase conditions remain available without active tool access', () => {
  const conditions = commerce.match(/\{!seller && <details[\s\S]*?<\/details>\}/)?.[0];
  assert.ok(conditions, 'buyer conditions must not depend on access or payment status');
  assert.match(conditions, /order\.refundPolicy/);
  assert.match(conditions, /href=\{terms\}/);
  assert.match(commerce, /const terms = httpsUrl\(order\.termsUrl\)/);
  assert.doesNotMatch(conditions, /dangerouslySetInnerHTML/);
});

void test('checkout preserves the server reason for a conflict after refreshing offers', () => {
  const checkout = commerce.slice(commerce.indexOf('async function checkout()'), commerce.indexOf('function CommercePage('));
  assert.match(checkout, /cause\.status === 409\) await onOfferChanged\(\)/);
  assert.match(checkout, /setError\(cause instanceof Error \? cause :/);
  assert.doesNotMatch(checkout, /販売条件を更新しました/);
});

void test('Sky exposes a separate AI and automation marketplace from its main app view', () => {
  assert.match(page, /SkyMarketplace/);
  assert.match(sky, /href="\/sky\/marketplace"/);
  assert.match(marketplace, /href="\/studio"/);
  assert.match(marketplace, /href="\/sky\/register"/);
  assert.match(marketplace, /href="\/sky\/network"/);
});

void test('publisher can reuse owner-scoped details without an assumed free price', () => {
  assert.match(publisher, /fetch\('\/api\/sky\/submissions'/);
  assert.match(publisher, /前回の提供者情報を再利用できます/);
  assert.match(publisher, /setName\(\(current\) => current \|\| result\.serverName/);
  assert.match(publisher, /料金方式を選択/);
  assert.doesNotMatch(publisher, /defaultValue="無料。追加API料金なし。"/);
  assert.match(marketplace, /<MarketplacePurchase/);
});

void test('all catalog tools remain individually discoverable without claiming candidates are operational', () => {
  assert.equal(catalog.length, 36);
  assert.equal(catalog.filter((tool) => tool.status === 'candidate').length, 22);
  assert.match(marketplace, /catalog\.filter/);
  assert.match(marketplace, /skyToolUiState\(tool, runtimeContext\)/);
  assert.equal(skyToolUiState(catalog.find((tool) => tool.id === 'jev-router')).label, 'Sky未接続・PC CLIのみ');
  assert.match(marketplace, /掲載数は、接続済み・本番稼働数を意味しません/);
  assert.match(marketplace, /\/sky\/tools\/\$\{encodeURIComponent\(tool\.id\)\}/);
  assert.match(overview, /tool\.cost/);
  assert.match(detail, /tool\.source/);
  assert.match(overview, /tool\.environment/);
});

void test('catalog icons reveal capabilities without starting or connecting a tool', () => {
  assert.match(marketplace, /<SkyToolCard/);
  assert.match(marketplace, /onInspect=\{\(\) => setSelectedCatalog\(tool\)\}/);
  assert.match(detail, /onClick=\{\(\) => setInfoOpen\(true\)\}/);
  for (const surface of [marketplace, sky, detail, coconala])
    assert.match(surface, /<SkyToolOverview/);
  assert.match(overview, /<DialogTitle className=\{styles\.title\}>\{tool\.name\}<\/DialogTitle>/);
  assert.match(overview, /<DialogDescription className=\{styles\.description\}>\{tool\.description\}<\/DialogDescription>/);
  assert.match(overview, /<dd>\{state\.label\}<\/dd>/);
  assert.match(overview, /<dd>\{tool\.environment\}<\/dd>/);
  assert.match(overview, /<dd>\{tool\.cost\}<\/dd>/);
});

void test('Sky home icon opens a single overview with the next action', () => {
  assert.match(sky, /aria-haspopup="dialog" onClick=\{\(\) => setInspected\(tool\)\}/);
  assert.match(sky, /<Dialog open=\{inspected !== null\}/);
  assert.match(sky, /state=\{skyToolUiState\(inspected,/);
  assert.match(sky, /手順・提供元を詳しく見る/);
  assert.doesNotMatch(sky, /<ToolCharacterDetails/);
});

void test('third-party marketplace entries come only from the verified public Registry', () => {
  assert.match(marketplace, /\/api\/sky\/tool-registry/);
  assert.match(marketplace, /item\.status === 'verified' && item\.installable === true/);
  assert.match(registry, /WHERE status = 'verified'/);
  assert.match(registry, /r\.decision = 'verified'/);
  assert.match(marketplace, /審査済みは実行・購入・自動接続の完了を意味しません/);
});

void test('Sky Market treats LLMs as MCP-routable marketplace entries', () => {
  assert.equal(skyAiMarketplaceEntries.length, 6);
  assert.ok(skyAiMarketplaceEntries.some((entry) => entry.id === 'local-model'));
  assert.ok(skyAiMarketplaceEntries.every((entry) => entry.mcpRoute.includes('MCP')));
  assert.match(marketplace, /LLM・AIモデル/);
  assert.match(marketplace, /選んだLLMはSky BrokerからMCP Toolを呼び出します/);
  assert.match(marketplace, /接続設定を開く/);
});

void test('Sky Market quotes the explicit ten percent commission without charging at UI stage', () => {
  assert.equal(marketplaceCommissionMinor(10_000), 1_000);
  assert.equal(marketplaceProviderNetMinor(10_000), 9_000);
  assert.match(marketplace, /売上が発生するToolのSky手数料は10%/);
});

void test('browser host detection is conservative and handles desktop-class iPad user agents', () => {
  assert.equal(detectSkyHost('Mozilla/5.0 (Linux; Android 15; Pixel 10)'), 'android');
  assert.equal(detectSkyHost('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)'), 'ios');
  assert.equal(detectSkyHost('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5), 'ios');
  assert.equal(detectSkyHost('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0), 'macos');
  assert.equal(detectSkyHost('Mozilla/5.0 (Windows NT 10.0; Win64; x64)'), 'windows');
  assert.equal(detectSkyHost('Mozilla/5.0 (X11; Linux x86_64)'), 'linux');
  assert.equal(detectSkyHost('Mozilla/5.0 (X11; CrOS x86_64 14588.123.0)'), 'unknown');
  assert.equal(detectSkyHost(''), 'unknown');
});

void test('only confirmed host mismatches are hidden; prerequisites and installation are not inferred', () => {
  assert.equal(catalogHostMismatch({ id: 'jev-router' }, 'android'), 'PC環境が必要');
  assert.equal(catalogHostMismatch({ id: 'jev-router' }, 'macos'), null);
  assert.equal(catalogHostMismatch({ id: 'jev-router' }, 'unknown'), null);
  assert.equal(catalogHostMismatch({ id: 'typesafe-computer-use' }, 'windows'), '隔離したmacOS環境が必要');
  assert.equal(catalogHostMismatch({ id: 'typesafe-computer-use' }, 'macos'), null);
  assert.equal(catalogHostMismatch({ id: 'mobile-jev' }, 'android'), 'PCと別の隔離Android試験端末が必要');
  assert.equal(catalogHostMismatch({ id: 'coconala' }, 'ios'), null);
  assert.equal(catalogHostMismatch({ id: 'fashion-brand-ops' }, 'ios'), null);
  assert.equal(registryHostMismatch(['pc'], 'ios'), 'PC実行のみ対応');
  assert.equal(registryHostMismatch(['pc', 'cloud'], 'ios'), null);
  assert.equal(registryHostMismatch(['device_local'], 'ios'), null);
  assert.equal(registryHostMismatch(['pc'], 'unknown'), null);
  assert.match(marketplace, /対象外も表示/);
  assert.match(marketplace, /必要ソフト・外部アカウント・接続状態は別途確認が必要/);
  assert.match(marketplace, /skyToolDetailActionLabel\(tool\)/);
  assert.equal(skyToolDetailActionLabel(catalog.find((tool) => tool.id === 'jev-router')), '導入条件を見る');
});
