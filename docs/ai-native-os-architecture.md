# RockstarOS — AIネイティブOSの共通設計

状態: RQ48を実装へ落とす到達設計。2026-09-19更新。**本文の新しい契約・状態名・数値目標は提案であり、現行APIや受入済み機能の宣言ではない。** 実装済みの範囲は第8節のsourceと証拠で区別する。製品目的は[north star](product-north-star-20260915.md)、LLMとJevの現在地は[LLM・評価モデル設計](llm-evaluation-architecture.md)と[`data/llm-capabilities.json`](../data/llm-capabilities.json)、現在の判定は[全体構成](system-composition.md)、作業入口は[Android / Device / Local AI](workstreams/07-android-device-local-ai.md)。RQ49の物質・配合・工程探索とavocadoMiniは、このCoreの権限、仕事、Tool、receiptを再利用する主要systemであり、全体像は[空間発明システム完成設計書](rockstaros-avocado-mini-complete-design.md)、Core詳細は[Material Invention Core設計](material-invention-core.md)を正本とする。

## 1. 固定する中核と依存方向

製品中核は、交換可能な端末内LLMとoffline agentを備えたOSである。高性能とはmodelの大きさではなく、同じ端末・仕事・品質条件で、利用者の確認時間、完了率、待ち時間、電池と熱を改善することとする。最初の物理対象はPixel 10 GL066／`frankel`。GMS、カメラ品質、一般スマホのアプリ数競争はCoreの成立条件にしない。

| 層 | 責任・保存する正本 | 依存してよいもの／境界 |
| --- | --- | --- |
| Device Support Package | boot、driver、電源・熱、hardware-backed鍵、AVB、OTAと純正復旧 | 上流OSと正確なSKU。対応Core範囲を宣言。Tool、Fund、特定modelに依存しない |
| Platform Core / Broker | owner・component認証、capability、承認、仕事・receipt・artifact参照、更新・復旧 | OSのUID/Keystore/SQLite等。唯一の実行権限判定者。UIやLLMの申告を権限に変換しない |
| Local AI adapter | Brokerが選択・pinしたprofileのload、推論、plan生成・計測 | Brokerが渡した最小context。任意Tool呼出し、profile activation、台帳書込み、ネットワーク資格を持たない |
| Agent runtime | 計画検証、有限step実行、停止・再開、queue、記憶参照 | Broker管理下でTool契約を呼ぶ。LLM不在でも履歴・停止・復旧は動く。roleは権限ではない |
| Tool / MCP / Provider | 個別業務・ゲーム・生成・外部照合 | 宣言された入力/出力とscopeだけ。独立署名・版・UID/隔離・quota。OS bootの必須依存にしない |
| Sky app / OS接続層 | Tool/自動化Fund発見、導入・接続・実行端末選択 | appは複数端末の操作面、OS側はcapability検査と選択保存。appにBroker管理権限を渡さない |
| Zema / 応用UI | 依頼、役割、進捗、承認案内、停止、成果 | 正本snapshotとeventだけを表示。Game/IP/動画/VRも同じ仕事・artifact契約を使う |
| Material Invention / avocadoMini | 物質・工程・安全・証拠の版管理、四方向sensor操作、VR／AR／2D表示、差分再計算、Patent AI引継ぎ | 共通Coreの仕事・権限・Tool・receiptを使う。camera、gesture、simulation、Patent AIへ装置直接権限や最終判断権限を渡さない |
| Wallet / 収益Provider | 確認済み収益・費用・資産の照合 | 完了receiptとは別のEarning Receipt。金融接続不在でもCoreと非金融Tool/Gameは動く |

OSが保証する契約と更新可能な実装を分ける。Sky、Zema、LLM runtime、Tool、外部Providerのapp-only更新では原則OS imageを再buildしない。framework、SELinux、privapp/product構成、boot/vendor/AVBの変更はOS側の受入をやり直す。Operator Dockは別配備、端末Agentは既存の限定scopeに従い、agentの記憶やWalletへの裏口にしない。

