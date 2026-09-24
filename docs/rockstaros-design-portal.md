# RockstarOS 全設計ポータル

版: 1.4 / 2026-09-24

avocadoMiniの現行製品要求は[R5統合基本設計](avocado-mini-r5/README.md)。使用時200mm以内・1本自律・別Hub不要を目指す基本設計で、全空間裸眼表示・最終ハードウェアは未成立/未確定。以下のE1/E2/E3、四方向発明台の資料は履歴または別研究profileとして読み、既存OS実装の受入と混同しない。

このページは、RockstarOS本体、画面、AI、Tool、Wallet、運用、avocadoMiniまで、全設計へ入る唯一の入口である。設計書が多いことを完成とは呼ばない。各systemについて、目的、利用者の操作、責任、入力、出力、状態、権限、保存、失敗、復旧、受入、現在地を説明できることを設計記載の最低条件とする。

## rocketstar 設計書完全版 R1.0と全履歴の保存

[rocketstar設計アーカイブ](rocketstar-design/README.md)を、ロケット、衛星搭載、帰還・回収、地上設備、整備・再使用の設計入口とする。[原本PDF](rocketstar-design/outputs/rocketstar_Complete_Design_R1_0/rocketstar_Complete_Design_R1_0.pdf)は44ページ・35章、60要求、18システムinterfaceを収録する。継承するC3の40設計項目・13衛星interface、旧版、A-LINK受信試作、コロニー運用、端末ボタン、生成元、計算、QA画像も[全ファイル台帳](rocketstar-design/inventory.json)から追跡できる。

利用者の「漏れなく更新保存」という明示依頼に基づく設計アーカイブであり、現行runtime、Tool catalog、サイトへ自動適用しない。ロケットの製造図面・実機性能・飛行認定は未完了。端末のE3／別Hub前提と電源ボタンモデルは当時の設計として保持し、R5の1本自律・別Hub不要という現行要求を変更しない。

## 2026-09-24 完全版 v1.0

[RockstarOS 設計書完全版 v1.0（原本PDF）](rockstaros-complete-design-v1.0.pdf)を、rocketstar、A-LINK、avokado、colonyをまたぐ最新の統合設計基準として保存した。GitHub上で全文検索できる[抽出テキスト](rockstaros-complete-design-v1.0.txt)と、原本SHA-256・ページ数・被覆件数を固定する[完全性記録](../data/rockstaros-complete-design-v1.0.json)を同じ変更で管理する。

完全版は32章、5配備profile、13論理service、OSR-001〜060、43/43の構造・DDL検査を収録する。ただし「完全」は設計の記載範囲を意味し、runtime実装、実機受入、飛行認定、量産承認を意味しない。PDFに記載された旧repo SHAの読取監査も、今回のGitHub最新状態確認へ読み替えない。

今回、[付録を含むOS package](rocketstar-design/outputs/RockstarOS_Complete_Design_v1_0/README.md)も受領した。既存PDFとpackage内PDFのSHA-256は一致し、原本を変更していない。7 schema、SQLite DDL、例、要求台帳、構造検査・再現記録、C0.1参照モデルを保存した。当初PDF単独では未受領だった付属原本の不足は、この受領記録で更新する。付録の検査証拠は運用/実機の完成証拠ではない。

原本PDF p4・17・30のavokado E3は4本＋別Hubを前提とする。OS共通運用・他profileの設計として原本を保持し、このE3配置をR5へ適用しない。R5単独mini用Device Profile・adapterとの統合は未完了。

## 最初に読む8冊

1. [RockstarOS 設計書完全版 v1.0](rockstaros-complete-design-v1.0.pdf) — rocketstar、A-LINK、avokado、colonyを含む2026-09-24統合基準。
2. [製品・サービス・システム関係図](rockstaros-product-system-map.md) — 製品、サービス、内部システム、`Mr.`、MR、収益の関係を一枚で確認する。
3. [RockstarOS全体詳細設計](rockstaros-complete-design.md) — repository実装と既存詳細資料への入口。
4. [Sky／Zema／全Tool詳細設計](sky-tools-complete-design.md) — Toolをどう追加し、12件をどう使い、どこで止めるか。
5. [avocadoMini R5 ハードウェア・OS統合基本設計](avocado-mini-r5/README.md) — 現行製品要求、51ページ、図面、計算、受入計画。既存[Material Invention研究仕様](rockstaros-avocado-mini-complete-design.md)は別profileとして保持する。
6. [製品ベース](product-baseline.md) — 利用者が確定したRQ01〜RQ49と、その後のTool追加判断。
7. [Decision Fabric完成設計](jev-local-qwen-decision-fabric-design.md) — code、Jev、Local Qwen、Cloud LLM、Codex、RAG、Market、Walletを一つの安全境界へ統合する設計。

