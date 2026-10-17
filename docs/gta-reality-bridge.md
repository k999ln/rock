# RockstarOS — 現実とGTAをつなぐ出力仕様

更新: 2026-10-15。状態: Mac向けhost bridgeとFiveM resource候補を実装。実ゲーム受入・提携・本番接続は未確認。

## 1. 目的と確定指示

利用者の明示指示は「gtaでも出力できる仕様にしたい、リアルとgtaをつなげる橋渡しである」。RockstarOSで扱う作品、仕事、Agentの結果を、現実のアプリ・サービスとGTA内の体験へ届け、結果を同じプロジェクトへ戻せることを製品要件とする。GTAを起動・映像表示するだけの機能とは別に、ゲーム内への意味のある出力を扱う。

RQ01・RQ04の共通runtime、RQ14の作者API/SDK、RQ48のIP Studioを具体化する。RQ13の通貨交換は独立した既存gateを維持する。SIM/eSIM、Web/app/native、Sky/Zema、Pixel/QEMUの製品方針を置き換えない。GTAの具体的なタイトル・版・接続環境、最初の出力内容は未指定。以下の最初のデモとFiveM採用は実装候補で、利用者の確定選択として扱わない。

## 2. 利用体験

Zemaで依頼 → IP Studioで作品・設定を用意 → 出力先と見える相手を選択 → 変換・プレビュー → 本人承認 → Sky adapterが配送 → 現実側／GTA側の結果を別々に確認 → Zemaへ保存・修正・再出力する。

| 方向 | 目指す体験 | 完了として確認するもの |
| --- | --- | --- |
| 現実からGTA | 自作の作品をゲーム内パネルへ表示し、対応する服・物・空間は対象形式へ変換して導入する | 対象server・player・版・hash、表示または配置のreadback |
| 共通Agentから両方へ | 同じキャラクター設定を現実の会話UIとGTA内NPCに展開する | 共有を許可した設定の版、各側の会話結果と許可したゲーム内動作 |
| GTAから現実 | ゲーム内で作った依頼・作品・出来事をZemaの下書きや成果へ戻す | 入力元と同意に結び付く成果保存。外部送信・実行は新しい承認 |

ゲーム内イベントから実サービスへの依頼を提案できる。本人の新しい操作または対象と上限を固定した有効な事前承認がある場合だけ、そのサービスの既存workflowで実行する。ゲームのクリック、NPCの発話、ゲーム内契約を現実の支払い・発注・メッセージ送信への承認へ変換しない。

UIでは「未接続」「変換待ち」「承認待ち」「送信済み・反映未確認」「ゲーム内反映確認」「結果不明」を対象別に示す。NUI上の画像表示を3D配置済み、NPCの表示をAI稼働済みと表示しない。

## 3. 再利用と責任分担

主担当はGame / Market / Fundの`ROCK`、既存task `AI06`。非金融の最初の接続をGX01やFund完成の依存にしない。

| 担当 | 責任 |
| --- | --- |
| ROCK | Zemaのowner別job・revision、IP StudioのAsset lineage、Sky capability選択、Brokerの認可、配送journal、停止・照合・保存 |
| EXTERNAL | Rockstar/Cfxの利用可能interfaceと条件、ゲームserver・client、必要な生成・変換Provider |
| JOINT | 固定したGTA版・FiveM artifact・resource版・server・playerで表示／動作／停止／復旧を受入 |
| OWNER | 利用ゲームとserver、共有内容、権利、外部送信、費用上限、現実側での実行を選択・承認 |

`lib/workflow.ts`の`WorkJob`と`createWorkJob`／`applyWorkCommand`／revision判定を親契約として保持する。bridgeの配送状態は子記録として追加する設計であり、親の`active/review/completed/cancelled`を別状態機械へ置き換えない。現行の汎用`record`成功だけではGTAの外部作用を証明できないため、実装時はサーバー検証済みreceiptへの結合と完了gateを追加する。

