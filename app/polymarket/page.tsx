import type { Metadata } from 'next';
import PolymarketWorkspace from '@/components/polymarket-workspace';

export const metadata: Metadata = {
  title: 'RockstarOS Markets — 市場分析アダプター',
};

export default function PolymarketPage() {
  return <PolymarketWorkspace />;
}
