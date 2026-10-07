# data/ — 機械可読の正本

このフォルダには、**文書の内容を機械が検査できる形にしたJSON** が入っています。多くは `docs/` の文書と対になっていて、`npm run …:check` がJSONと文書・コード・証拠の食い違いを検出します。

- 人が読む説明は `docs/` 側にあります。全体の地図は [docs/README.md](../docs/README.md)。
- JSONを直したら、対になる文書と、右端の検査コマンドを同じ変更で通します。
- 生成物（`discovered.json`、`*.tmp`）はGitに入れません。

## 製品・要望・設計

| ファイル | 何の正本か | 対になる文書 | 検査 |
| --- | --- | --- | --- |
| [`product-baseline.json`](product-baseline.json) | 確定要望（RQ01〜RQ49）、次の実行プロンプト、製品の位置づけ | [製品ベース](../docs/product-baseline.md) | `npm run baseline:check` |
| [`product-identity.json`](product-identity.json) | 製品名・版・段階表示（`RockstarOS 1.0 Developer Preview`） | 製品ベース RQ43・RQ44 | `npm run version:check` |
| [`version-boundaries.json`](version-boundaries.json) | 製品版・API版・schema版の境界 | [Version boundaries](../docs/version-boundaries.md) | `npm run version:check` |
| [`design-document-index.json`](design-document-index.json) | 設計台帳。領域ごとの設計書とToolの被覆 | [全設計ポータル](../docs/rockstaros-design-portal.md) | `npm run design:check` |
| [`rockstaros-complete-design-v1.0.json`](rockstaros-complete-design-v1.0.json) | OS設計書完全版 v1.0 のSHA-256・ページ数・被覆件数 | [原本PDF](../docs/rockstaros-complete-design-v1.0.pdf) | `npm run design:check` |
| [`system-composition-audit.json`](system-composition-audit.json) | 全体構成監査（層と経路の選択・接続状態） | [全体構成監査](../docs/system-composition.md) | `npm run system:composition:check` |
| [`execution-approval.json`](execution-approval.json) | 設計v1.1の実装承認の記録 | [承認記録](../docs/execution-approval-20260909.md) | — |
| [`avocado-mini-cellular.json`](avocado-mini-cellular.json) | Mini本体SIMの機械可読仕様 | [Mini cellular](../docs/avocado-mini-cellular.md) | — |
| [`avokado-pro-pc.json`](avokado-pro-pc.json) | avokadoPro PCの候補構成 | [Pro PC設計](../docs/avokado-pro-pc-design.md) | — |
| [`material-invention-xr-policy.json`](material-invention-xr-policy.json) | Spatial Invention StudioのXR policy | [XR設計](../docs/material-invention-xr.md) | — |

## 進捗・担当

| ファイル | 何の正本か | 対になる文書 | 検査 |
| --- | --- | --- | --- |
| [`project-status.json`](project-status.json) | 全taskの状態・依存・証拠・phaseGates。`project.md` の表の生成元 | [project.md](../project.md) | `npm run project:check`（更新は `project:update`） |
| [`mission-control.json`](mission-control.json) | AMCの5師団32部隊、担当、taskPlans、実行保留 | [Mission Control](../docs/mission-control.md) | `npm run mission:check`（更新は `mission:update`） |
| [`csv-business-tasks.json`](csv-business-tasks.json) | CSV仕事のtask | [CSV仕事 v1](../docs/csv-business-v1.ja.md) | `npm run csv:check` |
| [`amc/`](amc/) | AMCのエージェント定義（`agent-definitions.json`）、Sky専用AMCの計画・Goal・出典snapshot、取り込みの来歴 | [AMC Goal Orchestrator](../docs/amc-goal-orchestrator.md) / [Sky専用AMC](../docs/amc-sky-launch-integration.md) | `npm test`（`tests/amc-*.test.mjs`） |

## AI・LLM

| ファイル | 何の正本か | 対になる文書 | 検査 |
| --- | --- | --- | --- |
| [`llm-capabilities.json`](llm-capabilities.json) | どのモデルを、どこで、何の役割で使うか。状態の語彙 | [LLM・評価モデル設計](../docs/llm-evaluation-architecture.md) | `npm run llm:architecture:check` |
| [`decision-fabric-policy.json`](decision-fabric-policy.json) | Decision Fabricの権限・経路・provider | [Decision Fabric](../docs/jev-local-qwen-decision-fabric-design.md) | `npm run design:check` |

## 公開・リリースの判定

