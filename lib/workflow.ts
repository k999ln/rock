import { parseCompositionPlan, reviseComposition, capabilityFor, runnableCompositionNodes, COMPOSITION_TEXT_LIMIT, type CompositionState, type CompositionArtifact } from './work-composition.ts';
import { parseSkyAppRequest, parseSkyAppResult, type SkyAppBinding, type SkyAppResult } from './sky-app-contract.ts';

export const workflowTemplates = [
  {
    id: 'article',
    name: '記事の販売準備',
    description: '出典を整理し、無料版を作って内容を確認します。',
    steps: [
      {
        id: 'citations',
        title: '出典を整理',
        tool: 'mr-citations',
        runner: 'citations',
      },
      {
        id: 'free-article',
        title: '無料版を作成',
        tool: 'mr-free-article',
        runner: 'free-article',
      },
    ],
  },
  {
    id: 'coconala',
    name: 'ココナラ納品準備',
    description:
      '案件の条件と、制作後の納品記録を確認します。納品照合にはPC接続が必要です。',
    steps: [
      {
        id: 'eligibility',
        title: '案件の条件を確認',
        tool: 'coconala',
        runner: 'coconala',
      },
      {
        id: 'delivery',
        title: '納品記録を照合',
        tool: 'mr-delivery',
        runner: 'delivery-local',
      },
    ],
  },
  {
    id: 'cloud-agent',
    name: 'クラウドAgentへの委任',
    description: '依頼内容、接続先、見積・上限、実行後の成果確認をEveで管理します。',
    steps: [
      {
        id: 'agent-brief',
        title: '依頼内容と承認条件を確認',
        tool: 'sky-a2a-brief',
        runner: 'a2a-quote-check',
      },
      {
        id: 'agent-result',
        title: '委任結果を確認・記録',
        tool: 'sky-a2a-result',
        runner: 'a2a-result-check',
      },
    ],
  },
] as const;
export type WorkOutcome = 'passed' | 'needs_review' | 'failed';
export type WorkPlanGate =
  | 'none'
  | 'provider_quote_wallet_reservation_and_explicit_cloud_approval'
  | 'terminal_result_captured_with_usage_receipt';
export type WorkPlan = {
  schemaVersion: 1;
  objective: string;
  approvalGates: { stepId: string; requirement: WorkPlanGate }[];
};
export type WorkCommand =
  | {
      id: string;
      action: 'record';
      stepId: string;
      tool: string;
      transport: 'browser' | 'local-mcp' | 'terminal';
      outcome: WorkOutcome;
      sample: boolean;
      durationMs: number;
      delegationId?: string;
  }
  | {
      id: string;
      action: 'edit_plan';
      schemaVersion: 1;
      objective: string;
    }
  | { id: string; action: 'complete'; note: string }
  | { id: string; action: 'cancel' };
