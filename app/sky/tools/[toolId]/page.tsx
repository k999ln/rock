import { notFound } from 'next/navigation';
import SkyWritingService from '@/components/sky-writing-service';
export default async function Page({
  params,
}: {
  params: Promise<{ toolId: string }>;
}) {
  const { toolId } = await params;
  if (!['mr-citations', 'mr-free-article', 'coconala'].includes(toolId))
    notFound();
  return <SkyWritingService toolId={toolId} />;
}
