'use client';
/* oxlint-disable next/no-html-link-for-pages -- Draft navigation keeps the editor's native lifecycle. */
import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Plus, Download } from 'lucide-react';
import { engineeringEveDraft } from '@/lib/noah-engineering-eve';
import type { NoahEngineeringStep } from '@/lib/noah-engineering';
import type { NoahLocale } from '@/lib/noah-i18n';
import { OWNER_SCOPE_HEADER, readOwnerScope } from '@/lib/owner-intent';
import { eveChatContext, evePlanDraft, eveCandidateHref, type EveChatCandidate, type EveChatPlan } from '@/lib/eve-chat';
import { eveLocalStore, newEveChat, type EveLocalChat, type EveLocalSummary, type EveLocalMessage } from '@/lib/eve-chat-local';
import { useNoahLocale } from './noah-locale';
import EveParticipantRun from './eve-participant-run';
import styles from './noah-engineering-eve.module.css';

const examples = ['会議メモから担当者別のタスクを作りたい', '毎朝ニュースを集めて短くまとめたい', '原稿の出典を整理して、記事の無料版を作りたい'];
export default function NoahEngineeringEve({ stage = 'create', draftLocale, emptyDraft = false }: {
  stage?: NoahEngineeringStep; draftLocale?: NoahLocale; emptyDraft?: boolean;
}) {
  const { locale, t } = useNoahLocale();
  const [chat, setChat] = useState<EveLocalChat | null>(null);
  const [chats, setChats] = useState<EveLocalSummary[]>([]);
  const [draft, setDraft] = useState(emptyDraft ? '' : engineeringEveDraft(stage, draftLocale ?? locale));
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [storageError, setStorageError] = useState('');
  const [ready, setReady] = useState(false), [confirmation, setConfirmation] = useState(false);
  const current = useRef<EveLocalChat | null>(null), sending = useRef(false);
  const store = useRef<ReturnType<typeof eveLocalStore> | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const revisions = useRef(new Map<string, number>());
  const pending = useRef<{ id: string; messages: ReturnType<typeof eveChatContext> } | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    (async () => {
      const response = await fetch('/api/noah/eve-chat', { cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) });
      const status = await response.json() as { ownerScope: string; available: boolean };
      if (!response.ok || !readOwnerScope(status.ownerScope)) throw new Error('Eveに接続できません。接続を確認して画面を読み直してください。');
      if (controller.signal.aborted) return;
      store.current = eveLocalStore();
      let saved: EveLocalSummary[] = [];
      try { saved = await store.current.list(status.ownerScope); }
      catch { setStorageError('このブラウザーでは会話を保存できません。保存を許可してから画面を読み直してください。'); }
      if (controller.signal.aborted) return;
      const initial = (saved[0] ? await store.current.get(status.ownerScope, saved[0].id) : null) ?? newEveChat(status.ownerScope);
      if (controller.signal.aborted) return;
      current.current = initial; setChat(initial); setChats(saved);
      revisions.current.set(initial.id, initial.revision);
      if (saved.length) setDraft(initial.draft);
      setReady(status.available === true);
      if (!status.available) setError('Eveのクラウドは準備中です。');
    })().catch(() => { if (!controller.signal.aborted) setError('Eveに接続できません。接続を確認して画面を読み直してください。'); });
    return () => { mounted.current = false; controller.abort(); };
  }, []);
  async function persist(value: EveLocalChat) {
    current.current = value; setChat(value);
    const task = queue.current.then(async () => {
      if (!store.current) throw new Error('端末の保存先を開けません。');
      const saved = await store.current.save({ ...value, revision: revisions.current.get(value.id) ?? value.revision });
      revisions.current.set(value.id, saved.revision);
      if (!mounted.current) return;
      setChats(items => [saved, ...items.filter(item => item.id !== saved.id)]);
      if (current.current?.id === value.id) { current.current = { ...current.current, revision: saved.revision }; setChat(current.current); }
    });
    queue.current = task.catch(() => {});
    try { await task; return true; }
    catch (err) { setStorageError(err instanceof Error ? err.message : '会話を端末へ保存できません。書き出して保管してください。'); return false; }
  }
  async function send(confirmed = false) {
    if (sending.current || !current.current || !ready || storageError) return;
    if (!confirmed && (!draft.trim() || draft.length > 3000 || current.current.messages.length >= 100)) return;
    sending.current = true; setBusy(true); setError('');
    const starting = current.current;
    try {
      if (!confirmed) {
        const message: EveLocalMessage = { id: crypto.randomUUID(), role: 'user', content: draft.trim() };
        const next = { ...starting, title: starting.messages.length ? starting.title : draft.trim().slice(0, 40), draft: '', messages: [...starting.messages, message] };
        if (!await persist(next)) return;
        pending.current = { id: crypto.randomUUID(), messages: eveChatContext(next.messages.map(item => ({ role: item.role, content: item.plan ? JSON.stringify({ reply: item.content, plan: item.plan }) : item.content }))) };
        setDraft('');
      }
      if (!pending.current) return;
      const response = await fetch('/api/noah/eve-chat', { method: 'POST', headers: { 'Content-Type': 'application/json', [OWNER_SCOPE_HEADER]: starting.owner }, body: JSON.stringify({ ...pending.current, confirm: confirmed }), signal: AbortSignal.timeout(60000) });
      const result = await response.json() as { error?: string; confirmationRequired?: boolean; ownerScope?: string; reply: string; plan: EveChatPlan | null; candidates: EveChatCandidate[] };
      if (!mounted.current) return;
      if (result.confirmationRequired) { setConfirmation(true); return; }
      setConfirmation(false);
      if (!response.ok) throw new Error(result.error || '返答を受け取れませんでした。');
      if (result.ownerScope !== starting.owner || typeof result.reply !== 'string') throw new Error('利用者が変わりました。画面を読み直してください。');
      const message: EveLocalMessage = { id: crypto.randomUUID(), role: 'assistant', content: result.reply, plan: result.plan, candidates: result.candidates };
      await persist({ ...current.current!, messages: [...current.current!.messages, message] });
      pending.current = null;
    } catch (err) {
      setError(err instanceof Error && err.name !== 'TimeoutError' ? err.message : '返答を受け取れませんでした。もう一度送信できます。');
      // Keep the question in history and restore it for editing; a retry gets a new admission ID.
      setDraft(starting.draft || pending.current?.messages.at(-1)?.content || draft);
      pending.current = null; setConfirmation(false);
    } finally { sending.current = false; if (mounted.current) setBusy(false); }
  }
  async function choose(id?: string) {
    if (sending.current || !current.current) return;
    if (!await persist({ ...current.current, draft })) return;
    let next: EveLocalChat | null;
    try { next = id ? await store.current!.get(current.current.owner, id) : newEveChat(current.current.owner); }
    catch { setStorageError('会話を読み込めませんでした。画面を読み直してください。'); return; }
    if (!next) return;
    revisions.current.set(next.id, next.revision);
    current.current = next; setChat(next); setDraft(next.draft); setError(''); setConfirmation(false); pending.current = null;
  }
  function download() {
    if (!current.current) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify({ ...current.current, draft }, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'eve-conversation.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function savePlan(plan: EveChatPlan, candidates: EveChatCandidate[]) {
    if (!current.current || sending.current) return;
    sending.current = true; setBusy(true); setError('');
    try {
      const id = crypto.randomUUID();
      const response = await fetch('/api/noah/drafts/' + id, { method: 'PUT', headers: { 'Content-Type': 'application/json', [OWNER_SCOPE_HEADER]: current.current.owner }, body: JSON.stringify({ revision: 0, commandId: crypto.randomUUID(), content: evePlanDraft(plan, candidates, id), clearSource: true }), signal: AbortSignal.timeout(20000) });
      if (!response.ok) { const result = await response.json() as { error?: string; confirmationRequired?: boolean; ownerScope?: string; reply: string; plan: EveChatPlan | null; candidates: EveChatCandidate[] }; throw new Error(result.error || '下書きを保存できませんでした。'); }
      window.location.assign('/noah/engineering?step=create&draft=' + id + '#engineering-work');
    } catch (err) { setError(err instanceof Error ? err.message : '下書きを保存できませんでした。'); }
    finally { sending.current = false; setBusy(false); }
  }
  return <section id="eve-compose" className={styles.consultation} aria-label="Eve">
    <div className={styles.toolbar}>
      <span className={styles.eve}>Eve</span>
      <button type="button" disabled={!chat || busy || !!storageError} onClick={() => void choose()}><Plus size={16} />{t('新しい相談')}</button>
      <button type="button" disabled={!chat} onClick={download} aria-label={t('会話を書き出す')} title={t('会話を書き出す')}><Download size={17} /></button>
    </div>
    {!!chats.length && <label className={styles.history}>{t('この端末の会話')}<select value={chat?.id ?? ''} disabled={busy || !!storageError} onChange={event => void choose(event.target.value)}>
      {!chats.some(item => item.id === chat?.id) && <option value={chat?.id ?? ''}>{t('新しい相談')}</option>}
      {chats.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
    </select></label>}
    {!chat?.messages.length && <div className={styles.intro}>
      <h2>{t('どんなAgentを作りますか？')}</h2>
      <p>{t('やりたいことから、一緒に考えましょう。使えるAgentを探し、組み合わせと新しく作る部分を整理します。')}</p>
    </div>}
    <div className={styles.messages} aria-label={t('Eveとの会話')}>
      {chat?.messages.map(message => <article key={message.id} className={message.role === 'user' ? styles.user : styles.answer}>
        <strong>{message.role === 'user' ? t('あなた') : 'Eve'}</strong><p>{message.content}</p>
        {message.plan && <div className={styles.plan} data-eve-proposal>
          <h3>{message.plan.name}</h3><p>{message.plan.summary}</p>
          <dl><dt>{t('入力')}</dt><dd>{message.plan.input}</dd><dt>{t('受け取る成果')}</dt><dd>{message.plan.outcome}</dd><dt>{t('試すときの合格条件')}</dt><dd>{message.plan.acceptance}</dd></dl>
          <ol>{message.plan.steps.map((step, i) => <li key={i}><strong>{step.role}</strong><p>{step.output}</p>
            {step.agentId ? <a href={eveCandidateHref(step.agentId)}>{message.candidates?.find(item => item.id === step.agentId)?.name ?? t('候補のAgentを確認')}</a> : <span>{t('新しく開発する部分')}</span>}
          </li>)}</ol>
          <p className={styles.note}>{t('設計案です。Agent同士の接続や動作は、まだ確認していません。')}</p>
          <EveParticipantRun key={message.participantRequestId ?? message.id} plan={message.plan} candidates={message.candidates ?? []} owner={chat.owner} requestId={message.participantRequestId ?? message.id}
            onNewRun={() => {
              const active = current.current;
              if (!active || active.id !== chat.id || active.owner !== chat.owner || storageError) return;
              const participantRequestId = crypto.randomUUID();
              void persist({ ...active, messages: active.messages.map(item => item.id === message.id ? { ...item, participantRequestId } : item) });
            }} />
          <button className={styles.primary} type="button" disabled={busy} onClick={() => void savePlan(message.plan!, message.candidates ?? [])}>{t('設計案をNoahの下書きに保存')}</button>
          <p className={styles.note}>{t('この設計案だけをクラウドに保存し、コード・接続先の設定へ進みます。会話履歴は送りません。')}</p>
        </div>}
      </article>)}
    </div>
    {busy && <output className={styles.note}>{t('Eveが考えています…')}</output>}
    {storageError && <p role="alert" className={styles.error}>{t(storageError)}</p>}
    {error && <p role="alert" className={styles.error}>{t(error)}</p>}
    {confirmation ? <div className={styles.confirm}><p>{t('この相談をクラウドへ送信してよいですか？')}</p><button type="button" disabled={busy} onClick={() => void send(true)}>{t('確認して送信')}</button><button type="button" disabled={busy} onClick={() => { setDraft(pending.current?.messages.at(-1)?.content ?? ''); pending.current = null; setConfirmation(false); }}>{t('編集に戻る')}</button></div> :
    <form className={styles.composer} onSubmit={event => { event.preventDefault(); void send(); }}>
      <label htmlFor="eve-question">{t('Eveに相談する')}</label>
      <textarea id="eve-question" rows={3} maxLength={3000} value={draft} disabled={busy} placeholder={t('やりたいこと、変えたいところを書いてください')} onChange={event => setDraft(event.target.value)} onBlur={() => { if (current.current && !busy && !storageError) void persist({ ...current.current, draft }); }} />
      <button className={styles.primary} type="submit" disabled={!ready || !draft.trim() || busy || !!storageError || (chat?.messages.length ?? 0) >= 100}><ArrowUp size={18} />{t('送信')}</button>
    </form>}
    {!chat?.messages.length && <div className={styles.examples}>{examples.map(example => <button key={example} type="button" disabled={busy} onClick={() => setDraft(t(example))}>{t(example)}</button>)}</div>}
    {(chat?.messages.length ?? 0) >= 100 && <output>{t('この会話は長くなりました。書き出して、新しい相談を始めてください。')}</output>}
    <details className={styles.privacy}><summary>{t('履歴はこの端末に保存・返答はクラウドで生成')}</summary>
      <p>{t('直近の会話を必要な範囲で送信します（最大10発言）。古い条件を引き継ぎたいときは、もう一度伝えてください。')}</p>
      <p>{t('会話履歴はこのブラウザーのIndexedDBに保存します。ブラウザーのデータを消すと失われるため、書き出して保管できます。別の端末には同期しません。')}</p>
      <p>{t('送信内容は返答生成のためCloudflareへ渡します。Noahには新しい相談の本文・返答を保存しません。利用量と受付記録は上限管理のため保存します。以前の相談履歴は変更しません。')}</p>
      <a href="https://developers.cloudflare.com/workers-ai/platform/data-usage/">{t('計算を行う提供元のデータの扱い')}</a>
    </details>
  </section>;
}