## 2. 交換可能なローカルLLM

新設する `ModelProfile` は、model ID/版、weight・tokenizer・chat templateのhash、license、runtime/API範囲、量子化/形式、context上限、plan schema、必要RAM/保存容量、測定端末/条件、品質結果を一組にする。GGUFは初期形式であり恒久的なCore依存にしない。runtime adapterを追加してもBrokerの承認・仕事契約は変えない。現在のLocal AI API v2を破壊せず、将来のprofile交渉は別version/capabilityとして追加する。

model更新は `download → hash/license/互換検査 → 隔離試験 → 待機状態で切替 → health確認` の順。進行中runは旧profileを固定し、途中でtokenizer/modelを差し替えない。切替失敗は互換性を検査した前profileへ戻す。無効・失効profileへは戻さず「model利用不可」で停止する。OS更新、runtime更新、weight更新を別のreceiptへ記録する。weightをbackupへ重複保存せず、profileとhashを保存して本人が再取得できるようにする。

更新前に旧＋新weight、展開/一時領域、仕事・backup用reserveの容量を見積もる。足りなければdownload開始を拒否し、仕事や旧modelを黙って消さない。RAMはweightだけでなくKV cache、context、他service余裕を含めて見積もり、load失敗/OOMは仕事成果を失わず停止する。初期案はLLM同時実行1、context上限固定、充電中のbackground処理優先。OSからの熱・電池圧力で新規claimを止め、既存runは安全な区切りか取消で止める。冷却・充電後も期限や承認を再検査する。

測定profileにはcold/warm load、TTFT、token/s、仕事全体のp50/p95、閉じたschema有効率、成果検収率、手直し時間、peak PSS、空き容量、30分以上の連続負荷、電池消費、thermal status、停止応答を記録する。比較は同一入力群・context・出力上限・電源条件・OS版で行い、発熱で低下した区間も含める。初期評価案は日本語の通常依頼20件＋不正/曖昧/過長/Tool置換20件。危険なplanの実行は0件必須、通常依頼の有効plan率95%以上を候補目標とし、品質とp95時間・電池予算は初回比較で数値を決め、出荷前に固定する。未設定の予算を性能合格扱いしない。

現在のQwen3-0.6B Q8_0の[実機試験](evidence/android-pixel-10-gl066-local-ai-20260916.json)は一構成での機内モード・熱の証拠であり、最適modelの選定完了や上記benchmark合格ではない。cloud/PC fallbackは送信内容・実行先・費用の別同意を必要とし、local不足時に自動で外部送信しない。

runtime側は別の `RuntimeManifest` にpackage/signer/版/API範囲/対応ModelProfile形式/plan schemaを宣言し、Brokerが実APK identityと照合してregistryへ登録する設計とする。現行 `contracts/local-ai-runtime.json` と `LocalAiConnection` は固定package・versionCode・API・同署名検査であり、任意runtimeへの交換を実装済みとはしない。1.0ではこの一つのadapterと互換model二構成の差替え/失敗rollback/旧job pinを最低受入とし、別runtime二実装間の差替えは拡張受入に分ける。署名境界を変えるruntime導入は通常のmodel変更で迂回できない。

profile activation/rollbackのauthorityはBrokerの管理transactionだけが持つ。最小download資格のstagerが非active領域へ置き、Brokerが承認されたmanifestの署名、全hash、容量、互換性を再検査してからactive generation pointerをatomicに切り替える。runtimeの自己更新でこの経路を迂回できない。staging/検証/切替/healthのjournalを残し、起動時は最後に確定したpointerからresumeまたは検査済み旧profileへrollbackする。旧jobのpinがあるprofileは削除しない。旧profile失効時はそのjobを停止し、新profileでの明示的replanを新revisionとして扱う。

