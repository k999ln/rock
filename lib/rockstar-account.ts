import { jenniferPasskeyStore } from './jennifer-passkey.ts';

type Database = Pick<D1Database, 'prepare' | 'batch'>;
type Mode = 'signup' | 'add' | 'recover' | 'login';
type Flow = {
  id: string;
  userId: string | null;
  mode: Mode;
  binding: string;
  origin: string;
  recoveryHash: string | null;
  expectedRevision: number;
  expiresAt: number;
  consumedAt: number | null;
};
const TTL = 300_000;
const CODE = /^rock_recovery_[A-Za-z0-9_-]{43}$/;
const cookieName = (request: Request) =>
  new URL(request.url).protocol === 'https:'
    ? '__Host-rockstar_enrollment'
    : 'rockstar_enrollment';
const changed = (result: D1Result | undefined) =>
  Number(result?.meta?.changes ?? 0);

function token(prefix = '') {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return (
    prefix +
    btoa(String.fromCharCode(...bytes))
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replace(/=+$/, '')
  );
}
async function hash(value: string) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
    ),
  ]
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
}
function origin(request: Request) {
  const url = new URL(request.url);
  const allowed =
    url.origin === 'https://avoado.si' ||
    (['localhost', '127.0.0.1'].includes(url.hostname) &&
      url.protocol === 'http:');
  if (!allowed) throw new Error('PASSKEY_HOST_INVALID');
  if (request.headers.get('origin') !== url.origin) throw new Error('ORIGIN');
  return url.origin;
}
function cookie(request: Request, value: string, age = 300) {
  return `${cookieName(request)}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`;
}
function binding(request: Request) {
  const prefix = cookieName(request) + '=';
  return (
    (request.headers.get('cookie') ?? '')
      .split(';')
      .map((x) => x.trim())
      .find((x) => x.startsWith(prefix))
      ?.slice(prefix.length) ?? ''
  );
}

