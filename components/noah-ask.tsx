'use client';
/**
 * つないだ相手の、道具の一覧（選ぶ画面）。道具の定義は保存していないので、開くたびに、相手から読む（GET /api/noah/connect/[id]/tools）。
 * 同じ接続については、5 分間、この画面が読んだ値を使う（続けて握手しない）。名前と説明は、提供者が書いた文のまま、文字として出す。
 * L5 では一覧まで。道具を選んで、入力欄から頼む所は、L6 で、この部品に足す。
 * 仕様: docs/noah/spec-87-tool-agent.md の 11.3・11.5。
 */
import { useEffect, useState } from 'react';
import { NOAH_READY_TEXT } from '@/lib/noah-ready-view';
import styles from './noah-ready.module.css';

export type NoahToolItem = { name: string; summary: string; readOnly: boolean; sha256: string; usable: boolean; reason?: string; required: number; needsConfirm: boolean; form: unknown };
type ToolsReply = { host?: string; toolsSha256?: string; tools?: NoahToolItem[]; error?: string };
type Loaded = { state: 'loading' } | { state: 'ready'; host: string; tools: NoahToolItem[] } | { state: 'error'; message: string; retry: boolean };
const CACHE_MS = 300_000;
const cacheKey = (connectionId: string) => `noah-tools:${connectionId}`;
/** この画面が 5 分以内に読んだ一覧（この tab の中だけ）。無い・古い・読めない時は null。 */
function readKept(connectionId: string): { host: string; tools: NoahToolItem[] } | null {
  try {
    const kept = JSON.parse(window.sessionStorage.getItem(cacheKey(connectionId)) ?? 'null') as { at?: number; host?: string; tools?: NoahToolItem[] } | null;
    return kept && typeof kept.at === 'number' && Date.now() - kept.at < CACHE_MS && typeof kept.host === 'string' && Array.isArray(kept.tools) ? { host: kept.host, tools: kept.tools } : null;
  } catch {
    return null;
  }
}
/** 道具の印（色だけで分けない。必ず文字で出す）。 */
export function noahToolMarks(tool: Pick<NoahToolItem, 'usable' | 'readOnly' | 'required'>): string[] {
  if (!tool.usable) return ['入力欄ではまだ使えません'];
  return [tool.readOnly ? '読み取りだけ' : null, tool.readOnly && tool.required === 0 ? '押すだけ' : null].filter((mark): mark is string => mark !== null);
}

export default function NoahAsk({ connectionId, onUnusable }: {
  connectionId: string;
  /** 道具の一覧を開いた時に、その接続が使えなくなっていた（取り下げ・接続先の変更）。詳細の画面が、接続を読み直す。 */
  onUnusable: () => void;
}) {
  // 読んだ一覧は、何回目の読み取りの物かと一緒に持つ（「読み直す」を押したら、届くまでは「読み込み中」）。最初は、控えがあれば、それを使う。
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ attempt: number; loaded: Loaded } | null>(() => {
    const kept = readKept(connectionId);
    return kept ? { attempt: 0, loaded: { state: 'ready', host: kept.host, tools: kept.tools } } : null;
  });
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

  return <section className={styles.section} aria-labelledby="noah-ask-tools">
    <h2 id="noah-ask-tools">{NOAH_READY_TEXT.tools}{loaded.state === 'ready' ? <small>{loaded.tools.length} 個</small> : null}</h2>
    {loaded.state === 'loading' && <p className={styles.quiet}><output>相手のサーバーから、道具の一覧を読んでいます…</output></p>}
    {loaded.state === 'error' && <div className={styles.quiet} role="alert"><p>{loaded.message}</p>{loaded.retry && <button type="button" className={styles.secondary} onClick={() => setAttempt((n) => n + 1)}>読み直す</button>}</div>}
    {loaded.state === 'ready' && (loaded.tools.some((tool) => tool.usable) ? null : <p className={styles.quiet}>{NOAH_READY_TEXT.toolsEmpty}</p>)}
    {loaded.state === 'ready' && <ul className={styles.tools}>{loaded.tools.map((tool) => <li key={tool.name} data-usable={tool.usable || undefined}>
      <strong>{tool.name}</strong>
      <span className={styles.marks}>{noahToolMarks(tool).map((mark) => <span key={mark}>{mark}</span>)}</span>
      {tool.summary && <p>{tool.summary}</p>}
    </li>)}</ul>}
  </section>;
}
