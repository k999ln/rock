import type { Metadata } from 'next';
import Link from 'next/link';
import styles from '../preview.module.css';

export const metadata: Metadata = {
  title: 'avocadoMini R5 — 試作と検証の計画',
  description: 'R5の単体自律・入力・保存復旧・表示を検証する計画。価格は未確定、支援募集と決済は始まっていません。',
};

export default function CrowdfundingProposal() {
  return <main className={styles.landing}>
    <header className={styles.landingHeader}>
      <Link href="/rockstaros" className={styles.brand}>Rockstar<span>OS</span></Link>
      <span className={styles.version}>AVOCADOMINI R5 / ENGINEERING PLAN</span>
    </header>
    <section className={styles.campaignIntro}>
      <p className={styles.kicker}>AVOCADOMINI R5 / PROTOTYPE PENDING</p>
      <h1>一つの体験を、<br />実機で確かめる。</h1>
      <p>1本から使える、使用時200mm以内・別Hub不要の独立空間端末が現在の設計です。ゲーム、創作、物質発明、暮らしの操作と保存・復旧を順に受け入れます。</p>
      <p className={styles.campaignNotice}>価格は未確定です。クラウドファンディング募集、決済、先行予約は始まっていません。</p>
      <Link href="/avocado-mini" className={styles.campaignReturn}>現在のR5設計を見る ↗</Link>
    </section>
    <section className={styles.campaignSteps} aria-labelledby="campaign-steps-title">
      <h2 id="campaign-steps-title">試作から確かめること</h2>
      <ol>
        <li>1本の収納・給電・熱・ローカル操作・安全停止を検証する。</li>
        <li>入力、同じ成果の保存・再起動・復旧を実機で確認する。</li>
        <li>表示方式は研究gateで判定し、未成立なら対応済みと表示しない。</li>
        <li>任意の国内LTE、Pro、cloud接続は条件と費用を分けて受け入れる。</li>
      </ol>
      <p>募集主体、試作予算、提供条件、対象地域、返礼、返金条件と支援サービスは未確定です。受入結果と見積を揃えてから本人が判断します。</p>
      <Link href="/rockstaros/guide" className={styles.campaignReturn}>RockstarOSの導入案内を見る ↗</Link>
    </section>
  </main>;
}