| ファイル | 何の正本か | 対になる文書 | 検査 |
| --- | --- | --- | --- |
| [`release-readiness.json`](release-readiness.json) | 配布形態ごとの公開最低条件と判定（RQ30） | [最低公開条件](../docs/release-minimum-gates.md) | `npm run release:check` |
| [`qemu-release-audit.json`](qemu-release-audit.json) | QEMU Developer Preview rc2 の10 gate（RQ31） | [QEMU配布完了監査](../docs/qemu-release-completion-audit-20260912.md) | `npm run release:check` |
| [`qemu-rc2-legal-info/`](qemu-rc2-legal-info/) | rc2に同梱するlegal bundleのmanifest（target／host） | 同上 | `npm run release:check` |
| [`rockstaros-preview.json`](rockstaros-preview.json) | Preview候補のsource commit・版・公開URL | [Preview変更点](../docs/preview-release-notes.md) | `npm run release:check` |
| [`release-owner-intent-20260911.json`](release-owner-intent-20260911.json) | 2026-09-11のowner意思（権利者名、自作コードの扱い、署名、Sites） | [kaiyaの決定](../docs/owner-setup-20260911.md) | `npm run release:check` |
| [`release-signing-control-protection.json`](release-signing-control-protection.json) | 署名control branchの保護設定 | [署名運用](../docs/release-signing-operations.md) | `npm run release:signing:check` |
| [`release-signing-policy.example.json`](release-signing-policy.example.json)・[`release-trust.example.json`](release-trust.example.json) | 署名policyとtrustの記入例 | 同上 | 同上 |
| [`sky-service-launch.json`](sky-service-launch.json) | Skyサービスのローンチgate | [Skyローンチ設計](../docs/sky-launch-design.md) | `npm run sky:launch:check` |
| [`personal-number-release-audit.json`](personal-number-release-audit.json) | マイナンバー連携の7 gate | [Android実機・マイナンバーgate](../docs/android-and-personal-number-gates-20260913.md) | `npm run release:check` |

## Android・端末

| ファイル | 何の正本か | 対になる文書 | 検査 |
| --- | --- | --- | --- |
| [`device-support-matrix.json`](device-support-matrix.json) | 対応機種の台帳と提供区分 | [多機種対応設計](../docs/device-support-architecture.md) | `npm run device-support:check` |
| [`android-release-architecture-policy.json`](android-release-architecture-policy.json) | Android 1.0の構成決定と許可するBinder経路 | [Android production architecture](../docs/android-production-architecture.md) | `npm run android:architecture:check` |
| [`android-physical-release-audit.json`](android-physical-release-audit.json) | Android物理端末の5 gateの判定 | [Android実機gate](../docs/android-and-personal-number-gates-20260913.md) | `npm run android:architecture:check` |
| [`android-first-flash-gate.json`](android-first-flash-gate.json) | 初回flash前の4 gateの判定 | [初回flash gate](../docs/android-first-flash-gate-20260916.md) | `npm run android:first-flash:check` |
| [`android-backup-recovery-policy.json`](android-backup-recovery-policy.json) | バックアップ・全損復元のpolicy | [backup・復旧](../docs/android-backup-recovery.md) | 同上 |
| [`android-rollback-index-policy.json`](android-rollback-index-policy.json) | AVB rollback indexの運用 | [rollback index](../docs/android-rollback-index-policy.md) | 同上 |
| [`android-signing-custody-policy.json`](android-signing-custody-policy.json) | 正式署名鍵の保管方針 | [署名鍵の保管](../docs/android-production-signing-custody.md) | 同上 |
| [`android-stock-recovery-policy.json`](android-stock-recovery-policy.json) | Google純正への復旧セット | [純正復旧](../docs/android-google-stock-recovery.md) | 同上 |
| [`device-emergency-access-policy.json`](device-emergency-access-policy.json) | 運営による緊急保護で許可・禁止する操作（RQ45） | [緊急アクセス](../docs/security-incident-response.md) | `npm run android:architecture:check` |

## Web・DB・リポジトリ

| ファイル | 何の正本か | 対になる文書 | 検査 |
| --- | --- | --- | --- |
| [`database-status.json`](database-status.json) | DBのtable・migration・配備の状態（生成） | [Database status](../docs/database-status.md) | `npm run database:check`（更新は `database:status`） |
| [`database-deployments.json`](database-deployments.json) | DB配備の境界 | 同上 | 同上 |
| [`web-security-policy.json`](web-security-policy.json) | Web応答のセキュリティheader | [Web workstream](../docs/workstreams/05-web-pwa-sites.md) | `npm run web:security:check` |
| [`web-third-party-license-audit.json`](web-third-party-license-audit.json) | Web依存のlicense棚卸し | [最低公開条件](../docs/release-minimum-gates.md) | `npm run release:web-bundle:check` |
| [`sites-owner-preview-audit.json`](sites-owner-preview-audit.json) | 本人限定Siteの監査 | 同上 | `npm run release:check` |
| [`sites-transition-20260911.json`](sites-transition-20260911.json) | 2026-09-11のSites移行の記録 | [kaiyaの決定](../docs/owner-setup-20260911.md) | — |
| [`repository-map.json`](repository-map.json) | リポジトリ間の役割（正本は `k999ln/rock`）と `Mr.` snapshotの取得元 | [Git統合方針](../docs/git-consolidation.md) | `npm run repository:check` |
| [`reference-repositories.json`](reference-repositories.json) | 参照元リポジトリの一覧 | [参照元と採用判断](../docs/reference-repositories.md) | — |
| [`discovery-sample.json`](discovery-sample.json) | 外部ツール候補の発見（Product Hunt等）のサンプル出力 | `npm run discover` | — |
