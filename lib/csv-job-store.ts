import { env, waitUntil } from 'cloudflare:workers';
import {
  CsvError,
  csvReportHtml,
  csvSpecification,
  decodeCsv,
  parseCsv,
  sha256,
  transformCsv,
  type CsvSpecification,
} from './csv-transform';
import {
  csvBuyerPaymentQuoteMismatch,
  csvJstMonth,
  csvPaymentEvent,
  csvPaymentProjection,
  type CsvPaymentEvent,
} from './csv-money';

const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ATTEMPTS = 3;
const LEASE_MS = 2 * 60 * 1000;

type CsvJobRow = {
  id: string;
  user_id: string;
  status: string;
  payment_status: string;
  payment_method: string | null;
  payment_reference: string | null;
  product_version: string;
  seller_id: string;
  channel: string;
  terms_version: string;
  input_name: string;
  input_key: string;
  input_bytes: number;
  input_sha256: string;
  input_encoding: string;
  specification_json: string;
  quote_minor: number;
  currency: string;
  result_key: string | null;
  safe_result_key: string | null;
  report_json_key: string | null;
  report_html_key: string | null;
  output_sha256: string | null;
  validation_json: string | null;
  attempt: number;
  revision: number;
  available_at: number;
  lease_id: string | null;
  lease_expires_at: number | null;
  delivery_revision: number;
  error_code: string | null;
  expires_at: number;
  created_at: number;
  updated_at: number;
  accepted_at: number | null;
  completed_at: number | null;
  approved_at: number | null;
  revision_requested_at: number | null;
  revision_reason: string | null;
  canceled_at: number | null;
  cancellation_reason: string | null;
  files_purged_at: number | null;
};

type CsvPaymentEventRow = {
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
};

export type CsvJobView = {
  id: string;
  status: string;
  paymentStatus: string;
  paymentMethod: string | null;
  paymentReference: string | null;
  productVersion: string;
  sellerId: string;
  channel: string;
  termsVersion: string;
  inputName: string;
  inputBytes: number;
  inputSha256: string;
  inputEncoding: string;
  specification: CsvSpecification;
  quoteMinor: number;
  currency: string;
  outputSha256: string | null;
  validation: unknown;
  attempt: number;
  revision: number;
  availableAt: number;
  leaseExpiresAt: number | null;
  deliveryRevision: number;
  errorCode: string | null;
  expiresAt: number;
  createdAt: number;
  updatedAt: number;
  acceptedAt: number | null;
  completedAt: number | null;
  approvedAt: number | null;
  revisionRequestedAt: number | null;
  revisionReason: string | null;
  canceledAt: number | null;
  cancellationReason: string | null;
  filesPurgedAt: number | null;
  artifacts: string[];
};

export class CsvJobError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function resources() {
  const bindings = env as unknown as {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    CSV_OPERATOR_ID_SHA256?: string;
  };
  if (!bindings.DB || !bindings.BUCKET)
    throw new CsvJobError(
      503,
      'STORAGE',
      'ファイル保存の準備ができていません。',
    );
  return {
    db: bindings.DB,
    bucket: bindings.BUCKET,
    operatorIdHashes: bindings.CSV_OPERATOR_ID_SHA256 ?? '',
  };
}

function view(row: CsvJobRow): CsvJobView {
  const artifacts: string[] = [];
  if (row.result_key) artifacts.push('result');
  if (row.safe_result_key) artifacts.push('spreadsheet-safe');
  if (row.report_json_key) artifacts.push('report-json');
  if (row.report_html_key) artifacts.push('report-html');
  return {
    id: row.id,
    status: row.status,
    paymentStatus: row.payment_status,
    paymentMethod: row.payment_method,
    paymentReference: row.payment_reference,
    productVersion: row.product_version,
    sellerId: row.seller_id,
    channel: row.channel,
    termsVersion: row.terms_version,
    inputName: row.input_name,
    inputBytes: row.input_bytes,
    inputSha256: row.input_sha256,
    inputEncoding: row.input_encoding,
    specification: JSON.parse(row.specification_json),
    quoteMinor: row.quote_minor,
    currency: row.currency,
    outputSha256: row.output_sha256,
    validation: row.validation_json ? JSON.parse(row.validation_json) : null,
    attempt: row.attempt,
    revision: row.revision,
    availableAt: row.available_at,
    leaseExpiresAt: row.lease_expires_at,
    deliveryRevision: row.delivery_revision,
    errorCode: row.error_code,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    acceptedAt: row.accepted_at,
    completedAt: row.completed_at,
    approvedAt: row.approved_at,
    revisionRequestedAt: row.revision_requested_at,
    revisionReason: row.revision_reason,
    canceledAt: row.canceled_at,
    cancellationReason: row.cancellation_reason,
    filesPurgedAt: row.files_purged_at,
    artifacts,
  };
}

function background(promise: Promise<unknown>) {
  const guarded = promise.catch((error) =>
    console.error('csv-background', error),
  );
  try {
    waitUntil(guarded);
  } catch (error) {
    // The D1 acceptance is durable. If this host cannot register waitUntil,
    // leave the job claimable for the next authenticated poll instead of
    // pretending an untracked fire-and-forget run is reliable.
    console.error('csv-wait-until-unavailable', error);
  }
}

async function owned(db: D1Database, user: string, id: string) {
  const row = await db
    .prepare('SELECT * FROM csv_jobs WHERE id = ? AND user_id = ?')
    .bind(id, user)
    .first<CsvJobRow>();
  if (!row) throw new CsvJobError(404, 'NOT_FOUND', '受付が見つかりません。');
  return row;
}

async function event(
  db: D1Database,
  row: CsvJobRow,
  name: string,
  detail: unknown = {},
) {
  await db
    .prepare(
      'INSERT INTO csv_job_events (job_id, user_id, event, detail_json, created_at) VALUES (?, ?, ?, ?, ?)',
    )
    .bind(row.id, row.user_id, name, JSON.stringify(detail), Date.now())
    .run();
}

function paymentEventFromRow(row: CsvPaymentEventRow): CsvPaymentEvent {
  return csvPaymentEvent({
    provider: row.provider,
    providerEventId: row.provider_event_id,
    relatedProviderEventId: row.related_provider_event_id ?? undefined,
    relatedEventType: row.related_event_type ?? undefined,
    jobId: row.job_id,
    type: row.type,
    amountMinor: row.amount_minor,
    currency: row.currency,
    occurredAt: row.occurred_at,
    evidenceDigest: row.evidence_digest,
    source: row.source,
  });
}

async function paymentEventsForJob(db: D1Database, row: CsvJobRow) {
  const result = await db
    .prepare(
      `SELECT provider, provider_event_id, related_provider_event_id, related_event_type, job_id,
       type, amount_minor, currency, occurred_at, evidence_digest, source
       FROM csv_payment_events WHERE job_id = ? AND user_id = ?
       ORDER BY occurred_at ASC, provider ASC, provider_event_id ASC`,
    )
    .bind(row.id, row.user_id)
    .all<CsvPaymentEventRow>();
  return result.results.map(paymentEventFromRow);
}

async function syncPaymentProjection(
  db: D1Database,
  row: CsvJobRow,
  bumpRevision: boolean,
) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const events = await paymentEventsForJob(db, row);
    const projection = csvPaymentProjection(events);
    const hasPaymentSignal = events.some((event) =>
      [
        'buyer_paid',
        'paid_to_owner',
        'payout_available',
        'payout_started',
      ].includes(event.type),
    );
    const quoteMismatch = hasPaymentSignal
      ? csvBuyerPaymentQuoteMismatch(events, row.quote_minor, row.currency)
      : null;
    const paymentStatus = quoteMismatch
      ? 'payment_mismatch'
      : projection.status;
    const latest = events.at(-1);
    const same =
      row.payment_status === paymentStatus &&
      row.payment_method === (latest?.provider ?? null) &&
      row.payment_reference === (latest?.evidenceDigest ?? null);
    if (!bumpRevision && same) return row;
    const updated = await db
      .prepare(
        `UPDATE csv_jobs SET payment_status = ?, payment_method = ?,
         payment_reference = ?, revision = revision + ?, updated_at = ?
         WHERE id = ? AND user_id = ?
         AND (SELECT COUNT(*) FROM csv_payment_events WHERE job_id = ? AND user_id = ?) = ?`,
      )
      .bind(
        paymentStatus,
        latest?.provider ?? null,
        latest?.evidenceDigest ?? null,
        bumpRevision || !same ? 1 : 0,
        Date.now(),
        row.id,
        row.user_id,
        row.id,
        row.user_id,
        events.length,
      )
      .run();
    if ((updated.meta.changes ?? 0) === 1)
      return owned(db, row.user_id, row.id);
    row = await owned(db, row.user_id, row.id);
    bumpRevision = true;
  }
  throw new CsvJobError(
    409,
    'PAYMENT_JOB_CHANGED',
    '入金台帳が同時に更新されました。もう一度お試しください。',
  );
}

function paymentReadyForJob(row: CsvJobRow, events: CsvPaymentEvent[]) {
  if (row.payment_status === 'sample') return true;
  if (csvBuyerPaymentQuoteMismatch(events, row.quote_minor, row.currency))
    return false;
  const status = csvPaymentProjection(events).status;
  return [
    'paid_by_buyer',
    'available',
    'payout_pending',
    'paid_to_owner',
    'manual_verified',
  ].includes(status);
}

