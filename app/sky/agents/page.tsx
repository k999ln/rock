import type { Metadata } from 'next';
import SkyAgentLibrary from '@/components/sky-agent-library';
export const metadata: Metadata = { title: '追加したエージェント — Sky', robots: { index: false, follow: false } };
export default function Page() { return <SkyAgentLibrary />; }
