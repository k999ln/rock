'use client';
/**
 * 棚（/noah/ready の一番上）。「稼ぐ・仕事を省く」「教育」「暮らし」の 3 段に、運営が動かして確かめた仕事のカードを並べる。
 * カードの名前と説明は運営の言葉（「Noah の説明」と添える）。提供者の説明は、押した先の詳細の画面に、そのまま出る。
 * 並びと、載せるかどうかは、サーバーが決める（GET /api/noah/shelf）。ここは、返った順に出すだけ。閉じている・読めない・載る物が無い時は、何も出さない。
 * サインインした本人は、カードを「表示しない」にできる（その本人の棚から外れる。POST /api/noah/shelf の hide）。
 * カードの上には、何をする仕事かの場面の絵（lib/noah-pin-scenes-shelf.ts。spec-115 の 9 章）。絵が無いカードは、今まで通り字だけ。
 * 仕様: docs/noah/spec-110-shelf.md の 10 章。
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { NOAH_SHELF_TEXT, type NoahShelfCard } from '@/lib/noah-shelf-view';
import { OWNER_SCOPE_HEADER } from '@/lib/owner-intent';
import { NOAH_SHELF_SCENES } from '@/lib/noah-pin-scenes-shelf';
import NoahPinSceneArt from './noah-pin-scene';
import styles from './noah-ready.module.css';

type Shelf = { id: string; name: string; cards: NoahShelfCard[] };

export default function NoahShelf() {
  const [shelves, setShelves] = useState<Shelf[] | null>(null), [ownerScope, setOwnerScope] = useState<string | null>(null), [busy, setBusy] = useState('');
  useEffect(() => {
    let stopped = false;
    void fetch('/api/noah/shelf', { cache: 'no-store' }).then(async (response) => {
      if (response.status !== 200) return;
      const body = await response.json() as { shelves?: Shelf[]; ownerScope?: string | null };
      if (!stopped && Array.isArray(body.shelves)) { setShelves(body.shelves); setOwnerScope(body.ownerScope ?? null); }
    }).catch(() => undefined);
    return () => { stopped = true; };
  }, []);
  async function hide(card: NoahShelfCard) {
    if (!ownerScope || busy) return;
    setBusy(card.id);
    try {
      const response = await fetch('/api/noah/shelf', { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json', [OWNER_SCOPE_HEADER]: ownerScope }, body: JSON.stringify({ action: 'hide', id: card.id, hidden: true }) });
      if (response.status === 200) setShelves((old) => (old ?? []).map((shelf) => ({ ...shelf, cards: shelf.cards.filter((item) => item.id !== card.id) })));
    } catch { /* 押し直せる。 */ } finally { setBusy(''); }
  }
  const filled = (shelves ?? []).filter((shelf) => Array.isArray(shelf.cards) && shelf.cards.length > 0);
  if (!filled.length) return null;
  return <>
    <p className={styles.sectionNote}>{NOAH_SHELF_TEXT.lead}</p>
    {filled.map((shelf) => <section key={shelf.id} className={styles.section} aria-labelledby={`noah-shelf-${shelf.id}`}>
      <h2 id={`noah-shelf-${shelf.id}`}>{shelf.name}<small>{shelf.cards.length} 件</small></h2>
      <div className={styles.cards}>{shelf.cards.map((card) => <ShelfCard key={card.id} card={card} onHide={ownerScope ? () => { void hide(card); } : null} hiding={busy === card.id} />)}</div>
    </section>)}
  </>;
}

function ShelfCard({ card, onHide, hiding }: { card: NoahShelfCard; onHide: (() => void) | null; hiding: boolean }) {
  const facts = [
    ...card.runs.map((place) => NOAH_SHELF_TEXT.runs[place]),
    NOAH_SHELF_TEXT.owner(card.ownerSteps, card.ownerMinutes),
    card.numbers ? NOAH_SHELF_TEXT.numbers(card.numbers) : NOAH_SHELF_TEXT.noNumbers,
    ...(card.advice ? [NOAH_SHELF_TEXT.advice] : []),
  ];
  const scene = NOAH_SHELF_SCENES[card.id];
  return <article className={styles.card}>
    {/* 絵は飾り。同じ行き先の題のリンクが読まれるので、絵のリンクは読み上げとタブの順から外す。 */}
    {scene && <Link className={styles.shelfScene} href={card.target} tabIndex={-1} aria-hidden="true"><NoahPinSceneArt scene={scene} /></Link>}
    <header className={styles.cardHead}>
      <h3><Link className={styles.cardName} href={card.target}><span>{card.title}</span></Link></h3>
      <span className={styles.provider}>{card.topicLabel}</span>
    </header>
    <p className={styles.summary}>{card.promise}</p>
    <dl className={styles.shelfIo}>
      <div><dt>{NOAH_SHELF_TEXT.give}</dt><dd>{card.give}</dd></div>
      <div><dt>{NOAH_SHELF_TEXT.get}</dt><dd>{card.get}</dd></div>
    </dl>
    <ul className={styles.facts} aria-label="動く所と、あなたがやる事">
      {card.why === 'trial' && <li className={styles.badge}>{NOAH_SHELF_TEXT.trial}</li>}
      {facts.map((text) => <li key={text}>{text}</li>)}
    </ul>
    {card.priceHint && <p className={styles.shelfPrice}>{NOAH_SHELF_TEXT.priceHint(card.priceHint.floorYen)}</p>}
    <p className={styles.shelfNote}>{NOAH_SHELF_TEXT.operatorNote}</p>
    <div className={styles.connect}>
      <Link className={styles.primary} href={card.target}>{NOAH_SHELF_TEXT.use}</Link>
      {onHide && <button type="button" className={styles.shelfHide} disabled={hiding} onClick={onHide}>{NOAH_SHELF_TEXT.hide}</button>}
    </div>
  </article>;
}
