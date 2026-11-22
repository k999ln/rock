const form = document.querySelector('#allocation');
const message = document.querySelector('#message');
const list = document.querySelector('#assignments');
let requestId = crypto.randomUUID();
async function refresh() {
  const response = await fetch('/api/distributions', { cache: 'no-store' });
  if (!response.ok) throw new Error('配給記録を読み込めませんでした。');
  const rows = await response.json();
  list.replaceChildren(
    ...rows.map((row) => {
      const li = document.createElement('li');
      li.textContent = [
        row.recipient,
        row.item,
        row.quantity,
        row.pickup,
        row.received_at == null ? '受取待ち' : '受取済み',
      ].join(' ／ ');
      return li;
    }),
  );
  if (!rows.length) list.textContent = 'まだ指定された配給はありません。';
}
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = form.querySelector('button');
  button.disabled = true;
  try {
    const input = Object.fromEntries(new FormData(form));
    const response = await fetch('/api/distributions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...input, id: requestId }),
    });
    if (!response.ok)
      throw new Error(
        (await response.json()).error || '指定を保存できませんでした。',
      );
    requestId = crypto.randomUUID();
    form.reset();
    message.textContent = '配給を指定しました。';
    await refresh();
  } catch (error) {
    message.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});
document.querySelector('#refresh').addEventListener('click', () =>
  refresh().catch((error) => {
    message.textContent = error.message;
  }),
);
refresh().catch((error) => {
  message.textContent = error.message;
});
