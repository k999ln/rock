# docs/ — 現行設計の読み方

更新: 2026-10-13。最初に[サービス統合設計](service-design/README.md)を読む。旧仕様と現行仕様を並べて選ばせず、一つの製品体験と各契約の責任から説明する。

## サービスの中心

無料avokadoアカウントから始める。Jenniferに目的を伝え、SkyでAgent/Toolを選び、裏側のZema/AMCで仕事・承認・停止・成果・費用を管理する。RockstarOS/Brokerが本人・権限・保存・復旧を強制し、modelの応答を実行許可にしない。

MiniはR5の1本自律・200mm以内・別Hub不要の空間端末、Proは独立したNVIDIA高性能si PC。rocketstarは独立工学programで、一般Agentの実行経路と飛行管制を分ける。各機器の完成をSkyの利用条件にしない。

## 入口＋6章の7冊

- [統合設計の入口](service-design/README.md) — 目的と全体像。
- [01 利用体験](service-design/01-service-experience.md) — 依頼から成果を持ち帰り、再利用するまで。
- [02 共通システムと契約](service-design/02-system-contracts.md) — 本人・仕事・権限・料金・保存・復旧。
- [03 各製品の役割](service-design/03-product-profiles.md) — Jennifer／OS／Mini／Pro／rocketstarの責任。
- [04 実現順と受入](service-design/04-delivery-and-acceptance.md) — 再利用する実装、不足、担当と合格証拠。
- [05 要望対応](service-design/05-requirement-coverage.md) — RQ01〜RQ50の引継ぎ。
- [06 横断整合契約](service-design/06-consistency-contracts.md) — 同じowner・仕事・予算・成果を照合する12シナリオ。

## 正本と現在地

- [現行製品方針とRQ01〜RQ50](product-baseline.md)（正本）
- [全領域の詳細設計](rockstaros-design-portal.md)（入口）
- [OSの責任・状態・保存・復旧](rockstaros-complete-design.md)（正本）
- [Sky／Zemaと全Toolの契約](sky-tools-complete-design.md)（正本）
- [物質発明・Mini研究profileとR5の境界](rockstaros-avocado-mini-complete-design.md)（正本）
- [会話窓口・Goal分解・実行と真正検収の境界](jennifer-coordination.md)（正本）
- [任意claim・署名・鍵管理・失効・復旧](service-entitlements.md)（正本）
- [担当・Goal・手順・合格条件](mission-control.md)（正本）
- [保存区分・削除理由・Git履歴からの復元](git-consolidation.md)（手順）

現在の実装・受入・次作業は[project.md](../project.md)、[進捗JSON](../data/project-status.json)、[検証証拠](evidence/service-design-rebuild.json)を照合する。設計、host fixture、仮想OS、実機、本番は別の合格条件。GitHub main、作業branch、公開Siteも同一artifactか確認する。

## 製品profileと作業入口

- [avocadoMini R5](avocado-mini-r5/README.md) — 現行製品profile。価格・実機・製造は未受入。
- [avokadoPro PC](avokado-pro-pc-design.md) — NVIDIA候補構成とP0試作。80万円は販売目標、税・BOM・性能は未確定。
- [rocketstar](rocketstar-design/README.md) — 工学正本と飛行安全gate。
- [担当別workstream](workstreams/README.md) — ROCK／EXTERNAL／JOINT／OWNER、taskと検証入口。
- [機能別の作業部屋](../workspaces/README.md) — 現行の一意な担当と前提。
- [Tool・Agent総覧](agents-and-tools.md) — カタログと実行役の役割。
- [Campus／NFC](sky-nfc-columbia.md) — OS不要のブラウザ入口。タグ、本人、学生利用枠、購入・実行権を分ける。

## 詳細資料の索引

以下は契約・手順・監査を探す索引。日付付きの記録や受入数値は、対象SHA／環境／artifactの範囲に限る。古い観測を現在値へ読み替えない。現行製品方針は上の正本を優先する。

