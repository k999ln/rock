import { catalog } from './catalog.ts';

export type MaterialKind = 'text' | 'csv';
export type Capability = {
  id: string;
  name: string;
  accepts: readonly MaterialKind[];
  output: MaterialKind | 'same';
  available: boolean;
  limitation: string;
};
const executable: Record<
  string,
  Pick<Capability, 'accepts' | 'output' | 'limitation'>
> = {
  'mr-citations': {
    accepts: ['text'],
    output: 'text',
    limitation: '出典URLを整理。事実確認は行いません。',
  },
  'mr-free-article': {
    accepts: ['text'],
    output: 'text',
    limitation: '入力原稿を編集。要点・無料範囲・販売先の指定が必要です。',
  },
  'rockstar-csv-cleanup': {
    accepts: ['csv'],
    output: 'csv',
    limitation:
      'UTF-8の小さなCSVを加工・独立検査。実CSV受付の決済・納品記録とは別です。',
  },
};
export const compositionCapabilities: Capability[] = [
  ...catalog.map((tool): Capability => ({
    id: tool.id,
    name: tool.name,
    accepts: executable[tool.id]?.accepts ?? ['text'],
    output: executable[tool.id]?.output ?? 'text',
    available: Boolean(executable[tool.id]),
    limitation:
      executable[tool.id]?.limitation ??
      `${tool.environment}。この合成実行への接続は未受入です。`,
  })),
  {
    id: 'compose-join',
    name: '成果をまとめる',
    accepts: ['text'],
    output: 'text',
    available: true,
    limitation: '複数の文章成果を指定順に結合します。',
  },
  {
    id: 'compose-check',
    name: '完成条件を検査',
    accepts: ['text', 'csv'],
    output: 'same',
    available: true,
    limitation:
      '文字数・必須文言・CSV構造を検査。意味・品質の最終検収は本人が行います。',
  },
];
export const capabilityFor = (id: string) =>
  compositionCapabilities.find((item) => item.id === id);
