# Git / CI / Operations

## 2026-10-13 Notion図解ガイド（G04 / ROCK）

現行main `4273ef02`の実装・進捗・設計・schemaを4つの詳細資料、5つのPNG図、Mermaid構成/sequence/ERへ整理し、既存avocadoの子資料として配置する。料金方針と確認できない実売上を分け、Mini/Pro設計、Pixel APK、QEMU、公開Webを同じ受入へ換算しない。実catalogは37件/ready15件、PROJECTS.mdの36件/14件は旧集計。個別の本文・共有URLはGitへ転載せず、範囲と読戻し・検証結果は`data/project-status.json#notionVisualGuide`に残す。既存G04のdirty保全・main/branch/DB同期は継続し、Notion整理をruntime修正や公開受入として扱わない。


表示改訂：入口を全体図・7領域の現在地・次の3作業へ再構成。詳細4ページの重複表示を削り、Mermaid5図はプレビューのみへ変更。新入口の導線・画像・表をブラウザで確認し、旧案内と空フォルダを退役した。証拠は同じnotionVisualGuideに追記する。

## 目的

設計、実装、証拠、branch、PR、CI、Sites配備、release artifactを追跡可能にし、別候補や別環境の成功を混同しない。

## 2026-10-13 Notionの重複整理（G04 / ROCK）

利用者の明示削除指示により、類似旧企画・旧依頼・別repo案内・例示DB等23件をNotionのゴミ箱へ移動し、全件の復元表示を確認。共同作業トップとavocado現行ページの正本リンクを`k999ln/rock`へ統一し、削除ページへの案内を除去した。例示DB配下サンプルは23件に含めず、元の議事録・日報は履歴として保持する。GitHub repo本体や他の独立事業の削除、公開権限変更ではない。私的本文は保存せず、範囲と検証だけを`data/project-status.json#notionCleanup`に記録する。G04のGit/DB同期と個別受入gateは未完了のまま。

## 2026-10-13 Notion進捗の同期（G04 / ROCK）

利用者の更新指示に基づき、main `4273ef02`と同一SHAの6 checks success、Grid PR #103のopen状態を再取得。Notionのavocado専用現行進捗、日報2件、旧提案タスクの4ページを更新し、証拠リンク・未受入領域・関連プロジェクトを読戻し確認した。誤った未完了0件と予定の完了ラベルを訂正。私的本文はGitへ保存せず、Notionの履歴は保持する。今回の手動同期を自動化の完成へ換算しない。既存G04のGit/DB統合やruntimeの受入状態は変更せず、検証結果は`data/project-status.json#notionProgressSync`へ記録する。

## 2026-10-13 Notion進捗との照合（G04 / ROCK）

利用者指定の正本は`k999ln/rock`。main `4273ef02da9dbb28ede8ba8862b874615fa8a0d7`を取得し、PR #109のColumbia入口とPR #111の品質/複数Tool統合を確認した。PR #111の検証headは15/15 success、後続mainの取得6 checksは全success。共有Notionの個別内容はチャットで報告し、私的な本文・他事業の記録はここへ転載しない。Notionは未編集。

local baseline v1.97/160 taskに対しmainはv1.98/393 task。local `codex/esim-cloud-access` / `37c06cec`は先行dirty差分があり同名remoteなし。G04の順序は保全→最新main/引継ぎ/DB履歴の同期→個別差分の照合→統合候補検証を維持する。既存のlocal/公開/実機証拠をmainの受入へ移さない。

合格証拠はGitHubの同一SHA、PR merge readback、対象source/受入資料の対応。初回取得時の統合前snapshotは、後続mainで`mainMerged:true`へ更新済み。Notion整理では履歴と現行要約を分け、repo・task ID・SHA・実装/検証/公開/実機/本番段階を明示する。文書検査は合格、local全体verifyは既存DB集計ファイル2件の不一致で停止。記録と検証結果は`data/project-status.json#notionProgressAudit`と`project.md`。今回の記録のcommit/push/main反映、Notion更新は未実施。

## 2026-10-07 Git全体監査（G04 / ROCK）

結論は「監査完了、Git整理は未完了」。以下は監査文書を追記する前のsnapshot。元worktreeのmerge/reset、branch削除、commit/push、公開、GitHub設定変更は実施していない。[機械可読証拠](../evidence/git-organization-audit-20261007.json)にSHA、全branch/worktree、比較対象path、競合、CI、検証ログhashを保存した。

