import type { Metadata } from 'next';
import SystemSettings from '@/components/system-settings';

export const metadata: Metadata = { title: '設定 — avocadoOS' };

export default function SettingsPage() {
  return <SystemSettings />;
}
