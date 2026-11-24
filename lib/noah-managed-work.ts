import { noahCloudRecordedToolCalls, noahRemoteUsageReceipt } from './noah-work-usage-receipt.ts';
import type { NoahAskItem } from './noah-ask-view.ts';
import { NOAH_CLOUD_PROFILES, NOAH_EVE_ADVICE_PURPOSE } from './noah-cloud-contract.ts';
import { NOAH_REMOTE_TEMPLATE } from './noah-remote-work.ts';
import { normalizeWorkJob, type WorkJob } from './workflow.ts';

export function isNoahManagedWork(job: WorkJob | null): job is WorkJob {
  return !!job && job.templateId === NOAH_REMOTE_TEMPLATE && !!job.noahRemote?.cloud;
}

export async function listNoahManagedWork(db: Pick<D1Database, 'prepare'>, owner: string, connection: string | null, agent: string | null) {
  const rows = await db.prepare(`SELECT payload FROM work_jobs
    WHERE user_id = ? AND json_extract(payload, '$.templateId') = ?
    AND json_type(payload, '$.noahRemote.cloud') = 'object'
    ${connection !== null ? "AND json_extract(payload, '$.noahRemote.connectionId') = ?" : agent !== null ? "AND json_extract(payload, '$.noahRemote.cloud.projectId') = ?" : ''}
    ORDER BY updated_at DESC, id DESC LIMIT 50`)
    .bind(owner, NOAH_REMOTE_TEMPLATE, ...(connection !== null ? [connection] : agent !== null ? [agent] : []))
    .all<{ payload: string }>();
  return rows.results.map(row => normalizeWorkJob(JSON.parse(row.payload) as WorkJob)).filter(isNoahManagedWork).map(job => noahManagedWorkView(job));
}

/** Reads only already-saved Work; opening a result never starts or resumes execution. */
export function noahManagedWorkView(job: WorkJob, includeResult = false): NoahAskItem {
  const remote = job.noahRemote!;
  const finished = !['queued', 'running'].includes(remote.state);
  return {
    id: job.id, workId: job.id, connectionId: remote.connectionId,
    agentId: remote.cloud!.projectId, mode: 'cloud',
    tool: remote.cloud!.runtimePurpose === NOAH_EVE_ADVICE_PURPOSE ? 'Eve' : NOAH_CLOUD_PROFILES[remote.cloud!.profile]?.name ?? 'Agent', host: remote.host ?? 'Noahクラウド',
    state: remote.state === 'returned' ? 'succeeded' : remote.state === 'cancelled' ? 'stopped' : remote.state,
    revision: job.revision, stopRequested: false,
    createdAt: Date.parse(job.createdAt), updatedAt: Date.parse(job.updatedAt),
    ...(finished ? { finishedAt: remote.completedAt ?? Date.parse(job.updatedAt) } : {}),
    ...(remote.error ? { error: remote.error } : {}),
    ...(includeResult && remote.result ? { result: remote.result, note: remote.note, cloudFiles: remote.cloud!.files ?? [] } : {}),
  };
}

export async function noahManagedWorkDetail(job: WorkJob): Promise<NoahAskItem> {
  const remote = job.noahRemote!;
  const usageReceipt = noahRemoteUsageReceipt('managed-cloud', remote);
  usageReceipt.metrics.toolCalls = await noahCloudRecordedToolCalls(remote);
  return { ...noahManagedWorkView(job, true), usageReceipt };
}
