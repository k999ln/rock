# RockstarOS 1.0 ローンチ準備

状態: **BLOCKED_FOR_LAUNCH**。Webの改修・履歴統合・検証は実施したが、原TLS原因、製品許諾、管理鍵、既存Sitesアクセス、CM選択、最終配布受入は完了していない。一般公開・main merge・実請求・実資金・実機書込みは実施しない。

## 正本と境界

2026-09-10 22:03 UTC再開時、GitHubの候補は `97d952937add42de04092a2e6c2fac8aba3d8bad`、[同SHAの全9check成功](evidence/launch/ci-97d9529.json)、PR #4 MERGEABLE。Hubの実装・検証を保持して、TLS fixtureの分離と新候補の署名前準備を進める。Sitesは再確認でもNOT_FOUND、署名Environment/control ref/初回workflow登録は未設定だった。

署名の初回登録にはdefault branch配置が必要なため、[Draft PR #5](https://github.com/k999ln/rock/pull/5)でworkflow1ファイルのみのbootstrapを準備した。SHA `a4411622031858d6d9684c599d857cadaf90bb94`、mainには未merge。利用者がその限定bootstrapを明示承認するまでは実署名リハーサルに進めない。これは一般公開と製品PR #4のmerge承認とは別。条件が満たされた後はPR #5→実署名/全受入→最終承認→PR #4の順となり、mainが変わった時点で最終tree/CIを再照合する。

Draft編集後のURL変化と新旧証拠の取り違えを避けるため、[tag・numeric ID・hashで再取得する手順](release-artifact-access.md)を追加した。元の固定済み証拠内URLや旧配布物は書き換えない。

- 開始時GitHub取得: main `7cdbb5fedc86ee3978ed329d9312147d137c9199`、再開 `codex/rockstaros-release-20260910` の `29e4f7203f72d9949e2dfc90b64c4215d4bbb765`。
- 保存済みSites source `c6942d5ef72e9dd16345b9363e68e0e18ca25079` を実merge。両親と元migrationを保持する。先行Hub改修commit `d713e50`。この文書を含む統合commitはGit履歴、最終40桁SHAと結果はPR/CIの原証拠を正本とする（文書の自己参照SHAは作らない）。
- 既存配布の凍結native/同梱host toolsは `9abf78a80d27aa9f847c4051d20e4c552e407276`。初回作業は試験診断と証拠検査のみだったが、再開時には新sourceのpackagerへ `--unsigned-external` も追加した。image・runtime・元1GB packageのbytesは変更していない。変更したpackagerを旧freezeと組み合わせることは拒否されるため、実生成には新source・fresh build/freeze・受入が必要。新Web/MCP adapter/packagerと旧配布host toolsを同一版の受入と表示しない。
- macOS 15.7.4 / Apple Silicon / Lima 2.2.0 / Debian 13 / ARM64 QEMU virt-10.0に限定。Web package `rock-star@0.1.0`、表示製品 `RockstarOS 1.0 Developer Preview`、旧package `1.0.0-preview.20260910`、旧Draft tag `v1.0.0-preview.20260910-rc1` は別の版識別子。

## 記録済みの検証結果（85620ec）

現候補 `85620ec8b0d5d9913cd2d50f8ead4fbe109ee9bb` はGitHubでMERGEABLE、Web/native/Android/署名fixtureの全10check成功（同名署名testのpush/PR2件を含む）。[40桁SHAと原check URL](evidence/launch/ci-85620ec.json)。CIはheadを直接checkoutし、native全1,670件/17checks/skip0、root UIも成功。先行release `bfc4ae32f327c4cd08fc39a8fbab0e37b4fb9b2c` の独立native全runも成功した。両者のコード入力比較は別の証拠に記録し、原TLS原因確定とはしない。

ローカルの `npm run verify` は93tests、fresh/両upgrade D1、仕事API143assertionsと実行APIに成功。`os:check`、production/全依存audit0、公式Sites build、署名fixture22、診断/証拠検証21も確認。これらはWeb/host/source/fixtureの範囲であり、未承認の新package受入ではない。本文同期後のcommitは、この記録を自分の成功に転記せず、PR #4のそのHEADのCIを改めて確認する。

## LCH01 — 原TLS原因: BLOCKED_HISTORICAL_CAUSE_UNDETERMINED

再開調査で、`test_contract_runtime_lifetime.py` が共有 `time.monotonic` を差し替えて別threadの時計を壊すfixture不具合を決定的に再現した。対象moduleだけのclock proxyへ修正し、新規 `test_contract_runtime_clock_isolation.py` を追加。修正前1FAIL、修正後13PASS/skip0をrootでも確認。runtime/通信期限は不変。[追加所見](evidence/launch/tls/resume-findings.md)、[元FAIL・原artifact・再現結果](evidence/launch/tls/resume-evidence.json)。再現harnessを含む原本ZIPは `lch01-resume-evidence-20260910-v1.zip`、178,035bytes、SHA256 `9766205647ae8ceac17253e01ba1c636182ad2be796ba2f535c435bcd4ca0d3c`。

関連70caseのcleanup観測はPASS/skip0で残存threadなし。別の歴史的順序prefixはmacOSで既存Linux専用2caseをskipしたため、全回帰PASSには数えない。原e430 artifact15fileには同時刻server stack/timingがなく、fixture不具合の試験はTLS失敗の117case前に正常終了していた。したがって原TLSの原因は未確定のまま。次の必要観測は、同じ1秒失敗時のserver処理段階/stackとCPU/待機時間であり、別事象のfixture修正を原TLS解消へ読み替えない。

9ab ARM64のWallet10 TLS ERROR、e430 run34477407336のGame承認1秒timeout、ba900/3d07の600秒累積終了を区別して保持。[原因調査と原証拠](evidence/launch/tls/findings.md)、[機械可読観測](evidence/launch/tls/evidence.json)。1byteずつのTLS header readとGIL競合の増幅は実測したが、buffer化でも強い競合下のtimeoutは消えず、歴史的原因の確定とはしない。

変更: `scripts/test-native.py`、`systems/rock-star-os/tests/native_failure_diagnostics.py`、partition runnerと回帰試験。失敗が発生した時点でcleanup前の全thread stack・CPU/負荷をprivate sidecarへ保存する。秘密を含み得るlocals/例外内容は出力しない。mergerはwatchdog/失敗stackのfilename・bytes・hash・regular-fileを再検査し、欠落/改変/aliasを拒否する。[改変拒否の比較証拠](evidence/launch/tls/sidecar-integrity-evidence.json)。timeout600/300、skip基準、runtime期限は不変。timing JSONLはこのsidecar hash保証の対象外。

検証: 診断/partition/sidecar対象21件成功（0skip）。最終Linux全partition/root UIはPRの実HEAD checkoutで実行する。次: 原FAILと結び付くthread/負荷の観測を新診断で得て原因を確定し、修正前後の同条件試験を行う。担当: 開発。独立2runは同じ最終source・同じ4partition/root UI条件で比較し、単なる回数で原因確定にしない。runtime/image変更を選ぶ場合は新freezeとD0〜D6・導入/復旧を全て取り直す。

## LCH02 — 配布条件: AWAITING_OWNER_LICENSE_DECISION

[一枚の判断資料](evidence/launch/legal/decision-one-page.md)にApache-2.0/MPL-2.0/評価用独自条件の比較、推薦理由、権利者が決める範囲を記録した。製品全体のLICENSEを推測で追加していない。

元archive全706 regular file、rootfs1,981path、stage0702entry、legal298entry、nested source430,409entry、計434,096recordを照合した。元候補には同buildのBuildroot legal-info・対応Git source・Buildroot sourceが既に存在し、未生成と誤表示しない。rootfsの未対応32fileもgeneratorへ対応済み。16不正/非archive試験fixtureと4巨大内部memberは展開限界を明示し、配布する親bytesのhashを固定した。法的concluded licenseはNOASSERTIONを保つ。

変更: `docs/evidence/launch/legal/` のNOTICE/source提供/font表示候補とinventory summary。41MBの全inventory、再現可能なreview evidence tar、manifestを**既存Draftへ追加**し、GitHub asset digestを照合済み。[追加assetの固定値](evidence/launch/legal/draft-supplement-assets.json)。旧packageを差し替えていない。

次: 権利者正式名/許諾権限、A/B/Cと対象、商標・support窓口、source同梱/同経路提供、第三者条件の確認担当を一括決定。決定後に対象SHA/artifact/承認者/日時を記録し、新候補のLICENSE/NOTICE/Buildroot Rock package metadataへ反映・再検証する。担当: 所有者/法務確認者。未承認のためNOT_CLEARED。

## LCH03 — 配布元認証: AWAITING_SIGNING_SETUP

再開時に、秘密鍵を使わず新しい候補を作るproducer modeと `scripts/prepare_release_candidate.py` を実装した。[候補準備手順](candidate-preparation.md)。新規15＋既存署名22＝37fixture、既存desktop50がrootでもPASS。旧envelopeの付替え、pin不一致、freeze/source改変、symlink/hardlink、追加asset衝突、出力先の競合・途中中断を拒否。独立レビューで見つかった空directory上書き競合も修正し、排他的mkdirとdirfd/O_EXCLで既存directoryを保持する。これは候補生成の実装検証で、実管理鍵による署名・新image生成・legal承認は未実施。

旧RFC8032試験鍵は誰でも署名できる。本番署名のfingerprintは未登録。GitHub Environment `rock-release-signing` は読み取りで404、管理鍵の利用実績なし。保護control ref限定のworkflow、管理鍵と公開RFC試験鍵の分離、全asset/offline verifier、独立承認・失効/rotation・圧縮tar拒否のscaffoldを実装し、22fixture試験で検証した。[設定・運用・未実証の範囲](release-signing-operations.md)を参照。実Environment/管理鍵を使う合格ではない。試験鍵で旧archiveを本番扱いにしない。

次: 独立reviewerと保護control ref/Environmentを設定し、管理済み秘密値をGitHub Environmentへ直接登録、公開trust/fingerprintを独立経路へ掲載する。鍵をチャット/Gitへ送らない。実保護設定・改ざん拒否・rotation/revocation・新候補署名が通るまで本項目は未合格。担当: repo管理者/署名担当者。

## LCH04 — SitesとUI: LOCAL_PASS / HOSTED_ACCESS_BLOCKED

`.openai/hosting.json` の `appgprj_6a9b70d966fc8191a1ec30efce14582d` は現接続の公式SitesでNOT_FOUND、所有/編集可能一覧にもない。公開SHA・D1適用履歴・可視性・認証設定・移管/削除の事実は未取得。保存済みsourceの発見をSiteの復旧と混同しない。代替projectは作成していない。

変更: Hubを `/`、手順型仕事を `/work`、実行履歴を `/activity`、手入力会計を `/wallet`、設定を `/settings` へ整理。旧ファンドは `/fund` に保持。左ナビ、最初の作業、用途検索、空/未認証/失敗状態、モバイルmenu、実行中の閉鎖/画面移動保護を実装した。サインイン前は入力を止める。PCのheartbeat/失効/再接続raceを修正し、検証したsessionだけで実行する。

- 元Sitesの実行API `/api/jobs` と `[id]`、auth/上限/同時実行制御を保持。手順型仕事は `/api/work-jobs` に分離。旧 `/api/runs` は認証付き410のまま。
- SQL `0002_operations_backend.sql` と `0002_work_jobs.sql` はfilename/bytes不変。両側snapshot/journal原本を `evidence/launch/sites-history/` に保存。新しい `0004_union_bridge.sql` は遅いtimestampで不足テーブルを追加し、Drizzleの古いtimestamp無視問題を閉じる。
- 実Miniflare/D1でfresh/release/sites × filename/実Drizzle migratorの6経路を検証し、再適用・8table/index一致・旧仕事revision/収支/プラン保持を確認。既存hosted D1の取得/backup/upgradeは別の残件。
- PWAを保持し、旧v2→v3更新で古いcacheを削除。API・認証・RSC・private/no-storeを保存しない。実ローカルbrowserでcache更新とAPI cache0を確認。

検証: [実ブラウザ記録](evidence/launch/browser-local.json)、`tests/migration-union.test.mjs`、`tests/device-lifecycle.test.mjs`、`npm run test:api`。公式Sites build helperとローカルpreviewを使用。次: 元`kirin-999.chatgpt.site`を所有するChatGPTアカウントでSites接続を復旧し、同じprojectのreadback/backup→本人限定preview→認証/動画/404/導入導線を再確認する。担当: 元Site所有者。

## LCH05 — CM: AWAITING_SELECTION_AND_HOSTING

唯一見つかった完成尺候補 `KAIYA_PV_RockstarOS_1m09.mp4` は69.235833秒、136,497,309bytes、SHA256 `6b4d7a314c77139ff7b26a65b94cadf860fefdc86cd63c8513c4ffc00515ff1b`。他2候補は11秒のscene版。選択を質問済み、未回答を同意に変換しない。

[全音声19segmentと画面の内容照合](evidence/launch/cm/cm-actual-review.md)、[認識/OCR原本hash](evidence/launch/cm/cm-actual-review-evidence.json)。全音声をローカルASR、全編138枚/0.5秒のOCRとcontact sheetを目視。全1660frame逐字照合/人の全音声聴取ではない。28.44〜34.96秒の広い保存/完成表現には、コンセプト演出・限定復旧・公開準備中を再生前に常時表示する条件を付した。

変更: `/rockstaros` に近接注記とguide/実UIへのCTA付き掲載枠。`data/rockstaros-preview.json` の `campaign:null` は選択・管理先・字幕の確定待ち。CM原本を再制作/再編集せず、未確定assetを公開/Git追加していない。90.04秒の技術デモは別動画のまま。

次: 所有者が上記候補を確定→元hashの管理された配信URLと字幕を固定→本人限定同SHAページで実再生/音声/導線を確認。担当: 所有者/開発。

## LCH06 — main候補と版表記: CURRENT_CANDIDATE_CI_PASS / FINAL_CONTENT_PENDING

PR1→2→3を読み取り、レビュー/コメントなし、PR1とmainの文書衝突を確認。mainは開始releaseの祖先。既存stackをforce push/rebaseせず、最終releaseをmain基点の専用candidateへno-ff mergeし、別Draft PRで正確なmain差分を確認する方式とする。最終PRは1〜3の履歴を包含し、一度だけmainへ通常mergeできる候補。旧stackを先にmergeする手順ではない。

変更: README/project/CHECKPOINT/status/release notes/導線を同期。Web versionとnative versionの意味は上記のとおり。Web/native/Android CI checkoutをPR headの40桁SHAへ固定し、合成merge-refの成功をheadへ読み替えない。現candidateのHEAD/tree・main包含・全checkは上記で確認済み。残るlicense/署名/CM/Siteの内容決定でsourceを変えた場合は、新HEADで同じ照合を行う。main mergeは未承認のため実施しない。

## LCH07 — 最終配布: WAITING_FOR_LCH01_TO_06

新packagerは `UNSIGNED_PACKAGE_NOT_ACCEPTED` receipt、control側の準備処理は `UNSIGNED_CANDIDATE_PREPARED_NOT_ACCEPTED` と固定indexを出力する。試験では小さい模擬image/Git/stage0を使用し、二回のindexとコピーbytesが同一であることを確認した。実1GB新候補の二回生成は未実施。現実装はNOT_CLEARED/CANDIDATEを必須にしており、所有者がlicenseを選んだだけでCLEAREDにはならない。次の明示決定を新source/許諾metadataへ反映するレビューと、実build/freeze/全受入が必要。

旧Draftは `CANDIDATE / NOT_CLEARED / PACKAGED_NOT_ACCEPTED`、archive SHA256 `121389f0df92ae43197ec23d381012dab02aa1d0ff5a3f519803e66e0c7b46a2`、1,000,928,255bytesのまま。旧9abの限定D0〜D6、fresh導入・保存・同一VM復旧・削除、Game/SDKの合格は[既存受入](os-acceptance-9abf78a-20260910.md)を保持し、今回の署名/許諾/新配布受入へ転記しない。

次: 前提確定後、**新しい版名**で二回同一bytes生成。新manifestへsource/image/factory/hosttools/boot/Game/legal/CM/siteSHAを結び、新署名・全asset検証・fresh対応Macの導入→Hub→保存→Wallet/Game→通常終了→再開→限定復旧→削除を完走する。旧archiveの中身を後から差し替えない。担当: 開発/受入担当。

## 依存監査と公開後の停止手順

4highは独立した4不具合ではなく、dev用Miniflare→sharp0.35.2の同一[GHSA-rgj7-g3m4-5g8c](https://github.com/lovell/sharp/security/advisories/GHSA-rgj7-g3m4-5g8c)への依存node。現SiteにImages bindingはないがLinux build/devにも入るため、限定overrideでsharp0.35.4へ更新、lock再生成・npm ci・全依存audit0を確認した。旧native imageはこのnode_modulesを同梱しない。既存esbuild overrideも保持。

公開時だけ行うsmoke: 匿名で公開範囲/ダウンロード可否を確認→別経路のfingerprint/manifest pin→全hash/署名→ページ/動画/guide→合成サンプル→通常終了。失敗時は新規download/署名dispatchを止め、Siteは元projectの直前確認済みdeploymentへ戻す。DBの追加tableをdropせず、upgrade前backupと履歴を保存。署名事故は信頼bundleを失効し独立経路を更新、旧鍵のまま再署名しない。既存VM/利用者DBを自動初期化しない。supportは現状repo Issuesを開発用入口とし、公開窓口/担当は所有者決定待ち。一般公開の最終承認は全LCH合格後だけ求める。
