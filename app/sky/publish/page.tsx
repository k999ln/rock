import type { Metadata } from 'next';
import RockStudio from '@/components/rock-studio';

export const metadata: Metadata = {
  title: 'Rock Studio — Skyコードをツールへ追加',
  description:
    'Sky SDKコードを既存ツールへ追加し、自動登録、MCP公開、匿名利用記録を有効にします。',
};

export default function SkyPublishPage() {
  return <RockStudio />;
}
