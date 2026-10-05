import { createHash } from 'node:crypto';
import { env } from 'cloudflare:workers';
import { a2aDelegationStore } from '@/lib/a2a-delegation-store';
import { database } from '@/lib/fund-store';
import { requestRockstarUser } from '@/lib/rockstar-device-link';
import { verifyA2AWalletHandoffRequest } from '@/lib/a2a-wallet-handoff-auth';
import { a2aBrokerDeviceKeyResolver } from '@/lib/a2a-broker-trust';
import {
  verifyA2AUsageReceipt,
  trustedA2AUsageKeyResolver,
  type A2AUsageReceipt,
} from '@/lib/a2a-usage-receipt';

type Context = { params: Promise<{ id: string }> };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const terminalStates = new Set(['remote_completed', 'remote_failed', 'remote_cancelled', 'remote_rejected']);
const MAX_SIGNED_REQUEST_BYTES = 4096;

function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
}

function errorResponse(error: unknown) {
  if (error instanceof Error && error.message === 'UNAUTHORIZED')
    return json({ error: 'サインインが必要です。' }, 401);
  if (error instanceof Error && error.message === 'ORIGIN')
    return json({ error: 'このサイトから操作してください。' }, 403);
  return json({ error: '端末Walletへの精算情報を確認できませんでした。' }, 503);
}

