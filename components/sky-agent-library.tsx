/* oxlint-disable next/no-html-link-for-pages -- Sites sign-in is a top-level gateway. */
'use client';
import { useCallback, useEffect, useRef, useState, type SyntheticEvent } from 'react';
import Link from 'next/link';
import { ArrowRight, ArrowUpRight, Bot, Check, ChevronRight, Cloud, Plus, RefreshCw, Search, Settings2 } from 'lucide-react';
import WorkspaceShell from '@/components/workspace-shell';
import SkyAgentCapabilityReview from '@/components/sky-agent-capability-review';
import { SkyPurchases } from '@/components/sky-commerce';
import { SkyNotice } from '@/components/sky-feedback';
import { defaultSkyAgentSettings, parseSkyAgentSettings, skyAgentEvePath, type SkyAgentSettings, type SkyLibraryAgent } from '@/lib/sky-agent-library';
import { textModelProviders, textModelProviderDefinition, localModelPresets, type TextModelProviderId } from '@/lib/llm-providers';
import styles from './sky-agent-library.module.css';

const blank = () => defaultSkyAgentSettings('', '');
export default function SkyAgentLibrary() {
  const [agents, setAgents] = useState<SkyLibraryAgent[]>([]);
  const [selected, setSelected] = useState<SkyLibraryAgent | null>(null);
  const [settings, setSettings] = useState<SkyAgentSettings>(blank);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [signedOut, setSignedOut] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [query, setQuery] = useState(''), [creating, setCreating] = useState(false), [dirty, setDirty] = useState(false);
  const [draftId, setDraftId] = useState('');
  const editorRef = useRef<HTMLElement>(null);
  const [localModels,setLocalModels] = useState<Array<{name:string;digest:string}>>([]);
  const [modelChecking,setModelChecking] = useState(false);
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/sky/agents', { cache: 'no-store', signal });
      if (response.status === 401) { setSignedOut(true); setAgents([]); return; }
      const result = await response.json() as { agents?: SkyLibraryAgent[]; error?: string };
      if (!response.ok || !Array.isArray(result.agents)) throw new Error(result.error || '一覧を取得できませんでした。');
      setSignedOut(false); setAgents(result.agents);
    } catch (e) { if (!(e instanceof Error && e.name === 'AbortError')) setError(e instanceof Error ? e.message : '一覧を取得できませんでした。'); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, []);
  useEffect(() => { const c = new AbortController(); const frame = requestAnimationFrame(() => { void load(c.signal); }); return () => { cancelAnimationFrame(frame); c.abort(); }; }, [load]);
  const open = (agent: SkyLibraryAgent | null) => {
    setDraftId(agent?.id ?? crypto.randomUUID());
    setSelected(agent); setSettings(agent ? { name: agent.name, instructions: agent.instructions, provider: agent.provider, model: agent.model, enabled: agent.enabled } : blank());
    setCreating(!agent); setDirty(false); setError(''); setNotice('');
    requestAnimationFrame(() => editorRef.current?.scrollIntoView({ block: 'start' }));
  };
  const change = <K extends keyof SkyAgentSettings>(key: K, value: SkyAgentSettings[K]) => { setSettings(s => ({ ...s, [key]: value })); setDirty(true); setNotice(''); };
  const save = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(''); setNotice(''); setBusy(true);
    try {
      const value = parseSkyAgentSettings(settings);
      const id = selected?.id ?? draftId;
      const response = await fetch('/api/sky/agents', { method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, revision: selected?.revision ?? 0, settings: value, create: !selected }) });
      const result = await response.json() as { agent?: SkyLibraryAgent; error?: string };
      if (!response.ok || !result.agent) throw new Error(result.error || '保存できませんでした。入力は残っています。');
      const saved = result.agent;
      setAgents(current => [saved, ...current.filter(a => a.id !== saved.id)]); open(saved); setNotice('設定を保存しました。Eveへ渡せます。');
    } catch (e) { setError(e instanceof Error ? e.message : '保存できませんでした。入力は残っています。'); }
    finally { setBusy(false); }
  };
  const inspectModels = async () => {
    setModelChecking(true); setError('');
    try {
      const response = await fetch('/api/llm/local-models', { cache: 'no-store' });
      const result = await response.json() as { models?: Array<{name:string;digest:string}>; error?: string };
      if (!response.ok || !Array.isArray(result.models)) throw new Error(result.error || 'この環境のモデル一覧を確認できません。');
      setLocalModels(result.models); setNotice(result.models.length ? '導入済みのモデルを確認しました。選択して保存できます。推論はまだ開始していません。' : '導入済みのモデルはありません。');
    } catch (reason) { setError(reason instanceof Error ? reason.message : '端末モデルを確認できません。'); }
    finally { setModelChecking(false); }
  };
  const visible = agents.filter(a => `${a.name} ${a.instructions} ${a.model}`.toLowerCase().includes(query.toLowerCase()));
  const definition = textModelProviderDefinition(settings.provider);
  return <WorkspaceShell title="Skyのエージェント" tone="sky">
    <div className={styles.page}>
      <header className={styles.hero}>
        <div><Link className={styles.back} href="/sky">Sky <ChevronRight size={13} /> マイエージェント</Link>
          <p className={styles.eyebrow}>YOUR AGENTS, YOUR WAY</p><h1>あなたのエージェント。</h1>
          <p>役割と使うLLMを整えて、仕事はEveへ。</p></div>
        <button className={styles.primary} onClick={() => open(null)} disabled={loading || busy || dirty || signedOut}><Plus size={17} /> 文章担当を追加</button>
      </header>
      <nav className={styles.links} aria-label="エージェントの管理">
        <span><Bot size={17} /> 追加したエージェント <strong>{loading ? '—' : agents.length}</strong></span>
        <Link href="/sky/marketplace">Sky Market <ArrowUpRight size={15} /></Link>
        <Link href="/chat?view=work">Eveの仕事と成果 <ArrowUpRight size={15} /></Link>
      </nav>
      <details><summary>購入と利用権の状態を確認</summary><SkyPurchases /></details>
      {signedOut && <div className={styles.notice}><p>自分のエージェントと設定を表示するにはサインインしてください。</p><a href="/signin-with-chatgpt?return_to=%2Fsky%2Fagents" target="_top">サインイン <ArrowRight size={16} /></a></div>}
      {error && <SkyNotice className={styles.error} message={error} />}
      {notice && <output className={styles.success}><Check size={16} /> {notice}</output>}
      <div className={styles.layout}>
        <section className={styles.library} aria-labelledby="agent-list-title">
          <div className={styles.sectionTitle}><h2 id="agent-list-title">追加したエージェント</h2><button aria-label="一覧を再読み込み" disabled={loading || busy || dirty} onClick={() => { setSelected(null); setCreating(false); void load(); }}><RefreshCw size={17} /></button></div>
          <label className={styles.search}><Search size={17} /><input aria-label="エージェントを検索" placeholder="名前・役割・LLMで探す" value={query} onChange={e => setQuery(e.target.value)} /></label>
          {loading && <p aria-live="polite">追加済みの担当を読み込んでいます…</p>}
          {!loading && !signedOut && !visible.length && <div className={styles.empty}><Bot size={32} strokeWidth={1.4} /><h3>{query ? '一致する担当がありません' : '最初の担当を、あなた仕様に。'}</h3><p>{query ? '名前やモデルを変えて検索してください。' : 'Skyで追加したToolがここに並びます。自分用の文章担当も作れます。'}</p></div>}
          <div className={styles.list}>{visible.map(agent => <button key={agent.id} className={styles.agent} aria-pressed={selected?.id === agent.id} disabled={busy || dirty} onClick={() => open(agent)}>
            <span className={styles.avatar}><Bot size={22} /></span><span className={styles.agentCopy}><strong>{agent.name}</strong><small>{agent.model}</small><span>{agent.source === 'personal' ? '自分の文章担当' : 'Skyで追加したTool'} · {agent.enabled ? 'Eveで選択可' : '利用停止中'}</span></span><ChevronRight size={16} />
          </button>)}</div>
          <p className={styles.boundary}>このサービス環境に保存した一覧です。端末内Linuxや外部Agentとの同期・実行可否は接続先ごとに確認します。</p>
        </section>
        <section ref={editorRef} className={styles.editor} aria-labelledby="agent-settings-title">
          {!selected && !creating ? <div className={styles.welcome}><Settings2 size={32} strokeWidth={1.3} /><h2 id="agent-settings-title">使い方まで、あなたに合わせる。</h2><p>左の担当を選ぶと、役割とLLMの設定を確認できます。</p><button disabled={signedOut} onClick={() => open(null)}>文章担当を追加 <Plus size={16} /></button></div> : <form onSubmit={e => void save(e)}>
            <div className={styles.editorHeading}><div><p className={styles.eyebrow}>{selected?.source === 'sky-tool' ? 'ADDED FROM SKY' : 'YOUR PERSONAL AGENT'}</p><h2 id="agent-settings-title">{creating ? '新しい文章担当' : 'エージェントの設定'}</h2></div><Settings2 size={21} /></div>
            <fieldset disabled={busy || signedOut}>
              <label>名前<input required maxLength={80} value={settings.name} placeholder="例：文章を整える担当" onChange={e => change('name', e.target.value)} /></label>
              <label>役割・指示<textarea required maxLength={1200} rows={4} value={settings.instructions} placeholder="何を手伝い、どんな形で返してほしいか。" onChange={e => change('instructions', e.target.value)} /></label>
              <div className={styles.modelBox}><h3><Cloud size={17} /> {selected?.sourceTool ? 'Eveで依頼を整理するLLM' : '使用するLLM'}</h3>
                <button type="button" disabled={modelChecking} onClick={()=>void inspectModels()}>{modelChecking?'端末のモデルを確認中…':'この環境の導入済みLLMを確認'}</button>
                {localModels.length>0&&<label>導入済みのOllamaモデル<select value={settings.provider==='ollama'?settings.model:''} onChange={e=>{if(!e.target.value)return;setSettings(v=>({...v,provider:'ollama',model:e.target.value}));setDirty(true);}}><option value="">選択する</option>{localModels.map(m=><option key={m.digest} value={m.name}>{m.name}</option>)}</select></label>}
                <label>モデルの接続先<select value={settings.provider} onChange={e => { const provider = e.target.value as TextModelProviderId; setSettings(s => ({ ...s, provider, model: textModelProviderDefinition(provider).defaultModel })); setDirty(true); setNotice(''); }}>{textModelProviders.map(p => <option value={p.id} key={p.id}>{p.name}</option>)}</select></label>
                <label>モデルID<input required list="sky-agent-model-options" maxLength={120} value={settings.model} onChange={e => change('model',e.target.value)} /></label>
                <datalist id="sky-agent-model-options">{localModelPresets.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}</datalist>
                <p>{definition.detail}</p><p>接続状態：未確認。Eveで開始前に確認します。{definition.locality === 'remote' ? ' 外部送信・料金には、その仕事の見積と承認が必要です。' : ' 別のLLMやクラウドへ勝手に切り替えません。'}</p>
                {selected?.sourceTool && <p>この設定はEveの依頼整理に適用します。Tool本体が使う固有モデル・権限・価格は変わりません。</p>}
              </div>
              <label className={styles.check}><input type="checkbox" checked={settings.enabled} onChange={e => change('enabled',e.target.checked)} /> Eveでこのエージェントを選べるようにする</label>
              <p className={styles.boundary}>停止しても過去の仕事・成果は残ります。進行中の仕事を止める操作はEveで行います。</p>
            </fieldset>
            <div className={styles.actions}><button className={styles.primary} disabled={busy || signedOut || (!dirty && !creating)}>{busy ? '保存しています…' : '設定を保存'}</button>
              {selected && !dirty && selected.enabled && <Link className={styles.eve} href={skyAgentEvePath(selected)}>Eveに依頼する <ArrowRight size={17} /></Link>}
              {dirty && <button type="button" disabled={busy} onClick={() => open(selected)}>変更を破棄</button>}
            </div>
            <p className={styles.boundary}>{dirty ? '未保存の変更があります。保存か破棄後に担当を切り替えられます。' : '設定の保存やEveを開くだけでは、実行・購入・課金は始まりません。'}</p>
          </form>}
          {selected && !creating && !dirty && <SkyAgentCapabilityReview key={`${selected.id}:${selected.revision}`} agent={selected} onSaved={saved => { setSelected(saved); setSettings(saved); setAgents(list => list.map(item => item.id === saved.id ? saved : item)); }} />}
        </section>
      </div>
    </div>
  </WorkspaceShell>;
}
