import Link from 'next/link';
import { notFound } from 'next/navigation';
import SkyCodeTimeline from '@/components/sky-code-timeline';
import WorkspaceShell from '@/components/workspace-shell';
export default async function SkyCodePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ revision?: string }>;
}) {
  const { id } = await params;
  const { revision } = await searchParams;
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
      id,
    ) ||
    (revision !== undefined && !/^[1-9][0-9]{0,5}$/.test(revision))
  )
    notFound();
  return (
    <WorkspaceShell title="Sky · コード" tone="sky">
      <div style={{ maxWidth: 960, margin: '24px auto', padding: '0 16px' }}>
        <Link href="/sky">Skyのタイムラインへ</Link>
        <SkyCodeTimeline
          initialRepoId={id}
          initialRevision={revision ? Number(revision) : undefined}
        />
      </div>
    </WorkspaceShell>
  );
}
