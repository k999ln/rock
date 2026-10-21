import {
  MATERIAL_INVENTION_CONTRACT,
  generateMaterialCandidateGraph,
  validateMaterialInventionRequest,
  type MaterialInventionRequest,
  type MaterialCandidateGraph,
} from './material-invention.ts';
import { applyWorkCommand, createWorkJob, objectInput, WorkError, type WorkJob } from './workflow.ts';

export const MATERIAL_TOOL_ID = 'rockstar-material-invention';
export const MATERIAL_STUDY_MAX_BYTES = 48_000;
export type MaterialStudy = {
  schemaVersion: 1;
  engine: typeof MATERIAL_INVENTION_CONTRACT;
  request: MaterialInventionRequest;
  requestDigest: string;
  sample: boolean;
};

// Persist the normalized source, not a caller-supplied result or safety label.
// WorkJob ownership and revision protection remain in the existing D1 store.
export async function createMaterialStudy(value: unknown, now = new Date().toISOString()) {
  const input = objectInput(value, ['id', 'title', 'request', 'sample']);
  if (typeof input.sample !== 'boolean') throw new WorkError('サンプル区分を指定してください。');
  const request = validateMaterialInventionRequest(input.request);
  const graph = await generateMaterialCandidateGraph(request);
  const initial = createWorkJob({ id: input.id, title: input.title, templateId: 'material-invention' }, now);
  initial.materialStudy = {
    schemaVersion: 1, engine: MATERIAL_INVENTION_CONTRACT, request,
    requestDigest: graph.requestDigest, sample: input.sample,
  };
  const job = applyWorkCommand(initial, {
    id: crypto.randomUUID(), action: 'record', stepId: 'generate', tool: MATERIAL_TOOL_ID,
    transport: 'browser', outcome: 'passed', sample: input.sample, durationMs: 0,
  }, initial.revision, now);
  return { job, graph };
}

export async function restoreMaterialStudy(job: WorkJob): Promise<MaterialCandidateGraph> {
  const saved = job.materialStudy;
  if (job.templateId !== 'material-invention' || !saved || saved.schemaVersion !== 1 ||
      saved.engine !== MATERIAL_INVENTION_CONTRACT || typeof saved.sample !== 'boolean')
    throw new WorkError('対応する物質候補の保存形式ではありません。', 409);
  const graph = await generateMaterialCandidateGraph(saved.request);
  if (graph.requestDigest !== saved.requestDigest)
    throw new WorkError('保存された入力と記録の照合に失敗しました。上書きせず復旧を確認してください。', 409);
  return graph;
}

export function sameMaterialStudy(left: WorkJob, right: WorkJob) {
  return left.templateId === right.templateId && left.title === right.title &&
    left.materialStudy?.engine === right.materialStudy?.engine &&
    left.materialStudy?.sample === right.materialStudy?.sample &&
    left.materialStudy?.requestDigest === right.materialStudy?.requestDigest;
}

export function readMaterialStudyInput(value: unknown) {
  if (value && typeof value === 'object' && 'schema' in value) {
    const input = objectInput(value, ['schema', 'sample', 'request', 'graph', 'job']);
    if (input.schema !== 'rockstaros-material-study-export/1' || typeof input.sample !== 'boolean')
      throw new WorkError('対応する候補ファイルではありません。');
    // Imported results and WorkJob ownership/approval are never trusted.
    return { request: validateMaterialInventionRequest(input.request), sample: input.sample };
  }
  return { request: validateMaterialInventionRequest(value), sample: false };
}

export function exportMaterialStudy(request: MaterialInventionRequest, graph: MaterialCandidateGraph, sample: boolean, job: WorkJob | null) {
  return {
    schema: 'rockstaros-material-study-export/1', sample, request,
    // No duplicate graph nodes or repeated per-step findings: the normalized
    // input reproduces them. Keep the file bounded even for 2,280 candidates.
    graph: { contract: graph.contract, requestDigest: graph.requestDigest,
      physicalExecutionAllowed: false, executionMode: 'SANDBOX_ONLY',
      candidates: graph.candidates.map((candidate) => ({
        id: candidate.id, components: candidate.components,
        evidenceState: candidate.evidenceState, safetyStatus: candidate.safety.status,
        blockerCodes: [...new Set(candidate.safety.blockers.map(({ code }) => code))],
        reviewCodes: [...new Set(candidate.safety.reviewRequired.map(({ code }) => code))],
      })),
    },
    job: job ? { id: job.id, title: job.title, status: job.status, revision: job.revision } : null,
  };
}
