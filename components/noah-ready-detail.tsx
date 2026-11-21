'use client';
/* oxlint-disable react/react-compiler -- Synchronize owner-scoped asynchronous API state and clear it when the owner changes. */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import {
  noahRemoteFetch,
  type NoahReadyItem,
  type NoahRemoteConnectionView,
} from '@/lib/noah-remote-client';
import NoahConnectButton from './noah-connect-button';
import NoahAsk from './noah-ask';
import NoahWorkList from './noah-work-list';
import styles from './noah-ready.module.css';
export default function NoahReadyDetail({ agentId }: { agentId: string }) {
  const [item, setItem] = useState<NoahReadyItem | null>(null),
    [plan, setPlan] = useState<{
      planSha256: string;
      ownerScope: string | null;
    } | null>(null),
    [connection, setConnection] = useState<NoahRemoteConnectionView | null>(
      null,
    );
  const [error, setError] = useState(''),
    [reload, setReload] = useState(0),
    [busy, setBusy] = useState(false),
    [jobs, setJobs] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    setItem(null);
    setPlan(null);
    setConnection(null);
    void (async () => {
      const detail = await noahRemoteFetch<NoahReadyItem>(
        '/api/noah/intake?id=' + encodeURIComponent(agentId),
        { signal: controller.signal },
      );
      setItem(detail);
      const p = await noahRemoteFetch<{
        planSha256: string;
        ownerScope: string | null;
      }>('/api/noah/connect-plan?agent=' + encodeURIComponent(agentId), {
        signal: controller.signal,
      });
      setPlan(p);
      if (detail.connection)
        setConnection(
          await noahRemoteFetch<NoahRemoteConnectionView>(
            '/api/noah/connect/' + detail.connection.id,
            { signal: controller.signal },
          ),
        );
    })().catch((e) => {
      if (!controller.signal.aborted) setError(e.message);
    });
    return () => controller.abort();
  }, [agentId, reload]);
  // Recover a request whose response was lost. This GET cannot start a handshake or a job.
  useEffect(() => {
    if (
      !connection ||
      !['planned', 'entitling', 'preparing', 'probing'].includes(
        connection.state,
      )
    )
      return;
    const tick = () => {
      if (!document.hidden)
        void noahRemoteFetch<NoahRemoteConnectionView>(
          '/api/noah/connect/' + connection.id,
        )
          .then(setConnection)
          .catch((e) => setError(e.message));
    };
    const timer = setInterval(tick, 3000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [connection]);
  async function action(action: 'disconnect' | 'retry') {
    if (!connection || !plan?.ownerScope || busy) return;
    setBusy(true);
    setError('');
    try {
      const latest = await noahRemoteFetch<NoahRemoteConnectionView>(
        '/api/noah/connect/' + connection.id,
        { ownerScope: plan.ownerScope },
      );
      await noahRemoteFetch('/api/noah/connect/' + connection.id, {
        ownerScope: plan.ownerScope,
        body: { action, revision: latest.revision },
      });
      setConnection(
        await noahRemoteFetch<NoahRemoteConnectionView>(
          '/api/noah/connect/' + connection.id,
        ),
      );
      setJobs((v) => v + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作を確認できませんでした。');
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className={styles.page}>
      <Link className={styles.back} href="/noah/ready">
        <ArrowLeft size={18} />
        Agentを探す
      </Link>
      {error && (
        <div role="alert" className={styles.notice}>
          {error}
          <button onClick={() => setReload((v) => v + 1)}>再読み込み</button>
        </div>
      )}
      {!item && !error && <output>読み込んでいます…</output>}
      {item && (
        <>
          <header className={styles.detailHeading}>
            <span className={styles.eyebrow}>{item.provider}</span>
            <h1>{item.name}</h1>
            <p>{item.summary}</p>
            <div className={styles.tags}>
              <span>スマホで使える</span>
              <span>無料</span>
              <span>道具 {item.tools}個</span>
            </div>
          </header>
          <p className={styles.destination}>
            入力は <strong>{item.host}</strong> へ送られます。
          </p>
          {plan && (!connection || connection.state === 'disconnected') && (
            <NoahConnectButton
              key={connection?.id ?? agentId}
              agentId={agentId}
              {...plan}
              onConnected={setConnection}
            />
          )}
          {connection &&
            connection.state === 'connected' &&
            plan?.ownerScope && (
              <NoahAsk
                key={connection.id}
                connection={connection}
                ownerScope={plan.ownerScope}
                onSubmitted={() => setJobs((v) => v + 1)}
              />
            )}
          {connection &&
            ['planned', 'entitling', 'preparing', 'probing'].includes(
              connection.state,
            ) && <output>準備しています…</output>}
          {connection?.error && (
            <p role="alert" className={styles.error}>
              {connection.error}
            </p>
          )}
          {connection?.state === 'failed' && (
            <button
              className={styles.primary}
              disabled={busy}
              onClick={() => void action('retry')}
            >
              もう一度つなぐ
            </button>
          )}
          {connection && plan?.ownerScope && (
            <NoahWorkList
              key={connection.id}
              connectionId={connection.id}
              ownerScope={plan.ownerScope}
              refresh={jobs}
            />
          )}
          {connection && connection.state !== 'disconnected' && (
            <button
              className={styles.textButton}
              disabled={busy}
              onClick={() => void action('disconnect')}
            >
              接続を切る
            </button>
          )}
          <footer className={styles.footer}>
            <details>
              <summary>提供元と接続の詳細</summary>
              <p>相手のサーバー：{item.host}</p>
              <p>
                {item.checkedAt
                  ? `確認日 ${new Date(item.checkedAt).toLocaleDateString('ja-JP')}`
                  : '確認日を取得できません。'}
              </p>
              <p>出どころ：Official MCP Registry。説明は提供者の文です。</p>
              <p>
                送るのは入力した内容だけです。接続を切っても受け取った成果は残ります。
              </p>
            </details>
          </footer>
        </>
      )}
    </main>
  );
}
