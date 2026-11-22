'use client';
import {useState,type SubmitEvent} from 'react';
type Result={steps:string[];nextAction:string;referralUrl:string|null};
export default function NoahCombinationForm({schemeId}:{schemeId:string}){
  const [result,setResult]=useState<Result|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  async function submit(e:SubmitEvent<HTMLFormElement>){
    e.preventDefault();const d=new FormData(e.currentTarget);setBusy(true);setResult(null);setError('');
    try{const r=await fetch('/api/noah/combinations/prepare',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({schemeId,purpose:d.get('purpose'),region:d.get('region'),adult:d.has('adult'),existingAccount:d.get('existingAccount')==='true',riskUnderstood:d.has('riskUnderstood'),campaign:'noah-guide'})});
      const v=await r.json() as Result & {error?:string};if(!r.ok)throw new Error(v.error??'準備票を作れませんでした。');setResult(v);
    }catch(e){setError(e instanceof Error?e.message:'もう一度お試しください。');}finally{setBusy(false);}
  }
  return <section style={{padding:24,border:'1px solid var(--border, #ddd)',borderRadius:16,margin:'24px 0'}}><h2>自分の準備を確認する</h2><form onSubmit={e=>void submit(e)} style={{display:'grid',gap:18}}>
    <label>目的 <select name="purpose"><option value="compare">まず情報を比較したい</option><option value="open">必要な新規サービスを検討している</option></select></label>
    <label>対象サービスの口座 <select name="existingAccount"><option value="true">すでに持っている</option><option value="false">まだ持っていない</option></select></label>
    <label>居住地 <select name="region"><option value="jp">日本</option><option value="other">日本以外</option></select></label>
    <label><input name="adult" type="checkbox"/> 18歳以上です</label><label><input name="riskUnderstood" type="checkbox"/> 費用と損失の可能性を理解し、自分で利用を判断します</label>
    <button disabled={busy} style={{padding:12,borderRadius:10,background:'#614595',color:'#fff',font:'inherit'}}>{busy?'確認しています…':'準備票を作る'}</button>
  </form><div aria-live="polite">{error&&<p role="alert">{error}</p>}{result&&<><ol>{result.steps.map(s=><li key={s}>{s}</li>)}</ol><p>{result.nextAction}</p>{result.referralUrl&&<a href={result.referralUrl} rel="sponsored noopener noreferrer" target="_blank">公式サービスで条件を確認する（広告）</a>}</>}</div></section>;
}
