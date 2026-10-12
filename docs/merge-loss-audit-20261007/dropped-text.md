# 統合で落ちた文章の原文（2026-10-07抽出）

> [統合で失われた情報の監査](../merge-loss-audit-20261007.md)の添付です。**いまのどの文書にも残っていない行**を、落ちた統合（merge）ごとに原文のまま保存しています。読むための文書ではなく、探すための保管庫です。

## この保管庫の読み方

- 対象: 履歴上のすべてのmerge（154件）について、「どちらかの親にあったのに、統合後のファイルに無い行」を機械的に拾い、そのうち **現在の作業ツリーのどのファイルにも一致する行がなく、同じファイル内に似た行（書き直した版）も無いもの** だけを載せています。25文字未満の行は対象外です。
- 載せていないもの: 文書へ復元済みの行（監査の3節）、同じ文が書き直されて残っている行（監査の4.5節に件数）。
- 多くは「その後に意図して書き直された古い版」です。**現行の仕様として読まないでください。** 日付と統合を確認してから使います。
- 原文の全体を見るには `git show <落ちた側のcommit>:<ファイル>` を実行します。commitは各見出しに書いてあります。
- 行はMarkdownとして表示せず、コードブロックにそのまま入れています（表やリンクが崩れないようにするため）。

## 目次

