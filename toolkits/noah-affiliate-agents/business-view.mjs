import { BUSINESS_FIELDS, BUSINESS_REQUIRED } from './business-core.mjs';
const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ],
  );
const head = (
  title,
) => `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · Noah</title><style>
:root{font-family:system-ui,-apple-system,sans-serif;color:#222;background:#fff;color-scheme:light}*{box-sizing:border-box}[hidden]{display:none!important}body{margin:0}header{border-bottom:1px solid #deddd8;padding:18px max(20px,calc((100vw - 1040px)/2));display:flex;justify-content:space-between}a{color:#573e91}main{max-width:1040px;margin:auto;padding:38px 20px 70px}h1{font-size:32px;line-height:1.35;letter-spacing:-.03em;margin:0 0 16px}h2{font-size:21px}p{line-height:1.8;max-width:750px}.eyebrow{font-size:12px;letter-spacing:.08em;color:#655780}.grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}label{display:block;font-size:16px;font-weight:600}input,select,textarea{display:block;width:100%;border:1px solid #cccac4;border-radius:8px;padding:12px;margin-top:7px;background:white;color:inherit;font:inherit}textarea{min-height:120px;resize:vertical}input[type=checkbox]{width:20px;height:20px;margin:0;accent-color:#624697}label.check{display:flex;align-items:center;gap:10px;font-weight:400;margin:16px 0}.wide{grid-column:1/-1}button,.button{border:0;border-radius:8px;background:#614595;color:white;padding:13px 18px;font:inherit;cursor:pointer;text-decoration:none;display:inline-block}button.secondary{background:#e8e4ef;color:#34284b}button:disabled{opacity:.5;cursor:wait}section{margin-top:32px;border-top:1px solid #d9d6cf;padding-top:22px}small,.muted{font-size:13px;color:#67645e}.notice{background:#ece8f3;padding:14px 18px;border-radius:8px}.actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:20px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:16px/1.85 system-ui;background:white;padding:22px;border:1px solid #deddd8;border-radius:8px}details{margin-top:18px}summary{cursor:pointer}#status{min-height:1.5em;line-height:1.6}table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:10px;border-bottom:1px solid #deddd8}code{overflow-wrap:anywhere}@media(max-width:600px){.grid{grid-template-columns:1fr}h1{font-size:27px}main{padding-top:28px}header{padding:15px 20px}pre{padding:16px}}:focus-visible{outline:3px solid #ab8ada;outline-offset:3px}</style><header><a href="https://avoado.si/noah">Noah</a><span>${title}</span></header><main>`;
export function businessPage() {
  const fields = Object.entries(BUSINESS_FIELDS)
    .filter(([k]) => k !== 'campaign')
    .map(([k, f]) => {
      const required = BUSINESS_REQUIRED.includes(k) ? 'required' : '';
      if (f.type === 'boolean')
        return `<label class="check wide"><input name="${k}" type="checkbox">${esc(f.title)}</label>`;
      const control = f.enum
        ? `<select name="${k}" ${required}><option value="">選んでください</option>${f.enum.map((x) => `<option>${esc(x)}</option>`).join('')}</select>`
        : f.type === 'integer'
          ? `<input name="${k}" type="number" min="${f.minimum}" max="${f.maximum}" ${required}>`
          : `<textarea name="${k}" minlength="${f.minLength}" maxlength="${f.maxLength}" ${required} placeholder="例：毎週、表計算の売上を集めて報告書を作っている。転記と確認に時間がかかる。"></textarea>`;
      return `<label class="${k === 'workflow' ? 'wide' : ''}">${esc(f.title)}${control}${f.description ? `<small>${esc(f.description)}</small>` : ''}</label>`;
    })
    .join('');
  return (
    head('法人のsi導入準備') +
    `<p class="eyebrow">業務を整理する / 相談票をつくる</p><h1>siを導入する前に、<br>任せたい仕事を整理しよう。</h1><p>毎月の作業量と困り事から、現状の業務表・研修で聞くこと・相談文の下書きを作ります。会員登録は不要です。申込をせず、整理票だけ受け取ることもできます。</p><p class="notice">無料で相談票を作成できます。入力内容は作成のために処理し、サーバーには保存しません。匿名の利用件数と紹介の識別子だけを記録します。社名・メール・顧客情報・社外秘は入力しないでください。</p><p><a href="/guides">業務別の導入準備を読む</a></p><form id="brief"><div class="grid">${fields}</div><div class="actions"><button type="submit">相談票をつくる</button></div></form><p id="status" role="status" aria-live="polite"></p><section id="result" hidden><h2>あなたの導入準備票</h2><pre id="output"></pre><div class="actions"><button id="copy" class="secondary">コピーする</button><button id="download" class="secondary">テキストで保存</button><a id="referral" class="button" hidden rel="sponsored noopener" target="_blank">条件を確認して相談先へ進む（広告）</a></div></section><section><p class="muted">この相談票は入力内容から規則に沿って作成します。効率化の効果や導入費用を保証するものではありません。紹介リンクを案内する場合は広告と表示します。紹介先の研修契約・料金は別です。</p><a href="https://avoado.si/noah">Noahへ戻る</a></section></main><script>
const form=document.querySelector('#brief'),status=document.querySelector('#status');let output='';
form.addEventListener('submit',async e=>{e.preventDefault();const button=form.querySelector('button');button.disabled=true;status.textContent='相談票を作成しています…';document.querySelector('#result').hidden=true;try{const data={};for(const [k,f] of Object.entries(${JSON.stringify(BUSINESS_FIELDS)})){if(k==='campaign')continue;const el=form.elements.namedItem(k);if(f.type==='boolean')data[k]=el.checked;else if(el.value!=='')data[k]=f.type==='integer'?Number(el.value):el.value;}const campaign=new URL(location.href).searchParams.get('campaign');if(campaign&&/^[a-z0-9][a-z0-9.-]{0,49}$/.test(campaign))data.campaign=campaign;const res=await fetch('/brief',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)});const value=await res.json();if(!res.ok)throw new Error(value.error);output=value.text;document.querySelector('#output').textContent=output;document.querySelector('#result').hidden=false;const link=document.querySelector('#referral');link.hidden=!value.referralAvailable;if(value.referralAvailable)link.href=value.referralUrl;status.textContent='相談票ができました。入力に合っているか確認してください。';document.querySelector('#result').scrollIntoView({behavior:'smooth'});}catch(e){status.textContent=e.message||'処理できませんでした。入力を確認してもう一度お試しください。';}finally{button.disabled=false;}});
document.querySelector('#copy').onclick=async()=>{try{await navigator.clipboard.writeText(output);status.textContent='相談票をコピーしました。';}catch{status.textContent='相談票の文章を選択してコピーしてください。';}};
document.querySelector('#download').onclick=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([output],{type:'text/plain;charset=utf-8'}));a.download='Noah-si導入準備票.txt';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};
</script></html>`
  );
}
export function operationsPage() {
  return (
    head('法人si導入の運営') +
    `<p class="eyebrow">所有者用 / 非公開台帳</p><h1>集客と、承認から入金まで。</h1><p>運営用の鍵はこの画面のメモリ内でだけ使用します。保存しません。利用者向けの会員登録とは別の、運営データを守るための鍵です。</p><section><h2>Agentの継続実行</h2><p>自社Webの記事公開、相談処理、記録済み成果の点検と改善判断を継続します。ASP・銀行の自動取得が未接続の間は、その工程を接続待ちとして表示します。</p><div class="actions"><button id="agentStart">継続実行を開始</button><button id="agentStop" class="secondary">停止</button><button id="agentStatus" class="secondary">工程を確認</button></div><pre id="agentOutput" hidden></pre></section><label>運営用の鍵<input id="key" type="password" autocomplete="off"></label><div class="actions"><button id="report">最新の状況を確認</button><button id="export" class="secondary">台帳を保存</button></div><p id="status" role="status"></p><pre id="reportOutput" hidden></pre>
<section><h2>集客の計画を作る</h2><form id="campaign" class="grid"><label>識別名<input name="id" required pattern="[a-z0-9][a-z0-9.-]{0,49}" placeholder="training-x-01"></label><label>見出し<input name="title" required maxlength="120" placeholder="毎月の業務を整理する"></label><label>経路<select name="channel"><option value="social">SNS</option><option value="email">メール</option><option value="web">自社Web</option></select></label><label>全費用の上限（円）<input name="budgetYen" type="number" min="0" required value="0"></label><div class="wide"><button>計画と下書きを作る</button></div></form><pre id="draft" hidden></pre><p class="muted">ここでは計画と下書きを作ります。広告費の支出、SNSへの投稿、営業メール送信は行いません。掲載条件が揃わない下書きは公開しないでください。</p></section>
<section><h2>成果・支払・入金・費用を取り込む</h2><p>ASPや銀行の生ファイルはアップロードしません。同梱の変換コマンドで必要列だけにしたJSONを選んでください。口座番号、名義、顧客名、メールは不要です。</p><label>取込の種類<select id="kind"><option value="import_conversions">ASPの成果・承認・否認</option><option value="import_payouts">ASPの支払履歴</option><option value="import_deposits">銀行入金の照合</option><option value="import_costs">制作・集客・対応・実行費</option></select></label><label>正規化したJSON<input id="file" type="file" accept=".json,application/json"></label><pre id="preview" hidden></pre><label class="check"><input id="confirmed" type="checkbox">元のASP履歴・銀行明細等と照合し、必要な列と金額だけであることを確認しました</label><button id="import" disabled>確認した内容を台帳へ保存</button></section></main><script>
let revision=null,rows=null,requestId=null;
const status=document.querySelector('#status'),key=document.querySelector('#key');
async function call(body){if(key.value.length<32)throw new Error('運営用の鍵を入力してください。');const r=await fetch('/operations/api',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+key.value},body:JSON.stringify(body)});const x=await r.json();if(!r.ok)throw new Error(x.error||'処理できませんでした。');return x;}
function show(id,value){const e=document.querySelector(id);e.textContent=typeof value==='string'?value:JSON.stringify(value,null,2);e.hidden=false;}
async function refresh(){const r=await call({action:'report'});revision=r.revision;show('#reportOutput',r);return r;}
async function run(fn){try{status.textContent='確認しています…';await fn();status.textContent='処理が終わりました。表示された状態を確認してください。';}catch(e){status.textContent=e.message;}}
document.querySelector('#report').onclick=()=>run(refresh);
for(const [id,action] of [['agentStart','agent_start'],['agentStop','agent_stop'],['agentStatus','agent_status']])document.querySelector('#'+id).onclick=()=>run(async()=>show('#agentOutput',await call({action})));
document.querySelector('#export').onclick=()=>run(async()=>{const data=await call({action:'export'});const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));a.download='noah-business-ledger-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);});
document.querySelector('#campaign').onsubmit=e=>{e.preventDefault();run(async()=>{await refresh();const f=new FormData(e.target);const payload={id:f.get('id'),title:f.get('title'),channel:f.get('channel'),budgetYen:Number(f.get('budgetYen')),landingUrl:location.origin+'/',confirmed:true};await call({action:'command',command:{requestId:crypto.randomUUID(),expectedRevision:revision,action:'campaign',payload}});show('#draft',await call({action:'draft',campaign:payload.id}));await refresh();});};
document.querySelector('#file').onchange=async e=>{rows=null;requestId=null;document.querySelector('#confirmed').checked=false;document.querySelector('#import').disabled=true;try{const f=e.target.files[0];if(!f||f.size>180000)throw new Error('180KB以下のJSONを選んでください。');const v=JSON.parse(await f.text());if(v.action&&Array.from(document.querySelector('#kind').options).some(o=>o.value===v.action))document.querySelector('#kind').value=v.action;rows=Array.isArray(v)?v:v.rows;if(!Array.isArray(rows)||!rows.length||rows.length>100)throw new Error('1〜100行のrowsを指定してください。');show('#preview',rows);requestId=crypto.randomUUID();}catch(e){status.textContent=e.message;}};
document.querySelector('#confirmed').onchange=e=>document.querySelector('#import').disabled=!(rows&&e.target.checked);
document.querySelector('#import').onclick=()=>run(async()=>{if(!rows||!document.querySelector('#confirmed').checked)throw new Error('内容を確認してください。');await refresh();await call({action:'command',command:{requestId,expectedRevision:revision,action:document.querySelector('#kind').value,payload:{rows}}});await refresh();document.querySelector('#import').disabled=true;document.querySelector('#confirmed').checked=false;});
</script></html>`
  );
}

export function businessGuidePage(articles, selected) {
  const body = selected
    ? `<h1>${esc(selected.title)}</h1><pre>${esc(selected.text)}</pre><a class="button" href="/?campaign=${esc(selected.campaign)}">自分の業務の導入準備票をつくる</a><p><a href="/guides">業務別の案内へ戻る</a></p>`
    : `<h1>業務から考える、siの導入準備。</h1><p>今の作業と、人が確認することを整理してから始めましょう。記事はNoahの継続実行器が作成・公開しています。</p>${articles.length ? articles.map((a) => `<section><h2><a href="/guides/${esc(a.id)}">${esc(a.title)}</a></h2><p>更新日 ${esc(a.updatedOn)}</p></section>`).join('') : '<p>最初の案内を準備しています。</p>'}<p><a href="/">導入準備票をつくる</a></p>`;
  return (
    head(selected ? selected.title : '業務別の導入準備') +
    body +
    '</main></html>'
  );
}
