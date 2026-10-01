import type { Metadata } from 'next';
import SystemMaintenance from '@/components/system-maintenance';

export const metadata: Metadata = { title: 'システム — RockstarOS' };

export default function SystemMaintenancePage() {
  return <SystemMaintenance />;
}
