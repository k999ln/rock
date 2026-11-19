import { appObject, appText } from './sky-app-contract.ts';
import { plannerSkyRequest } from './sky-app-foundation.ts';
import type { WorkJob } from './workflow.ts';

export const privatePlannerOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:5197', 'http://127.0.0.1:5197'] as const;
export type PlannerHandoff = { taskId?: string; monthId?: string; token: string; brief: string; fingerprint?: string };
export function parsePlannerHandoff(value: unknown, origin: string): PlannerHandoff {
  if (!privatePlannerOrigins.some((v) => v === origin)) throw new Error('許可されたローカルPlannerから開いてください。');
  const v = appObject(value, ['type', 'taskId', 'monthId', 'token', 'brief', 'fingerprint']);
  if (v.type !== 'avocado.sky.brief.v1' || typeof v.token !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(v.token)
    || (v.taskId === undefined) === (v.monthId === undefined)) throw new Error('Plannerの受渡しを確認してください。');
  const source = appText(v.taskId ?? v.monthId, 100);
  if (!/^[a-zA-Z0-9._:-]+$/u.test(source)) throw new Error('Plannerの作業IDが不正です。');
  return { ...(v.taskId === undefined ? { monthId: source } : { taskId: source }), token: v.token,
    brief: appText(v.brief, 2000), ...(v.fingerprint === undefined ? {} : { fingerprint: appText(v.fingerprint, 4000) }) };
}
export async function plannerHandoffRequest(handoff: PlannerHandoff) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(handoff.fingerprint ?? handoff.brief));
  const revision = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return plannerSkyRequest({ taskId: handoff.taskId ?? handoff.monthId!, revision, brief: handoff.brief });
}
export function plannerResultMessage(job: WorkJob, handoff: PlannerHandoff, expectedRevision: string) {
  const binding = job.skyApp, result = binding?.result;
  if (job.status !== 'completed' || !result || binding!.request.appId !== 'planner'
    || result.sourceId !== (handoff.taskId ?? handoff.monthId) || result.sourceRevision !== expectedRevision
    || result.body.length > 1800) throw new Error('確認済みの同じPlanner作業の成果だけを返せます。');
  return { type: 'avocado.sky.result.v1', token: handoff.token,
    ...(handoff.taskId ? { taskId: handoff.taskId } : { monthId: handoff.monthId }),
    summary: result.body, skyJobId: job.id, skyRevision: job.revision,
    resultSchema: result.schema, provisional: true };
}
