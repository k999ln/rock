// 公式の製品を名乗る、作者の違うインストーラーは、公開の紹介（ホーム・検索・紹介の API・収集機の公開）に出さない（lib/noah-collection.ts）。
// 2026-11-28 に本番のホームの 145 枚目に「claude-code-cli-windows-native-installer」（作者の違う「Claude Code CLI Windows Native Installer」）が出ていた。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NOAH_COLLECTION_IMPERSONATION, noahCollectionBlocked } from '../lib/noah-collection.ts';

const item = (name, summary = '', url = 'https://github.com/example/tool') => ({ name, summary, url });

void test('公式の製品を名乗るインストーラーは載せない', () => {
  for (const blocked of [
    item('claude-code-cli-windows-native-installer', 'Claude Code CLI Windows Native Installer — Anthropic Agentic Terminal, MCP Server & Git',
      'https://github.com/alvarez29985/claude-code-cli-windows-native-installer'),
    item('tool', 'Works offline.', 'https://github.com/someone/claude-code-installer'),
    item('chatgpt-desktop', 'ChatGPT Desktop Installer for Windows'),
    item('cursor-setup', 'Cursor AI installer — free download'),
    item('gemini-setup', 'Gemini CLI installer script for macOS'),
    item('codex-win', 'Codex app native installer for Windows 11'),
  ]) assert.equal(noahCollectionBlocked(blocked), true, `${blocked.name}: ${blocked.summary} ${blocked.url}`);
});

void test('自分の物を入れる道具・道具の追加の手伝い・ふつうの道具は載る', () => {
  for (const allowed of [
    item('@sellable/install', 'One-command installer for Sellable MCP in Claude Code, Codex, and Hermes', 'https://www.npmjs.com/package/@sellable/install'),
    item('mcp-installer', 'Install MCP servers into Claude Desktop with one command.'),
    item('plugins', 'Claude Code plugin installer and marketplace browser.'),
    item('Captae', 'Local media downloader and library for macOS, Windows and Linux, with a browser extension and an MCP server.'),
    item('claude-code', 'Claude Code is an agentic coding tool that lives in your terminal.', 'https://github.com/anthropics/claude-code'),
    item('installer-kit', 'Build Windows installers (MSI) for your own Electron apps.'),
  ]) assert.equal(noahCollectionBlocked(allowed), false, `${allowed.name}: ${allowed.summary}`);
  assert.equal(NOAH_COLLECTION_IMPERSONATION.test('installer'), false, '「インストーラー」だけでは外さない');
});

void test('掲載中の 212 系列の説明は、どれも外れない', () => {
  const listed = JSON.parse(readFileSync(new URL('../data/noah-summary-ja.json', import.meta.url), 'utf8'));
  for (const [id, { summary }] of Object.entries(listed.series)) assert.equal(NOAH_COLLECTION_IMPERSONATION.test(`${id} ${summary}`), false, id);
});
