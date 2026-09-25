import { verifyBillingToken } from '../../../lib/billing-token.ts';
import {
  BASE_MAINNET_CHAIN_ID,
  BASE_MAINNET_RPC_URL,
  BASE_USDC_ADDRESS,
  createRockWalletConsentMessage,
  normalizeBaseChainId,
  normalizeTransactionHash,
  normalizeWalletAddress,
  ROCK_WALLET_CONSENT_VERSION,
  ROCK_WALLET_PROVIDER_ID,
  verifyBaseUsdcCollection,
  verifyRockWalletConsent,
  type BaseReceiptLog,
} from '../../../lib/rock-wallet.ts';
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
  PAYOUT_ADAPTER_SECRET?: string;
  SKY_ORIGIN: string;
  BASE_RPC_URL?: string;
}

function configuration(env: Env) {
  const sky = new URL(env.SKY_ORIGIN);
  const baseRpc = new URL(env.BASE_RPC_URL ?? BASE_MAINNET_RPC_URL);
  if (
    sky.protocol !== 'https:' ||
    baseRpc.protocol !== 'https:' ||
    (env.BILLING_SHARED_SECRET ?? '').length < 32 ||
    (env.SETTLEMENT_INGEST_SECRET ?? '').length < 32
  )
    throw new Error('SETTLEMENT_CONFIGURATION_INVALID');
  return { skyOrigin: sky.origin, baseRpcUrl: baseRpc.toString() };
}

function cors(origin: string) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization,content-type',
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
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

async function userInput(request: Request, env: Env) {
  const authorization = await authorizeUser(request, env);
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > 16_384)
    throw new Error('ROCK_WALLET_INPUT_INVALID');
  const value = JSON.parse(raw) as unknown;
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('ROCK_WALLET_INPUT_INVALID');
  return {
    ...authorization,
    input: value as Record<string, unknown>,
  };
}

type RockWalletOperator = {
  userId: string;
  address: string;
  chainId: number;
  network: string;
  assetSymbol: string;
  assetContract: string;
  status: 'active' | 'revoked';
  verifiedAt: number;
  updatedAt: number;
};

async function rockWalletOperator(db: D1Database) {
  return db
    .prepare(
      `SELECT user_id AS userId,address,chain_id AS chainId,network,
        asset_symbol AS assetSymbol,asset_contract AS assetContract,status,
        verified_at AS verifiedAt,updated_at AS updatedAt
       FROM rock_wallet_operators WHERE provider_id=?`,
    )
    .bind(ROCK_WALLET_PROVIDER_ID)
    .first<RockWalletOperator>();
}

async function rockWalletStatus(
  request: Request,
  env: Env,
  legacyFixture = false,
) {
  const { origin, token } = await authorizeUser(request, env);
  const operator = await rockWalletOperator(env.DB);
  const isOperator = operator?.userId === token.sub;
  const [collections, totals] = isOperator
    ? await Promise.all([
        env.DB.prepare(
          `SELECT instruction_id AS instructionId,receipt_id AS receiptId,
              amount_minor AS amountMinor,currency,network,chain_id AS chainId,
              asset_symbol AS assetSymbol,asset_contract AS assetContract,
              recipient_address AS recipientAddress,status,
              transaction_hash AS transactionHash,block_number AS blockNumber,
              last_error AS lastError,updated_at AS updatedAt,
              verified_at AS verifiedAt
             FROM rock_fee_collection_instructions
             ORDER BY created_at DESC,instruction_id DESC LIMIT 20`,
        ).all(),
        env.DB.prepare(
          `SELECT
              COALESCE(SUM(CASE WHEN status='collected' THEN amount_minor ELSE 0 END),0) AS collectedMinor,
              COALESCE(SUM(CASE WHEN status IN ('ready','confirming','unknown') THEN amount_minor ELSE 0 END),0) AS pendingMinor,
              SUM(CASE WHEN status='collected' THEN 1 ELSE 0 END) AS collectedCount,
              SUM(CASE WHEN status IN ('ready','confirming','unknown') THEN 1 ELSE 0 END) AS pendingCount
             FROM rock_fee_collection_instructions`,
        ).first(),
      ])
    : [{ results: [] }, null];
  return response(
    {
      provider: {
        providerId: ROCK_WALLET_PROVIDER_ID,
        displayName: 'Rock Settlement Wallet',
        mode: legacyFixture ? 'LIVE_RECEIVE' : 'ON_HOLD',
        custody: false,
        network: 'base',
        chainId: BASE_MAINNET_CHAIN_ID,
        assetSymbol: 'USDC',
        assetContract: BASE_USDC_ADDRESS,
      },
      account: operator
        ? {
            address: operator.address,
            chainId: operator.chainId,
            network: operator.network,
            assetSymbol: operator.assetSymbol,
            assetContract: operator.assetContract,
            status: operator.status,
            verifiedAt: operator.verifiedAt,
            updatedAt: operator.updatedAt,
          }
        : null,
      operator: isOperator,
      canClaim: legacyFixture && (operator === null || isOperator),
      totals: isOperator
        ? (totals ?? {
            collectedMinor: 0,
            pendingMinor: 0,
            collectedCount: 0,
            pendingCount: 0,
          })
        : null,
      collections: collections.results,
    },
    200,
    origin,
  );
}

