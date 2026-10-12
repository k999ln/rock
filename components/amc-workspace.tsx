'use client';
import { useState } from 'react';
import WorkspaceShell from '@/components/workspace-shell';
import Link from 'next/link';
import AmcToolRunner from '@/components/amc-tool-runner';
import frame from '@/components/sky-application.module.css';
import styles from '@/components/sky-library.module.css';
import AmcQuickBoard from '@/components/amc-quick-board';
import quick from '@/components/amc-quick-board.module.css';
export default function AmcWorkspace() {
  const [notes, setNotes] = useState(false);
  return (
    <div className={frame.frame}>
      <WorkspaceShell
        title="Zema · AMC"
        tone="sky"
        hideTopActions
        contentClassName={styles.shell}
      >
        <div className={styles.page}>
          <nav className={frame.navigation} aria-label="Zemaナビゲーション">
            <Link href="/chat">会話</Link><Link href="/work">仕事</Link><Link href="/zema/amc" aria-current="page">AMC</Link><Link href="/sky/marketplace">Skyで探す</Link>
          </nav>
          <AmcToolRunner />
          <details
            className={quick.advanced}
            onToggle={(event) => event.currentTarget.open && setNotes(true)}
          >
            <summary>補助メモ · 手動チェックリスト</summary>
            {notes && <AmcQuickBoard />}
          </details>
        </div>
      </WorkspaceShell>
    </div>
  );
}
