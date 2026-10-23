import type { Metadata } from 'next';
import RockStudio from '@/components/rock-studio';

export const metadata: Metadata = {
  title: 'Rock Studio — smisコードをツールへ追加',
  description:
    'smis SDKコードを既存ツールへ追加し、PCのsmisへ自動検出。公開URLがある場合は登録と匿名利用記録にも対応します。',
};

export default function RockStudioPage() {
  return <RockStudio />;
}
