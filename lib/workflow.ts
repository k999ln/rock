import {
  createAmcGoal,
  validateAmcGoal,
  applyAmcEvent,
  AMC_TOOL_ID,
  type AmcBrief,
  type AmcEvent,
  type AmcGoal,
} from './amc-tool.ts';

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
  | { id: string; action: 'amc_event'; event: AmcEvent }
  | { id: string; action: 'cancel' };
export type WorkJob = {
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
  amcGoal?: AmcGoal;
  amcCreationDigest?: string;
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
  if (templateId === 'amc') return { schemaVersion: 1, objective: boundedText(objective, 1000), approvalGates: [] };
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
  if (
    value &&
    typeof value === 'object' &&
    'templateId' in value &&
    value.templateId === 'amc'
  ) {
    const input = objectInput(value, [
      'id',
      'templateId',
      'brief',
      'importGoal',
    ]);
    const id = workId(input.id);
    if (Object.hasOwn(input, 'brief') === Object.hasOwn(input, 'importGoal'))
      throw new WorkError('依頼またはGoalファイルを一つ指定してください。');
    let goal: AmcGoal;
    try {
      if (Object.hasOwn(input, 'brief')) {
        const brief = objectInput(input.brief, ['request', 'goal', 'intent']);
        goal = createAmcGoal(id, brief as AmcBrief, now);
      } else goal = validateAmcGoal(input.importGoal);
    } catch (error) {
      throw new WorkError(
        error instanceof Error
          ? error.message
          : 'Goalの形式を確認してください。',
      );
    }
    return syncAmcWorkJob(
      {
        id,
        title: goal.instruction.slice(0, 120),
        templateId: 'amc',
        revision: 0,
        status: 'active',
        steps: [],
        events: [],
        createdAt: now,
        updatedAt: now,
        amcGoal: goal,
        plan: defaultWorkPlan('amc', goal.instruction.slice(0, 120)),
      },
      goal,
    );
  }
  const input = objectInput(value, ['id', 'title', 'templateId', 'plan']);
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
    'event',
  ]);
  const id = workId(base.id);
  if (base.action === 'amc_event') {
    objectInput(value, ['id', 'action', 'event']);
    const event = objectInput(base.event, [
      'id',
      'type',
      'actor',
      'role',
      'expectedRevision',
      'at',
      'taskId',
      'reason',
      'outcome',
      'summary',
      'deliverables',
      'evidence',
      'accepted',
      'criterionResults',
      'scopeConfirmed',
      'coverageStatement',
      'acceptanceCriteria',
      'taskPlanReviews',
    ]);
    if (event.id !== undefined && event.id !== id)
      throw new WorkError('記録IDが一致しません。');
    if (
      !Number.isSafeInteger(event.expectedRevision) ||
      typeof event.type !== 'string' ||
      typeof event.actor !== 'string' ||
      !['owner', 'worker', 'reviewer'].includes(String(event.role))
    )
      throw new WorkError('AMC記録の形式を確認してください。');
    const { at: _at, ...stable } = event;
    return { id, action: 'amc_event', event: { ...stable, id } as AmcEvent };
  }
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
  if (job.amcGoal || job.templateId === 'amc') {
    if (!job.amcGoal || command.action !== 'amc_event')
      throw new WorkError(
        'AMCはGoal専用の承認・記録・停止操作を使ってください。',
      );
    if (command.event.expectedRevision !== job.amcGoal.revision)
      throw new WorkError(
        'Goalが更新されています。再読込して確認してください。',
        409,
      );
    if (job.events.length >= 1000)
      throw new WorkError(
        '記録上限です。JSONを保存して次のGoalへ引き継いでください。',
      );
    let goal: AmcGoal;
    try {
      goal = applyAmcEvent(job.amcGoal, { ...command.event, at: now });
    } catch (error) {
      throw new WorkError(
        error instanceof Error ? error.message : 'AMC記録を更新できません。',
      );
    }
    return syncAmcWorkJob(
      {
        ...job,
        revision: job.revision + 1,
        updatedAt: now,
        events: [...job.events, { at: now, command }],
      },
      goal,
    );
  }
  if (command.action === 'amc_event')
    throw new WorkError('AMC以外の仕事にはAMC記録を追加できません。');
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

function syncAmcWorkJob(job: WorkJob, goal: AmcGoal): WorkJob {
  const next: WorkJob = {
    ...job,
    amcGoal: goal,
    status:
      goal.state === 'accepted'
        ? 'completed'
        : goal.state === 'active' &&
            goal.tasks.every((task) => task.status === 'done')
          ? 'review'
          : 'active',
    steps: goal.tasks
      .filter((task) => !task.childTaskIds.length)
      .map((task) => ({
        id: task.id,
        title: task.title,
        tool: AMC_TOOL_ID,
        runner: 'amc',
        passed: task.status === 'done',
      })),
  };
  if (new TextEncoder().encode(JSON.stringify(next)).byteLength > 1_900_000)
    throw new WorkError('履歴を含む保存上限（1.9 MB）です。Goal JSONを保存し、別記録へ引き継いでください。', 413);
  return next;
}
