# Rock star — 事業・設計・進捗

## 2026-09-12 — Skyへ「特許出願アシスタント」を追加

Skyのready商品として、ソフトウェア・システム発明の整理、公開状況警告、公式特許情報に限定した候補調査、明細書・請求項・要約・図面指示・提出前チェックのドラフト作成を追加した。発明内容は保存せず、外部AIへの送信は明示同意後だけ行う。

特許性、登録、侵害回避、期限は保証しない。候補文献と請求項は人が原文と差分を確認し、電子署名、料金支払、特許庁への提出はSkyから実行しない。[実装と安全境界](docs/sky-patent-assistant-20260912.md)。

## 2026-09-12 — Skyへ「日本語法律相談受付」を追加

自動化Hub（Sky）のready商品として、相談内容をブラウザ内だけで整理する日本語法律相談受付を追加した。安全・逮捕・公的書類・期限を先に確認し、一般情報で足りる場合は公的案内、弁護士相談が必要な場合だけ引継ぎ要約と分野・地域に合う候補を表示する。候補は利用者提供の領事館公開リスト33件に基づき、推薦・斡旋・受任保証ではない。

個別の委任契約書に含まれる依頼者情報、事件、報酬、支払条件、署名はGitと画面へ収録していない。相談本文も保存・外部送信せず、連絡は本人が内容を確認して行う。法的助言、期限計算、勝敗予測、弁護士関係・秘匿特権の成立、利益相反確認、予約・契約は対象外。[実装と安全境界](docs/sky-legal-intake-20260912.md)。

## 2026-09-12 — Skyへ「サブスク顧問」を接続

自動化Hub（Sky）のready商品としてRockstar Ledgerを追加し、同じPCで動くSQLite台帳の月額、要対応、更新日、契約一覧を読み取り専用で表示する画面を実装した。配布ZIP、MIT全文、Codex skill、stdio MCPを同じGitへ収録し、個人の契約・明細DBは収録しない。Skyからのブラウザ接続元はloopback HTTPだけに限定した。

利用者の提案を受け、ツール一覧だけでなく役割を持つ担当者と話して進めるAgent Hub方針を追加した。最初の実装としてサブスク顧問へ質問例と自由入力を追加し、月額、要対応、次回更新、全体要約を外部AIなしで回答する。各担当はMCP allowlist、data scope、本人確認、memory、receiptを持ち、外部変更はpolicy gatewayを通す。[役割エージェント仕様](docs/sky-role-agents-20260912.md)。

今回はローカルSkyでのPC接続と読み取り会話までを対象とし、HTTPS配信版のloopback接続、Native Sky MCP brokerへの常駐、Walletへの費用転記、解約・支払い・申告は未実装のまま保持する。[実装・安全境界・検証](docs/sky-rockstar-ledger-20260912.md)。

追加で全網羅監査を実装した。Apple、Google Play、カード、銀行、PayPal、請求メールの6情報源と確認期間を追跡し、全情報源の解決と継続契約の更新日入力が揃うまで完了と判定しない。現在の個人台帳は既知18件（過去・終了10件）を保持する一方、情報源0/6確認済み、明細0件、更新日3件不足のため未完了と表示する。SkyチャットとMCPも同じ判定を返す。
## 2026-09-12 — スマホで実行画面が左へずれる不具合を修正

スマホ幅ではDialogを下端固定へ変更していたが、共通Dialogの中央配置用`translate`が残り、画面幅の半分だけ左へずれていた。スマホ用Sky DialogでTailwindのX/Y移動量を0へ上書きし、公開用CSSの最適化後にも指定が残ること、横幅413pxで左端0・右端413pxに収まることを実画面計測で確認した。

## 2026-09-12 — Skyの操作を依頼・選択・実行の3段階へ整理

重複していたSky見出しを撤去し、最初に自然文で依頼できる欄、スクロール中も残る絞り込み・検索・掲載操作、各投稿の一つの実行ボタンへ整理した。文章で依頼した場合は会話内で担当を示してから「ツールを開く」へ進み、役割ボタンとTimelineからの1タップ起動は維持する。スマホの実行Dialogは下から開く全面シートに変更し、閉じる・入力・実行を片手で追いやすくする。

## 2026-09-12 — Skyのヘッド・フッター・実行画面を黒へ統一

Sky本体の上下に残っていた白い共通ヘッドとフッター、および白いツール詳細・実行Dialogを、Skyと同じ黒背景・細いグレー境界へ統一した。他ページの共通表示は変更せず、Sky表示時とSkyから開いたDialogだけに適用する。

## 2026-09-12 — Sky Timelineを一列へ削減

利用者評価を受け、演出中心だったSky画面からLIVE見出し、待機表示、処理フロー、説明ラベル、条件チップ、右側の掲載・接続パネルを撤去した。残したものは依頼欄、4つの役、検索、ツール投稿、実行ボタンだけ。黒地と細い区切り線を基調に、動きは投稿の短い表示とタイムライン上の低速な光だけに限定した。

文章送信から担当ツールを開く1操作、役ボタンから開く1操作、候補と利用可能ツールの区別、PC初回接続、安全確認用の詳細Dialogは維持した。スマホ幅の実画面で先頭表示と案件判断役の起動を確認した。

## 2026-09-12 — Skyをライブ実行タイムラインへ再設計

白い一覧型のSkyを、依頼から担当選択、ツール起動までが一本の流れとして読める濃紺のライブタイムラインへ変更した。光が流れる縦軸、接続状態の脈動、カードの段階表示、担当決定時の応答アニメーションを追加し、ブラウザ実行の1タップ導線とPC初回接続の安全境界は維持する。

スマホでは役割を横送りにし、実行ボタンを優先表示する。`prefers-reduced-motion`では継続アニメーションを止める。実画面で「今使える」への切替と4件への絞り込み、スマホ幅の表示を確認した。

## 2026-09-12 — Skyの役割をワンタップで開く

SkyのX型Timelineと会話受付を維持し、文章の送信または4つの役ボタンから、ブラウザ実行画面を追加操作なしで開くようにした。PCが必要な納品確認は同じ操作で接続画面を開く。外部送信、料金、権限の本人確認は省略しない。

日本語法律相談受付を現在のSky Agent Hubへ統合した。Timeline投稿、法務受付の役割ボタン、自然文の依頼から会話型受付を開ける。公開連絡先33件、ブラウザRunner、公式情報限定の法令AI、安全判定、弁護士引継ぎを同じ画面で利用できる。

## 2026-09-12 — 多機種対応を共通Core＋機種別packageへ固定

利用者の決定により、RockstarOSは一つの汎用imageを全端末へ書き込む方式ではなく、共通Coreと機種／SKU別Device Support Packageを組み合わせる。提供区分を完全なOS、Android GSI実験版、既存OS上のclient、非対応の4種類に分け、対応台帳と自動検査で誇張を防ぐ。[設計](docs/device-support-architecture.md)／[台帳](data/device-support-matrix.json)。

これは設計・検査の実装であり、実機対応完了や書込み可能imageの生成ではない。最初の物理端末は未確定で、Pixel 7／`panther`とPixel 10／`frankel`を候補として保持する。BlackBerryは正確な機種ごとにbootloader・vendor・recoveryを調査し、iPhone／iPadはclient-onlyとする。クラウド課金、実機flash、production署名、一般公開、main統合は未承認のまま。

## 2026-09-12 — 現進捗・スマホ不足・クラウド条件を再監査

main `7cdbb5f`とDraft PR #4の候補`c182a5b`を再取得し、PR #4の同HEAD 12 checkが全て成功していることを確認した。ただしスマホcheckはsource preparationで、OS bootではない。41 taskは19 done／15 in progress／7 plannedだが、製品完成率には換算しない。QEMU rc2の内部限定受入、Android P1の2APK、本人限定Siteを保持し、スマホ版は全source取得・vendor生成・Soong build・AndroidへのSky/Wallet/Game移植・production署名・実機flash/boot/OTA/復旧が未完了。[現在の再監査](docs/current-state-20260911.md#2026-09-12--github実装実機版ビルド環境の再監査)／[機械可読snapshot](docs/evidence/launch/progress-audit-20260912.json)。

