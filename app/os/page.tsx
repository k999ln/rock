import type { Metadata } from 'next';
import OsHomeEntry from '@/components/os-home-entry';

export const metadata: Metadata = {
  title: 'RockstarOS — ニュースとsmisのタイムライン',
  description: '取得したニュースの元記事リンクをsmisのタイムラインと一緒に表示します。',
};

export default function OsHomePage() {
  return <OsHomeEntry />;
}
