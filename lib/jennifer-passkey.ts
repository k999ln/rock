import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';

type Database = Pick<D1Database, 'prepare' | 'batch'>;

const PRODUCTION_IDENTITIES = new Map([
  ['avoado.si', { rpId: 'avoado.si', origin: 'https://avoado.si' }],
]);
const CHALLENGE_TTL_MS = 5 * 60_000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60_000;
const SESSION_IDLE_TTL_MS = 7 * 24 * 60 * 60_000;
const SESSION_TOKEN = /^jennifer_session_[A-Za-z0-9_-]{43}$/;
const CREDENTIAL_ID = /^[A-Za-z0-9_-]{16,1400}$/;
const PASSKEY_COOKIE = '__Host-jennifer_access';

type ChallengeRow = {
  id: string;
  kind: 'registration' | 'authentication';
  userId: string | null;
  challengeSha256: string;
  rpId: string;
  origin: string;
  expiresAt: number;
  consumedAt: number | null;
};

type CredentialRow = {
  credentialId: string;
  userId: string;
  publicKeyCose: string;
  signCount: number;
  transportsJson: string;
  deviceType: 'singleDevice' | 'multiDevice';
  backedUp: number;
  rpId: string;
};

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function base64UrlToBytes(value: string, maxBytes = 8192) {
  if (!/^[A-Za-z0-9_-]*$/.test(value) || value.length > Math.ceil(maxBytes * 4 / 3) + 4)
    throw new Error('PASSKEY_INVALID');
  const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  if (binary.length > maxBytes) throw new Error('PASSKEY_INVALID');
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function randomToken(prefix: string) {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `${prefix}${bytesToBase64Url(bytes)}`;
}

async function sha256Bytes(value: Uint8Array | string) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  return new Uint8Array(await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes).buffer));
}

async function sha256(value: Uint8Array | string) {
  return [...await sha256Bytes(value)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function changes(result: D1Result | undefined) {
  return Number(result?.meta?.changes ?? 0);
}

function requestIdentity(request: Request) {
  const url = new URL(request.url);
  const hostname = url.hostname.toLowerCase();
  const production = PRODUCTION_IDENTITIES.get(hostname);
  if (production && url.origin === production.origin)
    return { ...production, secure: true };
  if ((hostname === 'localhost' || hostname === '127.0.0.1') && url.protocol === 'http:')
    return { rpId: hostname, origin: url.origin, secure: false };
  throw new Error('PASSKEY_HOST_INVALID');
}

function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin || origin !== new URL(request.url).origin) throw new Error('ORIGIN');
}

function parseCookie(request: Request, name: string) {
  const cookie = request.headers.get('cookie') ?? '';
  for (const part of cookie.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    return part.slice(separator + 1).trim();
  }
  return null;
}

function sessionCookie(token: string, secure: boolean) {
  const name = secure ? PASSKEY_COOKIE : 'jennifer_access';
  return `${name}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}${secure ? '; Secure' : ''}`;
}

export function clearJenniferSessionCookie(secure: boolean) {
  const name = secure ? PASSKEY_COOKIE : 'jennifer_access';
  return `${name}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure ? '; Secure' : ''}`;
}

function sessionToken(request: Request) {
  return parseCookie(request, requestIdentity(request).secure ? PASSKEY_COOKIE : 'jennifer_access');
}

function validUserId(userId: string) {
  return userId.length >= 1 && userId.length <= 256 &&
    !Array.from(userId).some((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127;
    });
}

function validCredentialResponse(value: unknown): value is RegistrationResponseJSON | AuthenticationResponseJSON {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const response = value as Record<string, unknown>;
  return response.type === 'public-key' && typeof response.id === 'string' &&
    typeof response.rawId === 'string' && response.id === response.rawId && CREDENTIAL_ID.test(response.id) &&
    response.response !== null && typeof response.response === 'object';
}

