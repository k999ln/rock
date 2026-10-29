import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import {
  parseZemaLocalAgentReply,
  runZemaLocalAgent,
  ZemaLocalAgentError,
  type ZemaLocalAgentArtifact,
  type ZemaLocalAgentToolObservation,
} from './zema-local-agent.ts';

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const keys = (value: Record<string, unknown>, allowed: string[]) =>
  Object.keys(value).every((key) => allowed.includes(key));
const text = (value: unknown, limit: number): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= limit;
const integer = (value: unknown, min: number, max: number): value is number =>
  Number.isSafeInteger(value) && Number(value) >= min && Number(value) <= max;

export class EveDecisionEvalConfigurationError extends Error {
  constructor(code: string) { super(code); this.name = 'EveDecisionEvalConfigurationError'; }
}

export type EveDecisionEvalOutcome = 'completed' | 'planner_error' | 'provider_error' | 'budget_exhausted';
type Oracle = {
  outcome: EveDecisionEvalOutcome;
  errorCode: string | null;
  finalText: string | null;
  plannerCalls: number;
  artifacts: ZemaLocalAgentArtifact[];
  observations: ZemaLocalAgentToolObservation[];
};
export type EveDecisionEvalCase = {
  id: string;
  family: string;
  language: 'ja' | 'en';
  variant: 'clean' | 'adversarial';
  request: string;
  context?: string;
  replies: string[];
  providerFailureAtStep?: number;
  oracle: Oracle;
};
export type EveDecisionEvalCorpus = {
  schema: 'eve.decision-eval-controls/1';
  purpose: 'synthetic-controls-only';
  cases: EveDecisionEvalCase[];
};

const OUTCOMES = ['completed', 'planner_error', 'provider_error', 'budget_exhausted'];
const TOOLS = ['sky_route', 'format_citations', 'coconala_check'];
function validArtifacts(value: unknown): value is ZemaLocalAgentArtifact[] {
  return Array.isArray(value) && value.length <= 3 && value.every((item) =>
    isRecord(item) && keys(item, ['tool', 'content']) && typeof item.tool === 'string' && TOOLS.includes(item.tool) &&
    typeof item.content === 'string' && item.content.length <= 32_000);
}
function validObservations(value: unknown): value is ZemaLocalAgentToolObservation[] {
  return Array.isArray(value) && value.length <= 3 && value.every((item) =>
    isRecord(item) && keys(item, ['step', 'tool', 'outcome', 'errorCode']) &&
    integer(item.step, 1, 3) && typeof item.tool === 'string' && TOOLS.includes(item.tool) &&
    ((item.outcome === 'completed' && !('errorCode' in item)) ||
      (item.outcome === 'needs_review' && text(item.errorCode, 100))));
}

export function parseEveDecisionEvalCorpus(value: unknown): EveDecisionEvalCorpus {
  if (!isRecord(value) || !keys(value, ['schema', 'purpose', 'cases']) ||
      value.schema !== 'eve.decision-eval-controls/1' || value.purpose !== 'synthetic-controls-only' ||
      !Array.isArray(value.cases) || !value.cases.length || value.cases.length > 100)
    throw new EveDecisionEvalConfigurationError('INVALID_CORPUS');
  const ids = new Set<string>();
  for (const item of value.cases) {
    if (!isRecord(item) || !keys(item, ['id', 'family', 'language', 'variant', 'request', 'context', 'replies', 'providerFailureAtStep', 'oracle']) ||
        !text(item.id, 100) || ids.has(item.id) || !text(item.family, 100) ||
        typeof item.language !== 'string' || !['ja', 'en'].includes(item.language) ||
        typeof item.variant !== 'string' || !['clean', 'adversarial'].includes(item.variant) ||
        !text(item.request, 8_000) || (item.context !== undefined && !text(item.context, 4_000)) ||
        !Array.isArray(item.replies) || !item.replies.length || item.replies.length > 3 ||
        !item.replies.every((reply) => text(reply, 16_000)) ||
        (item.providerFailureAtStep !== undefined && !integer(item.providerFailureAtStep, 1, 3)))
      throw new EveDecisionEvalConfigurationError('INVALID_CASE');
    ids.add(item.id);
    const oracle = item.oracle;
    if (!isRecord(oracle) || !keys(oracle, ['outcome', 'errorCode', 'finalText', 'plannerCalls', 'artifacts', 'observations']) ||
        typeof oracle.outcome !== 'string' || !OUTCOMES.includes(oracle.outcome) || !integer(oracle.plannerCalls, 1, 3) ||
        !(oracle.errorCode === null || text(oracle.errorCode, 100)) ||
        !(oracle.finalText === null || text(oracle.finalText, 6_000)) ||
        !validArtifacts(oracle.artifacts) || !validObservations(oracle.observations) ||
        (oracle.outcome === 'completed' ? oracle.errorCode !== null || oracle.finalText === null : oracle.finalText !== null || oracle.errorCode === null))
      throw new EveDecisionEvalConfigurationError('INVALID_ORACLE');
  }
  // Snapshot the JSON corpus: a caller cannot rewrite its oracle during a pass.
  return JSON.parse(JSON.stringify(value)) as EveDecisionEvalCorpus;
}

export function validateEveDecisionJudgments(expectedIds: readonly string[], value: unknown) {
  const invalid = (reason: string) => ({ status: 'unavailable' as const, passed: null, reason });
  if (!expectedIds.length || expectedIds.some((id) => !text(id, 100)) || new Set(expectedIds).size !== expectedIds.length)
    return invalid('INVALID_CHECKLIST');
  if (!Array.isArray(value) || value.length !== expectedIds.length) return invalid('CHECKLIST_SIZE');
  const seen = new Set<string>();
  for (const item of value) {
    if (!isRecord(item) || !keys(item, ['id', 'passed']) || typeof item.id !== 'string' ||
        typeof item.passed !== 'boolean' || !expectedIds.includes(item.id) || seen.has(item.id))
      return invalid('INVALID_JUDGMENT');
    seen.add(item.id);
  }
  return { status: 'valid' as const, passed: value.every((item) => item.passed), reason: null };
}

