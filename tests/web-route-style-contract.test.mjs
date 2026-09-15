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
  workspace: ['.rock-workspace', '.rock-topbar', '.rock-main', '.rock-bottom-note'],
  sky: ['.sky-main-feed', '.sky-feed-post', '.sky-one-tap-connect'],
  chat: ['.sky-chat-simple', '.sky-chat-commandbar', '.sky-chat-bot-board', '.mcp-bot-runner'],
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

void test('module-styled home and settings keep their stylesheet bindings', () => {
  const home = readFileSync(resolve(root, 'components/home-screen.tsx'), 'utf8');
  const settings = readFileSync(resolve(root, 'components/system-settings.tsx'), 'utf8');
  assert.match(home, /from '\.\/home-screen\.module\.css'/);
  assert.match(settings, /from '\.\/system-settings\.module\.css'/);
});

void test('OS home exposes every primary workspace without fake device telemetry', () => {
  const home = readFileSync(resolve(root, 'components/home-screen.tsx'), 'utf8');
  const homeStyles = readFileSync(resolve(root, 'components/home-screen.module.css'), 'utf8');
  for (const route of ['/sky', '/chat', '/work', '/csv', '/wallet', '/market', '/settings']) {
    assert.match(home, new RegExp(`href: '${route}'`), `${route} is missing from the OS home`);
  }
  assert.match(home, /WEB \/ LOCAL/);
  assert.doesNotMatch(home, /BatteryFull|\bWifi\b|\bSignal\b/);
  assert.match(home, /closeOnEscape/);
  assert.match(home, /localStorage\.setItem/);
  assert.match(homeStyles, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
});

void test('workspace shell exposes nested route and running-state affordances', () => {
  const shell = readFileSync(resolve(root, 'components/workspace-shell.tsx'), 'utf8');
  assert.match(shell, /function isCurrentRoute/);
  assert.match(shell, /pathname\.startsWith\(`\$\{href\}\/`\)/);
  assert.match(shell, /aria-disabled=\{running \|\| undefined\}/);
  assert.match(workspace, /data-running='true'/);
});

void test('every non-home route family keeps a direct home affordance', () => {
  const contracts = [
    ['workspace shell', 'components/workspace-shell.tsx', /className="rock-home-link"[\s\S]{0,120}aria-label="ホームへ戻る"/],
    ['mobile chat command bar', 'components/sky-chat-workspace.tsx', /<Link href="\/" aria-label="ホームへ戻る"/],
    ['settings', 'components/system-settings.tsx', /<Link href="\/" aria-label="ホームへ戻る"/],
    ['system maintenance', 'components/system-maintenance.tsx', /<Link href="\/" aria-label="ホームへ戻る"/],
    ['automation fund', 'app/fund/page.tsx', /<Link href="\/">⌂ ホーム<\/Link>/],
    ['legacy fund', 'app/fund/legacy/page.tsx', /<Link href="\/">⌂ ホーム<\/Link>/],
    ['developer preview', 'app/rockstaros/page.tsx', /<Link href="\/" className=\{styles\.brand\} aria-label="ホームへ戻る"/],
    ['preview guide', 'app/rockstaros/guide/page.tsx', /<Link href="\/" className=\{styles\.brand\} aria-label="ホームへ戻る"/],
    ['rock studio', 'components/rock-studio.tsx', /<Link href="\/" className="studio-wordmark" aria-label="ホームへ戻る"/],
  ];
  for (const [name, path, pattern] of contracts) {
    const source = readFileSync(resolve(root, path), 'utf8');
    assert.match(source, pattern, `${name} lost its direct Home route`);
  }
});
