export const base = '/noah/esim/trial/';
export const esc = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ],
  );
const date = (ms) =>
  new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(ms);
const hidden = (name, value) =>
  `<input type="hidden" name="${name}" value="${esc(value)}">`;
const form = (action, label, fields = '', secondary = false) =>
  `<form method="post" action="${base}${action}">${fields}<button${secondary ? ' class="secondary"' : ''}>${label}</button></form>`;
const link = (origin, label) =>
  `<a class="action" href="${origin}${base}">${label}</a>`;
export function layout(title, content, context = '開発用・模擬回線') {
  return `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · Noah</title>
  <style>
  *{box-sizing:border-box}body{margin:0;background:#f2f4f0;color:#16291f;font:16px/1.65 -apple-system,BlinkMacSystemFont,"Hiragino Sans",sans-serif}main{max-width:41rem;margin:auto;padding:1.2rem 1.2rem 4rem}header{display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #bac8be;padding:.6rem 0 1rem}header b{font-size:1.45rem}small{font-size:.85rem;color:#405549}h1{font-size:clamp(1.7rem,5vw,2.35rem);line-height:1.25;margin:2rem 0 1rem}h2{font-size:1.25rem;line-height:1.4;margin:0 0 .6rem}section{background:white;border:1px solid #ced8d0;border-radius:.85rem;margin:1rem 0;padding:1.15rem}p{margin:.4rem 0 1rem}button,.action{display:inline-block;padding:.7rem 1rem;border:1px solid #214d37;background:#214d37;color:white;text-decoration:none;border-radius:.55rem;font:inherit;font-weight:600;cursor:pointer}.secondary{background:white;color:#214d37}.actions{display:flex;align-items:center;gap:.5rem;flex-wrap:wrap}form{margin:.55rem 0}label{display:block;margin:.6rem 0;color:#244b34}input,select{font:inherit;margin:.25rem 0;display:block;border:1px solid #84998a;padding:.55rem;border-radius:.4rem;width:100%;background:white;color:#16291f}dl{display:grid;grid-template-columns:6rem auto;gap:.3rem;margin:.7rem 0}dt{color:#405549}dd{margin:0}summary{cursor:pointer}footer{margin-top:1.5rem}button:focus-visible,a:focus-visible{outline:3px solid #ba6900;outline-offset:3px}
  </style><body><main><header><b>Noah</b><small>${esc(context)}</small></header><h1>${esc(title)}</h1>${content}</main></body></html>`;
}
export function screen({
  session,
  order,
  dedicated,
  verified,
  installed,
  freeLine,
  assignments = [],
  registered,
  notice,
  origins,
}) {
  if (!session)
    return layout(
      '無料テストへの招待',
      `<p>このMacの模擬端末で、回線を追加し、自分に届いた配給を確認できます。</p><section><h2>招待コードで入る</h2>${form('login', '続ける', '<label>テスト用招待コード<input name="invite" type="password" required maxlength="128" autocomplete="off"></label>')}</section>`,
    );
  let display;
  if ((!order || order.state === 'requested') && !freeLine)
    display = layout(
      '試験回線は準備待ちです',
      '<p>発行料・通信料と自動更新の条件を確認できると、0円で申し込めます。</p><a href="' +
        base +
        '">提供状況を再確認する</a>',
    );
  else if (!order)
    display = layout(
      '試験回線を申し込む',
      `<section><h2>テスト用eSIM　0円</h2><p>このMac内で使える模擬回線を1本発行します。実機へのeSIM追加と通信事業者への発注は行いません。</p><dl><dt>発行・通信</dt><dd>0円</dd><dt>請求先</dt><dd>なし（利用者・運営とも0円）</dd><dt>自動更新</dt><dd>なし</dd><dt>利用期限</dt><dd>${date(session.expires)} JST</dd></dl>${form('enroll', '0円で申し込む')}</section>`,
    );
  else if (order.access === 'revoked')
    display = layout(
      '試験回線は失効しました',
      '<p>この回線からの配給の閲覧・受取を終了しました。</p>',
    );
  else if (!['issued', 'enabled'].includes(order.state))
    display = layout(
      '発行状況を確認中',
      `<p>元の申込を使って、供給元の記録を確認します。</p>${form('enroll', '申込を照合する')}`,
    );
  else if (order.state === 'issued' || !installed)
    display = layout(
      '模擬端末に回線を追加',
      `<section><h2>テスト回線を用意しました</h2><p>この操作で試験用の端末と回線を結び付けます。スマホ用のQRコードはありません。</p>${form('install', '模擬端末に追加する')}</section>`,
    );
  else if (!dedicated || !verified)
    display = layout(
      '回線とお知らせ',
      `<section><h2>${notice ? '更新があります' : '模擬回線を追加しました'}</h2><p>専用回線を開くと、自分に指定された配給を確認できます。</p>${link(origins.mobile, '模擬専用回線でNoahを開く')}</section>`,
    );
  else {
    display = layout(
      'あなたへの配給',
      distributionContent(registered, assignments, base),
    );
  }
  const agents =
    dedicated && verified
      ? `<p><a class="action" href="${base}agents">クラウドでAgentを使う</a></p>`
      : '';
  const controls = `${agents}<footer><details><summary>試験回線の設定</summary><p>期限 ${date(session.expires)} JST</p>${order?.access === 'active' ? form('revoke', 'この試験回線を失効する', '', true) : ''}${form('logout', 'ログアウト', '', true)}</details></footer>`;
  return display.replace('</main>', controls + '</main>');
}

