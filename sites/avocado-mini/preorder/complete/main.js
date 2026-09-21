const status = document.querySelector('#order-status');
const sessionId = new URLSearchParams(location.search).get('session_id');
if (!sessionId) {
  status.textContent = 'Payment information was not found.';
} else {
  fetch(`/api/preorders/status?session_id=${encodeURIComponent(sessionId)}`, { cache: 'no-store' })
    .then(response => response.ok ? response.json() : Promise.reject(new Error('status unavailable')))
    .then(result => {
      status.textContent = result.status === 'paid' ? 'Payment confirmed. Your reservation has been received.'
        : result.status === 'refunded' ? 'This payment has been refunded.'
          : result.status === 'disputed' ? 'The payment is under review.'
            : 'Waiting for confirmation from the payment provider.';
    })
    .catch(() => { status.textContent = 'The payment result is unavailable. Please check the information from your payment provider.'; });
}
