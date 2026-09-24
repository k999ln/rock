# プロジェクト別ガイド

このページは、`k999ln/rock`の成果物を**製品・実装単位**から探す入口です。確定要望は[製品ベース](docs/product-baseline.md)、現在のtaskと完了条件は[進捗JSON](data/project-status.json)、設計の正本は[全設計ポータル](docs/rockstaros-design-portal.md)を参照してください。ここに書くディレクトリの存在は、実機・本番・販売の受入完了を意味しません。

## 製品・独立した構想

| プロジェクト | 役割 | 最初に開くもの | 実装・素材の場所 |
| --- | --- | --- | --- |
| **avocadoMini** | Tower20 E3の製品構想と専用サイト | [現行E3設計](docs/avocado-mini-tower20-e3/README.md)・[担当作業](docs/workstreams/11-material-invention-avocado-mini.md) | [`sites/avocado-mini/`](sites/avocado-mini/)・[`docs/avocado-mini-tower20-e3/`](docs/avocado-mini-tower20-e3/) |
| **Rocket Star** | avocadoMiniとRockstarOSへ接続する軌道通信の構想。資金受付は準備中 | [構想ページ](sites/avocado-mini/rocket-star/index.html)・[衛星通信の設計追補](docs/avocado-mini-mini200-e1/game-first-life-connectivity.md) | [`sites/avocado-mini/rocket-star/`](sites/avocado-mini/rocket-star/)・[`sites/avocado-mini/public/images/`](sites/avocado-mini/public/images/) |
| **RockstarOS** | AIネイティブOSの共通基盤と配布候補 | [OS全体詳細設計](docs/rockstaros-complete-design.md)・[構成と現在地](docs/system-composition.md) | [`systems/rock-star-os/`](systems/rock-star-os/)・[`contracts/`](contracts/)・[`public-release/rockstaros/`](public-release/rockstaros/) |
| **AI自動化チーム** | 作成中のToolを役割ごとに組み合わせ、利用者の仕事を進める | [Toolチーム設計](docs/sky-network-economy.md)・[役割エージェント仕様](docs/sky-role-agents-20260912.md) | [`lib/catalog.ts`](lib/catalog.ts)・[`lib/automation-fund-catalog.ts`](lib/automation-fund-catalog.ts)・[`app/sky/`](app/sky/)・[`app/work/`](app/work/) |
| **Webアプリ** | Home、Sky、Zema、Wallet、設定、Sky Tool SDK用Rock Studioを一つのWeb/PWAとして提供 | [製品・サービス関係図](docs/rockstaros-product-system-map.md)・[Web担当作業](docs/workstreams/05-web-pwa-sites.md) | [`app/`](app/)・[`components/`](components/)・[`lib/`](lib/)・[`db/`](db/)・[`drizzle/`](drizzle/) |

Rocket Starの`/rocket-star/`はavocadoMiniサイト内の専用ページであり、衛星・受信機・通信網の実装や資金受付の完了を示しません。AI自動化チームの仕事とToolはSkyの中で選び編成します。Zemaが依頼・進捗・承認・停止・成果を管理し、Walletが費用と確認済み収益を扱います。CSV、メルカリ、Material Inventionなどの仕事をWeb/OSの独立サービスとして数えません。avocadoMiniの旧P0.2、Mini200 E1/E2は[現行E3設計](docs/avocado-mini-tower20-e3/README.md)と区別して設計履歴として保持します。

