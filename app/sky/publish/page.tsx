import type { Metadata } from 'next';
import RockStudio from '@/components/rock-studio';

export const metadata: Metadata = {
  title: 'Skyにツールを掲載',
  description:
    '自動化ツールの必要情報を入力し、Skyの接続・安全確認へ申請します。',
};

export default function SkyPublishPage() {
  return <RockStudio />;
}