export async function requireCsvOperator(user: string) {
  const { operatorIdHashes } = resources();
  const allowed = new Set(
    operatorIdHashes
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter((value) => /^[a-f0-9]{64}$/.test(value)),
  );
  if (!allowed.size)
    throw new CsvJobError(
      503,
      'OPERATOR_NOT_CONFIGURED',
      '運営者の認証設定がありません。',
    );
  const actorHash = await sha256(new TextEncoder().encode(user));
  if (!allowed.has(actorHash))
    throw new CsvJobError(403, 'OPERATOR_REQUIRED', '運営者のみ操作できます。');
  return actorHash;
}

async function persistPaymentEvent(
  input: CsvPaymentEvent,
  actorHash: string,
  operatorAudit?: {
    action: string;
    idempotencyKey: string;
    requestDigest: string;
    details: unknown;
    allowStableTimestamp?: boolean;
  },
) {
  const { db } = resources();
  let value: CsvPaymentEvent;
  try {
    value = csvPaymentEvent(input);
  } catch (error) {
    throw new CsvJobError(
      400,
      error instanceof Error ? error.message : 'PAYMENT_EVENT',
      '入金イベントの形式を確認してください。',
    );
  }
  const row = await db
    .prepare('SELECT * FROM csv_jobs WHERE id = ?')
    .bind(value.jobId)
    .first<CsvJobRow>();
  if (!row) throw new CsvJobError(404, 'NOT_FOUND', '受付が見つかりません。');
  const duplicateRow = await db
    .prepare(
      `SELECT provider, provider_event_id, related_provider_event_id, related_event_type,
     job_id, type, amount_minor, currency, occurred_at, evidence_digest, source
     FROM csv_payment_events WHERE provider = ? AND provider_event_id = ?`,
    )
    .bind(value.provider, value.providerEventId)
    .first<CsvPaymentEventRow>();
  if (duplicateRow) {
    const priorValue = paymentEventFromRow(duplicateRow);
    const comparableValue = operatorAudit?.allowStableTimestamp
      ? { ...value, occurredAt: priorValue.occurredAt }
      : value;
    if (JSON.stringify(priorValue) !== JSON.stringify(comparableValue))
      throw new CsvJobError(
        409,
        'PAYMENT_EVENT_CONFLICT',
        '同じProviderイベントIDに異なる内容があります。',
      );
    if (operatorAudit) {
      const [audit, outbox] = await Promise.all([
        db
          .prepare(
            `SELECT action, request_digest FROM csv_operator_events
           WHERE actor_hash = ? AND idempotency_key = ?`,
          )
          .bind(actorHash, operatorAudit.idempotencyKey)
          .first<{ action: string; request_digest: string | null }>(),
        db
          .prepare(
            `SELECT action FROM csv_operator_outbox
           WHERE actor_hash = ? AND idempotency_key = ?`,
          )
          .bind(actorHash, operatorAudit.idempotencyKey)
          .first<{ action: string }>(),
      ]);
      if (
        audit?.action !== operatorAudit.action ||
        audit.request_digest !== operatorAudit.requestDigest ||
        outbox?.action !== operatorAudit.action
      )
        throw new CsvJobError(
          409,
          'OPERATOR_AUDIT_INCOMPLETE',
          '入金イベントの監査記録を照合できません。',
        );
    }
    const current = await syncPaymentProjection(db, row, false);
    return { duplicate: true, job: view(current) };
  }

  const activeEvents = await paymentEventsForJob(db, row);
  try {
    csvPaymentProjection([...activeEvents, value]);
  } catch {
    throw new CsvJobError(
      400,
      'PAYMENT_EVENT_MISMATCH',
      '入金イベントが既存台帳と整合しません。',
    );
  }
  const relatedId = value.relatedProviderEventId ?? '';
  const relatedOriginal = value.relatedProviderEventId
    ? await db
        .prepare(
          `SELECT type, job_id, currency FROM csv_payment_events
         WHERE provider = ? AND provider_event_id = ?`,
        )
        .bind(value.provider, value.relatedProviderEventId)
        .first<{ type: string; job_id: string; currency: string }>()
    : null;
  if (
    relatedOriginal &&
    (relatedOriginal.type !== value.relatedEventType ||
      relatedOriginal.job_id !== row.id ||
      relatedOriginal.currency !== value.currency)
  )
    throw new CsvJobError(
      400,
      'PAYMENT_EVENT_MISMATCH',
      '関連する入金の通貨・job・種別が一致しません。',
    );
  const pending = await db
    .prepare(
      `SELECT related_event_type, job_id, currency FROM csv_payment_events
     WHERE provider = ? AND related_provider_event_id = ?`,
    )
    .bind(value.provider, value.providerEventId)
    .all<{
      related_event_type: string | null;
      job_id: string;
      currency: string;
    }>();
  if (
    pending.results.some(
      (candidate) =>
        candidate.related_event_type !== value.type ||
        candidate.job_id !== row.id ||
        candidate.currency !== value.currency,
    )
  )
    throw new CsvJobError(
      400,
      'PAYMENT_EVENT_MISMATCH',
      '後着した入金が保留中の返金・争議と整合しません。',
    );

  const detail = {
    paymentEventId: crypto.randomUUID(),
    provider: value.provider,
    providerEventId: value.providerEventId,
    type: value.type,
    amountMinor: value.amountMinor,
    currency: value.currency,
    source: value.source,
    evidenceDigest: value.evidenceDigest,
    actorHash,
  };
  const detailJson = JSON.stringify(detail);
  const now = Date.now();
  const paymentEventId = detail.paymentEventId;
  const operatorFence = operatorAudit
    ? `AND NOT EXISTS (SELECT 1 FROM csv_operator_events
        WHERE actor_hash = ? AND idempotency_key = ?)
       AND NOT EXISTS (SELECT 1 FROM csv_operator_outbox
        WHERE actor_hash = ? AND idempotency_key = ?)`
    : '';
  const paymentInsert = db
    .prepare(
      `INSERT INTO csv_payment_events
       (id, provider, provider_event_id, related_provider_event_id, related_event_type, job_id,
        user_id, seller_id, type, amount_minor, currency, occurred_at,
        evidence_digest, source, created_at)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
       WHERE (SELECT COUNT(*) FROM csv_payment_events WHERE job_id = ? AND user_id = ?) = ?
         AND NOT EXISTS (SELECT 1 FROM csv_payment_events
           WHERE provider = ? AND provider_event_id = ?)
         AND (SELECT COUNT(*) FROM csv_payment_events
           WHERE provider = ? AND provider_event_id = ?) = ?
         AND (SELECT COUNT(*) FROM csv_payment_events
           WHERE provider = ? AND related_provider_event_id = ?) = ?
         AND NOT EXISTS (SELECT 1 FROM csv_payment_events
           WHERE provider = ? AND related_provider_event_id = ?
             AND (COALESCE(related_event_type, '') <> ? OR job_id <> ? OR currency <> ?))
         AND NOT EXISTS (SELECT 1 FROM csv_payment_events
           WHERE provider = ? AND provider_event_id = ?
             AND (type <> ? OR job_id <> ? OR currency <> ?))
         ${operatorFence}
       ON CONFLICT(provider, provider_event_id) DO NOTHING`,
    )
    .bind(
      paymentEventId,
      value.provider,
      value.providerEventId,
      value.relatedProviderEventId ?? null,
      value.relatedEventType ?? null,
      row.id,
      row.user_id,
      row.seller_id,
      value.type,
      value.amountMinor,
      value.currency,
      value.occurredAt,
      value.evidenceDigest,
      value.source,
      now,
      row.id,
      row.user_id,
      activeEvents.length,
      value.provider,
      value.providerEventId,
      value.provider,
      relatedId,
      relatedOriginal ? 1 : 0,
      value.provider,
      value.providerEventId,
      pending.results.length,
      value.provider,
      value.providerEventId,
      value.type,
      row.id,
      value.currency,
      value.provider,
      relatedId,
      value.relatedEventType ?? '',
      row.id,
      value.currency,
      ...(operatorAudit
        ? [
            actorHash,
            operatorAudit.idempotencyKey,
            actorHash,
            operatorAudit.idempotencyKey,
          ]
        : []),
    );
  let inserted: D1Result;
  if (operatorAudit) {
    const operatorEventId = crypto.randomUUID();
    const outboxId = crypto.randomUUID();
    const auditPayload = JSON.stringify({
      details: operatorAudit.details,
      result: { recorded: true, jobId: value.jobId },
    });
    const auditInsert = db
      .prepare(
        `INSERT INTO csv_operator_events
       (id, actor_hash, action, job_id, detail_json, created_at,
        idempotency_key, request_digest)
       SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS
         (SELECT 1 FROM csv_payment_events WHERE id = ?)
         AND NOT EXISTS (SELECT 1 FROM csv_operator_events
           WHERE actor_hash = ? AND idempotency_key = ?)
         AND NOT EXISTS (SELECT 1 FROM csv_operator_outbox
           WHERE actor_hash = ? AND idempotency_key = ?)
       ON CONFLICT(actor_hash, idempotency_key) DO NOTHING`,
      )
      .bind(
        operatorEventId,
        actorHash,
        operatorAudit.action,
        value.jobId,
        auditPayload,
        now,
        operatorAudit.idempotencyKey,
        operatorAudit.requestDigest,
        paymentEventId,
        actorHash,
        operatorAudit.idempotencyKey,
        actorHash,
        operatorAudit.idempotencyKey,
      );
    const outboxInsert = db
      .prepare(
        `INSERT INTO csv_operator_outbox
       (id, actor_hash, idempotency_key, action, payload_json, created_at)
       SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS
         (SELECT 1 FROM csv_operator_events WHERE actor_hash = ?
           AND idempotency_key = ? AND id = ?)
       ON CONFLICT(actor_hash, idempotency_key) DO NOTHING`,
      )
      .bind(
        outboxId,
        actorHash,
        operatorAudit.idempotencyKey,
        operatorAudit.action,
        auditPayload,
        now,
        actorHash,
        operatorAudit.idempotencyKey,
        operatorEventId,
      );
    const jobEvent = db
      .prepare(
        `INSERT INTO csv_job_events (job_id, user_id, event, detail_json, created_at)
       SELECT ?, ?, 'payment_event_recorded', ?, ? WHERE EXISTS
         (SELECT 1 FROM csv_payment_events WHERE id = ?)
         AND NOT EXISTS (SELECT 1 FROM csv_job_events WHERE job_id = ?
           AND event = 'payment_event_recorded' AND detail_json = ?)`,
      )
      .bind(
        row.id,
        row.user_id,
        detailJson,
        now,
        paymentEventId,
        row.id,
        detailJson,
      );
    const results = await db.batch([
      paymentInsert,
      jobEvent,
      auditInsert,
      outboxInsert,
    ]);
    const changes = results.map((result) => result.meta.changes ?? 0);
    const allCommitted = changes.every((change) => change === 1);
    const allNoop = changes.every((change) => change === 0);
    if (!allCommitted && !allNoop) {
      // All dependent inserts are gated on this exact event ID. Compensate by
      // removing only this attempt's rows if a D1 result violates that contract.
      await db.batch([
        db
          .prepare(
            `DELETE FROM csv_job_events WHERE job_id = ? AND user_id = ?
           AND event = 'payment_event_recorded' AND detail_json = ? AND created_at = ?`,
          )
          .bind(row.id, row.user_id, detailJson, now),
        db
          .prepare('DELETE FROM csv_operator_outbox WHERE id = ?')
          .bind(outboxId),
        db
          .prepare('DELETE FROM csv_operator_events WHERE id = ?')
          .bind(operatorEventId),
        db
          .prepare('DELETE FROM csv_payment_events WHERE id = ?')
          .bind(paymentEventId),
      ]);
      throw new CsvJobError(
        500,
        'PAYMENT_AUDIT_ATOMICITY',
        '入金と運営監査を一緒に保存できませんでした。',
      );
    }
    inserted = results[0] as D1Result;
  } else {
    inserted = await paymentInsert.run();
  }
  if ((inserted.meta.changes ?? 0) !== 1) {
    const prior = await db
      .prepare(
        `SELECT provider, provider_event_id, related_provider_event_id, related_event_type, job_id,
         type, amount_minor, currency, occurred_at, evidence_digest, source
         FROM csv_payment_events WHERE provider = ? AND provider_event_id = ?`,
      )
      .bind(value.provider, value.providerEventId)
      .first<CsvPaymentEventRow>();
    if (!prior) {
      if (operatorAudit) {
        const priorAction = await db
          .prepare(
            `SELECT action, request_digest FROM csv_operator_events
           WHERE actor_hash = ? AND idempotency_key = ?`,
          )
          .bind(actorHash, operatorAudit.idempotencyKey)
          .first<{ action: string; request_digest: string | null }>();
        if (
          priorAction &&
          (priorAction.action !== operatorAudit.action ||
            priorAction.request_digest !== operatorAudit.requestDigest)
        )
          throw new CsvJobError(
            409,
            'IDEMPOTENCY',
            '同じ冪等キーを別の操作には使えません。',
          );
        if (priorAction)
          throw new CsvJobError(
            409,
            'OPERATOR_AUDIT_INCOMPLETE',
            '運営監査に対応する入金がありません。',
          );
      }
      throw new CsvJobError(
        409,
        'PAYMENT_LEDGER_CHANGED',
        '入金台帳が同時に更新されました。再試行してください。',
      );
    }
    const priorValue = paymentEventFromRow(prior);
    const comparableValue =
      operatorAudit?.allowStableTimestamp &&
      priorValue.providerEventId === value.providerEventId
        ? { ...value, occurredAt: priorValue.occurredAt }
        : value;
    if (JSON.stringify(priorValue) !== JSON.stringify(comparableValue))
      throw new CsvJobError(
        409,
        'PAYMENT_EVENT_CONFLICT',
        '同じProviderイベントIDに異なる内容があります。',
      );
    if (operatorAudit) {
      const [audit, outbox] = await Promise.all([
        db
          .prepare(
            `SELECT action, request_digest FROM csv_operator_events
           WHERE actor_hash = ? AND idempotency_key = ?`,
          )
          .bind(actorHash, operatorAudit.idempotencyKey)
          .first<{ action: string; request_digest: string | null }>(),
        db
          .prepare(
            `SELECT action FROM csv_operator_outbox
           WHERE actor_hash = ? AND idempotency_key = ?`,
          )
          .bind(actorHash, operatorAudit.idempotencyKey)
          .first<{ action: string }>(),
      ]);
      if (
        audit?.action !== operatorAudit.action ||
        audit.request_digest !== operatorAudit.requestDigest ||
        outbox?.action !== operatorAudit.action
      )
        throw new CsvJobError(
          409,
          'OPERATOR_AUDIT_INCOMPLETE',
          '入金イベントの監査記録を照合できません。',
        );
    }
    const current = await syncPaymentProjection(db, row, false);
    return { duplicate: true, job: view(current) };
  }
  const current = await syncPaymentProjection(db, row, true);
  if (!operatorAudit)
    await event(db, current, 'payment_event_recorded', detail);
  return { duplicate: false, job: view(current) };
}

