## PR225最終検収のGit保存（2026-10-25 / G04・ROCK）

PR225のhead dcf86f99全8CIとmain f4ed492c全9CI（CodeQL含む）を再読戻しし、[最終検収](../evidence/development-execution/zod-security-constraint-review.json)・project/status/READMEをmain統合済みに同期。原本の絶対local pathは匿名化し、元SHA256・ログhash・CIリンクと失敗履歴を保持。最新main7edbb9beを基点に文書だけを保存し、この新HEADと統合SHAは別CIで検証する。実機操作・追加推論0、Rootregistry非操作、公開保留。

## PRO-01原本archive入口候補

検収済み3source/testをmainb1b0基点で採用。Pro local export→固定avoado.si/account/import/pro→手動再選択/本人account確認/別同意を案内し、既存archive/auth/crypto/schemaは不変。関連40/独立5群とChrome local1512/390 UIを限定確認。最終head CI/独立metadata検収、認証済server保存・公開先実click/配備/native/wholePRO01は別gate。[詳細](../rockstaros-complete-design.md#pro-original-archive-entry)／[有限11lane引継ぎ](../evidence/development-execution/all-lanes-main-handoff-summary.json)。Rootregistry非操作、残616公開保留。

## Wallet DB recovery test-only exact1採用候補

Game205通常merge main0866・同SHA6CI成功のclean基点へ、旧434fとtestbase不変の受入1hashを無変更採用。元receipt5347とportable要約を分け、runtime/source・価格/鍵/migration/888・RootHEAD/indexを保持。Root専有registryは読戻し/restore対象外。23/lint/type→project/design/scanner→Draft PR最終同headLinux実npmverify/全CI→独立metadata検収。承認済archive8d2 exact3保存を維持、残616は公開保留。[証拠](../evidence/development-execution/wallet-ledger-db-recovery-main-adoption.json)。

## Game creator host fixture exact2採用候補

Eve204通常merge main434f・同SHA6CI成功のclean基点へ、旧7188と2base不変のscript/test hashを無変更採用。元receipt9936と新portableを分け、再利用5・既存Eve/Smith/Billing/eSIM/Mini/履歴・RootHEAD/index/archiveを維持。40/lint/構文/type→project/design/scanner→Draft PR最終同headLinux実npmverify/全CI→独立metadata検収。host synthetic ownerだけでstatic unverifiedをruntime受入へ移さない。Walletは別test-only worktree準備で、source/金融は操作しない。[証拠](../evidence/development-execution/game-creator-fixture-main-adoption.json)。

## Eve estimate-only exact10のmain採用準備

Smith203通常merge main7188c879・同SHA6CI成功のclean基点へ初回は独立r2 exact10を無変更採用し、CI CodeQL後にtest1の明示例外だけをpathname比較へ変更。現在9一致＋test1機械例外、runtime5不変。旧head278/旧test2eb・新test2f638/失敗check/修正UI8成功を保持し、新head CIと独立mechanical検収を必須にする。元sourceは旧2beaから通常FFし11hash不変/.wrangler非操作を先に確認。元receipt69b127とportable要約を分け、Root実UIは503限定・数値未受入、旧expiry P2/fixture/EPERM再試験を保持。70/type/productlint→Root combinedUI proof確認済み→project/design/scanner→別DraftPR最終同head実Linuxnpmverify/allCI→独立metadata検収。追加proof d3b7（旧5286別保持）によりcommit保留解除、source/UI原本とRootHEAD/index/archiveは保全。[証拠](../evidence/development-execution/eve-source-estimate-main-adoption.json)。

## Smith attempt3 exact8のmain採用候補

Billing202通常merge main2bea21b1・同SHA6CI成功のclean基点へ、旧468dと8base不変の独立受入8hashを無変更採用。原本5archive53e6ed46とmain適応8byte、元receiptとportable要約を分ける。Root実UI17原本はGit外、最小UI要約/digestのみ保存。17領域保護と既存Billing/eSIM/Mini/immutableを保持。53/type/productlint→project/design/scanner0+canary→Draft PR/最終同head実Linux npmverify/all CI→独立metadatareview。local全体verifyは未実行、検収前merge禁止。[証拠](../evidence/development-execution/smith-bottom-navigation-main-adoption.json)。

## Billing service authority exact4採用候補

最新clean main468d（eSIM201/main同SHA6CI成功）基点、旧99abと4base不変、独立PASS4hashを無変更採用。元receipt7a52をGit外保持、portable a2cfと分ける。53/type/productlint成功、eSIM3/Mini6/history18/RootHEAD/index/旧197を保持。JSON/project/design/fixedscanner0/canary→別draftPR最終同headCIで実npmverify→独立metadata採用review。Web5sourcearchiveはこのPR後の別sourcebranch保存でmainへ混ぜない。[証拠](../evidence/development-execution/billing-service-main-adoption.json)。

## eSIM owner-response source3採用候補

最新clean main99ab（Mini200/main同SHA6CI成功）基点、旧708と3base不変、独立PASS3hashを無変更採用。元4035 receiptはGit外保持、portable最小579fと分ける。正規type/lint・145回帰＋D1 1成功。source3以外に既存codeを混ぜず、Mini6/11/history18/Pro6とRootHEAD/index/旧197を保持。JSON/project/design/fixedscanner/canary→固定全verifyか最終同headCI→draftPR→独立metadata検収。独立ACL/expiry/genericattachment/本番未受入。[採用証拠](../evidence/development-execution/esim-owner-response-main-adoption.json)。Billingは別tree準備のみで本変更に未採用。

## Mini cone-aware source5＋portable receipt採用候補

最新clean main708（Pro199）起点、旧ccecとの6base不変。数学/code/test/doc5hash固定、receiptの4local参照だけlogical IDへ置換し旧8116→新5bcbを記録。原本Git外保持、旧11/historical18/Pro6は不変。70試験→lint/type/JSON/design/scanner→固定全verify1→別draftPR/同headCI→独立metadata採用検収。Pro199は独立r2＋新2ec実verify2795pass/0fail/1skip・PR7CI/main708同SHA6CI成功を別要約へ。旧Root/197branchを混ぜず、eSIMtreeは独立で準備のみ。[証拠](../evidence/development-execution/mini-02-cone-aware-main-adoption.json)。

Pro PR199のmechanical lint修正: source範囲内test1pathの25登録へvoidのみ追加（+125bytes、除去で旧hashへ完全復元）。runtime5/保護76/95台帳は不変。旧dd10 Linux lint25失敗を保存し、focused69/lint/typeと新headCI/別独立検収を必要とする。

## PRO-01 exact6原本保管のmain候補

最新clean mainccec（PR198）基点、Pro新6pathは旧1a9/最新双方absent、受入hash無変更で採用。69試験と正規pretypecheck成功、既存core/暗号/store/schema維持。履歴first56/current69訂正とr2限定検収を原本hash要約で記録。固定scanner現行files0/canary→全verify1回→draftPR/同headCI→独立metadata review。旧a2branchは混ぜずRootHEAD/index/journal保持。[設計/証拠](../evidence/development-execution/pro-account-import-main-adoption.json)。

## EVE-02 attempt2 exact6統合候補

主担当10/ROCK。最新remote main1a9とsource旧7beの6基底同一、独立PASS_SCOPEDの6hashを無変更採用。関連71pass。旧巨大Root Remix/media/workflow、未検収Proを混ぜず、RootHEAD/index/journal保持。固定全verify1回→別draftPR/同headCI→独立metadata採用review。PR196 BillingはGame-r2/Pro metadata検収とacceptedhead7CI/main1a9同SHA6CI成功を最小hash要約で同期。[Eve採用証拠](../evidence/development-execution/eve-text-job-main-adoption.json)／[Billing要約](../evidence/development-execution/billing-final-send-review-summary.json)。一般公開/実課金なし。

## GIT08 main反映後のBilling限定採用

PR195の95台帳metadataは文書保存・branch保存・main7be3d6aa反映まで完了。本番配備と95whole acceptedは0のまま。分類base9a/188digestを保持し、Billing原本exact4独立passとrecurring互換delta再検収待ちは別candidate overlayへ追記、main採用と混同しない。原本review/receiptはhash付き最小要約で保存、秘密/path/logをコピーしない。次はBilling固定全verify/CI/独立採用metadata review。[証拠](../evidence/development-execution/billing-final-send-main-adoption.json)。

## 95再開台帳と固定inventory・現行overlay（GIT-08）

[95unit台帳](../../data/development-unit-progress.json)はfixed main9a617fabの49既存実装/16部分採用/15未検証/14外部gate/1unknownを履歴として保持し、whole acceptedは0。Root旧80not_startedを現在の未実装数にしない。[現行overlay](../evidence/development-execution/unit-main-current-overlay.json)でPR194のeSIM限定採用と次優先を分離。Billing finalclaimはRoot割当で実装中、eSIM独立ACL/epoch/genericattachment未受入、Eve02 bounded textが次。ROCKの既存main契約を再利用し、EXTERNAL/JOINT/OWNER gateを未実装/成功へ置換しない。

[188固定digestと独立review参照](../evidence/development-execution/unit-main-inventory-reference.json)は9aのみの証拠で、最新95全体監査ではない。[handoff](../../data/development-source-handoff.json)のsource保全49+OS16はRoot全量保存/main全量採用ではない。モデル設定はuser policy参照のみで実model/usage/costは未取得。main393task/RQ50/phasegateとRoot旧baselineを分離し、runtime/source/testは変更しない。次はこのmetadataのexacthead独立採用検収とCI npm run verify、通常mergeはRoot指示後。metadata main保存と本番配備も別gate。

## eSIM/Linux現行authorityの保存fence（限定6path）

主担当03、ROCK API/store/read-set/CAS、EXTERNALは支払/回線/鍵の根拠、JOINTは本番D1/実HTTP、OWNERは同意/費用。独立Smith/Astra r2のexact6を無変更で採用。listing矛盾/最新package否定・期限・setup/grant変化を同一D1 batchで拒否し、job/予約/lease/receiptの一部保存を防ぐ。既存owner-session read/export、888c/owner/revision/late CPUを保持。122局所/型/lint成功、旧local D1 rollback/3retry証拠digestを確認。汎用attachment/独立ACL期限/本番D1/実Provider・公開は未受入。[11項目契約](../rockstaros-complete-design.md#esim-runtime-commit-authority)・[採用hash/検証/次](../evidence/development-execution/esim-runtime-main-adoption.json)。次は固定候補verify/同headCIと独立main採用metadata検収。PR193はsame-final83a Linux CI成功を最終検証としてmain9a617fabへ統合済み、最終host全verify待ちを次作業としない。

## Pixel診断のmain候補とMini r2（OS10 / OS-01 / P02）

主担当07 Android、Gitは候補/共有metadata/Gitの単独writer。ROCKは固定worker/launcher親寿命・任意診断、EXTERNALはkernel、JOINTは同一候補Linux/Pixel、OWNERは導入/接続/費用。6runtime/test＋bounded Python CI stepを移植、manager/URL/model/prepare/build/service hash固定。[候補証拠](../evidence/development-execution/pixel-main-diagnostics-adoption.json)にコマンド/結果/初回host試験反例/保全hash、[OS契約](../rockstaros-complete-design.md#pixel-main-worker-diagnostics)に11項目を記録。次はexact候補の独立review、CI Linux親終了4case、fixed full verifyのGit記録。host skipをLinux成功に換算しない。新serverは旧実機packageと別artifact。cache/native account/背景/P02全体/full OS未受入。Mini r2はaccepted4hash/旧12保持の別scopeで、[review要約](../evidence/development-execution/mini-02-finite-cone-review-summary.json)を参照。実光学/MINI02全体未受入。原計画/元reviewはoperator workspaceのdigest参照、raw資料/ログをコピーしない。

## Pixel Linux診断attempt2の限定実機証拠

[公開可能な要約](../evidence/development-execution/pixel-worker-diagnostics-physical-summary.json)と[元Eve独立検収の要約](../evidence/development-execution/pixel-worker-diagnostics-physical-review-summary.json)を参照。元receipt/reviewは原本SHAで結び、18添付・原文・privateRealm/私的state・絶対path・鍵/モデル/APKをmainへ保存しない。

同一受入sourceでLinux親終了fixture4pass/skip0、今回1job成功（累計2）、worker wall8.569秒/child CPU12.635192秒/cgroup OOM差分0を観測。旧33jobを保持しtotal34、2models/10agents、model process0/sync停止。PCとPixelの公式exportファイル770bytesは同SHAで読戻した。これはexportファイル寸法で成果本文寸法ではない。

PC UI reloadは画面証拠不足で未確認。背景実行・P02全体・全OS・原因解消/一般化した性能は未受入。限定job/export証拠を単体APKや全OS完成、main runtime移植、一般公開へ昇格させない。source16は別保全branch97044695、main7既存/9未追加の具体auditを維持し、この変更はruntimeコードを含めない。

## MINI-02 joint-allocation exact保存（G04 / ROCK）

[採用証拠](../evidence/development-execution/mini-02-joint-main-adoption.json)で検収済み4body/旧8hash、固定候補verify、PR/CI/統合検収を区別する。OS診断WIP・Source完全D1baseは別gate。次のhost契約はRootの別割当で進める。

## MINI-02 exact source保存（G04 / ROCK）

[採用証拠](../evidence/development-execution/mini-02-main-adoption.json)で5pathのhash・限定独立検収・固定verify・GitHub/CIを区別する。Source provenanceは独立read-only checkpointで、Mini保存を無期限に遅らせない。OS診断WIPは含めない。

## client/Game採用とdeferred source保全（G04 / ROCK）

[統合候補](../evidence/development-execution/client-game-adoption.json)と[main対応95unit引継ぎ](../../data/development-source-handoff.json)から再開する。PR186/187のmain統合、client/Game採用候補、Eve/過去資料source branch保存を区別する。Rootの23chat/42成果/180coverage/95unit資料は非実行`.source`保存と由来付き要約で保持し、旧mainSHA/配備/試験を現在mainの成功にしない。残全unionは別gate、OS/cache-onlyは唯一operatorのbatch中で触らない。

## 受入済みlane subsetの順次保存（G04 / ROCK）

PR186通常merge後main23ad170c起点のBilling/eSIM/Wallet pure subsetは[採用証拠と有限計画](../evidence/development-execution/service-contract-adoption.json)へ。helper受入、GitHub保存、main統合、同SHA CI、公開を別記録とする。次はMini/Pro/Webの検収済み限定差分、Smith test、Eve保存/Game検収を各小PRで再照合し、未完の全DB unionを独立成果保存の一律停止理由にしない。

# Git / CI / Operations

## eSIM ready復旧試験とMini設計同期のmain限定採用（SIM01・MAT15・G04 / ROCK）

現行受入: PR240/head b860929cをmain c3c4845cへ通常統合。head全7CI・同mergeSHA全6CI成功、Linux全verify3075件/3073pass/0fail/2skip、別段階の実Linux親寿命4件成功。host最終全verify3075件/3072pass/0fail/3skip・build/API成功。初回Mini依存失敗、cache待機失敗と1回の診断済みretry、旧03CIのprocESRCH失敗を保持し、成功や恒久修正に置換しない。PDF58頁はGit外、本文/renderer/画像と試験source7件は受入head/main同byte。証拠 docs/evidence/development-execution/esim-mini-ready-design-main-current.json。実機・実回線/実課金・全体受入・616一括公開の保留は不変。以下は候補作成時の履歴である。

CI head03の既存Pixel parent-exit fixtureで、子の終了時proc読取りがESRCHとなる競合を確認。FileNotFoundErrorと同じ終了観測としてProcessLookupErrorだけを追加し、worker・待機・assertionは不変。合成observer旧新5比較でESRCH修正とPermissionError/生存100回の拒否・cleanupを確認（実Linux受入ではない）。新headの実Linux4試験を必要とし、失敗ログを保持する。host初回全verifyはMini依存未復元で1件失敗、固定Mini lockを復元後に該当4件成功、全verifyを再実行する。

基準main f5ea398a。eSIMはready証拠保存後・利用開始反映前の制御中断から、同一SQLiteを明示close/reopenして同一要求を再開する試験を追加。独立61件成功、元60件/制御5sourceは不変、保存欠落/再送重複の破壊反例2件も拒否（61へ加算しない）。実D1/HTTP、process crash、issuer署名、実開通/実課金・全ESIM-03は未受入。Miniは旧local v0.9をPR238と日米方針に合わせたv0.10設計へ同期し、本文・renderer・個別画像3だけを限定保存する候補。参照可用性の誤読を修正し、旧local研究60参照を台帳化。PDFは58頁・全頁目視/文字境界/埋込fontを確認してGit外へ保持。runtime/最終光学/PCB/実機/製造/公開の合格は追加しない。証拠 docs/evidence/development-execution/esim-mini-ready-design-main-adoption.json。次は同一artifactの全verify、Root統合metadata検収、headCI、通常main統合とmergeSHA CI。616一括公開保留、共有HEAD/index保持。

## 準備済みdevice/Mini有限採用の現行受入

PR238/main440f、headaba全14CI・mergeSHA全13CI成功。実Linux3074/3072pass/0fail/2skipとcommon103/packet26を確認。旧588clock failure、bf42安全性block、b709test-readhighとdescriptor修復、Web index/currentlabel指摘を別履歴保存。Root source/metadataとWeb metadataの独立性を保持し、old231/234は238経由の間接mergeとして記録する。元Rootcheckout/indexと616保留を維持し、このcurrentmetadataだけを別CI/mainで閉じる。[受入記録](../evidence/development-execution/prepared-device-mini-main-current.json)。

## Pixel正常fixtureの観測待合せ

有限batch初回588のLinux packet26中1失敗は別の時刻境界fixture。observe_readyの1呼出しだけ時刻を束縛し、外側kernel expiry/openは実時計へ戻す。Root7host clockprobe合格は実Linux合格へ転用しない。新serviceのpending/adopted index境界もWeb R1で修復し、元source22＋追加fixture1を再固定する。[追加記録](../evidence/development-execution/prepared-device-mini-integration-supplement.json)。

worker本体を変えず、正常fixtureの出力前に実empty sampleを最大3秒待つ。Smith bb11初回27件の1error/1skipと、450ms旧反例/新成功、Web実child7負例/cleanup、同SHA一度retry成功を別履歴に保つ。15assertion/他methodASTと既存None許容runtimeケースを維持。`python3 -B tests/test_pixel_worker_diagnostics.py`、exacthead標準`npm run verify`と全CI→通常main/mergeCIを確認する。[採用段階](../evidence/development-execution/pixel-empty-observation-main-adoption.json)。OS/Smithのcurrent metadataも同期しwhole95受入0、616公開保留を維持する。

## Wallet UI fixtureの遅延GET帰属

PR213はmain `2a9828b2`へ通常統合済みで、採用head全7CIと同mergeSHAの製品CI6件成功を確認しました。[統合証拠](../evidence/development-execution/esim-eve-ui-main-merge.json)。

CIの無期限待ちを防ぐため、遅延応答gateをrequest開始時に固定する。新しい認証確認GETへ古いgateを渡さず、後着の古い読取でowner/私有情報を復活させない既存製品契約を固定2反例で検査。`node --experimental-strip-types --test tests/wallet-workspace-recovery.test.mjs`45pass、旧対照2fail。製品source/認証/料金は変更なし。[証拠](../evidence/development-execution/wallet-ui-deferred-get-fixture.json)。



## Pixel cache-only/更新fence main候補

Source/最終metadata独立PASS、head3e全8CI成功、main8f製品7CI成功・Dependabot1失敗を[統合証拠](../evidence/development-execution/pixel-cache-main-merge.json)で区別。Linux2938/2936/0fail/2skip、Python cache6/update23。cache tuple256/noevict・durable-before-effect/unknown・固定payload rollback・worker/launcher/URL保護を保持。同FD限定読込でmetadata差替を拒否する。

現在のGit受入: PR218は検収済みhead2f737579（8CI成功）をmain7edbb9beへ通常統合し、同mergeSHAの8check成功（製品7/補助collect1）、Linux2993/2991pass/0fail/2skipを確認。PR225/mainf4の製品7・Dependabot2成功とZod修正を別証拠で確認した。root10/Mini2は旧監査snapshotで、後続PR225 receiptではroot7/Mini1（新規監査ではない）。原receiptの失敗・pendingは保持、公開/配備/616保留。 元f3物理と新c43限定実機、PR213/224 UI、P02/全OSを別gateとして保持。

原source段階の復元情報: base0d/source b1、元receipt2608/旧独立c9c795（後にHighが判明しguard独立948769へ更新）。[guard修正証拠](../evidence/development-execution/pixel-update-guard-toctou-fix.json)。当初のCI待ちは履歴であり現在は上記結果。

## avokado全体のREADME入口（2026-10-21、DOC04 / G04、ROCK）

製品画像の品質改善: 内蔵image_genと現行形状の参照によりMini/Proの新規PNG2枚を制作し、READMEへ採用。選択した最終画像のみGitに保存し、プロンプトは `docs/assets/readme/product-imagery-prompts.md` へ記録。既存画像・製品形状・公開サイトは保持し、製造済みや実機写真とは表示しない。

ビジュアル更新: 共通ブランドSVG、既存Mini/Proコンセプト画像、既存OS/Sky GIF、Eveの仕事フローSVGをREADMEへ追加。素材参照先、GIFの24frame、SVGのXML/非script、暗色プレビューの表示を確認し、実機写真・動作録画とは区別してcaptionを付ける。重複する大画像や新しい受入証拠は追加しない。

追加指示により、4項目の密な箇条書きを小見出し・短い段落・余白へ展開。生活/地域での使い方、製品間の仕事の流れ、Pro事業と調達の関係、コードの実装範囲を文章で説明する。製品順と未受入条件を維持し、地域実証・実機・供給などの成果を追加しない。

本人指定のMini→OS→Eve→Sky→Proを同階層に並べ、各項目へ目的・設計正本・既存コード・開発状況を記載する。ROCKは正本/コード/既存公開証拠の照合とmain保存を担当し、外部依存はGitHubの保存/表示。既存公開サイト、OS/runtime、物理・Provider・供給の受入状態は変更しない。完了条件はREADME内の順序/4項目/ローカル参照先/明示anchor、metadata同期とnpm run verifyの成功、mainのREADME読戻し。既存のR5/Material未実装チェックは日本語の同義表記も受理する。READMEの5項目順・各4説明・参照先・anchor、R5文書3試験、metadata同期と全体verify exit0を確認した。

<a id="redesign-thread-git"></a>
## 最新RockstarOS本体設計のGit統合監査

統合結果（2026-10-21）: 指定チャットの設計文書はPR #182でmain `883e311e`、投稿型Home/SkyのWeb runtimeはPR #183でmain `6e8b3934`へ統合。PR #183のhead `20faad5d`ではRock star verification、SPIDER repository security、SPIDER repair regressions、SPIDER CodeQL securityの4 CIが成功した。元の共有checkoutは触れず、既存mainのRQ50と料金/Wallet/Work契約を維持した。以下のSHA比較とdirty件数は統合前の監査snapshotとして読む。Eve永続履歴、実X/MCP Provider、別端末、Sites公開、Pixel全OSは別途受入。

2026-10-21、指定チャット[「RockstarOSを再設計」](codex://threads/01a14d54-daee-7c30-87a8-faea84641a40)とGitHub k999ln/rock を照合。main 01b6aecd8b4d8bd2385665232dfb4b57029f991f に対し、作業branch codex/esim-cloud-access は 951d82d5a491a284aed4e0d4d280171d835d4b43、merge base 9f64aee3de9cc74e6b6e7eae34052780e000c296、GitHub比較はmainから652 behind/3 ahead。ローカルは監査時564項目dirtyで、別チャットが同じcheckoutを編集中。mainはRQ50・製品ベースv2.08、作業branchはRQ49・v1.120。mainの月額140 USD/100 USD利用枠と作業版の月額16 USD案も未照合。GitHub mainの公開状態へ作業中の設計/実装を換算しない。

本人の追加明示により、指定チャットのOS設計を本体の大元として優先する。RQ数と料金の差分はOS以外の契約照合として保持し、OS設計の着手をそれだけで止めない。

原因: 長期作業branchとmainの文書・料金・RQ体系が分岐し、新しい設計は共有checkoutの未commit差分へ蓄積。修正順: (1) mainを基準にRQ50・料金・契約・CIを読み直す、(2) 作業branchの未commit差分を対象pathごとに固定して重複編集を避ける、(3) 最新の本人指示を該当workstreamと全体設計・baselineへ理由付きで移す、(4) 投稿→追加→Eve、コミュニティー版、実MCP、eSIM導線を小PRへ分ける、(5) 同一SHAのCIとUI/Provider/Pixelを別々に受け入れる。force pushや設計文書だけによるruntime合格は行わない。

今回の合格証拠はGitHub ref比較と設計差分の記録。本人X実投稿、X For You、実eSIM/Cloud、Pixel全OS、実課金、公開、main統合の証拠ではない。再検証: git rev-list --left-right --count origin/main...HEAD、npm run baseline:check、npm run design:check、npm run project:update、npm run verify。GitHub保存、作業branch反映、main mergeは別記する。

## 2026-10-13 品質改善・仕事compositionのmain統合（G04 / H1、ROCK）

## 全系統の調査設計（DOC04 / H1、ROCK）

入口は[関連・戦略・データ・取引](../service-design/07-ecosystem-strategy-and-data.md)。main `c6df4ca9`の全19領域・37 Tool・50 RQと39一次資料を照合し、補完先、データのlifecycle、支払者/受取者/失敗照合、14 gapを既存taskへつなぐ。ROCKは契約とsource照合、EXTERNALはProvider/機器API/規格、JOINTは実接続とMini設置受入、OWNERは市場/物件/国/価格と個別実行の判断を持つ。完了条件はcoverage/参照/履歴hash/5 Mermaid/全体verify。実Provider・施工・課金は別gate。検証: `npm run research:check -- --source-hashes`、`npm run design:check`、`npm run verify`。

## サービス設計の再構成

[統合基本設計](../service-design/README.md)を体験と各製品の入口にする。主担当はDOC04/H1（Git / CI / Operations、ROCK）、Sky/Zemaと各profileは既存担当へ接続する。新しい料金・権限・実機/本番受入は追加しない。[実現順と残条件](../service-design/04-delivery-and-acceptance.md)、[同一入力と検証証拠](../evidence/service-design-rebuild.json)。

利用者のmain反映指示によりPR #111をmergeした。source `643559b8e00037b1f960afb9dea7bf309534d539` のGitHub15チェックは全成功、main `3ffc21d3a15235e0bde89a118e2f931135a9189e` のtree一致を読戻し確認。PR #105とPR #110から必要差分を統合し、mainの適用済みDB移行とColumbia英語入口を維持。Site専用CSV契約は別に保持する。元branchの履歴書換え、検査policy変更、Sites再配備は行っていない。検証・残条件は[既存証拠](../evidence/work-composition-development.json)の`mainIntegration`。次は本番本人の一周・端末download・静的header等の既存受入条件を、main統合と区別して扱う。


## 2026-10-11 — 既存機能の品質・復旧改善（G04 / H1、ROCK）

開始23:56:26 UTCから5時間の品質改善。最新mainとPR100を専用branchで統合し、元checkoutの未保存変更を保持した。PR103の既存server修正は追補PR104で分離し、設計段階のAndroid worker／注文consoleは対象外。主branchとGridのGitHub保存、CI、main統合、公開を別々に記録する。SPIDER公開digest例外とCSV保存契約変更は自動承認レビューに拒否されたため具体案を未適用で用意し、owner回答待ち。 PR105の監査JSONにある公開説明文も固定scannerが誤検出した。こちらはSECURITY.mdのowner reviewが必要な3件目の未適用案として分離し、自動承認拒否の2件と区別する。

検証状態と再開手順は[data/project-status.json](../../data/project-status.json)の`qualityRefactor`を正とする。全領域完成・main統合・本番公開は未宣言。


### 続行と公開版への統合

2026-10-12、G04/WEB04/AI04/CSV00/GRID01の限定品質修正を再開。Deliveryの親子認証競合、三つのToolの二重送信、CSVの削除済み入力に対する遅延eventを対象試験と独立レビューで確認。CSV強制終了は実D1/R2を再起動する診断であり、processing残存3地点を復旧済みとは扱わない。利用者が既存URLへの全修正反映を明示したため、Sites v49の固有CSV/会計履歴とmigrationを保持する統合を追加する。全体verify・同一SHAのCI・公開版source/deployment・実画面の証拠は[品質記録](../evidence/quality-reliability-review.json)のfollowupへ分離する。ポリシー例外、CSV保持契約、nextPrompt更新の保留を公開許可へ含めない。

## プロジェクト別開発Bot（AMC03 / H1 / ROCK）

[担当Botの利用方法](../../toolkits/amc-agent/README.md#プロジェクト別bot)。開発Botの正本はdata/amc/project-bots.json。既存32部隊のtaskAssignmentsを置き換えず、10個の依頼窓口として実装・検証・Git commit・PR提出を担当する。OWNERは具体的な依頼と既存の外部実行条件を決め、EXTERNALはCodex／GitHubの認証と実行環境を提供する。GitHub App、常時実行、main自動mergeは未設定。完了条件は全定義の生成一致、担当外task拒否、holdの引継ぎ、起動失敗とPR受入の区別、対象試験と同一SHAの全体verify。検証: `npm run bot:check`、`node --test tests/project-bots.test.mjs`、`npm run verify`。実BotのGit提出は具体的な開発依頼で別途受け入れる。

### Git調査からAMCへ（AMC04 / H1 / ROCK）

ROCKが既存prompt-contextのGitHub情報と担当コードのblob／履歴／task資料を収集し、担当Botが具体的なtaskを選んでAMCを作成する。planは既存engineのdraft生成を再利用し、正本のnextTaskIds・受入状態を変更しない。EXTERNALはGitHub／Codex接続、OWNERは依頼の範囲と既存gateの判断を担う。合格条件は担当範囲、前提とhold、Git SHAと資料hash、未確認ソースの明示、調査失敗時の未起動、新規版保存の維持。`node --test tests/project-bot-context.test.mjs tests/project-bots.test.mjs tests/workspaces.test.mjs` と全体verifyで確認する。実Botによる任務完走と、Git調査／計画生成／引渡しのhost試験は別証拠とする。

### 既存AMCの直接入力（AMC05 / H1 / ROCK）

`run/prepare --goal-file` で利用者の既存AMCを担当Botへ引き渡す。ROCKは読込み検証、原本を保持した作業コピー、既存engineでの指示生成、Git調査との接続を担当する。EXTERNALは既存Codex／GitHubの認証と実行環境、OWNERは依頼と適用範囲を担う。合格条件はID・revision・task・履歴・保留の保持、原本非変更、不正入力の起動前拒否、同じ読込み内容のコピーと引渡し。検証は `node --test tests/project-bot-context.test.mjs tests/project-bots.test.mjs tests/workspaces.test.mjs` と `npm run verify`。読み取りレビューはWeb上の認証済み検収イベントを代替しない。

### 可変の計画提案（AMC06 / H1 / ROCK）

固定7工程の補助に加え、localhostのAMCから既存CodexへGit調査と具体的な計画提案を依頼する。入力・状態・担当・保存・復旧・検証は[AMC設計](../amc-goal-orchestrator.md#ローカルamcで依頼に合わせて計画するamc06)を参照。旧Goalや正本は保持し、計画生成、採用、承認、実行、検収を混同しない。EXTERNALは既存Codex/GitHub環境、OWNERは入力送信と候補採用。公開Sky/Zemaの実行器は別範囲。

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

- [統合で失われた情報の監査（2026-10-07）](../merge-loss-audit-20261007.md) — 2026-10-05の `ecb4b2af` ほかで文書と台帳が古い内容へ戻った経緯、復元した範囲、owner判断待ちの項目。文書整理はPR #92で統合済み。現在の削除・復旧は[Git整理方針](../git-consolidation.md#obsolete-content-cleanup)と最新の進捗JSONから始める。
- [Git consolidation](../git-consolidation.md)
- [Prompt playbook](../prompt-playbook.md)
- [Design/implementation alignment](../design-implementation-alignment-20260909.md)
- [Current state](https://github.com/k999ln/rock/blob/96845e6006c15e39ba5b45495f79c21bdff7399e/docs/current-state-20260911.md)
- [Project status](../../data/project-status.json)
- [Database status](../database-status.md)

## 検証

- `git status --short --branch`
- `npm run project:check`
- `npm run repository:check`
- `npm run database:check`
- `npm run verify`

### API試験のローカルHTTP接続（2026-10-11）

候補`7f5ed361`の既存buildを使うMiniflare直接HTTP試験で、AMCの2,097,153-byte POSTが413を返した後、同じsocketを再利用した次の237-byte POSTが`EPIPE`で失敗する順序を確認した。peerの`ECONNRESET`を次要求より先に処理した場合は新socketで400となり、同じbuildのAPI通しが成功する場合もある。環境はmacOS arm64、Node 26.0.0（組込みUndici 8.0.2）、Miniflare 5.20261001.0-alpha。scopeや保存処理の変更が原因という証拠ではない。

`scripts/check-work-api.mjs`の過大入力413 caseだけに`Connection: close`を指定し、取消されたuploadの接続を次の独立要求へ再利用しない。入力bytes、413、直後の400、本文上限、reader取消、認証と保存境界は維持し、自動再送は追加しない。fetch失敗はmethod・pathname・本文byte数と元のcauseだけを追記し、本文・認証headerを診断へ出さない。これはローカルHTTP試験の接続管理であり、本番transportの修正・受入ではない。変更後の対象2要求、同じbuildの全API 1356 assertions、製品lintが成功した。

## 2026-10-02 共通実装統合

G04では[重複実装の統合記録](../git-consolidation.md#2026-10-02-共通実装の統合g04)に従い、既存mainとPR #39/#51、si/MCP/保存/決済/公開Previewの共通処理を一つの検証経路へまとめる。下記の「open PR 0」は2026-09-15時点の履歴であり現在値ではない。今回固有機能を持つ未merge PRを削除せず、共通処理の更新後に各branchをrebaseする。

## 2026-10-05 未統合PRの現行mainへの収束

利用者のmain反映指示により、G04で未統合20 PRを照合する。SIM/eSIM利用開始、本人認証、署名付きモデル、見積・上限の現行契約を保持する。依存PR #53/#54/#55/#56/#60を統合し、Cloudflare peer型とlockを整合させる。依存変更後は `node scripts/sync-web-license-inventory.mjs --write` でlock由来の在庫だけを再生成し、法的clearance・公開gateは独立して維持する。全体verifyと同じSHAのCIが完了するまでmain統合完了とは記録しない。

## AMCとCSVの限定統合（2026-10-05、G04）

今回の「mainにあげて」は、既存のAMC有限fixture 7 scripts / 6 testsとCSV共通処理4修正を最新main `996b1955`起点で統合する承認として扱う。旧ローカルtree全体、別作業のカタログ/UI/配備差分は持ち込まない。主担当ROCK、G04はin_progress。対象試験、固定Goal CLI、全体verify、同一SHA CI、main反映を[今回の証拠](../evidence/amc-fixture-csv-main-integration.json)で分けて記録する。[AMC設計](../amc-autonomy-fixture.md)の実worker・Web未接続と[CSV契約](../csv-business-v1.ja.md)の共通処理範囲を保持する。GitHub統合はSites公開や実si/課金開始を意味しない。

## SPIDER cycle 43: CI依存の復元

H1 / R04、ROCK。main `ecb4b2af`は古いmanifestと新しいlockを別のmerge親から取り込み、`npm ci`が検査・Web build前に停止している。直前main `624124cf`と同一のlockを維持し、Cloudflare/Vitestの5宣言と`undici@7.29.1`の既存overrideだけを戻す。CIは通常の`npm ci`を使い、install scriptや検査の省略で通さない。ローカルのoffline dry-runは依存展開なしの整合性確認であり、GitHub上の実install・build・全体verifyとは分ける。[証拠と残課題](../evidence/spider-locked-dependency-restore.json)を参照する。


### 現行undici security update（G04 / H1 / ROCK）

cycle43の旧7.29.1固定は当時の復元記録。PR216/main d222のroot`^7.30.1`／Mini`^8.12.2`を通常mergeで保全し、lock7.30.1／8.12.3とlicense在庫はmainと同一。GitHubのundici警告48/49/50/55/56/57はfixed。PR218はSRI behavioral2回帰＋独立受入/引継ぎに限定する。EXTERNALはnpm/GitHub、ROCKはpin/lock/回帰、OWNERの追加main統合・公開gateは別。

`npm ci`両方、`npm ls undici --all`、`npm audit --json`でundici指摘消失を確認。当時のroot10/Mini2指摘とzod bot更新不可は旧snapshot。後続PR225/main f4でZod修正を採用し、同SHA製品7/自動更新2成功、当該receiptの他指摘root7/Mini1を別の記録時点として保持。独立旧反例/新拒否・生存とmetadata保全、同期後対象9pass、同期前host全verify exit0を区別する。受入head0aaの同一SHA全7CI成功、Linux `npm run verify`2988／2986pass／0fail／2skipを確認し、[証拠](../evidence/development-execution/undici-security-update.json)へ結果を結ぶ。公開・配備・616一括公開、実Provider/金融/Pixel gateを開けない。

## AMC観測元のファイル読取り

H1 / AMC02、ROCK。SPIDER cycle 47は観測元のpath差替え競合だけを扱う。[既存AMC設計](../amc-goal-orchestrator.md#spider-観測元ファイルの安全な読取り)と[証拠](../evidence/spider-observation-source-read.json)へ集約する。検証は `node --test tests/amc-sky-observe.test.mjs`、同じbranch/SHAのCodeQL。通常AMC importの既存export欠落、全体CI・配備の未合格を別に残す。


## AMCエージェント定義の事前確認

H1 / AMC02、ROCK。SPIDER cycle 48は既存定義の読取り競合（#52）を扱い、新規作成側（#53）は別の未解決として残す。[既存AMC設計](../amc-goal-orchestrator.md#spider-既存エージェント定義の読取り確認)と[証拠](../evidence/spider-agent-preflight-read.json)へ集約。実Codex設定を変更せず、`node --test tests/amc-agent.test.mjs tests/amc-agent-preflight.test.mjs`で合成projectを検証する。


## 生成物の整理（G01、2026-10-05）

主担当ROCK。再生成可能なSite出力とBilling dry-runをGit管理から除き、`repository:check`で再混入を拒否する。設計archive・同一artifactの受入証拠・固定vendor・配布素材は保持する。[保存区分と再生成手順](../git-consolidation.md#repository-storage-policy)を参照。GitHub保存、main統合、公開配備は別々に記録する。


## 停止条件の解消と残る受入（2026-10-05、G04）

最新基点`996b1955`から専用branch `codex/release-blockers`で継続。前回報告のWeb/Android失敗はPR #62で修正済み。native main-1は322 assertions自体は成功していたが、`test_memory_store.py`の3 SQLite接続が未closeで厳格なログ検査が失敗した。`closing`とtransaction contextを組み合わせ、ResourceWarningの検出は維持する。修正commit `c79476e2`のLinux全partitionと`npm run verify`はCI成功。製品runtime修正やOS起動合格とは扱わない。

Local si unsigned APKの現行source buildを再開し、CI `37278057340`で`sdkmanager: command not found`を再現。存在確認だけだったSDK pathを`GITHUB_PATH`へ登録する修正を`9d82ac5a`へ保存した。後続のKotlin timeout型/API応答版/APK版検査、phone準備status判定を修正し、run `37279537731`で現行v4 APK build成功。実bytesを取得してaapt2・stage/再stage/verifyを照合し、overlay列をartifact lockへ固定した。関連40試験成功。実機未接続のためv4端末受入は未実施。詳細は[同一artifact証拠](../evidence/local-ai-apk-v4-build.json)。

残る項目と再開条件:

| 系統・既存task | 担当 | 停止条件と次の合格証拠 |
| --- | --- | --- |
| Local si OS08/OS09 | ROCK/JOINT | 現行v4 overlayのAPK build/ABI/permission/hashと実stage検査は合格。次に対象Pixelでimport、offline plan、停止、再起動を同じAPKで受入。旧v2実機証拠は保持。 |
| Pixel全OS OS02/OS11/RLS02 | OWNER/ROCK | 専用x86_64 Linux・64 GiB RAM・空き400 GiBと予算/アカウント、現行APKを固定してcompile-onlyを実行。署名・flashは別の4/4 gate。 |
| QEMU配布 LCH02/LCH03/LCH07 | OWNER/ROCK | 製品license選択、正式鍵・署名運用、署名後の同一候補で導入/復旧。現在6/10で、旧VMの成功を最新候補へ転記しない。 |
| Sky/Cloud/SIM SIM01/SKY07/SKY21 | JOINT/OWNER | 本番設定、販売者/通信会社の契約・接続、実Providerの料金/usage/請求照合、公開同一sourceでdesktop/Pixel受入。eSIM/決済の別作業branchは自動混入しない。 |
| Wallet/販売 B03/BIL02/WLT06 | JOINT/OWNER | 一般MarketplaceのStripe Connect sandbox・払出し、本人Wallet署名と指定chain/額/宛先。既存CSV専用決済の受入を一般Marketへ拡張しない。 |
| si/非金融Game AI02–AI07 | ROCK/JOINT | main統合済みhost fixtureをnative runtimeへ接続し、2モデル切替・旧仕事復旧・限定記憶・単一実行端末・Game/IPを同一契約で受入。 |
| Material/mini MAT03/MAT05/MAT15 | ROCK/JOINT | Core→UI/Sky adapter、合成scene/poseの実装と、別途R5の光学/3D入力/熱/電源/回路・実機試験。旧E1/E2/E3未完了を現行R5製造の必須手順へ自動継承しない。 |
| IP Studio SKY07/SKY14 | JOINT | 別repositoryのIP Studio runtime、LiveKit Agent/声/モデル/接続先/費用上限、電話Providerを確定して音声・停止・再接続を受入。設定画面保存は実通話ではない。 |
| Security PR #52 | ROCK/JOINT | PR #52は並行作業でmainへ統合され、Web実測も合格。現行CodeQL workflowは合格したが、既存alertの解消とは別。履歴978 commitの2,868候補出現の元byte分類は未解決。未分類値や失敗をallowlist/警告dismissで消さない。 |
| 依存監査 G04 | ROCK/EXTERNAL | GitHub alerts #17 `braces` と #18 `http-cache-semantics` は照合時に修正版未掲載。依存経路と外部入力到達性を調べ、修正版/除去後に検査。未解決のまま保持。 |

再現コマンド: `PYTHONPATH=src:os:tests python3 -B -W error::ResourceWarning -m unittest test_memory_store -v`（native root）、`npm run verify`、Linuxで`python3 scripts/test-native.py --output <new-output-dir> --diagnostic-stacks`。状態確認は`node scripts/check-release-readiness.mjs`、`node scripts/check-android-first-flash-gate.mjs`、`node scripts/check-sky-launch.mjs --require-stage focused`。最後のfocused未合格exit 1は既知の受入不足で、試験失敗を隠す目的でgateを外さない。

後続native CIでGame B/ATMの合計処理時間だけが2秒を超えたため、transportをEvent境界で保持して独立性を検査し、実TLS deadlineは従来の範囲で別計測する。関連7試験・独立処理3.1秒遅延の再現が合格。失敗runと同一sourceでの成功runも証拠JSONに保持した。

## 残PRの開発・契約復旧（G04、2026-10-05）

ROCK担当。#63–65 / #69–76をmain 0c90253cへ統合する。ecb4b2afで失われた依存宣言・SIM利用権正本・AMC認可/再検収/強制停止・catalog接続契約・API検証範囲を復旧する。現在のWorkPlan保存とSky library、AMC手動入力UIは保持する。生成物の整理・LLM host研究・Mini launcher・Local si APKはそれぞれの受入境界を維持する。対象回帰→npm run verify→同一SHA CIが合格条件。秘密情報履歴の候補は未分類で、検査の無効化や広い除外をしない。

依存更新PR #79–81: lock変更時はMIT/BSD等のmetadata差分を確認し、`node scripts/sync-web-license-inventory.mjs --write`で台帳を同期する。root/site双方のsource-map-jsとproxy-addr/tinypool/oxfmtを検証。詳細は `docs/evidence/open-pr-integration.json` のdependencyFollowup。法的clearance・未修正advisory・履歴secret・本番gateは独立。

## 全体進行と未統合差分の回収（2026-10-06）

LCH06/O7が主担当、SKY19/O5が機能担当。最新main e12d880cの同一SHA verify/security合格を確認し、旧作業木の未保存差分を保持した独立branchでeSIMキーを統合する。共通決済・仕事composition・AWS準備の未保存差分は混入させず、各契約と最新mainとの差を確認して次の統合候補とする。優先順は同一source検証→GitHub保存/CI→main統合→配信source同期→Provider/端末受入。外部契約/価格/鍵/flashは個別gateを保持する。全体進捗はAMC32部隊と既存taskPlansを使い、別のtask台帳を新設しない。検証: focused eSIM tests、typecheck、database/project/mission/design checks、npm run verify。

PR #85のsource `f9c85870`はGitHub全7チェック成功。全体verify内のNode1368 pass/1既定skip・仕事API1305・CSV385を確認。main mergeは責任分界のOWNER操作として残し、配備・Provider・実機へ結果を転用しない。元作業木の共通決済/composition/AWS検討は未保存状態を維持している。

## Sky／Zemaの検証済み修正統合（2026-10-08 UTC、G04）

ROCK担当。利用者のmain反映指示により、034/035で限定検収された保存競合・会話復旧・bundle修正を最新mainへ統合する。[今回の証拠と未受入範囲](../evidence/sky-zema-main-integration.json)を参照。同一commitのCIを確認し、未完了の隣接表示試験や本番公開を完了扱いにしない。


## 2026-10-21 未統合runtimeと旧差分の整理（G04 / ROCK）

本人指示によりmain `8a95ee6f230b351e802574acc4c7e36c3b90939e`起点の専用cloneで統合。共有checkoutの685件をGit外へ保全し、統合途中96変更も別backupでバイト一致を確認。main既存修正と旧dirty差分を三者比較し、履歴・Linux/service・owner export・Lab/Pixel adapterを回収する。mainで退役したUI、再生成可能なdist/ログ、既統合DB移行は再投入しない。旧UI差分はmainのowner/料金/復旧修正を優先する。RQ50を維持し、旧RQ49監査には追加要求を明記する。

新migrationはroot0030〜0032、canonical Siteはadditive0026。既存SQLは書き換えない。実施一覧は`data/runtime-integration-audit.json`。完了には全verify・同一SHA CI・main読戻しを要する。共有dirty treeをmainへresetせず、未公開/実機/料金の個別gateを維持する。

PR185のCodeQL指摘に対応し、検査済みHTMLを共有temp固定名へ保存する不要なdebug writeを撤去。Linux runtimeのdownload URLは固定した公開artifactへ照合し、lockfile値を任意送信先へ使わせない。URL変造拒否の回帰試験を追加。

統合結果: PR #185 / merge `9b5ce641e0a947e4b4106f2ffca09d5feee237b2`、source `8fc8027cd149d2486bcfc2be03863200c87d2c1e`。全verify exit0、同一head checks成功。保存→branch→main統合を確認。共有checkoutの進行中差分と公開・実機・実Providerは別。検証詳細は統合台帳。

### GIT-04: explicit local D1 filename alias compatibility

`scripts/sqlite-migration-aliases.mjs` prepares an **offline SQLite copy** for the existing Wrangler filename migrator. `data/migration-aliases.json` pins 11 exact Root/main SQL aliases, including Root0064/main0030 and Root0065/main0031. Existing SQL and Drizzle timestamps are never changed. This helper is exported through `scripts/sites-migration-lineage.mjs`; build, start and deployment do not invoke it automatically.

Read a plan with an explicit complete frozen source lineage and target lineage:

```sh
node scripts/sqlite-migration-aliases.mjs --database /absolute/offline-copy.sqlite --source /absolute/frozen-root/drizzle --target /absolute/integration/drizzle
```

Only after reviewing that plan, use the same arguments plus `--backup /absolute/unused-backup.sqlite --plan-digest DIGEST` to record verified aliases. After `BEGIN IMMEDIATE`, a consistent serialized snapshot is saved and logically read back through one exclusively created no-follow descriptor; state/source drift, filename-byte mismatch, incomplete source schema, unknown audit records and concurrent writers refuse the operation. Backup files contain private database contents and stay outside Git. Failures roll back all filename/audit inserts; retries require a new plan and unused backup path. Keep the backup and original store. Restoring a backup over a newer live database can erase tombstones: restore into a separate copy and re-review, never overwrite current state automatically.

The helper adds only missing canonical names to `d1_migrations` plus an immutable alias audit. It does not replay application SQL, weaken constraints, rewrite `__drizzle_migrations`, perform remote operations, enable billing, or grant runtime completion. Old pending jobs, receipts, stop/revocation records and deletion tombstones remain in place. A high Drizzle timestamp is **not** reconciled by filename aliases.

`remainingMigrations` is an unresolved gate, not permission to call `npm start` or apply those SQL files to Root. The frozen complete Root has 8 target migrations still pending after alias normalization; missing additive CSV/provider columns, partially overlapping Jennifer objects and same-name guard differences need a separate reviewed schema/trigger union. The separate Eve Source lineage also needs its explicit complete base before application. GIT-02 revision2 save fences and list compatibility remain runtime-port requirements.

Verify with `node --test tests/migration-aliases.test.mjs tests/sites-migration-lineage.test.mjs`, the existing `tests/migration-union.test.mjs` (localhost/workerd), and `npm run schema:check`. These are host/SQLite/D1 fixture checks; production readback and runtime acceptance remain separate.

Attempt2 security boundary: planning never executes source SQL. Reviewed `data/migration-reference-profiles.json` binds every journal/SQL byte and expected alias schema/index/trigger definition. Authorizer/query-only isolated snapshots and metadata-only write authorization plus independent precommit state/delta verification refuse external SQL, unknown metadata triggers and silent domain mutations. Replay validates complete audit provenance/history/schema every time. Tested Node26.12.1; helper fails closed without authorizer/serialize/deserialize APIs. Attempt1 metadata proofs are not silently upgraded.20 focused+13 existing D1 tests pass; second review and full union remain pending.

PR186 CodeQL filesystem race correction: backup paths are never passed back to SQLite or reopened for data verification. Held source/backup/directory descriptors and named inode/ownership/link checks span writer lock and COMMIT; backup bytes and private-parent directory entries are synced. Apply requires owned private0700 parents, trusted ancestry, a single-link complete rollback-journal copy and no pre-existing recovery/WAL sidecars. No automatic live-DB cleanup, chmod, recovery or unsafe rollback. Missing/replaced backup/source names abort the transaction, including COMMIT-authorizer checks. Retain failed artifacts for operator review; do not treat a partial/missing backup as success.28 focused cases pass; fresh exact-head CI and independent review still gate adoption.

## PR242 mainのEve fixture await欠落をforward-fixする

head8CI成功と同treeのmain e7d458f2で、Eve新UI試験がreview前のactiveを読んだ失敗を保存する。既存harnessはfingerprint/HTTPを追跡する一方、新handoff検証のWebCrypto Promiseは追跡外だった。制御した未完了barrierで旧flushだけが早く戻ることを確認し、実validate Promiseを既存trackへ登録する。assertion・sleep・timeout・retry・runtimeは不変。新候補の同head全verifyと通常main/同SHA CIで受け入れ、旧失敗を成功へ書き換えない。[診断](../evidence/development-execution/eve-handoff-test-drain-diagnosis.json)。

## ESIM-03 / WEBOPS-03 有限統合（2026-10-27 / G04・ROCK）

main927ac79aを基点に、独立検収済みeSIM source/tests3とWebOps source/tests4だけを無変更採用。旧base全文書は上書きせず、最新設計へ限定deltaを加える。393task/14gate/固定95の分類とwhole0、Root HEAD/index、616HOLDを保持。PR242初回e7失敗とPR243正常main927全6CI成功は[別current記録](../evidence/development-execution/pr242-243-main-current.json)へ。固定union全verify・scanner/canary・Root最終delta検収→明示path Git→新PR同headCI→通常main同SHA CIを[採用記録](../evidence/development-execution/esim-webops-main-adoption.json)へ保存する。GitHub保存を公開配備へ換算しない。
