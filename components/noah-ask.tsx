'use client';
import { useNoahLocale } from './noah-locale';
/**
 * つないだ相手の道具を選び、入力欄を埋めて、頼む。
 * - 道具の定義は保存していないので、開くたびに、相手から読む（GET /api/noah/connect/[id]/tools）。同じ接続については、5 分間、この画面が読んだ値を使う。
 * - 入力欄は、道具の定義から作った物（lib/noah-form.ts の noahToolForm）。値の検査は、API と同じ関数（noahFormArgs）で、送る前にも行う。
 * - 読み取りだけと宣言されていない道具は、最初の「頼む」では送らない。入力の一覧を見せて、「確かめて頼む」で送る。
 * - 「頼む」の上に、必ず、送り先（入力が送られる host）を出す。送った後も、欄の値は残す（少し変えて、もう一度頼める）。
 * 名前と説明は、提供者が書いた文のまま、文字として出す。頼めるかどうかを決めるのは、いつも API の側。
 * 仕様: docs/noah/spec-87-tool-agent.md の 11.3・11.5。
 */
import { NoahDelegationPicker } from './noah-profile';
import type { DelegationMode } from '@/lib/noah-profile-contract';
import {noahOperationLabel,noahInputLabel,noahChoiceLabel} from '@/lib/noah-operation-labels';
import NoahLoading from './noah-loading';
import { useEffect, useId, useRef, useState } from 'react';
import {
  NOAH_ASK_TEXT, noahAskOmittedText, noahConfirmRows, noahFieldInitial, noahFilterTools, noahFormInput, noahScreenKind, noahToolMarks,
  type NoahAskTool, type NoahFieldValue,
} from '@/lib/noah-ask-view';
import { noahFormArgs, type NoahFormField, type NoahToolForm } from '@/lib/noah-form';
import { NOAH_READY_TEXT } from '@/lib/noah-ready-view';
import type { NoahDetailStarter } from '@/lib/noah-detail-starter';
import { OWNER_SCOPE_HEADER } from '@/lib/owner-intent';
import base from './noah-service.module.css';
import styles from './noah-ready.module.css';

type ToolsReply = { host?: string; toolsSha256?: string; tools?: NoahAskTool[]; error?: string };
type Loaded = { state: 'loading' } | { state: 'ready'; host: string; tools: NoahAskTool[] } | { state: 'error'; message: string; retry: boolean };
type UsableForm = Extract<NoahToolForm, { usable: true }>;
const CACHE_MS = 300_000;
const cacheKey = (connectionId: string) => `noah-tools:${connectionId}`;
/** この画面が 5 分以内に読んだ一覧（この tab の中だけ）。無い・古い・読めない時は null。 */
function readKept(connectionId: string): { host: string; tools: NoahAskTool[] } | null {
  try {
    const kept = JSON.parse(window.sessionStorage.getItem(cacheKey(connectionId)) ?? 'null') as { at?: number; host?: string; tools?: NoahAskTool[] } | null;
    return kept && typeof kept.at === 'number' && Date.now() - kept.at < CACHE_MS && typeof kept.host === 'string' && Array.isArray(kept.tools) ? { host: kept.host, tools: kept.tools } : null;
  } catch {
    return null;
  }
}

