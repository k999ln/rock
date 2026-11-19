import { applyWorkCommand, workId, type WorkJob } from './workflow.ts';

/** Private local draft operation only. No public template, provider or hardware receipt. */
export function createMiniSpatialPreviewJob(id: string, now = new Date().toISOString()): WorkJob {
  return {
    id: workId(id), title: 'Miniのローカル空間操作', templateId: 'mini-spatial-private',
    plan: { schemaVersion: 1, objective: '合成rayからローカル下書きの移動と読戻しを行う', approvalGates: [] },
    revision: 0, status: 'active', events: [], createdAt: now, updatedAt: now,
    steps: [
      { id: 'resolve', title: 'ローカル座標と対象を解決', tool: 'mini-spatial-local', runner: 'owner-local-draft', passed: false },
      { id: 'apply', title: 'ローカル下書きへ操作を適用', tool: 'mini-spatial-local', runner: 'owner-local-draft', passed: false },
      { id: 'readback', title: '同じ下書きの状態を読戻す', tool: 'mini-spatial-local', runner: 'owner-local-draft', passed: false },
    ],
  };
}

export function recordMiniSpatialPreview(job: WorkJob, commandIds: string[]): WorkJob {
  if (job.templateId !== 'mini-spatial-private' || commandIds.length !== 3) throw new Error('INVALID_SPATIAL_PREVIEW_JOB');
  return job.steps.reduce((next, step, index) => applyWorkCommand(next, {
    id: workId(commandIds[index]), action: 'record', stepId: step.id, tool: step.tool,
    transport: 'browser', outcome: 'passed', sample: false, durationMs: 0,
  }, next.revision), job);
}
