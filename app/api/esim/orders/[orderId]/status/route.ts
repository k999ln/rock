import { database, requestUser } from '@/lib/fund-store';

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache', 'X-Content-Type-Options': 'nosniff' },
  });
}

type Row = {
  id: string;
  mode: string;
  status: string;
  refundedMinor: number;
  providerState: string | null;
  hasInstallMaterial: number | null;
  installMaterialDeliveredAt: number | null;
  profileBound: number;
};

export async function GET(request: Request, context: { params: Promise<{ orderId: string }> }) {
  try {
    const ownerUserId = await requestUser(request);
    const { orderId } = await context.params;
    if (!/^[0-9a-f-]{36}$/i.test(orderId)) return json({ error: 'order_not_found' }, 404);
    const row = await database().prepare(`SELECT o.id, o.mode, o.status,
        o.refunded_minor AS refundedMinor, p.state AS providerState,
        CASE WHEN p.install_material_ciphertext IS NOT NULL THEN 1 ELSE 0 END AS hasInstallMaterial,
        p.install_material_delivered_at AS installMaterialDeliveredAt,
        CASE WHEN b.sky_order_id IS NOT NULL THEN 1 ELSE 0 END AS profileBound
      FROM sky_commerce_orders o
      LEFT JOIN esim_provider_orders p ON p.sky_order_id = o.id AND p.owner_user_id = o.buyer_user_id
      LEFT JOIN esim_provider_profile_bindings b ON b.sky_order_id = o.id AND b.owner_user_id = o.buyer_user_id
      WHERE o.id = ? AND o.buyer_user_id = ?`)
      .bind(orderId, ownerUserId).first<Row>();
    if (!row) return json({ error: 'order_not_found' }, 404);
    if (row.mode !== 'live' || row.status !== 'paid' || row.refundedMinor !== 0)
      return json({ orderId, state: 'not_eligible' });

    let state: string;
    switch (row.providerState) {
      case null:
        state = 'paid_waiting_for_esim_issuance';
        break;
      case 'dispatch_started':
      case 'reconciliation_required':
        state = 'provider_outcome_requires_reconciliation';
        break;
      case 'provider_completed':
        state = 'provider_completed_binding_pending';
        break;
      case 'profile_bound':
        state = row.hasInstallMaterial ? 'profile_bound_install_material_ready'
          : row.installMaterialDeliveredAt ? 'install_material_acknowledged'
            : 'profile_bound_install_material_unavailable';
        break;
      default:
        state = 'provider_state_unknown';
    }
    return json({
      orderId,
      state,
      profileBound: row.profileBound === 1,
      installMaterialAvailable: row.hasInstallMaterial === 1,
      installMaterialAcknowledged: row.installMaterialDeliveredAt !== null,
      reconciliationEndpointAvailable: row.providerState === 'provider_completed',
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') return json({ error: 'unauthorized' }, 401);
    if (error instanceof Error && error.message === 'ORIGIN') return json({ error: 'origin_rejected' }, 403);
    return json({ error: 'status_unavailable' }, 503);
  }
}
