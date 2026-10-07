import type { Metadata } from 'next';
import RockstarAddons from '@/components/rockstar-addons';
export const metadata: Metadata = { title: '機能を追加 — RockstarOS' };
export default function AddPage() { return <RockstarAddons />; }