async function createRockWalletChallenge(request: Request, env: Env) {
  const { origin, token, input } = await userInput(request, env);
  if (Object.keys(input).some((key) => !['address', 'chainId'].includes(key)))
    throw new Error('ROCK_WALLET_INPUT_INVALID');
  const current = await rockWalletOperator(env.DB);
  if (current && current.userId !== token.sub)
    throw new Error('ROCK_WALLET_OPERATOR_FORBIDDEN');
  const address = normalizeWalletAddress(input.address);
  const chainId = normalizeBaseChainId(input.chainId);
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + 300;
  const challengeId = crypto.randomUUID();
  const nonce = crypto.randomUUID().replaceAll('-', '');
  const message = createRockWalletConsentMessage({
    origin,
    address,
    chainId,
    nonce,
    issuedAt: new Date(now * 1000).toISOString(),
    expiresAt: new Date(expiresAt * 1000).toISOString(),
  });
  await env.DB.batch([
    env.DB.prepare(
      `DELETE FROM rock_wallet_challenges
         WHERE user_id=? AND (consumed_at IS NOT NULL OR expires_at<?)`,
    ).bind(token.sub, now),
    env.DB.prepare(
      `INSERT INTO rock_wallet_challenges(
          challenge_id,user_id,address,chain_id,message,expires_at,created_at
        ) VALUES(?,?,?,?,?,?,?)`,
    ).bind(challengeId, token.sub, address, chainId, message, expiresAt, now),
  ]);
  return response(
    { challengeId, address, chainId, message, expiresAt },
    201,
    origin,
  );
}

type WalletChallenge = {
  challengeId: string;
  userId: string;
  address: string;
  chainId: number;
  message: string;
  expiresAt: number;
  consumedAt: number | null;
};

