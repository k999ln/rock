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
    async list(user: string, excludeAmc = false) {
      const rows = await db
        .prepare(
          'SELECT payload FROM work_jobs WHERE user_id = ?' +
            (excludeAmc
              ? " AND json_extract(payload, '$.templateId') != 'amc'"
              : '') +
            ' ORDER BY updated_at DESC, id DESC LIMIT 100',
        )
        .bind(user)
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
    async create(user: string, job: WorkJob) {
      await db
        .prepare(
          'INSERT INTO work_jobs (id, user_id, payload, revision, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING',
        )
        .bind(job.id, user, JSON.stringify(job), job.revision, job.updatedAt)
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
    async update(user: string, job: WorkJob, previousRevision: number) {
      const result = await db
        .prepare(
          'UPDATE work_jobs SET payload = ?, revision = ?, updated_at = ? WHERE id = ? AND user_id = ? AND revision = ?',
        )
        .bind(
          JSON.stringify(job),
          job.revision,
          job.updatedAt,
          job.id,
          user,
          previousRevision,
        )
        .run();
      return result.meta.changes === 1;
    },
  };
}
