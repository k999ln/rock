/** Provider-signed final usage proof for one A2A delegation. */
export const A2A_USAGE_RECEIPT_SCHEMA =
  'rock-a2a-provider-usage-receipt/1' as const;
const DOMAIN = new TextEncoder().encode('rock-a2a-provider-usage-receipt-signature/1\0');
const fields = [
  'schema', 'providerId', 'keyId', 'receiptId', 'ownerUserId', 'parentJobId',
  'delegationId', 'taskId', 'agentOrigin', 'agentName', 'agentVersion',
  'currency', 'amountMinor', 'pricingVersion', 'issuedAt', 'usage',
] as const;

export type A2AUsageReceipt = {
  schema: typeof A2A_USAGE_RECEIPT_SCHEMA;
  providerId: string;
  keyId: string;
  receiptId: string;
  ownerUserId: string;
  parentJobId: string;
  delegationId: string;
  taskId: string;
  agentOrigin: string;
  agentName: string;
  agentVersion: string;
  currency: string;
  amountMinor: number;
  pricingVersion: string;
  issuedAt: number;
  usage: Array<{ meter: string; quantity: number; unit: string; amountMinor: number }>;
  signature: string;
};

export type A2AUsageReceiptIntent = Pick<A2AUsageReceipt,
  'ownerUserId' | 'parentJobId' | 'delegationId' | 'taskId' | 'agentOrigin' |
  'agentName' | 'agentVersion' | 'currency' | 'amountMinor' | 'issuedAt'> & {
  delegationCreatedAt: number;
  delegationLimitMinor: number;
};

export type A2AUsageKeyResolver = (identity: { providerId: string; keyId: string; agentOrigin: string }) => Promise<Uint8Array | null>;

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function safeId(value: unknown) {
  return typeof value === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(value);
}

export function a2aUsageReceiptSigningBytes(receipt: A2AUsageReceipt) {
  const value = Object.fromEntries(fields.map((key) => [
    key,
    key === 'usage'
      ? receipt.usage.map((line) => ({
          meter: line.meter,
          quantity: line.quantity,
          unit: line.unit,
          amountMinor: line.amountMinor,
        }))
      : receipt[key],
  ]));
  const payload = new TextEncoder().encode(JSON.stringify(value));
  const bytes = new Uint8Array(DOMAIN.length + payload.length);
  bytes.set(DOMAIN);
  bytes.set(payload, DOMAIN.length);
  return bytes;
}

