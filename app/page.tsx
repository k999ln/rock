import type { Metadata } from 'next';
import HomeScreen from '@/components/home-screen';

export const metadata: Metadata = {
  title: 'ホーム — RockstarOS',
  description:
    'ひとつの意図から、道具と仕事がつながる。RockstarOSのパーソナルスペース。',
};

export default function Home() {
  return <HomeScreen />;
}
