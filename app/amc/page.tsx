import type { Metadata } from 'next';
import Link from 'next/link';
import WorkspaceShell from '@/components/workspace-shell';
import AmcToolRunner from '@/components/amc-tool-runner';

export const metadata: Metadata = {
  title: 'AMC — 部隊とGoalの管理',
  description:
    '32部隊の計画を確認し、依頼・Goal・意図から作業を準備。本人用の記録で進捗と検収を管理します。AIによる実作業は未接続です。',
};

export default function AmcPage() {
  return (
    <WorkspaceShell title="AMC">
      <p style={{ margin: '0 auto 16px', maxWidth: 1200 }}>
        <Link href="/sky">← Skyのツールへ</Link>
      </p>
      <AmcToolRunner />
    </WorkspaceShell>
  );
}
