import Link from 'next/link';
import {
  Activity,
  ArrowRight,
  Eye,
  LockKeyhole,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import WorkspaceShell from '@/components/workspace-shell';

export default function PolymarketWorkspace() {
  return (
    <WorkspaceShell title="Polymarket" contentClassName="polymarket-page">
      <section className="polymarket-shell" aria-labelledby="polymarket-title">
        <header className="polymarket-heading">
          <span className="polymarket-mark" aria-hidden="true">
            <Activity size={30} />
          </span>
          <div>
            <p>外部市場アプリ</p>
            <h1 id="polymarket-title">Polymarket</h1>
          </div>
          <span className="polymarket-state">未接続</span>
        </header>

        <div className="polymarket-empty-state">
          <span>
            <LockKeyhole size={27} />
          </span>
          <h2>接続の準備中です</h2>
          <p>市場の閲覧、注文、Walletからの資金移動はまだ開始されません。</p>
        </div>

        <div className="polymarket-boundaries" aria-label="接続前の確認事項">
          <div>
            <Eye size={19} />
            <span>
              <strong>見る</strong>市場情報の読取権限を分離
            </span>
          </div>
          <div>
            <ShieldCheck size={19} />
            <span>
              <strong>取引する</strong>地域・年齢・本人確認後に別同意
            </span>
          </div>
          <div>
            <Wallet size={19} />
            <span>
              <strong>支払う</strong>Walletからの自動移動は無効
            </span>
          </div>
        </div>

        <Link href="/settings" className="polymarket-settings-link">
          接続条件を見る <ArrowRight size={16} />
        </Link>
      </section>
    </WorkspaceShell>
  );
}
