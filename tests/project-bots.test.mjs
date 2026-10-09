import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
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

import { buildRequestPlan } from '../scripts/amc-request-plan.mjs';
import { applyGoalEvent, compileGoal } from '../scripts/amc-goal-engine.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const prepare = async () => ({
  directory: '/fixture/run',
  contextPath: '/fixture/run/context.json',
  goalPath: '/fixture/run/amc-goal-r0.json',
  amcState: 'draft',
});

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
      prepare,
      launch: (command, args, options) => {
        calls++;
        assert.equal(command, 'codex');
        assert.equal(args[0], '--cd');
        assert.match(args[4], /Git調査資料: \/fixture\/run\/context.json/);
        assert.match(args[4], /AMC指示書: \/fixture\/run\/amc-goal-r0.json/);
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
    runBot({ id: 'sky', goal: '表示' }, { interactive: true, prepare, launch }),
    /ENOENT/,
  );
  const result = await runBot(
    { id: 'sky', goal: '表示' },
    {
      interactive: true,
      prepare,
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

void test('Git collection failure never starts a worker', async () => {
  await assert.rejects(
    runBot(
      { id: 'sky', goal: '接続表示' },
      {
        interactive: true,
        prepare: async () => {
          throw new Error('Git lookup failed');
        },
        launch: () => assert.fail('must not spawn'),
      },
    ),
    /Git lookup failed/,
  );
});

function inputGoalFixture(t) {
  const directory = mkdtempSync(resolve(tmpdir(), 'rock-bot-input-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const definition = buildRequestPlan({
    request: 'AMCの引継ぎを試す',
    goal: '入力JSONを一度読み込んで担当Botへ渡す',
    intent: '利用者の指示と版を保つ',
    planId: 'synthetic-launch',
    createdAt: '2026-10-09T00:00:00Z',
  });
  const draft = compileGoal({
    ...definition,
    instruction: definition.brief.goal,
    squadIds: definition.mission.squads.map((squad) => squad.id),
    goalId: 'synthetic-launch',
    createdAt: '2026-10-09T00:00:00Z',
  });
  draft.requestBrief = definition.brief;
  const goal = applyGoalEvent(draft, {
    id: 'synthetic-approval',
    type: 'approve_plan',
    expectedRevision: 0,
    actor: 'synthetic-owner',
    role: 'owner',
    scopeConfirmed: true,
    coverageStatement: definition.coverage,
    acceptanceCriteria: definition.acceptanceCriteria,
  });
  const path = resolve(directory, 'input.json');
  const raw = JSON.stringify(goal, null, 2) + '\n';
  writeFileSync(path, raw);
  return { path, raw, goal };
}

void test('goal-file syntax is allowed only for run and prepare and cannot replace imported instructions or tasks', () => {
  for (const command of ['run', 'prepare']) {
    assert.deepEqual(
      parseBotArgs([command, 'operations', '--goal-file', 'existing.json']),
      {
        command,
        id: 'operations',
        goalFile: 'existing.json',
      },
    );
  }
  assert.deepEqual(
    parseBotArgs(['run', 'sky', '--goal-file', 'existing.json', '--preview']),
    {
      command: 'run',
      id: 'sky',
      goalFile: 'existing.json',
      preview: true,
    },
  );
  for (const args of [
    ['run', 'sky', '--goal-file'],
    ['run', 'sky', '--goal-file', 'one.json', '--goal-file', 'two.json'],
    ['run', 'sky', '--goal-file', 'existing.json', '--goal', 'replacement'],
    ['run', 'sky', '--goal-file', 'existing.json', '--task', 'SKY07-01'],
    ['prepare', 'sky', '--goal-file', 'existing.json', '--preview'],
    ['show', 'sky', '--goal-file', 'existing.json'],
    [
      'plan',
      'sky',
      '--goal-file',
      'existing.json',
      '--task',
      'SKY07-01',
      '--out',
      'new.json',
    ],
  ])
    assert.throws(() => parseBotArgs(args));
});

void test('goal-file preview reads existing Goal without preparing Git or starting a model', async (t) => {
  const { path, raw, goal } = inputGoalFixture(t);
  const result = await runBot(
    { id: 'operations', goalFile: path, preview: true },
    {
      interactive: false,
      prepare: () => assert.fail('preview must not collect Git'),
      launch: () => assert.fail('preview must not spawn'),
    },
  );
  assert.equal(result.started, false);
  assert.equal(result.githubSaved, false);
  assert.ok(result.args[4].includes(goal.instruction));
  assert.match(result.args[4], /Goal ID: synthetic-launch \/ revision: 1/);
  assert.match(result.args[4], /本人認証・検収の証明ではありません/);
  assert.equal(readFileSync(path, 'utf8'), raw);
});

void test('goal-file launch passes one immutable loaded snapshot through preparation and native argv', async (t) => {
  const { path, raw, goal } = inputGoalFixture(t);
  let preparedInput;
  let calls = 0;
  const result = await runBot(
    { id: 'operations', goalFile: path },
    {
      interactive: true,
      prepare: async (input) => {
        preparedInput = input;
        assert.equal(input.goal, goal.instruction);
        assert.equal(input.taskId, undefined);
        assert.equal(input.inputGoal.raw, raw);
        assert.deepEqual(input.inputGoal.value, goal);
        writeFileSync(path, 'input changed after initial read');
        return {
          directory: '/fixture/import',
          contextPath: '/fixture/import/context.json',
          goalPath: '/fixture/import/amc-goal-r1.json',
          instructionPath: '/fixture/import/amc-instructions.md',
          amcState: 'active',
          botStarted: false,
        };
      },
      launch: (command, args, options) => {
        calls++;
        assert.equal(command, 'codex');
        assert.deepEqual(options, { stdio: 'inherit', shell: false });
        assert.ok(args[4].includes(goal.instruction));
        assert.match(args[4], /Goal ID: synthetic-launch \/ revision: 1/);
        assert.ok(args[4].includes(preparedInput.inputGoal.sha256));
        assert.match(args[4], /AMC指示書: \/fixture\/import\/amc-goal-r1.json/);
        assert.match(
          args[4],
          /実行用プロンプト: \/fixture\/import\/amc-instructions.md/,
        );
        assert.equal(
          args[4].includes('input changed after initial read'),
          false,
        );
        const child = new EventEmitter();
        queueMicrotask(() => child.emit('exit', 0, null));
        return child;
      },
    },
  );
  assert.equal(calls, 1);
  assert.equal(result.exitCode, 0);
  assert.equal(result.acceptance, 'process_exit_is_not_pr_or_task_acceptance');
});

void test('invalid goal-file fails before any preparation or model launch', async (t) => {
  const { path } = inputGoalFixture(t);
  writeFileSync(path, '{ invalid input');
  await assert.rejects(
    runBot(
      { id: 'operations', goalFile: path },
      {
        interactive: true,
        prepare: () => assert.fail('invalid input must not collect Git'),
        launch: () => assert.fail('invalid input must not spawn'),
      },
    ),
    /有効なJSON/,
  );
});
