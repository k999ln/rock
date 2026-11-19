'use client';
import { useState } from 'react';
import { OWNER_SCOPE_HEADER } from '@/lib/owner-intent';
import styles from './noah-local-connection.module.css';

export default function NoahCloudConnection({ id, ownerScope }: { id: string; ownerScope: string }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function connect() {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const result = await fetch(`/__noah/connections/${id}/cloud`, { method: 'POST', headers: { 'Content-Type': 'application/json', [OWNER_SCOPE_HEADER]: ownerScope }, body: '{}', signal: AbortSignal.timeout(15000) });
      const data = await result.json() as { url?: string; error?: string };
      if (!result.ok || !data.url) throw new Error(data.error || 'クラウドに接続できません。');
      const target = new URL(data.url);
      if (target.protocol !== 'https:' || !/^avokado-noah-test-runtime\.[a-z0-9-]+\.workers\.dev$/.test(target.hostname)) throw new Error('接続先を確認できません。');
      window.location.assign(target.href);
    } catch (e) { setError((e as Error).message); setBusy(false); }
  }
  return <section className={styles.panel} aria-label="クラウド運用">
    <div className={styles.heading}><div><span className={styles.tag}>Macを閉じても続ける</span><h2>クラウドで運用する</h2></div></div>
    <p>このテストAgentをクラウドで動かせます。接続後は、クラウド側のNoahで運用開始・停止と結果確認ができます。</p>
    <div className={styles.actions}><button className={styles.primary} disabled={busy || !ownerScope} onClick={() => void connect()}>{busy ? 'クラウドに接続しています…' : 'クラウドで管理'}</button></div>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <p className={styles.note}>初回接続後はMacの起動が不要です。クラウドのURLをブックマークして使えます。このMacの運用とは別に開始・停止します。</p>
  </section>;
}
