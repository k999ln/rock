# avokado

avokadoの製品・サービスを、**Mini → OS → Eve → Sky → Pro** の順に案内します。それぞれの目的、設計、コード、開発状況への入口です。MiniとProは独立した製品で、OS・Eve・Skyは各製品や単独利用を支えるソフトウェアです。

[Mini](#mini) · [OS](#os) · [Eve](#eve) · [Sky](#sky) · [Pro](#pro)

確定要望の正本は[製品ベース](docs/product-baseline.md)と[製品方針JSON](data/product-baseline.json)。全体の実装状況は[project.md](project.md)と[進捗JSON](data/project-status.json)、詳しいコード配置は[PROJECTS.md](PROJECTS.md)を参照してください。設計、コードの実装、Web公開、実機受入、外部サービスの本番受入は別々に記録します。

<a id="mini"></a>

## Mini — 暮らしとまちづくり

- **目的：** 家庭での操作・連絡・創作、地域施設での案内・学び・遊び、住民参加を通じて暮らしとまちづくりに貢献する空間端末。R5を現行設計として、1本で使える構成を目指し、Proや建物Hubを必須にしません。
- **設計：** [R5の設計](docs/avocado-mini-r5/README.md)、[製品目的・住民と施設の責任・受入条件](docs/service-design/03-product-profiles.md#mini-pro-purpose)、[Material InventionとMiniの詳細](docs/rockstaros-avocado-mini-complete-design.md)。200mm以内の目標、任意の建築一体型取付、任意の国内LTE/IoT data SIMを扱います。
- **コード：** [製品ページ](sites/avocado-mini/src/pages/mini/index.astro)、[ゲーム制作ページ](sites/avocado-mini/src/pages/create/index.astro)、[動くブラウザゲームの雛形](sites/avocado-mini/creator-kit/)、[投稿受付Worker](sites/avocado-mini/worker/participation.mjs)。ブラウザの制作機能とMini実機のソフトウェアは別の受入対象です。
- **開発状況：** [Mini公開サイト](https://avocadomini.si/)にR5と製品目的を掲載。ブラウザゲームとアイデア・ゲーム投稿の受付があります。製造承認は**保留中**で、R5実機試験の完了実績は0件です。実機の表示・入力・通話・電源・熱・保存/復旧、地域での実証、建築施工は未受入。R5の価格・発売日は未確定で、予約・決済は停止中です。[公開確認の記録](data/mini-pro-purpose-publication.json)。

Material Inventionは2D候補比較とSky/Zema接続がある段階で、シミュレーション・実験室接続は未実装です。

<a id="os"></a>

## OS — RockstarOS

- **目的：** 本人性、権限、AI・Agent実行、費用上限、端末適合、保存・復旧を共通に扱うruntime。各製品とサービスを共通契約でつなぎます。製品名は **RockstarOS 1.0**、内部識別子は `dev.rock`、最初の配布ラベルはDeveloper Previewです。
- **設計：** [全設計ポータル](docs/rockstaros-design-portal.md)、[OS本体の詳細](docs/rockstaros-complete-design.md)、[1.0構成](docs/rockstaros-1.0-architecture.md)、[端末別設計](docs/device-support-architecture.md)。OS本体の最新設計の大元は[「RockstarOSを再設計」チャット](codex://threads/01a14d54-daee-7c30-87a8-faea84641a40)です。
- **コード：** [native/Linux・QEMU](systems/rock-star-os/)、[Android](android/)、[OS接続層](os/)、[Webの画面](app/)、[共通業務の状態遷移](lib/workflow.ts)。[native統合手順](docs/native-os-integration.md)と[Linux toolkit](toolkits/sky-linux-local/README.md)から対象ごとの入口へ進めます。
- **開発状況：** Web runtime、Linux/serviceとPixel/Lab adapterのコードをmainへ統合済み。Pixel 10 GL066 / frankelでは純正OS上の試験署名APKで非破壊の実再起動受入23/23が根拠です。全OS build・正式署名・flash/boot・data/Keystore全損復元は未完了。[Pixelの境界](docs/phone-preview-20260911.md)。QEMU Developer Previewは独立した系列として保持し、最新候補の配布受入は[QEMU担当](docs/workstreams/06-native-qemu-release.md)で管理します。

eSIMは本人用Cloud Sky・Eve・Linuxサービスへの入口です。OS binaryをeSIMへ格納しません。既存OSのclient/browserと、機種ごとに署名・起動・復旧が受け入れられたnative OSを分けます。回線、SIM profile、利用権、client導入、OS導入も別の状態です。

<a id="eve"></a>

## Eve — 会話から仕事と成果へ

- **目的：** 会話、依頼、承認、進捗、停止、成果、利用額を同じ本人・同じ仕事に結び付け、対応端末へ引き継ぐ窓口です。
- **設計：** [Eveを含むOSの最新設計](docs/rockstaros-complete-design.md#redesign-thread-home-sky-eve)、[サービス間の共通契約](docs/service-design/02-system-contracts.md)、[Agent・Toolと仕事の詳細](docs/sky-tools-complete-design.md)。既存Zema系の仕事・承認・費用契約を再利用します。
- **コード：** [会話と仕事の画面](components/sky-chat-workspace.tsx)、[履歴パネル](components/eve-history-panel.tsx)、[履歴API](app/api/eve/history/route.ts)、[暗号化履歴](lib/eve-history.ts)、[仕事の状態遷移](lib/workflow.ts)。
- **開発状況：** 会話の明示保存・読戻し・削除と、本人の成果をHTMLへ持ち出すコードをmainへ統合済み。アカウント履歴には本人認証と運営側の `EVE_HISTORY_KEYRING` 設定が必要で、設定不足を保存成功と表示しません。履歴を開いても仕事は再実行しません。実アカウントの別端末引継ぎは未受入です。[統合記録](data/runtime-integration-audit.json)。

<a id="sky"></a>

## Sky — 情報とAgent・Toolの発見・接続

- **目的：** 情報やModel・Agent・Toolを投稿から見つけ、追加・接続し、Eveへ仕事を渡すmarketplaceと接続hub。Sky単体でも利用できる設計です。
- **設計：** [Tool全体の詳細](docs/sky-tools-complete-design.md)、[MCPと接続の設計](docs/sky-mcp-architecture.md)、[料金・usage・上限の契約](docs/sky-billing.md)。投稿の出典、作者・版・互換性、権限、費用、保存・復旧を扱います。
- **コード：** [Sky画面と各Tool](app/sky/)、[投稿型Home](components/home-screen.tsx)、[接続hub API](app/api/sky/hub/route.ts)、[共有OS版API](app/api/sky/community-os/route.ts)、[Web配信とmigration](services/sky-web/)。
- **開発状況：** 投稿型Home/Sky、本人別保存、コミュニティーOSの版と鍵を扱うWebコードはmainへ統合済み。[総合・Sky入口](https://avoado.si/)があります。実X投稿・独自For You・実MCP Providerの接続や、本番の料金・請求受入を一括で完了とは扱いません。[Web担当と公開記録](docs/workstreams/05-web-pwa-sites.md)。

機能の追加、商品の購入、仕事の実行、外部送信、課金は別の操作です。Cloud利用は事前見積・上限承認と明細を必要とし、許可済み予算を超えて実行しません。モデルの出力や作者の署名を権限承認へ昇格させません。mainと旧作業branchの料金案の差は[Git統合監査](docs/workstreams/10-git-ci-operations.md#redesign-thread-git)で別に照合します。

<a id="pro"></a>

## Pro — AI専用PCと半導体・関連部品の確保

- **目的：** AIモデル・Agent・制作・計算のための専用PC。その製造・販売事業を通じて、半導体と関連部品を継続的に確保できる調達基盤を育てます。Miniなしで使う独立PCです。
- **設計：** [Proの詳細設計](docs/avokado-pro-pc-design.md)、[製品目的・調達の責任と受入条件](docs/service-design/03-product-profiles.md#mini-pro-purpose)、[部品・販売準備の台帳](data/avocado-pro-sales-readiness.json)。需要把握、構成検証、供給元との調整、発注・納品・品質検収を分けて扱います。
- **コード：** [製品ページ](sites/avocado-mini/src/pages/pro/index.astro)、[部品・構成選択](sites/avocado-mini/src/components/ProAssemblyWorkbench.astro)、[構成操作と保存](sites/avocado-mini/src/pro-experience.js)、[購入希望受付Worker](sites/avocado-mini/worker/pro-interest.mjs)。Miniと同じWebソース内にあります。
- **開発状況：** [Pro公開サイト](https://avocadopro.si/)で構成検討・保存・購入希望受付と事業目的を案内。最初の実機は銀色Lian Li A4-H2Oで試作する候補です。実機組立・部品適合・供給契約・在庫確保・最終価格・決済・配送は未受入。半導体確保は事業目的であり、確保済みの実績ではありません。有料注文は開始していません。[公開確認の記録](data/mini-pro-purpose-publication.json)。

## 開発と検証

Node.js 22.13以降とnpmを使用します。Webのローカル起動:

    npm ci
    npx wrangler d1 migrations apply DB --local --config wrangler.local.jsonc
    npm run dev

Mini/ProのWebソースは [sites/avocado-mini](sites/avocado-mini/) に共通で保存します。正式ドメインのrootはWorkerで各製品へ振り分け、旧 `/mini/`・`/pro/` は正式URLへ転送します。

変更の検証:

    npm ci --prefix sites/avocado-mini
    npm run project:update
    npm run design:check
    npm run verify

実装の承認・受入gate、次の作業、検証結果は [project.md](project.md)、[進捗JSON](data/project-status.json)、[作業分野](docs/workstreams/README.md)を確認してください。[全タスクの進捗](project.md#全taskの作業進捗)も参照できます。作業数は製品の完成率を表しません。GitHub保存、mainへの統合、各サイトの配備は別に記録します。

<!-- project-overview:start -->
Updated: 2026-10-21 / 393 task records (32 parents, 192 children, 169 standalone; 361 execution units excluding parents): 114 done, 48 in progress, 230 planned, 1 blocked
<!-- project-overview:end -->

## 権利と公開・実機の境界

公開サイトは、総合・Skyの [avoado.si](https://avoado.si/)、Miniの [avocadomini.si](https://avocadomini.si/)、Proの [avocadopro.si](https://avocadopro.si/) です。各サイトの配備・DNS/TLS・表示の証拠と、実機・実Provider・本番課金の受入を区別します。本人用localhost Labや秘密情報は公開サイトへ移しません。

端末初期化・bootloader解除・flash、契約、実資金、外部送信は対象ごとの条件を確認します。Gitへ秘密鍵、原稿、本人データを保存しません。[配布計画](docs/release-minimum-gates.md) / [権利と配布物](public-release/rockstaros/README.md)。
