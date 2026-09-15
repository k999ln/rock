import type { Metadata } from 'next';
import EverythingMarket from '@/components/everything-market';

export const metadata: Metadata = {
  title: 'Market — avocadoOS',
  description: 'あらゆる価値を取引可能な単位にするavocadoOS市場',
};

export default function MarketPage() {
  return <EverythingMarket />;
}
