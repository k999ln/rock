'use client';
/**
 * ピンタレスト風のグリッド（task 115）。カードを 1 枚ずつ、今いちばん短い列に置く（同じなら左）。先に高さを測ってから置く。
 * 置き方は Pinterest の Gestalt（github.com/pinterest/gestalt、Apache-2.0）の Masonry の決まりを、小さく書き写した物（部品ごとは入れない）。
 * 列の数は、幅に合わせて 2〜6。カードは、分野の色の面に頭文字（Agent に画像が無いため）、名前、説明 2 行。「保存」でボードへ。
 * 仕様: docs/noah/spec-115-pin-grid.md の 3 章。
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { MoreHorizontal, Check, Plus, X } from 'lucide-react';
import { NOAH_PIN_TEXT, NOAH_PIN_TOPIC_LABELS, noahCardOrigin, noahPinInitials } from '@/lib/noah-pins';
import { noahCardHref, noahProjectHref } from '@/lib/noah-project-view';
import { noahReadyDetailHref } from '@/lib/noah-ready-view';
import styles from './noah-pins.module.css';
import type { NoahAgentCard } from '@/lib/noah-agent-cards';
import { useNoahLocale } from './noah-locale';
import NoahAgentSourceRatings from './noah-agent-source-ratings';
import { NOAH_COLLECTION_RUN_LABELS } from '@/lib/noah-collection';

/** グリッドの 1 枚（GET /api/noah/pins の items の 1 件）。 */
export type NoahPinView = NoahAgentCard;
type BoardView = { id: string; name: string; visibility: 'private' | 'public'; pins: number; revision: number };

const GAP = 16, MIN_COLUMN = 236;

/** 幅から列の数と列の幅。スマホ（375 px）で 2 列、PC で 4〜6 列。 */
export function noahPinColumns(width: number) {
  const columns = Math.min(6, Math.max(2, Math.floor((width + GAP) / (MIN_COLUMN + GAP))));
  const gap = width < 520 ? 8 : GAP;
  return { columns, gap, columnWidth: Math.max(0, (width - gap * (columns - 1)) / columns) };
}
/** 高さの分かったカードを、順に、いちばん短い列（同じなら左）へ置く。高さが未だ分からないカードは、その場で止める（後ろを先に置かない）。 */
export function noahPinLayout(heights: readonly (number | undefined)[], columns: number, columnWidth: number, gap: number) {
  const tops = Array.from({ length: columns }, () => 0), placed: { left: number; top: number }[] = [];
  for (const height of heights) {
    if (height === undefined) break;
    let column = 0;
    for (let index = 1; index < columns; index++) if (tops[index] < tops[column]) column = index;
    placed.push({ left: column * (columnWidth + gap), top: tops[column] });
    tops[column] += height + gap;
  }
  return { placed, height: Math.max(0, ...tops) };
}

