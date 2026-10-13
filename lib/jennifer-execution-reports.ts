import type { AmcTask } from './amc-tool.ts';

export type JenniferTaskReport = {
  schema: 'zema-jennifer-task-report/1';
  rootJobId: string;
  goalId: string;
  goalRevision: number;
  planRevision: number;
  taskId: string;
  attempt: 1;
  delegationId: string;
  principal: string;
  inputDigest: string;
  artifactSha256s: string[];
  artifactSetDigest: string;
  usageReceiptDigest: string;
  summary: string;
  unresolved: string[];
  outcome: 'succeeded';
};

export type JenniferReviewClaim = {
  schema: 'jennifer-review-claim/1';
  taskId: string;
  workerReportDigest: string;
  accepted: boolean;
  summary: string;
  criteria: Array<{
    criterionId: string;
    passed: boolean;
    evidenceRefs: string[];
  }>;
  unresolved: string[];
};

export type JenniferReviewReport = {
  schema: 'zema-jennifer-review-report/1';
  rootJobId: string;
  goalId: string;
  goalRevision: number;
  planRevision: number;
  taskId: string;
  attempt: 1;
  delegationId: string;
  principal: string;
  inputDigest: string;
  artifactSha256s: string[];
  artifactSetDigest: string;
  usageReceiptDigest: string;
  workerReportDigest: string;
  accepted: boolean;
  summary: string;
  criteria: JenniferReviewClaim['criteria'];
  unresolved: string[];
};

function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function strings(value: unknown, limit: number, width: number): value is string[] {
  return Array.isArray(value) && value.length <= limit &&
    value.every((item) => typeof item === 'string' && item.length > 0 && item.length <= width);
}

export function parseJenniferReviewClaim(
  value: unknown,
  task: AmcTask,
  expectedWorkerReportDigest?: string,
): JenniferReviewClaim | null {
  if (!object(value) || Object.keys(value).some((key) =>
    !['schema', 'taskId', 'workerReportDigest', 'accepted', 'summary', 'criteria', 'unresolved'].includes(key)) ||
    value.schema !== 'jennifer-review-claim/1' || value.taskId !== task.id ||
    typeof value.workerReportDigest !== 'string' || !/^[a-f0-9]{64}$/u.test(value.workerReportDigest) ||
    (expectedWorkerReportDigest !== undefined && value.workerReportDigest !== expectedWorkerReportDigest) ||
    typeof value.accepted !== 'boolean' || typeof value.summary !== 'string' ||
    !value.summary.trim() || value.summary.length > 2_000 ||
    !Array.isArray(value.criteria) || value.criteria.length !== task.acceptanceCriteria.length ||
    !strings(value.unresolved, 16, 500)) return null;
  const expected = new Set(task.acceptanceCriteria.map(({ id }) => id));
  const seen = new Set<string>();
  for (const item of value.criteria) {
    if (!object(item) || Object.keys(item).some((key) =>
      !['criterionId', 'passed', 'evidenceRefs'].includes(key)) ||
      typeof item.criterionId !== 'string' || !expected.has(item.criterionId) ||
      seen.has(item.criterionId) || typeof item.passed !== 'boolean' ||
      !strings(item.evidenceRefs, 16, 300) || item.evidenceRefs.length === 0) return null;
    seen.add(item.criterionId);
  }
  if (value.accepted !== value.criteria.every((item) => object(item) && item.passed === true))
    return null;
  return value as JenniferReviewClaim;
}

export function extractJenniferReviewClaim(
  document: unknown,
  task: AmcTask,
  expectedWorkerReportDigest?: string,
) {
  if (!object(document) || document.schemaVersion !== 1 || !Array.isArray(document.artifacts))
    return null;
  for (const artifact of document.artifacts) {
    if (!object(artifact) || !Array.isArray(artifact.textParts)) continue;
    for (const part of artifact.textParts) {
      if (typeof part !== 'string' || part.length > 24_000) continue;
      try {
        const claim = parseJenniferReviewClaim(JSON.parse(part), task, expectedWorkerReportDigest);
        if (claim) return claim;
      } catch { /* A reviewer may return explanatory text next to the JSON claim. */ }
    }
  }
  return null;
}

export function jenniferReviewClaimContract(task: AmcTask) {
  const workerReportDigest = task.evidence
    .map((reference) => /^jennifer:task-report:([a-f0-9]{64})$/u.exec(reference)?.[1] ?? null)
    .find((value): value is string => value !== null) ?? '0'.repeat(64);
  return JSON.stringify({
    schema: 'jennifer-review-claim/1',
    taskId: task.id,
    workerReportDigest,
    accepted: false,
    summary: '証拠に基づく判定',
    criteria: task.acceptanceCriteria.map(({ id }) => ({
      criterionId: id,
      passed: false,
      evidenceRefs: ['artifact-or-check-reference'],
    })),
    unresolved: [],
  });
}
