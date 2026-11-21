'use client';
/**
 * 頼んだ仕事の一覧（新しい順）と、成果。
 * - Agent の詳細の画面では、その Agent への依頼（GET /api/noah/ask?agent=。切った接続の分も含む）。
 *   「実行中」「成果データ」の画面では、本人の依頼を Agent をまたいで（GET /api/noah/ask）。行から、その Agent の詳細へ戻れる。
 * - 終わっていない依頼がある間だけ、読み直す（1 秒ごと。30 秒を越えたら 3 秒ごと。画面が裏の間は読まない）。
 * - 成果の文は、終わった依頼ごとに 1 回だけ、GET /api/noah/ask/[id] で読む（一覧の読み直しで、本文を毎回読まない）。
 * - 「止める」は、止める事を頼むだけ。止まった確認（状態が変わる）が返るまで、「止めました」とは出さない。
 * - 成果は、文字として出す（HTML として解釈しない。改行は保つ）。全体が JSON なら、項目ごとの行にして出し、元の形でも見られる。
 *   `https://` で始まる所だけを、行き先の host を横に書いたリンクにする（新しい tab）。
 * 全画面を覆う進行表示と、閉じるまで操作できない dialog は、使わない。
 * 仕様: docs/noah/spec-87-tool-agent.md の 11.5。
 */
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { NOAH_ASK_TEXT, noahAskRowView, noahLinkParts, noahResultPreview, type NoahAskItem } from '@/lib/noah-ask-view';
import { noahResultOutline } from '@/lib/noah-form';
import { OWNER_SCOPE_HEADER } from '@/lib/owner-intent';
import styles from './noah-ready.module.css';

type Result = NonNullable<NoahAskItem['result']> & { note?: string };
const FAST_MS = 1000, SLOW_MS = 3000, SLOW_AFTER_MS = 30_000;

