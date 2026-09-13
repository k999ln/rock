var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// ../../lib/billing-token.ts
var encoder = new TextEncoder();
var BILLING_TOKEN_AUDIENCE = "sky-billing";
var BILLING_TOKEN_ISSUER = "sky-site";
var BILLING_TOKEN_TTL_SECONDS = 300;
function decodeBase64Url(value) {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) throw new Error("TOKEN_INVALID");
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
__name(decodeBase64Url, "decodeBase64Url");
async function signature(input, secret) {
  if (secret.length < 32) throw new Error("TOKEN_SECRET_INVALID");
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return new Uint8Array(
    await crypto.subtle.sign("HMAC", key, encoder.encode(input))
  );
}
__name(signature, "signature");
function equal(left, right) {
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index++)
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  return difference === 0;
}
__name(equal, "equal");
function payload(value) {
  if (!value || typeof value !== "object") throw new Error("TOKEN_INVALID");
  const item = value;
  if (item.v !== 1 || item.iss !== BILLING_TOKEN_ISSUER || item.aud !== BILLING_TOKEN_AUDIENCE || typeof item.sub !== "string" || item.sub.length < 1 || item.sub.length > 256 || typeof item.iat !== "number" || !Number.isInteger(item.iat) || typeof item.exp !== "number" || !Number.isInteger(item.exp) || typeof item.jti !== "string" || !/^[0-9a-f-]{36}$/iu.test(item.jti))
    throw new Error("TOKEN_INVALID");
  return item;
}
__name(payload, "payload");
async function verifyBillingToken(token, secret, nowSeconds = Math.floor(Date.now() / 1e3)) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("TOKEN_INVALID");
  const [header, body, supplied] = parts;
  const parsedHeader = JSON.parse(
    new TextDecoder().decode(decodeBase64Url(header))
  );
  if (!parsedHeader || typeof parsedHeader !== "object" || parsedHeader.alg !== "HS256" || parsedHeader.typ !== "JWT")
    throw new Error("TOKEN_INVALID");
  const expected = await signature(`${header}.${body}`, secret);
  if (!equal(decodeBase64Url(supplied), expected))
    throw new Error("TOKEN_INVALID");
  const result = payload(
    JSON.parse(new TextDecoder().decode(decodeBase64Url(body)))
  );
  if (result.exp <= nowSeconds || result.iat > nowSeconds + 30 || result.exp - result.iat !== BILLING_TOKEN_TTL_SECONDS)
    throw new Error("TOKEN_EXPIRED");
  return result;
}
__name(verifyBillingToken, "verifyBillingToken");

// src/domain.ts
var SKY_MONTHLY_FEE_CAP_MINOR = 888;
var SETTLEMENT_CURRENCY = "usd";
function text(value, name, pattern, maximum = 256) {
  if (typeof value !== "string" || value.length < 1 || value.length > maximum || !pattern.test(value))
    throw new Error(`EARNING_RECEIPT_${name}_INVALID`);
  return value;
}
__name(text, "text");
function amount(value, name) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > 1e10)
    throw new Error(`EARNING_RECEIPT_${name}_INVALID`);
  return value;
}
__name(amount, "amount");
function periodForUnix(timestamp) {
  if (!Number.isSafeInteger(timestamp) || timestamp < 0)
    throw new Error("EARNING_RECEIPT_OCCURRED_AT_INVALID");
  return new Date(timestamp * 1e3).toISOString().slice(0, 7);
}
__name(periodForUnix, "periodForUnix");
function validateEarningReceipt(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("EARNING_RECEIPT_INVALID");
  const item = value;
  const grossAmountMinor = amount(item.grossAmountMinor, "GROSS");
  const operatingCostMinor = amount(item.operatingCostMinor, "OPERATING_COST");
  if (operatingCostMinor > grossAmountMinor)
    throw new Error("EARNING_RECEIPT_OPERATING_COST_EXCEEDS_GROSS");
  if (item.beneficiaryRole !== "toc" && item.beneficiaryRole !== "tob")
    throw new Error("EARNING_RECEIPT_ROLE_INVALID");
  if (item.currency !== SETTLEMENT_CURRENCY)
    throw new Error("EARNING_RECEIPT_CURRENCY_INVALID");
  const occurredAt = amount(item.occurredAt, "OCCURRED_AT");
  periodForUnix(occurredAt);
  if (Boolean(item.fundId) !== Boolean(item.automationToolId))
    throw new Error("EARNING_RECEIPT_FUND_TOOL_PAIR_INVALID");
  const fund = item.fundId ? text(item.fundId, "FUND", /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u, 80) : void 0;
  const automationTool = item.automationToolId ? text(
    item.automationToolId,
    "AUTOMATION_TOOL",
    /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u,
    80
  ) : void 0;
  return {
    receiptId: text(item.receiptId, "ID", /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u),
    executionReceiptId: text(
      item.executionReceiptId,
      "EXECUTION_ID",
      /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u
    ),
    userId: text(item.userId, "USER", /^\S+$/u),
    beneficiaryRole: item.beneficiaryRole,
    ...fund ? { fundId: fund, automationToolId: automationTool } : {},
    sourceProvider: text(
      item.sourceProvider,
      "PROVIDER",
      /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u,
      80
    ),
    providerReference: text(
      item.providerReference,
      "PROVIDER_REFERENCE",
      /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u
    ),
    payoutAccountId: text(
      item.payoutAccountId,
      "PAYOUT_ACCOUNT",
      /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u
    ),
    evidenceSha256: text(
      item.evidenceSha256,
      "EVIDENCE",
      /^[0-9a-f]{64}$/u,
      64
    ),
    currency: SETTLEMENT_CURRENCY,
    grossAmountMinor,
    operatingCostMinor,
    occurredAt
  };
}
__name(validateEarningReceipt, "validateEarningReceipt");

