# プロジェクト別ガイド

このページは、`k999ln/rock`の成果物を**製品・実装単位**から探す入口です。確定要望は[製品ベース](docs/product-baseline.md)、現在のtaskと完了条件は[進捗JSON](data/project-status.json)、設計の正本は[全設計ポータル](docs/rockstaros-design-portal.md)を参照してください。ここに書くディレクトリの存在は、実機・本番・販売の受入完了を意味しません。

## 製品・独立した構想

| プロジェクト | 役割 | 最初に開くもの | 実装・素材の場所 |
| --- | --- | --- | --- |
| **avocadoMini** | Tower20 E3の製品構想と専用サイト | [現行E3設計](docs/avocado-mini-tower20-e3/README.md)・[担当作業](docs/workstreams/11-material-invention-avocado-mini.md) | [`sites/avocado-mini/`](sites/avocado-mini/)・[`docs/avocado-mini-tower20-e3/`](docs/avocado-mini-tower20-e3/) |
| **Rocket Star** | avocadoMiniとRockstarOSへ接続する軌道通信の構想。資金受付は準備中 | [構想ページ](sites/avocado-mini/rocket-star/index.html)・[衛星通信の設計追補](docs/avocado-mini-mini200-e1/game-first-life-connectivity.md) | [`sites/avocado-mini/rocket-star/`](sites/avocado-mini/rocket-star/)・[`sites/avocado-mini/public/images/`](sites/avocado-mini/public/images/) |
| **RockstarOS** | AIネイティブOSの共通基盤と配布候補 | [OS全体詳細設計](docs/rockstaros-complete-design.md)・[構成と現在地](docs/system-composition.md) | [`systems/rock-star-os/`](systems/rock-star-os/)・[`contracts/`](contracts/)・[`public-release/rockstaros/`](public-release/rockstaros/) |
| **Webアプリ** | Home、Sky、Zema、Wallet、Studioを一つのWeb/PWAとして提供 | [製品・サービス関係図](docs/rockstaros-product-system-map.md)・[Web担当作業](docs/workstreams/05-web-pwa-sites.md) | [`app/`](app/)・[`components/`](components/)・[`lib/`](lib/)・[`db/`](db/)・[`drizzle/`](drizzle/) |

Rocket Starの`/rocket-star/`はavocadoMiniサイト内の専用ページであり、衛星・受信機・通信網の実装や資金受付の完了を示しません。Sky、Zema、Wallet、Material Invention StudioなどはWebアプリとOS内で使うサービスです。各画面の名称だけで独立した配備物やGitリポジトリを増やしません。avocadoMiniの旧P0.2、Mini200 E1/E2は[現行E3設計](docs/avocado-mini-tower20-e3/README.md)と区別して設計履歴として保持します。

| Web/OS内のサービス | 主なソース | 設計・担当の入口 |
| --- | --- | --- |
| **Sky** — Toolの発見と接続 | [`app/sky/`](app/sky/)・[`app/api/sky/`](app/api/sky/) | [全Tool詳細設計](docs/sky-tools-complete-design.md)・[Sky / MCP](docs/workstreams/02-sky-mcp.md) |
| **Zema** — 依頼、進捗、承認、停止、成果 | [`app/chat/`](app/chat/)・[`components/zema-home-workspace.tsx`](components/zema-home-workspace.tsx)・[`lib/zema-chat-session.ts`](lib/zema-chat-session.ts) | [Platform Core](docs/platform-core.md)・[Product / UX](docs/workstreams/01-product-ux.md) |
| **Wallet** — 費用と確認済み収益 | [`app/wallet/`](app/wallet/)・[`lib/rock-wallet.ts`](lib/rock-wallet.ts) | [Wallet / Billing / Providers](docs/workstreams/03-wallet-billing-providers.md) |
| **Material Invention Studio** — 発明候補の操作・比較 | [`app/studio/`](app/studio/)・[`lib/material-invention.ts`](lib/material-invention.ts)・[`contracts/material-invention.json`](contracts/material-invention.json) | [Material Invention Core](docs/material-invention-core.md)・[担当作業](docs/workstreams/11-material-invention-avocado-mini.md) |
| **Market / Polymarket** — 市場の検討とPAPER試験 | [`app/market/`](app/market/)・[`app/polymarket/`](app/polymarket/) | [Game / Market / Fund](docs/workstreams/08-game-market-fund.md)・[市場検討](docs/market-exploration-20260909.md) |
| **Fund** — 検証済み実績に基づく構想と試算 | [`app/fund/`](app/fund/)・[`lib/rock-wallet.ts`](lib/rock-wallet.ts) | [Game / Market / Fund](docs/workstreams/08-game-market-fund.md)・[ファンド統合](docs/markets-fund-integration-20260913.md) |
| **CSV業務** — データ整形の事業pilot | [`app/csv/`](app/csv/) | [Business Pilots](docs/workstreams/09-business-pilots.md)・[CSV業務](docs/csv-business-v1.ja.md) |
| **メルカリ収益ループ** — 出品から入金確認までの事業pilot | [`app/income/mercari/`](app/income/mercari/)・[`lib/mercari-revenue.ts`](lib/mercari-revenue.ts) | [Business Pilots](docs/workstreams/09-business-pilots.md)・[メルカリ設計](docs/mercari-revenue-loop.md) |

## 実装・配備単位