- **GitHub**: 全91 PRは74 merged、5 open、12 closed。main `0fbf688b4585b829f9e34d37799d446cb5a66b32` の取得11 check-runsは全success。open #84/#88/#89/#90はmergeable、#85はconflicting。5件とも各PR候補のチェックは成功しているが、統合済みではない。#69のbuild出力除外はmainへ統合済み。
- **作業木**: 全8 worktree中3つに計127変更file（同じpathの別worktree出現を含む）。rootは64 tracked変更＋33 untracked＝97。Pro PCは5、portable-runtimeは25。portableの20 fileはmainとblob一致、残りはmain側の3記録と2試験の`void test`修正が新しい。未commit件数を新規未統合機能数にしない。stashと現在のunmerged indexは0。
- **rootの分岐**: `codex/esim-cloud-access` / `37c06cec` はlocal-only2、main-only165 commit。同名remote/PRはないが、関連するPR #85にはroot変更の21 fileと同一内容がある。rootの4 fileは既にmainと同一。既存PRと後続実装を照合し、再作成を避ける。
- **競合**: 隔離cloneの`merge-tree`で、PR #85対mainは8 file、root作業snapshot対mainは31 file競合。#85の対象は`.github/spider/gitleaks.toml`、`.github/spider/public-value-provenance.json`、`.github/workflows/spider.yml`、`app/connect/page.tsx`、`data/database-status.json`、`data/project-status.json`、`docs/database-status.md`、`project.md`。
- **DB移行**: mainは`0059_sky_library`、PR #85はそれに`0060_esim_cloud_access_keys`を追加。rootは`0059_esim_cloud_access_keys`、`0060_sky_usage_payments`、`0061_esim_cloud_proof_uses`を持つ。適用済みDB履歴を確認し、番号・journal・schema・snapshot・migration union試験を統合する。既適用migrationを無条件に改名しない。
- **進捗正本**: rootは160 task、mainは378 task。共通ID156、rootだけのIDは`B06/G04/SIM01/SKY21`、mainだけのIDは222。両者のbaselineはv1.96だが内容は異なる。taskの後継関係と合格証拠を確認して同期する。
- **branch整理**: local16 branch、実在remote10 branch、削除済みremote tracking38参照。local `main` は426 commit遅れ。remoteの`codex/jev-decision-layer-20260920`と`codex/pixel10-compile-bringup-20260917`はmainの祖先。`codex/os-completion-prompts`（1 commit）と`fix/readme-english-ci`（3 commit）はmainへ一致するpatchがなく、open PRもないため回収判断が必要。
- **生成物**: mainから削除済みの`services/sky-billing/work/sky-billing-dry-run/worker.js`と`.map`がrootでは追跡・変更されている。古いtreeから再導入しない。固定vendor原本・依頼済み設計archiveとは区別する。
- **履歴と設定**: closed12 PRのうち5 headはmainの祖先、#59はpatch同等で#60へ置換。#5の署名workflow、#6の署名script/testはmainとblob一致。#14/#11/#9/#4には現行実装・文書への置換理由が記録されており、patch非同等だけで紛失扱いしない。GitHubはmainの`protected=false`、ruleset一覧なし、merge後branch自動削除ON。設定は変更していない。

検証: `git fsck --connectivity-only --no-dangling`、`git diff --check`ともexit0。`TMPDIR=/private/tmp npm run verify`は初回sandboxでlocalhost `listen EPERM`によりexit1、通常権限で再実行してexit0（Node897、Worker/D1 1178、CSV113、Web asset missing0）。署名アクセス証拠の9 source hash、共通決済証拠の8 source hashも現在のsourceと一致。ローカルruntimeのfixture合格であり、main統合候補・Provider・実機・本番配備の受入ではない。監査後の文書同期チェックは証拠JSONへ別記する。

次の順序: (1) 全dirty treeを保全して最新main/引継ぎ入口を同期、(2) 依存/security PRを同一候補で検証して統合、(3) #85の競合を解き、後続の署名・決済・compositionを必要差分だけ回収、(4) migrationと進捗/設計正本を照合、(5) 統合候補の全体verifyと同一SHA CI、(6) GitHub保存・main読戻し後に既統合worktreeと不要branch/参照を整理。Claudeのアカウント主導案は提案資料であり、本監査で製品方針・料金を変更した事実はない。

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
