'use client';
/* oxlint-disable next/no-html-link-for-pages -- Existing-account recovery uses Sites top-level navigation. */
/* oxlint-disable next/no-img-element -- The existing company mark is a static local asset. */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createPasskey, getPasskeyAssertion } from '@/lib/passkey-browser';
import { resetAccountHandoffs } from '@/lib/account-handoff';
import styles from './rockstar-account.module.css';

type Mode = 'signup' | 'add' | 'recover' | 'login';
type Credential = {
  id: string;
  label: string;
  createdAt: number;
  lastUsedAt: number | null;
};
type Access = {
  signedIn: boolean;
  method?: string;
  recoveryConfigured?: boolean;
  credentials?: Credential[];
};
async function post<T = Record<string, unknown>>(input: unknown): Promise<T> {
  const response = await fetch('/api/os/access', {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const value = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(value.error || 'AUTH_UNAVAILABLE');
  return value;
}
function message(error: unknown) {
  if (error instanceof DOMException && error.name === 'NotAllowedError')
    return '認証操作が完了しませんでした。キャンセルや時間切れの場合は、もう一度お試しください。';
  const code = error instanceof Error ? error.message : '';
  if (code === 'UNAUTHORIZED')
    return '本人確認を完了できません。ログイン状態、または復旧コードを確認してください。';
  if (code === 'PASSKEY_RATE_LIMITED')
    return '試行が続いています。少し待ってからお試しください。';
  if (code === 'PASSKEY_REAUTH_REQUIRED')
    return '鍵を変更するには、パスキーでログインし直してから5分以内に操作してください。';
  if (code === 'CREDENTIAL_NOT_REMOVABLE')
    return '最後のパスキーは削除できません。先に別のパスキーを追加してください。';
  if (code.includes('CHALLENGE'))
    return '確認が期限切れか、すでに使用済みです。最初からやり直してください。';
  if (code === 'ACCOUNT_ALREADY_SIGNED_IN')
    return '現在のアカウントにログイン済みです。今のデータへパスキーを追加してください。';
  return '認証を完了できませんでした。通信とパスキーの対応状況を確認してください。';
}
function returnPath() {
  const value = new URLSearchParams(window.location.search).get('returnTo');
  if (
    value &&
    /^\/(?!\/)/.test(value) &&
    !/[\\\r\n]/.test(value) &&
    value.length < 2048
  ) {
    const url = new URL(value, window.location.origin);
    if (
      url.origin === window.location.origin &&
      !url.pathname.startsWith('/account')
    )
      return url.pathname + url.search + url.hash;
  }
  return '/';
}
export default function RockstarAccount() {
  const [access, setAccess] = useState<Access | null>(null);
  const [mode, setMode] = useState<Mode>('signup');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [supported, setSupported] = useState(true);
  const [recoveryInput, setRecoveryInput] = useState('');
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [complete, setComplete] = useState(false);
  async function refresh() {
    const response = await fetch('/api/os/access', {
      cache: 'no-store',
      credentials: 'same-origin',
    });
    if (!response.ok) throw new Error('AUTH_UNAVAILABLE');
    const value = (await response.json()) as Access;
    setSupported(
      typeof window.PublicKeyCredential !== 'undefined' &&
        window.isSecureContext,
    );
    setAccess(value);
    if (value.signedIn) setMode('add');
  }
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh().catch(() =>
        setError('接続状態を確認できません。ページを更新してお試しください。'),
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  async function authenticate() {
    setBusy(true);
    setError('');
    try {
      const options = await post<{
        challengeId: string;
        publicKey: Record<string, unknown>;
      }>({
        action: 'options',
        mode,
        ...(mode === 'recover'
          ? { recoveryCode: recoveryInput.trim(), confirmRevoke }
          : {}),
      });
      setRecoveryInput('');
      const credential =
        mode === 'login'
          ? await getPasskeyAssertion(options.publicKey)
          : await createPasskey(options.publicKey);
      const result = await post<{ recoveryCode?: string | null }>({
        action: 'verify',
        challengeId: options.challengeId,
        credential,
      });
      if (mode === 'recover') resetAccountHandoffs(window.sessionStorage);
      setRecoveryCode(result.recoveryCode ?? null);
      setComplete(true);
      setSaved(false);
      await refresh();
    } catch (value) {
      setError(message(value));
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/os/access', {
        method: 'DELETE',
        cache: 'no-store',
        credentials: 'same-origin',
      });
      if (!response.ok) throw new Error('AUTH_UNAVAILABLE');
      const result = (await response.json()) as { gatewaySignout?: boolean };
      resetAccountHandoffs(window.sessionStorage);
      window.location.assign(
        result.gatewaySignout ? '/signout-with-chatgpt?return_to=%2F' : '/',
      );
    } catch (value) {
      setError(message(value));
      setBusy(false);
    }
  }
  async function revoke(id: string) {
    setBusy(true);
    setError('');
    try {
      await post({ action: 'revokeCredential', id });
      await refresh();
    } catch (value) {
      setError(message(value));
    } finally {
      setBusy(false);
    }
  }
  const signedIn = access?.signedIn === true;
  return (
    <main className={styles.page}>
      <nav className={styles.top}>
        <Link href="/">
          <img src="/company-mark.png" alt="" width="28" height="28" />
          RockstarOS
        </Link>
        <Link href="/os/eve">Eve</Link>
      </nav>
      <section className={styles.card} aria-labelledby="account-title">
        <p className={styles.eyebrow}>YOUR OWN SPACE</p>
        <h1 id="account-title">
          {complete
            ? '自分のSkyとEveへ。'
            : signedIn
              ? '自分のSkyとEveへ。'
              : 'あなたのRockstarOSを、ここから。'}
        </h1>
        <p className={styles.description}>
          {signedIn
            ? '同じアカウントの会話・仕事・成果を引き継ぎます。'
            : 'ChatGPTアカウントなしで登録できます。端末のパスキーで、自分のSkyとEveを開きます。'}
        </p>
        {!supported && (
          <output className={styles.notice}>
            このブラウザではパスキーを使えません。avoado.siをパスキー対応のブラウザで開いてください。
          </output>
        )}
        {recoveryCode ? (
          <div className={styles.notice}>
            <h2>復旧コードを安全な場所に保存</h2>
            <p>
              パスキーをすべて失ったときに必要です。この画面で一度だけ表示します。パスワード管理アプリなどへ保存してください。チャットや投稿に送らないでください。
            </p>
            <textarea
              aria-label="復旧コード"
              value={recoveryCode}
              readOnly
              rows={3}
              spellCheck={false}
            />
            <label>
              <input
                type="checkbox"
                checked={saved}
                onChange={(e) => setSaved(e.target.checked)}
              />
              復旧コードを保存しました
            </label>
            <button
              className={styles.primary}
              disabled={!saved}
              onClick={() => window.location.assign(returnPath())}
            >
              Skyへ進む
            </button>
          </div>
        ) : complete ? (
          <div className={styles.notice}>
            <p>パスキーでログインできました。</p>
            <button
              className={styles.primary}
              onClick={() => window.location.assign(returnPath())}
            >
              続きから使う
            </button>
          </div>
        ) : (
          <>
            {!signedIn && (
              <div className={styles.tabs} aria-label="登録方法">
                <button
                  aria-pressed={mode === 'signup'}
                  onClick={() => {
                    setMode('signup');
                    setError('');
                  }}
                  disabled={busy}
                >
                  はじめる
                </button>
                <button
                  aria-pressed={mode === 'login'}
                  onClick={() => {
                    setMode('login');
                    setError('');
                  }}
                  disabled={busy}
                >
                  ログイン
                </button>
              </div>
            )}
            {mode === 'recover' ? (
              <div className={styles.recovery}>
                <h2>アカウントを復旧</h2>
                <label>
                  保存した復旧コード
                  <input
                    type="password"
                    autoComplete="off"
                    value={recoveryInput}
                    onChange={(e) => setRecoveryInput(e.target.value)}
                  />
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={confirmRevoke}
                    onChange={(e) => setConfirmRevoke(e.target.checked)}
                  />
                  古いパスキーとログイン状態、Pixelなどの端末接続をすべて解除し、新しいパスキーで復旧する
                </label>
                <p>
                  会話・仕事・成果は保持します。端末は復旧後に接続し直せます。
                </p>
              </div>
            ) : (
              <p className={styles.hint}>
                {mode === 'add'
                  ? '今のデータへパスキーを追加します。既存のパスキーと接続済み端末を保持します。'
                  : mode === 'login'
                    ? '保存済みのパスキーを選んでください。'
                    : '登録だけで請求や有料実行は始まりません。指紋・顔の認証データは認証器内で扱い、こちらへ送信しません。'}
              </p>
            )}
            <button
              className={styles.primary}
              onClick={() => void authenticate()}
              disabled={
                busy ||
                !supported ||
                !access ||
                (mode === 'recover' &&
                  (!recoveryInput.trim() || !confirmRevoke))
              }
            >
              {busy
                ? '本人確認中…'
                : mode === 'add'
                  ? '今のアカウントにパスキーを追加'
                  : mode === 'login'
                    ? 'パスキーでログイン'
                    : mode === 'recover'
                      ? '新しいパスキーで復旧'
                      : 'パスキーで登録する'}
            </button>
          </>
        )}
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
        {!recoveryCode && (
          <div className={styles.links}>
            <button
              disabled={busy}
              onClick={() => {
                setMode(
                  mode === 'recover' ? (signedIn ? 'add' : 'login') : 'recover',
                );
                setComplete(false);
                setError('');
              }}
            >
              {' '}
              {mode === 'recover' ? '戻る' : 'パスキーを使えないとき'}
            </button>
            {signedIn && (
              <>
                <button
                  disabled={busy}
                  onClick={() => {
                    setMode('login');
                    setComplete(false);
                  }}
                >
                  パスキーでログインし直す
                </button>
                <button disabled={busy} onClick={() => void logout()}>
                  ログアウト
                </button>
              </>
            )}
          </div>
        )}
        {signedIn && !recoveryCode && (
          <details className={styles.credentials}>
            <summary>
              登録済みのパスキー · {access?.credentials?.length ?? 0}
            </summary>
            <ul>
              {access?.credentials?.map((c) => (
                <li key={c.id}>
                  <span>
                    {c.label}
                    <small>
                      {new Date(c.createdAt).toLocaleDateString('ja-JP')} 登録
                    </small>
                  </span>
                  <button
                    disabled={busy || (access.credentials?.length ?? 0) < 2}
                    onClick={() => void revoke(c.id)}
                  >
                    解除
                  </button>
                </li>
              ))}
            </ul>
            <Link href="/connect">接続済みの端末を管理</Link>
          </details>
        )}
        {!signedIn && !recoveryCode && (
          <details className={styles.credentials}>
            <summary>以前のアカウントを使っていた方</summary>
            <p>
              既存アカウントでログイン後、この画面でパスキーを追加すると、今までのデータを引き継げます。
            </p>
            <a href="/signin-with-chatgpt?return_to=%2Faccount" target="_top">
              既存アカウントのデータを引き継ぐ
            </a>
          </details>
        )}
      </section>
      <p className={styles.footer}>RockstarOS 1.0 · Developer Preview</p>
    </main>
  );
}