| 単位 | 対象と境界 | ソース | 担当・検証の入口 |
| --- | --- | --- | --- |
| **Linux / QEMU Developer Preview** | native OS、Tool実行、更新・復旧。Android imageとは別系列 | [`systems/rock-star-os/`](systems/rock-star-os/) | [native README](systems/rock-star-os/README.md)・[Native / QEMU / Release](docs/workstreams/06-native-qemu-release.md) |
| **Android / Pixel Device Preview** | AOSP、Shell、Broker、端末内AI、Pixel 10向け受入 | [`android/`](android/)・[`os/`](os/) | [Android / Device / Local AI](docs/workstreams/07-android-device-local-ai.md)・[端末preview](docs/phone-preview-20260911.md) |
| **avocadoMini製品サイト** | 製品紹介、導入案内、販売準備の独立Site | [`sites/avocado-mini/`](sites/avocado-mini/) | [現行E3設計](docs/avocado-mini-tower20-e3/README.md)・[Material Invention / avocadoMini](docs/workstreams/11-material-invention-avocado-mini.md) |
| **Operator Dock** | OS利用画面と分離した運営用の端末管理 | [`services/operator-dock/`](services/operator-dock/)・[`android/operator-agent/`](android/operator-agent/) | [Dock README](services/operator-dock/README.md)・[Security / Identity](docs/workstreams/04-security-identity-compliance.md) |
| **Sky Billing** | 収益・費用の照合と請求Worker。Walletの実資金受入とは別 | [`services/sky-billing/`](services/sky-billing/) | [Wallet / Billing / Providers](docs/workstreams/03-wallet-billing-providers.md)・[請求設計](docs/sky-billing.md) |
| **Sky Tool SDK** | Tool作者向けのpackage、サンプル、契約 | [`toolkits/sky-tool-sdk/`](toolkits/sky-tool-sdk/) | [SDK README](toolkits/sky-tool-sdk/README.md)・[Sky / MCP](docs/workstreams/02-sky-mcp.md) |
| **Sky MCP Connector** | MCP接続先と権限を管理する独立connector | [`toolkits/sky-mcp-connector/`](toolkits/sky-mcp-connector/) | [Connector README](toolkits/sky-mcp-connector/README.md)・[Sky / MCP](docs/workstreams/02-sky-mcp.md) |
| **Fashion Brand Ops** | 受注型ブランド運営の独立MCPサービス | [`toolkits/fashion-brand-ops/`](toolkits/fashion-brand-ops/) | [README](toolkits/fashion-brand-ops/README.md)・[Business Pilots](docs/workstreams/09-business-pilots.md) |
| **Game SDK / Sandbox** | 非金融ゲームの接続と、資産交換を分けた試験 | [`systems/rock-star-os/examples/game/`](systems/rock-star-os/examples/game/) | [Game API契約](docs/game-api-contract-draft.md)・[Game / Market / Fund](docs/workstreams/08-game-market-fund.md) |
| **Mr. Tool adapter** | `Mr.`の固定原本をSkyへ接続するRock側の実装 | [`toolkits/mr/`](toolkits/mr/) | [README](toolkits/mr/README.md)・[Mr.取り込み](docs/mr-integration.md) |
| **Polymarket Bot Sandbox** | 外部市場を動かさないPAPER試作 | [`toolkits/polymarket-bot-sandbox/`](toolkits/polymarket-bot-sandbox/) | [README](toolkits/polymarket-bot-sandbox/README.md)・[Game / Market / Fund](docs/workstreams/08-game-market-fund.md) |
| **Rockstar Ledger** | 台帳の個別Tool資料 | [`toolkits/rockstar-ledger/`](toolkits/rockstar-ledger/) | [README](toolkits/rockstar-ledger/README.md)・[Wallet / Billing / Providers](docs/workstreams/03-wallet-billing-providers.md) |

## 共有領域と正本

| 領域 | 用途 |
| --- | --- |
| [`contracts/`](contracts/)、[`data/`](data/) | 複数プロジェクトで共有する契約、設定、進捗。特定の配備物だけへ移さない |
| [`docs/`](docs/)、[`docs/workstreams/`](docs/workstreams/)、[`docs/evidence/`](docs/evidence/) | 設計、担当作業、受入証拠。作業分野から探す場合は[workstream案内](docs/workstreams/README.md)を使う |
| [`scripts/`](scripts/)、[`tests/`](tests/)、[`.github/workflows/`](.github/workflows/) | リポジトリ横断の検証とCI。個別の実装を動かしただけで全製品の合格にはしない |
| [`public-release/rockstaros/`](public-release/rockstaros/) | 配布候補とサンプル。開発の正本ソースや実機受入記録とは分ける |
| [`vendor/mr/`](vendor/mr/) | 外部`Mr.`の固定原本。Rock固有の変更は[adapter側](toolkits/mr/)で行う |

別リポジトリの役割と秘密情報の境界は[Gitプロジェクト統合方針](docs/git-consolidation.md)と[repository map](data/repository-map.json)を参照してください。`rock`内の分類を変えても、外部の運用設定や秘密情報を取り込みません。

## 作業の始め方

1. 上の表から対象プロジェクトの入口を開く。
2. [workstream案内](docs/workstreams/README.md)から主担当を一つ選び、[進捗JSON](data/project-status.json)の既存task ID、完了条件、証拠を確認する。
3. 変更後は対象の小さい検証を実行し、配布・統合候補では`npm run verify`と対象OS固有の受入を実施する。結果は`project.md`と進捗JSONへ記録する。
