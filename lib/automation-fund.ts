export const DEFAULT_FUND_TOOL_COUNT = 5;
export const MIN_FUND_TOOL_COUNT = 1;
export const MAX_FUND_TOOL_COUNT = 20;

export type AutomationFundStrategy =
  | 'balanced'
  | 'commerce'
  | 'creator-services';

export type AutomationFundCandidate = {
  toolId: string;
  role: string;
  strategyAffinity: AutomationFundStrategy[];
  ready: boolean;
  verifiedGrossMinor: number;
  operatingCostMinor: number;
  completedReceipts: number;
  failedRuns: number;
};

export type AutomationFundTool = {
  toolId: string;
  role: string;
  allocationBps: number;
  verifiedNetMinor: number;
  completedReceipts: number;
};

export type AutomationFundPlan = {
  schema: 'rockstaros-automation-fund/1';
  id: string;
  name: string;
  strategy: AutomationFundStrategy;
  targetToolCount: number;
  tools: AutomationFundTool[];
  formationBasis: 'capability_coverage' | 'verified_net_revenue';
  autoRebalance: boolean;
  status: 'forming' | 'ready' | 'paused';
  revision: number;
  createdAt: string;
  updatedAt: string;
};

export type AutomationFundAnalytics = {
  evaluatedAt: string;
  refreshIntervalSeconds: 30;
  verifiedGrossMinor: number;
  operatingCostMinor: number;
  verifiedNetMinor: number;
  observedReturnBps: number | null;
  completedReceipts: number;
  failedRuns: number;
  evidence: 'verified_book_and_run_receipts' | 'insufficient_evidence';
  recommendedToolIds: string[];
};

const FUND_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/u;
const TOOL_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/u;

function safeInteger(value: unknown, name: string, maximum = 10_000_000_000) {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > maximum
  )
    throw new Error(`AUTOMATION_FUND_${name}_INVALID`);
  return value;
}

function signedSafeInteger(
  value: unknown,
  name: string,
  maximum = 10_000_000_000,
) {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    Math.abs(value) > maximum
  )
    throw new Error(`AUTOMATION_FUND_${name}_INVALID`);
  return value;
}

export function validateFundToolCount(value: unknown) {
  const count = safeInteger(value, 'TOOL_COUNT', MAX_FUND_TOOL_COUNT);
  if (count < MIN_FUND_TOOL_COUNT || count > MAX_FUND_TOOL_COUNT)
    throw new Error('AUTOMATION_FUND_TOOL_COUNT_INVALID');
  return count;
}

export function validateFundStrategy(
  value: unknown,
): AutomationFundStrategy {
  if (
    value !== 'balanced' &&
    value !== 'commerce' &&
    value !== 'creator-services'
  )
    throw new Error('AUTOMATION_FUND_STRATEGY_INVALID');
  return value;
}

export function validateFundName(value: unknown) {
  if (typeof value !== 'string')
    throw new Error('AUTOMATION_FUND_NAME_INVALID');
  const name = value.trim();
  if (name.length < 1 || name.length > 60)
    throw new Error('AUTOMATION_FUND_NAME_INVALID');
  return name;
}

function candidateScore(
  candidate: AutomationFundCandidate,
  strategy: AutomationFundStrategy,
) {
  const verifiedNet =
    safeInteger(candidate.verifiedGrossMinor, 'GROSS') -
    safeInteger(candidate.operatingCostMinor, 'COST');
  const completed = safeInteger(candidate.completedReceipts, 'RECEIPTS');
  const failures = safeInteger(candidate.failedRuns, 'FAILURES');
  const strategyFit = candidate.strategyAffinity.includes(strategy)
    ? 100_000_000_000
    : 0;
  return strategyFit + verifiedNet * 1000 + completed * 10 - failures;
}

