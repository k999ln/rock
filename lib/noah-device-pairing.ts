import { rockstarDeviceLinkStore } from './rockstar-device-link.ts';

type Database = Pick<D1Database, 'prepare' | 'batch'>;
const json = (value: unknown, status = 200) => Response.json(value, { status,
  headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
async function input(request: Request) {
  if (request.headers.get('content-type')?.split(';')[0] !== 'application/json') throw Error('INVALID_REQUEST');
  const reader = request.body?.getReader();
  if (!reader) throw Error('INVALID_REQUEST');
  const parts: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const chunk = await reader.read(); if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 1024) { await reader.cancel(); throw Error('INVALID_REQUEST'); }
      parts.push(chunk.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.length; }
  const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('INVALID_REQUEST');
  return value as Record<string, unknown>;
}
const fields = (value: Record<string, unknown>, names: string[]) =>
  Object.keys(value).length === names.length && names.every(name => Object.hasOwn(value, name));

export function createNoahDevicePairing(db: Database, authenticate: (request: Request) => Promise<string>) {
  const store = rockstarDeviceLinkStore(db, 'noah-runner');
  return async (request: Request) => {
    try {
      const url = new URL(request.url), publicPair = url.pathname === '/api/noah/devices/pair';
      if (!publicPair && url.pathname !== '/api/noah/devices') return json({}, 404);
      if (request.method !== 'GET' && request.method !== 'POST') return json({}, 405);
      if (request.method === 'POST') {
        const origin = request.headers.get('origin');
        if ((!publicPair && origin !== url.origin) || (origin && origin !== url.origin)) return json({}, 403);
      }
      if (publicPair) {
        if (request.method !== 'POST') return json({}, 405);
        const value = await input(request);
        if (value.action === 'begin' && fields(value, ['action', 'deviceName']) && value.deviceName === 'Noah Mac Runner') {
          const grant = await store.begin(value.deviceName);
          return json({ ...grant, verificationUriComplete: `${url.origin}/noah/mac/connect?user_code=${grant.userCode}` }, 201);
        }
        if (value.action === 'poll' && fields(value, ['action', 'deviceCode']) && typeof value.deviceCode === 'string')
          return json(await store.poll(value.deviceCode));
        return json({}, 400);
      }
      // The normal Noah browser capability owns this grant. No account enrollment is required.
      const owner = await authenticate(request);
      if (request.method === 'GET') {
        if (url.searchParams.has('user_code')) {
          const authorization = await store.lookup(url.searchParams.get('user_code'));
          return authorization ? json({ authorization }) : json({}, 404);
        }
        return json({ sessions: await store.list(owner) });
      }
      const value = await input(request);
      if (fields(value, ['action', 'userCode']) && typeof value.userCode === 'string') {
        if (value.action === 'approve') return (await store.approve(value.userCode, owner)).approved ? json({ state: 'approved' }) : json({}, 404);
        if (value.action === 'deny') return (await store.deny(value.userCode, owner)).denied ? json({ state: 'denied' }) : json({}, 404);
      }
      if (value.action === 'revoke' && fields(value, ['action', 'id']) && typeof value.id === 'string')
        return await store.revoke(owner, value.id) ? json({ revoked: true }) : json({}, 404);
      return json({}, 400);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      return json({ error: message === 'UNAUTHORIZED' ? 'Noahの保存先を確認してください。' : '接続を確認できませんでした。' },
        message === 'UNAUTHORIZED' ? 401 : message === 'ORIGIN' ? 403 : error instanceof SyntaxError || /INVALID/.test(message) ? 400 : 503);
    }
  };
}