## 3. Agentの記憶、仕事、再起動

記憶を三つに分ける。仕事記録はowner、work ID、入力/plan/profile/Tool版のhash、step、attempt、結果参照とeventを正本にする。短期contextはこの記録から再構成するcacheで、消失しても実行権限や完了状態は変わらない。長期記憶は本人が確認した好み・手順・参照資料とし、出所、owner、用途scope、保存期限、訂正/削除を持たせる。LLMの推測を本人の事実や承認へ昇格させない。

長期記憶・検索indexは未実装の追加層。owner別暗号化、Tool別read scope、入力サイズ制限、削除時のindex/cache除去を必要とする。本文はtelemetryへ出さない。取得した文書やTool結果は未信頼dataとして扱い、そこに書かれた指示でscopeを広げない。secret/credentialは記憶に埋め込まずOS側参照で扱う。backup復元後のauthority、approval、sessionの扱いは既存[backup v2](android-backup-recovery.md)へ従う。

仕事は既存の `active → review → completed`、`cancelled` を保ち、実行待ち理由を独立した追加fieldとして設計する。`approval/network/resource/reconciliation` 等の待ち理由をjob成功と混同しない。stepの `pending/queued/running/succeeded/needs_review/failed/cancelled` は既存Engineから拡張する。汎用DAGを最初から作らず、版固定の有限recipeからTool種類を増やす。

claimはtransaction内でattempt、boot identity、単調時計期限、fencing tokenを保存してからdispatchする。結果採用はowner、run、Tool identity、token、generation、入力hashを照合し、成果参照・状態・次queue・eventを一transactionで確定する。停止でtokenを失効し、遅いcallbackを拒否する。再起動後、期限切れの**純粋なローカル変換だけ**を上限付きで再claimできる。現在のEngineはこの限定ケースで60秒lease、最大3 attempt、充電条件を持つ。この再queue処理を外部変更Toolへそのまま拡張しない。

モデル非依存のcanonical memory案は `schemaVersion/ownerRef/projectRef/memoryId/kind/contentRef/provenance/createdAt/expiresAt/revision`。provenanceには本人確認かTool/model生成か、source work/artifactとモデルprofileを残す。model固有のtoken列・embedding・会話templateはprojection cacheとし、model変更時にcanonical記憶から作り直す。旧modelへ戻す時も旧token列を新モデルへ流用しない。schema移行はtransactionとreader互換検査、削除はcanonicalと全projectionの失効を伴う。1.0最小記憶は仕事・成果・本人確認済み設定の再構成まで、汎用vector検索や自律的な長期記憶獲得は拡張である。

記憶の非互換移行はmigration journalと `copy → validate → atomic switch` を用い、commit前のsourceを保持する。失敗は元のreader/schemaへ戻せる場合だけ戻し、戻せなければ読取/復旧待ちで停止する。journal作成、copy途中、validation後、pointer切替前後のpower lossを試験する。SQLite内だけの互換移行は既存transactionで処理できるが、DB外artifact/projectionを含む切替を単なるDB transactionで保証したとしない。

## 4. Offlineと外部作用の境界

新しいTool effect分類は `local-pure / remote-read / external-write`。manifest宣言だけで信用せず、OS権限とadapter試験で一致を検査する。通信断でもlocal-pureの準備・成果・review・停止・保存は継続できる。最新外部情報が必要なreadは取得時刻/期限を示し、期限切れcacheを最新と表示しない。変更や課金はofflineで完了と表示しない。

external-write用にoutboxと照合状態を追加する設計とする。実装前の状態遷移は `prepared → dispatched → confirmed | rejected | uncertain`、uncertainは照会でのみ解消する。送信前にowner、operation ID、payload hash、対象、費用上限、承認ID/期限、provider idempotency key、generationを永続化し、直前に権限を再検査する。同じkeyで異なるpayloadを拒否する。承認期限切れ、失効、復元、宛先変更は再承認が必要である。

