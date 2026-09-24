# avocado

[プロジェクト別ガイド](PROJECTS.md) · [作業分野別ガイド](docs/workstreams/README.md) · [全設計ポータル](docs/rockstaros-design-portal.md)

ゲームを入口に、生活全体をより豊かにすることを目指し、制作・学習・日常生活へ広げる製品構想です。このリポジトリには、avocadoMiniのハードウェア設計、RockstarOSの共通契約、Web・Android・Linux/QEMUの実装と検証記録を収めています。

**現在の設計基準はR5（2026-09-24）です。** 使用時全高200mm以内の銀色の細いminiを、**1本で基本機能が動く構成**として設計します。別Edge Hubや外部PCを必須にせず、同型miniを追加して範囲・品質を改善することを目指します。

**製造承認は保留です。** 裸眼で部屋の空間に粒子が見える表示、単体の精密3D入力、最終収納・熱・電源、確定回路・加工図は未成立または未確定です。計算・設計書があることを、実機完成や安全性の証明に置き換えません。

[設計書一式](docs/avocado-mini-r5/README.md) · [PDF](docs/avocado-mini-r5/package/avocadoMini_RockstarOS_R5_Integrated_Design.pdf) · [Word](docs/avocado-mini-r5/package/avocadoMini_RockstarOS_R5_Integrated_Design.docx) · [一括ZIP](docs/avocado-mini-r5/avocadoMini_R5_Integrated_Design_Package.zip) · [開発進捗](project.md)

## OS全体の設計書

[RockstarOS 設計書完全版 v1.0（原本PDF）](docs/rockstaros-complete-design-v1.0.pdf) / [検索用テキスト](docs/rockstaros-complete-design-v1.0.txt) / [原本の完全性記録](data/rockstaros-complete-design-v1.0.json)。32章・5配備profile・13論理service・OSR-001〜060を収録し、rocketstar、A-LINK、avokado、colonyの共通運用を扱います。記録された43/43は構造・DDLの検査で、実装・実機・飛行・量産の合格ではありません。

**OS原本内のE3「4本＋別Hub」配置はR5へ適用しません。** 原本を改変せず保持し、R5単独mini用のDevice Profile・adapterとの統合は未完了として区別します。

## rocketstar・衛星・共通運用の設計アーカイブ

