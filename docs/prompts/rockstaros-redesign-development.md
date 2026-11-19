> 現在の次の実行入口は `docs/prompts/rockstaros-common-core-development.md`。この文書の既存要望を維持しつつ、ChatGPT不要登録・共通本体＋端末adapter・現在のmain/Sites/実機差分は新しい入口で照合する。

> **追加明示指示20261021**: `avoado.si/`自体を会員登録付きRockstarOS WebOSの入口とする。既存`/os`・`/os/eve`、ChatGPT SSO、Pixel承認・owner別履歴を保持する。独自パスワード認証や本番課金開始は別に決める。公開v95/source50045ba595ff43d488c1a778d712eff0a4f52dc1でroot Sky・account接続済み→Eve・匿名401・旧入口を読戻し、root全verify exit0。現在地は`data/project-status.json.mainDomainWebOs`と既存Eve同期証拠を読む。Rootは共有未commitで、GitHub mainへの統合は未実施。

# RockstarOSを実用化する開発実行プロンプト

> **Eve同一会話・実機往復受入20261021**: `docs/evidence/eve-cross-device-sync.json`を現在地とする。Webの本人SSO→本人がPixelを承認→Web依頼をPixel内Linuxで実行→同じ会話へ成果→Pixelで続きを実行→Webの2依頼・4発言を確認済み。Qwen2.5-0.5Bの暫定ModelProfileによる対話/仕事入口の受入で、自社Eve weightsの学習完了ではない。20件を保持して22件、継続前21件は内容を含め保持、担当6個・モデル2個。既存Gradle環境を復旧してbuild/unit/lintも実行済み。公開v94へ既存ニュースを保つowner応答照合と共通5タブを配備した。生体認証必須鍵、sensitive vault、E2EE/鍵全損復旧/独立検収、全OS、本番課金、一般ローンチは未受入。OpenSSL 3指定の最終`npm run verify`はexit 0（API1619・CSV113）。USB再接続後、最終候補9eca1805の読取り専用検査と保存文面を確認し、22件内容一致・モデル2/担当6を保全。画面点灯設定0、元の試験APK d21e9442、転送0件へ復旧。現在Linuxは停止中で、新規推論を増やしていない。動画の「同期未完了」表示は解消済みへ換算しない。Root migration 0075/0076と、公開Sitesのdrizzle-main0026を混同しない。 最終GitHub読戻しはmain `bfe2db9695f0f037a34dd0cd04eb48f407a47fa6`、作業branch `951d82d5a491a284aed4e0d4d280171d835d4b43`。Rootは共有の未commit作業treeでありmain統合と同一SHA CIは未受入。次の開発では作業を保全して最新mainとの引継ぎ入口・優先順位の差を先に照合し、dirty treeへ無差別merge/resetしない。以下の元要件を保持し、合格済み工程を再試験で作り直さず、同じ仕事IDの残る工程から継続する。


