'use client';
/**
 * ボードの頁（task 115）。/noah/boards: 本人のボードとフォロー中のボード。/noah/boards/<id>: 1 つのボード（持ち主か、公開のボード）。
 * 持ち主は、名前・公開の切り替え・消すができる。他の人の公開ボードは、フォローできる。
 * 仕様: docs/noah/spec-115-pin-grid.md の 3 章・5 章。
 */
import { noahSignInHref } from '@/lib/noah-navigation';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { NOAH_PIN_TEXT, noahPinInitials, type NoahPinTopic } from '@/lib/noah-pins';
import NoahPinGrid, { type NoahPinView } from './noah-pin-grid';
import styles from './noah-pins.module.css';

type Board = { id: string; name: string; visibility: 'private' | 'public'; pins: number; followers: number; revision: number; mine: boolean; following: boolean; covers: { id: string; name: string; topic: NoahPinTopic }[] };

function Collage({ board }: { board: Board }) {
  const covers = [...board.covers, ...Array.from({ length: 3 }, () => null)].slice(0, 3);
  return <span className={styles.collage} aria-hidden="true">{covers.map((cover, index) => <span key={cover?.id ?? `empty-${index}`} className={styles.tone} data-topic={cover?.topic ?? 'other'}>{cover ? noahPinInitials(cover.name) : ''}</span>)}</span>;
}
const boardCards = (boards: Board[]) => <ul className={styles.boardCards}>{boards.map((board) => <li key={board.id} className={styles.boardCard}>
  <Link href={`/noah/saved?board=${encodeURIComponent(board.id)}`}><Collage board={board} /><strong>{board.name}</strong><small>{board.pins} 件 · {board.visibility === 'public' ? `公開${board.followers ? ` · フォロー ${board.followers}` : ''}` : '自分だけ'}</small></Link>
</li>)}</ul>;

export function NoahBoardsPage({embedded=false}:{embedded?:boolean}={}) {
  const Heading=embedded?'h2':'h1';
  const [state, setState] = useState<{ status: 'loading' | 'ready' | 'signin' | 'closed' | 'error'; mine: Board[]; following: Board[] }>({ status: 'loading', mine: [], following: [] });
  useEffect(() => {
    void fetch('/api/noah/boards', { cache: 'no-store' }).then(async (response) => {
      const body = await response.json() as { mine?: Board[]; following?: Board[] };
      if (response.status === 401) setState((old) => ({ ...old, status: 'signin' }));
      else if (response.status === 404) setState((old) => ({ ...old, status: 'closed' }));
      else if (!response.ok || !Array.isArray(body.mine)) setState((old) => ({ ...old, status: 'error' }));
      else setState({ status: 'ready', mine: body.mine, following: body.following ?? [] });
    }).catch(() => setState((old) => ({ ...old, status: 'error' })));
  }, []);
  return <main className={styles.boardsPage}>
    <Heading>{NOAH_PIN_TEXT.boards}</Heading>
    <p className={styles.boardsLead}>ホームの Agent の「保存」で、ボードを作って集めます。公開したボードは、他の人がフォローできます。</p>
    {state.status === 'loading' && <p className={styles.status}><output>{NOAH_PIN_TEXT.more}</output></p>}
    {state.status === 'signin' && <p className={styles.status}><a href={noahSignInHref('/noah/saved?tab=boards')}>{NOAH_PIN_TEXT.signIn}</a></p>}
    {state.status === 'closed' && <p className={styles.status}>{NOAH_PIN_TEXT.closed}</p>}
    {state.status === 'error' && <p className={styles.status} role="alert">ボードを読めませんでした。少し後で開き直してください。</p>}
    {state.status === 'ready' && <>
      <h2>{NOAH_PIN_TEXT.myBoards}</h2>
      {state.mine.length ? boardCards(state.mine) : <p className={styles.boardsLead}>まだボードがありません。<Link href="/noah">ホーム</Link>で Agent を保存してみてください。</p>}
      {state.following.length > 0 && <><h2>{NOAH_PIN_TEXT.following}</h2>{boardCards(state.following)}</>}
    </>}
  </main>;
}

