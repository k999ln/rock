# Git / CI / Operations

## AMCとCSVの限定統合（2026-10-05、G04）

今回の「mainにあげて」は、既存のAMC有限fixture 7 scripts / 6 testsとCSV共通処理4修正を最新main `996b1955`起点で統合する承認として扱う。旧ローカルtree全体、別作業のカタログ/UI/配備差分は持ち込まない。主担当ROCK、G04はin_progress。対象試験、固定Goal CLI、全体verify、同一SHA CI、main反映を[今回の証拠](../evidence/amc-fixture-csv-main-integration.json)で分けて記録する。[AMC設計](../amc-autonomy-fixture.md)の実worker・Web未接続と[CSV契約](../csv-business-v1.ja.md)の共通処理範囲を保持する。GitHub統合はSites公開や実AI/課金開始を意味しない。

## 目的

設計、実装、証拠、branch、PR、CI、Sites配備、release artifactを追跡可能にし、別候補や別環境の成功を混同しない。

## 2026-10-05 未統合PRの現行mainへの収束

利用者のmain反映指示により、G04で未統合20 PRを照合する。SIM/eSIM利用開始、本人認証、署名付きモデル、見積・上限の現行契約を保持する。依存PR #53/#54/#55/#56/#60を統合し、Cloudflare peer型とlockを整合させる。依存変更後は `node scripts/sync-web-license-inventory.mjs --write` でlock由来の在庫だけを再生成し、法的clearance・公開gateは独立して維持する。全体verifyと同じSHAのCIが完了するまでmain統合完了とは記録しない。

## 2026-10-02 共通実装統合

G04では[重複実装の統合記録](../git-consolidation.md#2026-10-02-共通実装の統合g04)に従い、既存mainとPR #39/#51、AI/MCP/保存/決済/公開Previewの共通処理を一つの検証経路へまとめる。下記の「open PR 0」は2026-09-15時点の履歴であり現在値ではない。今回固有機能を持つ未merge PRを削除せず、共通処理の更新後に各branchをrebaseする。

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

- [RockstarOSの特許調査](../research/rockstar-patent-research.html)・[出典一覧](../research/rockstar-patent-sources.json) — 2026-09-30の調査snapshot、2026-10-05保存。出願・現在のmainの再評価ではない。

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
