import type { Metadata } from 'next';
import { SkySeller } from '@/components/sky-commerce';

export const metadata: Metadata = {
  title: 'ツールを販売する — Sky Market',
  description: 'AI・自動化ツールの販売価格、売上の受取先、返金を管理する。',
};

export default function SkySellerPage() {
  return <SkySeller />;
}
