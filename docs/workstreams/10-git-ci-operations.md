# Git / CI / Operations

## 目的

設計、実装、証拠、branch、PR、CI、Sites配備、release artifactを追跡可能にし、別候補や別環境の成功を混同しない。

## 現在地

- 正本は `k999ln/rock`、originはGitHub、Sitesは配信用と定義済み。
- 進捗は `data/project-status.json`、要望は `docs/product-baseline.md`、再開条件は `docs/current-state-20260911.md` に分離されている。
- DB状態は5境界のsource inventoryと本番readbackを分離し、`database:status`でJSONと文書へ同期する。
- 2026-09-15にsites/mainとの競合を解消し、統合commit `acd7ab0`へ収束した。
- 2026-09-15にGitHubのPR #1〜#23を再監査し、13件はmain統合済み、10件はmainへ同一または後継実装が統合済みの旧PRとして閉じた。open PRは0件である。
- GitHub remoteの旧作業branchと一時archive branchを削除し、remote branchを`main`だけへ収束した。repository設定のmerge後branch自動削除も有効化した。
- 最新mainの版境界、repository map、schema、DB source、進捗、全体CIを照合した。GitHub保存と本人限定Sites配備・本番D1 readbackは別であり、Sitesのowner workspace access blockerは未解決である。
- 別のローカル作業履歴はGitHub正本へ自動採用しない。mainへ既に入った変更、確定要望を増やす名称・要件変更、採用根拠のない差分を分け、必要な変更だけを最新main起点の単一branchへ移す。

主なtask: `R02`, `R04`, `R05`, `G01`, `G02`, `B04`, `LCH06`, `DB01`。

## 次に進める順番

1. 新規作業は最新`origin/main`から一つのtask branchを作り、既存task IDと完了条件へ結び付ける。
2. 正本5ファイルのversion、task状態、nextActionを同じ変更単位で一致させる。
3. 対象試験から始め、最後に`npm run verify`を完走する。
4. PRの同じsource SHAでCIを確認してmainへ統合し、merge済みbranchは自動削除する。
5. Sites配備・本番readback・一般公開・release公開はGitHub保存とは別に記録する。

## 完了条件

- GitHub remoteのopen PRと未整理branchが0で、正本branchが`main`へ収束している。
- README、project、product baseline、project statusが同じ現在地を示す。
- 同じsource SHAのCI結果を保存し、古いsnapshotを最新確認に使わない。
- GitHub保存、Sites配備、一般公開、release公開を別イベントとして記録する。

## 関連資料

- [AMC Goal Orchestrator](../amc-goal-orchestrator.md) — H1 / AMC02。指示・部隊・親子task・Goalを束ねるローカル計画と検収台帳。外部実行adapterは別段階。

- [rocketstar・衛星・OS・ボタンの完全保存アーカイブ](../rocketstar-design/README.md) — DOC03。利用者の保存指示により原本・生成元・旧版・QA画像を保持し、全ファイルのhashを検査する。現行R5要件とアーカイブ内E3前提は分ける。

- [Git consolidation](../git-consolidation.md)
- [Prompt playbook](../prompt-playbook.md)
- [Design/implementation alignment](../design-implementation-alignment-20260909.md)
- [Current state](../current-state-20260911.md)
- [Project status](../../data/project-status.json)
- [Database status](../database-status.md)

## 検証

- `git status --short --branch`
- `npm run project:check`
- `npm run repository:check`
- `npm run database:check`
- `npm run verify`

## SPIDER cycle 43: CI依存の復元

H1 / R04、ROCK。main `ecb4b2af`は古いmanifestと新しいlockを別のmerge親から取り込み、`npm ci`が検査・Web build前に停止している。直前main `624124cf`と同一のlockを維持し、Cloudflare/Vitestの5宣言と`undici@7.29.1`の既存overrideだけを戻す。CIは通常の`npm ci`を使い、install scriptや検査の省略で通さない。ローカルのoffline dry-runは依存展開なしの整合性確認であり、GitHub上の実install・build・全体verifyとは分ける。[証拠と残課題](../evidence/spider-locked-dependency-restore.json)を参照する。


## AMC観測元のファイル読取り

H1 / AMC02、ROCK。SPIDER cycle 47は観測元のpath差替え競合だけを扱う。[既存AMC設計](../amc-goal-orchestrator.md#spider-観測元ファイルの安全な読取り)と[証拠](../evidence/spider-observation-source-read.json)へ集約する。検証は `node --test tests/amc-sky-observe.test.mjs`、同じbranch/SHAのCodeQL。通常AMC importの既存export欠落、全体CI・配備の未合格を別に残す。