> **2026-10-21 本人訂正**: EveはLLMの製品名。Eve画面はその対話/仕事入口であり、「Eveは窓口だけでLLMは別製品」と解釈しない。ModelProfileで基盤重み・版・実行先を固定し、既存モデルの暫定経路と自社Eve重みの完成を区別する。AMCのjob状態、Sky Tool、OS Broker/Engineの権限/費用/実receiptは引き続き別責任とする。[正本](../llm-evaluation-architecture.md#eve-llm-identity)。


更新日: 2026-10-21（America/New_York）。あなたはRockstarOSの実装担当として、以下の要件をコード・保存データ・画面・実機の動作へ接続してください。最終体験は、**PCの前に立たずに制作を進め、携帯を手に持たない場面でも対応端末からSIとやり取りでき、作ったAgent・Tool・ゲーム・Worldを共有して利用成果に結び付けられること**です。現在の実装を再利用候補として調べ、置換が必要なら移行・復旧・実測を伴わせて設計してください。

入力は利用者が指定した[「RockstarOSを再設計」チャット](codex://threads/01a14d54-daee-7c30-87a8-faea84641a40)の明示指示、現行Git、正本と同一artifact証拠です。全体の主担当は **Product / UX（ROCK）**、最初の修正は **Android / Device / Local AI（ROCK）** の既存 `OS10 / SKY21 / DSP01`。その後 `UXRS01 / HOME01 / WEB04`、Sky/MCP、Wallet/Billing、Security、Native/Release、Game、Mini/Proへ接続します。[RDR01〜10の詳細実行表](rockstaros-redesign-thread-development.md)も維持してください。設計v1.1の実装承認は済んでいます。この文章の読解・不足一覧・画面モックで止まらず、最初の未完了項目を実装・検証して次へ進んでください。新しい並列agentや別チャットは、その時点の利用者または適用指示が明示した場合に使用します。

## 製品契約を先に固定する

RockstarOSを全体の本人・利用権・権限・予算・保存/復旧・実行管理とする。Skyは情報・Model・Agent・Tool・外部API/MCPを発見、追加、設定、接続する能力管理。利用者向けの仕事窓口は **Eve（旧Zema）** で、依頼、計画、承認、進捗、停止、成果、使用額を同じjobに保存する。既存の`zema` scope・URL・DBキーは互換性のため保持し、表示名だけの置換でデータを失わない。SIという最新の利用者向け表記を採用し、既存識別子を無断変更しない。

HomeとSkyは、投稿からニュース/Model/Agent/任意Wallet・Marketを見つけて追加し、Eveへ渡せる一つの入口にする。能力の**追加**、権限/利用権、費用承認、**実行**、成果、売上/出金は別状態。WalletとMarketには本人の追加設定が必要で、Addだけで課金・実送金を開始しない。SkyのHugging Face検索/AddにRock独自上乗せは0。既存Sky作者販売の10%を0へ変更する指示は確定していないため、その判断を推測しない。外部Provider実費と月額を別表示する。

利用開始は本人account・契約・service entitlementを正本とし、通信回線/eSIM profile、端末導入、Linux準備、Provider支払を別記録にする。通信＋SI利用権のSIM/eSIM商品経路と無料account/対応Skyの単独利用を両立する。SIM/eSIMにOS binaryを入れない。最初の物理対象はPixel 10 GL066/frankel。iOSは既存OSのclient/browserでSky/Eveを使う後続経路とし、PixelのOS権限を転用しない。Eveから対応Linux/Cloudへ一つの仕事として依頼し、Cloud切替・外部送信・追加費用は本人の別承認に結ぶ。

初期のRockstarOS共通プランは月16 USDで、一定のAI/Linux枠を含め、超過分だけ事前単価・上限承認に従う。含有数量、超過単価、地域、税、実Provider条件は未確定。Sky単体の月140 USD/100 USD枠sandboxは別商品契約として維持する。利用者が選んだ電子契約＋チェーン上の証明は、個人データや全支払をオンチェーンへ移す指示ではない。未払い時は新しい有料実行を止め、保存済み仕事/成果を保持し、入金・利用権確認後に復帰する。

最新Homeの見た目は投稿中心で、Sky入口、アイボリー・深緑・ブロンズ。先行する黒/X類似の試作を最新完成形としない。X本人viewerでのログイン・閲覧、公開埋込み、MCP fixtureの投稿受信、**本人の実X投稿がHomeへ流れること**は別々の受入。MCP接続→内容確認→個別承認→合成投稿受信のfixtureは受入済みで、実X投稿Providerは未接続。Skyは外部API/MCPの受け皿であり、X専用有料APIを利用者の必須契約にしない。Xの「For You」同一内容を得る正規sourceも未確認なので、Sky独自推薦で代替して完了扱いしない。ニュースは出典・時刻・原文リンク・訂正履歴と検証状態を出し、政治的中立や無検閲を無根拠に保証しない。

## 最新の実装到達点（Sky・Linux・Eve開発）

本人の開発実行指示により、CSV fixtureを一致するbuild byteの独立copyへ変更し、manifest欠落・copy中の変更をWorker起動前に検出するようにしました。元のmissing-moduleエラー自体は今回再現せず、根本原因を確定したとは扱いません。正常CSV113 assertions、guard3件、`npm run verify`全体exit0（Node1130成功/1skip、仕事API1578 assertions）です。

新しい同署名APKはSky担当→Eve Activity→Pixel内Linuxの実推論→同じjob/成果/使用額→Android保存→Eve再表示まで受入済み。旧19件を変更せず、一件だけ追加して20件、model2/agent6を保持しました。実推論18,788ms、一周51.901秒、保存808byteの独立hash一致、状態reviewで本人内容検収は未実施です。新接続はAVF専用tapの相互TLSで、旧5199転送OFFのまま合格しました。Terminal forwarder本体の根本原因修正と混同しません。通常のnative実行はTerminalの非公開認証鍵やUSB転送を使いません。初回の公開証明書交換は開発者provisioningで、一般利用者向けenrollment/鍵交代/失効とWeb account同期は未受入です。

最新の同一候補hash・復旧・試験の失敗と再検証・元設定への復元は[実機証拠の開発項目](../evidence/sky-pixel-linux-entry.json#skyLinuxEveDevelopment20261021)を正本にしてください。`android-eve-bridge.patch`とowner suite、Linux bridge/installerを再利用し、この縦断を別台帳で作り直さないでください。次は初回pairingの製品化と鍵失効、main Web/Eveとの認証付き同一job同期、切断/競合/端末別復旧の合格が必要です。今回の成果を全OS・実eSIM・本番請求・全損復元へ転用しません。

Git最新照合は2026-10-21 09:06:26 UTCのcontext（22 branch/12 open PR）、main `6e8b393416d5b6488a7ac083312b7ebaa2c2ceb2`、作業branch `951d82d5a491a284aed4e0d4d280171d835d4b43`。固定mainをfetchし、前回mainから今回対象runtime/workflowに差分なし、baseline/statusの別作業を保持しました。以下の旧main/旧APK/旧失敗は履歴です。今回の変更はlocal保存と本人端末への同署名更新で、commit/GitHub main統合・公開配備ではありません。

## 前段のPixelで確認できた動作（旧候補の履歴）

2026-10-21の本人接続Pixel 10 GL066/frankel、GrapheneOS build `2026101601`、Terminal version 17/code 37の実測です。[最新の実機証拠](../evidence/sky-pixel-linux-entry.json#connectedRecheck20261021)を読んでください。

- 本体APKはSHA256 `cb14c10dd8924c753a794f8dab091d168e6da746d488b99eb1efbad45055636a`。今回、本体APKの入替・OS書込み・データ削除はしていません。
- 保存済みQwen2.5-0.5B-Instruct GGUF、491,400,032 bytes、SHA256 `74a4da8c9fdbcd15bd1f6d01d621410d31c6fc00986f5eb687824e7b93d7a9db`を全byte照合して再利用しました。モデルの新規取得は開始していません。
- Skyのnative画面から合成依頼を一件だけ送信し、Pixel内aarch64 Linuxで実推論しました。実推論13,162ms、準備・依頼・Android標準picker保存・読戻し・AI停止・画面再表示を含む試験全体33.732秒です。
- 新しい仕事は `379b81c9-53a6-41f7-81ac-5fd42eb706cf`、状態は `review`。内容の本人検収は未実施です。旧18件は試験前後で変更されず、一件追加後は19件、モデル2件・担当6件でした。**次の試験では保存件数を実測し、19件というsnapshotを固定値として使わないでください。**
- Android標準pickerでの保存操作と読戻しに合格し、Terminal終了後にもDownloadの新規ファイル534 bytesを独立読戻ししました。export SHA256は `69f807a1dd54cac4e237cdd57a0b6743ec73cb0d4b25ca5236f55ddd78c02101`。保存ファイルは `Sky-connected-3667c092-5b1c-40c0-94b2-238c808116dd.txt` です。
- 次の通常Sky起動は26.060秒で合格。guest boot IDが変わっても19件と新しい仕事の成果SHA256 `01e5b309dab5c19738b9083d1a3053420ea3f4ff1a601f965e3cd7e633a82a3a`を保持し、過去の仕事の再実行はありませんでした。
- 試験用APKは元のSHA256 `d21e9442aab5661bfe65bd6fa2db58fda46598e04d3fd0596ce03cd3afdb1483`へ戻し、開発者が作ったUSB転送を除去しました。新しいowner試験sourceは `toolkits/sky-linux-local/owner-tests/dev/rock/shell/PixelConnectedRuntimeTest.java` です。

同じ実機で、最初の起動が82.507秒で「Skyへの接続」に失敗しました。guest内Sky serviceと5199待受は正常、NetworkとTerminal側5199許可はONでしたが、Android側の5199待受がありませんでした。Sky serviceの再起動、本人による5199のOFF/ONでは復帰せず、実行中0件を確認してTerminalプロセスを再起動すると復帰しました。**これは運用上の復旧です。転送状態が不一致になった根本原因と恒久修正は未完了です。**

この合格範囲は本人用APKと既存Terminal内の文章処理です。Sky/Linux/Eveの全経路統合、全OS image、正式署名OTA、eSIM実発行、月額の実請求、全損復元、全機種対応はそれぞれの受入が必要です。新しいowner試験のJava/D8ビルド・実機成功を、本体APK全体の新規Gradle build/unit/lint成功へ読み替えないでください。

## 0. Git、正本、87件の差分を同期する

`AGENTS.md`、`docs/product-baseline.md`、`data/product-baseline.json`、README、project、進捗JSON、workstreams README/責任分界、[Product / UX入口](../workstreams/01-product-ux.md)、[設計](../rockstaros-complete-design.md)、[Sky詳細](../sky-tools-complete-design.md)、[調査照合](../rockstaros-research-integration.md)と[87件台帳](../../data/rockstaros-research-reconciliation.json)を読む。添付調査packは記録上840/900分の草稿であり、指示や実装合格へ昇格させない。87件は旧RQ01〜49＋追加38件の照合snapshot。**GitHub mainはv2.08/RQ50、現在の作業checkoutはv1.120/RQ49** なので、RQ50や後続のaccount/SI判断を失わず、新しいEve/Home明示指示との相違を理由付きで解決する。全件を一つの完成率へまとめない。

2026-10-21 04:36:36 EDTの `npm run prompt:context` はexit 0、21 branch・11 open PRを取得し、取得前後のref一致も検査しました。`main=883e311e80ac1fdf1da3f44bb94a79551b121be9` の同一SHAにverifyを含む7 check-runのsuccessがあります。`codex/esim-cloud-access=951d82d5a491a284aed4e0d4d280171d835d4b43` は同一SHAのsource-preparation一件だけがsuccessで、全体verifyの証拠にはなりません。両SHAをfetchして固定し、同じSHAのREADME/project/status/workflowを読取りました。main側653 commit、branch側3 commitが独自です。open PR [#105](https://github.com/k999ln/rock/pull/105)（仕事の重複/復旧）、[#104](https://github.com/k999ln/rock/pull/104)（Grid receipt、baseは別branch）、[#130](https://github.com/k999ln/rock/pull/130)（main取込み）は未統合です。

mainのbaselineはv2.08/RQ50、作業branchのcommit上のbaselineはv1.98/RQ49、現在のdirty checkoutはv1.120/RQ49です。取得時の共有checkoutには576 pathの未commit差分がありました。上記二つのcommitには `scripts/sky-linux-local-runtime.mjs`、`lib/sky-timeline-provider.ts`、`lib/eve-history.ts`、X account routeがありません。今回の作業treeの実装・実機合格を、GitHubへ保存済み・main統合済みと表示しないでください。他branchの同等実装も調べ、二重に作らず移植先と互換を決めてください。実装開始時にはref/PR/CIとdirty状態を再取得します。

`data/product-baseline.json#auditInputs`の履歴監査起点はmain `7cdbb5fedc86ee3978ed329d9312147d137c9199`、native `fcedcfec4dd2a242a1ba8fd7ff5eebba97b8ecd5`、design `de5b102d3525daccf604efd5685bdf8c14ad5d50`。最新GitHub SHAではない。共有dirtyを保全し、mainの仕事/Cloud/課金実装とこのcheckoutのHome/Eve/X・Pixel実装を差分表で照合する。必要なら分離checkoutを使い、reset/強制上書きしない。各項目を `要望ID / ref・SHA / path / host・fixture・sandbox・実機・本番の証拠 / 原因 / 修正順 / 合格条件 / 未解決` で更新する。

## 最初の開発単位

### 接続診断とTerminal転送の恒久対策

新native接続は上記相互TLSへ変更済みです。まず最新証拠の未完了だけを再開してください。旧ブラウザ経路の転送不調を追う場合は、インストール済みTerminalと対応sourceの版、公開Launcher、VM/guest起動、Sky service、guest待受、転送許可、Android待受、SkyのNetwork権限、API応答、モデル準備を別々に観測します。AVFのforwarder初期化・終了・再登録、同じTerminalプロセスでのVM再起動、端末スリープ/復帰、低メモリ終了を調べ、原因が分かった層へ最小修正を入れます。別版の公開sourceから原因を断定しないでください。

画面には接続できない理由と次の操作を表示します。待ち時間超過を「停止済み」「仕事未作成」と扱わず、入力とrequest IDを保持し、送信結果が不明な場合は同じjobを照会します。接続断を契機に別IDで再送したり、有料Cloudへ切り替えたりしません。旧仕事の状態が不明な間は、その照合を先に進めます。

Terminalの非公開serviceを外部から起動する、ログからTerminal認証鍵を取る、任意root/shellを共通実行APIへ追加する方式を製品経路にしないでください。開発用USB転送を製品導入の必須条件にせず、他の担当の転送を削除しません。実行中0件の本人用復旧、実行中/停止不明の安全な待機、転送許可がOFFの場合の本人操作を分けます。権限の自動追加、アプリデータ初期化、既存モデルの無断再取得で解決しないでください。

合格は、同じ候補で通常起動・停止・VM再起動・Terminalプロセス再起動・画面復帰を反復し、仕事の重複0、既存データ変更0、許可拡大0を示すことです。モデル準備時間と接続時間を分けて記録してください。修正候補がAVF/OS側なら、APKで直ったと表示せず、対応source patch・再現試験・必要なOS build gateを残します。外部OS buildを待つ間も、Skyの診断・同じjobの照会・データ保持は実装します。

### Pixelの仕事をEveの同じ仕事へ接続

既存の `lib/workflow.ts`、Skyの追加/担当設定、Linux manager、Eveの会話/仕事/成果保存を読み、owner、job ID、revision、request ID、実行先、モデル版、成果byte/hash、承認状態、使用額を対応付けます。Pixel guestの保存とWeb/Eveの保存が別なら、読取り・移行・同期のadapterを作り、既存19件を勝手に再実行しません。別台帳・別job IDの表示だけを揃えて統合完了にしないでください。

Skyで追加したAgentの一覧と設定から、対応LLMを選び、Eveに依頼を渡し、実行先/料金/送信資料/上限を本人へ示し、承認後に一回だけ処理します。Eveで進捗・停止・下書き・保存・使用額・次の判断を確認できるようにしてください。Skyは能力の発見と管理、Eveは仕事の窓口で、どちらを触っているか分かる導線にします。既存Sky単独利用も維持します。

最初の合格は、同一ownerの一仕事について、Webの操作とPixelの操作が同じ仕事/成果を示し、再表示・通信断・再接続・同時更新・承認取消でも状態が矛盾しないことです。端末のlocalhostへPCから直接つながると仮定せず、製品として使う正規transportと本人認証を受け入れてください。

## 1. 代表する一件の仕事を先に実装する

既存 `lib/workflow.ts`、Sky Hub/Agent登録、Eve、Broker/Cloud、Linux実行、Wallet予約、成果保存を再利用する。**Skyで対応Model/Agentを追加 → Eveで同一owner/job/revisionへ依頼 → 送信先/入力/事前単価/上限を示す → 本人承認 → OSが実効権限/利用権/予約を再検査 → 対応Linuxまたは明示承認したCloudへ一度だけ実行 → 進捗/停止/成果byte・版/使用量を保存 → EveとHomeで再読込後も同じ仕事を確認**、を最初の縦断にする。Tool結果とLLM文章をOS承認やProvider入金へ昇格させない。既存Sky単独経路も壊さない。

| GAP / 既存task | 原因と実装順 | 合格証拠 |
| --- | --- | --- |
| RD01 / `OS10, RQ04/08/42/48` | 外部sinkごとに重複作用防止、終端照会、最大費、旧worker遮断が揃わない。A16を既存job/lease/予約/receiptへ接続する。 | ACK消失、UNKNOWN、遅延commit、2端末競合、価格/宛先変更で別ID自動再送・早期予約解放・二重外部作用0。保証できないProviderはstrict表示しない。 |
| RD02 / `UXRS01, SI02/03` | 成果の本文、原本byte/版、根拠、確定/推定費、未確認、次の判断が画面ごとに分かれる。A13を型付き成果契約とEve検収へ結ぶ。 | 不足する判断情報は`needs-review`。同じjobから成果を開き、保存/持出し/停止・復旧を実操作。説明LLMの文をreceipt事実へ変換しない。 |
| RD03 / `SKY21, AI02/05` | 実行場所ごとの選択/計量/戻り方が違う。対応形式・モデル版・host能力、転送量、待ち時間、熱/電池、本人請求と運営原価を測りA9の選択を行う。 | local/Cloudの同じ仕事と強い既存対照で、時間・成功/復旧・費用を比較。未承認Cloudへのdata移送、別tenantのKV流用、残予算超過0。 |
| RD04 / `HOME01, WEB04, SKY21` | 最新Homeの投稿型発見と実能力/情報源が混同される。Sky登録/導入診断とEve handoff、本人別追加/解除、利用権/料金表示を同じ投稿IDに結ぶ。 | Web本人でAdd→reload→Eve依頼→成果まで実操作し、PC/390/320px、キーボード/読み上げ、旧保存データを確認。表示だけのカードを実行可能と呼ばない。 |
| RD05 / `SKY21, WEB04` | X viewer/公開埋込みとnative feedが別経路。既存Sky MCP Connectorへ、投稿の作者・時刻・原文URL・Provider証拠・権限範囲と取消/429を持つadapterを接続する。 | 合成投稿のowner分離/逆順/重複/失効/停止後の古い応答、次に権利ある実Provider投稿をHomeで読戻す。実Providerなしは`fixture`表示。For Youとフォロー中を独立判定。 |
| RD06 / `SIM01, BIL02` | eSIM・account・利用権・Linux起動・実入金の状態が別系統。既存Service Setup/課金を一契約版に結び、16 USD含有枠、超過予約/実usage、未払停止/入金後復帰を実装する。 | issuer/決済/管理Linuxはfixture→Provider sandbox→Pixelを別受入。0ドル登録、重複月額なし、返金/逆順通知/二重usageなし。未確定数量/単価/税を本番請求へ使わない。 |
| RD07 / `BIL02, WLT06, B03, RQ20/15` | Earning Receiptは実行証拠、販売入金/返金/払出しは別。既存台帳・Commerceを使い、[Wallet実装プロンプト](wallet-revenue-external-finance-development.md)のWAL01〜06を独立fixtureから接続する。 | 外部入金とReceiptの同一取引照合、四者内訳、純入金を超える二重分配拒否、補正/署名失効。検証済み収益から月最大888 centsの既存条件、ATMでRockが徴収する手数料0、Sky作者販売10%は別契約として保持。実資金は個別gate。 |
| RD08 / `OS10, RLS02, DSP01` | Web/APK/旧QEMU合格と現Pixel全OS image、Mini/Pro実機、World/OS editionの受入が異なる。共通業務contractと端末adapter/復旧を分ける。 | Pixel 10 GL066の同一imageでboot/権限/保存/再起動/復旧、旧QEMU Developer Previewは別報告。Mini/Pro、World版作成/参加/退出は各自の機種・権限・data gate。 |

修正順は、Git/正本/dirty差分の保全同期→上記の接続恒久対策と同じ仕事のEve連携→RD01の一外部sinkとRD02の成果情報→RD04のHome/Sky導線→RD03の実測配置→RD05〜08の依存しない契約/adapterです。87件台帳のP0全25件は、各差分が触れる範囲で解消/保留の証拠を更新する。P1全62件にも次の順序と担当を残す。World版/DAO、Game、Mini/Pro、GrapheneOS参考機能、ニュースLLMを保持し、それぞれの合格条件へ接続してください。

## 開発するアルゴリズム

### 一回の依頼と外部作用の管理

A16を既存workflowへ実装します。同じowner/request IDへの重複送信は同じjobを返し、lease・fencing・revision・有効な同意・予算予約を各stepで再検査します。API送信後のACK消失は結果照会へ進み、`UNKNOWN`を失敗と決めて別IDでやり直しません。古いworkerの遅延結果、停止後の完了、Provider取消不能、価格や宛先の変更を扱ってください。外部sinkに必要なidempotency/照会がない場合は、その能力を超える一回性を保証表示しません。

### 実行場所とモデルの選択

A9は、対応形式・モデル版/ライセンス・owner scope・資料の送信可否・device capability・空きRAM/保存・熱/電池・待ち時間・転送量・本人の上限から実行候補を絞り、実測で選びます。Linuxは実行環境で、Pixel内Linux、Pro側Linux、クラウド専用Linuxは別の場所です。呼出契約を共通化しても、物理的な実行先や費用・障害範囲を隠しません。local-onlyからCloudへの暗黙fallbackを拒否します。

最初に同じ入力・モデル版・条件で強い既存方式と比較し、成功率、初回準備/通常起動/最初の出力/完了/復旧の時間、転送量、実usage、電池/熱を記録します。UI用token数や端末の自己申告だけで請求を確定しません。キャッシュはowner、モデル/版、資料、scope、期限を鍵に含め、別ownerの文脈を流用しないでください。

### Agentの分担と成果の検収

依頼を分解し、担当/対応モデル/Toolへ渡す処理、依存関係、再開点、資源上限、停止を共通jobへ結びます。plannerの提案は非信頼入力とし、端末内モデル・Cloud・Jevの出力を実行権限へ昇格させません。現行の文章recipeと、将来の作者コード/ゲームsandboxを区別します。

A13の成果には、元の依頼、成果本文と原本byte/版、根拠/出典、実行先/モデル、確定/見積費、未確認事項、次に本人が判断することを含めます。形式が揃っただけで内容を正しいと判定せず、`review`と本人検収を分けてください。

### Eveの記憶と端末引継ぎ

会話原本、本人が採用した記憶、Agentの作業記録、健康データを別のscopeで保存し、出典・訂正・削除・保存期限・端末紛失時の失効を扱います。過去会話を検索して使う際は、現在のowner/scope/文脈を再検査します。全文を毎回Cloudへ送らず、必要な範囲と送信同意を確認してください。

端末変更は本人accountと再認証、端末公開鍵、暗号鍵の復旧方針、revision競合、旧端末失効で受け入れます。OSが管理する指紋/顔認証のtemplateをEveへ吸い上げる設計にはしません。対応する認証APIから得た認証結果と、本人が保存を認めた心拍等の健康情報を区別してください。Miniのsensor能力や常時稼働は実機ごとに確認します。

### 情報の配信と月次計算

Homeの推薦はフォロー/本人選択/更新時刻/出典/検証状態を使い、選ばれた理由、調整、解除を示します。投稿の主張・要約・確認済み事実・推定を分け、訂正と原文を追えるようにしてください。無検閲や政治的中立を名乗るだけで正確性を合格にせず、ニュース向けモデルは出典照合、反証、時点、誤りの訂正を評価します。

料金は、版付き契約・rate card・含有枠・予約/上限・冪等usage event・締日/通貨/税・invoice・入金/返金から再現できるようにします。遅延/重複/逆順usage、日付変更、解約/復帰、締め後訂正を試験し、請求根拠を本人が追えるようにしてください。月16 USD開始案、main側のsi cloudプラン数値未決、Sky単独商品はproduct/contract単位で相違を整理し、別商品の料金を混ぜません。未確定枠や単価を埋めて本番請求を始めないでください。

## 全体の開発で維持する体験と境界

1. **Home全体が投稿型の入口**。一部にXを埋め込んで終えず、投稿一件からニュース原文、Model/Agentの詳細・条件、Add、設定、Eveでの仕事、成果まで進めます。Home/Skyを行き来して同じ情報を再入力させません。作者・版・価格・接続済み/未接続を見分けられるようにします。
2. **外部API/MCPの受け皿**。Hugging FaceのModel/Agent登録・探索・版/ライセンス・追加・実行へ対応し、不足する仕事/課金/作者収益を既存Skyへ補います。登録済み・追加済み・準備済み・そのAgentで実行可能を別状態にし、選んだモデル版と対応runner/Providerを依頼へ固定します。Xは接続先の一つです。利用者全員へX開発者登録や有料枠を要求せず、供給元の実際の権限・対応feed・料金・取消を検査します。接続できない時にfixtureやX別画面を実投稿流入の成功として表示しません。
3. **eSIMからサービスが追加される導入**。profile/回線、account、契約/支払、entitlement、端末導入、専用Linuxを別状態で結びます。eSIM自体にSky/Eve/Linuxを格納せず、本人の契約に使える環境を追加する体験へします。対応端末のoffline実行は、受入済みlocal model・scope・signed lease/期限の範囲で継続し、通信なしで即時失効を知れると仮定しません。未払いは承認済み条件に従い新規有料実行を制限し、既存成果と持出し/復旧を保持します。
4. **自分たちのOS版と専用鍵コミュニティー**。ルール、theme、LLM、Agent、権限を版付き設定として作り、内容/差分/必要権限を見て追加できるようにします。URLだけで入会させず、専用鍵と本人membership、端末追加、期限、失効/鍵交換、退出と持出しを検査します。外部コミュニティーのルールをCoreの権限/予算/他ownerデータへ上書きさせません。
5. **作者の制作とRun to Earn**。作者がAgent/Tool/ゲーム/Worldを作成・試用・版付き配布・更新・取消できるSDKとsandboxを整えます。Run to EarnはWorld/Agentの稼働成果を対象とし、作業receipt、実際の販売入金、作者残高/分配/出金を照合します。自己利用や二重receiptだけで未資金の報酬を作りません。DAO、IP/NFT、電子契約の証明は本人が選ぶ応用で、token保有と著作権・個人情報の公開・実行権限を同一視しないでください。
6. **WalletとMarketは任意の追加**。記録だけ、sandbox、実支払、作者受取を分け、必要情報を必要になった時点で求めます。Addだけで送金/取引しません。予約・台帳・照合を再利用し、月最大888 cents、ATM自社手数料0、Game交換、作者販売条件、外部実費をそれぞれの契約で維持してください。実Game資産/実資金は個別gateです。
7. **GrapheneOSを基盤にした安全性と使いやすさ**。署名起動/rollback、更新・復旧、SELinux、app sandbox、権限、Keystore/暗号化、profile、ネットワーク制御、camera/mic、設定、ブラウザ、VPN/通信、アプリ導入を機能単位で「hostから利用中/移植済み/実装候補/不要/未対応」に分類します。今回のAPKが載るhostの安全機能をRockstarOS独自OSへ移植済みと表示しません。ブラウザの遅さはページ処理/通信/DNS/VPN/メモリ等を実測し、アプリ導入は署名/互換/配布/Provider条件のエラーを切り分けます。保護を全解除して改善扱いしないでください。
8. **端末ごとに出力を適応**。Pixel、iOS/Android既存OS client、browser、avocadoMini、AI専用PCのavocadoPro、相棒端末、時計/TV/ロボット等を同じowner/job/権限/保存契約へ接続します。Mini/ProへPixel用AVF binaryを転用せず、実在するCPU/OS/driver/sensor/表示/電源に合わせます。音声、画面、投影、身体/空間への作用は対応機種ごとの明示scopeと物理受入へ分けます。iOSへのサービス追加をiOS内Linuxの無制限常駐と同一視しません。導線は総合/Sky `avoado.si`、Mini `avocadomini.si`、Pro `avocadopro.si`へ揃え、`avoado.si`を補正しません。DNS/TLS/実配備の確認と一般ローンチの判断は別gateです。
9. **使いやすさとデザイン**。会社ロゴとRockstarOS表示、最新の固有配色、投稿中心の発見、一貫した設定/依頼/成果の導線を維持します。主操作の発見、タップ/キーボード/読み上げ、狭い幅、待ち/空/失敗状態を確認してください。黄金比は候補の一つとして扱い、タスク成功率・所要時間・誤操作・美しさの評価を実測して比較します。

これらは [OS全体設計](../rockstaros-complete-design.md)、[Sky詳細](../sky-tools-complete-design.md)、[端末別正本](../device-support-architecture.md)、[OS・端末基盤プロンプト](rockstaros-os-device-foundation-development.md)、[Wallet開発](wallet-revenue-external-finance-development.md)、[87件台帳](../../data/rockstaros-research-reconciliation.json)へ対応付けます。未実装項目を消して合格率を上げず、依存しない作業を進めてください。

## 2. 検証、責任、引継ぎ

### 現在のhost検証で残る修正

2026-10-21の最終 `npm run verify` はexit 1です。正本/設計検査、型/lint、主要Node試験1,125成功・1 skip、build、Web bundle/assets、仕事APIの1,578 assertionsは合格しましたが、最後の `scripts/check-csv-storage.mjs` が `No such module "__vinext_action_owner_manifest.js"` でWorker起動に失敗しました。build後の `dist/server/` に同名ファイルがあることは確認済みで、根本原因は未確定です。生成物のimport名・wrangler設定・一時コピー・Miniflareへのmodule登録を同じbuildで照合し、owner/securityの検査を外さず修正してください。CSV試験をskipしたり、build成功だけで全verify合格にしません。

直前のsandbox内試験には `listen EPERM 127.0.0.1` があり、ローカル待受を許可した再実行で上記の実際の残件を確認しました。環境制約とコード/設定の失敗を分け、次担当はローカル試験サーバーを使える環境で `npm run test:api`、続いて全verifyを再実行してください。長いログはGitへ入れず、失敗の要約・再現コマンド・実際のexitを残します。

### Pixel本体OSと実装環境

製品名はRockstarOS 1.0、内部識別子は`dev.rock`、最初の配布ラベルはDeveloper Previewです。既存APKのpackageや保存形式は移行なしに変えません。旧Buildroot/QEMUの `systems/rock-star-os/`、旧Android/AOSPの `android/`・`os/`、今回のPixel APK/Terminal、将来のPixel用全OS imageを別々に追跡します。固定IMPORT-MANIFESTやvendor原本は変更しません。

Android sourceは実装worktreeとstage、portable patch、ビルド済みartifactを照合してから編集します。古いroot側AndroidからAPKを再導入して現在のSkyを失わせないでください。今回のowner試験は既存JDK17/SDK35を使ったJava/D8追加で、全体の新規Gradle buildではありません。保存済みGradle cacheの不足/書込エラーを検出したため、新しいAPKを作る際は正式なbuild環境と依存を復旧してbuild/unit/lintを実行してください。認証鍵や所有者のデータをそのために生成し直しません。

全OS buildは必要条件の揃った専用x86_64 Linuxで行います。GL066/frankel向けのvendor/firmware、署名起動、鍵保管、OTA/rollback、data/Keystore復旧、緊急通信を含む削除不可要件を照合し、同じimageを `docs/templates/os-acceptance-report.md` へ受け入れます。試験署名APKや旧QEMUの成功を全OSの起動/実機flash/全損復元へ転用しません。実機書込み等の条件が未確定でも、独立するBroker・adapter・診断・Eve連携の実装は進めます。

集中試験は変更範囲に合わせ `node --experimental-strip-types --test tests/workflow.test.mjs tests/sky-hub.test.mjs tests/mcp-connector.test.mjs tests/home-timeline-frontend.test.mjs tests/sky-timeline-provider.test.mjs tests/sky-linux-service.test.mjs tests/rockstar-service-setup.test.mjs tests/earning-bridge.test.mjs tests/billing-worker.test.mjs` から実在する対象を選ぶ。停止/UNKNOWN/競合/支払/失効の**否定fixture**を追加する。`npm run schema:check`、`npm run typecheck`、`npm run lint:product`、`npm run baseline:check`、`npm run design:check`、`npm run project:check`を経て、完了前にOpenSSL 3を使う `PATH=/opt/homebrew/opt/openssl@3/bin:$PATH npm run verify`。Hub実利用・Home変更ではUIも操作し、実Provider/Pixel/nativeは各gateの同一artifactで確認する。過去のlocal全verify成功を今のdirty checkoutやGitHub branch同一SHAへ転用しない。

Pixelの新しい仕事試験は明示した合成入力一件と保存済みモデルで行い、開始前に実行中/停止不明の仕事とモデルcacheのhashを照合します。途中失敗後に同じ試験を先頭から再実行する前に、既存request IDとjobを照会してください。すでに作成された仕事があれば、保存/読戻し等の未完了部分から再開します。Android pickerでは画面のpackageと新しい一意の保存名を確認し、元ファイルを上書きしません。試験用APK/forward/一時fixtureは自分が作った対象だけ戻し、元のAPK hashと所有者データを確認します。

ROCKは共通契約/画面/権限/台帳/失敗時停止、EXTERNALはissuer・決済/custody・X等の実情報源・Cloud/Tool、JOINTは同一仕事/入金/端末の縦断、OWNERは商品単価/枠/地域/受取先/実資金の個別承認を担当する。事前の設計承認を再要求しない。実資金、OS鍵/flash、公開は各既存gateと未指定の対象/条件を満たした後だけ実施する。秘密値と大きいlogはGit外へ置き、Gitにはsource SHA、試験コマンド/件数、fixture/Provider参照、失敗と復旧、次の再開点だけを残す。

着手・判断変更・検証後に`project.md`と`data/project-status.json`を更新し、`npm run project:update`でREADMEへ反映する。OS component/Sky Toolの変更時は`data/design-document-index.json`と対応する全体/Tool詳細を同じ変更で更新する。新しいWeb仕事状態は`lib/workflow.ts`、native移植は同じjob/fixtureを通す。最後にRQ01〜RQ50と後続明示要件、月額/別Sky契約、Wallet/Game/ATM、本人鍵、Sky単独利用、Pixel/QEMUの独立受入を点検する。**文書保存、作業branch commit/push、main統合、Provider sandbox、実機、公開/本番**を別々に報告し、未解決条件と次の正確な作業refを残す。

報告は、変更したpathと目的、同じartifactで実際に動いた一周、失敗と修正、残る条件、次に実行する一作業を簡潔に示します。長い調査・待機・自動化をした場合は、実行区間、成果、停止理由を記録し、経過した時計時間を実作業時間へ置き換えません。止まる条件が一つあっても、依存しない開発を続けます。必要な本人操作・秘密設定・外部契約が残った時だけ、その具体的な一操作と理由を提示してください。
