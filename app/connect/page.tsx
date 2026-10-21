import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, CircleHelp, RadioTower, Smartphone } from 'lucide-react';
import styles from '@/components/sky-commerce.module.css';
import { RockstarEntitlementClaim } from '@/components/rockstar-entitlement-claim';

export const metadata: Metadata = {
  title: 'RockstarOSをはじめる',
  description: 'アカウントでのWeb・アプリ利用、端末の接続、既存の購入権を確認する方法を案内します。',
};

const steps = [
  ['アカウントでサインインする', 'いまのブラウザや対応アプリから利用します。Web版を使うためにSIM/eSIMを購入する必要はありません。'],
  ['Skyで利用できるToolを選ぶ', 'Skyで機能と利用条件を確認し、Zemaへ依頼を渡します。購入済みサービスの署名済み購入claimがある場合だけ、下の登録からRockstar IDへ利用権を結び付けます。'],
  ['端末で開いて、仕事を依頼する', '確認済み端末だけRockstarOS導入へ進み、その他は既存OSのアプリまたはブラウザを使います。見積と上限を承認したCloud作業は端末がオフラインでも続き、再接続後に進捗・結果・明細を受け取れます。'],
];

export default function ConnectPage() {
  return <main className={styles.shell}>
    <div className={styles.page}>
      <Link href="/" className={styles.back}>RockstarOS Homeへ戻る</Link>
      <header className={styles.header}>
        <div><span className={styles.eyebrow}>ROCKSTAROS SERVICE ACCESS</span>
          <h1>RockstarOSへの接続をはじめる</h1>
          <p>アカウントひとつでWeb・アプリから利用できます。SIM/eSIMの購入は不要です。端末との接続や、すでに持っている購入権はこの画面で確認できます。</p>
        </div>
      </header>
      <section className={styles.esimCatalog} aria-labelledby="service-reasons">
        <div className={styles.esimCatalogTitle}>
          <h2 id="service-reasons"><RadioTower size={18} /> このサービスでできること</h2>
        </div>
        <ul>
          <li><CheckCircle2 size={16} />クラウドLLMとAgentへすばやくアクセス</li>
          <li><CheckCircle2 size={16} />実行前見積、利用中の支出、完了後の項目別明細</li>
          <li><CheckCircle2 size={16} />RockstarOS HomeからSky、Zema、Agentを共通ログインで利用</li>
        </ul>
      </section>
      <section className={styles.esimCatalog} aria-labelledby="onboarding-steps">
        <div className={styles.esimCatalogTitle}>
          <h2 id="onboarding-steps"><Smartphone size={18} /> 利用開始の流れ</h2>
        </div>
        <ol>{steps.map(([title, description], index) => <li key={title}>
          <strong>{index + 1}. {title}</strong><p>{description}</p>
        </li>)}</ol>
      </section>
      <section className={styles.esimCatalog} aria-labelledby="addon-entry">
        <div className={styles.esimCatalogTitle}><h2 id="addon-entry">いまの端末に機能を追加する</h2><p>Sky・データ回収・LLMを、対応ブラウザーのホームから利用できます。</p></div>
        <Link className={styles.esimPlanCard} href="/add"><strong>追加する機能を選ぶ</strong><span>Sky・データ回収・LLM →</span></Link>
      </section>
      <section className={styles.esimCatalog} aria-labelledby="esim-cloud-entry">
        <div className={styles.esimCatalogTitle}>
          <h2 id="esim-cloud-entry">既存のeSIM・クラウドアクセスを確認する</h2>
          <p>すでに対象商品の購入記録がある場合は、購入履歴から導入状況、キーの期限、再発行、停止を確認できます。新しい消費者向けeSIMの発行・販売は現在保留中です。</p>
          <p>対応する提供元・プラン・端末の受入が必要です。SIMは対応機器の任意の通信手段で、OSを保存・導入するものではありません。</p>
        </div>
        <Link className={styles.esimPlanCard} href="/sky/purchases"><strong>購入履歴でeSIMとアクセスキーを確認</strong><span>導入・クラウド接続・キー管理 <ArrowRight size={15} /></span></Link>
      </section>
      <RockstarEntitlementClaim />
      <section className={styles.esimCatalog} aria-labelledby="device-account-link">
        <div className={styles.esimCatalogTitle}>
          <h2 id="device-account-link">RockstarOS端末のアカウント接続</h2>
          <p>端末に表示された一時コードをこのRockstar IDで承認すると、端末専用セッションでSky、Zema、クラウド作業へ接続できます。接続後はいつでも取り消せます。</p>
        </div>
        <Link className={styles.esimPlanCard} href="/connect/device"><strong>端末コードを承認・管理する</strong><span>ログインと端末接続をひとつのRockstar IDにまとめる <ArrowRight size={15} /></span></Link>
      </section>
      <section className={styles.esimCatalog} aria-labelledby="service-entry-points">
        <div className={styles.esimCatalogTitle}>
          <h2 id="service-entry-points">利用開始後の主な入口</h2>
          <p>Agentへの依頼、作業の進捗・成果、料金見積と利用明細をRockstar IDで確認できます。見積や実行料金が確認できない場合は、有料実行を開始しません。</p>
        </div>
        <div className={styles.esimPlanList}>
          <Link className={styles.esimPlanCard} href="/sky"><strong>Sky — Agentとツールを探す</strong><span>利用可能なAgentや接続先を確認します <ArrowRight size={15} /></span></Link>
          <Link className={styles.esimPlanCard} href="/chat"><strong>Jennifer — 目的を相談する</strong><span>Goalを整理し、担当siとZemaの仕事につなぎます <ArrowRight size={15} /></span></Link>
          <Link className={styles.esimPlanCard} href="/work"><strong>Agent Workbench — 依頼・進捗・費用</strong><span>Agentを選んで依頼し、見積・上限・実行状態・成果・利用明細を確認します <ArrowRight size={15} /></span></Link>
        </div>
      </section>
      <section className={styles.esimCatalog} aria-labelledby="availability">
        <div className={styles.esimCatalogTitle}>
          <h2 id="availability"><CircleHelp size={18} /> 現在の提供状況</h2>
          <p>販売チャネル共通の購入claim発行と利用開始は準備中です。物理SIM/eSIMは通信事業者・Rockstar直販・端末販売店・オンライン販売などの購入チャネルから提供し、商品にRockstarOSサービス利用権を含めます。署名claimを一つのRockstar IDへ結ぶローカル基盤は実装済みですが、販売元契約・鍵配備・購入との連携は未接続です。</p>
        </div>
        <div className={styles.esimPlanList}>
          <div className={styles.esimPlanCard}><strong>購入・通信開通</strong><span>購入チャネルと通信事業者が提供します。回線状態はRockstarOSサービス利用権とは別に確認します。</span></div>
          <div className={styles.esimPlanCard}><strong>RockstarOSサービス利用権</strong><span>Sky・Zema・Agentは同じアカウントで利用します。既存の購入claimがある場合は、その利用権を確認します。</span></div>
          <div className={styles.esimPlanCard}><strong>端末への導入</strong><span>対応機種は署名済みOS、それ以外は既存OSのアプリまたはブラウザを使います。</span></div>
          <Link className={styles.esimPlanCard} href="/sky"><strong>Skyを開く</strong><span> AgentやToolを探す <ArrowRight size={15} /></span></Link>
          <Link className={styles.esimPlanCard} href="/chat"><strong>Jenniferを開く</strong><span> 相談・進捗・成果をまとめて確認する <ArrowRight size={15} /></span></Link>
        </div>
        <p className={styles.esimDeviceNote}>物理SIMの流通、eSIM開通、アカウントへの購入権連携、実請求、各端末でのOS/client導入は、それぞれ契約・実機受入が必要です。eSIMプランカタログは契約・販売条件の調査用で、RockstarOSサービスの購入窓口ではありません。</p>
        <Link className={styles.back} href="/sky/esim">eSIM対応プランの技術・提供条件を見る（調査用カタログ）</Link>
      </section>
    </div>
  </main>;
}
