import type { Metadata } from 'next';
import Link from 'next/link';
import FundMarket from '@/components/fund-market';

export const metadata: Metadata = {
  title: '以前の共同分配試算 — RockstarOS',
};

export default function LegacyFundPage() {
  return (
    <>
      <div className="legacy-return">
        <nav aria-label="戻る">
          <Link href="/">⌂ ホーム</Link>
          <Link href="/fund">← 自動化ファンドに戻る</Link>
        </nav>
        <span>旧試算 · 実収益・送金には使用しません</span>
      </div>
      <FundMarket />
    </>
  );
}
