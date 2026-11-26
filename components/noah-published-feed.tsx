'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { NoahAgentPin, NoahAgentPinGrid } from './noah-agent-pin';
import { Bot, ArrowRight } from 'lucide-react';
import { OWNER_SCOPE_HEADER } from '@/lib/owner-intent';
import type { NoahFeedPage, NoahFeedPreference } from '@/lib/noah-feed';
import { noahReleaseCoverUrl } from '@/lib/noah-cover';
import styles from './noah-timeline.module.css';

type Props = { query?: string; order?: 'recommended' | 'latest' | 'following'; settings?: boolean };
export default function NoahPublishedFeed(props: Props) {
  return <NoahPublishedContent key={JSON.stringify([props.query, props.order, props.settings])} {...props} />;
}
function NoahPublishedContent({ query = '', order = 'recommended', settings = false }: Props) {
  const [page, setPage] = useState<NoahFeedPage | null>(null), [error, setError] = useState(''), [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false), [fresh, setFresh] = useState(false), [interest, setInterest] = useState('');
  const lock = useRef(false), sentinel = useRef<HTMLDivElement>(null), generation = useRef(0);
  const params = new URLSearchParams({ q: query.trim().slice(0, 200), order }).toString();
  useEffect(() => {
    const controller = new AbortController(), version = ++generation.current; let timer: ReturnType<typeof setTimeout>;
    let first: string, firstOwner: string | null;
    async function read(poll = false) {
      if (poll && document.visibilityState === 'hidden') return;
      try {
        const r = await fetch(`/api/noah/feed?${params}`, { cache: 'no-store', signal: controller.signal });
        const data = await r.json() as NoahFeedPage & { error?: string };
        if (!r.ok || !Array.isArray(data.entries)) throw new Error(data.error || '公開Agentを読み込めません。');
        if (controller.signal.aborted || version !== generation.current) return;
        const identity = JSON.stringify([data.ownerScope, data.preferences, data.entries.map(e => [e.packageKey, e.digest])]);
        if (poll && data.ownerScope === firstOwner) setFresh(identity !== first);
        else { first = identity; firstOwner = data.ownerScope; setPage(data); setError(''); setFresh(false); }
      } catch (e) { if (!controller.signal.aborted && version === generation.current && !poll) setError(e instanceof Error ? e.message : '公開Agentを読み込めません。'); }
      if (!controller.signal.aborted && version === generation.current) timer = setTimeout(() => { void read(true); }, 30000);
    }
    const visibility = () => { clearTimeout(timer); if (document.visibilityState === 'visible') void read(Boolean(first)); };
    document.addEventListener('visibilitychange', visibility);
    void read(); return () => { controller.abort(); clearTimeout(timer); document.removeEventListener('visibilitychange', visibility); };
  }, [params, attempt]);
  const more = useCallback(async () => {
    if (!page?.nextCursor || lock.current) return;
    lock.current = true; setBusy(true); const version = generation.current;
    try {
      const r = await fetch(`/api/noah/feed?${params}&cursor=${encodeURIComponent(page.nextCursor)}`, { cache: 'no-store' });
      const data = await r.json() as NoahFeedPage & { error?: string };
      if (version !== generation.current) return;
      if (!r.ok || !Array.isArray(data.entries)) throw new Error(data.error || '続きを読み込めません。');
      if (data.ownerScope !== page.ownerScope) { setPage(null); throw new Error('アカウントが変わりました。読み直してください。'); }
      setPage(old => old ? { ...data, entries: [...old.entries, ...data.entries.filter(e => !old.entries.some(p => p.packageKey === e.packageKey))] } : data); setError('');
    } catch (e) { if (version === generation.current) setError(e instanceof Error ? e.message : '読み込めません。'); }
    finally { lock.current = false; setBusy(false); }
  }, [page, params]);
  useEffect(() => {
    if (!sentinel.current || !page?.nextCursor || error || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) void more(); }, { rootMargin: '300px' });
    observer.observe(sentinel.current); return () => observer.disconnect();
  }, [page?.nextCursor, more, error]);
  async function preference(kind: NoahFeedPreference['kind'], subject: string, active: boolean) {
    if (!page?.ownerScope || lock.current) return;
    lock.current = true; setBusy(true);
    try {
      const response = await fetch('/api/noah/feed', { method: 'PUT', headers: { 'Content-Type': 'application/json', [OWNER_SCOPE_HEADER]: page.ownerScope }, body: JSON.stringify({ kind, subject, active }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || '設定を保存できません。');
      setAttempt(n => n + 1); setInterest('');
    } catch (e) { setError(e instanceof Error ? e.message : '設定を保存できません。'); }
    finally { lock.current = false; setBusy(false); }
  }
  const has = (kind: NoahFeedPreference['kind'], subject: string) => page?.preferences.some(p => p.kind === kind && p.subject === subject) || false;
  return <section aria-label={settings ? 'おすすめ・フォローの設定' : '公開されたAgentのタイムライン'}>
    {settings && <div className={styles.notice}><h2>おすすめ・フォロー</h2><p>選んだ興味とフォローした提供元を使って公開Agentを並べます。依頼文や実行結果は推薦に使いません。</p>
      {page?.ownerScope ? <><label><input type="checkbox" checked={has('personalize','enabled')} disabled={busy} onChange={e => { void preference('personalize','enabled',e.target.checked); }} />自分の設定をおすすめ順に反映する</label>
        <form onSubmit={e => { e.preventDefault(); void preference('interest',interest,true); }}><label>興味のある用途・タグを1つ入力<input value={interest} maxLength={80} onChange={e => setInterest(e.target.value)} placeholder="例：開発" /></label><button disabled={busy || !interest.trim()}>興味を追加</button></form>
        {page.preferences.filter(p => p.kind !== 'personalize').map(p => <p key={`${p.kind}:${p.subject}`}>{({follow:'提供元をフォロー',hide:'非表示',interest:'興味'})[p.kind as 'follow'|'hide'|'interest']}：{p.subject} <button disabled={busy} onClick={() => { void preference(p.kind,p.subject,false); }}>解除</button></p>)}
      </> : page && <Link href="/signin-with-chatgpt?return_to=%2Fnoah%2Fsettings">サインインして設定する</Link>}</div>}
    {!settings && <div className={styles.feedLabel}><span>公開・更新されたAgentとTool</span><Link href="/noah/settings">おすすめ設定</Link></div>}
    {fresh && <div className={styles.notice}><button onClick={() => setAttempt(n => n + 1)}>新着・更新を読み込む</button></div>}
    {error && <div className={styles.notice} role="alert"><p>{error}</p><button onClick={() => setAttempt(n => n + 1)}>先頭から読み直す</button></div>}
    {!page && !error && <output className={styles.loading}>公開Agentを読み込み中…</output>}
    {!settings && page && page.entries.length > 0 && <NoahAgentPinGrid>{page.entries.map(entry => {
      const href = `/noah?package=${encodeURIComponent(entry.packageKey)}`;
      const published = new Date(entry.publishedAt);
      const byline = <div className={styles.postHeader}><span className={styles.author}>{entry.author}</span><time className={styles.postMeta} dateTime={published.toISOString()}> · {published.toLocaleDateString('ja-JP')}</time></div>;
      const terms = <><p>{entry.priceNote}</p><div className={styles.researchBadges}><span>v{entry.version}</span><span>{entry.reason}</span>{entry.categories.map(c => <span key={c}>{c}</span>)}</div></>;
      const actions = <div className={styles.postActions}>{page.ownerScope && <>
        <button disabled={busy} onClick={() => { void preference('follow',entry.authorId,!has('follow',entry.authorId)); }}>{has('follow',entry.authorId) ? 'フォロー解除' : '提供元をフォロー'}</button>
        <button disabled={busy} onClick={() => { void preference('hide',entry.toolId,true); }}>非表示</button>
      </>}<Link href={href} className={styles.detailsLink}>詳細・利用条件 <ArrowRight size={15} /></Link></div>;
      if (entry.isAgent) return <NoahAgentPin key={entry.packageKey} id={entry.toolId} name={entry.name}
        cover={entry.cover && { type:entry.cover.type, url:noahReleaseCoverUrl(entry.packageKey,entry.digest) }} href={href} summary={entry.summary} meta={<>{byline}{terms}</>} actions={actions} />;
      return <li key={entry.packageKey} className={styles.feedTool}><article className={styles.post}>
        <Link href={href} className={styles.avatar} aria-label={`${entry.name}の詳細`}><Bot size={23} /></Link><div className={styles.postContent}>
          {byline}<h2 className={styles.postTitle}><Link href={href}>{entry.name}</Link></h2><p className={styles.postText}>{entry.summary}</p>
          {terms}{actions}
        </div>
      </article></li>;
    })}</NoahAgentPinGrid>}
    {!settings && page && !page.entries.length && <p className={styles.researchNote}>{order === 'following' ? 'フォローした提供元の公開Agentはまだありません。' : '条件に合う公開Agentはまだありません。公開・更新されるとここに表示されます。'}</p>}
    {!settings && page?.nextCursor && <div ref={sentinel} className={styles.feedEnd}><button disabled={busy} onClick={() => { void more(); }}>公開Agentをさらに読み込む</button></div>}
  </section>;
}
