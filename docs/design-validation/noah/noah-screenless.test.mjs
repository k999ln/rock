// 画面を取らない: リポジトリにある本物の起動引数の検査と、面の見分けの検証。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { auditNoahContainerArgs, auditNoahVmArgs, classifyNoahSurface, decideNoahSurface, noahPlacesForSurface, noahRuntimeDependencies } from '../../contracts/noah-screenless-v1.ts';
import { containerArgs } from '../../../scripts/noah-isolated-runtime.mjs';
import { terminalContainerArgs } from '../../../scripts/noah-terminal-runtime.mjs';
import { RECIPES } from '../../../lib/noah-execution-contract.mjs';
import { TERMINAL_SURFACE } from '../../../lib/noah-terminal-contract.mjs';

const VOLUME = 'noah-terminal-00000000-0000-0000-0000-000000000000';
const run = () => terminalContainerArgs('noah-terminal-run-x', 'image', VOLUME, { root: '' }, 'main.py', 'python');

test('今の main の起動引数は、検査を通る', () => {
  for (const recipe of Object.values(RECIPES)) assert.deepEqual(auditNoahContainerArgs(containerArgs('noah-run-x', 'image', recipe)), [], recipe.key);
  assert.deepEqual(auditNoahContainerArgs(run()), []);
  assert.deepEqual(auditNoahContainerArgs(terminalContainerArgs('noah-stage-x', 'image', VOLUME, { root: '' }, 'main.mjs', 'node', true), { stage: true }), []);
  assert.deepEqual(TERMINAL_SURFACE, { schema: 'noah-isolation/1', mode: 'headless', hostDesktop: false, hostFiles: false, hostBrowser: false, network: 'none' });
  // VM の起動引数は関数の中にあるので、ソースから読む（task 84 で、引数を返す関数を export する）
  const source = readFileSync(new URL('../../../scripts/noah-isolated-runtime.mjs', import.meta.url), 'utf8');
  const vm = /runCommand\('colima', \[([^\]]+)\]/.exec(source)[1].split(',').map((s) => s.trim().replace(/^'|'$/g, ''));
  assert.equal(vm[0], 'start');
  assert.deepEqual(auditNoahVmArgs(vm), []);
});

test('起動引数を緩めた変更は、検査で落ちる', () => {
  const tamper = (edit) => { const args = run(); edit(args); return auditNoahContainerArgs(args); };
  const insert = (...extra) => (args) => args.splice(args.indexOf('image'), 0, ...extra);
  const c = (name, change, expected) => ({ name, change, expected });
  const cases = [
    c('画面を渡す', insert('--env', 'DISPLAY=:0'), /DISPLAY/),
    c('画面の空の上書きを消す', (args) => args.splice(args.indexOf('DISPLAY=') - 1, 2), null),   // 消すだけなら違反ではない（渡していない）
    c('host のフォルダを mount', insert('-v', '/Users/me:/host'), /host の mount/),
    c('bind mount', insert('--mount', 'type=bind,src=/Users/me,dst=/host'), /host の mount/),
    c('host の network', (args) => { args[args.indexOf('--network') + 1] = 'host'; }, /--network none/),
    c('network の指定を消す', (args) => args.splice(args.indexOf('--network'), 2), /--network none/),
    c('特権', insert('--privileged'), /--privileged/),
    c('装置を渡す', insert('--device', '/dev/snd'), /--device/),
    c('権限を足す', insert('--cap-add', 'SYS_ADMIN'), /--cap-add/),
    c('root で動かす', (args) => { args[args.indexOf('--user') + 1] = '0:0'; }, /root/),
    c('読み取り専用を外す', (args) => args.splice(args.indexOf('--read-only'), 1), /--read-only/),
    c('docker の socket を渡す', insert('--mount', 'type=volume,src=x,dst=/var/run/docker.sock'), /docker\.sock/),
    c('X11 の socket を渡す', insert('--tmpfs', '/tmp/.X11-unix'), /X11/),
    c('port を開ける', insert('-p', '8080:8080'), /-p/),
    c('重さの上限を外す', (args) => args.splice(args.indexOf('--memory'), 2), /--memory/),
    c('音を渡す', insert('--env', 'PULSE_SERVER=unix:/run/pulse'), /PULSE_SERVER/),
  ];
  for (const { name, change, expected } of cases) {
    const violations = tamper(change);
    if (expected === null) assert.deepEqual(violations, [], name);
    else assert.ok(violations.some((v) => expected.test(v)), `${name}: ${JSON.stringify(violations)}`);
  }
  assert.ok(auditNoahVmArgs(['start', 'noah-exec', '--mount', '/Users/me:w']).length > 0, 'VM に host のファイルを見せる');
  assert.ok(auditNoahVmArgs(['start', 'noah-exec', '--mount', 'none', '--network-address']).length > 0);
  assert.deepEqual(auditNoahVmArgs(['start', 'noah-exec', '--mount', 'none', '--network-address=false']), []);
});

test('面の見分け: 実際の依存の一覧（2026-11-20 に読んだ manifest から）', () => {
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

test('実行時の依存だけを読む: 開発用・任意・別の OS だけの依存で、面を上げない', () => {
  const deps = noahRuntimeDependencies({
    packageJson: JSON.stringify({ dependencies: { zod: '^3' }, devDependencies: { '@playwright/test': '^1' }, optionalDependencies: { robotjs: '^0.6' } }),
    requirementsTxt: 'requests>=2\n# comment\npywin32>=306; sys_platform == "win32"\n-r other.txt\nhttpx[http2]==0.27\n',
    pyprojectToml: '[project]\nname = "x"\ndependencies = [\n  "rich>=13",\n  "pyobjc; sys_platform == \'darwin\'",\n]\n\n[project.optional-dependencies]\nbrowser = ["playwright"]\n',
  });
  assert.deepEqual(deps, ['httpx', 'requests', 'rich', 'zod']);
  assert.equal(classifyNoahSurface({ mouth: 'source', dependencies: deps }).surface, 'terminal');
  assert.deepEqual(noahRuntimeDependencies({ packageJson: '{bad json' }), []);
});

test('面を決める: 審査済みの実行の定義か、画面の無い環境での 1 往復があれば terminal', () => {
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
