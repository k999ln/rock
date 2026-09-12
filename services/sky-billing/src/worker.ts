import { verifyBillingToken } from '../../../lib/billing-token.ts';
import {
  periodForUnix,
  SETTLEMENT_CURRENCY,
  SKY_MONTHLY_FEE_CAP_MINOR,
  validateEarningReceipt,
  type EarningReceipt,
} from './domain.ts';
import { verifyReceiptSignature } from './receipt-signature.ts';

export interface Env {
  DB: D1Database;
  BILLING_SHARED_SECRET: string;
  SETTLEMENT_INGEST_SECRET: string;
  SKY_ORIGIN: string;
}

function configuration(env: Env) {
  const sky = new URL(env.SKY_ORIGIN);
  if (
    sky.protocol !== 'https:' ||
    env.BILLING_SHARED_SECRET.length < 32 ||
    env.SETTLEMENT_INGEST_SECRET.length < 32
  )
    throw new Error('SETTLEMENT_CONFIGURATION_INVALID');
  return { skyOrigin: sky.origin };
}

function cors(origin: string) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization,content-type',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
}

function response(value: unknown, status = 200, origin?: string) {
  return Response.json(value, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      ...(origin ? cors(origin) : {}),
    },
  });
}

function bearer(request: Request) {
  const authorization = request.headers.get('authorization') ?? '';
  const match = /^Bearer ([A-Za-z0-9._-]+)$/u.exec(authorization);
  if (!match) throw new Error('UNAUTHORIZED');
  return match[1];
}

async function authorizeUser(request: Request, env: Env) {
  const { skyOrigin } = configuration(env);
  if (request.headers.get('origin') !== skyOrigin) throw new Error('ORIGIN');
  return {
    origin: skyOrigin,
    token: await verifyBillingToken(bearer(request), env.BILLING_SHARED_SECRET),
  };
}

async function status(request: Request, env: Env) {
  const { origin, token } = await authorizeUser(request, env);
  const period = periodForUnix(Math.floor(Date.now() / 1000));
  const settlement = await env.DB.prepare(
    `SELECT gross_minor AS grossMinor, operating_cost_minor AS operatingCostMinor,
      sky_fee_minor AS skyFeeMinor, distributable_minor AS distributableMinor,
      receipt_count AS receiptCount, updated_at AS updatedAt
     FROM monthly_earning_settlements
     WHERE user_id=? AND period=? AND currency=?`,
  )
    .bind(token.sub, period, SETTLEMENT_CURRENCY)
    .first();
  const receipts = await env.DB.prepare(
    `SELECT r.receipt_id AS receiptId, r.execution_receipt_id AS executionReceiptId,
      r.source_provider AS sourceProvider, r.gross_minor AS grossMinor,
      r.operating_cost_minor AS operatingCostMinor, r.sky_fee_minor AS skyFeeMinor,
      r.distributable_minor AS distributableMinor, r.occurred_at AS occurredAt,
      p.status AS payoutStatus
     FROM earning_receipts r
     LEFT JOIN payout_instructions p ON p.receipt_id=r.receipt_id
     WHERE r.user_id=? AND r.period=? AND r.applied_at IS NOT NULL
     ORDER BY r.occurred_at DESC, r.receipt_id DESC LIMIT 20`,
  )
    .bind(token.sub, period)
    .all();
  const current = settlement ?? {
    grossMinor: 0,
    operatingCostMinor: 0,
    skyFeeMinor: 0,
    distributableMinor: 0,
    receiptCount: 0,
    updatedAt: null,
  };
  return response(
    {
      policy: {
        mode: 'verified_earnings_only',
        currency: SETTLEMENT_CURRENCY,
        monthlyFeeCapMinor: SKY_MONTHLY_FEE_CAP_MINOR,
        upfrontCharge: false,
        debtCarry: false,
        tobFeeMinor: 0,
      },
      period,
      settlement: {
        ...current,
        remainingFeeCapMinor: Math.max(
          0,
          SKY_MONTHLY_FEE_CAP_MINOR -
            Number((current as { skyFeeMinor?: number }).skyFeeMinor ?? 0),
        ),
      },
      receipts: receipts.results,
    },
    200,
    origin,
  );
}