直近相談のPixel 7／`panther`と、現在固定済みのPixel 10／`frankel`が不一致。実機の型番/SKUを読取り専用で確認するまで対象を確定しない。初回buildはGPUなし、Ubuntu 24.04 x86_64、48 vCPU／96GiB／600GiBを安全側の候補とし、20〜30 USDを未承認の計画枠に更新した。クラウド作成・課金、端末操作、runtime変更、Site再配信、main mergeは行っていない。

今回の安全な開発差分として、phone build入口をlock由来のdevice／lunch／hook／targetへ限定し、`targetConfirmedByOwner:false`または`confirmedSku:null`のfull OS buildをfail-closedにした。RAM64 GiB／空き400 GiBの最低条件、prepare後とrepo検査後のhook SHA再検証、path／Unicode／`-j`入力拒否を追加し、local phone tests 10件、shell構文、py_compile、diff-check、`npm run verify`（93 tests・build・API 143 assertions）をPASSした。これはsource準備の証拠であり、full OS build／boot／flashの成功ではない。

## 2026-09-11 — 開発本体へスマホ準備と現状を統合

現在の入口は[統合した開発状態](docs/current-state-20260911.md)、次の指示は[再開手順](docs/prompts/rock-current-next-20260911.md)。スマホ準備3eeeeedをlaunch-candidateへ取り込み、旧QEMU受入、本人限定Site公開、CM制作途中、MIT/署名鍵/クラウド予算の未回答を同期した。main・配布image・Sites配信は今回変更していない。

検証: `npm run verify`（93 tests・型/lint/build・API143）、スマホ準備8 tests、OS契約整合、shell構文、現在入口のリンク確認に合格。独立した2件の整合レビューも指摘解消を確認。過去の未完了・料金・QEMU/Android runtime・公開済みSiteを保持した。[今回の統合証拠](docs/evidence/launch/development-integration-20260911.json)。

## 以下は日付付きの作業履歴

過去の「次」「現在」「準備中」はその時点の記録。最新状態は上記と機械可読進捗を優先する。

## 2026-09-11 — スマホへ書き込むOS版の開発開始

利用者の明示指示で実機版の開発を開始。Pixel 10候補の公式安定版タグ署名を確認し、固定source・端末product組込み・Linux build入口・読取り専用端末診断を追加した。利用できるLinux環境はないとの回答を受領。対象機種/SKUの再確認、クラウド予算/アカウント、全OS build、Sky/Wallet/Game移植、Android署名と実機受入が必要。まだ書込み可能なimageは生成していない。[実装と再開手順](docs/phone-preview-20260911.md)。

## 2026-09-11 — kaiya の公開設定と新規Sites

権利者名kaiya、自作部分の改変・再配布許可、新規Sites作成、CM制作途中を最新指示として記録。MITの具体条文と本人だけで行う署名方式は準備段階。新サイトは本人限定で公開済み。空のD1で開始し、元サイトとDBの復旧を完了扱いにしない。MIT確認用全文、本人署名CLIと新7＋既存29署名試験、取消/メモリの追加診断を保存した。[今回の設定](docs/owner-setup-20260911.md)。

## 2026-09-11 — rc2の残る受入を再開

rc2の導入・保存・再起動・同一VM中断復旧PASSを保持。追加のD2 lifecycle 16操作、fresh SDK、空導入先削除、D6の61反復/3642秒・5正常終了、D1/D3の13boot、D4の41bootが限定合格し、原本も独立照合した。Game・金融・PC接続・デモの計8正常bootと停止台帳照合、90秒MP4の変換・目視確認も完了。証跡archiveの最初の終端破損を見逃す検査コードを修正し、Linux24 fixtureと同一D4原本の全byte再照合に合格。構成照合は434523記録を作成し、7readerの読戻しを完了。kernel索引10件の生成工程証明とlicense承認は保留。元SitesはNOT_FOUND、正式署名・製品license・CM確定掲載・公開承認は未完了。[追加受入](docs/rc2-remaining-acceptance-20260911.md)。以下は各時点の履歴。

## 2026-09-11 — 最新配布物の受入・公開導線の復旧

利用者の権利者申告と署名意思を受領。新b7/rc2は実1GB候補の二回生成・GitHub全8資産取得・各716インストールmember照合に成功。新規導入→保存→正常再起動→16MiB地点の中断復旧→復旧先起動の3bootを実測し、引用整理1件・9897c・10 COIN_A・重複なしを停止disk/台帳でも確認した。内部動作確認はPASS。正式鍵・license/許諾・元Sites再接続・CM確定掲載・残る全受入と一般公開承認は未完了。Web導線とPC要件を修正し、ローカルverify/HTTP/ブラウザ導線はPASS。[実測記録](docs/os-acceptance-b7d819c-20260911.md) / [公開導線の現状](docs/release-verification-20260911.md)。以下は各時点の履歴。

9月11日追加実装: TLSの1byte受信増幅を最大8KiBの先読みで修正し、期限・header/body上限・単一requestを維持した。修正前の18件中4FAIL→修正後18件＋関連57件＝75PASS/skip0、独立reviewも所見なし。同じ承認経路に4ms/recvを加えた制御実験は旧実装がheader受信中に1秒timeout、新実装は49〜52msで成功したが、原TLS原因の確定ではない。将来のowner許諾を変更しないcandidate bytesへ照合する別置き検証器を追加し、新11＋既存44＝55fixture PASS。所有者の実承認は未受領。旧VM/9ab配布物を保持して、新しい隔離VMで新sourceのbuildを準備中。配布hash検証は開始時のfile size＋1byteまでに制限し、検証中の増大/縮小を拒否する。新image/D0〜D6は未実施、Sitesは再度NOT_FOUND、license/CM/reviewer/PR #5限定mergeは回答待ち。

署名保護の実API照合: `codex/release-signing-control` と公開変数を `ca7356550b0042d05f60a389a90aebd5210510e6` へ固定し、locked/admin enforcement/force・delete禁止/独立PR承認をreadbackした。個人repoはRESTの空bypass設定を422拒否し、そのfieldを返さないため、PR #4の修正はexact repository/branch prefix/commit/ruleに結び付くGraphQL integer0を必須にする。27署名試験PASS。control branchは旧ca73565のまま保護し、修正・owner policy/trustの反映は独立レビュー付き更新待ち。Environment/管理鍵/初回登録は未設定。ca73565自体の全10checks・native1671/skip0成功はSHA別の原証拠に保存した。

追加実装: packagerの未署名exportとcontrol側の候補準備処理を実装し、37fixtureと既存desktop50を確認。共有clockを差し替えるテスト不具合は修正前FAIL→修正後13PASS。旧9ab配布物・runtime・imageは不変だが、新packagerの実生成には新sourceのbuild/freeze/受入が必要。独立レビューによる出力directory競合も修正した。限定bootstrapはDraft PR #5（a441162、CI成功）に分離し、mainは未merge。原TLS原因と所有者入力は未解決。新HEADの最終CIとcontrol ref/protectionはGitHubの実readbackを別証拠に記録する。

再開確認（2026-09-10 22:03 UTC）: GitHubの最終候補は `97d952937add42de04092a2e6c2fac8aba3d8bad`、Draft PR #4はMERGEABLE・全9check成功。mainと旧9ab配布物は不変。Sky改修をやり直す段階ではなく、TLS原因の追加調査と、新しい配布候補を管理署名へ渡す処理へ進む。Sitesは再度NOT_FOUND、署名Environment/control branch/workflow登録と独立承認者は未設定。以下の検証記録は各SHA時点の履歴として保持する。

検証完了記録: `85620ec8b0d5d9913cd2d50f8ead4fbe109ee9bb` はDraft PR #4でMERGEABLE、Web/native/Android/署名fixtureの全10check成功。native1,670件/17checks/skip0とroot UI、ローカルWeb93tests/API143assertions+実行API、audit0、公式Sites buildを確認。文書更新後のHEADはPR自身のCIで別途判定する。外部条件と原TLS原因の未達を理由にBLOCKED_FOR_LAUNCHを保持する。

