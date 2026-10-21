import { readBoundedStream } from '@/lib/bounded-stream';
import { env } from 'cloudflare:workers';
import { missingRockstarServiceScope, rockstarServiceScopeAllowed } from '@/lib/rockstar-service-access';
import { skyWebCommand, requireSkyDraftImport } from '@/lib/amc-sky-web';
import { database, requestUser } from '@/lib/fund-store';
import { workStore } from '@/lib/work-store';
import { a2aDelegationStore } from '@/lib/a2a-delegation-store';
import { decryptA2AArtifact } from '@/lib/a2a-input-crypto';
import { applyAmcEvent, amcSummary, type AmcGoal } from '@/lib/amc-tool';
import {
  approveJenniferExecutionGoal,
  createJenniferExecutionGoal,
  jenniferDelegationKey,
  parseJenniferDelegationKey,
  type JenniferExecutionCoordinationRef,
  type JenniferQuestionResolution,
} from '@/lib/jennifer-amc-execution';
import { isJenniferCoordinationPlan, type JenniferCoordinationPlan } from '@/lib/jennifer-coordination';
import { jenniferExecutionStore } from '@/lib/jennifer-execution-store';
import {
  extractJenniferReviewClaim,
  type JenniferReviewReport,
  type JenniferTaskReport,
} from '@/lib/jennifer-execution-reports';
import {
  createWorkJob,
  applyWorkCommand,
  objectInput,
  workId,
  WorkError,
  type WorkJob,
  type WorkCommand,
} from '@/lib/workflow';

