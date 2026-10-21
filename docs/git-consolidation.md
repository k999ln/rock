# Gitの正本・保存・復元方針

製品と設計の正本は `k999ln/rock`。読む入口は[サービス統合設計](service-design/README.md)、現行要望は[製品ベース](product-baseline.md)、repository境界の機械可読正本は[`data/repository-map.json`](../data/repository-map.json)。GitHubへの保存、本設計のmain統合、Sitesでの公開、実機/本番受入は別に記録する。

## 所有と境界

RockstarOS・Sky・Zema・Jenniferと各hardware programは同じ製品契約を使う。共通identity、権限、schema、workflow、Receipt、復旧は`rock`で一意に管理する。`k999ln/Mr.`は運用componentの別責務で、credential・顧客原稿・運用秘密を公開Gitへコピーしない。`k999ln/vvvv`等の旧repositoryは新規作業先にしない。取得済み外部sourceを、その運用指示や実アカウントの実行許可へ換算しない。

`vendor/mr`の原本とprovenance/hashは不変。共通APIが必要な変更はadapter側へ行い、`python3 scripts/package-mr.py`と対象試験でsource/配布物を一致させる。Tool作者の署名をOS/platform鍵で代行せず、OS側が権限・失効・資源制限を強制する。

<a id="repository-storage-policy"></a>

## Gitへ保存するもの

実装、設定、最小限のfixture、現行設計、必要な受入証拠、復旧手順を保存する。OS image、build cache、再生成可能な大量ログ・frame・dry-run出力はGit管理外またはrelease artifactへ置く。固定原本PDF/R5/R1、IMPORT-MANIFESTと対象artifactのhashを持つ証拠は、その保存契約を維持する。原稿や秘密値をGitへ追加しない。

公開repositoryの現行fileは平文で読める。一時的な過去の暗号化を、現在の復元に必要な鍵として案内しない。法務/特許の原稿とcredentialの保管は、sourceの公開状態とは別に本人/保存契約で管理する。

## 作業と統合

現在main、作業branch、PR、同一SHAのCIを取得してから対象source/fixture/証拠を読む。未保存差分のあるcheckoutを保全し、別作業は専用worktreeで行う。branchは`codex/`を用い、履歴を書き換えず通常のcommit/mergeで保存する。競合では現行契約と双方の必要な変更を保全し、削除台帳に登録された旧内容を復活させない。

`project.md`は現在地・次作業・検証と生成台帳の入口にする。旧作業ログの全文を累積させずGit履歴から読む。正本・索引・status/Mission Controlを同期し、`npm run project:update`、`npm run metadata:check`、`npm run baseline:check`、`npm run design:check`、`npm run verify`を通す。Git保存やCIをProvider/実資金/実機/飛行の受入へ加算しない。

<a id="obsolete-content-cleanup"></a>

## 旧内容の削除と復元

2026-10-13の利用者の明示指示「古くて紛らわしい不要な内容は削除」により、初期製品/構成/ファンド・旧OS分冊/監査・旧account提案/SIM主入口・旧Commerce prompt・仕様変遷の重複文書を削除した。必要な現役契約は共通設計02/04/06、OS検証、Commerce、Wallet workstreamへ統合。署名claimは[サービス利用権](service-entitlements.md)へ再編した。

製品ベースの旧SIM/旧Mini価格・寸法・日付追記と、projectの長い旧作業ログを現行本文から削除した。RQ01〜RQ50、ゲーム/物質発明、署名・失効・復旧・料金保留と未受入gateは保持する。Miniの旧4塔/Hub・41万円の紹介とP0回転模型を撤去し、R5の1本自律・200mm以内・別Hub不要・価格未確定へ同期した。

削除前の復元commitは `98a4898e9ea3bbafe276d3357d0a7bebf35eb6cb`。[削除台帳](../data/archived-paths.json)の`restoreCommits[path]`が今回のpath別復元先を持つ。以前の削除分は既存の`commit`（`96845e6006c15e39ba5b45495f79c21bdff7399e`）を維持する。台帳を混ぜて一つの古いSHAへ置き換えない。

例: `git show 98a4898e9ea3bbafe276d3357d0a7bebf35eb6cb:docs/sim-led-product-architecture.md` で削除前の本文を読む。`git show`は読取であり、旧仕様を現行へ復活させない。新しく削除するpathは、固定原本条件・incoming参照・現役契約の受け皿を確認し、`git cat-file -e <restoreSHA>:<path>`で実在を確かめてから台帳へ登録する。

検査が旧入口pathを要求する場合は、同じ意味の現行正本を検査するよう同期する。原本hash、要求、Tool/schema、安全/料金gateの判定を削除・緩和して通さない。凍結された過去証拠のpath/hashは保持し、現行のtaskPlan・索引・読取入口を更新する。
