import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowUpRight, ArrowRight, CircleHelp, Cable, Layers, Smartphone } from 'lucide-react';
import WorkspaceShell from '@/components/workspace-shell';
import { RockstarEntitlementClaim } from '@/components/rockstar-entitlement-claim';
import { DeviceConnection } from '@/components/device-connection';
import styles from '@/components/connection-workspace.module.css';
import legacy from '@/components/sky-commerce.module.css';
export const metadata: Metadata = {
  title:'接続 — RockstarOS',
  description:'アカウント、端末、AgentとToolの接続を確認します。',
};
const steps = [
  ['アカウントでサインインする', 'いまのブラウザや対応アプリから利用します。Web版を使うためにSIM/eSIMを購入する必要はありません。'],
  ['smisで利用できるToolを選ぶ', 'smisで機能と利用条件を確認し、Eveへ依頼を渡します。購入済みサービスの署名済み購入claimがある場合だけ、下の登録からRockstar IDへ利用権を結び付けます。'],
  ['端末で開いて、仕事を依頼する', '確認済み端末だけRockstarOS導入へ進み、その他は既存OSのアプリまたはブラウザを使います。見積と上限を承認したCloud作業は端末がオフラインでも続き、再接続後に進捗・結果・明細を受け取れます。'],
];

export default function ConnectPage() {
  return <WorkspaceShell title="接続" hideTopActions hideAccountAccess>
    <div className={styles.page}>
      <header className={styles.heading}><span>YOUR ENVIRONMENT</span><h1>利用環境をつなぐ</h1><p>使う端末と能力を選び、Eveで仕事を始める準備を。</p><p>Web・対応アプリは同じアカウントで利用できます。Web版を使うためにSIM/eSIMを購入する必要はありません。</p></header>
      <section className={styles.start} aria-labelledby="connect-start"><h2 id="connect-start">何をつなぎますか？</h2><div className={styles.cards}>
        <Link href="/connect/device"><Smartphone size={25}/><strong>端末をつなぐ</strong><span>端末の8文字コードを確認し、本人の接続として承認・管理します。</span><b>端末コードを確認 <ArrowUpRight size={17}/></b></Link>
        <Link href="/#sky"><Layers size={25}/><strong>Agent・Toolを追加</strong><span>必要な能力を探し、送信先・利用条件を確認して追加します。</span><b>能力を探す <ArrowUpRight size={17}/></b></Link>
      </div></section>
      <section id="capabilities" className={styles.panel}><h2>追加した接続を確認する</h2><p>接続を追加しただけでは、仕事は実行されません。Eveで担当・実行先・権限・費用上限を確認します。</p><nav aria-label="接続後の操作"><Link href="/os/sky/network">サービス接続・権限を確認 <ArrowUpRight size={17}/></Link><Link href="/#sky-manage">担当・モデル・接続を管理 <ArrowUpRight size={17}/></Link><Link href="/os/eve">Eveで依頼を準備 <ArrowUpRight size={17}/></Link><Link href="/account?returnTo=%2Fconnect%2Fservice">アカウントを確認 <ArrowUpRight size={17}/></Link></nav></section>
      <details className={styles.panel}><summary><Cable size={20}/> このPCのMCP接続を設定</summary><p>既存の接続アプリを使う場合はこちら。起動・送信先・許可を確認して接続します。</p><DeviceConnection/></details>
      <details className={styles.panel} open><summary>購入済みのサービス・利用権を確認</summary><p>対象商品の署名済み購入claimがある場合だけRockstar IDへ結び付けます。新しい消費者向けeSIMの発行・販売は現在保留中です。SIMは対応端末の通信手段で、OSを保存するものではありません。</p><Link href="/sky/purchases">購入履歴・アクセスキーを確認 <ArrowUpRight size={17}/></Link><RockstarEntitlementClaim /></details>
<details className={styles.panel}><summary>利用開始とサービス提供の条件</summary>      <section className={legacy.esimCatalog} aria-labelledby="onboarding-steps">
        <div className={legacy.esimCatalogTitle}>
          <h2 id="onboarding-steps"><Smartphone size={18} /> 利用開始の流れ</h2>
        </div>
        <ol>{steps.map(([title, description], index) => <li key={title}>
          <strong>{index + 1}. {title}</strong><p>{description}</p>
        </li>)}</ol>
      </section>
      <section className={legacy.esimCatalog} aria-labelledby="service-entry-points">
        <div className={legacy.esimCatalogTitle}>
          <h2 id="service-entry-points">利用開始後の主な入口</h2>
          <p>Agentへの依頼、作業の進捗・成果、料金見積と利用明細をRockstar IDで確認できます。見積や実行料金が確認できない場合は、有料実行を開始しません。</p>
        </div>
        <div className={legacy.esimPlanList}>
          <Link className={legacy.esimPlanCard} href="/sky"><strong>smis — Agentとツールを探す</strong><span>利用可能なAgentや接続先を確認します <ArrowRight size={15} /></span></Link>
          <Link className={legacy.esimPlanCard} href="/os/eve"><strong>Eve — 目的を相談する</strong><span>目的を整理し、Eveの仕事につなぎます <ArrowRight size={15} /></span></Link>
          <Link className={legacy.esimPlanCard} href="/work"><strong>Agent Workbench — 依頼・進捗・費用</strong><span>Agentを選んで依頼し、見積・上限・実行状態・成果・利用明細を確認します <ArrowRight size={15} /></span></Link>
        </div>
      </section>
      <section className={legacy.esimCatalog} aria-labelledby="availability">
        <div className={legacy.esimCatalogTitle}>
          <h2 id="availability"><CircleHelp size={18} /> 現在の提供状況</h2>
          <p>販売チャネル共通の購入claim発行と利用開始は準備中です。物理SIM/eSIMは通信事業者・Rockstar直販・端末販売店・オンライン販売などの購入チャネルから提供し、商品にRockstarOSサービス利用権を含めます。署名claimを一つのRockstar IDへ結ぶローカル基盤は実装済みですが、販売元契約・鍵配備・購入との連携は未接続です。</p>
        </div>
        <div className={legacy.esimPlanList}>
          <div className={legacy.esimPlanCard}><strong>購入・通信開通</strong><span>購入チャネルと通信事業者が提供します。回線状態はRockstarOSサービス利用権とは別に確認します。</span></div>
          <div className={legacy.esimPlanCard}><strong>RockstarOSサービス利用権</strong><span>smis・Eve・Agentは同じアカウントで利用します。既存の購入claimがある場合は、その利用権を確認します。</span></div>
          <div className={legacy.esimPlanCard}><strong>端末への導入</strong><span>対応機種は署名済みOS、それ以外は既存OSのアプリまたはブラウザを使います。</span></div>
          <Link className={legacy.esimPlanCard} href="/sky"><strong>smisを開く</strong><span> AgentやToolを探す <ArrowRight size={15} /></span></Link>
          <Link className={legacy.esimPlanCard} href="/os/eve"><strong>Eveを開く</strong><span> 相談・進捗・成果をまとめて確認する <ArrowRight size={15} /></span></Link>
        </div>
        <p className={legacy.esimDeviceNote}>物理SIMの流通、eSIM開通、アカウントへの購入権連携、実請求、各端末でのOS/client導入は、それぞれ契約・実機受入が必要です。eSIMプランカタログは契約・販売条件の調査用で、RockstarOSサービスの購入窓口ではありません。</p>
        <Link className={legacy.back} href="/sky/esim">eSIM対応プランの技術・提供条件を見る（調査用カタログ）</Link>
      </section>
</details>
      <aside className={styles.note}><strong>接続に困ったら</strong><p>端末のコードと期限を確認して再試行してください。接続状態が不明な場合は、承認や解除を繰り返す前に、端末側と「接続中の端末」を確認します。</p><Link href="/settings">設定へ戻る</Link> · <Link href="/rockstaros/guide">使い方と対応環境</Link></aside>
    </div>
  </WorkspaceShell>;
}