既存`systems/rock-star-os/os/game_exchange/reference_sdk.py`は合成交換用である。接続journal、owner/player分離、照合パターンを参照し、交換APIやWallet資格情報を非金融出力へ流用しない。`lib/game-sandbox.ts`の2D fixtureは比較用で、GTA互換実装ではない。

## 4. GTA接続先と最初の実装候補

初期候補は、本人または協力者が管理権限を持つFiveM serverの開発resource。FiveMのNUI、client/server event、resource manifestを利用する。PCのGTAと対応client／server上でゲームを動かし、Pixel等はRockstarOSの操作端末にできる構成を検討する。Pixel単体でGTAが動く前提を置かない。

接続profileはタイトル、ゲームbuild/edition、OS、FiveM client/server artifact、resource版、server ID、playerの認証方式、提供capability、権利条件、停止方法を固定する。GTA Online、GTA VI、家庭用機等はそれぞれ接続口と許可範囲の確認待ちで、FiveMの成功を転用しない。

最初のデモ候補は「自作の短い紹介カードをRockstarOSで保存し、選んだplayerのゲーム内NUIへ表示。playerの確認をZemaのreviewへ返す」。接続・表示・返却を同一artifactで示し、その次に自作Assetの3D導入、NPCの会話・有限動作へ進む。NUIは第一段階であり、服・物・空間への出力の最終代替ではない。

ゲーム内NUI/clientは非信頼入力。秘密鍵・Cloud API key・owner Bearerを埋め込まない。FiveM server resourceとRock側gateway間だけに用途限定の短命認証を持たせる。gatewayの公開・server導入は未実施。

## 5. 入出力・識別子・上限

以下はRock側で新設するadapter契約案で、Rockstar/Cfxが提供するAPI名ではない。

| capability案 | 入力 | 出力・権限 |
| --- | --- | --- |
| `game.output.preview` | 既存Asset参照、固定profile、対象player | 変換差分、不足条件、費用見積。外部配送なし |
| `game.output.deliver` | 承認済みartifact hash・版・target | 配送ID、server適用状態、表示観測。対象ごとの書込み承認 |
| `game.output.reconcile` | 配送IDと元binding | 同じ配送の状態照会。新規配送権限を含まない |
| `game.event.import` | 許可したevent型とschema、server/player証明 | Zemaの下書き・review項目。実サービス実行権限を含まない |
| `game.agent.act` | 許可済みNPC、行為・範囲・期限・回数 | 有限動作の結果。modelは候補だけを返す |

親job ID、owner由来のproject ID、Asset ID/revision/hash、adapter ID/version、profile digest、server ID、認証済みplayer binding revision、capability、可視範囲、operation ID、期限、承認digestを配送に結ぶ。ownerは認証session、playerはserver側の認証済み接続と本人のlink承認から導出し、表示名・client申告だけで決めない。接続は特定resource・player・scope・期限へ制限する。

共通Assetから現実向け／GTA向けに別renditionを生成し、それぞれhash・変換器版・利用権・変換で失われる情報を記録する。任意画像からそのまま3D服や衝突付き建物になるとは扱わず、形式・LOD・collision・性能・権利の検査をcapability別に行う。

初期カードfixtureの候補上限: UTF-8本文4KiB、構造化metadata16KiB、任意HTML/JS禁止、plain text表示。同じowner/playerに有効配送1件、承認有効期間5分以内、結果待ち30秒で未確定へ移す。数値は実測で調整し、最終profileと承認digestへ含める。画像・3D・音声の上限は別profileを決めるまで無効とする。LLM生成scriptや任意shell/root、任意native名の実行を共通APIにしない。

## 6. 状態・失敗・重複防止

配送の候補状態は`draft → validated → awaiting_approval → authorized → dispatched → applied → observed`。拒否は`rejected`、送信前取消は`cancelled`、送信後timeout・切断は`uncertain`。`observed`は同一hashを表示したclientの観測であり、現実の仕事完了や本人の法的同意を意味しない。server適用、client表示、利用者reviewを別記録にする。

同一operation IDと同一bindingの再要求には以前の状態を返し、payload違いは競合拒否する。serverは適用前にdurable journalへ記録し、表示には配送IDを固定する。適用とjournal確定の間に停止しても、同IDの表示／entityを照会して復旧する。応答が失われたからといって別IDを発行しない。