export function distributionContent(registered, assignments, root) {
  return (
    `<section><h2>配送先</h2><p>${registered ? '登録済みです。変更は次の配給指定から反映されます。' : '配給を受け取るには、先に配送先を登録してください。'}</p><a href="${root}address">${registered ? '配送先を確認・変更' : '配送先を登録'}</a></section>` +
    (assignments.length
      ? assignments
          .map(
            (a) =>
              `<section><h2>${esc(a.item)}</h2><p>${esc(a.quantity)}</p><p>${esc(a.pickup)}</p>${a.received_at == null ? (registered ? `<form method="post" action="${root}receive">${hidden('id', a.id)}<button>受け取りました</button></form>` : '<p>受取には配送先登録が必要です。</p>') : '<p>受取済み</p>'}</section>`,
          )
          .join('')
      : '<p>いま指定されている配給はありません。</p>')
  );
}

export function addressScreen(address, root = base, hosted = false) {
  const fields = [
    ['name', '宛名', 'name', 80],
    ['postal', '郵便番号', 'postal-code', 10],
    ['prefecture', '都道府県', 'address-level1', 16],
    ['city', '市区町村', 'address-level2', 80],
    ['street', '町名・番地', 'address-line1', 140],
    ['building', '建物名・部屋番号（任意）', 'address-line2', 100],
  ]
    .map(
      ([name, label, autocomplete, max]) =>
        `<label>${label}<input name="${name}" autocomplete="shipping ${autocomplete}" maxlength="${max}" value="${esc(address?.[name] ?? '')}"${name === 'building' ? '' : ' required'}></label>`,
    )
    .join('');
  return layout(
    '配給の配送先',
    `<p>配給品を届けるため、運営が配送先を確認します。${hosted ? '' : '試験には架空の宛名と住所を入力してください。'}</p><form method="post" action="${root}address">${fields}<button>配送先を保存</button></form><a href="${hosted ? root.slice(0, -1) : root}">配給に戻る</a>`,
    hosted ? 'eSIMクラウド' : undefined,
  );
}

export function cloudScreen(
  { packages, agent, routes, automaticRoute, preference, jobs },
  id,
  { root = base + 'agents', hosted = false } = {},
) {
  const jobForm = (action, label, fields) =>
    `<form method="post" action="${esc(root)}/${action}">${fields}<button>${label}</button></form>`;
  const agentName = packages.find((pkg) => pkg.id === agent)?.name ?? agent;
  const menu =
    packages.length > 1
      ? '<nav aria-label="パッケージ">' +
        packages
          .map(
            (pkg) =>
              `<a href="${esc(root)}?agent=${encodeURIComponent(pkg.id)}">${esc(pkg.name)}</a>`,
          )
          .join(' · ') +
        '</nav>'
      : '';
  const choices = [
    { id: 'auto', label: '自動（' + (automaticRoute ?? '接続先待ち') + '）' },
    ...routes,
  ];
  const unavailable =
    preference !== 'auto' && !routes.some((r) => r.id === preference);
  const options =
    (unavailable
      ? '<option selected disabled value="">前回の実行先は利用できません。選び直してください。</option>'
      : '') +
    choices
      .map(
        (route) =>
          `<option value="${esc(route.id)}"${route.id === preference ? ' selected' : ''}>${esc(route.label)}</option>`,
      )
      .join('');
  const states = {
    queued: '受付済み',
    waiting: '結果を照会中',
    completed: '完了',
    attention: '確認が必要',
    stopped: '停止',
  };
  const history = jobs
    .map((job) => {
      const label = job.routeLabel ?? job.route;
      const report = job.report ?? {
        done: ['依頼を受け付けました。'],
        incomplete:
          job.state === 'attention' || job.state === 'stopped'
            ? [job.note]
            : [],
        unverified: ['最終成果はまだ確認されていません。'],
      };
      const sections = [
        ['できたこと', report.done],
        ['できなかったこと', report.incomplete],
        ['未確認', report.unverified],
      ]
        .map(
          ([title, items]) =>
            `<dt>${title}</dt><dd>${items.length ? items.map(esc).join('<br>') : '報告された項目なし'}</dd>`,
        )
        .join('');
      const stop = ['queued', 'waiting'].includes(job.state)
        ? jobForm(
            'stop',
            '停止する',
            hidden('id', job.id) + hidden('agent', agent),
          )
        : '';
      return `<li><b>${esc(states[job.state] ?? job.state)}</b> · ${esc(label)}<p><small>仕事番号 ${esc(job.id)}</small></p><p>${esc(job.result ?? job.note ?? '画面を閉じてもサーバーで続けます。')}</p>${job.result && job.note ? '<p>' + esc(job.note) + '</p>' : ''}<dl>${sections}</dl>${stop}</li>`;
    })
    .join('');
  return layout(
    'クラウドでAgentを使う',
    `${menu}<section><h2>${esc(agentName)}</h2>
    <p>${hosted ? 'この試験の実行料は0円です。' : '0円の模擬環境です。各接続先はこのMac上の別のWorkerで動きます。'}受付後は別のアプリに移れます。</p>
    ${
      routes.length
        ? jobForm(
            'start',
            'バックグラウンドで実行',
            hidden('id', id) +
              hidden('agent', agent) +
              '<label>実行先<select required name="route">' +
              options +
              '</select></label><label>文章<input required name="text" maxlength="500"></label>',
          )
        : '<p>利用可能な実行先がありません。</p>'
    }</section>
    <section><h2>仕事と成果</h2>${history ? '<ul>' + history + '</ul>' : '<p>依頼はありません。</p>'}
    <a href="${esc(root)}?agent=${encodeURIComponent(agent)}">状態を更新</a></section><a href="${hosted ? '/noah' : base}">Noahに戻る</a>${hosted ? '<p><a href="/api/noah/cloud-work/distribution">あなたへの配給</a></p>' : ''}`,
    hosted ? 'eSIMクラウド' : '開発用・模擬回線',
  );
}
