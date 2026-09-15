import type { Metadata } from 'next';
import RockStudio from '@/components/rock-studio';

export const metadata: Metadata = {
  title: 'Rock Studio — コードからSky Toolを作成',
  description:
    'コードを貼るかファイルを添付するだけで、Sky Tool Packageを生成してRegistryへ追加します。',
};

export default function RockStudioPage() {
  return <RockStudio />;
}