送信直後の切断/killは「失敗だから再送」としない。provider referenceまたは同じkeyで照会し、署名/内容/金額/状態を照合する。Providerが冪等再送を保証する場合だけ同一keyを再送可能とし、保証も照会もなければuncertainで止め本人/Providerへ解決を求める。一般ネットワークでのexactly-onceは約束しない。取消要求後も既に外部成立した作用は取消完了とせず、別の補償操作とreceiptを作る。時刻変更、再起動、重複callback、承認失効、停止と完了の競合を試験する。

## 5. Sky appとOSのcapability交渉・保存

Sky appはスマホ/Web/PC等の選択・接続UI、OS側Sky serviceはBrokerによる端末実行能力の提示と永続selection管理である。今のShell内Skyを将来の全端末版と呼ばない。既存Shellのno-INTERNET境界は保持し、遠隔版は認証済みgateway/端末接続adapter経由とする。任意ネットワークからBinderを公開しない。

追加するcapability response案は `protocolVersion, deviceRef, coreApiRange, toolVersions, planSchemas, effects, storageSchemaRange, modelProfiles, limits, connectivity, observedAt, expiresAt, generation`。認証済みowner/deviceへ束縛し、app申告を根拠にしない。Toolの要求と端末の提供の共通部分だけを表示し、不明な必須capability、古い観測、範囲不一致は実行不可にする。選択時だけでなくsubmit/claim時にもOSが再検査する。modelを選べることと、そのmodelにTool権限があることは別である。

保存はOS Brokerが正本を持ち、Sky appは表示cacheを持つ。次版selectionはowner、選択Tool/Fund版、recipe hash、対象deviceRef、policy generation、revision、selection tokenを保存する。変更はexpected revisionで比較更新し、競合は再読込。Zemaへはtoken/refだけを渡し、原稿・credentialをURLへ入れない。現行Webの短命session handoffとnative SQLite selectionを、同期済みの同一保存と扱わない。

初期の実行端末は本人が一台指定する。仕事ごとに一つのauthority deviceとwriter epochを固定し、appの画面切替や通信断で別端末へ自動移送しない。将来のhandoffは旧端末を停止・fenceし、最後のstate/hashとuncertain作用を照合し、新端末のcapabilityと承認を再検査してからepochを増やす。旧端末の停止を証明できないoffline時はhandoffを止める。別端末で独立した仕事は作れるが、同じ仕事や金銭操作の二重writerは許可しない。遠隔接続、複数selection、writer移送はいずれも未実装である。

| 能力・保証 | 通常のSky app / Web / 既存OS上APK | RockstarOS側で追加受入が必要な保証 |
| --- | --- | --- |
| 選択・依頼・表示 | app権限内のUI、認証済みAPI、cache。接続先不在は操作不可 | Broker identity、永続selection、ローカル実行の権限強制 |
| offline実行・記憶 | 導入済みadapterとapp sandboxの範囲。OSによりbackground制約あり | boot後の復旧、全体quota/熱管理、service寿命と停止の実機受入 |
| 分離・運営保護 | 通常UID/署名許可のみ。Device Ownerや特権を推測しない | SELinux/privapp domain、限定Device Owner操作、StrongBox登録 |
| 更新・復旧 | app/model更新とappデータbackupの受入範囲 | AVB、OS署名、OTA、rollback index、純正復旧、鍵喪失復元 |

capabilityには機能の有無と保証の検証環境を別々に返す。同じ画面が動くことからOS保証を推定せず、接続先が証明できない項目は `unavailable/unverified` とする。このmatrixを一般スマホappへの機種対応保証に転用しない。

## 6. Zemaの共通作業契約