async function verifyRockWallet(request: Request, env: Env) {
  const { origin, token, input } = await userInput(request, env);
  if (
    Object.keys(input).some(
      (key) => !['challengeId', 'address', 'signature'].includes(key),
    ) ||
    typeof input.challengeId !== 'string' ||
    !/^[0-9a-f-]{36}$/iu.test(input.challengeId)
  )
    throw new Error('ROCK_WALLET_INPUT_INVALID');
  const challenge = await env.DB.prepare(
    `SELECT challenge_id AS challengeId,user_id AS userId,address,chain_id AS chainId,
        message,expires_at AS expiresAt,consumed_at AS consumedAt
       FROM rock_wallet_challenges WHERE challenge_id=? AND user_id=?`,
  )
    .bind(input.challengeId, token.sub)
    .first<WalletChallenge>();
  const now = Math.floor(Date.now() / 1000);
  const address = normalizeWalletAddress(input.address);
  if (
    !challenge ||
    challenge.consumedAt !== null ||
    challenge.expiresAt <= now ||
    challenge.address.toLowerCase() !== address.toLowerCase()
  )
    throw new Error('ROCK_WALLET_CHALLENGE_INVALID');
  await verifyRockWalletConsent({
    address,
    message: challenge.message,
    signature: input.signature,
  });

  const result = await env.DB.batch([
    env.DB.prepare(
      `UPDATE rock_wallet_challenges SET consumed_at=?
         WHERE challenge_id=? AND user_id=? AND consumed_at IS NULL AND expires_at>?`,
    ).bind(now, challenge.challengeId, token.sub, now),
    env.DB.prepare(
      `INSERT INTO rock_wallet_operators(
          provider_id,user_id,address,chain_id,network,asset_symbol,
          asset_contract,status,consent_version,verified_at,created_at,updated_at
        ) SELECT ?,?,?,?,'base','USDC',?,'active',?,?,?,?
          WHERE NOT EXISTS(
            SELECT 1 FROM rock_wallet_operators WHERE provider_id=? AND user_id<>?
          )
        ON CONFLICT(provider_id) DO UPDATE SET
          address=excluded.address,chain_id=excluded.chain_id,
          asset_contract=excluded.asset_contract,status='active',
          consent_version=excluded.consent_version,
          verified_at=excluded.verified_at,updated_at=excluded.updated_at
        WHERE rock_wallet_operators.user_id=excluded.user_id`,
    ).bind(
      ROCK_WALLET_PROVIDER_ID,
      token.sub,
      address,
      challenge.chainId,
      BASE_USDC_ADDRESS,
      ROCK_WALLET_CONSENT_VERSION,
      now,
      now,
      now,
      ROCK_WALLET_PROVIDER_ID,
      token.sub,
    ),
    env.DB.prepare(
      `UPDATE rock_fee_collection_instructions
         SET recipient_address=?,status='ready',updated_at=?
         WHERE status='awaiting_wallet' AND amount_minor>0`,
    ).bind(address, now),
  ]);
  if (
    (result[0].meta.changes ?? 0) !== 1 ||
    (result[1].meta.changes ?? 0) !== 1
  )
    throw new Error('ROCK_WALLET_OPERATOR_CONFLICT');
  return response(
    {
      connected: true,
      providerId: ROCK_WALLET_PROVIDER_ID,
      address,
      chainId: challenge.chainId,
      network: 'base',
      assetSymbol: 'USDC',
      custody: false,
      verifiedAt: now,
    },
    200,
    origin,
  );
}

async function revokeRockWallet(request: Request, env: Env) {
  const { origin, token } = await authorizeUser(request, env);
  const now = Math.floor(Date.now() / 1000);
  const updated = await env.DB.prepare(
    `UPDATE rock_wallet_operators SET status='revoked',updated_at=?
       WHERE provider_id=? AND user_id=? AND status='active'`,
  )
    .bind(now, ROCK_WALLET_PROVIDER_ID, token.sub)
    .run();
  if ((updated.meta.changes ?? 0) !== 1)
    throw new Error('ROCK_WALLET_OPERATOR_FORBIDDEN');
  return response({ revoked: true }, 200, origin);
}

