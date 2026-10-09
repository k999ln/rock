import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash, randomUUID } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { compileGoal, validateGoal } from './amc-goal-engine.mjs';

const execute = promisify(execFile);
const digest = (text) => createHash('sha256').update(text).digest('hex');
const json = (value) => JSON.stringify(value, null, 2) + '\n';
const sourcePaths = ['data/mission-control.json', 'data/project-status.json'];

export function botPlanSources(repo) {
  const sources = sourcePaths.map((path) =>
    readFileSync(resolve(repo, path), 'utf8'),
  );
  return {
    mission: JSON.parse(sources[0]),
    project: JSON.parse(sources[1]),
    provenance: sourcePaths.map((path, i) => ({
      path,
      sha256: digest(sources[i]),
    })),
  };
}

export function createBotPlan({
  bot,
  goal,
  taskId,
  repo,
  createdAt = new Date().toISOString(),
}) {
  if (typeof goal !== 'string' || !goal.trim() || goal.length > 16000)
    throw new Error('依頼は1〜16000文字で指定してください');
  const { mission, project, provenance } = botPlanSources(repo);
  const assignment = mission.taskAssignments.find(
    (entry) => entry.taskId === taskId,
  );
  if (!assignment || !bot.squads.includes(assignment.primarySquad))
    throw new Error('AMC計画には担当範囲内の既存taskを指定してください');
  // Select one explicit root in a local copy; the canonical nextTaskIds stay intact.
  const selectedMission = structuredClone(mission);
  selectedMission.squads.find(
    (squad) => squad.id === assignment.primarySquad,
  ).nextTaskIds = [taskId];
  const plan = compileGoal({
    instruction: goal,
    squadIds: [assignment.primarySquad],
    mission: selectedMission,
    project,
    goalId: `bot-${bot.id}-${randomUUID()}`,
    createdAt,
    maxParallel: 1,
    sourceFiles: provenance,
  });
  plan.scopeWarning =
    '担当Botが選んだ既存taskと前提・親子taskから作成したAMC候補。Gitの対象コードと今回の依頼を照合し、具体的な編集範囲・入出力・合格条件を確定する。依存関係の収録は範囲外作業の実行許可ではない。';
  const validation = validateGoal(plan);
  if (!validation.ok) throw new Error(validation.errors.join('\n'));
  return plan;
}

export function saveBotPlan(options, out) {
  const plan = createBotPlan(options);
  writeFileSync(resolve(options.repo, out), json(plan), {
    flag: 'wx',
    mode: 0o600,
  });
  return {
    goalPath: resolve(options.repo, out),
    goalId: plan.id,
    state: plan.state,
    rootTaskIds: plan.rootTaskIds,
    taskCount: plan.tasks.length,
  };
}

export async function githubContext(repo) {
  try {
    const { stdout } = await execute(
      process.execPath,
      ['scripts/prompt-context.mjs'],
      { cwd: repo, timeout: 120000, maxBuffer: 8 * 1024 * 1024 },
    );
    return JSON.parse(stdout);
  } catch {
    throw new Error(
      'GitHubの最新情報を取得できません。Botは未起動です。gh認証・接続を確認して再実行してください。',
    );
  }
}