// src/receipt-signature.ts
var encoder2 = new TextEncoder();
function bytesFromHex(value) {
  if (!/^[0-9a-f]{64}$/iu.test(value))
    throw new Error("RECEIPT_SIGNATURE_INVALID");
  return Uint8Array.from(
    { length: value.length / 2 },
    (_, index) => Number.parseInt(value.slice(index * 2, index * 2 + 2), 16)
  );
}
__name(bytesFromHex, "bytesFromHex");
function secureEqual(left, right) {
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index++)
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  return difference === 0;
}
__name(secureEqual, "secureEqual");
async function verifyReceiptSignature(rawBody, signatureHeader, secret, nowSeconds = Math.floor(Date.now() / 1e3), toleranceSeconds = 300) {
  if (!signatureHeader || secret.length < 32)
    throw new Error("RECEIPT_SIGNATURE_INVALID");
  const fields = signatureHeader.split(",").map((field) => field.split("="));
  const timestampValue = fields.find(([key2]) => key2 === "t")?.[1];
  const candidates = fields.filter(([key2]) => key2 === "v1").map(([, value]) => value);
  const timestamp = Number(timestampValue);
  if (!Number.isInteger(timestamp) || Math.abs(nowSeconds - timestamp) > toleranceSeconds || candidates.length === 0)
    throw new Error("RECEIPT_SIGNATURE_INVALID");
  const key = await crypto.subtle.importKey(
    "raw",
    encoder2.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const expected = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key,
      encoder2.encode(`${timestamp}.${rawBody}`)
    )
  );
  if (!candidates.some((candidate) => {
    try {
      return secureEqual(bytesFromHex(candidate), expected);
    } catch {
      return false;
    }
  }))
    throw new Error("RECEIPT_SIGNATURE_INVALID");
}
__name(verifyReceiptSignature, "verifyReceiptSignature");