export type WorkJob = {
  resale?: import('./noah-resale.ts').ResaleState;
  eveNews?: import('./eve-news-work.ts').EveNewsWorkState;
  eveAgent?: { usageSources?: import('./sky-agent-usage-provenance.ts').CapturedAgentUsageSource[]; repairs?: import('./eve-agent-repair.ts').EveAgentRepair[]; acceptance?: import('./eve-agent-result-check.ts').EveAgentCriteria; schema: 'eve.agent-work/1'; threadId: string; creationRequestSha256?: string; stopRequestedAt?: number; stopCommandId?: string; stopProbeAt?: number };
  eveTool?: {
    agentBinding?: import('./eve-tool-agent.ts').EveToolAgentBinding;
    schema: 'eve.tool-work/1'; threadId: string; requestSha256: string;
    sourceSha256: string; planner: 'deterministic-citations/1' | 'validated-llm-candidate/1';
    planSha256?: string; outputStepId?: string;
    plannerCandidate?: { sha256: string; origin: 'untrusted-submitted-candidate'; modelLabel: string | null };
    planning?: import('./eve-planner-state.ts').EvePlannerState;
    repairCount?: number;
    pendingFailure?: { stepId: string; code: 'output_limit' | 'verification_failed' | 'adapter_failed'; repairable: boolean };
    failures?: { stepId: string; commandId: string; code: string; at: string; planSha256: string }[];
    verification?: { outputSha256: string; checkedAt: string; checks: { name: string; passed: boolean; detail: string }[] };
  };
  skyApp?: SkyAppBinding;
  composition?: CompositionState;
  id: string;
  title: string;
  templateId: string;
  plan: WorkPlan;
  revision: number;
  status: 'active' | 'review' | 'completed' | 'cancelled';
  steps: {
    id: string;
    title: string;
    tool: string;
    runner: string;
    passed: boolean;
  }[];
  events: { at: string; command: WorkCommand }[];
  createdAt: string;
  updatedAt: string;
};
export class WorkError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}
const planGateForStep = (templateId: string, stepId: string): WorkPlanGate => {
  if (templateId !== 'cloud-agent') return 'none';
  if (stepId === 'agent-brief')
    return 'provider_quote_wallet_reservation_and_explicit_cloud_approval';
  if (stepId === 'agent-result')
    return 'terminal_result_captured_with_usage_receipt';
  throw new WorkError('Cloud Agent計画の手順が不正です。');
};
function defaultWorkPlan(templateId: string, objective: string): WorkPlan {
  const template = workflowTemplates.find((item) => item.id === templateId);
  if (!template) throw new WorkError('仕事の種類を選んでください。');
  return {
    schemaVersion: 1,
    objective: boundedText(objective, 1000),
    approvalGates: template.steps.map((step) => ({
      stepId: step.id,
      requirement: planGateForStep(templateId, step.id),
    })),
  };
}
export function normalizeWorkJob(job: WorkJob): WorkJob {
  if (job.templateId === 'noah-resale') {
    if (job.resale?.schema !== 'noah.resale/1' || job.steps.length !== 0 || !Array.isArray(job.resale.items) || !Array.isArray(job.resale.operations)) throw new WorkError('リセールの保存形式を確認してください。');
    return job;
  }
  if (job.templateId === 'eve-news') {
    if (job.eveNews?.schema !== 'eve.news-work/1' || job.steps.length !== 2 || job.steps[0].id !== 'sources' || job.steps[1].id !== 'draft') throw new WorkError('ニュース草稿の保存形式を確認してください。');
    return job;
  }
  if (job.templateId === 'sky-linux-service') {
    if (job.plan?.schemaVersion !== 1 || typeof job.plan.objective !== 'string' || !job.plan.objective.trim() || job.plan.objective.length > 1000 ||
      job.steps.length !== 1 || job.steps[0].id !== 'generate' || job.steps[0].tool !== 'sky-linux-text' || job.steps[0].runner !== 'linux-private')
      throw new WorkError('専用Linuxの仕事の形式を確認してください。');
    return job;
  }
  if (job.templateId === 'sky-app') {
    if (!job.skyApp) throw new WorkError('Smith連携元がありません。');
    const request = parseSkyAppRequest(job.skyApp.request);
    if (job.skyApp.result) parseSkyAppResult(job.skyApp.result, job.id, request);
    return job;
  }
  if (job.templateId === 'composition') {
    if (!job.composition) throw new WorkError('組み合わせ計画がありません。');
    parseCompositionPlan(job.composition.plan);
    return job;
  }
  const expected = defaultWorkPlan(job.templateId, job.title);
  if (
    job.plan?.schemaVersion === 1 &&
    typeof job.plan.objective === 'string' &&
    job.plan.objective.trim().length > 0 &&
    job.plan.objective.length <= 1000 &&
    JSON.stringify(job.plan.approvalGates) === JSON.stringify(expected.approvalGates)
  )
    return job;
  const objective = typeof job.plan?.objective === 'string' &&
    job.plan.objective.trim().length > 0 && job.plan.objective.length <= 1000
    ? job.plan.objective.trim()
    : job.title;
  return { ...job, plan: { ...expected, objective } };
}
export function objectInput(value: unknown, keys: string[]) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !keys.includes(key))
  )
    throw new WorkError('入力項目を確認してください。');
  return value as Record<string, unknown>;
}
export function workId(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    throw new WorkError('IDの形式が不正です。');
  return value.toLowerCase();
}
function boundedText(value: unknown, max: number) {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > max ||
    Array.from(value).some(
      (char) => char.charCodeAt(0) < 32 && !['\t', '\n', '\r'].includes(char),
    )
  )
    throw new WorkError(`文字を入力してください（${max}文字まで）。`);
  return value.trim();
}
export function createWorkJob(
  value: unknown,
  now = new Date().toISOString(),
): WorkJob {
  const input = objectInput(value, ['id', 'title', 'templateId', 'plan']);
  if (input.templateId === 'composition') {
    const plan = parseCompositionPlan(input.plan);
    return {
      id: workId(input.id), title: boundedText(input.title, 120), templateId: 'composition',
      plan: { schemaVersion: 1, objective: plan.objective, approvalGates: [] },
      composition: { plan, source: null, artifacts: {}, operations: [] },
      revision: 0, status: 'active', events: [], createdAt: now, updatedAt: now,
      steps: plan.nodes.map((node) => ({ id: node.id, title: capabilityFor(node.tool)!.name, tool: node.tool, runner: 'composition', passed: false })),
    };
  }
  const template = workflowTemplates.find(
    (item) => item.id === input.templateId,
  );
  if (!template) throw new WorkError('仕事の種類を選んでください。');
  const title = boundedText(input.title, 120);
  const plan = input.plan === undefined
    ? defaultWorkPlan(template.id, title)
    : parseWorkPlan(input.plan, template.id, title);
  return {
    id: workId(input.id),
    title,
    templateId: template.id,
    plan,
    revision: 0,
    status: 'active',
    steps: template.steps.map((step) => ({ ...step, passed: false })),
    events: [],
    createdAt: now,
    updatedAt: now,
  };
}