const MAX_BODY = 2_000_000;
const MAX_RECORD = 1_900_000;
function checkRecordSize(value: unknown) {
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > MAX_RECORD)
    throw new WorkError('履歴を含む保存上限（1.9 MB）です。Goal JSONを保存し、別記録へ引き継いでください。', 413);
}
function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: { 'Cache-Control': 'private, no-store' },
  });
}
function reject(request: Request, error: unknown) {
  if (request.body && !request.bodyUsed && !request.body.locked)
    void request.body.cancel().catch(() => {});
  if (error instanceof WorkError)
    return json({ error: error.message }, error.status);
  if (error instanceof Error && error.message === 'UNAUTHORIZED')
    return json(
      { error: 'サインインするとAMCの計画を保存・再開できます。' },
      401,
    );
  if (error instanceof Error && error.message === 'ORIGIN')
    return json({ error: 'このサイトから操作してください。' }, 403);
  if (error instanceof SyntaxError)
    return json({ error: '入力の形式を確認してください。' }, 400);
  return json(
    {
      error:
        'AMCの保存を確認できません。同じ操作の再試行か、最新状態の再読込を行ってください。',
    },
    503,
  );
}
async function body(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new WorkError('入力がありません。');
  const bytes = await readBoundedStream(reader, MAX_BODY, () =>
    new WorkError('入力は2 MB以下にしてください。', 413),
  );
  try {
    return JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(bytes),
    ) as unknown;
  } catch {
    throw new WorkError('UTF-8のJSONを送信してください。', 400);
  }
}
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, stable(item)]),
    );
  return value;
}
async function digest(value: unknown) {
  const hash = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(stable(value))),
  );
  return [...new Uint8Array(hash)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function isJenniferGoal(goal: AmcGoal): goal is AmcGoal & { coordinationRef: JenniferExecutionCoordinationRef } {
  const reference = goal.coordinationRef as Partial<JenniferExecutionCoordinationRef> | undefined;
  return reference?.schema === 'rockstaros-jennifer-execution/1' &&
    typeof reference.planId === 'string' && isJenniferCoordinationPlan(reference.planSnapshot);
}

function syncJenniferJob(job: WorkJob, goal: AmcGoal, commandId: string, event: Record<string, unknown>): WorkJob {
  const now = new Date().toISOString();
  return {
    ...job,
    amcGoal: goal,
    revision: job.revision + 1,
    updatedAt: now,
    status: goal.state === 'accepted' ? 'completed' :
      goal.state === 'active' && goal.tasks.every((task) => task.status === 'done') ? 'review' : 'active',
    steps: goal.tasks.filter((task) => !task.childTaskIds.length).map((task) => ({
      id: task.id, title: task.title, tool: 'rockstar-amc', runner: 'amc', passed: task.status === 'done',
    })),
    events: [...job.events, {
      at: now,
      command: { id: commandId, action: 'amc_event', event } as WorkCommand,
    }],
  };
}

function questionResolutions(value: unknown): JenniferQuestionResolution[] {
  if (!Array.isArray(value) || value.length > 16) throw new WorkError('COLOMBIAの確認内容を入力してください。');
  const result: JenniferQuestionResolution[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new WorkError('COLOMBIAの確認内容が不正です。');
    const candidate = item as Record<string, unknown>;
    if (Object.keys(candidate).some((key) => !['question', 'disposition', 'note'].includes(key)) ||
      typeof candidate.question !== 'string' || candidate.question.length > 500 ||
      !['answered', 'deferred'].includes(String(candidate.disposition)) ||
      typeof candidate.note !== 'string' || !candidate.note.trim() || candidate.note.length > 500)
      throw new WorkError('COLOMBIAの各未決事項に回答または延期理由が必要です。');
    result.push({
      question: candidate.question,
      disposition: candidate.disposition as 'answered' | 'deferred',
      note: candidate.note.trim(),
    });
  }
  return result;
}

async function buildJenniferProjection(user: string, root: WorkJob) {
  const db = database();
  const jobs = await workStore(db).listJenniferTaskJobs(user, root.id);
  const delegations = a2aDelegationStore(db);
  const allDelegations = (await Promise.all(jobs.map((job) => delegations.listForParent(user, job.id)))).flat();
  const costs = new Map<string, { currency: string; estimatedMinor: number; maximumMinor: number; reservedMinor: number; liveMinor: number; settledMinor: number; unknownCount: number }>();
  for (const delegation of allDelegations) {
    const currency = delegation.budgetCurrency;
    const row = costs.get(currency) ?? { currency, estimatedMinor: 0, maximumMinor: 0, reservedMinor: 0, liveMinor: 0, settledMinor: 0, unknownCount: 0 };
    row.estimatedMinor += delegation.priceQuote?.estimateMinor ?? 0;
    row.maximumMinor += delegation.budgetLimitMinor;
    const [reservation, live, receipt] = await Promise.all([
      delegations.getBudgetReservation(user, delegation.id),
      delegations.getLatestLiveUsageSnapshot(user, delegation.id),
      delegations.getUsageReceipt(user, delegation.id),
    ]);
    if (reservation?.state === 'held') row.reservedMinor += reservation.reservedMinor;
    row.liveMinor += live?.cumulativeAmountMinor ?? 0;
    row.settledMinor += receipt?.amountMinor ?? 0;
    if (['indeterminate', 'cancel_requested', 'cancel_submitting', 'cancel_unconfirmed'].includes(delegation.state)) row.unknownCount += 1;
    costs.set(currency, row);
  }
  return {
    plan: await jenniferExecutionStore(db).currentPlan(user, root.id),
    attempts: await jenniferExecutionStore(db).listAttempts(user, root.id),
    costs: [...costs.values()].map((item) => ({ ...item, remainingMinor: Math.max(0, item.maximumMinor - item.settledMinor) })),
    activeDelegations: allDelegations.filter((item) => !['cancelled_before_dispatch', 'expired', 'remote_cancelled', 'remote_completed', 'remote_failed', 'remote_rejected'].includes(item.state)).map((item) => ({ id: item.id, state: item.state })),
  };
}

async function requestJenniferCancellations(user: string, rootJobId: string) {
  const db = database();
  const store = workStore(db);
  const delegations = a2aDelegationStore(db);
  const warnings: string[] = [];
  for (const child of await store.listJenniferTaskJobs(user, rootJobId)) {
    for (const delegation of await delegations.listForParent(user, child.id)) {
      try {
        const cancelled = await delegations.requestCancel(user, delegation.id);
        if (!cancelled) warnings.push(delegation.id);
      } catch {
        warnings.push(delegation.id);
      }
    }
  }
  return warnings;
}

async function reconcileJenniferDelegation(user: string, root: WorkJob, delegationId: string) {
  const db = database();
  const goal = root.amcGoal!;
  if (!isJenniferGoal(goal)) throw new WorkError('JenniferのGoalではありません。');
  const execution = jenniferExecutionStore(db);
  const plan = await execution.currentPlan(user, root.id);
  if (!plan || !['inventory_approved', 'delivery_approved'].includes(plan.state))
    throw new WorkError('Goal Contractの承認が無効か、一時停止中です。', 409);
  const delegations = a2aDelegationStore(db);
  const delegation = await delegations.get(user, workId(delegationId));
  if (!delegation) throw new WorkError('Agent委任が見つかりません。', 404);
  const child = await workStore(db).get(user, delegation.parentJobId);
  const coordination = child?.coordination;
  if (!child || !coordination || coordination.rootJobId !== root.id ||
    coordination.planId !== goal.coordinationRef.planId)
    throw new WorkError('Agent委任がこのJennifer Goalに属していません。', 409);
  const task = goal.tasks.find(({ id }) => id === coordination.taskId);
  if (!task) throw new WorkError('leaf taskがGoalにありません。', 409);
  const correlation = parseJenniferDelegationKey(delegation.idempotencyKey);
  const role = correlation?.role;
  if (!role || correlation.taskId !== task.id)
    throw new WorkError('Jenniferのdispatch correlationが不正です。', 409);
  const expectedKey = jenniferDelegationKey(task.id, role, `${goal.coordinationRef.planId.slice(9)}.1`);
  if (delegation.idempotencyKey !== expectedKey)
    throw new WorkError('Jenniferの決定的dispatch IDと委任が一致しません。', 409);
  if (task.id !== 'task-inventory' && plan.state !== 'delivery_approved')
    throw new WorkError('調査結果後の実装計画を承認するまでこのleafは実行できません。', 409);
  const principal = `${delegation.targetOrigin}|${delegation.targetAgentName}|${delegation.targetAgentVersion}`;
  let attempt = await execution.attemptByDelegation(user, delegation.id);
  if (!attempt) attempt = await execution.registerAttempt({
    ownerUserId: user, rootJobId: root.id, planRevision: plan.revision,
    taskId: task.id, role, childJobId: child.id,
    delegationId: delegation.id, principal, inputDigest: delegation.inputSha256,
    state: delegation.state,
  });

  let next: AmcGoal = goal;
  const startable = [
    'dispatch_submitting', 'indeterminate', 'submitted', 'working',
    'awaiting_remote_input', 'cancel_requested', 'cancel_submitting',
    'cancel_unconfirmed', 'remote_completed', 'remote_failed', 'remote_rejected',
  ].includes(delegation.state);
  if (role === 'worker' && task.status === 'pending' && startable) {
    if (!amcSummary(next).readyTaskIds.includes(task.id))
      throw new WorkError('leaf taskの前提または実行slotが未準備です。', 409);
    next = applyAmcEvent(next, {
      id: `jennifer-start-${delegation.id}`,
      type: 'start_task', expectedRevision: next.revision,
      actor: `server:a2a-worker:${delegation.id}`, role: 'worker', taskId: task.id,
    });
  }

  if (role === 'worker' && ['remote_failed', 'remote_rejected', 'expired'].includes(delegation.state)) {
    const currentTask = next.tasks.find(({ id }) => id === task.id)!;
    if (currentTask.status === 'running') next = applyAmcEvent(next, {
      id: `jennifer-worker-failure-${delegation.id}`,
      type: 'submit_result', expectedRevision: next.revision,
      actor: `server:a2a-worker:${delegation.id}`, role: 'worker', taskId: task.id,
      outcome: 'failed', summary: `Providerの終了状態を${delegation.state}として確認した。`,
      deliverables: [], evidence: [`a2a:${delegation.id}:${delegation.state}`],
    });
    return next;
  }

  if (delegation.state !== 'remote_completed') return next;
  const [artifacts, receipt] = await Promise.all([
    delegations.listArtifacts(user, delegation.id),
    delegations.getUsageReceipt(user, delegation.id),
  ]);
  if (delegation.artifactsCaptured !== 1 || artifacts.length === 0 || !receipt ||
    receipt.parentJobId !== child.id)
    throw new WorkError('remote完了だけでは進めません。artifactと署名検証済みusage Receiptが必要です。', 409);
  const artifactSha256s = artifacts.map(({ artifactSha256 }) => artifactSha256).sort();
  const artifactSetDigest = await digest(artifactSha256s);
  const usageReceiptDigest = await digest(JSON.parse(receipt.receiptJson));

  if (role === 'worker') {
    const currentTask = next.tasks.find(({ id }) => id === task.id)!;
    if (currentTask.status === 'submitted' || currentTask.status === 'done') return next;
    if (currentTask.status !== 'running') throw new WorkError('worker委任とAMC task状態が一致しません。', 409);
    const report: JenniferTaskReport = {
      schema: 'zema-jennifer-task-report/1', rootJobId: root.id,
      goalId: next.id, goalRevision: next.revision, planRevision: plan.revision,
      taskId: task.id, attempt: 1, delegationId: delegation.id, principal,
      inputDigest: delegation.inputSha256, artifactSha256s, artifactSetDigest,
      usageReceiptDigest,
      summary: `${delegation.targetAgentName}から${artifacts.length}件の暗号化済みartifactとProvider usage Receiptを照合した。`,
      unresolved: [], outcome: 'succeeded',
    };
    const reportDigest = await digest(report);
    await execution.completeAttempt({ ownerUserId: user, delegationId: delegation.id,
      artifactSetDigest, usageReceiptDigest, reportDigest, report, state: 'reported' });
    return applyAmcEvent(next, {
      id: `jennifer-worker-report-${delegation.id}`,
      type: 'submit_result', expectedRevision: next.revision,
      actor: `server:a2a-worker:${principal}`, role: 'worker', taskId: task.id,
      outcome: 'succeeded', summary: report.summary,
      deliverables: currentTask.deliverables.map(({ path }) => path),
      evidence: [`jennifer:task-report:${reportDigest}`, ...artifactSha256s.map((hash) => `artifact:sha256:${hash}`), `usage-receipt:sha256:${usageReceiptDigest}`],
    });
  }

  const worker = await execution.workerAttempt(user, root.id, plan.revision, task.id);
  if (!worker?.reportDigest || !worker.artifactSetDigest)
    throw new WorkError('workerの型付きTaskReportを確定してから独立reviewしてください。', 409);
  if (delegation.predecessorDelegationId !== worker.delegationId)
    throw new WorkError('reviewer委任が検収対象のworker委任へ結び付いていません。', 409);
  if (worker.principal === principal)
    throw new WorkError('実行担当と同じAgent principalは独立reviewerになれません。', 409);
  const inputKey = (env as unknown as { A2A_INPUT_ENCRYPTION_KEY?: string }).A2A_INPUT_ENCRYPTION_KEY;
  if (!inputKey) throw new WorkError('review artifactを復号する鍵が設定されていません。', 503);
  let claim = null;
  for (const artifact of artifacts) {
    const serialized = await decryptA2AArtifact({
      ciphertext: artifact.ciphertext, nonce: artifact.nonce,
      artifactSha256: artifact.artifactSha256,
      keyVersion: artifact.keyVersion as 'aes-256-gcm-v1',
    }, inputKey, user, delegation.id, artifact.remoteTaskId);
    claim = extractJenniferReviewClaim(JSON.parse(serialized), task, worker.reportDigest) ?? claim;
  }
  if (!claim) throw new WorkError('reviewerのartifactに有効なjennifer-review-claim/1がありません。', 409);
  const report: JenniferReviewReport = {
    schema: 'zema-jennifer-review-report/1', rootJobId: root.id,
    goalId: next.id, goalRevision: next.revision, planRevision: plan.revision,
    taskId: task.id, attempt: 1, delegationId: delegation.id, principal,
    inputDigest: delegation.inputSha256, artifactSha256s, artifactSetDigest,
    usageReceiptDigest, workerReportDigest: worker.reportDigest,
    accepted: claim.accepted, summary: claim.summary,
    criteria: claim.criteria, unresolved: claim.unresolved,
  };
  const reportDigest = await digest(report);
  await execution.completeAttempt({ ownerUserId: user, delegationId: delegation.id,
    artifactSetDigest, usageReceiptDigest, reportDigest, report, state: 'reviewed' });
  const evidence = [`jennifer:review-report:${reportDigest}`, `jennifer:task-report:${worker.reportDigest}`,
    ...artifactSha256s.map((hash) => `artifact:sha256:${hash}`), `usage-receipt:sha256:${usageReceiptDigest}`];
  return applyAmcEvent(next, {
    id: `jennifer-review-report-${delegation.id}`,
    type: 'verify_task', expectedRevision: next.revision,
    actor: `server:a2a-reviewer:${principal}`, role: 'reviewer', taskId: task.id,
    accepted: claim.accepted, evidence,
    criterionResults: claim.criteria.map((item) => ({
      criterionId: item.criterionId, passed: item.passed,
      evidence: [...item.evidenceRefs, `jennifer:review-report:${reportDigest}`],
    })),
  });
}

export async function GET(request: Request) {
  try {
    const user = await requestUser(request);
    const store = workStore(database());
    const query = new URL(request.url).searchParams;
    if (query.get('jennifer') === '1') {
      return json({ jobs: await store.listJenniferAmc(user) });
    }
    const planId = query.get('coordinationPlanId');
    if (planId !== null) {
      if (!/^jennifer-[0-9a-f]{8}$/u.test(planId))
        throw new WorkError('Jennifer plan IDの形式が不正です。');
      const job = await store.findAmcForJenniferPlan(user, planId);
      return json({ job, projection: job ? await buildJenniferProjection(user, job) : null });
    }
    const id = query.get('id');
    if (!id) return json({ jobs: await store.listAmc(user) });
    const job = await store.get(user, workId(id));
    if (!job?.amcGoal || job.templateId !== 'amc')
      throw new WorkError('AMCの計画が見つかりません。', 404);
    return json({ job, projection: isJenniferGoal(job.amcGoal) ? await buildJenniferProjection(user, job) : null });
  } catch (error) {
    return reject(request, error);
  }
}
export async function POST(request: Request) {
  try {
    const user = await requestUser(request);
    if (!(await rockstarServiceScopeAllowed(database(), user, 'zema',
      (env as unknown as { ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED?: string }).ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED,
    ))) {
      await request.body?.cancel().catch(() => {});
      return missingRockstarServiceScope('Zema');
    }
    const input = objectInput(await body(request), ['id', 'brief', 'importGoal', 'jenniferPlan']);
    let candidate;
    let jenniferPlan = null;
    if (Object.hasOwn(input, 'jenniferPlan')) {
      if (Object.hasOwn(input, 'brief') || Object.hasOwn(input, 'importGoal') ||
        !isJenniferCoordinationPlan(input.jenniferPlan))
        throw new WorkError('Jenniferの草案形式を確認してください。');
      jenniferPlan = input.jenniferPlan;
      candidate = createWorkJob({ id: input.id, templateId: 'amc',
        importGoal: createJenniferExecutionGoal(jenniferPlan, undefined, String(input.id)) });
    } else {
      candidate = createWorkJob({ ...input, templateId: 'amc' });
      if (candidate.amcGoal && isJenniferGoal(candidate.amcGoal))
        throw new WorkError('Jennifer Goalは草案planからサーバーで作成してください。', 409);
      requireSkyDraftImport(candidate.amcGoal);
    }
    candidate.amcCreationDigest = await digest(input);
    checkRecordSize(candidate);
    const db = database();
    const saved = jenniferPlan
      ? (await jenniferExecutionStore(db).createPlanWithRoot({
          ownerUserId: user,
          root: candidate,
          plan: jenniferPlan,
          planDigest: await digest(jenniferPlan),
        })).root
      : await workStore(db).create(user, candidate);
    if (
      !saved ||
      saved.templateId !== 'amc' ||
      saved.amcCreationDigest !== candidate.amcCreationDigest
    )
      throw new WorkError(
        'この保存IDは別の内容で使用されています。最新状態を確認してください。',
        409,
      );
    return json({ job: saved, projection: jenniferPlan ? await buildJenniferProjection(user, saved) : null }, 201);
  } catch (error) {
    return reject(request, error);
  }
}
export async function PATCH(request: Request) {
  try {
    const user = await requestUser(request);
    const input = objectInput(await body(request), ['jobId', 'revision', 'command', 'jennifer']);
    const store = workStore(database());
    const current = await store.get(user, workId(input.jobId));
    if (!current?.amcGoal || current.templateId !== 'amc')
      throw new WorkError('AMCの計画が見つかりません。', 404);
    if (isJenniferGoal(current.amcGoal)) {
      if (input.command !== undefined || !input.jennifer || typeof input.jennifer !== 'object' || Array.isArray(input.jennifer))
        throw new WorkError('Jenniferの承認・証拠・検収はサーバー専用操作から記録してください。', 409);
      const action = input.jennifer as Record<string, unknown>;
      if (Object.keys(action).some((key) => !['id', 'operation', 'resolutions', 'delegationId', 'plan'].includes(key)))
        throw new WorkError('Jennifer操作の形式が不正です。');
      const commandId = workId(action.id);
      const operation = action.operation;
      const previous = current.events.find(({ command }) => command.id === commandId);
      if (previous) {
        const previousType = previous.command.action === 'amc_event'
          ? previous.command.event.type : null;
        if (previousType !== `jennifer_${String(operation)}`)
          throw new WorkError('この操作IDは別のJennifer操作で使用されています。', 409);
        const cancellationWarnings = operation === 'stop'
          ? await requestJenniferCancellations(user, current.id) : [];
        return json({ job: current, projection: await buildJenniferProjection(user, current),
          ...(operation === 'stop' ? { cancellationWarnings } : {}) });
      }
      if (input.revision !== current.revision)
        throw new WorkError('別の画面で更新されています。最新状態を確認してください。', 409);
      const execution = jenniferExecutionStore(database());
      const plan = await execution.currentPlan(user, current.id);
      if (!plan) throw new WorkError('Jenniferの永続plan revisionが見つかりません。', 409);
      let nextGoal: AmcGoal = current.amcGoal;
      let nextPlanState = plan.state;
      let resolutions: JenniferQuestionResolution[] | undefined;
      let revised = false;
      let revisedPlan: JenniferCoordinationPlan | null = null;
      let revisedPlanDigest = '';
      let revisedPlanDiff: unknown = null;
      if (operation === 'approve_inventory') {
        if (plan.state !== 'draft' || nextGoal.state !== 'draft')
          throw new WorkError('保存済み草案だけをGoal Contract承認できます。', 409);
        resolutions = questionResolutions(action.resolutions);
        try { nextGoal = approveJenniferExecutionGoal(nextGoal, resolutions, `owner:${user}`); }
        catch (error) {
          throw new WorkError(error instanceof Error && error.message === 'JENNIFER_COLOMBIA_UNRESOLVED'
            ? 'COLOMBIAの各未決事項に回答または延期理由が必要です。' : 'Goal Contractを承認できません。', 409);
        }
        nextPlanState = 'inventory_approved';
      } else if (operation === 'approve_delivery') {
        if (plan.state !== 'inventory_approved' || nextGoal.state !== 'active' ||
          nextGoal.tasks.find(({ id }) => id === 'task-inventory')?.status !== 'done')
          throw new WorkError('型付き調査報告の独立検収が終わるまで実裌計画を承認できません。', 409);
        nextGoal = { ...nextGoal, coordinationRef: {
          ...(nextGoal.coordinationRef as JenniferExecutionCoordinationRef), phase: 'delivery',
        } };
        nextPlanState = 'delivery_approved';
      } else if (operation === 'pause' || operation === 'stop') {
        if (nextGoal.state !== 'active' || !['inventory_approved', 'delivery_approved'].includes(plan.state))
          throw new WorkError('実行中のJennifer Goalだけを停止できます。', 409);
        nextGoal = applyAmcEvent(nextGoal, {
          id: commandId, type: 'pause_goal', expectedRevision: nextGoal.revision,
          actor: `owner:${user}`, role: 'owner', reason: operation === 'stop'
            ? '所有者が新規dispatch停止と実行中委任の取消要求を指示した。'
            : '所有者が新規dispatchの一時停止を指示した。',
        });
        nextPlanState = 'paused';
      } else if (operation === 'resume') {
        if (plan.state !== 'paused' || nextGoal.state !== 'paused')
          throw new WorkError('一時停止中のGoalのみ再開できます。', 409);
        nextGoal = applyAmcEvent(nextGoal, { id: commandId, type: 'resume_goal',
          expectedRevision: nextGoal.revision, actor: `owner:${user}`, role: 'owner' });
        nextPlanState = (nextGoal.coordinationRef as JenniferExecutionCoordinationRef).phase === 'delivery'
          ? 'delivery_approved' : 'inventory_approved';
      } else if (operation === 'reconcile') {
        if (typeof action.delegationId !== 'string') throw new WorkError('Agent委任IDが必要です。');
        nextGoal = await reconcileJenniferDelegation(user, current, action.delegationId);
      } else if (operation === 'revise') {
        if (current.amcGoal.state !== 'paused' || plan.state !== 'paused' || !isJenniferCoordinationPlan(action.plan))
          throw new WorkError('計画編集は一時停止後の有効なJennifer草案だけできます。', 409);
        const projection = await buildJenniferProjection(user, current);
        if (projection.activeDelegations.length)
          throw new WorkError('実行中または停止未確認のAgentがいる間は計画を差し替えられません。', 409);
        const previousSnapshot = current.amcGoal.coordinationRef.planSnapshot;
        const diff = {
          fromRevision: plan.revision,
          toRevision: plan.revision + 1,
          goalChanged: previousSnapshot.amc.goalContract.goal !== action.plan.amc.goalContract.goal,
          request: { before: previousSnapshot.requestSummary, after: action.plan.requestSummary },
          taskIds: {
            before: previousSnapshot.amc.nodes.filter(({ kind }) => kind === 'task').map(({ id }) => id),
            after: action.plan.amc.nodes.filter(({ kind }) => kind === 'task').map(({ id }) => id),
          },
          approvalsInvalidated: true,
        };
        revisedPlan = action.plan;
        revisedPlanDigest = await digest(action.plan);
        revisedPlanDiff = diff;
        nextGoal = createJenniferExecutionGoal(revisedPlan, undefined, current.id);
        nextPlanState = 'draft';
        revised = true;
      } else if (operation === 'accept') {
        if (plan.state !== 'delivery_approved' || nextGoal.state !== 'active' ||
          nextGoal.tasks.some(({ status }) => status !== 'done'))
          throw new WorkError('全leafの型付きTaskReportと独立ReviewReportが揃うまで最終受入できません。', 409);
        const projection = await buildJenniferProjection(user, current);
        if (projection.activeDelegations.length || projection.costs.some(({ unknownCount }) => unknownCount > 0))
          throw new WorkError('結果不明または停止未確認の委任が残っています。', 409);
        const evidence = projection.attempts.flatMap((attempt) =>
          attempt.planRevision === plan.revision && attempt.reportDigest
            ? [`jennifer:report:${attempt.reportDigest}`] : []);
        const goalReceiptDigest = await digest({ planDigest: plan.planDigest, evidence, costs: projection.costs });
        nextGoal = applyAmcEvent(nextGoal, { id: commandId, type: 'accept_goal',
          expectedRevision: nextGoal.revision, actor: `owner:${user}`, role: 'owner', accepted: true,
          evidence: [...evidence, `jennifer:goal-receipt:${goalReceiptDigest}`],
          criterionResults: nextGoal.overallAcceptance.criteria.map(({ id }) => ({
            criterionId: id, passed: true, evidence: [`jennifer:goal-receipt:${goalReceiptDigest}`],
          })),
        });
        nextGoal = { ...nextGoal, coordinationRef: {
          ...(nextGoal.coordinationRef as JenniferExecutionCoordinationRef), phase: 'accepted',
        } };
        nextPlanState = 'accepted';
      } else throw new WorkError('Jennifer操作を確認してください。');

      if (operation === 'reconcile' && nextGoal === current.amcGoal)
        return json({ job: current, projection: await buildJenniferProjection(user, current) });

      const next = syncJenniferJob(current, nextGoal, commandId, {
        id: commandId, type: `jennifer_${String(operation)}`,
        actor: `owner:${user}`, role: 'owner', expectedRevision: current.amcGoal.revision,
      });
      checkRecordSize(next);
      if (revised && revisedPlan) {
        await execution.revisePlanWithRoot({ ownerUserId: user, root: next,
          previousRootRevision: current.revision, previous: plan,
          plan: revisedPlan, planDigest: revisedPlanDigest, diff: revisedPlanDiff });
      } else if (nextPlanState !== plan.state) {
        const from = operation === 'resume' ? ['paused'] :
          operation === 'approve_inventory' ? ['draft'] :
            operation === 'approve_delivery' ? ['inventory_approved'] :
              operation === 'accept' ? ['delivery_approved'] :
                ['draft', 'inventory_approved', 'delivery_approved'];
        await execution.commitStateWithRoot({ ownerUserId: user, root: next,
          previousRootRevision: current.revision, planRevision: plan.revision,
          from: from as typeof plan.state[], to: nextPlanState,
          approvedBy: `owner:${user}`, ...(resolutions ? { resolutions } : {}) });
      } else if (!(await store.update(user, next, current.revision))) {
        throw new WorkError('別の画面で更新されています。最新状態を確認してください。', 409);
      }
      const cancellationWarnings = operation === 'stop'
        ? await requestJenniferCancellations(user, current.id) : [];
      return json({ job: next, projection: await buildJenniferProjection(user, next),
        ...(operation === 'stop' ? { cancellationWarnings } : {}) });
    }
    const next = applyWorkCommand(current, current.amcGoal ? skyWebCommand(current.amcGoal, input.command, user) : input.command, input.revision);
    checkRecordSize(next);
    if (next !== current && !(await store.update(user, next, current.revision)))
      throw new WorkError(
        '別の画面で更新されています。最新状態を確認してください。',
        409,
      );
    return json({ job: next });
  } catch (error) {
    return reject(request, error);
  }
}
