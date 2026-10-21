'use client';

import { useCallback, useEffect, useState } from 'react';
import type { EveNewsLink } from '@/lib/eve-news-feed';
import styles from './eve-news-timeline.module.css';

type Feed = { source: string; query: string; fetchedAt: string; articles: EveNewsLink[]; stale: boolean };

export default function EveNewsTimeline() {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const refresh = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/news/feed', { signal });
      const data = await response.json() as Partial<Feed> & { error?: string };
      if (!response.ok || !Array.isArray(data.articles)) throw Error(data.error || 'ニュースを取得できません。');
      setFeed(data as Feed);
    } catch (reason) {
      if (signal?.aborted) return;
      setError(reason instanceof Error ? reason.message : 'ニュースを取得できません。');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);
  useEffect(() => { const controller = new AbortController(); void refresh(controller.signal); return () => controller.abort(); }, [refresh]);

  return (
    <section id="news" className={styles.news} aria-labelledby="eve-news-title" data-news-source="gdelt">
      <header className={styles.heading}>
        <div><small>配信元の原文へ</small><h2 id="eve-news-title">ニュース</h2></div>
        <button type="button" onClick={() => void refresh()} disabled={loading}>更新</button>
      </header>
      <p className={styles.note}>GDELTが過去24時間に検出した政治関連リンク。見出しは各媒体の表現で、日時は記事の発行日ではなくGDELTの検出時刻です。Eveによる検証・要約・掲載記事ではありません。</p>
      {loading && !feed && <p role="status">ニュースを取得しています…</p>}
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {feed?.stale && <p role="status" className={styles.error}>配信元に接続できないため、前回取得分を表示しています。</p>}
      {feed && <>
        <div className={styles.meta}>取得 {new Date(feed.fetchedAt).toLocaleString('ja-JP')} · {feed.source} · 検索: {feed.query}</div>
        <ol className={styles.list}>
          {feed.articles.map((article) => <li key={article.id}>
            <a href={article.url} target="_blank" rel="noopener noreferrer nofollow" referrerPolicy="no-referrer">{article.title}</a>
            <div className={styles.byline}>{article.publisher} · GDELT検出 {new Date(article.seenAt).toLocaleString('ja-JP')} · {article.language}</div>
          </li>)}
        </ol>
      </>}
    </section>
  );
}
