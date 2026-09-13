import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const workspace = readFileSync(resolve(root, 'app/workspace.css'), 'utf8');

const surfaces = {
  workspace: ['.rock-workspace', '.rock-topbar', '.rock-main', '.rock-bottom-note'],
  sky: ['.sky-main-feed', '.sky-feed-post', '.sky-one-tap-connect'],
  chat: ['.sky-chat-simple', '.sky-chat-commandbar', '.sky-chat-bot-board', '.mcp-bot-runner'],
  wallet: ['.wallet-app', '.wallet-balance', '.wallet-transactions'],
  polymarket: [
    '.polymarket-page',
    '.polymarket-shell',
    '.polymarket-heading',
    '.polymarket-empty-state',
    '.polymarket-boundaries',
    '.polymarket-settings-link',
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
