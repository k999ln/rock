import type { Metadata } from 'next';
import RockStudio from '@/components/rock-studio';

export const metadata: Metadata = {
  title: 'Rock Studio — Smithコードをツールへ追加',
  description:
    'Smith SDKコードを既存ツールへ追加し、PCのSmithへ自動検出。公開URLがある場合は登録と匿名利用記録にも対応します。',
};

export default function SkyPublishPage() {
  return <RockStudio />;
}
