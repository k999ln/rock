import { env } from 'cloudflare:workers';
import { requestUser, requestGatewayUser } from '@/lib/request-auth';
import { rockstarAccountStore } from '@/lib/rockstar-account';
import {
  clearJenniferSessionCookie,
  jenniferPasskeyStore,
} from '@/lib/jennifer-passkey';
import { readBoundedStream } from '@/lib/bounded-stream';
import { rockstarPasswordStore, rockstarPasswordCookie, hasRockstarPasswordCookie } from '@/lib/rockstar-password';

export const dynamic = 'force-dynamic';
const headers = {
  'Cache-Control': 'private, no-store',
  Vary: 'Cookie, Authorization',
};
function database() {
  const db = (env as unknown as { DB?: D1Database }).DB;
  if (!db) throw new Error('AUTH_UNAVAILABLE');
  return db;
}
async function owner(request: Request) {
  try {
    return await requestUser(request);
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') return null;
    throw error;
  }
}
async function body(request: Request) {
  if (
    request.headers.get('content-type')?.split(';')[0].trim() !==
    'application/json'
  )
    throw new Error('PASSKEY_INVALID');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('PASSKEY_INVALID');
  try {
    const value: unknown = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(
        await readBoundedStream(
          reader,
          32_768,
          () => new Error('BODY_TOO_LARGE'),
        ),
      ),
    );
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error('PASSKEY_INVALID');
    return value as Record<string, unknown>;
  } finally {
    reader.releaseLock();
  }
}
function failure(error: unknown) {
  const code = error instanceof Error ? error.message : 'AUTH_UNAVAILABLE';
  const allowed = [
    'UNAUTHORIZED',
    'ORIGIN',
    'PASSKEY_HOST_INVALID',
    'PASSKEY_INVALID',
    'PASSKEY_CHALLENGE_INVALID',
    'PASSKEY_RATE_LIMITED',
    'ACCOUNT_ALREADY_SIGNED_IN',
    'CREDENTIAL_NOT_REMOVABLE',
    'PASSKEY_REAUTH_REQUIRED',
    'ACCOUNT_NAME_INVALID',
    'ACCOUNT_NAME_UNAVAILABLE',
    'ACCOUNT_LOGIN_ALREADY_CONFIGURED',
    'PASSWORD_INVALID',
    'ACCOUNT_BUSY',
  ];
  const safe = allowed.includes(code) ? code : 'AUTH_UNAVAILABLE';
  const status =
    safe === 'UNAUTHORIZED'
      ? 401
      : ['ORIGIN', 'PASSKEY_HOST_INVALID', 'PASSKEY_REAUTH_REQUIRED'].includes(
            safe,
          )
        ? 403
        : ['PASSKEY_RATE_LIMITED', 'ACCOUNT_BUSY'].includes(safe)
          ? 429
          : safe === 'AUTH_UNAVAILABLE'
            ? 503
            : 400;
  return Response.json({ error: safe }, { status, headers });
}
export async function GET(request: Request) {
  try {
    const userId = await owner(request);
    if (!userId) return Response.json({ signedIn: false }, { headers });
    const db = database();
    let method = 'gateway';
    if (hasRockstarPasswordCookie(request)) method = 'password';
    try {
      if (
        (await jenniferPasskeyStore(db).authenticateSession(request)) === userId
      )
        method = 'passkey';
    } catch {}
    const scope = [
      ...new Uint8Array(
        await crypto.subtle.digest(
          'SHA-256',
          new TextEncoder().encode('rockstar-storage:' + userId),
        ),
      ),
    ]
      .map((x) => x.toString(16).padStart(2, '0'))
      .join('');
    return Response.json(
      {
        signedIn: true,
        method,
        storageScope: scope,
        credentials: await rockstarAccountStore(db).listCredentials(userId),
        passwordLogin: await rockstarPasswordStore(db).status(userId),
        recoveryConfigured: Boolean(
          await db
            .prepare('SELECT user_id FROM rockstar_accounts WHERE user_id = ?')
            .bind(userId)
            .first(),
        ),
      },
      { headers },
    );
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  try {
    const input = await body(request);
    const db = database();
    const userId = await owner(request);
    const store = rockstarAccountStore(db);
    if (input.action === 'password') {
      const passwords = rockstarPasswordStore(db);
      const session = input.mode === 'login'
        ? await passwords.login(request, input, userId)
        : await passwords.enroll(request, input, userId);
      const response = Response.json({ signedIn: true, recoveryCode: session.recoveryCode, expiresAt: session.expiresAt }, { headers });
      response.headers.append('Set-Cookie', session.cookie);
      response.headers.append('Set-Cookie', clearJenniferSessionCookie(new URL(request.url).protocol === 'https:'));
      return response;
    }
    if (input.action === 'options') {
      const { cookie, ...options } = await store.begin(request, input, userId);
      return Response.json(options, {
        headers: { ...headers, 'Set-Cookie': cookie },
      });
    }
    if (input.action === 'verify') {
      const session = await store.finish(request, input, userId);
      const response = Response.json(
        {
          signedIn: true,
          recoveryCode: session.recoveryCode,
          expiresAt: session.expiresAt,
        },
        { headers },
      );
      response.headers.append('Set-Cookie', session.cookie);
      response.headers.append('Set-Cookie', session.clearBinding);
      response.headers.append('Set-Cookie', rockstarPasswordCookie(request));
      return response;
    }
    if (input.action === 'revokeCredential') {
      if (!userId) throw new Error('UNAUTHORIZED');
      await jenniferPasskeyStore(db).requireRecentSession(request, userId);
      await store.revokeCredential(request, userId, input.id);
      return Response.json({ revoked: true }, { headers });
    }
    throw new Error('PASSKEY_INVALID');
  } catch (error) {
    return failure(error);
  }
}
export async function DELETE(request: Request) {
  try {
    await jenniferPasskeyStore(database()).revokeSession(request);
    await rockstarPasswordStore(database()).logout(request);
    let gatewaySignout = false;
    try {
      await requestGatewayUser(request);
      gatewaySignout = true;
    } catch {}
    const response = Response.json(
      { signedOut: true, gatewaySignout },
      {
        headers: {
          ...headers,
          'Set-Cookie': clearJenniferSessionCookie(
            new URL(request.url).protocol === 'https:',
          ),
        },
      },
    );
    response.headers.append('Set-Cookie', rockstarPasswordCookie(request));
    return response;
  } catch (error) {
    return failure(error);
  }
}
