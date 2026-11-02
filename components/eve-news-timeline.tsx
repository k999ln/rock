'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  newsSourceHandoff,
  newsTimestampLabel,
  type EveNewsLink,
} from '@/lib/eve-news-feed';
import styles from './eve-news-timeline.module.css';

type Feed = {
  source: string;
  query: string;
  fetchedAt: string;
  articles: EveNewsLink[];
  stale: boolean;
};
async function readFeed(signal?: AbortSignal): Promise<Feed> {
  const response = await fetch('/api/news/feed', { signal });
  const data = (await response.json()) as Partial<Feed> & { error?: string };
  if (!response.ok || !Array.isArray(data.articles))
    throw Error(data.error || 'ニュースを取得できません。');
  return data as Feed;
}

export default function EveNewsTimeline() {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const refresh = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError('');
    try {
      setFeed(await readFeed(signal));
    } catch (reason) {
      if (signal?.aborted) return;
      setError(
        reason instanceof Error ? reason.message : 'ニュースを取得できません。',
      );
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void readFeed(controller.signal)
      .then(setFeed)
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setError(
            reason instanceof Error
              ? reason.message
              : 'ニュースを取得できません。',
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  return (
    <section
      id="news"
      className={styles.news}
      aria-labelledby="eve-news-title"
      data-news-source="public-feeds"
    >
      <header className={styles.heading}>
        <div>
          <small>配信元の原文へ</small>
          <h2 id="eve-news-title">ニュース</h2>
        </div>
        <button type="button" onClick={() => void refresh()} disabled={loading}>
          更新
        </button>
      </header>
      <p className={styles.note}>
        公開RSSとGDELTの原文リンク。見出しは各媒体の表現です。RSSの配信日時とGDELTの検出時刻を区別して表示します。Eveによる検証・要約・掲載記事ではありません。
      </p>
      {loading && !feed && (
        <output className={styles.status}>ニュースを取得しています…</output>
      )}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {feed?.stale && (
        <output className={`${styles.status} ${styles.error}`}>
          配信元に接続できないため、前回取得分を表示しています。
        </output>
      )}
      {feed && (
        <>
          <div className={styles.meta}>
            取得 {new Date(feed.fetchedAt).toLocaleString('ja-JP')} ·{' '}
            {feed.source} · 検索: {feed.query}
          </div>
          <ol className={styles.list}>
            {feed.articles.map((article) => (
              <li key={article.id}>
                <a
                  href={article.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  referrerPolicy="no-referrer"
                >
                  {article.title}
                </a>
                <a href={newsSourceHandoff(article, feed.stale)}>
                  Eveで資料メモを作る
                </a>
                <div className={styles.byline}>
                  {article.publisher} · {newsTimestampLabel(article)}{' '}
                  {new Date(article.seenAt).toLocaleString('ja-JP')} ·{' '}
                  {article.language}
                </div>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
