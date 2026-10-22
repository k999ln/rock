import {NEWS_EVALUATION_HISTORY_SQL} from './eve-news-learning.ts';
import { normalizeWorkJob, type WorkJob } from './workflow.ts';

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
    async listMaterial(user: string) {
      const rows = await db.prepare(
        `SELECT id, json_extract(payload, '$.title') AS title, revision,
        json_extract(payload, '$.status') AS status, updated_at AS updatedAt
        FROM work_jobs WHERE user_id = ? AND json_extract(payload, '$.templateId') = 'material-invention'
        ORDER BY updated_at DESC, id DESC LIMIT 100`,
      ).bind(user).all<Pick<WorkJob, 'id' | 'title' | 'revision' | 'status' | 'updatedAt'>>();
      return rows.results;
    },
    async list(user: string, excludeAmc: boolean | {kind:'news'|'tool';threadId?:string} = false) {
      const rows = await db
        .prepare(
          'SELECT payload FROM work_jobs WHERE user_id = ?' +
            (typeof excludeAmc==='object'?(excludeAmc.kind==='tool'?" AND json_extract(payload,'$.eveTool.schema')='eve.tool-work/1' AND (?='' OR json_extract(payload,'$.eveTool.threadId')=?)":" AND json_extract(payload,'$.eveNews.schema')='eve.news-work/1' AND (?='' OR json_extract(payload,'$.eveNews.threadId')=?)"):excludeAmc
              ? " AND json_extract(payload, '$.templateId') != 'amc'"
              : '') +
            ' ORDER BY updated_at DESC, id DESC LIMIT 100',
        )
        .bind(user,...(typeof excludeAmc==='object'?[excludeAmc.threadId??'',excludeAmc.threadId??'']:[]))
        .all<{ payload: string }>();
      return rows.results.map((row) => normalizeWorkJob(JSON.parse(row.payload) as WorkJob));
    },
    async listAmc(user: string) {
      const rows = await db
        .prepare(
          `SELECT id, json_extract(payload, '$.title') AS title, revision,
          json_extract(payload, '$.status') AS status,
          json_extract(payload, '$.createdAt') AS createdAt, updated_at AS updatedAt
          FROM work_jobs WHERE user_id = ? AND json_extract(payload, '$.templateId') = 'amc'
          ORDER BY updated_at DESC, id DESC LIMIT 100`,
        )
        .bind(user)
        .all<
          Pick<
            WorkJob,
            'id' | 'title' | 'revision' | 'status' | 'createdAt' | 'updatedAt'
          >
        >();
      return rows.results.map(
        (row): WorkJob => ({
          ...row,
          templateId: 'amc',
          plan: { schemaVersion: 1, objective: row.title, approvalGates: [] },
          steps: [],
          events: [],
        }),
      );
    },
    async listJenniferAmc(user: string) {
      const rows = await db.prepare(`SELECT payload FROM work_jobs
        WHERE user_id = ? AND json_extract(payload, '$.templateId') = 'amc'
          AND json_extract(payload, '$.amcGoal.coordinationRef.schema') = 'rockstaros-jennifer-execution/1'
        ORDER BY updated_at DESC, id DESC LIMIT 50`)
        .bind(user).all<{ payload: string }>();
      return rows.results.map((row) => normalizeWorkJob(JSON.parse(row.payload) as WorkJob));
    },
    async findAmcForJenniferPlan(user: string, planId: string) {
      const row = await db
        .prepare(
          `SELECT payload FROM work_jobs
          WHERE user_id = ?
            AND json_extract(payload, '$.templateId') = 'amc'
            AND json_extract(payload, '$.amcGoal.coordinationRef.schema') = 'rockstaros-jennifer-execution/1'
            AND json_extract(payload, '$.amcGoal.coordinationRef.planId') = ?
          ORDER BY updated_at DESC, id DESC LIMIT 1`,
        )
        .bind(user, planId)
        .first<{ payload: string }>();
      return row ? normalizeWorkJob(JSON.parse(row.payload) as WorkJob) : null;
    },
    async findJenniferTaskJob(user: string, coordination: {
      rootJobId: string;
      planId: string;
      taskId: string;
      role: 'worker' | 'reviewer';
    }) {
      const row = await db.prepare(`SELECT payload FROM work_jobs
        WHERE user_id = ?
          AND json_extract(payload, '$.coordination.schema') = 'rockstaros-jennifer-task-job/1'
          AND json_extract(payload, '$.coordination.rootJobId') = ?
          AND json_extract(payload, '$.coordination.planId') = ?
          AND json_extract(payload, '$.coordination.taskId') = ?
          AND json_extract(payload, '$.coordination.role') = ?
          AND json_extract(payload, '$.status') != 'cancelled'
        ORDER BY updated_at DESC, id DESC LIMIT 1`)
        .bind(user, coordination.rootJobId, coordination.planId,
          coordination.taskId, coordination.role).first<{ payload: string }>();
      return row ? normalizeWorkJob(JSON.parse(row.payload) as WorkJob) : null;
    },
    async listJenniferTaskJobs(user: string, rootJobId: string) {
      const rows = await db.prepare(`SELECT payload FROM work_jobs
        WHERE user_id = ?
          AND json_extract(payload, '$.coordination.schema') = 'rockstaros-jennifer-task-job/1'
          AND json_extract(payload, '$.coordination.rootJobId') = ?
        ORDER BY updated_at, id`)
        .bind(user, rootJobId).all<{ payload: string }>();
      return rows.results.map((row) => normalizeWorkJob(JSON.parse(row.payload) as WorkJob));
    },
    async create(user: string, job: WorkJob, historyFence?: { threadId: string }) {
      await db
        .prepare(
          historyFence ? 'INSERT INTO work_jobs (id, user_id, payload, revision, updated_at) SELECT ?, ?, ?, ?, ? WHERE NOT EXISTS(SELECT 1 FROM eve_conversations WHERE owner_id=? AND id=? AND deleted_at!=0) ON CONFLICT(id) DO NOTHING' : 'INSERT INTO work_jobs (id, user_id, payload, revision, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING',
        )
        .bind(job.id, user, JSON.stringify(job), job.revision, job.updatedAt, ...(historyFence ? [user,historyFence.threadId] : []))
        .run();
      return get(user, job.id);
    },
    async update(user: string, job: WorkJob, previousRevision: number, _agentArtifactFence?:undefined, _agreementFence?:undefined, liveThreadId?:string, learningTrainingFence?:{contentSha256:string;dataSha256:string}) {
      const result = await db
        .prepare(
          'UPDATE work_jobs SET payload = ?, revision = ?, updated_at = ? WHERE id = ? AND user_id = ? AND revision = ?'+(liveThreadId?' AND EXISTS (SELECT 1 FROM eve_conversations c WHERE c.owner_id=work_jobs.user_id AND c.id=? AND c.deleted_at=0)':'')+(learningTrainingFence?` AND NOT EXISTS (${NEWS_EVALUATION_HISTORY_SQL})`:''),
        )
        .bind(
          JSON.stringify(job),
          job.revision,
          job.updatedAt,
          job.id,
          user,
          previousRevision,
          ...(liveThreadId?[liveThreadId]:[]),
          ...(learningTrainingFence?[user,learningTrainingFence.contentSha256,learningTrainingFence.dataSha256]:[]),
        )
        .run();
      return result.meta.changes === 1;
    },
  };
}
