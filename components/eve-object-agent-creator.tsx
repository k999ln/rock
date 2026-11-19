'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import WorkspaceShell from './workspace-shell';
import { SkyNotice } from './sky-feedback';
import { draftSkyObjectAgent } from '@/lib/sky-agent-draft';
import { parseSkyAgentSettings, skyAgentEvePath, type SkyAgentSettings, type SkyLibraryAgent } from '@/lib/sky-agent-library';
import { skyObjectEntryPath, skyObjectInputs, skyObjectOutputs, type SkyObjectAttachment } from '@/lib/sky-object-attachment';
import { textModelProviders, textModelProviderDefinition, type TextModelProviderId } from '@/lib/llm-providers';
import styles from './sky-agent-library.module.css';

export default function EveObjectAgentCreator() {
  const [objectName, setObjectName] = useState('');
  const [problem, setProblem] = useState('');
  const [result, setResult] = useState('');
  const [input, setInput] = useState<SkyObjectAttachment['input']>('text');
  const [output, setOutput] = useState<SkyObjectAttachment['output']>('text');
  const [draft, setDraft] = useState<SkyAgentSettings | null>(null);
  const [saved, setSaved] = useState<SkyLibraryAgent | null>(null);
  const [draftId, setDraftId] = useState('');
  const [agents, setAgents] = useState<SkyLibraryAgent[]>([]);
  const [ownerId, setOwnerId] = useState('');
  const [account, setAccount] = useState<'loading' | 'ready' | 'signed-out' | 'error'>('loading');
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/sky/agents', { cache: 'no-store', signal: controller.signal }).then(async response => {
      const data = await response.json() as { ownerUserId?: string; agents?: SkyLibraryAgent[] };
      if (controller.signal.aborted) return;
      if (response.status === 401) { setAccount('signed-out'); return; }
      if (!response.ok || !Array.isArray(data.agents) || !data.ownerUserId) { setAccount('error'); return; }
      setAgents(data.agents); setOwnerId(data.ownerUserId); setAccount('ready');
    }).catch(() => { if (!controller.signal.aborted) setAccount('error'); });
    return () => controller.abort();
  }, []);
  function prepare() {
    setError('');
    try {
      const settings = draftSkyObjectAgent({ objectName, problem, result, input, output });
      const prior = agents.find(agent => agent.enabled && !agent.sourceTool);
      setDraft(prior ? { ...settings, provider: prior.provider, model: prior.model } : settings);
      setDraftId(crypto.randomUUID()); setSaved(null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : '入力を確認してください。'); }
  }
  async function save() {
    if (!draft || busy || account !== 'ready') return;
    setBusy(true); setError('');
    try {
      const settings = parseSkyAgentSettings(draft);
      const response = await fetch('/api/sky/agents', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-smis-Owner': ownerId }, body: JSON.stringify({ id: draftId, revision: 0, settings, create: true }) });
      const data = await response.json() as { agent?: SkyLibraryAgent; error?: string };
      if (!response.ok || !data.agent) {
        // A lost response is reconciled with the original ID, never a new agent.
        const read = await fetch(`/api/sky/agents?id=${encodeURIComponent(draftId)}`, { cache: 'no-store' });
        const found = await read.json() as { ownerUserId?: string; agent?: SkyLibraryAgent };
        const candidate = found.agent;
        if (read.ok && found.ownerUserId === ownerId && candidate?.revision === 1 && candidate.source === 'personal' && JSON.stringify({ name: candidate.name, instructions: candidate.instructions, provider: candidate.provider, model: candidate.model, enabled: candidate.enabled, attachment: candidate.attachment }) === JSON.stringify(settings)) { setSaved(candidate); return; }
        throw new Error(data.error || '保存を確認できません。入力は残っています。同じ内容で再試行できます。');
      }
      setSaved(data.agent);
    } catch (reason) { setError(reason instanceof Error ? reason.message : '保存できません。入力は残っています。'); }
    finally { setBusy(false); }
  }
  return <WorkspaceShell title="Eveで担当を作る" tone="sky"><div className={styles.page}>
    <header className={styles.hero}><div><Link href="/os/eve">Eveに戻る</Link><h1>何につなぎ、何を任せたい？</h1><p>困りごとから担当を作り、Smithで取り付ける部品につなぐ準備をします。お皿やペン、育てている植物など、自分がつなぎたい対象から始められます。</p></div></header>
    {account === 'loading' && <output>自分のSmithを確認しています…</output>}
    {account === 'signed-out' && <p><Link href="/account?returnTo=%2Fos%2Feve%2Fcreate-agent">ログインして自分の担当を作る</Link></p>}
    {account === 'error' && <SkyNotice message="Smithに接続できません。接続を確認して画面を開き直してください。" />}
    {error && <SkyNotice message={error} />}
    {saved ? <section className={styles.editor} aria-label="担当を保存しました"><h2>{saved.name}を保存しました</h2><p>Smithの自分の一覧に追加しました。保存だけでは、機器の接続や仕事の実行は始まりません。</p><p><Link href={skyObjectEntryPath(saved.id)}>この担当と接続に必要な部品を見る</Link></p><p><Link href={skyAgentEvePath(saved)}>Eveでこの担当を開く</Link></p><p>取り付け部品の製作・登録と、音声やセンサーの実接続はこれからです。現在の入口で相談する場合は、本人が文章を入力します。</p></section>
    : draft ? <section className={styles.editor} aria-label="担当の下書きを確認"><h2>この担当でよさそう？</h2><p>入力から作ったひな形です。AIの推論や機器の操作はまだ行っていません。名前と役割を書き換えられます。</p>
      <label>名前<input disabled={busy} value={draft.name} maxLength={80} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label>
      <label>この担当の役割<textarea disabled={busy} value={draft.instructions} rows={8} maxLength={1200} onChange={e => setDraft({ ...draft, instructions: e.target.value })} /></label>
      <details><summary>使うAIを確認・変更</summary><p>既存の担当がある場合は、そのモデルの設定を引き継いでいます。接続・外部送信・料金は依頼時に確認します。</p><label>接続先<select disabled={busy} value={draft.provider} onChange={e => { const provider = e.target.value as TextModelProviderId; setDraft({ ...draft, provider, model: textModelProviderDefinition(provider).defaultModel }); }}>{textModelProviders.map(provider => <option key={provider.id} value={provider.id}>{provider.name}</option>)}</select></label><label>モデルの名前<input disabled={busy} value={draft.model} maxLength={120} onChange={e => setDraft({ ...draft, model: e.target.value })} /></label></details>
      <p>部品が実際に受け取れる情報と、返せる結果をSmithで確かめてから接続します。</p><div className={styles.actions}><button type="button" disabled={busy} onClick={() => setDraft(null)}>困りごとを書き直す</button><button type="button" disabled={busy || account !== 'ready'} onClick={() => void save()}>{busy ? '保存を確認しています…' : '確認してSmithに保存'}</button></div>
    </section> : <form className={styles.editor} onSubmit={event => { event.preventDefault(); prepare(); }}><h2>まず、困っていることを教えて</h2>
      <label>担当を付けたい対象<input required maxLength={40} placeholder="例：お皿、ペン、育てている植物" value={objectName} onChange={e => setObjectName(e.target.value)} /></label>
      <label>何に困っている？<textarea required maxLength={240} rows={3} placeholder="例：家族のどのお皿か分からなくなる" value={problem} onChange={e => setProblem(e.target.value)} /></label>
      <label>どうなるとうれしい？<textarea required maxLength={240} rows={2} placeholder="例：持ち主と使い方を教えてほしい" value={result} onChange={e => setResult(e.target.value)} /></label>
      <label>何を受け取りたい？<select value={input} onChange={e => setInput(e.target.value as SkyObjectAttachment['input'])}>{skyObjectInputs.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      <label>どう伝えてほしい？<select value={output} onChange={e => setOutput(e.target.value as SkyObjectAttachment['output'])}>{skyObjectOutputs.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      <p>無機物・有機物を問わずつなげることを目指しています。ここで選ぶのは使い方の希望です。マイク・センサー・スピーカーなどは、取り付ける部品や接続先に実際に必要です。</p><div className={styles.actions}><button type="submit" disabled={account !== 'ready'}>担当の下書きを作る</button></div>
    </form>}
  </div></WorkspaceShell>;
}
