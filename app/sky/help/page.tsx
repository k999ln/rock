import type { Metadata } from 'next';
import SkyServiceHelp from '@/components/sky-service-help';

export const metadata: Metadata = {
  title: '使い方とデータの扱い — Sky',
  description: 'Skyの利用方法、接続状態、成果の保存、対応環境と既知の制限。',
};

export default function SkyHelpPage() { return <SkyServiceHelp />; }
