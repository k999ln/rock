// 画面を取らない: リポジトリにある本物の起動引数の検査。
import test from 'node:test';
import assert from 'node:assert/strict';
import { auditNoahContainerArgs, auditNoahVmArgs } from '../lib/noah-screenless-audit.mjs';
import { containerArgs, engineArgs } from '../scripts/noah-isolated-runtime.mjs';
import { terminalContainerArgs } from '../scripts/noah-terminal-runtime.mjs';
import { RECIPES } from '../lib/noah-execution-contract.mjs';
import { TERMINAL_SURFACE } from '../lib/noah-terminal-contract.mjs';

const VOLUME = 'noah-terminal-00000000-0000-0000-0000-000000000000';
const run = () => terminalContainerArgs('noah-terminal-run-x', 'image', VOLUME, { root: '' }, 'main.py', 'python');

void test('今の main の起動引数は、検査を通る', () => {
  for (const recipe of Object.values(RECIPES)) assert.deepEqual(auditNoahContainerArgs(containerArgs('noah-run-x', 'image', recipe)), [], recipe.key);
  assert.deepEqual(auditNoahContainerArgs(run()), []);
  assert.deepEqual(auditNoahContainerArgs(terminalContainerArgs('noah-run-node', 'image', VOLUME, { root: '' }, 'main.mjs', 'node')), []);
  assert.deepEqual(auditNoahContainerArgs(terminalContainerArgs('noah-stage-x', 'image', VOLUME, { root: '' }, 'main.mjs', 'node', true), { stage: true }), []);
  assert.deepEqual(TERMINAL_SURFACE, { schema: 'noah-isolation/1', mode: 'headless', hostDesktop: false, hostFiles: false, hostBrowser: false, network: 'none' });
  const vm = engineArgs();
  assert.equal(vm[0], 'start');
  assert.deepEqual(auditNoahVmArgs(vm), []);
});

void test('起動引数を緩めた変更は、検査で落ちる', () => {
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

