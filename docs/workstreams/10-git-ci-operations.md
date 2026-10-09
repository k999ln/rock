# Git / CI / Operations

## プロジェクト別開発Bot（AMC03 / H1 / ROCK）

[担当Botの利用方法](../../toolkits/amc-agent/README.md#プロジェクト別bot)。開発Botの正本はdata/amc/project-bots.json。既存32部隊のtaskAssignmentsを置き換えず、10個の依頼窓口として実装・検証・Git commit・PR提出を担当する。OWNERは具体的な依頼と既存の外部実行条件を決め、EXTERNALはCodex／GitHubの認証と実行環境を提供する。GitHub App、常時実行、main自動mergeは未設定。完了条件は全定義の生成一致、担当外task拒否、holdの引継ぎ、起動失敗とPR受入の区別、対象試験と同一SHAの全体verify。検証: `npm run bot:check`、`node --test tests/project-bots.test.mjs`、`npm run verify`。実BotのGit提出は具体的な開発依頼で別途受け入れる。

## 作業部屋の維持（ORG04 / H1 / ROCK）

[作業部屋一覧](../../workspaces/README.md)は既存AMCの32分野をフォルダへ分けた作業入口。主担当はtaskAssignments、状態はproject-status、手順と合格条件はtaskPlansのまま維持する。場所と確認コマンドだけをdata/workspaces.jsonへ持つ。完了条件は全taskの一意な所属、参照pathの存在、親から子への実行保留の継承、更新後の生成物一致、対象試験とnpm run verify。新しい思いつきはアイデア置き場へ記録し、採用前に製品要件や実行へ昇格させない。

GitHub main 0455499d8726118b8892c5cfbe2e49236c8b4c31を基に専用worktreeで着手。同SHAの取得19 checksはsuccess。元のcodex/esim-cloud-accessはremoteに存在せず、多数の未保存差分があるため触らない。先行変更回収は別作業であり、入口整理をその統合完了とは扱わない。次担当は最新mainと自分のbranchを再確認し、npm run work -- <task ID>の担当・前提・holdを使う。GitHub保存・main統合・公開は別記録。

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
- [RockstarOSの特許調査](../research/rockstar-patent-research.html)・[出典一覧](../research/rockstar-patent-sources.json) — 2026-09-30の調査snapshot、2026-10-05保存。出願・現在のmainの再評価ではない。

- [rocketstar・衛星・OS・ボタンの完全保存アーカイブ](../rocketstar-design/README.md) — DOC03。利用者の保存指示により原本・生成元・旧版・QA画像を保持し、全ファイルのhashを検査する。現行R5要件とアーカイブ内E3前提は分ける。

- [統合で失われた情報の監査（2026-10-07）](../merge-loss-audit-20261007.md) — 2026-10-05の `ecb4b2af` ほかで文書と台帳が古い内容へ戻った経緯、復元した範囲、owner判断待ちの項目。次の担当は[文書整理の引き継ぎ](../prompts/docs-reorg-handoff-20261007.md)から始める。
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

## 2026-10-02 共通実装統合

G04では[重複実装の統合記録](../git-consolidation.md#2026-10-02-共通実装の統合g04)に従い、既存mainとPR #39/#51、AI/MCP/保存/決済/公開Previewの共通処理を一つの検証経路へまとめる。下記の「open PR 0」は2026-09-15時点の履歴であり現在値ではない。今回固有機能を持つ未merge PRを削除せず、共通処理の更新後に各branchをrebaseする。

## 2026-10-05 未統合PRの現行mainへの収束

利用者のmain反映指示により、G04で未統合20 PRを照合する。SIM/eSIM利用開始、本人認証、署名付きモデル、見積・上限の現行契約を保持する。依存PR #53/#54/#55/#56/#60を統合し、Cloudflare peer型とlockを整合させる。依存変更後は `node scripts/sync-web-license-inventory.mjs --write` でlock由来の在庫だけを再生成し、法的clearance・公開gateは独立して維持する。全体verifyと同じSHAのCIが完了するまでmain統合完了とは記録しない。

## AMCとCSVの限定統合（2026-10-05、G04）

今回の「mainにあげて」は、既存のAMC有限fixture 7 scripts / 6 testsとCSV共通処理4修正を最新main `996b1955`起点で統合する承認として扱う。旧ローカルtree全体、別作業のカタログ/UI/配備差分は持ち込まない。主担当ROCK、G04はin_progress。対象試験、固定Goal CLI、全体verify、同一SHA CI、main反映を[今回の証拠](../evidence/amc-fixture-csv-main-integration.json)で分けて記録する。[AMC設計](../amc-autonomy-fixture.md)の実worker・Web未接続と[CSV契約](../csv-business-v1.ja.md)の共通処理範囲を保持する。GitHub統合はSites公開や実AI/課金開始を意味しない。

## SPIDER cycle 43: CI依存の復元

H1 / R04、ROCK。main `ecb4b2af`は古いmanifestと新しいlockを別のmerge親から取り込み、`npm ci`が検査・Web build前に停止している。直前main `624124cf`と同一のlockを維持し、Cloudflare/Vitestの5宣言と`undici@7.29.1`の既存overrideだけを戻す。CIは通常の`npm ci`を使い、install scriptや検査の省略で通さない。ローカルのoffline dry-runは依存展開なしの整合性確認であり、GitHub上の実install・build・全体verifyとは分ける。[証拠と残課題](../evidence/spider-locked-dependency-restore.json)を参照する。


## AMC観測元のファイル読取り

H1 / AMC02、ROCK。SPIDER cycle 47は観測元のpath差替え競合だけを扱う。[既存AMC設計](../amc-goal-orchestrator.md#spider-観測元ファイルの安全な読取り)と[証拠](../evidence/spider-observation-source-read.json)へ集約する。検証は `node --test tests/amc-sky-observe.test.mjs`、同じbranch/SHAのCodeQL。通常AMC importの既存export欠落、全体CI・配備の未合格を別に残す。


## AMCエージェント定義の事前確認

H1 / AMC02、ROCK。SPIDER cycle 48は既存定義の読取り競合（#52）を扱い、新規作成側（#53）は別の未解決として残す。[既存AMC設計](../amc-goal-orchestrator.md#spider-既存エージェント定義の読取り確認)と[証拠](../evidence/spider-agent-preflight-read.json)へ集約。実Codex設定を変更せず、`node --test tests/amc-agent.test.mjs tests/amc-agent-preflight.test.mjs`で合成projectを検証する。


## 生成物の整理（G01、2026-10-05）

主担当ROCK。再生成可能なSite出力とBilling dry-runをGit管理から除き、`repository:check`で再混入を拒否する。設計archive・同一artifactの受入証拠・固定vendor・配布素材は保持する。[保存区分と再生成手順](../git-consolidation.md#repository-storage-policy)を参照。GitHub保存、main統合、公開配備は別々に記録する。


## 停止条件の解消と残る受入（2026-10-05、G04）

最新基点`996b1955`から専用branch `codex/release-blockers`で継続。前回報告のWeb/Android失敗はPR #62で修正済み。native main-1は322 assertions自体は成功していたが、`test_memory_store.py`の3 SQLite接続が未closeで厳格なログ検査が失敗した。`closing`とtransaction contextを組み合わせ、ResourceWarningの検出は維持する。修正commit `c79476e2`のLinux全partitionと`npm run verify`はCI成功。製品runtime修正やOS起動合格とは扱わない。

Local AI unsigned APKの現行source buildを再開し、CI `37278057340`で`sdkmanager: command not found`を再現。存在確認だけだったSDK pathを`GITHUB_PATH`へ登録する修正を`9d82ac5a`へ保存した。後続のKotlin timeout型/API応答版/APK版検査、phone準備status判定を修正し、run `37279537731`で現行v4 APK build成功。実bytesを取得してaapt2・stage/再stage/verifyを照合し、overlay列をartifact lockへ固定した。関連40試験成功。実機未接続のためv4端末受入は未実施。詳細は[同一artifact証拠](../evidence/local-ai-apk-v4-build.json)。

残る項目と再開条件:

| 系統・既存task | 担当 | 停止条件と次の合格証拠 |
| --- | --- | --- |
| Local AI OS08/OS09 | ROCK/JOINT | 現行v4 overlayのAPK build/ABI/permission/hashと実stage検査は合格。次に対象Pixelでimport、offline plan、停止、再起動を同じAPKで受入。旧v2実機証拠は保持。 |
| Pixel全OS OS02/OS11/RLS02 | OWNER/ROCK | 専用x86_64 Linux・64 GiB RAM・空き400 GiBと予算/アカウント、現行APKを固定してcompile-onlyを実行。署名・flashは別の4/4 gate。 |
| QEMU配布 LCH02/LCH03/LCH07 | OWNER/ROCK | 製品license選択、正式鍵・署名運用、署名後の同一候補で導入/復旧。現在6/10で、旧VMの成功を最新候補へ転記しない。 |
| Sky/Cloud/SIM SIM01/SKY07/SKY21 | JOINT/OWNER | 本番設定、販売者/通信会社の契約・接続、実Providerの料金/usage/請求照合、公開同一sourceでdesktop/Pixel受入。eSIM/決済の別作業branchは自動混入しない。 |
| Wallet/販売 B03/BIL02/WLT06 | JOINT/OWNER | 一般MarketplaceのStripe Connect sandbox・払出し、本人Wallet署名と指定chain/額/宛先。既存CSV専用決済の受入を一般Marketへ拡張しない。 |
| AI/非金融Game AI02–AI07 | ROCK/JOINT | main統合済みhost fixtureをnative runtimeへ接続し、2モデル切替・旧仕事復旧・限定記憶・単一実行端末・Game/IPを同一契約で受入。 |
| Material/mini MAT03/MAT05/MAT15 | ROCK/JOINT | Core→UI/Sky adapter、合成scene/poseの実装と、別途R5の光学/3D入力/熱/電源/回路・実機試験。旧E1/E2/E3未完了を現行R5製造の必須手順へ自動継承しない。 |
| IP Studio SKY07/SKY14 | JOINT | 別repositoryのIP Studio runtime、LiveKit Agent/声/モデル/接続先/費用上限、電話Providerを確定して音声・停止・再接続を受入。設定画面保存は実通話ではない。 |
| Security PR #52 | ROCK/JOINT | PR #52は並行作業でmainへ統合され、Web実測も合格。現行CodeQL workflowは合格したが、既存alertの解消とは別。履歴978 commitの2,868候補出現の元byte分類は未解決。未分類値や失敗をallowlist/警告dismissで消さない。 |
| 依存監査 G04 | ROCK/EXTERNAL | GitHub alerts #17 `braces` と #18 `http-cache-semantics` は照合時に修正版未掲載。依存経路と外部入力到達性を調べ、修正版/除去後に検査。未解決のまま保持。 |

再現コマンド: `PYTHONPATH=src:os:tests python3 -B -W error::ResourceWarning -m unittest test_memory_store -v`（native root）、`npm run verify`、Linuxで`python3 scripts/test-native.py --output <new-output-dir> --diagnostic-stacks`。状態確認は`node scripts/check-release-readiness.mjs`、`node scripts/check-android-first-flash-gate.mjs`、`node scripts/check-sky-launch.mjs --require-stage focused`。最後のfocused未合格exit 1は既知の受入不足で、試験失敗を隠す目的でgateを外さない。

後続native CIでGame B/ATMの合計処理時間だけが2秒を超えたため、transportをEvent境界で保持して独立性を検査し、実TLS deadlineは従来の範囲で別計測する。関連7試験・独立処理3.1秒遅延の再現が合格。失敗runと同一sourceでの成功runも証拠JSONに保持した。

## 残PRの開発・契約復旧（G04、2026-10-05）

ROCK担当。#63–65 / #69–76をmain 0c90253cへ統合する。ecb4b2afで失われた依存宣言・SIM利用権正本・AMC認可/再検収/強制停止・catalog接続契約・API検証範囲を復旧する。現在のWorkPlan保存とSky library、AMC手動入力UIは保持する。生成物の整理・LLM host研究・Mini launcher・Local AI APKはそれぞれの受入境界を維持する。対象回帰→npm run verify→同一SHA CIが合格条件。秘密情報履歴の候補は未分類で、検査の無効化や広い除外をしない。

依存更新PR #79–81: lock変更時はMIT/BSD等のmetadata差分を確認し、`node scripts/sync-web-license-inventory.mjs --write`で台帳を同期する。root/site双方のsource-map-jsとproxy-addr/tinypool/oxfmtを検証。詳細は `docs/evidence/open-pr-integration.json` のdependencyFollowup。法的clearance・未修正advisory・履歴secret・本番gateは独立。
