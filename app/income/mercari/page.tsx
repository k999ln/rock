import type { Metadata } from 'next';
import MercariRevenueStarter from '@/components/mercari-revenue-starter';
import './mercari.css';

export const metadata: Metadata = {
  title: 'メルカリ収益スターター — RockstarOS',
  description: '出品準備から検証済み収益までを安全に管理するSkyツール。',
};

export default function MercariRevenuePage() {
  return <MercariRevenueStarter />;
}
