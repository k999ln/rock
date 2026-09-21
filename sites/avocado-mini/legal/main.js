const state = document.querySelector('#legal-state p');
const details = document.querySelector('#legal-details');
const closed = document.querySelector('#legal-closed');
const yen = amount => new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(amount);

async function loadDisclosure() {
  try {
    const response = await fetch('/api/preorders/offer', { cache: 'no-store' });
    const offer = await response.json();
    if (!response.ok || !offer.ready) {
      state.textContent = 'Pre-orders and payments are currently closed.';
      return;
    }
    const rows = [
      ['Seller', offer.terms.sellerName],
      ['Address', offer.terms.sellerAddress],
      ['Phone', offer.terms.sellerPhone],
      ['Single Motion Tower total', yen(offer.products.tower.totalJpy)],
      ['Four towers + Edge Hub total', yen(offer.products.kit.totalJpy)],
      ['Shipping', offer.terms.shippingFee],
      ['Payment timing and method', 'Full payment by card at order through Stripe Checkout'],
      ['Estimated delivery', offer.terms.shippingDate],
      ['Cancellation and refunds', offer.terms.cancellation],
      ['Terms version', offer.terms.version],
    ];
    for (const [label, value] of rows) {
      const dt = document.createElement('dt');
      const dd = document.createElement('dd');
      dt.textContent = label;
      dd.textContent = value;
      details.append(dt, dd);
    }
    details.hidden = false;
    closed.hidden = true;
    state.textContent = 'Pre-orders are open under the terms shown on this page.';
  } catch {
    state.textContent = 'The current sales status could not be loaded. Payments remain unavailable.';
  }
}

loadDisclosure();
