'use client';

import { useEffect, useState, type SyntheticEvent } from 'react';
import Link from 'next/link';
import styles from '@/components/sky-commerce.module.css';

type DeviceAuthorization = { clientName: string; expiresAt: number };
type DeviceSession = { id: string; deviceName: string; createdAt: number; lastUsedAt: number | null; expiresAt: number };

function friendlyTime(value: number) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(value);
}

export function RockstarDeviceAuthorization({ initialCode = '' }: { initialCode?: string }) {
  const [code, setCode] = useState(initialCode.slice(0, 8).toUpperCase());
  const [authorization, setAuthorization] = useState<DeviceAuthorization | null>(null);
  const [sessions, setSessions] = useState<DeviceSession[]>([]);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function refreshSessions() {
    const response = await fetch('/api/rockstar/device-sessions', { cache: 'no-store' });
    if (response.status === 401) { setSignedIn(false); return; }
    if (!response.ok) throw new Error('端末セッションを読み込めませんでした。');
    const result = await response.json() as { sessions: DeviceSession[] };
    setSessions(result.sessions);
    setSignedIn(true);
  }

  useEffect(() => {
    let active = true;
    fetch('/api/rockstar/device-sessions', { cache: 'no-store' })
      .then(async (response) => {
        if (!active) return;
        if (response.status === 401) { setSignedIn(false); return; }
        if (!response.ok) throw new Error('端末の状態を読み込めませんでした。');
        const result = await response.json() as { sessions: DeviceSession[] };
        if (!active) return;
        setSessions(result.sessions);
        setSignedIn(true);
      })
      .catch(() => { if (active) setMessage('端末の状態を読み込めませんでした。'); });
    return () => { active = false; };
  }, []);

  async function inspect(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage(''); setAuthorization(null); setBusy(true);
    try {
      const response = await fetch(`/api/rockstar/device-authorizations/approve?user_code=${encodeURIComponent(code)}`, { cache: 'no-store' });
      const result = await response.json() as { authorization?: DeviceAuthorization; error?: string };
      if (response.status === 401) { setSignedIn(false); return; }
      if (!response.ok || !result.authorization) throw new Error(result.error === 'device_code_invalid_expired_or_used'
        ? 'コードが見つからないか、有効期限切れです。端末で新しいコードを表示してください。'
        : '端末コードを確認できませんでした。');
      setAuthorization(result.authorization);
    } catch (error) { setMessage(error instanceof Error ? error.message : '端末コードを確認できませんでした。'); }
    finally { setBusy(false); }
  }

  async function decide(action: 'approve' | 'deny') {
    setMessage(''); setBusy(true);
    try {
      const response = await fetch('/api/rockstar/device-authorizations/approve', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, userCode: code }),
      });
      if (!response.ok) throw new Error('端末の認証コードが期限切れか、すでに使用されています。');
      setAuthorization(null);
      setMessage(action === 'approve' ? '端末をRockstar IDに接続しました。端末へ戻ってください。'
        : '端末の接続を拒否しました。');
      await refreshSessions();
    } catch (error) { setMessage(error instanceof Error ? error.message : '端末の登録に失敗しました。'); }
    finally { setBusy(false); }
  }

  async function revoke(id: string) {
    setMessage(''); setBusy(true);
    try {
      const response = await fetch('/api/rockstar/device-sessions', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }),
      });
      if (!response.ok) throw new Error('端末の接続を解除できませんでした。');
      await refreshSessions();
      setMessage('端末の接続を解除しました。');
    } catch (error) { setMessage(error instanceof Error ? error.message : '端末の接続を解除できませんでした。'); }
    finally { setBusy(false); }
  }

  return <>
    <section className={styles.esimCatalog} aria-labelledby="device-link-title">
      <div className={styles.esimCatalogTitle}>
        <h1 id="device-link-title">RockstarOS端末を接続</h1>
        <p>端末に表示された8文字のコードを確認します。承認すると、このRockstar ID専用の端末セッションが発行されます。端末の接続はいつでも取り消せます。</p>
      </div>
      {signedIn === false ? <div className={styles.notice}>
        <p>端末を接続するにはRockstar IDでサインインしてください。</p>
        <Link href="/signin-with-chatgpt?return_to=%2Fconnect%2Fdevice" target="_top">サインインして続ける</Link>
      </div> : <form className={styles.offerForm} onSubmit={inspect}>
        <label htmlFor="rockstar-device-code">端末に表示されたコード</label>
        <input id="rockstar-device-code" autoComplete="one-time-code" autoCapitalize="characters"
          maxLength={8} minLength={8} pattern="[A-HJ-NP-Z2-9]{8}" value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())} />
        <button className={styles.primary} type="submit" disabled={busy || code.length !== 8}>
          {busy ? '端末を確認中…' : '端末を確認'}
        </button>
      </form>}
      {authorization && <div className={styles.notice}>
        <p><strong>{authorization.clientName}</strong> がこのRockstar IDへの接続を求めています。</p>
        <p>コード有効期限: {friendlyTime(authorization.expiresAt)}</p>
        <div className={styles.esimPlanList}>
          <button className={styles.primary} disabled={busy} onClick={() => void decide('approve')}>この端末を承認</button>
          <button disabled={busy} onClick={() => void decide('deny')}>拒否</button>
        </div>
      </div>}
      {message && <output className={styles.notice} aria-live="polite">{message}</output>}
    </section>
    {signedIn && <section className={styles.esimCatalog} aria-labelledby="device-sessions-title">
      <div className={styles.esimCatalogTitle}>
        <h2 id="device-sessions-title">接続中の端末</h2>
        <p>端末の接続を取り消すと、その端末のクラウドAPIセッションは直ちに使用できなくなります。</p>
      </div>
      {sessions.length === 0 ? <p>登録された端末はありません。</p> : <ul>
        {sessions.map((session) => <li key={session.id}>
          <strong>{session.deviceName}</strong> — 期限 {friendlyTime(session.expiresAt)}
          <button disabled={busy} onClick={() => void revoke(session.id)}>接続を解除</button>
        </li>)}
      </ul>}
    </section>}
  </>;
}