function requesterKey(request: Request) {
  const ip = request.headers.get('cf-connecting-ip') ?? 'local';
  const agent = (request.headers.get('user-agent') ?? '').slice(0, 256);
  return `${ip}\n${agent}`;
}

function transports(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch { return []; }
}

export function jenniferPasskeyStore(db: Database) {
  async function challenge(kind: ChallengeRow['kind'], request: Request, userId: string | null, now: number) {
    const { rpId, origin } = requestIdentity(request);
    const rateKey = await sha256(requesterKey(request));
    await db.prepare(`DELETE FROM jennifer_passkey_challenges WHERE expires_at <= ?`).bind(now - CHALLENGE_TTL_MS).run();
    const recent = await db.prepare(`SELECT COUNT(*) AS count FROM jennifer_passkey_challenges
      WHERE request_key_sha256 = ? AND created_at > ?`).bind(rateKey, now - 60_000).first<{ count: number }>();
    if (Number(recent?.count ?? 0) >= 10) throw new Error('PASSKEY_RATE_LIMITED');
    const outstanding = await db.prepare(`SELECT COUNT(*) AS count FROM jennifer_passkey_challenges
      WHERE consumed_at IS NULL AND expires_at > ?`).bind(now).first<{ count: number }>();
    if (Number(outstanding?.count ?? 0) >= 500) throw new Error('PASSKEY_UNAVAILABLE');
    const id = crypto.randomUUID();
    const value = randomToken('').slice(0, 43);
    await db.prepare(`INSERT INTO jennifer_passkey_challenges
      (id, kind, user_id, challenge_sha256, request_key_sha256, rp_id, origin, created_at, expires_at, consumed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`)
      .bind(id, kind, userId, await sha256(value), rateKey, rpId, origin, now, now + CHALLENGE_TTL_MS).run();
    return { id, value, rpId, origin };
  }

  async function issueSession(userId: string, credentialId: string, request: Request, now: number) {
    const token = randomToken('jennifer_session_');
    const expiresAt = now + SESSION_TTL_MS;
    await db.prepare(`INSERT INTO jennifer_passkey_sessions
      (id, user_id, credential_id, auth_method, token_sha256, created_at, expires_at, last_used_at, revoked_at)
      VALUES (?, ?, ?, 'passkey', ?, ?, ?, ?, NULL)`)
      .bind(crypto.randomUUID(), userId, credentialId, await sha256(token), now, expiresAt, now).run();
    return { token, expiresAt, cookie: sessionCookie(token, requestIdentity(request).secure) };
  }

  async function readChallenge(id: unknown, kind: ChallengeRow['kind'], now: number) {
    if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) throw new Error('PASSKEY_CHALLENGE_INVALID');
    const row = await db.prepare(`SELECT id, kind, user_id AS userId, challenge_sha256 AS challengeSha256,
      rp_id AS rpId, origin, expires_at AS expiresAt, consumed_at AS consumedAt
      FROM jennifer_passkey_challenges WHERE id = ? AND kind = ?`).bind(id, kind).first<ChallengeRow>();
    if (!row || row.consumedAt !== null || row.expiresAt <= now) throw new Error('PASSKEY_CHALLENGE_INVALID');
    return row;
  }

  async function consumeChallenge(row: ChallengeRow, now: number) {
    const result = await db.prepare(`UPDATE jennifer_passkey_challenges SET consumed_at = ?
      WHERE id = ? AND consumed_at IS NULL AND expires_at > ?`).bind(now, row.id, now).run();
    if (changes(result) !== 1) throw new Error('PASSKEY_CHALLENGE_INVALID');
  }

  async function hasCredential(userId: string) {
    const row = await db.prepare(`SELECT COUNT(*) AS count FROM jennifer_passkey_credentials
      WHERE user_id = ? AND revoked_at IS NULL`).bind(userId).first<{ count: number }>();
    return Number(row?.count ?? 0) > 0;
  }

  return {
    async registrationOptions(userId: string, request: Request, now = Date.now()) {
      sameOrigin(request);
      if (!validUserId(userId)) throw new Error('UNAUTHORIZED');
      const created = await challenge('registration', request, userId, now);
      const existing = await db.prepare(`SELECT credential_id AS id, transports_json AS transportsJson
        FROM jennifer_passkey_credentials WHERE user_id = ? AND revoked_at IS NULL
        ORDER BY created_at DESC LIMIT 20`).bind(userId).all<{ id: string; transportsJson: string }>();
      return {
        challengeId: created.id,
        publicKey: await generateRegistrationOptions({
          rpName: 'Jennifer', rpID: created.rpId,
          userID: await sha256Bytes(userId), userName: 'Jennifer owner', userDisplayName: 'Jennifer owner',
          challenge: created.value, timeout: CHALLENGE_TTL_MS, attestationType: 'none',
          authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
          supportedAlgorithmIDs: [-7, -257],
          excludeCredentials: existing.results.map((item) => ({ id: item.id, transports: transports(item.transportsJson) })),
        }),
      };
    },

    async register(userId: string, request: Request, body: Record<string, unknown>, now = Date.now()) {
      sameOrigin(request);
      const challengeRow = await readChallenge(body.challengeId, 'registration', now);
      if (challengeRow.userId !== userId || !validCredentialResponse(body.credential)) throw new Error('UNAUTHORIZED');
      const verified = await verifyRegistrationResponse({
        response: body.credential as RegistrationResponseJSON,
        expectedChallenge: async (value) => await sha256(value) === challengeRow.challengeSha256,
        expectedOrigin: challengeRow.origin,
        expectedRPID: challengeRow.rpId,
        requireUserVerification: true,
        supportedAlgorithmIDs: [-7, -257],
      });
      if (!verified.verified || !verified.registrationInfo) throw new Error('PASSKEY_INVALID');
      const info = verified.registrationInfo;
      const credentialId = info.credential.id;
      if (!CREDENTIAL_ID.test(credentialId) || credentialId !== (body.credential as RegistrationResponseJSON).id)
        throw new Error('PASSKEY_INVALID');
      await consumeChallenge(challengeRow, now);
      const recovery = await hasCredential(userId);
      if (recovery) {
        await db.batch([
          db.prepare(`UPDATE jennifer_passkey_credentials SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL`).bind(now, userId),
          db.prepare(`UPDATE jennifer_passkey_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL`).bind(now, userId),
        ]);
      }
      const response = (body.credential as RegistrationResponseJSON).response;
      await db.batch([
        db.prepare(`INSERT INTO jennifer_passkey_credentials
          (credential_id, user_id, public_key_cose, sign_count, transports_json, label,
           device_type, backed_up, rp_id, created_at, last_used_at, revoked_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`)
          .bind(credentialId, userId, bytesToBase64Url(info.credential.publicKey), info.credential.counter,
            JSON.stringify(response.transports ?? []), 'Jennifer passkey', info.credentialDeviceType,
            info.credentialBackedUp ? 1 : 0, challengeRow.rpId, now),
        db.prepare(`INSERT INTO jennifer_passkey_events
          (id, user_id, event_type, credential_id, details_json, created_at)
          VALUES (?, ?, ?, ?, ?, ?)`)
          .bind(crypto.randomUUID(), userId, recovery ? 'recovery_replaced_credentials' : 'first_enrollment',
            credentialId, JSON.stringify({ rpId: challengeRow.rpId }), now),
      ]);
      return issueSession(userId, credentialId, request, now);
    },

    async authenticationOptions(request: Request, now = Date.now()) {
      sameOrigin(request);
      const created = await challenge('authentication', request, null, now);
      return { challengeId: created.id, publicKey: await generateAuthenticationOptions({
        rpID: created.rpId, challenge: created.value, timeout: CHALLENGE_TTL_MS,
        userVerification: 'required', allowCredentials: [],
      }) };
    },

    async authenticatePasskey(request: Request, body: Record<string, unknown>, now = Date.now()) {
      sameOrigin(request);
      const challengeRow = await readChallenge(body.challengeId, 'authentication', now);
      if (!validCredentialResponse(body.credential)) throw new Error('PASSKEY_INVALID');
      const response = body.credential as AuthenticationResponseJSON;
      const credentialId = response.id;
      const credential = await db.prepare(`SELECT credential_id AS credentialId, user_id AS userId,
        public_key_cose AS publicKeyCose, sign_count AS signCount, transports_json AS transportsJson,
        device_type AS deviceType, backed_up AS backedUp, rp_id AS rpId
        FROM jennifer_passkey_credentials WHERE credential_id = ? AND revoked_at IS NULL`)
        .bind(credentialId).first<CredentialRow>();
      if (!credential || credential.rpId !== challengeRow.rpId) throw new Error('UNAUTHORIZED');
      const expectedUserHandle = bytesToBase64Url(await sha256Bytes(credential.userId));
      if (response.response.userHandle !== expectedUserHandle) throw new Error('UNAUTHORIZED');
      const verified = await verifyAuthenticationResponse({
        response,
        expectedChallenge: async (value) => await sha256(value) === challengeRow.challengeSha256,
        expectedOrigin: challengeRow.origin,
        expectedRPID: challengeRow.rpId,
        requireUserVerification: true,
        credential: {
          id: credential.credentialId,
          publicKey: base64UrlToBytes(credential.publicKeyCose, 4096),
          counter: credential.signCount,
          transports: transports(credential.transportsJson),
        },
      });
      if (!verified.verified || !verified.authenticationInfo.userVerified) throw new Error('PASSKEY_INVALID');
      const updated = await db.prepare(`UPDATE jennifer_passkey_credentials
        SET sign_count = ?, last_used_at = ?, device_type = ?, backed_up = ?
        WHERE credential_id = ? AND revoked_at IS NULL AND sign_count = ?`)
        .bind(verified.authenticationInfo.newCounter, now, verified.authenticationInfo.credentialDeviceType,
          verified.authenticationInfo.credentialBackedUp ? 1 : 0, credentialId, credential.signCount).run();
      if (changes(updated) !== 1) throw new Error('PASSKEY_COUNTER_INVALID');
      await consumeChallenge(challengeRow, now);
      return issueSession(credential.userId, credentialId, request, now);
    },

    async authenticateSession(request: Request, now = Date.now()) {
      const token = sessionToken(request);
      if (!token || !SESSION_TOKEN.test(token)) throw new Error('UNAUTHORIZED');
      const row = await db.prepare(`SELECT id, user_id AS userId, credential_id AS credentialId
        FROM jennifer_passkey_sessions WHERE token_sha256 = ? AND auth_method = 'passkey'
        AND revoked_at IS NULL AND expires_at > ? AND last_used_at > ?`)
        .bind(await sha256(token), now, now - SESSION_IDLE_TTL_MS)
        .first<{ id: string; userId: string; credentialId: string }>();
      if (!row) throw new Error('UNAUTHORIZED');
      const active = await db.prepare(`SELECT credential_id FROM jennifer_passkey_credentials
        WHERE credential_id = ? AND user_id = ? AND revoked_at IS NULL`).bind(row.credentialId, row.userId).first();
      if (!active) throw new Error('UNAUTHORIZED');
      await db.prepare(`UPDATE jennifer_passkey_sessions SET last_used_at = ?
        WHERE id = ? AND revoked_at IS NULL AND expires_at > ?`).bind(now, row.id, now).run();
      return row.userId;
    },

    async revokeSession(request: Request, now = Date.now()) {
      sameOrigin(request);
      const token = sessionToken(request);
      if (token && SESSION_TOKEN.test(token))
        await db.prepare(`UPDATE jennifer_passkey_sessions SET revoked_at = ?
          WHERE token_sha256 = ? AND revoked_at IS NULL`).bind(now, await sha256(token)).run();
    },

    hasCredential,
  };
}

