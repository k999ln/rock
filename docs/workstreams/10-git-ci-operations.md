# Git / CI / Operations

## 目的

設計、実装、証拠、branch、PR、CI、Sites配備、release artifactを追跡可能にし、別候補や別環境の成功を混同しない。

## 現在地

- 正本は `k999ln/rock`、originはGitHub、Sitesは配信用と定義済み。
- 進捗は `data/project-status.json`、要望は `docs/product-baseline.md`、再開条件は `docs/current-state-20260911.md` に分離されている。
- 2026-09-15にsites/mainとの競合を解消し、統合commit `acd7ab0`へ収束した。
- 現在はLocal AI／Androidの追加実装が作業ツリーにあり、次の優先はこの差分を単一の検証可能な変更単位へ整理すること。

主なtask: `R02`, `R04`, `R05`, `G01`, `G02`, `B04`, `LCH06`。

## 次に進める順番

1. `git status` でLocal AI／Androidと文書整理の差分を確認し、意図しない混在を避ける。
2. OS07／OS08のコード、source lock、artifact gate、証拠、設計を一つの変更単位として整理する。
3. 正本5ファイルのversion、task状態、nextActionを一致させる。
4. 対象試験から始め、最後に `npm run verify` を完走する。
5. commit SHAとCIを確認してからpush、Sites配備、releaseを別々に実施する。

## 完了条件

- unmerged pathが0で、意図不明のdirty差分がない。
- README、project、product baseline、project statusが同じ現在地を示す。
- 同じsource SHAのCI結果を保存し、古いsnapshotを最新確認に使わない。
- GitHub保存、Sites配備、一般公開、release公開を別イベントとして記録する。

## 関連資料

- [Git consolidation](../git-consolidation.md)
- [Prompt playbook](../prompt-playbook.md)
- [Design/implementation alignment](../design-implementation-alignment-20260909.md)
- [Current state](../current-state-20260911.md)
- [Project status](../../data/project-status.json)

## 検証

- `git status --short --branch`
- `npm run project:check`
- `npm run repository:check`
- `npm run verify`
