import { newApproval, regions, goods } from './trial.mjs';

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
const field = (label, name, items) =>
  `<label>${label}<select name="${name}">${Object.entries(items)
    .map(([key, value]) => `<option value="${key}">${esc(value)}</option>`)
    .join('')}</select></label>`;
const link = (origin, label) =>
  `<a class="action" href="${origin}${base}">${label}</a>`;
export function layout(title, content, { refresh = false } = {}) {
  return `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · Noah</title>
  ${refresh ? '<meta http-equiv="refresh" content="3">' : ''}
  <style>
  *{box-sizing:border-box}body{margin:0;background:#f2f4f0;color:#16291f;font:16px/1.65 -apple-system,BlinkMacSystemFont,"Hiragino Sans",sans-serif}main{max-width:41rem;margin:auto;padding:1.2rem 1.2rem 4rem}header{display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #bac8be;padding:.6rem 0 1rem}header b{font-size:1.45rem}small{font-size:.85rem;color:#405549}h1{font-size:clamp(1.7rem,5vw,2.35rem);line-height:1.25;margin:2rem 0 1rem}h2{font-size:1.25rem;line-height:1.4;margin:0 0 .6rem}section{background:white;border:1px solid #ced8d0;border-radius:.85rem;margin:1rem 0;padding:1.15rem}p{margin:.4rem 0 1rem}button,.action{display:inline-block;padding:.7rem 1rem;border:1px solid #214d37;background:#214d37;color:white;text-decoration:none;border-radius:.55rem;font:inherit;font-weight:600;cursor:pointer}.secondary{background:white;color:#214d37}.actions{display:flex;align-items:center;gap:.5rem;flex-wrap:wrap}form{margin:.55rem 0}label{display:block;margin:.6rem 0;color:#244b34}input,select{font:inherit;margin:.25rem 0;display:block;border:1px solid #84998a;padding:.55rem;border-radius:.4rem;width:100%;background:white;color:#16291f}dl{display:grid;grid-template-columns:6rem auto;gap:.3rem;margin:.7rem 0}dt{color:#405549}dd{margin:0}summary{cursor:pointer}footer{margin-top:1.5rem}button:focus-visible,a:focus-visible{outline:3px solid #ba6900;outline-offset:3px}
  </style><body><main><header><b>Noah</b><small>開発用・模擬回線</small></header><h1>${esc(title)}</h1>${content}</main></body></html>`;
}
function jobCard(job) {
  const summary = `${regions[job.region]}・${goods[job.item]}`;
  if (job.state === 'scheduled')
    return `<section><h2>${summary}の案内を準備中</h2><p>${date(job.due)} に1回実行します。画面を閉じてもサーバーが続けます。</p>${form('stop', 'この仕事を停止', hidden('id', job.id), true)}</section>`;
  if (job.state === 'stopped')
    return `<section><h2>${summary}</h2><p>停止済み　実行 0回 ／ 0円</p></section>`;
  const result = JSON.parse(job.result);
  const title = {
    matches: '受け取れる候補が見つかりました',
    empty: '今回の台帳に該当する候補はありません',
    unavailable: '台帳を取得できませんでした',
  }[result.outcome];
  return `<section><h2>${title}</h2><p>${summary}　${job.read_at == null ? '未読' : '既読'}</p>${result.entries.map((r) => `<p><strong>${esc(r.place)}</strong><br>${esc(r.pickup)}<br><small>資料番号 ${esc(r.id)}</small></p>`).join('')}
  <dl><dt>出典</dt><dd>${esc(result.source)}</dd><dt>確認日時</dt><dd>${date(job.completed)} JST</dd><dt>使用量</dt><dd>Agent ${job.runs}回 ／ ${job.yen}円</dd></dl>
  ${job.read_at == null ? form('read', '受け取りを記録', hidden('id', job.id), true) : ''}</section>`;
}
export function screen({
  session,
  order,
  dedicated,
  verified,
  installed,
  jobs = [],
  notice,
  origins,
}) {
  if (!session)
    return layout(
      '無料テストへの招待',
      `<p>このMacの模擬端末で、回線の申込からAgentの成果受取まで試せます。</p><section><h2>招待コードで入る</h2>${form('login', '続ける', '<label>テスト用招待コード<input name="invite" type="password" required maxlength="128" autocomplete="off"></label>')}</section>`,
    );
  let display;
  if (!order)
    display = layout(
      '試験回線を申し込む',
      `<section><h2>テスト用eSIM　0円</h2><p>このMac内で使える模擬回線を1本発行します。実機へのeSIM追加と通信事業者への発注は行いません。</p><dl><dt>発行・通信</dt><dd>0円</dd><dt>自動更新</dt><dd>なし</dd><dt>利用期限</dt><dd>${date(session.expires)} JST</dd></dl>${form('enroll', '0円で申し込む')}</section>`,
    );
  else if (order.access === 'revoked')
    display = layout(
      '試験回線は失効しました',
      '<p>この回線のパッケージと成果へのアクセスを終了しました。</p>',
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
      `<section><h2>${notice ? '更新があります' : '模擬回線を追加しました'}</h2><p>専用回線の入口で、パッケージと届いた成果を確認できます。</p>${link(origins.mobile, '模擬専用回線でNoahを開く')}</section>`,
    );
  else {
    const pending = jobs.some((j) => j.state === 'scheduled');
    const formFields =
      field('地域', 'region', regions) +
      field('品目', 'item', goods) +
      hidden('id', newApproval());
    display = layout(
      '食料・日用品の配給案内',
      `<p>希望の地域と品目で試験用台帳を調べ、受取候補をこの画面へ届けます。台帳の施設と配給は架空です。</p>
      ${jobs.map(jobCard).join('')}
      ${pending ? '' : `<section><h2>希望を選ぶ</h2><p>承認から10秒後に1回実行 ／ 上限0円 ／ 発注・発送なし</p>${form('approve', '0円で1回実行を承認', formFields)}</section>`}
      ${link(origins.public, '通常回線のお知らせを見る')}`,
      { refresh: pending },
    );
  }
  const controls = `<footer><details><summary>試験回線の設定</summary><p>期限 ${date(session.expires)} JST</p>${order?.access === 'active' ? form('revoke', 'この試験回線を失効する', '', true) : ''}${form('logout', 'ログアウト', '', true)}</details></footer>`;
  return display.replace('</main>', controls + '</main>');
}