/** Uses the existing owner namespace and passkey verification. No client-selected owner or email merging. */
export function rockstarAccountStore(db: Database) {
  const passkeys = jenniferPasskeyStore(db);
  async function throttle(request: Request, now: number) {
    const key = await hash(
      (request.headers.get('cf-connecting-ip') ?? 'local') +
        '\n' +
        (request.headers.get('user-agent') ?? '').slice(0, 256),
    );
    const window = Math.floor(now / 60_000);
    const result = await db
      .prepare(`INSERT INTO rockstar_account_rate_limits(request_key, window, attempts)
      VALUES (?, ?, 1) ON CONFLICT(request_key, window) DO UPDATE SET attempts = attempts + 1
      RETURNING attempts`)
      .bind(key, window)
      .first<{ attempts: number }>();
    if (!result || result.attempts > 20)
      throw new Error('PASSKEY_RATE_LIMITED');
    await db
      .prepare(`DELETE FROM rockstar_account_rate_limits WHERE window < ?`)
      .bind(window - 10)
      .run();
  }
  async function flow(
    request: Request,
    body: Record<string, unknown>,
    now: number,
  ) {
    const currentOrigin = origin(request);
    if (
      typeof body.challengeId !== 'string' ||
      !/^[0-9a-f-]{36}$/i.test(body.challengeId)
    )
      throw new Error('PASSKEY_CHALLENGE_INVALID');
    const row = await db
      .prepare(`SELECT id, user_id AS userId, mode, binding_sha256 AS binding, origin,
      recovery_sha256 AS recoveryHash, expected_revision AS expectedRevision, expires_at AS expiresAt, consumed_at AS consumedAt
      FROM rockstar_account_enrollments WHERE id = ?`)
      .bind(body.challengeId)
      .first<Flow>();
    const proof = binding(request);
    if (
      !row ||
      row.consumedAt !== null ||
      row.expiresAt <= now ||
      row.origin !== currentOrigin ||
      !/^[A-Za-z0-9_-]{43}$/.test(proof) ||
      (await hash(proof)) !== row.binding
    )
      throw new Error('PASSKEY_CHALLENGE_INVALID');
    return row;
  }
  return {
    async begin(
      request: Request,
      body: Record<string, unknown>,
      authenticatedOwner: string | null,
      now = Date.now(),
    ) {
      const currentOrigin = origin(request);
      await throttle(request, now);
      const mode = body.mode as Mode;
      if (!['signup', 'add', 'recover', 'login'].includes(mode))
        throw new Error('PASSKEY_INVALID');
      if (mode === 'signup' && authenticatedOwner)
        throw new Error('ACCOUNT_ALREADY_SIGNED_IN');
      if (mode === 'add' && !authenticatedOwner)
        throw new Error('UNAUTHORIZED');
      let userId =
        mode === 'signup'
          ? 'rockstar:' + crypto.randomUUID()
          : mode === 'add' || mode === 'login'
            ? authenticatedOwner
            : null;
      let recoveryHash: string | null = null;
      if (mode === 'recover') {
        if (
          typeof body.recoveryCode !== 'string' ||
          !CODE.test(body.recoveryCode)
        )
          throw new Error('UNAUTHORIZED');
        recoveryHash = await hash(body.recoveryCode);
        const account = await db
          .prepare(`SELECT user_id AS userId FROM rockstar_accounts
          WHERE recovery_sha256 = ?`)
          .bind(recoveryHash)
          .first<{ userId: string }>();
        if (!account || body.confirmRevoke !== true)
          throw new Error('UNAUTHORIZED');
        userId = account.userId;
      }
      const revision = userId
        ? await db
            .prepare('SELECT revision FROM rockstar_accounts WHERE user_id = ?')
            .bind(userId)
            .first<{ revision: number }>()
        : null;
      const options =
        mode === 'login'
          ? await passkeys.authenticationOptions(request, now)
          : await passkeys.registrationOptions(
              userId!,
              request,
              now,
              'RockstarOS',
            );
      const browserBinding = token();
      await db
        .prepare(
          `DELETE FROM rockstar_account_enrollments WHERE expires_at < ?`,
        )
        .bind(now - TTL)
        .run();
      await db
        .prepare(`INSERT INTO rockstar_account_enrollments
        (id, user_id, mode, binding_sha256, origin, recovery_sha256, expected_revision, created_at, expires_at, consumed_at, completion_nonce)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`)
        .bind(
          options.challengeId,
          userId,
          mode,
          await hash(browserBinding),
          currentOrigin,
          recoveryHash,
          revision?.revision ?? 0,
          now,
          now + TTL,
        )
        .run();
      return { ...options, mode, cookie: cookie(request, browserBinding) };
    },

    async finish(
      request: Request,
      body: Record<string, unknown>,
      authenticatedOwner: string | null,
      now = Date.now(),
    ) {
      origin(request);
      await throttle(request, now);
      const pending = await flow(request, body, now);
      if (
        pending.mode === 'add' &&
        (!authenticatedOwner || authenticatedOwner !== pending.userId)
      )
        throw new Error('UNAUTHORIZED');
      if (pending.mode === 'signup' && authenticatedOwner)
        throw new Error('ACCOUNT_ALREADY_SIGNED_IN');
      if (pending.mode === 'login') {
        if (pending.userId && authenticatedOwner !== pending.userId)
          throw new Error('UNAUTHORIZED');
        // The WebAuthn verifier consumes its one-use challenge before issuing a session.
        const session = await passkeys.authenticatePasskey(
          request,
          body,
          now,
          pending.userId ?? authenticatedOwner ?? undefined,
        );
        await db
          .prepare(
            `UPDATE rockstar_account_enrollments SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL`,
          )
          .bind(now, pending.id)
          .run();
        return {
          ...session,
          recoveryCode: null,
          clearBinding: cookie(request, '', 0),
        };
      }
      const userId = pending.userId!;
      const credential = await passkeys.prepareCredentialEnrollment(
        userId,
        request,
        body,
        now,
      );
      const nonce = token();
      const recoveryCode = token('rock_recovery_');
      const nextRecoveryHash = await hash(recoveryCode);
      const fence = `EXISTS (SELECT 1 FROM rockstar_account_enrollments WHERE id = ? AND completion_nonce = ?)`;
      const args = [pending.id, nonce];
      const accountFence =
        pending.mode === 'recover'
          ? `${fence} AND EXISTS (SELECT 1 FROM rockstar_accounts WHERE user_id = ? AND recovery_sha256 = ?)`
          : fence;
      const gatedArgs =
        pending.mode === 'recover' ? [...args, userId, nextRecoveryHash] : args;
      const statements = [
        db
          .prepare(`UPDATE rockstar_account_enrollments SET consumed_at = ?, completion_nonce = ?
          WHERE id = ? AND consumed_at IS NULL AND expires_at > ? AND binding_sha256 = ?
          AND EXISTS (SELECT 1 FROM jennifer_passkey_challenges WHERE id = ? AND consumed_at IS NULL AND expires_at > ?)
          AND (? = 'recover' OR (SELECT COUNT(*) FROM jennifer_passkey_credentials WHERE user_id = ? AND revoked_at IS NULL) < 20)
          AND (? != 'add' OR COALESCE((SELECT revision FROM rockstar_accounts WHERE user_id = ?), 0) = ?)`)
          .bind(
            now,
            nonce,
            pending.id,
            now,
            pending.binding,
            pending.id,
            now,
            pending.mode,
            userId,
            pending.mode,
            userId,
            pending.expectedRevision,
          ),
        pending.mode === 'recover'
          ? db
              .prepare(`UPDATE rockstar_accounts SET recovery_sha256 = ?, revision = revision + 1, updated_at = ?
              WHERE user_id = ? AND recovery_sha256 = ? AND ${fence}`)
              .bind(
                nextRecoveryHash,
                now,
                userId,
                pending.recoveryHash,
                ...args,
              )
          : db
              .prepare(`INSERT INTO rockstar_accounts(user_id, recovery_sha256, revision, created_at, updated_at)
              SELECT ?, ?, 1, ?, ? WHERE ${fence} ON CONFLICT(user_id) DO NOTHING`)
              .bind(userId, nextRecoveryHash, now, now, ...args),
      ];
      if (pending.mode === 'recover') {
        for (const table of [
          'jennifer_passkey_credentials',
          'jennifer_passkey_sessions',
          'rockstar_device_sessions',
        ])
          statements.push(
            db
              .prepare(
                `UPDATE ${table} SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL AND ${accountFence}`,
              )
              .bind(now, userId, ...gatedArgs),
          );
        statements.push(
          db
            .prepare(`UPDATE rockstar_device_authorizations SET status = 'denied'
          WHERE user_id = ? AND status = 'approved' AND ${accountFence}`)
            .bind(userId, ...gatedArgs),
        );
      }
      const credentialIndex = statements.length;
      statements.push(
        db
          .prepare(`INSERT INTO jennifer_passkey_credentials
        (credential_id,user_id,public_key_cose,sign_count,transports_json,label,device_type,backed_up,rp_id,created_at,last_used_at,revoked_at)
        SELECT ?,?,?,?,?,?,?,?,?,?,NULL,NULL WHERE ${accountFence}
        AND (SELECT COUNT(*) FROM jennifer_passkey_credentials WHERE user_id = ? AND revoked_at IS NULL) < 20`)
          .bind(
            credential.credentialId,
            userId,
            credential.publicKeyCose,
            credential.counter,
            credential.transportsJson,
            'RockstarOS passkey',
            credential.deviceType,
            credential.backedUp,
            credential.rpId,
            now,
            ...gatedArgs,
            userId,
          ),
      );
      statements.push(
        db
          .prepare(
            `UPDATE jennifer_passkey_challenges SET consumed_at = ? WHERE id = ? AND ${accountFence}`,
          )
          .bind(now, pending.id, ...gatedArgs),
      );
      statements.push(
        db
          .prepare(`INSERT INTO jennifer_passkey_events(id,user_id,event_type,credential_id,details_json,created_at)
        SELECT ?,?,?,?,'{}',? WHERE ${accountFence}`)
          .bind(
            crypto.randomUUID(),
            userId,
            pending.mode === 'recover'
              ? 'account_recovery'
              : pending.mode === 'add'
                ? 'credential_added'
                : 'independent_signup',
            credential.credentialId,
            now,
            ...gatedArgs,
          ),
      );
      const results = await db.batch(statements);
      if (changed(results[0]) !== 1 || changed(results[credentialIndex]) !== 1)
        throw new Error('PASSKEY_CHALLENGE_INVALID');
      const session = await passkeys.issueEnrollmentSession(
        userId,
        credential.credentialId,
        request,
        now,
      );
      return {
        ...session,
        recoveryCode: changed(results[1]) === 1 ? recoveryCode : null,
        clearBinding: cookie(request, '', 0),
      };
    },

    async listCredentials(owner: string) {
      return (
        await db
          .prepare(`SELECT credential_id AS id,label,created_at AS createdAt,last_used_at AS lastUsedAt,
        device_type AS deviceType,backed_up AS backedUp FROM jennifer_passkey_credentials
        WHERE user_id = ? AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 20`)
          .bind(owner)
          .all()
      ).results;
    },

    async revokeCredential(
      request: Request,
      owner: string,
      id: unknown,
      now = Date.now(),
    ) {
      origin(request);
      if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{16,1400}$/.test(id))
        throw new Error('PASSKEY_INVALID');
      const result = await db
        .prepare(`UPDATE jennifer_passkey_credentials SET revoked_at = ?
        WHERE credential_id = ? AND user_id = ? AND revoked_at IS NULL
        AND (SELECT COUNT(*) FROM jennifer_passkey_credentials WHERE user_id = ? AND revoked_at IS NULL) > 1`)
        .bind(now, id, owner, owner)
        .run();
      if (changed(result) !== 1) throw new Error('CREDENTIAL_NOT_REMOVABLE');
      await db
        .prepare(
          `UPDATE jennifer_passkey_sessions SET revoked_at = ? WHERE user_id = ? AND credential_id = ? AND revoked_at IS NULL`,
        )
        .bind(now, owner, id)
        .run();
    },
  };
}
