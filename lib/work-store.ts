import {NEWS_EVALUATION_HISTORY_SQL} from './eve-news-learning.ts';
import { normalizeWorkJob, type WorkJob } from './workflow.ts';

export type AgentArtifactFence = { delegationId: string; artifacts: Array<{ id: string; sha256: string; taskId: string }> };

export function workStore(db: Pick<D1Database, 'prepare'>) {
  async function get(user: string, id: string): Promise<WorkJob | null> {
    const row = await db
      .prepare('SELECT payload FROM work_jobs WHERE user_id = ? AND id = ?')
      .bind(user, id)
      .first<{ payload: string }>();
    return row ? normalizeWorkJob(JSON.parse(row.payload) as WorkJob) : null;
  }
  return {
    get,
    async list(user: string, scope?: { kind: 'news' | 'tool'; threadId?: string }) {
      const rows = await db
        .prepare(
          scope ? (scope.kind==='tool' ? "SELECT payload FROM work_jobs WHERE user_id=? AND json_extract(payload,'$.eveTool.schema')='eve.tool-work/1' AND (?='' OR json_extract(payload,'$.eveTool.threadId')=?) ORDER BY updated_at DESC,id DESC LIMIT 100" : "SELECT payload FROM work_jobs WHERE user_id=? AND json_extract(payload,'$.eveNews.schema')='eve.news-work/1' AND (?='' OR json_extract(payload,'$.eveNews.threadId')=?) ORDER BY updated_at DESC,id DESC LIMIT 100") : 'SELECT payload FROM work_jobs WHERE user_id = ? ORDER BY updated_at DESC, id DESC LIMIT 100',
        )
        .bind(user,...(scope ? [scope.threadId??'',scope.threadId??''] : []))
        .all<{ payload: string }>();
      return rows.results.map((row) => normalizeWorkJob(JSON.parse(row.payload) as WorkJob));
    },
    async create(user: string, job: WorkJob, historyFence?: { threadId: string; agent?: { id: string; revision: number } }) {
      await db
        .prepare(
          historyFence ? 'INSERT INTO work_jobs (id, user_id, payload, revision, updated_at) SELECT ?, ?, ?, ?, ? WHERE NOT EXISTS(SELECT 1 FROM eve_conversations WHERE owner_id=? AND id=? AND deleted_at!=0)' + (historyFence.agent ? " AND EXISTS(SELECT 1 FROM sky_agent_settings WHERE owner_user_id=? AND id=? AND revision=? AND json_extract(settings,'$.enabled')=1 AND (source_tool IS NULL OR EXISTS(SELECT 1 FROM sky_connections c WHERE c.user_id=sky_agent_settings.owner_user_id AND c.tool=sky_agent_settings.source_tool)))" : '') + ' ON CONFLICT(id) DO NOTHING' : 'INSERT INTO work_jobs (id, user_id, payload, revision, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING',
        )
        .bind(job.id, user, JSON.stringify(job), job.revision, job.updatedAt, ...(historyFence ? [user,historyFence.threadId,...(historyFence.agent?[user,historyFence.agent.id,historyFence.agent.revision]:[])] : []))
        .run();
      return get(user, job.id);
    },
    async update(user: string, job: WorkJob, previousRevision: number, agentArtifactFence?: AgentArtifactFence[], agreementFence?: {platformId:string;publisherId:string;id:string;version:string;agreementSha256:string;termsSha256:string}, liveThreadId?:string, learningTrainingFence?:{contentSha256:string;dataSha256:string}) {
      const artifactParams: unknown[] = [];
      const artifactSql = (agentArtifactFence ?? []).map(fence => {
        const expected = fence.artifacts.slice().sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0).map(a => [a.id, a.sha256, a.taskId]);
        artifactParams.push(fence.delegationId, user, fence.delegationId, JSON.stringify(expected));
        return ` AND EXISTS (SELECT 1 FROM agent_delegations d WHERE d.id = ? AND d.owner_user_id = work_jobs.user_id AND d.parent_job_id = work_jobs.id
          AND d.state = 'remote_completed' AND d.artifacts_captured = 1
          AND (SELECT json_group_array(json_array(id, artifact_sha256, remote_task_id)) FROM
            (SELECT id, artifact_sha256, remote_task_id FROM agent_delegation_artifacts WHERE owner_user_id = ? AND delegation_id = ? ORDER BY id)) = json(?))`;
      }).join('');
      if (agentArtifactFence && job.status === 'completed') artifactParams.push(agentArtifactFence.length);
      const agreementSql = agreementFence ? ' AND EXISTS (SELECT 1 FROM sky_author_agreement_documents a WHERE a.platform_id=? AND a.publisher_id=? AND a.agreement_id=? AND a.version=? AND a.agreement_sha256=? AND a.terms_sha256=? AND a.revoked_at IS NULL)' : '';
      const agreementParams = agreementFence ? [agreementFence.platformId,agreementFence.publisherId,agreementFence.id,agreementFence.version,agreementFence.agreementSha256,agreementFence.termsSha256] : [];
      const liveThreadSql=liveThreadId?' AND EXISTS (SELECT 1 FROM eve_conversations c WHERE c.owner_id=work_jobs.user_id AND c.id=? AND c.deleted_at=0)':'';
      const learningSql=learningTrainingFence?` AND NOT EXISTS (${NEWS_EVALUATION_HISTORY_SQL})`:'';
      const result = await db
        .prepare(
          `UPDATE work_jobs SET payload = ?, revision = ?, updated_at = ? WHERE id = ? AND user_id = ? AND revision = ?
          AND ${job.eveAgent && job.status === 'completed' ? `EXISTS (SELECT 1 FROM agent_delegations d WHERE d.parent_job_id = work_jobs.id AND d.owner_user_id = work_jobs.user_id)
          AND NOT EXISTS (SELECT 1 FROM agent_delegations d WHERE d.parent_job_id = work_jobs.id AND d.owner_user_id = work_jobs.user_id
            AND (d.state <> 'remote_completed' OR d.artifacts_captured <> 1 OR NOT EXISTS (SELECT 1 FROM a2a_usage_receipts r WHERE r.delegation_id = d.id AND r.owner_user_id = d.owner_user_id AND r.parent_job_id = d.parent_job_id)))` : '1=1'}${artifactSql}${agentArtifactFence && job.status === 'completed' ? ' AND (SELECT COUNT(*) FROM agent_delegations d WHERE d.owner_user_id = work_jobs.user_id AND d.parent_job_id = work_jobs.id) = ?' : ''}${agreementSql}${liveThreadSql}${learningSql}`,

        )
        .bind(
          JSON.stringify(job),
          job.revision,
          job.updatedAt,
          job.id,
          user,
          previousRevision,
          ...artifactParams,
          ...agreementParams,
          ...(liveThreadId?[liveThreadId]:[]),
          ...(learningTrainingFence?[user,learningTrainingFence.contentSha256,learningTrainingFence.dataSha256]:[]),
        )
        .run();
      return result.meta.changes === 1;
    },
  };
}
