import type { BillingScope } from './noah-shared-compute-plan.ts';
import { PILOT_JOB_LIMIT, type ComputePilot } from './noah-compute-pilot.ts';
import { NoahAgentError, noahSha256 } from './noah-agent-upload.ts';
import {
  EVE_AGENT_SHA256,
  EVE_WORKLOAD,
  normalizeEveRecipe,
  runEveAgents,
} from './noah-eve-participant.ts';
import {
  evaluateSharedSample,
  sharedTopicTitle,
  SHARED_WORKLOAD_SHA256,
  SHARED_WORKLOAD_VERSION,
} from './noah-shared-workload.ts';

export const SHARED_COMPUTE_CONSENT = 'shared-compute-v2';
export const EVE_COMPUTE_CONSENT = 'eve-participant-v1';
const LEASE_MS = 4_000;
const MAX_RUN_MS = 20_000;
const MAX_PENDING_MS = 15 * 60_000;
const missingLease = () =>
  new NoahAgentError(
    'この割り当ては終了しました。端末の計算を停止してください。',
    409,
  );
type Database = Pick<D1Database, 'prepare' | 'batch'>;
type Scope = { mode: 'pilot' | 'test' | 'live'; accountId: string };
type Device = {
  id: string;
  tokenHash: string;
  ownerScope: string;
  consent: string;
  scope: Scope;
};
type Lease = {
  jobId: string;
  leaseId: string;
  sampleId: string;
  workload: string;
  artifactSha256: string;
  expiresAt: number;
  recipeJson: string | null;
};
type Recipe = ReturnType<typeof normalizeEveRecipe>;
type Bind = string | number;
const hash = (text: string) => noahSha256(new TextEncoder().encode(text));
const activeDevice = `EXISTS (SELECT 1 FROM noah_compute_devices WHERE id=? AND token_hash=? AND revoked_at IS NULL AND consent_version=?)`;
const liveReservation = `(status='completed' OR (deadline>? AND (status='queued' OR (status='leased' AND (attempts<3 OR lease_until>?)))))`;
const revisionAllowed = `NOT EXISTS (SELECT 1 FROM noah_compute_delegation_fences WHERE owner_scope=? AND action=? AND min_revision>?)`;
const noAdmission = () =>
  new NoahAgentError('このアカウントでの参加型計算は受付していません。', 403);

// Pending public manuscripts are never returned after their deadline. The indexed sweep
// also erases them on the scheduled cleanup and on the next authenticated queue access.
export async function purgeExpiredEveComputeInputs(db: Database, now: number) {
  await db
    .prepare(`UPDATE noah_compute_chain_payloads SET recipe_json=NULL
    WHERE recipe_json IS NOT NULL AND expires_at<=?`)
    .bind(now)
    .run();
}

