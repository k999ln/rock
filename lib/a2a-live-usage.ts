/** Signed cumulative meter snapshot. It is provisional until the final receipt reconciles it. */
export const A2A_LIVE_USAGE_SCHEMA = 'rock-a2a-provider-live-usage/1' as const;
const DOMAIN = new TextEncoder().encode('rock-a2a-provider-live-usage-signature/1\0');
const fields = [
  'schema', 'providerId', 'keyId', 'eventId', 'sequence', 'ownerUserId', 'parentJobId',
  'delegationId', 'taskId', 'agentOrigin', 'agentName', 'agentVersion', 'currency',
  'cumulativeAmountMinor', 'pricingVersion', 'issuedAt', 'usage',
] as const;

export type A2ALiveUsageSnapshot = {
  schema: typeof A2A_LIVE_USAGE_SCHEMA;
  providerId: string;
  keyId: string;
  eventId: string;
  sequence: number;
  ownerUserId: string;
  parentJobId: string;
  delegationId: string;
  taskId: string;
  agentOrigin: string;
  agentName: string;
  agentVersion: string;
  currency: string;
  cumulativeAmountMinor: number;
  pricingVersion: string;
  issuedAt: number;
  usage: Array<{ meter: string; quantity: number; unit: string; amountMinor: number }>;
  signature: string;
};

export type A2ALiveUsageIntent = Pick<A2ALiveUsageSnapshot,
  'ownerUserId' | 'parentJobId' | 'delegationId' | 'taskId' | 'agentOrigin' |
  'agentName' | 'agentVersion' | 'currency'> & {
  delegationCreatedAt: number;
  delegationLimitMinor: number;
  previousSequence: number;
  previousAmountMinor: number;
  previousIssuedAt: number;
};

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
const safeId = (value: unknown) => typeof value === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(value);

export function a2aLiveUsageSigningBytes(snapshot: A2ALiveUsageSnapshot) {
  const payload = new TextEncoder().encode(JSON.stringify(Object.fromEntries(fields.map((key) => [
    key,
    key === 'usage' ? snapshot.usage.map((line) => ({
      meter: line.meter, quantity: line.quantity, unit: line.unit, amountMinor: line.amountMinor,
    })) : snapshot[key],
  ]))));
  const bytes = new Uint8Array(DOMAIN.length + payload.length);
  bytes.set(DOMAIN);
  bytes.set(payload, DOMAIN.length);
  return bytes;
}

export async function verifyA2ALiveUsageSnapshot(
  value: unknown,
  intent: A2ALiveUsageIntent,
  resolveKey: (identity: { providerId: string; keyId: string; agentOrigin: string }) => Promise<Uint8Array | null>,
  now = Date.now(),
) {
  if (!record(value)) return false;
  const expected = [...fields, 'signature'].sort();
  if (Object.keys(value).length !== expected.length || Object.keys(value).sort().some((key, index) => key !== expected[index])) return false;
  const snapshot = value as unknown as A2ALiveUsageSnapshot;
  if (snapshot.schema !== A2A_LIVE_USAGE_SCHEMA ||
    !safeId(snapshot.providerId) || !safeId(snapshot.keyId) || !safeId(snapshot.eventId) ||
    !Number.isSafeInteger(snapshot.sequence) || snapshot.sequence !== intent.previousSequence + 1 ||
    !safeId(snapshot.ownerUserId) || !safeId(snapshot.parentJobId) || !safeId(snapshot.delegationId) || !safeId(snapshot.taskId) ||
    typeof snapshot.agentOrigin !== 'string' || typeof snapshot.agentName !== 'string' || !snapshot.agentName.trim() ||
    typeof snapshot.agentVersion !== 'string' || !snapshot.agentVersion.trim() ||
    !/^[A-Z]{3}$/.test(snapshot.currency) || !safeId(snapshot.pricingVersion) ||
    !Number.isSafeInteger(snapshot.cumulativeAmountMinor) ||
    snapshot.cumulativeAmountMinor < intent.previousAmountMinor ||
    snapshot.cumulativeAmountMinor > intent.delegationLimitMinor ||
    !Number.isSafeInteger(snapshot.issuedAt) || snapshot.issuedAt <= intent.previousIssuedAt ||
    snapshot.issuedAt < intent.delegationCreatedAt || snapshot.issuedAt > now + 30_000 ||
    !Array.isArray(snapshot.usage) || snapshot.usage.length < 1 || snapshot.usage.length > 32 ||
    typeof snapshot.signature !== 'string' || !/^[A-Za-z0-9_-]{86}$/.test(snapshot.signature)) return false;
  let origin: URL;
  try { origin = new URL(snapshot.agentOrigin); } catch { return false; }
  if (origin.protocol !== 'https:' || origin.origin !== snapshot.agentOrigin || origin.pathname !== '/' || origin.search || origin.hash || origin.username || origin.password) return false;
  let total = 0;
  for (const line of snapshot.usage) {
    if (!record(line) || Object.keys(line).length !== 4 || !safeId(line.meter) || !safeId(line.unit) ||
      !Number.isSafeInteger(line.quantity) || line.quantity < 0 ||
      !Number.isSafeInteger(line.amountMinor) || line.amountMinor < 0) return false;
    total += line.amountMinor;
    if (!Number.isSafeInteger(total)) return false;
  }
  if (total !== snapshot.cumulativeAmountMinor ||
    snapshot.ownerUserId !== intent.ownerUserId || snapshot.parentJobId !== intent.parentJobId ||
    snapshot.delegationId !== intent.delegationId || snapshot.taskId !== intent.taskId ||
    snapshot.agentOrigin !== intent.agentOrigin || snapshot.agentName !== intent.agentName ||
    snapshot.agentVersion !== intent.agentVersion || snapshot.currency !== intent.currency) return false;
  let publicKey: Uint8Array | null;
  try { publicKey = await resolveKey({ providerId: snapshot.providerId, keyId: snapshot.keyId, agentOrigin: snapshot.agentOrigin }); }
  catch { return false; }
  if (!(publicKey instanceof Uint8Array) || publicKey.length !== 32) return false;
  try {
    const key = await crypto.subtle.importKey('raw', Uint8Array.from(publicKey).buffer as ArrayBuffer, { name: 'Ed25519' }, false, ['verify']);
    const signature = Uint8Array.from(atob(snapshot.signature.replaceAll('-', '+').replaceAll('_', '/') + '=='), (c) => c.charCodeAt(0));
    if (signature.length !== 64 || btoa(String.fromCharCode(...signature)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '') !== snapshot.signature) return false;
    return await crypto.subtle.verify({ name: 'Ed25519' }, key, signature, a2aLiveUsageSigningBytes(snapshot));
  } catch { return false; }
}
