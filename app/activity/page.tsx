import type { Metadata } from 'next';
import OperationsWorkspace from '@/components/operations-workspace';
export const metadata: Metadata = { title: 'ツールの実行履歴 — RockstarOS' };
export default function ActivityPage() { return <OperationsWorkspace view="activity" />; }
