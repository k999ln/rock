'use client';
import Link from 'next/link';
import {useCallback,useEffect,useRef,useState} from 'react';
import {BriefcaseBusiness} from 'lucide-react';
import styles from './noah-cloud-agent.module.css';
type Job={id:string;title:string;state:string;text?:string;error?:string;chargeMinor?:number;status?:string};
type State={active:boolean;stopped:boolean;generation:number;error?:string;operation?:{id:string;state:string;stage:number}|null;jobs:Job[]};
type Run={id:string;brief:string;consent:string;generation:number};
class ApiError extends Error { constructor(message:string,public status:number){super(message);} }
const labels:Record<string,string>={prepared:'開始待ち',sending:'生成中',waiting:'無料枠の回復待ち',completed:'保存済み・要確認',unconfirmed:'応答未確認・再送なし'};
async function api<T>(action:string,body?:unknown):Promise<T>{const response=await fetch(`/api/noah/revenue-pack/${action}`,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'});const data:unknown=await response.json();if(!response.ok)throw new ApiError(data&&typeof data==='object'&&'error' in data&&typeof data.error==='string'?data.error:'接続できません。',response.status);return data as T;}
/** Only already paired browsers see the private entry in the common Noah menu. */
export function NoahRevenuePackMenuItem({onClick}:{onClick?:()=>void}){const [connected,setConnected]=useState(false);useEffect(()=>{let live=true;const check=(event?:Event)=>{let known=!!event;try{known ||= localStorage.getItem('noah-revenue-connected')==='1';}catch{}if(!known)return;void api<State>('status').then(()=>{if(live)setConnected(true);}).catch(()=>{if(live)setConnected(false);});};check();window.addEventListener('noah-revenue-connected',check);return()=>{live=false;window.removeEventListener('noah-revenue-connected',check);};},[]);return connected?<Link href="/noah/revenue-pack" onClick={onClick}><BriefcaseBusiness size={19}/><span>収益業務パック</span></Link>:null;}
export default function NoahRevenuePack(){
  const [state,setState]=useState<State|null>(null),[brief,setBrief]=useState(''),[consent,setConsent]=useState(false),[message,setMessage]=useState('接続を確認しています。'),[busy,setBusy]=useState(false),[pending,setPending]=useState<Run|null>(null);
  const initialization=useRef<Promise<void>|null>(null),submitting=useRef(false);
  const refresh=useCallback(async()=>{try{const value=await api<State>('status');setState(value);setPending(old=>old&&(old.generation!==value.generation||old.id===value.operation?.id)?null:old);return value;}catch(e){setMessage(e instanceof Error?e.message:'接続を確認できません。');setState(null);return null;}},[]);
  useEffect(()=>{
    if(!initialization.current){const token=new URLSearchParams(window.location.hash.slice(1)).get('pair');if(token)history.replaceState(null,'',window.location.pathname);initialization.current=(async()=>{try{if(token){await api('pair',{token});try{localStorage.setItem('noah-revenue-connected','1');}catch{}window.dispatchEvent(new Event('noah-revenue-connected'));}const value=await refresh();if(value)setMessage('本人用クラウドに接続済みです。');}catch(e){setMessage(e instanceof Error?e.message:'接続できません。');}})();}
    const timer=setInterval(()=>{if(!document.hidden)void refresh();},15000);return()=>clearInterval(timer);
  },[refresh]);
  const locked=busy||state?.active||!!pending;
  async function submit(event:{preventDefault:()=>void}){event.preventDefault();if(!state||!consent||submitting.current||state.active)return;submitting.current=true;setBusy(true);const input=pending??{id:crypto.randomUUID(),brief,consent:'anonymous-free-direct-v1',generation:state.generation};setPending(input);try{await api('run',input);setPending(null);setMessage('受け付けました。画面やMacを閉じても処理を続けます。');}catch(e){const rejected=e instanceof ApiError&&e.status>=400&&e.status<500;if(rejected)setPending(null);setMessage((e instanceof Error?e.message:'応答を確認できません。')+(rejected?'':' 同じ依頼IDを保持しています。'));}finally{submitting.current=false;setBusy(false);await refresh();}}
  return <div style={{maxWidth:780,margin:'0 auto',padding:'16px 16px 32px'}}>
    <Link href="/noah">Agentストア</Link><h1>収益業務パック</h1><p>商品設計・納品サンプル・提案書を、3担当で順番に作ります。</p>
    <section className={styles.panel} aria-label="収益業務の依頼">
      <div className={styles.heading}><h2>仕事を依頼する</h2><span>本人用・無料</span></div>
      <p className={styles.note}>Macを閉じてもクラウドで実行・保存します。携帯とPCで同じ画面を使えます。</p>
      <output aria-live="polite">{message}</output>
      {!state?<p>初回は本人用の接続リンクをこのブラウザで開いてください。パスワードやカード情報の入力は不要です。</p>:<>
        <form onSubmit={submit}><label htmlFor="revenue-brief">作りたいもの</label><textarea id="revenue-brief" value={brief} onChange={e=>setBrief(e.target.value)} maxLength={3000} rows={6} disabled={!!locked} required placeholder="対象のお客様、作りたい原稿、確認済みの商品情報など"/>
          <button type="button" disabled={!!locked} onClick={()=>{void api<{brief:string}>('example').then(d=>setBrief(d.brief)).catch(e=>setMessage(e.message));}}>架空店舗のサンプルを入れる</button>
          <label style={{display:'flex',alignItems:'flex-start',gap:10,fontWeight:400}}><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)} disabled={!!locked} required style={{width:20,height:20,flexShrink:0}}/>依頼と前段の下書きを匿名無料クラウドへ送り、本人用クラウドに保存します。秘密や顧客の個人情報は含めません。</label>
          <button className={styles.primary} disabled={busy||state.active||!consent} type="submit">{pending?'同じ依頼の受付を確認':'3担当を実行する'}</button>
        </form>
        <div className={styles.files} style={{marginTop:16}}><button disabled={busy||!state.active} onClick={()=>{void api('stop',{}).then(async()=>{setMessage('次の処理を停止しました。送信済みの処理は取り消されません。');await refresh();}).catch(e=>setMessage(e.message));}}>次の処理を停止</button><button onClick={()=>{void refresh();}}>状態を更新</button></div>
        {state.error&&<p className={styles.error}>{state.error}</p>}
        <div className={styles.history}><h2>進捗と成果</h2>{state.active&&<p>3担当のうち {state.operation?.stage??0} 担当の応答を保存済みです。</p>}{state.stopped&&<p>停止済みです。新しい依頼はこの画面から開始できます。</p>}
          {!state.jobs.length?<p>ここに進捗と成果が表示されます。</p>:state.jobs.map(job=><article key={job.id}><h3>{job.title}</h3><p className={styles.note}>{labels[job.state]||job.state}{job.chargeMinor===0?' · 生成使用額 0':''}</p>{job.text&&<details><summary>成果を見る</summary><pre>{job.text}</pre></details>}{job.error&&<p>{job.error}</p>}</article>)}
        </div>
      </>}
      <p><a href="https://avokado-noah-revenue-runtime.mr-kirin999.workers.dev/license" target="_blank" rel="noopener noreferrer">Agentの出典・ライセンス</a></p>
      <p className={styles.note}>1日4回・12担当まで。無料枠不足時は待機・停止し、有料には切り替えません。成果は下書きです。公開・送信・受注は行いません。</p>
    </section>
  </div>;
}
