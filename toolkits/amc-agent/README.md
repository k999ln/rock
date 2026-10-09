# AMC agent

AMC（avokado Mission Control）をCodexから使うプロジェクト用エージェント定義。Goalと意図を司令官が保持し、独立した作業を部隊へ委任し、実行担当とは別の担当が成果を照合する。

## 利用

このプロジェクトのCodexで「AMCで、○○をGoalにして進めて」と依頼する。新しいセッションで `amc`、`amc-worker`、`amc-reviewer` のカスタムエージェントを使用する。既に開いているセッションの定義再読込は実行環境に依存する。

CLIでも開始できる。

```sh
npm run amc:agent -- run --goal '購入後の商品がZemaのライブラリに保存され、再読込しても利用できることを確認する'
```

CLI起動は既存のCodex CLIの認証・モデル・権限・承認設定を使う。このチャットで一時的に選択した設定との同期は行わない。カスタムエージェントのモデルは親セッションから継承する。通常の対話セッションとして動き、閉じた後の常時稼働は行わない。検収担当の設定はread-only。

実行前の確認だけなら `--preview` を付ける。`npm run amc:agent -- describe` は役割を表示し、モデルを呼ばない。

## 定義とインストール

正本は `data/amc/agent-definitions.json`。`npm run amc:agent -- install` で当該repositoryの `.codex/agents/` に3個のTOMLを生成する。別のワークスペースに置く場合は `--project /absolute/workspace` を明示する。既存の異なる定義やsymlinkは上書きしない。モデル、global config、認証情報、利用者の他エージェントは変更しない。

公式形式: https://learn.chatgpt.com/docs/agent-configuration/subagents

## 実装との関係

- Goalの正式状態遷移: `scripts/amc-goal-engine.mjs`
- 有限自律ループと永続化: `scripts/amc-autonomy.mjs` / `scripts/amc-autonomy-store.mjs`。別チャットからhash一致で取り込んだfixture専用実装。実workerをfixtureとして偽装接続しない。
- 隔離作業場所の並列runner: `scripts/amc-parallel.mjs`。実Codexの並列起動は未受入。
- 今回のエージェント: Codexのネイティブ委任を使う役割定義と起動入口。別の永続実行台帳は作らない。既存Goalの実行枠・状態・履歴を上書きせず、成果は原本の許可された遷移でのみ反映する。

**Zema Webからの起動、自動同期、無人常時稼働、実機/決済/公開の受入は未接続。** プロンプト上の役割分離やGoal維持を、認証・強制隔離・機械的な正式検収の代用にしない。

## 復旧

Goalの版が変わった時は影響する任務を停止して再照合する。結果不明の作業を重複実行しない。元のGoalと成果を保持し、再開は既存の最新記録から行う。カスタム定義の更新は差分確認後に行い、異なる既存ファイルをインストーラーで強制置換しない。

実稼働確認（2026-10-04）: CLIのフォルダ信頼確認で停止し、実行部隊・検収担当は未起動。新規フォルダの信頼設定は本人の判断が必要。exit 0だけで任務成功とは判定しない。

## プロジェクト別Bot

「Sky BotへSkyの仕事を依頼し、成果をGitへ出す」ための開発用入口。流れは **依頼 → 担当Bot → 専用branchで実装・検証 → commit → GitHub PR**。GitHubはソースと成果の保存先で、Botを動かすのはCodex。現在は依頼時に開く対話セッションであり、常時実行やIssue監視は設定していない。

| ID | 担当 | 主な作業 |
| --- | --- | --- |
| `sky` | Sky Bot | Tool・MCP・Agent接続、marketplace |
| `zema` | Zema Bot | 仕事の依頼・進捗・承認・成果、保存／復旧 |
| `wallet` | Wallet Bot | 台帳・予約・照合・料金表示 |
| `rockstaros` | RockstarOS Bot | OS・AI・SIM/eSIM導入、Pixel・QEMU |
| `game` | Game Bot | 非金融ゲーム、作者SDK、sandbox |
| `security` | Security Bot | 本人性・権限・SPIDER・脆弱性修正 |
| `avocado-mini` | avocadoMini Bot | Mini・物質発明・試験資料 |
| `avokado-pro` | avokadoPro Bot | Pro・連携・試験資料 |
| `rocketstar` | rocketstar Bot | rocketstar・地上支援・試験資料 |
| `operations` | Operations Bot | 横断調整、Git・CI・進捗台帳 |

### 依頼方法

このbranchをcheckoutしたフォルダの対話ターミナルで使う。既存のCodex CLIと認証が必要。

```sh
npm run bot -- list
npm run bot -- show sky
npm run bot -- run sky --goal 'Skyの接続エラーを分かりやすくし、検証してPRにする'
# 既存taskを指定する場合
npm run bot -- run sky --task SKY07-01 --goal '既存の合格条件に沿って、このtaskを進めてPRにする'
# 起動せずに担当・task・指示を確認
npm run bot -- run sky --task SKY07-01 --goal 'このtaskを進める' --preview
```

新しいCodexセッションでは `.codex/agents/sky-bot.toml` などのネイティブ定義も利用できる。「sky-botを使って○○を実装し、PRを出して」と依頼する。既に開いたセッションの定義再読込は実行環境に依存するため、CLI入口は定義を起動時に直接渡す。設定は [Codex公式のcustom subagents形式](https://learn.chatgpt.com/docs/agent-configuration/subagents)に従う。

Botは既存の[作業部屋](../../workspaces/README.md)とtaskAssignmentsを読む。複数BotがO5などを参照していても、taskの主担当は台帳の一つの部隊のまま。`--task` はそのBotが参照する部隊か検査し、前提と親taskの保留も引き継ぐ。具体的な編集範囲は各依頼で絞る。プロンプトの担当分けはOSによるpath権限制御や、実装上の並列排他ではない。同時に進める場合は別worktreeを使う。

### Gitへ残すもの

- `codex/sky-<目的>` など、作業ごとのbranch。必要な変更だけをcommitする。
- PR本文に担当Bot、task、変更内容、検証結果、残課題を記録する。
- 最後にcommit SHAとPR URLを返す。独立検収、main統合、公開はそれぞれ別の結果として扱う。

Git authorとGitHub認証は既存設定を使う。この機能はGitHub Appを登録せず、Contributorsに`sky-bot[bot]`という専用名義を作らない。CLIの認証・モデル・承認・sandbox設定も変更しない。GitHubへ接続できなければ手元の変更／commitを保持し、未pushと理由を返す。

### 定義の更新・復旧・確認

正本は [data/amc/project-bots.json](../../data/amc/project-bots.json)、起動入口は [scripts/project-bots.mjs](../../scripts/project-bots.mjs)。追加・変更後に `npm run bot:update` で当該repositoryのTOMLを生成する。異なる既存custom定義は上書きしない。`npm run bot:check` は生成のずれを検出し、全体verifyにも含める。個別試験は `node --test tests/project-bots.test.mjs`。

中断したら既存branch・差分・PRを確認し、同じ成果を重複実行せずに再開する。CLIが無い、認証できない、フォルダ信頼や承認が必要な場合はその対話を解決する。起動プロセスのexit 0はtask／PRの合格証拠にはならない。具体的な開発依頼をBotで完走し、差分・試験・PRを照合する受入は、この定義・起動引数の試験とは別。

この入口は開発用で、SkyのAMC Toolや `amc:codex` の外部実行境界を変更しない。製品Webからの起動・無人運転・自動mergeは未接続。
