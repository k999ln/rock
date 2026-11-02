'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { catalog } from '@/lib/catalog';
import styles from './eve-sync-workspace.module.css';

export default function EveToolHandoff({ authenticationRequired = false }: { authenticationRequired?: boolean }) {
  const query = useSearchParams();
  const id = query.get('tool');
  const tool = catalog.find(item => item.id === id);
  return <section className={styles.handoffNotice} aria-label="NoahからEveへのTool引継ぎ">
    <h2>{tool ? `Eveで使う：${tool.name}` : id ? '選択したToolを確認' : 'EveでToolを使う'}</h2>
    <p>{tool ? 'Noahで選んだToolを引き継いでいます。' : id ? 'このToolの情報を確認できません。NoahのTool一覧で選び直してください。' : 'Noahで追加した能力を使い、依頼と成果を確認します。'}{authenticationRequired ? '本人用の会話と仕事を保護するため、パスキーで確認してください。選択はこのURLに保持されます。' : '実行前に内容・権限・費用を確認します。'}</p>
    <nav aria-label="Toolの引継ぎ先と戻り先"><Link href="/os/sky">NoahのTool一覧へ戻る</Link><Link href="/#sky-manage">Noahのライブラリ</Link><Link href="/os/eve#eve-work-results">Eveの仕事と成果</Link></nav>
  </section>;
}