8. [rocketstar 設計書完全版 R1.0と全付録](rocketstar-design/README.md) — 両段再使用ロケット、A-LINK、OS、コロニー、ボタンの設計原本と計算・検証履歴。

機械可読の被覆台帳は[`data/design-document-index.json`](../data/design-document-index.json)。`npm run design:check`は、利用可能・候補の全Toolが台帳と詳細設計に存在すること、正本へのlinkが存在すること、未決定を完成表示していないことを検査する。

2026-09-21追加: [avocadoMini Mini200 E1](avocado-mini-mini200-e1/README.md)は、使用時20cm・本体内ゲーム処理・日本語音声の新しい基本設計profile。本文、SVG図7枚、算術と入力許可モデルを保存した。従来の四方向研究契約、Pixel/QEMU、Web公開とは別で、実機・実ASR・OS統合は未受入。

同日の最新製品方針は[ゲームを入口に生活全体を豊かにするOS](avocado-mini-mini200-e1/game-first-life-connectivity.md)。ローカル自律動作、生活機器の同意、衛星を含む通信経路と切断復旧を分離し、既存Coreへ接続する設計案として保存する。衛星網の所有や直接受信、生活機器接続は未実装・未受入。

[Jev／TypeSafe + Local Qwen引き継ぎ原文](prompts/jev-typesafe-local-qwen-handoff-20260918.md)を要求の正本として保存し、その内容を[Decision Fabric完成設計](jev-local-qwen-decision-fabric-design.md)へ落とした。DecisionProvider契約と安全policyも機械可読化したが、Router／Harness、TypeSafe接続、Cloud接続、RAG runtimeが実装済みになったわけではない。

製品・サービス・システムの関係、`Mr.` 由来Toolの取り込み境界、MR（Mixed Reality）とMaterial Invention Coreの接続は、[製品・サービス・システム関係図](rockstaros-product-system-map.md)を正本補助設計として参照する。ここでいう`Mr.` は外部repository由来Tool、MRはavocadoMiniのMixed Reality操作を指し、同じものではない。

## 設計の全体地図

詳細な関係図は[製品・サービス・システム関係図](rockstaros-product-system-map.md)に分離している。以下は全体の責任方向だけを示す要約である。

```text
利用者
  ├─ Home ─ SkyでToolを探す ─ Zemaで仕事を進める
  ├─ Wallet / Market / Settings / Operations
  └─ avocadoMini / Material Invention
            │
            ▼
RockstarOS Platform Core
  ├─ ownerとcomponentのidentity
  ├─ capability・権限・本人承認
  ├─ work・step・event・artifact・receipt
  ├─ Local AI・Agent runtime
  ├─ Tool / MCP / Provider実行境界
  ├─ 保存・backup・復旧
  └─ update・rollback・監査・緊急保護
            │
            ▼
実行先
  ├─ 端末内
  ├─ 接続した本人PC
  ├─ Sky Cloud
  └─ 外部Provider
```

## 実装環境を混ぜない

| 環境              | 役割                                                          | 現在の到達点                               | 完成と呼ばないもの                         |
| ----------------- | ------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------ |
| Web / PC          | 現在の製品画面、D1 API、PC Tool、MCP接続                      | 12 ready Toolと主要画面がある              | スマホOS、native sandbox、本番Provider     |
| Linux / QEMU      | native OS契約、署名Tool、更新・復旧、Wallet／Game fixture     | Developer Preview候補の限定受入            | Pixel対応、一般配布、本番鍵                |
| Android APK       | Broker、Shell、固定Tool、Local AI、backup、Operatorの事前検証 | emulatorと所有Pixelの試験署名APKで限定合格 | RockstarOS image、SELinux最終形、正式署名  |
| Pixel 10 OS image | 最初の物理RockstarOS対象                                      | sourceとbuild gateを設計・準備             | full build、flash、CTS/VTS、OTA、純正復旧  |
| avocadoMini       | Material Inventionの標準操作端末                              | 統合設計とsandbox Core                     | XR runtime、四方向実機、新材料、特許、量産 |

