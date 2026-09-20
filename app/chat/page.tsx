import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import SkyChatWorkspace from '@/components/sky-chat-workspace';

export const metadata: Metadata = {
  title: 'Zema — RockstarOS',
};

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ tool?: string; thread?: string; view?: string }>;
}) {
  const params = await searchParams;
  if (params.view === 'work') return <SkyChatWorkspace />;
  if (params.tool && !params.thread)
    redirect(`/sky/tools/${encodeURIComponent(params.tool)}`);
  return <SkyChatWorkspace />;
}
