# Game / Market / Fund

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


### MacのAgent仕事（2026-10-15、AI06 / ROCK）

利用者の「繋げるやつ全部となければ作成」により、対象名の回答待ちを解除。既存compositionの利用可能5 ToolをローカルAgentとして一覧化し、本人が最大6手順のAgentを作成できる。LLM推論ではない。ゲームNUIで目的・素材を依頼し、現実側で内容を承認して実処理、同じ仕事IDの最大10版を継続、成果を明示共有、検収/停止する。既存workflow契約・revision・操作IDを維持しSQLiteへ保存。ゲーム側には現実側の原稿・設定・過去版を出さず、共有した成果だけ戻す。最大100仕事/20 custom Agent、素材UTF-8 8000バイト、停止/失敗を成功に昇格しない。失敗時は設定済みAgentまたは次の版で修正する。無料記事Toolは標準設定だけでは実行できず、詳細設定が必要。

Sky外部AgentはROCK_BRIDGE_SKY_ORIGIN（HTTPS origin）とROCK_BRIDGE_SKY_TOKEN（既存本人session）の明示設定で登録一覧を取得するread-only connector。資格情報はgateway内のみ。未設定・認証失敗は未接続表示、登録済みを実行可能にしない。外部実行は既存見積/予算/Broker/delegation/usage経路の接続と受入が未完了。GTA VI、実FiveM、本番Zema、通貨交換、skin販売の成功ではない。

合格証拠: tests/fivem-bridge.test.mjs 11/11＋旧launcher 2/2、Mac UIで仕事cd237d92-84cb-4c33-a334-875fcf2d3bcdの出典整理→同ID第2版→明示共有→completedとcustom Agent作成。次は外部接続の本人環境・許可済み予算を設定して別受入する。


### FivePlay公開システム解析とadapter（2026-10-15、AI06）

利用者が指定したFivePlay軽量URLを解析。build 8b0b5899edはWASM/WebGPU、GPU/IO worker、IndexedDB userdata、COOP/COEPのWeb版。FiveMやGTA VI公式APIと混同しない。Mac IABで6%→No progress表示、world未到達。ロード表示はタイマーで6ポイントまで進むため起動成功証拠ではない。原因は未確定。

ゲームメモリや通貨を変更する入口は確認できず、公開コードから連携に使えるのは起動設定と画面上の診断。本人入力の仕事端末をChrome拡張として重ね、専用localhost:5217 gatewayにagent_requestを送り、同じworkflowで現実側の実行・継続・共有を扱う。目的/素材/Agentが入力、仕事要約/明示共有成果が出力。専用SQLiteとsession token、1時間失効、同ID再照会、原稿非公開、外部実行なし。拡張実導入は未受入。詳細・失敗/復旧・権限・受入手順はtoolkits/fiveplay-adapter/README.md。14/14対象試験＋lint合格。次は利用者確認後の拡張導入と同site UI往復、ゲームengine起動は提供者側の問題として独立して切り分ける。


## Mini単体のWebゲーム設計（2026-10-15）

利用者の追加指示により、主担当MAT15/JOINT、Game AI06連携として[R5ゲーム実行設計](../avocado-mini-r5/game-runtime-design.md)を追加。1本自律・200mm以内・別Edge Hub不要を維持し、WASM/WebGPU、GPU driver、メモリ比較、電源/熱、OS/game focus、同一仕事IDの継続、原稿非公開、失敗/復旧、MG01〜07の合格条件を定義。Chrome拡張はMac参照adapterで、Mini本番はOS操作面/Brokerへ移植する。Mini実装・実機・FivePlay起動・裸眼表示・製造の合格ではない。原本packageは不変。
