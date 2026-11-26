'use client';
import { noahSignInHref } from '@/lib/noah-navigation';
import { useEffect, useRef, useState } from 'react';
import { useNoahLocale } from './noah-locale';
import NoahLoading from './noah-loading';
import { noahHaptic } from '@/lib/noah-haptics';
import Link from 'next/link';
import { ArrowRight, LockKeyhole } from 'lucide-react';
import { useNoahProfile } from './use-noah-profile';
import { NOAH_PROFILE_FIELDS, PROFILE_CONSENT_VERSION, PROFILE_CONSENT_TEXT, PROFILE_CONSENT_DETAILS, profileField } from '@/lib/noah-profile-contract';
import { OWNER_SCOPE_HEADER } from '@/lib/owner-intent';
import type { RegistrationField, RegistrationProvider, RegistrationStatus } from '@/lib/noah-registration-contract';
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
  const retryAt=provider?.accountState==='cooldown'?provider.retryAt:job?.state==='failed'?job.retryAt:undefined;
  const [clock,setClock]=useState(()=>Date.now());
  const cooling=typeof retryAt==='number'&&retryAt>clock;
  useEffect(()=>{
    if(!retryAt)return;
    const refresh=()=>setClock(Date.now());
    const timer=setTimeout(refresh,Math.min(Math.max(retryAt-Date.now(),1),2147483647));
    document.addEventListener('visibilitychange',refresh);
    return()=>{clearTimeout(timer);document.removeEventListener('visibilitychange',refresh);};
  },[retryAt]);
  const cooldownNotice=retryAt?<p>{t('受付再開の目安: {time}',{time:new Date(retryAt).toLocaleString(locale)})}</p>:null;
  const reusable=provider?.fields.filter(f=>vault.profile?.reuseEnabled && f.profileField && f.type!=='password' && (f.profileField==='identityDocument'?vault.profile?.documents.length:profileField(f.profileField)&&vault.profile?.fields[f.profileField]) && !excluded.includes(f.key)).map(f=>f.key)??[];
  const missingRequired=provider?.fields.some(f=>f.required&&!reusable.includes(f.key)&&(!values[f.key]?.trim()||f.type==='file'))??true;
  const profileReady = Boolean(vault.profile || vault.guest);
  const newFields = provider?.fields.filter(f => !reusable.includes(f.key)) ?? [];
  const saveable = newFields.filter(f => f.type !== 'password' && profileField(f.profileField));
  const canSave = Boolean(vault.profile?.available && saveable.some(f => f.required || values[f.key]?.trim()));
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
    if (active.current.busy || generation !== active.current.generation || !active.current.mounted || (start && (!provider || provider.accountState || pending || !profileReady || missingRequired || vault.busy))) return;
    active.current.busy = true; setBusy(true); setError('');
    const current = active.current.generation;
    let ticket = pending, dispatched = false;
    try {
      let profile=vault.profile;
      if(start && saveNext && canSave && profile?.available && provider && saveable.some(f => values[f.key]?.trim())){
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
    if(active.current.busy||job?.state!=='failed'||!pending||(job.retryAt&&job.retryAt>Date.now()))return;
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
  function fieldInput(field: RegistrationField) {
    const autofill = profileField(field.profileField) ? NOAH_PROFILE_FIELDS[field.profileField].autocomplete : field.type === 'email' ? 'email' : field.type === 'password' ? 'new-password' : 'off';
    return <div className={styles.fieldRow} key={field.key}><label>
      <span>{t(field.label)}{field.required ? <span className={styles.required}>{t('必須')}</span> : null}</span>
      {field.type === 'file' ? <Link href="/noah/profile">{t('書類を追加')} →</Link> : <input
        type={field.type === 'text' && field.profileField === 'phone' ? 'tel' : field.type} name={field.key} id={`noah-registration-${field.key}`} required={field.required} maxLength={field.maxLength}
        value={values[field.key] ?? ''} disabled={busy} autoCapitalize={field.type === 'email' ? 'none' : undefined}
        autoComplete={autofill}
        onInput={e => {const value=e.currentTarget.value;setValues(v => ({ ...v, [field.key]: value }));}}
        onChange={e => setValues(v => ({ ...v, [field.key]: e.target.value }))} />}
    </label></div>;
  }
  return <main className={styles.page}>
    <header>
      <p className={styles.eyebrow}>{provider?.name ?? 'Noah'}</p>
      <h1>{t(pending || provider?.accountState ? '利用の準備' : reusable.length && !newFields.some(f=>f.required) ? '入力は、もうできています。' : 'このAgentに、必要な分だけ。')}</h1>
      {!pending && !provider?.accountState && <p>{t('保存した情報を使って、次のAgentもスムーズに。送る内容を確認したら、そのまま続けられます。')}</p>}
    </header>
    {error && <p role="alert" className={styles.error}>{t(error)}</p>}
    {providers === null && !error && <NoahLoading label={t("登録先を確認しています…")} />}
    {providers === null && error && <button disabled={busy} onClick={() => setReload(n => n + 1)}>{t("再読み込み")}</button>}
    {provider?.accountState&&providers&&providers.length>1&&<label>{t('登録するサービス')}<select value={selected} disabled={busy} onChange={e=>{setSelected(e.target.value);setAgent(agentId||providers.find(p=>p.id===e.target.value)?.agentIds[0]||'');setValues({});}}>{providers.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
    {provider?.accountState ? <section className={styles.panel}><h2>{provider.name}</h2><p>{t(provider.accountState==='ready'?'登録済みです。保存した接続で使えます。':provider.accountState==='pending'?'登録を確認中です。情報は再送しません。':provider.accountState==='cooldown'?'登録先の受付が混み合っています。':'登録状況を取得できません。再読み込みしてください。')}</p>{provider.accountState==='cooldown'&&cooldownNotice}{provider.accountState==='ready'?<Link className={styles.primary} href={`/noah/ready/agent?id=${encodeURIComponent(agent)}`} onClick={onReturn}>{t('Agentを使う')}<ArrowRight size={16}/></Link>:<button disabled={busy||cooling} onClick={()=>setReload(n=>n+1)}>{t('再読み込み')}</button>}{pending&&provider.accountState==='pending'&&<button disabled={busy} onClick={()=>{void run(false);}}>{t('登録の状況を確認')}</button>}</section> : pending ? <section className={styles.panel} aria-label={t("登録の進捗")} aria-live="polite"><h2>{job ? t(labels[job.state]) : t("登録の受付状況を確認してください")}</h2>
      {job && <><p>{t("登録先：")}{job.providerName}（{job.providerOrigin}）</p><p>{t("確認期限：")}{new Date(job.expiresAt).toLocaleString(locale)}</p></>}
      {job?.state === 'needs_user' && <><p>{t("本人による確認が必要です。")}</p>{job.verificationUrl && (job.verificationUrl.startsWith('/noah/')?<Link href={job.verificationUrl}>{t("確認を続ける")}<ArrowRight size={16}/></Link>:<a href={job.verificationUrl} target="_blank" rel="noreferrer">{t("登録先で確認する")}<ArrowRight size={16} /></a>)}</>}
      {job?.state === 'completed' && <><p>{t("実際の利用可否は、元のAgentへの接続時に確認します。")}</p><Link className={styles.primary} href={job.returnTo} onClick={onReturn}>{t("Agentへ戻って続ける")}<ArrowRight size={16} /></Link></>}
      {(!job || ['running','needs_user','unknown'].includes(job.state)) && <><p>{t("同じ登録を繰り返さず、この仕事の状況を確認します。")}</p><button disabled={busy} onClick={() => { void run(false); }}>{busy ? t("確認中…") : t("登録の状況を確認")}</button></>}
      {job?.state==='failed'&&<>{retryAt&&<p>{t('登録先の受付が混み合っています。')}</p>}{cooldownNotice}<button disabled={busy||cooling} onClick={retryFailed}>{t('もう一度')}</button></>}
      <details><summary>{t("このブラウザから記録を消す")}</summary><p>{t("登録処理は取り消されません。確認用の情報を消すと、この画面から状況を確認できなくなります。結果が不明な時は、登録先で状況を確認してから新しい依頼を行ってください。")}</p><button disabled={busy} onClick={clear}>{t("ブラウザの確認情報を消す")}</button></details>
    </section> : providers?.length === 0 ? <section className={styles.panel}><h2>{t("このAgentの登録担当は準備中です")}</h2><p>{t("登録Agentの接続と必要項目が設定されると、ここから依頼できます。接続前に登録情報を集めることはありません。")}</p><Link href="/noah/explore">{t("Agentを探す")}</Link></section> : provider && !profileReady ? <section className={styles.panel}>{vault.error ? <><p role="alert">{t(vault.error)}</p><button type="button" onClick={()=>{void vault.reload();}}>{t('再読み込み')}</button></> : <NoahLoading label={t('保存情報を読み込んでいます…')}/>}</section> : provider?.requiresAccount && !vault.profile ? <section className={styles.panel}>{vault.guest?<><h2>{t("接続を安全に引き継ぐ")}</h2><p>{t("接続を確認すると、登録情報と成果を引き継げます。")}</p><a href={noahSignInHref(`/noah/registration?agent=${encodeURIComponent(agent)}`)}>{t("接続を確認して続ける")}</a></>:vault.error?<><p role="alert">{vault.error}</p><button onClick={()=>{void vault.reload();}}>{t("再読み込み")}</button></>:<NoahLoading label={t("保存情報を読み込んでいます…")}/>}</section> : provider && <form onSubmit={e => { e.preventDefault(); void run(true); }}>
      <section className={styles.panel}>
        {providers&&providers.length>1?<label>{t('登録するサービス')}<select value={selected} disabled={busy} onChange={e=>{setSelected(e.target.value);setExcluded([]);setDocumentId('');setSaveNext(true);setAgent(agentId||providers.find(p=>p.id===e.target.value)?.agentIds[0]||'');setValues({});}}>{providers.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>:null}
        {!agentId&&<label>{t('使うAgent')}<select value={agent} disabled={busy} onChange={e=>{setAgent(e.target.value);setValues({});}}>{provider.agentIds.map(id=><option key={id} value={id}>{id}</option>)}</select></label>}
        {reusable.length>0&&<section className={styles.savedGroup} aria-label={t('保存した情報')}><div className={styles.savedHeading}><LockKeyhole size={17} aria-hidden="true"/> {t('保存した情報')}<span>{t('再入力は不要')}</span></div>{provider.fields.filter(f=>reusable.includes(f.key)).map(field=><div className={styles.savedValue} key={field.key}><span>{t(field.label)}<small>{shownValue(field.key)}</small></span><button type="button" disabled={busy} onClick={()=>{setValues(v=>({...v,[field.key]:shownValue(field.key)}));setExcluded(v=>[...v,field.key]);}}>{t('編集')}</button>{field.type==='file'&&vault.profile&&vault.profile.documents.length>1&&<select aria-label={t(field.label)} value={usedDocument} disabled={busy} onChange={e=>setDocumentId(e.target.value)}>{vault.profile.documents.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select>}</div>)}</section>}
        {newFields.some(f=>f.type!=='password'&&f.type!=='file') && <p className={styles.hint}>{t('Safari・Chromeに保存した情報を、入力欄の自動入力候補から使えます。')}</p>}
        {newFields.filter(f=>f.required).map(fieldInput)}
        {newFields.some(f=>!f.required) && <details className={styles.optional} onInvalidCapture={event=>{event.currentTarget.open=true;}}><summary>{t('任意の情報を追加')}</summary>{newFields.filter(f=>!f.required).map(fieldInput)}</details>}
        {canSave && <div className={styles.reuseBanner}>
          <div><strong>{t('次のAgentでも、この情報を使う')}</strong><p>{t(saveNext ? '新しい入力をNoahに暗号化して保存します。' : '新しい入力は、今回の送信だけに使います。')}</p></div>
          <button type="button" role="switch" aria-checked={saveNext} aria-label={t('新しい入力を保存して再利用')} className={styles.saveSwitch} disabled={busy} onClick={()=>setSaveNext(v=>!v)}><span aria-hidden="true"/>{t(saveNext ? '保存する' : '今回だけ')}</button>
          {saveNext && <p className={styles.saveFields}>{saveable.some(f=>values[f.key]?.trim()) && <>{saveable.filter(f=>values[f.key]?.trim()).map(f=>t(f.label)).join(' · ')}<br/></>}{t('保存情報の編集・再利用の停止は「登録情報」から。')}</p>}
        </div>}
        {provider.fields.some(f=>f.type==='password') && <p className={styles.hint}>{t('パスワードは登録先へ送り、Noahには保存しません。')}</p>}
        {canSave && saveNext && <details className={styles.terms}>
          <summary>{t('保存・再利用の同意内容を読む')}</summary>
          <p>{t(PROFILE_CONSENT_TEXT)}</p>
          {PROFILE_CONSENT_DETAILS.map(section=><p key={section.title}><strong>{t(section.title)}</strong><br/>{t(section.text)}</p>)}
        </details>}
        <div className={styles.disclosure}>
          <div><span>{t('送信先')}</span><p><strong>{provider.name}</strong><br/><bdi>{provider.providerOrigin}</bdi>{provider.executorOrigin !== provider.providerOrigin && <><br/>{provider.executorName} · <bdi>{provider.executorOrigin}</bdi></>}</p></div>
          <div><span>{t('料金')}</span><p>{t('この操作は外部サービスへの登録です。有料Agentの利用料は提供元の条件によります。')} <a href={provider.termsUrl} target="_blank" rel="noreferrer">{t('料金・利用条件を確認')} ↗</a></p></div>
        </div>
        {provider.notice && <p className={styles.providerNotice}>{provider.notice}</p>}
        <details className={styles.terms}><summary>{t('規約・送信情報')}</summary>
          <p>{t('送信先')}: {provider.name} ({provider.providerOrigin})</p><p>{provider.executorName} ({provider.executorOrigin})</p>
          <dl>{provider.fields.map(field=><div key={field.key}><dt>{t(field.label)}</dt><dd>{field.type==='password'?'••••••':shownValue(field.key)||'—'}</dd></div>)}</dl>
          <a href={provider.termsUrl} target="_blank" rel="noreferrer">{provider.name} · {t('利用規約')} ({provider.termsVersion})</a>
        </details>
        <div className={styles.continueArea}>
          <p className={styles.hint}>{t('登録ボタンで、規約と上記情報の送信に同意します。')}</p>
          <button className={styles.primary} type="submit" disabled={busy||vault.busy||missingRequired} aria-busy={busy || undefined}>{busy ? <NoahLoading compact label={t('準備しています…')}/> : t('同意して登録・続ける')}<ArrowRight size={17} aria-hidden="true"/></button>
          <p className={styles.hint}>{t('Noahの情報保存だけで、有料実行や支払いは始まりません。')}</p>
        </div>
      </section>
    </form>}
    {history.some(p=>p.id!==pending?.id)&&<details><summary>{t('以前の登録')}</summary>{history.filter(p=>p.id!==pending?.id).map((ticket,index)=><button key={ticket.id} disabled={busy} onClick={()=>restore(ticket)}>{t('登録の状況を確認')} {index+1}</button>)}</details>}
    <Link href="/noah#timeline">{t("タイムラインへ戻る")}</Link>
  </main>;
}