async function rpcRequest(env: Env, method: string, params: unknown[]) {
  const response = await fetch(configuration(env).baseRpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error('ROCK_WALLET_RPC_UNAVAILABLE');
  const body = (await response.json()) as {
    result?: unknown;
    error?: unknown;
  };
  if (body.error) throw new Error('ROCK_WALLET_RPC_UNAVAILABLE');
  return body.result;
}

async function reconcileRockCollection(request: Request, env: Env) {
  const { origin, token, input } = await userInput(request, env);
  if (
    Object.keys(input).some(
      (key) => !['instructionId', 'transactionHash'].includes(key),
    ) ||
    typeof input.instructionId !== 'string' ||
    !/^rock-fee:[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(input.instructionId)
  )
    throw new Error('ROCK_WALLET_INPUT_INVALID');
  const operator = await rockWalletOperator(env.DB);
  if (
    !operator ||
    operator.userId !== token.sub ||
    operator.status !== 'active'
  )
    throw new Error('ROCK_WALLET_OPERATOR_FORBIDDEN');
  const transactionHash = normalizeTransactionHash(input.transactionHash);
  const instruction = await env.DB.prepare(
    `SELECT instruction_id AS instructionId,amount_minor AS amountMinor,
        recipient_address AS recipientAddress,status,
        transaction_hash AS transactionHash
       FROM rock_fee_collection_instructions WHERE instruction_id=?`,
  )
    .bind(input.instructionId)
    .first<{
      instructionId: string;
      amountMinor: number;
      recipientAddress: string | null;
      status: string;
      transactionHash: string | null;
    }>();
  if (!instruction) throw new Error('ROCK_COLLECTION_NOT_FOUND');
  if (instruction.status === 'collected') {
    if (instruction.transactionHash === transactionHash)
      return response({ instruction, replay: true }, 200, origin);
    throw new Error('ROCK_COLLECTION_CONFLICT');
  }
  if (
    !instruction.recipientAddress ||
    instruction.amountMinor < 1 ||
    (instruction.transactionHash &&
      instruction.transactionHash !== transactionHash)
  )
    throw new Error('ROCK_COLLECTION_CONFLICT');

  let receipt: unknown;
  let finalized: unknown;
  try {
    const chainId = await rpcRequest(env, 'eth_chainId', []);
    if (chainId !== '0x2105') throw new Error('ROCK_WALLET_RPC_CHAIN_INVALID');
    [receipt, finalized] = await Promise.all([
      rpcRequest(env, 'eth_getTransactionReceipt', [transactionHash]),
      rpcRequest(env, 'eth_getBlockByNumber', ['finalized', false]),
    ]);
  } catch (error) {
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare(
      `UPDATE rock_fee_collection_instructions
         SET status='unknown',transaction_hash=?,last_error=?,updated_at=?
         WHERE instruction_id=? AND status<>'collected'`,
    )
      .bind(
        transactionHash,
        error instanceof Error ? error.message : 'ROCK_WALLET_RPC_UNAVAILABLE',
        now,
        instruction.instructionId,
      )
      .run();
    throw error;
  }
  const now = Math.floor(Date.now() / 1000);
  if (!receipt) {
    await env.DB.prepare(
      `UPDATE rock_fee_collection_instructions
         SET status='confirming',transaction_hash=?,last_error=NULL,updated_at=?
         WHERE instruction_id=? AND status<>'collected'`,
    )
      .bind(transactionHash, now, instruction.instructionId)
      .run();
    return response({ status: 'confirming', transactionHash }, 202, origin);
  }
  const proof = receipt as {
    status: `0x${string}`;
    blockNumber: `0x${string}`;
    logs: BaseReceiptLog[];
  };
  const finalizedBlock = finalized as { number?: `0x${string}` } | null;
  if (!finalizedBlock?.number) throw new Error('ROCK_WALLET_RPC_UNAVAILABLE');
  try {
    const verified = verifyBaseUsdcCollection({
      recipient: instruction.recipientAddress,
      amountMinor: instruction.amountMinor,
      receiptStatus: proof.status,
      receiptBlockNumber: BigInt(proof.blockNumber),
      finalizedBlockNumber: BigInt(finalizedBlock.number),
      logs: proof.logs,
    });
    const collected = verified.status === 'collected';
    const updated = await env.DB.prepare(
      `UPDATE rock_fee_collection_instructions
         SET status=?,transaction_hash=?,block_number=?,last_error=NULL,
           updated_at=?,verified_at=?
         WHERE instruction_id=? AND status<>'collected'
           AND (transaction_hash IS NULL OR transaction_hash=?)`,
    )
      .bind(
        verified.status,
        transactionHash,
        Number(BigInt(proof.blockNumber)),
        now,
        collected ? now : null,
        instruction.instructionId,
        transactionHash,
      )
      .run();
    if ((updated.meta.changes ?? 0) !== 1)
      throw new Error('ROCK_COLLECTION_CONFLICT');
    return response(
      {
        status: verified.status,
        transactionHash,
        blockNumber: Number(BigInt(proof.blockNumber)),
        replay: false,
      },
      collected ? 200 : 202,
      origin,
    );
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === 'ROCK_COLLECTION_TRANSFER_MISMATCH' ||
        error.message === 'ROCK_COLLECTION_TRANSACTION_REVERTED')
    ) {
      await env.DB.prepare(
        `UPDATE rock_fee_collection_instructions
           SET status='ready',transaction_hash=NULL,block_number=NULL,
             last_error=?,updated_at=?
           WHERE instruction_id=? AND status<>'collected'`,
      )
        .bind(error.message, now, instruction.instructionId)
        .run();
    }
    throw error;
  }
}