export async function recordManualCsvPayment(
  operator: string,
  input: Omit<CsvPaymentEvent, 'source' | 'evidenceDigest'> & {
    evidenceReference: string;
  },
  operatorAudit?: {
    action: string;
    idempotencyKey: string;
    requestDigest: string;
    details: unknown;
    allowStableTimestamp?: boolean;
  },
) {
  const actorHash = await requireCsvOperator(operator);
  if (
    typeof input.evidenceReference !== 'string' ||
    input.evidenceReference.trim().length < 4 ||
    input.evidenceReference.length > 1000
  )
    throw new CsvJobError(
      400,
      'PAYMENT_EVIDENCE',
      '照合根拠を4〜1,000文字で入力してください。',
    );
  const evidenceDigest = await sha256(
    new TextEncoder().encode(input.evidenceReference.trim()),
  );
  const { evidenceReference: _evidenceReference, ...eventInput } = input;
  void _evidenceReference;
  const value = csvPaymentEvent({
    ...eventInput,
    evidenceDigest,
    source: 'manual_verified',
  });
  return persistPaymentEvent(value, actorHash, operatorAudit);
}

export async function recordProviderCsvPayment(input: CsvPaymentEvent) {
  if (input.source !== 'provider')
    throw new CsvJobError(
      400,
      'PAYMENT_SOURCE',
      'Providerイベントが必要です。',
    );
  return persistPaymentEvent(input, `provider:${input.provider}`);
}

async function artifactKeys(db: D1Database, row: CsvJobRow) {
  const deliveries = await db
    .prepare(
      `SELECT result_key, safe_result_key, report_json_key, report_html_key
       FROM csv_delivery_revisions WHERE job_id = ? AND user_id = ?`,
    )
    .bind(row.id, row.user_id)
    .all<{
      result_key: string;
      safe_result_key: string | null;
      report_json_key: string;
      report_html_key: string;
    }>();
  return [
    row.input_key,
    row.result_key,
    row.safe_result_key,
    row.report_json_key,
    row.report_html_key,
    ...deliveries.results.flatMap((delivery) => [
      delivery.result_key,
      delivery.safe_result_key,
      delivery.report_json_key,
      delivery.report_html_key,
    ]),
  ].filter((key, index, keys): key is string =>
    Boolean(key && keys.indexOf(key) === index),
  );
}

function attemptArtifactKeys(jobId: string, revision: number, leaseId: string) {
  const base = `csv/${jobId}/v${revision}/a${leaseId}`;
  return [
    `${base}/result.csv`,
    `${base}/spreadsheet-safe.csv`,
    `${base}/report.json`,
    `${base}/report.html`,
  ];
}

async function purgeExpired(db: D1Database, bucket: R2Bucket, user: string) {
  const expired = await db
    .prepare(
      `SELECT * FROM csv_jobs
       WHERE user_id = ? AND expires_at <= ? AND files_purged_at IS NULL
       LIMIT 20`,
    )
    .bind(user, Date.now())
    .all<CsvJobRow>();
  for (const row of expired.results) {
    const keys = await artifactKeys(db, row);
    if (keys.length) await bucket.delete(keys);
    await db
      .prepare(
        'DELETE FROM csv_delivery_links WHERE job_id = ? AND user_id = ?',
      )
      .bind(row.id, user)
      .run();
    const ledger = await db
      .prepare(
        'SELECT COUNT(*) AS count FROM csv_payment_events WHERE job_id = ? AND user_id = ?',
      )
      .bind(row.id, user)
      .first<{ count: number }>();
    if (
      (ledger?.count ?? 0) === 0 &&
      ['sample', 'unpaid'].includes(row.payment_status)
    ) {
      await db
        .prepare(
          'DELETE FROM csv_delivery_revisions WHERE job_id = ? AND user_id = ?',
        )
        .bind(row.id, user)
        .run();
      await db
        .prepare('DELETE FROM csv_job_events WHERE job_id = ? AND user_id = ?')
        .bind(row.id, user)
        .run();
      await db
        .prepare(
          'DELETE FROM csv_payment_events WHERE job_id = ? AND user_id = ?',
        )
        .bind(row.id, user)
        .run();
      await db
        .prepare('DELETE FROM csv_jobs WHERE id = ? AND user_id = ?')
        .bind(row.id, user)
        .run();
      continue;
    }
    const now = Date.now();
    await db
      .prepare(
        `UPDATE csv_jobs SET result_key = NULL, safe_result_key = NULL,
         report_json_key = NULL, report_html_key = NULL, input_name = 'expired.csv',
         revision_reason = NULL, cancellation_reason = NULL, files_purged_at = ?,
         revision = revision + 1, updated_at = ? WHERE id = ? AND user_id = ?`,
      )
      .bind(now, now, row.id, user)
      .run();
    await db
      .prepare(
        `UPDATE csv_delivery_revisions SET customer_reason = NULL
         WHERE job_id = ? AND user_id = ?`,
      )
      .bind(row.id, user)
      .run();
    await event(db, await owned(db, user, row.id), 'files_purged', {
      retained: 'order-and-audit-metadata',
    });
  }
}

