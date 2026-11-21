import NoahWorkList from '@/components/noah-work-list';
import Link from 'next/link';
import styles from '@/components/noah-service.module.css';
export const metadata = { title: 'Agentの成果データ — Noah' };
// スマホから、接続した Agent へ頼んで、成果が出た仕事も、ここに並べる（Agent をまたいで。無い人には次の操作を示す）。
export default function Page() { return <main className={styles.page}>
  <header className={styles.exploreHeading}><h1>成果データ</h1><p>Agentから受け取った結果が、ここに残ります。</p></header>
  <NoahWorkList ownerScope={null} refresh={0} only="succeeded" heading="受け取った成果" showEmpty />
  <details><summary>以前に保存した成果</summary><Link href="/noah/data/saved">保存した成果を開く</Link></details>
</main>; }
