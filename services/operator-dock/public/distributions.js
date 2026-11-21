const root = '/api/distributions';
const message = document.querySelector('#message');
const allocation = document.querySelector('#allocation');
async function api(path, data) {
  const response = await fetch(
    root + path,
    data === undefined
      ? { cache: 'no-store' }
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        },
  );
  const result = await response.json();
  if (!response.ok)
    throw Error(
      result.error ||
        '記録を読み込めませんでした。更新して再試行してください。',
    );
  return result;
}
function element(tag, text) {
  const el = document.createElement(tag);
  el.textContent = text;
  return el;
}
const yen = (v) =>
  v == null ? '未確定' : Number(v).toLocaleString('ja-JP') + '円';
const when = (v) =>
  new Date(v).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
function renderLot(row) {
  const li = document.createElement('li');
  li.append(
    element('strong', row.item + ' ／ ' + row.supplier),
    element(
      'p',
      '入荷 ' +
        row.units +
        row.unit +
        ' ／ 在庫 ' +
        row.available +
        ' ／ 受取待ち ' +
        row.awaiting +
        ' ／ 受取済み ' +
        row.acknowledged,
    ),
    element(
      'p',
      '仕入 ' +
        yen(row.cost_yen) +
        ' ＋ 送料 ' +
        yen(row.freight_yen) +
        ' ／ 運営負担 ' +
        yen(row.total_yen),
    ),
    element('small', '入荷番号 ' + row.id),
  );
  return li;
}
const states = {
  legacy: '従来の指定',
  queued: '通知待ち',
  waiting: 'Agentが通知を準備中',
  ready: '通知完了',
  stopped: '回線・資格による停止',
  attention: '通知の照合が必要',
};
function renderAssignment(row) {
  const li = document.createElement('li');
  li.append(
    element('strong', [row.recipient, row.item, row.quantity].join(' ／ ')),
    element('p', row.pickup),
    element(
      'p',
      (row.received_at == null
        ? '受取待ち'
        : '受取済み ' + when(row.received_at)) +
        ' ／ ' +
        states[row.notice_state],
    ),
    element(
      'p',
      '指定・仕事番号 ' + row.id + (row.lot_id ? ' ／ 入荷 ' + row.lot_id : ''),
    ),
  );
  if (row.notice_state === 'waiting' && row.next_attempt)
    li.append(
      element(
        'small',
        '次の自動照合 ' +
          when(row.next_attempt) +
          ' ／ 照合済み ' +
          row.attempts +
          '回',
      ),
    );
  if (row.result_id)
    li.append(
      element(
        'small',
        '成果 ' + row.result_id + ' ／ 利用者負担 ' + yen(row.usage_yen),
      ),
    );
  const button = element('button', '配送先を確認');
  button.type = 'button';
  const details = element('p', '');
  button.addEventListener('click', async () => {
    if (details.textContent) {
      details.textContent = '';
      button.textContent = '配送先を確認';
      return;
    }
    try {
      const a = await api('/' + encodeURIComponent(row.id) + '/address');
      details.textContent = [
        a.name + ' 様',
        '〒' + a.postal,
        a.prefecture + a.city + a.street,
        a.building,
      ]
        .filter(Boolean)
        .join('　');
      button.textContent = '配送先を閉じる';
    } catch (e) {
      message.textContent = e.message;
    }
  });
  li.append(button, details);
  return li;
}
async function refresh() {
  const [rows, lots, recurring] = await Promise.all([
    api(''),
    api('/lots'),
    api('/plans'),
  ]);
  const list = document.querySelector('#assignments');
  list.replaceChildren(...rows.map(renderAssignment));
  if (!rows.length) list.textContent = 'まだ指定された配給はありません。';
  const stock = document.querySelector('#lots');
  stock.replaceChildren(...lots.map(renderLot));
  if (!lots.length) stock.textContent = '入荷記録はありません。';
  const select = allocation.elements.lot_id,
    previous = select.value;
  select.replaceChildren(
    new Option('入荷を選ぶ', ''),
    ...lots
      .filter((l) => l.available > 0)
      .map(
        (l) =>
          new Option(
            l.item +
              ' ／ 残り ' +
              l.available +
              l.unit +
              ' ／ ' +
              l.supplier +
              ' ／ ' +
              l.id.slice(0, 8),
            l.id,
          ),
      ),
  );
  select.value = previous;
  const template = document.querySelector('#plan').elements.template_lot,
    keep = template.value;
  template.replaceChildren(
    new Option('品目と単位を選ぶ', ''),
    ...lots.map(
      (l) =>
        new Option(l.item + ' ／ ' + l.unit + ' ／ ' + l.id.slice(0, 8), l.id),
    ),
  );
  template.value = keep;
  const plans = document.querySelector('#plans');
  plans.replaceChildren(
    ...recurring.plans.map((p) => {
      const li = element(
        'li',
        p.recipient +
          ' ／ ' +
          p.item +
          ' ' +
          p.units +
          p.unit +
          ' ／ ' +
          (p.enabled ? '次回 ' + when(p.next_at) : '停止中'),
      );
      const b = element(
        'button',
        p.enabled ? 'この計画を停止' : 'この計画を再開',
      );
      b.type = 'button';
      b.onclick = async () => {
        b.disabled = true;
        try {
          await api('/plans/' + p.id, { enabled: !p.enabled });
          await refresh();
        } catch (e) {
          message.textContent = e.message;
        } finally {
          b.disabled = false;
        }
      };
      li.append(b);
      return li;
    }),
  );
  if (!recurring.plans.length) plans.textContent = '登録した計画はありません。';
  const labels = {
    assigned: '指定済み',
    shortage: '在庫不足・再試行予定',
    ineligible: '配送先または回線資格待ち',
    missed: '枠の期限終了',
    waiting: '照合中・再試行予定',
  };
  const windows = document.querySelector('#windows');
  windows.replaceChildren(
    ...recurring.windows.map((w) =>
      element(
        'li',
        [when(w.due), labels[w.status], w.assignment_id || ''].join(' '),
      ),
    ),
  );
  if (!recurring.windows.length)
    windows.textContent = '実行した枠はありません。';
}
function bindForm(form, path, convert, success) {
  const key = 'noah-distribution-request:' + form.id;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = form.querySelector('button[type=submit]');
    button.disabled = true;
    try {
      let id = sessionStorage.getItem(key);
      if (!id) {
        id = crypto.randomUUID();
        sessionStorage.setItem(key, id);
      }
      await api(path, {
        id,
        ...convert(Object.fromEntries(new FormData(form))),
      });
      sessionStorage.removeItem(key);
      form.reset();
      message.textContent = success;
      await refresh();
    } catch (e) {
      message.textContent = e.message;
    } finally {
      button.disabled = false;
    }
  });
}
bindForm(
  document.querySelector('#lot'),
  '/lots',
  (r) => ({
    ...r,
    units: Number(r.units),
    cost_yen: r.cost_yen === '' ? null : Number(r.cost_yen),
    freight_yen: r.freight_yen === '' ? null : Number(r.freight_yen),
  }),
  '入荷を記録しました。',
);
bindForm(
  document.querySelector('#plan'),
  '/plans',
  (r) => ({
    ...r,
    units: Number(r.units),
    first_at: Date.parse(r.first_at + ':00+09:00'),
    interval_days: Number(r.interval_days),
    window_hours: Number(r.window_hours),
  }),
  '定期配給を登録しました。',
);
bindForm(
  allocation,
  '',
  (r) => ({ ...r, units: Number(r.units) }),
  '配給を指定しました。',
);
document.querySelector('#refresh').addEventListener('click', () =>
  refresh().catch((e) => {
    message.textContent = e.message;
  }),
);
refresh().catch((e) => {
  message.textContent = e.message;
});
