import type { Metadata } from 'next';
import HomeScreen from '@/components/home-screen';
import EveNewsTimeline from '@/components/eve-news-timeline';

export const metadata: Metadata = {
  title: 'ホーム — RockstarOS',
  description: 'Sky、Zema、Wallet、Market、Fundを開くRockstarOSホーム画面。',
};

export default function RockstarOSHome() {
  return <><HomeScreen /><main style={{ maxWidth: 760, margin: '0 auto', padding: '0 16px 48px' }}><EveNewsTimeline /></main></>;
}