全systemへ共通にするjob envelope案は、`ownerRef/workId/requestKey/requestHash/revision`、selectionとrecipe版、model profile、入力artifact参照、step/effect/実行先、予算、approval参照、run token、event sequence、結果artifact/receipt参照、待ち理由、最終照合時刻を持つ。ID群は役割別に維持し、一つのIDへ混ぜない。receiptにはsource/environment（fixture、sandbox、実機APK、OS image、本番）を区別できる証拠参照を持たせる。

Zemaはこのenvelopeの読取と `submit/approve/pause/resume/cancel/retry/reconcile/review` の窓口になる。これは将来の共通操作集合であり現行AIDLへの追加済み宣言ではない。承認は既存の信頼されたOS確認画面でpayload/費用/対象/期限を本人確認し、Zemaの会話中の「はい」だけで発行しない。途中planの変更は新revisionとして差分を示し、既存承認を使い回さない。

ライブ表示はevent sequenceから作り、欠番/再接続ではsnapshotへ再照合する。端末未接続は最終確認時刻を表示し、架空の進捗や内部思考を生成しない。「停止要求」「停止確認」「外部照合待ち」を分ける。Tool成功→本人の成果確認→仕事完了と、販売→Earning Receipt→Wallet反映は別の列として表示する。

移植時は[Web workflow](../lib/workflow.ts)のrevision競合・command冪等性・sample不合格・review必須をfixtureの共通期待値にする。Androidはowner別DBとBinder境界を持つが、汎用job revision/command集合がWebと完全一致する実装はまだない。将来のschema migrationは旧データを保持し、未知版をresetせず拒否し、rollback readerの互換性を検査する。

## 7. 同じCoreで複数の縦断を作る

| 共通段階 | 便利機能: 原稿の整理・記事準備 | Game/IP: 本人所有の短編テキスト冒険を制作・試遊する案 |
| --- | --- | --- |
| Sky | 既存 `article-preparation@1` を選ぶ | 新規提案 `story-adventure` Toolを選ぶ。権利を確認できる自作素材だけを入力 |
| Zema/Local AI | 依頼から既存の閉じたinput schemaへ計画 | 世界設定・分岐・台詞を閉じたschemaへ計画。ゲーム結果を権限に変換しない |
| Broker/Tool | citations→free-articleの純粋な2変換 | 構造検査→ローカル試遊用package生成。追加adapterはsandbox/出力上限付き |
| 記憶/成果 | 入力・成果hash、確認・修正履歴 | canon資料・script版・save stateをowner/work/gameで分離。失敗時も前版を保持 |
| 停止/復旧 | 同一workを再起動してreviewへ回収 | 生成途中の停止、再開、試遊save復元、他game/ownerへの参照拒否 |
| 任意の外部接続 | 本人承認後に納品。収益はProvider確認後のみ | 本人承認後、動画生成Providerへ選択素材だけ送る。公開は別作用。VR向けexportは別adapter |
| 独立受入 | 機内モード成果、手直し時間、品質、保存・復旧 | 一つの遊べるscenario、save復旧、素材出所、権限拒否。動画/VR/収益を成功条件に足さない |

後者は製品要望を具体化する**検証候補**であり、ユーザーが特定タイトル・サービス・販売を選択済みという意味ではない。最初はtextとローカルassetで成立させ、既存Game SDKの認証/owner/game分離へ接続する。Android Game adapter、新しい生成Tool、動画/VR exportは未実装。既存のGX00/GX01合成交換を、新しいゲーム本体がある証拠にしない。

ゲーム点数・進行度はgame側の非金融data、Provider確認済み販売収益はEarning Receipt、交換可能な資産はWallet/Providerの別台帳で管理する。点数→実資金の暗黙換算や動画再生数→収益の推定記帳は禁止。交換を追加するときだけGX01のquote/予約/両台帳/照合、方向・rate・手数料・本人承認を独立受入する。Game/IPの制作と試遊はWallet/Fundの完成を待たない。

