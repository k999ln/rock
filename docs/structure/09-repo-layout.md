# 09 リポのどこを直すか（Codex 向け・token を使わない地図）（2026-11-02）

原則: **直す対象の 1 フォルダと、この表だけ読めば足りる**ようにする。全体を grep しない。

## 1. 入口 3 ファイル

| ファイル | 読む人 | 行数上限 |
| --- | --- | --- |
| README.md | 中の人（Noelle / Kaiya）。前半: 構造図と「どこに何があるか」。後半: 製品ごとの説明（写真つき） | 600 |
| AGENTS.md | Codex。作業規則だけ | 100 |
| CHANGELOG.md | 誰が・いつ・何を変えたか。Codex は読まなくてよい | 無制限（追記のみ） |

## 2. 役割 → フォルダ（これが地図）

| 役割 | 設計の正本 | コード | テスト | 検証コマンド |
| --- | --- | --- | --- | --- |
| 全体像・決定 | docs/structure/00, 05, 07 | — | — | — |
| mii ハード | docs/structure/01-mii.md → docs/avocado-mini-* | systems/rock-star-os/targets/mii, lib/mii-*.ts, contracts/avocado-mini-spatial-interaction.json | tests/mii-*, tests/avocado-mini-* | `npm run avocado:r5:check` |
| RockstarOS（共通層） | docs/structure/02 → docs/native-os-integration.md, systems/rock-star-os/docs/architecture.md | lib/rockstar-*.ts, systems/rock-star-os/os（Buildroot）, android/, os/ | tests/rockstar-* | `npm run android:architecture:check`, `npm run device-support:check` |
| eSIM | docs/structure/03 → docs/service-design/08 | app/api/esim, lib/esim-*.ts, lib/esimgo-*.ts, app/connect, toolkits/esim-bootstrap | tests/esim-* | `npm test -- esim` |
| Eve | docs/structure/04 | lib/eve-*.ts, lib/zema-chat-session.ts, app/chat, app/zema, app/api/eve | tests/eve-*, tests/zema-* | — |
| Noah / 本人Mac接続 | docs/structure/04 → docs/services/noah-standalone-launch.md | app/noah, app/api/noah, lib/noah-*, scripts/noah-*。localhost通信はnoah-local-api、取得容量照合はnoah-source-bytes、公開WebのRunnerはnoah-mac-runner | tests/noah-* | `npm run verify` |
| Noa（旧Smith） | docs/structure/04 | lib/eve-agent-*.ts, components/eve-object-agent-creator.tsx, app/api/llm | tests/eve-agent-* | — |
| AMC（＋旧Jennifer） | docs/structure/04 → docs/mission-control.md, docs/amc-*.md | lib/amc-*.ts, lib/jennifer-*.ts, app/amc, app/api/amc, app/api/jennifer, data/amc/ | tests/amc-*, tests/jennifer-* | `npm run mission:check` |
| Jev | docs/jev-*.md | lib/jev-*.ts, android/jev-provider, app/api/jev-evaluation | tests/jev-* | — |
| Spider | docs/structure/04 | lib/spider-*.ts, toolkits/spider-guard, .github/workflows/spider-codeql.yml | tests/spider-* | — |
| Sky | docs/service-design/, docs/sky-*.md | lib/sky-*.ts（104）, app/sky, app/api/sky, services/sky-*, sites/sky-live, examples/sky | tests/sky-* | `npm run sky:check` |
| Work / Job / Receipt | docs/structure/04 | lib/work-*.ts, lib/workflow.ts, lib/receipt-signature.ts, app/work, app/api/work-jobs | tests/work-* | `npm run work:check` |
| Broker / 権限 | docs/agent-control-plane.md | lib/a2a-broker-*.ts, lib/agent-control-plane.ts, app/api/agent-control-plane | tests/a2a-* | `npm run sky:a2a:workflow:test` |
| Wallet / 課金 | docs/structure/05 | lib/wallet*.ts, lib/settlement.ts, services/sky-billing, shared/stripe.mjs, app/wallet, app/api/wallet, app/api/earnings | tests/wallet-*, tests/settlement-* | `npm run billing:check` |
| Game / creator SDK | docs/gx0*-*.md, docs/game-api-contract-draft.md | lib/game-*.ts, sites/avocado-mini/creator-kit | tests/game-* | `npm run test:avocado-mini-site` |
| DB | docs/database-status.md | db/schema.ts, drizzle/（正）, drizzle-main/, drizzle-legacy/ | — | `npm run database:check`, `npm run schema:check` |
| サイト | — | sites/avocado-mini（Astro）, sites/sky-live, public/, public-release/ | — | `npm run test:avocado-mini-site` |
| Codex 運用 | AGENTS.md, codex/tasks/ | .codex/agents, .codex/skills, .github/ | — | `npm run bot:check` |
| 画面のデザイン参照 | design/references/README.md | design/references/moodboard, design/references/components（WebP・1 枚 300 KB 以内） | — | — |
| 歴史（読まない） | archive/, docs/evidence/（212 件・17MB）, workspaces/, docs/merge-loss-audit-*, toolkits/mr, vendor/mr | — | — | — |

