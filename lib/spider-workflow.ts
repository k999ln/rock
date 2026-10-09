import type { ProgramReport } from '../toolkits/spider-guard/program-inspector.mjs';
import { applyWorkCommand, createWorkJob, type WorkJob } from './workflow.ts';

// Only a local inspection receipt. Source, filenames and finding values never
// enter a WorkJob; the browser does not persist or send this job to a service.
export function startSpiderInspection(id: string): WorkJob {
  return createWorkJob({ id, title: 'SPIDER — 入力の静的検査', templateId: 'spider-security' });
}

export function finishSpiderInspection(job: WorkJob, report: ProgramReport, durationMs: number, sample = false): WorkJob {
  return applyWorkCommand(job, {
    id: crypto.randomUUID(), action: 'record', stepId: 'inspect', tool: 'rockstar-spider',
    transport: 'browser', sample,
    // "passed" means the inspection finished, never that the input is safe.
    outcome: report.coverageLimited || report.state === 'empty' ? 'needs_review' : 'passed',
    durationMs: Math.max(0, Math.min(120000, Math.round(durationMs))),
  }, job.revision);
}

export function acknowledgeSpiderInspection(job: WorkJob): WorkJob {
  return applyWorkCommand(job, {
    id: crypto.randomUUID(), action: 'complete', note: '検査結果と対象範囲を確認。安全認定・送信承認ではない。',
  }, job.revision);
}

export function cancelSpiderInspection(job: WorkJob): WorkJob {
  return applyWorkCommand(job, { id: crypto.randomUUID(), action: 'cancel' }, job.revision);
}
