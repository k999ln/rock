import { env } from 'cloudflare:workers';
import { database } from '@/lib/fund-store';
import { verifyStripeSignature } from '@/shared/stripe.mjs';
import { readSkyStripeConfig } from '@/lib/sky-stripe';
import { serviceSetupStore } from '@/lib/rockstar-service-setup-store';
import { requireServiceSetupReady } from '@/lib/rockstar-service-setup';
import { linuxRequestText } from '@/lib/sky-linux-service';
export async function POST(request: Request) {
  try {
    const runtime = env as unknown as Record<string, string>;
    requireServiceSetupReady(runtime);
    const config = readSkyStripeConfig(runtime),
      raw = await linuxRequestText(request, 64000);
    await verifyStripeSignature(
      raw,
      request.headers.get('stripe-signature'),
      config.webhookSecret,
    );
    const event = JSON.parse(raw);
    if (event.livemode !== (config.mode === 'live')) throw new Error();
    if (
      event.type !== 'checkout.session.completed' ||
      !event.data?.object?.metadata?.rockstar_service_setup
    )
      return Response.json({ ignored: true });
    const store = serviceSetupStore(database(), runtime),
      owner = await store.ownerForSession(event.data.object.id);
    // A webhook may precede the saved Session response; ask Stripe to retry that delivery.
    if (!owner)
      return Response.json({ error: 'setup_binding_pending' }, { status: 503 });
    let doc = (await store.get(owner))!;
    doc = await store.reconcileBilling(owner, doc.revision);
    if (doc.payload.billing.verifiedAt !== null)
      await store.provision(owner, doc.revision);
    return Response.json({ accepted: true, paymentCollected: false });
  } catch {
    return Response.json(
      { error: 'setup_evidence_not_accepted' },
      { status: 503 },
    );
  }
}
