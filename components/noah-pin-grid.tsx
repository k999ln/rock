'use client';
import { noahSignInHref } from '@/lib/noah-navigation';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { MoreHorizontal, Check, Plus, X } from 'lucide-react';
import { NOAH_PIN_TEXT, noahCardOrigin } from '@/lib/noah-pins';
import { noahCardHref, noahProjectHref } from '@/lib/noah-project-view';
import { noahReadyDetailHref } from '@/lib/noah-ready-view';
import styles from './noah-pins.module.css';
import type { NoahFirstJob } from '@/lib/noah-first-jobs';
import { useNoahLocale } from './noah-locale';
import type { NoahAgentCard } from '@/lib/noah-agent-cards';
import NoahAgentSourceRatings from './noah-agent-source-ratings';
import { NoahAgentPin, NoahAgentPinGrid } from './noah-agent-pin';
import { NOAH_COLLECTION_RUN_LABELS } from '@/lib/noah-collection';

/** グリッドの 1 枚（GET /api/noah/pins の items の 1 件）。 */
export type NoahPinView = NoahAgentCard;
type BoardView = { id: string; name: string; visibility: 'private' | 'public'; pins: number; revision: number };

export default function NoahPinGrid({ items, signedIn, ownerScope, onChange, onHide, jobs }: {
  jobs?: (NoahFirstJob & { href: string })[];
  items: NoahPinView[]; signedIn: boolean; ownerScope: string | null;
  onChange?: (id: string, savedIn: string[]) => void; onHide?: (id: string) => void;
}) {
  const { t } = useNoahLocale();
  const params = useSearchParams();
  const [saving, setSaving] = useState<NoahPinView | null>(null);
  return <>
    <NoahAgentPinGrid>{items.map((item, index) => {
      const taskLinks = jobs?.filter(job => new URL(job.href, 'https://avoado.si').searchParams.get('id') === (item.feedbackId ?? item.id));
      const tasks = taskLinks?.map(job => <Link key={job.id} className={styles.taskLink} href={job.href}>{t(job.title)}</Link>);
      const runStatus = item.external ? 'Noahで接続を確認'
        : item.run ? NOAH_COLLECTION_RUN_LABELS[item.run] : item.oneTap ? 'すぐ試せる' : '接続して使う';
      // ピンのカード（spec-115 の 9・10 章）: 題名だけ（本人の指示 2026-11-25「文章いらない、題名だけ」）。太い題に日本語の題。説明・提供元の行・評価は出さない。
      // ただし、Noah の案内（広告を含む）は、その事をカードに必ず書く（noahCardOrigin）。
      // 絵は、作者の表紙 → ピンの動画 → 図解 → 場面の絵の順（NoahPinMotion）。動画と図解は見えている間繰り返す。図解の色は並びの index 枚目で回す。
      const pin = item.pin, plain = Boolean(pin || item.pinVideo), saved = item.savedIn.length > 0;
      return <NoahAgentPin key={item.id} id={item.id} name={pin?.title ?? item.name} topic={item.topic} shape={item.shape}
        summary={item.summary} href={noahCardHref(item, Object.fromEntries(params)) ?? noahReadyDetailHref(item.id)} plain={plain}
        cover={item.marketplace?.cover}
        diagram={pin ? { scene: pin.scene, tone: index } : undefined} video={item.pinVideo}
        meta={item.marketplace ? <>{noahCardOrigin(item)} · {item.marketplace.label}</> : plain ? (item.notice ? <>{noahCardOrigin(item)}</> : undefined) : <>{noahCardOrigin(item)} · {runStatus}</>}
        actions={plain ? <>
          {tasks}
          {/* PC: 保存はマウスを乗せた時だけ絵の上に。スマホ: 題名の右の「…」から保存と「表示しない」（本人の決定 2026-11-25「乗せた時だけ出す」）。 */}
          {!item.external && <button type="button" className={styles.save} data-saved={saved || undefined} onClick={() => setSaving(item)} aria-label={`${item.name}を${saved ? '保存済み' : '保存'}`}>
            {saved ? NOAH_PIN_TEXT.saved : NOAH_PIN_TEXT.save}
          </button>}
          {!item.external && <details className={styles.more}>
            <summary aria-label="その他の操作"><MoreHorizontal size={18} /></summary>
            <div>
              <button type="button" data-touch="" onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); setSaving(item); }}>{saved ? NOAH_PIN_TEXT.saved : NOAH_PIN_TEXT.save}</button>
              {signedIn && onHide && <button type="button" data-hide="" onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); onHide(item.id); }}>{NOAH_PIN_TEXT.hide}</button>}
            </div>
          </details>}
        </> : <>
          {tasks}
          {!item.external && <button type="button" className={styles.save} data-saved={saved || undefined} onClick={() => setSaving(item)} aria-label={`${item.name}を${saved ? '保存済み' : '保存'}`}>
            {saved ? NOAH_PIN_TEXT.saved : NOAH_PIN_TEXT.save}
          </button>}
          <NoahAgentSourceRatings sources={item.sources} detailHref={`${noahProjectHref(item.feedbackId ?? item.id)}#ratings`} />
          {signedIn && !item.external && onHide && <details className={styles.more}>
            <summary aria-label="その他の操作"><MoreHorizontal size={18} /></summary>
            <button type="button" onClick={() => onHide(item.id)}>{NOAH_PIN_TEXT.hide}</button>
          </details>}
        </>} />;
    })}</NoahAgentPinGrid>
    {saving && <NoahSaveSheet pin={saving} signedIn={signedIn} ownerScope={ownerScope} onClose={() => setSaving(null)} onChange={savedIn => { onChange?.(saving.id, savedIn); setSaving(old => old ? { ...old, savedIn } : old); }} />}
  </>;
}

