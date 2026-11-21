'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { NOAH_COLLECTION_LABELS, NOAH_COLLECTION_SOURCES, type NoahCollectionItem } from '@/lib/noah-collection';
import styles from './noah-collection-feed.module.css';

type Card = NoahCollectionItem & { sources: Pick<NoahCollectionItem, 'source' | 'sourceUrl' | 'author' | 'metrics' | 'observedAt'>[] };
type Page = { items: Card[]; total: number; nextCursor: string | null; configured: boolean };
export default function NoahCollectionFeed({ compact = false }: { compact?: boolean }) {
  const incoming = useSearchParams();
  const [source, setSource] = useState(() => { const value = incoming.get('collectionSource') ?? ''; return NOAH_COLLECTION_SOURCES.includes(value as never) ? value : ''; });
  const [query, setQuery] = useState(() => (incoming.get('collectionQuery') ?? '').slice(0, 200)), [cursor, setCursor] = useState('0');
  const [state, setState] = useState<{ key: string; data?: Page; error?: string }>();
  const [refresh, setRefresh] = useState(0);
  const allParams = new URLSearchParams();
  if (source) allParams.set('collectionSource', source);
  if (query) allParams.set('collectionQuery', query);
  const allHref = `/noah/agents${allParams.size ? `?${allParams}` : ''}#noah-collection`;
  const clear = () => { setSource(''); setQuery(''); setCursor('0'); };
  const params = new URLSearchParams({ source, q: query, cursor, view: compact ? 'home' : 'recent' }).toString();
  const current = state?.key === params ? state : undefined;
  useEffect(() => {
    const update = () => { if (!document.hidden) setRefresh(value => value + 1); };
    const timer = setInterval(update, 60_000);
    window.addEventListener('focus', update);
    return () => { clearInterval(timer); window.removeEventListener('focus', update); };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void fetch(`/api/noah/collection?${params}`, { signal: controller.signal, cache: 'no-store' }).then(async response => {
        if (!response.ok) throw Error('新しく見つかったAgentを読み込めませんでした。');
        const data = await response.json() as Page;
        if (!Array.isArray(data.items)) throw Error('一覧を読み込めませんでした。');
        if (!controller.signal.aborted) setState({ key: params, data });
      }).catch(error => { if (!controller.signal.aborted) setState(previous => ({ ...(previous?.key === params ? previous : {}), key: params, error: error.message })); });
    }, 180);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [params, refresh]);
  return <section id="noah-collection" className={`${styles.section} ${compact ? styles.compact : ''}`} aria-label="サービスから集めたAgent">
    <div className={styles.heading}><div><p>世界のサービスから</p><h2>新しく見つかったAgent</h2></div>{current?.data && <span>{current.data.total.toLocaleString('ja-JP')}件</span>}{compact && <Link href={allHref}>すべて見る</Link>}</div>
    <p className={styles.note}>GitHubやHugging FaceのAgentを、外部の評価と出典から探せます。利用条件は配布元で確認できます。</p>
    <div className={styles.filters} aria-label="収集元で絞り込む">{[['', 'すべて'], ...NOAH_COLLECTION_SOURCES.map(s => [s, NOAH_COLLECTION_LABELS[s]])].map(([value, label]) => <button key={value} aria-pressed={source === value} onClick={() => { setSource(value); setCursor('0'); }}>{label}</button>)}</div>
    <label className={styles.search}>集めたAgentを検索<input type="search" maxLength={200} value={query} placeholder="Agent名・できること" onChange={event => { setQuery(event.target.value); setCursor('0'); }} /></label>
    {(query || source) && <div className={styles.recovery}><button type="button" onClick={clear}>検索条件をクリア</button></div>}
    {!current && <output>読み込んでいます…</output>}
    {current?.error && <div className={styles.recovery}><p role="alert">{current.error}{current.data && ' 前回の一覧を表示しています。'}</p><button type="button" onClick={() => setRefresh(value => value + 1)}>再試行</button></div>}
    {current?.data?.items.length === 0 && <p className={styles.note}>この条件の紹介はまだありません。</p>}
    <div className={styles.grid}>{current?.data?.items.slice(0, compact ? 6 : undefined).map(item => <article key={item.id} className={styles.card}>
      <div className={styles.source}>{item.sources.map(source => NOAH_COLLECTION_LABELS[source.source]).filter((v, i, all) => all.indexOf(v) === i).join(' · ')}</div>
      <h3><a href={item.url} target="_blank" rel="noopener noreferrer">{item.name}</a></h3>
      <p>{item.summary}</p><span className={styles.note}>{item.author}</span>
      <div className={styles.metrics}>{item.sources.filter(source => source.metrics && Object.keys(source.metrics).length).map((source, i) => <a key={`${source.sourceUrl}-rating-${i}`} href={source.sourceUrl} target="_blank" rel="noopener noreferrer" title={`${new Date(source.observedAt).toLocaleString('ja-JP')} 確認`}>
        {NOAH_COLLECTION_LABELS[source.source]} {Object.entries(source.metrics!).map(([metric, count]) => `${metric === 'stars' ? 'スター' : metric === 'reposts' ? 'リポスト' : 'いいね'} ${count.toLocaleString('ja-JP')}`).join(' · ')}
      </a>)}</div>
      <div className={styles.links}>{item.sources.map((source, i) => <a key={`${source.sourceUrl}-${i}`} href={source.sourceUrl} target="_blank" rel="noopener noreferrer">{NOAH_COLLECTION_LABELS[source.source]}の出典</a>)}</div>
      <small>{new Date(item.observedAt).toLocaleString('ja-JP')} 確認 · 外部の反応はNoah内の評価と別集計</small>
    </article>)}</div>
    {!compact && <div className={styles.pagination}>{cursor !== '0' && <button onClick={() => setCursor(String(Math.max(0, Number(cursor) - 20)))}>前へ</button>}{current?.data?.nextCursor && <button onClick={() => setCursor(current.data!.nextCursor!)}>次へ</button>}</div>}
  </section>;
}
