import type { Metadata } from 'next';
import Link from 'next/link';
import { AvocadoTurntable } from '@/components/avocado-turntable';
import styles from '@/app/rockstaros/preview.module.css';

export const metadata: Metadata = {
  title: 'avocadoMini — hardware design program',
  description: 'avocadoMini R5の独立したハードウェア構想と検証計画。RockstarOSの利用に専用端末は必須ではありません。',
};

export default function AvocadoMiniDesignHome() {
  return <main className={`${styles.landing} ${styles.productLanding}`}>
    <header className={styles.landingHeader}>
      <span className={styles.brand}>avocadoMini</span>
      <nav className={styles.productNav} aria-label="avocadoMiniページ内のメニュー">
        <a href="#design">製品を見る</a>
        <Link href="/rockstaros">RockstarOSサービス</Link>
        <Link href="/rockstaros/crowdfunding">検証構想</Link>
      </nav>
    </header>
    <AvocadoTurntable />
    <section className={styles.access} aria-label="関連情報">
      <h2>avocadoMini — 独立したhardware program</h2>
      <p>この端末はRockstarOSサービスの利用条件ではありません。設計段階であり、実機販売や製造承認はありません。</p>
      <Link href="/rockstaros">SIM/eSIMからRockstarOSサービスをはじめる</Link>
    </section>
    <footer className={styles.landingFooter}>
      <span>© 2026 KAIYA</span>
      <span>avocadoMini design program</span>
    </footer>
  </main>;
}
