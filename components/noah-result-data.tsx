'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { NOAH_DATA_POLICY, type NoahDataResponse, type NoahDataDetail } from '@/lib/noah-result-data-contract';
import { readOwnerScope, OWNER_SCOPE_HEADER } from '@/lib/owner-intent';
import type { ReactNode } from 'react';
import styles from './noah-result-data.module.css';

function download(value: BlobPart, name: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([value], { type })), link = document.createElement('a');
  link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
/** `phoneResults`: スマホから、接続した Agent（相手のサーバー）へ頼んで、成果が出た仕事（頁が渡す。無い人には何も出ない。docs/noah/spec-87-tool-agent.md の 11.9）。 */
export default function NoahResultData({ phoneResults, embedded=false }: { phoneResults?: ReactNode; embedded?:boolean } = {}) {
  const Heading=embedded?'h2':'h1';
  const [page, setPage] = useState<NoahDataResponse | null>(null), [detail, setDetail] = useState<NoahDataDetail | null>(null);
  const [view, setView] = useState('personal'), [query, setQuery] = useState(''), [search, setSearch] = useState('');
  const [includeText, setIncludeText] = useState(false), [files, setFiles] = useState<string[]>([]), [consent, setConsent] = useState(false);
  const [pending, setPending] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const session = useRef({ epoch: 0, scope: null as string | null, mounted: false, busy: false });
  const operation = useRef<{ key: string; id: string } | null>(null);
  const renderEpoch = session.current.epoch;
  const resetSelection = useCallback(() => { setIncludeText(false); setFiles([]); setConsent(false); setNotice(''); }, []);
  const erase = useCallback((preserveOperation = false) => {
    session.current.epoch++; session.current.scope = null; session.current.busy = false;
    if (!preserveOperation) operation.current = null;
    setPage(null); setDetail(null); resetSelection(); setPending(false);
    setView('personal'); setQuery(''); setSearch('');
  }, [resetSelection]);
  const request = useCallback(async function request(params: URLSearchParams, body?: unknown) {
    const { epoch, scope } = session.current;
    const response = await fetch(`/api/noah/data?${params}`, { cache: 'no-store', method: body ? 'POST' : 'GET', headers: { ...(scope ? { [OWNER_SCOPE_HEADER]: scope } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await response.json() as NoahDataResponse;
    if (!session.current.mounted || epoch !== session.current.epoch) throw Error('STALE');
    if (!response.ok || !readOwnerScope(data.ownerScope) || (scope && data.ownerScope !== scope)) {
      throw Error(data.error ?? 'アカウントを確認できません。読み直してください。');
    }
    session.current.scope = data.ownerScope;
    return data;
  }, []);
  async function perform(action: () => Promise<void>) {
    if (!session.current.mounted || session.current.busy || renderEpoch !== session.current.epoch) return;
    const epoch = session.current.epoch;
    session.current.busy = true; setPending(true); setError('');
    try { await action(); }
    catch (e) {
      if (session.current.mounted && epoch === session.current.epoch && !(e instanceof Error && e.message === 'STALE')) {
        // A failed refresh never leaves previous account contents available.
        erase(true);
        setError(e instanceof Error ? e.message : '成果を確認できません。接続を確認してください。');
      }
    } finally {
      if (session.current.mounted && epoch === session.current.epoch) { session.current.busy = false; setPending(false); }
    }
  }
  async function load(nextView = view, q = search, cursor = '') {
    const data = await request(new URLSearchParams({ view: nextView, q, ...(cursor ? { cursor } : {}) }));
    setPage(data); setDetail(null); resetSelection(); setView(nextView); setSearch(q);
  }
  useEffect(() => {
    const state = session.current;
    state.mounted = true;
    const refresh = () => {
      if (document.hidden) return;
      // Invalidate in-flight requests and callbacks from the previously visible account.
      erase(); setError(''); setView('personal'); setQuery(''); setSearch('');
      const epoch = session.current.epoch;
      session.current.busy = true; setPending(true);
      void request(new URLSearchParams()).then(data => setPage(data)).catch((e: unknown) => {
        if (session.current.mounted && epoch === session.current.epoch && !(e instanceof Error && e.message === 'STALE')) { erase(); setError('成果を確認できません。読み直してください。'); }
      }).finally(() => { if (session.current.mounted && epoch === session.current.epoch) { session.current.busy = false; setPending(false); } });
    };
    refresh();
    document.addEventListener('visibilitychange', refresh);
    return () => { document.removeEventListener('visibilitychange', refresh); state.mounted = false; state.epoch++; };
  }, [erase, request]);
  async function open(id: string) {
    const data = await request(new URLSearchParams({ view, id }));
    setDetail(data.detail ?? null); resetSelection();
  }
  async function exportResult(name?: string) {
    if (!detail) return;
    // Never export cached private data after the browser account changes or consent is withdrawn.
    const data = await request(new URLSearchParams({ view, id: detail.id })), fresh = data.detail;
    if (!fresh) throw Error('成果を確認できません。読み直してください。');
    if (name !== undefined) {
      const file = fresh.result.files.find(f => f.name === name);
      if (!file) throw Error('ファイルがありません。成果を読み直してください。');
      download(Uint8Array.from(atob(file.base64), c => c.charCodeAt(0)), file.name.split('/').at(-1)!, 'application/octet-stream');
    } else download(JSON.stringify(fresh, null, 2), `noah-result-${fresh.id}.json`);
  }
  async function share() {
    if (!detail || !consent || (!includeText && !files.length)) return;
    const input = { action: 'share', workId: detail.id, workRevision: detail.revision, policyVersion: NOAH_DATA_POLICY, includeText, files: [...files].sort(), consent: true };
    const key = `${session.current.scope}:${JSON.stringify(input)}`;
    if (operation.current?.key !== key) operation.current = { key, id: crypto.randomUUID() };
    const data = await request(new URLSearchParams(), { ...input, id: operation.current.id });
    setDetail({ ...detail, contribution: data.contribution }); resetSelection();
    setNotice(data.contribution?.state === 'revoked' ? 'この提供は取り消されています。' : '選択した成果を提供しました。');
  }
  async function revokeFromHistory(id: string) {
    await request(new URLSearchParams(), { action: 'revoke', id });
    await load('contributions');
    setNotice('運営向けの写しを削除しました。');
  }
  async function revoke() {
    if (!detail?.contribution) return;
    const data = await request(new URLSearchParams(), { action: 'revoke', id: detail.contribution.id });
    setDetail({ ...detail, contribution: data.contribution }); resetSelection(); setNotice('運営向けの写しを削除しました。元の成果は残っています。');
  }
  return <main className={styles.page}>
    <header><p>NOAH</p><Heading>Agentの成果データ</Heading><p>受け取った成果を探して、手元へ保存できます。選んだ成果だけをNoahの改善に提供することもできます。</p></header>
    {phoneResults}
    <p>ここにはWebに保存されたNoahのAgent成果を表示します。<Link href="/noah/saved?tab=files">ほかの保存した成果</Link> · <Link href="/noah/add/data">手元のファイルをまとめる</Link></p>
    {error && <p role="alert">{error} <Link href="/noah/account?returnTo=%2Fnoah%2Fdata">サインインを確認</Link></p>}
    <div className={styles.actions}>
      <button disabled={pending} onClick={() => { void perform(() => load()); }}>読み直す</button>
      {page && <>
        <button disabled={pending || view === 'personal'} onClick={() => { void perform(() => load('personal', '')); setQuery(''); }}>自分の成果</button>
        <button disabled={pending || view === 'contributions'} onClick={() => { void perform(() => load('contributions', '')); setQuery(''); }}>自分の提供履歴</button>
      </>}
      {page?.operatorAllowed && <button disabled={pending || view === 'operator'} onClick={() => { void perform(() => load('operator', '')); setQuery(''); }}>運営に提供された成果</button>}
    </div>
    <h2>{view === 'operator' ? '運営に提供された成果' : view === 'contributions' ? '自分の提供履歴' : '自分の成果'}</h2>
    {view === 'contributions' && <p>元の仕事を削除した後でも、ここで提供を取り消せます。取り消し済みの記録に成果の本文・ファイルは残りません。</p>}
    {view === 'operator' && <p>明示同意を受けた品質確認・不具合調査専用の成果です。学習・販売・一般公開には使えません。</p>}
    <form onSubmit={event => { event.preventDefault(); void perform(() => load(view, query)); }} className={styles.actions}>
      <label>本文・Agent・ファイル名 <input value={query} maxLength={80} onChange={event => setQuery(event.target.value)} /></label><button disabled={pending || !page}>検索</button>
    </form>
    {pending && <output>確認しています…</output>}
    {page?.items?.length === 0 && <p>{search ? '一致する成果はありません。' : view !== 'personal' ? '提供の記録はまだありません。' : '受け取った成果はまだありません。'}</p>}
    <ul className={styles.list}>{page?.items?.map(item => <li key={item.id}>{view === 'contributions' ? <>
      <span>{item.agentId} · {new Date(item.completedAt).toLocaleString('ja-JP')} · {item.state === 'active' ? '提供中' : '取り消し済み'}</span>
      {item.state === 'active' && <button disabled={pending} onClick={() => { void perform(() => revokeFromHistory(item.id)); }}>この提供を取り消す</button>}
    </> : <button disabled={pending} onClick={() => { void perform(() => open(item.id)); }}>{item.agentId} · {new Date(item.completedAt).toLocaleString('ja-JP')}</button>}</li>)}</ul>
    {page?.nextCursor && <button disabled={pending} onClick={() => { void perform(() => load(view, search, page.nextCursor!)); }}>次の20件</button>}
    {detail && <section className={styles.detail} aria-label="選んだ成果">
      <h2>{detail.result.agentId}</h2><p>版 {detail.result.version} · Agentから受け取った成果です。内容の正しさは未確認です。</p>
      {detail.result.exitCode !== 0 && <p>処理はエラーで終了しました。途中までの成果です。</p>}
      <pre>{detail.result.text || '本文はありません。'}</pre>
      <div className={styles.actions}><button disabled={pending} onClick={() => { void perform(() => exportResult()); }}>成果をJSONで保存</button>
        {detail.result.files.map(file => <button key={file.name} disabled={pending} onClick={() => { void perform(() => exportResult(file.name)); }}>{file.name} を保存（{file.bytes} bytes）</button>)}
      </div>
      {view === 'personal' && <section aria-label="運営への提供">
        <h3>Noahの品質確認・不具合調査へ提供</h3>
        <p>提供は任意です。提供しなくても成果を保存・利用できます。学習・販売・一般公開への提供は含みません。</p>
        {detail.contribution ? <><p>{detail.contribution.state === 'active' ? 'この成果は提供済みです。' : '提供は取り消し済みです。同じ成果の再提供はできません。'}</p>
          {detail.contribution.state === 'active' && <button disabled={pending} onClick={() => { void perform(revoke); }}>提供を取り消す</button>}</> : <>
          <p>上の本文とファイルを確認して、提供するものを選んでください。ファイルは保存して内容を確認できます。個人情報や秘密が含まれないことを確認してください。選んだ内容はそのまま運営へ提供されます。</p>
          <fieldset disabled={pending}><legend>提供する成果</legend>
            <label><input type="checkbox" checked={includeText} disabled={!detail.result.text} onChange={event => { setIncludeText(event.target.checked); setConsent(false); }} />本文を提供する</label>
            {detail.result.files.map(file => <label key={file.name}><input type="checkbox" checked={files.includes(file.name)} onChange={event => { setFiles(previous => event.target.checked ? [...previous, file.name] : previous.filter(name => name !== file.name)); setConsent(false); }} />{file.name}（{file.bytes} bytes）</label>)}
          </fieldset>
          <p>提供する内容: 本文{includeText ? 'あり' : 'なし'}、ファイル{files.length}件。Agent名・版・受領日時も含みます。依頼文は含めませんが、成果に書かれた依頼内容は含まれます。</p>
          <p>取り消すと運営向けの保存データを削除します。すでに運営が保存した写しは回収できません。同じ成果の再提供はできません。</p>
          <label><input type="checkbox" checked={consent} disabled={pending || (!includeText && !files.length)} onChange={event => setConsent(event.target.checked)} />選んだ成果と目的を確認し、運営への提供に同意します</label>
          <p><button disabled={pending || !consent || (!includeText && !files.length)} onClick={() => { void perform(share); }}>選択した成果を提供する</button></p>
        </>}
      </section>}
    </section>}
    {notice && <output>{notice}</output>}
  </main>;
}
