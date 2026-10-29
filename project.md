### 準備済みPixel・eSIMの最新main再検証（2026-10-29 / G04・ROCK）

Pixelのobserver試験PR261をmain aaab99e1へ統合、head全7check成功。待機上限・停止・未完了表示を直接検証しworker不変。独立host診断27成功/1skip、親process3成功/1 Linux skip。eSIMのESIM-04修正はPR248で採用済みのsource3 hash一致、既存setup込み88/88成功。host全verifyは3380件中3376成功/0失敗/4skip、初回sandbox待受拒否と通常権限再実行の区別を保持。[限定再検証記録](docs/evidence/development-execution/pixel-esim-prepared-work-main-merge.json)。Pixel統合後の同SHA6check/4workflowも全成功。記録込み全verify初回の既存PC終了確認/bot削除失敗は保持し、各単独再実行と全体再実行（3376成功/0失敗/4skip）が成功。実機・全OS・parent DB/Broker freshness・実provider/実課金・一般公開は未受入。

### Eve Mac限定検収/cleanup完了・品質/wholePixel FAIL・Git待ち（2026-10-29 / AI02・O3・ROCK）

新candidateはfresh-base8更新/adapter SHA b7f68b54、セッション16確定＋不明最大1=charged upper17、学習wall28.681秒。モデル推論は終了しteacher0、正式比較41calls（A21/C20）、追加Pixel15（13 completed-output＋2 unknown停止）で計56calls/14336要求outputを計上、unknownも保持しcompleted-outputを回答成功と混ぜない。A/C課題完了とも0/20、schema A2/21・C0/20で候補品質FAILを維持。Pixel P01/P02は接続/同candidate表示、P08はreload追加生成0・既存52record完全保持、P09は同candidate所有worker停止とA有効回答の遅延保存取消/late拒否・doubletap1operation、P10はoverlimit/unavailable追加0callsと復旧到達の限定実測。cancelledを処理中と表示するUI・上限拒否非表示は修正され、作者報告の独立物理再検収PASS。P03〜05内容失敗、P07repair/3step未実証、最終10ケース報告でP06も限定PASSを確認。個別PASSはP01/P02/P06/P08/P09/P10、FAILはP03/P04/P05/P07。経路PASS_SCOPEDとwholePixel/候補品質FAILを分け、native OSは未実行。[公開集計](docs/evidence/development-execution/eve-mac-five-hour-candidate-progress.json)。全verifyは入口不足・OpenSSL3 PATH不足・wrapper型lint指摘の履歴を保持し、修正focused PASS後の全verifyはexit0、Node3467件中3463成功/0失敗/4skip、build/API/mission/work/bot完了。既存OpenSSL3 PATHを明示し、ログhashを公開要約へ固定した。最終独立reviewはCOMPLETE_SCOPED、implementationSafety=PASS_SCOPED_NO_OPEN_P1_FOUND、overall=FAIL_QUALITY_AND_WHOLE_PIXEL。review SHA35c3f83a、source29hash/pixel54hash一致、P2修正の物理再検収PASSを確認。owned server正常終了、modelworker0/activejob0、ownedUSB削除、検証したowned試験tab17閉鎖、他process/接続/画面は維持。作者はOSlease返却済みと報告。作者が固定34ファイルをhead2d11f545でGitHub保存しdraft PR288を作成。最新main bbc9a359の33commit/25pathを通常mergeで同期準備し、README/project/status両側の追記とmain全進捗を保持、独立review済みsource29hashも不変。同期直後の全verifyは3469件/3465成功/0失敗/4skip。元headのCodeQLでhigh2/medium1（credential競合・CSP抽出case・合成testのfile由来送信）が判明し、server/testの2pathを修正、FIFO非待機回帰も追加。修正後の独立差分検収はPASS_SCOPED/must-fix0。最終main9a7c2a9cの19pathも両側保全して同期し、全verifyは3472件中3468成功/0失敗/4skip、build/API/mission/work/bot完了。新head CodeQL/CIとmain同SHA CIはこれから。旧29source/物理証拠のうち、この2pathは新sourceの物理受入へ転用しない。実験toolkitの採用と品質FAIL候補の採用は別とする。

### Eve合成supervisorの停止信号保持（2026-10-29 / ROCK）

停止signalがsubprocess poll中に消失する競合を合成再現。停止要求を保持してowned childを終了・回収し、元handlerを復元する候補を作成した。独立6/6成功、初回sandboxの1件失敗（原因未確定）と通常権限再実行を区別。[証拠](docs/evidence/development-execution/eve-signal-supervisor.json)。PR290・292のCI Timeoutとの因果は未確定。PR294はmain a749b623へ統合し同SHA CI 6/6成功。[CI証拠](docs/evidence/development-execution/eve-signal-supervisor-main-ci.json)。実モデル、子孫group、端末、hard isolationは未受入。

### Eve担当保存の応答不明と再送照合（2026-10-29 / ROCK・Sky）

HTTP 408後にChromeが同一IDを再送して409となると、保存済みでも保留が消える反例を合成環境で確認。408と409は本人・ID・revision・設定を再読取し、不一致や読取失敗はunknownで維持する。独立検収11試験と35ケース、Chromeの同一body再送・他owner・誤内容を確認。旧基点cb77654d全verifyは3364成功・0失敗・4skip。新基点e79461ecの初回はローカル待受権限で停止、権限付き初回は既存Tool期限試験1件失敗（単独再実行成功）、全体再実行は3376成功・0失敗・4skip、buildと各check完了。実サービス・他ブラウザ・端末は未検証。[証拠](docs/evidence/development-execution/eve-create-408-409-reconciliation.json)。PR259 head 6a1f9747の全CI成功、通常merge main 53a61fd6の同SHA6checkも成功。実認証・端末・本番の受入は別途必要。

### Smith/MCPのPackage権限参照fixture（2026-10-28 / SMITH-02・SKY07・SKY21・ROCK/O5）

基点main cb77654dから作者4ファイルをhash一致で採用、元32試験は中央独立でも成功。しかし同じauthority ID/revisionへ契約を差し替えた参照を古いjobが借用する反例1vs0を確認した。9項目の型/過不足とrow owner・操作PackageをSQL自身で同一job CASへ相関させ、修正後35/35と旧WorkJobの読取り/取消を確認。[契約](docs/sky-tools-complete-design.md#work-tool-package-authority-fixture)・[証拠](docs/evidence/development-execution/smith-mcp-package-authority-contract.json)。fixture-onlyで本番rootはUNBOUND、production migration/consumer/gate変更なし。正当な発行/更新/失効主体と実認証・Agent/承認/価格/Brokerの原子的接続は未確定。修正source3は別担当独立PASS_SCOPED、全verifyは3377件中3373pass/0fail/4skip、build/API/mission/work/bot完了。固定11metadataを独立照合し、PR258 head 811eeb45の全CI成功、通常merge main e79461ecの同SHA6checkも成功。scope-only開放の不採用、中央setup/syntax初回失敗も履歴を保持する。実eSIM/通常account許可・Provider・モデル・課金・端末・公開の新規受入なし。

### Pixel保存済AI照合の未確認記録（2026-10-28 / Android・ROCK）

本人の追加許可を受けた担当者が既存の「保存済みAIを照合する」を1回操作し、画面は「照合・準備の結果は未確認」と報告した。[最小証拠](docs/evidence/development-execution/pixel-inventory-unconfirmed.json)は要約の独立読取り評価に限る。モデル/仕事/接続内容・秘密情報・画面/raw状態を保存せず、通信有無とデータ全体の前後は未照合、取得・準備・モデル/仕事/接続・実機/OS受入は未成立。Git担当の追加端末操作は0。基点main8566573dはmii PR255とfixture PR256を保持し、各同SHA全CI成功を別証拠で確認済み。今回は記録のみの別PRとし、新しいGit/head/main同SHA全CIはこれから確認する。

### Pixel診断observer試験の時間依存修正（2026-10-29 / Android・ROCK）

進捗PR260の統合main 317766a7初回CIで既存observer試験が0.203906秒となり0.2秒閾値を超過。同じSHAの再実行は成功し初回失敗は保持。終了待ちの指定0.05秒・停止Event・未完了状態を直接検証し、実callback停止中の復帰はwatchdog付きで確認する試験候補を作成。旧試験は診断保存0.25秒遅延で失敗し、候補は無期限join・待機上限変更を検出。独立Mac診断27pass/1skip、親process3pass/1 Linux skip。worker・実機は変更しない。[証拠](docs/evidence/development-execution/pixel-observer-join-fixture.json)。独立差分照合で対象1件の置換と1件追加、残る26件の不変を確認。全verify初回は別の既存bot試験の一時directory削除ENOTEMPTYで1件失敗（単独11成功）、全体再実行は3376成功・0失敗・4skip。PR261 head 54c36545の全7check、通常merge main aaab99e1の同SHA6check/4workflowが成功。

### Pixel診断positive fixtureの保存完了同期（2026-10-28 / G04・ROCK）

PR255はhead7check/4workflow成功でmain76b327c2へ通常統合したが、main初回verifyが既存Pixel診断試験のexitKind欠落で停止した。任意診断の非待機lockへ観測writerが競合し、正常fixtureの300ms固定待ちは保存完了を保証しなかった。observer fsync800ms遅延で元試験の同じKeyErrorを再現。fixture子終了をfirst output診断保存ackへ同期し、同じ遅延1/1と診断27中26pass/1historical skipが成功。実worker・停止/期限・権限と元assertionを変更しない。[証拠](docs/evidence/development-execution/pixel-diagnostic-fixture-order.json)。次は独立検収、Git/PRとhead/main同SHA全CI。元main失敗は保存し、同SHA rerunは1回だけ実行中。実機操作・推論・有料接続なし。

### 隔離Chrome試験の後片付け（2026-10-29 / ROCK）

F3の統合後進捗記録の全verifyで、一時Chrome profile削除時にENOTEMPTYが発生しブラウザ試験1件が失敗。試験結果表示後も自分の試験processが残ったため、そのprocessだけ停止し初回ログを保存。mkdtemp配下の削除に一時エラー時の限定再試行を追加し、失敗が続けば試験は失敗する。runtime・assertionは不変、独立Chrome2/2成功。[証拠](docs/evidence/development-execution/f3-handoff-browser-cleanup.json)。全verify再実行は3392成功・0失敗・4skip。Git/head/main CIは未完了。

### SDK配布入口の隔離確認（2026-10-29 / ROCK・Sky）

SDK 0.1.5の実CLIで隔離workspaceを作り、sample importを作者操作としてpackage入口へ変更した上で、Eve・Smith実画面、Connector、2担当のjobとmii読戻し、未対応担当の拒否を一連で確認。独立Chrome 2/2と既存統合1/1成功。mii実リンクから同job exportをdownloadし原文・manifest hashとDB不変を確認、別owner・旧版/異版は実routeで拒否。本人・reviewは合成、実Provider・実機・Sky output centerのdownloadは未受入。[証拠](docs/evidence/development-execution/sdk-browser-consumer.json)。PR295 head ba515313初回verifyは共有fixtureの旧export名欠落で既存統合試験が失敗（ログSHA256 a6f7e1d09b8e4d3f3bb8d6969b6dc3972e5d245b149e8d2a2593f1810177879e）。既存consumerを共通workspaceへ修正し独立3/3、PR295同head CI成功。main 21b75a61の同SHA CI6/6成功。[統合CI](docs/evidence/development-execution/sdk-browser-consumer-main-ci.json)。

SDK 0.1.5候補は通常のpack時にdist入口を生成し、Studioと作者雛形を同版へ揃える。旧0.1.3/0.1.4 archiveは保持する。作者がsampleのimportをpackage入口に変更した合成localhost・offline試験でdist経由を検証し、元の同梱sampleはsourceを相対参照する。--ignore-scripts時は自動build保証外。宣言は権限・安全・実料金の保証ではなく、実Provider・実機・registry公開は未受入。 初回候補の独立6/6後、Linux CIでgzip既定圧縮率の差を検出し、固定形式へ修正。独立7/7、MacのPython 3.9/3.15で一致。PR292の修正後同head Linux CI成功、main 2fe3ea46統合済み。統合後CIは後続pushで一部cancelされたが同SHA再実行7/7成功。[統合CI](docs/evidence/development-execution/sdk-dist-release-main-ci.json)。初回CIのsupervisor停止Timeoutは原因未確定で記録。[証拠](docs/evidence/development-execution/sdk-dist-release.json)。PR291はmain 1ff203a8へ統合し同SHA 6/6 CI成功。[証拠](docs/evidence/development-execution/worker-untrusted-result-main-ci.json)。 PR292 head ee3153cc初回verifyは既存Eve合成supervisor停止試験の8秒Timeout（ログSHA256 83726f6778021dd9fc7c023aab6982aa2eb61c1c18d83bd7853f37194f9875f2）、同SHA再実行はSDK archive不一致（09d82bc3764ea492a6b52a5ed3dce0f093c5d7dc734aef9ef25c0119bf8dc397）で失敗。PR293 head 398aa717もSDK archive不一致で失敗（becccbc96a13836104221003e5efb9277a60ea7c01d4e35627d4719d672237b0）。

main 924121e1のSDKをoffline・ignore-scriptsでpackし、同梱6ファイルがsourceと一致、package名importと2種類の合成manifestを独立照合。[証拠](docs/evidence/development-execution/sdk-distribution-isolated.json)。公開入口はsrc/index.mjsでSDKのdist buildは定義されず、sampleは同梱されるが公開subpathではない。Node APIのguardはOS全体の遮断ではなく、実登録・Provider・端末・推論・公開は未受入。

### portable runtimeの隔離buildと配布入口（2026-10-29 / ROCK）

main未採用の既存runtime sourceは固定pin8件とbuild入力28件が一致。隔離copyを既存esbuildでbuildし、公開4入口importと合成19試験が成功。独立読取でhashを照合。[証拠](docs/evidence/development-execution/portable-runtime-isolated-build.json)。Nodeの通信guardは検査対象のimport/testに限りOS全体遮断ではない。対象source32件を比較し、元worktree全体の不変は主張しない。main採用・実機・実account・実モデル・Node22実行は未受入。必要なsubsetの採用は別途検収する。

### 担当付き仕事の作成前確認（2026-10-29 / ROCK・Sky）

未達だったF3の作成順序を修正し、現行Agent画面はTool・runtime・具体的入力・未検証料金申告を確認してからjobを作る。本人・Agent版・Package版・入力digestを固定し、期限と版をAPI・SQL保存境界で検査。未送信と応答不明を分離し、不明時は同じ本人・ID・digestをGET照合、未存在を自動再送しない。旧clientの保存互換と別の実行承認を維持。旧候補の期限切れと通信断迂回を実画面で再現し修正、独立r3は関連66/66・Chrome2/2成功。mii予算と併せた67試験成功。統合候補も独立35/35成功。全verify初回はVM依存欠落84件とURL不足1件で失敗しfixtureを修正、既存assertionと未確認POST拒否を保全して全verify再実行は3392成功・0失敗・4skip。PR265 head 06f43126の全CI成功、main 924121e1の同SHA6check成功。確認記録は実行権限・独立検証済み価格ではなく、通常account・実機・本番課金は未受入。[証拠](docs/evidence/development-execution/f3-creation-disclosure.json)。

### mii同一仕事の委任予算読取候補（2026-10-29 / Android・ROCK）

既存A2A APIへ本人scopeとjob IDを追加し、miiソフト画面から上限・予約・利用量記録を明示読取する。観測・本人・job不一致と通信断は未確認とし、MCP料金・請求確定・実行許可に使わない。合成ブラウザと本人違い／期限／再送競合を含む54試験成功。独立検収でUI fixture不足と古いエラー残存を修正。別owner予算行の拒否と、owner hash照合中の観測喪失も確認。全verify初回は新テスト宣言lintで停止し修正、旧基点全verifyは3384成功・0失敗・4skip。main 91bd8bec取込み後の初回は既存Tool期限fixtureで1件失敗し単独23成功、全体再実行は3384成功・0失敗・4skip。Git/head/main CIは未完了。[証拠](docs/evidence/development-execution/mii-budget-readback.json)。PR264 head CI成功、main 6e494267の同SHA6check成功。担当付き仕事の作成前Tool／入力／費用確認は別候補で検収中。実mii・実account・Provider・実課金は未受入。

### mii合成入力から同じ仕事のMCP実行へ（2026-10-28 / MINI01・M1）

同一合成D1に実mii UIの2 tab・IndexedDB strict・work route・A2A Workflowを接続。停止応答消失やsocket切断で同jobの取消1件と予約5保持、同commandの明示再送でも同一結果を独立4/4確認。[証拠](docs/evidence/development-execution/mii-worker-shared-d1.json)。Chromeの自然再送回数は環境依存の観測であり固定保証しない。storage許可はfixture、Workflowはtaskなし判定まで。遠隔取消・署名usage精算は別fixtureのまま、実機・実provider未受入。PR296初回head CodeQLでfixture HTTP応答のstack露出2件を指摘し、固定応答へ修正。修正後の独立4/4成功、新head CIとmain統合は未完了。

同一jobの2 mii adapterが並行停止する合成Worker試験でjournalは2回のclaim・1勝者、PATCH1回、両者unknownを確認。再読込後の予約保持、別途remote取消応答喪失、偽署名拒否と署名usage一度精算を同じjobで保持。独立1/1成功。[証拠](docs/evidence/development-execution/mii-worker-two-consumers.json)。同process・合成authority/providerであり物理停止・実networkは未受入。remote送信ACK喪失でtask ID不明の場合は同じremote取消を送れず、別試験で保留する。PR293の同head CI成功、main 692a59e0へ統合。統合後CIは後続pushで一部cancelされたが同SHA再実行6/6成功。[統合CI](docs/evidence/development-execution/mii-worker-two-consumers-main-ci.json)。

着手: main e9433589を基点にclean作業枠を使用し、別worktreeのハード設計を保全。合成文章を既存runnerへ渡し、owner/job/Agent/Tool/一回承認/Connector claimを再利用する。判断: 30秒観測・入力世代で未送信を拒否、begin後pendingとclaim後応答を同じjobへ照合する。独立検収で時計巻戻しによるguard復活と入力編集中の旧非同期処理を修正した。局所80/80と全verify成功（Node3364/3360pass/0fail/4skip、build/APIを含む）。初回lint失敗と修正、source hashは[証拠](docs/evidence/development-execution/mii-synthetic-input.json)。最終React規約対応後の中央独立80/80は合格。実機/光学/推論/実課金なし、main統合・CI未確認。次は固定候補をGit担当の独立統合へ渡す。 中央の独立実行80/80後、観測有効期間内の部分的時計巻戻りを追加再現し、最終照合時刻を保持して旧観測を不可逆に失効させた。修正後関連55/55・実Chrome/Connector81/81、時計patchの別担当独立PASS_SCOPED。中央全verify初回は未変更PC adapterの終了確認1件で失敗、同一sourceの単独Python3.15/3.14と同条件全体再実行は成功（3365/3361pass/0fail/4skip、build/API/mission/work/bot完了）。初回失敗を保持し、最終19ファイルmetadata検収とGit/head/main CIは未完了。Pixelの別scope観察はブラウザ自動起動・外部通信不明・同期接続未確認・前後比較不足のため実機合格に数えない。

### Smith Local Agent設定拒否応答の有限採用開始（2026-10-28 / SMITH-02・SKY21・ROCK）

PR252/main0dcbbf6の全7check/5workflowとLinux3246/3244pass/0fail/2skip、Android compile/emulator/trial成功を閉じ、別実質batchに最小readback同梱。Smith source3をbyte不変採用し、authorbase c3a9と最新mainのroute旧本文/隣接API/store/workflow/locks互換を確認。元から拒否された6設定不一致のstatus/code/message/no-storeを揃えるだけで新権限ではない。Root source独立PASS/実8、中央関連28成功。全verify3254/3251pass/0fail/3hostskip・build/API1678/CSV385成功。次はRoot最終metadata→Git/HEAD/main同SHA CI。実認証UI/Provider/端末/運転中race/wholeSMITH02は未受入。元95/393/14・優先4系統/OS横断要件・616/OS08拒否境界を維持。

### Pixel既存保存fileの限定readback証拠を別scopeで受領（2026-10-28）

Rootの整合/hash独立PASS_SCOPEDを受けたpublic要約1件だけを次revision候補へbyte不変同梱。既存PC/Pixel770byte同hash/過去一致、APK/protected4+欠落1/forward/service前後不変。private4proofや旧OS08拒否候補は未取得/非転載、Gitは端末操作なし。新推論/新job/export/UI/wholeOS合格なし、UIはCUA Terminal拒否で未実施。Pro18/R1やEve13 fixture修正とは受入を分け、最終unionをRootが別検収する。

### PR252のEVE13検収fixture待機漏れ修正（2026-10-28 / EVE-13・G04）

固定18/HEAD6a314を保存し、初回CIの既存停止応答喪失1failを成功扱いにしない。evePendingRecoveryConfirmsの非同期fingerprintがfixture inFlight外だったため、35ms制御遅延で同じstored.size 1!=0を再現。返却Promiseを既存trackへ結び、既存assertion/12roundを維持。恒久遅延testは5000msの上限、35msはfixture入力で性能保証ではない。旧待機の同一assertion1fail、修正後焦点2/関連96成功。Pro source4と製品runtime/API/同意/停止は不変。修正後fullverify3246/3243pass/0fail/3hostskip・build/API1678/CSV385成功。次は固定修正のRoot別検収→同PRへ通常追加commit/新HEAD CI/main/mergeCI。blind retryや無関係修正はしない。

### OS優先に含まれる既存要件の明示訂正（2026-10-28 / G04）

本人の補足で、OS優先は料金・請求/Wallet/Game/eSIMの既存要件とOS runtime接続・受入を含むと明記。これらを一律後回しにせず、既存95unitとtask/専門owner/接続・合格条件へ4workstreamを紐付ける。非金融GameはWallet完成待ちにしない。4系統はOS（上記を含む）・Eve・Smith・miiで内部順位なし。優先変更だけで実資金/実徴収/Provider/flashや個別gateを合格・実行許可へしない。Pro着手済みcloseout、Root集約/Git保存、新chatなし、616/OS通知拒否を維持する。

### 本人の4系統優先を既存全体台帳へ反映（2026-10-28 / G04）

Root全体窓口/Git保存統合へ集約し、OS・Eve・Smith・miiを次の新規作業の優先とする。4系統内順位なし、全4一斉起動なし、全95残件保持。着手済みPro再開入口のcloseoutを終え、その他の新規独立拡張は4系統に必要な依存以外後回し。現在mii本人作業と重複しない。古い作者captureの未統合を、既採用PR/現mainと照合する参照を6系統へ追加し、元証拠を書換えず再実装を防ぐ。製品要望/料金/許可/元95分類は変更しない。

### Pro既存job再開入口の限定採用開始（2026-10-28 / PRO-02・AMC02/SIM01・ROCK）

PR251/mainc3a9の全6check/4workflow・Linux3240/3238pass/0fail/2skipを閉じ、別実質batchに最小readbackを同梱。Pro source4はRoot独立PASS_SCOPED/5probeでbyte不変採用、再利用10とruntime2の旧/新main blob不変・archive prefixを保持。UUIDだけの固定job URLへ明示遷移し、現本人一覧にあるjobの確認を既存画面へ渡す。中央関連95成功。author local GUIと合成共通画面の層を分け、一覧外exact GET/実認証保存停止/配備/native/wholePRO02は未受入。全verify3245/3242pass/0fail/3hostskip・build/API1678/CSV385成功。次は固定metadataのRoot別検収→最小Git/HEAD/main同SHA CI。Root dirty/index・95分類/393/14・OS通知拒否/616は維持。

### 独立検収差戻しの最小修正R2（2026-10-28 / G04・SIM01・ROCK）

R1の15file・旧59/3229試験・両reviewを不変保存。Billing P2のreadCurrent引数aliasは別コピーで閉じ、62焦点と無変更独立probe16成功。Root P2四件は既存unit/queueの非循環graph、appliesTo集合の一意完全一致、host契約repairの正確な分類/予定consumer milestone、Billing/Astraのruntime検収担当へ修正。control54・無変更Rootprobe5成功。これらのauthor replayは独立R2受入ではない。R2全verify3240/3237pass/0fail/3hostskip、build/API1678/CSV385成功。別source/control再検収→最小Git/HEAD/main同SHA CIが残る。未配線helperで他laneを停止せず、production/物理/Provider/公開・OS通知拒否・616HOLDを維持。

### 全体portfolioと共有アクセス判定の実装（2026-10-28 / G04・SIM01・ROCK）

本人の全体対象の訂正でmii固定primaryを解除し、既存11lane/95unitをmain7d23とsource/残gate/責任へ照合。PR250の通常main・同SHA全6check/4workflow成功は維持。今回の実装はESIM-01/04の既存access evaluatorで、await中の支払い/予算/親facts差替え・retention失効を拒否する。旧8leaf反例（aggregate1別）を保持、修正後59焦点・portfolio46/mission/type成功。初回refactorのretained欠落回帰1件は修正し履歴を保存。全verifyは3229/3226pass/0fail/3hostskip・build/API1678/CSV385成功。独立検収/Git/CIは未完了。親DB/Broker原子性・実認証/端末/Provider/一般公開は未受入、OS通知拒否未受領・616HOLD。次はRoot別検収後に最小Git/HEAD/main同SHA CI。

### 最終union検収前の状態固定（2026-10-28 / G04・ROCK）

control R2全verify3207/3204pass/0fail/3skipは固定R2に1回。後続の受入済Mini3 byte不変配置・canonical追補には明示verifier11/35721pairと局所44・metadata/designを別実行し、浅いCIでMini再現済みとはしない。最終unionのsourcehashとscanをRootが正式独立検収するまでcontrolを自己採用しない。Git/head/mainCIは別段階。miiの次はM3/M4実測入力→M7別検収でありRootの単なる返答待ちではない。OS通知保留/実機操作なし/616維持。

### 受入を分けた小unionの保存準備（2026-10-28 / G04・ROCK）

Root受入済mii source3＋別reviewをbyte不変でcanonicalへ保存し、11項目/index/現行再現commandと測定担当へ接続。controlとは別受入を保持するが最終unionをRootが検収し1PRのhead/main CIへまとめる。control R2全verifyは3207/3204pass/0fail/3skipで成功。mii verifierは通常cloneのbaseline/working2hashを明示検査して別実行し、浅いCIの未実行を物理/光学の合格へ換算しない。元未merge hardware3はrefだけ。

### control R2の独立指摘修正（2026-10-28 / G04・ROCK）

Root初版probeの4拒否漏れ（物理フラグ、管理によるprimary代替、path alias所有、baseSHA）を要求内の最小修正で閉じ、恒久負例を追加。R2局所44/既存mission成功、無変更Rootprobe5成功・Root自身のpreflight再実行も5成功。初版code/39試験/fullverify3202成功は別snapshot保持。2actor化で古い負例が4actorを作らなくなった試験失敗1件も保存し、明示4actorへ修正。次は固定R2全体verify/scan→Root正式manifest検収→Git/CI。自己受入・物理証明への換算はしない。

### 固定control全体検証成功・mii限定判断受領（2026-10-28 / G04・ROCK）

control fullverify1回でexit0、root3202/3199pass/0fail/3skip・build/API1678/CSV385成功。Rootからmii MII-OPT-ERROR-MAP-01の独立PASS_SCOPEDを受領しsource3hash一致を確認。眼誤差1:1設計を採用しない判断であり、30mmは10mmframe控除後の有効内縁余裕。一軸/target/normal/face固定必要条件だけで物理/光学方式/全範囲/comfort/製造は未受入。mii3fileはcontrolへコピーせず別Git候補。controlは自己受入せずRootの独立負例検収待ち、次に明示manifest Git/HEAD/mainCI。OS通知拒否/registry非読取/616保留維持。

### 実行管理validatorの局所検証（2026-10-28 / G04・ROCK）

mission:checkへcurrent overlay限定の矛盾拒否を接続。新負例と既存AMCの39件成功、metadata/design/中央lint/diff成功。正規mission:checkの追加不正fixtureも拒否し、実overlayはskip/置換しない。code成果は存在するが独立受入ではなく、Mini商品成立・実GitHub/物理証明も主張しない。次は固定候補fullverify1回→Root独立負例検収→明示Git/PR/headCI/main/mergeCI。元95分類/モデル表、393task/14gate/whole0、OS通知保留・616を維持。

### 商品成立primaryと実行管理の修正開始（2026-10-28 / G04・ROCK）

最新main8793から隔離。miiのMINI-02/MAT15成立判断1件をprimary、Git10のcontrol修正を別候補として所有。95全件bootstrap/再分類はせず、段階・証拠・owner・artifact/SHA・保留解除条件をmission:checkで強制する。main内11laneの限定証拠所在のみ確認し最新chat/未統合sourceはUNKNOWN。OS候補通知拒否は未解決・候補未取得/中継なし。次は負例/正規metadata/design/project整合→候補固定fullverify1回→Root独立検収→明示Git/PR/headCI/main/mergeCI。Mini終了まで新reviewactorを起動しない。実機/推論/契約/課金/公開/whole95/616保留。

### PR248 eSIM限定修正のGit・main最終検収（2026-10-27 / G04・ROCK）

head05978074全7CI/4workflow成功後、通常mainb5c1ea18へ統合。同SHA6CI/4workflowと実Linux3174/3172pass/0fail/2skip成功、head/main同tree・全18blob・保護12一致、Root HEAD/index保持。元pending captureを変えずcurrentproof/index/status/unit overlay/引継ぎへ同期。metadata-only候補の正規fullverifyもexit0、root3174/3171pass/0fail/3hostskip、build/API1678/CSV385成功。初回11path scanner0/canary1。これはmetadata closeoutでPixelの未受領候補を取り込まない。Pixel作者通知2宛先の本人許可待ちは別条件として記録し、実機/実auth/親DB鮮度/Provider/金融/公開/whole95/616保留を維持。

### OS-08準備と作者通知の許可待ち（2026-10-27 / G04・ROCK）

最新mainb5c1（PR248統合済み・merge同SHA CI待ち）から隔離統合treeと一致依存を準備。OS08作者は有限終了したが、中央Git/Rootへの候補通知が宛先を明示した本人許可未確認としてauto-review拒否。本人へ具体2宛先のasync許可を確認し、拒否通知を別経路で移送せず候補未受領・未採用を保持。独立risk/全体検証/Git/main/実機合格は未実施。eSIM統合後CI確認は別に継続し、共有WIP/registry/616公開保留を維持。

### ESIM-04 正規全体検証成功（2026-10-27 / G04・ROCK）

fullverify exit0、root3174/3171pass/0fail/3hostskip、type/productlint/design/build/API1678/CSV385成功。初回18path scanner0/canary1。現行handoffは固定source3/独立risk/host fullverify成功と残る固定manifest scan・Pro metadata・Git/headCI/main/mergeCIへ同期。元helper反例/返却identity差/実auth・親DB鮮度・Provider・実機・公開/whole95/616保留を維持。

### ESIM-04 固定3pathの独立採用（2026-10-27 / G04・ROCK）

独立Astraを通ったhelper/test/原本receipt3のみをmaina2b6基点へ採用。元10leaf反例（aggregate含む12fail）を区別し、入力snapshot・署名byte・返却値の結合と渡されたfactsの完了時再照合へ限定。返却identity差/呼出元互換を11項目・index・READMEへ同期し、保護12/source caller/DB/Broker/署名wire/TTL/料金を維持。次は正規fullverify・scanner・別metadata検収・Git/head/main同SHA CI。親DB失効全周/実認証/実機/Provider/公開/whole95/616保留。

### eSIM完了結果の本人依頼同期（2026-10-27 / G04・ROCK）

PR213製品head7/main6CI成功と、その後PR224で新hashの自然hidden/visible実component補足受入・head7/main6CI成功を別時点で保持。native Chrome＋合成fetch/dataであり実auth/Provider/課金ではない。hidden中とfresh応答保留中は私有本文/操作なし、旧応答では戻らずfresh一致後に復帰、POST0。元summary hashを保持して進捗/引継ぎ/既存unit overlayへ同期。generic issue/renew/revoke・独立retention ACL/expiry・親epoch・実profile/回線/課金/productionD1/一般公開・wholeESIMは未受入。次はESIM04固定3pathの独立Astra検収（採用前）。

### PR247 EVE-13 main検収完了（2026-10-27 / G04・ROCK）

head37985eaaの7CI/4workflow成功後、通常maina2b6dfd8へ統合。main同SHA6CI/4workflowと実Linuxverify3162/3160pass/0fail/2skip成功、head/main同tree・全21blob一致を確認。元pending captureと別のcurrentproofを保存し、R1/R2finding・R3lint失敗・最終metadata1件訂正履歴を保持。wholeEVE13/実認証UI/Pixel実機/Provider/金融/公開/616保留は維持。次ESIM-04候補3pathは作者作業中で未採用。

### ESIM-04 async署名入力bindingの次作業（2026-10-27 / G04・ROCK）

最新main a2b6dfd8（PR247統合済み、merge同SHA CI待ち）基点に隔離統合treeを準備。既存eSIM担当へhelper1/test1/receipt1だけを割当て、鍵解決/import/verify待機中の入力bindingをhost反例で確認し、成立時のみ最小修正する。署名wire/TTL/DB/料金/Brokerは不変、独立Astra必須。Root専有registry/共有WIPは非操作。前候補のcloseoutはCI成功後に別証拠へ記録し、実機/Provider/公開/wholeunit/616保留を維持。

### EVE-13 実browser helper限定合格（2026-10-27 / G04・ROCK）

Pro独立担当が実helperをbundleし、localhostの実Web Locks/localStorageで2tabの要求待機を確認後に競合を解放。1成功1拒否、reload同ID保持、誤ID clear拒否・一致clear後nullを確認。source前後hash不変、合成key/tab/serverをcleanup。画面証拠はGit外に保持し要約だけ保存。実認証WorkJob UI/Pixel実機/本番受入へ転用しない。次は固定manifestの独立metadata検収とGit/head/main同SHA CI。

### EVE-13 R4全体検証成功（2026-10-27 / G04・ROCK）

正規fullverifyがexit0、root Node3162/3159pass/0fail/3hostskip、type/productlint/design/build/API/CSV成功。R3のlint2失敗を保持。固定policy scannerは変更payload0件/canary1件を確認。次はPro実helper browserの別層結果と最終manifest検収、明示Git保存・PR/headCI・通常main統合・merge同SHA CI。実機/実認証/Provider/wholeunit/公開・616保留は不変。

### EVE-13 R4機械差分の独立採用（2026-10-27 / G04・ROCK）

中央設定lintで出たR3の2件を、同期期限比較のmodule helper移動と試験Promise初期値だけで修正。最後のawait後dispatch直前チェックと既存assertionを保持し、独立Astraの狭いdelta検収PASS後に採用。R3 verify exit1は残し、新R4で全体検証・scanner・Pro最終検収・Git/main/CIを続ける。実認証/実機/Provider/公開/616保留は不変。

### EVE-13 R3全体検証のlint差分（2026-10-27 / G04・ROCK）

fullcheckoutのtype/designは成功、必須verifyはproduct lint2件でexit1。componentのDate.now purityと試験secondOutcomeのawait-thenableで、独立runtime反例の再発とは確認していない。Root局所R4へ意味不変の修正を返し、元R3 sourceと独立PASS/失敗ログを保持。Git保存・main統合は未実施。

### EVE-13 R3限定source採用（2026-10-27 / G04・ROCK）

独立Astra再検収を通ったsource4と原本receipt3だけをmain8e基点へ採用。R1競合/P2 1件とR2本人・期限/P2 2件は修正履歴として保持。閉じた確認先metadataとowner別Web Locks、待機後のfresh owner/期限、同ID GET-onlyを正本11項目・index・READMEへ同期。次はtype/lint/fullverify/design/scanner、別Pro最終検収・local helper browser検証、明示manifest Git保存・通常main統合・同SHA CI。実機/実認証/Provider/whole95/公開は未受入、616保留。

### EVE-13 R3固定と独立再検収（2026-10-27 / G04・ROCK）

Rootがローカル修正したsource4＋receipt3の7pathを固定（manifest `d4593290`）。R2のP2 2件はlock待機後の本人/見積期限の再照合で修正候補とし、Billingへ独立Astra/high再検収を依頼。関連111と既存独立probe21のauthor実行成功は独立採用へ換算しない。source未採用、Git/PR/main未実施。PASS後に中央fullverify・scanner、別Pro最終検収、Git保存・通常main統合・同SHA CIを続ける。Eveへの送信は行わず616公開保留。

## EVE-13 継続準備とPR246の現行受入（2026-10-27 / G04・ROCK）

人間の既存chat連携認可を元userMessageで確認し、最新main8e1aacf3から隔離準備。PR246 head548a60ec全7CI、通常main8e1aacf3全6CI/4workflow成功、Linux3135/3133pass/0fail/2skip、18blob/tree一致を[別current記録](docs/evidence/development-execution/pro-work-entry-main-current.json)へ。作者captureは不変、393task/14gate/95coreと616HOLD・原本HEAD/indexを維持。EVE-13作者は固定packet ca85d9b0・103試験/type/lintを完了、中央もsource4/元receipt・保護12のmain一致と既存103試験を確認。独立Astra依頼は初回に宛先指定の人間認可不足で自動承認審査が拒否したが、その後の具体2宛先への人間許可を元userMessageで直接確認し、同じ正規tool送信が成功。拒否履歴を保持し、作者終了後に別Billing担当のAstra/high限定検収を依頼済み。独立R1検収はCHANGES_REQUESTED/P2 1。owner単一slotの制御並行保存で両save成功/片方の未確認ID喪失を再現し、単一context強制がない通常入口への採用前に保全修正を要求。これは実browser再現や金融権限迂回の主張ではない。Eve作者宛て差戻し送信も宛先外として審査が拒否したため、その送信は再試行しない。Rootが自分の制御probeを根拠に別ローカルsubsetでR2を固定。独立再検収はR1保存競合の解消を確認したが、lock待機後の本人再確認とhandoff期限再検査のP2 2件でCHANGES_REQUESTED。関連107成功/追加待機probe8中4失敗を区別し、R2 source6とreview b2712d6aを不変保存。Rootが別ローカルR3で新しい本人GETとfresh origin/expiry・最後の同期期限checkを修正中。拒否先への転送や新しい宛先開示はなく、追加Eve送信許可を実行待ちgateにしない。source未採用・新main統合なし。次は固定R3→許可済Billing/Astraで作者と別の再検収→Sol統合→許可済Pro/Solの最終metadata検収→Git/同headCI/通常main同SHA CI。拒否を代行送信/別経路で迂回しない。Root返事待ちを追加gateにせず、実機/追加推論/契約/実資金/公開は別hold。

## Proから既存私有仕事への入口（2026-10-27 / G04・ROCK）

着手: PR245通常main9cb9d148・同SHA全6CI/4workflow成功、Linux3132/3130pass/0fail/2skip、22blob/tree一致を[別current記録](docs/evidence/development-execution/smith-session-main-current.json)へ保存。新Pro固定source2/receiptは独立PASS_SCOPED、関連109/旧入口欠落3試験失敗（独立不具合3件ではない）、Root44・author CUA desktop画像を区別。判断: 既存WorkJob/owner/revision/別保存同意/同ID復旧/停止/成果取得10sourceを不変にし、ProはTool IDのみの固定正式linkを案内。検証完了: union109/109・type/lint/designとproject:update成功。host全verify exit0（Node3135/3132pass/0fail/3skip、build/site/API1678/CSV385含む）、固定policy scanner payload0/canary1。READMEの旧Smith準備中はPR245main反映済みへ訂正。次: 固定18の最終Root差分検収、限定Git/別PR/headCI/通常mainと同SHA CI。393task/14gate/95whole0、原本HEAD/index・616HOLD保持、本番仕事/実金融/実機/公開配備なし。[採用記録](docs/evidence/development-execution/pro-work-entry-main-adoption.json)。

## Smith保存会話の参照保持を最新mainへ（2026-10-27 / G04・ROCK）

着手: PR244通常main9f2bf146・同SHA全6CI/4workflow成功、Linux3125/3123pass/0fail/2skip、26blob/tree一致を保存。元capture receiptを保持し[別current記録](docs/evidence/development-execution/esim-webops-main-current.json)へ。次のSmith固定UUID source2/receiptは独立PASS_SCOPED、関連34/独立2/旧2反例、Root26を区別。判断: validator/schema/owner/TTL/承認を維持し、共有metadataはこの専用treeだけで同期。tool:形式のR1はhyphen先頭ID受理の独立P2を受け初回RootPASSを撤回。R2は旧generic/UUID実効文法を維持しexact catalogだけ追加、独立540比較/29関連・旧3反例で再検収PASS。別sourcehash/元receipt/撤回履歴を保持してsource4の有限unionへ採用。検証完了: 結合48/48、type/lint/design/project:update、独立hook4と540形式/revision比較が成功（件数は重複加算なし）。host全verify exit0（Node3132/3129pass/0fail/3skip、build/API1678/CSV385含む）、固定policy scanner payload0/canary1。責任表記はROCK第一者store/binderの現行有効性強制、EXTERNALのProvider/接続事実へ限定。次: 最終22のRoot差分検収、別PR/headCI/通常mainと同SHA CI。393task/14gate/95whole0、原本HEAD/index・616HOLD、公開配備なし。[採用記録](docs/evidence/development-execution/smith-session-main-adoption.json)。

## eSIM初回利用開始と旧install導線の有限統合（2026-10-27 / G04・ROCK）

着手: GitHub最新main927ac79aと準備branch一致を読戻し。eSIM初回activation authority fence固定3source/tests・receiptは独立PASS_SCOPED/必須0、関連123/追加込み18成功/旧5leaf反例。WebOps固定4は旧install exactrootを既存connectへ案内し、独立11成功と限定framework/browser証拠。判断: eSIMの既存helper/owner-revision CAS/API/schema/価格を保持し、WebOps旧base全文書をコピーせず最新mainへ追補。393task/14gate/固定95whole0・Root HEAD/index・616HOLD保持。検証完了: 統合134/134・type/lint/designとproject:update成功、host全verify exit0（Node3125/3122pass/0fail/3skip、build/API1678/CSV385含む）。固定policy gitleaks8.30.1はpayload0/canary1、既存ignore/inline allowを使わず検出を確認。次: 固定26の結果metadata最終delta検収、限定Git/同headCI/通常mainと同SHA CI。公開source同一性UNKNOWN・公開修正未配備、本番eSIM/金融/実機/whole unitは未受入。[採用記録](docs/evidence/development-execution/esim-webops-main-adoption.json)。

現行Git受入の訂正: PR242のhead全8CIと初回main e7のverify失敗を履歴保持。PR243 head32637100全7CIを通常main927ac79aへ統合、同SHA全6CI・4workflow成功、Linux3116/3114pass/0fail/2skip、22blob/tree一致を確認済み。作者capture receiptは書換えず[別current記録](docs/evidence/development-execution/pr242-243-main-current.json)を現行根拠にする。

## Pro原本unknown復旧とEve試験harnessのforward-fix（2026-10-27 / G04）

PR242はheadc84ea37c/全8CI成功をmain e7d458f2へ通常統合し、41blob/tree一致を確認。初回mainは6CI成功/verify1失敗を保持。新Eve UI試験はhandoffのWebCrypto検証Promiseが既存harness追跡外でreview前のactiveを読んだ。制御barrierで旧flushの早期完了を再現し、既存trackへ実Promiseを登録するtest-only修正で関連61成功。assertion/sleep/timeout/runtimeは変更しない。別のPro固定2はunknown時のfile置換拒否/quarantine cancelでowner/ID保持、独立38+追加2/旧4反例・Root31で限定PASS。Rootのfixture差分独立検収61/61を確認し、新固定3sourceのhost全verifyはexit0（Node3116/3113pass/0fail/3skip、build/API1678/CSV385含む）。結果metadataの最終検収→限定Git→同headCI→通常main/同SHA CIへ。ProでEve失敗を隠さず、旧head/main/失敗ログを別記録。393task/14gate/固定95whole0、原本HEAD/index/616HOLD、実Provider/実機/一般公開のgateを保持。証拠 docs/evidence/development-execution/pro-recovery-eve-drain-main-adoption.json。

## Billing・Eve・OS復旧・Game診断の有限統合（2026-10-27 / G04・ROCK）

最新main7ceef8cfから固定候補を採用準備。Billing契約binding3sourceは独立74+3成功/旧5反例、OSは初回保存前の入力hash設定だけ、Gameはfile/親directory衝突拒否。Eve最終6はunknown404と同意切替後の自然失効回帰を修正し、中央独立9・関連73成功/旧3失敗反例、Rootの自然期限実画面合格を限定確認。共通schema/価格/既存workflow/Wallet・393task/14gate/固定95whole0は保持。共有設計/index/進捗を同期し、source13不変のhost全verifyはexit0（Node3112/3109pass/0fail/3skip、build/API/CSV含む）。結果だけのmetadataを追記した最終候補について、固定scanner/独立metadata検収→限定Git保存→最終head Linux CI→通常main/同SHA CIへ進む。Git保存/main/CIは現在未完了。実機/Provider/実課金/一般公開・616bulkは保留。証拠 docs/evidence/development-execution/billing-eve-os-game-main-adoption.json。

## PR225 zod最終検収のGit保存・現行進捗同期（SYS15・G04 / ROCK）

PR225は検証済みHEAD `dcf86f99ab8712d539c3ae9f8f4702a8edf3661e`（CodeQL集約を含む全8CI成功）をmain `f4ed492c9c4ae06c4c94c5c36d2f692315cae622`へ通常統合済み。同一mergeSHAの全9CI（CodeQL両言語・Dependabot2件を含む）成功、head/merge tree一致、両Linux全verify2991試験/2989pass/0fail/2skipを確認。zod警告42/54はdismissせずfixed、限定PASS/mustFix0。[最終検収](docs/evidence/development-execution/zod-security-constraint-review.json)を保存し、原本hash・CIリンク・ログhashを保持して個人端末の絶対pathだけを除いた。

履歴: main ee9b8801起点でshadcn4.22.1とroot/Mini zod^4.6.6/lock4.6.7を採用。対象34/34、旧依存3失敗反例、Cloudflare14/14、両監査zod0。初回host全verify2991/2986pass/2fail/3skipは保持し、inventory期待値修正・既存localhost timeout再試験89/89の後、host全verify再実行2991/2988pass/0fail/3skipが成功。旧HEADのPython時間上限超過も履歴保持、検査条件は変更なし。元receiptの記録時pendingを上書きせず、現在の結果は上記検収へ分離した。

今回の保存は最新main7edbb9be起点の文書・進捗のみ。依存/実装/テストを変えず、後続PR218のSRI試験と既存mainを保全する。PR225実装のGit保存・main統合は完了、本metadata新HEADと統合SHAのCIは今回別確認する。他依存の監査指摘・実機/P02/全OS/本番/一般公開は別gate。実機操作・追加推論・公開配備0。

## PR207統合読戻しとWALLET-02 process強制終了復旧の限定main統合（2026-10-25）

PR207は検収済みbfb3e1bfを通常mergeしたmain0d726717、同一mergeSHA6CI成功を直接読戻し。元receiptの記録時pendingは保存し、進捗/overlay/引継ぎを訂正した。次の1項目は既存WALLET-02のprocess-kill残件。主担当03/ROCK/O5（WLT01/WLT02/WLT04/B03）、Git調整G04。最新main専用treeでTestD1を共用fixtureへ移し、子processを13停止点でSIGKILL、終了確認後に新DB接続でrollback/commit耐久性・同receipt/指示一意・cap再消費なし・defaultToC holdを検査する。対象36pass（新13+既存23）、独立検収PASS/mustFix0・計測13/破壊反例7を確認。全verify成功（root2911中2908pass/3skip、仕事API1678/CSV385、重複加算なし）。初回はhost標準OpenSSL版不一致で失敗し、既設OpenSSL3指定で回復。metadata検収の未根拠headCI7記載を削除しmerge同SHA6の根拠を保持。metadata独立r2 PASS/mustFix0。現在: PR208の検収済みheadc3c0e17d/exact20pathを通常main2854d069へ統合。headtree/main tree一致、同mergeSHA全6CIとLinux実verify2911/2909pass/2skip/0failを確認。文書保存・作業branch GitHub保存・main統合を完了、公開配備は未実施。元receiptのcapture-time pendingと初回失敗は保持し、現在のproject/status/overlay/handoffはこの別metadata同期で訂正する。次は既存Pixel/eSIM候補を新mainへ通常照合し、各独立gateから再開。実Worker/鍵/料金/migrationは不変、実D1/実収益/認証端末/停電/wholeWalletは未受入。公開・配備・616一括公開は保留。証拠 docs/evidence/development-execution/wallet-process-recovery.json。

## undici依存制約の修正（SYS15・G04 / ROCK）

最新main2a9828b2のeSIM/Eve受入済み変更を通常同期。undici/package/test bytesは不変、先行Mac全verifyと同期後の新HEAD全CIは別証拠とする。

PR209統合8f646ff3のDependabot失敗を受けて着手。main41ee45d7を基点に、root overrideの7.29.1固定を同majorの修正版^7.30.1へ更新し、root全verify成功（2940件/2937pass/0fail/3Macskip）後、同じundiciのMini側3alertも確認。Mini override^8.12.2/lock8.12.3を追加し、両lockfileそれぞれundici1件のみ更新。計7consumerと既存TLS/依存回帰29件成功、root旧制約の1件失敗反例を保持。root npm監査undici0件・他依存10件を区別し、最終全verifyはexit0（root2942/2939pass/0fail/3Macskip、build/API含む）。Mini監査もundici0・他2件。旧SHAの失敗を保持し、新HEADとmain統合SHAのCodeQL/全CIは別々に確認する。実機操作・追加推論・公開配備なし。


## Pro原本exportから既存私有archiveへの入口候補（2026-10-25 / G04）

着手: 最新mainb1b0/PR206を基点にPRO-01-ARCHIVE-ENTRYの検収済み3source/testを同hash採用。主担当10/source05、既存B05/WEB13/G04。判断: 元receipt3cebはportableで同bytes保持、Root独立review6883・localChrome UI94c0は要約/hashだけ採用。既存13archive/storeと183保護pathを保持し、自動転送・権限・schema/鍵・課金を追加しない。検証済み履歴: 関連40・独立5群、Chrome1512/390 overflow0/preview/cancel。初回preview startup失敗は維持し、成功へ換算しない。次: 統合対象試験/project:update/design:check/scannerとcanary、DraftPR exactpayload読戻し、最終head Linux actualverify/CI、独立metadata検収。merge/公開先実click/認証済server保存/native/配備/wholePRO01は未受入。11lane/95unit/42成果の有限要約をmain入口へ接続し、Root旧RQ49/165taskとmainRQ50/393taskを区別。Rootregistry非操作、残616公開保留。根拠 docs/evidence/development-execution/pro-archive-entry-main-adoption.json。

## Wallet legacy ledger DB recovery test-onlyのmain候補（2026-10-24 / G04）

着手: Game205通常merge main0866・同SHA6CI成功をclean基点に、旧434fとtestbase不変の検収済みtests/billing-worker.test.mjs1hashを無変更採用。主担当Git10/source03、WALLET-02/WLT01/WLT02/WLT04/B03/GX00。元receipt5347と新portableは別hash。判断: 元memorydefault/3test/署名helper、Worker/domain/鍵/migration/価格/888/defaultToCholdを維持し、localSQLiteのfault/reopen試験だけを追加。検証完了: 統合23pass0fail0skip/対象lint/通常type成功。独立6群・rollback11位置/ack喪失/同receiptreplay/400+488と明示直列2handle、fixture全DB/WAL/SHM cleanupを記録。実processkill/Cloudflare同時処理/2認証端末/実Provider/availablecash/本番金融・wholeWALLETは未受入。次: project/design/scanner、Draft PR最終同headLinux実npmverify/全CIと独立metadata検収。local全体verify未実行。Root registryは書込/restoreせず、承認済archive8d2維持・残616公開保留。[証拠](docs/evidence/development-execution/wallet-ledger-db-recovery-main-adoption.json)。

## Game creator host fixture exact2のmain候補（2026-10-24 / G04）

現行Git受入: PR230/head4046c712全7CI、通常merge main53d991b3全6CIとLinux3010/3008pass/0fail/2skip成功。旧capture pending/浅いcheckout失敗を保持し、固定ee9 object fetch/hash検証後のsource4一致を別記録。非金融draft/createのみ、GX/wholeGAME/公開は未受入。[現行証拠](docs/evidence/development-execution/game-work-draft-main-current.json)。

着手: Eve204通常merge main434f・同SHA6CI成功をclean基点に、旧7188で独立受入済みscript/test2hashを無変更採用。主担当Git10/source08、GAME-01/GM01/AI06・DX01文脈。元receipt9936と新portableは別hash、engine/save形式と再利用5・既存保全sourceを固定。判断: staticdiagnostic unverified/nullを維持し、synthetic ownerのhostProofだけを別証拠へ。検証完了: 統合40pass0fail0skip、対象lint/構文2/通常type成功。独立10probe/ownedtmp28cleanup、EPERM/inodeswap/symlinkFIFO/oversize/concurrency/midwritekill/旧save保持/partial非自動採用を限定記録。判断更新: 局所scannerで既存GameAPI request-key例を1件検出し、非credentialの説明用<request-key>へ明示。schema/金融条件/source2/policyは不変、初回reportはGit外保持。次: project/design/scanner、Draft PRの最終同headLinux実npmverify/全CIと独立metadata検収。local全体verify未実行、fresh作者SDK/本人保存/WorkJob/実engine/金融/実機/公開・wholeGAMEは未受入。Walletは最新mainのclean test-only treeを準備しただけでsource未編集。[証拠](docs/evidence/development-execution/game-creator-fixture-main-adoption.json)。

## Eve saved-source estimate-only r2のmain採用準備（2026-10-24 / G04）

着手: Smith203通常merge main7188c879・同SHA6CI成功のclean基点、source候補は旧2beaから通常FFしsource10+receipt11hash不変/.wrangler非操作。主担当Git10/source05、EVE-02限定overlay。判断: canonical saved owner/revision2資料に既存signed-rate ceilingだけを結合し、pricinggatefalse/quote/reserve/approve/send0を保持。旧expiry P2/13中3失敗をr2 finalclock/parser/render timerで修正、fixture/VM/EPERM再試験を別履歴として保存。検証完了: 統合70pass0fail0skip/通常type/productlint成功。Root実UIは57/43byte原本hash/BOM/CRLF・同job rev1復元・consentreset/autofetch0・estimate503/quoteHTTP0・4幅overflow0の限定確認で、数値/expiry browser成功ではない。判断更新: Root追加combinedUI d3b7（旧5286別保持）でmain7188/同10hashのrestore/consent reset/nav/focus/5幅overflow0/HTTP0を限定確認しcommit保留解除。数値/expiry未受入を維持。CI判断更新: 初回head278の実Linuxverify2873pass0fail2skip、CodeQL test:103の不統一anchorだけ不合格。Root明示例外でpathname比較へtest1だけ修正。旧test2eb/新2f638・限定diff/失敗checkを保持、runtime5/他test4不変、UI8+endpoint10成功。Root UIはruntime5不変で有効だが現10全hash一致を主張しない。次: design/project/scanner後、新最終headLinux実npmverify/CodeQL全CIと独立mechanical/metadata検収。local全体verify未実行、paid/fullEVE/実機/公開なし。[証拠](docs/evidence/development-execution/eve-source-estimate-main-adoption.json)。

## Smith mobile bottom navigation attempt3のmain候補（2026-10-24 / G04）

着手: Billing202通常merge main2bea21b1・同SHA6CI成功をclean基点に独立受入8hashを無変更採用。主担当Git10/source05、既存HOME01/WEB04/SKY21/OS10・SMITH-01。原本archive5の53e6ed46とは別provenance。判断: attempt1実hash不一致とattempt2 mobileAgent導線消失を保持し、attempt3のcontrolled hashとMore2静的link例外を採用。17領域保護、既存owner/CAS/auth/Agent/料金/domainを維持。検証完了: 統合53対象試験53pass0fail0skip、通常typecheck/productlint成功。Root同8hashの実local UI17証拠はGit外で、portable最小summaryとhashのみ保存。次: project/design/scanner、Draft PR最終同headLinux実npmverify/allCIと独立metadata検収。local全体verify未実行、main未merge・公開なし。未完: 実keyboard/非zero safearea/200%zoom/認証composer/runningjob/twoowner/native/prod、wholeSMITHfalse。[実装/hash/試験](docs/evidence/development-execution/smith-bottom-navigation-main-adoption.json)。

## Billing current service authority exact4のmain候補（2026-10-24 / G04）

eSIM201通常merge main468d・同SHA6CI成功を新clean基点に、旧99abと4base不変の受入hashを無変更採用。trusted runtimeEnv required/previewをdispatch await前に捕捉し、required時の同owner active scope/committime expiryを最終INSERTへ結合。53tests/type/productlint成功。旧base2 mocksend1→new0/独立11を原本hashで保持し、DBUNCONFIRMED/unknownhold/noresend/lateusageonce/旧recurring例外を区別。元receipt7a52/portable a2cfを別hashにし、新metadata独立検収へ。価格/schema/migration/設定/commoncontract/issuer epoch・accountmonth/実Provider/課金/公開の完成へ拡張しない。eSIM3/Mini6/history18/固定95whole0/393task14gate/RootHEADindex/旧197保持。次はJSON/design/fixedscanner0/canary→別draftPR最終同headCI実npmverify→独立metadata採用検収。Web5source保全は別branchで後続、mainへ混ぜない。根拠 docs/evidence/development-execution/billing-service-main-adoption.json。

## eSIM owner-response exact3のmain採用候補（2026-10-24 / G04）

Mini200通常merge main99ab・同SHA6CI成功を新clean基点に、旧708と3base不変の受入hashを無変更採用。public GET/POST本文はcurrent owner/row/revision/raw bytesの最終SQLで投影し、非同期grant後の旧本文fallbackを閉じる。read/execute/既知commit ack/unknownを分離。正規type/lint、145pass/0fail/1D1skip＋別localD1 1pass。独立12probe/78回帰、旧7distinct負例（8Node失敗）と元receipt4035/portable579fを重複・同hash扱いしない。独立ACL/expiry/genericattachment/issuer epoch・本番resolver/DB/課金/実機/公開未受入。Mini6/11/history18/Pro6・393task14gate/固定95whole0維持。canonical設計/index/README/status/95overlay同期、RootHEAD/index/旧197保持。次はfixedscanner/canary→別draftPRの同exact finalhead CIで実npmverify→独立metadata採用検収。広域localverifyは重ねず、CI未完を成功へ換算しない。Billingは別tree準備のみ。根拠 docs/evidence/development-execution/esim-owner-response-main-adoption.json。

## MINI-02 cone-aware source5＋sanitized receipt統合候補（2026-10-24 / G04）

固定候補全verify成功（4477入力不変、108秒、Node2810/2808pass/0fail/2skip）。結果記録だけの最終3metadata差分と同headCI/独立metadata検収を分け、source5＋公開receipt bytesは不変。

Pro199通常merge main708・同SHA6CI成功を基点に、独立PASS数学/code/test/doc5hashを不変採用。6番目receiptだけ一時path4参照を論理IDへ置換、原本8116をRoot Git外backup保持・公開5bcbと分ける。新receiptを旧review一致と呼ばず採用metadata検収へ。旧ccec/最新6base同一、許可3既存進化と旧11/historical18、Pro archive6を保持。関連70pass・product/source lint・正規typecheck/設計成功、分類/95whole0/393task14gate維持。新Tool/権限/物理出力/課金なし。実光学/低眩しさ/眼安全/連続全域/実viewer/独立停止/製造/全Mini未受入。次はlint/type/JSON/design/fixedscanner→固定全verify1→draftPR同headCI→別metadata採用検収。RootHEAD/index/旧197branch保持、eSIMは別clean tree準備のみ。根拠 docs/evidence/development-execution/mini-02-cone-aware-main-adoption.json。

## Pro PR199 test登録のlint互換修正（2026-10-24）

旧dd10の実Linux npmverifyは型検査後lint:productのno-floating-promises25件で失敗。local sandbox listen EPERMとは別に保持。対象はPro6内tests/pro-account-import.test.mjsのみ、全25登録へvoidを明示し+125bytes、除去で原本完全復元。assertion/テスト本体/名前・runtime5/保護76/権限/保存/暗号/schema/policy/95分類は不変。旧test6b3c→新8a8250、旧6hash限定レビューを新bytesへ転用しない。focused69pass・lint:product/typecheck成功、canonical設計/目次/statusを同期し、新headCIと別独立再検収前にmergeしない。

## PRO-01原本保管exact6のmain統合候補（2026-10-24 / G04）

固定全verifyは初期段階のsandbox localhost listen EPERMで停止（4472入力不変、7秒）。失敗を保持し、ローカル反復無し、新head CI実npmverifyを最終gateとする。69試験と正規前処理typecheckの成功とは区別する。

PR198通常merge mainccec同SHA6CI成功/旧PR197close・旧branch保存を確認し、新clean基点に、旧1a9と双方absentのPro新6を受入hash無変更採用。対象69pass、正規main前処理付きtypecheck成功。workerの生成module欠落3TS2307/新diag0は過去の失敗として保持、実原稿copy/手書stub無し。旧P1/P2→r2限定PASS、歴史first56/current69訂正は原本44eb/旧74a2/b0a9/reviewhashで保持。既存暗号化履歴・CAS・owner/sameorigin/同意・UNKNOWN再読戻しを再利用し、新schema/暗号engine/鍵/job/model/Toolなし。実account/browser/native/全移行未受入。設計/index/README/status/95overlay同期、393task/14gate/固定95/whole0保持。次は現行fixedscanner/canary→固定全verify1回→別draftPR/同headCI→別metadata採用検収。旧Root/Pro WIP/旧a2履歴を混ぜずRootHEAD/index/journal保持。根拠 docs/evidence/development-execution/pro-account-import-main-adoption.json。

## EVE-02 attempt2 exact6のmain統合候補（2026-10-24 / G04）

PR197 metadata表記delta:4つのpath名digestをtyped sha256 recordへ変更、61path/digestと6source不変。同Gitleaks8.30.1固定policyで旧4検出→現行0、疑似API-key1検出、既存policy10pass。旧c21 secrets CI失敗と全履歴scan4件は保持。標準exact fingerprintは実証済みだが固定wrapperがempty-ignore強制で設定だけでは利用不可。control読込interface/厳密4設定/負例試験と別workflow pin更新の設計案だけを残し、手製bypassやcontrolpolicyPRは作成しない。最終newhead CI/format再検収/履歴gateは未完了、ローカル全verify反復なし。

固定a2b2eefd候補の全verify成功（4463入力不変、Node2769/2767pass/0fail/2skip、104秒）。draft PR197保存。結果記録のみの最終commitのCIと別metadata採用検収は未完了、mergeなし。

最新main1a9d9eeeとsource7beの6base不変、受入6hashを無変更採用し関連71pass。無料2文章＋goal準備jobだけを既存composition/owner/revision/同意/同job照合へ接続。旧2P2/control/async overwriteは独立r2で閉鎖、原本hash/旧失敗履歴を保持。生成未対応、Provider/課金/新Tool/schema・browser実受入・EVE02全体は未受入。設計/目次/README/95overlayを同期、393task/14gate/固定95分類/whole0保持。PR196は独立Game-r2/Pro metadata/matchhead通常merge main1a9、PR7CIとmain同SHA6CI成功を確認。Root巨大WIP/未検収Proを混ぜずRootHEAD/index/journal保持。次は固定全verify1回・draftPR同headCI・別metadata採用検収。根拠 docs/evidence/development-execution/eve-text-job-main-adoption.json。

## Billing final-send exact4のmain採用候補（2026-10-24 / G04）

互換deltaの局所40pass、固定05312751候補の全verify成功（4458入力不変、Node2749/2747pass/0fail/2skip）。draft PR196へ保存。最終metadata commitのCIと新4hash独立再検収は未完了、mergeなし。

PR195通常merge main7be3d6aaで旧dab同4基底不変を確認、原本Game/Astra限定pass4hashを保持し、既存recurring例外契約の最小修正を同4pathへ追加。局所40pass、新hash独立再検収待ち、独立23uniqueと旧2反例検出は原本hashで限定継承。parentstop/price revoke before finalclaimはfetch0、unknown/claim応答喪失はhold保持/再送0。新migration/価格/Walletalgebra/888c変更なし、common authority/issuer epoch未接続。本番D1/実課金/全OS/一般公開未受入。GIT08は文書/branch/main保存完了・配備なしを95overlayへ別記録。次は設計同期→固定全verify1回（同headCI可）→別PR/CI→独立metadata採用review。原本/秘密/path/logをコピーせず、RootHEAD/index/journal保持。根拠 docs/evidence/development-execution/billing-final-send-main-adoption.json。

## GIT08: 95再開台帳のmetadata-only同期候補（2026-10-24）

固定9a inventory/Pro独立PASSを原本hashで保持し、95id/title順序・188blob/hash・main393task/RQ50/14phasegateを照合。分類49/16/15/14/1、whole accepted0の履歴は書換えず、最新dabのPR194 eSIM限定採用を別overlayへ。Root80not_startedを現未実装数にせず、lean95台帳/handoff/要求model policyを作成。実model/tokens/cost不明はnull、dispatchなし。保全49+OS16≠Root全量Git保存を明示。Billing finalclaim実装中、eSIM独立ACL/epoch/genericattachment未受入、Eve02 bounded textが次。巨大原本/全履歴/私的path/rawpromptなし。次はJSON/project/designcheck→metadata別PR/同headCI npmrunverify→独立採用review。source/runtime/test変更なし、ローカル全verify反復を省略してCIを別gateにする。根拠 docs/evidence/development-execution/unit-restart-ledger-sync.json。

## eSIM runtime exact6のmain採用候補（2026-10-24 / G04）

最新main9a617fabで同6基底がd150と不変と確認、Smith/Astra r2 PASS_SCOPED/mustFix0の6本文をhash維持で採用。read-to-commit batch fence、listing否定/矛盾とpackage最新世代/tie/expiry優先、owner-session保持・既存予約/late CPUを維持。局所122pass/型/全体lint成功。独立17probe/44passと実local D1拒否rollback/3retry証拠を限定継承。汎用attachment/独立保存ACL期限/本番D1/実課金は未受入。PR193 final Game/EveとeSIM r2原本hashを秘密/path/logなし要約で保存、PR193最終検証をsame83a Linux CI successへ同期しhost成功としない。次: design/metadata→fixed fullverify1回（同headLinuxCIも可）→別PR/CI→独立採用metadata検収。Root HEAD/index/journal非操作。根拠 docs/evidence/development-execution/esim-runtime-main-adoption.json、docs/evidence/development-execution/reviewed-runtime-main-integration.json。

## PR193 owner直接openへ最終整理（2026-10-24 / G04・OS10）

506a54c6でもCodeQLがEEXIST判定後openをHighとして指摘。既存owner直接NOFOLLOW/NONBLOCK open→ENOENT時のみatomic wx作成へ変更し、競合作成は再openせず不明へ。同一FD fstat/37byte/owner名inode確認は維持、10filesystem/uidケースと既存回帰は局所34中33pass/既存skip1。旧candidateの全verify2試行は入力変更0だが未変更activation1timeout、次AMC2 spawnSync ETIMEDOUTで失敗。対象は各単独成功（AMC2は0.73秒）、原因未確定・CPU/メモリ未測定。期限/fixtureを緩和せず同候補反復停止。次は新head保存/CIとRoot割当Game最終hash再検収を先行し、必要最終fullverifyは並行review/tests終了後の別gate。CodeQL抑制/mergeなし。根拠 docs/evidence/development-execution/pixel-owner-toctou-fix.json。

## PR193 CodeQL owner競合の限定修正（2026-10-24 / G04・OS10）

旧head fb70cfb5のCodeQL High1を保持し、正式割当でserver owner readを同一NOFOLLOW/NONBLOCK fd→fstat→最大37byteへ変更。publish直前のowner dev/inode再照合を追加。親診断回帰にowner差替え/増大/FIFO/非regular/権限/uid等9caseを追加し、旧sourceは同回帰で失敗、新sourceは成功。局所34中33pass/既存skip1、型/全体lint成功。worker/manager/URL/model/prepare/build/CI/Miniを変更しない。影響するOS/Tool契約・index/進捗・候補hashを同期。次: 新固定全verify→新commit/同head CI→Root割当の独立delta再検収。CodeQL抑制/mergeなし。根拠 docs/evidence/development-execution/pixel-owner-toctou-fix.json。

## Pixel main診断移植とMini r2の固定候補準備（2026-10-24 / G04・OS10）

6runtime/test＋Python CI stepをmain d15096b8へ最小port。worker c6a4cb0d不変、serverはexecuteのみ選択し旧実機packageと区別。manager/URL/model/prepare/build/service固定。Python27中26pass/比較skip1、parent4中3pass/Linux skip1、Node33中32pass/platform skip1、bridge4pass。初回450ms host試験反例からcallback event必須/2秒期限へ試験だけ調整。追加承認Mini r2新4hash固定/旧12不変、56試験/lint成功。次: design/進捗同期→fixed full verify1回→PR/CI→別担当独立review。runtime/統合metadata未検収、新Linux/Pixel/背景/P02全体/full OS/実光学未受入、一般公開保留。根拠 docs/evidence/development-execution/pixel-main-diagnostics-adoption.json、docs/evidence/development-execution/mini-02-finite-cone-review-summary.json。

## Pixel限定実機証拠を原本hash付き要約へ（2026-10-24 / G04）

原本8b8ed78d…/独立Eve review136e79ef…を照合し、絶対path/原文/privateRealm/識別子/18添付を含めない要約2fileを作成。Linux4pass/skip0、同一attempt2 sourceで今回1job成功/累計2、worker8569ms/childCPU12.635192s/OOMdelta0、旧33保持/total34/2models/10agents、PC+Pixel公式export770bytes同SHA、process0/sync停止を範囲付き記録。PC UI reload画面証拠不足、背景/P02全体/全OS/性能一般化未受入。runtimeコード変更なし、source16保存97044695とmain7既存9未追加auditを維持。統合要約の検収/Git保存/CIは別gate。根拠: docs/evidence/development-execution/pixel-worker-diagnostics-physical-summary.json、docs/evidence/development-execution/pixel-worker-diagnostics-physical-review-summary.json。

## MINI-02有限joint-allocation4pathをmain起点へ採用（2026-10-24 / G04）

main7e36c839起点で4path＋独立Pro reviewをbyte一致採用、旧8hash不変。13試験と独立432条件98成立/334不成立の限定pass/指摘0、4要求/domainを保持。最大128有限demand、排他pose、共有sourceと未探索/unsupportedを分離し、可視/低眩しさ/全域/実viewer/停止/製造/権限の全flagfalse。固定4434入力不変で全verify exit0、Node2662=2660pass/既存platform2skip、asset欠損0。PR/同SHA CI/統合検収は後続、OS WIP/価格/公開変更なし。根拠: docs/evidence/development-execution/mini-02-joint-main-adoption.json。

## MINI-02の検収済み有限studyをmain起点へ採用（2026-10-24 / G04）

main bbefa875起点で5path＋reviewをbyte一致採用、Mini3hash/4要求/domainを保持。対象20（新9＋既存11）・lint/syntax成功。7候補35,721×18の独立再現pass/指摘0、unsupported2は未評価。光学/低眩しさ/人体/PCB/製造/同時viewerは未受入。固定4428入力不変で全verify exit0、Node2649=2647pass/既存platform2skip、asset欠損0。別PR/CIへ進む。OS診断WIP/料金/公開変更なし。根拠: docs/evidence/development-execution/mini-02-main-adoption.json。

## PR187統合後のclient/Game subset採用とsource保全（2026-10-24 / G04）

main e4e64377起点でMini3（局所profile/固定幾何依存/試験）、Pro4のprivate export subset、Web3のaccessibility subset、main互換Smith saved-reference試験、Game2のstatic intakeを採用。Web releaseとbackup世代fence、main Game保護・Pro商品/interest・Smith /chat、AMC/material/compose/grid/RQ50を保持。対象69+Pro7、typecheck/lint成功。固定4420入力不変で全verify exit0、Node2640=2638pass/既存platform2skip、asset欠損0。Pro localhost preview/同意なしexport拒否/cancelを確認。source不変のMini追加独立検収記録（11既存＋173負例の実行報告）を追補。別PR/同SHA CI/統合差分検収は次gate。

Eve13とRoot引継ぎ49file計3,691,158bytesを別source branch codex/source-preservation-20261024 / f495bfc8721d40ab06275c1f50c9f9a98157d2baへ通常push、remote一致・全blob byte読戻し一致。秘密/原稿/52外部artifact/active OS/cache-onlyコードを除外、Root HEAD/indexを使わず保存。23chat/42成果/180項目/10算法/95unitをmainbaseline2.08対Root1.127の由来付き引継ぎへ整理。source保存はmain機能採用・runtime/physical/公開成功と別。根拠: docs/evidence/development-execution/client-game-adoption.json、data/development-source-handoff.json。

## 受入済みBilling/eSIM/Walletのpure subsetをmain起点で採用（2026-10-24 / G04・BIL02）

PR186通常merge後のmain23ad170cから新branchへ分離。受入済み8pathを意味比較し、既存transport/料金/redirect設定を保持、月次statementはpure bindingのみ採用しDB保存/集計と未移植依存を除外。113対象試験、typecheck、局所lint成功。main2.08/RQ50とRoot1.127/RQ49、140USD案とLinux16USD既存termsの版/由来を保持し、新課金・schema追加・公開なし。固定4404入力不変で全verify exit0、Node2612=2610pass/既存platform2skip、asset欠損0、仕事API1678assertions成功。PR/同一SHA CI/統合差分検収は次gate。Broker atomic CASやissuer/provider、本番は未受入。次はMini/Pro/Web→Smith test→Eve保存/Game検収を各小batchとし、全union未完を一律Git保存停止にしない。根拠: docs/evidence/development-execution/service-contract-adoption.json。

## PR186 backup fd race correction (2026-10-24 / G04)

CodeQL check120816951394 and independent review found a check/close/reopen backup-path race in f5a7de0a. Replace it with locked snapshot bytes written/fsynced/read back on one exclusive no-follow fd, private owner/ancestry checks, source inode checks and commit-authorizer filesystem verification.28 focused tests and full lint pass; fixed final full verify/new-head CodeQL/independent review are pending. This is overall implementation attempt3 and first correction attempt for distinct root cause GIT04-CP-R1; earlier counts/reviews remain. No Root parallel work or full union acceptance. Evidence: docs/evidence/development-execution/git-04-backup-fd-correction.json.

## Offline alias helper Git checkpoint preparation (2026-10-24 / G04)

Independent Astra review accepts only the five-file offline helper candidate `b61d05cbc84ee43790bbcbf42dd7e46c3215825a29574e16aae9ac8ac4a0091f`. Prepare a small PR on the main-based checkout; Root business changes are excluded. Align the verify job with tested Node26.12.1, without skipping tests or changing runtime permissions. Full union8 migrations/13 guards/Source base/runtime port remains unaccepted. Full verify/CI/main readback pending for this checkpoint.

## GIT-04 attempt2 security correction (2026-10-24 / G04・DB01)

Independent R1/R2/R3 findings addressed: zero source-SQL execution in planning, fully reviewed reference profiles, defensive/query-only/authorizer memory snapshots, exact metadata schema with metadata-only write authorization, precommit protected-domain/history/audit checks, and complete replay provenance/schema validation.20 focused+13 existing D1 tests pass. Attempt1 preserved; second Astra review pending. Full union8 migrations/13 guard differences/Source base/runtime port remains unaccepted; no remote DB, publish or main merge. Evidence: docs/evidence/development-execution/git-04.json.

## GIT-04 local migration aliases (2026-10-24 / G04・DB01)

Explicit local SQLite alias reconciliation is implemented; 11 exact Root/main aliases, atomic backup/history/audit,14 focused tests and13 existing D1 tests pass. Full Root/main schema/guard union, complete Eve Source base and runtime consumer port remain unaccepted. No remote migration/GitHub save/main merge/publication. Evidence: docs/evidence/development-execution/git-04.json. Independent Astra review pending.

## 2026-10-21 — Mini/Proの新規製品ビジュアルを制作（DOC04 / G04、ROCK）

本人の画像品質改善指示により、内蔵image_genでMini R5とPro Studioの既存形状を参照した横長製品画像2枚を新規制作。Miniは自然光の建築空間、Proは暗色スタジオと金属質感を中心とする。READMEのみ差替え、既存画像と公開サイトは保持。生成元PNGを非破壊で複製し、concept captionとプロンプト記録を保存する。画像2件の整合性・参照・公開Git属性とREADMEのブラウザ表示を確認。初回verifyで既存MR PC試験の子process終了確認が1件失敗したが、単独19caseと全体再実行は成功。最終npm run verify exit0（Node2515成功/2skip、API1678、CSV385）。mainへ通常commit/fast-forwardで保存する。

## 2026-10-21 — READMEに製品画像とGIFを追加（DOC04 / G04、ROCK）

本人のビジュアル改善指示により、共通SVGヘッダー、Mini/Proの既存コンセプト画像、OS/Skyの既存GIF、Eveの概念フローSVGを配置。前回の広い余白と説明、製品順を維持。画像ごとにconcept/実画面の区別を記載。新しい重い生成物やruntime/製品の受入追加はない。画像6参照、SVG2件のXML/非script、OS/Sky GIF各24frameを確認。暗色ブラウザでヘッダーとEve図を表示検査し、npm run verify exit0（Node2515成功/2skip、API1678、CSV385）。mainへ通常commit/fast-forwardで保存する。

## 2026-10-21 — READMEの説明と余白を拡充（DOC04 / G04、ROCK）

本人の「詰めず、幅を開けてちゃんと説明」の指示により、Mini→OS→Eve→Sky→Pro順を維持し、4項目を小見出し・短い段落・独立したリンクへ展開。使う場面と製品同士の関係を説明し、製品間に区切りと余白を追加。確定した機能や受入状態の追加はない。製品順・各4小見出し・ローカル参照/anchorを確認し、R5文書3試験とnpm run verifyが成功（Node2515成功/2skip、API1678、CSV385）。mainへ通常commit/fast-forwardで保存する。

## 2026-10-21 — avokado全体のREADME入口を再構成（DOC04 / G04、ROCK）

本人指定のMini→OS→Eve→Sky→Pro順に目的・設計・コード・開発状況を整理。OS中心の見出しと「周辺製品」の扱いを改め、各製品を同じ階層で案内。既存の公開/実機/Provider/供給/料金の受入境界と開発手順を保持。READMEの既存状態検査は同じ未実装状態の日本語表記も受け入れるよう調整。READMEの5項目順・各4説明・ローカル参照先・anchorを確認。R5文書3試験、metadata:check、npm run verify exit0（Node2515成功/2skip、API1678、CSV385）。通常commitとfast-forwardでmainへ保存する。サイト本文やruntimeの変更はない。

## 2026-10-21 — Mini/Pro目的の確定と公開反映（WEB13 / WEB06、ROCK）

本人の明示指示を正本へ記録。Miniは暮らし・まちづくり、ProはAI専用PC事業と半導体・関連部品確保。R5単独性、共通OS権限、供給/施設導入の別受入を維持。製品baseline/全体設計/R5/Pro/profile/indexと公開Purposeを更新した。

Sites v42/source `ef42496c543c08b8ace91b030310cc70899a918a`を公開。正式2ドメインでPurposeのHTTPS200と実ブラウザ表示を確認。サイト38試験・design:check・root verify exit0。販売ready=false、施設実証・部品供給実績・契約・発注は追加受入なし。復旧候補v41。証拠は `data/mini-pro-purpose-publication.json`。次は対象施設/課題とPro部品/必要量/予算を実証・見積に基づき決める。公開配備とmain保存は別記録で追跡する。

## 2026-10-21 — Mini/Pro公開サイト更新（WEB13 / WEB06 / JOINT）

本人指示によりSites v41/source `3d4af1635b4684bdf97c90beb34b244cb5a95a14`を公開。`https://avocadomini.si/` は単独R5・任意LTE/IoT data SIM・制作入口、`https://avocadopro.si/` は構成検討・購入希望受付・未確定の設計目標価格を表示。Sites側のR5/Pro UIがmain一部より新しかったため、domain router/asset-first対策とともにmainへ逆同期し、古いE3主体の導線を整理した。公開範囲とD1/migrationを維持。既存rocketstar配布資料はSitesで保持しGitへ生成物を追加しない。

サイト38試験成功、root `npm run verify` exit0（Node2515成功/2skip、API1678、CSV385）。両正式domain、create/status、受付APIはHTTPS200。実ブラウザでMini R5・Pro表示、local Proの128GB選択確認、公開ゲームscore 0→1を確認。投稿/購入希望受付はopen、販売APIはready=false。有料注文・決済・実機受入なし。復旧候補v40、詳細は `data/mini-pro-deployment.json`。次は製造・部品調達・価格・決済/配送gateを個別受入する。GitHub保存/main同期とSites公開はこの証拠を分けて追跡する。

## 2026-10-21 — 未統合runtimeをmainへ統合（G04 / ROCK）

PR #185でEveアカウント履歴、owner成果HTML持出し、Linux/service、Pixel/Lab adapter、Mini/Pro追加sourceを統合。merge `9b5ce641e0a947e4b4106f2ffca09d5feee237b2`、検証head `8fc8027cd149d2486bcfc2be03863200c87d2c1e`。`npm run verify` exit0（Node2515成功/2skip、仕事API1678、CSV385）、同一headのGitHub checks成功。旧UI・生成物・重複migrationを再投入せず、RQ50とmainの権限/料金/復旧修正を保持。root0030〜0032/main Site0026はadditive。共有dirty685件と途中候補は保全した。

GitHub保存・main統合は完了。公開・実Provider・別端末アカウント・Pixel全OS・本番課金は追加受入していない。旧branch16 USD案とmain料金の相違は未解決で、setupは既定無効。並行チャットがsnapshot後に進めたPixel/Web同期は別作業として保持。次は最新mainを基準に、当該同期のsourceと同一artifactの受入を照合する。詳細: `data/runtime-integration-audit.json`。

## 2026-10-21 — 投稿型Home/Skyのmain統合（HOME01 / WEB04 / SKY21 / ROCK）

指定チャットの設計をもとに、旧Homeランチャーを投稿型Sky Homeへ置き換えた。owner別の投稿・フォロー・反応・コミュニティーOS版/鍵、任意のX本人API接続とMCP/API投稿受信、Agent/Model/Tool発見を既存Webへ接続した。既存mainの料金/RQ50/Wallet/業務契約は維持。新規migrationは0022〜0029で既存0013〜0021の後に適用する。合成DB移行と対象機能試験を確認。最終head `20faad5d`のGitHub CI 4件は成功し、PR #183をmain `6e8b3934`へ統合した。ローカル最終全体verifyは既存activation試験1件が10秒でタイムアウトしたが、単独再実行4/4は成功。初回候補の全体verifyはexit 0。Sites配備・実X/MCP Provider・Eve別端末履歴・Pixel全OSは未受入。次は実Provider/owner A-B/別端末の受入を個別に記録する。[Web担当](docs/workstreams/05-web-pwa-sites.md#redesign-thread-web)。

## 2026-10-21 — 最新RockstarOS本体設計と当時のGitHub main差分監査（履歴 / G04 / ROCK）

本人は参照チャットの設計をRockstarOS本体の大元と明示した。Home/Sky投稿型frontend、Eve履歴、鍵付きコミュニティーOS、eSIMから本人Cloudサービスへの接続、X投稿API/MCP受け皿を確認した。GitHub main 01b6aecd8b4d8bd2385665232dfb4b57029f991f と作業branch 951d82d5a491a284aed4e0d4d280171d835d4b43 は652 behind/3 ahead、ローカルは564項目dirty。mainのRQ50/v2.08/月額140 USD案と作業版RQ49/v1.120/月額16 USD案は未統合。OS設計の入口を設計portal・1.0構成・native/Pixel/QEMU担当とREADMEへ同期し、現行設計差分と統合順を[Web](docs/workstreams/05-web-pwa-sites.md#redesign-thread-web)・[Git](docs/workstreams/10-git-ci-operations.md#redesign-thread-git)へ記録。今回の別branch保存は監査/設計のみ。共有checkout、実装、実Provider、Pixel、公開、mainは未変更。次担当はmainを先に同期し、料金/RQの選択根拠を確定したうえで小PRごとに同一SHA検証する。

# Cloud依頼フォームの改善

## eSIM ready復旧試験とMini設計同期のmain限定採用（SIM01・MAT15・G04 / ROCK）

現行受入: PR240/head b860929cをmain c3c4845cへ通常統合。head全7CI・同mergeSHA全6CI成功、Linux全verify3075件/3073pass/0fail/2skip、別段階の実Linux親寿命4件成功。host最終全verify3075件/3072pass/0fail/3skip・build/API成功。初回Mini依存失敗、cache待機失敗と1回の診断済みretry、旧03CIのprocESRCH失敗を保持し、成功や恒久修正に置換しない。PDF58頁はGit外、本文/renderer/画像と試験source7件は受入head/main同byte。証拠 docs/evidence/development-execution/esim-mini-ready-design-main-current.json。実機・実回線/実課金・全体受入・616一括公開の保留は不変。以下は候補作成時の履歴である。

CI head03の既存Pixel parent-exit fixtureで、子の終了時proc読取りがESRCHとなる競合を確認。FileNotFoundErrorと同じ終了観測としてProcessLookupErrorだけを追加し、worker・待機・assertionは不変。合成observer旧新5比較でESRCH修正とPermissionError/生存100回の拒否・cleanupを確認（実Linux受入ではない）。新headの実Linux4試験を必要とし、失敗ログを保持する。host初回全verifyはMini依存未復元で1件失敗、固定Mini lockを復元後に該当4件成功、全verifyを再実行する。

基準main f5ea398a。eSIMはready証拠保存後・利用開始反映前の制御中断から、同一SQLiteを明示close/reopenして同一要求を再開する試験を追加。独立61件成功、元60件/制御5sourceは不変、保存欠落/再送重複の破壊反例2件も拒否（61へ加算しない）。実D1/HTTP、process crash、issuer署名、実開通/実課金・全ESIM-03は未受入。Miniは旧local v0.9をPR238と日米方針に合わせたv0.10設計へ同期し、本文・renderer・個別画像3だけを限定保存する候補。参照可用性の誤読を修正し、旧local研究60参照を台帳化。PDFは58頁・全頁目視/文字境界/埋込fontを確認してGit外へ保持。runtime/最終光学/PCB/実機/製造/公開の合格は追加しない。証拠 docs/evidence/development-execution/esim-mini-ready-design-main-adoption.json。次は同一artifactの全verify、Root統合metadata検収、headCI、通常main統合とmergeSHA CI。616一括公開保留、共有HEAD/index保持。

2026-10-18 SKY07/ROCK: 本人指摘に対応しCloud依頼欄を主画面へ移動、空入力・ログイン導線・送信不可理由・保存確認・日時履歴・回答表示を整理。Sandbox管理操作は折りたたみへ。既存API/台帳/CAS/予算を維持。公開v73/source226a995bへ配備。空入力/同意/未ログインChrome/390px幅のUI確認、実accountの依頼6b314560は自動選択→gpt-oss-20b→回答保存、送信1回・334/1331 tokens・$0。全文の内容正確性は未評価。全体verify exit0。証拠 docs/evidence/sky-cloud-request-ui.json。GitHub main統合は別。本番課金なし。

# 公開版・実端末同時利用の再受入

本人から「フロントとして機能していない」と指摘。通常Sky入口から無料Cloudへの導線、無料Cloudのログイン操作、依頼名での履歴表示、検証操作と通常操作の分離が不足していることをコードと公開UIで確認。実端末同時受入は未実行で保留。UI改修・公開はまだ行っていない。

2026-10-18 BIL02/JOINT・SKY07: main cf01d289後の公開v72/source c097ab09を照合。Macの実account履歴を読取、USB Pixel 10接続確認。独立したPixel側ログインと同時操作は未確認。既存2タブの合格を複数実機へ転用しない。上限はSandbox合成100 USD、実無料Cloudは0 USDとして分け、本番課金なし。対象33試験と全体npm run verify（bot:checkまで）exit0。公開対象8ファイルはmainと一致。Mac契約active/残100 USD/既存paid請求5件を読取。端末側ログイン待ちで同時試験は未実行。証拠 docs/evidence/sky-postmerge-multidevice.json。

# 待機中のプラン停止・復旧

2026-10-18 SKY07/BIL02: 公開v72/source c097ab09へ複数画面poll修正配備。実account2タブから2依頼保存、同ID確認・cap/月締め/pay同時操作はleaseで排他。合成上限100 USDは両画面共有、請求4→5件（各期間一意）で全paid。Bは拒否1+生成1、207・332/169 tokens/$0保存。Aは402反復後5試行でunconfirmed自動再送停止、実応答成功扱いにしない。修正後2分の一覧10取得すべて200、429なし。関連33試験成功、最終全体verify exit0でbot:checkまで完走（初回は別2試験timeout、再実行）。残り1 USD競合はlocal合成であり実課金/複数物理端末の合格ではない。証拠 docs/evidence/sky-concurrent-sandbox.json。

2026-10-18 SKY07/BIL02: 実accountの2画面同時依頼・上限・請求競合を検証中。5秒pollが共有20回/分を超え429を認証エラー表示する問題を発見し、30秒poll・読取重複防止・429後60秒待機へ修正。実無料Cloudと合成有料境界、複数画面と複数実機を区別。本番課金なし。

2026-10-18 BIL02/SKY07: A2A local D1初期化の30秒タイムアウトを、初期化だけ120秒の有限budgetへ分離（通常query30秒維持）、失敗時stdout/stderr診断と初期化実測を追加。単独A2A成功、全体verify exit0でbot:checkまで完走、同実行の初期化3415ms・positive14件成功。公開Sandboxの既存受入記録を保存。runtime・配備・本番課金変更なし。次は同head CIと承認済みmain統合。

2026-10-18 BIL02/JOINT・SKY07: main f2a2fba8後の公開v70（対象runtimeはmainと一致）で実account再受入。依頼8188afe5…は閉画面の上限/未払いcron後も送信0回、同invoice in_1URiPR…のSandbox入金・翌月更新後、閉画面で自動続行し送信1回・183の実応答・335/149 tokens/$0を保存。請求は旧3件保持＋当周期1件の計4件paid、period/invoice各一意。本番課金/再配備/DB移行なし。証拠 docs/evidence/sky-background-plan-gates.json。関連11試験成功、project:update成功。全体verifyはA2Aのlocal D1準備ETIMEDOUTで未完走（後続未実行）。検証記録のGit保存はmain統合とは別。


2026-10-18 SKY07/BIL02: 公開v70/source eedc50a2で次周期Sandbox試験を履歴保持で反復可能にした。実accountのqueued依頼でcap/未払いとも閉画面cron後送信0回。復旧後Provider timeout→unconfirmedで再送なし。別の実402 waiting依頼c14e2929…で、タブ終了後cap/未払いの各cronをまたいでも試行1回不変、同invoiceへの入金・翌月更新後に同ID completed「81 + 82 の答えは163です」、338/165 tokens/$0を保存。試行2回=拒否1+生成1。請求は旧1+試験2周期の各1=3件すべてpaid、旧履歴保持。本番課金なし。対象27試験、全体verify exit0（主2297 pass/既存skip1、全stage fail0）。証拠 docs/evidence/sky-background-plan-gates.json。次はGit保存と同head CI、main統合は別。

# 実402の画面外継続受入

2026-10-17 SKY07/ROCK・WEB01/JOINT: main 43cf290eの実accountで実FREE_LIMIT待機を確認。依頼50c364dc…をwaiting/試行1回で22:35:17Zにタブ終了。cronが22:35:38Zに自動続行し、再訪で同IDの実応答「61+62 の答えは123です。」、338/153 tokens、$0を確認。拒否1回＋生成1回で試行2回、再読込不変。Sandbox請求1→1、同invoice/status/period。本番課金・手動wake・fixture注入なし。証拠 docs/evidence/sky-free-cloud-background.json。コード変更・再配備は不要。今回の全体verifyは高負荷下で4 fail/3 cancelled（MCP/activation timeout等）、対象5ファイルの直列再試験は58/58合格。全体再実行合格とは扱わない。Git保存は受入記録として別PR、mainは未統合。

# 無料Cloudの画面外継続

2026-10-17 SKY07/ROCK・WEB01/JOINT: main 26df75e4から実装。公開Site v68/source 40015e38と毎分Cloudflare Workerを配備。実accountで送信0回の依頼を保存してタブ終了、cronだけで実応答「41に42を足すと83です。」を保存、再訪で337/117 tokens/$0を確認。別依頼のqueued/sending/completed再押下も送信1回/同参照不変。Sandbox請求は1件→1件、同invoice/status/period。既存データ移行なし。本番課金なし。無料Cloud対象16試験、全体verify exit0（本体2296 pass/既存skip1、全試験stage fail0）。証拠 docs/evidence/sky-free-cloud-background.json。実402の再発は今回観測せず、402待機/並列は合成試験。Git保存とmain統合は公開配備とは別。次はPRの同head CI確認。

# 無料Cloudの待機と自動続行

2026-10-17 SKY07/ROCK・WEB01/JOINT: 公開version65/source 9b7f46b5に402のカウントダウンと同ID自動続行を配備。生成前FREE_LIMITだけ再開、最大5試行/10分、owner/revision CASと毎回の契約/枠確認を維持。実accountで9秒表示→停止→0秒で追加送信なし→再開→同IDで待機拒否3回/生成1回、「31 + 32 は 63」、339/107 tokens/$0を確認。再押下でも応答ID/試行4回不変。請求台帳1件→1件、同invoice/status/period保持（照合paid_atのみ更新）。対象13試験、全体verify全stage exit0（2293 pass/既存skip1）。証拠 docs/evidence/sky-free-cloud-auto-continue.json。本番課金なし。次はGit保存/同head CI、無人queueは対象外。

# 無料Cloud 402の再検証

2026-10-17 SKY07/ROCK・WEB01/JOINT: PR #160の残条件を公開version63/source 4a17a16aで受入。402はProvider IP待機制限、実Retry-After 25秒を表示する修正を配備。26秒以上待機後、新しい合成依頼を実accountで自動openai-fast→GPT-OSS20Bへ送り「14 + 15 は 29」、337/104 tokens/$0の実応答成功。月次Sandbox active/残り100 USD、本番課金なし。npm run verify全stage exit0（2289 pass/既存skip1）、対象9試験成功。証拠 docs/evidence/sky-hosted-monthly.json。次は同head CIとPR #160のmain統合。無料Providerの再度の待機制限は残り、恒久無制限とはしない。

# 公開Skyの月次Sandbox契約移行

2026-10-17 BIL02/O5（JOINT）: 公開version62/source fc0f1cefで実accountを140 USD/月・100 USD枠のStripe Sandboxへ移行済み。列挙50表148行をGit外保全、追加DDL後一致、UI後も旧契約JSON/id/created_atと他48表の既存行を保持。画面で自動選択・合成100 USD停止・未払い停止・同一140 USD請求へのテスト入金とactive/残額100 USD復旧を確認。署名通知3件。無料Cloud生成2回はProvider HTTP 402で実応答未受入、有料fallbackなし。npm run verify全stage exit0（2288 pass/既存skip1）。証拠 docs/evidence/sky-hosted-monthly.json。本番課金なし。次は無料Provider復旧後の実応答再受入、main統合は保留。

# Sky月額プランと無料Cloudの統合Sandbox

2026-10-17 BIL02/O5（JOINT）: 本人指示で月額140 USD・利用枠100 USDの既存Stripe Sandbox契約に無料Cloud自動選択を接続する。main a067a03eからcodex/sky-monthly-free-cloudで開始。1時間合成契約とは分離した永続月次契約・署名通知・上限停止・入金後復旧を同一DBで検証する。境界金額は合成、Cloud応答は匿名無料実接続、本番課金は無効。23件の対象試験、実Stripeの140 USD失敗→同一請求入金と署名通知3件、無料Cloud実POST3回・UI再押下追加0回、再起動保持を確認。全体verifyは全stage exit0（2287成功/既存skip1、/private/tmp/sky-monthly-free-verify.log）。証拠 docs/evidence/sky-monthly-free-cloud.json。公開D1/実アカウント契約は変更なし。次は同head CIとmain統合、公開account移行・常設schedulerは別配備受入。

# RockstarOS — 現在の作業と再開情報

## 準備済みPixel/Miniのmain受入・現行同期

PR238は最終aba899d1の全14CIとRoot R5/元Web R2 carryforward検収後、main440f3cfbへ通常統合。parent bb432＋aba、tree89fa9一致、同mergeSHA全13CI成功。head/main実Linux標準全verifyは3074試験/3072pass/0fail/2skip、common103＋実隔離namespace packet26成功。元231f27/2341bdは間接merge commit4e201/2b614として238経由採用をGH読戻し、元branch保持。Pixel empty-clock2fixture、開発localservice、VIEW_ONLY camera、installer非上書き修復を別scopeとし、元source/失敗/metadata指摘/同SHA retryを保存。CodeQLはhigh0/medium1の専用Worker限定評価を保持、security0とはしない。Web R2はoperator CI pathのみportable要約し原SHAを保持、Rootfd989reviewはbyte保存。95固定分類/whole0・393task/14gates・元capturependingは不変。次はこのsource0 currentmetadataの独立検収→同headCI→通常main/mergeCIで有限隊列を終了。[現行受入](docs/evidence/development-execution/prepared-device-mini-main-current.json)。実機/実回線/実金融/実camera精度/校正/Jobimport/Eve学習/wholeOS/P02/公開・616は保留。

## 新host試験のdescriptor読取とCI最終再固定

installer修復後b709で実Linux packetは成功したが、CodeQLが新host試験のlstat後path再readをhighで指摘。installer054と他23固定対象は変えず、同じ拒否試験のregular fileをchild/検査前のO_NOFOLLOW|O_NONBLOCK descriptorへ固定し、型/link数/dev/ino照合後にdescriptorでreadしfinally closeする。元の拒否/fetch0/元inode/内容/cleanup assertionは維持。専用+gesture47/47成功、testは旧0d3からb4b385へ改版。 currentのoriginalSource22Unchangedは撤去し、元22receiptのbytes/hash不変を示すoriginalSource22CaptureUnchangedへ限定。現コードは元20不変/改版追跡済み固定24で記録する。Root source4150は旧testの履歴として保持し、この限定test差分を別確認して新head標準verify/CodeQL全CIを必須とする。[差分記録](docs/evidence/development-execution/prepared-device-mini-ci-read-revision.json)。root/Tool/実機/実課金/実camera精度/公開を追加受入しない。

## finite batchのinstaller安全性修復と最終再固定

Rootが旧installer6e321の既存download/directory symlinkによる外部marker上書きを実証し、bf42全14CI成功でも採用を止めた。元Mini担当のinstaller054dda＋専用test0d3df＋primary881fだけを採用し、Root独立4150で47試験/別旧新6scenario・beforefetch拒否/marker保持/正常0600nlink1/cleanup/valid再実行fetch0を確認。Root指示により技術READMEだけ追加改版し、UID/O_NOFOLLOW/hardlink対応macOS/Linux・Windows非対応、既存物非上書き/旧残骸自動削除なし、同UID並行親交換の非保証を明記。元22のうち20とservice依存7は不変、installer/技術README改版＋新hosttest＋Linuxfixtureで固定24hash。新union全verify3074/3071pass/0fail/3skip成功（README文書追記だけ後続）、CodeQL3警告の実bug修復とDedicatedWorker限定文脈を分離しsecurity0としない。旧588失敗/bf42CI成功・採用block/原sourceレビューは保存。[最終修復記録](docs/evidence/development-execution/prepared-device-mini-security-revision.json)。次: 新manifest/headのRoot/Web再検収→同head全CI/実Linux26→通常main/mergeCI→current metadata/main保存。実機/実回線/実課金/実camera精度/校正/Eve学習/wholeOS/P02/公開・616は保留。

## 有限batchのCI・metadata差分修復

初回head588e0f8aは13CI成功・linux-packetsだけ26件中1失敗。crash子processのobserve_readyでsample秒と_fence後のvalidation秒が変わり、厳密observedAt==nowに拒否された。runtime/controller/Gateを変えず、test helperの1観測呼出しだけgate._nowを固定し直後に復元。Root独立7clockprobeで旧拒否/新成功・stale/expired/future/TTL61拒否・例外復元を確認、26packet methods/payload AST不変。元22sourceは完全固定、追加fixture1で23hashとする。実Linux26は新headCIで別検証。Web R1のservice index scope MUSTFIX1はold adapter objectをmain不変へ戻し新service pending subrecordへ分離して修復。gesture metadata R1はmustFix0。CodeQL成功checkにもmedium3件があり、手動model installerとDedicatedWorkerの信頼境界をRootが独立確認するまでsecurity0としない。元588/原receipt/source22captureを保持し、[追加採用記録](docs/evidence/development-execution/prepared-device-mini-integration-supplement.json)で最終head/manifest→独立再検収→新全CI→通常main/mergeCIを閉じる。実機/実回線/実課金/実camera精度/校正/Eve学習/wholeOS/P02/公開は未受入。

## 準備済みPixel/Miniの有限統合batch

主担当10/G04、source07/11・ROCK。main bb432の全受入を基点に、別保存済みPixel fixture9a043220・Mini231f27faea8・Mini2341bd7189bを通常mergeして元commitをancestor保持。fixture1/開発service5/gesture16の22hashとservice依存7を完全固定、全main status/既存baselineRQ50・393task/14gate・95固定分類/whole0を保つ。CI同一内容の直列重複を減らすためRoot提案を採用し、一つの最終headへ統合。既存source検収を維持してRootはfixture/current metadata、WebはMini2scopeのmetadata/CIを独立検収する。新union標準全verify→固定manifest/head→新同head全CI→通常main/mergeCIを実施し、旧branchCIは転用しない。独立7childはWebが実行、Rootは再実行していない。実機/実回線/実camera精度/校正/実金融/Eve学習/全OS/P02/公開は未受入、616HOLD。[共通採用記録](docs/evidence/development-execution/prepared-device-mini-integration.json)。

## Pixel正常fixtureの実empty観測待合せと現行受入

主担当10/G04、source07/ROCK。Smith merge bb11のCI attempt1は既存Pixel正常fixtureの時刻Noneでnpm全verify前に停止。実observerを450ms遅延させ旧exact反例を再現し、正常fixtureのproducerを実empty観測後にだけ出力する最大3秒待合せへ変更。15assertion/他moduleAST/worker本体c6a4不変、Web独立c602 mustFix0、実child7case・reap/cleanup合格。旧650ms別エラー、永久観測不能/出力失敗/250msdeadlineの負例、Mac27中26pass1skipを分けて保持。初回失敗後、同bb11の一度だけのretryは全6CI・Linux3027/3025pass/0fail/2skip成功。恒久修正の成功へ転用せず新headCIを必須とする。OS237はhead8/mainbb432全7CI・Androidprototype2freshness試験/既存compile-emulatorとLinux3027/3025/0/2成功。両現行status/95overlay/handoff/indexを同期し、元capture false/pendingを保持。[fixture採用](docs/evidence/development-execution/pixel-empty-observation-main-adoption.json)。次: Root別metadata検収→fixedheadCI→通常main/mergeCI。runtime/実機/推論/wholeOS/P02/公開受入は追加しない。

## OS-02 capability観測時刻の限定修復

主担当07/ROCK・統合10/G04。未来observedAtをfreshにしていた旧consumer反例を保持し、固定4source/testと作者/Root独立receiptをhash不変でmain a58へ採用準備。actual Shell guardと純粋helperは0<=observed<=now<expiry、最大30秒を要求する。schema/producer/identity/権限/未知表示とtimerは保持。追加CIは既存JDK17後のbounded2分Python明示試験とpush/PR両pathfilterだけで、既存compile/emulatorを保持。新host全verifyは契約checker同期後3026試験/3023pass/0fail/3skip、元の旧literal検査1失敗は履歴保持。新host境界2方法/23case成功、作者offline compile/Shell14/lint0errors202warnings（差分未測定）、Rootsource検収mustFix0。次: 標準fullverify/最新main同期→Root別metadata/CI検収→最終headAndroid/全CI→通常main/mergeCI。device/推論/鍵/flash0、Android runtime/実機/P02/wholeOS/公開は未受入。[採用記録](docs/evidence/development-execution/os02-capability-freshness-main-adoption.json)。


## SMITH-01 処理中のページ内スキップ導線

最新main24ad1952へeSIM test-onlyまで通常同期し、Mini229/current main a58全13CIとeSIM236/current main24ad全6CIの実受入を現行status/95overlay/handoffへ追記。各head14/7成功、LinuxはMini3025/3023/0/2、eSIM3026/3024/0/2。元pending/失敗/host/原検収は不変。whole95受入0、金融/実機/公開は未受入。次はSmith固定source2のRoot最終metadata検収・新headCI・通常main/mergeCI。

判断更新: Root側本人の他chat残作業もmain統合まで進める明示指示を直接読戻し、このsource2にも適用。元save-only recordは履歴保存し、新しい[main採用記録](docs/evidence/development-execution/smith-running-skip-main-adoption.json)へ分離。main a58c6ffaへ通常同期、source2と元reviewhash不変。新標準host全verify3026試験/3023pass/0fail/3skip・build/APIまでexit0。Root別metadata検収→最終headCI→通常main/mergeCIを実施する。実auth/job/RootCUA/実機/wholeSMITH/公開は未受入。

現在の有限修復（SKY21 / O5 / SMITH-01）: main3bbから、running中に既存「メインコンテンツへ」が抑止される不具合を修復。既知同頁fragmentだけを許可し、他移動・consumer guard・auth/owner/予算/job/保存は保持。10局所試験と合成actual React/Chrome390/1280で旧反例/新focus・遷移抑止・draft保持を確認。[証拠](docs/evidence/development-execution/smith-running-skip-link.json)。source/metadata独立検収PASS・必須修正0、host全verify2994/2991pass/0fail/3skip。最新mainへの採用/Git保存/最終同SHA CIはGit担当へ引継ぐ。実auth/realjob/実機/native/wholeSMITHは未受入、公開・配備・616保留。原PR203 receiptの記録時点の値は保持する。


## Game→WorkJobの非金融下書き採用（AI06/GM01・08/ROCK）

着手: 最新main1ec70d62へ固定4sourceを同hash採用。既存GAME-01/PR205のCLI受入とworkflow/API/store/owner/依存を保全。元receipt78376/独立reviewf21ed/Root UIec031を原本hashと区別した匿名要約で保存。原56・独立7・Root実合成UIと最新Zod4.6.7 preflight56を別平面で保持。下書きimportは一時memory、本人createが唯一の保存、unknown時同ID/planを明示確認、実行/完了/予算承認0。標準private生成を含むhost全verifyはexit0（3010/3007pass/0fail/3skip）。初回loopback待受けEPERMはsource変更なしで実行条件を直して回復し、失敗ログを保持。Linux07354 CIは旧UI反例の固定ee9 object不足で1fail（3010/3007pass/2skip）。CIだけにdepth1固定commit取得＋旧Workbench hash照合を追加し、4source/反例を変更・skipしない。独立integration検収、同head CI、通常main/同mergeCIが残gate。原missing-private fulltsc失敗は保存し型stubを採用しない。wholeGAME02/実Game/金融/Provider/実機/公開と616一括公開は保留。証拠 docs/evidence/development-execution/game-work-draft-main-adoption.json。

## PR213 CI停止のWallet fixture競合を修正

G04の実CI c5cbで既存Wallet UI試験が停止。遅延GET gateを応答後に割当てるfixture競合を固定2反例で再現し、request開始時に一度だけ予約するtest-only修正。新2反例を含む全45試験成功、旧fixtureだけへ戻した対照は2失敗。既存assertion削除/弱化0、製品4source・Wallet/auth/schema/価格は不変。停止runは反例成立後に終了し、修正headとmergeSHAのLinux全verify/CodeQL成功を確認した。Pixelの確定済み8f CI metadataはPR214/main dc2b992fへ分離保存済みで、そのmergeSHAの製品7CI成功を確認済み。UIも上記の限定範囲でmain統合済み。証拠 docs/evidence/development-execution/wallet-ui-deferred-get-fixture.json。

UI最新main同期: main41ee45d7のMini Linux限定採用を通常取り込み、controller/packet tests/専用CI/証拠と現statusを保持。UI4sourceとPixel9sourceは同hash。旧head7f2aの全verify/CodeQLは成功済みだが、今回の最終head CIを別に確認する。

UI最終同期: Pixel PR209/main8f646ff3の限定採用を通常取り込み。Pixel9source・旧物理要約・Wallet/Mini・task/phase gateを保持。eSIM/Eve4source/testは検収済みhashと同一。最終CIとmain統合はこの同期後のheadで確認する。Pixel mergeSHA CI完了前に次main mergeは実行しない。

UI候補はeSIM cf7bb704とEve9fa85eb0の別commitを維持して最新main55a5193eを通常取り込み。Mini host source/進捗とWallet現受入を保持。各独立source/実合成UIの根拠を別receiptで扱い、最終head全CIとmain merge SHAを確認する。


## EVE-02 2〜4資料の互換拡張（ROCK / WEB04・HOME01・SKY21）

元候補の履歴: 当時の最新main f4ed492cをGitHubから読戻し、PR222の進捗同期とEveの限定採用を確認。shared dirty Rootは変更せず、固定mainの別候補で、設計の2〜4資料に対して現実装が2資料のみだった不足を対象にする。2資料の旧envelope/plan/promptを保持し、3・4資料だけversion2で既存compositionと見積onlyへ接続。合計8,000文字・goal500・file48,000byte・run80,000byte、owner/revision・consent・pricinggatefalseを維持する。判断: paid生成/新job engine/DB/migrationには広げない。検証と未完了gateは docs/evidence/development-execution/eve-multi-material.json へ記録する。GitHub保存・main採用・CIはこの候補の未実施段階。一般公開保留。


検証完了: 関連85/85、旧source3失敗反例、旧2資料3vector byte一致、type/lint/design成功。host全verifyはf4ed基点候補で3003件/3000pass/0fail/3skip・build/API/storageまで成功。初回OpenSSL/localhost/借用依存path・子process時間切れを証拠に保持。作業中のmain27a8へ11pathを同期し、Eve製品4/依存lock不変、追加undici2を含む85試験を再確認。同期後の全verify再実行・独立検収・Git/main採用は別段階として未実施。

独立検収: R1のP2二件（削除後の旧slot edit、READMEの旧UI証拠範囲）を固定し、material/goal editへ入力identity照合を追加。旧反例は不変でr2独立8+追加2/関連86成功、mustFix0・PASS_SCOPED。一次88/type/lint成功。旧host全verifyを修正後候補へ転用せず、Gitへexact9とreview r1/r2を渡し、最新main同期・最終head Linux全verify/CI・通常main統合・同mergeSHA CIと現行進捗同期を必須にする。

Git採用着手: 本人の明示指示を直接確認し、最新main53d991b3へ最終R2 patchを3-way適用。製品4/test5はR2と同hash、既存main全受入とindex1.41を保持し1.42へ更新。主担当10/G04・source05/ROCK。元host3003件はR2前・旧baseの履歴であり、今回の型/全verify/CIへ転用しない。標準private生成を含む新候補のhost全verifyは3025試験/3022pass/0fail/3Macskip・build/APIまでexit0。別担当統合metadata検収、GitHub保存、最終headCI、通常main統合・同mergeSHA CI、current進捗同期を進める。

現行採用: PR232の独立R2と別担当統合metadata検収はmustFix0、固定head d1eabc8a全7CIとLinux3025/3023pass/0fail/2skip成功。main fb604256へ通常統合し親/tree/製品4/test5一致を読戻し、同mergeSHA全6CIとLinux3025/3023pass/0fail/2skip成功。Root追加3/4実React合成UIはraw14/helper8hashとDOMを別担当がdocumentary検収し、原R1/R2と旧2資料証拠は不変。API/session/RAM/単価はfixture、実Provider/実課金0、wholeEVE/本番保存/実機/公開は未受入。現行記録は docs/evidence/development-execution/eve-multi-material-main-current.json。次はcurrent metadataのGit/main保存・同SHA CI確認。

## Eve単価の重複単位表示を別commitで採用

PR213はmain `2a9828b2`へ通常統合済みで、採用head全7CIと同mergeSHAの製品CI6件成功を確認しました。[統合証拠](docs/evidence/development-execution/esim-eve-ui-main-merge.json)。

本人依頼のmain採用対象。検収済み3hashを無変更採用し、rendererの重複suffixだけ除去。独立19pass・旧renderer2単位の反例と、新hashの実Chrome合成UI（1単位、上限比較、6秒失効、owner reset、paid0）を保持。金額計算/formatter/API/料金/本人同意は不変。eSIMとは別commit/receipt、同一UI候補headとmain merge後の同SHA CIを確認済み。


## eSIM provision再開のtest-only採用（ESIM-03 / SIM01）

主担当01/ROCK・統合10/G04。既存store2つを同一file SQLiteで使い、workspace INSERT後のsetup UPDATEだけ制御Errorを注入し、旧store/接続を捨てて同file再open・同workspace再開/再送/owner/旧revision/失効を検査する。runtime/schema/API/Billing変更0、元test/receiptと独立reviewをhash固定。独立60/60成功・追加1probeは重複非加算、mustFix0。実processkill/電断/本番D1/issuer/validready/Provider/課金/wholeESIMは未受入。 新host全verify3026試験/3023pass/0fail/3skip・build/APIまでexit0、Eve現行進捗main854をmetadataのみ通常同期済み。main fb604256へ採用準備、全verifyとRoot統合metadata別検収→headCI→通常main/mergeCIで閉じる。[採用証拠](docs/evidence/development-execution/esim-provision-recovery-main-adoption.json)。

## eSIM保存ack後の再照合UIを最新mainへ採用

現在: product PR213/main2a、progress PR222/mainee9、追加実visibility証拠PR224/mainf59を別々に受入。224のhead7CI/merge6CI・Linux2986/2984pass/0fail/2skipを確認。213統合後に完了した限定証拠であり、実auth/issuer-provider sandbox/回線/課金収納/公開とESIM01-08 whole gateは未受入。次候補ESIM03の有限gap再照合は未着手。

追加検収: PR213統合後に完了した自然Chrome hidden/visibleとfresh read復帰の証拠を匿名要約で保存する。3遷移・hidden9観測で本文と操作を遮断し、古いGETだけでは復元せず、現contextの応答後に復元、POST0。長いtool中断とhelper接続によるGET8→9を明記。Root原本4ad92/Web独立review5f5dと派生要約のhashを区別し、Git担当が別途metadata一致を検収（必須修正0）。コード統合時には未完だった履歴は保持する。実本人認証・実回線/eSIM・課金・端末/全製品の合格へ拡張しない。次はこの別証拠PRの同head CI、通常main統合、merge同SHA CI。証拠: docs/evidence/development-execution/esim-natural-visibility-summary.json と esim-natural-visibility-review-summary.json。

PR213はmain `2a9828b2`へ通常統合済みで、採用head全7CIと同mergeSHAの製品CI6件成功を確認しました。[統合証拠](docs/evidence/development-execution/esim-eve-ui-main-merge.json)。

着手: 最新main81aca294を基点に検収済みattempt2のcomponent/testを無変更採用。主担当03/ROCK、Git10、既存ESIM-BILLING-UI-ACK-01。独立元8反例と追加3試験、component41を確認。実Reactの合成browserでack後null/500/403の情報遮断・明示GET・同context回復・POST非再送を確認し、実hidden遷移は未検証と区別。現在: 対象回帰/type/lintとfixture修正込みhost全verifyは成功（2982試験/2979pass/0fail/3skip）。独立product-source検収とGit metadata整合確認を保持し、最新maindc2取り込み後の最終headと通常main mergeの同一SHA CIまで成功を確認した。API・認証・料金・実Provider/資金/端末は変更せず、公開配備/616一括公開は保留。証拠 docs/evidence/development-execution/esim-ack-main-adoption.json。

## Pixel候補の最新main同期とguard修正取り込み

現在: 追加限定物理証拠PR223をmain1ec70d62へ通常統合し、head7CI/merge6CI・実Linux2993/2991pass/0fail/2skipを確認。元2docs997375/6db55と独立判定を不変採用、旧save recordのmainIntegrated=falseは当時snapshotとして保持し、current recordを別追加した。追加端末操作・推論0、P02全体・全OSは未受入。

新c43 packageの非破壊実機batchはOS operatorが完了し、別のPro reviewerがdocumentary限定PASS（mustFix0、原本6db55d77）。guard9/parent4/cache-onlyを確認、元7f code復元、34jobs/2models/10agents/23成果hash・接続を保持し、cache制御row2のみ追加。PR223の元2c0では証拠Git保存と7CI成功まで完了。後続の本人明示指示により、証拠2docsを固定した最新main同期・独立metadata検収・新headCI・通常main統合・merge同SHA CIへ進む。追加端末操作/推論0、元operator receipt/raw27proof・画面・鍵/接続値はGitへ入れず、P02全体・全OS・実金融・一般公開は未受入。

[PR209](https://github.com/k999ln/rock/pull/209)はmain `8f646ff3`へ通常統合済み。同一mergeSHAの製品CI7件成功、Linux実verify2938試験/2936成功/0失敗/2skipと専用Python cache6/update23を確認しました。8f時点のDependabot自動更新1件失敗は履歴として保持し、同8fの全check成功とは扱いません。後続PR216/main d2222dc5でundici制約修正を採用済みで、当時の別の自動更新失敗はzodで、後続PR225/main f4ed492cで制約修正を採用し、同SHA全9CI成功を確認しました（最終検収は冒頭参照）。[現在の統合証拠](docs/evidence/development-execution/pixel-cache-main-merge.json)。PR213 UIはmain `2a9828b2`へ通常統合済みです。新c43 guardの限定実機試験と元codeへの復元は独立検収済みで、[PR223](https://github.com/k999ln/rock/pull/223)へ証拠保存済み（head2c0f3dfeの7CI成功）。追加証拠はPR223/main1ec70d62へ通常統合済み（採用head7e21の7CI、merge同SHA6CI成功）。端末は元code7fへ復元済みで、新c43の常設配備とは区別します。P02全体・全OS・実金融・一般公開は未受入、公開・配備・616一括公開は保留です。

主担当10/G04・source07。source20ff独立PASSと最終metadata3e独立PASS、head3e全8SUCCESSを確認。元receipt当時pendingと旧f3物理証拠は保持。Pixel進捗metadataはPR214/main dc2b992fへ通常統合し、head8CI/merge7CI成功。undici更新不可はPR216/main d222で修正済み、下記G04はPR218の補足検収。PR213 UIの統合を保持。8f当時の依存lock差分0は履歴であり、今回の同期はPR216の依存・lockを保持する。UIは上記PR213の限定範囲で受入済み、実Provider/金融/物理は別gate。

### Dependabot／undici更新不可の修正（G04 / H1 / ROCK）

開始main dc2→2aを通常同期して独立修正・検収した後、並行担当の[PR216](https://github.com/k999ln/rock/pull/216)がmain `d2222dc5`へ通常統合されたため、そのroot`^7.30.1`／Mini`^8.12.2`制約とlock7.30.1／8.12.3をbyte不変で採用。GitHub警告48/49/50/55/56/57はfixed。旧8f失敗receiptを変更せず、d222当時のzod更新不可は履歴として残し、PR225/main f4ed492cで修正・同SHA全9CI成功を確認済み。

PR218は検収済みhead2f737579（8CI成功）をmain7edbb9beへ通常統合し、同mergeSHAの8check成功（製品7/補助collect1）、Linux2993/2991pass/0fail/2skipを確認。PR225/mainf4の製品7・Dependabot2成功とZod修正を別証拠で確認した。root10/Mini2は旧監査snapshotで、後続PR225 receiptではroot7/Mini1（新規監査ではない）。原receiptの失敗・pendingは保持、公開/配備/616保留。 証拠 docs/evidence/development-execution/pixel-esim-prepared-work-main-merge.json。

### 原source/host段階の記録（履歴）

以下の待ち/次作業は当初記録であり、現在のsource/Git/CI受入は上記に更新済み。OpenSSL、sandbox、共有依存参照などの失敗履歴と原sourceの復元情報を保持する。

最新main55a5193eのMini host限定採用を通常取り込みし、元Mini source/進捗・Wallet受入・task/phase gateを保持。Pixel9sourceは20ff独立検収と同hash、物理要約は旧package限定。最終head CIはこの同期後に確認する。

Pixel旧package f3b345の物理証拠16点・helper4・画面3をGitが独立照合し、cache ready/replay/取消と元7f0223復旧を限定合格。元34run/2model/10agent・23出力hash保持、追加推論0。修正c43e7047の実機合格には転用しない。統合同期tree初回全verifyは共有node_modulesのvendor参照pathで1件失敗し、tree専用cloneへ切替えて再検証中（試験削除/弱化なし）。

### Pixel候補の最新main同期とguard修正取り込み（原source段階）

最新main81aca294を通常mergeし、Wallet208/210の現在受入と4試験を保持。作者修正e5ba8521を通常取り込み、元9sourceのうち7不変・guardと試験2件は作者commitと同hash。旧headのCodeQL Highと旧physicalは履歴として保持。次は最終headの独立検収・GitHub保存・同一SHAのCodeQL/全CI確認、その後main通常統合。実機操作・追加推論・公開配備・616一括公開は未実施。


### PR209 update guardの競合修正（2026-10-25 / OS10・P02・G04）

着手・判断: 利用者の明示依頼で旧06dac1bbのCodeQL Highを修正。主担当07 / ROCK、統合10。同FD限定読込とpointer/receipt/親directoryの同一性再確認、7追加回帰を実装。対象26成功、旧実装で反例失敗を確認。検証完了: 対象26/Python6+23、lint/design/project/package、全verify成功（root2924件/2921成功/3Macskip）。OpenSSL3選択前とsandbox loopback制限の失敗は証拠に保持。次: 新HEAD push後のCodeQL含む全CI、検収JSON更新。実機・追加推論0、Rootregistry/616保全は非操作。元のmissing-module/hostskip/neutral→High履歴は保持。


### Pixel cache-only/更新fence main候補（2026-10-25 / G04）

着手: Pro207通常main0dを基点に、sourceb1b0の独立検収済み9source/testを同hash採用。主担当10/source07、既存taskはreceipt参照。判断: 元receipt2608とportableのhashを分け、c9c795独立PASS/mustfix0・host99pass3skip/独立80pass1skip・Root11payload+aux3closureを保持。追加CI1pathは承認済みの独立synthetic stepだけでPython6+23をLinux上に配線。通常private module generatorでtypeを検証し、元missing-module失敗を成功へ換算しない。次: 対象Node/Python/lint/type/package/project/design/scanner、DraftPR exactpayload、最終head Linux Python各suiteと実npmverify/全CI、独立metadata検収。実機soleOSのleaseを維持、Gitの端末操作0。ロック解除待ちや旧physicalを今回合格にしない。RootHEAD/index/archive・残616公開保留。根拠 docs/evidence/development-execution/pixel-cache-main-adoption.json。



backup修正sourcea3a888bbの最終APKもPixelで全5工程attempt1/115.675秒、同意/同ID/失効/再同意/再起動readback/UIが合格。strict backupのhost完了復元とTool逆順atomic拒否、Pixel隔離DBの保留復元/pauseを含むBinder/SQLite11件とUI13実+既存skip1、host222/build/lint/全体verifyが成功。元75仕事276成果の全状態/内容、現83仕事308全body hash/実機4APKを確認。owner DBの上書き復元・旧APK downgrade・全OSの受入ではない。最終同一head CI/main統合はPR169を正本に別確認する。

統合前の追加点検: 新Tool工程はbackup schema2のrestore allowlist/recipe検査へ未登録だったため、厳密な4〜5工程・model pin条件を追加。完了成果のhost復元、Tool逆順のatomic拒否、Pixel隔離SQLiteへ保留仕事を復元してpause/記録を保持する検査を追加する。実owner DBへの上書き復元や旧APK downgradeの受入とはしない。最終APK/実機を再照合する。

API25の実機証拠とLLM/設計索引/担当入口/次プロンプト/README定義例を同期。project:update、design/baseline/LLM/mission checkとdiff検査が成功。Git保存・作業branch反映・main統合はPR169のlive mergedAt/mergeCommitを正本に分け、同じ最終headのCI成功後に通常統合する。

API25/c37実機最終: auto4B2→実citations/free-article→seal全5工程attempt1、134.996秒/699bytes/SHA5f3314d2409fed960de9951c494d149369886f56ab4b3936777c72d0d134bbb4。Binder/SQLite/失効境界11、Agent同意UI/同ID/二重tap/失効と再同意、process再起動後同hash/attempt/成果UI、通知tap/検索を含むUI13実+既存opt-in1未選択が合格。元75仕事/276成果/全状態と現80仕事296全body hash保持。実機4APK bytes/既存cert一致、Native8/Tool1無更新。main421b1029のWeb依頼フォーム改善を双方保持して統合、Android差分0。既定OpenSSL4による署名回帰の失敗後、既存OpenSSL3.6.3をPATH固定し、main同期後の全体verify全stage exit0（Node22/ファイル並列2）。最終CI/main統合はPR169のexact head/check-runs/mergedAt/mergeCommitで別確認する。

source8d83のPixel: 同じpending IDで受付を照合し、新規1仕事としてauto4B2→生成/入力検査/citations/free-article/seal全5工程attempt1、116.148秒、699bytesを保存。Tool順/モデル表示と未チェック同意、二重tap1仕事、同ID再送、失効/成果保持/再同意が合格。元のGeneral失敗は中止/保存済み。host222単体/build/lint、exactAPI25へ修正後の全体verify全stage exit0。CIのEngine注入修正を含む新APKの再試験と再起動readbackは次に実施する。

CIの旧Binder受入は、試験専用Engineのticketを実appの既定Engineへ照合したためholdを返して失敗。ToolConnectionへ同じEngineを明示注入し、実schedulerと隔離/再起動試験の所有DBを一致させる。assertや署名/出典の検査は維持する。試験の受付上限だけ20→180秒へ変更して同じpending IDを照合、runtime推論/lease上限は不変。

API25初回実機: Generalの実生成45秒で下書き保存まで進むが、本文1段落と不十分なsummaryのためTool入力検査で停止、Tool実行0。rawと同じ仕事を保持し、合格としない。articleというToolデータ形式とモデルのwriting能力を分離して既存4B自動候補へ接続し、失敗した合成試験仕事だけ明示中止後に別試行する。引用整理だけのrecipeに未選択の無料版条件を課さないadapterも修正。全体verifyは旧API24固定のsource check1件で失敗し、exact25へ同期する。

2026-10-18 OS11/O6/ROCK（SKY07/SKY21連携）: 本人の実Tool Agent指示でmain3d3e8f22からcodex/sky-agent-toolsに着手。schema2/local-tools runnerのowner別定義、順序/入力/結果照合、既存Broker/SQLite/別Tool app/停止/復旧を再利用する。model生成→Tool入力検査→承認済Tool→成果保存を一仕事で保持。元75仕事/276成果の読取り専用退避と全hashを確認。権限・外部送信・課金・全OSgateは増やさない。host221単体、build/lint、design/baseline/LLM整合が成功。API25の実機受入は未実行。

2026-10-17 OS11/O6/ROCK: 4BはPixel自身で全2,497,281,120bytesをWi-Fi取得→SHA/署名/読み込みまで104.912s成功（cachedSource=false）。手動選択UIも実選択。20件はAI表記拒否で0件のまま3回停止したため、限定direct診断で実5動作/82.626sとAI表記を確認。owner指定のAI→si整形に変更し、表記後の重複検査/旧データ不変を維持。part105s×最大2/lease240、2工程で正常Job継続・失敗backoff分離・pauseの4103取消を実装。Core126/automation47/SDK17/Shell14とbuild/lint合格、20件を新sourceで試験中。4B自動順位はまだ0、300件は未実行。

2026-10-17 OS11/O6/ROCK: b33fe6a6の20件は形式・保存170.965s合格だが、分野名コピー/途中切れが多く内容品質不合格。General1.5Bのplanning/writingを自動候補から除外。Qwen3 4B Instruct 2507のUnsloth量子化（Apache2、固定rev/hash、2.497GB）をホスト全量SHA/実GGUF42metadata/tokenizer/templateで確認し、既存鍵でprofile1/runtime7へ追加。autoPriority0/8GiB RAM条件の手動試験だけとし、Pixelで実Wi-Fi全量取得を進めている（既に1.22GB受信、未導入）。新4Bの品質/300件は未受入。

2026-10-17 OS11/O6/ROCK: single-topic runtime7試験は実10件保存まで進んだが再生成が多く、次の試験へ切替えて中止（保存prefix保持）。raw5へ異なる5分野を1案ずつ求め、30分野/10対象で多様化し、AI語は新規案だけsiへ再生成要求、旧AI checkpoint読取は維持。SDK17/host build/lint成功。新20件を再試験中。手動model試験は実ダイアログ選択を行い、手動route3102/自動3100を分離した。追加旧「記事準備のみ」表示も汎用説明へ訂正。300件は未着手。

2026-10-17 OS11/O6/ROCK: package7 actual build CI39067064393/source96dd7c30をunsigned SHA4696a5cb…/署名後760c579c…/既存certとpayload一致で検査。非破壊更新し新profileの実導入/20件を受入中。旧6+新Shellの優先度実験では表示中fg/閉じた後bg、実10件保存と後半duplicate3回停止を確認し、合成20件仕事だけ明示中止、保存prefixは保持。300件は未実行。

2026-10-17 OS11/O6/ROCK: 同一compact promptを直接呼ぶと23.467sで完了し、仕事経由は90s超。直接呼出し時の実processはforeground。返答は5件中4件が同一で、実仕事への保存は0のまま。package7はidea subtypeだけsamplingを変更し、通常taskは維持。Shell表示中は同署名BrokerへのbindingをonStart/onStopで保持/解放し、実行権限とは分離。source34試験/型/lint0、Python21、Android host build/lint成功。新profileGeneral v5/Coder v4を署名。native7 buildと実機20/300は未受入。

2026-10-17 OS11/O6/ROCK: 共通説明の長いraw5も90s超を確認。owner依頼を切り捨てず、商品文脈をSky/Miniの最小説明・30視点・直近2案へ短縮。全prefixの重複検査はBrokerが維持。旧20件読取テストの表記差分を修正し、ビルド失敗後に旧APKへ進まないset-e/OK guard付き手順でhost試験→非破壊更新→再導入17.676s成功→新20件試験を開始。

2026-10-17 OS11/O6/ROCK: package6のraw5案は実推論17.749sで正常完了（crash修正を受入）。raw10件は180s超のため、1保存工程をraw5件×最大2回・各90sへ分割。途中5件はメモリ上検査のみ、10件合格後にcheckpoint保存。IPC tokenは回ごとに新規、Engine ticket/model pin/240s leaseは不変。旧v1は20件読取検査を維持し再計画案内。SDK16/automation47/Shell14とhost build/lint成功。新しい20件の通常Home試験を実行中、300件は未完了。

2026-10-17 OS11/O6/ROCK: package6 CI39064987817/source f96ca583のactual APK/署名payload照合が合格。実検索UIは再接続後4.313s合格、GitHub/HFともHTTP200、実通知tapも合格。モデル再導入は旧20件試験pinの保護で停止したため、その合成試験だけ明示中止し再試験中。失敗画面の空operation cancelを除き、状況更新と本人による仕事整理を案内する。実生成20/300はまだ未受入。

2026-10-17 OS11/O6/ROCK: package5実機試験で10件は180秒timeout/保存0。5件の切分けでJSON完成後にJSI stopCompletionの実戻り値voidへ.catchを呼ぶcrashを確認。package6で停止戻り値を正規化し、実void/throw/rejectの回帰試験を追加。新profile署名/本人再同意で旧pinを保持し、実機受入は再実施する。

2026-10-17 OS11/O6/ROCK: native package5/API4はCI 39063165913/source cbb48421で実APK build成功。unsigned SHA-256 90e50347…、既存署名後0ec8101e…、zip payload一致、INTERNETなしを検査しPixelへ非破壊更新。更新前SQLiteの24仕事・70成果を更新後DBからhash照合し全件保持。main dbf02cc6を保全統合（Android/runtime入力差分なし）。新profileの明示再同意・実推論を受入中、300件は未完了。

OS11/O6/ROCK：Pixel Home→Coder自動選択→実推論→3段階→偶数合計Python関数の保存が139.344sで事前成功（d00867df/Broker、a9c35a37/runtime、コード実行なし）。20件probeはモデルが10件の要求へ1件だけ返したことを私有合成診断で確認し、0件のまま停止。package5/API4にexact N=1..10のideas配列schemaを追加し、task/title/summaryはruntimeメタデータ、実案は補填せずBrokerでも件数/重複を再検査する。完全JSONでdecodeを止め、readyをterminal callback前に公開。source31試験・型/lint成功（警告0）。General/Coderの旧job pinを黙って更新せず、署名済profileをそれぞれv3/v2へ更新、同じhashの既存weightを本人同意後に再検証する。Core126/automation47/SDK13/Shell14、host build/lint成功。旧合成20件仕事と重複途中downloadだけを明示中止。本人指定「RockstarOS・Skyのサービスアイデア300件」は未受入。次はnative5 build→実byte/signer→新profile導入→20/300実推論→同一source受入。main d6d7bd33のWeb無料Cloudを保全統合、全OS/正式署名/flash/有料cloud gate不変。





2026-10-17 SKY07/ROCK・BIL02/JOINT: 公開Sky version61/source d4ad106bで実account→1時間合成無料契約→自動openai-fast→GPT-OSS20B実応答「3+4は7」、332/118 tokens/$0を受入。再押下も同一保存結果。旧50表144行不変。本番課金なし。最新main 5ea0bf67を保全統合し両系列文書を保持、統合後npm run verify全stage exit0（2286 pass/既存skip1、/private/tmp/sky-live-merged-verify.log）、匿名実要求401拒否も確認。同一head CI待ち。証拠 docs/evidence/sky-free-cloud-live.json。

2026-10-17 SKY07/ROCK・BIL02/JOINT: 本人が既存データ保全を条件に公開Sky DB移行/無料Cloud配備を明示承認。50表144行の欠落なし退避、SQLite行再構成と追加移行の既存行不変を確認。実account認証＋1時間合成無料契約のowner限定試験を準備。本番課金なし。公開追加移行後の旧50表144行一致。実account限定合成契約で自動モデル選択成功。Workers redirect:error非対応をmanual/3xx拒否へ修正。生成は60秒timeout/未確認保存、自動再送なし。180秒上限で別依頼を検証中。回帰2286 pass/既存skip1（sky-live-edge-verify.log）。実応答/同一head CI/mainは証拠確認後に更新する。

2026-10-17 SKY07/ROCK・BIL02/JOINT: 本人ログイン後、公開Sky avoado.siの成果画面で認証済みを確認。無料Cloud画面は404。実Site appgprj_6abdfad4c5648191bcae957913bd02fa（取得source a28a9f4、latest version 56）は作業root設定のColumbiaとは別。無料Cloud routes/owner設定、work_jobs/sky_recurring_contracts/charges/remote_ai_text_send_claimsが未配備。実accountからCloud送信0、公開変更0、本番課金変更0。実応答の合格条件未達によりmain統合は保留。次は既存D1 backup/復元と0000/0001系列互換移行の受入、実Siteへ候補を接続、本人Sandbox契約の照合、実UI試験。npm run verify全stage exit 0（2284 pass/既存skip1、/private/tmp/sky-real-account-verify.log）。詳細 docs/evidence/sky-free-cloud-live.json。

2026-10-17 SKY07/ROCK: 実アカウントでの無料Cloud受入と条件付きmain統合に着手。localhost:5226は未認証（setupAvailable false、パスキーoptionsはPASSKEY_INVALID）。開発IDを実アカウントとして扱わず、本人提示のGitHubから公開Sky avoado.siを照合し、成果画面→サインイン→auth.openai.com/log-inへ到達。本人ログイン待ち。origin/main f10b7309を作業branchへ保全統合しproject.mdの両系列を保持。統合候補npm run verify全stage exit 0（2284 pass/既存skip1、/private/tmp/sky-auth-merge-verify.log）。main反映と本番課金は未実施。

2026-10-17 SKY07/ROCK・BIL02/JOINT: 無料Cloud実応答と画面接続を継続。空tool_callsの誤判定を修正。Mac共通React画面→自動選択→匿名実Cloud→実usage/費用0表示を受入（GPT-OSS 20B、入力331/出力118、再押下POST追加0）。契約は合成、Stripe接続0、本番課金なし。会話UI/API配線も追加し、本人/同意/プランを維持。npm run verify全stage exit 0（2284 pass/既存skip1、/private/tmp/sky-free-live-verify-final.log）。最新UI再確認と再押下追加POST0も合格。同一promptのProvider cache応答は新規推論と区別する。証拠 docs/evidence/sky-free-cloud-live.json。実パスキーsession・main統合は未受入。


2026-10-17 SKY07/ROCK・BIL02/JOINT: 無料Cloud拡張を本人指定で途中Git保存。Pollinations Classic匿名APIのモデル一覧取得と1件の実POSTを実施、完了/usage検査で停止し実応答は未受入。lib/sky-free-cloud.ts、既存workflow/CASへの記録を試作。UI/select API接続・$100境界の追加受入は未完了。本番課金なし。次は応答形式の照合、UI配線、無料Cloud全経路の受入。途中保存be362895のnpm run verifyは全stage exit 0（2280 pass/既存skip1、/private/tmp/sky-free-checkpoint-verify-final.log）。Provider追加に伴う旧件数fixtureを修正し再試験。


2026-10-17 SKY07（Web/Sky・ROCK）、BIL02連携: 本人はOpenAI未ログインを訂正し、LLM手動選択＋作業別自動を標準として指定。ログイン待ちを撤回。モデル一覧由来のローカル候補を作業別に選び、未接続は停止する実装。Cloud無料利用権・実応答は未確認、本番課金なし。関連25試験・全体verify（2277 pass/既存skip1、全stage exit 0）が合格。UIはlocalhost:5226/chatのJenniferパスキーで停止、操作未受入。実Cloudとmain統合は未完了。証拠 docs/evidence/sky-model-routing.json。


2026-10-17 BIL02/O5（JOINT）、DOC04/H1同期: PR #150/main 90d9a6d4から、実Cloud usageと100 USD枠の接続を着手。本人は無料枠のみを指定、Provider/APIキーの所在は不明。project環境変数/.env/.dev.varsにCloud資格情報は見つからず、有料APIは呼ばない。既存executeReservedRemoteAiTextと確定usageを再利用し、100 USD到達の外部送信ゼロをfixtureで先行受入する。実応答と合成境界を区別する。既存coordinatorへの接続・usage projection・100 USD境界/並列/usage欠落/再送/取消/A2A共通枠の6件とUI表示を確認。npm run verify全stage exit 0（2272 pass/既存skip1、/private/tmp/sky-usage-verify-final.log）。初回の無関係fixture cleanup ENOTEMPTYは単独と全体再試験で合格。OpenAI billingはログイン画面へ遷移し本人ログイン待ち。実Cloud送信0/Provider費用0、本番無効。次は無料利用権と接続の確認、実応答受入。
公開モデル検索をSky先頭へ移した最終source f4718e10の3 APKをsame signer/実byte読戻しで照合。更新APKでも実機全14件/84.327秒と手動1件/64.56秒が成功、失敗/skip0。通知実tap・両公開API・auto/manual exact pin・実2 Tool/成果保存を再受入し、全体verifyもexit0（/private/tmp/pixel-sky-entry-verify.log）。台帳はこの最終候補へ更新、GitHub同一head検査とmain統合はPR #157のreadbackで別確認する。

2026-10-17 OS11/O6/ROCK: source 58ef9537の同一3 APKをsame signer・実byte読戻し一致で非破壊導入。Pixelで全14件/84.402秒と手動model追加1件が成功、失敗/skip0。実System UI通知tap、SkyからGitHub/Hugging Face両APIの実検索、Homeのauto/manual 1.5B→実2 Tool→395-byte成果・exact manifest pin・二重tap1仕事を確認。実UIのLLM一覧から1.5B手動選択も操作。host Core123/automation46/Shell14、build/lint、Node22の全体verify成功（2266 pass/既存skip1）。証拠はdocs/evidence/pixel-intuitive-experience.json、APK/log/合成本文はGit外。同sourceのCIと受入台帳commitのCI/main統合は別々に確認する。一般文章品質/全OS/cloud実Provider/X APIは未受入、OS11全体完了ではない。

本人の追加指示（2026-10-17）で公開open LLM検索をSkyへ実装。GitHub/Hugging FaceのGGUF候補は取得時刻・license claim・未検証を表示し、検索と導入/実行を分ける。XはAPI未設定のため明示外部検索のみ。署名/owner同意済modelの手動選択と、記事準備向け1.5B自動選択をAPI20でexact digest固定する。全OS/一般品質/cloud実Providerの受入は含めない。

2026-10-17 OS11/O6/ROCK: 本人の再開指示でPR #157の通知不達とLLM手動/作業別自動選択を継続。最新main f10b7309とbranch 917a986b（CI8件成功）を照合。まず通知receiver/Binder/重複抑制を実機で切り分け、選択したmodelを実行前に固定する契約を既存Sky/Brokerへ追加する。通知receiverのrestricted ContextでReceiverCallNotAllowedExceptionを再現しapplication Contextへ修正、通常snapshotのbaseline化も修正。API20の同APKで通知実tapとSky両公開APIの実検索が3件/7.611秒で成功。自動/手動のexact model pinと全体回帰は検証中。

2026-10-17 OS11/O6/ROCK: Pixelのデザイン・仕事一覧/一件の詳細・通知導線をcodex/pixel-intuitive-experience、PR #157へ実装保存。固定候補7b16d61bの3 APKを同signer/実byte一致で導入。host Core123/automation38/Shell14失敗0、全体verify成功（2266 pass/既存skip1）、同head CI8件成功。Pixelのopt-in全12試験は11成功/通知1失敗/skip0、167.824秒。Home実1.5B→2 Tool→395-byte成果保存・二重tap1仕事は成功。background review通知が90秒以内に見つからず実System UI tapは未到達、原因未確定、foreground baseline競合等を調査する。本人の「LLMを選べる、defaultは作業に合うものを自動選択」はbaseline/設計/引継ぎへ追加、未実装。今回「ここまでGitに」指示でcheckpointを保存し、main統合/通知実機受入/LLM選択完成は保留。既存の同ID/同意/停止/保存・全OS/paid cloud gateを維持。
2026-10-17 OS11/O6/ROCK: Pixelのruntimeを5番目のoverlayで修正し、CI 39043256663の全overlay/同payloadを実検査、同signerで非破壊導入。0.6Bは構造的一周に成功したが文章品質は失敗。既存15分pin予約gateを保ったまま署名済Qwen2.5 1.5Bへ明示切替。固定候補6c9a3083（4 production APKをbyte読戻し一致）で、本人unlock後のHome→実v4計画→実2 Tool→確認待ち成果物保存が64.625秒で合格。明示同意・二重tap1仕事・1.5B pin・395-byte成果のBroker process再起動readback一致を確認。文章は主題に沿うが依頼構成/出典未調査表示を満たさず、一般品質は未合格。0.6B停止ack6ms/遅延仕事0、native ready待ち28.785秒で即時計算停止の受入ではない。host180件、patched runtime26 Jest/型/lint/offline、merged-mainのnpm run verify全stage exit0（2266 pass/既存skip1）。現branch codex/pixel-local-inference-20261017、PR #154。同head CI11件成功、system picker書出し395 bytes一致。コードPR #154はmain bf35f5f1へ統合済み。実機証拠と本人メモはcodex/pixel-physical-evidence-20261017で別保存し、同head CI後mainへ統合する。本人メモ「デザインがダサい、通知と、仕事の操作性が直感的じゃない」をbaseline/Android workstreamに保存、体験改善は未実装。OS/flash/有料cloud/日本語音声/全Goal/AMCは未受入。

2026-10-17 BIL02/O5（JOINT）、DOC04/H1同期: 本人の「毎月140ドルの自動請求・未払いAgent停止・入金後復旧、Sandboxのみ」により、main 1f0cd54eを既存PR #150 branchへ保全merge。新しいopt-in Sandbox契約/請求projectionと月次timerを既存Remote LLM/A2A予約・送信のDB境界へ接続。実Cloud送信と本番課金は無効。ローカル8件、実Stripe Sandbox6項目、署名通知4件、UIのpassedと2請求paidを確認。Node22/WRANGLER_HIDE_BANNER=trueでnpm run verify全stage exit 0（2266 pass/既存skip1）。初回の移行一覧fixture欠落を修正して全体再実行。証拠 docs/evidence/sky-recurring-sandbox.json、ログ /private/tmp/sky-recurring-verify-final.log。本番課金/実Cloud未実行。同head CI/main統合は未完了。

2026-10-16 BIL02/O5（JOINT）: PR #148は同headの全CI成功後、main 60765fc3へ統合。次は140 USD固定額・100 USD枠内追加請求0・未払い/復旧判定をStripe sandboxで受け入れる。codex/sky-140-collection-sandboxで着手。過去2か月の月末操作と合成usageを使う専用harnessであり、実契約・月次scheduler・実Agent実行gateへの接続を完成とはしない。

2026-10-16 OS11/O6/ROCK: 本人の端末内LLM/Pixel Jennifer実装指示により、main `0d39fddc`から`codex/pixel-local-jennifer`で署名済debug model catalog/SAF import/明示reload/有限計画/停止fenceを実装。private Shell API 19、Platform API 1、runtime Binder API 4を分離し、実runtimeの2-segment packageとBroker自身のIPC identityを検査する。host Android build/lintと179件、通常版catalog空・六APKの既存開発signer一致を確認。台帳は`docs/evidence/pixel-local-jennifer.json`。既存v4 runtimeはCI provenance/固定source/全overlay/payloadを確認した署名copyを再利用し、OS用artifact lockは変更なし。候補とGGUFはGit外`~/Library/RockstarOS/pixel-local-jennifer-20261016/`。本人は「今は実機を接続できない」と回答したため新APK導入/実推論/成果物/再起動/品質は未受入。日本語音声、全Goal/AMC、production配布、OS/flash、paid cloudは別gate。次は再接続時の同APK/同GGUF実機受入。 初回Android CIのJCA公開鍵import不備は同じEd25519を検証する固定BC 1.86で修正し、Gradle/Soongの同JAR byte-pinとstage/NOTICEを追加。公開tokenizer digestの誤検知は一literal/二pathの精密例外で対処、実Gitleaks16件・履歴候補0・stage/phone23件を確認。検査省略や全OS受入への転用はしない。 Node22.23.3の最終`npm run verify`も全stage exit 0（2252 pass/既存skip1、`/private/tmp/pixel-local-jennifer/verify-crypto-final.log`）。GitHub CI/mainは同branch PRのreadbackで照合し、host成功をPixel推論へ転用しない。

2026-10-16 BIL02/O5（DOC04/H1同期）: 本人が米国向け・月額140 USD/Agent利用枠100 USD・携帯契約のような請求を指定。契約同意/継続回収/未払い時の新規有料利用制限/入金後復旧を正本へ具体化、試算画面の未承認表示を更新。main 37b95959を基準にcodex/sky-contract-billingで着手。Stripe account APIは引き続き403、実Cloud設定も未取得。実決済・停止強制・本番契約を完了としない。Node22.23.3/WRANGLER_HIDE_BANNER=trueでnpm run verify全stage exit 0。Canvas型検査、Mac画面の米国/確定枠/未実装境界表示を確認。ログ /private/tmp/sky-us-verify.log。Git保存/main統合は同branch PRのreadbackで別記録。

2026-10-15 BIL02/O5（DOC04/H1同期）: main 869addcからCloud確定usage→月次請求→Stripe test adapterを実装中。既存精算済み記録のみ取込、本人/金額/アカウント照合・重複防止・署名webhook再取得を追加。専用10件合格。実Stripe sandboxは作成済みだが未claim鍵のaccount APIが403、外部往復未完了。実Cloud実行も接続先/予算待ち。fixtureと実外部受入は分離、本番課金無効。branch codex/sky-cloud-monthly-provider、月額140 USDは本人指定、利用枠100/運営40は提案として試算UIを追加。初回の全体verifyはWrangler更新確認の終了待ちtimeout。WRANGLER_HIDE_BANNER=true・Node22.23.3で全体verify exit 0、専用10件/DB等23件/Canvas型検査/UI計算切替合格。最新main a07bfebe（Pixel設計）を保全merge、統合後も全体verify exit 0（/private/tmp/sky-cloud-merged-verify.log）。実外部CloudとStripe往復は未完。

2026-10-15、OS11/O6/ROCK（設計同期DOC04/H1）で[Pixel si実装設計](docs/native-os-integration.md#pixel-si専用端末の実装設計)と[コード調査台帳](docs/evidence/grapheneos-source-audit.json)を作成。基準main `a3e7a8ca`の7 CI成功、GrapheneOS側129構成、86 repo/2,611 diff entry、選択source/config 4,705 fileを確認・検索し、非公開vendorや同image未受入を分離した。SpeechServicesの正式GitLab/v3 TTSを確認して前の未確認理由を訂正、日本語ASR/TTSは不足。8 module/12未実行ケース、既存Broker通信の再利用、local/cloudの一つのroot authority、料金/月上限/後払い・停止・全損/OTA復旧を対応する。採用lock2026100200、runtime、鍵、端末、実gateは変更なし。branch `codex/pixel-si-source-design`でbaseline/design/device/LLM・15固定source hash・Mermaid2図・Canvas型検査とNode22.23.3全体verifyが成功（通常2235件:2234 pass/既存skip1/fail0/cancel0、仕事API1381、CSV385、asset208/欠落0）。ログはGit外 `/private/tmp/pixel-si-source-design-verify.log`。GitHub保存/同head CI/main統合は同branch PRのreadbackで確認する。次はP0候補同期/固定→PX01現v4 local一仕事。C1/C2は独立して受け入れる。 main PR #142/df615298のSky単体月次請求・着脱Miniと進捗を保全mergeし、15 source hashの不変、同mainの6 CI成功、統合後の全体verify exit 0を確認した。統合後ログは `/private/tmp/pixel-si-source-design-verify-merged.log`。 main PR #144/869addc1のlocal月次sandboxも保全統合し、見積/有限Agent/原子的usage/模擬締め・収納と実Provider/商用受入を分離。再検証はNode22.23.3全体verify exit 0（通常2243件:2242 pass/既存skip1/fail0/cancel0、仕事API1381、CSV385、asset209/欠落0）。最終ログは `/private/tmp/pixel-si-source-design-verify-final-main.log`。

2026-10-15 BIL02/O5: PR #144をmain 869addc1へ統合。Sky単体のAgent利用→月次請求のlocal fixtureを実装。既存citation Agent/workflow/work_jobsを再利用し、料金と模擬入金をsandbox専用記録へ分離。local fixture実装・UI一周/再送/再起動・専用8件・D1移行11件が成功。npm run verifyは全stage exit 0（2242 pass/既存skip1、仕事API1381/CSV385）。ログ /private/tmp/sky-monthly-final-verify.log、証拠 docs/evidence/sky-monthly-sandbox.json。新schemaのjournal/DB件数fixtureとD1 SQL区切り、lint、起動時migration再適用を修正して再検証。本番gate/既存Wallet残高は変更しない。次は実外部Agent署名usageのadapter・実Provider sandbox・料金/訂正/未払い受入。公開なし。

2026-10-15、BIL02/O5（同期DOC04/H1）: 本人指示でSky単体のAgent選択・利用・計測・月次請求を独立成立する設計へ明確化。RockstarOSにはJennifer/Sky/Zemaを統合し各単体利用を保持。請求のZema依存を図から除き、既存台帳/Broker再利用、復旧、sandbox合格条件を正本へ同期。npm run verifyが全stage終了コード0で合格（通常2234 pass/1 skip、仕事API1381、asset208/欠落0）。ログ /private/tmp/sky-standalone-verify.log。最新main a3e7a8caを取得確認、取り込みは未実施。PR #142へ保存、main統合・実装・本番課金は別。次はSky単体の月次sandbox一周受入。

更新: 2026-10-15。製品要望は[製品ベース](docs/product-baseline.md)、サービスの設計入口は[統合設計](docs/service-design/README.md)、taskの現在値は[進捗JSON](data/project-status.json)と[Mission Control](data/mission-control.json)に置く。本書は現在の作業、証拠、未完了、再開方法と生成済みtask一覧に絞る。

2026-10-15、SKY21/O5/ROCKとして、会話・文字起こしを空行ごとの段落へ分け、各段落を「話題／問い／背景／理由／転換／判断／展開／着地」の短い流れへ自動変換する第一者Tool「会話図解 · Visual Scribe」を追加した。入力・生成はbrowser内の有限ルール処理だけで、外部送信、model推論、保存を行わない。貼り付けとUTF-8 `.txt`、段落切替、元段落確認、全段落コピー、現在図のSVG保存を実装し、`/sky/visual-scribe`をcatalogのready Toolへ接続した。catalogは基準mainの37件（ready 15 / candidate 22）から、このbranchで38件（ready 16 / candidate 22）となる。対象Node試験29/29、baseline/design/Sky catalog/typecheck/build、local IABで2段落の自動生成と切替を確認した。branch `codex/sky-conversation-diagrams`、初期基準main `a3e7a8ca`、2026-10-16に最新main `019c2231`を統合。[local証拠](docs/evidence/sky-visual-scribe-local-20261015.json)を正本とし、公開Site配備、音声取得・文字起こし、意味推論、本人保存、mobile実機は未受入。

2026-10-15、OS11/O6/ROCK（同期DOC04/H1）として[Pixelの現在地・実用化P0〜P7](docs/native-os-integration.md#pixelの現在地と実用化の順番)と[監査JSON](docs/evidence/pixel-readiness.json)を作成。main `1cb16d06`同SHAの7 CI成功、手元未commitの17項目候補12 hash一致、過去API v2実機と現v4 unsigned候補、今日のADB 0件を分離する。compile branchはmainの祖先、PR #130は追加2/後退23・check 0でPixel前提にしない。statusの古いcompile tag/統合branchを固定lock/mainへ訂正し、実機更新とはしない。本人のsi cloud料金plan方針を共通契約へ同期、月額/枠/超過単価は未決・既存数値/実gateは維持。branch `codex/pixel-readiness-cloud-plans`で14固定source hash/12手元hash、baseline/design/device/LLM/first-flash設定、Canvas型検査、Node22.23.3の`npm run verify`が合格（通常2235件:2234 pass/既存skip1/fail0/cancel0、仕事API1381、CSV385、asset208/欠落0）。flash設定の合格は0/4の閉鎖を確認したもので、flash受入ではない。ログはGit管理外 `/private/tmp/rock-pixel-readiness-verify.log`。保存/CI/main統合は同branchのGitHub PRで追跡する。原dirty作業木、runtime、鍵、実機、課金、公開は変更しない。

2026-10-15、OS11/O6/ROCK（同期DOC04/H1）として本人の「Pixelから独自OS、iOSはeSIMで機能追加」という提供順を[多機種契約](docs/device-support-architecture.md#pixel先行とiosへの機能追加)へ同期する。Pixel native OSを最初の物理商品とし、iOSは同じserviceのclient/Web/対応App Intents等の後続候補。5一次資料、購入/profile/service/client/権限の分離、app停止時のcloud継続、IP01〜04の未受入条件を記録。本人の追加指示でSkyをlocal LLM/cloud Agent/明示組合せの選択入口に固定し、model推論先とAgent runnerを分離、cloud標準の記述を更新する。既存registry/Job契約を再利用し、SC01〜05は未実行。さらにSkyのOS外へ開く市場/ハブと家具/建築融合を既存host契約へ統合し、センサー付きソファーの荷重→本人別記録例、校正/共有/partner責任、未実行SF01〜05を記録。横断融合の主担当はSKY07/O4/ROCK、Pixel実装はOS11/O6、設計同期DOC04/H1。branch `codex/pixel-first-ios-service-plugins`でlocal/cloud同期後のNode22.23.3全体verifyが合格（通常2235件:2234 pass/既存skip1/fail0/cancel0、仕事API1381、CSV385、asset208/欠落0）。家具融合の最終文書同期後はbaseline/device/LLM/design/R5を再検証して合格。ログはGit管理外 `/private/tmp/rock-pixel-sky-final-verify.log`。初回CI `8d9051ad`はSky説明の「端末・PC・Cloud」欠落を検出し、validatorを維持したまま実行先/権限/実行停止/結果受領の説明を補完した。同一最終headのCI/Git保存/main統合はGitHubの同branch PRで別に追跡する。最初の全体検証はWallet UI試験のpending Promise/event-loop終了で30件cancelとなり、成功扱いせず単独/最終全体で再確認する。runtime、flash、carrier entitlement、開通、課金、公開は変更しない。

2026-10-15、OS11/O6/ROCK（同期DOC04/H1）として本人の「si専用端末」方針を[端末基盤設計](docs/native-os-integration.md#si専用端末の利用体験と実装境界)へ具体化する。Pixelのunlock後si Home、Jennifer/Sky/Zema/Brokerの一仕事、Miniへの引継ぎ、保存/失敗/復旧とDT01〜06を同期する。現ShellがMAIN/LAUNCHERでHOME/voice roleを持たない差分を記録し、一般app方針は未決定、実装/実機受入は未実行。branch `codex/si-dedicated-terminal`でbaseline/design/metadata整合とNode22.23.3の`npm run verify`が合格（通常2235件:2234 pass/既存skip1/fail0、仕事API1381、CSV385、asset208/欠落0）。ログはGit管理外 `/private/tmp/rock-si-terminal-verify.log`。Git保存/main統合は同branchのGitHub PRのhead/CI/mergedAt/mergeCommitを正本に追跡する。実機設定/flash/署名鍵/回線/課金は変更しない。

2026-10-15、OS11/O6/ROCK（同期DOC04/H1）として[GrapheneOS・eSIM・LLM cloudの基盤調査](docs/native-os-integration.md)に着手。本人の「通信＋si利用権の商品入口」選択で旧商品入口方針を更新し、account正本・料金率・実発行/paid/flash gateは維持する。32項目の改変可能性と21一次資料、固定source `2026100200`、本日ADB端末0件、cloud paid gate falseとplaceholder配備を区別する。旧native入口/phone source説明を現在の正本へ同期。32項目/21一次資料/37 source hashと参照整合、9 Mermaid構文、Canvas SDK型検査、baseline/design/project/mission、Node22.23.3の`npm run verify`が合格（通常2235件:2234 pass/既存skip1/fail0、仕事API1381、CSV385、asset208/欠落0）。旧validatorのMini/入口決定日の結合を分離し、無制限/自動flash/実発行/paid等の不正な方針変更は試験で拒否した。ログはGit管理外 `/private/tmp/rock-graphene-verify.log`。Git保存/main統合はbranch `codex/graphene-cloud-foundation`に対応するGitHub PRのhead/CI/mergedAt/mergeCommitで別々に追跡する。実OS書込み・鍵生成・開通・契約・実Provider/課金・公開は行っていない。
2026-10-15、DOC04/H1/ROCKとして本人の「PCや実物の前にいなくても制作し、携帯を持たずやり取りする」方針を[体験設計](docs/service-design/01-service-experience.md)・baseline・Mini/OS/Tool詳細・全体図へ同期。制作の入口、計算先、現物の製作先を分け、6受入ケースは未実行として記録する。基準main `4945f83e`は同一SHAの取得済み11 check成功。`baseline:check`、`avocado:r5:check`、`design:check`、8 Mermaid構文、`project/mission:check`、Node22.23.3の`npm run verify`が合格（通常2235件:2234 pass/既存skip1/fail0）。再利用worktreeの依存不足は`npm ci`で解消し、runtime修正ではない。検証ログはGit管理外 `/private/tmp/rock-ambient-verify-final.log`。作業branch `codex/ambient-making-design`とmain統合はGitHubの同branch PRのhead/CI/mergedAt/mergeCommitで別々に追跡する。実機・製作・外部契約/送信・公開は実施していない。
2026-10-14、DOC04/H1/ROCKとして[全系統の関連・戦略・データ・取引設計](docs/service-design/07-ecosystem-strategy-and-data.md)を作成。main `c6df4ca9`の全50 RQ・19領域・37 Toolを、19系統/25接続/13データ種/15取引/14外部候補/14 gapへ対応し、39一次資料と45 source hashを照合した。旧03/04/06のJennifer server相関処理を未実装とする説明は現コードへ訂正し、実Providerの独立性受入は残す。PR #130の建築専門家先行案とlocal Companionは未統合資料として分離。`research:check -- --source-hashes`、8 Mermaid構文、Canvas型検査、`npm run verify`（Node22.23.3）は合格。途中の既存PC adapter cleanup試験1失敗は単独/最終全体の再合格と共に[証拠](data/ecosystem-research.json)へ記録し、runtime修正と呼ばない。最終ログはGit管理外 `/private/tmp/rock-ecosystem-research-verify-final.log`。設計は[PR #135](https://github.com/k999ln/rock/pull/135)のhead `d63e074b`で8 CI全成功後、UTC `2026-10-15T00:31:34Z`にmain `b0ecbd2cdc9c95334abf6adb746c772395479f32`へ通常mergeされ、検証headとtree一致を確認した。公開・契約・実課金・施工・実機受入は未実施。

2026-10-14、利用者の公開画面で`https://avoado.si/os/sky`が404と判明。v54の公開用Site sourceはmainと異なり`package.json`のbuildが`vinext build`だけで、既存の`stage-sky-domain-router.mjs`を呼ばず、artifactに`domain-router.mjs`/`vinext.js`が入っていなかった。Site sourceのbuildをmainと同じrouter stage込みに戻し、Site専用`next.config.ts`にも`/os/sky`と配下の内部rewriteを追加。Site source `825d117d0ff715f4bb01cd10373313e657061f4d`をv55として公開した。ローカルWranglerで`/sky`→308、`/os/sky`・Agent・NYU hub→200、公開後の同じURLでHTTP 200、利用者の既存ブラウザタブを再読込してSky画面表示を確認した。GitHub mainのrouter stage実装は既存であり、追加のruntime修正はSite sourceだけ。`node --test tests/sky-domain-router.test.mjs` 7/7と`npm run verify`はmain sourceで成功。次の公開でもarchive内の`dist/server/index.js`・`vinext.js`・`domain-router.mjs`を確認する。

2026-10-14、利用者の追加方針「Miniを建つ前から建築に組み込み、複数の天井へ収納する」をR5の任意設置profileとして[Mini設計入口](docs/avocado-mini-r5/README.md)・[製品baseline](docs/product-baseline.md)・[全体図](docs/rockstaros-product-system-map.md)へ反映。既存の一台自律・外部給電・使用時200mm・据置型を維持し、建築/設備/内装の設計と取付/点検、居住者のprivacy/保存を分離した。MAT15（JOINT）が一つの天井型と対象物件を選び、実寸mockupで安全/停止/停電/交換/復旧を実測する。現時点では候補設計で、物件契約・適合認定・施工・製造は未受入。Mermaid構文3/3、`npm run baseline:check`、`npm run avocado:r5:check`、`npm run design:check`、`npm run project:check`、`npm run verify`は合格。全体ログはGit管理外の`/private/tmp/rock-full-system-mermaid-verify-final-ceiling.log`。

2026-10-14、DOC04/H1/ROCKとして[全体Mermaid関係図](docs/rockstaros-product-system-map.md)をmain `da6410ef`から起こし、最新main `89e3d77d`の公開Sky v55記録も保持して更新。Jenniffer（Git正本Jennifer）→Sky/Zema/AMC→Broker、LLM不要の有限Tool、端末内planner、契約cloud Provider/A2A、Mr. adapter、Wallet、Mini/Pro、暮らしの案件と異種host、Material/Game、rocketstarの地上記録と独立飛行安全系を三つの読める図へ分離した。暮らしは住まい・インテリア・音響の案と費用管理から、家電・店舗・専門家の別受入へつなぐ設計として記録。図の線と本番接続を区別し、Pixelの17項目（8実処理・9模擬）と`no_model`を現在地表へ記載。次は実Providerの見積・予算・Receipt一周と、Pixelの署名済みmodel→Zema→Toolの同一端末受入を別々に行う。文書変更だけでruntime、実機OS、課金、飛行は合格にしない。検証は `npm run project:update`、`npm run mission:update`、`npm run baseline:check`、`npm run design:check`、`npm run project:check`、`npm run mission:check`、`npm run verify`。

DOC04の検証結果: Mermaid構文3/3、`npm run project:update`、`npm run mission:update`、`npm run baseline:check`、`npm run avocado:r5:check`、`npm run design:check`、`npm run project:check`、`npm run mission:check`、`npm run verify`が最新mainと建築一体型追記後も合格。最後の全体検証ログはGit管理外の`/private/tmp/rock-full-system-mermaid-verify-final-ceiling.log`。作業branch `codex/full-system-mermaid` の最終head `db82f10a`をGitHubへ保存し、[PR #133](https://github.com/k999ln/rock/pull/133) の同一headでverify、SPIDER、CodeQLが全成功。2026-10-14にmainへmerge commit `9758b4493beab21cd9319e0d6caecc8c209cbb68`で統合された。公開Siteの変更・反映は行っていない。

2026-10-14、公開Skyの出典整理Agentは匿名入力後に401で止まり、結果を得られないと実画面で確認。SKY21の限定修正としてブラウザ内で無料の有限処理を先に実行し、コピー/Markdown持出しとSkyへの本人別保存を分離した。保存時だけ既存owner認証・WorkJobを使い、未保存結果を保存済みと呼ばない。本体Site v54/source `0c1cc72ee10d8ea6174974d6997ad22ab0bf6625`を公開し、匿名Chromeで入力→出典1件の未保存結果、保存ボタン→サインイン案内と結果保持を確認。ブラウザのdownload eventは確認できず、Markdown持出しの実機受入は残る。`node --test tests/sky-citation-agent.test.mjs`（2/2）、`npm run typecheck`、`npm run build`、`npm run verify`はclean main worktreeで成功。本人保存/再訪・A/B分離、Cloud Agent、外部MCP、Marketplace決済は未完了。次は本人別保存と再訪を公開Siteで受け入れ、モデル/Providerの料金・権限・成果の一周を別段階で実証する。

2026-10-14、Columbiaと本体Skyの公開差分を確認した。前者は別Sites/D1のv79からv80へ更新し、後者はv53のまま保全した。Columbia Homeと無料の3カード・任意browser保存を残し、Explore／Work／Youと旧共有Sky画面を`avoado.si`へ誘導するv80/source `1d87952384fd6113bec773750290ff4ab8ca51f8`を公開した。匿名HTTPは大学Home・カード200、共有画面307とquery保持、公開browserはExplore/Work/Youの本体URLを確認。GitHub [PR #128](https://github.com/k999ln/rock/pull/128)はmain `d7171760f5183f1d206de4954a7b2f52b222916f`へ統合済み。同一headの7 CIは成功。本体SiteのDB移行履歴はColumbiaと異なり、旧データは未移行。次はbackup・互換migration・本人A/B・復旧試験を通して本体ソース更新と視覚統一を行う。

2026-10-14、Skyを異種hostと多数の専門Agentへ融合する明示方針を[製品ベース](docs/product-baseline.md)、[Skyローンチ設計](docs/sky-launch-design.md)、[MCP/Agent接続設計](docs/sky-mcp-architecture.md)へ記録した。冷蔵庫の在庫読取→不足/献立/買い物案→本人の注文承認→店舗receipt照合は到達例であり、家電・店舗・自動購入の実接続ではない。主担当はSky / MCP（SKY07、SKY21、ROCK）。次は同一originの型付き成果をhost能力fixtureへ拡張し、別origin認証、二Agent委任、読取専用host、注文作用を段階別に受け入れる。`npm run project:update`、`baseline:check`、`design:check`、`verify`は文書のみのworktreeで成功。現時点の成果は設計文書のみで、main統合・Site公開・実機/Provider受入は別に記録する。

2026-10-14、公開v72の`columbia.avoado.si/os/sky`で再現した404を修正した。Sky domain routerを標準buildへ自動stageし、`*.avoado.si`の`/os/sky`互換、サブドメインHome、旧`/sky`から同一hostの`/os/sky`へのquery保持308転送を両立した。Columbia入口の並行更新はGitHub [PR #123](https://github.com/k999ln/rock/pull/123)、domain-router更新は[PR #124](https://github.com/k999ln/rock/pull/124)でmainへ統合し、両方を含む同一treeをSites v74/source `fbee9f99dd5ea90613ed64be616814c1f20b140d`として公開した。`/`、`/campus`、`/os/sky`、Citations Agent、NFC resolverをbrowser確認済みで、v72はrollback候補として残す。

利用者の「古く紛らわしい不要な内容は削除」に基づき、旧日付ログ・旧端末構成・料金試算・途中状態の重複を本文から削除する。復元元はcommit `98a4898e9ea3bbafe276d3357d0a7bebf35eb6cb`。復元対象と方法は[Git整理方針](docs/git-consolidation.md)と[archive台帳](data/archived-paths.json)で管理し、新しい歴史文書へ複製しない。固定原本・vendor・evidenceは保持する。

## 2026-10-13 — Sky単体の出典整理Agent（SKY21 / WEB06、ROCK）

Sky HomeとMarketplaceから、スマホのブラウザで第一者の出典整理Agentを起動する経路を追加。本人認証、入力上限、有限処理、既存workflowの完了遷移、本人別WorkJobへの成果保存・一覧再表示・コピー・Markdown保存を実装した。LLM推論、外部検索、出典の真偽判定、有料Provider/Apple Payは含まない。公開Sky Site v53（source `e09d4de4`）で`/os/sky`・Agent・成果・5大学の短い入口をHTTP 200で確認し、未認証のAgent APIが401で拒否されることを確認した。公開ブラウザで未認証→別タブのサインイン案内と元画面の入力保持を確認。合成Worker/D1の`npm run test:api`は仕事1381・CSV385 assertionに合格し、Agent作成・再送・入力競合・偽造拒否・保存済み一覧・別owner分離を含む。本人A/Bの公開実行・保存・再読込とスマホ実機は未受入。GitHub [PR #119](https://github.com/k999ln/rock/pull/119)はmain `c646d083`へ通常merge済み。PR #119のverify・SPIDERの6 checkは成功。追加CodeQLが試験コードのURL部分一致判定をhigh警告として報告したため、完全一致の検査へ変更し、[PR #120](https://github.com/k999ln/rock/pull/120)をmain `e99575b4`へ通常mergeした。PR #120のverify・SPIDER CodeQL両言語・追加CodeQL・secrets・回帰・Web securityは全成功。次は同じ公開artifactで本人A/Bの保存分離・再送・再読込を確認し、Cloud AgentのProvider資格情報、価格表、予算、Receipt、決済を別gateで進める。

## 現在の作業

OS11/O6/ROCK、codex/pixel-discovered-modelsで検索候補からの検証済み導入と記事以外の作業別model選択を着手。基準main 5ea0bf67（PR157統合）を継承し、署名・license・hash・機種資源・job pin・同ID・停止を維持する。新しい推論結果schemaと既存Job/Artifactを接続し、Pixelで複数modelと要約/翻訳/code draftを検証する。検証は未実行。

2026-10-16、OS11/O6/ROCKで本人の実装指示によりPixel si端末のAPK previewを実装。基準main `019c2231`の同SHA取得済み6 CI成功から `codex/pixel-si-terminal-implementation` を作成し、原dirtyの表示部品のみ回収、現mainのBroker/同ID/料金/復旧を保持した。HOME候補・4画面・3経路の下書き・実Toolの保存/review/停止/書出し・依頼時scheduler・現v4表示・明示端末内音声adapterを追加。GL066へ既存開発署名と一致するAPKをdata保持で更新し、最終Shell 5件、同Brokerのv4 service 4件、system保存355 bytesのhash一致、Shell/Broker実プロセス停止後の同成果、Home system選択画面/取消を確認。既定Homeは変更なし。host Android build/lintとCore122/Shell JVM11/automation JVM32/SDK7、Node22.23.3全体verify exit 0（2252 pass/既存skip1、API1381/CSV385、asset210/欠落0）。依存不足はnpm ciで修復、RoleManagerの結果付き呼出しを実機検証で修正した。証拠は `docs/evidence/pixel-si-terminal-implementation.json`、最終ログ `/private/tmp/pixel-si-final-acceptance-verify.log`。APK/復旧copyはGit外 `~/Library/RockstarOS/pixel-si-terminal-20261016/`。現v4モデル推論・署名済model導入・日本語音声・Jennifer native統括・実Provider/商用課金・全OS/flash/OTA/全損復旧は未受入。次は署名済profileと一推論、日本語音声。実装はPR #149のhead `b7e1b30f`で8 CI全成功、main `bd429699672f7433d8e50fac3a886d73c36fb994`へ通常merge済みでtree一致。main merge自体のCIと実装headのCIを区別する。 受入台帳同期後の全体verifyもexit 0（`/private/tmp/pixel-si-acceptance-verify-retry.log`）。先行試行は既存symlink試験のspawnSync timeoutで不合格、単独9件と全体を再合格しruntime変更なし。 main PR #148/60765fc3のStripe sandbox受入と修正を保全mergeし、Android差分0・固定8 source hash一致を確認。合成usage決済と実Cloud/継続契約は別。統合後のNode22全体verifyもexit 0（2252 pass/既存skip1、API1381/CSV385、asset210/欠落0）。ログは `/private/tmp/pixel-si-main148-verify.log`。

主担当はAndroid / Device / Local si（ROCK）、OS11 / O6。設計同期はDOC04 / H1、作業branchは`codex/pixel-si-terminal-implementation`。通信＋si利用権商品とaccount正本、Jennifer→Sky→Zema/AMC→Broker→成果、RQ01〜RQ50、Mini R5、NVIDIA高性能si PCのPro、非金融Game、rocketstar独立安全系を維持し、サービス設計8冊と関連台帳を同期する。表示候補の選別回収と実Tool一仕事はAPKで受入。次はPX01の署名済model導入・現v4推論一仕事と日本語音声。cloudのC1/C2、共通予算・後払い・Provider・本人分離・data lifecycleは既存担当へ接続する。

第一者の製品表示は小文字si。[表記契約](data/product-terminology.json)に従いAPI/schema/保存key/task ID、npm `ai`、OpenAI等の外部固有名、署名・原本byteを保持する。今回の追加整理は正本本文の再構成と不要な旧説明の削除であり、料金、実行権限、受入gateを変更しない。

旧文書11件と旧P0表示component2件の削除、契約/si表示/現行R5の同期はmainへ統合済み。最新mainのSky/5大学/成果/DB移行を保全したsource `7b27ae7dfa46e9559f08b0345b583f9970df7a6e`はNode22の全体verifyと同一SHA 9 CIが成功。PR #114は2026-10-13 21:37:37 UTCにmain `59412c04ac37a9aa0a7cb6e488b842b1b98c869b`へ通常mergeされ、treeが受入headと一致した。元のdirty作業コピーは保全、Site再配備は未実施。

## Git・source・公開の現在地

- **品質改善と仕事composition**：PR #111はmainへ通常merge済み、merge `3ffc21d3a15235e0bde89a118e2f931135a9189e`。検証source `643559b8e00037b1f960afb9dea7bf309534d539`とtree一致、同一sourceの15 CI成功を[証拠](docs/evidence/work-composition-development.json)へ記録済み。
- **Jennifer**：PR #113はmain `01d2e41857e8e713bd5df31476deaea8c942e983`へ統合済み。head `3349c2475468443bc7ecd94a4e3782343f514a8f`の8 CIとmergeの7 CIは成功。本設計branchにもmainを保全mergeした。真正review/context/Provider/native受入は統合とは別に残る。
- **統合設計・si表示・旧内容削除**：[PR #114](https://github.com/k999ln/rock/pull/114)はmain `59412c04`へ統合済み。head `7b27ae7d`の9 CI全成功とmerge tree一致を[設計証拠](docs/evidence/service-design-rebuild.json)へ記録。main統合はSite再配備/公開本人/端末/Providerの受入とは別。
- **公開サービス**：記録済みの公開previewは別artifactのv54/source `b10c56688b9e38045685246c718d2de7c6f92f2c`。公開CSV契約・migrationはmainと区別する。今回のmain統合・文書整理で再配備したとはしない。本番本人の一周、端末download完了、商用課金は未受入。

大学NFCの別artifactは、担当報告によるv49のroute消失→v48復旧と、2026-10-13 20:35 UTCの独立HTTP8URL/200・title確認を[既存の設計証拠](docs/evidence/service-design-rebuild.json)へ記録した。配備source/version・追加browser・実カード・学生枠・有料Providerの受入ではない。同じSiteの公開前後に`/os/sky`と5大学Hubを保全する条件を[実現順](docs/service-design/04-delivery-and-acceptance.md)へ追加した。

最新main `1f256b90e894f3d5e4ae0081e6fe60d564819020`にはPR #115のSky Phoenix/完成feed/Columbia/local Agentと、#116/#117のlocal preview・Site互換DB移行が統合済み。loopback-only/最大3手/3 pure Tool/Cloud fallbackなし、本人同意初期OFF/30日800件/本文非保存/実行権非付与、serverのowner/retry、migration0063とSiteのresumable bridgeを保持する。既存mainの記録は[Sky](docs/sky.md)、[Agent一覧](docs/agents-and-tools.md)、[DB移行](services/sky-web/migrations/README.md)と進捗JSONへ継承し、旧spec-history/長いprojectログを復活させない。main統合はSite再配備・公開OS/Provider/実NFC受入と別である。

2026-10-14のCAMPUS02整合では、最新mainのJennifer/Citations Agentを保ったまま、Site v69/v70で検証済みだったColumbia host選択・任意LinkedIn choice・Phoenix完成feedを対象fileだけ再統合した。`avocadomini.si` の `SKY_TAG_ORIGIN` は `https://columbia.avoado.si` へ更新し、旧`chatgpt.site` hopを除いた。`columbia.avoado.si/`は英語3 Tool入口を直接返し、互換path `/sky/campus/columbia` はqueryを保って正規公開path `/os/sky/campus/columbia` へ308転送する。汎用5大学`/os/sky/campus/{id}/hub`は別機能として維持する。`Save here`はbrowser内、Jenniferは`/chat`のZemaへのchief-of-staff導線、`/sky/agents`は第一者Citations Agentへ集約する。現物カード・iPhone/Android readback・配布許可は未受入のまま残す。

PR #112はhead `df756bea745277b2a292790e843f185e80f00b02`からmain `1f256b90`へ統合済み。5大学Hub/PWA、NFC生成、同一originの型付きSky成果/Fitness表示、Home `/os`・Sky `/os/sky`・成果の正規URL、旧URL転送、Mini/Pro分離domain、本人情報をMini proxyへ渡さない境界を保全する。公開v48の既存記録は[大学NFC証拠](docs/evidence/sky-campus-nfc-live.json)と[App Output証拠](docs/evidence/sky-app-output-plugin-github.json)へ保持し、今回の配備/実NFC/学生枠/Provider合格とはしない。

PR #118のSite D1 bridgeと正本migration journalがmain `d779297a`へ統合済み。旧pre/post chainは`drizzle-legacy/`へ保全し、現行の`drizzle/0013_sky_provider_connections.sql`と生成元/再開契約を維持する。新mainへ追従し、旧文書を復活させずsource・索引・参照を同期する。任意claimの`/connect`をSkyへ直接送る限定修正を、Miniへの誤転送を再現した回帰試験で確認した。今回のSite配備は行っていない。

この記録は対応証拠の固定SHAに基づく。再開時はGitHub main・対象branch・PR・同一SHA CIを読み直し、未取得や過去snapshotを最新確認済みにしない。originはGitHub、Sitesは配信先。GitHub保存、main merge、公開readbackは別結果として残す。

## 検証済み範囲と残る条件

[サービス設計証拠](docs/evidence/service-design-rebuild.json)には、最新main保全後source `7b27ae7dfa46e9559f08b0345b583f9970df7a6e`でNode22.23.3の通常`npm run verify`成功を記録。2206件中2205 pass・既存skip1・fail0、仕事API1356、CSV385、asset201参照/欠落0、型/lint/build、baseline/design/project/mission/work/botが成功。同一head9 CI全成功、main merge tree一致、RQ50、上流133path、文書参照3261/欠落0、旧13path削除/復元、金融/実機gateを独立検収した。過去sourceの検証とNode24のV8 crash未修正は別scopeの履歴として保持する。

現設計/表示変更の追加browser受入は未実施。過去のcomposition受入はdesktop1280/390px、owner分離、保存応答喪失、再取得、原成果保持を同証拠の範囲で参照する。現artifactの公開本人認証、download完了、Provider、本番課金、実機OS/hardware、飛行を成功へ換算しない。

Pixel 10 GL066 / frankelは確定対象。試験署名APKの非破壊再起動23/23は[物理証拠](docs/evidence/android-pixel-10-prefull-physical-20260916.json)を保持する。最新source `2026100200`の署名検証と準備は[phone source証拠](docs/evidence/phone-source-verification.json)、全OS buildは専用x86_64 Linuxと予算/アカウント確定待ち。正式鍵・flash四gate・同image起動/OTA/純正復旧・data/Keystore全損復元は未完了。QEMUは独立したDeveloper Previewの受入系列。

## 既存の公開意思・条件付き了承

本人の「実装できるところまで整ってるなら公開していい」という条件付き了承は[実装承認の原記録](docs/execution-approval-20260909.md)に保持する。WEB01の一般公開意思の記録も進捗JSONへ保持する。これらは公開希望/条件付き了承の証拠で、製品license・正式署名・実機・Providerの未受入条件や、対象artifactの配備/公開可否を合格へ変更しない。旧project本文の確認先は[削除前の固定履歴](https://github.com/k999ln/rock/blob/98a4898e9ea3bbafe276d3357d0a7bebf35eb6cb/project.md)。

## 次の作業

Eveで自由に担当を作り、SmithでToolと実行先を照合し、同じ仕事をmiiの合成画面から読むlocal-preview候補は範囲限定の独立検収と全verifyに合格した。[設計・責任と制約](docs/service-design/02-system-contracts.md#eve-smith-miiの同じ仕事)、[試験と残件](docs/evidence/development-execution/eve-smith-mii-host-preview.json)。次はGit保存・main統合・同SHA CIをそれぞれ確認する。実account/eSIM、実mii/Pixel、実費と公開は別受入。

SDK 0.1.4配布archiveから展開した二つの非推論作例を、Smith宣言照合・既存Connector・同じ仕事とmiiソフト読戻しで試験し、独立検収と全体verifyに成功。PR276をmain c53ffad6へ統合し同SHA全10 CI成功。[統合CI](docs/evidence/development-execution/sdk-declared-example-main-ci.json)。旧配布版は保持し、宣言を権限や安全保証にしない。[証拠](docs/evidence/development-execution/sdk-declared-example.json)。

Smithの本人指定型・能力ID・permission/scope・実Toolの版付き宣言照合を統合候補へ追加。schema未宣言と対象scope不明を未確認としてbegin/claimでも拒否し、旧jobの互換を維持。合成fixtureと独立検収に限定し、実権限・Provider・実機は未受入。PR274をmain 5a85a523へ統合し同SHA全6 CI成功。[証拠](docs/evidence/development-execution/smith-declared-capability-matching.json)／[統合CI](docs/evidence/development-execution/smith-declared-capability-main-ci.json)。

Smithの入力照合候補は追加必須入力と不明schemaを区別し、本人へschemaを表示して確認取消・期限・再確認の競合を拒否する。PR268をmain 94f0d9dbへ統合し同SHAの全6 CIが成功。期待型の構造化・自動照合、通常accountと実機は別途必要。[証拠](docs/evidence/development-execution/smith-schema-confirmation.json)。

実行直前の確認を既存attempt・Connector一回承認・claimと同じ仕事の履歴/exportへ結ぶ候補は、旧job互換と新jobの省略拒否を独立検収し、main Smith修正とのcombined試験58/58に成功。修正後の全verifyは3413成功・0失敗・4skip。PR269をmain 2aeb926dへ統合し、同SHA CI全6件が成功。価格申告は未検証、実機と本番accountは別受入。[証拠](docs/evidence/development-execution/execution-review-history.json)。

未対応能力を持つ第三担当の保存・読戻し・不足表示と非実行、および同じ成果のmii画面・再読込・exportでのhash一致を合成ブラウザで確認、PR270をmain dad4fd14へ統合し、同SHA CI全6件が成功。[証拠](docs/evidence/development-execution/eve-smith-unmatched-hash-browser.json)。

同じ合成jobのmiiとA2A内部台帳で、送信不明・取消応答喪失・再接続時の予約保持と一回精算を試験し独立検収。実transport・署名・native Wallet・遠隔/物理停止は未受入。PR271をmain 0064d208へ統合し、同SHA CI全6件が成功。[証拠](docs/evidence/development-execution/mii-a2a-uncertain-budget.json)。

偽grant・receiptを含む合成成果を実Workerが非信頼artifactとして保持し、不正署名の使用額を拒否して同じ仕事の予約を保持する候補。別担当が対象1件を独立再実行して成功（他14件は選択外）、先行head CIではWorker全15件が成功。最新main取込み後のCIは未了。実Provider・モデル・端末や全権限行の不変は未検証。[候補証拠](docs/evidence/development-execution/worker-untrusted-result.json)。

SDK配布archiveのCLIから隔離workspaceを作り、非推論sampleと作者宣言を組み込んで、実Connector・同じ仕事・mii読戻し・export builder・同一承認再送拒否へつなぐ合成試験を追加。別担当も独立再実行し成功。初回候補CIは既存Eve合成停止試験8秒timeout、原因未確定のまま同SHA再試行成功。PR290をmain 3197e824へ統合し、同SHA CI全6件成功。[統合CI](docs/evidence/development-execution/sdk-author-workspace-main-ci.json)。公開・実端末・実Providerは別受入。[候補証拠](docs/evidence/development-execution/sdk-author-workspace-integration.json)。

SmithのTool観測を明示再確認し、期限・時計逆行・宣言変化で実行前に止める候補。合成Connector/SDK 44件・鮮度15件とUI/runtime 77件は別担当が独立再実行して成功。初回CIはlint、次のCIはブラウザ期限表示で失敗。読込遅延時の再確認UIとfixtureを修正後、独立UI/runtime 78件・隔離Macブラウザ2件成功。PR289をmain 130804ccへ統合し、同SHA CI全6件成功。[統合CI](docs/evidence/development-execution/smith-tool-observation-main-ci.json)。提供者申告は実権限や安全保証ではない。[候補証拠](docs/evidence/development-execution/smith-tool-observation-freshness.json)。

Pixel 10の既存RockstarOS画面で保存済みAI照合を1回操作したが結果は未確認。状態再照会後も同じ表示で、準備・取得の成功は確認できない。元ブラウザへ戻し、画面のみ独立検収。[限定証拠](docs/evidence/development-execution/pixel-saved-ai-lookup-unconfirmed.json)。

既存Agentの対象物attachmentと新しいrequirementsを共存・旧editorの省略時にも保持し、Eveの結果不明照合で両値を検査する候補。独立検収後の合成SQLite・実route試験22件を別担当が再実行して成功。PR287をmain 9a7c2a9cへ統合し、同SHA CI全6件成功。[統合CI](docs/evidence/development-execution/eve-agent-attachment-main-ci.json)。実端末・接続・権限の証明ではない。[候補証拠](docs/evidence/development-execution/eve-agent-attachment-preservation.json)。

mii合成入力の追加能力について、未対応・未確認を拒否し既存成果を保持する候補はLinuxブラウザ2件・独立検収・CIに成功し、CodeQL警告を修正後PR283をmain 7007b0beへ統合。同SHA CIの初回と再試行は最初のChrome隔離profileが100回の起動待ち内に開始せず失敗。起動待ちを上限300回へ変更したPR284を独立検収とCI成功後main 8e5bbdb2へ統合し、同SHA CI全6件成功。[統合CI](docs/evidence/development-execution/mii-browser-startup-main-ci.json)。元の失敗原因は未確定。記録PR285の別のCIではブラウザ検査対象が遷移中に閉じたため失敗し、明示的な画面移動の完了待ちPR285を独立検収後main 594739d4へ統合し、同SHA CI全6件成功。[統合CI](docs/evidence/development-execution/mii-browser-navigation-main-ci.json)。[証拠](docs/evidence/development-execution/mii-required-capabilities.json)。実機・権限は未受入。

同じ合成mii仕事とworkerの遠隔取消応答喪失・予約保持・署名済使用額の精算と再送防止の縦断試験は独立再現とCI成功後、PR286をmain bbc9a359へ統合。同SHA CI全6件成功。[統合CI](docs/evidence/development-execution/mii-worker-remote-cancel-main-ci.json)。実機・実provider・実課金の受入ではない。[候補証拠](docs/evidence/development-execution/mii-worker-remote-cancel.json)。

実workerの送信応答不明と同じjobのmii読戻し・ローカル取消応答不明・予約保持を結ぶ合成試験は独立検収とCI成功後、PR282をmain effbf9d6へ統合。同SHA CI全6件成功。[統合CI](docs/evidence/development-execution/mii-worker-unknown-main-ci.json)。ローカル試験は未了。遠隔停止・実Provider・物理端末の受入ではない。[候補証拠](docs/evidence/development-execution/mii-worker-unknown-draft.json)。

miiソフト画面と実adapterをつないだ隔離ブラウザで合成hostの期限切れ・同じjob保持・明示読直しを試験し、独立検収後PR281をmain ad9c0bcbへ統合。統合後の同SHA CI全6件成功。物理miiは未受入。[統合CI](docs/evidence/development-execution/mii-short-lease-main-ci.json)。[証拠](docs/evidence/development-execution/mii-short-lease-browser.json)。

mii読取adapterにhost提供descriptorの能力・版・最短期限の照合を追加する候補は対象試験・独立検収・全体verifyに成功。PR275をmain 6ce98364へ統合し同SHA全6 CI成功。[統合CI](docs/evidence/development-execution/mii-portable-read-main-ci.json)。合成画面と同じ仕事の読戻しを使い、宣言は本人・権限・実機受入にしない。[証拠](docs/evidence/development-execution/mii-portable-read-descriptors.json)。

miiソフト画面の期限切れ・停止要求時に古い表示を失効し、保存成果は明示的読直しで再表示する候補は、対象61件・隔離ブラウザ2件と独立検収に成功。JS timerの限界・物理停止は別受入。PR272をmain 3f3fa56dへ統合し、同SHAの全6 CIが成功。[元証拠](docs/evidence/development-execution/mii-output-lease.json)／[統合CI](docs/evidence/development-execution/mii-output-lease-main-ci.json)。

1. main統合済みの設計・入口を対象実装branchへ同期し、元dirty候補の未回収差分と同一公開artifactの受入を比較する。PR #112/#115/#116/#117/#118は既にmain適用済みで、旧文書を復活させない。実NFC・所属/枠・有料Provider・任意claim本番受入は別gateとする。
2. [横断契約と12受入](docs/service-design/06-consistency-contracts.md)の順で、realm/owner/root/leaf/成果相関 → 状態投影と親取消fence → account期間/Goal予算・価格/pass/後払いadapter → 真正reviewer/Receipt → grant/削除journal/鍵喪失復旧 → authority epoch/機器適合を既存fixtureへ接続する。
3. 同じ公開artifactで文章素材→処理→検査→本人review→download完了→再取得→レシピ再利用を一周し、操作時間・復旧・改善を測る。JenniferのCOLOMBIA原本、context grant、独立review証拠のserver照合を別に受け入れる。
4. Mini R5/任意LTE、ProのNVIDIA閉箱BOM/QVL/si/game/熱/復旧、Pixel全OS/QEMU、非金融Game/発明、rocketstarを各workstreamのgateで進める。consumer eSIM、888成功報酬、実交換/LIVE、未受入Providerの実行保留を解除しない。

## 再開方法と更新方法

最初に`git status --short --branch`、`git rev-parse HEAD`、正本5ファイル、[workstream入口](docs/workstreams/README.md)、[責任分界](docs/workstreams/00-responsibility-boundaries.md)を読む。[次のprompt](docs/prompts/rock-current-next-20261002.md)は最新Gitと対象コード/証拠へ照合し、既存task ID・完了条件・担当を選ぶ。設計v1.1の実装承認は保持し、公開・機器・実資金は準備条件と対象を確認する。

着手、判断変更、検証完了時に本書と`data/project-status.json`を更新する。通常は変更箇所の試験を先に実行し、必要な全体検査は`npm run baseline:check`、`npm run design:check`、`npm run project:check`、`npm run mission:check`、`npm run verify`。生成ブロックは手編集せず、`npm run project:update`で同期する。利用方法変更はREADME本文も同じcommitへ含める。

## 2026-10-13 — JenniferをZemaの段階承認付き実行統括へ強化（AMC02 / H1、ROCK）

利用者の「改善点全部対応して完璧にして」に基づき、Jenniferの保存即承認、client生成evidence、10分session依存、初回多重dispatch、曖昧なreviewer分離を廃止する。保存はD1上のdraftだけとし、COLOMBIA未決事項の回答／理由付き延期、inventory承認、inventoryの担当siと独立review、delivery承認、残りleaf、owner最終受入を分離した。全Goalで外部委任は同時一件。版付きplanとsemantic diff、task attempt、通貨別費用、pause／stop／resumeをZemaへ保存する。

workerのremote完了だけではAMCを進めず、暗号化artifact hashと署名済みusage Receiptからサーバーが`TaskReport`を生成する。reviewerはworkerと異なるprincipal、正確なpredecessor委任、worker report digestを持つ型付きclaimを返し、サーバーが`ReviewReport`へ固定する。plan状態とAMC Goalは同じD1 batchでrevision guardし、改訂時は旧承認を無効にする。focused 59件、型検査、lint、本番buildは合格。全体verifyはmacOS Python 3.11の`os.waitid`不足によりPC citations gateだけを実行できず、同一SHA CI、main統合、Sites配備はこの記録の後続で確定する。外部Provider送信はoperator設定・信頼鍵・allowlist・見積・Broker証明・owner個別承認が揃うまで無効のまま扱う。証拠は[Jennifer実行整合性](docs/evidence/amc/jennifer-execution-integrity.json)。

長いログ・OS image・cacheはGit外、実装・設定・最小fixture・要約証拠・復旧方法はGitへ置く。次担当へsource SHA、検証command/結果、未実行範囲、残るowner/外部条件を具体的に残し、秘密や原稿、証拠のない完了・公開・収益を記載しない。

## 全taskの作業進捗

<!-- project-status:start -->
最終更新: 2026-10-27 / RockstarOS本体の最新設計を基準に、Sky/Home・Eve・eSIM service accessと端末別gateを統合する / 完了記録 114/393件（親32・子192・独立169。実行単位は親を除く361件）

| ID | 作業 | 状態 | 根拠 |
| --- | --- | --- | --- |
| AMC02 | AMC Goal OrchestratorとJenniferの段階承認・本人別Web台帳・専門siへの設定gate付きA2A実dispatch・独立検収を整える | 完了 | [記録](docs/amc-goal-orchestrator.md) · [記録](scripts/amc-goal-engine.mjs) · [記録](scripts/amc-goal.mjs) · [記録](scripts/amc-codex.mjs) · [記録](scripts/amc-request-plan.mjs) · [記録](scripts/amc-effort.mjs) · [記録](lib/amc-tool.ts) · [記録](lib/workflow.ts) · [記録](app/api/amc/route.ts) · [記録](app/amc/page.tsx) · [記録](components/amc-tool-runner.tsx) · [記録](docs/sky-tools-complete-design.md) · [記録](tests/amc-goal-engine.test.mjs) · [記録](tests/amc-goal-cli.test.mjs) · [記録](tests/amc-codex.test.mjs) · [記録](tests/amc-request-plan.test.mjs) · [記録](tests/amc-effort.test.mjs) · [記録](tests/amc-sky-integration.test.mjs) · [記録](docs/evidence/amc/goal-orchestrator-audit.json) · [記録](docs/evidence/amc/codex-local-smoke.json) · [記録](scripts/amc-sky-observe.mjs) · [記録](tests/amc-sky-observe.test.mjs) · [記録](docs/evidence/spider-observation-source-read.json) · [記録](docs/evidence/jennifer-surface-architecture.json) · [記録](scripts/amc-agent.mjs) · [記録](tests/amc-agent-preflight.test.mjs) · [記録](docs/evidence/spider-agent-preflight-read.json) · [記録](docs/jennifer-coordination.md) · [記録](lib/jennifer-amc-execution.ts) · [記録](lib/jennifer-execution-store.ts) · [記録](lib/jennifer-execution-reports.ts) · [記録](app/api/sky/a2a-delegations/route.ts) · [記録](components/sky-chat-workspace.tsx) · [記録](components/workbench.tsx) · [記録](drizzle/0014_jennifer_execution_integrity.sql) · [記録](tests/jennifer-amc-decomposition.test.mjs) · [記録](tests/jennifer-amc-execution.test.mjs) · [記録](tests/jennifer-execution-reports.test.mjs) · [記録](tests/jennifer-execution-store.test.mjs) · [記録](docs/evidence/amc/jennifer-execution-integrity.json) |
| LCH07-01 | 子作業（LCH07）: 再受入する配布platform・候補SHA・archive hashを固定する | 未着手 | — |
| LCH07-02 | 子作業（LCH07）: 同一候補のlicense・NOTICE・SBOMとOWNER未決を照合する | 未着手 | — |
| LCH07-03 | 子作業（LCH07）: 候補のproduction署名・公開trust・失効/rotation証拠を結合する | 未着手 | — |
| LCH07-04 | 子作業（LCH07）: 署名済み同一候補をfresh環境へ導入し起動・保存を再受入する | 未着手 | — |
| LCH07-05 | 子作業（LCH07）: 同一候補の更新・rollback・backup/restore・中断復旧を受入する | 未着手 | — |
| LCH07-06 | 子作業（LCH07）: 配布物readbackと同一候補の全受入を監査し公開可否を分離する | 未着手 | — |
| OS02-01 | 子作業（OS02）: Pixel 10 GL066/frankelとsource lockの対象を再照合する | 未着手 | — |
| OS02-02 | 子作業（OS02）: source署名・vendor inventory・純正復旧artifactの入力matrixを作る | 未着手 | — |
| OS02-03 | 子作業（OS02）: 専用x86_64 LinuxのCPU・RAM・空き容量・依存を適合判定する | 未着手 | — |
| OS02-04 | 子作業（OS02）: build前freezeの不足入力と準備検査のfail-closedを検証する | 未着手 | — |
| OS02-05 | 子作業（OS02）: 適合済みLinux向けcompile-only再現手順とartifact保全条件を固定する | 未着手 | — |
| OS02-06 | 子作業（OS02）: OS02適合確認の全条件とfull build・first-flashの別gateをレビューする | 未着手 | — |
| SKY19-01 | 子作業（SKY19）: ToC料金保留と旧888 cents契約の適用差分を整理する | 未着手 | — |
| SKY19-02 | 子作業（SKY19）: SkyのToolチーム入口と利益発生から決済までの利用者動線を定義する | 未着手 | — |
| SKY19-03 | 子作業（SKY19）: 対象利益・料率・上限・実費・返金・還元の決定表を作る | 未着手 | — |
| SKY19-04 | 子作業（SKY19）: 保留中に新規料金計上・請求・回収をしない回帰試験を固定する | 未着手 | — |
| SKY19-05 | 子作業（SKY19）: OWNERの料金判断を記録し新契約の受入条件を版固定する | 未着手 | — |
| SKY19-06 | 子作業（SKY19）: Toolチーム入口・Wallet決済・開発者還元の設計全体をレビューする | 未着手 | — |
| SKY07-01 | 子作業（SKY07）: MCPごとのPC・Sky Cloud・提供者接続対応表をmanifestへ結ぶ | 未着手 | — |
| SKY07-02 | 子作業（SKY07）: 接続先選択・未対応表示・ワンタップ初期化のUI契約を検証する | 未着手 | — |
| SKY07-03 | 子作業（SKY07）: Passport・scope・一回承認と未信頼schemaの境界を検証する | 未着手 | — |
| SKY07-04 | 子作業（SKY07）: 代表Provider sandboxで接続から実行receipt照合まで通す | 未着手 | — |
| SKY07-05 | 子作業（SKY07）: sandboxでtimeout・失効・再接続・同一実行の再送を受入する | 未着手 | — |
| SKY07-06 | 子作業（SKY07）: 対応先別の証拠・未対応範囲とSKY07全体受入を公開前に確定する | 未着手 | — |
| AI02-01 | 子作業（AI02）: ModelProfileとRuntimeManifestのidentity・hash・互換条件を固定する | 未着手 | — |
| AI02-02 | 子作業（AI02）: hash・license・容量・互換検査で非active model stagingを保護する | 未着手 | — |
| AI02-03 | 子作業（AI02）: 仕事へのmodel/runtime版固定と旧job再開判定を実装する | 未着手 | — |
| AI02-04 | 子作業（AI02）: Brokerによるatomic切替・health判定・crash rollbackを実装する | 未着手 | — |
| AI02-05 | 子作業（AI02）: 承認済み評価環境で2 model候補の交換・旧job再開・失敗復旧を実測する | 未着手 | — |
| AI02-06 | 子作業（AI02）: 権限非昇格の回帰とAI02の全体完了条件を照合する | 未着手 | — |
| AI04-01 | 子作業（AI04）: OS10保存契約と外部作用outboxの状態・永続fieldを対応付ける | 未着手 | — |
| AI04-02 | 子作業（AI04）: 結果不明・重複・取消・crashの決定的fixtureを固定する | 未着手 | — |
| AI04-03 | 子作業（AI04）: dispatch前のoutbox保存・権限再検査・operation key固定を実装する | 未着手 | — |
| AI04-04 | 子作業（AI04）: provider照会とreceiptの署名・内容・金額・finality照合を実装する | 未着手 | — |
| AI04-05 | 子作業（AI04）: 再起動後の承認・receipt回収と取消競合を故障注入試験する | 未着手 | — |
| AI04-06 | 子作業（AI04）: AI01・OS10の依存とAI04全体の復旧証拠を同一版で受入する | 未着手 | — |
| SYS13-01 | 子作業（SYS13）: 緊急accessの既存APK証拠とfull OS不足を同一候補ごとに分ける | 未着手 | — |
| SYS13-02 | 子作業（SYS13）: hardware credential登録・失効・再登録の契約と公開設定を検査する | 未着手 | — |
| SYS13-03 | 子作業（SYS13）: Android serviceの限定command・期限・replay拒否・監査を実装検証する | 未着手 | — |
| SYS13-04 | 子作業（SYS13）: 候補imageのprivapp・SELinux分離と緊急復旧導線を受入表へ固定する | 未着手 | — |
| SYS13-05 | 子作業（SYS13）: 承認済みPixel候補で不正操作・失効・隔離の侵入試験を行う | 未着手 | — |
| SYS13-06 | 子作業（SYS13）: 同一Pixel候補で切断・再起動・失効後の復旧を検証しSYS13全条件を照合する | 未着手 | — |
| AMC01-01 | 子作業（AMC01）: Mini単体・Pro単体・任意連携・rocketstar地上支援の入出力表を作る | 未着手 | — |
| AMC01-02 | 子作業（AMC01）: 各Interfaceの主担当・受渡し先・安全境界を一意に割り当てる | 未着手 | — |
| AMC01-03 | 子作業（AMC01）: 公開説明・R5・Pro定義・rocketstar保存資料の相違台帳を作る | 未着手 | — |
| AMC01-04 | 子作業（AMC01）: 未決事項へ決定者・必要入力・影響先・次の作業を付ける | 未着手 | — |
| AMC01-05 | 子作業（AMC01）: 責任表と未決台帳を32部隊・親子タスクへ相互リンクする | 未着手 | — |
| AMC01-06 | 子作業（AMC01）: 関係部隊の責任表レビューを記録し残る未決を引き継ぐ | 未着手 | — |
| RKT10-01 | 子作業（RKT10）: 要求・BOM・供給元・inspectionの識別関係を定義する | 未着手 | — |
| RKT10-02 | 子作業（RKT10）: 不適合と構成変更の記録・影響判定を定義する | 未着手 | — |
| RKT10-03 | 子作業（RKT10）: 設計reviewと製造引渡しの証拠Gateを分ける | 未着手 | — |
| RKT10-04 | 子作業（RKT10）: 地上・飛行・再使用の証拠Gateを分ける | 未着手 | — |
| RKT10-05 | 子作業（RKT10）: 証拠提出者と独立確認者の役割をGateへ割り当てる | 未着手 | — |
| RKT10-06 | 子作業（RKT10）: 版変更時に再評価する合格範囲をmatrixへまとめる | 未着手 | — |
| RKT09-01 | 子作業（RKT09）: 機番・構成版・部品識別の台帳schemaを定義する | 未着手 | — |
| RKT09-02 | 子作業（RKT09）: 部品寿命・回収履歴の記録項目を定義する | 未着手 | — |
| RKT09-03 | 子作業（RKT09）: 点検・交換・不適合の判定経路を整理する | 未着手 | — |
| RKT09-04 | 子作業（RKT09）: 再飛行可否に必要な証拠と判定責任を整理する | 未着手 | — |
| RKT09-05 | 子作業（RKT09）: 不足証拠・版混在を拒否するsynthetic履歴を設計する | 未着手 | — |
| RKT09-06 | 子作業（RKT09）: synthetic判定と同一機番の実再使用証拠を分離する | 未着手 | — |
| RKT08-01 | 子作業（RKT08）: 輸送・設置・発射準備・回収の設備要求を索引化する | 未着手 | — |
| RKT08-02 | 子作業（RKT08）: 運用段階ごとの実行者・確認者・中止権限を定義する | 未着手 | — |
| RKT08-03 | 子作業（RKT08）: 要求と結果の照合・go/no-go・holdの記録形式を作る | 未着手 | — |
| RKT08-04 | 子作業（RKT08）: abort時の通知・確認・記録の机上ケースを定義する | 未着手 | — |
| RKT08-05 | 子作業（RKT08）: 地域・施設・運用資格の未決と確認先を整理する | 未着手 | — |
| RKT08-06 | 子作業（RKT08）: 机上rehearsalの入力と期待記録をGateへまとめる | 未着手 | — |
| RKT07-01 | 子作業（RKT07）: R1.0の電源・記録・時刻・通信要求を対応付ける | 未着手 | — |
| RKT07-02 | 子作業（RKT07）: A-LINK v0.4受信試作の適用範囲を切り出す | 未着手 | — |
| RKT07-03 | 子作業（RKT07）: 現行要求と旧試作を一致・差分・未確認へ分類する | 未着手 | — |
| RKT07-04 | 子作業（RKT07）: link別の容量・可視条件・電力・時刻の未決を整理する | 未着手 | — |
| RKT07-05 | 子作業（RKT07）: 切断・遅延・順序・再送のlink simulatorケースを定義する | 未着手 | — |
| RKT07-06 | 子作業（RKT07）: 受信試作・simulator・実電波・機体統合の受入を分ける | 未着手 | — |
| RKT06-01 | 子作業（RKT06）: Payloadの包絡・質量・接続の必要入力を整理する | 未着手 | — |
| RKT06-02 | 子作業（RKT06）: Payloadと機体のInterface責任を対応付ける | 未着手 | — |
| RKT06-03 | 子作業（RKT06）: 保持・扉・分離要求の状態を分ける | 未着手 | — |
| RKT06-04 | 子作業（RKT06）: 分離結果・残留・不明の状態確認を定義する | 未着手 | — |
| RKT06-05 | 子作業（RKT06）: emulator異常入力と表示・記録の期待値を定義する | 未着手 | — |
| RKT06-06 | 子作業（RKT06）: emulatorと実機分離の証拠を分けた受入表を作る | 未着手 | — |
| RKT05-01 | 子作業（RKT05）: 飛行核と地上支援OSのauthority境界を図示する | 未着手 | — |
| RKT05-02 | 子作業（RKT05）: 正常状態の入出力と独立判定役割を整理する | 未着手 | — |
| RKT05-03 | 子作業（RKT05）: 中止・通信断・再起動の状態遷移を定義する | 未着手 | — |
| RKT05-04 | 子作業（RKT05）: SILの入力・期待結果・trace記録形式を定義する | 未着手 | — |
| RKT05-05 | 子作業（RKT05）: 禁止遷移と権限越境を照合するレビュー表を作る | 未着手 | — |
| RKT05-06 | 子作業（RKT05）: SIL計画・SIL結果・HIL・実機・飛行認定を分離する | 未着手 | — |
| RKT04-01 | 子作業（RKT04）: 飛行領域・熱・扉・構造の要求対応表を作る | 未着手 | — |
| RKT04-02 | 子作業（RKT04）: 解析caseのMission版と構成版を揃える規則を定義する | 未着手 | — |
| RKT04-03 | 子作業（RKT04）: 境界条件・材料・不確かさの不足入力を整理する | 未着手 | — |
| RKT04-04 | 子作業（RKT04）: 空力・熱・構造の受渡入力と解消順を可視化する | 未着手 | — |
| RKT04-05 | 子作業（RKT04）: 解析と独立検証を照合する記録要件を定義する | 未着手 | — |
| RKT04-06 | 子作業（RKT04）: 解析計画と実環境受入の証拠境界をまとめる | 未着手 | — |
| RKT03-01 | 子作業（RKT03）: 推進要求と機体側Interfaceの出典台帳を作る | 未着手 | — |
| RKT03-02 | 子作業（RKT03）: 停止要求・状態通知の責任と確認記録を分ける | 未着手 | — |
| RKT03-03 | 子作業（RKT03）: 方式・型式・個数・寿命の未決台帳を作る | 未着手 | — |
| RKT03-04 | 子作業（RKT03）: 比較性能と採用値を分ける記録様式を定義する | 未着手 | — |
| RKT03-05 | 子作業（RKT03）: 専門設計レビューへ提出する項目と責任をまとめる | 未着手 | — |
| RKT03-06 | 子作業（RKT03）: 設計レビューから地上実証までの証拠Gateを整理する | 未着手 | — |
| RKT02-01 | 子作業（RKT02）: 構造・tank・取付部の要求とInterfaceを索引化する | 未着手 | — |
| RKT02-02 | 子作業（RKT02）: 材料候補と材料証拠の未決入力を整理する | 未着手 | — |
| RKT02-03 | 子作業（RKT02）: 荷重caseの出典・構成版・不足入力を対応付ける | 未着手 | — |
| RKT02-04 | 子作業（RKT02）: 製造方法・取付条件の未決と専門レビュー役割を整理する | 未着手 | — |
| RKT02-05 | 子作業（RKT02）: 材料試験・解析・構造試験の証拠順を定義する | 未着手 | — |
| RKT02-06 | 子作業（RKT02）: 製造リリースへ渡せない未確定条件を一覧化する | 未着手 | — |
| RKT01-01 | 子作業（RKT01）: 射場・回収・投入・搭載・環境のMission入力台帳を作る | 未着手 | — |
| RKT01-02 | 子作業（RKT01）: R1.0の60要求へ根拠と必要証拠を対応付ける | 未着手 | — |
| RKT01-03 | 子作業（RKT01）: 18 Interfaceの入出力とR1〜R10の責任を対応付ける | 未着手 | — |
| RKT01-04 | 子作業（RKT01）: 要求と未決事項の主担当・閉じ方をR1〜R10へ割り当てる | 未着手 | — |
| RKT01-05 | 子作業（RKT01）: 不足Mission入力の決定順と影響先を整理する | 未着手 | — |
| RKT01-06 | 子作業（RKT01）: W1要求整理とW2統合成立性のGateを分ける | 未着手 | — |
| PRO07-01 | 子作業（PRO07）: 基板・冷却・storage・I/Oの筐体包絡入力を整理する | 未着手 | — |
| PRO07-02 | 子作業（PRO07）: 動作モード別の電力予算と未選定条件を分ける | 未着手 | — |
| PRO07-03 | 子作業（PRO07）: 最大同時負荷と通風阻害の熱評価条件を定義する | 未着手 | — |
| PRO07-04 | 子作業（PRO07）: 電源断・中断更新・復旧失敗の受入入力を定義する | 未着手 | — |
| PRO07-05 | 子作業（PRO07）: 署名・個体鍵・譲渡消去のOSとProの責任を分ける | 未着手 | — |
| PRO07-06 | 子作業（PRO07）: 筐体・熱・更新復旧の計画受入と完成品受入を分離する | 未着手 | — |
| PRO06-01 | 子作業（PRO06）: pairingと能力交渉の機器認証条件を定義する | 未着手 | — |
| PRO06-02 | 子作業（PRO06）: Pose eventのschema版・座標・単位・時刻を共通化する | 未着手 | — |
| PRO06-03 | 子作業（PRO06）: Poseの順序・鮮度・重複・時計ずれの判定を定義する | 未着手 | — |
| PRO06-04 | 子作業（PRO06）: 切断・古いepoch・再接続の状態遷移を整理する | 未着手 | — |
| PRO06-05 | 子作業（PRO06）: 未知機器と異常Poseのsynthetic fixtureを設計する | 未着手 | — |
| PRO06-06 | 子作業（PRO06）: 1・2・4 Mini追加profileと単独動作の境界をまとめる | 未着手 | — |
| PRO05-01 | 子作業（PRO05）: 映像・音声・controllerの用途と最小接続構成を整理する | 未着手 | — |
| PRO05-02 | 子作業（PRO05）: 端子・規格候補とdriverの対応表を作る | 未着手 | — |
| PRO05-03 | 子作業（PRO05）: I/Oの帯域・電力を演算基板候補の制約へ対応付ける | 未着手 | — |
| PRO05-04 | 子作業（PRO05）: 起動前未接続と機器認識失敗の期待挙動を定義する | 未着手 | — |
| PRO05-05 | 子作業（PRO05）: 抜去・再接続の操作継続と音映像復帰ケースを定義する | 未着手 | — |
| PRO05-06 | 子作業（PRO05）: 最小I/O表の未決と選定前受入条件をまとめる | 未着手 | — |
| PRO04-01 | 子作業（PRO04）: session・game・作品・秘密参照・ログの保存分類表を作る | 未着手 | — |
| PRO04-02 | 子作業（PRO04）: 利用者分離と別owner読取拒否のfixtureを設計する | 未着手 | — |
| PRO04-03 | 子作業（PRO04）: 容量不足・並行更新・中断時の保存契約を定義する | 未着手 | — |
| PRO04-04 | 子作業（PRO04）: 暗号鍵の責任とcrash・鍵喪失時の復旧境界を定義する | 未着手 | — |
| PRO04-05 | 子作業（PRO04）: backup・restoreとschema版更新のfixtureを設計する | 未着手 | — |
| PRO04-06 | 子作業（PRO04）: export・deleteと削除後の再アクセスのfixtureを設計する | 未着手 | — |
| PRO03-01 | 子作業（PRO03）: DX01共通契約とPro固有profileの差分を整理する | 未着手 | — |
| PRO03-02 | 子作業（PRO03）: controllerの操作を意味操作へ対応付ける | 未着手 | — |
| PRO03-03 | 子作業（PRO03）: 任意Mini入力を同じ意味操作へ変換する差分を定義する | 未着手 | — |
| PRO03-04 | 子作業（PRO03）: sampleの版・導入・playの再現手順を定義する | 未着手 | — |
| PRO03-05 | 子作業（PRO03）: 中断・保存・再開の形式と期待状態を定義する | 未着手 | — |
| PRO03-06 | 子作業（PRO03）: 削除まで含めた非金融gameの受入ケース表を作る | 未着手 | — |
| PRO02-01 | 子作業（PRO02）: ゲーム単独とゲーム＋音声の再現負荷を定義する | 未着手 | — |
| PRO02-02 | 子作業（PRO02）: サービス＋保存とローカルsi併用の再現負荷を定義する | 未着手 | — |
| PRO02-03 | 子作業（PRO02）: 解像度・FPS・p95遅延・RAM・I/Oの計測欄を統一する | 未着手 | — |
| PRO02-04 | 子作業（PRO02）: 電力・温度・継続負荷の比較条件を定義する | 未着手 | — |
| PRO02-05 | 子作業（PRO02）: CPU・GPU・NPU候補のdriver・OS・供給条件を比較表へ揃える | 未着手 | — |
| PRO02-06 | 子作業（PRO02）: 同条件比較から候補を選ぶ判定手順と保留条件を作る | 未着手 | — |
| PRO01-01 | 子作業（PRO01）: games・services・compute・storage・audioの要求候補を抽出する | 未着手 | — |
| PRO01-02 | 子作業（PRO01）: Pro単独利用の利用者・入出力・成功条件を定義する | 未着手 | — |
| PRO01-03 | 子作業（PRO01）: 任意Mini連携の追加機能と切断時の境界を分ける | 未着手 | — |
| PRO01-04 | 子作業（PRO01）: Pro要求の主担当と受入方法をP2〜P7へ割り当てる | 未着手 | — |
| PRO01-05 | 子作業（PRO01）: 性能・端子・価格・筐体の未決台帳を作る | 未着手 | — |
| PRO01-06 | 子作業（PRO01）: v0.1要求整理からv1.0統合設計へ渡す不足をまとめる | 未着手 | — |
| MINI07-01 | 子作業（MINI07）: 校正失敗・過熱・通信喪失・OS停止・更新停電を危険台帳へ登録する | 未着手 | — |
| MINI07-02 | 子作業（MINI07）: 危険ごとの検出・独立停止・復帰条件を対応付ける | 未着手 | — |
| MINI07-03 | 子作業（MINI07）: 来客の物理停止と校正失敗時の受入ケースを作る | 未着手 | — |
| MINI07-04 | 子作業（MINI07）: 原データ保存・送信の既定OFFと許可取消を確認表へ落とす | 未着手 | — |
| MINI07-05 | 子作業（MINI07）: M2〜M6の評価計画から安全側へ渡す条件を整理する | 未着手 | — |
| MINI07-06 | 子作業（MINI07）: 未決をHOLDにする安全受入表とレビュー担当をまとめる | 未着手 | — |
| MINI06-01 | 子作業（MINI06）: 部品・動作モード・起動ピークの電力予算表を作る | 未着手 | — |
| MINI06-02 | 子作業（MINI06）: 表示方式未決の電力を独立した条件欄へ分離する | 未着手 | — |
| MINI06-03 | 子作業（MINI06）: 周囲条件・吸気閉塞・同時負荷の熱評価条件を定義する | 未着手 | — |
| MINI06-04 | 子作業（MINI06）: 1台時の時刻・順序・再接続の通信評価入力を定義する | 未着手 | — |
| MINI06-05 | 子作業（MINI06）: 2台中1台喪失時の共同確定停止ケースを定義する | 未着手 | — |
| MINI06-06 | 子作業（MINI06）: 4台の過半数・少数側停止と再接続のケースを定義する | 未着手 | — |
| MINI05-01 | 子作業（MINI05）: 単独nodeのSensor・World・Input・Gameの責任を割り当てる | 未着手 | — |
| MINI05-02 | 子作業（MINI05）: Display・保存・停止までの単独利用シーケンスを定義する | 未着手 | — |
| MINI05-03 | 子作業（MINI05）: 候補基板と必要ドライバーの対応・不足を整理する | 未着手 | — |
| MINI05-04 | 子作業（MINI05）: 再現buildと起動失敗・保存復旧の記録要件を定義する | 未着手 | — |
| MINI05-05 | 子作業（MINI05）: OS停止と独立Safety MCU遮断の経路を分ける | 未着手 | — |
| MINI05-06 | 子作業（MINI05）: stub・実Sensor・R5実基板を分けた最小boot受入表を作る | 未着手 | — |
| MINI04-01 | 子作業（MINI04）: 裸眼・通常室内・周囲空間の要求を評価項目へ対応付ける | 未着手 | — |
| MINI04-02 | 子作業（MINI04）: 表示媒体・視域・光路の方式比較欄を作る | 未着手 | — |
| MINI04-03 | 子作業（MINI04）: 表示電力と200mm収納の必要入力を機構側へ渡す表にする | 未着手 | — |
| MINI04-04 | 子作業（MINI04）: 有効領域・明るさ・視域の測定方法を指定する | 未着手 | — |
| MINI04-05 | 子作業（MINI04）: 光学試験の専門レビュー・開始条件・中止条件を整理する | 未着手 | — |
| MINI04-06 | 子作業（MINI04）: 2D fallbackと裸眼表示受入を別の証拠欄に分ける | 未着手 | — |
| MINI03-01 | 子作業（MINI03）: 単体深度方式と候補センサーの観測範囲を比較する | 未着手 | — |
| MINI03-02 | 子作業（MINI03）: 床置き・台上・着座の入力評価シーンを定義する | 未着手 | — |
| MINI03-03 | 子作業（MINI03）: 遮蔽・交差・複数人の欠落ケースを定義する | 未着手 | — |
| MINI03-04 | 子作業（MINI03）: 基準器・時刻・座標と誤差計算の記録形式を決める | 未着手 | — |
| MINI03-05 | 子作業（MINI03）: 精度目標の未決値と決定に必要な入力を整理する | 未着手 | — |
| MINI03-06 | 子作業（MINI03）: R5単体測定と旧pose fixtureを分離した受入表を作る | 未着手 | — |
| MINI02-01 | 子作業（MINI02）: 候補部品の寸法・出典・未選定範囲を包絡表へ整理する | 未着手 | — |
| MINI02-02 | 子作業（MINI02）: 脚・配線・工具空間の共通座標と干渉確認区画を定義する | 未着手 | — |
| MINI02-03 | 子作業（MINI02）: 全使用姿勢で200mmを判定する寸法鎖と測定図を指定する | 未着手 | — |
| MINI02-04 | 子作業（MINI02）: 重心・滑り・転倒の評価条件と判定者を整理する | 未着手 | — |
| MINI02-05 | 子作業（MINI02）: 未選定光学方式が外径・台座へ与える制約を切り出す | 未着手 | — |
| MINI02-06 | 子作業（MINI02）: 分解保守の確認項目と加工図へ移行できない条件をまとめる | 未着手 | — |
| MINI01-01 | 子作業（MINI01）: R5のREQ01〜12と根拠章を要求台帳へ転記する | 未着手 | — |
| MINI01-02 | 子作業（MINI01）: OPEN01〜08の必要入力と閉じ方を分ける | 未着手 | — |
| MINI01-03 | 子作業（MINI01）: R5要求と受入試験IDを対応付ける | 未着手 | — |
| MINI01-04 | 子作業（MINI01）: 要求・未決・試験の主担当をM1〜M7とOSへ割り当てる | 未着手 | — |
| MINI01-05 | 子作業（MINI01）: 1本自律・200mm・同型増設・Pro任意の境界を照合する | 未着手 | — |
| MINI01-06 | 子作業（MINI01）: 要求追跡の欠落とMAT15全体受入との差分をまとめる | 未着手 | — |
| ORG01 | 製品・Skyのsi自動化チーム単位からソース、設計、担当作業へ進めるプロジェクト別入口を整備 | 完了 | [記録](PROJECTS.md) · [記録](README.md) · [記録](docs/rockstaros-product-system-map.md) · [記録](docs/workstreams/README.md) · [記録](scripts/check-sky.mjs) |
| ORG02 | avokado Mission ControlでRockstarOS・Mini・Pro・rocketstarを32部隊へ分け、Goal・進捗段階・rule・依存・証拠・次の作業を正本化 | 完了 | [記録](docs/mission-control.md) · [記録](data/mission-control.json) · [記録](scripts/check-mission-control.mjs) · [記録](PROJECTS.md) |
| MAT14 | R5統合基本設計・PDF/Word・図面8組・計算・参考資料を欠落なく保存し、現行入口と履歴を整理（製造承認保留） | 完了 | [記録](docs/avocado-mini-r5/README.md) · [記録](docs/avocado-mini-r5/package/package_manifest.json) · [記録](docs/avocado-mini-r5/verification.json) · [記録](scripts/verify-avocado-r5-package.py) |
| MAT15 | R5単体の裸眼空間表示・安全・精密3D入力を成立させ、収納/熱/電源/確定回路/加工図と実機受入を閉じる | 進行中 | [記録](docs/avocado-mini-r5/package/integrated_design.md) · [記録](docs/avocado-mini-cellular.md) · [記録](data/avocado-mini-cellular.json) |
| UXCHAR01 | Sky/Zemaの共通キャラアイコンとクリック詳細（役割・現在状態・会話内成果） | 完了 | [記録](components/tool-character.tsx) · [記録](components/tool-character.module.css) · [記録](docs/workstreams/01-product-ux.md) |
| SKY20 | Sky公開・Telegram配布を証拠付きverified Packageへ限定し、失効と利用イベント再送を受け入れる | 進行中 | [記録](drizzle-legacy/post-site-bridge/0016_red_crusher_hogan.sql) · [記録](lib/sky-tool-review.ts) · [記録](lib/sky-review-auth.ts) · [記録](app/api/sky/tool-reviews/route.ts) · [記録](lib/sky-tool-package-store.ts) · [記録](lib/sky-activation.ts) · [記録](lib/sky-tool-events.ts) · [記録](toolkits/sky-tool-sdk/src/index.mjs) · [記録](tests/sky-tool-package.test.mjs) · [記録](tests/sky-activation.test.mjs) · [記録](tests/sky-tool-sdk.test.mjs) · [記録](docs/sky-tool-sdk.md) · [記録](lib/sky-code-store.ts) · [記録](lib/sky-code-security.ts) · [記録](components/sky-code-timeline.tsx) · [記録](docs/evidence/sky-code-timeline.json) |
| SKY19 | 親タスク: SkyへToolチーム入口を統合し利益連動成功報酬・Wallet決済・開発者還元を設計（率・月上限等確認中、未実装） | 進行中 | [記録](docs/sky-network-economy.md) · [記録](docs/sky-billing.md) |
| GRID01 | Sky Compute Gridで未使用Androidの余剰計算を固定lotへmatchingし、検証後だけ精算候補にする | 進行中 | [記録](docs/sky-compute-grid.md) · [記録](contracts/sky-compute-grid.json) · [記録](contracts/sky-compute-grid-fixture.json) · [記録](lib/sky-compute-grid.ts) · [記録](tests/sky-compute-grid.test.mjs) · [記録](app/sky/compute-grid/page.tsx) · [記録](app/api/sky/compute-grid/demo/route.ts) · [記録](docs/evidence/amc/grid01-host-fixture.md) |
| DOC01 | RockstarOS本体・Sky／Zema・全ready／candidate Tool・Material Inventionの詳細設計入口と被覆監査を正本化 | 完了 | [記録](docs/rockstaros-design-portal.md) · [記録](docs/rockstaros-complete-design.md) · [記録](docs/sky-tools-complete-design.md) · [記録](data/design-document-index.json) · [記録](scripts/check-design-document-index.mjs) |
| DOC02 | RockstarOS設計書完全版v1.0の原本PDF・全文抽出・完全性記録・設計索引をGit正本へ保存 | 完了 | [記録](docs/rockstaros-complete-design-v1.0.pdf) · [記録](docs/rockstaros-complete-design-v1.0.txt) · [記録](data/rockstaros-complete-design-v1.0.json) · [記録](docs/rockstaros-design-portal.md) · [記録](data/design-document-index.json) · [記録](scripts/check-design-document-index.mjs) |
| DOC03 | rocketstar R1.0・衛星・OS付録・ボタン・生成元・旧版を原本と照合し、設計アーカイブと索引へ保存（製造/飛行未認定） | 完了 | [記録](docs/rocketstar-design/README.md) · [記録](docs/rocketstar-design/inventory.json) · [記録](docs/rocketstar-design/verification.json) · [記録](scripts/verify-rocketstar-archive.py) · [記録](data/design-document-index.json) |
| DOC04 | avokado READMEをR5端末・RockstarOS v1.0現行OS・rocketstar R1.0現行ロケット・事業・機能・全設計書の入口へ刷新 | 完了 | [記録](README.md) · [記録](docs/brand/avokado/avokado-r5-editorial-hero.png) · [記録](docs/brand/avokado/avokado-motion-v2.gif) · [記録](docs/brand/avokado/avokado-system-map.svg) · [記録](data/design-document-index.json) · [記録](docs/avocado-mini-r5/package/package_manifest.json) · [記録](docs/rockstaros-complete-design-v1.0.pdf) · [記録](docs/rocketstar-design/outputs/rocketstar_Complete_Design_R1_0/rocketstar_Complete_Design_R1_0.pdf) · [記録](docs/service-design/README.md) · [記録](docs/evidence/service-design-rebuild.json) · [記録](docs/service-design/06-consistency-contracts.md) · [記録](data/product-terminology.json) |
| AI01 | RQ48をAstraで詳細設計しSolの独立監査を反映（設計のみ、runtime完了ではない） | 完了 | [記録](docs/product-baseline.md) · [記録](docs/ai-native-os-architecture.md) · [記録](docs/ai-native-os-design-audit.md) |
| AI02 | 親タスク: モデルmanifest・仕事への版固定・互換更新を実装し、2候補交換／旧仕事再開を段階受入 | 進行中 | [記録](docs/ai-native-os-architecture.md) · [記録](docs/avokado-llm-pretraining.md) · [記録](docs/evidence/avokado-llm-pretraining.json) · [記録](toolkits/avokado-llm/train.py) · [記録](toolkits/avokado-llm/test_pretraining.py) · [記録](android/core/src/main/java/dev/rock/core/platform/RuntimeManifest.java) · [記録](android/core/src/main/java/dev/rock/core/platform/ModelProfileManifest.java) · [記録](android/core/src/main/java/dev/rock/core/platform/TrustedModelPublisherVerifier.java) · [記録](android/core/src/main/java/dev/rock/core/platform/TrustedModelArtifactPipeline.java) · [記録](android/core/src/main/java/dev/rock/core/platform/ResumableModelArtifactStager.java) · [記録](android/core/src/main/java/dev/rock/core/platform/PlatformStore.java) · [記録](android/core/src/main/java/dev/rock/core/Engine.java) · [記録](android/core/src/test/java/dev/rock/core/PlatformStoreTest.java) · [記録](android/core/src/test/java/dev/rock/core/EngineTest.java) · [記録](android/core/src/test/java/dev/rock/core/platform/TrustedModelPublisherVerifierTest.java) · [記録](android/core/src/test/java/dev/rock/core/platform/ResumableModelArtifactStagerTest.java) · [記録](android/automation/src/main/java/dev/rock/automation/LocalAiConnection.java) · [記録](android/automation/src/main/java/dev/rock/automation/ZemaOrchestrator.java) · [記録](contracts/local-ai-runtime.json) · [記録](os/physical/local-ai-profile-v3.patch) · [記録](docs/evidence/local-ai-profile-v3-validation-20261001.json) · [記録](docs/evidence/ai02-core-java-validation-20261001.json) · [記録](android/local-ai-api/src/main/aidl/dev/rock/localai/ILocalAiService.aidl) · [記録](os/physical/local-ai-model-handoff-v4.patch) · [記録](docs/evidence/local-ai-model-handoff-v4-validation-20261001.json) · [記録](android/automation/src/main/java/dev/rock/automation/ModelProfileActivationCoordinator.java) · [記録](android/automation/src/main/java/dev/rock/automation/ModelProfileOperationLock.java) · [記録](scripts/check-os-contracts.mjs) · [記録](docs/evidence/pr-consolidation-20261005.json) |
| AI03 | モデル非依存の限定記憶・project分離・根拠・削除契約を実装し、projection更新を受入 | 進行中 | [記録](docs/ai-native-os-architecture.md) · [記録](docs/ai-memory-architecture.md) · [記録](systems/rock-star-os/src/blackberryrock/memory_store.py) · [記録](systems/rock-star-os/src/blackberryrock/memory_access.py) · [記録](systems/rock-star-os/tests/test_memory_store.py) · [記録](systems/rock-star-os/tests/test_memory_access.py) · [記録](docs/evidence/ai03-canonical-memory-store-20261001.json) · [記録](docs/evidence/pr-consolidation-20261005.json) |
| AI04 | 親タスク: 1.0のpure Tool境界を維持し、外部作用のoperation key・結果不明照合・crash復旧を拡張実装 | 進行中 | [記録](docs/ai-native-os-architecture.md) · [記録](docs/evidence/pr-consolidation-20261005.json) · [記録](android/core/src/main/java/dev/rock/core/ExternalWriteOutbox.java) · [記録](android/core/src/test/java/dev/rock/core/ExternalWriteOutboxTest.java) · [記録](systems/rock-star-os/tests/test_os_runner_control.py) |
| AI05 | Sky app／OSの能力宣言と単一実行端末固定を実装し、多端末移管は独立拡張として受入 | 進行中 | [記録](docs/ai-native-os-architecture.md) · [記録](contracts/compute-device-capabilities.json) · [記録](systems/rock-star-os/os/ai_routes/policy.py) · [記録](systems/rock-star-os/os/ai_routes/store.py) · [記録](contracts/device-capability-snapshot.json) · [記録](android/automation/src/main/java/dev/rock/automation/DeviceCapabilitySnapshot.java) · [記録](android/automation/src/main/java/dev/rock/automation/LocalAiConnection.java) · [記録](android/automation/src/main/java/dev/rock/automation/RockShellService.java) · [記録](android/automation/src/main/java/dev/rock/automation/ZemaOrchestrator.java) · [記録](android/shell/src/main/java/dev/rock/shell/MainActivity.java) · [記録](systems/rock-star-os/os/ai_routes/tests/test_policy_budget.py) · [記録](docs/evidence/pr-consolidation-20261005.json) |
| AI06 | 非金融Game／IP fixtureを共通仕事・限定記憶・Zema進捗へ接続（Fund完成に非依存） | 進行中 | [記録](docs/ai-native-os-architecture.md) · [記録](docs/mini-game-client.md) · [記録](toolkits/mini-game-client/client.mjs) · [記録](tests/mini-game-client.test.mjs) · [記録](docs/evidence/pr-consolidation-20261005.json) · [記録](lib/game-sandbox.ts) · [記録](tests/game-sandbox.test.mjs) |
| AI08 | Jev／TypeSafe・Local Qwen・Cloud LLMをcode主導で統合するDecision Fabric全体詳細設計と機械可読安全契約を固定 | 完了 | [記録](docs/jev-local-qwen-decision-fabric-design.md) · [記録](contracts/decision-provider.json) · [記録](data/decision-fabric-policy.json) |
| AI07 | JevのSky明示利用を設計し、DecisionProviderとRouter／Harnessへの統合を受け入れる | 進行中 | [記録](docs/prompts/jev-typesafe-local-qwen-handoff-20260918.md) · [記録](docs/jev-local-qwen-decision-fabric-design.md) · [記録](contracts/decision-provider.json) · [記録](data/decision-fabric-policy.json) · [記録](docs/jev-ecosystem-integration-design.md) · [記録](docs/ai-native-os-architecture.md) · [記録](docs/llm-evaluation-architecture.md) · [記録](data/llm-capabilities.json) · [記録](scripts/check-llm-architecture.mjs) |
| MAT01 | RQ49 Material Invention Coreのentity・発明loop・安全境界を設計へ固定 | 完了 | [記録](docs/product-baseline.md) · [記録](data/product-baseline.json) · [記録](docs/material-invention-core.md) |
| MAT02 | 二物質・複数比率・工程条件のsandbox候補graphとfail-closed安全検査を実装 | 完了 | [記録](contracts/material-invention.json) · [記録](contracts/material-invention-fixture.json) · [記録](lib/material-invention.ts) · [記録](tests/material-invention.test.mjs) · [記録](docs/material-invention-core.md) · [記録](docs/validation.md) |
| MAT03 | Material Invention CoreをZemaの仕事・限定記憶・simulation／外部ラボProviderへ接続して独立受入 | 進行中 | [記録](docs/material-invention-core.md) · [記録](lib/material-study.ts) · [記録](app/api/material-invention/route.ts) · [記録](components/material-invention-workspace.tsx) · [記録](tests/material-study.test.mjs) · [記録](components/use-pending-save-navigation.ts) · [記録](tests/material-workspace-recovery.test.mjs) · [記録](tests/pending-save-navigation.test.mjs) · [記録](lib/owner-intent.ts) · [記録](tests/owner-intent-route.test.mjs) |
| MAT04 | Material Invention Coreの標準体験としてavocadoMiniの四方向sensor・hand操作・再計算・Patent si設計を固定 | 完了 | [記録](docs/material-invention-xr.md) · [記録](docs/avocado-mini-spatial-invention.md) · [記録](docs/avocado-mini-hardware-design.md) · [記録](docs/assets/rockstaros-spatial-table-v1.png) · [記録](docs/assets/rockstaros-spatial-table-full-scale-v2.png) · [記録](docs/assets/avocado-mini-hardware-00-overview.png) · [記録](docs/assets/avocado-mini-hardware-01-sensor-pod-exploded.png) · [記録](docs/assets/avocado-mini-hardware-02-chassis-exploded.png) · [記録](docs/assets/avocado-mini-hardware-03-power-control-haptic.png) · [記録](docs/assets/avocado-mini-hardware-00-overview-v2.png) · [記録](docs/assets/avocado-mini-hardware-01-sensor-pod-exploded-v2.png) · [記録](docs/assets/avocado-mini-hardware-02-chassis-exploded-v2.png) · [記録](docs/assets/avocado-mini-hardware-03-power-control-haptic-v2.png) · [記録](docs/assets/avocado-mini-hardware-00-overview-v3-silver-tube.png) · [記録](docs/assets/avocado-mini-hardware-01-sensor-pod-v3-silver-tube.png) · [記録](docs/assets/avocado-mini-hardware-02-chassis-v3-silver-tube.png) · [記録](docs/assets/avocado-mini-hardware-00-overview-v4-thin-tube.png) · [記録](docs/assets/avocado-mini-hardware-01-sensor-pod-v4-thin-tube.png) · [記録](docs/assets/avocado-mini-hardware-02-chassis-v4-thin-tube.png) · [記録](data/material-invention-xr-policy.json) · [記録](contracts/material-invention-xr.json) · [記録](contracts/avocado-mini-spatial-interaction.json) |
| MAT05 | Core graphから決定的XR sceneを生成し、四方向pose fixtureのconnect／separate／stale拒否を実装 | 未着手 | [記録](docs/avocado-mini-spatial-invention.md) |
| MAT06 | avocadoMini四方向Bench／Full-scale prototypeとMaterial Core→Patent si provenance bridgeを独立受入 | 未着手 | [記録](docs/avocado-mini-spatial-invention.md) |
| MAT07 | 誰でも全体像から担当作業へ合流できるavocadoMini統合完成設計書と全体構成を正本化 | 完了 | [記録](docs/rockstaros-avocado-mini-complete-design.md) · [記録](docs/workstreams/11-material-invention-avocado-mini.md) · [記録](docs/system-composition.md) · [記録](data/system-composition-audit.json) · [記録](docs/ai-native-os-architecture.md) · [記録](docs/rockstaros-1.0-architecture.md) |
| MAT08 | 履歴／R5で退役した構成: Mini200 E1のゲーム中心・生活拡張・衛星通信方針と20cm本体・音声をREADME・図・参照モデルへ保存（実機未受入） | 完了 | [記録](https://github.com/k999ln/rock/blob/96845e6006c15e39ba5b45495f79c21bdff7399e/docs/avocado-mini-mini200-e1/README.md) · [記録](https://github.com/k999ln/rock/blob/96845e6006c15e39ba5b45495f79c21bdff7399e/docs/avocado-mini-mini200-e1/design.md) · [記録](https://github.com/k999ln/rock/blob/96845e6006c15e39ba5b45495f79c21bdff7399e/docs/avocado-mini-mini200-e1/engineering/verify_all.py) · [記録](https://github.com/k999ln/rock/blob/96845e6006c15e39ba5b45495f79c21bdff7399e/docs/avocado-mini-mini200-e1/verification.json) · [記録](docs/avocado-mini-r5/README.md) |
| MAT09 | Mini200 E1専用入力profile・Core adapter・ゲーム／ASR／console OSと20cm実機を独立受入 | 未着手 | [記録](https://github.com/k999ln/rock/blob/96845e6006c15e39ba5b45495f79c21bdff7399e/docs/avocado-mini-mini200-e1/README.md) · [記録](docs/avocado-mini-r5/README.md) |
| MAT10 | 履歴／R5で退役した構成: Mini200 E2資料と利用者確定の4本＋中央Core外観をGit正本と公開製品Siteへ同期（実機未受入） | 完了 | [記録](https://github.com/k999ln/rock/blob/96845e6006c15e39ba5b45495f79c21bdff7399e/docs/avocado-mini-mini200-e2/README.md) · [記録](docs/product-baseline.md) · [記録](sites/avocado-mini/src/pages/index.astro) |
| MAT11 | 4本のMotion Towerと中央Mini200 E2 Coreの統合engineering package・prototype・実機受入 | 未着手 | [記録](https://github.com/k999ln/rock/blob/96845e6006c15e39ba5b45495f79c21bdff7399e/docs/avocado-mini-mini200-e2/README.md) |
| MAT12 | 履歴／R5で退役した構成: Tower20 E3資料を当時のavocadoMini基準へ固定し、4本の固定200mm塔＋別筐体Edge HubをGit正本と公開Siteへ同期（実機未受入） | 完了 | [記録](https://github.com/k999ln/rock/blob/96845e6006c15e39ba5b45495f79c21bdff7399e/docs/avocado-mini-tower20-e3/README.md) · [記録](docs/product-baseline.md) · [記録](sites/avocado-mini/src/pages/index.astro) · [記録](sites/avocado-mini/public/images/tower20-e3-highlight-sensor-v2.png) · [記録](sites/avocado-mini/public/images/tower20-e3-highlight-200mm-v1.png) · [記録](sites/avocado-mini/public/images/tower20-e3-highlight-footprint-v1.png) · [記録](sites/avocado-mini/public/images/tower20-e3-highlight-edge-hub-v1.png) · [記録](sites/avocado-mini/public/images/tower20-e3-front-cutout-v1.png) · [記録](sites/avocado-mini/public/images/tower20-e3-side-cutout-v1.png) · [記録](sites/avocado-mini/public/images/tower20-e3-rear-cutout-v1.png) · [記録](sites/avocado-mini/src/main.js) · [記録](sites/avocado-mini/src/style.css) |
| MAT13 | Tower20 E3の確定CAD・配線・4camera同期・光学・転倒／滑り・熱・電源・音響・OS image・復旧を同一試作機で受入 | 未着手 | [記録](https://github.com/k999ln/rock/blob/96845e6006c15e39ba5b45495f79c21bdff7399e/docs/avocado-mini-tower20-e3/README.md) |
| SKY01 | 旧名称をSkyへ全面改称し、選択・許可・実行先・停止・結果を一つにする価値と収録ツールを可視化 | 完了 | [記録](docs/sky.md) · [記録](components/sky-workspace.tsx) · [記録](scripts/check-sky.mjs) |
| SKY02 | ToB向け簡易掲載フォーム・審査キューとToC向けSky Timelineを実装 | 完了 | [記録](app/sky/publish/page.tsx) · [記録](components/sky-publisher-form.tsx) · [記録](app/api/sky/submissions/route.ts) · [記録](tests/sky-submission.test.mjs) |
| SKY03 | MCP接続・周辺先行技術を調査し、特許出願可能性を高める技術設計を保存 | 完了 | [記録](docs/sky-mcp-architecture.md) · [記録](systems/rock-star-os/docs/MCP-HUB-INTEGRATION.md) |
| SKY04 | tob無料のConnection Passport・実行契約・ToB/ToC貢献分配を一画面で説明するSky Networkフロント | 完了 | [記録](app/sky/network/page.tsx) · [記録](components/sky-network.tsx) · [記録](components/sky-network.module.css) · [記録](docs/sky-network-economy.md) · [記録](scripts/check-product-baseline.mjs) · [記録](tests/product-baseline.test.mjs) |
| SKY05 | Sky画面のsidebarを廃止し、MCP接続・管理とToB掲載をSky本体の操作面へ統合 | 完了 | [記録](components/sky-workspace.tsx) · [記録](components/sky-mcp-center.tsx) · [記録](components/sky-mcp-center.module.css) · [記録](components/sky-publisher-form.tsx) · [記録](components/workspace-shell.tsx) · [記録](app/sky/network/page.tsx) · [記録](app/sky/publish/page.tsx) |
| SKY06 | Sky内MCPを実在するPC接続・既存4自動化・3ステップ導入画面へ統合 | 完了 | [記録](components/sky-mcp-center.tsx) · [記録](components/device-connection.tsx) · [記録](tests/sky-mcp-onboarding.test.mjs) · [記録](scripts/verify-mcp-flow.mjs) |
| SKY07 | 親タスク: MCPごとにこのPC・Sky Cloud・提供者MCPの接続先を選び、対応先へワンタップ接続する | 進行中 | [記録](components/sky-mcp-center.tsx) · [記録](components/sky-mcp-center.module.css) · [記録](lib/mcp-hub.ts) · [記録](toolkits/sky-mcp-connector/server.mjs) · [記録](scripts/package-sky-mcp.py) · [記録](public/toolkits/sky-mcp-connector.zip) · [記録](docs/sky-mcp-connector.md) · [記録](tests/mcp-connector.test.mjs) · [記録](tests/sky-mcp-onboarding.test.mjs) · [記録](docs/product-baseline.md) · [記録](tests/sky-mcp-center-recovery.test.mjs) · [記録](docs/evidence/integrated-development-20261011.json) · [記録](components/sky-chat-workspace.tsx) · [記録](tests/sky-chat-mcp-recovery.test.mjs) |
| SKY08 | 黒基調の改善版SkyへFashion Brand Opsを統合し、スマホDialogの画面外ずれを修正 | 完了 | [記録](app/sky/network/page.tsx) · [記録](components/sky-network.tsx) · [記録](components/sky-network.module.css) · [記録](docs/sky-network-economy.md) · [記録](scripts/check-product-baseline.mjs) · [記録](tests/product-baseline.test.mjs) · [記録](components/sky-workspace.tsx) · [記録](components/fashion-brand-ops-runner.tsx) · [記録](app/workspace.css) · [記録](scripts/check-sky.mjs) · [記録](lib/sky-routing.ts) · [記録](tests/sky-routing.test.mjs) · [記録](docs/sky-assistant-and-memory.md) |
| SKY09 | Skyの商品カード1回でFashion Brand Ops MCPを初期化し、38操作と接続状態を同期 | 完了 | [記録](components/sky-workspace.tsx) · [記録](app/api/sky/connections/route.ts) · [記録](docs/sky-identity-connection.md) |
| SKY10 | Skyをアプリ選択と接続へ絞り、Chatを依頼・状況・結果の受取画面として分離 | 完了 | [記録](components/sky-workspace.tsx) · [記録](components/sky-chat-workspace.tsx) · [記録](components/workspace-shell.tsx) · [記録](app/chat/page.tsx) · [記録](https://github.com/k999ln/rock/blob/96845e6006c15e39ba5b45495f79c21bdff7399e/app/polymarket/page.tsx) · [記録](docs/workstreams/01-product-ux.md) · [記録](README.md) |
| SKY11 | MCP掲載前診断とPC接続の互換性・初回導線を改善 | 完了 | [記録](lib/mcp-inspection.ts) · [記録](app/api/sky/mcp/inspect/route.ts) · [記録](lib/device.ts) · [記録](components/sky-publisher-form.tsx) · [記録](components/device-connection.tsx) · [記録](tests/mcp-inspection.test.mjs) · [記録](tests/device-lifecycle.test.mjs) |
| SKY12 | ChatをSky Auto既定の一画面へ整理し、事前のアプリ選択を任意化 | 完了 | [記録](components/sky-chat-workspace.tsx) · [記録](app/workspace.css) · [記録](docs/sky-identity-connection.md) |
| SKY13 | GrokをモチーフにChatの表示・入力を改善し、依頼から実行・結果までを会話内へ統合 | 完了 | [記録](components/sky-chat-workspace.tsx) · [記録](components/mr-tool-runner.tsx) · [記録](app/workspace.css) · [記録](lib/operations.ts) · [記録](tests/operations.test.mjs) · [記録](docs/chat-usability-20260912.md) · [記録](docs/workstreams/01-product-ux.md) · [記録](README.md) |
| SKY14 | 接続済みready商品と任意MCPをChatのbotとして表示し、方向修正・承認実行・結果・停止を一元管理 | 完了 | [記録](components/sky-chat-workspace.tsx) · [記録](components/mcp-bot-runner.tsx) · [記録](lib/mcp-hub.ts) · [記録](toolkits/sky-mcp-connector/server.mjs) · [記録](tests/mcp-connector.test.mjs) · [記録](docs/chat-mcp-control-room-20260913.md) |
| SKY15 | Sky SDKコードを既存ツールへ追加し、起動時にPackage登録・MCP公開・利用記録まで行うStudioを実装 | 完了 | [記録](components/rock-studio.tsx) · [記録](toolkits/sky-tool-sdk/src/index.mjs) · [記録](app/studio/page.tsx) · [記録](app/sky/publish/page.tsx) · [記録](tests/sky-code-intake.test.mjs) · [記録](tests/sky-studio-chat.test.mjs) · [記録](docs/sky-tool-sdk.md) |
| SKY16 | SkyのTool選択と自然文依頼をZemaへ一回引き継ぎ、job状態を即時同期 | 完了 | [記録](lib/sky-zema-handoff.ts) · [記録](lib/operations-client.ts) · [記録](components/sky-workspace.tsx) · [記録](components/sky-chat-workspace.tsx) · [記録](components/chat-live-progress.tsx) · [記録](tests/sky-zema-handoff.test.mjs) · [記録](tests/web-route-style-contract.test.mjs) · [記録](docs/sky.md) |
| SKY17 | Jev Ultrafastを権限制御されたbrowser agent候補としてSky catalogと全Tool設計へ追加 | 完了 | [記録](lib/catalog.ts) · [記録](docs/jev-ultrafast-integration-design.md) · [記録](docs/sky-tools-complete-design.md) · [記録](data/design-document-index.json) · [記録](scripts/check-design-document-index.mjs) |
| SKY18 | Jev ecosystem 10 repositoryを判断・browser・PC・mobile・review・routing・PAPER市場・referenceへ分離して候補登録 | 完了 | [記録](lib/catalog.ts) · [記録](docs/jev-ecosystem-integration-design.md) · [記録](docs/jev-ultrafast-integration-design.md) · [記録](docs/sky-tools-complete-design.md) · [記録](data/design-document-index.json) · [記録](scripts/check-design-document-index.mjs) · [記録](scripts/check-sky.mjs) |
| WEB02 | Developer Preview紹介をOSインストールとSky開発者コード中心の一画面へ再設計 | 完了 | [記録](app/rockstaros/page.tsx) · [記録](app/rockstaros/preview.module.css) · [記録](docs/product-baseline.md) |
| WEB03 | Developer Preview紹介とRock Studioを共通の黒・黄緑visual systemへ統一 | 完了 | [記録](app/rockstaros/page.tsx) · [記録](components/rock-studio.tsx) · [記録](app/workspace.css) · [記録](docs/product-baseline.md) |
| WEB04 | RockstarOS全体のvisual systemを統一し、主要フロントの機能性を改善 | 完了 | [記録](components/home-screen.tsx) · [記録](components/home-screen.module.css) · [記録](components/workspace-shell.tsx) · [記録](app/workspace.css) · [記録](tsconfig.json) · [記録](tests/web-route-style-contract.test.mjs) · [記録](docs/frontend-usability-audit-20260915.md) · [記録](docs/product-baseline.md) · [記録](scripts/amc-autonomy-store.mjs) · [記録](tests/amc-autonomy-store-read.test.mjs) · [記録](scripts/amc-parallel.mjs) · [記録](tests/amc-workspace-snapshot.test.mjs) · [記録](docs/evidence/spider-workspace-snapshot-read.json) |
| BRD01 | 正式製品名をRockstarOS、内部識別子をdev.rockで固定 | 完了 | [記録](data/product-baseline.json) · [記録](docs/product-baseline.md) · [記録](app/layout.tsx) · [記録](app/manifest.ts) · [記録](components/home-screen.tsx) · [記録](android/automation/src/main/java/dev/rock/automation/ApprovalActivity.java) · [記録](tests/product-baseline.test.mjs) |
| WEB05 | avocadoMiniの製品紹介と回転ツアーをP0.2設計書と黒い製品写真のデザインへ統一 | 完了 | [記録](README.md) · [記録](docs/assets/avocado-mini-hardware-00-overview-v4-thin-tube.png) · [記録](docs/assets/rockstaros-spatial-table-full-scale-v2.png) · [記録](sites/avocado-mini/src/pages/index.astro) · [記録](sites/avocado-mini/src/pages/guide/index.astro) · [記録](sites/avocado-mini/src/main.js) · [記録](sites/avocado-mini/src/style.css) · [記録](sites/avocado-mini/src/tower-scene.js) · [記録](sites/avocado-mini/tests/astro-build.test.mjs) · [記録](sites/avocado-mini/public/images/avocado-mini-hero.png) · [記録](sites/avocado-mini/public/images/avocado-mini-detail.png) · [記録](sites/avocado-mini/public/images/motion-tower-satin-front-concept.png) · [記録](sites/avocado-mini/public/images/motion-tower-satin-side-concept.png) · [記録](sites/avocado-mini/public/images/motion-tower-satin-rear-concept.png) · [記録](sites/avocado-mini/public/images/motion-tower-satin-sensor-macro.png) · [記録](sites/avocado-mini/public/images/motion-tower-satin-four-point.png) · [記録](sites/avocado-mini/public/images/avocado-mini-kit.png) · [記録](sites/avocado-mini/public/images/avocado-mini-head-p0.png) · [記録](sites/avocado-mini/public/images/avocado-mini-base-p0.png) · [記録](docs/workstreams/05-web-pwa-sites.md) · [記録](app/rockstaros/page.tsx) · [記録](app/rockstaros/preview.module.css) · [記録](public/rockstaros/avocado-mini-concept.png) · [記録](docs/product-baseline.md) |
| WEB06 | GitHubと製品紹介から主要アプリへ進む入口を整え、既存Siteの一般公開と最新版同期を確認する | 進行中 | [記録](README.md) · [記録](app/rockstaros/page.tsx) · [記録](app/rockstaros/preview.module.css) · [記録](app/api/health/route.ts) · [記録](scripts/check-work-api.mjs) · [記録](docs/workstreams/05-web-pwa-sites.md) |
| WEB07 | 利用者の目的とsiの役割を先に伝える製品紹介へGitHub冒頭とWebページを改訂 | 完了 | [記録](README.md) · [記録](docs/assets/rockstaros-intro.gif) · [記録](docs/assets/cover-avocado-mini.gif) · [記録](docs/assets/cover-rockstaros.gif) · [記録](docs/assets/cover-sky.gif) · [記録](docs/assets/cover-zema.gif) · [記録](docs/assets/cover-material-studio.gif) · [記録](app/rockstaros/page.tsx) · [記録](app/rockstaros/preview.module.css) · [記録](docs/product-baseline.md) · [記録](data/product-baseline.json) |
| WEB09 | avocadoMiniクラファン企画を提示し、募集確定後に公開支援リンクを設置する | 進行中 | [記録](README.md) · [記録](docs/avocado-mini-crowdfunding.md) · [記録](app/rockstaros/crowdfunding/page.tsx) · [記録](docs/workstreams/05-web-pwa-sites.md) |
| WEB10 | 製品・OS導入ホームに各サービスの役割と利用範囲を示す入口を追加 | 完了 | [記録](app/rockstaros/page.tsx) · [記録](app/rockstaros/preview.module.css) · [記録](data/product-baseline.json) · [記録](scripts/check-product-baseline.mjs) · [記録](docs/product-baseline.md) · [記録](docs/workstreams/05-web-pwa-sites.md) |
| WEB11 | 製品構想モデルをスクロールで一周見せ、参考価格・購入準備中・OS導入へつなぐ | 完了 | [記録](https://github.com/k999ln/rock/blob/98a4898e9ea3bbafe276d3357d0a7bebf35eb6cb/components/avocado-turntable.tsx) · [記録](https://github.com/k999ln/rock/blob/98a4898e9ea3bbafe276d3357d0a7bebf35eb6cb/components/avocado-turntable.module.css) · [記録](app/rockstaros/page.tsx) · [記録](docs/product-baseline.md) |
| WEB12 | 利用者提供の伸縮式センサータワーを製品サイトとGitHubの主役にする | 完了 | [記録](public/rockstaros/avocado-mini-tower-concept.png) · [記録](https://github.com/k999ln/rock/blob/98a4898e9ea3bbafe276d3357d0a7bebf35eb6cb/components/avocado-turntable.tsx) · [記録](https://github.com/k999ln/rock/blob/98a4898e9ea3bbafe276d3357d0a7bebf35eb6cb/components/avocado-turntable.module.css) · [記録](app/rockstaros/page.tsx) · [記録](README.md) · [記録](docs/avocado-mini-hardware-design.md) |
| WEB13 | 旧URLをavocadoMini公開商品Siteへ転用し、OS操作画面を管理者限定の別Siteへ移す | 進行中 | [記録](sites/avocado-mini/src/pages/index.astro) · [記録](sites/avocado-mini/src/pages/guide/index.astro) · [記録](sites/avocado-mini/src/pages/crowdfunding/index.astro) · [記録](app/rockstaros/page.tsx) · [記録](app/rockstaros/guide/page.tsx) · [記録](https://github.com/k999ln/rock/blob/98a4898e9ea3bbafe276d3357d0a7bebf35eb6cb/components/avocado-turntable.tsx) · [記録](https://github.com/k999ln/rock/blob/98a4898e9ea3bbafe276d3357d0a7bebf35eb6cb/components/avocado-turntable.module.css) · [記録](README.md) · [記録](docs/workstreams/05-web-pwa-sites.md) · [記録](sites/avocado-mini/src/style.css) · [記録](sites/avocado-mini/src/main.js) · [記録](project.md) · [記録](sites/avocado-mini/src/pages/rockstaros/index.astro) · [記録](sites/avocado-mini/astro.config.mjs) · [記録](sites/avocado-mini/src/pages/rocket-star/index.astro) · [記録](sites/avocado-mini/rocket-star/main.js) · [記録](sites/avocado-mini/rocket-star/design.css) · [記録](sites/avocado-mini/scripts/build-rocketstar.mjs) · [記録](docs/evidence/rocketstar-site-r1.json) · [記録](https://github.com/k999ln/rock/blob/96845e6006c15e39ba5b45495f79c21bdff7399e/sites/avocado-mini/public/downloads/rocketstar-complete-design-r1.0.pdf) · [記録](https://github.com/k999ln/rock/blob/96845e6006c15e39ba5b45495f79c21bdff7399e/sites/avocado-mini/public/downloads/rocketstar-complete-design-r1.0.zip) · [記録](https://github.com/k999ln/rock/blob/96845e6006c15e39ba5b45495f79c21bdff7399e/sites/avocado-mini/public/rocket-star/design/index.html) · [記録](https://github.com/k999ln/rock/blob/96845e6006c15e39ba5b45495f79c21bdff7399e/sites/avocado-mini/public/rocket-star/design/source.md) |
| WEB14 | RockstarOS導入入口を製品ページへ置き、Pixel 10向け実インストーラーを配布・安全ゲート合格後に接続する | 進行中 | [記録](sites/avocado-mini/src/pages/index.astro) · [記録](sites/avocado-mini/src/style.css) · [記録](sites/avocado-mini/src/pages/install/index.astro) · [記録](sites/avocado-mini/astro.config.mjs) · [記録](data/android-first-flash-gate.json) · [記録](docs/workstreams/05-web-pwa-sites.md) |
| WEB15 | avocadoMiniの予約販売画面と決済バックエンドを用意し、販売条件確定後に全額決済を有効化する | 進行中 | [記録](sites/avocado-mini/src/pages/preorder/index.astro) · [記録](sites/avocado-mini/worker/index.js) · [記録](sites/avocado-mini/db/schema.ts) · [記録](sites/avocado-mini/tests/preorder.test.mjs) · [記録](docs/workstreams/05-web-pwa-sites.md) |
| WEB16 | 公開avocadoMini Siteを現行R5へ同期し、旧E3商品構成・価格を販売導線から撤去する | 完了 | [記録](sites/avocado-mini/src/pages/index.astro) · [記録](sites/avocado-mini/src/style.css) · [記録](sites/avocado-mini/src/pages/preorder/index.astro) · [記録](sites/avocado-mini/worker/index.js) · [記録](sites/avocado-mini/tests/preorder.test.mjs) · [記録](https://github.com/k999ln/rock/blob/96845e6006c15e39ba5b45495f79c21bdff7399e/sites/avocado-mini/public/downloads/avocadoMini-R5-integrated-design.pdf) · [記録](docs/evidence/avocado-mini-site-r5.json) · [記録](docs/workstreams/05-web-pwa-sites.md) · [記録](project.md) |
| WEB17 | 公開avocadoMini SiteをAstroへ移行し、承認済みデザイン・全route・Worker配布契約を維持する | 完了 | [記録](sites/avocado-mini/package.json) · [記録](sites/avocado-mini/astro.config.mjs) · [記録](sites/avocado-mini/src/pages/index.astro) · [記録](sites/avocado-mini/src/pages/rocket-star/index.astro) · [記録](sites/avocado-mini/src/pages/preorder/index.astro) · [記録](sites/avocado-mini/src/main.js) · [記録](sites/avocado-mini/worker/index.js) · [記録](sites/avocado-mini/tests/astro-build.test.mjs) · [記録](sites/avocado-mini/tests/preorder.test.mjs) · [記録](docs/workstreams/05-web-pwa-sites.md) · [記録](project.md) |
| WEB18 | 公開avocadoMini Siteの画像原本を保護し、表示・導線・アクセシビリティ・SEOの不具合を解消する | 完了 | [記録](sites/avocado-mini/src/pages/index.astro) · [記録](sites/avocado-mini/src/main.js) · [記録](sites/avocado-mini/src/style.css) · [記録](sites/avocado-mini/worker/index.js) · [記録](sites/avocado-mini/tests/astro-build.test.mjs) · [記録](sites/avocado-mini/tests/preorder.test.mjs) · [記録](sites/avocado-mini/public/robots.txt) · [記録](sites/avocado-mini/public/sitemap.xml) · [記録](docs/evidence/avocado-mini-site-r5.json) · [記録](docs/workstreams/05-web-pwa-sites.md) · [記録](project.md) |
| WEB19 | 履歴／R5で退役した構成: 利用者指定のTower20 E3公開Siteを承認済み画像・英語UI・180度演出ごとAstroで復元して本番配備する | 完了 | [記録](sites/avocado-mini/src/pages/index.astro) · [記録](sites/avocado-mini/src/main.js) · [記録](sites/avocado-mini/src/style.css) · [記録](sites/avocado-mini/tests/astro-build.test.mjs) · [記録](docs/evidence/avocado-mini-site-e3-restoration.json) · [記録](project.md) |
| BIZ01 | 無料配布の対象とOS従量課金の計量単位・単価・上限を確定する | 進行中 | [記録](README.md) · [記録](docs/product-baseline.md) · [記録](data/product-baseline.json) · [記録](docs/sky-billing.md) |
| VER01 | RockstarOS 1.0と将来の1.5／2.0版更新規則を一元管理 | 完了 | [記録](data/product-identity.json) · [記録](lib/product-identity.ts) · [記録](data/product-baseline.json) · [記録](docs/product-baseline.md) · [記録](components/workspace-shell.tsx) · [記録](components/system-settings.tsx) · [記録](app/rockstaros/guide/page.tsx) · [記録](tests/product-baseline.test.mjs) |
| WLT01 | Walletの受取予定・収益内訳・Receipt・精算ルールを一画面で確認できるフロントを実装 | 完了 | [記録](docs/wallet-front-design.md) · [記録](components/sky-billing.tsx) · [記録](components/operations-workspace.tsx) · [記録](app/workspace.css) |
| WLT02 | 本人別の残高・売上・経費・取消履歴をD1へ保存するWallet専用APIと操作画面を実装 | 完了 | [記録](app/api/wallet/route.ts) · [記録](components/wallet-workspace.tsx) · [記録](lib/operations.ts) · [記録](tests/wallet-backend.test.mjs) |
| WLT03 | Wallet／ファンド会社を交換可能な外部Providerとして受ける責任境界とadapter契約を固定 | 完了 | [記録](docs/external-wallet-fund-provider-boundary-20260913.md) · [記録](docs/product-baseline.md) · [記録](data/product-baseline.json) · [記録](scripts/check-product-baseline.mjs) · [記録](tests/product-baseline.test.mjs) · [記録](docs/validation.md) |
| WLT04 | Rock Settlement Walletを最初のProviderとして自社利用料のsandbox回収契約を実装 | 完了 | [記録](lib/financial-provider.ts) · [記録](tests/financial-provider.test.mjs) · [記録](docs/rock-first-party-settlement-wallet-20260913.md) · [記録](docs/external-wallet-fund-provider-boundary-20260913.md) · [記録](docs/product-baseline.md) · [記録](data/product-baseline.json) · [記録](docs/validation.md) |
| WLT05 | Base Mainnet USDCの所有確認付き受取先とfinalized着金照合を本番Wallet・Workerへ接続 | 完了 | [記録](components/rock-settlement-wallet.tsx) · [記録](lib/rock-wallet.ts) · [記録](services/sky-billing/src/worker.ts) · [記録](services/sky-billing/migrations/0004_rock_settlement_wallet.sql) · [記録](tests/rock-wallet.test.mjs) · [記録](tests/billing-worker.test.mjs) · [記録](docs/rock-wallet-production-rail-20260913.md) |
| WLT06 | owner受取Walletを本人署名で登録し、最初の実USDC回収をEarning Receiptへ照合 | 進行中 | [記録](docs/rock-wallet-production-rail-20260913.md) |
| MKT01 | あらゆる型付き価値を扱うPAPER市場とexact approval・risk・receipt・position台帳を実装 | 完了 | [記録](app/market/page.tsx) · [記録](app/api/market/route.ts) · [記録](components/everything-market.tsx) · [記録](lib/everything-market.ts) · [記録](lib/everything-market-store.ts) · [記録](drizzle-legacy/pre-site-bridge/0009_sad_giant_girl.sql) · [記録](tests/everything-market.test.mjs) · [記録](docs/everything-market-and-autonomous-fund-20260913.md) |
| MKT02 | Web PAPER市場のapproval・reservation・receipt・position関係をD1で強制 | 完了 | [記録](drizzle-legacy/pre-site-bridge/0012_marketplace_relation_guards.sql) · [記録](tests/everything-market.test.mjs) · [記録](scripts/check-web-schema.mjs) · [記録](docs/everything-market-and-autonomous-fund-20260913.md) · [記録](docs/data-storage-boundaries.md) |
| DB01 | 全データ境界・table・migration・本番readback状態を一つの監査レポートへ統合 | 完了 | [記録](scripts/database-status.mjs) · [記録](data/database-deployments.json) · [記録](data/database-status.json) · [記録](docs/database-status.md) · [記録](tests/database-status.test.mjs) |
| SPN01 | native Walletへsimulation/PAPER限定のValue/Spend台帳・exact approval・再照合を統合 | 完了 | [記録](systems/rock-star-os/src/blackberryrock/spend.py) · [記録](systems/rock-star-os/src/blackberryrock/wallet.py) · [記録](systems/rock-star-os/src/blackberryrock/hub_server.py) · [記録](systems/rock-star-os/tests/test_spend_runtime.py) · [記録](systems/rock-star-os/tests/test_hub_server.py) · [記録](docs/value-spend-runtime.md) |
| FND01 | ツールの検証済み純収益・実費・receipt・失敗から構成と観測利回りを30秒ごとに再計算 | 完了 | [記録](lib/automation-fund.ts) · [記録](lib/automation-fund-store.ts) · [記録](app/api/automation-funds/route.ts) · [記録](components/autonomous-fund-market.tsx) · [記録](tests/automation-fund.test.mjs) · [記録](docs/everything-market-and-autonomous-fund-20260913.md) |
| WEB01 | 主要画面のstyle契約と配備asset closureを検査し、GitHubと既存Sitesを同一commitへ固定 | 停止中: 一般公開の意思は確認済み。既存Sitesは現在の接続アカウントでAccess Denied／project_not_foundとなり、所有workspaceの接続なしでは公開設定変更、同一SHA配備とD1本番readbackを実行できない。 | [記録](tests/web-route-style-contract.test.mjs) · [記録](scripts/check-web-asset-closure.mjs) · [記録](tests/web-asset-closure.test.mjs) · [記録](app/workspace.css) · [記録](docs/product-baseline.md) · [記録](docs/evidence/launch/sites-owner-auth-blocker-20260915.json) · [記録](scripts/start-local-web.mjs) · [記録](scripts/local-wrangler.mjs) · [記録](scripts/spider-web-runtime.mjs) · [記録](tests/start-local-web.test.mjs) |
| HOME01 | iPhone着想のホーム、端末内カスタマイズ、OS運用設定アプリを実装 | 完了 | [記録](app/page.tsx) · [記録](app/sky/page.tsx) · [記録](components/home-screen.tsx) · [記録](components/home-screen.module.css) · [記録](app/settings/page.tsx) · [記録](components/system-settings.tsx) · [記録](components/system-settings.module.css) · [記録](docs/product-baseline.md) |
| HOME02 | Home以外の全画面へ直接Homeへ戻る導線を常設し、共通・独自レイアウトの回帰を防止 | 完了 | [記録](components/workspace-shell.tsx) · [記録](components/sky-chat-workspace.tsx) · [記録](components/system-settings.tsx) · [記録](components/system-maintenance.tsx) · [記録](app/fund/page.tsx) · [記録](app/fund/legacy/page.tsx) · [記録](app/rockstaros/page.tsx) · [記録](app/rockstaros/guide/page.tsx) · [記録](tests/web-route-style-contract.test.mjs) · [記録](docs/product-baseline.md) |
| SYS01 | 端末診断・暗号化設定バックアップ・復元・Web更新確認を設定へ実装 | 完了 | [記録](app/settings/system/page.tsx) · [記録](components/system-maintenance.tsx) · [記録](components/system-maintenance.module.css) · [記録](lib/system-backup.ts) · [記録](tests/system-backup.test.mjs) · [記録](docs/product-baseline.md) |
| SYS02 | 通知・保存保護・診断共有・安全な初期化と公開審査gateを設定へ実装 | 完了 | [記録](components/system-maintenance.tsx) · [記録](components/system-maintenance.module.css) · [記録](lib/system-backup.ts) · [記録](tests/system-backup.test.mjs) · [記録](docs/product-baseline.md) · [記録](docs/evidence/spider-observer-output-schema.json) |
| SYS03 | 公開方法別の最低条件を機械判定し、Web/npm SBOMと設定画面へ統合 | 完了 | [記録](data/release-readiness.json) · [記録](scripts/check-release-readiness.mjs) · [記録](scripts/release-readiness-lib.mjs) · [記録](tests/release-readiness.test.mjs) · [記録](docs/release-minimum-gates.md) · [記録](components/system-maintenance.tsx) |
| SYS04 | QEMU rc2を同一候補10要件へ固定し、rc2固有native SBOMを生成して旧inventoryの誤転用を拒否 | 完了 | [記録](data/qemu-release-audit.json) · [記録](data/qemu-rc2-legal-info/manifest.csv) · [記録](data/qemu-rc2-legal-info/host-manifest.csv) · [記録](data/release-readiness.json) · [記録](scripts/check-release-readiness.mjs) · [記録](scripts/release-readiness-lib.mjs) · [記録](tests/release-readiness.test.mjs) · [記録](https://github.com/k999ln/rock/blob/96845e6006c15e39ba5b45495f79c21bdff7399e/docs/qemu-release-completion-audit-20260912.md) · [記録](components/system-maintenance.tsx) |
| SYS05 | 候補準備・法務承認・保護署名・本人署名の64拒否境界試験を全体verifyへ統合 | 完了 | [記録](scripts/check-release-signing.mjs) · [記録](scripts/release_signing.py) · [記録](scripts/release_signing_owner.py) · [記録](scripts/prepare_release_candidate.py) · [記録](scripts/verify_owner_legal_approval.py) · [記録](tests/test_release_signing.py) · [記録](tests/test_release_signing_owner.py) · [記録](tests/test_prepare_release_candidate.py) · [記録](tests/test_owner_legal_approval.py) · [記録](docs/release-signing-operations.md) |
| SYS06 | Android物理端末とマイナンバー連携を独立監査し、証拠なしの互換・GMS・販売・個人番号有効化を拒否 | 完了 | [記録](data/android-physical-release-audit.json) · [記録](data/personal-number-release-audit.json) · [記録](data/release-readiness.json) · [記録](scripts/check-release-readiness.mjs) · [記録](scripts/release-readiness-lib.mjs) · [記録](tests/release-readiness.test.mjs) · [記録](https://github.com/k999ln/rock/blob/96845e6006c15e39ba5b45495f79c21bdff7399e/docs/android-and-personal-number-gates-20260913.md) · [記録](docs/release-minimum-gates.md) |
| SYS07 | Web/PWAのHTTP防御を正本化し、Worker・static asset両経路の実responseを検査 | 完了 | [記録](data/web-security-policy.json) · [記録](next.config.ts) · [記録](public/_headers) · [記録](scripts/check-web-security-response.mjs) · [記録](tests/web-security-policy.test.mjs) · [記録](docs/evidence/launch/web-security-local-20260917.json) · [記録](docs/validation.md) |
| SYS08 | PWA新版の自動即時切替を廃止し、本人確認後の適用・旧cache整理・再読込へ変更 | 完了 | [記録](public/sw.js) · [記録](components/system-maintenance.tsx) · [記録](tests/service-worker-update.test.mjs) · [記録](docs/evidence/launch/web-security-local-20260917.json) · [記録](docs/validation.md) |
| SYS09 | PWAの同一性・scope・iPhone/Android向けinstall iconを固定し、実HTTP manifestを検査 | 完了 | [記録](app/manifest.ts) · [記録](public/rock-icon-192.png) · [記録](public/rock-icon-512.png) · [記録](public/rock-icon-maskable.svg) · [記録](scripts/check-web-security-response.mjs) · [記録](tests/pwa-installability.test.mjs) · [記録](docs/evidence/launch/web-security-local-20260917.json) · [記録](docs/validation.md) |
| SYS10 | Web第三者依存のlock hash・47要review componentのPURL一覧を公開gateへ固定 | 完了 | [記録](package-lock.json) · [記録](data/web-third-party-license-audit.json) · [記録](data/release-readiness.json) · [記録](scripts/release-readiness-lib.mjs) · [記録](tests/release-readiness.test.mjs) · [記録](docs/release-minimum-gates.md) · [記録](docs/validation.md) |
| SYS11 | Vite生成chunkのnpm componentをbuild時に記録しlicense監査へ照合 | 完了 | [記録](vite.config.ts) · [記録](scripts/web-bundle-inventory.mjs) · [記録](scripts/check-web-bundle-inventory.mjs) · [記録](tests/web-bundle-inventory.test.mjs) · [記録](package.json) · [記録](data/release-readiness.json) · [記録](docs/release-minimum-gates.md) · [記録](docs/validation.md) |
| SYS12 | 運営1名で開始できる緊急保護・限定保守accessの脅威モデルと端末側制御契約を固定 | 完了 | [記録](data/device-emergency-access-policy.json) · [記録](docs/security-incident-response.md) · [記録](docs/product-baseline.md) · [記録](scripts/check-product-baseline.mjs) · [記録](tests/product-baseline.test.mjs) |
| SYS13 | 親タスク: 緊急accessのAndroid service・hardware credential・端末側制限・監査を実装しPixel 10で侵入／復旧試験 | 進行中 | [記録](data/device-emergency-access-policy.json) · [記録](docs/security-incident-response.md) · [記録](services/operator-dock/public/index.html) · [記録](services/operator-dock/src/worker.ts) · [記録](services/operator-dock/src/access-auth.ts) · [記録](services/operator-dock/src/operator-control.ts) · [記録](services/operator-dock/src/device-channel.ts) · [記録](services/operator-dock/migrations/0001_operator_device_control.sql) · [記録](services/operator-dock/migrations/0002_signed_device_channel.sql) · [記録](android/operator-agent/src/main/java/dev/rock/operator/agent/OperatorCommandVerifier.java) · [記録](android/operator-agent/src/main/java/dev/rock/operator/agent/OperatorAgentJobService.java) · [記録](tests/operator-control.test.mjs) · [記録](tests/operator-device-channel.test.mjs) · [記録](tests/operator-access-auth.test.mjs) · [記録](tests/operator-dock-isolation.test.mjs) · [記録](android/operator-agent/src/androidTest/java/dev/rock/operator/agent/OperatorAgentIntegrationTest.java) · [記録](android/operator-agent/src/main/res/values/overlayable.xml) · [記録](scripts/stage-operator-agent-overlay.py) · [記録](tests/test_stage_operator_agent_overlay.py) · [記録](os/physical/operator-agent-overlay/README.md) · [記録](docs/evidence/android-operator-agent-emulator-20260916.json) · [記録](docs/evidence/android-pixel-10-prefull-physical-20260916.json) · [記録](docs/evidence/android-operator-overlay-stager-20260916.json) |
| SYS14 | 製品目的から全層の選択・接続・実証状態を一つの構成監査へ固定 | 完了 | [記録](docs/system-composition.md) · [記録](data/system-composition-audit.json) · [記録](scripts/check-system-composition.mjs) · [記録](tests/system-composition.test.mjs) |
| R01 | 4参照元の採用判断と事業方針の固定 | 完了 | [記録](docs/reference-repositories.md) |
| R02 | ggをGitHub rockへ紐付け、既存変更と履歴を保全 | 完了 | [記録](project.md) |
| R03 | 仕事の作成・実行・確認・再開をAPIと画面で接続 | 完了 | [記録](tests/workflow.test.mjs) · [記録](scripts/check-work-api.mjs) · [記録](docs/evidence/spider-work-plan-contract.json) · [記録](components/workbench.tsx) · [記録](app/api/work-jobs/route.ts) · [記録](lib/owner-intent.ts) · [記録](tests/workbench-owner-recovery.test.mjs) |
| R04 | README・設計進捗の同期とCI検証 | 完了 | [記録](scripts/project-status.mjs) · [記録](.github/workflows/ci.yml) · [記録](https://github.com/k999ln/rock/blob/96845e6006c15e39ba5b45495f79c21bdff7399e/docs/native-ci-partition-fix-20260910.md) · [記録](docs/evidence/spider-locked-dependency-restore.json) |
| R05 | 回帰検証・移行確認・GitHub保存 | 完了 | [記録](docs/validation.md) |
| R06 | ブラウザで仕事の一連の操作を確認 | 完了 | [記録](docs/validation.md) |
| R07 | 本人限定のSitesへ公開・本番確認 | 完了 | [記録](docs/deployment-integration.md) · [記録](https://github.com/k999ln/rock/blob/96845e6006c15e39ba5b45495f79c21bdff7399e/docs/release-followup-20260910.md) · [記録](docs/owner-setup-20260911.md) · [記録](docs/evidence/launch/backend-owner-validation-20260912.json) |
| R08 | 検証結果・公開停止理由と再開設計の文書化 | 完了 | [記録](project.md) · [記録](docs/validation.md) · [記録](docs/deployment-integration.md) |
| OS01 | 既存設計の要件追跡と自動化OS開発設計 | 完了 | [記録](docs/rockstaros-complete-design.md) |
| DSP01 | 共通Core・機種別Device Support Package・4提供区分の設計と検査 | 完了 | [記録](docs/device-support-architecture.md) · [記録](data/device-support-matrix.json) · [記録](scripts/check-device-support.mjs) |
| OS02 | 親タスク: 【Android/AOSP別トラック】対象Pixel・ソース/BSP・Linuxビルド環境の適合確認 | 進行中 | [記録](docs/rockstaros-complete-design.md) · [記録](docs/phone-preview-20260911.md) · [記録](os/physical/frankel-source-lock.json) · [記録](docs/evidence/android-pixel-10-gl066-dsp-source-audit-20260916.json) |
| OS03 | 【Android/AOSP別トラック】CuttlefishでOS起動と自律実行の最小縦断試作 | 未着手 | [記録](docs/rockstaros-complete-design.md) |
| OS04 | 【Android/AOSP別トラック】Pixel実機で復旧・省電力・再起動・署名更新を検証 | 未着手 | [記録](docs/rockstaros-complete-design.md) |
| OS05 | 【Android/AOSP別トラック】第三者SDK・審査・インストール・失効の閉鎖テスト | 未着手 | [記録](docs/rockstaros-complete-design.md) |
| OS06 | OS共通実行コア・端末DB・Android統合の検証可能な試作 | 完了 | [記録](docs/os-prototype.md) · [記録](docs/validation.md) · [記録](android/automation/src/androidTest/java/dev/rock/automation/DeviceIntegrationTest.java) |
| OS07 | Local Action Assistantの固定source・オフラインLLM契約・署名限定Binder client/server・APK staging gateを実装 | 完了 | [記録](docs/local-ai-os-integration-20260915.md) · [記録](contracts/local-ai-runtime.json) · [記録](os/physical/local-action-assistant-source-lock.json) · [記録](docs/evidence/local-ai-overlay-validation-20260915.json) |
| OS08 | Local Action AssistantのKotlin・arm64 APKをnative buildし、artifact lockとSoong OS imageへ接続 | 進行中 | [記録](docs/local-ai-os-integration-20260915.md) · [記録](.github/workflows/local-ai-apk.yml) · [記録](scripts/build-local-ai-apk.sh) · [記録](scripts/stage-local-ai-apk.py) · [記録](os/physical/local-action-assistant-artifact-lock.json) · [記録](docs/evidence/android-pre-full-build-tests-20260915.json) · [記録](docs/evidence/android-local-ai-plan-v2-20260916.json) |
| OS09 | 確定した対象端末でGGUF import・機内モード推論・変更確認・30分連続温度試験を完走 | 進行中 | [記録](docs/local-ai-os-integration-20260915.md) · [記録](docs/evidence/android-pixel-10-gl066-local-ai-20260916.json) · [記録](docs/evidence/android-local-ai-plan-v2-20260916.json) · [記録](docs/evidence/android-pixel-10-prefull-physical-20260916.json) |
| OS10 | Tool／MCP／Provider共通APIとnative Zema選択Tool経路、本人承認、Wallet台帳、暗号化backup、署名更新gateを実装 | 進行中 | [記録](docs/platform-core.md) · [記録](docs/os-prototype.md) · [記録](contracts/platform-api.json) · [記録](android/core/src/main/java/dev/rock/core/platform/PlatformStore.java) · [記録](android/core/src/main/java/dev/rock/core/platform/EncryptedBackup.java) · [記録](docs/android-backup-recovery.md) · [記録](data/android-backup-recovery-policy.json) · [記録](docs/android-production-architecture.md) · [記録](data/android-release-architecture-policy.json) · [記録](scripts/check-android-release-architecture.mjs) · [記録](tests/android-release-architecture.test.mjs) · [記録](android/tool-sdk/src/main/aidl/dev/rock/sdk/IPlatformApi.aidl) · [記録](android/automation/src/main/java/dev/rock/automation/RockPlatformService.java) · [記録](android/automation/src/main/java/dev/rock/automation/RockShellService.java) · [記録](android/shell-api/src/main/aidl/dev/rock/shellapi/IShellApi.aidl) · [記録](android/shell/src/main/java/dev/rock/shell/ShellConnection.java) · [記録](android/shell/src/androidTest/java/dev/rock/shell/ShellBrokerIntegrationTest.java) · [記録](android/automation/src/main/java/dev/rock/automation/ZemaOrchestrator.java) · [記録](android/tool-sdk/src/main/java/dev/rock/sdk/ZemaToolPlan.java) · [記録](docs/evidence/android-zema-selected-tool-20260916.json) · [記録](docs/evidence/android-local-ai-plan-v2-20260916.json) · [記録](docs/evidence/android-pixel-10-prefull-physical-20260916.json) · [記録](android/sepolicy/private/rockstar_platform.te) · [記録](android/core/src/main/java/dev/rock/core/platform/A2ARecoveryBinding.java) · [記録](android/automation/src/test/java/dev/rock/automation/AndroidRockstarDeviceSessionStoreTest.java) · [記録](android/automation/src/test/java/dev/rock/automation/AndroidRockstarDeviceHomeTransportTest.java) · [記録](android/automation/src/androidTest/java/dev/rock/automation/AndroidResponseDeadlineTest.java) · [記録](android/core/src/test/java/dev/rock/core/A2AWalletReservationTest.java) · [記録](android/shell/src/androidTest/java/dev/rock/shell/CloudSessionPresentationTest.java) |
| OS11 | Platform CoreをAOSPでbuildしSELinux enforcing boot、production署名更新、OTA rollbackを実機検証 | 未着手 | [記録](docs/platform-core.md) · [記録](docs/phone-preview-20260911.md) · [記録](.github/workflows/android.yml) · [記録](.github/workflows/local-ai-apk.yml) · [記録](docs/android-backup-recovery.md) · [記録](data/android-backup-recovery-policy.json) · [記録](docs/android-production-architecture.md) · [記録](data/android-release-architecture-policy.json) |
| G01 | GitHubリポジトリの役割・重複監査と正本境界の固定 | 完了 | [記録](docs/git-consolidation.md) · [記録](data/repository-map.json) · [記録](scripts/check-repository-map.mjs) · [記録](docs/validation.md) |
| G02 | vvvvの稼働参照監査と安全なarchive判定 | 未着手 | [記録](docs/git-consolidation.md) |
| G03 | Web DBの保存境界・互換migration・重複防止checkを整理 | 完了 | [記録](docs/data-storage-boundaries.md) · [記録](scripts/check-web-schema.mjs) · [記録](tests/migration-union.test.mjs) |
| B01 | Sky＋Walletの製品ベース・branch監査・プロンプト規約を保存 | 完了 | [記録](docs/product-baseline.md) · [記録](docs/product-north-star-20260915.md) · [記録](https://github.com/k999ln/rock/blob/96845e6006c15e39ba5b45495f79c21bdff7399e/docs/progress-audit-20260909.md) · [記録](docs/prompt-playbook.md) · [記録](docs/workstreams/06-native-qemu-release.md) · [記録](docs/validation.md) |
| B04 | main/native/設計reviewのベース・引継ぎ入口を分離作業branchへ統合 | 完了 | [記録](docs/design-implementation-alignment-20260909.md) · [記録](docs/workstreams/06-native-qemu-release.md) · [記録](https://github.com/k999ln/rock/blob/96845e6006c15e39ba5b45495f79c21bdff7399e/docs/os-operational-validation-20260909.md) |
| B02 | 既存商品のSky実利用と不便の改善・実行/料金/権利の条件拡張 | 進行中 | [記録](docs/workstreams/06-native-qemu-release.md) · [記録](docs/pc-citations-adapter.md) · [記録](docs/evidence/pc-citations/integration.json) · [記録](docs/evidence/os-base/business-backup-acceptance-b8287bc.json) · [記録](docs/sky-rockstar-ledger-20260912.md) · [記録](docs/sky-role-agents-20260912.md) · [記録](docs/evidence/sky-rockstar-ledger/integration.json) · [記録](tests/rockstar-ledger.test.mjs) · [記録](tests/subscription-advisor.test.mjs) · [記録](docs/sky-legal-intake-20260912.md) · [記録](tests/legal-intake.test.mjs) · [記録](docs/sky-patent-assistant-20260912.md) · [記録](tests/patent-assistant.test.mjs) |
| B03 | 実行費用・認証済み収益を既存Walletへ接続し縦断検証 | 進行中 | [記録](docs/workstreams/06-native-qemu-release.md) · [記録](docs/evidence/os-base/business-backup-acceptance-b8287bc.json) · [記録](docs/evidence/android-pre-full-build-tests-20260915.json) · [記録](app/api/earnings/receipts/route.ts) · [記録](lib/earning-bridge.ts) · [記録](tests/earning-bridge.test.mjs) · [記録](docs/evidence/tool-earning-wallet-bridge-20260915.json) · [記録](docs/evidence/pixel-tool-wallet-correlation-20260916.json) |
| B05 | Wallet連携基礎を使ったSky縦断再試験・PC比較と未実証の端末価値を記録 | 進行中 | [記録](docs/workstreams/06-native-qemu-release.md) · [記録](https://github.com/k999ln/rock/blob/96845e6006c15e39ba5b45495f79c21bdff7399e/docs/hub-wallet-pc-comparison-20260909.md) · [記録](docs/evidence/hub-wallet/b05-pc-machine-20260909/report.json) |
| D01 | RQ12〜15・OS受入雛形・ゲーム作者向け実行プロンプトを保存 | 完了 | [記録](docs/product-baseline.md) · [記録](docs/service-design/04-delivery-and-acceptance.md) · [記録](docs/workstreams/06-native-qemu-release.md) · [記録](docs/templates/os-acceptance-report.md) · [記録](docs/validation.md) |
| V01 | 旧9abf78a候補のQEMU開発OSをbuildしD0〜D6の稼働/復旧受入を通す（現rc2へ転用しない） | 完了 | [記録](docs/workstreams/06-native-qemu-release.md) · [記録](docs/templates/os-acceptance-report.md) · [記録](https://github.com/k999ln/rock/blob/96845e6006c15e39ba5b45495f79c21bdff7399e/docs/os-operational-validation-20260909.md) · [記録](docs/evidence/os-base/startup-update-acceptance-b8287bc.json) · [記録](docs/evidence/os-base/business-backup-acceptance-b8287bc.json) · [記録](docs/evidence/os-base/registry-negative-b8287bc.json) · [記録](https://github.com/k999ln/rock/blob/96845e6006c15e39ba5b45495f79c21bdff7399e/docs/os-acceptance-b8287bc-20260909.md) · [記録](systems/rock-star-os/os/desktop/LAUNCHER-V2.md) · [記録](docs/evidence/rls01/final-d6-ci-20260910.json) · [記録](docs/evidence/rls01/final-d6-root-audit-20260910.json) · [記録](https://github.com/k999ln/rock/blob/96845e6006c15e39ba5b45495f79c21bdff7399e/docs/os-local-final-20260910.md) · [記録](https://github.com/k999ln/rock/blob/96845e6006c15e39ba5b45495f79c21bdff7399e/docs/os-acceptance-9abf78a-20260910.md) · [記録](https://github.com/k999ln/rock/blob/96845e6006c15e39ba5b45495f79c21bdff7399e/docs/os-native-repeat-20260910.md) · [記録](https://github.com/k999ln/rock/blob/96845e6006c15e39ba5b45495f79c21bdff7399e/docs/os-final-compatibility-20260910.md) |
| GX00 | 共通Walletの複数owner/player分離・本人接続・既存台帳互換を設計検証 | 完了 | [記録](docs/design-implementation-alignment-20260909.md) · [記録](docs/workstreams/06-native-qemu-release.md) · [記録](docs/gx00-owner-isolation-adr.md) · [記録](docs/evidence/gx00/integration.json) · [記録](systems/rock-star-os/os/wallet_backend/FENCE.md) · [記録](docs/gx00-connection-wire-v1.md) · [記録](docs/evidence/gx00/game-protocol-review.json) · [記録](https://github.com/k999ln/rock/blob/96845e6006c15e39ba5b45495f79c21bdff7399e/docs/game-connection-node-wire-20260909.md) · [記録](docs/gx00-connections-runtime.md) · [記録](docs/evidence/gx00/game-connections-root.json) · [記録](docs/gx00-legacy-game-basis.md) · [記録](systems/rock-star-os/os/wallet_backend/CURRENT-RESTORE.md) · [記録](docs/evidence/gx00/current-copy-foundations-root.json) · [記録](docs/gx00-current-game-restore.md) · [記録](docs/gx00-owner-connection-client.md) · [記録](docs/evidence/gx00/current-game-integration-root.json) · [記録](https://github.com/k999ln/rock/blob/96845e6006c15e39ba5b45495f79c21bdff7399e/docs/implementation-checkpoint-20260909.md) · [記録](docs/evidence/gx00/release-required-acceptance-20260910.json) |
| GX01 | ATMから独立したゲーム交換契約・両台帳fixture・異常系を実装検証 | 完了 | [記録](docs/workstreams/06-native-qemu-release.md) · [記録](docs/gx01-contract-implementation-plan.md) · [記録](docs/gx01-native-ui-20260910.md) · [記録](docs/gx01-reference-sdk-sandbox-20260910.md) · [記録](https://github.com/k999ln/rock/blob/96845e6006c15e39ba5b45495f79c21bdff7399e/docs/game-wallet-release-checkpoint-20260910.md) · [記録](docs/evidence/hub-final-9abf78a/final-c01-completed-stages.json) · [記録](docs/evidence/gx01/final-9abf78a-20260910.json) |
| GX02 | 指定された実ゲームの正式sandbox接続と交換条件を検証 | 未着手 | [記録](docs/workstreams/06-native-qemu-release.md) |
| DX01 | ゲーム作者向けAPI/SDK・sandbox・複数owner/game分離と導入体験を検証 | 完了 | [記録](docs/workstreams/06-native-qemu-release.md) · [記録](docs/gx01-reference-sdk-sandbox-20260910.md) · [記録](docs/evidence/rls01/sdk-final-9abf78a/README.md) · [記録](docs/evidence/rls01/sdk-final-9abf78a/summary.json) · [記録](docs/evidence/gx01/final-9abf78a-20260910.json) |
| N01 | Linux native OS基準版の公開ソース統合・既存資産の回帰検証 | 完了 | [記録](docs/native-os-integration.md) · [記録](docs/native-os-validation.md) |
| N02 | 起動応答確認と自動再読込WIPの検証・採用判断 | 進行中 | [記録](docs/native-os-integration.md) |
| N03 | 実機候補1機種の型番/SKU・boot/BSP・更新/復旧の適合確認 | 進行中 | [記録](docs/native-os-integration.md) · [記録](docs/phone-preview-20260911.md) · [記録](https://github.com/k999ln/rock/blob/96845e6006c15e39ba5b45495f79c21bdff7399e/docs/current-state-20260911.md) · [記録](docs/evidence/launch/progress-audit-20260912.json) · [記録](docs/evidence/android-pixel-10-gl066-dsp-source-audit-20260916.json) · [記録](scripts/freeze-phone-build-inputs.py) · [記録](tests/test_freeze_phone_build_inputs.py) · [記録](docs/evidence/android-prefull-input-freeze-20260916.json) |
| N04 | Pixel 10受入後だけ二機種目のDevice Support Package候補を再評価 | 未着手 | [記録](docs/device-support-architecture.md) · [記録](data/device-support-matrix.json) |
| N05 | 実USB・外部MCP/si・金融provider・ToB精算と運営pilot | 未着手 | [記録](docs/native-os-integration.md) |
| RLS01 | fresh Mac/PCへ導入できるQEMU Developer Previewを作成・検証 | 完了 | [記録](https://github.com/k999ln/rock/blob/96845e6006c15e39ba5b45495f79c21bdff7399e/docs/release-installation-plan-20260909.md) · [記録](docs/rockstaros-1.0-architecture.md) · [記録](docs/rockstaros-1.0-strategy.md) · [記録](docs/evidence/rls01/final-9abf78a/summary.json) · [記録](docs/evidence/rls01/github-direct-install-9abf78a/summary.json) · [記録](https://github.com/k999ln/rock/blob/96845e6006c15e39ba5b45495f79c21bdff7399e/docs/release-followup-20260910.md) |
| RLS02 | 正確な1機種・variantへ限定したPhysical Device Previewを作成・復旧検証 | 進行中 | [記録](https://github.com/k999ln/rock/blob/96845e6006c15e39ba5b45495f79c21bdff7399e/docs/release-installation-plan-20260909.md) · [記録](docs/phone-preview-20260911.md) · [記録](https://github.com/k999ln/rock/blob/96845e6006c15e39ba5b45495f79c21bdff7399e/docs/current-state-20260911.md) · [記録](docs/android-production-signing-custody.md) · [記録](data/android-signing-custody-policy.json) · [記録](docs/android-rollback-index-policy.md) · [記録](data/android-rollback-index-policy.json) · [記録](docs/android-google-stock-recovery.md) · [記録](data/android-stock-recovery-policy.json) · [記録](docs/android-backup-recovery.md) · [記録](data/android-backup-recovery-policy.json) · [記録](docs/evidence/launch/progress-audit-20260912.json) · [記録](scripts/freeze-phone-build-inputs.py) · [記録](tests/test_freeze_phone_build_inputs.py) · [記録](docs/evidence/android-prefull-input-freeze-20260916.json) |
| LCH01 | TLS／累積timeoutの原因と最終CIの照合 | 進行中 | [記録](https://github.com/k999ln/rock/blob/96845e6006c15e39ba5b45495f79c21bdff7399e/docs/launch-readiness-20260910.md) |
| LCH02 | 全同梱物inventory・対応source・製品LICENSEの明示決定 | 進行中 | [記録](https://github.com/k999ln/rock/blob/96845e6006c15e39ba5b45495f79c21bdff7399e/docs/launch-readiness-20260910.md) · [記録](https://github.com/k999ln/rock/blob/96845e6006c15e39ba5b45495f79c21bdff7399e/docs/current-state-20260911.md) · [記録](docs/evidence/launch/progress-audit-20260912.json) |
| LCH03 | production署名・保護環境・失効運用 | 進行中 | [記録](https://github.com/k999ln/rock/blob/96845e6006c15e39ba5b45495f79c21bdff7399e/docs/launch-readiness-20260910.md) · [記録](https://github.com/k999ln/rock/blob/96845e6006c15e39ba5b45495f79c21bdff7399e/docs/current-state-20260911.md) · [記録](docs/android-production-signing-custody.md) · [記録](data/android-signing-custody-policy.json) · [記録](docs/android-first-flash-gate-20260916.md) · [記録](data/android-first-flash-gate.json) |
| LCH04 | Sites履歴のコード統合・新規本人限定サイト・Sky改善 | 進行中 | [記録](https://github.com/k999ln/rock/blob/96845e6006c15e39ba5b45495f79c21bdff7399e/docs/launch-readiness-20260910.md) · [記録](docs/owner-setup-20260911.md) · [記録](https://github.com/k999ln/rock/blob/96845e6006c15e39ba5b45495f79c21bdff7399e/docs/current-state-20260911.md) · [記録](docs/evidence/launch/sites-owner-private-20260913.json) |
| LCH05 | 制作中CMの完成待ち・内容照合・導入案内への接続 | 進行中 | [記録](https://github.com/k999ln/rock/blob/96845e6006c15e39ba5b45495f79c21bdff7399e/docs/launch-readiness-20260910.md) · [記録](https://github.com/k999ln/rock/blob/96845e6006c15e39ba5b45495f79c21bdff7399e/docs/current-state-20260911.md) |
| LCH06 | PR系列・正確なmain統合tree・版表示の整合 | 進行中 | [記録](https://github.com/k999ln/rock/blob/96845e6006c15e39ba5b45495f79c21bdff7399e/docs/launch-readiness-20260910.md) · [記録](https://github.com/k999ln/rock/blob/96845e6006c15e39ba5b45495f79c21bdff7399e/docs/current-state-20260911.md) |
| LCH07 | 親タスク: 同一最終候補の再現配布・導入・復旧リハーサル | 進行中 | [記録](https://github.com/k999ln/rock/blob/96845e6006c15e39ba5b45495f79c21bdff7399e/docs/launch-readiness-20260910.md) |
| LCH08 | ローカルOSバックエンドの安全終了・ヘルスチェック・再起動時のreceipt復元を検証 | 完了 | [記録](https://github.com/k999ln/rock/blob/96845e6006c15e39ba5b45495f79c21bdff7399e/docs/backend-launch-20260912.md) · [記録](docs/evidence/launch/backend-rc3-local-20260912.json) · [記録](systems/rock-star-os/scripts/verify-backend-launch.py) · [記録](systems/rock-star-os/tests/test_hub.py) · [記録](systems/rock-star-os/tests/test_hub_server.py) |
| FB01 | Instagram運用・受注型ブランド管理をRockstarOS Hub商品とMCPへ統合 | 完了 | [記録](docs/fashion-brand-ops-integration.md) |
| FB02 | 売上・数量・粗利・期限からCampaign Autopilotの計画と次アクションを生成 | 完了 | [記録](toolkits/fashion-brand-ops/src/service.mjs) · [記録](toolkits/fashion-brand-ops/test/service.test.mjs) |
| FB03 | DM履歴・購買意向・顧客情報からsi Sales Conciergeと営業パイプラインを生成 | 完了 | [記録](toolkits/fashion-brand-ops/src/service.mjs) · [記録](toolkits/fashion-brand-ops/test/service.test.mjs) |
| FB04 | 入金確認後の制作計画・原価・納期・工程をProduction Cockpitで管理 | 完了 | [記録](toolkits/fashion-brand-ops/db/migrations/003_autonomous_operations.sql) · [記録](toolkits/fashion-brand-ops/test/service.test.mjs) |
| FB05 | 改善版Skyの役割フィードへブランド運営役と40 MCP操作を統合 | 完了 | [記録](components/sky-workspace.tsx) · [記録](lib/sky-routing.ts) · [記録](tests/sky-routing.test.mjs) · [記録](docs/sky-assistant-and-memory.md) |
| FB06 | Instagram画面の写真から未確認候補を作り、Meta確認後だけ運用対象へ進める | 完了 | [記録](docs/instagram-photo-onboarding-20260912.md) · [記録](toolkits/fashion-brand-ops/db/migrations/004_screenshot_account_intake.sql) · [記録](toolkits/fashion-brand-ops/src/service.mjs) · [記録](toolkits/fashion-brand-ops/test/service.test.mjs) · [記録](components/fashion-brand-ops-runner.tsx) |
| BIL01 | 旧888 cents収益精算の試験実装を保持し、現行ToC料金は動線確定まで停止 | 完了 | [記録](docs/sky-billing.md) · [記録](services/sky-billing/src/worker.ts) · [記録](tests/billing.test.mjs) · [記録](tests/billing-worker.test.mjs) · [記録](services/sky-billing/migrations/0002_earnings_settlement.sql) · [記録](docs/evidence/launch/backend-owner-validation-20260912.json) |
| BIL02 | 有償自動化商品と販売・決済・払出しProvider sandboxを接続し、Earning Receiptから実送金まで受入 | 進行中 | [記録](docs/sky-billing.md) · [記録](docs/workstreams/03-wallet-billing-providers.md) · [記録](tests/billing-worker.test.mjs) · [記録](docs/evidence/launch/sky-billing-fee-hold-20260924.json) |
| BIL03 | メルカリを最初の収益経路として出品準備・費用計算・承認・未照合売上の安全な状態管理をSkyへ追加 | 完了 | [記録](docs/mercari-revenue-loop.md) · [記録](lib/mercari-revenue.ts) · [記録](app/api/revenue/mercari/route.ts) · [記録](components/mercari-revenue-starter.tsx) · [記録](tests/mercari-revenue.test.mjs) · [記録](lib/mercari-revenue-store.ts) · [記録](tests/mercari-revenue-route.test.mjs) · [記録](tests/mercari-workspace-recovery.test.mjs) · [記録](components/use-pending-save-navigation.ts) · [記録](tests/pending-save-navigation.test.mjs) · [記録](lib/owner-intent.ts) · [記録](tests/owner-intent-route.test.mjs) |
| CSV00 | CSV仕事の35作業を名前空間付きで管理し、コード完成と外部実績gateを分離 | 進行中 | [記録](data/csv-business-tasks.json) · [記録](docs/csv-business-v1.ja.md) · [記録](lib/csv-transform.ts) · [記録](lib/csv-job-store.ts) · [記録](components/csv-business-workspace.tsx) |
| AMC01 | 親タスク: 現行3製品とOSの責任表・未決事項台帳をレビューする | 未着手 | — |
| MINI01 | 親タスク: R5要求・OPEN01〜08と部隊別試験の追跡表を作る | 未着手 | — |
| MINI02 | 親タスク: R5の200mm収納と部品干渉を確認する機構評価計画を作る | 未着手 | — |
| MINI03 | 親タスク: R5単体3D入力の方式比較と測定計画を作る | 未着手 | — |
| MINI04 | 親タスク: R5裸眼表示の成立条件・方式比較・試験開始条件を整理する | 未着手 | — |
| MINI05 | 親タスク: Mini単独boot・入力・game・保存・停止の最小実装仕様を作る | 未着手 | — |
| MINI06 | 親タスク: R5電源・熱・1/2/4台通信の評価条件を定義する | 未着手 | — |
| MINI07 | 親タスク: R5校正・停止・privacy・復旧の危険分析と受入表を作る | 未着手 | — |
| PRO01 | 親タスク: Pro v0.1の製品要求と単独利用・任意Mini連携の境界を定義する | 未着手 | — |
| PRO02 | 親タスク: Proの代表負荷・性能予算と演算基板候補の比較条件を定義する | 未着手 | — |
| PRO03 | 親タスク: Pro非金融ゲームのsample・保存再開・入力SDKの差分仕様を作る | 未着手 | — |
| PRO04 | 親タスク: Proの利用者別保存・容量・backup・復旧契約を定義する | 未着手 | — |
| PRO05 | 親タスク: Proの映像・音声・controller・端子の最小I/O表を作る | 未着手 | — |
| PRO06 | 親タスク: 任意Mini–Pro接続の認証・時刻・Pose契約v0を作る | 未着手 | — |
| PRO07 | 親タスク: Pro筐体・熱・電源・更新復旧の制約と評価計画を作る | 未着手 | — |
| RKT01 | 親タスク: rocketstar R1.0のMission入力・未決台帳と要求追跡を整理する | 未着手 | — |
| RKT02 | 親タスク: 構造・tank・取付Interfaceの解析入力と検証計画を整理する | 未着手 | — |
| RKT03 | 親タスク: 推進系の要求・機体Interface・検証段階を整理する | 未着手 | — |
| RKT04 | 親タスク: 空力・熱・構造の結合条件と検証入力を整理する | 未着手 | — |
| RKT05 | 親タスク: Flight SWの独立性・状態・SIL試験要件を整理する | 未着手 | — |
| RKT06 | 親タスク: Payload・扉・分離のInterfaceと異常確認計画を整理する | 未着手 | — |
| RKT07 | 親タスク: R1.0の電源・data・時刻とA-LINK旧試作の差分表を作る | 未着手 | — |
| RKT08 | 親タスク: 地上設備・運用役割とgo/no-go・abortの机上確認計画を作る | 未着手 | — |
| RKT09 | 親タスク: 帰還・回収・整備・同一機番再使用の証拠台帳を設計する | 未着手 | — |
| RKT10 | 親タスク: 製造・品質・安全の構成管理と段階別証拠matrixを作る | 未着手 | — |
| ORG03 | AMCの担当・旧版混入・受入条件を精査し、部隊ごとの実行可能taskと検査を同期 | 完了 | [記録](docs/mission-control.md) · [記録](data/mission-control.json) · [記録](scripts/check-mission-control.mjs) · [記録](scripts/sync-mission-control.mjs) · [記録](tests/mission-control.test.mjs) · [記録](docs/evidence/amc/task-precision-audit.json) · [記録](docs/evidence/spider-mission-squad-dom.json) |
| SYS15 | Spider Security AgentのGitHub検査・コード検査・OS常駐監視・送信前拒否・native表示・boot監督を統合する（ROCK・同一image起動未受入） | 進行中 | [記録](docs/spider-guard.md) · [記録](docs/evidence/spider-guard-source-validation.json) · [記録](docs/workstreams/04-security-identity-compliance.md) · [記録](docs/product-baseline.md) · [記録](docs/rockstaros-complete-design.md) · [記録](data/design-document-index.json) · [記録](systems/rock-star-os/os/platform/sensitive_guard.py) · [記録](systems/rock-star-os/os/platform/supervisor.py) · [記録](systems/rock-star-os/os/platform/service.py) · [記録](systems/rock-star-os/os/platform/runner_control.py) · [記録](systems/rock-star-os/os/platform/install-target.sh) · [記録](systems/rock-star-os/os/ui/security-ui.inc) · [記録](systems/rock-star-os/os/ui/test_ui.c) · [記録](systems/rock-star-os/tests/test_sensitive_guard.py) · [記録](systems/rock-star-os/tests/test_os_security_guard_integration.py) · [記録](systems/rock-star-os/tests/test_os_runner_control.py) · [記録](systems/rock-star-os/os/ui/spider-motion.c) · [記録](systems/rock-star-os/os/ui/spider-motion.h) · [記録](systems/rock-star-os/os/ui/pin-readiness.json) · [記録](scripts/review-native-pin-source.py) · [記録](systems/rock-star-os/tests/test_ui_pin_source_profile.py) · [記録](scripts/build-spider-inspector.mjs) · [記録](toolkits/spider-guard/README.md) · [記録](toolkits/spider-guard/inspector.html) · [記録](toolkits/spider-guard/program-inspector.mjs) · [記録](toolkits/spider-guard/program-inspector.d.mts) · [記録](tests/spider-inspector-artifact.test.mjs) · [記録](tests/spider-program-inspector.test.mjs) · [記録](systems/rock-star-os/os/platform/code_inspector.py) · [記録](systems/rock-star-os/tests/test_code_inspector.py) · [記録](SECURITY.md) · [記録](.github/workflows/spider.yml) · [記録](.github/workflows/spider-codeql.yml) · [記録](.github/spider/gitleaks.toml) · [記録](scripts/spider-repository-scan.py) · [記録](tests/test_spider_repository_scan.py) · [記録](tests/test_spider_gitleaks_policy.py) · [記録](tests/spider-codeql-workflow.test.mjs) · [記録](docs/evidence/spider-github-source-validation.json) · [記録](scripts/spider-feedback.mjs) · [記録](tests/spider-feedback.test.mjs) · [記録](.github/workflows/spider-regressions.yml) · [記録](tests/service-worker-update.test.mjs) · [記録](toolkits/fashion-brand-ops/test/http-security.test.mjs) · [記録](docs/evidence/spider-improvement-cycle.json) · [記録](tests/mcp-local-descriptor.test.mjs) · [記録](tests/test_mr_delivery_boundary.py) · [記録](tests/test_mr_http_deadline.py) · [記録](scripts/select-native-artifacts.py) · [記録](systems/rock-star-os/tests/test_native_artifacts.py) · [記録](docs/native-os-validation.md) · [記録](systems/rock-star-os/os/desktop/launcher.py) · [記録](systems/rock-star-os/tests/test_os_desktop_browser.py) · [記録](systems/rock-star-os/os/desktop/README.md) · [記録](systems/rock-star-os/os/platform/guest-test.py) · [記録](systems/rock-star-os/tests/test_os_platform_isolation_proof.py) · [記録](systems/rock-star-os/tests/test_game_exchange_deadlines.py) · [記録](scripts/verify-mcp-flow.mjs) · [記録](tests/mcp.test.mjs) · [記録](tests/mr-tools.test.mjs) · [記録](tests/csv-transform.test.mjs) · [記録](tests/fixtures/csv-report.html) · [記録](tests/mcp-connector.test.mjs) · [記録](systems/rock-star-os/os/mcp_broker/http.py) · [記録](systems/rock-star-os/tests/test_mcp_http_deadline.py) · [記録](tests/undici-tls-options.test.mjs) · [記録](data/web-third-party-license-audit.json) · [記録](scripts/spider-web-runtime.mjs) · [記録](tests/spider-web-runtime.test.mjs) · [記録](scripts/amc-autonomy-store.mjs) · [記録](tests/amc-autonomy-store-read.test.mjs) · [記録](scripts/amc-parallel.mjs) · [記録](tests/amc-workspace-snapshot.test.mjs) · [記録](docs/evidence/spider-workspace-snapshot-read.json) · [記録](docs/evidence/spider-sky-continuation.json) · [記録](components/spider-workspace.tsx) · [記録](tests/spider-sky.test.mjs) · [記録](tests/spider-workspace-state.test.mjs) · [記録](tests/spider-inspector-worker.test.mjs) · [記録](tests/dependency-cache-revalidation-security.test.mjs) · [記録](docs/evidence/spider-cache-error-revalidation.json) · [記録](docs/evidence/spider-zema-storage-policy.json) · [記録](tests/sharp-native-security.test.mjs) · [記録](docs/evidence/spider-root-sharp-update.json) · [記録](tests/release-readiness.test.mjs) · [記録](docs/evidence/spider-sdk-lock-audit.json) |
| MAT16 | avokadoProのNVIDIA搭載小型PC設計・調達・si/PCゲーム/熱/復旧受入 | 進行中 | [記録](docs/avokado-pro-pc-design.md) · [記録](data/avokado-pro-pc.json) · [記録](docs/evidence/avokado-pro-pc-design.json) |
| ORG04 | 既存AMC担当表を再利用し、機能別の作業部屋・一件の再開手順・アイデア置き場を同期する | 完了 | [記録](workspaces/README.md) · [記録](workspaces/IDEAS.md) · [記録](data/workspaces.json) · [記録](scripts/workspaces.mjs) · [記録](tests/workspaces.test.mjs) · [記録](docs/evidence/workspace-organization.json) |
| AMC03 | 機能別開発Botの定義と、依頼時にCodexからGit／PRへ提出する起動入口を整備する | 完了 | [記録](data/amc/project-bots.json) · [記録](scripts/project-bots.mjs) · [記録](tests/project-bots.test.mjs) · [記録](toolkits/amc-agent/README.md) · [記録](docs/evidence/project-bots.json) |
| AMC04 | 担当BotがGitから情報を収集し、既存AMCで計画を作って実行・検収・Git提出を進める入口を接続する | 完了 | [記録](scripts/project-bot-context.mjs) · [記録](scripts/project-bots.mjs) · [記録](tests/project-bot-context.test.mjs) · [記録](toolkits/amc-agent/README.md) · [記録](docs/evidence/project-bot-amc.json) |
| AMC05 | 既存AMC Goal JSONを担当Botへ直接渡し、ID・revision・履歴を維持して引き継ぐ | 完了 | [記録](scripts/project-bot-context.mjs) · [記録](scripts/project-bots.mjs) · [記録](tests/project-bot-context.test.mjs) · [記録](toolkits/amc-agent/README.md) · [記録](docs/evidence/project-bot-goal-input.json) |
| AMC06 | 固定テンプレートを補助へ分け、Gitを読むCodexの可変計画と追加指示による見直しをAMCへ接続する | 完了 | [記録](scripts/amc-planner.mjs) · [記録](scripts/templates/amc-goal-workbench.html) · [記録](scripts/templates/amc-goal-workbench.js) · [記録](scripts/amc-goal-engine.mjs) · [記録](tests/amc-adaptive-brief.test.mjs) · [記録](docs/amc-goal-orchestrator.md) · [記録](docs/evidence/amc/adaptive-planner.json) |
| SIM01 | アカウントと任意署名claimからRockstarOS・Sky/Zema・Agentの利用権と端末別利用開始を通す | 進行中 | [記録](docs/product-baseline.md) · [記録](docs/rockstaros-complete-design.md) · [記録](docs/rockstaros-complete-design.md) · [記録](toolkits/esim-bootstrap/README.md) · [記録](docs/workstreams/07-android-device-local-ai.md) · [記録](app/connect/page.tsx) · [記録](components/home-screen.tsx) · [記録](data/product-baseline.json) · [記録](AGENTS.md) · [記録](sites/avocado-mini/src/pages/index.astro) · [記録](sites/avocado-mini/src/service-home.css) · [記録](sites/avocado-mini/tests/astro-build.test.mjs) · [記録](tests/sim-service-entry.test.mjs) · [記録](docs/prompts/rock-current-next-20261002.md) · [記録](docs/service-entitlements.md) · [記録](lib/rockstar-entitlement-claim.ts) · [記録](app/api/rockstar/entitlements/route.ts) · [記録](lib/rockstar-entitlement-event.ts) · [記録](app/api/rockstar/entitlements/events/route.ts) · [記録](db/schema.ts) · [記録](drizzle-legacy/post-site-bridge/0039_rockstar_service_entitlements.sql) · [記録](drizzle-legacy/post-site-bridge/0040_rockstar_entitlement_events.sql) · [記録](tests/rockstar-entitlement-claim.test.mjs) · [記録](components/rockstar-entitlement-claim.tsx) · [記録](scripts/check-work-api.mjs) · [記録](app/api/sky/a2a-delegations/route.ts) · [記録](app/api/sky/a2a-delegations/[id]/route.ts) · [記録](services/sky-agent-runtime/src/worker.ts) · [記録](services/sky-agent-runtime/vitest.config.ts) · [記録](services/sky-agent-runtime/test/a2a-workflow.positive.test.mjs) · [記録](docs/a2a-pricing-extension.md) · [記録](lib/currency-format.ts) · [記録](tests/currency-format.test.mjs) · [記録](components/workbench.tsx) · [記録](app/work/work.css) · [記録](lib/a2a-price-quote.ts) · [記録](tests/a2a-price-quote.test.mjs) · [記録](app/api/sky/a2a-delegations/[id]/broker-authorization/route.ts) · [記録](lib/remote-ai-pricing-gate.ts) · [記録](lib/remote-ai-rate-card.ts) · [記録](lib/remote-ai-rate-card-registry.ts) · [記録](tests/remote-ai-rate-card.test.mjs) · [記録](tests/remote-ai-rate-card-registry.test.mjs) · [記録](app/api/llm/estimate/route.ts) · [記録](components/sky-chat-workspace.tsx) · [記録](docs/evidence/remote-ai-estimate-api-20261001.json) · [記録](drizzle-legacy/post-site-bridge/0042_remote_ai_rate_cards.sql) · [記録](lib/remote-ai-rate-card-store.ts) · [記録](lib/remote-ai-rate-card-operator.ts) · [記録](app/api/internal/remote-ai/rate-cards/route.ts) · [記録](drizzle-legacy/post-site-bridge/0043_a2a_delegation_fanout_limits.sql) · [記録](lib/a2a-delegation-store.ts) · [記録](tests/a2a-client.test.mjs) · [記録](app/api/llm/text/route.ts) · [記録](app/api/legal-guidance/route.ts) · [記録](app/api/patent-research/route.ts) · [記録](app/api/jev-evaluation/route.ts) · [記録](lib/sky-service-status.ts) · [記録](tests/sky-service-status.test.mjs) · [記録](docs/evidence/remote-ai-price-gate-20261001.json) · [記録](drizzle-legacy/post-site-bridge/0044_a2a_live_usage_snapshots.sql) · [記録](lib/a2a-live-usage.ts) · [記録](app/api/sky/a2a-delegations/[id]/usage-snapshots/route.ts) · [記録](tests/a2a-live-usage.test.mjs) · [記録](docs/evidence/a2a-live-usage-local-20261001.json) · [記録](docs/evidence/mcp-pricing-gate-local-20261001.json) · [記録](docs/evidence/product-direction-regression-20261001.json) · [記録](docs/evidence/android-a2a-usage-verifier-20261001.json) · [記録](docs/evidence/android-a2a-wallet-reservation-20261001.json) · [記録](android/core/src/main/java/dev/rock/core/platform/PlatformStore.java) · [記録](android/core/src/test/java/dev/rock/core/A2AWalletReservationTest.java) · [記録](docs/workstreams/03-wallet-billing-providers.md) · [記録](docs/provider-contract-readiness-20260930.md) · [記録](toolkits/sky-mcp-connector/server.mjs) · [記録](tests/mcp-connector.test.mjs) · [記録](public/toolkits/sky-mcp-connector.zip) · [記録](docs/workstreams/02-sky-mcp.md) · [記録](android/core/src/main/java/dev/rock/core/platform/A2AWalletSettlementSync.java) · [記録](android/core/src/main/java/dev/rock/core/platform/A2AWalletHandoffRequest.java) · [記録](android/core/src/test/java/dev/rock/core/A2AWalletHandoffRequestTest.java) · [記録](android/core/src/test/resources/a2a-wallet-handoff-request-v1.json) · [記録](tests/a2a-wallet-handoff-auth.test.mjs) · [記録](android/automation/src/main/java/dev/rock/automation/A2ABrokerDeviceKeyStore.java) · [記録](android/automation/src/androidTest/java/dev/rock/automation/A2ABrokerDeviceKeyStoreTest.java) · [記録](docs/rockstar-device-link.md) · [記録](docs/evidence/rockstar-device-link-local-20261001.json) · [記録](lib/rockstar-device-link.ts) · [記録](lib/request-auth.ts) · [記録](app/api/rockstar/device-authorizations/route.ts) · [記録](app/api/rockstar/device-authorizations/approve/route.ts) · [記録](app/api/rockstar/device-sessions/route.ts) · [記録](app/connect/device/page.tsx) · [記録](components/rockstar-device-authorization.tsx) · [記録](android/core/src/main/java/dev/rock/core/platform/RockstarDeviceAuthorizationFlow.java) · [記録](android/core/src/test/java/dev/rock/core/platform/RockstarDeviceAuthorizationFlowTest.java) · [記録](android/automation/src/main/java/dev/rock/automation/AndroidRockstarDeviceAuthorizationTransport.java) · [記録](android/automation/src/main/java/dev/rock/automation/AndroidRockstarDeviceSessionStore.java) · [記録](android/automation/src/androidTest/java/dev/rock/automation/RockstarDeviceAccountLinkTest.java) · [記録](android/shell-api/src/main/aidl/dev/rock/shellapi/IShellApi.aidl) · [記録](android/shell/src/main/java/dev/rock/shell/MainActivity.java) · [記録](android/shell/src/main/java/dev/rock/shell/ShellConnection.java) · [記録](android/automation/src/main/java/dev/rock/automation/RockShellService.java) · [記録](android/automation/src/main/java/dev/rock/automation/AndroidA2ABrokerEnrollment.java) · [記録](android/automation/src/main/java/dev/rock/automation/AndroidRockstarDeviceHomeTransport.java) · [記録](android/automation/src/main/AndroidManifest.xml) · [記録](android/automation/build.gradle) · [記録](android/shell/src/androidTest/java/dev/rock/shell/ShellBrokerIntegrationTest.java) · [記録](drizzle-legacy/post-site-bridge/0045_rockstar_device_sessions.sql) · [記録](drizzle-legacy/post-site-bridge/0046_remote_ai_text_executions.sql) · [記録](lib/remote-ai-text-store.ts) · [記録](app/api/rockstar/device-home/route.ts) · [記録](scripts/check-os-contracts.mjs) · [記録](app/api/llm/quotes/route.ts) · [記録](app/api/llm/quotes/[id]/route.ts) · [記録](lib/remote-ai-text-http.ts) · [記録](tests/remote-ai-pricing-gate.test.mjs) · [記録](tests/remote-ai-text-public-record.test.mjs) · [記録](docs/sky-cloud-continuity.md) · [記録](lib/remote-ai-text-input.ts) · [記録](lib/remote-ai-text-execution.ts) · [記録](services/sky-agent-runtime/wrangler.jsonc) · [記録](drizzle-legacy/post-site-bridge/0047_remote_ai_text_durable_inputs.sql) · [記録](tests/remote-ai-text-input.test.mjs) · [記録](drizzle-legacy/post-site-bridge/meta/0047_snapshot.json) · [記録](tests/remote-ai-text-store.test.mjs) · [記録](scripts/database-status.mjs) · [記録](tests/database-status.test.mjs) · [記録](docs/database-status.md) · [記録](docs/evidence/remote-ai-cloud-workflow-local-20261002.json) · [記録](docs/ai-native-os-architecture.md) · [記録](docs/rockstaros-1.0-strategy.md) · [記録](docs/rockstaros-product-system-map.md) · [記録](docs/product-north-star-20260915.md) · [記録](docs/workstreams/01-product-ux.md) · [記録](components/home-screen.module.css) · [記録](tests/web-route-style-contract.test.mjs) · [記録](tests/migration-union.test.mjs) · [記録](docs/evidence/sim-service-entry-local-20261002.json) · [記録](docs/evidence/sim-service-usage-rates-local-20261002.json) · [記録](docs/evidence/sim-service-claim-file-import-local-20261002.json) · [記録](android/shell/src/main/java/dev/rock/shell/UsageCurrencyFormatter.java) · [記録](docs/evidence/sim-service-android-usage-status-local-20261002.json) · [記録](android/shell/src/main/AndroidManifest.xml) · [記録](docs/evidence/sim-led-product-direction-audit-20261002.json) · [記録](android/automation/src/main/java/dev/rock/automation/AndroidA2ABrokerDeviceRefStore.java) · [記録](android/automation/src/main/java/dev/rock/automation/AndroidA2ABrokerDeviceTransport.java) · [記録](android/automation/src/main/java/dev/rock/automation/AndroidA2AUsageTrustConfig.java) · [記録](android/automation/src/androidTest/java/dev/rock/automation/AndroidA2AUsageTrustConfigTest.java) · [記録](android/automation/src/main/java/dev/rock/automation/RockApplication.java) · [記録](android/core/src/main/java/dev/rock/core/platform/A2AUsageReceiptVerifier.java) · [記録](docs/rockstaros-1.0-architecture.md) · [記録](android/core/src/test/java/dev/rock/core/platform/A2AUsageReceiptVerifierTest.java) · [記録](android/core/src/test/resources/a2a-price-quote-v1.json) · [記録](docs/evidence/android-a2a-price-quote-verifier-20261002.json) · [記録](docs/evidence/android-a2a-reservation-bridge-audit-20261002.json) · [記録](android/core/src/main/java/dev/rock/core/platform/A2ABrokerAuthorization.java) · [記録](android/core/src/test/java/dev/rock/core/platform/A2ABrokerAuthorizationTest.java) · [記録](android/core/src/test/resources/a2a-wallet-reservation-v2.json) · [記録](android/core/src/test/resources/a2a-broker-authorization-v2.json) · [記録](tests/a2a-wallet-reservation.test.mjs) · [記録](tests/a2a-broker-authorization.test.mjs) · [記録](docs/evidence/android-a2a-native-reservation-core-20261002.json) · [記録](docs/evidence/a2a-price-quote-acquisition-local-20261002.json) · [記録](app/api/sky/a2a-price-quotes/route.ts) · [記録](lib/a2a-price-quote-acquisition.ts) · [記録](tests/a2a-price-quote-acquisition.test.mjs) · [記録](lib/a2a-usage-receipt.ts) · [記録](tests/a2a-usage-receipt.test.mjs) · [記録](lib/a2a-price-quote-consent-store.ts) · [記録](drizzle-legacy/post-site-bridge/0049_a2a_price_quote_consent_events.sql) · [記録](tests/a2a-price-quote-consent-store.test.mjs) · [記録](android/automation/src/main/java/dev/rock/automation/AndroidA2AJson.java) · [記録](docs/evidence/android-a2a-quote-review-source-20261002.json) · [記録](docs/evidence/android-a2a-cloud-draft-bridge-20261002.json) · [記録](docs/evidence/android-a2a-cloud-approval-recovery-20261002.json) · [記録](docs/evidence/android-a2a-native-cancel-20261002.json) · [記録](docs/evidence/android-a2a-detail-recovery-20261002.json) · [記録](android/core/src/main/java/dev/rock/core/platform/A2ARecoveryBinding.java) · [記録](android/core/src/test/java/dev/rock/core/platform/A2ARecoveryBindingTest.java) · [記録](drizzle-legacy/post-site-bridge/0050_rockstar_entitlement_purchase_once.sql) · [記録](lib/rockstar-entitlement-issuer.ts) · [記録](tests/rockstar-entitlement-issuer.test.mjs) · [記録](docs/evidence/remote-ai-text-live-estimate-local-20261002.json) · [記録](lib/llm-providers.ts) · [記録](lib/remote-ai-text-pricing.ts) · [記録](drizzle-legacy/post-site-bridge/0051_remote_ai_text_live_estimates.sql) · [記録](drizzle-legacy/post-site-bridge/meta/0051_snapshot.json) · [記録](tests/llm-providers.test.mjs) · [記録](docs/evidence/sim-service-replacement-ack-local-20261002.json) · [記録](docs/evidence/sim-service-issuer-delivery-store-local-20261002.json) · [記録](docs/evidence/sim-service-issuer-delivery-api-local-20261002.json) · [記録](docs/evidence/sim-service-issuer-rate-limit-local-20261002.json) · [記録](drizzle-legacy/post-site-bridge/0054_rockstar_entitlement_issuer_rate_limits.sql) · [記録](tests/rockstar-entitlement-delivery-http.test.mjs) · [記録](lib/rockstar-entitlement-issuer-store.ts) · [記録](drizzle-legacy/post-site-bridge/0052_rockstar_entitlement_issuer_deliveries.sql) · [記録](drizzle-legacy/post-site-bridge/0053_rockstar_entitlement_delivery_key_ids.sql) · [記録](drizzle-legacy/post-site-bridge/meta/0052_snapshot.json) · [記録](drizzle-legacy/post-site-bridge/meta/0053_snapshot.json) · [記録](tests/rockstar-entitlement-issuer-store.test.mjs) · [記録](docs/evidence/sim-service-android-native-claim-local-20261002.json) · [記録](lib/rockstar-service-offers.ts) · [記録](tests/rockstar-service-offers.test.mjs) · [記録](docs/evidence/rockstar-service-offer-profiles-local-20261002.json) · [記録](components/sky-marketplace.tsx) · [記録](lib/workflow.ts) · [記録](lib/rockstar-package-handoff.ts) · [記録](lib/sky-package-runtime.ts) · [記録](lib/mcp-hub.ts) · [記録](components/mcp-bot-runner.tsx) · [記録](tests/sky-package-runtime.test.mjs) · [記録](tests/rockstar-package-handoff.test.mjs) · [記録](tests/workflow.test.mjs) · [記録](docs/evidence/zema-versioned-plan-local-20261002.json) · [記録](docs/evidence/rockstar-package-zema-handoff-local-20261002.json) · [記録](lib/rockstar-service-package-access.ts) · [記録](tests/rockstar-service-package-access.test.mjs) · [記録](lib/sky-commerce.ts) · [記録](tests/sky-commerce.test.mjs) · [記録](lib/sky-package-runtime-binding.ts) · [記録](tests/sky-package-runtime-binding.test.mjs) · [記録](docs/evidence/sky-package-runtime-binding-local-20261002.json) · [記録](drizzle-legacy/post-site-bridge/0055_sky_package_runtime_bindings.sql) · [記録](lib/sky-package-runtime-binding-store.ts) · [記録](lib/sky-tool-package-store.ts) · [記録](app/api/internal/sky-package-runtime-bindings/route.ts) · [記録](docs/evidence/sky-package-runtime-binding-quote-delegation-local-20261002.json) · [記録](docs/service-design/02-system-contracts.md) · [記録](docs/sky-a2a-bridge.md) · [記録](docs/evidence/sim-led-product-correction-20261002.json) · [記録](docs/evidence/a2a-two-agent-handoff-local-20261002.json) · [記録](lib/a2a-result-handoff.ts) · [記録](tests/a2a-result-handoff.test.mjs) · [記録](docs/evidence/a2a-zema-result-handoff-local-20261002.json) · [記録](docs/evidence/a2a-two-agent-cloud-workflow-local-20261002.json) · [記録](lib/esim-device-install-store.ts) · [記録](docs/evidence/esim-install-proof-concurrency-local-20261002.json) · [記録](lib/a2a-parent-controller.ts) · [記録](tests/a2a-parent-controller.test.mjs) · [記録](docs/evidence/a2a-parent-controller-local-20261002.json) · [記録](tests/a2a-delegation-store.test.mjs) · [記録](docs/evidence/a2a-deadline-sweep-local-20261002.json) · [記録](drizzle-legacy/post-site-bridge/0057_a2a_parent_sequence.sql) · [記録](drizzle-legacy/post-site-bridge/meta/_journal.json) · [記録](lib/a2a-delegation-recovery.ts) · [記録](tests/a2a-delegation-recovery.test.mjs) · [記録](docs/evidence/a2a-persisted-handoff-link-local-20261002.json) · [記録](docs/sky-cloud-operations-runbook.md) · [記録](lib/rockstar-entitlement-delivery-http.ts) · [記録](app/api/internal/rockstar/entitlement-deliveries/route.ts) · [記録](docs/evidence/sim-led-product-correction-followup-20261002.json) · [記録](components/esim-purchase-setup.tsx) · [記録](tests/esim-purchase-recovery.test.mjs) · [記録](tests/rockstar-entitlement-claim-ui.test.mjs) · [記録](tests/rockstar-device-authorization-ui.test.mjs) · [記録](tests/rockstar-service-access-history.test.mjs) · [記録](tests/esim-cloud-recovery.test.mjs) |
| SKY21 | Sky独立サービスの基本利用・作者市場・有料販売・OS/他アプリ接続を証拠別に受け入れる | 進行中 | [記録](docs/sky-launch-design.md) · [記録](data/sky-service-launch.json) · [記録](lib/sky-service-status.ts) · [記録](app/api/sky/service-status/route.ts) · [記録](app/sky/help/page.tsx) · [記録](tests/sky-service-status.test.mjs) · [記録](docs/sky-launch-operations.md) · [記録](components/sky-publisher-form.tsx) · [記録](docs/evidence/sky-pixel-service-acceptance.json) · [記録](lib/operations.ts) · [記録](lib/local-guide-history.ts) · [記録](components/local-guide-history-consent.tsx) · [記録](components/legal-intake-runner.tsx) · [記録](components/patent-assistant-runner.tsx) · [記録](tests/local-guide-history.test.mjs) · [記録](tests/operations.test.mjs) · [記録](components/sky-workspace.tsx) · [記録](lib/sky-feed-ranking.ts) · [記録](tests/sky-feed-ranking.test.mjs) · [記録](tests/web-route-style-contract.test.mjs) · [記録](docs/sky.md) · [記録](docs/evidence/sky-visual-scribe-local-20261015.json) · [記録](app/sky/visual-scribe/page.tsx) · [記録](components/conversation-diagram-workspace.tsx) · [記録](lib/conversation-diagram.ts) · [記録](tests/conversation-diagram.test.mjs) |
| B06 | ココナラ代表受注・制作担当者への個別発注と入出金を安全に管理 | 進行中 | [記録](docs/sky-tools-complete-design.md) · [記録](docs/workstreams/09-business-pilots.md) · [記録](app/sky/tools/[toolId]/page.tsx) · [記録](components/coconala-team-workspace.tsx) · [記録](app/api/coconala-team/route.ts) · [記録](lib/coconala-team.ts) · [記録](tests/coconala-team.test.mjs) · [記録](tests/coconala-sky-entry.test.mjs) · [記録](tests/coconala-workspace-recovery.test.mjs) · [記録](components/use-pending-save-navigation.ts) · [記録](tests/pending-save-navigation.test.mjs) · [記録](lib/owner-intent.ts) · [記録](tests/owner-intent-route.test.mjs) |
| G04 | 重複するsi・MCP・保存・決済・Sky/Zema契約と既存PRを統合し、同一候補を検証する | 進行中 | [記録](docs/git-consolidation.md) · [記録](docs/evidence/common-foundation-integration.json) · [記録](tests/sky-zema-contract.test.mjs) · [記録](tests/shared-stripe.test.mjs) · [記録](tests/mcp-client.test.mjs) · [記録](tests/owner-revision-json-store.test.mjs) · [記録](docs/evidence/pr-consolidation-20261005.json) · [記録](docs/research/rockstar-patent-research.html) · [記録](docs/research/rockstar-patent-sources.json) · [記録](scripts/spider-web-runtime.mjs) · [記録](tests/spider-web-runtime.test.mjs) · [記録](docs/amc-autonomy-fixture.md) · [記録](docs/evidence/amc-fixture-csv-main-integration.json) · [記録](docs/evidence/development-execution/git-04.json) |
| AI09 | 本人決定（2026-09-25 01:26 ET、チャット指示）: Core offline仕事loopとGame最小loopの両方を、OS10完了前にhost／fixture段階で先行してよい。emulator・実機・OS統合の合格には転用しない。AI02〜AI05の依存注記に反映（AI06はGame側作業の担当範囲のため本記録では変更しない） | 完了 | [記録](data/project-status.json) · [記録](docs/workstreams/07-android-device-local-ai.md) · [記録](project.md) |
| DOC05 | PR・task・配備記録なしでmainへ直接入った5コミット（9c1332e・8617863・4b49bf9・862ba30・851bb04）を証拠へ記録し、PR #39のSite試験verify組込みと網羅検査を取り込む | 完了 | [記録](docs/evidence/ledger-sync-20260925.json) · [記録](package.json) · [記録](tests/verify-coverage.test.mjs) · [記録](docs/workstreams/05-web-pwa-sites.md) · [記録](project.md) |
| GM01 | AI06から切り出し: R5 §03 GAME01の最小操作（選択・保持中移動・放す・衝突／結合・分離・取消・時間停止・保存再開）を決定的2D粒子sandboxとしてhost／fixtureで実装し、不正save・版違いを拒否（非金融。R5空間表示・3D入力・実機・OS統合は対象外） | 進行中 | [記録](lib/game-sandbox.ts) · [記録](tests/game-sandbox.test.mjs) · [記録](tests/fixtures/game-sandbox-session.json) · [記録](docs/workstreams/08-game-market-fund.md) |
| CAMPUS01 | 大学別CampusレイヤーとしてPeople・Project・Opportunity・Event・Community・Portfolio・Resource、プロフィールマッチング、NFC/QR入口とsource別匿名集計、block/report/data削除をWeb runtimeへ実装 | 進行中 | [記録](app/campus/page.tsx) · [記録](app/api/campus/route.ts) · [記録](app/t/[tagId]/route.ts) · [記録](components/campus-workspace.tsx) · [記録](components/campus-workspace.module.css) · [記録](lib/campus.ts) · [記録](lib/campus-store.ts) · [記録](db/schema.ts) · [記録](drizzle-legacy/post-site-bridge/0058_campus_layer.sql) · [記録](tests/campus.test.mjs) · [記録](docs/campus-layer.md) |
| CAMPUS02 | Sky NFCカードのColumbia学生向け入口（avocadomini.si転送、host別root、英語3 Tool、任意LinkedIn choice、Phoenix、Jennifer/Zema導線、カード経由の特許si停止）を整合する。Web配備と現物カード受入を分ける | 進行中 | [記録](docs/sky-nfc-columbia.md) · [記録](docs/prompts/sky-nfc-columbia-codex.md) · [記録](sites/avocado-mini/worker/index.js) · [記録](app/page.tsx) · [記録](app/campus/page.tsx) · [記録](app/sky/campus/[campusId]/page.tsx) · [記録](app/sky/campus/[campusId]/columbia-feed.tsx) · [記録](app/sky/campus/[campusId]/page.module.css) · [記録](app/sky/agents/page.tsx) · [記録](app/api/campus/route.ts) · [記録](app/api/patent-research/route.ts) · [記録](lib/campus-tags.ts) · [記録](lib/campus-host.ts) · [記録](lib/campus-linkedin-consent.ts) · [記録](lib/sky-campus.ts) · [記録](tests/campus-host.test.mjs) · [記録](tests/campus-linkedin-consent.test.mjs) · [記録](tests/sky-columbia-phoenix.test.mjs) · [記録](tests/sky-nfc-columbia.test.mjs) · [記録](sites/avocado-mini/tests/preorder.test.mjs) |

段階ゲート（作業全体の完了とは別判定）

| 段階ID | 作業ID | 内容 | 状態 | 先に通す段階 | 根拠 |
| --- | --- | --- | --- | --- | --- |
| B04-INTEGRATED | B04 | 承認後、main/native/設計reviewの3入力と入口を統合 | 合格 | — | [記録](docs/workstreams/06-native-qemu-release.md) · [記録](https://github.com/k999ln/rock/blob/96845e6006c15e39ba5b45495f79c21bdff7399e/docs/os-operational-validation-20260909.md) |
| V01-BOOT | V01 | 旧b8287bc候補のOS起動・安全基礎（現rc2の全体合格ではない） | 合格 | B04-INTEGRATED | [記録](docs/workstreams/06-native-qemu-release.md) · [記録](docs/evidence/os-base/freeze-b8287bc.json) · [記録](docs/evidence/os-base/boot-b8287bc.json) · [記録](docs/evidence/os-base/platform-b8287bc.json) · [記録](docs/evidence/os-base/native-ui-b8287bc.json) |
| B02-NATIVE | B02 | 既存native商品1件をSkyで実処理・保存 | 合格 | V01-BOOT | [記録](docs/workstreams/06-native-qemu-release.md) · [記録](docs/evidence/os-base/business-wallet-foundation-b8287bc.json) · [記録](docs/evidence/os-base/business-backup-acceptance-b8287bc.json) |
| B03-FIXTURE | B03 | 単一ownerの合成Wallet・商品/費用/売上状態の基礎 | 合格 | B02-NATIVE | [記録](docs/workstreams/06-native-qemu-release.md) · [記録](docs/evidence/os-base/business-wallet-foundation-b8287bc.json) · [記録](docs/evidence/os-base/business-backup-acceptance-b8287bc.json) · [記録](docs/evidence/tool-earning-wallet-bridge-20260915.json) |
| V01-ACCEPT | V01 | 旧9abf78a候補でD0〜D6縦断合格（現rc2へ転用しない） | 合格 | V01-BOOT · B02-NATIVE · B03-FIXTURE | [記録](docs/workstreams/06-native-qemu-release.md) · [記録](https://github.com/k999ln/rock/blob/96845e6006c15e39ba5b45495f79c21bdff7399e/docs/os-acceptance-9abf78a-20260910.md) · [記録](https://github.com/k999ln/rock/blob/96845e6006c15e39ba5b45495f79c21bdff7399e/docs/os-native-repeat-20260910.md) · [記録](https://github.com/k999ln/rock/blob/96845e6006c15e39ba5b45495f79c21bdff7399e/docs/os-final-compatibility-20260910.md) |
| B03-PROVIDER | B03 | 実provider/認証済み収益（別の権限・条件が必要） | 未合格 | B03-FIXTURE | [記録](docs/workstreams/06-native-qemu-release.md) |
| B05-COMPARE | B05 | Wallet基礎後のPC比較/再試験。実機価値は別判定 | 未合格 | B02-NATIVE · B03-FIXTURE | [記録](docs/workstreams/06-native-qemu-release.md) |
| GX00-ISOLATION | GX00 | ADR・複数owner分離/本人接続・互換/復旧の合成検証 | 合格 | B03-FIXTURE | [記録](docs/workstreams/06-native-qemu-release.md) · [記録](docs/evidence/gx00/integration.json) · [記録](docs/evidence/gx00/release-required-acceptance-20260910.json) |
| GX01-CONTRACT | GX01 | 複数owner/gameの交換契約と両台帳fixture | 合格 | GX00-ISOLATION | [記録](docs/workstreams/06-native-qemu-release.md) · [記録](docs/gx01-native-ui-20260910.md) · [記録](docs/gx01-reference-sdk-sandbox-20260910.md) · [記録](https://github.com/k999ln/rock/blob/96845e6006c15e39ba5b45495f79c21bdff7399e/docs/game-wallet-release-checkpoint-20260910.md) · [記録](docs/evidence/gx01/final-9abf78a-20260910.json) · [記録](docs/evidence/release-candidate-9abf78a/native-ci.json) · [記録](https://github.com/k999ln/rock/blob/96845e6006c15e39ba5b45495f79c21bdff7399e/docs/gx01-dx01-acceptance-20260910.md) |
| GX01-UI | GX01 | OS上の交換操作と台帳変更後D4/D5再検証 | 合格 | GX01-CONTRACT · V01-BOOT | [記録](docs/workstreams/06-native-qemu-release.md) · [記録](docs/gx01-native-ui-20260910.md) · [記録](docs/gx01-reference-sdk-sandbox-20260910.md) · [記録](https://github.com/k999ln/rock/blob/96845e6006c15e39ba5b45495f79c21bdff7399e/docs/game-wallet-release-checkpoint-20260910.md) · [記録](docs/evidence/hub-final-9abf78a/final-c01-completed-stages.json) · [記録](docs/evidence/gx01/final-9abf78a-20260910.json) |
| DX01-SDK | DX01 | 共通SDK・2作者/2game/2owner・fresh導入測定 | 合格 | GX01-CONTRACT | [記録](docs/workstreams/06-native-qemu-release.md) · [記録](docs/gx01-reference-sdk-sandbox-20260910.md) · [記録](docs/evidence/rls01/sdk-final-9abf78a/README.md) · [記録](docs/evidence/rls01/sdk-final-9abf78a/summary.json) · [記録](docs/evidence/gx01/final-9abf78a-20260910.json) |
| PREVIEW-INSTALL | RLS01 | 旧9abf78aのfresh導入・起動・保存・復旧・削除を完走（現rc2へ転用しない） | 合格 | V01-ACCEPT | [記録](https://github.com/k999ln/rock/blob/96845e6006c15e39ba5b45495f79c21bdff7399e/docs/release-installation-plan-20260909.md) · [記録](docs/evidence/rls01/final-9abf78a/summary.json) · [記録](docs/evidence/rls01/github-direct-install-9abf78a/summary.json) |
| ANDROID-PREFULL | OS11 | 有料full build前に単体APK・emulator・純正Pixel offline si・Sky→Zema→Tool→Walletを完走してfreeze | 未合格 | PREVIEW-INSTALL | [記録](docs/phone-preview-20260911.md) · [記録](docs/product-baseline.md) · [記録](.github/workflows/android.yml) · [記録](.github/workflows/local-ai-apk.yml) · [記録](tests/product-baseline.test.mjs) · [記録](tests/test_prepare_phone_build.py) · [記録](tests/test_stage_local_ai_apk.py) · [記録](tests/test_freeze_phone_build_inputs.py) · [記録](docs/evidence/android-pre-full-build-tests-20260915.json) · [記録](docs/evidence/android-local-ai-plan-v2-20260916.json) · [記録](docs/evidence/android-prefull-input-freeze-20260916.json) |
| DEVICE-INSTALL | RLS02 | 初回flash gate 4/4後、対象1機種でflash・初回起動・OTA rollback・純正復旧を完走 | 未合格 | PREVIEW-INSTALL · ANDROID-PREFULL | [記録](docs/android-first-flash-gate-20260916.md) · [記録](data/android-first-flash-gate.json) · [記録](docs/android-production-signing-custody.md) · [記録](data/android-signing-custody-policy.json) · [記録](docs/android-rollback-index-policy.md) · [記録](data/android-rollback-index-policy.json) · [記録](docs/android-google-stock-recovery.md) · [記録](data/android-stock-recovery-policy.json) · [記録](docs/android-backup-recovery.md) · [記録](data/android-backup-recovery-policy.json) · [記録](docs/android-production-architecture.md) · [記録](data/android-release-architecture-policy.json) · [記録](https://github.com/k999ln/rock/blob/96845e6006c15e39ba5b45495f79c21bdff7399e/docs/release-installation-plan-20260909.md) · [記録](docs/phone-preview-20260911.md) · [記録](scripts/freeze-phone-build-inputs.py) · [記録](docs/evidence/android-prefull-input-freeze-20260916.json) |

次の作業: P0候補同期/固定→P1現v4受入→P2一仕事→P3Sky選択→P4Home。C1/C2は独立。同候補prefull後にP5 compile-only、P6初回flash 4gate、P7同image受入。料金はsi cloudサービスplan、数値未決・実課金/flash gate維持。
<!-- project-status:end -->

## Mini埋込・着脱・衛星Wi-FiとAgent月次請求（2026-10-15）

### Miniカメラ追跡・ジェスチャー入力（2026-10-25）

本人がカメラ追跡による動作/ジェスチャー機能を追加依頼。MAT15/M1のR5単体入力として、まず端末内の手指推定・選択/移動/回転/停止のpreviewを実装する。本人の反応を学ぶEveとの接続意図を保持し、好み推定を実行許可にしない。旧四方向/大型Full-scaleの完成や精密3D受入には転用しない。単体と表示4条件を維持、実カメラ・同一閉箱は未受入。テザリングPR229/231とは別branchで進める。

検証完了: 14試験と独立5negative成功。停止競合・古いworker通知・期限後応答の3指摘を修正しmustFix0。合成canvasで実SDK推論・停止後track終了・外部通信0を独立確認。host全verifyは3024試験/3021pass/0fail/3skipで完走（他suite非加算）。初回OpenSSL版不一致と新test lint失敗は証拠に残し、環境指定/登録形式を修正。保存・CI・main採用は別段階。根拠 [検証記録](docs/evidence/development-execution/mini-gesture-input.json)。

### MINI-08 テザリング制御の実装候補（2026-10-25）

PR229採用確定: 最終head1e6ed3bcをmain `a58c6ffa857389193727b0b6d4a867352f269f77`へ通常統合し、同merge SHA全13CI成功、headとmergeのtree一致、原機能4/別Pixel fixture2のhash不変を直接照合。Linux共通83＋実packet26と全verifyのログを[main確認記録](docs/evidence/development-execution/mini-08-message-main-confirmation.json)へ保存。PR231はこのmainを取り込み、常駐制御5hash不変/103回帰成功、独立metadata検収mustFix0。旧保存head6b155020全14CI成功を保持し、新同期headCIは別確認。

PR229採用準備時の履歴: source4と別Pixel fixture2は元検収hash不変。元45116526全14CIと原機能検収/fixture検収を別履歴とし、main fb604256へ通常同期。新host全verify3025/3022pass/0fail/3skip・build/APIまでexit0。統合metadata別検収→最終head全CI→通常main/同SHA CIで閉じる。実transport/Broker/AP/scheduler/実機/実課金/wholeMINIは未受入。[現行採用記録](docs/evidence/development-execution/mini-08-message-main-adoption.json)。

常駐制御着手（本人の次指示）: PR229のmain統合・同SHA CIは中央Gitと調整し、別branchで既存Broker本人確認・AP再認証・有限schedulerを接続する。期限掃除・有限再送・通信量/料金予約を維持。日米小容量、Mini単体、表示4条件を維持し、実回線・契約・実機は未受入。

常駐制御検収: 開発用Broker本人/端末bindingと毎回guard、APの予約前後認証、有限round-robin tick、private Unix入口を実装。網側予約/AP照会中の本人期限切れと旧PSK再接続を独立反例で修正し、service20件・独立負例9件・全Mini103件のwrapper成功、mustFix0。[専用検収](docs/evidence/development-execution/mini-08-message-service-review.json)。全verifyは初回のsuite60秒制限と旧node_modulesの不一致を切分け、suite180秒/lockfile同期後に最終までexit0（主2993件/2990成功/3skip/失敗0、他suite非加算）。通信の個別期限は変更しない。新source `9dae624b` はDraft PR231へ保存。同SHA全14CI成功（Linux共通103件＋実packet26件・全verifyを含む）。最終metadata headとmain採用は別追跡。PR229のmain採用は中央Gitと別追跡。

開発用message service採用準備: 原f27faea8全14CI/独立mustFix0のsource5と依存7を固定。main bb11を通常同期し、旧status全fieldとMini229/eSIM/Smith currentを保持してmessageServiceだけ追加。元Mini229 adoption receiptはbyte不変へ戻し、作者確認は別fileへ保持。新host103試験と標準fullverify3027/3024pass/0fail/3skip成功。実製品identity/transport/Job保存/実機/金融/wholeMINIは未受入。[現行採用](docs/evidence/development-execution/mini-08-message-service-main-adoption.json)。次は最新main再同期とRoot固定headmetadata/新headCI/mainCI。

共通message adapter着手（2026-10-25本人指示）: 日米のsi・メッセージ・小ファイル向けに、分割・有限再送・保存期限と既存byte/cost予約の共用を実装する。PR221はmain `3bb3be25`へ通常統合・同SHA全7CI成功。[統合証拠](docs/evidence/development-execution/mini-08-hardware-main-merge.json)。機種・契約・実RF/物理受入は未確定、Mini単体と表示4条件を維持。

共通message検証: host回帰83件成功、独立60件＋追加負例8件成功・mustFix0。CAS迂回、失効再許可時の旧queue復活、callback再入deadlockを修正し、停止/送信を専用入口で直列化。受信内容は消費側の保存確認まで再取得可能。全verify完走exit0（主回帰2986件/2983成功/3skip/失敗0、他suiteと非加算）。[証拠](docs/evidence/development-execution/mini-08-message-adapter.json)。GitHub branch/PR229へ保存。隔離Linuxも同source83件＋実packet26件成功。初期head CIは13成功・既存Pixel正常系fixture競合1失敗で、製品sourceを変えず明示待合せへ修正し、650ms fsync遅延の独立負例で旧失敗/修正後成功・保存失敗時拒否を確認。同期source head `f59be1af`の全14CI（全verify・実Linux packet含む）成功。最終metadata headのCIはPR229へ結び、message adapterのmain採用は別追跡。

統合確認: PR215はhead `04f5e757` 全14CI成功・独立検収mustFix0後、main `52b3d1d9`へ通常統合。tree一致と同SHA製品CI全13成功を確認。[統合証拠](docs/evidence/development-execution/mini-08-access-main-merge.json)。当時の別枠Dependabot zod更新失敗は成功へ含めず履歴保持。後続PR225/main f4の修正と製品7/自動更新2成功は別証拠で確認済み。手元の広い回帰で既存sky-activation1件が10秒timeout、同source単独再実行4/4成功。後続資料の独立検収では測定記録を補い再検収mustFix0。


本人回答反映・検証: 初期対象を日米両方のsi/メッセージ/小ファイルへ確定し、9704/NB-NTN優先、9770一般IP後段へ順序を更新。国別受入profileと未実行境界を同期。独立差分検収mustFix0、mission/project/design・台帳境界チェック成功。[選択反映検収](docs/evidence/development-execution/mini-08-owner-choice-review.json)。更新headの全体verifyはPR221のCIで別追跡。

後続準備着手: 内蔵衛星modem・antenna・保護付き電池pack/セル・回線契約の[候補比較と実機試験準備](docs/avocado-mini-r5/satellite-hardware-trial-plan.md)を追加。9770の一般IP、9704のIMT、NB-NTNのUDP主体通信を区別し、共有許諾・網側hard cap・同一閉箱の収納/電源/熱を採用前条件とする。初期地域は日本と米国、用途はsi・メッセージ・小さなファイルに本人確定（2026-10-25）。9704/NB-NTNの小容量通信を優先比較し、国別profileで受け入れる。数値目標・機種/契約は未確定、購入/契約/無線送信/実機合格は未実施。単体携帯、端末/通信量/料金上限と表示4条件を維持。 比較は公開公式資料で実施。Directoryは認証期限切れのため利用不可。部品/料金の採用は保留し、日米それぞれの共有/用途許諾とhard capを満たす候補からP0の残項目を埋める。

AP/網側adapter検証: 端末別PSK、管理下hostapd子process、署名付き網側hard cap/予約/照会/停止を追加。local予約→remote予約→nftの順を強制。host/TLS55件、隔離Linux26件（実packetと実hostapd driver=noneの親kill/復旧を含む）成功。独立検収で指摘された停止経路・daemon世代・応答喪失復旧・親死亡・atomic保存を修正。独立再検収mustFix0、host55件独立再実行成功。最終sourceで全体npm run verify完走exit0（主2938件/2935成功/3skip/失敗0、仕事API1678/CSV385）。[検証証拠](docs/evidence/development-execution/mini-08-access-adapters.json)。PR215へ保存。初回CIで試験helperのcwd依存とTLS試験server最低versionを検出し補正（runtime不変）。独立補足検収mustFix0、Linux上のhost55/packet26を別cwdで再実行成功。SPIDERの公開source digest誤検出3値×2pathは独立検収・policy10/10・履歴scan0後、PR217をmain bcf5345cへ通常統合（head7CI成功）。最新mainを競合なく同期し、control固定refを採用済みbcf5345cへ更新。runtimeはa5fb3936と不変。PR215の更新head CI/mainは別追跡。[実装契約](systems/rock-star-os/targets/avocado-mini/tethering/ACCESS.md)。

着手: PR212の最新main同期・独立検収・全14head CI後、main41ee45d7へ通常統合し同SHA全13CI成功を確認。本人の次指示でAP端末認証と衛星網側上限の共通adapterを実装開始。事業者・modem未定のため共通protocol/試験を先行し、契約・機器・実回線・実課金の受入は別にする。

判断更新: Linux下位制御の実装・実packet試験へ進んだ。Linux packet gate候補では、同一grantのIPv4/IPv6・送受信を共有quotaで強制し、停止・離脱・再起動時に旧許可を閉じる。隔離Linuxの実packet20件とcompiler4件に合格し、独立静的/host検収mustFix0。counterは最終確定とせず予約を保持する。実衛星/AP/Broker認証・Provider請求・電池の受入は別途必要。 [Linux証拠](docs/evidence/development-execution/mini-08-linux-tethering.json)。Linux組合せ候補の全体verifyも完走exit0（主2912件/2909成功/3skip/失敗0）。[全体検証証拠](docs/evidence/development-execution/mini-08-linux-tethering-full-verify.json)。別Draft PR212へ保存しsource head `08633c36` の全14CI成功（host32/実packet20）。[CI証拠](docs/evidence/development-execution/mini-08-linux-tethering-ci.json)。その後、最新main同期head dc070755を独立検収し全14head CI成功、PR212をmain41ee45d7へ統合、同SHA13CI成功。[統合証拠](docs/evidence/development-execution/mini-08-linux-main-merge.json)。次: APの認証済みclient bindingとProvider上限。表示4条件・Mini単体携行を維持し、実機/公開合格へ昇格しない。

着手: 本人のMini単体衛星→Wi-Fi/携帯/端末・通信量・料金上限管理指示でMAT15/M1のROCK作業を開始。GitHub main `0d72671739a8bdd3969b539c5f09ef54a90e1bea` の読戻しと同SHA plain snapshotを基点に、Root共有WIP/旧光学を保持。判断: 実adapterが未確定のためhost制御と下位強制を分ける。検収でoverrun後のcounter巻戻し、再起動時の旧dock給電、記録上限表示を修正。Mini単体の衛星→Wi-Fi共有について、端末許可/失効、送受信量と費用の事前予約、ドック離脱、停止/期限、SQLite保存と再起動復旧のhost制御prototypeを追加。架空回線の試験であり、実modem/AP/kernel強制・本人UI・Provider課金・同一閉箱は未接続。板/膜なし、少ない表示部、上下全範囲、低眩しさを保持する。

局所検証と独立検収・全verifyの結果は [docs/evidence/development-execution/mini-08-tethering.json](docs/evidence/development-execution/mini-08-tethering.json)。 原本receiptは初回snapshot時点の履歴として保持。PR208 main `2854d069` の専用Git worktreeへ採用し、Node wrapperのawait漏れ1行を補正して独立検収mustFix0。OpenSSL3とmacOS waitid対応Pythonで全体verifyを完走しexit0（主回帰2912件/2909成功/3skip/失敗0）。[採用・全体検証証拠](docs/evidence/development-execution/mini-08-tethering-main-adoption.json)に環境差と補正を記録。最新main `81aca294` の既存進捗を保全してPR211へ保存、通常main統合 `55a5193e` と同SHA全12CI成功を確認。統合treeは検収headと完全一致。[統合証拠](docs/evidence/development-execution/mini-08-tethering-main-merge.json)。次はPR212統合済みLinux制御から実AP/回線/電池条件の受入へ進む。

MAT15/M1主担当、BIL02/O5連携。利用者のGitHub反映指示により最新mainから今回の設計だけを切出し、サービス設計08へ統合。原本package/料金hold/実機gateを維持。runtime・回線契約・実請求・口座操作なし。次はDP01〜05と請求sandboxの受入。保存/PR/main統合はGitHub記録で別追跡する。

検証: project/mission/baseline/design合格、R5原本26hash保全、基準/R5試験5/5合格。初回全体verifyで旧外部給電必須のテスト1件を検出し、新携帯電源要求へ同期。最終全体検証と同一head CIはPR #142で追跡する。

最終ローカル検証: 回帰2234成功/1skip、型/lint、全設計/基準/担当、Web build/asset closure、仕事API1381・CSV385合格。verifyはsite専用依存不足で一度停止し、依存導入後に停止stage以降をbot:checkまで再開して全て成功。同一headのGitHub CIはPR #142で確認中。

## 2026-10-16 — Sky Stripe sandbox接続と決済受入（BIL02 / O5、JOINT）

着手: 本人がSandboxのCLI接続を承認。対象account一致を確認し403を解消。send_invoiceに必要なテスト顧客email不足を修正中。旧失敗請求は保持し、fresh合成利用量で請求→テスト決済→署名通知を検証する。本番課金・実Cloud実行・定額自動回収は対象外。

検証: 修正後のfresh合成DBでStripe test請求1 USD→テストカード全額入金→署名通知HTTP 200→Sky paidを確認。unit 10/10。旧失敗DBは保持。[同一source hashと証拠](docs/evidence/sky-cloud-monthly-test.json)。全体 `npm run verify` はNode 22.23.3 / WRANGLER_HIDE_BANNER=trueで全段階成功（exit 0、/private/tmp/sky-claimed-verify.log）。再起動後も同一請求paidを復元。再開は5223・claimed.sqlite・同じSandboxで行い、実Cloud予算・定額契約の受入を別に進める。

2026-10-16 BIL02検証: Sky 140の2期間140 USD請求、枠内usage追加請求0、決済失敗/復旧、古いpaidだけで解除しない判定、署名通知を実Sandboxで確認（10項目）。最初の失敗用カードはattach時に拒否されたため、公式のattach成功後に失敗するテストカードへ変更し、既存invoice IDから再開した。6単体試験成功。Node22.23.3 / WRANGLER_HIDE_BANNER=trueで全体npm run verify全段階exit 0（/private/tmp/sky140-verify.log）。再起動後の報告復元とStripe請求が2件・各140 USDのまま不変を確認。顧客の実同意/自動月次回収/実Agent制限を完成扱いにしない。

Pixel OS11/O6: 4Bの旧20件は形式・保存・正常Job継続合格だが、制御記号混入と重複隠蔽を検出し内容未受入。checkpoint v3を5件/保存・raw180秒・lease240秒へ変更し、混入は除去せず拒否。旧v1/v2読取・60生成+seal backup/停止を検証する。300件・自動選択・現行Coder実機受入は未完了。

Pixel v3手動4B20案: 実機370.282秒、5工程すべてattempt1、実20件保存、制御記号/完全重複なし。洗濯と体調など関連性が弱い案もあり、有用性・一般品質は未保証。policy v3は発想/文章4B80、コードCoder90、記事/要約/翻訳General50。新規300件自動実行とruntime7 Coder受入を次に実施。

OS11/O6連携Security: 公開4B tokenizer metadata digestを既定secret scannerがgeneric-api-keyとして誤検知。固定GGUF全hashとmetadata再計算で確認し、値+catalog一位置のAND例外を追加。実scannerの10例外/変異/別位置試験合格、全履歴scan候補0。policyを先にcommitし、そのcommitへcontrol pinを更新する。300件は現在自動生成中、未完了。

Pixel300の途中20件読取りで旧24字schemaによる文末切断・大文字SIを発見し、当該仕事だけ実UI中止（保存25件保全）。package8/raw ideas-v2/headroom48字、Broker96bytes維持・checkpoint4・SI→si整形へ修正中。旧完了20件も一般品質に昇格させない。新しい実APK/20→300受入は未実行。

package8実build受入: run39072982374/source31414985、unsigned SHA689bdfa94de242f7cef377d2351290ba554c34f74dcecd0e5460e91a00bc7242、signed SHA0ec94d4270c87d33b17f65f37388d2f8f55cc923244ea1dbbef14b5197ed1008。実bytes/arm64/noInternet/既存signer/payload一致合格。Pixel新profile2の再導入と20→300は未完了。

package8最初の導入はBrokerのPACKAGE_VERSION_CODE旧値7が安全側で拒否し、新規取得前に停止。前回progressファイルの読違いを訂正。client/contract版照合をsource gateへ追加、開始失敗をUIから即検知し旧試験ファイルを使わないharnessへ修正。重み再利用機構は既存に存在し、修正後の実導入で確認する。

Native8/raw-v2の実20件は397.822秒・5工程attempt1、文末/si表記/番号/完全重複/保存合格。ただし不要な家具・温度連動の弱い内容があり、実用性は保留。prompt契約v5でソフト単体を許し、分野の困りごとを助ける具体動作を求める。旧v4履歴保全・生成再開は明示再計画。General/Coder再受入と新20→自動300を継続。

Git同期: main43cf290e（Sky無料Cloudのbounded自動続行/画面外継続、PR161/162）を統合。競合はPixel資料とCloud追記を双方保持して解消。Android/native入力へのmain新差分は0、実機APKの入力を変えていない。main統合済みはこの作業branchへの取込を指し、PR158のmain公開受入は未完了。

Native8のauto General6 summaryは29.578秒で3工程保存が通るが英語本文のため日本語内容は不合格。指定言語を元依頼のdataとは別のprompt controlへ固定し、本文だけの日本語検査を実機harnessへ追加。auto Coder5は29.514秒、正しいsum_even本文を実保存・コード非実行。最新候補で再試験する。

Native8/prompt5の手動20件は533.698秒、5工程attempt1、実20件/si表記/番号/完全重複/制御記号検査合格。限定draftとして発想auto80へ接続し、関連性/実現性/一般品質は本人確認を維持。現在8da版でCode40.923秒、導入境界/SQLite5実試験、UI14報告=13実/1optin skip、実通知tap/公開検索合格。日本語要約は言語/保存合格だがSky/Zemaの役割混同があり内容未受入。main43cf統合後の通常verifyは既存process timing3失敗、対象40試験は直列成功。同時数2で全体verify成功（assert/試験範囲は変更なし）。新auto300は次に実行。

最終app source dba3389aの実機再検証: 導入境界/SQLite5実試験、UI14報告=13実/1skip（実通知tap/公開検索）、実DB全body hash/元24仕事70artifact保持が合格。新auto300を既存の一仕事として実行開始、実5件保存を確認。未完了のためphysicalAccepted/300Acceptedはfalse。実行中にBroker instrumentationを重ねず、完了後のreadbackと同一head CI/mainを続ける。

LLM台帳の旧avocadoOS固定checkを現行product-identity正本のdisplayName/releaseName/internalIdentifier照合へ同期。内部dev.rockと過去証拠は維持し、版や名称を実機完了へ換算しない。実300ジョブは継続、code/APK更新なし。

実auto300は30件でLOCAL_GENERATION_TIMED_OUT（生成step6、attempt1）により停止。v6短縮contextとShell22の一度だけの明示compact復旧を実装中。同owner/pin/同意/expected digest/純粋発想timeout/eventを検査し、旧30件artifactや成功runを書き換えない。新Root仕事を作らず続行し、復旧介入1件を記録する。完了・無介入自動完走とはしない。

実機compact復旧: 同じ300件仕事を実UI確認dialogで一度承認し、35件まで新たに保存。旧30件/元依頼/目標をread-only DBコピーのhash検証後に比較して不変、human_compact_replan event1。最初のharnessは非同期受付前snapshotで停止と判定したが、実処理は受理済み。二度目の復旧を呼ばず既存running監視へ切替。将来用harnessへdurable ack待機を追加し、実機へ途中再インストールはしていない。300全完了は未受入。

compact後の実機APKはapp source ef20d8ae、Broker SHA29e122b8dfca6c6703ca842a1e9e7d21296d716c76ba5b7cdb325077f6aacdef、Shell SHAccbea1131fd84e014f191befe979ead4302c743b17615607daaa43d203188002、Native8 SHA0ec94d4270c87d33b17f65f37388d2f8f55cc923244ea1dbbef14b5197ed1008。実機読戻しとhost build一致。旧30件はdba版、新しい残件はef20版のsegmentとして記録。45件まで保存、復旧1回、実行継続中。新API22に対する旧SIM entry source期待値21を22へ同期し、製品境界やassert範囲は維持。

現行入口の整理: README/LLM正本/次プロンプトをNative8・Shell22・checkpoint6へ同期し、旧General発想候補と25件中止試験を現在の経路から分離。実300件は一度のcompact復旧後も同仕事で生成中。追加ソース変更や実機APK更新は行わず、終了後の境界/通知/readback受入を待つ。全体verify compact22-fixedは全stage exit0（ファイル並列2）、design:check合格。

2026-10-17 OS11/O6/ROCK・SKY07/SKY21同期: 本人の最新Sky方針をbaseline・融合契約・全OS/Tool詳細・設計索引へ反映。機能/作者の固定と公式による優遇を製品条件にせず、作者共通の互換/権限/版/更新/失効を維持。現Pixel固定catalogの検証範囲と動的native導入未実装を分離。実行中300件のAPK/promptは変更しない。

実auto300のv6監視は5,595.623秒で220件まで実保存した後、step44/attempt1のLOCAL_GENERATION_TIMED_OUTで失敗。step42の形式/重複等の拒否は自動2回目で成功。compact復旧は1回のまま、220件/旧30件/元依頼/pinを保全し、300件未受入。ロック解除待ちの間に、既存の通常再試行ボタンを一度だけ実UI操作するopt-in harnessへ変更する。監視だけの再開が黙ってretryする旧分岐を拒否し、ready/対象仕事/純粋発想timeoutを照合、操作のackを待つ。timeoutやleaseを延長せず、追加手動介入も受入記録へ残す。現時点では通常retry未実行。

通常UI再試行: ownerのロック解除を実測で確認し、既存「止まった工程を再試行」を一度だけ操作。human_retry event1/compact event1、新規Rootなし、旧220件/元依頼/目標を保持し、実225件保存へ進んだ。モデル実行中のBroker instrumentation/更新は再び禁止。Mac全体verifyと該当D1 stageはwrangler spawn30秒timeoutで失敗、同一source b33024b2のGitHub全体verify run39085208518は成功。Sky本体と設計portalもaddプラグイン方針へ同期し、portalの旧入口文を現baselineへの参照へ直す。

実機最終受入: 同じauto4B2の実300件がreviewに到達。60生成+sealの全prefix連鎖、最終16,274bytes/SHA5418343ae39cc80f2d9659eb72aa3f8d489472d8814ff4c3842e894ca9c8b2e6、番号/実数/si/完全重複/制御記号とBroker再起動後同bytesを照合。compact1/通常UI retry1/有限拒否再生成3、無介入完走とはしない。現EF APKでauto Coder5 48.189s、実手動chooser Coder5 41.258sの生成・保存、コード非実行。通知tap/公開検索を含むUI13 actual+既存skip1(24.24s)、境界/SQLite5 actual(0.729s)、元24仕事/70artifactを含む全248body hashが合格。内容の弱い関係・意味重複と一般background/全OSは未受入。Git保存/main統合はPR158のmergedAt/mergeCommit・current mainを正本に別確認する。

最終main同期: c1ba4106（PR165）の公開Sandbox cap/未払い/翌月復旧と、cold D1 migrations起動budget修正を取り込む。3件の文書/進捗競合は双方を保持して解消。Android/Native入力差分0なので実機APK/source EFの証拠は維持し、Web Sandboxの受入をPixelへ転用しない。main側のD1起動修正があるため、最新同一headの全体verifyを再実行する。


## Skyの動的追加とPixel実行（2026-10-17）

OS11/O6/ROCK主担当、SKY07/SKY21連携。本人の「固定カタログに縛られず追加してPixelで実際に使う」指示で着手。main f8a0217eを基準に、owner別の版付きモデル定義/宣言型local Agent、同意・互換・hash・失効・既存Zema保存を実装する。実機受入は未実行。


初回実機受入（source ffb7f1b0 / private API23）: 非同梱bartowski/Qwen2.5-0.5B-Instruct-GGUFの実検索→owner定義追加→397,808,192bytes実取得/全hash/埋込metadata/ロード→要約/保存は56.823秒。ただし本文が生成指示のechoで内容不合格。Agentは出典情報の4項目目を旧3項目validatorが拒否しLOCAL_REQUEST_REPLAN_REQUIREDで停止。どちらも完了/品質受入へ昇格しない。private API24候補で出典のexact再構成検査・SDKの指示echo拒否・形式試験と本人確認を経た作業別自動候補・revision競合拒否・Agent再同意有効化・仕事詳細のAgent名表示を追加する。元の仕事/成果は保持し、同じ失敗Agent仕事の明示retryと新モデルのコード実生成を次に検証する。


API24候補325150d7: Android unit218件（SDK release同内容21件は別実行）、build/lint、全体npm run verify全段階exit0（test-file並列2、assert範囲不変）。実機は再ロックされ、境界3試験とAgent1試験がDEVICE_LOCKED/前提で拒否されたため未受入。解除依頼を一度提示し、試験中だけKEEP_SCREEN_ONを持つopt-inウィンドウを追加する。読取り専用DBコピーで元65仕事/248artifactの全保持・状態不変と現67仕事/252body hashを確認。CI prototypeは試験fixtureが署名catalogのJSONObjectを共有参照のまま改変したため署名不在を正しく拒否。fixtureをdeep copyへ修正し、実装の署名検査は保持する。


2026-10-18 API24実機再開: owner解除後の独立境界3件が成功。同じAgent仕事を通常retryで一度だけ再開し3工程成功/review、同request ID同仕事・失効時新規利用拒否/成果保持・再同意有効化を確認。ただし生成本文は役割説明として不十分で内容未受入。非同梱0.5Bの実コード生成はLOCAL_DRAFT_TASK_CHANGEDで停止し、自動候補化せず、試験仕事だけを明示中止して記録を保存。公開bartowski Coder1.5Bの別量子化Q5_K_Mを同じ汎用追加経路で試す。既存0.5B/旧仕事/成果は削除しない。実装source325の変更はなく、opt-in試験の入力指定と保存成果の再表示検査を追加。


API24実機最終: 非同梱bartowski Qwen2.5-Coder1.5B Q5_K_M（固定1af47f78、1,125,050,656bytes）を公開検索→未チェック同意→実取得（cacheなし）→全hash/metadata/Native8 load→実コード保存まで97.250秒。追加モデルのコード再試験26.240秒で正しいsum_even本文を保存、コード非実行。codeのみ本人同意のauto候補60へ設定し、未試験summaryは拒否。標準codeは既存Coder90を選び、新候補の最良判定にはしない。宣言型Agentの日本語依頼は43.690秒でSky/Zema役割を正しく一文保存、同ID再送・無効化・成果保持・再同意が成功（一般品質は別）。Broker process再起動後の同artifact hash/UI表示1件、Agent同意未チェック/実モデル表示/新規仕事0を確認。通知tap/公開検索を含むUIは13実行+既存opt-in1未選択（JUnit14報告）。旧catalog4固定assertは既存4+owner追加全IDのexact集合・重複拒否へ同期、入力欄hintなしを考慮する試験修正のみで製品コードは不変。元65仕事/248artifactと旧状態を保持、現75仕事/276全body hashを確認。端末読戻し3APK hashも一致。main cf01d289の並列Cloud polling修正を取り込み、Android/Native入力差分0。同期後の全体npm run verifyは全stage exit0（Node22/ファイル並列2）。同一head CI/main統合は次に確認する。


動的追加の証拠・LLM台帳・全体索引・担当入口・README操作方法・次プロンプトを実機結果へ同期。project:update、design:check、llm:architecture:check、baseline:checkとdiff検査が成功。最終CI/mainの正本はPR167のexact head/check-runs/mergedAt/mergeCommitであり、この文書commit時点の未統合と本番公開を混同しない。

## Jenniferの本体化とZema実行構造（2026-10-21）

AMC02主担当、G04連携。Jenniferを利用者に見える唯一の統括窓口へ置き、Zemaを仕事・承認・証拠・未完了の実行台帳、AMCをZema内の逆算分解、project siを文脈責任者、specialist si/Toolを限定実行者として再編した。`/chat`はJennifer名、プロジェクト検索、担当si、専門si、構造説明を表示し、技術用語は主画面で日本語へ変換する。`Jenniffer`は過去表記としてのみ保持する。

本人領域の正本は`https://avoado.si`へ固定し、passkey RPも`avoado.si`のみとした。Columbiaと生成Sites hostのJennifer/AMC/Job/A2A private APIは別D1へ書かずfail closed、画面GETは正本へ転送する。内部8プロジェクト一覧は`JENNIFER_PORTFOLIO_OWNER_ID`一致時のみ表示し、外部A2A本番送信はprovider trustと実行承認が揃うまで無効を維持する。

ローカル受入はJennifer契約・host routing・passkey・owner auth・session recovery・visual contractの67件、typecheck、oxlintが合格。既存本番readbackではmain SiteにJennifer D1表が未反映、Columbia側には存在することを確認したため、mainへのmigration付き配備と再readbackを完了条件に残す。証拠は`docs/evidence/jennifer-surface-architecture.json`。


## 未統合runtimeの整理

G04 / ROCK。main 8a95ee6f起点の専用cloneでEve履歴・Linux/service・成果持出しとadapterを現行設計へ統合中。共有dirty685件と途中96変更をGit外へ保全。root0030〜0032とmain Site0026はadditive。旧UI/生成物/重複migrationを除き、現行mainの権限・料金・復旧修正を維持する。全verify・同一SHA CI・main統合の結果は冒頭と統合台帳へ記録済み。公開・実機・実課金は別gate。

PR #254の初回Linux CIは3355件中3346成功・4失敗・5skip。UI fixtureの固定8回待ちがworker-pool hash完了を待たない競合を、最大5秒の条件待ちへ修正した。既存のowner・停止・再送assertionは維持し、作者UI58/58・16並列実行と独立10/10が成功。新HEADとmain同SHA CIは未確認として保持する。
