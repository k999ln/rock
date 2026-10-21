import {
  parseCompositionPlan, reviseComposition, capabilityFor, runnableCompositionNodes,
  COMPOSITION_TEXT_LIMIT, type CompositionState, type CompositionArtifact,
  compositionRecipe, validateCompositionState,
} from './work-composition.ts';
import {
  createAmcGoal,
  validateAmcGoal,
  applyAmcEvent,
  AMC_TOOL_ID,
  type AmcBrief,
  type AmcEvent,
  type AmcGoal,
} from './amc-tool.ts';
import type { MaterialStudy } from './material-study.ts';
import {
  parseJenniferTaskJobCoordination,
  type JenniferTaskJobCoordination,
} from './jennifer-amc-execution.ts';
import { parseSkyAppRequest, parseSkyAppResult, type SkyAppBinding, type SkyAppResult } from './sky-app-contract.ts';

export const workflowTemplates = [
  {id:'free-cloud-text',name:'無料Cloudの文章生成',description:'無料Cloudで生成し、応答と使用量を記録して本人が確認します。',steps:[{id:'generate',title:'応答と使用量を取得',tool:'sky-free-cloud-text',runner:'free-cloud-text'}]},
  {
    id: 'material-invention', name: '物質候補の机上比較',
    description: '配合候補と安全上の不足を保存・確認します。実験、性能評価、装置操作は行いません。',
    steps: [{ id: 'generate', title: '候補と確認事項を生成', tool: 'rockstar-material-invention', runner: 'material-invention' }],
  },
  {
    id: 'sky-code-publication', name: 'Skyコードの公開',
    description: '本人が選んだ保護条件を検証し、コードを版付きで公開します。実行許可ではありません。',
    steps: [{ id: 'publish', title: '公開条件を検証してコードを保存', tool: 'sky-code-publication', runner: 'sky-code-publication' }],
  },
  {
    id: 'spider-security',
    name: 'SPIDERの入力検査',
    description: '明示入力を端末内で静的検査し、結果と範囲を確認します。安全認定や外部送信承認ではありません。',
    steps: [{ id: 'inspect', title: '入力の静的検査を実行する', tool: 'rockstar-spider', runner: 'spider-inspect' }],
  },
  {
    id: 'sky-citation-agent',
    name: 'Sky 出典整理Agent',
    description: 'ブラウザだけで依頼を受け、出典を整理した成果を本人の仕事として保存します。モデル推論や外部検索は行いません。',
    steps: [{ id: 'organize-sources', title: '出典を整理して成果を保存', tool: 'mr-citations', runner: 'sky-first-party' }],
  },
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
  freeCloud?: {requestDigest:string; model:string; state:'prepared'|'sending'|'completed'|'unconfirmed'|'waiting'|'queued'|'cancelled'; source:string; backgroundPrompt?:string; backgroundConsent?:boolean; retryAt?:number; retryDeadline?:number; attempts?:number; autoContinue?:boolean; text?:string; providerResponseId?:string; reportedModel?:string; inputTokens?:number; outputTokens?:number; chargeMinor?:0; error?:string};
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
  amcGoal?: AmcGoal;
  amcCreationDigest?: string;
  materialStudy?: MaterialStudy;
  coordination?: JenniferTaskJobCoordination;
  standaloneAgent?: {
    schema: 'sky.citations.result/1';
    agentId: 'sky-citation-agent';
    inputSha256: string;
    language: 'ja' | 'en';
    text: string;
    sourceCount: number;
    warnings: string[];
    execution: 'first-party-rules';
  };
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
  if (job.templateId === 'sky-linux-service') {
    if (job.plan?.schemaVersion !== 1 || typeof job.plan.objective !== 'string' || !job.plan.objective.trim() || job.plan.objective.length > 1000 ||
      job.steps.length !== 1 || job.steps[0].id !== 'generate' || job.steps[0].tool !== 'sky-linux-text' || job.steps[0].runner !== 'linux-private')
      throw new WorkError('専用Linuxの仕事の形式を確認してください。');
    return job;
  }
  if (job.templateId === 'sky-app') {
    if (!job.skyApp) throw new WorkError('Sky連携元がありません。');
    const request = parseSkyAppRequest(job.skyApp.request);
    if (job.skyApp.result) parseSkyAppResult(job.skyApp.result, job.id, request);
    return job;
  }
  if (job.templateId === 'composition') {
    validateCompositionJob(job);
    return job;
  }
  const coordination = job.coordination === undefined
    ? undefined
    : parseJenniferTaskJobCoordination(job.coordination);
  if (job.coordination !== undefined && !coordination)
    throw new WorkError('Jennifer task jobの関連付けが不正です。');
  const expected = defaultWorkPlan(job.templateId, job.title);
  if (
    job.plan?.schemaVersion === 1 &&
    typeof job.plan.objective === 'string' &&
    job.plan.objective.trim().length > 0 &&
    job.plan.objective.length <= 1000 &&
    JSON.stringify(job.plan.approvalGates) === JSON.stringify(expected.approvalGates)
  )
    return coordination ? { ...job, coordination } : job;
  const objective = typeof job.plan?.objective === 'string' &&
    job.plan.objective.trim().length > 0 && job.plan.objective.length <= 1000
    ? job.plan.objective.trim()
    : job.title;
  return {
    ...job,
    ...(coordination ? { coordination } : {}),
    plan: { ...expected, objective },
  };
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
  const input = objectInput(value, ['id', 'title', 'templateId', 'plan', 'coordination']);
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
  const coordination = input.coordination === undefined
    ? undefined
    : parseJenniferTaskJobCoordination(input.coordination);
  if (input.coordination !== undefined && !coordination)
    throw new WorkError('Jennifer task jobの関連付けが不正です。');
  if (coordination && template.id !== 'cloud-agent')
    throw new WorkError('Jenniferの担当si jobはCloud Agent形式で作成してください。');
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
    ...(coordination ? { coordination } : {}),
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
      { id: 'extract', title: 'Skyの制限付き処理を実行', tool: 'sky-app-extract', runner: 'sky-app', passed: false },
      { id: 'validate', title: '連携元と成果形式を確認', tool: 'sky-app-validate', runner: 'sky-app', passed: false },
    ] };
}

