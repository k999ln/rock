# Game / Market / Fund

<a id="game-creation-material-20261020"></a>
## Game・制作・交換の照合と実行順（2026-10-20）

本人の列挙を既存RQ13・RQ14・RQ48、`AI06`・`DX01`・`GX01`・`GX02`へ対応させる。主担当はGame / Market / FundのROCK。外部engine・正式sandbox・権利条件はEXTERNAL、同一版・同一仕事の往復はJOINT、対象game・交換方向/通貨/rate/取消条件・共有/公開・費用上限はOWNERが決める。非金融GameはWallet・市場・ファンドの完成を待たない。

| 順 | 到達点と次の合格証拠 | 保留gate |
| --- | --- | --- |
| 1 作者SDK・非金融sample（`DX01`, `AI06`） | 合成SDK、2D sandbox、Web作者sampleがある。版固定の最小sampleをfresh導入し、2作者・2方式で制作→試遊→export、別の持込み→診断→起動→入力→owner別save→再起動/rollbackを測る。導入時間、初回成功率、復旧時間、失敗分母とhashを残す。 | 任意game互換、Mini/Pro実機、公開商品は未合格。 |
| 2 作品と現実の往復（`AI06`） | 既存Asset/IPと限定FiveM bridgeを使い、作者・作品・license・版・利用権、source/build/export digest、同一owner/job/artifact revisionを結ぶ。建築・インテリア・サウンドの型付き成果を許可済みadapterへ送り、game eventを未信頼入力として戻す。旧revision・権利失効・重複event・別ownerを拒否する。 | 実game API/権利/対象版の共同受入は未確定。 |
| 3 実行隔離（`AI06`, Security） | CPU/RAM/storage/network/device/time上限と権限版をOS/Brokerで強制する。悪意あるcode、crash、権限増分、更新/失効で停止・隔離・復旧し、Wallet、任意shell/root、他owner saveへの直通を拒否する。署名は作者同一性の証拠として扱う。 | 実engine/OS/端末での隔離受入前に安全と表示しない。 |
| 4 ゲーム交換（`GX01`→`GX02`） | ATMと別の複数owner/player・両台帳合成fixtureは合格。選定game・通貨・方向・rate版・期限・上限・外部実費・本人同意をexact digestへ束縛し、正式sandboxで予約→確定/取消→両台帳/Provider receipt照合、二重使用・再送・逆順・失効を拒否する。作者のポイント発行権限とWallet記帳権限を分離する。 | `GX02`はplanned。実資金、外部game残高、資産売買は無効。 |
| 5 市場・ファンド（`MKT01/02`, `FND01`） | PAPERと検証済みreceipt限定の計算を維持。市場注文/清算とファンド運用は契約、法務、Provider、risk、運営を各別に受け入れる。 | PAPERをLIVEや実収益へ昇格させない。 |

実装時は`lib/workflow.ts`のrevision/状態遷移、Asset Registry、Wallet予約/台帳、Skyの承認/費用を再利用する。作品/利用権、ゲーム内point、実資金、仕事成果は別entityとして保存する。source・artifact SHAとfixture/sandbox/実機/本番の環境を明記する。検証入口は`npm run baseline:check`、`npm run design:check`、対象SDK/交換/仕事試験、統合時`npm run verify`。今回は照合と計画でありruntimeや外部残高を変更しない。

## 目的

AIネイティブOSの共通仕事・記憶・権限契約を、Game／IP制作、ゲーム作者向けAPI/SDK、ゲームとの連携へ広げる。非金融の制作・ゲーム体験はファンド収益の完成と独立して進める。Walletとゲーム通貨の交換、PAPER市場、ファンドはそれぞれの台帳と承認・照合契約を使う。

## 現在地

- 複数owner/player/game分離、ATMと独立したゲーム交換fixture、作者SDKとsandboxを実装・検証済み。
- PAPER市場はproposal、risk、digest承認、receipt、position、append-only eventを実装済み。
- Web/D1はapproval・reservation・receipt・positionのowner／proposal一致をrelation triggerで強制し、直接SQLでも孤立・別owner参照を拒否する。
- ファンドは検証済みreceiptがある場合だけ構成・配分・観測利回りを再計算する。
- 実ゲームsandbox、実市場注文、清算、実Wallet資金移動、自動再投資は未接続。
- `GM01`（AI06から切り出し、進行中・host fixture統合候補）: R5統合設計§03／GAME01の最小操作を、決定的な2D粒子sandbox（`lib/game-sandbox.ts`）としてhost／fixture段階で実装した。選択、保持中だけの移動、放す、衝突・結合、分離、取消、時間停止、追跡喪失時の保持解除＋休止、版付きsaveからの再開を扱い、不正save・形式版違い・規則版違いを拒否する。別プロセス再起動を挟んだ再開が無停止実行と同じ状態digestになることを試験する。金額・課金・交換・Wallet・GX01には接続しない。R5裸眼空間表示、精密3D入力、安全、熱・電源・収納（MAT15）、実機・OS統合の合格ではない。共通仕事・限定記憶・Zema進捗への接続（AI06本体）は未着手。

主なtask: 非金融Game／IP縦断の`AI06`（2D最小loopは`GM01`）、`GX00`, `GX01`, `GX02`, `DX01`, `MKT01`, `MKT02`, `SPN01`, `FND01`。

## Game creation and intake

[ゲーム制作と持込みを両立するための実現調査](../game-creation-and-intake-research.md)に、公式資料、実行経路、共通作品/診断契約、Pro/Miniの受入、実装順を記録する。調査と設計の範囲であり、任意ゲームの実行受入ではない。

起動・試遊の合格と、現実の作品や仕事をゲーム内へ往復させる橋渡しの合格は別に記録する。作者SDKや正式なMOD/APIがある対象だけ`GameConnectionProfile`を結び、外部store/console/URL/cloud作品へ自動の書込み・save読出し権を推測しない。公式Remote Play／cloud gamingへの引渡しとRock独自のPro streamingも別経路・別受入とする。
本人のlocal game fileは端末内診断・sandbox起動とし、Rock側へのbyte送信を前提にしない。Rockが保管する許諾済みpackageはquarantine→検査→非公開previewの別経路にする。

2026-10-18の利用者訂正: ビルド／制作と、他の作者が作ったゲームを持ち込んで遊ぶことの**両方**を製品対象とする。特定タイトルや一つのengineに閉じない。主担当Game / Market / Fund、既存`AI06`（非金融制作と仕事接続）と`RQ14`（作者導入）を使う。`DX01`の既存SDK合格は合成ゲーム連携の範囲であり、任意ゲームの制作・起動合格へ転用しない。最初の実装は金融・市場の完成を待たない。

| 項目 | 共通契約の設計候補 |
| --- | --- |
| 目的・体験 | 作者はMini／Pro／対応clientから制作を依頼し、試遊・修正・書出しを続ける。作者または権限を持つ利用者はゲームのpackage／許諾されたURLを持ち込み、診断を見てから対応端末で遊ぶ。制作を利用しない持込みも、持込みを利用しない制作も可能。 |
| 責任 | ROCKは作品・版・互換性診断、隔離、本人別save、更新／rollback、Sky／Zema接続を設計・実装する。EXTERNALはengine、配布元、driver、権利、外部serverを提供する。JOINTは同一作品・端末・runtimeで起動／入力／保存／復旧を受け入れる。OWNERは素材利用、外部送信、費用上限、共有／公開を承認する。 |
| 入出力 | 入力は`gameId`、作者主体、source／package digestと版、許諾・対象OS／architecture、起動入口、操作方式、save所在、network／device／resource要求。診断出力は対象端末・OS／runtime版・根拠時刻と、`launch_candidate`／`missing_capability`／`unsupported`／`rights_blocked`、不足条件と復旧案。動的な起動・入力・保存の結果は別々に`unverified`／`pass`／`fail`／`blocked`を記録し、表示用の`launched`／`input_verified`／`save_verified`を導出する。`launch_candidate`は静的に起動を試せる候補であり、起動成功や操作/保存互換の表示ではない。制作成果はsource・build・exportを別digestで記録し、起動成功と混同しない。 |
| 状態 | 制作は`draft → preview → revised → export-ready`。持込みは`received → inspected → launch_candidate → launched → input_verified → save_verified`。診断不明、実行失敗、撤回、更新待ち、rollbackを別状態にする。公開は本人の別承認と権利・配布条件のgateを要する。 |
| 保存と権限 | 作品、作者、利用者別save、Zema仕事、共有済み成果を分離する。同じ`gameId`でもowner・profile・版を混ぜない。ゲームprocessはBroker、Wallet、任意shell／root、他作品saveへ直接届かない。ゲーム内telemetry／client eventは仕事完了・支出・本人承認の証拠にならない。 |
| 失敗・復旧 | 未知engine／不足driver／起動失敗は診断理由を残し、別adapter候補を提案しても自動実行しない。crash・通信断・容量不足ではゲームを隔離停止し、確定済みsaveと仕事を別々に復元する。更新前に既知正常版とsave互換を確認し、不明な副作用や有料処理は自動再試行しない。重複取込みはdigestで照合する。 |
| 承認・費用 | 制作Agentの外部送信とCloud利用はSkyの事前単価・見積・上限承認を通す。持込み後の追加権限、配布、他者との共有は別承認。ゲーム内ポイント発行とWallet記帳は分離し、RQ13の実交換を有効化しない。 |
| 合格証拠 | まず二人の作者・異なる二方式の非金融ゲームで、制作→exportと、独立した持込み→診断→起動→入力→save→再起動→更新／rollbackを測る。engine／packageごとの特別な手修正、未検査の権限、他owner save混入、誤った成功表示は不合格。初回導入時間・成功率・復旧時間を記録する。ProとMiniはそれぞれ同一機種・OS・runtime・game版の証拠がある場合だけ対応表示する。 |
| 未決定の決め方 | 最初の二方式、Pro hardware／OS、Mini性能、package形式、権利／配布条件、保存移行規則は未確定。ROCKは動くsampleと失敗fixtureで形式を比較し、EXTERNAL／JOINTは対象engine・driver・実機で測定し、OWNERが初期対象と公開条件を決める。 |

現状は設計のみ。`GM01`の2D sandbox、FiveM bridge、Mini Webゲーム設計、`DX01`合成SDKはそれぞれ限定証拠で、汎用持込みやPro／Mini実機対応ではない。GitHub main `70c3e3ef3a05d6f0c9d068616a98f47a38b96d4a` と対象branch `codex/esim-cloud-access` は比較時点で3 commit先行／625 commit遅れ。実装前にmainの引継ぎ入口と優先順位を同期し、既存dirty差分を保全する。その後に作品manifestと診断結果の最小schemaを定め、既存Zema仕事へ接続した非金融fixtureを作る。実ゲームの権利と対象機種が確定するまでは公開・販売を進めない。

Web側の限定入口として、`avocadomini.si/create/`でブラウザの小さなゲームを編集・試遊し、MITスターターとmanifestを書き出し、アイデア／HTTPSデモを非公開で送れるようにした（WEB13、Sites v19）。これは作者の初回参加経路の実装であり、この節の汎用ゲーム持込み診断、OS上の起動、Zema保存、Mini／Pro実機互換の受入結果ではない。次の二作者・二方式fixtureと権利／公開同意のgateは継続する。

