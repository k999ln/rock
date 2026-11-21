'use client';
/**
 * 「すぐ使える Agent」の一覧（/noah/ready）。相手のサーバーで動き、握手が通った物だけが並ぶ。スマホだけで、選んで、つなげる。
 * 上から: 語で探す／棚（shelf。運営が確かめた仕事のカード。探している間は出さない）／つながっているもの・つながっていないもの（サインイン済みで、切っていない接続がある時）／動いた／まだ誰も動かしていない／出どころ。
 * 並びと、載せるかどうかは、サーバーが決める（GET /api/noah/intake）。ここは、返った順に出すだけ。
 * 仕様: docs/noah/spec-74-one-click-connect.md の 11.5、spec-88-mass-probe.md の 9.6。
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { NOAH_REPORT_CONTACT } from '@/lib/noah-bot-notice';
import { NOAH_READY_TEXT, noahConnectionStateText, noahReadyDetailHref, type NoahReadyConnection, type NoahReadyItem } from '@/lib/noah-ready-view';
import { useNoahLocale } from './noah-locale';
import { Package, FileText, Search, Tag } from 'lucide-react';
import ui from './noah-unified.module.css';
import NoahLoading from './noah-loading';
import NoahCard from './noah-card';
import base from './noah-service.module.css';
import styles from './noah-ready.module.css';

type ListReply = { items?: NoahReadyItem[]; nextCursor?: string | null; counts?: { ran: number; new: number }; ownerScope?: string | null; error?: string };
type Mine = NoahReadyConnection & { agentId: string; name: string; placeLabel: string | null };
/** つなげる数を、料金ごとのカードの数にしている時だけ、入口が返す（task 113）。 */
type Cards = { live: number; limit: number };
type Page = { state: 'loading' | 'ready' | 'closed' | 'error'; items: NoahReadyItem[]; nextCursor: string | null; counts: { ran: number; new: number } | null; ownerScope: string | null; more: boolean };
const EMPTY: Page = { state: 'loading', items: [], nextCursor: null, counts: null, ownerScope: null, more: false };

