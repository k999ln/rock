'use client';
/**
 * Agent の詳細（/noah/ready/agent?id=<系列の ID>）。説明・動く所・料金・送り先を見て、「接続」1 回でつなぐ。つないだ後は、道具を選んで頼む所・仕事の一覧・「切る」。
 * 送り先（入力が送られる host）は、つなぐ前に、必ず出す。説明は、提供者が書いた文のまま、文字として出す。
 * 未サインインの人が「接続」を押した後、サインインから戻った時は、この画面が、同じ操作 ID で続ける（押し直さない）。
 * 仕様: docs/noah/spec-74-one-click-connect.md の 11.4・11.5。
 */
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { NOAH_REPORT_CONTACT } from '@/lib/noah-bot-notice';
import { OWNER_SCOPE_HEADER } from '@/lib/owner-intent';
import { NOAH_READY_TEXT, noahBadgeText, noahCheckedText, noahConnectionStateText, noahPriceText, noahSendsToText, noahUsersText, type NoahReadyConnection, type NoahReadyItem } from '@/lib/noah-ready-view';
import NoahAsk from './noah-ask';
import NoahWorkList from './noah-work-list';
import NoahConnectButton from './noah-connect-button';
import base from './noah-service.module.css';
import styles from './noah-ready.module.css';

type Detail = NoahReadyItem & { listed: boolean; website: string | null; connection: NoahReadyConnection | null; ownerScope: string | null; error?: string };
type Loaded = { state: 'loading' } | { state: 'missing' } | { state: 'error' } | { state: 'ready'; detail: Detail };

