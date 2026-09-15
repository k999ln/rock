import type { Metadata } from 'next';
import SkyWorkspace from '@/components/sky-workspace';

export const metadata: Metadata = {
  title: 'Sky — avocadoOS',
  description: '自動化アプリを探し、確認して、接続する。',
};

export default function SkyPage() {
  return <SkyWorkspace />;
}
