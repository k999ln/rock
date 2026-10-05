import {
  compileGoal,
  validateGoal,
  applyGoalEvent,
  summarizeGoal,
  renderGoalPrompt,
} from '../scripts/amc-goal-engine.mjs';
import { buildRequestPlan } from '../scripts/amc-request-plan.mjs';
import { estimateGoalEffort } from '../scripts/amc-effort.mjs';

export const AMC_TOOL_ID = 'rockstar-amc';
export const AMC_MAX_GOAL_BYTES = 1_500_000;
export type AmcBrief = { request: string; goal: string; intent: string };
export type AmcCriterion = {
  id: string;
  criterion: string;
  verification: string;
  status: string;
  evidence: string[];
};
export type AmcTask = {
  id: string;
  title: string;
  squadId: string;
  parentTaskId: string | null;
  childTaskIds: string[];
  status: 'pending' | 'running' | 'submitted' | 'done' | 'blocked' | 'failed';
  scope: string;
  scopeReviewRequired: boolean;
  executionEligibility: string;
  executionMode: string;
  executionBoundary?: string;
  workloadClass?: string;
  dependsOn: string[];
  steps: { id: string; action: string }[];
  inputs: { path: string; locator: string }[];
  deliverables: { path: string; section?: string; description: string }[];
  acceptanceCriteria: AmcCriterion[];
  rules: string[];
  holds: {
    id: string;
    scope: string;
    reason: string;
    releaseCondition: string;
  }[];
  evidence: string[];
  startedBy: string | null;
  result: {
    submittedBy: string;
    outcome: string;
    summary: string;
    evidence: string[];
    deliverables: string[];
  } | null;
  blockReason: string | null;
  [key: string]: unknown;
};
export type AmcEvent = {
  type: string;
  actor: string;
  role: 'owner' | 'worker' | 'reviewer';
  expectedRevision: number;
  id?: string;
  at?: string;
  taskId?: string;
  reason?: string;
  outcome?: 'succeeded' | 'failed';
  summary?: string;
  deliverables?: string[];
  evidence?: string[];
  accepted?: boolean;
  criterionResults?: {
    criterionId: string;
    passed: boolean;
    evidence: string[];
  }[];
  [key: string]: unknown;
};
export type AmcGoal = {
  schema: 'amc-goal/1';
  id: string;
  instruction: string;
  state: 'draft' | 'active' | 'paused' | 'accepted';
  revision: number;
  maxParallel: number;
  createdAt: string | null;
  requestBrief?: AmcBrief & { schema: string; templateId: string };
  skyBrief?: AmcBrief & { schema: string; templateId: string; planId?: string; planRevision?: number };
  scopeWarning: string;
  selectedSquadIds: string[];
  tasks: AmcTask[];
  squads: {
    id: string;
    name: string;
    goal: string;
    rules: string[];
    acceptanceGate: string;
  }[];
  rules: string[];
  holds: AmcTask['holds'];
  overallAcceptance: {
    criteria: AmcCriterion[];
    accepted: boolean;
    evidence: string[];
    reviewer: string | null;
  };
  eventLog: {
    id: string;
    type: string;
    taskId: string | null;
    actor: string;
    at: string | null;
    summary: string | null;
  }[];
  [key: string]: unknown;
};

export function validateAmcGoal(value: unknown): AmcGoal {
  const bytes = new TextEncoder().encode(JSON.stringify(value)).byteLength;
  if (bytes > AMC_MAX_GOAL_BYTES)
    throw new Error('Goalは1.5 MB以下にしてください。');
  const result = validateGoal(value);
  if (!result.ok) throw new Error(result.errors.join('\n'));
  return value as AmcGoal;
}

export function createAmcGoal(
  id: string,
  brief: AmcBrief,
  now = new Date().toISOString(),
): AmcGoal {
  const definition = buildRequestPlan({ ...brief, planId: id, createdAt: now });
  const goal = compileGoal({
    instruction: definition.brief.goal,
    squadIds: definition.mission.squads.map((squad) => squad.id),
    mission: definition.mission,
    project: definition.project,
    goalId: id,
    createdAt: now,
    maxParallel: 1,
  });
  const withBrief = {
    ...goal,
    requestBrief: definition.brief,
    planningMethod: 'software_preparation_template',
    scopeWarning:
      '共通の4役割7工程による準備計画。AIによる意味分解・実作業は未接続。具体的な仕様と工数は最初の工程で確認します。',
  };
  return validateAmcGoal(
    applyGoalEvent(withBrief, {
      id: id + '-approval',
      type: 'approve_plan',
      expectedRevision: 0,
      actor: 'local-owner',
      role: 'owner',
      at: now,
      scopeConfirmed: true,
      coverageStatement: definition.coverage,
      acceptanceCriteria: definition.acceptanceCriteria,
    }),
  );
}

export function applyAmcEvent(goal: AmcGoal, event: AmcEvent): AmcGoal {
  return validateAmcGoal(applyGoalEvent(goal, event));
}
export function amcSummary(goal: AmcGoal) {
  return summarizeGoal(goal);
}
export function amcPrompt(goal: AmcGoal) {
  return renderGoalPrompt(goal);
}
export function amcEffort(goal: AmcGoal) {
  return estimateGoalEffort(goal);
}
