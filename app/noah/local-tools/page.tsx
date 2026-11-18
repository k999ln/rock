import Link from 'next/link';
import styles from '@/components/noah-features.module.css';
export const metadata={title:'Mac専用の実験機能 — Noah'};
export default function Page(){return <main className={styles.page}>
  <header><span>NOAH · MAC</span><h2>Mac専用の実験機能</h2><p>この機能は、Noahを起動しているMacのローカル環境で使います。</p></header>
  <section><h3>対応する機能</h3><ul><li>Linuxの導入実験</li><li>Zoomの端末接続・通訳・連携テスト</li><li>予定管理の実験</li></ul>
  <p>公開サイトから端末の操作や実験機能を直接実行することはできません。元の機能はローカル版に残っています。</p>
  <ol><li>Noahを使っているMacでローカル版を起動します。</li><li>そのMacのブラウザーでローカル版を開き、追加機能を選びます。</li></ol>
  <div className={styles.links}><Link href="/noah/mac?target=library"><strong>Mac版を開く手順</strong><small>スマホからMacを遠隔操作するリンクではありません。</small></Link><Link href="/noah/features"><strong>機能一覧へ戻る</strong></Link></div>
  </section>
</main>;}
