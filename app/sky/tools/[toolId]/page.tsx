import type { Metadata } from 'next';
import SkyToolWorkspace from '@/components/sky-tool-workspace';
import { catalog } from '@/lib/catalog';

type Props = { params: Promise<{ toolId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { toolId } = await params;
  const tool = catalog.find((item) => item.id === toolId);
  return { title: tool ? `${tool.name} — Sky` : 'Sky Tool — avocadoOS' };
}

export default async function SkyToolPage({
  params,
}: Props) {
  const { toolId } = await params;
  return <SkyToolWorkspace toolId={toolId} />;
}
