import { userInfo } from 'node:os';
import { observeSkyTask } from './amc-sky-observe.mjs';
import { issueDirective, applyDirectiveEvent, inspectDirective } from './amc-sky-directives.mjs';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  accessSync,
  constants,
  createWriteStream,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  statSync,
  realpathSync,
  writeFileSync,
  renameSync,
} from 'node:fs';
import {
  delimiter,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from 'node:path';
import { finished } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import {
  applyGoalEvent,
  renderGoalPrompt,
  summarizeGoal,
  validateGoal,
} from './amc-goal-engine.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const reportSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['status', 'summary', 'deliverables', 'evidence', 'question'],
  properties: {
    status: { type: 'string', enum: ['completed', 'needs_user', 'failed'] },
    summary: { type: 'string', description: 'Describe the work and evidence here; keep explanations out of path arrays.' },
    deliverables: { type: 'array', description: 'Existing repository-relative file paths only. No descriptions, URLs, fragments, or path: explanation strings.', items: { type: 'string' } },
    evidence: { type: 'array', description: 'Existing repository-relative file paths only. Put explanations in summary.', items: { type: 'string' } },
    question: { type: 'string' },
  },
};

function parseArgs(args) {
  const [command = 'help', ...rest] = args;
  if (command === 'help' || command === '--help') return { command: 'help' };
  if (!['status', 'run'].includes(command)) throw new Error('Unknown command');
  const options = { command };
  for (let i = 0; i < rest.length;) {
    const flag = rest[i];
    if (flag === '--allow-codex-upload') {
      if (options.allowCodexUpload)
        throw new Error('Duplicate option: --allow-codex-upload');
      options.allowCodexUpload = true;
      i += 1;
      continue;
    }
    const value = rest[i + 1];
    if (
      !['--goal', '--task', '--repo', '--out'].includes(flag) ||
      !value ||
      value.startsWith('--')
    )
      throw new Error(
        'Use --goal <file> [--task <id>] [--repo <dir>] [--out <dir>] [--allow-codex-upload]',
      );
    const key = flag.slice(2);
    if (options[key]) throw new Error(`Duplicate option: ${flag}`);
    options[key] = value;
    i += 2;
  }
  if (!options.goal) throw new Error('--goal <file> is required');
  if (command === 'run' && !options.allowCodexUpload)
    throw new Error(
      'CodexへGoal内容を送信します。確認のうえ --allow-codex-upload を付けてください。',
    );
  return options;
}

function readGoal(path) {
  const value = JSON.parse(readFileSync(resolve(path), 'utf8'));
  const checked = validateGoal(value);
  if (!checked.ok) throw new Error(checked.errors.join('; '));
  return value;
}

function writeNew(path, value) {
  writeFileSync(path, value, { flag: 'wx', mode: 0o600 });
}

function saveGoal(path, goal) {
  writeNew(path, `${JSON.stringify(goal, null, 2)}\n`);
}

function event(goal, type, extras) {
  return applyGoalEvent(goal, {
    id: randomUUID(),
    type,
    expectedRevision: goal.revision,
    actor: 'codex-local',
    role: 'worker',
    at: new Date().toISOString(),
    ...extras,
  });
}

