import { normalizeWorkJob, parseWorkCommand, workId, type WorkCommand, type WorkJob } from './workflow.ts';
import { readOwnerScope } from './owner-intent.ts';

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function text(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0; }
function timestamp(value: unknown) { return typeof value === 'string' && Number.isFinite(Date.parse(value)); }
function invalid(): never { throw new Error('仕事の保存結果を確認できません。同じ操作IDで状態を再確認してください。'); }

/** Validate the read model before rendering or retiring an in-memory operation.
 * This does not repair, migrate, or infer saved workflow/approval state. */
export function readWorkJob(value: unknown): WorkJob {
  if (!object(value) || !text(value.id) || !text(value.title) || !text(value.templateId) ||
      !Number.isSafeInteger(value.revision) || Number(value.revision) < 0 ||
      !['active', 'review', 'completed', 'cancelled'].includes(String(value.status)) ||
      !timestamp(value.createdAt) || !timestamp(value.updatedAt) ||
      !object(value.plan) || value.plan.schemaVersion !== 1 || !text(value.plan.objective) ||
      !Array.isArray(value.plan.approvalGates) ||
      !value.plan.approvalGates.every((gate) => object(gate) && text(gate.stepId) &&
        ['none', 'provider_quote_wallet_reservation_and_explicit_cloud_approval', 'terminal_result_captured_with_usage_receipt'].includes(String(gate.requirement))) ||
      !Array.isArray(value.steps) || !value.steps.every((step) => object(step) &&
        ['id', 'title', 'tool', 'runner'].every((key) => text(step[key])) && typeof step.passed === 'boolean') ||
      !Array.isArray(value.events) || !value.events.every((event) => object(event) && timestamp(event.at) && object(event.command))) return invalid();
  try {
    workId(value.id);
    for (const event of value.events) parseWorkCommand(event.command);
    const job = value as WorkJob;
    if (normalizeWorkJob(job) !== job) return invalid();
    return job;
  } catch { return invalid(); }
}
export function readWorkJobs(value: unknown): { jobs: WorkJob[]; ownerScope: string | null } {
  if (!object(value) || !Array.isArray(value.jobs)) return invalid();
  const ownerScope = readOwnerScope(value.ownerScope);
  if (value.ownerScope !== undefined && ownerScope === null) return invalid();
  return { jobs: value.jobs.map(readWorkJob), ownerScope };
}
export function readWorkJobResponse(value: unknown): WorkJob {
  if (!object(value)) return invalid();
  return readWorkJob(value.job);
}
export function workJobConfirmsCommand(job: WorkJob, update: { jobId: string; revision: number; command: WorkCommand }) {
  if (job.id !== update.jobId || job.revision <= update.revision) return false;
  const event = job.events.find((entry) => entry.command.id === update.command.id);
  return Boolean(event && JSON.stringify(parseWorkCommand(event.command)) === JSON.stringify(parseWorkCommand(update.command)));
}