| AIチームを支える共通機能 | 主なソース | 設計・担当の入口 |
| --- | --- | --- |
| **Sky** — Toolの発見と接続 | [`app/sky/`](app/sky/)・[`app/api/sky/`](app/api/sky/) | [全Tool詳細設計](docs/sky-tools-complete-design.md)・[Sky / MCP](docs/workstreams/02-sky-mcp.md) |
| **Zema / Work / Activity** — 依頼、進捗、承認、停止、成果、履歴 | [`app/chat/`](app/chat/)・[`app/work/`](app/work/)・[`app/activity/`](app/activity/)・[`lib/zema-chat-session.ts`](lib/zema-chat-session.ts) | [Platform Core](docs/platform-core.md)・[Product / UX](docs/workstreams/01-product-ux.md) |
| **Wallet** — 費用と確認済み収益 | [`app/wallet/`](app/wallet/)・[`lib/rock-wallet.ts`](lib/rock-wallet.ts) | [Wallet / Billing / Providers](docs/workstreams/03-wallet-billing-providers.md) |
| **Home / Settings** — 入口と端末・接続設定 | [`app/page.tsx`](app/page.tsx)・[`app/settings/`](app/settings/) | [Product / UX](docs/workstreams/01-product-ux.md)・[Web / PWA / Sites](docs/workstreams/05-web-pwa-sites.md) |
| **Rock Studio** — Sky Tool作者向けのコード・SDK入口 | [`app/studio/`](app/studio/)・[`app/sky/publish/`](app/sky/publish/) | [Sky Tool SDK](docs/sky-tool-sdk.md)・[Sky / MCP](docs/workstreams/02-sky-mcp.md) |

## SkyのAI自動化チーム

作成しているToolと、それを組み合わせる仕事は、利用者が所有する一つのAI自動化チームの中で整理します。Skyが目的に合わせてTool・役割・構成版を選び、Zemaが同じ仕事の実行と成果を管理します。チームの実際の構成は選択と受入状態によって変わり、一覧にある全Toolが同時に稼働するという意味ではありません。[Toolチーム設計](docs/sky-network-economy.md)と[役割エージェント仕様](docs/sky-role-agents-20260912.md)がこの関係の入口です。

| Skyのチームが扱う仕事 | 現在のSkyとの接続 | 実装・設計の入口 |
| --- | --- | --- |
| **CSV業務** — データ整形の事業pilot | `rockstar-csv-cleanup`としてcatalogにready登録。Skyから専用画面へ進める | [`app/csv/`](app/csv/)・[CSV業務](docs/csv-business-v1.ja.md)・[Business Pilots](docs/workstreams/09-business-pilots.md) |
| **メルカリ収益ループ** — 出品から入金確認までの事業pilot | `mercari-revenue`としてcatalogにready登録。Skyから出品準備画面へ進める。入金の自動確認は未接続 | [`app/income/mercari/`](app/income/mercari/)・[メルカリ設計](docs/mercari-revenue-loop.md)・[Business Pilots](docs/workstreams/09-business-pilots.md) |
| **Fashion Brand Ops** — 受注型ブランド運営の事業pilot | `fashion-brand-ops`としてcatalogにready登録。外部Providerの本番接続は別受入 | [`toolkits/fashion-brand-ops/`](toolkits/fashion-brand-ops/)・[統合設計](docs/fashion-brand-ops-integration.md)・[Business Pilots](docs/workstreams/09-business-pilots.md) |
| **Material Invention Studio** — 発明候補の操作・比較 | Skyで組み合わせる発明チームの複合機能。単体のcatalog Toolではない。Coreのsandboxは実装済み、操作画面とSky接続は未実装 | [`lib/material-invention.ts`](lib/material-invention.ts)・[`contracts/material-invention.json`](contracts/material-invention.json)・[Material Invention Core](docs/material-invention-core.md)・[担当作業](docs/workstreams/11-material-invention-avocado-mini.md) |
| **Market / Polymarket** — 市場の検討とPAPER試験 | `rockstar-markets-analysis`はcatalogにready登録。`/polymarket`は`/market`への転送で、外部市場のPAPER試作は別のToolkit | [`app/market/`](app/market/)・[`app/polymarket/`](app/polymarket/)・[`toolkits/polymarket-bot-sandbox/`](toolkits/polymarket-bot-sandbox/)・[Game / Market / Fund](docs/workstreams/08-game-market-fund.md) |
| **Fund** — 検証済み実績に基づく構想と試算 | Skyから選ぶファンド構想。単体のcatalog Toolではない | [`app/fund/`](app/fund/)・[ファンド統合](docs/markets-fund-integration-20260913.md)・[Game / Market / Fund](docs/workstreams/08-game-market-fund.md) |

