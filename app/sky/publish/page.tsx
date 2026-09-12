import type { Metadata } from 'next';
import SkyWorkspace from '@/components/sky-workspace';

export const metadata: Metadata = {
  title: 'Skyにツールを掲載',
  description:
    '自動化ツールの必要情報を入力し、Skyの接続・安全確認へ申請します。',
};

export default function SkyPublishPage() {
  return <SkyWorkspace initialPublishOpen />;
}