/** Tab-local lab jobs deliberately have no public API/store creation path.
 * Passing these steps certifies local text processing only, never a Zoom action. */
export function createPrivateZoomWorkJob(
  value: { id: string; title: string; objective: string },
  now = new Date().toISOString(),
): WorkJob {
  return {
    id: workId(value.id), title: boundedText(value.title, 120), templateId: 'sky-zoom-private-lab',
    plan: { schemaVersion: 1, objective: boundedText(value.objective, 1000), approvalGates: [] },
    revision: 0, status: 'active', events: [], createdAt: now, updatedAt: now,
    steps: [
      { id: 'extract', title: '手入力メモを整理', tool: 'sky-private-zoom-extract', runner: 'browser-private', passed: false },
      { id: 'validate', title: '成果の形式を確認', tool: 'sky-private-zoom-validate', runner: 'browser-private', passed: false },
    ],
  };
}

/** Hidden from public createWorkJob templates; only the private Sky adapter endpoint creates these. */
export function createSkyAppWorkJob(id: string, value: unknown, now = new Date().toISOString()): WorkJob {
  const request = parseSkyAppRequest(value);
  return { ...createPrivateZoomWorkJob({ id, title: request.title, objective: request.objective }, now),
    templateId: 'sky-app', skyApp: { request, result: null },
    steps: [
      { id: 'extract', title: 'Smithの制限付き処理を実行', tool: 'sky-app-extract', runner: 'sky-app', passed: false },
      { id: 'validate', title: '連携元と成果形式を確認', tool: 'sky-app-validate', runner: 'sky-app', passed: false },
    ] };
}

/** Owner-local Linux adapter only. Not a public createWorkJob template. */
export function createPrivateLinuxWorkJob(id: string, title: string, objective: string): WorkJob {
  return { ...createPrivateZoomWorkJob({ id, title, objective }), templateId: 'sky-linux-private',
    steps: [{ id: 'generate', title: 'Linuxで文章を作成', tool: 'sky-linux-text', runner: 'linux-private', passed: false }] };
}

/** Common private text computation. No public creation path or external Tool authority. */
export function createPrivateTextWorkJob(id: string, title: string, objective: string): WorkJob {
  return { ...createPrivateZoomWorkJob({ id, title, objective }), templateId: 'sky-text-private',
    steps: [{ id: 'generate', title: '端末内で文章を作成', tool: 'sky-private-text', runner: 'owner-local-text', passed: false }] };
}

