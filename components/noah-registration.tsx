'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Bot, ArrowRight, LockKeyhole } from 'lucide-react';
import type { RegistrationProvider, RegistrationStatus } from '@/lib/noah-registration-contract';
import styles from './noah-registration.module.css';
const STORAGE = 'noah-registration-work-v1';
type Pending = { id: string; key: string };
const labels = { running: '登録Agentが処理しています', needs_user: '本人による確認を待っています', completed: '登録Agentから完了報告が届きました', failed: '登録を完了できませんでした', unknown: '登録の結果を確認できていません' };
export default function NoahRegistration({ agentId }: { agentId: string }) {
  const [providers, setProviders] = useState<RegistrationProvider[] | null>(null), [selected, setSelected] = useState(''), [agent, setAgent] = useState(agentId);
  const [values, setValues] = useState<Record<string, string>>({}), [review, setReview] = useState(false), [consent, setConsent] = useState(false), [terms, setTerms] = useState(false);
  const [job, setJob] = useState<RegistrationStatus | null>(null), [pending, setPending] = useState<Pending | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [reload, setReload] = useState(0);
  const active = useRef({ generation: 0, mounted: false, busy: false });
  const provider = providers?.find(p => p.id === selected), generation = active.current.generation;
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
      if (start) {
        const key = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
        ticket = { id: crypto.randomUUID(), key };
        setPending(ticket);
        try { sessionStorage.setItem(STORAGE, JSON.stringify(ticket)); } catch { /* In-memory operation still works. */ }
      }
      if (!ticket) return;
      const response = await fetch(`/api/noah/registration${start ? '' : `?job=${encodeURIComponent(ticket.id)}`}`, {
        method: start ? 'POST' : 'GET', cache: 'no-store', headers: { 'X-Noah-Registration-Key': ticket.key, ...(start ? { 'Content-Type': 'application/json' } : {}) },
        ...(start ? { body: JSON.stringify({ action: 'start', id: ticket.id, providerId: provider!.id, agentId: agent, revision: provider!.revision, termsVersion: provider!.termsVersion, values, consent: true, termsAccepted: true }) } : {}),
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
  function clear() {
    if (active.current.busy) return;
    active.current.generation++; setJob(null); setPending(null); setValues({}); setReview(false); setConsent(false); setTerms(false); setError('');
    try { sessionStorage.removeItem(STORAGE); } catch { /* Private mode. */ }
  }
  return <main className={styles.page}>
    <header><span className={styles.badge}><Bot size={17} />NOAH REGISTRATION AGENT</span><h1>登録が必要なら、ここで準備。</h1><p>使いたい外部Agentの必要項目を入力してください。内容を確認して、登録Agentに手続きを依頼できます。</p><small>Noahの会員登録は不要です。</small></header>
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
      <section className={styles.panel}><h2>1. 登録先と必要項目</h2><label>登録するサービス<select value={selected} disabled={busy || review} onChange={e => { setSelected(e.target.value); setAgent(agentId || providers?.find(p => p.id === e.target.value)?.agentIds[0] || ''); setValues({}); setConsent(false); setTerms(false); }}>
        {providers?.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select></label>{!agentId && <label>使うAgent<select value={agent} disabled={busy || review} onChange={e => { setAgent(e.target.value); setValues({}); setConsent(false); setTerms(false); }}>{provider.agentIds.map(id => <option key={id} value={id}>{id}</option>)}</select></label>}
      {provider.fields.map(field => <label key={field.key}>{field.label}{field.required ? '（必須）' : '（任意）'}<input type={field.type} name={field.key} required={field.required} maxLength={field.maxLength} value={values[field.key] ?? ''} readOnly={review} disabled={busy} autoComplete={field.type === 'password' ? 'new-password' : field.type === 'email' ? 'email' : 'off'} onChange={e => setValues(v => ({ ...v, [field.key]: e.target.value }))} /></label>)}
      <p className={styles.hint}><LockKeyhole size={15} />入力内容は登録処理にだけ使い、Noahの仕事履歴には保存しません。</p></section>
      {review && <section className={styles.panel}><h2>2. 送信する内容を確認</h2><p>登録先：{provider.name}（{provider.providerOrigin}）</p><p>処理する登録Agent：{provider.executorName}（{provider.executorOrigin}）</p>
        <dl>{provider.fields.map(field => <div key={field.key}><dt>{field.label}</dt><dd>{field.type === 'password' ? (values[field.key] ? '入力済み（表示しません）' : '未入力') : values[field.key] || '未入力'}</dd></div>)}</dl>
        <p>この登録Agentへ入力内容を渡し、指定した外部サービスへの登録を依頼します。本人確認が必要な場合は、途中であなたの操作を待ちます。</p>
        <label className={styles.check}><input type="checkbox" checked={consent} disabled={busy} onChange={e => setConsent(e.target.checked)} />送信先と内容を確認し、登録Agentへこの情報を渡して登録を依頼します</label>
        <label className={styles.check}><input type="checkbox" checked={terms} disabled={busy} onChange={e => setTerms(e.target.checked)} /><span><a href={provider.termsUrl} target="_blank" rel="noreferrer">{provider.name}の利用規約</a>（{provider.termsVersion}）を確認し、同意します</span></label>
        <button type="button" disabled={busy} onClick={() => { setReview(false); setConsent(false); setTerms(false); }}>入力内容を修正する</button>
      </section>}
      <button className={styles.primary} type="submit" disabled={busy || (review && (!consent || !terms))}>{busy ? '依頼しています…' : review ? 'この情報で登録Agentを実行' : '送信する内容を確認'}<ArrowRight size={17} /></button>
    </form>}
    <p className={styles.footnote}>このブラウザで登録の仕事を確認できます。保存・引き継ぎ機能を使うためのNoahアカウントとは別の手続きです。</p><Link href="/noah#timeline">タイムラインへ戻る</Link>
  </main>;
}