export const COMPOSITION_TEXT_LIMIT = 12_000;
export type CompositionNode = {
  id: string;
  tool: string;
  inputs: string[];
  config: Record<string, unknown>;
};
export type CompositionPlan = {
  version: 1;
  objective: string;
  acceptance: string;
  inputKind: MaterialKind;
  budgetMinor: number;
  currency: 'JPY' | 'USD';
  deadline: string;
  nodes: CompositionNode[];
};
export type CompositionArtifact = {
  kind: MaterialKind;
  text: string;
  status: 'passed' | 'needs_review';
  checks: { name: string; passed: boolean; detail: string }[];
};
export type CompositionState = {
  plan: CompositionPlan;
  source: string | null;
  artifacts: Record<string, CompositionArtifact>;
  operations: { id: string; fingerprint: string }[];
  materialCleared?: boolean;
  creationFingerprint?: string;
  recipe?: { name: string; plan: CompositionPlan };
};
export class CompositionError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}
function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !keys.includes(key))
  )
    throw new CompositionError('計画の入力項目を確認してください。');
  return value as Record<string, unknown>;
}
function bounded(value: unknown, name: string, max: number, empty = false) {
  if (
    typeof value !== 'string' ||
    value.length > max ||
    (!empty && !value.trim())
  )
    throw new CompositionError(`${name}を${max}文字以内で指定してください。`);
  return value.trim();
}
export function parseCompositionPlan(value: unknown): CompositionPlan {
  const p = object(value, [
    'version',
    'objective',
    'acceptance',
    'inputKind',
    'budgetMinor',
    'currency',
    'deadline',
    'nodes',
  ]);
  if (
    p.version !== 1 ||
    !['text', 'csv'].includes(String(p.inputKind)) ||
    !['JPY', 'USD'].includes(String(p.currency)) ||
    !Number.isSafeInteger(p.budgetMinor) ||
    Number(p.budgetMinor) < 0 ||
    Number(p.budgetMinor) !== 0 ||
    !Array.isArray(p.nodes) ||
    p.nodes.length < 1 ||
    p.nodes.length > 12
  )
    throw new CompositionError(
      '入力形式・手順数（1〜12）を確認してください。この接続済みローカル処理は無料（予算0）です。',
    );
  const deadline = bounded(p.deadline ?? '', '期限', 10, true);
  if (
    deadline &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(deadline) ||
      !Number.isFinite(Date.parse(deadline)) ||
      new Date(deadline).toISOString().slice(0, 10) !== deadline)
  )
    throw new CompositionError('期限の日付が不正です。');
  const kinds = new Map<string, MaterialKind>([
    ['source', p.inputKind as MaterialKind],
  ]);
  const nodes = p.nodes.map((raw): CompositionNode => {
    const n = object(raw, ['id', 'tool', 'inputs', 'config']);
    if (
      typeof n.id !== 'string' ||
      !/^s[0-9]{1,8}$/.test(n.id) ||
      kinds.has(n.id)
    )
      throw new CompositionError('手順IDが不正または重複しています。');
    const cap = capabilityFor(String(n.tool));
    if (cap && !cap.available)
      throw new CompositionError(
        `${cap.name}はこの仕事への接続が未受入です。接続済みの処理を選んでください。`,
        409,
      );
    if (
      !cap ||
      !Array.isArray(n.inputs) ||
      n.inputs.length < 1 ||
      n.inputs.length > 12 ||
      new Set(n.inputs).size !== n.inputs.length
    )
      throw new CompositionError('処理と入力元を確認してください。');
    const inputs = n.inputs.map((input) => {
      if (typeof input !== 'string' || !kinds.has(input))
        throw new CompositionError(
          '入力元は素材または前の手順を指定してください。循環・未定義参照は使えません。',
        );
      if (!cap.accepts.includes(kinds.get(input)!))
        throw new CompositionError(`${cap.name}に入力形式が合いません。`);
      return input;
    });
    if (inputs.length > 1 && cap.id !== 'compose-join')
      throw new CompositionError(
        '複数の成果は「成果をまとめる」で結合してください。',
      );
    if (
      !n.config ||
      typeof n.config !== 'object' ||
      Array.isArray(n.config) ||
      JSON.stringify(n.config).length > 3000
    )
      throw new CompositionError(
        '処理設定を確認してください（3000文字以内）。',
      );
    kinds.set(n.id, cap.output === 'same' ? kinds.get(inputs[0])! : cap.output);
    return {
      id: n.id,
      tool: cap.id,
      inputs,
      config: n.config as Record<string, unknown>,
    };
  });
  // Every deliverable leaf must be checked; a disconnected passing check cannot certify other branches.
  const used = new Set(nodes.flatMap((n) => n.inputs));
  if (nodes.some((n) => !used.has(n.id) && n.tool !== 'compose-check'))
    throw new CompositionError(
      '各成果の最後に「完成条件を検査」を接続してください。',
    );
  return {
    version: 1,
    objective: bounded(p.objective, '目的', 1000),
    acceptance: bounded(p.acceptance, '完成条件', 1000),
    inputKind: p.inputKind as MaterialKind,
    budgetMinor: Number(p.budgetMinor),
    currency: p.currency as 'JPY' | 'USD',
    deadline,
    nodes,
  };
}
export function defaultCompositionConfig(
  tool: string,
): Record<string, unknown> {
  if (tool === 'compose-check') return { minChars: 1, requiredText: [] };
  if (tool === 'rockstar-csv-cleanup')
    return {
      outputEncoding: 'utf8',
      trim: [],
      dedupe: { keys: [], mode: 'report_only' },
    };
  if (tool === 'mr-free-article')
    return {
      afterChars: 100,
      price: 500,
      summary: '',
      paidContents: '',
      noteUrl: '',
    };
  return {};
}
/** Deterministic draft only. This never executes, sends text, grants access or invents a missing capability. */
export function suggestComposition(
  objective: string,
  inputKind: MaterialKind,
): CompositionPlan {
  const tools: string[] = inputKind === 'csv' ? ['rockstar-csv-cleanup'] : [];
  if (inputKind === 'text' && /出典|引用|記事|原稿/.test(objective))
    tools.push('mr-citations');
  if (inputKind === 'text' && /無料版|紹介記事/.test(objective))
    tools.push('mr-free-article');
  tools.push('compose-check');
  return {
    version: 1,
    objective,
    acceptance: '',
    inputKind,
    budgetMinor: 0,
    currency: 'JPY',
    deadline: '',
    nodes: tools.map((tool, i) => ({
      id: `s${i + 1}`,
      tool,
      inputs: [i === 0 ? 'source' : `s${i}`],
      config: defaultCompositionConfig(tool),
    })),
  };
}
export function runnableCompositionNodes(
  state: CompositionState,
): CompositionNode[] {
  if (state.materialCleared) return [];
  return state.plan.nodes.filter(
    (node) =>
      state.artifacts[node.id]?.status !== 'passed' &&
      capabilityFor(node.tool)?.available &&
      node.inputs.every(
        (input) =>
          input === 'source' || state.artifacts[input]?.status === 'passed',
      ),
  );
}
export function reviseComposition(
  state: CompositionState,
  plan: CompositionPlan,
): CompositionState {
  const artifacts: CompositionState['artifacts'] = {};
  // A changed objective, acceptance criteria or format invalidates all old acceptance evidence.
  const contextSame =
    state.plan.objective === plan.objective &&
    state.plan.acceptance === plan.acceptance &&
    state.plan.inputKind === plan.inputKind;
  for (const node of plan.nodes) {
    const old = state.plan.nodes.find((item) => item.id === node.id);
    if (
      contextSame &&
      JSON.stringify(old) === JSON.stringify(node) &&
      state.artifacts[node.id]?.status === 'passed' &&
      node.inputs.every((id) => id === 'source' || artifacts[id])
    )
      artifacts[node.id] = state.artifacts[node.id];
  }
  return {
    ...state,
    plan,
    artifacts,
    source: state.plan.inputKind === plan.inputKind ? state.source : null,
    materialCleared: false,
  };
}
/** A reusable recipe contains no customer text, objective, editorial settings, budget, or evidence. */
export function compositionRecipe(plan: CompositionPlan) {
  return {
    ...plan,
    objective: '',
    acceptance: '',
    deadline: '',
    budgetMinor: 0,
    nodes: plan.nodes.map((node) => ({
      ...node,
      config: defaultCompositionConfig(node.tool),
    })),
  };
}

