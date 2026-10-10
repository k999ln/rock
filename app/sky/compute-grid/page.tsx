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
  description: '使っていないAndroid端末の計算余力を、安全な固定ロットへ割り当てるSkyのhost fixture。',
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
              ['03', '検証', `${result.verification.verifiedLots}ロットを独立照合`],
              ['04', '精算候補', `${result.settlement.amountMicros.toLocaleString()} µcreditsを保留`],
            ].map(([number, title, detail]) => (
              <div key={number}><span>{number}</span><strong>{title}</strong><p>{detail}</p></div>
            ))}
          </section>

          <div className={styles.grid}>
            <section className={styles.card}>
              <header><div><p>MATCH</p><h2>今回の割当</h2></div><span className={styles.ok}>MATCHED</span></header>
              <dl>
                <div><dt>実行端末</dt><dd>{lease.providerPseudonym}</dd></div>
                <div><dt>地域</dt><dd>{lease.region}</dd></div>
                <div><dt>SKU</dt><dd>{lease.skuId}</dd></div>
                <div><dt>ロット</dt><dd>{lease.lots.length}</dd></div>
                <div><dt>予約額</dt><dd>{result.match.reservedMicros.toLocaleString()} µ test credits</dd></div>
              </dl>
            </section>

            <section className={styles.card}>
              <header><div><p>VERIFY</p><h2>計算メーター</h2></div><span className={styles.ok}>VERIFIED</span></header>
              <ul className={styles.lots}>
                {lease.lots.map((lot) => <li key={lot.lotId}><div><strong>{lot.lotId}</strong><span>{lot.inputBytes.toLocaleString()} bytes</span></div><span>参照出力と一致</span></li>)}
              </ul>
              <p className={styles.note}>端末の自己申告だけでは合格しません。このfixtureは中央の独立参照出力とhashで照合しています。</p>
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
                <li>個人情報・秘密・任意コードを配らない</li>
                <li>端末使用中・高温・従量通信では開始しない</li>
                <li>未検証結果をWallet収益にしない</li>
                <li>本人承認なしでcloudへ切り替えない</li>
              </ul>
            </section>
          </div>

          <footer className={styles.disclaimer}>
            <strong>現在地: synthetic host fixture</strong>
            <p>これはmatching・lease・verification・精算候補の契約試作です。Android worker、実端末cluster、production API、実課金・払出しは未接続です。</p>
            <Link href="/api/sky/compute-grid/demo">fixture APIを見る</Link>
          </footer>
        </article>
      </WorkspaceShell>
    </div>
  );
}