export function recordSkyAppResult(job: WorkJob, result: SkyAppResult, revision: number, commandId: string): WorkJob {
  if (job.templateId !== 'sky-app' || !job.skyApp) throw new WorkError('Smith連携の仕事ではありません。');
  const parsed = parseSkyAppResult(result, job.id, job.skyApp.request);
  if (job.events.some((event) => event.command.id === commandId)) {
    if (JSON.stringify(parsed) !== JSON.stringify(job.skyApp.result)) throw new WorkError('同じ実行IDの成果が異なります。', 409);
    return job;
  }
  if (job.revision !== revision || job.status !== 'active' || job.skyApp.result || job.steps.some((s) => s.passed))
    throw new WorkError('仕事の版または実行状態が変わりました。', 409);
  let next = job;
  for (const [index, step] of job.steps.entries()) next = applyWorkCommand(next,
    { id: index === 0 ? commandId : crypto.randomUUID(), action: 'record', stepId: step.id, tool: step.tool,
      transport: 'browser', outcome: 'passed', sample: false, durationMs: 0 }, next.revision);
  return { ...next, skyApp: { request: job.skyApp.request, result: parsed } };
}
function parseWorkPlan(value: unknown, templateId: string, fallbackObjective: string): WorkPlan {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new WorkError('計画の形式を確認してください。');
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => !['schemaVersion', 'objective'].includes(key)) ||
      input.schemaVersion !== 1)
    throw new WorkError('対応していない計画形式です。');
  return defaultWorkPlan(
    templateId,
    input.objective === undefined ? fallbackObjective : boundedText(input.objective, 1000),
  );
}
export function parseWorkCommand(value: unknown): WorkCommand {
  const base = objectInput(value, [
    'id',
    'action',
    'stepId',
    'tool',
    'transport',
    'outcome',
    'sample',
    'durationMs',
    'delegationId',
    'note',
    'schemaVersion',
    'objective',
  ]);
  const id = workId(base.id);
  if (base.action === 'cancel') {
    objectInput(value, ['id', 'action']);
    return { id, action: 'cancel' };
  }
  if (base.action === 'complete') {
    objectInput(value, ['id', 'action', 'note']);
    return { id, action: 'complete', note: boundedText(base.note, 2000) };
  }
  if (base.action === 'edit_plan') {
    objectInput(value, ['id', 'action', 'schemaVersion', 'objective']);
    if (base.schemaVersion !== 1)
      throw new WorkError('対応していない計画形式です。');
    return {
      id,
      action: 'edit_plan',
      schemaVersion: 1,
      objective: boundedText(base.objective, 1000),
    };
  }
  if (base.action !== 'record') throw new WorkError('操作を確認してください。');
  objectInput(value, [
    'id',
    'action',
    'stepId',
    'tool',
    'transport',
    'outcome',
    'sample',
    'durationMs',
    'delegationId',
  ]);
  if (
    typeof base.transport !== 'string' ||
    !['browser', 'local-mcp'].includes(base.transport) ||
    typeof base.outcome !== 'string' ||
    !['passed', 'needs_review', 'failed'].includes(base.outcome) ||
    typeof base.sample !== 'boolean' ||
    !Number.isInteger(base.durationMs) ||
    Number(base.durationMs) < 0 ||
    Number(base.durationMs) > 300000
  )
    throw new WorkError('実行記録の形式を確認してください。');
  if (base.delegationId !== undefined &&
    (typeof base.delegationId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(base.delegationId)))
    throw new WorkError('Agent委任IDの形式を確認してください。');
  return {
    id,
    action: 'record',
    stepId: boundedText(base.stepId, 40),
    tool: boundedText(base.tool, 40),
    transport: base.transport as 'browser' | 'local-mcp',
    outcome: base.outcome as WorkOutcome,
    sample: base.sample,
    durationMs: Number(base.durationMs),
    ...(typeof base.delegationId === 'string' ? { delegationId: base.delegationId.toLowerCase() } : {}),
  };
}
export function applyWorkCommand(
  job: WorkJob,
  value: unknown,
  revision: unknown,
  now = new Date().toISOString(),
): WorkJob {
  const command = parseWorkCommand(value);
  if (job.templateId === 'noah-resale') throw new WorkError('Noahのリセール画面から操作してください。', 409);
  if (job.eveNews && command.action !== 'cancel') throw new WorkError('ニュース草稿は専用の参照検査を使ってください。掲載・真偽確認の完了にはできません。',409);
  if (job.eveTool?.planning?.commands.some(c => c.id === command.id)) throw new WorkError('同じ操作IDを別の操作へ使えません。', 409);
  if (job.templateId === 'composition' && !['complete', 'cancel'].includes(command.action))
    throw new WorkError('組み合わせの計画・実行は専用画面から行ってください。', 409);
  const duplicate = job.events.find((event) => event.command.id === command.id);
  if (duplicate) {
    if (JSON.stringify(duplicate.command) !== JSON.stringify(command))
      throw new WorkError('同じ記録IDに異なる内容は保存できません。', 409);
    return job;
  }
  if (!Number.isInteger(revision) || revision !== job.revision)
    throw new WorkError(
      '別の操作で更新されています。一覧を再読込してください。',
      409,
    );
  if (job.status === 'completed' || job.status === 'cancelled')
    throw new WorkError('終了した仕事には記録を追加できません。', 409);
  if (command.action === 'edit_plan') {
    if (job.status !== 'active' || job.events.some((event) => event.command.action === 'record'))
      throw new WorkError('計画は最初の手順を始める前だけ編集できます。', 409);
    if (job.events.length >= 200)
      throw new WorkError('計画の更新履歴上限に達しました。', 409);
    if (command.schemaVersion !== job.plan.schemaVersion)
      throw new WorkError('計画の版が変わりました。再読込してください。', 409);
    return {
      ...job,
      plan: { ...job.plan, objective: command.objective },
      events: [...job.events, { at: now, command }],
      revision: job.revision + 1,
      updatedAt: now,
    };
  }
  if (job.templateId === 'cloud-agent' && command.action === 'record' && !command.delegationId)
    throw new WorkError('Agent手順は保存済みの委任IDと照合してから記録してください。', 409);
  if (job.events.length >= 200 && command.action === 'record')
    throw new WorkError(
      'この仕事の履歴上限に達しました。新しい仕事を作成してください。',
    );
  const next: WorkJob = {
    ...job,
    steps: job.steps.map((step) => ({ ...step })),
    events: [...job.events, { at: now, command }],
    revision: job.revision + 1,
    updatedAt: now,
  };
  if (command.action === 'cancel') {
    next.status = 'cancelled';
    if (job.skyApp) next.skyApp = { ...job.skyApp, result: null };
  }
  else if (command.action === 'complete') {
    if (job.skyApp && !job.skyApp.result) throw new WorkError('Smithの成果を確認してください。');
    if (job.composition && (job.composition.materialCleared || job.composition.plan.nodes.some((node) => job.composition!.artifacts[node.id]?.status !== 'passed')))
      throw new WorkError('最新の成果と完成条件をすべて検査してください。', 409);
    if (job.status !== 'review' || !job.steps.every((step) => step.passed))
      throw new WorkError('手順をすべて終えてから内容を確認してください。');
    next.status = 'completed';
  } else {
    const step = next.steps.find((item) => !item.passed);
    if (
      job.status !== 'active' ||
      !step ||
      step.id !== command.stepId ||
      step.tool !== command.tool
    )
      throw new WorkError('現在の手順と実行ツールが一致しません。');
    if (step.tool === 'mr-delivery' && command.transport !== 'local-mcp')
      throw new WorkError('納品照合にはPC接続が必要です。');
    if (!command.sample && command.outcome === 'passed') step.passed = true;
    if (next.steps.every((item) => item.passed)) next.status = 'review';
  }
  return next;
}

