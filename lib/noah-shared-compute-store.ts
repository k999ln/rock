import type { BillingScope } from './noah-shared-compute-plan.ts';
import { NoahAgentError, noahSha256 } from './noah-agent-upload.ts';
import {
  evaluateSharedSample,
  sharedTopicTitle,
  SHARED_WORKLOAD_SHA256,
  SHARED_WORKLOAD_VERSION,
} from './noah-shared-workload.ts';

export const SHARED_COMPUTE_CONSENT = 'shared-compute-v2';
const LEASE_MS = 4_000;
const MAX_RUN_MS = 20_000;
const MAX_PENDING_MS = 15 * 60_000;
const missingLease = () =>
  new NoahAgentError(
    'この割り当ては終了しました。端末の計算を停止してください。',
    409,
  );
type Database = Pick<D1Database, 'prepare' | 'batch'>;
type Device = { id: string; tokenHash: string; ownerScope: string };
type Lease = {
  jobId: string;
  leaseId: string;
  sampleId: string;
  workload: string;
  artifactSha256: string;
  expiresAt: number;
};

const activeDevice = `EXISTS (SELECT 1 FROM noah_compute_devices
  WHERE id=? AND token_hash=? AND revoked_at IS NULL AND consent_version=?)`;
// Bind the booked allowance to the same verified subscription period throughout the lease.
const activePeriod = `EXISTS (SELECT 1 FROM noah_compute_subscriptions AS s
  WHERE s.attempt=j.contract_attempt AND s.owner_scope=j.owner_scope AND s.closed=0 AND s.status IN ('active','ending') AND s.period_start=j.period_start
    AND s.period_start<=? AND s.period_end>? AND s.mode=? AND s.stripe_account=?)`;
const liveReservation = `(status='completed' OR (deadline>? AND (status='queued' OR
  (status='leased' AND (attempts<3 OR lease_until>?)))))`;
const leaseColumns =
  'id AS jobId,lease_id AS leaseId,sample_id AS sampleId,workload,artifact_hash AS artifactSha256,lease_until AS expiresAt';
const tokenHash = (value: string) =>
  noahSha256(new TextEncoder().encode(value));

