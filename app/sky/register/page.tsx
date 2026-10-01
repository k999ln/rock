import type { Metadata } from 'next';
import SkyPublisherForm from '@/components/sky-publisher-form';

export const metadata: Metadata = {
  title: 'ツールの掲載申請 — Sky',
  description: 'MCPやAPIの接続先、権限、料金を確認してSkyへの掲載を申請する。',
};

export default function SkyRegisterPage() {
  return <SkyPublisherForm />;
}
