import Link from 'next/link';
import WorkspaceShell from '@/components/workspace-shell';
import SpiderWorkspace from '@/components/spider-workspace';

export default function Page() {
  return <WorkspaceShell title="SPIDER · セキュリティ検査"><p><Link href="/sky">Skyに戻る</Link></p><SpiderWorkspace /></WorkspaceShell>;
}