export function createSharedComputeStore(
  db: Database,
  billing: BillingScope | null,
  pilot: ComputePilot | null = null,
  paidEve = false,
) {
  const q = (sql: string, ...bindings: Bind[]) =>
    db.prepare(sql).bind(...bindings);
  const pilotFor = (owner: string, now: number) =>
    pilot && now < pilot.expiresAt && pilot.owners.includes(owner)
      ? pilot
      : null;
  function selectScope(owner: string, now: number, chain: boolean): Scope {
    const trial = chain && pilotFor(owner, now);
    if (trial) return { mode: 'pilot', accountId: trial.id };
    if (!billing && !chain)
      throw new NoahAgentError('参加端末の受付は準備中です。', 503);
    if (!billing || (chain && !paidEve)) throw noAdmission();
    return billing;
  }

  // One grant is a verified monthly subscription or an expiring operator-configured pilot
  // allocation. A pilot uses this transient relation, never a payment/subscription row.
  function grants(scope: Scope) {
    if (scope.mode === 'pilot') {
      if (!pilot || pilot.id !== scope.accountId) throw noAdmission();
      return {
        sql: `SELECT ? AS owner_scope,? AS attempt,0 AS period_start,? AS period_end,? AS monthly_jobs
        UNION ALL SELECT ?,?,0,?,?`,
        bind: pilot.owners.flatMap((owner) => [
          owner,
          pilot.id,
          pilot.expiresAt,
          PILOT_JOB_LIMIT,
        ]),
      };
    }
    return {
      sql: `SELECT owner_scope,attempt,period_start,period_end,monthly_jobs FROM noah_compute_subscriptions
      WHERE mode=? AND stripe_account=? AND closed=0 AND status IN ('active','ending')`,
      bind: [scope.mode, scope.accountId],
    };
  }
  const validPeriod = (
    g: ReturnType<typeof grants>,
  ) => `EXISTS (SELECT 1 FROM (${g.sql}) AS s WHERE s.attempt=j.contract_attempt
    AND s.owner_scope=j.owner_scope AND s.period_start=j.period_start AND s.period_start<=? AND s.period_end>?)`;
  const visible = `(j.contract_attempt=? OR EXISTS(SELECT 1 FROM noah_compute_subscriptions AS s WHERE s.attempt=j.contract_attempt AND s.mode=? AND s.stripe_account=?))`;
  function visibility(owner: string) {
    return [
      pilot?.owners.includes(owner) ? pilot.id : '',
      billing?.mode ?? '',
      billing?.accountId ?? '',
    ];
  }
  async function status(owner: string, now: number, requestId?: string) {
    const trial = pilotFor(owner, now);
    const [devices, jobs, entitled] = await Promise.all([
      q(
        'SELECT id,enrolled_at AS enrolledAt,revoked_at,mode,stripe_account,consent_version FROM noah_compute_devices WHERE owner_scope=? ORDER BY revoked_at IS NOT NULL,enrolled_at DESC LIMIT 50',
        owner,
      ).all<{
        id: string;
        enrolledAt: number;
        revoked_at: number | null;
        mode: Scope['mode'];
        stripe_account: string;
        consent_version: string;
      }>(),
      q(
        `SELECT j.id,j.request_id AS requestId,j.sample_id AS sampleId,j.workload,j.created_at AS createdAt,j.receipt_id AS receiptId,j.result_label,j.result_score,c.result_json,
        CASE WHEN j.status IN ('queued','leased') AND (j.deadline<=? OR (j.attempts>=3 AND j.lease_until<=?) OR
          (j.contract_attempt<>? AND NOT EXISTS (SELECT 1 FROM noah_compute_subscriptions s WHERE s.attempt=j.contract_attempt AND s.period_start=j.period_start AND s.closed=0 AND s.status IN ('active','ending')))) THEN 'expired'
          WHEN j.status='leased' AND j.lease_until<=? THEN 'queued' ELSE j.status END AS status
        FROM noah_compute_jobs j LEFT JOIN noah_compute_chain_payloads c ON c.job_id=j.id
        WHERE j.owner_scope=? AND ${visible} ${requestId ? 'AND j.request_id=?' : ''} ORDER BY j.created_at DESC,j.rowid DESC LIMIT 50`,
        now,
        now,
        trial?.id ?? '',
        now,
        owner,
        ...visibility(owner),
        ...(requestId ? [requestId] : []),
      ).all<{
        id: string;
        requestId: string;
        sampleId: string;
        workload: string;
        createdAt: number;
        receiptId: string | null;
        result_label: string | null;
        result_score: number | null;
        result_json: string | null;
        status: string;
      }>(),
      !trial && billing && paidEve
        ? q(
            `SELECT 1 FROM noah_compute_subscriptions WHERE mode=? AND stripe_account=? AND owner_scope=?
        AND closed=0 AND status IN ('active','ending') AND period_start<=? AND period_end>?`,
            billing.mode,
            billing.accountId,
            owner,
            now,
            now,
          ).first()
        : null,
    ]);
    return {
      acceptingDevices: !!billing,
      canHostChain: !!(trial || (billing && paidEve)),
      canSubmitChain: !!(trial || entitled),
      pilot: {
        active: !!trial,
        expiresAt: trial?.expiresAt ?? null,
        jobLimit: trial ? PILOT_JOB_LIMIT : null,
      },
      devices: devices.results.map(
        ({
          id,
          enrolledAt,
          revoked_at,
          mode,
          stripe_account,
          consent_version,
        }) => ({
          id,
          enrolledAt,
          mode,
          active: revoked_at === null,
          chain: consent_version === EVE_COMPUTE_CONSENT,
          currentEnvironment:
            (mode === 'pilot' && trial?.id === stripe_account) ||
            (billing?.mode === mode && billing.accountId === stripe_account),
        }),
      ),
      jobs: jobs.results.map(
        ({ result_label, result_score, result_json, workload, ...job }) => ({
          ...job,
          title:
            workload === EVE_WORKLOAD
              ? 'EveのAgentの組み合わせ'
              : sharedTopicTitle(job.sampleId),
          inputKind:
            workload === EVE_WORKLOAD
              ? 'eve-chain'
              : job.sampleId.startsWith('terms-')
                ? 'term-counts'
                : 'sample',
          result:
            workload === EVE_WORKLOAD
              ? job.status === 'completed' && result_json
                ? JSON.parse(result_json)
                : null
              : result_label === null
                ? null
                : { label: result_label, score: result_score },
        }),
      ),
    };
  }
  function fence(
    owner: string,
    action: string,
    revision: number,
    chain: boolean,
  ) {
    return {
      sql: chain
        ? `${revisionAllowed} AND ${revisionAllowed}`
        : revisionAllowed,
      bind: chain
        ? [owner, action, revision, 'eve/' + owner, action, revision]
        : [owner, action, revision],
    };
  }
  async function enroll(
    owner: string,
    deviceId: string,
    revision: number,
    now: number,
    chain = false,
  ) {
    const scope = selectScope(owner, now, chain),
      grant = fence(owner, 'connect', revision, chain);
    const consent = chain ? EVE_COMPUTE_CONSENT : SHARED_COMPUTE_CONSENT;
    const token = crypto.randomUUID();
    const enrolled = await q(
      `INSERT INTO noah_compute_devices(id,owner_scope,token_hash,mode,stripe_account,consent_version,profile_revision,enrolled_at)
      SELECT ?,?,?,?,?,?,?,? WHERE ${grant.sql} AND (SELECT count(*) FROM noah_compute_devices WHERE owner_scope=? AND revoked_at IS NULL)<8
      ON CONFLICT(id) DO UPDATE SET token_hash=excluded.token_hash,mode=excluded.mode,stripe_account=excluded.stripe_account,consent_version=excluded.consent_version,
        profile_revision=excluded.profile_revision,enrolled_at=excluded.enrolled_at,revoked_at=NULL WHERE owner_scope=excluded.owner_scope AND revoked_at IS NOT NULL`,
      deviceId,
      owner,
      await hash(token),
      scope.mode,
      scope.accountId,
      consent,
      revision,
      now,
      ...grant.bind,
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
        `UPDATE noah_compute_jobs SET lease_until=?,status=CASE WHEN attempts>=3 THEN 'expired' ELSE 'queued' END WHERE device_id=? AND status='leased'
        AND EXISTS(SELECT 1 FROM noah_compute_devices WHERE id=? AND owner_scope=? AND revoked_at IS NOT NULL)`,
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
  async function submitted(
    owner: string,
    requestId: string,
    sampleId: string,
    scope: Scope,
  ) {
    const row = await q(
      `SELECT j.id,j.sample_id,j.contract_attempt,s.mode,s.stripe_account FROM noah_compute_jobs j LEFT JOIN noah_compute_subscriptions s ON s.attempt=j.contract_attempt
      WHERE j.owner_scope=? AND j.request_id=?`,
      owner,
      requestId,
    ).first<{
      id: string;
      sample_id: string;
      contract_attempt: string;
      mode: string | null;
      stripe_account: string | null;
    }>();
    if (
      row &&
      (scope.mode === 'pilot'
        ? row.contract_attempt !== scope.accountId
        : row.mode !== scope.mode || row.stripe_account !== scope.accountId)
    )
      throw new NoahAgentError(
        'この依頼番号は別の契約環境で使われています。',
        409,
      );
    if (row && row.sample_id !== sampleId)
      throw new NoahAgentError('同じ依頼番号の内容を変更できません。', 409);
    return row ? { jobId: row.id } : null;
  }
  async function submit(
    owner: string,
    requestId: string,
    sampleId: string,
    revision: number,
    now: number,
    recipe?: Recipe,
    funding?: 'pilot' | 'monthly',
  ) {
    const chain = !!recipe,
      scope = selectScope(owner, now, chain);
    if (chain && funding !== (scope.mode === 'pilot' ? 'pilot' : 'monthly')) {
      throw new NoahAgentError(
        '利用枠が変更されました。再読み込みして確認してください。',
        409,
      );
    }
    const prior = await submitted(owner, requestId, sampleId, scope);
    if (prior) return prior;
    const id = crypto.randomUUID(),
      g = grants(scope),
      grant = fence(owner, 'run', revision, chain);
    const insert = q(
      `INSERT INTO noah_compute_jobs(id,owner_scope,request_id,sample_id,contract_attempt,workload,artifact_hash,consent_version,profile_revision,period_start,created_at,deadline,status)
      SELECT ?,s.owner_scope,?,?,s.attempt,?,?,?,?,s.period_start,?,min(s.period_end,?),'queued' FROM (${g.sql}) s
      WHERE s.owner_scope=? AND s.period_start<=? AND s.period_end>? AND ${grant.sql}
      AND (SELECT count(*) FROM noah_compute_jobs WHERE owner_scope=s.owner_scope AND contract_attempt=s.attempt AND period_start=s.period_start AND ${liveReservation})<s.monthly_jobs
      AND (SELECT count(*) FROM noah_compute_jobs WHERE owner_scope=s.owner_scope AND created_at>?)<30
      ON CONFLICT(owner_scope,request_id) DO NOTHING`,
      id,
      requestId,
      sampleId,
      chain ? EVE_WORKLOAD : SHARED_WORKLOAD_VERSION,
      chain ? EVE_AGENT_SHA256 : SHARED_WORKLOAD_SHA256,
      chain ? EVE_COMPUTE_CONSENT : SHARED_COMPUTE_CONSENT,
      revision,
      now,
      now + MAX_PENDING_MS,
      ...g.bind,
      owner,
      now,
      now,
      ...grant.bind,
      now,
      now,
      now - 60_000,
    );
    const result = recipe
      ? (
          await db.batch([
            insert,
            q(
              `INSERT INTO noah_compute_chain_payloads(job_id,recipe_json,expires_at)
      SELECT id,?,deadline FROM noah_compute_jobs WHERE id=?`,
              JSON.stringify(recipe),
              id,
            ),
          ])
        )[0]
      : await insert.run();
    if (result.meta.changes) return { jobId: id };
    const raced = await submitted(owner, requestId, sampleId, scope);
    if (raced) return raced;
    if (
      !(await q(
        `SELECT 1 FROM (${g.sql}) s WHERE owner_scope=? AND period_start<=? AND period_end>?`,
        ...g.bind,
        owner,
        now,
        now,
      ).first())
    )
      throw new NoahAgentError('有効な利用枠が必要です。', 403);
    if (!(await q(`SELECT 1 WHERE ${grant.sql}`, ...grant.bind).first()))
      throw new NoahAgentError('委任の設定が更新されました。', 409);
    throw new NoahAgentError('依頼枠または短時間の受付上限に達しました。', 429);
  }
  async function cancel(owner: string, id: string, now: number) {
    const result = await q(
      `UPDATE noah_compute_jobs SET status='cancelled',finished_at=COALESCE(finished_at,?) WHERE id=? AND owner_scope=? AND status IN ('queued','leased','cancelled')`,
      now,
      id,
      owner,
    ).run();
    if (!result.meta.changes)
      throw new NoahAgentError('取り消せる依頼が見つかりません。', 404);
    return { ok: true };
  }
  async function authenticateDevice(
    id: string,
    token: string,
    now: number,
  ): Promise<Device> {
    const tokenHash = await hash(token);
    const row = await q(
      'SELECT owner_scope,mode,stripe_account,consent_version FROM noah_compute_devices WHERE id=? AND token_hash=? AND revoked_at IS NULL',
      id,
      tokenHash,
    ).first<{
      owner_scope: string;
      mode: Scope['mode'];
      stripe_account: string;
      consent_version: string;
    }>();
    if (
      !row ||
      ![SHARED_COMPUTE_CONSENT, EVE_COMPUTE_CONSENT].includes(
        row.consent_version,
      )
    )
      throw noAdmission();
    const scope = selectScope(
      row.owner_scope,
      now,
      row.consent_version === EVE_COMPUTE_CONSENT,
    );
    if (scope.mode !== row.mode || scope.accountId !== row.stripe_account)
      throw noAdmission();
    return {
      id,
      tokenHash,
      ownerScope: row.owner_scope,
      scope,
      consent: row.consent_version,
    };
  }
  async function claim(d: Device, now: number, chain: boolean) {
    const consent = chain ? EVE_COMPUTE_CONSENT : SHARED_COMPUTE_CONSENT;
    if (d.consent !== consent) return { lease: null };
    const g = grants(d.scope);
    const row = await q(
      `UPDATE noah_compute_jobs AS j SET status='leased',device_id=?,lease_id=?,lease_start=?,lease_until=min(?,deadline),attempts=attempts+1
      WHERE id=(SELECT j.id FROM noah_compute_jobs j WHERE created_at>? AND (status='queued' OR (status='leased' AND lease_until<=?)) AND deadline>? AND attempts<3
      AND owner_scope<>? AND consent_version=? AND workload=? AND artifact_hash=? AND ${validPeriod(g)} ORDER BY created_at,j.id LIMIT 1)
      AND ${activeDevice} AND NOT EXISTS (SELECT 1 FROM noah_compute_jobs WHERE device_id=? AND status='leased' AND lease_until>?)
      RETURNING id AS jobId,lease_id AS leaseId,sample_id AS sampleId,workload,artifact_hash AS artifactSha256,lease_until AS expiresAt,
        (SELECT recipe_json FROM noah_compute_chain_payloads c WHERE c.job_id=noah_compute_jobs.id) AS recipeJson`,
      d.id,
      crypto.randomUUID(),
      now,
      now + LEASE_MS,
      now - MAX_PENDING_MS,
      now,
      now,
      d.ownerScope,
      consent,
      chain ? EVE_WORKLOAD : SHARED_WORKLOAD_VERSION,
      chain ? EVE_AGENT_SHA256 : SHARED_WORKLOAD_SHA256,
      ...g.bind,
      now,
      now,
      d.id,
      d.tokenHash,
      d.consent,
      d.id,
      now,
    ).first<Lease>();
    if (!row) return { lease: null };
    const { recipeJson, ...lease } = row;
    if (!chain) return { lease };
    if (!recipeJson) throw missingLease();
    return { lease: { ...lease, recipe: JSON.parse(recipeJson) } };
  }
  function liveLease(d: Device, id: string, lease: string, now: number) {
    const g = grants(d.scope);
    return {
      sql: `j.id=? AND j.lease_id=? AND j.device_id=? AND j.status='leased' AND j.lease_until>? AND j.deadline>? AND ${activeDevice} AND ${validPeriod(g)}`,
      bind: [
        id,
        lease,
        d.id,
        now,
        now,
        d.id,
        d.tokenHash,
        d.consent,
        ...g.bind,
        now,
        now,
      ],
    };
  }
  async function heartbeat(d: Device, id: string, lease: string, now: number) {
    const live = liveLease(d, id, lease, now);
    const row = await q(
      `UPDATE noah_compute_jobs AS j SET lease_until=min(?,lease_start+?,deadline) WHERE ${live.sql} RETURNING lease_until AS expiresAt`,
      now + LEASE_MS,
      MAX_RUN_MS,
      ...live.bind,
    ).first<{ expiresAt: number }>();
    if (!row) throw missingLease();
    return row;
  }
  async function release(d: Device, id: string, lease: string, now: number) {
    await q(
      `UPDATE noah_compute_jobs SET status=CASE WHEN attempts>=3 THEN 'expired' ELSE 'queued' END,lease_until=? WHERE id=? AND lease_id=? AND device_id=? AND status='leased' AND ${activeDevice}`,
      now,
      id,
      lease,
      d.id,
      d.id,
      d.tokenHash,
      d.consent,
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
        `SELECT j.status,j.sample_id,j.receipt_id,j.workload,j.artifact_hash,c.recipe_json,c.result_json FROM noah_compute_jobs j
      LEFT JOIN noah_compute_chain_payloads c ON c.job_id=j.id WHERE j.id=? AND j.device_id=? AND j.lease_id=?`,
        id,
        d.id,
        lease,
      ).first<{
        status: string;
        sample_id: string;
        receipt_id: string | null;
        workload: string;
        artifact_hash: string;
        recipe_json: string | null;
        result_json: string | null;
      }>();
    const row = await read();
    if (!row) throw missingLease();
    const chain = row.workload === EVE_WORKLOAD;
    if (
      row.artifact_hash !==
        (chain ? EVE_AGENT_SHA256 : SHARED_WORKLOAD_SHA256) ||
      d.consent !== (chain ? EVE_COMPUTE_CONSENT : SHARED_COMPUTE_CONSENT)
    )
      throw missingLease();
    let label: string,
      score: number,
      rendered: string | null = null;
    const mismatch = () =>
      new NoahAgentError('独立検証で結果が一致しません。', 422);
    if (chain) {
      if (!row.recipe_json && (row.status !== 'completed' || !row.result_json))
        throw missingLease();
      const expected = row.recipe_json
        ? runEveAgents(normalizeEveRecipe(JSON.parse(row.recipe_json)))
        : JSON.parse(row.result_json!);
      if (
        result.text !== expected.text ||
        !Array.isArray(result.steps) ||
        JSON.stringify(result.steps) !== JSON.stringify(expected.steps)
      )
        throw mismatch();
      rendered = JSON.stringify({ text: expected.text, steps: expected.steps });
      label = EVE_WORKLOAD;
      score = expected.steps.length;
    } else {
      const expected = evaluateSharedSample(row.sample_id);
      if (result.label !== expected.label || result.score !== expected.score)
        throw mismatch();
      label = expected.label;
      score = expected.score;
    }
    if (row.status === 'completed') return { receiptId: row.receipt_id };
    const receiptId = crypto.randomUUID(),
      live = liveLease(d, id, lease, now);
    const update = q(
      `UPDATE noah_compute_jobs AS j SET status='completed',receipt_id=?,result_label=?,result_score=?,elapsed_ms=?,finished_at=? WHERE ${live.sql} AND ?<=?-lease_start+1`,
      receiptId,
      label,
      score,
      elapsedMs,
      now,
      ...live.bind,
      elapsedMs,
      now,
    );
    const saved = chain
      ? (
          await db.batch([
            update,
            q(
              `UPDATE noah_compute_chain_payloads SET result_json=? WHERE job_id=? AND EXISTS
      (SELECT 1 FROM noah_compute_jobs WHERE id=? AND receipt_id=?)`,
              rendered!,
              id,
              id,
              receiptId,
            ),
          ])
        )[0]
      : await update.run();
    if (saved.meta.changes) return { receiptId };
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
