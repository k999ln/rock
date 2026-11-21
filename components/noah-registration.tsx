'use client';
import { useEffect, useRef, useState } from 'react';
import { useNoahLocale } from './noah-locale';
import NoahLoading from './noah-loading';
import { noahHaptic } from '@/lib/noah-haptics';
import Link from 'next/link';
import { ArrowRight, LockKeyhole } from 'lucide-react';
import { useNoahProfile } from './use-noah-profile';
import { PROFILE_CONSENT_VERSION, profileField } from '@/lib/noah-profile-contract';
import { OWNER_SCOPE_HEADER } from '@/lib/owner-intent';
import type { RegistrationProvider, RegistrationStatus } from '@/lib/noah-registration-contract';
import styles from './noah-registration.module.css';
const STORAGE = 'noah-registration-work-v1';
type Pending = { id: string; key: string };
const HISTORY = `${STORAGE}-history`;
const isPending = (v: unknown): v is Pending => !!v && typeof v === 'object' && 'id' in v && 'key' in v && typeof v.id === 'string' && /^[a-f0-9-]{36}$/.test(v.id) && typeof v.key === 'string' && /^[a-f0-9]{64}$/.test(v.key);
const labels = { running: '登録Agentが処理しています', needs_user: '本人による確認を待っています', completed: '登録Agentから完了報告が届きました', failed: '登録を完了できませんでした', unknown: '登録の結果を確認できていません' };
export default function NoahRegistration({ agentId,onReturn }: { agentId: string;onReturn?:()=>void }) {
  const {t,locale}=useNoahLocale();
  const vault=useNoahProfile();
  const [excluded,setExcluded]=useState<string[]>([]),[documentId,setDocumentId]=useState(''),[saveNext,setSaveNext]=useState(true);
  const [providers, setProviders] = useState<RegistrationProvider[] | null>(null), [selected, setSelected] = useState(''), [agent, setAgent] = useState(agentId);
  const [history,setHistory]=useState<Pending[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [job, setJob] = useState<RegistrationStatus | null>(null), [pending, setPending] = useState<Pending | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [reload, setReload] = useState(0);
  const active = useRef({ generation: 0, mounted: false, busy: false });
  const celebrated=useRef(''),observedPending=useRef('');
  const statusBudget = useRef({ id: '', reads: 0 });
  const provider = providers?.find(p => p.id === selected), generation = active.current.generation;
  const reusable=provider?.fields.filter(f=>vault.profile?.reuseEnabled && f.profileField && f.type!=='password' && (f.profileField==='identityDocument'?vault.profile?.documents.length:profileField(f.profileField)&&vault.profile?.fields[f.profileField]) && !excluded.includes(f.key)).map(f=>f.key)??[];
  const missingRequired=provider?.fields.some(f=>f.required&&!reusable.includes(f.key)&&(!values[f.key]?.trim()||f.type==='file'))??true;
  const usedDocument=documentId||vault.profile?.documents[0]?.id||'';
  const shownValue=(key:string)=>{const f=provider?.fields.find(f=>f.key===key);return reusable.includes(key)&&f?.profileField?(f.profileField==='identityDocument'?vault.profile?.documents.find(d=>d.id===usedDocument)?.name:profileField(f.profileField)?vault.profile?.fields[f.profileField]:'')??'':values[key]??'';};
  const previousOwner=useRef<string|null>(null);
  useEffect(()=>{const next=vault.profile?.ownerScope;if(next){if(previousOwner.current&&previousOwner.current!==next){setValues({});}previousOwner.current=next;}else if(vault.guest&&previousOwner.current){setValues({});previousOwner.current=null;}},[vault.profile?.ownerScope,vault.guest]);

  useEffect(() => {
    const state = active.current; state.mounted = true;
    const controller = new AbortController(), current = ++state.generation;
    void fetch(`/api/noah/registration?${new URLSearchParams(agentId ? { agent: agentId } : {})}`, { signal: controller.signal, cache: 'no-store' }).then(async response => {
      const data = await response.json() as { providers?: RegistrationProvider[]; error?: string };
      if (!response.ok || !Array.isArray(data.providers)) throw Error(data.error ?? '登録先を取得できません。再読み込みしてください。');
      if (!controller.signal.aborted && current === state.generation) { setProviders(data.providers); setSelected(data.providers[0]?.id ?? ''); setAgent(agentId || data.providers[0]?.agentIds[0] || ''); }
    }).catch((e: unknown) => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : '登録先を確認できません。'); });
    try {
      const older:unknown=JSON.parse(sessionStorage.getItem(HISTORY)??'[]');
      if(Array.isArray(older))queueMicrotask(()=>{if(state.mounted&&current===state.generation)setHistory(older.filter(isPending));});
      const saved: unknown = JSON.parse(sessionStorage.getItem(STORAGE) ?? 'null');
      if (saved && typeof saved === 'object' && 'id' in saved && 'key' in saved && typeof saved.id === 'string' && /^[a-f0-9-]{36}$/.test(saved.id) && typeof saved.key === 'string' && /^[a-f0-9]{64}$/.test(saved.key)) { const restored = { id: saved.id, key: saved.key }; queueMicrotask(() => { if (state.mounted && current === state.generation) setPending(restored); }); }
    } catch { /* Storage is optional. Nothing sensitive is restored. */ }
    return () => { state.mounted = false; state.generation++; controller.abort(); };
  }, [agentId, reload, vault.profile?.ownerScope]);
  async function run(start: boolean) {
    if (active.current.busy || generation !== active.current.generation || !active.current.mounted || (start && (!provider || provider.accountState || pending || missingRequired || vault.busy))) return;
    active.current.busy = true; setBusy(true); setError('');
    const current = active.current.generation;
    let ticket = pending, dispatched = false;
    try {
      let profile=vault.profile;
      if(start && saveNext && profile?.available && provider){
        const fields={...profile.fields};
        for(const f of provider.fields)if(f.type!=='password' && profileField(f.profileField) && !reusable.includes(f.key) && values[f.key])fields[f.profileField]=values[f.key];
        const saved=await vault.save({action:'fields',fields,consentVersion:PROFILE_CONSENT_VERSION,reuse:true});if(!saved)throw Error('情報を保存できませんでした。内容を確認してください。');profile=saved;
      }
      if (!active.current.mounted || current !== active.current.generation) return;
      if (start) {
        const key = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
        ticket = { id: crypto.randomUUID(), key };
        setPending(ticket);
        try { sessionStorage.setItem(STORAGE, JSON.stringify(ticket)); } catch { /* In-memory operation still works. */ }
      }
      if (!ticket) return;
      dispatched = start;
      const response = await fetch(`/api/noah/registration${start ? '' : `?job=${encodeURIComponent(ticket.id)}`}`, {
        method: start ? 'POST' : 'GET', cache: 'no-store', signal: AbortSignal.timeout(25_000), headers: { 'X-Noah-Registration-Key': ticket.key, ...(start ? { 'Content-Type': 'application/json', ...(profile?{[OWNER_SCOPE_HEADER]:profile.ownerScope}:{}) } : {}) },
        ...(start ? { body: JSON.stringify({ action: 'start', id: ticket.id, providerId: provider!.id, agentId: agent, revision: provider!.revision, termsVersion: provider!.termsVersion, values:Object.fromEntries(Object.entries(values).filter(([key])=>!reusable.includes(key))), ...(profile&&reusable.length?{profile:{revision:profile.revision,fields:reusable,...(provider!.fields.some(f=>f.profileField==='identityDocument'&&reusable.includes(f.key))?{documentId:usedDocument}:{})}}:{}), consent: true, termsAccepted: true }) } : {}),
      });
      // No credentials survive a dispatch, including uncertain outcomes.
      if (current === active.current.generation) { setValues({});    }
      const data = await response.json() as { job?: RegistrationStatus; error?: string };
      if (!active.current.mounted || current !== active.current.generation) return;
      if (!response.ok || !data.job) throw Error(data.error ?? '受付結果が不明です。登録し直さず、状況を確認してください。');
      setJob(data.job);
      if(data.job.state==='running'||data.job.state==='needs_user')observedPending.current=data.job.id;
      if(data.job.state==='completed'&&(start||observedPending.current===data.job.id)&&celebrated.current!==data.job.id){celebrated.current=data.job.id;noahHaptic('success');}
    } catch (e) {
      if (active.current.mounted && current === active.current.generation) { if(dispatched)setValues({}); setError(e instanceof Error ? e.message : '結果を確認できません。同じ仕事の状況を確認してください。'); }
    } finally { if (active.current.mounted && current === active.current.generation) { active.current.busy = false; setBusy(false); } }
  }
  // 同じ登録の状態だけを読む。本人確認から戻った時も、登録情報は再送しない。
  // 画面が裏の間は通信せず、1回の表示につき自動照会は12回まで。
  useEffect(() => {
    if (!pending || job?.state === 'completed' || job?.state === 'failed') return;
    if (statusBudget.current.id !== pending.id) statusBudget.current = { id: pending.id, reads: 0 };
    const budget = statusBudget.current;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const read = async () => {
      clearTimeout(timer);
      if (stopped || budget.reads >= 12) return;
      if (!document.hidden && !active.current.busy) { budget.reads++; await run(false); }
      if (!stopped && budget.reads < 12) timer = setTimeout(() => { void read(); }, 5000);
    };
    const returned = () => { if (!document.hidden) { budget.reads = 0; void read(); } };
    timer = setTimeout(() => { void read(); }, job ? 5000 : 0);
    document.addEventListener('visibilitychange', returned);
    return () => { stopped = true; clearTimeout(timer); document.removeEventListener('visibilitychange', returned); };
    // 登録IDと状態が変わった時だけ、同じ仕事の確認を始め直す。
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [pending?.id, pending?.key, job?.state]);
  function retryFailed() {
    if(active.current.busy||job?.state!=='failed'||!pending)return;
    const older=[...history.filter(p=>p.id!==pending.id),pending];
    try{sessionStorage.setItem(HISTORY,JSON.stringify(older));sessionStorage.removeItem(STORAGE);}catch{/* The mounted screen still retains every ticket. */}
    setHistory(older);active.current.generation++;setJob(null);setPending(null);setValues({});setError('');
  }
  function restore(ticket:Pending){
    if(active.current.busy)return;
    active.current.generation++;setPending(ticket);setJob(null);setValues({});setError('');
    try{sessionStorage.setItem(STORAGE,JSON.stringify(ticket));}catch{/* In-memory operation still works. */}
  }
  function clear() {
    if (active.current.busy) return;
    active.current.generation++; setJob(null); setPending(null); setValues({});    setError('');
    try { sessionStorage.removeItem(STORAGE); } catch { /* Private mode. */ }
  }
  return <main className={styles.page}>
    <header><h1>{t(!provider?'登録状況を確認':provider.accountState==='ready'?'登録済み':provider?.accountState?'登録状況を確認':reusable.length===provider?.fields.length?'保存情報を使えます':'足りない情報だけ追加')}</h1></header>
    {error && <p role="alert" className={styles.error}>{t(error)}</p>}
    {providers === null && !error && <NoahLoading label={t("登録先を確認しています…")} />}
    {providers === null && error && <button disabled={busy} onClick={() => setReload(n => n + 1)}>{t("再読み込み")}</button>}
    {provider?.accountState&&providers&&providers.length>1&&<label>{t('登録するサービス')}<select value={selected} disabled={busy} onChange={e=>{setSelected(e.target.value);setAgent(agentId||providers.find(p=>p.id===e.target.value)?.agentIds[0]||'');setValues({});}}>{providers.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
    {provider?.accountState ? <section className={styles.panel}><h2>{provider.name}</h2><p>{t(provider.accountState==='ready'?'登録済みです。保存した接続で使えます。':provider.accountState==='pending'?'登録を確認中です。情報は再送しません。':'登録状況を取得できません。再読み込みしてください。')}</p>{provider.accountState==='ready'?<Link href={`/noah/ready/agent?id=${encodeURIComponent(agent)}`} onClick={onReturn}>{t('Agentを使う')}<ArrowRight size={16}/></Link>:<button disabled={busy} onClick={()=>setReload(n=>n+1)}>{t('再読み込み')}</button>}{pending&&provider.accountState==='pending'&&<button disabled={busy} onClick={()=>{void run(false);}}>{t('登録の状況を確認')}</button>}</section> : pending ? <section className={styles.panel} aria-label={t("登録の進捗")}><h2>{job ? t(labels[job.state]) : t("登録の受付状況を確認してください")}</h2>
      {job && <><p>{t("登録先：")}{job.providerName}（{job.providerOrigin}）</p><p>{t("確認期限：")}{new Date(job.expiresAt).toLocaleString(locale)}</p></>}
      {job?.state === 'needs_user' && <><p>{t("本人による確認が必要です。")}</p>{job.verificationUrl && (job.verificationUrl.startsWith('/noah/')?<Link href={job.verificationUrl}>{t("確認を続ける")}<ArrowRight size={16}/></Link>:<a href={job.verificationUrl} target="_blank" rel="noreferrer">{t("登録先で確認する")}<ArrowRight size={16} /></a>)}</>}
      {job?.state === 'completed' && <><p>{t("実際の利用可否は、元のAgentへの接続時に確認します。")}</p><Link href={job.returnTo} onClick={onReturn}>{t("Agentを使う")}<ArrowRight size={16} /></Link></>}
      {(!job || ['running','needs_user','unknown'].includes(job.state)) && <><p>{t("同じ登録を繰り返さず、この仕事の状況を確認します。")}</p><button disabled={busy} onClick={() => { void run(false); }}>{busy ? t("確認中…") : t("登録の状況を確認")}</button></>}
      {job?.state==='failed'&&<button disabled={busy} onClick={retryFailed}>{t('もう一度')}</button>}
      <details><summary>{t("このブラウザから記録を消す")}</summary><p>{t("登録処理は取り消されません。確認用の情報を消すと、この画面から状況を確認できなくなります。結果が不明な時は、登録先で状況を確認してから新しい依頼を行ってください。")}</p><button disabled={busy} onClick={clear}>{t("ブラウザの確認情報を消す")}</button></details>
    </section> : providers?.length === 0 ? <section className={styles.panel}><h2>{t("このAgentの登録担当は準備中です")}</h2><p>{t("登録Agentの接続と必要項目が設定されると、ここから依頼できます。接続前に登録情報を集めることはありません。")}</p><Link href="/noah/explore">{t("Agentを探す")}</Link></section> : provider?.requiresAccount && !vault.profile ? <section className={styles.panel}>{vault.guest?<><h2>{t("接続を安全に引き継ぐ")}</h2><p>{t("接続を確認すると、登録情報と成果を引き継げます。")}</p><Link href={`/noah/account?returnTo=${encodeURIComponent(`/noah/registration?agent=${agent}`)}`}>{t("接続を確認して続ける")}</Link></>:vault.error?<><p role="alert">{vault.error}</p><button onClick={()=>{void vault.reload();}}>{t("再読み込み")}</button></>:<NoahLoading label={t("アカウントを確認しています")}/>}</section> : provider && <form onSubmit={e => { e.preventDefault(); void run(true); }}>
      <section className={styles.panel}>
        {providers&&providers.length>1?<label>{t('登録するサービス')}<select value={selected} disabled={busy} onChange={e=>{setSelected(e.target.value);setExcluded([]);setDocumentId('');setSaveNext(true);setAgent(agentId||providers.find(p=>p.id===e.target.value)?.agentIds[0]||'');setValues({});}}>{providers.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>:<h2>{provider.name}</h2>}
        {!agentId&&<label>{t('使うAgent')}<select value={agent} disabled={busy} onChange={e=>{setAgent(e.target.value);setValues({});}}>{provider.agentIds.map(id=><option key={id} value={id}>{id}</option>)}</select></label>}
        {reusable.length>0&&<details className={styles.savedGroup}><summary><LockKeyhole size={17}/> {t('保存した情報')} <span>{t('保存済み')} ✓</span></summary>{provider.fields.filter(f=>reusable.includes(f.key)).map(field=><div className={styles.savedValue} key={field.key}><span>{t(field.label)}<small>{shownValue(field.key)}</small></span><button type="button" disabled={busy} onClick={()=>setExcluded(v=>[...v,field.key])}>{t('編集')}</button>{field.type==='file'&&vault.profile&&vault.profile.documents.length>1&&<select aria-label={t(field.label)} value={usedDocument} disabled={busy} onChange={e=>setDocumentId(e.target.value)}>{vault.profile.documents.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select>}</div>)}</details>}
        {provider.fields.filter(f=>!reusable.includes(f.key)).map(field=><div className={styles.fieldRow} key={field.key}><label>{t(field.label)}{field.required?' *':''}{field.type==='file'?<Link href="/noah/profile">{t('書類を追加')} →</Link>:<input type={field.type} name={field.key} required={field.required} maxLength={field.maxLength} value={values[field.key]??''} disabled={busy} autoComplete={field.type==='password'?'new-password':field.type==='email'?'email':field.profileField==='phone'?'tel':field.profileField==='name'?'name':'off'} onChange={e=>setValues(v=>({...v,[field.key]:e.target.value}))}/>}</label></div>)}
        <details className={styles.terms}><summary>{t('規約・送信情報')}</summary>
          <p>{t('送信先')}: {provider.name} ({provider.providerOrigin})</p><p>{provider.executorName} ({provider.executorOrigin})</p>
          {provider.notice&&<p>{provider.notice}</p>}<dl>{provider.fields.map(field=><div key={field.key}><dt>{t(field.label)}</dt><dd>{field.type==='password'?'••••••':shownValue(field.key)||'—'}</dd></div>)}</dl>
          <a href={provider.termsUrl} target="_blank" rel="noreferrer">{provider.name} · {t('利用規約')} ({provider.termsVersion})</a>
        </details>
        {vault.profile?.available&&provider.fields.some(f=>profileField(f.profileField)&&f.type!=='password')&&<div className={styles.reuseBanner}><span>{saveNext?t('保存し、次の登録にも使います'):t('今回だけ使う')}</span><button type="button" disabled={busy} onClick={()=>setSaveNext(v=>!v)}>{t(saveNext?t("今回だけ使う"):t("保存して使う"))}</button></div>}
        <p className={styles.hint}>{t('登録ボタンで、規約と上記情報の送信に同意します。')}</p>
        <button className={styles.primary} type="submit" disabled={busy||vault.busy||missingRequired}>{busy?<NoahLoading compact/>:t('同意して登録')}<ArrowRight size={17}/></button>
      </section>
    </form>}
    {history.some(p=>p.id!==pending?.id)&&<details><summary>{t('以前の登録')}</summary>{history.filter(p=>p.id!==pending?.id).map((ticket,index)=><button key={ticket.id} disabled={busy} onClick={()=>restore(ticket)}>{t('登録の状況を確認')} {index+1}</button>)}</details>}
    <Link href="/noah#timeline">{t("タイムラインへ戻る")}</Link>
  </main>;
}
