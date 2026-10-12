import { database, requestUser } from '@/lib/fund-store';
import { rockstarDeviceLinkStore } from '@/lib/rockstar-device-link';

const json = (value: unknown, status = 200) => Response.json(value, {
  status,
  headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache' },
});

export async function GET(request: Request) {
  try {
    const owner = await requestUser(request);
    return json({ sessions: await rockstarDeviceLinkStore(database()).list(owner) });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') return json({ error: 'sign_in_required' }, 401);
    if (error instanceof Error && error.message === 'ORIGIN') return json({ error: 'origin_rejected' }, 403);
    return json({ error: 'device_sessions_unavailable' }, 503);
  }
}

export async function DELETE(request: Request) {
  try {
    const owner = await requestUser(request);
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 1_024) return json({ error: 'request_too_large' }, 413);
    const input: unknown = JSON.parse(raw);
    if (!input || typeof input !== 'object' || Array.isArray(input) ||
        Object.keys(input).length !== 1 || typeof (input as { id?: unknown }).id !== 'string' ||
        !/^[0-9a-f-]{36}$/i.test((input as { id: string }).id))
      return json({ error: 'invalid_request' }, 400);
    const revoked = await rockstarDeviceLinkStore(database()).revoke(owner, (input as { id: string }).id);
    return revoked ? json({ revoked: true }) : json({ error: 'session_not_found' }, 404);
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') return json({ error: 'sign_in_required' }, 401);
    if (error instanceof Error && error.message === 'ORIGIN') return json({ error: 'origin_rejected' }, 403);
    if (error instanceof SyntaxError) return json({ error: 'invalid_request' }, 400);
    return json({ error: 'device_sessions_unavailable' }, 503);
  }
}
