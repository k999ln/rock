import type { Metadata } from 'next';
import Link from 'next/link';
import styles from '@/app/rockstaros/preview.module.css';
import miniStyles from './design.module.css';

export const metadata: Metadata = {
  title: 'avocadoMini R5 — hardware design program',
  description: '1本から使える200mm以内の独立空間端末。別Hubは不要、価格・製造・実機の受入は未確定です。',
};

export default function AvocadoMiniDesignHome() {
  return <main className={`${styles.landing} ${styles.productLanding} ${miniStyles.r5Landing}`}>
    <header className={styles.landingHeader}>
      <span className={styles.brand}>avocadoMini</span>
      <nav className={styles.productNav} aria-label="avocadoMiniページ内のメニュー">
        <a href="#design">製品を見る</a>
        <Link href="/os">RockstarOSサービス</Link>
        <Link href="/rockstaros/crowdfunding">検証計画</Link>
      </nav>
    </header>
    <section id="design" className={`${styles.campaignIntro} ${miniStyles.intro}`}>
      <p className={`${styles.kicker} ${miniStyles.eyebrow}`}>AVOCADOMINI R5 / DESIGN PROGRAM</p>
      <h1>1本から、<br />遊びと創作を広げる。</h1>
      <p className={miniStyles.bodyCopy}>身体・手・日本語音声で遊び、作り、暮らしへ広げる独立空間端末を目指します。使用時200mm以内の銀色円筒1本が基本で、別Hubは不要です。</p>
      <p className={miniStyles.bodyCopy}>設置時の外部給電と、取り外して使うときの携帯電源を設計します。電池方式は未選定です。同じMiniを追加して体験を広げられます。Proやクラウドとの接続は任意で、ローカルの基本操作は独立して受け入れます。</p>
      <p className={`${styles.campaignNotice} ${miniStyles.notice}`}>価格は未確定です。実機試験・製造・一般販売は未承認。裸眼空間表示は研究段階で、動作を実証した製品ではありません。</p>
      <a href="https://avocadomini.si/mini/" className={styles.campaignReturn}>R5の製品構想を見る ↗</a>
    </section>
    <section className={`${styles.access} ${miniStyles.serviceInfo}`} aria-label="関連情報">
      <h2>RockstarOSと、自分のsiチーム。</h2>
      <p>MiniはRockstarOSサービスを使うための必須端末ではありません。無料アカウントから、スマートフォン・PC・ブラウザでも始められます。</p>
      <Link href="/os">RockstarOSサービスをはじめる</Link>
    </section>
    <footer className={styles.landingFooter}>
      <span>© 2026 KAIYA</span>
      <span>avocadoMini R5 design program</span>
    </footer>
  </main>;
}
