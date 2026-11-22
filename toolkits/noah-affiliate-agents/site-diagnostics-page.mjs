import { SITE_ADAPTERS, siteTool } from './site-diagnostics.mjs';
const esc = (v) =>
  String(v ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ],
  );
export function diagnosticPage(id, page) {
  const a = SITE_ADAPTERS[id],
    tool = siteTool(id);
  return page(
    a.name,
    `<h1>${esc(a.name)}</h1><p>${esc(a.summary)}</p><section><h2>公開サイトを確認する</h2><p>${esc(tool.description)}</p><form id="diagnose">${Object.entries(
      tool.inputSchema.properties,
    )
      .map(
        ([name, p]) =>
          `<label>${p.type === 'boolean' ? `<input type="checkbox" name="${name}"> ${esc(p.title)}` : `${esc(p.title)} ${p.enum ? `<select name="${name}">${p.enum.map((v) => `<option>${esc(v)}</option>`).join('')}</select>` : `<input type="url" name="${name}" required placeholder="https://example.com/">`}`}</label>`,
      )
      .join(
        '',
      )}<button>診断して準備票を作る</button></form><p id="status" role="status"></p><div id="output" class="result"></div><p><a id="referral" hidden rel="sponsored noopener noreferrer" target="_blank">相談先と条件を確認する（広告を含む記事）</a></p></section><section><h2>診断の範囲</h2><p>公開ページの診断です。内部のバックアップや脆弱性、制作の必要性を断定するものではありません。申込・契約・支払いは、ご自身で条件を確認して行います。</p><p><a href="https://avoado.si/noah">Noahから使って結果を保存する</a></p></section>`,
    `const form=document.querySelector('#diagnose'),status=document.querySelector('#status'),out=document.querySelector('#output'),link=document.querySelector('#referral');form.addEventListener('submit',async e=>{e.preventDefault();const b=form.querySelector('button');b.disabled=true;link.hidden=true;out.textContent='';status.textContent='公開サイトを診断しています…';try{const fd=new FormData(form),v={};for(const [k,p] of Object.entries(${JSON.stringify(tool.inputSchema.properties)}))v[k]=p.type==='boolean'?fd.has(k):fd.get(k);const r=await fetch('/api/diagnose/${id}',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(v)}),d=await r.json();if(!r.ok)throw new Error(d.error||'診断を完了できませんでした。');status.textContent='診断が完了しました';out.textContent=[d.title,'確認日時: '+d.checkedAt,'確認元: '+d.provider,d.sourceUrl,'',...d.findings.map(x=>'・'+x.item+'（'+x.status+'）'),'',...d.preparation.map(x=>'・'+x),'',d.nextAction].join('\\n');if(d.referralUrl){link.href=d.referralUrl;link.hidden=false}}catch(e){status.textContent=e.message}finally{b.disabled=false}});`,
    '/agent/' + id,
  );
}
