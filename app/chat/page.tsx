import type { Metadata } from 'next';
import SkyChatWorkspace from '@/components/sky-chat-workspace';

export const metadata: Metadata = {
  title: 'Jennifer — RockstarOS',
  description: 'Jenniferがプロジェクトを整理し、担当siへ配り、Zemaの証拠と完了をまとめる本人用ワークスペース。',
};

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ tool?: string; thread?: string; view?: string }>;
}) {
  const params = await searchParams;
  if (params.view === 'work') return <SkyChatWorkspace />;
  return <SkyChatWorkspace />;
}