async function status(request: Request, env: Env, legacyFixture = false) {
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
      r.fund_id AS fundId, r.automation_tool_id AS automationToolId,
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
  const funds = await env.DB.prepare(
    `SELECT fund_id AS fundId, gross_minor AS grossMinor,
      operating_cost_minor AS operatingCostMinor, sky_fee_minor AS skyFeeMinor,
      user_payable_minor AS userPayableMinor, receipt_count AS receiptCount,
      updated_at AS updatedAt
     FROM monthly_fund_earning_settlements
     WHERE user_id=? AND period=? AND currency=?
     ORDER BY updated_at DESC, fund_id`,
  )
    .bind(token.sub, period, SETTLEMENT_CURRENCY)
    .all();
  const tools = await env.DB.prepare(
    `SELECT automation_tool_id AS automationToolId,
      COALESCE(SUM(gross_minor),0) AS grossMinor,
      COALESCE(SUM(operating_cost_minor),0) AS operatingCostMinor,
      COUNT(*) AS receiptCount
     FROM earning_receipts
     WHERE user_id=? AND period=? AND currency=? AND applied_at IS NOT NULL
       AND automation_tool_id IS NOT NULL
     GROUP BY automation_tool_id
     ORDER BY automation_tool_id`,
  )
    .bind(token.sub, period, SETTLEMENT_CURRENCY)
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
        mode: legacyFixture ? 'verified_earnings_only' : 'fee_policy_on_hold',
        currency: SETTLEMENT_CURRENCY,
        monthlyFeeCapMinor: legacyFixture ? SKY_MONTHLY_FEE_CAP_MINOR : null,
        legacyMonthlyFeeCapMinor: SKY_MONTHLY_FEE_CAP_MINOR,
        upfrontCharge: false,
        debtCarry: false,
        tobFeeMinor: 0,
        performanceCommissionBps: 0,
        userOwnsRemainder: true,
        fundCountLimit: null,
        defaultFundToolCount: 5,
      },
      period,
      settlement: {
        ...current,
        remainingFeeCapMinor: legacyFixture
          ? Math.max(
              0,
              SKY_MONTHLY_FEE_CAP_MINOR -
                Number((current as { skyFeeMinor?: number }).skyFeeMinor ?? 0),
            )
          : null,
      },
      funds: funds.results,
      tools: tools.results,
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
  fund_id: string | null;
  automation_tool_id: string | null;
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
    stored.fund_id === (receipt.fundId ?? null) &&
    stored.automation_tool_id === (receipt.automationToolId ?? null) &&
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
        r.fund_id AS fundId, r.automation_tool_id AS automationToolId,
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

