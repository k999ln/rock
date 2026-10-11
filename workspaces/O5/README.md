# O5 — Sky・Zema・Wallet

[作業部屋一覧](../README.md) · [アイデア置き場](../IDEAS.md)

> 自動生成。編集元: data/mission-control.json、data/project-status.json、data/workspaces.json。

**目的:** Tool選択、依頼、進捗、承認、成果、費用、確認済み収益を一つの利用体験にする。

**主担当:** ROCK / **評価対象:** Web Sky/Zema/Walletと非金融の共通Game基盤

## 触る場所・読む資料

- [app/sky/](../../app/sky)
- [app/chat/](../../app/chat)
- [app/work/](../../app/work)
- [app/wallet/](../../app/wallet)
- [app/connect/](../../app/connect)
- [components/home-screen.tsx](../../components/home-screen.tsx)
- [lib/rock-wallet.ts](../../lib/rock-wallet.ts)
- [services/sky-billing/](../../services/sky-billing)
- [docs/rockstaros-product-system-map.md](../../docs/rockstaros-product-system-map.md)
- [docs/sky-billing.md](../../docs/sky-billing.md)
- [docs/workstreams/03-wallet-billing-providers.md](../../docs/workstreams/03-wallet-billing-providers.md)
- [docs/workstreams/09-business-pilots.md](../../docs/workstreams/09-business-pilots.md)
- [docs/sim-led-product-architecture.md](../../docs/sim-led-product-architecture.md)

## 次の作業

- **SKY19**: SkyへToolチーム入口を統合し利益連動成功報酬・Wallet決済・開発者還元を設計（率・月上限等確認中、未実装） — 詳細: `npm run work -- SKY19`

SKY19: 現行の課金停止と旧試験契約を項目ごとに比較する

**実行保留:** ToC収益料金の請求・回収・払出し実行。2026-09-24に料金動線の確定まで保留。設計整理・sandboxの既存試験は継続可能。

解除条件: 本人の明示決定、料金/返金/同意の新契約と対象providerの受入

## 守る条件・残課題

- Tool完了を売上と呼ばない
- 費用と収益を分離する
- LIVE金融は本人署名を必須にする
- 未解決: Pro固有game、全Provider入金、保留中料金は未受入

## 未完了の作業

| task | 作業 | 記録状態 / 分類 | 前提待ち・保留 |
| --- | --- | --- | --- |
| SKY19-01（子） | ToC料金保留と旧888 cents契約の適用差分を整理する | 未着手 / 共通基盤 | 実行保留: ToC収益料金の請求・回収・払出し実行 |
| SKY19-02（子） | SkyのToolチーム入口と利益発生から決済までの利用者動線を定義する | 未着手 / 共通基盤 | SKY19-01 / 実行保留: ToC収益料金の請求・回収・払出し実行 |
| SKY19-03（子） | 対象利益・料率・上限・実費・返金・還元の決定表を作る | 未着手 / 共通基盤 | SKY19-01 / SKY19-02 / 実行保留: ToC収益料金の請求・回収・払出し実行 |
| SKY19-04（子） | 保留中に新規料金計上・請求・回収をしない回帰試験を固定する | 未着手 / 共通基盤 | SKY19-01 / 実行保留: ToC収益料金の請求・回収・払出し実行 |
| SKY19-05（子） | OWNERの料金判断を記録し新契約の受入条件を版固定する | 未着手 / 共通基盤 | SKY19-03 / SKY19-04 / 実行保留: ToC収益料金の請求・回収・払出し実行 |
| SKY19-06（子） | Toolチーム入口・Wallet決済・開発者還元の設計全体をレビューする | 未着手 / 共通基盤 | SKY19-05 / 実行保留: ToC収益料金の請求・回収・払出し実行 |
| SKY19（親） | SkyへToolチーム入口を統合し利益連動成功報酬・Wallet決済・開発者還元を設計（率・月上限等確認中、未実装） | 進行中 / 共通基盤 | 実行保留: ToC収益料金の請求・回収・払出し実行 |
| AI06 | 非金融Game／IP fixtureを共通仕事・限定記憶・Zema進捗へ接続（Fund完成に非依存） | 未着手 / 共通基盤 | AI03 / AI05 |
| MAT03 | Material Invention CoreをZemaの仕事・限定記憶・simulation／外部ラボProviderへ接続して独立受入 | 未着手 / 共通基盤 | AI02 / AI03 |
| WLT06 | owner受取Walletを本人署名で登録し、最初の実USDC回収をEarning Receiptへ照合 | 進行中 / 共通基盤 | BIL02 / 実行保留: ToC収益料金の請求・回収・払出し実行 |
| B02 | 既存商品のSky実利用と不便の改善・実行/料金/権利の条件拡張 | 進行中 / 共通基盤 | — |
| B03 | 実行費用・認証済み収益を既存Walletへ接続し縦断検証 | 進行中 / 共通基盤 | B02 |
| B05 | Wallet連携基礎を使ったSky縦断再試験・PC比較と未実証の端末価値を記録 | 進行中 / 共通基盤 | B02 |
| GX02 | 指定された実ゲームの正式sandbox接続と交換条件を検証 | 未着手 / 共通基盤 | — |
| BIL02 | 有償自動化商品と販売・決済・払出しProvider sandboxを接続し、Earning Receiptから実送金まで受入 | 進行中 / 共通基盤 | 実行保留: ToC収益料金の請求・回収・払出し実行 |
| CSV00 | CSV仕事の35作業を名前空間付きで管理し、コード完成と外部実績gateを分離 | 進行中 / 共通基盤 | — |

