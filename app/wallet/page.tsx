import { SkyFeatureGate } from '@/components/sky-optional-features';
import type { Metadata } from 'next';
import WalletWorkspace from '@/components/wallet-workspace';

export const metadata: Metadata = { title: 'Wallet — RockstarOS' };

export default function WalletPage() {
  return <SkyFeatureGate feature="wallet"><WalletWorkspace /></SkyFeatureGate>;
}