export async function listCsvJobs(user: string) {
  const { db, bucket } = resources();
  await purgeExpired(db, bucket, user);
  const now = Date.now();
  const exhausted = await db
    .prepare(
      `SELECT * FROM csv_jobs
       WHERE user_id = ? AND attempt >= ?
         AND ((status = 'accepted') OR
              (status = 'processing' AND COALESCE(lease_expires_at, 0) <= ?))
       ORDER BY updated_at ASC LIMIT 20`,
    )
    .bind(user, MAX_ATTEMPTS, now)
    .all<CsvJobRow>();
  for (const row of exhausted.results) {
    const failed = await db
      .prepare(
        `UPDATE csv_jobs SET status = 'quality_failed', error_code = 'ATTEMPTS_EXHAUSTED',
         lease_id = NULL, lease_expires_at = NULL, revision = revision + 1,
         updated_at = ? WHERE id = ? AND user_id = ? AND revision = ? AND attempt >= ?
         AND (status = 'accepted' OR
              (status = 'processing' AND COALESCE(lease_expires_at, 0) <= ?))`,
      )
      .bind(now, row.id, user, row.revision, MAX_ATTEMPTS, now)
      .run();
    if ((failed.meta.changes ?? 0) === 1)
      await event(db, await owned(db, user, row.id), 'attempts_exhausted', {
        attempt: row.attempt,
      });
  }
  const resumable = await db
    .prepare(
      `SELECT * FROM csv_jobs
       WHERE user_id = ? AND attempt < ?
         AND (
           (status = 'accepted' AND available_at <= ?)
           OR (status = 'processing' AND COALESCE(lease_expires_at, 0) <= ?)
         )
       ORDER BY updated_at ASC LIMIT 3`,
    )
    .bind(user, MAX_ATTEMPTS, now, now)
    .all<CsvJobRow>();
  for (const row of resumable.results) background(processCsvJob(row));
  const rows = await db
    .prepare(
      'SELECT * FROM csv_jobs WHERE user_id = ? ORDER BY updated_at DESC LIMIT 50',
    )
    .bind(user)
    .all<CsvJobRow>();
  return rows.results.map(view);
}

export async function createCsvJob(
  user: string,
  input: {
    id: string;
    name: string;
    bytes: Uint8Array;
    specification: unknown;
    sample: boolean;
  },
) {
  const { db, bucket } = resources();
  const ownerHash = await sha256(new TextEncoder().encode(user));
  const currentMonth = csvJstMonth(Date.now());
  const billing = await db
    .prepare(
      'SELECT status, cancel_at_month FROM csv_billing_accounts WHERE user_id = ?',
    )
    .bind(user)
    .first<{ status: string; cancel_at_month: string | null }>();
  const intake = await db
    .prepare(
      "SELECT accepting_new, paused_reason FROM csv_operator_settings WHERE id = 'global'",
    )
    .first<{ accepting_new: number; paused_reason: string | null }>();
  if (intake?.accepting_new === 0)
    throw new CsvJobError(
      503,
      'INTAKE_PAUSED',
      intake.paused_reason || '現在は新しい受付を停止しています。',
    );
  const ownerControl = await db
    .prepare(
      "SELECT paused_reason FROM csv_intake_controls WHERE scope_type = 'owner' AND scope_id = ? AND accepting_new = 0",
    )
    .bind(ownerHash)
    .first<{ paused_reason: string | null }>();
  const sellerControl = await db
    .prepare(
      "SELECT paused_reason FROM csv_intake_controls WHERE scope_type = 'seller' AND scope_id = 'platform-owner' AND accepting_new = 0",
    )
    .first<{ paused_reason: string | null }>();
  if (ownerControl || sellerControl)
    throw new CsvJobError(
      503,
      'INTAKE_PAUSED',
      ownerControl?.paused_reason ||
        sellerControl?.paused_reason ||
        '新しい受付を停止しています。',
    );
  if (!/^[0-9a-f-]{36}$/i.test(input.id))
    throw new CsvJobError(400, 'ID', '受付番号が不正です。');
  const name = input.name.trim().slice(0, 180) || 'input.csv';
  const specification = csvSpecification(input.specification);
  const decoded = decodeCsv(input.bytes);
  parseCsv(decoded.text);
  // Quote-time dry run rejects invalid column references and impossible output encodings.
  await transformCsv(input.bytes, specification);
  const hash = await sha256(input.bytes);
  const now = Date.now();
  const inputKey = `csv/${ownerHash}/${input.id}/${hash}.csv`;
  const existing = await db
    .prepare('SELECT * FROM csv_jobs WHERE id = ? AND user_id = ?')
    .bind(input.id, user)
    .first<CsvJobRow>();
  if (existing) {
    if (
      existing.input_sha256 !== hash ||
      existing.specification_json !== JSON.stringify(specification)
    )
      throw new CsvJobError(
        409,
        'IDEMPOTENCY',
        '同じ受付番号に異なる内容は保存できません。',
      );
    return view(existing);
  }
  if (
    billing &&
    (billing.status === 'canceled' ||
      (billing.cancel_at_month !== null &&
        currentMonth >= billing.cancel_at_month))
  )
    throw new CsvJobError(
      403,
      'BILLING_CANCELED',
      '翌月以降の新規受付は停止されています。既存の受付は続行できます。',
    );
  await bucket.put(inputKey, input.bytes, {
    httpMetadata: { contentType: 'text/csv' },
    customMetadata: {
      sha256: hash,
      owner: await sha256(new TextEncoder().encode(user)),
    },
  });
  try {
    const insert = await db
      .prepare(
        `INSERT INTO csv_jobs
         (id, user_id, status, payment_status, input_name, input_key, input_bytes,
          input_sha256, input_encoding, specification_json, quote_minor, currency,
          attempt, revision, expires_at, created_at, updated_at)
         SELECT ?, ?, 'quoted', ?, ?, ?, ?, ?, ?, ?, ?, 'JPY', 0, 0, ?, ?, ?
         WHERE COALESCE((SELECT accepting_new FROM csv_operator_settings WHERE id = 'global'), 1) = 1
           AND COALESCE((SELECT accepting_new FROM csv_intake_controls
             WHERE scope_type = 'owner' AND scope_id = ?), 1) = 1
           AND COALESCE((SELECT accepting_new FROM csv_intake_controls
             WHERE scope_type = 'seller' AND scope_id = 'platform-owner'), 1) = 1
           AND NOT EXISTS (SELECT 1 FROM csv_billing_accounts
             WHERE user_id = ? AND (status = 'canceled' OR
               (cancel_at_month IS NOT NULL AND cancel_at_month <= ?)))`,
      )
      .bind(
        input.id,
        user,
        input.sample ? 'sample' : 'unpaid',
        name,
        inputKey,
        input.bytes.byteLength,
        hash,
        decoded.encoding,
        JSON.stringify(specification),
        input.sample ? 0 : 3000,
        now + RETENTION_MS,
        now,
        now,
        ownerHash,
        user,
        currentMonth,
      )
      .run();
    if ((insert.meta.changes ?? 0) !== 1) {
      throw new CsvJobError(
        503,
        'INTAKE_PAUSED',
        '現在は新しい受付を停止しています。',
      );
    }
  } catch (error) {
    const winner = await db
      .prepare('SELECT * FROM csv_jobs WHERE id = ? AND user_id = ?')
      .bind(input.id, user)
      .first<CsvJobRow>();
    if (
      winner &&
      winner.input_sha256 === hash &&
      winner.specification_json === JSON.stringify(specification)
    )
      return view(winner);
    await bucket.delete(inputKey);
    throw error;
  }
  const row = await owned(db, user, input.id);
  await event(db, row, 'quoted', {
    sample: input.sample,
    quoteMinor: row.quote_minor,
    currency: row.currency,
  });
  return view(row);
}

export async function createCsvSampleJob(user: string) {
  const bytes = new TextEncoder().encode(
    'sku,name,note\r\n001, 佐藤 ,"改行\nあり"\r\n001,佐藤,重複\r\n002, 鈴木 ,=1+1\r\n',
  );
  const specification = {
    renames: { sku: '商品コード', name: '商品名' },
    order: ['商品コード', '商品名', 'note'],
    trim: ['商品名', 'note'],
    dedupe: { keys: ['商品コード'], mode: 'report_only' },
    sort: [],
    outputEncoding: 'utf8-bom',
    spreadsheetSafe: true,
  };
  const job = await createCsvJob(user, {
    id: crypto.randomUUID(),
    name: 'sample.csv',
    bytes,
    specification,
    sample: true,
  });
  return acceptCsvJob(user, job.id, { revision: job.revision });
}

