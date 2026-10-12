import type { Metadata } from 'next';
import { SkyPurchases } from '@/components/sky-commerce';

export const metadata: Metadata = {
  title: '購入したツール — Sky Market',
  description: '購入したAI・自動化ツールの支払い状況と接続先を確認する。',
};

export default function SkyPurchasesPage() {
  return <SkyPurchases />;
}
