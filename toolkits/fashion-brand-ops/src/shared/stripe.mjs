// Canonical portable transport. Run scripts/sync-shared-stripe.mjs --write after editing.
// Merchant configuration, retries, amounts, stock and fulfillment belong to callers.
const API_ORIGIN = 'https://api.stripe.com';
const encoder = new TextEncoder();

export class StripeTransportError extends Error {
  /** @param {string} code @param {number} [status] */
  constructor(code, status) {
    super(code);
    this.name = 'StripeTransportError';
    this.status = status;
    this.providerCode = 'unclassified';
    /** @type {string | null} */
    this.requestId = null;
    this.kind = 'network-or-response';
  }
}

/** @param {unknown} value @returns {string} */
export function stripeIdempotencyKey(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9._:-]{1,255}$/.test(value)) {
    throw new StripeTransportError('STRIPE_IDEMPOTENCY_KEY_INVALID');
  }
  return value;
}

/** Encode both existing bracket keys and nested Stripe objects/arrays. Nulls are omitted.
 * @param {Record<string, unknown>} parameters
 */
export function stripeForm(parameters) {
  const fields = new URLSearchParams();
  /** @param {unknown} value @param {string} name */
  function append(value, name) {
    if (value === null || value === undefined) return;
    if (typeof value === 'object') {
      for (const [key, item] of Object.entries(value)) append(item, name ? `${name}[${key}]` : key);
    } else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      fields.append(name, String(value));
    } else {
      throw new StripeTransportError('STRIPE_FORM_INVALID');
    }
  }
  append(parameters, '');
  return fields;
}

/** A single request, with no automatic retry and no provider body in thrown errors.
 * @param {{ path: string, method?: 'GET' | 'POST', secretKey: string,
 * apiVersion?: string, parameters?: Record<string, unknown>, idempotencyKey?: string,
 * fetchImpl?: typeof fetch, timeoutMs?: number }} options
 * @returns {Promise<Record<string, unknown>>}
 */
export async function stripeRequest({ path, method = 'POST', secretKey, apiVersion,
  parameters = {}, idempotencyKey, fetchImpl = fetch, timeoutMs = 15_000 }) {
  // Never let a provider identifier or caller redirect credentials to another origin.
  if (!/^\/v1\/[A-Za-z0-9_/-]+$/.test(path) || (method !== 'GET' && method !== 'POST')) {
    throw new StripeTransportError('STRIPE_REQUEST_INVALID');
  }
  const fields = stripeForm(parameters);
  const url = new URL(path, API_ORIGIN);
  if (method === 'GET') url.search = fields.toString();
  /** @type {Record<string, string>} */
  const headers = { Authorization: `Bearer ${secretKey}` };
  if (apiVersion) headers['Stripe-Version'] = apiVersion;
  if (idempotencyKey !== undefined) headers['Idempotency-Key'] = stripeIdempotencyKey(idempotencyKey);
  if (method === 'POST') headers['Content-Type'] = 'application/x-www-form-urlencoded';
  try {
    const response = await fetchImpl(url.href, {
      method, headers, body: method === 'POST' ? fields.toString() : undefined,
      // Cloudflare Workers supports manual/follow. Reject redirects below without forwarding credentials.
      redirect: 'manual', signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      const failure = new StripeTransportError('STRIPE_HTTP_ERROR', response.status);
      const requestId = response.headers.get('request-id');
      failure.requestId = requestId && /^req_[A-Za-z0-9]{1,100}$/.test(requestId) ? requestId : null;
      const known = new Set(['api_key_expired', 'invalid_api_key', 'account_invalid',
        'amount_too_small', 'parameter_unknown', 'parameter_invalid_integer',
        'rate_limit', 'idempotency_key_in_use', 'platform_account_required']);
      try {
        const data = await response.json();
        if (typeof data?.error?.code === 'string' && known.has(data.error.code)) failure.providerCode = data.error.code;
      } catch { /* Never retain a provider body, message or submitted content. */ }
      throw failure;
    }
    const result = await response.json();
    if (!result || typeof result !== 'object' || Array.isArray(result)) {
      throw new StripeTransportError('STRIPE_RESPONSE_INVALID');
    }
    return result;
  } catch (error) {
    if (error instanceof StripeTransportError) throw error;
    // Network errors and response bodies can contain credentials or customer data.
    const failure = new StripeTransportError('STRIPE_REQUEST_FAILED');
    if (error instanceof Error && ['TimeoutError', 'AbortError', 'SyntaxError'].includes(error.name)) failure.kind = error.name;
    throw failure;
  }
}

/** @param {Uint8Array} left @param {Uint8Array} right */
function secureEqual(left, right) {
  let difference = left.length ^ right.length;
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}

/** Verify the untouched request body; all v1 signatures are eligible during key rotation.
 * @param {string} rawBody @param {string | null} signatureHeader @param {string} secret
 * @param {number} [nowSeconds] @param {number} [toleranceSeconds]
 */
export async function verifyStripeSignature(rawBody, signatureHeader, secret,
  nowSeconds = Math.floor(Date.now() / 1000), toleranceSeconds = 300) {
  const invalid = () => new Error('STRIPE_SIGNATURE_INVALID');
  if (!signatureHeader || !secret) throw invalid();
  const fields = signatureHeader.split(',').map((field) => field.trim().split('='));
  const timestamps = fields.filter(([key]) => key === 't');
  const timestampValue = timestamps[0]?.[1];
  const candidates = fields.filter(([key]) => key === 'v1').map(([, value]) => value);
  const timestamp = Number(timestampValue);
  if (timestamps.length !== 1 || !/^\d+$/.test(timestampValue ?? '')
    || !Number.isSafeInteger(timestamp) || !Number.isFinite(nowSeconds)
    || !Number.isFinite(toleranceSeconds) || toleranceSeconds < 0
    || Math.abs(nowSeconds - timestamp) > toleranceSeconds || candidates.length === 0) throw invalid();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const expected = new Uint8Array(await crypto.subtle.sign('HMAC', key,
    encoder.encode(`${timestampValue}.${rawBody}`)));
  const valid = candidates.some((candidate) => {
    if (!/^[0-9a-f]{64}$/iu.test(candidate ?? '')) return false;
    const bytes = Uint8Array.from({ length: 32 }, (_, index) =>
      Number.parseInt(candidate.slice(index * 2, index * 2 + 2), 16));
    return secureEqual(bytes, expected);
  });
  if (!valid) throw invalid();
}