export default function NoahPinGrid({ items, signedIn, ownerScope, onChange, onHide, presentation = 'board' }: {
  presentation?: 'store' | 'board';
  items: NoahPinView[]; signedIn: boolean; ownerScope: string | null;
  onChange?: (id: string, savedIn: string[]) => void; onHide?: (id: string) => void;
}) {
  const {t} = useNoahLocale();
  const store = presentation === 'store';
  const frame = useRef<HTMLDivElement>(null), cards = useRef(new Map<string, HTMLElement>());
  const [width, setWidth] = useState(0), [heights, setHeights] = useState<{ width: number; map: Map<string, number> }>({ width: 0, map: new Map() });
  const [saving, setSaving] = useState<NoahPinView | null>(null);
  useEffect(() => {
    const element = frame.current;
    if (store || !element) return;
    const update = () => setWidth(Math.floor(element.clientWidth));
    update();
    if (typeof ResizeObserver === 'undefined') { window.addEventListener('resize', update); return () => window.removeEventListener('resize', update); }
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [store]);
  const { columns, gap, columnWidth } = noahPinColumns(width);
  // 描くたびに、まだ測っていないカード（と、列の幅が変わった時は全部）の高さを測る。変わった時だけ状態を変える（変わらなければ、描き直さない）。
  const [fonts, setFonts] = useState(0);
  useLayoutEffect(() => {
    if (store) return;
    setHeights((old) => {
      const map = old.width === columnWidth ? new Map(old.map) : new Map<string, number>();
      let changed = old.width !== columnWidth;
      for (const [id, element] of cards.current) {
        const height = element.offsetHeight;
        if (height > 0 && map.get(id) !== height) { map.set(id, height); changed = true; }
      }
      return changed ? { width: columnWidth, map } : old;
    });
  }, [columnWidth, items, fonts, store]);
  // Rating requests, expanded provenance and translations can change card height after mount.
  useEffect(() => {
    if (store || typeof ResizeObserver === 'undefined') return;
    const observer=new ResizeObserver(()=>setFonts(n=>n+1));
    for (const card of cards.current.values()) observer.observe(card);
    return ()=>observer.disconnect();
  }, [items,width,store]);
  // 字の読み込みで高さが変わった時も、測り直す。
  useEffect(() => { if (!store) void document.fonts?.ready.then(() => setFonts((n) => n + 1)); }, [store]);
  const known = heights.width === columnWidth ? heights.map : new Map<string, number>();
  const layout = store ? null : noahPinLayout(items.map((item) => known.get(item.id)), columns, columnWidth, gap);

  return <div ref={frame} className={store ? styles.storeList : styles.grid} style={layout ? { height: layout.height } : undefined}>
    {(store || width > 0) && items.map((item, index) => {
      const at = layout?.placed[index];
      const href = noahCardHref(item) ?? noahReadyDetailHref(item.id);
      return <article key={item.id} ref={store ? undefined : (element) => { if (element) cards.current.set(item.id, element); else cards.current.delete(item.id); }}
        className={`${store ? styles.storeItem : styles.pin} ${styles.tone}`} style={store ? undefined : { width: columnWidth, transform: at ? `translate(${at.left}px, ${at.top}px)` : undefined, visibility: at ? 'visible' : 'hidden' }}
        data-topic={item.topic} data-shape={item.shape} aria-label={item.name}>
        <a className={styles.face} href={href}>
          <span className={styles.panel} aria-hidden="true"><span className={styles.initials}>{noahPinInitials(item.name)}</span><span className={styles.topicLabel}>{NOAH_PIN_TOPIC_LABELS[item.topic]}</span></span>
          <div className={styles.pinCopy}><strong className={styles.name}>{item.name}</strong>
          {item.summary && <span className={styles.summary}>{item.summary}</span>}
          <small className={styles.meta}>{noahCardOrigin(item)} · {item.external ? 'Noahで接続を確認' : item.run ? NOAH_COLLECTION_RUN_LABELS[item.run] : item.oneTap ? 'すぐ試せる' : '接続して使う'}</small></div>
          {store && <span className={styles.openItem}>{t('見る')}</span>}
        </a>
        {!item.external && <button type="button" className={styles.save} data-saved={item.savedIn.length > 0 || undefined} onClick={() => setSaving(item)} aria-label={`${item.name}を${item.savedIn.length ? '保存済み' : '保存'}`}>
          {item.savedIn.length ? NOAH_PIN_TEXT.saved : NOAH_PIN_TEXT.save}
        </button>}
        <NoahAgentSourceRatings sources={item.sources} detailHref={`${noahProjectHref(item.feedbackId ?? item.id)}#ratings`} />
        {signedIn && !item.external && onHide && <details className={styles.more}>
          <summary aria-label="その他の操作"><MoreHorizontal size={18} /></summary>
          <button type="button" onClick={() => onHide(item.id)}>{NOAH_PIN_TEXT.hide}</button>
        </details>}
      </article>;
    })}
    {saving && <NoahSaveSheet pin={saving} signedIn={signedIn} ownerScope={ownerScope} onClose={() => setSaving(null)} onChange={(savedIn) => { onChange?.(saving.id, savedIn); setSaving((old) => (old ? { ...old, savedIn } : old)); }} />}
  </div>;
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
    {!signedIn ? <p><Link href={`/noah/account?returnTo=${encodeURIComponent(typeof window === 'undefined' ? '/noah' : window.location.pathname + window.location.search)}`}>{NOAH_PIN_TEXT.signIn}</Link></p> : <>
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
