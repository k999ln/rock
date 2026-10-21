import type { JenniferCoordinationPlan } from './jennifer-coordination.ts';
import type { JenniferQuestionResolution } from './jennifer-amc-execution.ts';
import { normalizeWorkJob, type WorkJob } from './workflow.ts';

export type JenniferPlanRevisionRecord = {
  id: string;
  ownerUserId: string;
  rootJobId: string;
  planId: string;
  revision: number;
  planDigest: string;
  parentPlanDigest: string | null;
  planJson: string;
  diffJson: string;
  resolutionJson: string;
  state: 'draft' | 'inventory_approved' | 'delivery_approved' | 'paused' | 'superseded' | 'accepted';
  approvedBy: string | null;
  createdAt: number;
  updatedAt: number;
};

export type JenniferTaskAttemptRecord = {
  id: string;
  ownerUserId: string;
  rootJobId: string;
  planRevision: number;
  taskId: string;
  attempt: number;
  role: 'worker' | 'reviewer';
  childJobId: string;
  delegationId: string;
  principal: string;
  inputDigest: string;
  artifactSetDigest: string | null;
  usageReceiptDigest: string | null;
  reportDigest: string | null;
  reportJson: string | null;
  state: string;
  createdAt: number;
  updatedAt: number;
};

export function jenniferExecutionStore(db: Pick<D1Database, 'prepare' | 'batch'>) {
  async function currentPlan(ownerUserId: string, rootJobId: string) {
    return db.prepare(`SELECT id, owner_user_id AS ownerUserId,
      root_job_id AS rootJobId, plan_id AS planId, revision,
      plan_digest AS planDigest, parent_plan_digest AS parentPlanDigest,
      plan_json AS planJson, diff_json AS diffJson,
      resolution_json AS resolutionJson, state, approved_by AS approvedBy,
      created_at AS createdAt, updated_at AS updatedAt
      FROM jennifer_plan_revisions
      WHERE owner_user_id = ? AND root_job_id = ?
      ORDER BY revision DESC LIMIT 1`)
      .bind(ownerUserId, rootJobId).first<JenniferPlanRevisionRecord>();
  }

  async function attemptByDelegation(ownerUserId: string, delegationId: string) {
    return db.prepare(`SELECT id, owner_user_id AS ownerUserId,
      root_job_id AS rootJobId, plan_revision AS planRevision,
      task_id AS taskId, attempt, role, child_job_id AS childJobId,
      delegation_id AS delegationId, principal, input_digest AS inputDigest,
      artifact_set_digest AS artifactSetDigest,
      usage_receipt_digest AS usageReceiptDigest,
      report_digest AS reportDigest, report_json AS reportJson, state,
      created_at AS createdAt, updated_at AS updatedAt
      FROM jennifer_task_attempts
      WHERE owner_user_id = ? AND delegation_id = ?`)
      .bind(ownerUserId, delegationId).first<JenniferTaskAttemptRecord>();
  }

  return {
    currentPlan,
    async createPlanWithRoot(input: {
      ownerUserId: string;
      root: WorkJob;
      plan: JenniferCoordinationPlan;
      planDigest: string;
      now?: number;
    }) {
      const now = input.now ?? Date.now();
      const payload = JSON.stringify(input.root);
      await db.batch([
        db.prepare(`INSERT INTO work_jobs
          (id, user_id, payload, revision, updated_at) VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET id = excluded.id
          WHERE work_jobs.user_id = excluded.user_id
            AND json_extract(work_jobs.payload, '$.amcCreationDigest') =
              json_extract(excluded.payload, '$.amcCreationDigest')`)
          .bind(input.root.id, input.ownerUserId, payload,
            input.root.revision, input.root.updatedAt),
        db.prepare(`INSERT INTO jennifer_plan_revisions (
          id, owner_user_id, root_job_id, plan_id, revision, plan_digest,
          parent_plan_digest, plan_json, diff_json, resolution_json, state,
          approved_by, created_at, updated_at
        ) SELECT ?, ?, ?, ?, 1, ?, NULL,
          CASE WHEN EXISTS (SELECT 1 FROM work_jobs
            WHERE id = ? AND user_id = ?
              AND json_extract(payload, '$.amcCreationDigest') = ?)
            THEN ? ELSE NULL END,
          '[]', '[]', 'draft', NULL, ?, ?
        ON CONFLICT(owner_user_id, root_job_id, revision) DO UPDATE SET
          plan_digest = CASE
            WHEN jennifer_plan_revisions.plan_digest = excluded.plan_digest
              THEN jennifer_plan_revisions.plan_digest
            ELSE NULL END`)
          .bind(crypto.randomUUID(), input.ownerUserId, input.root.id,
            input.plan.id, input.planDigest, input.root.id, input.ownerUserId,
            input.root.amcCreationDigest, JSON.stringify(input.plan), now, now),
      ]);
      const [row, stored] = await Promise.all([
        db.prepare(`SELECT payload FROM work_jobs WHERE id = ? AND user_id = ?
          AND json_extract(payload, '$.amcCreationDigest') = ?`)
          .bind(input.root.id, input.ownerUserId, input.root.amcCreationDigest)
          .first<{ payload: string }>(),
        currentPlan(input.ownerUserId, input.root.id),
      ]);
      if (!row || !stored || stored.revision !== 1 ||
        stored.planDigest !== input.planDigest || stored.planId !== input.plan.id)
        throw new Error('JENNIFER_PLAN_IDEMPOTENCY_CONFLICT');
      return { root: normalizeWorkJob(JSON.parse(row.payload) as WorkJob), plan: stored };
    },
    async createPlan(input: {
      ownerUserId: string;
      rootJobId: string;
      plan: JenniferCoordinationPlan;
      planDigest: string;
      now?: number;
    }) {
      const now = input.now ?? Date.now();
      await db.prepare(`INSERT INTO jennifer_plan_revisions (
        id, owner_user_id, root_job_id, plan_id, revision, plan_digest,
        parent_plan_digest, plan_json, diff_json, resolution_json, state,
        approved_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 1, ?, NULL, ?, '[]', '[]', 'draft', NULL, ?, ?)
      ON CONFLICT(owner_user_id, root_job_id, revision) DO NOTHING`)
        .bind(crypto.randomUUID(), input.ownerUserId, input.rootJobId,
          input.plan.id, input.planDigest, JSON.stringify(input.plan), now, now).run();
      const stored = await currentPlan(input.ownerUserId, input.rootJobId);
      if (!stored || stored.planDigest !== input.planDigest)
        throw new Error('JENNIFER_PLAN_IDEMPOTENCY_CONFLICT');
      return stored;
    },
    async setPlanState(input: {
      ownerUserId: string;
      rootJobId: string;
      revision: number;
      from: JenniferPlanRevisionRecord['state'][];
      to: JenniferPlanRevisionRecord['state'];
      approvedBy?: string | null;
      resolutions?: JenniferQuestionResolution[];
      now?: number;
    }) {
      const current = await currentPlan(input.ownerUserId, input.rootJobId);
      if (!current || current.revision !== input.revision || !input.from.includes(current.state))
        throw new Error('JENNIFER_PLAN_REVISION_CONFLICT');
      const now = input.now ?? Date.now();
      const result = await db.prepare(`UPDATE jennifer_plan_revisions
        SET state = ?, approved_by = ?, resolution_json = ?, updated_at = ?
        WHERE owner_user_id = ? AND root_job_id = ? AND revision = ? AND state = ?`)
        .bind(input.to, input.approvedBy ?? current.approvedBy,
          JSON.stringify(input.resolutions ?? JSON.parse(current.resolutionJson)), now,
          input.ownerUserId, input.rootJobId, input.revision, current.state).run();
      if (result.meta.changes !== 1) throw new Error('JENNIFER_PLAN_REVISION_CONFLICT');
      return currentPlan(input.ownerUserId, input.rootJobId);
    },
    async commitStateWithRoot(input: {
      ownerUserId: string;
      root: WorkJob;
      previousRootRevision: number;
      planRevision: number;
      from: JenniferPlanRevisionRecord['state'][];
      to: JenniferPlanRevisionRecord['state'];
      approvedBy?: string | null;
      resolutions?: JenniferQuestionResolution[];
      now?: number;
    }) {
      const current = await currentPlan(input.ownerUserId, input.root.id);
      if (!current || current.revision !== input.planRevision ||
        (!input.from.includes(current.state) && current.state !== input.to))
        throw new Error('JENNIFER_PLAN_REVISION_CONFLICT');
      const now = input.now ?? Date.now();
      const storedResolutions = input.resolutions ?? JSON.parse(current.resolutionJson) as JenniferQuestionResolution[];
      const results = await db.batch([
        db.prepare(`UPDATE jennifer_plan_revisions
          SET state = ?, approved_by = ?, resolution_json = ?, updated_at = ?
          WHERE owner_user_id = ? AND root_job_id = ? AND revision = ? AND state = ?
            AND EXISTS (SELECT 1 FROM work_jobs
              WHERE id = ? AND user_id = ? AND revision = ?)`)
          .bind(input.to, input.approvedBy ?? current.approvedBy,
            JSON.stringify(storedResolutions), now, input.ownerUserId, input.root.id,
            input.planRevision, current.state, input.root.id, input.ownerUserId,
            input.previousRootRevision),
        db.prepare(`UPDATE work_jobs SET payload = ?, revision = ?, updated_at = ?
          WHERE id = ? AND user_id = ? AND revision = ?
            AND EXISTS (SELECT 1 FROM jennifer_plan_revisions
              WHERE owner_user_id = ? AND root_job_id = ? AND revision = ? AND state = ?)`)
          .bind(JSON.stringify(input.root), input.root.revision, input.root.updatedAt,
            input.root.id, input.ownerUserId, input.previousRootRevision,
            input.ownerUserId, input.root.id, input.planRevision, input.to),
      ]);
      if ((results[1]?.meta.changes ?? 0) !== 1)
        throw new Error('JENNIFER_PLAN_REVISION_CONFLICT');
      return currentPlan(input.ownerUserId, input.root.id);
    },
    async revisePlan(input: {
      ownerUserId: string;
      rootJobId: string;
      previous: JenniferPlanRevisionRecord;
      plan: JenniferCoordinationPlan;
      planDigest: string;
      diff: unknown;
      now?: number;
    }) {
      if (input.previous.state !== 'paused') throw new Error('JENNIFER_PLAN_MUST_BE_PAUSED');
      const now = input.now ?? Date.now();
      const nextRevision = input.previous.revision + 1;
      await db.prepare(`INSERT INTO jennifer_plan_revisions (
        id, owner_user_id, root_job_id, plan_id, revision, plan_digest,
        parent_plan_digest, plan_json, diff_json, resolution_json, state,
        approved_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', 'draft', NULL, ?, ?)
      ON CONFLICT(owner_user_id, root_job_id, revision) DO NOTHING`)
        .bind(crypto.randomUUID(), input.ownerUserId, input.rootJobId,
          input.plan.id, nextRevision, input.planDigest, input.previous.planDigest,
          JSON.stringify(input.plan), JSON.stringify(input.diff), now, now).run();
      const next = await currentPlan(input.ownerUserId, input.rootJobId);
      if (!next || next.revision !== nextRevision || next.planDigest !== input.planDigest)
        throw new Error('JENNIFER_PLAN_IDEMPOTENCY_CONFLICT');
      await db.prepare(`UPDATE jennifer_plan_revisions SET state = 'superseded', updated_at = ?
        WHERE owner_user_id = ? AND root_job_id = ? AND revision = ? AND state = 'paused'`)
        .bind(now, input.ownerUserId, input.rootJobId, input.previous.revision).run();
      return next;
    },
    async revisePlanWithRoot(input: {
      ownerUserId: string;
      root: WorkJob;
      previousRootRevision: number;
      previous: JenniferPlanRevisionRecord;
      plan: JenniferCoordinationPlan;
      planDigest: string;
      diff: unknown;
      now?: number;
    }) {
      if (input.previous.state !== 'paused') throw new Error('JENNIFER_PLAN_MUST_BE_PAUSED');
      const now = input.now ?? Date.now();
      const nextRevision = input.previous.revision + 1;
      const results = await db.batch([
        db.prepare(`INSERT INTO jennifer_plan_revisions (
          id, owner_user_id, root_job_id, plan_id, revision, plan_digest,
          parent_plan_digest, plan_json, diff_json, resolution_json, state,
          approved_by, created_at, updated_at
        ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', 'draft', NULL, ?, ?
          WHERE EXISTS (SELECT 1 FROM jennifer_plan_revisions
            WHERE owner_user_id = ? AND root_job_id = ? AND revision = ? AND state = 'paused')
            AND EXISTS (SELECT 1 FROM work_jobs
              WHERE id = ? AND user_id = ? AND revision = ?)
          ON CONFLICT(owner_user_id, root_job_id, revision) DO NOTHING`)
          .bind(crypto.randomUUID(), input.ownerUserId, input.root.id,
            input.plan.id, nextRevision, input.planDigest, input.previous.planDigest,
            JSON.stringify(input.plan), JSON.stringify(input.diff), now, now,
            input.ownerUserId, input.root.id, input.previous.revision,
            input.root.id, input.ownerUserId, input.previousRootRevision),
        db.prepare(`UPDATE jennifer_plan_revisions SET state = 'superseded', updated_at = ?
          WHERE owner_user_id = ? AND root_job_id = ? AND revision = ? AND state = 'paused'
            AND EXISTS (SELECT 1 FROM jennifer_plan_revisions newer
              WHERE newer.owner_user_id = ? AND newer.root_job_id = ?
                AND newer.revision = ? AND newer.plan_digest = ? AND newer.state = 'draft')`)
          .bind(now, input.ownerUserId, input.root.id, input.previous.revision,
            input.ownerUserId, input.root.id, nextRevision, input.planDigest),
        db.prepare(`UPDATE work_jobs SET payload = ?, revision = ?, updated_at = ?
          WHERE id = ? AND user_id = ? AND revision = ?
            AND EXISTS (SELECT 1 FROM jennifer_plan_revisions
              WHERE owner_user_id = ? AND root_job_id = ? AND revision = ? AND state = 'superseded')
            AND EXISTS (SELECT 1 FROM jennifer_plan_revisions
              WHERE owner_user_id = ? AND root_job_id = ? AND revision = ?
                AND plan_digest = ? AND state = 'draft')`)
          .bind(JSON.stringify(input.root), input.root.revision, input.root.updatedAt,
            input.root.id, input.ownerUserId, input.previousRootRevision,
            input.ownerUserId, input.root.id, input.previous.revision,
            input.ownerUserId, input.root.id, nextRevision, input.planDigest),
      ]);
      if ((results[2]?.meta.changes ?? 0) !== 1)
        throw new Error('JENNIFER_PLAN_REVISION_CONFLICT');
      const next = await currentPlan(input.ownerUserId, input.root.id);
      if (!next || next.revision !== nextRevision || next.planDigest !== input.planDigest)
        throw new Error('JENNIFER_PLAN_IDEMPOTENCY_CONFLICT');
      return next;
    },
    attemptByDelegation,
    async workerAttempt(ownerUserId: string, rootJobId: string, planRevision: number, taskId: string) {
      return db.prepare(`SELECT id, owner_user_id AS ownerUserId,
        root_job_id AS rootJobId, plan_revision AS planRevision,
        task_id AS taskId, attempt, role, child_job_id AS childJobId,
        delegation_id AS delegationId, principal, input_digest AS inputDigest,
        artifact_set_digest AS artifactSetDigest,
        usage_receipt_digest AS usageReceiptDigest,
        report_digest AS reportDigest, report_json AS reportJson, state,
        created_at AS createdAt, updated_at AS updatedAt
        FROM jennifer_task_attempts WHERE owner_user_id = ? AND root_job_id = ?
        AND plan_revision = ? AND task_id = ? AND attempt = 1 AND role = 'worker'`)
        .bind(ownerUserId, rootJobId, planRevision, taskId).first<JenniferTaskAttemptRecord>();
    },
    async registerAttempt(input: {
      ownerUserId: string;
      rootJobId: string;
      planRevision: number;
      taskId: string;
      role: 'worker' | 'reviewer';
      childJobId: string;
      delegationId: string;
      principal: string;
      inputDigest: string;
      state: string;
      now?: number;
    }) {
      const now = input.now ?? Date.now();
      await db.prepare(`INSERT INTO jennifer_task_attempts (
        id, owner_user_id, root_job_id, plan_revision, task_id, attempt, role,
        child_job_id, delegation_id, principal, input_digest,
        artifact_set_digest, usage_receipt_digest, report_digest, report_json,
        state, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?, ?)
      ON CONFLICT(owner_user_id, root_job_id, plan_revision, task_id, attempt, role) DO NOTHING`)
        .bind(crypto.randomUUID(), input.ownerUserId, input.rootJobId,
          input.planRevision, input.taskId, input.role, input.childJobId,
          input.delegationId, input.principal, input.inputDigest, input.state, now, now).run();
      const stored = await attemptByDelegation(input.ownerUserId, input.delegationId);
      if (!stored || stored.rootJobId !== input.rootJobId || stored.taskId !== input.taskId ||
        stored.role !== input.role || stored.principal !== input.principal ||
        stored.inputDigest !== input.inputDigest)
        throw new Error('JENNIFER_ATTEMPT_IDEMPOTENCY_CONFLICT');
      return stored;
    },
    async completeAttempt(input: {
      ownerUserId: string;
      delegationId: string;
      artifactSetDigest: string;
      usageReceiptDigest: string;
      reportDigest: string;
      report: unknown;
      state: string;
      now?: number;
    }) {
      const current = await attemptByDelegation(input.ownerUserId, input.delegationId);
      if (!current) throw new Error('JENNIFER_ATTEMPT_NOT_FOUND');
      if (current.reportDigest) {
        if (current.reportDigest !== input.reportDigest)
          throw new Error('JENNIFER_REPORT_IDEMPOTENCY_CONFLICT');
        return current;
      }
      const result = await db.prepare(`UPDATE jennifer_task_attempts SET
        artifact_set_digest = ?, usage_receipt_digest = ?, report_digest = ?,
        report_json = ?, state = ?, updated_at = ?
        WHERE owner_user_id = ? AND delegation_id = ? AND report_digest IS NULL`)
        .bind(input.artifactSetDigest, input.usageReceiptDigest, input.reportDigest,
          JSON.stringify(input.report), input.state, input.now ?? Date.now(),
          input.ownerUserId, input.delegationId).run();
      if (result.meta.changes !== 1) throw new Error('JENNIFER_REPORT_IDEMPOTENCY_CONFLICT');
      return attemptByDelegation(input.ownerUserId, input.delegationId);
    },
    async listAttempts(ownerUserId: string, rootJobId: string) {
      const rows = await db.prepare(`SELECT id, owner_user_id AS ownerUserId,
        root_job_id AS rootJobId, plan_revision AS planRevision,
        task_id AS taskId, attempt, role, child_job_id AS childJobId,
        delegation_id AS delegationId, principal, input_digest AS inputDigest,
        artifact_set_digest AS artifactSetDigest,
        usage_receipt_digest AS usageReceiptDigest,
        report_digest AS reportDigest, report_json AS reportJson, state,
        created_at AS createdAt, updated_at AS updatedAt
        FROM jennifer_task_attempts WHERE owner_user_id = ? AND root_job_id = ?
        ORDER BY created_at, id`)
        .bind(ownerUserId, rootJobId).all<JenniferTaskAttemptRecord>();
      return rows.results;
    },
  };
}
