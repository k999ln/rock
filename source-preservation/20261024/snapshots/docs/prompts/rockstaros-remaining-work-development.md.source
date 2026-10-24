# RockstarOS：Mini・Pro・OS・Smith・Eveの全未完了とGit保存・統合を進める詳細開発プロンプト

## 実行時は担当チャットへ分岐する（2026-10-24 本人指示）

入口は[軽量な担当チャット分岐](rockstaros-development-chats.md)。本書は詳細正本として保存し、各チャットは自分の短いpacketと一つの小unitを読み、必要な元チャット/契約/sourceへ参照する。巨大全文・全履歴を毎担当へ複製しない。共通台帳は`data/rockstaros-development-chats.json`、各lane記録は`data/development-lanes/<lane>.json`。同時activeは最大3（元Smith実機処理中は新bootstrap最大2）。共有契約/全体進捗/Git操作はsingle-writerで統合する。全機能180項目の追加監査を、元75unitの完了や全製品網羅へ置換しない。

改訂：2026-10-24 米東部時間（America/New_York）。主担当：Git / CI / OperationsのROCK（G04）。元P01〜P13を維持し、Mini・Pro・OS・Smith・Eve、eSIM導入、利用料管理・請求、GitHub保存・main統合を実装単位へ具体化した。今回の文書作成の事前見積は25〜40分。これは開発全体の所要時間見積ではない。

**各担当は軽量packetから、自分のunitだけを本書で参照して実行する。** 本書の改訂保存は開発プロンプトの作成であり、実装・配備・実機・課金を実行した記録ではない。実装を依頼された担当は最新入口の実行モードへ進む。文書の事前見積は25〜40分。以下の開発全体の完了期限は、実issuer/料金版/専用Linux/部品・機種/外部審査等が未確定のため未算定。次の担当は着手時に工程別の所要時間・費用・条件・確度を先に示し、観測結果で更新する。経過時間、試験件数、文書行数を実働や完成率に換算しない。

## 開発モデルの割当と実行モード（2026-10-24）

最新の開始指示は `docs/prompts/rockstaros-development-chats.md` のモデル指定付き実行プロンプト、95unitの指定は `data/development-model-routing.json`。通常実装/統合はGPT-6.1 Sol、限定read-only補助はGPT-6 Luna、OS-17/MINI-02の難しい設計と条件付き重要gate検収はGPT-6 Astraを使う。モデル名/effortは実際のdispatch引数へ渡す。切替で権限/作用/予算を拡大せず、全試行数はunit通算、検収も合計3枠へ算入する。

本書の「作成時点で未実行」という記録は改訂時の履歴である。作成/説明を依頼された時は指示書だけを扱い、ユーザーから開発実行を依頼された担当は最新入口の実行モードに従って、既存成果と合格条件を維持しながら実装・検収・保存・次unitを進める。製品内LLM、商品料金、一般公開保留、実機/金融/契約の個別gateは変更しない。

## 履歴から受け継ぐ成果の入口（2026-10-24）

各担当の元チャットと新11担当、計23チャットをturnページ終端まで取得し、継承重複を除いた採用判断・反証・成果・未受入を `data/rockstaros-chat-achievements.json` へ採録した。全toolログ／参照先動画／外部チャットの全件精読ではない。担当packetの「履歴成果から維持するものと再開条件」を先に読む。数値・試験件数・過去hashは記録時点の層だけに有効であり、同名pathの現候補へ転用しない。

特に、Miniの携行／直接衛星Wi-Fi／光学反証・ProのAI専用PCと12販売gate、Eveの同ID復旧／Newsの出典と同意撤回／不採用model、Smithの3接続方式と共有来歴、main既存eSIM／月次storeの再利用を維持する。最新Pixelは担当登録・実推論・1961byte成果の外部開封・終了済jobへの停止／待機まで進んだが、出力品質は不合格、稼働中停止／通常接続復旧／全周は未受入。元Smithのleaseを越えて再実行しない。

## 履歴成果を受け継いで実装・検収・保存を回す手順

この改訂は指示書と引継ぎの保存である。既存の実装承認を取り直さない。実装を実行する際は、完了済みの初回bootstrapをもう一度繰り返して終了せず、以下を統合担当が有限に回す。今回のprompt改訂だけを理由に製品実装、元チャットへの追加実行指示、実機・Provider操作を開始しない。

1. **履歴成果とsourceを照合**：`data/rockstaros-chat-achievements.json` の自laneだけを読み、採用判断、反証、不採用、成果artifact、検証層、再実装禁止、次batchを確認する。元turnは根拠であり現在の実装成功ではない。同じpathでもRoot／別Source／main／配布物の版とhashを区別し、採用済み実装を新規作成しない。過去の失敗は最新候補で解消済みなら再発調査に戻さず、未検証なら未検証として維持する。
2. **source保全と編集権の移管**：GIT-01〜04で変更・未追跡bytes・既存worktree／PR・移行採番・main契約を読み合わせる。統合担当はregistryのglobal writerを、候補SHA／source manifest／exact write set／資源lease／引継ぎ日時とともにGit担当へ明示移管する。移管前に各laneへ共有fileの書込みを渡さない。元SmithのPixel操作は終了と同artifactの読戻しが確認できるまで重複しない。
3. **次の小作業を選ぶ**：`data/development-unit-progress.json` から入力・契約・担当・局所試験・必要な同意／予算・資源leaseの揃ったunitを選ぶ。最初は保全とP01非破壊診断を並行し、必要最小Coreから短いP02へ進む。Remix／全model／光学／full OS／金融の全完成をP02や非金融Gameの一律前提へ足さない。ID順を無条件の依存順にせず、当該unitが触る契約・状態・作用の依存だけを記録する。
4. **一件を引き渡して実装**：既存の担当チャットへ、目的、unit ID、維持する履歴成果、入力hash、exact編集path、依存契約、局所検証、合格証拠、外部条件を短く渡す。別チャットへの送信は本人から明示された連携範囲に従う。許可のない新chatを増殖させず、このtask内の補助検収はsubagentで行える。統合担当・Git・実装・補助・検収・元Smithを合計してactive最大3とする。統合担当とGitが別activeなら各1枠、元Smithもactiveなら新しい作業は枠が空くまで開始しない。全履歴／全promptを再配布しない。
5. **検収する**：laneはowned sourceと局所試験を実施し、変更path、同一候補hash、正例／負例、失敗復旧、作用数、費用、受入層、未決条件を自lane JSONへ返す。共有fileは変更要求で渡す。統合担当と実装者以外の検収担当が差分と証拠を点検し、未合格なら理由を一件に絞って差し戻す。host／fixture／browser／実model／実機／Provider sandbox／本番の結果を交換しない。
6. **保存して次へ進む**：局所受入後、Git担当が変更を小さく保存し、通常commit／push／PR／同SHA CIへ結ぶ。実装受入とGitHub保存、main統合、配備は別の状態として記録する。統合担当がunit台帳へ検収結果と参照を反映してから、次のeligible unitを選ぶ。全95作業を共有dirtyへ溜め込まない。固定統合候補の全verifyはGit担当がまとめる。
7. **失敗・外部待ちを分離**：再試行は同一requestの照合を優先し、unitの回数／期限／費用上限を越えない。同じ原因で差戻し2回なら原因・必要入力・復旧先を記録し、別の実行可能unitへ進む。有料作用／結果不明送信の無制限再送、初期化、権限緩和で通さない。全てが外部／本人／資源待ちであれば、その具体条件と再開unitを返して今回の処理を終了する。
8. **完了を区別**：unitの納品受入、製品の達成条件、Git保存／main、環境別受入を分ける。光学不成立の反証を納品したunitは、その納品だけacceptedにできても「Miniの空中表示成立」にはしない。外部待ちや不成立を残したまま全製品完成としない。最終報告には95unit／元13Pの受入済み・未完了・不成立・外部待ち、保存／CI／mainの証拠、次の条件を出す。

unit台帳は統合担当／Gitのsingle-writerで管理し、各laneは自lane JSONへ事実を返す。`accepted`には成果と独立検収が必要で、promptを読んだ、bootstrapを終えた、既存testが通ったという事実だけで95unitを完了へ変えない。新しいsourceや契約が候補へ入ったら、影響unitを再検証待ちへ戻し、履歴成果を消さず差分と理由を記録する。

## この文書の使い方と詳細の範囲

統合担当はP13の前半から開始し、各担当へ短いpacketと一つのunitを渡す。各Pは元の未完了13件、詳細unitはその実装子作業である。見出しの列挙で終えず、各unitの対象source、入出力/状態遷移、owner/版/承認、永続化/移行、失敗/復旧、負例、実在検証入口、合格証拠、残る外部/本人条件まで実装する。**指示書の保存と、開発・commit/push/main統合・配備・実機・実請求の実行記録は別である。開発を実行する依頼では、最新入口のモデル指定と有限手順に従う。**

詳細章は[Git保存・統合](#git-detail)、[eSIM利用開始](#service-billing-detail)、[利用料・請求・作者精算](#billing-detail)、[Smith](#smith-detail)、[Eve・OS](#eve-os-detail)、[Mini・Pro](#mini-pro-detail)。元P01〜P13と詳細unitの対応は`data/rockstaros-remaining-work-plan.json`にあり、親Pを完了にする際は該当unitと受入層をすべて点検する。

**最初のcritical path**：P13/GIT-01〜04で保全・mainの契約/再開先を同期 → P01の非破壊診断を独立ROCK作業と並行 → 新Agent一件に必要な最小共通Core → P02の実Web/Pixel一周。Remix/media・外部アプリComputer Use・LLM/GPU/学習・光学・商流の全完成を短いP02の前提へ置かない。eSIM/請求fixture、Mini/Pro client、Privacy/実feed/研究は独立に進める。各unitを小さくcommit/通常pushし、最終段階で同じ統合候補のverify/CI/レビュー/main readbackを閉じる。全部が終わるまで共有dirtyへ溜めない。

**報告を独立させる**：文書、source保存、branch commit、GitHub保存、main統合、preview配備、実browser、fixture/local Worker、実model、実device、Provider sandbox、製造/商流、本番。台帳のboolをtrueへ書き換えただけで合格にしない。未実行/unknown/不成立/条件未定は理由付きで残す。外部待ちだけを切り離し、独立ROCKの実装・診断・fixture・復旧を完了する。

## 0. 任務と納品の定義

あなたは既存のRockstarOSを実装・検証する担当である。構想の再説明や新しい台帳の新設で終えず、既存sourceと契約の未接続部分を直し、実際の本人が依頼・実行・成果・停止・保存・費用を使える状態へ進める。P01〜P13を一件ずつ既存taskへ対応付け、ROCK_READY、PROVIDER_READY、INTEGRATED、LIMITED_LIVE、PRODUCTIONを別々に報告する。外部依存が残っても、独立したROCK実装・fixture・復旧手順・診断・UIを進める。外部の同意や機器がない状態を仮の成功で埋めない。

最初の製品縦断は、同じowner/accountで **Eveへ目的 → 本人用Agent作成 → Smith追加 → 同ID/revision/modelを登録 → WebとPixelから実行 → 同じ成果を読戻し → 指定job停止 → 再起動/別client復帰 → usage照合**。次に別ownerへ明示共有し、別owner自身の権限・予算で使えることを確認する。

サービスの縦断は、**料金版と保存/停止条件へ同意 → 支払い方法登録（初回引落0） → 真正なeSIMサービス利用権 → 同workspace/Linux準備完了 → serviceStartAt → 見積/原子予約/使用量 → 月次Invoice → Provider照合/入金 → 未払い制限/復帰 → 作者精算**。Mini/Proは同じ契約への鍵付き子接続と共通runtimeを使い、機器の入出力とnative OS適合を追加する。

## 1. 正本・現在地・承認境界

### 最初に読む

1. AGENTS.md、docs/product-baseline.md、data/product-baseline.json、README.md、project.md、data/project-status.json。
2. docs/workstreams/README.md、docs/workstreams/00-responsibility-boundaries.md、docs/workstreams/10-git-ci-operations.md。Product/UXと各領域は該当workstreamへ共同依頼する。各Pの実装時に対応するSky/MCP、Billing、Security、Web、Native、Android、Game、Material、Gitの入口を読む。
3. docs/execution-approval-20260909.md、data/execution-approval.json、docs/prompt-playbook.md、docs/design-implementation-alignment-20260909.md、statusのphaseGates。v1.1実装は承認済みで、古い再承認待ちへ戻さない。
4. docs/rockstaros-design-portal.md、docs/rockstaros-complete-design.md、docs/sky-tools-complete-design.md、docs/rockstaros-avocado-mini-complete-design.md、docs/device-support-architecture.md、docs/sim-led-product-architecture.md、docs/sky-billing.md。
5. docs/prompts/rockstaros-common-core-development.mdのCORE01〜12とRQ全体対応、docs/prompts/eve-execution-si-development.mdの実行SI00〜08、docs/prompts/eve-sky-usage-routing-settlement.mdのU01〜05。既存残作業・Game/Material等を削らず、この13件を実行順の上位へ置く。
6. 各Pに記す実コード・contract・migration・テスト・同一候補のevidence。旧current-stateや単一status flagより最新source/進捗/同一artifactの証拠を優先する。

### 作成時に実際に確認した入力

この節は作成時snapshot。着手時に最新ref・チャット追加・対象hashを再照合する。最新の会話で増えた実装を過去の受入へ加算しない。

- `npm run prompt:context`：2026-10-24T02:43:59.697Z（10/23 22:43 EDT）、ref再照合まで成功。21branch、open PR11件、recent closed/merged30件の取得範囲。main `7304e449cd7938b098b0b1ce481a06501db8d795` の同SHA22check成功、作業branch `codex/esim-cloud-access` / `951d82d5a491a284aed4e0d4d280171d835d4b43` はsource-preparation1件だけ成功。dirty Root全体の成功ではない。
- main/branch分岐は669/3。main baseline2.08/RQ50/status393task、commit済みbranch baseline1.98/RQ49、改訂開始Root baseline1.123/RQ49/status165task。今回のprompt改訂はRoot baseline1.124へ記録し、版番号や件数を根拠にmainの契約/実装を片側置換しない。
- 改訂開始22:43 EDTのRootは`git status --porcelain=v1 -uall`で1375path（tracked変更328・削除7・未追跡1040）。同じ共有treeへ他担当の追加があるため件数は変動する。directory集約表示の1091件等と混同しない。Gitへの未commitでありディスクに未保存とは限らない。
- 直接blob比較でRootの`lib/rockstar-service-attachment.ts`/`lib/rockstar-service-setup.ts`はmainと一致。`lib/workflow.ts`はRoot HEAD・dirty Root・mainで異なる。mainには`lib/sky-cloud-monthly-store.ts`がありRootにはない。Rootには`sky-agent-monthly-statement.ts`、新Remix/mediaがありmainにはない。必ず比較・再利用して追加差分だけを統合する。
- Eve Sourceは別repo `work/eve-v115-agent-integration`、local commit `3f6075f7190be778f0a8b4d243a087d6f99081b9`、originはローカル`work/eve-v115-live-source`。新Remix/mediaはここにない。Smith Add/outcomesは別`core-source-integration`にもあり、新purpose/moduleはそこにない。Source commit・GitHub保存・main・公開を独立記録する。
- 5領域の主要・関連10チャットの直前監査を基に最新turnを追補。正式表示はSmith、元eveは最新70turn、後発eve (2)は新3turn＋継承7turnの監査後に最新2turnを再確認し追加なし。Miniの最新turnは追補時進行中なので完了を推測しない。各readScope/未読・重複の限界は対応表/evidenceへ記録する。
- Miniはv0.8/PDF52ページへ更新。表示位置の板/膜なし、手入力・reference動画対応、光学出口反証のsourceを追加。47ページ/507位置の旧監査は履歴。文書の章数とPDF page数を区別し、後発CM/Remix/media追補も対象source/hashへ結ぶ。光学/実camera/最終PCBは未受入。
- Proはbrowser OS preview v46、localStorage下書き/boardまで。account/実AI/native/実機・販売12gate未受入、有料注文/発送0。専用domainの今回実画面試験は未実施。
- Sitesは統合担当が改訂中にget_site読戻し、RockstarOS latest118/active/avoado.si、Mini・Pro共用latest46/active/avocadomini.siを確認。v118 source `d26363bd7f4a37501db6ba2061728b80351bf776`、v46 source `c49a0eaa385bb8b0d2b94055e393cee89d17c718`は保存証拠から同定。metadata読戻しは現UI/実機/本番受入ではない。Smith名/新Remix/mediaが公開済みとはしない。
- 新AgentのWeb/Pixel実model・両成果の一周は未受入。runtimeに関するPixel保存観測は10/23 15:09 EDTのTerminal Start error/VM0、Smith側最新20:56 EDTはUSB再接続確認のみ。現在の端末状態・原因は再観測が必要。元eve06:57のUI接続失敗の後、eve (2)で実browser操作成功があり、現在全UI不通と断定しない。
- 新mediaは4編集/IndexedDB保存の限定local UI証拠。出力4ファイルと本体4入力hashは照合済みだがtest1入力と旧Remix UI6入力は後続変更。Smith旧purpose/moduleも当時hashから差分がある。旧passを最新candidate全体へ転用しない。

関連open PRは#100/#103/#104/#105/#106/#108/#110/#130/#171/#177/#178。#130はopen/mergeable=false/dirty、head`3a805132c7d85c50ca76eb9de960c90b5b3e77da`。merged #185/#184/#183/#182等と後継実装を比較し、既存patchの二重導入を避ける。無関係PRを無差別にmergeしない。

監査script互換の旧SHAは**2026-09-09の履歴専用**：main `7cdbb5fedc86ee3978ed329d9312147d137c9199`、native `fcedcfec4dd2a242a1ba8fd7ff5eebba97b8ecd5`、設計 `de5b102d3525daccf604efd5685bdf8c14ad5d50`。現行起点は上記freshrefと開始時の再取得である。

### 固定する製品・権限・料金

RockstarOS 1.0（内部dev.rock）が全体。その中にEveというLLM製品、Smith（旧Sky）の発見/追加/接続/共有、Linux/Provider実行環境を置く。主要3タブはSmith/Eve/コミュニティー。Eveの基盤モデル・hash・実行先を明示し、自社重み・万能SIの完成を仮定しない。モデルの計画/評価/自然文は本人承認・Tool成功・課金確定へ昇格させず、Brokerが権限と予算を強制する。

標準提供は既存OSの共通client/runtimeで、eSIMは真正サービス利用権と環境準備の入口。iOSへのLinux自動導入や完全無操作起動、eUICC内への任意applet追加、全機種適合を仮定しない。native/QEMU/Pixel/Mini/Proは各実機・image・driverの別gateを保持する。eSIM/SIMをすべての利用形態の必須条件にせず、本人が許可した既存OS/browser/端末内LLMの経路も維持する。

月16USD/契約accountの基本料と対象枠/超過従量を共通化。枠量/単価/税/日割り/猶予/地域/保存期限は未確定の版付き判断とし、fixture価格を販売条件へ使わない。通信、外部Tool、AI、Linux、作者料、商品、OSS/BYOK、税/決済費用、別商品140USD Sandboxは分離する。ATMのRock徴収手数料0、既存の検証済み収益/月最大888 centsと同契約多端末の重複防止、ゲーム料金未定・実交換無効を維持する。

正式入口はavoado.si、Miniはavocadomini.si、Proはavocadopro.si。綴りをavocado.siへ補正しない。localhostの本人用Lab/部品実験・秘密を公開域へ移さない。一般ローンチ保留、ゲーム/予測市場/資産売買/DAO/IP/NFT等の実処理は個別gate。非金融Game/作者SDK/合成Materialは金融やfull OS完成を待たず進める。

公開・実機導入・MetaMask等の条件付き了承は既存session/記録と対象を照合し、同じ許可を再要求しない。購入/契約/有料資源・本番鍵・bootloader解除/初期化/flash・実資金・第三者投稿/送信等で対象や条件が未指定なら、実装・fixture・復旧準備を終えた具体的候補だけを最終判断へ出す。今回のプロンプト依頼から実行済みや新たな包括許可を作らない。

## 2. 実行順と責任

最初にP13の保存先・差分・正本・引継ぎ順を同期する。P01の非破壊読取りと、依存しないROCKの契約/fixtureは並行可能。その後、同じ候補でP02→P03を優先する。

- runtime線：P01→P02→P03、P11は変更前から基準測定し各段階で再測定。
- service/料金線：P06/P07のROCK実装を並行し、真正issuer・共通Core受入・managed Linux・支払準備が揃う候補で縦断。P08の本番分配は入金/返金・異議/作者契約の受入後。P05 full OSはこの線の一律前提にしない。
- 端末線：P10の共通client/子接続/adapter→実機、P05のPixel full imageとQEMU系列は独立。Mini/Proのnative image/物理光学/電力は専用gate。
- 情報・安全・研究線：P04、P09、P12を並行。実feedや生体の外部条件が未確定でも、同意・ACL・parser/store・diagnostics・raw非使用fixtureを進める。公開Security再確認はrelease前必須。

ROCKは実装・状態/予算/本人照合・失敗復旧、EXTERNALはissuer/Provider/OS/BSP/機器/審査の供給、JOINTは同一候補の接続受入、OWNERは対象・料金版・費用/送信・本人鍵操作・公開等の最終判断。ROCK_READYを一般利用可能と表示しない。

並行担当には編集ownershipを明示する。統合担当がworkflow/contract/共通migration番号と正本入口を管理、runtime担当がCore/Pixel/SDK、service-billing担当が既存利用権/請求/精算、UI/feed担当がHome/Eve/Smithの画面・socialを担当する。同一file/migrationを複数担当が同時置換しない。必要なら既存の適切なworktreeを再利用し、担当実装とは別の検収者が証拠を判定する。共有dirtyをreset/stash/force push/片側優先mergeで消さない。本人指定の既存11担当チャットを軽量packetで利用し、履歴成果台帳とunit進捗で接続する。必要な補助検収はこのtask内のsubagentで行い、全履歴のforkや未承認の新chat増殖をしない。

以下のP番号は成果報告の整理IDで、既存task IDを置き換えない。`data/rockstaros-remaining-work-plan.json`を実行対応表、各節の既存evidenceを受入正本として更新する。`done`は実際に満たした層だけに使う。

<a id="p13"></a>

## P13 GitHub正本・作業branch・別Sourceの引継ぎを最初に同期する

**担当/既存task**：Git/CIのROCK、G04/OS10/DOC01、関連WEB04/SKY21/SIM01/BIL02。mainのRQ50（余剰端末計算仲介）とCore/schema/安全修正を既存の承認履歴・`docs/sky-compute-grid.md`へ照合し、RootのRQ01〜49を一括削除・無断拡張しない。研究87件・CORE/SI/U系列も保持する。

**原因**：mainとcommit済みbranchが669/3に分岐し、最新runtime/queue/請求候補がRoot/別Source/公開Siteへ分散。branch source-preparation成功とmain22件successは、共有dirtyや公開v118のruntime受入ではない。

1. `npm run prompt:context`でmain/全branch/PR/同一SHA CIを再取得し、上記snapshotとの差を記録する。取得失敗は最新未確認として扱う。選択refがlocal objectに無い場合だけfetchし、40桁SHAに固定して対象code/AGENTS/README/project/status/fixtureを読む。current checkoutを切り替えない。
2. 既存active worktree/Sourceを調べ、`git status --short --branch`、対象path hash、開始HEAD、未追跡/削除/migrationを棚卸し。原稿/秘密/巨大image/model/cacheをGitへ混ぜず、必要な入力だけGit管理外へ保全する。Root/Source/公開Source/mainの4列の差分台帳を作る。文書保存と機能保存を別列にする。
3. mainの保護機能/追加RQ/依存versionを検収して基準に取り込み、Rootと別Sourceの新機能を所有者別・機能別の小さな変更へ分ける。`work/eve-v115-agent-integration`等は実在とHEAD/hashを確認し、公開v118や各evidence記載commitと同一かを照合する。同じpatchの二重適用、古いWeb bundle/drizzle生成物の再導入、未統合を未実装とする再発明を避ける。
4. 最初にAGENTS/README本文/project/status/本prompt/nextPrompt/CHECKPOINT（存在時）へ再開先と優先順位を同期する。`lib/workflow.ts`を仕事状態の正本に保ち、owner保存/revision CAS/暗号化履歴/予約/receipt/停止のschema互換を確認する。単一owner多端末と複数ownerを区別する。migrationは一人が採番し、既存DB/旧client/旧pending形との互換をfixtureで検証する。
5. P01〜P12を限定候補へ統合し、小さい対象試験→固定入力全verify→同SHA CIの順に進める。並行編集で入力hashが動いた試験を固定候補の成功と呼ばない。既知の失敗は原因/対象path/未実行後続を残して、他領域は継続する。
6. review可能なcommit/PRにscope、source/base/head、対象hash、検証、残件、rollbackを記す。GitHub保存、作業branch反映、main統合/CI、Sites配備/asset/header読戻し、APK更新、native受入を独立報告する。通常Git保存・main統合は詳細GIT-06/07の同SHA CI・独立検収・互換条件を満たして閉じる。公開は別gateと一般ローンチ保留を維持する。履歴の強制上書きはしない。

**入出力/保存/復旧**：入力は固定ref・所有者別diff・既存受入。出力は採用/保持/未採用の差分台帳と互換候補。競合は対象hunkごとに理由を記録し、runtime候補を保存してから戻せるようにする。permission/owner/価格/停止の意味が不明な競合は片側優先で通さず、その実装単位を保留して独立作業へ進む。

**確認**：`npm run prompt:context`、`npm run project:check`、`npm run baseline:check`、`npm run design:check`、`npm run schema:check`、`npm run database:check`、対象test、統合後`npm run verify`。チェック0件はNO_CHECKSで成功にしない。main/Sourceの古い成功を新candidateへ付け替えない。

**合格証拠**：開始/終了SHA・対象path/hash・migration前後・差分採否・同一候補のverify/CI・rollbackが一致し、次の担当が同じ候補を再開できる。P13先行の文書同期だけではmain統合/製品一周の完了にしない。

**前版作成時の検証（履歴）**：正本/設計/進捗と型検査は成功。`npm run verify`は最初にprojectのnextAction更新に追随するDB進捗生成文書の未同期で停止し、`npm run database:status`で文書のみ同期後に再実行した。再実行は`lint:product`で、共有作業ツリーの未追跡`tests/eve-remix.test.mjs`の6/12/16/21行が`typescript(no-floating-promises)`となりexit1。後続のnpm test/build/APIはこの実行では未実行。今回改訂時点で同じ失敗が残るとは断定しない。実行時のP13で最新の当該差分のownershipとテストの意図を確認し、必要なawait/明示的なPromise処理を最小修正して対象lint/test→全verifyを通す。規則を無効化して通さず、今回文書だけを保存したことを全verify成功と報告しない。


<a id="p01"></a>

## P01 Terminal開始エラーを非破壊で診断し、既存Linux接続を回復する

**対応と責任**：OS10を主担当、DSP01/CORE03/CORE05/CORE07と連携。RQ04/RQ07/RQ08/RQ12/RQ27/RQ41/RQ42/RQ48の既存契約を使う。ROCKが診断と限定adapter、EXTERNALがTerminal/AVF、JOINTが同Pixelの回復、OWNERがunlock/Terminalの実操作を担う。

**開始時の根拠と原因**：`docs/evidence/eve-smis-execution-loop.json:lastDeviceObservation/resumedAttempt`は2026-10-23 15:09 ET（19:09 UTC）の過去観測で、VM0、既存account/pairing、空き23GiB、本人のStart error報告とerror本文不明を記録する。これを現在も同じと断定しない。「AVF tapなし」は当該JSONの明示fieldにないため再測定する。`docs/evidence/pixel-durable-stops.json:androidOsRestart`の古いsocket残存修正と今回Start errorの因果関係は未知であり、原因と決めつけない。

**読む実装・証拠**：`toolkits/sky-linux-local/README.md`、`android-bridge.py`、`owner-tests/dev/rock/shell/EveOneLoopPreflightTest.java`、`common-ui-src/PixelPortableBridgeProtocol.java`、`scripts/sky-linux-runtime-bridge.mjs`、`scripts/pixel-runtime-stop-journal.mjs`、`scripts/inspect-phone.py`、`docs/evidence/sky-pixel-linux-entry.json`、`pixel-guest-update.json`、`pixel-durable-stops.json`、`eve-native-agent-preparation-pixel.json`を読む。旧5199 browser転送とnative AVF tap5198 mTLSを区別する。

**実装・診断順**：

1. 現在の接続対象がPixel 10 GL066/frankelであること、authorization/lock状態、APK/Terminal/OS版、VM一覧、現在の空き、tap/gateway、限定service/port/socketをread-onlyで再観測する。serial・IP・account識別子・全文logは公開証拠へ残さず私有診断から要約する。既存仕事/model/Agent件数は当時の28/2/6へ固定せず現在値をbaselineにする。
2. 本人のStart操作直後に正確なerror文/画面・時刻・当該processの限定logを得る。既に取得済みなら再質問せず使う。UI接続がない場合もsource/限定log/host再現を続け、UIによる実際のStartをfixtureで代用しない。
3. install/provisioning、guest disk/容量、AVF起動、host権限、tap準備、mTLS、guest service、private socket、account同期を別段階へ分解し、最初に失敗した層を特定する。既存guestのreset、app data clear、再download、旧socketの無条件unlink、key再生成、account作り直しを診断策にしない。未知はunknownとして残す。
4. 原因がRock側なら対象pathと最小再現を固定し、小さな修正・負例・旧状態保全試験を先に行う。上流問題なら正確なbuild/issue/再現と、本人データを保つ限定回復手順を示す。guest保護更新が必要ならP02の固定file manifest/update transactionを再利用し、元DB/weights/鍵をbackupで上書きしない。
5. 本人unlockと既存Terminal起動後、mTLS→既存account同期→read-only statusまで確認する。実推論はP02の一周として別に数え、同じ仕事を診断のため再送しない。

**入力・状態・保存・復旧・承認**：入力は観測時刻、正確な機種/build、既存session/grant、限定診断と元error。状態は未観測/locked/VM開始失敗/VM起動済み/bridge不通/account同期保留/readyを分ける。保存は既存guestのjob/model/Agent/鍵と同accountの履歴を維持し、診断に本文やcredentialを含めない。診断失敗で状態や件数を0へ上書きしない。変更多重適用や結果不明更新は同transaction IDを照合し、署名やmodelを作り直して逃げない。再起動等は既存実行中job/UNKNOWNを照合し、既に承認された非破壊範囲で進める。

**実在する局所コマンド**（今回の作成時にpathを確認、実行結果は未取得）：

```sh
python3 -m unittest discover -s tests -p 'test_inspect_phone.py'
node --experimental-strip-types --test tests/pixel-runtime-bridge.test.mjs tests/pixel-runtime-stop-journal.test.mjs tests/pixel-guest-update.test.mjs
python3 -m unittest discover -s tests -p 'test_pixel_guest_update.py'
```

実端末のread-only確認は`python3 scripts/inspect-phone.py --serial <本人の接続対象>`を使い、対象serialを公開logへ残さない。`EveOneLoopPreflightTest#inspectExistingRuntime`は既存paired account/鍵/guest statusと準備能力だけを読む既存instrumentationで、新推論・grant・credential exportを発生させない。実行するtest APKのhash/署名/runnerを確認し、実装したstaging候補へだけ取り込む。存在しないnpm診断scriptをあるものとして指示しない。

**合格**：正確なerrorと原因、修正又は限定回復手順が説明でき、現在baselineの既存状態/鍵を保持して同じPixelからVM・mTLS・同account read-only同期が成立する。VM0が続く、error未取得、owner unlock未了、上流未修正なら未完了のまま条件と次手を残す。host試験や昔の再起動成功をP01実機合格へ転用しない。

<a id="p02"></a>

## P02 現在候補のEve→Smith→Web/Pixelの実一周を閉じる

**対応と責任**：WEB04/SKY21/OS10、HOME01/DSP01/CORE01/CORE02/CORE03/CORE06/CORE07/CORE12。RQ01/RQ02/RQ04/RQ07/RQ08/RQ26/RQ40/RQ41/RQ42/RQ48と後続のEve LLM/smis改名・同account一周の明示指示。ROCKが共通経路、JOINTが同候補のWeb/Pixel操作と実model、OWNERが目的/役割/実行/停止を確認する。

**現在地**：`docs/evidence/eve-smis-execution-loop.json`には公開v118/asset71一致、同Agent ID/revision登録とNative Java→HTTP/TLS→private Unix bridge→production Linux managerの合成連結169 assertionsがある。しかし実browser/Pixel実model/同account二client/両成果受領はfalse。旧v94同期、独立password2件、v113の既存Agent実0.5B、v115停止を保持し、新規作成一周へ合格転用しない。

**再利用path**：`lib/rockstar-eve-interaction.ts`、`lib/eve-purpose-runtime-work-port.ts`、`lib/eve-runtime-work-port.ts`、`lib/eve-agent-preparation-sync.ts`、`lib/eve-runtime-sync.ts`、`lib/eve-runtime-history-control.ts`、`lib/eve-runtime-export.ts`、`lib/eve-runtime-recovery.ts`、`components/eve-interaction-panel.tsx`、`components/eve-sync-workspace.tsx`、`components/eve-agent-composer.tsx`、`components/eve-runtime-interaction.tsx`、`app/api/eve/runtime/route.ts`、`app/api/sky/agents/route.ts`、`lib/workflow.ts`、`toolkits/sky-linux-local/common-ui-src/`と既存manager、`packages/rockstaros-runtime/`。詳細は`docs/sky-tools-complete-design.md#smis-eve-workbench`、停止由来は`docs/evidence/eve-core-existing-provenance.json`、復旧pauseは`docs/evidence/eve-runtime-recovery-pause.json`。

**実装順**：

1. Webの配信Source、Root、native APK、guest packageを個別hashへ固定し、P13と差分を調停する。公開v118が現在も最新かreadbackし、未公開Core修正をv118に搭載済みとしない。P01の現在read-only preflightで既存account・準備済みmodel・Agent登録capability・active/UNKNOWN jobを確認する。
2. Eve制作画面→目的確認→本人用Smith設定保存→同ID/revisionをEveへ渡す→端末queue登録→exact presence readback→実行まで、重複するstore/権限/料金を作らず既存WorkPortへ結合する。新しい担当作成はdeterministic text roleの設定保存で、自社LLM学習や任意software生成/buildではない。
3. owner/thread/device/Agent ID・revision・role digest/model ID・scheme・hash/input digest/job ID/期限/上限を実行直前に再照合する。登録は同じpreparation IDで読戻し、未知/期限切れ/設定変更/送信応答喪失を自動再登録しない。登録成功と実model推論成功を分ける。準備済みモデルのみ、既存256tokens上限、外部Tool作用0、任意shell0、model取得0、無断Cloud fallback0で開始する。
4. 同accountのWeb実画面で短い合成目的を確認し新Agentを作成、Smith同ID/revisionを読戻して実行する。Pixel実画面から同設定を使う際、同じ実行jobの続き読取りは同jobへresumeし再発注しない。別の依頼として再利用を実証する時だけ明示確認した別job IDを作り、同Agent/版の2依頼と成果を区別する。同じIDを二回実行して二client対応としない。
5. 本物のlocal model出力、元job/thread/Agent/model pin、artifact本文hash、review状態、usageの0/null/未照合をWebとPixel双方で読戻す。UTF-8文章をAndroidの指定保存先へexportし、独立readbackのbytes/hashを照合する。本人の内容検収前にcompletedへ上げない。
6. 同job停止→元executor receipt→停止確定、app再起動/client再読込み→同IDの成果又は停止読戻しを確認する。knownExisting markerあり/なし、server記録消失、first delivery fence、claim済みstop、遅延start、欠損receiptを別負例で扱う。元hostのreceiptなしにstopped/費用解除/standbyへ上げない。
7. guest更新が必要なら`toolkits/sky-linux-local/README.md`の保護更新と既存manifest/updaterを再利用。active/UNKNOWN job、現在の保護state/鍵/model、署名/ABI、rollback候補を先に確認し、固定fileだけ更新。同一transactionのrecoverを使い、初期化やcredential再登録を回避する。別端末driver受入はP10へ残す。

**共通入出力・保存・失敗**：入力は本人確認済みの目的/役割・同意・上記pin、出力は同jobの草稿・artifact・実usage・stop receipt。Core状態disabled/standby/listening/review/creating/running/result/stopping/unknownとserver workflowを対応づける。実本文は既存owner暗号化履歴/command/replicaへ保存し、pending参照を実行権限へ昇格しない。401再認証、409再読戻し、404既知記録喪失、5xx/timeout結果不明を分離し、自動有料再送しない。復旧pauseは運用者の外部設定であり自動災害検出/全service復旧ではない。実UI接続不良/未loginは合成UIへ置換せず残す。

**実在する検証コマンド**：

```sh
node --experimental-strip-types --test tests/eve-os-interaction.test.mjs tests/eve-runtime-work-port.test.mjs tests/eve-purpose-runtime-work-port.test.mjs tests/eve-agent-preparation-sync.test.mjs tests/pixel-agent-preparation.test.mjs tests/smis-eve-workbench.test.mjs tests/eve-runtime-stop.test.mjs tests/eve-runtime-export.test.mjs
npm --prefix packages/rockstaros-runtime run build
npm --prefix packages/rockstaros-runtime test
npm run sky:linux:pixel:build -- /private/tmp/rockstaros-p02-pixel-candidate
npm run typecheck
npm run design:check
```

`sky:linux:pixel:build`はpackage.jsonの`node scripts/build-sky-linux-pixel.mjs`。配布package生成を実機導入へ換算しない。対象Sourceで`npm run build`した後、実在する`node --experimental-strip-types scripts/check-eve-runtime-recovery-worker.mjs --project <固定Source絶対path>`で合成D1復旧保留を再現できる。localhost権限不足は実行失敗として扱う。169 assertionsの再現には対応証拠が指すimmutable Worker/native候補の実在とentrypointを読む。名前を推測して架空のnpmコマンドを足さない。各局所合格後、同一candidateの`npm run verify`とAndroid固有build/unit/lintを行い、実UI/実Pixelは別記録する。

**合格**：同候補・同ownerで新Agent作成/私用保存/同版登録/実model/双方の同成果読戻し/export独立照合/同job停止・再開が二重実行なく成立し、旧仕事/鍵/modelが保持される。WebとPixelで別依頼を行った場合は2つのjobを明示して両artifactを双方で照合する。別owner利用P03、外部Tool、任意model、voice、全native OS、実請求をこの合格に含めない。合格済みと未受入のfieldを分けて証拠へ更新する。

<a id="p03"></a>

## P03 別ownerへ共有し、同じ担当版を実用・改善する

**担当/RQ**：Sky/MCPのROCK、HOME01/SKY21/WEB04/OS10。RQ02/03/21/37/48の具体化。EXTERNALは既存host/model/Tool、OWNERは作者Aと利用者Bがそれぞれ行う共有/追加/実行/成果共有、JOINTは両本人の同一候補実UI。主目的は人数や成長率の宣言ではなく、A作成→明示共有→B追加→Eve実行→B保存→任意の改善版共有を一周させること。

**原因・現実装**：`lib/sky-agent-share.ts`、`lib/sky-agent-share-store.ts`、`app/api/sky/agent-shares/route.ts`、`components/sky-agent-share.tsx`、既存`sky-agent-library`、`lib/eve-purpose-runtime-work-port.ts`、`lib/sky-agent-outcomes.ts`、`lib/sky-agent-outcome-store.ts`、`app/api/sky/agent-outcomes/route.ts`、`components/sky-agent-outcomes.tsx`を再利用する。`docs/evidence/smis-agent-shares.json`は版/作者/digest/license/parent由来・disabled追加・ACLの固定Worker合成受入、`docs/evidence/smis-agent-outcomes.json`は同意付き利用回答loopまで。実browser・別の実owner・Pixel・公開は未受入。以前のBob引用Tool単独実行は共有担当に束縛した実行ではないため、その証拠を転用しない。

1. 現行共有manifestと原作者設定revision/hash・license・公開先/鍵付きcommunityを確認し、preview→作者の明示publish→版固定GET→受領者の追加preview→明示addを既存routeへつなぐ。公開版は現行CC BY 4.0、community-copyは既存ACLを維持し、有料licenseを勝手に追加しない。
2. B側は新しい本人別担当としてdisabledで追加し、元share ID/version/digest/author/licenseを保持。Aのdevice/session/Tool権限/予算予約/会話/私有成果はコピーしない。Bが自分のmodel/実行先/必要Tool/費用上限を確認し、既存workflow/Brokerの同じ権限・予約ルールで自身のjobを作る。両owner間で私有job IDや履歴を共有せず、共有担当の由来と各本人の仕事を結ぶ。
3. 共有担当を既存Eve plan/準備/dispatchへ実際に束縛する。開始時にshare版・原作者digest・Bの設定revision/model hashを保存し、使った指示が元版かBの変更版かを明示する。既存の汎用schema・Tool allowlistを維持し、role本文をsystem権限や任意shellへ昇格させない。元版変更は既存仕事の実行内容を差し替えない。
4. 入出力は共有manifest/利用者設定/承認済み依頼→版付き仕事/成果/usage/利用回答。状態は私用下書き→共有確認→公開/限定共有→B追加未有効→B確認/準備→実行→review/保存→任意の利用回答/改善版共有→撤回を分ける。既存storeとCAS/同IDを使い、公開物に個人会話・入力資料・成果本文・鍵を自動同梱しない。
5. 401/他owner/鍵失効/作者撤回/改ざん/原作者改版/409/応答喪失を試験する。publish/add/成果回答は同command IDと内容hashで照合し、別IDを再発行しない。撤回が既に保存されたBの許諾済みcopyへ与える効果を現行契約どおり表示し、遠隔消去や既実行の取消を保証しない。停止はBの同じjobへ送り、停止要求とhost receiptを分ける。再起動後も由来・B設定・成果・停止を読めるようにする。
6. 別の実ownerは本人が登録・同意して認証し、AのsessionをBへ流用しない。まず非金融・権利確認済み合成素材の担当1件で実UIを完走。Bの成果/入力を公開する場合は別のpreviewと同意を要し、利用回答を成功率・作者売上・送金の証拠へ変えない。

**確認コマンド（実在確認済み、今回は未実行）**：
```sh
node --experimental-strip-types --test tests/sky-agent-shares.test.mjs tests/sky-agent-outcomes.test.mjs tests/community-os.test.mjs tests/community-key-client.test.mjs tests/eve-library-runtime-work-port.test.mjs
npm run build
node --experimental-strip-types scripts/check-sky-agent-shares-api.mjs
npm run typecheck
npm run sky:check
npm run design:check
```
`check-sky-agent-shares-api.mjs`は独立local Worker/D1と合成owner/model応答の試験である。新しい共有担当束縛ケースを既存scriptへ追加し、実モデル/実owner合格とは分ける。

**受入**：同じbuildのA/B実UIで、共有preview・原作者版hash/利用条件確認・B追加・Bの独立承認・その共有担当を使う同一B jobの実結果・文章保存・再読戻し・停止・任意改善版のparent lineageを記録。他owner私有履歴の漏えい0、無断Tool/課金/投稿0、重複add/dispatch0。Bの実参加未確定でもROCKの二owner fixture/WorkerとUI準備を閉じ、実二者部分のみ残す。

<a id="p04"></a>

## P04 認可された実feedをSmithのtimelineへ届ける

**担当/RQ**：Web/PWA/SitesのROCK、HOME01/WEB04/SKY14/SKY15/SKY21。RQ02/22/25/40/48と本人のX/API/MCP追加指示。EXTERNALは投稿供給元と認可API/MCP、OWNERは本人読取り同意と接続先/料金/表示範囲、JOINTは実sourceの取得→表示→更新→停止/失効。本人のXログイン画面表示とSmith内への実投稿受信は独立gate。

**原因・現実装**：`components/sky-timeline-connector.tsx`、`lib/sky-timeline-provider.ts`、`components/sky-x-account.tsx`、`lib/sky-x-account.ts`、既存`app/api/sky/x-account/`、`components/sky-social-timeline.tsx`、`lib/sky-continuous-ranking.ts`、`components/use-sky-continuous-feed.ts`を再利用。正本`docs/sky-tools-complete-design.md`のtimeline receiver/本人X section。証拠`docs/evidence/x-account-native-feed.json`、`sky-continuous-timeline.json`。別画面の実投稿表示は`x-account-integration.json`の本人申告であり、receiver合格ではない。現parserは`sky.timeline.v1`、source=x、audience=owner、20件、TTL15分の限定。MCPは`sky_timeline_read`、手動確認、page memoryのみで実X未接続/定期sync未受入。GDELT旧73件/12→24表示も、実新着到来の代用にしない。

1. 利用できる接続済みAPI/MCPを読取りで棚卸しし、真正な供給元、実認可、取得feed、許可された表示/保存/再配信範囲、rate/料金/停止方法をcontractへ固定する。供給元への問い合わせ/契約/有料購入が必要な時は条件を具体化する。利用者ごとのdeveloper契約やX API購入を必須に戻さず、運営X adapterは任意/既定無効を保つ。
2. 既存MCP prepare→一回承認→executeまたは既存OAuth adapterから、実provider応答を既存envelopeへ変換する。未知の任意URLをserver proxyへ渡す共通APIは作らない。X以外へ拡張する場合はsource識別・ACL/項目/URL/size/時刻の版付きschemaを追加し、既存x envelope互換を保つ。非信頼post本文をAgent指示/permission grantへ使わない。
3. 入力は本人session・既存connection ID・feed種別・cursor・許可scope。出力は原post ID/作者/原文URL/発行時刻/取得時刻/公開範囲とfresh/stale/取得失敗。以下/おすすめの区別を維持。For Youの正当な供給経路がない場合は未対応と表示し、逆時系列や自作推薦をX本人おすすめと呼ばない。
4. 未接続→認可待ち→確認→取得中→取得/空/期限切れ/429/失効を分ける。まず現行memory/TTLの保存境界で実一回を受入し、定期更新はproviderが許可した間隔・budget・バックオフ・上限・停止/再開で別実装する。永続cacheが必要なら既存store/保持規則へ最小追加し、保護投稿を公開timelineへ漏らさない。private following/community/bookmarkへ外部推薦を混入しない。
5. owner/connection/feed変更、鍵失効、unmount、停止操作で遅い応答とtimerを世代失効させる。401は再認可、429は待機、期限切れはstaleと再取得、切断/再起動は同cursorを照合し重複ID排除。本文を合成して埋めず、停止後の再取得/自動有料fallback/認可再利用をしない。token/ログインcookieは秘密storeだけに置き、Git・URL・診断・LLMへ送らない。
6. 実供給元が未用意でもROCKはadapter interface、厳密parser、fixtureでのrate/失効/遅延/二owner拒否、UI、supplier接続doctor、契約不足の表示まで進める。実feed接続は供給元が許可した同じ実アカウントで一件→更新一件→停止→失効を記録し、fixtureと分ける。

**確認コマンド（実在確認済み）**：
```sh
node --experimental-strip-types --test tests/sky-timeline-provider.test.mjs tests/sky-x-account.test.mjs tests/sky-timeline-interactions.test.mjs tests/sky-social.test.mjs tests/home-timeline-frontend.test.mjs tests/sky-continuous-feed.test.mjs
npm run typecheck
npm run sky:check
npm run design:check
```
**受入**：実API/MCPの同一post ID/本文/原文リンク/時刻/ACLをSmith表示と照合し、新しい実投稿の更新到来・停止/失効・再接続・他owner拒否を同じ候補で受入。Xの別画面/iframe/接続先追加/固定seed表示だけで合格にしない。外部利用条件未確定時はsource/fixture部分を完了記録し、live feed gateを具体的に残す。

<a id="p05"></a>

## P05 Pixel GL066/frankelのfull OSを独立系列として進める

**対応と責任**：OS10/OS11/RLS02/DSP01/OS09、RQ12/RQ16/RQ17/RQ27/RQ29/RQ30/RQ31/RQ41/RQ42/RQ43/RQ44。ROCKはsource/build/release/復旧検証器、EXTERNALはAOSP/GrapheneOS/OEM BSP/driver/firmware、JOINTは同imageの実機受入、OWNERは対象・有料環境・鍵custody・最終flash等の具体的承認を担う。RQ12/QEMU Developer Previewは独立して保持する。

**現在地・差分原因**：試験署名APK、既存GrapheneOS上Linux、過去23/23非破壊再起動受入はある。全image build/正式署名/同image flash/SELinux最終domain/OTA rollback/data+Keystore全損復元の合格へ転用しない。全OS buildには専用x86_64 Linux、正確なfactory/OTA bytes・vendor inventory・署名/rollback/backupの入力とcustodyが必要。未了が技術入力なのか予算/契約/鍵/本人操作なのかを項目別に分け、旧2026-09 snapshotのgate数を現在値と断定しない。

**読むpath**：`docs/native-os-integration.md`、`docs/native-os-validation.md`、`docs/os-prototype.md`、`docs/phone-preview-20260911.md`、`docs/prompts/rockstaros-os-device-foundation-development.md`、`docs/android-first-flash-gate-20260916.md`、`data/android-first-flash-gate.json`、`docs/android-production-signing-custody.md`/対応policy、`docs/android-rollback-index-policy.md`/対応policy、`docs/android-google-stock-recovery.md`/対応policy、`docs/android-backup-recovery.md`/対応policy、`docs/android-production-architecture.md`/対応policy、`os/physical/`、`android/`、`systems/rock-star-os/`、`scripts/prepare-phone-build.py`、`scripts/freeze-phone-build-inputs.py`、`data/device-support-matrix.json`。IMPORT-MANIFESTとvendor/mr固定原本を変えない。

**順序・契約**：

1. 対象Pixel10 GL066/frankelの現在OS/build、bootloader/Verified Boot、partition/AVB/rollback index、SKU、unlock可否をread-onlyで固定。client開発とnative imageのbranch/stagingを分ける。同一imageを他機種へ適用しない。
2. 既存Android Core/SDK/APKのSQLite、Binder、権限、承認、保存/再起動、backupとmodel profileを同sourceで回帰し、imageへ入れるcomponent一覧/権限/Soong/SELinuxを照合する。APK/PWAだけの受入をimageの受入へ写さない。
3. upstream tag/manifest、kernel/vendor/firmware、Google factory/full OTA公式URL・掲載hash・実bytehash、vendor生成inventoryとlicense/source提供条件をfreezeする。取得条件への本人同意が必要なら、正確な配布物と容量・用途を先に示す。production秘密値をGitへ置かない。
4. 専用x86_64 Linuxの既存環境有無を確認し、RAM/storage/toolchain/隔離/復旧/費用上限を具体化する。未指定の有料契約を開始しない。既存予算に合う具体的候補と上限、入力freeze済み結果を揃え、最後に不足条件のみ本人へ確認する。Pixel AVF aarch64 guestを標準full OS build機としない。
5. source/toolchain/build/config/生成image hashを固定してbuildし、署名前の静的検査・emulator/仮想系の受入を記録。正式署名は鍵identity、custody、backup、rotation/revocation、rollback index、stock復旧、data/Keystore喪失復元の条件を整え、既存承認範囲を確認した最後に具体的な鍵操作へ進む。署名成功とflash許可を分ける。
6. flash前にexact image、正確な1台、partition/AVB適合、全データbackup/復元の実証、復旧資材、危険・所要時間・データ影響・電源とrollback条件を一枚へまとめる。購入/初期化/unlock/書込を設計依頼から推測しない。既存の条件付き了承が満たされたことを証拠で確認し、未許可の破壊操作だけ具体的に最終確認する。
7. 同imageでboot→権限/本人拒否→保存/再起動→実hardware→更新/rollback→stock/全損復旧を`docs/templates/os-acceptance-report.md`へ記録する。失敗は新imageで上書きして隠さず、復旧したexact artifactを追跡。image/cache/full logはGit外release artifactへ置く。

**状態・保存・失敗復旧**：inputs_pending→inputs_frozen→build_failed/build_passed→unsigned_verified→signed→flash_gate_pending/accepted→physical_trial→accepted/rollback_requiredを区別。保存はsource/input/config/artifact inventoryと要約証拠、秘密鍵は承認されたcustodyのみ。build失敗は同入力から再現し、rollback indexを下げて回避しない。flash失敗は確定したstock復旧へ移り、owner data消去を黙って行わない。QEMU imageとPixel imageの成功/署名/復旧を別に保つ。

**実在するhost検査**：

```sh
npm run os:check
npm run android:architecture:check
npm run device-support:check
npm run android:first-flash:check
npm run android:first-flash:require-pass
npm run release:signing:check
node --experimental-strip-types --test tests/android-first-flash-gate.test.mjs tests/android-release-architecture.test.mjs
python3 -m unittest discover -s tests -p 'test_prepare_phone_build.py'
python3 -m unittest discover -s tests -p 'test_freeze_phone_build_inputs.py'
```

`--require-pass`失敗をskipや通常checkの成功で置き換えない。Androidの既存局所コマンドは以下で、SDK/JDKと対象候補を固定して実行する。

```sh
gradle -p android :core:test
gradle -p android :automation:assembleDebug :article-tool:assembleDebug
gradle -p android :automation:lintDebug :article-tool:lintDebug
gradle -p android :tool-sdk:testDebugUnitTest
```

実instrumentationは`docs/os-prototype.md`記載のGradle module/variantと`rockAcceptanceTarget=physical/emulator`を対象に合わせて使い、事前に対象1台/使い捨てemulator・署名・インストール影響を確認する。emulatorのsoftware Keystoreを実StrongBox合格にしない。native Linux/QEMUは対象branchの`docs/native-os-validation.md`と後続検証の同じscriptを使い、macOSのskipをLinux成功へ換算しない。

**合格と残件**：exact build/image/署名/device/復旧資材が一致し、同imageで受入reportの対象gateを実証した範囲のみPhysical Device Preview対応へ上げる。P05全体を通せなければsource準備・host・emulator・unsigned image等の到達点を明示し、次の不足入力と承認対象を残す。P05未了でもP01/P02とP06の共通Core/clientは進める。

<a id="p06"></a>

## P06 eSIMから利用開始し、同じ環境へ端末を接続する

**担当/RQ**：Web/PWA/SitesのROCKを主担当、SIM01/WEB06/SKY21/OS10/DSP01、料金接続はBIL02へ共同。RQ01/02/40/42/48と2026-10-20のservice attachment明示指示。EXTERNALは許可済みservice issuer/profile/applet、host API、compute/決済。OWNERは対象地域/契約版/端末/上限/送信/実profile操作、JOINTは同じprofile・契約・jobの縦断。

**原因・現実装**：正本`docs/sim-led-product-architecture.md#esim-service-attachment`、`contracts/rockstar-service-attachment.json`。`lib/rockstar-service-attachment.ts`は18署名項目のcanonical encoding/Ed25519純粋verifierで、trusted issuer lifecycle・証明発行更新・durable API/storeの結合が未完了。`lib/rockstar-service-setup.ts`、`-store.ts`、`-billing.ts`、`app/api/rockstar/service-setup/`、`components/rockstar-service-setup.tsx`、Android `ServiceSetupActivity`、`toolkits/sky-linux-service/{worker.mjs,setup-probe.py}`はPixel signup slice。`rockstar-entitlement-{issuer,claim,event}`、`esim-cloud-{grant,proof}`、`lib/sky-linux-service.ts`と既存store/Billingを再利用。証拠`docs/evidence/pixel-service-setup.json`と既存SIM01。純粋試験・local sliceと実issuer/iOS/子接続/本番を分ける。

1. **開始条件を正す**：標準eSIM/client経路は共通Core/runtimeの本人・利用権・権限/予算・保存/復旧・Eve/Smith入口を同一候補で受入後に組み込む。P05のfull OS build/flash完了を待たない。既定無効flagと`rockstar.os-service-acceptance/1`の未受入は保持し、実runtime証拠がある対象だけを有効化する。sample acceptedへの書換えで通さない。
2. 既存issuer claim/deliveryと新service-profile証拠kindの差を確認し、真正なissuer・subject/契約・現在状態・sequence/時刻・署名/取得経路を検査するlifecycle adapterをつなぐ。通知欠落/重複/逆順はissuer現在状態へ照合し、古いactiveで失効を戻さない。telecom active・スクリーンショット・URL到達・OS callbackをservice利用権へ昇格させない。iOSへ偽Android device-install receiptを作らない。
3. 本人認証→料金/保存/停止条件preview→契約と継続請求への別同意→支払い方法setup（初回引落0）→真正利用権→同owner+contractの一workspace準備→署名済みLinux ready読戻し→端末鍵付き接続証明→Eve/Smithへ接続。既存準備operationを外部資源確保前に保存し、同IDで復旧。ready前は`serviceStartAt=null`、基本料起算/新規有料dispatchを止める。月16USD/accountと未確定の枠/単価/税を区別し、fixture値で実販売しない。P07の既存見積/予約/usage/Invoiceへ結び、二重台帳を作らない。
4. 子接続は本人が相手端末の公開鍵・scope・能力profile/manifest・audienceを確認して発行。親entitlement ID/epoch、owner/contract/workspace、端末鍵、期限/nonceを同じ署名対象へ束縛する。現在契約/issuer状態/親epoch/端末失効を発行・更新・各dispatchで再検査、最長15分のleaseを上回らせない。端末鍵による要求証明も照合し、QR/公開起動URLだけでは認可しない。非eSIM Mini/Proも同契約へ追加し、別基本料・全権root・SIM秘密copyを作らない。
5. 入出力はissuer event/owner consent/契約版/device request proof/ready証拠→限定attachment/同workspace入口。SIM、契約、attachment、client開閉、runtime、job、budget/invoiceを独立保存/表示する。準備/ready/制限/復旧待ち、支払方法登録/請求/収納を潰さない。親失効/未払いは新規管理dispatchとlease更新を制限し、既仕事の停止・usage精算・成果持出しは契約に従う。通信断端末の瞬間失効を保証せず、期限と再接続で照合する。支払/利用権復旧後は元workspace/jobへ戻り、自動再実行しない。
6. eSIM内はissuer許可の小さなbootstrap applet候補であり、Linux/model weightsを格納しない。`SET_UP_MENU`/`LAUNCH_BROWSER`の規格存在をiPhone対応へ読み替えない。自動前面起動、確認1回、手動Web/App Clip/clientを実tap数/permission数とともに別区分で受入。完全無操作が未達ならhost/carrier連携等の未条件を残し、手動URLだけで最終目標達成としない。

**確認コマンド（実在確認済み）**：
```sh
node --experimental-strip-types --test tests/rockstar-service-attachment.test.mjs tests/rockstar-service-setup.test.mjs tests/rockstar-entitlement-issuer.test.mjs tests/rockstar-entitlement-issuer-store.test.mjs tests/rockstar-entitlement-delivery-http.test.mjs tests/rockstar-entitlement-claim.test.mjs tests/esim-cloud-access.test.mjs tests/esim-cloud-proof.test.mjs
npm run esim:test
npm run device-support:check
npm run android:architecture:check
npm run typecheck
npm run design:check
```
新adapter/store/routeの二owner・失効/逆順・期限・同workspace一意・同時端末共通予算・二重基本料拒否は既存test suiteへ追加する。実profile/iOSと関係しない`esim:test`合格を実開通へ転用しない。

**受入**：既存OSを保持した対象iPhone/Pixelで真正profile証拠→契約/ready→実client open→一件実仕事→同artifact/usage→子端末追加→親/子失効→保持/復帰まで同じcontract/workspace/revisionを追跡。実issuerとiOS未用意でもROCKのdurable lifecycle/発行更新/親子認可/doctor/異常系を完了し、実profile/実端末だけを未受入として残す。SIM swap、盗用URL、二owner、通知欠落、圏外、資源枯渇、支払失敗を別証拠で閉じる。新規有料契約・production署名鍵・eSIM実導入は対象/条件が揃った段階で行い、設計依頼だけから実行済みとしない。

<a id="p07"></a>

## P07 料金管理・月次請求を共通契約へ接続する（BIL02、SIM01、SKY21 / Wallet・Billing主担当）

**到達点。** 同一契約accountのWeb・Pixel・Mini・Proを、月16 USDの基本料一行と合意済み枠・超過単価へ束ね、準備前0起算、原子予約、実usage、契約timezoneでの月次明細、一意Invoice、Provider照合、入金、未払い制限と同じ保存データへの復帰を通す。文書・ROCK fixture・Provider sandbox・本人実UI・実収納・本番を別々に受け入れる。P01/P02が未受入でもROCKの契約/計量/明細fixtureを進め、実PixelとProviderだけを依存gateとして残す。

### 既存コードと候補を先に結び、請求基盤を作り直さない

- 正本は `docs/sky-billing.md#rockstar-monthly-billing-contract`、`docs/workstreams/03-wallet-billing-providers.md`、`docs/prompts/rockstar-monthly-billing-development.md`、`data/product-baseline.json`。古いプロンプト内のGit SHA/CIは履歴なので、全体プロンプト前段で新しく固定したcheckout/Sourceへ読み替える。
- Rootには `lib/sky-linux-service.ts` / `sky-linux-service-store.ts` / `sky-linux-billing.ts` / `sky-linux-payment-handler.ts`、`lib/rockstar-service-setup*.ts`、`app/api/rockstar/service-setup/`、`app/api/sky/linux/payments/route.ts`、`drizzle/0064_sky_linux_service.sql`、`0065_rockstar_service_setup.sql` がある。`LinuxWorkspace.serviceStartAt` は `null` が準備待ち、`undefined` が旧契約互換。`LinuxTerms.baseMinor=1600`、jobの予約/receipt、既存Invoice.allocations、collect/reconcileを再利用する。現行Linux月締めはUTC・serviceWindowsによる日割りの限定実装で、全meter・任意契約timezoneの共通本番請求ではない。
- Rootの `lib/sky-agent-monthly-statement.ts`、`lib/sky-payments.ts`、`lib/sky-usage-payment.ts`、`db/schema.ts`、`drizzle/0081_sky_agent_invoice_preparation.sql` / `0082_sky_agent_monthly_statements.sql` はAgent月次準備明細。`sky_linux_service_documents`の既存kind追加であり、新しい資金台帳ではない。UTCの `issued_at` 集計、`mode:test`、`draft_unreconciled`、`baseMinor:0`、`invoice:not_created`、`collection:disabled`、`customerPayment:unconfirmed` を勝手に本請求へ昇格しない。`/api/sky/payments/{statement,prepare-agent-invoice,monthly-save,monthly-read,monthly-list}` と本人画面を使う。既存200件上限超過の保留・旧Linux6列保持・member不変/失効/CAS triggerを維持する。
- 共有Source候補 `/Users/kaiya/Documents/ChatGPT/avokdo/work/eve-v115-agent-integration` にはRootにない `lib/sky-cloud-monthly-{store,http,stripe,payment-observation}.ts`、`lib/sky-agent-monthly-settlement.ts`、`components/sky-author-monthly-details.tsx`、`drizzle-main/0034_monthly_payment_observation.sql` と対応する `drizzle/0034_...` が存在する。既存 `/api/sky/cloud-monthly-test/{account,import}` はloopback＋stripe-test限定。月次表の一意性は現行 `owner_id,period,currency,stripe_account_id`、source item重複拒否、Provider同一IDでの再開、CAS観測、単調なreversal holdを再利用する。periodはUTCで、共通16USD契約へ自動接続済みではない。証拠 `docs/evidence/eve-monthly-payment-observation.json` のSource commit `19fe45284027640cad206480c8338d1ff6496919`、作者月次報告の `8cb449ebaa2c190399f3076cd7a8e164d85453a0` は候補同定用。前段のbranch/Source差分確認後に必要変更だけ統合し、Rootへ再実装・盲コピーしない。候補は未公開・実Provider未受入で、現配信v118へ全搭載と呼ばない。
- `lib/remote-ai-text-{store,pricing,execution}.ts`、署名rate card/usage、A2A親budget pool/Wallet予約、`lib/workflow.ts`を共通job契約へ結ぶ。`docs/evidence/eve-shared-budget-d1.json` は合成owner/復元schemaの実local D1試験。実残高・Provider invoice照合ではない。

### 実装順・状態・保存・障害復旧

1. **料金版・同意・起算。** account/contract/offer/priceVersion、通貨、billing timezone、枠のmeterと単位/量、超過単価/丸め、締日/支払日、日割り/繰越、与信・月/job cap、税・実費負担、猶予/再試行、保持/export/解約条件、本文hashを不変snapshotへ固定する。本人の料金/上限/支払方法の同意をexact digestへ束縛する。支払手段登録は0引落で、登録済みを入金としない。真正issuer利用権、同じowner/workspace、署名済み管理Linux準備、支払方法照合が全成立した一回の `serviceStartAt` をCAS保存。P06の準備証拠に結ぶ。既存OS/client利用でも共通Core/runtimeの同一候補受入を条件にし、全OS flash完成をサービス起算の代替条件へしない。旧契約のundefinedを無同意で新起算へ移行せず、旧版は保持して確認移行する。子端末追加/再pairing/再起動では基本料を増やさない。
2. **同時予約・実測。** 本人承認済みのowner/contract/version/period/job/run/model/Agent版/実行先/currency/request digest/expiryへ予約を束縛する。既存使用済み＋未確定hold＋今回最大額を、月/job cap・与信枠・必要なWallet資金holdと同じDB原子判定で検査し、予約成功後だけdispatchする。二つの物理台帳は共通IDで照合し、Cloud D1予約をWallet資金へ複写しない。Cloud input/output/cache token、Linux CPU等、Tool、作者料、通信/商品/税/外部実費をmeter別に持つ。中間usage非対応時は予約/概算/未報告を表示し、実費へ確定しない。送信前取消だけ一回解放、送信後timeout/receipt欠落/停止結果不明はhold保持・同じID照合。勝手な新ID再送・cap増額・0円精算をしない。
3. **真正receipt・枠控除。** 信頼issuer/Provider、owner/契約/job/run、Agent/Package/manifest、料金版、meter/数量、観測期間、通貨、Provider referenceとdigestを検証して追記。issuer＋receiptId＋run等の既存一意キーを保ち、同digest再送はno-op、同ID異digestは隔離。Provider自己申告/LLM回答/成功画面は入金根拠ではない。遅延receipt・結果不明・異議行を別に保持する。合意されたtimezoneで `[periodStart,periodEnd)` を計算し、DST/閏日/月跨ぎを含む固定fixtureで確認。meter別確定量から対象枠を一回だけ控除し、`max(0,量−枠)` と合意丸めで超過計算。未確定日割り/税/単価/未知meterは自動確定せず理由付き保留。UTC既存記録を無断再配賦しない。
4. **月次Invoiceの一意性。** 同一account/contract/period/currency/収納環境への月次一意性を既存表/索引の互換移行で強制する。基本料は端末/Sourceの数に関係なく一回。異通貨や別商品は別contractとして照合し、通貨換算を推測しない。契約版、基本料起算、確定数量、枠控除、単価/丸め、receipt/job/source参照、税/手数料、明細revisionを保存し、再締め/再起動/並行実行で同じInvoiceを返す。確定後の訂正は元Invoice/lineへの補正で追跡し、金額を直接上書きしない。migration 0082のdraftをそのままlive化せず、既存資料とsource itemを参照する互換設計を先に示す。
5. **収納・制限・復帰。** `draft/open/payment_pending/paid/past_due/void/refunded/disputed/reconciliation_required` を契約権限と独立保存する。既存Stripe transport/冪等キー/raw-body署名Webhook/永続eventを再利用し、Provider GETのCustomer/Invoice/PaymentIntent/Charge、account/mode、通貨、金額・明細・税、同一contract/sourceを照合する。provider object graphと保存済みIDを主に使い、metadata単独で本人や入金を確定しない。Webhook重複/逆順/欠落、応答消失、submission途中再起動は同一Provider Invoiceへ再開し、新請求を増やさない。支払手段登録/請求発行/引落要求/Provider成功/資金利用可能/実着金を分ける。返金/異議は元行に結び作者分配を凍結。`unknown`は過去のreversal証拠を消さない。契約猶予後の確実な未払いだけ新規有料実行を制限し、本人の成果/履歴/明細/問い合わせ/支払更新/exportを残す。入金とeSIM利用権を再確認して同じworkspaceへ復帰し、停止jobを自動再送しない。
6. **本人UI。** Eveの実行前に料金版、meter別概算・枠・予約・最大額・実行先を表示。`/sky/payments`は次の必要操作を状態に応じて案内し、直近100件/500件等の上限を全期間債務なしへ換算しない。本人はcontract→quote/承認→usage→枠控除→Invoice→支払/返金/異議を辿れる。承認上限変更、支払方法変更、再引落し、契約変更は本人明示承認。AIの節約提案を承認・金融権限へ昇格しない。

### P07の確認済みコマンド入口（実装時に対象checkoutで実行。文書改訂時の結果は証拠JSON参照）

Rootの既存試験:

```sh
node --experimental-strip-types --test tests/sky-linux-service.test.mjs tests/sky-linux-billing.test.mjs tests/rockstar-service-setup.test.mjs tests/sky-usage-payment.test.mjs tests/sky-payment-worker.test.mjs tests/shared-stripe.test.mjs
node --experimental-strip-types --test tests/sky-agent-monthly-migration.test.mjs tests/sky-agent-payment-migration.test.mjs tests/sky-author-usage-agreement.test.mjs tests/migration-union.test.mjs
```

上記Source候補を固定/保全し、そのpackageとソースで実行する既存試験:

```sh
node --experimental-strip-types --test tests/sky-cloud-monthly.test.mjs tests/sky-cloud-monthly-payment-evidence.test.mjs tests/sky-cloud-monthly-payment-observation.test.mjs tests/sky-agent-monthly-selection.test.mjs tests/sky-author-monthly-details-ui.test.mjs
```

Rootの既存scriptを使う合成D1/compiled Worker検証（`--project`は上記Source候補または正式に統合済み固定checkout。先に当該projectのbuild・source inventory・schemaを確認）:

```sh
node --experimental-strip-types scripts/check-eve-shared-budget-d1.mjs --project work/eve-v115-agent-integration
node --experimental-strip-types scripts/check-eve-author-monthly-worker.mjs --project work/eve-v115-agent-integration --payment-evidence
npm run billing:check
npm run schema:check
npm run typecheck
npm run lint:product
```

実在する既存コマンドであるが、checkout差異を無視した成功保証ではない。後者scriptはmock Provider GET/合成署名/実local D1、外部呼出0で、実sandbox収納ではない。失敗/未実行を合格へ換算しない。変更後にbaseline/design/project check、最後に `npm run verify` を同一artifactで通す。大きいログはGit外に置く。

**P07合格証拠。** 合成料金版で準備前起算0/登録時引落0、同account多端末基本料1、同時2jobの枠・cap二重使用0、未知usage hold維持、月境界/DST/遅延・重複receipt/丸め/再締め不変、旧データ移行/CAS競合、Provider重複/逆順/欠落/応答消失、partial/full refund/void/dispute、未払制限と本人export保持、入金後同workspace復帰と無断再送0を保存する。Provider sandbox一周は同じ契約/Invoice/同意/金額/receipt参照を証拠化し、匿名fixture、本人実UI、実収納を別欄にする。

**外部/未決条件。** EXTERNALはissuer/Cloud・Linux meter/決済/税の真正証拠。OWNERは枠量・超過単価・対象国/B2B/B2C・売主/請求主体・税登録/商品区分・費用負担・支払/猶予/再試行・日割り/繰越・保持/解約の不変版を決める。これが未定でも合成fixtureとコードは進め、販売用offer/本番課金/有料dispatchは閉じる。税は既存税設定・適用地域の有効登録・商品区分・住所を確認してsandboxで照合し、`automatic_tax`だけで徴収合格としない。

<a id="p08"></a>

## P08 作者契約から入金済み原資の分配・返金復旧へ（SKY21、BIL02、WLT06、B03）

**到達点。** 既存Agent/Toolの本物の利用元を作者・運営の二者署名契約へ固定し、本人の請求同意・一意Invoice・確定回収原資・現在有効な受取先を照合して、分配候補→保留/精算可能→送金指図→Provider受付→送金済み/結果不明→回復を追記で管理する。今回は全体開発の指示であり、新しい実送金許可ではない。ROCK fixture/Provider sandboxを先に完走し、実資金は対象作者・金額・宛先・費用・期限へ束縛した本人個別承認と金融gateがそろうまで閉じる。

### 既存契約と分配候補を再利用する

- `lib/sky-author-usage-agreement.ts`、`sky-author-agreement-documents.ts`、`sky-author-remuneration-terms.ts`、`sky-author-remuneration.ts`、`sky-agent-usage-statement.ts`、Eve `bind-author-agreement` / `register-author-agreement` / `prepare-author-allocation` / `record-agent-collection-consent`、`db/schema.ts`、`drizzle/0080...`〜`0082...`を読む。`SKY_AUTHOR_AGREEMENT_TRUSTED_KEYS` のrole/principal/key/Package pin/status、異なる二つのEd25519鍵、契約本文hash、Package/manifest、作者/platform/Provider、価格版/通貨/期限を固定する。鍵未設定/失効/期限切れ/契約前receipt/別ownerを拒否し、synthetic署名を実作者の法的契約成立と呼ばない。
- 既存 `sky.author-remuneration-terms/2` の `platform_invoice/external_provider`、`author_fee/receipt_total/none`、`platform/byok`、`itemized_source/1`を維持。BYOKは本人が既払いのProvider原価を再請求しない。external_providerはRockstar請求候補nullを維持し、無料/入金済みとしない。authorMinorへモデル原価をコピーしない。既存10%は対象Marketplace契約の適用範囲で扱い、Agent一般の新手数料を勝手に確定しない。
- 上記Source候補の `agentMonthlySettlementReport` はpaid Invoiceでも `awaiting_provider_reconciliation`、`authorPayment:unconfirmed`、`transferAllowed:false`。現行 `monthlyPaymentObservation` のpending/observed/unknown、CAS、単調reversal holdを保持。古いpaid flagや一回の `no_reversal_observed` だけで送金可能へしない。これらはread-only候補で、durable per-source payout/refund/recovery transactionは次工程。
- Linuxの既存Invoice.allocations、`linuxPaymentHandler.reconcile(owner,id,payouts)`、`linuxStripeBilling.transfer/reverse`、`skyCommerceStore.seller`、Walletの既存予約・receipt・台帳・照合を読む。public `app/api/sky/linux/payments/route.ts` はreconcileのpayouts=falseであり、この公開入口を無同意の作者送金ボタンへ変えない。既存金融機能を共通契約へ安全に接続し、並行資金台帳や架空LLM記録を作らない。

### 分配の原子保存・障害復旧・本人承認

1. 同一owner/parent/delegation/Package/manifest/作者/receiptSHA/quoteDigest/契約SHA/priceVersion/currencyをserverで再計算し、固定sourceへ一度だけ結合。契約本文は不変版registryで表示・保存し、変更は新版本文＋二者再署名。現行bindingや作者契約が失効したら元契約/成果は保持し、新結合・精算可能化を保留。本人のcollection consentは表示digestとexact額/通貨/候補ID/親revisionへ束縛する。
2. P07の同一Invoice・source lineを既存payment/receiptへ参照し、回収原資、返金/争い/費用、作者gross・契約手数料・作者payable・他利用額を分離する。未入金、pending refundが0確定額でも、dispute、unknown、受取先照合待ち、契約失効/改変、原始sourceの競合は凍結。結果不明の再観測でreversal holdを消さない。部分返金/税/外部費用の割当は版付き契約に従い、条件未定は合成版のみ。
3. durableな分配intent/attempt/receipt/補正を既存台帳のsource参照へ追加する設計・migrationを先に示す。一意キーはmode/Provider account/Invoice/source/作者/通貨/契約版/操作種別へ束縛し、並行払出し・再起動・通知再送でも二重分配しない。送金要求前にDBでintentと承認digestを原子確定し、外部要求後の応答消失はunknown保持。同じProvider transferをGET照合して復帰し、idempotencyの期限/結果が不明なら新キー送金をしない。取消は未送信を確認できた場合だけ。既存Wallet holdを使用し、売上候補/使用量から架空残高を増やさない。
4. 受取先は署名/nonce/期限/失効と現在のProvider account/KYC・payout能力・国/通貨を照合。recipient変更は新承認と監査、送金中に変更して既存attemptの宛先を書き換えない。作者署名をruntime安全保証へ昇格しない。Provider transfer受付、connected balance、bank payout受付、実着金は別state/receipt。Sandbox金額やhistorical paidを現金払出しへ換算しない。
5. 返金/chargeback/誤配/遅延通知は元Invoice/source/transferへ補正し、未送金額を凍結、送金済み分はrecovery_requiredへ移す。Provider reversalとその結果・費用を照合し、無断の本人口座引落し/負残高補填/別作者原資の流用をしない。異議解決と受取先/契約/原資の再確認後だけ新たな明示承認で再開。旧snapshot復元でもtombstone/reversal/失効を先に再照合し、古いpaid状態で送金再開しない。
6. 作者・利用者・Rock・Providerの明細を本人別に表示し、候補/保留理由/回収/返金/送金/着金を混ぜない。旧失効sourceの受取先・payable候補は現行精算画面で隠し、元履歴/問い合わせIDは保持する。read-only画面を開く行為は送金承認ではない。

**P08の既存検証入口。** P07のSource試験/compiled Worker scriptに加え、Rootの `tests/sky-author-usage-agreement.test.mjs`、Source候補の `tests/sky-author-usage-agreement-source.test.mjs`、`eve-author-agreement-source-route.test.mjs`、`eve-author-agreement-source-migration.test.mjs`、`sky-agent-monthly-selection.test.mjs`、`sky-author-monthly-details-ui.test.mjs` が実在する。現在のcheckoutにある名前と対応schemaを確認して実行する。Root `node --experimental-strip-types --test tests/settlement.test.mjs tests/billing.test.mjs tests/billing-worker.test.mjs`、`npm run billing:check` も既存入口。新設するper-source分配/返金復旧の試験は、並行要求、応答消失、失効競合、部分返金、争い、reversal後unknown、snapshot rollback、受取先変更、同ID再開、二重支払0を実DB/HTTPで追加する。任意fixtureのexpectだけで状態を検証せず、DB件数/金額保存・Provider呼出数・送金無効flagを検査する。

**P08合格証拠と外部条件。** ROCKは二者署名/本文/請求同意/source照合・原子保存・fixture・停止/復旧・本人UI。EXTERNALは実作者/受取Provider/KYC税/取引/返金dispute/実着金。JOINTは同じ契約・Invoice・source・recipientを使うsandbox一周、部分返金/争い/再起動/応答消失と凍結/再開。OWNERと作者は販売主体、作者条件/原資/費用/税/返金負担、署名手順、実受取先と実資金の個別承認。source/host成功を公開/実入金/実払出しへ加算せず、未決条件を理由にROCK fixtureまで停止しない。

### 料金とProviderの境界（P07/P08共通）

RockstarOS共通は16 USD/account/月＋対象枠超過。既存Sky単独140 USD/含有100 USD Sandbox（Sourceの `lib/sky-recurring-plan.ts` ほか）、買切りMarket、通信/eSIM、BYOK、Tool実費、旧888 cents案、ATMのRock手数料0、ゲーム未確定料金は別contract/lineで維持する。RQ15をゲーム0円や無制限補填へ拡張しない。RQ13実交換・RQ14作者SDK・RQ12OS受入を請求fixtureの合格へ置換しない。

Stripe関連の変更時は `/Users/kaiya/.codex-work/plugins/cache/openai-curated-remote/stripe/8.0.0/skills/stripe-best-practices/SKILL.md` と関連billing/security/tax/connect参照を読む。既存Provider・計量正本を維持し、新Provider選定、新規契約、Metronome移行、Stripe account構成/API版の総入替は今回の必須作業にしない。必要なSDK/API更新が判明したら差分と互換試験を示す。既存integrationのsandbox依存を調べ、開発/CI/live credentialを分離して最小権限・secret storeに保持し、値を出力/Git登録しない。Webhookは必須で、成功URLだけを入金/権限有効化に使わない。税登録が未確定ならlive請求を閉じ、税の仮定を価格版へ紛れ込ませない。

<a id="p09"></a>

## P09 生体・健康vaultを機微データ非使用で設計・実装・審査する

**対応と責任**：主担当Security、既存SYS01/SYS13/OS05/OS10、CORE05/CORE06。RQ27/RQ42/RQ45/RQ46/RQ48と後続の生体/健康情報要求の具体化であり、新規RQやraw収集許可を作らない。ROCKは鍵/同意/認可/削除・失効/負例、EXTERNALはAndroid/authenticator/独立Security/legal、JOINTは同候補hardwareでの鍵挙動と侵入/復旧、OWNERは用途別同意・本人認証・機微機能有効化を担う。

**現在地**：`data/project-status.json.biometricSensitiveDataReadiness`ではWeb履歴はserver管理AES-GCM/HKDF/AADでhistoryE2ee=false、native sessionはKeystore/no-backup/unlocked-device-requiredだがfresh per-use biometric-bound key=false。生体/健康vault本番受入、独立penetration test、community browser vault、full OSはいずれも未受入。暗号化済み一般履歴をE2EE/生体vault完成と呼ばない。

**読むpath**：`docs/workstreams/04-security-identity-compliance.md#owner-identity-permission-safety-20261020`、`docs/prompts/rockstaros-common-core-development.md`第10/11節、`lib/eve-history.ts`、`lib/request-auth.ts`、`lib/rockstar-account.ts`、`lib/rockstar-device-link.ts`、`android/automation/src/main/java/dev/rock/automation/AndroidRockstarDeviceSessionStore.java`、`android/core/src/main/java/dev/rock/core/platform/EncryptedBackup.java`、`toolkits/sky-linux-local/common-ui-src/EvePortableJournalKeys.java`、`EvePortableAccountBinding.java`、`docs/android-backup-recovery.md`、既存session/鍵/削除/失効test。保存済み本人原稿や生体原本を試験に流用しない。

**順序・入出力契約**：

1. 指紋/顔の認証template（OS/authenticator内）と心拍等の健康測定値（用途別機微データ）を分離。対象データ・sensor根拠・処理目的・閲覧者・保持期間・export/削除・越境・保護者/第三者同意・脅威モデルを決め、未実装は既定無効にする。user-presence認証結果だけを受け、raw認証templateをWeb/Eve/modelへ送らない。
2. 背景同期/一般job鍵と、本人のfresh authenticationを必要とするvault鍵を分離する。鍵生成/利用/expiry/invalidationをhardwareに結び、per-use biometric/authenticator、PIN fallbackの保証差、StrongBox有無、OS profile/lock/追加生体登録後の失効を具体化する。既存session鍵の設定を全面変更して背景jobを壊さない。
3. owner/device/object/key-version、目的/同意版、recipient/scope、nonce/期限、AAD、revisionを各操作へ固定。unlock待ち→用途確認→限定解錠→閲覧/書出し/削除→再lock、失効/結果不明/復旧保留を区別。model提案や音声認識をvault承認へ昇格しない。
4. E2EEを採る範囲では、どのendpointが平文を持ち、server/operator/復旧者が復号可能かを明示し、鍵共有・新端末grant・紛失/Keystore全損・rotation/revocationと復旧の安全/可用性を設計する。server側だけの暗号化をE2EEと表示しない。復旧バックドアを曖昧にしない。
5. rawを含まない合成ciphertext/偽sensor/synthetic ownerで鍵・認可・同意・削除tombstone・offline復元を試験。別owner、古い鍵、失効device、replay、AAD/nonce改ざん、backup rollback、削除後遅延sync、削除後旧snapshot復元、複数device並行、log/telemetry/export漏えいを負例にする。cache/key/backup内削除と外部recipientへ送信済みの限界を別記録する。
6. threat model/既存暗号実装/負例/独立審査のreview packageを揃える。実機の認証器操作と合成データ鍵使用を同artifactで受け入れる。未指定の健康データ収集や実本人データ移行は、対象・保持・復旧・同意の準備と独立審査が整ってから別の具体的最終判断にする。

**実在する境界回帰**：

```sh
node --experimental-strip-types --test tests/eve-history.test.mjs tests/rockstar-account.test.mjs tests/android-key-attestation-client.test.mjs tests/system-backup.test.mjs tests/community-key-client.test.mjs
npm run release:signing:check
npm run android:architecture:check
```

これらの既存testをvault受入専用試験と呼ばない。実装時に上記脅威から意味のあるsynthetic testを追加し、作成済みpathだけを新しい集中コマンドへ加える。Android単体build/unit/lintと実hardwareのfresh auth/invalidation/restoreを分ける。独立審査待ちでも非生体ROCK/Core/UX/P01/P02を止めない。

**合格・残件**：raw template/健康値の無断取得0、server/ログ/modelへの漏えい0、用途と本人のfresh許可が毎回強制され、owner/失効/削除/復旧負例が同artifactで説明可能。E2EEは採用した限定範囲だけ名乗り、独立審査・hardware・実データ運用・地域法務未受入を明示してdisabledを維持する。

<a id="p10"></a>

## P10 共通RockstarOSをMini/Proへ反映する

**担当/RQ**：Material Invention/avocadoMiniのROCKを主担当、MAT15/MAT18/DSP01/OS10/WEB04/SKY21、Pro商品は既存B05/WEB13と共同。RQ12/40/41/42/43/44/48/49の関連範囲を既存taskへ結ぶ。EXTERNALはBSP/driver/機器/ASR/model/光学/RF/電池仕様、OWNERは対象構成/場所/権限/予算、JOINTは各実機同一buildの受入。ProはAI専用PC、Miniは一台自律・別演算Hub不要という製品条件を保持する。

**原因・現実装**：`packages/rockstaros-runtime/`、`contracts/rockstaros-portable-runtime.json`、`docs/device-support-architecture.md#portable-runtime-package`、`systems/rock-star-os/targets/avocado-mini/`、`lib/rockstar-eve-interaction.ts`、`components/eve-interaction-panel.tsx`、`lib/mini-voice-session.ts`、`lib/mini-local-speech.ts`を再利用。MiniはCM5/CM5IO＋Pico 2卓上参照source/firmware/TTY driver/overlay/接点LEDキャリアと空間sourceがあり、最終mainboardや製品実機合格ではない。`docs/evidence/avocado-mini-native-development.json`、`rockstaros-portable-runtime.json`、Mini空間設計/各evidenceを確認する。`avocado-mini-os-interface.json`はv44保存・公開未完了、`avocado-pro-os-interface.json`はv46 browser preview配信/ブラウザ内下書き・board保存まででaccount同期・AI実行・支払いなし。preview画面を共通runtime/実機native反映と呼ばない。

1. 現存Mini/Pro UI (`sites/avocado-mini/src/mini-os.*`、`pro-os.*`、`src/pages/os/index.astro` と実domain router)から既存owner認証と共通Eve/workflowへ接続する。private localStorageの下書き/boardは自動公開・別owner移行せず、本人に内容/保存先/競合を示して既存serverへ引継ぐ。P06子attachmentと同じ契約/認証を利用し、画面用の別job engine/基本料を作らない。
2. host保護session・capability観測・実入出力・停止port・storage・署名更新/復旧をdevice adapterへ隔離する。共通packageはEve履歴/jobs/quote/reservation/usageの既存APIを呼ぶclientで、weights/推論engine/任意driverを同梱した意味ではない。モデルを使う場合はhash/license/容量/実RAM・熱・速度・品質を受入し、未導入は未準備表示。Pixel AVF binaryやAPIだけをMini/Pro対応と偽装しない。
3. **Mini**：既存USB supervisor contract・nonce/sequence/epoch/heartbeat/200ms観測期限・物理stop/watchdogを共通capabilityへ接続し、観測を本人/安全許可へ昇格させない。Hey Eve→依頼確認→担当作成/再利用→同job実行/成果→Thanks Eve→指定job停止receipt→待機を共通Coreへ結合する。完全電源断/MIC OFFは音声待機と別、ASR未準備は文字/物理操作へ戻す。音声認識だけで外部操作/課金を承認せず、cloud ASRへ無断切替しない。
4. **Pro**：確定した実BOM/OS/CPU/GPU/NPU/RAM/driverとmodel版をprofileへ固定し、PC入出力/保存と受入済みlocal/cloud計算を同じjobへ接続する。Mini入力→許可されたPro実行→Mini/Pro同artifact提示は能力/接続済み状態で選択し、Miniが本来満たす単体機能をPro常設必須へ縮小しない。PCの任意shell/管理者権限を共通Agent APIにしない。
5. **native系列**は既存OS clientと別にboot/BSP/driver/保護storage/署名更新/rollback/純正復旧/全損回復を同一実機で受入する。機種別nativeに着手できなくてもclient/runtime結合とhost試験を進める。Mini光学/生体/衛星IP/AP/電池・BMS/充電/熱/RF/精密入力は個別benchと同一閉箱で受入。現行E1光路・D405/Go source・少数表示部等を読み、未成立の全範囲光学を簡易2DやLEDで完成扱いしない。
6. 入出力はowner/attachment/job/revision/版付きcapability/本人認可入力→同job/artifact/usage/停止証拠。状態は未認証→pairing→能力確認→ready/unknown/unsupported→実行/review→stop_requested→停止確認→切断/復旧。既存暗号化履歴/CAS/receiptを正本にし、台帳を増設しない。能力は実装API∩host許可∩本人同意∩server policy。抜去/場所変更/再接続/時刻や校正失効でgrant再評価し、unsafe出力は停止する。
7. 401は再接続、409は同job読戻し、timeout/5xx/応答消失はunknown保持。停止要求と物理光学/駆動/host停止を分ける。電源断後は同pending/成果/元model版を照合し、再発注/別モデル/fallback課金を自動実行しない。本人原稿・成果・設定・鍵は非破壊保持。同契約端末追加による月16USD重複0、実computeはP07共通残枠/予約/明細へ一回だけ集約する。

**確認コマンド（実在するscript/pathを確認済み）**：
```sh
npm --prefix packages/rockstaros-runtime run build
npm --prefix packages/rockstaros-runtime test
node --experimental-strip-types --test tests/rockstaros-portable-runtime.test.mjs tests/pixel-portable-executor.test.mjs tests/avocado-mini-native-development.test.mjs tests/mini-voice.test.mjs tests/smis-module.test.mjs tests/smis-object-purpose.test.mjs
python3 -B -m unittest discover -s systems/rock-star-os/targets/avocado-mini/tests -p 'test_*.py'
npm run test:avocado-mini-site
npm run device-support:check
npm run avocado:r5:check
npm run android:architecture:check
npm run android:first-flash:check
npm run design:check
```
上記はhost/fixture/文書/配布整合の段階。hardware cross-build/SDK/CADはMini READMEの指定versionと新しいGit管理外outputへ再現し、実機接続/flashは同一対象の復旧・予算・本人条件を揃えて別実行する。

**受入**：Mini/Proそれぞれで実owner認証・同契約子接続・同じ担当/model版・一件実仕事・実入出力/成果保存・usage・指定停止・通信断/再起動/失効/復帰を記録する。browser preview、host client、卓上参照MCU、製品Mini/Pro、native boot/OS imageの5区分を混ぜない。Mini最終hardware未所持でも共通client/bridge、driver診断、合成host/PTY/境界試験、復旧手順・部品確定待ち一覧を完了する。製品実機/光学/署名復旧のみを具体的な外部gateとして残す。

<a id="p11"></a>

## P11 同条件で性能と使いやすさを測定してから修正する

**対応と責任**：Product/UXのWEB04/HOME01、Android OS09/OS10/DSP01、model AI02/AI05、CORE04/CORE12。RQ11/RQ26/RQ38/RQ39/RQ40/RQ41/RQ48、Mini性能はMAT15/P10と連携する。ROCKはinstrumentation/分析/修正、JOINTは対象端末と実UIの同条件測定、OWNERは実仕事の内容評価/試用同意を担う。

**現状・原因**：過去のnative推論時間・offline/33分温度試験・生成品質失敗はあるが、現在のWeb/Pixel候補の遅延原因、同artifact二model比較、一般的な操作成功率/常時稼働は未受入。`docs/evidence/sky-pixel-linux-entry.json`、`eve-presence-coexistence.json`、`docs/evidence/android-pixel-10-gl066-local-ai-20260916.json`と`docs/llm-evaluation-architecture.md`、`data/project-status.json.aiModelManagement`を読む。過去の単発値を現p95/平均/電池保証にしない。

**実装・測定順**：

1. 問題別に対象workloadを固定する。Web初回/再訪、目的入力/担当保存/準備/推論/成果/停止/再開、timeline scrollと取得、modelの同一合成依頼を対象とする。Pixel/OS/Vanadium/WebView/APK/Source hash、回線/信号、温度/電池/充電、VM RAM、model/runtime/量子化/hash、入力/出力上限を記録。
2. 開始前にsample数、cold/warm定義、計測窓、タイムアウト/失敗/除外理由、p50/p95計算法、許容退行と改善目標、課題完了/中断/誤操作/復旧の採点rubricを登録する。最低数が足りないときp95等を確証として出さない。少数owner試験を一般市場/全ユーザー成功率へ外挿しない。
3. DNS/TLS/network、取得量/API/server/Provider待ち、JS bundle/download/parse、main-thread long task/render、input-to-paint/scroll frame、VM起動/queue/model準備/推論、export/停止receiptを共通job IDと単調時計で分解する。p50/p95、sample数、失敗率、RAM/CPU、温度、電池/電力の測定範囲と測れない項目を示す。model速度と本人が認める回答/仕事品質を別軸で測る。
4. 最も寄与した再現可能な箇所だけを修正する。cache/code split/pagination/重複request除去/描画範囲/画像/workerは測定に基づく。Security/暗号化/GrapheneOSをprofileなしに原因としない。性能対策でowner認可、最新revision、料金上限、stop/unknown、accessibility、元履歴を削らない。
5. 変更前後で同じ候補条件/入力/回数を再測定し、値の分布/失敗/原始timestamp・artifact hashを残す。UI taskは作成→実行→成果→停止・復旧の観測を含め、UI接続不良や本人操作待ちを計算時間へ混ぜない。新model/有料Cloud比較が必要なら見積/上限/送信を先に確定し、無断fallbackをしない。

**状態・保存・失敗復旧**：測定準備/実行中/冷却/失敗/比較可能/条件不一致/不足sampleを分ける。raw trace/screen録画は必要最小限・Git外、公開証拠は値・条件・command・要約。credential/原稿/生体値をtraceへ入れない。熱保護/低電池/owner中断で停止し、未完了sampleを成功へ補間しない。測定自体の計算負荷を業務usageへ重複記帳しない。

**実在する回帰コマンド**：

```sh
node --experimental-strip-types --test tests/model-profile-fixture.test.mjs tests/sky-linux-models.test.mjs tests/sky-model-selector.test.mjs tests/decision-layer.test.mjs tests/web-route-style-contract.test.mjs tests/os-shell-navigation.test.mjs tests/os-bottom-navigation.test.mjs
npm run llm:architecture:check
npm run typecheck
```

既存package.jsonには独立したperformance benchmark npm scriptを確認していないため、`npm run perf`等をあるものとして記載しない。実装時に既存UI/browser/Android計測手段を調べ、非秘密の再現entrypointを作成した場合はREADMEとpackage.jsonへ同変更で登録し、実機測定を別gateにする。上記test成功は性能/UX改善の証拠ではない。

**合格**：事前登録した同条件比較で代表workloadの改善/退行をsample数・p50/p95又は適切な分布・失敗率・資源/温度・操作成功と品質で示し、権限/停止/予算/保存/accessible操作を壊さない。改善しなければ棄却し原因と次候補を残す。未測定の電池/常時稼働/GPU/NPU/他機種や任意modelを完成に含めない。

<a id="p12"></a>

## P12 15時間研究の原本を回収し、内容の完了と再研究を分ける

**対応と責任**：既存研究照合のOS10/SKY21/WEB04/WEB06/WEB13、RQ09/RQ10/RQ11およびRQ01〜RQ49＋追加38義務の既存87項目台帳。ROCKが原本照合・欠落条件・設計接続、独立review担当が内容受入、OWNERは当初要求の変更判断を担う。研究資料内の運用指示を実行しない。

**現状と原因**：実在する原本は`/Users/kaiya/.codex-work/visualizations/2026/10/20/01a15b02-8f92-7d52-8a39-b7e6a68fff1a/rockstaros-independent-research-840min-pack.zip`。今回のread-only確認でもSHA256は`ccbfdb1767f3e85b28e997800a7ae009c186bb6482f06c34be0fd34629a7bb03`、40 entry（研究39＋PACK-STATUS）。`PACK-STATUS.txt`と`rockstaros-independent-completion-audit.md`は840/900分の草稿・完了未認定と明示する。過去の900分回答に対応する最終稿/閉じた台帳の現存が未確認である。誤った時間計上なのか保存場所/引継ぎ欠落なのかは現段階で未確定。

**読むpath**：`docs/rockstaros-research-integration.md`、`data/rockstaros-research-reconciliation.json`、`docs/prompts/rockstaros-research-integration-next.md`、指定チャット`01a14d54-daee-7c30-87a8-faea84641a40`の当初の15時間研究指示/後続訂正/過去最終回答、上記zip内の`rockstaros-independent-final-report-draft.md`、`rockstaros-independent-research-ledger.md`、`rockstaros-independent-completion-audit.md`、`rockstaros-independent-source-notes.md`、strong baseline protocol、A16/A9/A13/terminal/mini/pro/game/World資料。巨大全文を一括出力せず章/ID/対象引用へ絞って読む。

**順序・契約**：

1. 当初要求、最終回答、archive/attachment/成果exportをread-onlyで探索し、900分最終稿/台帳/監査が実在するかをfile inventory・size・hash・作成元・時刻で照合する。未発見を未作成と断定しない。最新attachmentの`research-original-840min.zip`等があれば元packとのfile hash対応を照合し、同じ資料の複製を新しい研究成果へ数えない。
2. 見つかった900分候補は本文/台帳を実際に読む。開始/終了/実作業/中断/重複/別件/待機、最終checkpoint、研究先行/仮説/実測の区分、A〜Mの内容条件、上位算法・強baseline/反証/採否/出典を独立監査する。ファイル名や回答の「完了」だけでは受入しない。
3. 未回収なら840分原本を不変で保持し、残る内容条件を項目化する。回収/監査時間を過去15時間へ足さない。「足りない60分」だけ作業して自動的に過去900分完成にしない。新しい研究は現在の明示依頼の範囲で別session・別出典日付・実時間台帳へ記録し、過去原本の回収と後続の再研究/設計更新を分ける。単なる待機/タイマー経過を研究に数えない。
4. 追加研究が必要な各論点は、一次資料と強い現行baseline、仮説、反証、最小実験/測定/棄却条件を定める。技術や制度の最新性が必要なら実行時に公式一次資料を再確認する。metadata件数/URL行数を独立文献/性能実験へ換算しない。GPU契約/weights取得/有料試験を研究指示から起動しない。
5. 元研究の独立案・仮説と、現行repoへ採用した設計/実装/同artifact実機合格を別列で照合する。A16/A9/A13、P01/P02/P05/P10/P11等への寄与はsource/contract/test/反例へ具体化する。研究の優れた説明をruntimeの存在や実測結果と呼ばない。
6. 最終内容は主張/根拠/反証/採否/未決定が本文だけで追える形にまとめ、原本と新しい監査・再研究を別versionで保存する。P13へsource provenanceを渡す。旧packのhash/840分/completed=falseという歴史値を成功へ書換えず、回収できた最終稿又は後続内容受入を新しい記録で示す。

**入力・状態・保存・復旧・承認**：入力は指定研究の当初要求、原本zip/hash/台帳、900分候補、現在研究台帳。状態は原本確認/候補未回収/候補回収・内容未審査/内容欠落/独立監査合格/後続再研究を分ける。保存は元原本を不変、必要な要約・照合表・新監査のみGitへ、長大packはartifactへ置く。hash違い/欠落/zip破損は自動で別fileへ差替えず、元を保ち出所照合する。追加研究の範囲や費用が現在承認外なら、実施案を具体化した最後にその不足だけ確認する。

**実在する検証コマンド**：

```sh
node --experimental-strip-types --test tests/research-reconciliation.test.mjs
npm run baseline:check
npm run design:check
npm run project:check
```

既存`tests/research-reconciliation.test.mjs`は87項目coverage、原本40file hash、840/900/completed=falseの歴史snapshotを検査する。これを単に900/trueへ変更して合格させない。新最終稿の受入/原本manifestの検査が必要なら独立した新記録・意味のある試験を追加する。hash検査だけで内容品質/15時間の実作業/特許性/性能優位を判定しない。

**合格と残件**：900分最終稿を回収できた場合は対応台帳とA〜M内容を独立監査して受入/不足を示す。回収不能の場合も、840分原本保全・未回収範囲・当初の欠落条件・新研究の成果と費やした時間を正確に閉じればその範囲の作業成果となるが、「過去15時間研究完了」は未認定のまま残す。P01〜P11/P13のROCK開発は原本回収待ちで停止しない。

<a id="git-detail"></a>
## 詳細GIT：差分を保全し、GitHub保存・main統合を閉じる（P13）

主担当はGit / CI / OperationsのROCK（G04・DOC01・DB01）、JOINTは同一候補の独立検収とGitHub CI。下記は将来この開発プロンプトを実行する担当への指示であり、今回のプロンプト改訂でcommit/push/mergeをしたという記録ではない。今回の本人要求はGit保存・統合を任務の目標に含める。実行を依頼されたら、既存の実装承認を使い、通常の保存とreview可能な統合を進める。古い承認記録の一般的なmain未許可を、今回要求された統合準備の一律停止理由にしない。強制上書き・他担当差分の破棄・一般ローンチ・実課金はこの意味に含めない。

<a id="git-01"></a>
### GIT-01 保存対象を固定する

最初の成果は機能追加ではなく、再開できる変更台帳である。GitHub main、commit済み作業branch、dirty Root、Eve別Source、Smith共有Source、Sites公開source、Mini/Pro sourceを別列へ置く。各pathに `originSource / startHead / blobHash / workingHash / owner / parentP / adoption / reason / destinationCommit / acceptanceTier` を記録する。ファイル件数を機能数としない。

- Rootは`git status --porcelain=v1 -uall`で個々のpathを数え、tracked変更・削除・未追跡を分ける。通常statusのdirectory集約件数との比較をしない。stage済み差分があれば他者のものをunstageせず所有を照合する。
- 各dirty入力はowner別の対象path一覧とsha256をGit外へ保全する。差分patchだけでは未追跡ファイルが残らないため、必要なuntracked bytesもmanifest付きで保全し読戻す。共有作業木を丸ごとstash/reset/cleanしない。
- 原稿・本人/顧客データ・鍵・SIM秘密・環境ファイル・DB実体を調べず一括追加しない。OS image、model weights、cache、全ログ・全frame・再生成可能な出力をcommitしない。実装、設定、必要fixture、要約証拠、再現/復旧手順、必要な製品assetを選ぶ。除外理由とartifact保管先を台帳へ残す。
- Eve Sourceの`origin`はローカルrepoなので、そこでcommitしただけではGitHub保存ではない。Princeton側GPU測定の再現script/非秘密結果を採用する場合も、元path/hashを記録して必要最小限だけ正本へ取り込む。

**合格**：全対象pathが採用/既統合/履歴保持/外部artifact/保留のいずれかに入り、未追跡と削除を含む復元読戻しができる。保留は内容と理由・再開条件がある。台帳生成が実装/受入を代替しない。

<a id="git-02"></a>
### GIT-02 最新main上の既存実装を先に照合する

作成時mainは`7304e449cd7938b098b0b1ce481a06501db8d795`、branchは`951d82d5a491a284aed4e0d4d280171d835d4b43`。22:43 EDTのprompt:contextはliveMetadataVerified=true、21branch・open PR11件、main同SHA22check成功、作業branchはsource-preparation1件のみ。実行開始時は再取得して40桁SHAを固定する。

今回の直接blob照合では`lib/rockstar-service-attachment.ts`と`lib/rockstar-service-setup.ts`はdirty Rootとmainが一致する。これをRoot HEADにないという理由で作り直さない。`lib/workflow.ts`はRoot HEAD・dirty Root・mainの3者が異なる。`lib/sky-cloud-monthly-store.ts`はmainにありRootにはなく、`sky-agent-monthly-statement.ts`はRootにありmainにはない。Remix/mediaはmain/Root HEADにはなくdirty Rootにある。mainの既存実装→各候補の追加差分という順で読んで統合する。

main baseline2.08/RQ50・status393taskとRoot baseline1.123/RQ49・status165taskは別履歴である。版番号の大小・task総数で片側を採用せず、RQ/task IDごとに明示判断、後継関係、source、受入層を照合する。main側RQ50とcompute gridは既存承認/`docs/sky-compute-grid.md`に照らして保持し、新規の有料参加・資産運用を自動許可しない。

**合格**：共通契約・owner/CAS/予約/停止・migration/依存の採否理由があり、必要な保護機能を落としていない。旧smisという内部pathとSmithという製品表示を同じ置換で壊さない。

<a id="git-03"></a>
### GIT-03 既存worktree・PRと編集所有を揃える

適切な既存active worktreeを調べて再利用する。適切なものがなければ最新mainから`codex/`接頭辞の統合用checkoutを分離し、元Rootのbranchは切り替えない。`codex/esim-cloud-access`へ669commitを一括mergeして競合を片側優先にしない。参照不足ならfetchして固定し、履歴をforceで上書きしない。

作成時open PRは#100/#103/#104/#105/#106/#108/#110/#130/#171/#177/#178。依存するbaseを先に辿り、同じpatchと後継実装を比較する。#130は`Recover built-environment direction on current main`、head`3a805132c7d85c50ca76eb9de960c90b5b3e77da`、open/mergeable=false/dirtyという読戻しで、既存の統合完了ではない。過去merged #182〜185等も取り込み済み差分の再導入を避けるため参照する。無関係PRをまとめてmerge/closeしない。

編集所有は、統合/正本/migration採番、Eve/Smith契約、OS/Pixel、Mini、Pro、service/billingに分ける。`lib/workflow.ts`、DB schema、共通UI、plan/statusは統合担当が編集順を管理する。workersへ「他担当の差分を戻さず、現在の変更に合わせる」を明示する。ユーザー所有チャットへの送信や新チャット作成はこの並列化の代替にしない。

**合格**：対象branch/checkout、PRの再利用/新設理由、file所有、依存順、復旧先が確定。実装担当以外の検収者が割り当てられる。

<a id="git-04"></a>
### GIT-04 DB migrationと互換を一人が統合する

`drizzle/`・`drizzle-main/`・Sourceのschema/journal、適用済みDBのreadbackを比較する。同じ番号が同じ意味とは限らず、違う番号の同じtableも二重に作らない。Rootの`0064_sky_linux_service.sql`/`0065_rockstar_service_setup.sql`は作成時mainの同pathに存在しないので、同じ番号へ盲コピーせず現行mainの対応tableを調べる。

1. source/journalだけの候補と既適用migrationを区別し、適用済みファイルの内容/hashを改変しない。
2. 必要なadditive migrationを一人が採番し、旧clientのnullable/undefined/旧kind/receipt/pending readerを維持する。
3. 空DB→最新、旧branch DB→最新、既適用main DB→最新、途中失敗→同じ移行再開、重複実行、CAS競合、旧clientが安全に拒否する更新を実DBで検査する。
4. rollback不能なschema変更は先にbackupと互換reader/roll-forward方針を準備し、古いschema復元で失効・削除・入金・停止tombstoneを消さない。

**既存入口**：`tests/migration-union.test.mjs`、各monthly/service setup migration試験、`npm run schema:check`、`npm run database:check`。source集計の生成が必要なら`npm run database:status`を使う。remote DBへの実migrationは別の対象環境と復旧条件を固定して行う。

<a id="git-05"></a>
### GIT-05 小さく保存し、変更中の入力を成功候補にしない

P13前半で引継ぎ/優先順を同期した後、P01〜P12と詳細unitを実装する。全部が終わるまでdirtyへ溜めず、互換契約、実装/fixture、UI/adapter、要約証拠をreview可能な単位で保存する。各commitに親P/詳細unit、base/source、追加/削除path、局所検証、未受入層と復旧を書き、対象pathのみstageする。

候補を固定したら全verify前後でtracked/untracked入力manifestを照合する。並行編集でhashが変わればその範囲は最新の検証未了とし、凍結した別候補で必要試験を再実行する。既存lint失敗は歴史記録であり、現在も同じと断定しない。最新失敗だけを対象にownerを確認して最小修正し、ルールやassertionを弱めて通さない。

**合格**：必要なsourceがcommitへ含まれ、無関係変更/秘密/大量生成物がない。必要fixture/asset閉包が揃い、commitだけcheckoutして局所試験を再現できる。

<a id="git-06"></a>
### GIT-06 GitHub保存・同一SHA CI・PRを完了させる

通常pushでGitHubの作業refへ保存し、remote readbackの40桁SHAと一致させる。非fast-forwardなら新しいremote差分を読んで統合し、force pushで消さない。`origin`がGitHubを指すか確認し、ローカルSourceへのpushをGitHub保存と呼ばない。既存PRを更新するか必要なPRを作り、作成/更新したPRはタスクへattachする。

PR本文は具体的なbefore/after、最終scope、適用migration/旧client互換、入力/commit/artifact、検証と未実行、rollback、残る外部/本人条件を示す。既存CIのskip/NO_CHECKSは成功にしない。PR headが変わったら同じheadのCIを取り直し、別SHAのmain成功を代用しない。自動検収/独立レビューの指摘を対象コードへ直して必要試験を再実行する。

**合格**：remote SHA、PR head、同SHAの必須CI、review結果、artifact/source closureが一致し、次担当がURLから再現できる。raw logsはGit外に置き要約とhashだけcommitする。

<a id="git-07"></a>
### GIT-07 main統合と配備を別に受け入れる

mainが動いたら最新baseとの合成結果を検証し、競合は契約単位で解決する。GIT-06の同SHA CI/独立検収/互換/rollback条件がそろったreview可能な対象を通常手順でmainへ統合し、merged状態・merge commit・mainの包含関係をreadbackする。既存mainの保護設定を弱めて通さない。準備未了ならPRを具体的な未解消理由と次操作付きで残し、mainMerged=trueにはしない。

GitHub保存、作業branch反映、main統合、Sites preview配備、3正式domainのDNS/TLS/asset/header/実画面読戻し、APK導入、native image、一般ローンチをそれぞれ別eventへ記録する。一般ローンチ保留を維持する。preview更新に明示許可があれば対象versionとrollbackを固定して進め、未許可の公開変更をGit統合に混ぜない。古いworktree/branchは他担当使用・未追跡/ignored必要物・復旧snapshotを確認後に扱い、保存前に削除しない。

<a id="git-08"></a>
### GIT-08 完了台帳と再開入口を揃える

AGENTS/README本文/project/status/CHECKPOINT（存在時）/nextPrompt、対応する設計・index・workstreamへ同じ再開先を残す。task数やbaseline版だけを統一するのではなく、採用source/能力/受入/未決条件を同期する。P01〜P13と各unitに `implemented / focusedVerified / fullVerified / githubSaved / mainMerged / previewDeployed / physicalAccepted / providerAccepted / productionAccepted` の独立欄を設け、false/未実行を隠さない。

**既存確認コマンド**：`npm run prompt:context`、`git diff --check`、`npm run project:update`、`npm run project:check`、`npm run repository:check`、`npm run schema:check`、`npm run database:check`、`npm run baseline:check`、`npm run design:check`、対象試験、最後に固定候補の`npm run verify`。現在のGit命令を変更木全体へコピー実行せず、上記の所有・採否・対象refを確定してから保存する。

<a id="service-billing-detail"></a>
## 詳細SERVICE：eSIM導入から共通サービス開始へ（P06・P07）

ここで記載する追加API名やrecord案は**実装提案**であり、既存機能の存在宣言ではない。まず既存`app/api/rockstar/service-setup/`、`lib/rockstar-service-setup{,-store,-billing}.ts`、issuer/claim/event・seller delivery・eSIM gatewayを読み、同じoperation/event storeを拡張する。routeを増やす場合は既存契約と同じ認証/CSRF/owner/limit/error形式を守る。

<a id="esim-01"></a>
### ESIM-01 状態の直積と接続判定

回線状態、SIM profile状態、issuer service entitlement、電子契約/支払手段、workspace/runtime準備、端末attachment、job、請求/収納を別レコードへ参照する。`active`という一つのflagでまとめない。端末がeSIM非搭載でも本人の同契約Mini/Pro client追加を可能にする。

service access判定は、本人認証、現契約/料金同意、信頼issuerの現利用権、対象端末鍵/manifest/能力、scope/期限/epoch、共通Core受入、準備済みworkspace、現在budget条件の積で計算する。既存pure verifierのboolへbrowser自己申告を渡して本番認可しない。実eUICC install済みでもservice利用権未確定なら制限、telecom圏外でも契約上許可されたcloud結果閲覧/持出しは別に扱う。

**合格**：状態組合せ表とserver判定fixtureがあり、購入のみ/回線のみ/URLのみ/旧issuer active/別owner/別端末/期限切れで有料dispatchが開かない。data/SIM秘密/LLM/OS binaryをSIMへ保存する設計へ戻らない。

<a id="esim-02"></a>
### ESIM-02 issuer lifecycleを永続イベントへ結合

既存issuer adapterとdelivery/recovery APIへ、真正なprofile subject/contract/issuer/key/sequence/event時刻/署名/有効期間を固定して接続する。raw受信eventは既存の永続受信箱で一回受理し、検証→現状態照会→owner/contract binding→利用権epoch更新を原子的に処理する。同ID同digestはno-op、異digest/逆順/偽署名は隔離。通知が欠けたときは同じprovider referenceでreadbackし、再購入・再発行しない。

停止/失効/期限切れを古いactive通知で解除しない。再開は現在issuer状態と契約・本人接続の再確認を経た新しい世代で行い、古い端末writerを復活させない。issuer資格情報はserver secret store、SIM activation materialは暗号化/本人限定/短期表示・再送監査で保管し、ログへ出さない。

<a id="esim-03"></a>
### ESIM-03 準備operationと外部資源確保のoutbox

既存setupのstatusとoperation IDを読み、そのまま拡張して `created → waiting_consent → payment_setup_pending → entitlement_pending → provisioning → verifying_ready → ready` と各`retryable/unknown/restricted/ended`を区別する。実際の既存enum名へ対応表を作り、記号だけを追加して処理を未接続にしない。

owner+contract+workspace準備の一意キー、同意digest、料金版、実行先、operation nonceとrevisionを、外部Linux/compute確保より先にDBへ保存する。外部要求はoutbox/lease/fencingで一workerだけが取り、要求timeout後は同じprovider operationを照会して再開する。DB保存失敗のまま資源を作らず、作成済みか不明な状態で二台目を作らない。取消とreadyの競合、orphan resource、失効中の準備を復旧queueへ残す。

署名付きreadyのworkspace/owner/contract/operation/image/runtime hash・可用能力・epoch・有効期限を照合してからreadyをCAS確定する。単なるHTTP200や`sample accepted`で合格させない。`serviceStartAt=null`中は基本料起算も新規有料実行も始めず、支払手段登録は初回引落0を維持する。標準clientサービスは共通Coreの受入を条件にし、Pixel full image/flash完成を一律前提にしない。

<a id="esim-04"></a>
### ESIM-04 子端末attachmentの発行・更新・失効

既存18field署名形式とdomain separation、最長15分leaseを保持する。提案するissue/renew/revokeのserver操作は、本人session、端末公開鍵のchallenge署名、親利用権epoch、契約/workspace、audience、scope、capability profile/manifest hash、期限/nonceを同時照合する。更新時にも現状態を読んで検査し、無制限なrefresh tokenにしない。

二台の同時発行で同じ端末/契約が二workspaceへ分かれず、親失効後に子が新しい有料jobを開始しない。offline端末はlease期限・保護された最終状態・再接続照合で失効を反映し、瞬時停止を保証しない。停止・安全な成果export・usage照合は契約で許可した限定経路を残す。SIM swap/公開QR/リンク窃取/別audience/古いmanifestをnegative testにする。

<a id="esim-05"></a>
### ESIM-05 既存OSとnativeを能力別に導入する

Pixel/iPhoneは正確なSKU/OS版/eUICC能力/ブラウザ・client権限を読み、native受入済み機種だけnative経路へ案内する。iPhoneへAndroid attestation receiptを発行しない。Android enrollmentは既存Broker/AIDL/challenge/AndroidKeyStore/JVM verifierを結合し、controlled verifier doubleと本物のchain/実deviceを別欄で試す。SDK未検証を実機準備済みにしない。

issuer許可bootstrap appletの起動、確認1回、手動browser/client導入は実tap数/permission数と失敗復帰で別に測る。OS規格のcommand存在をiOS全対応・自動前面起動の実証にしない。iOS/issuerが未用意でも、ROCKのdoctor・状態API・署名検査・親子認可・手動復旧UIを完成させる。

<a id="esim-06"></a>
### ESIM-06 一件のcloud仕事と切断後継続

Eve→Smithから同owner/contract/workspace/job/Agent revision/料金同意へ接続し、cloudは事前に承認されたduration/scope/budgetのdurable autonomy grant内でだけ継続する。携帯clientが閉じたことは停止承認にも無期限継続許可にもならない。端末はowner-scoped inboxで同じjob/artifact/usageをreadbackし、新規jobを自動送信しない。停止要求→dispatch抑止→worker受理→停止receipt→確定usageを区別する。

<a id="esim-07"></a>
### ESIM-07 実sandboxと復旧の一周

同じissuer profile・contract・setup operation・workspace・端末鍵・jobを使い、購入/発行→本人導入→利用権確認→ready→一件仕事→成果/usage→子端末→親/子失効→制限→支払/利用権復帰→同workspace読戻しを試す。provider契約・地域・terms・資格情報・課金上限が未確定なら、先にcontrolled adapter/fixtureで正常・逆順・切断・資源枯渇・二ownerを閉じ、実sandboxだけを未受入として残す。

<a id="esim-08"></a>
### ESIM-08 証拠と受入の独立欄

local pure verifier、実DB/HTTP、controlled provider、Provider sandbox、実Pixel/iPhone、現公開client、本番課金をそれぞれ記録する。再発行数/外部資源数/二重workspace数/無同意dispatch数/同基本料数を検査する。P06の既存commandにgateway/install-proof/event reconciliation試験を加えるが、古い59/638等の合格数を現在candidateへ転記しない。

<a id="billing-detail"></a>
## 詳細BILL：透明なusageと月次請求・作者精算（P07・P08）

<a id="bill-01"></a>
### BILL-01 固定料金版と起算のschemaを実装する

P07の不変料金snapshotを既存terms/offerにadditive実装する。USD基本料1600minor/契約/月は維持し、包含量・各meter単価・地域/税・日割り・締日/timezone・猶予/返金・BYOK・外部実費は明示版にする。未決値は`pending_owner_terms`として販売を閉じる。実行feeの未報告を0へしない。`serviceStartAt`のnull/undefined/旧契約互換を具体的移行fixtureで検査し、端末追加・再起動・再pairで基本料行を増やさない。

<a id="bill-02"></a>
### BILL-02 同時予約と結果不明の原子保存

既存budget pool/Wallet/Cloud予約を共通job参照へ結び、`used + outstanding_reservations + requested_max ≤ approved_cap`を同じtransaction/CAS内で検査する。Client→Eve→A2A子jobの予算は委譲額の包含関係を持ち、親子usageの二重加算を拒否する。送信前取消と送信後unknownを別にし、停止画面を予約解放条件にしない。二同時client・二worker・月境界・cap変更競合を実DBで検査する。

<a id="bill-03"></a>
### BILL-03 計量を請求明細へ一回だけ結ぶ

各usageにowner/contract/job/run/親子、Agent/package/manifest/model版、provider account/mode、meter/unit/quantity、priceVersion、観測期間、receipt/reference/digest、確定/暫定/未報告を記録する。整数minorまたは合意された固定精度で計算し、浮動小数点の加算で金額を丸めない。token input/output/cache、CPU/time、Tool/作者、通信/商品/実費を混ぜず、BYOK原価再請求を拒否する。receipt重複はno-op、同ID異digest/遅延/負の補正/未知meterは理由付き保留。

<a id="bill-04"></a>
### BILL-04 月締め・訂正・一意Invoice

契約timezoneの半開区間を計算し、包含量控除・overage・丸め・日割り・税を契約版で再現する。基本料は同一契約periodに一回。確定Invoiceへ元usage/receipt/契約/同意digest/行の由来を束縛し、再締め・応答消失・再起動・並列締めで同一Invoiceを返す。UTC旧draftは新timezoneへ黙って付替えない。訂正はcredit/adjustmentと元行参照で記録し、確定額を上書きしない。

<a id="bill-05"></a>
### BILL-05 非同期決済と読戻し

既存Stripe transport/Provider Invoice/永続event/idempotencyを再利用する。現在API固定は既存codeで確認し、必要な版/SDK変更は互換試験と一次資料で評価する。新しい別課金基盤やMetronomeへ無条件移行しない。新usage製品方式が必要ならStripe skillに従って候補を比較し、既存台帳/予約/請求と二重meterにならない移行案を先に検収する。

Webhookはraw bodyの署名・時刻・mode/accountを検証し永続受信箱へ保存する。subscriptionを使う経路は lifecycle/invoice.paid/invoice.payment_failed等の既存対応を確認する。success URLやmetadataだけで入金・利用権を有効化しない。Provider object graphと保存済みCustomer/Invoice/Charge等をGET照合し、欠落/重複/逆順/応答消失から同IDで復旧する。送信後unknownなら新Invoice/引落しを増やさない。

<a id="bill-06"></a>
### BILL-06 本人UI・未払制限・復帰

Eveの事前見積/上限/予約、実行中の暫定/確定usage、明細、Invoice、支払方法setup、支払要求、入金、返金/異議を分けて表示する。少数ページしか読めていない一覧を債務0へ換算しない。未払い猶予後は新規有料仕事を制限し、本人の成果・履歴・請求確認・export・問い合わせを残す。入金と利用権を再確認して元workspaceへ復帰し、過去jobの無断再実行や一括再請求をしない。

<a id="bill-07"></a>
### BILL-07 作者契約・分配・取消復旧

P08の二者署名契約/本文hash/package/価格版/同意/sourceを既存storeへ結び、入金済み原資・返金/争い・fee・作者payableを分離する。新たな手数料を発明せず、既存Marketplace10%の適用範囲を維持する。分配intentを外部要求前に原子保存し、同source二重払出しを拒否。unknownは同transfer GETへ照合し、返金/chargeback/宛先変更/旧snapshot復元ではreversal holdを単調保持する。実送金は対象作者・額・宛先・期限・費用の個別承認と金融gateが必要で、fixture売上から残高を増やさない。

<a id="bill-08"></a>
### BILL-08 月末sandboxの受入matrix

少なくとも次を同一candidate・実DB/HTTPで検証し、Provider sandboxは別に一件一周する。

| ケース | 観測する不変条件 |
| --- | --- |
| 準備前/支払手段だけ登録 | 起算0、引落0、有料dispatch0 |
| Web/Pixel/Mini/Pro同契約 | 基本料行1、共通cap、owner越境0 |
| 同時予約・子A2A | cap超過0、親子二重計上0 |
| 中断/timeout/停止未確認 | 同ID、unknown hold維持、無断再送0 |
| 重複/逆順/遅延receipt | 一意計量、異digest隔離、元period追跡 |
| DST/閏日/月跨ぎ/丸め | 同料金版から同じ額、二重枠控除0 |
| 再締め/DB失敗/応答消失 | 同Invoice/Provider ID、二重引落0 |
| 部分/全返金・void・dispute | 元行へ補正、作者凍結、unknownでhold消失0 |
| 未払・復帰・解約 | 有料新規を制限、成果export保持、元workspaceへ復帰 |
| 作者受取先変更/払出し応答消失 | 旧attempt不変、同transfer照合、二重送金0 |

テスト環境はlocal/CI/liveを分離し、既存test-mode依存があれば根拠を記録して継続、新規試験は分離sandboxを基本にする。資格情報は最小権限のrestricted keyを優先しsecret storeへ置く。税は販売主体/地域/商品区分/有効登録/住所/税計算のsandbox結果を確認し、`automatic_tax`だけで徴収合格にしない。未決条件があっても合成料金版のROCK実装と負例検証は進める。

P06〜P08の既存試験・compiled Worker/D1 scriptを使い、追加の並列/障害試験は状態/DB件数/金額/Provider呼出数を検査する。期待文字列だけを実装通りに並べた試験で安全性を証明しない。契約版/同意/usage/Invoice/入金/分配の一意参照とrollback/再開手順を要約証拠へ保存する。

<a id="smith-detail"></a>
## Smith詳細実行節 — 目的と能力を同じ担当・仕事へつなぐ

この節はP02/P03/P04/P10を具体化し、P08/P09/P11/P13との境界を定める。既存taskはHOME01、SKY12/SKY14/SKY15/SKY21、WEB04、OS10、DSP01、MAT15。RQ01/RQ02/RQ03/RQ04/RQ07/RQ08/RQ21/RQ26/RQ37/RQ40/RQ41/RQ42/RQ48および後続の明示要求を、既存workstreamへ関連づける。新たなRQや実課金・物理操作権限を作らない。主担当はSky/MCPのROCK、共通CoreはOS10、実入出力はDSP01/MAT15、実owner/Pixelの縦断受入はJOINT。文書作成だけでは実装・実機・公開完了としない。

### 現在地と最初に固定する候補

- 正式表示は **Smith**。本人の最新明示はSmithチャット `01a16b30-82bb-7cc1-985d-fc74970a26c6` の2026-10-23 20:40〜20:56 America/New_York内の「Smithのスペルこれ」。最新2turn再読で追加指示なし。旧チャット題は `smis`、別の `エージェントスミスを確認` はMatrix着想のAgent移動/別研究系列であり、現製品の完成機能へ数えない。
- 最新本人要求は、**部品がなくてもPixelのEveで目的→できること/足りない部品の実表示→できる依頼の担当作成・実行・保存・停止を実確認**。一般公開保留。20:56 ET最終はUSB再接続確認のみで操作窓が使えず、実一周は未受入。15:09 ETのTerminal開始エラー/VM0を現在状態と断定せず、P01/OS担当の新しい同一候補観測へ同期する。
- Root `docs/product-baseline.md`、`data/product-baseline.json` の `smisIdentity`、`data/project-status.json` の `smisIdentity`、`docs/sky-tools-complete-design.md`トップ、`lib/os-navigation.ts`、`app/manifest.ts`はSmith。既存の `/sky`・`/api/sky`・`smis.*` schema/SDK/header/保存key・設計anchorは意図した互換。旧prompt/current-designの利用者向けsmisだけをSmithへ同期し、歴史的証拠や内部IDを一括置換しない。
- 新目的/部品はRootの共有dirty。`docs/evidence/smis-object-purpose.json`、`smis-removable-module.json`はlocal/fixture受入でphysical=false。旧10hash中3/旧13hash中7は後続変更。最新Smithのhost記録1697=1696pass/1skip/Mac local UIも共有treeでimmutable whole-tree receiptなし。P13で現在の対象pathと候補hashを固定してから再検証する。
- Add/outcomesの別Sourceは `/Users/kaiya/.codex-work/visualizations/2026/10/18/01a14d54-daee-7c30-87a8-faea84641a40/core-source-integration`。`agent-shares-handoff.json`、`agent-tool-loop-handoff.json`、`agent-outcomes-handoff.json`に由来を残す。そこにはshare/outcome storeがある一方、新目的/module pageはなくnavは旧smis。`work/eve-v115-agent-integration`や公開v118とも別候補。root/source/publicを比較して必要変更を統合し、一方の採用で他担当のCore/復旧/保存を消さない。

<a id="smith-01"></a>
### SMITH-01 表示・既存データ・入口の整合（P13→P02）

**小作業。** `lib/os-navigation.ts`、Homeの＋追加/管理、Eve作成入口、manifest、`data/company-brand.json`、README/正本index/各端末操作面を読取り、現在の利用者向け名とURLの対応表を作る。表示はSmith/Eve/コミュニティー、RockstarOSが共通Core。Mini/Proも同じ仕事契約を使う。旧ルート/保存key/APIはcompatibility aliasとして保持し、新しいschema/DBを名称だけで作らない。既存`smisIdentity.referenceThread`が旧研究IDを指すことと、最新スペル訂正の直接出典がSmithチャットであることを区別して記録する。

**入出力と移行。** 入力は既存owner/session、保存担当のID/revision/role/model pin、旧URL・旧保存key。出力はSmith表示と同じ保存データ/同じ仕事への導線。状態はunavailable/loading/ready/failedを維持し、名前変更で有効化・登録・実行を起動しない。旧版→新表示で担当数・仕事ID・成果hash・ACL・cap・失効を比較。データ移行が不要なら明示する。必要な移行は既存migration体系へ最小追加し、read-old/write-compatible/rollbackとcopy不変を検証する。

**失敗・負例。** 旧URL、旧saved reference、別owner、壊れた保存、revision競合、表示名変更後のモデル/Agent未接続を試す。UI表示でlegacy内部IDを隠すために暗黙の同名再作成をしない。FAIL時は既存データを維持して前版表示へ戻せるようにする。

**合格証拠。** 旧URLで同じ本人データを読め、Smith表示へ切り替えても新dispatch/課金/鍵更新0。root/Source/配備の反映範囲を別記録。一般公開保留の本人用経路だけで確認できる部分を先に閉じる。

<a id="smith-02"></a>
### SMITH-02 部品なしの目的確認・不足表示（P02/P10）

**読む/再利用。** `lib/smis-object-purpose.ts`、`lib/smis-module-work-port.ts`、`components/smis-object-purpose-panel.tsx`、`components/smis-module-panel.tsx`、`components/eve-runtime-interaction.tsx`、`components/eve-interaction-panel.tsx`、`app/os/eve/module/page.tsx`。現候補は語彙規則による11種チェック（motion/text/moisture/temperature/weight/image/button/contact/sound/watch/actuate）であり、汎用物理理解LLMではない。request300文字/other200/unique needs等の既存境界を維持する。

**小作業。** ①本人が「この物をこう便利にしたい」を入力、②候補に誤り/不足がないか本人が修正・確認、③実接続能力と現在対応処理を別に照合、④「今できること/必要な部品/未対応処理/確認する情報」を根拠付きで表示、⑤準備できた文章依頼を同じEve作成へ渡す。部品なしで文章を書く依頼は進め、測定/通知/水やり等は未接続の能力を省かず保留する。追加部品不要な機能を購入不足と表示せず、同じ基板でも対応処理未実装なら準備が必要と表示する。現在の目的を短い代替へ変える場合は元目的と部分試行の差を示し、本人が選ぶ。

**入出力/状態。** 入力は本人目的、確認済needs/other、実測能力inventory、runtime ready。出力はreview、possible/missingParts/preparation、ready理由、同じrole/jobへの引継ぎ。`needs-clarification → needs-preparation → ready`は**実行権限ではない**（physicalAcceptance/executionAuthorized=false維持）。準備前のdraftは現在同ページmemoryのみ。ページ再読込で失われる旨を表示する。永続化が必要なら新DBを足さず既存owner-bound会話/role/jobへ、本人の保存操作・同意・revision付きで保持する。名前や推奨部品を見ただけで接続済み/購入済みへ昇格しない。

**負例/復旧。** 空/長過ぎ/未知need/重複/誤った語彙一致、植物の水やりを文章へ縮める、不明目的をtext-only readyにする、別ownerのavailability、準備中のowner/target変更、遅延応答、unmount、同一候補確認連打を試す。目的/不足を消さず、401再認証・409再読込・接続切断なら同一draftを本人確認後に再照合。候補LLMを追加してもproposal扱いとし、能力inventory/本人確認/署名やBrokerを迂回させない。

**合格証拠。** まず実Pixelの本人用画面で部品なしの目的と不足表示を確認。文章目的1件は新担当作成からSMITH-03の実一周まで、測定不足目的1件は不足理由を保ったままdispatch0で止まることを同じ候補で記録。模擬入力と実UIを別欄にする。

<a id="smith-03"></a>
### SMITH-03 同じ担当を作成・登録し、実行・保存・停止する（P02、Eve共通Core）

**読む/再利用。** `lib/rockstar-eve-interaction.ts`、`lib/eve-purpose-runtime-work-port.ts`、`lib/eve-runtime-work-port.ts`、`lib/eve-agent-preparation-sync.ts`、`lib/eve-runtime-sync.ts`、`lib/eve-runtime-history-control.ts`、`lib/eve-runtime-export.ts`、`lib/eve-runtime-recovery.ts`、`lib/workflow.ts`、`app/api/eve/runtime/route.ts`、`app/api/sky/agents/route.ts`。`eve-purpose-agent-creation.json`の既存同ID応答消失復旧/最初のAgent/旧model拒否/実登録queueを維持する。別担当が保存したSource3f6075fの既存job/停止由来/履歴修正をP13で統合し、新しい並行executorを作らない。

**小作業と契約。** ①確認した目的からbounded text roleをpreview、②本人確認後に私用libraryへ保存、③同Agent ID/revision/role digest/model ID・scheme・hashとpreparation IDをexact registrationへ渡す、④承認済みowner/thread/device/入力digest/quote/cap/期限を直前再照合、⑤準備済みモデルで一回実行、⑥同jobの実結果とpinをWeb/Pixel双方で読戻し、⑦普通のUTF-8ファイルをAndroidへ保存し独立readbackでhash比較、⑧同job停止→元executor receipt→停止確定、⑨再起動/reload後に同ID成果と停止を再照合する。

状態はdisabled/standby/listening/review/creating/running/result/stopping/unknownとserver側workflowを対応付ける。保存済成果を開く操作はresume/readだけでprepare/startを行わない。別の依頼で再利用する時だけ別jobを明示作成し、二clientが同じjobを二回実行したものを対応実績としない。model本文はreviewで保存し、本人内容確認なしにcompletedとしない。usageの0/null/未照合を保持し、ローカル計算を入金へ昇格させない。

**失敗/復旧。** 登録/開始の応答消失、preparation期限/ack喪失、原登録の失効、Agent変更/model hash違い、serverにknownExisting jobなし、遅延start/result、stop中のmode変更、接続断/再起動、削除会話、owner/thread/device切替を試す。必ず同じIDで正本を再読し、自動新ID・自動再登録・無断Cloud fallback/モデルdownloadをしない。停止receipt欠落はunknown、予約も保持。復旧pause中は新配送を止め、既存成果読取を保つ。aliasやpending handleを実行権限へしない。

**合格。** 同一候補・同owner・新Agent同ID/revision/modelで実model1件以上、WebとPixel双方の同artifact hash、Android実ファイル読戻し、原job停止receipt、再起動後不変を証拠化。実model呼出数/支払0/外部Tool作用0/新credential0を明示し、旧APK/旧v113/合成169を新一周へ転用しない。一般voice/全OS/実請求/任意software生成はこの合格外。

<a id="smith-04"></a>
### SMITH-04 3方式の能力adapterと物の付け替え（P10、P02）

**共通責務。** 機器内蔵、共通部品の外付け、周辺センサーの三方式は同じowner/object/capability/measurement/method/time/calibration/epoch/revisionのinput contractへ正規化し、実行・保存・停止はSMITH-03を使う。生物/無機物の大分類で機能を保証せず、対象者同意と実観測を確認する。対象認識は担当/入力を選ぶ工程であり、目的達成や実測値取得とは別。ミニのinputへ差替えても別job DBを作らない。

**周辺観測。** `lib/smis-visual-input.ts`、`lib/smis-camera.ts`、`lib/smis-object-handoff.ts`、`lib/smis-input-session.ts`、`components/smis-camera-workspace.tsx`、既存 `/sky/objects/camera`を使う。64×64 appearance fingerprint/10秒鮮度の候補照合、本人確認、Agent版/対象名/ownerとtab-local短期handoffを維持。現処理は意味理解/OCR/植物状態診断ではない。browser-camera/mini-cameraのsourceを明示し、raw画像非upload/非永続を維持。誤照合/見失い/同じ見た目/古い画像は曖昧又は不明にし、勝手に対象を確定しない。

**外付け。** `lib/smis-module-session.ts`、`lib/smis-microbit-bluetooth.ts`、`lib/smis-module-work-port.ts`を使う。micro:bit加速度6bytes/3int16、既存GATT service/characteristic、10秒fresh/monotonic sequence、owner/connection/module/object/mountEpoch binding、本人が固定と値変化を確認する手順を維持。requestDevice chooserは本人操作、12秒setup timeout/abort/遅延GATTのrelease/notification解除を試験。再接続/別対象へのattach/detachは旧epoch失効。旧jobのread/stopは元参照のまま可能、旧prepareから新startは不可。物が外れたという自動検出は今ないので、手動解除/通信断と物理接点sensorを区別する。

**内蔵。** 最初は既存adapter interface/fixtureで能力宣言・署名/作者・資源/停止条件を扱う。実BSP/driver/電源/停止制御はP05/P10の別機種gate。第三者部品/AgentをOS platform鍵で署名せず、任意root/shellを追加しない。

**移行・安全・復旧。** 同一対象の入力方式差替えは校正/意味/単位/観測範囲が等価な時だけ新epoch/本人確認のうえ履歴へ関連付ける。別の物への付け替えは旧job停止確認→旧scope失効→新対象登録/校正/承認。結果不明中に新対象を実行しない。加速度の生値を重さ/温度/位置/水分へ変換したと装わない。センサー故障/古いsequence/時計逆行/不正値/切断/owner切替で新入力を拒否し、最後の値はhistorical label付きで保持。危険なactuatorは独立停止と個別許可・実機gateを持ち、UI stop/LLMだけへ依存させない。

**合格と依存。** 部品未所持の現状でも、型/contract/不正入力/遅延/付替え停止fence/同Core fixtureを閉じる。本人が部品を用意後、同じprogrammed boardを2実物へ移し、値の取得、目的→担当→実model→Android文章保存→元job停止、旧scopeからの再開拒否を実Pixelで確認。物理取り付け、firmware/profile、校正、Mini/Pro driverはEXTERNAL/JOINT依存で、部品購入/firmware download/flashをこのプロンプト保存から実行済みにしない。

<a id="smith-05"></a>
### SMITH-05 Add・共有・成果訂正と作者の循環（P03、P08）

**source。** `lib/sky-agent-share.ts`/`sky-agent-share-store.ts`、`app/api/sky/agent-shares/route.ts`、`components/sky-agent-share.tsx`、`components/sky-agent-library.tsx`、`lib/sky-agent-outcomes.ts`/`sky-agent-outcome-store.ts`、`app/api/sky/agent-outcomes/route.ts`、`components/sky-agent-outcomes.tsx`/`sky-agent-outcome-counts.tsx`、`components/sky-social-timeline.tsx`、既存community ACL/鍵付きOS設定を再利用。`smis-agent-shares.json`/`smis-agent-tool-loop.json`/`smis-agent-outcomes.json`の合成A/B/C/controlled modelと実人・実model・公開を分ける。

**小作業。** 作者Aが私用担当→共有preview→明示publish→版/hash/license/公開先固定。受領Bはmanifestと必要権限/料金をpreview→自分用の別設定としてdisabled add→本人のmodel/Tool/予算/実行先を選んで有効化。原作者share ID/version/digest/license/parent lineageだけを継承し、Aのsession/device/key/Tool grant/Wallet hold/会話/原稿/私有成果をコピーしない。開始時にBの同一jobへ実使用roleと元share版をfreezeし、後の作者改版を進行jobへ差替えない。

Bが実行・review・保存・停止した後、成果公開は別preview/別同意でopt-in。本人の会話/原資料/本文/内部jobID/threadID/鍵を公開postへ自動同梱しない。公開する説明・成果URL/ライセンス・元share lineageと、private-safeな利用回答/訂正/撤回を同じ既存storeで扱う。自己申告やURL一致を正確性・実人増加・作者売上へ変えない。無料CC BY4.0の現共有を有料licenseへ黙って変えない。作者報酬はP08の二者署名契約/source receipt/Invoice/入金/返金異議/受取先照合へ関連づけ、Add数/実行数から架空の払出しを発生させない。

**状態/失敗/移行。** private draft→share preview→published/keyed→added disabled→B review/ready→running→review/result→outcome opt-in→corrected/withdrawn。既存CAS・同commandID・同digestで応答消失を照合し、publish/add/回答を別IDで重複しない。community退会/鍵失効/原作者撤回/改版/失効/別owner/遅延GET/停止競合/本文改変/100件等上限超過を負例化。撤回と既に取得した許諾copyの効力は現行契約どおり説明し、遠隔削除を保証しない。元作者profile不在でも凍結済み由来を保ち、追加実行許可の有効性は現契約で再照合する。

**実受入。** 2人の実ownerが自分で認証・同意してA→share→B→Add→自分の権限/予算で実model又は明示した実Tool→普通の成果保存→同job停止→任意改善版のlineageまで同じbuildで確認。実人Bが未参加でもROCKの二owner fixture/HTTP/UIを進め、その依存のみ残す。AのsessionをB用に流用しない。作者KYC/税/送金、成長率・ネットワーク効果の向上は独立gate。

<a id="smith-06"></a>
### SMITH-06 音声待機と端末共通入口（P02/P10/P11）

Mini→Hey Eve→listening→依頼候補の本人確認→担当作成/既存担当選択→見積/権限確認→実行→結果/review→保存→Thanks Eve→指定job stop/receipt→standbyを共通Coreへ結ぶ。Thanks Eve認識だけでstop receiptを作らない。結果不明ならunknown/stoppingを表示し、次の物理jobを開始しない。通常offはwake待機、MIC OFF/完全電源断は別状態・明示操作。wake word/話者推定を本人認証/支払/生体vault/actuator許可へ昇格しない。

実PixelのASR/wake/音声出力の可否、network送信、mic indicator、consent、timeout、騒音/誤起動/別人声/重複認識、ロック時/圏外/低電力/停止中/再起動をテストする。ローカルASR未準備なら未対応を表示し、無断cloud fallbackや常時録音保存をしない。部品なしの手入力SMITH-02/SMITH-03は音声受入待ちで止めず先に完了。Mini/Proのマイク/電源/表示/driverは個別に実証し、同じ契約だから同じbinaryが起動するとはしない。

### 実在する検証入口（実装時に固定checkoutで実施。文書改訂時の結果は証拠JSON参照）

```sh
node --experimental-strip-types --test tests/smis-object-purpose.test.mjs tests/smis-module.test.mjs tests/smis-visual-input.test.mjs tests/sky-object-attachment.test.mjs tests/eve-os-interaction.test.mjs tests/eve-purpose-runtime-work-port.test.mjs tests/eve-runtime-work-port.test.mjs tests/eve-runtime-export.test.mjs
node --experimental-strip-types --test tests/smis-eve-workbench.test.mjs tests/smis-community-navigation-ui.test.mjs tests/sky-agent-shares.test.mjs tests/sky-agent-outcomes.test.mjs tests/community-os.test.mjs tests/community-key-client.test.mjs tests/eve-library-runtime-work-port.test.mjs
npm --prefix packages/rockstaros-runtime run build
npm --prefix packages/rockstaros-runtime test
npm run build
node --experimental-strip-types scripts/check-sky-agent-shares-api.mjs
npm run typecheck
npm run lint:product
npm run sky:check
npm run device-support:check
npm run design:check
npm run baseline:check
```

これらは存在する入口。Source checkoutによって一部test/moduleが未統合ならP13で統合してから実行し、無いtestをskip成功へ変えない。shared Worker scriptは合成owner/control model/HTTP-D1であり実model/実Pixelではない。現在のtoolchain制約（Node/OpenSSL/workerd/localhost permission）は既存正常runtimeを調べて整え、未知binary/依存の無断取得を成功条件に混ぜない。局所試験後に同一artifactの `npm run verify`。表示/導線変更は実UIを操作し、Pixelファイル出力/停止/再起動は実機側から独立読戻しする。

### Smithの納品・証拠・未決条件

各S項目は、source diff・固定commit又はscope hash・schema/contract版・同意/入力の非秘密hash・owner識別の匿名化・job/role/model pin・test command/exitcode・実UI/実model/実機の別判定・失敗の原因/復旧・未決担当を既存evidence系列へ残す。スクリーンショットだけで保存・停止・課金を証明しない。各確認後にproject.md/進捗JSONとdesign index/全体/Tool正本を同期し、README更新を同じ変更へ含める。Root保存/Source commit/GitHub push/main/公開/実機を別欄にする。

未決は、実ownerB参加、部品/firmware/校正の実適合、日本語ASR/wake、Mini/ProのBSP/driver/電源・独立停止、共有license/作者契約、運営feedの供給権限、実料金/Provider、機微対象者同意、実物操作の安全条件。これらを合成fixture・本文同意・購入/署名/実行の各gateへ分ける。未決外部依存を理由に独立ROCK設計/ソフト/負例試験を止めず、本物の証拠が必要な段階だけ保留する。

## 元P01〜P13から落としてはいけない条件（改訂全体への照合用）

- **P01** 現在のPixel非破壊preflight、Startエラー本文/診断、active/unknown job・既存state/鍵/modelの保全、同一guest復旧。15:09/20:56は過去、初期化・bootloader解除・再pairingを自動手順にしない。
- **P02** 正式Smithと目的/不足/同じ担当、新Agent同版登録、同owner Web/Pixel実model・両成果・Android独立保存・同job停止/再起動。部品なし手入力から先に実一周。後発Eve Remix/mediaを旧v118受入へ加算しない。
- **P03** 別実owner・ACL/鍵付きcommunity・disabled Add・別権限/予算・immutable版/ライセンス・opt-in成果/改善/撤回。共有role≠Tool grant、A private dataをBへ複写しない。
- **P04** Xログイン表示と実feed受信は別。認可API/MCP、For You供給権限/取得範囲、TTL/rate/cap・更新/停止/失効・private feed/ACL、任意URLproxy不可、post本文非信頼。実供給元未定でもdoctor/parser/fixtureを進める。
- **P05** Pixel GL066/frankel fullOS build/署名/boot/OTA/rollback/純正復帰/Keystore全損、専用x86_64 Linux予算、RQ12 QEMU Developer Preview独立維持。APK/PWA/fixtureの合格転用なし。
- **P06** eSIM真正issuer/回線/SIM profile/本人サービス権/OS-client導入状態の分離、同workspace・serviceStartAt条件・子端末key・失効/offline lease/同データ復帰。共通Core受入後でfull flashを全サービスの先行条件に戻さない。
- **P07** 16USD/account月額1行、合意版/起算・meter枠/超過/税/通貨/timezone、原子予約/実測/unknown保持、一意Invoice/入金/返金異議/未払制限/同workspace復帰。Sky140USD Sandbox/通信/実費/OSS/BYOK/旧Wallet/ATM0と分離。
- **P08** 二者署名作者契約・原始receipt/sourceの一意binding、実回収原資・現在受取先・KYC税・分配凍結/返金reversal/再開。合成paid/status/実行数/作品棚保存を払出しへ昇格しない。
- **P09** Security owner/SYS01/SYS13/OS05/OS10とCORE05/06をplanにも同期。既存historyはserver-managed AES-GCMでE2EE=false、session Keystoreはfresh per-use biometric-bound鍵ではない。raw認証templateと健康vaultを区別。用途別同意/保持/削除/export、端末失効/鍵rotation、全損/旧snapshot復元/tombstone、独立審査・侵入試験。raw生体/原稿はfixtureへ使わない。
- **P10** Mini少数表示部/低眩しさ/全範囲の未解決光学・独立停止・最終PCB、Pro localStorage previewとaccount/job/runtime未接続・製作/販売gateを保持。SMITH-04三方式/音声待機/共通Coreと機種別driverを実装対象へ。native同一binaryの全機種対応を仮定しない。
- **P11** 操作時間/成功率/復旧時間、p50/p95/失敗・品質・電池/温度/資源を条件固定実測。モデル評価95基準未達、Mac GPU smokeを汎用品質/多数Agent/常時稼働へ変えない。GPU未契約/重み未学習を明記。性能改善/収益/需要/独占/特許を未実測で宣言しない。
- **P12** 840/900分の原ZIP39研究+PACK-STATUS・SHAを不変保全。過去900分最終稿は未回収。最終稿/台帳/A〜M内容/中断・無記録9h22mを独立照合。後から60分/監査時間を足して過去完了にしない。再研究は新session/出典日付/実時間/反証・採否の別版。P01〜11/P13は回収待ちで止めない。
- **P13** main/branch/Source/Root dirty/公開/CIの同SHAを再読し引継ぎ順を最初に同期。全13項目/全域task/新Eve編集source/Smith表示/source hash更新をcoverage JSONへ反映。force/reset/stashで他者差分を消さない。保存/commit/push/main/公開/実機を分離。

**13P外でも維持する横断境界。** 予測市場/ゲーム資産売買は検討のみで実行許可なし。RQ13交換はATMと別adapter/同意/試験、ゲーム/方向/レート未定で本番無効・既存Wallet二重使用防止。RQ14の非金融Game/作者SDK/API/sandbox/動くsample/導入診断は金融/fullOS待ちで止めず、作者ポイント発行権と実資金記帳権を分ける。RQ15 ATMのRock徴収手数料0をゲーム手数料0へ読み替えない。DAO/IP/NFT/Worldは権利/報酬設計であり実権利処理/送金完成でない。生体作用/精神支配/対象者無同意の観測をSmithの接続目標から導かない。第三者署名は作者同一性であり安全保証でない。公開CSPはv116既知FAIL、v118/現配信responseで修正証拠が必要。一般ローンチ保留・本人localhost Lab非公開・正式3domain綴りを維持する。

<a id="eve-os-detail"></a>
## Eve・OSの詳細実装章（既存P01〜P13の具体化）

この章は統合プロンプトを詳しくするための指示書であり、作成時に実装・実model・実機・学習・有料契約・commit/push・公開を実行していない。既存`docs/prompts/rockstaros-remaining-work-development.md`と`data/rockstaros-remaining-work-plan.json`のP01〜P13を置換・縮小せず、以下の具体的な不足と合格条件を対応する節へ追加する。

正式表示は**Smith**（旧Sky／smis）。EveはLLMの製品名で、その画面が会話・目的・担当作成・実行依頼・進捗・承認・停止・成果・usageを扱う。内部の`sky`/`smis` API、header、scope、保存key、schema、anchor、元証拠の名前は互換のため残す。共通の本人・契約・権限・仕事・保存/復旧・料金をRockstarOS Coreへ置き、Linux/host/executor/outputは端末能力で差し替える。全端末へ同一flash imageを適用する指示ではない。

### E00 開始時に保持する現在地とP13への依存（EVE-01）

**対応**：P13を入口としP01/P02/P03/P05/P07〜P12へ接続。既存taskはOS10/OS11/OS09/DSP01/RLS02、WEB04/HOME01/SKY21、AI02/AI05、SYS01/SYS13、BIL02を使い、RQ01〜RQ49と後続本人指示を保持する。main側RQ50の有無・現行名称・優先度の同期はP13担当に依存する。ROCKの局所実装は外部契約待ちで止めない。

着手時に次をread-onlyで再取得し、`checkout→branch→HEAD→dirty対象→source入力hash→build inventory→deployment→機種/実行環境→証拠`の対応を小さなcandidate台帳にする。共有Rootをreset/stash/全面置換しない。同じturn IDの継承チャットを新しい実績として重複計上しない。

1. Root `/Users/kaiya/Documents/ChatGPT/avokdo`は今回監査でHEAD`951d82d5a491a284aed4e0d4d280171d835d4b43`、新しい共通runtimeとRemix/mediaの多くが未追跡。古いHEADの日付を「以後の実装なし」と読み替えず、未commit差分をP13の統合対象へ渡す。P13担当のfresh読戻しではmain`7304e449…`にservice attachment/setup/cloud-monthly storeが既存で、Root HEADに無いことをmain未実装と判断しない。main baseline2.08/RQ50/393taskとRoot1.123/RQ49/165task、main workflow blobとRoot HEADの差を片側schema置換で消さず、既存機能を比較して再利用する。
2. `work/eve-v115-agent-integration`は別Git repositoryのSource候補、HEAD`3f6075f7190be778f0a8b4d243a087d6f99081b9`。元eveで実Tool/有限修正/停止・履歴/復旧/model評価/請求観測がローカルcommitに保存されている。originはローカル`work/eve-v115-live-source`でGitHubではなく、ローカル保存をpush/main統合/配備へ昇格しない。Rootとの運搬方法・変更選別・commit/main/同SHA CIはP13担当の章へ従う。
3. 公開v118の過去証拠は`docs/evidence/eve-smis-execution-loop.json`。source`d26363bd7f4a37501db6ba2061728b80351bf776`、archive SHA256`3469b2f4b8fda4d9cbceef7cbb7ab45a0106786f23ce2deaf58fe50cae49181c`。HTTP/参照71assetの一致と合成169 assertionsまでで、新Agentの実browser/実Pixel/model/両client成果受領は未受入。統合担当が改訂中にSites metadataを読戻しlatest118/activeを確認。今回HTTP/UIを再試験した証拠ではなく、実行時も同一candidateを読戻す。
4. Pixelの既存GrapheneOS/試験署名APK/AVF Linuxと、機種専用full native image、旧QEMU Developer Previewを分ける。旧v94同期・独立password2実行・v113既存Agent実0.5B・v115実停止/再起動の限定合格は保持し、新Agent/media/全OS合格へ転用しない。
5. 後発`eve (2)`は2026-10-23 19:57〜20:44 ET開始の新ターンでactual browserのRemix/mediaを確認している。元`eve`最終06:57 ETの`native pipe closed`を現在の全UI不通と固定しない。今回最新2ターンの追加取得は初回tool error、1回再試行で成功し、20:44 ET開始ターンの写真/動画/音楽編集保存・デザイン改善と内蔵4操作の最終回答が引き続き最新だった。Pixel/nativeの現在状態は別に再測定する。

新Remix/mediaはRootの`lib/eve-remix.ts`、`lib/eve-media-edit.ts`、`lib/eve-media-app.ts`、`components/eve-remix-workspace.tsx`、`eve-remix-stage.tsx`、`eve-media-studio.tsx`、`smis-agent-remix.tsx`、`app/os/eve/remix/page.tsx`。Source3f6075fには未収録。現在は文章が直接`/api/llm/text`とmemory草稿、mediaがbrowser IndexedDB作品棚であり、共通WorkJob/Artifact/usage/停止/復旧への統合が不足する。現Remixの直接文章呼出は600token上限、既存Pixel owner textは256token/120秒の別契約で、片方を黙って他方へ適用しない。用途/実行先/資源/費用を照合したjob recipeと、正確なcap/deadlineを本人へ示して統合する。

**証拠の扱い**：`docs/evidence/eve-media-studio.json`の4出力fileは今回hash一致、本体4入力も一致したがtest1入力は変更済み。旧`eve-remix-mini-ui.json`はUI等6入力が後続変更済み。旧hashを新UI合格として使わず、選別後の同candidateで再検証する。raw原稿、秘密鍵、credential、録音、生frame、端末serialは台帳/Git/公開fixtureへ入れない。

### E01 共通WorkJob・Artifact・承認・usageへRemixを結合する（EVE-02 / EVE-03）

**対応**：主P02、P03/P07/P08/P09/P10/P13に依存。ROCKがschema/状態/adapter、JOINTが同候補のclient・host受入、OWNERが素材・目的・操作・保存/共有を確認。既存`lib/workflow.ts`、`lib/work-composition.ts`、`lib/work-composition-executor.ts`、`lib/eve-tool-work.ts`、`lib/eve-agent-work.ts`、`lib/eve-history.ts`、`lib/sky-agent-library.ts`、`lib/sky-owner-export.server.ts`、既存WorkJobs API/owner別storeを先に読む。

#### 契約の追加差分を先に定義する（EVE-02：仕事同一性／EVE-03：型付き成果転送）

以下のfield集合は**到達契約の提案**であり、現在そのschema/APIが全て存在するという宣言ではない。既存WorkJob/DB/APIとの差分表を作ってから、互換reader/厳密parser/必要最小限migrationへ落とす。新しい顧客・Agent・仕事・課金台帳を並行作成しない。

- ownerは認証sessionから権威側で決定し、body/self-report/ファイル名から採らない。DBのowner分離とWorkJob内の`id/threadId/revision`を結び、thread削除/失効・owner切替を前後で再照合する。
- requestは`jobId/revision/commandId/attemptId`、目的と検収条件、素材参照と原本hash、Agent ID/revision/role digest、model profile ID/version/hash/scheme、executor/device/adapter版、許可scope/送信先/期限、quote・料金版・上限/予約参照を固定する。canonical digestに含むfieldと順序をcontractで固定し、見た目の名前だけで同一判定しない。
- material manifestは本文ではなく`materialId/ownerScope/contentHash/byteLength/validatedMediaType/formatVersion/provenance/originalRef/rightsAndConsentRef`を基本にする。依頼で使う部分だけを選び、原本はimmutable、作業copyと派生成果は別ID/parent refsで保持する。用途/保持/共有同意は素材の所有と別に検査する。
- output manifestは`artifactId/jobId/attemptId/sourceManifestHash/operationAndVersion/executorRef/modelRef(optional)/contentHash/byteLength/mediaType/formatMetadata/verification/createdAt/retentionScope`を持つ型付き参照とする。`blob:`URL、IndexedDBのrow、任意外部URI、clientの成功申告をserverの成果証明へ変換しない。
- media bytesは既存成果保管の認可境界を調べて格納し、WorkJobには参照/小さいmetadataだけを置く。現在`workflow.ts`のcomposition inline成果合計には100KB上限があり、`lib/a2a-artifacts.ts`はbinary/URIを意図的に省略する。巨大base64をこれらへ詰めたり、無断fetchで補ったりしない。binary対応に必要な所有者認可・size/type/hash・一回import・暗号化/保持・quota・中断復旧を、既存storeへの明示的な転送contractとして設計し受け入れる。
- metadata digestを示す承認と、実際の入力/出力byteの整合を分ける。保存/編集/再実行/共有/外部送信/課金の承認を一つのboolへ潰さず、見せた正確な対象・用途・scope・料金版・期限に束縛する。

#### 状態と実行アルゴリズム（EVE-02）

1. 素材選択/重ねる操作は副作用なしのdraft更新だけ。2〜4文章素材/合計8000字、目的500字等の現制限とmediaの現制限を維持し、上限変更は実測/資源契約を伴うversion変更へする。
2. レビュー済みrequestを正本へCAS保存し、同owner/job/commandとdigestを一意にする。同ID・同digestの再送は保存結果を返し、異digestは409。保存できないときmodel/Tool/encodeを開始しない。
3. 実行直前に本人/利用権/Agent・model版/実capability/資料scope/料金上限/停止世代を再照合する。Effect単位の一意claimとlease/fencingを原子的に取得し、旧workerと並行clientの二重開始を拒否する。quote/予約はP07の既存原子判定へ接続する。
4. `lib/workflow.ts`の`active/review/completed/cancelled`を正本にし、UIの`disabled/standby/listening/review/creating/running/result/stopping/unknown`は射影として扱う。転送/encode/保存の状態は既存jobのoperation/attemptに持ち、独立した並行job engineを作らない。runner成功→機械検査→review→本人検収後completedを守る。
5. 成果bytesの存在/size/hash、metadata/parserによる形式・寸法・時間、素材の固定hash、出力上限、必要な検収条件を独立に確認してからmanifestをcommitする。upload途中やDB失敗のblobは未commitとして隔離し、resume/清掃もowner/job/attemptを照合する。検査前のclient`passed`をTool実成功として受け入れない。
6. 成果確定とusage観測の保存を同じjob/sourceへ結ぶ。local計算0円という観測は通信・機器・電気代の0ではなく、Cloudの未報告usageはnull/未照合。mediaをmodel tokenへ架空換算せず、既存meterへ対応する資源だけ別表示する。Provider未照合と顧客収納/作者受取を分ける。
7. read/resumeはGETと同ID照合だけで再実行しない。再編集/新目的/別model/別executorは元の成果を保持し、新revision又は本人が確認した別jobとして記録する。別clientから同じjobを見ることと、同Agentで別の依頼を実行することを区別する。

**失敗/復旧**：401再認証、409最新revision再読、413資源拒否、権限/版/素材変更は再レビュー、timeout/5xx/切断はunknownを保持。encode abort→cancelled表示だけで外部操作停止やusage解放を確定しない。browser reload/IndexedDB quota/閉鎖/復元中断/部分upload/重複callback/遅延結果/削除済みthreadを負例にする。旧原本/旧成果を消して成功を演出しない。

**合格**：同ownerの文章とmedia各1件が同じ仕事契約で作成/レビュー/実行/成果検査/保存/export/別client読戻し/停止・復旧まで説明できる。公開や物理端末未受入の段階ではhost/API/UIだけの合格を別記録する。schema拡張時に旧job/旧reader/旧export/既存料金の互換を検証する。

### E02 文章・Agent・mediaの掛け合わせを実処理と使いやすさへ仕上げる（EVE-04〜EVE-07）

**対応**：P02/P03/P10/P11。ユーザーの最新要求は「素材をスライドして重ね、目的を伝え、より良いものを編集し保存」「MiniとComputer Useを考慮」「わかりやすい可視化/デザイン」。固定用途の選択を必須にして用途を縮小しない一方、未対応処理を黙って文章生成へ置換しない。

1. `lib/eve-remix.ts`のpromptは非信頼の素材JSONと目的を分離する。単なる連結ではなく共通点/補完/矛盾/不足と出所を出せる検収rubricを定義する。資料内命令/URL/codeを本人指示にしない。生成本文・model label/digest・不完全応答/usageを記録し、出力上限到達を完成と呼ばない。
2. Agent合成は元2Agentのowner/ID/revision/role/model/利用状態を正本から再読する。現`remixAgentSettings`は一方のprovider/modelを使う実装なので、採用modelと送信/費用をレビューで明示し、違うmodelを黙って統合しない。元Agentを変えず、新Agent IDとlineage/元revision/本人確認済みroleを既存libraryへ保存する。Tool scope/credential/有料権限を文章の合成で継承しない。別ownerのAgent参照はP03の共有/作者契約条件を通す。
3. mediaは現4操作`photo-layer/audio-mix/video-sequence/video-soundtrack`を、版付き入力schemaを持つ限定アプリadapterとして登録する。写真100MiB/40MP、出力最大辺2048、音声1本60秒、動画realtime最大60秒、mix比0〜1等の現制限はschema/実行側の両方で検査する。MIME宣言だけを信じずdecoder/parserの実結果、過大展開、壊れたheader/track、duration不明を拒否又は未確認とする。
4. 写真はlayer/位置/scale/alpha/出力寸法、音声はsample rate/channel/duration/gain/clipping、動画はclip順序/trim/frame size/audio合成/codec/container/durationを明示した操作候補へ変換する。自由文から候補生成を追加しても、unknown operation/任意code/越権pathはparserで拒否し、表示した編集recipeを本人が確認するまで実行しない。
5. 原本→作業copy→preview→検査→保存を見える形にする。dragと同等のbutton/keyboard/名前付きcomputer-use操作を用意し、touch/狭幅/reduced-motion/フォーカス/読み上げ、undo/redo、選択解除/素材差替え、取消、進捗、失敗理由を確認する。Mini空間の指/声をpointer eventsへ直結せず、P10が確認したscene/対象/座標/時刻/本人scopeから同じintentへ変換する。
6. 現IndexedDB`eve-media-studio`のowner prefixはbrowser内分離の一部であってserver認可/E2EE/cross-device永続化の証拠ではない。旧local作品を壊さないreader/exportを先に作り、本人の明示選択とbytehashを確認して共通保管へ一回importする。自動で全作品/素材をCloud uploadしない。account切替/失効時は旧preview/URL/reload応答を破棄し、元作品を別ownerへ表示しない。
7. preview生成と最終fileのbyte内容を照合する。PNG寸法/pixel fixture、WAV frame/channel/周波数、WebM scene順/track/音声/durationを独立parser/ffprobe等で検査する。`webmWithDuration`はheader修正の限定処理であり全container一般修復へ広げず、不正長/境界/unknown要素/既存durationのテストを持つ。

**固定unitの内訳**：EVE-04＝非信頼文章素材からの草稿と出所、EVE-05＝Agent版・lineage・新私用保存、EVE-06＝media4操作のschema/adapter/byte検査、EVE-07＝可視化・drag代替操作・Mini入力intent/旧local作品の保全。

**既存fixtureの保持**：`docs/evidence/eve-media-studio.json`にはPNG640×480、WAV3秒440Hz+660Hz、2場面動画、VP8+Opus/2秒のsoundtrack出力がある。first sequence fixtureはduration修正前であることを保持する。新candidateのmedia/Source入力hash、browser/server版、生成と保存の実経路、出力bytes/hash、cancel/reload結果を記録する。旧4出力が現存することだけで新schema/別hardwareの完成にしない。

### E03 LLM評価・model profile・GPU・weightsと学習を分けて開発する（EVE-08 / EVE-09）

**対応**：P02/P07/P09/P11/P12/P13、SI02/SI07。`docs/llm-evaluation-architecture.md`と`data/llm-capabilities.json`、既存ModelProfileとAI02 stager、`lib/ollama-model-inventory.ts`、Source側の`work/eve-v115-agent-integration/lib/sky-model-selection.ts`、`lib/sky-model-selector.ts`、`lib/eve-planner-inference.ts`、`lib/eve-planner-state.ts`を対象checkoutごとに確認する。同名fileのRoot/Source差分をP13から受け取り、Source専用の選定処理をRootに既存と誤認しない。存在しないscriptやAPIを推測しない。

#### 候補選択と評価のアルゴリズム（EVE-08）

1. model artifact/revision/full hash/tokenizer/template/quantization/runtime/必要RAM・storage/license/出所をprofileへ固定し、GGUF hashとOllama manifest digestを別schemeとして比較する。モデル名・一覧表示・download完了・health成功・job品質・実機適合を別状態にする。weightsをportable runtime同梱済みとしない。
2. 候補は本人のallowlist、利用可能capability、正確なprofile、用途/許可送信先、RAM/storage/熱、見積/残枠/上限で先に絞る。対応なしは停止し、勝手に別provider/Cloud/modelへ切り替えない。手動指定を未承認の自動推薦で置換しない。
3. 評価suite/version/課題/採点rubric・合格閾値/実行条件/失敗扱い/sample数を事前固定する。schema適合と内容品質、Tool選択/承認識別、根拠、越権、速度・peak RAM/電力/費用、停止/unknownを別採点し、modelが返す点数やmetadataで加点しない。自己申告性能を実仕事成功へ換算しない。
4. `work/eve-v115-agent-integration/docs/evidence/eve-evaluation-v4-real-comparison.json`は3課題×2model=6呼出、qwen2.5:1.5b33.3/qwen3:4b0で95点未達・selected=false。v4採点修正`21321b1`、実測保存`c1f85f9`を保持する。前版55.6点等を現版の成功へ転用せず、弱い基準へ変更して採用しない。
5. 評価の開始/attempt/結果/usage/停止を既存WorkJob/暗号化履歴に保存し、同ID再送は追加推論しない。回答本文未取得、HTTP失敗、思考出力だけでtoken cap到達、不正JSON/余分field、途中応答、model版変更はそれぞれ記録。未完了本文を不採用のまま、報告済みusageだけ保持し、未報告を0へしない。
6. 実測結果のowner/profile/suite/時刻/入力hashを再照合して候補にし、TTL/版変更/評価取消で再評価へ戻す。推薦は候補案であってdispatch権限ではない。実行直前にBrokerが本人/quote/権限/同model pinを再検査する。

#### GPUと学習の開発境界（EVE-09）

既存Mac benchmarkは`/Users/kaiya/Documents/ChatGPT/出願　princeton/outputs/eve-local-benchmark/`のREADME/JSON/scriptにある。M4/16GB/内蔵GPUで小型model実行は観測されたが、qwen3はfinal answerなしのtoken上限、qwen2.5は予算計算と未承認送信で誤答した。GPUレンタル/購入/自社weights/学習・Eve実行系接続/常時稼働は未実施。別workspaceのbenchmarkをRoot/Source本体の合格やproduction capacityにしない。過去のGPU月額案を現在の見積りとして再掲しない。

学習準備はGPU未契約でもROCKで進める。用途を型付きplan/Tool候補等へ限定し、許諾/出所/保持/削除/個人情報区分/重複除去/派生条件を持つdataset manifest、train/validation/非公開test分離、各データの目的同意、評価suiteとbaseline、再現seed/config/dependency/hardware、artifact hash、rollback/失効を設計する。既存会話/原稿/共有素材/生体・健康データ/Tool receiptを既定で学習集合へ投入しない。newsの学習準備は`lib/eve-news-learning.ts`と既存同意UIに接続し、資料収集/権利確認/保存と実trainingを分ける。

公開基盤の追加学習/継続事前学習/一からのweightsを、データ量・権利・再現性・保守・必要計算機/予算と同条件品質で比較する。必要なmodel/データ取得/GPU契約/学習開始は具体的なsource/license/容量/費用上限/実行先/停止/成果保管を揃え、既存の明示許可を確かめた最後に不足だけ判断する。GPUを借りただけでEve完成としない。新weightsは登録→隔離評価→契約/compatibility→shadow又は限定job→対象device試験→明示切替とし、旧job pinと旧成果readerを保つ。未受入ならmodel候補に留め、固定recipeと停止/履歴はmodel不在でも動くようにする。

### E04 非信頼plan・既存Tool・有限repair・外部アプリComputer Use（EVE-10〜EVE-12）

**対応**：P02/P03/P09/P10/P11、SI01〜SI05/SI08。既存`lib/eve-plan-candidate.ts`、`lib/eve-planner-state.ts`、`lib/eve-tool-work.ts`、`lib/eve-agent-work.ts`、`lib/eve-agent-repair.ts`、`lib/work-composition.ts`、`lib/work-composition-executor.ts`、`lib/eve-tool-agent.ts`、既存Broker/Tool catalog/Package contractを使う。

1. `eve.plan-candidate/1`はjobId/objective/sourceSha256/nodes/unknowns/stopReasonを厳密に照合する。現候補上限16000文字、planner最大2attempt、composition1〜12nodeの有限制約を把握する。unknown field/存在しないTool/循環/未充足依存/型不一致/素材外個人情報/scope昇格/予算変更を拒否。入力/Agent/外部Web/他model結果は非信頼dataで、root/system指示として扱わない。
2. 採用planのdigest/検収条件/予算/許可scopeをjobへ保存し、各step前に元source/plan/権限/lease/stop generationを再読する。既に成功したstep artifactはhashと入力が一致すれば再利用し、再送で外部作用を繰り返さない。完了状態/receiptをmodelの文章から生成しない。
3. 現引用recipeは実`mr-citations`→独立URL集合保持検査→`compose-check`→本人検収。URL保持検査は内容の真偽・信頼性・出典の権利を証明しない。vendor/mr固定原本/hashは変更せず、adapter変更後は既存`python3 scripts/package-mr.py`を再生成する。
4. repairはpendingFailureの元step/code、失敗artifact/plan、attempt数、検収条件と予算を固定して行う。現限定repair（冗長な結合を除く等）と汎用再計画を区別し、修正対象以外の成功成果/上限/必須条件を保持する。検収条件を下げるrepair、未知の外部作用を再送するrepair、無限model loopを拒否する。上限/期限/非修正可失敗はneeds-review/unknown又は停止へ戻す。
5. 独立Agentは作者/Package版/署名/許可Tool/返却schema/短期grant/資源上限を検証し、親job/元delegation/receiptを保持する。Agent文面の合成や作者署名だけを安全性/権限保証としない。失効後の新作用を止め、進行中/既送信の取消結果は元Providerへ照合する。
6. 外部アプリCUは現在の内蔵media操作と別adapter。対象app/版/OS権限/許可window・file範囲、操作intent、期待前後条件、入力/preview/output、時間/step/費用上限をmanifestで宣言する。低level任意shell/root/任意URLクリックを共通APIにしない。scope付きapp操作から一つのbounded作業を選び、原本保全・copy編集・検査・保存・停止から実証する。
7. screenshot/accessibility/座標は観測であり本人承認ではない。認証画面/支払い/公開/外部送信/削除/権限増分は正確な内容digestと対象の既存承認へ戻す。途中でforeground app/window/owner/fileが変われば停止し、誤対象へ続けない。UIが不明ならunknownのまま人へ戻し、推測clickで完了させない。
8. CUのクリック受理、アプリ上の保存、実file存在、成果検査、本人検収、外部到達を別状態にする。OSプロセス終了/画面中断/再起動後は元operationから現状態を再照合し、undoの可否と既に起きた作用を表示する。Mini入力はP10の校正済み対象選択adapterが生成する同intentを使い、別履歴/別予算を作らない。

**固定unitの内訳**：EVE-10＝非信頼plan検証と各step前のBroker再照合、EVE-11＝独立Tool検査と既存有限repair/Agent delegation、EVE-12＝限定外部アプリComputer Use。

**負例**：偽Tool/版・prompt injection・LLMの成功偽装・原本変更race・権限失効直後・停止後遅延model応答・二executor claim・同ID異入力・renderer後のbyte差替え・window切替・permission拒否・output過大・部分保存を試験する。model停止と使用量回収、app停止と外部送信取消、UI abortと実engine停止を分離する。

### E05 Stop・unknown・同ID復旧を全入口へ統一する（EVE-13）

**対応**：P01/P02/P05/P07/P09/P10/P13、SI04/SI05。既存`lib/rockstar-eve-interaction.ts`、`lib/eve-runtime-work-port.ts`、`lib/eve-runtime-sync.ts`、`lib/eve-runtime-recovery.ts`、`lib/eve-runtime-history-control.ts`、`scripts/pixel-runtime-stop-journal.mjs`、`toolkits/sky-linux-local/common-ui-src/EvePortableStopHandles.java`とprotected journalを再利用する。

入力はowner/thread/job/device/Agent/model/元request digest/claim/stop generation、出力は原始receiptと保存済み成果/unknown。stop intentを正本へ永続保存してから新claim/新effectをfenceし、executorの実停止receiptまでunknown/stoppingを保持する。未配送の最初の要求と、以前存在した仕事がserver rollbackで消えたケースを分ける。

- 新Coreは既知仕事の`knownExisting:true`をpendingへ保存し、adapterへ元5fieldだけを渡し、`stopExisting`経路で照合する。既知server行の404は「最初から存在しなかった」ではない。handleを消したりfirst-delivery fenceでstoppedへ変更しない。未対応adapter、storage不良、破損marker、古いclientをunknownへ戻す。
- start応答喪失時も同IDをqueryし、新ID作成で回避しない。同ID同内容のstatus/readは再推論0、同ID異内容は競合拒否。claim済みjobは元host receiptを待ち、別deviceへ停止証明を代行させない。
- clientの同期停止/画面close/Thanks Eve/完全電源OFFは別。Thanks Eveは会話の対象job停止照合を指し、background処理終了やMIC OFFを勝手に意味させない。録音/ASR認識を本人承認へ昇格しない。
- offline保存/backup復元はownerとschema/key version/manifest/inventory/削除tombstone/stop epoch/利用権epochを照合する。終了済みjobのsnapshot復元合格を稼働中snapshotや全service復旧へ広げない。
- `EVE_RUNTIME_RECOVERY_MODE=paused`は運用者が外部設定する限定guard。全入口/cron/queueを閉じ、auth/鍵/削除/Wallet/A2A/予算を別照合してから解除する。自動rollback検知/自動unpauseを実装済みとしない。復旧後の旧writer/失効device/古いreceiptを拒否し、未確定予約を一括解放しない。

**合格**：Core・browser・native・portable SDK・guest adapterで同じ状態fixtureが一致し、read-only再開/50件履歴page/旧model成果export/元host停止・再起動が同IDで成立する。旧5field由来不明/旧client6field/全DB消失/失敗したstorage upgradeとserver喪失の複合は既存未受入を保持し、独立したmigration/recovery試験で閉じる。結果不明は実績0/0円/停止済みへ置換しない。

### O01 Pixel現在診断と最新Eve/Smith実一周（OS-01 / EVE-14）

**対応**：P01/P02/P11。`docs/evidence/eve-smis-execution-loop.json:lastDeviceObservation`の2026-10-23 15:09 ETは過去観測。VM0/Terminal Start error/空き23GiB/既存account状態を現在の事実へ転用しない。`docs/evidence/pixel-durable-stops.json:androidOsRestart`の古いsocket残存修正と今のStart errorの同原因は未知。

現在の機種/build/APK/Terminal/guest版、lock、VM/tap/限定port/bridge、active/unknown job、鍵/モデル/Agent数をread-onlyで再測定する。正確なStart error本文/時刻を取得し、download/install/容量/AVF/guest service/tap/mTLS/private socket/account syncの最初の失敗点へ分解する。reset/data clear/guest再初期化/key再生成/新account/未知model downloadを診断策にしない。本人UI操作/実機ができなければsource/host負例を続け、実機を未受入として残す。

保護更新は`toolkits/sky-linux-local/README.md`と既存`update-pixel.py`/manifest/transactionを再利用し、zero activeだけでUNKNOWNがないとは見なさず、元state/model/key hash・署名・ABI・rollback候補を確認する。固定code fileだけ更新し、途中切断は同transaction recoverで再開。DB/weights/keysをbackupで上書きしない。

P02は同candidateのWeb制作→私用Smith保存→同Agent ID/revision登録→exact model pin/presence→実推論→Web/Pixel両成果→独立UTF-8 export/hash→同job stop receipt→reload/resumeを実UIで受け入れる。既存256token local text/外部Tool0/自動Cloud0を最初の小さい一周に使い、後にRemix/media/外部CUを各gateで加える。二clientで同じjobを読む試験と、同Agentで本人が明示した別依頼2件の試験を区別し、同IDを二回実行しない。現在の一般サービス入口はSmithで、API/証拠のsmis表記は互換履歴。

### O02 OS・端末基盤の15要求を実装と否定試験へ分解する（OS-02〜OS-16）

**対応**：P05を主にP01/P02/P06/P09/P10/P11/P13、既存OS02〜OS04/OS09〜OS11/DSP01/RLS02、RQ12/RQ16/RQ17/RQ27/RQ29/RQ30/RQ31/RQ41/RQ42/RQ43/RQ44/RQ48。詳細入口は`docs/prompts/rockstaros-os-device-foundation-development.md`、`docs/device-support-architecture.md`、`contracts/device-capability-snapshot.json`、`contracts/rockstaros-portable-runtime.json`、`contracts/platform-api.json`、`contracts/local-ai-runtime.json`、`android/`、`systems/rock-star-os/`。

以下15項目を`要求→現source/不足→contract差分→実装→host/fixture→実環境→同artifact受入`で管理する。capability観測・実装存在・同機種実測・productionを別fieldにする。

1. **OS-02 機種・OS・能力identity**：exact manufacturer/model/SKU/codename/build/API/firmware/adapter版、観測時刻/期限/出所を取得する。device-capability v3はOS申告でhardware attestationではない。30秒最大有効のadapter観測、true/false/unknownとmissingを保ち、将来時刻/期限切れ/改ざん/同名別deviceを拒否する。
2. **OS-03 導入適合とDSP**：native DSP manifestにexact SKU/boot chain/kernel/vendor/firmware/partition/AVB/driver/更新/復旧と署名者/version/受入証拠を結ぶ。client/browser/firmware bridge/native imageを別delivery modeへ分岐。非対応/不明/別SKU/失効manifestでflash導線を閉じ、eSIM利用権をnative互換証拠へ昇格しない。
3. **OS-04 component本人性**：app/ToolのUID、作者署名、package ID/version、API/manifest、実付与permissionを導入時と実行直前に照合。署名/UID置換、downgrade、再install、権限増分、失効署名を負例にし、作者署名を安全性保証としない。
4. **OS-05 隔離とBroker**：Android UID/SELinux/Binder caller、Linux UID/namespace/seccomp/cgroupとowner/job grantを結ぶ。第三者ToolをOS platform鍵で署名しない。別owner/job、guest root、古いlease、stopped grant、metadata/loopback/SSRF、任意file/root/shellを拒否し、実環境の隔離が失敗すれば実行不可にする。
5. **OS-06 Linux lifecycle**：対応端末のguest/image/runtimeのversion/hash/ownerを記録し、create/start/ready/stop/restart/failed/unknownを実service状態に対応。Android Terminal/AVFと管理Cloud Linuxを分離し、VM CID/portを恒久identityや本人承認にしない。idleと稼働中の異常終了を別試験にする。
6. **OS-07 resource limits**：CPU時間/CPU quota、memory/RAM、disk/一時file、wall deadline、出力byte/token、process数/並列数、network scope/最大転送を実行前に固定しhost側で強制する。観測値の表示だけでquota実装済みとしない。境界値/超過/並列争奪/OOM/熱保護で新作用を止め、部分成果/stop intent/usage予約/unknownを残す。
7. **OS-08 job再開/一回性**：job/revision/attempt/command/request digest/claim/lease/fencingを永続化し、承認→予約→effect claim→実行→receipt→保存の境界ごとにkill/切断試験。再起動後は同ID読戻し、unknown外部作用は元recipientへ照会しblind retry0。PID/socketの存在だけで稼働/安全停止を断定しない。
8. **OS-09 暗号化保存とbackup**：owner別保管、AAD/key hierarchy、Keystore保管/backup鍵、schema/manifest/hash、atomic importと旧reader互換を実装する。暗号化ファイルの同期、restore後の旧token/grant失効を検査。emulator software鍵とPixel hardware-backed鍵を分ける。
9. **OS-10 device/鍵喪失復旧**：空の復元先、本人の復旧手段、旧writer失効、新端末鍵/rebind、削除tombstone、利用権/予算/停止世代を照合する。非破壊export/通常再起動とdata/Keystore全損を別gateにし、復旧phraseをAI/Git/ログに渡さない。破壊試験は復旧と権限条件が整った最後だけ。
10. **OS-11 署名更新/互換/rollback**：OS/APK/Tool/guest code/model/profileの更新種別を分け、artifact署名/全bytehash/適合/最低版/revocation/期限を検査。download→verify→stage→trial→health→commit、失敗rollback/再起動途中を原子的にする。data migrationと旧slot reader互換を検査し、失効版/downgrade許可へ戻して修復しない。
11. **OS-12 電源/熱/容量/suspend**：実観測と安全閾値/復帰hysteresisをprofileへ固定し、低電池/過熱/容量不足/消灯/OS foreground制限で新実行を保留。実行中の成果checkpoint・stop/usageを保存し、復帰を無断再実行にしない。always-on保証や電力値は連続同条件試験後だけ。
12. **OS-13 標準OS入出力**：camera/mic/notification/file picker/accessibility/networkを既存OS permission/foreground制約へ接続。拒否/一時許可/失効/背景化/別profile/window切替を試験し、permissionだけを本人の目的/外部送信同意としない。必要な設定/更新/復旧/電話・緊急機能を最小化の名目で削らない。
13. **OS-14 共通contractとadapter parity**：Pixel/QEMU/Web/Mini/Pro/Cloudを別受入表とし、同owner/job/revision/成果hash/usage/stop/restore fixtureを比較する。`rockstaros.adapter/1` Host/Executor/Outputのrole/protocol/version/期限/capabilityの積集合だけ候補にし、観測はauthority=false。Miniのcalibration/place/安全出力、ProのBOM/GPU/driverはP10の追加contractを使う。
14. **OS-15 同image物理受入**：native版は同image hash・同Pixel10 GL066/frankelでboot/hardware通信/本人拒否/権限/保存/再起動/署名更新/失敗rollback/stock/全損復旧を`docs/templates/os-acceptance-report.md`へ記録。試験署名APK、AVF guest、emulator、旧QEMUだけで受入しない。
15. **OS-16 guest/host権限境界**：Linux rootとAndroid host UID/SELinux/Keystore/Device Ownerは別。mTLS/loopback/tap/Unix socket/file共有/Binderの各面でclientとclaimを照合。guestへAndroid credential/任意rootAPIを渡さず、同guest UID信頼の限界と実device attestationを区別する。

**capability選択アルゴリズム**：有効なdevice observationとadapter descriptorをparse→要求入出力/compute/資源の必要条件との積集合→本人/利用権/role/scope/外部送信/quote/上限→stop/lease/fencing照合→実行候補。どれかunknown/expiredなら利用不可又は再観測へ戻し、LLMの能力自己申告や商品名で補完しない。権限はBrokerがeffect直前に再検査する。

### O03 full OS・signed update・復旧の独立release系列（OS-17）

**対応**：P05/P09/P10/P13。標準SIM/eSIMサービスは共通Core/runtime受入後のclient/browser経路で進め、P05 native full-imageや旧QEMU完了待ちにしない。RQ12のQEMU Developer Previewは既存の独立受入を維持する。

1. 正確なPixel10 GL066/frankelの現build/bootloader/Verified Boot/partition/rollback readback、固定upstream source tag/manifest、kernel/vendor/firmware inventoryとlicenseを揃える。Google factory/full OTAは同一buildの公式掲載hashと実byteを一致させ、利用条件/容量/用途を明示する。source存在だけでfullBuildInputGatePassedへしない。
2. `scripts/prepare-phone-build.py`と`scripts/freeze-phone-build-inputs.py`、`docs/android-production-architecture.md`/policy、`docs/android-first-flash-gate-20260916.md`/JSONを使い、入力・signing・rollback・stock recovery・Keystore-loss backupの各gateを現在再読する。今回読んだ4gateはblockedで、過去23/23 APKをこれらへ転用しない。
3. full OS buildは専用x86_64 LinuxでRAM/storage/toolchain/source fingerprint/ネットワーク・秘密保護/予算上限/停止・成果保管を固定する。Pixel AVF aarch64 guestやMacを標準full build環境としない。既存の許可と予算を調べ、未指定の有料環境契約は具体的候補/上限を示した最後の判断へ残す。
4. 正式署名鍵は既存custody policyのidentity/保管/backup/rotation/revocation/監査、rollback indexの単調性、stock復旧資材、全損backup条件を満たす。試験署名とproduction鍵、署名済みimage生成とflash許可を分ける。private keyを会話/Root/guestへコピーしない。
5. flash/初期化/unlock/署名鍵生成/保管の実施は設計文書から推測しない。exact target/image/署名/電源/backup実証/データ影響/復旧・rollback・失敗時手順をreview packageに揃え、既存の条件付き了承の条件が満たされたことと未許可の破壊操作だけ最終判断する。本人に同じ承認を取り直して通常開発を止めない。
6. unsigned静的/host/emulator→正式署名→同機種物理→更新/rollback→stock/全損復旧を別証拠で進める。image/build cache/巨大logはGit外release artifact、Gitへはsource/設定/小fixture/要約hash/復旧手順のみ。未実行/失敗/skipを成功へしない。

### O04 Privacy vault・data学習・監査と有料利用の共通境界（OS-18）

**対応**：P07/P08/P09/P10/P12。Web履歴のserver管理AES-GCM/HKDF/AADはE2EEではなく、native unlocked-device-required session鍵はfresh per-use biometric-bound vault鍵ではない。一般会話の受入を生体/健康原本の本番保管許可にしない。P09未了でも非生体Core/Remix/Tool/P01/P02/P05入力整備を進める。

機微vaultはOS/authenticator内の指紋/顔templateと健康測定値を分け、背景job鍵とfresh本人presence鍵を分離する。用途/recipient/scope/同意版/保持・export/削除/key version/復旧をobject単位に結ぶ。E2EE範囲は平文endpoint/運営者/復旧者/新端末に誰が復号できるかを明示し、server暗号化をE2EEと名乗らない。synthetic ciphertext/偽sensorだけで別owner/古い鍵/失効/nonce/AAD/replay/backup rollback/削除後遅延sync/旧snapshot resurrectionを試験し、raw原本は使用しない。独立Security/侵害/鍵全損/実hardware/地域法務を同candidateで受け入れるまで機微運用は無効にする。

Eve/Remix/media/CUの観測はP07の同account/契約/job/料金版/予約/usage/invoiceへ接続する。同時deviceで同予算の原子予約、unknown時保留、遅延usageの一度だけ計上を守り、modelが誤答しても上限と承認はOSが強制する。P08の作者契約/receipt/税・本人/入金済み原資/返金・異議/実払出しは別gate。合成invoice draftやpending観測を顧客収納/作者送金へしない。学習データ許諾・mediaの編集権・Agent私用保存・成果一般共有も別の同意である。

### E06 実装順と受入シナリオ（EVE-15）

**先に通すcritical path**：P13前半で対象/差分/引継ぎを固定する。同時にP01の非破壊read-only診断を開始し、必要最小限の共通Core/既存文章経路の修正を行う。Pixel接続と現在candidateの条件が整い次第、短い文章の新AgentによるP02実UI一周を先に受け入れる。Remix/media/CU/学習・作者分配・full OSの完成を、この小さいP02の前提へ足さない。

**並行するROCK線**：E01のArtifact契約/旧reader負例、E02のRemix/media4操作・Agentlineage、E03のmodel評価/学習データ準備、E04の固定Tool/有限repairと限定CU、O02/O03のfull-image入力/署名復旧準備、O04の非生体fixture、P03/P07/P08/P10/P11/P12は、それぞれの現依存だけで進める。これらは直列の全待ち列ではない。P02の小さい同job受入を保持したまま、各線の差分を同じowner/job/Artifact/usage/stopへ後段で結合し、機能別に追加受入する。P01や外部条件待ちでも独立fixtureを進め、GPU/学習・native flash・実金融をCore全体の前提にしない。

最低限、次を同candidateで残す。

- **通常系**：目的→本人用Agent確認→Smith保存/同版登録→実行→機械検査→本人review→artifact/export→別clientで同ID読戻し。mediaは4操作各1、original不変と結果byte検査、Agent合成は元Agent/版不変と新lineageを確認。
- **本人/権限**：A/B owner、Agent/素材/recipient/scope越境、account切替後遅延応答、expired/偽capability、失効session/鍵/Tool/model、課金なしなのに外部送信などを拒否。
- **同一性/一回性**：同ID同digest再送・別digest衝突、二client同時CAS、二workerclaim、lost start/保存応答、job/Agent/model/素材変更race、削除済みthread再作成を試験。
- **停止/復旧**：stop前未配送/claim済み/遅延start/遅延model/encode中abort、元receiptなしunknown、clientreload/Worker/D1再起動/guest再起動/Android再起動を分離。既知job404、旧pending、旧reader、snapshotrollback/recoverypause、delete tombstoneを試験。
- **資源/形式**：過大素材/画素/音声長/動画長、decode bomb、不正MIME/header/duration、OOM/低電池/熱/disk満杯/quota、出力上限/部分成果、Blob URL失効、IndexedDB保存失敗と再読込みを試験。
- **plan/model**：candidate未知field/不正JSON/別source/Tool/循環、検収を弱めるrepair、成功step再実行、評価metadata加点、token上限/空回答、usage欠損/null、model更新/削除後旧job read、未許可Cloud fallbackを試験。
- **共有/学習/金融**：元素材・private会話の無断公開/学習0、明示共有P03で別ownerが自分のjob/予算を使う、未確定価格を無料にしない、同usage/receipt重複請求0、返金/異議保留維持、fixtureを実送金へ昇格しない。

### E07 実在する検証入口と証拠の固定（EVE-15）

以下は作成時に存在を確認した入口であり、この章作成時は実行していない。Root/Sourceのschemaやmigrationが異なるため、必ず選別したcheckoutのpackage.json/AGENTS/READMEと実fileを再確認する。局所試験→対象adapter/package→同candidate全verify→実UI→同device/Providerの順を別結果で記録する。

```sh
node --experimental-strip-types --test tests/eve-os-interaction.test.mjs tests/eve-runtime-work-port.test.mjs tests/eve-purpose-runtime-work-port.test.mjs tests/eve-agent-preparation-sync.test.mjs tests/eve-runtime-sync.test.mjs tests/eve-runtime-stop.test.mjs tests/eve-runtime-export.test.mjs
node --experimental-strip-types --test tests/eve-remix.test.mjs tests/eve-media-edit.test.mjs tests/smis-eve-workbench.test.mjs tests/a2a-artifacts.test.mjs
node --experimental-strip-types --test tests/eve-plan-candidate.test.mjs tests/eve-planner-state.test.mjs tests/eve-planner-inference.test.mjs tests/eve-tool-work.test.mjs tests/eve-tool-repair.test.mjs tests/eve-agent-work.test.mjs tests/eve-agent-repair.test.mjs tests/eve-agent-result-check.test.mjs tests/eve-news-learning.test.mjs
node --experimental-strip-types --test tests/model-profile-fixture.test.mjs tests/sky-linux-models.test.mjs tests/sky-model-selector.test.mjs tests/decision-layer.test.mjs tests/eve-history.test.mjs tests/rockstar-account.test.mjs tests/android-key-attestation-client.test.mjs tests/system-backup.test.mjs
npm --prefix packages/rockstaros-runtime run build
npm --prefix packages/rockstaros-runtime test
npm run sky:linux:pixel:build -- /private/tmp/rockstaros-eve-os-selected-pixel
npm run typecheck
npm run design:check
npm run os:check
npm run android:architecture:check
npm run device-support:check
npm run android:first-flash:check
npm run release:signing:check
python3 -m unittest discover -s tests -p 'test_inspect_phone.py'
python3 -m unittest discover -s tests -p 'test_prepare_phone_build.py'
python3 -m unittest discover -s tests -p 'test_freeze_phone_build_inputs.py'
python3 -m unittest discover -s tests -p 'test_pixel_guest_update.py'
```

Sourceでbuild済みのimmutable候補を対象に、実在する次のscriptで合成Worker/復旧を再現する。`<選別Source絶対path>`はP13が固定した候補であり、実account/production DBへ向けない。

```sh
node --experimental-strip-types scripts/check-eve-runtime-recovery-worker.mjs --project <選別Source絶対path>
node --experimental-strip-types scripts/check-eve-repair-source-worker.mjs --project <選別Source絶対path> --backup-restore
```

後者はSource3f6075fにも保存され、現在buildのTool/有限repair/終了job復元の限定試験。実LLMを呼ぶ`check-eve-local-planner.mjs`やモデル比較scriptは別の明示実測で、合成回帰に混ぜない。Macbenchmarkの別workspace scriptも自動実行せず、download/有料/新profileはE03の具体化後だけ。

Android build/unit/lintとinstrumentationは`docs/os-prototype.md`の実在Gradle module/variant、`rockAcceptanceTarget=physical/emulator`を使う。`EveOneLoopPreflightTest#inspectExistingRuntime`はread-only status/既存pairing/既存account/準備能力のみで、実推論や新grantを作らない。実deviceでの新jobはP02へ別記録し、testAPK/署名/hashを先に固定する。full nativeは`docs/native-os-validation.md`/後続Linux検証と対象build手順を使い、macOS skipをLinux成功にしない。release候補は`npm run verify`、初回flashは`npm run android:first-flash:require-pass`で必須gateを通し、失敗/未実行を成功へ変換しない。

**証拠manifestに必ず残すもの**：candidate ID、Root/Source/branch/40桁SHA、未commit対象fileの個別hash、使用contract/schema/adapter/model/Tool版、build全入力/出力inventoryhash、command、実行環境/時刻America/New_York、合成/実model/実UI/実機/Provider区分、期待/実結果/失敗、job/attempt/receipt/artifactの非秘密参照とhash、再起動/復元前後差分、原本不変、残件。hashが変わったら受入範囲をその候補へ限定し、旧証拠を新candidateへコピーして成功にしない。

### E08 元13P・実行SIを漏らさない引継ぎ

- P01：O01の現在診断/非破壊回復。P02：E01/E02/E04/E05とO01の同ID新Agent/Remix/media一周。P03：新Agent/素材lineage・共有scope・別owner実利用は共有担当の章へ接続し、private保存を共有合格にしない。
- P04：認可feed/ニュース取得は担当章。Eve側はsource refs/実取得版/rights/出典検査/learning consentをE03/E04へ接続し、news draftを事実/無断学習としない。
- P05：O02の15要件とO03のfull image独立系列。P06：共通Core/runtime受入と子device capability/lease、eSIM/回線/client/Native導入の別状態を保つ。native flashを標準開始の前提へ戻さない。
- P07/P08：E01/E03/E05/O04のjob/quote/usage/unknown/作者契約参照をBilling担当へ渡し、月16USD/account・枠超過・端末基本料重複なしを維持する。GPU原価/外部実費/作者料/通信料を混ぜない。
- P09：O04の非生体fixture/鍵/同意/E2EE/削除/独立審査。P10：同Coreへ実Mini/Proの入出力/電源/driver/校正を接続し、内蔵browser pointerやmedia出力を実Mini空間合格にしない。
- P11：E02/E03/O02の同条件性能/品質/操作rubric、cold/warm・p50/p95・失敗率/温度/電力を測り、security/権限/停止を弱めて高速化しない。P12：840/900研究原本と過去最終稿回収/内容審査/後続再研究を分け、E03/E04の仮説/実験/採否へ接続する。P13：E00の複数repo/dirty/source/public/同SHA CI/配備を統合担当へ渡す。
- SI00はE00、SI01はE04の固定Tool、SI02はE03/E04の非信頼plan、SI03は有限repair/独立検査、SI04はE05の永続制御、SI05はAgent/device/CU adapter、SI06はP07/P08との共通原子予算/receipt、SI07は評価/選定/作者UI/news/learning、SI08はE06/E07の同candidate release受入と再評価で閉じる。部分assertionの成功だけで各SI/T又は全Goal完成にしない。

実装着手・判断変更・検証完了ごとに既存taskの原因/次の差分/依存/合格証拠/未解決条件を`project.md`と進捗JSONへ同期し、README利用方法/全体・Tool詳細/設計indexと同変更で揃える。今回の章保存をruntime修正、commit/push、main統合、公開、Pixel/GPU/請求の新受入として記録しない。

<a id="mini-pro-detail"></a>
## P10詳細：Miniの空間OS・Proの共通runtime／実機／販売

本章は次回開発用の指示。今回の納品はプロンプトであり、以下を実行・配備・購入・計測したとは記録しない。既存sourceから差分を実装し、別のOS核・Agent台帳・料金台帳を新設しない。共有Root/別Source/公開候補を混ぜず、P13で対象path・baseline・owner・開始SHA/hashを固定する。他担当の差分を戻さない。

正式表示は **Smith**、LLM製品は **Eve**。旧sky/smisのAPI、scope、保存キー、anchorは互換維持。Mini/ProともRockstarOSの本人、利用権、権限、仕事、予算、成果、停止・復旧を使う。同契約の端末追加で月16USDを重複させず、追加computeはP07共通予約/usage/請求へ一度だけ結ぶ。eSIMのP06は共通Core/runtime受入後に接続し、P05 full OS flash待ちにはしない。

### P10-0 最新の要求、差分原因、追跡単位

主担当はMaterial Invention/avocadoMiniのROCK（MAT15/MAT18/DSP01/OS10/WEB04/SKY21）。Pro商品はB05/WEB13、商流/請求はBIL02、認証・鍵はSecurityへ共同。関連RQは12/40/41/42/43/44/48/49。以下のMINI-01〜08／PRO-01〜04はP10の小タスクであり、新しいRQや独立製品taskではない。

最初に既存`docs/prompts/rockstaros-remaining-work-development.md`、`data/rockstaros-remaining-work-plan.json`、`docs/device-support-architecture.md`、`contracts/rockstaros-portable-runtime.json`、`packages/rockstaros-runtime/README.md`、`docs/avocado-mini-r5/spatial-computer-use-design.md`章47〜50、`docs/avocado-mini-r5/factory-development/reference-reels.json`を読む。

- **Mini追加要求**：参考2動画Da21x7iCtxJとDLrVDOJtpW3/ARRAYから「周囲が透ける像・枠を感じさせない存在感・手に連続反応するscene」を参考化。本人が**像を表示したい位置へ板・膜を置かない**と確定。裸眼、少数表示部、既存比較領域、固定world scene、低眩しさ、同時利用人数、持出し継続を維持する。小像/近距離/単眼/正面だけへ縮めて全範囲合格にしない。
- 2動画は再生観察の記録であり、光学機構・sensor型番・AIRR/Go採用・全方向物理3D・低眩しさ・精密tapの証拠ではない。像位置の透明layer/網/水槽/散乱媒体を黙って解決案へ入れない。光学内部のlens/BS/shutterと、像位置へ置く受動表示面は区別する。
- 最新Miniは設計v0.8/PDF52ページ、`reelHandNoPlateFollowup`。free-space出口計算とhand入力sourceが追加されたが、SDK/model/camera/新gesture実行、実光学/PCB、新unit/全verifyは未実施。前の47ページ/507位置計算は履歴として保持する。
- Mini OS UIはv44保存・公開未完了。Proは共用Site v46のbrowser OS preview、localStorageの下書き/boardのみ。Pro account/job同期・実AI・native OS・実機販売は未受入。共用project latest46/activeというmetadataだけでMini OS公開やPro実機適合を合格にしない。

各小タスクに `source_and_hash / implemented / unit_worker / actual_browser / actual_sensor_or_sdk / physical / manufacturing / commercial` の実施区分と証拠を残す。`ROCK_READY→PROVIDER_READY→INTEGRATED→LIMITED_LIVE→PRODUCTION`へ対応付けるが、ソフトと光学/製造/販売のgateは独立する。EXTERNAL待ちでもROCKのparser/store/認可/診断/合成反例/UI/復旧手順を並行して閉じる。

<a id="mini-01"></a>
### MINI-01 要求領域と光学・観測・入力の契約を固定する

**既存source**：空間設計章1/2/47/48、`contracts/avocado-mini-spatial-runtime.json`、`factory-development/{reference-reels.json,free-space-exit-bound.py,e1-binocular-layout.py,e1-leairr-prescription.json,optical-layout-input.json}`。原因は、sensorが測れること、有限点で光線が届くこと、全sceneが両眼へ見えることが別なのに、一つのcoverageへ混ぜやすいこと。

1. place profileへ対象領域D、眼位置/向き領域、対象pose/size、眼間/瞳径、同時人数、家具/人体/壁の遮蔽、照明、移動経路、設置可能域を別項目で保存する。3×3m等は既存P0比較仮定であって製品公称ではない。本人が要求を変更する場合だけ理由と新旧版を保存する。
2. active像源数、光学出口数、sensor数、像位置の受動面数を別々に出力する。台数を一つへ丸めず、1source→複数出口の光路/光量/同時性も記録する。像位置の板/膜/散乱媒体が必要な候補は、現要求を満たさないとして診断を残す。
3. 状態はrequirements_fixed→candidate→necessary_condition_failed/passed→bench_pending→physically_observed→qualified。有限点のnecessary passをcontinuous/whole-range/comfort acceptedへ昇格させない。未測定/unknown領域は利用不能で理由表示し、要求領域から自動除去しない。
4. 同一入力hashから計算を再生成し、sample数/失敗点/使用仮定/既知の除外を出力する。結果の小さい対象20mmを建築scene全体の達成にしない。source/計算revision・生成器・hashを既存evidenceへ追加し、raw観察者データはGitへ入れない。

<a id="mini-02"></a>
### MINI-02 少数・板膜なし・全範囲の光学を選定し反証する

現v08 `free-space-exit-bound.py`は4側面出口/243眼位置×147対象点=35,721組を理想角度/焦点で検査。それでも300mm角4基で35,489、1,200mm角で31,993、4,000×3,000mmで5,953組が未達。これはその配置の必要条件であり、全方式不可能/最小台数の証明ではない。瞳追従は出口位置そのものを動かさず、眼と同じ水平位置で眼より下の像等に必要な光路が欠ける。

1. 既存4側面案をbaselineとして固定し、上/下面を含む分散出口、同じ固定world像を補償する可動/切替出口、選定済みGo中継の修正案を**同じD/眼/target/人数/輝度/設置体積**で比較する。候補ごとに成立可能なray generation・光学出口位置/口径/操舵・同時出力・遮蔽・機構干渉・停止時の光の向きまで仕様化する。単に開口を仮拡大して部品選定済みとしない。
2. まず角度制限を外した楽観的必要条件で不成立を落とし、残った候補へ実source cone、quilt解像度/奥行、pupil、lens/BS/RRの有効開口/波長/偏光/透過反射・迷光・収差を入れる。source数と出口数を増やす原価/電力/筐体/設置制約を併記。greedyの候補内解を最適性の証明にしない。
3. 境界・上下・近距離・横移動・眼位置誤差・遮蔽を反例にし、粗格子→細分化→worst-case/連続移動→公差marginの順で検査する。位置/角度誤差と追跡遅延を増やして光線が外れる点を出す。固定像が観察者と一緒に動く案は、固定world模型の要件を満たさないと明示する。
4. 候補が残れば光学bench仕様を`factory-development/spatial-optical-rfq.md`と`component-verdicts.md`へ追記する。exact図面・有効面・供給条件・調整範囲・支持/遮光・実電源・安全停止・必要測定器・合否条件を揃える。未決のlux/cd/m²/像位置誤差/可視分解能/同時人数/latency許容は、用途と測定不確かさから本人/専門担当が版として決める。根拠なしの閾値をacceptedにしない。
5. 実benchでは同じ像を固定し、校正済み観測位置から両眼視域、像位置/奥行/歪み、文字・模型の識別、glare/光源直視/暗所/起動flash/周辺漏れ/長時間comfort、消費電力と停止応答を測る。写真一枚や動画に似た見え方はSC01/04/08の全条件を満たさない。未達はsource/結果/原因・次の選定へ戻し、光量増加で未達を隠さない。

**納入/受入**：少なくとも既存方式の反例再現、次候補の実装可能な部品/光路・光線生成・設置・停止契約、同条件比較、測定計画/測定済み差分を残す。未成立なら未成立のまま、採用しなかった理由と次の候補を具体化する。全要求合格と判定するのは同一実構成のSC01/02/04/08後。

<a id="mini-03"></a>
### MINI-03 Goを「列挙できる」から実描画・停止へつなぐ

**既存source**：`linux/go-bridge-observer.py`、`spatial/{go-depth-session.mjs,go-d405-preview-host.mjs,leairr-prewarp.mjs,display-coordinator.mjs,GO-D405.md}`、`hardware/reference-interface-map.json`。現Go observerはscalar観測だけ、完全校正/scanout/Go画素送信なし。

1. exact host/OS/GPU/driver、Go serial、既存導入済みBridge SDK/native library hash、解像度/向き/refresh、映像と給電経路を固定する。メーカーのGo HDMI→USB-C能動adapterまたは受入可能なDP Alt Mode hostを選び、一般のUSB給電や受動変換で代用しない。SDK/モデル/driver取得が必要なら出所/版/license/容量/保存先/費用を示し、無断取得しない。
2. まず既存local draftをknown pattern/quiltへ変換し、renderer→Bridge送信→Go状態→実像を別receiptにする。光学補正は実source面・校正ID・optical prescription hashへ拘束。prewarp座標計算だけを実light field表示と呼ばない。内容hash/scene revision/place epoch/node/frame ID/期限を`display-coordinator`承認へ結ぶ。
3. software-presented、Go submitted/scanout確認、optically observed、binocular qualifiedを別状態にする。Bridge timeout/再生継続/校正変更/host切断/expiryでblackout要求を保存し、独立光学停止の実readbackがない間はphysical stop unknown。自律再生やUSB逆給電を含め止まることを実測する。
4. sourceレンダラーの通常画面表示→実Goのテストscene→光学relay後の像の順で受入。各段でsource hash/版/向き/電力/温度/遅延を残し、Mini最終実機や全範囲を別gateとする。

<a id="mini-04"></a>
### MINI-04 RGB手入力・深度・露光/座標を統合する

**既存source**：`linux/{hand_landmark_observer.py,hand-profile.template.json,d405_depth_observer.py,stereo_marker_observer.py}`、`spatial/{hand-preview.mjs,hand-preview-host.mjs,HAND-PREVIEW.md,depth-observation.mjs,d405-observer-host.mjs,stereo-observation.mjs}`。RGB21点のnormalized x/yはmetric poseでも本人性でもない。D405の7〜50cm/指定16pixel点は手検出・room測量ではない。両sourceの実camera/SDK/露光融合は未受入。

1. まず現hand streamの独立負例試験を作る。profile/model hash、boot/sequence/place/calibration、不正size/NaN/未来/古い受信、2手/消失/入替え/端/scale跳躍を拒否する。100ms受信期限、open180ms→pinch60ms→preview→release提案、0.25/0.45比率は調整候補のまま。model分類scoreを本人認証へ使わない。単位試験は実cameraを使わず、その後に実handで誤選択・誤commit・欠落を測る。
2. exactRGB/depth機器とintrinsics/extrinsics/hand model/SDKをprofile固定し、露光timestampとhost受信timestampを別々に保存する。同期方法と誤差を定義し、共通基準点/距離/温度/姿勢/照明/速度で測定。RGB landmark→対応depth→cameraToPlaceの有効域と誤差上界を評価する。SDK world landmarksやhost受信の新しさを部屋実測/露光同期にしない。
3. 融合出力の新schemaは既存`contracts/avocado-mini-spatial-runtime.json`へ加算する。owner由来ではなくsourceのprofile/serial hash、model/calibration hash、place epoch、exposure時刻/同期誤差、受信時刻/sequence、metric pose/誤差、有効期限、capabilityを含める。`spatialActionEligible=false`は物理/精度/可視性/認可gateが揃うまで維持し、synthetic-rayへ実手を偽装しない。
4. camera拒否・SDK不在・100ms超推論・遮蔽・複数人・profile変更・clock/校正失効でproposalを取消し、現在draft/jobを保持して停止/再校正へ戻る。遅い応答は世代失効し、再接続で古いpinchをcommitしない。生frameを記録/送信しない既定を保持。検証用取得が必要なら目的/対象/保持/削除/外部送信を別同意にする。
5. host子processは実行上限・frame上限・SIGTERM→猶予→SIGKILLとexit確認を全経路で試験する。timerを設けたことだけでcamera停止完了にしない。実SDK/camera未準備でもpipe合成sourceでparser、stream overflow/backpressure、process切断、revocation、draft CASを検査しROCKを進める。

<a id="mini-05"></a>
### MINI-05 手/声→同じEve仕事→実app→原本保存

現`hand-preview-host`は一時local draftの相対移動だけ。新gesture sourceを既存の`spatial/runtime.mjs`、`lib/rockstar-eve-interaction.ts`、`components/eve-interaction-panel.tsx`、`lib/workflow.ts`、既存App/Tool adapterへ段階的に結ぶ。

- 候補入力には対象artifact ID/revision、scene revision、place/calibration、候補pose/操作、source/誤差/期限を固定。本人・許可Tool/送信先・job/予算はhost/既存Brokerから取得し、手streamのJSONから採らない。
- 状態をobserved→target_ambiguous/preview→owner_review→approved→dispatching→readback→saved/review、stop_requested/unknownへ分ける。表示だけの移動は編集成功ではない。認可後の対象/scene/版/送信先/料金変更は再確認する。
- 代表appを一つ選び、既存限定commandで原本を更新→appから実revision/hashをGET→既存job/artifactへ原本とreceiptを保存→scene更新。Tool成功をclientが自己申告するAPIは追加しない。raw画像/hand trace/個人会話を公開成果へ入れない。
- dispatch前取消/後unknown/アプリ保存失敗/結果再取得/停止receipt遅延を同jobで照合し、別ID再発注や有料Cloud fallbackをしない。移設は旧place scope/候補/光学出力を失効し、同じ本人の仕事/成果は保持する。
- Hey Eve/Thanks Eveは既存mini voiceと同session/jobへ結ぶ。声認識だけの実行/課金/送信承認を作らず、MIC OFF/完全電源断/低消費待機を別測定。ASR未準備なら文字/物理入力を残す。

**合格**：SC03/05/06/07/10で同一candidateの手/声→対象確認→本人承認→実app変更→原本保存→停止→移設再開を追跡。local draftの成功、Tool実結果、永久保存、実光学表示を別々に合格記録する。


<a id="mini-05-followup"></a>
#### MINI-05追補：Pointer/drag・CMの3体験・Eve内蔵media4操作

**新しい正本と既存成果**：空間設計の番号付き章51「参照CMの作業体験をOSへつなぐ」、後続の「Eveの掛け合わせ作業台への適用」「Eve Media Studio」、`factory-development/computer-use-scenarios.json`、`components/{eve-remix-stage,eve-remix-workspace,eve-media-studio}.tsx`、`lib/{eve-remix,eve-media-edit,eve-media-app}.ts`、`docs/evidence/{eve-remix-mini-ui,eve-media-studio}.json`を使用する。今回snapshotでは番号付きの最大は51で、後続Remix/media節は番号なし。**PDF52ページという物理ページ数と、章番号/章数を同一視しない。** 参照CMチャット`01a16b71-c8f7-7590-918f-9f5cf1ea6073`の映画/企画は体験入力であり実装/光学証拠ではない。

1. **入力を共通操作へ**：既存Pointer down/move/up/cancelと名前付き`data-eve-action`を同じselection commandへ解決する。A/B配置/重ねる/対象focusは選択のみで、生成・保存・送信を開始しない。手tracking→校正済みpose→DOM/scene hit-testのadapterを追加し、対象/scene revision/place epoch/入力leaseを固定。追跡喪失/2手/場所変更/expiryはPointer Cancelへ送り、古いup/dropを再配送しない。`data-eve-action`を実行grantへ昇格させない。Web drag成功は実手/精密pose/光学の合格ではない。
2. **現在の4操作を再利用**：`photo-layer`（写真2枚の透過PNG）、`audio-mix`（音楽2本の同時WAV）、`video-sequence`（動画2本の順次結合）、`video-soundtrack`（動画＋音楽）をそのまま限定appとして登録/呼出す。最大辺写真2048・動画1280/24fps/完成60秒、各file最大100MiB/写真40Mpixel/音楽各60秒等の現parser上限を再確認して保つ。既存evidenceはlocalhost:3051の実Blob・IndexedDB・書出し/再生/中止・原本維持までで、外部desktop Computer Useや汎用自由文編集ではない。
3. **同じjob/Artifactへ結ぶ差分**：編集前に素材ID/MIME/bytes/SHA256/元revision、A/B順序、operation/amount、app版、owner/job/command ID、出力条件、保存/外部転送同意を固定する。現`Saved.sources`のfile名だけでは原本同一性を立証できないためhash/provenanceを加算。作業コピーをBlobでpreview→本人確認→既存Artifact原本/blob保存経路へstage→server/保存先からdigest/長さ/revisionを読戻し→同jobへ確定、の順にする。大きなmediaを会話JSON/SQL本文へ詰め込まず、対応済みowner別object/blob storeを再利用する。未対応ならtypedなstage/finalize adapterを最小追加し、認可・content hash・MIME/size・retention/削除・CASを検査する。原本は上書きせずcopy/由来で残す。
4. **local作品棚からの移行**：IndexedDB `eve-media-studio/works`は同browser/originの保存でありaccount同期ではない。原本/作品export、ownerと保存先preview、素材の権利/秘密/送信範囲の確認後に同じjobへ取り込む。local保存許可をCloud upload/学習/一般共有へ拡張しない。stable command/Artifact IDと入力/出力hashで再照合し、quota/不正Blob/途中失敗/応答不明では元Blob・前回成果を残す。page非表示/stop中止の部分動画は完成Artifactへfinalizeしない。codec非対応は理由を表示し、無断のremote変換/課金へ切り替えない。
5. **CM3体験の未実装を閉じる**：音楽は正確なtake/revisionを選び、対応editorのpitch-preserving 0.67x time-stretch→実再生/長さ/音高→copy保存を追加検証する。`audio-mix`をtime-stretchの完成へ転用しない。紙→Webはcapture/指先/紙領域・曖昧さ確認→layout案→本人scope確認→対応editor/build/browserで実コード/interaction→承認済み実物assetのhero反映→source/ページhash保存を通す。文章生成や写真の透過合成を動くWebにしない。図面→CAD実寸は単位/寸法/実床面scale/誤差→CAD/BIM原本revision編集→固定world anchor→両観察者の実寸/光学可視→placement原本保存。2D表示やアニメーションを実寸空中像/原本変更へ昇格させない。time-stretch、OCR/layout、inpaint、CAD編集等の非対応operationは準備待ちを出し、既存限定app adapter/manifestへ追加して受入する。任意shell/未知app自動操作は追加しない。
6. **複数Mini引継ぎと検証**：同owner/job/scene/asset revision/world anchorを維持し、旧node入力leaseを失効、新node校正/出力mode/place/権限/stop状態を照合。引継ぎだけで別job/月額契約を作らない。Pointer Cancel→遅いup/drop、job/owner変更、編集中revision競合、IndexedDB quota/消去、stop/hidden中MediaRecorder遅着、音/動画長/codec、別client readbackを意味ある負例とする。Blob成功/作品棚保持/Cloud原本保存/実app編集/実Mini光学を個別合格にする。

追加集中回帰は既存 `node --experimental-strip-types --test tests/eve-remix.test.mjs tests/eve-media-edit.test.mjs tests/eve-runtime-export.test.mjs`。drag→選択0生成、4出力の独立decoder/実pixel・音声周波数・順序/長さ、取消後前回成果保持、stage/finalize/同ID再照合/二owner拒否、3体験の未対応表示を新実装へ追加する。既存7media試験やlocal browser受入を新しいjob/Artifact/実Mini合格へ加算しない。

<a id="mini-06"></a>
### MINI-06 電源・独立停止・netを閉じる

`hardware/reference-interface-map.json`は**bench定義**。STOP/LATCH/TEMP/POWER/DOCKEDはGP2〜6、local buttonはGP8、GP7/物理pin10はLED出力のみ。既存DPST-NCはcontact/LED帰路遮断で、Go光源/自律再生を止めた実証ではない。hand入力はMCUをarmしない。

1. 光源給電、映像host、USB/HDMI/DPの別給電/逆給電、自己再生、BMS/充電、MCU/host hangの電源木と故障木を作る。Goの5V/3A=15Wは容量枠で実消費ではなく、既存2A評価couponへ接続しない。
2. 独立停止は、mainCPU停止時にも危険な光を通さない経路を採用する。source内部spring-closed遮光shutter候補は像位置の板膜ではないが、採用するならactuator/driver/ばね/開閉限界/位置sense/故障時位置/開閉時間/熱/寿命を実部品で選定。電気遮断とshutterの併用要否、映像/逆給電経路、復帰時local re-armをレビューする。
3. 次を実benchにする：USB抜去/差替え、MCU/host hang、heartbeat失効、接点断線/短絡、GPIO固着、brownout/低電池、光源暴走、shutter不一致、cold boot/再起動。物理stop入力→光出力低下/消灯とsenseを独立計測し、P50/P95/P99/maxと測定分解能を記録。遮断指令receiptを実消灯へ換算しない。
4. 採用railごとにV/I/peak/inrush、過流/逆流/ESD/温度、wire/connector定格、fuse/保護、default off、sense、test pointを確定する。未確定pin/netはnull/TBDで停止し、見た目だけの結線を完成回路にしない。

<a id="mini-07"></a>
### MINI-07 PCB・同一筐体・製造gate

既存`hardware/cad/`の76×62mm Pico2接点LED carrier、`hardware/cell-power/`の5V部分coupon、`hardware/spatial-mainboard-plan.json`の面積図を別成果として保つ。最終boardはMINI-02〜MINI-06で採用した光学/像源/映像/広域sensor/独立停止と、演算/BSP、保護pack、地上/衛星/Wi-Fi RF、音声、生体/鍵、dock、配線、熱を統合したものと定義する。

- サブタスクはexact BOM/供給/footprint→同一機構CADと光路keep-out→電源/高速interface/pinout→回路レビュー→ERC→stack-up/配置/信号/電力/接地/熱/アンテナkeep-out→route/zone fill→DRC/未配線/回路図parity→DFM/DFA/ハーネス独立検収→Gerber/Excellon/位置表/BOM/組立図/書込・校正jig/復旧手順、の順。
- USB-C高速/PDやRFは受動配線で済むと仮定せず、selected host/adapter/定格から実装責任を確定。必要なら受入済みmodule利用でROCKを進めるが、同一筐体/携行/衛星内蔵要求を外付けHub成功へ換算しない。
- 実基板でrail/漏電/停止/温度/連続負荷/充電/RF/光漏れとsoftwareを同じrevisionで受入。筐体・pack・光学・アンテナの熱/干渉/輝度を個別bench後に同一閉箱で再確認する。最終外形76×186mm等は仮区画であり、実部品/公差/保持/配線が収まった証拠なしに製造寸法へしない。
- 製造releaseには設計レビュー、同一候補のERC/DRC/DFM、SC01〜10と既存OI/MP gate、traceable BOM/hash、署名/更新/rollback/純正復旧、工場試験条件と不良/失効対応が必要。製造gate未達でも設計・host・driver・CADのROCK作業を止めない。購入/製造契約/通電/flashは対象/費用/復旧条件を具体化した承認範囲で別実施する。

<a id="mini-08"></a>
### MINI-08（Mini/Pro共通） 実行host・native/DSP・eSIM子接続

`packages/rockstaros-runtime`は共通HTTP clientと対応host kernelで、weights/BSP/全driverを同梱しない。`connection.begin/poll`、`eve.list/read/save/recall`、`jobs.list/create/command`、`text.quote/status/submitApproved`を既存pathで使う。現Pixel限定runtime APIをmini/pro宣言だけで使用可能にせず、同じtyped contractで適合host adapterを追加する。

- 未認証→本人pairing→P06親子attachment→能力観測→ready/unknown/unsupported→job/review→stop_requested/receipt→切断/復帰。hostの保護session/鍵を利用し、観測の自己申告を認可にしない。parent epoch/期限/端末失効を再検査する。
- native系列はexact board/OS基盤/BSP/kernel/driver/secure storage/署名boot/更新/rollback/復旧を機種別に受入。既存OS clientは先に同account/job/費用/保存の実一周を完成させ、native全build/flash待ちにしない。
- Mini地上/衛星WAN→Wi-Fi、電話、音声、MIC OFF、pack待機/MAIN電力は個別能力と同時閉箱試験。Pro local AIはexactGPU/driver/model hash/license/RAM・熱・電力・品質の測定。月16USDで常時物理GPU一台専有の約束はしない。
- 401再接続、409同job読戻し、mutation応答喪失はunknownで同ID照合。停止/場所変更/鍵失効/更新後に旧仕事の元model/担当/成果を読める。成果/鍵を消して復旧したことにしない。


<a id="mini-08-followup"></a>
#### MINI-08追補：Eve制作appを端末間で再開する契約

共通hostが扱うのは同じjob/Artifact/素材provenanceと承認済み限定operation。Miniの手/声、ProのPointer/keyboardは同じselectionと操作状態へ入り、端末追加/scene移動で別制作engineを作らない。`photo-layer/audio-mix/video-sequence/video-soundtrack`のlocal実行と、time-stretch/紙→Web/CADの新app adapterをcapability別に申告する。model/routerの推測で未導入appやcodecをreadyにしない。

node切替は入力lease/校正/actor/Artifact revisionを再検査し、進行中media編集は実行host・command ID・input hashを固定する。未保存Blobの転送・Cloud保存・新Tool/新送信先/有料処理は別同意と見積/上限を通す。sender終了/通信断/新host codec非対応は同job unknown/保存待ちを保持し、再生成を自動送信しない。local0Cloud使用料と、未計測の電気/機器費、追加Provider費用を分ける。本人作品・CAD原本のArtifact読戻し/停止/旧版保持までをclient受入、実手/音声/光学/ネイティブ入出力は各実機受入とする。

CMの天井面一/回転/40mm径は構想で、現行工学仮定76×186mmやGo幅80.4mmと同時成立したCADではない。製品外形を40mmへ無断変更せず、光学head/共通Core/配線/電源/停止の配置差をM02/M07で判定する。

<a id="pro-01"></a>
### PRO-01 localStorageから本人別Eve/jobへ非破壊移行

**差分原因/現source**：`sites/avocado-mini/src/pages/pro/index.astro`、`pro-os.js`、`pro-os.css`、`worker/shared/domains.mjs`、`docs/evidence/avocado-pro-os-interface.json`。`avocadoProOS:draft:v1`は最大3000字、`avocadoProOS:tasks:v1`は最大100件/本文160字/id/doneのブラウザローカルデータ。認証/AI/請求成功の根拠ではない。

1. 初回は現在browserの原本をexport/previewしてから、認証したowner/移行先account・保存範囲を表示。owner未帰属の旧localデータを、後からログインした別本人へ無断移行しない。選択しない/取消なら元keyと画面を保持する。cross-origin localStorage/cookieを取得しない。
2. 実装を始める前に現Sites domain routerと共通auth/device-link経路を照合。browserは同originの認証付きAPIを基本にし、Pro origin→avoadoの任意CORS開放やcookieコピー、client指定owner/偽trusted headerを使わない。既存第一者gatewayでorigin/audience/sessionを正しく照合できる専用routeに共通APIを接続する。まだgatewayがない段階は、明示export→共通OSで本人がfile選択/previewする移行入口からROCK実装を完成させ、暗黙のcross-domain転送で代替しない。native hostは既存保護device sessionを使う。
3. schemaを`pro-local-import/1`等の**新規提案・実装対象**としてstrict parseする。version、原本content hash、stable import operation ID、source item ID→新UUID mapping、入力ごとのhash/保存先を持ち、ownerはserver sessionから得る。無制限の任意JSON、未知字段、重複ID/制御文字/過大inputを拒否。title120字を超えるlocal本文は切捨てずobjective/本文へ保持する。
4. draftは既存暗号化Eve履歴の本人preview→`remember`/保存同意→revision CASへ。boardは既存workflowの承認可能なdraft/計画へ写し、旧`done=true`は「旧ローカルでチェック済み」の由来情報として保持し、Tool成功・検収completedへ変換しない。既存template/plan契約に合わない項目は保存候補のまま理由を示し、架空Tool/runnerを増やさない。
5. 各mutation前にstable id/hash/mappingを保存し、既存`workStore.create`の同IDを再利用する。現POSTのtitle/template一致だけではimport全内容の同一性を立証できないため、移行provenanceとrequest digestの完全照合/同owner一意性を既存store/APIへ最小加算する。応答消失は元ID GETで内容hash/revisionを照合し、新UUID/タイトル検索で再作成しない。既存table/metadataを優先し、必要な最小migration以外に別顧客/仕事台帳を作らない。
6. 状態はdetected→preview→owner_confirmed→importing→partial/unknown→readback_verified→complete、conflict/withdrawnを保持。途中失敗は成功分mappingと原本を残して残件だけ同ID照合。owner/logout/接続切替でpendingを失効、勝手に次ownerへ継続しない。全件readback・再起動/再login一致・export読戻し後も、元local削除は本人の明示操作にする。private migration logへ本文/鍵を出さない。

**代表受入**：合成旧draft/複数boardと実本人UIで、preview/選択/取消→同account保存→別clientで同job/原文/旧check由来→応答消失/409/再起動/別owner拒否→再実行/二重import0。importはモデル/Tool/課金を開始しない。

<a id="pro-02"></a>
### PRO-02 共通UIから実仕事・保存・停止へ

- Proの「Eveへ進む」は既存conversation/threadへ結び、選択Agent/版/model/executor、見積/cap、承認、job、artifact/usageを同じ画面に表示する。copy/pasteリンクやlocal board追加だけでruntime接続済みにしない。
- 保存はhistory CAS/job revision/原本hashを維持。結果不明の開始/停止・旧担当/旧model成果閲覧・exportは現在のEve Coreを再利用し、UIの`done`ボタンでprovider成功を書かせない。
- P06で同じ契約の鍵付き子attachmentを発行し、実Pro能力を観測。Mini→受入済みPro計算→同じartifactをMini/Proへ表示する試験を、Mini単体機能の成立と分けて実施する。停止/親失効/二端末同時予約/復帰で重複基本料・予約超過・二重dispatchを拒否する。
- system statusはnot_connected/awaiting_owner/ready/running/unknown等を実APIで出す。localStorageが書けた、model設定済み、GPU名が分かったというだけでready/実推論成功へしない。新ロゴ/Smith表記は原画像/既存brand pipelineで反映し、source/配備/全画面実UIを別確認する。

<a id="pro-03"></a>
### PRO-03 native OS・実機SKUを固定し検証する

初号機は本人選択の銀色Lian Li A4-H2O、`pro-studio-16`候補。Ryzen7 9700X/ASUS Dual 5060Ti16GB/B850-I等は`data/avocado-pro-sales-readiness.json`の候補で、互換/供給/driver/性能の合格ではない。低いStudio型専用筐体は次版方向として分ける。

exact motherboard/BIOS・CPU/GPU・RAM QVL kit/SSD/PSU cable/cooler・chassis revisionをBOM固定→物理寸法/挿入/干渉/PCIe/電源/冷却→OS/boot/storage暗号化・driver→同owner Core接続→local model許諾/hash・offline推論・実Tool→連続負荷/電力/温度/騒音/省電力→再起動/署名更新/rollback/純正復旧/全損restore、を同一試作機のbuild ID/hashで追跡。SKU変更は関連fit/driver/熱/費用試験を再受入する。制約不足のhardware名だけで製品仕様を宣言しない。

<a id="pro-04"></a>
### PRO-04 販売gate12件を閉じる

既存`data/avocado-pro-sales-readiness.json`、`scripts/check-pro-sales-readiness.mjs`、`tests/pro-sales-readiness.test.mjs`、`sites/avocado-mini/worker/index.js`の購入希望API、`sites/avocado-mini/tests/pro-interest.test.mjs`、Business PilotsのB05/WEB13を再利用する。US、avokado LLC/NYは本人申告、NY住所は連絡先のみ。事業主体/受取先は独立確認が必要。「自転車操業」は調達可能USD上限や信用枠の証拠ではない。Stripe固定ではなくStripe/Square/PayPal等の候補比較、merchant未選定、有料注文/発送0。

各gateのboolだけをtrueへ書き換えず、責任者・対象SKU/同一試作機・条件版・証拠hash・実測日・失効/変更条件を結ぶ。gateの合否判定に必要な付随fieldも揃える。

1. **exactBomFrozen**：メーカーpart number・supplier SKU・revision・数量・寸法・電力・QVL/driver/license・代替禁止条件を固定。供給者画像/合成CGはfit証拠にしない。
2. **supplierQuoteAndAllocationConfirmed**：書面見積・有効期限・在庫引当・最低数・支払条件・送料/税/返品・地域と納期根拠を同BOMへ結ぶ。問い合わせ/発注は内容/先方/費用/本人条件が揃った段階で行う。
3. **singlePhysicalPrototypePassed**：同一実機のfit/boot/機器/入出力/モデル/仕事/停止/保存/更新復旧とPRO-03の計測を検収。prototype未所持でもdoctor/試験script/fixtureを先に完成させる。
4. **assemblyAndBurnInProcedurePassed**：組立/締結/ESD/配線/BIOS/driver image/校正手順、CPU/GPU/メモリ/SSD負荷と熱/電力/失敗復旧の時間・上限・終了条件を明文化し、実機run sheetを残す。推論だけの成功で代替しない。
5. **shippingPackagingDropTestPassed**：実箱/緩衝/重量/梱包固定/振動・落下等の試験条件・傷/機能検査・再梱包手順を決め、同構成で受入。測定器/第三者評価が必要なら準備と依存を分ける。
6. **usDeliveryWindowEvidence**：実supplier引当・組立burn-in・梱包/発送/地域別carrier条件/追跡から納期幅を算定。現物/在庫不明のまま顧客へ日付を約束しない。
7. **sellerTaxAndResaleSetupVerified**：NY等の適用地域と販売/組立/返品場所、LLC真正記録・販売主体/公開連絡・税/再販条件を一次資料/適切な専門確認で整理。連絡先住所を倉庫/返品先へ転用しない。
8. **customerTermsAndWarrantyApproved**：注文/取消・仕様差・サポート・故障/保証・配送事故・返品/返金・データ消去/保存・販売地域/税/同梱OS/AI継続料の条件を明示し、顧客が料金版/契約へ同意する経路を用意。
9. **returnsAndRefundReserveFunded**：部品/入荷/組立試験/梱包/発送/保証/返品/決済手数料の費目を積算し、利用可能cash・書面supplier credit・資金拘束/返金reserveを確認。未知原価を0にせず、顧客入金前の必要額とPSP払出待ち/holdを見積もる。
10. **merchantLiveAccountConnected**：比較対象の手数料・払出時期/hold・予約販売可否・返金/dispute・US hardware/税条件を現在の契約で比較し、本人選定後に名義/KYC/口座/公開条件を確認。OAuthページ到達/本人の「できた」をmerchant実接続へ置換しない。秘密値はserver secretだけ。
11. **checkoutWebhookRefundReconciliationPassed**：まずsandboxで同注文・SKU/価格/税/配送/通貨/顧客/料金版を固定し、支払/注文/納品/請求/入金の状態を分離。署名webhook＋provider GETで照合、重複/逆順/timeout/失敗/取消/部分返金/disputeを既存予約/台帳で一度だけ反映。return URLでpaidにしない。hardware買切りと月16USD/Agent/通信を別明細とし、二重基本料を作らない。
12. **orderToDeliveryDryRunPassed**：合成顧客/sandbox注文→引当/組立QA→梱包→carrier label dry-run→tracking/受取→support/返品/返金まで同order IDを追跡。実注文/送料/発送を伴う部分は対象/費用承認後に別受入。dry-runを実売上へしない。

価格/原価/資金/実feeと本人承認したcontribution閾値を揃え、checkerの`ready`と全証拠を独立レビュー後に一件の限定有料注文へ進む。現在のStripe2.9%+30c試算や未承認margin閾値を販売条件へ固定しない。購入希望/consent/removal codeの既存機能は維持し、public受付の存在と注文受付を分ける。外部/本人判断待ちはROCKのorder-state/fixture/見積UI/復旧/doctorを並行する。

### 意味のある検証：実在コマンドと追加すべき試験

以下は既存path/scriptの再現入口。詳細開発の実施と文書改訂時の既存回帰を分け、検証の実行有無は証拠JSONへ記録する。Python計算器はwork/へ結果を生成するため、P13で固定した候補/作業場所から実行し、対象source hashの前後不変を照合する。Python/numpyは既存bundled環境を確認し、依存を黙って取得しない。

```sh
python3 docs/avocado-mini-r5/factory-development/free-space-exit-bound.py
python3 docs/avocado-mini-r5/factory-development/e1-binocular-layout.py
node --check systems/rock-star-os/targets/avocado-mini/spatial/hand-preview.mjs
node --check systems/rock-star-os/targets/avocado-mini/spatial/hand-preview-host.mjs
node systems/rock-star-os/targets/avocado-mini/spatial/build-lab.mjs /private/tmp/mini-p10-lab-candidate
npm --prefix packages/rockstaros-runtime run build
npm --prefix packages/rockstaros-runtime test
node --experimental-strip-types --test tests/rockstaros-portable-runtime.test.mjs tests/rockstar-service-attachment.test.mjs tests/eve-runtime-work-port.test.mjs tests/eve-runtime-stop.test.mjs tests/eve-runtime-export.test.mjs tests/avocado-mini-native-development.test.mjs tests/mini-voice.test.mjs tests/pro-sales-readiness.test.mjs
python3 -B -m unittest discover -s systems/rock-star-os/targets/avocado-mini/tests -p 'test_*.py'
npm --prefix sites/avocado-mini test
npm --prefix sites/avocado-mini run build
node scripts/check-pro-sales-readiness.mjs
npm run device-support:check
npm run design:check
npm run baseline:check
```

sales checkerはgate未達の間exit2が正しい。全体verify成功のためにgateを偽装しない。root/package/site試験の数を合算して開発量/実機完成率にしない。

追加試験は**実装後に作成してから**コマンドへ登録する。未存在の試験が既に合格したとは書かない。

- hand：有限時刻/sequenceでopen/pinch/release/期限切れ・2手/手入替え・遅い子process/停止・異profileを検査し、invalid/unknown入力から永久job/料金/optical enableが0であることをassertする。
- 光学：独立の手計算可能な上下/同水平位置反例、既存4側面baseline、境界/pupil/誤差marginを保つproperty試験。生成器と同じ式だけをコピーした試験にしない。
- Pro import：二owner、同操作の同内容/異内容replay、応答喪失、CAS競合、localStorage失敗/不正100件、途中再起動、logout/owner切替、旧doneの非昇格、原文保持/削除取消を実Worker/D1で確認。実model/支払なし。
- 共通host：親/子失効、二端末同時budget予約、local/cloud/model schemeの非混同、readback/stop receipt遅延、connection未知/取消後のlate responseを確認。
- 商流：12gateごとのfalseを一つずつ戻す負例、unknown費目/未確認credit/PSP未選定でsalesEnabledを拒否。sandbox注文のduplicate/逆順webhook/部分返金/dispute・再起動を同orderで照合する。

実SDK/camera実行はMINI-03/MINI-04のexactprofile/許可後、Mini README/HAND-PREVIEW.md/GO-D405.md記載のコマンドをprivate profileで使う。光学通電、機構動作、PCB製作/書込、正式署名・flash、実販売/支払/発送は準備・対象/予算/復旧/本人条件を満たして別段階で記録する。ROCK_READYの成功で代替しない。

### 既存P01〜P13への不足補完と納入条件

- P10にMINI-01〜MINI-07（2動画・板膜なし/出口幾何/実Go描画/手深度融合/Pointer・CM3体験・内蔵media4操作から実job/Artifactへ/独立光学停止/最終PCB）を追加。旧P10の一般的adapter説明だけでは最新要求を覆えていなかった。
- P10/P02/P03へPRO-01/PRO-02（非破壊import、本人別job/Agent/成果/旧done境界）を追加。P03の別owner共有は本章の私用migrationから独立した明示共有。
- P10/P05/P09へMINI-08/PRO-03（clientとnative、鍵/本人、生体/復旧）。P06へ非eSIM端末の同契約子attachment、P07/P08へ二端末予算/商品代・継続料/作者料明細。
- P10にPRO-04のhardware販売gate12を明示し、P07/P08だけで商流完成としない。B05/WEB13/BIL02を共通planのP10 taskIds/受入へ結ぶ。
- P11へ光学/手入力/原本保存の誤差・P50/P95/P99/drop/誤click/光停止/熱電力と実利用完了を追加。P13へMini v08/52pと旧47p、Pro site46とroot、現Smith表記、未追跡差分・同SHA CI/配備/実機の境界を追加。

設計書、`data/design-document-index.json`、対応する全体/Tool詳細、planの各小タスク/依存/gate、既存evidence、`project.md`/進捗JSON/READMEを同じ対象変更で同期する。利用方法変更時はREADME本文も更新。集中試験→固定候補全verify→source保存→branch/PR/main同SHA CI→許可済み配備readback→実機/製造/商流の順に、各段階を独立記録する。仕様・source・受入証拠・未決条件/次の一手を残し、最新チャットが進行中ならその完了を推測せず次回開始時に読み直す。

追補snapshot：このPointer/CM/media追補は一回のsource読取りで閉じた。Mini最新開発turnは進行中留保、PDFのページ数と本文の番号付き章/後続節を分離し、次の開発者が実装開始時に差分を確認する。今回、動画/CMチャット再取得・実media処理・モデル/実機・配備は行っていない。

## 各節の完了記録

実装実行時には開始/判断変更/局所検証完了ごとに`project.md`と`data/project-status.json`の該当既存taskを同期し、`npm run project:update`でREADMEへ反映する。利用方法を変えた場合はREADME本文を同commitで更新する。OS component/Tool契約を変えるときは対応全体/Tool詳細と`data/design-document-index.json`を同期し`npm run design:check`。変更の集中試験→同一候補の必要な広い検査→`npm run verify`の順で記録し、未実行をpassへ置換しない。各Pのsource SHA/artifact hash/環境/command/期待/実結果/未解決条件を残し、文書保存・branch commit・GitHub保存・main統合・配備・実機・本番を別々に報告する。

## 公開Security・根拠の補足7件を受入へ反映する

- N01：v116 `docs/evidence/os-visual-release.json`の`sw.js`/`company-mark.png`にCSP不足FAIL。着手時の実配信version/commitへ固定し、実GET/必要ならSW更新/asset routeを確認する。mainの別SHAのsecurity CIやlocal header設定だけで解消扱いしない。認証APIの401/owner拒否、TLS、asset closure、保護headerを同じ候補で再検証し、公開入口の実装と設定へ戻して直す。v118も脆弱と決めつけず、成功/失敗を新証拠へ残す。
- N02：投稿Homeのlocal `publicDeployed:false`証拠は、後続公開Source/asset/実画面への対応付けを加える。
- N03：Xの本人投稿表示の根拠は`docs/evidence/x-account-integration.json`（本人確認、独立目視なし）を併記。Smith内feed受信とは分ける。
- N04：VM0等は過去の保存観測。P01で再測定し、引用証拠に無いAVF tap断定を使わない。
- N05：eSIMのOS受入は共通Core/runtimeの同一候補gate。Pixel全OS flash/QEMU完成の一律前提にしない。
- N06：v111費用表示は配備/HTTPまで。Market実操作の証拠不足はWallet操作成功から補わず、P03/P07の実UIでそれぞれ確認する。
- N07：過去のPixel鍵保持と現行claim journalのhost候補を区別。新candidateの再起動/鍵喪失/復旧を独立受入する。

## 公開Securityの追加gate（P01〜13とは別にN01を解消 / WEB04＋Security）

**起点。** `docs/evidence/os-visual-release.json` にはv116の `/sw.js` と `/company-mark.png` がCSP不足でFAILになった記録がある。v118の71 JS/CSS byte一致/匿名3API401は別の検査で、CSP不足解消の証拠ではない。過去FAILを現配信の脆弱性確定にせず、最新responseを同一artifactで読戻す。

**実行。** Source/配備version/commit/archive/Worker inventoryを再同定してから、実在する `data/web-security-policy.json`、`tests/web-security-policy.test.mjs`、`scripts/check-web-security-response.mjs` とSites静的配信/Worker-first経路を読む。CSPだけでなく既存universal/route headers、no-store、manifest、SW scope、icon、hash JS、camera permissionsの責務を保持する。まず読取で `npm run web:security:check -- https://avoado.si` を実行し、時刻/HTTP status/URL/配備version/期待値と実値を保存。対象はv118、既に更新されていれば現配信版を正確に記しv118解消と偽らない。scriptは公開GETのみだが現公開UI全受入とは別。

**修正と復旧。** FAILならpolicyを弱めず、static servingとWorkerのどちらがheaderを落とすか特定し、同じ候補で最小修正。`node --experimental-strip-types --test tests/web-security-policy.test.mjs`、local security response check、型/lint/build後のartifact読戻しを行う。公開反映は既存条件付き許可とrelease gate/対象配備手順を満たす同一candidateだけで実施し、prompt保存を公開修正完了としない。失敗配備は既存復旧手順で前版へ戻し、SW/cache更新・認証/保存の互換を確認する。CSP不足の解消には実配信 `/sw.js` と画像も含むresponse成功が必要。独立侵入試験・生体vault・請求本番の受入へ広げない。

**合格・責任。** ROCK/Webはpolicy/handler/static routingと回帰、EXTERNAL/Sitesは実配信header/DNS/TLS、JOINTは同版の公開responseと本人操作、OWNERは対象配備/サービス条件。記録は既存 `docs/evidence/os-visual-release.json` または既存Web/Security evidence系列へ追加し、一般ローンチ保留を維持する。baseline/design/projectと `npm run verify` の同一artifact結果、公開読戻し、未解消条件を別欄で残す。

## 実行・検証・引継ぎの共通手順

各Pで、目的、利用体験、ROCK/EXTERNAL/JOINT/OWNER、入出力、状態、保存、失敗、復旧、承認、合格条件、未決定の決め方を記録する。OS component/Sky catalog Toolに変更したときは`data/design-document-index.json`と対応する全体/Tool詳細設計を同じ変更で更新し、`npm run design:check`を通す。vendor/mr固定原本/hashは変更せず、adapter変更後は`python3 scripts/package-mr.py`で配布物を更新する。

着手/判断変更/検証完了でproject.mdとdata/project-status.jsonを更新し、`npm run project:update`でREADMEへ反映する。利用方法が変わる場合はREADME本文も同じ変更へ入れる。P番号ごとの進捗は既存taskと結び付け、ROCK_DONE、EXTERNAL_WAIT、OWNER_ACTION等の実態を記す。新しいpricing/権限/product方針は本人明示指示と理由がある場合だけ正本へ反映する。

最初は対象pathの小さい試験と必要なlint/型/契約checkを行う。固定統合candidateで次を実行し、exit codeと対象hashを保存する。

```sh
npm run project:update
npm run project:check
npm run baseline:check
npm run design:check
npm run typecheck
npm run verify
```

署名回帰はOpenSSL 3を要求する。作成環境では既定OpenSSL 4で停止したため、既存の`/opt/homebrew/opt/openssl@3/bin/openssl`（3.6.3）を確認し、`PATH=/opt/homebrew/opt/openssl@3/bin:$PATH npm run verify`で検証した。別環境ではその環境の既存OpenSSL 3の実pathを確認し、条件を弱めたり鍵/認証設定を出力したりして通さない。localhost試験にlisten権が必要な場合は環境上の権限不足とコード不具合を分ける。

Android変更時は`docs/os-prototype.md`のSQLite/SDK/APK/端末試験、native変更時は対象branchのLinux試験と`docs/native-os-validation.md`、Pixel full imageは`docs/phone-preview-20260911.md`と初回flash gateへ従う。host、fixture、virtual OS、Provider sandbox、実browser、実機、本番は別々の結果を記録する。未実行/環境不足/skipをpassにしない。

証拠は既存evidenceへ対象source/版/hash、コマンドとexit code、実行環境、同owner/contract/agent/model/job/revision、receipt/artifact hash、再起動/取消/失効/復旧、外部作用数、許可済み予算と実費、未決条件、次の一手を要約する。raw原稿・SIM秘密・credential・正確な端末識別・生体・全ログ/フレームをGitへ入れない。大きなimage/モデル/build outputはrelease artifactかGit管理外へ置く。

次回担当の最終報告は、(1)13件すべての実施内容と段階、(2)今回変えたfile/候補、(3)実測/証拠と反例、(4)残るEXTERNAL/OWNER条件、(5)具体的な次コマンド/復旧先、(6)文書保存/branch/main/CI/公開/実機/本番の別状態を含む。全13件の実装や実受入が残っているのに予算/時間/文書完成を理由に「全部完成」としない。外部待ちの間も独立した作業を進め、必要な最終判断だけ具体的候補で提示する。

## 自己点検

- P01〜P13をすべて取り込み、P13初期同期→P01/P02の優先と独立parallelを両立したか。
- RQ01〜RQ15（特にRQ12 QEMU、RQ13交換別gate、RQ14作者SDK、RQ15 ATM自社手数料0）、RQ16〜49、main側RQ50、研究87件/CORE01〜12/SI/Uの既存要求を欠落・混同していないか。
- eSIM導入/他OSclient/親子利用権、月16USD/従量/請求/入金/分配、Mini/Proの同契約OS反映と実driver/nativeを具体化したか。
- Agent設定/登録/実推論/成果保存、私用保存/一般共有、LLM提案/本人承認/Tool成功、画面停止/実停止、実行完了/入金を分けたか。
- 実装先/実在command/対象source/失敗復旧/合格証拠があり、外部待ちでもROCK作業を止めないか。
- 全verify/同SHA CI/公開readback/実機/Providerを別に扱い、未実行を成功へ置き換えていないか。

## 全機能180項目と10算法の照合・軽量分岐の追補（2026-10-24）

本人が追加提示した「内容を確認」チャット（01a1596a-9af6-7a23-800a-22be115e3275）の全3turnを確認した。14分野180項目＋末尾10中核算法は必要機能の棚卸しであり、実装済み一覧ではない。元75unitだけでは180項目中123件は詳細あり、56件は参照止まり、1件は外部基盤との責任境界。10算法も8件は詳細あり、2件は参照止まりだった。未割当0を網羅済みと呼ばず、以下20unitへ56項目＋算法2件を明示対応した。元P01〜13と75unitを保持し、合計95unitとする。全行対応は `data/rockstaros-full-function-coverage.json`。各行に元分類・原文・根拠・担当lane・旧unit・追加unit・受入層を残す。BGP/FTP等は外部stackの利用/境界・必要adapterとして追跡する。

実行は `docs/prompts/rockstaros-development-chats.md` から11の軽量チャットへ分ける。registryがID/所有/依存の正本で、全履歴の自動同期は仮定しない。完了済みbootstrapを繰り返さず、一つの小unitを実装・検収・保存する。統合担当・Git・実装・補助・検収・元Smithを合計してactive最大3とし、統合とGitが別activeなら各1枠と数える。shared schema/workflow/全体status/Sites/Git操作はsingle-writer。実装受入、文書保存、GitHub保存、main統合、配備、実機、provider sandbox、本番を分離する。

**現在地の追補**：GitHubのfresh読戻しは2026-10-24T04:16:26.119Z、main7304e449／branch951d82d5、main同SHA22checks、branchはsource-preparation1件のみ。Mini最新完了turnはv0.9/PDF53ページ。理想6面80㎡で未達0は小型少数表示部の採用合格ではなく、10mm非出射帯は708未達。実光学/手/低眩しさ/最終PCBは未受入。本文のv0.8/52ページは履歴snapshotとして読む。元SmithはPixel画面操作と端末内AIを復旧し、本人がPC内試用Eve接続と縦断試験を承認して進行中。元Smithの実機leaseが終了するまで新OS/Smith/Eve担当は実機を操作しない。旧USBのみ/Terminal errorの状態へ戻して扱わず、同artifactの最新根拠を再読する。一般公開は保留。

## 通信・安全・同期・AI・運用・応用の追加詳細20unit

今回はプロンプトの詳細化と担当分岐。実装・実機・本番の完成表示ではない。既存75unitを保持し、この20unitを追加する。独立180行監査で詳細不足だった56行を各feature IDで明示対応した。内容/実装/受入の充足は将来検証する。

## 共通の分岐規則

- 今回の成果は詳細指示と軽量chatの初回bootstrap。製品runtime/共通契約の編集、commit/push/公開/実機/課金/model取得/外部送信はこの作成作業では行わない。分岐台帳/packet等の文書は親、各lane status JSONは当該laneだけが更新する。
- P13前半の保全/同SHA比較→P01読取診断並行→必要最小Common Core→短い新Agent P02をcritical pathに保つ。全追加unitをP02の直列前提にしない。
- Root/main/Source/Sites統合はP13へ依存。既存同名schemaを片側置換せず二重実装を避ける。
- 提案enum/algorithmは実装済み表示でない。現WorkJob状態/revisionへ対応表とversioned migrationを先に定義。
- validationは入口/対象file実在確認だけで今回は未実行。新仕様負例testsを追加し局所試験、統合時npm run verify。
- 完了証拠はsource+artifact/proof hash、環境/時刻/command/結果/未受入/復旧を保存。host/fixture/browser/sandbox/実機/productionを別記録。
- 既存正本/RQ/task/index/project/statusは将来実装と同変更で同期。この指示書から新RQ/値/Provider/実資金権限を創作しない。

11 laneは `git / os-pixel / smith / eve / mini / pro / esim / billing / wallet / game / web-ops`。独立SOS/通信はos-pixel、Materialはmini、学習はeve、MCP/外部feedはsmith。

<a id="net-01"></a>

## NET-01 — 経路・IP/DNS/TLS・信頼時刻・VPNの送信前検査

**laneId**: os-pixel

**親P**: P01 / P02 / P05 / P09 / P11

**既存task**: NET01 / OS10 / DSP01

**対応契約**: CORE02 / CORE05 / CORE07 / CORE12

**棚卸し行**: F001 / F003 / F004 / F011 / F012

**source/正本**: `docs/network-transport-design.md` / `docs/device-support-architecture.md` / `lib/rockstar-eve-interaction.ts` / `scripts/stage-pixel-runtime-transport.py` / `tests/test_stage_pixel_runtime_transport.py` / `systems/rock-star-os/tests/test_contract_runtime_clock_isolation.py`

**現在地**: NET01契約と既存transportは存在。全経路/VPN/時計ずれの現Pixel受入は未了。旧障害を現在値にしない。

**手順/算法**: ①OS/OEMのIPv4/6・IP更新・route・TCP/UDP・DNSをadapter観測。device/executor/provider別probe。②hostname/TLSを検証しHTTP降格不可。③OS時刻/単調clock/認証済みserver observationを照合しexpiryの根拠を固定。④capability∩owner policy∩到達性∩費用条件で経路選択、VPN必須なら断/漏えい/split-tunnel逸脱をfail closed。⑤切替後は再認証→同job照合→dispatch。独自TCP/BGP/NTP/VPN stackは作らない。 IP取得はDHCP/static等OS観測源、probing/unknown/degraded/constrained/offlineの閾値/有効期限/理由を版付きpolicyで決める。時計不明時はexpiry依存操作fail closed。VPN kill switchはOS capabilityを確認しIPv6/DNS/reboot leakを試験。

**I/O**: 入力=owner/device/job/revision、origin/scope、route/VPN/clock観測と期限。出力=link/IP/DNS/connect/read/HTTPS別状態、選択経路、observedAt/uncertainty/理由/retryAt。

**状態/保存**: 観測とauthorityを分離。owner別に最終観測/cursor/版を保存、clock不明は期限を延ばさずunknown。ネットの提案enumは既存workflow状態へ明示投影。VPN secret/本文/credentialは診断外。

**移行**: P13のRoot/Source transport差を解決しjob ID/stop journalを維持。単一online booleanから層別観測へoptional追加、未観測はunknown。

**失敗/復旧**: 端末断/guest断/Provider断を識別。結果不明送信は同request ID照合、通常回線/cloudへ無断切替/有料再送しない。時刻再起動はboot世代付きmonotonicを再評価。

**負例**: DNS成功TLS失敗/証明書例外 / IPv6更新/route変更 / VPN kill/DNS leak/split tunnel / 時計巻戻し/未来/monotonic reset / 端末だけ/guestだけ断 / timeout後到着/別owner / DHCP/静的設定の観測不足 / IPv6 VPN漏えい/再起動 / 閾値境界/古い観測

**実在検証入口・今回未実行**: `python3 -m unittest discover -s tests -p test_stage_pixel_runtime_transport.py` / `PYTHONPATH=systems/rock-star-os/src:systems/rock-star-os/os python3 -B -m unittest discover -s systems/rock-star-os/tests -p test_contract_runtime_clock_isolation.py` / `npm run device-support:check` / `npm run design:check`

**受入**: 経路10項目を各fixtureに割当て、同jobで断/切替/時計/VPN違反時dispatch拒否、二重作用/計上0。新VPN/経路負例を追加し既存checkだけで完成にしない。実回線/衛星は別gate。

**責任/外部条件**: ROCK=選択/診断/強制、EXTERNAL=OS/OEM/modem/carrier/VPN/DNS/TLS/時刻源、JOINT=exact端末/回線/Linux実測、OWNER=回線/送信先/有料経路。

**棚卸しの具体的不足（このunitの実装・負例・受入へ反映）**:

- F001 IPアドレス取得、DNS名前解決、TCP・UDP通信。 NET01でOS stack再利用、IPv4/IPv6/DHCP/route/DNS/TCP/read/UDP各観測とunknown/probing/失敗分類・fixture。
- F003 通信経路の切替：Wi‑Fi、携帯回線、有線、対応する衛星回線。 NET01でWi-Fi/携帯/有線/契約済衛星のpolicy/cost/reachabilityと切替後同ID照合。
- F004 圏外、低速、高遅延、通信制限の検出。 degraded/constrained/offlineの閾値/観測源/期限/理由表示/fault注入。
- F011 ネットワーク時刻の検証。 OS同期源/署名server時刻/単調時計、unknown時failclosed、drift/rollback試験。
- F012 VPNや通信漏えい防止が必要な端末での接続制御。 VPNpolicy/kill switch、VPN断・IPv6/DNS漏えい・再起動negative test。

<a id="net-02"></a>

## NET-02 — ordered通知/進捗cursorとoffline競合からの再接続

**laneId**: os-pixel

**親P**: P02 / P03 / P10

**既存task**: NET01 / WEB04 / SKY21 / OS10

**対応契約**: CORE03 / CORE06 / CORE12 / SI04 / SI05

**棚卸し行**: F006 / F008

**source/正本**: `docs/network-transport-design.md` / `components/eve-sync-workspace.tsx` / `lib/eve-runtime-sync.ts` / `lib/eve-device-sync.ts` / `lib/workflow.ts` / `tests/eve-runtime-sync.test.mjs` / `tests/eve-device-sync.test.mjs`

**現在地**: 既存同期/visibility refreshは存在。全端末Push/常時streamの実配達は未受入。一般競合同期の詳細はSYNC-01で補完。

**手順/算法**: owner+job+eventIdでdedupe、server revision/単調cursorで順序判定。gapは差分、cursor失効は認可snapshot。Push/SSE/WebSocketは再取得の契機、payloadを状態の権威にしない。保存済みstop/失効/予算を再接続dispatch前に再評価。 自動retryは冪等readを中心に、試行数/最大待ち/期限を固定したexponential backoff+bounded jitter。回線復帰の集中をowner/device単位で抑制しstopで待機timerを解除。effectはretry前に同key照合、Retry-Afterを尊重。

**I/O**: 入力=認証event metadata/saved cursor/current owner。出力=最新revision/未取得/遅延/未読・既読。ackは承認でもTool成功でもない。

**状態/保存**: owner/device別cursor/preference/dedupe watermarkを保存。通知に本文を既定露出せず、logout/revokeで購読解除。既存pollingをfallbackに残す。

**移行**: 旧時刻順/通知IDのみのclientは認可snapshotで収束。新イベント版とdual readerを追加し別job storeを作らない。

**失敗/復旧**: 順序逆転でcompleted/stoppedをrunningへ戻さず、unknown/停止未確認は保持。stream切断で仕事失敗/再実行に変換しない。

**負例**: duplicate/out-of-order / cursor gap/expiry / 古いrunning/stop後late event / owner切替 / 購読拒否/expired endpoint / offline両側更新 / 指数backoff上限/期限 / 復帰集中/429 / backoff待機中stop

**実在検証入口・今回未実行**: `node --experimental-strip-types --test tests/eve-runtime-sync.test.mjs tests/eve-device-sync.test.mjs` / `npm run typecheck` / `npm run test:api`

**受入**: 二clientで同jobのgap/逆順/logout/stop後復帰を再現し同revisionへ収束、外部作用再送0。fixture/実Push/実Pixelを分ける。

**責任/外部条件**: EXTERNAL=OS/browser/provider通知、JOINT=実配達/切替、OWNER=通知許可/quiet設定。Smithの通知Tool/MCP接続はMCP-01へ。

**棚卸しの具体的不足（このunitの実装・負例・受入へ反映）**:

- F006 接続の再開、タイムアウト、指数バックオフによる再試行。 読取のみ自動retry、effectは同key照合、回線復帰の集中抑制/指数バックオフ負例。
- F008 リアルタイムの進捗配信と、再接続後の差分取得。 認証SSE/WebSocket/既存pollの採否、owner cursor/snapshot fallback/gap・再接続をNET01+Eveへ。

<a id="net-03"></a>

## NET-03 — 通話media・受領・通信実費の独立adapter

**laneId**: os-pixel

**親P**: P05 / P07 / P10 / P11

**既存task**: NET01 / DSP01 / B03 / MAT16 / MAT17

**対応契約**: CORE02 / CORE04 / CORE07 / SI06 / U01 / U02

**棚卸し行**: F009 / F010

**source/正本**: `docs/network-transport-design.md` / `docs/avocado-schoolbag-safety-device.md` / `docs/sky-billing.md` / `lib/earning-receipt.ts` / `lib/rockstar-eve-interaction.ts`

**現在地**: 通話Provider/単独回線/衛星通常音声は未選定。試験音/読み上げは通話成功でない。mainのsky-cloud-monthly-storeはP13で統合対象としRoot既存扱いしない。

**手順/算法**: OS/Provider受入stackでsignaling/media/相手受領を別machine。帯域/遅延/損失→品質調整→再接続/終了。device/executor byte推定、AI meter、carrier invoiceを別source/unit/currency/periodで集約しP07原子予約へ渡す。通信byte推定だけで請求しない。

**I/O**: 入力=相手/端末capability/owner consent/media scope/quote上限。出力=session別の接続/品質/受領/終了理由、estimated通信量とconfirmed実費receipt。

**状態/保存**: session ID/同意/時刻/品質集約/usage source IDを保存。録音/常時micなし。通信費と16USD/AI/税/888c/ATM0/Market10%は独立line。

**移行**: audio outputから通話権限を推定せず新moduleを明示追加。P07のusage store/leaseを共有し並行課金台帳を新設しない。

**失敗/復旧**: media断を連続到達と呼ばない。Provider遅延/不明receiptは保留、同session照合で二重session/請求を防ぐ。通話断でも独立SOSを維持。

**負例**: signaling成功media断 / mic denied/相手拒否 / stop中late answer / 重複usage/単位通貨違い / unknown rate/cap枯渇 / 衛星非対応

**実在検証入口・今回未実行**: `node --experimental-strip-types --test tests/settlement.test.mjs tests/billing-worker.test.mjs` / `npm run device-support:check` / `npm run design:check`

**受入**: 先にadapter/費用fixtureを追加。採用Provider・exact回線/端末で接続/断/再接続/終了/実費読戻しを別gate。未選定通話はunsupported、未知単価は0にしない。

**責任/外部条件**: EXTERNAL=OEM/carrier/call/請求Provider、JOINT=音響/通信/明細実測、OWNER=相手/録音有無/単価上限/契約。

**棚卸しの具体的不足（このunitの実装・負例・受入へ反映）**:

- F009 音声・映像を扱う製品での通話接続、帯域調整、切断復帰。 対応製品/Provider、通話3面state、loss/帯域/再接続/終了理由・sandbox。
- F010 通信量と外部API費用の計測。 送受信byte推定とProvider確定料金を別保存、欠測/route切替/上限・二重計上負例。

<a id="webops-01"></a>

## WEBOPS-01 — 主要flowのa11y・低速・touch/keyboard/reader受入

**laneId**: web-ops

**親P**: P02 / P03 / P11

**既存task**: WEB04 / WEB06 / WEB13 / HOME01

**対応契約**: CORE08 / CORE12

**棚卸し行**: F140 / F141 / F142

**source/正本**: `docs/workstreams/05-web-pwa-sites.md` / `docs/rockstaros-complete-design.md` / `components/eve-sync-workspace.tsx` / `components/sky-workspace.tsx` / `components/system-maintenance.tsx`

**現在地**: 既存画面/回帰と全主要flowのaccessibility一周を区別。狭幅/reader/低速の一括合格は未受入。

**手順/算法**: Home→Eve依頼→条件確認→実行/停止→成果、Smith追加、Wallet/設定をflow別に固定。semantic HTML/label/visible focus/touch領域/contrast/reflow/reduced motionを実装。live regionは状態変化を集約しtoken毎に読み上げない。 P11同一回線/low-end profileで初期bytes/初期表示/input delayを計測しbudgetを先に固定。重いmedia/CU/gameは必要時import、skeletonからtimeout/errorへ遷移。保護機構を速度目的で外さない。

**I/O**: 入力=viewport/input modality/preferences/current job。出力=同じ状態/費用/失敗へ到達できる操作と読み上げ。

**状態/保存**: 下書き/設定をowner別保存しdialog終了focusを起点へ戻す。display stateとWorkJob authorityを分離。

**移行**: 既存componentsを改善し別job schema/二系統UIを作らない。Smith正式名/日英の意味/aria名を合わせる。

**失敗/復旧**: network失敗で入力保持、再送前は同job照合。focus trap/overflow/承認できない状態をエラーとして修正。

**負例**: keyboard only/reader / zoom/319px/横画面 / reduced motion / 長文/空エラー / busy/stop pending連打 / 低速/接続断

**実在検証入口・今回未実行**: `npm run typecheck` / `npm run lint:product` / `npm run build` / `npm run release:web-assets:check`

**受入**: 新flow別UI回帰に加え採用browser/reader/keyboard/touchで成功・停止・失敗復帰を記録。build/lintを実a11y受入へ転用しない。 低速profile/低性能端末条件・byte/time budget・before/after・欠測を残す。

**責任/外部条件**: JOINT=同候補/支援技術/実操作、OWNER=対象利用者/設定/試用同意。全障害対応や医療効果を宣言しない。

**棚卸しの具体的不足（このunitの実装・負例・受入へ反映）**:

- F140 端末幅、タッチ、キーボード、読み上げへの適応。 WEB04/CORE12のtouch/keyboard/SR/zoom/reducedmotion各route合格・実UI検査unit。
- F141 色のコントラスト、フォーカス表示、押しやすい操作領域。 実color/focus/dialogtrap/戻り先/操作領域をCSS/route test＋実読み上げで確認。
- F142 低速回線でも開ける軽量な画面と必要時だけの読み込み。 low-end/slow-network profile、必要時import/byte-time budget/skeleton/error復帰。

<a id="webops-02"></a>

## WEBOPS-02 — PWA install/update/offlineと通知許可の代替導線

**laneId**: web-ops

**親P**: P02 / P05 / P09 / P13

**既存task**: SYS02 / SYS07 / SYS08 / SYS09 / WEB04

**対応契約**: CORE05 / CORE08 / CORE09 / CORE12

**棚卸し行**: F143 / F144

**source/正本**: `app/manifest.ts` / `public/sw.js` / `public/offline.html` / `components/system-maintenance.tsx` / `tests/pwa-installability.test.mjs` / `tests/pwa-offline.test.mjs` / `tests/service-worker-update.test.mjs`

**現在地**: manifest/非個人offline/owner起動update/通知permission-testは実装あり。Root/配布SourceのSW bytes差、実Push購読/全配達は別。

**手順/算法**: manifest identity/scope/icons/HTTPSを検査。waiting SW→owner更新同意→draft保全→activate。cacheは非個人shell限定でAPI/auth/private/no-store/redirect除外。通知は明示requestPermission、拒否/unsupportedならapp内未読/refreshへ。購読/送達/閲覧/承認を分離。

**I/O**: 入力=SW lifecycle/build/draft、device permission、owner preferences。出力=install/update/offline状態、未取得明示、通知代替と同jobへの認証リンク。

**状態/保存**: cache版とaccepted build、owner/device購読/preferenceを保存。lockscreen内容最小、logout/revokeで解除。quiet modeは独立SOSを抑えない。

**移行**: 既存cache prefixのみ掃除、私有成果を消さない。旧pollingを残しNET-02 cursorと共用。Sourceの即skipWaiting差をP13で修正。

**失敗/復旧**: 更新失敗は旧受入版維持。offline HTMLでAPIを代替せず仕事は未取得。通知失敗は仕事失敗でなく、endpoint失効を無限再購読しない。

**負例**: 未同意activate / private cache/owner switch / API401がHTML化 / offline未cache route / permission denied/expired endpoint / update中draft/stop

**実在検証入口・今回未実行**: `node --experimental-strip-types --test tests/pwa-offline.test.mjs tests/pwa-installability.test.mjs tests/service-worker-update.test.mjs` / `npm run build` / `npm run web:security:check`

**受入**: 同buildでinstall→拒否/承認更新→offline→restart→logout/login。漏えい/二重送信0。通知許可/拒否/非対応から状態へ到達し実Pushは別実配達記録。

**責任/外部条件**: EXTERNAL=browser/PWA/Push、JOINT=採用Pixel/iPhone/desktop、OWNER=install/更新/通知/表示/quiet設定。

**棚卸しの具体的不足（このunitの実装・負例・受入へ反映）**:

- F143 PWAの導入、更新、オフライン時の状態表示。 SYS08/09のSW/manifest再利用、install/update prompt/reload/失敗復旧/offlineunit。
- F144 通知の本人許可と通知失敗時の代替表示。 SYS02:許可拒否/取消/非対応/期限/配信失敗→同jobinbox fallback、eventdedup。

<a id="webops-03"></a>

## WEBOPS-03 — 3domains・release読戻し・導入診断/export/support導線

**laneId**: web-ops

**親P**: P03 / P09 / P10 / P13

**既存task**: WEB04 / WEB06 / WEB13 / DSP01 / SYS02

**対応契約**: CORE06 / CORE08 / CORE09

**棚卸し行**: F013 / F145

**source/正本**: `lib/product-domains.ts` / `components/product-domain-navigation.tsx` / `services/sky-web/domain-router.mjs` / `tests/product-domains.test.mjs` / `tests/sky-domain-router.test.mjs` / `components/system-maintenance.tsx` / `lib/operations.ts` / `data/design-document-index.json`

**現在地**: 各過去配備証拠と現在同SHAを分離。正式hostはavoado.si/avocadomini.si/avocadopro.si、一般ローンチ/実機/発売は別。

**手順/算法**: host allowlistで総合Smith/Mini/Pro routing。DNS/TLS対象/期限/HTTPS/build/assets/headersを別観測しrelease hashへ結合。導入はservice access/通信/client/native別診断。exportはowner認証→対象選択→artifact hash/版manifest→sanitized packet確認、support送信は別同意。 公開media inventoryにoriginal/source URL・hash・license/使用同意・概念/生成/実機写真・撮影対象/版・alt/captionを記録。ビルドで未分類/権利不明mediaを拒否し、生成renderを実物写真や組立証拠に見せない。

**I/O**: 入力=host/path/release hash/deployment ID、owner/capability/選択job。出力=route/readback/診断、期限/削除付きexport manifest。

**状態/保存**: source/deployment/env版と取得時刻を保存。domain linkはCORS/認証共有を与えない。localhost Lab/秘密/原稿/serial/生体は公開bundle/support既定除外。

**移行**: P13でRoot/main/Source/Sites blobを比較し既存route/redirect表を保つ。export変換は元schema/revisionを明記しtombstone/失効世代を保持。

**失敗/復旧**: DNS/TLS/build不一致は完了表示を止めrollback候補。export容量/途中失敗は元データ保持、restoreはpreviewからで外部作用を再実行しない。

**負例**: unknown/typo host/open redirect / Lab漏えい / Workerだけ旧版 / 別owner export/path traversal / hash破損/secret混入 / restore削除済み復活 / 概念renderが実機写真表示 / 未分類/権利不明media / alt欠落

**実在検証入口・今回未実行**: `node --experimental-strip-types --test tests/product-domains.test.mjs tests/sky-domain-router.test.mjs tests/web-security-policy.test.mjs` / `npm run release:web-bundle:check` / `npm run release:web-assets:check` / `npm run web:security:check` / `npm run test:api`

**受入**: 同releaseの3URL導線/HTTPS/headers/assets読戻し、owner export再読hash一致/越境拒否/削除保持。GitHub保存/main/Sites版/実配備/ローンチを別record。 F145は公開assetとcaptionを全件inventoryへ照合し、概念/生成/実写真を画面で判別可能にする。

**責任/外部条件**: EXTERNAL=DNS/TLS/hosting、JOINT=同配備readback/復元UI、OWNER=公開範囲/持出し/送信先。今回は配備/送信しない。

**棚卸しの具体的不足（このunitの実装・負例・受入へ反映）**:

- F013 DNS・TLS証明書・公開ドメインの監視。 3domain期限/対象/HTTP/version監視、更新失敗/期限接近・通知/復旧をOperationsへ。
- F145 公開画像、製品構想、実機写真の区別。 WEB18 media inventoryへoriginal/hash/概念・生成・実写真/利用権/明確な表示を追加。

<a id="ops-01"></a>

## OPS-01 — SLO/usage/stop/採算の観測と故障注入

**laneId**: web-ops

**親P**: P02 / P07 / P11 / P13

**既存task**: SYS02 / WEB04 / OS10 / B03 / B05

**対応契約**: CORE03 / CORE04 / CORE09 / CORE12 / SI08

**棚卸し行**: F171 / F179

**source/正本**: `lib/workflow.ts` / `lib/eve-runtime-sync.ts` / `services/sky-agent-runtime/src/worker.ts` / `components/system-maintenance.tsx` / `scripts/lib/sky-launch-audit.mjs` / `tests/sky-launch-audit.test.mjs`

**現在地**: 診断/launch auditは存在。統合SLO/採算/incident観測の達成値は未実測を成功としない。

**手順/算法**: trace→owner pseudonym/job/revision/attemptを束縛。queue age/heartbeat/stop ack latency/unknown/reserved/settled usage/失敗を集約、閾値+継続窓+抑制でalert。AI/通信/hosting原価と確定収入を同期間/通貨で照合し、推計利益/現金/未照合を分離。 customer/contract/job/provider transaction IDとsupport時間・直接費を同期間で照合し差額を表示、売上見込/入金/利益を分離。稼働率/失敗率の分母・観測窓・SLO担当/runbookを先に確定する。

**I/O**: 入力=sanitized events/metrics/confirmed cost/revenue/source+deployment hashes。出力=環境別health/alert/incident link/鮮度と採算の根拠。

**状態/保存**: 原稿/credential/serialなし。event/ingest時刻、保持/sample/削除policy、SLO分母とunknownを保存。無観測をgreenにしない。

**移行**: 既存audit/receipt参照、別仕事/費用正本を新設しない。観測fieldはoptional→dual read→cutover。

**失敗/復旧**: monitor断自体をunknown alert。自動復旧は許可probeまで、停止不明/決済の再送は不可。赤字/不明単価は無制限補填せず上限/提供条件へ戻す。

**負例**: metrics欠落/false green / clock skew/alert storm / duplicate ingest / secret log / 予約滞留 / 原価未確定を利益扱い / サポート時間欠測 / 別顧客cost誤帰属 / 確定収入と見込混合

**実在検証入口・今回未実行**: `node --experimental-strip-types --test tests/sky-launch-audit.test.mjs` / `npm run typecheck` / `npm run release:check`

**受入**: worker停止/遅延/予約滞留/監視断/原価未確定で正しいalert/unknown、重複0。測定window/分母/不確かさを明示しSLO/収益保証を作らない。

**責任/外部条件**: EXTERNAL=hosting/Provider metrics/明細、JOINT=故障/復旧演習、OWNER=閾値/保持/運営通知先/費用上限。外部通知は別許可。

**棚卸しの具体的不足（このunitの実装・負例・受入へ反映）**:

- F171 稼働率、遅延、失敗率、キュー滞留、請求差額、資源費用の監視。 G04/LCH06+Opsのmetric/event schema/SLO/閾値/dashboard/alertdedup/費用cap・担当runbook。
- F179 売上と入金、直接費、サポート時間を同じ顧客・仕事単位で照合。 B02/B03/B05+Opsのcustomer/job/契約/取引/費用/支援time・差額/採算照合unit。

<a id="ops-02"></a>

## OPS-02 — incident・限定保守・端末/Provider停止と監査復旧

**laneId**: os-pixel

**親P**: P05 / P09 / P13

**既存task**: SYS12 / SYS13 / OS10

**対応契約**: CORE05 / CORE06 / CORE09

**棚卸し行**: F041 / F172 / F173

**source/正本**: `docs/security-incident-response.md` / `data/device-emergency-access-policy.json` / `services/operator-dock/src/operator-control.ts` / `services/operator-dock/src/device-channel.ts` / `android/operator-agent/src/main/java/dev/rock/operator/agent/OperatorCommandVerifier.java` / `tests/operator-control.test.mjs`

**現在地**: Dock/Agent source/emulator/試験署名Pixel限定は既存。本番credential/StrongBox enrollment/Device Owner/Provider失効/侵害演習は未受入。

**手順/算法**: incident→対象限定quarantine→未使用grant失効/新dispatch停止→既送信/usage照合→復旧審査→期限付き解除。hardware署名/nonce/device/expiry/scope/counterを端末でも独立検証し二重ack拒否。管理server単独/LLM/MCPは命令権なし。 detect→triage→isolate→許可先notify→reconcile→restore→postmortemをincident記録へ固定し、各step担当/期限/解除条件とMTTRを測る。notify/remote stopの未送達はunknownのまま。

**I/O**: 入力=incident/reason/target/action/期限/hardware assertion。出力=queued/ack/applied/rejected/expired、2KiB以下の既存sanitized診断。

**状態/保存**: 専用Dock D1と端末HMAC監査追記のみ。本人へ保守表示/事後通知。写真/原稿/Wallet秘密/画面/mic/camera/任意rootを収集しない。

**移行**: 既存policy/別UID/SELinux/別鍵を維持。二台目はdynamic enrollment前に増やさず解除も監査。AUTH-01 credential inventoryへ接続。

**失敗/復旧**: offline期限超過命令破棄、即時到達保証なし。boot不能はUSB純正復旧、署名失鍵はHSM別経路。unknown資金を自動返金しない。

**負例**: expired/replayed/wrong-device / 管理server偽装 / LLM/MCP起動 / private read/root shell / 監査改変 / offline後期限切れ

**実在検証入口・今回未実行**: `node --experimental-strip-types --test tests/operator-access-auth.test.mjs tests/operator-control.test.mjs tests/operator-device-channel.test.mjs tests/operator-dock-isolation.test.mjs` / `npm run operator-dock:check`

**受入**: 紛失/悪意Tool/偽更新演習で対象だけ隔離、監査読戻し/安全解除。source/emulator/test signed/productionを別gate、factory resetは実行しない。 模擬事故の開始/検知/隔離/照合/復旧時刻とMTTR/未復旧理由を保存。

**責任/外部条件**: 既存事前登録policy=承認範囲、EXTERNAL=hardware/OEM/provider、JOINT=StrongBox/DeviceOwner/復旧演習、OWNER=対象/実登録/復旧条件。

**棚卸しの具体的不足（このunitの実装・負例・受入へ反映）**:

- F041 監査記録と、運営者による限定保守操作の追跡。 Operator Dockのbreak-glass grant/対象/期限/本人通知/全操作receipt/失効・改ざん拒否。
- F172 異常検知、障害連絡、事故対応、復旧訓練。 detect/triage/isolate/notify/reconcile/restore/postmortem・模擬事故/復旧訓練/MTTR。
- F173 監査ログの保護と、個人情報を除いた診断の取得。 Security-Opsのappend-only integrity/権限/PIIredaction/export/restore負例。

<a id="ops-03"></a>

## OPS-03 — 鍵期限/署名/SBOM・abuse/supportの運用閉ループ

**laneId**: web-ops

**親P**: P03 / P05 / P09 / P13

**既存task**: SYS01 / SYS02 / SYS13 / WEB04 / RLS02

**対応契約**: CORE05 / CORE08 / CORE09

**棚卸し行**: F040 / F174 / F175 / F176

**source/正本**: `docs/security-incident-response.md` / `scripts/check-release-signing.mjs` / `scripts/check-release-readiness.mjs` / `scripts/check-web-asset-closure.mjs` / `services/operator-dock/src/access-auth.ts` / `lib/operations.ts`

**現在地**: 鍵/release/SBOM checkは既存。専用abuse/support API/人員/実受付・本番鍵rotationは未確認。新Provider/窓口を創作しない。

**手順/算法**: ①root/release/OTA/AVB/APK/issuer/device/operator/Provider別公開fingerprint/期限/復旧責任をinventory→期限alert→新trust review→重複窓→旧鍵拒否。②artifact hash/SBOM/依存license/署名を同候補へ結合。③匿名abuseとowner supportを別scope、size/rate/idempotency/retention固定、report→triage→対象限定制限→review→解除。LLMは分類提案のみ。 依存lock/PURL/build chunk/SBOMを突合し脆弱依存の影響artifact/修正期限/reviewer/再配布gateを決める。abuseはappeal/異議申立て・解除理由を追記し作者本人認証と私有データを保護。

**I/O**: 入力=公開鍵/証明書/revocation/epoch、artifact/SBOM、最小report/同意packet。出力=期限/影響一覧、release可否、case receipt/status/retryAfter。

**状態/保存**: 秘密はrepo/log外、公開fingerprint/証拠hash/追記監査のみ。support本文は役割/保持/削除付き、operator命令権限なし。

**移行**: 既存署名manifest/schemaをdual read、旧snapshotで失効を戻さない。第三者Toolをplatform鍵で再署名しない。supportは元job参照だけ。

**失敗/復旧**: rotation失敗は脆弱trust無期限延長不可。受付不達/429は未受付draft。障害/abuse制限でもデータ回収/独立安全を保持。

**負例**: expired/wrong-role/revoked key / old trust snapshot / 改変SBOM/asset / spam/large/script report / 別owner参照 / 偽operator/LLM制裁 / 依存lock/SBOM不一致 / 脆弱依存の旧release混入 / 異議申立て後の監査欠落

**実在検証入口・今回未実行**: `npm run release:signing:check` / `npm run release:check` / `npm run release:web-assets:check` / `node --experimental-strip-types --test tests/operator-access-auth.test.mjs tests/web-security-policy.test.mjs` / `npm run typecheck` / `npm run release:sbom`

**受入**: 合成rotation/失効/期限境界/復旧失敗、同候補SBOM整合を受入。新support負例tests/API/運用演習後に実受付合格、未確定人員/応答時間は未決。

**責任/外部条件**: OS=鍵/Broker/端末強制、WebOps=inventory/窓口、EXTERNAL=CA/HSM/provider、JOINT=信頼更新/訓練、OWNER=実鍵生成/公開/窓口/保持。

**棚卸しの具体的不足（このunitの実装・負例・受入へ反映）**:

- F040 秘密鍵、APIキー、支払い情報の保護とローテーション。 credential inventory/最小権限/期限/二鍵切替/失効/漏えい対応・中断job照合。
- F174 鍵、証明書、ドメイン、Provider資格情報の期限管理。 Opsのowner/expiry/renewal/二鍵/失効/復旧・時計ずれ/更新失敗/稼働job訓練。
- F175 脆弱性、依存部品、ライセンス、SBOMの管理。 SYS03/10/11のlock/PURL/buildchunk/SBOMを再利用しreview/更新期限/影響/再配布gate。
- F176 不正利用、スパム、悪質な作者商品への対応。 SKY20/21+Securityのreport/triage/quarantine/appeal/restore、ratecap・監査・私有data保護。

<a id="wallet-01"></a>

## WALLET-01 — 一般入金/外部railと確定資金の由来

**laneId**: wallet

**親P**: P07 / P08 / P09

**既存task**: WLT01 / WLT02 / WLT03 / WLT04 / WLT05 / WLT06

**対応契約**: SI06 / U02 / U03 / CORE09

**棚卸し行**: F126 / F127 / F131

**source/正本**: `docs/workstreams/03-wallet-billing-providers.md` / `docs/external-wallet-fund-provider-boundary-20260913.md` / `lib/operations.ts` / `lib/financial-provider.ts` / `lib/rock-wallet.ts` / `tests/wallet-backend.test.mjs` / `tests/rock-wallet.test.mjs`

**現在地**: owner売上/費用/取消API、受取署名/USDC照合sourceあり。一般外部入金全rail/実回収/出金Providerは未受入。

**手順/算法**: deposit/sales/fee collection/withdrawalを別manifest capability。署名/chain/account/asset/amount/finalityを独立readbackしpending→confirmed→available。user入力/LLM/仕事成功/Earning Receiptだけでcreditしない。現fee collector888c上限を一般deposit上限へ転用しない。 Earning Receiptは同ownerの完了した非sample execution/tool/time/currencyへ束縛し、Provider取引のfinality/取消可能性を独立照合。sale candidate→deposit→hold→allocation→withdraw request→paid→着金確認を別状態で保存し、出金受付を着金にしない。

**I/O**: 入力=owner binding/authenticated Provider event/integer amount+currency/external transaction+key。出力=pending/held/available/rejectedと由来receipt。

**状態/保存**: cash/売上見込/Earning Receipt/usage invoiceは別entity。既存journal/予約を共有しavailable/reserved/settledの不変量を保持。

**移行**: Wallet/商品schema/SDKを調べ既存adapterへ追加、並行ledger/無認証deposit APIを作らない。P07/08 invoice/作者精算は既存権威参照。

**失敗/復旧**: duplicate/遅延/reorg/receipt欠落は保留と照合、二重credit拒否。refund/disputeは元仕訳参照の逆仕訳、履歴編集しない。

**負例**: fake signature/receipt / wrong recipient/chain/asset / reorg/not-finalized / cross-owner/duplicate event / rounding/currency mismatch / user supplied settled / sample/未完了仕事の収益化 / 出金受付だけで着金 / 別receiptが同じ入金を参照

**実在検証入口・今回未実行**: `node --experimental-strip-types --test tests/wallet-backend.test.mjs tests/financial-provider.test.mjs tests/rock-wallet.test.mjs tests/earning-bridge.test.mjs`

**受入**: 合成rail入金→保留→確定/取消/返金を再起動後照合、二重加算/越境0。liveEnabled=false維持、実rail条件を別gate。

**責任/外部条件**: EXTERNAL=金融rail/本人確認/契約/chain、JOINT=正式sandbox/実readback、OWNER=rail/資産/相手/個別実額。

**棚卸しの具体的不足（このunitの実装・負例・受入へ反映）**:

- F126 自動化で生じた売上、保留、確定、返金、出金の台帳。 WAL01〜06を具体unitへ。売上候補/入金/hold/配分/払出し/着金の既存台帳を縦断。
- F127 実際の外部入金とEarning Receiptの照合。 WAL01/B03のProvider取引/完了非samplejob/receipt/owner/currency/finality/取消可能性。
- F131 外部Wallet・決済・保管Providerとのadapter。 WLT03/06・RQ34/35/36のprovider schema/署名/finality/capability/契約・sandbox/LIVE分離。

<a id="wallet-02"></a>

## WALLET-02 — 888c収益連動精算・共有予約・backup照合

**laneId**: wallet

**親P**: P07 / P08 / P09

**既存task**: WLT01 / WLT02 / WLT04 / B03 / GX00

**対応契約**: CORE06 / SI06 / U03 / U05 / CORE09

**棚卸し行**: F128 / F130

**source/正本**: `docs/rock-first-party-settlement-wallet-20260913.md` / `docs/rock-wallet-revenue-hub-20260913.md` / `lib/settlement.ts` / `lib/rock-wallet.ts` / `systems/rock-star-os/os/wallet_backend/README.md` / `systems/rock-star-os/os/settlement/store.py` / `tests/settlement.test.mjs`

**現在地**: 888cは旧月額/収益連動sandbox系列。現共通基本料16USD/契約と別。旧ToC試算を現料金へ戻さない。

**手順/算法**: verified net cashだけからeligible amount、月累計≤888c/収益0→0。owner+contract+period+policyVersionで一度精算、linked device重複なし。既存atomic holdをATM/Game/AIで共有、未回収債務/翌月繰越/カード先払いを作らない。 DB transaction/CASでnet-refund-hold-allocated-reserved≥0を保持し、一つの外部入金へ別Receipt IDを付けても二重配分しない。現ToCの未確定/保留policyは徴収拒否を維持する。

**I/O**: 入力=確定net revenue/policy/同意/membership/prior allocation。出力=eligible/allocated/held/paid/refundedとbasis receipt。

**状態/保存**: integer minor/currency/period/basis ID保存。16USD/AI/通信実費/888c/ATM Rock0/Market既存10%を別契約line。backupはschema/hash/cursor/鍵/削除世代を持つ。

**移行**: legacy regression維持、P07 contract正本参照。main migration番号を確認してdual read、古いreceipt再生で新売上を作らない。

**失敗/復旧**: 収益不明/返金/disputeはhold/逆仕訳。DB/receipt片側復元/鍵全損/旧snapshotはunknown+新資金確定停止、照合前に再控除しない。

**負例**: 2端末同時月次 / zero revenue/cap境界 / 返金後再計算 / period/timezone境界 / 同key payload違い / 16USD二重加算 / 旧backup/receipt欠落 / 2配分同時 / 別Receiptで同入金 / 保留ToC policyで徴収

**実在検証入口・今回未実行**: `node --experimental-strip-types --test tests/settlement.test.mjs tests/rock-wallet.test.mjs tests/wallet-backend.test.mjs` / `PYTHONPATH=systems/rock-star-os/src:systems/rock-star-os/os python3 -B -m unittest discover -s systems/rock-star-os/tests -p test_wallet_backend_multi_device.py`

**受入**: 同契約2端末/同時/再送/返金/再起動で累計≤888c/二重控除0、16USD別請求維持。一般ledger/receipt/available一致と照合不能保留、実収益は別gate。

**責任/外部条件**: OWNER=policy/収益帰属/復旧、EXTERNAL=確定収益証拠、JOINT=正式rail照合。888最大値を利益/収益保証にしない。

**棚卸しの具体的不足（このunitの実装・負例・受入へ反映）**:

- F128 同じ収益から二重に分配しない仕組み。 WAL02でnet-refund-hold-allocated-reserved≥0をDB/CAS、2分配/別Receipt同入金で検証。
- F130 Rockの収益回収上限と対象条件の検査。 WAL03/BIL01/RQ20:0売上0・最大888c/月・同契約多端末重複防止・現ToC保留拒否。

<a id="wallet-03"></a>

## WALLET-03 — ATM0手数料・別actor認証・unknown払出し

**laneId**: wallet

**親P**: P05 / P08

**既存task**: WLT02 / WLT03 / GX00

**対応契約**: RQ15 / CORE05 / CORE06

**棚卸し行**: F136

**source/正本**: `systems/rock-star-os/os/atm/README.md` / `systems/rock-star-os/os/atm/simulator.py` / `systems/rock-star-os/tests/test_os_atm_integration.py` / `systems/rock-star-os/tests/test_wallet.py` / `docs/os-sky-wallet-game-design.md`

**現在地**: cardless ATMはSIMULATOR ONLY。実ATM/KYC/現金/production credential未接続。RQ15はRock徴収手数料0、外部実費は別。

**手順/算法**: owner exact ATM/amount/key同意→availableをatomic reserve→一回code。別ATM actorだけredeem/dispense/reconcile。dispensedは累計観測、読取/期限切れだけでunknown holdを解放しない。

**I/O**: 入力=TrustedWalletContext/amount_minor/ATM ID/key/別認証ATM assertion。出力=withdrawal ID/code hash/state/予約/累計払出し/照合receipt。

**状態/保存**: 既存journal/予約を共用しGame/AIと二重使用不可。公開fixture tokenは本番認証でない。owner APIにATM assertion権限を渡さない。

**移行**: 既存protocol/owner routerを維持し実Providerは別adapter。ゲーム交換の必須中継にせずATM障害で非金融gameを止めない。

**失敗/復旧**: 断/半額払出し/timeoutはhold維持し同withdrawal照合、cleanup keyも再送保持。未確認の自動返金/新code再発行なし。

**負例**: ownerがdispense / code replay/別ATM / partial/unknown / expiry race / 偽ATM actor / ATM/Game同時reserve

**実在検証入口・今回未実行**: `PYTHONPATH=systems/rock-star-os/src:systems/rock-star-os/os python3 -B -m unittest discover -s systems/rock-star-os/tests -p test_os_atm_integration.py` / `PYTHONPATH=systems/rock-star-os/src:systems/rock-star-os/os python3 -B -m unittest discover -s systems/rock-star-os/tests -p test_wallet.py`

**受入**: simulatorで二重支出/払出し/不正actor0と再起動journal一致。現金操作なし、実契約/規制/本人/実費/復旧条件は別gate。

**責任/外部条件**: EXTERNAL=ATM/金融rail/法令、JOINT=正式sandbox→指定実条件、OWNER=ATM/額/外部実費。今回は実資金なし。

**棚卸しの具体的不足（このunitの実装・負例・受入へ反映）**:

- F136 ATMでRockが徴収する手数料0の条件管理。 WAL06:自社fee0固定、未知外部費で総額無料禁止、Game adapter別同意をfixture/明細へ。

<a id="game-01"></a>

## GAME-01 — 作者SDK・持込みmanifest・非金融GM01/DX計測

**laneId**: game

**親P**: P02 / P03 / P10 / P11

**既存task**: DX01 / GM01 / AI06

**対応契約**: RQ14 / CORE02 / CORE07 / CORE12

**棚卸し行**: F155 / F156 / F158 / F159

**source/正本**: `docs/workstreams/08-game-market-fund.md` / `docs/game-api-contract-draft.md` / `docs/game-creation-and-intake-research.md` / `lib/game-sandbox.ts` / `lib/game-launch.ts` / `tests/game-sandbox.test.mjs` / `systems/rock-star-os/examples/game/README.md` / `systems/rock-star-os/tests/test_game_sdk_examples.py`

**現在地**: 合成SDK/2D粒子sandboxは既存。任意engine持込み/共通仕事接続/実機/商品合格は別。制作と他作者作品持込みの両方を維持。

**手順/算法**: 作品manifestに作者/権利/engine/runtime/asset hash/capability/save/rule版を固定→検証→allowlisted adapter/sandbox probe→起動。unknown engineはunsupported。fresh導入から制作→試遊→exportと持込み→診断→入力→saveを測る。作者point発行と資金記帳権は分離。 悪意game codeは別process/UIDまたは受入sandboxへ隔離、CPU/RAM/time/output/network/file scopeを強制。管理UI/Broker/Wallet/rootへedgeを作らず、更新権限増分を再審査。作品assetはparent/原作者/expiry/旧版失効とexport digestを追跡する。

**I/O**: 入力=manifest/決定的commands/target capability。出力=作品artifact/save digest/診断/導入時間/初回成功分母/復旧時間。

**状態/保存**: 既存SandboxState/command/save版とAsset Registry、owner別save使用。作品/利用権/game point/実資金/仕事を別entity。tracking lossはhold解除+pause。

**移行**: 既存互換sample/旧save維持、変換不可は拒否し原saveを残す。GameProfile low/standardを互換保証にしない。新import adapter/testsを追加。

**失敗/復旧**: process crash/不正save/版違い/依存不足/license欠落は診断し受入saveへrollback。任意shell fallbackや無断downloadなし。

**負例**: path traversal/zip bomb / 欠落権利/偽署名 / unknown engine / 過大resource / 別owner/版save / 追跡喪失 / authorがWallet操作 / game crashで管理UI巻添え / Wallet/root/API直接呼出し / 更新でscope追加 / 旧版失効作品の再公開

**実在検証入口・今回未実行**: `node --experimental-strip-types --test tests/game-sandbox.test.mjs tests/game-launch.test.mjs` / `PYTHONPATH=systems/rock-star-os/src:systems/rock-star-os/os python3 -B -m unittest discover -s systems/rock-star-os/tests -p test_game_sdk_examples.py`

**受入**: fresh環境2作者/2方式で制作/持込み→試遊→export→再起動/rollback、失敗分母とhashを記録。Wallet/ファンド完成待ちにせず全engine/Mini空間/Pro実機へ転用しない。

**責任/外部条件**: EXTERNAL=engine/作者license、JOINT=選定runtime/device、OWNER=作品/公開/再配布/費用。

**棚卸しの具体的不足（このunitの実装・負例・受入へ反映）**:

- F155 自作ゲーム作者向けAPI・SDK、sandbox、最小サンプル。 AI06/DX01 freshSDK/2作者2方式・制作持込→試遊/export/save/restart/rollback・時間/成功率unit。
- F156 ゲーム作者のポイント発行権限と、Walletの実資金記帳権限の分離。 GX00/01でpointmint/実資金ledger別capability、SQL/別owner/forgedreceipt負例。
- F158 作者の作品、ゲーム資産、ライセンス、版、利用権の管理。 AI06/CORE11の作品/asset/build/export digest・rights/expiry/parent/旧版失効拒否unit。
- F159 不正なゲームコードを共通管理画面から隔離する実行環境。 AI06/Securityの悪意gamecode/crash/権限増分/更新、他owner-save/Wallet/root拒否sample。

<a id="game-02"></a>

## GAME-02 — GX交換gateとgame↔現実WorkJob橋を別経路で閉じる

**laneId**: game

**親P**: P02 / P03 / P08 / P10

**既存task**: GX00 / GX01 / GX02 / AI06 / DX01

**対応契約**: RQ13 / RQ14 / RQ48 / SI04 / SI05

**棚卸し行**: F157 / F160

**source/正本**: `docs/gx01-contract-implementation-plan.md` / `docs/workstreams/08-game-market-fund.md` / `systems/rock-star-os/os/game_exchange/exchange_service.py` / `systems/rock-star-os/os/game_exchange/exchange_ledger.py` / `systems/rock-star-os/tests/test_game_exchange_races.py` / `systems/rock-star-os/tests/test_game_exchange_restore.py` / `toolkits/fivem-bridge/store.mjs` / `tests/fivem-bridge.test.mjs` / `lib/workflow.ts`

**現在地**: GX01複数owner/player/game/両台帳fixtureあり、GX02 planned/実残高無効。FiveM loopback/NUIは本番本人/Asset/Broker/実game合格でない。

**手順/算法**: 金融経路: quoteのowner/player/game/通貨/方向/rate版/期限/上限/実費/取消をexact digest→Wallet/game両予約→両receipt照合→確定/補償。非金融経路: real WorkJob→認可bridge envelope→game adapter→artifact hash→owner検収、逆方向はdraftのみ。二経路の承認/ledgerを混ぜない。

**I/O**: 入力=connection/quote/owner approval、別game authority receipt、job/revision/action allowlist。出力=既存exchange状態/両台帳証拠、またはgame ack/work artifact/limited memory候補。

**状態/保存**: 既存exchange journal/idempotencyと共通Wallet hold再利用。game save/仕事/限定記憶を別store、記憶は出典/期限/削除/owner scope。

**移行**: GX00互換維持、fixture通貨を実tokenへrenameしない。loopbackはauth/capability adapter追加後P13のworkflow/Assetへ接続、GTA VI調査を実接続にしない。

**失敗/復旧**: 片方commit/timeoutはunknown+同exchange照合、無条件返金/再交換不可。非金融duplicate/late resultは同jobへ一度投影、game失敗でreal完了にしない。

**負例**: cross-player/game / quote tamper/expiry / ATMとreserve race / 一方commit/process kill / 偽NUI/古revision / game→無承認Wallet/shell / 削除memory再生

**実在検証入口・今回未実行**: `PYTHONPATH=systems/rock-star-os/src:systems/rock-star-os/os python3 -B -m unittest discover -s systems/rock-star-os/tests -p test_game_exchange_races.py` / `PYTHONPATH=systems/rock-star-os/src:systems/rock-star-os/os python3 -B -m unittest discover -s systems/rock-star-os/tests -p test_game_exchange_restore.py` / `node --experimental-strip-types --test tests/fivem-bridge.test.mjs`

**受入**: GX fixture二game/two-ownerで両ledger/hold不変量、二重使用0。非金融往復は同job承認/停止/成果/復旧/削除で受入。正式sandboxは選定game/方向/rate/規約/復旧後、実資金/実game別gate。

**責任/外部条件**: Eve=記憶/学習、Smith=外部MCP、Game=adapter。EXTERNAL=game/金融Provider/権利、JOINT=正式sandbox/選定FiveM、OWNER=対象player/額/rate/実作用。

**棚卸しの具体的不足（このunitの実装・負例・受入へ反映）**:

- F157 ゲーム内通貨とWalletの交換条件、方向、レート、本人同意、両台帳の照合。 GX01/02のgame/通貨/方向/rate版/費用/cap/期限/exactconsentと二重使用/逆順/応答消失。
- F160 現実の成果とゲーム内出力を、同じ仕事・作品の版へ結び付けるadapter。 AI06既存FiveM等限定bridgeへ作品版/job成果・非信頼event・重複/旧版/別owner/取消試験。

<a id="material-01"></a>

## MATERIAL-01 — Material来歴/制約/候補検査から実験へのgate

**laneId**: mini

**親P**: P02 / P10 / P12

**既存task**: MAT01 / MAT04 / MAT06 / MAT15 / MAT18 / AI06

**対応契約**: RQ48 / RQ49 / SI02 / SI03 / SI05

**棚卸し行**: F161 / F163 / F164

**source/正本**: `lib/material-invention.ts` / `docs/material-invention-core.md` / `docs/material-invention-xr.md` / `docs/rockstaros-avocado-mini-complete-design.md` / `docs/workstreams/11-material-invention-avocado-mini.md` / `tests/material-invention.test.mjs`

**現在地**: material schema/合成評価/設計とMini光学入力sourceを保持。実材料性能/特許/量産/光学安全は未実測を合格にしない。

**手順/算法**: 目標→単位付きmaterials/禁止hazard/工程制約→非信頼候補→決定的制約検査→simulation/lab plan→実測receipt→owner検収。目的関数/単位/不確かさ/出典/版固定、未知材料を安全扱いしない。 MAT18の建築/interior/soundも同jobへ接続。CAD/BIM/scene/audioの型・単位・座標系・origin設計hash・許可原本/rightsを固定し型付き成果を照合。変更した材料/制約/工程だけ依存graphに沿って差分再計算し、baseline候補との差/棄却理由/由来を比較。専門家の内容受入と物理sample/安全試験を別gate。

**I/O**: 入力=MaterialRecord/InventionGoal/ProcessRecipe/source/license/measurement参照。出力=候補/棄却理由/実験計画/未確定artifact。

**状態/保存**: 現state/recipe版/危険情報/由来hashをowner jobへ保存。simulationと実labを別field/環境、raw実験/原稿をGitに入れない。

**移行**: 既存schema/Tool詳細/indexへ追記し最新Mini unitへ接続。既存草稿回収/内容受入と再研究を区別し経過時間を完成へ換算しない。

**失敗/復旧**: 単位不一致/出典失効/solver異常/危険工程は停止、原資料保持。実装scopeに自動混合/物理装置操作を足さない。

**負例**: unit mismatch / prohibited hazard / unknown provenance/license / LLM偽測定 / 古recipe / device unavailable / 座標系/単位不一致 / 元CAD/BIM hash不一致 / 差分再計算で未変更部分破損 / 専門家未承認を施工可能表示

**実在検証入口・今回未実行**: `node --experimental-strip-types --test tests/material-invention.test.mjs tests/patent-assistant.test.mjs` / `npm run design:check` / `npm run device-support:check`

**受入**: 同入力/版で制約/棄却理由再現、合成/solver/実測表示を分離。実lab/光学/製造/知財は個別受入。 F161/F164は同元設計へartifact照合し型/単位/座標/constraintsと専門家reviewを読戻す。physical sample/安全試験は未実施のまま区別。

**責任/外部条件**: Mini主担当、Eve=生成/学習、Smith=外部DB/MCP、EXTERNAL=solver/lab/知財、JOINT=実測、OWNER=目的/費用/実験安全。

**棚卸しの具体的不足（このunitの実装・負例・受入へ反映）**:

- F161 建築・インテリア・サウンド制作の入力と型付き成果。 MAT18でCAD-BIM/scene/audio形式・単位/座標/許可原本/専門家検収をWorkJobへ。
- F163 物質を組み合わせる候補生成、制約検査、差分再計算、比較。 MAT03/05/06のmaterial-invention既存型/fixture→Eve/記憶/Simulation、比較・棄却・由来unit。
- F164 CAD/BIMなど元成果への照合と、物理試作・安全試験。 MAT18/Materialに元設計hash/単位/constraints/専門家承認/物理sample/安全試験gate。


<a id="material-01-patent-bridge"></a>

### MATERIAL-01追補：RQ49／MAT06のMaterial → Patent AI橋渡し

**既存成果を再利用する**：`lib/material-invention.ts` の MaterialRecord／ProcessRecipe／MaterialCandidateGraph／CandidateEvidence、`lib/mini-spatial-workflow.ts` の既存WorkJob連結、`lib/patent-assistant.ts` の PatentIntakeInput／buildPatentPacket、`lib/patent-ai.ts` を読み合わせる。`docs/product-baseline.md` のRQ49と `docs/workstreams/11-material-invention-avocado-mini.md` のMAT06を受入の正本とする。独立した自由文Patent intakeの存在を、このbridgeの完成へ換算しない。既存の発明Core／Patent AIを作り直さない。

**実装する順**：

1. 同じowner／project／job／source revision／候補graph hash／操作event範囲を固定し、`人の直接操作`、`AI提案`、`simulation`、`文献`、`実験receipt` の出典種別・生成者・日時・参照権限を保持するbridge manifestを定義する。既存型の再利用と不足fieldの版付き追加をGit統合担当へ提案し、共有schema／workflowを片側置換しない。
2. 出典ごとに何を主張できるかを制限し、仮説／計算値／引用／実測を別欄で投影する。LLM文を実測値へ、人操作を法的発明者の確定へ、simulation一致を安全性や特許性の証明へ昇格させない。先行文献は既存の許諾済み参照だけを扱い、AI生成の架空引用を根拠にしない。
3. 認証済み本人の許可した範囲だけを既存 PatentIntakeInput へ写像し、発明開示のprivate draft、元構成との差分、根拠一覧、未確認事項、専門家向けpacketを同じjobの型付き成果へ保存する。inventor／applicant／公開状況等の未確認fieldは本人確認待ちとして残す。新規本文や秘密の工程をGit／公開SNS／他ownerへ出さない。
4. 保存時と読戻し時にowner／ACL／source revision／source-kind／各hashを再検証する。`owner+project+source revision+event範囲+packet版+content digest` を同一性に用い、同入力の再送でpacket／費用／外部作用を二重作成しない。差分再生成は旧版と来歴を保ち、新版として保存する。
5. packet内部の準備状態を既存WorkJob状態へ明示的に対応付ける。保存済み・本人確認済み・専門家handoff済みは別receiptにし、草稿保存から外部送信・電子署名・支払い・出願へ自動遷移しない。外部handoffを行う場合だけ対象・内容・費用・同意をaction時に再照合し、今回のfixture受入に含めない。

**保存・失効・復旧**：source artifactを別ownerへ再束縛しない。source削除／権限失効／訂正／旧revisionを検出したら、派生packetに影響範囲と利用停止を反映する。削除対象本文を復旧用ログへ残さず、許可された監査tombstoneとdigestだけを維持する。中断後は同じjob／packet identityを読戻し、結果不明の外部送信を再送せず照合へ回す。

**負例と受入**：最低限、人操作・AI・simulation・文献・実測の5種を混ぜた合成event列、LLM偽測定、改変receipt／graph hash、別owner、期限切れ／失効ACL、source削除、古いrevision、未知の文献権利、同入力再送、中断後再開を検証する。正常fixtureでは元event→bridge manifest→private packet→元sourceへの往復で種別／版／hash／ACL／内容が一致する。拒否fixtureはpacket公開・課金・外部送信を0件に保つ。既存二つの単体testが通るだけではbridge受入にしない。

**検証入口**：実装時に既存 `tests/material-invention.test.mjs` と `tests/patent-assistant.test.mjs` へbridgeの正例・負例・再送／失効fixtureを追加し、`node --experimental-strip-types --test tests/material-invention.test.mjs tests/patent-assistant.test.mjs`、`npm run design:check` を実行する。共有workflow／schemaの変更はその既存試験も対象にし、固定統合候補で `npm run verify` を通す。今回のprompt追補はfixtureの実装済み・試験済みとは記録しない。

**納品と責任**：Miniがsource event／来歴／bridgeの主担当、Eveが仕事・成果・修正履歴、Smithが許諾済み検索／MCP、Gitが共有型とindexを統合する。納品はversioned bridge契約、実装差分、合成packet、負例、同一source／artifact hashの読戻し証拠。実lab、専門家判断、法的評価、外部共有、出願は個別gateであり、95作業の処理終了から合格を推測しない。

<a id="companion-01"></a>

## COMPANION-01 — 独立SOS・保護者通知と時計/TV/robot等の能力adapter

**laneId**: os-pixel

**親P**: P02 / P03 / P05 / P07 / P09 / P10

**既存task**: MAT16 / MAT17 / DSP01 / OS10 / N04 / N05

**対応契約**: RQ48 / CORE02 / CORE05 / CORE06 / CORE07 / CORE12

**棚卸し行**: F152 / F154

**source/正本**: `docs/avocado-schoolbag-safety-device.md` / `docs/device-support-architecture.md` / `data/device-support-matrix.json` / `public/companion-preview/index.html` / `public/companion-preview/agent.js` / `tests/companion-agent.test.cjs` / `lib/eve-runtime-sync.ts`

**現在地**: Pixel browser試験音/固定Agentあり、独立alarm回路/自由会話/保護者通知/子供pilotは別未受入。時計/TV/robot等は実能力/更新復旧を機種ごと確認。

**手順/算法**: ①物理input→独立latch→sirenをnetwork/LLM/account/課金から分離し本体側/電力reserveを保持。②guardian本人→device challenge→限定binding、学校mode mic閉、会話は明示開始。③機器descriptorのrole/型/資源/熱/driver/expiryを照合し同owner/job/revision/artifactだけhandoff。robotの物理作用は別安全scope。

**I/O**: 入力=physical trigger/selfcheck、guardian同意/child操作、target capability/owner grant。出力=local alarm状態、通知queued/sent/delivered/ack、compatible/unsupported診断とrender/input receipt。

**状態/保存**: SOS/通常会話/通知は別state、sounder確認なしに鳴ったと断定しない。raw音声/連続位置は既定保持なし。端末cacheとZema正本/成果hashを分離、閲覧handoffで推論/支出を再実行しない。

**移行**: previewは状態比較元のみ。Eve/Broker/usageへ接続しProvider直結で迂回しない。旧BlackBerryは安全unlock/recoveryなしに支持へ戻さずdevice matrixを更新。

**失敗/復旧**: MCU crash/圏外/失効/学校静音でもSOS維持をbench。relay断は会話/通知成功としない、未送信音声自動再送なし。紛失binding失効でalarmを止めず、熱/追跡喪失で入力release+pause。

**負例**: MCU hang/low battery/取外し/false trigger / 偽guardian/別家族 / 学校mic/child無断Tool / expired descriptor/別owner/古revision / unsupported modality/熱cap / 音声ackを承認扱い

**実在検証入口・今回未実行**: `node --test tests/companion-agent.test.cjs` / `node --experimental-strip-types --test tests/eve-runtime-sync.test.mjs` / `npm run device-support:check` / `npm run design:check`

**受入**: 児童rawなしfixture→非通電mockup/2回路bench→同本体の音/電池/熱/落下/引張/雨/false trigger/停止/通知。機器追加は同job二出力/停止/再起動/旧snapshot/予算/失効、各boot/署名更新/復旧後に対応表示。

**責任/外部条件**: 独立SOS=OS、筐体/材料=Mini、学習=Eve、外部Tool=Smith。EXTERNAL=MCU/OEM/BSP/安全試験、JOINT=同本体/保護者client、OWNER=年齢/国/場所/費用/物理作用。

**棚卸しの具体的不足（このunitの実装・負例・受入へ反映）**:

- F152 **相棒端末**：低消費電力、保護者との接続、物理操作、通信やAIに依存しない警報・SOS。 MAT16/17別laneで通信/AI/課金停止でもalarm/SOSbutton/電源・guardian失効をbench→実機。
- F154 **時計・TV・ロボット等**：対応能力を宣言する個別adapter。存在しないカメラや表示機能を提供済みとしない。 DSP01で未選定unsupported/unknownと最低adapterfixture・導入更新停止復旧templateを割当。

<a id="auth-01"></a>

## AUTH-01 — passkey・family scope・credential lifecycleと限定保守

**laneId**: os-pixel

**親P**: P02 / P03 / P05 / P09

**既存task**: SYS01 / SYS12 / SYS13 / OS10 / DSP01

**対応契約**: CORE01 / CORE05 / CORE06

**棚卸し行**: F028 / F031 / F032

**source/正本**: `lib/rockstar-account.ts` / `lib/passkey-browser.ts` / `lib/account-handoff.ts` / `tests/rockstar-account.test.mjs` / `tests/account-handoff.test.mjs` / `docs/workstreams/04-security-identity-compliance.md` / `docs/security-incident-response.md`

**現在地**: 既存独立account/passkey/端末handoffと限定Dockは部分実装。family/guardian全scope・credential失効横断受入は未了。

**手順/算法**: server challenge/RP/origin/signature/UP-UV/counterを検証→server owner決定→one-time device承認。familyはguardian/member/deviceを別principalとし、共有/閲覧/代理承認/支出を用途別grant。credentialは役割別保護/期限/rotation/revoke、支出/鍵/復旧はfresh intentとdigest再認証。client owner field/モデル結果を権威にしない。 全routeでactor-action-resource表を作り本人/家族/作者/運営/Providerを分離。state-changing cookie APIはCSRF/origin検証とrate cap、challenge一回消費をDB原子化。並行credential登録/失効競合、NotAllowedError/未対応authenticatorの本人向け復旧を実装。保護者変更/解除は短期委任失効と子端末再照合。

**I/O**: 入力=challenge/assertion/session/device proof、役割/対象/scope/expiry/revision。出力=owner session/device grant/限定delegation、拒否理由/監査receipt。

**状態/保存**: Web cookieはHttpOnly/SameSite既存、device grantは既存保護領域。家族全員へ秘密/Wallet権限を共有しない。監査はactor/role/target/intent/digest/結果/時刻、raw生体なし。

**移行**: 既存account/session schema維持、family membershipはversioned追加。古sessionへ権限増分を自動付与せず、失効世代をoffline lease/jobまで伝播。保守はOPS-02独立trust。

**失敗/復旧**: 紛失/credential失効で新effect停止、既存成果回収は既存policy。復旧は本人確認/鍵/tombstoneを再照合、旧backupで家族scope復活なし。

**負例**: wrong RP/origin/challenge/replay / 盗難session/別owner / childがguardian代理 / scope増分/期限切れ / 失効race/古worker / supportがoperator昇格 / CSRF/偽origin / 並行challenge消費 / NotAllowedError/fallback / guardian変更後旧grant

**実在検証入口・今回未実行**: `node --experimental-strip-types --test tests/rockstar-account.test.mjs tests/account-handoff.test.mjs tests/operator-access-auth.test.mjs` / `npm run typecheck` / `npm run test:api`

**受入**: 5不足項目をauth/family/保守/credential別fixtureへ対応。正当系と越境/replay/失効/旧snapshotを同候補で受入。実hardware authenticator/biometric鍵は別gate。

**責任/外部条件**: EXTERNAL=authenticator/IdP/OEM/issuer、JOINT=exact device/失効実測、OWNER=本人登録/家族委任/復旧/重要操作。

**棚卸しの具体的不足（このunitの実装・負例・受入へ反映）**:

- F028 アカウント認証、再認証、セッション管理。 CORE01をAUTHunit化。RP/origin/challenge/cookie/CSRF/rate/並行credential/失効/fresh実UI。
- F031 パスキーなど、対応端末での簡単で強いログイン。 任意passkey、challenge一回消費/UV/credential失効/代替復旧/NotAllowedErrorをAUTHへ。
- F032 本人、家族、作者、運営者、外部Providerの権限分離。 actor-action-resource表、短期委任/保護者変更・解除/失効/越境負例。

<a id="sync-01"></a>

## SYNC-01 — 一般offline編集・revision競合・削除優先の復旧

**laneId**: eve

**親P**: P02 / P03 / P09 / P10

**既存task**: WEB04 / SKY21 / OS10

**対応契約**: CORE03 / CORE06 / SI04

**棚卸し行**: F068

**source/正本**: `lib/workflow.ts` / `lib/eve-device-sync.ts` / `lib/eve-runtime-sync.ts` / `components/eve-sync-workspace.tsx` / `tests/eve-device-sync.test.mjs` / `tests/eve-runtime-sync.test.mjs` / `docs/data-storage-boundaries.md`

**現在地**: 同job同期/履歴復旧は既存。offline両側の一般編集を暗黙last-write-winsで完成扱いしない。

**手順/算法**: local editへbaseRevision/operationId/owner/deviceを固定しoutbox保存→オンライン時owner再確認→server CAS。409はbase/remote/localの差分を表示し明示merge、新revisionで再送。承認/支出/stopは自動mergeせず権威再検査、tombstone/失効epochが旧snapshotに優先。

**I/O**: 入力=versioned local operation/base/server cursor、current auth。出力=ack/conflict/reauth/blocked/unknown、元jobに結ぶmerge候補。

**状態/保存**: owner別outbox/conflict artifact/dedupe IDs、server revision/削除世代を保存。原データを上書き破棄しない。

**移行**: 既存revision/schema/outboxがあれば再利用、ないfieldを版付き追加。旧clientの無revision更新は409/再読へ。IndexedDB/mediaはCloud同期済みとしない。

**失敗/復旧**: commit後ACK断は同operationId照合。partial upload/容量不足/認証変更はdraft保持、別job新作で回避しない。

**負例**: 二端末同時編集 / offline delete対edit / owner切替outbox / ACK欠落/再送 / old snapshot / approval scope変更 / media partial

**実在検証入口・今回未実行**: `node --experimental-strip-types --test tests/eve-device-sync.test.mjs tests/eve-runtime-sync.test.mjs` / `npm run test:api` / `npm run typecheck`

**受入**: 一般offline競合専用testsを追加しtwo-client/再起動/commit直後断でdata loss/越境/二重effect0、明示mergeと削除/失効保持。

**責任/外部条件**: Eve=編集/競合体験、OS=認可/保存/失効、EXTERNAL=storage/browser、JOINT=二client実UI、OWNER=競合解決/削除/復旧。

**棚卸しの具体的不足（このunitの実装・負例・受入へ反映）**:

- F068 端末間の同期、オフライン変更の保留、再接続時の競合表示。 CORE06のoutbox/baseRevision/tombstone/2device並行/conflict表示・解消をDATAunit化。

<a id="model-01"></a>

## MODEL-01 — model取得/検証/削除とowner限定RAG

**laneId**: eve

**親P**: P02 / P09 / P11 / P12

**既存task**: AI02 / AI05 / OS10

**対応契約**: CORE02 / CORE05 / CORE06 / SI02 / SI07

**棚卸し行**: F073 / F078

**source/正本**: `lib/ollama-model-inventory.ts` / `tests/ollama-model-inventory.test.mjs` / `docs/llm-evaluation-architecture.md` / `data/llm-capabilities.json` / `docs/ai-memory-architecture.md` / `docs/data-storage-boundaries.md` / `lib/eve-news-learning.ts` / `tests/eve-news-learning.test.mjs` / `android/core/src/main/java/dev/rock/core/platform/ResumableModelArtifactStager.java` / `android/core/src/test/java/dev/rock/core/platform/ResumableModelArtifactStagerTest.java`

**現在地**: inventory/評価/限定学習sourceあり。model取得受入と意味品質/常時稼働/weights学習/Eve統合は別。RAG corpus/indexの本番受入未確認。

**手順/算法**: 取得候補をsource/license/format/size/hash/required RAM/quantization版へ固定→owner同意/容量reserve→一時download→hash/format検証→atomic register→warmup/eval。RAGはowner/用途/同意別corpus→chunk版/出典/hash→ACL filter後retrieve→引用/不確かさ付きcontext、検索文は非信頼data。 AI02 ResumableModelArtifactStagerを再利用しqueued/downloading/paused/verifying/staged/quarantined案を既存stager状態へ明示対応。resumeは同source/version/ETag/length/offset/hashで照合し不一致は安全に再開断念。quota/free-spaceと一時file回収を先に検査。RAGはACLを検索前/引用出力前とも検証し、index残存hitでも文書失効なら返さない。

**I/O**: 入力=model manifest/accepted source/上限、owner文書refs/保持/削除/用途。出力=verified/unsupported/quarantined inventory、retrieval refs/rank/context digest、評価結果。

**状態/保存**: weights/corpus/raw原稿はGit外、公開metadata/hash/評価のみ。index/key/corpus版/削除tombstoneをowner別保存。RAGを学習済weightsや恒久記憶へ昇格しない。

**移行**: 既存ModelProfile/inventory/planner adapterをP13差分で統合。news学習ledger/既存原稿回収と新corpus再研究を分離、旧indexはACL+版確認後再構築。

**失敗/復旧**: 中断/容量不足/hash不一致はquarantine/再開または破棄、既存受入model維持。削除で文書/chunk/index/cache/backup方針を連動、失効後context再利用不可。

**負例**: wrong hash/license/format / 不足RAM/温度 / partial download / 別owner RAG / prompt injection / deleted doc復活 / fake citation / モデル結果で承認/Tool成功昇格 / Range/ETag/source変更 / free-space枯渇 / 清掃が受入weights消去 / 失効index hit漏えい

**実在検証入口・今回未実行**: `gradle -p android :core:test --tests dev.rock.core.platform.ResumableModelArtifactStagerTest`（Java/Gradle準備時のみ、既存docs/os-prototype.mdのcore:test入口） / `node --experimental-strip-types --test tests/ollama-model-inventory.test.mjs tests/eve-news-learning.test.mjs` / `npm run typecheck` / `npm run design:check`

**受入**: 2不足項目を取得state machine/RAG ACL別testで閉じる。合成小artifact/架空文書で正常/中断/削除/越境拒否、実model/GPU/有料/実データは今回実行しない。

**責任/外部条件**: Eve=選定/評価/RAG体験、OS=資源/認可/保存、Smith=外部検索MCP、EXTERNAL=license/runtime/Provider、OWNER=取得/送信/保持/費用。

**棚卸しの具体的不足（このunitの実装・負例・受入へ反映）**:

- F073 モデル取得の容量表示、中断再開、内容照合、不要ファイル回収。 AI02 stagerを再利用し取得state/整合resume/容量quota/中断・破損・清掃試験。
- F078 入力の分割、検索、参照資料の権限付き取得。 ACL検索前検査、chunk provenance/版/削除同期/未権限文書0/注入隔離をRAG-DATAへ。

<a id="mcp-01"></a>

## MCP-01 — catalog・OAuth・作者SDKの登録から失効まで

**laneId**: smith

**親P**: P02 / P03 / P04 / P09 / P10

**既存task**: SKY14 / SKY15 / SKY21 / DX01

**対応契約**: CORE07 / SI05 / U01 / U03

**棚卸し行**: F085 / F086 / F087 / F089 / F090 / F091 / F092 / F095

**source/正本**: `lib/catalog.ts` / `lib/mcp-client.ts` / `lib/mcp-inspection.ts` / `lib/sky-connections.ts` / `lib/sky-tool-package.ts` / `lib/sky-tool-package-store.ts` / `tests/mcp-client.test.mjs` / `docs/sky-tools-complete-design.md` / `docs/workstreams/02-sky-mcp.md` / `tests/sky-tool-sdk.test.mjs` / `tests/mcp-connector.test.mjs` / `tests/mcp-inspection.test.mjs` / `tests/sky-tool-package.test.mjs`

**現在地**: 既存catalog/passport/inspect/prepare/execute/Package等を再利用。全OAuth/外部feed/作者SDK実Providerは一括readyではない。

**手順/算法**: 版付きmanifestで作者署名/Tool schema/permissions/origin/data/cost/licenseを登録→inspect/negotiation→本人Add→OAuth state/PKCE/redirect bindingまたは既存credential→server保存→quote/digest→Broker prepare/execute→receipt→revoke。read/write/notify/billingを別scope、dynamic schema変更は再review。 catalogはauthor draft→review→publish→add→versioned update→revoke/deleteを既存schemaへ対応し、old jobは固定旧版参照で閲覧を維持。依存lock/source/license/作者identity/脆弱依存を審査、価格版とExecutor適格条件をstrict parserで検証。接続先はこのPC/Sky Cloud/提供者をdoctorで選択しlocal transport/origin/auth/capabilityを比較。MCP initialize→initialized→tools/list→call→schema/result照合を実Connectorで検証。作者SDKはfresh導入/最小実Tool/取消/再接続/版互換/権利診断を測定。

**I/O**: 入力=package/endpoint/capability/schema/OAuth proof/owner grant/job/revision/quote。出力=登録/接続/実行の別状態、互換診断、usage/artifact/失効receipt。

**状態/保存**: tokenは用途別保護領域、公開catalogに置かない。Package/source/contract版をjobへ固定、作者SDKはpoint発行/Wallet記帳/OS鍵を持たない。

**移行**: 既存catalog/API/schemaのSmith改名は表示中心で内部互換保持。既存Toolへadapter追記し二重registryや包括shellを作らない。OAuth依存SDK/公式仕様は実装時最新primary source確認。

**失敗/復旧**: inspect失敗/expired token/撤回/429/schema driftは接続/仕事をunknown/blockedにし再認可前に送信しない。effect不明は同idempotency key照合、revoke後新dispatch拒否。

**負例**: redirect/state/PKCE/replay / SSRF/private endpoint/redirect逸脱 / schema drift/injection / 別owner token / expired/revoked credential / duplicate effect / 作者署名を安全保証扱い / catalog更新でold job参照破損 / 価格版/Executor不一致 / 接続先切替でtoken流用 / fresh SDK missing dependency

**実在検証入口・今回未実行**: `node --experimental-strip-types --test tests/mcp-client.test.mjs` / `npm run typecheck` / `npm run test:api` / `npm run design:check` / `node --experimental-strip-types --test tests/mcp-connector.test.mjs tests/mcp-inspection.test.mjs tests/sky-tool-sdk.test.mjs tests/sky-tool-package.test.mjs`

**受入**: 8不足項目をmanifest/catalog・MCP交渉・OAuth・権限・作者SDK・費用・停止失効・外部feedへ子assertionで対応。fake provider fixture→正式sandbox→実Providerを分け、実X/送信/支払は個別gate。

**責任/外部条件**: Smith主担当、Eve=依頼/検収、OS=Broker強制、EXTERNAL=Provider/OAuth/権利、JOINT=実接続、OWNER=Add/接続/共有/有料作用。

**棚卸しの具体的不足（このunitの実装・負例・受入へ反映）**:

- F085 Model・Agent・Toolの商品登録、検索、比較、追加、更新、削除。 author draft/review/publish/add/update/revoke/deleteと旧job保持のCATALOGunit。
- F086 作者の同一性、配布元、ライセンス、依存関係の確認。 Package依存lock/source/license/署名者/脆弱依存を作者SDK・審査unitへ。
- F087 商品ごとの入力、出力、必要権限、料金、実行先の宣言。 catalog厳密parserと入力出力型・価格版・Executor適格条件を結ぶ。
- F089 審査、sandbox試用、公開範囲、失効。 SKY20/21の審査状態/期限/試用cap/公開scope/失効伝播をunit化。
- F090 MCPの接続先選択：このPC、Sky Cloud、提供者のMCP。 SKY07の接続先doctor/localtransport/origin/認可/能力比較/切断復旧。
- F091 MCPの初期化、能力交渉、Tool一覧取得、呼び出し、結果照合。 SKY14/15の実Connectorで能力交渉/一覧schema/timeout/結果検査/通知/失効をunit化。
- F092 OAuthなど外部接続の認可、期限、再接続、解除。 接続ごとowner/tokenvault/scope/期限/CSRFstate/既存PKCE等・rotation負例。
- F095 作者向けSDK、動くサンプル、導入診断。 SKY15既存toolkitのfresh導入/実Tool/取消/再接続/版互換・権利診断。