/** Owner-local Linux adapter only. Not a public createWorkJob template. */
export function createPrivateLinuxWorkJob(id: string, title: string, objective: string): WorkJob {
  return { ...createPrivateZoomWorkJob({ id, title, objective }), templateId: 'sky-linux-private',
    steps: [{ id: 'generate', title: 'Linuxで文章を作成', tool: 'sky-linux-text', runner: 'linux-private', passed: false }] };
}

export function recordSkyAppResult(job: WorkJob, result: SkyAppResult, revision: number, commandId: string): WorkJob {
  if (job.templateId !== 'sky-app' || !job.skyApp) throw new WorkError('Sky連携の仕事ではありません。');
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
  if (job.templateId === 'material-invention' && command.action === 'record' &&
      (!job.materialStudy || command.sample !== job.materialStudy.sample))
    throw new WorkError('物質候補は専用画面で生成し、サンプル区分を維持してください。', 409);
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
    if (job.skyApp && !job.skyApp.result) throw new WorkError('Skyの成果を確認してください。');
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

/** The server executes bounded, effect-free adapters before calling this reducer.
 * Public record commands cannot supply or certify composition outputs. */
export function updateComposedWork(
  job: WorkJob,
  update: { id: string; fingerprint: string; revision: number } & (
    { action: 'revise'; plan: unknown } |
    { action: 'clear' } |
    { action: 'save_recipe'; name: string } |
    { action: 'delete_recipe' } |
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
  if (!['clear', 'delete_recipe'].includes(update.action) && job.composition.operations.length >= 100) throw new WorkError('操作上限です。手順を保存して新しい仕事を作成してください。', 409);
  if (!['clear', 'save_recipe', 'delete_recipe'].includes(update.action) && ['completed', 'cancelled'].includes(job.status)) throw new WorkError('終了した仕事は変更できません。', 409);
  let composition: CompositionState;
  if (update.action === 'clear') composition = { ...job.composition, source: null, artifacts: {}, materialCleared: true };
  else if (update.action === 'save_recipe') {
    if (!['review', 'completed'].includes(job.status) || job.composition.materialCleared || job.steps.some((step) => !step.passed))
      throw new WorkError('手順と完成条件の検査を終えてからレシピを保存してください。', 409);
    composition = { ...job.composition, recipe: { name: boundedText(update.name, 100), plan: compositionRecipe(job.composition.plan) } };
  } else if (update.action === 'delete_recipe') {
    composition = { ...job.composition };
    delete composition.recipe;
  } else if (update.action === 'revise') composition = reviseComposition(job.composition, parseCompositionPlan(update.plan));
  else {
    if (job.status !== 'active' || !runnableCompositionNodes(job.composition).some((node) => node.id === update.stepId))
      throw new WorkError('実行できる手順ではありません。計画と入力元を確認してください。', 409);
    if (!update.source.trim() || update.source.length > COMPOSITION_TEXT_LIMIT ||
        (job.composition.source !== null && job.composition.source !== update.source)) throw new WorkError('素材が不正です。素材を変える場合は先に素材を消去してください。');
    composition = { ...job.composition, source: update.source, artifacts: { ...job.composition.artifacts, [update.stepId]: update.result } };
    if (JSON.stringify(composition.artifacts).length > 100_000) throw new WorkError('成果の合計上限を超えました。仕事を分けてください。', 413);
  }
  composition.operations = [...composition.operations, { id, fingerprint: update.fingerprint }];
  // Erasure remains available even after the operation cap; bound only its audit metadata.
  if (['clear', 'delete_recipe'].includes(update.action)) composition.operations = composition.operations.slice(-100);
  const steps = composition.plan.nodes.map((node) => ({ id: node.id, title: capabilityFor(node.tool)!.name, tool: node.tool, runner: 'composition', passed: composition.artifacts[node.id]?.status === 'passed' }));
  return { ...job, composition, steps,
    plan: { ...job.plan, objective: composition.plan.objective },
    status: ['completed', 'cancelled'].includes(job.status) ? job.status : steps.every((step) => step.passed) ? 'review' : 'active',
    revision: job.revision + 1, updatedAt: now };
}

function validateCompositionJob(job: WorkJob) {
  validateCompositionState(job.composition);
  const state = job.composition;
  if (job.plan?.schemaVersion !== 1 || job.plan.objective !== state.plan.objective || !Array.isArray(job.plan.approvalGates) || job.plan.approvalGates.length !== 0 ||
      !Array.isArray(job.steps) || job.steps.length !== state.plan.nodes.length)
    throw new WorkError('保存された手順と計画が一致しません。');
  for (let i = 0; i < job.steps.length; i++) {
    const step = job.steps[i], node = state.plan.nodes[i];
    if (step.id !== node.id || step.title !== capabilityFor(node.tool)!.name || step.tool !== node.tool || step.runner !== 'composition' || step.passed !== (state.artifacts[node.id]?.status === 'passed'))
      throw new WorkError('保存された手順と成果が一致しません。');
  }
  const allPassed = job.steps.every((step) => step.passed);
  if (!state.materialCleared && ((job.status === 'active' && allPassed) || (['review', 'completed'].includes(job.status) && !allPassed)))
    throw new WorkError('仕事の状態と成果が一致しません。');
}