/** The server executes bounded, effect-free adapters before calling this reducer.
 * Public record commands cannot supply or certify composition outputs. */
export function updateComposedWork(
  job: WorkJob,
  update: { id: string; fingerprint: string; revision: number } & (
    { action: 'revise'; plan: unknown } |
    { action: 'clear' } |
    { action: 'fail'; stepId: string } |
    { action: 'run'; stepId: string; source: string; result: CompositionArtifact }
  ),
  now = new Date().toISOString(),
): WorkJob {
  if (!job.composition || job.templateId !== 'composition') throw new WorkError('組み合わせの仕事を選んでください。');
  const id = workId(update.id);
  const duplicate = job.composition.operations.find((operation) => operation.id === id);
  if (duplicate) {
    if (duplicate.fingerprint !== update.fingerprint) throw new WorkError('同じ操作IDの内容が異なります。', 409);
    return job;
  }
  if (update.revision !== job.revision) throw new WorkError('別の操作で更新されました。再読込してください。', 409);
  if (job.composition.operations.length >= 100) throw new WorkError('操作上限です。手順を保存して新しい仕事を作成してください。', 409);
  if (update.action !== 'clear' && ['completed', 'cancelled'].includes(job.status)) throw new WorkError('終了した仕事は変更できません。', 409);
  let composition: CompositionState;
  if (update.action === 'clear') composition = { ...job.composition, source: null, artifacts: {}, materialCleared: true };
  else if (update.action === 'revise') composition = reviseComposition(job.composition, parseCompositionPlan(update.plan));
  else if (update.action === 'fail') {
    if (job.status !== 'active' || !runnableCompositionNodes(job.composition).some(node => node.id === update.stepId)) throw new WorkError('失敗を記録できる工程ではありません。', 409);
    composition = { ...job.composition };
  }
  else {
    if (job.status !== 'active' || !runnableCompositionNodes(job.composition).some((node) => node.id === update.stepId))
      throw new WorkError('実行できる手順ではありません。計画と入力元を確認してください。', 409);
    if (!update.source.trim() || update.source.length > COMPOSITION_TEXT_LIMIT ||
        (job.composition.source !== null && job.composition.source !== update.source)) throw new WorkError('素材が不正です。素材を変える場合は先に素材を消去してください。');
    composition = { ...job.composition, source: update.source, artifacts: { ...job.composition.artifacts, [update.stepId]: update.result } };
    if (JSON.stringify(composition.artifacts).length > 100_000) throw new WorkError('成果の合計上限を超えました。仕事を分けてください。', 413);
  }
  composition.operations = [...composition.operations, { id, fingerprint: update.fingerprint }];
  const steps = composition.plan.nodes.map((node) => ({ id: node.id, title: capabilityFor(node.tool)!.name, tool: node.tool, runner: 'composition', passed: composition.artifacts[node.id]?.status === 'passed' }));
  return { ...job, composition, steps,
    plan: { ...job.plan, objective: composition.plan.objective },
    status: ['completed', 'cancelled'].includes(job.status) ? job.status : steps.every((step) => step.passed) ? 'review' : 'active',
    revision: job.revision + 1, updatedAt: now };
}

