import type { Metadata } from 'next';
import RockStudio from '@/components/rock-studio';

export const metadata: Metadata = {
  title: 'Rock Studio — Skyコードをツールへ追加',
  description:
    'Sky SDKコードを既存ツールへ追加し、PCのSkyへ自動検出。公開URLがある場合は登録と匿名利用記録にも対応します。',
};

export default function RockStudioPage() {
  return <RockStudio />;
}
