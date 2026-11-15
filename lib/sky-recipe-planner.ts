/**
 * Sky recipe planner — 「どのToolを組み合わせるか」を本人に考えさせないための選択器。
 *
 * 選ぶ単位はTool単体ではなく、手元の素材から欲しい成果までの工程（recipe）。
 * 比べる値は「検収に通る成果を1つ得るまでの期待総額」:
 *   (実費 + 本人の手間 × 本人の1分の値段 + 初回準備の按分) ÷ 工程全体の合格率
 *
 * この関数群は順位を出すだけで、Toolの実行・課金・外部送信を許可しない。
 * 実行はBroker・Wallet・Jevの既存gateを通す（docs/structure/04 §5）。
 */

export type RecipeCapabilityKind = 'tool' | 'owner' | 'reviewer';

export type RecipeCapability = {
  id: string;
  name: string;
  /** tool: 自動処理 / owner: 本人がやる工程 / reviewer: 本人以外の人の確認 */
  kind: RecipeCapabilityKind;
  /** 必要な素材の型。全部そろうと実行できる。 */
  consumes: readonly string[];
  /** 作る素材の型。 */
  produces: string;
  /** falseの能力は候補に入れない（未接続・未受入）。 */
  available: boolean;
  /** 1回あたりの実費（最小通貨単位）。 */
  costMinor: number;
  /** 1回あたり本人が使う分数。 */
  ownerMinutes: number;
  /** 1回あたりの待ち時間（分）。 */
  waitMinutes: number;
  /** 初回だけ要る接続・設定・開発の実費。準備済みなら0として扱う。 */
  setupMinor: number;
  /** 初回だけ要る本人の分数。 */
  setupOwnerMinutes: number;
  /** 準備済みか。 */
  installed: boolean;
};

/** Receiptから集計した実績。未観測の能力は省略してよい。 */
export type RecipeObservation = {
  capabilityId: string;
  runs: number;
  accepted: number;
};

export type RecipeGoal = {
  /** 手元にある素材の型。 */
  have: readonly string[];
  /** 欲しい成果の型。 */
  want: string;
  /** 1回あたりの実費上限。 */
  budgetMinor: number;
  /** 本人の1分の値段。やりたくない作業ほど高く置く。 */
  ownerMinuteValueMinor: number;
  /** この仕事が今後あと何回起きる見込みか（1 = 今回だけ）。 */
  expectedRepeats: number;
  /** 本人が自分でやりたい成果の型。ここは自動化しない。 */
  keepForSelf: readonly string[];
  /** 待てる合計分数。省略時は制限なし。 */
  deadlineMinutes?: number;
};

export type RecipeStep = {
  capabilityId: string;
  name: string;
  kind: RecipeCapabilityKind;
  produces: string;
};

export type RecipeCandidate = {
  /** 工程の同一性。実績の集計と固定に使う。 */
  key: string;
  steps: RecipeStep[];
  /** 工程全体が1回で検収に通る見込み（0〜1）。 */
  acceptanceRate: number;
  /** 1回あたりの実費。 */
  costMinor: number;
  /** 1回あたり本人が使う分数（本人が望んだ工程を除く）。 */
  unwantedOwnerMinutes: number;
  /** 1回あたり本人が望んで関わる分数。 */
  chosenOwnerMinutes: number;
  waitMinutes: number;
  /** 今回新たに必要な初回準備の実費。 */
  setupMinor: number;
  setupOwnerMinutes: number;
  /** 検収に通る成果1つあたりの期待総額。小さいほど良い。 */
  expectedMinor: number;
  /** 実績が少ない工程を試す価値を含めた楽観値。試行枠の順位に使う。 */
  optimisticMinor: number;
  /** 実績が最も少ない工程の実行回数。 */
  evidenceRuns: number;
  reason: string;
};

