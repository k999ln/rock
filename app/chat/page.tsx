import type { Metadata } from 'next';
import SkyChatWorkspace from '@/components/sky-chat-workspace';

export const metadata: Metadata = {
  title: 'Chat — RockstarOS',
};

export default function ChatPage() {
  return <SkyChatWorkspace />;
}