/** Bind the existing cloud job to Eve; this creates no delegation or grant. */
export function bindEveAgentWork(job: WorkJob, threadId: string, revision: number, now = new Date().toISOString()): WorkJob {
  workId(threadId);
  if (job.templateId !== 'cloud-agent') throw new WorkError('Cloud Agentの仕事を選んでください。');
  if (job.eveAgent) {
    if (job.eveAgent.threadId !== threadId) throw new WorkError('この仕事は別のEve会話へ接続済みです。', 409);
    return job;
  }
  if (job.revision !== revision) throw new WorkError('仕事を再読込してください。', 409);
  return { ...job, eveAgent: { schema: 'eve.agent-work/1', threadId }, revision: job.revision + 1, updatedAt: now };
}
export function requestEveAgentStop(job: WorkJob, commandId: string, revision: number, now = Date.now()): WorkJob {
  workId(commandId);
  if (!job.eveAgent || job.templateId !== 'cloud-agent') throw new WorkError('Eveへ接続したAgentの仕事を選んでください。');
  if (job.eveAgent.stopRequestedAt !== undefined || job.status === 'cancelled') return job;
  if (job.status === 'completed') throw new WorkError('完了済みの仕事です。', 409);
  if (job.revision !== revision) throw new WorkError('仕事を再読込してください。', 409);
  return { ...job, eveAgent: { ...job.eveAgent, stopRequestedAt: now, stopCommandId: commandId }, revision: job.revision + 1, updatedAt: new Date(now).toISOString() };
}

/** Rotate pending stop reconciliation fairly while retaining the same job and intent. */
export function probeEveAgentStop(job: WorkJob, now = Date.now()): WorkJob {
  if (job.eveAgent?.stopRequestedAt === undefined || job.status === 'cancelled' || job.status === 'completed') return job;
  return { ...job, eveAgent: { ...job.eveAgent, stopProbeAt: now }, revision: job.revision + 1, updatedAt: new Date(now).toISOString() };
}

/** Trusted server planner transition, before any Tool effects, under WorkJob CAS. */
export function updateEveToolPlanner(job: WorkJob, state: NonNullable<NonNullable<WorkJob['eveTool']>['planning']>, commandId: string, fingerprint: string, plan?: import('./work-composition.ts').CompositionPlan): WorkJob {
  if (!job.eveTool?.planning || !job.composition || job.status !== 'active' || job.composition.operations.length || Object.keys(job.composition.artifacts).length) throw new WorkError('実行前の計画作成だけを変更できます。', 409);
  const next = plan ? updateComposedWork(job, { id: commandId, fingerprint, revision: job.revision, action: 'revise', plan }) : { ...job, revision: job.revision + 1, updatedAt: new Date().toISOString() };
  return { ...next, eveTool: { ...job.eveTool, planning: state } };
}

/** Server observation only: terminal job/plan/budget are preserved even for late usage. */
export function recordEvePlannerObservation(job: WorkJob, state: NonNullable<NonNullable<WorkJob['eveTool']>['planning']>): WorkJob {
  if (!job.eveTool?.planning || state.attempts.length !== job.eveTool.planning.attempts.length || state.attempts.some((a, i) => a.id !== job.eveTool!.planning!.attempts[i].id)) throw new WorkError('保存済みの計画試行へ観測を接続してください。', 409);
  return { ...job, eveTool: { ...job.eveTool, planning: state }, revision: job.revision + 1, updatedAt: new Date().toISOString() };
}

