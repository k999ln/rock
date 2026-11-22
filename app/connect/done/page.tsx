import type { Metadata } from 'next';
import Link from 'next/link';
import WorkspaceShell from '@/components/workspace-shell';
import styles from '@/components/connection-workspace.module.css';

export const metadata: Metadata = {
  title: 'Eveをホーム画面に追加',
  applicationName: 'Eve',
  manifest: '/connect/eve.webmanifest',
  appleWebApp: { capable: true, title: 'Eve', statusBarStyle: 'default' },
};

export default function ConnectDonePage() {
  return <WorkspaceShell title="Eve" hideTopActions hideAccountAccess>
    <div className={styles.page}>
      <header className={styles.heading}><h1>Eveをホーム画面に追加</h1></header>
      <section className={styles.panel} aria-label="Safariでの追加手順">
        <ol>
          <li>Safariで下の「Eveを開く」を選びます。</li>
          <li>Safariの「共有」から「ホーム画面に追加」を選び、追加します。</li>
          <li>ホーム画面のEveを開いて、同じアカウントでサインインします。</li>
        </ol>
        <nav aria-label="Eveと購入履歴">
          <Link href="/os/eve">Eveを開く</Link>
          <Link href="/noah/purchases">購入履歴でeSIMの導入状況を確認</Link>
        </nav>
      </section>
    </div>
  </WorkspaceShell>;
}