async function readBoundedBody(request: Request): Promise<string | null> {
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_SIGNED_REQUEST_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

async function createHandoff(owner: string, id: string) {
  const store = a2aDelegationStore(database());
  const delegation = await store.get(owner, id);
  if (!delegation) return json({ error: '委任が見つかりません。' }, 404);
  if (!delegation.remoteTaskId || !terminalStates.has(delegation.state))
    return json({ error: 'Provider側の最終状態が確認されるまで精算情報を渡せません。', code: 'REMOTE_TASK_NOT_TERMINAL' }, 409);

  const [usage, reservation] = await Promise.all([
    store.getUsageReceipt(owner, id),
    store.getBudgetReservation(owner, id),
  ]);
  if (!usage || !reservation ||
    usage.ownerUserId !== owner || usage.delegationId !== delegation.id ||
    usage.parentJobId !== delegation.parentJobId ||
    reservation.ownerUserId !== owner || reservation.delegationId !== delegation.id ||
    reservation.parentJobId !== delegation.parentJobId ||
    reservation.reservedMinor !== delegation.budgetLimitMinor ||
    reservation.state !== 'settled' || reservation.settledMinor !== usage.amountMinor ||
    reservation.currency !== usage.currency || usage.currency !== delegation.budgetCurrency)
    return json({ error: '署名済み利用量とクラウド予算台帳の照合が完了していません。', code: 'CLOUD_USAGE_NOT_SETTLED' }, 409);

  let receipt: A2AUsageReceipt;
  try { receipt = JSON.parse(usage.receiptJson) as A2AUsageReceipt; }
  catch { return json({ error: '保存されたProvider receiptが不正です。', code: 'INVALID_STORED_RECEIPT' }, 503); }
  if (receipt.providerId !== usage.providerId || receipt.receiptId !== usage.providerReference ||
    receipt.currency !== usage.currency || receipt.amountMinor !== usage.amountMinor ||
    receipt.issuedAt !== usage.issuedAt)
    return json({ error: 'Provider receiptと精算台帳の参照が一致しません。', code: 'USAGE_LEDGER_MISMATCH' }, 409);
  const valid = await verifyA2AUsageReceipt(receipt, {
    ownerUserId: owner,
    parentJobId: delegation.parentJobId,
    delegationId: delegation.id,
    taskId: delegation.remoteTaskId,
    agentOrigin: delegation.targetOrigin,
    agentName: delegation.targetAgentName,
    agentVersion: delegation.targetAgentVersion,
    currency: delegation.budgetCurrency,
    amountMinor: usage.amountMinor,
    issuedAt: usage.issuedAt,
    delegationCreatedAt: delegation.createdAt,
    delegationLimitMinor: delegation.budgetLimitMinor,
  }, trustedA2AUsageKeyResolver(
    (env as unknown as { A2A_TRUSTED_USAGE_KEYS?: string }).A2A_TRUSTED_USAGE_KEYS,
  ));
  if (!valid) return json({ error: 'Provider署名または精算条件を再確認できません。', code: 'USAGE_RECEIPT_UNTRUSTED' }, 409);

  const receiptSha256 = createHash('sha256').update(usage.receiptJson).digest('hex');
  const idempotencySuffix = createHash('sha256').update(`${receipt.providerId}\0${receipt.receiptId}`).digest('hex').slice(0, 24);
  return json({
    schema: 'rock-a2a-wallet-settlement-handoff/1',
    state: 'ready_for_device_wallet',
    idempotencyKey: `a2a-settle-${delegation.id}-${idempotencySuffix}`,
    receiptSha256,
    reservation: {
      ownerUserId: owner,
      delegationId: delegation.id,
      parentJobId: delegation.parentJobId,
      currency: reservation.currency,
      reservedMinor: reservation.reservedMinor,
      settledMinor: reservation.settledMinor,
      deadlineAt: delegation.deadlineAt,
      authorizationSha256: delegation.authorizationSha256,
    },
    walletCommand: {
      v: 1,
      op: 'a2a.budget.settle',
      key: `a2a-settle-${delegation.id}-${idempotencySuffix}`,
      delegation_id: delegation.id,
      receipt,
    },
  });
}

/**
 * Return a stable, owner-authenticated handoff for RockstarOS's local Wallet.
 * The native Wallet verifies the provider signature again and settles its own
 * reservation idempotently; this endpoint never mutates either ledger.
 */
export async function GET(request: Request, context: Context) {
  try {
    const owner = await requestRockstarUser(request, database());
    const { id } = await context.params;
    if (!uuid.test(id)) return json({ error: '委任IDが不正です。' }, 400);
    return await createHandoff(owner, id);
  } catch (error) {
    return errorResponse(error);
  }
}

/** Device-key-authenticated, read-only route for the already settled Cloud receipt. */
export async function POST(request: Request, context: Context) {
  try {
    if (request.headers.get('Content-Type')?.split(';')[0] !== 'application/json')
      return json({ error: 'JSON required' }, 415);
    const length = Number(request.headers.get('Content-Length'));
    if (!Number.isInteger(length) || length < 1 || length > MAX_SIGNED_REQUEST_BYTES)
      return json({ error: 'signed request exceeds limit' }, 413);
    const text = await readBoundedBody(request);
    if (text === null || new TextEncoder().encode(text).byteLength !== length)
      return json({ error: 'invalid signed request length' }, 400);
    let value: unknown;
    try { value = JSON.parse(text); }
    catch { return json({ error: 'invalid signed request' }, 400); }

    const config = env as unknown as { A2A_TRUSTED_BROKER_KEYS?: string };
    const signed = await verifyA2AWalletHandoffRequest(
      value, a2aBrokerDeviceKeyResolver(database(), config.A2A_TRUSTED_BROKER_KEYS),
    );
    if (!signed) return json({ error: 'device signature or request scope is invalid' }, 403);
    const { id } = await context.params;
    if (!uuid.test(id) || id !== signed.delegationId)
      return json({ error: '委任IDが不正です。' }, 400);
    const store = a2aDelegationStore(database());
    const [delegation, authorization] = await Promise.all([
      store.get(signed.ownerUserId, id),
      store.getBrokerAuthorization(signed.ownerUserId, id),
    ]);
    if (!delegation || !authorization) return json({ error: '委任が見つかりません。' }, 404);
    if (!delegation.continueWhileDeviceOffline ||
      authorization.deviceRef !== signed.deviceRef ||
      authorization.authorityId !== signed.authorityId ||
      authorization.keyId !== signed.keyId)
      return json({ error: 'device is not bound to this offline-approved delegation' }, 403);
    return await createHandoff(signed.ownerUserId, id);
  } catch {
    return json({ error: '端末署名による精算情報の取得に失敗しました。' }, 503);
  }
}