export default function NoahAsk({ agentId, agentName, connectionId, initialTool = null, starter = null, ownerScope, onUnusable, onAsked }: {
  agentId?: string; agentName?:string;
  connectionId: string;
  /** 最初に選んでおく道具の名前（棚のカードから来た時）。使えない道具なら、一覧を出す。 */
  initialTool?: string | null;
  starter?: NoahDetailStarter | null;
  ownerScope: string | null;
  /** 道具の一覧を開いた時に、その接続が使えなくなっていた（取り下げ・接続先の変更）。詳細の画面が、接続を読み直す。 */
  onUnusable: () => void;
  /** 依頼を受け付けた（下の「仕事」を読み直す）。 */
  onAsked: (askId: string) => void;
}) {
  const {t}=useNoahLocale();

  // 読んだ一覧は、何回目の読み取りの物かと一緒に持つ（「読み直す」を押したら、届くまでは「読み込み中」）。最初は、控えがあれば、それを使う。
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ attempt: number; loaded: Loaded } | null>(() => {
    const kept = readKept(connectionId);
    return kept ? { attempt: 0, loaded: { state: 'ready', host: kept.host, tools: kept.tools } } : null;
  });
  const [picked, setPicked] = useState<{ name: string | null; example: boolean } | null>(null), [word, setWord] = useState('');
  // この画面で、本人が確かめた道具（名前と、その時の定義の hash）。同じ道具を続けて頼む時に、確かめ直さない。
  const [confirmedHere] = useState(() => new Set<string>());
  const loaded: Loaded = result?.attempt === attempt ? result.loaded : { state: 'loading' };
  const waiting = loaded.state === 'loading';
  useEffect(() => {
    if (!waiting) return;
    let stopped = false;
    const done = (next: Loaded) => { if (!stopped) setResult({ attempt, loaded: next }); };
    void fetch(`/api/noah/connect/${connectionId}/tools`, { cache: 'no-store' }).then(async (response) => {
      const body = await response.json() as ToolsReply;
      if (stopped) return;
      if (response.status === 200 && typeof body.host === 'string' && Array.isArray(body.tools)) {
        done({ state: 'ready', host: body.host, tools: body.tools });
        try { window.sessionStorage.setItem(cacheKey(connectionId), JSON.stringify({ at: Date.now(), host: body.host, tools: body.tools })); } catch { /* 控えられなくても、出せる。 */ }
        return;
      }
      // 409: その接続は、今は使えない（取り下げ・相手の許可・接続先の変更）。やり直しても同じなので、接続を読み直してもらう。
      if (response.status === 409 || response.status === 404) onUnusable();
      done({ state: 'error', message: body.error ?? NOAH_READY_TEXT.offline, retry: response.status !== 409 && response.status !== 404 });
    }).catch(() => done({ state: 'error', message: NOAH_READY_TEXT.offline, retry: true }));
    return () => { stopped = true; };
    // 読むのは、まだ読んでいない時だけ（接続が変わった時は、部品ごと作り直す）。
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId, attempt, waiting]);

  /** 道具の定義が変わっていた時: 控えを捨てて、読み直す。 */
  const reload = () => {
    try { window.sessionStorage.removeItem(cacheKey(connectionId)); } catch { /* 控えが残っても、5 分で使わなくなる。 */ }
    setAttempt((n) => n + 1);
  };

  const tools = loaded.state === 'ready' ? loaded.tools : [], usable = tools.filter((tool) => tool.usable);
  // 使える道具が 1 つだけなら、一覧を出さずに、入力欄を出す。
  const only = usable.length === 1 ? usable[0] : null;
  const selection = picked?.example === Boolean(starter) ? picked.name : starter?.tool ?? initialTool;
  const current = only ?? usable.find((tool) => tool.name === selection) ?? null;
  const preset = starter && current?.name === starter.tool && loaded.state === 'ready' && loaded.host === starter.host ? starter : null;
  const shown = noahFilterTools(tools, word, (tool) => t(noahOperationLabel(tool.name)));

  return <section className={styles.section} aria-labelledby="noah-ask-tools">
    <h2 id="noah-ask-tools">{only ? t(noahOperationLabel(only.name)) : t(NOAH_ASK_TEXT.pick)}{loaded.state === 'ready' && !only ? <small>{tools.length} {t("個")}</small> : null}</h2>
    {loaded.state === 'loading' && <p className={styles.quiet}><NoahLoading label={t("相手のサーバーから、道具の一覧を読んでいます…")} /></p>}
    {loaded.state === 'error' && <div className={styles.quiet} role="alert"><p>{loaded.message}</p>{loaded.retry && <button type="button" className={styles.secondary} onClick={() => setAttempt((n) => n + 1)}>{t("読み直す")}</button>}</div>}
    {loaded.state === 'ready' && usable.length === 0 && <p className={styles.quiet}>{t(NOAH_ASK_TEXT.none)}</p>}
    {loaded.state === 'ready' && !only && <>
      {tools.length >= 13 && <label className={base.search}><span className={base.srOnly}>{t(NOAH_ASK_TEXT.filter)}</span><input type="search" value={word} maxLength={80} placeholder={t(NOAH_ASK_TEXT.filter)} onChange={(event) => setWord(event.target.value)} /></label>}
      {shown.length === 0 ? <p className={styles.quiet}>{t(NOAH_ASK_TEXT.noMatch)}</p> : <ul className={styles.tools}>{shown.map((tool) => <li key={tool.name} data-usable={tool.usable || undefined}>
        {tool.usable
          ? <button type="button" className={styles.toolButton} data-tool-name={tool.name} aria-pressed={current?.name === tool.name} onClick={() => setPicked({ name: current?.name === tool.name ? null : tool.name, example: Boolean(starter) })}><ToolRow tool={tool} /></button>
          : <div className={styles.toolRow}><ToolRow tool={tool} /></div>}
        {loaded.state === 'ready' && current?.name === tool.name && <NoahAskForm key={`${current.name}:${current.sha256}:${Boolean(preset)}`} connectionId={connectionId} agentId={agentId} agentName={agentName} ownerScope={ownerScope} host={loaded.host} tool={current}
      titled={false} starter={preset} confirmedHere={confirmedHere} onAsked={onAsked} onChanged={reload} />}
        {current?.name !== tool.name && <details className={styles.toolExplanation}><summary>{t('提供者の説明')}</summary><code>{tool.name}</code><p>{tool.summary}</p></details>}
      </li>)}</ul>}
    </>}
    {loaded.state === 'ready' && only && current && <NoahAskForm key={`${current.name}:${current.sha256}:${Boolean(preset)}`} connectionId={connectionId} agentId={agentId} agentName={agentName} ownerScope={ownerScope} host={loaded.host} tool={current}
      titled={false} starter={preset} confirmedHere={confirmedHere} onAsked={onAsked} onChanged={reload} />}
  </section>;
}

