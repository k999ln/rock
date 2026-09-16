export type OperatorAccessEnv = {
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
  ROCK_OPERATOR_SUB?: string;
};

export class AccessAuthError extends Error {
  readonly status: 401 | 403 | 503;

  constructor(message: string, status: 401 | 403 | 503) {
    super(message);
    this.status = status;
  }
}

type AccessHeader = { alg?: unknown; kid?: unknown; typ?: unknown };
type AccessPayload = {
  aud?: unknown;
  exp?: unknown;
  iat?: unknown;
  iss?: unknown;
  nbf?: unknown;
  sub?: unknown;
  type?: unknown;
};
type AccessJwk = JsonWebKey & {
  alg: 'RS256';
  kid: string;
  kty: 'RSA';
  use: 'sig';
};
type CachedKeys = { expiresAt: number; keys: AccessJwk[] };

const keyCache = new Map<string, CachedKeys>();
const textDecoder = new TextDecoder('utf-8', { fatal: true });

function base64UrlBytes(value: string) {
  if (!/^[A-Za-z0-9_-]+$/u.test(value) || value.length > 16_384)
    throw new AccessAuthError('Access tokenの形式が不正です。', 403);
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  try {
    return Uint8Array.from(atob(padded), (character) =>
      character.charCodeAt(0),
    );
  } catch {
    throw new AccessAuthError('Access tokenの形式が不正です。', 403);
  }
}

function jsonSegment<T>(value: string): T {
  try {
    const parsed = JSON.parse(textDecoder.decode(base64UrlBytes(value)));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      throw new Error('object required');
    return parsed as T;
  } catch (error) {
    if (error instanceof AccessAuthError) throw error;
    throw new AccessAuthError('Access tokenの形式が不正です。', 403);
  }
}

function configuration(env: OperatorAccessEnv) {
  const teamDomain = env.CF_ACCESS_TEAM_DOMAIN?.trim() ?? '';
  const audience = env.CF_ACCESS_AUD?.trim() ?? '';
  const operatorSub = env.ROCK_OPERATOR_SUB?.trim() ?? '';
  if (
    !/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/u.test(teamDomain) ||
    !/^[A-Za-z0-9_-]{16,256}$/u.test(audience) ||
    operatorSub.length < 8 ||
    operatorSub.length > 256
  )
    throw new AccessAuthError('運営Dockの認証設定が完了していません。', 503);
  return { audience, operatorSub, teamDomain };
}

async function boundedJson(response: Response) {
  if (!response.ok)
    throw new AccessAuthError('Access署名鍵を確認できません。', 503);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > 65_536)
    throw new AccessAuthError('Access署名鍵の応答が大きすぎます。', 503);
  try {
    return JSON.parse(textDecoder.decode(bytes)) as unknown;
  } catch {
    throw new AccessAuthError('Access署名鍵の形式が不正です。', 503);
  }
}

async function accessKeys(
  teamDomain: string,
  now: number,
  fetcher: typeof fetch,
) {
  const cached = keyCache.get(teamDomain);
  if (cached && cached.expiresAt > now) return cached.keys;
  const value = await boundedJson(
    await fetcher(`${teamDomain}/cdn-cgi/access/certs`, {
      headers: { Accept: 'application/json' },
      redirect: 'error',
    }),
  );
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new AccessAuthError('Access署名鍵の形式が不正です。', 503);
  const keys = (value as { keys?: unknown }).keys;
  if (!Array.isArray(keys) || keys.length < 1 || keys.length > 8)
    throw new AccessAuthError('Access署名鍵の形式が不正です。', 503);
  const safe = keys.filter(
    (key): key is AccessJwk =>
      Boolean(key) &&
      typeof key === 'object' &&
      !Array.isArray(key) &&
      (key as JsonWebKey).kty === 'RSA' &&
      (key as JsonWebKey).alg === 'RS256' &&
      (key as JsonWebKey).use === 'sig' &&
      typeof (key as { kid?: unknown }).kid === 'string',
  );
  if (!safe.length)
    throw new AccessAuthError('Access署名鍵の形式が不正です。', 503);
  keyCache.set(teamDomain, { expiresAt: now + 5 * 60_000, keys: safe });
  return safe;
}

function includesAudience(value: unknown, expected: string) {
  return value === expected ||
    (Array.isArray(value) &&
      value.length <= 8 &&
      value.every((entry) => typeof entry === 'string') &&
      value.includes(expected));
}

function validEpoch(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value > 0
  );
}

export async function authorizeOperator(
  request: Request,
  env: OperatorAccessEnv,
  options: { clock?: () => number; fetcher?: typeof fetch } = {},
) {
  const { audience, operatorSub, teamDomain } = configuration(env);
  const token = request.headers.get('cf-access-jwt-assertion')?.trim() ?? '';
  if (!token) throw new AccessAuthError('Access認証が必要です。', 401);
  if (token.length > 24_576)
    throw new AccessAuthError('Access tokenが大きすぎます。', 403);
  const segments = token.split('.');
  if (segments.length !== 3)
    throw new AccessAuthError('Access tokenの形式が不正です。', 403);
  const [encodedHeader, encodedPayload, encodedSignature] = segments;
  const header = jsonSegment<AccessHeader>(encodedHeader);
  const payload = jsonSegment<AccessPayload>(encodedPayload);
  if (
    header.alg !== 'RS256' ||
    typeof header.kid !== 'string' ||
    header.kid.length < 8 ||
    header.kid.length > 256
  )
    throw new AccessAuthError('Access tokenの署名方式が不正です。', 403);
  const now = (options.clock ?? Date.now)();
  const nowSeconds = Math.floor(now / 1000);
  if (
    payload.iss !== teamDomain ||
    payload.type !== 'app' ||
    payload.sub !== operatorSub ||
    !includesAudience(payload.aud, audience) ||
    !validEpoch(payload.exp) ||
    !validEpoch(payload.iat) ||
    payload.exp <= nowSeconds ||
    payload.iat > nowSeconds + 60 ||
    (payload.nbf !== undefined &&
      (!validEpoch(payload.nbf) || payload.nbf > nowSeconds + 60))
  )
    throw new AccessAuthError('運営者のAccess tokenを確認できません。', 403);
  const keys = await accessKeys(
    teamDomain,
    now,
    options.fetcher ?? fetch,
  );
  const jwk = keys.find((key) => key.kid === header.kid);
  if (!jwk)
    throw new AccessAuthError('Access署名鍵を確認できません。', 403);
  try {
    const key = await crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    const valid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      key,
      base64UrlBytes(encodedSignature),
      new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
    );
    if (!valid)
      throw new AccessAuthError('Access tokenの署名が不正です。', 403);
  } catch (error) {
    if (error instanceof AccessAuthError) throw error;
    throw new AccessAuthError('Access tokenの署名を検証できません。', 403);
  }
  return { operatorSub };
}

export function resetAccessKeyCacheForTests() {
  keyCache.clear();
}