export async function collectBotContext(
  { bot, repo },
  { collect = githubContext } = {},
) {
  const metadata = await collect(repo);
  if (
    metadata.repository !== 'k999ln/rock' ||
    metadata.liveMetadataVerified !== true ||
    !/^[a-f0-9]{40}$/.test(metadata.local?.head ?? '')
  )
    throw new Error('最新確認済みのGitHubコンテキストが必要です');
  const git = async (args) =>
    (
      await execute('git', args, {
        cwd: repo,
        timeout: 30000,
        maxBuffer: 8 * 1024 * 1024,
      })
    ).stdout;
  const [head, tree, history, status] = await Promise.all([
    git(['rev-parse', 'HEAD']),
    git([
      'ls-tree',
      '-r',
      '-z',
      metadata.local.head,
      '--',
      ...bot.paths,
      ...bot.guides,
    ]),
    git([
      'log',
      '-12',
      '--format=%H %s',
      metadata.local.head,
      '--',
      ...bot.paths,
    ]),
    git(['status', '--porcelain']),
  ]);
  if (head.trim() !== metadata.local.head)
    throw new Error('調査中にlocal HEADが変わりました。再取得してください');
  const { mission, project, provenance } = botPlanSources(repo);
  const assigned = new Map(
    mission.taskAssignments
      .filter((entry) => bot.squads.includes(entry.primarySquad))
      .map((entry) => [entry.taskId, entry.primarySquad]),
  );
  const files = tree
    .split('\0')
    .filter(Boolean)
    .map((line) => {
      const tab = line.indexOf('\t');
      const [mode, type, object] = line.slice(0, tab).split(' ');
      return { path: line.slice(tab + 1), mode, type, object };
    });
  return {
    schema: 'rock-project-bot-context/1',
    bot: bot.id,
    collectedAt: new Date().toISOString(),
    git: metadata,
    workingTreeStatus: status.trim(),
    sourceReviewComplete: false,
    sourceFiles: provenance,
    sourceMode: 'working_tree_with_hashes',
    codeIndex: {
      commit: metadata.local.head,
      total: files.length,
      truncated: files.length > 1000,
      files: files.slice(0, 1000),
    },
    recentScopedHistory: history.trim().split('\n').filter(Boolean),
    tasks: project.tasks
      .filter((task) => assigned.has(task.id))
      .map((task) => ({
        id: task.id,
        title: task.title,
        status: task.status,
        primarySquad: assigned.get(task.id),
        dependsOn: task.dependsOn,
        parentTaskId: task.parentTaskId ?? null,
      })),
    nextStep:
      '対象コード・試験・証拠を読み、一件のtaskを選ぶ。新規依頼は具体的なtaskPlanを既存台帳へ追加してからbot planでAMCを作成する。metadataだけでソース確認や実行受入を完了にしない。',
  };
}

export async function prepareBotWork(
  { bot, goal, taskId, repo },
  dependencies = {},
) {
  if (typeof goal !== 'string' || !goal.trim() || goal.length > 16000)
    throw new Error('依頼は1〜16000文字で指定してください');
  const plan = taskId ? createBotPlan({ bot, goal, taskId, repo }) : null;
  const context = await collectBotContext({ bot, repo }, dependencies);
  if (
    plan &&
    JSON.stringify(plan.sourceFiles) !== JSON.stringify(context.sourceFiles)
  )
    throw new Error('調査中にAMC正本が変わりました。再取得してください');
  const base = realpathSync(repo);
  for (const path of [
    resolve(base, 'work'),
    resolve(base, 'work/project-bots'),
  ]) {
    try {
      mkdirSync(path);
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
    if (realpathSync(path) !== path)
      throw new Error('Bot作業先のsymlinkは利用できません');
  }
  const parent = resolve(base, 'work/project-bots');
  const directory = mkdtempSync(resolve(parent, bot.id + '-'));
  const contextPath = resolve(directory, 'context.json');
  const goalPath = resolve(directory, 'amc-goal-r0.json');
  writeFileSync(contextPath, json(context), { flag: 'wx', mode: 0o600 });
  writeFileSync(resolve(directory, 'request.md'), goal.trim() + '\n', {
    flag: 'wx',
    mode: 0o600,
  });
  if (plan) writeFileSync(goalPath, json(plan), { flag: 'wx', mode: 0o600 });
  return {
    directory,
    contextPath,
    goalPath: plan ? goalPath : null,
    amcState: plan ? 'draft' : 'awaiting_bot_task_selection',
    sourceReviewComplete: false,
    botStarted: false,
  };
}