## 2026-09-10 — Sky改修と既存Sites履歴を統合

Sky・仕事/履歴・Wallet・接続設定へ導線を再設計し、旧ファンド/PWA/認証実行/手入力会計を保持。2つの仕事APIを分離し、両DB履歴からのD1移行、ブラウザの未認証→サンプル実行、PCの再接続race/実行session固定を検証した。全依存auditの4highはsharpの限定更新で0。原TLSの観測を強化し、434,096recordの配布inventoryと許諾判断資料をDraftへ追加した。元9ab配布物は不変。

[現在のLCH01〜07と次の一操作](docs/launch-readiness-20260910.md)を正本とする。**BLOCKED_FOR_LAUNCH**。原TLS原因、所有者のlicense決定、管理署名設定、元Sitesアカウント、確定CM、最終新配布受入は残る。最終main候補は別Draft PRで正確なHEAD/treeを検証し、一般公開/main mergeはまだ行わない。以下は過去の日付付き履歴。

## 2026-09-10 — 3d07df0のnative CIタイムアウト修正・GitHub検証済み

Linuxで全1660件／17checks、元1392件＋新規4件の主suite網羅、Web verifyに合格。16:38 UTC、修正f88b392のGitHub native全6job（root UIを含む）とWebの成功、download原本の699入力・17原ログ・全割当てを確認。[成功証拠](docs/evidence/native-ci-3d07df0/github-f88b392.json)。

通知に対応し原ログ・570秒時点のstackと成功1a2の入力を照合。native入力697件は一致し、570秒のMCPケースから終了時にはbackupケースへ進んでいるため、永久hangとは判定しない。1,392件を単一600秒枠へ集中させたCIを4独立jobへ分割し、module fixture・順序・重複した発見回数を保持して最後に全件照合する。13support checksとroot UIも必須。OS本体・9ab配布物・通信期限を維持する。[修正記録](docs/native-ci-partition-fix-20260910.md)。先行TLS ERROR原因と公開条件は別の残件。

## 2026-09-10 15:49 UTC — 最終結果とCM完成後の残件を同期

凍結9abのD0〜D6／導入・復旧／Game・SDK・実録画は限定受入済み。統合1a2f4d1のWeb/native CI成功をGitへ保存し、先行する間欠障害は原因未確定として保持。CMは利用者申告で完成済みのため制作を残件から外し、既存CMの表現確認と導入案内への接続を次作業へ反映した。追加1〜2日はLICENSE／Sitesの待ちを除くQEMU版仕上げの条件付き概算。確定公開日や実機・実資金の完成予定にはしない。[最新の進捗・会話の補足・再開順](docs/release-followup-20260910.md)を現在の入口とする。

15:54 UTC検証: `npm run project:update`、`npm run verify`（API 143 assertionsを含む）、`git diff --check` は成功。

今回の変更は記録の同期と最終CI証拠の保存。RQ01〜RQ17、task／phaseGateの状態・完了19/34件、元FAILと配布9filesを保持する。以下の日付付き節は各時点の履歴で、未判定／実行中の記述を現在の状態に転記しない。

## 09:48 UTC 最終imageとGame契約

最終9abf78aのbase/profile imageをbuildしてhash固定。正規CI原本1631/14checkと694source一致を既存guardで受理し、Mac arm64原全回帰の10TLS期限ERRORは別FAILとして保持。24要件のGame/Wallet host契約を同sourceで確認しGX01-CONTRACTを完了、実OS UI/fresh SDK/全D0〜D6は未判定。Aは同梱source/NOTICEと容量を確認し長時間試験、Bは実取得から新規VMの全構成復旧、rootは最後に専用端末で実UIと実録画を検証する。

## 09:19 UTC 配布候補のソース固定

`9abf78a80d27aa9f847c4051d20e4c552e407276` を最終source/host tools候補として固定・pushし、Aの完全native回帰とbuildを開始。Game期限後の再接続未対応を既存契約どおりUI/SDKに説明し、元key再送・履歴とPIN pixel条件を保持。Bは同じ版の9file取得から独立新VMで導入/全構成復旧/SDKを検証する。D0〜D6・最終実UI・配布取得・実demoはこれからの判定で、完成とは表示しない。

## 08:40 UTC 最終候補へ向けた一周の固定

月額888の二重請求防止、ATMfee0予約/取消、2正常bootの保持を4e中間imageで実測。新環境SDKのcached接続診断を修正して別fresh再導入が成功。引用整理の同じ処理を選択したrunnerへ送り、元keyの復旧まで最終候補で測る準備を統合。Game/金融/遠隔/90秒実録画のobserverを再現可能なsourceへ保存する。最終同一imageの受入・配布物・demoはまだ未合格。

## 2026-09-10: 8時間の実装・配布準備を開始

ユーザー指定MDを[今回の実行入口](docs/prompts/rockstaros-release-20260910.md)へ保存し、[実行記録](docs/release-execution-20260910.md)に開始・担当・受入条件を固定。GitHubの4headはMDと一致。PR #2起点の専用worktreeで進める。RQ01〜RQ17、月888 cents、Rock ATM手数料0、既存データを維持。下記の「設計のみ」は前回の履歴。

## 08:23 UTC 境界・復旧の統合

root `e4c3e4e`。初回Game送信のclaim直前に、接続・本人credential・端末・作者の現在の権限を同じtransactionで再確認するよう修正。既存の署名済み要求と保留を保持し、失効・並行ATM/月額/Game・実応答喪失の対象試験に合格。Game SDKの再表示時刻は必要な単調更新だけを型付き列で検証し、他の全行保持を維持。旧失敗の判定を変更しない。新候補のbuildと実gateを継続し、まだ配布完成とは判定しない。

## 07:53 UTC 実装・受入の更新

release HEAD `996db1e`。Game 2作者/2game/2owner/追加端末SDK、current-copyの世代fenceと実SIGKILL復旧、遅いGameと別Game/ATMの分離を統合。中間4e実OSはA/B交換とSky引用結果、通常終了まで観測し、再起動保持・台帳監査を継続中。購入PINの残り有効期限を誤って拒否する実不具合を修正し、旧失敗と新実動作を分けて保存した。最新の同一版全gate、fresh配布受入、デモが残るため完成判定はしない。[実行checkpoint](docs/release-execution-20260910.md)が現在の正本。

## 以下は今回開始前の設計更新・旧検証履歴

### RockstarOS 1.0と8原則

利用者の8原則を [製品・事業・開発設計](docs/rockstaros-1.0-strategy.md)へ具体化。RQ01〜RQ17と技術ベースを維持し、対象仮説・代表商品候補・縦断体験・system境界・pilot指標・CM導線・担当責任を整理した。機能追加、配布、外部連絡、実取引は行わない。既存task/phaseGateの完了数は増やさない。

source `8e6d217` のWeb/Android/native CI成功をGitHubで再確認済み。旧timeout待ちを次作業から外した。次はD6 run44の最終報告/終了後データの取得と、RLS01のfresh環境用導入パッケージ。両者は実装を並行できるが、配布には同じ候補の受入と導入試験が必要。既存引用整理を候補に実用比較を準備し、GX00→GX01→DX01を継続する。機種・providerの未確定事項を合格へ換算しない。

本更新の検証: `npm run project:update`、`baseline:check`、`git diff --check`は成功。`npm run verify`は進捗/参照/ベース整合、型、lint、54tests、buildまで成功し、最後のAPI段階だけsandboxのlocalhost listen権限で停止。合成データ専用の`npm run test:api`を許可環境で再実行し143assertionsが成功した。新設計のローカル参照7件と、RQ・料金/ハード方針・task/phaseGateの状態不変も照合済み。変更は設計と引継ぎ情報のみで、OS imageを再buildした実績ではない。

## 以下は前回までの実装履歴