<details>
<summary>完了記録のあるtask（当該範囲の記録。製品全体の完成ではありません）</summary>

| task | 作業 | 記録状態 / 分類 | 前提待ち・保留 |
| --- | --- | --- | --- |
| UXCHAR01 | Sky/Zemaの共通キャラアイコンとクリック詳細（役割・現在状態・会話内成果） | 完了記録あり / 共通基盤 | — |
| MAT01 | RQ49 Material Invention Coreのentity・発明loop・安全境界を設計へ固定 | 完了記録あり / 共通基盤 | — |
| MAT02 | 二物質・複数比率・工程条件のsandbox候補graphとfail-closed安全検査を実装 | 完了記録あり / 共通基盤 | — |
| SKY01 | 旧名称をSkyへ全面改称し、選択・許可・実行先・停止・結果を一つにする価値と収録ツールを可視化 | 完了記録あり / 共通基盤 | — |
| SKY04 | tob無料のConnection Passport・実行契約・ToB/ToC貢献分配を一画面で説明するSky Networkフロント | 完了記録あり / 共通基盤 | — |
| SKY05 | Sky画面のsidebarを廃止し、MCP接続・管理とToB掲載をSky本体の操作面へ統合 | 完了記録あり / 共通基盤 | — |
| SKY08 | 黒基調の改善版SkyへFashion Brand Opsを統合し、スマホDialogの画面外ずれを修正 | 完了記録あり / 共通基盤 | — |
| SKY10 | Skyをアプリ選択と接続へ絞り、Chatを依頼・状況・結果の受取画面として分離 | 完了記録あり / 共通基盤 | — |
| SKY12 | ChatをSky Auto既定の一画面へ整理し、事前のアプリ選択を任意化 | 完了記録あり / 共通基盤 | — |
| SKY13 | GrokをモチーフにChatの表示・入力を改善し、依頼から実行・結果までを会話内へ統合 | 完了記録あり / 共通基盤 | — |
| SKY14 | 接続済みready商品と任意MCPをChatのbotとして表示し、方向修正・承認実行・結果・停止を一元管理 | 完了記録あり / 共通基盤 | — |
| SKY16 | SkyのTool選択と自然文依頼をZemaへ一回引き継ぎ、job状態を即時同期 | 完了記録あり / 共通基盤 | — |
| WEB03 | Developer Preview紹介とRock Studioを共通の黒・黄緑visual systemへ統一 | 完了記録あり / 公開説明 | — |
| WEB04 | RockstarOS全体のvisual systemを統一し、主要フロントの機能性を改善 | 完了記録あり / 公開説明 | — |
| WEB10 | 製品・OS導入ホームに各サービスの役割と利用範囲を示す入口を追加 | 完了記録あり / 公開説明 | — |
| WLT01 | Walletの受取予定・収益内訳・Receipt・精算ルールを一画面で確認できるフロントを実装 | 完了記録あり / 共通基盤 | — |
| WLT02 | 本人別の残高・売上・経費・取消履歴をD1へ保存するWallet専用APIと操作画面を実装 | 完了記録あり / 共通基盤 | — |
| WLT03 | Wallet／ファンド会社を交換可能な外部Providerとして受ける責任境界とadapter契約を固定 | 完了記録あり / 共通基盤 | — |
| WLT04 | Rock Settlement Walletを最初のProviderとして自社利用料のsandbox回収契約を実装 | 完了記録あり / 共通基盤 | — |
| WLT05 | Base Mainnet USDCの所有確認付き受取先とfinalized着金照合を本番Wallet・Workerへ接続 | 完了記録あり / 共通基盤 | — |
| MKT01 | あらゆる型付き価値を扱うPAPER市場とexact approval・risk・receipt・position台帳を実装 | 完了記録あり / 共通基盤 | — |
| MKT02 | Web PAPER市場のapproval・reservation・receipt・position関係をD1で強制 | 完了記録あり / 共通基盤 | — |
| SPN01 | native Walletへsimulation/PAPER限定のValue/Spend台帳・exact approval・再照合を統合 | 完了記録あり / 共通基盤 | — |
| FND01 | ツールの検証済み純収益・実費・receipt・失敗から構成と観測利回りを30秒ごとに再計算 | 完了記録あり / 共通基盤 | — |
| HOME01 | iPhone着想のホーム、端末内カスタマイズ、OS運用設定アプリを実装 | 完了記録あり / 共通基盤 | — |
| HOME02 | Home以外の全画面へ直接Homeへ戻る導線を常設し、共通・独自レイアウトの回帰を防止 | 完了記録あり / 共通基盤 | — |
| GX00 | 共通Walletの複数owner/player分離・本人接続・既存台帳互換を設計検証 | 完了記録あり / 共通基盤 | — |
| GX01 | ATMから独立したゲーム交換契約・両台帳fixture・異常系を実装検証 | 完了記録あり / 共通基盤 | — |
| DX01 | ゲーム作者向けAPI/SDK・sandbox・複数owner/game分離と導入体験を検証 | 完了記録あり / 共通基盤 | — |
| FB01 | Instagram運用・受注型ブランド管理をRockstarOS Hub商品とMCPへ統合 | 完了記録あり / 共通基盤 | — |
| FB02 | 売上・数量・粗利・期限からCampaign Autopilotの計画と次アクションを生成 | 完了記録あり / 共通基盤 | — |
| FB03 | DM履歴・購買意向・顧客情報からAI Sales Conciergeと営業パイプラインを生成 | 完了記録あり / 共通基盤 | — |
| FB04 | 入金確認後の制作計画・原価・納期・工程をProduction Cockpitで管理 | 完了記録あり / 共通基盤 | — |
| FB05 | 改善版Skyの役割フィードへブランド運営役と40 MCP操作を統合 | 完了記録あり / 共通基盤 | — |
| FB06 | Instagram画面の写真から未確認候補を作り、Meta確認後だけ運用対象へ進める | 完了記録あり / 共通基盤 | — |
| BIL01 | 旧888 cents収益精算の試験実装を保持し、現行ToC料金は動線確定まで停止 | 完了記録あり / 共通基盤 | — |
| BIL03 | メルカリを最初の収益経路として出品準備・費用計算・承認・未照合売上の安全な状態管理をSkyへ追加 | 完了記録あり / 共通基盤 | — |

</details>

## 検証・引継ぎ

対象のtaskPlanにある合格条件と、関連workstreamの環境別試験を優先します。以下は入口となる確認コマンドです。

```sh
npm run sky:check
npm run billing:check
npm run project:update
npm run mission:update
npm run verify
```

全体受入: Webの依頼・承認・結果・費用を縦断受入する。料金の再開と金融LIVEは、保留解除と個別受入後の別作業。

新しいチャットや担当へ渡すときは、次の一文へtask IDと今回の成果を入れます。

```text
O5 Sky・Zema・Walletの <task ID> を進める。workspaces/O5/README.mdと
npm run work -- <task ID> を読み、最新main・作業branch・未保存差分を確認する。
今回の成果は <一つの成果>。このtaskの範囲で作業し、前提・実行保留・本人承認を維持する。
終わりに変更path、検証結果、残課題、次の一手を残す。新しい思いつきは別に記録する。
```