Material Invention／avocadoMiniは第三の縦断である。Zemaで目標と制約を仕事にし、Skyで材料DB、simulation、Patent AI、外部ラボを選び、四方向sensorまたは2D操作からCoreへ版付き仮説を渡す。Safety Gateの後だけsimulationを実行し、人、AI、文献、予測、実測を分離したInvention Event Ledgerを成果とする。gestureは物理実験、外部共有、出願の承認にならない。詳細と役割別入口は[共有用完成設計書](rockstaros-avocado-mini-complete-design.md)に従う。

## 8. 既存実装との対応と不足

| 契約 | 再利用する現物 | 現在地と次の実装 |
| --- | --- | --- |
| identity/許可/更新 | `android/core/.../platform/PlatformStore.java`、`android/tool-sdk/src/main/aidl/dev/rock/sdk/IPlatformApi.aidl`、[Core](platform-core.md) | APK signer/UID、approval generation、台帳、update/rollback schema検査あり。新しいcapability manifestは追加設計 |
| local plan | `android/local-ai-api/.../ILocalAiService.aidl`、`android/tool-sdk/.../ZemaToolPlan.java`、`android/automation/.../ZemaOrchestrator.java` | API v2、固定article plan、closed fieldsを実装。複数model profile・汎用plan registry未実装 |
| 仕事/再起動 | `android/core/.../Engine.java`、`android/core/src/main/resources/schema.sql`、`Scheduler`、`PhysicalRebootRecoveryTest` | 単一Android user/DB・固定2工程・外部作用なし。上記汎用記憶/outbox/多端末調停は未実装 |
| Sky/Zema | `android/shell-api/.../IShellApi.aidl` v4、`lib/sky-zema-handoff.ts`、`lib/workflow.ts` | native selection schema v2、Webの短命handoff/本人別jobが存在。app横断同期・一般Tool選択は未実装 |
| 収益/Wallet | `lib/earning-bridge.ts`、`lib/earning-receipt.ts`、既存Billing Worker、PlatformStore | Rock所有fixtureでToolと署名収益の相関・冪等照合。外部sandbox/返金/chargeback/払出し未受入 |
| Game/作者 | `systems/rock-star-os/os/wallet_backend/runtime_contracts.py`、[GX01](gx01-contract-implementation-plan.md)、[SDK契約](game-api-contract-draft.md) | Linux fixture/SDKの限定受入。正式ゲーム・Android port・本書のstory Toolは未実装 |
| Material Invention／avocadoMini | `lib/material-invention.ts`、`contracts/material-invention*.json`、`contracts/avocado-mini-spatial-interaction.json` | 装置非接続sandbox Coreと統合設計は完成。決定的scene、合成pose、四方向sensor実機、simulation／Patent AI bridgeは未実装 |
| backup/運用 | `RecoverableBackupManager`、`PlatformStore`、`android/operator-agent/` | backup v2と制限付きOperatorのsource/試験あり。物理wipe復元、production credential、StrongBox登録、Device Owner、最終SELinuxは未受入 |

`...`は上表のJava package配下の省略表記であり、新しいファイルを示さない。[実機23項目](evidence/android-pixel-10-prefull-physical-20260916.json)は既存OS上の試験署名APK、実再起動、backup非破壊exportの証拠。RockstarOS full build、flash、production鍵、OTA/純正復旧や外部売上の合格ではない。

## 9. Core 1.0と応用の独立受入

以下は既存のrelease gateに追加して設計を検証する分解であり、既存のfull build/初回flash条件を緩めない。Core受入は製品全体・全応用の完成と同義ではない。

