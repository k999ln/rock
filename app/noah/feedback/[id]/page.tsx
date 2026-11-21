import Link from 'next/link';
import NoahAgentFeedback from '@/components/noah-agent-feedback';
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main style={{ maxWidth: 760, margin: 'auto', padding: '24px 20px' }}>
      <Link
        href={
          id.startsWith('release-')
            ? '/noah#agents'
            : `/noah/agents/${encodeURIComponent(id)}`
        }
      >
        ← Agentへ戻る
      </Link>
      <NoahAgentFeedback key={id} id={id} />
    </main>
  );
}
