'use client';
/**
 * Agent の詳細の下に足す物（task 115）: 「保存」（ボードへ）と「これも使われています」（その Agent を保存した他の人のボードから。5 人以上の時だけ）。
 * 一覧がまだ公開されていない間（入口が 404）は、何も出さない。仕様: docs/noah/spec-115-pin-grid.md の 3 章。
 */
import { useEffect, useState } from 'react';
import { NOAH_PIN_TEXT, noahPinShape, noahPinTopic } from '@/lib/noah-pins';
import NoahPinGrid, { NoahSaveSheet, type NoahPinView } from './noah-pin-grid';
import styles from './noah-pins.module.css';

export default function NoahPinExtras({ item, ownerScope }: { item: Omit<NoahPinView, 'topic' | 'shape' | 'savedIn'>; ownerScope: string | null }) {
  const signedIn = ownerScope !== null;
  const [savedIn, setSavedIn] = useState<string[]>([]), [open, setOpen] = useState(false), [related, setRelated] = useState<NoahPinView[] | null>(null);
  useEffect(() => {
    let stopped = false;
    if (signedIn) void fetch(`/api/noah/boards?pin=${encodeURIComponent(item.id)}`, { cache: 'no-store' }).then(async (response) => {
      const body = await response.json() as { savedIn?: string[] };
      if (!stopped && response.ok && Array.isArray(body.savedIn)) setSavedIn(body.savedIn);
    }).catch(() => undefined);
    void fetch(`/api/noah/pins?related=${encodeURIComponent(item.id)}`, { cache: 'no-store' }).then(async (response) => {
      const body = await response.json() as { items?: NoahPinView[] };
      if (!stopped && response.ok && Array.isArray(body.items)) setRelated(body.items);
    }).catch(() => undefined);
    return () => { stopped = true; };
  }, [item.id, signedIn]);
  const pin: NoahPinView = { ...item, topic: noahPinTopic(item.name, item.summary), shape: noahPinShape(item.id), savedIn };
  return <>
    <div className={styles.detailSave}><button type="button" className={styles.saveButton} data-saved={savedIn.length > 0 || undefined} onClick={() => setOpen(true)}>{savedIn.length ? `${NOAH_PIN_TEXT.saved}（${savedIn.length}）` : NOAH_PIN_TEXT.save}</button></div>
    {open && <NoahSaveSheet pin={pin} signedIn={signedIn} ownerScope={ownerScope} onClose={() => setOpen(false)} onChange={setSavedIn} />}
    {related && related.length > 0 && <section className={styles.related} aria-labelledby="noah-related">
      <h2 id="noah-related">{NOAH_PIN_TEXT.related}</h2>
      <NoahPinGrid items={related} signedIn={signedIn} ownerScope={ownerScope} onChange={(id, next) => setRelated((old) => old?.map((row) => (row.id === id ? { ...row, savedIn: next } : row)) ?? old)} />
    </section>}
  </>;
}
