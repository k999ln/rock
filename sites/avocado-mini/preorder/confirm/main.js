const state = document.querySelector('#review-state');
const details = document.querySelector('#review-details');
const consent = document.querySelector('#terms-consent');
const consentLabel = document.querySelector('.checkout-consent');
const checkoutButton = document.querySelector('#checkout-button');
const sku = new URL(location.href).searchParams.get('sku');
const yen = amount => new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(amount);
let currentOffer;

function showDetails(offer) {
  const product = offer.products[sku];
  const rows = [
    ['Product', product.name],
    ['Quantity', '1'],
    ['Total', `${yen(product.totalJpy)} · tax and shipping included`],
    ['Payment', 'Full payment by card through Stripe Checkout'],
    ['Estimated delivery', offer.terms.shippingDate],
    ['Shipping', offer.terms.shippingFee],
    ['Cancellation and refunds', offer.terms.cancellation],
    ['Seller', offer.terms.sellerName],
    ['Seller address', offer.terms.sellerAddress],
    ['Seller phone', offer.terms.sellerPhone],
  ];
  details.replaceChildren();
  for (const [label, value] of rows) {
    const dt = document.createElement('dt');
    const dd = document.createElement('dd');
    dt.textContent = label;
    dd.textContent = value;
    details.append(dt, dd);
  }
  details.hidden = false;
  consentLabel.hidden = false;
  state.textContent = 'Review the terms below before continuing.';
}

async function loadOffer() {
  if (!['tower', 'kit'].includes(sku)) {
    state.textContent = 'Choose a valid product before reviewing the order.';
    return;
  }
  try {
    const response = await fetch('/api/preorders/offer', { cache: 'no-store' });
    const offer = await response.json();
    if (!response.ok || !offer.ready || !offer.products?.[sku]?.totalJpy || !offer.terms?.version) {
      state.textContent = 'Pre-orders are not open yet. No payment can be started.';
      return;
    }
    currentOffer = offer;
    showDetails(offer);
  } catch {
    state.textContent = 'The current offer could not be loaded. No payment can be started.';
  }
}

consent.addEventListener('change', () => {
  checkoutButton.disabled = !consent.checked || !currentOffer;
});

checkoutButton.addEventListener('click', async () => {
  if (!currentOffer || !consent.checked) return;
  checkoutButton.disabled = true;
  state.textContent = 'Preparing secure payment…';
  try {
    const response = await fetch('/api/preorders/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sku, termsAccepted: true, termsVersion: currentOffer.terms.version }),
    });
    const result = await response.json();
    if (!response.ok || !result.url) throw new Error(result.error || 'Secure payment could not be opened.');
    window.location.assign(result.url);
  } catch (error) {
    state.textContent = error.message;
    checkoutButton.disabled = false;
  }
});

loadOffer();
