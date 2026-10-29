import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import EveObjectAgentCreator from '../../../components/eve-object-agent-creator';
import { EveSourceHandoff, useEveSourceContext } from '../../../components/eve-source-handoff';
import { queueEveSourceIntent, readEveSourceSelection } from '../../../lib/eve-source-client';
import type { EveSourcePin } from '../../../lib/eve-source-context';
import Workbench from '../../../components/workbench';
import SkyAgentLibrary from '../../../components/sky-agent-library';
import type { McpConnection } from '../../../lib/mcp-hub';

function SyntheticEve() {
  const [thread, setThread] = useState(0), [draft, setDraft] = useState(''), [mode, setMode] = useState('counter');
  const [error, setError] = useState('');
  const [replies, setReplies] = useState<Array<{ id: string; text: string; source: EveSourcePin }>>([]);
  const threadId = `fixture-thread-${thread}`;
  const context = useEveSourceContext(true, threadId);
  async function queue(role: string) {
    try {
      const key = role === 'counter' ? 'dataset:fixture/counter' : 'space:fixture/summer';
      const current = await readEveSourceSelection(key);
      await queueEveSourceIntent(sessionStorage, current.plugin, role === 'counter' ? '選んだデータの文章行数を確認したい' : '選んだアプリで整数を合計したい');
      setMode(role); setThread(value => value + 1); setDraft(''); setReplies([]); setError('');
    } catch (reason) { setError(String(reason)); }
  }
  async function syntheticReply() {
    try {
      // Only this test substitutes a model response. Real selection, handoff,
      // freshness checks, creator, save route and Job execution remain production code.
      const selected = await context.validate();
      if (!selected || !draft) throw new Error('出典と入力を確認してください。');
      const text = mode === 'counter'
        ? JSON.stringify({ schema: 'rockstaros.eve-agent-proposal/1', name: 'fixture担当', purpose: '文章の行数を確認', input: 'text', output: 'lines' })
        : '二つの整数leftとrightを受け取り、合計sumを返す担当です。';
      setReplies([{ id: mode === 'counter' ? 'fixture-counter-reply' : 'fixture-sum-reply', text, source: selected.source }]);
      setError('');
    } catch (reason) { setError(String(reason)); }
  }
  return <>
    <section aria-label="合成Eve応答fixture" data-thread={threadId}>
      <p>この試験ではモデルを呼ばず、回答だけを合成します。</p>
      <button type="button" onClick={() => void queue('counter')}>保存した行数データを選ぶ</button>
      <button type="button" onClick={() => void queue('summer')}>保存した合計アプリを選ぶ</button>
      <EveSourceHandoff context={context} onDraft={setDraft} />
      <label>fixtureのEve入力<textarea value={draft} onChange={event => setDraft(event.target.value)} /></label>
      <button type="button" disabled={!draft || !context.selection || context.checking} onClick={() => void syntheticReply()}>合成回答を生成する（モデル未使用）</button>
      {error && <p role="alert">{error}</p>}
    </section>
    <EveObjectAgentCreator key={threadId} threadId={threadId} replies={replies} />
  </>;
}
function App() {
  const [url, setUrl] = useState(location.href);
  useEffect(() => { const changed = () => setUrl(location.href); addEventListener('fixture-navigation', changed); return () => removeEventListener('fixture-navigation', changed); }, []);
  const params = new URL(url).searchParams;
  const id = params.get('agent'), revision = Number(params.get('agentRevision'));
  return <main>{location.pathname === '/sky/agents' ? <SkyAgentLibrary /> : !id ? <SyntheticEve /> : <Workbench embedded initialPackageKey={params.get('package') ?? ''}
    packageRuntimeServers={(window as Window & { __fixtureServers?: McpConnection[] }).__fixtureServers ?? []} agentReference={{ id, revision }} agentRequired />}</main>;
}
createRoot(document.getElementById('root')!).render(<App />);
