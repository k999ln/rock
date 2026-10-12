import { database, requestUser } from '@/lib/fund-store';
import { rockstarDeviceLinkStore } from '@/lib/rockstar-device-link';

const json = (value: unknown, status = 200) => Response.json(value, {
  status,
  headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache' },
});

export async function POST(request: Request) {
  try {
    const owner = await requestUser(request);
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 1_024) return json({ error: 'request_too_large' }, 413);
    const input: unknown = JSON.parse(raw);
    if (!input || typeof input !== 'object' || Array.isArray(input)) return json({ error: 'invalid_request' }, 400);
    const value = input as Record<string, unknown>;
    if (Object.keys(value).length !== 2 || typeof value.userCode !== 'string' ||
        (value.action !== 'approve' && value.action !== 'deny'))
      return json({ error: 'invalid_request' }, 400);
    const store = rockstarDeviceLinkStore(database());
    const result = value.action === 'approve'
      ? await store.approve(value.userCode, owner)
      : await store.deny(value.userCode, owner);
    const accepted = value.action === 'approve'
      ? ('approved' in result && result.approved)
      : ('denied' in result && result.denied);
    return accepted ? json({ state: value.action === 'approve' ? 'approved' : 'denied' })
      : json({ error: 'device_code_invalid_expired_or_used' }, 404);
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') return json({ error: 'sign_in_required' }, 401);
    if (error instanceof Error && error.message === 'ORIGIN') return json({ error: 'origin_rejected' }, 403);
    if (error instanceof SyntaxError) return json({ error: 'invalid_request' }, 400);
    if (error instanceof Error && error.message === 'DEVICE_AUTHORIZATION_CODE_INVALID') return json({ error: 'invalid_user_code' }, 400);
    return json({ error: 'device_authorization_unavailable' }, 503);
  }
}

export async function GET(request: Request) {
  try {
    await requestUser(request);
    const code = new URL(request.url).searchParams.get('user_code');
    const authorization = await rockstarDeviceLinkStore(database()).lookup(code);
    return authorization ? json({ authorization }) : json({ error: 'device_code_invalid_expired_or_used' }, 404);
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') return json({ error: 'sign_in_required' }, 401);
    if (error instanceof Error && error.message === 'ORIGIN') return json({ error: 'origin_rejected' }, 403);
    return json({ error: 'device_authorization_unavailable' }, 503);
  }
}
