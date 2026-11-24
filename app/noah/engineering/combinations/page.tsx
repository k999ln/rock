import type { Metadata } from 'next';
import Link from 'next/link';
import { eveEngineeringNavigation } from '@/lib/eve-engineering-navigation';
import columns from '@/components/noah-engineering-columns.module.css';
import { EVE_DEMAND_LEDGER, EVE_STATUS_LABEL, eveCombinationCatalog, eveTemplateShapeCount, eveVerifiedCount } from '@/lib/eve-combination-catalog';
import styles from './eve-combinations.module.css';

export const metadata: Metadata = {
  title: '組み合わせ例 — Agentエンジニアリング',
  description: 'エージェントの出力を別のエージェントの入力につなぎ、最後に外部の入金の記録が出る組み合わせ。',
  robots: { index: false, follow: false },
};

export default async function EveCombinationsPage({ searchParams }: { searchParams: Promise<{ engineering?: string; lang?: string }> }) {
  const { engineering, lang } = await searchParams;
  const links = eveEngineeringNavigation(engineering, lang);
  const items = eveCombinationCatalog();
  const shapes = eveTemplateShapeCount();
  const verified = eveVerifiedCount();
  return (
    <div className={styles.shell}>
      <article className={`${styles.page} ${columns.container}`} lang="ja" dir="ltr">
        <nav className={styles.trail} aria-label="現在の場所">
          <Link href={links.consultation}>Agentエンジニアリング</Link>
        </nav>
        <header className={styles.hero}>
          <h1>組み合わせ例</h1>
          <p className={styles.lead}>
            エージェントの出力を、別のエージェントの入力につなぎます。ここでは、ASP・売り場・銀行の入金を確認するまでの設計例を読めます。
          </p>
          <div className={styles.stats}>
            <div><strong>{items.length}</strong><span>組み合わせ</span></div>
            <div><strong>{EVE_DEMAND_LEDGER.length}</strong><span>出典付きの需要</span></div>
            <div><strong>{verified}</strong><span>確かめたエージェント</span></div>
          </div>
        </header>

        <div className={columns.columns} data-engineering-columns>
          <section className={`${styles.section} ${columns.primary}`} data-engineering-primary aria-labelledby="eve-combos">
            <h2 id="eve-combos">何で稼ぐ？</h2>
            <p>手で書いた物と、Eve が型に当てはめた物・見つけた物。どれも同じ検査と試運転を通ります。</p>
            <ul className={styles.list}>
              {items.map((c) => (
                <li key={c.id}>
                  <Link className={styles.card} href={`/noah/engineering/combinations/${encodeURIComponent(c.id)}${links.search}`}>
                    <p className={styles.cardTitle}>{c.title}</p>
                    <span className={styles.badges}>
                      <span className={`${styles.badge} ${styles[c.status]}`}>{EVE_STATUS_LABEL[c.status]}</span>
                      <span className={styles.badge}>{c.origin === 'template' ? '型への当てはめ' : '型に無い組み合わせ'}</span>
                      <span className={styles.badge}>{c.author.kind === 'eve' ? 'Eve が作った' : `${c.author.id} が作った`}</span>
                    </span>
                    <p className={styles.meta}>
                      工程 {c.counts.steps} · 本人の番 {c.counts.owner} · 部品が無い {c.counts.missing} · 本人の手間 1 回 {c.ownerMinutesPerRun} 分
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <aside className={columns.secondary} data-engineering-secondary>
            <section className={styles.section} aria-labelledby="eve-demand">
              <h2 id="eve-demand">需要の地図</h2>
              <p>誰が、何に、いくら払っているか。受注の募集・ASP の案件・売り場の公開価格から、出典の URL と確かめた日の付いた物だけを入れます。</p>
              {EVE_DEMAND_LEDGER.length === 0 ? (
                <p className={styles.empty}>出典付きの需要が、まだありません。集まるまで、見込みの利益の順位は出しません。</p>
              ) : (
                <ul className={styles.list}>
                  {EVE_DEMAND_LEDGER.map((d) => (
                    <li key={d.id} className={styles.card}>
                      <p className={styles.cardTitle}>{d.label}</p>
                      <p className={styles.meta}>{d.place} · {d.priceYen.toLocaleString('ja-JP')} 円 · 確かめた日 {d.checkedAt.slice(0, 10)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className={styles.section} aria-labelledby="eve-discover">
              <h2 id="eve-discover">発見の候補</h2>
              <p>
                設計図 {shapes.blueprints} 通りの「作る」部分は、{shapes.shapes} 通りの作り方に収まります。需要と確かめたエージェントがそろうと、型に無い組み合わせを、見込みの利益の順に並べます。
              </p>
              <p className={styles.empty}>候補はまだありません（需要 {EVE_DEMAND_LEDGER.length} 件・確かめたエージェント {verified} 件）。</p>
            </section>

          </aside>
        </div>
        <p className={styles.note}>
          eve.si は送金も公開もしません。登録・申込・公開・入金の確認は本人が押す工程で、中身と手順を用意して止めます。採点は Jev が外部の記録だけで行い、Eve が作った物を Eve が合格にすることはありません。
        </p>
      </article>
    </div>
  );
}