type StoredReceipt = {
  receipt_id: string;
  execution_receipt_id: string;
  user_id: string;
  beneficiary_role: string;
  source_provider: string;
  provider_reference: string;
  payout_account_id: string;
  evidence_sha256: string;
  currency: string;
  gross_minor: number;
  operating_cost_minor: number;
  occurred_at: number;
  applied_at: number | null;
};

function sameReceipt(stored: StoredReceipt, receipt: EarningReceipt) {
  return (
    stored.receipt_id === receipt.receiptId &&
    stored.execution_receipt_id === receipt.executionReceiptId &&
    stored.user_id === receipt.userId &&
    stored.beneficiary_role === receipt.beneficiaryRole &&
    stored.source_provider === receipt.sourceProvider &&
    stored.provider_reference === receipt.providerReference &&
    stored.payout_account_id === receipt.payoutAccountId &&
    stored.evidence_sha256 === receipt.evidenceSha256 &&
    stored.currency === receipt.currency &&
    stored.gross_minor === receipt.grossAmountMinor &&
    stored.operating_cost_minor === receipt.operatingCostMinor &&
    stored.occurred_at === receipt.occurredAt
  );
}

async function storedReceipt(db: D1Database, receipt: EarningReceipt) {
  return db
    .prepare(
      `SELECT * FROM earning_receipts
       WHERE receipt_id=? OR execution_receipt_id=?
         OR (source_provider=? AND provider_reference=?) LIMIT 1`,
    )
    .bind(
      receipt.receiptId,
      receipt.executionReceiptId,
      receipt.sourceProvider,
      receipt.providerReference,
    )
    .first<StoredReceipt>();
}

async function receiptResult(db: D1Database, receiptId: string) {
  return db
    .prepare(
      `SELECT r.receipt_id AS receiptId, r.execution_receipt_id AS executionReceiptId,
        r.user_id AS userId, r.beneficiary_role AS beneficiaryRole,
        r.period, r.currency, r.gross_minor AS grossMinor,
        r.operating_cost_minor AS operatingCostMinor,
        r.sky_fee_minor AS skyFeeMinor, r.distributable_minor AS distributableMinor,
        r.applied_at AS appliedAt, p.instruction_id AS payoutInstructionId,
        p.status AS payoutStatus
       FROM earning_receipts r
       LEFT JOIN payout_instructions p ON p.receipt_id=r.receipt_id
       WHERE r.receipt_id=?`,
    )
    .bind(receiptId)
    .first();
}

