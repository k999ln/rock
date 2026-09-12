const encoder = new TextEncoder();

export const BILLING_TOKEN_AUDIENCE = 'sky-billing';
export const BILLING_TOKEN_ISSUER = 'sky-site';
export const BILLING_TOKEN_TTL_SECONDS = 300;

export type BillingTokenPayload = {
  v: 1;
  iss: typeof BILLING_TOKEN_ISSUER;
  aud: typeof BILLING_TOKEN_AUDIENCE;
  sub: string;
  iat: number;
  exp: number;
  jti: string;
};

function encodeBase64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '');
}

function decodeBase64Url(value: string) {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) throw new Error('TOKEN_INVALID');
  const padded = value
    .replaceAll('-', '+')
    .replaceAll('_', '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function signature(input: string, secret: string) {
  if (secret.length < 32) throw new Error('TOKEN_SECRET_INVALID');
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return new Uint8Array(
    await crypto.subtle.sign('HMAC', key, encoder.encode(input)),
  );
}

function equal(left: Uint8Array, right: Uint8Array) {
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index++)
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  return difference === 0;
}

function payload(value: unknown): BillingTokenPayload {
  if (!value || typeof value !== 'object') throw new Error('TOKEN_INVALID');
  const item = value as Partial<BillingTokenPayload>;
  if (
    item.v !== 1 ||
    item.iss !== BILLING_TOKEN_ISSUER ||
    item.aud !== BILLING_TOKEN_AUDIENCE ||
    typeof item.sub !== 'string' ||
    item.sub.length < 1 ||
    item.sub.length > 256 ||
    typeof item.iat !== 'number' ||
    !Number.isInteger(item.iat) ||
    typeof item.exp !== 'number' ||
    !Number.isInteger(item.exp) ||
    typeof item.jti !== 'string' ||
    !/^[0-9a-f-]{36}$/iu.test(item.jti)
  )
    throw new Error('TOKEN_INVALID');
  return item as BillingTokenPayload;
}

export async function createBillingToken(
  userId: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
  tokenId = crypto.randomUUID(),
) {
  if (!userId || userId.length > 256) throw new Error('TOKEN_SUBJECT_INVALID');
  const header = encodeBase64Url(
    encoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })),
  );
  const body = encodeBase64Url(
    encoder.encode(
      JSON.stringify({
        v: 1,
        iss: BILLING_TOKEN_ISSUER,
        aud: BILLING_TOKEN_AUDIENCE,
        sub: userId,
        iat: nowSeconds,
        exp: nowSeconds + BILLING_TOKEN_TTL_SECONDS,
        jti: tokenId,
      } satisfies BillingTokenPayload),
    ),
  );
  const unsigned = `${header}.${body}`;
  return `${unsigned}.${encodeBase64Url(await signature(unsigned, secret))}`;
}

export async function verifyBillingToken(
  token: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('TOKEN_INVALID');
  const [header, body, supplied] = parts;
  const parsedHeader = JSON.parse(
    new TextDecoder().decode(decodeBase64Url(header)),
  ) as unknown;
  if (
    !parsedHeader ||
    typeof parsedHeader !== 'object' ||
    (parsedHeader as { alg?: unknown }).alg !== 'HS256' ||
    (parsedHeader as { typ?: unknown }).typ !== 'JWT'
  )
    throw new Error('TOKEN_INVALID');
  const expected = await signature(`${header}.${body}`, secret);
  if (!equal(decodeBase64Url(supplied), expected))
    throw new Error('TOKEN_INVALID');
  const result = payload(
    JSON.parse(new TextDecoder().decode(decodeBase64Url(body))) as unknown,
  );
  if (
    result.exp <= nowSeconds ||
    result.iat > nowSeconds + 30 ||
    result.exp - result.iat !== BILLING_TOKEN_TTL_SECONDS
  )
    throw new Error('TOKEN_EXPIRED');
  return result;
}
