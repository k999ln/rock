type Database = Pick<D1Database, 'prepare' | 'batch'>;

const USER_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const USER_CODE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/;
const DEVICE_CODE = /^rock_device_[A-Za-z0-9_-]{43}$/;
const SESSION_TOKEN = /^rock_session_[A-Za-z0-9_-]{43}$/;
const LINK_TTL_MS = 10 * 60_000;
const SESSION_TTL_MS = 90 * 24 * 60 * 60_000;

type AuthorizationRow = {
  id: string;
  status: 'pending' | 'approved' | 'denied' | 'consumed' | 'expired';
  userId: string | null;
  clientName: string;
  expiresAt: number;
  lastPolledAt: number | null;
};

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function randomBytes(size: number) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return bytes;
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function userCode() {
  const bytes = randomBytes(8);
  let code = '';
  for (const byte of bytes) code += USER_CODE_ALPHABET[byte & 31];
  return code;
}

function changes(result: D1Result | undefined) {
  return Number(result?.meta?.changes ?? 0);
}

function safeDeviceName(value: unknown) {
  if (typeof value !== 'string') return 'RockstarOS device';
  const trimmed = value.trim();
  let hasControl = false;
  for (let index = 0; index < trimmed.length; index += 1) {
    const code = trimmed.charCodeAt(index);
    if (code < 32 || code === 127) hasControl = true;
  }
  if (trimmed.length < 1 || trimmed.length > 64 || hasControl)
    throw new Error('DEVICE_NAME_INVALID');
  return trimmed;
}

function validOwnerId(value: string) {
  if (value.length < 1 || value.length > 256) return false;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 32 || code === 127) return false;
  }
  return true;
}

