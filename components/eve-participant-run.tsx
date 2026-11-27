'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { EveChatCandidate, EveChatPlan } from '@/lib/eve-chat';
import { isEveParticipantAgent, normalizeEveRecipe, type EveRecipe } from '@/lib/noah-eve-participant';
import { OWNER_SCOPE_HEADER } from '@/lib/owner-intent';
import styles from './noah-engineering-eve.module.css';

const csvId = 'market:tool:rockstar-csv-cleanup';
const articleId = 'market:tool:mr-free-article';
const endpoint = '/api/noah/shared-compute';
const states = { queued: '参加端末を待っています', leased: '参加端末で実行中', completed: '検収済み', cancelled: '取り消し済み', expired: '期限内に検収できませんでした' };
type Job = { id: string; requestId: string; status: keyof typeof states; inputKind: string; receiptId: string | null; result: { text: string; steps: string[] } | null };
type Board = { ownerScope: string; chainConsentVersion: string; canSubmitChain: boolean; pilot: { active: boolean; jobLimit: number | null; expiresAt?: number | null }; jobs: Job[] };
type Form = { source: string; afterChars: string; summary: string; price: string; paidContents: string; noteUrl: string };
const emptyForm: Form = { source: '', afterChars: '', summary: '', price: '', paidContents: '', noteUrl: '' };