export default function NoahWorkList({ agentId, ownerScope, refresh, only, heading }: {
  /**
   * 系列の ID。その Agent への依頼を、切った接続の分も含めて出す（切っても、受け取った成果は、ここに残る）。
   * 無い時は、本人の依頼を、Agent をまたいで出す（「実行中」「成果データ」の画面）。
   */
  agentId?: string;
  /** 「止める」に添える本人の印。null の時は、一覧の応答が返した印を使う（Agent をまたぐ一覧。並んだ行と同じ本人の印）。 */
  ownerScope: string | null;
  /** 新しく頼むたびに変わる値（すぐ読み直す）。 */
  refresh: number;
  /** 'succeeded' の時は、成果が出た依頼だけを出す（「成果データ」の画面）。 */
  only?: 'succeeded';
  /** 見出し。既定は「仕事」。 */
  heading?: string;
}) {
  const [asks, setAsks] = useState<NoahAskItem[]>([]), [results, setResults] = useState<Record<string, Result>>({}), [open, setOpen] = useState<Record<string, boolean>>({});
  const [raw, setRaw] = useState<Record<string, boolean>>({}), [now, setNow] = useState(() => Date.now()), [error, setError] = useState('');
  const [listScope, setListScope] = useState<string | null>(null);
  const wanted = useRef(new Set<string>()), since = useRef<number | null>(null);
  const listUrl = agentId ? `/api/noah/ask?${new URLSearchParams({ agent: agentId }).toString()}` : '/api/noah/ask';

  // 一覧を読む。終わっていない依頼がある間だけ、続けて読む。
  const pending = asks.some((ask) => ask.finishedAt === undefined);
  useEffect(() => {
    let stopped = false, timer: ReturnType<typeof setTimeout> | null = null;
    const read = async () => {
      // 画面が裏の間は、読まない（戻った時に、次の回で読む）。
      if (typeof document !== 'undefined' && document.hidden) return true;
      try {
        const response = await fetch(listUrl, { cache: 'no-store' });
        const body = await response.json() as { asks?: NoahAskItem[]; ownerScope?: string | null };
        if (stopped || response.status !== 200 || !Array.isArray(body.asks)) return false;
        setAsks(body.asks); setListScope(typeof body.ownerScope === 'string' ? body.ownerScope : null); setNow(Date.now());
        return body.asks.some((ask) => ask.finishedAt === undefined);
      } catch { return true; }
    };
    const loop = async () => {
      const more = await read();
      if (stopped || !more) { since.current = null; return; }
      since.current ??= Date.now();
      timer = setTimeout(() => { void loop(); }, Date.now() - since.current > SLOW_AFTER_MS ? SLOW_MS : FAST_MS);
    };
    void loop();
    return () => { stopped = true; if (timer) clearTimeout(timer); };
    // 読み直すのは、頼んだ時・つないだ時・切った時（refresh が変わる）。
  }, [listUrl, refresh]);

  // 成果が出た依頼は、その文を 1 回だけ読む。
  useEffect(() => {
    for (const ask of asks) {
      if (ask.state !== 'succeeded' || wanted.current.has(ask.id)) continue;
      wanted.current.add(ask.id);
      void fetch(`/api/noah/ask/${ask.id}`, { cache: 'no-store' }).then(async (response) => {
        const body = await response.json() as NoahAskItem;
        if (response.status === 200 && body.result) setResults((old) => ({ ...old, [ask.id]: { ...body.result!, ...(body.note ? { note: body.note } : {}) } }));
        else wanted.current.delete(ask.id);
      }).catch(() => { wanted.current.delete(ask.id); });
    }
  }, [asks]);

  const [bump, setBump] = useState(0);
  // 「止める」を押した後は、状態が変わるまで読み続ける（上の読み直しを、もう一度始める）。
  useEffect(() => {
    if (bump === 0) return;
    let stopped = false;
    void fetch(listUrl, { cache: 'no-store' }).then(async (response) => {
      const body = await response.json() as { asks?: NoahAskItem[] };
      if (!stopped && response.status === 200 && Array.isArray(body.asks)) { setAsks(body.asks); setNow(Date.now()); }
    }).catch(() => undefined);
    return () => { stopped = true; };
  }, [listUrl, bump]);

  async function stop(ask: NoahAskItem) {
    setError('');
    const scope = ownerScope ?? listScope;
    try {
      const response = await fetch(`/api/noah/ask/${ask.id}`, {
        method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json', ...(scope ? { [OWNER_SCOPE_HEADER]: scope } : {}) },
        body: JSON.stringify({ action: 'stop', revision: ask.revision }),
      });
      const body = await response.json() as NoahAskItem & { ask?: NoahAskItem; error?: string };
      // 応答の今の状態を、その行へ映す（版が古かった時・もう終わっていた時は、添えられた今の行）。
      const next = response.status === 200 ? body : body.ask;
      if (next?.id) setAsks((old) => old.map((item) => (item.id === next.id ? { ...item, ...next } : item)));
      if (response.status !== 200 && response.status !== 409) setError(body.error ?? NOAH_ASK_TEXT.offline);
    } catch { setError(NOAH_ASK_TEXT.offline); }
    setBump((n) => n + 1);
  }

  const shown = only === 'succeeded' ? asks.filter((ask) => ask.state === 'succeeded') : asks;
  if (shown.length === 0) return null;
  return <section className={styles.section} aria-labelledby="noah-work-list">
    <h2 id="noah-work-list">{heading ?? NOAH_ASK_TEXT.work}{pending ? <small>進んでいます</small> : null}</h2>
    {error && <p className={styles.reason} role="alert">{error}</p>}
    <ul className={styles.work}>{shown.map((ask) => {
      const view = noahAskRowView(ask, now), result = results[ask.id], opened = open[ask.id] === true;
      const preview = result ? noahResultPreview(result.text) : null, outline = result && opened && !raw[ask.id] ? noahResultOutline(result.text) : null;
      return <li key={ask.id}>
        <div className={styles.workHead}>
          <p className={styles.workState}>{ask.finishedAt === undefined ? <output>{view.text}</output> : view.text}</p>
          {view.stoppable && <button type="button" className={styles.secondary} onClick={() => void stop(ask)}>{NOAH_ASK_TEXT.stop}</button>}
        </div>
        <p className={styles.workTool}><strong>{ask.tool ?? ''}</strong>{ask.state === 'succeeded' ? <span> — {result?.note ?? `${ask.host ?? '相手のサーバー'} が返した内容です。`}</span> : null}</p>
        {result && !opened && <pre className={styles.result}><Linked text={preview!.text} /></pre>}
        {result && opened && (outline
          ? <dl className={styles.outline}>{outline.map((row, index) => <div key={`${index}:${row.label}`} data-depth={Math.min(row.depth, 4)}><dt>{row.label}</dt><dd><Linked text={row.text} /></dd></div>)}</dl>
          : <pre className={styles.result}><Linked text={result.text} /></pre>)}
        {result && <div className={styles.workActions}>
          {(preview!.more || opened) && <button type="button" className={styles.secondary} aria-expanded={opened} onClick={() => setOpen((old) => ({ ...old, [ask.id]: !opened }))}>{opened ? NOAH_ASK_TEXT.close : NOAH_ASK_TEXT.open}</button>}
          {opened && noahResultOutline(result.text) && <button type="button" className={styles.secondary} onClick={() => setRaw((old) => ({ ...old, [ask.id]: !old[ask.id] }))}>{raw[ask.id] ? NOAH_ASK_TEXT.outline : NOAH_ASK_TEXT.raw}</button>}
        </div>}
        {!agentId && ask.agentId && <p className={styles.workAgent}><Link href={`/noah/ready/agent?id=${encodeURIComponent(ask.agentId)}`}>{NOAH_ASK_TEXT.agent} →</Link></p>}
      </li>;
    })}</ul>
  </section>;
}

/** 成果の文。`https://` で始まる所だけを、行き先の host を横に書いたリンクにする。 */
function Linked({ text }: { text: string }) {
  return <>{noahLinkParts(text).map((part, index) => ('href' in part
    ? <a key={index} href={part.href} target="_blank" rel="noopener noreferrer nofollow">{part.href}<small>（{part.host}）</small></a>
    : <span key={index}>{part.text}</span>))}</>;
}
