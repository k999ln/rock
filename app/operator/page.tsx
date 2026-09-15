import type { Metadata } from 'next';
import OperatorConsole from '@/components/operator-console';

export const metadata: Metadata = { title: '運営管理 — avocadoOS' };

export default function OperatorPage() {
  return <OperatorConsole />;
}