| track | 完了条件 | 他trackとの関係 |
| --- | --- | --- |
| Core 1.0 / AI契約 | 一runtime adapter上で少なくとも二つの互換ModelProfileの機内モードplan/切替、旧job pin、拒否/停止、local-pure再起動、model更新失敗、限定memoryの再構成/移行、容量/電池/熱を受入。性能profileの数値予算を固定して測定 | app-onlyの契約実装を先に検証できる。汎用vector検索、別runtime二実装、多端末移送、実収益を必須にしない |
| Core 1.0 / Device配布 | 同じGL066 OS候補でboot/権限分離、上のAI契約、backup/鍵喪失復元、OTA失敗/rollback/純正復旧と既存release gateを受入 | Core配布にはAI契約とDevice配布の両方が必要。GMS、カメラ、Game/動画/VRを必須にしない。APK合格だけでは未達 |
| Sky/Zema初期 | 一台の永続selection、依頼→許可→実行→review→成果、snapshot復旧、不正token/owner/重複拒否 | Coreの最初の利用経路。複数端末版の合格とは別 |
| Sky複数端末 | capability非互換・古いcache拒否、端末選択、競合revision、再接続、二重writer拒否・移送 | 初期一台Coreを待たせずadapter/fixtureを開発。受入前は対応表示しない |
| 便利Tool | 上の原稿縦断を同一入力/品質で比較し、確認時間と失敗復旧を測定 | 売上なしでも便益を合格にできる |
| Game/IP | 上の制作→試遊→save復旧とowner分離を実証 | Core/APIを共有して並行開発。金融交換、動画、VRはそれぞれ別受入 |
| Material Invention／avocadoMini | 合成graph→決定的scene→合成pose操作→安全gate→差分simulation receipt→Patent AI packetを受入。実機は四方向校正、誤操作、privacy、accessibilityを別受入 | Core/APIを共有して並行開発。simulation、実材料、外部ラボ、特許性、量産は互いを代替しない |
| 実収益/Wallet | 外部sandboxで成果→署名receipt→Wallet、重複、返金/chargeback、結果不明、払出しを照合。LIVEは対象条件に従う | Core合格で代替不可。未合格ならlive収益表示・収益利用の公開は不可 |
| Fund改善 | 複数Toolの役割/順序/予算/停止、反復した確認済み費用/収益、旧構成との比較 | 実績不足はPAPER。非金融の構成試験は並行可能、利回り保証なし |

段階1（ROCK、OS07〜OS11/DSP01）は本書のmodel profile・job envelope・effect分類・capability fixtureを既存APIと突き合わせ、未知版拒否とmigration案を固定する。段階2（ROCK、同taskと既存Game task）はapp-onlyで原稿とstory候補を通し、途中停止、OOM/容量不足、再起動、通信断の異常系を実装する。まず純粋変換を拡張し、external-write outboxは照合契約を持つadapterにだけ追加する。

段階3（JOINT/OWNER、DSP01/RLS02）は既存full build入力と[初回flash gate](android-first-flash-gate-20260916.md)を満たした同一OS候補でCore物理受入を行う。インフラ契約、鍵管理、wipe/flashは本設計更新では実行しない。段階4は応用ごとの受入を独立に進め、実収益ProviderはJOINT/OWNER、Tool/Game adapterはROCKを主担当にする。実名の運用責任者や外部契約が必要なgateは公開前に確定する。

実装単位は進捗JSONの `AI01`（本設計と独立監査）、`AI02`（model/runtime互換）、`AI03`（限定記憶とprojection）、`AI04`（effect分類と不明結果照合）、`AI05`（Sky能力交渉・単一実行端末）、`AI06`（非金融Game/IP fixture）に対応する。AI02〜06は計画で、既存OS07〜OS11/DSP01/RLS02の受入を置き換えない。AI04のexternal-writeは現行pure Engineに実証された脆弱性ではなく、外部変更を一般化する前の設計blockerである。

直近の未確定事項は、比較採用するmodelと性能/電池予算、長期記憶の保持期間、一般Tool manifestのcapability schema、遠隔device enrollmentとwriter移送の具体transport、story候補の素材/成果schema、外部Providerの照会・冪等性契約である。これらは設計/fixture作業を進めながら具体化し、未確定を実装済み・高性能達成・本番対応と表示しない。
