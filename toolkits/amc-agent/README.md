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