## 3. 「読まなくてよい」の定義

Codex はタスクに書かれたフォルダ以外を開かない。特に:

- `docs/evidence/**`（実行証拠 JSON）— 歴史。task 01 で `archive/evidence/` へ移す。
- `archive/**` — 復元用。
- `workspaces/**`（H1/M1–M4 の作業区分）— data/development-portfolio.json と重複。task 01 で archive へ。
- `CHANGELOG.md` — 人間向け。
- `data/*.json` のうち product-baseline / design-document-index / repository-map は**チェックスクリプトの入力**。パスを動かしたら task 01 の手順で更新する。

## 4. 新しいものを足すときの置き場所

| 足すもの | 置き場所 |
| --- | --- |
| 新サービス（ヨガ矯正など） | docs/services/<name>.md（04 §3 の書式）→ lib/<役割>-<name>.ts |
| 新ハード profile | systems/rock-star-os/targets/<profile>/README.md |
| 新 Codex タスク | codex/tasks/NN-<slug>.md、00-index.md に 1 行 |
| 決定の変更 | docs/structure/07 に日付付き 1 行 → 該当 docs/structure/0X を直す |
| 完了の記録 | CHANGELOG.md 先頭に 1 行（日付・何を・PR 番号） |

## 5. 本人Macの作業先を一本化（2026-11-26）

本人の訂正「統合してほしい、最新状態の形」により、通常の作業先は1か所とする。

| 置き場所 | 役割 |
| --- | --- |
| `/Users/kaiya/Documents/ChatGPT/avokdo` | 統合した作業先。取得済み最新`origin/main`を土台に、未取り込みの設計・コードを保持する |
| ルートの`avokado.code-workspace` | VS Codeの入口。上の1フォルダを「avokado（統合版）」と表示する |
| `work/workspace-refresh-20261126/main-reference` | 元`/Users/kaiya/Developer/avokado-main`。最新mainに更新後、復元用として退避。通常編集しない |
| `work/workspace-refresh-20261126/files`・`manifest.json`・`changes.patch` | 更新前の未コミット35ファイルとSHA-256、差分。Git管理外の復元用 |

元の開発ブランチ`codex/noah-isolated-desktop-20261123`は保持。作業中変更はstash `7c9e0326d724e5fd1da1848203dc22d44a9f563a`にも保全した。最新mainにも別履歴で実装が進んでいるため、旧コード全体を再マージせず、今回の未コミット差分を最新の文書・コード構成に載せ直した。旧ブランチ固有の変更を追加採用する場合は、その差分を別途評価する。

統合の基準は2026-11-26に取得した`origin/main` = `141fdb1879`。統合用ブランチは`codex/workspace-latest-20261126`。この記録は自動更新ではない。次の作業時は`git fetch origin`と`git status --short --branch`で確認し、変更を保全してから取り込む。リモートの他の作業ブランチ・未マージPRを「mainの最新版」と混同しない。公開／mainへの反映は別の検証・PRで行う。
