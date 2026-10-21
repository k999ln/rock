import type { Metadata } from 'next';
import HomeScreen from '@/components/home-screen';

export const metadata: Metadata = {
  title: 'RockstarOS — ニュースとSkyのタイムライン',
  description: '取得したニュースの元記事リンクをSkyのタイムラインと一緒に表示します。',
};

export default function OsHomePage() {
  return <HomeScreen />;
}