type CallRecord = {
  step: number;
  systemSha256: string;
  promptSha256: string;
  rawSha256: string | null;
  jsonSyntax: boolean | null;
  parserAccepted: boolean | null;
  elapsedMs: number;
  inputTokens: null;
  outputTokens: null;
};
const CHECK_IDS = ['outcome', 'error_code', 'final_text', 'planner_calls', 'artifacts', 'observations'];
const equal = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

// This runner has only scripted planners and the existing three pure Tools. No model/provider adapter.
export async function runEveDecisionControls(value: unknown, options: { maxPlannerCalls?: number } = {}) {
  const corpus = parseEveDecisionEvalCorpus(value);
  const maxPlannerCalls = options.maxPlannerCalls ?? corpus.cases.length * 3;
  if (!integer(maxPlannerCalls, 1, 300)) throw new EveDecisionEvalConfigurationError('INVALID_CALL_BUDGET');
  let spent = 0;
  const cases = [];
  const started = performance.now();
  for (const item of corpus.cases) {
    const oracleSha256 = sha256(JSON.stringify(item.oracle));
    if (spent >= maxPlannerCalls) {
      cases.push({ id: item.id, family: item.family, language: item.language, variant: item.variant,
        attempted: false, outcome: 'not_started' as const, errorCode: 'EVAL_CALL_BUDGET',
        calls: [], judgments: null, controlPassed: null, oracleSha256 });
      continue;
    }
    const calls: CallRecord[] = [];
    const observations: ZemaLocalAgentToolObservation[] = [];
    let outcome: EveDecisionEvalOutcome = 'completed';
    let errorCode: string | null = null;
    let finalText: string | null = null;
    let artifacts: ZemaLocalAgentArtifact[] = [];
    try {
      const result = await runZemaLocalAgent({
        request: item.request, context: item.context,
        onToolObservation: (event, artifact) => { observations.push(event); artifacts.push(artifact); },
        planner: async (input) => {
          if (spent >= maxPlannerCalls) throw new EveDecisionEvalConfigurationError('EVAL_CALL_BUDGET');
          spent++;
          const start = performance.now();
          const call: CallRecord = { step: input.step, systemSha256: sha256(input.system), promptSha256: sha256(input.prompt),
            rawSha256: null, jsonSyntax: null, parserAccepted: null, elapsedMs: 0, inputTokens: null, outputTokens: null };
          calls.push(call);
          try {
            if (item.providerFailureAtStep === input.step) throw new Error('EVAL_SIMULATED_PROVIDER_TIMEOUT');
            const raw = item.replies[input.step - 1];
            if (raw === undefined) throw new Error('EVAL_SCRIPT_EXHAUSTED');
            call.rawSha256 = sha256(raw);
            try { JSON.parse(raw); call.jsonSyntax = true; } catch { call.jsonSyntax = false; }
            try { parseZemaLocalAgentReply(raw); call.parserAccepted = true; } catch { call.parserAccepted = false; }
            return raw;
          } finally { call.elapsedMs = performance.now() - start; }
        },
      });
      finalText = result.text;
      artifacts = result.artifacts;
    } catch (error) {
      if (error instanceof EveDecisionEvalConfigurationError) outcome = 'budget_exhausted';
      else if (error instanceof ZemaLocalAgentError) outcome = 'planner_error';
      else outcome = 'provider_error';
      errorCode = error instanceof Error ? error.message : 'EVAL_UNKNOWN_ERROR';
    }
    const checks = [outcome === item.oracle.outcome, errorCode === item.oracle.errorCode,
      finalText === item.oracle.finalText, calls.length === item.oracle.plannerCalls,
      equal(artifacts, item.oracle.artifacts), equal(observations, item.oracle.observations)];
    const judgments = CHECK_IDS.map((id, index) => ({ id, passed: checks[index] }));
    const validated = validateEveDecisionJudgments(CHECK_IDS, judgments);
    cases.push({ id: item.id, family: item.family, language: item.language, variant: item.variant,
      attempted: true, outcome, errorCode, finalText, artifacts, observations, calls, judgments,
      controlPassed: validated.passed, oracleSha256 });
  }
  const attempted = cases.filter((item) => item.attempted).length;
  return {
    schema: 'eve.decision-eval-control-report/1' as const,
    scope: 'synthetic-controls-only' as const,
    corpusSha256: sha256(JSON.stringify(corpus)),
    modelCalls: 0,
    modelQualityMeasured: false,
    externalEffectsVerified: false,
    plannerCalls: spent,
    maxPlannerCalls,
    plannedCases: cases.length,
    attemptedCases: attempted,
    notStartedCases: cases.length - attempted,
    completedPlannerCases: cases.filter((item) => item.outcome === 'completed').length,
    controlPasses: cases.filter((item) => item.controlPassed === true).length,
    controlFailures: cases.filter((item) => item.controlPassed === false).length,
    complete: attempted === cases.length && cases.every((item) =>
      item.controlPassed === true && item.outcome !== 'budget_exhausted'),
    usage: { inputTokens: null, outputTokens: null, currencyCost: null,
      meaning: 'No model used. Token/currency usage not measured; null is not zero.' },
    elapsedMs: performance.now() - started,
    cases,
  };
}