/** Only the authenticated News adapter imports untrusted drafts; no generic record can certify them. */
export function createEveNewsJob(id: string, state: NonNullable<WorkJob['eveNews']>, now = new Date().toISOString()): WorkJob {
  return {id:workId(id),title:boundedText(state.packet.topic.slice(0,120),120),templateId:'eve-news',eveNews:state,
    plan:{schemaVersion:1,objective:boundedText(state.packet.topic,1000),approvalGates:[]},revision:0,status:'active',events:[],createdAt:now,updatedAt:now,
    steps:[{id:'sources',title:'資料の日時・重複・訂正参照を検査',tool:'eve-news-source-audit',runner:'news-review',passed:false},{id:'draft',title:'草稿と主張台帳の対応を検査',tool:'eve-news-draft-audit',runner:'news-review',passed:false}]};
}
export function recordEveNewsAudit(job: WorkJob, audit: import('./eve-news-audit.ts').NewsAudit, revision: number, commandId: string, durationMs: number): WorkJob {
  if (!job.eveNews || job.status==='cancelled' || job.status==='completed' || revision!==job.revision) throw new WorkError('保存したニュース仕事を読み直してください。',409);
  if (job.events.length>=200) throw new WorkError('ニュース仕事の操作上限に達しました。',409);
  const sourcePassed=audit.checks.filter(check=>['unique_source_urls','source_times','correction_references'].includes(check.id)).every(check=>check.passed),draftPassed=audit.checks.every(check=>check.passed);
  return {...job,events:[...job.events,{at:audit.checkedAt,command:{id:commandId,action:'record',stepId:'draft',tool:'eve-news-draft-audit',transport:'browser',outcome:draftPassed?'passed':'needs_review',sample:false,durationMs}}],eveNews:{...job.eveNews,audit},steps:job.steps.map(step=>({...step,passed:step.id==='sources'?sourcePassed:draftPassed})),status:draftPassed?'review':'active',revision:job.revision+1,updatedAt:audit.checkedAt};
}

/** Owner-supplied revision of a failed draft. Source packet and initial request identity stay fixed. */
export function reviseEveNewsDraft(job: WorkJob, draft: import('./eve-news-audit.ts').NewsDraft, reason: string, hash: string, revision: number, commandId: string): WorkJob {
  const news=job.eveNews, now=new Date().toISOString();
  if(!news||!['active','review'].includes(job.status)||revision!==job.revision||!news.audit)throw new WorkError('検査済みの停止していない草稿だけ修正できます。',409);
  if(news.repairAttempts?.some(attempt=>attempt.state==='sending'&&attempt.leaseUntil>Date.now()))throw new WorkError('モデル修正の結果を確認してください。進行中の草稿は置き換えられません。',409);
  if((news.revisions?.length??0)>=2||job.events.length>=200)throw new WorkError('この仕事の修正上限（2回）に達しました。元の資料と検査結果を確認してください。',409);
  if(JSON.stringify({...news.draft,generatedAt:'',modelProfileIdAndHash:''})===JSON.stringify({...draft,generatedAt:'',modelProfileIdAndHash:''}))throw new WorkError('草稿が変更されていません。');
  const entry={draft:news.draft,audit:news.audit,replacedAt:now,reason,commandId,replacementSha256:hash};
  const {audit:_audit,...rest}=news;
  return {...job,eveNews:{...rest,draft,revisions:[...news.revisions??[],entry]},status:'active',steps:job.steps.map(step=>({...step,passed:false})),revision:job.revision+1,updatedAt:now,
    events:[...job.events,{at:now,command:{id:commandId,action:'record',stepId:'draft',tool:'eve-news-draft-revision',transport:'browser',outcome:'needs_review',sample:false,durationMs:0}}]};
}

