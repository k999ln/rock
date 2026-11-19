'use client';
import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import Link from 'next/link';
import WorkspaceShell from './workspace-shell';
import { OWNER_SCOPE_HEADER } from '@/lib/owner-intent';
import { startNoahVisiblePolling } from '@/lib/noah-visible-polling';
import type { NoahOutboxCommand, NoahOutboxJob } from '@/lib/noah-outbox';
import type { NoahDeliveryDestination } from '@/lib/noah-delivery';
import styles from './noah-agent-catalog.module.css';
const labels={draft:'送信前の下書き',approved:'承認済み・未送信',sending:'受付結果を確認中',unknown:'結果不明・再送せず照合',accepted:'受信側が受付済み',rejected:'送信されなかったことを確認',cancelled:'送信前に中止'};
const fieldLabels:Record<string,string>={summary:'説明',author:'作者',license:'ライセンス',priceNote:'利用条件'};
export function NoahOutboxCard({job,scope,disabled,onUpdated}:{job:NoahOutboxJob;scope:string;disabled:boolean;onUpdated:(j:NoahOutboxJob)=>void}){
  const o=job.noahOutbox,a=o.attempts.at(-1),[checked,setChecked]=useState(false),[pending,setPending]=useState(false),[error,setError]=useState(''),[retry,setRetry]=useState<NoahOutboxCommand|null>(null);
  const guard=useRef({busy:false,active:true});
  useEffect(()=>{const current=guard.current;current.active=true;return()=>{current.active=false;};},[]);
  async function act(action:NoahOutboxCommand['action']){
    if(disabled||!scope||guard.current.busy||(!retry&&action==='approve'&&!checked))return;
    const command=retry??{action,revision:job.revision,commandId:crypto.randomUUID(),snapshotSha256:o.snapshotSha256,...(action==='approve'?{confirmation:'noah-external-send/1' as const}:{})};
    guard.current.busy=true;setPending(true);setError('');setRetry(command);
    try{
      const r=await fetch(`/api/noah/outbox/${job.id}`,{method:'POST',headers:{'Content-Type':'application/json',[OWNER_SCOPE_HEADER]:scope},body:JSON.stringify(command),signal:AbortSignal.timeout(20000)});
      const d=await r.json() as {job?:NoahOutboxJob;ownerScope?:string;error?:string};if(!guard.current.active)return;
      if(!r.ok){if(r.status<500)setRetry(null);throw Error(d.error||'送信記録を確認できません。');}
      if(d.ownerScope!==scope||d.job?.id!==job.id||d.job.noahOutbox.snapshotSha256!==o.snapshotSha256)throw Error('保存先が変わりました。再送せず画面を読み直してください。');
      setRetry(null);setChecked(false);onUpdated(d.job);
    }catch(e){if(guard.current.active)setError(e instanceof Error?e.message:'受付結果を確認できません。');}
    finally{guard.current.busy=false;if(guard.current.active)setPending(false);}
  }
  return <article className={styles.notice} aria-label={`送信記録 ${o.payload.agent.name}`}>
    <h2>{o.payload.agent.name} · {labels[o.state]}</h2>
    <p>{o.destination.label} → <strong>{o.payload.recipient}</strong></p><p style={{overflowWrap:'anywhere'}}>送信先：{o.destination.endpoint}</p>
    {o.destination.test&&<p>このMacの試験用受信箱です。外部サービスには送りません。</p>}
    <dl><dt>Agentの版</dt><dd>{o.payload.agent.version}</dd>{Object.entries(o.payload.agent).filter(([k])=>k!=='name'&&k!=='version').map(([k,v])=><div key={k}><dt>{fieldLabels[k]}</dt><dd style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{v}</dd></div>)}</dl>
    <p>送る本文</p><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{o.payload.body||'（本文なし）'}</pre>
    <p>コード・原本・招待リンクのtoken・仕事の内容は自動添付しません。</p>
    {o.source.invite&&<p>招待の期限：{new Date(o.source.invite.expiresAt).toLocaleString('ja-JP')}。撤回・権限変更後の送信は拒否します。</p>}
    {o.approval&&<p>承認期限：{new Date(o.approval.expiresAt).toLocaleString('ja-JP')}</p>}
    {retry?<button type="button" disabled={pending||disabled} onClick={()=>void act(retry.action)}>同じ操作の結果を確認</button>:<>
      {['draft','rejected','approved'].includes(o.state)&&o.attempts.length<3&&<><label><input type="checkbox" checked={checked} disabled={pending||disabled} onChange={e=>setChecked(e.target.checked)}/>この宛先・送信先・版・内容を確認しました。</label><button type="button" disabled={!checked||pending||disabled} onClick={()=>void act('approve')}>{o.state==='approved'?'内容を確認して再承認':'この内容の送信を承認'}</button></>}
      {o.state==='approved'&&<button type="button" disabled={pending||disabled} onClick={()=>void act('send')}>{o.destination.test?'試験用受信箱に送る':'承認した内容を送信'}</button>}
      {['sending','unknown'].includes(o.state)&&<button type="button" disabled={pending||disabled} onClick={()=>void act('reconcile')}>再送せず受付結果を照合</button>}
      {['draft','approved','rejected'].includes(o.state)&&<button type="button" disabled={pending||disabled} onClick={()=>void act('cancel')}>送信前に中止</button>}
    </>}
    {o.state==='accepted'&&<p>受信側から受付記録を取得しました。相手の読了・業務完了や、送信済み情報の遠隔消去は保証しません。</p>}
    {(error||o.error)&&<p role="alert">{error||o.error}</p>}
    {a&&<details><summary>受付IDと履歴</summary>{o.attempts.map(attempt=><p key={attempt.id} style={{overflowWrap:'anywhere'}}>{attempt.id} · {attempt.receipt?.status||attempt.outcome||'確認中'}{attempt.receipt?` · 受付 ${new Date(attempt.receipt.receivedAt).toLocaleString('ja-JP')}`:''}</p>)}</details>}
    <p>送信記録：{job.id} · <Link href={`/noah/agents/${o.source.agentId}`}>元のAgent</Link></p>
  </article>;
}
type Listing={observedAt:number;jobs:NoahOutboxJob[];next:string|null;ownerScope:string;targets:NoahDeliveryDestination[];targetError?:string;agents:{id:string;name:string;version:string}[];invites:{id:string;agentId:string;recipient:string|null;expiresAt:number;revokedAt:number|null}[];error?:string};
export default function NoahOutboxPage(){
  const [listing,setListing]=useState<Listing|null>(null),[jobs,setJobs]=useState<NoahOutboxJob[]>([]),[error,setError]=useState(''),[pending,setPending]=useState(false),[scope,setScope]=useState(''),[tick,setTick]=useState(0);
  const [agent,setAgent]=useState(''),[invite,setInvite]=useState(''),[target,setTarget]=useState(''),[recipient,setRecipient]=useState(''),[body,setBody]=useState(''),[fields,setFields]=useState(['summary']);
  const guard=useRef({owner:'',busy:false,generation:0,mutationEpoch:0,active:true}),creation=useRef<{signature:string;id:string}|null>(null);
  useEffect(()=>{const current=guard.current;current.active=true;return()=>{current.active=false;current.mutationEpoch++;};},[]);
  function clearAccount(){setListing(null);setAgent('');setInvite('');setTarget('');setRecipient('');setBody('');creation.current=null;}
  function update(job:NoahOutboxJob){setJobs(old=>[job,...old.filter(j=>j.id!==job.id)].map(j=>j.id===job.id&&old.some(x=>x.id===j.id&&x.revision>j.revision)?old.find(x=>x.id===j.id)!:j));setTick(n=>n+1);}
  useEffect(()=>{
    const current=guard.current;current.generation++;const generation=current.generation;
    const stop=startNoahVisiblePolling(async signal=>{
      try{
        const r=await fetch('/api/noah/outbox',{cache:'no-store',signal}),d=await r.json() as Listing;
        if(signal.aborted||current.generation!==generation)return;
        if(!r.ok||!d.ownerScope){if([401,403,409].includes(r.status))clearAccount();throw Error(d.error||'送信履歴を確認できません。');}if(current.owner&&current.owner!==d.ownerScope){clearAccount();throw Error('アカウントが変わりました。画面を読み直してください。');}
        if(signal.aborted||current.generation!==generation)return;
        const first=!current.owner;current.owner=d.ownerScope;setScope(d.ownerScope);setListing(old=>old?{...d,next:old.next}:d);setError('');setJobs(old=>[...d.jobs.map(j=>old.find(x=>x.id===j.id&&x.revision>j.revision)??j),...old.filter(j=>!d.jobs.some(x=>x.id===j.id))]);
        if(first){const selected=new URLSearchParams(window.location.search).get('agent');setAgent(d.agents.find(a=>a.id===selected)?.id??d.agents[0]?.id??'');setTarget(d.targets[0]?.id??'');}
        return d.jobs.some(j=>j.noahOutbox.state==='sending')?3000:60000;
      }catch(e){if(!signal.aborted&&current.generation===generation){current.mutationEpoch++;setError(e instanceof Error?e.message:'送信履歴を確認できません。');setScope('');setJobs([]);}}
    },5000);
    return()=>{stop();current.generation++;};
  },[tick]);
  async function create(event:SyntheticEvent){
    event.preventDefault();if(!scope||guard.current.busy)return;guard.current.busy=true;setPending(true);setError('');const epoch=guard.current.mutationEpoch;
    const input={agentId:agent,inviteId:invite||null,targetId:target,recipient,fields,body},signature=JSON.stringify(input);if(creation.current?.signature!==signature)creation.current={signature,id:crypto.randomUUID()};
    try{const r=await fetch('/api/noah/outbox',{method:'POST',headers:{'Content-Type':'application/json',[OWNER_SCOPE_HEADER]:scope},body:JSON.stringify({id:creation.current.id,...input}),signal:AbortSignal.timeout(20000)}),d=await r.json() as {job?:NoahOutboxJob;ownerScope?:string;error?:string};
      if(!guard.current.active||epoch!==guard.current.mutationEpoch)return;if(!r.ok||d.ownerScope!==scope||!d.job)throw Error(d.error||'下書きを保存できません。');update(d.job);
    }catch(e){if(guard.current.active&&epoch===guard.current.mutationEpoch)setError(e instanceof Error?e.message:'下書きを保存できません。');}finally{guard.current.busy=false;if(guard.current.active)setPending(false);}
  }
  async function more(){
    if(!listing?.next||!scope||guard.current.busy)return;guard.current.busy=true;setPending(true);const epoch=guard.current.mutationEpoch;
    try{const r=await fetch(`/api/noah/outbox?after=${encodeURIComponent(listing.next)}`,{cache:'no-store',signal:AbortSignal.timeout(20000)}),d=await r.json() as Listing;if(!guard.current.active||epoch!==guard.current.mutationEpoch)return;if(!r.ok||d.ownerScope!==scope)throw Error(d.error||'続きを確認できません。');setJobs(old=>[...old,...d.jobs.filter(j=>!old.some(x=>x.id===j.id))]);setListing(old=>old?{...old,next:d.next}:d);
    }catch(e){if(guard.current.active&&epoch===guard.current.mutationEpoch)setError((e as Error).message);}finally{guard.current.busy=false;if(guard.current.active)setPending(false);}
  }
  return <WorkspaceShell title="Noah" tone="sky"><main className={styles.page}>
    <nav className={styles.nav}><Link href="/noah/agents">見つける</Link><Link href="/noah/library">自分のAgent</Link><Link href="/noah/work">仕事</Link><Link href="/noah/outbox">送信履歴</Link></nav>
    <header className={styles.hero}><div><h1>Agentの情報を送る</h1><p>下書きを保存し、宛先・内容を確認してから送信します。画面を閉じても受付結果はここで確認できます。</p></div></header>
    {error&&<p role="alert">{error} <button onClick={()=>window.location.reload()}>画面を読み直す</button></p>}
    {listing?.targetError&&<p role="alert">{listing.targetError}</p>}
    {listing&&!listing.targets.length&&<p>対応する送信先が未設定です。任意の外部サービスへ自動送信はしません。</p>}
    <form onSubmit={create}><fieldset disabled={pending||!scope||!listing?.targets.length} className={styles.fields}>
      <label>送るAgent<select required value={agent} onChange={e=>{setAgent(e.target.value);setInvite('');}}>{listing?.agents.map(a=><option key={a.id} value={a.id}>{a.name} · {a.version}</option>)}</select></label>
      <label>限定共有の招待<select value={invite} onChange={e=>{setInvite(e.target.value);const i=listing?.invites.find(v=>v.id===e.target.value);if(i?.recipient)setRecipient(i.recipient);}}><option value="">招待を参照しない</option>{listing?.invites.filter(i=>i.agentId===agent&&!i.revokedAt&&i.expiresAt>listing.observedAt).map(i=><option key={i.id} value={i.id}>{i.recipient||'受取人未指定'} · {new Date(i.expiresAt).toLocaleString('ja-JP')}</option>)}</select></label>
      <label>送信先<select required value={target} onChange={e=>setTarget(e.target.value)}>{listing?.targets.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}</select></label>
      <label>宛先（受信側の識別名）<input required maxLength={200} value={recipient} onChange={e=>setRecipient(e.target.value)}/></label>
      <p>名前・版は必ず含めます。ほかに送る項目を選んでください。</p>{Object.entries(fieldLabels).map(([key,label])=><label key={key}><input type="checkbox" checked={fields.includes(key)} onChange={e=>setFields(old=>e.target.checked?[...old,key]:old.filter(f=>f!==key))}/>{label}</label>)}
      <label>本文<textarea maxLength={4000} rows={4} value={body} onChange={e=>setBody(e.target.value)}/></label>
      <button type="submit">送信せず下書きを保存</button><p>送信先は設定済みの対応先に限ります。実メールなどの個別接続が済んでいない先には送れません。</p>
    </fieldset></form>
    <section aria-label="送信履歴">{jobs.map(j=><NoahOutboxCard key={`${scope}:${j.id}`} job={j} scope={scope} disabled={!scope||pending} onUpdated={update}/>)}{listing?.next&&<button disabled={pending||!scope} onClick={()=>void more()}>送信履歴の続きを表示</button>}</section>
  </main></WorkspaceShell>;
}
