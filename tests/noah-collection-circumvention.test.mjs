// 利用規約やライセンスをすり抜ける道具は、公開の紹介（ホーム・検索・紹介の API）に出さない（lib/noah-collection.ts）。
// 2026-11-28 に本番のホームの 59 枚目に「Claude Code — Claude Code Pro Trial Reset & Machine ID」、74 枚目に「Codex Roblox Script Executor」が出ていた。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NOAH_COLLECTION_CIRCUMVENTION, noahCollectionBlocked } from '../lib/noah-collection.ts';

const item = (name, summary = '', url = 'https://github.com/example/tool') => ({ name, summary, url });

void test('試用のリセット・機械 ID の書き換え・クラック・キー生成・ゲームの不正の実行器・定額の契約を API に変える中継は載せない', () => {
  for (const blocked of [
    item('claude-code-desktop-suite', 'Claude Code — Claude Code Pro Trial Reset & Machine ID'),
    item('cursor-helper', 'Reset the machine ID so the free trial starts again.'),
    item('ide-tool', 'Machine ID changer for desktop IDEs.'),
    item('keygen-pro', 'A keygen for paid plugins.'),
    item('app-store', 'Download cracked apps and cracked software.'),
    item('activator', 'License bypass for design tools.'),
    item('某工具', 'IDE 破解与无限试用'),
    item('tool', 'Works offline.', 'https://github.com/someone/trial-reset'),
    item('codex-luau-workspace', 'Codex Executor — Codex Roblox Script Executor'),
    item('celery-executor-roblox', 'Celery script-runner Roblox V3 — Windows PC LuaU Script Injector & Decompiler'),
    item('fps-helper', 'Aimbot for CS2 with a clean overlay.'),
    item('ocp', 'Turn your Claude Pro/Max subscription into an OpenAI-compatible API for your IDEs and devices.'),
  ]) assert.equal(noahCollectionBlocked(blocked), true, `${blocked.name}: ${blocked.summary} ${blocked.url}`);
});

void test('ふつうの道具は今までどおり載る（機械学習・パスワードの再設定・試用の案内・ひび割れの検出など）', () => {
  for (const allowed of [
    item('ml-kit', 'Machine learning toolkit for agents.'),
    item('auth', 'Reset a forgotten password and verify the machine identity of a device.'),
    item('saas', 'Start a free trial of the Pro plan, then pick a license.'),
    item('inspect', 'Detect cracked concrete and road cracks from photos.'),
    item('roblox-stats', 'Roblox game analytics dashboard for creators.'),
    item('scanner', 'Exploit detection for web apps and APIs.'),
    item('fivem-admin', 'FiveM server admin panel.'),
    item('openai-proxy', 'Use your own OpenAI API key with a local proxy for team usage limits.'),
    item('plans', 'Compare Claude Pro and ChatGPT Plus plans side by side.'),
    item('Discond', 'UAE restaurant picks and live discounts across Fazaa, The Entertainer, Talabat and more.'),
  ]) assert.equal(noahCollectionBlocked(allowed), false, `${allowed.name}: ${allowed.summary}`);
  assert.equal(NOAH_COLLECTION_CIRCUMVENTION.test('machine id'), false, '「機械 ID」だけでは外さない');
});

void test('掲載中の 212 系列の説明は、どれも外れない', () => {
  const listed = JSON.parse(readFileSync(new URL('../data/noah-summary-ja.json', import.meta.url), 'utf8'));
  for (const [id, { summary }] of Object.entries(listed.series)) {
    assert.equal(noahCollectionBlocked(item(id, summary, '')), false, id);
  }
});

void test('ホームの一覧・紹介の API・収集機の公開は、同じ決まりで外す', () => {
  for (const file of ['../lib/noah-agent-directory.ts', '../lib/noah-collection-api.ts', '../scripts/noah-collector-publish.mjs']) {
    assert.match(readFileSync(new URL(file, import.meta.url), 'utf8'), /noahCollectionBlocked\(/, file);
  }
});
