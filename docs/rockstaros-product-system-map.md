# RockstarOS 製品・サービス・システム関係図

版: 2.0 / 2026-10-13 / サービス設計の再構成

**主商品は、無料avokadoアカウントひとつでSky・Zema・si Agentを使い、成果を仕事・創作・ゲーム・生活へ持ち帰るサービス。** 最新確定は[2026-10-10のアカウント方針](product-baseline.md)。SIM/eSIM購入を利用開始の必須条件に戻さない。新しい説明の全体は[サービス統合設計](service-design/README.md)を先に読む。

## 利用者が出会うもの

Jenniferは利用者が話す全体の統括窓口。Skyは能力を見つけて接続する場所。ZemaはJenniferの裏で依頼・進捗・確認・停止・成果・使用額を管理する仕事system。RockstarOSは本人、有限権限、実行、保存、復旧を守る共通runtimeと、対応機種向けnative OSである。

Miniは身体・手・日本語音声による独立空間端末、ProはNVIDIAのGPU/chipを使う独立高性能si PC（PCゲームも保持）、rocketstarは独立した衛星輸送・回収・再使用の工学program。JennifferのGit表記はJennifer。[JenniferのGit正本](https://github.com/k999ln/rock/blob/3349c2475468443bc7ecd94a4e3782343f514a8f/docs/jennifer-coordination.md)はPR #113からmainへ統合済み（`01d2e418`）。Jevとは別system。

```mermaid
flowchart TB
  U[本人の目的] --> ACCOUNT[無料avokado account / 対応するゲスト下書き]
  ACCOUNT --> JENNIFER[Jennifer 目的・Goal・担当si・成果受領]
  JENNIFER --> SKY[Sky 発見・購入・接続]
  JENNIFER --> ZEMA
  SKY --> ZEMA[Zema 仕事・確認・停止・成果]
  SKY -. 対応アプリでの利用 .-> APP[仕事・創作・Game・生活アプリ]
  ZEMA --> AMC[AMC 分解・専門担当・検収]
  AMC --> CORE[RockstarOS Core / Broker]
  ZEMA --> CORE
  APP --> CORE
  CORE --> EXEC[端末内 / 本人PC / cloud / self-host]
  EXEC --> RESULT[Artifact・Receipt・usage]
  RESULT --> ZEMA
  RESULT --> APP
  WALLET[Wallet / Commerce 購入・費用・金融記録の照合] <--> CORE
  MINI[Mini R5 単独空間端末] --> CORE
  PRO[Pro 単独si・ゲームPC] --> CORE
  MINI <-. 任意の許可済み接続 .-> PRO
  RS[rocketstar 専用地上Gateway] -. 工程・観測・記録 .-> CORE
  FLIGHT[独立機上制御・飛行安全系] -->|観測だけ| RS
```

矢印は到達設計の責任と接続契約。全接続・同じDB・cross-origin認証を完成済みとは扱わない。LLM/Tool/画面は権限を決めず、Brokerが本人とexactな条件を検査する。

## 入口の設計

- 通常URL、Web/PWA、既存OS clientから同じサービスへ入る。Skyの目標URLは `https://avocadomini.si/sky`、本人確認は自前passkey、通知はWeb Pushを先に作る確定方針。実装・公開・復旧は個別受入。
- NFC/QRはSkyへのHTTPS URL。mainはColumbia英語の出典整理・AMC・特許アシスタントを先に扱う。NFCから本人性・学生資格・利用権を作らない。5大学共用候補は元作業コピーと比較して受け入れる。
- native OSは正確な機種へ署名済みimage、boot、権限、保存、復旧が合格した時だけ案内する。Pixel試験APK、QEMU、browserをfull OSへ換算しない。
- consumer eSIM発行/販売は保留。Miniの国内LTE/IoT data SIMは任意通信optionで、回線なしMiniも保持する。回線・service entitlement・本人・OS/client導入は独立状態。

Jenniferの会話方式は共通だが、社内portfolioと一般利用者の案件は別の認証/保存領域。Sky直接操作・host appも同じZema仕事へ接続し、会話画面への迂回を必須にしない。記録正本、参照ID、予算階層、停止/精算/削除は[横断整合契約](service-design/06-consistency-contracts.md)へ固定する。

## 実行と成果の流れ

本人の依頼→JenniferのGoal整理→SkyのTool/Agent選択→裏側Zema/AMCまたは対応アプリで条件確認→Coreで本人/版/権限/見積/上限を再検査→adapter実行→結果schema/receipt照合→成果保存→本人検収/取得→項目別usage/決済照合。

仕事状態は既存Webの`active/review/completed/cancelled`を使う。承認待ち・通信待ち・外部結果不明は子処理と画面の状態で説明する。保存応答が不明なら同じIDを照合し、自動再送しない。親の取消と外部停止確認は別である。

外部納品・公開・課金・実資金・物理作用・飛行は、生成やファイル取得と別の承認/受入。Game交換、作者SDK、Material digital twin、Wallet/ファンドの既存要求を維持する。非金融Game/創作を金融完成待ちにはしない。

## 料金の関係

アカウント無料、期間パス、従量のしきい値後払い・本人月上限、回線つき機器の基本料という[アカウント入口の確定方針](product-baseline.md)を継承する。残高は持たない。商品代・si原価/上乗せ・外部実費・回線・税等を別に説明する。しきい値1,000円は決済時点で、無条件の実行予算ではない。

Tool売上のSky feeは当面10%。0%の定義と切替条件、作者払出しはbaselineへ従う。旧888 cents成功報酬系はexecutionHoldsを維持する。現行funded Wallet gateと後払いの移行契約、passkey、実meter/請求/返金は未受入。文書でpaid gateを解除しない。

## Mr.由来ToolとMR研究を分ける

`Mr.`は固定原本`vendor/mr`をadapterで接続する既存Tool系列。原本とhashを変更せず、adapter変更時に `python3 scripts/package-mr.py` で配布物を更新する。類似名のWeb/Android/native Toolを同一実体と決めつけない。

MRはMixed Realityの表現・入力profile。Material Invention Studioは同じproject/Asset/候補をAR/VR/2D等で扱う研究系で、catalogの単一商品実体と混同しない。R5の全空間裸眼表示と単独mini要求を、旧四方向台・E3の4本/別Hubへ戻さない。

## 正本と詳しい契約

- サービス全体は[統合設計](service-design/README.md)、要望は[baseline](product-baseline.md)と[JSON](../data/product-baseline.json)。
- OS/componentは[全体詳細](rockstaros-complete-design.md)、Toolは[全Tool詳細](sky-tools-complete-design.md)、LLM/Jevは[LLM正本](llm-evaluation-architecture.md)。
- Miniは[R5](avocado-mini-r5/README.md)と[通信option](avocado-mini-cellular.md)、Proは[P0](avokado-pro-pc-design.md)、rocketstarは[R1.0原本](rocketstar-design/README.md)。
- 実現順と未決事項は[受入計画](service-design/04-delivery-and-acceptance.md)、進捗と担当は[project status](../data/project-status.json)と[Mission Control](mission-control.md)。

設計を共有することと、実装・配備・物理端末・本番Providerを合格させることは別である。
