import { sha256Hex, type RockstarEntitlementIssuerKeyResolver } from './rockstar-entitlement-claim.ts';

export const ROCKSTAR_ENTITLEMENT_EVENT_SCHEMA = 'rockstar-service-entitlement-event/1' as const;
const DOMAIN = new TextEncoder().encode('rockstar-service-entitlement-event-signature/1\0');
const fields = ['schema', 'issuerId', 'issuerKeyId', 'eventId', 'claimId', 'purchaseReferenceSha256', 'eventType', 'issuedAt'] as const;
const idPattern = /^[A-Za-z0-9._:-]{1,128}$/;

export type RockstarEntitlementEvent = {
  schema: typeof ROCKSTAR_ENTITLEMENT_EVENT_SCHEMA;
  issuerId: string; issuerKeyId: string; eventId: string; claimId: string;
  purchaseReferenceSha256: string; eventType: 'refunded' | 'revoked'; issuedAt: number; signature: string;
};

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function rockstarEntitlementEventSigningBytes(event: RockstarEntitlementEvent) {
  const payload = new TextEncoder().encode(JSON.stringify(Object.fromEntries(fields.map((key) => [key, event[key]]))));
  const bytes = new Uint8Array(DOMAIN.length + payload.length);
  bytes.set(DOMAIN); bytes.set(payload, DOMAIN.length);
  return bytes;
}

export async function verifyRockstarEntitlementEvent(value: unknown, resolveKey: RockstarEntitlementIssuerKeyResolver, now = Date.now()) {
  if (!record(value)) return null;
  const expected = [...fields, 'signature'].sort();
  if (Object.keys(value).length !== expected.length || Object.keys(value).sort().some((key, index) => key !== expected[index])) return null;
  const event = value as unknown as RockstarEntitlementEvent;
  if (event.schema !== ROCKSTAR_ENTITLEMENT_EVENT_SCHEMA || !idPattern.test(event.issuerId) || !idPattern.test(event.issuerKeyId) ||
    !idPattern.test(event.eventId) || !idPattern.test(event.claimId) || !/^[a-f0-9]{64}$/.test(event.purchaseReferenceSha256) ||
    !['refunded', 'revoked'].includes(event.eventType) || !Number.isSafeInteger(event.issuedAt) ||
    event.issuedAt > now + 30_000 || event.issuedAt < now - 90 * 24 * 60 * 60 * 1000 ||
    typeof event.signature !== 'string' || !/^[A-Za-z0-9_-]{86}$/.test(event.signature)) return null;
  let publicKey: Uint8Array | null;
  try { publicKey = await resolveKey({ issuerId: event.issuerId, issuerKeyId: event.issuerKeyId }); } catch { return null; }
  if (!(publicKey instanceof Uint8Array) || publicKey.length !== 32) return null;
  try {
    const key = await crypto.subtle.importKey('raw', Uint8Array.from(publicKey).buffer as ArrayBuffer, { name: 'Ed25519' }, false, ['verify']);
    const raw = Uint8Array.from(atob(event.signature.replaceAll('-', '+').replaceAll('_', '/') + '=='), (character) => character.charCodeAt(0));
    if (raw.length !== 64 || btoa(String.fromCharCode(...raw)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '') !== event.signature) return null;
    return await crypto.subtle.verify({ name: 'Ed25519' }, key, raw, rockstarEntitlementEventSigningBytes(event)) ? event : null;
  } catch { return null; }
}

type Database = Pick<D1Database, 'prepare' | 'batch'>;
export function rockstarEntitlementEventStore(db: Database) {
  return {
    async apply(event: RockstarEntitlementEvent, now = Date.now()) {
      const eventHash = await sha256Hex(new TextDecoder().decode(rockstarEntitlementEventSigningBytes(event)) + `\0${event.signature}`);
      const existing = await db.prepare(`SELECT event_sha256 AS eventHash,applied_at AS appliedAt
        FROM rockstar_entitlement_events WHERE issuer_id = ? AND event_id = ?`).bind(event.issuerId, event.eventId)
        .first<{ eventHash: string; appliedAt: number | null }>();
      if (existing) {
        if (existing.eventHash !== eventHash) throw new Error('EVENT_ID_CONFLICT');
        return { alreadyApplied: true, eventId: event.eventId };
      }
      // Persist signed cancellation events even before redemption. The event is a
      // tombstone for this exact seller-issued handoff and blocks a delayed claim.
      const result = await db.batch([
        db.prepare(`INSERT OR IGNORE INTO rockstar_entitlement_events
          (issuer_id,event_id,claim_id,purchase_reference_sha256,event_type,issuer_key_id,event_sha256,signature,received_at,applied_at)
          VALUES (?,?,?,?,?,?,?,?,?,NULL)`).bind(event.issuerId, event.eventId, event.claimId, event.purchaseReferenceSha256,
          event.eventType, event.issuerKeyId, eventHash, event.signature, now),
        db.prepare(`UPDATE rockstar_service_entitlements SET status = ?, revoked_at = ?
          WHERE issuer_id = ? AND claim_id = ? AND purchase_reference_sha256 = ? AND status = 'active'
          AND EXISTS (SELECT 1 FROM rockstar_entitlement_events WHERE issuer_id = ? AND event_id = ? AND event_sha256 = ? AND applied_at IS NULL)`)
          .bind(event.eventType, now, event.issuerId, event.claimId, event.purchaseReferenceSha256, event.issuerId, event.eventId, eventHash),
        db.prepare(`UPDATE rockstar_entitlement_events SET applied_at = ? WHERE issuer_id = ? AND event_id = ? AND event_sha256 = ? AND applied_at IS NULL`)
          .bind(now, event.issuerId, event.eventId, eventHash),
      ]);
      if (result[0]?.meta.changes !== 1) {
        const raced = await db.prepare(`SELECT event_sha256 AS eventHash FROM rockstar_entitlement_events WHERE issuer_id = ? AND event_id = ?`)
          .bind(event.issuerId, event.eventId).first<{ eventHash: string }>();
        if (raced?.eventHash !== eventHash) throw new Error('EVENT_ID_CONFLICT');
        return { alreadyApplied: true, eventId: event.eventId };
      }
      return { alreadyApplied: false, eventId: event.eventId };
    },
  };
}
