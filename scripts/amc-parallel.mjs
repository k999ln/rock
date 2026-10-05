// Local supervisor: one approved Goal, separate workspaces, serialized state.
// A wave ends at independent review; it never merges or accepts worker results.
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { userInfo } from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  applyGoalEvent,
  summarizeGoal,
  validateGoal,
} from './amc-goal-engine.mjs';
import {
  applyDirectiveEvent,
  canonical,
  inspectDirective,
  issueDirective,
} from './amc-sky-directives.mjs';
import { observeSkyTask } from './amc-sky-observe.mjs';
import {
  codexExec,
  promptFor,
  repoPath,
  reportSchema,
  resultOf,
} from './amc-codex.mjs';

const hash = (value) => createHash('sha256').update(value).digest('hex');
const overlaps = (a, b) =>
  a === b || a.startsWith(b + '/') || b.startsWith(a + '/');
const inside = (root, path) => {
  const r = relative(root, path);
  return !r || (r !== '..' && !r.startsWith('..' + sep) && !r.startsWith(sep));
};
const must = (condition, message) => {
  if (!condition) throw new Error(message);
};
const json = (path, value) =>
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n', {
    flag: 'wx',
    mode: 0o600,
  });

// Include tracked and non-ignored files, including dirty/untracked source. Ignore
// caches according to Git, not an invented list. Bind each read to the checked
// regular-file inode and refuse final-component symlinks. This is not an atomic
// directory snapshot: concurrent same-inode writes and ancestor ABA changes are
// outside this local supervisor's guarantees.
export function workspaceSnapshot(repo) {
  must(
    Number.isInteger(constants.O_NOFOLLOW) && constants.O_NOFOLLOW !== 0 &&
      Number.isInteger(constants.O_NONBLOCK) && constants.O_NONBLOCK !== 0,
    'Safe workspace snapshot flags are unavailable',
  );
  must(
    realpathSync(
      execFileSync('git', ['rev-parse', '--show-toplevel'], {
        cwd: repo,
        encoding: 'utf8',
      }).trim(),
    ) === realpathSync(repo),
    '独立したGit作業場所のrootが必要です。',
  );
  const paths = [
    ...new Set(
      execFileSync(
        'git',
        ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
        { cwd: repo, encoding: 'utf8', maxBuffer: 20_000_000 },
      )
        .split('\0')
        .filter(Boolean),
    ),
  ].sort((a, b) => a.localeCompare(b));
  return Object.fromEntries(
    paths.map((path) => {
      const full = resolve(repo, path);
      must(inside(repo, full), 'Invalid Git path');
      let expected;
      try {
        expected = lstatSync(full, { bigint: true });
      } catch (error) {
        if (error.code === 'ENOENT') return [path, null];
        throw error;
      }
      must(
        expected.isFile(),
        'Parallel workspace requires regular files: ' + path,
      );
      must(
        inside(realpathSync(repo), realpathSync(full)),
        'Workspace path escapes repository',
      );
      const fd = openSync(
        full,
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
      );
      try {
        const actual = fstatSync(fd, { bigint: true });
        must(
          actual.isFile() && actual.dev === expected.dev && actual.ino === expected.ino,
          'Workspace file changed during snapshot: ' + path,
        );
        return [path, hash(readFileSync(fd))];
      } finally {
        closeSync(fd);
      }
    }),
  );
}

