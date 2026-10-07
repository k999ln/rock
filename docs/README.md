# docs/ の地図 — どこに何があるか

作成: 2026-10-07 ／ 対象: `docs/` 直下の185文書と16フォルダ

`docs/` には設計書・記録・証拠が約2,100ファイルあります。このページは **その全部を分類した地図** です。直下の文書は1つ残らず下の表のどこか1か所に載っています。

> ファイルは動かしていません。`docs/` の文書は、進捗台帳・検証スクリプト・受入証拠から **パスとSHA-256で参照** されています（直下のMarkdown 180本のうち142本がスクリプトや台帳のJSONからパスで参照され、そのうち約50本はSHA-256と一緒に記録）。場所を変えると過去の証拠と照合できなくなります。そのため、置き場所はそのままにして、この地図で意味を付けています。

**目次**

1. [まず読む5つ](#1-まず読む5つ)
2. [入口はこの順番](#2-入口はこの順番)
3. [知りたいことから探す](#3-知りたいことから探す)
4. [文書の種類の見分け方](#4-文書の種類の見分け方)
5. [分野別の全文書](#5-分野別の全文書)
6. [フォルダ一覧](#6-フォルダ一覧)
7. [文書を足すとき・直すときのルール](#7-文書を足すとき直すときのルール)

---

## 1. まず読む5つ

| 順 | 文書 | これで分かること | 読む時間 |
| ---: | --- | --- | --- |
| 1 | [README](../README.md) | これは何か、何を作っていて、今どこまで出来ているか | 5分 |
| 2 | [仕様変遷](spec-history.md) | いつ、何が、何から何へ変わったか。いま有効な仕様の一覧 | 10分 |
| 3 | [エージェント・Tool総覧](agents-and-tools.md) | Skyの35 Tool、役割エージェント、クラウドのAgent、32部隊のそれぞれの機能 | 10分 |
| 4 | [製品ベース](product-baseline.md) | 確定要望 RQ01〜RQ49 の全文。仕様で迷ったときの最終的なよりどころ | 必要な箇所だけ |
| 5 | [全設計ポータル](rockstaros-design-portal.md) | 領域ごとの詳細設計書への入口 | 必要な箇所だけ |

---

## 2. 入口はこの順番

これまで「ここが入口」と書かれた文書が複数ありました。役割は次のとおり1本につながります。**上から下へ** 読めば迷いません。

```text
README.md ─────────────── これは何か（表玄関・英語）
   │
   └─ docs/README.md ───── どこに何があるか（この地図）
         │
         ├─ 何を作るか ──── product-baseline.md（要望の正本）
         │                  └ spec-history.md（その変遷を読む索引）
         │
         ├─ どう作るか ──── rockstaros-design-portal.md（設計書の入口）
         │                  └ agents-and-tools.md（Tool・エージェントの一覧）
         │
         ├─ どこにあるか ── ../PROJECTS.md（製品・実装単位 → ソースの場所）
         │
         ├─ 誰がやるか ──── mission-control.md（5師団32部隊）
         │                  └ workstreams/README.md（作業分野ごとの入口）
         │
         └─ どこまで出来たか ─ ../project.md（日付順の作業ログと全task表）
                               └ evidence/（受入証拠）
```

| 文書 | 役割 | 役割ではないもの |
| --- | --- | --- |
| [README](../README.md) | 表玄関。製品の説明と現在地 | 進捗の詳細、設計の全文 |
| この地図 | 文書の場所と分類 | 仕様そのもの |
| [製品ベース](product-baseline.md) | 利用者が確定した要望の正本 | 実装状況の証明 |
| [仕様変遷](spec-history.md) | 要望の変遷を読みやすく並べた索引 | 正本（製品ベースが優先） |
| [全設計ポータル](rockstaros-design-portal.md) | 設計書の入口と「詳細設計済み」の条件 | 進捗 |
| [PROJECTS.md](../PROJECTS.md) | 製品・実装単位からソースの場所を探す | 仕様 |
| [Mission Control](mission-control.md) | 部隊の担当、段階、次のタスク | task個別の状態（`project.md`が正本） |
| [workstreams/](workstreams/README.md) | 作業分野ごとの対象・完了条件・検証コマンド | 設計の全文 |
| [project.md](../project.md) | 日付順の作業ログ＋全taskの状態表（自動生成） | 仕様 |
| [AGENTS.md](../AGENTS.md) | AI開発エージェントが作業するときのルール | 人向けの説明 |
| [CHECKPOINT.md](../CHECKPOINT.md) | 2026-09-09〜12のローンチ準備の作業履歴 | 現在の入口（09-12で止まっている） |

---

## 3. 知りたいことから探す

| 知りたいこと | 開く文書 |
| --- | --- |
| 結局いまの主商品は何？ | [仕様変遷 §2](spec-history.md#2-いま有効な仕様2026-10-06時点) → [SIM/eSIM-led architecture](sim-led-product-architecture.md) |
| この仕様はいつ決まった？ 前は何だった？ | [仕様変遷 §3・§5](spec-history.md#3-テーマ別何から何へ変わったか) |
| ある日に何を決めて何を作った？ | [仕様変遷 §4](spec-history.md#4-日付順の全記録) → くわしくは [project.md](../project.md) |
| RQ○○の原文を読みたい | [製品ベース](product-baseline.md) |
| Toolは何がある？ それぞれ何をする？ | [エージェント・Tool総覧 §2](agents-and-tools.md#2-skyのtool-35件) |
| あるToolの入出力・保存・禁止事項 | [全Tool詳細設計](sky-tools-complete-design.md) |
| 「エージェント」とは何を指す？ | [エージェント・Tool総覧 §1](agents-and-tools.md#1-まず用語エージェントは5種類ある) |
| Sky・Zema・Walletの違い | [Sky](sky.md) / [製品・サービス・システム関係図](rockstaros-product-system-map.md) |
| 料金・手数料はどうなっている？ | [仕様変遷 §3.3](spec-history.md#33-料金手数料) → [Sky経済設計](sky-network-economy.md) / [決済](sky-billing.md) |
| クラウドのAgentはどう動く？ | [Sky Cloud継続実行](sky-cloud-continuity.md) / [A2A Bridge](sky-a2a-bridge.md) |
| SIM/eSIMを買ってから使えるまで | [SIM/eSIM-led architecture](sim-led-product-architecture.md) / [利用権claim](sim-service-entitlement-claims.md) |
| avocadoMiniの現行設計 | [R5統合基本設計](avocado-mini-r5/README.md) |
| avocadoMiniの昔の形 | [仕様変遷 §3.5](spec-history.md#35-avocadominiの形) → [E3](avocado-mini-tower20-e3/README.md) / [E2](avocado-mini-mini200-e2/README.md) / [E1](avocado-mini-mini200-e1/README.md) |
| avokadoProの設計 | [avokadoPro PC設計](avokado-pro-pc-design.md) |
| rocketstarの設計 | [rocketstar設計アーカイブ](rocketstar-design/README.md) |
| OS全体の設計 | [全設計ポータル](rockstaros-design-portal.md) → [OS全体詳細設計](rockstaros-complete-design.md) / [設計書完全版 v1.0 PDF](rockstaros-complete-design-v1.0.pdf) |
| LLMは何をどこで使っている？ | [エージェント・Tool総覧 §7](agents-and-tools.md#7-llmモデルの役割) → [LLM・評価モデル設計](llm-evaluation-architecture.md) |
| Pixel実機はどこまで進んだ？ | [端末preview](phone-preview-20260911.md) / [初回flash gate](android-first-flash-gate-20260916.md) |
| 公開してよい条件は？ | [最低公開条件](release-minimum-gates.md) |
| セキュリティの仕組みは？ | [Spider Guard](spider-guard.md) / [緊急アクセスとインシデント対応](security-incident-response.md) |
| 誰が何を担当している？ | [Mission Control](mission-control.md) / [エージェント・Tool総覧 §8](agents-and-tools.md#8-開発を進めるエージェントamc) |
| ソースコードはどこ？ | [PROJECTS.md](../PROJECTS.md) |
| 試験結果の証拠は？ | [evidence/](evidence/) （各文書の「証拠」リンクから辿る） |
| Gitに何を入れてよい？ | [Repository storage policy](git-consolidation.md#repository-storage-policy) |

---

## 4. 文書の種類の見分け方

下の表の「種類」は次の意味です。**同じテーマで複数あるときは、正本 → 設計 → 記録 の順に信頼します。**

| 種類 | 意味 | 件数 |
| --- | --- | ---: |
| **正本** | いま有効な内容。他の文書と食い違ったらこちらが優先 | 26 |
| **設計** | 設計書。内容は有効だが、実装・受入が済んでいるとは限らない | 56 |
| **手順** | 操作手順・運用手順・規約 | 13 |
| **監査** | ある時点で設計・実装・証拠を照合した結果 | 10 |
| **記録** | その日の作業・試験・判断の記録。書かれた時点の事実で、いまの状態ではない | 62 |
| **履歴** | 上書きされた古い方針・古い「現在地」。経緯を知るために残している | 14 |
| **原本** | 受け取った成果物そのもの（PDFなど）。内容を変えない | 2 |
| **索引** | 他の正本を読みやすく並べ直したもの（この整理で追加） | 2 |

ファイル名からも分かります。

- **`-20260910` のように日付が付く** → その日の記録。「現在」「次」と書いてあっても、その日の時点の話
- **`complete-design`・`architecture`・`design` が付く** → 設計書
- **`.ja.md`** → 日本語であることを明示した文書（CSV関連）
- **`gx00-`・`gx01-`** → Gameの接続契約（GX00）と合成交換（GX01）
- **`os-acceptance-<SHA>-<日付>`** → そのcommitのOS候補に対する受入報告

「完全」「完成」は **設計の記載範囲** を指します。実装・実機・本番が終わったという意味ではありません。

---

## 5. 分野別の全文書

### A. 製品の要望・方針・変遷

「何を作るのか、なぜか、どう変わってきたか」。迷ったらここから。

| 文書 | 種類 | 何が書いてあるか | 最終更新 |
| --- | --- | --- | --- |
| [`product-baseline.md`](product-baseline.md) | 正本 | 確定要望 RQ01〜RQ49 と、日付付きの方針判断・変更記録。仕様の最終的なよりどころ | 10-07 |
| [`spec-history.md`](spec-history.md) | 索引 | 仕様変遷。いつ・何が・何から何へ変わったかを日付順とテーマ別に並べ直したもの | 10-07 |
| [`sim-led-product-architecture.md`](sim-led-product-architecture.md) | 正本 | 現行の主商品（SIM/eSIMを入口にしたサービス）の定義、利用開始の流れ、実行と料金の契約 | 10-06 |
| [`sim-service-entitlement-claims.md`](sim-service-entitlement-claims.md) | 設計 | SIM/eSIMの購入をRockstarアカウントの利用権へ結び付ける署名付きclaimの仕様 | 10-05 |
| [`provider-contract-readiness-20260930.md`](provider-contract-readiness-20260930.md) | 記録 | eSIM・クラウド供給元の公開資料比較と契約前の準備（契約・問い合わせは未実施） | 10-05 |
| [`product-north-star-20260915.md`](product-north-star-20260915.md) | 正本 | 最上位目的（AI自動化チームの所有と効率化）から逆算した開発軸。RQ47の補助資料 | 10-05 |
| [`rockstaros-1.0-strategy.md`](rockstaros-1.0-strategy.md) | 設計 | 8原則を適用した製品・事業・開発設計。対象市場や代表商品は検証仮説 | 10-05 |
| [`rockstaros-1.0-architecture.md`](rockstaros-1.0-architecture.md) | 設計 | RockstarOS 1.0 のベース構成と、各systemの現在地・進化方針 | 10-05 |
| [`rockstaros-product-system-map.md`](rockstaros-product-system-map.md) | 設計 | 製品・サービス・内部システム・`Mr.`・MRの関係図。v1.1（2026-10-02）でSIM/eSIM起点の主商品に合わせてある | 10-07 |
| [`execution-approval-20260909.md`](execution-approval-20260909.md) | 記録 | 設計v1.1の実装承認と、条件付きの公開・実機・実資金の了承範囲 | 09-09 |
| [`product.md`](product.md) | 履歴 | Rock star の初期仕様（2026-09-04） | 09-12 |
| [`market-exploration-20260909.md`](market-exploration-20260909.md) | 記録 | ゲーム資産市場・予測市場の検討メモ（未承認の検討事項） | 09-09 |
| [`version-boundaries.md`](version-boundaries.md) | 設計 | 製品版・API版・schema版の境界と、版番号の付け方 | 09-17 |

### B. OS全体・Platform Core

RockstarOS本体の設計。全設計ポータルが設計書の入口。

| 文書 | 種類 | 何が書いてあるか | 最終更新 |
| --- | --- | --- | --- |
| [`rockstaros-design-portal.md`](rockstaros-design-portal.md) | 正本 | 全設計ポータル。領域ごとの設計書と機械可読の正本への入口、「詳細設計済み」の11条件 | 09-29 |
| [`rockstaros-complete-design.md`](rockstaros-complete-design.md) | 正本 | OS全体詳細設計。repositoryの実装と既存の詳細資料への対応 | 10-07 |
| [`rockstaros-complete-design-v1.0.pdf`](rockstaros-complete-design-v1.0.pdf) | 原本 | RockstarOS 設計書完全版 v1.0（41ページ・32章）の原本PDF | 09-24 |
| [`rockstaros-complete-design-v1.0.txt`](rockstaros-complete-design-v1.0.txt) | 原本 | 同PDFの全文検索用の抽出テキスト | 09-24 |
| [`ai-native-os-architecture.md`](ai-native-os-architecture.md) | 正本 | AIネイティブOSの共通設計。交換可能なLLM、記憶、仕事、offlineと外部作用の境界（RQ48） | 10-05 |
| [`ai-native-os-design-audit.md`](ai-native-os-design-audit.md) | 監査 | 同設計のSolによる独立監査。設計上の解消と実装・受入待ちの区別 | 09-20 |
| [`platform-core.md`](platform-core.md) | 設計 | Platform Core v1。Tool／MCP／Providerの登録、承認、Wallet台帳、更新・rollback（RQ42） | 10-05 |
| [`system-composition.md`](system-composition.md) | 監査 | 全体構成監査。12層・7経路の選択と接続状態 | 09-19 |
| [`data-storage-boundaries.md`](data-storage-boundaries.md) | 設計 | データの保存場所の境界と、重複の整理 | 09-15 |
| [`database-status.md`](database-status.md) | 正本 | DBのtable・migration・配備の現在の状態（`npm run database:status` で生成） | 10-06 |
| [`device-support-architecture.md`](device-support-architecture.md) | 設計 | 多機種対応。共通Core＋機種別Device Support Package、提供区分 | 09-15 |
| [`rockstar-device-link.md`](rockstar-device-link.md) | 設計 | 端末とRockstarアカウントの結び付け（Device Authorization） | 10-05 |
| [`os-development-design.md`](os-development-design.md) | 履歴 | Rock star OS — 自動化OS開発設計書（AOSP構想の原点、2026-09-05〜） | 10-05 |
| [`os-sky-wallet-game-design.md`](os-sky-wallet-game-design.md) | 履歴 | OS・Sky・Wallet・Gameの確認用設計書（2026-09-09の承認対象） | 09-12 |
| [`architecture.md`](architecture.md) | 履歴 | 初期Webの実装と次の接続点（2026-09-04） | 09-12 |
| [`backend-design.md`](backend-design.md) | 履歴 | LOOP バックエンド設計（2026-09-05） | 09-05 |
| [`deployment-integration.md`](deployment-integration.md) | 履歴 | 配信先（Sites）との統合設計（2026-09-05、承認待ちのまま） | 09-05 |

### C. AI・LLM・Agent

モデルの役割、判断基盤、記憶、エージェント。

| 文書 | 種類 | 何が書いてあるか | 最終更新 |
| --- | --- | --- | --- |
| [`agents-and-tools.md`](agents-and-tools.md) | 索引 | エージェント・Tool総覧。Skyの35 Tool、役割エージェント、OS内・クラウドのAgent、AMCの32部隊を機能つきで一覧 | 10-07 |
| [`llm-evaluation-architecture.md`](llm-evaluation-architecture.md) | 正本 | LLMと評価モデルの現在地。local planner／OpenAIの2 Tool／Jevの境界 | 10-05 |
| [`jev-local-qwen-decision-fabric-design.md`](jev-local-qwen-decision-fabric-design.md) | 設計 | Decision Fabric完成設計。code・Jev・Local Qwen・Cloud LLM・RAG・Market・Walletを一つの判断基盤へ | 10-07 |
| [`jev-ecosystem-integration-design.md`](jev-ecosystem-integration-design.md) | 設計 | Jev ecosystem 10件を役割別にSkyへ入れる全体詳細設計 | 09-19 |
| [`jev-ultrafast-integration-design.md`](jev-ultrafast-integration-design.md) | 設計 | Jev Ultrafast（選択型browser agent）の統合設計 | 09-19 |
| [`local-ai-os-integration-20260915.md`](local-ai-os-integration-20260915.md) | 設計 | Local Action Assistantを物理Android版のローカルLLMとして導入する設計と証拠（RQ41） | 10-05 |
| [`local-llm-connection-audit-20260920.md`](local-llm-connection-audit-20260920.md) | 監査 | ローカルLLM接続の監査（2026-09-20） | 09-27 |
| [`ai-memory-architecture.md`](ai-memory-architecture.md) | 設計 | 正本の記憶とモデルごとの投影（canonical memory and model projections） | 10-05 |
| [`sky-assistant-and-memory.md`](sky-assistant-and-memory.md) | 設計 | Sky AssistantとSky Memory。一つの入口と、アプリを毎回入れない仕組み | 09-29 |
| [`agent-control-plane.md`](agent-control-plane.md) | 設計 | Agent Control Plane v1。開発作業をCursor Cloud Agentへ委任する境界（dry-runのみ） | 10-05 |
| [`avokado-llm-pretraining.md`](avokado-llm-pretraining.md) | 設計 | avokado専用モデルの事前学習・配布設計 | 10-05 |

### D. Sky・Zema・Tool・MCP

Toolを探す・つなぐ・動かす側の設計。

| 文書 | 種類 | 何が書いてあるか | 最終更新 |
| --- | --- | --- | --- |
| [`sky.md`](sky.md) | 正本 | Skyとは何か。役割、提供形態、Zemaとの連携、接続情報の登録、現在のTool（ready 13・候補22のID付き表）、Telegramからの有効化、利用時の注意と復旧 | 10-07 |
| [`sky-tools-complete-design.md`](sky-tools-complete-design.md) | 正本 | Sky／Zema／全Tool詳細設計。共通Tool契約と各Toolの入出力・保存・禁止・完了条件 | 10-07 |
| [`sky-tool-sdk.md`](sky-tool-sdk.md) | 設計 | Sky Tool SDK／Rock Studio。既存ツールにコードを足してSkyの商品にする導線（RQ37） | 10-03 |
| [`sky-mcp-architecture.md`](sky-mcp-architecture.md) | 設計 | Agent間接続とMCP接続設計。Capability Router、料金と直接実行の境界、適合とGTA | 10-05 |
| [`sky-mcp-connector.md`](sky-mcp-connector.md) | 設計 | MCP Connector共通基盤。`servers → connect → prepare → execute`（RQ25） | 10-05 |
| [`sky-mcp-usability-20260912.md`](sky-mcp-usability-20260912.md) | 記録 | MCP導入・利用体験の改善記録 | 09-12 |
| [`sky-identity-connection.md`](sky-identity-connection.md) | 設計 | Skyの本人確認と1タップ接続 | 09-12 |
| [`sky-role-agents-20260912.md`](sky-role-agents-20260912.md) | 設計 | Skyの役割エージェント（担当）の仕様と会話契約 | 09-12 |
| [`sky-network-economy.md`](sky-network-economy.md) | 正本 | Toolチームと開発者還元。Sky Market手数料10%と、過去の貢献・還元設計 | 09-29 |
| [`sky-mr-automation-candidates.md`](sky-mr-automation-candidates.md) | 設計 | 旧 `Mr.` Hubの自動化11件をSkyの導入候補にする設計 | 09-20 |
| [`mr-integration.md`](mr-integration.md) | 設計 | `Mr.` からの取り込み範囲、固定原本とhash、license | 10-03 |
| [`pc-citations-adapter.md`](pc-citations-adapter.md) | 設計 | PC出典整理の実処理接続（固定CLI、上限、cleanup） | 10-02 |
| [`citation-remote-preview-20260910.md`](citation-remote-preview-20260910.md) | 記録 | 引用整理の開発用遠隔実行 | 09-10 |
| [`chat-mcp-control-room-20260913.md`](chat-mcp-control-room-20260913.md) | 記録 | Chat（現Zema）のMCP botコントロールルーム | 09-13 |
| [`chat-usability-20260912.md`](chat-usability-20260912.md) | 記録 | Chat（現Zema）の操作性改善 | 09-13 |
| [`hub-onboarding-20260910.md`](hub-onboarding-20260910.md) | 記録 | Hub（現Sky）の初回利用と保存結果の改善 | 09-10 |
| [`frontend-usability-audit-20260915.md`](frontend-usability-audit-20260915.md) | 監査 | フロントの機能性監査（RQ40） | 09-15 |
| [`instagram-photo-onboarding-20260912.md`](instagram-photo-onboarding-20260912.md) | 記録 | Instagram写真によるオンボーディング | 09-15 |
| [`sky-launch-design.md`](sky-launch-design.md) | 設計 | Skyサービス設計とローンチ受入 v1.0 | 10-05 |
| [`sky-launch-operations.md`](sky-launch-operations.md) | 手順 | Skyのローンチ運用・受入 | 10-05 |
| [`campus-layer.md`](campus-layer.md) | 正本 | Campusレイヤー。大学ごとの発見・共同作業の入口、所属表示とprivacyの境界 | 10-05 |

### E. クラウド実行・Agent間委任

端末が圏外でも続くクラウド側の仕組み。

| 文書 | 種類 | 何が書いてあるか | 最終更新 |
| --- | --- | --- | --- |
| [`sky-cloud-continuity.md`](sky-cloud-continuity.md) | 正本 | 端末切断中の継続実行契約。受付時に固定する条件、停止と費用、再接続 | 10-05 |
| [`sky-cloud-operations-runbook.md`](sky-cloud-operations-runbook.md) | 手順 | クラウド実行の運用・停止・復旧手順 | 10-05 |
| [`sky-a2a-bridge.md`](sky-a2a-bridge.md) | 設計 | A2A Bridge。Agent間の委任adapter、Broker承認証明、共通予算、上限 | 10-05 |
| [`a2a-pricing-extension.md`](a2a-pricing-extension.md) | 設計 | A2Aのクラウド Agent価格見積拡張（契約準備） | 10-05 |
| [`cloud-agent-provider-comparison-20261001.md`](cloud-agent-provider-comparison-20261001.md) | 記録 | クラウドAgentのruntime・orchestration供給元の比較 | 10-05 |

### F. 個別Tool・事業pilot

実際に売る・使うToolごとの資料。

| 文書 | 種類 | 何が書いてあるか | 最終更新 |
| --- | --- | --- | --- |
| [`csv-business-v1.ja.md`](csv-business-v1.ja.md) | 正本 | CSV仕事 v1。商品・実装・運用の正本 | 10-05 |
| [`csv-business-security.ja.md`](csv-business-security.ja.md) | 手順 | CSV仕事のセキュリティ・プライバシー運用 | 09-15 |
| [`csv-business-market-evidence-20260915.ja.md`](csv-business-market-evidence-20260915.ja.md) | 記録 | CSV仕事の市場確認記録 | 09-15 |
| [`sky-csv-trial-payment.md`](sky-csv-trial-payment.md) | 記録 | Sky CSV・50円の決済試験 | 10-05 |
| [`mercari-revenue-loop.md`](mercari-revenue-loop.md) | 正本 | メルカリ収益ループ。個人メルカリとShopsの扱い、収益検証（RQ28） | 09-24 |
| [`fashion-brand-ops-integration.md`](fashion-brand-ops-integration.md) | 設計 | Instagram運用・受注型ブランド管理のSky統合（RQ19） | 10-02 |
| [`sky-legal-intake-20260912.md`](sky-legal-intake-20260912.md) | 設計 | 日本語法律相談受付の実装と安全境界 | 09-12 |
| [`sky-patent-assistant-20260912.md`](sky-patent-assistant-20260912.md) | 設計 | 特許出願アシスタント | 09-12 |
| [`sky-rockstar-ledger-20260912.md`](sky-rockstar-ledger-20260912.md) | 設計 | 「サブスク顧問」の接続 | 09-12 |

### G. Wallet・決済・Market・Fund

お金の流れ。費用、確認済み収益、決済、市場、ファンド。

| 文書 | 種類 | 何が書いてあるか | 最終更新 |
| --- | --- | --- | --- |
| [`sky-billing.md`](sky-billing.md) | 正本 | Sky Market決済（Stripe）と旧収益精算。API、導入手順、返金、受入条件 | 10-05 |
| [`sky-commerce-design.md`](sky-commerce-design.md) | 設計 | Sky Market 決済・Wallet 統合詳細設計 | 10-05 |
| [`wallet-commerce-design.md`](wallet-commerce-design.md) | 設計 | Wallet 統合詳細設計 | 10-05 |
| [`sky-security-declaration.md`](sky-security-declaration.md) | 記録 | Stripeのセキュリティ申告との対応 | 10-05 |
| [`wallet-front-design.md`](wallet-front-design.md) | 設計 | Wallet画面の設計・実装 v0.3 | 09-13 |
| [`external-wallet-fund-provider-boundary-20260913.md`](external-wallet-fund-provider-boundary-20260913.md) | 正本 | 外部Wallet／ファンドProviderを受け入れるOS境界（RQ34） | 09-13 |
| [`rock-first-party-settlement-wallet-20260913.md`](rock-first-party-settlement-wallet-20260913.md) | 設計 | Rock自身のSettlement Walletを最初のProviderにする（RQ35） | 09-14 |
| [`rock-wallet-production-rail-20260913.md`](rock-wallet-production-rail-20260913.md) | 設計 | Base Mainnet USDCの本番受取レール（RQ36） | 09-14 |
| [`rock-wallet-revenue-hub-20260913.md`](rock-wallet-revenue-hub-20260913.md) | 記録 | Rock Wallet — 収益の共通精算口座 | 09-13 |
| [`everything-market-and-autonomous-fund-20260913.md`](everything-market-and-autonomous-fund-20260913.md) | 設計 | 汎用PAPER市場（Market）と自律型ファンド（RQ33） | 09-15 |
| [`markets-fund-integration-20260913.md`](markets-fund-integration-20260913.md) | 記録 | Marketsと自動化ファンドの統合 | 09-13 |
| [`polymarket-bot-sandbox-20260913.md`](polymarket-bot-sandbox-20260913.md) | 記録 | Polymarket bot sandbox（backtest専用）の境界 | 09-13 |
| [`value-spend-runtime.md`](value-spend-runtime.md) | 設計 | Value/Spend Runtime（nativeのPAPER予約・実行・再照合） | 10-05 |
| [`value-spend-runtime-audit-20260912.md`](value-spend-runtime-audit-20260912.md) | 監査 | Value/Spend Runtime 着手監査 | 09-13 |
| [`fund-and-mcp.md`](fund-and-mcp.md) | 履歴 | Rock starファンドとワンボタン実行（2026-09-04の初期設計） | 09-12 |
| [`b03-synthetic-hub-wallet-adapter.md`](b03-synthetic-hub-wallet-adapter.md) | 設計 | 合成 Hub↔Wallet adapter 設計（B03 段1〜2） | 09-12 |
| [`hub-wallet-pc-comparison-20260909.md`](hub-wallet-pc-comparison-20260909.md) | 記録 | PCで同じ成果を出す場合との限定比較（B05） | 09-09 |

関連フォルダ：[`contracts/`](contracts/)（3ファイル）／[`design-validation/`](design-validation/)（5ファイル）

### H. Game

ゲーム接続、作者SDK、ゲーム通貨とWalletの交換（RQ13・RQ14）。

| 文書 | 種類 | 何が書いてあるか | 最終更新 |
| --- | --- | --- | --- |
| [`game-api-contract-draft.md`](game-api-contract-draft.md) | 設計 | 合成ゲームAPI契約の設計草案 0.2 | 09-12 |
| [`gx01-contract-implementation-plan.md`](gx01-contract-implementation-plan.md) | 設計 | GX01：既存Walletに接続する合成交換の実装準備 | 09-09 |
| [`gx01-reference-sdk-sandbox-20260910.md`](gx01-reference-sdk-sandbox-20260910.md) | 記録 | GX01 参照SDKと空の公開sandbox | 09-10 |
| [`gx01-dx01-acceptance-20260910.md`](gx01-dx01-acceptance-20260910.md) | 記録 | GX01／DX01の合成受入matrix | 09-10 |
| [`gx01-native-ui-20260910.md`](gx01-native-ui-20260910.md) | 記録 | Gameのnative入口と所有者境界 | 09-10 |
| [`gx01-ui-wire-20260910.md`](gx01-ui-wire-20260910.md) | 記録 | GX01 UI／Platformの境界契約 | 09-10 |
| [`gx01-current-copy-sdk-recovery-20260910.md`](gx01-current-copy-sdk-recovery-20260910.md) | 記録 | Gameのcurrent-copy復旧と実processの中断 | 09-10 |
| [`gx00-connection-wire-v1.md`](gx00-connection-wire-v1.md) | 設計 | GX00 接続契約1（schema・署名単位） | 09-09 |
| [`gx00-connections-runtime.md`](gx00-connections-runtime.md) | 記録 | GX00 接続の限定host実装 | 09-09 |
| [`gx00-current-game-restore.md`](gx00-current-game-restore.md) | 記録 | GX00 current-copyのゲーム引継ぎ（host runtimeのみ） | 09-09 |
| [`gx00-legacy-game-basis.md`](gx00-legacy-game-basis.md) | 記録 | GX00 非空legacyと接続の共通fixture | 09-09 |
| [`gx00-owner-connection-client.md`](gx00-owner-connection-client.md) | 記録 | GX00 owner接続要求の保存と復旧 | 09-09 |
| [`gx00-owner-isolation-adr.md`](gx00-owner-isolation-adr.md) | 設計 | GX00 ADR案：1契約1台帳を維持した認証付き複数ownerの接続 | 09-09 |
| [`game-connection-node-wire-20260909.md`](game-connection-node-wire-20260909.md) | 記録 | 合成ゲーム接続v1のNode.jsによる独立wire検証 | 09-09 |
| [`game-authority-ui-retention-20260910.md`](game-authority-ui-retention-20260910.md) | 記録 | Game UIの読取り保持 | 09-10 |
| [`game-wallet-release-checkpoint-20260910.md`](game-wallet-release-checkpoint-20260910.md) | 記録 | Game／Wallet／SDKの2026-09-10作業記録 | 09-10 |
| [`mini-game-client.md`](mini-game-client.md) | 設計 | MiniからGTA VIを遊ぶための接続（公式Remote Playへのhandoff） | 10-05 |

### I. Android・Pixel

最初の実機（Pixel 10 GL066）とAndroid版。

| 文書 | 種類 | 何が書いてあるか | 最終更新 |
| --- | --- | --- | --- |
| [`phone-preview-20260911.md`](phone-preview-20260911.md) | 正本 | スマホへ書き込むRockstarOSの開発。対象機種、build入口、実機受入の現在地 | 10-06 |
| [`android-production-architecture.md`](android-production-architecture.md) | 設計 | Android 1.0 production architecture（7決定と権限分離） | 09-17 |
| [`android-first-flash-gate-20260916.md`](android-first-flash-gate-20260916.md) | 正本 | 初回flash前に固定する4つのgate | 09-17 |
| [`android-backup-recovery.md`](android-backup-recovery.md) | 設計 | Androidのバックアップと全損復元（backup v2） | 09-17 |
| [`android-google-stock-recovery.md`](android-google-stock-recovery.md) | 手順 | Google純正への復旧セット | 09-17 |
| [`android-production-signing-custody.md`](android-production-signing-custody.md) | 設計 | Android正式署名鍵の保管方針 | 09-17 |
| [`android-rollback-index-policy.md`](android-rollback-index-policy.md) | 設計 | AVB rollback indexの運用 | 09-17 |
| [`android-and-personal-number-gates-20260913.md`](android-and-personal-number-gates-20260913.md) | 監査 | Android実機の5 gateとマイナンバー連携の7 gate | 09-16 |
| [`android-trial.md`](android-trial.md) | 手順 | Rock Android P1 — Pixel 10でのアプリ試験 | 10-05 |
| [`os-prototype.md`](os-prototype.md) | 手順 | Rock star OS — P1実装と検証手順（SQLite／SDK／APK／端末試験） | 10-05 |

### J. native OS（Linux／QEMU）

QEMUで動くDeveloper Previewの統合と受入。多くは2026-09-09〜11の記録。

| 文書 | 種類 | 何が書いてあるか | 最終更新 |
| --- | --- | --- | --- |
| [`native-os-integration.md`](native-os-integration.md) | 設計 | native OSの統合と現行方針 | 09-12 |
| [`native-os-validation.md`](native-os-validation.md) | 記録 | native OSのRock統合検証 | 10-05 |
| [`native-release-build-20260910.md`](native-release-build-20260910.md) | 記録 | 同じsource・imageを固定するbuild入口 | 09-10 |
| [`native-ci-partition-fix-20260910.md`](native-ci-partition-fix-20260910.md) | 記録 | native CIの失敗と実行枠の分割 | 09-10 |
| [`native-pin-readiness-20260910.md`](native-pin-readiness-20260910.md) | 記録 | native認証画面のsource pin再レビュー | 09-10 |
| [`os-readiness-audit-20260909.md`](os-readiness-audit-20260909.md) | 監査 | OS稼働ベース・ゲーム交換の差分監査 | 09-09 |
| [`os-operational-validation-20260909.md`](os-operational-validation-20260909.md) | 記録 | 統合後のOS稼働検証 | 09-09 |
| [`os-acceptance-b8287bc-20260909.md`](os-acceptance-b8287bc-20260909.md) | 記録 | 凍結候補 b8287bc の受入・引継ぎ報告 | 09-09 |
| [`os-acceptance-9abf78a-20260910.md`](os-acceptance-9abf78a-20260910.md) | 記録 | Developer Preview 同一候補（9abf78a）の受入報告 | 09-10 |
| [`os-acceptance-b7d819c-20260911.md`](os-acceptance-b7d819c-20260911.md) | 記録 | rc2 の導入・保存・再起動・復旧の実測 | 09-11 |
| [`os-final-acceptance-plan-20260910.md`](os-final-acceptance-plan-20260910.md) | 記録 | 最終same-image受入計画 | 09-10 |
| [`os-final-build-20260910.md`](os-final-build-20260910.md) | 記録 | 最終 9abf78a のbuildとsource証拠 | 09-10 |
| [`os-final-compatibility-20260910.md`](os-final-compatibility-20260910.md) | 記録 | 新旧 client／slot／台帳の互換・復旧対応表 | 09-10 |
| [`os-local-final-20260910.md`](os-local-final-20260910.md) | 記録 | 凍結 9abf78a のローカルOS受入 | 09-10 |
| [`os-native-repeat-20260910.md`](os-native-repeat-20260910.md) | 記録 | 9ab native sourceの再実行 | 09-10 |
| [`os-d4-probe-20260910.md`](os-d4-probe-20260910.md) | 記録 | D4 診断の継続 | 09-10 |
| [`os-run44-recovery-20260910.md`](os-run44-recovery-20260910.md) | 記録 | 凍結 b8287bc の run44 最終結果の回収 | 09-10 |
| [`os-game-nonfinancial-gates-20260910.md`](os-game-nonfinancial-gates-20260910.md) | 記録 | same-imageのGame非金融gate | 09-10 |
| [`os-game-profile-d3-isolation-20260910.md`](os-game-profile-d3-isolation-20260910.md) | 記録 | same-imageのGame profile分離受入 | 09-10 |
| [`os-game-profile-observation-20260910.md`](os-game-profile-observation-20260910.md) | 記録 | Game authority profileの停止後観測 | 09-10 |
| [`os-game-read-clock-retention-20260910.md`](os-game-read-clock-retention-20260910.md) | 記録 | Game SDKのread-clock保持 | 09-10 |

### K. リリース・公開・署名・ライセンス

配布してよい条件と、その実行記録。

| 文書 | 種類 | 何が書いてあるか | 最終更新 |
| --- | --- | --- | --- |
| [`release-minimum-gates.md`](release-minimum-gates.md) | 正本 | 最低公開条件。配布形態ごとの必須gate（RQ30） | 10-05 |
| [`release-installation-plan-20260909.md`](release-installation-plan-20260909.md) | 設計 | 導入可能版とCM発表のリリース計画（RQ16） | 09-16 |
| [`release-signing-operations.md`](release-signing-operations.md) | 手順 | 保護された署名の運用（Protected release signing control） | 09-12 |
| [`release-artifact-access.md`](release-artifact-access.md) | 手順 | Draft配布物を取り違えずに取得する | 09-10 |
| [`candidate-preparation.md`](candidate-preparation.md) | 手順 | 新しい未署名候補の準備 | 09-10 |
| [`owner-manual-signing.md`](owner-manual-signing.md) | 手順 | 所有者本人による手動署名の準備 | 09-12 |
| [`owner-legal-approval.md`](owner-legal-approval.md) | 手順 | 将来の所有者による法務承認（detached） | 09-11 |
| [`owner-setup-20260911.md`](owner-setup-20260911.md) | 記録 | kaiyaの決定と残る設定 | 09-11 |
| [`license-proposal-20260911.md`](license-proposal-20260911.md) | 記録 | 自作部分のMIT採用案（kaiya確認用） | 09-11 |
| [`preview-installation-ja.md`](preview-installation-ja.md) | 手順 | Developer Previewの最初の導入と復旧 | 09-10 |
| [`preview-legal-notice.md`](preview-legal-notice.md) | 正本 | Developer PreviewのライセンスとNOTICE | 09-10 |
| [`preview-release-notes.md`](preview-release-notes.md) | 記録 | Developer Preview配布候補の変更点 | 09-17 |
| [`launch-readiness-20260910.md`](launch-readiness-20260910.md) | 記録 | RockstarOS 1.0 ローンチ準備（LCH01〜07） | 09-12 |
| [`release-execution-20260910.md`](release-execution-20260910.md) | 記録 | 2026-09-10 実行checkpoint | 09-10 |
| [`release-followup-20260910.md`](release-followup-20260910.md) | 記録 | 8時間作業の完了記録とCM完成後の残件 | 09-10 |
| [`release-verification-20260911.md`](release-verification-20260911.md) | 記録 | 新候補の導入・サイト復旧 | 09-11 |
| [`rc2-remaining-acceptance-20260911.md`](rc2-remaining-acceptance-20260911.md) | 記録 | rc2の追加受入 | 09-11 |
| [`qemu-release-completion-audit-20260912.md`](qemu-release-completion-audit-20260912.md) | 監査 | QEMU Developer Preview配布完了監査（10 gate、RQ31） | 09-12 |
| [`backend-launch-20260912.md`](backend-launch-20260912.md) | 監査 | OSバックエンド最小ローンチ監査。付録に同日の「ローンチ手順」（起動・設定・監視・復旧） | 10-07 |

### L. セキュリティ・運営

守る仕組みと、事故のときの手順。

| 文書 | 種類 | 何が書いてあるか | 最終更新 |
| --- | --- | --- | --- |
| [`spider-guard.md`](spider-guard.md) | 正本 | Spider Guard。OS本体の秘密・個人情報保護、Security Agent、コード検査、修復サイクルの記録（SYS15） | 10-05 |
| [`security-incident-response.md`](security-incident-response.md) | 正本 | 緊急アクセスとインシデント対応。運営1名による緊急保護とOperator Dock（RQ45・RQ46） | 09-17 |

### M. ハードウェア：avocadoMini・avokadoPro・Material Invention

現行はR5。E1・E2・E3・四方向発明台は設計履歴または別の研究profile。

| 文書 | 種類 | 何が書いてあるか | 最終更新 |
| --- | --- | --- | --- |
| [`rockstaros-avocado-mini-complete-design.md`](rockstaros-avocado-mini-complete-design.md) | 正本 | RockstarOS × avocadoMini — 見て分かる空間発明システム設計書（Material Inventionの研究profile） | 10-05 |
| [`material-invention-core.md`](material-invention-core.md) | 設計 | Material Invention Core。物質の組合せから発明候補を作る共通設計（RQ49） | 09-18 |
| [`material-invention-xr.md`](material-invention-xr.md) | 設計 | Spatial Invention Studio。Material Invention CoreのVR／AR設計 | 09-18 |
| [`avocado-mini-spatial-invention.md`](avocado-mini-spatial-invention.md) | 履歴 | 四方向センサーで物質候補を操作する発明端末（別の研究profile） | 09-21 |
| [`avocado-mini-hardware-design.md`](avocado-mini-hardware-design.md) | 履歴 | Full-scale 空間発明台のハードウェア詳細設計（別の研究profile） | 09-21 |
| [`avocado-mini-cellular.md`](avocado-mini-cellular.md) | 設計 | avocadoMini — 本体SIMによる単独通信 | 10-05 |
| [`avocado-mini-crowdfunding.md`](avocado-mini-crowdfunding.md) | 記録 | クラウドファンディング企画案（募集・決済は未開始） | 09-19 |
| [`avokado-pro-pc-design.md`](avokado-pro-pc-design.md) | 設計 | avokadoPro — NVIDIA搭載の小型PC。構成、組立、受入計画 | 10-05 |

関連フォルダ：[`avocado-mini-r5/`](avocado-mini-r5/)（40ファイル）／[`avocado-mini-tower20-e3/`](avocado-mini-tower20-e3/)（1ファイル）／[`avocado-mini-mini200-e2/`](avocado-mini-mini200-e2/)（1ファイル）／[`avocado-mini-mini200-e1/`](avocado-mini-mini200-e1/)（30ファイル）／[`avocado-mini-conversation-2026-09-27/`](avocado-mini-conversation-2026-09-27/)（29ファイル）

### N. rocketstar

rocketstarの資料はすべて1フォルダにまとまっています：[`rocketstar-design/`](rocketstar-design/README.md)（936ファイル）。R1.0完全版（44ページ・35章）、60要求、18システムinterface、継承したC3資料、A-LINK、受信試作、OS完全版の付録、コロニー運用、端末ボタン、旧版、計算・検証記録。元の成果物のバイト列を保持しているため、中のファイルは編集しません。

### O. 開発の進め方・進捗・過去の状態記録

誰が何を担当し、どこまで進んだか。

| 文書 | 種類 | 何が書いてあるか | 最終更新 |
| --- | --- | --- | --- |
| [`mission-control.md`](mission-control.md) | 正本 | avokado Mission Control。5師団32部隊、段階、次のタスク、集計と合格のルール | 10-05 |
| [`amc-goal-orchestrator.md`](amc-goal-orchestrator.md) | 設計 | AMC Goal Orchestrator。指示→部隊→Goalの管理ツールの使い方と境界 | 10-05 |
| [`amc-sky-launch-integration.md`](amc-sky-launch-integration.md) | 記録 | Sky専用AMCの取り込みとローンチ判定 | 10-05 |
| [`amc-autonomy-fixture.md`](amc-autonomy-fixture.md) | 記録 | AMCの有限fixture実行 | 10-05 |
| [`git-consolidation.md`](git-consolidation.md) | 正本 | Gitプロジェクト統合方針とRepository storage policy（Gitに入れるもの・入れないもの） | 10-05 |
| [`merge-loss-audit-20261007.md`](merge-loss-audit-20261007.md) | 監査 | 統合（merge）で失われた情報の監査。何が消え、何を戻し、何を戻していないか。ownerの判断が必要な項目（task台帳・設計台帳・READMEの見出しなど） | 10-07 |
| [`reference-repositories.md`](reference-repositories.md) | 記録 | 参照元リポジトリと採用判断 | 09-07 |
| [`prompt-playbook.md`](prompt-playbook.md) | 手順 | 最新進捗から実行プロンプトを作る規約（RQ10） | 09-19 |
| [`validation.md`](validation.md) | 記録 | 検証記録（2026-09-04〜09-20の累積） | 09-20 |
| [`research.md`](research.md) | 記録 | 設計に使った一次資料 | 09-05 |
| [`current-state-20260911.md`](current-state-20260911.md) | 履歴 | 2026-09-11〜17時点の「現在の開発状態と再開条件」 | 09-17 |
| [`implementation-checkpoint-20260909.md`](implementation-checkpoint-20260909.md) | 履歴 | 2026-09-09の実装・検証の保存時点 | 09-12 |
| [`design-implementation-alignment-20260909.md`](design-implementation-alignment-20260909.md) | 履歴 | 設計・プロンプトと実装の再照合（2026-09-09） | 09-12 |
| [`progress-audit-20260909.md`](progress-audit-20260909.md) | 履歴 | 進捗と確定要望の相違の監査（2026-09-09） | 09-09 |
| [`progress-audit-20260909-followup.md`](progress-audit-20260909-followup.md) | 履歴 | 同監査の追補 | 09-09 |

関連フォルダ：[`workstreams/`](workstreams/)（13ファイル）／[`prompts/`](prompts/)（10ファイル）／[`templates/`](templates/)（4ファイル）
### P. 証拠・素材

| フォルダ | 何が入っているか |
| --- | --- |
| [`evidence/`](evidence/) | 受入証拠（841ファイル）。各文書の「証拠」リンクの行き先。内容は変更しない |
| [`research/`](research/) | RockstarOSの特許調査と出典台帳 |
| [`assets/`](assets/) | 設計図・製品カバーの画像 |
| [`brand/`](brand/) | avokadoのブランド素材 |

---

## 6. フォルダ一覧

| フォルダ | ファイル数 | 何が入っているか |
| --- | ---: | --- |
| [`workstreams/`](workstreams/README.md) | 13 | 作業ストリーム別の入口（00責任分界、01 Product/UX … 11 Material Invention）。担当・完了条件・検証コマンド |
| [`avocado-mini-r5/`](avocado-mini-r5/README.md) | 40 | **現行** avocadoMini R5 統合基本設計。51ページのPDF／Word、図8点、計算、参考文献、検証記録 |
| [`avocado-mini-tower20-e3/`](avocado-mini-tower20-e3/README.md) | 1 | Tower20 E3（4本＋別Edge Hub）の設計記録。原本PDFは未収録 |
| [`avocado-mini-mini200-e2/`](avocado-mini-mini200-e2/README.md) | 1 | Mini200 E2（4本＋中央ユニット）の統合記録 |
| [`avocado-mini-mini200-e1/`](avocado-mini-mini200-e1/README.md) | 30 | Mini200 E1（20cmゲーム機・日本語音声）の設計、図、計算 |
| [`avocado-mini-conversation-2026-09-27/`](avocado-mini-conversation-2026-09-27/README.md) | 29 | 2026-09-27の会話仕様アーカイブ（原文のまま）。個人認証、GTA、クリエイター収益分配80:20 |
| [`rocketstar-design/`](rocketstar-design/README.md) | 936 | rocketstar 設計アーカイブ。R1.0完全版、A-LINK、受信試作、OS完全版の付録、コロニー、計算・検証記録 |
| [`evidence/`](evidence/) | 841 | 受入証拠（JSONとログ要約）。文書から参照される試験結果の正本 |
| [`prompts/`](prompts/) | 10 | 実行プロンプトの保存（再開指示、引継ぎ原文）。2026-10-07の文書整理の引き継ぎは [`docs-reorg-handoff-20261007.md`](prompts/docs-reorg-handoff-20261007.md) |
| [`templates/`](templates/) | 4 | 受入報告などの雛形 |
| [`contracts/`](contracts/) | 3 | Sky commerce v2の契約案（SQL・TypeScript） |
| [`design-validation/`](design-validation/README.md) | 5 | 設計の状態モデル検証（commerce state model） |
| [`research/`](research/) | 2 | RockstarOSの特許調査と出典台帳 |
| [`assets/`](assets/) | 24 | 設計図・製品カバーなどの画像 |
| [`brand/`](brand/) | 3 | avokadoのブランド素材（README冒頭のGIF、関係図） |
| [`merge-loss-audit-20261007/`](merge-loss-audit-20261007.md) | 2 | [統合で失われた情報の監査](merge-loss-audit-20261007.md)の添付。どの文書にも残っていない行の原文と、台帳から消えた記録の控え |
---

## 7. 文書を足すとき・直すときのルール

既存のルール（[AGENTS.md](../AGENTS.md)・[全設計ポータルの変更規則](rockstaros-design-portal.md#変更規則)・[workstreamの分類ルール](workstreams/README.md#分類ルール)）はそのまま有効です。この地図を保つために、次を足します。

1. **`docs/` 直下に文書を足したら、この地図の [§5](#5-分野別の全文書) の該当分野に1行足す。** 種類（正本／設計／手順／監査／記録／履歴）も付ける。
2. **新しい情報は、関係する節に入れる。** 文書の末尾や題名の上に足さない。日付付きの追記は、その文書の「変更記録」か該当する節の中へ。
3. **日付付きの記録を新しい入口にしない。** 入口は [§2](#2-入口はこの順番) の階層だけ。新しい設計書はまず該当workstreamの「関連資料」に足す。
4. **方針が変わって古くなった文書は消さず、種類を「履歴」に変える。** 冒頭に「いまは○○が優先」と1行書く。
5. **仕様を変えたら [仕様変遷](spec-history.md) に、Toolを変えたら [エージェント・Tool総覧](agents-and-tools.md) に追記する。**
6. **ファイルを移動・改名しない。** 進捗台帳（`data/project-status.json`）、設計台帳（`data/design-document-index.json`）、受入証拠がパスで参照しています。どうしても必要なときは、参照元をすべて同じ変更で直し、`npm run verify` を通す。
