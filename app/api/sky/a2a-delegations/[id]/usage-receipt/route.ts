import { env } from 'cloudflare:workers';
import { a2aDelegationStore, A2ADelegationStoreError } from '@/lib/a2a-delegation-store';
import { database } from '@/lib/fund-store';
import {
  trustedA2AUsageKeyResolver,
  verifyA2AUsageReceipt,
  type A2AUsageReceipt,
} from '@/lib/a2a-usage-receipt';

type Context = { params: Promise<{ id: string }> };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BYTES = 16_384;

function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
}

async function readBody(request: Request) {
  if (request.headers.get('Content-Type')?.split(';')[0] !== 'application/json')
    throw new Error('CONTENT_TYPE');
  const header = request.headers.get('Content-Length');
  const declared = header === null ? null : Number(header);
  if (declared !== null &&
      (!Number.isSafeInteger(declared) || declared < 2 || declared > MAX_BYTES))
    throw new Error('BODY_SIZE');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('BODY_SIZE');
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > MAX_BYTES) {
      await reader.cancel();
      throw new Error('BODY_SIZE');
    }
    chunks.push(value);
  }
  if (length < 2 || (declared !== null && length !== declared))
    throw new Error('BODY_SIZE');
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
}

/**
 * Provider callback authenticated by the receipt's Ed25519 signature. A valid
 * callback can only settle the already reserved amount for the exact terminal
 * task; it cannot create work, expand the cap, or change task state.
 */
export async function POST(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    if (!uuid.test(id)) return json({ code: 'INVALID_DELEGATION_ID' }, 400);
    const value = await readBody(request);
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return json({ code: 'INVALID_RECEIPT' }, 400);
    const receipt = value as A2AUsageReceipt;
    if (receipt.delegationId !== id || typeof receipt.ownerUserId !== 'string')
      return json({ code: 'RECEIPT_SCOPE_MISMATCH' }, 409);
    const store = a2aDelegationStore(database());
    const delegation = await store.get(receipt.ownerUserId, id);
    if (!delegation || !delegation.remoteTaskId || !delegation.priceQuote)
      return json({ code: 'DELEGATION_NOT_SETTLEABLE' }, 409);
    if (receipt.pricingVersion !== delegation.priceQuote.pricingVersion)
      return json({ code: 'PRICING_VERSION_MISMATCH' }, 409);
    const keys = (env as unknown as { A2A_TRUSTED_USAGE_KEYS?: string }).A2A_TRUSTED_USAGE_KEYS;
    const valid = keys && await verifyA2AUsageReceipt(receipt, {
      ownerUserId: delegation.ownerUserId,
      parentJobId: delegation.parentJobId,
      delegationId: delegation.id,
      taskId: delegation.remoteTaskId,
      agentOrigin: delegation.targetOrigin,
      agentName: delegation.targetAgentName,
      agentVersion: delegation.targetAgentVersion,
      currency: delegation.budgetCurrency,
      amountMinor: receipt.amountMinor,
      issuedAt: receipt.issuedAt,
      delegationCreatedAt: delegation.createdAt,
      delegationLimitMinor: delegation.budgetLimitMinor,
    }, trustedA2AUsageKeyResolver(keys));
    if (!valid) return json({ code: 'UNTRUSTED_USAGE_RECEIPT' }, 403);
    await store.settleUsageReceipt(delegation.ownerUserId, delegation.id, receipt);
    return json({ accepted: true, delegationId: delegation.id, receiptId: receipt.receiptId }, 202);
  } catch (error) {
    if (error instanceof A2ADelegationStoreError) {
      const conflict = error.code.includes('conflict') || error.code.includes('mismatch');
      return json({ code: error.code }, conflict ? 409 : 400);
    }
    if (error instanceof SyntaxError ||
        (error instanceof Error && ['CONTENT_TYPE', 'BODY_SIZE'].includes(error.message)))
      return json({ code: 'INVALID_REQUEST' }, 400);
    return json({ code: 'RECEIPT_STORE_UNAVAILABLE' }, 503);
  }
}
