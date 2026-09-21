const state = document.querySelector('#preorder-state');
const terms = document.querySelector('#preorder-terms-copy');
const buttons = [...document.querySelectorAll('[data-sku]')];
const yen = amount => new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(amount);

async function loadOffer() {
  try {
    const response = await fetch('/api/preorders/offer', { cache: 'no-store' });
    if (!response.ok) throw new Error('offer unavailable');
    const offer = await response.json();
    if (!offer.ready) return;
    state.textContent = 'Pre-orders are open';
    terms.replaceChildren();
    const details = [
      ['Seller', offer.terms.sellerName],
      ['Address', offer.terms.sellerAddress],
      ['Contact', offer.terms.sellerPhone],
      ['Shipping', offer.terms.shippingFee],
      ['Estimated delivery', offer.terms.shippingDate],
      ['Cancellation and refunds', offer.terms.cancellation],
    ];
    const list = document.createElement('dl');
    for (const [label, value] of details) {
      const dt = document.createElement('dt'); dt.textContent = label;
      const dd = document.createElement('dd'); dd.textContent = value;
      list.append(dt, dd);
    }
    terms.append(list);
    for (const button of buttons) {
      const product = offer.products[button.dataset.sku];
      if (!product?.totalJpy) continue;
      button.disabled = false;
      button.firstChild.textContent = 'Continue to checkout ';
      button.closest('.preorder-card').querySelector('.preorder-price').innerHTML = `<strong>${yen(product.totalJpy)}</strong><span>Total including tax and shipping</span>`;
    }
  } catch {
    state.textContent = 'Preparing to open pre-orders';
  }
}

for (const button of buttons) {
  button.addEventListener('click', async () => {
    if (button.disabled) return;
    button.disabled = true;
    state.textContent = 'Preparing secure checkout…';
    try {
      const response = await fetch('/api/preorders/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sku: button.dataset.sku }),
      });
      const result = await response.json();
      if (!response.ok || !result.url) throw new Error(result.error || 'Checkout could not be opened.');
      window.location.assign(result.url);
    } catch (error) {
      state.textContent = error.message;
      button.disabled = false;
    }
  });
}

loadOffer();