export async function verifyA2AUsageReceipt(
  value: unknown,
  intent: A2AUsageReceiptIntent,
  resolveKey: A2AUsageKeyResolver,
  now = Date.now(),
) {
  if (!record(value)) return false;
  const expected = [...fields, 'signature'].sort();
  if (Object.keys(value).length !== expected.length || Object.keys(value).sort().some((key, index) => key !== expected[index])) return false;
  const receipt = value as unknown as A2AUsageReceipt;
  if (receipt.schema !== A2A_USAGE_RECEIPT_SCHEMA ||
    !safeId(receipt.providerId) || !safeId(receipt.keyId) || !safeId(receipt.receiptId) ||
    !safeId(receipt.ownerUserId) || !safeId(receipt.parentJobId) || !safeId(receipt.delegationId) || !safeId(receipt.taskId) ||
    typeof receipt.agentOrigin !== 'string' || typeof receipt.agentName !== 'string' || !receipt.agentName.trim() ||
    typeof receipt.agentVersion !== 'string' || !receipt.agentVersion.trim() ||
    !/^[A-Z]{3}$/.test(receipt.currency) || !safeId(receipt.pricingVersion) ||
    !Number.isSafeInteger(receipt.amountMinor) || receipt.amountMinor < 0 ||
    !Number.isSafeInteger(receipt.issuedAt) || receipt.issuedAt < intent.delegationCreatedAt || receipt.issuedAt > now + 30_000 ||
    !Array.isArray(receipt.usage) || receipt.usage.length < 1 || receipt.usage.length > 32 ||
    typeof receipt.signature !== 'string' || !/^[A-Za-z0-9_-]{86}$/.test(receipt.signature)) return false;
  let origin: URL;
  try { origin = new URL(receipt.agentOrigin); } catch { return false; }
  if (origin.protocol !== 'https:' || origin.origin !== receipt.agentOrigin || origin.pathname !== '/' || origin.search || origin.hash || origin.username || origin.password) return false;
  let lineTotal = 0;
  for (const line of receipt.usage) {
    if (!record(line) || Object.keys(line).length !== 4 ||
      !safeId(line.meter) || !safeId(line.unit) ||
      !Number.isSafeInteger(line.quantity) || line.quantity < 0 ||
      !Number.isSafeInteger(line.amountMinor) || line.amountMinor < 0) return false;
    lineTotal += line.amountMinor;
    if (!Number.isSafeInteger(lineTotal)) return false;
  }
  if (lineTotal !== receipt.amountMinor || receipt.amountMinor > intent.delegationLimitMinor ||
    receipt.ownerUserId !== intent.ownerUserId || receipt.parentJobId !== intent.parentJobId ||
    receipt.delegationId !== intent.delegationId || receipt.taskId !== intent.taskId ||
    receipt.agentOrigin !== intent.agentOrigin || receipt.agentName !== intent.agentName ||
    receipt.agentVersion !== intent.agentVersion || receipt.currency !== intent.currency ||
    receipt.amountMinor !== intent.amountMinor || receipt.issuedAt !== intent.issuedAt) return false;
  let publicKey: Uint8Array | null;
  try { publicKey = await resolveKey({ providerId: receipt.providerId, keyId: receipt.keyId, agentOrigin: receipt.agentOrigin }); } catch { return false; }
  if (!(publicKey instanceof Uint8Array) || publicKey.length !== 32) return false;
  try {
    const rawKey = Uint8Array.from(publicKey);
    const key = await crypto.subtle.importKey('raw', rawKey.buffer as ArrayBuffer, { name: 'Ed25519' }, false, ['verify']);
    const signature = Uint8Array.from(atob(receipt.signature.replaceAll('-', '+').replaceAll('_', '/') + '=='), (character) => character.charCodeAt(0));
    if (signature.length !== 64 || btoa(String.fromCharCode(...signature)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '') !== receipt.signature) return false;
    const bytes = a2aUsageReceiptSigningBytes(receipt);
    return await crypto.subtle.verify({ name: 'Ed25519' }, key, signature, bytes);
  } catch { return false; }
}

type TrustedUsageKey = { providerId: string; keyId: string; agentOrigin: string; publicKeyHex: string; status: 'active' | 'revoked' };
function parseTrustedA2AUsageKeys(configuration: unknown) {
  if (typeof configuration !== 'string' || configuration.length > 65_536) return null;
  let value: unknown;
  try { value = JSON.parse(configuration); } catch { return null; }
  if (!Array.isArray(value) || value.length > 256) return null;
  const entries = new Map<string, TrustedUsageKey>();
  for (const item of value) {
    if (!record(item) || Object.keys(item).length !== 5 || !safeId(item.providerId) || !safeId(item.keyId) ||
      typeof item.agentOrigin !== 'string' ||
      typeof item.publicKeyHex !== 'string' || !/^[a-f0-9]{64}$/i.test(item.publicKeyHex) ||
      (item.status !== 'active' && item.status !== 'revoked')) return null;
    const key = `${item.providerId as string}\0${item.keyId as string}\0${item.agentOrigin}`;
    if (entries.has(key)) return null;
    entries.set(key, item as TrustedUsageKey);
  }
  return entries;
}

export function hasActiveA2AUsageKeyForOrigin(configuration: unknown, agentOrigin: string) {
  const entries = parseTrustedA2AUsageKeys(configuration);
  if (!entries) return false;
  return [...entries.values()].some((entry) => entry.status === 'active' && entry.agentOrigin === agentOrigin);
}

export function trustedA2AUsageKeyResolver(configuration: unknown): A2AUsageKeyResolver {
  const entries = parseTrustedA2AUsageKeys(configuration);
  if (!entries) return async () => null;
  return async ({ providerId, keyId, agentOrigin }) => {
    const entry = entries.get(`${providerId}\0${keyId}\0${agentOrigin}`);
    return entry?.status === 'active'
      ? Uint8Array.from(entry.publicKeyHex.match(/.{2}/g)!, (byte) => Number.parseInt(byte, 16))
      : null;
  };
}