export function rockstarDeviceLinkStore(db: Database) {
  return {
    async lookup(codeInput: unknown, now = Date.now()) {
      const code = typeof codeInput === 'string' ? codeInput.trim().toUpperCase() : '';
      if (!USER_CODE.test(code)) throw new Error('DEVICE_AUTHORIZATION_CODE_INVALID');
      const row = await db.prepare(`SELECT client_name AS clientName, status, expires_at AS expiresAt
        FROM rockstar_device_authorizations WHERE user_code_sha256 = ?`)
        .bind(await sha256(code)).first<{ clientName: string; status: string; expiresAt: number }>();
      if (!row || row.status !== 'pending' || row.expiresAt <= now) return null;
      return { clientName: row.clientName, expiresAt: row.expiresAt };
    },

    async begin(nameInput: unknown, now = Date.now()) {
      const clientName = safeDeviceName(nameInput);
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const id = crypto.randomUUID();
        const deviceCode = `rock_device_${bytesToBase64Url(randomBytes(32))}`;
        const code = userCode();
        const expiresAt = now + LINK_TTL_MS;
        try {
          await db.prepare(`INSERT INTO rockstar_device_authorizations
            (id, user_code_sha256, device_code_sha256, client_name, status,
             user_id, created_at, expires_at, last_polled_at, approved_at, consumed_at)
            VALUES (?, ?, ?, ?, 'pending', NULL, ?, ?, NULL, NULL, NULL)`)
            .bind(id, await sha256(code), await sha256(deviceCode), clientName, now, expiresAt)
            .run();
          return {
            deviceCode,
            userCode: code,
            expiresIn: Math.floor(LINK_TTL_MS / 1000),
            interval: 5,
          };
        } catch (error) {
          if (attempt === 2) throw error;
        }
      }
      throw new Error('DEVICE_AUTHORIZATION_UNAVAILABLE');
    },

    async approve(codeInput: unknown, ownerUserId: string, now = Date.now()) {
      const code = typeof codeInput === 'string' ? codeInput.trim().toUpperCase() : '';
      if (!USER_CODE.test(code) || !validOwnerId(ownerUserId))
        throw new Error('DEVICE_AUTHORIZATION_CODE_INVALID');
      const result = await db.prepare(`UPDATE rockstar_device_authorizations
        SET status = 'approved', user_id = ?, approved_at = ?
        WHERE user_code_sha256 = ? AND status = 'pending' AND expires_at > ?`)
        .bind(ownerUserId, now, await sha256(code), now).run();
      if (changes(result) === 1) return { approved: true };
      return { approved: false };
    },

    async deny(codeInput: unknown, ownerUserId: string, now = Date.now()) {
      const code = typeof codeInput === 'string' ? codeInput.trim().toUpperCase() : '';
      if (!USER_CODE.test(code) || !validOwnerId(ownerUserId))
        throw new Error('DEVICE_AUTHORIZATION_CODE_INVALID');
      const result = await db.prepare(`UPDATE rockstar_device_authorizations
        SET status = 'denied', user_id = ?, approved_at = ?
        WHERE user_code_sha256 = ? AND status = 'pending' AND expires_at > ?`)
        .bind(ownerUserId, now, await sha256(code), now).run();
      return { denied: changes(result) === 1 };
    },

    async poll(deviceCodeInput: unknown, now = Date.now()) {
      const deviceCode = typeof deviceCodeInput === 'string' ? deviceCodeInput : '';
      if (!DEVICE_CODE.test(deviceCode)) throw new Error('DEVICE_CODE_INVALID');
      const codeHash = await sha256(deviceCode);
      const row = await db.prepare(`SELECT id, status, user_id AS userId,
          client_name AS clientName, expires_at AS expiresAt,
          last_polled_at AS lastPolledAt
        FROM rockstar_device_authorizations WHERE device_code_sha256 = ?`)
        .bind(codeHash).first<AuthorizationRow>();
      if (!row) throw new Error('DEVICE_CODE_INVALID');
      if (row.status === 'consumed') return { status: 'access_denied' as const };
      if (row.status === 'denied') return { status: 'access_denied' as const };
      if (row.expiresAt <= now || row.status === 'expired') {
        await db.prepare(`UPDATE rockstar_device_authorizations SET status = 'expired'
          WHERE id = ? AND status IN ('pending', 'approved')`).bind(row.id).run();
        return { status: 'expired_token' as const };
      }
      if (row.lastPolledAt !== null && now - row.lastPolledAt < 4_000)
        return { status: 'slow_down' as const };
      const polled = await db.prepare(`UPDATE rockstar_device_authorizations SET last_polled_at = ?
        WHERE id = ? AND status IN ('pending', 'approved') AND expires_at > ?
        AND (last_polled_at IS NULL OR last_polled_at <= ?)`)
        .bind(now, row.id, now, now - 4_000).run();
      if (changes(polled) !== 1) return { status: 'slow_down' as const };
      if (row.status === 'pending') return { status: 'authorization_pending' as const };
      if (row.status !== 'approved' || !row.userId)
        return { status: 'access_denied' as const };

      const token = `rock_session_${bytesToBase64Url(randomBytes(32))}`;
      const tokenHash = await sha256(token);
      const expiresAt = now + SESSION_TTL_MS;
      const [inserted] = await db.batch([
        db.prepare(`INSERT INTO rockstar_device_sessions
          (id, user_id, device_name, token_sha256, created_at, expires_at, last_used_at, revoked_at)
          SELECT ?, user_id, ?, ?, ?, ?, NULL, NULL
          FROM rockstar_device_authorizations
          WHERE id = ? AND status = 'approved' AND expires_at > ? AND user_id IS NOT NULL`)
          .bind(crypto.randomUUID(), row.clientName, tokenHash, now, expiresAt, row.id, now),
        db.prepare(`UPDATE rockstar_device_authorizations SET status = 'consumed', consumed_at = ?
          WHERE id = ? AND status = 'approved' AND expires_at > ?`)
          .bind(now, row.id, now),
      ]);
      if (changes(inserted) !== 1) return { status: 'access_denied' as const };
      // The one-time device code is the proof of possession for this grant. Return
      // the account subject with the opaque session so native clients can bind
      // local owner-scoped data without inventing a second identity.
      return { status: 'authorized' as const, accessToken: token, expiresAt, ownerUserId: row.userId };
    },

    async authenticate(tokenInput: string, now = Date.now()) {
      if (!SESSION_TOKEN.test(tokenInput)) throw new Error('UNAUTHORIZED');
      const tokenHash = await sha256(tokenInput);
      const row = await db.prepare(`SELECT id, user_id AS userId FROM rockstar_device_sessions
        WHERE token_sha256 = ? AND revoked_at IS NULL AND expires_at > ?`)
        .bind(tokenHash, now).first<{ id: string; userId: string }>();
      if (!row) throw new Error('UNAUTHORIZED');
      await db.prepare(`UPDATE rockstar_device_sessions SET last_used_at = ?
        WHERE id = ? AND revoked_at IS NULL AND expires_at > ?`)
        .bind(now, row.id, now).run();
      return row.userId;
    },

    async list(ownerUserId: string, now = Date.now()) {
      const rows = await db.prepare(`SELECT id, device_name AS deviceName, created_at AS createdAt,
          last_used_at AS lastUsedAt, expires_at AS expiresAt
        FROM rockstar_device_sessions WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ?
        ORDER BY created_at DESC LIMIT 50`)
        .bind(ownerUserId, now).all();
      return rows.results;
    },

    async revoke(ownerUserId: string, id: string, now = Date.now()) {
      const result = await db.prepare(`UPDATE rockstar_device_sessions SET revoked_at = ?
        WHERE id = ? AND user_id = ? AND revoked_at IS NULL`)
        .bind(now, id, ownerUserId).run();
      return changes(result) === 1;
    },
  };
}

export async function requestRockstarUser(request: Request, db: Database) {
  const authorization = request.headers.get('authorization') ?? '';
  if (authorization.startsWith('Bearer rock_session_')) {
    const token = authorization.slice('Bearer '.length);
    return rockstarDeviceLinkStore(db).authenticate(token);
  }
  const { requestUser } = await import('./request-auth.ts');
  return requestUser(request);
}
