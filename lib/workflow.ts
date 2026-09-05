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
] as const;
export type WorkOutcome = 'passed' | 'needs_review' | 'failed';
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
    }
  | { id: string; action: 'complete'; note: string }
  | { id: string; action: 'cancel' };
export type WorkJob = {
  id: string;
  title: string;
  templateId: string;
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
  const input = objectInput(value, ['id', 'title', 'templateId']);
  const template = workflowTemplates.find(
    (item) => item.id === input.templateId,
  );
  if (!template) throw new WorkError('仕事の種類を選んでください。');
  return {
    id: workId(input.id),
    title: boundedText(input.title, 120),
    templateId: template.id,
    revision: 0,
    status: 'active',
    steps: template.steps.map((step) => ({ ...step, passed: false })),
    events: [],
    createdAt: now,
    updatedAt: now,
  };
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
    'note',
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
  return {
    id,
    action: 'record',
    stepId: boundedText(base.stepId, 40),
    tool: boundedText(base.tool, 40),
    transport: base.transport as 'browser' | 'local-mcp',
    outcome: base.outcome as WorkOutcome,
    sample: base.sample,
    durationMs: Number(base.durationMs),
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
  if (job.status === 'completed' || job.status === 'cancelled')
    throw new WorkError('終了した仕事には記録を追加できません。', 409);
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
