import type { Metadata } from 'next';
import PolymarketWorkspace from '@/components/polymarket-workspace';

export const metadata: Metadata = {
  title: 'Polymarket — RockstarOS',
};

export default function PolymarketPage() {
  return <PolymarketWorkspace />;
}