## 詳細設計の正本

| 領域                       | 説明の入口                                                                                                                                                         | 契約・機械可読正本                                                                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 製品目的・要求             | [製品ベース](product-baseline.md)                                                                                                                                  | [`data/product-baseline.json`](../data/product-baseline.json)                                                                                      |
| 全体構成                   | [全体詳細設計](rockstaros-complete-design.md)                                                                                                                      | [`data/system-composition-audit.json`](../data/system-composition-audit.json)                                                                      |
| AIネイティブCore           | [AIネイティブOS共通設計](ai-native-os-architecture.md)・[Decision Fabric完成設計](jev-local-qwen-decision-fabric-design.md)                                        | [`contracts/local-ai-runtime.json`](../contracts/local-ai-runtime.json)・[`contracts/decision-provider.json`](../contracts/decision-provider.json) |
| Android / Pixel            | [Android production architecture](android-production-architecture.md)                                                                                              | [`data/android-release-architecture-policy.json`](../data/android-release-architecture-policy.json)                                                |
| Linux / QEMU               | [native OS統合](native-os-integration.md)                                                                                                                          | [`data/qemu-release-audit.json`](../data/qemu-release-audit.json)                                                                                  |
| Platform API               | [Platform Core](platform-core.md)                                                                                                                                  | [`contracts/platform-api.json`](../contracts/platform-api.json)                                                                                    |
| Sky / Zema / Tool          | [全Tool詳細設計](sky-tools-complete-design.md)・[Jev ecosystem設計](jev-ecosystem-integration-design.md)・[Jev Ultrafast設計](jev-ultrafast-integration-design.md) | `lib/catalog.ts`とTool Package契約                                                                                                                 |
| MCP                        | [MCP Connector](sky-mcp-connector.md)                                                                                                                              | `toolkits/sky-mcp-connector/registry.schema.json`                                                                                                  |
| 保存・DB                   | [保存境界](data-storage-boundaries.md)                                                                                                                             | `db/schema.ts`と各migration                                                                                                                        |
| Wallet / Provider          | [外部Provider境界](external-wallet-fund-provider-boundary-20260913.md)                                                                                             | Earning Receipt、Financial Provider実装                                                                                                            |
| Security / Operator        | [インシデント対応](security-incident-response.md)                                                                                                                  | [`data/device-emergency-access-policy.json`](../data/device-emergency-access-policy.json)                                                          |
| Update / Backup / Recovery | [backup・復旧](android-backup-recovery.md)                                                                                                                         | 各Android release policy JSON                                                                                                                      |
| Game / IP                  | [Game API](game-api-contract-draft.md)                                                                                                                             | GX00／GX01契約とSDK                                                                                                                                |
| Material Invention         | [見て分かる完成設計](rockstaros-avocado-mini-complete-design.md)・[Full-scaleハードウェア詳細設計](avocado-mini-hardware-design.md)                                  | 3つのMaterial JSON SchemaとXR policy                                                                                                               |
| 検証・release              | [release minimum gates](release-minimum-gates.md)                                                                                                                  | [`data/release-readiness.json`](../data/release-readiness.json)                                                                                    |

## 「詳細設計済み」の意味

次の11項目が書かれて初めて、その領域を詳細設計済みとする。

1. 誰の何の問題を解くか。
2. 利用者が最初から最後まで何をするか。
3. componentごとの責任と、持ってはいけない権限。
4. 入力・出力・識別子・版・上限。
5. 正常状態と異常状態の遷移。
6. 保存場所、保存しないもの、削除・保持・backup。
7. offline、通信断、再送、重複、結果不明の扱い。
8. 更新、互換、rollback、復旧。
9. 安全、privacy、security、外部作用の承認。
10. 合格条件と証拠環境。
11. 未決定事項、決定者、決定に必要な試験。

未決定があること自体は設計漏れではない。未決定を隠すこと、または決定方法がないことを設計漏れとする。

## 変更規則

- 新しいOS componentまたはToolを追加するときは、機械可読台帳と対応詳細設計を同じ変更で追加する。
- Web、QEMU、APK、OS image、実機、sandbox、本番を別の状態で記録する。
- 「動く」「対応」「安全」「完成」は、環境と証拠を併記しない限り使用しない。
- 日付付き調査資料を新しい入口にせず、このポータルの正本表から辿れるようにする。
- 実装と文書が違う場合は、実装を完成扱いせず差分を進捗taskへ登録する。
