import type { Metadata } from 'next';
import OperationsWorkspace from '@/components/operations-workspace';
export const metadata: Metadata = { title: '接続・利用設定 — RockstarOS' };
export default function SettingsPage() { return <OperationsWorkspace view="settings" />; }