function selectCandidates(
  candidates: AutomationFundCandidate[],
  targetToolCount: number,
  strategy: AutomationFundStrategy,
) {
  const ready = candidates.filter((candidate) => candidate.ready);
  const unique = new Map<string, AutomationFundCandidate>();
  for (const candidate of ready) {
    if (!TOOL_ID.test(candidate.toolId))
      throw new Error('AUTOMATION_FUND_TOOL_ID_INVALID');
    if (unique.has(candidate.toolId))
      throw new Error('AUTOMATION_FUND_DUPLICATE_TOOL');
    candidateScore(candidate, strategy);
    unique.set(candidate.toolId, candidate);
  }
  if (unique.size < targetToolCount)
    throw new Error('AUTOMATION_FUND_NOT_ENOUGH_READY_TOOLS');

  const ordered = [...unique.values()].sort(
    (a, b) =>
      candidateScore(b, strategy) - candidateScore(a, strategy) ||
      a.toolId.localeCompare(b.toolId),
  );
  const selected: AutomationFundCandidate[] = [];
  const selectedIds = new Set<string>();
  const roles = new Set<string>();

  for (const candidate of ordered) {
    if (roles.has(candidate.role)) continue;
    selected.push(candidate);
    selectedIds.add(candidate.toolId);
    roles.add(candidate.role);
    if (selected.length === targetToolCount) return selected;
  }
  for (const candidate of ordered) {
    if (selectedIds.has(candidate.toolId)) continue;
    selected.push(candidate);
    if (selected.length === targetToolCount) return selected;
  }
  return selected;
}

function allocation(selected: AutomationFundCandidate[]) {
  const hasMeasuredRevenue = selected.some(
    (candidate) => candidate.completedReceipts > 0,
  );
  const scores = selected.map((candidate) =>
    hasMeasuredRevenue
      ? Math.max(
          1,
          candidate.verifiedGrossMinor - candidate.operatingCostMinor,
        )
      : 1,
  );
  const total = scores.reduce((sum, score) => sum + score, 0);
  const weights = scores.map((score) => Math.floor((score * 10_000) / total));
  let remainder = 10_000 - weights.reduce((sum, weight) => sum + weight, 0);
  for (let index = 0; remainder > 0; index = (index + 1) % weights.length) {
    weights[index] += 1;
    remainder -= 1;
  }
  return { hasMeasuredRevenue, weights };
}

