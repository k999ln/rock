'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { OWNER_SCOPE_HEADER } from '@/lib/owner-intent';
import { isNoahTrainingPlugin, noahTrainingPlugin } from '@/lib/noah-training-plugin';
import type { NoahUpload } from '@/lib/noah-agent-store';
import { useNoahLocale } from './noah-locale';
import styles from './noah-project-detail.module.css';

export default function NoahTrainingPlugin() {
  const { t } = useNoahLocale();
  const [installed, setInstalled] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const pending = useRef<{ id: string; scope: string } | null>(null), flight = useRef(false), generation = useRef(0);
  useEffect(() => {
    const invalidate = () => { generation.current++; };
    const clear = () => { generation.current++; pending.current = null; setInstalled(''); setError(''); };
    const storage = (event: StorageEvent) => { if (!event.key || event.key.startsWith('rockstar.community.')) clear(); };
    window.addEventListener('rockstar-community-changed', clear); window.addEventListener('storage', storage);
    return () => { invalidate(); window.removeEventListener('rockstar-community-changed', clear); window.removeEventListener('storage', storage); };
  }, []);
  async function add() {
    if (flight.current) return;
    flight.current = true; setBusy(true); setError('');
    const current = generation.current;
    try {
      const response = await fetch('/api/noah/agents', { cache: 'no-store' });
      const body = await response.json() as { agents?: NoahUpload[]; ownerScope?: string; error?: string };
      if (current !== generation.current) return;
      if (!response.ok || !body.ownerScope || !Array.isArray(body.agents)) throw Error(body.error || '保存先を確認できません。');
      const existing = body.agents.find(agent => agent.uploadState === 'ready' && isNoahTrainingPlugin(agent.manifest));
      if (existing) { setInstalled(existing.id); return; }
      if (pending.current?.scope !== body.ownerScope) pending.current = { id: crypto.randomUUID(), scope: body.ownerScope };
      const intent = pending.current;
      const saved = await fetch('/api/noah/agents', { method: 'POST', headers: { 'Content-Type': 'application/json', [OWNER_SCOPE_HEADER]: intent.scope },
        body: JSON.stringify({ id: intent.id, manifest: noahTrainingPlugin, rightsConfirmed: true }) });
      const result = await saved.json() as { agent?: NoahUpload; error?: string };
      if (current !== generation.current) return;
      if (!saved.ok || result.agent?.id !== intent.id || result.agent.uploadState !== 'ready' || !isNoahTrainingPlugin(result.agent.manifest)) throw Error(result.error || '追加を確認できません。同じ操作で再確認できます。');
      setInstalled(result.agent.id); pending.current = null;
    } catch (e) { if (current === generation.current) setError(e instanceof Error ? e.message : '追加できませんでした。'); }
    finally { flight.current = false; setBusy(false); }
  }
  return <div className={styles.pluginAction}>
    {installed ? <Link className={styles.primary} href={`/noah/agents/${installed}`}>{t('プラグインを開く')}</Link>
      : <button className={styles.primary} type="button" disabled={busy} onClick={() => void add()}>{t(busy ? '追加中…' : 'プラグインを追加')}</button>}
    {installed && <output>{t('自分のAgentに追加済み')}</output>}
    {error && <span role="alert">{t(error)}</span>}
  </div>;
}