export async function runParallelGoal({
  goalPath,
  repo,
  workspaces,
  out,
  allowCodexUpload = false,
  execute = codexExec,
  pollMs = 1000,
  signal,
}) {
  must(allowCodexUpload, 'CodexへのGoal内容送信を明示承認してください。');
  must(
    Number.isInteger(pollMs) && pollMs >= 10,
    'Invalid observation interval',
  );
  const sourceGoal = realpathSync(goalPath),
    base = realpathSync(repo);
  must(
    !existsSync(sourceGoal + '.parallel-claim.json'),
    'このGoalには並列実行記録があります。最新Goalと成果を照合してください。',
  );
  const original = readFileSync(sourceGoal),
    sourceHash = hash(original);
  let goal = JSON.parse(original);
  const validation = validateGoal(goal);
  must(validation.ok, validation.errors.join('; '));
  must(
    !goal.tasks.some((t) => ['running', 'submitted'].includes(t.status)),
    '既存の実行・検収待ちを照合してから次の並列実行を開始してください。',
  );
  const candidates = summarizeGoal(goal).readyTaskIds;
  must(candidates.length, '着手可能な任務がありません。');
  const owner = {
    id: `os-user:${userInfo().uid}:${userInfo().username}`,
    roles: ['owner'],
  };
  const baseline = workspaceSnapshot(base),
    baselineHash = hash(canonical(baseline));
  const entries = [],
    deferred = [];
  for (const taskId of candidates) {
    const task = goal.tasks.find((t) => t.id === taskId);
    const worker = { id: `codex-wave:${randomUUID()}`, roles: ['worker'] };
    const context = goal.skyBrief
      ? await observeSkyTask({
          root: base,
          goal,
          taskId,
          owner: owner.id,
          assignee: worker.id,
          reviewers: [owner.id],
        })
      : undefined;
    const writes =
      context?.spec.writePaths ?? task.deliverables.map((d) => d.path);
    const reads =
      context?.observation.sourceInputs.map((input) => input.path) ?? [];
    must(
      writes.length &&
        writes.every((p) => {
          repoPath(base, p);
          return true;
        }),
      'Explicit write scope required',
    );
    // Include read/write conflicts, not just the task's report output paths.
    if (
      entries.some(
        (e) =>
          writes.some((p) =>
            [...e.writes, ...e.reads].some((q) =>
              overlaps(p.toLowerCase(), q.toLowerCase()),
            ),
          ) ||
          reads.some((p) =>
            e.writes.some((q) => overlaps(p.toLowerCase(), q.toLowerCase())),
          ),
      )
    ) {
      deferred.push({ taskId, reason: 'shared_source_scope' });
      continue;
    }
    must(
      typeof workspaces?.[taskId] === 'string',
      `隔離した作業場所が必要です: ${taskId}`,
    );
    const workspace = realpathSync(workspaces[taskId]);
    must(
      !inside(base, workspace) && !inside(workspace, base),
      '作業場所は原本repositoryから分離してください。',
    );
    must(
      !inside(workspace, sourceGoal),
      'Goalは作業場所の外に保存してください。',
    );
    must(
      entries.every(
        (e) =>
          !inside(e.workspace, workspace) && !inside(workspace, e.workspace),
      ),
      '部隊の作業場所が重複しています。',
    );
    must(
      hash(canonical(workspaceSnapshot(workspace))) === baselineHash,
      `作業場所の入力が原本と異なります: ${taskId}`,
    );
    entries.push({
      task,
      worker,
      workspace,
      writes,
      reads,
      context,
      directiveId: `wave-${randomUUID()}`,
    });
  }
  must(entries.length, '競合のない任務がありません。');
  // Exclusive claim is beside the source Goal, independent of output directory.
  // Retained on failure/crash so an unchanged source cannot launch twice.
  const claim = sourceGoal + '.parallel-claim.json';
  const output = resolve(out);
  mkdirSync(dirname(output), { recursive: true });
  const outputParent = realpathSync(dirname(output));
  must(
    !inside(base, outputParent) &&
      entries.every((e) => !inside(e.workspace, outputParent)),
    '実行記録は全作業場所の外に保存してください。',
  );
  must(!existsSync(output), '出力先は新しいディレクトリにしてください。');
  json(claim, {
    sourceHash,
    goalId: goal.id,
    revision: goal.revision,
    output,
    taskIds: entries.map((e) => e.task.id),
  });
  mkdirSync(output, { mode: 0o700 });
  const controller = new AbortController();
  let stopReason = '',
    queue = Promise.resolve();
  const results = [];
  const event = (type, extras = {}) => ({
    id: randomUUID(),
    type,
    expectedRevision: goal.revision,
    actor: owner.id,
    role: 'owner',
    ...extras,
  });
  const persist = () => {
    const checked = validateGoal(goal);
    must(checked.ok, checked.errors.join('; '));
    json(join(output, `goal-r${goal.revision}.json`), goal);
    writeFileSync(
      join(output, 'latest-goal.json.tmp'),
      JSON.stringify(goal, null, 2) + '\n',
      { mode: 0o600 },
    );
    renameSync(
      join(output, 'latest-goal.json.tmp'),
      join(output, 'latest-goal.json'),
    );
  };
  const serial = (fn) => {
    const work = queue.then(fn);
    queue = work.catch(() => {});
    return work;
  };
  const stop = (reason) => {
    if (stopReason) return;
    stopReason = String(reason);
    controller.abort(new Error(stopReason));
    if (goal.state === 'active') {
      goal = applyGoalEvent(goal, event('pause', { reason: stopReason }));
      persist();
    }
  };
  const unchanged = () => {
    must(
      hash(readFileSync(sourceGoal)) === sourceHash,
      'Goal・方針またはrevisionが変更されました。',
    );
    must(
      hash(canonical(workspaceSnapshot(base))) === baselineHash,
      '原本の入力・契約が変更されました。',
    );
    must(!signal?.aborted, '利用者が停止しました。');
  };
  const onAbort = () => {
    void serial(() => stop('利用者が停止しました。'));
  };
  signal?.addEventListener('abort', onAbort, { once: true });
  const onInterrupt = () => onAbort();
  process.once('SIGINT', onInterrupt);
  let timer,
    checking = false;
  try {
    // Reserve starts one at a time against the latest revision BEFORE spawning.
    for (const entry of entries) {
      unchanged();
      const { task, worker, workspace, context, directiveId } = entry;
      if (context) {
        goal = await issueDirective(
          goal,
          {
            type: 'issue_directive',
            directiveId,
            taskId: task.id,
            expectedRevision: goal.revision,
          },
          { ...context, principal: owner },
        );
        goal = await applyDirectiveEvent(
          goal,
          event('start_task', {
            taskId: task.id,
            directiveId,
            actor: worker.id,
            role: 'worker',
          }),
          { ...context, principal: worker },
        );
      } else
        goal = applyGoalEvent(
          goal,
          event('start_task', {
            taskId: task.id,
            actor: worker.id,
            role: 'worker',
          }),
        );
      persist();
      entry.runDir = join(
        output,
        task.id.replace(/[^a-zA-Z0-9_-]/g, '_') + '-' + randomUUID(),
        'run',
      );
      mkdirSync(entry.runDir, { recursive: true, mode: 0o700 });
      entry.prompt =
        promptFor(goal, task) +
        `\n司令部が固定したGoal原本SHA256: ${sourceHash}\n入力snapshot: ${baselineHash}\n隔離作業場所: ${workspace}\n書込可能な範囲: ${entry.writes.join(', ')}\nこの範囲以外への変更・原本への統合・自己検収は禁止。範囲不足はneeds_userで報告してください。` +
        (context
          ? '\n--- 個別指示 ---\n' + JSON.stringify(context.spec, null, 2)
          : '');
      writeFileSync(join(entry.runDir, 'prompt.md'), entry.prompt, {
        flag: 'wx',
        mode: 0o600,
      });
      json(join(entry.runDir, 'report.schema.json'), reportSchema);
    }
    timer = setInterval(() => {
      if (checking || stopReason) return;
      checking = true;
      void serial(() => {
        try {
          unchanged();
        } catch (error) {
          stop(error.message);
        }
      }).finally(() => {
        checking = false;
      });
    }, pollMs);
    // Start all reserved independent tasks, then serialize every submitted result.
    await Promise.all(
      entries.map(async (entry) => {
        let run, report, error;
        try {
          controller.signal.throwIfAborted();
          run = await execute({
            repo: entry.workspace,
            runDir: entry.runDir,
            prompt: entry.prompt,
            signal: controller.signal,
            taskId: entry.task.id,
          });
          must(run.exitCode === 0, `Codex終了: ${run.exitCode ?? '起動失敗'}`);
          report = resultOf(join(entry.runDir, 'codex-report.json'));
          must(
            report.status === 'completed',
            report.question || report.summary,
          );
          const actual = new Set(report.deliverables);
          for (const d of entry.task.deliverables)
            must(actual.has(d.path), `予定成果物がありません: ${d.path}`);
          for (const path of [...report.deliverables, ...report.evidence])
            must(
              existsSync(repoPath(entry.workspace, path)),
              `成果物・証拠がありません: ${path}`,
            );
          must(report.evidence.length, '独立検収用の証拠がありません。');
          const after = workspaceSnapshot(entry.workspace);
          entry.changedPaths = [
            ...new Set([...Object.keys(baseline), ...Object.keys(after)]),
          ].filter((p) => baseline[p] !== after[p]);
          must(
            entry.changedPaths.every((p) =>
              entry.writes.some((w) => overlaps(w, p)),
            ),
            `指示範囲外の変更: ${entry.changedPaths.filter((p) => !entry.writes.some((w) => overlaps(w, p))).join(', ')}`,
          );
          must(
            report.deliverables.every((p) =>
              entry.writes.some((w) => overlaps(w, p)),
            ),
            '指示範囲外の成果物',
          );
        } catch (e) {
          error = e.message;
        }
        return serial(async () => {
          let state = 'paused';
          try {
            unchanged();
            must(!stopReason, stopReason);
            must(!error, error);
            const { task, worker, directiveId, context } = entry;
            const submission = event('submit_result', {
              taskId: task.id,
              actor: worker.id,
              role: 'worker',
              outcome: 'succeeded',
              summary: report.summary,
              deliverables: report.deliverables,
              evidence: report.evidence,
            });
            if (context) {
              const previous = goal.skyDirectives.find(
                (d) => d.directiveId === directiveId,
              );
              const observed = await observeSkyTask({
                root: entry.workspace,
                goal,
                taskId: task.id,
                owner: owner.id,
                assignee: worker.id,
                reviewers: [owner.id],
                previous,
                evidencePaths: report.evidence,
              });
              observed.observation.changedPaths = entry.changedPaths;
              const drift = inspectDirective(
                goal,
                previous,
                observed.observation,
                'submit',
              );
              must(!drift.length, drift.join('; '));
              // Recheck central Goal after the async observation before committing.
              unchanged();
              must(!controller.signal.aborted, '実行停止');
              goal = await applyDirectiveEvent(
                goal,
                { ...submission, directiveId },
                { ...observed, principal: worker },
              );
            } else goal = applyGoalEvent(goal, submission);
            persist();
            state = 'submitted';
          } catch (e) {
            error ||= e.message;
            stop(error);
          }
          const result = {
            taskId: entry.task.id,
            state,
            reason: error || null,
            workspace: entry.workspace,
            runDir: entry.runDir,
            run,
            report,
            changedPaths: entry.changedPaths ?? [],
          };
          json(join(entry.runDir, 'run-result.json'), result);
          results.push(result);
        });
      }),
    );
  } catch (error) {
    await serial(() => stop(error.message));
  } finally {
    clearInterval(timer);
    signal?.removeEventListener('abort', onAbort);
    process.off('SIGINT', onInterrupt);
    await queue;
  }
  const result = {
    goalId: goal.id,
    state: stopReason ? 'paused' : 'submitted',
    reason: stopReason || null,
    sourceHash,
    baselineHash,
    parallelLimit: goal.maxParallel,
    launchedTasks: results.length,
    results,
    deferred,
    finalPath: join(output, 'latest-goal.json'),
    serviceSync: 'not_connected',
    acceptance: 'independent_review_required',
    integration: 'isolated_outputs_not_merged',
  };
  json(join(output, 'wave-result.json'), result);
  return result;
}

export async function main(args = process.argv.slice(2)) {
  const options = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--allow-codex-upload') {
      must(!options.allowCodexUpload, 'Duplicate flag');
      options.allowCodexUpload = true;
      continue;
    }
    const key = {
      '--goal': 'goalPath',
      '--repo': 'repo',
      '--workspaces': 'workspacesPath',
      '--out': 'out',
    }[args[i]];
    must(
      key && !options[key] && args[i + 1] && !args[i + 1].startsWith('--'),
      'Use --goal <json> --repo <source> --workspaces <task-to-directory.json> --out <new-directory> --allow-codex-upload',
    );
    options[key] = args[++i];
  }
  must(
    options.goalPath && options.repo && options.workspacesPath && options.out,
    '--goal / --repo / --workspaces / --out are required',
  );
  const result = await runParallelGoal({
    ...options,
    workspaces: JSON.parse(readFileSync(options.workspacesPath, 'utf8')),
  });
  console.log(JSON.stringify(result, null, 2));
  if (result.state !== 'submitted') process.exitCode = 2;
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
