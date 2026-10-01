import type { Metadata } from 'next';
import SkyMarketplace from '@/components/sky-marketplace';

export const metadata: Metadata = {
  title: 'AI・自動化ツール マーケット — Sky',
  description: 'SkyのAI・自動化ツールを探し、実行条件と接続状態を確認する。',
};

export default function SkyMarketplacePage() {
  return <SkyMarketplace />;
}
