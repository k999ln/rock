const status = document.querySelector('#order-status');
const sessionId = new URLSearchParams(location.search).get('session_id');
if (!sessionId) {
  status.textContent = '決済情報が見つかりません。';
} else {
  fetch(`/api/preorders/status?session_id=${encodeURIComponent(sessionId)}`, { cache: 'no-store' })
    .then(response => response.ok ? response.json() : Promise.reject(new Error('status unavailable')))
    .then(result => {
      status.textContent = result.status === 'paid' ? '決済を確認しました。予約を受け付けています。'
        : result.status === 'refunded' ? '返金済みです。'
          : result.status === 'disputed' ? '決済内容を確認中です。'
            : '決済事業者からの通知を待っています。';
    })
    .catch(() => { status.textContent = '現在、決済結果を確認できません。決済事業者からの案内をご確認ください。'; });
}
