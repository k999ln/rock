import {
  validateEarningReceipt,
  type EarningReceipt,
} from './earning-receipt.ts';
import {
  createReceiptSignature,
  verifyReceiptSignature,
} from './receipt-signature.ts';

export const PROVIDER_SIGNATURE_HEADER = 'avocado-provider-signature';

export type EarningBridgeEnvironment = {
  BILLING_SERVICE_URL?: string;
  SETTLEMENT_INGEST_SECRET?: string;
  EARNING_PROVIDER_ID?: string;
  EARNING_PROVIDER_SECRET?: string;
};

type CompletedExecution = {
  id: string;
  userId: string;
  tool: string;
  sample: number;
  status: string;
  finishedAt: number | null;
};

export class EarningBridgeError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function serviceOrigin(value: string | undefined) {
  if (!value) throw new EarningBridgeError('BRIDGE_NOT_CONFIGURED', 503);
  const url = new URL(value);
  if (
    url.protocol !== 'https:' &&
    !(
      url.protocol === 'http:' &&
      ['127.0.0.1', 'localhost'].includes(url.hostname)
    )
  )
    throw new EarningBridgeError('BRIDGE_NOT_CONFIGURED', 503);
  return url.origin;
}

function configuration(env: EarningBridgeEnvironment) {
  const providerId = env.EARNING_PROVIDER_ID ?? '';
  const providerSecret = env.EARNING_PROVIDER_SECRET ?? '';
  const settlementSecret = env.SETTLEMENT_INGEST_SECRET ?? '';
  if (
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/u.test(providerId) ||
    providerSecret.length < 32 ||
    settlementSecret.length < 32
  )
    throw new EarningBridgeError('BRIDGE_NOT_CONFIGURED', 503);
  return {
    providerId,
    providerSecret,
    settlementSecret,
    billingOrigin: serviceOrigin(env.BILLING_SERVICE_URL),
  };
}

async function rawBody(request: Request) {
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    throw new EarningBridgeError('RECEIPT_CONTENT_TYPE_INVALID', 415);
  const reader = request.body?.getReader();
  if (!reader) throw new EarningBridgeError('EARNING_RECEIPT_INVALID', 400);
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > 65_536) {
        await reader.cancel();
        throw new EarningBridgeError('RECEIPT_TOO_LARGE', 413);
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (error) {
    if (error instanceof EarningBridgeError) throw error;
    throw new EarningBridgeError('EARNING_RECEIPT_INVALID', 400);
  } finally {
    reader.releaseLock();
  }
}

async function executionForReceipt(db: D1Database, receipt: EarningReceipt) {
  const execution = await db
    .prepare(
      `SELECT id,user_id AS userId,tool,sample,status,finished_at AS finishedAt
       FROM jobs WHERE id=?`,
    )
    .bind(receipt.executionReceiptId)
    .first<CompletedExecution>();
  if (!execution)
    throw new EarningBridgeError('EXECUTION_RECEIPT_NOT_FOUND', 404);
  if (
    execution.userId !== receipt.userId ||
    execution.status !== 'completed' ||
    execution.sample !== 0 ||
    execution.finishedAt === null ||
    receipt.occurredAt < Math.floor(execution.finishedAt / 1000) ||
    (receipt.automationToolId !== undefined &&
      receipt.automationToolId !== execution.tool)
  )
    throw new EarningBridgeError('EXECUTION_RECEIPT_MISMATCH', 409);
  return execution;
}

export async function forwardProviderEarningReceipt(
  request: Request,
  db: D1Database,
  env: EarningBridgeEnvironment,
  send: typeof fetch = fetch,
) {
  const config = configuration(env);
  const raw = await rawBody(request);
  try {
    await verifyReceiptSignature(
      raw,
      request.headers.get(PROVIDER_SIGNATURE_HEADER),
      config.providerSecret,
    );
  } catch {
    throw new EarningBridgeError('PROVIDER_SIGNATURE_INVALID', 401);
  }

  let receipt: EarningReceipt;
  try {
    receipt = validateEarningReceipt(JSON.parse(raw) as unknown);
  } catch {
    throw new EarningBridgeError('EARNING_RECEIPT_INVALID', 400);
  }
  if (receipt.sourceProvider !== config.providerId)
    throw new EarningBridgeError('EARNING_PROVIDER_MISMATCH', 403);
  await executionForReceipt(db, receipt);

  let upstream: Response;
  try {
    upstream = await send(`${config.billingOrigin}/v1/earnings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Sky-Receipt-Signature': await createReceiptSignature(
          raw,
          config.settlementSecret,
        ),
      },
      body: raw,
    });
  } catch {
    throw new EarningBridgeError('BILLING_SERVICE_UNAVAILABLE', 503);
  }
  const responseBody = await upstream.text();
  if (!upstream.ok && upstream.status >= 500)
    throw new EarningBridgeError('BILLING_SERVICE_UNAVAILABLE', 503);
  return new Response(responseBody, {
    status: upstream.status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': upstream.headers.get('content-type') ?? 'application/json',
    },
  });
}

export function earningBridgeFailure(error: unknown) {
  const status = error instanceof EarningBridgeError ? error.status : 503;
  return Response.json(
    {
      error:
        status === 401
          ? 'Providerの署名を確認できませんでした。'
          : status === 403
            ? '登録されていない収益Providerです。'
            : status === 404
              ? '対応するツール実行が見つかりません。'
              : status === 409
                ? '完了済みの実行と収益証明が一致しません。'
                : status === 413
                  ? '収益証明のサイズ上限を超えています。'
                  : status === 415
                    ? '収益証明はJSONで送信してください。'
                    : status === 400
                      ? '収益証明の内容を確認できませんでした。'
                      : '収益精算サービスへ接続できませんでした。',
    },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}
