'use client';
/**
 * 棚（/noah/ready の一番上）。「稼ぐ・仕事を省く」「教育」「暮らし」の 3 段に、運営が動かして確かめた仕事のカードを並べる。
 * カードの名前と説明は運営の言葉（「Noah の説明」と添える）。提供者の説明は、押した先の詳細の画面に、そのまま出る。
 * 並びと、載せるかどうかは、サーバーが決める（GET /api/noah/shelf）。ここは、返った順に出すだけ。閉じている・読めない・載る物が無い時は、何も出さない。
 * 仕様: docs/noah/spec-110-shelf.md の 10 章。
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { NOAH_SHELF_TEXT, type NoahShelfCard } from '@/lib/noah-shelf-view';
import styles from './noah-ready.module.css';

type Shelf = { id: string; name: string; cards: NoahShelfCard[] };

export default function NoahShelf() {
  const [shelves, setShelves] = useState<Shelf[] | null>(null);
  useEffect(() => {
    let stopped = false;
    void fetch('/api/noah/shelf', { cache: 'no-store' }).then(async (response) => {
      if (response.status !== 200) return;
      const body = await response.json() as { shelves?: Shelf[] };
      if (!stopped && Array.isArray(body.shelves)) setShelves(body.shelves);
    }).catch(() => undefined);
    return () => { stopped = true; };
  }, []);
  const filled = (shelves ?? []).filter((shelf) => Array.isArray(shelf.cards) && shelf.cards.length > 0);
  if (!filled.length) return null;
  return <>
    <p className={styles.sectionNote}>{NOAH_SHELF_TEXT.lead}</p>
    {filled.map((shelf) => <section key={shelf.id} className={styles.section} aria-labelledby={`noah-shelf-${shelf.id}`}>
      <h2 id={`noah-shelf-${shelf.id}`}>{shelf.name}<small>{shelf.cards.length} 件</small></h2>
      <div className={styles.cards}>{shelf.cards.map((card) => <ShelfCard key={card.id} card={card} />)}</div>
    </section>)}
  </>;
}

function ShelfCard({ card }: { card: NoahShelfCard }) {
  const facts = [
    ...card.runs.map((place) => NOAH_SHELF_TEXT.runs[place]),
    NOAH_SHELF_TEXT.owner(card.ownerSteps, card.ownerMinutes),
    NOAH_SHELF_TEXT.noNumbers,
    ...(card.advice ? [NOAH_SHELF_TEXT.advice] : []),
  ];
  return <article className={styles.card}>
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
    <div className={styles.connect}><Link className={styles.primary} href={card.target}>{NOAH_SHELF_TEXT.use}</Link></div>
  </article>;
}