async function processCsvJob(row: CsvJobRow) {
  const { db, bucket } = resources();
  const now = Date.now();
  if (row.attempt >= MAX_ATTEMPTS)
    throw new CsvJobError(409, 'ATTEMPTS', '自動再試行の上限に達しました。');
  const leaseId = crypto.randomUUID();
  const claim = await db
    .prepare(
      `UPDATE csv_jobs
       SET status = 'processing', attempt = attempt + 1, error_code = NULL,
           lease_id = ?, lease_expires_at = ?, updated_at = ?
       WHERE id = ? AND user_id = ? AND revision = ? AND attempt < ?
         AND (
           (status IN ('accepted', 'quality_failed') AND available_at <= ?)
           OR (status = 'processing' AND COALESCE(lease_expires_at, 0) <= ?)
         )`,
    )
    .bind(
      leaseId,
      now + LEASE_MS,
      now,
      row.id,
      row.user_id,
      row.revision,
      MAX_ATTEMPTS,
      now,
      now,
    )
    .run();
  if ((claim.meta.changes ?? 0) !== 1)
    return view(await owned(db, row.user_id, row.id));
  row = await owned(db, row.user_id, row.id);
  await event(db, row, 'processing', { attempt: row.attempt });
  const deliveryRevision = row.delivery_revision + 1;
  const base = `csv/${row.id}/v${deliveryRevision}/a${leaseId}`;
  let committedSuccessfully = false;
  try {
    const inputObject = await bucket.get(row.input_key);
    if (!inputObject)
      throw new CsvJobError(
        500,
        'INPUT_MISSING',
        '入力ファイルが見つかりません。',
      );
    const bytes = new Uint8Array(await inputObject.arrayBuffer());
    if ((await sha256(bytes)) !== row.input_sha256)
      throw new CsvJobError(
        500,
        'INPUT_HASH',
        '入力ファイルの検査値が一致しません。',
      );
    const result = await transformCsv(
      bytes,
      JSON.parse(row.specification_json),
    );
    const paymentEvents =
      row.payment_status === 'sample' ? [] : await paymentEventsForJob(db, row);
    const paymentReady = paymentReadyForJob(row, paymentEvents);
    if (!paymentReady)
      throw new CsvJobError(
        409,
        'PAYMENT_REVERSED',
        '入金が取消または未確認のため納品を停止しました。',
      );
    // Attempt-specific object keys prevent an expired worker from deleting or
    // overwriting the artifacts written by a newer lease holder.
    const resultKey = `${base}/result.csv`,
      reportJsonKey = `${base}/report.json`,
      reportHtmlKey = `${base}/report.html`;
    const safeResultKey = result.safeOutput
      ? `${base}/spreadsheet-safe.csv`
      : null;
    await bucket.put(resultKey, result.output, {
      httpMetadata: { contentType: 'text/csv' },
      customMetadata: { sha256: result.outputSha256 },
    });
    if (safeResultKey && result.safeOutput)
      await bucket.put(safeResultKey, result.safeOutput, {
        httpMetadata: { contentType: 'text/csv' },
      });
    await bucket.put(reportJsonKey, JSON.stringify(result.report, null, 2), {
      httpMetadata: { contentType: 'application/json; charset=utf-8' },
    });
    await bucket.put(reportHtmlKey, csvReportHtml(result.report, row.id), {
      httpMetadata: { contentType: 'text/html; charset=utf-8' },
    });
    const currentBeforeCommit = await owned(db, row.user_id, row.id);
    const commitPaymentEvents =
      currentBeforeCommit.payment_status === 'sample'
        ? []
        : await paymentEventsForJob(db, currentBeforeCommit);
    if (!paymentReadyForJob(currentBeforeCommit, commitPaymentEvents))
      throw new CsvJobError(
        409,
        'PAYMENT_REVERSED',
        '納品の確定直前に支払・返金・紛争状態を再照合し、納品を停止しました。',
      );
    const completed = Date.now();
    const committed = await db.batch([
      db
        .prepare(
          `UPDATE csv_jobs
           SET status = 'delivered', result_key = ?, safe_result_key = ?,
               report_json_key = ?, report_html_key = ?, output_sha256 = ?,
               validation_json = ?, delivery_revision = ?, revision = revision + 1,
               lease_id = NULL, lease_expires_at = NULL, completed_at = ?, updated_at = ?
           WHERE id = ? AND user_id = ? AND status = 'processing' AND lease_id = ?
             AND (payment_status = 'sample' OR (
               ? > 0
               AND (SELECT COUNT(*) FROM csv_payment_events
                 WHERE job_id = ? AND user_id = ? AND type = 'buyer_paid') = 1
               AND EXISTS (SELECT 1 FROM csv_payment_events
                 WHERE job_id = ? AND user_id = ? AND type = 'buyer_paid'
                   AND amount_minor = ? AND currency = ?)
               AND NOT EXISTS (SELECT 1 FROM csv_payment_events
                 WHERE job_id = ? AND user_id = ? AND type = 'refund'
                   AND related_event_type = 'buyer_paid')
               AND NOT EXISTS (SELECT 1 FROM csv_payment_events
                 WHERE job_id = ? AND user_id = ? AND type IN ('disputed', 'canceled')
                   AND related_event_type = 'buyer_paid')
               AND (SELECT COUNT(*) FROM csv_payment_events
                 WHERE job_id = ? AND user_id = ?) = ?))`,
        )
        .bind(
          resultKey,
          safeResultKey,
          reportJsonKey,
          reportHtmlKey,
          result.outputSha256,
          JSON.stringify(result.report.validation),
          deliveryRevision,
          completed,
          completed,
          row.id,
          row.user_id,
          leaseId,
          commitPaymentEvents.length,
          row.id,
          row.user_id,
          row.id,
          row.user_id,
          row.quote_minor,
          row.currency,
          row.id,
          row.user_id,
          row.id,
          row.user_id,
          row.id,
          row.user_id,
          commitPaymentEvents.length,
        ),
      db
        .prepare(
          `INSERT INTO csv_delivery_revisions
           (id, job_id, user_id, revision_number, specification_json, result_key,
            safe_result_key, report_json_key, report_html_key, output_sha256,
            validation_json, status, delivered_at)
           SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'delivered', ?
           WHERE EXISTS (SELECT 1 FROM csv_jobs WHERE id = ? AND user_id = ?
             AND status = 'delivered' AND delivery_revision = ? AND result_key = ?)
           ON CONFLICT(job_id, revision_number) DO NOTHING`,
        )
        .bind(
          `${row.id}:v${deliveryRevision}`,
          row.id,
          row.user_id,
          deliveryRevision,
          row.specification_json,
          resultKey,
          safeResultKey,
          reportJsonKey,
          reportHtmlKey,
          result.outputSha256,
          JSON.stringify(result.report.validation),
          completed,
          row.id,
          row.user_id,
          deliveryRevision,
          resultKey,
        ),
      db
        .prepare(
          `INSERT INTO csv_job_events (job_id, user_id, event, detail_json, created_at)
           SELECT ?, ?, 'delivered', ?, ? WHERE EXISTS
             (SELECT 1 FROM csv_delivery_revisions WHERE job_id = ? AND user_id = ?
              AND revision_number = ? AND result_key = ?)`,
        )
        .bind(
          row.id,
          row.user_id,
          JSON.stringify({
            deliveryRevision,
            outputSha256: result.outputSha256,
            validation: result.report.validation,
          }),
          completed,
          row.id,
          row.user_id,
          deliveryRevision,
          resultKey,
        ),
    ]);
    if ((committed[0].meta.changes ?? 0) !== 1) {
      await bucket.delete(
        [resultKey, safeResultKey, reportJsonKey, reportHtmlKey].filter(
          (key): key is string => Boolean(key),
        ),
      );
      let current = await owned(db, row.user_id, row.id);
      if (
        current.status === 'processing' &&
        current.lease_id === leaseId &&
        current.payment_status !== 'sample'
      ) {
        const currentEvents = await paymentEventsForJob(db, current);
        if (paymentReadyForJob(current, currentEvents)) return view(current);
        const stopped = await db
          .prepare(
            `UPDATE csv_jobs SET status = 'canceled', canceled_at = ?,
             cancellation_reason = 'payment_reversed', error_code = 'PAYMENT_REVERSED',
             lease_id = NULL, lease_expires_at = NULL, revision = revision + 1,
             updated_at = ? WHERE id = ? AND user_id = ? AND status = 'processing'
             AND lease_id = ?`,
          )
          .bind(Date.now(), Date.now(), row.id, row.user_id, leaseId)
          .run();
        if ((stopped.meta.changes ?? 0) === 1) {
          current = await owned(db, row.user_id, row.id);
          await event(db, current, 'payment_reversed_during_processing');
        }
      }
      return view(current);
    }
    committedSuccessfully = true;
    row = await owned(db, row.user_id, row.id);
    return view(row);
  } catch (error) {
    if (committedSuccessfully) throw error;
    await bucket.delete(attemptArtifactKeys(row.id, deliveryRevision, leaseId));
    const code =
      error instanceof CsvError || error instanceof CsvJobError
        ? error.code
        : 'PROCESSING';
    const failed = await db
      .prepare(
        `UPDATE csv_jobs
         SET status = 'quality_failed', error_code = ?, revision = revision + 1,
             available_at = ?, lease_id = NULL, lease_expires_at = NULL, updated_at = ?
         WHERE id = ? AND user_id = ? AND status = 'processing' AND lease_id = ?`,
      )
      .bind(code, Date.now(), Date.now(), row.id, row.user_id, leaseId)
      .run();
    if ((failed.meta.changes ?? 0) === 1) {
      row = await owned(db, row.user_id, row.id);
      await event(db, row, 'quality_failed', { code });
    }
    throw error;
  }
}

