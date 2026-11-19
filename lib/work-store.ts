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
    async listNoahOperations(user: string, agentId: string | null = null, archived = false) {
      const rows = await db.prepare(`SELECT payload FROM work_jobs WHERE user_id = ? AND json_extract(payload, '$.templateId') = 'noah-operation'
        AND (json_extract(payload, '$.noahOperation.state') = 'archived') = ${archived ? 1 : 0}
        ${agentId ? "AND json_extract(payload, '$.noahOperation.config.agentId') = ?" : ''}
        ORDER BY updated_at DESC, id DESC LIMIT 20`).bind(...(agentId ? [user, agentId] : [user])).all<{ payload: string }>();
      return rows.results.map(row => normalizeWorkJob(JSON.parse(row.payload) as WorkJob));
    },
    async createNoahOperation(user: string, job: WorkJob) {
      await db.prepare(`INSERT INTO work_jobs (id,user_id,payload,revision,updated_at) SELECT ?,?,?,?,?
        WHERE (SELECT COUNT(*) FROM work_jobs WHERE user_id = ? AND json_extract(payload,'$.templateId') = 'noah-operation' AND json_extract(payload,'$.noahOperation.state') != 'archived') < 20
        ON CONFLICT(id) DO NOTHING`).bind(job.id,user,JSON.stringify(job),job.revision,job.updatedAt,user).run();
      return get(user, job.id);
    },
    async updateNoahOperation(user: string, job: WorkJob, revision: number, restoring = false) {
      const result = await db.prepare(`UPDATE work_jobs SET payload = ?,revision = ?,updated_at = ? WHERE id = ? AND user_id = ? AND revision = ?
        AND (? = 0 OR (SELECT COUNT(*) FROM work_jobs WHERE user_id = ? AND json_extract(payload,'$.templateId') = 'noah-operation'
          AND json_extract(payload,'$.noahOperation.state') != 'archived') < 20)`)
        .bind(JSON.stringify(job),job.revision,job.updatedAt,job.id,user,revision,restoring ? 1 : 0,user).run();
      return result.meta.changes === 1;
    },
    async listNoahEvents(user: string, agentId: string, cursor: { at: number; id: string }) {
      const rows = await db.prepare(`SELECT payload FROM work_jobs WHERE user_id = ? AND json_extract(payload,'$.templateId') = 'noah-agent-local'
        AND json_extract(payload,'$.noahExecution.agentId') = ? AND json_extract(payload,'$.noahExecution.state') = 'returned'
        AND json_extract(payload,'$.noahExecution.result.exitCode') = 0 AND json_type(payload,'$.noahExecution.completedAt') = 'integer'
        AND (json_extract(payload,'$.noahExecution.completedAt') > ? OR (json_extract(payload,'$.noahExecution.completedAt') = ? AND id > ?))
        ORDER BY json_extract(payload,'$.noahExecution.completedAt'),id LIMIT 25`).bind(user,agentId,cursor.at,cursor.at,cursor.id).all<{payload:string}>();
      return rows.results.map(row => normalizeWorkJob(JSON.parse(row.payload) as WorkJob));
    },
    async createNoahOperationRun(user: string, job: WorkJob, parent: WorkJob) {
      await db.prepare(`INSERT INTO work_jobs (id,user_id,payload,revision,updated_at) SELECT ?,?,?,?,?
        WHERE EXISTS (SELECT 1 FROM work_jobs WHERE id = ? AND user_id = ? AND revision = ?
          AND json_extract(payload,'$.noahOperation.state') = 'enabled'
          AND json_extract(payload,'$.noahOperation.active.jobId') = ?)
        AND (? IS NULL OR EXISTS (SELECT 1 FROM work_jobs WHERE id = ? AND user_id = ? AND revision = ?))
        ON CONFLICT(id) DO NOTHING`).bind(job.id,user,JSON.stringify(job),job.revision,job.updatedAt,parent.id,user,parent.revision,job.id,job.noahExecution?.operation?.event?.jobId ?? null,job.noahExecution?.operation?.event?.jobId ?? null,user,job.noahExecution?.operation?.event?.revision ?? null).run();
      return get(user, job.id);
    },
    async startNoahOperationRun(user: string, job: WorkJob, previousRevision: number, parent: WorkJob) {
      const result = await db.prepare(`UPDATE work_jobs SET payload = ?,revision = ?,updated_at = ? WHERE id = ? AND user_id = ? AND revision = ?
        AND EXISTS (SELECT 1 FROM work_jobs p WHERE p.id = ? AND p.user_id = ? AND p.revision = ?
          AND json_extract(p.payload,'$.noahOperation.state') = 'enabled'
          AND json_extract(p.payload,'$.noahOperation.active.jobId') = ?)
        AND (? IS NULL OR EXISTS (SELECT 1 FROM work_jobs WHERE id = ? AND user_id = ? AND revision = ?))`)
        .bind(JSON.stringify(job),job.revision,job.updatedAt,job.id,user,previousRevision,parent.id,user,parent.revision,job.id,job.noahExecution?.operation?.event?.jobId ?? null,job.noahExecution?.operation?.event?.jobId ?? null,user,job.noahExecution?.operation?.event?.revision ?? null).run();
      return result.meta.changes === 1;
    },
    async listNoah(user: string, agentId: string | null = null) {
      const rows = await db.prepare(`SELECT payload FROM work_jobs WHERE user_id = ?
        AND json_type(payload, '$.noahExecution') = 'object'
        ${agentId ? "AND json_extract(payload, '$.noahExecution.agentId') = ?" : ''}
        ORDER BY updated_at DESC, id DESC LIMIT 100`).bind(...(agentId ? [user, agentId] : [user])).all<{ payload: string }>();
      return rows.results.map(row => normalizeWorkJob(JSON.parse(row.payload) as WorkJob));
    },
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
    /** Bind only if the saved owner's enabled role is still the selected revision at insertion. */
    async createAgentBound(user: string, job: WorkJob, reviewedManifest?: string, reviewExpiresAt?: number) {
      const binding = job.agentBinding;
      if (!binding) throw new Error('WORK_AGENT_BINDING_REQUIRED');
      const review = binding.creationReview;
      if (review && (!reviewedManifest || !Number.isSafeInteger(reviewExpiresAt))) throw new Error('WORK_CREATION_REVIEW_REQUIRED');
      await db.prepare(`INSERT INTO work_jobs (id, user_id, payload, revision, updated_at)
        SELECT ?, ?, ?, ?, ? WHERE EXISTS (
          SELECT 1 FROM sky_agent_settings a
          WHERE a.owner_user_id = ? AND a.id = ? AND a.revision = ?
            AND json_extract(a.settings, '$.enabled') = 1
            AND (a.source_tool IS NULL OR EXISTS (
              SELECT 1 FROM sky_connections c WHERE c.user_id = a.owner_user_id AND c.tool = a.source_tool
            ))
        ) ${review ? `AND ? > CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
          AND ? <= CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER) + 30000
          AND EXISTS (SELECT 1 FROM sky_agent_settings a
          WHERE a.owner_user_id = ? AND a.id = ? AND a.revision = ?
            AND json_extract(a.settings, '$.requirements.packageKey') = ?
            AND json_extract(a.settings, '$.requirements.executionTarget') = 'pc')
          AND EXISTS (SELECT 1 FROM sky_tool_packages p WHERE p.package_key = ? AND p.manifest_sha256 = ?
            AND p.manifest = ? AND p.status = 'verified'
            AND EXISTS (SELECT 1 FROM sky_tool_package_reviews r WHERE r.package_key = p.package_key
              AND r.manifest_sha256 = p.manifest_sha256 AND r.decision = 'verified'
              AND (r.expires_at IS NULL OR r.expires_at > CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER))))` : ''}
        ON CONFLICT(id) DO NOTHING`)
        .bind(job.id, user, JSON.stringify(job), job.revision, job.updatedAt,
          user, binding.agentId, binding.agentRevision,
          ...(review ? [reviewExpiresAt!,reviewExpiresAt!,user,binding.agentId,binding.agentRevision,review.packageKey,
            review.packageKey,review.manifestSha256,reviewedManifest!] : [])).run();
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