`/studio`は[Sky Tool SDKの開発者向け画面](app/studio/page.tsx)であり、Material Invention Studioの実装画面ではありません。

### AI自動化チームのTool

Web/PC版Skyの登録正本は[`lib/catalog.ts`](lib/catalog.ts)です。現在はready 12件（Rock側で作成8件、`Mr.`由来4件）とcandidate 22件（Rock側の構想1件、`Mr.`由来11件、第三者候補10件）。Rock側と`Mr.`由来のToolはチームの実装・導入対象、第三者候補は将来の接続候補です。`ready`はSky catalog上の状態であり、外部Providerや本番決済まで接続済みという意味ではありません。`candidate`を稼働中の担当として数えません。[全Tool詳細設計](docs/sky-tools-complete-design.md)に権限・入出力・停止条件があります。

### Rock側で作成・登録したTool

| Sky ID | Tool | catalog状態 | 主な実装・入口 |
| --- | --- | --- | --- |
| `rockstar-csv-cleanup` | CSV整形・検査・納品 | ready | [`app/csv/`](app/csv/)・[`lib/csv-transform.ts`](lib/csv-transform.ts) |
| `rockstar-markets-analysis` | Market Scanner | ready | [`app/market/`](app/market/)・[`lib/markets-adapter.ts`](lib/markets-adapter.ts) |
| `mercari-revenue` | メルカリ収益スターター | ready | [`app/income/mercari/`](app/income/mercari/)・[`lib/mercari-revenue.ts`](lib/mercari-revenue.ts) |
| `fashion-brand-ops` | Instagram運用・受注型ブランド管理 | ready | [`toolkits/fashion-brand-ops/`](toolkits/fashion-brand-ops/) |
| `rockstar-ledger` | サブスク顧問 | ready | [`toolkits/rockstar-ledger/`](toolkits/rockstar-ledger/) |
| `jev-evaluation` | Jev品質評価 | ready | [`lib/jev-evaluation.ts`](lib/jev-evaluation.ts)・[`app/api/jev-evaluation/`](app/api/jev-evaluation/) |
| `rockstar-legal-intake` | 法務受付 | ready | [`lib/legal-intake.ts`](lib/legal-intake.ts)・[`app/api/legal-guidance/`](app/api/legal-guidance/) |
| `rockstar-patent-assistant` | 特許アシスタント | ready | [`lib/patent-assistant.ts`](lib/patent-assistant.ts)・[`app/api/patent-research/`](app/api/patent-research/) |
| `rockstar-ip-studio` | IP Studio — SNS・ゲーム運用 | candidate | [catalog登録](lib/catalog.ts)・[設計](docs/sky-tools-complete-design.md)。Sky実行器は未接続 |

Jev評価はRock側のToolと外部の評価先を組み合わせる構成です。`origin: rockstaros`はモデルそのものをRockが所有する意味ではありません。

### `Mr.`から取り込んだready Tool

| Sky ID | Tool | Rock内の入口 |
| --- | --- | --- |
| `coconala` | ココナラ案件チェック | [`vendor/mr/application_eligibility.py`](vendor/mr/application_eligibility.py)・[`toolkits/mr/`](toolkits/mr/) |
| `mr-free-article` | 記事の無料版メーカー | [`vendor/mr/make-free-version.py`](vendor/mr/make-free-version.py)・[`toolkits/mr/`](toolkits/mr/) |
| `mr-citations` | 出典整理ツール | [`vendor/mr/citation-strip.py`](vendor/mr/citation-strip.py)・[`toolkits/mr/`](toolkits/mr/) |
| `mr-delivery` | 納品記録の照合 | [`vendor/mr/deliverable_verifier.py`](vendor/mr/deliverable_verifier.py)・[`toolkits/mr/`](toolkits/mr/) |

`vendor/mr`は固定snapshotです。Rock側の接続・振る舞いは[`toolkits/mr/`](toolkits/mr/)と[取り込み設計](docs/mr-integration.md)で追います。