部分成功は出力先ごとに残す。一方の失敗で他方へ自動転載しない。ゲームから戻るeventにはorigin、event ID、causation ID、hop数を付け、同一eventの再処理と現実↔ゲームの無限反射を拒否する。clientの成功申告だけで親jobを完了にせず、server binding照合と本人reviewを必要とする。

## 7. 保存・削除・復旧

既存のowner別job/Asset保管を正本とする。新しいDB全体やWallet台帳を作り直さない。実装時に配送binding、状態event、receipt参照、player link失効、既知の重複IDを追加migrationで管理する。GTAのセーブと現実の業務データは別の保存領域とし、ゲームへ全記憶や業務資料を同期しない。

共有は選択Assetと承認された短い文脈だけ。本文はGit・通常診断ログへ保存せず、resourceキャッシュは初期候補で24時間以内、解除／削除要求で回収する。監査metadataと重複防止記録の保存期間・backupからの削除反映は配備前に明示し、未決のまま外部サービスを開始しない。削除のreadbackがない外部copyは「削除未確認」と表示する。

再起動後は同じjob/operation IDで照会する。通信断では新規の外部作用とNPC命令を停止し、古い移動・発話・送信を再接続時に再生しない。adapter更新時は版とcapabilityを再交渉し、承認を引き継げない差分は再承認。rollbackは旧resourceと対応schemaを検査し、既に現実へ実行した作用がゲームの巻戻しで取消されると扱わない。

## 8. 承認・安全・費用

公開範囲、server/player、Asset hash、操作範囲、外部送信先、保存期限、費用上限を承認画面に出す。内容・権利・対象・版の変更は承認を無効にする。server運営者の導入承認とplayer本人の個別連携・共有承認を分ける。共有画面に他playerの私有成果を出さない。

model出力、NPCの会話、ゲーム内テキストを非信頼データとして扱う。Brokerの本人性・権限・費用判定を変更できない。現実側の送信・公開・購入・機器操作にはそのcapabilityの既存承認を使う。停止は送信前なら取消し、送信後は新規実行を止めて照会・回収可否を表示する。

Cloud Agentの単価、見積、予約、上限、itemized usageは既存契約を再利用し、ゲームから無制限にLLMを呼び出さない。第一デモは決定的なカード変換で成立させ、有料modelの呼出しを必須にしない。通貨・ポイント・実資金交換はこのbridgeで有効化せず、RQ13/GX02でタイトル・方向・rate・権利と両台帳を別に受入する。GTA指定を既存`gameExchange.game`の確定へ転用しない。

## 9. 合格条件と証拠

| 段階 | 合格条件 | 証拠 |
| --- | --- | --- |
| 文書 | 正本・設計索引・workstream・進捗整合。設計と実装を区別 | `npm run project:update`、`npm run design:check`、`npm run baseline:check`、`npm run verify` |
| host fixture | 同一Assetから対象別出力、別owner/player拒否、期限切れ、版変更、重複、改ざん、loop、timeout、再起動・照会、取消競合 | host実装・契約試験は§13を参照。実ゲームの合格ではない |
| 実FiveM | 固定server/resource/client上でカード表示→確認→Zema保存、同一hash/readback。2 owner/playerの分離、切断・再接続・停止も実施 | 同一source・artifact hash、server/client版、操作記録・receipt、対象別結果。未実行 |
| 3D／NPC | Asset導入と有限動作を別に検証。性能・取消・保存・model実推論を個別確認 | 各profileの追加受入。NUI合格を流用しない |
| 現実側／公開 | 指定サービスへのscope承認、上限、実送信・取消・結果照会、適用条件と共有範囲の確認 | Provider sandbox／限定実利用／本番を区別。未実行 |

現実→GTA→Zemaの一周を同一job・artifactで示せる時に「橋渡しデモ成功」とする。hostの画面や合成receiptだけで「GTA対応済み」「Rockstar公認」「提携済み」と表示しない。

