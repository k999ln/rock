import { scrypt, timingSafeEqual } from 'node:crypto';
import { Buffer } from 'node:buffer';

type Database = Pick<D1Database, 'prepare' | 'batch'>;
type PasswordRow = { userId: string; handle: string; salt: string; verifier: string; revision: number };
const TTL = 30 * 24 * 60 * 60_000;
const IDLE = 7 * 24 * 60 * 60_000;
const encoder = new TextEncoder();
const token = (prefix: string) => prefix + Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
const digest = async (value: string) => Buffer.from(await crypto.subtle.digest('SHA-256', encoder.encode(value))).toString('hex');
const cookieName = (request: Request) => new URL(request.url).protocol === 'https:' ? '__Host-rockstar_account_access' : 'rockstar_account_access';
function readCookie(request: Request) {
  const prefix = cookieName(request) + '=';
  return (request.headers.get('cookie') ?? '').split(';').map(x => x.trim()).find(x => x.startsWith(prefix))?.slice(prefix.length) ?? '';
}
export function hasRockstarPasswordCookie(request: Request) {
  return (request.headers.get('cookie') ?? '').split(';').some(x => /^(?:__Host-)?rockstar_account_access=/.test(x.trim()));
}
export function rockstarPasswordCookie(request: Request, value = '', maxAge = 0) {
  return `${cookieName(request)}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`;
}
function sameOrigin(request: Request) {
  const u = new URL(request.url);
  if (u.origin !== 'https://avoado.si' && !(u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname))) throw new Error('PASSKEY_HOST_INVALID');
  if (request.method !== 'GET' && request.headers.get('origin') !== u.origin) throw new Error('ORIGIN');
}
function handle(value: unknown) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_]{2,31}$/.test(value)) throw new Error('ACCOUNT_NAME_INVALID');
  return value.toLowerCase();
}
function password(value: unknown) {
  if (typeof value !== 'string' || Array.from(value).length < 15 || Array.from(value).length > 128 || encoder.encode(value).length > 512) throw new Error('PASSWORD_INVALID');
  if (/^(.)\1+$/.test(value) || ['passwordpassword', '123456789012345', 'qwertyuiopasdfgh', 'password123456789'].includes(value.toLowerCase())) throw new Error('PASSWORD_INVALID');
  return value;
}
// Standard scrypt parameters from OWASP's 32 MiB configuration. Bound native
// hashing concurrency in each Worker isolate; never allocate attacker-selected costs.
let hashing = false;
export async function rockstarPasswordHash(value: string, salt: string) {
  if (hashing) throw new Error('ACCOUNT_BUSY');
  hashing = true;
  try {
    return await new Promise<string>((resolve, reject) => {
      scrypt(value, salt, 32, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }, (error, key) => error ? reject(error) : resolve(Buffer.from(key).toString('hex')));
    });
  } finally { hashing = false; }
}

