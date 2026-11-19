# 「RockstarOSを再設計」開発プロンプトの詳細実行表

作成日: 2026-10-21（America/New_York）。参照チャット: `codex://threads/01a14d54-daee-7c30-87a8-faea84641a40`。[開発実行プロンプト本体](rockstaros-redesign-development.md)のRDR01〜10詳細表として使う。主担当: Product / UX、`OS10` / `ROCK`。横断: `SIM01`、`SI02`〜`SI04`、`SKY14`・`SKY15`・`SKY21`、`HOME01`・`WEB04`・`WEB06`、`BIL02`、`DATA01`、`DSP01`。実装担当は、調査文書の追加だけで止まらず、下記の優先順でコード、移行、否定試験、同一artifactの読戻しまで進める。設計v1.1の実装承認は既にある。外部契約、実機書込、実課金、一般公開、実資金は個別gateと本人指定条件を守る。

## 0. 出発点を最新の実体で確定する

最初に`AGENTS.md`、正本5ファイル（`docs/product-baseline.md`、`data/product-baseline.json`、`README.md`、`project.md`、`data/project-status.json`）、`docs/workstreams/README.md`、`docs/workstreams/00-responsibility-boundaries.md`、`docs/workstreams/01-product-ux.md`、`docs/prompt-playbook.md`、実装承認、`phaseGates`を読む。設計の入口は`docs/rockstaros-design-portal.md`、全体は`docs/rockstaros-complete-design.md`、全Toolは`docs/sky-tools-complete-design.md`、Mini/物質発明は`docs/rockstaros-avocado-mini-complete-design.md`。参照チャットで示された研究packは`docs/rockstaros-research-integration.md`と`data/rockstaros-research-reconciliation.json`の87件（RQ01〜RQ49＋追加38件）で照合する。研究packは記録上840/900分の草稿であり、今回の実装や資料読解を「15時間の調査完了」に換算しない。既存コードを無条件の設計制約にも、無条件の廃棄対象にもしない。強い代案は同じ課題・同じ入力・同じ受入条件で比較する。

`npm run prompt:context`または同等の読取りでGitHub main、全branch、対象作業branch、PR、同一SHAのCIを実装直前に再取得する。最新の取得は2026-10-21 04:36:36 EDT、exit 0。21 branch/11 open PRと取得前後のref一致を確認した。main `883e311e80ac1fdf1da3f44bb94a79551b121be9` は同一SHAのverifyを含む7 check-runがsuccess。`codex/esim-cloud-access` は `951d82d5a491a284aed4e0d4d280171d835d4b43` でsource-preparation一件だけsuccessであり、全体verifyの証拠ではない。両SHAをfetchして対象sourceを読み、main側653/branch側3 commit独自を確認した。取得時のdirtyは576 path。PR #104/#105/#130はopenで、PR実装をmainへ転用しない。詳しい実機結果と最初の修正は[開発プロンプト本体](rockstaros-redesign-development.md)の最新節を優先する。

mainのbaselineはv2.08/RQ50、作業branchのcommitはv1.98/RQ49、現dirty baselineはv1.120/RQ01〜RQ49。GitHub mainには後続のRQ50とアカウント単独利用があるため、最新mainを取り込む際にそれを消したり、SIMを全利用者の唯一の入口へ戻したりしない。監査用の歴史的SHAはmain `7cdbb5fedc86ee3978ed329d9312147d137c9199`、native head `fcedcfec4dd2a242a1ba8fd7ff5eebba97b8ecd5`、design head `de5b102d3525daccf604efd5685bdf8c14ad5d50`。歴史的SHAを現headやCIへ転用しない。

**最初の実装操作:** 共有dirtyを保全し、main・作業branch・関連PRの差分と正本の引継ぎ入口/優先順位を同期する。必要なら分離checkoutに正確なrefを固定して移植する。reset、clean、強制pushはしない。mainの新機能を古いbranchの欠落だけで「未実装」と決めず、local-only機能をmain反映済みと報告しない。

## 1. 利用者が求める一つの製品体験

