import { env } from 'cloudflare:workers';
import { a2aDelegationStore } from '@/lib/a2a-delegation-store';
import { database } from '@/lib/fund-store';
import { trustedA2AUsageKeyResolver } from '@/lib/a2a-usage-receipt';
import { a2aLiveUsageSigningBytes, verifyA2ALiveUsageSnapshot, type A2ALiveUsageSnapshot } from '@/lib/a2a-live-usage';

type Context = { params: Promise<{ id: string }> };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const safeId = (value: unknown) => typeof value === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(value);

function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
}

async function readSnapshot(request: Request): Promise<unknown> {
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > 12_000) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch { return null; }
}

/** Provider callback: Ed25519 signature + single-use event/sequence is the authentication boundary. */
export async function POST(request: Request, context: Context) {
  const { id } = await context.params;
  if (!uuid.test(id)) return json({ error: '委任IDが不正です。' }, 400);
  const value = await readSnapshot(request);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return json({ error: '署名snapshotの形式を確認してください。' }, 400);
  const snapshot = value as A2ALiveUsageSnapshot;
  if (!safeId(snapshot.providerId) || !safeId(snapshot.eventId) || !safeId(snapshot.ownerUserId) ||
    snapshot.delegationId !== id || typeof snapshot.signature !== 'string')
    return json({ error: '委任・Provider・eventの識別情報を確認してください。' }, 400);
  const store = a2aDelegationStore(database());
  const priorEvent = await store.getLiveUsageSnapshotByEvent(snapshot.providerId, snapshot.eventId);
  if (priorEvent) {
    let prior: A2ALiveUsageSnapshot | null = null;
    try { prior = JSON.parse(priorEvent.snapshotJson) as A2ALiveUsageSnapshot; } catch { /* refuse malformed stored evidence */ }
    let sameSignedPayload = false;
    try {
      const priorBytes = a2aLiveUsageSigningBytes(prior as A2ALiveUsageSnapshot);
      const requestBytes = a2aLiveUsageSigningBytes(snapshot);
      sameSignedPayload = priorBytes.length === requestBytes.length && priorBytes.every((byte, index) => byte === requestBytes[index]);
    } catch { /* malformed duplicate payloads conflict */ }
    if (priorEvent.delegationId === id && prior?.signature === snapshot.signature && prior.sequence === snapshot.sequence && sameSignedPayload)
      return json({ accepted: true, idempotent: true, provisional: true, sequence: prior.sequence,
        cumulativeAmountMinor: prior.cumulativeAmountMinor, currency: prior.currency }, 202);
    return json({ error: '同じProvider event IDが別内容で使われています。', code: 'LIVE_USAGE_EVENT_REPLAY_CONFLICT' }, 409);
  }
  const delegation = await store.get(snapshot.ownerUserId, id);
  if (!delegation || !delegation.remoteTaskId) return json({ error: '対象のremote taskを確認できません。' }, 404);
  const latest = await store.getLatestLiveUsageSnapshot(snapshot.ownerUserId, id);
  const quote = delegation.priceQuote;
  const keyConfiguration = (env as unknown as { A2A_TRUSTED_USAGE_KEYS?: string }).A2A_TRUSTED_USAGE_KEYS;
  if (!keyConfiguration) return json({ error: 'Provider meterの信頼鍵が未設定です。', code: 'LIVE_USAGE_TRUST_NOT_CONFIGURED' }, 503);
  if (!quote || quote.providerId !== snapshot.providerId || quote.pricingVersion !== snapshot.pricingVersion)
    return json({ error: 'Provider meterが承認済み見積条件と一致しません。', code: 'LIVE_USAGE_PRICE_MISMATCH' }, 409);
  const valid = await verifyA2ALiveUsageSnapshot(snapshot, {
    ownerUserId: delegation.ownerUserId,
    parentJobId: delegation.parentJobId,
    delegationId: delegation.id,
    taskId: delegation.remoteTaskId,
    agentOrigin: delegation.targetOrigin,
    agentName: delegation.targetAgentName,
    agentVersion: delegation.targetAgentVersion,
    currency: delegation.budgetCurrency,
    delegationCreatedAt: delegation.createdAt,
    delegationLimitMinor: delegation.budgetLimitMinor,
    previousSequence: latest?.sequence ?? 0,
    previousAmountMinor: latest?.cumulativeAmountMinor ?? 0,
    previousIssuedAt: latest?.issuedAt ?? 0,
  }, trustedA2AUsageKeyResolver(keyConfiguration));
  if (!valid) return json({ error: 'Provider署名、順序、費用上限または委任条件を確認できません。', code: 'LIVE_USAGE_UNTRUSTED' }, 409);
  try {
    const stored = await store.recordLiveUsageSnapshot(snapshot.ownerUserId, id, snapshot);
    return json({ accepted: true, idempotent: false, provisional: true,
      sequence: stored.sequence, cumulativeAmountMinor: stored.cumulativeAmountMinor,
      currency: stored.currency, receivedAt: stored.receivedAt }, 202);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : '利用量snapshotを保存できません。',
      code: error instanceof Error && 'code' in error ? error.code : 'LIVE_USAGE_STORE_FAILED' }, 409);
  }
}