export type RecipeGap = {
  /** 欲しい成果に届かなかった理由。 */
  reason: 'no_capability_produces_goal' | 'inputs_unreachable' | 'over_budget_or_deadline';
  /** 足りない素材の型。ここを作れる能力を足せば届く。 */
  missingMaterials: string[];
  /** 接続すれば使える未接続の能力。 */
  unavailableCapabilityIds: string[];
};

export type RecipePlan = {
  candidates: RecipeCandidate[];
  gap: RecipeGap | null;
};

export const RECIPE_MAX_STEPS = 6;
export const RECIPE_MAX_CANDIDATES = 200;
/** 列挙の打ち切り。順番違いの重複を含む生の列の上限。 */
const RECIPE_MAX_ENUMERATED = 5_000;
/** 5回に1回は実績の少ない工程を試す。lib/sky-continuous-ranking.ts の探索枠と同じ比率。 */
export const RECIPE_TRIAL_INTERVAL = 5;
/** 連続でこの回数検収に通った工程は固定し、毎回の再計画を省く。 */
export const RECIPE_FREEZE_STREAK = 5;
/** 固定済みの工程を置き換えるのに必要な改善率。 */
export const RECIPE_SWITCH_MARGIN = 0.2;

export class RecipePlannerError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

const materialPattern = /^[a-z][a-z0-9-]{0,47}$/u;
const idPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{1,95}$/u;

function requireValue(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new RecipePlannerError(code, message);
}

const amount = (value: number) => Number.isSafeInteger(value) && value >= 0;
const minutes = (value: number) => Number.isFinite(value) && value >= 0 && value <= 100_000;

export function validateRecipeCapability(capability: RecipeCapability) {
  requireValue(idPattern.test(capability?.id ?? ''), 'CAPABILITY_ID', '能力IDが不正です。');
  requireValue(
    typeof capability.name === 'string' && capability.name.trim() && capability.name.length <= 120,
    'CAPABILITY_NAME',
    '能力名を120文字以内で指定してください。',
  );
  requireValue(
    capability.kind === 'tool' || capability.kind === 'owner' || capability.kind === 'reviewer',
    'CAPABILITY_KIND',
    '能力の種類が不正です。',
  );
  requireValue(
    Array.isArray(capability.consumes) && capability.consumes.length >= 1 && capability.consumes.length <= 6 &&
      new Set(capability.consumes).size === capability.consumes.length &&
      capability.consumes.every((item) => materialPattern.test(item)),
    'CAPABILITY_INPUT',
    '必要な素材の型を1〜6個で指定してください。',
  );
  requireValue(
    materialPattern.test(capability.produces) && !capability.consumes.includes(capability.produces),
    'CAPABILITY_OUTPUT',
    '作る素材の型が不正です。入力と同じ型は作れません。',
  );
  requireValue(typeof capability.available === 'boolean' && typeof capability.installed === 'boolean', 'CAPABILITY_STATE', '接続状態が不正です。');
  requireValue(amount(capability.costMinor) && amount(capability.setupMinor), 'CAPABILITY_COST', '実費は0以上の整数で指定してください。');
  requireValue(
    minutes(capability.ownerMinutes) && minutes(capability.waitMinutes) && minutes(capability.setupOwnerMinutes),
    'CAPABILITY_TIME',
    '分数が不正です。',
  );
  return capability;
}