2026-09-09実装更新: [凍結b8287bcの受入報告](docs/os-acceptance-b8287bc-20260909.md)を追加。D0〜D5の限定受入を照合し、D6は42の画面認識失敗と正常終了後の全データ照合を保存した。閾値を変えずhost認識を直し、新規43で5サイクル・60分を再試験中。Macから専用の保存端末を開く入口を追加し、実画面の導入/同意/実行/再起動後結果を確認。公開b325767のWeb/Android/native CIはすべて成功し、native Python1341実行とNode 22のwire照合303件を記録した。GX00は認証付き同一TLSで2作者/2game/2owner/3端末の4接続を実装。非空legacyの月888・1000予約・237未精算・失効credential・既存receipt/BLOBを残した接続と同月再照合が2件PASS。Cのcurrent-copy証拠APIはroot14件PASSで、実WALを保持するreaderがある場合の現在世代検査を修正した。停止済みcurrent-copyのゲーム引継ぎと通常起動ガードは開発中であり、GX00全体は未合格。実機・MetaMask送受金は未実施。

このファイルは当該branchの作業記録です。確定要望は [docs/product-baseline.md](docs/product-baseline.md)、進捗からの指示作成は [docs/prompt-playbook.md](docs/prompt-playbook.md) が正本です。

## 現在の作業 — 承認済み設計の統合と実装

[承認記録](docs/execution-approval-20260909.md)の範囲で実装を開始。分離branch `codex/operational-base-20260909` へmain/native/設計を統合し、旧N01〜N05とRQ01〜RQ15を保持する。6文書の競合を双方の要件・実装履歴を残して解消する。新image合格、実機対応、MetaMask送受信成功を先取りしない。

当時の次作業: D6の新規43を終了後データまで照合して受入報告を更新する。並行してGX00の認証付き実接続・互換/復旧を完成させ、GX01→DX01へ進む。Pixel 10 / GrapheneOSのP1 APKとBlackBerry型番確認は別トラック。現在の優先順位は冒頭と進捗JSONを参照する。

## 2026-09-09: native統合時の履歴

BlackBerry優先とnative OSの統合

2026-09-09、利用者の「ここまでのところをRockに矛盾しないように追加して」に従い、Linux/Buildroot/ARM64 QEMUの検証済み基準版を `systems/rock-star-os/` に取り込む。現在の方針・契約差分・残要件の正本は [native OS統合記録](docs/native-os-integration.md)。検証結果は [統合検証記録](docs/native-os-validation.md)へ記録する。

初期製品端末はBlackBerry優先・機種未定。従来のAOSP/Pixelは比較・移植候補として維持する。新OSの標準Walletは購入者限定、引き渡し時確認の再利用、月888 cents固定の契約。同じ契約の複数端末で重複請求しない。既存Webのファンド上限料金・分配は試算として保存し、両モデルを混ぜない。

MCPの接続/解除・結果復元と送金精算を分け、cloudの可用性に依存しない端末処理、運営用の管理・復旧、端末引き渡し後の少ない操作による開始を継続する。実BlackBerry、実USB、一般外部MCP、金融providerとATM、本番運営は未完了。新たな起動応答検査のWIPは通常buildへ混ぜず保存する。

## 2026-09-09: 現設計と開発内容の再照合・訂正

16:51 UTCにmain/native/設計reviewの3branchを再確認。[相違監査](docs/design-implementation-alignment-20260909.md)のALIGN01〜05に、設計branch参照漏れ、単一ownerと一般player基盤の違い、最新backupと復元試験入口の不一致、台帳移行と旧OS互換、途中依存の表現を記録した。設計v1.1/プロンプト/受入雛形に修正必須内容を反映し、Git進捗取得・段階ゲートの検査補助を改善する。runtimeの問題解消は未実施で承認後の作業。

再開先は `codex/os-game-design-review-20260909`。mainだけには最新設計がない。B04は3入力を統合、V01は単一ownerの既存native商品/合成Walletで先行、GX00→GX01契約→DX01は別系列。実providerやゲーム市場の完成をOS稼働の前提にしない。新たな予測市場/ゲーム資産売買の相談は未承認の検討案で、実行範囲を自動拡張しない。以下の過去記録は各時点の履歴。

## 2026-09-09: OS稼働雛形・ゲーム作者向けWallet・ATM手数料の追加指示

16:09 UTCのGitHub確認でmain `7cdbb5fedc86ee3978ed329d9312147d137c9199`、native `fcedcfec4dd2a242a1ba8fd7ff5eebba97b8ecd5`、PR #1 OPENと各同SHAのCI成功を再確認した。[OS稼働監査](docs/os-readiness-audit-20260909.md)へ対象と不足を記録。

RQ12は現設計をbuild/boot・操作・保存・正常終了・復旧まで検証できるOSへ進める要求。まずQEMUの合成データ専用雛形を受け入れ、実機/本番安全性とは分離する。RQ13はゲーム通貨交換とATM独立、RQ14は自作ゲーム作者向けAPI/SDK・sandbox・導入体験、RQ15はATMでRockが徴収する手数料0。利用者の「atm手数料の話」を受け、ゲーム手数料0という初稿解釈は訂正。ゲーム料金は未定、OS月888 centsは既存契約を保持する。

最新入口は [OS稼働・ゲーム連携プロンプト](docs/prompts/os-operational-base-next.md)。旧GAP01〜04を保持し、B04統合→V01の起動/安全基礎→既存商品/Wallet基礎→OS縦断受入へ進む。GX01ゲームfixture、DX01作者SDKは独立、GX02実ゲームと実資金/実機は別条件。V01全体とB02/B03の機械依存を循環させず、細かな着手ゲートはプロンプトで明示する。

D01は文書と検査の保存だけ。V01/GX01/GX02/DX01とB04/B02/B03/B05は未着手。native code・OS image・ゲーム本体・ATM実運用は今回変更せず、SSDを再マウントしていない。新しい [受入報告雛形](docs/templates/os-acceptance-report.md) は全行NOT_RUNで、合格実績ではない。

## 2026-09-09: 指摘した4問題を解消する実行プロンプトへ改訂

利用者の「指摘した問題を解決する内容を含めて作業を進めるプロンプトを作成」に対応。15:01 UTCにmain `f9b1cbd99eeaa20f7cbc80bd2d88909949cca863`、native `fcedcfec4dd2a242a1ba8fd7ff5eebba97b8ecd5`、OPENのPR #1と同SHAのCIを再確認した。詳細は [追補監査](docs/progress-audit-20260909-followup.md)。

新ベースのnative未反映、無料開発商品への制限、Wallet実収益未接続、PC比較を含む利用価値未検証をGAP01〜04に対応付けた。段階0のB04引継ぎ統合を先頭に置き、既存商品のSky実利用/改善前測定→商品条件と実行adapter→Wallet接続→同条件の再試験へ進む。既存Nタスクは保持し、起動/安全性の直接依存だけ先行する。旧OS02〜OS05は別トラックと明示した。

今回変更するのは文書/進捗とプロンプト。B04/B02/B03/B05は未着手のまま。B02は段階1〜2の基礎、B03はWallet接続、B05はWallet基礎後の比較・再試験に分け、依存の循環を避ける。実サービス未接続でもB03の台帳/fixture基礎が通ればB05へ進めるが、GAP03実収益・GAP04実機価値の未検証は残す。native統合・runtime修正・Sky操作・実provider/実機検証は実行担当の次作業であり、今回完了したとはしない。料金・商品供給の役割・ハード方針は変えない。作成規約とRQ10にも、相違ごとの作業・合格証拠・残る境界を引き継ぐルールを保存する。

## 2026-09-09: Sky＋Walletのベースと利用価値を保存

tob側が商品を開発し、Rockが実行方式・料金・ライセンスの異なる商品を管理するSkyと収益Walletを作る。既存ツールも商品とし、Git内の商品をSkyから実利用して準備/操作/結果確認の不便を改善する。汎用生活機能やエコシステム拡大を主目的にしない。確定ベースはRQ01〜RQ11。

main `5cec834`に加えPR #1/native `fcedcfe`と同一SHAのCIを確認。nativeにはWallet台帳・月888 cents・資格・Sky署名配布・MCP/AI実行先がある。BlackBerry優先機種未定。今回のmain保存はベース/監査/作成規約と検査であり、native本体のmergeではない。[差分監査](docs/progress-audit-20260909.md)、[次の実行プロンプト](docs/prompts/hub-wallet-next.md)を参照。