export function createSharedComputeStore(
  db: Database,
  billingScope: BillingScope | null,
) {
  function currentScope() {
    if (!billingScope)
      throw new NoahAgentError('参加端末の受付は準備中です。', 503);
    return billingScope;
  }
  const q = (sql: string, ...bindings: (string | number)[]) =>
    db.prepare(sql).bind(...bindings);
  const revisionAllowed = `NOT EXISTS (SELECT 1 FROM noah_compute_delegation_fences
    WHERE owner_scope=? AND action=? AND min_revision>?)`;
  async function status(owner: string, now: number) {
    const [devices, jobs] = await Promise.all([
      q(
        'SELECT id,enrolled_at AS enrolledAt,revoked_at,mode,stripe_account FROM noah_compute_devices WHERE owner_scope=? ORDER BY revoked_at IS NOT NULL,enrolled_at DESC LIMIT 50',
        owner,
      ).all<{
        id: string;
        enrolledAt: number;
        revoked_at: number | null;
        mode: BillingScope['mode'];
        stripe_account: string;
      }>(),
      q(
        `SELECT id,sample_id AS sampleId,created_at AS createdAt,receipt_id AS receiptId,result_label,result_score,
          CASE WHEN status IN ('queued','leased') AND (deadline<=? OR (status='leased' AND attempts>=3 AND lease_until<=?) OR
            NOT EXISTS (SELECT 1 FROM noah_compute_subscriptions AS s WHERE s.attempt=j.contract_attempt AND
              s.period_start=j.period_start AND s.closed=0 AND s.status IN ('active','ending'))) THEN 'expired'
            WHEN status='leased' AND lease_until<=? THEN 'queued' ELSE status END AS status
          FROM noah_compute_jobs AS j WHERE owner_scope=? AND EXISTS (SELECT 1 FROM noah_compute_subscriptions s
            WHERE s.attempt=j.contract_attempt AND s.mode=? AND s.stripe_account=?) ORDER BY created_at DESC,rowid DESC LIMIT 50`,
        now,
        now,
        now,
        owner,
        billingScope?.mode ?? '',
        billingScope?.accountId ?? '',
      ).all<{
        id: string;
        sampleId: string;
        createdAt: number;
        receiptId: string | null;
        result_label: string | null;
        result_score: number | null;
        status: string;
      }>(),
    ]);
    return {
      devices: devices.results.map(
        ({ id, enrolledAt, revoked_at, mode, stripe_account }) => ({
          id,
          enrolledAt,
          mode,
          currentEnvironment:
            billingScope?.mode === mode &&
            stripe_account === billingScope.accountId,
          active: revoked_at === null,
        }),
      ),
      jobs: jobs.results.map(({ result_label, result_score, ...job }) => ({
        ...job,
        title: sharedTopicTitle(job.sampleId),
        inputKind: job.sampleId.startsWith('terms-') ? 'term-counts' : 'sample',
        result:
          result_label === null
            ? null
            : { label: result_label, score: result_score },
      })),
    };
  }

  async function enroll(
    owner: string,
    deviceId: string,
    profileRevision: number,
    now: number,
  ) {
    const scope = currentScope();
    const token = crypto.randomUUID();
    const enrolled = await q(
      `INSERT INTO noah_compute_devices(id,owner_scope,token_hash,mode,stripe_account,consent_version,profile_revision,enrolled_at)
      SELECT ?,?,?,?,?,?,?,? WHERE ${revisionAllowed} AND (SELECT count(*) FROM noah_compute_devices WHERE owner_scope=? AND revoked_at IS NULL)<8
      ON CONFLICT(id) DO UPDATE SET token_hash=excluded.token_hash,mode=excluded.mode,stripe_account=excluded.stripe_account,consent_version=excluded.consent_version,
        profile_revision=excluded.profile_revision,enrolled_at=excluded.enrolled_at,revoked_at=NULL
        WHERE owner_scope=excluded.owner_scope AND revoked_at IS NOT NULL`,
      deviceId,
      owner,
      await tokenHash(token),
      scope.mode,
      scope.accountId,
      SHARED_COMPUTE_CONSENT,
      profileRevision,
      now,
      owner,
      'connect',
      profileRevision,
      owner,
    ).run();
    if (!enrolled.meta.changes)
      throw new NoahAgentError(
        '端末を追加できません。参加端末の設定を確認してください。',
        409,
      );
    return { deviceToken: token };
  }

  async function revoke(owner: string, deviceId: string, now: number) {
    const [device] = await db.batch([
      q(
        'UPDATE noah_compute_devices SET revoked_at=COALESCE(revoked_at,?) WHERE id=? AND owner_scope=?',
        now,
        deviceId,
        owner,
      ),
      q(
        `UPDATE noah_compute_jobs SET lease_until=?,status=CASE WHEN attempts>=3 THEN 'expired' ELSE 'queued' END
        WHERE device_id=? AND status='leased' AND EXISTS (SELECT 1 FROM noah_compute_devices WHERE id=? AND owner_scope=? AND revoked_at IS NOT NULL)`,
        now,
        deviceId,
        deviceId,
        owner,
      ),
    ]);
    if (!device.meta.changes)
      throw new NoahAgentError('端末が見つかりません。', 404);
    return { ok: true };
  }

  async function submitted(owner: string, requestId: string, sampleId: string) {
    const scope = currentScope();
    const prior = await q(
      `SELECT j.id,j.sample_id,s.mode,s.stripe_account FROM noah_compute_jobs AS j
      JOIN noah_compute_subscriptions AS s ON s.attempt=j.contract_attempt
      WHERE j.owner_scope=? AND j.request_id=?`,
      owner,
      requestId,
    ).first<{
      id: string;
      sample_id: string;
      mode: string;
      stripe_account: string;
    }>();
    if (
      prior &&
      (prior.mode !== scope.mode || prior.stripe_account !== scope.accountId)
    )
      throw new NoahAgentError(
        'この依頼番号は別の契約環境で使われています。',
        409,
      );
    if (prior && prior.sample_id !== sampleId)
      throw new NoahAgentError('同じ依頼番号の内容を変更できません。', 409);
    return prior ? { jobId: prior.id } : null;
  }

  async function submit(
    owner: string,
    requestId: string,
    sampleId: string,
    profileRevision: number,
    now: number,
  ) {
    const scope = currentScope();
    const prior = await submitted(owner, requestId, sampleId);
    if (prior) return prior;
    const id = crypto.randomUUID();
    // The quota reservation and job creation are a single conditional write. An active
    // retry uses its original reservation. Cancellation and final expiry release unused capacity.
    const result = await q(
      `INSERT INTO noah_compute_jobs
      (id,owner_scope,request_id,sample_id,contract_attempt,workload,artifact_hash,consent_version,profile_revision,period_start,created_at,deadline,status)
      SELECT ?,s.owner_scope,?,?,s.attempt,?,?,?,?,s.period_start,?,min(s.period_end,?),'queued'
        FROM noah_compute_subscriptions AS s WHERE s.owner_scope=? AND s.mode=? AND s.stripe_account=? AND s.closed=0 AND s.status IN ('active','ending')
          AND s.period_start<=? AND s.period_end>? AND ${revisionAllowed}
          AND (SELECT count(*) FROM noah_compute_jobs WHERE owner_scope=s.owner_scope AND contract_attempt=s.attempt AND period_start=s.period_start AND ${liveReservation})<s.monthly_jobs
          AND (SELECT count(*) FROM noah_compute_jobs WHERE owner_scope=s.owner_scope AND created_at>?)<30
      ON CONFLICT(owner_scope,request_id) DO NOTHING`,
      id,
      requestId,
      sampleId,
      SHARED_WORKLOAD_VERSION,
      SHARED_WORKLOAD_SHA256,
      SHARED_COMPUTE_CONSENT,
      profileRevision,
      now,
      now + MAX_PENDING_MS,
      owner,
      scope.mode,
      scope.accountId,
      now,
      now,
      owner,
      'run',
      profileRevision,
      now,
      now,
      now - 60_000,
    ).run();
    if (result.meta.changes) return { jobId: id };
    const concurrent = await submitted(owner, requestId, sampleId);
    if (concurrent) return concurrent;
    const active = await q(
      "SELECT 1 FROM noah_compute_subscriptions WHERE owner_scope=? AND mode=? AND stripe_account=? AND closed=0 AND status IN ('active','ending') AND period_start<=? AND period_end>?",
      owner,
      scope.mode,
      scope.accountId,
      now,
      now,
    ).first();
    if (!active) throw new NoahAgentError('有効な月額プランが必要です。', 403);
    if (
      !(await q(
        `SELECT 1 WHERE ${revisionAllowed}`,
        owner,
        'run',
        profileRevision,
      ).first())
    ) {
      throw new NoahAgentError(
        '委任の設定が更新されました。確認して新しく依頼してください。',
        409,
      );
    }
    throw new NoahAgentError('依頼枠または短時間の受付上限に達しました。', 429);
  }

  async function cancel(owner: string, jobId: string, now: number) {
    const changed = await q(
      `UPDATE noah_compute_jobs SET status='cancelled',finished_at=COALESCE(finished_at,?)
      WHERE id=? AND owner_scope=? AND status IN ('queued','leased','cancelled')`,
      now,
      jobId,
      owner,
    ).run();
    if (!changed.meta.changes)
      throw new NoahAgentError('取り消せる依頼が見つかりません。', 404);
    return { ok: true };
  }

  async function authenticateDevice(
    id: string,
    token: string,
  ): Promise<Device> {
    const scope = currentScope();
    const hash = await tokenHash(token);
    const row = await q(
      'SELECT owner_scope FROM noah_compute_devices WHERE id=? AND token_hash=? AND revoked_at IS NULL AND consent_version=? AND mode=? AND stripe_account=?',
      id,
      hash,
      SHARED_COMPUTE_CONSENT,
      scope.mode,
      scope.accountId,
    ).first<{ owner_scope: string }>();
    if (!row)
      throw new NoahAgentError('この端末の参加資格を確認できません。', 403);
    return { id, tokenHash: hash, ownerScope: row.owner_scope };
  }

  function deviceBindings(d: Device) {
    return [d.id, d.tokenHash, SHARED_COMPUTE_CONSENT];
  }

  async function claim(d: Device, now: number) {
    // Replayed claims cannot create a second active lease on the device. Return only fixed
    // sample identity or bounded vocabulary counts; private text and account details never go to the host.
    const row = await q(
      `UPDATE noah_compute_jobs AS j SET status='leased',device_id=?,lease_id=?,lease_start=?,
        lease_until=min(?,deadline),attempts=attempts+1
      WHERE id=(SELECT j.id FROM noah_compute_jobs AS j
        WHERE created_at>? AND (status='queued' OR (status='leased' AND lease_until<=?)) AND deadline>? AND attempts<3
          AND owner_scope<>? AND consent_version=? AND workload=? AND artifact_hash=? AND ${activePeriod}
        ORDER BY created_at,j.id LIMIT 1)
        AND ${activeDevice} AND NOT EXISTS (SELECT 1 FROM noah_compute_jobs WHERE device_id=? AND status='leased' AND lease_until>?)
      RETURNING ${leaseColumns}`,
      d.id,
      crypto.randomUUID(),
      now,
      now + LEASE_MS,
      now - MAX_PENDING_MS,
      now,
      now,
      d.ownerScope,
      SHARED_COMPUTE_CONSENT,
      SHARED_WORKLOAD_VERSION,
      SHARED_WORKLOAD_SHA256,
      now,
      now,
      currentScope().mode,
      currentScope().accountId,
      ...deviceBindings(d),
      d.id,
      now,
    ).first<Lease>();
    return { lease: row };
  }

  const liveLease = `id=? AND lease_id=? AND device_id=? AND status='leased' AND lease_until>? AND deadline>?
    AND ${activeDevice} AND ${activePeriod}`;
  const leaseBindings = (d: Device, id: string, lease: string, now: number) => [
    id,
    lease,
    d.id,
    now,
    now,
    ...deviceBindings(d),
    now,
    now,
    currentScope().mode,
    currentScope().accountId,
  ];
  async function heartbeat(d: Device, id: string, lease: string, now: number) {
    const update = await q(
      `UPDATE noah_compute_jobs AS j SET lease_until=min(?,lease_start+?,deadline)
      WHERE ${liveLease} RETURNING lease_until AS expiresAt`,
      now + LEASE_MS,
      MAX_RUN_MS,
      ...leaseBindings(d, id, lease, now),
    ).first<{ expiresAt: number }>();
    if (!update) throw missingLease();
    return update;
  }

  async function release(d: Device, id: string, lease: string, now: number) {
    await q(
      `UPDATE noah_compute_jobs SET status=CASE WHEN attempts>=3 THEN 'expired' ELSE 'queued' END,lease_until=?
      WHERE id=? AND lease_id=? AND device_id=? AND status='leased' AND ${activeDevice}`,
      now,
      id,
      lease,
      d.id,
      ...deviceBindings(d),
    ).run();
    return { ok: true };
  }

  async function complete(
    d: Device,
    id: string,
    lease: string,
    result: Record<string, unknown>,
    elapsedMs: number,
    now: number,
  ) {
    const read = () =>
      q(
        'SELECT status,sample_id,receipt_id,artifact_hash FROM noah_compute_jobs WHERE id=? AND device_id=? AND lease_id=?',
        id,
        d.id,
        lease,
      ).first<{
        status: string;
        sample_id: string;
        receipt_id: string | null;
        artifact_hash: string;
      }>();
    const row = await read();
    if (!row || row.artifact_hash !== SHARED_WORKLOAD_SHA256)
      throw missingLease();
    const expected = evaluateSharedSample(row.sample_id);
    if (result.label !== expected.label || result.score !== expected.score)
      throw new NoahAgentError('独立検証で結果が一致しません。', 422);
    if (row.status === 'completed') return { receiptId: row.receipt_id };
    // The device reports compute time. It must fit the fixed operation cap and the
    // independently observed lease interval (one millisecond for rounding).
    const receiptId = crypto.randomUUID();
    const update = await q(
      `UPDATE noah_compute_jobs AS j SET status='completed',receipt_id=?,result_label=?,result_score=?,elapsed_ms=?,finished_at=?
      WHERE ${liveLease} AND ? <= ? - lease_start + 1`,
      receiptId,
      expected.label,
      expected.score,
      elapsedMs,
      now,
      ...leaseBindings(d, id, lease, now),
      elapsedMs,
      now,
    ).run();
    if (update.meta.changes) return { receiptId };
    // A racing duplicate may have committed the same verified result first.
    const after = await read();
    if (after?.status === 'completed') return { receiptId: after.receipt_id };
    throw missingLease();
  }
  return {
    status,
    enroll,
    revoke,
    submit,
    cancel,
    authenticateDevice,
    claim,
    heartbeat,
    release,
    complete,
  };
}
