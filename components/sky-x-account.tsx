'use client';
/* oxlint-disable next/no-html-link-for-pages -- top-level sign-in gateway */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Cable, LockKeyhole, RefreshCw } from 'lucide-react';
import { SkyNotice } from './sky-feedback';
import { X_ACCOUNT_CONSENT, type XAccountPost } from '@/lib/sky-x-account';
import styles from './sky-x-account.module.css';
type Snapshot = {
  configured: boolean;
  setupRequired: boolean;
  missing: string[];
  connected: boolean;
  account: { username: string; name: string } | null;
  status: string;
  revision: number;
  posts: XAccountPost[];
  fetchedAt: number;
  retryAt: number;
  error: string | null;
  source: 'following';
  xForYouAvailable: false;
  readsUsedToday: number;
  dailyReadLimit: number;
};
function useXAccount() {
  const [data, setData] = useState<Snapshot | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [signedOut, setSignedOut] = useState(false),
    [now, setNow] = useState(0);
  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const r = await fetch('/api/sky/x-account', {
        cache: 'no-store',
        signal,
      });
      if (r.status === 401) {
        if (!signal?.aborted) {
          setSignedOut(true);
          setData(null);
        }
        return;
      }
      const v = (await r.json()) as Snapshot & { error?: string };
      if (!r.ok) throw new Error(v.error || 'X連携を読み込めませんでした。');
      if (!signal?.aborted) {
        setData(v);
        setSignedOut(false);
        setError('');
      }
    } catch (e) {
      if (!signal?.aborted)
        setError(e instanceof Error ? e.message : '接続を確認してください。');
    }
  }, []);
  useEffect(() => {
    const c = new AbortController();
    const frame = requestAnimationFrame(() => {
      setNow(Date.now());
      void load(c.signal);
    });
    const reload = () => {
      void load(c.signal);
    };
    window.addEventListener('sky-x-account-changed', reload);
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => {
      c.abort();
      cancelAnimationFrame(frame);
      clearInterval(timer);
      window.removeEventListener('sky-x-account-changed', reload);
    };
  }, [load]);
  const act = async (action: 'begin' | 'refresh' | 'disconnect') => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/sky/x-account', {
        method: action === 'disconnect' ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          action === 'begin'
            ? { action, consent: X_ACCOUNT_CONSENT }
            : action === 'disconnect'
              ? { revision: data?.revision }
              : { action },
        ),
      });
      const v = (await r.json()) as Snapshot & {
        authorizeUrl?: string;
        error?: string;
      };
      if (!r.ok) throw new Error(v.error || '連携を変更できませんでした。');
      if (action === 'begin' && v.authorizeUrl) {
        const u = new URL(v.authorizeUrl);
        if (
          u.origin !== 'https://x.com' ||
          u.pathname !== '/i/oauth2/authorize'
        )
          throw Error('接続先を確認できません。');
        window.location.assign(u.toString());
        return;
      }
      setData(v);
      window.dispatchEvent(new Event('sky-x-account-changed'));
    } catch (e) {
      setError(e instanceof Error ? e.message : '接続を確認してください。');
    } finally {
      setBusy(false);
    }
  };
  return { data, error, busy, signedOut, act, load, now };
}
export function SkyXAccountConnection() {
  const { data, error, busy, signedOut, act, load, now } = useXAccount();
  const [confirmed, setConfirmed] = useState(false);
  return (
    <section
      className={styles.connection}
      aria-label="自分のXと連携"
      data-x-account-connection
      data-timeline-skin="x"
    >
      <header>
        <span className={styles.mark}>𝕏</span>
        <div>
          <h2>いつもの情報を、自分のSkyへ。</h2>
          <p>Xのフォロー中を、このストリームで読む。</p>
        </div>
      </header>
      {error && <SkyNotice className={styles.error} message={error} />}
      {signedOut ? (
        <a
          href="/signin-with-chatgpt?return_to=%2F%23news-plugins"
          target="_top"
        >
          Skyにサインインしてつなぐ
        </a>
      ) : !data ? (
        <p>
          接続を確認しています…{' '}
          <button onClick={() => void load()}>再確認</button>
        </p>
      ) : data.setupRequired ? (
        <>
          <p className={styles.status}>X連携の準備中</p>
          <p>
            利用者ごとの開発者登録やAPI契約は不要です。連携基盤は運営側で準備します。現在、このアカウントの投稿はまだ取得していません。
          </p>
          <a
            href="https://x.com/home"
            target="_blank"
            rel="noopener noreferrer"
          >
            自分のXを無料で読む <ArrowUpRight size={14} />
          </a>
          <small>
            本人のX画面を別画面で開きます。Sky内への自動取り込みはまだ接続されていません。
          </small>
          <details>
            <summary>運営向けの接続設定</summary>
            <p>
              運営側のX Developer ConsoleのOAuth
              2.0アプリ、登録済みの戻り先、投稿読取枠、保存鍵が必要です。鍵やパスワードをチャットへ送る必要はありません。
            </p>
          </details>
        </>
      ) : data.connected ? (
        <>
          <p className={styles.status}>@{data.account?.username} と連携中</p>
          <p>
            今日の取得 {data.readsUsedToday}/{data.dailyReadLimit}。
            {data.fetchedAt
              ? `最終取得 ${new Date(data.fetchedAt).toLocaleString('ja-JP')}`
              : '投稿はまだ読み込んでいません。'}
          </p>
          <div className={styles.buttons}>
            <button
              disabled={busy || data.retryAt > now}
              onClick={() => void act('refresh')}
            >
              <RefreshCw size={16} />
              {busy ? '更新中…' : '投稿をホームへ読み込む'}
            </button>
            <button disabled={busy} onClick={() => void act('disconnect')}>
              Skyでの連携を停止
            </button>
            <Link href="/#timeline">ストリームを見る</Link>
          </div>
          {data.retryAt > now && (
            <small>
              次の更新は{new Date(data.retryAt).toLocaleTimeString('ja-JP')}
              以降です。
            </small>
          )}
          <small>
            停止するとSky内の認可情報と取得済み本文を消し、新たな読取りを止めます。X側のアプリ権限も外す場合は、Xの「連携しているアプリ」で解除できます。
          </small>
        </>
      ) : (
        <>
          <label className={styles.consent}>
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            <span>
              プロフィールとフォロー中の投稿を読み取り、自分専用のSkyへ表示することを確認しました。投稿・いいね・DM・フォローの変更は許可しません。
            </span>
          </label>
          <p>
            1日の取得上限は{data.dailyReadLimit}
            回です。X側の外部実費と利用枠の範囲内で更新します。
          </p>
          <button
            disabled={!confirmed || busy}
            onClick={() => void act('begin')}
          >
            <Cable size={17} />
            Xのアカウントをつなぐ
          </button>
        </>
      )}
      <p className={styles.boundary}>
        Xの「おすすめ」そのものを取り込む経路は未接続です。現在の接続対象はフォロー中の投稿です。
      </p>
    </section>
  );
}
export default function SkyXAccountTimeline() {
  const { data, error, busy, act, now } = useXAccount();
  if (!data?.connected)
    return (
      <div className={styles.entry}>
        <span className={styles.mark}>
          <Cable size={20} />
        </span>
        <div>
          <strong>いつもの情報を、自分のSkyへ。</strong>
          <p>API・MCPの配信元を追加。</p>
        </div>
        <Link href="/#news-plugins">
          配信元 <ArrowUpRight size={14} />
        </Link>
      </div>
    );
  return (
    <section
      className={styles.feed}
      aria-label="Xのフォロー中の投稿"
      data-native-x-feed
      data-timeline-skin="x"
    >
      <header className={styles.feedHeading}>
        <div>
          <strong>𝕏 · フォロー中</strong>
          <small>@{data.account?.username} の接続</small>
        </div>
        <button
          disabled={busy || data.retryAt > now}
          onClick={() => void act('refresh')}
          aria-label="Xの投稿を更新"
        >
          <RefreshCw size={16} />
        </button>
      </header>
      {error && <SkyNotice className={styles.error} message={error} />}
      {data.error && (
        <p className={styles.note}>
          Xからの更新を待っています。配信元の利用枠や接続をご確認ください。
        </p>
      )}
      <SkyXPostRows posts={data.posts} />
      {!data.posts.length && (
        <p className={styles.note}>
          表示できる投稿をまだ取得していません。
          {data.retryAt > now
            ? `次の更新は${new Date(data.retryAt).toLocaleTimeString('ja-JP')}以降です。`
            : '更新すると、実際のフォロー中の投稿がここに流れます。'}
        </p>
      )}
    </section>
  );
}

export function SkyXPostRows({ posts }: { posts: XAccountPost[] }) {
  return (
    <>
      {posts.map((post) => (
        <article key={post.id} className={styles.post} data-x-post-id={post.id}>
          <span className={styles.avatar}>{post.name.slice(0, 1)}</span>
          <header>
            <strong>{post.name}</strong>
            <span>@{post.author}</span>
            {post.protected && <LockKeyhole size={13} />}
            <span className={styles.badge}>𝕏</span>
          </header>
          <p>{post.text}</p>
          <a href={post.url} target="_blank" rel="noopener noreferrer">
            <time dateTime={post.createdAt}>
              {new Date(post.createdAt).toLocaleString('ja-JP', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </time>{' '}
            · Xで原文を読む <ArrowUpRight size={13} />
          </a>
          {post.protected && (
            <small>
              限定公開の投稿として、自分のストリームだけに表示します。
            </small>
          )}
        </article>
      ))}
    </>
  );
}