RockstarOS 1.0（内部識別子`dev.rock`）を、複数のhardwareで同じ本人・仕事・権限・費用・成果・保存を扱うSI（スーパーインテリジェンス）の共通runtimeとして実装する。論理的なRockstarOSの中に、能力を探してAddするSky、依頼・承認・停止・成果受取を担うEve（旧Zema）、対応するLinux実行環境とOS Coreを置く。Cloud上に配置した管理Linuxもこのサービス環境の一部として扱い、外部LLMや第三者Toolは版付きadapterの接続先とする。Terminalは任意の操作口。普段の本人操作はEveから一件の仕事を始め、Skyで選んだ能力を使い、同じjob/成果/usageへ戻る。

入口は、購入した物理SIM/eSIMによるサービス利用開始と、後続mainのアカウント単独利用を両立する。eSIMへOS binaryを格納しない。回線、SIM profile、本人、契約/サービス利用権、端末導入、Linux準備、支払状態は別保存。サービスeSIMは通信容量ではなくCloud Linux/LLM/Agentへの接続権を含むprofileである。iOS/PCなどは既存OS client/browser/正式な端末adapterから使い、正確な機種の署名済みimage・boot/復旧が受入済みの場合だけnativeを案内する。iPhoneで無操作起動できない場合は本人が操作する経路と必要tap数を示し、手動URL成功を自動起動の成功にしない。

本人が画面を閉じ、端末通信が切れ、PCや携帯を持たなくても、保存済みの自律許可と予算内で承認済みjobは管理Linux上で継続できる。Cloud executor自体がofflineならlocalで完結する処理と外部作用待ちを分ける。成果はowner別の原本・表示・receiptを保管し、別端末のEveから同じjobを読戻す。Run to Earnは実利用、成果検収、収納済み収益を区別し、接続や画面表示だけで報酬を作らない。

Homeは投稿型の発見入口で、SkyのModel・Agent・Tool、本人/コミュニティーの投稿、ニュース、任意Wallet/Marketを同じjobへの導線にする。最新訂正ではSkyはAPI/MCPから投稿を受ける共通受信口で、X専用APIは任意adapter。利用者一人ずつにX開発者登録/API購入を要求しない。X viewerでの本人ログイン、Sky独自投稿、X本人のフォロー中取込み、XのFor You同等推薦は別々の達成条件とする。現在は本人Xの実投稿とFor Youのnative Home取込みが未受入。配色と名称は最新のRockstarOS独自方針に従い、過去のX画面模倣を全画面仕様へ固定しない。

同じOS契約で、本人が自分のWorld/コミュニティーを版付きのルール・見た目・LLM・Agentで構成して共有し、専用鍵と本人承認で参加を制限する。Eveの長期会話・仕事履歴はowner別に暗号化し、出典・削除/export・別端末引継ぎを持つ。生体認証原本を会話DBへ移さない。Gameは作者が作るゲームを受け入れるSDK/adapterを優先し、特定ゲームの実通貨交換やIP×NFT/DAO/Worldの金融実行は別の契約・法務・sandbox gateで扱う。

料金の初期共通案は月16 USDで一定のAI/Linux枠を含み、超過分は事前単価・本人上限の承認後だけ計量する。同一契約へ端末を増やしても基本料は一度。月末請求、未払い時の新規実行制限とデータ保持、入金後の同じworkspaceへの復帰、版付き電子契約とsalt付きchain証明を別状態で実装する。Sky単独月140 USDの既存Sandbox、旧888 cents収益回収、商品代、通信料、外部実費、作者分配は別契約・別台帳。未確定の含有数量、超過単価、地域、税、chain、受取条件を勝手に確定しない。

## 2. 現在のコード・証拠を読んでから変更する

