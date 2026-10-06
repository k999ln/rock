import { env } from 'cloudflare:workers';
import { database, requestUser } from '@/lib/fund-store';
import { esimCloudAccessStore, esimCloudCookie, readEsimCloudRequest } from '@/lib/esim-cloud-access';
import { parseEsimCloudPolicies } from '@/lib/esim-cloud-grant';

const json = (value: unknown, status = 200, cookie?: string) => Response.json(value, {
  status, headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache', 'Referrer-Policy': 'no-referrer',
    ...(cookie ? { 'Set-Cookie': cookie } : {}) },
});

function failure(error: unknown) {
  const code = error instanceof Error ? error.message : '';
  const status = code === 'CLOUD_ACCESS_BODY_TOO_LARGE' ? 413 : code === 'UNAUTHORIZED' ? 401 : code === 'ORIGIN' ? 403
    : code === 'CLOUD_ACCESS_CONFLICT' ? 409 : code === 'CLOUD_ACCESS_NOT_ELIGIBLE' ? 409 : 503;
  return json({ error: ['UNAUTHORIZED', 'ORIGIN', 'CLOUD_ACCESS_CONFLICT', 'CLOUD_ACCESS_NOT_ELIGIBLE', 'CLOUD_ACCESS_BODY_TOO_LARGE'].includes(code)
    ? code : 'CLOUD_ACCESS_UNAVAILABLE' }, status);
}

async function contextFor(request: Request, context: { params: Promise<{ orderId: string }> }) {
  // Only normal account/session authentication may manage keys; cloud keys cannot mint themselves.
  const owner = await requestUser(request);
  const { orderId } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) return { response: json({ error: 'order_not_found' }, 404) };
  const db = database();
  const order = await db.prepare('SELECT id FROM sky_commerce_orders WHERE id=? AND buyer_user_id=?')
    .bind(orderId, owner).first();
  if (!order) return { response: json({ error: 'order_not_found' }, 404) };
  return { owner, orderId, store: esimCloudAccessStore(db, env) };
}

export async function GET(request: Request, context: { params: Promise<{ orderId: string }> }) {
  try {
    const ctx = await contextFor(request, context);
    if (ctx.response) return ctx.response;
    return json({ ...await ctx.store!.status(ctx.owner!, ctx.orderId!),
      configured: parseEsimCloudPolicies((env as unknown as { ESIM_CLOUD_ACCESS_POLICIES_JSON?: string }).ESIM_CLOUD_ACCESS_POLICIES_JSON).length > 0 });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request, context: { params: Promise<{ orderId: string }> }) {
  try {
    // Management uses browser consent even when a normal device-session bearer is supplied.
    if (request.headers.get('origin') !== new URL(request.url).origin) throw new Error('ORIGIN');
    const ctx = await contextFor(request, context);
    if (ctx.response) return ctx.response;
    const raw = await readEsimCloudRequest(request);
    let input: { action?: unknown; expectedKeyId?: unknown };
    try { input = JSON.parse(raw); } catch { return json({ error: 'invalid_request' }, 400); }
    if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).some((key) => !['action', 'expectedKeyId'].includes(key)) ||
      !['issue', 'rotate', 'revoke'].includes(String(input.action)) ||
      (input.action === 'issue' ? input.expectedKeyId !== undefined
        : typeof input.expectedKeyId !== 'string' || !/^[0-9a-f-]{36}$/i.test(input.expectedKeyId)))
      return json({ error: 'invalid_request' }, 400);
    // Validate HTTPS before changing the credential, so no unusable key replaces a working one.
    esimCloudCookie(request, null);
    if (input.action === 'revoke') {
      await ctx.store!.revoke(ctx.owner!, ctx.orderId!, input.expectedKeyId as string);
      return json(await ctx.store!.status(ctx.owner!, ctx.orderId!), 200, esimCloudCookie(request, null));
    }
    const issued = await ctx.store!.issue(ctx.owner!, ctx.orderId!, input.action === 'rotate' ? input.expectedKeyId as string : null);
    return json(await ctx.store!.status(ctx.owner!, ctx.orderId!), 201, esimCloudCookie(request, issued.token, issued.expiresAt));
  } catch (error) { return failure(error); }
}
