import { env } from 'cloudflare:workers';
import { jenniferPasskeyStore } from '@/lib/jennifer-passkey';
import { readBoundedStream } from '@/lib/bounded-stream';

const headers = { 'Cache-Control': 'no-store, private' };

async function jsonBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('PASSKEY_INVALID');
  let body: unknown;
  try {
    const value = await readBoundedStream(reader, 32_768, () => new Error('BODY_TOO_LARGE'));
    body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(value));
  } finally { reader.releaseLock(); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('PASSKEY_INVALID');
  return body as Record<string, unknown>;
}

function failure(error: unknown) {
  const code = error instanceof Error ? error.message : 'PASSKEY_FAILED';
  if (code === 'ORIGIN') return Response.json({ error: code }, { status: 403, headers });
  if (code === 'UNAUTHORIZED') return Response.json({ error: code }, { status: 401, headers });
  if (code === 'PASSKEY_RATE_LIMITED') return Response.json({ error: code }, { status: 429, headers });
  if (['AUTH_UNAVAILABLE', 'PASSKEY_UNAVAILABLE'].includes(code))
    return Response.json({ error: 'AUTH_UNAVAILABLE' }, { status: 503, headers });
  return Response.json({ error: 'PASSKEY_INVALID' }, { status: 400, headers });
}

export async function POST(request: Request) {
  try {
    const db = (env as unknown as { DB?: D1Database }).DB;
    if (!db) throw new Error('AUTH_UNAVAILABLE');
    const body = await jsonBody(request);
    const store = jenniferPasskeyStore(db);
    if (body.action === 'options')
      return Response.json(await store.authenticationOptions(request), { headers });
    if (body.action !== 'verify') throw new Error('PASSKEY_INVALID');
    const session = await store.authenticatePasskey(request, body);
    return Response.json({ authenticated: true, expiresAt: session.expiresAt }, {
      headers: { ...headers, 'Set-Cookie': session.cookie },
    });
  } catch (error) { return failure(error); }
}

