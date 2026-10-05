import { database } from '@/lib/fund-store';
import { rockstarDeviceLinkStore } from '@/lib/rockstar-device-link';

const json = (value: unknown, status = 200) => Response.json(value, {
  status,
  headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache', 'Referrer-Policy': 'no-referrer' },
});

async function body(request: Request) {
  if (request.headers.get('Content-Type')?.split(';')[0] !== 'application/json')
    throw new Error('CONTENT_TYPE');
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 2_048) throw new Error('BODY_TOO_LARGE');
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('BODY_INVALID');
  return value as Record<string, unknown>;
}

export async function POST(request: Request) {
  try {
    const origin = request.headers.get('Origin');
    if (origin && origin !== new URL(request.url).origin) return json({ error: 'origin_rejected' }, 403);
    const input = await body(request);
    const store = rockstarDeviceLinkStore(database());
    if (input.action === 'begin' && Object.keys(input).every((key) => ['action', 'deviceName'].includes(key))) {
      const authorization = await store.begin(input.deviceName);
      return json({
        ...authorization,
        verificationUri: `${new URL(request.url).origin}/connect/device`,
        verificationUriComplete: `${new URL(request.url).origin}/connect/device?user_code=${authorization.userCode}`,
      }, 201);
    }
    if (input.action === 'poll' && Object.keys(input).length === 2 && typeof input.deviceCode === 'string')
      return json(await store.poll(input.deviceCode));
    return json({ error: 'invalid_device_authorization_request' }, 400);
  } catch (error) {
    if (error instanceof SyntaxError || (error instanceof Error && ['BODY_INVALID', 'CONTENT_TYPE'].includes(error.message)))
      return json({ error: 'invalid_device_authorization_request' }, 400);
    if (error instanceof Error && error.message === 'BODY_TOO_LARGE') return json({ error: 'request_too_large' }, 413);
    if (error instanceof Error && error.message === 'DEVICE_CODE_INVALID') return json({ error: 'invalid_device_code' }, 400);
    if (error instanceof Error && error.message === 'DEVICE_NAME_INVALID') return json({ error: 'invalid_device_name' }, 400);
    return json({ error: 'device_authorization_unavailable' }, 503);
  }
}
