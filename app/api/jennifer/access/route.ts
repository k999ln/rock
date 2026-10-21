import { env } from 'cloudflare:workers';
import { clearJenniferSessionCookie, jenniferPasskeyStore } from '@/lib/jennifer-passkey';
import { requestGatewayUser } from '@/lib/request-auth';

const headers = { 'Cache-Control': 'no-store, private', Vary: 'Cookie' };

export async function GET(request: Request) {
  const db = (env as unknown as { DB?: D1Database }).DB;
  if (!db) return Response.json({ error: 'AUTH_UNAVAILABLE' }, { status: 503, headers });
  const store = jenniferPasskeyStore(db);
  try {
    await store.authenticateSession(request);
    return Response.json({ authenticated: true, method: 'passkey' }, { headers });
  } catch {}
  try {
    const owner = await requestGatewayUser(request);
    return Response.json({
      authenticated: false,
      setupAvailable: true,
      recovery: await store.hasCredential(owner),
    }, { headers });
  } catch {
    return Response.json({ authenticated: false, setupAvailable: false, recovery: false }, { headers });
  }
}

export async function DELETE(request: Request) {
  const db = (env as unknown as { DB?: D1Database }).DB;
  if (!db) return Response.json({ error: 'AUTH_UNAVAILABLE' }, { status: 503, headers });
  const store = jenniferPasskeyStore(db);
  try { await store.revokeSession(request); }
  catch (error) {
    if (error instanceof Error && error.message === 'ORIGIN')
      return Response.json({ error: 'ORIGIN' }, { status: 403, headers });
    return Response.json({ error: 'AUTH_UNAVAILABLE' }, { status: 503, headers });
  }
  return Response.json({ signedOut: true }, {
    headers: { ...headers, 'Set-Cookie': clearJenniferSessionCookie(new URL(request.url).protocol === 'https:') },
  });
}