function ToolRow({ tool }: { tool: NoahAskTool }) {
  const {t}=useNoahLocale();

  return <>
    <strong>{t(noahOperationLabel(tool.name))}</strong>

    <span className={styles.marks}>{noahToolMarks(tool).map((mark) => <span key={mark}>{t(mark)}</span>)}</span>

  </>;
}

/** 道具 1 つの入力欄と「頼む」。 */
function NoahAskForm({ agentId, agentName, connectionId, ownerScope, host, tool, titled, starter, confirmedHere, onAsked, onChanged }: {
  agentId?:string; agentName?:string; connectionId: string; ownerScope: string | null; host: string; tool: NoahAskTool; titled: boolean; confirmedHere: Set<string>;
  starter: NoahDetailStarter | null; onAsked: (askId: string) => void; onChanged: () => void;
}) {
  const {t}=useNoahLocale();

  const id = useId();
  const [policy,setPolicy]=useState<DelegationMode|'loading'|'paused'>(agentId?'loading':'allow');
  const blocked=policy==='loading'||policy==='paused'||policy==='deny';
  // 入力欄の定義は、一覧の先頭 100 個にだけ付いている。それより後ろの道具は、選んだ時に、その 1 つを読む。
  const [fetched, setFetched] = useState<{ attempt: number; form: UsableForm | null; error: string } | null>(null), [attempt, setAttempt] = useState(0);
  const given = tool.form?.usable ? tool.form : null;
  const form = given ?? (fetched?.attempt === attempt ? fetched.form : null);
  const missing = !given && fetched?.attempt !== attempt;
  useEffect(() => {
    if (!missing) return;
    let stopped = false;
    const done = (next: UsableForm | null, error: string) => { if (!stopped) setFetched({ attempt, form: next, error }); };
    void fetch(`/api/noah/connect/${connectionId}/tools?${new URLSearchParams({ tool: tool.name }).toString()}`, { cache: 'no-store' }).then(async (response) => {
      const body = await response.json() as { tools?: NoahAskTool[]; error?: string };
      const found = body.tools?.[0]?.form;
      done(response.status === 200 && found?.usable ? found : null, response.status === 200 ? NOAH_ASK_TEXT.none : body.error ?? NOAH_ASK_TEXT.offline);
    }).catch(() => done(null, NOAH_ASK_TEXT.offline));
    return () => { stopped = true; };
  }, [connectionId, tool.name, attempt, missing]);

  const [values, setValues] = useState<Record<string, NoahFieldValue> | null>(null);
  const [problem, setProblem] = useState<{ field: string; message: string } | null>(null), [confirming, setConfirming] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  // 応答が届かなかった「頼む」は、押し直した時に、同じ操作 ID で送る（同じ依頼が 2 つにならない）。応答が届いたら、次は新しい ID。
  const operation = useRef<{ id: string; body: string } | null>(null);
  const fields = form?.fields ?? [];
  const current = values ?? Object.fromEntries(fields.map((field) => [
    field.name, field.name === starter?.field && field.kind === 'text' ? starter.input : noahFieldInitial(field),
  ]));
  const set = (name: string, value: NoahFieldValue) => { setValues({ ...current, [name]: value }); setProblem(null); setConfirming(null); setNotice(''); };
  const confirmKey = `${tool.name}:${tool.sha256}`;

  async function send(input: Record<string, NoahFieldValue>, confirmed: boolean) {
    if (busy || blocked) return;
    setBusy(true); setError(''); setNotice('');
    const request = { connectionId, form: { tool: tool.name, toolSha256: tool.sha256, input, ...(confirmed ? { confirm: true } : {}) } };
    const content = JSON.stringify(request);
    const askId = operation.current?.body === content ? operation.current.id : crypto.randomUUID();
    operation.current = { id: askId, body: content };
    try {
      const response = await fetch('/api/noah/ask', {
        method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json', ...(ownerScope ? { [OWNER_SCOPE_HEADER]: ownerScope } : {}) },
        body: JSON.stringify({ id: askId, ...request, screen: noahScreenKind(window.innerWidth) }),
      });
      const body = await response.json() as { error?: string };
      operation.current = null;
      if (response.status === 202 || response.status === 200) { setConfirming(null); setNotice('受け付けました。'); onAsked(askId); } else setError(body.error ?? NOAH_ASK_TEXT.offline);
    } catch { setError(NOAH_ASK_TEXT.offline); } finally { setBusy(false); }
  }
  function submit() {
    if (!form || busy || blocked) return;
    const input = noahFormInput(fields, current), checked = noahFormArgs(form, input);
    if (!checked.ok) { setProblem({ field: checked.field, message: checked.message }); setConfirming(null); return; }
    setProblem(null);
    // 読み取りだけと宣言されていない道具は、最初の 1 回、送らずに、入力の一覧を見せる。
    if (policy==='confirm' || (tool.needsConfirm && !confirmedHere.has(confirmKey))) { setConfirming(checked.args); return; }
    void send(input, tool.needsConfirm);
  }
  function confirm() {
    confirmedHere.add(confirmKey);
    void send(noahFormInput(fields, current), true);
  }

  if (!form) return <div className={styles.form}>
    {titled && <h3>{t(noahOperationLabel(tool.name))}</h3>}
    {missing ? <p className={styles.quiet}><NoahLoading/></p> : <div className={styles.quiet} role="alert"><p>{fetched?.error}</p><button type="button" className={styles.secondary} onClick={() => setAttempt((n) => n + 1)}>{t("読み直す")}</button></div>}
  </div>;

  const required = fields.filter((field) => field.required), optional = fields.filter((field) => !field.required);
  const field = (item: NoahFormField) => <Field key={item.name} id={`${id}-${item.name}`} field={item} value={current[item.name] ?? ''} error={problem?.field === item.name ? problem.message : ''} onChange={(value) => set(item.name, value)} />;
  // 細かい設定の中に誤りがある時は、開いて見せる。
  const optionalProblem = optional.some((item) => item.name === problem?.field);
  return <form className={styles.form} noValidate onSubmit={(event) => { event.preventDefault(); submit(); }}>
    {titled && <h3>{t(noahOperationLabel(tool.name))}</h3>}
    {required.map(field)}
    {(optional.length > 0 || form.omitted > 0) && <details className={styles.more} open={optionalProblem || optional.some((item) => item.name === starter?.field) || undefined}>
      <summary>{t(NOAH_ASK_TEXT.more)}（{optional.length}）</summary>
      {optional.map(field)}
      {form.omitted > 0 && <p className={styles.quiet}>{noahAskOmittedText(form.omitted)}</p>}
    </details>}
    {problem && !fields.some((item) => item.name === problem.field) && <p className={styles.fieldError} role="alert">{problem.message}</p>}
    {agentId && <details className={styles.permissionOptions} open={policy==='deny'||policy==='paused'||undefined}><summary>{t('任せる範囲')} · {t(policy==='loading'?'確認中':policy==='confirm'?'確認して実行':policy==='deny'?'任せない':policy==='paused'?'停止中':'任せる')}</summary><NoahDelegationPicker target={agentId} name={agentName??host} action={tool.name} digest={tool.sha256} ownerScope={ownerScope} onMode={setPolicy}/></details>}
    <p className={styles.quiet}>{t('入力の一部と成果は、Noahの仕事履歴に保存されます。')}</p>
    <p className={styles.quiet}>{t('Noahの中継料は0円。提供元の料金は未確認です。提供元で料金・契約を確認してから実行してください。')}</p>
    {confirming ? <fieldset className={styles.confirmBox}>
      <legend>{t("頼む前の確かめ")}</legend>
      <p>{tool.readOnly?t('入力内容を送り、この操作を実行します。'):t('この操作は、送信先のデータを変更・送信する可能性があります。')}</p>
      <dl>{noahConfirmRows(fields.map(field=>({...field,label:t(noahInputLabel(field.name))})), confirming).map((row) => <div key={row.label}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}</dl>
      <p className={styles.sendsTo}>{t('送信先: {host}',{host})}</p>
      <div className={styles.actions}>
        <button type="button" className={styles.secondary} disabled={busy} onClick={() => setConfirming(null)}>{t(NOAH_ASK_TEXT.cancel)}</button>
        <button type="button" className={styles.primary} disabled={busy||blocked} aria-busy={busy || undefined} onClick={confirm}>{busy ? <NoahLoading compact label={t(NOAH_ASK_TEXT.sending)} /> : t(NOAH_ASK_TEXT.confirm)}</button>
      </div>
    </fieldset> : <>
      <p className={styles.sendsTo}>{t('送信先: {host}',{host})}</p>
      <div className={styles.actions}><button type="submit" className={styles.primary} disabled={busy||blocked} aria-busy={busy || undefined}>{busy ? <NoahLoading compact label={t(NOAH_ASK_TEXT.sending)} /> : t(NOAH_ASK_TEXT.submit)}</button></div>
    </>}
    {notice && <div className={styles.actions}><output className={styles.notice}>{t(notice)}</output><a className={styles.secondary} href="#noah-agent-work">{t("進捗と成果を見る")}</a></div>}
    <details className={styles.toolExplanation}><summary>{t('提供者の説明')}</summary><code>{tool.name}</code><p>{tool.description||tool.summary}</p></details>
    {error && <div className={styles.reason} role="alert"><p>{t(error)}</p>{error.includes('変わりました') && <button type="button" className={styles.secondary} onClick={onChanged}>{t("道具の一覧を読み直す")}</button>}</div>}
  </form>;
}

/** 入力欄 1 つ。欄の下に、提供者の説明（文字として）と、誤りの文。 */
function Field({ id, field, value, error, onChange }: { id: string; field: NoahFormField; value: NoahFieldValue; error: string; onChange: (value: NoahFieldValue) => void }) {
  const {t}=useNoahLocale();

  const text = typeof value === 'string' ? value : '', picked = Array.isArray(value) ? value : [];
  const describedBy = [field.help ? `${id}-help` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined;
  const common = { id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined, 'aria-required': field.required || undefined };
  const choices = field.choices ?? [];
  const toggle = (label: string, selected: boolean, onPress: () => void) => <button key={label} type="button" aria-pressed={selected} onClick={onPress}>{t(noahChoiceLabel(label))}</button>;
  // 選んで答える欄（はい・いいえ、選択肢）は、ボタンの組。それ以外は、打つ欄。
  const group = field.kind === 'boolean' || (field.kind === 'choice' && choices.length <= 7) || (field.kind === 'list' && choices.length > 0);
  let control;
  if (field.kind === 'boolean') control = <>
    {toggle('はい', text === 'true', () => onChange('true'))}{toggle('いいえ', text === 'false', () => onChange('false'))}{!field.required && toggle('指定しない', text === '', () => onChange(''))}
  </>;
  else if (field.kind === 'choice' && choices.length <= 7) control = choices.map((choice) => toggle(String(choice), text === String(choice), () => onChange(text === String(choice) && !field.required ? '' : String(choice))));
  else if (field.kind === 'choice') control = <select {...common} className={styles.control} value={text} onChange={(event) => onChange(event.target.value)}>
    <option value="">{field.required ? t("選んでください") : t("指定しない")}</option>
    {choices.map((choice) => <option key={String(choice)} value={String(choice)}>{t(noahChoiceLabel(String(choice)))}</option>)}
  </select>;
  else if (field.kind === 'list' && choices.length > 0) control = choices.map((choice) => { const label = String(choice), on = picked.includes(label); return toggle(label, on, () => onChange(on ? picked.filter((item) => item !== label) : [...picked, label])); });
  else if (field.kind === 'list') control = <textarea {...common} className={styles.control} rows={Math.min(8, Math.max(2, text.split('\n').length))} value={text} placeholder={t("1 行に 1 つ")} onChange={(event) => onChange(event.target.value)} />;
  else if (field.kind === 'number') control = <input {...common} className={styles.control} type="text" inputMode={field.integer ? 'numeric' : 'decimal'} value={text} onChange={(event) => onChange(event.target.value)} />;
  else if (field.format === 'date' || field.format === 'email' || field.format === 'uri') control = <input {...common} className={styles.control} type={field.format === 'uri' ? 'url' : field.format} value={text} onChange={(event) => onChange(event.target.value)} />;
  else control = <textarea {...common} className={styles.control} rows={Math.min(8, Math.max(1, text.split('\n').length))} value={text} maxLength={field.maxLength} onChange={(event) => onChange(event.target.value)} />;
  const mark = field.required ? <span aria-hidden="true"> *</span> : null;
  const notes = <>
    {field.help && <details id={`${id}-help`} className={styles.help}><summary>{t('提供者の説明')}</summary><p>{field.label} · {field.help}</p></details>}
    {error && <p id={`${id}-error`} className={styles.fieldError} role="alert">{t(error)}</p>}
  </>;
  if (group) return <fieldset className={styles.field} data-field-name={field.name} aria-describedby={describedBy}>
    <legend className={styles.fieldLabel}>{t(noahInputLabel(field.name))}{noahInputLabel(field.name)==='入力内容'?` (${field.name})`:''}{mark}</legend>
    <div className={styles.choices}>{control}</div>
    {notes}
  </fieldset>;
  return <div className={styles.field} data-field-name={field.name}>
    <label htmlFor={id} className={styles.fieldLabel}>{t(noahInputLabel(field.name))}{noahInputLabel(field.name)==='入力内容'?` (${field.name})`:''}{mark}</label>
    {control}
    {notes}
  </div>;
}
