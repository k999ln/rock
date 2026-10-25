'use client';
/* oxlint-disable next/no-html-link-for-pages -- Legacy identity recovery uses top-level navigation. */
/* oxlint-disable next/no-img-element -- Existing static company mark. */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createPasskey, getPasskeyAssertion } from '@/lib/passkey-browser';
import { resetAccountHandoffs } from '@/lib/account-handoff';
import styles from './rockstar-account.module.css';

type Mode = 'signup' | 'add' | 'recover' | 'login';
type Access = { signedIn: boolean; method?: string; recoveryConfigured?: boolean; passwordLogin?: { handle: string } | null; credentials?: { id: string; label: string; createdAt: number }[] };
async function post<T = Record<string, unknown>>(input: unknown): Promise<T> {
  const response = await fetch('/api/os/access', { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  const result = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(result.error || 'AUTH_UNAVAILABLE');
  return result;
}
function message(value: unknown) {
  if (value instanceof DOMException && value.name === 'NotAllowedError') return 'パスキーの認証を完了できませんでした。ユーザーIDとパスワードでも登録・ログインできます。';
  const code = value instanceof Error ? value.message : '';
  const messages: Record<string, string> = {
    UNAUTHORIZED: 'ログイン情報を確認できません。同じアカウントのユーザーID・パスワード、または復旧コードを確認してください。',
    ACCOUNT_NAME_INVALID: 'ユーザーIDは英数字から始め、英数字と_を使って3〜32文字で入力してください。',
    ACCOUNT_NAME_UNAVAILABLE: 'このユーザーIDは使われています。登録直後の場合は、ログインから同じ情報で続けられます。',
    PASSWORD_INVALID: 'パスワードは15〜128文字にしてください。単純な繰り返しやよく使われる文字列は使えません。',
    ACCOUNT_LOGIN_ALREADY_CONFIGURED: 'このアカウントは登録済みです。ログイン、またはsmisへ進んでください。',
    PASSKEY_RATE_LIMITED: '試行が続いています。少し待ってからお試しください。',
    ACCOUNT_BUSY: '認証の処理が混み合っています。少し待ってからお試しください。',
    PASSKEY_REAUTH_REQUIRED: '鍵を変更するには、パスキーでログインし直してから5分以内に操作してください。',
    CREDENTIAL_NOT_REMOVABLE: '最後のパスキーは削除できません。先に別のパスキーを追加してください。',
    ACCOUNT_ALREADY_SIGNED_IN: '今のデータを引き継いで、ログイン方法を追加してください。',
  };
  return messages[code] || (code.includes('CHALLENGE') ? '確認が期限切れか、使用済みです。最初からやり直してください。' : '認証を完了できませんでした。入力と通信状態を確認してお試しください。');
}
function returnPath() {
  const value = new URLSearchParams(window.location.search).get('returnTo');
  if (value && /^\/(?!\/)/.test(value) && !/[\\\r\n]/.test(value) && value.length < 2048) {
    const url = new URL(value, window.location.origin);
    if (url.origin === window.location.origin && !url.pathname.startsWith('/account')) return url.pathname + url.search + url.hash;
  }
  return '/';
}
export default function RockstarAccount() {
  const [access, setAccess] = useState<Access | null>(null);
  const [mode, setMode] = useState<Mode>('signup');
  const [kind, setKind] = useState<'password' | 'passkey'>('password');
  const [handle, setHandle] = useState('');
  const [secret, setSecret] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [supported, setSupported] = useState(true);
  const [recoveryInput, setRecoveryInput] = useState('');
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [complete, setComplete] = useState(false);
  async function refresh() {
    const response = await fetch('/api/os/access', { cache: 'no-store', credentials: 'same-origin' });
    if (!response.ok) throw new Error('AUTH_UNAVAILABLE');
    const value = await response.json() as Access;
    setSupported(typeof window.PublicKeyCredential !== 'undefined' && window.isSecureContext);
    setAccess(value);
    if (value.signedIn) setMode('add');
    if (value.passwordLogin) setHandle(value.passwordLogin.handle);
  }
  useEffect(() => {
    const timer = window.setTimeout(() => { void refresh().catch(() => setError('接続を確認できません。ページを更新してください。')); }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  const signedIn = access?.signedIn === true;
  const configured = Boolean(access?.passwordLogin);
  const enteringPassword = kind === 'password' && !(signedIn && configured && mode === 'add');
  async function authenticate() {
    if (busy) return;
    if (kind === 'password' && mode !== 'login' && secret !== confirmation) { setError('パスワードの確認が一致しません。'); return; }
    setBusy(true); setError('');
    try {
      let result: { recoveryCode?: string | null };
      if (kind === 'password') {
        result = await post({ action: 'password', mode, handle, password: secret, ...(mode === 'recover' ? { recoveryCode: recoveryInput.trim(), confirmRevoke } : {}) });
      } else {
        const options = await post<{ challengeId: string; publicKey: Record<string, unknown> }>({ action: 'options', mode, ...(mode === 'recover' ? { recoveryCode: recoveryInput.trim(), confirmRevoke } : {}) });
        const credential = mode === 'login' ? await getPasskeyAssertion(options.publicKey) : await createPasskey(options.publicKey);
        result = await post({ action: 'verify', challengeId: options.challengeId, credential });
      }
      if (mode === 'recover') resetAccountHandoffs(window.sessionStorage);
      setRecoveryCode(result.recoveryCode ?? null); setComplete(true); setSaved(false);
      await refresh();
    } catch (value) { setError(message(value)); }
    finally { setSecret(''); setConfirmation(''); setRecoveryInput(''); setBusy(false); }
  }
  async function logout() {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/os/access', { method: 'DELETE', credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok) throw new Error('AUTH_UNAVAILABLE');
      const result = await response.json() as { gatewaySignout?: boolean };
      resetAccountHandoffs(window.sessionStorage);
      window.location.assign(result.gatewaySignout ? '/signout-with-chatgpt?return_to=%2Faccount' : '/account');
    } catch (value) { setError(message(value)); setBusy(false); }
  }
  function change(nextMode: Mode, nextKind = kind) { setMode(nextMode); setKind(nextKind); setError(''); setComplete(false); setSecret(''); setConfirmation(''); }
  async function revoke(id: string) {
    setBusy(true); setError('');
    try { await post({ action: 'revokeCredential', id }); await refresh(); }
    catch (value) { setError(message(value)); }
    finally { setBusy(false); }
  }
  return <main className={styles.page}>
    <nav className={styles.top}><Link href="/"><img src="/brand/rainbow-logo-96.png" alt="" width="28" height="28" />RockstarOS</Link><Link href="/os/eve">Eve</Link></nav>
    <section className={styles.card} aria-labelledby="account-title" aria-busy={busy}>
      <p className={styles.eyebrow}>YOUR OWN SPACE</p>
      <h1 id="account-title">{complete || configured ? '自分のsmisとEveへ。' : mode === 'login' ? 'おかえりなさい。' : mode === 'recover' ? '続きを、取り戻そう。' : '登録して、はじめよう。'}</h1>
      <p className={styles.description}>{signedIn ? '今までの会話・仕事・成果を引き継ぎます。' : '自分のsmisとEveを、PixelでもWebでも。ChatGPTアカウントは必要ありません。'}</p>
      {recoveryCode ? <div className={styles.notice}>
        <h2>復旧コードを安全な場所に保存</h2><p>ログイン方法を失ったときに必要です。一度だけ表示します。パスワード管理アプリなどへ保存し、チャットや投稿には送らないでください。</p>
        <textarea aria-label="復旧コード" value={recoveryCode} readOnly rows={3} spellCheck={false} />
        <label><input type="checkbox" checked={saved} onChange={e => setSaved(e.target.checked)} />復旧コードを保存しました</label>
        <button className={styles.primary} disabled={!saved} onClick={() => window.location.assign(returnPath())}>smisへ進む</button>
      </div> : complete ? <div className={styles.success}>
        <svg width="52" height="52" viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="24" fill="#e6eee2" /><path d="m15 26 7 7 15-15" fill="none" stroke="#285541" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
        <h2>準備できました。</h2><p>同じアカウントで、続きから使えます。</p><button className={styles.primary} onClick={() => window.location.assign(returnPath())}>smisへ進む</button>
      </div> : <div className={styles.step} key={kind + ':' + mode}>
        {!signedIn && <div className={styles.tabs} aria-label="登録方法"><button disabled={busy} aria-pressed={mode === 'signup'} onClick={() => change('signup')}>新規登録</button><button disabled={busy} aria-pressed={mode === 'login'} onClick={() => change('login')}>ログイン</button></div>}
        {signedIn && configured && mode === 'add' && kind === 'password' ? <div className={styles.success}><p>ログインID：<strong>@{access?.passwordLogin?.handle}</strong></p><button className={styles.primary} onClick={() => window.location.assign(returnPath())}>smisへ進む</button></div> : <form onSubmit={e => { e.preventDefault(); void authenticate(); }} className={styles.form}>
          {mode === 'recover' && <div className={styles.recovery}><label>保存した復旧コード<input type="password" autoComplete="off" required value={recoveryInput} onChange={e => setRecoveryInput(e.target.value)} /></label><label><input type="checkbox" required checked={confirmRevoke} onChange={e => setConfirmRevoke(e.target.checked)} />古いログイン方法と端末接続を解除して復旧する</label><p>会話・仕事・成果は保持します。Pixelなどの端末は、復旧後に接続し直せます。</p></div>}
          {enteringPassword && <><label>ユーザーID<input name="username" type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} required pattern="[A-Za-z0-9][A-Za-z0-9_]{2,31}" minLength={3} maxLength={32} value={handle} onChange={e => setHandle(e.target.value)} placeholder="your_name" /><small>英数字と_で3〜32文字</small></label><label>{mode === 'recover' ? '新しいパスワード' : 'パスワード'}<input name="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={15} maxLength={128} value={secret} onChange={e => setSecret(e.target.value)} placeholder="15文字以上" /></label>{mode !== 'login' && <label>パスワードをもう一度<input name="password-confirmation" type="password" autoComplete="new-password" required minLength={15} maxLength={128} value={confirmation} onChange={e => setConfirmation(e.target.value)} /></label>}</>}
          {kind === 'passkey' && <p className={styles.hint}>{supported ? 'この端末のパスキー、または別の対応端末で本人確認します。' : 'このブラウザではパスキーを使えません。ユーザーIDとパスワードへ切り替えてください。'}</p>}
          {mode !== 'login' && mode !== 'recover' && <p className={styles.hint}>{signedIn ? '今のデータへログイン方法を追加します。Pixelの接続は保持します。' : '登録だけで請求や有料実行は始まりません。'}</p>}
          <button className={styles.primary} type="submit" disabled={busy || !access || kind === 'passkey' && !supported}><span className={busy ? styles.spinner : undefined} aria-hidden="true" />{busy ? '確認しています…' : kind === 'password' ? mode === 'login' ? 'ログイン' : mode === 'recover' ? '復旧して続ける' : '登録して続ける' : mode === 'login' ? 'パスキーでログイン' : mode === 'recover' ? '新しいパスキーで復旧' : 'パスキーを追加'}</button>
        </form>}
        <div className={styles.links}><button disabled={busy} onClick={() => change(mode === 'recover' ? 'recover' : signedIn ? 'add' : mode, kind === 'password' ? 'passkey' : 'password')}>{kind === 'password' ? 'パスキーを使う' : 'ユーザーIDとパスワードを使う'}</button><button disabled={busy} onClick={() => change(mode === 'recover' ? signedIn ? 'add' : 'login' : 'recover')}>{mode === 'recover' ? '戻る' : 'ログインできないとき'}</button>{signedIn && <button disabled={busy} onClick={() => void logout()}>ログアウト</button>}</div>
      </div>}
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {signedIn && !recoveryCode && <details className={styles.credentials}><summary>アカウントと端末の管理</summary><p>パスキー：{access?.credentials?.length ?? 0}個</p><ul>{access?.credentials?.map(c => <li key={c.id}><span>{c.label}<small>{new Date(c.createdAt).toLocaleDateString('ja-JP')} 登録</small></span><button disabled={busy || (access.credentials?.length ?? 0) < 2} onClick={() => void revoke(c.id)}>解除</button></li>)}</ul><button disabled={busy} onClick={() => change('login', 'passkey')}>パスキーで本人確認</button><p><Link href="/connect">接続済みの端末を管理</Link></p></details>}
      {!signedIn && !recoveryCode && <details className={styles.credentials}><summary>以前のアカウントを使っていた方</summary><p>既存アカウントでログイン後、同じデータへログイン方法を追加できます。</p><a href="/signin-with-chatgpt?return_to=%2Faccount" target="_top">以前のデータを引き継ぐ</a></details>}
    </section><p className={styles.footer}>RockstarOS 1.0 · Developer Preview</p>
  </main>;
}
