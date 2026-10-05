import type { Metadata } from 'next';
import Link from 'next/link';
import styles from './preview.module.css';

export const metadata: Metadata = {
  title: 'RockstarOS — SIM/eSIMでサービスをはじめる',
  description: 'SIM/eSIM購入からRockstarOS、Sky、Zema、Agentへ。対応端末に合ったOS/client導入方法を案内します。',
};

export default function RockstarOSServiceHome() {
  return <main className={`${styles.landing} ${styles.productLanding}`}>
    <header className={styles.landingHeader}>
      <span className={styles.brand}>RockstarOS</span>
      <nav className={styles.productNav} aria-label="RockstarOSサービス">
        <Link href="/connect">利用をはじめる</Link>
        <Link href="/sky/esim">SIM/eSIMプラン</Link>
        <Link href="/avocado-mini">avocadoMini構想</Link>
      </nav>
    </header>
    <section className={styles.osSection} aria-labelledby="service-title">
      <p className={styles.brand}>SIM / eSIM SERVICE ACCESS</p>
      <h1 id="service-title">SIM/eSIMをつないで、Sky・Zema・AI Agentへ。</h1>
      <p>対応SIM/eSIMの購入にはRockstarOSサービス利用権が含まれる設計です。クラウドAIへ簡単にアクセスし、作業の料金・進捗・成果を一つのアカウントで確認できます。</p>
      <div className={styles.accessCards}>
        <Link href="/connect"><strong>利用開始の流れを見る</strong><span>端末適合、回線有効化、アカウント連携、OS/clientの分岐を確認します。</span></Link>
        <Link href="/sky/esim"><strong>SIM/eSIM条件を見る</strong><span>現状は契約・提供条件の確認用です。購入機能は準備中です。</span></Link>
      </div>
      <p className={styles.installNote}>RockstarOSはSIMカード内で動くOSではありません。対応端末では署名済み導入経路を使い、その他の端末では既存OSアプリまたはブラウザ版を案内します。実SIMの販売・開通、実課金、端末へのOS導入は未受入です。</p>
      <p><Link href="/rockstaros/guide">Developer Previewの端末・導入ガイドを見る</Link></p>
    </section>
    <footer className={styles.landingFooter}>
      <span>© 2026 KAIYA</span>
      <span>RockstarOS service access</span>
    </footer>
  </main>;
}