export function repoPath(repo, path) {
  if (
    typeof path !== 'string' ||
    !path.trim() || path !== path.trim() || /[:#\r\n]/.test(path) ||
    isAbsolute(path) ||
    path.includes('\\')
  )
    throw new Error(`Unsafe path in Codex report: ${String(path)}`);
  const resolved = resolve(repo, path);
  const inside = relative(repo, resolved);
  if (!inside || inside === '..' || inside.startsWith(`..${sep}`))
    throw new Error(`Path leaves repository: ${path}`);
  if (existsSync(resolved)) {
    const real = relative(realpathSync(repo), realpathSync(resolved));
    if (!real || real === '..' || real.startsWith(`..${sep}`))
      throw new Error(`Path resolves outside repository: ${path}`);
  }
  return resolved;
}

export function resultOf(file) {
  const value = JSON.parse(readFileSync(file, 'utf8'));
  if (
    !value ||
    !['completed', 'needs_user', 'failed'].includes(value.status) ||
    typeof value.summary !== 'string' ||
    !value.summary.trim() ||
    typeof value.question !== 'string' ||
    !Array.isArray(value.deliverables) ||
    !value.deliverables.every((item) => typeof item === 'string') ||
    !Array.isArray(value.evidence) ||
    !value.evidence.every((item) => typeof item === 'string')
  )
    throw new Error('Codex returned an invalid task report');
  return value;
}

export function promptFor(goal, task) {
  return [
    `AMCで承認済みの作業 ${task.id}「${task.title}」だけを、このローカルrepositoryで進めてください。`,
    '元のGoal・意図と既存の範囲を守り、新しい目的やtaskを勝手に追加しないでください。',
    'この呼出しでCodexへGoal内容を送ることだけは利用者が明示承認しています。それ以外の外部送信・公開、課金、契約、実機操作、実売買・送金、外部サービスへの変更は行わないでください。必要なら needs_user で止め、具体的に質問してください。',
    '既存の未保存変更はユーザーのものです。上書き・破棄しないでください。commitやpushもしないでください。',
    'このtaskに必要な調査・編集・検査を行い、実際に確認した証拠だけを報告してください。',
    'deliverables/evidenceは実在するrepository相対ファイルパスだけの配列にしてください。説明はsummaryに記載し、「path: 説明」、URL、#見出し、行番号をパスへ付けないでください。作成できなかった成果物を列挙しないでください。',
    '回答は指定JSON schemaに従い、完了した場合もAMC上では独立検収待ちです。',
    'このローカル作業でshell/file操作が使えない場合、UI操作へ切り替えず needs_user で理由を報告してください。',
    `対象task: ${task.id}\n予定成果物: ${task.deliverables.map((item) => item.path).join(', ')}`,
    '\n--- AMC承認済みGoalと作業条件 ---',
    renderGoalPrompt(goal, { squadId: task.squadId }),
  ].join('\n');
}

function codexBinary() {
  for (const directory of (process.env.PATH || '').split(delimiter)) {
    if (!directory) continue;
    const entry = join(directory, 'codex');
    try {
      accessSync(entry, constants.X_OK);
      return realpathSync(entry);
    } catch {
      // Check the next PATH entry.
    }
  }
  throw new Error(
    'Codex CLIが見つかりません。Codexをインストールしてください。',
  );
}

function updateRunProgress(runDir, changes) {
  const path=join(runDir,'progress.json');
  const previous=existsSync(path)?JSON.parse(readFileSync(path,'utf8')):{};
  const value={...previous,...changes,observedAt:new Date().toISOString(),serviceSync:'not_connected'};
  const temporary=path+'.tmp';writeFileSync(temporary,JSON.stringify(value,null,2)+'\n',{mode:0o600});renameSync(temporary,path);
  const latest=join(dirname(runDir),'progress.json');writeFileSync(latest+'.tmp',JSON.stringify(value,null,2)+'\n',{mode:0o600});renameSync(latest+'.tmp',latest);
}
export async function codexExec({ repo, runDir, prompt, signal: abortSignal }) {
  abortSignal?.throwIfAborted();
  const args = [
    '--disable',
    'browser_use',
    '--disable',
    'computer_use',
    '--ask-for-approval',
    'never',
    'exec',
    '--json',
    '--sandbox',
    'workspace-write',
    '--cd',
    repo,
    '--output-schema',
    join(runDir, 'report.schema.json'),
    '--output-last-message',
    join(runDir, 'codex-report.json'),
    '-',
  ];
  return new Promise((resolveRun, reject) => {
    const child = spawn(codexBinary(), args, {
      cwd: repo,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    child.once('spawn',()=>{const started={pid:child.pid,startedAt:new Date().toISOString(),executor:'codex',repo};writeNew(join(runDir,'process-start.json'),JSON.stringify(started,null,2)+'\n');updateRunProgress(runDir,{stage:'runner_started',processId:child.pid,startedAt:started.startedAt,currentStep:'Codexプロセス起動。作業結果は未提出。'});});
    const stdout = createWriteStream(join(runDir, 'codex-events.jsonl'), {
      flags: 'wx',
      mode: 0o600,
    });
    const stderr = createWriteStream(join(runDir, 'codex-stderr.txt'), {
      flags: 'wx',
      mode: 0o600,
    });
    child.stdout.pipe(stdout);
    child.stderr.pipe(stderr);
    let interrupted = false;
    let timedOut = false;
    let outputExceeded = false;
    let outputBytes = 0;
    let killTimer;
    const stop = () => {
      child.kill('SIGTERM');
      killTimer ??= setTimeout(() => child.kill('SIGKILL'), 5000);
    };
    const countOutput = (chunk) => {
      outputBytes += chunk.byteLength;
      if (outputBytes > 50_000_000 && !outputExceeded) {
        outputExceeded = true;
        stop();
      }
    };
    child.stdout.on('data', countOutput);
    child.stderr.on('data', countOutput);
    child.stdin.on('error', () => {});
    const onInterrupt = () => {
      interrupted = true;
      stop();
    };
    process.once('SIGINT', onInterrupt);
    abortSignal?.addEventListener('abort', onInterrupt, { once: true });
    if (abortSignal?.aborted) onInterrupt();
    const timer = setTimeout(
      () => {
        timedOut = true;
        stop();
      },
      30 * 60 * 1000,
    );
    child.on('error', (error) => {
      clearTimeout(timer);
      clearTimeout(killTimer);
      abortSignal?.removeEventListener('abort', onInterrupt);
      process.off('SIGINT', onInterrupt);
      reject(error);
    });
    child.on('close', async (code, signal) => {
      clearTimeout(timer);
      clearTimeout(killTimer);
      abortSignal?.removeEventListener('abort', onInterrupt);
      process.off('SIGINT', onInterrupt);
      try {
        await Promise.all([finished(stdout), finished(stderr)]);
        resolveRun({
          exitCode: code,
          signal,
          interrupted,
          timedOut,
          outputExceeded,
          args,
        });
      } catch (error) {
        reject(error);
      }
    });
    child.stdin.end(prompt);
  });
}

export async function runCodexGoal({
  goalPath,
  taskId,
  repo = root,
  out = join(root, 'work/amc-codex-runs'),
  allowCodexUpload = false,
  execute = codexExec,
}) {
  if (!allowCodexUpload)
    throw new Error('CodexへのGoal内容送信を明示承認してください。');
  let goal = readGoal(goalPath);
  const summary = summarizeGoal(goal);
  const selected = taskId || summary.readyTaskIds[0];
  if (!selected)
    throw new Error(
      '着手可能な作業がありません。前提・保留・検収待ちを確認してください。',
    );
  if (!summary.readyTaskIds.includes(selected))
    throw new Error(
      `${selected} は着手できません。前提・保留・同時実行枠を確認してください。`,
    );
  const task = goal.tasks.find((item) => item.id === selected);
  const repoDir = resolve(repo);
  if (!statSync(repoDir).isDirectory())
    throw new Error('Repository directory required');
  mkdirSync(resolve(out), { recursive: true, mode: 0o700 });
  const claimKey = createHash('sha256')
    .update(`${goal.id}\u0000${goal.revision}\u0000${selected}`)
    .digest('hex');
  const claimPath = join(resolve(out), `claim-${claimKey}.json`);
  if (existsSync(claimPath))
    throw new Error(
      'このGoal revisionの作業は実行記録があります。run-result.jsonと最新Goalを確認し、元JSONをそのまま再実行しないでください。',
    );
  const label = (value) => value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 32);
  const runDir = mkdtempSync(
    join(
      resolve(out),
      `${label(goal.id)}-${label(selected)}-${claimKey.slice(0, 10)}-`,
    ),
  );
  writeNew(
    claimPath,
    `${JSON.stringify({ goalId: goal.id, revision: goal.revision, taskId: selected, runDir }, null, 2)}\n`,
  );
  let skyContext;
  let skyDirectiveId;
  let worker;
  if (goal.skyBrief) {
    // This is a supervisor-assigned executor identity tied to this exclusive run
    // claim, not a browser-supplied actor or invented account.
    worker = {id:`codex-run:${claimKey}`,roles:['worker']};
    const owner = {id:`os-user:${userInfo().uid}:${userInfo().username}`,roles:['owner']};
    const observed = await observeSkyTask({root:repoDir,goal,taskId:selected,owner:owner.id,assignee:worker.id,reviewers:[owner.id]});
    skyContext = {...observed,principal:owner};
    skyDirectiveId = `directive-${claimKey}`;
    goal = await issueDirective(goal,{type:'issue_directive',directiveId:skyDirectiveId,taskId:selected,expectedRevision:goal.revision},skyContext);
    writeNew(join(runDir,'sky-observation.json'),JSON.stringify(observed,null,2)+'\n');
  }
  const detail = skyContext ? `\n--- SKY-DIR-002 個別指示 ---\n${JSON.stringify(skyContext.spec,null,2)}\nこの実行は隔離したローカル成果物のみです。外部作用・公開・送信は開始せず、必要ならneeds_userで報告してください。` : '';
  const prompt = promptFor(goal, task) + detail;
  writeNew(join(runDir, 'prompt.md'), prompt);
  writeNew(
    join(runDir, 'report.schema.json'),
    `${JSON.stringify(reportSchema, null, 2)}\n`,
  );
  const started = skyContext
    ? await applyDirectiveEvent(goal,{id:randomUUID(),type:'start_task',taskId:selected,directiveId:skyDirectiveId,actor:worker.id,role:'worker',expectedRevision:goal.revision},{...skyContext,principal:worker})
    : event(goal, 'start_task', { taskId: selected });
  updateRunProgress(runDir,{goalId:goal.id,taskId:selected,goalRevision:started.revision,runId:claimKey,stage:'instruction_issued',currentStep:'実行指示を保存。プロセス起動待ち。',acceptedTasks:started.tasks.filter(t=>t.status==='done').length,totalTasks:started.tasks.length,nextReadyTaskIds:summarizeGoal(started).readyTaskIds});
  const startedPath = join(runDir, `goal-r${started.revision}-running.json`);
  saveGoal(startedPath, started);
  let run;
  try {
    run = await execute({ repo: repoDir, runDir, prompt });
  } catch (error) {
    run = { exitCode: null, error: String(error) };
  }
  let report;
  let reason = '';
  try {
    if (run.exitCode !== 0)
      throw new Error(
        `${run.outputExceeded ? 'Codex output limit exceeded' : run.timedOut ? 'Codex timed out' : run.interrupted ? 'Codex interrupted' : `Codex exited with ${run.exitCode ?? 'startup error'}`}${run.error ? `: ${run.error}` : ''}`,
      );
    report = resultOf(join(runDir, 'codex-report.json'));
    if (report.status === 'completed') {
      const actual = new Set(report.deliverables);
      for (const item of task.deliverables) {
        if (!actual.has(item.path) || !existsSync(repoPath(repoDir, item.path)))
          throw new Error(`予定成果物がありません: ${item.path}`);
      }
      for (const path of [...report.deliverables, ...report.evidence]) {
        if (!existsSync(repoPath(repoDir, path)))
          throw new Error(`証拠または成果物がありません: ${path}`);
      }
    }
  } catch (error) {
    reason = error instanceof Error ? error.message : String(error);
  }
  let submitContext;
  if(skyContext && report?.status==='completed' && !reason) {
    try {
      submitContext = await observeSkyTask({root:repoDir,goal:started,taskId:selected,owner:skyContext.observation.owner,assignee:worker.id,reviewers:skyContext.observation.reviewers,previous:started.skyDirectives.at(-1),evidencePaths:report.evidence});
      const drift=inspectDirective(started,started.skyDirectives.at(-1),submitContext.observation,'submit');
      if(drift.length) reason=drift.join('; ');
    }catch(error){reason=String(error);}
  }
  const submit = async (extras) => skyContext
    ? applyDirectiveEvent(started,{id:randomUUID(),type:'submit_result',taskId:selected,directiveId:skyDirectiveId,actor:worker.id,role:'worker',expectedRevision:started.revision,...extras},{...submitContext,principal:worker})
    : event(started,'submit_result',{taskId:selected,...extras});
  let next;
  let state;
  if (report?.status === 'completed' && !reason) {
    next = await submit({
      outcome: 'succeeded',
      summary: report.summary,
      deliverables: report.deliverables,
      evidence: [
        ...new Set([...report.evidence, ...(skyContext ? [] : [join(runDir, 'codex-report.json')])]),
      ],
    });
    state = 'submitted';
  } else if (!skyContext && report?.status === 'failed' && !reason) {
    next = event(started, 'submit_result', {
      taskId: selected,
      outcome: 'failed',
      summary: report.summary,
      deliverables: [],
      evidence: [join(runDir, 'codex-report.json')],
    });
    state = 'failed';
  } else {
    reason ||=
      report?.question || report?.summary || 'Codex result needs review';
    next = event(started, 'pause', {
      role: 'owner',
      reason: `${selected}: ${reason}`,
    });
    state = 'paused';
  }
  updateRunProgress(runDir,{stage:state,goalRevision:next.revision,currentStep:state==='submitted'?'成果提出済み。独立検収待ち。':'実行停止。理由と結果を確認してください。',waitReason:reason || null,releaseCondition:reason?'失敗理由を解消し、最新Goalと既存claimを確認して再開する':'実行者以外が対象証拠を照合する',latestDeliverables:report?.deliverables??[],acceptedTasks:next.tasks.filter(t=>t.status==='done').length,nextReadyTaskIds:summarizeGoal(next).readyTaskIds});
  const finalPath = join(runDir, `goal-r${next.revision}-${state}.json`);
  saveGoal(finalPath, next);
  writeNew(
    join(runDir, 'run-result.json'),
    `${JSON.stringify({ goalId: goal.id, taskId: selected, state, reason, run, startedPath, finalPath, report }, null, 2)}\n`,
  );
  return {
    goalId: goal.id,
    taskId: selected,
    state,
    reason,
    runDir,
    startedPath,
    finalPath,
  };
}

export function status(goalPath) {
  const goal = readGoal(goalPath);
  const summary = summarizeGoal(goal);
  return {
    goalId: goal.id,
    state: goal.state,
    revision: goal.revision,
    readyTaskIds: summary.readyTaskIds,
    submittedTaskIds: goal.tasks
      .filter((task) => task.status === 'submitted')
      .map((task) => task.id),
    blockedTaskIds: [
      ...summary.heldTaskIds,
      ...summary.authorityRequiredTaskIds,
      ...summary.reviewTaskIds,
    ],
  };
}

export async function main(args = process.argv.slice(2)) {
  const options = parseArgs(args);
  if (options.command === 'help') {
    console.log(
      'AMC → Codex (local):\n  status --goal <amc-goal.json>\n  run --goal <amc-goal.json> --allow-codex-upload [--task <ready-id>] [--repo <repository>] [--out <directory>]\nCodex receives the Goal content. One task per run. Keep the original Goal; import the resulting JSON only after review.',
    );
    return;
  }
  const result =
    options.command === 'status'
      ? status(options.goal)
      : await runCodexGoal({
          goalPath: options.goal,
          taskId: options.task,
          repo: options.repo,
          out: options.out,
          allowCodexUpload: options.allowCodexUpload,
        });
  console.log(JSON.stringify(result, null, 2));
  if (options.command === 'run' && result.state !== 'submitted')
    process.exitCode = 2;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