既存データ、月額契約、旧試算、ツール原本を保持する。B01ベース保存と、B02商品実利用/条件拡張、B03実行費用/収益接続を分けて記録する。

## 2026-09-05時点の履歴: Android/AOSP開発

2026-09-05の利用者指示により、今後の主軸を「Rock star OS: 自社・第三者の自動化ツールを導入し、利用者が決めた範囲で自律実行するOS」へ移す。Pixel等の開発用端末で検証する計画を [OS開発設計書](docs/os-development-design.md) にまとめる。以下のR1/R2は既存Web基盤の履歴として保持する。

初回の成果物は設計書と進捗文書。その後の「考えて組んでみて」を受け、OS部品の実装へ着手する。端末書込、サイト公開、配信側branchの統合は引き続き行わない。従来の公開停止は独立したOS開発を妨げない。

OS設計v0.1では、元の事業/実行/配信側設計をQ01〜Q09へ対応付け、AOSP方式、Pixel適合ゲート、Tool/Recipe/Work/Runの分離、第三者SDK、権限とAIの境界、端末成果物、署名Store/OTA、AT01〜AT14の受入条件を定義する。最初の縦断実装は「原稿を置く→充電時に2工程→成果物→本人確認」。実装前の機材・BSP確認と、未検証項目を明記する。

OS01は設計の完了だけを表す。OS02〜OS05は未着手であり、過去のWebタスクの完了数をOSの実装進捗に換算しない。

## P1: 構想から実装へ

OS06として、Java共通コア・SQLite・固定Tool AIDL・別APKの記事ツール・充電条件のAndroidジョブ・診断画面を実装した。[P1実装手順](docs/os-prototype.md)をコードに対応する詳細仕様とする。基本設計のKotlin案は初回の共通コアではJavaへ具体化した。

OS06の完成条件は、共通コアの実SQLiteテスト、既存記事ツールとの照合、Android APKのコンパイル/検査、残課題の記録。OSイメージ起動や実機合格は含めず、OS03/04とは分ける。AOSPの全ソースはggへ入れず、設定と固定参照だけを管理する。

