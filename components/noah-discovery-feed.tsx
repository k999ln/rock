'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Bot, ArrowRight } from 'lucide-react';
import { OWNER_SCOPE_HEADER } from '@/lib/owner-intent';
import { startNoahVisiblePolling } from '@/lib/noah-visible-polling';
import type { DiscoveryEntry } from '@/lib/noah-discovery-store';
import type { NoahFeedPreference } from '@/lib/noah-feed';
import styles from './noah-timeline.module.css';
type Source = {
  id: string;
  label: string;
  last_success_at: number | null;
  next_run_at: number;
  error_code: string | null;
  lease_until: number;
};
type Page = {
  entries: DiscoveryEntry[];
  sources: Source[];
  preferences: NoahFeedPreference[];
  ownerScope: string | null;
  nextCursor: string | null;
  snapshot: number;
  serverNow: number;
  retired: string[];
  retiredOverflow: boolean;
  error?: string;
};
type Props = {
  query?: string;
  order?: 'recommended' | 'latest' | 'following';
  settings?: boolean;
};
export default function NoahDiscoveryFeed(props: Props) {
  return <DiscoveryContent key={JSON.stringify(props)} {...props} />;
}
export function DiscoveryContent({
  query = '',
  order = 'recommended',
  settings = false,
}: Props) {
  const [page, setPage] = useState<Page | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [fresh, setFresh] = useState(false),
    [refresh, setRefresh] = useState(0),
    [notice, setNotice] = useState('');
  const guard = useRef({
      active: true,
      busy: false,
      generation: 0,
      owner: undefined as string | null | undefined,
    }),
    currentPage = useRef<Page | null>(null),
    sentinel = useRef<HTMLDivElement>(null);
  const params = new URLSearchParams({
    q: query.trim().slice(0, 200),
    order,
  }).toString();
  useEffect(() => {
    const current = guard.current;
    current.active = true;
    return () => {
      current.active = false;
      current.generation++;
    };
  }, []);
  useEffect(() => {
    const current = guard.current,
      generation = ++current.generation;
    let first = '';
    return startNoahVisiblePolling(async (signal) => {
      try {
        const response = await fetch(`/api/noah/discovery?${params}`, {
            cache: 'no-store',
            signal,
          }),
          data = (await response.json()) as Page;
        if (
          signal.aborted ||
          !current.active ||
          generation !== current.generation
        )
          return;
        if (!response.ok || !Array.isArray(data.entries))
          throw Error(data.error || '新着候補を確認できません。');
        const identity = JSON.stringify([
          data.ownerScope,
          data.preferences,
          data.entries.map((e) => [e.id, e.revision]),
        ]);
        if (!first || current.owner !== data.ownerScope) {
          first = identity;
          current.owner = data.ownerScope;
          currentPage.current = data;
          setPage(data);
          setFresh(false);
        } else {
          const old = currentPage.current;
          if (old) {
            const updated = {
              ...old,
              sources: data.sources,
              serverNow: data.serverNow,
              entries: data.retiredOverflow
                ? []
                : old.entries
                    .map((e) => ({
                      ...e,
                      checkedAt:
                        data.entries.find((v) => v.id === e.id)?.checkedAt ??
                        e.checkedAt,
                    }))
                    .filter(
                      (e) =>
                        !data.retired.includes(e.id) &&
                        !data.preferences.some(
                          (p) => p.kind === 'hide' && p.subject === e.id,
                        ) &&
                        e.checkedAt >= data.serverNow - 86400000,
                    ),
            };
            currentPage.current = updated;
            setPage(updated);
          }
          setFresh(identity !== first);
        }
        setError('');
        return 30000;
      } catch (e) {
        if (
          !signal.aborted &&
          current.active &&
          generation === current.generation
        )
          setError(
            e instanceof Error ? e.message : '新着候補を確認できません。',
          );
        return 30000;
      }
    }, 30000);
  }, [params, refresh]);
  const more = useCallback(async () => {
    const snapshot = currentPage.current;
    if (!snapshot?.nextCursor || guard.current.busy) return;
    guard.current.busy = true;
    setBusy(true);
    const generation = guard.current.generation;
    try {
      const response = await fetch(
          `/api/noah/discovery?${params}&cursor=${encodeURIComponent(snapshot.nextCursor)}`,
          { cache: 'no-store', signal: AbortSignal.timeout(20000) },
        ),
        data = (await response.json()) as Page;
      if (
        !guard.current.active ||
        generation !== guard.current.generation ||
        guard.current.owner !== snapshot.ownerScope
      )
        return;
      if (!response.ok) throw Error(data.error || '続きを確認できません。');
      if (data.ownerScope !== snapshot.ownerScope) {
        currentPage.current = null;
        setPage(null);
        throw Error('アカウントが変わりました。読み直してください。');
      }
      if (data.retiredOverflow) {
        setRefresh((n) => n + 1);
        return;
      }
      const old = currentPage.current ?? snapshot,
        next = {
          ...data,
          entries: [
            ...old.entries.filter(
              (e) =>
                !data.retired.includes(e.id) &&
                !data.preferences.some(
                  (p) => p.kind === 'hide' && p.subject === e.id,
                ) &&
                e.checkedAt >= data.serverNow - 86400000,
            ),
            ...data.entries.filter(
              (e) => !old.entries.some((v) => v.id === e.id),
            ),
          ],
        };
      currentPage.current = next;
      setPage(next);
      setError('');
    } catch (e) {
      if (
        guard.current.active &&
        generation === guard.current.generation &&
        guard.current.owner === snapshot.ownerScope
      )
        setError(e instanceof Error ? e.message : '続きを確認できません。');
    } finally {
      guard.current.busy = false;
      if (guard.current.active) setBusy(false);
    }
  }, [params]);
  async function mutate(
    kind: 'sync' | 'follow' | 'hide',
    subject = '',
    active = true,
  ) {
    const snapshot = currentPage.current;
    if (!snapshot?.ownerScope || guard.current.busy) return;
    guard.current.busy = true;
    setBusy(true);
    setError('');
    setNotice('');
    const generation = guard.current.generation;
    try {
      const response = await fetch(
          kind === 'sync' ? '/api/noah/discovery' : '/api/noah/feed',
          {
            method: kind === 'sync' ? 'POST' : 'PUT',
            headers: {
              'Content-Type': 'application/json',
              [OWNER_SCOPE_HEADER]: snapshot.ownerScope,
            },
            body: JSON.stringify(
              kind === 'sync' ? {} : { kind, subject, active },
            ),
            signal: AbortSignal.timeout(60000),
          },
        ),
        data = (await response.json()) as {
          ownerScope?: string;
          error?: string;
        };
      if (
        !guard.current.active ||
        generation !== guard.current.generation ||
        guard.current.owner !== snapshot.ownerScope
      )
        return;
      if (!response.ok || data.ownerScope !== snapshot.ownerScope)
        throw Error(data.error || '設定を確認できません。');
      setNotice(
        kind === 'sync'
          ? '取得間隔と提供元の制限に従って確認しました。各取得元の状態を確認してください。'
          : '設定を保存しました。',
      );
      setRefresh((n) => n + 1);
    } catch (e) {
      if (
        guard.current.active &&
        generation === guard.current.generation &&
        guard.current.owner === snapshot.ownerScope
      )
        setError(e instanceof Error ? e.message : '操作結果を確認できません。');
    } finally {
      guard.current.busy = false;
      if (guard.current.active) setBusy(false);
    }
  }
  const moreRef = useRef(more);
  useEffect(() => {
    moreRef.current = more;
  }, [more]);
  useEffect(() => {
    if (
      !sentinel.current ||
      !page?.nextCursor ||
      error ||
      typeof IntersectionObserver === 'undefined'
    )
      return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void moreRef.current();
      },
      { rootMargin: '250px' },
    );
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [page?.nextCursor, error]);
  const following = (id: string) =>
    page?.preferences.some((p) => p.kind === 'follow' && p.subject === id);
  return (
    <section
      aria-label={settings ? '公開ソースの取込状況' : '公開ソースの新着候補'}
    >
      <div className={styles.feedLabel}>
        <span>
          {settings ? '公開ソースの取込状況' : '公開ソースの新着候補'}
        </span>
        {!settings && <Link href="/noah/settings">取得元・おすすめ設定</Link>}
      </div>
      <p className={styles.researchNote}>
        公開資料から見つけた候補です。Agentの分類・実行環境・利用条件は確認が必要です。
      </p>
      {settings && page && (
        <div className={styles.notice}>
          <p>
            取得hostの稼働中に、公開metadataを定期確認します。この画面を開き続ける必要はありません。
          </p>
          {page.sources.map((source) => (
            <p key={source.id}>
              <strong>{source.label}</strong>
              <br />
              最終成功：
              {source.last_success_at
                ? new Date(source.last_success_at).toLocaleString('ja-JP')
                : '未取得'}
              <br />
              次回取得可能：
              {source.next_run_at
                ? new Date(source.next_run_at).toLocaleString('ja-JP')
                : '準備済み'}
              {source.error_code && (
                <>
                  <br />
                  {source.error_code === 'rate_limited'
                    ? '提供元の回数制限のため待機中'
                    : source.error_code === 'capacity'
                      ? '候補の保存上限。取込は未完了'
                      : '取得できませんでした。以前の記録を保持しています。'}
                </>
              )}
            </p>
          ))}
          {page.ownerScope ? (
            <button disabled={busy} onClick={() => void mutate('sync')}>
              {busy ? '確認中…' : '新着の取得を確認'}
            </button>
          ) : (
            <p>取得の確認にはサインインが必要です。</p>
          )}
          <p>
            候補の取得はコードの実行や市場の審査合格を意味しません。クラウド配備と実行先の能力に基づく推薦は準備中です。
          </p>
        </div>
      )}
      {notice && <output className={styles.researchNote}>{notice}</output>}
      {fresh && !settings && (
        <div className={styles.notice}>
          <button onClick={() => setRefresh((n) => n + 1)}>
            公開ソースの新着・更新を読み込む
          </button>
        </div>
      )}
      {error && (
        <div role="alert" className={styles.notice}>
          <p>{error}</p>
          <button onClick={() => setRefresh((n) => n + 1)}>
            候補を先頭から読み直す
          </button>
        </div>
      )}
      {!page && !error && (
        <output className={styles.loading}>新着候補を読み込み中…</output>
      )}
      {!settings &&
        page?.entries.map((entry) => (
          <article key={entry.id} className={styles.post}>
            <Link
              className={styles.avatar}
              href={`/noah/candidates/${entry.id}`}
              aria-label={`${entry.metadata.name}の詳細`}
            >
              <Bot size={23} />
            </Link>
            <div className={styles.postContent}>
              <div className={styles.postHeader}>
                <span className={styles.author}>{entry.metadata.author}</span>
                <time
                  className={styles.postMeta}
                  dateTime={new Date(entry.observedAt).toISOString()}
                >
                  {' '}
                  · {new Date(entry.observedAt).toLocaleDateString(
                    'ja-JP',
                  )}{' '}
                  確認
                </time>
              </div>
              <h2 className={styles.postTitle}>
                <Link href={`/noah/candidates/${entry.id}`}>
                  {entry.metadata.name}
                </Link>
              </h2>
              <p className={styles.postText}>
                {entry.metadata.summary ||
                  '提供元の公開資料で内容を確認してください。'}
              </p>
              <div className={styles.researchBadges}>
                <span>
                  {entry.metadata.provider === 'github'
                    ? 'GitHub'
                    : 'Hugging Face Space'}
                </span>
                <span>接続・審査未確認</span>
                <span>{entry.reason}</span>
                <span>{entry.metadata.license || 'ライセンス未確認'}</span>
              </div>
              <div className={styles.postActions}>
                {page.ownerScope && (
                  <>
                    <button
                      disabled={busy}
                      onClick={() =>
                        void mutate(
                          'follow',
                          entry.metadata.authorId,
                          !following(entry.metadata.authorId),
                        )
                      }
                    >
                      {following(entry.metadata.authorId)
                        ? 'フォロー解除'
                        : '提供元をフォロー'}
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => void mutate('hide', entry.id)}
                    >
                      非表示
                    </button>
                  </>
                )}
                <Link
                  className={styles.detailsLink}
                  href={`/noah/candidates/${entry.id}`}
                >
                  版・出典を確認 <ArrowRight size={15} />
                </Link>
              </div>
            </div>
          </article>
        ))}
      {!settings && page && !page.entries.length && (
        <p className={styles.researchNote}>
          条件に合う新着候補はありません。取得元とおすすめ設定を確認できます。
        </p>
      )}
      {!settings && page?.nextCursor && (
        <div ref={sentinel} className={styles.feedEnd}>
          <button disabled={busy} onClick={() => void more()}>
            新着候補をさらに読み込む
          </button>
        </div>
      )}
    </section>
  );
}