- [A2A Cloud Agent価格見積拡張（契約準備）](a2a-pricing-extension.md)（設計）
- [Agent Control Plane v1](agent-control-plane.md)（設計）
- [エージェント・Tool総覧 — 何があって、それぞれ何をするか](agents-and-tools.md)（設計）
- [RockstarOS canonical memory and model projections](ai-memory-architecture.md)（設計）
- [RockstarOS — アカウントサービスを支えるsi・Agent共通runtime設計](ai-native-os-architecture.md)（設計）
- [RockstarOS siネイティブOS設計—Sol独立監査](ai-native-os-design-audit.md)（監査・記録）
- [AMCの有限fixture実行](amc-autonomy-fixture.md)（設計）
- [AMC Goal Orchestrator](amc-goal-orchestrator.md)（設計）
- [Sky専用AMCの取り込みとローンチ判定](amc-sky-launch-integration.md)（設計）
- [RockstarOS Androidバックアップ・全損復元](android-backup-recovery.md)（手順）
- [RockstarOS 初回flash前の固定ゲート](android-first-flash-gate-20260916.md)（設計）
- [RockstarOS Google純正復旧セット](android-google-stock-recovery.md)（手順）
- [RockstarOS Android 1.0 production architecture](android-production-architecture.md)（設計）
- [RockstarOS Android正式署名鍵の保管方針](android-production-signing-custody.md)（手順）
- [RockstarOS AVB rollback index運用](android-rollback-index-policy.md)（設計）
- [Rock Android P1 — Pixel 10でのアプリ試験](android-trial.md)（手順）
- [avocadoMini — 本体SIMによる単独通信](avocado-mini-cellular.md)（設計）
- [avocadoMini R5 — 試作・資金計画](avocado-mini-crowdfunding.md)（設計）
- [avocadoMini Full-scale 空間発明台 — ハードウェア詳細設計書](avocado-mini-hardware-design.md)（設計）
- [avocadoMini — 四方向センサーで物質候補を操作するRockstarOS発明端末](avocado-mini-spatial-invention.md)（設計）
- [avokado専用モデルの事前学習・配布設計](avokado-llm-pretraining.md)（設計）
- [avokadoPro — NVIDIA搭載の高性能si PC](avokado-pro-pc-design.md)（設計）
- [B03 段1〜2 合成 Hub↔Wallet adapter 設計](b03-synthetic-hub-wallet-adapter.md)（設計）
- [LOOP バックエンド設計](backend-design.md)（設計）
- [Avocado Campus layer](campus-layer.md)（設計）
- [New unsigned candidate preparation](candidate-preparation.md)（設計）
- [Chat MCP botコントロールルーム](chat-mcp-control-room-20260913.md)（設計）
- [RockstarOS Chat 操作性改善](chat-usability-20260912.md)（設計）
- [Cloud agent runtime and orchestration provider comparison](cloud-agent-provider-comparison-20261001.md)（設計）
- [CSV仕事 — 市場確認記録](csv-business-market-evidence-20260915.ja.md)（設計）
- [CSV仕事 v1 — セキュリティ・プライバシー運用](csv-business-security.ja.md)（設計）
- [CSV仕事 v1 — 商品・実装・運用の正本](csv-business-v1.ja.md)（設計）
- [データ保存境界と重複整理](data-storage-boundaries.md)（設計）
- [Database status](database-status.md)（設計）
- [Rock star — 配信先との統合設計（承認待ち）](deployment-integration.md)（設計）
- [Rock — 設計・プロンプトと実装の再照合](design-implementation-alignment-20260909.md)（監査・記録）
- [RockstarOS 多機種対応アーキテクチャ](device-support-architecture.md)（設計）
- [Rockstar Market / 自律型ファンド — 2026-09-13](everything-market-and-autonomous-fund-20260913.md)（設計）
- [Rock — 実装承認と条件付きの公開・実機・実資金希望](execution-approval-20260909.md)（手順）
- [外部Wallet／ファンドProvider境界 — 2026-09-13](external-wallet-fund-provider-boundary-20260913.md)（設計）
- [Instagram運用・受注型ブランド管理 — RockstarOS Sky統合](fashion-brand-ops-integration.md)（設計）
- [RockstarOS フロント機能性監査 — 2026-09-15](frontend-usability-audit-20260915.md)（監査・記録）
- [Rock synthetic game API contract — design draft 0.2](game-api-contract-draft.md)（設計）
- [GX00 接続契約 1 — schema / signature 単位](gx00-connection-wire-v1.md)（設計）
- [GX00 接続の限定host実装](gx00-connections-runtime.md)（設計）
- [GX00 current-copy game handover (host runtime only)](gx00-current-game-restore.md)（設計）
- [GX00 非空legacyと接続の共通fixture](gx00-legacy-game-basis.md)（設計）
- [GX00 owner 接続要求の保存と復旧](gx00-owner-connection-client.md)（設計）
- [GX00 ADR案 — 1契約1台帳を維持した認証付き複数ownerの接続](gx00-owner-isolation-adr.md)（設計）
- [GX01: 既存 Wallet に接続する合成交換の実装準備](gx01-contract-implementation-plan.md)（設計）
- [Gameのnative入口と所有者境界](gx01-native-ui-20260910.md)（設計）
- [GX01 reference SDK and empty public sandbox](gx01-reference-sdk-sandbox-20260910.md)（設計）
- [GX01 UI / Platform boundary — implementation contract](gx01-ui-wire-20260910.md)（設計）
- [Instagram写真オンボーディング](instagram-photo-onboarding-20260912.md)（設計）
- [Jev ecosystemをRockstarOSへ入れるための全体詳細設計](jev-ecosystem-integration-design.md)（設計）
- [RockstarOS Decision Fabric 完成設計書](jev-local-qwen-decision-fabric-design.md)（設計）
- [Jev UltrafastをRockstarOSへ入れるための詳細設計](jev-ultrafast-integration-design.md)（設計）
- [avocadoOS — LLM・評価モデル設計](llm-evaluation-architecture.md)（設計）
- [Local Action AssistantのRockstarOS導入](local-ai-os-integration-20260915.md)（設計）
- [Local LLM 接続監査（2026-09-20）](local-llm-connection-audit-20260920.md)（監査・記録）
- [Rock — ゲーム資産市場・予測市場の検討メモ](market-exploration-20260909.md)（設計）
- [RockstarOS Markets・自動化ファンド統合](markets-fund-integration-20260913.md)（設計）
- [RockstarOS Material Invention Core — 物質の組合せから発明候補を作る共通設計](material-invention-core.md)（設計）
- [RockstarOS Spatial Invention Studio — Material Invention CoreのVR／AR設計](material-invention-xr.md)（設計）
- [Sky メルカリ収益ループ](mercari-revenue-loop.md)（設計）
- [統合で失われた情報の監査（2026-10-07）](merge-loss-audit-20261007.md)（監査・記録）
- [MiniからGTA VIを遊ぶための接続](mini-game-client.md)（設計）
- [Mr.からの取り込み](mr-integration.md)（設計）
- [Rock star OS — native OSの統合と現行方針](native-os-integration.md)（設計）
- [Native OSのRock統合検証](native-os-validation.md)（手順）
- [同じsource・imageを固定するbuild入口](native-release-build-20260910.md)（手順）
- [Rock star OS — P1 実装と検証手順](os-prototype.md)（設計）
- [Future detached owner legal approval](owner-legal-approval.md)（手順）
- [所有者本人による手動署名の準備](owner-manual-signing.md)（手順）
- [kaiya の決定と残る設定 — 2026-09-11](owner-setup-20260911.md)（手順）
- [PC出典整理の実処理接続 — C-PC01/C-PC02](pc-citations-adapter.md)（設計）
- [スマホへ書き込むRockstarOSの開発](phone-preview-20260911.md)（設計）
- [RockstarOS platform core v1](platform-core.md)（設計）
- [RockstarOS 1.0 Developer Preview — 最初の導入と復旧](preview-installation-ja.md)（手順）
- [RockstarOS 1.0 Developer Preview — ライセンスと NOTICE](preview-legal-notice.md)（手順）
- [RockstarOS 1.0 Developer Preview — 配布候補の変更点](preview-release-notes.md)（手順）
- [RockstarOS — 製品目的から逆算した開発軸](product-north-star-20260915.md)（設計）
- [Rockの最新進捗からプロンプトを作る規約](prompt-playbook.md)（手順）
- [eSIM・クラウド供給元の契約準備](provider-contract-readiness-20260930.md)（設計）
- [参照元と採用判断](reference-repositories.md)（設計）
- [Draft配布物を取り違えずに取得する](release-artifact-access.md)（手順）
- [RockstarOS 最低公開条件](release-minimum-gates.md)（手順）
- [Protected release signing control](release-signing-operations.md)（手順）
- [設計に使った一次資料](research.md)（監査・記録）
- [Rock First-party Settlement Wallet — 2026-09-13](rock-first-party-settlement-wallet-20260913.md)（設計）
- [Rock Wallet本番受取レール — 2026-09-13](rock-wallet-production-rail-20260913.md)（設計）
- [Rock Wallet — 収益の共通精算口座](rock-wallet-revenue-hub-20260913.md)（設計）
- [RockstarOS device account linking](rockstar-device-link.md)（設計）
- [RockstarOS 1.0 — ベース構成と進化方針](rockstaros-1.0-architecture.md)（設計）
- [RockstarOS 1.0 — 8原則を適用した製品・事業・開発設計](rockstaros-1.0-strategy.md)（設計）
- [RockstarOS 製品・サービス・システム関係図](rockstaros-product-system-map.md)（設計）
- [RockstarOS 緊急アクセスとインシデント対応](security-incident-response.md)（設計）
- [Sky A2A Bridge — agent間委任adapter](sky-a2a-bridge.md)（設計）
- [Sky Assistant / Sky Memory設計](sky-assistant-and-memory.md)（設計）
- [Sky Market決済と旧収益精算](sky-billing.md)（設計）
- [Sky Cloud — 端末切断中の継続実行](sky-cloud-continuity.md)（設計）
- [Sky cloud execution operations and recovery runbook](sky-cloud-operations-runbook.md)（手順）
- [Sky Market 決済・Wallet 統合詳細設計](sky-commerce-design.md)（設計）
- [Sky Compute Grid — 使われていない携帯を束ねるVirtual Compute Plant](sky-compute-grid.md)（設計）
- [Sky CSV・50円の決済試験](sky-csv-trial-payment.md)（手順）
- [Skyの本人確認と1タップ接続](sky-identity-connection.md)（設計）
- [Sky サービス設計とローンチ受入 v1.0](sky-launch-design.md)（設計）
- [Sky ローンチ運用・受入](sky-launch-operations.md)（手順）
- [Sky 日本語法律相談受付 — 実装と安全境界](sky-legal-intake-20260912.md)（設計）
- [Sky Agent Interconnection and MCP接続設計](sky-mcp-architecture.md)（設計）
- [Sky MCP Connector 共通基盤](sky-mcp-connector.md)（設計）
- [Sky MCP導入・利用体験の改善](sky-mcp-usability-20260912.md)（設計）
- [旧Mr. Hub自動化のSky導入設計](sky-mr-automation-candidates.md)（設計）
- [Sky — Toolチームと開発者還元](sky-network-economy.md)（設計）
- [Sky NFCカード — Columbia大学の学生向け入口（設計）](sky-nfc-columbia.md)（設計）
- [Sky 特許出願アシスタント](sky-patent-assistant-20260912.md)（設計）
- [Sky「サブスク顧問」接続 — 2026-09-12](sky-rockstar-ledger-20260912.md)（設計）
- [Skyの役割エージェント仕様 — 2026-09-12](sky-role-agents-20260912.md)（設計）
- [Sky: Stripeセキュリティ申告との対応](sky-security-declaration.md)（設計）
- [Sky Tool SDK / Rock Studio — 自動化をSky商品へする標準導線](sky-tool-sdk.md)（設計）
- [Sky — 自動化を選び、許可し、動かし、止め、結果を受け取る場所](sky.md)（設計）
- [Spider Guard — RockstarOS本体の秘密・個人情報保護](spider-guard.md)（設計）
- [RockstarOS 全体構成監査](system-composition.md)（設計）
- [検証記録](validation.md)（手順）
- [RockstarOS Value/Spend Runtime](value-spend-runtime.md)（設計）
- [Version boundaries](version-boundaries.md)（設計）
- [Wallet 統合詳細設計](wallet-commerce-design.md)（設計）
- [RockstarOS Wallet — 設計・実装 v0.3](wallet-front-design.md)（設計）

## 原本・証拠・削除内容

- [設計台帳](../data/design-document-index.json) — 現行領域、Tool、原本hashと実装参照。
- [OS原本PDF](rockstaros-complete-design-v1.0.pdf)、[R5原本](avocado-mini-r5/README.md)、[rocketstar原本](rocketstar-design/README.md) — 保存原本。各版のDevice Profileを現行受入へ自動適用しない。
- `evidence/` — 対象artifactの検証記録。`templates/` — 受入記録の雛形。
- [削除台帳](../data/archived-paths.json)と[復元手順](git-consolidation.md) — 役目を終えた旧仕様・重複文書・作業ログは現行ツリーへ再掲せずGit履歴から読む。

新しい情報は該当する正本・workstreamへ統合する。不要な重複分冊や日付付き入口を増やさず、移動・削除では参照・索引・検査・復元commitを同時更新する。
