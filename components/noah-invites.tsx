'use client';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { OWNER_SCOPE_HEADER } from '@/lib/owner-intent';
import type { NoahInvite, NoahSharedAgent } from '@/lib/noah-invites';
import NoahManagedInstallation from './noah-managed-installation';
import { startNoahVisiblePolling } from '@/lib/noah-visible-polling';
import WorkspaceShell from './workspace-shell';
import styles from './noah-agent-catalog.module.css';

export function NoahInviteManager({ agentId, scope, hasSource, hasRuntime }: { agentId: string; scope: string; hasSource: boolean; hasRuntime: boolean }) {
  const [invites,setInvites] = useState<NoahInvite[]>([]), [error,setError] = useState(''), [busy,setBusy] = useState(false), [tick,setTick] = useState(0);
  const [days,setDays] = useState('7'), [maxUses,setMaxUses] = useState('1'), [recipient,setRecipient] = useState(''), [source,setSource] = useState(false), [link,setLink] = useState('');
  const [execution,setExecution] = useState(false);
  const [copied,setCopied] = useState(false);
  const [checkedAt,setCheckedAt] = useState(0);
  const request = useRef<{fingerprint:string;body:Record<string,unknown>} | null>(null), lock = useRef(false);
  useEffect(() => {
    const c=new AbortController();
    void fetch(`/api/noah/invites?agentId=${agentId}`,{cache:'no-store',signal:c.signal}).then(async r=>{
      const d=await r.json() as {invites:NoahInvite[];ownerScope:string;error?:string};
      if(!r.ok || d.ownerScope!==scope)throw new Error(d.error || 'アカウントを確認できません。');
      if(!c.signal.aborted){setInvites(d.invites);setCheckedAt(Date.now());}
    }).catch(e=>{if(!c.signal.aborted){setInvites([]);setError(e.message);}});
    return ()=>c.abort();
  },[agentId,scope,tick]);
  useEffect(()=>{const timer=setInterval(()=>setCheckedAt(Date.now()),30000);return()=>clearInterval(timer);},[]);
  async function create() {
    if(lock.current || !scope)return;lock.current=true;setBusy(true);setError('');setLink('');setCopied(false);
    try {
      const fingerprint=JSON.stringify([agentId,days,maxUses,recipient,source,execution,scope]);
      if(request.current?.fingerprint!==fingerprint)request.current={fingerprint,body:{id:crypto.randomUUID(),agentId,token:Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join(''),recipient:recipient.trim()||null,access:source?'source':'view',executionAllowed:source&&execution,expiresAt:Date.now()+Number(days)*86400000,maxUses:Number(maxUses)}};
      const body=request.current.body;
      const r=await fetch('/api/noah/invites',{method:'POST',headers:{'Content-Type':'application/json',[OWNER_SCOPE_HEADER]:scope},body:JSON.stringify(body)});
      const d=await r.json() as {invite:NoahInvite;ownerScope:string;error?:string};
      if(!r.ok || d.ownerScope!==scope)throw new Error(d.error || '招待を発行できません。');
      if(d.invite.revokedAt!==null || d.invite.expiresAt<=Date.now())throw new Error('この発行操作の招待は終了しています。条件を変更して新しく発行してください。');
      setLink(`${window.location.origin}/noah/invites/${d.invite.id}#token=${String(body.token)}`);request.current=null;setTick(n=>n+1);
    }catch(e){setError(e instanceof Error?e.message:'招待を発行できません。');}finally{lock.current=false;setBusy(false);}
  }
  async function revoke(invite:NoahInvite) {
    if(lock.current)return;lock.current=true;setBusy(true);setError('');
    try {
      const r=await fetch(`/api/noah/invites/${invite.id}`,{method:'DELETE',headers:{'Content-Type':'application/json',[OWNER_SCOPE_HEADER]:scope},body:JSON.stringify({revision:invite.revision})});
      const d=await r.json() as {error?:string};if(!r.ok)throw new Error(d.error || '撤回できません。');
      if(link.includes(`/invites/${invite.id}#`))setLink('');setTick(n=>n+1);
    }catch(e){setError(e instanceof Error?e.message:'撤回できません。');}finally{lock.current=false;setBusy(false);}
  }
  return <section className={styles.notice} aria-label="限定共有の招待"><h2>招待して限定共有</h2><p>この版の内容を指定した人数に共有します。受け取りにはNoahのサインインが必要です。公開タイムラインには載りません。</p>
    <fieldset className={styles.fields} disabled={busy || !scope}>
      <div className={styles.columns}><label>有効期間<select value={days} onChange={e=>setDays(e.target.value)}><option value="1">1日</option><option value="7">7日</option><option value="30">30日</option></select></label><label>受け取れる人数<input type="number" min={1} max={100} value={maxUses} onChange={e=>setMaxUses(e.target.value)} /></label></div>
      <label>受取人のアカウントID（任意）<input value={recipient} maxLength={200} onChange={e=>setRecipient(e.target.value)} placeholder="空欄ならリンクを持つ人が先着で受取" /></label>
      {hasSource && <label className={styles.check}><input type="checkbox" checked={source} onChange={e=>{setSource(e.target.checked);if(!e.target.checked)setExecution(false);}} />保存版コードのダウンロードも許可する</label>}
      {hasSource && hasRuntime && source && <label className={styles.check}><input type="checkbox" checked={execution} onChange={e=>setExecution(e.target.checked)} />Noahの専用環境で、この版の実行も許可する</label>}
      <p>撤回・期限切れ後の新しい取得は止まります。既に取得したコードは相手の端末から消せません。実行を許可した場合も、購入権・外部操作の許可は含みません。</p>
      <button type="button" onClick={()=>{void create();}}>招待リンクを発行</button>
    </fieldset>
    {link && <div className={styles.fields}><label>発行した招待リンク（この画面でのみ確認できます）<input readOnly value={link} /></label><button onClick={()=>{void navigator.clipboard.writeText(link).then(()=>setCopied(true)).catch(()=>setError('コピーできません。表示したリンクを選択してコピーしてください。'));}}>{copied?'コピーしました':'リンクをコピー'}</button><p>まだ相手には送信していません。</p></div>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    {!!invites.length && <details><summary>発行済みの招待 · {invites.length}件</summary>{invites.map(i=><div key={i.id}><p>{i.recipient || 'リンクを持つ人'} · {i.usedCount}/{i.maxUses}人 · {i.executionAllowed?'閲覧・コード取得・実行':i.access==='source'?'閲覧とコード取得':'閲覧のみ'} · 期限{new Date(i.expiresAt).toLocaleString('ja-JP')}</p>{i.revokedAt!==null?<p>撤回済み</p>:i.expiresAt<=checkedAt?<p>期限切れ</p>:<button disabled={busy} onClick={()=>{void revoke(i);}}>この招待を撤回</button>}</div>)}</details>}
  </section>;
}

const subscribe=()=>()=>{};
const fragment=()=>window.location.hash;
export function NoahSharedDetail({id}:{id:string}) {
  const hash=useSyncExternalStore(subscribe,fragment,()=>''), token=new URLSearchParams(hash.slice(1)).get('token');
  const [agent,setAgent]=useState<NoahSharedAgent|null>(null),[scope,setScope]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[loaded,setLoaded]=useState(false),[tick,setTick]=useState(0),[signedOut,setSignedOut]=useState(false);
  const lock=useRef(false);
  useEffect(()=>{
    return startNoahVisiblePolling(async signal => {
      const c = { signal };
      try{
        const r=await fetch('/api/noah/invites?received=1',{cache:'no-store',signal:c.signal});
        const d=await r.json() as {ownerScope:string;error?:string};
        if(r.status===401 && !c.signal.aborted)setSignedOut(true);
        if(!r.ok)throw new Error(d.error||'アカウントを確認できません。');
        const received=await fetch(`/api/noah/invites/${id}`,{cache:'no-store',signal:c.signal});
        const a=await received.json() as {agent:NoahSharedAgent;ownerScope:string;error?:string};
        if(c.signal.aborted)return;
        setSignedOut(false);setScope(d.ownerScope);
        if(received.ok && a.ownerScope===d.ownerScope){setAgent(a.agent);setError('');}
        else {setAgent(null);if(received.status!==404 || !token)setError(a.error||'有効な招待を確認できません。');}
      }catch(e){if(!c.signal.aborted){setAgent(null);setScope('');setError(e instanceof Error?e.message:'招待を確認できません。');}}
      finally{if(!c.signal.aborted)setLoaded(true);}
    },15000);
  },[id,token,tick]);
  async function claim(){
    if(!scope || !token || lock.current)return;lock.current=true;setBusy(true);setError('');
    try{
      const r=await fetch(`/api/noah/invites/${id}/claim`,{method:'POST',headers:{'Content-Type':'application/json',[OWNER_SCOPE_HEADER]:scope},body:JSON.stringify({token})});
      const d=await r.json() as {agent:NoahSharedAgent;ownerScope:string;error?:string};if(!r.ok || d.ownerScope!==scope)throw new Error(d.error||'受け取れませんでした。');
      setAgent(d.agent);window.history.replaceState(window.history.state,'',`/noah/invites/${id}`);setTick(n=>n+1);
    }catch(e){setError(e instanceof Error?e.message:'招待を確認できません。');}finally{lock.current=false;setBusy(false);}
  }
  return <WorkspaceShell title="Noah" tone="sky"><main className={`${styles.page} ${styles.formPage}`}><nav className={styles.nav}><Link href="/noah/saved?tab=agents">自分のAgent</Link><Link href="/noah">タイムライン</Link></nav><h1>Agentの限定共有</h1>
    {!loaded && <output>招待を確認中…</output>}
    {!agent && loaded && token && scope && <section className={styles.notice}><p>このアカウントで招待を受け取ると、共有されたAgentの内容を確認できます。Agentの実行は開始しません。</p><button disabled={busy} onClick={()=>{void claim();}}>このアカウントで受け取る</button></section>}
    {signedOut && <p><Link href={`/signin-with-chatgpt?return_to=${encodeURIComponent(`/noah/invites/${id}`)}`}>サインイン</Link>して、招待リンクをもう一度開いてください。</p>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    {agent && <article className={styles.notice}><h2>{agent.manifest.name}</h2><p>{agent.manifest.summary}</p><p>{agent.manifest.author} · v{agent.manifest.version} · {agent.manifest.license}</p><p>{agent.manifest.priceNote}</p><p>共有の期限：{new Date(agent.expiresAt).toLocaleString('ja-JP')}</p>
      {agent.source && <p><a href={`/api/noah/invites/${id}/source`}>保存版コードを取得（{agent.source.name}）</a></p>}
      <p>{agent.executionAllowed?'接続すると専用環境を裏側で準備します。期限切れ・撤回時は実行を停止します。外部操作の許可は含みません。':'閲覧と、許可された場合のコード取得ができます。この招待では実行は許可されていません。'}</p><details><summary>共有された定義</summary><pre>{JSON.stringify(agent.manifest,null,2)}</pre></details>
    </article>}
    {agent?.executionAllowed && agent.source && agent.manifest.runtime && <NoahManagedInstallation key={`${id}/${scope}/${agent.revision}`} id={`invite-${id}`} terminal />}
  </main></WorkspaceShell>;
}
