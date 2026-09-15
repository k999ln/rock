import { env } from 'cloudflare:workers';
import {
  recordManualCsvPayment,
  requireCsvOperator,
  retryCsvJob,
  CsvJobError,
} from './csv-job-store';
import { sha256 } from './csv-transform';
import {
  csvJstMonth,
  csvMonthlyNetForMonth,
  type CsvPaymentEvent,
} from './csv-money';
import { CSV_FEE_POLICY_VERSION, csvFeeDecision } from './csv-fee-policy';

const CONTRACT_ID = 'csv-seller-fee/1';

function database() {
  const db = (env as unknown as { DB?: D1Database }).DB;
  if (!db)
    throw new CsvJobError(503, 'STORAGE', '運営台帳の保存先を利用できません。');
  return db;
}

function validIdempotencyKey(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9-]{36}$/i.test(value);
}

async function operatorRequestDigest(action: string, request: unknown) {
  return sha256(new TextEncoder().encode(JSON.stringify({ action, request })));
}

async function priorOperatorResult(
  db: D1Database,
  actorHash: string,
  idempotencyKey: string,
  requestDigest: string,
  expectedAction: string,
) {
  const prior = await db
    .prepare(
      `SELECT action, request_digest, detail_json FROM csv_operator_events
       WHERE actor_hash = ? AND idempotency_key = ?`,
    )
    .bind(actorHash, idempotencyKey)
    .first<{
      action: string;
      request_digest: string | null;
      detail_json: string;
    }>();
  if (!prior) return null;
  if (prior.action !== expectedAction || prior.request_digest !== requestDigest)
    throw new CsvJobError(
      409,
      'IDEMPOTENCY',
      '同じ冪等キーを別の操作には使えません。',
    );
  try {
    return (
      (JSON.parse(prior.detail_json) as { result?: unknown }).result ?? null
    );
  } catch {
    throw new CsvJobError(
      409,
      'IDEMPOTENCY',
      '以前の運営操作の結果を読み取れません。',
    );
  }
}

function operatorAuditStatements(
  db: D1Database,
  input: {
    actorHash: string;
    idempotencyKey: string;
    action: string;
    requestDigest: string;
    details: unknown;
    result: unknown;
    jobId?: string;
    createdAt: number;
    gateSql?: string;
    gateBinds?: unknown[];
  },
) {
  const eventId = crypto.randomUUID();
  const outboxId = crypto.randomUUID();
  const payload = JSON.stringify({
    details: input.details,
    result: input.result,
  });
  const gate = input.gateSql ?? '1 = 1';
  return [
    db
      .prepare(
        `INSERT INTO csv_operator_events
         (id, actor_hash, action, job_id, detail_json, created_at,
          idempotency_key, request_digest)
         SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE (${gate})
           AND NOT EXISTS (SELECT 1 FROM csv_operator_events
             WHERE actor_hash = ? AND idempotency_key = ?)
         ON CONFLICT(actor_hash, idempotency_key) DO NOTHING`,
      )
      .bind(
        eventId,
        input.actorHash,
        input.action,
        input.jobId ?? null,
        payload,
        input.createdAt,
        input.idempotencyKey,
        input.requestDigest,
        ...(input.gateBinds ?? []),
        input.actorHash,
        input.idempotencyKey,
      ),
    db
      .prepare(
        `INSERT INTO csv_operator_outbox
         (id, actor_hash, idempotency_key, action, payload_json, created_at)
         SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS
           (SELECT 1 FROM csv_operator_events
             WHERE actor_hash = ? AND idempotency_key = ? AND id = ?)
         ON CONFLICT(actor_hash, idempotency_key) DO NOTHING`,
      )
      .bind(
        outboxId,
        input.actorHash,
        input.idempotencyKey,
        input.action,
        payload,
        input.createdAt,
        input.actorHash,
        input.idempotencyKey,
        eventId,
      ),
  ];
}

async function operatorReplayAfterBatch(
  db: D1Database,
  actorHash: string,
  idempotencyKey: string,
  requestDigest: string,
  expectedAction: string,
) {
  return priorOperatorResult(
    db,
    actorHash,
    idempotencyKey,
    requestDigest,
    expectedAction,
  );
}