async function ingest(request: Request, env: Env, legacyFixture = false) {
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
  // The USD 8.88 ToC proposal is on hold. Keep the legacy path available only
  // to the in-process regression fixture; the deployed default fails closed.
  if (receipt.beneficiaryRole === 'toc' && !legacyFixture)
    return response(
      {
        code: 'SKY_FEE_POLICY_ON_HOLD',
        error: '利用者向け収益料金は保留中です。料金と回収動線の確定後に再開します。',
      },
      409,
    );
  const now = Math.floor(Date.now() / 1000);
  if (receipt.occurredAt > now + 300)
    throw new Error('EARNING_RECEIPT_OCCURRED_AT_INVALID');
  const period = periodForUnix(receipt.occurredAt);
  const inserted = await env.DB.prepare(
    `INSERT OR IGNORE INTO earning_receipts(
      receipt_id,execution_receipt_id,user_id,beneficiary_role,fund_id,
      automation_tool_id,source_provider,
      provider_reference,payout_account_id,evidence_sha256,currency,gross_minor,
      operating_cost_minor,sky_fee_minor,distributable_minor,period,occurred_at,
      received_at,applied_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,0,0,?,?,?,NULL)`,
  )
    .bind(
      receipt.receiptId,
      receipt.executionReceiptId,
      receipt.userId,
      receipt.beneficiaryRole,
      receipt.fundId ?? null,
      receipt.automationToolId ?? null,
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
      `INSERT INTO monthly_fund_earning_settlements(
        user_id,fund_id,period,currency,gross_minor,operating_cost_minor,
        sky_fee_minor,user_payable_minor,receipt_count,updated_at
      ) SELECT user_id,fund_id,period,currency,gross_minor,operating_cost_minor,
          sky_fee_minor,distributable_minor,1,?
        FROM earning_receipts
        WHERE receipt_id=? AND applied_at IS NULL AND fund_id IS NOT NULL
       ON CONFLICT(user_id,fund_id,period,currency) DO UPDATE SET
        gross_minor=monthly_fund_earning_settlements.gross_minor+excluded.gross_minor,
        operating_cost_minor=monthly_fund_earning_settlements.operating_cost_minor+excluded.operating_cost_minor,
        sky_fee_minor=monthly_fund_earning_settlements.sky_fee_minor+excluded.sky_fee_minor,
        user_payable_minor=monthly_fund_earning_settlements.user_payable_minor+excluded.user_payable_minor,
        receipt_count=monthly_fund_earning_settlements.receipt_count+1,
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
      `INSERT OR IGNORE INTO rock_fee_collection_instructions(
        instruction_id,receipt_id,user_id,amount_minor,currency,network,chain_id,
        asset_symbol,asset_contract,recipient_address,status,idempotency_key,
        created_at,updated_at
      ) SELECT 'rock-fee:'||receipt_id,receipt_id,user_id,sky_fee_minor,currency,
          'base',?,'USDC',?,(
            SELECT address FROM rock_wallet_operators
            WHERE provider_id=? AND status='active'
          ),CASE
            WHEN sky_fee_minor=0 THEN 'not_required'
            WHEN EXISTS(
              SELECT 1 FROM rock_wallet_operators
              WHERE provider_id=? AND status='active'
            ) THEN 'ready'
            ELSE 'awaiting_wallet'
          END,'rock-fee:'||receipt_id,?,?
        FROM earning_receipts WHERE receipt_id=? AND applied_at IS NULL`,
    ).bind(
      BASE_MAINNET_CHAIN_ID,
      BASE_USDC_ADDRESS,
      ROCK_WALLET_PROVIDER_ID,
      ROCK_WALLET_PROVIDER_ID,
      now,
      now,
      receipt.receiptId,
    ),
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
  // The payout rail is optional while no payout adapter is approved. Never
  // accept a claim or result without its own secret.
  const payoutSecret = env.PAYOUT_ADAPTER_SECRET;
  if (!payoutSecret || payoutSecret.length < 32)
    throw new Error('SETTLEMENT_CONFIGURATION_INVALID');
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > 16_384)
    throw new Error('SIGNED_INPUT_TOO_LARGE');
  await verifyReceiptSignature(
    raw,
    request.headers.get('sky-receipt-signature'),
    payoutSecret,
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
        '先払いの月額契約は廃止しました。利用者向け収益料金も現在保留中です。',
      code: 'UPFRONT_BILLING_RETIRED',
    },
    410,
    origin,
  );
}

function feeOnHold(origin?: string) {
  return response(
    {
      code: 'SKY_FEE_POLICY_ON_HOLD',
      error: '利用者向け収益料金は保留中です。料金と回収動線の確定後に再開します。',
    },
    409,
    origin,
  );
}

function errorResponse(error: unknown, origin?: string) {
  const message = error instanceof Error ? error.message : '';
  const status =
    message === 'UNAUTHORIZED' || message.startsWith('TOKEN_')
      ? 401
      : message === 'ORIGIN' || message === 'ROCK_WALLET_OPERATOR_FORBIDDEN'
        ? 403
        : message === 'ROCK_COLLECTION_NOT_FOUND'
          ? 404
          : message === 'EARNING_RECEIPT_CONFLICT' ||
              message === 'PAYOUT_CLAIM_CONFLICT' ||
              message === 'PAYOUT_RESULT_CONFLICT' ||
              message === 'ROCK_WALLET_OPERATOR_CONFLICT' ||
              message === 'ROCK_WALLET_CHALLENGE_INVALID' ||
              message === 'ROCK_COLLECTION_CONFLICT'
            ? 409
            : message === 'ROCK_WALLET_RPC_UNAVAILABLE' ||
                message === 'ROCK_WALLET_RPC_CHAIN_INVALID'
              ? 503
              : message.includes('SIGNATURE')
                ? 401
                : message.startsWith('EARNING_RECEIPT_') ||
                    message === 'PAYOUT_INPUT_INVALID' ||
                    message === 'SIGNED_INPUT_TOO_LARGE' ||
                    message.startsWith('ROCK_WALLET_') ||
                    message.startsWith('ROCK_COLLECTION_') ||
                    message === 'SETTLEMENT_PREVIOUS_FEE_INVALID' ||
                    error instanceof SyntaxError
                  ? 400
                  : message === 'SETTLEMENT_CONFIGURATION_INVALID'
                    ? 503
                    : 500;
  return response(
    {
      error:
        message === 'ROCK_COLLECTION_NOT_FOUND'
          ? '回収指図が見つかりません。'
          : message.startsWith('ROCK_') && status === 503
            ? 'Baseの着金確認に接続できません。自動再実行せず、時間を置いて再照合してください。'
            : message.startsWith('ROCK_') && status === 403
              ? 'Rock受取Walletの管理者だけが操作できます。'
              : message.startsWith('ROCK_') && status === 409
                ? 'Walletまたは回収指図の状態が変わりました。表示を更新してください。'
                : message.startsWith('ROCK_')
                  ? 'Walletの署名、ネットワーク、アドレスまたは取引内容を確認してください。'
                  : status === 401
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

function createBillingWorker(legacyFixture = false) {
  return {
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
            mode: legacyFixture ? 'verified_earnings_only' : 'fee_policy_on_hold',
            monthlyFeeCapMinor: legacyFixture ? SKY_MONTHLY_FEE_CAP_MINOR : null,
            legacyMonthlyFeeCapMinor: SKY_MONTHLY_FEE_CAP_MINOR,
            currency: SETTLEMENT_CURRENCY,
          });
        if (request.method === 'GET' && url.pathname === '/v1/status')
          return await status(request, env, legacyFixture);
        if (request.method === 'GET' && url.pathname === '/v1/rock-wallet')
          return await rockWalletStatus(request, env, legacyFixture);
        if (
          request.method === 'POST' &&
          url.pathname === '/v1/rock-wallet/challenge'
        )
          return legacyFixture
            ? await createRockWalletChallenge(request, env)
            : feeOnHold(origin);
        if (
          request.method === 'POST' &&
          url.pathname === '/v1/rock-wallet/verify'
        )
          return legacyFixture
            ? await verifyRockWallet(request, env)
            : feeOnHold(origin);
        if (
          request.method === 'POST' &&
          url.pathname === '/v1/rock-wallet/reconcile'
        )
          return legacyFixture
            ? await reconcileRockCollection(request, env)
            : feeOnHold(origin);
        if (request.method === 'DELETE' && url.pathname === '/v1/rock-wallet')
          return await revokeRockWallet(request, env);
        if (request.method === 'POST' && url.pathname === '/v1/earnings')
          return await ingest(request, env, legacyFixture);
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
}

// Historical 888-cent behavior is exercised without exposing it as a Worker route.
export const legacyFixtureBillingWorker = createBillingWorker(true);
export default createBillingWorker();