export async function acceptCsvJob(
  user: string,
  id: string,
  input: {
    revision: number;
  },
) {
  const { db } = resources();
  let row = await owned(db, user, id);
  if (row.expires_at <= Date.now()) {
    await purgeExpired(db, resources().bucket, user);
    throw new CsvJobError(410, 'EXPIRED', '保管期限を過ぎたため削除しました。');
  }
  if (row.status === 'delivered' || row.status === 'approved') return view(row);
  if (row.status === 'processing') return view(row);
  if (!Number.isInteger(input.revision) || input.revision !== row.revision)
    throw new CsvJobError(
      409,
      'REVISION',
      '別の画面で更新されています。再読込してください。',
    );
  const sample = row.payment_status === 'sample';
  const paymentEvents = sample ? [] : await paymentEventsForJob(db, row);
  if (!sample && !paymentReadyForJob(row, paymentEvents))
    throw new CsvJobError(
      409,
      csvBuyerPaymentQuoteMismatch(paymentEvents, row.quote_minor, row.currency)
        ? 'PAYMENT_AMOUNT_MISMATCH'
        : 'PAYMENT_PENDING',
      '運営側で見積額と通貨を含む入金照合が終わるまで開始できません。',
    );
  const now = Date.now();
  const accepted = await db
    .prepare(
      `UPDATE csv_jobs
       SET status = 'accepted', accepted_at = COALESCE(accepted_at, ?),
           available_at = ?, lease_id = NULL, lease_expires_at = NULL,
           revision = revision + 1, updated_at = ?
       WHERE id = ? AND user_id = ? AND revision = ?
         AND status IN ('quoted', 'quality_failed')
         AND (payment_status = 'sample' OR (
           ? > 0
           AND (SELECT COUNT(*) FROM csv_payment_events
             WHERE job_id = ? AND user_id = ? AND type = 'buyer_paid') = 1
           AND EXISTS (SELECT 1 FROM csv_payment_events
             WHERE job_id = ? AND user_id = ? AND type = 'buyer_paid'
               AND amount_minor = ? AND currency = ?)
           AND NOT EXISTS (SELECT 1 FROM csv_payment_events
             WHERE job_id = ? AND user_id = ? AND type = 'refund'
               AND related_event_type = 'buyer_paid')
           AND NOT EXISTS (SELECT 1 FROM csv_payment_events
             WHERE job_id = ? AND user_id = ? AND type IN ('disputed', 'canceled')
               AND related_event_type = 'buyer_paid')
           AND (SELECT COUNT(*) FROM csv_payment_events
             WHERE job_id = ? AND user_id = ?) = ?))`,
    )
    .bind(
      now,
      now,
      now,
      id,
      user,
      row.revision,
      paymentEvents.length,
      id,
      user,
      id,
      user,
      row.quote_minor,
      row.currency,
      id,
      user,
      id,
      user,
      id,
      user,
      paymentEvents.length,
    )
    .run();
  if ((accepted.meta.changes ?? 0) !== 1)
    throw new CsvJobError(409, 'STATE', '現在の状態では開始できません。');
  row = await owned(db, user, id);
  await event(db, row, 'accepted', { paymentStatus: row.payment_status });
  background(processCsvJob(row));
  return view(row);
}

export async function retryCsvJob(
  user: string,
  id: string,
  revision: number,
  operatorAudit?: {
    actorHash: string;
    idempotencyKey: string;
    requestDigest: string;
    action: string;
    details: unknown;
    result: unknown;
  },
) {
  const { db } = resources();
  let row = await owned(db, user, id);
  if (row.status !== 'quality_failed' || revision !== row.revision)
    throw new CsvJobError(409, 'STATE', '再試行できる状態ではありません。');
  if (row.attempt >= MAX_ATTEMPTS)
    throw new CsvJobError(409, 'ATTEMPTS', '自動再試行の上限に達しました。');
  if (row.payment_status !== 'sample') {
    if (!paymentReadyForJob(row, await paymentEventsForJob(db, row)))
      throw new CsvJobError(
        409,
        'PAYMENT_PENDING',
        '運営側の入金照合が終わるまで再試行できません。',
      );
  }
  const now = Date.now();
  let changed: D1Result;
  if (operatorAudit) {
    const jobDetail = JSON.stringify({ attempt: row.attempt, operator: true });
    const auditPayload = JSON.stringify({
      details: operatorAudit.details,
      result: operatorAudit.result,
    });
    const operatorEventId = crypto.randomUUID();
    const outboxId = crypto.randomUUID();
    const results = await db.batch([
      db
        .prepare(
          `UPDATE csv_jobs SET status = 'accepted', available_at = ?,
       lease_id = NULL, lease_expires_at = NULL, revision = revision + 1,
       updated_at = ? WHERE id = ? AND user_id = ? AND revision = ?
       AND status = 'quality_failed'
       AND NOT EXISTS (SELECT 1 FROM csv_operator_events
         WHERE actor_hash = ? AND idempotency_key = ?)`,
        )
        .bind(
          now,
          now,
          id,
          user,
          revision,
          operatorAudit.actorHash,
          operatorAudit.idempotencyKey,
        ),
      db
        .prepare(
          `INSERT INTO csv_job_events (job_id, user_id, event, detail_json, created_at)
         SELECT ?, ?, 'retry_queued', ?, ? WHERE EXISTS
           (SELECT 1 FROM csv_jobs WHERE id = ? AND user_id = ?
             AND status = 'accepted' AND revision = ?)
           AND NOT EXISTS (SELECT 1 FROM csv_operator_events
             WHERE actor_hash = ? AND idempotency_key = ?)`,
        )
        .bind(
          id,
          user,
          jobDetail,
          now,
          id,
          user,
          revision + 1,
          operatorAudit.actorHash,
          operatorAudit.idempotencyKey,
        ),
      db
        .prepare(
          `INSERT INTO csv_operator_events
         (id, actor_hash, action, job_id, detail_json, created_at,
          idempotency_key, request_digest)
         SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS
           (SELECT 1 FROM csv_job_events WHERE job_id = ? AND event = 'retry_queued'
             AND created_at = ? AND detail_json = ?)
           AND NOT EXISTS (SELECT 1 FROM csv_operator_events
             WHERE actor_hash = ? AND idempotency_key = ?)
         ON CONFLICT(actor_hash, idempotency_key) DO NOTHING`,
        )
        .bind(
          operatorEventId,
          operatorAudit.actorHash,
          operatorAudit.action,
          id,
          auditPayload,
          now,
          operatorAudit.idempotencyKey,
          operatorAudit.requestDigest,
          id,
          now,
          jobDetail,
          operatorAudit.actorHash,
          operatorAudit.idempotencyKey,
        ),
      db
        .prepare(
          `INSERT INTO csv_operator_outbox
         (id, actor_hash, idempotency_key, action, payload_json, created_at)
         SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS
           (SELECT 1 FROM csv_operator_events WHERE actor_hash = ?
             AND idempotency_key = ? AND id = ?)
         ON CONFLICT(actor_hash, idempotency_key) DO NOTHING`,
        )
        .bind(
          outboxId,
          operatorAudit.actorHash,
          operatorAudit.idempotencyKey,
          operatorAudit.action,
          auditPayload,
          now,
          operatorAudit.actorHash,
          operatorAudit.idempotencyKey,
          operatorEventId,
        ),
    ]);
    changed = results[0] as D1Result;
  } else {
    changed = await db
      .prepare(
        `UPDATE csv_jobs SET status = 'accepted', available_at = ?,
         lease_id = NULL, lease_expires_at = NULL, revision = revision + 1,
         updated_at = ? WHERE id = ? AND user_id = ? AND revision = ?
         AND status = 'quality_failed'`,
      )
      .bind(now, now, id, user, revision)
      .run();
  }
  if ((changed.meta.changes ?? 0) !== 1)
    throw new CsvJobError(409, 'STATE', '現在の状態では再試行できません。');
  row = await owned(db, user, id);
  if (!operatorAudit)
    await event(db, row, 'retry_queued', { attempt: row.attempt });
  background(processCsvJob(row));
  return view(row);
}

function customerReason(value: unknown) {
  if (
    typeof value !== 'string' ||
    value.trim().length < 4 ||
    value.length > 1000
  )
    throw new CsvJobError(
      400,
      'REVISION_REASON',
      '修正理由を4〜1,000文字で入力してください。',
    );
  return value.trim();
}

