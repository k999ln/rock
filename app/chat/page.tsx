import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import SkyChatWorkspace from '@/components/sky-chat-workspace';
import ZemaHomeWorkspace from '@/components/zema-home-workspace';

export const metadata: Metadata = {
  title: 'Zema — avocadoOS',
};

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ tool?: string; view?: string }>;
}) {
  const params = await searchParams;
  if (params.view === 'work') return <SkyChatWorkspace />;
  if (params.tool) redirect(`/sky/tools/${encodeURIComponent(params.tool)}`);
  return <ZemaHomeWorkspace />;
}
