import type { Metadata } from 'next';
import Link from 'next/link';
import { AvocadoTurntable } from '../../components/avocado-turntable';
import styles from './preview.module.css';

export const metadata: Metadata = {
  title: 'avocadoMini — 製品紹介',
  description:
    'avocadoMiniは伸縮式センサータワーのハードウェア構想。デザインを一周見て、希望参考価格41万円を確認できます。RockstarOSの導入案内は別ページです。',
};

export default function AvocadoMiniProductHome() {
  return (
    <main className={`${styles.landing} ${styles.productLanding}`}>
      <header className={styles.landingHeader}>
        <span className={styles.brand}>avocadoMini</span>
        <nav className={styles.productNav} aria-label="製品ページ内のメニュー">
          <a href="#design">製品を見る</a>
          <a href="#os-install-title">OS導入</a>
          <Link href="/rockstaros/crowdfunding">クラファン構想</Link>
        </nav>
      </header>

      <AvocadoTurntable />

      <nav className={styles.access} aria-label="導入案内とクラファン構想への入口">
        <h2>使い始める、その前に。</h2>
        <p>ここはavocadoMiniの製品ホームです。RockstarOSの利用画面は導入後に使う場所として分け、現在の導入条件と配布状況はガイドで案内します。</p>
        <div className={styles.accessCards}>
          <Link href="/rockstaros/guide"><strong>OS導入ガイドを見る</strong><span>Developer Previewの対象環境、配布状況、導入手順へ。</span></Link>
          <Link href="/rockstaros/crowdfunding"><strong>クラファン構想を見る</strong><span>試作と検証の計画を読む。支援募集と決済はまだ始まっていません。</span></Link>
        </div>
        <p className={styles.installNote}>avocadoMiniは設計段階です。実機の販売と一般向けOSインストーラーはまだ始まっていません。</p>
      </nav>

      <footer className={styles.landingFooter}>
        <span>© 2026 KAIYA</span>
        <span>avocadoMini — 製品紹介</span>
      </footer>
    </main>
  );
}
