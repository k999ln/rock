import type { Metadata } from 'next';
import Link from 'next/link';
import AutonomousFundMarket from '@/components/autonomous-fund-market';

export const metadata: Metadata = { title: '自動化ファンド — RockstarOS' };
export default function FundPage() {
  return (
    <>
      <div className="legacy-return">
        <nav aria-label="戻る">
          <Link href="/">⌂ ホーム</Link>
          <Link href="/sky">← Skyに戻る</Link>
        </nav>
        <span>自律形成 · 収益料金は動線確定まで保留中</span>
      </div>
      <AutonomousFundMarket />
    </>
  );
}
