'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { RefreshCw } from 'lucide-react';
import { X_TIMELINE_CONSENT } from '@/lib/sky-hub';
import { useSkyHub } from '@/lib/use-sky-hub';
import type { XFeedSnapshot } from '@/lib/sky-x-feed';
import { SkyXPostRows } from './sky-x-account';
import styles from './sky-x-account.module.css';

type Feed = { snapshot?: XFeedSnapshot; error?: string; loading?: boolean };

export default function SkyPublicXTimeline() {
  const { plugins, state } = useSkyHub();
  const sources = useMemo(
    () => plugins.filter((plugin) => plugin.kind === 'x' && plugin.enabled && plugin.consentVersion === X_TIMELINE_CONSENT).slice(0, 3),
    [plugins],
  );
  const [feeds, setFeeds] = useState<Record<string, Feed>>({});

  useEffect(() => {
    if (state !== 'ready' || !sources.length) return;
    const controller = new AbortController();
    for (const source of sources) {
      void fetch(`/api/sky/x-feed?${new URLSearchParams({ source: source.resource })}`, {
        cache: 'no-store', signal: controller.signal,
      }).then(async (response) => {
        const value = await response.json() as XFeedSnapshot & { error?: string };
        if (!response.ok) throw new Error(value.error || '投稿を読み込めませんでした。');
        if (!controller.signal.aborted) setFeeds((current) => ({ ...current, [source.key]: { snapshot: value } }));
      }).catch(() => {
        if (!controller.signal.aborted) setFeeds((current) => ({ ...current, [source.key]: { error: '投稿を読み込めませんでした。' } }));
      });
    }
    return () => controller.abort();
  }, [state, sources]);

  async function refresh(source: (typeof sources)[number]) {
    setFeeds((current) => ({ ...current, [source.key]: { ...current[source.key], loading: true, error: undefined } }));
    let preserveSnapshot = true;
    try {
      const response = await fetch('/api/sky/x-feed', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: source.resource, revision: source.revision }),
      });
      const value = await response.json() as XFeedSnapshot & { error?: string };
      if (!response.ok) {
        preserveSnapshot = ![403, 404, 409].includes(response.status);
        throw new Error(value.error || '投稿を取得できませんでした。');
      }
      setFeeds((current) => ({ ...current, [source.key]: { snapshot: value } }));
    } catch (error) {
      setFeeds((current) => ({ ...current, [source.key]: { snapshot: preserveSnapshot ? current[source.key]?.snapshot : undefined, error: error instanceof Error ? error.message : '投稿を取得できませんでした。' } }));
    }
  }

  if (state !== 'ready' || !sources.length) return null;
  return <section className={styles.feed} aria-label="Xの公開配信元">
    {sources.map((source) => {
      const feed = feeds[source.key], snapshot = feed?.snapshot;
      return <div key={source.key} className={styles.publicSource}>
        <header className={styles.publicHeader}>
          <strong>𝕏 · {source.metadata.title}</strong>
          <Link href="/#news-plugins">配信設定</Link>
          <button disabled={feed?.loading || snapshot?.status === 'api-not-configured'} onClick={() => void refresh(source)}>
            <RefreshCw size={15} />投稿を取得
          </button>
        </header>
        {feed?.error && <p role="alert">{feed.error}</p>}
        {snapshot?.status === 'api-not-configured' && <p>公開投稿APIは未設定です。埋め込み表示は行いません。</p>}
        {snapshot?.status === 'source-not-approved' && <p>この配信元はAPI取得の承認待ちです。</p>}
        {snapshot && snapshot.status !== 'api-not-configured' && snapshot.status !== 'source-not-approved' && <>
          <SkyXPostRows posts={snapshot.posts.map((post) => ({ ...post, protected: false }))} />
          {!snapshot.posts.length && <p>取得済みの公開投稿はありません。状態: {snapshot.status}</p>}
          {!!snapshot.fetchedAt && <small>最終取得: {new Date(snapshot.fetchedAt).toLocaleString('ja-JP')}</small>}
        </>}
      </div>;
    })}
  </section>;
}