## 10. 未決定事項と次の順序

1. ROCK: 最新mainと既存dirty作業・引継ぎを同期した候補を用意する。現在のrootは先行変更を含み、GitHub mainと同一sourceではない。
2. OWNERとROCK: 最初の出力を選ぶ。未指定時の候補はカードの一周。GTA版・PC環境・FiveM serverの管理者と導入権限を確認する。
3. ROCK: 非金融adapterの閉じたschema、journal、認証済みplayer link、workflowのreceipt gateと契約試験を実装する。最初はhost fixtureで進められる。
4. JOINT: 公開仕様・適用条件を確認して限定FiveM環境を受入する。実行できる接続口がなければ候補のまま保持し、公開済みとしない。
5. OWNERとROCK: 3D／NPC／現実サービスの優先順、Asset権利、費用、保存・削除条件を決め、対象別の受入を追加する。

Rockstarへの紹介では「GTAを遊んで育った開発者が、現実とゲーム世界をつなぐRockstarOSを開発しており、接続可能な範囲を相談したい」と説明できる。bridgeは設計段階であることを明示し、接続成功・提携合意を作らない。

## 11. 一次資料と確認範囲

2026-10-09に以下の公式公開資料を確認。Cfxの技術機能が存在することと、本製品の全用途が許諾・実装・検証済みであることを分ける。