/** 保存先を選ぶ画面。本人のボードの一覧（入っている物に印）と、新しいボードを作って保存。 */
export function NoahSaveSheet({ pin, signedIn, ownerScope, onClose, onChange }: { pin: NoahPinView; signedIn: boolean; ownerScope: string | null; onClose: () => void; onChange: (savedIn: string[]) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [boards, setBoards] = useState<BoardView[] | null>(null), [error, setError] = useState(''), [pending, setPending] = useState(false);
  const [name, setName] = useState(''), [visibility, setVisibility] = useState<'private' | 'public'>('private');
  const [savedIn, setSavedIn] = useState(pin.savedIn);
  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => {
    if (!signedIn) return;
    let stopped = false;
    void fetch('/api/noah/boards', { cache: 'no-store' }).then(async (response) => {
      const body = await response.json() as { mine?: BoardView[]; error?: string };
      if (stopped) return;
      if (!response.ok || !Array.isArray(body.mine)) { setError(body.error ?? 'ボードを読めません。'); return; }
      setBoards(body.mine);
    }).catch(() => { if (!stopped) setError('ボードを読めません。'); });
    return () => { stopped = true; };
  }, [signedIn]);
  async function send(body: Record<string, unknown>) {
    const response = await fetch('/api/noah/boards', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Rock-Owner-Scope': ownerScope ?? '' }, body: JSON.stringify(body) });
    const result = await response.json() as { id?: string; error?: string };
    if (!response.ok) throw Error(result.error ?? '保存できません。');
    return result;
  }
  async function toggle(board: BoardView) {
    if (pending) return;
    setPending(true); setError('');
    const on = !savedIn.includes(board.id);
    try {
      await send({ action: on ? 'save' : 'unsave', boardId: board.id, familyId: pin.id });
      const next = on ? [...savedIn, board.id] : savedIn.filter((id) => id !== board.id);
      setSavedIn(next); onChange(next);
      setBoards((old) => old?.map((row) => (row.id === board.id ? { ...row, pins: row.pins + (on ? 1 : -1) } : row)) ?? old);
    } catch (e) { setError(e instanceof Error ? e.message : '保存できません。'); } finally { setPending(false); }
  }
  async function create(event: { preventDefault: () => void }) {
    event.preventDefault();
    if (pending || !name.trim()) return;
    setPending(true); setError('');
    try {
      const made = await send({ action: 'create', name: name.trim(), visibility });
      await send({ action: 'save', boardId: made.id, familyId: pin.id });
      const board: BoardView = { id: made.id!, name: name.trim(), visibility, pins: 1, revision: 2 };
      const next = [...savedIn, board.id];
      setBoards((old) => [board, ...(old ?? [])]); setSavedIn(next); onChange(next); setName('');
    } catch (e) { setError(e instanceof Error ? e.message : '保存できません。'); } finally { setPending(false); }
  }
  return <dialog ref={dialog} className={styles.sheet} onClose={onClose} aria-labelledby="noah-save-title">
    <header><h2 id="noah-save-title">{NOAH_PIN_TEXT.saveTo}</h2><button type="button" onClick={() => dialog.current?.close()} aria-label="閉じる"><X size={20} /></button></header>
    <p className={styles.sheetPin}>{pin.name}</p>
    {!signedIn ? <p><a href={noahSignInHref(typeof window === 'undefined' ? '/noah' : window.location.pathname + window.location.search)}>{NOAH_PIN_TEXT.signIn}</a></p> : <>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {boards === null && !error && <p><output>{NOAH_PIN_TEXT.more}</output></p>}
      {boards && boards.length > 0 && <ul className={styles.boardList}>{boards.map((board) => <li key={board.id}>
        <button type="button" disabled={pending} aria-pressed={savedIn.includes(board.id)} onClick={() => { void toggle(board); }}>
          <span><strong>{board.name}</strong><small>{board.visibility === 'public' ? '公開' : '自分だけ'} · {board.pins} 件</small></span>
          {savedIn.includes(board.id) ? <Check size={18} /> : <Plus size={18} />}
        </button>
      </li>)}</ul>}
      <form className={styles.newBoard} onSubmit={(event) => { void create(event); }}>
        <label>{NOAH_PIN_TEXT.boardName}<input value={name} maxLength={40} required placeholder="例: 経理の道具" onChange={(event) => setName(event.target.value)} /></label>
        <label className={styles.check}><input type="checkbox" checked={visibility === 'public'} onChange={(event) => setVisibility(event.target.checked ? 'public' : 'private')} />{NOAH_PIN_TEXT.public}</label>
        <button type="submit" disabled={pending || !name.trim()}>{NOAH_PIN_TEXT.create}</button>
      </form>
    </>}
  </dialog>;
}
