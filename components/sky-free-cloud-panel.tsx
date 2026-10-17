'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
type Job={id:string;createdAt:string;state:string;model:string;retryAt?:number;retryDeadline?:number;attempts:number;text?:string;reportedModel?:string;providerResponseId?:string;inputTokens?:number;outputTokens?:number;chargeMinor?:number;error?:string};
export default function SkyFreeCloudPanel(){
 const [prompt,setPrompt]=useState('画面を閉じた後の検証です。41 + 42 の答えを日本語で一文だけ返してください。');
 const [consent,setConsent]=useState(false),[busy,setBusy]=useState(false),[submitted,setSubmitted]=useState(false);
 const [enabled,setEnabled]=useState(false),[jobs,setJobs]=useState<Job[]>([]),[selected,setSelected]=useState('');
 const [error,setError]=useState(''),[selection,setSelection]=useState(''),[now,setNow]=useState(()=>Date.now());
 const lock=useRef(false),id=useRef(''),model=useRef('');
 const refresh=useCallback(async()=>{
  const r=await fetch('/api/llm/free-cloud/jobs',{cache:'no-store'});const data=await r.json() as {jobs?:Job[];enabled?:boolean;error?:string};
  if(!r.ok)throw Error(data.error||'保存済みの依頼を読めません。');
  setEnabled(data.enabled===true);setJobs(data.jobs??[]);setSelected(value=>value||(data.jobs?.[0]?.id??''));
 },[]);
 useEffect(()=>{
  const read=()=>{void refresh().catch(e=>setError(e instanceof Error?e.message:'読込失敗'));};read();
  const poll=setInterval(read,5000),clock=setInterval(()=>setNow(Date.now()),1000);
  return()=>{clearInterval(poll);clearInterval(clock);};
 },[refresh]);
 async function submit(){
  if(lock.current||!consent||!enabled||!prompt.trim())return;
  lock.current=true;setBusy(true);setError('');id.current ||=crypto.randomUUID();setSelected(id.current);setSubmitted(true);
  try{
   if(!model.current){
    const r=await fetch('/api/llm/select',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt,allowCloud:true}),signal:AbortSignal.timeout(12000)});
    const d=await r.json() as {selection?:{provider:string;model:string;reason:string};error?:string};
    if(!r.ok||d.selection?.provider!=='pollinations')throw Error(d.error||'無料Cloudを選べません。');
    model.current=d.selection.model;setSelection(`pollinations / ${d.selection.model} — ${d.selection.reason}`);
   }
   const r=await fetch('/api/llm/free-cloud',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:id.current,prompt,model:model.current,consent:true,autoContinue:true,background:true}),signal:AbortSignal.timeout(20000)});
   const d=await r.json() as {error?:string};if(!r.ok)throw Error(d.error||'保存を確認できません。同じ依頼IDを保持します。');
   await refresh();
  }catch(e){setError(e instanceof Error?e.message:'保存を確認できません。');}finally{lock.current=false;setBusy(false);}
 }
 async function cancel(job:Job){
  try{const r=await fetch('/api/llm/free-cloud/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:job.id,action:'cancel'})});const d=await r.json() as {error?:string};if(!r.ok)throw Error(d.error);await refresh();}catch(e){setError(e instanceof Error?e.message:'停止を確認できません。');}
 }
 const job=jobs.find(j=>j.id===selected);
 const labels:Record<string,string>={queued:'サーバーの開始待ち',waiting:'無料枠の回復待ち',sending:'Cloud実行中',completed:'結果を保存済み',unconfirmed:'確認が必要・自動再送なし',cancelled:'停止済み'};
 return <section aria-label="無料Cloud実行">
  <h1>Sky · 画面を閉じても続く無料Cloud</h1>
  <p>依頼をアカウントに保存し、サーバーが約1分ごとに確認します。画面を閉じても続行し、戻ると結果を確認できます。本番課金・有料切替なし。</p>
  <label>依頼文<textarea rows={4} maxLength={12000} value={prompt} disabled={busy||submitted} onChange={e=>setPrompt(e.target.value)}/></label>
  <label><input type="checkbox" checked={consent} disabled={busy} onChange={e=>setConsent(e.target.checked)}/>依頼文を保存し、画面を閉じた後もPollinationsの匿名無料Cloudへ送信・自動続行することに同意します。秘密情報は入力しません。</label>
  <p>同じ依頼IDで最大5試行・10分。生成前の待機拒否だけ再開し、結果不明では再送しません。</p>
  <button type="button" disabled={busy||!consent||!enabled} onClick={()=>{void submit();}}>{busy?'依頼を保存中…':submitted?'同じ依頼の保存を確認':'自動選択してサーバーへ依頼'}</button>
  <button type="button" disabled={busy} onClick={()=>{id.current='';model.current='';setSubmitted(false);setError('');setSelection('');}}>新しい依頼</button>
  <button type="button" onClick={()=>{void refresh().catch(e=>setError(String(e)));}}>保存済みの結果を確認</button>
  {selection&&<p>選択: {selection}</p>}{error&&<p role="alert">{error}</p>}
  <h2>このアカウントの依頼</h2>
  <ul>{jobs.map(j=><li key={j.id}><button type="button" onClick={()=>setSelected(j.id)}>{j.id} · {labels[j.state]??j.state}</button></li>)}</ul>
  {job&&<article><p>依頼ID: {job.id} · {labels[job.state]??job.state}</p><p>Provider送信試行: {job.attempts} 回（待機拒否を含む）</p>
   {job.state==='waiting'&&<output>無料枠まであと {Math.max(0,Math.ceil(((job.retryAt??now)-now)/1000))} 秒。その後のサーバー確認で自動続行します。</output>}
   {['queued','waiting'].includes(job.state)&&<button type="button" onClick={()=>{void cancel(job);}}>この依頼の自動続行を停止</button>}
   {job.error&&<p>{job.error}</p>}
   {job.text&&<><h2>Cloudの実応答</h2><p>{job.text}</p><output>実モデル: {job.reportedModel} / 入力 {job.inputTokens}・出力 {job.outputTokens} tokens / ${((job.chargeMinor??0)/100).toFixed(2)} / 参照 {job.providerResponseId}</output></>}
  </article>}
 </section>;
}
