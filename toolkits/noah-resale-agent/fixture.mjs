import { candidate } from '../../lib/noah-resale.ts';
import { digest } from '../../lib/noah-resale-provider.ts';
// Explicit offline fixture. Never delegates to fetch or reads provider credentials.
export function fixtureProvider() {
  return {
    ready: {
      search: true,
      purchase: true,
      publish: true,
      sandbox: true,
      liveEnabled: false,
    },
    async search(query, role, currency) {
      return [
        {
          ...candidate({
            role,
            title: `[DEMO] ${query}`.slice(0, 80),
            externalId: `demo-${role}`,
            url: `https://example.com/demo/${role}`,
            currency,
            price: currency === 'JPY' ? 1000 : 1000,
          }),
          provider: 'ebay',
        },
      ];
    },
    async prepare(i) {
      return {
        id: `demo-checkout-${i.id}`,
        total: i.price + 100,
        digest: await digest(['demo', i.id, i.price]),
        expiresAt: Date.now() + 300000,
        summary: 'DEMO ONLY: no shipment, no payment',
      };
    },
    async purchase(i) {
      return `demo-order-${i.id}`;
    },
    async publish(i, checkpoint) {
      await checkpoint(`demo-offer-${i.id}`);
      return `demo-listing-${i.id}`;
    },
    async reconcile(i, kind) {
      return `demo-${kind === 'purchase' ? 'order' : 'listing'}-${i.id}`;
    },
  };
}
