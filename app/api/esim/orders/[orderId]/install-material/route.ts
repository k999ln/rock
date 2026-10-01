import { env } from 'cloudflare:workers';
import { database, requestUser } from '@/lib/fund-store';
import {
  acknowledgeEsimInstallMaterial,
  EsimInstallMaterialError,
  fetchEsimInstallMaterial,
} from '@/lib/esim-install-material';

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      Pragma: 'no-cache',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (new TextEncoder().encode(text).length > 1024) throw new Error('BODY_SIZE');
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('BODY_INVALID');
  const body = value as Record<string, unknown>;
  if (Object.keys(body).length !== 2 ||
      !['fetch', 'acknowledge'].includes(String(body.action)) ||
      typeof body.deliveryRequestId !== 'string') throw new Error('BODY_INVALID');
  return body;
}

function failure(error: unknown) {
  if (error instanceof EsimInstallMaterialError) {
    if (error.code === 'KEY_NOT_CONFIGURED') return json({ error: 'install_material_unavailable' }, 503);
    if (error.code === 'NOT_READY') return json({ error: 'install_material_not_ready' }, 409);
    if (error.code === 'DELIVERY_KEY_CONFLICT') return json({ error: 'delivery_request_conflict' }, 409);
    if (error.code === 'ALREADY_ACKNOWLEDGED') return json({ error: 'install_material_acknowledged' }, 410);
    return json({ error: 'invalid_delivery_request' }, 400);
  }
  if (error instanceof Error && error.message === 'UNAUTHORIZED') return json({ error: 'unauthorized' }, 401);
  if (error instanceof Error && error.message === 'ORIGIN') return json({ error: 'origin_rejected' }, 403);
  if (error instanceof SyntaxError || (error instanceof Error && error.message === 'BODY_INVALID'))
    return json({ error: 'invalid_delivery_request' }, 400);
  if (error instanceof Error && error.message === 'BODY_SIZE') return json({ error: 'request_too_large' }, 413);
  return json({ error: 'install_material_unavailable' }, 503);
}

export async function POST(request: Request, context: { params: Promise<{ orderId: string }> }) {
  try {
    const ownerUserId = await requestUser(request);
    const { orderId } = await context.params;
    if (!/^[0-9a-f-]{36}$/i.test(orderId)) return json({ error: 'order_not_found' }, 404);
    const body = await readBody(request);
    const db = database();
    const order = await db.prepare(`SELECT id FROM sky_commerce_orders
      WHERE id = ? AND buyer_user_id = ? AND mode = 'live' AND status = 'paid' AND refunded_minor = 0`)
      .bind(orderId, ownerUserId).first<{ id: string }>();
    if (!order) return json({ error: 'order_not_found' }, 404);
    if (body.action === 'acknowledge') {
      const state = await acknowledgeEsimInstallMaterial(db, ownerUserId, orderId,
        body.deliveryRequestId as string, Date.now());
      return json({ state });
    }
    const key = (env as unknown as { ESIMGO_INSTALL_MATERIAL_KEY?: string }).ESIMGO_INSTALL_MATERIAL_KEY;
    const material = await fetchEsimInstallMaterial(db, key, ownerUserId, orderId,
      body.deliveryRequestId as string);
    return json({ state: 'ready', deliveryRequestId: body.deliveryRequestId, material });
  } catch (error) {
    return failure(error);
  }
}
