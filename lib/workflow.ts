import { parseCompositionPlan, reviseComposition, capabilityFor, runnableCompositionNodes, COMPOSITION_TEXT_LIMIT, type CompositionState, type CompositionArtifact } from './work-composition.ts';

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
    description: '依頼内容、接続先、見積・上限、実行後の成果確認をZemaで管理します。',
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
      transport: 'browser' | 'local-mcp';
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
  if (command.action === 'cancel') next.status = 'cancelled';
  else if (command.action === 'complete') {
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