2026-09-05、実装commit `47043ad` の[Android CI](https://github.com/k999ln/rock/actions/runs/33982932964)でコア16・SDK4テスト、2APKのbuild/lint、記事照合36項目、標準Android35の接続2テストに成功し、OS06を完了とした。端末テストは実BinderとSQLite再接続を通すが、画面OFFの周期実行・端末再起動・不正UIDの否定試験ではない。[既存WebのCI](https://github.com/k999ln/rock/actions/runs/33982933087)も成功。OS03〜05を先取りして完了にはしない。

## 旧Webで維持する事業方針と試算

Rock starは、自動化ツールを束ね、仕事の準備・制作・確認を進めるハブです。ファンドの参加・配分計画、共通収益に対する月最大8.88 USD相当の利用料、基本分配・ブースト・共同留保の試算という方向を維持します。既存の個人費用計算は別モデルです。

他製品の生活管理・投資売買・Telegram事業へ転換しません。参考元に別の料金・売上分配率があってもRock starへ上書きしません。実収益・入出金・分配は未接続で、仕事の完了件数を売上に換算しません。

## R1: Web基盤の完成範囲（過去段階）

既存の4ツールを、仕事単位で順番に実行して確認できる基盤にまとめます。

- 記事の販売準備: 出典整理 → 無料版作成 → 本人の最終確認。
- ココナラ納品準備: 案件条件確認 → 納品記録照合 → 本人の最終確認。
- 各仕事は名前・手順・試行履歴・状態をユーザー別に保存。再読込後も再開可能。
- 失敗、条件不一致、納品照合不合格、サンプル実行は手順を進めない。
- すべての手順を通過後に確認メモを添えて完了。外部応募・送信・納品そのものは利用者が行う。
- 原稿・提案本文・成果物は従来どおり端末内で処理。サーバー保存は仕事名、確認メモ、実行メタデータ。

## R1: 構成とデータ契約

`/` のファンド画面から `/work` へ進み、テンプレートを選んで仕事を作成します。既存の `MrToolRunner` とPCの4つのMCPツールを再利用します。入力の引き渡しは利用者が結果を確認・コピーして行い、タブを閉じると未保存本文は失われます。

| 層                           | 担当                                               |
| ---------------------------- | -------------------------------------------------- |
| `lib/workflow.ts`            | テンプレート、入力検証、状態遷移、完了条件、冪等性 |
| `lib/work-store.ts`          | D1のユーザー別取得、作成、revision条件付き更新     |
| `app/api/jobs/route.ts`      | 認証・Origin確認、仕事の一覧・作成・更新API        |
| `components/workbench.tsx`   | 作成、一覧、次の手順、実行結果、確認と完了         |
| `lib/device.ts` / 既存runner | ツールの実行結果を仕事へ報告                       |
| `data/project-status.json`   | 開発タスクの状態・依存関係・検証根拠               |
| `scripts/project-status.mjs` | READMEと本書の進捗欄の生成・鮮度確認               |

仕事は `active → review → completed`。`active` / `review` から `cancelled` に中止可能。通過前のステップを飛ばす操作は拒否します。中止済み・完了済みの仕事には新しい試行を追加しません。

D1の新しい `work_jobs` テーブルに仕事JSONとrevisionを保存します。更新はID・ユーザーID・revisionが一致したときだけ成功し、別タブの更新を上書きしません。同じ試行ID・同じ内容の再送は二重計上せず、内容が異なれば拒否します。実行メタデータは本人のブラウザからの報告であり、第三者の売上証明や署名付き実行証明ではありません。

仕事内の実行は `work_jobs` の履歴に、ホームの単独実行は既存の `tool_runs` に記録します。二重計上や完了件数からの収益自動算定はしません。一覧は最新100件、試行履歴は200件、API本文は12 KBが上限です。古い仕事のページ送り・削除・成果物の永続保存は未実装です。

`drizzle/0002_work_jobs.sql` はテーブルとインデックスの追加のみです。既存ファンド設定・実行履歴は削除しません。開発DBの適用方法はREADME、本番DBへの適用はSites公開フローで扱います。

## R1/R2: 受け入れ条件と検証

- 記事・ココナラの順次実行、サンプル・失敗・条件不一致の非通過、最終確認必須をユニットテストする。
- 実SQLiteに全移行を適用し、ユーザー別の保存と競合拒否をテストする。
- `npm run test:api` は本番Workerをループバックに起動し、一時D1で認証境界・別Origin・ユーザー分離・二重送信・同時更新・再起動後の復元を検証する。合成ユーザーのIDヘッダーはローカル検証専用で、本番への認証手段ではない。
- 認証・Originで早期拒否するときは未読のリクエスト本文を解放する。403の直後に不正JSONを送る組を20回繰り返し、拒否後もAPIが応答し続けることを検証する。
- API検証はMiniflareから同じコンパイル済みAPI・互換設定・D1宣言を使ってworkerdを直接起動する。Wranglerの開発用プロキシと静的資産ルーティングはこの検証に含めない。移行SQLの適用と保存先の再利用を明示し、再起動後にも同じ仕事が読み出せることを確認する。
- `npm run verify` で進捗同期、型、対象コードlint、ユニットテスト、本番ビルド、API検証をまとめる。CIでも実行する。
- R1ではブラウザ画面操作は未実施。R2で合成データを使い、記事仕事の作成・サンプル非通過・実行・最終確認・完了・再読込を画面から検証する。実ウォレット・外部応募や決済は引き続き対象外。結果と未検証事項は [docs/validation.md](docs/validation.md) に記録する。

## R2: 画面確認とサイト反映

利用者の「実施と更新して」を受け、ブラウザの操作確認と既存Sitesへの反映を実施する。現在の閲覧権限は本人限定であり、この範囲を変えない。GitHubの公開リポジトリと、本人限定の稼働サイトは区別する。

1. ローカルの標準サインインで合成データを作り、ホーム・仕事画面と一連の状態遷移を確認する。
2. 不具合があれば修正し、`npm run verify` を通す。
3. 同一ソースを配信用リモートへ保存し、ビルド成果物と追加DB移行をSitesで公開する。
4. 公開状態と画面/APIを確認し、バージョン・検証範囲・残課題を本書とREADME、検証記録へ反映する。

ローカル画面確認で、記事仕事の完了・再読込後の復元と、条件不一致の非通過・中止を確認済み。テンプレートの内部ID表示を日本語名へ修正し、1180px以下ではホームに専用の仕事入口を表示する。料金・分配式、認証と保存契約は変更しない。

### 公開停止と再開条件

検証済み修正 `89d2d66` はrock/mainへ保存され、GitHub Actionsも成功した。一方、配信用のsites/mainには共通祖先以降に別の2commitがあり、通常pushはfetch firstで拒否された。取得して比較した結果、`/api/jobs` の契約とDrizzleの0002ジャーナル/スナップショットに衝突がある。ホームもアプリ型UIへ変更され、実行管理・端末管理・手入力台帳が追加されていた。

強制push、どちらかの一括優先merge、Sitesのversion保存・公開は行わない。既存の追加機能を残してrockへ統合する方針を利用者に確認してから再開する。[衝突の根拠と統合案](docs/deployment-integration.md) に詳細を記録した。現在の本人限定の権限と稼働サイトは変更していない。

## リポジトリの対応

- ローカル正本: `/Volumes/Extreme SSD/gg`。
- `origin`: <https://github.com/k999ln/rock>。通常の開発・README・進捗をここへ保存。
- 製品は「Rock star / avocadomini」の1つ。`rock`は製品・OS・公開契約、非公開`k999ln/Mr.`はTelegram・クラウド・provider運用だけを担当するcomponentとする。
- `k999ln/vvvv`は旧履歴で、新規修正・CI・deploy・runtimeの対象にしない。外部の稼働参照を確認できるまでは削除やarchiveを行わない。
- `k999ln/mr-bot-workrooms`は非公開成果物置場であり、製品source・仕様・進捗の正本にしない。
- 詳細、78件の完全一致blobの分類、共有方法と禁止事項は [Gitプロジェクト統合方針](docs/git-consolidation.md) と [repository map](data/repository-map.json) を正本とする。
- `sites`: 既存サイトの配信用リモート。`.openai/hosting.json` とD1を維持。
- 元の `rock-star/` 内をgg直下へ移動し、入れ子のGit管理を解消。履歴は保持。
- GitHubへの保存とSitesへの再公開は別作業。公開サイトへ反映した場合だけ検証記録に記載。

2026-09-07、`repository:check`で製品正本1件、active sourceの`vvvv`参照なし、固定Mr.原本4件のblob/SHA-256一致を確認した。既存の型・lint・34テスト・buildも成功し、ローカルAPIは143 assertionsに成功した。整理commit `42371f0`はrock/mainへ保存され、[GitHub Actions](https://github.com/k999ln/rock/actions/runs/34170597685)も成功した。GitHub repositoryのarchive、公開範囲変更、運用先切替は実施していない。

R1実装は `b460ccf`、追加の検証改善は `7103e55` としてrockのmainへ保存し、GitHub Actionsで検証済みです。READMEと本書の更新も同じmainに継続して保存します。実際の実施結果は [検証記録](docs/validation.md) のR1欄に残します。

## 進捗の更新方法

1. 着手時に `data/project-status.json` の状態・更新日・次の作業を更新する。
2. 設計判断を本書、利用方法をREADME、根拠を検証記録へ追記する。
3. `npm run project:update` で両文書の進捗欄を更新する。
4. `npm run verify` を実行し、結果を記録して同じcommitに保存する。

`done` はそのタスクの成果物と検証が完了した場合だけ使用。設計タスクの完了は実装完了を意味しません。`blocked` は理由を記録し、予定を完了数へ含めません。継続的な無人開発や毎時同期が稼働しているという意味ではありません。

<!-- project-status:start -->
最終更新: 2026-09-12 / Sky Agent Hubへ法務受付と特許出願担当を統合 / 完了 26/48件

| ID | 作業 | 状態 | 根拠 |
| --- | --- | --- | --- |
| SKY01 | 旧名称をSkyへ全面改称し、選択・許可・実行先・停止・結果を一つにする価値と収録ツールを可視化 | 完了 | [記録](docs/sky.md) · [記録](components/sky-workspace.tsx) · [記録](scripts/check-sky.mjs) |
| SKY02 | ToB向け簡易掲載フォーム・審査キューとToC向けSky Timelineを実装 | 完了 | [記録](app/sky/publish/page.tsx) · [記録](components/sky-publisher-form.tsx) · [記録](app/api/sky/submissions/route.ts) · [記録](tests/sky-submission.test.mjs) |
| SKY03 | MCP接続・周辺先行技術を調査し、特許出願可能性を高める技術設計を保存 | 完了 | [記録](docs/sky-mcp-architecture.md) · [記録](systems/rock-star-os/docs/MCP-HUB-INTEGRATION.md) |
| SKY04 | X型Sky Timelineから会話または役ボタンの1タップで実行入口を開く | 完了 | [記録](components/sky-workspace.tsx) · [記録](lib/sky-routing.ts) · [記録](tests/sky-routing.test.mjs) · [記録](docs/sky-assistant-and-memory.md) |
| SKY05 | Skyの依頼・担当選択・検索・実行を迷わない3段階へ整理 | 完了 | [記録](components/sky-workspace.tsx) · [記録](app/workspace.css) |
| SKY06 | スマホ幅でSky実行Dialogが左へずれる回帰を修正 | 完了 | [記録](app/workspace.css) · [記録](project.md) |
| R01 | 4参照元の採用判断と事業方針の固定 | 完了 | [記録](docs/reference-repositories.md) |
| R02 | ggをGitHub rockへ紐付け、既存変更と履歴を保全 | 完了 | [記録](project.md) |
| R03 | 仕事の作成・実行・確認・再開をAPIと画面で接続 | 完了 | [記録](tests/workflow.test.mjs) · [記録](scripts/check-work-api.mjs) |
| R04 | README・設計進捗の同期とCI検証 | 完了 | [記録](scripts/project-status.mjs) · [記録](.github/workflows/ci.yml) · [記録](docs/native-ci-partition-fix-20260910.md) |
| R05 | 回帰検証・移行確認・GitHub保存 | 完了 | [記録](docs/validation.md) |
| R06 | ブラウザで仕事の一連の操作を確認 | 完了 | [記録](docs/validation.md) |
| R07 | 本人限定のSitesへ公開・本番確認 | 進行中 | [記録](docs/deployment-integration.md) · [記録](docs/release-followup-20260910.md) · [記録](docs/owner-setup-20260911.md) |
| R08 | 検証結果・公開停止理由と再開設計の文書化 | 完了 | [記録](project.md) · [記録](docs/validation.md) · [記録](docs/deployment-integration.md) |
| OS01 | 既存設計の要件追跡と自動化OS開発設計 | 完了 | [記録](docs/os-development-design.md) |
| DSP01 | 共通Core・機種別Device Support Package・4提供区分の設計と検査 | 完了 | [記録](docs/device-support-architecture.md) · [記録](data/device-support-matrix.json) · [記録](scripts/check-device-support.mjs) |
| OS02 | 【Android/AOSP別トラック】対象Pixel・ソース/BSP・Linuxビルド環境の適合確認 | 進行中 | [記録](docs/os-development-design.md) · [記録](docs/phone-preview-20260911.md) |
| OS03 | 【Android/AOSP別トラック】CuttlefishでOS起動と自律実行の最小縦断試作 | 未着手 | [記録](docs/os-development-design.md) |
| OS04 | 【Android/AOSP別トラック】Pixel実機で復旧・省電力・再起動・署名更新を検証 | 未着手 | [記録](docs/os-development-design.md) |
| OS05 | 【Android/AOSP別トラック】第三者SDK・審査・インストール・失効の閉鎖テスト | 未着手 | [記録](docs/os-development-design.md) |
| OS06 | OS共通実行コア・端末DB・Android統合の検証可能な試作 | 完了 | [記録](docs/os-prototype.md) · [記録](docs/validation.md) · [記録](android/automation/src/androidTest/java/dev/rock/automation/DeviceIntegrationTest.java) |
| G01 | GitHubリポジトリの役割・重複監査と正本境界の固定 | 完了 | [記録](docs/git-consolidation.md) · [記録](data/repository-map.json) · [記録](scripts/check-repository-map.mjs) · [記録](docs/validation.md) |
| G02 | vvvvの稼働参照監査と安全なarchive判定 | 未着手 | [記録](docs/git-consolidation.md) |
| B01 | Sky＋Walletの製品ベース・branch監査・プロンプト規約を保存 | 完了 | [記録](docs/product-baseline.md) · [記録](docs/progress-audit-20260909.md) · [記録](docs/prompt-playbook.md) · [記録](docs/prompts/hub-wallet-next.md) · [記録](docs/validation.md) |
| B04 | main/native/設計reviewのベース・引継ぎ入口を分離作業branchへ統合 | 完了 | [記録](docs/design-implementation-alignment-20260909.md) · [記録](docs/prompts/os-operational-base-next.md) · [記録](docs/os-operational-validation-20260909.md) |
| B02 | 既存商品のSky実利用と不便の改善・実行/料金/権利の条件拡張 | 進行中 | [記録](docs/prompts/hub-wallet-next.md) · [記録](docs/pc-citations-adapter.md) · [記録](docs/evidence/pc-citations/integration.json) · [記録](docs/evidence/os-base/business-backup-acceptance-b8287bc.json) · [記録](docs/sky-rockstar-ledger-20260912.md) · [記録](docs/sky-role-agents-20260912.md) · [記録](docs/evidence/sky-rockstar-ledger/integration.json) · [記録](tests/rockstar-ledger.test.mjs) · [記録](tests/subscription-advisor.test.mjs) · [記録](docs/sky-legal-intake-20260912.md) · [記録](tests/legal-intake.test.mjs) · [記録](docs/sky-patent-assistant-20260912.md) · [記録](tests/patent-assistant.test.mjs) |
| B03 | 実行費用・認証済み収益を既存Walletへ接続し縦断検証 | 進行中 | [記録](docs/prompts/hub-wallet-next.md) · [記録](docs/evidence/os-base/business-backup-acceptance-b8287bc.json) |
| B05 | Wallet連携基礎を使ったSky縦断再試験・PC比較と未実証の端末価値を記録 | 進行中 | [記録](docs/prompts/hub-wallet-next.md) · [記録](docs/hub-wallet-pc-comparison-20260909.md) · [記録](docs/evidence/hub-wallet/b05-pc-machine-20260909/report.json) |
| D01 | RQ12〜15・OS受入雛形・ゲーム作者向け実行プロンプトを保存 | 完了 | [記録](docs/product-baseline.md) · [記録](docs/os-readiness-audit-20260909.md) · [記録](docs/prompts/os-operational-base-next.md) · [記録](docs/templates/os-acceptance-report.md) · [記録](docs/validation.md) |
| V01 | 旧9abf78a候補のQEMU開発OSをbuildしD0〜D6の稼働/復旧受入を通す（現rc2へ転用しない） | 完了 | [記録](docs/prompts/os-operational-base-next.md) · [記録](docs/templates/os-acceptance-report.md) · [記録](docs/os-operational-validation-20260909.md) · [記録](docs/evidence/os-base/startup-update-acceptance-b8287bc.json) · [記録](docs/evidence/os-base/business-backup-acceptance-b8287bc.json) · [記録](docs/evidence/os-base/registry-negative-b8287bc.json) · [記録](docs/os-acceptance-b8287bc-20260909.md) · [記録](systems/rock-star-os/os/desktop/LAUNCHER-V2.md) · [記録](docs/evidence/rls01/final-d6-ci-20260910.json) · [記録](docs/evidence/rls01/final-d6-root-audit-20260910.json) · [記録](docs/os-local-final-20260910.md) · [記録](docs/os-acceptance-9abf78a-20260910.md) · [記録](docs/os-native-repeat-20260910.md) · [記録](docs/os-final-compatibility-20260910.md) |
| GX00 | 共通Walletの複数owner/player分離・本人接続・既存台帳互換を設計検証 | 完了 | [記録](docs/design-implementation-alignment-20260909.md) · [記録](docs/prompts/os-operational-base-next.md) · [記録](docs/gx00-owner-isolation-adr.md) · [記録](docs/evidence/gx00/integration.json) · [記録](systems/rock-star-os/os/wallet_backend/FENCE.md) · [記録](docs/gx00-connection-wire-v1.md) · [記録](docs/evidence/gx00/game-protocol-review.json) · [記録](docs/game-connection-node-wire-20260909.md) · [記録](docs/gx00-connections-runtime.md) · [記録](docs/evidence/gx00/game-connections-root.json) · [記録](docs/gx00-legacy-game-basis.md) · [記録](systems/rock-star-os/os/wallet_backend/CURRENT-RESTORE.md) · [記録](docs/evidence/gx00/current-copy-foundations-root.json) · [記録](docs/gx00-current-game-restore.md) · [記録](docs/gx00-owner-connection-client.md) · [記録](docs/evidence/gx00/current-game-integration-root.json) · [記録](docs/implementation-checkpoint-20260909.md) · [記録](docs/evidence/gx00/release-required-acceptance-20260910.json) |
| GX01 | ATMから独立したゲーム交換契約・両台帳fixture・異常系を実装検証 | 完了 | [記録](docs/prompts/os-operational-base-next.md) · [記録](docs/gx01-contract-implementation-plan.md) · [記録](docs/gx01-native-ui-20260910.md) · [記録](docs/gx01-reference-sdk-sandbox-20260910.md) · [記録](docs/game-wallet-release-checkpoint-20260910.md) · [記録](docs/evidence/hub-final-9abf78a/final-c01-completed-stages.json) · [記録](docs/evidence/gx01/final-9abf78a-20260910.json) |
| GX02 | 指定された実ゲームの正式sandbox接続と交換条件を検証 | 未着手 | [記録](docs/prompts/os-operational-base-next.md) |
| DX01 | ゲーム作者向けAPI/SDK・sandbox・複数owner/game分離と導入体験を検証 | 完了 | [記録](docs/prompts/os-operational-base-next.md) · [記録](docs/gx01-reference-sdk-sandbox-20260910.md) · [記録](docs/evidence/rls01/sdk-final-9abf78a/README.md) · [記録](docs/evidence/rls01/sdk-final-9abf78a/summary.json) · [記録](docs/evidence/gx01/final-9abf78a-20260910.json) |
| N01 | Linux native OS基準版の公開ソース統合・既存資産の回帰検証 | 完了 | [記録](docs/native-os-integration.md) · [記録](docs/native-os-validation.md) |
| N02 | 起動応答確認と自動再読込WIPの検証・採用判断 | 進行中 | [記録](docs/native-os-integration.md) |
| N03 | 実機候補1機種の型番/SKU・boot/BSP・更新/復旧の適合確認 | 進行中 | [記録](docs/native-os-integration.md) · [記録](docs/phone-preview-20260911.md) · [記録](docs/current-state-20260911.md) · [記録](docs/evidence/launch/progress-audit-20260912.json) |
| N04 | BlackBerry実機だけでSky取得・実行・更新・復旧 | 未着手 | [記録](docs/native-os-integration.md) |
| N05 | 実USB・外部MCP/AI・金融provider・ToB精算と運営pilot | 未着手 | [記録](docs/native-os-integration.md) |
| RLS01 | fresh Mac/PCへ導入できるQEMU Developer Previewを作成・検証 | 完了 | [記録](docs/release-installation-plan-20260909.md) · [記録](docs/rockstaros-1.0-architecture.md) · [記録](docs/rockstaros-1.0-strategy.md) · [記録](docs/evidence/rls01/final-9abf78a/summary.json) · [記録](docs/evidence/rls01/github-direct-install-9abf78a/summary.json) · [記録](docs/release-followup-20260910.md) |
| RLS02 | 正確な1機種・variantへ限定したPhysical Device Previewを作成・復旧検証 | 進行中 | [記録](docs/release-installation-plan-20260909.md) · [記録](docs/phone-preview-20260911.md) · [記録](docs/current-state-20260911.md) · [記録](docs/evidence/launch/progress-audit-20260912.json) |
| LCH01 | TLS／累積timeoutの原因と最終CIの照合 | 進行中 | [記録](docs/launch-readiness-20260910.md) |
| LCH02 | 全同梱物inventory・対応source・製品LICENSEの明示決定 | 進行中 | [記録](docs/launch-readiness-20260910.md) · [記録](docs/current-state-20260911.md) · [記録](docs/evidence/launch/progress-audit-20260912.json) |
| LCH03 | production署名・保護環境・失効運用 | 進行中 | [記録](docs/launch-readiness-20260910.md) · [記録](docs/current-state-20260911.md) |
| LCH04 | Sites履歴のコード統合・新規本人限定サイト・Sky改善 | 進行中 | [記録](docs/launch-readiness-20260910.md) · [記録](docs/owner-setup-20260911.md) · [記録](docs/current-state-20260911.md) |
| LCH05 | 制作中CMの完成待ち・内容照合・導入案内への接続 | 進行中 | [記録](docs/launch-readiness-20260910.md) · [記録](docs/current-state-20260911.md) |
| LCH06 | PR系列・正確なmain統合tree・版表示の整合 | 進行中 | [記録](docs/launch-readiness-20260910.md) · [記録](docs/current-state-20260911.md) |
| LCH07 | 同一最終候補の再現配布・導入・復旧リハーサル | 進行中 | [記録](docs/launch-readiness-20260910.md) |

段階ゲート（作業全体の完了とは別判定）

| 段階ID | 作業ID | 内容 | 状態 | 先に通す段階 | 根拠 |
| --- | --- | --- | --- | --- | --- |
| B04-INTEGRATED | B04 | 承認後、main/native/設計reviewの3入力と入口を統合 | 合格 | — | [記録](docs/prompts/os-operational-base-next.md) · [記録](docs/os-operational-validation-20260909.md) |
| V01-BOOT | V01 | 旧b8287bc候補のOS起動・安全基礎（現rc2の全体合格ではない） | 合格 | B04-INTEGRATED | [記録](docs/prompts/os-operational-base-next.md) · [記録](docs/evidence/os-base/freeze-b8287bc.json) · [記録](docs/evidence/os-base/boot-b8287bc.json) · [記録](docs/evidence/os-base/platform-b8287bc.json) · [記録](docs/evidence/os-base/native-ui-b8287bc.json) |
| B02-NATIVE | B02 | 既存native商品1件をSkyで実処理・保存 | 合格 | V01-BOOT | [記録](docs/prompts/os-operational-base-next.md) · [記録](docs/evidence/os-base/business-wallet-foundation-b8287bc.json) · [記録](docs/evidence/os-base/business-backup-acceptance-b8287bc.json) |
| B03-FIXTURE | B03 | 単一ownerの合成Wallet・商品/費用/売上状態の基礎 | 合格 | B02-NATIVE | [記録](docs/prompts/os-operational-base-next.md) · [記録](docs/evidence/os-base/business-wallet-foundation-b8287bc.json) · [記録](docs/evidence/os-base/business-backup-acceptance-b8287bc.json) |
| V01-ACCEPT | V01 | 旧9abf78a候補でD0〜D6縦断合格（現rc2へ転用しない） | 合格 | V01-BOOT · B02-NATIVE · B03-FIXTURE | [記録](docs/prompts/os-operational-base-next.md) · [記録](docs/os-acceptance-9abf78a-20260910.md) · [記録](docs/os-native-repeat-20260910.md) · [記録](docs/os-final-compatibility-20260910.md) |
| B03-PROVIDER | B03 | 実provider/認証済み収益（別の権限・条件が必要） | 未合格 | B03-FIXTURE | [記録](docs/prompts/os-operational-base-next.md) |
| B05-COMPARE | B05 | Wallet基礎後のPC比較/再試験。実機価値は別判定 | 未合格 | B02-NATIVE · B03-FIXTURE | [記録](docs/prompts/os-operational-base-next.md) |
| GX00-ISOLATION | GX00 | ADR・複数owner分離/本人接続・互換/復旧の合成検証 | 合格 | B03-FIXTURE | [記録](docs/prompts/os-operational-base-next.md) · [記録](docs/evidence/gx00/integration.json) · [記録](docs/evidence/gx00/release-required-acceptance-20260910.json) |
| GX01-CONTRACT | GX01 | 複数owner/gameの交換契約と両台帳fixture | 合格 | GX00-ISOLATION | [記録](docs/prompts/os-operational-base-next.md) · [記録](docs/gx01-native-ui-20260910.md) · [記録](docs/gx01-reference-sdk-sandbox-20260910.md) · [記録](docs/game-wallet-release-checkpoint-20260910.md) · [記録](docs/evidence/gx01/final-9abf78a-20260910.json) · [記録](docs/evidence/release-candidate-9abf78a/native-ci.json) · [記録](docs/gx01-dx01-acceptance-20260910.md) |
| GX01-UI | GX01 | OS上の交換操作と台帳変更後D4/D5再検証 | 合格 | GX01-CONTRACT · V01-BOOT | [記録](docs/prompts/os-operational-base-next.md) · [記録](docs/gx01-native-ui-20260910.md) · [記録](docs/gx01-reference-sdk-sandbox-20260910.md) · [記録](docs/game-wallet-release-checkpoint-20260910.md) · [記録](docs/evidence/hub-final-9abf78a/final-c01-completed-stages.json) · [記録](docs/evidence/gx01/final-9abf78a-20260910.json) |
| DX01-SDK | DX01 | 共通SDK・2作者/2game/2owner・fresh導入測定 | 合格 | GX01-CONTRACT | [記録](docs/prompts/os-operational-base-next.md) · [記録](docs/gx01-reference-sdk-sandbox-20260910.md) · [記録](docs/evidence/rls01/sdk-final-9abf78a/README.md) · [記録](docs/evidence/rls01/sdk-final-9abf78a/summary.json) · [記録](docs/evidence/gx01/final-9abf78a-20260910.json) |
| PREVIEW-INSTALL | RLS01 | 旧9abf78aのfresh導入・起動・保存・復旧・削除を完走（現rc2へ転用しない） | 合格 | V01-ACCEPT | [記録](docs/release-installation-plan-20260909.md) · [記録](docs/evidence/rls01/final-9abf78a/summary.json) · [記録](docs/evidence/rls01/github-direct-install-9abf78a/summary.json) |
| DEVICE-INSTALL | RLS02 | 対象1機種でflash・初回起動・OTA rollback・純正復旧を完走 | 未合格 | PREVIEW-INSTALL | [記録](docs/release-installation-plan-20260909.md) · [記録](docs/phone-preview-20260911.md) |

次の作業: 新しいSky Timeline、役割ボタン、自然文ルーティングから法務受付を開けるようにし、安全確認、相談整理、公式情報に基づくAI回答、無料窓口、必要時だけの弁護士引継ぎを会話型画面へ統合した。刑事弁護が必要な案件は藤原茜弁護士を第一連絡候補にするが、自動送信・受任確定は行わない。本人限定Sitesへの再配信後、実環境の画面動線と法令AI・特許調査AIの秘密設定を確認する。SkyのMCP接続の継続設計と、Android/AOSP側のfull build・製品移植・production署名・実機受入は引き続き未完了。
<!-- project-status:end -->

## 次段階の設計

今後は [製品ベース](docs/product-baseline.md) と [次の実行プロンプト](docs/prompts/os-operational-base-next.md) に従い、native OSの稼働受入、既存商品の実利用、Wallet、作者向けゲーム連携へ進めます。従来のG0→Cuttlefish→Pixel→StoreはAndroid/AOSPの過去計画。旧 [初期仕様](docs/product.md) は履歴として保持します。