| 入口 | 現行source/証拠 | 今の限界 |
| --- | --- | --- |
| OS/仕事/権限 | `lib/workflow.ts`、`lib/operations.ts`、Broker、Cloud grant/queue、`docs/rockstaros-complete-design.md` | 一部Web/Android/Cloudは動くが、最終sinkの一回性・終端照会・最大費・旧worker遮断（A16 D/Q/M/F）を全経路で受け入れていない。 |
| eSIMとLinux | `lib/rockstar-entitlement-claim.ts`、`lib/rockstar-service-attachment.ts`、`lib/rockstar-service-setup*.ts`、`lib/sky-linux-service*.ts`、`docs/evidence/pixel-service-setup.json` | 接続証明は純粋検証3/3のfixture。Pixel setup sourceは既定無効。実issuer、準備要求先行保存、実行先readback、iPhone/Pixel一周、実請求は未受入。 |
| Sky/Eve | `lib/sky-agent-library*.ts`、`lib/sky-marketplace-policy.ts`、`components/sky-marketplace.tsx`、`lib/eve-history.ts`、`docs/evidence/sky-agent-library.json` | catalog/Addと一部Tool handoff/暗号化履歴はある。独立作者・実Provider OAuth/実MCP・任意Tool一周・二端末/全損復旧は別証拠が必要。 |
| Home/World | `components/sky-social-timeline.tsx`、`lib/sky-x-account.ts`、`lib/community-os*.ts`、`docs/evidence/home-native-post-frontend.json`、`docs/evidence/community-os-keyed-editions.json` | local投稿/Homeと鍵付きcommunityは限定受入。X本人実投稿/For You、自律的な記事供給、公開UGC運用・鍵の実二端末復旧は未受入。 |
| 端末/配布 | `docs/phone-preview-20260911.md`、`docs/device-support-architecture.md`、`docs/native-os-integration.md`、`docs/native-os-validation.md`、`data/project-status.json#phaseGates` | Pixel 10 GL066/frankelの試験署名APK再起動23/23と全OS image/正式署名/flash/全損復旧を分ける。QEMU Developer Previewは独立。Mini/Proは別hardware受入。 |

各行を`要望ID / source repository・branch・40桁SHAまたはdirty hash / 実装状態 / host・fixture・provider sandbox・実機・本番の証拠 / 不足 / 次の一手`へ更新する。`docs/current-state-20260911.md`や古いCI、研究草稿を今日の完成証拠にしない。

## 3. 原因、修正順、合格証拠