export function validateRecipeGoal(goal: RecipeGoal) {
  requireValue(
    Array.isArray(goal?.have) && goal.have.length >= 1 && goal.have.length <= 12 && goal.have.every((item) => materialPattern.test(item)),
    'GOAL_HAVE',
    '手元の素材の型を1〜12個で指定してください。',
  );
  requireValue(materialPattern.test(goal.want) && !goal.have.includes(goal.want), 'GOAL_WANT', '欲しい成果の型が不正か、既に手元にあります。');
  requireValue(amount(goal.budgetMinor), 'GOAL_BUDGET', '予算は0以上の整数で指定してください。');
  requireValue(amount(goal.ownerMinuteValueMinor), 'GOAL_MINUTE_VALUE', '本人の1分の値段は0以上の整数で指定してください。');
  requireValue(Number.isSafeInteger(goal.expectedRepeats) && goal.expectedRepeats >= 1 && goal.expectedRepeats <= 100_000, 'GOAL_REPEATS', '繰り返し回数は1以上の整数で指定してください。');
  requireValue(
    Array.isArray(goal.keepForSelf) && goal.keepForSelf.length <= 12 && goal.keepForSelf.every((item) => materialPattern.test(item)),
    'GOAL_KEEP',
    '自分でやりたい成果の型が不正です。',
  );
  requireValue(goal.deadlineMinutes === undefined || minutes(goal.deadlineMinutes), 'GOAL_DEADLINE', '期限の分数が不正です。');
  return goal;
}

/**
 * 合格率の見積り。観測なしは0.5、観測が増えるほど実績に寄る（Laplace平滑化）。
 * 楽観値は「次の1回が通ったら」の率で、実績の少ない能力ほど大きく上がる。
 */
export function acceptanceEstimate(observation: RecipeObservation | undefined) {
  const runs = observation?.runs ?? 0;
  const accepted = observation?.accepted ?? 0;
  requireValue(
    Number.isSafeInteger(runs) && Number.isSafeInteger(accepted) && runs >= 0 && accepted >= 0 && accepted <= runs,
    'OBSERVATION',
    '実績の回数が不正です。',
  );
  return {
    runs,
    mean: (accepted + 1) / (runs + 2),
    optimistic: Math.min(1, (accepted + 2) / (runs + 2)),
  };
}

function scoreRecipe(
  steps: RecipeCapability[],
  goal: RecipeGoal,
  observations: Map<string, RecipeObservation>,
): RecipeCandidate | null {
  let rate = 1;
  let optimisticRate = 1;
  let costMinor = 0;
  let unwantedOwnerMinutes = 0;
  let chosenOwnerMinutes = 0;
  let waitMinutes = 0;
  let setupMinor = 0;
  let setupOwnerMinutes = 0;
  let evidenceRuns = Number.POSITIVE_INFINITY;
  for (const step of steps) {
    const estimate = acceptanceEstimate(observations.get(step.id));
    rate *= estimate.mean;
    optimisticRate *= estimate.optimistic;
    evidenceRuns = Math.min(evidenceRuns, estimate.runs);
    costMinor += step.costMinor;
    waitMinutes += step.waitMinutes + step.ownerMinutes;
    // 本人が「ここは自分でやりたい」と言った工程の時間は、費用ではなく目的として扱う。
    if (step.kind === 'owner' && goal.keepForSelf.includes(step.produces)) chosenOwnerMinutes += step.ownerMinutes;
    else unwantedOwnerMinutes += step.ownerMinutes;
    if (!step.installed) {
      setupMinor += step.setupMinor;
      setupOwnerMinutes += step.setupOwnerMinutes;
    }
  }
  if (costMinor > goal.budgetMinor) return null;
  if (goal.deadlineMinutes !== undefined && waitMinutes > goal.deadlineMinutes) return null;
  const perAttempt = costMinor + unwantedOwnerMinutes * goal.ownerMinuteValueMinor;
  // 初回準備は、この仕事が起きる回数で割る。1回きりの仕事に大きな自動化を作らないための項。
  const setupShare = (setupMinor + setupOwnerMinutes * goal.ownerMinuteValueMinor) / goal.expectedRepeats;
  const expectedMinor = perAttempt / rate + setupShare;
  const optimisticMinor = perAttempt / optimisticRate + setupShare;
  const key = steps.map((step) => step.id).join('>');
  const owner = unwantedOwnerMinutes ? `本人の手間${Math.round(unwantedOwnerMinutes)}分` : '本人の手間なし';
  const setup = setupMinor || setupOwnerMinutes
    ? `、初回準備を${goal.expectedRepeats}回で按分`
    : '';
  return {
    key,
    steps: steps.map((step) => ({ capabilityId: step.id, name: step.name, kind: step.kind, produces: step.produces })),
    acceptanceRate: Math.round(rate * 10_000) / 10_000,
    costMinor,
    unwantedOwnerMinutes,
    chosenOwnerMinutes,
    waitMinutes,
    setupMinor,
    setupOwnerMinutes,
    expectedMinor: Math.round(expectedMinor * 100) / 100,
    optimisticMinor: Math.round(optimisticMinor * 100) / 100,
    evidenceRuns: Number.isFinite(evidenceRuns) ? evidenceRuns : 0,
    reason: `${steps.length}工程、実費${costMinor}、${owner}、合格見込み${Math.round(rate * 100)}%${setup}。`,
  };
}

