'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import {
  noahRemoteFetch,
  NoahRemoteClientError,
  type NoahRemoteConnectionView,
} from '@/lib/noah-remote-client';
import styles from './noah-ready.module.css';
type Props = {
  agentId: string;
  ownerScope: string | null;
  planSha256: string;
  onConnected: (connection: NoahRemoteConnectionView) => void;
};
const HANDOFF = 'noah-connect-handoff';
export default function NoahConnectButton({
  agentId,
  ownerScope,
  planSha256,
  onConnected,
}: Props) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const once = useRef(false),
    inflight = useRef(false),
    operation = useRef<string | null>(null);
  const connect=useCallback(async (resumeId?: string) => {
    if (inflight.current) return;
    inflight.current = true;
    setBusy(true);
    setError('');
    const key = 'noah-connect:' + agentId;
    try {
      let saved: { id?: string; at?: number } | null = null;
      try {
        saved = JSON.parse(sessionStorage.getItem(key) ?? 'null');
      } catch {
        /* Storage may be unavailable. */
      }
      const id =
        resumeId ??
        operation.current ??
        (saved?.id &&
        typeof saved.at === 'number' &&
        Date.now() - saved.at < 600000 &&
        Date.now() >= saved.at
          ? saved.id
          : crypto.randomUUID());
      operation.current = id;
      try {
        sessionStorage.setItem(key, JSON.stringify({ id, at: Date.now() }));
      } catch {
        /* In-memory id still prevents double submits. */
      }
      if (!ownerScope) {
        sessionStorage.setItem(
          HANDOFF,
          JSON.stringify({ agentId, id, at: Date.now() }),
        );
        window.location.assign(
          '/account?returnTo=' +
            encodeURIComponent(
              '/noah/ready/agent?id=' + encodeURIComponent(agentId),
            ),
        );
        return;
      }
      const fresh = await noahRemoteFetch<{
        planSha256: string;
        ownerScope: string;
      }>('/api/noah/connect-plan?agent=' + encodeURIComponent(agentId));
      if (fresh.ownerScope !== ownerScope)
        throw new Error('アカウントが変わりました。再読み込みしてください。');
      // Refresh after the account handoff. A normal click must approve the plan it displayed.
      const connection = await noahRemoteFetch<NoahRemoteConnectionView>(
        '/api/noah/connect',
        {
          ownerScope,
          body: {
            id,
            agentId,
            planSha256: resumeId ? fresh.planSha256 : planSha256,
          },
        },
      );
      const readback = await noahRemoteFetch<NoahRemoteConnectionView>(
        '/api/noah/connect/' + connection.id,
      );
      if (
        ['connected', 'failed', 'blocked', 'disconnected'].includes(
          readback.state,
        )
      ) {
        operation.current = null;
        try {
          sessionStorage.removeItem(key);
          sessionStorage.removeItem(HANDOFF);
        } catch {
          /* Optional cache. */
        }
      }
      onConnected(readback);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : '接続できませんでした。もう一度お試しください。',
      );
      if (e instanceof NoahRemoteClientError && e.status === 409) {
        operation.current = null;
        try {
          sessionStorage.removeItem(key);
        } catch {
          /* Optional cache. */
        }
      }
    } finally {
      inflight.current = false;
      setBusy(false);
    }
  },[agentId,ownerScope,planSha256,onConnected]);
  useEffect(() => {
    if (!ownerScope || once.current) return;
    once.current = true;
    try {
      const value = JSON.parse(sessionStorage.getItem(HANDOFF) ?? 'null');
      if (
        value?.agentId === agentId &&
        typeof value.id === 'string' &&
        typeof value.at === 'number' &&
        Date.now() >= value.at &&
        Date.now() - value.at < 600000
      )
        queueMicrotask(()=>void connect(value.id));
    } catch {
      /* Invalid handoff never auto-starts. */
    }
  }, [agentId, ownerScope, connect]);
  return (
    <div>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <button
        className={styles.primary}
        disabled={busy}
        onClick={() => void connect()}
      >
        {busy ? '準備しています…' : '接続する'}
      </button>
      {!ownerScope && (
        <p className={styles.muted}>
          接続時にサインインします。戻るとそのまま続けられます。
        </p>
      )}
    </div>
  );
}
