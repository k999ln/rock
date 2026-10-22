/* oxlint-disable next/no-html-link-for-pages -- Sites sign-in is a top-level gateway. */
'use client';
import { useCallback, useEffect, useRef, useState, type SyntheticEvent } from 'react';
import Link from 'next/link';
import { ArrowRight, ArrowUpRight, Bot, Check, ChevronRight, Cloud, Plus, RefreshCw, Search, Settings2 } from 'lucide-react';
import WorkspaceShell from '@/components/workspace-shell';
import SkyOwnedAgents from '@/components/sky-owned-agents';
import SkyDeviceAgentConnections from '@/components/sky-device-agent-connections';
import { SkyNotice } from '@/components/sky-feedback';
import { defaultSkyAgentSettings, parseSkyAgentSettings, skyAgentEvePath, type SkyAgentSettings, type SkyLibraryAgent } from '@/lib/sky-agent-library';
import { textModelProviders, textModelProviderDefinition, localModelPresets, type TextModelProviderId } from '@/lib/llm-providers';
import styles from './sky-agent-library.module.css';

const blank = () => defaultSkyAgentSettings('', '');
const starters = [
  { id: 'research', title: '調べて整理', detail: '資料の出典と不明点を分ける', name: '調査担当', instructions: '依頼されたテーマを調べ、確認できた事実・出典・未確認の点を分けて短く整理してください。出典がない内容を事実として書かないでください。' },
  { id: 'writing', title: '文章を作る', detail: '目的と読み手に合わせて下書き', name: '文章担当', instructions: '目的と読み手を確認し、分かりやすい文章の下書きを作ってください。曖昧な点は質問し、事実と提案を区別してください。' },
  { id: 'planning', title: '仕事を進める', detail: '作業の順番と確認事項を整理', name: '計画担当', instructions: '目的、期限、使える資料と予算を確認し、作業の順番、必要な承認、完了条件を提案してください。実行していない作業を完了と書かないでください。' },
] as const;
export default function SkyAgentLibrary({ publicRuntime = true }: { publicRuntime?: boolean } = {}) {
  const [agents, setAgents] = useState<SkyLibraryAgent[]>([]);
  const [ownerUserId, setOwnerUserId] = useState('');
  const [selected, setSelected] = useState<SkyLibraryAgent | null>(null);
  const [settings, setSettings] = useState<SkyAgentSettings>(blank);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [signedOut, setSignedOut] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [query, setQuery] = useState(''), [creating, setCreating] = useState(false), [dirty, setDirty] = useState(false);
  const [creationStep, setCreationStep] = useState<0 | 1 | 2>(0), [starterId, setStarterId] = useState('');
  const [draftId, setDraftId] = useState('');
  const editorRef = useRef<HTMLElement>(null);
  const [localModels,setLocalModels] = useState<Array<{name:string;digest:string}>>([]);
  const [modelChecking,setModelChecking] = useState(false);
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/sky/agents', { cache: 'no-store', signal });
      if (response.status === 401) { setSignedOut(true); setAgents([]); setOwnerUserId(''); return; }
      const result = await response.json() as { ownerUserId?: string; agents?: SkyLibraryAgent[]; error?: string };
      if (!response.ok || !Array.isArray(result.agents)) throw new Error(result.error || '一覧を取得できませんでした。');
      setSignedOut(false); setAgents(result.agents); setOwnerUserId(result.ownerUserId ?? '');
    } catch (e) { if (!(e instanceof Error && e.name === 'AbortError')) setError(e instanceof Error ? e.message : '一覧を取得できませんでした。'); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, []);
  useEffect(() => { const c = new AbortController(); const frame = requestAnimationFrame(() => { void load(c.signal); }); return () => { cancelAnimationFrame(frame); c.abort(); }; }, [load]);
  const open = (agent: SkyLibraryAgent | null) => {
    setDraftId(agent?.id ?? crypto.randomUUID());
    setSelected(agent); setSettings(agent ? { name: agent.name, instructions: agent.instructions, provider: agent.provider, model: agent.model, enabled: agent.enabled } : blank());
    setCreating(!agent); setCreationStep(0); setStarterId(''); setDirty(false); setError(''); setNotice('');
    requestAnimationFrame(() => editorRef.current?.scrollIntoView({ block: 'start' }));
  };
  const startToolSetup = (agent: SkyLibraryAgent) => {
    const draft = creating && dirty ? { name: settings.name, instructions: settings.instructions, starterId } : null;
    open(agent); setCreating(true);
    if (draft) {
      setSettings(current => ({ ...current, name: draft.name || current.name, instructions: draft.instructions || current.instructions }));
      setStarterId(draft.starterId); setDirty(true);
    }
  };
  const change = <K extends keyof SkyAgentSettings>(key: K, value: SkyAgentSettings[K]) => { setSettings(s => ({ ...s, [key]: value })); setDirty(true); setNotice(''); };
  const applyStarter = (starter: typeof starters[number]) => {
    setSettings(current => ({ ...current, name: starter.name, instructions: starter.instructions }));
    setStarterId(starter.id); setDirty(true); setError('');
  };
  const nextCreationStep = () => {
    setError('');
    if (creationStep === 0 && (!settings.name.trim() || !settings.instructions.trim())) {
      setError('名前と役割を入力してください。例から選んだ後でも編集できます。'); return;
    }
    if (creationStep === 1) {
      try { parseSkyAgentSettings(settings); }
      catch (reason) { setError(reason instanceof Error ? reason.message : 'LLMの設定を確認してください。'); return; }
    }
    setCreationStep(step => Math.min(step + 1, 2) as 0 | 1 | 2);
  };
  const save = async (event: SyntheticEvent<HTMLFormElement | HTMLButtonElement>) => {
    event.preventDefault();
    if (creating && creationStep !== 2) return;
    setError(''); setNotice(''); setBusy(true);
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
  return <WorkspaceShell title="自分のSky">
    <div className={styles.page}>
      <header className={styles.hero}>
        <div><Link className={styles.back} href="/#timeline">Sky <ChevronRight size={13} /> マイエージェント</Link>
          <p className={styles.eyebrow}>YOUR AGENTS, YOUR WAY</p><h1>あなたのエージェント。</h1>
          <p>やってほしいことに合う担当を作り、使うSIや端末につなぎます。依頼と成果の確認はEveで進められます。</p></div>
        <button className={styles.primary} onClick={() => open(null)} disabled={loading || busy || dirty || signedOut}><Plus size={17} /> エージェントを作る</button>
      </header>
      <nav className={styles.links} aria-label="エージェントの管理">
        <span><Bot size={17} /> 追加したエージェント <strong>{loading ? '—' : agents.length}</strong></span>
        <Link href="/#catalog">Sky Market <ArrowUpRight size={15} /></Link>
        <Link href="/os/eve">Eveの仕事と成果 <ArrowUpRight size={15} /></Link>
      </nav>
      {!publicRuntime && <details><summary>購入と利用権の状態を確認</summary><SkyOwnedAgents /></details>}
      {signedOut && <div className={styles.notice}><p>自分のエージェントと設定を表示するにはサインインしてください。</p><a href="/account?returnTo=%2Fsky%2Fagents" target="_top">サインイン <ArrowRight size={16} /></a></div>}
      {error && <SkyNotice className={styles.error} message={error} />}
      {notice && <output className={styles.success}><Check size={16} /> {notice}</output>}
      <div className={styles.layout}>
        <section className={styles.library} aria-labelledby="agent-list-title">
          <div className={styles.sectionTitle}><h2 id="agent-list-title">追加したエージェント</h2><button aria-label="一覧を再読み込み" disabled={loading || busy || dirty} onClick={() => { setSelected(null); setCreating(false); void load(); }}><RefreshCw size={17} /></button></div>
          <label className={styles.search}><Search size={17} /><input aria-label="エージェントを検索" placeholder="名前・役割・LLMで探す" value={query} onChange={e => setQuery(e.target.value)} /></label>
          {loading && <p aria-live="polite">追加済みの担当を読み込んでいます…</p>}
          {!loading && !signedOut && !visible.length && <div className={styles.empty}><Bot size={32} strokeWidth={1.4} /><h3>{query ? '一致する担当がありません' : '最初のエージェントを作ろう。'}</h3><p>{query ? '名前やモデルを変えて検索してください。' : '用途を選ぶところから始められます。接続済みToolの担当もここに並びます。'}</p></div>}
          <div className={styles.list}>{visible.map(agent => <button key={agent.id} className={styles.agent} aria-pressed={selected?.id === agent.id} disabled={busy || dirty} onClick={() => open(agent)}>
            <span className={styles.avatar}><Bot size={22} /></span><span className={styles.agentCopy}><strong>{agent.name}</strong><small>{agent.model}</small><span>{agent.source === 'personal' ? '自分の文章担当' : 'Skyで追加したTool'} · {agent.enabled ? 'Eveで選択可' : '利用停止中'}</span></span><ChevronRight size={16} />
          </button>)}</div>
          <p className={styles.boundary}>ここにはSkyに保存した担当が並びます。接続した端末の担当は下で確認できます。接続先の稼働と費用は、Eveで依頼する前に確認します。</p>
        </section>
        <section ref={editorRef} className={styles.editor} aria-labelledby="agent-settings-title">
          {!selected && !creating ? <div className={styles.welcome}><Settings2 size={32} strokeWidth={1.3} /><h2 id="agent-settings-title">使い方まで、あなたに合わせる。</h2><p>やってほしいことを選んで作るか、左の担当を選んで設定できます。</p><button disabled={signedOut} onClick={() => open(null)}>エージェントを作る <Plus size={16} /></button></div> : <form onSubmit={e => void save(e)}>
            <div className={styles.editorHeading}><div><p className={styles.eyebrow}>{selected?.source === 'sky-tool' ? 'ADDED FROM SKY' : 'YOUR PERSONAL AGENT'}</p><h2 id="agent-settings-title">{creating ? selected?.sourceTool ? 'Toolの担当を設定' : '新しいエージェント' : 'エージェントの設定'}</h2></div><Settings2 size={21} /></div>
            {creating && <ol className={styles.steps} aria-label="作成の手順">
              {['役割', '使うAI', '確認'].map((label, index) => <li key={label} aria-current={creationStep === index ? 'step' : undefined}><span>{index + 1}</span>{label}</li>)}
            </ol>}
            <fieldset disabled={busy || signedOut}>
              {(!creating || creationStep === 0) && <>
              {creating && !selected?.sourceTool && <div className={styles.toolChoice}><h3>Sky Toolを使うなら</h3><p>接続済みToolを選ぶと、そのTool専用の担当として設定できます。</p><div>{agents.filter(agent => agent.source === 'sky-tool').slice(0, 4).map(agent => <button type="button" key={agent.id} onClick={() => startToolSetup(agent)}>{agent.name} <ArrowRight size={14} /></button>)}</div><Link href="/#catalog">SkyでToolを探す <ArrowUpRight size={14} /></Link></div>}
              {creating && <div className={styles.starters}><h3>まず、何を任せたい？</h3><p>近いものを選んでから、名前や役割を書き換えられます。</p><div className={styles.starterGrid}>{starters.map(starter => <button type="button" key={starter.id} aria-pressed={starterId === starter.id} onClick={() => applyStarter(starter)}><strong>{starter.title}</strong><span>{starter.detail}</span></button>)}</div></div>}
              <label>名前<input required maxLength={80} value={settings.name} placeholder="例：文章を整える担当" onChange={e => change('name', e.target.value)} /></label>
              <label>何をしてほしい？<textarea required maxLength={1200} rows={4} value={settings.instructions} placeholder="例：資料の出典を示し、要点と分からない点を分けて返す" onChange={e => change('instructions', e.target.value)} /></label>
              {creating && <p className={styles.boundary}>{selected?.sourceTool ? 'この担当は接続済みのSky Toolを使います。実行前に権限と費用を別に確認します。' : 'Toolを選ばずに作る場合、Toolの実行権限は付きません。'}</p>}
              </>}
              {(!creating || creationStep === 1) && <>
              <div className={styles.modelBox}><h3><Cloud size={17} /> {selected?.sourceTool ? 'Eveで依頼を整理するLLM' : 'Eveの基盤モデル'}</h3>
                {!publicRuntime && <button type="button" disabled={modelChecking} onClick={()=>void inspectModels()}>{modelChecking?'端末のモデルを確認中…':'この環境の導入済みLLMを確認'}</button>}
                {localModels.length>0&&<label>導入済みのOllamaモデル<select value={settings.provider==='ollama'?settings.model:''} onChange={e=>{if(!e.target.value)return;setSettings(v=>({...v,provider:'ollama',model:e.target.value}));setDirty(true);}}><option value="">選択する</option>{localModels.map(m=><option key={m.digest} value={m.name}>{m.name}</option>)}</select></label>}
                <label>モデルの接続先<select value={settings.provider} onChange={e => { const provider = e.target.value as TextModelProviderId; setSettings(s => ({ ...s, provider, model: textModelProviderDefinition(provider).defaultModel })); setDirty(true); setNotice(''); }}>{textModelProviders.map(p => <option value={p.id} key={p.id}>{p.name}</option>)}</select></label>
                <label>モデルID<input required list="sky-agent-model-options" maxLength={120} value={settings.model} onChange={e => change('model',e.target.value)} /></label>
                <datalist id="sky-agent-model-options">{localModelPresets.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}</datalist>
                <p>{definition.detail}</p><p>接続状態：未確認。Eveで開始前に確認します。{definition.locality === 'remote' ? ' 外部送信・料金には、その仕事の見積と承認が必要です。' : ' 別のLLMやクラウドへ勝手に切り替えません。'}</p>
                {selected?.sourceTool && <p>この設定はEveの依頼整理に適用します。Tool本体が使う固有モデル・権限・価格は変わりません。</p>}
              </div>
              </>}
              {(!creating || creationStep === 2) && <>
              {creating && <div className={styles.review}><h3>保存前に確認</h3><dl><div><dt>名前</dt><dd>{settings.name}</dd></div><div><dt>役割</dt><dd>{settings.instructions}</dd></div><div><dt>Eveの基盤モデル</dt><dd>{definition.name} · {settings.model}</dd></div><div><dt>Tool</dt><dd>{selected?.sourceTool ? selected.name : '未接続。必要ならSkyで追加'}</dd></div></dl><p>{selected?.sourceTool ? '保存すると接続済みToolの担当設定が自分の一覧に記録されます。' : '保存すると自分の一覧に追加されます。'}Eveへ依頼するまで仕事は始まりません。接続先の利用可否、外部送信、費用は依頼時に確認します。</p></div>}
              <label className={styles.check}><input type="checkbox" checked={settings.enabled} onChange={e => change('enabled',e.target.checked)} /> Eveでこのエージェントを選べるようにする</label>
              <p className={styles.boundary}>停止しても過去の仕事・成果は残ります。進行中の仕事を止める操作はEveで行います。</p>
              </>}
            </fieldset>
            <div className={styles.actions}>
              {creating && creationStep > 0 && <button type="button" disabled={busy} onClick={() => { setCreationStep(step => Math.max(step - 1, 0) as 0 | 1 | 2); setError(''); }}>戻る</button>}
              {creating && creationStep < 2 ? <button type="button" className={styles.primary} disabled={busy || signedOut} onClick={nextCreationStep}>次へ <ArrowRight size={16} /></button> : <button type="button" className={styles.primary} disabled={busy || signedOut || (!dirty && !creating)} onClick={e => void save(e)}>{busy ? '保存しています…' : creating ? selected?.sourceTool ? 'Tool担当を保存' : 'エージェントを作成' : '設定を保存'}</button>}
              {selected && !creating && !dirty && selected.enabled && <Link className={styles.eve} href={skyAgentEvePath(selected)}>Eveに依頼する <ArrowRight size={17} /></Link>}
              {dirty && <button type="button" disabled={busy} onClick={() => open(selected)}>変更を破棄</button>}
            </div>
            <p className={styles.boundary}>{dirty ? '未保存の変更があります。保存か破棄後に担当を切り替えられます。' : '設定の保存やEveを開くだけでは、実行・購入・課金は始まりません。'}</p>
          </form>}
        </section>
      </div>
      {ownerUserId && <SkyDeviceAgentConnections key={ownerUserId} ownerUserId={ownerUserId} />}
    </div>
  </WorkspaceShell>;
}
