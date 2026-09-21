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
    state.textContent = '予約販売受付中';
    terms.replaceChildren();
    const details = [
      ['販売者', offer.terms.sellerName],
      ['所在地', offer.terms.sellerAddress],
      ['連絡先', offer.terms.sellerPhone],
      ['送料', offer.terms.shippingFee],
      ['発送予定', offer.terms.shippingDate],
      ['キャンセル・返金', offer.terms.cancellation],
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
      button.firstChild.textContent = '決済画面へ進む ';
      button.closest('.preorder-card').querySelector('.preorder-price').innerHTML = `<strong>${yen(product.totalJpy)}</strong><span>税込・送料を含む支払総額</span>`;
    }
  } catch {
    state.textContent = '予約販売の開始準備中';
  }
}

for (const button of buttons) {
  button.addEventListener('click', async () => {
    if (button.disabled) return;
    button.disabled = true;
    state.textContent = '安全な決済画面を準備しています…';
    try {
      const response = await fetch('/api/preorders/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sku: button.dataset.sku }),
      });
      const result = await response.json();
      if (!response.ok || !result.url) throw new Error(result.error || '決済画面を開けませんでした。');
      window.location.assign(result.url);
    } catch (error) {
      state.textContent = error.message;
      button.disabled = false;
    }
  });
}

loadOffer();
