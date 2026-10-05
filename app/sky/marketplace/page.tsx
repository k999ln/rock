import type { Metadata } from 'next';
import SkyMarketplace from '@/components/sky-marketplace';

export const metadata: Metadata = {
  title: 'AI・自動化ツール マーケット — Sky',
  description: 'SkyのAI・自動化ツールを探し、実行条件と接続状態を確認する。',
};

export default async function SkyMarketplacePage({
  searchParams,
}: {
  searchParams: Promise<{ package?: string | string[] }>;
}) {
  const params = await searchParams;
  const value = Array.isArray(params.package) ? params.package[0] : params.package;
  return <SkyMarketplace initialPackageKey={typeof value === 'string' ? value.slice(0, 256) : null} />;
}
