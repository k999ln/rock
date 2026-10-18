'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import styles from './sky-free-cloud-panel.module.css';
type Job={id:string;createdAt:string;state:string;model:string;retryAt?:number;retryDeadline?:number;attempts:number;text?:string;reportedModel?:string;providerResponseId?:string;inputTokens?:number;outputTokens?:number;chargeMinor?:number;error?:string};
export default function SkyFreeCloudPanel(){
 const [prompt,setPrompt]=useState('');
 const [consent,setConsent]=useState(false),[busy,setBusy]=useState(false),[submitted,setSubmitted]=useState(false);
 const [enabled,setEnabled]=useState(false),[jobs,setJobs]=useState<Job[]>([]),[selected,setSelected]=useState('');
 const [error,setError]=useState(''),[selection,setSelection]=useState(''),[now,setNow]=useState(()=>Date.now());
 const [access,setAccess]=useState<'checking'|'ready'|'signin'|'unavailable'>('checking');
 const [saved,setSaved]=useState(false),[readError,setReadError]=useState('');
 const lock=useRef(false),id=useRef(''),model=useRef('');
 const reading=useRef(false),retryReadAt=useRef(0);
 const refresh=useCallback(async()=>{
  if(reading.current||Date.now()<retryReadAt.current)return;
  reading.current=true;
  try {
  const r=await fetch('/api/llm/free-cloud/jobs',{cache:'no-store'});const data=await r.json() as {jobs?:Job[];enabled?:boolean;error?:string};
  if(r.status===429){retryReadAt.current=Date.now()+60000;throw Error('複数画面からの確認が集中しています。約1分後に自動更新します。依頼の再送は不要です。');}
  if(!r.ok){if(r.status===401){setAccess('signin');setEnabled(false);setJobs([]);setSelected('');}throw Error(data.error||'保存済みの依頼を読めません。');}
  setAccess('ready');setReadError('');
  setError(previous=>previous==='複数画面からの確認が集中しています。約1分後に自動更新します。依頼の再送は不要です。'?'':previous);
  setEnabled(data.enabled===true);setJobs(data.jobs??[]);setSelected(value=>value||(data.jobs?.[0]?.id??''));
  } finally {reading.current=false;}
 },[]);
 useEffect(()=>{
  const read=()=>{void refresh().catch(e=>{setAccess(v=>v==='checking'?'unavailable':v);setReadError(e instanceof Error?e.message:'接続できませんでした。');});};read();
  const poll=setInterval(read,30000),clock=setInterval(()=>setNow(Date.now()),1000);
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
   setSaved(true);await refresh();
  }catch(e){if(!model.current){setSubmitted(false);id.current='';}setError(e instanceof Error?e.message:'保存を確認できません。同じ依頼の確認を押してください。');}finally{lock.current=false;setBusy(false);}
 }
 async function cancel(job:Job){
  try{const r=await fetch('/api/llm/free-cloud/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:job.id,action:'cancel'})});const d=await r.json() as {error?:string};if(!r.ok)throw Error(d.error);await refresh();}catch(e){setError(e instanceof Error?e.message:'停止を確認できません。');}
 }
 const job=jobs.find(j=>j.id===selected);
 const labels:Record<string,string>={queued:'サーバーの開始待ち',waiting:'無料枠の回復待ち',sending:'Cloud実行中',completed:'結果を保存済み',unconfirmed:'確認が必要・自動再送なし',cancelled:'停止済み'};
 const blockedReason=access==='checking'?'接続を確認しています…':access==='signin'?'ログインすると依頼できます。':!enabled?'このアカウントでは無料Cloudを利用できません。接続・契約状態を確認してください。':!prompt.trim()?'依頼したいことを入力してください。':!consent?'送信先と保存について確認し、同意してください。':'';
 return <section className={styles.panel} aria-label="Cloudへの依頼">
  <header><span className={styles.badge}>Sky Cloud · 無料Cloud / Sandbox</span><h1>何を手伝いましょうか？</h1><p>依頼に合う利用可能な無料モデルを自動で選びます。画面を閉じても続き、結果はここに保存されます。</p></header>
  {access==='signin'&&<div className={styles.notice}><strong>続けるにはログインしてください</strong><p>この画面を残してログインできます。戻ったら「接続・結果を更新」を押してください。</p><a href="/signin-with-chatgpt?return_to=%2Fos%2Fsky%2Ffree-cloud" target="_blank" rel="noreferrer">別タブでログイン</a></div>}
  <form onSubmit={event=>{event.preventDefault();void submit();}}>
   <label className={styles.label} htmlFor="sky-cloud-request">依頼したいこと</label>
   <textarea id="sky-cloud-request" className={styles.input} rows={6} maxLength={12000} placeholder="例：新しいサービスの紹介文を考えて。対象は初めて使う人で、200字程度。" value={prompt} disabled={busy||submitted} onChange={e=>setPrompt(e.target.value)} aria-describedby="sky-cloud-help"/>
   <div className={styles.meta}><span>モデル：自動選択</span><span>{prompt.length.toLocaleString()} / 12,000文字</span></div>
   <label className={styles.consent}><input type="checkbox" checked={consent} disabled={busy||submitted} onChange={e=>setConsent(e.target.checked)}/><span>依頼をアカウントに保存し、Pollinationsの匿名無料Cloudへ送信することに同意します。画面を閉じた後も自動続行します。秘密情報は入力しません。</span></label>
   <p id="sky-cloud-help" className={styles.help}>本番課金・有料モデルへの切り替えはありません。契約の利用枠切れ・未払い時は停止します。</p>
   <div className={styles.actions}><button className={styles.primary} type="submit" disabled={busy||!consent||!enabled||!prompt.trim()||saved}>{busy?'依頼を保存しています…':saved?'依頼を保存しました':submitted?'同じ依頼の保存を確認':'Cloudに依頼する'}</button>
    <button type="button" disabled={busy||(submitted&&!saved&&!job)} onClick={()=>{id.current='';model.current='';setSubmitted(false);setSaved(false);setPrompt('');setConsent(false);setError('');setSelection('');setSelected('');}}>新しい依頼を書く</button>
    <button type="button" onClick={()=>{void refresh().catch(e=>setReadError(e instanceof Error?e.message:'接続できませんでした。'));}}>接続・結果を更新</button></div>
   {!submitted&&blockedReason&&<output className={styles.help}>{blockedReason}</output>}
  </form>
  {submitted&&<output>{saved?'依頼を保存しました。開始まで通常約1分かかります。':'保存を確認しています。通信が途切れた場合も同じ依頼として確認します。'}</output>}
  {error&&<p role="alert" className={styles.notice}>{error}</p>}{readError&&access!=='signin'&&<p role="alert" className={styles.notice}>{readError}</p>}
  {selection&&<details><summary>選ばれたモデル</summary><p>{selection}</p></details>}
  <h2>依頼と結果</h2>
  {jobs.length===0&&access==='ready'&&<p>まだ保存された依頼はありません。上の欄から始められます。</p>}
  <ul className={styles.jobs}>{jobs.map(j=><li key={j.id}><button type="button" aria-pressed={selected===j.id} onClick={()=>setSelected(j.id)}><span>{new Date(j.createdAt).toLocaleString('ja-JP')} の依頼</span><strong>{labels[j.state]??j.state}</strong></button></li>)}</ul>
  {job&&<article className={styles.result} aria-label="選択した依頼の結果"><h3>{labels[job.state]??job.state}</h3>
   {job.state==='queued'&&<p>サーバーが順番に開始します。ページを閉じても依頼は残ります。</p>}
   {job.state==='waiting'&&<output>無料枠まであと {Math.max(0,Math.ceil(((job.retryAt??now)-now)/1000))} 秒。その後のサーバー確認で自動続行します。</output>}
   {['queued','waiting'].includes(job.state)&&<button type="button" onClick={()=>{void cancel(job);}}>この依頼を停止する</button>}
   {job.error&&<p>{job.error}</p>}
   {job.text&&<><h3>回答</h3><p className={styles.answer}>{job.text}</p><p>使用額：${((job.chargeMinor??0)/100).toFixed(2)} · モデル：{job.reportedModel}</p></>}
   <details><summary>依頼の詳細</summary><p>依頼ID：{job.id}</p><p>送信試行：{job.attempts} 回（生成前の待機拒否を含む）</p><p>入力 {job.inputTokens??0} / 出力 {job.outputTokens??0} tokens</p>{job.providerResponseId&&<p>応答参照：{job.providerResponseId}</p>}</details>
  </article>}
 </section>;
}
