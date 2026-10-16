'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { catalog } from '@/lib/catalog';
import { skyToolUiState } from '@/lib/sky-tool-ui';
import { useSkyToolContext } from '@/lib/use-sky-tool-context';
import SkyFreeArticleOrder from '@/components/sky-free-article-order';
import SkyToolOverview from '@/components/sky-tool-overview';
import WorkspaceShell from '@/components/workspace-shell';
import styles from './sky-free-article-detail-page.module.css';

const articleTool = catalog.find((tool) => tool.id === 'mr-free-article');

export default function SkyFreeArticleDetailPage() {
  const context = useSkyToolContext();
  if (!articleTool) return null;

  return (
    <WorkspaceShell title="Sky" tone="sky" contentClassName={styles.shell} hideTopActions>
      <div className={styles.page}>
        <nav aria-label="現在位置" className={styles.navigation}>
          <Link href="/sky/marketplace"><ArrowLeft size={16} /> マーケットへ戻る</Link>
          <span>Sky Market / 記事制作</span>
        </nav>
        <SkyToolOverview tool={articleTool} state={skyToolUiState(articleTool, context)} standalone>
          <SkyFreeArticleOrder />
        </SkyToolOverview>
      </div>
    </WorkspaceShell>
  );
}
