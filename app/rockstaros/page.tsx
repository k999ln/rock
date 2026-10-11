import type { Metadata } from 'next';
import Link from 'next/link';
import styles from './preview.module.css';

export const metadata: Metadata = {
  title: 'RockstarOS — アカウントひとつでサービスをはじめる',
  description: 'avokadoのアカウントひとつで、スマホ・PC・ブラウザからSky、Zema、AI Agentを使えます。SIMは不要です。',
};

export default function RockstarOSServiceHome() {
  return <main className={`${styles.landing} ${styles.productLanding}`}>
    <header className={styles.landingHeader}>
      <span className={styles.brand}>RockstarOS</span>
      <nav className={styles.productNav} aria-label="RockstarOSサービス">
        <Link href="/connect">利用をはじめる</Link>
        <Link href="/avocado-mini">avocadoMini構想</Link>
      </nav>
    </header>
    <section className={styles.osSection} aria-labelledby="service-title">
      <p className={styles.brand}>ONE ACCOUNT SERVICE ACCESS</p>
      <h1 id="service-title">アカウントひとつで、Sky・Zema・AI Agentへ。</h1>
      <p>avokadoのアカウントを作れば、スマホ・PC・ブラウザのどれからでもクラウドAIへ簡単にアクセスできます。作業の料金・進捗・成果を一つのアカウントで確認できます。有料のAI作業は、実行前に見積りを表示し、決めた上限の中で動きます。</p>
      <div className={styles.accessCards}>
        <Link href="/connect"><strong>利用開始の流れを見る</strong><span>アカウント作成、端末ごとの使い方（アプリ・ブラウザ・対応端末のOS）を確認します。</span></Link>
        <Link href="/avocado-mini"><strong>avocadoMiniを見る</strong><span>回線を内蔵するモデルは構想中です。製造・販売はまだ始まっていません。</span></Link>
      </div>
      <p className={styles.installNote}>SIMは不要です。avocadoMiniのような機器だけが、通信用の回線を任意で使います。RockstarOSはSIMカード内で動くOSではありません。対応端末では署名済み導入経路を使い、その他の端末では既存OSアプリまたはブラウザ版を使います。本番の課金、回線の開通、端末へのOS導入はまだ受け入れていません。</p>
      <p><Link href="/rockstaros/guide">Developer Previewの端末・導入ガイドを見る</Link></p>
    </section>
    <footer className={styles.landingFooter}>
      <span>© 2026 KAIYA</span>
      <span>RockstarOS service access</span>
    </footer>
  </main>;
}
