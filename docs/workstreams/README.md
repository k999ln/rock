# RockstarOS 設計・作業ストリーム案内

更新日: 2026-09-18

このディレクトリは、既存の設計書を移動せず、作業分野ごとの入口を提供する。確定要望の正本は [製品ベース](../product-baseline.md)、進捗の正本は [data/project-status.json](../../data/project-status.json) であり、ここでは内容を置き換えない。

## 最初に確認するもの

1. `git status --short --branch` でbranch、競合、未保存差分を確認する。
2. [現在の開発状態](../current-state-20260911.md) と [製品ベース](../product-baseline.md) を読む。
3. [進捗JSON](../../data/project-status.json) から担当するtask IDと依存gateを選ぶ。
4. 下表の作業ストリームを一つ開き、対象、非対象、完了条件、検証コマンドを確認する。
5. 完了時に `data/project-status.json`、`project.md`、必要な設計書と証拠を同期する。

## 状態の読み方

- `done`: 記載された範囲の実装または設計証拠がある。実機、本番、実資金まで完了した意味ではない。
- `in_progress`: コードまたは準備はあるが、受入、外部接続、統合のいずれかが残る。
- `planned`: 設計上必要だが、着手条件または実行環境が揃っていない。
- `blocked`: 必須の本人判断、機種、鍵、契約、provider、公開許可などが不足している。

<!-- project-overview:start -->
現在の機械可読進捗は126 task中86 done、23 in progress、16 planned、1 blocked。件数は作業量や製品完成率を表さない。
<!-- project-overview:end -->

## 作業ストリーム

| 区分                                                                   | 何を扱うか                                   | 現在の重点                                  |
| ---------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------- |
| [Responsibility Boundaries](00-responsibility-boundaries.md)           | Rock、外部Provider／ToB、本人の責任分界      | 誰の完了待ちかをtaskごとに明示              |
| [Product / UX](01-product-ux.md)                                       | 製品要件、Home、Zema、Studio、画面設計       | RQ01〜RQ49と全体構成監査、実利用の不便削減  |
| [Sky / MCP](02-sky-mcp.md)                                             | Tool登録、接続、権限、実行先、MCP Connector  | Sky Cloud／provider MCPの本接続とOAuth      |
| [Wallet / Billing / Providers](03-wallet-billing-providers.md)         | 台帳、精算、USDC、外部Provider               | owner署名、実入金・実払出しの受入           |
| [Security / Identity / Compliance](04-security-identity-compliance.md) | 認証、秘密、署名、SBOM、法務、マイナンバー   | production鍵、license、独立審査             |
| [Web / PWA / Sites](05-web-pwa-sites.md)                               | Web画面、PWA、D1、配備、本人限定Site         | sourceと配信版の同一commit化                |
| [Native / QEMU / Release](06-native-qemu-release.md)                   | Buildroot/Linux、QEMU、更新、復旧、配布      | 正式署名後の同一候補再受入                  |
| [Android / Device / Local AI](07-android-device-local-ai.md)           | AOSP、Pixel、BSP、実機、端末内AI             | 正確な機種選定、full build、flash、実機試験 |
| [Game / Market / Fund](08-game-market-fund.md)                         | ゲーム交換、作者SDK、PAPER市場、自律ファンド | 実ゲームsandboxとprovider境界               |
| [Business Pilots](09-business-pilots.md)                               | CSV、メルカリ、Fashion Brand Ops             | 第三者の真正な有料取引と継続利用            |
| [Git / CI / Operations](10-git-ci-operations.md)                       | branch、PR、CI、進捗同期、証拠               | 現在のmerge競合解消とmain統合               |
| [Material Invention / avocadoMini](11-material-invention-avocado-mini.md) | 物質digital twin、空間操作、安全、再計算、Patent AI | 合成scene／pose実装と四方向prototype       |

## 分類ルール

- 作業開始時に [責任分界](00-responsibility-boundaries.md) を確認し、`ROCK`、`EXTERNAL`、`JOINT`、`OWNER`の主担当を決める。
- 一つの作業は主担当ストリームを一つ決める。横断する安全条件はSecurity、配備条件はWebまたはReleaseへリンクする。
- 新しい設計書は、まず該当ストリームの「関連資料」に追加する。日付付き履歴だけを新しい入口にしない。
- 実装、fixture、QEMU、標準Android emulator、物理端末、本番providerを別の状態として記録する。
- `done`へ変えるときは、対象source SHA、検証コマンド、合格証拠、残る非対象を記載する。
- 仕様変更は必ずRQ番号へ結び、明示指示なしに既存の料金、安全境界、権限を変更しない。

## 共通の完了手順

1. 対象taskの担当、外部依存、本人操作、受入証拠を明記する。
2. 対象taskの完了条件を満たす。
3. 変更箇所の小さい試験を先に実行する。
4. 配布候補または統合前は `npm run verify` と必要なOS固有試験を実行する。
5. `npm run project:update` で進捗文書を同期する。
6. 同じSHAのCI、配備、実機、provider受入を必要に応じて別々に確認する。
