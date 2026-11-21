'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Bot, ArrowRight, LockKeyhole } from 'lucide-react';
import { useNoahProfile } from './use-noah-profile';
import { profileField } from '@/lib/noah-profile-contract';
import { OWNER_SCOPE_HEADER } from '@/lib/owner-intent';
import type { RegistrationProvider, RegistrationStatus } from '@/lib/noah-registration-contract';
import styles from './noah-registration.module.css';
const STORAGE = 'noah-registration-work-v1';
type Pending = { id: string; key: string };
const labels = { running: '登録Agentが処理しています', needs_user: '本人による確認を待っています', completed: '登録Agentから完了報告が届きました', failed: '登録を完了できませんでした', unknown: '登録の結果を確認できていません' };
export default function NoahRegistration({ agentId }: { agentId: string }) {
  const vault=useNoahProfile();
  const [excluded,setExcluded]=useState<string[]>([]),[documentId,setDocumentId]=useState(''),[saveNext,setSaveNext]=useState(false);
  const [providers, setProviders] = useState<RegistrationProvider[] | null>(null), [selected, setSelected] = useState(''), [agent, setAgent] = useState(agentId);
  const [values, setValues] = useState<Record<string, string>>({}), [review, setReview] = useState(false), [consent, setConsent] = useState(false), [terms, setTerms] = useState(false);
  const [job, setJob] = useState<RegistrationStatus | null>(null), [pending, setPending] = useState<Pending | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [reload, setReload] = useState(0);
  const active = useRef({ generation: 0, mounted: false, busy: false });
  const statusBudget = useRef({ id: '', reads: 0 });
  const provider = providers?.find(p => p.id === selected), generation = active.current.generation;
  const reusable=provider?.fields.filter(f=>f.profileField && f.type!=='password' && (f.profileField==='identityDocument'?vault.profile?.documents.length:profileField(f.profileField)&&vault.profile?.fields[f.profileField]) && !excluded.includes(f.key)).map(f=>f.key)??[];
  const usedDocument=documentId||vault.profile?.documents[0]?.id||'';
  const shownValue=(key:string)=>{const f=provider?.fields.find(f=>f.key===key);return reusable.includes(key)&&f?.profileField?(f.profileField==='identityDocument'?vault.profile?.documents.find(d=>d.id===usedDocument)?.name:profileField(f.profileField)?vault.profile?.fields[f.profileField]:'')??'':values[key]??'';};
  const previousOwner=useRef<string|null>(null);
  useEffect(()=>{const next=vault.profile?.ownerScope;if(next){if(previousOwner.current&&previousOwner.current!==next){setValues({});setReview(false);setConsent(false);setTerms(false);}previousOwner.current=next;}else if(vault.guest&&previousOwner.current){setValues({});setReview(false);setConsent(false);setTerms(false);previousOwner.current=null;}},[vault.profile?.ownerScope,vault.guest]);

  useEffect(() => {
    const state = active.current; state.mounted = true;
    const controller = new AbortController(), current = ++state.generation;
    void fetch(`/api/noah/registration?${new URLSearchParams(agentId ? { agent: agentId } : {})}`, { signal: controller.signal, cache: 'no-store' }).then(async response => {
      const data = await response.json() as { providers?: RegistrationProvider[]; error?: string };
      if (!response.ok || !Array.isArray(data.providers)) throw Error(data.error ?? '登録先を取得できません。再読み込みしてください。');
      if (!controller.signal.aborted && current === state.generation) { setProviders(data.providers); setSelected(data.providers[0]?.id ?? ''); setAgent(agentId || data.providers[0]?.agentIds[0] || ''); }
    }).catch((e: unknown) => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : '登録先を確認できません。'); });
    try {
      const saved: unknown = JSON.parse(sessionStorage.getItem(STORAGE) ?? 'null');
      if (saved && typeof saved === 'object' && 'id' in saved && 'key' in saved && typeof saved.id === 'string' && /^[a-f0-9-]{36}$/.test(saved.id) && typeof saved.key === 'string' && /^[a-f0-9]{64}$/.test(saved.key)) { const restored = { id: saved.id, key: saved.key }; queueMicrotask(() => { if (state.mounted && current === state.generation) setPending(restored); }); }
    } catch { /* Storage is optional. Nothing sensitive is restored. */ }
    return () => { state.mounted = false; state.generation++; controller.abort(); };
  }, [agentId, reload]);
  async function run(start: boolean) {
    if (active.current.busy || generation !== active.current.generation || !active.current.mounted || (start && (!provider || !consent || !terms || !review || pending))) return;
    active.current.busy = true; setBusy(true); setError('');
    const current = active.current.generation;
    let ticket = pending;
    try {
      let profile=vault.profile;
      if(start && saveNext && profile && provider){
        const fields={...profile.fields};
        for(const f of provider.fields)if(f.type!=='password' && profileField(f.profileField) && !reusable.includes(f.key) && values[f.key])fields[f.profileField]=values[f.key];
        const saved=await vault.save({action:'fields',fields});if(!saved)throw Error('情報を保存できませんでした。内容を確認してください。');profile=saved;
      }
      if (start) {
        const key = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
        ticket = { id: crypto.randomUUID(), key };
        setPending(ticket);
        try { sessionStorage.setItem(STORAGE, JSON.stringify(ticket)); } catch { /* In-memory operation still works. */ }
      }
      if (!ticket) return;
      const response = await fetch(`/api/noah/registration${start ? '' : `?job=${encodeURIComponent(ticket.id)}`}`, {
        method: start ? 'POST' : 'GET', cache: 'no-store', signal: AbortSignal.timeout(25_000), headers: { 'X-Noah-Registration-Key': ticket.key, ...(start ? { 'Content-Type': 'application/json', ...(profile?{[OWNER_SCOPE_HEADER]:profile.ownerScope}:{}) } : {}) },
        ...(start ? { body: JSON.stringify({ action: 'start', id: ticket.id, providerId: provider!.id, agentId: agent, revision: provider!.revision, termsVersion: provider!.termsVersion, values:Object.fromEntries(Object.entries(values).filter(([key])=>!reusable.includes(key))), ...(profile&&reusable.length?{profile:{revision:profile.revision,fields:reusable,...(provider!.fields.some(f=>f.profileField==='identityDocument'&&reusable.includes(f.key))?{documentId:usedDocument}:{})}}:{}), consent: true, termsAccepted: true }) } : {}),
      });
      // No credentials survive a dispatch, including uncertain outcomes.
      if (current === active.current.generation) { setValues({}); setConsent(false); setTerms(false); setReview(false); }
      const data = await response.json() as { job?: RegistrationStatus; error?: string };
      if (!active.current.mounted || current !== active.current.generation) return;
      if (!response.ok || !data.job) throw Error(data.error ?? '受付結果が不明です。登録し直さず、状況を確認してください。');
      setJob(data.job);
    } catch (e) {
      if (active.current.mounted && current === active.current.generation) { setValues({}); setConsent(false); setTerms(false); setReview(false); setError(e instanceof Error ? e.message : '結果を確認できません。同じ仕事の状況を確認してください。'); }
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
  function clear() {
    if (active.current.busy) return;
    active.current.generation++; setJob(null); setPending(null); setValues({}); setReview(false); setConsent(false); setTerms(false); setError('');
    try { sessionStorage.removeItem(STORAGE); } catch { /* Private mode. */ }
  }
  return <main className={styles.page}>
    <header><span className={styles.badge}><Bot size={17} />NOAH REGISTRATION AGENT</span><h1>あと少しで、使えます。</h1><p>必要な情報だけ。登録はAgentに任せましょう。</p></header>
    <ol className={styles.steps}><li>必要項目を入力</li><li>送信先・内容を確認</li><li>登録Agentを実行</li></ol>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {providers === null && !error && <output>登録先を確認しています…</output>}
    {providers === null && error && <button disabled={busy} onClick={() => setReload(n => n + 1)}>再読み込み</button>}
    {pending ? <section className={styles.panel} aria-label="登録の進捗"><h2>{job ? labels[job.state] : '登録の受付状況を確認してください'}</h2>
      {job && <><p>登録先：{job.providerName}（{job.providerOrigin}）</p><p>確認期限：{new Date(job.expiresAt).toLocaleString('ja-JP')}</p></>}
      {job?.state === 'needs_user' && <><p>メール確認や本人確認など、登録先での操作が必要です。完了後にこの画面へ戻り、状況を確認してください。</p>{job.verificationUrl && <a href={job.verificationUrl} target="_blank" rel="noreferrer">登録先で確認する <ArrowRight size={16} /></a>}</>}
      {job?.state === 'completed' && <><p>実際の利用可否は、元のAgentへの接続時に確認します。</p><Link href={job.returnTo}>Agentの利用へ戻る <ArrowRight size={16} /></Link></>}
      {(!job || ['running','needs_user','unknown'].includes(job.state)) && <><p>同じ登録を繰り返さず、この仕事の状況を確認します。</p><button disabled={busy} onClick={() => { void run(false); }}>{busy ? '確認中…' : '登録の状況を確認'}</button></>}
      <details><summary>このブラウザから記録を消す</summary><p>登録処理は取り消されません。確認用の情報を消すと、この画面から状況を確認できなくなります。結果が不明な時は、登録先で状況を確認してから新しい依頼を行ってください。</p><button disabled={busy} onClick={clear}>ブラウザの確認情報を消す</button></details>
    </section> : providers?.length === 0 ? <section className={styles.panel}><h2>このAgentの登録担当は準備中です</h2><p>登録Agentの接続と必要項目が設定されると、ここから依頼できます。接続前に登録情報を集めることはありません。</p><Link href="/noah/explore">Agentを探す</Link></section> : provider && <form onSubmit={e => { e.preventDefault(); if (review) void run(true); else setReview(true); }}>
      <section className={styles.panel}><h2>{provider.name}につなぐ準備</h2><label>登録するサービス<select value={selected} disabled={busy || review} onChange={e => { setSelected(e.target.value); setExcluded([]); setDocumentId(''); setSaveNext(false); setAgent(agentId || providers?.find(p => p.id === e.target.value)?.agentIds[0] || ''); setValues({}); setConsent(false); setTerms(false); }}>
        {providers?.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select></label>{!agentId && <label>使うAgent<select value={agent} disabled={busy || review} onChange={e => { setAgent(e.target.value); setValues({}); setConsent(false); setTerms(false); }}>{provider.agentIds.map(id => <option key={id} value={id}>{id}</option>)}</select></label>}
      {vault.profile?.available && <div className={styles.reuseBanner}><LockKeyhole size={18}/><span>保存情報を使って、入力をスキップ</span><Link href="/noah/profile">編集</Link></div>}
      {provider.fields.map(field => {
        const hasSaved=field.profileField && (field.profileField==='identityDocument'?vault.profile?.documents.length:profileField(field.profileField)&&vault.profile?.fields[field.profileField]);
        const reuse=reusable.includes(field.key);
        return <div className={styles.fieldRow} key={field.key}><label>{field.label}{field.required?' *':''}
          {reuse?<span className={styles.savedValue}>{shownValue(field.key)}<small>保存済み</small></span>:field.type==='file'?<Link href="/noah/profile">本人確認書類を追加する →</Link>:<input type={field.type} name={field.key} required={field.required} maxLength={field.maxLength} value={values[field.key]??''} readOnly={review} disabled={busy} autoComplete={field.type==='password'?'new-password':field.type==='email'?'email':'off'} onChange={e=>setValues(v=>({...v,[field.key]:e.target.value}))}/>}
        </label>{hasSaved&&<label className={styles.check}><input type="checkbox" checked={reuse} disabled={busy||review} onChange={e=>{setExcluded(v=>e.target.checked?v.filter(k=>k!==field.key):[...v,field.key]);setValues(v=>{const next={...v};delete next[field.key];return next;});}}/>保存した情報を使う</label>}
        {reuse&&field.type==='file'&&vault.profile&&vault.profile.documents.length>1&&<select aria-label="渡す書類" value={usedDocument} disabled={review||busy} onChange={e=>setDocumentId(e.target.value)}>{vault.profile.documents.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select>}
        </div>;
      })}
      {vault.profile?.available&&provider.fields.some(f=>profileField(f.profileField)&&f.type!=='password')&&<label className={styles.check}><input type="checkbox" checked={saveNext} disabled={busy||review} onChange={e=>setSaveNext(e.target.checked)}/>今回の入力を保存して、次のAgentでも使う</label>}
      <p className={styles.hint}><LockKeyhole size={15} />パスワードは保存しません。渡す項目は次の画面で確認できます。</p></section>
      {review && <section className={styles.panel}><h2>この情報で登録します</h2><p>登録先：{provider.name}（{provider.providerOrigin}）</p><p>処理する登録Agent：{provider.executorName}（{provider.executorOrigin}）</p>
        <dl>{provider.fields.map(field => <div key={field.key}><dt>{field.label}</dt><dd>{field.type === 'password' ? (values[field.key] ? '入力済み（表示しません）' : '未入力') : shownValue(field.key) || '未入力'}</dd></div>)}</dl>
        <p>メール確認など、本人の操作が必要になったらお知らせします。</p>
        <label className={styles.check}><input type="checkbox" checked={consent} disabled={busy} onChange={e => setConsent(e.target.checked)} />送信先と内容を確認し、登録Agentへこの情報を渡して登録を依頼します</label>
        <label className={styles.check}><input type="checkbox" checked={terms} disabled={busy} onChange={e => setTerms(e.target.checked)} /><span><a href={provider.termsUrl} target="_blank" rel="noreferrer">{provider.name}の利用規約</a>（{provider.termsVersion}）を確認し、同意します</span></label>
        <button type="button" disabled={busy} onClick={() => { setReview(false); setConsent(false); setTerms(false); }}>入力内容を修正する</button>
      </section>}
      <button className={styles.primary} type="submit" disabled={busy || (review && (!consent || !terms))}>{busy ? '依頼しています…' : review ? 'この内容でつなぐ' : '内容を確認する'}<ArrowRight size={17} /></button>
    </form>}
    <p className={styles.footnote}>このブラウザで登録の仕事を確認できます。保存・引き継ぎ機能を使うためのNoahアカウントとは別の手続きです。</p><Link href="/noah#timeline">タイムラインへ戻る</Link>
  </main>;
}
