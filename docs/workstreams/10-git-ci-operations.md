# Git / CI / Operations

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