/** shelf: 一番上に出す棚（app/noah/ready/page.tsx が components/noah-shelf.tsx を渡す）。探している間は出さない。 */
export default function NoahReady({ shelf, initialQuery = '' }: { shelf?: ReactNode; initialQuery?: string } = {}) {
  const {t}=useNoahLocale();
  // 読んだ頁は、どの問い合わせ（探す語・絞り込み・やり直し）の物かと一緒に持つ。問い合わせが変わったら、届くまでは「読み込み中」。
  const [result, setResult] = useState<{ key: string; page: Page } | null>(null), [mineOf, setMineOf] = useState<{ scope: string; list: Mine[]; cards: Cards | null } | null>(null);
  const [query, setQuery] = useState(initialQuery.slice(0, 80)), [search, setSearch] = useState(''), [oneTap, setOneTap] = useState(false), [attempt, setAttempt] = useState(0);
  const epoch = useRef(0), sentinel = useRef<HTMLDivElement | null>(null);
  const key = `${search}\n${oneTap ? 1 : 0}\n${attempt}`;
  const page: Page = result?.key === key ? result.page : { ...EMPTY, ownerScope: result?.page.ownerScope ?? null };
  const setPage = (next: Page | ((old: Page) => Page)) => setResult((old) => {
    const current = old?.key === key ? old.page : EMPTY;
    return { key, page: typeof next === 'function' ? next(current) : next };
  });

  // 語の欄は、打ち終わって 300 ミリ秒してから読む。2 文字より短い語では、探さない。
  useEffect(() => {
    const word = query.trim(), timer = setTimeout(() => setSearch(Array.from(word).length >= 2 ? word.slice(0, 80) : ''), 300);
    return () => clearTimeout(timer);
  }, [query]);

  async function read(cursor: string | null) {
    const params = new URLSearchParams({ ...(search ? { q: search } : {}), ...(oneTap && !search ? { oneTap: '1' } : {}), ...(cursor ? { cursor } : {}) });
    const response = await fetch(`/api/noah/intake?${params.toString()}`, { cache: 'no-store' });
    return { status: response.status, body: await response.json() as ListReply };
  }
  // 最初の頁。探す語・絞り込みが変わるたびに、読み直す。前の応答が後から届いても、使わない。
  useEffect(() => {
    const current = ++epoch.current;
    void read(null).then(({ status, body }) => {
      if (current !== epoch.current) return;
      if (status === 404) { setPage({ ...EMPTY, state: 'closed' }); return; }
      if (status !== 200 || !Array.isArray(body.items)) { setPage({ ...EMPTY, state: 'error' }); return; }
      setPage({ state: 'ready', items: body.items, nextCursor: body.nextCursor ?? null, counts: body.counts ?? null, ownerScope: body.ownerScope ?? null, more: false });
    }).catch(() => { if (current === epoch.current) setPage({ ...EMPTY, state: 'error' }); });
    // 読み直すのは、探す語・絞り込み・やり直しが変わった時。
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [search, oneTap, attempt]);

  function more() {
    if (page.state !== 'ready' || !page.nextCursor || page.more) return;
    const current = epoch.current, cursor = page.nextCursor;
    setPage((old) => ({ ...old, more: true }));
    void read(cursor).then(({ status, body }) => {
      if (current !== epoch.current) return;
      if (status !== 200 || !Array.isArray(body.items)) { setPage((old) => ({ ...old, more: false, nextCursor: null })); return; }
      const added = body.items;
      setPage((old) => ({ ...old, more: false, nextCursor: body.nextCursor ?? null, items: [...old.items, ...added.filter((item) => !old.items.some((seen) => seen.id === item.id))] }));
    }).catch(() => { if (current === epoch.current) setPage((old) => ({ ...old, more: false })); });
  }
  // 下まで来たら、続きを読む。見張りが使えない端末では、「続きを読む」のボタンだけで読める。
  useEffect(() => {
    const target = sentinel.current;
    if (!target || typeof IntersectionObserver === 'undefined' || !page.nextCursor) return;
    const observer = new IntersectionObserver((entries) => { if (entries.some((entry) => entry.isIntersecting)) more(); }, { rootMargin: '400px' });
    observer.observe(target);
    return () => observer.disconnect();
    // 見張り直すのは、続きの印が変わった時。
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [page.nextCursor, page.more]);

  // サインイン済みの時だけ、その本人の接続を読む（一覧のカードの「頼む」と、上の段に使う）。
  const scope = page.ownerScope, signedIn = scope !== null;
  useEffect(() => {
    if (scope === null) return;
    let stopped = false;
    void fetch('/api/noah/connect', { cache: 'no-store' }).then(async (response) => {
      const body = await response.json() as { connections?: Mine[]; cards?: Cards };
      const list = body.connections;
      if (!stopped && response.status === 200 && Array.isArray(list)) setMineOf({ scope, list, cards: body.cards && Number.isSafeInteger(body.cards.live) && Number.isSafeInteger(body.cards.limit) ? body.cards : null });
    }).catch(() => undefined);
    return () => { stopped = true; };
  }, [scope]);
  // 別の account の接続を、混ぜない。
  const mine = mineOf !== null && mineOf.scope === scope ? mineOf.list : [];
  const planCards = mineOf !== null && mineOf.scope === scope ? mineOf.cards : null;
  const setMine = (next: (old: Mine[]) => Mine[]) => { if (scope !== null) setMineOf((old) => ({ scope, list: next(old !== null && old.scope === scope ? old.list : []), cards: old !== null && old.scope === scope ? old.cards : null })); };

  const connectionOf = (agentId: string) => mine.find((connection) => connection.agentId === agentId) ?? null;
  const changed = (item: NoahReadyItem) => (connection: NoahReadyConnection) => setMine((old) => [
    { ...connection, agentId: item.id, name: item.name, placeLabel: item.connect.placeLabel },
    ...old.filter((other) => other.agentId !== item.id),
  ]);
  const cards = (items: NoahReadyItem[]) => <div className={styles.cards}>{items.map((item) => <NoahCard key={item.id} item={item} signedIn={signedIn} ownerScope={page.ownerScope} connection={connectionOf(item.id)} onChange={changed(item)} />)}</div>;
  const ran = page.items.filter((item) => item.section === 'ran'), fresh = page.items.filter((item) => item.section === 'new');
  // 切っていない接続。つながっている物と、そうでない物（失敗・途中・取り下げ）を、分けて出す（見出しと中身を、合わせる）。
  const live = mine.filter((connection) => connection.state !== 'disconnected');
  const working = live.filter((connection) => connection.state === 'connected'), broken = live.filter((connection) => connection.state !== 'connected');

  return <main className={`${base.page} ${styles.page}`}>
    <header className={ui.heading}><h1>{t('Agent')}</h1></header>
    {page.state === 'closed' ? <p className={base.empty}>{t(NOAH_READY_TEXT.closed)}</p> : <>
      <search>
        <label className={base.search}><span className={base.srOnly}>{t("語で探す")}</span><input type="search" value={query} maxLength={80} placeholder={t('何を頼みますか？')} onChange={(event) => setQuery(event.target.value)} /></label>
        {!search && <fieldset className={styles.filters}>
          <legend className={base.srOnly}>{t("絞り込み")}</legend>
          <button type="button" aria-pressed={!oneTap} onClick={() => setOneTap(false)}>{t("すべて")}</button>
          <button type="button" aria-pressed={oneTap} onClick={() => setOneTap(true)}>{t("押すだけで試せる")}</button>
        </fieldset>}
      </search>

      <div className={ui.purposes}>{([{label:'商品紹介',query:'image',Icon:Package},{label:'文章作成',query:'text',Icon:FileText},{label:'調べもの',query:'search',Icon:Search},{label:'出品準備',query:'commerce',Icon:Tag}]).map(item=><button type="button" key={item.label} aria-pressed={query===item.query} onClick={()=>setQuery(query===item.query?'':item.query)}><item.Icon size={25}/><strong>{t(item.label)}</strong></button>)}</div>
      {!search&&shelf&&<details className={styles.curated}><summary>{t('関連するAgent')}</summary>{shelf}</details>}

      {working.length > 0 && !search && <section className={styles.section} aria-labelledby="noah-ready-connected">
        <h2 id="noah-ready-connected">{t(NOAH_READY_TEXT.connected)}{planCards ? <small>{planCards.limit} {t("個のうち")} {planCards.live} {t("個")}</small> : null}</h2>
        <ul className={styles.connections}>{working.map((connection) => <li key={connection.id}>
          <span className={styles.connectionName}><strong>{connection.name}</strong><small>{t(connection.placeLabel ?? '')}</small></span>
          <Link className={styles.secondary} href={noahReadyDetailHref(connection.agentId)}>{t("頼む")}</Link>
        </li>)}</ul>
      </section>}
      {broken.length > 0 && !search && <section className={styles.section} aria-labelledby="noah-ready-broken">
        <h2 id="noah-ready-broken">{t(NOAH_READY_TEXT.notConnected)}</h2>
        <ul className={styles.connections}>{broken.map((connection) => <li key={connection.id}>
          <span className={styles.connectionName}><strong>{connection.name}</strong><small>{t(noahConnectionStateText(connection.state))}</small></span>
          <Link className={styles.secondary} href={noahReadyDetailHref(connection.agentId)}>{t("開く")}</Link>
        </li>)}</ul>
      </section>}

      {page.state === 'loading' && <p className={base.loading}><NoahLoading label={t("読み込んでいます…")} /></p>}
      {page.state === 'error' && <div className={base.empty} role="alert"><p>{t(NOAH_READY_TEXT.unavailable)}</p><button type="button" onClick={() => setAttempt((n) => n + 1)}>{t("読み直す")}</button></div>}
      {page.state === 'ready' && (search ? <section className={styles.section} aria-labelledby="noah-ready-found">
        <h2 id="noah-ready-found">{t(NOAH_READY_TEXT.found)}</h2>
        {page.items.length === 0 ? <p className={base.empty}>{t(NOAH_READY_TEXT.notFound)}</p> : cards(page.items)}
      </section> : page.items.length === 0 ? <p className={base.empty}>{t(NOAH_READY_TEXT.empty)}</p> : <>
        {ran.length > 0 && <section className={styles.section} aria-labelledby="noah-ready-ran">
          <h2 id="noah-ready-ran">{t(NOAH_READY_TEXT.ran)}{page.counts ? <small>{page.counts.ran} {t("件")}</small> : null}</h2>
          <p className={styles.sectionNote}>{t(NOAH_READY_TEXT.ranNote)}</p>
          {cards(ran)}
        </section>}
        {fresh.length > 0 && <section className={styles.section} aria-labelledby="noah-ready-new">
          <h2 id="noah-ready-new">{t(NOAH_READY_TEXT.fresh)}{page.counts ? <small>{page.counts.new} {t("件")}</small> : null}</h2>
          <p className={styles.sectionNote}>{t(NOAH_READY_TEXT.freshNote)}</p>
          {cards(fresh)}
        </section>}
      </>)}
      {page.state === 'ready' && page.nextCursor && <div ref={sentinel} className={styles.more}><button type="button" className={styles.secondary} disabled={page.more} onClick={more}>{page.more ? <NoahLoading compact label={t("読み込んでいます…")} /> : t("続きを読む")}</button></div>}

      <footer className={styles.source}>
        <p>{t(NOAH_READY_TEXT.source)}{NOAH_REPORT_CONTACT && <> <Link href="/noah/help#bot">{t(NOAH_READY_TEXT.report)} →</Link></>}</p>
      </footer>
    </>}
  </main>;
}
