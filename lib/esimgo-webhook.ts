const MAX_BODY_BYTES = 64 * 1024;
const ICCID_PATTERN = /^[0-9]{18,22}$/;

export type EsimGoWebhookEvent = {
  eventType: string;
  callbackDigest: string;
  profileDigest: string | null;
};

type EsimGoProfileBinding = {
  profileDigest: string;
  ownerUserId: string;
  skyOrderId: string;
  packageKey: string;
  manifestSha256: string;
  createdAt: number;
};

function isSecret(secret: string | undefined): secret is string {
  return typeof secret === 'string' && secret.length >= 32 && secret.length <= 512;
}

function digestHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function keyedDigest(secret: string, domain: string, value: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${domain}\0${value}`);
  return digestHex(await hmac(secret, bytes));
}

export async function esimGoProfileDigest(iccid: string, profileHashSecret: string): Promise<string> {
  if (!ICCID_PATTERN.test(iccid) || !isSecret(profileHashSecret)) throw new Error('INVALID_PROFILE_REFERENCE');
  return keyedDigest(profileHashSecret, 'rockstar-esim-go-profile-v1', iccid);
}

function skipWhitespace(text: string, start: number): number {
  let index = start;
  while (/\s/.test(text[index] ?? '')) index++;
  return index;
}

function scanStringEnd(text: string, start: number): number {
  let escaped = false;
  for (let index = start + 1; index < text.length; index++) {
    const char = text[index];
    if (escaped) escaped = false;
    else if (char === '\\') escaped = true;
    else if (char === '"') return index + 1;
  }
  throw new Error('INVALID_BODY');
}

function scanValueEnd(text: string, start: number): number {
  if (text[start] === '"') return scanStringEnd(text, start);
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index++) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{' || char === '[') depth++;
    else if (char === '}' || char === ']') {
      if (depth === 0) return index;
      depth--;
      if (depth === 0) return index + 1;
    } else if (char === ',' && depth === 0) return index;
    else if (/\s/.test(char) && depth === 0) return index;
  }
  return text.length;
}

// JSON.parse converts long numeric ICCIDs to imprecise JS numbers. Read only
// the top-level token's original lexeme after full JSON validation instead.
function topLevelIccid(text: string): string | null {
  let index = skipWhitespace(text, 0);
  if (text[index++] !== '{') throw new Error('INVALID_BODY');
  let found: string | null = null;
  while (true) {
    index = skipWhitespace(text, index);
    if (text[index] === '}') return found;
    if (text[index] !== '"') throw new Error('INVALID_BODY');
    const keyEnd = scanStringEnd(text, index);
    const key = JSON.parse(text.slice(index, keyEnd)) as unknown;
    index = skipWhitespace(text, keyEnd);
    if (text[index++] !== ':') throw new Error('INVALID_BODY');
    index = skipWhitespace(text, index);
    const end = scanValueEnd(text, index);
    if (key === 'iccid') {
      if (found !== null) throw new Error('INVALID_BODY');
      const token = text.slice(index, end).trim();
      let iccid: unknown;
      try { iccid = token.startsWith('"') ? JSON.parse(token) : token; }
      catch { throw new Error('INVALID_BODY'); }
      if (typeof iccid !== 'string' || !ICCID_PATTERN.test(iccid)) throw new Error('INVALID_BODY');
      found = iccid;
    }
    index = skipWhitespace(text, end);
    if (text[index] === ',') index++;
    else if (text[index] === '}') return found;
    else throw new Error('INVALID_BODY');
  }
}

export async function persistEsimGoWebhook(
  db: Pick<D1Database, 'prepare'>,
  event: EsimGoWebhookEvent,
  now: number,
): Promise<'accepted' | 'duplicate'> {
  if (!Number.isSafeInteger(now) || now < 0) throw new Error('INVALID_CLOCK');
  if (!/^[a-f0-9]{64}$/.test(event.callbackDigest)) throw new Error('INVALID_DIGEST');
  const result = await db.prepare(`
    INSERT OR IGNORE INTO esim_provider_webhook_inbox
      (callback_digest, provider, event_type, received_at, state, profile_digest, owner_user_id, sky_order_id)
    SELECT ?, 'esim-go-v3', ?, ?,
      CASE WHEN b.profile_digest IS NULL THEN 'received' ELSE 'reconciliation_required' END,
      ?, b.owner_user_id, b.sky_order_id
    FROM (SELECT 1) AS seed
    LEFT JOIN esim_provider_profile_bindings b ON b.profile_digest = ?
  `).bind(event.callbackDigest, event.eventType, now, event.profileDigest, event.profileDigest).run();
  return (result.meta?.changes ?? 0) === 0 ? 'duplicate' : 'accepted';
}

/**
 * Bind a provider-issued profile to an already-paid, owner-scoped Sky order.
 * The caller must supply the server-selected plan's package/version; no public
 * route should accept these ownership fields directly from a client.
 */
export async function bindEsimGoIssuedProfile(
  db: Pick<D1Database, 'prepare'>,
  input: Omit<EsimGoProfileBinding, 'profileDigest'> & { iccid: string; profileHashSecret: string },
): Promise<'bound' | 'already_bound'> {
  if (!ICCID_PATTERN.test(input.iccid) || !isSecret(input.profileHashSecret) ||
      !input.ownerUserId || input.ownerUserId.length > 128 || !input.skyOrderId || input.skyOrderId.length > 128 ||
      !/^[A-Za-z0-9._:-]{1,160}$/.test(input.packageKey) || !/^[a-f0-9]{64}$/.test(input.manifestSha256) ||
      !Number.isSafeInteger(input.createdAt) || input.createdAt < 0)
    throw new Error('INVALID_PROFILE_BINDING');
  const profileDigest = await esimGoProfileDigest(input.iccid, input.profileHashSecret);
  const result = await db.prepare(`
    INSERT OR IGNORE INTO esim_provider_profile_bindings
      (profile_digest, provider, owner_user_id, sky_order_id, package_key, manifest_sha256, created_at)
    SELECT ?, 'esim-go-v3', o.buyer_user_id, o.id, o.package_key, o.manifest_sha256, ?
    FROM sky_commerce_orders o
    WHERE o.id = ? AND o.buyer_user_id = ? AND o.mode = 'live' AND o.status = 'paid'
      AND o.package_key = ? AND o.manifest_sha256 = ? AND o.refunded_minor = 0
  `).bind(profileDigest, input.createdAt, input.skyOrderId, input.ownerUserId,
    input.packageKey, input.manifestSha256).run();
  const saved = await db.prepare(`SELECT profile_digest AS profileDigest,
      owner_user_id AS ownerUserId, sky_order_id AS skyOrderId,
      package_key AS packageKey, manifest_sha256 AS manifestSha256
    FROM esim_provider_profile_bindings WHERE profile_digest = ?`)
    .bind(profileDigest).first<Omit<EsimGoProfileBinding, 'createdAt'>>();
  if (saved) {
    if (saved.ownerUserId !== input.ownerUserId || saved.skyOrderId !== input.skyOrderId ||
        saved.packageKey !== input.packageKey || saved.manifestSha256 !== input.manifestSha256)
      throw new Error('PROFILE_BINDING_CONFLICT');
    await db.prepare(`UPDATE esim_provider_webhook_inbox
      SET owner_user_id = ?, sky_order_id = ?, state = 'reconciliation_required'
      WHERE profile_digest = ? AND owner_user_id IS NULL AND sky_order_id IS NULL`)
      .bind(saved.ownerUserId, saved.skyOrderId, saved.profileDigest).run();
    return (result.meta?.changes ?? 0) > 0 ? 'bound' : 'already_bound';
  }
  throw new Error('PAID_ORDER_NOT_ELIGIBLE');
}

function decodeBase64(value: string): Uint8Array {
  if (!/^[A-Za-z0-9+/]{43}=$/.test(value)) throw new Error('INVALID_SIGNATURE');
  const binary = atob(value);
  if (binary.length !== 32 || btoa(binary) !== value) throw new Error('INVALID_SIGNATURE');
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function hmac(keyText: string, bytes: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(keyText), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const signatureInput = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(signatureInput).set(bytes);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, signatureInput));
}

function equal(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index++) difference |= left[index] ^ right[index];
  return difference === 0;
}

export async function verifyEsimGoV3Body(
  rawBody: Uint8Array,
  signature: string | null,
  apiKey: string | undefined,
  dedupeSecret: string | undefined,
  profileHashSecret: string | undefined,
): Promise<EsimGoWebhookEvent> {
  if (rawBody.byteLength === 0 || rawBody.byteLength > MAX_BODY_BYTES) throw new Error('BODY_SIZE');
  if (!apiKey || apiKey.length > 512 || !isSecret(dedupeSecret) || !isSecret(profileHashSecret))
    throw new Error('WEBHOOK_NOT_CONFIGURED');
  if (!signature) throw new Error('INVALID_SIGNATURE');
  const received = decodeBase64(signature);
  const expected = await hmac(apiKey, rawBody);
  if (!equal(expected, received)) throw new Error('INVALID_SIGNATURE');
  let value: unknown;
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(rawBody);
    value = JSON.parse(text);
  }
  catch { throw new Error('INVALID_BODY'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_BODY');
  const alertType = (value as Record<string, unknown>).alertType;
  if (typeof alertType !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(alertType))
    throw new Error('INVALID_EVENT_TYPE');
  const callbackDigestBytes = await hmac(dedupeSecret, new Uint8Array([
    ...new TextEncoder().encode('rockstar-esim-go-callback-inbox-v1\0'), ...rawBody,
  ]));
  const callbackDigest = digestHex(callbackDigestBytes);
  const iccid = topLevelIccid(text);
  const profileDigest = iccid === null ? null
    : await esimGoProfileDigest(iccid, profileHashSecret);
  return { eventType: alertType, callbackDigest, profileDigest };
}

export async function readEsimGoV3Request(
  request: Request,
  apiKey: string | undefined,
  dedupeSecret: string | undefined,
  profileHashSecret: string | undefined,
): Promise<EsimGoWebhookEvent> {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) throw new Error('BODY_SIZE');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('BODY_SIZE');
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new Error('BODY_SIZE');
    }
    chunks.push(value);
  }
  const rawBody = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { rawBody.set(chunk, offset); offset += chunk.byteLength; }
  return verifyEsimGoV3Body(rawBody, request.headers.get('x-signature-sha256'), apiKey,
    dedupeSecret, profileHashSecret);
}