async function ingest(request: Request, env: Env) {
  configuration(env);
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > 65_536)
    return response({ error: 'payload_too_large' }, 413);
  await verifyReceiptSignature(
    raw,
    request.headers.get('sky-receipt-signature'),
    env.SETTLEMENT_INGEST_SECRET,
  );
  const receipt = validateEarningReceipt(JSON.parse(raw) as unknown);
  const now = Math.floor(Date.now() / 1000);
  if (receipt.occurredAt > now + 300)
    throw new Error('EARNING_RECEIPT_OCCURRED_AT_INVALID');
  const period = periodForUnix(receipt.occurredAt);
  const inserted = await env.DB.prepare(
    `INSERT OR IGNORE INTO earning_receipts(
      receipt_id,execution_receipt_id,user_id,beneficiary_role,source_provider,
      provider_reference,payout_account_id,evidence_sha256,currency,gross_minor,
      operating_cost_minor,sky_fee_minor,distributable_minor,period,occurred_at,
      received_at,applied_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,0,0,?,?,?,NULL)`,
  )
    .bind(
      receipt.receiptId,
      receipt.executionReceiptId,
      receipt.userId,
      receipt.beneficiaryRole,
      receipt.sourceProvider,
      receipt.providerReference,
      receipt.payoutAccountId,
      receipt.evidenceSha256,
      receipt.currency,
      receipt.grossAmountMinor,
      receipt.operatingCostMinor,
      period,
      receipt.occurredAt,
      now,
    )
    .run();
  const stored = await storedReceipt(env.DB, receipt);
  if (!stored || !sameReceipt(stored, receipt))
    throw new Error('EARNING_RECEIPT_CONFLICT');
  if (stored.applied_at !== null)
    return response(
      { receipt: await receiptResult(env.DB, receipt.receiptId), replay: true },
      200,
    );

  const feeExpression = `CASE WHEN beneficiary_role='toc' THEN
    MIN(gross_minor-operating_cost_minor,
      MAX(0, ${SKY_MONTHLY_FEE_CAP_MINOR}-COALESCE((
        SELECT sky_fee_minor FROM monthly_earning_settlements s
        WHERE s.user_id=earning_receipts.user_id
          AND s.period=earning_receipts.period
          AND s.currency=earning_receipts.currency
      ),0))) ELSE 0 END`;
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE earning_receipts SET sky_fee_minor=${feeExpression}
       WHERE receipt_id=? AND applied_at IS NULL`,
    ).bind(receipt.receiptId),
    env.DB.prepare(
      `UPDATE earning_receipts
       SET distributable_minor=gross_minor-operating_cost_minor-sky_fee_minor
       WHERE receipt_id=? AND applied_at IS NULL`,
    ).bind(receipt.receiptId),
    env.DB.prepare(
      `INSERT INTO monthly_earning_settlements(
        user_id,period,currency,gross_minor,operating_cost_minor,sky_fee_minor,
        distributable_minor,receipt_count,updated_at
      ) SELECT user_id,period,currency,gross_minor,operating_cost_minor,
          sky_fee_minor,distributable_minor,1,?
        FROM earning_receipts WHERE receipt_id=? AND applied_at IS NULL
       ON CONFLICT(user_id,period,currency) DO UPDATE SET
        gross_minor=monthly_earning_settlements.gross_minor+excluded.gross_minor,
        operating_cost_minor=monthly_earning_settlements.operating_cost_minor+excluded.operating_cost_minor,
        sky_fee_minor=monthly_earning_settlements.sky_fee_minor+excluded.sky_fee_minor,
        distributable_minor=monthly_earning_settlements.distributable_minor+excluded.distributable_minor,
        receipt_count=monthly_earning_settlements.receipt_count+1,
        updated_at=excluded.updated_at`,
    ).bind(now, receipt.receiptId),
    env.DB.prepare(
      `INSERT OR IGNORE INTO earning_ledger_entries(
        entry_id,receipt_id,user_id,period,account,direction,amount_minor,currency,created_at
      ) SELECT receipt_id||':gross',receipt_id,user_id,period,'AUTOMATION_REVENUE','credit',gross_minor,currency,?
        FROM earning_receipts WHERE receipt_id=? AND applied_at IS NULL AND gross_minor>0`,
    ).bind(now, receipt.receiptId),
    env.DB.prepare(
      `INSERT OR IGNORE INTO earning_ledger_entries(
        entry_id,receipt_id,user_id,period,account,direction,amount_minor,currency,created_at
      ) SELECT receipt_id||':cost',receipt_id,user_id,period,'OPERATING_COST','debit',operating_cost_minor,currency,?
        FROM earning_receipts WHERE receipt_id=? AND applied_at IS NULL AND operating_cost_minor>0`,
    ).bind(now, receipt.receiptId),
    env.DB.prepare(
      `INSERT OR IGNORE INTO earning_ledger_entries(
        entry_id,receipt_id,user_id,period,account,direction,amount_minor,currency,created_at
      ) SELECT receipt_id||':sky',receipt_id,user_id,period,'SKY_SERVICE_FEE','debit',sky_fee_minor,currency,?
        FROM earning_receipts WHERE receipt_id=? AND applied_at IS NULL AND sky_fee_minor>0`,
    ).bind(now, receipt.receiptId),
    env.DB.prepare(
      `INSERT OR IGNORE INTO earning_ledger_entries(
        entry_id,receipt_id,user_id,period,account,direction,amount_minor,currency,created_at
      ) SELECT receipt_id||':payable',receipt_id,user_id,period,'BENEFICIARY_PAYABLE','credit',distributable_minor,currency,?
        FROM earning_receipts WHERE receipt_id=? AND applied_at IS NULL AND distributable_minor>0`,
    ).bind(now, receipt.receiptId),
    env.DB.prepare(
      `INSERT OR IGNORE INTO payout_instructions(
        instruction_id,receipt_id,user_id,payout_account_id,amount_minor,currency,
        status,idempotency_key,created_at,updated_at
      ) SELECT 'pay:'||receipt_id,receipt_id,user_id,payout_account_id,
          distributable_minor,currency,
          CASE WHEN distributable_minor>0 THEN 'ready' ELSE 'not_required' END,
          'sky-payout-'||receipt_id,?,?
        FROM earning_receipts WHERE receipt_id=? AND applied_at IS NULL`,
    ).bind(now, now, receipt.receiptId),
    env.DB.prepare(
      `UPDATE earning_receipts SET applied_at=?
       WHERE receipt_id=? AND applied_at IS NULL`,
    ).bind(now, receipt.receiptId),
  ]);
  return response(
    {
      receipt: await receiptResult(env.DB, receipt.receiptId),
      replay: (inserted.meta.changes ?? 0) === 0,
    },
    (inserted.meta.changes ?? 0) === 1 ? 201 : 200,
  );
}

async function signedInput(request: Request, env: Env) {
  configuration(env);
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > 16_384)
    throw new Error('SIGNED_INPUT_TOO_LARGE');
  await verifyReceiptSignature(
    raw,
    request.headers.get('sky-receipt-signature'),
    env.SETTLEMENT_INGEST_SECRET,
  );
  const value = JSON.parse(raw) as unknown;
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('PAYOUT_INPUT_INVALID');
  return value as Record<string, unknown>;
}

type PayoutInstruction = {
  instructionId: string;
  receiptId: string;
  userId: string;
  payoutAccountId: string;
  amountMinor: number;
  currency: string;
  status: string;
  idempotencyKey: string;
  leaseId: string | null;
  leaseExpiresAt: number | null;
  providerTransferReference: string | null;
};

async function payoutInstruction(db: D1Database, instructionId: string) {
  return db
    .prepare(
      `SELECT instruction_id AS instructionId,receipt_id AS receiptId,
        user_id AS userId,payout_account_id AS payoutAccountId,
        amount_minor AS amountMinor,currency,status,
        idempotency_key AS idempotencyKey,lease_id AS leaseId,
        lease_expires_at AS leaseExpiresAt,
        provider_transfer_reference AS providerTransferReference
       FROM payout_instructions WHERE instruction_id=?`,
    )
    .bind(instructionId)
    .first<PayoutInstruction>();
}

async function claimPayout(request: Request, env: Env) {
  const input = await signedInput(request, env);
  if (
    Object.keys(input).some((key) => key !== 'adapterId') ||
    typeof input.adapterId !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/u.test(input.adapterId)
  )
    throw new Error('PAYOUT_INPUT_INVALID');
  const now = Math.floor(Date.now() / 1000);
  const candidate = await env.DB.prepare(
    `SELECT instruction_id AS instructionId FROM payout_instructions
     WHERE status='ready' OR (status='processing' AND lease_expires_at<?)
     ORDER BY created_at, instruction_id LIMIT 1`,
  )
    .bind(now)
    .first<{ instructionId: string }>();
  if (!candidate) return response({ instruction: null });
  const leaseId = crypto.randomUUID();
  const claimed = await env.DB.prepare(
    `UPDATE payout_instructions SET status='processing',lease_id=?,
      lease_expires_at=?,updated_at=?
     WHERE instruction_id=? AND
      (status='ready' OR (status='processing' AND lease_expires_at<?))`,
  )
    .bind(leaseId, now + 300, now, candidate.instructionId, now)
    .run();
  if ((claimed.meta.changes ?? 0) !== 1)
    throw new Error('PAYOUT_CLAIM_CONFLICT');
  return response({
    instruction: await payoutInstruction(env.DB, candidate.instructionId),
  });
}

async function completePayout(request: Request, env: Env) {
  const input = await signedInput(request, env);
  if (
    Object.keys(input).some(
      (key) =>
        ![
          'instructionId',
          'leaseId',
          'status',
          'providerTransferReference',
          'errorCode',
        ].includes(key),
    ) ||
    typeof input.instructionId !== 'string' ||
    typeof input.leaseId !== 'string' ||
    !['paid', 'failed', 'unknown'].includes(String(input.status)) ||
    (input.status === 'paid' &&
      (typeof input.providerTransferReference !== 'string' ||
        !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u.test(
          input.providerTransferReference,
        ))) ||
    (input.errorCode !== undefined &&
      (typeof input.errorCode !== 'string' ||
        !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/u.test(input.errorCode)))
  )
    throw new Error('PAYOUT_INPUT_INVALID');
  const now = Math.floor(Date.now() / 1000);
  const updated = await env.DB.prepare(
    `UPDATE payout_instructions SET status=?,provider_transfer_reference=?,
      last_error=?,lease_id=NULL,lease_expires_at=NULL,updated_at=?
     WHERE instruction_id=? AND status='processing' AND lease_id=?`,
  )
    .bind(
      input.status,
      input.providerTransferReference ?? null,
      input.errorCode ?? null,
      now,
      input.instructionId,
      input.leaseId,
    )
    .run();
  const instruction = await payoutInstruction(env.DB, input.instructionId);
  if ((updated.meta.changes ?? 0) !== 1) {
    if (
      instruction &&
      instruction.status === input.status &&
      instruction.providerTransferReference ===
        (input.providerTransferReference ?? null)
    )
      return response({ instruction, replay: true });
    throw new Error('PAYOUT_RESULT_CONFLICT');
  }
  return response({ instruction, replay: false });
}

function retired(origin?: string) {
  return response(
    {
      error:
        '先払いの月額契約は廃止しました。Skyは検証済み自動化収益からだけ最大$8.88を精算します。',
      code: 'UPFRONT_BILLING_RETIRED',
    },
    410,
    origin,
  );
}

function errorResponse(error: unknown, origin?: string) {
  const message = error instanceof Error ? error.message : '';
  const status =
    message === 'UNAUTHORIZED' || message.startsWith('TOKEN_')
      ? 401
      : message === 'ORIGIN'
        ? 403
        : message === 'EARNING_RECEIPT_CONFLICT' ||
            message === 'PAYOUT_CLAIM_CONFLICT' ||
            message === 'PAYOUT_RESULT_CONFLICT'
          ? 409
          : message.includes('SIGNATURE')
            ? 401
            : message.startsWith('EARNING_RECEIPT_') ||
                message === 'PAYOUT_INPUT_INVALID' ||
                message === 'SIGNED_INPUT_TOO_LARGE' ||
                message === 'SETTLEMENT_PREVIOUS_FEE_INVALID' ||
                error instanceof SyntaxError
              ? 400
              : message === 'SETTLEMENT_CONFIGURATION_INVALID'
                ? 503
                : 500;
  return response(
    {
      error:
        status === 401
          ? '署名または認証を確認できません。'
          : status === 403
            ? 'Sky以外から利用者情報を参照できません。'
            : status === 409
              ? '同じ実行・入金参照に異なる内容のReceiptがあります。'
              : status === 503
                ? '収益精算サービスの設定が完了していません。'
                : status === 400
                  ? 'Earning Receiptの内容を確認できません。'
                  : '収益精算を完了できませんでした。',
    },
    status,
    origin,
  );
}

export default {
  async fetch(request, env) {
    let origin: string | undefined;
    try {
      const { skyOrigin } = configuration(env);
      origin =
        request.headers.get('origin') === skyOrigin ? skyOrigin : undefined;
      const url = new URL(request.url);
      if (request.method === 'OPTIONS') {
        if (!origin) return new Response(null, { status: 403 });
        return new Response(null, { status: 204, headers: cors(origin) });
      }
      if (request.method === 'GET' && url.pathname === '/health')
        return response({
          ok: true,
          mode: 'verified_earnings_only',
          monthlyFeeCapMinor: SKY_MONTHLY_FEE_CAP_MINOR,
          currency: SETTLEMENT_CURRENCY,
        });
      if (request.method === 'GET' && url.pathname === '/v1/status')
        return await status(request, env);
      if (request.method === 'POST' && url.pathname === '/v1/earnings')
        return await ingest(request, env);
      if (request.method === 'POST' && url.pathname === '/v1/payouts/claim')
        return await claimPayout(request, env);
      if (request.method === 'POST' && url.pathname === '/v1/payouts/result')
        return await completePayout(request, env);
      if (
        request.method === 'POST' &&
        ['/v1/checkout', '/v1/portal', '/v1/webhooks/stripe'].includes(
          url.pathname,
        )
      )
        return retired(origin);
      return response({ error: 'not_found' }, 404, origin);
    } catch (error) {
      return errorResponse(error, origin);
    }
  },
} satisfies ExportedHandler<Env>;
