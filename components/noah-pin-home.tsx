'use client';
/**
 * Noah のホーム（task 115。ピンタレスト風）。今動かせる Agent を、グリッドで眺めて、ボードへ保存する。
 * 並びはサーバーが決める（GET /api/noah/pins。学習なし）。上の帯の検索（?q=）は、取り込んだ一覧の語の検索（GET /api/noah/intake?q=）。
 * 一覧がまだ公開されていない間（入口が 404）は、fallback（今のタイムライン）を出す。審査者には、閉じていてもグリッドが出る。
 * 仕様: docs/noah/spec-115-pin-grid.md の 3 章。
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { NOAH_PIN_TEXT, noahPinShape, noahPinTopic } from '@/lib/noah-pins';
import NoahPinGrid, { type NoahPinView } from './noah-pin-grid';
import styles from './noah-pins.module.css';

type Reply = { items?: NoahPinView[]; nextCursor?: string | null; ownerScope?: string | null; error?: string };
type State = { key: string | null; status: 'loading' | 'ready' | 'closed' | 'error'; items: NoahPinView[]; cursor: string | null; ownerScope: string | null; more: boolean };

/** 取り込んだ一覧の検索の 1 件を、グリッドの 1 枚にする（分野と形は、画面で決める。保存の印は、詳細で見る）。 */
const fromSearch = (item: Omit<NoahPinView, 'topic' | 'shape' | 'savedIn'>): NoahPinView => ({ ...item, topic: noahPinTopic(item.name, item.summary), shape: noahPinShape(item.id), savedIn: [] });

export default function NoahPinHome({ fallback }: { fallback: ReactNode }) {
  const [query, setQuery] = useState<string | null>(null), [stored, setState] = useState<State>({ key: null, status: 'loading', items: [], cursor: null, ownerScope: null, more: false });
  // 読んだ物は、どの検索の語の物かと一緒に持つ。語が変わったら、届くまでは「読み込み中」。
  const state: State = stored.key === query ? stored : { key: query, status: 'loading', items: [], cursor: null, ownerScope: stored.ownerScope, more: false };
  const sentinel = useRef<HTMLDivElement>(null), epoch = useRef(0);
  useEffect(() => {
    const read = () => setQuery(new URLSearchParams(window.location.search).get('q')?.trim().slice(0, 80) || '');
    read();
    window.addEventListener('popstate', read);
    return () => window.removeEventListener('popstate', read);
  }, []);
  async function load(cursor: string | null) {
    const url = query ? `/api/noah/intake?q=${encodeURIComponent(query)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}` : `/api/noah/pins${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`;
    const response = await fetch(url, { cache: 'no-store' });
    const body = await response.json() as Reply;
    return { status: response.status, body: { ...body, items: query ? body.items?.map((item) => fromSearch(item)) : body.items } };
  }
  useEffect(() => {
    if (query === null) return;
    const current = ++epoch.current, key = query;
    const empty = { key, items: [], cursor: null, more: false };
    void load(null).then(({ status, body }) => {
      if (current !== epoch.current) return;
      if (status === 404) { setState({ ...empty, status: 'closed', ownerScope: null }); return; }
      if (status !== 200 || !Array.isArray(body.items)) { setState({ ...empty, status: 'error', ownerScope: null }); return; }
      setState({ key, status: 'ready', items: body.items, cursor: body.nextCursor ?? null, ownerScope: body.ownerScope ?? null, more: false });
    }).catch(() => { if (current === epoch.current) setState({ ...empty, status: 'error', ownerScope: null }); });
    // 読み直すのは、検索の語が変わった時。
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);
  function more() {
    if (state.status !== 'ready' || !state.cursor || state.more) return;
    const current = epoch.current, cursor = state.cursor;
    setState((old) => ({ ...old, more: true }));
    void load(cursor).then(({ status, body }) => {
      if (current !== epoch.current) return;
      if (status !== 200 || !Array.isArray(body.items)) { setState((old) => ({ ...old, more: false, cursor: null })); return; }
      const added = body.items;
      setState((old) => ({ ...old, more: false, cursor: body.nextCursor ?? null, items: [...old.items, ...added.filter((item) => !old.items.some((seen) => seen.id === item.id))] }));
    }).catch(() => { if (current === epoch.current) setState((old) => ({ ...old, more: false })); });
  }
  // 下まで来たら、続きを読む（見張りが使えない端末では、ボタンで）。
  useEffect(() => {
    const target = sentinel.current;
    if (!target || typeof IntersectionObserver === 'undefined' || !state.cursor) return;
    const observer = new IntersectionObserver((entries) => { if (entries.some((entry) => entry.isIntersecting)) more(); }, { rootMargin: '800px' });
    observer.observe(target);
    return () => observer.disconnect();
    // 見張り直すのは、続きの印が変わった時。
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [state.cursor, state.more]);
  async function hide(id: string) {
    const response = await fetch('/api/noah/boards', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Rock-Owner-Scope': state.ownerScope ?? '' }, body: JSON.stringify({ action: 'hide', familyId: id }) });
    if (response.ok) setState((old) => ({ ...old, items: old.items.filter((item) => item.id !== id) }));
  }

  if (state.status === 'closed' && !query) return <>{fallback}</>;
  const signedIn = state.ownerScope !== null;
  return <main className={styles.home}>
    <h1 className={styles.srOnly}>Noah</h1>
    {query && <p className={styles.searchNote}>「{query}」の Agent <Link href="/noah">すべてに戻る</Link></p>}
    {state.status === 'loading' && <p className={styles.status}><output>{NOAH_PIN_TEXT.more}</output></p>}
    {state.status === 'closed' && <p className={styles.status}>{NOAH_PIN_TEXT.closed}</p>}
    {state.status === 'error' && <p className={styles.status} role="alert">一覧を読めませんでした。少し後で開き直してください。</p>}
    {state.status === 'ready' && (state.items.length === 0 ? <p className={styles.status}>{query ? '見つかりませんでした。別の語で探してください。' : NOAH_PIN_TEXT.empty}</p>
      : <NoahPinGrid items={state.items} signedIn={signedIn} ownerScope={state.ownerScope}
        onChange={(id, savedIn) => setState((old) => ({ ...old, items: old.items.map((item) => (item.id === id ? { ...item, savedIn } : item)) }))}
        onHide={(id) => { void hide(id); }} />)}
    {state.status === 'ready' && state.cursor && <div ref={sentinel} className={styles.moreRow}><button type="button" disabled={state.more} onClick={more}>{state.more ? NOAH_PIN_TEXT.more : '続きを読む'}</button></div>}
  </main>;
}
