import type { Metadata } from 'next';
import SkyPayments from '@/components/sky-payments';

export const metadata: Metadata = { title: '支払いと利用明細 — Sky', description: '商品購入とクラウド利用の支払いを確認する。' };
export default function PaymentsPage() { return <SkyPayments />; }