- [Cfx Fullscreen NUI](https://docs.fivem.net/docs/scripting-manual/nui-development/full-screen-nui/): resourceのUIとしてHTML画面をゲーム上へ重ね、messageとfocusを扱う技術根拠。
- [Cfx NUI Callbacks](https://docs.fivem.net/docs/scripting-manual/nui-development/nui-callbacks/): JSON入出力とcallback応答の技術根拠。外部サービスの認可機構ではない。
- [Cfx Secure Your Events](https://docs.fivem.net/docs/developers/server-security/): server側検査を含むevent設計の入口。
- [RockstarのMod方針案内](https://support.rockstargames.com/articles/5NVOAYjcTomO8v6SX2k76k/pc-single-player-mods): 現行Terms・Creator Platform License Agreement・Mod Guidelinesへの公式入口。配備用途ごとの条件確認は残る。

全体契約は[Sky MCP](sky-mcp-architecture.md)、[全Tool設計](sky-tools-complete-design.md)、[Game workstream](workstreams/08-game-market-fund.md)、[既存Game API](game-api-contract-draft.md)、[LLM境界](llm-evaluation-architecture.md)へ接続する。

## 12. Webゲームの起動とZemaへの手動引継ぎ（2026-10-15）

履歴: この入口は利用者の意図訂正により§13の世界境界試作へ置換。以下は以前の試験の記録。

利用者はMini／Pro端末で指定Webゲームを遊び、RockstarOSとも連動させるよう指示した。実機は未所有と回答し、開発Macで先行検証する。FiveM固有の実装とは別に、`/game`に固定外部URLの起動と手動試験メモの引継ぎを実装する。ROCKは入口・入力上限・下書き、EXTERNALはゲーム本体・ブラウザ要件・保存、JOINTは将来のAPI連動・実機受入を担当する。

利用者は標準または軽量（low=1、1280x720、fps=30）を選んで別タブを開く。これらは対象siteの公開HTMLにある設定で、実測fps・互換性保証ではない。外部URLはfiveplay.lolに固定し、noopener/noreferrerで開く。秘密・job ID・メモをURLへ付与せず、外部script・セーブをOSへ取り込まない。

メモは1〜1200文字。既存home-intentの同一タブsessionStorage・10分・一回消費契約で`/chat`の下書きへ渡す。Zema以降の仕事は既存workflowと認証・revisionを利用し、この画面ではjob作成・実行・完了を行わない。手動記録をゲーム由来receiptや実機合格へ昇格させない。保存前の再読込ではメモを失う。storage失敗は入力を保持してエラー表示、コピーで復旧できる。ゲームの停止は外部タブを閉じ、ゲーム保存は外部site側の責任とする。

状態は設定選択→外部タブ起動／手動メモ→Zema下書き。ゲーム内状態・セーブ・得点の自動同期は未接続として固定表示。正式な接続口、相手origin・schema・認証・player bindingを確認するまで自動同期を追加しない。合格条件は固定URL、内容非送信、下書き期限・一回性、画面からの引継ぎ。ゲーム起動・移動・音声・保存/再開・30分性能とMini／Pro実機は別試験。

再試験ではMacの内蔵browserとChromeでも6%表示のままプレイ未到達。公開HTML上、待機表示は直前進捗より最大6ポイントまで自動増加するため、6%をengine読込み成功と判断しない。game.wasm HEADはHTTP200／63,201,802 bytes、Chrome consoleでGPU worker script loadedとloader starting engineを観測したが、原因確定・ゲーム修復には至っていない。

## 13. FiveM選択とMac先行の世界境界bridge（2026-10-15）

最新の明示指示によりFiveMを最初の接続対象に選ぶ。利用者は「外とゲームの世界がRockstarOSでつながる形」を求め、Macで検証できるところから実装するよう指示した。§1/4のFiveM未選択という記載は当時の履歴であり、現在は選択済み。ただし具体的なWindows機・server/client artifact・playerは未指定。以前の§12の起動リンク／手動メモはこの要求を満たさないため、`/game`を世界境界試作の入口へ変更した。

実装は `toolkits/fivem-bridge/`。Mac側の現実画面と同一NUIの試験画面を同じloopback gatewayにつなぐ。目的は自作plain-textカードの共有→同一hashの確認→現実側検収、逆方向の依頼下書きを一本の保存履歴で追跡すること。実GTA映像、3D/NPC、現実の外部実行、Cloud Agentは含まない。ROCKがgateway・schema・保存・UI・resource候補、EXTERNALがFiveM/GTA engine、JOINTが実playerと実ゲームでの受入、OWNERがserver・共有対象・導入を担う。

親は既存createWorkJob/composition本文検査/updateComposedWork/applyWorkCommandの状態遷移を使う。hostでは試験専用SQLiteにWorkJobとカード配送子記録を保存し、本番D1を改変しない。draftでは仕事を実行しない。本人のpublishで本文検査がreviewとなるが、bridgeのcomplete endpointは同一binding/hashのreceiptと現実側操作があるまで親completedを拒否する。gameはdraft/observeだけ許可する。receiptは描画証明ではなくplayer申告。host_fixture_confirmationを本番・実機・実ゲームへ昇格させない。

入力は4096 bytesのplain text、閉じたaction/schema、operation UUID、状態revision、固定binding。カード内容は承認後immutable、hashにはID・本文・接続条件・期限を含む。送信期限5分、同時送信待ち1件。保存済み同ID同payloadは再照会、内容違い／別player／期限切れ／旧revisionは拒否する。ゲームからの下書きは自動反射せず現実側の新しい承認を要する。100カード/1000操作が上限。未知command・HTML実行・金融capabilityは存在しない。

Mac fixtureは開発者1人向けloopback＋HttpOnly SameSite cookie＋Origin/Host検査。実resource候補はserver-only token、実network sourceから得たlicense、gateway側の固定player hashを照合する。tokenはNUI/clientへ配布しない。候補linkは1時間で失効し、切断・timeout時は新規共有を停止。同じIDで再照会し、停止済み／期限切れカードを再接続時に再生しない。source IDの再利用には応答前のlicense再照合を行う。公開認証・複数ownerのUI・本番Broker/Asset統合は未受入。

SQLite WAL/full synchronousでコマンド単位に保存する。再起動後は同一DB/ID/hashを照会、期限は延長しない。接続profile変更は旧DBの継続を拒否し、旧DBを保全して新しい保存先を使う。本文と監査は試験DBに保持し自動削除しない。停止後の相手一覧除去は次の照会時点であり、既読copy回収ではない。削除・起動・復旧手順、FiveM用設定、未決条件は[toolkit README](../toolkits/fivem-bridge/README.md)を参照。

受入: 同一NUIのbrowser往復、ゲーム下書きから本人承認、期限／改ざん／別owner/player／重複／停止拒否、保存再読込み、serverのmock runtimeから実HTTP gatewayへの通信をhostで試験する。実FiveMは版固定・2player・画面確認・focus・通信断・resource/gateway再起動を別gateで試験し、その証拠が揃うまで実ゲーム対応と表示しない。GTA VIは接続仕様の確認待ち。

## 14. ゲーム内のSky Agent依頼とクリエイター収益化（2026-10-15、追加指示）

利用者はカードの往復に留めず、ゲーム内からSky Agentへ仕事を依頼し、現実側で同じ仕事を続けることを要求した。さらにGTA VIでのゲーム内通貨の変更／交換と、Higgsfield等の外部生成物をskinとして持ち込みmarketで稼ぐ構想を提示した。通貨の変更・購入・交換・換金のどれを指すか、方向・rate・対象は未確定。これは制作から収益管理への製品要求であり、外部残高操作・実資金取引・公開market・規約同意を実行したという記録ではない。

利用者は接続済みSky Agentを使う方針を選択したが、Agent名／画面URLは未回答。ローカルの決定的Toolや合成AgentをそのAgentの実行成功へ置き換えない。現行bridgeのcard draftはAgent jobではなく、今回の追加指示に対するruntime実装は未完了。

再利用する実装入口: `app/api/sky/a2a-agents/route.ts` の本人別directory、`app/api/work-jobs/route.ts` のcloud-agent親job、`app/api/sky/a2a-delegations/route.ts` の委任、見積／Broker authorization／利用receipt／成果保存。現在のcloud-agentは署名見積のあるbriefと保存成果・usage receiptのあるresultを照合し、ゲーム内クリックだけでは実行承認にしない。接続profileには認証済みowner、server/player binding、選択Agent ID/版、親job IDを結び、再送時は同一IDで照会する。本番identityをMacの固定開発ownerへ代用しない。

目標の一周: ゲーム内で制作依頼→Skyの接続済みAgent選択→見積/上限/実行対象を本人承認→Zemaの同一jobに委任と成果保存→Macでrevisionを追加して続きを依頼→制作物を対象ゲーム形式へ変換・検査→承認済みAssetだけをゲームへ導入→許可された販売先への出品準備→実売上のreceiptが得られた場合だけ既存Wallet/会計で記録。ゲームへの導入、販売、入金を別状態にし、生成完了を販売可能・利益発生へ昇格させない。

2026-10-15の一次資料確認:

- [Higgsfield Wan 3.0 API](https://open.higgsfield.ai/models/alibaba/wan-3.0/reference-to-video/api-reference)は動画生成の入口。動画をそのままゲーム用skinと扱わず、ゲーム形式、mesh/texture、UV、rig、LOD等の必要条件を対象別に決める。3D Jutsuの公開入口は存在するが、この調査ではGTA VI向けexport/rig仕様は確認できていない。
- [Higgsfieldの商用利用案内](https://higgsfield.ai/creator-hub/help-center/account/who-owns-my-generations-and-can-i-use-them-commercially)は出力の商用利用を認める一方、第三者権利は利用者の責任としている。これをGTAの導入・販売許可へ転用しない。生成・API利用はプランcredit／費用が別途かかり、今回は未実行。
- [Cfx Marketplace公式発表](https://forum.cfx.re/t/introducing-the-cfx-marketplace/5369289)はFiveM/RedMのprops/scripts/maps等を販売する審査・段階展開の経路を示す。誰でも自動出品可能、GTA VI対応、当方の販売権取得済みとはしない。
- [Creator PLA 2026-01-12 §3.1](https://static.cfx.re/platform-license-agreement-12-jan-2026.pdf)は、実金によるゲーム内通貨販売、入金後に実金等を他利用者へ受取/交換/移転するCash Out構造、第三者のServer Contentを集約してServer Adminへ実金販売するmarket等を禁止対象とする。別の明示書面契約の例外はあるが、当方の契約は未確認。GTA VIの通貨・UGC・販売APIの提供は確認できていない。

次の順序: 対象Agent名/接続画面と本人認証環境の特定→既存の親job/委任を使うゲーム入力・Mac継続・結果照会の実装とhost契約試験→明示予算の範囲で接続済みAgent実行を受入→権利確認済みの自作Asset1点の形式変換・実FiveM導入→許可された販売経路の出品準備。GTA VI/通貨交換/独自marketは提供者仕様と権利条件の解決まで無効を維持する。


### MacのAgent仕事（2026-10-15、AI06 / ROCK）

利用者の「繋げるやつ全部となければ作成」により、対象名の回答待ちを解除。既存compositionの利用可能5 ToolをローカルAgentとして一覧化し、本人が最大6手順のAgentを作成できる。LLM推論ではない。ゲームNUIで目的・素材を依頼し、現実側で内容を承認して実処理、同じ仕事IDの最大10版を継続、成果を明示共有、検収/停止する。既存workflow契約・revision・操作IDを維持しSQLiteへ保存。ゲーム側には現実側の原稿・設定・過去版を出さず、共有した成果だけ戻す。最大100仕事/20 custom Agent、素材UTF-8 8000バイト、停止/失敗を成功に昇格しない。失敗時は設定済みAgentまたは次の版で修正する。無料記事Toolは標準設定だけでは実行できず、詳細設定が必要。

Sky外部AgentはROCK_BRIDGE_SKY_ORIGIN（HTTPS origin）とROCK_BRIDGE_SKY_TOKEN（既存本人session）の明示設定で登録一覧を取得するread-only connector。資格情報はgateway内のみ。未設定・認証失敗は未接続表示、登録済みを実行可能にしない。外部実行は既存見積/予算/Broker/delegation/usage経路の接続と受入が未完了。GTA VI、実FiveM、本番Zema、通貨交換、skin販売の成功ではない。

合格証拠: tests/fivem-bridge.test.mjs 11/11＋旧launcher 2/2、Mac UIで仕事cd237d92-84cb-4c33-a334-875fcf2d3bcdの出典整理→同ID第2版→明示共有→completedとcustom Agent作成。次は外部接続の本人環境・許可済み予算を設定して別受入する。


### FivePlay公開システム解析とadapter（2026-10-15、AI06）

利用者が指定したFivePlay軽量URLを解析。build 8b0b5899edはWASM/WebGPU、GPU/IO worker、IndexedDB userdata、COOP/COEPのWeb版。FiveMやGTA VI公式APIと混同しない。Mac IABで6%→No progress表示、world未到達。ロード表示はタイマーで6ポイントまで進むため起動成功証拠ではない。原因は未確定。

ゲームメモリや通貨を変更する入口は確認できず、公開コードから連携に使えるのは起動設定と画面上の診断。本人入力の仕事端末をChrome拡張として重ね、専用localhost:5217 gatewayにagent_requestを送り、同じworkflowで現実側の実行・継続・共有を扱う。目的/素材/Agentが入力、仕事要約/明示共有成果が出力。専用SQLiteとsession token、1時間失効、同ID再照会、原稿非公開、外部実行なし。拡張実導入は未受入。詳細・失敗/復旧・権限・受入手順はtoolkits/fiveplay-adapter/README.md。14/14対象試験＋lint合格。次は利用者確認後の拡張導入と同site UI往復、ゲームengine起動は提供者側の問題として独立して切り分ける。


## Mini単体のWebゲーム設計（2026-10-15）

利用者の追加指示により、主担当MAT15/JOINT、Game AI06連携として[R5ゲーム実行設計](avocado-mini-r5/game-runtime-design.md)を追加。1本自律・200mm以内・別Edge Hub不要を維持し、WASM/WebGPU、GPU driver、メモリ比較、電源/熱、OS/game focus、同一仕事IDの継続、原稿非公開、失敗/復旧、MG01〜07の合格条件を定義。Chrome拡張はMac参照adapterで、Mini本番はOS操作面/Brokerへ移植する。Mini実装・実機・FivePlay起動・裸眼表示・製造の合格ではない。原本packageは不変。
