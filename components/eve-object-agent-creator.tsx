'use client';
import { useEffect, useLayoutEffect, useRef, useState, type SubmitEvent } from 'react';
import Link from 'next/link';
import { makeEveAgentOrigin } from '@/lib/eve-agent-origin';
import type { EveSourcePin } from '@/lib/eve-source-context';
import { eveAgentDraftFromReply } from '@/lib/eve-agent-proposal';
import { defaultSkyAgentSettings, parseSkyAgentSettings, type SkyAgentSettings, type SkyLibraryAgent } from '@/lib/sky-agent-library';
import SkyAgentCapabilityReview from '@/components/sky-agent-capability-review';
import { readOwnerScope } from '@/lib/owner-intent';
import { textModelProviderDefinition, textModelProviders, type TextModelProviderId } from '@/lib/llm-providers';
import { createEveAgent, prepareEveAgentPending, readEveAgentPending, reconcileEveAgentCreation, type EveAgentPending, type EveAgentCreationResult } from '@/lib/eve-agent-creation';

type ReplySource = { id: string; text: string; generation: number; source?: EveSourcePin };

/** Creates only a saved role. Tool selection and execution require separate consent. */
export default function EveObjectAgentCreator({ replies = [], threadId = 'new' }: { replies?: ReadonlyArray<{ id: string; text: string; source?: EveSourcePin }>; threadId?: string }) {
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
  const [replySelection, setReplySelection] = useState<{ id: string; original: string; edited: string; generation: number; source?: EveSourcePin } | null>(null);
  const [importedSource, setImportedSource] = useState<ReplySource | null>(null);
  const [accessInvalidated,setAccessInvalidated] = useState(false);
  const committedReplies = useRef<ReplySource[]>([]);
  const generation = useRef(0);
  const mounted = useRef(false);
  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false; committedReplies.current = []; }; }, []);
  useLayoutEffect(() => {
    committedReplies.current = replies.map(reply => {
      const previous = committedReplies.current.find(item => item.id === reply.id && item.text === reply.text && JSON.stringify(item.source) === JSON.stringify(reply.source));
      return { ...reply, generation: previous?.generation ?? ++generation.current };
    });
  }, [replies]);
  useEffect(() => {
    if(typeof window==='undefined' || typeof window.addEventListener!=='function')return;
    const changed=()=>{
      if(!committedReplies.current.some(reply=>reply.source?.schema==='rockstaros.eve-post-source/1'))return;
      // An ephemeral generation, never a key or persisted authority. This also
      // fences owner/digest awaits when a key is changed and then restored.
      committedReplies.current=committedReplies.current.map(reply=>reply.source?.schema==='rockstaros.eve-post-source/1'?{...reply,generation:++generation.current}:reply);
      setAccessInvalidated(true);setReplySelection(null);setError('投稿の閲覧条件が変わりました。回答を選び直して下書きを確認してください。');
    };
    window.addEventListener('rockstar-community-changed',changed);window.addEventListener('storage',changed);
    return ()=>{window.removeEventListener('rockstar-community-changed',changed);window.removeEventListener('storage',changed);};
  },[]);
  function sourceCurrent(source: ReplySource) {
    return mounted.current && committedReplies.current.some(reply => reply.id === source.id && reply.text === source.text && reply.generation === source.generation && JSON.stringify(reply.source) === JSON.stringify(source.source));
  }
  const importedCurrent = !importedSource || !accessInvalidated && replies.some(reply=>reply.id===importedSource.id && reply.text===importedSource.text);
  async function importReply() {
    if (!owner || !replySelection || busy || uncertain || inFlight.current) return;
    const selection = replySelection, source = { id: selection.id, text: selection.original, generation: selection.generation, ...(selection.source ? {source:selection.source}: {}) };
    if (!sourceCurrent(source)) { setError('元の回答が変わりました。現在の回答を選び直してください。'); return; }
    inFlight.current = true; setBusy(true); setError('');
    try {
      const response = await fetch('/api/sky/agents', { cache: 'no-store' });
      const body = await response.json() as { ownerScope?: unknown };
      if (!response.ok || body.ownerScope !== owner || !sourceCurrent(source))
        throw new Error('本人または元の回答が変わりました。読み直してください。');
      const origin = await makeEveAgentOrigin(threadId,selection.id,selection.original,selection.source);
      if (!sourceCurrent(source)) throw new Error('元の回答が変わりました。選び直してください。');
      const settings = { ...eveAgentDraftFromReply(selection.edited), origin };
      setAccessInvalidated(false);setImportedSource(source); setDraft(settings);
    } catch (reason) { setError(reason instanceof Error ? reason.message : '回答から下書きを作れませんでした。'); }
    finally { inFlight.current = false; setBusy(false); }
  }
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
    event.preventDefault(); if (!owner || uncertain || busy || inFlight.current) return; setError('');
    try {
      // These fields are owner-authored role data, never a model-produced grant.
      const instructions = [`目的・役割: ${purpose.trim()}`, `受け取るもの: ${input.trim()}`, `期待する成果: ${output.trim()}`].join('\n');
      const settings = parseSkyAgentSettings(defaultSkyAgentSettings(name, instructions));
      if (!purpose.trim() || !input.trim() || !output.trim()) throw new Error('目的・入力・期待する成果を入力してください。');
      setImportedSource(null); setDraft(settings);
    } catch (reason) { setError(reason instanceof Error ? reason.message : '入力を確認してください。'); }
  }
  function accept(result: EveAgentCreationResult) {
    if (result.state === 'saved') { setSaved(result.agent); setUncertain(false); setError(''); }
    else { setUncertain(result.state === 'unknown'); setError(result.error); }
  }
  async function save() {
    if (!draft || !owner || busy || uncertain || inFlight.current) return;
    if (importedSource && !sourceCurrent(importedSource)) { setError('元の回答が変わりました。下書きを作り直してください。'); return; }
    inFlight.current = true; setBusy(true); setError('');
    try {
      const settings = parseSkyAgentSettings(draft);
      const response = await fetch('/api/sky/agents', { cache: 'no-store' });
      if (!response.ok) throw new Error(response.status === 401 ? 'サインインして担当を保存してください。' : '本人を確認できません。');
      const body = await response.json() as { ownerScope?: unknown };
      if (!mounted.current || body.ownerScope !== owner || (importedSource && !sourceCurrent(importedSource))) throw new Error('本人が変わりました。画面を読み直してください。');
      const request = { ownerScope: owner, id: crypto.randomUUID(), settings };
      const record = await prepareEveAgentPending(request);
      if (!mounted.current || (importedSource && !sourceCurrent(importedSource))) throw new Error('元の回答が変わりました。下書きを作り直してください。');
      setPending(record);
      let sourceBlocked = false;
      try { accept(await createEveAgent(fetch, request, record, sessionStorage, () => {
        if (!mounted.current || (importedSource && !sourceCurrent(importedSource))) { sourceBlocked = true; throw new Error('stale reply'); }
      })); }
      catch {
        if (sourceBlocked) { setPending(null); setUncertain(false); setError('元の回答が変わったため保存していません。下書きを作り直してください。'); }
        else { setUncertain(true); setError('保存前の記録を確認できません。画面を読み直して保存状態を確認してください。'); }
      }
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
      {saved.origin && <p>下書きの由来: 回答 {saved.origin.replyId}{saved.origin.source ? ` · ${saved.origin.source.key}${saved.origin.source.schema==='rockstaros.eve-source/1' ? ` · 保存元の版 ${saved.origin.source.revision}` : ' · 選択した投稿の内容記録'}` : ' · 出典の記録なし'}。権限や検収の証明ではありません。</p>}
      <SkyAgentCapabilityReview agent={saved} onSaved={setSaved} />
      <Link href="/sky/agents">担当の設定を開く</Link></section>
      : uncertain && pending && !draft ? <section aria-label="担当の保存結果を照合"><p>保存途中だった担当があります。先に同じ担当の結果を確認してください。</p><button type="button" disabled={busy} onClick={() => void reconcile()}>同じ担当の保存結果を照合</button></section>
      : draft ? <section aria-label="担当の確認"><p>内容を確認して保存します。Toolや実行先は別に確認します。</p>
        {importedSource && <p>選んだ回答から作った下書きです。内容を編集し、保存前に確認してください。由来は本人が確認した履歴で、モデル応答や安全性の証明ではありません。</p>}
        {!importedCurrent && <p role="alert">元の回答が変わりました。下書きを作り直してください。</p>}
        <label>担当の名前<input maxLength={80} disabled={busy || uncertain} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label>
        <label>役割・入力・期待する成果<textarea maxLength={1200} rows={5} disabled={busy || uncertain} value={draft.instructions} onChange={e => setDraft({ ...draft, instructions: e.target.value })} /></label>
        <label>モデルの接続先<select value={draft.provider} disabled={busy || uncertain} onChange={e => { const provider = e.target.value as TextModelProviderId; setDraft({ ...draft, provider, model: textModelProviderDefinition(provider).defaultModel }); }}>{textModelProviders.map(p => <option value={p.id} key={p.id}>{p.name}</option>)}</select></label>
        <label>モデルID<input maxLength={120} value={draft.model} disabled={busy || uncertain} onChange={e => setDraft({ ...draft, model: e.target.value })} /></label>
        {uncertain ? <button type="button" disabled={busy} onClick={() => void reconcile()}>同じ担当の保存結果を照合</button> : <><button type="button" disabled={busy} onClick={() => setDraft(null)}>入力へ戻る</button><button type="button" disabled={busy || !owner || !importedCurrent} onClick={() => void save()}>{busy ? '保存を確認しています…' : '確認して保存'}</button></>}
      </section> : <>
      {replies.length > 0 && <section aria-label="Eveの回答から担当を作る">
        <label>下書きに使う回答<select aria-label="下書きに使う回答" disabled={busy || uncertain} value={replySelection?.id ?? ''} onChange={e => {
          const reply = committedReplies.current.find(item => item.id === e.target.value);
          setReplySelection(reply ? { id:reply.id, original:reply.text, edited:reply.text, generation:reply.generation, ...(reply.source ? {source:reply.source}: {}) } : null); setError('');
        }}><option value="">回答を選択</option>{replies.map((reply,index) => <option key={reply.id} value={reply.id}>回答{index+1} · {reply.text.slice(0,60)}</option>)}</select></label>
        {replySelection && <label>下書きに使う文章<textarea aria-label="下書きに使う文章" rows={6} maxLength={16000} disabled={busy || uncertain} value={replySelection.edited}
          onChange={e => setReplySelection({ ...replySelection, edited:e.target.value })} /></label>}
        <p>回答を役割の下書きにします。Toolと実行先は保存後にSmithで照合します。実行と料金の確認は別に必要です。</p>
        <button type="button" disabled={!owner || !replySelection || busy || uncertain} onClick={() => void importReply()}>回答から下書きを作る</button>
      </section>}
      <form onSubmit={prepare} aria-label="担当の作成">
        <label>担当の名前<input required disabled={busy || uncertain} maxLength={80} value={name} onChange={e => setName(e.target.value)} /></label>
        <label>何を手伝う担当ですか<textarea required disabled={busy || uncertain} maxLength={600} value={purpose} onChange={e => setPurpose(e.target.value)} /></label>
        <label>受け取るもの<input required disabled={busy || uncertain} maxLength={200} value={input} onChange={e => setInput(e.target.value)} /></label>
        <label>期待する成果<input required disabled={busy || uncertain} maxLength={200} value={output} onChange={e => setOutput(e.target.value)} /></label>
        <button type="submit" disabled={!owner || uncertain || busy}>内容を確認</button>
      </form></>}
    {error && <p role="alert">{error}</p>}
  </details>;
}
