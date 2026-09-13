import type { Metadata } from 'next';
import RevenueWalletWorkspace from '@/components/revenue-wallet-workspace';
import './wallet.css';
import './revenue-wallet.css';

export const metadata: Metadata = { title: 'Wallet — RockstarOS' };

export default function WalletPage() {
  return <RevenueWalletWorkspace />;
}