export async function actOnCsvDelivery(
  user: string,
  id: string,
  input: {
    action: 'approve' | 'revision' | 'cancel';
    revision: number;
    reason?: unknown;
    actor?: 'seller' | 'buyer';
  },
) {
  const { db } = resources();
  let row = await owned(db, user, id);
  if (!Number.isInteger(input.revision) || input.revision !== row.revision)
    throw new CsvJobError(
      409,
      'REVISION',
      '別の画面で更新されています。再読込してください。',
    );
  const now = Date.now();
  if (input.action === 'approve') {
    if (row.status !== 'delivered')
      throw new CsvJobError(409, 'STATE', '納品済みの結果だけを検収できます。');
    const changed = await db.batch([
      db
        .prepare(
          `UPDATE csv_jobs SET status = 'approved', approved_at = ?,
         revision = revision + 1, updated_at = ?
         WHERE id = ? AND user_id = ? AND revision = ? AND status = 'delivered'
         AND EXISTS (SELECT 1 FROM csv_delivery_revisions
           WHERE job_id = ? AND user_id = ? AND revision_number = ?
             AND status = 'delivered')`,
        )
        .bind(
          now,
          now,
          id,
          user,
          row.revision,
          id,
          user,
          row.delivery_revision,
        ),
      db
        .prepare(
          `UPDATE csv_delivery_revisions SET status = 'approved', resolved_at = ?
         WHERE job_id = ? AND user_id = ? AND revision_number = ?
         AND EXISTS (SELECT 1 FROM csv_jobs WHERE id = ? AND user_id = ?
           AND status = 'approved' AND revision = ?)`,
        )
        .bind(now, id, user, row.delivery_revision, id, user, row.revision + 1),
      db
        .prepare(
          `INSERT INTO csv_job_events (job_id, user_id, event, detail_json, created_at)
         SELECT ?, ?, 'approved', ?, ? WHERE EXISTS
           (SELECT 1 FROM csv_delivery_revisions WHERE job_id = ? AND user_id = ?
            AND revision_number = ? AND status = 'approved')`,
        )
        .bind(
          id,
          user,
          JSON.stringify({
            deliveryRevision: row.delivery_revision,
            actor: input.actor ?? 'seller',
          }),
          now,
          id,
          user,
          row.delivery_revision,
        ),
    ]);
    if ((changed[0].meta.changes ?? 0) !== 1)
      throw new CsvJobError(409, 'STATE', '現在の状態では検収できません。');
    if (
      (changed[1].meta.changes ?? 0) !== 1 ||
      (changed[2].meta.changes ?? 0) !== 1
    )
      throw new CsvJobError(
        500,
        'DELIVERY_AUDIT',
        '検収の履歴を保存できませんでした。',
      );
    row = await owned(db, user, id);
    return view(row);
  }
  if (input.action === 'cancel') {
    const paymentEvents = await paymentEventsForJob(db, row);
    const paymentProjection = csvPaymentProjection(paymentEvents);
    if (
      !['quoted', 'quality_failed'].includes(row.status) ||
      (row.payment_status !== 'sample' &&
        !['unpaid', 'payment_failed', 'refunded', 'canceled'].includes(
          paymentProjection.status,
        ))
    )
      throw new CsvJobError(
        409,
        'CANCEL_REQUIRES_REFUND',
        '支払済み案件は運営側で返金を記録してから取り消してください。',
      );
    const reason = customerReason(input.reason);
    const reasonDigest = await sha256(new TextEncoder().encode(reason));
    const canceled = await db
      .prepare(
        `UPDATE csv_jobs SET status = 'canceled', canceled_at = ?,
         cancellation_reason = ?, revision = revision + 1, updated_at = ?
         WHERE id = ? AND user_id = ? AND revision = ?
         AND status IN ('quoted', 'quality_failed')
         AND (payment_status = 'sample' OR
           (SELECT COUNT(*) FROM csv_payment_events
            WHERE job_id = ? AND user_id = ?) = ?)`,
      )
      .bind(
        now,
        reason,
        now,
        id,
        user,
        row.revision,
        id,
        user,
        paymentEvents.length,
      )
      .run();
    if ((canceled.meta.changes ?? 0) !== 1)
      throw new CsvJobError(409, 'STATE', '現在の状態では取り消せません。');
    row = await owned(db, user, id);
    await event(db, row, 'canceled', {
      reasonDigest,
      reasonLength: reason.length,
    });
    return view(row);
  }
  if (row.status !== 'delivered')
    throw new CsvJobError(409, 'STATE', '納品済みの結果だけを修正できます。');
  if (row.delivery_revision >= 2)
    throw new CsvJobError(
      409,
      'REVISION_LIMIT',
      '料金内の修正は1回までです。追加対応は新しい受付として確認します。',
    );
  const reason = customerReason(input.reason);
  const reasonDigest = await sha256(new TextEncoder().encode(reason));
  const changed = await db.batch([
    db
      .prepare(
        `UPDATE csv_jobs SET status = 'revision_requested', revision_reason = ?,
         revision_requested_at = ?, revision = revision + 1, updated_at = ?
         WHERE id = ? AND user_id = ? AND revision = ? AND status = 'delivered'
           AND EXISTS (SELECT 1 FROM csv_delivery_revisions
             WHERE job_id = ? AND user_id = ? AND revision_number = ?
               AND status = 'delivered')`,
      )
      .bind(
        reason,
        now,
        now,
        id,
        user,
        row.revision,
        id,
        user,
        row.delivery_revision,
      ),
    db
      .prepare(
        `UPDATE csv_delivery_revisions SET status = 'revision_requested',
         customer_reason = ?, resolved_at = NULL
         WHERE job_id = ? AND user_id = ? AND revision_number = ?
         AND EXISTS (SELECT 1 FROM csv_jobs WHERE id = ? AND user_id = ?
           AND status = 'revision_requested' AND revision = ?)`,
      )
      .bind(
        reason,
        id,
        user,
        row.delivery_revision,
        id,
        user,
        row.revision + 1,
      ),
    db
      .prepare(
        `INSERT INTO csv_job_events (job_id, user_id, event, detail_json, created_at)
         SELECT ?, ?, 'revision_requested', ?, ? WHERE EXISTS
           (SELECT 1 FROM csv_delivery_revisions WHERE job_id = ? AND user_id = ?
            AND revision_number = ? AND status = 'revision_requested')`,
      )
      .bind(
        id,
        user,
        JSON.stringify({
          reasonDigest,
          reasonLength: reason.length,
          priorDeliveryRevision: row.delivery_revision,
          actor: input.actor ?? 'seller',
        }),
        now,
        id,
        user,
        row.delivery_revision,
      ),
  ]);
  if ((changed[0].meta.changes ?? 0) !== 1)
    throw new CsvJobError(409, 'STATE', '現在の状態では修正できません。');
  row = await owned(db, user, id);
  return view(row);
}

export async function applyCsvRevision(
  user: string,
  id: string,
  input: { revision: number; specification: unknown },
) {
  const { db, bucket } = resources();
  let row = await owned(db, user, id);
  if (
    row.status !== 'revision_requested' ||
    !Number.isInteger(input.revision) ||
    input.revision !== row.revision
  )
    throw new CsvJobError(409, 'STATE', '確認待ちの修正依頼がありません。');
  if (row.delivery_revision >= 2)
    throw new CsvJobError(409, 'REVISION_LIMIT', '料金内の修正は1回までです。');
  if (row.payment_status !== 'sample') {
    if (!paymentReadyForJob(row, await paymentEventsForJob(db, row)))
      throw new CsvJobError(
        409,
        'PAYMENT_PENDING',
        '入金状態を再確認してください。',
      );
  }
  const specification = csvSpecification(input.specification);
  const object = await bucket.get(row.input_key);
  if (!object)
    throw new CsvJobError(
      410,
      'INPUT_MISSING',
      '入力の保管期限が切れています。',
    );
  await transformCsv(new Uint8Array(await object.arrayBuffer()), specification);
  const paymentEvents =
    row.payment_status === 'sample' ? [] : await paymentEventsForJob(db, row);
  const now = Date.now();
  const queued = await db
    .prepare(
      `UPDATE csv_jobs SET status = 'accepted', specification_json = ?,
       available_at = ?, lease_id = NULL, lease_expires_at = NULL,
       revision = revision + 1, updated_at = ?
       WHERE id = ? AND user_id = ? AND revision = ?
         AND status = 'revision_requested' AND delivery_revision = 1
         AND (payment_status = 'sample' OR
           (SELECT COUNT(*) FROM csv_payment_events WHERE job_id = ? AND user_id = ?) = ?)`,
    )
    .bind(
      JSON.stringify(specification),
      now,
      now,
      id,
      user,
      input.revision,
      id,
      user,
      paymentEvents.length,
    )
    .run();
  if ((queued.meta.changes ?? 0) !== 1)
    throw new CsvJobError(409, 'STATE', '修正依頼の状態が変わりました。');
  row = await owned(db, user, id);
  await event(db, row, 'revision_rework_queued', {
    deliveryRevision: row.delivery_revision + 1,
  });
  background(processCsvJob(row));
  return view(row);
}

export async function deleteCsvJob(user: string, id: string) {
  const { db, bucket } = resources();
  const row = await owned(db, user, id);
  const payments = await db
    .prepare(
      'SELECT COUNT(*) AS count FROM csv_payment_events WHERE job_id = ? AND user_id = ?',
    )
    .bind(id, user)
    .first<{ count: number }>();
  if (
    !['quoted', 'canceled'].includes(row.status) &&
    !['sample', 'refunded', 'canceled', 'unpaid'].includes(row.payment_status)
  )
    throw new CsvJobError(
      409,
      'DELETE_ACTIVE_ORDER',
      '支払済み案件は取消・返金の記録後に削除してください。',
    );
  if ((payments?.count ?? 0) > 0)
    throw new CsvJobError(
      409,
      'DELETE_FINANCIAL_RECORD',
      '入金・返金の台帳を保持するため、記録のある案件は削除できません。',
    );
  const keys = await artifactKeys(db, row);
  if (keys.length) await bucket.delete(keys);
  await db
    .prepare(
      'DELETE FROM csv_delivery_revisions WHERE job_id = ? AND user_id = ?',
    )
    .bind(id, user)
    .run();
  await db
    .prepare('DELETE FROM csv_delivery_links WHERE job_id = ? AND user_id = ?')
    .bind(id, user)
    .run();
  await db
    .prepare('DELETE FROM csv_job_events WHERE job_id = ? AND user_id = ?')
    .bind(id, user)
    .run();
  await db
    .prepare('DELETE FROM csv_jobs WHERE id = ? AND user_id = ?')
    .bind(id, user)
    .run();
}

