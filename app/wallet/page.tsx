import type { Metadata } from 'next';
import WalletWorkspace from '@/components/wallet-workspace';

export const metadata: Metadata = { title: 'Wallet — avocadoOS' };

export default function WalletPage() {
  return <WalletWorkspace />;
}