function participantSteps(plan: EveChatPlan, candidates: EveChatCandidate[]) {
  const agents: string[] = [];
  if (!plan.steps.length || plan.steps.length > 4) return { agents, reason: '参加端末には1〜4工程の設計を依頼できます。' };
  for (const [index, step] of plan.steps.entries()) {
    if (!step.agentId) return { agents, reason: `工程${index + 1}には、新しく開発するAgentが必要です。` };
    if (!candidates.some(agent => agent.id === step.agentId)) return { agents, reason: `工程${index + 1}のAgentを相談時の候補から確認できません。` };
    if (!isEveParticipantAgent(step.agentId)) return { agents, reason: `工程${index + 1}のAgentは参加端末での処理に未対応です。` };
    agents.push(step.agentId);
  }
  if (agents.includes(csvId) && agents.some(id => id !== csvId)) return { agents, reason: 'CSV整形と原稿の工程は入力形式が異なります。Eveに別々の設計を依頼してください。' };
  return { agents, reason: '' };
}
async function computeRequest<T>(url: string, owner: string, signal: AbortSignal, body?: object): Promise<T> {
  const result = await fetch(url, {
    method: body ? 'POST' : 'GET', cache: 'no-store', credentials: 'same-origin',
    headers: body ? { [OWNER_SCOPE_HEADER]: owner, 'Content-Type': 'application/json' } : { [OWNER_SCOPE_HEADER]: owner },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
  });
  if (result.status === 401) throw new Error('参加端末を利用するには、Noahにログインしてください。');
  const data = await result.json();
  if (!result.ok) {
    const message = data && typeof data === 'object' && 'error' in data ? data.error : null;
    throw new Error(typeof message === 'string' ? message : '参加端末への依頼を確認できませんでした。');
  }
  return data as T;
}
function errorText(error: unknown) {
  return error instanceof Error && error.name === 'Error' ? error.message : '通信できませんでした。接続を確認して、状況を更新してください。';
}
export default function EveParticipantRun({ plan, candidates, owner, requestId, onNewRun }: { plan: EveChatPlan; candidates: EveChatCandidate[]; owner: string; requestId: string; onNewRun: () => void }) {
  const { agents, reason } = participantSteps(plan, candidates);
  const [open, setOpen] = useState(false), [board, setBoard] = useState<Board | null>(null);
  const [form, setForm] = useState<Form>(emptyForm), [preview, setPreview] = useState<EveRecipe | null>(null);
  const [accepted, setAccepted] = useState(''), [error, setError] = useState(''), [inputError, setInputError] = useState('');
  const [busy, setBusy] = useState(false), [refresh, setRefresh] = useState(0);
  const action = useRef<AbortController | null>(null);
  const job = board?.jobs.find(item => item.requestId === requestId && item.inputKind === 'eve-chain');
  const funding = board?.pilot?.active ? 'pilot' : 'monthly';
  const consentIntent = board?.chainConsentVersion ? board.chainConsentVersion + '/' + funding : '';
  const pending = job?.status === 'queued' || job?.status === 'leased';
  const name = (id: string) => candidates.find(candidate => candidate.id === id)?.name ?? id;
  useEffect(() => () => action.current?.abort(), []);
  useEffect(() => {
    if (!open || reason) return;
    const ctl = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const next = await computeRequest<Board>(endpoint + '?requestId=' + encodeURIComponent(requestId), owner, ctl.signal);
        if (ctl.signal.aborted) return;
        if (next.ownerScope !== owner) throw new Error('相談を作ったアカウントでログインし直してください。');
        setBoard(next); setError('');
        if (next.jobs.some(item => item.status === 'queued' || item.status === 'leased')) timer = setTimeout(() => void load(), 6000);
      } catch (err) {
        if (!ctl.signal.aborted) { setBoard(null); setAccepted(''); setError(errorText(err)); }
      }
    }
    void load();
    return () => { ctl.abort(); clearTimeout(timer); };
  }, [open, reason, requestId, owner, refresh]);
  function edit(key: keyof Form, value: string) {
    setForm(prev => ({ ...prev, [key]: value })); setPreview(null); setAccepted(''); setInputError('');
  }
  function prepare() {
    try {
      setPreview(normalizeEveRecipe({ agents, source: form.source, ...(agents.includes(articleId) ? { options: {
        afterChars: Number(form.afterChars), summary: form.summary, price: Number(form.price), paidContents: form.paidContents, noteUrl: form.noteUrl,
      } } : {}) })); setAccepted(''); setInputError('');
    } catch (err) { setInputError(errorText(err)); }
  }
  async function changeJob(cancel: boolean) {
    if (action.current || !board) return;
    if (cancel ? !pending : !board.canSubmitChain || !preview || !board.chainConsentVersion || accepted !== consentIntent || job) return;
    const ctl = new AbortController(); action.current = ctl; setBusy(true); setError('');
    try {
      await computeRequest(endpoint, owner, ctl.signal, cancel ? { action: 'cancel', jobId: job!.id } :
        { action: 'submitChain', requestId, funding, consentVersion: board.chainConsentVersion, acceptThirdParty: true, recipe: preview });
      if (ctl.signal.aborted) return;
      setForm(emptyForm); setPreview(null); setAccepted(''); setBoard(null); setRefresh(n => n + 1);
    } catch (err) { if (!ctl.signal.aborted) { setError(errorText(err)); setAccepted(''); } }
    finally { action.current = null; if (!ctl.signal.aborted) setBusy(false); }
  }
  if (reason) return <p className={styles.note}>参加端末で実行できません。{reason}</p>;
  if (!open) return <p><button type="button" onClick={() => setOpen(true)}>参加端末で実行・結果を確認</button></p>;
  return <section className={styles.participant} aria-label="参加端末で実行">
    <h4>参加端末で実行</h4>
    {error && <div role="alert">{error} <button type="button" disabled={busy} onClick={() => setRefresh(n => n + 1)}>状況を更新</button></div>}
    {!board && !error && <output>依頼状況を確認中…</output>}
    {job ? <>
      <output>{states[job.status]}</output>
      {pending && <button type="button" disabled={busy} onClick={() => void changeJob(true)}>依頼を取り消す</button>}
      {job.status === 'completed' && job.result && <><p>完了した工程　{job.result.steps.map(name).join(' → ')}</p><pre aria-label="検収済みの成果">{job.result.text}</pre></>}
      {job.receiptId && <small>検収記録　{job.receiptId}</small>}
      {!pending && board?.canSubmitChain && <button type="button" onClick={onNewRun}>別の入力で実行する</button>}
    </> : board?.canSubmitChain ? <>
      {board.pilot?.active ? <p>本人限定の無料試験です。依頼側と端末提供側は、登録した別々のアカウントでログインしてください。{board.pilot.expiresAt && `期限は${new Date(board.pilot.expiresAt).toLocaleString('ja-JP')}です。`}{board.pilot.jobLimit ? `試験枠は合計${board.pilot.jobLimit}件です。` : ''}</p> : <p>契約中の月額プランの利用枠から1件を使います。</p>}
      <p>公開できる{agents.includes(csvId) ? 'CSV' : '原稿'}を入力してください。同意後、この内容と工程をNoahと参加端末の提供者が読める状態で送ります。</p>
      {agents.includes(csvId) && <p className={styles.note}>CSVの各項目の前後の空白を除き、重複する行をまとめます。</p>}
      <fieldset disabled={busy} className={styles.participantFields}>
        <label>{agents.includes(csvId) ? '公開CSV' : '公開原稿（Markdown）'}<textarea rows={5} value={form.source} onChange={event => edit('source', event.target.value)} maxLength={4096} spellCheck={false} /></label>
        <small>入力はUTF-8で4 KiBまで</small>
        {agents.includes(articleId) && <>
          <label>無料で掲載する文字数<input type="number" min="1" value={form.afterChars} onChange={event => edit('afterChars', event.target.value)} /></label>
          <label>まとめ（「- 」で始まる3〜5行）<textarea rows={4} value={form.summary} onChange={event => edit('summary', event.target.value)} /></label>
          <label>記事に記載する価格（円）<input type="number" min="1" value={form.price} onChange={event => edit('price', event.target.value)} /></label>
          <label>完全版の内容<input value={form.paidContents} onChange={event => edit('paidContents', event.target.value)} /></label>
          <label>完全版のnote記事URL<input type="url" value={form.noteUrl} onChange={event => edit('noteUrl', event.target.value)} /></label>
        </>}
        <button type="button" onClick={prepare}>送信内容を確認</button>
      </fieldset>
      {inputError && <p role="alert">{inputError}</p>}
      {preview && <div className={styles.dispatch}>
        <h4>参加端末に届く内容</h4>
        <p>{preview.agents.map(name).join(' → ')}</p><pre>{preview.source}</pre>
        {preview.options && <dl><dt>無料で掲載する文字数</dt><dd>{preview.options.afterChars}</dd><dt>まとめ</dt><dd>{preview.options.summary}</dd><dt>記事に記載する価格</dt><dd>{preview.options.price}円</dd><dt>完全版の内容</dt><dd>{preview.options.paidContents}</dd><dt>完全版のURL</dt><dd>{preview.options.noteUrl}</dd></dl>}
        <label className={styles.dispatchConsent}><input type="checkbox" checked={Boolean(accepted) && accepted === consentIntent} disabled={busy} onChange={event => setAccepted(event.target.checked ? consentIntent : '')} />この内容を参加端末の提供者と共有し、表示した順で実行することに同意します。</label>
        <button type="button" className={styles.primary} disabled={busy || !accepted || accepted !== consentIntent} onClick={() => void changeJob(false)}>同意して依頼する</button>
      </div>}
    </> : board && <p>このアカウントでは現在、参加端末への依頼を受け付けていません。</p>}
    <Link href="/noah/shared-compute">参加端末の登録と試験用ID</Link>
  </section>;
}
