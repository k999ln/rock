import type { Metadata } from 'next';
import Link from 'next/link';
import fixture from '@/contracts/sky-compute-grid-fixture.json';
import { runComputeGridFixture } from '@/lib/sky-compute-grid';
import SkyNavigation from '@/components/sky-navigation';
import WorkspaceShell from '@/components/workspace-shell';
import styles from './sky-compute-grid.module.css';

type FixtureInput = Parameters<typeof runComputeGridFixture>[0];

export const metadata: Metadata = {
  title: 'Compute Grid — Sky',
  description: '使っていないAndroid端末の計算余力を、安全な固定ロットへ割り当てるSky Compute Grid。この画面は合成fixtureの表示。',
};

const labels: Record<string, string> = {
  device_in_use: '端末の使用中',
  region_not_allowed: '許可地域の外',
  thermal_limit: '温度上限',
  metered_network: '従量通信',
  price_above_cap: '上限単価超過',
};

export default function SkyComputeGridPage() {
  const result = runComputeGridFixture(fixture as unknown as FixtureInput);
  const lease = result.match.leases[0];
  return (
    <div className={styles.frame}>
      <WorkspaceShell title="Sky Compute Grid" tone="sky" hideTopActions contentClassName={styles.shell}>
        <SkyNavigation active="compute" />
        <article className={styles.page}>
          <header className={styles.hero}>
            <p className={styles.eyebrow}>VIRTUAL COMPUTE PLANT · HOST FIXTURE</p>
            <h1>眠っているAndroidを、ひとつの計算所に。</h1>
            <p>充電中・未使用・Wi-Fi接続中の端末へ、短く中断可能な固定ロットだけを配ります。買い手には所有者や正確な場所を見せません。</p>
            <div className={styles.badges}>
              <span>合成データ</span><span>固定モデル</span><span>任意コードなし</span><span>実送金なし</span>
            </div>
          </header>

          <section className={styles.flow} aria-label="Compute Gridの流れ">
            {[
              ['01', '供給', `${fixture.offers.length}台が余力を提示`],
              ['02', '照合', `${lease.lots.length}ロットを${lease.region}へ割当`],
              ['03', '照合', `${result.verification.verifiedLots}ロットをfixtureの参照hashと照合`],
              ['04', '精算候補', `${result.settlement.amountMicros.toLocaleString()} µcreditsを保留`],
            ].map(([number, title, detail]) => (
              <div key={number}><span>{number}</span><strong>{title}</strong><p>{detail}</p></div>
            ))}
          </section>

          <div className={styles.grid}>
            <section className={styles.card}>
              <header><div><p>MATCH</p><h2>今回の割当</h2></div><span className={styles.ok}>FIXTURE MATCH</span></header>
              <dl>
                <div><dt>実行端末</dt><dd>{lease.providerPseudonym}</dd></div>
                <div><dt>地域</dt><dd>{lease.region}</dd></div>
                <div><dt>SKU</dt><dd>{lease.skuId}</dd></div>
                <div><dt>ロット</dt><dd>{lease.lots.length}</dd></div>
                <div><dt>予約額</dt><dd>{result.match.reservedMicros.toLocaleString()} µ test credits</dd></div>
              </dl>
            </section>

            <section className={styles.card}>
              <header><div><p>CHECK</p><h2>計算メーター</h2></div><span className={styles.hold}>FIXTURE CONSISTENT</span></header>
              <ul className={styles.lots}>
                {lease.lots.map((lot) => <li key={lot.lotId}><div><strong>{lot.lotId}</strong><span>{lot.inputBytes.toLocaleString()} bytes</span></div><span>fixtureの参照hashと一致</span></li>)}
              </ul>
              <p className={styles.note}>この表示は、用意した合成データ同士が矛盾しないことだけを示します。実端末は計算していません。実際のgridでは、端末が署名した結果を、参照計算または別の提供者の結果との合議で検証します。</p>
            </section>

            <section className={styles.card}>
              <header><div><p>REJECTED</p><h2>割り当てなかった端末</h2></div></header>
              <ul className={styles.rejections}>
                {result.match.rejectedOffers.map((offer) => <li key={offer.offerId}><strong>{offer.offerId}</strong><span>{offer.reasons.map((reason) => labels[reason] ?? reason).join('・')}</span></li>)}
              </ul>
            </section>

            <section className={styles.card}>
              <header><div><p>BOUNDARY</p><h2>今はしないこと</h2></div><span className={styles.hold}>HOLD</span></header>
              <ul className={styles.boundaries}>
                <li>iPhoneを供給端末にしない</li>
                <li>端末へコードを配らない（審査済みの計算種別だけ）</li>
                <li>他の人の端末へ個人情報・秘密を配らない</li>
                <li>端末使用中・高温・従量通信では開始しない</li>
                <li>未検証結果をWallet収益にしない</li>
                <li>本人承認なしでcloudへ切り替えない</li>
              </ul>
            </section>
          </div>

          <section className={`${styles.card} ${styles.status}`} aria-label="Compute Gridの現在地">
            <header><div><p>STATUS</p><h2>現在地</h2></div><span className={styles.hold}>実端末は未接続</span></header>
            <dl>
              <div><dt>この画面</dt><dd>合成fixture。端末も注文も実在しません。</dd></div>
              <div><dt>実装済み・既定で無効</dt><dd>注文の保存、端末の署名付き要求、割当、期限切れの再割当、検証、クレジット台帳とAPI。環境設定で有効にした時だけ動きます。</dd></div>
              <div><dt>最初に有効にする範囲</dt><dd>自分のアカウントの端末だけで組むプール。他の人の端末を使う公開プールは別の受入です。</dd></div>
              <div><dt>今動く計算種別</dt><dd>文字n-gramの字句embedding（整数演算）。意味を扱う本格的なモデルは端末側エンジンの選定後です。</dd></div>
              <div><dt>未着手</dt><dd>Android worker、実機での計算、熱・電力の実測、クレジットの利用先、実課金・払出し。</dd></div>
            </dl>
          </section>

          {/* A <section>, not <footer>: the global footer rule (white flex bar) is for the site footer. */}
          <section className={styles.disclaimer} aria-label="クレジットの注意">
            <strong>クレジットはお金ではありません</strong>
            <p>grid内の記帳であり、換金も他サービスへの充当もできません。自分の端末だけのプールでは料金は発生しません。</p>
            <Link href="/api/sky/compute-grid/demo">fixture APIを見る</Link>{' · '}
            <Link href="/api/sky/compute-grid/status">自分のgridの状態を見る</Link>
          </section>
        </article>
      </WorkspaceShell>
    </div>
  );
}
