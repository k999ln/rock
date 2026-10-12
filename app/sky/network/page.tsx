import type { Metadata } from 'next';
import SkyNetwork from '@/components/sky-network';

export const metadata: Metadata = { title: '接続 — Sky' };

export default function SkyNetworkPage() {
  return <SkyNetwork />;
}
