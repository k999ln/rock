'use client';

import { useRef, useState } from 'react';
import type { NoahCatalogItem } from '@/lib/noah-device-catalog';
import type { LinuxLocalAgent } from '@/lib/sky-linux-local';

export type NoahDeviceState = {
  device: { id: string; name: string };
  catalog: (NoahCatalogItem & { digest: string })[];
  installs: { requestId: string; catalogId: string; catalogDigest: string; agentId: string; agentSha256: string; modelId: string; modelSha256: string }[];
};
export function noahEveHref(path: string, deviceId: string, agent: LinuxLocalAgent, modelSha256: string) {
  return `${path}?${new URLSearchParams({ agent: agent.id, device: deviceId, agentSha256: agent.sha256, modelSha256 })}`;
}

export default function NoahDeviceStore({ noah, agents, models, preparedModels, phase, connected, busy, active, act, evePath }: {
  noah?: NoahDeviceState; agents: LinuxLocalAgent[]; models: { id: string; name: string; sha256: string }[];
  preparedModels: string[]; phase?: string; connected: boolean; busy: boolean; active: boolean;
  act: (input: Record<string, unknown>) => Promise<void>; evePath: string;
}) {
  const [query, setQuery] = useState(''), [kind, setKind] = useState('all'), [selection, setSelection] = useState('');
  const [consent, setConsent] = useState(false), [error, setError] = useState('');
  const sending = useRef(false);
  const selected = noah?.catalog.find(item => item.id === selection);
  const added = Boolean(selected && noah?.installs.some(row => row.catalogId === selected.id && row.catalogDigest === selected.digest));
  const blocked = busy || !connected || active || phase === 'preparing';
  const items = noah?.catalog.filter(item => (kind === 'all' || item.kind === kind) &&
    `${item.name} ${item.description} ${item.model.name}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())) ?? [];
  async function add() {
    if (!noah || !selected || !consent || blocked || sending.current) return;
    sending.current = true; setError('');
    try {
      const key = `noah-add:${noah.device.id}:${selected.digest}`;
      let requestId = sessionStorage.getItem(key);
      if (!requestId) { requestId = crypto.randomUUID(); sessionStorage.setItem(key, requestId); }
      await act({ action: 'noah-add', deviceId: noah.device.id, catalogId: selected.id, catalogDigest: selected.digest, requestId, accepted: true });
    } catch { setError('追加番号を保存できません。ブラウザーの保存設定を確認してください。追加は始めていません。'); }
    finally { sending.current = false; }
  }
  return <>
    <section aria-labelledby="noah-search">
      <h2 id="noah-search">Agent・LLMを探す</h2>
      <p>追加先：<strong>{noah?.device.name ?? '接続を確認しています'}</strong></p>
      <p>端末内で文章を作るLLMとAgentです。モデルの取得には通信を使います。依頼文をクラウドAIに送りません。</p>
      <label>検索<input type="search" placeholder="要約、下書き、モデル名" value={query} onChange={e => setQuery(e.target.value)} /></label>
      <label>種類<select value={kind} onChange={e => setKind(e.target.value)}><option value="all">すべて</option><option value="agent">Agent</option><option value="model">LLM</option></select></label>
      {!items.length && <p>{noah ? '一致するAgent・LLMはありません。検索語を変えてください。' : '端末に接続するとカタログを表示します。'}</p>}
      {items.map(item => <article key={item.id}>
        <h3>{item.name}</h3><p>{item.description}</p><p>{item.kind === 'agent' ? 'Agent' : 'LLM'} · {item.model.name} · 約{Math.ceil(item.model.bytes / 1e6)}MB · {item.model.license}</p>
        <button type="button" aria-pressed={selection === item.id} onClick={() => { setSelection(item.id); setConsent(false); setError(''); }}>詳細を見る：{item.name}（{item.model.name}）</button>
      </article>)}
      {selected && <aside aria-label="追加する内容">
        <h3>{selected.name}を追加</h3><p>使うLLM：{selected.model.name}。必要なメモリ：{selected.model.memoryMiB ? `${selected.model.memoryMiB}MiBが目安` : '環境の準備時に確認します'}。保存済みの同じモデルは再利用します。</p>
        <p><a href={selected.model.source} target="_blank" rel="noreferrer">モデルの配布元</a> · 利用条件：{selected.model.license}</p>
        <p>役割：{selected.agent.instructions}</p>
        <p>追加後にモデルを取得・検証します。「Eveで使う」が表示されたら実行できます。</p>
        <label><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />追加先・容量・利用条件を確認し、必要なモデルの取得を許可します。</label>
        <button type="button" disabled={blocked || !consent || added} onClick={() => void add()}>{added ? '追加済み・ライブラリで確認' : 'この端末に追加する'}</button>
      </aside>}
      {error && <p role="alert">{error}</p>}
    </section>
    <section aria-labelledby="noah-library"><h2 id="noah-library">この端末のライブラリ</h2>
      {!agents.length && <p>Agentを追加すると、ここからEveに依頼できます。</p>}
      {agents.map(agent => {
        const model = models.find(m => m.id === agent.modelId), ready = phase === 'ready' && preparedModels.includes(agent.modelId);
        return <article key={agent.id}><h3>{agent.name}</h3><p>{model?.name ?? agent.modelId} · {ready ? '実行できます' : phase === 'preparing' ? 'モデルを準備しています' : '登録済み・モデルの準備が必要です'}</p>
          {ready && noah && model && connected ? <a href={noahEveHref(evePath, noah.device.id, agent, model.sha256)}>Eveで使う：{agent.name}</a> : <button type="button" disabled={blocked || !noah || !model} onClick={() => void act({ action: 'prepare', deviceId: noah?.device.id, modelId: agent.modelId, modelSha256: model?.sha256, accepted: true })}>モデルの準備を再開する</button>}
        </article>;
      })}
    </section>
  </>;
}
