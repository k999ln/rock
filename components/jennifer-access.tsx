'use client';

import { useCallback, useEffect, useState } from 'react';
import { Fingerprint, KeyRound, LockKeyhole, ShieldCheck } from 'lucide-react';
import { requestExecutionAccessCheck } from './execution-access';

type AccessState = 'checking' | 'ready' | 'setup' | 'signed-out' | 'unavailable';
type AccessStatus = {
  authenticated?: boolean;
  method?: string;
  setupAvailable?: boolean;
  recovery?: boolean;
};

function bytes(value: string) {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function encoded(value: ArrayBuffer) {
  const data = new Uint8Array(value);
  let binary = '';
  for (const byte of data) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

async function post<T>(path: string, value: unknown) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(value),
    cache: 'no-store',
  });
  const body = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(body.error || 'PASSKEY_FAILED');
  return body;
}

function publicKeyCreation(options: Record<string, unknown>) {
  const user = options.user as Record<string, unknown>;
  return {
    ...options,
    challenge: bytes(options.challenge as string),
    user: { ...user, id: bytes(user.id as string) },
    excludeCredentials: ((options.excludeCredentials as Array<Record<string, unknown>>) ?? [])
      .map((credential) => ({ ...credential, id: bytes(credential.id as string) })),
  } as unknown as PublicKeyCredentialCreationOptions;
}

function publicKeyRequest(options: Record<string, unknown>) {
  return { ...options, challenge: bytes(options.challenge as string) } as PublicKeyCredentialRequestOptions;
}

function message(error: unknown) {
  if (error instanceof DOMException && error.name === 'NotAllowedError')
    return 'パスキー操作はキャンセルされました。何も変更していません。';
  const code = error instanceof Error ? error.message : 'PASSKEY_FAILED';
  if (code === 'UNAUTHORIZED') return '初回設定または復旧の確認が切れました。もう一度、本人用データの引き継ぎから進めてください。';
  if (code.includes('COUNTER')) return 'このパスキーの安全性を確認できませんでした。復旧から新しいパスキーを登録してください。';
  if (code.includes('CHALLENGE')) return '確認の有効時間が切れました。もう一度パスキーを開いてください。';
  if (code.includes('USER_VERIFICATION')) return '端末のロック解除による本人確認が必要です。';
  return 'Jenniferのパスキーを確認できませんでした。通信を確認して、もう一度お試しください。';
}

export function useJenniferAccess() {
  const [state, setState] = useState<AccessState>('checking');
  const [recovery, setRecovery] = useState(false);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    setState('checking'); setError('');
    try {
      const response = await fetch('/api/jennifer/access', { cache: 'no-store' });
      const status = await response.json() as AccessStatus;
      if (!response.ok) throw new Error('AUTH_UNAVAILABLE');
      setRecovery(status.recovery === true);
      setState(status.authenticated && status.method === 'passkey'
        ? 'ready' : status.setupAvailable ? 'setup' : 'signed-out');
    } catch { setState('unavailable'); }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => { void refresh(); }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);
  return { state, recovery, error, setError, setState, refresh };
}

