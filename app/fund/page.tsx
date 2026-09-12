import type { Metadata } from 'next';
import Link from 'next/link';
import FundMarket from '@/components/fund-market';

export const metadata: Metadata = { title: 'ファンド試算・旧プラン — RockstarOS' };
export default function FundPage() {
  return <><div className="legacy-return"><Link href="/">← Skyに戻る</Link><span>保存済みのプランと試算 · 実収益・送金は未接続</span></div><FundMarket /></>;
}