| ファイル | 落ちた行 | 統合の数 |
| --- | ---: | ---: |
| [`AGENTS.md`](#agentsmd) | 4 | 1 |
| [`CHECKPOINT.md`](#checkpointmd) | 1 | 1 |
| [`PROJECTS.md`](#projectsmd) | 3 | 2 |
| [`README.md`](#readmemd) | 235 | 35 |
| [`docs/agent-control-plane.md`](#docsagent-control-planemd) | 4 | 1 |
| [`docs/ai-native-os-architecture.md`](#docsai-native-os-architecturemd) | 6 | 2 |
| [`docs/database-status.md`](#docsdatabase-statusmd) | 20 | 12 |
| [`docs/fund-and-mcp.md`](#docsfund-and-mcpmd) | 7 | 1 |
| [`docs/jev-local-qwen-decision-fabric-design.md`](#docsjev-local-qwen-decision-fabric-designmd) | 1 | 1 |
| [`docs/launch-readiness-20260910.md`](#docslaunch-readiness-20260910md) | 11 | 1 |
| [`docs/llm-evaluation-architecture.md`](#docsllm-evaluation-architecturemd) | 1 | 1 |
| [`docs/os-development-design.md`](#docsos-development-designmd) | 1 | 1 |
| [`docs/os-prototype.md`](#docsos-prototypemd) | 1 | 1 |
| [`docs/product-baseline.md`](#docsproduct-baselinemd) | 42 | 7 |
| [`docs/rockstaros-design-portal.md`](#docsrockstaros-design-portalmd) | 1 | 1 |
| [`docs/sky-assistant-and-memory.md`](#docssky-assistant-and-memorymd) | 3 | 3 |
| [`docs/sky-tools-complete-design.md`](#docssky-tools-complete-designmd) | 14 | 2 |
| [`docs/sky.md`](#docsskymd) | 5 | 4 |
| [`docs/system-composition.md`](#docssystem-compositionmd) | 2 | 2 |
| [`docs/workstreams/05-web-pwa-sites.md`](#docsworkstreams05-web-pwa-sitesmd) | 2 | 1 |
| [`project.md`](#projectmd) | 121 | 41 |
| [`toolkits/rockstar-ledger/README.md`](#toolkitsrockstar-ledgerreadmemd) | 1 | 1 |

加えて、末尾に次の3つをまとめています。

- [並行ブランチで書かれ、番号が重なって落ちた要望（全文）](#並行ブランチで書かれ番号が重なって落ちた要望全文)
- [READMEで英語にした日本語の原文](#readmeで英語にした日本語の原文)
- [今回の整理で新しい版へ置き換えた行](#今回の整理で新しい版へ置き換えた行)

## AGENTS.md

### 2026-09-09 — merge `797c663d` で落ちた側 `fcedcfec`（3行）

統合: Integrate approved Hub Wallet OS design with native baseline ／ 落ちた側の最後のcommit: Record passing native integration checks

````text
- 主開発対象はRock star OS。OS関連作業では docs/native-os-integration.md と docs/os-development-design.md を読む。BlackBerry優先・機種未定。systems/rock-star-os/ はLinux native、android/ と os/ は既存Android/AOSPで、別々に検証する。APK/PWA・QEMUの成功を実機の完成と報告しない。
- 正本はこのリポジトリ (`k999ln/rock`)。既存Webのファンド・上限利用料・分配試算を維持する。新OSは購入者の同一契約につき月888 cents固定で、複数端末の重複課金・旧試算式の流用をしない。実資金機能はprovider検証と提供承認まで有効化しない。
- Android/AOSPの変更時は docs/os-prototype.md の手順に従い、共通コアの実SQLiteテスト、`os:parity`、`os:check`、SDKテストとAPKのbuild/lint、関連する端末接続試験を確認する。ホストテスト・標準Androidの試験・自前OSのSoong build/boot・Pixel実機を別々に記録し、未実行を成功に換算しない。
````

### 2026-09-09 — merge `797c663d` で落ちた側 `27b34adc`（1行）

統合: Integrate approved Hub Wallet OS design with native baseline ／ 落ちた側の最後のcommit: docs: align OS and game wallet plan with implementation evidence

````text
- 現在はdocs/os-hub-wallet-game-design.mdの設計承認待ち。利用者の明示承認前は文書提示・修正だけを行い、新しいOS/runtime/SDKの実装・起動は進めない。承認後は対象設計版と範囲を記録する。実機書込み・本番公開・実資金は設計承認だけで許可されたことにしない。
````

## CHECKPOINT.md

### 2026-09-10 — merge `bfc4ae32` で落ちた側 `d713e504`（1行）

統合: feat: integrate Sites history into the RockstarOS workspace ／ 落ちた側の最後のcommit: feat(web): make automation Hub the primary workspace

````text
[ローンチ準備記録](docs/launch-readiness-20260910.md)とLCH01〜07を先に読む。再開branchは `codex/rockstaros-release-20260910`。最新の主作業はHubフロントの改修、既存Sites履歴の復旧、配布・署名・CM・原TLSエラーの照合。開始時29e4f72、配布候補9abは別のまま。以下は過去の履歴。
````

## PROJECTS.md

### 2026-10-05 — merge `ecb4b2af` で落ちた側 `624124cf`（1行）

統合: Merge remote-tracking branch 'origin/main' ／ 落ちた側の最後のcommit: Merge pull request #68 from k999ln/codex/sky-main-integration-20261005

````text
| **CSV業務** — データ整形の事業pilot | `rockstar-amc` | AMC · Goalと部隊の進捗 | ready | [`app/zema/amc/`](app/zema/amc/)・[設計](docs/amc-sky-launch-integration.md)。計画保存・手動記録のみ、Web自律実行は未接続 |
````

### 2026-09-24 — merge `f243a66d` で落ちた側 `02d9f5d8`（2行）

統合: Merge main and align project guide with R5 ／ 落ちた側の最後のcommit: Audit project guide coverage and current product status

````text
| **Rocket Star** | avocadoMiniとRockstarOSへ接続する軌道通信の構想。資金受付は準備中 | [構想ページ](sites/avocado-mini/rocket-star/index.html)・[衛星通信の設計追補](docs/avocado-mini-mini200-e1/game-first-life-connectivity.md) | [`sites/avocado-mini/rocket-star/`](sites/avocado-mini/rocket-star/)・[`sites/avocado-mini/public/images/`](sites/avocado-mini/public/images/) |
Rocket Starの`/rocket-star/`はavocadoMiniサイト内の専用ページであり、衛星・受信機・通信網の実装や資金受付の完了を示しません。AI自動化チームの仕事とToolはSkyの中で選び編成します。Zemaが依頼・進捗・承認・停止・成果を管理し、Walletが費用と確認済み収益を扱います。CSV、メルカリ、Material Inventionなどの仕事をWeb/OSの独立サービスとして数えません。avocadoMiniの旧P0.2、Mini200 E1/E2は[現行E3設計](docs/avocado-mini-tower20-e3/README.md)と区別して設計履歴として保持します。
````

## README.md

### 2026-10-05 — merge `ecb4b2af` で落ちた側 `624124cf`（4行）

統合: Merge remote-tracking branch 'origin/main' ／ 落ちた側の最後のcommit: Merge pull request #68 from k999ln/codex/sky-main-integration-20261005

````text
AMCは [Goalと部隊の画面](app/zema/amc/page.tsx) と [Codex用3役・起動口](toolkits/amc-agent/README.md) を備えます。Webの自律実行・同期と実モデル完走は未受入です。
AMCの開発用CLIは、OSの導入なしでNode.jsから実行できます。`npm run amc:autonomy:fixture -- help`で操作を表示します。新しい私有ディレクトリに固定の算術Goalを作り、子Taskの実行・ファイル検査・保存・再開・停止を試せます。[設計と実行手順](docs/amc-autonomy-fixture.md)を参照してください。実際の仕事、Codexや外部AI、Sky/ZemaのWeb画面へは未接続で、最後は本人の検収待ちになります。
Skyの単独マーケットは `/sky/marketplace`、利用方法・保存/削除・接続状態・対応環境は `/sky/help`。OS導入は必須ではありません。外部AIや購入/販売は必要な接続設定と本人の条件が揃ってから利用できます。[サービス設計と受入](docs/sky-launch-design.md)・[段階別の受入記録](data/sky-service-launch.json)・[運用と作者/決済の受入手順](docs/sky-launch-operations.md)を参照してください。設定あり・コード試験・本番合格は別の状態です。
[技術調査・将来構想・検証計画](docs/avocado-mini-r5/research/immersive-gta/README.md)。2026-09-30時点の記録。GTA接続・裸眼空間表示・実機完成の証拠ではありません。
````

### 2026-10-05 — merge `0d9a402b` で落ちた側 `0d2b758f`（11行）

統合: merge: record PR 40 as superseded by current SIM-led product pages ／ 落ちた側の最後のcommit: docs(site): use avokado mini display name in Astro pages

````text
**製品名: avokado mini** · 事業／ブランド名: avokado。設計書の原本ファイル名と内部識別子には旧表記 `avocadoMini` が残ります。
小さな専用端末 **avokado mini R5** と、仕事・AI・作品・権限を支える現行OS設計 **RockstarOS v1.0** を設計しています。
[製品体験](#製品体験) · [機能の詳細](#機能の詳細) · [現在地](#現在地) · [設計書ライブラリ](#設計書ライブラリ) · [静止画](docs/brand/avokado/avokado-mini-r5-editorial-hero.png)
| 遊ぶ人・家族 | 身体、手、日本語音声など自分に合う方法で遊び、途中から再開する | avokado miniのゲーム体験とRockstarOS |
### avokado mini R5 — 現行の製品要求
| avokado mini R5 | 統合基本設計、51ページ、設計検討図8点、計算チェック14件 | 実機0件。裸眼全空間表示、精密3D入力、最終収納・熱・電源、製造図・安全受入 |
**現行の端末設計はavokado mini R5、OS・システムソフト設計はRockstarOS v1.0、ロケット設計はrocketstar R1.0です。** それぞれの原本と付録を以下から直接開けます。設計書の存在は、実機動作、製造承認、飛行認定を示しません。
[端末 R5](#avokado-mini-r5--原本と検証資料) · [OS v1.0](#rockstaros-v10--現行のos設計書) · [ロケット R1.0](#rocketstar-r10--現行のロケット設計書) · [領域別の設計資料](#rockstarosサービス--全設計領域) · [旧版](#旧版別研究profile)
### avokado mini R5 — 原本と検証資料
**R5との関係:** 原本の `EDGE-HUB-v1` と全体配置図には旧avokado E3の「4本＋別Hub」が残っています。これは現行avokado mini R5の外形・台数・Hub要件ではありません。R5の**1本で基本機能が動き、別Edge Hubを必須にしない**要求を優先し、R5用Device Profileとadapterの統合は未完了として扱います。43/43は文書・契約の検査で、新OS imageの完成、実機受入、飛行・居住設備の運用認定を示しません。
[全設計ポータル](docs/rockstaros-design-portal.md)の17領域と[機械可読の設計書台帳](data/design-document-index.json)に登録された文書を、ここから直接開けます。OS完全版原本には旧E3の端末配置が含まれるため、**avokado miniの外形・台数・Hub要件はR5を優先**します。
````

### 2026-10-05 — merge `f2fa24ec` で落ちた側 `c9b806fe`（1行）

統合: merge: integrate PR 58 LiveKit setup without enabling calls ／ 落ちた側の最後のcommit: feat(ip-studio): add LiveKit voice and telephony setup

````text
IP Studio now includes optional **LiveKit voice and telephone setup** in Sky connection settings and Zema routing. Save the LiveKit environment, server URL and agent name; SIP references are optional for voice-only use. This is setup metadata only: the separate IP Studio runtime, media sessions and inbound/outbound calls are not connected yet. [Scope and remaining integration](docs/sky-tools-complete-design.md#ipキャラクターの音声会話電話連携2026-10-04).
````

### 2026-10-05 — merge `ea2728ec` で落ちた側 `8978ca44`（5行）

統合: Merge PR #25 advisory Decision Fabric and optional Jev provider ／ 落ちた側の最後のcommit: Return disabled reason before Jev cost admission

````text
更新日: 2026-09-21 / 126 task中86 done・23 in progress・16 planned・1 blocked
- **Decision Fabric（host実装・公開fixture live smoke確認済み）**: [`lib/decision/index.ts`](lib/decision/index.ts)の`DecisionHarness`は、決定的な`CODE`経路、固定質問の型付き判断、入力と回答の検査、送信先・時間と事前見積りに基づく費用ゲート、内容を保存しないreceiptを提供します。`MockDecisionProvider`は`allowMock: true`を明示した試験だけで使用します。`TypeSafeJevProvider`は公開データ専用のserver側read-only adapterです。2026-09-20に利用者が承認した既存TypeSafe APIキーで公開合成fixtureを1件だけ実接続し、`green`、model `jev-1.13.0`、input 367／output 31 tokensを確認しました。Android Local Qwen接続、Cloud LLM、OS image統合、実機試験、domain別calibration、実際の課金額、継続的なキー登録・secret store運用は未検証です。検証は`node --experimental-strip-types --test tests/decision-provider.test.mjs tests/decision-integration.test.mjs`。
最終更新: 2026-09-21 / Pixel 10 compile-only Developer Previewの初回full build準備 / 完了 86/126件
| AI07 | Jev／TypeSafe・Local Qwen・Cloud LLM・deterministic codeをDecisionProviderとRouter／Harnessへ統合 | 進行中 | [記録](docs/prompts/jev-typesafe-local-qwen-handoff-20260918.md) · [記録](docs/jev-local-qwen-decision-fabric-design.md) · [記録](contracts/decision-provider.json) · [記録](data/decision-fabric-policy.json) · [記録](lib/decision/index.ts) · [記録](lib/decision/providers/mock.ts) · [記録](lib/decision/providers/typesafe-jev.ts) · [記録](tests/decision-provider.test.mjs) · [記録](tests/decision-integration.test.mjs) · [記録](scripts/jev-pixel-relay.mjs) · [記録](tests/jev-pixel-relay.test.mjs) · [記録](tests/android-jev-preview-boundary.test.mjs) · [記録](android/jev-preview/src/main/AndroidManifest.xml) · [記録](android/jev-preview/src/debug/AndroidManifest.xml) · [記録](android/jev-preview/src/debug/res/xml/pixel_jev_preview_network_security.xml) · [記録](android/jev-preview/src/debug/java/dev/rock/jevpreview/PixelJevPreviewDebug.java) · [記録](android/jev-preview/src/test/java/dev/rock/jevpreview/PixelJevPreviewProtocolTest.java) · [記録](android/jev-provider/build.gradle) · [記録](android/jev-provider/src/main/AndroidManifest.xml) · [記録](android/jev-provider/src/aosp/AndroidManifest.xml) · [記録](android/jev-provider/src/main/java/dev/rock/jev/provider/TypeSafeJevProvider.java) · [記録](android/jev-provider/src/test/java/dev/rock/jev/provider/TypeSafeJevProviderTest.java) · [記録](android/Android.bp) · [記録](android/settings.gradle) · [記録](os/physical/rockstaros.mk) · [記録](android/sepolicy/private/rockstar_platform.te) · [記録](android/sepolicy/private/seapp_contexts) · [記録](tests/android-jev-provider-boundary.test.mjs) · [記録](.github/workflows/android.yml) · [記録](docs/workstreams/07-android-device-local-ai.md) · [記録](docs/jev-ecosystem-integration-design.md) · [記録](docs/ai-native-os-architecture.md) |
次の作業: Jevは安全なruntime key provisioningが決まるまでdisabled／初回product除外を維持する。友人がAndroid SDK／Gradle環境でoptional providerのunit test・lint・Soong source buildを実行し、別途Pixel／OS full build／flashのgateは未合格のまま維持する。
````

### 2026-10-05 — merge `64acc829` で落ちた側 `78638565`（1行）

統合: Merge PR #43 nonfinancial particle game sandbox ／ 落ちた側の最後のcommit: feat(game): GAME01 minimal 2D particle sandbox loop at host/fixture stage (GM01)

````text
更新日: 2026-09-25 / 164 task中106 done・32 in progress・20 planned・6 blocked
````

### 2026-10-05 — merge `be8718a4` で落ちた側 `af38db8f`（1行）

統合: Merge PR #46 single-executor capability host fixtures ／ 落ちた側の最後のcommit: feat(core): AI05 host/fixture capability negotiation, single executor device, persistent selection and snapshot restore

````text
更新日: 2026-09-25 / 163 task中107 done・35 in progress・16 planned・5 blocked
````

### 2026-10-05 — merge `868b50de` で落ちた側 `829bf229`（1行）

統合: Merge PR #45 bounded-memory host fixtures ／ 落ちた側の最後のcommit: fix(core): AI03 tombstones keep only a digest of the deleted memory ID

````text
更新日: 2026-09-25 / 163 task中107 done・34 in progress・17 planned・5 blocked
````

### 2026-10-05 — merge `130c486b` で落ちた側 `504e43c6`（1行）

統合: Merge PR #44 external-write outbox host fixtures ／ 落ちた側の最後のcommit: fix(core): run the AI04 authority callback outside outbox transactions (PlatformStore rule)

````text
更新日: 2026-09-25 / 163 task中107 done・33 in progress・18 planned・5 blocked
````

### 2026-10-05 — merge `01eb6db6` で落ちた側 `b37c52a6`（1行）

統合: Merge PR #42 as isolated model profile host fixtures ／ 落ちた側の最後のcommit: Merge remote-tracking branch 'origin/chore/ledger-sync-20260925' into feat/ai02-model-pinning-fixture

````text
更新日: 2026-09-25 / 163 task中107 done・32 in progress・19 planned・5 blocked
````

### 2026-10-05 — merge `6bf43c23` で落ちた側 `846f3950`（2行）

統合: Merge PR #41 preserving current SIM service policy and ledgers ／ 落ちた側の最後のcommit: docs(ledger): note /preorder/ change observed at main 9f09b6a (2026-09-25 01:54 ET) for MAT16 without changing Site or task status

````text
- **公開中の製品ラインと参考価格は正式です（2026-09-25 00:49 ET、本人決定）。** avocadoMini 1台 ¥160,000（US$1,050）、avocadoMini 4台パッケージ ¥410,000（US$2,700、avokadoProは別売）、avokadoPro From ¥880,000（From US$5,800）。いずれも税・送料別の参考価格で、予約・決済は開始していません。この価格はMini/Pro製品ラインのもので、R5をこの製品ラインでどう扱うかは本人の判断待ちです（[製品ベース](docs/product-baseline.md)）。
更新日: 2026-09-25 / 163 task中106 done・31 in progress・20 planned・6 blocked
````

### 2026-09-24 — merge `f243a66d` で落ちた側 `02d9f5d8`（19行）

統合: Merge main and align project guide with R5 ／ 落ちた側の最後のcommit: Audit project guide coverage and current product status

````text
Mini200 E1は、下記P0.2の4本＋Hub、伸縮寸法、当時のキット目標価格を引き継ぎません。E1資料を保存した時点では商品サイトに旧構想が残っていました。現行の製品サイトと価格方針は冒頭のTower20 E3基準を参照してください。
RockstarOSは、avocadoMiniの操作、権限、保存、復旧をつなぐ技術基盤です。**Sky**で自分のAI自動化チームの仕事とToolを選び、**Zema**で依頼から成果まで進めます。**Material Invention Studio**はそのチームで発明候補を扱う構想で、現在はCoreのsandboxまで実装されています。[製品別の動くジャケット](#製品体系)も下で見られます。
![Skyで役割を探し、Zemaで進め、将来の発明チームで候補を試すRockstarOSの構想アニメーション。avocadoMiniは設計中。](docs/assets/rockstaros-intro.gif)
**いま確認できる入口:** 製品ホームとOS導入ガイドを公開ページとして分けます。SkyとZemaはRockstarOSのWeb利用画面、`/studio`はSky Tool SDK用の開発者画面です。Material Inventionの操作画面とSky接続は未実装です。現在の配信先には最新版が未配備で、未導入者のWebホームへの直接アクセス制限も未完了です。avocadoMiniの実機とスマートフォン向け完成OSはまだ提供していません。
### avocadoMini — 現行Tower20 E3の4本とEdge Hub
現行の外観方向は[固定式Tower20 E3の4本と別筐体Edge Hub](sites/avocado-mini/public/images/avocado-mini-tower20-e3-kit.png)です。各塔は高さ200mm以下、camera候補は1台で、追加の暗い窓は予約領域です。**41万円＋税は4本＋Edge Hubの予定基本価格**です。P0.2の伸縮塔とMini200 E1/E2の単体筐体は設計履歴として保持します。[現行E3基準](docs/avocado-mini-tower20-e3/README.md)を参照してください。構想画像は実機写真や性能・量産性の合格証拠ではありません。
製品・導入ホームページとは別の、WebアプリとOS内の作業画面です。Sky、Zema、Wallet、Market、Settingsへの入口を持ち、今日やりたいことがすぐ見つかる構成にします。Material InventionはSkyのチームで扱う予定ですが、操作画面への入口は未実装です。App Homeは各機能の正本を持たず、Platform Coreへ安全に導きます。
CSV整形とメルカリ出品準備はSkyに登録済みのチーム担当です。発明候補の操作・比較はMaterial Invention Coreを使う複合機能として設計しており、Skyからの実行はまだ接続していません。
![Material Invention Studioで物質の候補を組み合わせる構想を表したアニメーション](docs/assets/cover-material-studio.gif)
物質のデジタル模型を接続・分離し、候補branch、制約、安全状態、simulation結果、発明過程を記録する設計です。現在あるのはMaterial Invention Coreのsandboxで、操作画面、Sky接続、実機MRは未実装です。MR表示は物理実験を実行せず、Patent AIは特許性・発明者・出願を自動確定しません。
| avocadoMini Tower20 E3 | 現行製品構想。固定式の4塔と別筐体Edge Hubで作業領域を扱う | 設計と公開構想画像まで。実機試作、4camera同期、OS統合、製造は未受入 |
avocadoMiniはRockstarOSそのものではなく、将来Material Invention Studioを操作する専用デバイスとして設計中です。
| App | Home、SkyのAI自動化チーム、Zema、Wallet、Market。Material Inventionの操作画面は設計中 | 個人、クリエイター、事業者、研究者 |
MIS[Material Invention Studio\n発明チームの操作画面・設計中]
MIS -. Sky接続・操作画面は未実装 .-> MATERIAL
更新日: 2026-09-24 / 147 task中96 done・31 in progress・19 planned・1 blocked
<summary>147 taskと段階gateの詳細を開く</summary>
最終更新: 2026-09-24 / Pixel 10 compile-only Developer Previewの初回full build準備 / 完了 96/147件
| WEB06 | GitHubと製品紹介から主要アプリへ進む入口を整え、Web内の旧P0.2画面とE3正本、既存Siteの公開版を同期する | 進行中 | [記録](README.md) · [記録](app/rockstaros/page.tsx) · [記録](app/rockstaros/preview.module.css) · [記録](app/api/health/route.ts) · [記録](scripts/check-work-api.mjs) · [記録](docs/workstreams/05-web-pwa-sites.md) |
````

### 2026-09-24 — merge `f243a66d` で落ちた側 `506b7b8f`（1行）

統合: Merge main and align project guide with R5 ／ 落ちた側の最後のcommit: docs: preserve rocketstar design archive and OS supplements (#30)

````text
更新日: 2026-09-24 / 150 task中98 done・31 in progress・20 planned・1 blocked
````

### 2026-09-24 — merge `26125187` で落ちた側 `84bd3362`（1行）

統合: docs: integrate current OS design without losing R5 requirements ／ 落ちた側の最後のcommit: docs: preserve avocadoMini R5 package and organize design entry points

````text
更新日: 2026-09-24 / 148 task中96 done・31 in progress・20 planned・1 blocked
````

### 2026-09-24 — merge `26125187` で落ちた側 `0adb6f84`（1行）

統合: docs: integrate current OS design without losing R5 requirements ／ 落ちた側の最後のcommit: docs: add RockstarOS complete design v1.0 (#29)

````text
**2026-09-24 最新設計:** [原本PDF](docs/rockstaros-complete-design-v1.0.pdf)を、rocketstar、A-LINK、avokado、colonyを含む統合設計基準として保存しました。[全文検索用テキスト](docs/rockstaros-complete-design-v1.0.txt)と[SHA-256完全性記録](data/rockstaros-complete-design-v1.0.json)も同じ版へ固定しています。32章、5配備profile、13論理service、OSR-001〜060、43/43の構造・DDL検査を収録しますが、実装・実機・飛行・量産の完了を意味しません。
````

### 2026-09-21 — merge `5cafa240` で落ちた側 `3b35eac6`（3行）

統合: Merge remote-tracking branch 'origin/main' into codex/main-readme-fix-20260919 ／ 落ちた側の最後のcommit: Rebuild Rocket Star as launch film

````text
更新日: 2026-09-20 / 138 task中91 done・30 in progress・16 planned・1 blocked
<summary>138 taskと段階gateの詳細を開く</summary>
最終更新: 2026-09-20 / Pixel 10 compile-only Developer Previewの初回full build準備 / 完了 91/138件
````

### 2026-09-21 — merge `5cafa240` で落ちた側 `30c5b7bc`（2行）

統合: Merge remote-tracking branch 'origin/main' into codex/main-readme-fix-20260919 ／ 落ちた側の最後のcommit: Add public Sky and Zema preview installer

````text
更新日: 2026-09-21 / 138 task中92 done・28 in progress・17 planned・1 blocked
最終更新: 2026-09-21 / Pixel 10 compile-only Developer Previewの初回full build準備 / 完了 92/138件
````

### 2026-09-20 — merge `a495ffbf` で落ちた側 `df84413f`（1行）

統合: Merge prior PR history after main sync ／ 落ちた側の最後のcommit: docs: record published sensor glow

````text
| WEB05 | avocadoMiniの事業紹介とセンサー演出付き製品ページを更新 | 完了 | [記録](README.md) · [記録](docs/assets/avocado-mini-hardware-00-overview-v4-thin-tube.png) · [記録](docs/assets/rockstaros-spatial-table-full-scale-v2.png) · [記録](sites/avocado-mini/index.html) · [記録](sites/avocado-mini/guide/index.html) · [記録](sites/avocado-mini/src/main.js) · [記録](sites/avocado-mini/src/style.css) · [記録](sites/avocado-mini/dist/index.html) · [記録](sites/avocado-mini/public/images/avocado-mini-hero.png) · [記録](sites/avocado-mini/public/images/avocado-mini-detail.png) · [記録](sites/avocado-mini/public/images/motion-tower-satin-front-concept.png) · [記録](sites/avocado-mini/public/images/motion-tower-satin-side-concept.png) · [記録](sites/avocado-mini/public/images/motion-tower-satin-rear-concept.png) · [記録](sites/avocado-mini/public/images/motion-tower-satin-sensor-macro.png) · [記録](sites/avocado-mini/public/images/motion-tower-satin-four-point.png) · [記録](sites/avocado-mini/public/images/avocado-mini-kit.png) · [記録](sites/avocado-mini/public/images/avocado-mini-head-p0.png) · [記録](sites/avocado-mini/public/images/avocado-mini-base-p0.png) · [記録](docs/workstreams/05-web-pwa-sites.md) · [記録](app/rockstaros/page.tsx) · [記録](app/rockstaros/preview.module.css) · [記録](public/rockstaros/avocado-mini-concept.png) · [記録](docs/product-baseline.md) |
````

### 2026-09-20 — merge `a3a24b8b` で落ちた側 `963027cf`（11行）

統合: merge: sync main with origin and keep Sky local LLM work ／ 落ちた側の最後のcommit: feat: expand Sky local model catalog and connections

````text
更新日: 2026-09-20 / 117 task中78 done・25 in progress・13 planned・1 blocked
- **Zema**: Skyで依頼するかZemaからbotへ話しかけると仕事ごとのチャットが開き、入力確認、承認、実行状況、成果物を会話で追えます。同じタブでは再読込・チャット切替後も依頼と結果を確認できます（最大10分）。PCのMCP botも成果本文または失敗を会話に表示します。長期の本人別履歴は未対応です。
<summary>117 taskと段階gateの詳細を開く</summary>
最終更新: 2026-09-20 / AIネイティブOS詳細設計・共通CoreとSky／Zema／Gameの接続 / 完了 78/117件
| SKY20 | ローカルSkyへSDK Appの自動検出・Hub接続を追加し、旧Mr. Hub 11件とJev周辺自動化7件を候補表示 | 進行中 | [記録](components/sky-workspace.tsx) · [記録](toolkits/sky-tool-sdk/src/index.mjs) · [記録](toolkits/sky-mcp-connector/server.mjs) · [記録](docs/sky-mr-automation-candidates.md) |
| AI07 | JevをSkyの明示的remote evaluatorとして接続し、SDK/API互換・同意・rubric・receipt・privacy・料金縮退を受入 | 進行中 | [記録](docs/llm-evaluation-architecture.md) · [記録](data/llm-capabilities.json) · [記録](scripts/check-llm-architecture.mjs) · [記録](lib/jev-evaluation.ts) · [記録](app/api/jev-evaluation/route.ts) · [記録](components/jev-evaluation-runner.tsx) · [記録](tests/jev-evaluation.test.mjs) |
| SKY14 | 接続済みready商品と任意MCPをChatのbotとして表示し、方向修正・承認実行・結果・停止を一元管理 | 完了 | [記録](components/sky-chat-workspace.tsx) · [記録](components/mcp-bot-runner.tsx) · [記録](lib/mcp-hub.ts) · [記録](lib/mcp-tool-result.ts) · [記録](toolkits/sky-mcp-connector/server.mjs) · [記録](tests/mcp-connector.test.mjs) · [記録](tests/mcp-tool-result.test.mjs) · [記録](docs/chat-mcp-control-room-20260913.md) |
| SKY16 | SkyのTool選択と自然文依頼をZemaへ一回引き継ぎ、job状態を即時同期 | 完了 | [記録](lib/sky-zema-handoff.ts) · [記録](lib/zema-chat-session.ts) · [記録](lib/operations-client.ts) · [記録](components/sky-workspace.tsx) · [記録](components/sky-chat-workspace.tsx) · [記録](components/chat-live-progress.tsx) · [記録](tests/sky-zema-handoff.test.mjs) · [記録](tests/zema-chat-session.test.mjs) · [記録](tests/web-route-style-contract.test.mjs) · [記録](docs/sky.md) |
次の作業: SKY20は旧Mr. Hub 11候補とJev周辺7候補の実行器、本人接続、料金・結果照合を一件ずつ受け入れ、通るまでreadyにしない。PC内SDK Appのカード表示・接続・停止はローカルSkyで確認済み。AI07はJevのprovider sandboxで正常系・429・5xx・不正response・budget縮退を受入し、AI_GATEWAY_API_KEY、Terms/Privacy、料金上限を確認する。JevはSkyのcatalog／同意UI／closed rubric／Evaluation Receiptまで実装済みだが、本番provider接続は未完了。法務受付・特許アシスタントはSkyの別Toolとして維持し、AI02〜AI06、full build入力・署名・物理全損復元の未完了gateも独立して維持する。
- Sky MCP Connectorを一度起動すると、SkyのMCP画面から登録済みの自動化へワンタップ接続。現在の配布パックは基本4機能と受注型ブランド運営38機能を同じConnectorで検出します。Sky Tool SDK 0.1.2で起動したPC内AppもSkyの一覧へ現れ、カードから接続できます。旧Mr. Hub由来11件とJev周辺の自動化7件は導入候補で、実行器を接続するまで実行できません。
Zemaの`/chat`は会話履歴を開閉でき、入力欄からSky Toolと文章モデルを選べます。普通の会話には文章モデルの接続が必要です。Web版の既定QwenはBinder未接続時に利用不可を表示し、外部モデルは毎回の送信許可とserver設定が必要です。
````

### 2026-09-19 — merge `77c2e2ad` で落ちた側 `dd722ef0`（8行）

統合: Merge RockstarOS product updates into main ／ 落ちた側の最後のcommit: docs: define Jev evaluation architecture

````text
avocadoOSは、交換可能な高性能ローカルLLMとoffline agent runtimeを中核にするAIネイティブOSを目標に開発しています。現行は固定Qwen / llama.rn profileの試験署名Pixel APK実証で、複数model交換やOS image搭載は未完了です。SkyとZemaを最初の第一者systemとし、仕事・生活を便利にする自動化、Wallet／ファンド、ゲーム、IP／動画、VRを共通Coreへ接続して発展させます。製品要望の正本は [製品ベース](docs/product-baseline.md) のRQ01〜RQ48、LLMとJevの現在地は[LLM・評価モデル設計](docs/llm-evaluation-architecture.md)と[能力表](data/llm-capabilities.json)、具体的なCore契約と実装順は[AIネイティブOS詳細設計](docs/ai-native-os-architecture.md)、独立監査は[Sol設計監査](docs/ai-native-os-design-audit.md)、全層の組合せと未接続点は[全体構成監査](docs/system-composition.md)、進捗の正本は [data/project-status.json](data/project-status.json) です。内部識別子は互換性のため`dev.rock`で固定し、既存の`rockstaros-*`形式と`/rockstaros` URLは変更しません。現在版は`avocadoOS 1.0 Developer Preview`で、版表示は[data/product-identity.json](data/product-identity.json)から一元管理します。
更新日: 2026-09-19 / 116 task中78 done・24 in progress・13 planned・1 blocked
正本リポジトリ: [k999ln/rock](https://github.com/k999ln/rock)。旧ローカル作業名は `gg`。現在はGitHub `main` と実在する対象作業branchの最新SHAを再開基準とし、削除済みの旧branchやSSD上の旧checkoutを最新と仮定しません。製品は`avocadoOS`の1つとし、非公開の`k999ln/Mr.`はTelegram・クラウド運用component、`vvvv`は旧履歴として扱います。役割と重複の整理は [Gitプロジェクト統合方針](docs/git-consolidation.md)、事業方針・設計・次の作業は [project.md](project.md)、4つの参考元の採用判断は [参照記録](docs/reference-repositories.md) にまとめます。
<summary>116 taskと段階gateの詳細を開く</summary>
最終更新: 2026-09-19 / AIネイティブOS詳細設計・共通CoreとSky／Zema／Gameの接続 / 完了 78/116件
| SKY17 | SkyへToolチーム入口を統合し利益連動成功報酬・Wallet決済・開発者還元を設計（率・月上限等確認中、未実装） | 進行中 | [記録](docs/sky-network-economy.md) · [記録](docs/sky-billing.md) |
| AI07 | JevをSkyの明示的remote evaluatorとして接続し、SDK/API互換・同意・rubric・receipt・privacy・料金縮退を受入 | 進行中 | [記録](docs/llm-evaluation-architecture.md) · [記録](data/llm-capabilities.json) · [記録](scripts/check-llm-architecture.mjs) |
次の作業: AI07はJevをSkyの明示的remote evaluatorとして実装する前に、AI SDK更新または公式HTTP APIを選び、Node/Cloudflare互換、privacy、料金上限、失敗縮退のfixtureを通す。route・同意UI・allowlist rubric・Evaluation Receiptが揃うまでcatalog readyにしない。SKY17の成功報酬条件確認、AI02〜AI06、full build入力・署名・物理全損復元の未完了gateも独立して維持する。
````

### 2026-09-19 — merge `77c2e2ad` で落ちた側 `771770d0`（6行）

統合: Merge RockstarOS product updates into main ／ 落ちた側の最後のcommit: docs: publish RockstarOS product map and avocadoMini design

````text
更新日: 2026-09-18 / 126 task中86 done・22 in progress・17 planned・1 blocked
正本リポジトリ: [k999ln/rock](https://github.com/k999ln/rock)。旧ローカル作業名は `gg`。現在の実装再開先は `codex/rockstaros-launch-candidate-20260910` で、SSD上の旧checkoutを最新と仮定しません。製品は`RockstarOS`の1つとし、非公開の`k999ln/Mr.`はTelegram・クラウド運用component、`vvvv`は旧履歴として扱います。役割と重複の整理は [Gitプロジェクト統合方針](docs/git-consolidation.md)、事業方針・設計・次の作業は [project.md](project.md)、4つの参考元の採用判断は [参照記録](docs/reference-repositories.md) にまとめます。
<summary>126 taskと段階gateの詳細を開く</summary>
最終更新: 2026-09-18 / Pixel 10 compile-only Developer Previewの初回full build準備 / 完了 86/126件
| AI07 | Jev／TypeSafe・Local Qwen・Cloud LLM・deterministic codeをDecisionProviderとRouter／Harnessへ統合 | 未着手 | [記録](docs/prompts/jev-typesafe-local-qwen-handoff-20260918.md) · [記録](docs/jev-local-qwen-decision-fabric-design.md) · [記録](contracts/decision-provider.json) · [記録](data/decision-fabric-policy.json) · [記録](docs/jev-ecosystem-integration-design.md) · [記録](docs/ai-native-os-architecture.md) |
次の作業: Scalewayの課金確認後、Ubuntu 24.04 / 32 dedicated vCPU / 64 GB RAM / 600 GBで固定sourceをsyncし、Operator Agentを明示除外したbringup modeでtarget-files-packageとotatools-packageをbuildする。RELEASE_FLASH gate、production signing、実機flashは未合格のまま維持する。
````

### 2026-09-16 — merge `81e6c88c` で落ちた側 `9c9ec4fd`（1行）

統合: merge: integrate remote launch gates safely ／ 落ちた側の最後のcommit: feat(android): add restricted operator agent

````text
更新日: 2026-09-16 / 108 task中77 done・23 in progress・8 planned
````

### 2026-09-16 — merge `81e6c88c` で落ちた側 `49454c55`（7行）

統合: merge: integrate remote launch gates safely ／ 落ちた側の最後のcommit: Merge pull request #24 from k999ln/codex/complete-lch06-20260915

````text
更新日: 2026-09-15 / 103 task中74 done・19 in progress・9 planned・1 blocked
多機種対応は、**共通RockstarOS Core＋機種／SKU別Device Support Package**で進めます。提供区分は完全なOS image、Android GSI実験版、既存OS上のclient、非対応を混同しません。最初の物理対象は所有済みPixel 10／`frankel`に決定し、Pixel 7はその受入後まで保留します。BlackBerryは機種別調査、iPhone／iPadはOS置換ではなくclientです。[多機種対応設計](docs/device-support-architecture.md)／[機械可読の対応台帳](data/device-support-matrix.json)。
<summary>103 taskと段階gateの詳細を開く</summary>
最終更新: 2026-09-15 / OS Platform Core v1の登録・承認・Wallet・更新境界 / 完了 74/103件
| OS10 | Tool／MCP／Provider共通API、本人承認、Wallet台帳、暗号化backup、署名更新gateのsourceを実装 | 進行中 | [記録](docs/platform-core.md) · [記録](docs/os-prototype.md) · [記録](contracts/platform-api.json) · [記録](android/core/src/main/java/dev/rock/core/platform/PlatformStore.java) · [記録](android/tool-sdk/src/main/aidl/dev/rock/sdk/IPlatformApi.aidl) · [記録](android/automation/src/main/java/dev/rock/automation/AndroidOwner.java) · [記録](android/automation/src/main/java/dev/rock/automation/RockPlatformService.java) · [記録](android/sepolicy/private/rockstar_platform.te) |
| LCH06 | PR系列・正確なmain統合tree・版表示の整合 | 完了 | [記録](docs/launch-readiness-20260910.md) · [記録](docs/current-state-20260911.md) · [記録](docs/workstreams/10-git-ci-operations.md) · [記録](data/version-boundaries.json) · [記録](scripts/check-version-boundaries.mjs) · [記録](tests/version-boundaries.test.mjs) · [記録](docs/version-boundaries.md) |
次の作業: 最短ローンチ経路はWEB01。GitHub mainは全体検証済みだが、本人限定Sitesは接続中のアカウントが所有workspaceと一致せず、ブラウザがAccess Denied、Sites APIがproject_not_foundを返すため配備とD1 readbackを停止中。所有workspaceへ接続後、検証済みの最新mainを配備して主要導線・API・security header・migrationをreadbackする。待機中も一般公開、QEMU配布、Android実機、本番金融の別gateを混同せず進める。
````

### 2026-09-15 — merge `acd7ab09` で落ちた側 `81bc9a3b`（2行）

統合: merge: preserve Sites work and unify RockstarOS UI ／ 落ちた側の最後のcommit: feat: unify RockstarOS launch and Studio design

````text
**製品の正本は [製品ベース](docs/product-baseline.md)（RQ01〜RQ39）です。** [現在の開発状態](docs/current-state-20260911.md)、[次の再開指示](docs/prompts/rock-current-next-20260911.md)、[プロンプト作成規約](docs/prompt-playbook.md)、[OS受入報告の雛形](docs/templates/os-acceptance-report.md)を入口にしてください。b7/rc2は限定受入済み、スマホ版はソース準備段階です。手数料0はATMの自社手数料、ゲーム料金は未定です。Skyの8.88 USDは先払い月額ではなく、検証済み自動化収益からだけ回収する月間上限です。
最終更新: 2026-09-15 / Developer Preview紹介とRock Studioのvisual systemを統一 / 完了 67/92件
````

### 2026-09-15 — merge `acd7ab09` で落ちた側 `fc28d927`（2行）

統合: merge: preserve Sites work and unify RockstarOS UI ／ 落ちた側の最後のcommit: docs(csv): record production deployment evidence

````text
最終更新: 2026-09-15 / Rock StudioのSky SDK導線を維持し、CSV整形の決定的変換・独立検査・私有成果物・料金境界を同じSites本番系統へ統合 / 完了 65/91件
次の作業: CSVの独立queueを配置して実スマホ閉鎖後の完了を受入し、真正な第三者1件の販売・入金・納品をProvider証拠で検証する。
````

### 2026-09-15 — merge `d4bd901d` で落ちた側 `7eeed76d`（1行）

統合: merge: integrate latest Sky Studio with CSV workflow ／ 落ちた側の最後のcommit: feat(csv): add paid cleanup workflow

````text
最終更新: 2026-09-14 / CSV整形を最初の販売仕事として、決定的変換・独立検査・私有成果物・スマホ受付・料金境界を既存Sites本番系統へ統合 / 完了 64/90件
````

### 2026-09-15 — merge `d4bd901d` で落ちた側 `89dfdaf9`（1行）

統合: merge: integrate latest Sky Studio with CSV workflow ／ 落ちた側の最後のcommit: feat: make Sky Studio SDK-first

````text
最終更新: 2026-09-15 / Rock Studioを既存ツールへSky SDKコードを付ける導線へ統合 / 完了 65/90件
````

### 2026-09-15 — merge `f2dcee42` で落ちた側 `9b0f5cc4`（17行）

統合: Merge remote-tracking branch 'refs/remotes/sites/main' into codex/os-backend-launch-integrated-20260912 ／ 落ちた側の最後のcommit: feat: add chat-based Sky tool studio

````text
**製品の正本は [製品ベース](docs/product-baseline.md)（RQ01〜RQ23）です。** [現在の開発状態](docs/current-state-20260911.md)、[次の再開指示](docs/prompts/rock-current-next-20260911.md)、[プロンプト作成規約](docs/prompt-playbook.md)、[OS受入報告の雛形](docs/templates/os-acceptance-report.md)を入口にしてください。b7/rc2は限定受入済み、スマホ版はソース準備段階です。手数料0はATMの自社手数料、ゲーム料金は未定です。Skyの8.88 USDは先払い月額ではなく、検証済み自動化収益からだけ回収する月間上限です。
最終更新: 2026-09-15 / Rock Studioをコード貼付・ファイル添付だけのSky Tool作成チャットへ統合 / 完了 37/61件
| SKY04 | tob無料のConnection Passport・実行契約・ToB/ToC貢献分配を一画面で説明するSky Networkフロント | 完了 | [記録](app/sky/network/page.tsx) · [記録](components/sky-network.tsx) · [記録](components/sky-network.module.css) · [記録](docs/sky-network-economy.md) · [記録](scripts/check-product-baseline.mjs) · [記録](tests/product-baseline.test.mjs) · [記録](components/sky-workspace.tsx) · [記録](components/fashion-brand-ops-runner.tsx) · [記録](app/workspace.css) · [記録](scripts/check-sky.mjs) · [記録](lib/sky-routing.ts) · [記録](tests/sky-routing.test.mjs) · [記録](docs/sky-assistant-and-memory.md) |
| SKY07 | 登録済みMCPをこのPCへワンタップ接続し、Sky Cloud・提供者MCPの外部接続を追加する | 進行中 | [記録](components/sky-mcp-center.tsx) · [記録](components/sky-mcp-center.module.css) · [記録](components/fashion-brand-ops-runner.tsx) · [記録](lib/mcp-hub.ts) · [記録](lib/fashion-mcp-client.ts) · [記録](toolkits/sky-mcp-connector/server.mjs) · [記録](scripts/package-sky-mcp.py) · [記録](public/toolkits/sky-mcp-connector.zip) · [記録](public/toolkits/fashion-brand-ops-connector.zip) · [記録](docs/sky-mcp-connector.md) · [記録](tests/mcp-connector.test.mjs) · [記録](tests/fashion-mcp-client.test.mjs) · [記録](tests/sky-mcp-onboarding.test.mjs) · [記録](docs/product-baseline.md) |
| SKY08 | 既存の自動化関数をSky商品へ変える組込みSDK・標準雛形・PC登録・宣言公開・匿名利用集計を実装 | 完了 | [記録](docs/sky-tool-sdk.md) · [記録](toolkits/sky-tool-sdk/README.md) · [記録](toolkits/sky-tool-sdk/src/index.mjs) · [記録](toolkits/sky-tool-sdk/bin/create-sky-tool.mjs) · [記録](app/studio/page.tsx) · [記録](components/rock-studio.tsx) · [記録](lib/sky-tool-package.ts) · [記録](lib/sky-developer-auth.ts) · [記録](lib/sky-tool-events.ts) · [記録](drizzle/0006_sticky_beast.sql) · [記録](tests/sky-tool-sdk.test.mjs) · [記録](tests/sky-tool-package.test.mjs) |
| SKY09 | コード貼付またはファイル添付だけで解析・Sky組込み・Package登録まで行うチャット型Studioを実装 | 完了 | [記録](components/rock-studio.tsx) · [記録](lib/sky-code-intake.ts) · [記録](app/workspace.css) · [記録](tests/sky-code-intake.test.mjs) · [記録](docs/sky-tool-sdk.md) |
| LCH08 | ローカルOSバックエンドの安全終了・ヘルスチェック・再起動時のreceipt復元を検証 | 完了 | [記録](docs/backend-launch-20260912.md) · [記録](systems/rock-star-os/scripts/verify-backend-launch.py) · [記録](systems/rock-star-os/tests/test_hub.py) · [記録](systems/rock-star-os/tests/test_hub_server.py) |
| FB05 | 改善版Skyの役割フィードへブランド運営役と41 MCP操作を統合 | 完了 | [記録](components/sky-workspace.tsx) · [記録](lib/sky-routing.ts) · [記録](tests/sky-routing.test.mjs) · [記録](docs/sky-assistant-and-memory.md) |
| FB07 | 世界観と商品だけで市場・投稿・接客・受注導線を作るProducerモードを追加 | 完了 | [記録](lib/fashion-quick-plan.ts) · [記録](components/fashion-brand-ops-runner.tsx) · [記録](toolkits/fashion-brand-ops/src/service.mjs) · [記録](toolkits/fashion-brand-ops/src/tools.mjs) · [記録](toolkits/fashion-brand-ops/db/migrations/005_producer_runs.sql) · [記録](toolkits/fashion-brand-ops/test/service.test.mjs) · [記録](tests/fashion-quick-plan.test.mjs) |
| BIL01 | 先払い月額を停止し、検証済み自動化収益からだけ実費後に月最大888 centsを精算 | 完了 | [記録](docs/sky-billing.md) · [記録](services/sky-billing/src/worker.ts) · [記録](tests/billing.test.mjs) · [記録](tests/billing-worker.test.mjs) · [記録](services/sky-billing/migrations/0002_earnings_settlement.sql) |
次の作業: 一般公開前にTool Sandbox、作者署名、審査操作、失効配信、公開remote MCP/OAuthの受入を実装する。
- Sky MCP Connectorを一度起動すると、SkyのMCP画面から登録済みの自動化へワンタップ接続。現在の配布パックは基本4機能とAIブランドProducer 41機能を同じConnectorで検出します。
- 開発者はPCの[`/studio`](app/studio/page.tsx)へコードを貼るかファイルを添付するだけで、LLM向け用途・Schema・Adapter・権限・料金・試験を含むPackageとSky組込みコードを生成し、所有者登録まで進められます。コード本文はRegistryへ送りません。[設計と公開境界](docs/sky-tool-sdk.md)
- 既存Node.jsの自動化関数は[`Sky Tool SDK`](toolkits/sky-tool-sdk/README.md)の`handler`へ接続すると、同じ定義からSky登録、MCP `tools/list` / `tools/call`、本文を含まない匿名利用集計を利用できます。`create-sky-tool`はその標準雛形を生成します。
`os:backend:launch` は公開開発fixtureと一時SQLiteだけで、ローカルHubの起動、認証境界、署名ツール実行、SIGTERM、安全な再起動、receipt復元を確認します。実OS boot、実機、外部provider、実資金の検証ではありません。現在のP0/P1/P2と復旧手順は[OSバックエンド・ローンチ手順](docs/backend-launch-20260912.md)を参照してください。
改善版Skyでは、上部の「ブランド運営役」または「Instagramの広告からDM受注まで進めて」のような依頼からこの商品を開けます。Producerモードで世界観と商品だけを入力し、商品画面から41 MCP操作、Campaign Autopilot、Sales Concierge、Production Cockpit、approval gateの状態へ進めます。Sky受付の範囲と未実装のMemoryは[`docs/sky-assistant-and-memory.md`](docs/sky-assistant-and-memory.md)に記録しています。
世界観と商品だけで始めるProducer、ブランド方針・商品design、市場判定、Instagram運用、DM、注文、決済、制作・発送、分析に加え、Campaign Autopilot、AI Sales Concierge、Production Cockpit、経営ダッシュボード、本番接続診断、Instagram画面候補取込を41個のMCP toolとして公開します。Producerは市場・2週間の投稿計画・最初の広告下書き・生成承認待ちまでを1回で作ります。既定は全Providerがmockです。価格変更、外部生成、投稿、広告、DM送信、請求、返金、通知は署名付き個別approvalがない限り実行されません。`paid`と`refunded`は検証済み決済event以外から変更できません。
````

### 2026-09-14 — merge `c9dbe591` で落ちた側 `3006715d`（2行）

統合: merge: integrate Sites history for wallet release ／ 落ちた側の最後のcommit: feat: launch generic paper market and autonomous funds

````text
最終更新: 2026-09-13 / 汎用PAPER市場のValue/Spendフローと、検証済み実績を30秒ごとに再計算する自律型ファンドを本人限定Webへ統合 / 完了 58/82件
次の作業: 全体verify後に同一commitをGitHubと本人限定Sitesへ反映し、/marketと/fundの保存・再計算フローを実環境で確認する。
````

### 2026-09-13 — merge `95ca598e` で落ちた側 `dd94b57e`（16行）

統合: Merge verified Sites market and fund workspaces ／ 落ちた側の最後のcommit: feat(wallet): connect the Rockstar revenue flow

````text
**製品の正本は [製品ベース](docs/product-baseline.md)（RQ01〜RQ34）です。** [現在の開発状態](docs/current-state-20260911.md)、[次の再開指示](docs/prompts/rock-current-next-20260911.md)、[プロンプト作成規約](docs/prompt-playbook.md)、[OS受入報告の雛形](docs/templates/os-acceptance-report.md)を入口にしてください。b7/rc2は限定受入済み、スマホ版はソース準備段階です。手数料0はATMの自社手数料、ゲーム料金は未定です。Skyの8.88 USDは先払い月額ではなく、全自動化ファンドを合算した検証済み純収益からだけ回収する利用者単位の月間上限です。承認済み実費と当月Sky利用料を除く残額は100%利用者に帰属します。
Rock Walletは、Sky収益・ToB商品の販売収益・ファンド分配を確認して払出しへつなぐ共通精算口座として再構成しました。本人別の手入力台帳は未照合記録として分離し、受取可能額へ加算しません。保存済みファンド設定は試算としてWalletへ表示し、Provider確認前の収益を実入金と扱いません。[Walletの実装境界](docs/rock-wallet-revenue-hub-20260913.md)。
最終更新: 2026-09-13 / 本番側の公開gate・永続Walletと、動的自動化ファンド・Markets・固定commit bot sandboxを統合 / 完了 52/77件
| FND01 | 利用可能な自動化ツールから数を固定しないファンドを形成し、構成数・参加・版をD1へ保存 | 完了 | [記録](lib/automation-fund.ts) · [記録](lib/automation-fund-store.ts) · [記録](app/api/automation-funds/route.ts) · [記録](components/autonomous-fund-market.tsx) · [記録](drizzle/0008_wooden_avengers.sql) · [記録](tests/automation-fund.test.mjs) |
| FND02 | ファンド・ツール別の検証済み収益を集計し、全ファンド合算の月最大8.88 USDと利用者帰属額を実Providerで精算 | 進行中 | [記録](services/sky-billing/migrations/0003_automation_funds.sql) · [記録](services/sky-billing/src/domain.ts) · [記録](services/sky-billing/src/worker.ts) · [記録](tests/billing-worker.test.mjs) · [記録](docs/product-baseline.md) |
| MKT01 | RockstarOS Marketsを自動化ファンドの読取専用市場分析アダプターとして統合 | 完了 | [記録](lib/markets-adapter.ts) · [記録](app/api/markets/analysis/route.ts) · [記録](components/polymarket-workspace.tsx) · [記録](tests/markets-adapter.test.mjs) · [記録](docs/markets-fund-integration-20260913.md) |
| MKT02 | 外部Polymarket botを固定commit・clean treeのoffline backtest sandboxとして統合 | 完了 | [記録](lib/polymarket-bot-adapter.ts) · [記録](app/api/markets/bot/assess/route.ts) · [記録](toolkits/polymarket-bot-sandbox/run-backtest.mjs) · [記録](components/polymarket-workspace.tsx) · [記録](tests/polymarket-bot-adapter.test.mjs) · [記録](docs/polymarket-bot-sandbox-20260913.md) |
| WLT01 | 本人別D1台帳で売上・経費・取消・冪等性を実装 | 完了 | [記録](app/api/wallet/route.ts) · [記録](components/wallet-workspace.tsx) · [記録](lib/operations.ts) · [記録](tests/wallet-backend.test.mjs) |
| WLT02 | WalletをSky収益・ファンド分配・払出しの共通精算口座へ再構成 | 完了 | [記録](components/revenue-wallet-workspace.tsx) · [記録](app/wallet/revenue-wallet.css) · [記録](lib/operations.ts) · [記録](docs/rock-wallet-revenue-hub-20260913.md) · [記録](tests/wallet-backend.test.mjs) |
| WLT03 | 検証済みEarning Receiptとファンド分配Receiptを受取可能額・払出し状態へ接続 | 進行中 | [記録](docs/rock-wallet-revenue-hub-20260913.md) · [記録](docs/sky-billing.md) |
次の作業: 本人限定Web/PWAへ統合版を反映する。botの実注文は無効のまま十分な期間のbacktestを行い、実収益Providerは契約済みsandboxで約定・清算・手数料・取消・返金を照合する。QEMU配布は所有者の製品licenseと正式鍵の保管先が決まるまでblockedを維持する。
- 利用可能な自動化ツールから、数を固定しない自動化ファンドを作成。初期推奨は5ツールで、構成数を変更可能。
- 自動化ファンドの選択、構成ツール、役割、配分根拠、版をアカウントごとに保存。旧マイツール用の保存・導入プラン関数も保持。
- ホームはSky。新しい自動化ファンドは `/fund`、従来の80/10/10分配試算は履歴確認用の `/fund/legacy` に分離。
- Provider確認済みの売上だけをファンド別に集計し、承認済み実費、全ファンド合算で月最大8.88 USD、利用者受取可能額を分離。成果報酬と共同留保は0。入金・送金Providerは未接続。
自動化ファンドの形成・参加・配分、単独ツールの実行メタデータ、仕事の進捗はSitesのD1に保存します。ファンド数に製品上の固定上限はありませんが、一覧APIは安全な応答上限を持ちます。旧ファンド試算と旧マイツール用ローカル保存関数は互換用に保持しています。接続アドレスは保存せず、サーバーへ送信しません。ウォレット接続はログイン認証・実名本人確認・送金認可ではありません。外部Providerが未接続のため、現時点の構成・配分は実利回りや収益保証を示しません。
````

### 2026-09-13 — merge `38467af4` で落ちた側 `eebe680f`（3行）

統合: merge: unify production release and revenue fund work ／ 落ちた側の最後のcommit: fix(markets): harden bot backtest sandbox

````text
**製品の正本は [製品ベース](docs/product-baseline.md)（RQ01〜RQ31）です。** [現在の開発状態](docs/current-state-20260911.md)、[次の再開指示](docs/prompts/rock-current-next-20260911.md)、[プロンプト作成規約](docs/prompt-playbook.md)、[OS受入報告の雛形](docs/templates/os-acceptance-report.md)を入口にしてください。b7/rc2は限定受入済み、スマホ版はソース準備段階です。手数料0はATMの自社手数料、ゲーム料金は未定です。Skyの8.88 USDは先払い月額ではなく、全自動化ファンドを合算した検証済み純収益からだけ回収する利用者単位の月間上限です。承認済み実費と当月Sky利用料を除く残額は100%利用者に帰属します。
最終更新: 2026-09-13 / 外部Polymarket botを固定commitのoffline backtest sandboxとしてMarketsへ統合 / 完了 45/69件
次の作業: botの実注文は無効のまま、十分な期間のorderbook JSONLでbacktestを実行し、report検証UIを通す。実収益Providerは別途選定し、契約済みsandboxで約定・清算・手数料・取消・返金を照合する。
````

### 2026-09-13 — merge `38467af4` で落ちた側 `98a1c34f`（3行）

統合: merge: unify production release and revenue fund work ／ 落ちた側の最後のcommit: feat(wallet): add persistent account ledger

````text
**製品の正本は [製品ベース](docs/product-baseline.md)（RQ01〜RQ31）です。** [現在の開発状態](docs/current-state-20260911.md)、[次の再開指示](docs/prompts/rock-current-next-20260911.md)、[プロンプト作成規約](docs/prompt-playbook.md)、[OS受入報告の雛形](docs/templates/os-acceptance-report.md)を入口にしてください。b7/rc2は限定受入済み、スマホ版はソース準備段階です。手数料0はATMの自社手数料、ゲーム料金は未定です。Skyの8.88 USDは先払い月額ではなく、検証済み自動化収益からだけ回収する月間上限です。
最終更新: 2026-09-13 / QEMU rc2の6/10公開gateに加え、Android実機5gateとマイナンバー7gateを端末・build・規制単位で機械監査 / 完了 47/70件
次の作業: 所有者が製品licenseと正式鍵の保管先を明示した後、license・production署名を同一最終archiveへ結合しfresh導入・更新・復旧を再受入する。
````

### 2026-09-13 — merge `57020640` で落ちた側 `4f5cfed5`（4行）

統合: Merge durable Chat and Wallet workspaces ／ 落ちた側の最後のcommit: feat(wallet): add durable income and expense workspace

````text
最終更新: 2026-09-13 / Walletの情報設計と収益後精算フロントをDeveloper Previewへ実装 / 完了 43/66件
| SKY13 | GrokをモチーフにChatの表示・入力を改善し、依頼から実行・結果までを会話内へ統合 | 完了 | [記録](components/sky-chat-workspace.tsx) · [記録](app/workspace.css) · [記録](lib/operations.ts) · [記録](tests/operations.test.mjs) · [記録](scripts/check-sky.mjs) · [記録](docs/chat-usability-20260912.md) |
| SKY14 | 接続済みready商品と任意MCPをChatのbotとして表示し、方向修正・承認実行・結果・停止を一元管理 | 完了 | [記録](components/sky-chat-workspace.tsx) · [記録](components/mcp-bot-runner.tsx) · [記録](lib/mcp-hub.ts) · [記録](toolkits/sky-mcp-connector/server.mjs) · [記録](tests/mcp-connector.test.mjs) · [記録](docs/chat-mcp-control-room-20260913.md) · [記録](docs/product-baseline.md) · [記録](data/product-baseline.json) |
- 接続済みのready商品とMCP serverはChatへbotとして自動表示されます。botを選び、方向・修正指示、公開機能とJSON引数、1回承認、結果、停止を同じスレッドで管理します。実行中の割り込みをMCPが公開していない場合、修正は次の実行へ反映します。[Chat MCP管理の契約](docs/chat-mcp-control-room-20260913.md)
````

### 2026-09-12 — merge `654b1e09` で落ちた側 `58f1aa56`（1行）

統合: Merge remote-tracking branch 'sites/main' into codex/mercari-revenue-loop-20260912 ／ 落ちた側の最後のcommit: feat: add Mercari revenue starter

````text
最終更新: 2026-09-12 / OS lifecycle、Sky MCP、メルカリ収益スターター、収益後精算Worker、ホーム・設定UIを本人限定Developer Previewへ統合 / 完了 41/64件
````

### 2026-09-12 — merge `654b1e09` で落ちた側 `1108ebff`（1行）

統合: Merge remote-tracking branch 'sites/main' into codex/mercari-revenue-loop-20260912 ／ 落ちた側の最後のcommit: feat(settings): add OS diagnostics and encrypted recovery

````text
最終更新: 2026-09-12 / OS Hub lifecycle、Sky MCP、収益後精算Worker、ホーム・設定・端末保全UIを本人限定Developer Previewへ統合・公開 / 完了 41/64件
````

### 2026-09-12 — merge `ae9d30e7` で落ちた側 `0cc5415e`（6行）

統合: Merge commit '0cc5415e4724199505e1f54942918b72eb88ccae' into codex/os-backend-sites-launch-20260912 ／ 落ちた側の最後のcommit: Merge pull request #13 from k999ln/codex/sky-one-click-fashion-mcp-20260912

````text
**製品の正本は [製品ベース](docs/product-baseline.md)（RQ01〜RQ19）です。** [現在の開発状態](docs/current-state-20260911.md)、[次の再開指示](docs/prompts/rock-current-next-20260911.md)、[プロンプト作成規約](docs/prompt-playbook.md)、[OS受入報告の雛形](docs/templates/os-acceptance-report.md)を入口にしてください。b7/rc2は限定受入済み、スマホ版はソース準備段階です。手数料0はATMの自社手数料、ゲーム料金は未定、OS月額は維持します。
最終更新: 2026-09-12 / SkyからFashion Brand Ops MCPへのワンクリック接続・38操作・失効・画面検証に合格 / 完了 29/51件
| SKY04 | 黒基調の改善版SkyへFashion Brand Opsを統合し、スマホDialogの画面外ずれを修正 | 完了 | [記録](components/sky-workspace.tsx) · [記録](components/fashion-brand-ops-runner.tsx) · [記録](app/workspace.css) · [記録](scripts/check-sky.mjs) · [記録](lib/sky-routing.ts) · [記録](tests/sky-routing.test.mjs) · [記録](docs/sky-assistant-and-memory.md) |
| SKY05 | Skyの商品カード1回でFashion Brand Ops MCPを初期化し、38操作と接続状態を同期 | 完了 | [記録](lib/fashion-mcp-client.ts) · [記録](components/fashion-brand-ops-runner.tsx) · [記録](toolkits/fashion-brand-ops/src/http.mjs) · [記録](toolkits/fashion-brand-ops/test/browser-connect.test.mjs) · [記録](tests/fashion-mcp-client.test.mjs) · [記録](public/toolkits/fashion-brand-ops-connector.zip) |
| B02 | 既存商品のSky実利用と不便の改善・実行/料金/権利の条件拡張 | 進行中 | [記録](docs/prompts/hub-wallet-next.md) · [記録](docs/pc-citations-adapter.md) · [記録](docs/evidence/pc-citations/integration.json) · [記録](docs/evidence/os-base/business-backup-acceptance-b8287bc.json) · [記録](docs/sky-rockstar-ledger-20260912.md) · [記録](docs/evidence/sky-rockstar-ledger/integration.json) · [記録](tests/rockstar-ledger.test.mjs) |
次の作業: Meta OAuthのApp ID/secret、Professional account、公開Webhook URLを接続し、read-only discoveryから本人承認付き限定テスト投稿へ進む。Sites再配信は正しい所有ワークスペース接続後に行う。
````

### 2026-09-12 — merge `c7c284a2` で落ちた側 `d4456986`（3行）

統合: merge: prepare Sky backend launch candidate ／ 落ちた側の最後のcommit: feat(sky): finalize MCP onboarding and settlement

````text
最終更新: 2026-09-12 / Sky内MCP導入を検証しつつ、先払いを廃止して検証済み自動化収益からの月最大888 cents精算核を実装 / 完了 32/56件
| SKY07 | MCPごとにこのPC・Sky Cloud・提供者MCPの接続先を選び、対応先へワンタップ接続する | 進行中 | [記録](components/sky-mcp-center.tsx) · [記録](components/sky-mcp-center.module.css) · [記録](lib/mcp-hub.ts) · [記録](toolkits/sky-mcp-connector/server.mjs) · [記録](scripts/package-sky-mcp.py) · [記録](public/toolkits/sky-mcp-connector.zip) · [記録](docs/sky-mcp-connector.md) · [記録](tests/mcp-connector.test.mjs) · [記録](tests/sky-mcp-onboarding.test.mjs) · [記録](docs/product-baseline.md) |
次の作業: 有償需要のある自動化商品を1件選び、販売・決済・払出しProvider sandboxをExecution Receiptと接続して、実入金なしのfixtureではなくProvider検証済みEarning Receiptの縦断受入を行う。
````

### 2026-09-12 — merge `a87e08b8` で落ちた側 `0a14254d`（3行）

統合: Merge latest Sky Sites source ／ 落ちた側の最後のcommit: Improve Sky MCP onboarding and compatibility

````text
最終更新: 2026-09-12 / SkyのMCP導入・接続体験を改善 / 完了 27/49件
| SKY07 | MCP掲載前診断とPC接続の互換性・初回導線を改善 | 完了 | [記録](lib/mcp-inspection.ts) · [記録](app/api/sky/mcp/inspect/route.ts) · [記録](lib/device.ts) · [記録](components/sky-publisher-form.tsx) · [記録](components/device-connection.tsx) · [記録](tests/mcp-inspection.test.mjs) · [記録](tests/device-lifecycle.test.mjs) |
次の作業: 第三者MCPの実OAuth、長時間job、取消・失効をプロバイダーごとに相互運用試験する。Android/AOSP側のfull build・製品移植・production署名・実機受入は引き続き未完了。
````

### 2026-09-12 — merge `a87e08b8` で落ちた側 `2cb3587f`（1行）

統合: Merge latest Sky Sites source ／ 落ちた側の最後のcommit: feat: split Sky apps from Chat

````text
最終更新: 2026-09-12 / 基本アプリをSky・Chat・Wallet・Polymarketへ分離 / 完了 28/50件
````

### 2026-09-12 — merge `60654268` で落ちた側 `dcb35ada`（3行）

統合: feat(sky): integrate brand operations into role feed ／ 落ちた側の最後のcommit: feat(sky): prepare improved chrome for brand ops

````text
最終更新: 2026-09-12 / 改善版SkyへFashion Brand Opsを統合し、スマホDialogの配置修正を検証中 / 完了 27/50件
| SKY04 | 黒基調の改善版SkyへFashion Brand Opsを統合し、スマホDialogの画面外ずれを修正 | 進行中 | [記録](components/sky-workspace.tsx) · [記録](components/fashion-brand-ops-runner.tsx) · [記録](app/workspace.css) · [記録](scripts/check-sky.mjs) |
次の作業: 改善版SkyでInstagram運用商品とスマホDialogを画面確認し、全体検証後にGitHubへ保存する。実Provider接続とSites再配信は別gateとして保持する。
````

### 2026-09-12 — merge `60654268` で落ちた側 `bb52f159`（7行）

統合: feat(sky): integrate brand operations into role feed ／ 落ちた側の最後のcommit: fix: preserve Sky mobile offset in production CSS

````text
最終更新: 2026-09-12 / SkyをToB掲載とToCタイムライン取得・MCP接続の両面へ拡張 / 完了 26/48件
| SKY04 | X型Sky Timelineから会話または役ボタンの1タップで実行入口を開く | 完了 | [記録](components/sky-workspace.tsx) · [記録](lib/sky-routing.ts) · [記録](tests/sky-routing.test.mjs) · [記録](docs/sky-assistant-and-memory.md) |
| SKY05 | Skyの依頼・担当選択・検索・実行を迷わない3段階へ整理 | 完了 | [記録](components/sky-workspace.tsx) · [記録](app/workspace.css) |
| SKY06 | スマホ幅でSky実行Dialogが左へずれる回帰を修正 | 完了 | [記録](app/workspace.css) · [記録](project.md) |
- Skyへ文章で頼むと、4つの専門役へ振り分けて実行画面を開く。ブラウザの役は送信または役ボタンの1タップで開き、PC処理は初回接続だけを案内する。
- 光が流れるSky Timelineから、担当・接続状態・実行場所を見ながら自動化ツールを検索。スマホでは役割を横送りでき、動きを減らす端末設定にも対応。
日本語法律相談受付は別branch `codex/sky-legal-intake-20260912` のcommit `4169697`で実装・7テスト合格を確認したが、このbranchのSkyへはまだ統合していない。
````

### 2026-09-12 — merge `280b895e` で落ちた側 `cdc3bd7f`（3行）

統合: Merge current Sky site and patent assistant ／ 落ちた側の最後のcommit: Add Sky patent filing assistant

````text
最終更新: 2026-09-12 / Skyへ特許出願アシスタントを追加 / 完了 19/41件
| B02 | 既存商品のHub実利用と不便の改善・実行/料金/権利の条件拡張 | 進行中 | [記録](docs/prompts/hub-wallet-next.md) · [記録](docs/pc-citations-adapter.md) · [記録](docs/evidence/pc-citations/integration.json) · [記録](docs/evidence/os-base/business-backup-acceptance-b8287bc.json) · [記録](docs/sky-rockstar-ledger-20260912.md) · [記録](docs/sky-role-agents-20260912.md) · [記録](docs/evidence/sky-rockstar-ledger/integration.json) · [記録](tests/rockstar-ledger.test.mjs) · [記録](tests/subscription-advisor.test.mjs) · [記録](docs/sky-legal-intake-20260912.md) · [記録](tests/legal-intake.test.mjs) · [記録](docs/sky-patent-assistant-20260912.md) · [記録](tests/patent-assistant.test.mjs) |
次の作業: Sky Agent Hubに特許出願アシスタントを追加し、発明整理、公開状況警告、公式情報に限定した先行技術候補調査、明細書・請求項・要約・提出チェックのドラフト保存を実装した。発明内容は保存せず、AI送信は明示同意後だけ、電子署名・支払・特許庁提出は人の最終確認に残す。次は本人限定Sitesへ同一sourceを配信し、実環境でAI秘密設定と一連の画面動線を確認する。Android/AOSP側のfull build・Hub/Wallet/Game移植・production署名・実機受入は引き続き未完了。
````

### 2026-09-12 — merge `280b895e` で落ちた側 `f057abcf`（2行）

統合: Merge current Sky site and patent assistant ／ 落ちた側の最後のcommit: fix: keep Sky dialogs inside mobile viewport

````text
| B02 | 既存商品のSky実利用と不便の改善・実行/料金/権利の条件拡張 | 進行中 | [記録](docs/prompts/hub-wallet-next.md) · [記録](docs/pc-citations-adapter.md) · [記録](docs/evidence/pc-citations/integration.json) · [記録](docs/evidence/os-base/business-backup-acceptance-b8287bc.json) |
次の作業: SkyのToB掲載申請とToC Timelineを基礎に、隔離preflight、MCP 2025-11-25 initialize・capability negotiation・tools/list、OAuth、公式／private Registry取込、審査画面、公開revision、接続同意、実行receiptまでをprivate開発環境で縦断実装する。出願候補の詳細は公開repoへpushせず、発明者・先行技術・claim方針を専門家と確認する。cloud課金、実機flash、production署名、一般公開、main merge、Sites再deploy、特許出願は未承認・未実施。
````

### 2026-09-12 — merge `cdc3bd7f` で落ちた側 `9616af9b`（4行）

統合: Add Sky patent filing assistant ／ 落ちた側の最後のcommit: Improve Sky legal intake flow

````text
最終更新: 2026-09-12 / Sky法律相談の3ステップUX改善 / 完了 19/41件
| B02 | 既存商品のHub実利用と不便の改善・実行/料金/権利の条件拡張 | 進行中 | [記録](docs/prompts/hub-wallet-next.md) · [記録](docs/pc-citations-adapter.md) · [記録](docs/evidence/pc-citations/integration.json) · [記録](docs/evidence/os-base/business-backup-acceptance-b8287bc.json) · [記録](docs/sky-rockstar-ledger-20260912.md) · [記録](docs/evidence/sky-rockstar-ledger/integration.json) · [記録](tests/rockstar-ledger.test.mjs) · [記録](docs/sky-legal-intake-20260912.md) · [記録](tests/legal-intake.test.mjs) |
次の作業: 日本語法律相談受付を安全確認、相談内容、回答・引継ぎの3ステップへ整理し、スマートフォン向けの操作サイズ、戻る・修正動線、弁護士候補の折りたたみを実装した。次は本人限定Sitesへ同一sourceを配信し、実環境で3ステップ動線と法令AIの秘密設定を確認する。サブスク顧問はNative Sky MCP brokerへの常駐接続とWalletへの費用転記、HTTPS配信版の安全な接続経路が未完了。Android/AOSP側は実機型番/SKU確認、全source取得・build・製品移植・production署名・実機受入が引き続き未完了。
- Skyの「日本語法律相談受付」は、安全確認→相談内容→回答・引継ぎの3ステップ。政府・裁判所の公式情報に限定した根拠付き一次回答と無料窓口を表示し、刑事弁護が必要な案件は藤原茜弁護士を第一連絡候補にします。法的助言や自動送信は行わず、Skyは相談本文を保存しません。[実装と安全境界](docs/sky-legal-intake-20260912.md)
````

### 2026-09-12 — merge `cdc3bd7f` で落ちた側 `dc62ef9a`（3行）

統合: Add Sky patent filing assistant ／ 落ちた側の最後のcommit: Track complete subscription coverage in Sky

````text
最終更新: 2026-09-12 / Skyのサブスク顧問へ全網羅監査を追加 / 完了 19/41件
| B02 | 既存商品のHub実利用と不便の改善・実行/料金/権利の条件拡張 | 進行中 | [記録](docs/prompts/hub-wallet-next.md) · [記録](docs/pc-citations-adapter.md) · [記録](docs/evidence/pc-citations/integration.json) · [記録](docs/evidence/os-base/business-backup-acceptance-b8287bc.json) · [記録](docs/sky-rockstar-ledger-20260912.md) · [記録](docs/sky-role-agents-20260912.md) · [記録](docs/evidence/sky-rockstar-ledger/integration.json) · [記録](tests/rockstar-ledger.test.mjs) · [記録](tests/subscription-advisor.test.mjs) |
次の作業: Skyのサブスク顧問をローカルPC台帳へ読み取り専用で接続し、全網羅・過去契約・月額・要対応・更新を会話で回答するところまで検証した。Apple、Google Play、カード、銀行、PayPal、請求メールの確認状況と期間を追跡し、未確認または更新日不足が残る間は完了と判定しない。現在は6情報源とも未確認、明細0件、更新日3件不足。次は本人が利用する情報源の履歴をローカル取込・照合し、Native Sky MCP brokerを共通policy gatewayにする。HTTPS配信版からloopbackへ直接接続しない経路、Android/AOSPのfull build・Hub/Wallet/Game移植・production署名・実機受入は引き続き未完了。
````

### 2026-09-12 — merge `75342d4c` で落ちた側 `d1d50af9`（2行）

統合: merge: align fashion brand ops with latest Sky tools ／ 落ちた側の最後のcommit: merge: install fashion brand ops into Sky

````text
最終更新: 2026-09-12 / Instagram運用・受注型ブランド管理をSkyのcatalogとTimelineへ導入しmock検証済み / 完了 24/46件
次の作業: FB01のSky catalog/Timeline、MCP 28 tools、Provider/approval/DB/Webhook境界、mock縦断、総合verifyを完了する。実Higgsfield/Meta/Stripe/通知credential、本番投稿・広告・請求・返金、native Skyの汎用JSON MCP画面、QEMU/Android/実機OS組込みは明示承認と契約を要する別gateとして保持する。その後はSky掲載審査とprivate Registry縦断、実機の正確な型番/SKU確定、全source取得・vendor生成・Soong full build、Sky/Wallet/GameのAndroid移植、本人限定Sites QA、license/production署名、正式配布受入へ進む。
````

### 2026-09-12 — merge `75342d4c` で落ちた側 `19603b1e`（3行）

統合: merge: align fashion brand ops with latest Sky tools ／ 落ちた側の最後のcommit: Add Rockstar Ledger to Sky automation hub

````text
最終更新: 2026-09-12 / SkyへローカルMCP対応のサブスク顧問を接続 / 完了 19/41件
| B02 | 既存商品のHub実利用と不便の改善・実行/料金/権利の条件拡張 | 進行中 | [記録](docs/prompts/hub-wallet-next.md) · [記録](docs/pc-citations-adapter.md) · [記録](docs/evidence/pc-citations/integration.json) · [記録](docs/evidence/os-base/business-backup-acceptance-b8287bc.json) · [記録](docs/sky-rockstar-ledger-20260912.md) · [記録](docs/evidence/sky-rockstar-ledger/integration.json) · [記録](tests/rockstar-ledger.test.mjs) |
次の作業: Skyのサブスク顧問をローカルPC台帳へ読み取り専用で接続し、配布ZIP・MIT・MCP・安全境界を同じGitへ収録した。次はNative Sky MCP brokerへの常駐接続とWalletへの費用転記を設計し、HTTPS配信版でloopbackへ直接接続しない経路を実装する。Android/AOSP側は実機型番/SKUの読取り専用確認、クラウド計画の承認、全source取得・vendor生成・Soongフルbuild・Hub/Wallet/Game移植、production署名、実機受入が引き続き未完了。
````

### 2026-09-12 — merge `d1d50af9` で落ちた側 `a0ff2f3d`（3行）

統合: merge: install fashion brand ops into Sky ／ 落ちた側の最後のcommit: feat(hub): add fashion brand operations MCP

````text
最終更新: 2026-09-12 / Instagram運用・受注型ブランド管理のmock統合をRockstarOS Automation Hubで検証済み / 完了 20/42件
次の作業: FB01のHub catalog、MCP 28 tools、Provider/approval/DB/Webhook境界、mock縦断、総合verifyは完了。実Higgsfield/Meta/Stripe/通知credential、本番投稿・広告・請求・返金、QEMU/Android/実機OS組込みは明示承認と契約を要する別gateとして保持する。その後は従来どおり実機の正確な型番/SKU確定、全source取得・vendor生成・Soong full build、Hub/Wallet/GameのAndroid移植、本人限定Sites QA、license/production署名、正式配布受入へ進む。
RockstarOS Automation Hubの検索欄で「Instagram運用」から見つけられる商品を追加しました。実装は[`toolkits/fashion-brand-ops`](toolkits/fashion-brand-ops)、統合境界と検証範囲は[`docs/fashion-brand-ops-integration.md`](docs/fashion-brand-ops-integration.md)です。
````

### 2026-09-12 — merge `d1d50af9` で落ちた側 `bf85af69`（1行）

統合: merge: install fashion brand ops into Sky ／ 落ちた側の最後のcommit: feat: introduce Sky timeline and tool publishing

````text
最終更新: 2026-09-12 / SkyをToB掲載とToCタイムライン取得・MCP接続の両面へ拡張 / 完了 23/45件
````

### 2026-09-10 — merge `bfc4ae32` で落ちた側 `d713e504`（2行）

統合: feat: integrate Sites history into the RockstarOS workspace ／ 落ちた側の最後のcommit: feat(web): make automation Hub the primary workspace

````text
1. ホームの「仕事を進める」から `/work` を開き、サインインします。PCではヘッダー、スマホでは検索・カテゴリの下に入口を表示します。
保存するのは仕事名・確認メモ・実行メタデータで、原稿や成果物は保存しません。名前やメモに秘密情報を入れないでください。仕事は最新100件、試行は1仕事につき最大200件です。本文保存・古い仕事のページ送り・削除は今後の拡張です。仕事内の実行は仕事履歴に記録し、ホームの単独ツール実行履歴には二重計上しません。
````

### 2026-09-10 — merge `bfc4ae32` で落ちた側 `c6942d5e`（9行）

統合: feat: integrate Sites history into the RockstarOS workspace ／ 落ちた側の最後のcommit: Add authenticated automation operations and manual accounting backend

````text
自動化を束ねるLOOPファンドのインストール可能なアプリ。ファンド選択、ワンボタン実行、履歴、PC・MCP接続、費用と分配・ブーストの試算をまとめます。
- スマホのホーム画面やPCへPWAとして追加し、アプリ表示で起動。
- ホーム、ファンド、実行履歴、設定を下部ナビまたはサイドバーで切り替え。
- 実行開始を一度だけ受け付け、開始待ち・実行中・完了・失敗・中断を記録。完了報告の再送でも履歴は重複しない。
- 自分のツールの利用停止・再開、PCの接続記録と解除、過去30日の処理量・処理時間を確認。
- 売上・経費を手入力で記録。原記録を維持し、取消記録を追加。実残高・払出額とは分離。
- 外部OSS候補はカタログに保持し、音声ツールのファンドは準備中として表示。
ファンドの参加・配分・試算条件、実行メタデータ、ツールの停止設定、端末の接続記録、手入力の収支記録はSitesのD1に保存します。原稿・成果物・MCPトークンは端末内だけで扱います。接続アドレスは保存せず、サーバーへ送信しません。ウォレット接続はログイン認証・実名本人確認・送金認可ではありません。
バックエンドの状態遷移・API境界・未接続機能・検証条件は `docs/backend-design.md`。ローカルの公開用Workerに対し `node scripts/verify-backend.mjs`、PC接続アプリも起動した場合は `node scripts/verify-mcp-flow.mjs` で統合検証できます。これらは合成テストユーザーのみを使用し、公開サイトを対象にしません。
````

### 2026-09-09 — merge `797c663d` で落ちた側 `fcedcfec`（28行）

統合: Integrate approved Hub Wallet OS design with native baseline ／ 落ちた側の最後のcommit: Record passing native integration checks

````text
標準Hubから自社・第三者のToolを導入し、利用者が許可した条件・権限・費用の範囲で仕事を実行するOSを開発しています。最初の製品端末は**BlackBerryを優先**し、機種・variantはこれから適合確認します。
**Linux / Buildroot / ARM64 QEMUで起動するnative OSの試作を追加しました。** kernel・root filesystem・専用サービス・C/CairoのHub画面、Tool SDKと署名配布、Wallet・MCPの試作を `systems/rock-star-os/` にまとめています。仮想端末での検証とBlackBerry実機対応は別です。実機、実USB、外部金融provider、実際の送金・ATMは未検証で、OS全体の完成ではありません。
開発の入口: [現在の製品方針と統合範囲](docs/native-os-integration.md)、[native OSの使い方](systems/rock-star-os/README.md)、[今回の検証結果](docs/native-os-validation.md)、[次の担当向けCHECKPOINT](CHECKPOINT.md)。標準Walletの新OS契約は月額**8.88 USD固定**です。既存Webのファンド上限料金は試算として保持し、二重課金や自動的な残高移行は行いません。
既存のAndroid試作も維持しています。[AOSP基本設計と改訂](docs/os-development-design.md)、[Android P1手順](docs/os-prototype.md)、[記事ToolのAIDL契約](contracts/README.md)を参照してください。Java・SQLite・2APKのbuild/lintと標準Androidの接続試験は過去CIで成功していますが、自前AOSP/Cuttlefish起動とPixel実機は未検証です。`android/` と `os/device/` はこの補助トラックで、Linux版とは別に検証します。
正本リポジトリ: [k999ln/rock](https://github.com/k999ln/rock)。従来の `gg` checkoutに加え、このリポジトリでnative OSも管理します。製品は「Rock star / avocadomini」の1つとし、非公開の`k999ln/Mr.`はTelegram・クラウド運用component、`vvvv`は旧履歴として扱います。役割と重複の整理は [Gitプロジェクト統合方針](docs/git-consolidation.md)、事業方針・設計・次の作業は [project.md](project.md)、4つの参考元の採用判断は [参照記録](docs/reference-repositories.md) にまとめます。
最終更新: 2026-09-09 / BlackBerry優先・native OSのRock統合 / 完了 11/21件
| OS02 | Android/AOSP: 対象Pixel・ソース/BSP・Linuxビルド環境の適合確認 | 未着手 | [記録](docs/os-development-design.md) |
| OS03 | Android/AOSP: CuttlefishでOS起動と自律実行の最小縦断試作 | 未着手 | [記録](docs/os-development-design.md) |
| OS04 | Android/AOSP: Pixel実機で復旧・省電力・再起動・署名更新を検証 | 未着手 | [記録](docs/os-development-design.md) |
| OS05 | Android/AOSP: 第三者SDK・審査・インストール・失効の閉鎖テスト | 未着手 | [記録](docs/os-development-design.md) |
次の作業: nativeの取り込み検証と起動応答WIPの試験を進める。BlackBerryの型番・BSP・復旧条件を確定し、実機だけのHubを検証する。AOSP/Pixelと実金融・実USBは別ゲートのまま保持する。
- Linux native OSの公開可能な基準ソースを、既存Android/AOSPと衝突しない `systems/rock-star-os/` へ統合。
- kernel/rootfs構成、native Hub、Tool SDK、署名配布・sandbox、A/B更新、Wallet・購入者資格、MCP、AI実行先、運営用部品をRockの正本へ追加。
- BlackBerry優先、月額8.88 USD固定、既存Webの料金試算との境界、実装済み・仮想端末検証済み・未検証を設計書へ反映。
- 移設後のnative Python 1,031件とC検証、既存Web 34件・API 143項目、既存Android契約の静的整合を確認。
ここでいう完了は、**公開ソースの統合と試作基盤の検証**まで。BlackBerry実機で使える製品版や、実資金サービスの完成を意味しません。
1. `experiments/startup-health/` の未適用patchを分離環境で実装・検証し、採用または撤回する。
2. BlackBerry候補を型番・variant単位で比較し、bootloader、BSP、画面・入力・通信・電源、更新、復旧が成立する最初の1機種を決める。
3. 選定実機で起動し、端末だけでHub検索→直接取得→許可→実行→更新→rollback/uninstallを検証する。
4. 同じHubからdevice local・cloud・実USB PCを接続し、即時接続・解除・結果復元を検証する。
5. 本人確認と購入記録の引継ぎ、Wallet月次888 cents、ToB精算、ATM/provider sandbox、運営配信を外部契約ごとに接続する。
実行順、合格条件、既知の失敗、再開コマンドは [CHECKPOINT](CHECKPOINT.md) に固定しています。
BlackBerry実機起動・driver・省電力・端末だけのHub操作、実USB、一般公開Store、実providerの本人確認・売上・送金・ATM、本番運営は未検証です。Linux版の署名package・隔離・A/B更新には限定した仮想端末試験があり、その範囲を統合文書に記載しています。自前AOSP/Cuttlefish、Pixel書込/復旧も未検証のままです。以下は既存Web/PC版の未接続事項です。
1. native OSの公開ソースと再現手順を維持し、起動応答・自動再読込の未検証変更を試験する。
2. BlackBerry候補の型番・variant、bootloader、BSP、更新・復旧を確認し、実機へ載せる方式を固定する。
3. 実機だけでHub検索・取得・導入・実行・更新・復旧を通し、第三者SDKの体験を検証する。
4. 実USB、許可した外部MCP/AI、金融provider sandbox・ToB精算、運営配信を順次接続する。
AOSP/Pixelは比較・移植候補として保持します。GitHubへの追加と本番サイト公開は別作業です。既存Sitesの公開停止条件は維持しています。
````

### 2026-09-09 — merge `797c663d` で落ちた側 `27b34adc`（10行）

統合: Integrate approved Hub Wallet OS design with native baseline ／ 落ちた側の最後のcommit: docs: align OS and game wallet plan with implementation evidence

````text
**現在は [確認用設計書 v1.1](docs/os-hub-wallet-game-design.md) の利用者承認待ち。** [実装との相違](docs/design-implementation-alignment-20260909.md)を反映した設計・プロンプトを提示し、承認後にruntime実装へ進みます。Game入口・達成演出は提案、市場案は検討のみです。
2026-09-09の監査では[PR #1](https://github.com/k999ln/rock/pull/1)にLinux/Buildroot/QEMU native OS、Hub、Wallet、MCP・実行先/予算の試作があります。BlackBerry優先・機種未定、Android/AOSPは別トラックです。PRは監査時OPEN。毎回 `npm run prompt:context` と対象コードを確認してください。以下のmain実装だけで全体の進捗を判断しないでください。
**main由来のこの確認用branchのOSコードはAndroid P1です。** Java共通コア・SQLite・AIDL・診断画面・記事ツールに対する2APK build/lintと標準Android接続試験の成功記録があります。独自AOSP/Cuttlefish・Pixelは未検証。native branchのQEMU・SDK・Wallet試作と区別します。最新設計は `codex/os-game-design-review-20260909` に保存し、main/native未反映です。既存Webのファンド・料金・分配は試算として保持します。
正本リポジトリ: [k999ln/rock](https://github.com/k999ln/rock)。旧ローカル作業名は `gg`。現在の設計再開先は `codex/os-game-design-review-20260909` で、SSD上の旧checkoutを最新と仮定しません。製品は「Rock star / avocadomini」の1つとし、非公開の`k999ln/Mr.`はTelegram・クラウド運用component、`vvvv`は旧履歴として扱います。役割と重複の整理は [Gitプロジェクト統合方針](docs/git-consolidation.md)、事業方針・設計・次の作業は [project.md](project.md)、4つの参考元の採用判断は [参照記録](docs/reference-repositories.md) にまとめます。
最終更新: 2026-09-09 / 実装との差を訂正した設計v1.1・プロンプトの確認待ち（既存native試作あり、新指示のruntime作業は未着手） / 完了 12/27件
| B04 | main/native/設計reviewのベース・引継ぎ入口を分離作業branchへ統合 | 未着手 | [記録](docs/design-implementation-alignment-20260909.md) · [記録](docs/prompts/os-operational-base-next.md) |
次の作業: 設計v1.1と相違監査を提示し明示承認を待つ。承認後はmain/native/設計reviewの3入力固定→B04統合→V01起動基礎→選定native商品/合成Wallet基礎→OS受入。phaseGatesで途中依存を確認。GX00複数owner基礎→GX01交換契約→DX01 SDKは別系列。実ゲーム/実資金/実機は別ゲート、市場案は検討のみ。ATM自社手数料0・ゲーム料金未定・OS月888 cents維持。作業件数はOS完成率ではない。
## このmainの既存Web/Androidで未実装・未検証のこと
以下は設計書の明示承認後に実行する順番。現時点では設計提示・修正まで。
4. GX01でATMから独立したゲーム交換を合成serverで試験し、DX01で作者向けAPI/SDK・サンプル・導入体験を検証。ゲーム料金/方向は未確定、ATM自社手数料0を保持。
````

## docs/agent-control-plane.md

### 2026-10-05 — merge `981b3a46` で落ちた側 `6c3da397`（4行）

統合: Merge PR #47 with paid remote execution closed ／ 落ちた側の最後のcommit: test: align game-first assertion with current README

````text
- optional Jev and Cursor credentials
The deterministic control plane runs before launch. A Cursor coding run is permitted only for:
Jev is called only when all of the following are true:
The Cursor API key stays in the server environment. It is never added to the task prompt, repository, Jev state, or client response.
````

## docs/ai-native-os-architecture.md

### 2026-09-20 — merge `a3a24b8b` で落ちた側 `963027cf`（1行）

統合: merge: sync main with origin and keep Sky local LLM work ／ 落ちた側の最後のcommit: feat: expand Sky local model catalog and connections

````text
現行 `ai@7.0.107` は `experimental_evaluate` を実行時exportし、Skyのserver-side評価routeから利用する。Cloudflare互換、privacy、timeout、費用、invalid responseのfixtureとprovider sandbox／本番受入は残りのgateであり、詳細は[LLM・評価モデル設計](llm-evaluation-architecture.md)に従う。
````

### 2026-09-19 — merge `77c2e2ad` で落ちた側 `dd722ef0`（5行）

統合: Merge RockstarOS product updates into main ／ 落ちた側の最後のcommit: docs: define Jev evaluation architecture

````text
状態: RQ48を実装へ落とす到達設計。2026-09-16、基準source `678e9c9`。2026-09-19にlocal planner、Sky内OpenAI接続2件、Jev remote evaluatorの境界を追記した。**本文の新しい契約・状態名・数値目標は提案であり、現行APIや受入済み機能の宣言ではない。** 実装済みの範囲は第8節のsourceと証拠で区別する。製品目的は[north star](product-north-star-20260915.md)、LLMの現在地は[LLM・評価モデル設計](llm-evaluation-architecture.md)と[`data/llm-capabilities.json`](../data/llm-capabilities.json)、現在の判定は[全体構成](system-composition.md)、作業入口は[Android / Device / Local AI](workstreams/07-android-device-local-ai.md)。
### 2.1 cloud generatorとremote evaluatorをlocal modelから分ける
WebのOpenAI接続はSkyの法務受付と特許出願アシスタントの2 Tool内部だけにあり、OS全体のcloud LLM層ではない。Local AIが利用できない時にOpenAIへ自動送信せず、OpenAI停止時にLocal AIへ同じ依頼を自動fallbackしない。Tool、provider、model role、実行場所、接続状態を別々に記録する。
Jev (`typesafe-ai/jev`) はVercel AI Gateway経由のTypeSafe AI remote evaluatorとして扱う。端末内model profileや文章生成modelには含めず、本人がSkyから明示利用する評価Toolに限定する。typed evaluation結果は助言・品質証拠であり、Brokerの権限判定、本人承認、Tool成功、仕事完了、Earning Receiptを置き換えない。Jevの未接続や低評価で既存local-pure jobを自動失敗・再実行しない。
現行 `ai@7.0.99` は `experimental_evaluate` を実行時exportしない。SDK更新または公式HTTP Evaluation APIを、Node/Cloudflare互換、privacy、timeout、費用、invalid responseのfixtureで受け入れるまではJevを実装済みや`ready`としない。詳細は[LLM・評価モデル設計](llm-evaluation-architecture.md)に従う。
````

## docs/database-status.md

### 2026-10-05 — merge `dba8f320` で落ちた側 `d095b391`（3行）

統合: Merge PR 63 from-scratch LLM prototype without changing runtime authority ／ 落ちた側の最後のcommit: Merge PR 69 generated artifact cleanup

````text
| Sky接続・Tool管理 | 10 | sky_activation_codes, sky_connections, sky_developer_tokens, sky_provider_connections, sky_remote_ai_rate_limits, sky_tool_events, sky_tool_grants, sky_tool_package_reviews, sky_tool_packages, sky_tool_submissions |
| 自動化ファンド・事業補助 | 3 | automation_fund_memberships, automation_funds, mercari_revenue_plans |
`automation_fund_memberships`、`automation_funds`、`book_records`、`csv_billing_accounts`、`csv_job_events`、`csv_jobs`、`csv_monthly_fees`、`devices`、`fund_plans`、`job_events`、`jobs`、`marketplace_approvals`、`marketplace_assets`、`marketplace_events`、`marketplace_positions`、`marketplace_proposals`、`marketplace_receipts`、`marketplace_reservations`、`mercari_revenue_plans`、`sky_activation_codes`、`sky_connections`、`sky_developer_tokens`、`sky_provider_connections`、`sky_remote_ai_rate_limits`、`sky_tool_events`、`sky_tool_grants`、`sky_tool_package_reviews`、`sky_tool_packages`、`sky_tool_submissions`、`tool_controls`、`tool_runs`、`work_jobs`
````

### 2026-10-05 — merge `dba8f320` で落ちた側 `ebaf4688`（1行）

統合: Merge PR 63 from-scratch LLM prototype without changing runtime authority ／ 落ちた側の最後のcommit: Record avokado prototype branch delivery and remaining gates

````text
Canonical offer is physical SIM/eSIM-led RockstarOS service access across purchase channels; carrier activation, service entitlement, account, OS/client install, cloud execution and AI billing remain distinct states. The local signed claim issuer and encrypted/idempotent seller delivery API are implemented; the Android Shell quote→device-credential Wallet hold→Broker proof→explicit Cloud approval→same-ID recovery source flow is wired and locally contract-tested. Current repository verification passes: Node 757/757, Worker/D1 API 1,048 assertions, CSV Worker/D1/R2 113 assertions, Fashion 19/19, typecheck, product lint, production build and release checks. Next run Android Core/AIDL/APK/instrumentation on an equipped CI/device host; then connect contracted seller checkout/delivery, carrier, Provider rates/meters/invoices and funded settlement. Production D1 readback is 0/6; local fixtures are not production billing, carrier activation, or successful exact-SKU OS installation. Separate AI02 research: avokado random-init CPU prototype is host-tested; fix corpus rights/independent evaluation and Mini runtime/export next. Additional compute spend limit is zero; device/cloud/full pretraining not accepted.
````

### 2026-10-05 — merge `ecb4b2af` で落ちた側 `624124cf`（2行）

統合: Merge remote-tracking branch 'origin/main' ／ 落ちた側の最後のcommit: Merge pull request #68 from k999ln/codex/sky-main-integration-20261005

````text
- 現在milestone: SIM/eSIM起点のRockstarOSサービス利用開始と料金透明化を実装・受入
Canonical offer is physical SIM/eSIM-led RockstarOS service access across purchase channels; carrier activation, service entitlement, account, OS/client install, cloud execution and AI billing remain distinct states. The local signed claim issuer and encrypted/idempotent seller delivery API are implemented; the Android Shell quote→device-credential Wallet hold→Broker proof→explicit Cloud approval→same-ID recovery source flow is wired and locally contract-tested. Current repository verification passes: Node 757/757, Worker/D1 API 1,048 assertions, CSV Worker/D1/R2 113 assertions, Fashion 19/19, typecheck, product lint, production build and release checks. Next run Android Core/AIDL/APK/instrumentation on an equipped CI/device host; then connect contracted seller checkout/delivery, carrier, Provider rates/meters/invoices and funded settlement. Production D1 readback is 0/6; local fixtures are not production billing, carrier activation, or successful exact-SKU OS installation.
````

### 2026-10-05 — merge `3ca84dcc` で落ちた側 `a85a25e2`（1行）

統合: merge: reconcile SPIDER with service access foundation ／ 落ちた側の最後のcommit: fix(security): pin Undici to patched 7.29.1

````text
SYS15第24cycleでUndiciを7.29.1へ統一し、TLS callback継承の旧3失敗／新3成功、license関連35試験成功を確認。既存PR56の一部更新と下位7.29.0残存を区別し、PR52の小さいoverrideとして検証する。同一SHAのclean npm ci・全体CI・個別alertを確認し、default branchの解消はmain統合後まで未確認。SYS15のofflineコード検査ファイルを配布し、今回のnative security.inspectCodeを同一SHAのLinux CIで確認する。生成物とsourceのhashを保存し、既存OS監視の受入とは分ける。SYS15のSecurity Agent役割・native表示・送信前拒否についてLinux source検証を保存し、同一SHAのCIと既存の受入gateへ接続する。アニメーション・役割追加・旧a7cfca3の証拠を分離し、表示先は現行security panelを維持する。RockstarOS本体のPlatform固定範囲監視とMCP／Runner送信前検査、native状態画面、boot監督を検証し、同一imageで起動・再起動・障害復旧・24時間運転を受け入れる。hostやWeb補助機能の成功をOS常駐受入へ換算しない。avocadoMiniはR5を基準に、1本自律・使用時200mm・全空間裸眼表示の方式と安全、精密3D入力、実部品収納を先に検証する（MAT15）。E3の4本＋別Hubを必須構成へ戻さない。Pixel/QEMU等の既存OS受入は独立して継続する。
````

### 2026-10-05 — merge `ea2728ec` で落ちた側 `8978ca44`（1行）

統合: Merge PR #25 advisory Decision Fabric and optional Jev provider ／ 落ちた側の最後のcommit: Return disabled reason before Jev cost admission

````text
Jevは安全なruntime key provisioningが決まるまでdisabled／初回product除外を維持する。友人がAndroid SDK／Gradle環境でoptional providerのunit test・lint・Soong source buildを実行し、別途Pixel／OS full build／flashのgateは未合格のまま維持する。
````

### 2026-10-05 — merge `be8718a4` で落ちた側 `af38db8f`（1行）

統合: Merge PR #46 single-executor capability host fixtures ／ 落ちた側の最後のcommit: feat(core): AI05 host/fixture capability negotiation, single executor device, persistent selection and snapshot restore

````text
次の確認: 対象端末を確定後、full buildと実機保存・復旧を受入する。AI02のmodel_* table（ModelProfiles）とAI04のoutbox_* table（ExternalWriteOutbox）、AI03のmemory_* table（BoundedMemory）、AI05のsky_executor系 table（SkyExecutor）はhost JVM試験のみで、emulator・実機では未確認
````

### 2026-10-05 — merge `868b50de` で落ちた側 `829bf229`（1行）

統合: Merge PR #45 bounded-memory host fixtures ／ 落ちた側の最後のcommit: fix(core): AI03 tombstones keep only a digest of the deleted memory ID

````text
次の確認: 対象端末を確定後、full buildと実機保存・復旧を受入する。AI02のmodel_* table（ModelProfiles）とAI04のoutbox_* table（ExternalWriteOutbox）、AI03のmemory_* table（BoundedMemory）はhost JVM試験のみで、emulator・実機では未確認
````

### 2026-10-05 — merge `130c486b` で落ちた側 `504e43c6`（1行）

統合: Merge PR #44 external-write outbox host fixtures ／ 落ちた側の最後のcommit: fix(core): run the AI04 authority callback outside outbox transactions (PlatformStore rule)

````text
次の確認: 対象端末を確定後、full buildと実機保存・復旧を受入する。AI02のmodel_* table（ModelProfiles）とAI04のoutbox_* table（ExternalWriteOutbox）はhost JVM試験のみで、emulator・実機では未確認
````

### 2026-10-05 — merge `01eb6db6` で落ちた側 `b37c52a6`（2行）

統合: Merge PR #42 as isolated model profile host fixtures ／ 落ちた側の最後のcommit: Merge remote-tracking branch 'origin/chore/ledger-sync-20260925' into feat/ai02-model-pinning-fixture

````text
`artifacts`、`events`、`model_journal`、`model_meta`、`model_pins`、`model_pointer`、`model_profiles`、`rock_meta`、`runs`、`settings`、`sky_selection`、`works`
次の確認: 対象端末を確定後、full buildと実機保存・復旧を受入する。AI02のmodel_* table（ModelProfiles）はhost JVM試験のみで、emulator・実機では未確認
````

### 2026-09-20 — merge `b7e6b9d5` で落ちた側 `12c66f3a`（2行）

統合: merge: integrate latest main and generated status ／ 落ちた側の最後のcommit: fix: classify remote AI limits and clarify stowed tower view

````text
| Sky接続・Tool管理 | 8 | sky_activation_codes, sky_connections, sky_developer_tokens, sky_provider_connections, sky_tool_events, sky_tool_grants, sky_tool_packages, sky_tool_submissions |
`automation_fund_memberships`、`automation_funds`、`book_records`、`csv_billing_accounts`、`csv_job_events`、`csv_jobs`、`csv_monthly_fees`、`devices`、`fund_plans`、`job_events`、`jobs`、`marketplace_approvals`、`marketplace_assets`、`marketplace_events`、`marketplace_positions`、`marketplace_proposals`、`marketplace_receipts`、`marketplace_reservations`、`mercari_revenue_plans`、`remote_ai_rate_limits`、`sky_activation_codes`、`sky_connections`、`sky_developer_tokens`、`sky_provider_connections`、`sky_tool_events`、`sky_tool_grants`、`sky_tool_packages`、`sky_tool_submissions`、`tool_controls`、`tool_runs`、`work_jobs`
````

### 2026-09-20 — merge `a3a24b8b` で落ちた側 `963027cf`（2行）

統合: merge: sync main with origin and keep Sky local LLM work ／ 落ちた側の最後のcommit: feat: expand Sky local model catalog and connections

````text
`automation_fund_memberships`、`automation_funds`、`book_records`、`csv_billing_accounts`、`csv_job_events`、`csv_jobs`、`csv_monthly_fees`、`devices`、`fund_plans`、`job_events`、`jobs`、`marketplace_approvals`、`marketplace_assets`、`marketplace_events`、`marketplace_positions`、`marketplace_proposals`、`marketplace_receipts`、`marketplace_reservations`、`mercari_revenue_plans`、`sky_activation_codes`、`sky_connections`、`sky_developer_tokens`、`sky_provider_connections`、`sky_tool_events`、`sky_tool_grants`、`sky_tool_packages`、`sky_tool_submissions`、`tool_controls`、`tool_runs`、`work_jobs`
SKY20は旧Mr. Hub 11候補とJev周辺7候補の実行器、本人接続、料金・結果照合を一件ずつ受け入れ、通るまでreadyにしない。PC内SDK Appのカード表示・接続・停止はローカルSkyで確認済み。AI07はJevのprovider sandboxで正常系・429・5xx・不正response・budget縮退を受入し、AI_GATEWAY_API_KEY、Terms/Privacy、料金上限を確認する。JevはSkyのcatalog／同意UI／closed rubric／Evaluation Receiptまで実装済みだが、本番provider接続は未完了。法務受付・特許アシスタントはSkyの別Toolとして維持し、AI02〜AI06、full build入力・署名・物理全損復元の未完了gateも独立して維持する。
````

### 2026-09-19 — merge `77c2e2ad` で落ちた側 `dd722ef0`（1行）

統合: Merge RockstarOS product updates into main ／ 落ちた側の最後のcommit: docs: define Jev evaluation architecture

````text
AI07はJevをSkyの明示的remote evaluatorとして実装する前に、AI SDK更新または公式HTTP APIを選び、Node/Cloudflare互換、privacy、料金上限、失敗縮退のfixtureを通す。route・同意UI・allowlist rubric・Evaluation Receiptが揃うまでcatalog readyにしない。SKY17の成功報酬条件確認、AI02〜AI06、full build入力・署名・物理全損復元の未完了gateも独立して維持する。
````

### 2026-09-19 — merge `77c2e2ad` で落ちた側 `771770d0`（1行）

統合: Merge RockstarOS product updates into main ／ 落ちた側の最後のcommit: docs: publish RockstarOS product map and avocadoMini design

````text
Scalewayの課金確認後、Ubuntu 24.04 / 32 dedicated vCPU / 64 GB RAM / 600 GBで固定sourceをsyncし、Operator Agentを明示除外したbringup modeでtarget-files-packageとotatools-packageをbuildする。RELEASE_FLASH gate、production signing、実機flashは未合格のまま維持する。
````

### 2026-09-16 — merge `81e6c88c` で落ちた側 `49454c55`（1行）

統合: merge: integrate remote launch gates safely ／ 落ちた側の最後のcommit: Merge pull request #24 from k999ln/codex/complete-lch06-20260915

````text
最短ローンチ経路はWEB01。GitHub mainは全体検証済みだが、本人限定Sitesは接続中のアカウントが所有workspaceと一致せず、ブラウザがAccess Denied、Sites APIがproject_not_foundを返すため配備とD1 readbackを停止中。所有workspaceへ接続後、検証済みの最新mainを配備して主要導線・API・security header・migrationをreadbackする。待機中も一般公開、QEMU配布、Android実機、本番金融の別gateを混同せず進める。
````

## docs/fund-and-mcp.md

### 2026-09-10 — merge `bfc4ae32` で落ちた側 `d713e504`（2行）

統合: feat: integrate Sites history into the RockstarOS workspace ／ 落ちた側の最後のcommit: feat(web): make automation Hub the primary workspace

````text
The final front uses a market-style header/search, horizontal categories, status filters, compact fund cards, and an overview strip. Reference: https://polymarket.com/predictions . Rock star retains its own name and fund/tool content; it does not copy market odds, volume, financial transactions or assets.
Four cards are strategy presets over the same four Mr. utilities (Coconala Works, Creators, All-in Rock star, Editor Lab); Voice and Research are clearly preparation-only. Selecting a card opens its tools and status. Joining saves that preset's allocation as the user's active Rock star plan; it does not buy an investment. Switching a plan is explicit. Home execution totals cover the user's standalone tool runs; `/work` records its own job events without double-counting them in the fund history. Detailed allocation/boost assumptions, wallet and PC setup are available on demand.
````

### 2026-09-10 — merge `bfc4ae32` で落ちた側 `c6942d5e`（5行）

統合: feat: integrate Sites history into the RockstarOS workspace ／ 落ちた側の最後のcommit: Add authenticated automation operations and manual accounting backend

````text
| MCP名             | 機能                                       |
| ----------------- | ------------------------------------------ |
The final front is a mobile-first installable PWA. Home puts the active fund, four direct tool actions, run state, and PC/MCP connection status in the first flow. Fund, activity, and settings each have one dedicated app view. Mobile uses a bottom navigation; desktop uses a fixed sidebar.
Four choices are strategy presets over the same four Mr. utilities (Coconala Works, Creators, All-in LOOP, Editor Lab); Voice is clearly preparation-only. Selecting a fund shows its included tools, and switching saves that preset's allocation as the user's active LOOP plan. This does not buy an investment. All execution totals belong to the user across LOOP. Detailed allocation/boost assumptions, wallet, app installation, and PC setup are available from settings.
The service worker caches only the app shell and same-origin static assets after a successful network response. It excludes `/api/`, so account data and tool execution input are not placed in the app cache.
````

## docs/jev-local-qwen-decision-fabric-design.md

### 2026-09-19 — merge `77c2e2ad` で落ちた側 `771770d0`（1行）

統合: Merge RockstarOS product updates into main ／ 落ちた側の最後のcommit: docs: publish RockstarOS product map and avocadoMini design

````text
状態: **設計確定・実装未完**。既存のPixel 10向けLocal AI実装を土台にするが、本書のDecisionProvider、Router、Harness、TypeSafe接続、RAG、Cloud fallbackはまだ実装済みではない。
````

## docs/launch-readiness-20260910.md

### 2026-09-10 — merge `bfc4ae32` で落ちた側 `d713e504`（11行）

統合: feat: integrate Sites history into the RockstarOS workspace ／ 落ちた側の最後のcommit: feat(web): make automation Hub the primary workspace

````text
状態: **BLOCKED_FOR_LAUNCH**（作業開始時。PASSは証拠取得後だけ更新）
- native/同梱host toolsの配布候補は `9abf78a80d27aa9f847c4051d20e4c552e407276`。元image・約1GB archive・試験原本は不変。
- macOS 15.7.4 / Apple Silicon / Lima 2.2.0 / Debian 13 / QEMU virt-10.0 のDeveloper Preview限定。実機、実資金、実ATM、実請求、一般公開は対象外。
- UIの変更理由: 旧ファンドトップはRQ01のHub+Wallet中心と一致せず、使える商品の実行まで遠い。直接選択・実行できるHubを標準入口へ戻す。旧プランは `/fund` に保持する。製品要求・料金は変更しない。
原因: 原TLSエラーは調査中。過去の600秒累積終了と個別TLS期限を区別。実測による仮説と歴史的原因確定を混ぜない。変更path・commit・検証・合格証拠: 未確定。残る条件: 原エラーに結び付く再現と修正前後比較、最終SHAの全CI。
原因: 製品LICENSE未選択。実archiveのlegal-info/対応sourceは既存の実物を照合中。変更path・commit・検証・合格証拠: 未確定。残る条件: 全同梱物との一致、明示ライセンス決定、最終artifactの再評価。
原因: public RFC8032試験鍵はproduction identityではない。保護Environment、管理鍵、fingerprint、rotationの運用未実証。変更path・commit・検証・合格証拠: 未確定。残る条件: 管理済み鍵で最終候補を署名しクリーン環境検証。
原因: `.openai/hosting.json` の `appgprj_6a9b70d966fc8191a1ec30efce14582d` は接続中SitesからNOT_FOUND。所有/編集可能一覧にもなし。勝手な代替projectは作らない。変更path: `app/page.tsx`, `app/layout.tsx`, `app/workspace.css`, `components/hub-workspace.tsx`, `components/workspace-shell.tsx`, `app/fund/page.tsx`。commit/検証: 未完了。残る条件: 既存Sites履歴/API/DB統合、本人限定プレビュー、モバイル/認証境界/動画/導入リンクの実ブラウザ検証。
原因: Gitに確定CM情報なし。既存local候補のhash・長さ・字幕を照合中。技術デモをCMとして代用せず、CMを再制作しない。変更path・commit・検証・合格証拠: 未確定。残る条件: 確定CMの選択・表現審査・掲載先とhashの固定。
原因: PR1→PR2→PR3のstack。mainへ最終mergeする前に正確なtreeを照合する。既存PR系列・force push禁止を保持。変更path・commit・検証・合格証拠: 未確定。残る条件: 最新mainを含む候補・全必須checks・merge順・metadataの一致。
原因: 元候補はCANDIDATE / NOT_CLEARED / PACKAGED_NOT_ACCEPTED。ライセンス・署名・CM・Siteが揃う前の再受入宣言は禁止。変更path・commit・検証・合格証拠: 未確定。残る条件: 新しい版名で二回同一bytes生成、最終manifest、fresh導入/復旧/削除、同一SHA受入。
````

## docs/llm-evaluation-architecture.md

### 2026-10-05 — merge `981b3a46` で落ちた側 `6c3da397`（1行）

統合: Merge PR #47 with paid remote execution closed ／ 落ちた側の最後のcommit: test: align game-first assertion with current README

````text
The **Agent Control Plane** is the first production-route composition that reuses the Decision Fabric boundary for software-engineering orchestration without promoting any model to an authority role.
````

## docs/os-development-design.md

### 2026-09-09 — merge `797c663d` で落ちた側 `27b34adc`（1行）

統合: Integrate approved Hub Wallet OS design with native baseline ／ 落ちた側の最後のcommit: docs: align OS and game wallet plan with implementation evidence

````text
現行要望は [製品ベース](product-baseline.md)を優先。本書は2026-09-05のAndroid/AOSP設計履歴。nativeはLinux/QEMU・BlackBerry優先でHub/Wallet試作がある。[差分監査](progress-audit-20260909.md)を読み、PC/cloud補助扱い、Pixel優先、SDK/Wallet未実装を製品全体へ適用しない。
````

## docs/os-prototype.md

### 2026-09-09 — merge `797c663d` で落ちた側 `27b34adc`（1行）

統合: Integrate approved Hub Wallet OS design with native baseline ／ 落ちた側の最後のcommit: docs: align OS and game wallet plan with implementation evidence

````text
製品要望は [製品ベース](product-baseline.md)を優先。本書はAndroid P1の検証範囲。native OSのHub/Wallet/商品は別branchにあり [差分監査](progress-audit-20260909.md)を参照。記事処理をOS製品全体の価値や完成条件にしない。
````

## docs/product-baseline.md

### 2026-10-05 — merge `0d9a402b` で落ちた側 `0d2b758f`（1行）

統合: merge: record PR 40 as superseded by current SIM-led product pages ／ 落ちた側の最後のcommit: docs(site): use avokado mini display name in Astro pages

````text
利用者の指定により、端末の対外的な製品名は **avokado mini** とする。**avokado** は事業・ブランド名。現行のハードウェア設計基準はR5であり、READMEと公開製品サイトでは **avokado mini R5** と表示する。既存の `avocadoMini` は設計書の原本ファイル名・内部識別子・過去の判断履歴として保持し、参照を壊さない。製品仕様や検証済み範囲はこの名称訂正で変更しない。
````

### 2026-09-15 — merge `f2dcee42` で落ちた側 `9b0f5cc4`（8行）

統合: Merge remote-tracking branch 'refs/remotes/sites/main' into codex/os-backend-launch-integrated-20260912 ／ 落ちた側の最後のcommit: feat: add chat-based Sky tool studio

````text
2026-09-15追記（v1.23）: Rock Studioの開発者入力を、コード貼付またはソースファイル添付だけのチャット形式へ固定した。コード本文はブラウザ内だけで解析し、Sky SDK組込み例、Tool Package、安全契約、Fund分類を自動生成する。Registryへ送るのはPackageだけとし、登録失敗を成功表示しない。RQ27を追加する。
2026-09-15追記（v1.22）: 利用者は、Sky向けコードそのものを自動化Toolの標準雛形として周知し、開発者が「この機能は自動化できる」と気づいた既存処理へ組み合わせるだけでSky登録、利用導線、MCP利用へ進めるsystemを明示。RQ26を追加する。PCのRock Studioと組込みSDKは同じTool Package契約を生成し、用途・禁止場面、Schema、Adapter、権限、副作用、料金、成功確認、Fund互換情報、開発者IDを登録する。開発者宣言済みとSky検証済みを分け、前者を自動導入させない。匿名利用集計へ入力・出力・会話・秘密情報を含めない。
## RQ26 Sky対応コードを自動化Toolの標準雛形にする
開発者が既存処理へ数行のSky Tool SDKを組み込み、同じ定義からTool Packageの登録、MCP `tools/list` / `tools/call`、匿名利用集計へ進めるようにする。新規開発者には`create-sky-tool`で雛形を生成し、主に`handler`を自動化したい関数へ差し替える導線を用意する。PCのRock StudioではGitHub、OpenAPI、MCP、Rock Packageから下書きを作り、開発者が権利、料金、副作用、Schema、試験を確認して登録・公開する。
PackageはTool名と説明、LLM向け用途・禁止場面、入出力Schema、Adapter、権限、online/offline、実行先、副作用、料金と開発者受取人、timeout、再試行・idempotency、成功確認、テスト、Fund分類を一体で保持する。同じID・版を別内容で上書きせず、SHA-256で固定する。Fund分類は権限を増やさず、有料Toolの収益帰属とToBのSky手数料0を混同しない。
`submitted`、開発者の`published_declared`、Skyの`verified`を分離する。Developer Previewで実装する宣言公開を、Sandbox、作者署名、remote接続、失効運用まで合格した検証済み公開として扱わず、自動インストールを許可しない。外部変更・金融操作は実行ごとの承認を要求し、結果不明時に自動再試行しない。利用集計はPackage ID、Tool名、匿名Installation ID、結果、処理時間、実行時刻だけとし、入力、出力、会話、API key、Wallet情報を送信しない。設計と境界は[Sky Tool SDK / Rock Studio](sky-tool-sdk.md)を正本とする。
PCのRock Studioはチャット形式にし、開発者が行う必須操作を「コードを貼る」または「ソースファイルを1件添付して送る」だけにする。Tool名、用途、LLMが使う場面・禁止場面、入出力Schema、Adapter、権限、online/offline、実行先、副作用、料金、開発者受取人、timeout、再試行、成功確認、テスト、Fund分類はコードから自動生成する。GitHub URLや開発者IDなどを最初に埋める手入力フォームへ戻さない。
2026-09-15 v1.22: 利用者の「Skyのコードを自動化ツールの雛形として周知し、自動化できる機能と組み合わせればすぐSkyで使え、導線も揃うようにする」によりRQ26を追加。PCのRock Studio、組込みSky Tool SDK、雛形CLI、共通Package、MCP公開、匿名利用集計を一つの開発者導線にする。宣言公開は検証済み・自動導入可能とは扱わず、外部作用の承認、秘密情報非送信、本番Sandbox・署名・remote受入の境界を維持する。
````

### 2026-09-13 — merge `95ca598e` で落ちた側 `dd94b57e`（13行）

統合: Merge verified Sites market and fund workspaces ／ 落ちた側の最後のcommit: feat(wallet): connect the Rockstar revenue flow

````text
2026-09-13追記（v1.31）: 本番側で先行したRQ29〜RQ31の公開gateと番号衝突しないよう、自律型自動化ファンド、読取専用Markets、固定commitのPolymarket bot sandboxをRQ32〜RQ34として統合する。ファンド数は固定せず初期推奨5ツール、SkyはProvider確認済み純収益から利用者単位・UTC月単位で最大8.88 USDだけを回収し、承認済み実費と当月Sky利用料を除く残額は100%利用者に帰属する。Marketsは公開データの分析だけ、botは秘密鍵なしのoffline backtestだけを許可し、シミュレーションPnLを実収益へ算入しない。
## RQ32 数を固定しない自律型自動化ファンド
Skyへ追加される利用可能な自動化ツールを候補集合とし、用途、実行可能性、リスク、役割の重複を見ながらファンドを動的に形成する。ファンド総数には製品上の固定上限を置かない。1ファンドの初期推奨は5ツールとするが、構成数は利用者が変更でき、将来追加されたツールも候補へ自動的に入る。A、B、C、D等の名称や4ファンド構成を固定仕様にしない。
利用者は一つの有効ファンドを選び、構成ツール、配分、版、選定根拠を確認できる。再構成は版を追加して追跡可能にし、秘密情報、外部公開、契約、購入、送金等の危険な作用は既存の同意境界を維持する。利回りや収益実績は、Execution Receiptと一意に結ばれたProvider確認済み売上から承認済み実費を引いた実績だけで計算し、未接続Provider、予測、自己申告、デモ値を実利回りとして表示しない。
Sky利用料は全ファンド合算で利用者単位・UTC月単位の最大888 centsとし、ファンドごとに重複請求しない。成果報酬は0 basis points、共同留保は0で、承認済み実費と当月Sky利用料を引いた残額は100%利用者の受取可能額とする。現在のP0は自動化の編成、参加、実績タグ、精算指図までとし、利用者資金の共同運用、他利用者への再配給、投資商品の募集、収益保証は有効にしない。実回収・実払出しは販売、決済、払出しProvider、本人情報、規約、税務・返金条件、sandbox受入が揃うまでOFFを維持する。
## RQ33 RockstarOS Marketsを読取専用の市場分析アダプターとして統合する
RockstarOS Marketsは、Polymarketの公開ライブ市場を読み取り、確率、出来高、流動性をSkyと自動化ファンドの判断材料として提示する。ファンド候補ツールへ動的に追加できるが、市場データの取得、表示、予測、indicative quote、サンプル値、モック残高、架空取引量、含み損益を収益や利回り実績へ変換しない。ライブ取得に失敗した場合はサンプル値で補完せず、取得停止として閉じる。
Marketsの分析系統とRQ20/RQ32の会計系統を分離し、ファンド残高・配分・利用者帰属額の正本はProvider参照とExecution Receiptに結ばれたEarning Receiptだけにする。将来、取引Providerが注文完了、取消、清算、手数料、返金を照合し、実現損益を確定した場合に限り、その実現損益をEarning Receipt候補にできる。未確定損益と市場の総取引量は利用者収益ではない。
RockstarOSからの注文実行、自動再投資、自動資金移動は既定で無効にする。将来の各注文には、利用者の所在地と提供地域、年齢、KYC、利用規約、規制、Wallet署名、注文内容と最大損失に結び付いた明示承認が必要であり、分析アダプターの接続を取引許可として扱わない。Legacyの80/10/10表示は`/fund/legacy`だけに残し、このアダプターへ適用しない。詳細は [Markets・自動化ファンド統合](markets-fund-integration-20260913.md) を参照する。
## RQ34 外部Polymarket botを固定commitのbacktest sandboxとして接続する
`MrFadiAi/Polymarket-bot`はMIT Licenseの固定commit `3a04fc842bc3112a11b872263bb55e6712096f9a`を監査基準とする。原botはdry-runでも秘密鍵を要求し、dashboardからLIVEへ切り替えられ、simulation PnLを共通PnL表示へ加算するため、注文runtime、Wallet接続、approve、redeem、panic sell、秘密鍵入力、LIVE切替をRockstarOSへ直接接続しない。
RockstarOSはclean treeとcommitを確認し、秘密鍵関連の環境変数を子processから除外して、offline JSONLに対するbacktest runnerだけを実行する。出力は`rockstaros-polymarket-bot-backtest/1`へ封入し、Markets画面の検証APIは固定出所、backtest mode、LIVE無効、収益不計上、数値整合、秘密情報不在を検査する。検証済みreportも合成結果であり、実収益、利回り実績、注文推奨、8.88 USD回収原資にしない。詳細は[Polymarket bot sandbox統合](polymarket-bot-sandbox-20260913.md)を参照する。
2026-09-13 v1.31: 本番側の公開gate・永続Walletへ、自動化ツール群を動的に編成するファンド、読取専用Markets、固定commitのPolymarket bot offline backtestを統合した。要件番号の衝突を解消してRQ32〜RQ34へ固定し、実注文・Wallet接続・シミュレーション損益の実収益計上は有効化していない。
````

### 2026-09-13 — merge `38467af4` で落ちた側 `eebe680f`（9行）

統合: merge: unify production release and revenue fund work ／ 落ちた側の最後のcommit: fix(markets): harden bot backtest sandbox

````text
2026-09-13追記（v1.27）: 利用者指定の`MrFadiAi/Polymarket-bot`をMarketsへ接続する。ただし監査したcommitではdry-runでも秘密鍵を要求し、画面からLIVEへ切替可能で、シミュレーションPnLも共通PnLへ入るため、原botの注文runtimeは直接起動しない。固定commit・clean treeのoffline backtestだけを秘密鍵なしで実行するsandbox adapterと、改変・LIVE・秘密情報・矛盾reportを拒否する検証API/UIをRQ31として追加する。backtest損益はファンド実収益にも8.88 USD回収原資にもならない。
2026-09-13追記（v1.26）: RockstarOS Marketsを、自動化ファンドへ組み込める読取専用の市場分析アダプターとして追加する。公開ライブ市場の確率・出来高・流動性は判断材料に限定し、サンプル値、モック残高、架空取引量、含み損益、見積損益を実収益へ変換しない。実注文は既定で無効とし、将来有効化する場合も所在地・提供地域・年齢・KYC・Wallet署名・注文ごとの明示承認を必須にする。Providerで確定した実現損益だけをRQ20/RQ29のEarning Receipt候補にできる。RQ30を追加する。
2026-09-12追記（v1.25）: 利用者は、増え続ける自動化ツールを動的なファンドへ束ね、利用者が選んだファンド内で自律的に収益化を進める構想を明示。ファンド数は固定せず、1ファンドの初期推奨を5ツールとするが構成数も変更可能にする。メルカリは唯一のモデルではなく収益経路の一つ。Providerで確認できた売上から承認済み実費を引き、Skyは利用者単位・UTC月単位で最大8.88 USDだけを回収し、それ以外は全額利用者の受取可能額とする。成果報酬、共同留保、ファンド間または利用者間の資金配給はP0へ含めない。RQ29を追加する。
## RQ29 数を固定しない自律型自動化ファンド
## RQ30 RockstarOS Marketsを読取専用の市場分析アダプターとして統合する
Marketsの分析系統とRQ20/RQ29の会計系統を分離し、ファンド残高・配分・利用者帰属額の正本はProvider参照とExecution Receiptに結ばれたEarning Receiptだけにする。将来、取引Providerが注文完了、取消、清算、手数料、返金を照合し、実現損益を確定した場合に限り、その実現損益をEarning Receipt候補にできる。未確定損益と市場の総取引量は利用者収益ではない。
## RQ31 外部Polymarket botを固定commitのbacktest sandboxとして接続する
2026-09-13 v1.27: `MrFadiAi/Polymarket-bot`の固定commitを監査し、原botの秘密鍵必須dry-run・即時LIVE切替・simulation PnL混在を境界外にした。clean treeのoffline backtestだけを実行するwrapper、report検証API/UI、秘密情報・改変・LIVE・矛盾を拒否する契約を追加した。注文・Wallet・実収益計上は有効化していない。
2026-09-12 v1.25: 自動化ツール群を動的に編成する自動化ファンドを中核へ追加。ファンド総数を固定せず、1ファンドは初期推奨5ツール・変更可能とした。検証済み純収益から全ファンド合算で月最大8.88 USDのみをSkyが回収し、成果報酬と共同留保を0、残額を100%利用者帰属とした。旧80/10/10試算は履歴画面へ分離し、共同運用・利用者間配給・収益保証は有効化しない。
````

### 2026-09-13 — merge `57020640` で落ちた側 `4f5cfed5`（5行）

統合: Merge durable Chat and Wallet workspaces ／ 落ちた側の最後のcommit: feat(wallet): add durable income and expense workspace

````text
2026-09-13追記（v1.22）: 利用者は、MCP接続後の処理を個別画面へ分散させず、Chatを共通の管理面にすることを明示。RQ26を追加する。接続済みMCPはbotとしてChatへ自動表示し、bot選択、方向・修正指示、公開機能と引数の確認、1回承認付き実行、結果、停止を同じスレッドで扱う。実行中割り込みを未対応MCPへ保証せず、方向修正は次の実行へ反映する。Skyは引き続き発見・接続・権限確認の入口とし、Chatとの責任分担を崩さない。
## RQ26 接続したMCPをChatのbotとして一元管理する
Skyで接続が成立したMCP serverとready商品は、Chatを開いたときに接続中のbotとして自動表示する。利用者はbotを選び、同じスレッドから依頼、方向・修正指示、公開された機能、tool schemaに基づく引数、実行前確認、結果、失敗状態を確認する。共通Connectorの動的server一覧とConnection Passportを正本とし、機能数やserver名をChatへ固定実装しない。
任意MCPの実行はRQ25の`prepare → 内容確認 → execute`を維持し、引数へ結び付いた一回承認を迂回しない。bot停止時は接続sessionと未使用の承認を失効させる。MCP自身に実行中の方向変更・取消機能がない場合、Chatの修正指示は次の実行用であり、進行中の処理を変更したとは表示しない。送信後timeoutと結果不明を自動再実行へ変換しない。
Skyは商品を探す、接続先・権限・料金を確認する、MCPへ接続する役割を維持する。Chatは接続後のbot選択、依頼、操作、状態、結果の管理面とする。Chatから任意command、shell、secret、未審査serverを登録できるようにはしない。外部投稿、支払い、送金等の作用は各商品の既存approval gateを通す。
````

### 2026-09-12 — merge `ae9d30e7` で落ちた側 `0cc5415e`（5行）

統合: Merge commit '0cc5415e4724199505e1f54942918b72eb88ccae' into codex/os-backend-sites-launch-20260912 ／ 落ちた側の最後のcommit: Merge pull request #13 from k999ln/codex/sky-one-click-fashion-mcp-20260912

````text
2026-09-12追記（v1.13）: 利用者がInstagramを中心にした受注型ファッションブランド運営systemを、`k999ln/rock`のSkyへ追加するよう明示。Provider差替、MCP discover/call、受注DB、分析feedback、危険操作のapproval gateをRQ18へ追加し、Sky catalogとTimelineへ独立商品として統合する。実Provider・実投稿・実請求は接続済みと扱わない。
## RQ18 Instagram運用・受注型ファッションブランド運営をSky商品にする
ブランド方針と商品designを入力し、target/market判定、差替可能な画像・動画Creative Provider、Instagram向け素材・caption・投稿/予約Social Provider、DM受信・分類・FAQ下書き・購入意向判定、注文情報回収、Payment Providerの決済link/Invoice、署名検証Webhookの入金確認、顧客/注文/制作/発送status、通知、広告/DM/売上feedbackまでを一つの商品として扱う。
RockstarOS Skyから`Instagram運用`で見つけられ、account list/switch、content plan、draft/caption、approval、schedule/publish、insights sync、DM classificationを独立MCP toolとしてdiscover/callできるようにする。外部サービスはProvider/Adapter境界へ置き、資格情報を商品DBへ直接保存しない。
価格変更、外部creative生成、投稿/予約、広告出稿、DM送信、決済link/Invoice送信、返金、通知は個別approvalを必須にする。初期状態はmock Providerで、実アカウント・実投稿・実決済・実課金を開始しない。曖昧な外部結果は自動再送せず照合待ちにする。Web Sky掲載とMCP host試験は、QEMU/Android/実機OSへの組込みや本番provider接続の合格ではない。
````

### 2026-09-12 — merge `d1d50af9` で落ちた側 `a0ff2f3d`（1行）

統合: merge: install fashion brand ops into Sky ／ 落ちた側の最後のcommit: feat(hub): add fashion brand operations MCP

````text
2026-09-12追記（v1.11）: 利用者がInstagramを中心にした受注型ファッションブランド運営systemを、`k999ln/rock`のRockstarOS Automation Hubへ追加するよう明示。Provider差替、MCP discover/call、受注DB、分析feedback、危険操作のapproval gateをRQ18へ追加する。実Provider・実投稿・実請求は接続済みと扱わない。
````

## docs/rockstaros-design-portal.md

### 2026-09-24 — merge `26125187` で落ちた側 `0adb6f84`（1行）

統合: docs: integrate current OS design without losing R5 requirements ／ 落ちた側の最後のcommit: docs: add RockstarOS complete design v1.0 (#29)

````text
5. [avocadoMini空間発明システム](rockstaros-avocado-mini-complete-design.md) — 物質発明を手で扱う体験と技術。
````

## docs/sky-assistant-and-memory.md

### 2026-10-05 — merge `ecb4b2af` で落ちた側 `624124cf`（1行）

統合: Merge remote-tracking branch 'origin/main' ／ 落ちた側の最後のcommit: Merge pull request #68 from k999ln/codex/sky-main-integration-20261005

````text
AMCのGoal・部隊管理役は計画保存と手動記録を担当します。WebからのAI自律実行は未接続です。
````

### 2026-09-12 — merge `ae9d30e7` で落ちた側 `0cc5415e`（1行）

統合: Merge commit '0cc5415e4724199505e1f54942918b72eb88ccae' into codex/os-backend-sites-launch-20260912 ／ 落ちた側の最後のcommit: Merge pull request #13 from k999ln/codex/sky-one-click-fashion-mcp-20260912

````text
Sky Memoryの永続保存、一般MCP接続、OAuth、自由会話型planner、複数役の自動連鎖はまだ実装していない。現在の画面で動くのは5役への入口と、既存ブラウザツールおよびFashion Brand Opsの接続確認までである。
````

### 2026-09-12 — merge `60654268` で落ちた側 `bb52f159`（1行）

統合: feat(sky): integrate brand operations into role feed ／ 落ちた側の最後のcommit: fix: preserve Sky mobile offset in production CSS

````text
Sky Memoryの永続保存、一般MCP接続、OAuth、自由会話型planner、複数役の自動連鎖はまだ実装していない。現在の画面で動くのは4役への入口と、既存4ツールの実行導線までである。
````

## docs/sky-tools-complete-design.md

### 2026-10-05 — merge `358fc461` で落ちた側 `59c07464`（4行）

統合: merge: preserve main WorkPlan repair with Zema access and cancellation guards ／ 落ちた側の最後のcommit: fix(spider): restore work plans and authoritative agent progress guards

````text
### 保存済みWorkPlanとクラウドAgentの進捗照合（SPIDER cycle 44）
O2 / R03、ROCK。Zemaが既存の仕事を再開する際は`normalizeWorkJob`でschema 1の計画とテンプレート固定の承認条件を復元する。依頼目的だけを最初の実行記録より前に編集でき、利用者入力による承認条件の追加・解除や不明な版を拒否する。読込み時の補完はDBのrevision・成果・完了状態を進めない。AMC一覧は本人の概要と空の履歴だけを返し、Goal本文は詳細取得に分ける。
クラウドAgentの進捗・最終確認ではAPIが履歴を含めて同じ本人と親jobの保存済み委任を照合する。見積手順には保存済み見積とdigest、結果手順にはremote完了・取得済み成果物・同じ親jobの利用receiptを必要とし、クライアントの`passed`申告だけで通過させない。dispatch時の本人承認・Wallet予約は既存A2A経路の責任で、この進捗APIは実行や送金を起動しない。利用権を必須とする環境では作成時のZema scopeを確認する。
本人は過去の委任証拠が欠けても未終了のローカル計画を取り消せる。本人分離とrevision競合拒否を維持し、リモートAgentの停止成功は意味しない。証拠不足の進行は409で拒否し、再取得・照合してから再試行する。実SQLiteと実handlerの合成入力回帰、同一SHAのCI、本番認証・配備を別に記録する。[検証と未解決条件](evidence/spider-work-plan-contract.json)を参照する。実機・本番受入や料金保留の解除は含まない。
````

### 2026-09-20 — merge `df1f2000` で落ちた側 `5ee96a47`（10行）

統合: merge: keep approved Sky documentation updates ／ 落ちた側の最後のcommit: docs: sync Sky catalog design and license audit

````text
| `gig-workflow` | 受託案件ワークフロー | candidate | 既存コード・設計あり / Sky実行器は未接続 | Sky実行未接続 |
| `coconala-inbox` | ココナラの依頼・添付整理 | candidate | 既存コード・設計あり / Sky実行器は未接続 | Sky実行未接続 |
| `youtube-script-writer` | YouTube台本 | candidate | 既存コード・設計あり / Sky実行器は未接続 | Sky実行未接続 |
| `seo-blueprint` | SEO・記事構成 | candidate | 既存コード・設計あり / Sky実行器は未接続 | Sky実行未接続 |
| `landing-page-sprint` | LP・販売ページ制作 | candidate | 既存コード・設計あり / Sky実行器は未接続 | Sky実行未接続 |
| `sales-objection-reply-builder` | 商談返信・見積り支援 | candidate | 既存コード・設計あり / Sky実行器は未接続 | Sky実行未接続 |
| `user-interview-synthesizer` | 顧客インタビュー分析 | candidate | 既存コード・設計あり / Sky実行器は未接続 | Sky実行未接続 |
| `calendar-coordination` | 予定・カレンダー連携 | candidate | 既存コード・設計あり / Sky実行器は未接続 | Sky実行未接続 |
| `telegram-notifications` | Telegram通知・承認 | candidate | 既存コード・設計あり / Sky実行器は未接続 | Sky実行未接続 |
| `producthunt-discovery` | 外部ツール候補の発見 | candidate | 既存コード・設計あり / Sky実行器は未接続 | Sky実行未接続 |
````

## docs/sky.md

### 2026-09-20 — merge `df1f2000` で落ちた側 `5ee96a47`（1行）

統合: merge: keep approved Sky documentation updates ／ 落ちた側の最後のcommit: docs: sync Sky catalog design and license audit

````text
Jevは[LLM・評価モデル設計](llm-evaluation-architecture.md)に従う任意remote evaluatorとして、route、同意UI、rubric、receiptまで実装した。接続credential、provider受入、本番での有効性は未完了であり、`ready`はこれらの合格を意味しない。
````

### 2026-09-20 — merge `a3a24b8b` で落ちた側 `963027cf`（2行）

統合: merge: sync main with origin and keep Sky local LLM work ／ 落ちた側の最後のcommit: feat: expand Sky local model catalog and connections

````text
| Jev品質評価 | Sky Cloud / AI Gateway | 確認済みの最小出力を根拠性・安全性・有用性の観点で評価する | 評価は助言のみ。個人情報・法務相談・未公開発明を送らず、権限や成功判定に使わない |
Jevは[LLM・評価モデル設計](llm-evaluation-architecture.md)に従うSkyの任意remote evaluatorで、法務受付・特許アシスタントとは別Tool・別provider同意で動く。
````

### 2026-09-12 — merge `75342d4c` で落ちた側 `d1d50af9`（1行）

統合: merge: align fashion brand ops with latest Sky tools ／ 落ちた側の最後のcommit: merge: install fashion brand ops into Sky

````text
この5件は `lib/catalog.ts` で `ready` とされる。Fashion Brand Opsはstdio/HTTP MCP接続、納品記録の照合はPC接続が必要。既存の3件はWebブラウザだけで完結する。Fashion Brand Opsの価格変更、外部生成、投稿・広告、DM送信、請求、返金、通知は個別承認が必要である。
````

### 2026-09-12 — merge `d1d50af9` で落ちた側 `bf85af69`（1行）

統合: merge: install fashion brand ops into Sky ／ 落ちた側の最後のcommit: feat: introduce Sky timeline and tool publishing

````text
この4件は `lib/catalog.ts` で `ready` とされ、仕事APIが受け付ける対象である。Webブラウザだけで完結するのは最初の3件。納品記録の照合はPC接続が必要。
````

## docs/system-composition.md

### 2026-09-20 — merge `a3a24b8b` で落ちた側 `963027cf`（1行）

統合: merge: sync main with origin and keep Sky local LLM work ／ 落ちた側の最後のcommit: feat: expand Sky local model catalog and connections

````text
| remote evaluator | Skyから任意・明示同意でJevを利用し、結果を助言に限定 | 適合 | route、SDK/API互換、closed rubric、Evaluation Receiptは実装。credential、provider sandbox、privacy/料金受入は未完了 |
````

### 2026-09-19 — merge `77c2e2ad` で落ちた側 `dd722ef0`（1行）

統合: Merge RockstarOS product updates into main ／ 落ちた側の最後のcommit: docs: define Jev evaluation architecture

````text
| remote evaluator | Skyから任意・明示同意でJevを利用し、結果を助言に限定 | 適合 | 設計と能力表のみ。route、SDK/API互換、credential、provider sandbox、privacy/料金受入は未実装 |
````

## docs/workstreams/05-web-pwa-sites.md

### 2026-10-05 — merge `358fc461` で落ちた側 `59c07464`（2行）

統合: merge: preserve main WorkPlan repair with Zema access and cancellation guards ／ 落ちた側の最後のcommit: fix(spider): restore work plans and authoritative agent progress guards

````text
## SPIDER cycle 44: WorkPlanとAgent進捗の照合復旧
O2 / R03、主streamはWeb / PWA、ROCK。main `4a22eb25`で欠落した計画schema・保存時の復元・編集制限を、既存の本人別D1/CAS契約に戻す。cloud-agentの入口だけを戻さず、同時にAPIの利用権と保存済み委任・見積・成果物・receipt照合を復元する。AMC専用経路、Skyの商品詳細からZemaへの引継ぎ、本人別bookmarkは保持する。証拠不整合でもローカル取消はowner/revision条件で可能とし、遠隔停止とは分ける。
````

## project.md

### 2026-10-05 — merge `dba8f320` で落ちた側 `ebaf4688`（2行）

統合: Merge PR 63 from-scratch LLM prototype without changing runtime authority ／ 落ちた側の最後のcommit: Record avokado prototype branch delivery and remaining gates

````text
| AI02 | モデルmanifest・仕事への版固定・互換更新を実装し、2候補交換／旧仕事再開を段階受入 | 進行中 | [記録](docs/ai-native-os-architecture.md) · [記録](android/core/src/main/java/dev/rock/core/platform/RuntimeManifest.java) · [記録](android/core/src/main/java/dev/rock/core/platform/ModelProfileManifest.java) · [記録](android/core/src/main/java/dev/rock/core/platform/TrustedModelPublisherVerifier.java) · [記録](android/core/src/main/java/dev/rock/core/platform/TrustedModelArtifactPipeline.java) · [記録](android/core/src/main/java/dev/rock/core/platform/ResumableModelArtifactStager.java) · [記録](android/core/src/main/java/dev/rock/core/platform/PlatformStore.java) · [記録](android/core/src/main/java/dev/rock/core/Engine.java) · [記録](android/core/src/test/java/dev/rock/core/PlatformStoreTest.java) · [記録](android/core/src/test/java/dev/rock/core/EngineTest.java) · [記録](android/core/src/test/java/dev/rock/core/platform/TrustedModelPublisherVerifierTest.java) · [記録](android/core/src/test/java/dev/rock/core/platform/ResumableModelArtifactStagerTest.java) · [記録](android/automation/src/main/java/dev/rock/automation/LocalAiConnection.java) · [記録](android/automation/src/main/java/dev/rock/automation/ZemaOrchestrator.java) · [記録](contracts/local-ai-runtime.json) · [記録](os/physical/local-ai-profile-v3.patch) · [記録](docs/evidence/local-ai-profile-v3-validation-20261001.json) · [記録](docs/evidence/ai02-core-java-validation-20261001.json) · [記録](android/local-ai-api/src/main/aidl/dev/rock/localai/ILocalAiService.aidl) · [記録](os/physical/local-ai-model-handoff-v4.patch) · [記録](docs/evidence/local-ai-model-handoff-v4-validation-20261001.json) · [記録](android/automation/src/main/java/dev/rock/automation/ModelProfileActivationCoordinator.java) · [記録](android/automation/src/main/java/dev/rock/automation/ModelProfileOperationLock.java) · [記録](scripts/check-os-contracts.mjs) · [記録](docs/avokado-llm-pretraining.md) · [記録](docs/evidence/avokado-llm-pretraining.json) · [記録](toolkits/avokado-llm/train.py) · [記録](toolkits/avokado-llm/test_pretraining.py) |
次の作業: Canonical offer is physical SIM/eSIM-led RockstarOS service access across purchase channels; carrier activation, service entitlement, account, OS/client install, cloud execution and AI billing remain distinct states. The local signed claim issuer and encrypted/idempotent seller delivery API are implemented; the Android Shell quote→device-credential Wallet hold→Broker proof→explicit Cloud approval→same-ID recovery source flow is wired and locally contract-tested. Current repository verification passes: Node 757/757, Worker/D1 API 1,048 assertions, CSV Worker/D1/R2 113 assertions, Fashion 19/19, typecheck, product lint, production build and release checks. Next run Android Core/AIDL/APK/instrumentation on an equipped CI/device host; then connect contracted seller checkout/delivery, carrier, Provider rates/meters/invoices and funded settlement. Production D1 readback is 0/6; local fixtures are not production billing, carrier activation, or successful exact-SKU OS installation. Separate AI02 research: avokado random-init CPU prototype is host-tested; fix corpus rights/independent evaluation and Mini runtime/export next. Additional compute spend limit is zero; device/cloud/full pretraining not accepted.
````

### 2026-10-05 — merge `cc9696f3` で落ちた側 `bd32370a`（1行）

統合: Merge PR 71 workspace descriptor validation with current metadata ／ 落ちた側の最後のcommit: fix(spider): validate opened snapshot files before reading

````text
| WEB04 | RockstarOS全体のvisual systemを統一し、主要フロントの機能性を改善 | 完了 | [記録](components/home-screen.tsx) · [記録](components/home-screen.module.css) · [記録](components/system-settings.module.css) · [記録](components/csv-business-workspace.module.css) · [記録](components/workspace-shell.tsx) · [記録](components/sky-surface.module.css) · [記録](components/sky-workspace.tsx) · [記録](components/sky-workspace.module.css) · [記録](components/sky-tool-card.tsx) · [記録](components/sky-tool-card.module.css) · [記録](components/sky-marketplace.tsx) · [記録](components/sky-marketplace.module.css) · [記録](components/sky-tool-workspace.tsx) · [記録](components/sky-tool-workspace.module.css) · [記録](components/fashion-brand-ops-runner.tsx) · [記録](components/fashion-brand-ops-runner.module.css) · [記録](components/sky-connection-center.tsx) · [記録](components/sky-connection-center.module.css) · [記録](components/sky-mcp-center.tsx) · [記録](components/sky-mcp-center.module.css) · [記録](components/sky-publisher-form.tsx) · [記録](components/sky-publisher-form.module.css) · [記録](lib/use-sky-tool-context.ts) · [記録](components/rock-studio.tsx) · [記録](components/coconala-team-workspace.tsx) · [記録](components/coconala-team-workspace.module.css) · [記録](app/workspace.css) · [記録](components/sky-chat-workspace.tsx) · [記録](tsconfig.json) · [記録](tests/web-route-style-contract.test.mjs) · [記録](docs/workstreams/01-product-ux.md) · [記録](docs/rockstaros-complete-design.md) · [記録](docs/frontend-usability-audit-20260915.md) · [記録](docs/product-baseline.md) · [記録](lib/sky-result-library.ts) · [記録](tests/sky-result-library.test.mjs) · [記録](app/sky/layout.tsx) · [記録](app/sky/manifest.webmanifest/route.ts) · [記録](lib/sky-app-manifest.ts) · [記録](tests/sky-app-manifest.test.mjs) · [記録](docs/sky.md) · [記録](scripts/amc-parallel.mjs) · [記録](tests/amc-workspace-snapshot.test.mjs) · [記録](docs/evidence/spider-workspace-snapshot-read.json) |
````

### 2026-10-05 — merge `5c0d15fa` で落ちた側 `d7d7d765`（4行）

統合: Merge PR 70 state reader while retaining current product contracts ／ 落ちた側の最後のcommit: Merge latest Sky integration into SPIDER state-read fix

````text
PR #52 の main 統合 `592daeea` 後、SYS15 / Security / ROCK として修正branchを作成。CodeQL #54 の `readJson` はpathをlstat検査した後に開き直すため、その間のsymlink置換やサイズ拡大でfile種別・5MB上限の検査を回避できた。local fixtureのstate／control／lock owner読取りの問題であり、remote認証突破とは評価しない。
一度だけnofollow／nonblockingで開き、同じfdをfstatして検査し、同じfdから64KiBずつ上限+1 byteまで読んで拡大を拒否する。成功・parse/read失敗のすべてでfdを閉じ、JSON解析診断に内容を含めない。既存schema・revision・lock・停止／復旧を維持。親directoryや同じinodeを変更できるlocal writerからの隔離を保証せず、保存先は本人が管理する。
同時にmainへ入ったPR #67（`a3951f52`）のCSV修正とAMC利用手順を保持して取り込んだ。さらにPR #68（`624124cf`）のSky統合を保持して再同期した。対象の状態readerには変更がなく、競合は進捗追記を両方残して解消した。旧版で差替え先の読取り・検査後の拡大を再現。新規6＋既存37＝43試験が合格、skipなし。独立source reviewでも退行なし。比較refは `refs/heads/codex/spider-autonomy-state-read`。修正前 `592daeea` のCodeQL run 37281429343は成功し、同refの#54はopen。push後の同じSHAのGitHub再検査と同refのalert結果をPRへ記録する。結果未取得を完了解消とせず、main merge・警告dismiss・検査緩和は行わない。
| WEB04 | RockstarOS全体のvisual systemを統一し、主要フロントの機能性を改善 | 完了 | [記録](components/home-screen.tsx) · [記録](components/home-screen.module.css) · [記録](components/system-settings.module.css) · [記録](components/csv-business-workspace.module.css) · [記録](components/workspace-shell.tsx) · [記録](components/sky-surface.module.css) · [記録](components/sky-workspace.tsx) · [記録](components/sky-workspace.module.css) · [記録](components/sky-tool-card.tsx) · [記録](components/sky-tool-card.module.css) · [記録](components/sky-marketplace.tsx) · [記録](components/sky-marketplace.module.css) · [記録](components/sky-tool-workspace.tsx) · [記録](components/sky-tool-workspace.module.css) · [記録](components/fashion-brand-ops-runner.tsx) · [記録](components/fashion-brand-ops-runner.module.css) · [記録](components/sky-connection-center.tsx) · [記録](components/sky-connection-center.module.css) · [記録](components/sky-mcp-center.tsx) · [記録](components/sky-mcp-center.module.css) · [記録](components/sky-publisher-form.tsx) · [記録](components/sky-publisher-form.module.css) · [記録](lib/use-sky-tool-context.ts) · [記録](components/rock-studio.tsx) · [記録](components/coconala-team-workspace.tsx) · [記録](components/coconala-team-workspace.module.css) · [記録](app/workspace.css) · [記録](components/sky-chat-workspace.tsx) · [記録](tsconfig.json) · [記録](tests/web-route-style-contract.test.mjs) · [記録](docs/workstreams/01-product-ux.md) · [記録](docs/rockstaros-complete-design.md) · [記録](docs/frontend-usability-audit-20260915.md) · [記録](docs/product-baseline.md) · [記録](lib/sky-result-library.ts) · [記録](tests/sky-result-library.test.mjs) · [記録](app/sky/layout.tsx) · [記録](app/sky/manifest.webmanifest/route.ts) · [記録](lib/sky-app-manifest.ts) · [記録](tests/sky-app-manifest.test.mjs) · [記録](docs/sky.md) · [記録](scripts/amc-autonomy-store.mjs) · [記録](tests/amc-autonomy-store-read.test.mjs) |
````

### 2026-10-05 — merge `ecb4b2af` で落ちた側 `624124cf`（12行）

統合: Merge remote-tracking branch 'origin/main' ／ 落ちた側の最後のcommit: Merge pull request #68 from k999ln/codex/sky-main-integration-20261005

````text
最初の並列suiteではloopback待受が`EPERM`となった。loopback権限を取得し直し、全体verifyを再実行してexit 0（Node 696/696、Fashion 19/19、Worker/D1 API 959、CSV 113、migration convergence 9/9、typecheck/lint/build/assets）を確認。production D1 readbackは0/6、Android Java/APK/device acceptance、Provider billing、carrier activation、販売、OS installationは未実施。
| SIM01 | 物理SIM/eSIM購入からRockstarOS・Sky/Zema・Agentへの一度きり認証と端末別利用開始を通す | 進行中 | [記録](docs/product-baseline.md) · [記録](docs/rockstaros-complete-design.md) · [記録](docs/os-development-design.md) · [記録](toolkits/esim-bootstrap/README.md) · [記録](docs/workstreams/07-android-device-local-ai.md) · [記録](app/connect/page.tsx) · [記録](components/home-screen.tsx) · [記録](data/product-baseline.json) · [記録](AGENTS.md) · [記録](sites/avocado-mini/src/pages/index.astro) · [記録](sites/avocado-mini/src/service-home.css) · [記録](sites/avocado-mini/tests/astro-build.test.mjs) · [記録](tests/sim-service-entry.test.mjs) · [記録](docs/prompts/rock-current-next-20261001.md) · [記録](docs/sim-service-entitlement-claims.md) · [記録](lib/rockstar-entitlement-claim.ts) · [記録](app/api/rockstar/entitlements/route.ts) · [記録](lib/rockstar-entitlement-event.ts) · [記録](app/api/rockstar/entitlements/events/route.ts) · [記録](db/schema.ts) · [記録](drizzle/0039_rockstar_service_entitlements.sql) · [記録](drizzle/0040_rockstar_entitlement_events.sql) · [記録](tests/rockstar-entitlement-claim.test.mjs) · [記録](components/rockstar-entitlement-claim.tsx) · [記録](scripts/check-work-api.mjs) · [記録](app/api/sky/a2a-delegations/route.ts) · [記録](app/api/sky/a2a-delegations/[id]/route.ts) · [記録](services/sky-agent-runtime/src/worker.ts) · [記録](services/sky-agent-runtime/vitest.config.ts) · [記録](services/sky-agent-runtime/test/a2a-workflow.positive.test.mjs) · [記録](docs/a2a-pricing-extension.md) · [記録](lib/currency-format.ts) · [記録](tests/currency-format.test.mjs) · [記録](components/workbench.tsx) · [記録](app/work/work.css) · [記録](lib/a2a-price-quote.ts) · [記録](tests/a2a-price-quote.test.mjs) · [記録](app/api/sky/a2a-delegations/[id]/broker-authorization/route.ts) · [記録](lib/remote-ai-pricing-gate.ts) · [記録](lib/remote-ai-rate-card.ts) · [記録](lib/remote-ai-rate-card-registry.ts) · [記録](tests/remote-ai-rate-card.test.mjs) · [記録](tests/remote-ai-rate-card-registry.test.mjs) · [記録](app/api/llm/estimate/route.ts) · [記録](components/sky-chat-workspace.tsx) · [記録](docs/evidence/remote-ai-estimate-api-20261001.json) · [記録](drizzle/0042_remote_ai_rate_cards.sql) · [記録](lib/remote-ai-rate-card-store.ts) · [記録](lib/remote-ai-rate-card-operator.ts) · [記録](app/api/internal/remote-ai/rate-cards/route.ts) · [記録](drizzle/0043_a2a_delegation_fanout_limits.sql) · [記録](lib/a2a-delegation-store.ts) · [記録](tests/a2a-client.test.mjs) · [記録](services/sky-agent-runtime/vitest.config.ts) · [記録](app/api/llm/text/route.ts) · [記録](app/api/legal-guidance/route.ts) · [記録](app/api/patent-research/route.ts) · [記録](app/api/jev-evaluation/route.ts) · [記録](lib/sky-service-status.ts) · [記録](tests/sky-service-status.test.mjs) · [記録](docs/evidence/remote-ai-price-gate-20261001.json) · [記録](drizzle/0044_a2a_live_usage_snapshots.sql) · [記録](lib/a2a-live-usage.ts) · [記録](app/api/sky/a2a-delegations/[id]/usage-snapshots/route.ts) · [記録](tests/a2a-live-usage.test.mjs) · [記録](docs/evidence/a2a-live-usage-local-20261001.json) · [記録](docs/evidence/mcp-pricing-gate-local-20261001.json) · [記録](docs/evidence/product-direction-regression-20261001.json) · [記録](docs/evidence/android-a2a-usage-verifier-20261001.json) · [記録](docs/evidence/android-a2a-wallet-reservation-20261001.json) · [記録](android/core/src/main/java/dev/rock/core/platform/PlatformStore.java) · [記録](android/core/src/test/java/dev/rock/core/A2AWalletReservationTest.java) · [記録](docs/workstreams/03-wallet-billing-providers.md) · [記録](docs/provider-contract-readiness-20260930.md) · [記録](toolkits/sky-mcp-connector/server.mjs) · [記録](tests/mcp-connector.test.mjs) · [記録](public/toolkits/sky-mcp-connector.zip) · [記録](docs/workstreams/02-sky-mcp.md) · [記録](android/core/src/main/java/dev/rock/core/platform/A2AWalletSettlementSync.java) · [記録](android/core/src/main/java/dev/rock/core/platform/A2AWalletHandoffRequest.java) · [記録](android/core/src/test/java/dev/rock/core/A2AWalletHandoffRequestTest.java) · [記録](android/core/src/test/resources/a2a-wallet-handoff-request-v1.json) · [記録](tests/a2a-wallet-handoff-auth.test.mjs) · [記録](android/automation/src/main/java/dev/rock/automation/A2ABrokerDeviceKeyStore.java) · [記録](android/automation/src/androidTest/java/dev/rock/automation/A2ABrokerDeviceKeyStoreTest.java) · [記録](docs/rockstar-device-link.md) · [記録](docs/evidence/rockstar-device-link-local-20261001.json) · [記録](lib/rockstar-device-link.ts) · [記録](lib/request-auth.ts) · [記録](app/api/rockstar/device-authorizations/route.ts) · [記録](app/api/rockstar/device-authorizations/approve/route.ts) · [記録](app/api/rockstar/device-sessions/route.ts) · [記録](app/connect/device/page.tsx) · [記録](components/rockstar-device-authorization.tsx) · [記録](android/core/src/main/java/dev/rock/core/platform/RockstarDeviceAuthorizationFlow.java) · [記録](android/core/src/test/java/dev/rock/core/platform/RockstarDeviceAuthorizationFlowTest.java) · [記録](android/automation/src/main/java/dev/rock/automation/AndroidRockstarDeviceAuthorizationTransport.java) · [記録](android/automation/src/main/java/dev/rock/automation/AndroidRockstarDeviceSessionStore.java) · [記録](android/automation/src/androidTest/java/dev/rock/automation/RockstarDeviceAccountLinkTest.java) · [記録](android/shell-api/src/main/aidl/dev/rock/shellapi/IShellApi.aidl) · [記録](android/shell/src/main/java/dev/rock/shell/MainActivity.java) · [記録](android/shell/src/main/java/dev/rock/shell/ShellConnection.java) · [記録](android/automation/src/main/java/dev/rock/automation/RockShellService.java) · [記録](android/automation/src/main/java/dev/rock/automation/AndroidA2ABrokerEnrollment.java) · [記録](android/automation/src/main/java/dev/rock/automation/AndroidRockstarDeviceHomeTransport.java) · [記録](app/api/sky/a2a-delegations/[id]/route.ts) · [記録](android/automation/src/main/AndroidManifest.xml) · [記録](android/automation/build.gradle) · [記録](android/shell/src/androidTest/java/dev/rock/shell/ShellBrokerIntegrationTest.java) · [記録](drizzle/0045_rockstar_device_sessions.sql) · [記録](drizzle/0046_remote_ai_text_executions.sql) · [記録](lib/remote-ai-text-store.ts) · [記録](app/api/rockstar/device-home/route.ts) · [記録](android/automation/src/main/java/dev/rock/automation/AndroidRockstarDeviceHomeTransport.java) · [記録](scripts/check-os-contracts.mjs) · [記録](app/api/llm/quotes/route.ts) · [記録](app/api/llm/quotes/[id]/route.ts) · [記録](lib/remote-ai-text-http.ts) · [記録](tests/remote-ai-pricing-gate.test.mjs) · [記録](tests/remote-ai-text-public-record.test.mjs) · [記録](docs/sky-cloud-continuity.md) · [記録](lib/remote-ai-text-input.ts) · [記録](lib/remote-ai-text-execution.ts) · [記録](services/sky-agent-runtime/wrangler.jsonc) · [記録](drizzle/0047_remote_ai_text_durable_inputs.sql) · [記録](tests/remote-ai-text-input.test.mjs) · [記録](drizzle/meta/0047_snapshot.json) · [記録](tests/remote-ai-text-store.test.mjs) · [記録](scripts/database-status.mjs) · [記録](tests/database-status.test.mjs) · [記録](docs/database-status.md) · [記録](docs/evidence/remote-ai-cloud-workflow-local-20261002.json) · [記録](docs/ai-native-os-architecture.md) · [記録](docs/rockstaros-1.0-strategy.md) · [記録](AGENTS.md) · [記録](docs/rockstaros-product-system-map.md) · [記録](docs/product-north-star-20260915.md) · [記録](docs/workstreams/01-product-ux.md) · [記録](app/connect/page.tsx) · [記録](components/home-screen.tsx) · [記録](components/home-screen.module.css) · [記録](tests/sim-service-entry.test.mjs) · [記録](tests/web-route-style-contract.test.mjs) · [記録](tests/migration-union.test.mjs) · [記録](tests/database-status.test.mjs) · [記録](docs/evidence/sim-service-entry-local-20261002.json) · [記録](app/api/llm/estimate/route.ts) · [記録](components/workbench.tsx) · [記録](lib/currency-format.ts) · [記録](tests/currency-format.test.mjs) · [記録](scripts/check-work-api.mjs) · [記録](docs/workstreams/01-product-ux.md) · [記録](docs/sky-cloud-continuity.md) · [記録](docs/evidence/sim-service-usage-rates-local-20261002.json) · [記録](docs/evidence/sim-service-claim-file-import-local-20261002.json) · [記録](android/shell/src/main/java/dev/rock/shell/UsageCurrencyFormatter.java) · [記録](docs/evidence/sim-service-android-usage-status-local-20261002.json) · [記録](android/shell/src/main/java/dev/rock/shell/MainActivity.java) · [記録](android/shell/src/main/AndroidManifest.xml) · [記録](docs/evidence/sim-led-product-direction-audit-20261002.json) · [記録](android/automation/src/main/java/dev/rock/automation/AndroidA2ABrokerDeviceRefStore.java) · [記録](android/automation/src/main/java/dev/rock/automation/AndroidA2ABrokerDeviceTransport.java) · [記録](android/automation/src/main/java/dev/rock/automation/AndroidA2ABrokerEnrollment.java) · [記録](android/automation/src/main/java/dev/rock/automation/AndroidA2AUsageTrustConfig.java) · [記録](android/automation/src/androidTest/java/dev/rock/automation/AndroidA2AUsageTrustConfigTest.java) · [記録](android/automation/src/main/java/dev/rock/automation/RockApplication.java) · [記録](android/core/src/main/java/dev/rock/core/platform/A2AUsageReceiptVerifier.java) · [記録](docs/rockstaros-1.0-architecture.md) · [記録](android/core/src/test/java/dev/rock/core/platform/A2AUsageReceiptVerifierTest.java) · [記録](android/core/src/test/resources/a2a-price-quote-v1.json) · [記録](docs/evidence/android-a2a-price-quote-verifier-20261002.json) · [記録](docs/evidence/android-a2a-reservation-bridge-audit-20261002.json) · [記録](android/core/src/main/java/dev/rock/core/platform/A2ABrokerAuthorization.java) · [記録](android/core/src/test/java/dev/rock/core/platform/A2ABrokerAuthorizationTest.java) · [記録](android/core/src/test/resources/a2a-wallet-reservation-v2.json) · [記録](android/core/src/test/resources/a2a-broker-authorization-v2.json) · [記録](tests/a2a-wallet-reservation.test.mjs) · [記録](tests/a2a-broker-authorization.test.mjs) · [記録](docs/evidence/android-a2a-native-reservation-core-20261002.json) · [記録](docs/evidence/a2a-price-quote-acquisition-local-20261002.json) · [記録](app/api/sky/a2a-price-quotes/route.ts) · [記録](lib/a2a-price-quote-acquisition.ts) · [記録](tests/a2a-price-quote-acquisition.test.mjs) · [記録](lib/a2a-usage-receipt.ts) · [記録](tests/a2a-usage-receipt.test.mjs) · [記録](lib/a2a-price-quote-consent-store.ts) · [記録](drizzle/0049_a2a_price_quote_consent_events.sql) · [記録](tests/a2a-price-quote-consent-store.test.mjs) · [記録](android/automation/src/main/java/dev/rock/automation/AndroidA2AJson.java) · [記録](docs/evidence/android-a2a-quote-review-source-20261002.json) · [記録](android/shell-api/src/main/aidl/dev/rock/shellapi/IShellApi.aidl) · [記録](android/shell/src/main/java/dev/rock/shell/MainActivity.java) · [記録](android/automation/src/main/java/dev/rock/automation/RockShellService.java) · [記録](android/core/src/main/java/dev/rock/core/platform/PlatformStore.java) · [記録](android/core/src/test/java/dev/rock/core/A2AWalletReservationTest.java) · [記録](android/automation/src/main/java/dev/rock/automation/AndroidRockstarDeviceHomeTransport.java) · [記録](app/api/rockstar/device-home/route.ts) · [記録](scripts/check-os-contracts.mjs) · [記録](tests/sim-service-entry.test.mjs) · [記録](docs/evidence/android-a2a-cloud-draft-bridge-20261002.json) · [記録](docs/evidence/android-a2a-cloud-approval-recovery-20261002.json) · [記録](docs/evidence/android-a2a-native-cancel-20261002.json) · [記録](docs/evidence/android-a2a-detail-recovery-20261002.json) · [記録](android/core/src/main/java/dev/rock/core/platform/A2ARecoveryBinding.java) · [記録](android/core/src/test/java/dev/rock/core/platform/A2ARecoveryBindingTest.java) · [記録](drizzle/0050_rockstar_entitlement_purchase_once.sql) · [記録](docs/evidence/sim-service-claim-file-import-local-20261002.json) · [記録](lib/rockstar-entitlement-issuer.ts) · [記録](tests/rockstar-entitlement-issuer.test.mjs) · [記録](docs/evidence/remote-ai-text-live-estimate-local-20261002.json) · [記録](lib/llm-providers.ts) · [記録](lib/remote-ai-text-pricing.ts) · [記録](drizzle/0051_remote_ai_text_live_estimates.sql) · [記録](drizzle/meta/0051_snapshot.json) · [記録](tests/llm-providers.test.mjs) · [記録](docs/evidence/sim-service-replacement-ack-local-20261002.json) · [記録](docs/evidence/sim-service-issuer-delivery-store-local-20261002.json) · [記録](docs/evidence/sim-service-issuer-delivery-api-local-20261002.json) · [記録](docs/evidence/sim-service-issuer-rate-limit-local-20261002.json) · [記録](drizzle/0054_rockstar_entitlement_issuer_rate_limits.sql) · [記録](tests/rockstar-entitlement-delivery-http.test.mjs) · [記録](lib/rockstar-entitlement-issuer-store.ts) · [記録](drizzle/0052_rockstar_entitlement_issuer_deliveries.sql) · [記録](drizzle/0053_rockstar_entitlement_delivery_key_ids.sql) · [記録](drizzle/meta/0052_snapshot.json) · [記録](drizzle/meta/0053_snapshot.json) · [記録](tests/rockstar-entitlement-issuer-store.test.mjs) · [記録](docs/evidence/sim-service-android-native-claim-local-20261002.json) · [記録](lib/rockstar-service-offers.ts) · [記録](tests/rockstar-service-offers.test.mjs) · [記録](docs/evidence/rockstar-service-offer-profiles-local-20261002.json) · [記録](components/sky-marketplace.tsx) · [記録](components/sky-chat-workspace.tsx) · [記録](components/workbench.tsx) · [記録](lib/workflow.ts) · [記録](lib/rockstar-package-handoff.ts) · [記録](lib/sky-package-runtime.ts) · [記録](lib/mcp-hub.ts) · [記録](components/mcp-bot-runner.tsx) · [記録](tests/sky-package-runtime.test.mjs) · [記録](tests/mcp-connector.test.mjs) · [記録](tests/rockstar-package-handoff.test.mjs) · [記録](tests/workflow.test.mjs) · [記録](docs/evidence/zema-versioned-plan-local-20261002.json) · [記録](docs/evidence/rockstar-package-zema-handoff-local-20261002.json) · [記録](docs/sim-service-entitlement-claims.md) · [記録](lib/rockstar-service-package-access.ts) · [記録](tests/rockstar-service-package-access.test.mjs) · [記録](lib/sky-commerce.ts) · [記録](tests/sky-commerce.test.mjs) · [記録](lib/sky-package-runtime-binding.ts) · [記録](tests/sky-package-runtime-binding.test.mjs) · [記録](docs/evidence/sky-package-runtime-binding-local-20261002.json) · [記録](drizzle/0055_sky_package_runtime_bindings.sql) · [記録](lib/sky-package-runtime-binding-store.ts) · [記録](lib/sky-tool-package-store.ts) · [記録](app/api/internal/sky-package-runtime-bindings/route.ts) · [記録](docs/evidence/sky-package-runtime-binding-quote-delegation-local-20261002.json) · [記録](docs/sim-led-product-architecture.md) · [記録](docs/sky-a2a-bridge.md) · [記録](docs/evidence/sim-led-product-correction-20261002.json) · [記録](docs/evidence/a2a-two-agent-handoff-local-20261002.json) · [記録](lib/a2a-result-handoff.ts) · [記録](tests/a2a-result-handoff.test.mjs) · [記録](docs/evidence/a2a-zema-result-handoff-local-20261002.json) · [記録](docs/evidence/a2a-two-agent-cloud-workflow-local-20261002.json) · [記録](lib/esim-device-install-store.ts) · [記録](docs/evidence/esim-install-proof-concurrency-local-20261002.json) · [記録](lib/a2a-parent-controller.ts) · [記録](tests/a2a-parent-controller.test.mjs) · [記録](docs/evidence/a2a-parent-controller-local-20261002.json) · [記録](tests/a2a-delegation-store.test.mjs) · [記録](docs/evidence/a2a-deadline-sweep-local-20261002.json) · [記録](drizzle/0057_a2a_parent_sequence.sql) · [記録](drizzle/meta/_journal.json) · [記録](lib/a2a-delegation-recovery.ts) · [記録](tests/a2a-delegation-recovery.test.mjs) · [記録](docs/evidence/a2a-persisted-handoff-link-local-20261002.json) · [記録](docs/sky-cloud-operations-runbook.md) · [記録](lib/rockstar-entitlement-delivery-http.ts) · [記録](app/api/internal/rockstar/entitlement-deliveries/route.ts) · [記録](docs/evidence/sim-led-product-correction-followup-20261002.json) · [記録](android/shell/src/main/java/dev/rock/shell/MainActivity.java) · [記録](android/shell-api/src/main/aidl/dev/rock/shellapi/IShellApi.aidl) |
| SKY21 | Sky独立サービスの基本利用・作者市場・有料販売・OS/他アプリ接続を証拠別に受け入れる | 進行中 | [記録](docs/sky-launch-design.md) · [記録](data/sky-service-launch.json) · [記録](lib/sky-service-status.ts) · [記録](app/api/sky/service-status/route.ts) · [記録](app/sky/help/page.tsx) · [記録](tests/sky-service-status.test.mjs) · [記録](docs/sky-launch-operations.md) · [記録](components/sky-publisher-form.tsx) · [記録](docs/evidence/sky-pixel-service-acceptance.json) · [記録](lib/operations.ts) · [記録](lib/local-guide-history.ts) · [記録](components/local-guide-history-consent.tsx) · [記録](components/legal-intake-runner.tsx) · [記録](components/patent-assistant-runner.tsx) · [記録](tests/local-guide-history.test.mjs) · [記録](tests/operations.test.mjs) |
| AI02 | モデルmanifest・仕事への版固定・互換更新を実装し、2候補交換／旧仕事再開を段階受入 | 進行中 | [記録](docs/ai-native-os-architecture.md) · [記録](android/core/src/main/java/dev/rock/core/platform/RuntimeManifest.java) · [記録](android/core/src/main/java/dev/rock/core/platform/ModelProfileManifest.java) · [記録](android/core/src/main/java/dev/rock/core/platform/TrustedModelPublisherVerifier.java) · [記録](android/core/src/main/java/dev/rock/core/platform/TrustedModelArtifactPipeline.java) · [記録](android/core/src/main/java/dev/rock/core/platform/ResumableModelArtifactStager.java) · [記録](android/core/src/main/java/dev/rock/core/platform/PlatformStore.java) · [記録](android/core/src/main/java/dev/rock/core/Engine.java) · [記録](android/core/src/test/java/dev/rock/core/PlatformStoreTest.java) · [記録](android/core/src/test/java/dev/rock/core/EngineTest.java) · [記録](android/core/src/test/java/dev/rock/core/platform/TrustedModelPublisherVerifierTest.java) · [記録](android/core/src/test/java/dev/rock/core/platform/ResumableModelArtifactStagerTest.java) · [記録](android/automation/src/main/java/dev/rock/automation/LocalAiConnection.java) · [記録](android/automation/src/main/java/dev/rock/automation/ZemaOrchestrator.java) · [記録](contracts/local-ai-runtime.json) · [記録](os/physical/local-ai-profile-v3.patch) · [記録](docs/evidence/local-ai-profile-v3-validation-20261001.json) · [記録](docs/evidence/ai02-core-java-validation-20261001.json) · [記録](android/local-ai-api/src/main/aidl/dev/rock/localai/ILocalAiService.aidl) · [記録](os/physical/local-ai-model-handoff-v4.patch) · [記録](docs/evidence/local-ai-model-handoff-v4-validation-20261001.json) · [記録](android/automation/src/main/java/dev/rock/automation/ModelProfileActivationCoordinator.java) · [記録](android/automation/src/main/java/dev/rock/automation/ModelProfileOperationLock.java) · [記録](scripts/check-os-contracts.mjs) · [記録](docs/evidence/pr-consolidation-20261005.json) |
| AI05 | Sky app／OSの能力宣言と単一実行端末固定を実装し、多端末移管は独立拡張として受入 | 進行中 | [記録](docs/ai-native-os-architecture.md) · [記録](contracts/compute-device-capabilities.json) · [記録](systems/rock-star-os/os/ai_routes/policy.py) · [記録](systems/rock-star-os/os/ai_routes/store.py) · [記録](contracts/device-capability-snapshot.json) · [記録](android/automation/src/main/java/dev/rock/automation/DeviceCapabilitySnapshot.java) · [記録](android/automation/src/main/java/dev/rock/automation/LocalAiConnection.java) · [記録](android/automation/src/main/java/dev/rock/automation/RockShellService.java) · [記録](android/automation/src/main/java/dev/rock/automation/ZemaOrchestrator.java) · [記録](android/shell/src/main/java/dev/rock/shell/MainActivity.java) · [記録](systems/rock-star-os/os/ai_routes/tests/test_policy_budget.py) · [記録](docs/evidence/pr-consolidation-20261005.json) |
| SKY02 | ToB向け簡易掲載フォーム・審査キューとToC向けSky Timelineを実装 | 完了 | [記録](app/sky/publish/page.tsx) · [記録](components/sky-publisher-form.tsx) · [記録](app/api/sky/submissions/route.ts) · [記録](tests/sky-submission.test.mjs) · [記録](app/sky/marketplace/page.tsx) · [記録](app/sky/register/page.tsx) · [記録](components/sky-marketplace.tsx) · [記録](components/sky-marketplace.module.css) · [記録](lib/sky-marketplace-policy.ts) · [記録](lib/sky-ai-marketplace.ts) · [記録](components/sky-tool-workspace.tsx) · [記録](lib/sky-tool-compatibility.ts) · [記録](app/workspace.css) · [記録](components/sky-tool-workspace.module.css) · [記録](tests/sky-marketplace.test.mjs) · [記録](tests/jev-router-availability.test.mjs) · [記録](docs/sky-network-economy.md) |
| SKY07 | MCPごとにこのPC・Sky Cloud・提供者MCPの接続先を選び、対応先へワンタップ接続する | 進行中 | [記録](components/sky-mcp-center.tsx) · [記録](components/sky-mcp-center.module.css) · [記録](lib/mcp-hub.ts) · [記録](toolkits/sky-mcp-connector/server.mjs) · [記録](scripts/package-sky-mcp.py) · [記録](public/toolkits/sky-mcp-connector.zip) · [記録](docs/sky-mcp-connector.md) · [記録](tests/mcp-connector.test.mjs) · [記録](tests/sky-mcp-onboarding.test.mjs) · [記録](docs/product-baseline.md) · [記録](docs/sky-cloud-continuity.md) · [記録](docs/cloud-agent-provider-comparison-20261001.md) · [記録](lib/a2a-client.ts) · [記録](tests/a2a-client.test.mjs) · [記録](lib/a2a-authorization.ts) · [記録](tests/a2a-authorization.test.mjs) · [記録](docs/sky-a2a-bridge.md) · [記録](lib/a2a-delegation-store.ts) · [記録](drizzle/0019_sky_a2a_delegations.sql) · [記録](tests/a2a-delegation-store.test.mjs) · [記録](drizzle/0020_a2a_delegation_events.sql) · [記録](app/api/sky/a2a-delegations/route.ts) · [記録](app/api/sky/a2a-delegations/[id]/route.ts) · [記録](scripts/check-work-api.mjs) · [記録](tests/database-status.test.mjs) · [記録](lib/a2a-input-crypto.ts) · [記録](tests/a2a-input-crypto.test.mjs) · [記録](drizzle/0021_a2a_delegation_inputs.sql) · [記録](drizzle/0022_a2a_delegation_artifacts.sql) · [記録](lib/a2a-artifacts.ts) · [記録](tests/a2a-artifacts.test.mjs) · [記録](app/api/sky/a2a-delegations/[id]/artifacts/route.ts) · [記録](app/api/sky/a2a-delegations/[id]/wallet-settlement/route.ts) · [記録](components/workbench.tsx) · [記録](app/work/work.css) · [記録](services/sky-agent-runtime/src/worker.ts) · [記録](services/sky-agent-runtime/wrangler.jsonc) · [記録](package.json) · [記録](lib/a2a-agent-directory.ts) · [記録](tests/a2a-agent-directory.test.mjs) · [記録](drizzle/0023_a2a_sky_agent_connections.sql) · [記録](app/api/sky/a2a-agents/route.ts) · [記録](app/api/sky/a2a-agents/[id]/route.ts) · [記録](lib/a2a-broker-trust.ts) · [記録](tests/a2a-broker-authorization.test.mjs) · [記録](drizzle/0024_a2a_broker_authorizations.sql) · [記録](app/api/sky/a2a-delegations/[id]/broker-authorization/route.ts) · [記録](tests/fixtures/a2a/python_agent.py) · [記録](services/sky-agent-runtime/vitest.config.ts) · [記録](services/sky-agent-runtime/test/a2a-workflow.positive.test.mjs) · [記録](docs/evidence/sky-a2a-workflow-local-20260930.json) · [記録](drizzle/0033_a2a_offline_continuation_consent.sql) · [記録](systems/rock-star-os/os/mcp_broker/a2a_authorization.py) · [記録](systems/rock-star-os/src/blackberryrock/spend.py) · [記録](systems/rock-star-os/tests/test_spend_runtime.py) · [記録](lib/a2a-delegation-recovery.ts) · [記録](tests/a2a-delegation-recovery.test.mjs) · [記録](systems/rock-star-os/scripts/accept-cloud-wallet-handoff.py) · [記録](docs/evidence/a2a-cloud-python-wallet-handoff-20261001.json) · [記録](docs/evidence/android-device-owner-session-20261002.json) · [記録](android/core/src/main/java/dev/rock/core/platform/RockstarDeviceAuthorizationFlow.java) · [記録](android/automation/src/main/java/dev/rock/automation/AndroidRockstarDeviceSessionStore.java) · [記録](lib/rockstar-device-link.ts) · [記録](docs/evidence/android-a2a-p256-broker-key-20261002.json) · [記録](android/automation/src/main/java/dev/rock/automation/A2ABrokerDeviceKeyStore.java) · [記録](lib/a2a-broker-authorization.ts) · [記録](lib/a2a-wallet-handoff-auth.ts) · [記録](lib/a2a-broker-trust.ts) · [記録](tests/a2a-broker-authorization.test.mjs) · [記録](tests/a2a-wallet-handoff-auth.test.mjs) · [記録](app/api/rockstar/broker-devices/route.ts) · [記録](lib/a2a-broker-device-store.ts) · [記録](scripts/check-work-api.mjs) · [記録](android/automation/src/main/java/dev/rock/automation/AndroidA2ABrokerDeviceRefStore.java) · [記録](android/automation/src/main/java/dev/rock/automation/AndroidA2ABrokerDeviceTransport.java) · [記録](android/automation/src/main/java/dev/rock/automation/AndroidA2ABrokerEnrollment.java) · [記録](android/automation/src/main/java/dev/rock/automation/RockShellService.java) · [記録](android/shell-api/src/main/aidl/dev/rock/shellapi/IShellApi.aidl) · [記録](android/shell/src/main/java/dev/rock/shell/ShellConnection.java) · [記録](android/shell/src/main/java/dev/rock/shell/MainActivity.java) · [記録](tests/sim-service-entry.test.mjs) · [記録](scripts/check-os-contracts.mjs) · [記録](android/automation/src/androidTest/java/dev/rock/automation/A2ABrokerDeviceKeyStoreTest.java) · [記録](android/shell/src/androidTest/java/dev/rock/shell/ShellBrokerIntegrationTest.java) · [記録](android/automation/build.gradle) · [記録](android/automation/src/main/java/dev/rock/automation/AndroidA2AUsageTrustConfig.java) · [記録](android/automation/src/androidTest/java/dev/rock/automation/AndroidA2AUsageTrustConfigTest.java) · [記録](android/automation/src/main/java/dev/rock/automation/RockApplication.java) · [記録](android/core/src/main/java/dev/rock/core/platform/A2AUsageReceiptVerifier.java) · [記録](docs/workstreams/03-wallet-billing-providers.md) · [記録](docs/workstreams/07-android-device-local-ai.md) · [記録](docs/sim-service-entitlement-claims.md) · [記録](docs/rockstaros-1.0-architecture.md) · [記録](docs/evidence/sim-led-product-direction-audit-20261002.json) · [記録](android/core/src/test/java/dev/rock/core/platform/A2AUsageReceiptVerifierTest.java) · [記録](android/core/src/test/resources/a2a-price-quote-v1.json) · [記録](tests/a2a-price-quote.test.mjs) · [記録](docs/evidence/android-a2a-price-quote-verifier-20261002.json) · [記録](docs/evidence/android-a2a-reservation-bridge-audit-20261002.json) · [記録](android/core/src/main/java/dev/rock/core/platform/A2ABrokerAuthorization.java) · [記録](android/core/src/test/java/dev/rock/core/platform/A2ABrokerAuthorizationTest.java) · [記録](android/core/src/test/resources/a2a-wallet-reservation-v2.json) · [記録](android/core/src/test/resources/a2a-broker-authorization-v2.json) · [記録](tests/a2a-wallet-reservation.test.mjs) · [記録](docs/evidence/android-a2a-native-reservation-core-20261002.json) · [記録](docs/evidence/a2a-price-quote-acquisition-local-20261002.json) · [記録](app/api/sky/a2a-price-quotes/route.ts) · [記録](lib/a2a-price-quote-acquisition.ts) · [記録](tests/a2a-price-quote-acquisition.test.mjs) · [記録](lib/a2a-usage-receipt.ts) · [記録](tests/a2a-usage-receipt.test.mjs) · [記録](lib/a2a-price-quote-consent-store.ts) · [記録](drizzle/0049_a2a_price_quote_consent_events.sql) · [記録](tests/a2a-price-quote-consent-store.test.mjs) · [記録](docs/evidence/a2a-two-agent-handoff-local-20261002.json) · [記録](lib/a2a-result-handoff.ts) · [記録](tests/a2a-result-handoff.test.mjs) · [記録](docs/evidence/a2a-zema-result-handoff-local-20261002.json) · [記録](docs/evidence/a2a-two-agent-cloud-workflow-local-20261002.json) · [記録](lib/esim-device-install-store.ts) · [記録](docs/evidence/esim-install-proof-concurrency-local-20261002.json) · [記録](lib/a2a-parent-controller.ts) · [記録](tests/a2a-parent-controller.test.mjs) · [記録](docs/evidence/a2a-parent-controller-local-20261002.json) · [記録](docs/workstreams/02-sky-mcp.md) · [記録](docs/sim-led-product-architecture.md) · [記録](docs/evidence/a2a-deadline-sweep-local-20261002.json) · [記録](db/schema.ts) · [記録](drizzle/0057_a2a_parent_sequence.sql) · [記録](drizzle/meta/_journal.json) · [記録](docs/evidence/a2a-persisted-handoff-link-local-20261002.json) · [記録](docs/evidence/a2a-parent-plan-binding-local-20261002.json) · [記録](lib/workflow.ts) · [記録](lib/work-store.ts) · [記録](app/api/work-jobs/route.ts) · [記録](tests/workflow.test.mjs) · [記録](docs/evidence/a2a-runtime-recheck-20261002.json) |
| WEB04 | RockstarOS全体のvisual systemを統一し、主要フロントの機能性を改善 | 完了 | [記録](components/home-screen.tsx) · [記録](components/home-screen.module.css) · [記録](components/system-settings.module.css) · [記録](components/csv-business-workspace.module.css) · [記録](components/workspace-shell.tsx) · [記録](components/sky-surface.module.css) · [記録](components/sky-workspace.tsx) · [記録](components/sky-workspace.module.css) · [記録](components/sky-tool-card.tsx) · [記録](components/sky-tool-card.module.css) · [記録](components/sky-marketplace.tsx) · [記録](components/sky-marketplace.module.css) · [記録](components/sky-tool-workspace.tsx) · [記録](components/sky-tool-workspace.module.css) · [記録](components/fashion-brand-ops-runner.tsx) · [記録](components/fashion-brand-ops-runner.module.css) · [記録](components/sky-connection-center.tsx) · [記録](components/sky-connection-center.module.css) · [記録](components/sky-mcp-center.tsx) · [記録](components/sky-mcp-center.module.css) · [記録](components/sky-publisher-form.tsx) · [記録](components/sky-publisher-form.module.css) · [記録](lib/use-sky-tool-context.ts) · [記録](components/rock-studio.tsx) · [記録](components/coconala-team-workspace.tsx) · [記録](components/coconala-team-workspace.module.css) · [記録](app/workspace.css) · [記録](components/sky-chat-workspace.tsx) · [記録](tsconfig.json) · [記録](tests/web-route-style-contract.test.mjs) · [記録](docs/workstreams/01-product-ux.md) · [記録](docs/rockstaros-complete-design.md) · [記録](docs/frontend-usability-audit-20260915.md) · [記録](docs/product-baseline.md) · [記録](lib/sky-result-library.ts) · [記録](tests/sky-result-library.test.mjs) · [記録](app/sky/layout.tsx) · [記録](app/sky/manifest.webmanifest/route.ts) · [記録](lib/sky-app-manifest.ts) · [記録](tests/sky-app-manifest.test.mjs) · [記録](docs/sky.md) |
| B06 | ココナラ代表受注・制作担当者への個別発注と入出金を安全に管理 | 進行中 | [記録](docs/sky-tools-complete-design.md) · [記録](docs/workstreams/09-business-pilots.md) · [記録](app/sky/tools/[toolId]/page.tsx) · [記録](components/coconala-team-workspace.tsx) · [記録](app/api/coconala-team/route.ts) · [記録](lib/coconala-team.ts) · [記録](tests/coconala-team.test.mjs) · [記録](tests/coconala-sky-entry.test.mjs) |
| BIL02 | 有償自動化商品と販売・決済・払出しProvider sandboxを接続し、Earning Receiptから実送金まで受入 | 進行中 | [記録](docs/sky-billing.md) · [記録](docs/workstreams/03-wallet-billing-providers.md) · [記録](tests/billing-worker.test.mjs) · [記録](docs/evidence/launch/sky-billing-fee-hold-20260924.json) · [記録](lib/sky-commerce.ts) · [記録](lib/sky-commerce-store.ts) · [記録](lib/sky-stripe.ts) · [記録](components/sky-commerce.tsx) · [記録](drizzle/0018_sky_commerce.sql) · [記録](tests/sky-commerce.test.mjs) · [記録](tests/sky-stripe.test.mjs) · [記録](toolkits/esim-bootstrap/README.md) · [記録](toolkits/esim-bootstrap/core.mjs) · [記録](tests/esim-bootstrap.test.mjs) · [記録](lib/esimgo-webhook.ts) · [記録](app/api/esim/webhooks/esim-go/route.ts) · [記録](drizzle/0029_esim_profile_order_binding.sql) · [記録](tests/esimgo-webhook.test.mjs) · [記録](docs/provider-contract-readiness-20260930.md) · [記録](docs/evidence/esim-provider-idempotency-research-20261001.json) · [記録](lib/esimgo-provider.ts) · [記録](drizzle/0030_esim_provider_order_once.sql) · [記録](lib/esim-plan-catalog.ts) · [記録](lib/esim-public-catalog.ts) · [記録](app/api/esim/catalog/route.ts) · [記録](app/sky/esim/page.tsx) · [記録](components/esim-catalog.tsx) · [記録](components/sky-commerce.tsx) · [記録](components/sky-commerce.module.css) · [記録](tests/esim-public-catalog.test.mjs) · [記録](app/api/esim/orders/[orderId]/issue/route.ts) · [記録](app/api/esim/orders/[orderId]/status/route.ts) · [記録](app/api/esim/orders/[orderId]/reconcile/route.ts) · [記録](tests/esim-plan-catalog.test.mjs) · [記録](scripts/check-work-api.mjs) · [記録](lib/esim-install-material.ts) · [記録](app/api/esim/orders/[orderId]/install-material/route.ts) · [記録](components/esim-purchase-setup.tsx) · [記録](drizzle/0031_esim_install_material_delivery.sql) · [記録](tests/esim-install-material.test.mjs) · [記録](scripts/check-work-api.mjs) · [記録](drizzle/0032_esim_order_pricing_snapshot.sql) · [記録](lib/esim-reconciliation-worker.ts) · [記録](tests/esim-reconciliation-worker.test.mjs) · [記録](systems/rock-star-os/os/mcp_broker/broker.py) · [記録](systems/rock-star-os/tests/test_mcp_broker_core.py) · [記録](systems/rock-star-os/docs/MCP-BROKER.md) · [記録](systems/rock-star-os/src/blackberryrock/spend.py) · [記録](systems/rock-star-os/src/blackberryrock/wallet.py) · [記録](systems/rock-star-os/tests/test_spend_runtime.py) · [記録](systems/rock-star-os/tests/test_hub_server.py) · [記録](docs/value-spend-runtime.md) · [記録](scripts/check-sky-a2a-workflow.mjs) · [記録](tests/a2a-broker-authorization.test.mjs) · [記録](tests/a2a-client.test.mjs) · [記録](tests/a2a-delegation-store.test.mjs) · [記録](tests/a2a-usage-receipt.test.mjs) · [記録](services/sky-agent-runtime/vitest.config.ts) · [記録](services/sky-agent-runtime/test/a2a-workflow.positive.test.mjs) · [記録](docs/evidence/sky-a2a-workflow-local-20260930.json) · [記録](docs/workstreams/07-android-device-local-ai.md) · [記録](docs/evidence/esim-host-validation-20261001.json) · [記録](lib/esim-device-entitlement.ts) · [記録](lib/esim-device-entitlement-store.ts) · [記録](app/api/esim/orders/[orderId]/device-entitlement/route.ts) · [記録](android/core/src/main/java/dev/rock/core/platform/EsimDeviceEntitlement.java) · [記録](android/core/src/test/java/dev/rock/core/platform/EsimDeviceEntitlementTest.java) · [記録](android/core/src/test/resources/esim-device-entitlement-p256-vector.json) · [記録](docs/evidence/android-esim-gateway-contract-20261001.json) · [記録](drizzle/0035_esim_device_gateway_entitlements.sql) · [記録](tests/esim-device-entitlement.test.mjs) · [記録](components/esim-purchase-setup.tsx) · [記録](android/automation/build.gradle) · [記録](android/automation/src/main/java/dev/rock/automation/EsimDeviceGatewayKeyStore.java) · [記録](android/automation/src/androidTest/java/dev/rock/automation/EsimDeviceGatewayKeyStoreTest.java) · [記録](drizzle/0036_nostalgic_miek.sql) · [記録](app/api/sky/a2a-delegations/[id]/wallet-settlement/route.ts) · [記録](systems/rock-star-os/scripts/accept-cloud-wallet-handoff.py) · [記録](docs/evidence/a2a-cloud-python-wallet-handoff-20261001.json) · [記録](services/android-attestation-verifier/README.md) · [記録](services/android-attestation-verifier/UPSTREAM.json) · [記録](services/android-attestation-verifier/src/main/kotlin/dev/rock/attestation/AttestationVerification.kt) · [記録](services/android-attestation-verifier/src/main/kotlin/dev/rock/attestation/Main.kt) · [記録](services/android-attestation-verifier/src/test/kotlin/dev/rock/attestation/AttestationVerificationTest.kt) · [記録](docs/evidence/android-key-attestation-verifier-20261001.json) · [記録](lib/android-key-attestation-client.ts) · [記録](tests/android-key-attestation-client.test.mjs) · [記録](drizzle/0038_android_attested_gateway_keys.sql) · [記録](docs/evidence/android-key-attestation-verifier-20261001.json) · [記録](tests/esim-device-entitlement-store.test.mjs) · [記録](contracts/device-capability-snapshot.json) · [記録](android/core/src/main/java/dev/rock/core/platform/EsimProvisioningCompatibility.java) · [記録](android/core/src/test/java/dev/rock/core/platform/EsimProvisioningCompatibilityTest.java) · [記録](android/automation/src/main/java/dev/rock/automation/DeviceCapabilitySnapshot.java) · [記録](android/automation/src/androidTest/java/dev/rock/automation/DeviceCapabilitySnapshotTest.java) · [記録](android/shell/src/main/java/dev/rock/shell/MainActivity.java) · [記録](tests/sky-marketplace.test.mjs) · [記録](docs/sky-commerce-design.md) · [記録](docs/wallet-commerce-design.md) · [記録](docs/contracts/sky-commerce-v2.ts) · [記録](docs/contracts/sky-wallet-v2.ts) · [記録](docs/contracts/sky-commerce-v2.sql) · [記録](docs/evidence/sky-commerce-design-validation.json) · [記録](docs/design-validation/README.md) · [記録](docs/prompts/sky-commerce-wallet-development.md) · [記録](docs/evidence/sky-commerce-development-prompt-context.json) · [記録](docs/evidence/sky-commerce-main-integration-validation.json) · [記録](docs/evidence/sky-commerce-sql-main-validation.json) |
| G04 | 重複するAI・MCP・保存・決済・Sky/Zema契約を共通化し、19 PRをmainへ統合、SPIDERの検証を継続 | 進行中 | [記録](docs/git-consolidation.md) · [記録](docs/evidence/common-foundation-integration.json) · [記録](tests/sky-zema-contract.test.mjs) · [記録](tests/shared-stripe.test.mjs) · [記録](tests/mcp-client.test.mjs) · [記録](tests/owner-revision-json-store.test.mjs) · [記録](docs/evidence/pr-consolidation-20261005.json) · [記録](docs/research/rockstar-patent-research.html) · [記録](docs/research/rockstar-patent-sources.json) · [記録](scripts/spider-web-runtime.mjs) · [記録](tests/spider-web-runtime.test.mjs) · [記録](docs/amc-autonomy-fixture.md) · [記録](docs/evidence/amc-fixture-csv-main-integration.json) |
次の作業: Canonical offer is physical SIM/eSIM-led RockstarOS service access across purchase channels; carrier activation, service entitlement, account, OS/client install, cloud execution and AI billing remain distinct states. The local signed claim issuer and encrypted/idempotent seller delivery API are implemented; the Android Shell quote→device-credential Wallet hold→Broker proof→explicit Cloud approval→same-ID recovery source flow is wired and locally contract-tested. Current repository verification passes: Node 757/757, Worker/D1 API 1,048 assertions, CSV Worker/D1/R2 113 assertions, Fashion 19/19, typecheck, product lint, production build and release checks. Next run Android Core/AIDL/APK/instrumentation on an equipped CI/device host; then connect contracted seller checkout/delivery, carrier, Provider rates/meters/invoices and funded settlement. Production D1 readback is 0/6; local fixtures are not production billing, carrier activation, or successful exact-SKU OS installation.
````

### 2026-10-05 — merge `d7d7d765` で落ちた側 `c3701c45`（1行）

統合: Merge latest Sky integration into SPIDER state-read fix ／ 落ちた側の最後のcommit: merge: preserve current main fixture documentation and CSV fixes

````text
同時にmainへ入ったPR #67（`a3951f52`）のCSV修正とAMC利用手順を保持して取り込んだ。対象の状態readerには変更がなく、競合は進捗追記を両方残して解消した。旧版で差替え先の読取り・検査後の拡大を再現。新規6＋既存37＝43試験が合格、skipなし。独立source reviewでも退行なし。比較refは `refs/heads/codex/spider-autonomy-state-read`。修正前 `592daeea` のCodeQL run 37281429343は成功し、同refの#54はopen。push後の同じSHAのGitHub再検査と同refのalert結果をPRへ記録する。結果未取得を完了解消とせず、main merge・警告dismiss・検査緩和は行わない。
````

### 2026-10-05 — merge `c3701c45` で落ちた側 `ed62229e`（1行）

統合: merge: preserve current main fixture documentation and CSV fixes ／ 落ちた側の最後のcommit: fix(spider): bind AMC state reads to validated descriptors

````text
旧版で差替え先の読取り・検査後の拡大を再現。新規6＋既存37＝43試験が合格、skipなし。独立source reviewでも退行なし。比較refは `refs/heads/codex/spider-autonomy-state-read`。修正前 `592daeea` のCodeQL run 37281429343は成功し、同refの#54はopen。push後の同じSHAのGitHub再検査と同refのalert結果をPRへ記録する。結果未取得を完了解消とせず、main merge・警告dismiss・検査緩和は行わない。
````

### 2026-10-05 — merge `d8a765aa` で落ちた側 `01392496`（1行）

統合: Preserve upstream SPIDER integration alongside AMC and CSV fixes ／ 落ちた側の最後のcommit: Preserve main AMC integration and isolate fixture CSV validation

````text
| G04 | 重複するAI・MCP・保存・決済・Sky/Zema契約を共通化し、19 PRをmainへ統合、SPIDERの検証を継続 | 進行中 | [記録](docs/git-consolidation.md) · [記録](docs/evidence/common-foundation-integration.json) · [記録](tests/sky-zema-contract.test.mjs) · [記録](tests/shared-stripe.test.mjs) · [記録](tests/mcp-client.test.mjs) · [記録](tests/owner-revision-json-store.test.mjs) · [記録](docs/evidence/pr-consolidation-20261005.json) · [記録](docs/research/rockstar-patent-research.html) · [記録](docs/research/rockstar-patent-sources.json) · [記録](docs/amc-autonomy-fixture.md) · [記録](docs/evidence/amc-fixture-csv-main-integration.json) |
````

### 2026-10-05 — merge `d8a765aa` で落ちた側 `592daeea`（1行）

統合: Preserve upstream SPIDER integration alongside AMC and CSV fixes ／ 落ちた側の最後のcommit: Merge pull request #52: SPIDER security guard and repair cycle

````text
| G04 | 重複するAI・MCP・保存・決済・Sky/Zema契約を共通化し、19 PRをmainへ統合、SPIDERの検証を継続 | 進行中 | [記録](docs/git-consolidation.md) · [記録](docs/evidence/common-foundation-integration.json) · [記録](tests/sky-zema-contract.test.mjs) · [記録](tests/shared-stripe.test.mjs) · [記録](tests/mcp-client.test.mjs) · [記録](tests/owner-revision-json-store.test.mjs) · [記録](docs/evidence/pr-consolidation-20261005.json) · [記録](docs/research/rockstar-patent-research.html) · [記録](docs/research/rockstar-patent-sources.json) · [記録](scripts/spider-web-runtime.mjs) · [記録](tests/spider-web-runtime.test.mjs) |
````

### 2026-10-05 — merge `01392496` で落ちた側 `55685fdd`（1行）

統合: Preserve main AMC integration and isolate fixture CSV validation ／ 落ちた側の最後のcommit: Merge concurrent Wallet design updates without changing AMC execution

````text
| G04 | 重複するAI・MCP・保存・決済・Sky/Zema契約を共通化し、19 PRをmainへ統合、SPIDERの検証を継続 | 進行中 | [記録](docs/git-consolidation.md) · [記録](docs/evidence/common-foundation-integration.json) · [記録](tests/sky-zema-contract.test.mjs) · [記録](tests/shared-stripe.test.mjs) · [記録](tests/mcp-client.test.mjs) · [記録](tests/owner-revision-json-store.test.mjs) · [記録](docs/evidence/pr-consolidation-20261005.json) · [記録](docs/research/rockstar-patent-research.html) · [記録](docs/research/rockstar-patent-sources.json) · [記録](docs/amc-autonomy-fixture.md) · [記録](docs/evidence/amc-main-integration.json) |
````

### 2026-10-05 — merge `981f3a33` で落ちた側 `c6b9a467`（1行）

統合: Merge latest main while preserving AMC verification and research records ／ 落ちた側の最後のcommit: feat(amc): add bounded fixture execution and CSV contract fixes

````text
| G04 | 重複するAI・MCP・保存・決済・Sky/Zema契約を共通化し、19 PRをmainへ統合、SPIDERの検証を継続 | 進行中 | [記録](docs/git-consolidation.md) · [記録](docs/evidence/common-foundation-integration.json) · [記録](tests/sky-zema-contract.test.mjs) · [記録](tests/shared-stripe.test.mjs) · [記録](tests/mcp-client.test.mjs) · [記録](tests/owner-revision-json-store.test.mjs) · [記録](docs/evidence/pr-consolidation-20261005.json) · [記録](docs/amc-autonomy-fixture.md) · [記録](docs/evidence/amc-main-integration.json) |
````

### 2026-10-05 — merge `981f3a33` で落ちた側 `80a662cc`（1行）

統合: Merge latest main while preserving AMC verification and research records ／ 落ちた側の最後のcommit: docs: preserve RockstarOS patent research and source registry

````text
| G04 | 重複するAI・MCP・保存・決済・Sky/Zema契約を共通化し、19 PRをmainへ統合、SPIDERの検証を継続 | 進行中 | [記録](docs/git-consolidation.md) · [記録](docs/evidence/common-foundation-integration.json) · [記録](tests/sky-zema-contract.test.mjs) · [記録](tests/shared-stripe.test.mjs) · [記録](tests/mcp-client.test.mjs) · [記録](tests/owner-revision-json-store.test.mjs) · [記録](docs/evidence/pr-consolidation-20261005.json) · [記録](docs/research/rockstar-patent-research.html) · [記録](docs/research/rockstar-patent-sources.json) |
````

### 2026-10-05 — merge `3ca84dcc` で落ちた側 `a85a25e2`（1行）

統合: merge: reconcile SPIDER with service access foundation ／ 落ちた側の最後のcommit: fix(security): pin Undici to patched 7.29.1

````text
次の作業: SYS15第24cycleでUndiciを7.29.1へ統一し、TLS callback継承の旧3失敗／新3成功、license関連35試験成功を確認。既存PR56の一部更新と下位7.29.0残存を区別し、PR52の小さいoverrideとして検証する。同一SHAのclean npm ci・全体CI・個別alertを確認し、default branchの解消はmain統合後まで未確認。SYS15のofflineコード検査ファイルを配布し、今回のnative security.inspectCodeを同一SHAのLinux CIで確認する。生成物とsourceのhashを保存し、既存OS監視の受入とは分ける。SYS15のSecurity Agent役割・native表示・送信前拒否についてLinux source検証を保存し、同一SHAのCIと既存の受入gateへ接続する。アニメーション・役割追加・旧a7cfca3の証拠を分離し、表示先は現行security panelを維持する。RockstarOS本体のPlatform固定範囲監視とMCP／Runner送信前検査、native状態画面、boot監督を検証し、同一imageで起動・再起動・障害復旧・24時間運転を受け入れる。hostやWeb補助機能の成功をOS常駐受入へ換算しない。avocadoMiniはR5を基準に、1本自律・使用時200mm・全空間裸眼表示の方式と安全、精密3D入力、実部品収納を先に検証する（MAT15）。E3の4本＋別Hubを必須構成へ戻さない。Pixel/QEMU等の既存OS受入は独立して継続する。
````

### 2026-10-05 — merge `c9edd70f` で落ちた側 `15438f02`（1行）

統合: Merge product integrations preserving current service access contracts ／ 落ちた側の最後のcommit: fix: align integrated dependencies and license inventory with current main

````text
| G04 | 重複するAI・MCP・保存・決済・Sky/Zema契約と検証入口を共通化し、未統合PRの現行main互換を検証 | 進行中 | [記録](docs/git-consolidation.md) · [記録](docs/evidence/common-foundation-integration.json) · [記録](tests/sky-zema-contract.test.mjs) · [記録](tests/shared-stripe.test.mjs) · [記録](tests/mcp-client.test.mjs) · [記録](tests/owner-revision-json-store.test.mjs) |
````

### 2026-10-05 — merge `ea2728ec` で落ちた側 `8978ca44`（2行）

統合: Merge PR #25 advisory Decision Fabric and optional Jev provider ／ 落ちた側の最後のcommit: Return disabled reason before Jev cost admission

````text
| AI07 | Jev／TypeSafe・Local Qwen・Cloud LLM・deterministic codeをDecisionProviderとRouter／Harnessへ統合 | 進行中 | [記録](docs/prompts/jev-typesafe-local-qwen-handoff-20260918.md) · [記録](docs/jev-local-qwen-decision-fabric-design.md) · [記録](contracts/decision-provider.json) · [記録](data/decision-fabric-policy.json) · [記録](lib/decision/index.ts) · [記録](lib/decision/providers/mock.ts) · [記録](lib/decision/providers/typesafe-jev.ts) · [記録](tests/decision-provider.test.mjs) · [記録](tests/decision-integration.test.mjs) · [記録](scripts/jev-pixel-relay.mjs) · [記録](tests/jev-pixel-relay.test.mjs) · [記録](tests/android-jev-preview-boundary.test.mjs) · [記録](android/jev-preview/src/main/AndroidManifest.xml) · [記録](android/jev-preview/src/debug/AndroidManifest.xml) · [記録](android/jev-preview/src/debug/res/xml/pixel_jev_preview_network_security.xml) · [記録](android/jev-preview/src/debug/java/dev/rock/jevpreview/PixelJevPreviewDebug.java) · [記録](android/jev-preview/src/test/java/dev/rock/jevpreview/PixelJevPreviewProtocolTest.java) · [記録](android/jev-provider/build.gradle) · [記録](android/jev-provider/src/main/AndroidManifest.xml) · [記録](android/jev-provider/src/aosp/AndroidManifest.xml) · [記録](android/jev-provider/src/main/java/dev/rock/jev/provider/TypeSafeJevProvider.java) · [記録](android/jev-provider/src/test/java/dev/rock/jev/provider/TypeSafeJevProviderTest.java) · [記録](android/Android.bp) · [記録](android/settings.gradle) · [記録](os/physical/rockstaros.mk) · [記録](android/sepolicy/private/rockstar_platform.te) · [記録](android/sepolicy/private/seapp_contexts) · [記録](tests/android-jev-provider-boundary.test.mjs) · [記録](.github/workflows/android.yml) · [記録](docs/workstreams/07-android-device-local-ai.md) · [記録](docs/jev-ecosystem-integration-design.md) · [記録](docs/ai-native-os-architecture.md) |
次の作業: Jevは安全なruntime key provisioningが決まるまでdisabled／初回product除外を維持する。友人がAndroid SDK／Gradle環境でoptional providerのunit test・lint・Soong source buildを実行し、別途Pixel／OS full build／flashのgateは未合格のまま維持する。
````

### 2026-10-05 — merge `0924c590` で落ちた側 `29202ae6`（1行）

統合: merge: integrate PR 49 Campus with current owner auth and schema ／ 落ちた側の最後のcommit: Avoid hook-like Campus style identifier

````text
| CAMPUS01 | 大学別CampusレイヤーとしてPeople・Project・Opportunity・Event・Community・Portfolio・Resource、プロフィールマッチング、NFC/QR入口とsource別匿名集計、block/report/data削除をWeb runtimeへ実装 | 完了 | [記録](app/campus/page.tsx) · [記録](app/api/campus/route.ts) · [記録](app/t/[tagId]/route.ts) · [記録](components/campus-workspace.tsx) · [記録](components/campus-workspace.module.css) · [記録](lib/campus.ts) · [記録](lib/campus-store.ts) · [記録](db/schema.ts) · [記録](drizzle/0017_campus_layer.sql) · [記録](tests/campus.test.mjs) · [記録](docs/campus-layer.md) |
````

### 2026-10-05 — merge `64acc829` で落ちた側 `78638565`（1行）

統合: Merge PR #43 nonfinancial particle game sandbox ／ 落ちた側の最後のcommit: feat(game): GAME01 minimal 2D particle sandbox loop at host/fixture stage (GM01)

````text
| GM01 | AI06から切り出し: R5 §03 GAME01の最小操作（選択・保持中移動・放す・衝突／結合・分離・取消・時間停止・保存再開）を決定的2D粒子sandboxとしてhost／fixtureで実装し、不正save・版違いを拒否（非金融。R5空間表示・3D入力・実機・OS統合は対象外） | 進行中 | [記録](lib/game-sandbox.ts) · [記録](tests/game-sandbox.test.mjs) · [記録](tests/fixtures/game-sandbox-session.json) · [記録](docs/workstreams/08-game-market-fund.md) |
````

### 2026-10-05 — merge `be8718a4` で落ちた側 `af38db8f`（1行）

統合: Merge PR #46 single-executor capability host fixtures ／ 落ちた側の最後のcommit: feat(core): AI05 host/fixture capability negotiation, single executor device, persistent selection and snapshot restore

````text
| AI05 | Sky app／OSの能力宣言と単一実行端末固定を実装し、多端末移管は独立拡張として受入（AI09: host/fixture段階はOS10非依存で先行可、emulator/実機/OS統合段階はOS10依存のまま） | 進行中 | [記録](docs/ai-native-os-architecture.md) · [記録](docs/android-backup-recovery.md) · [記録](android/core/src/main/java/dev/rock/core/SkyExecutor.java) · [記録](android/core/src/test/java/dev/rock/core/SkyExecutorTest.java) · [記録](tests/sky-executor.test.mjs) · [記録](docs/workstreams/07-android-device-local-ai.md) · [記録](project.md) |
````

### 2026-10-05 — merge `868b50de` で落ちた側 `829bf229`（1行）

統合: Merge PR #45 bounded-memory host fixtures ／ 落ちた側の最後のcommit: fix(core): AI03 tombstones keep only a digest of the deleted memory ID

````text
| AI03 | モデル非依存の限定記憶・project分離・根拠・削除契約を実装し、projection更新を受入（AI09: host/fixture段階はOS10非依存で先行可、emulator/実機/OS統合段階はOS10依存のまま） | 進行中 | [記録](docs/ai-native-os-architecture.md) · [記録](docs/sky-assistant-and-memory.md) · [記録](android/core/src/main/java/dev/rock/core/BoundedMemory.java) · [記録](android/core/src/test/java/dev/rock/core/BoundedMemoryTest.java) · [記録](tests/bounded-memory.test.mjs) · [記録](docs/workstreams/07-android-device-local-ai.md) · [記録](project.md) |
````

### 2026-10-05 — merge `130c486b` で落ちた側 `504e43c6`（1行）

統合: Merge PR #44 external-write outbox host fixtures ／ 落ちた側の最後のcommit: fix(core): run the AI04 authority callback outside outbox transactions (PlatformStore rule)

````text
| AI04 | 1.0のpure Tool境界を維持し、外部作用のoperation key・結果不明照合・crash復旧を拡張実装（AI09: host/fixture段階はOS10非依存で先行可、emulator/実機/OS統合段階はOS10依存のまま） | 進行中 | [記録](docs/ai-native-os-architecture.md) · [記録](android/core/src/main/java/dev/rock/core/ExternalWriteOutbox.java) · [記録](android/core/src/test/java/dev/rock/core/ExternalWriteOutboxTest.java) · [記録](tests/external-write-outbox.test.mjs) · [記録](docs/workstreams/07-android-device-local-ai.md) · [記録](project.md) |
````

### 2026-10-05 — merge `01eb6db6` で落ちた側 `b37c52a6`（2行）

統合: Merge PR #42 as isolated model profile host fixtures ／ 落ちた側の最後のcommit: Merge remote-tracking branch 'origin/chore/ledger-sync-20260925' into feat/ai02-model-pinning-fixture

````text
| AI02 | モデルmanifest・仕事への版固定・互換更新を実装し、2候補交換／旧仕事再開を段階受入（AI09: host/fixture段階はOS10非依存で先行可、emulator/実機/OS統合段階はOS10依存のまま） | 進行中 | [記録](docs/ai-native-os-architecture.md) · [記録](android/core/src/main/java/dev/rock/core/ModelProfile.java) · [記録](android/core/src/main/java/dev/rock/core/ModelProfiles.java) · [記録](android/core/src/test/java/dev/rock/core/ModelProfilesTest.java) · [記録](android/core/src/test/resources/model-profiles-fixture.json) · [記録](tests/model-profile-fixture.test.mjs) · [記録](docs/workstreams/07-android-device-local-ai.md) · [記録](project.md) |
| AI09 | 本人決定（2026-09-25 01:26 ET、チャット指示）: Core offline仕事loopとGame最小loopの両方を、OS10完了前にhost／fixture段階で先行してよい。emulator・実機・OS統合の合格には転用しない。AI02〜AI05の依存注記に反映（AI06はGame側作業の担当範囲のため本記録では変更しない） | 完了 | [記録](data/project-status.json) · [記録](docs/workstreams/07-android-device-local-ai.md) · [記録](project.md) |
````

### 2026-10-05 — merge `6bf43c23` で落ちた側 `846f3950`（7行）

統合: Merge PR #41 preserving current SIM service policy and ledgers ／ 落ちた側の最後のcommit: docs(ledger): note /preorder/ change observed at main 9f09b6a (2026-09-25 01:54 ET) for MAT16 without changing Site or task status

````text
| WEB20 | 本人決定（2026-09-25 00:49 ET）により公開avocadoMini／avokadoProの構成と参考価格（¥160,000・¥410,000・From ¥880,000／US$5,800、税・送料別）をSite表記どおり正式として台帳へ反映し、Site表示・販売停止・実機0件・R5価格未確定を維持する | 完了 | [記録](data/product-baseline.json) · [記録](docs/product-baseline.md) · [記録](scripts/check-product-baseline.mjs) · [記録](tests/avocado-r5-docs.test.mjs) · [記録](docs/evidence/ledger-sync-20260925.json) · [記録](data/system-composition-audit.json) · [記録](docs/workstreams/05-web-pwa-sites.md) · [記録](project.md) |
| DOC05 | PR・task・配備記録なしでmainへ直接入った5コミット（9c1332e・8617863・4b49bf9・862ba30・851bb04）を証拠へ記録し、PR #39のSite試験verify組込みと網羅検査を取り込む | 完了 | [記録](docs/evidence/ledger-sync-20260925.json) · [記録](package.json) · [記録](tests/verify-coverage.test.mjs) · [記録](docs/workstreams/05-web-pwa-sites.md) · [記録](project.md) |
| MAT16 | R5とavocadoMini／avokadoPro製品ラインの関係（同一・後継・別系列、価格の扱い）を決め、R5要求とMAT15の範囲を見直す | 停止中: OWNER判断待ち（2026-09-25時点、開発側で決めない）。公開Siteと台帳はMini/Pro製品ラインを正式とした一方、R5価格は未確定・E3価格非継承のまま。2026-09-25 00:49 ET観測時点の/preorder/は旧¥160,000／¥410,000をR5へ引き継がないと表示していた。追記（01:54 ET観測）: main `9f09b6a`（2026-09-25 01:48 ET、Site変更のみの直接コミット）でこの表記は消え、/preorder/はMini/Proの参考価格（1台「From ¥160,000」、4台「¥410,000」、Pro「From ¥880,000」）と販売前（予約・決済なし）の表示になった。公開Siteも同内容を配信（01:54 ET取得）。R5への言及はなく、R5との関係は引き続き未決定。/preorder/「From ¥160,000」と/mini/「¥160,000」の表記揺れは本人判断待ち（Site表記、開発側でSiteを変更しない）。R5との関係が決まるまでMAT15の範囲とnextActionを変更しない。 | [記録](data/product-baseline.json) · [記録](docs/product-baseline.md) · [記録](docs/evidence/ledger-sync-20260925.json) |
| WEB21 | 外部製品名（PR #40のavokado mini改名案）を決め、Site・台帳・brand表記へ一括反映する | 停止中: OWNER判断待ち（2026-09-25時点、開発側で決めない）。PR #40は26ファイル競合で同一SHAのCIもない。名称が決まるまで現行表記avocadoMini／avokadoProを維持する。 | [記録](docs/product-baseline.md) · [記録](docs/evidence/ledger-sync-20260925.json) |
| BIL04 | 保留中の8.88 USD収益料金の後継条件を決め、RQ20期待値・AGENTS.md・check-product-baseline.mjs・monthlyFeeCapMinor・entitlement記述を整合させる | 停止中: OWNER判断待ち（2026-09-25時点、開発側で決めない）。収益動線確定まで料金は保留（BIL01）。旧888 cents記述はRQ20見出し、AGENTS.md、checker、monthlyFeeCapMinor、systems/rock-star-os/os/entitlement/README.mdに残る。期待値変更は本人決定後に行う。 | [記録](data/product-baseline.json) · [記録](AGENTS.md) · [記録](scripts/check-product-baseline.mjs) · [記録](systems/rock-star-os/os/entitlement/README.md) |
| ORG02 | 優先系列（milestone=Pixel full build準備、nextAction=MAT15、本人指示のA→B→C）を一本化し、AGENTS.md・project-status・workstreamへ反映する | 停止中: OWNER判断待ち（2026-09-25時点、開発側で決めない）。三つの記述が並存し、どれを最優先にするか本人の決定が必要。 | [記録](AGENTS.md) · [記録](docs/workstreams/README.md) · [記録](docs/evidence/ledger-sync-20260925.json) |
| AI09 | AI02〜AI06のfixture段階をOS10・AI03・AI05の完了前に先行してよいかを決め、依存関係を更新する | 停止中: OWNER判断待ち（2026-09-25時点、開発側で決めない）。現行の依存を変えずに記録だけ行う。 | [記録](data/project-status.json) · [記録](docs/workstreams/07-android-device-local-ai.md) |
````

### 2026-09-24 — merge `f243a66d` で落ちた側 `02d9f5d8`（5行）

統合: Merge main and align project guide with R5 ／ 落ちた側の最後のcommit: Audit project guide coverage and current product status

````text
主担当Git / CI / Operationsの`ROCK`として、製品・実装・配備単位の入口を[`PROJECTS.md`](PROJECTS.md)に集約した。avocadoMini、Rocket Star構想、RockstarOS、Webアプリ内のSky／Zema／Wallet／Market／Fund／CSV、Linux/QEMU、Android/Pixel、独立WorkerとToolのソース、設計、担当workstreamを対応付け、READMEと作業分野別案内から辿れるようにした。Rocket StarはavocadoMiniサイト内の専用構想ページであり、衛星通信や資金受付の完成と区別した。`public-release`は配布候補、`vendor/mr`は固定原本であることを明記した。既存ソースの移動や製品状態の変更はしていない。相対リンクの存在、`git diff --check`、`npm run project:check`、`repository:check`、`baseline:check`、`design:check`を確認した。`npm run verify`は型検査と製品lintまで通過したが、Node全体試験が出力を止めたため中断し、全体PASSとは記録しない。次は本PRのレビュー後に必要なCI結果を確認する。
追補: Sky内でRock側が作成・登録した標準Toolを一行にまとめていたため、`lib/catalog.ts`のready 12件（Rock側8、`Mr.`由来4）、candidate 22件（Rock構想1、`Mr.`由来11、第三者10）を個別に記載した。Linux/QEMU内蔵の開発用6 family・9版も別枠で示した。全Tool詳細設計にのみ載る研究・参考対象3件はcatalog登録と分けた。catalog上のready、外部Provider接続、native開発packageを混同しない。
追補: 利用者の「作成中のToolは全部チーム」という訂正に合わせ、個別Toolを一つのAI自動化チームの担当として示し、Skyが選びZemaが仕事を管理する関係をプロジェクト別ガイドへ追加した。catalog 34件とnative開発用6 family・9版の掲載漏れはなく、別途Androidの`article-tool`（既存Mr. Toolの端末実装）とnativeの`hello`作成例を明記した。Fashion Brand Opsの41 MCP操作は一つのpackageの内部操作として扱い、candidateや作成例を稼働中の担当へ数えない。`npm run sky:check`へcatalog・native ID・toolkitsのガイド掲載検査を追加し、今後の登録漏れも検出する。対象検査、型検査、製品lintは通過。`npm run verify`はNode全体試験の出力停止で中断し、全体PASSとは記録しない。
追補: 利用者から、CSV業務、メルカリ収益ループ、Material Invention Studioを「Web/OS内のサービス」としてSkyのチームから分離した分類への訂正があった。`PROJECTS.md`と製品関係図をSkyのチーム内の仕事として整理し直した。CSVとメルカリは既存のready catalog Toolから各専用画面へ進める。Material Inventionは複合機能で、Core sandboxはあるがSky接続と操作画面は未実装。旧ガイドの`app/studio/`は発明画面ではなくSky Tool SDK用Rock Studioだったため、誤った実装リンクを除いた。分類を戻さない検査を`sky:check`へ追加した。`sky:check`、`project:check`、`repository:check`、`design:check`、diff整合が合格。`npm run verify`は型検査と製品lintまで通過後、既存のNode全体試験が出力停止したため中断し、全体PASSとは記録しない。
最終網羅監査: Webのトップレベル画面、Sky catalog、native registry、Android Tool、6 Toolkit、2 Worker、製品Site、共有領域を`PROJECTS.md`と照合した。Work／ActivityはZemaへの転送、`/polymarket`は`/market`への転送、`/studio`はSky Tool作者用であることを明示し、Fashion Brand OpsとWeb共通画面・共有素材の入口も追加した。READMEの現行紹介に残っていたE2／伸縮塔とMaterial Inventionの操作画面が完成しているような表現を現行E3・sandbox段階へ修正した。一方、Web内`app/rockstaros/`の製品紹介には旧P0.2の外観と税込価格が残るため、現行E3製品Siteとの差をガイドに明示し、WEB06の未完了作業として保持する。旧画面を現行E3や最新版配備済みとは扱わない。Sky catalog 34件、native 6 family、6 Toolkit、2 Worker、製品SiteとWebの各画面がガイドへ分類され、変更した3文書のローカルリンク切れは0。`sky:check`、`project:check`、`repository:check`、`baseline:check`、`design:check`、diff整合は合格。`CI=true npm run verify`は型検査と製品lintを通過後、ローカルのNode全体試験が出力停止したため中断し、全体PASSとは記録しない。次は同一SHAのGitHub Actionsで全体検証を確認する。
````

### 2026-09-20 — merge `a3a24b8b` で落ちた側 `963027cf`（3行）

統合: merge: sync main with origin and keep Sky local LLM work ／ 落ちた側の最後のcommit: feat: expand Sky local model catalog and connections

````text
最終更新: 2026-09-20 / AIネイティブOS詳細設計・共通CoreとSky／Zema／Gameの接続 / 完了 78/117件
| AI07 | JevをSkyの明示的remote evaluatorとして接続し、SDK/API互換・同意・rubric・receipt・privacy・料金縮退を受入 | 進行中 | [記録](docs/llm-evaluation-architecture.md) · [記録](data/llm-capabilities.json) · [記録](scripts/check-llm-architecture.mjs) · [記録](lib/jev-evaluation.ts) · [記録](app/api/jev-evaluation/route.ts) · [記録](components/jev-evaluation-runner.tsx) · [記録](tests/jev-evaluation.test.mjs) |
次の作業: SKY20は旧Mr. Hub 11候補とJev周辺7候補の実行器、本人接続、料金・結果照合を一件ずつ受け入れ、通るまでreadyにしない。PC内SDK Appのカード表示・接続・停止はローカルSkyで確認済み。AI07はJevのprovider sandboxで正常系・429・5xx・不正response・budget縮退を受入し、AI_GATEWAY_API_KEY、Terms/Privacy、料金上限を確認する。JevはSkyのcatalog／同意UI／closed rubric／Evaluation Receiptまで実装済みだが、本番provider接続は未完了。法務受付・特許アシスタントはSkyの別Toolとして維持し、AI02〜AI06、full build入力・署名・物理全損復元の未完了gateも独立して維持する。
````

### 2026-09-19 — merge `77c2e2ad` で落ちた側 `dd722ef0`（3行）

統合: Merge RockstarOS product updates into main ／ 落ちた側の最後のcommit: docs: define Jev evaluation architecture

````text
最終更新: 2026-09-19 / AIネイティブOS詳細設計・共通CoreとSky／Zema／Gameの接続 / 完了 78/116件
| AI07 | JevをSkyの明示的remote evaluatorとして接続し、SDK/API互換・同意・rubric・receipt・privacy・料金縮退を受入 | 進行中 | [記録](docs/llm-evaluation-architecture.md) · [記録](data/llm-capabilities.json) · [記録](scripts/check-llm-architecture.mjs) |
次の作業: AI07はJevをSkyの明示的remote evaluatorとして実装する前に、AI SDK更新または公式HTTP APIを選び、Node/Cloudflare互換、privacy、料金上限、失敗縮退のfixtureを通す。route・同意UI・allowlist rubric・Evaluation Receiptが揃うまでcatalog readyにしない。SKY17の成功報酬条件確認、AI02〜AI06、full build入力・署名・物理全損復元の未完了gateも独立して維持する。
````

### 2026-09-19 — merge `77c2e2ad` で落ちた側 `771770d0`（1行）

統合: Merge RockstarOS product updates into main ／ 落ちた側の最後のcommit: docs: publish RockstarOS product map and avocadoMini design

````text
次の作業: Scalewayの課金確認後、Ubuntu 24.04 / 32 dedicated vCPU / 64 GB RAM / 600 GBで固定sourceをsyncし、Operator Agentを明示除外したbringup modeでtarget-files-packageとotatools-packageをbuildする。RELEASE_FLASH gate、production signing、実機flashは未合格のまま維持する。
````

### 2026-09-16 — merge `81e6c88c` で落ちた側 `49454c55`（7行）

統合: merge: integrate remote launch gates safely ／ 落ちた側の最後のcommit: Merge pull request #24 from k999ln/codex/complete-lch06-20260915

````text
## 2026-09-15 — PR #1〜#23と旧branchをmainへ収束
GitHub正本`k999ln/rock`のPR #1〜#23を現行mainの実装と再照合した。13件はmainへ統合済み、10件は同一または後継実装がmainにあり、旧文書・旧画面・競合branchをそのまま統合すると後退するため理由を記録して閉じた。open PRは0件である。
統合済みPR branch、閉じたPR branch、PRを持たない旧作業branchと一時archive branchも確認し、GitHub remoteを`main`だけへ収束した。merge後のbranch自動削除を有効化し、以後は最新main起点の一task・一branch・一PRで進める。版表示は`data/version-boundaries.json`の製品、Web、native、QEMU、Android境界を維持し、配布候補だけをexact source commitへ固定する。
最新mainの全体CIと署名検査は成功している。これはGitHub sourceの整合であり、本人限定Sitesのowner workspace access、本番D1 readback、一般公開、QEMU正式署名、Android実機、本番金融の完了ではない。別ローカル履歴のうち、mainへ既に統合されたPixel 10／Zema変更と、確定要望を増やす未採用の名称・緊急access変更はGitHub正本へ混ぜていない。
最終更新: 2026-09-15 / OS Platform Core v1の登録・承認・Wallet・更新境界 / 完了 74/103件
| OS10 | Tool／MCP／Provider共通API、本人承認、Wallet台帳、暗号化backup、署名更新gateのsourceを実装 | 進行中 | [記録](docs/platform-core.md) · [記録](docs/os-prototype.md) · [記録](contracts/platform-api.json) · [記録](android/core/src/main/java/dev/rock/core/platform/PlatformStore.java) · [記録](android/tool-sdk/src/main/aidl/dev/rock/sdk/IPlatformApi.aidl) · [記録](android/automation/src/main/java/dev/rock/automation/AndroidOwner.java) · [記録](android/automation/src/main/java/dev/rock/automation/RockPlatformService.java) · [記録](android/sepolicy/private/rockstar_platform.te) |
次の作業: 最短ローンチ経路はWEB01。GitHub mainは全体検証済みだが、本人限定Sitesは接続中のアカウントが所有workspaceと一致せず、ブラウザがAccess Denied、Sites APIがproject_not_foundを返すため配備とD1 readbackを停止中。所有workspaceへ接続後、検証済みの最新mainを配備して主要導線・API・security header・migrationをreadbackする。待機中も一般公開、QEMU配布、Android実機、本番金融の別gateを混同せず進める。
````

### 2026-09-15 — merge `acd7ab09` で落ちた側 `fc28d927`（2行）

統合: merge: preserve Sites work and unify RockstarOS UI ／ 落ちた側の最後のcommit: docs(csv): record production deployment evidence

````text
最終更新: 2026-09-15 / Rock StudioのSky SDK導線を維持し、CSV整形の決定的変換・独立検査・私有成果物・料金境界を同じSites本番系統へ統合 / 完了 65/91件
次の作業: CSVの独立queueを配置して実スマホ閉鎖後の完了を受入し、真正な第三者1件の販売・入金・納品をProvider証拠で検証する。
````

### 2026-09-15 — merge `d4bd901d` で落ちた側 `7eeed76d`（1行）

統合: merge: integrate latest Sky Studio with CSV workflow ／ 落ちた側の最後のcommit: feat(csv): add paid cleanup workflow

````text
最終更新: 2026-09-14 / CSV整形を最初の販売仕事として、決定的変換・独立検査・私有成果物・スマホ受付・料金境界を既存Sites本番系統へ統合 / 完了 64/90件
````

### 2026-09-15 — merge `d4bd901d` で落ちた側 `89dfdaf9`（1行）

統合: merge: integrate latest Sky Studio with CSV workflow ／ 落ちた側の最後のcommit: feat: make Sky Studio SDK-first

````text
最終更新: 2026-09-15 / Rock Studioを既存ツールへSky SDKコードを付ける導線へ統合 / 完了 65/90件
````

### 2026-09-15 — merge `f2dcee42` で落ちた側 `9b0f5cc4`（7行）

統合: Merge remote-tracking branch 'refs/remotes/sites/main' into codex/os-backend-launch-integrated-20260912 ／ 落ちた側の最後のcommit: feat: add chat-based Sky tool studio

````text
Instagramのプロフィール画面から公開表示と画像SHA-256だけを未確認候補へ取り込み、Meta OAuth readbackが一致した候補だけを運用対象にできる導線を統合した。画像本体、path、password、Cookie、raw OAuth tokenは運用DBへ保存しない。公開、広告、DM送信、請求、返金の個別承認も維持する。[安全境界と手順](docs/instagram-photo-onboarding-20260912.md)。
最新launch-candidateの改善版Sky／Fashion専用ワンタップ接続と、汎用MCP Connector／検証済み収益後の精算核を専用branchへ統合した。現行本人限定SitesをFashion Connectorのexact Originへ追加し、Meta署名済みDMを別brandへ付け替えられない照合、IPv6 link-local／multicastの遠隔MCP遮断、両Connector ZIPの決定的整合検査を追加した。
`npm audit --omit=dev`は既知脆弱性0件。`npm run verify`はWeb 122 tests、Fashion Brand Ops 17 tests、仕事API 143 assertions、型・lint、D1履歴移行、精算Worker dry-run、両MCP配布物、本番buildに合格した。実Meta／Stripe／Higgsfield、精算Worker本番、実送金、実機OSはcredential・口座・sandbox受入がないためfail-closedのままローンチ範囲外とする。[起動・復旧・範囲](docs/backend-launch-20260912.md)。
最終更新: 2026-09-15 / Rock Studioをコード貼付・ファイル添付だけのSky Tool作成チャットへ統合 / 完了 37/61件
| SKY08 | 既存の自動化関数をSky商品へ変える組込みSDK・標準雛形・PC登録・宣言公開・匿名利用集計を実装 | 完了 | [記録](docs/sky-tool-sdk.md) · [記録](toolkits/sky-tool-sdk/README.md) · [記録](toolkits/sky-tool-sdk/src/index.mjs) · [記録](toolkits/sky-tool-sdk/bin/create-sky-tool.mjs) · [記録](app/studio/page.tsx) · [記録](components/rock-studio.tsx) · [記録](lib/sky-tool-package.ts) · [記録](lib/sky-developer-auth.ts) · [記録](lib/sky-tool-events.ts) · [記録](drizzle/0006_sticky_beast.sql) · [記録](tests/sky-tool-sdk.test.mjs) · [記録](tests/sky-tool-package.test.mjs) |
| FB07 | 世界観と商品だけで市場・投稿・接客・受注導線を作るProducerモードを追加 | 完了 | [記録](lib/fashion-quick-plan.ts) · [記録](components/fashion-brand-ops-runner.tsx) · [記録](toolkits/fashion-brand-ops/src/service.mjs) · [記録](toolkits/fashion-brand-ops/src/tools.mjs) · [記録](toolkits/fashion-brand-ops/db/migrations/005_producer_runs.sql) · [記録](toolkits/fashion-brand-ops/test/service.test.mjs) · [記録](tests/fashion-quick-plan.test.mjs) |
次の作業: 一般公開前にTool Sandbox、作者署名、審査操作、失効配信、公開remote MCP/OAuthの受入を実装する。
````

### 2026-09-14 — merge `c9dbe591` で落ちた側 `3006715d`（2行）

統合: merge: integrate Sites history for wallet release ／ 落ちた側の最後のcommit: feat: launch generic paper market and autonomous funds

````text
最終更新: 2026-09-13 / 汎用PAPER市場のValue/Spendフローと、検証済み実績を30秒ごとに再計算する自律型ファンドを本人限定Webへ統合 / 完了 58/82件
次の作業: 全体verify後に同一commitをGitHubと本人限定Sitesへ反映し、/marketと/fundの保存・再計算フローを実環境で確認する。
````

### 2026-09-13 — merge `95ca598e` で落ちた側 `dd94b57e`（4行）

統合: Merge verified Sites market and fund workspaces ／ 落ちた側の最後のcommit: feat(wallet): connect the Rockstar revenue flow

````text
最終更新: 2026-09-13 / 本番側の公開gate・永続Walletと、動的自動化ファンド・Markets・固定commit bot sandboxを統合 / 完了 52/77件
| FND02 | ファンド・ツール別の検証済み収益を集計し、全ファンド合算の月最大8.88 USDと利用者帰属額を実Providerで精算 | 進行中 | [記録](services/sky-billing/migrations/0003_automation_funds.sql) · [記録](services/sky-billing/src/domain.ts) · [記録](services/sky-billing/src/worker.ts) · [記録](tests/billing-worker.test.mjs) · [記録](docs/product-baseline.md) |
| MKT02 | 外部Polymarket botを固定commit・clean treeのoffline backtest sandboxとして統合 | 完了 | [記録](lib/polymarket-bot-adapter.ts) · [記録](app/api/markets/bot/assess/route.ts) · [記録](toolkits/polymarket-bot-sandbox/run-backtest.mjs) · [記録](components/polymarket-workspace.tsx) · [記録](tests/polymarket-bot-adapter.test.mjs) · [記録](docs/polymarket-bot-sandbox-20260913.md) |
次の作業: 本人限定Web/PWAへ統合版を反映する。botの実注文は無効のまま十分な期間のbacktestを行い、実収益Providerは契約済みsandboxで約定・清算・手数料・取消・返金を照合する。QEMU配布は所有者の製品licenseと正式鍵の保管先が決まるまでblockedを維持する。
````

### 2026-09-13 — merge `38467af4` で落ちた側 `eebe680f`（1行）

統合: merge: unify production release and revenue fund work ／ 落ちた側の最後のcommit: fix(markets): harden bot backtest sandbox

````text
次の作業: botの実注文は無効のまま、十分な期間のorderbook JSONLでbacktestを実行し、report検証UIを通す。実収益Providerは別途選定し、契約済みsandboxで約定・清算・手数料・取消・返金を照合する。
````

### 2026-09-13 — merge `38467af4` で落ちた側 `98a1c34f`（2行）

統合: merge: unify production release and revenue fund work ／ 落ちた側の最後のcommit: feat(wallet): add persistent account ledger

````text
最終更新: 2026-09-13 / QEMU rc2の6/10公開gateに加え、Android実機5gateとマイナンバー7gateを端末・build・規制単位で機械監査 / 完了 47/70件
次の作業: 所有者が製品licenseと正式鍵の保管先を明示した後、license・production署名を同一最終archiveへ結合しfresh導入・更新・復旧を再受入する。
````

### 2026-09-13 — merge `57020640` で落ちた側 `4f5cfed5`（1行）

統合: Merge durable Chat and Wallet workspaces ／ 落ちた側の最後のcommit: feat(wallet): add durable income and expense workspace

````text
最終更新: 2026-09-13 / Walletの情報設計と収益後精算フロントをDeveloper Previewへ実装 / 完了 43/66件
````

### 2026-09-12 — merge `654b1e09` で落ちた側 `58f1aa56`（1行）

統合: Merge remote-tracking branch 'sites/main' into codex/mercari-revenue-loop-20260912 ／ 落ちた側の最後のcommit: feat: add Mercari revenue starter

````text
最終更新: 2026-09-12 / OS lifecycle、Sky MCP、メルカリ収益スターター、収益後精算Worker、ホーム・設定UIを本人限定Developer Previewへ統合 / 完了 41/64件
````

### 2026-09-12 — merge `654b1e09` で落ちた側 `1108ebff`（1行）

統合: Merge remote-tracking branch 'sites/main' into codex/mercari-revenue-loop-20260912 ／ 落ちた側の最後のcommit: feat(settings): add OS diagnostics and encrypted recovery

````text
最終更新: 2026-09-12 / OS Hub lifecycle、Sky MCP、収益後精算Worker、ホーム・設定・端末保全UIを本人限定Developer Previewへ統合・公開 / 完了 41/64件
````

### 2026-09-12 — merge `ae9d30e7` で落ちた側 `87c01eb3`（1行）

統合: Merge commit '0cc5415e4724199505e1f54942918b72eb88ccae' into codex/os-backend-sites-launch-20260912 ／ 落ちた側の最後のcommit: feat(sky): add one-click fashion MCP connection

````text
自動化Hub（Sky）のready商品としてRockstar Ledgerを追加し、同じPCで動くSQLite台帳の月額、要対応、更新日、契約一覧を読み取り専用で表示する画面を実装した。配布ZIP、MIT全文、Codex skill、stdio MCPを同じGitへ収録し、個人の契約・明細DBは収録しない。Skyからのブラウザ接続元はloopback HTTPだけに限定した。
````

### 2026-09-12 — merge `ae9d30e7` で落ちた側 `0cc5415e`（3行）

統合: Merge commit '0cc5415e4724199505e1f54942918b72eb88ccae' into codex/os-backend-sites-launch-20260912 ／ 落ちた側の最後のcommit: Merge pull request #13 from k999ln/codex/sky-one-click-fashion-mcp-20260912

````text
初回準備用の決定的ZIPとmacOS起動ファイルを追加した。接続はexact originとloopback Hostの両方を検査し、random tokenを12時間以内に限定する。Meta OAuth、実投稿、広告、DM送信、請求、返金は既存の個別承認gateが揃うまで実行しない。
| SKY05 | Skyの商品カード1回でFashion Brand Ops MCPを初期化し、38操作と接続状態を同期 | 完了 | [記録](lib/fashion-mcp-client.ts) · [記録](components/fashion-brand-ops-runner.tsx) · [記録](toolkits/fashion-brand-ops/src/http.mjs) · [記録](toolkits/fashion-brand-ops/test/browser-connect.test.mjs) · [記録](tests/fashion-mcp-client.test.mjs) · [記録](public/toolkits/fashion-brand-ops-connector.zip) |
次の作業: Meta OAuthのApp ID/secret、Professional account、公開Webhook URLを接続し、read-only discoveryから本人承認付き限定テスト投稿へ進む。Sites再配信は正しい所有ワークスペース接続後に行う。
````

### 2026-09-12 — merge `c7c284a2` で落ちた側 `d4456986`（2行）

統合: merge: prepare Sky backend launch candidate ／ 落ちた側の最後のcommit: feat(sky): finalize MCP onboarding and settlement

````text
最終更新: 2026-09-12 / Sky内MCP導入を検証しつつ、先払いを廃止して検証済み自動化収益からの月最大888 cents精算核を実装 / 完了 32/56件
次の作業: 有償需要のある自動化商品を1件選び、販売・決済・払出しProvider sandboxをExecution Receiptと接続して、実入金なしのfixtureではなくProvider検証済みEarning Receiptの縦断受入を行う。
````

### 2026-09-12 — merge `a87e08b8` で落ちた側 `0a14254d`（1行）

統合: Merge latest Sky Sites source ／ 落ちた側の最後のcommit: Improve Sky MCP onboarding and compatibility

````text
次の作業: 第三者MCPの実OAuth、長時間job、取消・失効をプロバイダーごとに相互運用試験する。Android/AOSP側のfull build・製品移植・production署名・実機受入は引き続き未完了。
````

### 2026-09-12 — merge `60654268` で落ちた側 `dcb35ada`（2行）

統合: feat(sky): integrate brand operations into role feed ／ 落ちた側の最後のcommit: feat(sky): prepare improved chrome for brand ops

````text
最終更新: 2026-09-12 / 改善版SkyへFashion Brand Opsを統合し、スマホDialogの配置修正を検証中 / 完了 27/50件
次の作業: 改善版SkyでInstagram運用商品とスマホDialogを画面確認し、全体検証後にGitHubへ保存する。実Provider接続とSites再配信は別gateとして保持する。
````

### 2026-09-12 — merge `60654268` で落ちた側 `bb52f159`（9行）

統合: feat(sky): integrate brand operations into role feed ／ 落ちた側の最後のcommit: fix: preserve Sky mobile offset in production CSS

````text
スマホ幅ではDialogを下端固定へ変更していたが、共通Dialogの中央配置用`translate`が残り、画面幅の半分だけ左へずれていた。スマホ用Sky DialogでTailwindのX/Y移動量を0へ上書きし、公開用CSSの最適化後にも指定が残ること、横幅413pxで左端0・右端413pxに収まることを実画面計測で確認した。
重複していたSky見出しを撤去し、最初に自然文で依頼できる欄、スクロール中も残る絞り込み・検索・掲載操作、各投稿の一つの実行ボタンへ整理した。文章で依頼した場合は会話内で担当を示してから「ツールを開く」へ進み、役割ボタンとTimelineからの1タップ起動は維持する。スマホの実行Dialogは下から開く全面シートに変更し、閉じる・入力・実行を片手で追いやすくする。
Sky本体の上下に残っていた白い共通ヘッドとフッター、および白いツール詳細・実行Dialogを、Skyと同じ黒背景・細いグレー境界へ統一した。他ページの共通表示は変更せず、Sky表示時とSkyから開いたDialogだけに適用する。
利用者評価を受け、演出中心だったSky画面からLIVE見出し、待機表示、処理フロー、説明ラベル、条件チップ、右側の掲載・接続パネルを撤去した。残したものは依頼欄、4つの役、検索、ツール投稿、実行ボタンだけ。黒地と細い区切り線を基調に、動きは投稿の短い表示とタイムライン上の低速な光だけに限定した。
文章送信から担当ツールを開く1操作、役ボタンから開く1操作、候補と利用可能ツールの区別、PC初回接続、安全確認用の詳細Dialogは維持した。スマホ幅の実画面で先頭表示と案件判断役の起動を確認した。
白い一覧型のSkyを、依頼から担当選択、ツール起動までが一本の流れとして読める濃紺のライブタイムラインへ変更した。光が流れる縦軸、接続状態の脈動、カードの段階表示、担当決定時の応答アニメーションを追加し、ブラウザ実行の1タップ導線とPC初回接続の安全境界は維持する。
別作業コピーの`codex/sky-legal-intake-20260912`／`4169697`に、日本語法律相談受付、公開連絡先33件、ブラウザRunner、7テストが存在し合格することを確認した。現在のSky branchには未統合であり、表示・利用可能件数へ加算しない。
最終更新: 2026-09-12 / SkyをToB掲載とToCタイムライン取得・MCP接続の両面へ拡張 / 完了 26/48件
| SKY06 | スマホ幅でSky実行Dialogが左へずれる回帰を修正 | 完了 | [記録](app/workspace.css) · [記録](project.md) |
````

### 2026-09-12 — merge `280b895e` で落ちた側 `cdc3bd7f`（1行）

統合: Merge current Sky site and patent assistant ／ 落ちた側の最後のcommit: Add Sky patent filing assistant

````text
次の作業: Sky Agent Hubに特許出願アシスタントを追加し、発明整理、公開状況警告、公式情報に限定した先行技術候補調査、明細書・請求項・要約・提出チェックのドラフト保存を実装した。発明内容は保存せず、AI送信は明示同意後だけ、電子署名・支払・特許庁提出は人の最終確認に残す。次は本人限定Sitesへ同一sourceを配信し、実環境でAI秘密設定と一連の画面動線を確認する。Android/AOSP側のfull build・Hub/Wallet/Game移植・production署名・実機受入は引き続き未完了。
````

### 2026-09-12 — merge `280b895e` で落ちた側 `f057abcf`（1行）

統合: Merge current Sky site and patent assistant ／ 落ちた側の最後のcommit: fix: keep Sky dialogs inside mobile viewport

````text
次の作業: SkyのToB掲載申請とToC Timelineを基礎に、隔離preflight、MCP 2025-11-25 initialize・capability negotiation・tools/list、OAuth、公式／private Registry取込、審査画面、公開revision、接続同意、実行receiptまでをprivate開発環境で縦断実装する。出願候補の詳細は公開repoへpushせず、発明者・先行技術・claim方針を専門家と確認する。cloud課金、実機flash、production署名、一般公開、main merge、Sites再deploy、特許出願は未承認・未実施。
````

### 2026-09-12 — merge `cdc3bd7f` で落ちた側 `9616af9b`（2行）

統合: Add Sky patent filing assistant ／ 落ちた側の最後のcommit: Improve Sky legal intake flow

````text
最終更新: 2026-09-12 / Sky法律相談の3ステップUX改善 / 完了 19/41件
次の作業: 日本語法律相談受付を安全確認、相談内容、回答・引継ぎの3ステップへ整理し、スマートフォン向けの操作サイズ、戻る・修正動線、弁護士候補の折りたたみを実装した。次は本人限定Sitesへ同一sourceを配信し、実環境で3ステップ動線と法令AIの秘密設定を確認する。サブスク顧問はNative Sky MCP brokerへの常駐接続とWalletへの費用転記、HTTPS配信版の安全な接続経路が未完了。Android/AOSP側は実機型番/SKU確認、全source取得・build・製品移植・production署名・実機受入が引き続き未完了。
````

### 2026-09-12 — merge `cdc3bd7f` で落ちた側 `dc62ef9a`（1行）

統合: Add Sky patent filing assistant ／ 落ちた側の最後のcommit: Track complete subscription coverage in Sky

````text
次の作業: Skyのサブスク顧問をローカルPC台帳へ読み取り専用で接続し、全網羅・過去契約・月額・要対応・更新を会話で回答するところまで検証した。Apple、Google Play、カード、銀行、PayPal、請求メールの確認状況と期間を追跡し、未確認または更新日不足が残る間は完了と判定しない。現在は6情報源とも未確認、明細0件、更新日3件不足。次は本人が利用する情報源の履歴をローカル取込・照合し、Native Sky MCP brokerを共通policy gatewayにする。HTTPS配信版からloopbackへ直接接続しない経路、Android/AOSPのfull build・Hub/Wallet/Game移植・production署名・実機受入は引き続き未完了。
````

### 2026-09-12 — merge `75342d4c` で落ちた側 `d1d50af9`（1行）

統合: merge: align fashion brand ops with latest Sky tools ／ 落ちた側の最後のcommit: merge: install fashion brand ops into Sky

````text
次の作業: FB01のSky catalog/Timeline、MCP 28 tools、Provider/approval/DB/Webhook境界、mock縦断、総合verifyを完了する。実Higgsfield/Meta/Stripe/通知credential、本番投稿・広告・請求・返金、native Skyの汎用JSON MCP画面、QEMU/Android/実機OS組込みは明示承認と契約を要する別gateとして保持する。その後はSky掲載審査とprivate Registry縦断、実機の正確な型番/SKU確定、全source取得・vendor生成・Soong full build、Sky/Wallet/GameのAndroid移植、本人限定Sites QA、license/production署名、正式配布受入へ進む。
````

### 2026-09-12 — merge `75342d4c` で落ちた側 `19603b1e`（1行）

統合: merge: align fashion brand ops with latest Sky tools ／ 落ちた側の最後のcommit: Add Rockstar Ledger to Sky automation hub

````text
次の作業: Skyのサブスク顧問をローカルPC台帳へ読み取り専用で接続し、配布ZIP・MIT・MCP・安全境界を同じGitへ収録した。次はNative Sky MCP brokerへの常駐接続とWalletへの費用転記を設計し、HTTPS配信版でloopbackへ直接接続しない経路を実装する。Android/AOSP側は実機型番/SKUの読取り専用確認、クラウド計画の承認、全source取得・vendor生成・Soongフルbuild・Hub/Wallet/Game移植、production署名、実機受入が引き続き未完了。
````

### 2026-09-12 — merge `d1d50af9` で落ちた側 `a0ff2f3d`（1行）

統合: merge: install fashion brand ops into Sky ／ 落ちた側の最後のcommit: feat(hub): add fashion brand operations MCP

````text
次の作業: FB01のHub catalog、MCP 28 tools、Provider/approval/DB/Webhook境界、mock縦断、総合verifyは完了。実Higgsfield/Meta/Stripe/通知credential、本番投稿・広告・請求・返金、QEMU/Android/実機OS組込みは明示承認と契約を要する別gateとして保持する。その後は従来どおり実機の正確な型番/SKU確定、全source取得・vendor生成・Soong full build、Hub/Wallet/GameのAndroid移植、本人限定Sites QA、license/production署名、正式配布受入へ進む。
````

### 2026-09-12 — merge `d1d50af9` で落ちた側 `bf85af69`（1行）

統合: merge: install fashion brand ops into Sky ／ 落ちた側の最後のcommit: feat: introduce Sky timeline and tool publishing

````text
最終更新: 2026-09-12 / SkyをToB掲載とToCタイムライン取得・MCP接続の両面へ拡張 / 完了 23/45件
````

### 2026-09-10 — merge `bfc4ae32` で落ちた側 `d713e504`（1行）

統合: feat: integrate Sites history into the RockstarOS workspace ／ 落ちた側の最後のcommit: feat(web): make automation Hub the primary workspace

````text
利用者の実行プロンプトとフロント改善指示を受領。GitHubを再取得しmain `7cdbb5fedc86ee3978ed329d9312147d137c9199`、再開branch `codex/rockstaros-release-20260910` の `29e4f7203f72d9949e2dfc90b64c4215d4bbb765` から分離worktreeで着手。Hubを標準入口へ変更し、既存Web商品・仕事API・旧ファンド保存を再利用する。LCH01〜07は[ローンチ準備記録](docs/launch-readiness-20260910.md)で追跡。元9ab image/host toolsと過去受入は保持。一般公開とmain mergeはまだ行わない。
````

### 2026-09-09 — merge `797c663d` で落ちた側 `fcedcfec`（4行）

統合: Integrate approved Hub Wallet OS design with native baseline ／ 落ちた側の最後のcommit: Record passing native integration checks

````text
## 9月5日時点の方針とAndroid P1の履歴
以下のAOSP/Pixelの選択・OS01〜06の判定は当時のAndroidトラックを指す。現在のnative OSの進捗は別IDで追跡し、過去の未実施ゲートをQEMUの成功で埋めない。
次の作業: nativeの取り込み検証と起動応答WIPの試験を進める。BlackBerryの型番・BSP・復旧条件を確定し、実機だけのHubを検証する。AOSP/Pixelと実金融・実USBは別ゲートのまま保持する。
今後は [現行の統合方針](docs/native-os-integration.md#4-継続する順番)に従い、native基盤の再検証、BlackBerry適合、端末だけのHub、外部接続の順に進めます。AOSPのG0→Cuttlefish→Pixel経路は補助トラックとして未実施状態を維持します。Wallet sandboxはOS開発の要件に含めますが、実資金の提供条件とは区別します。旧 [初期仕様](docs/product.md) は事業の根拠として保持します。
````

### 2026-09-09 — merge `797c663d` で落ちた側 `27b34adc`（3行）

統合: Integrate approved Hub Wallet OS design with native baseline ／ 落ちた側の最後のcommit: docs: align OS and game wallet plan with implementation evidence

````text
利用者の「プロンプトを作成して、そのあとは設計書を出して確認させて、確認したらプロンプトを進める」に従い、[設計書v1.1](docs/os-hub-wallet-game-design.md) とプロンプトの提示までで停止する。以下の実装順は承認後のみ。任意のGame入口と軽い達成演出は提案/選択項目であり、勝手に確定・実装しない。承認対象版・範囲・日時を記録してから再開する。今回runtime/SDK/新OS imageは未変更。
最終更新: 2026-09-09 / 実装との差を訂正した設計v1.1・プロンプトの確認待ち（既存native試作あり、新指示のruntime作業は未着手） / 完了 12/27件
次の作業: 設計v1.1と相違監査を提示し明示承認を待つ。承認後はmain/native/設計reviewの3入力固定→B04統合→V01起動基礎→選定native商品/合成Wallet基礎→OS受入。phaseGatesで途中依存を確認。GX00複数owner基礎→GX01交換契約→DX01 SDKは別系列。実ゲーム/実資金/実機は別ゲート、市場案は検討のみ。ATM自社手数料0・ゲーム料金未定・OS月888 cents維持。作業件数はOS完成率ではない。
````

## toolkits/rockstar-ledger/README.md

### 2026-09-12 — merge `ae9d30e7` で落ちた側 `0cc5415e`（1行）

統合: Merge commit '0cc5415e4724199505e1f54942918b72eb88ccae' into codex/os-backend-sites-launch-20260912 ／ 落ちた側の最後のcommit: Merge pull request #13 from k999ln/codex/sky-one-click-fashion-mcp-20260912

````text
同梱物: Rockstar Ledger commit `0d3f29f3f8986669ac6516cea252aa2fa506a1ef`、MIT。配布ZIP SHA-256: `abfdbbc884fb0723f74a1f4ece73cbe755104312eb1ec51e4f4f83bdb0224651`。
````

## 並行ブランチで書かれ、番号が重なって落ちた要望（全文）

2026-09-12〜09-15は複数のブランチが同時に `docs/product-baseline.md` へ要望を足していました。同じ番号（RQ18、RQ26、RQ27、RQ32〜RQ34）を別の内容で使っていたため、統合のときに片方の節が丸ごと落ちています。**番号は現在のRQと対応しません。** 内容は現在の別の番号の要望や設計へ引き継がれているものが多いので、参考として近い現行の要望を添えます。

### RQ18 Instagram運用・受注型ファッションブランド運営をSky商品にする（2026-09-12、`0cc5415e`）

近い現行の要望（参考）: 現行 RQ19（目標駆動のブランド経営エージェント）、Fashion Brand Ops

````text
## RQ18 Instagram運用・受注型ファッションブランド運営をSky商品にする

ブランド方針と商品designを入力し、target/market判定、差替可能な画像・動画Creative Provider、Instagram向け素材・caption・投稿/予約Social Provider、DM受信・分類・FAQ下書き・購入意向判定、注文情報回収、Payment Providerの決済link/Invoice、署名検証Webhookの入金確認、顧客/注文/制作/発送status、通知、広告/DM/売上feedbackまでを一つの商品として扱う。

RockstarOS Skyから`Instagram運用`で見つけられ、account list/switch、content plan、draft/caption、approval、schedule/publish、insights sync、DM classificationを独立MCP toolとしてdiscover/callできるようにする。外部サービスはProvider/Adapter境界へ置き、資格情報を商品DBへ直接保存しない。

価格変更、外部creative生成、投稿/予約、広告出稿、DM送信、決済link/Invoice送信、返金、通知は個別approvalを必須にする。初期状態はmock Providerで、実アカウント・実投稿・実決済・実課金を開始しない。曖昧な外部結果は自動再送せず照合待ちにする。Web Sky掲載とMCP host試験は、QEMU/Android/実機OSへの組込みや本番provider接続の合格ではない。
````

### RQ26 接続したMCPをChatのbotとして一元管理する（2026-09-13、`4f5cfed5`）

近い現行の要望（参考）: 現行 RQ25（MCP接続を共通Connectorに）、Zemaの接続bot管理

````text
## RQ26 接続したMCPをChatのbotとして一元管理する

Skyで接続が成立したMCP serverとready商品は、Chatを開いたときに接続中のbotとして自動表示する。利用者はbotを選び、同じスレッドから依頼、方向・修正指示、公開された機能、tool schemaに基づく引数、実行前確認、結果、失敗状態を確認する。共通Connectorの動的server一覧とConnection Passportを正本とし、機能数やserver名をChatへ固定実装しない。

任意MCPの実行はRQ25の`prepare → 内容確認 → execute`を維持し、引数へ結び付いた一回承認を迂回しない。bot停止時は接続sessionと未使用の承認を失効させる。MCP自身に実行中の方向変更・取消機能がない場合、Chatの修正指示は次の実行用であり、進行中の処理を変更したとは表示しない。送信後timeoutと結果不明を自動再実行へ変換しない。

Skyは商品を探す、接続先・権限・料金を確認する、MCPへ接続する役割を維持する。Chatは接続後のbot選択、依頼、操作、状態、結果の管理面とする。Chatから任意command、shell、secret、未審査serverを登録できるようにはしない。外部投稿、支払い、送金等の作用は各商品の既存approval gateを通す。
````

### RQ32 数を固定しない自律型自動化ファンド（2026-09-13、`dd94b57e`）

近い現行の要望（参考）: 現行 RQ33（汎用PAPER市場と実績更新型の自律ファンド）

````text
## RQ32 数を固定しない自律型自動化ファンド

Skyへ追加される利用可能な自動化ツールを候補集合とし、用途、実行可能性、リスク、役割の重複を見ながらファンドを動的に形成する。ファンド総数には製品上の固定上限を置かない。1ファンドの初期推奨は5ツールとするが、構成数は利用者が変更でき、将来追加されたツールも候補へ自動的に入る。A、B、C、D等の名称や4ファンド構成を固定仕様にしない。

利用者は一つの有効ファンドを選び、構成ツール、配分、版、選定根拠を確認できる。再構成は版を追加して追跡可能にし、秘密情報、外部公開、契約、購入、送金等の危険な作用は既存の同意境界を維持する。利回りや収益実績は、Execution Receiptと一意に結ばれたProvider確認済み売上から承認済み実費を引いた実績だけで計算し、未接続Provider、予測、自己申告、デモ値を実利回りとして表示しない。

Sky利用料は全ファンド合算で利用者単位・UTC月単位の最大888 centsとし、ファンドごとに重複請求しない。成果報酬は0 basis points、共同留保は0で、承認済み実費と当月Sky利用料を引いた残額は100%利用者の受取可能額とする。現在のP0は自動化の編成、参加、実績タグ、精算指図までとし、利用者資金の共同運用、他利用者への再配給、投資商品の募集、収益保証は有効にしない。実回収・実払出しは販売、決済、払出しProvider、本人情報、規約、税務・返金条件、sandbox受入が揃うまでOFFを維持する。
````

### RQ33 RockstarOS Marketsを読取専用の市場分析アダプターとして統合する（2026-09-13、`dd94b57e`）

近い現行の要望（参考）: 現行 RQ33、Sky Tool `rockstar-markets-analysis`

````text
## RQ33 RockstarOS Marketsを読取専用の市場分析アダプターとして統合する

RockstarOS Marketsは、Polymarketの公開ライブ市場を読み取り、確率、出来高、流動性をSkyと自動化ファンドの判断材料として提示する。ファンド候補ツールへ動的に追加できるが、市場データの取得、表示、予測、indicative quote、サンプル値、モック残高、架空取引量、含み損益を収益や利回り実績へ変換しない。ライブ取得に失敗した場合はサンプル値で補完せず、取得停止として閉じる。

Marketsの分析系統とRQ20/RQ32の会計系統を分離し、ファンド残高・配分・利用者帰属額の正本はProvider参照とExecution Receiptに結ばれたEarning Receiptだけにする。将来、取引Providerが注文完了、取消、清算、手数料、返金を照合し、実現損益を確定した場合に限り、その実現損益をEarning Receipt候補にできる。未確定損益と市場の総取引量は利用者収益ではない。

RockstarOSからの注文実行、自動再投資、自動資金移動は既定で無効にする。将来の各注文には、利用者の所在地と提供地域、年齢、KYC、利用規約、規制、Wallet署名、注文内容と最大損失に結び付いた明示承認が必要であり、分析アダプターの接続を取引許可として扱わない。Legacyの80/10/10表示は`/fund/legacy`だけに残し、このアダプターへ適用しない。詳細は [Markets・自動化ファンド統合](markets-fund-integration-20260913.md) を参照する。
````

### RQ34 外部Polymarket botを固定commitのbacktest sandboxとして接続する（2026-09-13、`dd94b57e`）

近い現行の要望（参考）: 現行 RQ33、`toolkits/polymarket-bot-sandbox/`

````text
## RQ34 外部Polymarket botを固定commitのbacktest sandboxとして接続する

`MrFadiAi/Polymarket-bot`はMIT Licenseの固定commit `3a04fc842bc3112a11b872263bb55e6712096f9a`を監査基準とする。原botはdry-runでも秘密鍵を要求し、dashboardからLIVEへ切り替えられ、simulation PnLを共通PnL表示へ加算するため、注文runtime、Wallet接続、approve、redeem、panic sell、秘密鍵入力、LIVE切替をRockstarOSへ直接接続しない。

RockstarOSはclean treeとcommitを確認し、秘密鍵関連の環境変数を子processから除外して、offline JSONLに対するbacktest runnerだけを実行する。出力は`rockstaros-polymarket-bot-backtest/1`へ封入し、Markets画面の検証APIは固定出所、backtest mode、LIVE無効、収益不計上、数値整合、秘密情報不在を検査する。検証済みreportも合成結果であり、実収益、利回り実績、注文推奨、8.88 USD回収原資にしない。詳細は[Polymarket bot sandbox統合](polymarket-bot-sandbox-20260913.md)を参照する。
````

### RQ26 Sky対応コードを自動化Toolの標準雛形にする（2026-09-15、`9b0f5cc4`）

近い現行の要望（参考）: 現行 RQ37（Rock StudioはSkyコードを既存ツールへ付けてTool化する）

````text
## RQ26 Sky対応コードを自動化Toolの標準雛形にする

開発者が既存処理へ数行のSky Tool SDKを組み込み、同じ定義からTool Packageの登録、MCP `tools/list` / `tools/call`、匿名利用集計へ進めるようにする。新規開発者には`create-sky-tool`で雛形を生成し、主に`handler`を自動化したい関数へ差し替える導線を用意する。PCのRock StudioではGitHub、OpenAPI、MCP、Rock Packageから下書きを作り、開発者が権利、料金、副作用、Schema、試験を確認して登録・公開する。

PackageはTool名と説明、LLM向け用途・禁止場面、入出力Schema、Adapter、権限、online/offline、実行先、副作用、料金と開発者受取人、timeout、再試行・idempotency、成功確認、テスト、Fund分類を一体で保持する。同じID・版を別内容で上書きせず、SHA-256で固定する。Fund分類は権限を増やさず、有料Toolの収益帰属とToBのSky手数料0を混同しない。

`submitted`、開発者の`published_declared`、Skyの`verified`を分離する。Developer Previewで実装する宣言公開を、Sandbox、作者署名、remote接続、失効運用まで合格した検証済み公開として扱わず、自動インストールを許可しない。外部変更・金融操作は実行ごとの承認を要求し、結果不明時に自動再試行しない。利用集計はPackage ID、Tool名、匿名Installation ID、結果、処理時間、実行時刻だけとし、入力、出力、会話、API key、Wallet情報を送信しない。設計と境界は[Sky Tool SDK / Rock Studio](sky-tool-sdk.md)を正本とする。
````

### RQ27 Rock StudioはコードかファイルだけでTool化する（2026-09-15、`9b0f5cc4`）

近い現行の要望（参考）: 現行 RQ37

````text
## RQ27 Rock StudioはコードかファイルだけでTool化する

PCのRock Studioはチャット形式にし、開発者が行う必須操作を「コードを貼る」または「ソースファイルを1件添付して送る」だけにする。Tool名、用途、LLMが使う場面・禁止場面、入出力Schema、Adapter、権限、online/offline、実行先、副作用、料金、開発者受取人、timeout、再試行、成功確認、テスト、Fund分類はコードから自動生成する。GitHub URLや開発者IDなどを最初に埋める手入力フォームへ戻さない。

コード解析とSHA-256計算はブラウザ内で行い、Registry APIには生成した`sky-tool-package/1`だけを送る。貼り付けたコード本文や添付ファイル本文は送信・保存しない。危険な外部変更・金融操作は推定結果に応じて実行ごとの確認と再試行禁止を設定し、生成したSky SDK組込みコードとPackageを結果画面で確認できるようにする。自動生成はSandbox検証や作者署名の代替ではなく、登録不能時に登録完了と表示しない。
````

## READMEで英語にした日本語の原文

READMEは2026-09-25に英語へ統一されています（commit `2cd7c96b`）。その後にREADMEへ日本語で追記されていた次の段落は、今回の整理で英語にしてREADMEの該当節へ置きました。原文はここに残します。日本語のまま `docs/sky.md` へ移した利用案内は、そちらに原文があります。

### Skyの商品詳細からZemaへ（README「From a Sky product page to Zema」の原文、2026-10-06時点）

````text
Skyの商品詳細では説明・料金・接続条件を確認し、ライブラリへ保存できます。「Zemaで開く」から同じ商品の入力・実行画面へ進みます。商品を開くことや保存することだけでは購入・実行を承認しません。出典整理はブラウザで処理でき、PC接続は必須ではありません。 保存した商品はZemaのライブラリから開けます。再保存は重複せず、解除は本人の保存だけに適用します。

Zemaの通常の仕事では、最初の手順を始める前に計画の目的を編集できます。同時更新で競合した場合は再読込して最新の内容を確認します。AMCのGoalはAMC専用の承認・記録操作から更新します。
````

### avokado専用モデルのゼロ事前学習試作（README「6. RockstarOS / Local AI」内の原文、2026-10-06時点）

````text
## avokado専用モデルのゼロ事前学習試作

追加費用なしで小型モデルをランダム初期化から学習し、保存・再開・CPU推論を試せます。[実行手順](toolkits/avokado-llm/README.md)。実用LLM、Mini実機、クラウド配備は未完成です。既存のQwen profileとeSIMサービス経路は維持します。
````

### avocadoMiniの没入型GTA調査（README「Research records」の原文、2026-10-05時点の`main`）

````text
### avocadoMiniの没入型GTA調査

[技術調査・将来構想・検証計画](docs/avocado-mini-r5/research/immersive-gta/README.md)。2026-09-30時点の記録。GTA接続・裸眼空間表示・実機完成の証拠ではありません。
````

## 今回の整理で新しい版へ置き換えた行

`origin/main`（`0fbf688b`、2026-10-06）にあった行のうち、今回の整理で新しい内容の行へ置き換えたものです。置き換え後の行は各文書にあります。ここには置き換え前の原文を残します。

### PROJECTS.md（12行）

行の内容を足した（リンク・説明の追加、重複していた2行の統合、件数の訂正、切れていたリンクの修正）。元の行はここに残す。

````text
| **avokadoPro** | 単体でgame、service、compute、storage、audioを扱い、任意でMiniと接続する。専用統合設計・BOM・ICD・実機受入は未作成 | [製品定義](sites/avocado-mini/src/pages/pro/index.astro)・[Mission Control P1〜P7](docs/mission-control.md) | [`sites/avocado-mini/src/pages/pro/`](sites/avocado-mini/src/pages/pro/) |
| **rocketstar** | ロケットR1.0、衛星・A-LINK・受信試作などの設計アーカイブ。Siteの構想ページと設計原本を分ける | [設計アーカイブ](docs/rocketstar-design/README.md)・[構想ページ](sites/avocado-mini/rocket-star/index.html) | [`docs/rocketstar-design/`](docs/rocketstar-design/)・[`sites/avocado-mini/rocket-star/`](sites/avocado-mini/rocket-star/) |
| **Webアプリ** | Home、Sky、Zema、Wallet、設定、Sky Tool SDK用Rock Studioを一つのWeb/PWAとして提供 | [製品・サービス関係図](docs/rockstaros-product-system-map.md)・[Web担当作業](docs/workstreams/05-web-pwa-sites.md) | [`app/`](app/)・[`components/`](components/)・[`lib/`](lib/)・[`db/`](db/)・[`drizzle/`](drizzle/) |
| **Zema / Work / Activity** — 依頼、進捗、承認、停止、成果、履歴 | [`app/chat/`](app/chat/)・[`app/work/`](app/work/)・[`app/activity/`](app/activity/)・[`lib/zema-chat-session.ts`](lib/zema-chat-session.ts) | [Platform Core](docs/platform-core.md)・[Product / UX](docs/workstreams/01-product-ux.md) |
| **AMC** — 部隊・Goal・進捗の管理 | `rockstar-amc`としてcatalogにready登録。SkyからZema内で依頼・計画・手動記録を扱う。LLM・AI実作業は未接続 | [`app/amc/`](app/amc/)・[`components/amc-tool-runner.tsx`](components/amc-tool-runner.tsx)・[AMC設計](docs/mission-control.md) |
| **Market / Polymarket** — 市場の検討とPAPER試験 | `rockstar-markets-analysis`はcatalogにready登録。`/polymarket`は`/market`への転送で、外部市場のPAPER試作は別のToolkit | [`app/market/`](app/market/)・[`app/polymarket/`](app/polymarket/)・[`toolkits/polymarket-bot-sandbox/`](toolkits/polymarket-bot-sandbox/)・[Game / Market / Fund](docs/workstreams/08-game-market-fund.md) |
| `coconala` | ココナラ案件チェック | [`vendor/mr/application_eligibility.py`](vendor/mr/application_eligibility.py)・[`toolkits/mr/`](toolkits/mr/) |
| [`toolkits/`](toolkits/) | 6ディレクトリを下表で分類。Tool実装、SDK、connector、PAPER試作を区別 |
| **Web内の製品紹介・導入画面** | [`app/rockstaros/`](app/rockstaros/)には旧P0.2の外観・税込価格表示が残る。現行R5の画面実装・配備は未完了 | [`app/rockstaros/`](app/rockstaros/) | [現行R5設計](docs/avocado-mini-r5/README.md)・[Web / PWA / Sites](docs/workstreams/05-web-pwa-sites.md) |
| **Market / Polymarket** — 市場の検討とPAPER試験 | `rockstar-markets-analysis`はcatalogにready登録。`/polymarket`は`/market`への転送。外部市場backtestとミームコイン候補評価はPAPER sandboxへ分離 | [`app/market/`](app/market/)・[`app/polymarket/`](app/polymarket/)・[`toolkits/polymarket-bot-sandbox/`](toolkits/polymarket-bot-sandbox/)・[`toolkits/meme-intelligence-sandbox/`](toolkits/meme-intelligence-sandbox/)・[Game / Market / Fund](docs/workstreams/08-game-market-fund.md) |
| **avokado-llm** | random-init CPU学習・保存・再開のhost試作。製品モデルの品質・端末・cloud未受入 | [README](toolkits/avokado-llm/README.md) |
| **mini-game-client** | 本人の明示操作で公式Remote Playへ渡す診断launcher。実game/console未受入 | [README](toolkits/mini-game-client/README.md) |
````

### README.md（3行）

ナビゲーションの行を作り直し、Skyの手数料の文を2026-09-27以降の内容（10%）へ直し、末尾にあった見出しを該当の節へ移した。

````text
[Product experience](#product-experience) · [Feature details](#feature-details) · [Current status](#current-status) · [Design library](#design-library) · [Still image](docs/brand/avokado/avokado-r5-editorial-hero.png)
- Sky is designed to charge developers and businesses neither a base fee for registering Tools nor a Sky fee on product revenue. External payment, model, cloud, and other pass-through costs are shown separately.
## Mini game client prototype
````

### docs/jev-local-qwen-decision-fabric-design.md（10行）

「未実装」だった状態の行を、統合で落ちていた新しい状態（host側実装済み）へ戻した。

````text
- 状態: **設計確定・実装未完**。既存のPixel 10向けLocal AI実装を土台にするが、本書のDecisionProvider、Router、Harness、TypeSafe接続、RAG、Cloud fallbackはまだ実装済みではない。
| Android / OS  | 試験署名APKでBinder経路とBroker連携を確認。AOSP image、正式署名、SELinux最終形、OTAは未完                                                               | Decision ServiceのOS統合、model/provider世代固定、監査event    |
| Jev ecosystem | 10 repositoryをcandidate登録し、安全境界を設計。source導入・runtime接続は未実施                                                                         | TypeSafeJevProvider、OpenJev候補adapter、専用fixtureと採用試験 |
| `lib/decision/types.ts`                  | 型                                 | 未実装           |
| `lib/decision/router.ts`                 | deterministic routing              | 未実装           |
| `lib/decision/harness.ts`                | provider実行・合成・retry          | 未実装           |
| `lib/decision/policy.ts`                 | hard authorization                 | 未実装           |
| `lib/decision/providers/mock.ts`         | fixture provider                   | 未実装           |
| `lib/decision/providers/typesafe-jev.ts` | TypeSafe API adapter               | 未実装           |
| `tests/decision-*.test.mjs`              | safety / routing / failure fixture | 未実装           |
````

### docs/product-baseline.md（2行）

表題と1段落を、`main` にあった注記つきの版へ戻した。

````text
# 2026-09-24 現行製品基準 — avocadoMini R5（統合版v1.94）
E3の4本＋別Hub必須、旧価格、寸法・性能候補はR5へ自動継承しない。外部給電は必要で電池未採用。Pixel/QEMU、既存Material研究契約、権限・Walletの証拠と安全条件を維持する。Git保存と公開サイト配備は別である。2026-09-24に公開SiteをR5へ同期し、提供済みの製品画像を変更せずに表示・導線・アクセシビリティ・SEOの不具合を修正したが、OS image、runtime統合、実機・製造・販売の受入状態は変更していない。
````

### docs/rockstaros-complete-design.md（1行）

統合で落ちていた記述を含む版へ戻した。

````text
最終OS imageではpackage、privapp許可、SELinux domain、signer、UID、version、permissionを同じbuild artifactで検査する。単体APKの成功だけでproduct imageへの搭載を主張しない。
````

### docs/rockstaros-product-system-map.md（11行）

2026-10-05の統合で古い版（v1.0、2026-09-19）へ戻っていたため、`main` にあったv1.1（2026-10-02）へ戻した。v1.0の行をここに残す。

````text
版: 1.0 / 2026-09-19
対外的な製品紹介ではavocadoMiniを主役にし、RockstarOSとLLMを製品を動かす技術基盤として示す。avocadoMiniは設計段階で、実機試作と販売は未実施である。
利用者への入口は、製品紹介とOS導入を兼ねるホームページ、Webアプリ、OS本体の三つ。SkyなどはアプリとOSの中で使うサービスであり、独立した最上位製品入口として並べない。
| 製品・導入ホームページ | `/rockstaros`。avocadoMiniとRockstarOSの紹介、OS導入案内への導線 | 製品構想、対応環境、導入情報 |
| Webアプリ | `/`。本人限定Siteで作業画面を提供中、一般公開と最新版同期は未反映 | App Home、Sky、Zema、Wallet、Sky Tool SDK用Rock Studioなど |
| OS本体 | `/rockstaros/guide`でDeveloper Previewの導入条件を案内。完成スマートフォンOSは未配布 | App Homeと同じ役割のサービスをOS契約で接続する計画 |
avocadoMiniは「考える時間を、つくる時間に」を製品メッセージとし、希望参考価格41万円のハードウェア構想。高性能LLMを搭載するRockstarOSは製品目標で、現行の実機検証は固定モデルのDeveloper Preview段階である。41万円は確定販売価格でもOS従量料金でもない。
- RockstarOSは、AIを使うためのOSと共通基盤。
- avocadoMiniはMaterial Invention Studioを手で扱う専用デバイス。OSそのものではない。
  U --> OS
  U --> AM
````

### docs/sky-tools-complete-design.md（6行）

統合で古い版へ戻っていた行を、`main` にあった新しい行へ戻した（ココナラの名称と範囲、法務・特許の料金gate、Jev品質評価の現在の扱い）。

````text
| `rockstar-ip-studio`        | IP Studio — SNS・ゲーム運用        | candidate | PC / Provider          | 生成・配信・ゲーム提出を別capability化   |
| `coconala`                  | ココナラ案件チェック              | ready     | Web                    | local-pure                                |
| `rockstar-legal-intake`     | 法務受付                          | ready     | Web / 任意AI           | local整理＋同意後remote-read              |
| `rockstar-patent-assistant` | 特許出願アシスタント              | ready     | Web / 任意AI           | local draft＋同意後remote-read            |
## 9. ココナラ案件チェック
`jev-evaluation` は、本人が送信対象・送信先・料金・保持条件を確認した後に、最小化した入力を評価するremote evaluatorである。評価Receiptはreview signalとして保存し、権限付与、Tool成功、仕事完了、専門家判断の代替にはしない。
````
