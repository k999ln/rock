import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import styles from '../preview.module.css';

export const metadata: Metadata = {
  title: 'avocadoMini — クラウドファンディング企画案',
  description: '希望参考価格41万円のavocadoMini構想。現在は小型試作に向けた企画段階で、支援募集と決済は始まっていません。',
};

export default function CrowdfundingProposal() {
  return (
    <main className={styles.landing}>
      <header className={styles.landingHeader}>
        <Link href="/rockstaros" className={styles.brand} aria-label="製品・導入ホームへ戻る">Rockstar<span>OS</span></Link>
        <span className={styles.version}>AVOCADOMINI / PROJECT PROPOSAL</span>
      </header>

      <section className={styles.campaignIntro}>
        <p className={styles.kicker}>AVOCADOMINI / CROWDFUNDING CONCEPT</p>
        <h1>考える時間を、<br />つくる時間に。</h1>
        <p>avocadoMiniは、手を動かして発明の候補を選び、組み合わせ、比べるためのハードウェア構想です。高性能LLMを搭載するRockstarOSが、作業の整理と記録を支える製品を目指します。</p>
        <p className={styles.campaignPrice}><strong>41万円</strong><span>希望参考価格 · 確定販売価格ではありません</span></p>
        <p className={styles.campaignNotice}>現在は設計段階です。クラウドファンディングの募集、決済、先行予約は始まっていません。</p>
        <Link href="/rockstaros" className={styles.campaignReturn}>製品・導入ホームへ戻る ↗</Link>
      </section>

      <section className={styles.product} aria-labelledby="campaign-product-title">
        <div className={styles.productCopy}>
          <p className={styles.kicker}>01 / THE PRODUCT</p>
          <h2 id="campaign-product-title">avocadoMini</h2>
          <p>四方向のセンサーと作業面を想定しています。Material Invention Studioで物質のデジタル模型を扱い、候補と検討の経緯を残す設計です。</p>
          <p className={styles.productStatus}>画像は構想参考画像です。実機の表示、追跡性能、安全性、LLMの製品搭載を示すものではありません。</p>
        </div>
        <figure className={styles.productVisual}>
          <Image src="/rockstaros/avocado-mini-concept.png" alt="avocadoMiniのハードウェア構想図" width={1680} height={940} />
          <figcaption>AVOCADOMINI / DESIGN CONCEPT · PROTOTYPE PENDING</figcaption>
        </figure>
      </section>

      <section className={styles.campaignSteps} aria-labelledby="campaign-steps-title">
        <p className={styles.kicker}>02 / FIRST MILESTONE</p>
        <h2 id="campaign-steps-title">まず、小型試作で確かめる。</h2>
        <ol>
          <li>四方向センサーと作業面の構造、電源、熱、安全停止を検証する。</li>
          <li>手の操作と2D／AR表示を試し、誤操作と取り消しを測る。</li>
          <li>候補の履歴と安全判定をMaterial Invention Coreで再現する。</li>
        </ol>
        <p>募集サービス、目標額、返礼、提供条件、公開URLは未定です。条件を確定して募集が始まったら、ここから正式な支援ページへ進めるようにします。</p>
        <Link href="/rockstaros/guide" className={styles.campaignReturn}>RockstarOSの導入案内を見る ↗</Link>
      </section>
    </main>
  );
}
