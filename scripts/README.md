# scripts/ — 検証・生成・パッケージのスクリプト

リポジトリ全体の **検査（check）**、文書や台帳の **再生成（update）**、配布物の **パッケージ**、開発補助のスクリプトです。ふつうは下の `npm run …` から呼びます。定義は [`package.json`](../package.json)。

## まず使うもの

| コマンド | いつ使うか |
| --- | --- |
| `npm run verify` | 変更を仕上げる前の全体検査。下の表のcheckのほぼ全部に加えて、`typecheck`・`lint:product`・`npm test`・Toolkit／Site／公開物の試験・`build`・`test:api` を順に実行する（36段。途中で失敗するとそこで止まる） |
| `npm run project:update` | task（`data/project-status.json`）を変えたあと。`README.md`・`project.md`・`docs/workstreams/README.md` の進捗欄を再生成する |
| `npm run mission:update` | 部隊・担当（`data/mission-control.json`）を変えたあと。Mission Controlの一覧を再生成する |
| `npm run database:status` | DBのschemaやmigrationを変えたあと。`docs/database-status.md` を再生成する |
| `npm test` | Nodeの単体試験（`tests/*.test.mjs`） |

## 何を検査するか（check）

| コマンド | 検査する内容 | 主な対象 |
| --- | --- | --- |
| `project:check` | 進捗台帳と、生成済みの進捗欄が一致するか。完了taskに証拠があるか | `data/project-status.json` |
| `baseline:check` | 確定要望（RQ01〜RQ49）と機械可読正本・関連文書の整合 | `data/product-baseline.json`・`docs/product-baseline.md` |
| `design:check` | 全Toolと設計領域が設計台帳・詳細設計に載っているか | `data/design-document-index.json` |
| `mission:check` | 部隊・担当・親子task・段階の整合 | `data/mission-control.json` |
| `sky:check` | Sky catalogの件数（ready 13・候補22）、プロジェクト別ガイドの網羅、旧名称の残り | `lib/catalog.ts`・`PROJECTS.md` |
| `sky:launch:check` | Skyサービスのローンチgate | `data/sky-service-launch.json` |
| `llm:architecture:check` | LLMの役割表と実装・文書の整合 | `data/llm-capabilities.json` |
| `system:composition:check` | 全体構成監査 | `data/system-composition-audit.json` |
| `csv:check` | CSV仕事の契約とtask | `data/csv-business-tasks.json` |
| `repository:check` | リポジトリ間の役割、`Mr.` 固定原本のhash、生成物がGitに入っていないか | `data/repository-map.json`・`vendor/mr/` |
| `version:check` | 製品版・API版・schema版の境界 | `data/product-identity.json` |
| `schema:check`・`database:check` | Webのschemaとmigration、DB状態文書 | `db/`・`drizzle/` |
| `release:check`・`release:signing:check` | 公開最低条件の判定、署名の仕組みの公開fixture試験 | `data/release-readiness.json` |
| `release:web-bundle:check`・`release:web-assets:check`・`web:security:check` | Webの依存license、配備assetの欠落、応答header | `data/web-*.json` |
| `os:check`・`os:host`・`os:parity` | OS契約、hostでの確認、WebとOSの業務契約の一致 | `contracts/`・`android/` |
| `android:architecture:check`・`android:first-flash:check`・`device-support:check` | Androidの構成決定、初回flash gate、対応機種台帳 | `data/android-*.json`・`data/device-support-matrix.json` |
| `avocado:r5:check` | R5設計パッケージの完全性 | `docs/avocado-mini-r5/` |
| `mcp:package:check`・`fashion:package:check`・`shared:check` | 配布パックと共有コードが元ソースと一致するか | `toolkits/`・`shared/` |

## 個別の領域

| 領域 | コマンド |
| --- | --- |
| Web開発 | `dev`・`build`・`start`・`lint`・`lint:product`・`format`・`typecheck`・`db:generate` |
| API・保存の試験 | `test:api`（仕事APIとCSV保存） |
| AMC | `mission:goal`（Goalの計画・書き出し）・`mission:codex` / `amc:codex`（ローカルCodexで1件実行）・`amc:agent`・`amc:parallel`・`amc:autonomy:fixture` |
| Sky・MCP | `mcp:connector`・`mcp:package`・`sky:a2a:workflow:test`・`sky:a2a:workflow:positive`・`sky:agent-runtime:check` |
| 課金・運営Worker | `billing:check`・`billing:deploy`・`billing:migrate`・`operator-dock:dev`・`operator-dock:check`・`operator-dock:migrate:local` |
| Toolkitの試験 | `test:fashion-brand-ops`・`test:meme-intelligence`・`test:avocado-farm`・`esim:demo`・`esim:test` |
| Site・公開物 | `test:avocado-mini-site`・`test:public-preview`・`release:sbom` |
| その他 | `prompt:context`（最新進捗からプロンプトの材料を集める）・`discover`（外部ツール候補の発見）・`spider:feedback`・`fashion:package`・`shared:sync` |

## 決まり

- `deploy`・`migrate`（`--remote`）・`release:sbom` は外部や配布物に作用します。設計依頼から実施の許可を推測しません（[AGENTS.md](../AGENTS.md)）。
- 長いログや再生成できる出力はGitに入れず、`work/` へ置きます（[Repository storage policy](../docs/git-consolidation.md#repository-storage-policy)）。
- nativeのsource回帰はLinuxで `python3 scripts/test-native.py --output <新しいフォルダ>`。