[rocketstar公開ページ](https://avocado-mini.kirin-999.chatgpt.site/rocket-star/)は、両段再使用・衛星搭載・A-LINK・RockstarOSの計画を案内します。[完全版をサイトで読む（全35章）](https://avocado-mini.kirin-999.chatgpt.site/rocket-star/design/) / [PDFダウンロード](https://avocado-mini.kirin-999.chatgpt.site/downloads/rocketstar-complete-design-r1.0.pdf) / [全付録ZIP](https://avocado-mini.kirin-999.chatgpt.site/downloads/rocketstar-complete-design-r1.0.zip)をSiteから直接開けます。公開版と設計原本、検証状態の対応は[Web作業記録](docs/workstreams/05-web-pwa-sites.md)を参照してください。

[rocketstar 設計書完全版 R1.0（44ページ・35章）](docs/rocketstar-design/outputs/rocketstar_Complete_Design_R1_0/rocketstar_Complete_Design_R1_0.pdf) / [本文と全付録の入口](docs/rocketstar-design/README.md) / [完全版ZIP](docs/rocketstar-design/outputs/rocketstar_Complete_Design_R1_0_package.zip)。無人・両段再使用のロケット、衛星搭載、帰還・回収、地上設備、整備・再使用、検証計画をまとめた統合システム設計です。製造図面、実機性能、飛行認定は未完了です。

A-LINK、受信試作、コロニー運用、ボタン設計、旧版、生成元、計算と検証記録は[保存台帳](docs/rocketstar-design/inventory.json)で追跡します。[OS完全版の付録一式](docs/rocketstar-design/outputs/RockstarOS_Complete_Design_v1_0/README.md)も受領し、既存OS PDFと同一SHA-256であることを確認しました。付属schema・DDL・モデルは設計/試験資料として保存し、現行runtimeへ自動適用しません。アーカイブ内のE3・別Hub・ボタン配置前提はR5へ継承せず、製品要求は引き続き1本自律・別Hub不要です。Git保存はサイト公開、OS配布、製造・打上げの承認を意味しません。

## 何をできるようにするか

| 段階 | 目指す体験 |
| --- | --- |
| ゲーム | 手・身体・日本語音声で粒子を選び、動かし、衝突・結合・分離・取消する |
| 制作・学習 | ゲームのルールを変え、作品を保存・再開し、科学モデルの条件と限界を確認する |
| 生活支援 | 手順、タイマー、中断・再開、最後に観測した物の場所など、限定した日常の負担を減らす |
| 外部連携 | 対応AI、ゲーム、制作・配信先を交換可能な接続部で選び、外部送信・公開・課金を本人が承認する |

これは機能要求であり、対応済み一覧ではありません。実物の粒子を放出したり、実物の化合物を作ったりする装置ではありません。GTA等の市販ゲーム、Higgsfield、Roblox、YouTubeへの接続は、公式API・許諾・性能・個別実装と受入を必要とします。

## R5の構成

| 要素 | 設計上の役割 |
| --- | --- |
| mini 1本 | 入力、ローカル演算、保存、音声、ゲーム、安全停止を自機に持つ |
| 同型miniの増設 | 観測、時刻、座標を合わせ、実測した有効範囲と品質を共同利用する |
| RockstarOS | 入力・ゲーム状態・作品・AI接続・権限・費用・履歴を統合する |
| 電源・通信 | 外部給電は必要。電池は未採用。通信設備は演算Hubとは別で、インターネットを基本動作の必須条件にしない |

センサーの赤外光は「空間を測る光」であり、裸眼で粒子を表示する能力とは別です。TV、AR眼鏡、壁面投影、卓上の浮遊平面像を、要求された全空間表示の達成とは扱いません。

## ソフトウェアの設計

RockstarOSは、端末上の権限・仕事・保存・復旧を共通基盤に置き、アプリ、AI、Tool、外部Providerを契約で接続する設計です。[AIネイティブOS共通設計](docs/ai-native-os-architecture.md)に依存方向と未実装の契約を記載しています。以下は設計上の役割であり、全経路の実装・統合完了を示すものではありません。

| 層 | 役割と境界 |
| --- | --- |
| Device Support / 入力adapter | 機種固有の起動・センサー・電源を扱う。R5 miniのDevice Profileと既存OSの接続は未完了 |
| Platform Core / Broker | 本人・component・capability・承認を検査し、仕事、結果、履歴、保存・復旧を管理する。AIの提案だけでは実行しない |
| Local AI / Agent | 端末内で計画候補を作り、Brokerが検査した有限の手順を進める。モデル交換、長期記憶、一般的な自律実行は設計・追加受入の対象 |
| Sky / Zema | SkyでToolとAIチームを探して接続し、Zemaで依頼、進捗、確認、停止、成果を扱う |
| Tool / MCP / Provider | 業務、制作、ゲーム、外部サービスを版・権限・費用・実行先ごとに接続する。外部公開や購入などは対象を特定した本人承認を要する |
| Wallet / Asset | 署名済み収益と費用の照合、作品の出所・権利・版を扱う。Toolの完了を実収益や金融取引の成功と同一視しない |

[OS全体詳細設計](docs/rockstaros-complete-design.md) / [Tool詳細設計](docs/sky-tools-complete-design.md) / [LLMとJevの現在地](docs/llm-evaluation-architecture.md) / [製品・システム関係図](docs/rockstaros-product-system-map.md)

## 設計資料を読む

| 知りたいこと | 入口 |
| --- | --- |
| ハードとOSをまとめて読む | [R5統合基本設計・51ページ](docs/avocado-mini-r5/README.md) |
| 本文を検索する | [Markdown本文](docs/avocado-mini-r5/package/integrated_design.md) |
| 外形・機能構成・視野・安全・起動を見る | [設計検討図8点（SVG/PNG）](docs/avocado-mini-r5/package/drawings/) |
| 計算と検証状態を確認する | [計算結果](docs/avocado-mini-r5/package/calculation_results.json) / [保存・検証記録](docs/avocado-mini-r5/verification.json) |
| 生活の課題と研究根拠を読む | [調査報告](docs/avocado-mini-r5/research/README.md) / [参考資料台帳](docs/avocado-mini-r5/package/reference_index.json) |
| OS共通基盤と既存実装を読む | [OS全体設計](docs/rockstaros-complete-design.md) / [全設計ポータル](docs/rockstaros-design-portal.md) |
| Sky・Zema・AIやToolを調べる | [Tool設計](docs/sky-tools-complete-design.md) / [システム関係図](docs/rockstaros-product-system-map.md) |
| 要望・担当・次の作業を確認する | [製品ベース](docs/product-baseline.md) / [avocadoMini作業分野](docs/workstreams/11-material-invention-avocado-mini.md) / [全進捗](project.md) |

図面は設計検討図であり、製造CAD・確定回路図・基板製造データの代用品ではありません。R5は、最終部品、ピン配線、公差、安全審査、実機試験を完了した製造用完全版ではありません。

## SkyのAI自動化チーム

CSV業務、メルカリ収益ループ、Fashion Brand OpsはSky catalogに登録済みのチーム担当です。Material Invention StudioはSkyで組み合わせる発明チームの複合機能で、単体のcatalog Toolには数えません。Material Inventionの操作画面とSky接続は未実装です。全Toolと開発用package、Web画面、配備物の場所と現在地は[プロジェクト別ガイド](PROJECTS.md)にまとめています。

## 現在地と履歴

R5の計算・判定チェックは14件通過、実機試験は0件です。資料保存はOS runtimeの実装やハードウェア完成を意味しません。既存のPixel、QEMU、Web、Wallet等の検証系列は独立して維持します。

| 系列 | 現在確認できる範囲 | 残る主な受入 |
| --- | --- | --- |
| avocadoMini R5 | 統合基本設計、図面、計算の保存と自動チェック | 裸眼全空間表示、精密3D入力、閉箱での熱・電源・安全、同一試作機の実測。製造承認は保留 |
| Web / Sky / Zema | アプリ、Tool catalog、仕事・承認・履歴、分離したBilling WorkerとOperator Dockのsource | 配備先ごとの最新source・認証・外部Provider・実取引の受入。Git保存だけで公開中とはしない |
| Pixel 10 GL066 / frankel | 既存OS上の試験署名APKでoffline計画と限定Tool、保存・再起動などの23/23事前試験 | RockstarOS全体のimage build、正式署名、初回flash・boot、OTA、全損復元。初回flash gateは4項目とも未合格 |
| Linux / QEMU | 独立したDeveloper Previewの実装・受入記録 | 現行候補と同一artifactのrelease gate。Pixelの実機合格へ転用しない |
| Material Invention | 再現可能なsandbox Coreと統合設計 | R5入力・表示adapter、操作画面、実センサー、simulation・Patent AI接続の受入 |

根拠: [全進捗](project.md)、[Pixel事前試験](docs/evidence/android-pixel-10-prefull-physical-20260916.json)、[初回flash gate](docs/android-first-flash-gate-20260916.md)、[Material Invention担当分野](docs/workstreams/11-material-invention-avocado-mini.md)。

<!-- project-overview:start -->
更新日: 2026-09-24 / 151 task中99 done・31 in progress・20 planned・1 blocked
<!-- project-overview:end -->

件数は製品完成率ではありません。[全task・段階別gate・次の作業](project.md#全taskの作業進捗)を参照してください。

P0.2、E1、E2、Tower20 E3は履歴です。以前の「4本＋別Hub必須」、寸法、価格、性能候補をR5へ自動継承しません。[更新前READMEの保存済み原文](https://github.com/k999ln/rock/blob/0eb4fe48b1e7309e838b0441954d97e22272b4ca/README.md)はGit履歴から参照できます。R5の価格・納期・販売開始は確定していません。

**R5の資料保存は製品本体の公開反映やOS配布、予約・決済開始を意味しません。** 公開サイトのrocketstarページと完全版PDF・ZIPは別途更新しました。avocadoMini本体には以前のE3の説明が残るため、現行の設計判断はR5を参照してください。

## リポジトリ内の場所

| 場所 | 主な内容 |
| --- | --- |
| [app/](app/)・[components/](components/)・[lib/](lib/) | Webアプリの画面、共通UI、仕事・Tool・Wallet等の処理 |
| [services/](services/) | Sky BillingとOperator Dockの独立したWorker |
| [systems/rock-star-os/](systems/rock-star-os/) | Linux/QEMU向けnative OSと配布・検証資産 |
| [android/](android/)・[os/](os/) | Androidアプリ／BrokerとPixel向けOS構成 |
| [toolkits/](toolkits/)・[contracts/](contracts/) | Tool SDK・Connector、共通interface |
| [sites/avocado-mini/](sites/avocado-mini/) | 製品Siteのsource。Git上の更新と公開配備は別 |
| [docs/](docs/)・[data/](data/) | 設計正本、受入証拠、製品要求と進捗 |

詳しい入口とToolの配置は[プロジェクト別ガイド](PROJECTS.md)を参照してください。

## 開発を始める

Node.js 22.13以上とnpmを使用します。次はWebアプリのローカル起動手順です。Pixel、QEMU、Worker、製品Siteには別の手順と受入条件があります。

```sh
npm ci
npx wrangler d1 migrations apply DB --local --config wrangler.local.jsonc
npm run dev
```

資料・進捗の変更後は以下を実行します。外部サービスの認証情報は必要な環境にだけ設定し、秘密値はGitへ保存しません。

```sh
npm run project:update
npm run verify
python3 scripts/verify-avocado-r5-package.py
python3 docs/avocado-mini-r5/package/verify_calculations.py
```

最後の計算コマンドは同じフォルダーのJSONを再生成します。算術・判定の再現であり、実機合格ではありません。OS固有の手順は[Linux/QEMU](docs/workstreams/06-native-qemu-release.md)、[Android/Pixel](docs/workstreams/07-android-device-local-ai.md)、[Material Invention](docs/workstreams/11-material-invention-avocado-mini.md)へ分けています。

## 安全・権利・配布

AIや認識結果だけで、外部公開、家電操作、購入、支払いを許可しません。秘密情報・個人データをGitに入れず、同居人・来客の記録も購入者の許可と分けて扱います。医療判断、緊急監視、施錠・加熱機器の自動実行は初期対象外です。

RockstarOS 1.0はDeveloper Previewです。GitHubでの閲覧は再利用許諾と同じではなく、独自コードの再利用ライセンスは未選定。同梱OSS・モデル・外部サービスには個別条件があります。Mr.由来の対象コードのMIT条件は維持します。[配布条件](docs/release-minimum-gates.md) / [取り込み元とライセンス](docs/mr-integration.md)
