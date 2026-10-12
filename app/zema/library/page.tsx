import type { Metadata } from 'next';
import SkyLibrary from '@/components/sky-library';
export const metadata: Metadata = { title: 'ライブラリ — Zema' };
export default function ZemaLibraryPage() {
  return <SkyLibrary />;
}
