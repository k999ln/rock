import type { Metadata } from 'next';
import OperationsWorkspace from '@/components/operations-workspace';
export const metadata: Metadata = { title: 'Wallet・収支の記録 — RockstarOS' };
export default function WalletPage() { return <OperationsWorkspace view="wallet" />; }