/** Validate stored evidence without repairing it or upgrading assertions. */
export function validateCompositionState(
  value: unknown,
): asserts value is CompositionState {
  const s = object(value, [
    'plan',
    'source',
    'artifacts',
    'operations',
    'materialCleared',
    'creationFingerprint',
    'recipe',
  ]);
  const plan = parseCompositionPlan(s.plan);
  if (
    s.source !== null &&
    (typeof s.source !== 'string' ||
      !s.source.trim() ||
      s.source.length > COMPOSITION_TEXT_LIMIT)
  )
    throw new CompositionError('保存された素材を確認できません。');
  if (s.materialCleared !== undefined && typeof s.materialCleared !== 'boolean')
    throw new CompositionError('保存された削除状態が不正です。');
  if (
    s.creationFingerprint !== undefined &&
    (typeof s.creationFingerprint !== 'string' ||
      !/^[a-f0-9]{64}$/.test(s.creationFingerprint))
  )
    throw new CompositionError('作成操作の保存記録が不正です。');
  const artifacts = object(
    s.artifacts,
    plan.nodes.map((n) => n.id),
  );
  if (JSON.stringify(artifacts).length > 100_000)
    throw new CompositionError('成果の保存上限を超えています。');
  const kinds = new Map<string, MaterialKind>([['source', plan.inputKind]]);
  for (const n of plan.nodes) {
    const cap = capabilityFor(n.tool)!;
    const kind = cap.output === 'same' ? kinds.get(n.inputs[0])! : cap.output;
    kinds.set(n.id, kind);
    if (artifacts[n.id] === undefined) continue;
    const a = object(artifacts[n.id], ['kind', 'text', 'status', 'checks']);
    if (
      a.kind !== kind ||
      !cap.available ||
      typeof a.text !== 'string' ||
      !a.text.trim() ||
      a.text.length > COMPOSITION_TEXT_LIMIT ||
      !['passed', 'needs_review'].includes(String(a.status)) ||
      !Array.isArray(a.checks) ||
      a.checks.length > 200 ||
      n.inputs.some(
        (id) =>
          id !== 'source' &&
          (artifacts[id] as CompositionArtifact | undefined)?.status !==
            'passed',
      )
    )
      throw new CompositionError('保存された成果と入力元を確認できません。');
    for (const c of a.checks) {
      const check = object(c, ['name', 'passed', 'detail']);
      if (
        typeof check.name !== 'string' ||
        typeof check.detail !== 'string' ||
        typeof check.passed !== 'boolean'
      )
        throw new CompositionError('保存された検査記録が不正です。');
    }
    if (
      (a.status === 'passed') !==
        a.checks.every((c) => (c as { passed: boolean }).passed) ||
      (n.tool === 'compose-check' && a.checks.length === 0)
    )
      throw new CompositionError('成果の検査状態が一致しません。');
  }
  if (
    (s.source === null && Object.keys(artifacts).length !== 0) ||
    (s.materialCleared === true &&
      (s.source !== null || Object.keys(artifacts).length !== 0))
  )
    throw new CompositionError('素材と成果の保存状態が一致しません。');
  if (!Array.isArray(s.operations) || s.operations.length > 100)
    throw new CompositionError('操作記録を確認できません。');
  const ids = new Set<string>();
  for (const raw of s.operations) {
    const op = object(raw, ['id', 'fingerprint']);
    if (
      typeof op.id !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
        op.id,
      ) ||
      ids.has(op.id) ||
      typeof op.fingerprint !== 'string' ||
      !/^[a-f0-9]{64}$/.test(op.fingerprint)
    )
      throw new CompositionError('操作記録が不正または重複しています。');
    ids.add(op.id);
  }
  if (s.recipe !== undefined) {
    const r = object(s.recipe, ['name', 'plan']);
    bounded(r.name, 'レシピ名', 100);
    parseCompositionRecipe(r.plan);
  }
}

export function parseCompositionRecipe(value: unknown): CompositionPlan {
  const candidate = object(value, [
    'version',
    'objective',
    'acceptance',
    'inputKind',
    'budgetMinor',
    'currency',
    'deadline',
    'nodes',
  ]);
  const parsed = parseCompositionPlan({
    ...candidate,
    objective: 'レシピ検査',
    acceptance: 'レシピ検査',
  });
  const sanitized = compositionRecipe(parsed);
  if (JSON.stringify(value) !== JSON.stringify(sanitized))
    throw new CompositionError('レシピに以前の素材や設定が含まれています。');
  return sanitized;
}

export type CompositionRecipeView = {
  id: string;
  jobRevision: number;
  name: string;
  recipe: CompositionPlan;
};

/** Browser retries and server writes share this exact operation fingerprint contract. */
export async function compositionPayloadFingerprint(
  payload: unknown,
): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(payload)),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}
