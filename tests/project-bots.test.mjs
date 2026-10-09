import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  buildBotLaunch,
  parseBotArgs,
  projectBots,
  renderBot,
  runBot,
  syncBots,
} from '../scripts/project-bots.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

void test('project profiles cover existing squads, reference real paths and match native Codex definitions', () => {
  const bots = syncBots({ check: true });
  const mission = JSON.parse(
    readFileSync(resolve(root, 'data/mission-control.json'), 'utf8'),
  );
  const covered = new Set(bots.flatMap((bot) => bot.squads));
  assert.deepEqual(
    [...covered].sort((a, b) => a.localeCompare(b)),
    mission.squads.map((squad) => squad.id).sort((a, b) => a.localeCompare(b)),
  );
  for (const bot of bots) {
    const config = readFileSync(
      resolve(root, `.codex/agents/${bot.id}-bot.toml`),
      'utf8',
    );
    assert.equal(config, renderBot(bot));
    assert.deepEqual(
      config
        .split('\n')
        .filter((line) => /^\w+ = /.test(line))
        .map((line) => line.split(' = ')[0]),
      ['name', 'description', 'developer_instructions'],
    );
  }
});

void test('launch preserves literal user input and inherits model, credentials and permissions', () => {
  const goal =
    '接続表示を改善する; $(touch /tmp/unwanted) `whoami`\n引用 "保持"';
  const args = buildBotLaunch({ id: 'sky', goal });
  assert.deepEqual(args.slice(0, 3), ['--cd', root, '-c']);
  assert.equal(args.length, 5);
  assert.ok(args[4].endsWith(goal));
  const instructions = JSON.parse(
    args[3].slice('developer_instructions='.length),
  );
  assert.match(instructions, /Sky Bot/);
  assert.match(instructions, /taskAssignments/);
  assert.match(instructions, /mainへの直接commit、force push/);
});

void test('explicit tasks retain canonical assignment, prerequisites and inherited execution holds', () => {
  const sky = buildBotLaunch({
    id: 'sky',
    goal: 'このtaskを進める',
    taskId: 'SKY07-01',
  });
  assert.match(sky[4], /担当: O4/);
  assert.match(sky[4], /合格条件/);
  const wallet = buildBotLaunch({
    id: 'wallet',
    goal: '条件を読む',
    taskId: 'WLT06',
  });
  assert.match(wallet[4], /実行保留:/);
  assert.match(wallet[4], /解除条件:/);
  assert.throws(
    () => buildBotLaunch({ id: 'wallet', goal: '変更', taskId: 'SKY07-01' }),
    /範囲外/,
  );
  assert.throws(
    () => buildBotLaunch({ id: 'sky', goal: '変更', taskId: 'UNKNOWN' }),
    /範囲外/,
  );
});

void test('preview never starts a model or claims GitHub output', async () => {
  const result = await runBot(
    { id: 'sky', goal: '接続表示', preview: true },
    { interactive: false, launch: () => assert.fail('must not spawn') },
  );
  assert.equal(result.command, 'codex');
  assert.equal(result.started, false);
  assert.equal(result.githubSaved, false);
});

void test('noninteractive launch fails before spawning rather than bypassing approvals', async () => {
  await assert.rejects(
    runBot(
      { id: 'sky', goal: '接続表示' },
      { interactive: false, launch: () => assert.fail('must not spawn') },
    ),
    /Botは未起動/,
  );
});

void test('real launch interface uses argv, no shell; process exit does not certify task or PR', async () => {
  let calls = 0;
  const result = await runBot(
    { id: 'sky', goal: '接続表示' },
    {
      interactive: true,
      launch: (command, args, options) => {
        calls++;
        assert.equal(command, 'codex');
        assert.equal(args[0], '--cd');
        assert.deepEqual(options, { stdio: 'inherit', shell: false });
        const child = new EventEmitter();
        queueMicrotask(() => child.emit('exit', 7, null));
        return child;
      },
    },
  );
  assert.equal(calls, 1);
  assert.equal(result.exitCode, 7);
  assert.equal(result.acceptance, 'process_exit_is_not_pr_or_task_acceptance');
});

void test('missing CLI and termination are propagated without success claims', async () => {
  const launch = () => {
    const child = new EventEmitter();
    queueMicrotask(() => child.emit('error', new Error('ENOENT')));
    return child;
  };
  await assert.rejects(
    runBot({ id: 'sky', goal: '表示' }, { interactive: true, launch }),
    /ENOENT/,
  );
  const result = await runBot(
    { id: 'sky', goal: '表示' },
    {
      interactive: true,
      launch: () => {
        const child = new EventEmitter();
        queueMicrotask(() => child.emit('exit', null, 'SIGTERM'));
        return child;
      },
    },
  );
  assert.notEqual(result.exitCode, 0);
  assert.equal(result.signal, 'SIGTERM');
});

void test('invalid requests cannot add CLI permission overrides or select unknown bots', () => {
  assert.deepEqual(
    parseBotArgs(['run', 'sky', '--goal', '表示', '--preview']),
    { command: 'run', id: 'sky', goal: '表示', preview: true },
  );
  for (const args of [
    ['run', 'sky', '--yolo'],
    ['show', 'sky', '--preview'],
    ['run', 'sky', '--goal'],
    ['run', 'sky', '--goal', '一', '--goal', '二'],
  ])
    assert.throws(() => parseBotArgs(args));
  assert.throws(
    () => buildBotLaunch({ id: 'unknown', goal: '表示' }),
    /ありません/,
  );
  for (const goal of ['', '   ', 'x'.repeat(16001)])
    assert.throws(() => buildBotLaunch({ id: 'sky', goal }), /16000/);
  assert.ok(projectBots().some((bot) => bot.id === 'sky'));
});
