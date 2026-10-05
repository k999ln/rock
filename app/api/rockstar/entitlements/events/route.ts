import { env } from 'cloudflare:workers';
import { database } from '@/lib/fund-store';
import { trustedRockstarEntitlementIssuerKeyResolver } from '@/lib/rockstar-entitlement-claim';
import { rockstarEntitlementEventStore, verifyRockstarEntitlementEvent } from '@/lib/rockstar-entitlement-event';

const json = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });

/** Signed issuer webhook for purchase refund/revocation; no user session or PII is accepted. */
export async function POST(request: Request) {
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > 8_192) return json({ error: 'eventが大きすぎます。' }, 413);
    const input = JSON.parse(raw) as Record<string, unknown>;
    const issuers = (env as unknown as { ROCKSTAR_SERVICE_CLAIM_ISSUERS?: string }).ROCKSTAR_SERVICE_CLAIM_ISSUERS;
    const event = await verifyRockstarEntitlementEvent(input.event, trustedRockstarEntitlementIssuerKeyResolver(issuers));
    if (!event) return json({ error: '署名済みの返金・失効eventを確認できません。' }, 400);
    const result = await rockstarEntitlementEventStore(database()).apply(event);
    return json({ eventId: result.eventId, status: event.eventType, alreadyApplied: result.alreadyApplied });
  } catch (error) {
    if (error instanceof SyntaxError) return json({ error: 'eventの形式を確認してください。' }, 400);
    if (error instanceof Error && error.message === 'EVENT_ID_CONFLICT') return json({ error: 'event IDが競合しています。' }, 409);
    if (error instanceof Error && error.message === 'ENTITLEMENT_NOT_FOUND') return json({ error: '対象の購入claimが見つかりません。' }, 404);
    return json({ error: '返金・失効eventを適用できませんでした。' }, 503);
  }
}