export function formAutomationFund(input: {
  id: string;
  name: string;
  strategy: AutomationFundStrategy;
  targetToolCount?: number;
  candidates: AutomationFundCandidate[];
  now?: string;
}): AutomationFundPlan {
  if (!FUND_ID.test(input.id)) throw new Error('AUTOMATION_FUND_ID_INVALID');
  const targetToolCount = validateFundToolCount(
    input.targetToolCount ?? DEFAULT_FUND_TOOL_COUNT,
  );
  const strategy = validateFundStrategy(input.strategy);
  const selected = selectCandidates(
    input.candidates,
    targetToolCount,
    strategy,
  );
  const { hasMeasuredRevenue, weights } = allocation(selected);
  const timestamp = input.now ?? new Date().toISOString();
  if (Number.isNaN(Date.parse(timestamp)))
    throw new Error('AUTOMATION_FUND_TIMESTAMP_INVALID');
  return {
    schema: 'rockstaros-automation-fund/1',
    id: input.id,
    name: validateFundName(input.name),
    strategy,
    targetToolCount,
    tools: selected.map((candidate, index) => ({
      toolId: candidate.toolId,
      role: candidate.role,
      allocationBps: weights[index],
      verifiedNetMinor:
        candidate.verifiedGrossMinor - candidate.operatingCostMinor,
      completedReceipts: candidate.completedReceipts,
    })),
    formationBasis: hasMeasuredRevenue
      ? 'verified_net_revenue'
      : 'capability_coverage',
    autoRebalance: true,
    status: 'forming',
    revision: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function validateAutomationFundPlan(value: unknown): AutomationFundPlan {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('AUTOMATION_FUND_INVALID');
  const plan = value as AutomationFundPlan;
  if (
    plan.schema !== 'rockstaros-automation-fund/1' ||
    !FUND_ID.test(plan.id) ||
    !Array.isArray(plan.tools) ||
    plan.tools.length !== validateFundToolCount(plan.targetToolCount) ||
    typeof plan.autoRebalance !== 'boolean' ||
    !['forming', 'ready', 'paused'].includes(plan.status) ||
    !['capability_coverage', 'verified_net_revenue'].includes(
      plan.formationBasis,
    )
  )
    throw new Error('AUTOMATION_FUND_INVALID');
  validateFundName(plan.name);
  validateFundStrategy(plan.strategy);
  const ids = new Set<string>();
  let allocationBps = 0;
  for (const tool of plan.tools) {
    if (!TOOL_ID.test(tool.toolId) || ids.has(tool.toolId))
      throw new Error('AUTOMATION_FUND_TOOL_INVALID');
    ids.add(tool.toolId);
    allocationBps += safeInteger(tool.allocationBps, 'ALLOCATION', 10_000);
    signedSafeInteger(tool.verifiedNetMinor, 'VERIFIED_NET');
    safeInteger(tool.completedReceipts, 'RECEIPTS');
  }
  if (allocationBps !== 10_000)
    throw new Error('AUTOMATION_FUND_ALLOCATION_INVALID');
  safeInteger(plan.revision, 'REVISION');
  if (Number.isNaN(Date.parse(plan.createdAt)) || Number.isNaN(Date.parse(plan.updatedAt)))
    throw new Error('AUTOMATION_FUND_TIMESTAMP_INVALID');
  return structuredClone(plan);
}

export function refreshAutomationFundPlan(
  plan: AutomationFundPlan,
  candidates: AutomationFundCandidate[],
  now = new Date().toISOString(),
) {
  const refreshed = formAutomationFund({
    id: plan.id,
    name: plan.name,
    strategy: plan.strategy,
    targetToolCount: plan.targetToolCount,
    candidates,
    now,
  });
  return {
    ...refreshed,
    createdAt: plan.createdAt,
    revision: plan.revision,
    status: refreshed.tools.some((tool) => tool.completedReceipts > 0)
      ? ('ready' as const)
      : ('forming' as const),
  };
}

export function automationFundAnalytics(
  plan: AutomationFundPlan,
  candidates: AutomationFundCandidate[],
  now = new Date().toISOString(),
): AutomationFundAnalytics {
  const selected = new Set(plan.tools.map((tool) => tool.toolId));
  const measured = candidates.filter((candidate) =>
    selected.has(candidate.toolId),
  );
  const verifiedGrossMinor = measured.reduce(
    (sum, candidate) => sum + candidate.verifiedGrossMinor,
    0,
  );
  const operatingCostMinor = measured.reduce(
    (sum, candidate) => sum + candidate.operatingCostMinor,
    0,
  );
  const completedReceipts = measured.reduce(
    (sum, candidate) => sum + candidate.completedReceipts,
    0,
  );
  const failedRuns = measured.reduce(
    (sum, candidate) => sum + candidate.failedRuns,
    0,
  );
  const verifiedNetMinor = verifiedGrossMinor - operatingCostMinor;
  return {
    evaluatedAt: now,
    refreshIntervalSeconds: 30,
    verifiedGrossMinor,
    operatingCostMinor,
    verifiedNetMinor,
    observedReturnBps:
      operatingCostMinor > 0
        ? Math.trunc((verifiedNetMinor * 10_000) / operatingCostMinor)
        : null,
    completedReceipts,
    failedRuns,
    evidence:
      completedReceipts > 0
        ? 'verified_book_and_run_receipts'
        : 'insufficient_evidence',
    recommendedToolIds: plan.tools.map((tool) => tool.toolId),
  };
}