export default function NoahReadyDetail({ id }: { id: string }) {
  // 読んだ詳細は、何回目の読み取りの物かと一緒に持つ（「読み直す」を押したら、届くまでは「読み込み中」）。
  const [result, setResult] = useState<{ attempt: number; loaded: Loaded } | null>(null), [connection, setConnection] = useState<NoahReadyConnection | null>(null);
  const [cutting, setCutting] = useState(false), [error, setError] = useState(''), [attempt, setAttempt] = useState(0);
  // 頼むたびに進める数（下の「仕事」が、すぐ読み直す）。
  const [asked, setAsked] = useState(0);
  const epoch = useRef(0);
  // 形の違う ID は、問い合わせずに「見つかりません」。
  const valid = id.length >= 3 && id.length <= 400;
  const loaded: Loaded = !valid ? { state: 'missing' } : result?.attempt === attempt ? result.loaded : { state: 'loading' };

  useEffect(() => {
    if (!valid) return;
    const current = ++epoch.current;
    const done = (next: Loaded) => { if (current === epoch.current) setResult({ attempt, loaded: next }); };
    void fetch(`/api/noah/intake?${new URLSearchParams({ id }).toString()}`, { cache: 'no-store' }).then(async (response) => {
      const body = await response.json() as Detail;
      if (current !== epoch.current) return;
      if (response.status === 404) { done({ state: 'missing' }); return; }
      if (response.status !== 200 || typeof body.id !== 'string') { done({ state: 'error' }); return; }
      done({ state: 'ready', detail: body });
      setConnection(body.connection ?? null);
    }).catch(() => done({ state: 'error' }));
  }, [id, attempt, valid]);

  const back = <p className={styles.back}><Link href="/noah/ready">← {NOAH_READY_TEXT.title}</Link></p>;
  if (loaded.state !== 'ready') return <main className={`${base.page} ${styles.page}`}>
    {back}
    {loaded.state === 'loading' && <p className={base.loading}><output>読み込んでいます…</output></p>}
    {loaded.state === 'missing' && <p className={base.empty}>{NOAH_READY_TEXT.missing}</p>}
    {loaded.state === 'error' && <div className={base.empty} role="alert"><p>{NOAH_READY_TEXT.unavailable}</p><button type="button" onClick={() => setAttempt((n) => n + 1)}>読み直す</button></div>}
  </main>;

  const { detail } = loaded, signedIn = detail.ownerScope !== null;
  const live = connection && connection.state !== 'disconnected' ? connection : null;
  const checked = noahCheckedText(detail.checkedAt);
  const facts = [noahBadgeText(detail.connect), detail.connect.placeLabel, noahPriceText(detail.connect.price), noahUsersText(detail.users), detail.tools > 0 ? `道具 ${detail.tools} 個` : null].filter((text): text is string => !!text);

  async function cut(current: NoahReadyConnection) {
    if (cutting) return;
    setCutting(true); setError('');
    try {
      const response = await fetch(`/api/noah/connect/${current.id}`, {
        method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json', ...(detail.ownerScope ? { [OWNER_SCOPE_HEADER]: detail.ownerScope } : {}) },
        body: JSON.stringify({ action: 'disconnect', revision: current.revision }),
      });
      const body = await response.json() as { id?: string; state?: string; revision?: number; error?: string; connection?: NoahReadyConnection };
      if (response.status === 200 && typeof body.id === 'string' && typeof body.state === 'string' && typeof body.revision === 'number') {
        setConnection({ id: body.id, state: body.state, revision: body.revision, error: null });
        // 切ると、終わっていない依頼は止まる。仕事の一覧を、読み直す。
        setAsked((n) => n + 1);
        try { window.sessionStorage.removeItem(`noah-tools:${current.id}`); } catch { /* 控えが残っても、次に開く時は読み直す。 */ }
      } else {
        // 版が古かった時は、返ってきた今の接続に合わせる（もう 1 回押せば、切れる）。
        if (body.connection) setConnection(body.connection);
        setError(body.error ?? NOAH_READY_TEXT.offline);
      }
    } catch { setError(NOAH_READY_TEXT.offline); } finally { setCutting(false); }
  }
  /** 道具の一覧が「この接続は使えない」と返した時: 接続の今の状態を読み直す（取り下げなら、理由が出る）。 */
  function refresh(current: NoahReadyConnection) {
    void fetch(`/api/noah/connect/${current.id}`, { cache: 'no-store' }).then(async (response) => {
      const body = await response.json() as { id?: string; state?: string; revision?: number; error?: string };
      if (response.status === 200 && typeof body.id === 'string' && typeof body.state === 'string' && typeof body.revision === 'number') setConnection({ id: body.id, state: body.state, revision: body.revision, error: body.error ?? null });
    }).catch(() => undefined);
  }

  return <main className={`${base.page} ${styles.page}`}>
    {back}
    <article className={styles.detail}>
      <header className={styles.cardHead}><h1>{detail.name}</h1><span className={styles.provider}>提供: {detail.provider}</span></header>
      <p className={styles.description}>{detail.summary || '（説明はありません）'}</p>
      <ul className={styles.facts} aria-label="つなぎ方">{facts.map((text, index) => <li key={text} className={index === 0 ? styles.badge : undefined}>{text}</li>)}</ul>
      {checked && <p className={styles.quiet}>{checked}</p>}
      {detail.host && <p className={styles.sendsTo}>{noahSendsToText(detail.host)}</p>}
      {detail.website && <p className={styles.quiet}><a href={detail.website} target="_blank" rel="noopener noreferrer nofollow">提供者のページ（{new URL(detail.website).hostname}）</a></p>}
      <NoahConnectButton agentId={detail.id} listed={detail.listed} signedIn={signedIn} ownerScope={detail.ownerScope} connection={live} onChange={setConnection} resume askAs="none" />
    </article>

    {live?.state === 'connected' && <NoahAsk key={live.id} connectionId={live.id} ownerScope={detail.ownerScope} onUnusable={() => refresh(live)} onAsked={() => setAsked((n) => n + 1)} />}
    {/* 仕事（この Agent への依頼と成果）。つないでいない時・切った後も、前に受け取った成果を出す。サインインしていない人には、出さない。 */}
    {signedIn && <NoahWorkList key={`work:${detail.id}`} agentId={detail.id} ownerScope={detail.ownerScope} refresh={asked} />}

    {live && <section className={styles.section} aria-label="この接続">
      <div className={styles.cut}>
        <p>{noahConnectionStateText(live.state)}</p>
        <button type="button" className={styles.secondary} disabled={cutting} onClick={() => void cut(live)}>{cutting ? '切っています…' : '切る'}</button>
      </div>
      <p className={styles.quiet}>{NOAH_READY_TEXT.cutNote}</p>
      {error && <p className={styles.reason} role="alert">{error}</p>}
    </section>}

    <footer className={styles.source}><p>{NOAH_READY_TEXT.source}{NOAH_REPORT_CONTACT && <> <Link href="/noah/help#bot">{NOAH_READY_TEXT.report} →</Link></>}</p></footer>
  </main>;
}