| ID・優先 | 原因と修正担当 | 実装する内容 | 合格証拠・残条件 |
| --- | --- | --- | --- |
| RDR01 / P0 | mainの後続契約とlocal dirtyが分岐。Product/GitのROCK。 | 正本、87件台帳、main/RQ50、既存PR、各sourceを照合し、採用/移植/保留を小さな変更単位にする。既存`zema` scope等のID互換を守る。 | 同じ要望のsource SHAと旧reader/移行/rollback、未解決条件が一表に揃う。文書保存・branch commit・GitHub保存・main統合を別記録。 |
| RDR02 / P0 | 発行元と本人/契約/端末/Linuxが未接続。SIM01/WEB06のROCK、issuerはEXTERNAL。 | [SIM/eSIM実装指示](sim-esim-service-onboarding-development.md)のG01〜G10を実装。署名済みissuer lifecycle、状態軸分離、同意、端末鍵、先行保存した安定operation ID、Linux読戻し、子端末/失効/復帰、同契約の基本料一回をつなぐ。アカウント単独経路も残す。 | 合成DB/APIでは再送・逆順・別owner・紛失・未払いを拒否。実issuer/管理Linux/Stripe sandbox/実profileと機種別起動はJOINT別受入。 |
| RDR03 / P0 | 仕事の実行保証と費用上限がsinkごとに異なる。OS10/SI02・Security/ROCK。 | 既存workflow/Broker/Wallet予約を使い、job/attempt/op ID、owner、revision、承認版、実効scope、送信先、上限、lease/fencingを一つの決定へ固定。未知結果は同じreferenceで照会し、無条件再送/予約解放を止める。 | ACK消失、worker死亡、後着旧worker、二端末同時承認、価格/宛先変更で二重外部作用0、上限超過0。保証できないProviderは`uncertain`と表示。 |
| RDR04 / P0 | Eveの依頼、Skyの能力、Linux executor、成果/usageの一件縦断が部分的。OS10/SKY21/SI02のROCK。 | 代表の既存Toolを一つ選び、Eveの依頼→Sky Add/選択→見積/本人承認→既存Linuxで実行→原本/表示/receipt/usage→停止/検収/持出しを同じjob IDへ結ぶ。local LLMは非信頼planner、Cloud LLMは明示adapter、Jevはremote evaluator。モデル出力をBroker権限やTool成功へ昇格させない。 | 実DB/API/画面の読戻しでjob/revision/hash/使用額一致。未接続Toolの下書きと実成功、quoteと決済、画面表示と実行receiptを分ける。実ProviderはJOINT受入。 |
| RDR05 / P0 | 端末を離れた自律継続、保存/同期/復旧、本人の判断情報が一周で未受入。OS10/DATA01/SI03のROCK。 | 保存済み自律許可内のcheckpoint/再開、別端末へのowner限定同期、成果原本byte/hash・出典・確定/推定費・未確認事項・次の判断（A13）を同じ仕事へ結ぶ。Cloud停止後もexportと独立readerで読めるようにする。 | 端末電源断/二端末競合/Cloud executor offline/別環境復元を試し、同じ成果hash・usageと旧writer拒否。全損復元は空targetで別gate。 |
| RDR06 / P1 | Home/Skyの情報入口と外部投稿供給が混同される。HOME01/WEB04/SKY21のROCK、投稿元はEXTERNAL。 | [Sky投稿受信指示](rockstaros-sky-timeline-receiver-development.md)を再利用。Skyを版付きAPI/MCP投稿受信口にし、source/許諾/時刻/原文/推薦理由/解除を付けてnative Homeへ表示。Model/Agent/Tool投稿からAdd→Eve jobへ進む。X本人接続は任意adapterで、利用者にdeveloper登録/API購入を要求しない。X For You再現をSky推薦として偽らない。 | 実投稿のProvider referenceと画面表示、解除後の非表示、429/欠落/重複/誤帰属、320/390/1280pxとキーボード操作を検証。投稿供給元未契約ならlive feedは未合格。 |
| RDR07 / P1 | Model/Agent/Tool市場、作者、端末適合、費用が局所経路に分かれる。SKY14/15/21のROCK。 | [Sky/MCP実装指示](sky-marketplace-mcp-development.md)を再利用。署名は作者同一性、OSが権限/失効/資源制限を強制。未知作者の登録/審査、依存/license、sandbox、Add/購入/実行、結果・作者usageを分離する。端末内/管理Linux/承認済みCloudの配置は実測の時間・熱・電池・総費用（A9）で選ぶ。 | 独立作者のfresh SDK導入、MCP initialize→Tool→結果→失効、悪意入力/停止、配置変更前の秘密移転承認。Provider/OAuthと実販売/分配はJOINT。 |
| RDR08 / P1 | 月次契約、usage、作者収益、未払い復帰が別台帳。BIL02/WLT06のROCK、決済/custodyはEXTERNAL。 | [月次請求指示](rockstar-monthly-billing-development.md)と既存Walletを使い、16 USD共通契約の含有枠、上限予約、itemized usage、Invoice/入金、支払復帰、Run to Earnの検収・収納、作者/利用者/Rock/Providerの分配を一意referenceで照合。電子契約本文とchain digest/確定は別状態。 | 二端末/二job/二回webhookでも基本料/使用量/分配二重0。未払い時は新規有料実行停止とデータ保持。実決済、税、地域、chain、実資金は個別条件が揃うまで無効。 |
| RDR09 / P1 | 複数hardwareの共通契約と各機種受入が未接続。DSP01/OS02〜04/OS10のROCK＋JOINT。 | [OS/端末指示](rockstaros-os-device-foundation-development.md)を使い、Web/既存OS client/専用adapter/nativeを能力で選ぶ。最初の物理対象はPixel 10 GL066/frankel。試験署名APK、Android Core、全OS image、OTA/rollback/Keystore全損を別判定。QEMU Developer Preview、Mini、Proはそれぞれ別配布profileとする。 | 同一imageのboot/権限/保存・再起動/復旧を`docs/templates/os-acceptance-report.md`へ記録。Mini radio/電池/音声、Pro GPU/熱/騒音は実機で別計測。実機flash等は適合/復旧/鍵条件のgate前に実施しない。 |
| RDR10 / P2 | World、鍵付きコミュニティー、Game作者SDK、IP×NFT/DAOは局所試作と構想が混在。OS10/SKY21/RQ13・RQ14のROCK。 | 既存`community-os`を版付き構成・専用鍵・参加/退出/鍵rotation/保存/持出しへ拡張。Gameはゲーム非依存SDK、sandbox、動くサンプルと導入診断を先に受け入れる。IP/DAO/Run to EarnとWallet権限を分け、実交換/予測市場/資産売買は別gate。 | 別owner/旧鍵拒否、版戻し/退出後の持出し、作者のfresh SDK導入時間・成功率・復旧時間。実Game残高/実資金/金融商品は未承認のまま保持。 |

## 4. 実装の順番と完了の境界

