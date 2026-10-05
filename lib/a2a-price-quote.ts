/** Signed, request-bound price disclosure for a single A2A task. */
export const A2A_PRICE_QUOTE_SCHEMA = 'rock-a2a-provider-price-quote/1' as const;
const DOMAIN = new TextEncoder().encode('rock-a2a-provider-price-quote-signature/1\0');
const fields = [
  'schema', 'providerId', 'keyId', 'quoteId', 'agentOrigin', 'agentName',
  'agentVersion', 'requestSha256', 'pricingVersion', 'pricingSha256',
  'currency', 'estimateMinor', 'maxAmountMinor', 'issuedAt', 'expiresAt', 'usage',
] as const;

export type A2APriceQuote = {
  schema: typeof A2A_PRICE_QUOTE_SCHEMA;
  providerId: string;
  keyId: string;
  quoteId: string;
  agentOrigin: string;
  agentName: string;
  agentVersion: string;
  requestSha256: string;
  pricingVersion: string;
  pricingSha256: string;
  currency: string;
  estimateMinor: number;
  maxAmountMinor: number;
  issuedAt: number;
  expiresAt: number;
  usage: Array<{ meter: string; quantity: number; unit: string; unitPriceMinor: number; amountMinor: number }>;
  signature: string;
};

export type A2APriceQuoteIntent = Pick<A2APriceQuote,
  'agentOrigin' | 'agentName' | 'agentVersion' | 'requestSha256' | 'currency'> & {
  maximumBudgetMinor: number;
};

export type A2APriceQuoteKeyResolver = (identity: {
  providerId: string; keyId: string; agentOrigin: string;
}) => Promise<Uint8Array | null>;

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function safeId(value: unknown) {
  return typeof value === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(value);
}

function safeAgentName(value: unknown) {
  if (typeof value !== 'string' || !value.trim() || value.length > 128) return false;
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code < 32 || (code >= 127 && code <= 159)) return false;
  }
  return true;
}

function validOrigin(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.origin === value && url.pathname === '/' &&
      !url.search && !url.hash && !url.username && !url.password;
  } catch { return false; }
}

export function a2aPriceQuoteSigningBytes(quote: A2APriceQuote) {
  const value = Object.fromEntries(fields.map((key) => [
    key,
    key === 'usage'
      ? quote.usage.map((line) => ({
          meter: line.meter, quantity: line.quantity, unit: line.unit,
          unitPriceMinor: line.unitPriceMinor, amountMinor: line.amountMinor,
        }))
      : quote[key],
  ]));
  const payload = new TextEncoder().encode(JSON.stringify(value));
  const bytes = new Uint8Array(DOMAIN.length + payload.length);
  bytes.set(DOMAIN);
  bytes.set(payload, DOMAIN.length);
  return bytes;
}

/** Stable digest to bind the exact signed terms into owner approval and reservation. */
export async function a2aPriceQuoteDigest(quote: A2APriceQuote) {
  const digest = await crypto.subtle.digest('SHA-256', a2aPriceQuoteSigningBytes(quote));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function verifyA2APriceQuote(
  value: unknown,
  intent: A2APriceQuoteIntent,
  resolveKey: A2APriceQuoteKeyResolver,
  now = Date.now(),
) {
  if (!record(value)) return false;
  const expected = [...fields, 'signature'].sort();
  if (Object.keys(value).length !== expected.length || Object.keys(value).sort().some((key, index) => key !== expected[index])) return false;
  const quote = value as unknown as A2APriceQuote;
  if (quote.schema !== A2A_PRICE_QUOTE_SCHEMA ||
    !safeId(quote.providerId) || !safeId(quote.keyId) || !safeId(quote.quoteId) ||
    !validOrigin(quote.agentOrigin) || !safeAgentName(quote.agentName) || !safeId(quote.agentVersion) ||
    !/^[a-f0-9]{64}$/.test(quote.requestSha256) || !safeId(quote.pricingVersion) ||
    !/^[a-f0-9]{64}$/.test(quote.pricingSha256) || !/^[A-Z]{3}$/.test(quote.currency) ||
    !Number.isSafeInteger(quote.estimateMinor) || quote.estimateMinor < 0 ||
    !Number.isSafeInteger(quote.maxAmountMinor) || quote.maxAmountMinor < quote.estimateMinor ||
    !Number.isSafeInteger(quote.issuedAt) || quote.issuedAt > now + 30_000 ||
    !Number.isSafeInteger(quote.expiresAt) || quote.expiresAt <= now || quote.expiresAt <= quote.issuedAt ||
    quote.expiresAt - quote.issuedAt > 24 * 60 * 60 * 1000 ||
    !Array.isArray(quote.usage) || quote.usage.length < 1 || quote.usage.length > 32 ||
    typeof quote.signature !== 'string' || !/^[A-Za-z0-9_-]{86}$/.test(quote.signature)) return false;
  let estimate = 0;
  for (const line of quote.usage) {
    if (!record(line) || Object.keys(line).length !== 5 ||
      !safeId(line.meter) || !safeId(line.unit) ||
      !Number.isSafeInteger(line.quantity) || line.quantity < 0 ||
      !Number.isSafeInteger(line.unitPriceMinor) || line.unitPriceMinor < 0 ||
      !Number.isSafeInteger(line.amountMinor) || line.amountMinor < 0 ||
      !Number.isSafeInteger(line.quantity * line.unitPriceMinor) ||
      line.amountMinor !== line.quantity * line.unitPriceMinor) return false;
    estimate += line.amountMinor;
    if (!Number.isSafeInteger(estimate)) return false;
  }
  if (estimate !== quote.estimateMinor || quote.maxAmountMinor > intent.maximumBudgetMinor ||
    quote.agentOrigin !== intent.agentOrigin || quote.agentName !== intent.agentName ||
    quote.agentVersion !== intent.agentVersion || quote.requestSha256 !== intent.requestSha256 ||
    quote.currency !== intent.currency) return false;
  let publicKey: Uint8Array | null;
  try { publicKey = await resolveKey({ providerId: quote.providerId, keyId: quote.keyId, agentOrigin: quote.agentOrigin }); }
  catch { return false; }
  if (!(publicKey instanceof Uint8Array) || publicKey.length !== 32) return false;
  try {
    const key = await crypto.subtle.importKey('raw', Uint8Array.from(publicKey).buffer as ArrayBuffer, { name: 'Ed25519' }, false, ['verify']);
    const raw = Uint8Array.from(atob(quote.signature.replaceAll('-', '+').replaceAll('_', '/') + '=='), (character) => character.charCodeAt(0));
    if (raw.length !== 64 || btoa(String.fromCharCode(...raw)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '') !== quote.signature) return false;
    return await crypto.subtle.verify({ name: 'Ed25519' }, key, raw, a2aPriceQuoteSigningBytes(quote));
  } catch { return false; }
}