### 導入候補

以下は[`lib/catalog.ts`](lib/catalog.ts)に`candidate`として登録された22件です。実行可能な標準Toolや本番接続として数えません。

| 由来 | Sky ID・表示名 |
| --- | --- |
| Rock構想 | `rockstar-ip-studio` — IP Studio — SNS・ゲーム運用 |
| `Mr.` | `coconala-proposal-draft` — ココナラ提案文の下書き |
| `Mr.` | `gig-workflow` — 受託案件ワークフロー |
| `Mr.` | `coconala-inbox` — ココナラの依頼・添付整理 |
| `Mr.` | `youtube-script-writer` — YouTube台本 |
| `Mr.` | `seo-blueprint` — SEO・記事構成 |
| `Mr.` | `landing-page-sprint` — LP・販売ページ制作 |
| `Mr.` | `sales-objection-reply-builder` — 商談返信・見積り支援 |
| `Mr.` | `user-interview-synthesizer` — 顧客インタビュー分析 |
| `Mr.` | `calendar-coordination` — 予定・カレンダー連携 |
| `Mr.` | `telegram-notifications` — Telegram通知・承認 |
| `Mr.` | `producthunt-discovery` — 外部ツール候補の発見 |
| 第三者 | `faster-whisper` — 文字起こし |
| 第三者 | `transformers-js` — ブラウザAI |
| 第三者 | `playwright` — 許可Web操作 |
| 第三者 | `jev-ultrafast` — 選択型browser agent |
| 第三者 | `jev-trader` — PAPER市場判断 |
| 第三者 | `typesafe-computer-use` — Mac画面操作 |
| 第三者 | `jev-review` — code review |
| 第三者 | `jev-router` — model routing |
| 第三者 | `jev-browser` — browser操作 |
| 第三者 | `mobile-jev` — Android操作 |

[全Tool詳細設計](docs/sky-tools-complete-design.md)にはOpenJev、Jevlike、Awesome Jev by TypeSafeも研究・参考対象として記載されています。現行の[`lib/catalog.ts`](lib/catalog.ts)と[設計台帳](data/design-document-index.json)には登録されていないため、上の22件やready Toolには含めません。

### Linux/QEMUに同梱した開発用Tool

Web/PC catalogとは別に、[`systems/rock-star-os/examples/registry/`](systems/rock-star-os/examples/registry/)には次の6 family・9版があります。公開RFC試験鍵を使う開発用packageです。

| package ID | 内容 |
| --- | --- |
| `org.example.action-checklist` | 共有用チェックリスト |
| `org.rockstar.citation-organizer` | 引用整理 |
| `org.rockstar.proposal-draft` | 提案下書き |
| `org.rockstar.text-tidy` | 文章を整える |
| `org.rockstar.unique-list` | リストの重複を整理 |
| `org.rockstar.utf8-sha256` | 入力テキストのSHA-256 |

Androidの[`article-tool`](android/article-tool/)は`mr-free-article`と`mr-citations`に対応する端末側の実装です。[Android Tool SDK](android/tool-sdk/)を使い、[OS prototype受入](docs/os-prototype.md)で別途検証します。nativeの[`hello`サンプル](systems/rock-star-os/examples/tools/hello/)はTool作成例です。これらをSky catalogの新しいTool IDや6 familyへ重複して加算しません。

### 網羅確認

| 正本・実装 | このガイドでの扱い |
| --- | --- |
| [Sky catalog](lib/catalog.ts) | 登録34件すべてを上に記載。ready 12件とcandidate 22件を分離 |
| [native registry](systems/rock-star-os/examples/registry/) | 開発用6 family・9版を上に記載。Web/PC catalogと分離 |
| [`toolkits/`](toolkits/) | 6ディレクトリを下表で分類。Tool実装、SDK、connector、PAPER試作を区別 |
| [Android article-tool](android/article-tool/)・[native hello](systems/rock-star-os/examples/tools/hello/) | 既存Toolの端末側実装と作成例として記載。独立したcatalog登録ではない |