export function JenniferAccess({ access }: { access: ReturnType<typeof useJenniferAccess> }) {
  const [busy, setBusy] = useState(false);
  const supported = typeof window !== 'undefined' && Boolean(window.PublicKeyCredential && navigator.credentials);

  async function authenticate() {
    if (busy || !supported) return;
    setBusy(true); access.setError('');
    try {
      const options = await post<{ challengeId: string; publicKey: Record<string, unknown> }>(
        '/api/jennifer/passkeys/authenticate', { action: 'options' },
      );
      const credential = await navigator.credentials.get({ publicKey: publicKeyRequest(options.publicKey) });
      if (!(credential instanceof PublicKeyCredential) || !(credential.response instanceof AuthenticatorAssertionResponse))
        throw new Error('PASSKEY_INVALID');
      await post('/api/jennifer/passkeys/authenticate', {
        action: 'verify', challengeId: options.challengeId,
        credential: {
          id: encoded(credential.rawId), rawId: encoded(credential.rawId), type: credential.type,
          authenticatorAttachment: credential.authenticatorAttachment,
          clientExtensionResults: credential.getClientExtensionResults(),
          response: {
            clientDataJSON: encoded(credential.response.clientDataJSON),
            authenticatorData: encoded(credential.response.authenticatorData),
            signature: encoded(credential.response.signature),
            userHandle: credential.response.userHandle ? encoded(credential.response.userHandle) : undefined,
          },
        },
      });
      access.setState('ready'); requestExecutionAccessCheck();
    } catch (cause) { access.setError(message(cause)); }
    finally { setBusy(false); }
  }

  async function register() {
    if (busy || !supported) return;
    setBusy(true); access.setError('');
    try {
      const options = await post<{ challengeId: string; publicKey: Record<string, unknown> }>(
        '/api/jennifer/passkeys/register', { action: 'options' },
      );
      const credential = await navigator.credentials.create({ publicKey: publicKeyCreation(options.publicKey) });
      if (!(credential instanceof PublicKeyCredential) || !(credential.response instanceof AuthenticatorAttestationResponse))
        throw new Error('PASSKEY_INVALID');
      await post('/api/jennifer/passkeys/register', {
        action: 'verify', challengeId: options.challengeId,
        credential: {
          id: encoded(credential.rawId), rawId: encoded(credential.rawId), type: credential.type,
          authenticatorAttachment: credential.authenticatorAttachment,
          clientExtensionResults: credential.getClientExtensionResults(),
          response: {
            clientDataJSON: encoded(credential.response.clientDataJSON),
            attestationObject: encoded(credential.response.attestationObject),
            transports: credential.response.getTransports(),
          },
        },
      });
      access.setState('ready'); requestExecutionAccessCheck();
    } catch (cause) { access.setError(message(cause)); }
    finally { setBusy(false); }
  }

  if (access.state === 'ready') return null;
  const returnTo = '/chat?setup=passkey';
  return <section className="jennifer-access" aria-labelledby="jennifer-access-title">
    <div className="jennifer-access-mark" aria-hidden="true"><Fingerprint /></div>
    <p className="jennifer-access-kicker">JENNIFER · PRIVATE ACCESS</p>
    <h1 id="jennifer-access-title">Jenniferを開く</h1>
    <p className="jennifer-access-lead">
      プロジェクト、担当AI、Zemaの証拠は本人の領域です。この端末のパスキーで開きます。
    </p>
    <div className="jennifer-access-points" aria-label="保護内容">
      <span><LockKeyhole size={16} /> パスワードを保存しない</span>
      <span><ShieldCheck size={16} /> 端末のロック解除で確認</span>
      <span><KeyRound size={16} /> 30日ごとに再確認</span>
    </div>
      {access.state === 'checking' ? <output>この端末のJennifer Accessを確認しています…</output> : <>
      {!supported && <p role="alert" className="jennifer-access-error">このブラウザはパスキーに対応していません。対応ブラウザで開いてください。</p>}
      {access.state !== 'setup' && <button className="jennifer-access-primary" type="button" disabled={busy || !supported} onClick={() => void authenticate()}>
        <Fingerprint size={19} /> {busy ? 'パスキーを確認中…' : 'パスキーで開く'}
      </button>}
      {access.state === 'setup' && <button className="jennifer-access-primary" type="button" disabled={busy || !supported} onClick={() => void register()}>
        <KeyRound size={19} /> {busy ? 'パスキーを登録中…' : access.recovery ? '新しいパスキーへ置き換える' : 'この端末にJenniferを登録'}
      </button>}
      {access.state === 'setup' && access.recovery && <p className="jennifer-access-recovery-warning">
        復旧として新しいパスキーを登録します。登録が完了すると、紛失した端末を含む以前のJenniferパスキーとセッションはすべて失効します。
      </p>}
      {access.error && <p role="alert" className="jennifer-access-error">{access.error}</p>}
      {access.state === 'signed-out' && <div className="jennifer-access-recovery">
        <strong>初回設定・端末紛失時</strong>
        <p>既存の本人用プロジェクトを別の人へ渡さないため、現在のアカウントを一度だけ照合してパスキーを登録します。通常利用では表示しません。</p>
        <a href={`/signin-with-chatgpt?return_to=${encodeURIComponent(returnTo)}`}>本人用データを引き継いで設定</a>
      </div>}
      {access.state === 'unavailable' && <button type="button" className="jennifer-access-secondary" onClick={() => void access.refresh()}>接続を再確認</button>}
    </>}
    <small>Jenniferは確認なしに外部送信・公開・支払い・認証変更を実行しません。</small>
  </section>;
}

