'use client';
/* oxlint-disable react/react-compiler -- Synchronize owner-scoped asynchronous API state and clear it when the owner changes. */
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Search, ArrowRight } from 'lucide-react';
import {
  noahRemoteFetch,
  NoahRemoteClientError,
  type NoahReadyItem,
  type NoahRemoteConnectionView,
} from '@/lib/noah-remote-client';
import NoahCard from './noah-card';
import styles from './noah-ready.module.css';
type Listing = {
  items: NoahReadyItem[];
  nextCursor: string | null;
  ownerScope: string | null;
};
export default function NoahReady() {
  const [query, setQuery] = useState(''),
    [oneTap, setOneTap] = useState(false),
    [reload, setReload] = useState(0);
  const [data, setData] = useState<Listing | null>(null),
    [connections, setConnections] = useState<NoahRemoteConnectionView[]>([]),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null),
    generation = useRef(0),
    loadingMore = useRef(false);
  useEffect(() => {
    const controller = new AbortController(),
      version = ++generation.current;
    setBusy(true);
    setError('');
    setData(null);
    setConnections([]);
    const timer = setTimeout(
      () => {
        const q = query.trim(),
          params = new URLSearchParams(oneTap ? { oneTap: '1' } : {});
        if (q) {
          if (Array.from(q).length < 2) {
            setError('2文字以上で検索してください。');
            setBusy(false);
            return;
          }
          params.set('q', q);
        }
        void noahRemoteFetch<Listing>('/api/noah/intake?' + params, {
          signal: controller.signal,
        })
          .then(async (value) => {
            if (generation.current !== version) return;
            setData(value);
            if (value.ownerScope) {
              const mine = await noahRemoteFetch<{
                items: NoahRemoteConnectionView[];
              }>('/api/noah/connect', { signal: controller.signal });
              if (generation.current === version)
                setConnections(
                  mine.items.filter((c) => c.state === 'connected'),
                );
            }
          })
          .catch((e) => {
            if (!controller.signal.aborted)
              setError(
                e instanceof NoahRemoteClientError && e.status === 404
                  ? 'まだ公開していません。'
                  : e.message,
              );
          })
          .finally(() => {
            if (generation.current === version) setBusy(false);
          });
      },
      query ? 300 : 0,
    );
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query, oneTap, reload]);
  async function more() {
    if (!data?.nextCursor || loadingMore.current) return;
    loadingMore.current = true;
    const version = generation.current;
    const params = new URLSearchParams({
      cursor: data.nextCursor,
      ...(query.trim() ? { q: query.trim() } : {}),
      ...(oneTap ? { oneTap: '1' } : {}),
    });
    try {
      const page = await noahRemoteFetch<Listing>('/api/noah/intake?' + params);
      if (version === generation.current)
        setData((old) =>
          old
            ? {
                ...page,
                items: [
                  ...old.items,
                  ...page.items.filter(
                    (item) => !old.items.some((i) => i.id === item.id),
                  ),
                ],
              }
            : page,
        );
    } catch (e) {
      if (version === generation.current)
        setError(e instanceof Error ? e.message : '読み込めませんでした。');
    } finally {
      loadingMore.current = false;
    }
  }
  useEffect(() => {
    const node = sentinel.current;
    if (!node || !data?.nextCursor) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void more();
      },
      { rootMargin: '200px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  });
  return (
    <main className={styles.page}>
      <header className={styles.heading}>
        <span className={styles.eyebrow}>NOAH</span>
        <h1>スマホで、Agentを使おう。</h1>
        <p>選んで、頼んで、成果を受け取る。</p>
      </header>
      <label className={styles.search}>
        <Search size={19} />
        <input
          aria-label="Agentを検索"
          placeholder="やりたいこと、Agent名で検索"
          value={query}
          maxLength={80}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <div className={styles.filters}>
        <button
          type="button"
          aria-pressed={oneTap}
          onClick={() => setOneTap(!oneTap)}
        >
          押すだけで試せる{oneTap ? ' ✓' : ''}
        </button>
      </div>
      {error && (
        <div className={styles.notice} role="alert">
          {error}
          {error !== 'まだ公開していません。' && (
            <button onClick={() => setReload((v) => v + 1)}>再読み込み</button>
          )}
        </div>
      )}
      {busy && (
        <output className={styles.muted}>
          Agentを読み込んでいます…
        </output>
      )}
      {!!connections.length && (
        <section>
          <h2 className={styles.sectionTitle}>つながっているもの</h2>
          {connections.map((c) => (
            <Link
              className={styles.connected}
              key={c.id}
              href={`/noah/ready/agent?id=${encodeURIComponent(c.agentId)}`}
            >
              <span>{c.host}</span>頼む <ArrowRight size={16} />
            </Link>
          ))}
        </section>
      )}
      {(['ran', 'new'] as const).map((section) => {
        const items = data?.items.filter((i) => i.section === section) ?? [];
        return items.length ? (
          <section key={section}>
            <h2 className={styles.sectionTitle}>
              {section === 'ran'
                ? '成果が返ったAgent'
                : 'まだ誰も動かしていないAgent'}
            </h2>
            {section === 'new' && (
              <p className={styles.muted}>応答することを確認しています。</p>
            )}
            {items.map((item) => (
              <NoahCard key={item.id} item={item} />
            ))}
          </section>
        ) : null;
      })}
      {data && !data.items.length && !busy && (
        <p className={styles.notice}>
          {query
            ? '見つかりませんでした。別の語で探してください。'
            : '今、並べられるAgentがありません。少し後で開いてください。'}
        </p>
      )}
      <div ref={sentinel}>
        {data?.nextCursor && (
          <button className={styles.secondary} onClick={() => void more()}>
            続きを読む
          </button>
        )}
      </div>
      <footer className={styles.footer}>
        <Link href="/noah/explore">
          自分のMacで動かすAgent <ArrowUpRightText />
        </Link>
        <details>
          <summary>出どころ</summary>Official MCP
          Registry。説明は提供者が書いた文のままです。Noahが作ったAgentではありません。
        </details>
      </footer>
    </main>
  );
}
function ArrowUpRightText() {
  return <span aria-hidden="true">↗</span>;
}