function normalizeMonth(month: unknown) {
  if (month === undefined || month === null || month === '')
    return csvJstMonth(Date.now());
  if (typeof month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
    throw new CsvJobError(
      400,
      'MONTH_JST',
      '年月はYYYY-MMで指定してください。',
    );
  return month;
}

export async function csvOperationsSnapshot(operator: string) {
  const actorHash = await requireCsvOperator(operator);
  const db = database();
  const [settings, jobs, events, fees, controls, costs, interventions] =
    await Promise.all([
      db
        .prepare(
          "SELECT accepting_new, paused_reason, revision, updated_at FROM csv_operator_settings WHERE id = 'global'",
        )
        .first<{
          accepting_new: number;
          paused_reason: string | null;
          revision: number;
          updated_at: number;
        }>(),
      db
        .prepare(
          `SELECT id, user_id, status, payment_status, seller_id, channel,
         input_bytes, input_sha256, output_sha256, attempt, delivery_revision,
         error_code, quote_minor, currency, expires_at, created_at, updated_at,
         revision, accepted_at, completed_at
         FROM csv_jobs ORDER BY updated_at DESC LIMIT 100`,
        )
        .all<{
          id: string;
          user_id: string;
          status: string;
          payment_status: string;
          seller_id: string;
          channel: string;
          input_bytes: number;
          input_sha256: string;
          output_sha256: string | null;
          attempt: number;
          delivery_revision: number;
          error_code: string | null;
          quote_minor: number;
          currency: string;
          expires_at: number;
          created_at: number;
          updated_at: number;
          revision: number;
          accepted_at: number | null;
          completed_at: number | null;
        }>(),
      db
        .prepare(
          `SELECT id, job_id, user_id, seller_id, provider, provider_event_id,
         related_provider_event_id, related_event_type, type, amount_minor, currency, occurred_at,
         evidence_digest, source FROM csv_payment_events
         ORDER BY occurred_at DESC LIMIT 100`,
        )
        .all<{
          id: string;
          job_id: string;
          user_id: string;
          seller_id: string;
          provider: string;
          provider_event_id: string;
          related_provider_event_id: string | null;
          related_event_type: 'buyer_paid' | 'paid_to_owner' | null;
          type: string;
          amount_minor: number;
          currency: string;
          occurred_at: number;
          evidence_digest: string;
          source: string;
        }>(),
      db
        .prepare(
          `SELECT seller_id, billing_account_id, contract_id, policy_version,
         month_jst, verified_net_usd_minor, fee_due_usd_minor, status, reason,
         evidence_digest, created_at, updated_at FROM csv_monthly_fee_decisions
         ORDER BY month_jst DESC, created_at DESC LIMIT 100`,
        )
        .all(),
      db
        .prepare(
          `SELECT scope_type, scope_id, accepting_new, paused_reason, revision, updated_at
       FROM csv_intake_controls ORDER BY scope_type, scope_id`,
        )
        .all<{
          scope_type: 'owner' | 'seller';
          scope_id: string;
          accepting_new: number;
          paused_reason: string | null;
          revision: number;
          updated_at: number;
        }>(),
      db
        .prepare(
          `SELECT job_id, category, amount_minor, currency, evidence_digest, actor_hash, created_at
       FROM csv_job_costs ORDER BY created_at DESC LIMIT 200`,
        )
        .all<{
          job_id: string;
          category: string;
          amount_minor: number;
          currency: string;
          evidence_digest: string;
          actor_hash: string;
          created_at: number;
        }>(),
      db
        .prepare(
          `SELECT job_id, detail_json, created_at FROM csv_job_events
       WHERE event = 'operator_intervention' ORDER BY created_at DESC LIMIT 200`,
        )
        .all<{ job_id: string; detail_json: string; created_at: number }>(),
    ]);

  const ownerHashes = new Map<string, string>();
  const ownerControlIds = new Map<string, string>();
  await Promise.all(
    jobs.results.map(async (row) => {
      if (!ownerHashes.has(row.user_id)) {
        const fullHash = await sha256(new TextEncoder().encode(row.user_id));
        ownerHashes.set(row.user_id, fullHash.slice(0, 12));
        ownerControlIds.set(row.user_id, fullHash);
      }
    }),
  );
  const paymentEvents = events.results.map((row) => ({
    jobId: row.job_id,
    ownerHash: ownerHashes.get(row.user_id) ?? 'outside-window',
    sellerId: row.seller_id,
    provider: row.provider,
    providerEventId: row.provider_event_id,
    relatedProviderEventId: row.related_provider_event_id,
    relatedEventType: row.related_event_type,
    type: row.type,
    amountMinor: row.amount_minor,
    currency: row.currency,
    occurredAt: row.occurred_at,
    evidenceDigest: row.evidence_digest,
    source: row.source,
  }));
  return {
    operator: actorHash.slice(0, 12),
    intake: {
      acceptingNew: settings?.accepting_new !== 0,
      pausedReason: settings?.paused_reason ?? null,
      revision: settings?.revision ?? 0,
      updatedAt: settings?.updated_at ?? null,
    },
    jobs: jobs.results.map((row) => ({
      id: row.id,
      ownerHash: ownerHashes.get(row.user_id),
      status: row.status,
      paymentStatus: row.payment_status,
      sellerId: row.seller_id,
      channel: row.channel,
      inputBytes: row.input_bytes,
      inputSha256: row.input_sha256,
      outputSha256: row.output_sha256,
      attempt: row.attempt,
      deliveryRevision: row.delivery_revision,
      errorCode: row.error_code,
      quoteMinor: row.quote_minor,
      currency: row.currency,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      revision: row.revision,
      dueAt:
        row.accepted_at === null ? null : row.accepted_at + 24 * 60 * 60 * 1000,
      completedAt: row.completed_at,
      ownerControlId: ownerControlIds.get(row.user_id),
      interventions: interventions.results
        .filter((item) => item.job_id === row.id)
        .slice(0, 10)
        .map((item) => {
          let detail: { action?: string; noteDigest?: string | null } = {};
          try {
            detail = JSON.parse(item.detail_json) as typeof detail;
          } catch {
            /* old event */
          }
          return {
            action: detail.action ?? 'unknown',
            noteDigest: detail.noteDigest ?? null,
            createdAt: item.created_at,
          };
        }),
      directCosts: costs.results
        .filter((item) => item.job_id === row.id)
        .slice(0, 10)
        .map((item) => ({
          category: item.category,
          amountMinor: item.amount_minor,
          currency: item.currency,
          evidenceDigest: item.evidence_digest,
          actorHash: item.actor_hash.slice(0, 12),
          createdAt: item.created_at,
        })),
    })),
    paymentEvents,
    fees: fees.results,
    scopedIntakeControls: controls.results.map((row) => ({
      scopeType: row.scope_type,
      scopeId: row.scope_type === 'owner' ? row.scope_id : row.scope_id,
      acceptingNew: row.accepting_new !== 0,
      pausedReason: row.paused_reason,
      revision: row.revision,
      updatedAt: row.updated_at,
    })),
    directCosts: costs.results.map((item) => ({
      jobId: item.job_id,
      category: item.category,
      amountMinor: item.amount_minor,
      currency: item.currency,
      evidenceDigest: item.evidence_digest,
      actorHash: item.actor_hash.slice(0, 12),
      createdAt: item.created_at,
    })),
  };
}

export async function setCsvIntake(
  operator: string,
  input: {
    acceptingNew: boolean;
    reason?: unknown;
    revision?: unknown;
    idempotencyKey?: unknown;
  },
) {
  const actorHash = await requireCsvOperator(operator);
  if (typeof input.acceptingNew !== 'boolean')
    throw new CsvJobError(400, 'INTAKE_STATE', '受付状態が不正です。');
  const reason =
    typeof input.reason === 'string' ? input.reason.trim().slice(0, 240) : '';
  if (!input.acceptingNew && reason.length < 4)
    throw new CsvJobError(
      400,
      'PAUSE_REASON',
      '停止理由を4文字以上で入力してください。',
    );
  if (!validIdempotencyKey(input.idempotencyKey))
    throw new CsvJobError(400, 'IDEMPOTENCY', '冪等キーが不正です。');
  const db = database();
  const action = input.acceptingNew ? 'intake_resumed' : 'intake_paused';
  const requestDigest = await operatorRequestDigest(action, {
    acceptingNew: input.acceptingNew,
    reasonDigest: reason
      ? await sha256(new TextEncoder().encode(reason))
      : null,
    revision: input.revision,
  });
  const previous = await priorOperatorResult(
    db,
    actorHash,
    input.idempotencyKey,
    requestDigest,
    action,
  );
  if (previous) return previous;
  const revision = Number.isSafeInteger(input.revision)
    ? Number(input.revision)
    : 0;
  const now = Date.now();
  const response = { acceptingNew: input.acceptingNew, revision: revision + 1 };
  const statements = [
    db
      .prepare(
        `INSERT INTO csv_operator_settings
       (id, accepting_new, paused_reason, revision, updated_by, updated_at)
       SELECT 'global', ?, ?, 1, ?, ?
       WHERE COALESCE((SELECT revision FROM csv_operator_settings
         WHERE id = 'global'), 0) = ?
         AND NOT EXISTS (SELECT 1 FROM csv_operator_events
           WHERE actor_hash = ? AND idempotency_key = ?)
       ON CONFLICT(id) DO UPDATE SET accepting_new = excluded.accepting_new,
       paused_reason = excluded.paused_reason, revision = revision + 1,
       updated_by = excluded.updated_by, updated_at = excluded.updated_at
       WHERE csv_operator_settings.revision = ?`,
      )
      .bind(
        input.acceptingNew ? 1 : 0,
        input.acceptingNew ? null : reason,
        actorHash,
        now,
        revision,
        actorHash,
        input.idempotencyKey,
        revision,
      ),
    ...operatorAuditStatements(db, {
      actorHash,
      idempotencyKey: input.idempotencyKey,
      action,
      requestDigest,
      details: { reasonCode: input.acceptingNew ? null : 'operator_supplied' },
      result: response,
      createdAt: now,
      gateSql: `EXISTS (SELECT 1 FROM csv_operator_settings
        WHERE id = 'global' AND revision = ? AND updated_by = ? AND updated_at = ?)`,
      gateBinds: [revision + 1, actorHash, now],
    }),
  ];
  const changed = await db.batch(statements);
  if ((changed[0].meta.changes ?? 0) !== 1) {
    const replay = await operatorReplayAfterBatch(
      db,
      actorHash,
      input.idempotencyKey,
      requestDigest,
      action,
    );
    if (replay) return replay;
    throw new CsvJobError(
      409,
      'REVISION',
      '受付状態が別の画面で変更されました。',
    );
  }
  return response;
}

export async function setCsvScopedIntake(
  operator: string,
  input: {
    scopeType: unknown;
    scopeId: unknown;
    acceptingNew: unknown;
    reason?: unknown;
    revision?: unknown;
    idempotencyKey?: unknown;
  },
) {
  const actorHash = await requireCsvOperator(operator);
  if (input.scopeType !== 'owner' && input.scopeType !== 'seller')
    throw new CsvJobError(400, 'INTAKE_SCOPE', '受付範囲が不正です。');
  if (typeof input.acceptingNew !== 'boolean')
    throw new CsvJobError(400, 'INTAKE_STATE', '受付状態が不正です。');
  const scopeType = input.scopeType;
  const scopeId = typeof input.scopeId === 'string' ? input.scopeId.trim() : '';
  if (
    scopeType === 'owner'
      ? !/^[a-f0-9]{64}$/.test(scopeId)
      : !/^[A-Za-z0-9._:-]{1,80}$/.test(scopeId)
  )
    throw new CsvJobError(400, 'INTAKE_SCOPE', '受付範囲IDが不正です。');
  const reason =
    typeof input.reason === 'string' ? input.reason.trim().slice(0, 240) : '';
  if (!input.acceptingNew && reason.length < 4)
    throw new CsvJobError(
      400,
      'PAUSE_REASON',
      '停止理由を4文字以上で入力してください。',
    );
  if (!validIdempotencyKey(input.idempotencyKey))
    throw new CsvJobError(400, 'IDEMPOTENCY', '冪等キーが不正です。');
  const revision = Number.isSafeInteger(input.revision)
    ? Number(input.revision)
    : 0;
  if (revision < 0)
    throw new CsvJobError(400, 'REVISION', '受付設定revisionが不正です。');
  const db = database();
  const exists =
    scopeType === 'seller'
      ? await db
          .prepare(
            `SELECT 1 AS found FROM csv_jobs WHERE seller_id = ?
         UNION ALL SELECT 1 AS found FROM csv_intake_controls
          WHERE scope_type = 'seller' AND scope_id = ? LIMIT 1`,
          )
          .bind(scopeId, scopeId)
          .first()
      : await db
          .prepare(
            `SELECT 1 AS found FROM csv_intake_controls WHERE scope_type = 'owner' AND scope_id = ? LIMIT 1`,
          )
          .bind(scopeId)
          .first();
  let ownerMatches = false;
  if (scopeType === 'owner' && !exists) {
    const users = await db
      .prepare('SELECT DISTINCT user_id FROM csv_jobs')
      .all<{ user_id: string }>();
    for (const candidate of users.results) {
      if (
        (await sha256(new TextEncoder().encode(candidate.user_id))) === scopeId
      ) {
        ownerMatches = true;
        break;
      }
    }
  }
  if (!exists && !(scopeType === 'owner' && ownerMatches))
    throw new CsvJobError(
      404,
      'INTAKE_SCOPE',
      '対象の利用者または売主が見つかりません。',
    );
  const action = input.acceptingNew
    ? 'scoped_intake_resumed'
    : 'scoped_intake_paused';
  const requestDigest = await operatorRequestDigest(action, {
    scopeType,
    scopeId,
    acceptingNew: input.acceptingNew,
    reasonDigest: reason
      ? await sha256(new TextEncoder().encode(reason))
      : null,
    revision,
  });
  const previous = await priorOperatorResult(
    db,
    actorHash,
    input.idempotencyKey,
    requestDigest,
    action,
  );
  if (previous) return previous;
  const now = Date.now();
  const response = {
    scopeType,
    scopeId,
    acceptingNew: input.acceptingNew,
    revision: revision + 1,
  };
  const statements = [
    db
      .prepare(
        `INSERT INTO csv_intake_controls
       (scope_type, scope_id, accepting_new, paused_reason, revision, updated_by, updated_at)
       SELECT ?, ?, ?, ?, 1, ?, ?
       WHERE COALESCE((SELECT revision FROM csv_intake_controls
         WHERE scope_type = ? AND scope_id = ?), 0) = ?
         AND NOT EXISTS (SELECT 1 FROM csv_operator_events
           WHERE actor_hash = ? AND idempotency_key = ?)
       ON CONFLICT(scope_type, scope_id) DO UPDATE SET
         accepting_new = excluded.accepting_new, paused_reason = excluded.paused_reason,
         revision = csv_intake_controls.revision + 1,
         updated_by = excluded.updated_by, updated_at = excluded.updated_at
       WHERE csv_intake_controls.revision = ?`,
      )
      .bind(
        scopeType,
        scopeId,
        input.acceptingNew ? 1 : 0,
        input.acceptingNew ? null : reason,
        actorHash,
        now,
        scopeType,
        scopeId,
        revision,
        actorHash,
        input.idempotencyKey,
        revision,
      ),
    ...operatorAuditStatements(db, {
      actorHash,
      idempotencyKey: input.idempotencyKey,
      action,
      requestDigest,
      details: {
        scopeType,
        scopeId,
        reasonCode: input.acceptingNew ? null : 'operator_supplied',
      },
      result: response,
      createdAt: now,
      gateSql: `EXISTS (SELECT 1 FROM csv_intake_controls
        WHERE scope_type = ? AND scope_id = ? AND revision = ? AND updated_by = ? AND updated_at = ?)`,
      gateBinds: [scopeType, scopeId, revision + 1, actorHash, now],
    }),
  ];
  const committed = await db.batch(statements);
  if ((committed[0].meta.changes ?? 0) !== 1) {
    const replay = await operatorReplayAfterBatch(
      db,
      actorHash,
      input.idempotencyKey,
      requestDigest,
      action,
    );
    if (replay) return replay;
    throw new CsvJobError(
      409,
      'REVISION',
      '受付範囲が別の画面で変更されました。',
    );
  }
  return response;
}

export async function recordCsvPaymentAsOperator(
  operator: string,
  input: {
    jobId: string;
    provider: string;
    type: CsvPaymentEvent['type'];
    amountMinor: number;
    currency: string;
    occurredAt?: number;
    relatedProviderEventId?: string;
    relatedEventType?: CsvPaymentEvent['relatedEventType'];
    evidenceReference: string;
    idempotencyKey: string;
  },
) {
  const actorHash = await requireCsvOperator(operator);
  if (!/^[a-f0-9-]{36}$/i.test(input.idempotencyKey))
    throw new CsvJobError(400, 'IDEMPOTENCY', '冪等キーが不正です。');
  const evidenceDigest = await sha256(
    new TextEncoder().encode(input.evidenceReference.trim()),
  );
  const requestDigest = await operatorRequestDigest('manual_payment_recorded', {
    jobId: input.jobId,
    provider: input.provider,
    type: input.type,
    amountMinor: input.amountMinor,
    currency: input.currency,
    occurredAt: input.occurredAt,
    relatedProviderEventId: input.relatedProviderEventId,
    relatedEventType: input.relatedEventType,
    evidenceDigest,
  });
  const db = database();
  // Check the action as well as its digest before creating the manual payment
  // event. The SQL insert below repeats this fence to cover concurrent actions.
  const previous = await priorOperatorResult(
    db,
    actorHash,
    input.idempotencyKey,
    requestDigest,
    'manual_payment_recorded',
  );
  const priorOutbox = await db
    .prepare(
      `SELECT action FROM csv_operator_outbox
     WHERE actor_hash = ? AND idempotency_key = ?`,
    )
    .bind(actorHash, input.idempotencyKey)
    .first<{ action: string }>();
  if (priorOutbox && priorOutbox.action !== 'manual_payment_recorded')
    throw new CsvJobError(
      409,
      'IDEMPOTENCY',
      '同じ冪等キーを別の操作に使えません。',
    );
  if (Boolean(previous) !== Boolean(priorOutbox))
    throw new CsvJobError(
      409,
      'OPERATOR_AUDIT_INCOMPLETE',
      '以前の運営操作の監査記録が不完全です。',
    );
  const result = await recordManualCsvPayment(
    operator,
    {
      provider: input.provider,
      providerEventId: `manual:${input.idempotencyKey}`,
      relatedProviderEventId: input.relatedProviderEventId,
      relatedEventType: input.relatedEventType,
      jobId: input.jobId,
      type: input.type,
      amountMinor: input.amountMinor,
      currency: input.currency,
      occurredAt: input.occurredAt ?? Date.now(),
      evidenceReference: input.evidenceReference,
    },
    {
      action: 'manual_payment_recorded',
      idempotencyKey: input.idempotencyKey,
      requestDigest,
      details: {
        type: input.type,
        amountMinor: input.amountMinor,
        currency: input.currency,
      },
      allowStableTimestamp: input.occurredAt === undefined,
    },
  );
  return result;
}

export async function recordCsvIntervention(
  operator: string,
  input: {
    jobId: string;
    action: unknown;
    note?: unknown;
    revision?: unknown;
    idempotencyKey?: unknown;
  },
) {
  const actorHash = await requireCsvOperator(operator);
  const actions = new Set([
    'customer_contacted',
    'provider_followup',
    'quality_review',
    'payment_review',
    'privacy_review',
  ]);
  if (typeof input.action !== 'string' || !actions.has(input.action))
    throw new CsvJobError(400, 'INTERVENTION_ACTION', '介入内容が不正です。');
  const note = typeof input.note === 'string' ? input.note.trim() : '';
  if (note.length > 1000)
    throw new CsvJobError(
      400,
      'INTERVENTION_NOTE',
      '記録は1,000文字以内にしてください。',
    );
  if (!validIdempotencyKey(input.idempotencyKey))
    throw new CsvJobError(400, 'IDEMPOTENCY', '冪等キーが不正です。');
  const db = database();
  const row = await db
    .prepare('SELECT id FROM csv_jobs WHERE id = ?')
    .bind(input.jobId)
    .first<{ id: string }>();
  if (!row) throw new CsvJobError(404, 'NOT_FOUND', '受付が見つかりません。');
  const noteDigest = note ? await sha256(new TextEncoder().encode(note)) : null;
  const requestDigest = await operatorRequestDigest('intervene', {
    jobId: input.jobId,
    action: input.action,
    noteDigest,
  });
  const previous = await priorOperatorResult(
    db,
    actorHash,
    input.idempotencyKey,
    requestDigest,
    String(input.action),
  );
  if (previous) return previous;
  const now = Date.now();
  const response = { recorded: true };
  const changed = await db.batch([
    db
      .prepare(
        `INSERT INTO csv_job_events (job_id, user_id, event, detail_json, created_at)
       SELECT id, user_id, 'operator_intervention', ?, ? FROM csv_jobs WHERE id = ?
         AND NOT EXISTS (SELECT 1 FROM csv_operator_events
           WHERE actor_hash = ? AND idempotency_key = ?)`,
      )
      .bind(
        JSON.stringify({ action: input.action, actorHash, noteDigest }),
        now,
        input.jobId,
        actorHash,
        input.idempotencyKey,
      ),
    ...operatorAuditStatements(db, {
      actorHash,
      idempotencyKey: input.idempotencyKey,
      action: String(input.action),
      requestDigest,
      details: {
        noteDigest,
        reasonCode: note ? 'operator_note_redacted' : null,
      },
      result: response,
      jobId: input.jobId,
      createdAt: now,
      gateSql: `EXISTS (SELECT 1 FROM csv_job_events WHERE job_id = ?
        AND event = 'operator_intervention' AND created_at = ? AND detail_json = ?)`,
      gateBinds: [
        input.jobId,
        now,
        JSON.stringify({ action: input.action, actorHash, noteDigest }),
      ],
    }),
  ]);
  if ((changed[0].meta.changes ?? 0) !== 1) {
    const replay = await operatorReplayAfterBatch(
      db,
      actorHash,
      input.idempotencyKey,
      requestDigest,
      String(input.action),
    );
    if (replay) return replay;
    throw new CsvJobError(404, 'NOT_FOUND', '受付が見つかりません。');
  }
  return response;
}

export async function recordCsvDirectCost(
  operator: string,
  input: {
    jobId: string;
    category: unknown;
    amountMinor: unknown;
    currency: unknown;
    evidenceReference: unknown;
    idempotencyKey: unknown;
  },
) {
  const actorHash = await requireCsvOperator(operator);
  if (!validIdempotencyKey(input.idempotencyKey))
    throw new CsvJobError(400, 'IDEMPOTENCY', '冪等キーが不正です。');
  const categories = new Set([
    'manual_labor',
    'compute',
    'storage',
    'provider_fee',
    'support',
    'other',
  ]);
  if (typeof input.category !== 'string' || !categories.has(input.category))
    throw new CsvJobError(400, 'COST_CATEGORY', '直接費の種類が不正です。');
  if (
    !Number.isSafeInteger(input.amountMinor) ||
    Number(input.amountMinor) <= 0 ||
    Number(input.amountMinor) > 100_000_000
  )
    throw new CsvJobError(
      400,
      'COST_AMOUNT',
      '直接費は正の整数の最小通貨単位で入力してください。',
    );
  if (
    typeof input.currency !== 'string' ||
    !/^[A-Za-z]{3}$/.test(input.currency)
  )
    throw new CsvJobError(400, 'COST_CURRENCY', '通貨コードが不正です。');
  if (
    typeof input.evidenceReference !== 'string' ||
    input.evidenceReference.trim().length < 4 ||
    input.evidenceReference.length > 1000
  )
    throw new CsvJobError(
      400,
      'COST_EVIDENCE',
      '照合根拠を4〜1,000文字で入力してください。',
    );
  const db = database();
  const job = await db
    .prepare('SELECT id, user_id, seller_id FROM csv_jobs WHERE id = ?')
    .bind(input.jobId)
    .first<{ id: string; user_id: string; seller_id: string }>();
  if (!job) throw new CsvJobError(404, 'NOT_FOUND', '受付が見つかりません。');
  const currency = input.currency.toUpperCase();
  const evidenceDigest = await sha256(
    new TextEncoder().encode(input.evidenceReference.trim()),
  );
  const requestDigest = await operatorRequestDigest('direct_cost_recorded', {
    jobId: job.id,
    category: input.category,
    amountMinor: input.amountMinor,
    currency,
    evidenceDigest,
  });
  const previous = await priorOperatorResult(
    db,
    actorHash,
    input.idempotencyKey,
    requestDigest,
    'direct_cost_recorded',
  );
  if (previous) return previous;
  const id = crypto.randomUUID();
  const now = Date.now();
  const response = {
    recorded: true,
    jobId: job.id,
    category: input.category,
    amountMinor: Number(input.amountMinor),
    currency,
  };
  const results = await db.batch([
    db
      .prepare(
        `INSERT INTO csv_job_costs
       (id, job_id, user_id, seller_id, category, amount_minor, currency,
        evidence_digest, actor_hash, idempotency_key, created_at)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
       WHERE NOT EXISTS (SELECT 1 FROM csv_operator_events WHERE actor_hash = ? AND idempotency_key = ?)
       ON CONFLICT(actor_hash, idempotency_key) DO NOTHING`,
      )
      .bind(
        id,
        job.id,
        job.user_id,
        job.seller_id,
        input.category,
        Number(input.amountMinor),
        currency,
        evidenceDigest,
        actorHash,
        input.idempotencyKey,
        now,
        actorHash,
        input.idempotencyKey,
      ),
    ...operatorAuditStatements(db, {
      actorHash,
      idempotencyKey: input.idempotencyKey,
      action: 'direct_cost_recorded',
      requestDigest,
      details: {
        category: input.category,
        amountMinor: Number(input.amountMinor),
        currency,
        evidenceDigest,
      },
      result: response,
      jobId: job.id,
      createdAt: now,
      gateSql: `EXISTS (SELECT 1 FROM csv_job_costs WHERE actor_hash = ? AND idempotency_key = ? AND id = ?)`,
      gateBinds: [actorHash, input.idempotencyKey, id],
    }),
  ]);
  if ((results[0].meta.changes ?? 0) !== 1) {
    const replay = await operatorReplayAfterBatch(
      db,
      actorHash,
      input.idempotencyKey,
      requestDigest,
      'direct_cost_recorded',
    );
    if (replay) return replay;
    throw new CsvJobError(409, 'IDEMPOTENCY', '直接費記録が競合しました。');
  }
  return response;
}

export async function retryCsvJobAsOperator(
  operator: string,
  input: { jobId: string; revision: number; idempotencyKey?: unknown },
) {
  const actorHash = await requireCsvOperator(operator);
  if (!validIdempotencyKey(input.idempotencyKey))
    throw new CsvJobError(400, 'IDEMPOTENCY', '冪等キーが不正です。');
  const db = database();
  const action = 'operator_retry_queued';
  const requestDigest = await operatorRequestDigest(action, {
    jobId: input.jobId,
    revision: input.revision,
  });
  const previous = await priorOperatorResult(
    db,
    actorHash,
    input.idempotencyKey,
    requestDigest,
    action,
  );
  if (previous) return previous;
  const row = await db
    .prepare('SELECT user_id, attempt FROM csv_jobs WHERE id = ?')
    .bind(input.jobId)
    .first<{ user_id: string; attempt: number }>();
  if (!row) throw new CsvJobError(404, 'NOT_FOUND', '受付が見つかりません。');
  const result = {
    queued: true,
    jobId: input.jobId,
    attempt: row.attempt,
  };
  await retryCsvJob(row.user_id, input.jobId, input.revision, {
    actorHash,
    idempotencyKey: input.idempotencyKey,
    requestDigest,
    action,
    details: { attempt: row.attempt },
    result,
  });
  return result;
}

export async function reconcileCsvMonth(
  operator: string,
  monthInput: unknown,
  idempotencyInput: unknown,
) {
  const actorHash = await requireCsvOperator(operator);
  if (!validIdempotencyKey(idempotencyInput))
    throw new CsvJobError(400, 'IDEMPOTENCY', '冪等キーが不正です。');
  const idempotencyKey = idempotencyInput;
  const monthJst = normalizeMonth(monthInput);
  const db = database();
  const action = 'monthly_fee_reconciled';
  const requestDigest = await operatorRequestDigest(action, { monthJst });
  const previous = await priorOperatorResult(
    db,
    actorHash,
    idempotencyKey,
    requestDigest,
    action,
  );
  if (previous) return previous;
  const owners = await db
    .prepare('SELECT DISTINCT user_id FROM csv_jobs ORDER BY user_id')
    .all<{ user_id: string }>();
  const decisions = [];
  const statements: D1PreparedStatement[] = [];
  for (const owner of owners.results) {
    let account = await db
      .prepare(
        `SELECT billing_account_id, contract_id, policy_version, status, cancel_at_month
         FROM csv_billing_accounts WHERE user_id = ?`,
      )
      .bind(owner.user_id)
      .first<{
        billing_account_id: string;
        contract_id: string;
        policy_version: string;
        status: string;
        cancel_at_month: string | null;
      }>();
    if (!account) {
      const created = Date.now();
      const billingAccountId =
        'csv_' + (await sha256(new TextEncoder().encode(owner.user_id)));
      account = {
        billing_account_id: billingAccountId,
        contract_id: CONTRACT_ID,
        policy_version: CSV_FEE_POLICY_VERSION,
        status: 'active',
        cancel_at_month: null,
      };
      statements.push(
        db
          .prepare(
            `INSERT INTO csv_billing_accounts
           (user_id, billing_account_id, contract_id, policy_version, status,
            created_at, updated_at)
           SELECT ?, ?, ?, ?, 'active', ?, ? WHERE NOT EXISTS
             (SELECT 1 FROM csv_operator_events WHERE actor_hash = ? AND idempotency_key = ?)
           ON CONFLICT(user_id) DO NOTHING`,
          )
          .bind(
            owner.user_id,
            billingAccountId,
            CONTRACT_ID,
            CSV_FEE_POLICY_VERSION,
            created,
            created,
            actorHash,
            idempotencyKey,
          ),
      );
    }
    if (!account)
      throw new CsvJobError(
        500,
        'BILLING_ACCOUNT',
        '料金判定単位を保存できませんでした。',
      );
    const sellers = await db
      .prepare(
        'SELECT DISTINCT seller_id FROM csv_jobs WHERE user_id = ? ORDER BY seller_id',
      )
      .bind(owner.user_id)
      .all<{ seller_id: string }>();
    const rows = await db
      .prepare(
        `SELECT provider, provider_event_id, related_provider_event_id, related_event_type, job_id,
         type, amount_minor, currency, occurred_at, evidence_digest, source
         FROM csv_payment_events WHERE user_id = ?
         ORDER BY occurred_at ASC, provider ASC, provider_event_id ASC`,
      )
      .bind(owner.user_id)
      .all<{
        provider: string;
        provider_event_id: string;
        related_provider_event_id: string | null;
        related_event_type: 'buyer_paid' | 'paid_to_owner' | null;
        job_id: string;
        type: string;
        amount_minor: number;
        currency: string;
        occurred_at: number;
        evidence_digest: string;
        source: 'provider' | 'manual_verified';
      }>();
    const events: CsvPaymentEvent[] = rows.results.map((row) => ({
      provider: row.provider,
      providerEventId: row.provider_event_id,
      relatedProviderEventId: row.related_provider_event_id ?? undefined,
      relatedEventType: row.related_event_type ?? undefined,
      jobId: row.job_id,
      type: row.type as CsvPaymentEvent['type'],
      amountMinor: row.amount_minor,
      currency: row.currency,
      occurredAt: row.occurred_at,
      evidenceDigest: row.evidence_digest,
      source: row.source,
    }));
    const net = csvMonthlyNetForMonth(events, monthJst);
    const evidenceDigest = await sha256(
      new TextEncoder().encode([...net.evidenceIds].sort().join('\n')),
    );
    const sellerIds = sellers.results.map((seller) => seller.seller_id);
    const sellerId =
      sellerIds.length > 1
        ? 'multi-seller'
        : (sellerIds[0] ?? 'platform-owner');
    const decision =
      account.cancel_at_month && monthJst >= account.cancel_at_month
        ? {
            policyVersion: account.policy_version,
            monthJst,
            verifiedNetUsdMinor: null,
            feeDueUsdMinor: null,
            status: 'canceled',
            reason: 'canceled_for_month',
          }
        : (account.status !== 'active' &&
              account.status !== 'cancel_pending') ||
            account.contract_id !== CONTRACT_ID ||
            account.policy_version !== CSV_FEE_POLICY_VERSION
          ? {
              policyVersion: account.policy_version,
              monthJst,
              verifiedNetUsdMinor: null,
              feeDueUsdMinor: null,
              status: 'policy_review',
              reason: 'billing_contract_not_active',
            }
          : net.noProviderEvidence
            ? {
                policyVersion: CSV_FEE_POLICY_VERSION,
                monthJst,
                verifiedNetUsdMinor: null,
                feeDueUsdMinor: null,
                status: 'evidence_review',
                reason: 'provider_payout_evidence_missing',
              }
            : net.fxRequired ||
                net.needsReview ||
                net.verifiedNetUsdMinor === null
              ? {
                  policyVersion: CSV_FEE_POLICY_VERSION,
                  monthJst,
                  verifiedNetUsdMinor: null,
                  feeDueUsdMinor: null,
                  status: net.fxRequired ? 'fx_review' : 'refund_review',
                  reason: net.fxRequired
                    ? 'fx_rate_missing'
                    : 'payout_adjustment_evidence_incomplete',
                }
              : csvFeeDecision({
                  monthJst,
                  verifiedNetUsdMinor: net.verifiedNetUsdMinor,
                  evidenceSource: 'provider',
                  providerEvidence: evidenceDigest,
                });
    const now = Date.now();
    const id = crypto.randomUUID();
    statements.push(
      db
        .prepare(
          `INSERT INTO csv_monthly_fee_decisions
         (id, seller_id, billing_account_id, contract_id, policy_version,
          month_jst, verified_net_usd_minor, fee_due_usd_minor, status, reason,
          evidence_digest, decision_json, created_at, updated_at)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
         WHERE EXISTS (SELECT 1 FROM csv_billing_accounts WHERE user_id = ?
             AND billing_account_id = ?)
           AND NOT EXISTS (SELECT 1 FROM csv_operator_events
             WHERE actor_hash = ? AND idempotency_key = ?)
         ON CONFLICT(billing_account_id, month_jst)
         DO UPDATE SET seller_id = excluded.seller_id,
          contract_id = excluded.contract_id, policy_version = excluded.policy_version,
          verified_net_usd_minor = excluded.verified_net_usd_minor,
          fee_due_usd_minor = excluded.fee_due_usd_minor, status = excluded.status,
          reason = excluded.reason, evidence_digest = excluded.evidence_digest,
          decision_json = excluded.decision_json, updated_at = excluded.updated_at`,
        )
        .bind(
          id,
          sellerId,
          account.billing_account_id,
          account.contract_id,
          account.policy_version,
          monthJst,
          decision.verifiedNetUsdMinor,
          decision.feeDueUsdMinor,
          decision.status,
          decision.reason,
          evidenceDigest,
          JSON.stringify(decision),
          now,
          now,
          owner.user_id,
          account.billing_account_id,
          actorHash,
          idempotencyKey,
        ),
    );
    decisions.push({
      sellerId,
      sellerIds,
      billingAccountId: account.billing_account_id,
      ...decision,
      evidenceDigest,
    });
  }
  const response = { monthJst, decisions };
  const now = Date.now();
  statements.push(
    ...operatorAuditStatements(db, {
      actorHash,
      idempotencyKey,
      action,
      requestDigest,
      details: { monthJst, accounts: decisions.length },
      result: response,
      createdAt: now,
      gateSql: '1 = 1',
    }),
  );
  const committed = await db.batch(statements);
  if (committed.at(-2)?.meta.changes !== 1) {
    const replay = await operatorReplayAfterBatch(
      db,
      actorHash,
      idempotencyKey,
      requestDigest,
      action,
    );
    if (replay) return replay;
    throw new CsvJobError(
      500,
      'FEE_RECONCILE',
      '月額判定を保存できませんでした。',
    );
  }
  return response;
}

export async function csvOperationsExport(operator: string) {
  const actorHash = await requireCsvOperator(operator);
  const db = database();
  const [
    jobs,
    paymentEvents,
    monthlyFees,
    operatorEvents,
    directCosts,
    intakeControls,
    billingAccounts,
    billingEvents,
    operatorOutbox,
  ] = await Promise.all([
    db
      .prepare(
        `SELECT id, user_id, status, payment_status, seller_id, channel,
       input_bytes, input_sha256, output_sha256, attempt, delivery_revision,
       error_code, quote_minor, currency, expires_at, created_at, updated_at,
       revision
       FROM csv_jobs ORDER BY created_at ASC`,
      )
      .all<Record<string, unknown> & { user_id: string }>(),
    db
      .prepare(
        `SELECT job_id, user_id, seller_id, provider, provider_event_id,
       related_provider_event_id, related_event_type, type, amount_minor, currency, occurred_at,
       evidence_digest, source
       FROM csv_payment_events ORDER BY occurred_at ASC`,
      )
      .all<Record<string, unknown> & { user_id: string }>(),
    db
      .prepare(
        `SELECT seller_id, billing_account_id, contract_id, policy_version,
       month_jst, verified_net_usd_minor, fee_due_usd_minor, status, reason,
       evidence_digest, decision_json, created_at, updated_at
       FROM csv_monthly_fee_decisions ORDER BY month_jst ASC`,
      )
      .all(),
    db
      .prepare(
        `SELECT actor_hash, action, job_id, detail_json, created_at, idempotency_key, request_digest
       FROM csv_operator_events ORDER BY created_at ASC`,
      )
      .all(),
    db
      .prepare(
        `SELECT job_id, user_id, seller_id, category, amount_minor, currency,
       evidence_digest, actor_hash, idempotency_key, created_at
       FROM csv_job_costs ORDER BY created_at ASC`,
      )
      .all<Record<string, unknown> & { user_id: string }>(),
    db
      .prepare(
        `SELECT scope_type, scope_id, accepting_new, paused_reason, revision, updated_by, updated_at
       FROM csv_intake_controls ORDER BY scope_type, scope_id`,
      )
      .all(),
    db
      .prepare(
        `SELECT billing_account_id, contract_id, policy_version, status, cancel_at_month,
       created_at, updated_at FROM csv_billing_accounts ORDER BY billing_account_id ASC`,
      )
      .all(),
    db
      .prepare(
        `SELECT billing_account_id, action, request_digest, idempotency_key, detail_json, created_at
       FROM csv_billing_account_events ORDER BY created_at ASC`,
      )
      .all(),
    db
      .prepare(
        `SELECT actor_hash, idempotency_key, action, payload_json, created_at, delivered_at
       FROM csv_operator_outbox ORDER BY created_at ASC`,
      )
      .all(),
  ]);
  const userHashes = new Map<string, string>();
  const hashOwner = async (user: string) => {
    let value = userHashes.get(user);
    if (!value) {
      value = await sha256(new TextEncoder().encode(user));
      userHashes.set(user, value);
    }
    return value;
  };
  return {
    format: 'csv-operations-export/2',
    exportedAt: new Date().toISOString(),
    exportedBy: actorHash,
    jobs: await Promise.all(
      jobs.results.map(async ({ user_id, ...job }) => ({
        ...job,
        ownerHash: await hashOwner(user_id),
      })),
    ),
    payments: await Promise.all(
      paymentEvents.results.map(async ({ user_id, ...event }) => ({
        ...event,
        ownerHash: await hashOwner(user_id),
      })),
    ),
    monthlyFees: monthlyFees.results,
    operatorEvents: operatorEvents.results,
    directCosts: await Promise.all(
      directCosts.results.map(async ({ user_id, ...cost }) => ({
        ...cost,
        ownerHash: await hashOwner(user_id),
      })),
    ),
    scopedIntakeControls: intakeControls.results,
    billingAccounts: billingAccounts.results,
    billingAccountEvents: billingEvents.results,
    operatorOutbox: operatorOutbox.results,
  };
}

function nextJstMonth(month: string) {
  const [year, value] = month.split('-').map(Number);
  return new Date(Date.UTC(year, value, 1)).toISOString().slice(0, 7);
}

export async function csvBillingAccountSnapshot(user: string) {
  if (!user)
    throw new CsvJobError(401, 'UNAUTHORIZED', 'サインインが必要です。');
  const account = await database()
    .prepare(
      `SELECT billing_account_id, contract_id, policy_version, status,
       cancel_at_month, created_at, updated_at FROM csv_billing_accounts WHERE user_id = ?`,
    )
    .bind(user)
    .first<{
      billing_account_id: string;
      contract_id: string;
      policy_version: string;
      status: string;
      cancel_at_month: string | null;
      created_at: number;
      updated_at: number;
    }>();
  if (!account)
    return {
      status: 'not_configured',
      cancelAtMonth: null,
      monthlyFeeEnabled: false,
    };
  return {
    status:
      account.cancel_at_month &&
      csvJstMonth(Date.now()) >= account.cancel_at_month
        ? 'canceled'
        : account.status,
    cancelAtMonth: account.cancel_at_month,
    monthlyFeeEnabled: false,
    contractId: account.contract_id,
    policyVersion: account.policy_version,
    updatedAt: account.updated_at,
  };
}

export async function cancelCsvBillingAccount(
  user: string,
  idempotencyInput: unknown,
) {
  if (!user)
    throw new CsvJobError(401, 'UNAUTHORIZED', 'サインインが必要です。');
  if (!validIdempotencyKey(idempotencyInput))
    throw new CsvJobError(400, 'IDEMPOTENCY', '冪等キーが不正です。');
  const db = database();
  const action = 'billing_cancel_next_month';
  const requestDigest = await operatorRequestDigest(action, { action });
  const prior = await db
    .prepare(
      `SELECT request_digest, detail_json FROM csv_billing_account_events
     WHERE user_id = ? AND idempotency_key = ?`,
    )
    .bind(user, idempotencyInput)
    .first<{ request_digest: string; detail_json: string }>();
  if (prior) {
    if (prior.request_digest !== requestDigest)
      throw new CsvJobError(
        409,
        'IDEMPOTENCY',
        '同じ冪等キーを別の操作には使えません。',
      );
    try {
      return JSON.parse(prior.detail_json) as unknown;
    } catch {
      throw new CsvJobError(
        409,
        'IDEMPOTENCY',
        '以前の解約操作を読み取れません。',
      );
    }
  }
  const billingAccountId = `csv_${await sha256(new TextEncoder().encode(user))}`;
  const currentMonth = csvJstMonth(Date.now());
  const requestedMonth = nextJstMonth(currentMonth);
  const current = await db
    .prepare(
      'SELECT status, cancel_at_month FROM csv_billing_accounts WHERE user_id = ?',
    )
    .bind(user)
    .first<{ status: string; cancel_at_month: string | null }>();
  const effectiveMonth = current?.cancel_at_month ?? requestedMonth;
  const canceled =
    current?.status === 'canceled' ||
    (current?.cancel_at_month !== null &&
      current?.cancel_at_month !== undefined &&
      currentMonth >= current.cancel_at_month);
  const response = {
    status: canceled ? 'canceled' : 'cancel_pending',
    cancelAtMonth: current?.cancel_at_month ?? requestedMonth,
    existingJobsContinue: true,
    monthlyFeeEnabled: false,
  };
  const now = Date.now();
  const eventId = crypto.randomUUID();
  const committed = await db.batch([
    db
      .prepare(
        `INSERT INTO csv_billing_accounts
       (user_id, billing_account_id, contract_id, policy_version, status,
        cancel_at_month, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'cancel_pending', ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         status = CASE WHEN csv_billing_accounts.status = 'canceled' THEN 'canceled' ELSE 'cancel_pending' END,
         cancel_at_month = COALESCE(csv_billing_accounts.cancel_at_month, excluded.cancel_at_month),
         updated_at = excluded.updated_at
       WHERE csv_billing_accounts.status IN ('active', 'cancel_pending', 'canceled')`,
      )
      .bind(
        user,
        billingAccountId,
        CONTRACT_ID,
        CSV_FEE_POLICY_VERSION,
        effectiveMonth,
        now,
        now,
      ),
    db
      .prepare(
        `INSERT INTO csv_billing_account_events
       (id, user_id, billing_account_id, action, request_digest, idempotency_key, detail_json, created_at)
       SELECT ?, ?, billing_account_id, ?, ?, ?, ?, ? FROM csv_billing_accounts
       WHERE user_id = ? AND cancel_at_month = ? AND status IN ('cancel_pending', 'canceled')
       ON CONFLICT(billing_account_id, idempotency_key) DO NOTHING`,
      )
      .bind(
        eventId,
        user,
        action,
        requestDigest,
        idempotencyInput,
        JSON.stringify(response),
        now,
        user,
        effectiveMonth,
      ),
  ]);
  if ((committed[1].meta.changes ?? 0) === 1) return response;
  const replay = await db
    .prepare(
      `SELECT request_digest, detail_json FROM csv_billing_account_events
     WHERE user_id = ? AND idempotency_key = ?`,
    )
    .bind(user, idempotencyInput)
    .first<{ request_digest: string; detail_json: string }>();
  if (replay) {
    if (replay.request_digest !== requestDigest)
      throw new CsvJobError(
        409,
        'IDEMPOTENCY',
        '同じ冪等キーを別の操作には使えません。',
      );
    return JSON.parse(replay.detail_json) as unknown;
  }
  const final = await db
    .prepare(
      'SELECT status, cancel_at_month FROM csv_billing_accounts WHERE user_id = ?',
    )
    .bind(user)
    .first<{ status: string; cancel_at_month: string | null }>();
  if (final?.cancel_at_month)
    return {
      ...response,
      status: final.status,
      cancelAtMonth: final.cancel_at_month,
    };
  throw new CsvJobError(
    409,
    'BILLING_CANCEL',
    '翌月の停止を保存できませんでした。',
  );
}

export async function csvUserDataExport(user: string) {
  if (!user)
    throw new CsvJobError(401, 'UNAUTHORIZED', 'サインインが必要です。');
  const db = database();
  const [account, jobs, payments] = await Promise.all([
    db
      .prepare(
        `SELECT billing_account_id, contract_id, policy_version, status, cancel_at_month,
       created_at, updated_at FROM csv_billing_accounts WHERE user_id = ?`,
      )
      .bind(user)
      .first<Record<string, unknown> & { billing_account_id: string }>(),
    db
      .prepare(
        `SELECT id, status, payment_status, payment_method, payment_reference, product_version,
       seller_id, channel, terms_version, input_name, input_bytes, input_sha256, input_encoding,
       specification_json, quote_minor, currency, output_sha256, validation_json, attempt,
       revision, delivery_revision, error_code, expires_at, created_at, updated_at,
       accepted_at, completed_at, approved_at, revision_requested_at, revision_reason,
       canceled_at, cancellation_reason, files_purged_at, input_key, result_key, safe_result_key,
       report_json_key, report_html_key FROM csv_jobs WHERE user_id = ? ORDER BY created_at ASC`,
      )
      .bind(user)
      .all<
        Record<string, unknown> & {
          id: string;
          files_purged_at: number | null;
          result_key: string | null;
          safe_result_key: string | null;
          report_json_key: string | null;
          report_html_key: string | null;
          input_key: string | null;
        }
      >(),
    db
      .prepare(
        `SELECT provider, provider_event_id, related_provider_event_id, related_event_type,
       job_id, seller_id, type, amount_minor, currency, occurred_at, evidence_digest,
       source, created_at FROM csv_payment_events WHERE user_id = ? ORDER BY occurred_at ASC`,
      )
      .bind(user)
      .all(),
  ]);
  const accountId = account?.billing_account_id;
  const [
    jobEvents,
    feeDecisions,
    accountEvents,
    jobCosts,
    deliveryRevisions,
    deliveryLinks,
  ] = await Promise.all([
    db
      .prepare(
        `SELECT job_id, event, detail_json, created_at FROM csv_job_events
       WHERE user_id = ? ORDER BY created_at ASC`,
      )
      .bind(user)
      .all(),
    accountId
      ? db
          .prepare(
            `SELECT seller_id, billing_account_id, contract_id, policy_version, month_jst,
           verified_net_usd_minor, fee_due_usd_minor, status, reason, evidence_digest,
           decision_json, created_at, updated_at FROM csv_monthly_fee_decisions
           WHERE billing_account_id = ? ORDER BY month_jst ASC`,
          )
          .bind(accountId)
          .all()
      : Promise.resolve({ results: [] }),
    db
      .prepare(
        `SELECT action, request_digest, idempotency_key, detail_json, created_at
       FROM csv_billing_account_events WHERE user_id = ? ORDER BY created_at ASC`,
      )
      .bind(user)
      .all(),
    db
      .prepare(
        `SELECT job_id, category, amount_minor, currency, evidence_digest, created_at
       FROM csv_job_costs WHERE user_id = ? ORDER BY created_at ASC`,
      )
      .bind(user)
      .all(),
    db
      .prepare(
        `SELECT job_id, revision_number, specification_json, output_sha256,
       validation_json, status, customer_reason, delivered_at, resolved_at
       FROM csv_delivery_revisions WHERE user_id = ? ORDER BY job_id ASC, revision_number ASC`,
      )
      .bind(user)
      .all(),
    db
      .prepare(
        `SELECT id, job_id, expires_at, created_at, revoked_at, last_accessed_at
       FROM csv_delivery_links WHERE user_id = ? ORDER BY created_at ASC`,
      )
      .bind(user)
      .all(),
  ]);
  const exportJobs = jobs.results.map(
    ({
      input_key,
      result_key,
      safe_result_key,
      report_json_key,
      report_html_key,
      ...job
    }) => ({
      ...job,
      downloads: job.files_purged_at
        ? []
        : [
            ...(input_key
              ? [
                  {
                    kind: 'input',
                    url: `/api/csv-jobs/${encodeURIComponent(job.id)}/artifact/input`,
                  },
                ]
              : []),
            ...(result_key
              ? [
                  {
                    kind: 'result',
                    url: `/api/csv-jobs/${encodeURIComponent(job.id)}/artifact/result`,
                  },
                ]
              : []),
            ...(safe_result_key
              ? [
                  {
                    kind: 'spreadsheet-safe',
                    url: `/api/csv-jobs/${encodeURIComponent(job.id)}/artifact/spreadsheet-safe`,
                  },
                ]
              : []),
            ...(report_json_key
              ? [
                  {
                    kind: 'report-json',
                    url: `/api/csv-jobs/${encodeURIComponent(job.id)}/artifact/report-json`,
                  },
                ]
              : []),
            ...(report_html_key
              ? [
                  {
                    kind: 'report-html',
                    url: `/api/csv-jobs/${encodeURIComponent(job.id)}/artifact/report-html`,
                  },
                ]
              : []),
          ],
    }),
  );
  return {
    format: 'csv-user-data-export/2',
    exportedAt: new Date().toISOString(),
    files:
      'ダウンロードURLはこのアカウントで認証されたブラウザから開いてください。保管期限切れ後のファイル内容は含みません。共有用bearerリンクのURL・token hashは安全のため含めず、リンクの状態と期限のみを含みます。',
    billingAccount: account ?? null,
    jobs: exportJobs,
    paymentEvents: payments.results,
    jobEvents: jobEvents.results,
    monthlyFeeDecisions: feeDecisions.results,
    billingAccountEvents: accountEvents.results,
    directCosts: jobCosts.results,
    deliveryRevisions: deliveryRevisions.results,
    deliveryLinks: deliveryLinks.results,
  };
}
