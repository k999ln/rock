'use client';
import { useEffect, useRef, useState, type SubmitEvent } from 'react';
import Link from 'next/link';
import { defaultSkyAgentSettings, parseSkyAgentSettings, type SkyAgentSettings, type SkyLibraryAgent } from '@/lib/sky-agent-library';
import SkyAgentCapabilityReview from '@/components/sky-agent-capability-review';
import { readOwnerScope } from '@/lib/owner-intent';
import { textModelProviderDefinition, textModelProviders, type TextModelProviderId } from '@/lib/llm-providers';
import { createEveAgent, prepareEveAgentPending, readEveAgentPending, reconcileEveAgentCreation, type EveAgentPending, type EveAgentCreationResult } from '@/lib/eve-agent-creation';

/** Creates only a saved role. Tool selection and execution require separate consent. */
export default function EveObjectAgentCreator() {
  const [name, setName] = useState('');
  const [purpose, setPurpose] = useState('');
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [draft, setDraft] = useState<SkyAgentSettings | null>(null);
  const [pending, setPending] = useState<EveAgentPending | null>(null);
  const [saved, setSaved] = useState<SkyLibraryAgent | null>(null);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState('');
  const [owner, setOwner] = useState<string | null>(null);
  const inFlight = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/sky/agents', { cache: 'no-store', signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('本人を確認できません。');
      const body = await response.json() as { ownerScope?: unknown };
      const scope = readOwnerScope(body.ownerScope);
      if (!scope) throw new Error('本人を確認できません。');
      const restored = readEveAgentPending(sessionStorage, scope);
      if (!controller.signal.aborted) {
        setOwner(scope);
        if (restored) { setPending(restored); setUncertain(true); setError('前の保存結果を確認してください。'); }
      }
    }).catch(() => { if (!controller.signal.aborted) setError('本人または保存途中の担当を確認できません。'); });
    return () => controller.abort();
  }, []);

  function prepare(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault(); if (!owner || uncertain) return; setError('');
    try {
      // These fields are owner-authored role data, never a model-produced grant.
      const instructions = [`目的・役割: ${purpose.trim()}`, `受け取るもの: ${input.trim()}`, `期待する成果: ${output.trim()}`].join('\n');
      const settings = parseSkyAgentSettings(defaultSkyAgentSettings(name, instructions));
      if (!purpose.trim() || !input.trim() || !output.trim()) throw new Error('目的・入力・期待する成果を入力してください。');
      setDraft(settings);
    } catch (reason) { setError(reason instanceof Error ? reason.message : '入力を確認してください。'); }
  }
  function accept(result: EveAgentCreationResult) {
    if (result.state === 'saved') { setSaved(result.agent); setUncertain(false); setError(''); }
    else { setUncertain(result.state === 'unknown'); setError(result.error); }
  }
  async function save() {
    if (!draft || !owner || busy || uncertain || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError('');
    try {
      const settings = parseSkyAgentSettings(draft);
      const response = await fetch('/api/sky/agents', { cache: 'no-store' });
      if (!response.ok) throw new Error(response.status === 401 ? 'サインインして担当を保存してください。' : '本人を確認できません。');
      const body = await response.json() as { ownerScope?: unknown };
      if (body.ownerScope !== owner) throw new Error('本人が変わりました。画面を読み直してください。');
      const request = { ownerScope: owner, id: crypto.randomUUID(), settings };
      const record = await prepareEveAgentPending(request);
      setPending(record);
      try { accept(await createEveAgent(fetch, request, record, sessionStorage)); }
      catch { setUncertain(true); setError('保存前の記録を確認できません。画面を読み直して保存状態を確認してください。'); }
    } catch (reason) { setError(reason instanceof Error ? reason.message : '保存できませんでした。'); }
    finally { inFlight.current = false; setBusy(false); }
  }
  async function reconcile() {
    if (!pending || busy || inFlight.current) return;
    inFlight.current = true; setBusy(true);
    try { accept(await reconcileEveAgentCreation(fetch, pending, sessionStorage)); } finally { inFlight.current = false; setBusy(false); }
  }
  return <details className="zema-workflow-details">
    <summary>自分の担当を作る</summary>
    {saved ? <section aria-label="担当の保存結果"><p>{saved.name}を保存しました。保存だけでは仕事やToolは実行されません。</p>
      <SkyAgentCapabilityReview agent={saved} onSaved={setSaved} />
      <Link href="/sky/agents">担当の設定を開く</Link></section>
      : uncertain && pending && !draft ? <section aria-label="担当の保存結果を照合"><p>保存途中だった担当があります。先に同じ担当の結果を確認してください。</p><button type="button" disabled={busy} onClick={() => void reconcile()}>同じ担当の保存結果を照合</button></section>
      : draft ? <section aria-label="担当の確認"><p>内容を確認して保存します。Toolや実行先は別に確認します。</p>
        <label>担当の名前<input maxLength={80} disabled={busy || uncertain} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label>
        <label>役割・入力・期待する成果<textarea maxLength={1200} rows={5} disabled={busy || uncertain} value={draft.instructions} onChange={e => setDraft({ ...draft, instructions: e.target.value })} /></label>
        <label>モデルの接続先<select value={draft.provider} disabled={busy || uncertain} onChange={e => { const provider = e.target.value as TextModelProviderId; setDraft({ ...draft, provider, model: textModelProviderDefinition(provider).defaultModel }); }}>{textModelProviders.map(p => <option value={p.id} key={p.id}>{p.name}</option>)}</select></label>
        <label>モデルID<input maxLength={120} value={draft.model} disabled={busy || uncertain} onChange={e => setDraft({ ...draft, model: e.target.value })} /></label>
        {uncertain ? <button type="button" disabled={busy} onClick={() => void reconcile()}>同じ担当の保存結果を照合</button> : <><button type="button" disabled={busy} onClick={() => setDraft(null)}>入力へ戻る</button><button type="button" disabled={busy || !owner} onClick={() => void save()}>{busy ? '保存を確認しています…' : '確認して保存'}</button></>}
      </section> : <form onSubmit={prepare} aria-label="担当の作成">
        <label>担当の名前<input required maxLength={80} value={name} onChange={e => setName(e.target.value)} /></label>
        <label>何を手伝う担当ですか<textarea required maxLength={600} value={purpose} onChange={e => setPurpose(e.target.value)} /></label>
        <label>受け取るもの<input required maxLength={200} value={input} onChange={e => setInput(e.target.value)} /></label>
        <label>期待する成果<input required maxLength={200} value={output} onChange={e => setOutput(e.target.value)} /></label>
        <button type="submit" disabled={!owner || uncertain}>内容を確認</button>
      </form>}
    {error && <p role="alert">{error}</p>}
  </details>;
}
