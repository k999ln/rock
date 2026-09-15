import type { Metadata } from 'next';
import SystemMaintenance from '@/components/system-maintenance';

export const metadata: Metadata = { title: 'システム — avocadoOS' };

export default function SystemMaintenancePage() {
  return <SystemMaintenance />;
}
