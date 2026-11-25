import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyNoahSurface, decideNoahSurface, noahPlacesForSurface, noahRuntimeDependencies } from '../lib/noah-surface-class.ts';
import { RECIPES } from '../lib/noah-execution-contract.mjs';

void test('面の見分け: 実際の依存の一覧（2026-11-20 に読んだ manifest から）', () => {
  const wants = (dependencies) => classifyNoahSurface({ mouth: 'source', dependencies }).surface;
  assert.equal(wants(['mss', 'playwright', 'agentscope', 'httpx']), 'screen', 'agentscope-ai/QwenPaw');
  assert.equal(wants(['playwright-core', '@anthropic-ai/sdk', 'zod']), 'browser', 'Daisuke134/anicca');
  assert.equal(wants(['adbutils', 'uiautomator2', 'pydantic']), 'own-device', 'google/artemis');
  assert.equal(wants(['litellm', 'prompt_toolkit', 'gitpython', 'tree-sitter']), 'terminal', 'Aider-AI/aider（playwright は任意の依存で、実行時の依存に無い）');
  assert.equal(classifyNoahSurface({ mouth: 'source', imports: ['pyautogui.screenshot', '@nut-tree/nut-js/dist'] }).surface, 'screen');
  assert.equal(classifyNoahSurface({ mouth: 'source', commands: ['/usr/bin/osascript -e "tell app"'] }).surface, 'own-device');
  assert.equal(classifyNoahSurface({ mouth: 'mcp-remote', dependencies: ['pyautogui'] }).surface, 'none', '相手のサーバーで動く物は、本人の端末で何も動かない');
  assert.equal(wants(['my-playwright-helper-docs', 'keyboard-layouts']), 'terminal', '名前の一部が似ているだけの物は当てない');
  assert.match(classifyNoahSurface({ mouth: 'source', dependencies: ['selenium>=4'] }).reasons[0], /^selenium: /);
});

void test('実行時の依存だけを読む: 開発用・任意・別の OS だけの依存で、面を上げない', () => {
  const deps = noahRuntimeDependencies({
    packageJson: JSON.stringify({ dependencies: { zod: '^3' }, devDependencies: { '@playwright/test': '^1' }, optionalDependencies: { robotjs: '^0.6' } }),
    requirementsTxt: 'requests>=2\n# comment\npywin32>=306; sys_platform == "win32"\n-r other.txt\nhttpx[http2]==0.27\n',
    pyprojectToml: '[project]\nname = "x"\ndependencies = [\n  "rich>=13",\n  "pyobjc; sys_platform == \'darwin\'",\n]\n\n[project.optional-dependencies]\nbrowser = ["playwright"]\n',
  });
  assert.deepEqual(deps, ['httpx', 'requests', 'rich', 'zod']);
  assert.equal(classifyNoahSurface({ mouth: 'source', dependencies: deps }).surface, 'terminal');
  assert.deepEqual(noahRuntimeDependencies({ packageJson: '{bad json' }), []);
});

void test('面を決める: 審査済みの実行の定義か、画面の無い環境での 1 往復があれば terminal', () => {
  const decide = (wants, reviewedHeadless, sampleRunOk, mouth = 'source') => decideNoahSurface({ mouth, wants, reviewedHeadless, sampleRunOk });
  assert.deepEqual(decide('screen', true, false), { surface: 'terminal', note: '画面を操作する機能は動きません。' }, '今の 13 件の QwenPaw');
  assert.deepEqual(decide('browser', true, false), { surface: 'terminal', note: 'ブラウザを使う機能は動きません。' });
  assert.deepEqual(decide('browser', false, true), { surface: 'terminal', note: 'ブラウザを使う機能は動きません。' }, '見本の 1 往復が通った');
  assert.deepEqual(decide('terminal', true, false), { surface: 'terminal', note: null });
  assert.deepEqual(decide('browser', false, false), { surface: 'browser', note: null }, '確かめる前は、使おうとする面のまま');
  assert.deepEqual(decide('own-device', false, false), { surface: 'own-device', note: null }, '接続計画が blocked にする');
  assert.deepEqual(decide('screen', false, false, 'mcp-remote'), { surface: 'none', note: null });
  // 今の 13 件は、審査済みの実行の定義なので、全部 terminal
  for (const recipe of Object.values(RECIPES)) assert.equal(decide('screen', true, false).surface, 'terminal', recipe.key);
  assert.deepEqual([noahPlacesForSurface('none'), noahPlacesForSurface('terminal'), noahPlacesForSurface('own-device')], [['provider'], ['home', 'cloud', 'pocket'], []]);
});

void test('PEP 621 の配列を読み、説明・コメント・他のテーブルを分類しない', () => {
  const read = (pyprojectToml) => noahRuntimeDependencies({ pyprojectToml });
  assert.deepEqual(read(`[project] # published package
description = """
dependencies = ["pyautogui"]
[other]
"""
dependencies = ['playwright', "httpx[http2]>=0.27"] # "keyboard"
[project.optional-dependencies]
dependencies = ["mss"]`), ['httpx', 'playwright']);
  assert.deepEqual(read(`[project]
name = "cli"
[tool.example]
dependencies = [
  "adbutils",
]`), []);
  assert.deepEqual(read(`[project]
dependencies = [
  # "pyautogui"
  "rich",
  "mss; python_version < '3.11'",
  'pywin32; sys_platform == "win32"',
]`), ['rich']);
});