export async function csvArtifact(user: string, id: string, kind: string) {
  const { db, bucket } = resources();
  const row = await owned(db, user, id);
  if (row.expires_at <= Date.now()) {
    await purgeExpired(db, resources().bucket, user);
    throw new CsvJobError(410, 'EXPIRED', '保管期限を過ぎたため削除しました。');
  }
  const map: Record<
    string,
    { key: string | null; name: string; type: string }
  > = {
    input: { key: row.input_key, name: row.input_name, type: 'text/csv' },
    result: { key: row.result_key, name: 'result.csv', type: 'text/csv' },
    'spreadsheet-safe': {
      key: row.safe_result_key,
      name: 'spreadsheet-safe.csv',
      type: 'text/csv',
    },
    'report-json': {
      key: row.report_json_key,
      name: 'report.json',
      type: 'application/json; charset=utf-8',
    },
    'report-html': {
      key: row.report_html_key,
      name: 'report.html',
      type: 'text/html; charset=utf-8',
    },
  };
  const selected = map[kind];
  if (!selected?.key)
    throw new CsvJobError(404, 'ARTIFACT', '成果物が見つかりません。');
  const object = await bucket.get(selected.key);
  if (!object)
    throw new CsvJobError(404, 'ARTIFACT', '成果物が見つかりません。');
  return { object, name: selected.name, type: selected.type };
}

function tokenString(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '');
}

async function hashToken(token: string) {
  return sha256(new TextEncoder().encode(token));
}

export async function createCsvDeliveryLink(user: string, id: string) {
  const { db } = resources();
  const row = await owned(db, user, id);
  if (row.expires_at <= Date.now() || row.files_purged_at)
    throw new CsvJobError(
      410,
      'EXPIRED',
      '納品データの保管期限が切れています。',
    );
  if (!['delivered', 'approved'].includes(row.status))
    throw new CsvJobError(
      409,
      'DELIVERY_PENDING',
      '納品後に共有リンクを作れます。',
    );
  if (!row.result_key)
    throw new CsvJobError(
      410,
      'DELIVERY_PURGED',
      '納品ファイルが取得できません。',
    );
  const token = tokenString(crypto.getRandomValues(new Uint8Array(32)));
  const tokenHash = await hashToken(token);
  const now = Date.now();
  const expiresAt = Math.min(row.expires_at, now + RETENTION_MS);
  const linkId = crypto.randomUUID();
  const results = await db.batch([
    db
      .prepare(
        `UPDATE csv_delivery_links SET revoked_at = ?
         WHERE job_id = ? AND user_id = ? AND revoked_at IS NULL`,
      )
      .bind(now, id, user),
    db
      .prepare(
        `INSERT INTO csv_delivery_links
         (id, job_id, user_id, token_hash, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(linkId, id, user, tokenHash, expiresAt, now),
  ]);
  if ((results[1].meta.changes ?? 0) !== 1)
    throw new CsvJobError(
      500,
      'DELIVERY_LINK',
      '共有リンクを作成できませんでした。',
    );
  await event(db, row, 'delivery_link_created', { expiresAt });
  return {
    url: `/csv/delivery/${encodeURIComponent(id)}#token=${encodeURIComponent(token)}`,
    expiresAt,
  };
}

export async function revokeCsvDeliveryLinks(user: string, id: string) {
  const { db } = resources();
  const row = await owned(db, user, id);
  const now = Date.now();
  const revoked = await db
    .prepare(
      `UPDATE csv_delivery_links SET revoked_at = ?
       WHERE job_id = ? AND user_id = ? AND revoked_at IS NULL`,
    )
    .bind(now, id, user)
    .run();
  await event(db, row, 'delivery_links_revoked', {
    count: revoked.meta.changes ?? 0,
  });
  return { revoked: revoked.meta.changes ?? 0 };
}

async function authorizeCsvDeliveryLink(id: string, token: string) {
  if (
    typeof token !== 'string' ||
    token.length !== 43 ||
    !/^[A-Za-z0-9_-]{43}$/.test(token)
  )
    throw new CsvJobError(
      404,
      'DELIVERY_LINK',
      '共有リンクが無効か期限切れです。',
    );
  const { db } = resources();
  const link = await db
    .prepare(
      `SELECT l.id AS link_id, l.user_id, l.job_id, j.*
       FROM csv_delivery_links l JOIN csv_jobs j ON j.id = l.job_id
       WHERE l.job_id = ? AND l.token_hash = ? AND l.revoked_at IS NULL
         AND l.expires_at > ? AND j.expires_at > ? AND j.files_purged_at IS NULL`,
    )
    .bind(id, await hashToken(token), Date.now(), Date.now())
    .first<CsvJobRow & { link_id: string }>();
  if (
    !link ||
    ![
      'delivered',
      'approved',
      'revision_requested',
      'accepted',
      'processing',
      'quality_failed',
    ].includes(link.status)
  )
    throw new CsvJobError(
      404,
      'DELIVERY_LINK',
      '共有リンクが無効か期限切れです。',
    );
  await db
    .prepare('UPDATE csv_delivery_links SET last_accessed_at = ? WHERE id = ?')
    .bind(Date.now(), link.link_id)
    .run();
  return { db, row: link };
}

export async function csvBuyerDelivery(id: string, token: string) {
  const { db, row } = await authorizeCsvDeliveryLink(id, token);
  const delivery = await db
    .prepare(
      `SELECT revision_number, specification_json, output_sha256,
       validation_json, status, delivered_at FROM csv_delivery_revisions
       WHERE job_id = ? AND user_id = ? ORDER BY revision_number DESC LIMIT 1`,
    )
    .bind(id, row.user_id)
    .first<{
      revision_number: number;
      specification_json: string;
      output_sha256: string;
      validation_json: string;
      status: string;
      delivered_at: number;
    }>();
  if (!delivery)
    throw new CsvJobError(404, 'DELIVERY', '納品版が見つかりません。');
  return {
    job: {
      id: row.id,
      status: row.status,
      revision: row.revision,
      deliveryRevision: delivery.revision_number,
      expiresAt: row.expires_at,
      approvedAt: row.approved_at,
    },
    delivery: {
      specification: JSON.parse(delivery.specification_json),
      outputSha256: delivery.output_sha256,
      validation: JSON.parse(delivery.validation_json),
      status: delivery.status,
      deliveredAt: delivery.delivered_at,
      artifacts: [
        'result',
        ...(row.safe_result_key ? ['spreadsheet-safe'] : []),
        'report-json',
        'report-html',
      ],
    },
  };
}

export async function csvBuyerArtifact(
  id: string,
  token: string,
  kind: string,
) {
  const { db, row } = await authorizeCsvDeliveryLink(id, token);
  const delivery = await db
    .prepare(
      `SELECT result_key, safe_result_key, report_json_key, report_html_key
       FROM csv_delivery_revisions WHERE job_id = ? AND user_id = ?
       ORDER BY revision_number DESC LIMIT 1`,
    )
    .bind(id, row.user_id)
    .first<{
      result_key: string;
      safe_result_key: string | null;
      report_json_key: string;
      report_html_key: string;
    }>();
  if (!delivery)
    throw new CsvJobError(404, 'DELIVERY', '納品版が見つかりません。');
  const map: Record<
    string,
    { key: string | null; name: string; type: string }
  > = {
    result: { key: delivery.result_key, name: 'result.csv', type: 'text/csv' },
    'spreadsheet-safe': {
      key: delivery.safe_result_key,
      name: 'spreadsheet-safe.csv',
      type: 'text/csv',
    },
    'report-json': {
      key: delivery.report_json_key,
      name: 'report.json',
      type: 'application/json; charset=utf-8',
    },
    'report-html': {
      key: delivery.report_html_key,
      name: 'report.html',
      type: 'text/html; charset=utf-8',
    },
  };
  const selected = map[kind];
  if (!selected?.key)
    throw new CsvJobError(404, 'ARTIFACT', '成果物が見つかりません。');
  const { bucket } = resources();
  const object = await bucket.get(selected.key);
  if (!object)
    throw new CsvJobError(404, 'ARTIFACT', '成果物が見つかりません。');
  return { object, name: selected.name, type: selected.type };
}

export async function actOnCsvBuyerDelivery(
  id: string,
  token: string,
  input: {
    action: 'approve' | 'revision';
    revision: number;
    reason?: unknown;
  },
) {
  const { row } = await authorizeCsvDeliveryLink(id, token);
  return actOnCsvDelivery(row.user_id, id, { ...input, actor: 'buyer' });
}

export function csvApiError(error: unknown) {
  if (error instanceof Error && error.message === 'UNAUTHORIZED')
    return Response.json(
      {
        error: 'サインインするとCSVの受付と履歴を利用できます。',
        code: 'UNAUTHORIZED',
      },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  if (error instanceof Error && error.message === 'ORIGIN')
    return Response.json(
      { error: 'このサイトから操作してください。', code: 'ORIGIN' },
      { status: 403, headers: { 'Cache-Control': 'no-store' } },
    );
  if (error instanceof CsvJobError)
    return Response.json(
      { error: error.message, code: error.code },
      { status: error.status, headers: { 'Cache-Control': 'no-store' } },
    );
  if (error instanceof CsvError)
    return Response.json(
      { error: error.message, code: error.code },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  console.error('csv-job', error);
  return Response.json(
    {
      error: '処理に失敗しました。入力を保持している場合は再試行できます。',
      code: 'INTERNAL',
    },
    { status: 500, headers: { 'Cache-Control': 'no-store' } },
  );
}
