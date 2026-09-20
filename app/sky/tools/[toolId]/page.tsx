import type { Metadata } from 'next';
import SkyToolWorkspace from '@/components/sky-tool-workspace';

export const metadata: Metadata = {
  title: 'Sky Tool — avocadoOS',
};

export default async function SkyToolPage({
  params,
}: {
  params: Promise<{ toolId: string }>;
}) {
  const { toolId } = await params;
  return <SkyToolWorkspace toolId={toolId} />;
}
