'use client';
import { useEffect, useState } from 'react';
import type { NoahReadyConnection } from '@/lib/noah-ready-view';
import NoahAsk from './noah-ask';
import NoahConnectButton from './noah-connect-button';
import NoahWorkList from './noah-work-list';
import styles from './noah-agent-catalog.module.css';

type Match = { id: string; name: string; connection: NoahReadyConnection | null };
type Lookup = { status: 'loading' | 'unlisted' } | { status: 'error'; message: string } | { status: 'ready'; match: Match };

export default function NoahEngineeringMcpTrial({ id, ownerScope }: { id: string; ownerScope: string }) {
  const [lookup, setLookup] = useState<Lookup>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0), [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const res = await fetch('/api/noah/intake?' + new URLSearchParams({ engineeringAgent: id }), { signal: controller.signal, cache: 'no-store' });
        if (controller.signal.aborted) return;
        if (res.status === 404) { setLookup({ status: 'unlisted' }); return; }
        const data = await res.json() as { ownerScope?: string; match?: Match | null; error?: string };
        if (controller.signal.aborted) return;
        if (!res.ok) throw new Error(data.error || '接続できる道具を確認できませんでした。');
        if (data.ownerScope !== ownerScope) throw new Error('アカウントが変わりました。Agentを選び直してください。');
        setLookup(data.match ? { status: 'ready', match: data.match } : { status: 'unlisted' });
      } catch (err) {
        if (!controller.signal.aborted) setLookup({ status: 'error', message: err instanceof Error ? err.message : '接続できる道具を確認できませんでした。' });
      }
    })();
    return () => controller.abort();
  }, [id, ownerScope, attempt]);
  if (lookup.status === 'loading') return <output>Noahで使える道具を確認しています…</output>;
  if (lookup.status === 'error') return <p role="alert">{lookup.message} <button onClick={() => { setLookup({ status: 'loading' }); setAttempt(n => n + 1); }}>確認し直す</button></p>;
  if (lookup.status !== 'ready') return <p>この接続先は、今は接続の確認まで試せます。Noahで入力を送るには、接続先と道具の掲載・確認が必要です。</p>;
  const { match } = lookup;
  return <section className={styles.notice} aria-label="MCPの試行">
    <h2>道具に入力して試す</h2>
    <p>{match.name}</p>
    <NoahConnectButton agentId={match.id} listed signedIn ownerScope={ownerScope} connection={match.connection} askAs="none"
      onChange={connection => setLookup({ status: 'ready', match: { ...match, connection } })} />
    {match.connection?.state === 'connected' && <NoahAsk key={match.connection.id} agentId={match.id} agentName={match.name}
      connectionId={match.connection.id} ownerScope={ownerScope} onUnusable={() => setLookup({ status: 'error', message: '接続が変わりました。最新の状態を確認してください。' })}
      onAsked={() => setRefresh(n => n + 1)} />}
    <div id="noah-agent-work" tabIndex={-1}><NoahWorkList agentId={match.id} ownerScope={ownerScope} refresh={refresh} /></div>
  </section>;
}