## 現実とGTAの橋渡し（2026-10-09 / AI06）

利用者がGTAへの出力と現実との橋渡しを明示したため、[詳細仕様](../gta-reality-bridge.md)を追加。主担当ROCKは既存Asset／Sky adapter／Zemaの契約を再利用し、EXTERNALはGTA/FiveMのinterface・適用条件、JOINTは同一artifactの実ゲーム受入、OWNERは出力・server・共有・費用を決める。状態は設計保存で、ROCK_READYやGTA実装済みではない。AI06を継続し、非金融デモをGX02の交換受入やFund完成の依存にしない。

最初の候補は自作カード→FiveM NUI→確認→Zema review。その後に3D導入・NPC・現実サービス接続を対象別に受入する。未指定の版／serverは推測せず、GTA Online/GTA VIや通貨交換の対応へ転用しない。次は最新mainと先行変更の同期、schema／journal／player link／workflow receipt gateのfixture実装、限定FiveM試験の順。

## 次に進める順番

1. 共通Core契約を使うGame／IPの非金融fixtureを作り、Zemaの進捗・成果・プロジェクト分離・中断再開を確認する。
2. 外部ゲームを接続する段階で、対象と公式API／sandboxを確定し、作者SDKの導入時間、成功率、復旧時間を測る。
3. 金融交換を追加する段階で交換方向、通貨、rate、取消条件を明示し、正式sandboxで残高、予約、確定、取消、再送、二重使用拒否を検証する。
4. 市場とファンドはPAPERを維持し、Provider、地域、KYC、清算が揃うまでLIVEを有効化しない。これを非金融Game／IP開発の依存にしない。

## 完了条件

- gameのポイント発行権限とWalletの資金記帳権限を分離する。
- exact digestに含まれない条件で実行しない。
- receipt、position、両台帳、取消結果が再起動後も一致する。
- 収益証拠がない場合に利回りを表示しない。

## 関連資料

- [現実とGTAをつなぐ出力仕様](../gta-reality-bridge.md)

- [AIネイティブOS詳細設計・Game／IP縦断案](../ai-native-os-architecture.md)
- [OS/Sky/Wallet/Game design](../os-sky-wallet-game-design.md)
- [Game API draft](../game-api-contract-draft.md)
- [GX01 plan](../gx01-contract-implementation-plan.md)
- [Value/spend runtime](../value-spend-runtime.md)
- [Market and fund](../everything-market-and-autonomous-fund-20260913.md)

## 検証

- `node --experimental-strip-types --test tests/everything-market.test.mjs tests/fund.test.mjs tests/markets-adapter.test.mjs`
- `node --experimental-strip-types --test tests/game-sandbox.test.mjs`（GM01、`npm test`経由で`npm run verify`に含まれる）
- nativeのGX00/GX01/DX01受入script

設計変更の整合確認: `npm run project:update`、`npm run baseline:check`、`npm run design:check`、`npm run verify`。GTA固有のfixture／実ゲーム試験は未作成・未実行で、上記の既存試験の成功から推測しない。

## 指定Webゲームの互換性試験（2026-10-15 / AI06）

gta.deloskiyt.plはfiveplay.lolへ転送。macOS Codex内browserでSandbox Mode→GTA V Mapを選択したが、観測中は6%／248 MBで起動未完了。到達画面の連携UIとWebMCP Toolは確認できず、Mini／RockstarOS／Pro連携は未実証。実機試験ではない。再開条件・結果は`data/project-status.json#gtaWebsiteCompatibilityTest`、履歴は`project.md`へ保存。外部siteの起動・接続口はEXTERNAL、adapterはROCK、同一artifact往復受入はJOINT。既存FiveM案とは別対象として扱う。

## FiveM世界境界のMac先行実装（2026-10-15 / AI06）

利用者がFiveMを選択し、Macでの先行実装を指示。toolkits/fivem-bridgeにloopback gateway・同一NUI・実resource候補を追加。`npm run game:bridge`でカードの現実→ゲーム確認→現実検収、逆向きの依頼下書きを試験する。親状態は既存workflowを再利用。本番D1/Sky Agentや実GTA/FiveM・GTA VI・実機は未受入。`node --experimental-strip-types --test tests/fivem-bridge.test.mjs`、UI一周、typecheck/design/verifyで検証。従来の「GTA fixture未作成」は履歴とし、今回のhost契約試験とは区別する。次は具体的な管理server/clientとplayerを固定し実ゲーム受入、続いて本番本人認証/Asset/Brokerを統合する。

## GTA VIからの製品設計学習（2026-10-17 / AI06、MAT15/18参照）