/** Independent account authentication. Email/handle never selects an existing owner for enrollment. */
export function rockstarPasswordStore(db: Database) {
  async function throttle(request: Request, key: string, now: number, maximum: number) {
    const window = Math.floor(now / 60_000);
    const requestKey = await digest('password:' + key);
    const row = await db.prepare(`INSERT INTO rockstar_account_rate_limits(request_key,window,attempts) VALUES(?,?,1)
      ON CONFLICT(request_key,window) DO UPDATE SET attempts=attempts+1 RETURNING attempts`).bind(requestKey, window).first<{ attempts: number }>();
    if (!row || row.attempts > maximum) throw new Error('PASSKEY_RATE_LIMITED');
    await db.prepare('DELETE FROM rockstar_account_rate_limits WHERE window < ?').bind(window - 10).run();
  }
  async function limits(request: Request, name: string, now: number) {
    sameOrigin(request);
    await throttle(request, 'ip:' + (request.headers.get('cf-connecting-ip') ?? 'local'), now, 30);
    await throttle(request, 'handle:' + name, now, 10);
  }
  async function issue(request: Request, row: PasswordRow, now: number) {
    const access = token('rock_account_');
    const result = await db.prepare(`INSERT INTO rockstar_account_sessions(id,user_id,account_revision,token_sha256,created_at,expires_at,last_used_at,revoked_at)
      SELECT ?,p.user_id,p.account_revision,?,?,?,?,NULL FROM rockstar_account_passwords p JOIN rockstar_accounts a ON a.user_id=p.user_id AND a.revision=p.account_revision
      WHERE p.user_id=? AND p.account_revision=? AND p.verifier=?`).bind(crypto.randomUUID(), await digest(access), now, now + TTL, now, row.userId, row.revision, row.verifier).run();
    if (result.meta.changes !== 1) throw new Error('UNAUTHORIZED');
    return { expiresAt: now + TTL, cookie: rockstarPasswordCookie(request, access, TTL / 1000) };
  }
  async function rowForUser(userId: string) {
    return db.prepare(`SELECT user_id AS userId,handle,salt,verifier,account_revision AS revision FROM rockstar_account_passwords WHERE user_id=?`).bind(userId).first<PasswordRow>();
  }
  return {
    async status(userId: string) {
      return db.prepare(`SELECT p.handle FROM rockstar_account_passwords p JOIN rockstar_accounts a ON a.user_id=p.user_id AND a.revision=p.account_revision WHERE p.user_id=?`).bind(userId).first<{ handle: string }>();
    },
    async enroll(request: Request, input: Record<string, unknown>, authenticatedOwner: string | null, now = Date.now()) {
      if (Object.keys(input).some(k => !['action', 'mode', 'handle', 'password', 'recoveryCode', 'confirmRevoke'].includes(k))) throw new Error('PASSKEY_INVALID');
      const name = handle(input.handle), secret = password(input.password);
      await limits(request, name, now);
      const mode = input.mode;
      if (!['signup', 'add', 'recover'].includes(String(mode))) throw new Error('PASSKEY_INVALID');
      if (mode === 'signup' && authenticatedOwner) throw new Error('ACCOUNT_ALREADY_SIGNED_IN');
      if (mode === 'add' && !authenticatedOwner) throw new Error('UNAUTHORIZED');
      let userId = mode === 'signup' ? 'rockstar:' + crypto.randomUUID() : authenticatedOwner;
      let recoveryHash: string | null = null;
      if (mode === 'recover') {
        if (input.confirmRevoke !== true || typeof input.recoveryCode !== 'string' || !/^rock_recovery_[A-Za-z0-9_-]{43}$/.test(input.recoveryCode)) throw new Error('UNAUTHORIZED');
        recoveryHash = await digest(input.recoveryCode);
        const account = await db.prepare('SELECT user_id AS userId FROM rockstar_accounts WHERE recovery_sha256=?').bind(recoveryHash).first<{ userId: string }>();
        if (!account || authenticatedOwner && authenticatedOwner !== account.userId) throw new Error('UNAUTHORIZED');
        userId = account.userId;
      }
      if (!userId) throw new Error('UNAUTHORIZED');
      const previous = await rowForUser(userId);
      const current = await db.prepare('SELECT revision FROM rockstar_accounts WHERE user_id=?').bind(userId).first<{ revision: number }>();
      if (mode !== 'recover' && previous && previous.revision === current?.revision) throw new Error('ACCOUNT_LOGIN_ALREADY_CONFIGURED');
      if (previous && previous.handle !== name) throw new Error('UNAUTHORIZED');
      if (mode === 'recover' && previous && previous.handle !== name) throw new Error('UNAUTHORIZED');
      const collision = await db.prepare('SELECT user_id FROM rockstar_account_passwords WHERE handle=?').bind(name).first<{ user_id: string }>();
      if (collision && collision.user_id !== userId) throw new Error('ACCOUNT_NAME_UNAVAILABLE');
      const expected = current?.revision ?? 0;
      const salt = token('');
      const verifier = await rockstarPasswordHash(secret, salt);
      const recoveryCode = token('rock_recovery_');
      const nextRecovery = await digest(recoveryCode);
      const accountRevision = mode === 'recover' ? expected + 1 : expected || 1;
      const batch = [];
      if (mode === 'recover') {
        batch.push(db.prepare('UPDATE rockstar_accounts SET recovery_sha256=?,revision=revision+1,updated_at=? WHERE user_id=? AND revision=? AND recovery_sha256=?').bind(nextRecovery, now, userId, expected, recoveryHash));
      } else {
        batch.push(db.prepare('INSERT INTO rockstar_accounts(user_id,recovery_sha256,revision,created_at,updated_at) VALUES(?,?,1,?,?) ON CONFLICT(user_id) DO NOTHING').bind(userId, nextRecovery, now, now));
      }
      // Recheck both revision and recovery secret inside the same atomic D1 batch.
      const fence = `EXISTS(SELECT 1 FROM rockstar_accounts WHERE user_id=? AND revision=?${mode === 'recover' ? ' AND recovery_sha256=?' : ''})`;
      const args = mode === 'recover' ? [userId, accountRevision, nextRecovery] : [userId, accountRevision];
      const passwordIndex = batch.length;
      batch.push(db.prepare(`INSERT INTO rockstar_account_passwords(user_id,handle,salt,verifier,account_revision,created_at,updated_at)
        SELECT ?,?,?,?,?,?,? WHERE ${fence} ON CONFLICT(user_id) DO UPDATE SET salt=excluded.salt,verifier=excluded.verifier,account_revision=excluded.account_revision,updated_at=excluded.updated_at ${mode === 'recover' ? '' : 'WHERE rockstar_account_passwords.account_revision != excluded.account_revision'}`)
        .bind(userId, name, salt, verifier, accountRevision, now, now, ...args));
      if (mode === 'recover') {
        for (const table of ['jennifer_passkey_credentials', 'jennifer_passkey_sessions', 'rockstar_device_sessions', 'rockstar_account_sessions']) batch.push(db.prepare(`UPDATE ${table} SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL AND ${fence}`).bind(now, userId, ...args));
        batch.push(db.prepare(`UPDATE rockstar_device_authorizations SET status='denied' WHERE user_id=? AND status='approved' AND ${fence}`).bind(userId, ...args));
        batch.push(db.prepare(`UPDATE rockstar_account_enrollments SET consumed_at=? WHERE user_id=? AND consumed_at IS NULL AND ${fence}`).bind(now, userId, ...args));
      }
      let result;
      try { result = await db.batch(batch); } catch (error) {
        if (String(error).includes('UNIQUE constraint')) throw new Error('ACCOUNT_NAME_UNAVAILABLE');
        throw error;
      }
      if (result[passwordIndex]?.meta.changes !== 1 || mode === 'recover' && result[0]?.meta.changes !== 1) throw new Error('UNAUTHORIZED');
      const session = await issue(request, { userId, handle: name, salt, verifier, revision: accountRevision }, now);
      return { ...session, recoveryCode: mode === 'recover' || result[0]?.meta.changes === 1 ? recoveryCode : null };
    },
    async login(request: Request, input: Record<string, unknown>, authenticatedOwner: string | null, now = Date.now()) {
      if (Object.keys(input).some(k => !['action', 'mode', 'handle', 'password'].includes(k))) throw new Error('PASSKEY_INVALID');
      const name = handle(input.handle), secret = password(input.password);
      await limits(request, name, now);
      const row = await db.prepare(`SELECT p.user_id AS userId,p.handle,p.salt,p.verifier,p.account_revision AS revision FROM rockstar_account_passwords p JOIN rockstar_accounts a ON a.user_id=p.user_id AND a.revision=p.account_revision WHERE p.handle=?`).bind(name).first<PasswordRow>();
      const actual = await rockstarPasswordHash(secret, row?.salt ?? 'rockstar-dummy-salt-for-unknown-account');
      const expected = row?.verifier ?? '0'.repeat(64);
      if (!timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex')) || !row || authenticatedOwner && authenticatedOwner !== row.userId) throw new Error('UNAUTHORIZED');
      return { ...await issue(request, row, now), recoveryCode: null };
    },
    async authenticate(request: Request, now = Date.now()) {
      sameOrigin(request);
      const access = readCookie(request);
      if (!/^rock_account_[A-Za-z0-9_-]{43}$/.test(access)) throw new Error('UNAUTHORIZED');
      const tokenHash = await digest(access);
      const row = await db.prepare(`SELECT s.id,s.user_id AS userId FROM rockstar_account_sessions s
        JOIN rockstar_accounts a ON a.user_id=s.user_id AND a.revision=s.account_revision
        JOIN rockstar_account_passwords p ON p.user_id=s.user_id AND p.account_revision=s.account_revision
        WHERE s.token_sha256=? AND s.revoked_at IS NULL AND s.expires_at>? AND s.last_used_at>?`).bind(tokenHash, now, now - IDLE).first<{ id: string; userId: string }>();
      if (!row) throw new Error('UNAUTHORIZED');
      const updated = await db.prepare('UPDATE rockstar_account_sessions SET last_used_at=? WHERE id=? AND revoked_at IS NULL AND expires_at>?').bind(now, row.id, now).run();
      if (updated.meta.changes !== 1) throw new Error('UNAUTHORIZED');
      return row.userId;
    },
    async logout(request: Request, now = Date.now()) {
      sameOrigin(request);
      const access = readCookie(request);
      if (/^rock_account_[A-Za-z0-9_-]{43}$/.test(access)) await db.prepare('UPDATE rockstar_account_sessions SET revoked_at=? WHERE token_sha256=? AND revoked_at IS NULL').bind(now, await digest(access)).run();
    },
  };
}