Fashion Brand Opsの[41件のMCP操作](lib/fashion-mcp-client.ts)は、catalog上では`fashion-brand-ops`という一つのTool packageの内部操作です。操作数をチームの人数や独立した製品数に加算しません。

新しいToolを登録したときは、このチーム一覧と[全Tool詳細設計](docs/sky-tools-complete-design.md)を同じ変更で更新します。登録数だけで実行成功やチームへの参加完了とは扱いません。

## 実装・配備単位

次の表は同じチームを支えるソースや配備物の場所です。`toolkits/`の行をチームから独立した製品一覧としては扱いません。

| 単位 | 対象と境界 | ソース | 担当・検証の入口 |
| --- | --- | --- | --- |
| **Linux / QEMU Developer Preview** | native OS、Tool実行、更新・復旧。Android imageとは別系列 | [`systems/rock-star-os/`](systems/rock-star-os/) | [native README](systems/rock-star-os/README.md)・[Native / QEMU / Release](docs/workstreams/06-native-qemu-release.md) |
| **Android / Pixel Device Preview** | AOSP、Shell、Broker、端末内AI、Pixel 10向け受入 | [`android/`](android/)・[`os/`](os/) | [Android / Device / Local AI](docs/workstreams/07-android-device-local-ai.md)・[端末preview](docs/phone-preview-20260911.md) |
| **avocadoMini製品サイト** | 製品紹介、導入案内、販売準備の独立Site | [`sites/avocado-mini/`](sites/avocado-mini/) | [現行E3設計](docs/avocado-mini-tower20-e3/README.md)・[Material Invention / avocadoMini](docs/workstreams/11-material-invention-avocado-mini.md) |
| **Web内の製品紹介・導入画面** | [`app/rockstaros/`](app/rockstaros/)には旧P0.2の外観・税込価格表示が残る。現行E3の紹介は上の製品サイトを正本とし、Web内画面の更新は未完了 | [`app/rockstaros/`](app/rockstaros/) | [現行E3設計](docs/avocado-mini-tower20-e3/README.md)・[Web / PWA / Sites](docs/workstreams/05-web-pwa-sites.md) |
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
| [`hooks/`](hooks/)、[`public/`](public/) | Webアプリの共通hookと配信素材・Tool package。単独の製品ではない |
| [`docs/`](docs/)、[`docs/workstreams/`](docs/workstreams/)、[`docs/evidence/`](docs/evidence/) | 設計、担当作業、受入証拠。作業分野から探す場合は[workstream案内](docs/workstreams/README.md)を使う |
| [`scripts/`](scripts/)、[`tests/`](tests/)、[`.github/workflows/`](.github/workflows/) | リポジトリ横断の検証とCI。個別の実装を動かしただけで全製品の合格にはしない |
| [`.cursor/rules/`](.cursor/rules/)、[`.openai/`](.openai/) | 開発運用とhostingの設定。利用者向けToolや事業ではない |
| [`public-release/rockstaros/`](public-release/rockstaros/) | 配布候補とサンプル。開発の正本ソースや実機受入記録とは分ける |
| [`vendor/mr/`](vendor/mr/) | 外部`Mr.`の固定原本。Rock固有の変更は[adapter側](toolkits/mr/)で行う |

別リポジトリの役割と秘密情報の境界は[Gitプロジェクト統合方針](docs/git-consolidation.md)と[repository map](data/repository-map.json)を参照してください。`rock`内の分類を変えても、外部の運用設定や秘密情報を取り込みません。

## 作業の始め方

1. 上の表から対象プロジェクトの入口を開く。
2. [workstream案内](docs/workstreams/README.md)から主担当を一つ選び、[進捗JSON](data/project-status.json)の既存task ID、完了条件、証拠を確認する。
3. 変更後は対象の小さい検証を実行し、配布・統合候補では`npm run verify`と対象OS固有の受入を実施する。結果は`project.md`と進捗JSONへ記録する。