[GTA VI launch trailerと公式資料のavocado適用調査](../gta-reality-bridge.md#15-gta-vi-launch-trailer--公式情報からのavocado適用調査2026-10-17--ai06mat1518連携)を追加。文脈付きゲーム内phone UI、複雑な機能の簡易entry、owner承認を使う一周、共有対象/相手/残る可視範囲、行動履歴を一つの善悪scoreにしない原則を既存契約と照合した。Creator比較にはsandbox/sample tutorial/preview/publish/rollback/導入計測に加え、通報・公開停止・appealも含める。GTA Onlineの選出報酬はゲーム内GTA$で、現金payoutではない。GTA Online Mansionのfixed-function AI Assistantを「表示personaと限定capabilityを分ける」比較例として記録したが、LLM・汎用Agent・GTA VI/NPC機能とは扱わない。 Cfx FiveM security docsも照合し、ゲームclient/NUIの申告はrequest/候補として扱い、完了・支出・権限の証拠は本人認証済みAvocado workflowから得る既存境界を再確認した（GTA VI接続仕様ではない）。GTA VI digital purchase特典のGTA+月間加入は購入、claim、期限、auto-renew、cancelを分けて説明する。物理版のdownload code・platform region redemption・購入元別support routingを、既存SIM/eSIM purchase/activation/entitlement/client/device状態分離の類例として記録。Rockstar Terms of Serviceは明示の書面条件がないremote server/virtual PCでの利用・content copyを制約する。日本語Termsはgame/service content等を生成AIの開発・学習・強化・素材提供・宣伝へ使うことを禁止する旨を明記し、日本語MOD Guidelinesはmultiplayer改変のライセンス境界と未対応platform/device向け改変を定めるため、Game media/UGCをAvocado model input・retrieval・training・evaluation・promotionへ再利用する提案をしない。作品素材は転載せずリンクだけを保存。これらはGTA VI API・FiveM接続・契約を示すものではなく、GTA VI API/FiveM/Online/PC supportは未確認。GTA VI・実FiveM・本番Zema接続の受入状態は変更なし。FiveM host→同一jobの明示承認・hash readback・複数player分離を次のAI06候補とする。


RQ14の追加候補として、GTA V update notesにあるCreator配置・複数team test・設定持ち越しの修正を参考に、sampleのcreate/edit/test/save/restart/update/retest/rollback回帰fixtureを比較検討する。GTA VIの機能や不具合を示す情報ではなく、既存要件の変更でもない。

Rob NelsonのFamitsu interviewでのvehicle scan/価値/登録費用/前提条件の提示も、既存の見積・承認UIが対象capability、必要条件、予約額、副作用、次状態をcommit前に示す比較例として記録した。GTA内の値・機能をAvocadoへ取り込まない。

MAT15では、GTA VI固有のaccessibility/control設定は公式資料で未確認のため、PS5 haptic/audioの一般説明を字幕・入力支援の合格証拠に転用しない。Avocado UIの字幕/scale/contrast、代替入力、通知off、停止/復旧は別受入候補。

### MacのAgent仕事（2026-10-15、AI06 / ROCK）

利用者の「繋げるやつ全部となければ作成」により、対象名の回答待ちを解除。既存compositionの利用可能5 ToolをローカルAgentとして一覧化し、本人が最大6手順のAgentを作成できる。LLM推論ではない。ゲームNUIで目的・素材を依頼し、現実側で内容を承認して実処理、同じ仕事IDの最大10版を継続、成果を明示共有、検収/停止する。既存workflow契約・revision・操作IDを維持しSQLiteへ保存。ゲーム側には現実側の原稿・設定・過去版を出さず、共有した成果だけ戻す。最大100仕事/20 custom Agent、素材UTF-8 8000バイト、停止/失敗を成功に昇格しない。失敗時は設定済みAgentまたは次の版で修正する。無料記事Toolは標準設定だけでは実行できず、詳細設定が必要。

Sky外部AgentはROCK_BRIDGE_SKY_ORIGIN（HTTPS origin）とROCK_BRIDGE_SKY_TOKEN（既存本人session）の明示設定で登録一覧を取得するread-only connector。資格情報はgateway内のみ。未設定・認証失敗は未接続表示、登録済みを実行可能にしない。外部実行は既存見積/予算/Broker/delegation/usage経路の接続と受入が未完了。GTA VI、実FiveM、本番Zema、通貨交換、skin販売の成功ではない。

合格証拠: tests/fivem-bridge.test.mjs 11/11＋旧launcher 2/2、Mac UIで仕事cd237d92-84cb-4c33-a334-875fcf2d3bcdの出典整理→同ID第2版→明示共有→completedとcustom Agent作成。次は外部接続の本人環境・許可済み予算を設定して別受入する。


### FivePlay公開システム解析とadapter（2026-10-15、AI06）

利用者が指定したFivePlay軽量URLを解析。build 8b0b5899edはWASM/WebGPU、GPU/IO worker、IndexedDB userdata、COOP/COEPのWeb版。FiveMやGTA VI公式APIと混同しない。Mac IABで6%→No progress表示、world未到達。ロード表示はタイマーで6ポイントまで進むため起動成功証拠ではない。原因は未確定。

ゲームメモリや通貨を変更する入口は確認できず、公開コードから連携に使えるのは起動設定と画面上の診断。本人入力の仕事端末をChrome拡張として重ね、専用localhost:5217 gatewayにagent_requestを送り、同じworkflowで現実側の実行・継続・共有を扱う。目的/素材/Agentが入力、仕事要約/明示共有成果が出力。専用SQLiteとsession token、1時間失効、同ID再照会、原稿非公開、外部実行なし。拡張実導入は未受入。詳細・失敗/復旧・権限・受入手順はtoolkits/fiveplay-adapter/README.md。14/14対象試験＋lint合格。次は利用者確認後の拡張導入と同site UI往復、ゲームengine起動は提供者側の問題として独立して切り分ける。

## GTA VI追加調査の適用仮説（2026-10-17 / AI06、MAT18）

[詳細調査§16](../gta-reality-bridge.md#16-追加調査実地観察制作規模創発的な仕事導線2026-10-17--ai06mat1518参照)を追記。主な追加仮説は、既存job/assetの文脈から「次の候補」を出しても自動実行せず、根拠・対象・費用・副作用を開いて本人が選ぶ流れを測ること、同一IDの実利用一周で停止・再起動・重複・費用上限・revision競合を測ること、MAT18を一室・一課題へ絞って現場を観察すること。GTA VIのNPC/世界の仕組みをAvocado AIやAPIと扱わない。Bloomberg本文は未取得で、制作規模/スコープの主張は二次報道に帰属。新要件・runtime変更・GTA VI接続受入ではない。

追加のRob Nelson取材報道から、柔軟な経路と必須の節目の分離、長い更新周期で古びにくい利用者目的を基礎にし、変化する根拠へ出典/時点/期限/更新者を添える案も§16へ記録。Avocadoでは自由経路を試しても認証、本人承認、見積/上限、権利scope、停止、成功証拠のgateを迂回させない。これはAI06の既存契約を説明する候補であり、要件変更・GTA VI機能取り込みではない。

## GTA VI追加調査：役割handoffと発見/購入境界（2026-10-17 / AI06、MAT15/18）

[§17](../gta-reality-bridge.md#17-追加調査役割引継ぎ車外でも続く音声任意の個人化2026-10-17--ai06mat151518参照)のFamitsu取材は、story contextごとに主人公切替を自由・固定・強制へ分け、操作外人物にも日課があると説明する。Avocadoでは既存job/revision/ownerを保ってAgentへ必要最小限の仕事contextを渡す比較案に留め、本人性・承認・予算・停止権を移さない。保存されたblocked/approval-needed状態と、明示許可なしに裏で実行し続けることを分離する。個人化personaやmemoryはoffでも基本jobを完了可能にし、authority gateへ影響させない。任意音声要約とpreviewからは、pause/stop、private output、同一job復帰、誤解・割込み・漏えい計測を候補化する。[§18](../gta-reality-bridge.md#18-追加調査発売導線地域コードラジオ局プレビュー2026-10-17--ai06sime商品設計参照)は候補一覧のpreview、provider/source、scope、estimate、試用と購入/実行権の分離、期限/更新日を設計比較へ追加する。Rockstar素材・音源を再利用せず、GTA VI API/契約/entitlement接続を主張しない。requirements・runtime・権利・GTA VI/FiveM受入は未変更。


## Mini単体のWebゲーム設計（2026-10-15）

利用者の追加指示により、主担当MAT15/JOINT、Game AI06連携として[R5ゲーム実行設計](../avocado-mini-r5/game-runtime-design.md)を追加。1本自律・200mm以内・別Edge Hub不要を維持し、WASM/WebGPU、GPU driver、メモリ比較、電源/熱、OS/game focus、同一仕事IDの継続、原稿非公開、失敗/復旧、MG01〜07の合格条件を定義。Chrome拡張はMac参照adapterで、Mini本番はOS操作面/Brokerへ移植する。Mini実装・実機・FivePlay起動・裸眼表示・製造の合格ではない。原本packageは不変。

## 招待pilotとcreator向け公開段階（2026-10-17 / AI06 RQ14）

[GTA VI追加調査§19](../gta-reality-bridge.md#19-追加調査招待制creatorcommunity導入の境界2026-10-17--ai06-rq14)でRockstar公式のNoPixel V発表を確認した。対象はGTA V roleplayで、招待制closed betaとLauncher参加、将来の段階的招待/overlay予定を告知する。RQ14では作者登録・審査・招待pilot・一般公開の参加条件とsupportを区別する比較例として記録する。open SDK、GTA VI/FiveM接続、Creator PLA上の新しい権利を示すものではなく、仕様/rights/gatesは変更しない。

## 作者prototypeからfeaturedまでの導線比較（2026-10-17 / AI06 RQ14）

[GTA VI調査§20](../gta-reality-bridge.md#20-追加調査作者の試作共有審査撤回2026-10-17--ai06-rq14)のRockstar公式GTA Online Mission Creator資料は、5本の実演tutorial→prototype→作者同士のfeedback→公開時tag→Community Seriesで特集候補という段階を示す。RQ14でtutorial/sample/sandbox/preview/diagnosticを連結し、任意feedbackと明示publishを分ける比較候補にする。特集/順位は安全保証や権利承認と別にし、作品単位の通報・停止・rollback、理由提示、appeal、export/削除/retentionを測定可能にする。RockstarのGTA V/Online閾値を流用せず、現行RQ14の作者権限・Wallet分離・手数料未定と本番gateを維持する。GTA VI API/creator対応は未確認。

## 作者/Tool catalogの情報発見（2026-10-17 / AI06 RQ14）

[GTA VI調査§23](../gta-reality-bridge.md#23-追加調査公式storycharacter情報の発見導線2026-10-17--rq14-ai06)は、Rockstar公式VI siteのshort clip群、人物/地域ごとのhook、短い文脈、人物・場所の隣接導線を公開Webの構成として確認した。RQ14/Sky候補は、Tool/作者を見つけた後、利用目的・入出力・権限・費用・保存先・sample/previewへ1段ずつ進めること。紹介clipだけで承認/品質/権利の証拠とせず、textual routeと診断可能なsampleも用意し、発見→sandbox実行→復旧成功を測る。GTA素材の利用権、GTA VI内social feed/API、SNS product featureの根拠にはならない。

## Contextualな次候補と操作負担の比較（2026-10-17 / AI06）

[GTA VI調査§24](../gta-reality-bridge.md#24-追加調査仕事候補の自発性と操作負担2026-10-17--ai06mat18)は、BloombergのRockstar責任者取材にある「二人の主人公が一緒に自由行動する従来型game AI/system」と、飲み物を買うような日常interactionのrealism/usability tradeoffを記録する。Avocadoでは、既存file/job contextから候補を提示しても自動で開始せず、根拠/対象/入出力/費用/副作用/停止方法を提示して本人が選ぶ比較仮説に留める。候補dismiss、開始時間、不要通知、誤操作、同一job/revision継続とapproval前外部操作0件を測定する。記事本文は直接表示できず検索に返った抜粋へ依存し、GTA AI/API/外部agent権限の仕様へ転用しない。

## Game author UGCとcustom assetの権利区分（2026-10-17 / AI06 RQ14）

[GTA VI調査§25](../gta-reality-bridge.md#25-追加調査ugcと作者作成物の権利通報契約2026-10-17--rq14)はRockstar ToS上のUGCとCustom Contentの別定義、creatorが保持する権利/投稿に伴うlicense、moderation/notice/appeal/automated filterを確認した。RQ14では作者original asset、third-party derived asset、Avocado service feedback、sample/resultの所有/許可scopeを一括りにしない比較案に使う。これはRockstar向け規約の記録であり、Avocadoの契約・市場・learning consentを確定しない。権利・作者報酬・marketplace termsは未決定を維持する。

## 作者sandboxの回帰fixtureと推薦導線（2026-10-17 / AI06 RQ14）

[GTA VI調査§26](../gta-reality-bridge.md#26-追加調査作者ツールの回帰と検証可能性2026-10-17--ai06-rq14)では、RockstarのGTAV 1.72/1.73公式更新履歴からCreatorのteam、条件境界、保存/再起動、参照削除、上限、test-mode復帰に関する修正を確認。RQ14のsample/sandboxへ、最小・最大設定、save/reopen/restart、境界条件、cleanup、resource limit、resume、fail reason/復旧を含むfixture suiteを置き、公開済みrevisionとテスト証拠を結ぶ比較案を記録する。推薦・次候補への露出はdiscoverabilityであり品質・権利・セキュリティ合格ではない。GTA V/Onlineの事例をGTA VI機能へ外挿せず、RQ14 runtime/contract/author rights/Wallet/gates変更なし。

## 購入元別supportと地域/年齢表示の比較（2026-10-17 / AI06）

[GTA VI調査§27](../gta-reality-bridge.md#27-追加調査購入後support-routingと年齢購入表示2026-10-17--ai06sime参照)のRockstar Support購入FAQは、storefront・Rockstar Store・小売で責任窓口を分け、注文/返金/配送、code、region、期限を区別する。Avocado SIM/eSIM導線では、回線/端末販売/entitlement/client/OS適合ごとに提供者・状態・問い合わせ先を示す案に使う。本人が確認したscopeだけを窓口へ渡し、外部費用/無料期間/更新を分ける。米国ESRBのGTA VI M17+/In-Game Purchases表示は内容ラベルの例だが、地域ごとの評価体系やAvocadoの年齢基準を決めない。契約・料金・責任分担・schema変更なし。

## Third-party account linkと共有scopeの比較（2026-10-17 / AI06 Security参照）

[GTA VI調査§28](../gta-reality-bridge.md#28-追加調査第三者account-link公開範囲復旧経路2026-10-17--ai06security参照)は、Rockstar accountからPS/Xbox接続時の本人操作、public visibility確認、2FA時の手順、QR sign-in、link/unlink制限と進行喪失リスクをSupport資料で照合した。Avocadoでは外部接続前の共有属性・表示先・unlink影響/復旧案内、password/2FA/recovery secretを転記させないhandoff、無接続routeとservice単位のscopeを比較候補にする。GTA VIにaccount linkが必須とは示さず、identity・permission・storage・contract仕様の変更なし。

## UGC visibility・block・reportと復旧の区分（2026-10-17 / AI06、Security）

[GTA VI調査§29](../gta-reality-bridge.md#29-追加調査privacy-controlの意味とaccount-recovery2026-10-17--ai06security)のRockstar FAQはprofile/statisticsのvisibility、UGC commentの扱い、blockとindividual reportの意味を分け、account recoveryでは長期アクセス可能なemail/2FA recoveryを勧める。RQ14ではprofile/object/comment/result/linkのscope、hide vs block vs reportの結果、unpublish後のshare/cache、author export/delete、review/appeal、account recoveryを個別fixtureで説明する候補とする。Rockstar設定の完全性やGTA VI固有挙動は主張せず、Avocado privacy/moderation/storage SLAを確定しない。

## Non-programmer向けcreator導線の測り方（2026-10-17 / AI06 RQ14）

[GTA VI調査§31](../gta-reality-bridge.md#31-追加調査non-programmer作者をtask完了と困りごとで評価する2026-10-17--ai06-rq14)は、Rockstarの5本example mission導線を、LAGARTOの28人/開発経験者・初心者比較と照合。全参加者がゲームを作れた一方、icons/concepts/configurationsの混乱が残った。RQ14では「tutorialあり」だけで完了扱いせず、初心者/経験作者の初回成功時間、error/repair、hint依存、preview/復旧、権利・permission理解を測定する比較案にする。2017 location-based editor studyの結果をAvocadoやGTA VIへ一般化せず、市場首位の主張・SDK仕様変更なし。

## UGC保持期限・退役時export・creator停止範囲（2026-10-17 / AI06 RQ14）

[GTA VI調査§32](../gta-reality-bridge.md#32-追加調査公開ugcの期限-export-アクセス停止の条件2026-10-17--ai06-rq14)のRockstar一次資料を再確認。GTA Vの個別retention policyは「1年以上、rating<5、accountで12か月playなし」の全条件を定め、PS4/Xbox One Editor終了では予定日とYouTube export、Mission Creator違反停止ではtemporary lossとappealを説明する。RQ14では保存期限・退役・account suspensionの事前開示、owner export/復旧、削除の対象範囲・cache propagationを個別受入する比較案。期間/評価しきい値/YouTube方法やRockstar Creator契約をAvocadoへコピーしない。retention/SLA/contract/runtime/gate変更なし。

## 匿名sourcesの市場報道とofficial availabilityの境界（2026-10-17 / AI06 RQ14）

[GTA VI調査§33](../gta-reality-bridge.md#33-追加調査creatorpc報道を公式launch-scopeから分離2026-10-17--ai06-rq14)で、Digidayの匿名3人による将来のcreator conversations報道と、GamesBeatの匿名4人によるPC版Q1 2027報道（Rockstar no comment）を、現行の公式launch page/support FAQと分離。Avocadoのresearch claimにはsource/date/type/conflict/owner/expiry/required access proofを持たせ、anonymous reportをavailability/rights/pricing/integration promiseへ昇格させない比較案。これはmarket validationではなく、GTA VI PC/Online/UGC/APIを確定しない。

## Popularity rankingとcreator品質の区分（2026-10-17 / AI06 RQ14）

[GTA VI調査§34](../gta-reality-bridge.md#34-追加調査creator推薦のpopular-biasとdiscoverability2026-10-17--ai06-rq14)ではGTAV job nomination導線と、単純化したcreator popularity recommendationの理論/simulation studyを照合。人気onlyは発見を速くする場合がある一方、露出機会を偏らせる/creator公平性・search costとのtradeoffを含む。RQ14候補はrecommendation・self-search・scope/cost/sample previewを併せ、featured/popular labelをquality/security/rights verificationから分離する。measure案はnew/long-tail creator exposure、sandbox start/success、task-fit、検索時間。研究はAvocado/GTA VI内rankの実験ではなく、推薦algorithm/gate/権利を変更しない。

## GTA VIの二次報道claimを公式statusへ昇格させない（2026-10-17 / AI06 RQ14）

[GTA VI追加調査§36](../gta-reality-bridge.md#36-追加調査発言見出し公式statusのclaim-chainを分ける2026-10-17--ai06-rq14)はTwitch CEOの“next year”という報道、2027と断定する一部headline、公式single-player launch範囲を区別。Avocado research claimでは一次発言/引用、話者の見通し、編集要約、headline、公式statusを別々に保存し、同一記事への相互引用を独立source数にしない比較案。Bloomberg本文は直接検証できず、GTA VI multiplayer/date/creator integrationは未確認のまま。これはAvocadoの市場事実やproduct roadmapを承認しない。

## Catalog sample・本番entitlement・外部購入を分ける（2026-10-17 / AI06 RQ14）

[GTA VI追加調査§37](../gta-reality-bridge.md#37-追加調査公式音楽pageのpreviewと商品情報を別導線にする2026-10-17--ai06mat18rq14)で公式music pageがstation previews、single/album contentとstreaming/store導線を併置することを確認。Sky/RQ14 catalogではdemo/sample、live connected service、paid add-on、subscription entitlement、region/renewalを別状態で見せ、preview範囲を本番契約やrights grantと混同しない比較案とする。これは第三者音楽・radio/podcast API・Avocado integrationの権利や利用許可を与えない。

## Offline availabilityとcloud/service利用権を別状態で見せる（2026-10-17 / SIM/eSIM、AI06）

[GTA VI追加調査§38](../gta-reality-bridge.md#38-追加調査offline-capabilityとlicenseentitlement-caveatを並べる2026-10-17--ai06sime)ではPlayStation Storeのoffline/1-player表記とGTA+のaccount restriction・auto-renew、product listingのonline/additional fee legal caveat、Rockstar FAQのpreload/region/code deliveryを比較した。Avocadoの購入・activation・client・offline/local capability・cloud-agent availability・entitlement expiry/syncは別stateとし、serviceが使える/オンライン/同期済み/利用権継続中を同一badgeへ潰さない検討案。表示はAvocadoの価格/地域/契約、通信fallback、expiry/renewalを確定しない。

[GTA VI追加調査§39](../gta-reality-bridge.md#39-追加調査同じ期間特典でもplatform別のredeemrenewalが違う2026-10-17--ai06sime)では米国PS/Xbox listingで同じ一か月GTA+特典のaccount binding、redeem期限/起算、age restriction、renewalの違いを比較。Avocadoの販売channelごとにentitlement owner、redeem state/期限、eligible account/age/region、cancel/renew seller、duplicate use prevention、support routeを明示する仮説。既存価格・決済・SIM entitlement・契約やproduct gateは変更しない。

## AI・料金claimの対象/除外範囲を見せる（2026-10-17 / AI06、RQ15）

[GTA VI追加調査§40](../gta-reality-bridge.md#40-追加調査生成ai課金の報道を対象範囲つきで引用する2026-10-17--ai06rq15)はKinda Funnyの一次音声episode掲載と、Rockstar開発責任者の短い回答を引用した二次報道を区別し、Rockstarはfuture Onlineの課金へ回答していない点、launch productをsingle-playerとする公式範囲を合わせて記録。AvocadoのAI使用/料金/無料/上限表示もactivity・版・時点・対象・除外範囲・根拠を明示し、one product area's claimを全service/future capabilityへ拡張しない比較案。GTA VI interviewからRQ15 fees/OSS/BYOK/Wallet・Avocado AI policy/contractを変更しない。
同§40にはpublisher-level AI tool use / generative asset creation / product runtime generation / employee workflow / creator submissionsの境界も追加した。GTA VIへの限定発言をTake-Two全体のAI policyや全開発processへ拡張せず、curated product/tool, unreviewed UGC, sample asset, production serviceを検証stageごとに分ける比較案。

## 有料preview配信と無料の公式情報route（2026-10-17 / AI06、SIM/eSIM）

[GTA VI追加調査§41](../gta-reality-bridge.md#41-追加調査有料platform先行と無料official-fallbackを並べる2026-10-17--sime-ai06)はRockstarのNetflix先行上映時刻と同夜のYouTube/公式site配信を比べる。AvocadoのSIM/eSIM/service purchase funnelではdevice readiness・料金・activation・support情報の確認route、paid window/early access、一般利用可能時刻を分けて表示する仮説。これは各購入条件やfree tierを確定しない。

## Region・local date・age/payment/code expiry（2026-10-17 / SIM/eSIM）

[GTA VI追加調査§42](../gta-reality-bridge.md#42-追加調査地域別価格年齢審査決済条件を同じ画面で混ぜない2026-10-17--simesimai06)は日本の価格、10/17に更新されたCERO Z listing/18+購入とcredit-card rule、170-day product-code expiry、local-vs-UTC launch timestampを照合した。PS Storeには一部に以前のCERO審査予定表示も残り、同一pageの状態が割れて見える。Avocadoはlocale/country、age/eligibility、currency/tax/payment、code validity/activation deadline、local and UTC expiryを個別確認し、status updateを見出し・offer・legal info・age/payment gateへ同期する比較案。localeから法的対象資格を推定しない。Avocado policy/price/payment/legal gateは変更しない。

## Summaryから必要なdetailsへ段階表示（2026-10-17 / AI06、RQ14）

[GTA VI調査§44](../gta-reality-bridge.md#44-追加調査detailは背景へ隠さず段階的に開く2026-10-17--ai06rq14)はLOVE Magazine取材のGamesRadar+報道とBloombergのNPC専任writer-team報道から、走り過ぎても全体を掴み、注目したい情報は掘り下げられるという layered content仮説を記録。AI06/Skyはdefault viewに結果・費用・権限・次action・ownerを表示し、本人が選ぶsource/risk/exception/restore detailを結び、click-depth・finding time・summary misdecision/errorを測定する候補。記事やGTA VIをAvocado UX証拠とせず、実装/permission/summary policyを確定しない。

## Platform featureと課金descriptorの曖昧さを区別（2026-10-17 / AI06、RQ15、MAT18）

[GTA VI追加調査§40](../gta-reality-bridge.md#40-追加調査生成ai課金の報道を対象範囲つきで引用する2026-10-17--ai06rq15)はKinda Funny interviewの二次報道にある「no microtransactions」と、ESRB/米PlayStation Storeの`In-Game Purchases` descriptor/optional labelを並べ、現時点で具体的mechanismが未確認であると訂正した。ESRB descriptorの存在はloot box/random itemを意味しない。Avocadoの「no monetization」等の広い宣伝claimはbase price、optional in-product purchase、edition/add-on、subscription、trial auto-renew、future serviceを分解して根拠を結び、未説明のmetadataがあればclaimを狭める候補。価格・購入機能・課金policyを変更しない。

[GTA VI追加調査§45](../gta-reality-bridge.md#45-追加調査体験上の機能をplatformdevice-capabilityごとに記述する2026-10-17--ai06mat18)はPlayStation公式feature pageのPS5/PS5 ProとDualSense/Tempest 3D対応を観察。同じappでも端末・周辺機器・設定によりcapabilityが違い得るので、Avocadoではsoftware feature、device/OS, accessory, enablement, region availabilityを分けて説明し、触覚/音声は任意制御と別channel fallbackを備える仮説。GTA VIページには現時点のage ratingがunconfirmedとする古いFAQ文も残り、他の公式storeには更新後ratingがある。機能/region/device/FAQのrevisionを同期する比較案。Xbox parityやAvocado accessibility guaranteeを推定しない。

## UGC safety reportとprivacy controlsを分離（2026-10-17 / RQ14、Security）

[GTA VI調査§46](../gta-reality-bridge.md#46-追加調査ugcのreport対象privacy-controlblock機能の限界を分解2026-10-17--securityrq14)はRockstar GTA Online Supportのreport taxonomy (target/context/reason)とprivacy setting/UGC visibility/blockの限界を照合。Avocadoへはreport submission/decision/appeal、content hide/block/mute/direct-contact block、privacy visibility scopesを別状態にし、blockしてもUGC comment/viewが残る可能性を事前表示する比較案。既存RQ14のreport/appeal gateを具体化する研究候補であり、実装・moderation SLA・security promiseは変更しない。

## Hubから複数商品/merchant/supportへのhandoff（2026-10-17 / SIM/eSIM、AI06）

[GTA VI調査§47](../gta-reality-bridge.md#47-追加調査同じ公式hubから別商品販売者supportへ分岐する2026-10-17--simeai06)は公式GTA VI hubからgame preorder、soundtrack、physical collector’s merchandiseへ遷移し、merch listingは$399.99 boxにゲームを含まないと明記、checkout receiptにmerchant of recordが示され、physical商品/digital game/third-party retailでrefundとsupport ownerが異なるrouteを観察。Avocado hubからSIM/eSIM/device/service/usage/subscription/physical productへ渡す時は、購入対象、別契約/entitlement、seller/merchant、support/refund owner、region/price/shipping/tax/renewalをhandoff前に再確認する候補。GTA商品/売買情報は参考にとどまり、Avocado pricing/merchant/payment/legal policyを決めない。

## Creator discoveryと手順tutorialの支援候補（2026-10-17 / RQ14、AI06）

[GTA VI追加調査§31・34](../gta-reality-bridge.md#31-追加調査non-programmer作者をtask完了と困りごとで評価する2026-10-17--ai06-rq14)は、ARifyの編集可能な半自動tutorial authoringと、推薦順序がcreator exposureへ与える影響をモデル化したOPC研究を比較材料に追加。RQ14では、許諾済み素材からstep案を作る場合も編集・前提/安全境界の確認・preview・人のpublishを必須の候補状態として分ける。discoverabilityでは初期exposure件数/順番、creator cohort、user task-fit、満足度、不適切率を評価し、有料featuredとorganic orderingを区別する。ARifyは3機械task/18人、OPCは解析/シミュレーションの研究でありGTA/Avocado実証ではない。いずれもGTA media reuse rights、特定ranking algorithm、RQ14 metric gateを承認しない。

## Rating / data collection / family controlを別々に説明（2026-10-17 / RQ14、Security）

[GTA VI追加調査§48](../gta-reality-bridge.md#48-追加調査年齢rating-privacy-collection-家族制御は別の情報層2026-10-17--ai06securityrq14)ではESRBのMature/content descriptors/Interactive Elementsと、PlayStation側の年齢・communication/UGC・spending・exception controls、Rockstarのgeneral privacy policyを別レイヤーで比較。Avocado catalog/content onboardingではprovider ratingを表示しても独自access decision、account linking/data recipient、usage cap、communication permission、UGC display、guardian exceptionを混同せず、対象・期間・承認者のreadbackが必要か検討する。Rockstar privacy pageは今回直接openできずsearch excerptで確認、GTA VI固有telemetryは未確認。Avocadoのage policy/collection policy/child account requirementsは変更しない。

## Playtest/release/discovery statusとtask quality metrics（2026-10-17 / RQ14）

[GTA VI調査§49](../gta-reality-bridge.md#49-追加調査private-playtest-moderation-discovery-statusとengagement-metricを切り分ける2026-10-17--rq14)はFortnite Creativeのprivate version/playtest、Listed/Unlisted/Unpublished、moderation後のDiscover eligibility、CTR/session metrics/A-B thumbnail testを隣接比較例として記録。最新workflowも確認し、private code版は未moderated、metadata/assets reviewとin-island gameplay reviewは二段階、new releaseのrejectではlast approved live版を維持、approval後はautomatic/manual publishを選べることを追記。RQ14候補はtest/review/discoverability/current releaseをrevisionごとに別stateにし、失敗時はcurrent known-good revisionを維持すること。滞在時間ではなくtask fit、成功/失敗/復旧、outcome quality、creator exposure、cost per successful taskを測る。Fortnite pipelineやengagement algorithmはGTA VI/Avocadoへ転用せず、rights/security proofやAvocado release requirementにしない。

## Creator向けranking説明とAI下書きの受容・修正の計測（2026-10-17 / RQ14、AI06）

[GTA VI調査§31・34](../gta-reality-bridge.md#31-追加調査non-programmer作者をtask完了と困りごとで評価する2026-10-17--ai06-rq14)へMindCopilot (IJCAI 2026)のsuggestion-level acceptance/editing-effort measureと、Liu & Fan (2026)の中国クリエイター1,154人のfeed process-disclosure experimentを追加。候補はAI tutorial/Tool suggestionのaccepted/edited/rejected/repair pathとreview timeを測り、推薦面ではbasis/provenance/sponsored status/choice controlsを説明した上で実 exposure outcomeを別に監査する。評価の知覚上の改善を真の公平性・AI内容正確性の証拠にせず、両研究をAvocado/GTAの実証へ一般化しない。

PlayStationのsystem accessibility featuresを[GTA VI調査§45](../gta-reality-bridge.md#45-追加調査体験上の機能をplatformdevice-capabilityごとに記述する2026-10-17--ai06mat18)へ追加した。Platformが持つcaptions/screen-reader/controller controlsは個別game/Tool対応を保証せず、Avocado listingはOS/device-level affordance、Tool-level implementation、未対応範囲を区別する比較案。各機能の対象とfallbackを受入時に確認するが、現行RQ14/UI capability/Accessibility claimは変更していない。

## 小規模creatorのtest designとfeedback/action traceability（2026-10-17 / RQ14）

[GTA VI調査§50](../gta-reality-bridge.md#50-追加調査小規模作者のplaytest計画とfeedback-triageを支える2026-10-17--rq14ai06)は13人のindie developer interviewに基づくCHI PLAY studyでtest objective、participant/cohort bias、method selection、feedback noise、prioritizationの負担を観察。候補はtest goal→version/cohort/consent→reproducible finding→severity/owner/decision→fix/retestを作者が辿れる軽量workflow。Agentはissue候補をまとめてもseverity/publish actionを決めず、recording/telemetryは目的説明とopt-inなしに要求しない。Qualitative 13-person interviewから市場需要/ROI/RQ14 thresholdを断言しない。

## Game virtual balanceとWalletの別台帳・移行state（2026-10-17 / RQ13、Wallet）

[GTA VI調査§51](../gta-reality-bridge.md#51-追加調査ゲーム内残高のearnedpurchased-platformmigration条件を分離2026-10-17--rq13wallet)はRockstar general ToSのVirtual Items clauseとGTA Onlineのearned vs purchased currency、console-family migration、old-platform service closure conditionsを比較。RQ13候補としてprovider/platform/runtime/accountにboundしたvirtual balanceとAvocado real-fund Wallet ledgerを分離し、earned/purchased/bonus, transfer eligibility, expiry, migration/sunset, support/refundを別項目化する。GTA V/OnlineのtermsはGTA VI仕様・換金/販売権を与えず、実balanceは動かしていない。既存Wallet/ATM/ゲームadapterは変更せず、production exchange gateを維持する。

[GTA VI調査§38](../gta-reality-bridge.md#38-追加調査offline-capabilityとlicenseentitlement-caveatを並べる2026-10-17--ai06sime)もStore listingのsingle-player表示を読み、主人公数/Agent数/端末数から独立したhuman identity/approval capacityを推定しない境界を追加。Avocadoのsingle owner multi-device、multi-agent delegation、複数本人が同一業務へ参加するpermissionは別々の検証対象。公式GTA VI listingはいまsingle-playerを示し、multiplayer feature/dateは未確認。

## Creator benefitの仕組み・通貨・payout basisを分ける（2026-10-17 / RQ14、RQ15、RQ13）

[GTA VI調査§52](../gta-reality-bridge.md#52-追加調査featured-reward-affiliate-engagement-share-in-game-salesは別経済2026-10-17--rq14rq15rq13)ではGTA Onlineのfeatured creatorが受ける一度のGTA$+cosmetic rewardと、Fortniteのmonthly engagement pool、Support-A-Creator affiliate program、V-Bucks direct saleを比較。Avocadoはaward, affiliate, sponsored distribution, revenue share, direct sale, in-product currencyを別契約/ledger/statusで表示し、featured badgeだけでpayout entitlementを推定しない検討案。Epicの40% formulaやGTA$10m rewardはGTA VI/Avocadoの市場価格・payout promiseではなく、既存RQ15 ATM fee ruleやRQ13 Walletを変更しない。

## Paid/organic流入・creator報酬見積・支払可能状態を分離（2026-10-17 / RQ14、RQ13）

[GTA VI調査§53](../gta-reality-bridge.md#53-追加調査推薦露出広告流入creator-reward現金化の状態表示を分ける2026-10-17--rq14wallet)はRoblox Creator Hubの流入source別analytics、Creator Rewards estimate、60日hold、DevEx eligibility reviewを比較。Avocado候補はorganic recommendation・広告・share referral・qualified use・estimate・adjustment/hold・withdrawal review・paidの各段階を別に記録し、出所別の露出/成果とdata latencyを見せること。露出はpayout entitlementではなく、Dashboard estimateも確定報酬/現金化保証ではない。長時間滞在や支出額だけをcreator順位やjob successの代理にしない。Robloxの動的な規則はGTA VI/Avocadoのcontractや料金を決めない。

## Rockstar公式音楽previewと利用権の境界（2026-10-17 / MAT18、RQ14参照）

[GTA VI調査§37](../gta-reality-bridge.md#37-追加調査公式音楽pageのpreviewと商品情報を別導線にする2026-10-17--ai06mat18rq14)では公式music pageの局別試聴、original score single、album preorder/listening導線を確認。avocadoMiniのsound discovery候補では、権利者/provider、利用範囲、preview/sampleか実再生か、地域/期間、料金、再生先device/room capabilityを別表示し、試聴を実利用権・インストール済みscene・pilot受入とみなさない。GTA音源/画面/brandを再利用せず、MAT18 requirement/rights/contractを追加しない。

## Creator team権限を作業/actionごとに分離（2026-10-17 / RQ14、Security）

[GTA VI調査§54](../gta-reality-bridge.md#54-追加調査共同作者のplayeditpublishmonetize権限を分ける2026-10-17--rq14security)はRoblox Groups/Collaborationのtest/edit/publish/analytics/monetization/secrets/API-key/revenue roles、higher-impact controlsの2-step requirementを確認。RQ14 sandbox候補はplaytest/editor/reviewer/publisher/analyst/monetization/API-key/supportを別権限にし、test accessやeditをpublic release/payment authorityへ昇格させない。Rockstar account unlink support pathもGTA VIのlink specから区別。Avocado role matrixやSecurity requirementを本調査で確定/実装しない。

## 競合タイトル費用のrumorとportfolio accountingを分離（2026-10-17 / 事業判断、RQ14）

[GTA VI調査§55](../gta-reality-bridge.md#55-追加調査viral-budget額と会社のaggregate-accountingを分ける2026-10-17--rq14事業判断)はTake-Two Form 10-Kで未発売タイトルのdevelopment costsがportfolio aggregateであり、GTA VI個別budgetではない点を確認。Avocado事業仮説では実費、契約commitment、reserve、forecast/scenarioを別に示し、出典・対象期間・marketing/infra/payroll inclusionを記録する。GTA VIのrumored budgetやparent-company revenue/bookingsをAvocado単価、payout、pilot ROIの証拠へ流用しない。

## Sample run→source inspect→revision testの作者オンボーディング仮説（2026-10-17 / RQ14、SDK）

[GTA VI調査§56](../gta-reality-bridge.md#56-追加調査遊べるsampleから作者用sourceを開く学習導線2026-10-17--rq14sdk)はGTA Online Mission Creatorが5 tutorial missionsを通常play/Creator内のsource inspection双方で提供する例を確認。Avocado SDK候補はrunnable reference→user-owned copy→bounded edit→revision-linked test→preview/share→explicit publishまでのguided sample path。time-to-first-success、fork/edit/test/recovery、unsafe inherited permission、support costを測るが、sample completionはpublic publish/readinessや実資金権限を許可しない。GTA Onlineのcuration/tag/rewardをGTA VI/Avocado制度へ移植しない。

## SDK exampleの実行可否と版整合を検証（2026-10-17 / RQ14、SDK）

[GTA VI調査§57](../gta-reality-bridge.md#57-追加調査sdk-exampleは版固定実行可能再検証可能にする2026-10-17--rq14sdk)はAPI example comprehension/reuse研究を追加。Avocado候補はlinear starter pathにSDK/runtime version, capability, fixture, expected output, dependency versions, test commandを結び、copy/edit後にold validation evidenceを失効しsandboxで再実行すること。measureはfirst-run pass, repair, misuse/security finding, task success, comprehension time/error, version drift。61人Java studyの速度差は正答率改善ではなく、React abstractの全文取得も不可だったため、市場効果や要件変更の証拠にしない。

## Bundle entitlement・subscription trial・redeem期限を個別表示（2026-10-17 / SIM/eSIM、Service Access）

[GTA VI調査§58](../gta-reality-bridge.md#58-追加調査bundle商品trialdigital-codeの受取地域更新条件を分ける2026-10-17--sime-service-accessrq14)はRockstar physical/digital delivery、PS/Xbox code region差、日本向けredeem expiry、digital pre-orderのGTA+ trialとmonthly auto-renewを比較。Avocado SIM/service offer候補はSIM/network/service entitlement/cloud usage/client install/promotionを別line itemにし、seller, region, account binding, price/tax, expiry, renewal price/cycle/cancel routeを見せる。Paymentはservice access, connectivity, native/client install, Agent budgetを自動的に一つの承認へしない。Rockstarのchannel rulesはAvocado契約ではないため価格/規約を変更しない。

## Paid placement / creator sponsorshipの表示と監査（2026-10-17 / RQ14）

[GTA VI調査§59](../gta-reality-bridge.md#59-追加調査sponsorshipを見えない推薦へ溶かさない2026-10-17--rq14creator-market)はTwitter influencer corpusでnon-disclosureが広く推定されconsumerがsponsorを見分けにくいとするMarketing Science paperを追加。Avocado候補はsponsor, affiliate, paid placement, organic ranking, curated selection, creator self-promotionのbasis/provenanceを視覚的に分け、billing/affiliate metadataとsubmission disclosureの一致をauditすること。paid exposure share、organic cohort reach、task fit、under-disclosure complaintを別々に監査する。Twitter influencer estimateをgame/Avocado prevalenceやlegal complianceへ転用せず、sponsorship marketplaceを要件化しない。

## Telemetry/debug recording/room sensorごとにdata scopeを分ける（2026-10-17 / RQ14、Security、MAT18）

[GTA VI調査§60](../gta-reality-bridge.md#60-追加調査ゲーム内data-collectionはpurposeとsharing-contextを説明する2026-10-17--securityrq14mat18)は21 online-game data practiceと20 player qualitative interview、609人の未査読privacy questionnaire preprintを確認。Avocado candidateはtask/test recording/mic/audio/room sensor/account link/product analytics/safety log/billing recordを分け、purpose・retention・audience・reuse・delete/export/withdrawalをscope別に提示すること。測定値やtest/publish permissionはplayer telemetryやsensor captureの同意ではない。研究はGTA VI telemetryやAvocado legal basisを示さず、privacy/retention policyは変更していない。

## Pre-purchase terms and post-purchase cancellation states（2026-10-17 / RQ14、SIM/eSIM service bundle）

[GTA VI調査§63](../gta-reality-bridge.md#63-追加調査購入後のcancel条件をdownloadbonus-trial-stateに結びつける2026-10-17--sime-sime-service-access)でPlayStation公式の予約取消/返金を確認。Avocado bundle checkout候補は、その場で見たoffer/version/region/trial duration/renewal/payment/cancel routeをreceiptに保存し、auto activation/downloadが利用停止・返金条件へ与える結果を事前表示する。stop-renewal, immediate termination, promo revocation, refund request/refund settledを別状態にして、provider確認まで返金済みと表示しない。PlayStation条件をAvocado契約/各国法の根拠にはしない。Xbox公式条件は今回未確認。購入・課金・activation、契約・policy変更なし。

[GTA VI調査§65](../gta-reality-bridge.md#65-追加調査同じpreorderでもcharge-timingと失敗recoveryはproviderごとに違う2026-10-17--sime-sime-service-access)でMicrosoft Store公式preorder FAQを追加確認。Avocado candidate ledgerでorder, charge schedule, payment source/backup, retry deadline, authorization, cancel, entitlement, refund request/settlementを分離し、必要な本人操作と結果の証拠を表示する。Microsoftの最大10日前chargeや物理商品限定price guaranteeはprovider限定でAvocadoの約束に転用しない。注文・payment method・billing policy変更なし。

## Creator Platform commercial scopeを先に通す（2026-10-17 / RQ13、RQ14、rights/commercial gate）

[GTA VI調査§69](../gta-reality-bridge.md#69-追加調査rockstarの2026-mod-guidelinesはcreator-platform外のcommercial-moddingを許可しない2026-10-17--rq14rq13commercialip-gate)で、Rockstar 2026 Mod Guidelinesと全文Creator PLA (2026-09-10)、Support references、Cfx Tebex docsを照合。FiveM/RedM commercial eligibility is scoped to authorized Creator Services/Covered Games; GTA VI is not named or confirmed. PLA prohibits cash-out, in-game currency real-money sale, Rockstar Virtual Item sale, third-party-content marketplace aggregation sold for real money, paid chance mechanics, crypto and third-party ads/sponsorship. Rockstar-designated authorized/exclusive providers can change. Preserve free fixture and separate commercial/rights gate. Marketplace-content cannot be re-sold standalone or used for generative-AI training/enhancement (§6.4); do not ingest it into Sky/IP Studio/Patent AI without separate express rights. Marketplace is optional and may stop; content can break and refunds are not guaranteed. Creator technical support vs Rockstar/Operator transaction support, no-endorsement disclaimer/operator contact, and game/resource/license versions are separate evidence states. Do not route sales/Wallet exchange through game-side UI.

## FiveM client/server trust boundaryをGTA bridge schemaへ引き継ぐ（2026-10-17 / RQ14、Security）

[GTA VI調査§70](../gta-reality-bridge.md#70-追加調査fivem-client-eventは非信頼入力game-uiは権限sourceにしない2026-10-17--securityai06rq13-14)はCfx official event security, resource manifest, fullscreen NUI docsを確認。FiveM client events may be forged and client-side state is untrusted. Candidate flow: narrow structured request with job correlation ID → independently authenticated Avocado Broker capability/user/budget check and confirmation → scoped result/status; server validates gameplay role/balance/inventory/position/rate limit/idempotency itself. No secrets, Wallet authority, shell or OS signing keys in NUI. Game success is not proof of external execution/payment. This is FiveM-specific security guidance, not a Rockstar connector authorization; no integration/runtime change.

Cfx Sandbox docs also block most shell/process execution and cross-resource file writes by default, with explicit broad overrides. Avoid a bridge setup that asks users for resource-level shell/process or cross-resource filesystem grants. Keep server-held store/connector secrets out of client code and use narrow server APIs.


[GTA VI調査§71](../gta-reality-bridge.md#71-追加調査creator-plaの任意marketplaceと現行cfx-marketplaceを混同しない2026-10-17--rq14commercial-gate)ではCfx公式docsが現在のCfx MarketplaceとFiveM/RedM release forumsをresource discovery先として挙げ、free/paid resources、dependencies、buyer risk、creator support responsibilityを説明することを確認。Cfx MarketplaceはCreator PLA §6が定義するRockstar/Operator discretionary Marketplace framework内で動く現行FiveM channelと読む（提供義務なし）。§3.1(6)はcovered usersが独立に運営する有料第三者Server Content aggregatorを別途制限しており、現行Cfx channelはAvocado marketplaceの許可ではない。Avocado上ではlink/metadata/hosting/artifact delivery/third-party aggregation/resaleのどれを行うか特定してcommercial/rights gateへ渡す。現行Cfx MarketplaceはGTA VI marketplace/APIやAvocadoの再販売許可を示さない。No marketplace/account/listing/payment/contract changes.


[GTA VI調査§72](../gta-reality-bridge.md#72-追加調査fivem-asset-entitlementversion-retentionenhanced対応を別状態で追う2026-10-17--rq14sdk-service-access)ではCfx Asset Escrowの更新・旧版保持、subscription expiry後の実行停止、transfer非対応、NUI非対応とGTAV Enhancedでのescrow未実装を確認。Avocado SDK/catalog比較ではartifact hash/revision、target runtime/build、dependency、purchase/entitlement、download/install、compatibility、renewal/revoke、recovery/exportを別stateにする。FiveMモデルを契約・失効・配布policyへ転用せず、GTA VI対応の証拠ともしない。No install, payments, permissions or policy change.


[GTA VI調査§73](../gta-reality-bridge.md#73-追加調査creator-plaはmarketplaceの買い切りsubscription-license終了条件を分ける2026-10-17--rq14-service-access-ipcontract-gate)でCreator PLA §6.3のone-time Marketplace license (perpetual/limited in-platform rights)とsubscription license (user cancels or creator stops offering: earlier event terminates license)を区別。§72のCfx escrow実行失効と同一状態にしない。Avocado offer/license candidateはlicensor/scope/term/renewal/end event/artifact retention/runtime authorization/export/support/fallbackを分離する。Perpetual licenseはservice uptime/compatibility guaranteeではなく、Creator PLAはAvocado resale/AI rightsでもない。No offers, contract, payment or policy changes.


[GTA VI調査§74](../gta-reality-bridge.md#74-追加調査サーバーruntimeのeos-warningとeol接続停止は異なる2026-10-17--rq14-sdk-supportrecovery)でCfxのgray EOS (joinable), red EOL (connection fails), outdated-but-functioning/no-support, and >3-month browser exclusionを区別。RQ14 candidateはcompatible/running, recommended, supported-until, warning, launch-blocked, deprecatedをexact runtime revision/time evidenceに結び、fallback/rollback/exportを示す。Cfx scheduleをAvocado policyやGTA VI datesへ転用しない。

[GTA VI調査§75](../gta-reality-bridge.md#75-追加調査resource-discovery-authorized-checkout-seller-approvalは別関門2026-10-17--rq14-creator-commercial-gate)ではCfx Marketplace/forum discovery、authorized/exclusive Tebex monetization、seller identity/store review、package/entitlement、support responsibilityを別statusとして記録。Avocado listing/linkはRockstar approval、seller KYC、authorized checkout、artifact rights/compatibilityの証拠にならない。No accounts, secret, store, marketplace or transaction configured.


[GTA VI調査§76](../gta-reality-bridge.md#76-追加調査cfx-listingのfreeは無条件利用再配布自由を意味しない2026-10-17--rq14-catalogrights)はCfx Marketplaceの一つのcurrent listingを例に、zero priceでもlicensed purchaser/subscriber server entitlement、no redistribution/resale, optional subscription, Game Build 3095 requirement, author support, gift-to-server-owner routeが別に示されることを確認（seller claims are not independently verified; not all listings）。Avocado catalogはprice, license/qualified entity, entitlement, dependency/build, transfer/bundle, rights, support, reportを分ける候補。無料サンプルやlisted stateを無条件の利用許可としない。


[GTA VI調査§77](../gta-reality-bridge.md#77-追加調査fivem-server-checkoutとtebex-creator-resaleは会計契約モデルが違う2026-10-17--rq14rq15wallet)でCfx FiveM server Tebex integration, Tebex Creator Agreement resale (Tebex as reseller/Buyer contracting party; creator Trade Price/report/support/reserve terms) and Tebex Wallet settlement/withdrawal guideを別commerce flowとして照合。Avocado候補はbuyer/seller/merchant/agent, contract party, itemized deduction, accrual/settled/reserve/withdrawable/requested/sent/received, support/refund/tax role, provider terms version/country/currencyを個別記録。Exact fee/timelineはmutableなので転記せず、AvocadoのWallet/creator economicsへ移植しない。No seller, payment, payout or Wallet update.


[GTA VI調査§78](../gta-reality-bridge.md#78-追加調査payment-testmanual-grant-production-entitlementは混ざらない2026-10-17--rq14rq13securityverification)でTebex Store Test Mode (webhook+Sales, no Earnings; private-only due free-test risk)とManual Payment (no webhook/statistics, delivery not undone by deletion, FiveM asset access non-revocable)を区別。Avocado fixturesはtest grant/paid transaction/entitlement/delivery/refund/revokeを分離し、external wallet/game balanceを試験に使わない。

[GTA VI調査§79](../gta-reality-bridge.md#79-追加調査署名付きwebhookも再送取消精算状態を持つ2026-10-17--securityrq13wallet)でTebex webhook endpoint validation, HMAC signature over raw body, 2xx/retry/failure, event idempotency, refund/dispute/recurring cancellation statusを確認。Avocado candidate must authenticate, deduplicate, reconcile, and separate provider event, entitlement/delivery, settlement and payout. A valid webhook is not game/client authority or user approval. No integration/ledger change.


[GTA VI調査§80](../gta-reality-bridge.md#80-追加調査payment-webhookの個人情報をgameclientへ横流ししない2026-10-17--securityprivacyrq13-14)でTebex payment webhook example fields (buyer identity/email/IP/account/country/postal/marketing consent, line item/payment fees)を確認。Avocado candidate should verify/signature and server-side minimize to opaque transaction/status/authorized entitlement, keeping PII out of game NUI, creator collaborators, generic AI, analytics/room output; purchase does not imply marketing consent. Example schema is not all-event guarantee or legal basis. No data or secret collected.


[GTA VI調査§81](../gta-reality-bridge.md#81-追加調査listing停止paid-entitlement-revoke-test-grant-cleanupは別操作2026-10-17--rq14-service-access-recovery)でcurrent Tebex package docs (FiveM/RedM Asset “Remove After” supports one-off/subscription, while disabling package blocks new sales and leaves existing subscription untouched)とtest/manual grant non-revocation warningを照合。Avocado候補はhide/listing off/new-sale block/renewal cancel/current access end/scheduled expiry/refund/dispute/deleteを別action/outcomeとする。Actual issuance pathでrevokeを検証できるまでreversibleと主張しない。No policy/access/transaction change.


[GTA VI調査§82](../gta-reality-bridge.md#82-追加調査cfx-marketplaceの掲載はapproved-partner審査usd価格の状態を持つ2026-10-17--rq14-creator-market)でTebex/Cfx seller doc confirms curated Cfx Marketplace, approved-partner eligibility, Cfx review/review-again after material edit, per-package approval before bundles, creator profile/support/categorization/media/deliverables, USD Marketplace price, no extra listing commission, and fewer restrictions/no regional pricing or customer-targeted discounts. Avocado candidate separates provider eligibility, submit/review/change/approved/listed/re-review/delist from rights/compatibility quality evidence. No rights/price/fee/promotion change.


[GTA VI調査§83](../gta-reality-bridge.md#83-追加調査cfx-resource-manifestが列挙するgame-apiはgta5redmのみ2026-10-17--rq14-integration-capability-gate)でCfx official manifest currently lists `common`, `gta5` and `rdr3`; FiveM requires updated GTAV. Current documented resource/API schema does not list GTA VI, and Rockstar PLA does not confirm it as eligible. Avocado connector candidate should require explicit game/API/build, side, signed terms, permissions, test fixture and recent evidence; unknown title routes to unsupported/unverified instead of generic adapter. This is current-document boundary, not a future prediction; no connector change.


Cfx Marketplace's “no extra listing fee/commission” is not zero cost: Tebex's separate creator fee overview still distinguishes platform, gateway and withdrawal costs by flow/method. Keep marketplace listing fees, per-sale fees, payment processing, taxes and creator settlement separate; do not apply an old public rate to Avocado or a different Tebex path.


[GTA VI調査§84](../gta-reality-bridge.md#84-追加調査fxdkのlocal-buildpreviewはrollbacksecret-packagingplayer-identityに境界がある2026-10-17--rq14-sdksecurity)でFxDK local single-user preview, autorestart/resource monitor, rollback defaults/disable-delete behavior, Windows artifact build/Linux manual deployment, secret/config file boundary, missing player identifiers and manifest-declared build/watch commands/source packagingを確認。Avocado candidate separates local preview from multi-author/production acceptance, audits artifact for secrets/source, pins target runtime and retains rollback; creator commands require isolation/limits, not generic shell Tool. No FxDK run or Avocado runtime change.

FxDK `CV_PASSWORD` only masks the UI value; Cfx further warns secrets should not be information/replicated convars. Candidate product boundary is server-only secret storage, not hidden client-side secret rendering.

[GTA VI調査§85](../gta-reality-bridge.md#85-追加調査gta-viの公式音楽導線とファン動画の非商用範囲を混同しない2026-10-17--rq14iprights-creator-publishing)ではRockstar公式music hubの試聴/アルバム販売導線、Rockstarファン動画の非商用・非宣伝範囲、PlayStation UGC license、Xbox title UGC moderation/capture distinctionを確認。Avocado candidate separates game/platform/source/capture, embedded music rights, commercial/remix/training permission, platform UGC license and report/takedown. Official link-out does not grant hosting or reuse rights; GTA VI feature support remains unconfirmed. No content or rights used.

[GTA VI調査§86](../gta-reality-bridge.md#86-追加調査asset-storeのai開示consentquality-reviewを独立したlisting-fieldsにする2026-10-17--rq14-ip-studio-ai-governance)ではUnity's current Asset Store terms/guidelines AI training consent, AI provenance disclosure, third-party notices, API/key/cost and opt-in analytics disclosure, quality/differentiation reviewを比較。Avocado catalog candidate distinguishes sell/display/remix/training grants, provenance, tool/version, modifications, external service cost, analytics choice and review result. Unity policy is not Rockstar/Avocado policy; no listing schema or AI policy change.

[GTA VI調査§87](../gta-reality-bridge.md#87-追加調査creator-payoutのestimateactualreturneligibilityは別状態2026-10-17--rq14rq15wallet)ではFortnite's current creator dashboard estimate vs actual, eligibility, $100/12-month threshold, ~30-day monthly posting, return deductions, variable V-Bucks/USD conversion and temporary 2026 in-island shareを確認。Avocado candidate keeps estimates, accrual, payable, return/reserve adjustment, threshold carry, withdrawal and settled/received ledger events separate. Rates are mutable platform terms, not Avocado payouts; no ledger or fee change.

[GTA VI調査§88](../gta-reality-bridge.md#88-追加調査fabはlicense-tiersource-formatproject-redistributionを分けて提示2026-10-17--rq14-catalogsdk-ip)ではFab's cross-engine format access and displayed non-binding license summary: project-level commercial use/share, standalone redistribution restriction, Personal/Professional equal summary scope vs Reference-Only source limitation, and provider payout guide. Avocado catalog candidate makes source/runtime package and project-vs-standalone redistribution explicit and links the controlling terms version. No Fab/Avocado asset or agreement changed.

[GTA VI調査§89](../gta-reality-bridge.md#89-追加調査bundle-metadataは権利制限を集約し生成由来を引き継ぐ2026-10-17--rq14-ip-studio-catalog-composition)ではFab bundleのAI permission/provenance/mature/promotional metadata roll-up、AI-flag変更時のbundle unlisting、AI-use update review state、既downloaded source retentionを確認。Avocado candidate aggregates permissions conservatively and provenance as union, identifies restrictive component, and syncs bundle cards/review/history after metadata edits. No bundle or catalog policy change.

[GTA VI調査§90](../gta-reality-bridge.md#90-追加調査rockstar公認のgta-rp協業はgtavの対象partneraccess条件つき2026-10-17--rq14-integration-claims)ではRockstar's NoPixel V support/Launcher beta announcement and NoPixel's own collaboration descriptionを照合。Avocado candidate scopes each partnership/authorized route by exact title/build, API/right, client/launcher, invited cohort, region, beta/production status and evidence date. This is a GTAV-specific announced partner service, not GTA VI support or Avocado connector approval; no access or integration used.

[GTA VI調査§91](../gta-reality-bridge.md#91-追加調査creator-storeの商品名素材宣伝画像にも第三者ブランドの権利証拠が必要2026-10-17--rq14-ip-go-to-market)ではFab publisher guidance on copyrighted/trademark content in both product and marketing plus Rockstar fan policy's no-product-promotion scopeを照合。Avocado candidate records rights evidence per downloadable asset, thumbnail, trailer, listing text and ads, separating factual compatibility metadata from branding/endorsement; provide takedown/report and buyer notice/remedy. No branded material used or marketplace rule changed.

[GTA VI調査§92](../gta-reality-bridge.md#92-追加調査steamはpre-generatedとlive-generated-aiを分け継続費用の選択肢を明示2026-10-17--rq14-ai06-usage-pricing)ではSteamworks Content Survey pre-generated vs live-generated player-facing content, live guardrails, post-release survey change process, and Steam-specific pay-as-you-go/subscription/DLC/base-price pathsを比較。Avocado candidate separates content provenance/type, runtime safety/disclosure and estimated AI cost/cap/checkout path. Steam rules do not define Avocado or Rockstar terms; no model/service/fee change.

[GTA VI調査§93](../gta-reality-bridge.md#93-追加調査workshop-mod-versionとgame-branchを組にしてknown-good-buildを選ぶ2026-10-17--rq14-sdk-recovery)ではSteam Workshop game branchとmod-version rangeのmapping, automatic subscriber updates, private test visibility, old-build rollback, mod/save compatibility risksを確認。Avocado candidate pins tested artifact↔runtime range/dependencies/data migration, staged cohort rollout and rollback pair; author claim differs from verified compatibility. No Steam/Avocado build or save changed.

## Follow-up research 118–127 (2026-10-18)

[GTA VI調査§118–122](../gta-reality-bridge.md#118-追加調査cfx-portalのサーバー情報編集と5タグ制限は段階的な告知2026-10-18--rq14-catalogdiscovery-creator-onboarding) adds current Cfx metadata rollout state; September 2026 Creator PLA scope, asset rights/AI-use boundaries, monetization prohibitions, Cfx operator privacy/admission controls; official Rockstar preorder region and support routing; and GTA+ benefit scope. GTA VI creator API, Avocado authorization and any game-currency exchange remain unestablished. [§126–127](../gta-reality-bridge.md#126-追加調査通報フォームに問題カテゴリと発生した機能面の両方を持たせる2026-10-18--rq14-trustsafety-ugc) adds a GTA Online report taxonomy example and subscription-promo scope/expiry analogy. Research only; no title scope, merchant, fee, Wallet or release status changed.

The §122 purchase lifecycle cross-check also uses Rockstar's official preorder timeline: digital preload and physical-code availability are dated Nov 12, while launch is Nov 19. Keep order/code, preload/install and usable entitlement as distinct statuses; no Avocado service term changed.

The Xbox listing adds a promo-specific restriction: child accounts with age-rated-content limits cannot redeem the one-month GTA+ offer. Keep bonus eligibility by account type/age separate from base-game entitlement; Avocado promo eligibility remains unchanged.

§122 also observes Japan/US PlayStation release timestamps as UTC instants whose converted local dates both show Nov 19. Preserve region, canonical timestamp, time zone and inclusive/exclusive deadline when displaying Avocado service/offer dates; this does not assert a universal game unlock time.

[GTA VI調査§129–130](../gta-reality-bridge.md#129-追加調査評価スコアは購入使用の実在性とmoderationを併記する2026-10-18--rq14-catalog-trust) records PlayStation's verified-owner/moderated review example and read-only comparison with existing Sky registry, Campus Store report contract and eSIM catalog purchase gate. Keep marketplace verification, installation/use outcome and user review distinct, and extend the current workflow only when evidence justifies it. No new rating/review/purchase schema or merchant configured.

[GTA VI調査§132](../gta-reality-bridge.md#132-追加調査公式メディアは素材種別版一括取得単位を分けている2026-10-18--rq14-ai06-evidence-provenance) records Rockstar's public media catalog grouping for trailers, clips, screenshots, edition benefits, artwork and download bundles. Avocado candidate: link evidence to exact provider/build/date and rights, and keep previews, installation/use verification, tutorial, output and eligible exports distinct. A downloadable asset is not a reuse license; no media was copied and no catalog/rights rule changed.

[GTA VI調査§133](../gta-reality-bridge.md#133-追加調査証拠承認成果の連鎖は既存zema-workflowに沿わせる2026-10-18--ai06-rq14-workflow-reuse) cross-checks this candidate against `lib/workflow.ts`: explicit quote/reservation/approval, delegation ID, usage receipt, revision and completion-review constraints already exist; generic arbitrary-media evidence manifest does not. Preserve the existing job contract and fixture equivalence if a concrete evidence-attachment need is approved. This identifies a gap without changing the schema or approving a new requirement.

[GTA VI調査§136](../gta-reality-bridge.md#136-追加調査offline-playの商品表示は全feature-license-checkのoffline保証ではない2026-10-18--ai06-sim-e-sim-catalog-trust) compares PS Store's offline-play flag with Rockstar's per-feature internet/account caveat and the similar Xbox legal note. Reuse Tool-level connectivity while clearly separating local execution, activation, provider calls, sync and remote Agent dependencies; an offline flag does not assert that every feature works offline. Current terms may change; no Avocado connectivity claim altered.

[GTA VI調査§138](../gta-reality-bridge.md#138-追加調査remote-play-platform-cloud-save-cross-platform-portabilityは別の能力2026-10-18--rq12-sim-e-sim-state-continuity) separates PS5 Remote Play from Xbox cloud saves and notes that the current listings do not establish cross-console migration or portable export. For Avocado, label remote access, cloud sync, cross-device state, export and cross-platform migration distinctly; keep save ownership/recovery evidence separate. No Avocado persistence behavior changed.

The same PlayStation listing's primary-PS5 vs. another-PS5 same-account access description is an analogy for explicitly showing device binding versus session identity; an installed client is not proof of active entitlement on the present device.

[GTA VI調査§141](../gta-reality-bridge.md#141-追加調査gta-vi公式ミュージックハブのpreviewは選定例であり完全な曲目表ではない2026-10-18--rq14-catalog-completeness-provenance) confirms Rockstar labels six station cards as hand-picked previews while separately presenting the 34-track album and selected external singles. Avocado marketplace candidate: label partial samples vs complete inventory and tested run; bind samples to package/version/source/destination/rights. This is catalog evidence only; no GTA VI audio or rights changed.

[GTA VI調査§144](../gta-reality-bridge.md#144-追加調査remote-playはconsole-stream-cloud-saveはstate-roamingで別の条件を持つ2026-10-18--rq12-sim-e-sim-continuity) adds first-party path conditions: Sony Remote Play streams from an enabled PS console and needs its account/network, while Microsoft's Oct. 13 XR-052 governs user-associated Xbox save roaming within defined TitleID/platform scope. Avocado candidate: label local/native, remote console stream, hosted cloud execution and hybrid separately from save sync and export; state source device/account/network and recovery. No device, save, sync or contract changed.

Microsoft's Xbox Game Saves sync flow further describes active-device checks, local-only offline changes, and a user prompt when both local and cloud data changed. Avocado continuity candidate: preserve the existing job revision check on resume, identify pending local work, require explicit conflict choice when changes diverge, and keep a recoverable prior revision; never silently overwrite. Xbox title guidance does not describe GTA VI save behavior or authorize Avocado sync design changes.

Xbox's documented save-lock handoff is destructive to the interrupted session's unsynced data; its local-vs-cloud conflict dialog states which copy overwrites the other. Avocado candidate: explain exactly which running job/session or revision becomes stale before takeover, and which side will be discarded before resolution. This is a safety analogy, not an instruction to apply Xbox behavior or transfer game saves.

[GTA VI調査§152](../gta-reality-bridge.md#152-追加調査ゲーム予約の詐欺はtransaction-intentと永続permissionを混同させる2026-10-18--security-rq15-wallet-consent) compares a real GTA VI lure to wallet permission concepts. If future separately approved Wallet work uses a signing/allowance flow, the review should show the recipient, asset, amount and duration/remaining authority before consent and a recovery route for revocation; display that completed transfers are not reversed. This is a design candidate only: no GTA VI, external game or crypto transaction was used.


[GTA VI調査§158](../gta-reality-bridge.md#158-追加調査公式creator-platform支援第三者rp運営gta-vi対応は別のclaim-2026-10-18-rq14-creator-ecosystem-trustsupport) confirms Rockstar's announced NoPixel V collaboration is explicitly a GTAV RP project and that the Creator Platform license does not establish GTA VI support. If evaluating any future author/community integration, separately prove title/platform coverage, creator authorization, endorsement wording, content rights, monetization permission, support owner and continuity; do not imply a game API or marketplace from a press announcement. No game connection, content marketplace or Wallet use changed.

[GTA VI調査§157](../gta-reality-bridge.md#157-追加調査refund-eventとentitlement失効は同じ状態遷移ではない-2026-10-18-sim-e-sim-rq15-ledger-reconciliation) adds the Xbox GDK event taxonomy as a platform-specific example: refund, return, revocation and chargeback reversal can have different entitlement effects. Any separately authorized game-adjacent payment integration must match events to the proper order/product, reconcile idempotently and apply Avocado's own approved contractual policy; do not map a generic `refunded` label directly to game-currency or access revocation. No integration, event queue, Wallet entry or production exchange changed.


[GTA VI調査§160](../gta-reality-bridge.md#160-追加調査cfxはサーバー検索用metadataをportalへ移しタグを5個に制限予定-2026-10-18-rq14-catalog-migrationdiscovery) records an announced Oct. 21 change for **FiveM/RedM only**: server listing name, description, language, imagery and up-to-five search tags move from config files to Portal; missing backfill becomes a visible setup warning. Avocado candidate: preserve migration provenance, mark owner-action fields, distinguish controlled search taxonomy from free text and linked community contact from official support, and preview incomplete/public states. The announced effective date is future to this checkpoint; no Rockstar/Cfx server or Avocado catalog was changed.


[GTA VI調査§161](../gta-reality-bridge.md#161-追加調査cfx-marketplaceでverified-creatorと個々のresourcecompatibilityを別に表示-2026-10-18-rq14-marketplace-trustcreator-onboarding) records the live Cfx marketplace profile/detail metadata as an **adjacent FiveM/RedM-only ecosystem**: platform/framework, dependencies, optional integrations, source availability, purchase type, seller support/report routes, creator badge and download count. An opened seller listing advertises an in-world computer OS with multiple apps and an app API, but it is creator-authored marketing, not an independently accepted Rockstar or GTA VI feature. Avocado candidate: separate verified creator identity from tested asset compatibility/safety/rights and count from review/quality; investigate extensible in-world software demand only as a hypothesis. No asset, integration or game-currency marketplace adopted.


[GTA VI調査§162](../gta-reality-bridge.md#162-追加調査fivemのseller-listingはlive-auctionplayer-ownershipphone-tabletをつなぐがgta-vi機能証拠ではない-2026-10-18-rq14-rq13-boundary-workflow-analogy) records third-party FiveM listing claims for item ownership/provenance, condition, offers, live auctions, phone/tablet views and verified-purchase reviews. It is an in-game marketplace resource, not GTA VI or real-money game-asset transfer evidence; the Cfx/Creator PLA restrictions remain separate. Avocado can reuse its existing workflow/Wallet contracts for any future approved quote/settlement/dispute states; no game exchange or product schema changed.

[GTA VI調査§164](../gta-reality-bridge.md#164-追加調査公式mission-creatorの学習試作推薦執行は独立した段階-2026-10-18-rq14-creator-lifecycle) distinguishes player-made/published Jobs and Rockstar editorially featured Community Missions in GTA Online. This is a creator discovery/curation model analogy, not permission to sell GTA VI content or exchange game currency. No market, ranking, payout or asset-transfer rule changed.

[GTA VI調査§166](../gta-reality-bridge.md#166-追加調査購入者レビュー不正通報返金サポートは別の窓口と証拠-2026-10-18-rq14-trustsupport) treats PlayStation's US policy as a buyer-reputation analogy: acquisition-backed rating eligibility and one review per product/account coexist with separate reports and seller/provider technical/refund support. It supplies no Avocado verified-use, financial review incentive, seller payout or case policy.

[GTA VI調査§188](../gta-reality-bridge.md#188-追加調査ugc公開方式と審査済みrevisionを別状態にする-2026-10-18-rq14-catalog-governance) compares Steam Workshop's opt-in curated versus ready-to-use distribution and revision-guarded review. For existing RQ14 workflow only, verify submitted, reviewed, published and changed-after-review revisions remain distinct and rollback/withdrawal/appeal do not collapse into ratings; reuse `lib/workflow.ts` and existing fixtures before proposing changes. This is a Steam comparison, not GTA VI support or evidence for adding a moderation schema. No catalog behavior or integration changed.

[GTA VI調査§189](../gta-reality-bridge.md#189-追加調査公式音楽ハブはgame-radio-preview-standalone-single-album商品を分けて案内-2026-10-18-rq14-catalog-rights-provenance) uses Rockstar's own music hub only as an example of keeping in-game-radio previews, a trailer single, a standalone album and forthcoming score information distinct. Existing Avocado media/rights review should keep promo mention, sample/playback, asset type, license, territory/term and offer separate. This grants no Avocado use of the music; no catalog item or asset was added.
