'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Bot, Box, ArrowUpRight, Plus, RefreshCw } from 'lucide-react';
import { skyAgentEvePath, type SkyLibraryAgent } from '@/lib/sky-agent-library';
import type { SkyHubPlugin } from '@/lib/sky-hub';
import styles from './smis-added-posts.module.css';

type Collection = { owner: string; agents: SkyLibraryAgent[]; plugins: SkyHubPlugin[] };
export default function SmisAddedPosts() {
  const [collection, setCollection] = useState<Collection | null>(null);
  const [state, setState] = useState<'loading'|'ready'|'signed-out'|'error'>('loading');
  const [retry, setRetry] = useState(0), [expanded, setExpanded] = useState(false);
  useEffect(() => {
    let current: AbortController | null = null;
    const refresh = async () => {
      current?.abort();
      const controller = new AbortController(); current = controller;
      setCollection(null); setState('loading');
      try {
        const [agentResponse, hubResponse] = await Promise.all(['/api/sky/agents', '/api/sky/hub'].map(url => fetch(url, { cache: 'no-store', credentials: 'same-origin', signal: controller.signal })));
        if (controller.signal.aborted) return;
        if (agentResponse.status === 401 || hubResponse.status === 401) { setState('signed-out'); return; }
        const agents = await agentResponse.json() as { ownerUserId?: string; agents?: SkyLibraryAgent[] };
        const hub = await hubResponse.json() as { ownerUserId?: string; plugins?: SkyHubPlugin[] };
        if (!agentResponse.ok || !hubResponse.ok || !agents.ownerUserId || agents.ownerUserId !== hub.ownerUserId || !Array.isArray(agents.agents) || !Array.isArray(hub.plugins)) throw Error('collection unavailable');
        if (!controller.signal.aborted) { setCollection({ owner: agents.ownerUserId, agents: agents.agents, plugins: hub.plugins }); setState('ready'); }
      } catch { if (!controller.signal.aborted) setState('error'); }
    };
    const frame = requestAnimationFrame(() => { void refresh(); });
    const changed = () => { if (!document.hidden) void refresh(); };
    window.addEventListener('focus', changed); window.addEventListener('sky-hub-changed', changed); window.addEventListener('smis-agents-changed', changed);
    return () => { cancelAnimationFrame(frame); current?.abort(); window.removeEventListener('focus', changed); window.removeEventListener('sky-hub-changed', changed); window.removeEventListener('smis-agents-changed', changed); };
  }, [retry]);
  const entries = collection ? [
    ...collection.agents.map(agent => ({ key: 'agent:' + agent.id, agent, plugin: null })),
    ...collection.plugins.map(plugin => ({ key: plugin.key, agent: null, plugin })),
  ] : [];
  return <section className={styles.stream} aria-label="自分のNoahに追加したもの">
    <article className={styles.intro}>
      <div><span className={styles.kicker}>YOUR NOAH</span><h2>見つける。作る。使ってみる。</h2><p>LLM・エージェント・Tool・ニュース。これまで追加したものも、ここから。</p></div>
      <div className={styles.actions}><Link href="/os/eve?view=build"><Plus size={16} />Eveでエージェントを作る</Link><Link href="/#sky">追加できるものを見る <ArrowUpRight size={15}/></Link></div>
    </article>
    {state === 'loading' && <output className={styles.note}>追加済みの担当と接続を確認しています…</output>}
    {state === 'signed-out' && <p className={styles.note}><Link href="/account?returnTo=%2F%23timeline">ログインして自分のNoahを開く</Link></p>}
    {state === 'error' && <div className={styles.note}>一覧を確認できません。<button type="button" onClick={() => setRetry(v=>v+1)}><RefreshCw size={14}/>再読み込み</button></div>}
    {(expanded ? entries : entries.slice(0, 3)).map(({ key, agent, plugin }) => <article key={key} className={styles.post}>
      <span className={styles.icon}>{agent ? <Bot size={21}/> : <Box size={21}/>}</span>
      <div className={styles.copy}><div className={styles.meta}><strong>{agent ? agent.source === 'personal' ? 'Eveで作った担当' : '追加したToolの担当' : plugin?.kind === 'model' ? '追加したLLM' : plugin?.kind === 'x' ? 'つないだ配信元' : '追加したリソース'}</strong><span>自分のみ</span></div>
        <h3>{agent?.name ?? plugin?.metadata.title ?? plugin?.resource}</h3>
        <p>{agent?.instructions ?? plugin?.resource}</p>
        <small>{agent ? `${agent.model} · ${agent.enabled ? '利用する設定・接続はEveで確認' : '新しい依頼は停止中'}` : plugin?.enabled ? '追加済み · 導入・実行状況は設定で確認' : '利用停止中'}</small>
        <div className={styles.actions}>{agent?.enabled && <Link href={skyAgentEvePath(agent)}>Eveで使う <ArrowUpRight size={15}/></Link>}<Link href={agent ? '/#sky-manage' : '/#sky'}>{agent ? '設定を開く' : '追加画面で確認する'}</Link>{plugin?.kind === 'x' && <Link href="/#news-plugins">配信元の設定</Link>}</div>
      </div>
    </article>)}
    {entries.length > 3 && <button className={styles.more} type="button" onClick={() => setExpanded(v=>!v)}>{expanded ? '追加済みを折りたたむ' : `追加した${entries.length}件をすべて見る`}</button>}
  </section>;
}