/**
 * 手元の素材から欲しい成果へ届く工程を列挙し、期待総額の小さい順に並べる。
 * 届かない場合は、何の素材が足りないかを返す（Noaが能力を探す・作るための入力）。
 */
export function planRecipes(
  goalInput: RecipeGoal,
  capabilityInput: readonly RecipeCapability[],
  observationInput: readonly RecipeObservation[] = [],
): RecipePlan {
  const goal = validateRecipeGoal(goalInput);
  const ids = new Set<string>();
  for (const capability of capabilityInput) {
    validateRecipeCapability(capability);
    requireValue(!ids.has(capability.id), 'CAPABILITY_DUPLICATE', '同じ能力IDが重複しています。');
    ids.add(capability.id);
  }
  const observations = new Map(observationInput.map((item) => [item.capabilityId, item]));
  // 本人が自分でやりたい型は、本人の工程だけが作れる。自動処理に置き換えない。
  const usable = capabilityInput.filter(
    (capability) => capability.available && (!goal.keepForSelf.includes(capability.produces) || capability.kind === 'owner'),
  );

  const found: RecipeCapability[][] = [];
  let withinLimits = false;
  const walk = (materials: Set<string>, steps: RecipeCapability[]) => {
    if (found.length >= RECIPE_MAX_ENUMERATED) return;
    if (materials.has(goal.want)) {
      found.push(steps);
      return;
    }
    if (steps.length >= RECIPE_MAX_STEPS) return;
    for (const capability of usable) {
      // 既にある素材を作り直す工程は足さない。これで循環と無駄な工程を除く。
      if (materials.has(capability.produces)) continue;
      if (!capability.consumes.every((item) => materials.has(item))) continue;
      walk(new Set([...materials, capability.produces]), [...steps, capability]);
    }
  };
  walk(new Set(goal.have), []);

  // 成果に使われない工程を含む列は、同じ成果へ届く短い列の言い換えなので除く。
  const needed = (steps: RecipeCapability[]) => {
    const required = new Set([goal.want]);
    for (const step of [...steps].reverse()) {
      if (!required.has(step.produces)) return false;
      for (const item of step.consumes) required.add(item);
    }
    return true;
  };
  const candidates = new Map<string, RecipeCandidate>();
  for (const steps of found.filter(needed)) {
    const candidate = scoreRecipe(steps, goal, observations);
    if (!candidate) continue;
    withinLimits = true;
    // 同じ能力の集合は順番違いでも同じ工程。最初に見つけた順序を残す。
    const identity = steps.map((step) => step.id).sort().join('|');
    if (!candidates.has(identity)) candidates.set(identity, candidate);
  }
  const ranked = [...candidates.values()].sort(
    (a, b) => a.expectedMinor - b.expectedMinor || a.steps.length - b.steps.length || a.key.localeCompare(b.key),
  ).slice(0, RECIPE_MAX_CANDIDATES);
  if (ranked.length) return { candidates: ranked, gap: null };

  if (found.length && !withinLimits)
    return { candidates: [], gap: { reason: 'over_budget_or_deadline', missingMaterials: [], unavailableCapabilityIds: [] } };

  // 届く素材を出し、欲しい成果を作れる能力の入力のうち届かないものを報告する。
  const reachable = new Set(goal.have);
  for (let changed = true; changed; ) {
    changed = false;
    for (const capability of usable) {
      if (!reachable.has(capability.produces) && capability.consumes.every((item) => reachable.has(item))) {
        reachable.add(capability.produces);
        changed = true;
      }
    }
  }
  const producers = usable.filter((capability) => capability.produces === goal.want);
  const missing = new Set<string>();
  for (const capability of producers)
    for (const item of capability.consumes) if (!reachable.has(item)) missing.add(item);
  return {
    candidates: [],
    gap: {
      reason: producers.length ? 'inputs_unreachable' : 'no_capability_produces_goal',
      missingMaterials: producers.length ? [...missing].sort() : [goal.want],
      unavailableCapabilityIds: capabilityInput
        .filter((capability) => !capability.available && (capability.produces === goal.want || missing.has(capability.produces)))
        .map((capability) => capability.id)
        .sort(),
    },
  };
}