export function NoahBoardPage({ id }: { id: string }) {
  const [board, setBoard] = useState<Board | null>(null), [items, setItems] = useState<NoahPinView[]>([]), [cursor, setCursor] = useState<string | null>(null);
  const [ownerScope, setOwnerScope] = useState<string | null>(null), [status, setStatus] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const [error, setError] = useState(''), [pending, setPending] = useState(false), [name, setName] = useState(''), [more, setMore] = useState(false);
  // 「このボードに合う Agent」（ボードの保存を起点にしたおすすめ）。ボードごとに違う物が出る。
  const [picks, setPicks] = useState<NoahPinView[] | null>(null), [picksFor, setPicksFor] = useState(0);
  const sentinel = useRef<HTMLDivElement>(null);
  /** 読むだけ（状態は変えない）。 */
  async function fetchBoard(next: string | null) {
    const response = await fetch(`/api/noah/boards?id=${encodeURIComponent(id)}${next ? `&cursor=${encodeURIComponent(next)}` : ''}`, { cache: 'no-store' });
    return { status: response.status, body: await response.json() as { board?: Board; items?: NoahPinView[]; nextCursor?: string | null; ownerScope?: string | null } };
  }
  /** 読んだ物を、画面の状態に入れる。 */
  function apply(next: string | null, { status: code, body }: Awaited<ReturnType<typeof fetchBoard>>) {
    if (code === 404) { setStatus('missing'); return; }
    if (code !== 200 || !body.board || !Array.isArray(body.items)) { setStatus('error'); return; }
    const found = body.board, added = body.items;
    setBoard(found); setName((old) => old || found.name); setOwnerScope(body.ownerScope ?? null); setCursor(body.nextCursor ?? null);
    setItems((old) => (next ? [...old, ...added.filter((item) => !old.some((seen) => seen.id === item.id))] : added));
    setStatus('ready');
  }
  const load = (next: string | null) => fetchBoard(next).then((reply) => apply(next, reply));
  useEffect(() => {
    let stopped = false;
    void fetchBoard(null).then((reply) => { if (!stopped) apply(null, reply); }).catch(() => { if (!stopped) setStatus('error'); });
    return () => { stopped = true; };
    // 読み直すのは、ボードが変わった時。
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  useEffect(() => {
    let stopped = false;
    void fetch(`/api/noah/pins?board=${encodeURIComponent(id)}`, { cache: 'no-store' }).then(async (response) => {
      const body = await response.json() as { items?: NoahPinView[] };
      if (!stopped) setPicks(response.ok && Array.isArray(body.items) ? body.items : null);
    }).catch(() => { if (!stopped) setPicks(null); });
    return () => { stopped = true; };
  }, [id, picksFor]);
  useEffect(() => {
    const target = sentinel.current;
    if (!target || typeof IntersectionObserver === 'undefined' || !cursor) return;
    const observer = new IntersectionObserver((entries) => { if (entries.some((entry) => entry.isIntersecting) && !more) { setMore(true); void load(cursor).finally(() => setMore(false)); } }, { rootMargin: '600px' });
    observer.observe(target);
    return () => observer.disconnect();
    // 見張り直すのは、続きの印が変わった時。
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor, more]);
  async function send(body: Record<string, unknown>) {
    setPending(true); setError('');
    try {
      const response = await fetch('/api/noah/boards', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Rock-Owner-Scope': ownerScope ?? '' }, body: JSON.stringify(body) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw Error(result.error ?? '保存できません。');
      return true;
    } catch (e) { setError(e instanceof Error ? e.message : '保存できません。'); return false; } finally { setPending(false); }
  }
  if (status === 'loading') return <main className={styles.boardsPage}><p className={styles.status}><output>{NOAH_PIN_TEXT.more}</output></p></main>;
  if (status === 'missing') return <main className={styles.boardsPage}><p className={styles.status}>ボードが見つかりません（非公開か、消されました）。</p></main>;
  if (status === 'error' || !board) return <main className={styles.boardsPage}><p className={styles.status} role="alert">ボードを読めませんでした。</p></main>;
  return <main className={styles.boardsPage}>
    <div className={styles.boardHead}>
      <h1>{board.name}</h1>
      <small>{board.pins} 件 · {board.visibility === 'public' ? `公開 · フォロー ${board.followers}` : '自分だけ'}</small>
      {!board.mine && ownerScope && board.visibility === 'public' && <button type="button" disabled={pending} data-on={board.following || undefined}
        onClick={() => { void send({ action: board.following ? 'unfollow' : 'follow', id: board.id }).then((ok) => ok && setBoard({ ...board, following: !board.following, followers: board.followers + (board.following ? -1 : 1) })); }}>
        {board.following ? NOAH_PIN_TEXT.unfollow : NOAH_PIN_TEXT.follow}</button>}
    </div>
    {board.mine && <form className={styles.boardEdit} onSubmit={(event) => { event.preventDefault(); void send({ action: 'update', id: board.id, revision: board.revision, name }).then((ok) => { if (ok) void load(null); }); }}>
      <input aria-label={NOAH_PIN_TEXT.boardName} value={name} maxLength={40} onChange={(event) => setName(event.target.value)} />
      <button type="submit" disabled={pending || !name.trim() || name.trim() === board.name}>名前を変える</button>
      <label><input type="checkbox" checked={board.visibility === 'public'} disabled={pending} onChange={(event) => { void send({ action: 'update', id: board.id, revision: board.revision, visibility: event.target.checked ? 'public' : 'private' }).then((ok) => { if (ok) void load(null); }); }} />公開する</label>
      <button type="button" className={styles.danger} disabled={pending} onClick={() => { if (window.confirm(`ボード「${board.name}」を消しますか？中の保存も消えます（Agent は消えません）。`)) void send({ action: 'remove', id: board.id, revision: board.revision }).then((ok) => { if (ok) window.location.href = '/noah/saved'; }); }}>ボードを消す</button>
    </form>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {items.length === 0 ? <p className={styles.status}>{NOAH_PIN_TEXT.boardEmpty}</p>
      : <NoahPinGrid items={items} signedIn={ownerScope !== null} ownerScope={ownerScope}
        onChange={(familyId, savedIn) => { setItems((old) => (board.mine && !savedIn.includes(board.id) ? old.filter((item) => item.id !== familyId) : old.map((item) => (item.id === familyId ? { ...item, savedIn } : item)))); setPicksFor((n) => n + 1); }} />}
    {cursor && <div ref={sentinel} className={styles.moreRow}><button type="button" disabled={more} onClick={() => { setMore(true); void load(cursor).finally(() => setMore(false)); }}>{more ? NOAH_PIN_TEXT.more : '続きを読む'}</button></div>}
    {picks && picks.length > 0 && <section className={styles.related} aria-labelledby="noah-board-picks">
      <h2 id="noah-board-picks">{NOAH_PIN_TEXT.boardPicks}</h2>
      <p className={styles.status}>{NOAH_PIN_TEXT.boardPicksNote}</p>
      <NoahPinGrid items={picks} signedIn={ownerScope !== null} ownerScope={ownerScope}
        onChange={(familyId, savedIn) => { setPicks((old) => old?.map((item) => (item.id === familyId ? { ...item, savedIn } : item)) ?? null); if (savedIn.includes(board.id)) { void load(null); setPicksFor((n) => n + 1); } }} />
    </section>}
  </main>;
}
