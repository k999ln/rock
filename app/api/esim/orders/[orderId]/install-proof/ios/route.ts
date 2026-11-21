import { database, requestUser } from '@/lib/fund-store';
import { declareIosEsimInstall } from '@/lib/esim-install-proof';
import { requestUsesEsimCloudIdentity } from '@/lib/request-identity-hint';

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request, context: { params: Promise<{ orderId: string }> }) {
  try {
    if (request.headers.get('origin') !== new URL(request.url).origin)
      return json({ error: 'origin_rejected' }, 403);
    if (requestUsesEsimCloudIdentity(request)) return json({ error: 'unauthorized' }, 401);
    const ownerUserId = await requestUser(request);
    const { orderId } = await context.params;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId))
      return json({ error: 'order_not_found' }, 404);
    // The account comes from the session and the profile from the paid order.
    // There is no client-provided ICCID, EID, or device proof.
    const body = request.body?.getReader();
    if (body && !(await body.read()).done) {
      await body.cancel();
      return json({ error: 'invalid_install_declaration' }, 400);
    }
    const state = await declareIosEsimInstall(database(), ownerUserId, orderId);
    if (!state) return json({ error: 'order_not_found' }, 404);
    return json({ iosEveEntitlementState: state });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') return json({ error: 'unauthorized' }, 401);
    if (error instanceof Error && error.message === 'ORIGIN') return json({ error: 'origin_rejected' }, 403);
    return json({ error: 'install_declaration_unavailable' }, 503);
  }
}