/** 工程ごとの直近の検収結果。新しいものが末尾。 */
export type RecipeHistory = { key: string; outcomes: readonly boolean[] };

export type RecipeChoice = {
  candidate: RecipeCandidate;
  mode: 'frozen' | 'best' | 'trial';
  reason: string;
};

function acceptedStreak(outcomes: readonly boolean[]) {
  let streak = 0;
  for (let index = outcomes.length - 1; index >= 0 && outcomes[index]; index -= 1) streak += 1;
  return streak;
}

/**
 * 今回使う工程を1つ決める。乱数は使わない。
 * 1. 連続で検収に通っている工程は固定して再利用する（毎回考え直さない）。
 * 2. 固定を外すのは、直近が不合格のとき、または別の工程の期待総額が2割以上良いとき。
 * 3. 5回に1回は、実績の少ない工程を楽観値で選んで試す。
 */
export function chooseRecipe(
  plan: RecipePlan,
  history: readonly RecipeHistory[] = [],
  completedRuns = 0,
): RecipeChoice | null {
  requireValue(Number.isSafeInteger(completedRuns) && completedRuns >= 0, 'RUN_COUNT', '実行回数が不正です。');
  const best = plan.candidates[0];
  if (!best) return null;
  const outcomes = new Map(history.map((item) => [item.key, item.outcomes]));
  const frozen = plan.candidates.find((candidate) => acceptedStreak(outcomes.get(candidate.key) ?? []) >= RECIPE_FREEZE_STREAK);
  if (frozen && (frozen.key === best.key || best.expectedMinor > frozen.expectedMinor * (1 - RECIPE_SWITCH_MARGIN)))
    return { candidate: frozen, mode: 'frozen', reason: `${RECIPE_FREEZE_STREAK}回連続で検収に通った工程を再利用します。` };
  if (completedRuns % RECIPE_TRIAL_INTERVAL === RECIPE_TRIAL_INTERVAL - 1) {
    const trial = [...plan.candidates].sort(
      (a, b) => a.optimisticMinor - b.optimisticMinor || a.evidenceRuns - b.evidenceRuns || a.key.localeCompare(b.key),
    )[0];
    if (trial.key !== best.key)
      return { candidate: trial, mode: 'trial', reason: '実績が少ない工程を、改善の可能性があるため今回だけ試します。' };
  }
  return {
    candidate: best,
    mode: 'best',
    reason: frozen
      ? '固定していた工程より期待総額が2割以上良い工程へ切り替えます。'
      : '検収に通る成果1つあたりの期待総額が最小の工程です。',
  };
}

/** 本人に残る作業だけを取り出す。画面にはこれだけを見せればよい。 */
export function ownerSteps(candidate: RecipeCandidate) {
  return candidate.steps.filter((step) => step.kind === 'owner');
}
