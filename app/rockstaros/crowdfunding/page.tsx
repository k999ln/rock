import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import styles from '../preview.module.css';

export const metadata: Metadata = {
  title: 'avocadoMini — クラウドファンディング企画案',
  description: '4本のMotion TowerとEdge HubのavocadoMiniキット構想。税込41万円はキット目標価格で、支援募集と決済は始まっていません。',
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
        <p>avocadoMiniは、4本のMotion Towerと1台のEdge Hubで作業空間を捉えるキット構想です。RockstarOSが作業の整理と記録を支える製品を目指します。</p>
        <p className={styles.campaignPrice}><strong>41万円</strong><span>4本＋Edge Hubの税込キット目標価格 · 確定販売価格ではありません</span></p>
        <p className={styles.campaignNotice}>現在は設計段階です。クラウドファンディングの募集、決済、先行予約は始まっていません。</p>
        <Link href="/rockstaros" className={styles.campaignReturn}>製品・導入ホームへ戻る ↗</Link>
      </section>

      <section className={styles.product} aria-labelledby="campaign-product-title">
        <div className={styles.productCopy}>
          <p className={styles.kicker}>01 / THE PRODUCT</p>
          <h2 id="campaign-product-title">avocadoMini</h2>
          <p>4本のタワーのカメラとEdge Hubで作業領域を捉えます。Material Invention Studioで物質のデジタル模型を扱い、候補と検討の経緯を残す設計です。</p>
          <p className={styles.productStatus}>画像は構想参考画像です。実機の表示、追跡性能、安全性、LLMの製品搭載を示すものではありません。</p>
        </div>
        <figure className={styles.productVisual}>
          <Image src="/rockstaros/avocado-mini-kit-p0.png" alt="4本のMotion TowerとEdge Hubのキット構想" width={1680} height={940} />
          <figcaption>AVOCADOMINI / DESIGN CONCEPT · PROTOTYPE PENDING</figcaption>
        </figure>
      </section>

      <section className={styles.campaignSteps} aria-labelledby="campaign-steps-title">
        <p className={styles.kicker}>02 / FIRST MILESTONE</p>
        <h2 id="campaign-steps-title">まず、小型試作で確かめる。</h2>
        <ol>
          <li>4本の同期、伸縮機構、脚とドックの検出、安全停止を検証する。</li>
          <li>手の操作と2D／AR表示を試し、誤操作と取り消しを測る。</li>
          <li>候補の履歴と安全判定をMaterial Invention Coreで再現する。</li>
        </ol>
        <p>募集サービス、目標額、返礼、提供条件、公開URLは未定です。条件を確定して募集が始まったら、ここから正式な支援ページへ進めるようにします。</p>
        <Link href="/rockstaros/guide" className={styles.campaignReturn}>RockstarOSの導入案内を見る ↗</Link>
      </section>
    </main>
  );
}