// src/worker.ts
function configuration(env) {
  const sky = new URL(env.SKY_ORIGIN);
  if (sky.protocol !== "https:" || env.BILLING_SHARED_SECRET.length < 32 || env.SETTLEMENT_INGEST_SECRET.length < 32)
    throw new Error("SETTLEMENT_CONFIGURATION_INVALID");
  return { skyOrigin: sky.origin };
}
__name(configuration, "configuration");
function cors(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization,content-type",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Max-Age": "600",
    Vary: "Origin"
  };
}
__name(cors, "cors");
function response(value, status2 = 200, origin) {
  return Response.json(value, {
    status: status2,
    headers: {
      "Cache-Control": "no-store",
      ...origin ? cors(origin) : {}
    }
  });
}
__name(response, "response");
function bearer(request) {
  const authorization = request.headers.get("authorization") ?? "";
  const match = /^Bearer ([A-Za-z0-9._-]+)$/u.exec(authorization);
  if (!match) throw new Error("UNAUTHORIZED");
  return match[1];
}
__name(bearer, "bearer");
async function authorizeUser(request, env) {
  const { skyOrigin } = configuration(env);
  if (request.headers.get("origin") !== skyOrigin) throw new Error("ORIGIN");
  return {
    origin: skyOrigin,
    token: await verifyBillingToken(bearer(request), env.BILLING_SHARED_SECRET)
  };
}
__name(authorizeUser, "authorizeUser");
async function status(request, env) {
  const { origin, token } = await authorizeUser(request, env);
  const period = periodForUnix(Math.floor(Date.now() / 1e3));
  const settlement = await env.DB.prepare(
    `SELECT gross_minor AS grossMinor, operating_cost_minor AS operatingCostMinor,
      sky_fee_minor AS skyFeeMinor, distributable_minor AS distributableMinor,
      receipt_count AS receiptCount, updated_at AS updatedAt
     FROM monthly_earning_settlements
     WHERE user_id=? AND period=? AND currency=?`
  ).bind(token.sub, period, SETTLEMENT_CURRENCY).first();
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
     ORDER BY r.occurred_at DESC, r.receipt_id DESC LIMIT 20`
  ).bind(token.sub, period).all();
  const funds = await env.DB.prepare(
    `SELECT fund_id AS fundId, gross_minor AS grossMinor,
      operating_cost_minor AS operatingCostMinor, sky_fee_minor AS skyFeeMinor,
      user_payable_minor AS userPayableMinor, receipt_count AS receiptCount,
      updated_at AS updatedAt
     FROM monthly_fund_earning_settlements
     WHERE user_id=? AND period=? AND currency=?
     ORDER BY updated_at DESC, fund_id`
  ).bind(token.sub, period, SETTLEMENT_CURRENCY).all();
  const current = settlement ?? {
    grossMinor: 0,
    operatingCostMinor: 0,
    skyFeeMinor: 0,
    distributableMinor: 0,
    receiptCount: 0,
    updatedAt: null
  };
  return response(
    {
      policy: {
        mode: "verified_earnings_only",
        currency: SETTLEMENT_CURRENCY,
        monthlyFeeCapMinor: SKY_MONTHLY_FEE_CAP_MINOR,
        upfrontCharge: false,
        debtCarry: false,
        tobFeeMinor: 0,
        performanceCommissionBps: 0,
        userOwnsRemainder: true,
        fundCountLimit: null,
        defaultFundToolCount: 5
      },
      period,
      settlement: {
        ...current,
        remainingFeeCapMinor: Math.max(
          0,
          SKY_MONTHLY_FEE_CAP_MINOR - Number(current.skyFeeMinor ?? 0)
        )
      },
      funds: funds.results,
      receipts: receipts.results
    },
    200,
    origin
  );
}
__name(status, "status");
function sameReceipt(stored, receipt) {
  return stored.receipt_id === receipt.receiptId && stored.execution_receipt_id === receipt.executionReceiptId && stored.user_id === receipt.userId && stored.beneficiary_role === receipt.beneficiaryRole && stored.fund_id === (receipt.fundId ?? null) && stored.automation_tool_id === (receipt.automationToolId ?? null) && stored.source_provider === receipt.sourceProvider && stored.provider_reference === receipt.providerReference && stored.payout_account_id === receipt.payoutAccountId && stored.evidence_sha256 === receipt.evidenceSha256 && stored.currency === receipt.currency && stored.gross_minor === receipt.grossAmountMinor && stored.operating_cost_minor === receipt.operatingCostMinor && stored.occurred_at === receipt.occurredAt;
}
__name(sameReceipt, "sameReceipt");
async function storedReceipt(db, receipt) {
  return db.prepare(
    `SELECT * FROM earning_receipts
       WHERE receipt_id=? OR execution_receipt_id=?
         OR (source_provider=? AND provider_reference=?) LIMIT 1`
  ).bind(
    receipt.receiptId,
    receipt.executionReceiptId,
    receipt.sourceProvider,
    receipt.providerReference
  ).first();
}
__name(storedReceipt, "storedReceipt");
async function receiptResult(db, receiptId) {
  return db.prepare(
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
       WHERE r.receipt_id=?`
  ).bind(receiptId).first();
}
__name(receiptResult, "receiptResult");
async function ingest(request, env) {
  configuration(env);
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > 65536)
    return response({ error: "payload_too_large" }, 413);
  await verifyReceiptSignature(
    raw,
    request.headers.get("sky-receipt-signature"),
    env.SETTLEMENT_INGEST_SECRET
  );
  const receipt = validateEarningReceipt(JSON.parse(raw));
  const now = Math.floor(Date.now() / 1e3);
  if (receipt.occurredAt > now + 300)
    throw new Error("EARNING_RECEIPT_OCCURRED_AT_INVALID");
  const period = periodForUnix(receipt.occurredAt);
  const inserted = await env.DB.prepare(
    `INSERT OR IGNORE INTO earning_receipts(
      receipt_id,execution_receipt_id,user_id,beneficiary_role,fund_id,
      automation_tool_id,source_provider,
      provider_reference,payout_account_id,evidence_sha256,currency,gross_minor,
      operating_cost_minor,sky_fee_minor,distributable_minor,period,occurred_at,
      received_at,applied_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,0,0,?,?,?,NULL)`
  ).bind(
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
    now
  ).run();
  const stored = await storedReceipt(env.DB, receipt);
  if (!stored || !sameReceipt(stored, receipt))
    throw new Error("EARNING_RECEIPT_CONFLICT");
  if (stored.applied_at !== null)
    return response(
      { receipt: await receiptResult(env.DB, receipt.receiptId), replay: true },
      200
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
       WHERE receipt_id=? AND applied_at IS NULL`
    ).bind(receipt.receiptId),
    env.DB.prepare(
      `UPDATE earning_receipts
       SET distributable_minor=gross_minor-operating_cost_minor-sky_fee_minor
       WHERE receipt_id=? AND applied_at IS NULL`
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
        updated_at=excluded.updated_at`
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
        updated_at=excluded.updated_at`
    ).bind(now, receipt.receiptId),
    env.DB.prepare(
      `INSERT OR IGNORE INTO earning_ledger_entries(
        entry_id,receipt_id,user_id,period,account,direction,amount_minor,currency,created_at
      ) SELECT receipt_id||':gross',receipt_id,user_id,period,'AUTOMATION_REVENUE','credit',gross_minor,currency,?
        FROM earning_receipts WHERE receipt_id=? AND applied_at IS NULL AND gross_minor>0`
    ).bind(now, receipt.receiptId),
    env.DB.prepare(
      `INSERT OR IGNORE INTO earning_ledger_entries(
        entry_id,receipt_id,user_id,period,account,direction,amount_minor,currency,created_at
      ) SELECT receipt_id||':cost',receipt_id,user_id,period,'OPERATING_COST','debit',operating_cost_minor,currency,?
        FROM earning_receipts WHERE receipt_id=? AND applied_at IS NULL AND operating_cost_minor>0`
    ).bind(now, receipt.receiptId),
    env.DB.prepare(
      `INSERT OR IGNORE INTO earning_ledger_entries(
        entry_id,receipt_id,user_id,period,account,direction,amount_minor,currency,created_at
      ) SELECT receipt_id||':sky',receipt_id,user_id,period,'SKY_SERVICE_FEE','debit',sky_fee_minor,currency,?
        FROM earning_receipts WHERE receipt_id=? AND applied_at IS NULL AND sky_fee_minor>0`
    ).bind(now, receipt.receiptId),
    env.DB.prepare(
      `INSERT OR IGNORE INTO earning_ledger_entries(
        entry_id,receipt_id,user_id,period,account,direction,amount_minor,currency,created_at
      ) SELECT receipt_id||':payable',receipt_id,user_id,period,'BENEFICIARY_PAYABLE','credit',distributable_minor,currency,?
        FROM earning_receipts WHERE receipt_id=? AND applied_at IS NULL AND distributable_minor>0`
    ).bind(now, receipt.receiptId),
    env.DB.prepare(
      `INSERT OR IGNORE INTO payout_instructions(
        instruction_id,receipt_id,user_id,payout_account_id,amount_minor,currency,
        status,idempotency_key,created_at,updated_at
      ) SELECT 'pay:'||receipt_id,receipt_id,user_id,payout_account_id,
          distributable_minor,currency,
          CASE WHEN distributable_minor>0 THEN 'ready' ELSE 'not_required' END,
          'sky-payout-'||receipt_id,?,?
        FROM earning_receipts WHERE receipt_id=? AND applied_at IS NULL`
    ).bind(now, now, receipt.receiptId),
    env.DB.prepare(
      `UPDATE earning_receipts SET applied_at=?
       WHERE receipt_id=? AND applied_at IS NULL`
    ).bind(now, receipt.receiptId)
  ]);
  return response(
    {
      receipt: await receiptResult(env.DB, receipt.receiptId),
      replay: (inserted.meta.changes ?? 0) === 0
    },
    (inserted.meta.changes ?? 0) === 1 ? 201 : 200
  );
}
__name(ingest, "ingest");
async function signedInput(request, env) {
  configuration(env);
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > 16384)
    throw new Error("SIGNED_INPUT_TOO_LARGE");
  await verifyReceiptSignature(
    raw,
    request.headers.get("sky-receipt-signature"),
    env.SETTLEMENT_INGEST_SECRET
  );
  const value = JSON.parse(raw);
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("PAYOUT_INPUT_INVALID");
  return value;
}
__name(signedInput, "signedInput");
async function payoutInstruction(db, instructionId) {
  return db.prepare(
    `SELECT instruction_id AS instructionId,receipt_id AS receiptId,
        user_id AS userId,payout_account_id AS payoutAccountId,
        amount_minor AS amountMinor,currency,status,
        idempotency_key AS idempotencyKey,lease_id AS leaseId,
        lease_expires_at AS leaseExpiresAt,
        provider_transfer_reference AS providerTransferReference
       FROM payout_instructions WHERE instruction_id=?`
  ).bind(instructionId).first();
}
__name(payoutInstruction, "payoutInstruction");
async function claimPayout(request, env) {
  const input = await signedInput(request, env);
  if (Object.keys(input).some((key) => key !== "adapterId") || typeof input.adapterId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/u.test(input.adapterId))
    throw new Error("PAYOUT_INPUT_INVALID");
  const now = Math.floor(Date.now() / 1e3);
  const candidate = await env.DB.prepare(
    `SELECT instruction_id AS instructionId FROM payout_instructions
     WHERE status='ready' OR (status='processing' AND lease_expires_at<?)
     ORDER BY created_at, instruction_id LIMIT 1`
  ).bind(now).first();
  if (!candidate) return response({ instruction: null });
  const leaseId = crypto.randomUUID();
  const claimed = await env.DB.prepare(
    `UPDATE payout_instructions SET status='processing',lease_id=?,
      lease_expires_at=?,updated_at=?
     WHERE instruction_id=? AND
      (status='ready' OR (status='processing' AND lease_expires_at<?))`
  ).bind(leaseId, now + 300, now, candidate.instructionId, now).run();
  if ((claimed.meta.changes ?? 0) !== 1)
    throw new Error("PAYOUT_CLAIM_CONFLICT");
  return response({
    instruction: await payoutInstruction(env.DB, candidate.instructionId)
  });
}
__name(claimPayout, "claimPayout");
async function completePayout(request, env) {
  const input = await signedInput(request, env);
  if (Object.keys(input).some(
    (key) => ![
      "instructionId",
      "leaseId",
      "status",
      "providerTransferReference",
      "errorCode"
    ].includes(key)
  ) || typeof input.instructionId !== "string" || typeof input.leaseId !== "string" || !["paid", "failed", "unknown"].includes(String(input.status)) || input.status === "paid" && (typeof input.providerTransferReference !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u.test(
    input.providerTransferReference
  )) || input.errorCode !== void 0 && (typeof input.errorCode !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/u.test(input.errorCode)))
    throw new Error("PAYOUT_INPUT_INVALID");
  const now = Math.floor(Date.now() / 1e3);
  const updated = await env.DB.prepare(
    `UPDATE payout_instructions SET status=?,provider_transfer_reference=?,
      last_error=?,lease_id=NULL,lease_expires_at=NULL,updated_at=?
     WHERE instruction_id=? AND status='processing' AND lease_id=?`
  ).bind(
    input.status,
    input.providerTransferReference ?? null,
    input.errorCode ?? null,
    now,
    input.instructionId,
    input.leaseId
  ).run();
  const instruction = await payoutInstruction(env.DB, input.instructionId);
  if ((updated.meta.changes ?? 0) !== 1) {
    if (instruction && instruction.status === input.status && instruction.providerTransferReference === (input.providerTransferReference ?? null))
      return response({ instruction, replay: true });
    throw new Error("PAYOUT_RESULT_CONFLICT");
  }
  return response({ instruction, replay: false });
}
__name(completePayout, "completePayout");
function retired(origin) {
  return response(
    {
      error: "\u5148\u6255\u3044\u306E\u6708\u984D\u5951\u7D04\u306F\u5EC3\u6B62\u3057\u307E\u3057\u305F\u3002Sky\u306F\u691C\u8A3C\u6E08\u307F\u81EA\u52D5\u5316\u53CE\u76CA\u304B\u3089\u3060\u3051\u6700\u5927$8.88\u3092\u7CBE\u7B97\u3057\u307E\u3059\u3002",
      code: "UPFRONT_BILLING_RETIRED"
    },
    410,
    origin
  );
}
__name(retired, "retired");
function errorResponse(error, origin) {
  const message = error instanceof Error ? error.message : "";
  const status2 = message === "UNAUTHORIZED" || message.startsWith("TOKEN_") ? 401 : message === "ORIGIN" ? 403 : message === "EARNING_RECEIPT_CONFLICT" || message === "PAYOUT_CLAIM_CONFLICT" || message === "PAYOUT_RESULT_CONFLICT" ? 409 : message.includes("SIGNATURE") ? 401 : message.startsWith("EARNING_RECEIPT_") || message === "PAYOUT_INPUT_INVALID" || message === "SIGNED_INPUT_TOO_LARGE" || message === "SETTLEMENT_PREVIOUS_FEE_INVALID" || error instanceof SyntaxError ? 400 : message === "SETTLEMENT_CONFIGURATION_INVALID" ? 503 : 500;
  return response(
    {
      error: status2 === 401 ? "\u7F72\u540D\u307E\u305F\u306F\u8A8D\u8A3C\u3092\u78BA\u8A8D\u3067\u304D\u307E\u305B\u3093\u3002" : status2 === 403 ? "Sky\u4EE5\u5916\u304B\u3089\u5229\u7528\u8005\u60C5\u5831\u3092\u53C2\u7167\u3067\u304D\u307E\u305B\u3093\u3002" : status2 === 409 ? "\u540C\u3058\u5B9F\u884C\u30FB\u5165\u91D1\u53C2\u7167\u306B\u7570\u306A\u308B\u5185\u5BB9\u306EReceipt\u304C\u3042\u308A\u307E\u3059\u3002" : status2 === 503 ? "\u53CE\u76CA\u7CBE\u7B97\u30B5\u30FC\u30D3\u30B9\u306E\u8A2D\u5B9A\u304C\u5B8C\u4E86\u3057\u3066\u3044\u307E\u305B\u3093\u3002" : status2 === 400 ? "Earning Receipt\u306E\u5185\u5BB9\u3092\u78BA\u8A8D\u3067\u304D\u307E\u305B\u3093\u3002" : "\u53CE\u76CA\u7CBE\u7B97\u3092\u5B8C\u4E86\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002"
    },
    status2,
    origin
  );
}
__name(errorResponse, "errorResponse");
var worker_default = {
  async fetch(request, env) {
    let origin;
    try {
      const { skyOrigin } = configuration(env);
      origin = request.headers.get("origin") === skyOrigin ? skyOrigin : void 0;
      const url = new URL(request.url);
      if (request.method === "OPTIONS") {
        if (!origin) return new Response(null, { status: 403 });
        return new Response(null, { status: 204, headers: cors(origin) });
      }
      if (request.method === "GET" && url.pathname === "/health")
        return response({
          ok: true,
          mode: "verified_earnings_only",
          monthlyFeeCapMinor: SKY_MONTHLY_FEE_CAP_MINOR,
          currency: SETTLEMENT_CURRENCY
        });
      if (request.method === "GET" && url.pathname === "/v1/status")
        return await status(request, env);
      if (request.method === "POST" && url.pathname === "/v1/earnings")
        return await ingest(request, env);
      if (request.method === "POST" && url.pathname === "/v1/payouts/claim")
        return await claimPayout(request, env);
      if (request.method === "POST" && url.pathname === "/v1/payouts/result")
        return await completePayout(request, env);
      if (request.method === "POST" && ["/v1/checkout", "/v1/portal", "/v1/webhooks/stripe"].includes(
        url.pathname
      ))
        return retired(origin);
      return response({ error: "not_found" }, 404, origin);
    } catch (error) {
      return errorResponse(error, origin);
    }
  }
};
export {
  worker_default as default
};
//# sourceMappingURL=worker.js.map
