import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  existsSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import {
  collectBotContext,
  createBotPlan,
  prepareBotWork,
  saveBotPlan,
} from '../scripts/project-bot-context.mjs';
import { applyGoalEvent, validateGoal } from '../scripts/amc-goal-engine.mjs';

function fixture(t) {
  const repo = mkdtempSync(resolve(tmpdir(), 'rock-bot-context-'));
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  for (const path of ['data', 'code', 'docs']) mkdirSync(resolve(repo, path));
  const bot = {
    id: 'sky',
    squads: ['O4'],
    paths: ['code/'],
    guides: ['docs/sky.md'],
  };
  const taskIds = ['BASE', 'PARENT', 'CHILD', 'OTHER'];
  const project = {
    updatedAt: 'fixture',
    tasks: taskIds.map((id) => ({
      id,
      title: id,
      status: id === 'BASE' ? 'done' : 'planned',
      dependsOn: ['PARENT', 'CHILD'].includes(id) ? ['BASE'] : [],
      evidence: ['docs/sky.md'],
      ...(id === 'CHILD' ? { parentTaskId: 'PARENT' } : {}),
    })),
  };
  const mission = {
    updatedAt: 'fixture',
    globalRules: ['fixture only'],
    squads: ['O4', 'O5'].map((id) => ({
      id,
      name: id,
      goal: id,
      rules: [],
      acceptanceGate: 'evidence',
      nextTaskIds: [id === 'O4' ? 'PARENT' : 'OTHER'],
    })),
    taskAssignments: taskIds.map((taskId) => ({
      taskId,
      primarySquad: taskId === 'OTHER' ? 'O5' : 'O4',
      classification: 'shared_system',
    })),
    taskPlans: taskIds.map((taskId) => ({
      taskId,
      scope: taskId,
      workloadClass: 'code_test',
      inputs: [],
      steps: [],
      deliverables: [
        { path: `docs/${taskId}.md`, description: 'fixture output' },
      ],
      acceptanceCriteria: [
        {
          id: `${taskId}-AC`,
          criterion: 'inspect actual file',
          verification: 'read file',
          status: 'not_verified',
          evidence: [],
        },
      ],
    })),
    executionHolds: [
      {
        id: 'hold',
        taskIds: ['PARENT'],
        scope: 'external operation',
        reason: 'not approved',
        releaseCondition: 'actual approval',
        decisionOwner: 'OWNER',
      },
    ],
  };
  const put = (path, value) =>
    writeFileSync(
      resolve(repo, path),
      typeof value === 'string' ? value : JSON.stringify(value),
    );
  put('data/mission-control.json', mission);
  put('data/project-status.json', project);
  put('code/sky.mjs', 'export const sky = true;\n');
  put('docs/sky.md', '# Sky fixture\n');
  put('.gitignore', '/work/\n');
  const git = (args) =>
    execFileSync('git', args, {
      cwd: repo,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  git(['init', '-q']);
  git(['add', '.']);
  git([
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '-qm',
    'Synthetic fixture',
  ]);
  const head = git(['rev-parse', 'HEAD']);
  const metadata = {
    repository: 'k999ln/rock',
    liveMetadataVerified: true,
    sourceReviewComplete: false,
    local: { head, branch: 'fixture', dirty: false },
    main: head,
    checks: [{ sha: head, state: 'NO_CHECKS', checks: [] }],
  };
  return {
    repo,
    bot,
    metadata,
    collect: async () => structuredClone(metadata),
  };
}

void test('plan selects the requested canonical task and preserves prerequisites, parent holds and unapproved state', (t) => {
  const { repo, bot } = fixture(t);
  const before = readFileSync(
    resolve(repo, 'data/mission-control.json'),
    'utf8',
  );
  const plan = createBotPlan({
    repo,
    bot,
    goal: 'Fix the Sky fixture',
    taskId: 'CHILD',
  });
  assert.deepEqual(validateGoal(plan), { ok: true, errors: [] });
  assert.deepEqual(plan.rootTaskIds, ['CHILD']);
  assert.ok(plan.tasks.some((task) => task.id === 'BASE'));
  assert.equal(
    plan.tasks.find((task) => task.id === 'CHILD').holds[0].id,
    'hold',
  );
  assert.equal(plan.state, 'draft');
  assert.equal(plan.approval, null);
  assert.equal(plan.revision, 0);
  assert.equal(plan.overallAcceptance.accepted, false);
  assert.equal(plan.sourceFiles.length, 2);
  assert.equal(
    readFileSync(resolve(repo, 'data/mission-control.json'), 'utf8'),
    before,
  );
  assert.throws(
    () => createBotPlan({ repo, bot, goal: 'fix', taskId: 'OTHER' }),
    /担当範囲内/,
  );
  assert.throws(
    () =>
      applyGoalEvent(plan, {
        id: 'start',
        type: 'start_task',
        taskId: 'CHILD',
        actor: 'worker',
        role: 'worker',
        expectedRevision: 0,
      }),
    /Approved active plan/,
  );
});

void test('Git collection records immutable scoped blobs and history without converting metadata or absent CI to acceptance', async (t) => {
  const { repo, bot, collect } = fixture(t);
  const context = await collectBotContext({ repo, bot }, { collect });
  assert.deepEqual(
    context.codeIndex.files.map((file) => file.path),
    ['code/sky.mjs', 'docs/sky.md'],
  );
  assert.ok(
    context.codeIndex.files.every((file) => /^[a-f0-9]{40}$/.test(file.object)),
  );
  assert.match(context.recentScopedHistory[0], /Synthetic fixture/);
  assert.equal(context.sourceReviewComplete, false);
  assert.equal(context.git.checks[0].state, 'NO_CHECKS');
  assert.equal(
    context.tasks.some((task) => task.id === 'OTHER'),
    false,
  );
  assert.equal(context.sourceMode, 'working_tree_with_hashes');
});

void test('offline or changed-head metadata fails before creating preparation artifacts', async (t) => {
  const { repo, bot, metadata } = fixture(t);
  for (const modified of [
    { ...metadata, liveMetadataVerified: false },
    { ...metadata, local: { ...metadata.local, head: '0'.repeat(40) } },
  ]) {
    await assert.rejects(
      prepareBotWork(
        { repo, bot, goal: 'fix' },
        { collect: async () => modified },
      ),
    );
  }
  assert.equal(existsSync(resolve(repo, 'work')), false);
});

void test('prepare persists Git provenance and a valid AMC draft; no task means Bot must select from source', async (t) => {
  const { repo, bot, collect } = fixture(t);
  const prepared = await prepareBotWork(
    { repo, bot, goal: 'fix Sky', taskId: 'CHILD' },
    { collect },
  );
  assert.equal(prepared.amcState, 'draft');
  assert.equal(prepared.botStarted, false);
  assert.equal(
    JSON.parse(readFileSync(prepared.goalPath, 'utf8')).instruction,
    'fix Sky',
  );
  assert.equal(
    JSON.parse(readFileSync(prepared.contextPath, 'utf8')).sourceReviewComplete,
    false,
  );
  assert.equal(
    readFileSync(resolve(prepared.directory, 'request.md'), 'utf8'),
    'fix Sky\n',
  );
  const next = await prepareBotWork(
    { repo, bot, goal: 'new feature' },
    { collect },
  );
  assert.notEqual(next.directory, prepared.directory);
  assert.equal(next.goalPath, null);
  assert.equal(next.amcState, 'awaiting_bot_task_selection');
});

void test('plan output uses a new file and cannot overwrite an existing artifact or symlink target', (t) => {
  const { repo, bot } = fixture(t);
  const input = { repo, bot, goal: 'fix Sky', taskId: 'CHILD' };
  const result = saveBotPlan(input, 'goal.json');
  assert.equal(result.state, 'draft');
  const before = readFileSync(result.goalPath, 'utf8');
  assert.throws(() => saveBotPlan(input, 'goal.json'), /EEXIST/);
  symlinkSync(result.goalPath, resolve(repo, 'link.json'));
  assert.throws(() => saveBotPlan(input, 'link.json'), /EEXIST/);
  assert.equal(readFileSync(result.goalPath, 'utf8'), before);
});

void test('a redirected work directory is rejected before creating files outside the repository', async (t) => {
  const { repo, bot, collect } = fixture(t);
  const outside = mkdtempSync(resolve(tmpdir(), 'rock-bot-outside-'));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  symlinkSync(outside, resolve(repo, 'work'));
  await assert.rejects(
    prepareBotWork({ repo, bot, goal: 'fix' }, { collect }),
    /symlink/,
  );
  assert.equal(existsSync(resolve(outside, 'project-bots')), false);
});
