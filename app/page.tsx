import type { Metadata } from 'next';
import HomeScreen from '@/components/home-screen';

export const metadata: Metadata = {
  title: 'ホーム — RockstarOS',
  description:
    'Sky、Zema、Wallet、Market、Fundを開く、カスタマイズ可能なRockstarOSホーム画面。',
};

export default function Home() {
  return <HomeScreen />;
}
