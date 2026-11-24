'use client';

import { useCallback, useEffect, useRef, useState, type SyntheticEvent } from 'react';
import Link from 'next/link';
import styles from '@/components/sky-commerce.module.css';
import { operationRequest, OperationRequestError, OperationResponseError } from '@/lib/operations-client';

type DeviceAuthorization = { clientName: string; expiresAt: number };
type DeviceSession = { id: string; deviceName: string; createdAt: number; lastUsedAt: number | null; expiresAt: number };

function friendlyTime(value: number) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(value);
}

export function RockstarDeviceAuthorization({ initialCode = '', noah = false }: { initialCode?: string; noah?: boolean }) {
  const [code, setCode] = useState(initialCode.slice(0, 8).toUpperCase());
  const [authorization, setAuthorization] = useState<(DeviceAuthorization & { userCode: string }) | null>(null);
  const [sessions, setSessions] = useState<DeviceSession[]>([]);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const requestVersion = useRef(0);

  const fail = useCallback((error: unknown, mutation = false) => {
    const unauthorized = error instanceof OperationRequestError && error.status === 401;
    const uncertain = error instanceof OperationResponseError || (error instanceof OperationRequestError && error.status >= 500);
    requestVersion.current++;
    setAuthorization(null);
    setSessions([]);
    setSignedIn(unauthorized ? false : null);
    setMessage(unauthorized ? (noah ? 'Noahの保存先を確認してください。' : 'サインインを確認してください。') : mutation && uncertain
      ? '操作結果が不明です。端末側の接続状態と接続中の端末を再確認してください。承認や解除は自動再送しません。'
      : '端末の状態を確認できませんでした。接続状態を再確認し、必要なら端末コードを確認し直してください。');
  }, [noah]);

  const readSessions = useCallback(async () => {
    const result = await operationRequest<{ sessions: DeviceSession[] }>(noah ? '/api/noah/devices' : '/api/rockstar/device-sessions');
    if (!Array.isArray(result.sessions)) throw new OperationResponseError('INVALID_RESPONSE');
    return result.sessions;
  }, [noah]);

  async function refreshSessions() {
    const version = ++requestVersion.current;
    setBusy(true);
    setAuthorization(null);
    try {
      const currentSessions = await readSessions();
      if (version !== requestVersion.current) return;
      setSessions(currentSessions); setSignedIn(true);
    } catch (error) { if (version === requestVersion.current) fail(error); }
    finally { setBusy(false); }
  }

  useEffect(() => {
    let active = true;
    const version = ++requestVersion.current;
    readSessions()
      .then((result) => {
        if (!active || version !== requestVersion.current) return;
        setSessions(result);
        setSignedIn(true);
      })
      .catch((error) => { if (active && version === requestVersion.current) fail(error); });
    return () => { active = false; };
  }, [fail, readSessions]);

  async function inspect(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || signedIn !== true || !/^[A-HJ-NP-Z2-9]{8}$/.test(code)) return;
    const version = ++requestVersion.current;
    const userCode = code;
    setMessage(''); setAuthorization(null); setBusy(true);
    try {
      const result = await operationRequest<{ authorization?: DeviceAuthorization }>(`${noah ? '/api/noah/devices' : '/api/rockstar/device-authorizations/approve'}?user_code=${encodeURIComponent(userCode)}`);
      if (version !== requestVersion.current) return;
      if (!result.authorization || typeof result.authorization.clientName !== 'string' || !Number.isFinite(result.authorization.expiresAt))
        throw new OperationResponseError('INVALID_RESPONSE');
      setAuthorization({ ...result.authorization, userCode });
    } catch (error) {
      if (version !== requestVersion.current) return;
      if (error instanceof OperationRequestError && error.status === 404) {
        setMessage('コードが見つからないか、有効期限切れ・使用済みです。承認後の場合は、下の接続中の端末と端末側の状態を確認してください。');
        await refreshSessions();
      } else fail(error);
    }
    finally { setBusy(false); }
  }

  async function decide(action: 'approve' | 'deny') {
    if (busy || signedIn !== true || !authorization || authorization.userCode !== code) return;
    requestVersion.current++;
    setMessage(''); setBusy(true);
    try {
      const result = await operationRequest<{ state: string }>(noah ? '/api/noah/devices' : '/api/rockstar/device-authorizations/approve', 'POST', { action, userCode: authorization.userCode });
      if (result.state !== (action === 'approve' ? 'approved' : 'denied')) throw new OperationResponseError('INVALID_RESPONSE');
      setAuthorization(null);
      setCode('');
      setMessage(action === 'approve' ? '端末の接続を承認しました。このコードは使用済みです。端末へ戻って接続状態を確認してください。一覧にまだ表示されない場合は「端末の状態を再確認」を押してください。'
        : '端末の接続を拒否しました。');
      await refreshSessions();
    } catch (error) { fail(error, true); }
    finally { setBusy(false); }
  }

  async function revoke(id: string) {
    if (busy || signedIn !== true) return;
    requestVersion.current++;
    setMessage(''); setBusy(true);
    try {
      const result = await operationRequest<{ revoked: boolean }>(noah ? '/api/noah/devices' : '/api/rockstar/device-sessions', noah ? 'POST' : 'DELETE', noah ? { action: 'revoke', id } : { id });
      if (result.revoked !== true) throw new OperationResponseError('INVALID_RESPONSE');
      await refreshSessions();
      setMessage('端末の接続を解除しました。');
    } catch (error) { fail(error, true); }
    finally { setBusy(false); }
  }

  return <>
    <section className={styles.esimCatalog} aria-labelledby="device-link-title">
      <div className={styles.esimCatalogTitle}>
        <h1 id="device-link-title">NoahにMacを接続</h1>
        <p>Macに表示された8文字のコードと端末名を確認します。承認すると、そのMacがNoahの依頼を受け取り、結果を返せるようになります。接続はいつでも取り消せます。</p>
        {noah && <p>このブラウザのNoahにある仕事と成果だけをつなぎます。画面操作はMac内の専用環境で行います。新しい会員登録は不要です。</p>}
      </div>
      {signedIn === false ? <div className={styles.notice}>
        {noah ? <><p>Noahの保存先を確認できません。元のブラウザでNoahを開き直してから再確認してください。</p><Link href="/noah">Noahへ戻る</Link></> : <>
          <p>この接続方法では、NoahとEveで使っているアカウントの本人確認が必要です。</p>
          <Link href={`/account?mode=login&returnTo=${encodeURIComponent(`/connect/device${/^[A-HJ-NP-Z2-9]{8}$/.test(code) ? `?user_code=${code}` : ''}`)}`} target="_blank" rel="noopener noreferrer">サインインして続ける</Link>
          <p>別タブでサインイン後、この画面で端末の状態を再確認してください。</p>
        </>}
      </div> : signedIn === null ? <p>端末の状態を確認してから接続操作を行ってください。</p> : <form className={styles.offerForm} onSubmit={inspect}>
        <label htmlFor="rockstar-device-code">端末に表示されたコード</label>
        <input id="rockstar-device-code" autoComplete="one-time-code" autoCapitalize="characters"
          maxLength={8} minLength={8} pattern="[A-HJ-NP-Z2-9]{8}" value={code} disabled={busy}
          onChange={(event) => { requestVersion.current++; setCode(event.target.value.toUpperCase()); setAuthorization(null); setMessage(''); }} />
        <button className={styles.primary} type="submit" disabled={busy || code.length !== 8}>
          {busy ? '端末を確認中…' : '端末を確認'}
        </button>
      </form>}
      {signedIn === true && authorization && authorization.userCode === code && <div className={styles.notice}>
        <p><strong>{authorization.clientName}</strong> がNoahへの接続を求めています。</p>
        <p>コード有効期限: {friendlyTime(authorization.expiresAt)}</p>
        <div className={styles.esimPlanList}>
          <button className={styles.primary} disabled={busy} onClick={() => void decide('approve')}>この端末を承認</button>
          <button disabled={busy} onClick={() => void decide('deny')}>拒否</button>
        </div>
      </div>}
      {message && <output className={styles.notice} aria-live="polite">{message}</output>}
      <button type="button" disabled={busy} onClick={() => void refreshSessions()}>端末の状態を再確認</button>
    </section>
    {signedIn && <section className={styles.esimCatalog} aria-labelledby="device-sessions-title">
      <div className={styles.esimCatalogTitle}>
        <h2 id="device-sessions-title">接続中の端末</h2>
        <p>{noah ? '接続を取り消すと、そのMacはNoahの依頼や成果にアクセスできなくなります。' : '端末の接続を取り消すと、その端末のクラウドAPIセッションは直ちに使用できなくなります。'}</p>
      </div>
      {sessions.length === 0 ? <p>登録された端末はありません。</p> : <ul>
        {sessions.map((session) => <li key={session.id}>
          <strong>{session.deviceName}</strong> — 期限 {friendlyTime(session.expiresAt)}
          <button disabled={busy} onClick={() => void revoke(session.id)}>接続を解除</button>
        </li>)}
      </ul>}
      {noah ? <details><summary>接続しても仕事が始まらない場合</summary>
        <p>この一覧はMacとの接続状態です。Macの起動と専用環境の準備を確認し、Noahの実行中で依頼の状態を確認してください。</p>
        <Link href="/noah/activity">Noahの実行中を確認</Link>
      </details> : <details><summary>接続してもEveを使えない場合</summary>
        <p>この一覧で確認できるのはアカウントとの接続です。端末の応答、実行サービス、モデルの準備はここでは未確認です。</p>
        <ol><li>同じアカウントでサインインしているか確認します。</li><li>端末を起動し、端末側の同期状態を確認します。</li><li>Eveで実行先と準備済みモデルを確認します。</li></ol>
        <Link href="/os/eve">Eveで実行先を確認</Link>
      </details>}
    </section>}
  </>;
}
