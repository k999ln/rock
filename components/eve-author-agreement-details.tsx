'use client';
import { parseAuthorRemunerationTerms } from '@/lib/sky-author-remuneration-terms';
import { formatCurrencyMinor } from '@/lib/currency-format';
import type { WorkJob } from '@/lib/workflow';
import { useEffect, useRef, useState } from 'react';
type Document = { version:string; termsText:string; termsSha256:string; publisherId:string; platformId:string; revoked:boolean; bound?:boolean };
export default function EveAuthorAgreementDetails({jobId,onJobChange,canCalculate=true}:{jobId:string;canCalculate?:boolean;onJobChange?:(job:WorkJob)=>void}) {
 const [documents,setDocuments]=useState<Array<{id:string;sourceId:string;state:string;document:Document;allocation?:{currency:string;allocation:{grossMinor:number;commissionMinor:number;payableMinor:number};otherUsageMinor:number}}>>([]);
 const [loaded,setLoaded]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const active=useRef<AbortController|null>(null);
 const [revision,setRevision]=useState<number|null>(null);
 useEffect(()=>()=>{active.current?.abort();active.current=null;},[]);
 async function load() {
  active.current?.abort();const controller=new AbortController();active.current=controller;setBusy(true);setError('');
  try {
   const response=await fetch(`/api/eve/agent-work?id=${encodeURIComponent(jobId)}&terms=1`,{cache:'no-store',signal:controller.signal});
   const body=await response.json() as {error?:string;job?:WorkJob;children?:Array<{id:string;authorAgreementStatus:string;authorAllocation?:{currency:string;allocation:{grossMinor:number;commissionMinor:number;payableMinor:number};otherUsageMinor:number};agreementDocument:Document|null;agreementDocuments?:Array<Document & {id:string}>}>};
   if(!response.ok)throw new Error(body.error??'契約本文を取得できませんでした。');
   if(active.current!==controller)return;
   if(body.job){setRevision(body.job.revision);onJobChange?.(body.job);}
   setDocuments((body.children??[]).flatMap(c=>c.agreementDocuments?.map(d=>({id:`${c.id}:${d.id}:${d.version}`,sourceId:c.id,state:d.bound?c.authorAgreementStatus:'document_registered',document:d,allocation:d.bound?c.authorAllocation:undefined})) ?? (c.agreementDocument?[{id:c.id,sourceId:c.id,state:c.authorAgreementStatus,document:c.agreementDocument}]:[])));setLoaded(true);
  } catch(e) {if(active.current===controller && !controller.signal.aborted)setError(e instanceof Error?e.message:'同じ仕事を再読込してください。');}
  finally {if(active.current===controller)setBusy(false);}
 }
 async function calculate(sourceId:string) {
  if(revision===null || !canCalculate)return;
  active.current?.abort();const controller=new AbortController();active.current=controller;setBusy(true);setError('');
  try {const response=await fetch('/api/eve/agent-work',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({jobId,sourceDelegationId:sourceId,revision,action:'prepare-author-allocation'}),signal:controller.signal});const body=await response.json() as {job?:WorkJob;error?:string};if(!response.ok)throw new Error(body.error??'配分条件を照合できませんでした。');if(active.current!==controller)return;if(body.job)onJobChange?.(body.job);await load();}
  catch(e){if(active.current===controller && !controller.signal.aborted)setError(e instanceof Error?e.message:'同じ仕事を再読込してください。');}
  finally{if(active.current===controller)setBusy(false);}
 }
 return <section aria-label="作者利用契約の本文"><button type="button" disabled={busy} onClick={()=>void load()}>{busy?'契約本文を読込中…':'作者利用契約を確認'}</button>
  {error&&<p role="alert">{error}</p>}
  {loaded&&documents.length===0&&<p>この仕事には、本文を照合できる作者利用契約がありません。</p>}
  {documents.map(({id,sourceId,state,document:d,allocation})=>{
   let terms:ReturnType<typeof parseAuthorRemunerationTerms>=null;
   try {terms=parseAuthorRemunerationTerms(d.termsText);} catch { /* Invalid terms remain readable, never calculable. */ }
   return <article key={id}>
    <p>{d.revoked?'契約は失効しています':state==='agreement_bound_pending_collection'?'作者利用契約を照合済み':state==='document_registered'?'作者利用契約は利用元への結合待ち':'契約の有効性を確認中'}</p>
    {allocation&&<p>作者受取候補 {formatCurrencyMinor(allocation.allocation.payableMinor,allocation.currency)} · 請求・入金未照合</p>}
    <details><summary>契約本文と配分条件を確認</summary>
     <h4>作者利用契約 · 版 {d.version}</h4>
     <p>登録作者: {d.publisherId} · 運営: {d.platformId}</p>
     <pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{terms?.body??d.termsText}</pre>
     {terms&&<p>作者料の対象項目: {terms.authorCharge.meter}（{terms.authorCharge.unit}） · 販売手数料: 作者料の10%</p>}
     {terms?.schema==='sky.author-remuneration-terms/2'&&<p>請求経路: {terms.collection.mode==='external_provider'?'Providerへ直接支払い・Rockstarからは請求しない':terms.collection.chargeScope==='author_fee'?'Rockstarから作者料のみを請求する候補':'Rockstarから利用総額を請求する候補'}。{terms.collection.usageFunding==='byok'?'BYOKの実費は別契約です。':''}利用者の請求同意・Provider請求との照合は別途必要です。</p>}
     {state==='agreement_bound_pending_collection' && !allocation && (terms?<button type="button" disabled={busy || !canCalculate} onClick={()=>void calculate(sourceId)}>作者料の配分を試算</button>:<p>配分の計算条件は準備中です。</p>)}
     {allocation&&<p>配分計算（請求・入金未照合）: 作者料 {formatCurrencyMinor(allocation.allocation.grossMinor,allocation.currency)} · 手数料 {formatCurrencyMinor(allocation.allocation.commissionMinor,allocation.currency)} · 作者受取候補 {formatCurrencyMinor(allocation.allocation.payableMinor,allocation.currency)} · その他の利用料 {formatCurrencyMinor(allocation.otherUsageMinor,allocation.currency)}</p>}
     <details><summary>本文の保存記録</summary><p style={{overflowWrap:'anywhere'}}>SHA256 {d.termsSha256}</p><p style={{overflowWrap:'anywhere'}}>利用元 {id}</p></details>
    </details>
   </article>;
  })}
 </section>;
}