/** Append rights-scoped sources while preserving the exact previous source/draft/audit basis. */
export function appendEveNewsSources(job:WorkJob,packet:import('./eve-news-audit.ts').NewsPacket,draft:import('./eve-news-audit.ts').NewsDraft,reason:string,hash:string,revision:number,commandId:string):WorkJob {
 const news=job.eveNews,now=new Date().toISOString();
 if(!news||!['active','review'].includes(job.status)||job.revision!==revision)throw new WorkError('停止していない同じニュース仕事へ追加してください。',409);
 if((news.sourceRevisions?.length??0)>=3||job.events.length>=200)throw new WorkError('資料追加の上限（3回）に達しました。',409);
 if(news.repairAttempts?.some(a=>a.state==='sending'&&a.leaseUntil>Date.now()))throw new WorkError('実行中モデルの結果を確認してから資料を追加してください。',409);
 if(packet.jobId!==news.packet.jobId||packet.topic!==news.packet.topic||packet.sources.length<=news.packet.sources.length||packet.sources.length>12||JSON.stringify(packet.sources.slice(0,news.packet.sources.length))!==JSON.stringify(news.packet.sources))throw new WorkError('元の資料は変更せず、新しい資料を追加してください。',409);
 for(const key of ['headline','articleText','claimLedger','unresolvedQuestions','modelProfileIdAndHash','generatedAt'] as const)if(JSON.stringify(draft[key])!==JSON.stringify(news.draft[key]))throw new WorkError('資料追加では本文や主張を変更できません。',409);
 const {audit:_audit,...rest}=news;
 const entry={packet:news.packet,draft:news.draft,...(news.audit?{audit:news.audit}:{}),replacedAt:now,reason,commandId,replacementSha256:hash};
 return {...job,eveNews:{...rest,packet,draft,sourceRevisions:[...news.sourceRevisions??[],entry]},status:'active',steps:job.steps.map(step=>({...step,passed:false})),revision:job.revision+1,updatedAt:now,events:[...job.events,{at:now,command:{id:commandId,action:'record',stepId:'sources',tool:'eve-news-source-addition',transport:'browser',outcome:'needs_review',sample:false,durationMs:0}}]};
}

/** Purpose-bound dataset preparation permission; never a training or publication grant. */
export function recordEveNewsLearningConsent(job:WorkJob,consent:import('./eve-news-learning.ts').NewsLearningConsent,revision:number):WorkJob{
 const news=job.eveNews;if(!news||job.revision!==revision)throw new WorkError('仕事の版が変わりました。読み直してください。',409);
 const grants=(news.learningConsents??[]).filter(c=>c.status==='granted'),latest=news.learningConsents?.at(-1);
 if(consent.status==='granted'){
  if(!['active','review'].includes(job.status)||grants.length>=10||job.events.length>=200)throw new WorkError('この仕事では準備同意を追加できません。',409);
  if(latest?.status==='granted'&&latest.dataSha256===consent.dataSha256&&latest.split===consent.split)throw new WorkError('この対象への同意は保存済みです。',409);
 }
 const consentHistory=consent.status==='withdrawn'&&latest?.status==='withdrawn'?[...news.learningConsents!.slice(0,-1),consent]:[...news.learningConsents??[],consent];
 const event={at:consent.at,command:{id:consent.commandId,action:'record' as const,stepId:'sources',tool:'eve-news-learning-preparation-consent',transport:'browser' as const,outcome:'needs_review' as const,sample:false,durationMs:0}};
 return {...job,eveNews:{...news,learningConsents:consentHistory},revision:job.revision+1,updatedAt:consent.at,events:job.events.length<200?[...job.events,event]:job.events};
}

/** Server-only repair observation, including late usage after owner stop. */
export function recordEveNewsRepair(job: WorkJob, attempts: NonNullable<NonNullable<WorkJob['eveNews']>['repairAttempts']>): WorkJob {
  if(!job.eveNews)throw new WorkError('ニュース仕事を確認してください。',409);
  return {...job,eveNews:{...job.eveNews,repairAttempts:attempts},revision:job.revision+1,updatedAt:new Date().toISOString()};
}

/** Only the authenticated resale service may call this reducer after validating its action. */
export function recordResaleWork(job: WorkJob, state: import('./noah-resale.ts').ResaleState, revision: number, commandId: string, action: string, transport: 'browser' | 'terminal' = 'browser'): WorkJob {
  if(job.templateId!=='noah-resale' || state.schema!=='noah.resale/1' || job.revision!==revision)
    throw new WorkError('リセールの保存版が変わりました。',409);
  if(job.status==='cancelled' && !['finish','reconcile'].includes(action)) throw new WorkError('この仕事は停止しています。',409);
  if(job.events.length>=1000)throw new WorkError('監査履歴の上限です。');
  return {...job,resale:state,revision:revision+1,updatedAt:new Date().toISOString(),
    events:[...job.events,{at:new Date().toISOString(),command:{id:workId(commandId),action:'record',stepId:action,tool:'noah-resale',transport,outcome:'needs_review',sample:false,durationMs:0}}]};
}