1. **入口同期:** RDR01を行い、各要望を現mainとbranchのsource/証拠へ再配置。破壊的な統合なしに移植対象とrollbackを決める。`data/rockstaros-research-reconciliation.json`の87件に、今回の参照チャットで後から明示されたSky API/MCP受信口、アカウント単独経路、Eve/World/Run to Earn、X負担方針を追記または対応付ける。
2. **接続復旧と代表一周:** まず今回のTerminal/AVF転送不一致を恒久対策し、同じ仕事の照会・再送禁止・旧データ保持を実装する。現APKの新規一件/保存/再表示33.732秒、既存18件保持、次の通常起動26.060秒の合格を基準に保つ。運用復旧だけで恒久修正を合格にしない。続いてRDR02〜05のうちRockだけで進む契約/DB/API/fixtureを同じowner・契約・jobに結ぶ。少なくとも「利用権確認→Eve依頼→Skyの実在するTool/モデル→上限承認→Linux処理→成果と使用額→端末を離れた後の読戻し→失効/復帰」を一つの追跡IDで実装。実Providerなしでも結果不明、権限変更、費用超過、二重実行を拒否できるようにする。
3. **本人が使う導線:** RDR06とEveの成果画面を同じ仕事へ結ぶ。Home/Sky/Eve/設定の役割は画面上で迷わず分かるようにし、Add、承認、実行、結果を別操作として表示。XやMCPの生投稿が届かない時は原因を示し、合成投稿を実投稿に見せない。
4. **外部一周:** issuer、管理Linux、LLM/Tool Provider、決済、MCP投稿供給元の各契約/資格が揃った順にsandboxで同じIDと証拠を読戻す。外部未確定でもRDR03〜05のRock実装を進める。Provider側に一回性/照会がない場合は`uncertain`に止める。
5. **端末と拡張:** Pixelは許可済み非破壊試験から始め、native image/flashと標準サービスを別gateにする。Mini/Pro/World/GameのP1/P2へ進む。所有者の正式鍵、実課金、実資金、一般公開は各既存gateで判定する。全項目を一つの「OS完成」に丸めない。

`ROCK`は本人/利用権/権限/上限、idempotency、保存・失効・復旧、正確な表示を担う。`EXTERNAL`はissuer、実MCP/LLM、決済/custody、hardware/driverと契約条件を提供する。`JOINT`は同一profile/job/請求/端末の実証拠を照合する。`OWNER`は契約、端末追加、実機操作、料金/地域/予算、公開/実資金の対象を決める。署名された第三者Toolを安全保証と扱わず、任意shell/rootを共通実行APIにしない。

## 5. 検証と次担当への引継ぎ

変更箇所の小さい試験から開始する。候補: `node --experimental-strip-types --test tests/workflow.test.mjs tests/rockstar-service-attachment.test.mjs tests/rockstar-service-setup.test.mjs tests/sky-marketplace.test.mjs tests/sky-agent-library.test.mjs tests/eve-history.test.mjs tests/community-os.test.mjs tests/sky-x-account.test.mjs`。対象migration/Worker/Android/nativeの試験は変更した経路ごとに加える。UI変更は対象画面を実操作し、失効/再開/狭い幅/キーボードも見る。統合前に`npm run project:update`、`npm run baseline:check`、`npm run design:check`、`npm run verify`、必要なAndroid/OS固有gateを実施する。環境・並行差分の失敗は原因とsourceを切り分けて記録し、未実施/失敗を成功へ変えない。

各段階の証拠には実行コマンド、candidate SHAまたはdirty hash、同じjob/operation/workspace/Invoice/provider reference、入力と成果hash、正常/否定試験、host/fixture/QEMU/試験署名Pixel/provider sandbox/本番の区分、未解決条件を残す。大きいlog・OS image・secretはGit外。`project.md`、`data/project-status.json`、READMEを`npm run project:update`で同期し、OS component/Sky Tool変更時は`data/design-document-index.json`と全体/Tool詳細を同じ変更で更新する。文書保存・作業branch commit・GitHub保存・main統合・Sites配備を別記録し、次担当が同じSHAから一つ目の未完了GAPを再開できる状態にする。

最後にRQ01〜RQ49、mainのRQ50、追加38件、eSIM/アカウント単独の両入口、Eve名と旧ID互換、月16 USD共通案・Sky単独Sandbox・888 centsの分離、Game/ATMの別adapter、端末別受入、本人データの持出し、料金/Cloud送信の明示承認、一般公開保留を自己点検する。
