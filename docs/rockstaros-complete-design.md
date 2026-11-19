<a id="noah-connection-sharing"></a>

<a id="noah-select-resale"></a>
## Noah本人用リセール実行（2026-11-16）

2026-11-17の本人指示で、[ターミナル用テンプレート](../toolkits/noah-resale-agent/README.md)を追加。ブラウザに依存せず共通service/Work状態遷移を実行し、専用SQLiteへ本人別に保存する。terminal監査、5分の内容固定確認書、多重watchのlease、独立配布/復旧/受入は実行契約のCLI節へ統合する。Webの保存先とは自動同期せず、OS実機・実provider受入を追加で主張しない。

[実行契約](services/noah-select-resale.md)を目的・体験・責任・入出力・状態・保存・失敗/復旧・承認・受入・未決定事項の詳細とする。3担当の探索/在庫を既存Workのowner/revisionへ保存し、公式eBay adapterへ予算予約と具体的条件確認を通して接続する。first-party localhost専用機能で、新規公開catalog ToolやOS実機対応の合格ではない。実取引/無人売買/入金自動同期は未受入。

## NoahからEveへつなぐ接続・共有の全体契約

v0.4の[Noahストア・端末管理](noah-agent-model-store-design.md)を主導線にする。Eveは共通知能、NoahはAgent構成とストア、AMC/Broker/Work/Jevは工程・権限・実行・評価を担い、独立したSkyは置かない。Agent/LLMの検索→端末へ追加→Eveで仕事・編集→更新/削除を既存モデル管理へ接続する。旧sky系識別子とv0.3の3機能DB/APIを保持。計62件の受入設計で、新runtime・導入・配備は未実行。

接続・共有を横断する詳細は[Noah設計](noah-connection-sharing-design.md)へまとめる。Noahはストア/Agent構成/端末管理/接続/共有、Eveは共通知能/目的理解/実結果の説明、既存仕事systemとOS Brokerはowner・Job・権限・予算・保存・停止を担う。投稿の閲覧権限、modelへの送信、担当保存、Tool実行、外部共有を別々に検査する。新しいJob状態や別DBは追加せず、lib/workflow.tsの四状態、旧route・schema・版付き由来を保つ。

目的、利用体験、責任、入出力、状態、保存、失敗/再送、更新/復旧、承認、受入、未決定事項は同書の11章を正本とする。実装の所在はmain/PR305/Root/配備候補を分け、62ケースの合格証拠を同じ候補で集める。v0.2では限定投稿の送信を三つの許可と最終claimへ結び、下書きを会話/recallから分離したowner別暗号化保存へ、招待を期限/一回利用/原子的参加と撤回へ具体化した。保持/期限は設計案であり、文書作成時点では新しいruntime・実機・本番受入は行っていない。[整理と検証](evidence/noah-connection-sharing-design.json)。

## 2026-10-23 — 正式表記はSmith

本人の明示訂正により、旧Sky／smisの製品表示は **Smith** とする。Eveで担当を作り、Smithが対象・能力・実行先をつなぐ責任は維持する。既存の `/sky`・`/api/sky`・`smis.*`・header・保存・権限scope・設計anchorは互換維持。以下の旧表記は経緯として残す。表示変更はPixel実機の一周や公開の合格を意味せず、一般公開は保留する。

## 物を便利にする目的と部品の照合（2026-10-23）

共通Coreの候補照合は必要能力と実接続・対応処理を分け、候補／購入を実行権限へ昇格させない。同じEveの担当・仕事・成果・停止とowner／model pin／予算を再利用し、端末ごとにjob DBを作らない。Mini／Pro／Pixelは同じ照合関数を使い、個別driverと実受入を保持する。 [詳細正本](sky-tools-complete-design.md#smis-object-purpose)。

## 交換式部品を共通のEve仕事へ接続する（2026-10-23）

保存済み仕事の引継ぎ（OS10/SKY21/WEB04、2026-10-23）：本人が「選んだ担当を使う」で保存済み仕事を明示選択すると、同じowner・会話・実行先・担当hash・model hashのreferenceを共通Coreへ渡し、既存portの認証済みGETで読み直す。prepare/start・新ID発行はしない。ローカルhandleが異なる／壊れている場合は保持して拒否する。read失敗はunknownを保持し、停止競合は同IDのreceipt確認まで待つ。一般公開・実画面・Pixel受入は未完了。候補一覧は既存APIの件数上限内で、全履歴の列挙を保証しない。 画面の定期取得も取得開始時の会話IDをqueryへ固定し、応答時の会話が変わっていれば旧一覧を反映しない。会話を選び直す際は旧仕事一覧を先に消す。前回serverだけを絞った状態では画面経路の修正完了でなかったため、この補正を別記録する。

### 保存済み端末実行の続き読取り（OS10/SKY21/WEB04）

1. 目的：同じ会話に50件を超える端末実行があっても、過去の仕事を同じIDで発見する。WorkJob／Cloud／旧Linuxの全履歴をこの一覧へ置き換えない。
2. 利用体験：「選んだ担当を使う」で「以前の端末実行を50件ずつ読む」を押す。次ページは表示を入れ替え、先頭へ戻る操作も用意する。選択時に既存Core.resumeから正本を読み直す。
3. 責任：ROCKがowner照合・ページ境界・削除・上限・再送禁止を強制。EXTERNALは端末の実停止。OWNERは引継ぐ仕事の明示選択。JOINTの実UI／Pixel受入は別gate。
4. 入力：認証本人、threadId、任意cursor。cursorはowner/thread/created_at/idの4値、2048文字以内。本人承認や実行権限を表すtokenではない。
5. 出力：最大50件の既存commandに対応するpending／成果と続き位置。created_atとIDの降順を固定し、同時刻の境界も取りこぼさない。51件目の存在で続きの有無を決める。
6. 状態：未読→取得中→ページ表示／末尾／失敗。読込みだけでprepare/start/claim/stopや費用状態を変更しない。表示は取得時点でありsnapshot全体を固定しない。
7. 保存：既存暗号化command/replicaが正本。UIは現在の1ページだけを保持し、新しい台帳・key・model・アカウントを作らない。
8. 失敗：異なるowner/threadのcursor、壊れたcursor、競合query、端末tokenからの読取りを拒否。削除会話は410。応答のowner/thread/currentを再照合し、同じcursorの反復も拒否する。
9. 復旧：失敗時に続き位置を進めず、再読取り／先頭から読取りを可能にする。画面離脱後の応答は反映しない。同IDの成果と停止確認を既存portで再照合する。
10. 承認：GETだけで読み、選択は再実行の承認にしない。再実行・モデル変更・別実行先への移動は既存の明示操作と承認を別に通す。
11. 合格と未決：同時刻57件を50+7で重複なく列挙、成果を含め、DB変更0、他owner/thread拒否、削除後拒否を実routeで検証する。実UI/Pixel・大規模履歴の遅延計測は未受入で、実測後に上限を判断する。

### 担当・モデル更新後の過去成果閲覧（OS10/SKY21/WEB04）

1. 目的：現在の実行先／担当／モデルが利用不可でも、本人の同じ会話に保存した旧版の成果を読む。
2. 体験：「過去の担当・モデルの成果」で50件ずつ読み、「保存した本文を確認」または「成果を文章で保存」。ページのmetadataは読込時点、本文と保存は毎回同じjobを再読取りする。
3. 責任：ROCKが本人・会話・仕事・版・hashと削除を検査。EXTERNALの現時点のmodel可用性は履歴閲覧の条件にしない。OWNERの選択は閲覧だけで、再実行承認へ昇格しない。実UI/PixelはJOINT受入。
4. 入力：認証ownerとthread、既存cursor、表示済みexecutionのid/thread/device/revision/digestと元のrole/model版。
5. 出力：元の担当名、基盤model ID/hash、依頼、仕事ID、照合済みの普通のUTF-8文章。実行command/claim/credentialをfileへ含めない。
6. 状態：未読→取得中→一覧／本文／保存／照合失敗。同時操作を抑え、遅延応答は現在のowner/threadと生存中componentを再検査する。
7. 保存：既存暗号化command/replicaだけを正本とし、archiveに台帳やmodel registryを作らない。UIは現在1ページと選択本文だけを保持。
8. 失敗：owner/thread/役割/model/reportの不一致、revision/digest変更、本文hash不一致、削除済み、結果不明を拒否し、前の本文を消す。scriptやHTMLとして描画しない。
9. 復旧：新しい保存状態を読み直す。削除会話を再作成せず、旧modelを自動取得・登録しない。実行中の仕事と停止handleには触れない。
10. 承認：readerはpage/draftのGETだけを持ち、start/claim/登録/stopの能力を持たない。文章保存のclickでも同じ保存版を再照合する。
11. 合格／未決：旧成果保存後にrole/modelを更新し端末を失効しても、同ownerの旧成果を読めること。GETのみ・DB変更0、owner変更／遅延応答／改ざんmodel／削除後を拒否。実ファイル保存先と実UI/Pixelは別途受入する。

### 旧版の仕事の状態と停止照合（OS10/SKY21/WEB04）

1. 目的：現在の担当/modelが変わっても、既存の旧版仕事の停止を同じIDで確認する。
2. 操作：過去の担当・モデル欄で「この仕事の状態を読み直す」「同じ仕事の停止を確認する」。停止は本人の明示clickだけで、一覧読込／離脱では自動停止しない。
3. 責任：ROCKがowner/thread/device/job/role hash/model hashの固定と状態照合、EXTERNALが元のhostの実停止receipt、OWNERが停止対象の選択。実UI/PixelはJOINT受入。
4. 入力：保存済みpendingの元id/thread/device/input/agent/model版。ownerは認証sessionとx-sky-ownerで照合する。currentの本人／会話が変われば前後とも拒否する。
5. 出力：running／unknown／stopped／保存成果確認。unknownや接続・失効errorを停止済み／0円／費用解除へ変更しない。
6. 状態：GET再照合→必要なら同idの既存PUT stop→GET再照合。claim済みは元receiptまでunknown。過去に存在した保存記録の404を未到達とみなさず、履歴controlではstart fenceの作成を禁止して停止未確認を保つ。terminal既存結果は保持する。
7. 保存：既存command/stop intent/receiptが正本。新しいjob、role登録、モデル取得、台帳は作らない。履歴からのcontrolはinspect/requestStopだけを公開する。
8. 失敗：別owner/thread、role/model hash違い、失効hostの停止不能、遅延応答を拒否または未確認として表示。元idや他仕事を置き換えない。
9. 復旧：同じ履歴pageとjob IDで再読取りし、端末からのreceiptを待つ。失効deviceを勝手に復活させず、新端末に元の停止を確認させない。
10. 承認：停止だけを扱い、prepare/start/claimを公開しない。旧役割の利用不可を再実行同意／Cloud fallbackへ読み替えない。読取り専用archive readerは独立して維持する。
11. 合格／未決：旧role/modelへ配送済みの仕事をmanifest更新後に止め、元receipt前unknown→後stopped、他仕事不変、別owner/thread/版違い/retired context拒否、失効hostは未確認を実routeで検証。実Worker再起動・実UI/Pixelは対象候補で別記録する。

### Coreの保存済み由来と初回配送の区別（OS10/SKY21/WEB04）

1. 目的：再開した既存仕事の記録消失を未到達と誤認せず、元jobの停止未確認とhandleを保持する。
2. 体験：saved jobのresume／存在確認後は同IDを再読取りする。状態が消えても新しい依頼・fence・停止済みへ置き換えない。
3. 責任：ROCKが由来印・adapter選択・保存/再読込みとhash照合、EXTERNALが元hostの実receipt。印はOWNERの本人認証や承認を付与せず、実UI/PixelはJOINT受入。
4. 入力：既存5項目reference。pending storageには追加のknownExisting:trueを保存し、adapterへは元の5項目だけを渡す。
5. 出力：既存job/result/unknown状態。存在未確認の初回配送だけが従来stop経路を使い、印付きはstopExistingだけを使う。
6. 状態：resume前に印を保存。start成功/有効な観測でも印を保存し、arm時に復元。read=nullならunknown、read→stopの間の404でも専用adapterはfenceを作らない。
7. 保存：同じowner/thread/device/role/model scoped pending keyで5→6項目を読む。追加の台帳やjob IDを発行しない。storage更新失敗でも既知仕事をlegacy stopへ戻さず、停止照合を専用経路で試す。
8. 失敗：未対応stopExisting adapter、読めない印、保存エラー、接続/権限不一致はunknownとしhandleを保持。読めないraw記録があるときpending=nullだけでstandbyとしない。
9. 復旧：最新readerで同じhandleを再読取りしreceiptを待つ。初回配送時の既存fenceと、保存済み記録の消失を区別する。
10. 互換：古い5項目は読めるが由来を証明できない。旧clientの6項目対応、由来不明の旧記録とDB消失、storage更新失敗と後のserver消失が重なる復旧は未受入。一般公開前の別gateとする。
11. 合格／未決：新Coreの印付き再開→server記録消失→client再作成でもunknown/同ID/GETのみ。read-stop競合でfence0、POST受理後の記録消失、adapter未対応、印破損とstorage失敗を確認。Runtime/Purpose/入力guard/Linuxと配布SDKへ同契約を反映し、実UI/Pixelとserver災害復旧は別受入。

### 端末runtimeの復旧保留（OS10/SKY21/WEB04）

再現検査：Sourceでbuild後、`node --experimental-strip-types scripts/check-eve-runtime-recovery-worker.mjs`。古いpending復元、Agent登録配送・認可・遅延停止receipt拒否、3回再起動、DB不変を合成Workerで検査する。T05/T06の限定証拠。

1. 目的：古いD1 snapshotから戻ったpending/claimを配送したり、後の停止receiptが失われた状態で停止済みと扱ったりしないための、明示設定されたruntime保留。
2. 操作：作業者は全公開入口・cron・queue等を別途止め、復旧前に外部のserver設定EVE_RUNTIME_RECOVERY_MODE=pausedを設定する。利用画面は「保存復旧の照合中」を示し、履歴は停止未確認として保持する。
3. 責任：ROCKは当該runtime APIのguardと状態投影。OWNER/運用者は復旧時の設定・本人/鍵/失効/削除/予算/receipt照合。EXTERNALはhost journalと実停止。JOINTの実機・cloud災害復旧は未受入。
4. 入力：信頼されたdeployment設定だけ。未設定/空/normalは従来動作、pausedと不正な値は保留。request body/header/queryから解除できない。
5. 出力：owner snapshotのrecovery.state=paused、runtime devices空、pending/fenceはstop-unknown/canStop=false。実host停止の証明ではない。保存文章の読取りはこのguard単体では禁止しない。
6. 状態：保留中はdeviceの配送/claim/authorize/report/ack/receipt、enqueue/fence/stopや準備mutationを503で拒否。Origin/本人境界を維持し、旧clientのstopにも偽の停止確認を返さない。
7. 保存：既存D1を変更せず、外部設定で保留する。新しいjob/台帳/モデル/鍵を作らない。worker再起動後も同じ保留設定を必須とする。
8. 失敗：設定の誤字も保留。接続error/未確認を0円・停止済みへ昇格しない。自動rollback検出や自動保留設定は実装していない。
9. 復旧：古い未配送snapshot→後のclaim/停止→snapshot復元をprivate fixtureで試し、保留下で当該runtimeの再配送0/新execution grant0/command不変/handle維持を確認する。復旧前後の原本とsnapshotを変更しない。
10. 承認：解除は照合後の運用判断であり、自動解除しない。全サービスの公開、auth/session/削除/Wallet/A2A等の復旧はこのflagの受入に含めない。公開入口を閉じた復旧手順と個別gateを維持する。
11. 合格／未決：実routeで巻戻しpending→unknown、GET以外503、device配送/claim拒否、設定override拒否、不正設定fail closed、SQL変更0。実Workerの古いfile snapshot復元/再起動、全体回帰、実UI/Pixelは対象候補で別記録する。自動検出と全体復旧の方式は次の運用設計/証拠で決める。






[詳細正本](sky-tools-complete-design.md#smis-removable-module)。本人指定により、再利用本体＋対象別の保持／接触部＋共通OSを具体化する。小型部品はIO周辺機器、Pixel／Mini／Proは同じ本人・担当・仕事・料金・成果・停止のCoreを使う。先行sourceはloopback開発文書からmicro:bit加速度を読む入力adapterと既存EveWorkPortのguard。確認した単発の観測を可視の依頼文へ添え、既存workflow／runtimeで保存・実行・停止を扱う。新job／Object／課金DBは増やさない。切断と取り付け変更で新規prepare/startを止めても、元jobのread/stopは残す。画像・外付け・内蔵の自動切替、永続対象再識別、部品の物理的な脱落検出、Mini／Pro driverと実機受入は未完。一般公開保留。

<a id="os-unified-interaction"></a>
## OS内でEve・smis・仕事を統一する（2026-10-22本人訂正）

本人の「そもそもos内を統一すればいい」を最新の実装方針とする。前段のMini音声試験を端末別の独立した会話/仕事経路へ育てず、RockstarOSの共通Coreへ統合する。理由は同じ依頼/担当/仕事/成果/費用/停止を、入口の違いで作り直さないためである。

1. **目的**: OS内に本人・Eve・smis・実行先・保存/復旧・料金・停止の一つの契約を置く。入力方法や端末の追加で別のAgent台帳/仕事履歴/料金体系を作らない。
2. **利用体験**: 声/文字/ボタン/承認済みsensorの入力→同じEveで依頼/担当/実能力確認→同じOSの本人/権限/予算確認→smisが既存実行先へ接続→同じjob/成果/明細→停止/保存/再開。Hey Eveは共通Eveの開始、Thanks Eveはその会話で始めたjobの停止照合/待機であり、別のMini専用仕事を発注しない。
3. **責任**: Android / Device / Local AIのROCK（OS10/DSP01/CORE02/CORE03/CORE05/SKY21）が共通契約・状態・既存経路の移行を担当。端末adapterはマイク/カメラ/表示/音/センサー/電源/BSP等の実能力と接続を実装する。JOINTは同じPixelの既存owner/job/成果の実往復、Mini/Proの各hardware受入。OWNERは既存の本人承認・予算・外部送信・導入を担う。
4. **入出力**: `lib/rockstar-eve-interaction.ts`の`createEveInteractionSession`が入力後の共通状態を担当。`EveWorkPort.prepare/start/read/stop`は既存OSのowner-bound jobを参照するhost境界で、認証/権限/予算/receiptを省略する共通実行APIではない。既存`lib/workflow.ts`が仕事状態の正本。共通画面は`components/eve-interaction-panel.tsx`、portable packageも同じCoreをexportする。最初の`sky-linux-eve-work-port.ts`だけが旧Linux snapshot/recipe/実行DTOを変換する。
5. **状態**: Coreはdisabled/standby/listening/review/creating/running/result/stopping/unknownを共通化する。host状態を上記へ射影しても未確認を成功へ上げない。unknown/不正出力/古い担当やmodelは確認待ち。端末の完全OFF、声待機、job停止は別観測とする。
6. **保存**: 実Agent/job/成果/usageは既存の本人別storeに残す。Coreの短命参照はid/担当/model hash/依頼だけで、台帳/実行権限ではない。hostの保護storage/namespaceを注入しaccountを混ぜない。旧Pixelの`smis.mini.voice.pending.v1`はcompatibility adapterから同じkeyを渡して読み、二重コピー/削除をしない。既存会話/鍵/仕事/署名/DBを移し替えない。
7. **失敗**: 端末能力不足はadapterの不足として表示し、専用製品/新しいLLM/別historyで代用しない。host認証/版/予算/stop receiptを満たせなければ止める。結果不明は同じidで再照合し、新jobで再実行しない。画面でhostが変わった場合は旧sessionを終了し、新しいhostへ途中の命令を送り替えない。
8. **復旧/移行順**: 共通Core/画面→旧Pixel接続をadapter化→現在のnative/account/runtimeの同じjob入口へ結合→実Pixelの声/文字/停止/保存→同じCoreのMini/Pro driver、の順。旧経路は互換用と記録し、新規の完成形へ増殖させない。Coreの抽出だけを全OS内の全経路統合、実機や全OS imageの完成にしない。
9. **承認/費用**: 音声認識は承認ではない。確認UIと既存Broker/usage上限を維持し、host adapterが認証/Tool/費用と同じ入力/担当/model/jobを実行直前に照合する。ローカル試験の0円をCloudへ一般化しない。共通契約の月額/従量/持出し/停止を保持、一般ローンチ保留。
10. **合格条件**: CoreにLinux/Pixel専用snapshotや別job engineがない、portable exportが同じ関数、旧adapterで既存仕事/停止/書出しが不変、複数合成hostで同じ状態遷移、余剰id/不正出力/同一jobの版相違拒否、型/lint/portable build/test/Pixel package/全verify。実統合は同じaccount/agent/job/成果が声・文字・native/Webで二重発注なく一致することを別証拠で示す。
11. **残る作業**: 現在はCore抽出と旧Pixel hostへの互換結合。現行native/account入口、全てのWeb依頼経路、Mini/Pro実driverの結合と実音声/電源/実停止は未完了。次は現在のEve/runtimeの同一owner/jobへ音声入力を結び、旧5199を前提にせず実Pixelで受入する。API/OSに存在しない音声機能やhardwareは実装/準備してから能力報告する。

[Miniの起動/待機の詳細](rockstaros-avocado-mini-complete-design.md#mini-hey-eve)と[共通runtime契約](../contracts/rockstaros-portable-runtime.json)を併読する。正式入口は`avoado.si`、Miniは`avocadomini.si`、Proは`avocadopro.si`。共通OSは共通の業務/権限/保存と端末adapterを意味し、異機種へ同一flash imageを適用する前提にはしない。

## Miniの声からEve・smisへ

本人の2026-10-22追加指示による[Hey Eve/Thanks Eveの正本](rockstaros-avocado-mini-complete-design.md#mini-hey-eve)を参照。Hey Eve→依頼の確認→Eveの担当作成→smisで同じ仕事の実行/出力→Thanks Eveで指定jobの停止照合→待機。完全電源断と音声待機を分け、Pixel前景ASR/本人用LinuxとMini AON/実機を別受入にする。一般ローンチは保留。

## 2026-10-22 — ユーザーがEveで作り、smisが3方式で実現する共通環境

本人の最新指示は、便利にしたいユーザー自身がEveで担当を作り、開発側はそれを実現する環境を作ること。開発側の固定用途集を製品の上限にしない。Eveは目的/役割/必要な入力・処理・道具/結果を具体化し、smisは対象・能力・実行先を結び、OSは本人/権限/予算/仕事/停止/保存を強制する。本人が承認した機器内蔵、共通部品の外付け、Mini等からの周辺観測の3方式を共存させる。Pixelカメラを周辺観測の最初の入力として開発し、Miniは同じ画像観測契約へ差し替える。一般ローンチを保留する。

対象を見分けるのは担当と入力を選ぶ工程。目的→必要情報→担当の処理→成果/許可した道具の操作→結果確認→停止/再開を仕事の一周とする。登録した見た目との照合/担当を開くことだけを、任意の仕事の実行完成とは扱わない。今回の初期実装は端末内の見た目照合と本人確認付き引継ぎ。OCR・料理理解・植物状態判定・計測・物理制御は対応処理/実機/個別権限が必要で、接続していない能力は未対応を表示する。[詳細](sky-tools-complete-design.md#smis-three-connection-ways)。

## 2026-10-22 — Skyをsmisへ改名し、無機物・有機物を問わずつなぐ

本人の「skyじゃなくてsmisにしよう」「無機物有機物関係なく繋がるのを目標にする」を最新の明示方針とする。現行の製品表示名は **smis**（旧Sky）。Eveで困りごとから担当を作り、smisが対象・Agent・Tool・実行先を結び、RockstarOSが本人・権限・予算・仕事・保存を支える。お皿・ペン・植物・生き物・本人の記録を物質区分の固定リストで除外しない。実際に使える入力・処理・出力と、対象者の同意や取り付け条件は個別に確認する。名称や接続目標を、全対象への物理適合・未観測の状態取得・生体作用の実現済みとは扱わない。

理由は本人による改名と接続対象の明示的な拡大。既存`/sky`・`/api/sky`・schema/SDK識別子・task ID・保存データを保持し、旧文書のSkyは同じsmisを指す。正式ドメインは`avoado.si`、`avocadomini.si`、`avocadopro.si`のまま。一般ローンチは保留し、今回のsource/UI変更を配備済みとしない。[接続の詳細正本](sky-tools-complete-design.md#sky-object-attachment)。

## 2026-10-22 — 付けた物をAgentの入口にする共通部品

本人の「Eveで皆の負をAgentにしSkyで何にでもつなぐ」「お皿でもいい」「くっ付ければそれがエージェントになる」により、[物への共通部品と接続契約](sky-tools-complete-design.md#sky-object-attachment)を追加した。共通部品は物の識別/実入出力を担い、Eveは役割と仕事、Skyは能力と適合する実行/出力先、OS Coreは本人/権限/予算/停止/保存を担う。物ごとのAI本体の再開発を共通機能の組合せへ寄せる。現sourceは困りごとからの作成と希望接続の保存/候補照合であり、物理部品・市販品実接続の完成ではない。

## Skyエージェントの段階作成（2026-10-21）

## Mini起動・MCU・試験PCBの実装（MAT15）

本人の「基板はなし、そこの設計から」を受け、[開発sourceと受入条件](../systems/rock-star-os/targets/avocado-mini/README.md)を追加。CM5/CM5IO＋Pico 2は卓上参照構成で、Pico用C firmwareのcross-build、Linux USB CDC driver/systemd、既存Eveを同じowner/料金契約で開くclient起動部、76×62mmのKiCad接点/LEDキャリアを実装した。[通信契約](../contracts/avocado-mini-supervisor.json)と[検査証拠](evidence/avocado-mini-native-development.json)を参照。製品Miniのnative OS image、署名/復旧、衛星IP/AP、光学/生体/電池を含むmainboard、実機Eve、200mm同一閉箱の受入、量産releaseは未完了。GPIO flag代用接点やLEDの成功をその合格へ転用しない。


Skyで用途を選び、名前/指示・LLMを設定し、Tool接続の有無を確認してから本人別に保存する。Eveは保存した担当ID/版を同じ仕事へ参照し、OSは権限・見積・本人承認・実Tool receiptを別に検査する。作成/保存は実行や課金を開始しない。[Skyの入出力・状態・失敗復旧・受入](sky-tools-complete-design.md#sky-agent-library)。

<a id="eve-llm-product-identity"></a>
## Eve LLMの製品同一性（2026-10-21本人訂正）

- **目的・利用体験**: EveはRockstarOS内のLLMの製品名。`/os/eve`と互換`/chat`はEve LLMで対話し、同じ仕事の計画・承認・進捗・成果を扱う画面。Skyは能力の発見/接続を担う。
- **責任**: ROCKはEve model profile、評価、仕事との結合を管理。EXTERNALは採用した基盤重み/runtime/供給条件。JOINTは同一jobのモデル案→Sky Tool実結果を受入。OWNERは資料・学習許諾・予算・外部送信・実行を決める。AMCはjob状態、RockstarOS Broker/Engineは権限/実行/費用を保持し、Eveの生成文で承認や成功を確定しない。
- **入出力・状態・保存**: 本人依頼、許可済み資料、Tool schema、model profile版を入力に型付き案・回答・根拠/不明点を出力。jobには版・実行先・資料参照・承認・receipt・usageを保存し、草稿/承認待ち/実行中/結果不明/検収/停止を区別する。原稿や秘密値を既定で学習しない。
- **失敗・復旧・合格**: model timeout、schema違反、権限拒否、費用超過はjobへ理由を残して停止/再計画し、外部作用の結果不明を自動再実行しない。第一合格は同一jobでEveの案→Broker再検査→許可済みSky Tool一件→実receiptを照合すること。自社Eve重み、ニュースの政治的公平性、端末/本番受入は未完了で、基盤model・学習方式・評価閾値を証拠で決める。[モデル契約](llm-evaluation-architecture.md#eve-llm-identity)。

## 共通OSパッケージとEve（2026-10-21）

本人の追加指示により、Eve・Sky・仕事/本人/料金の契約を[共通runtime package](../packages/rockstaros-runtime/README.md)として各hardwareの接続層へ渡す。既存workflow、device認証、暗号化履歴、利用権と見積/予約/usage経路を再利用し、基本料は同一契約で共有する。[目的・入出力・責任・状態・保存・失敗/復旧・受入条件](device-support-architecture.md#portable-runtime-package)と[機械可読契約](../contracts/rockstaros-portable-runtime.json)を正本とする。現実装は既存OS用client runtimeで、native OS image、Mini driver、local model、全hardwareの受入は個別に残る。

<a id="eve-cross-device-sync"></a>

## EveのPixel/Web同一アカウント同期（eve-cross-device-sync）

2026-11-02の接続復旧補足：Androidの認可pollは通信開始時刻を受け取る一方、サーバーは処理時点から90日のexpiresAtを発行する。通信差だけで正規sessionを保存前に拒否しないよう、認可とKeystore暗号文の保存・読戻しに共通の上限検査を使い、90日上限に5分だけ通信/時計差の許容を設ける。サーバーのexpiresAt自体は延長・書換えせず、期限切れ・owner/origin/token不一致・過大期限は拒否する。目的は同じ本人の既存Pixel接続の回復で、モデル実行権の追加ではない。旧登録・仕事・model・private realm・bridge鍵を保持し、失われた通常サイトsessionは本人の明示再承認からのみ発行する。ROCKは互換判定と試験、OWNERは再承認、JOINTは同署名install-rと実画面/保存hashの読戻しを担う。合格条件は通信差再現→修正後通過、期限切れ/上限外拒否、実機既存データ保持とEve実行先表示。実推論と全OS受入は今回の範囲外。証拠はdocs/evidence/eve-noah-publication.jsonのconnectionRepairへ記録する。

同日実機読戻し：同アカウント再接続、既存TLS認証、保存済みモデルのcache-only準備を経て、EveのPixel · Linux／既存担当／Qwen2.5 1.5Bが「接続・準備済み」と表示。34仕事・2model・10agentの内容hashと接続保護4hashを保持、実行中0・追加推論0。Terminalは終了せずアプリ切替で保持し、native同期（最長30分）を再開する。cache照合には確立済みbridgeと同期停止が必要で、30秒の照合選択期限を過ぎた準備は再照合する。仕事の実行品質・無人再起動・全OSの受入は別gate。

**LLMの表示（2026-10-21明示指示）**: 使用LLMはEveと表示し、担当選択は役割名だけ、基盤モデルは選択した端末のmodel inventoryとagent.modelIdから読取り表示、実行先は別selectとする。新しい推論IDや架空のEve重みを作らず既存deviceId/agentId/jobの入力・状態・保存・承認を使用する。基盤が不明ならmodelIdまたは未選択を表示し、別モデルで穴埋めしない。Eve専用の学習重み未作成を説明欄に表示。失敗/復旧は既存の再接続・同一ID再試行に従う。合格条件はEve名の表示、担当切替に伴う実基盤表示の一致、未接続の空状態、既存履歴/権限/入力不変、公開同一source readback。UIの変更を追加学習・実推論合格へ換算しない。

1. **目的**: `https://avoado.si/os/eve`と本人Pixelで、同じ会話ID・仕事ID・成果を参照し、別端末から続きを依頼する。既存Sky/Linuxの仕事を複製実行しない。
2. **利用体験**: WebはSitesのChatGPTサインイン。Pixelの「Webと同じ履歴・仕事を使う」で端末コードを表示し、本人がWebで承認。以後のEve仕事を同期。過去の20件は自動送信せず、本人が選んだものだけ追加。Webは会話選択→接続中Pixel/担当/モデル版確認→内容と端末への文脈転送を確認→実行→同じ履歴と成果を読む。
3. **責任**: Web/PWA/Sites、ROCK、OS10/SKY21/WEB04。Sites認証/配備基盤はEXTERNAL、Pixel/実アカウントの往復はJOINT、端末コード承認・過去仕事の送信・依頼実行はOWNER。ニュースは別担当の公開版v90を保持する。
4. **入出力**: 固定`/api/eve/history`と`/api/eve/device-sync`。Bearer端末sessionのowner/deviceをサーバーで照合。同期DTOは既存Linux job、threadId、revision、SHA、成果・usage。Web→PixelはUUID付きの明示依頼、2000文字以内、最大1200文字の過去文脈、担当/モデルSHA、10分期限を固定。任意shell/API権限は付与しない。
5. **状態**: 未サインイン/コード待ち/承認/接続中/期限切れ/失効、端末準備/処理中/停止/確認待ちを区別。30秒以上古いpresenceではWebから新規実行できない。端末のアプリが動作している間のpreviewで、常時バックグラウンド実行は未受入。
6. **保存**: D1のowner別AES-GCM、HKDF/AAD、server専用keyring。元会話へ安定message IDを追記し、既存Webメッセージは変更しない。Pixel tokenはKeystoreで暗号化したnoBackup領域。リンク済み端末の報告は`linked-device-report`であり、決済台帳・Tool成功・本人承認へ昇格させない。
7. **失敗**: 401で別人のキャッシュ表示を止め、再接続を案内。Origin/形式/量/失効/別writer/古いrevision/違う本文やモデルへの同じID再利用を拒否。通信断は入力と端末成果を残す。公開DBは新6テーブルだけ追加し、旧テーブル/台帳は変更しない。
8. **復旧**: 同じoperation ID・入力hashで再試行し、二重起動しない。再読込みで同じjob/成果を取得。会話削除はrevisionとtombstoneで検証し、replica/待機依頼も削除してoffline端末から復活させない。ローカル端末の元成果は本人が別途管理する。
9. **承認/料金**: SSO、端末コード、過去記録の個別送信、Web→Pixel文脈送信を分ける。ローカル推論のCloud usageは0として表示し、月16ドル契約/課金失効/実請求の合格と混同しない。既存一般ローンチ保留・非金融gateを維持。
10. **合格条件**: owner分離・暗号化・競合・失効・削除復活拒否・重複依頼拒否のfixture/実HTTP、公開sourceとarchive同一SHA、旧URLredirect、実アカウントSSO/端末コード承認、Web依頼→Pixel実推論→Web同じ成果→Pixel続き→同じWeb会話。host/fixture/公開/実機を証拠で分ける。
11. **未決定/次**: 旧Toolsチャットは`?mode=tools`で保持するが全既存チャットの自動移行はしない。多数仕事の一覧上限、常駐/複数実行端末の自動割当、E2EE鍵の端末間復旧は未受入。まず同じ実アカウントと同じPixelの往復を検証してから拡張する。

## 投稿ソースのAPI/MCP受け皿（sky-timeline-receiver）

2026-10-21本人訂正「xの話、こちらはapiやmcpの受け皿である」を優先する。X専用APIの運営契約を製品の必須入口にした前提を修正。主担当WebのROCK（HOME01/WEB04）、Sky/MCPの既存SKY14/15/21へ接続し、X OAuth adapterは任意設定にする。

1. **目的**: 外部が供給する本人用投稿をSkyのHomeで受け取る共通口。API/MCPの接続方式と、X投稿への取得権/供給元契約を分離する。MCPにするだけでXの取得が無料/許可済みになるとは扱わない。
2. **利用体験**: 配信元をつなぐ→既存Skyで接続先をAdd→接続済みMCPから投稿対応先を選ぶ→フォロー中/接続先おすすめを選ぶ→取得内容/料金申告を確認→一度取得→Homeのnative行。全員へX developer app/API枠を要求しない。実際の本人X認可は選んだ供給元で行う。
3. **責任**: ROCKは受信schema/表示/既存MCP slot・prepare/execute再利用/失効表示、EXTERNALは投稿供給元のAPI/MCP・本人認可・データ/費用条件、JOINTは同一接続先の実X投稿取得、OWNERは供給元の選択/認可/取得実行の確認。任意shell/rootやbrowser cookie exportを共通実行口へ追加しない。
4. **入力/出力**: 現行のMCP実装は`sky_timeline_read({source:'x',feed:'following'|'recommended',limit:10})`。既存Connectorのpassport→prepare→一度限りapproval→executeを使う。schema `sky.timeline.v1`、source x、audience owner、feed、fetchedAt、postsを受け取る。直接object/structuredContent/単一text JSONを同じvalidatorへ渡す。各postはid/author/name/text/protected/createdAt/canonical x.com URL。APIも同じenvelopeへ変換するadapter境界を持ち、任意URLを代理取得するopen proxyは追加しない。対応済み個別APIは任意のX OAuthで、任意API全般の自動接続を実装済みとはしない。
5. **状態**: 未接続/対応toolなし/選択/取得内容の確認/一度の実行/取得済み/空/期限切れ/失敗/解除。現在のbrowserはPC接続なしを表示し、Xの取得成功にはしない。MCPの接続だけでX本人の投稿取得権を得たことにしない。
6. **保存**: MCP結果はHome上位hookのメモリだけ。hash切替で表示を継続し、reload/unmountで消え、15分で表示を止める。D1/共有community/公開投稿へ保存・送信しない。device/接続先の失効event・選択変更・解除・unmountで世代を進め、旧結果を再表示しない。OAuth APIの暗号化D1保存とは別契約。
7. **失敗**: schema/audience/feedの違い、古い/未来時刻、過大/重複、危険URL、作者/本文/公開範囲の欠落、MCP isErrorを拒否。投稿のHTMLやtool指示等の余剰属性は落とし、本文はReact textとして描画。取得0件を架空投稿で補わない。
8. **復旧**: 自動実行しない。接続/許可/Tool版を確認して再prepareする。解除はこのページの取得待ち/表示を外し、供給元のアカウントやgrantを解除したとは表示しない。既存MCP接続管理から失効する。途中の取得が完了しても世代/device sessionが変われば受入れない。
9. **承認/料金**: Connector tokenはlocalhostの既存経路だけへ送り、X credentialをSkyへ渡さない。prepareのserver名/toolId/期限を照合し、既存slot/本人確認と一度限りの承認を通す。この投稿試作は提供元がfreeと申告する実行だけに制限し、未承認usage/subscription/unknownは実行しない。free申告は第三者の検証済み価格ではない。Rockの追加X閲覧料金を新設せず、外部契約条件・実費は別管理。
10. **合格条件**: parser合成5件、実ローカルSDK tool→MCP接続→prepare→承認なし拒否→execute→envelope→native post contract→再利用拒否の結合fixture、既存MCP/Worker/UIと全verify。ブラウザのPC未接続・operator APIの任意化・固有配色を確認。合成ツールの投稿は本物のXではなく、本人Homeへ投入しない。実X供給元のAdd/本人認可/実本文/更新/停止は別受入。
11. **未決定/次**: 実X投稿を供給できるAPI/MCPが現在未接続。供給元の対応/料金/本人session/For Youの出所を確認し、同じ接続先で実受入する。自動同期・Cloud/専用Linuxの継続取得・reload後のsource保存・任意API adapter・X公式For Youの同一性は未受入。元の「実際に投稿が流れる」要求は残る。[設定と受入](x-account-setup.md)、[証拠](evidence/x-account-native-feed.json)。

> **2026-10-21 費用と導入の追加指示**: 本人はX表示のために利用者が取得枠/API代を払うことを拒否。利用者ごとのdeveloper app/API契約は不要とし、本人Xログイン/読取り同意だけの導入を基本にする。接続基盤のapp/資格情報/費用は運営の設定である。運営のAPI費用も0が必須かは確認中で、契約送信・クレジット購入・有料読取りを進めない。無料の本人X画面を別に開くことと、独自Homeへの自動取込み成功は区別する。


## 本人X連携とSkyの固有配色（sky-x-account-native-feed）

本人の2026-10-21追加指示で、X本人のフォロー中/おすすめがHomeへ流れる要件と、Xに似た色味/Homeタブを変える要件を具体化する。直前の黒背景/X型構図から、Homeをアイボリー・深緑・ブロンズへ更新し、家アイコンの「ホーム」はRadioアイコンの「Sky」、タブは「あなたへ」「つながり」とする。RQ01〜RQ49、実投稿/機能Add/Eve/鍵/料金と87件監査を維持する。

1. **目的**: 本人のX投稿を既存Homeのnative行に表示する。公開profile/listの旧bearer adapter、公式画面の別viewer、本人OAuthのフォロー中、X自身のFor Youを分け、別viewerやfixtureを実投稿成功へ置き換えない。
2. **利用体験**: Homeの「連携する」→配信元の本人Xパネル→読取りscope確認→X本人認可→同じownerへ帰還→「投稿をホームへ読み込む」→native author/text/time/原文リンク。フォロー中のX投稿にはその出所を明記し、限定公開の印を残す。返信/like等はX原文から行い、Sky内の反応をXへ送ったことにしない。
3. **責任**: 主担当Web/PWA/SitesのROCK、既存HOME01/WEB04/SKY21。Xアプリ/API/契約/取得可能なデータはEXTERNAL、実アカウント受信はJOINT、開発者契約同意/API予算と本人OAuth同意はOWNER。X側の契約・課金を無断で開始しない。
4. **入力/出力**: 固定X OAuth 2.0 PKCE/S256と`/2/users/me`、`/2/users/{本人id}/timelines/reverse_chronological`。scopeはtweet.read/users.read/offline.accessのみ。API shapeを検証した投稿を返し、未確認/壊れた応答から本文や人気を作らない。X For Youの公開取得方法は未確認で要求は残す。Sky推薦やフォロー中で同一For Youを代替しない。
5. **状態**: setup_required/disconnected/認可待ち/connected/reauth_required、取得前/取得済み/期限切れ/429/予算上限/停止を分ける。未設定は実アカウント未接続と示し、連携済みや取得0件を成功にしない。
6. **保存**: 新規sky_x_accounts/sky_x_oauth_states。state hash、owner/cookie binding、10分期限、一度の消費、開始時account revisionを検証する。tokenと本文cacheはowner別HKDF/AES-GCM、用途別AAD。OAuth cookieはHttpOnly/SameSite=Lax/HTTPS Secure。tokenはUIへ返さず、Xのcookie/passwordを取得しない。本文の表示期限は15分、GET/更新/停止はowner認証・no-store、変更はOrigin照合。期限切れ本文は表示しない。DBの物理保持は次の更新/停止までで、production retention/鍵backupと鍵rotationは別受入。
7. **失敗**: invalid-state/期限切れ/別owner/悪いcookie/再利用/余剰scopeは拒否。token更新失敗/401は再接続。429はreset/retry-afterと全体cooldownを守り、同時更新lease、本人/アプリ共通の日次read予約で上限を超えない。参照回数は金額ではなく、実課金の明細や月16ドルへの統合は未受入。
8. **復旧**: GETはcache/statusのみで有料取得しない。明示更新は固定endpointだけへ行い、失効/停止でrevisionを進め、古いworkerが本文やtokenを復活させない。Skyでの停止はtoken/cache/stateを除去する。X側のアプリ権限自体は別途X設定で解除することをUIに明示し、remote revoke成功とは記録しない。
9. **承認**: 運営のOAuth資格情報/保存鍵/登録済みcallbackと`SKY_X_USER_READ_APPROVED=1`・日次上限が全て揃うまで無効。本人が読取りscopeを確認して認可する。実Provider費用の上限とクレジットは本人が設定し、Xデータの再販/二次利用等の契約確認も本人が行う。投稿/DM/フォロー変更の権限は要求しない。
10. **合格条件**: host fixtureでPKCE/state/owner/cookie/一度限り/暗号化/限定公開/同時更新/429/予算/refresh/停止fencing、Workerでauth/Origin/default disabled/owner分離、全verify、browserの独自配色/接続待ち/PC/スマホ幅。実受入は同一本人のOAuth→実投稿→再更新→停止→cache除去→再接続を別記録する。fixtureをライブやPixel OS受入へ転用しない。
11. **未決定と決め方**: X developer app、callbackのprovider登録適合、実API枠と金額上限、本人認可、For Youの認められた供給経路、productionキーとretentionを実環境で決める。今回の実ブラウザではX本人ログイン後の開発者PPU契約画面に到達し、登録名/用途のみ下書き、契約チェック/送信は未実行。本人操作後にclient設定と利用枠を確定する。[運用設定](x-account-setup.md)。


## Homeを投稿そのものにする（home-native-post-frontend）

2026-10-21の本人指示「一部埋め込みとかじゃなくて、フロントの機能がこれ」により、先のtimeline限定試作をHome全体へ拡大する。RQ01〜RQ49、Sky/Eveの責任、料金/権限/鍵/保存の契約は維持する。

1. **目的**: 一つの投稿がニュース、発見、能力/機能/コミュニティーOS導入の入口になる。Homeは黒背景の投稿ストリームを主画面にし、ヒーロー/巨大なカタログや任意機能カードを縦積みしない。
2. **利用体験**: `/`のおすすめ/フォロー中、返信、反応、保存、共有を起点にする。カタログ/Wallet/Marketも同じ密度のネイティブ投稿行として紹介する。PCは左ナビ/中央投稿/右検索とEveの仕事、スマホは一列/下部ナビ/追加メニュー。`#catalog`は同じHome内の検索、`#news-plugins`は配信元設定、`#bookmarks`と`#communities`は本人の保存/鍵付き参加へ戻る。
3. **責任**: Web/PWA/SitesのROCK、既存HOME01/WEB04/SKY21。外部ニュース/モデルmetadataはEXTERNAL、実Provider/実機と公開受入はJOINT、導入目的/実行と費用/公開判断はOWNER。
4. **入力/出力**: 既存social投稿、公開HF catalog、既存Tool catalog、本人feature設定を入力とし、実際の追加状態・設定・Eve draft/既存handoffを出力する。カタログの説明行は作者のSNS発言へ偽装せず、配布元DL数/license/環境/料金を区別する。日時や人気、成果、ニュース内容を捏造しない。
5. **状態**: 読込/未認証/接続失敗/追加前/設定中/保存中/追加済みを実応答で示す。フォロー中・鍵付きcommunity・thread・bookmarkにはカタログ推薦を混入しない。`Add`と実行を別状態にする。
6. **保存**: social/反応/鍵は既存経路、モデル参照はowner Hub、Toolは既存connections、任意機能はowner featureのrevision CAS。DBを新設せず、再読込みで保存済みを復元する。Eveへは期限付き既存session引継ぎを使い、仕事/履歴はEveの既存保存へ渡す。
7. **失敗**: 429/取得失敗は本文の代用品を作らずその項目でエラーと再試行を出す。保存失敗/409は成功表示にせず再取得する。再試行で無断実行/購入を開始しない。
8. **復旧**: Home/検索/本人設定へ戻る。任意機能を外しても台帳/資産/契約を消さず、再追加で既存データを使う。鍵失効や他owner拒否は既存serverで維持する。
9. **承認**: 導入目的は選択時に展開。Addは課金・送金・金融口座・未知modelのdownload/実行を開始せず、Eveの実行先/権限/費用確認へ進む。
10. **合格条件**: source/hostのtype/lint/契約試験/全verify、実browserでnative投稿表示→Wallet設定と保存→reload保持、既存model投稿→Eve handoff、PC/390px/320pxの横overflowなしを別々に記録する。local WebをPixel OS/本番金融/公開合格に転用しない。
11. **未決定と決め方**: X本人フォロー/おすすめの取得は未接続で、Skyの既存投稿と混同しない。外部配信/推薦順位の実データ受入、全投稿種別のUX、本人による最終デザイン評価を次に行う。Xの独自推薦アルゴリズムや全操作の同一性を完成扱いにしない。

<a id="eve-work-desk"></a>

Pixelの最初の実行一周は[Sky/Eve/Linuxの共有仕事と相互TLS](sky-tools-complete-design.md#pixel-sky-eve-mtls)を使う。本人localの同じworkflow/job/revision・モデル版・成果・使用額へEveの表示/操作を結び、旧仕事を複製/再実行しない。debug/本人試用のペア登録と実機受入を、既存accountのCloud同期・全OS・一般公開・実請求へ昇格させない。

<a id="research-integration-timeline"></a>
## 独立調査の現設計への反映とX型タイムライン

利用者の2026-10-21明示指示により、[独立調査の照合](rockstaros-research-integration.md)と[87件の要件台帳](../data/rockstaros-research-reconciliation.json)を実装の入口へ追加した。RQ01〜RQ49と会話/研究の追加38件をruntime編集前に登録。原ZIPは840/900分の草稿で、新規発明・性能優位・15時間完了の証拠ではない。後続の本人指示に従い、Zemaの表示名はEve、HomeとSkyは統合、Wallet/Marketは任意追加、コミュニティー・自分たちのOS作成を製品目的へ含める。旧RQ本文の排他表現でこれらを取り消さない。

1. **目的と利用者**：Skyで人・発見・作品・Model/Agent/Tool・OS構成版を流れる投稿から発見し、追加してEveへ仕事を渡す。今回はtimeline領域だけを本人が開いたXホームの黒背景、約600px列、固定タブ、40px avatar、投稿密度、細線、反応列に近づける。Xアカウントの投稿取得・X独自推薦algorithmの再現と区別する。
2. **利用の一周**：おすすめ/フォロー中→投稿→投稿詳細/返信→いいね/リポスト→自分だけのブックマーク→投稿リンク共有→Model/Agent/OS構成の既存Add→Eve。設定ボタンからコミュニティー作成・鍵参加・OS編集へ進む。Xブランド/他人の実投稿や反応数を試験データとして複製しない。
3. **責任と権限**：ROCKがUI/API/本人分離/鍵/保存/冪等/削除を担当。X取得/issuer/決済/hardwareは各JOINT/EXTERNAL受入。投稿・反応・Addは実行/購入/支払権限を生まない。専用鍵とaccountの両方をcommunity内の投稿/返信/反応/保存の読戻しにも要求する。
4. **入出力/ID/版/上限**：既存social APIへreaction(like/repost/bookmark)、replyTo、thread、bookmarksを追加。投稿UUID、本人profile、親投稿、communityと同じ閲覧権、本文1000字/日100件、page20件、既存cursorを維持。profile表示の`@sky_`は実profile ID先頭8桁由来の識別表示で、X handleではない。view数は実計測がないため捏造しない。
5. **状態と失敗**：読み込み、空、失敗、保存中、保存済みを別表示。反応はbooleanの明示設定で重複送信しても一つ。サーバー読戻しまで確定countを増やさない。返信は元のroot投稿へ一段で紐付け、限定返信を公開root feedへ出さない。存在しない/権利のない個別投稿は同じ404で返す。
6. **保存/保持/削除**：既存D1のsky_social_postsにreply_to、sky_social_reactionsに本人/投稿/kindの複合主鍵を追加（0073）。bookmarkは本人だけに返し、第三者へ一覧/件数を公開しない。親削除は返信/反応を同じbatchで削除。community終了も反応を掃除し、Eveの会話・鍵・請求/成果とは分離する。一般公開の保持/通報/異議/運用は未受入。
7. **offline/再送/不明**：投稿IDを再利用し本文/親/場所が違えば409。返信先のcommunityをサーバーで継承し、別community指定を拒否。保存失敗は再試行へ戻し、偽の反応成功を表示しない。追加pageは重複IDを排除し、タブ変更の遅い旧応答を破棄する。focus時に現在の鍵を再照合する。
8. **更新/互換/復旧**：既存DBをbackupし、70〜72の構造が存在するのにd1_migrations未登録だった局所状態はcolumn/index一致を確認してmetadataだけ同期後、73を適用。既存投稿/OS構成/会話は保持。shared dirty checkoutでmainの新変更を自動mergeせず、commit/統合/配備を別記録。communityのthemeは維持し、このX preview領域は黒いskinを明示優先する。
9. **安全/privacy/承認**：GET/POST本人確認、POST Origin、厳密項目許可、現在鍵/失効とowner投稿制限を維持。keyはshare URLに含めない。Xパスワード/Cookieを収集しない。外部送信・課金・公開・native OS導入のgateは別。キーボード、focus、reduced-motionと狭幅を確認する。
10. **受入と証拠**：local fixture/API/browserごとに投稿、thread、反応idempotency、private bookmarks、失効拒否、親削除、paginationを確認する。型/lint/schema/database/design/baseline/全verifyと実UIの証拠を[今回の記録](evidence/timeline-research-integration.json)へ置く。Web局所合格をPixel/Cloud/本番受入へ外挿しない。
11. **未決定と次の開発**：A16は実効grantと最終sinkのD/Q/M/Fを照合しUNKNOWNを再送へ変えない。A9はdata移転許可と移行/熱/電池/原価を含む実測から配置、A13は成果版/宛先/費用/未確認/次の判断を保持する。既存workflow/Broker/Wallet/成果presenterを再利用し、別の共通shell/root APIは作らない。まず合成/Provider sandboxで反例を実装し、実二端末・含有数量/単価・地域/税・issuer/契約・hardwareが決まってからJOINT受入へ進む。研究算法3案そのものの実装/比較は今回のtimeline合格に含めない。

## Eve：一件の仕事を依頼から読戻しまで扱う窓口

2026-10-20の本人追加要件。主担当はProduct / UXの`ROCK`、追跡は`UXRS01`と既存`SKY12`・`SKY21`・`BIL02`・`OS10`。Eveは利用者の会話と仕事の表示・操作窓口、Skyは能力の選択と接続、RockstarOS Broker/workflowは本人・権限・状態遷移・予算・保存の強制点、Linux/Cloud/Providerは承認されたstepの実行先とする。モデルの提案やSkyでのAddを本人承認・Tool成功へ昇格させない。既存`/chat`、`zema`保存・scope、仕事ID/revision、A2A委任、Wallet予約とusageを再利用する。

### 依頼から実行まで

1. 会話またはSkyからの選択を同じownerの未承認下書きへ結び、目的、必要な入力、期待成果、保存先を本人が確認・修正できるようにする。Skyの選択にはTool/Agent ID、版、接続状態を添える。引継ぎや会話文だけで送信・実行・課金しない。

最初の実行sliceでは、Eveで選んだSky Tool、または依頼文から選べた接続済みToolを、会話モデルの設定から独立して既存の入力確認カードへ渡す。remote会話モデルの見積はToolを選べない自由会話だけに適用し、Tool入力を暗黙にmodel Providerへ送らない。本人がカードで入力と実行先・料金状態を確認して実行し、実際のrunnerの結果だけを同じ会話へ返す。候補のローカル下書きはTool本体の成功と区別する。現行Webの一件の実行証拠は合成記事を`mr-citations`でブラウザ内処理し、結果を再読込後の同じ会話で確認した範囲である。owner永続成果、複数stepの自動連鎖、Provider/端末の実行は後続の受入条件を満たすまで完成扱いにしない。
2. 計画を有限のstepと依存関係として表示する。各stepには担当Agent/Toolと版、入力の出所、送信先、必要scope、実行先、期待する型付き成果、失敗時の扱いを固定する。依存stepが未検収または失敗なら後続stepを実行しない。担当間の引継ぎは同じjob ID/revisionと成果参照を用い、本文の無制限な再配布を避ける。
3. 実行前に料金表の版と単価、step別見積、予約額、仕事と契約の上限、期限、停止条件、外部送信先を示す。見積不能・価格未設定・必要接続未確認の場合は承認可能な実行として表示しない。本人が対象・scope・送信先・最大費用・期限を明示承認したrevisionだけをBrokerがdispatchする。計画変更や新たな費用・権限・送信先は新revisionで停止して再承認を待つ。
4. 端末画面を閉じた後の継続は、実行先が仕事を受領し、期限・scope・残予算・停止leaseを再確認できる場合に限る。端末offlineとLinux/Provider offlineを区別し、再接続時はevent cursorと同じidempotency keyで差分照合する。結果不明の送信や外部作用を無断再実行しない。

### 状態・費用・停止

本人向けには`下書き → 承認待ち → 実行中 → 検収待ち → 完了`と、どこからでも遷移し得る`停止`・`失敗`を表示する。内部の`active/review/completed/cancelled`、委任・queue・予約の各状態は消さず、Eveの表示へ根拠付きで射影する。`停止要求中`、`実行先応答待ち`、`結果不明`は停止や失敗の詳細状態として必ず区別する。単に画面を閉じたこと、stop requestを送ったこと、モデルが停止を述べたことを実行先停止の証拠にしない。

進捗には実行したstep、待っている依存/承認、最後に確認した時刻を示す。費用は事前見積、まだ確定していない予約、receiptで確定した使用額、残上限を別々に示す。stop時は新しいdispatchを止め、許可leaseを失効し、実行先へ停止を要求する。停止receipt・remote task照会・残る外部作用を照合した後に停止確定とする。既に成立した送信・購入・課金は消さず、必要なら補償または本人対応へ進める。

### 成果・保存・失敗復旧

各stepの型付き成果、hash、出所、版、時刻、検収者とjob/revisionを本人別保存に結ぶ。本人が成果を確認して検収するまで`完了`へ進めない。書出しは本人が選ぶ形式と保存先で行い、元の入力と成果を保持する。Eve/Sky以外の対応アプリまたは独立viewerで同じexportを開き、内容とhashを照合できた時だけ「別アプリで読戻し済み」と記録する。export生成だけを読戻し成功としない。

失敗画面は「どのstepまで済んだか」「残った入力・成果・予約/確定費用」「外部作用が成立したか/不明か」「次に本人ができる操作」を普通の言葉で示す。再開は同じ仕事のrevision/receipt/remote taskを照合し、既存成果の再利用、未実行stepの続行、新しい承認を要する再計画から選ぶ。本人別保存の競合、期限切れ、失効、通信断、Provider応答なしでは安全側に待機し、重複送信・重複課金を防ぐ。

### 責任・受入・未決定

`ROCK`はUI、workflow/Broker境界、owner/revision競合、見積/予約/usage表示、停止照合、保存/exportを実装する。`EXTERNAL`はAgent/Tool/Providerの実行と停止・計量receiptを提供し、`JOINT`で同一仕事のsandbox/実機を照合する。`OWNER`は送信先、権限、上限、外部作用、検収を決める。合格証拠は、Sky→Eveの同一owner/job引継ぎ、複数stepの依存順と失敗停止、承認範囲を超えるdispatch拒否、画面を閉じて再接続した同一jobの進捗/usage、stop要求とremote停止証拠の分離、独立アプリでのexport読戻し、失敗後の非重複再開を同一revisionで確認した記録。まず既存Web workflowとfixtureで確認し、Cloud sandbox、Pixel/Linux、公開版はそれぞれ別の受入とする。採用するAgent/Provider、料金表、成果形式、保存地域、継続期限は契約と代表仕事の計測で決める。今回の設計追記だけで全状態のruntime実装や長時間Cloud実行の合格を宣言しない。

<a id="frontend-composition"></a>
## フロントの構図と操作品質

2026-10-20の本人指示「統計・黄金比・デザイナー視点・操作性」による現行設計。主担当Product / UX、HOME01・WEB04・SKY12 / ROCK。目的は、思いついたことを依頼し、進行中の仕事へ戻り、成果を受け取るまでを迷わず操作できること。PC、Webのスマホ幅、Pixelネイティブで同じ情報の優先順位を使い、各端末の入力方式へ合わせる。会社ロゴは既存の銀色avokado、製品名はRockstarOS、SI窓口はEve。

### 構図・文字・操作

- PCは主領域と仕事領域を`1.618fr : 1fr`にする。余白を除いた内容幅の約62:38で、依頼を主役とする設計仮説。950px以下は一列、スマホは依頼→仕事→能力の追加→その他アプリ。カード内の絵はPCで1.618、スマホは可読性に合わせて1.4へ変更する。全要素へ同じ比率を強制しない。
- 色は暖かな白・墨色・銀色を基礎にする。ローズは主操作・現在地に限定。成功/確認待ち/失敗は意味ごとの色と文字を併用する。外部画像/フォントの追加読込、動画背景、装飾の常時アニメーションは追加しない。
- 余白は4/8px単位、見出しと本文の役割を分ける。Web本文入力16px、補足13〜14pxを中心にし、メタ情報だけ小さくする。スマホ見出し32px、PCは最大54px。System fontで日本語と欧文を揃える。
- Webの主要操作は48CSS px以上、Pixelは48dp以上の押せる領域。単位を混同しない。主ボタンは状態につき一つ。フォーカスを可視化し、キーボード、拡大、safe-area、reduced motionに対応する。通常文字のコントラスト4.5:1以上を基準とする。
- Airbnbの発見しやすい分類と余白の考えを参考にし、RockstarOSの仕事・費用・承認に合う構成へする。入力の代わりに大きな装飾だけを見せる構成にはしない。

### 依頼から成果への状態

Web Homeは入力と任意のヒントを受け、既存`writeHomeIntent`で同一tabのsessionStorageへ渡す。TTL600秒・一度だけ消費・本文をURLへ含めない・自動実行なしを維持し、Eveで続きを扱う。入力失敗は本文を保持し、コピーとEveへの経路を示す。仕事は本人APIの実データだけを読む。loading、未サインイン、空、失敗、進行、確認待ち、完了、取消を区別し、絞込・再読込・仕事への復帰を維持する。空の画面を偽の仕事/費用/成果で埋めない。

Pixelは依頼→現在の実行先の要約→「内容を確認」→仕事と成果を優先。長い実行先/モデル選択は本人が開く詳細へ置くが、選択中のクラウド/端末/ツールは常に表示する。既存の実行先選択とモデル設定を引き継ぎ、開閉で選択を書き換えない。音声入力は既存端末サービスで、入力状態/失敗は折りたたみ外の依頼欄へ表示。マイク許可、確認、費用、停止、復旧の責任を見た目へ委譲しない。`Jennifer`の現行画面名はEveへ揃え、保存IDは移行しない。

仕事の作成・変更・実行・承認は既存workflow/Brokerが担当。UIが返すのは下書きや操作意図で、modelの返答を承認/Tool成功へ昇格させない。料金と本人承認・保存・失効/復帰の契約は既存設計に従う。Mini/Pro/相棒にはこの情報順位を適用する設計だが、各画面の実装/物理受入は別で、相棒のSOSは引き続き課金/LLM/通信から独立する。

### 根拠と統計の扱い

黄金比を含む好みは実験の対象や質問/文脈で変わる。[Russellの原著実験](https://pubmed.ncbi.nlm.nih.gov/10742842/)を根拠に、1.618を全員に最適という証明には使わない。採用比率、色、階層はデザイン上の仮説。操作の大きさは[Android公式48dp指針](https://developer.android.com/guide/topics/ui/accessibility/apps)、コントラストは[WCAG 2.2](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)に基づく。

[Tuchらの原著研究](https://research.google/pubs/the-role-of-visual-complexity-and-prototypicality-regarding-first-impression-of-websites-working-towards-understanding-aesthetic-judgments/)は119枚のWebサイト画像を用いた実験で、視覚的な複雑さと典型性が第一印象の美的評価に影響し、低い複雑さと高い典型性が好まれたと報告している。119は画像数であり利用者数ではない。本設計ではここから、重複したナビ/装飾を減らし、馴染みある入力欄と明確な主操作を採用するという推論を置く。画像の第一印象の実験を、RockstarOSの実仕事の速度/完了率の証明へ転用しない。

性能目標はLCP≤2.5秒、INP≤200ms、CLS≤0.1を各端末群の75パーセンタイルで見る。[Web Vitalsの一次資料](https://web.dev/articles/vitals)。これは目標で、ローカル画面表示やbuild成功をfieldデータ合格に数えない。

統計的な選定は、旧版と新版で「依頼を確認へ渡す」「確認待ちの仕事へ戻る」「成果を開く」「費用/実行先を確認する」を同じ条件で比較する。順番を交互にし、端末・初見/継続利用を記録する。課題別の完了率は各参加者の初回一試行を単位にしたWilson95%区間、版間の完了率差と所要時間差は参加者を単位にしたpaired差とbootstrap95%区間、誤操作・戻る回数・見た目の評価/自由記述を合わせる。最初の少人数試験は問題発見用で、統計的な最適性の根拠にしない。確認試験の人数はpilotの分散と最小限必要な改善量から事前決定。重大な承認/費用誤認がなく、課題完了率を落とさず、時間と主観評価の改善が確認できてから広げる。現時点の参加者は0人、比較統計未取得。新しい外部analytics送信は追加しない。

### 保存・復旧・受入

既存データを別DBへ複製せず、フォーカス設定、仕事/下書き、実行先を保持する。Web更新の失敗は前候補へ、Pixelは同一署名の前APKへ戻せる配布物を保持する。Android元checkoutは編集せず、受入済みブランド版sourceへ`toolkits/android-branding/pixel-frontend.patch`をstageし、context不一致では停止する。共通stage入口は`scripts/stage-pixel-branding.py --frontend`。ビルド、主要画面/確認ボタン/詳細開閉、実DB不変、実画面の読戻しを受入条件とする。実行/決済はこの外観受入で開始しない。

検証証拠は[frontend refinement](evidence/frontend-design-refinement.json)。Web source、ローカル表示、Pixel導入、実利用の品質統計、公開/main統合を個別に記録する。全画面へ完成済みとはせず、まずHomeと共通部品、Pixel依頼入口に限る。次はEve・Sky詳細・費用画面の個別導線と、本人/初見利用者による比較評価。

## 通信・ネットワーク共通Core（2026-10-20）

利用者の通信要件を[共通通信設計](network-transport-design.md)へ収録した。目的は端末と管理Linuxの通信状態を分け、同じowner/job/revisionで切断後も安全に再開すること。ROCKは経路・接続状態・冪等照合・進捗差分・費用上限・VPN policyを強制し、EXTERNALはcarrier／衛星／通話／DNS／TLS／Cloudの実通信を供給する。JOINTは実機・回線・Providerの同一条件で確認し、OWNERは有料回線、VPN、外部送信と費用上限を選ぶ。

入力は端末／Linux別観測、IP／DNS／TCP／UDP／HTTPS到達、job/revision、許可済みorigin、cursorと費用上限。出力はonline/degraded/constrained/offline/unknown、再照合時刻、差分進捗、通信量と検証済み外部API費用。owner別にcursor、idempotency key、通知event ID、usage参照を保持し、timeout、順序逆転、時計ずれ、VPN leak、TLS不正では安全側に停止・再照合する。送信直後の切断は結果不明として同じkeyで照合し、外部作用や請求を無断再実行しない。通話・衛星・公開ドメイン監視は個別の実契約／実機gate。BGPとFTPをアプリ共通機能へ加えない。timeout値・Provider・料金単価は実測と契約で決定し、現段階は設計のみ。

## 料金・契約・請求の共通runtime境界（2026-10-20）

RockstarOS Coreは契約account、版付き料金、本人同意、月間/job上限、原子予算予約、使用量receiptの一意性、保存/停止/復帰を強制する。Skyは選択したmodel/Agent/Toolの料金条件を示し、Eveは見積・予約・実測/概算・確定明細・Invoice・問い合わせを本人へ示す。管理Linuxと外部Cloud/Toolはmeterとreceiptを提供するが、その申告だけでOSの権限、請求確定、入金へ昇格しない。単一契約の複数端末からの同時実行は同じcapと枠を原子的に共有する。[詳細契約](sky-billing.md#rockstar-monthly-billing-contract)をBIL02の正本とする。既存Linux CPU/作者料と別Cloud token経路の統合、Provider実請求・入金は未受入。

## 最新再設計と端末・ブランドの統一（2026-10-20）

端末ごとの能力追加は[端末別受入条件](device-support-architecture.md#device-specific-acceptance)と[data/rockstaros-device-adaptation.json](../data/rockstaros-device-adaptation.json)を正本にする。PixelのAndroid権限/Shell/Linux/model/保存/熱・電池、Miniの音声/sensor/本人・場所・着脱/光学・RF・電池、ProのPC資源/model/制作・game/周辺機器、相棒の独立警報/SOS、iPhone/一般PCの既存OS client、時計/TV/ロボット等の実在能力adapterを別々に受け入れる。能力宣言は実機合格ではなく、存在しない入出力を公開しない。

本人の明示訂正により、今のRockstarOS再設計を最新版とし、旧Buildroot OSは良い実装の選択再利用元とする。旧OS完成や旧QEMU合格を現商品の完成条件/証拠へ置き換えない。表示名RockstarOSと既存avokado会社ロゴを統一し、Pixel・avocadoMini・avocadoPro・吊り下げ相棒を共通owner/job/権限/契約/料金へ接続する。端末差は能力と入出力adapterで扱い、同一契約の端末追加による基本料重複を防ぐ。相棒のSOS/独立警報は通信/LLM/課金と分離する。[詳細正本](device-support-architecture.md#current-device-adaptation)。現段階の各実装・実機・請求受入は独立して記録する。

PixelのeSIM追加・料金/契約・支払い方法・専用Linux・Sky/Eveの利用開始は、[OS完成後に組み込むmodule](sim-led-product-architecture.md#pixel-service-setup)としてsource開発中。初回setupは引落0、既存月末請求へ接続し、実eSIM/実機/Provider/OS受入前は既定無効。

## 最新の標準提供：既存OSへ共通RockstarOS環境を接続する

商品の意味は、通信容量を売るeSIMではなく、自分用のcloud Linux・LLM・Agentが追加されるservice profile。携帯の圏外/電源OFF後も、executorが受領済みの仕事を本人承認済みの権限・予算・期限内で進める。LLMがlocalなのは配置先Linuxに対してで、全iPhone内へのmodel搭載を意味しない。PCの前に立たない制作、携帯を持たないやり取り、実利用/検収/収納に基づくRun to Earnを同じ仕事/成果へつなぐ。実行Linuxまで外部通信断なら、導入済みmodelの自己完結処理と、外部作用の待機/再照合を区別する。

2026-10-20の本人追加指示「各端末の専用osを作らなくて済む」「何にでも対応」「このシステムは既存じゃないから発明して」により、標準商品は、eSIM導入から本人専用の共通RockstarOS環境を準備し、既存OSの端末へ接続する方式とする。RockstarOSの中のSky・Eve・管理Linux・OS Coreを共用し、端末ごとの差は能力契約と薄い入出力adapterで扱う。eSIM非対応機器は本人承認した子接続で同じ契約へ追加する。GrapheneOS forkや機種別OS imageは追加のnative系列であり、標準利用開始の前提にはしない。

[発明する起動・接続protocol、アルゴリズム、状態、責任と受入条件](sim-led-product-architecture.md#esim-service-attachment)と[機械可読案](../contracts/rockstar-service-attachment.json)を現在の詳細とする。署名済み接続証明の純粋検証logicは追加したが、発行元証拠、本人/端末鍵、現行契約・失効を照合する呼出側と実機受入は未接続である。eSIM側アプレットは対応発行元と端末での研究対象。iPhoneの完全無操作起動、同意なしのapp導入、全hardwareの全機能は未実装・未受入であり、手動Web起動へ希望を縮小して完成扱いにしない。従来のnative優先説明はその追加系列に限って読む。RQ01〜RQ49、月16ドルの枠付き契約、本人権限/費用上限/持出しを保持する。

## 現行の大元：RockstarOSの中にSky・Eve・Linux

2026-10-20の本人指示「osが大元」「osの中にskyもeveも」「osの中にlinux」に従い、製品全体の大元は**RockstarOS**とする。OSの中に、能力の登録・追加・接続を担う**Sky**、会話・依頼・計画確認・承認・進捗/停止・成果・利用額のSI窓口である**Eve**、対応するmodel/Agent/Toolを処理する**Linux実行環境**を置く。本人・eSIMサービス利用権・権限・予算・保存/復旧・利用量/請求はOSの共通管理へ結び、Sky/Eve/modelへOS権限を移さない。

利用の流れは、Eveへの依頼→Skyで登録/追加した能力の選択→OSによる本人/利用権/権限/予算の確認→対応Linuxで実行→共通の仕事/成果/使用量→Eveで確認。Skyから機能を選んでEveへ渡す入口も同じOS内にある。TerminalはLinuxを直接扱う任意の操作口で、日常の依頼はEveから行える体験を目指す。管理Linuxをcloudに置く場合はRockstarOS内部の実行環境として扱い、外部LLM/providerだけを対応adapter先として区別する。全model本体を端末内へ格納する意味ではない。

Pixel版はGrapheneOS/Android上の対応Linux guestを使う方針、Mini/Proは機種別のLinux/runtime適合で決め、Pixel用binaryを転用しない。既存のLinux計量・LLM・権限・保存コードを再利用する。これは前の「Skyを全体の大元」とする説明を利用者が訂正した設計階層の修正であり、全OS image・全機種・全Cloud/使用量統合の完成宣言ではない。月額16ドルの枠付き共通契約、Eveへの呼称統合、保存済みデータと既存IDを引き継ぐ。

## 正式名称：Eve（イヴ、旧称Zema）

2026-10-20、利用者の明示指示「zemaじゃなくてeveにしよadamとeveのeve」により、仕事・会話・進捗・承認・停止・成果・使用額を扱う製品の表示名を **Eve** に変更する。名前の由来はAdamとEveのEve。既存のSky、Jennifer、月額16ドルと利用枠、本人承認・保存・復旧の業務契約を引き継ぐ。文中の旧称Zemaは同じ製品の過去名として読む。

既存の`/chat`、`zema`利用権scope、保存キー、`sky-zema-core` package、公開済みの関数/schema/ファイル識別子は互換性のため保持する。名称変更で既存の会話/仕事/成果を消したり、新規サービス契約/追加課金を開始しない。過去の受入証拠・配布物の名称とhashは当時の記録として保持する。Web sourceの表示・名乗りと、Android APK/OS image・公開環境への反映は別に受け入れる。

### EveをSIの一つの窓口に統合

同日の本人追加指示「ジェニファーって何すんのeveでまとめて良くないそれ」「aiじゃなくてsiね」に従い、利用者向けのシステム種別は**SI（スーパーインテリジェンス）**、名前は**Eve**とする。Eveは会話・依頼・計画の確認・実行の依頼/承認・進捗/停止・成果・利用枠/費用を見る一つの窓口。Jennifer localは既存ローカルmodel profileの過去の表示名であり、別の製品/追加契約/独立した利用窓口にしない。model/runtimeの技術的な識別・版・実行場所と本人権限は内部で維持し、Eveの設定で確認/選択する。Eveという名称で未実装の推論能力・実行権限・計量接続を完成扱いにしない。

### OS内でのSkyとEveの接続

2026-10-21の本人指示で、Skyの担当・基盤モデル・実行先をEveへ明示参照として渡す契約を[Skyマイエージェント](sky-tools-complete-design.md#sky-agent-library)へ追加した。サービスの設定/revisionと端末の既存能力報告を再利用し、接続解除や版変更時は再選択/再承認する。今回の接続sourceを公開版/Pixel実機/任意Agentの受入へ転用しない。

Skyはmodel/Agent/Toolの登録・発見・比較・追加・接続を扱い、Eveは同じ本人の依頼・計画確認・費用承認・進捗/停止・成果・利用量を扱うSIの窓口。普段はEveで仕事を進め、能力の追加/交換が必要な時にSkyを開く体験へ統合する。Skyの選択/追加だけでは仕事の実行や有料購入を成立させない。

現在のWeb sourceはSkyの選択したTool・依頼文・短命の引継ぎ番号を`/chat?tool=...&thread=...`へ渡し、Eveが一度だけ受け取る。保存済み会話は同じ内部キーで読み、仕事は既存workflow/owner別work_jobsへつなぐ。本人・eSIM利用権・許可されたscope・予算をBroker/実行adapterが確認し、対応する端末内/管理Linux/Cloudの実行先へ渡す。成果/usageを仕事へ照合してEveへ返す到達設計であり、UIの引継ぎだけを全実行先の縦断合格にしない。

現在はWebの引継ぎ/会話保存と管理Linuxの共通job保存がlocalで検証された範囲。全Sky ToolがEveへ統一済み、Cloud/Pixel全経路の使用量が同じ月額枠へ精算済み、Mini/Proの実装済みという意味ではない。実行権限・課金・作者配分・deviceの受入を名称変更と分けて記録する。

## Sky Linux 16の登録・Add・実行・月次請求

2026-10-20の明示指示により、最初は月額16 USDの一プランで一定のAI・Linux利用枠を含め、対象枠の超過分だけを従量課金する。枠の量と単価は未確定。eSIM由来の利用権と専用Linuxを結び、未払い時は新規実行を制限して本人データを保持し、支払い/利用権復旧後に再開する。電子契約とsalt付きチェーン証明を採用する。既存Sky Package/審査/作者・Eve workflow/台帳とStripe transportを再利用した追加source。目的・体験・責任・入出力・状態・保存・失敗/復旧・承認・合格・未決定は[Sky Linux 16の11項目](sky-tools-complete-design.md#sky-linux-marketplace)を正本とする。実eSIM/専用Linux/決済/作者払出し/chain/全OSと一般公開は未受入。

本人用Pixelの複数文章AI/担当の追加・環境準備・共通workflow・持出し・停止は[Skyの追加契約](sky-tools-complete-design.md#sky-multi-model-pixel)に従う。OS imageの完成や任意作者codeの実行とは別で、一般公開保留。

## Skyの本人用Linux配置（2026-10-18）

利用者は追加→環境準備→実行→料金確認→成果持出し→停止を同じSky仕事契約にそろえ、2026-10-19に実行先をPixel本体のLinuxと指定した。画面・仕事の管理・private store・固定GGUF推論を既存Terminal Debian guestへ配置する。先行のPixel画面→PC Linux受入は別証拠。同一Pixelで固定model/文章担当3つの追加、実依頼、費用表示、Download保存、実process停止、Sky終了後の読戻しを限定受入済み。現在は停止済みで、汎用model/任意code/全OSの受入ではない。[11項目の正本](sky-tools-complete-design.md#sky-private-linux-deployment)。一般公開・Cloud課金・全OS受入は保留。

## Sky全体の表示と持出しの共通ルール（2026-10-18）

利用者の明示指示により、Skyの全機能で画面・進捗・成果・エラー・保存ファイルを普通の言葉にそろえる。最初に「何ができたか・何が残るか・次にすること」を示し、処理番号や専門的な記録は必要な人が開ける詳細へ置く。権限・費用・未確認・省略・停止の実態は隠さず、元の入力と成果は保持する。[共通の入出力・状態・保存・復旧・安全・合格条件](sky-tools-complete-design.md#sky-plain-language)。Zoom以外の接続や仕事、今後の端末表示にも適用する。一般公開は保留。 追加の[依頼を中心にする構造](sky-tools-complete-design.md#sky-user-first-flow)に従い、設定と以前の全文を必要時に開く。Pixelの入口/依頼画面から適用し、全画面移行と実行受入は別に記録する。

## Skyの作業別model選定と本人用Zoom端末接続（2026-10-18）

最新の明示指示によりGPT固定を前提とせず、本人の端末でログイン不要のLLM候補をSkyが作業別に実測・推薦する。modelは文章/plan候補だけを返し、OS/Brokerの本人・対象・権限・停止を置き換えない。private Macの最初のadapterはZoomの選択windowから表示文章を一度読むもの。固定bundle/PID/同一AXオブジェクト・15分lease・別読取確認・共通job/review/confirm/cancel・exportを使い、全OS/Pixel/本番の受入へ転用しない。[入出力/状態/保持/復旧/安全/未決定の11項目](sky-tools-complete-design.md#sky-zoom-local-runtime)。作業別の実測選定は、メモリ予算不明や不正な時計・context・真偽値を拒否し、適合判定を順位付けより先に行う。一般公開保留。

<a id="sky-foundation"></a>
## 現行の製品階層：RockstarOS → Sky・Eve・Linux実行環境

2026-10-20の本人訂正により、RockstarOSを製品全体の大元とし、Sky・Eve・Linux実行環境をその内側へ配置する。Skyは能力の登録/追加/接続、EveはSIの依頼/仕事/成果/利用額の窓口、Linuxは対応する処理の実行環境。OSの本人/権限/利用権/予算/保存/復旧を共通に使う。2026-10-18にSkyを全体の大元と記した説明は、この現行方針で訂正する。Web/clientによる利用経路と本人の退出/移行は維持する。

既存Platform Core/Brokerと本人承認、利用権/予算、型付き成果、DB/復旧を再利用する。この階層訂正はOS権限をmodelへ委ねる変更でも、全hardwareへの搭載済み宣言でもない。SIM/eSIMの導入/利用権、RQ01〜RQ49、料金、Provider/Pixel/QEMU/Mini/Proの受入は維持する。[共通契約の11項目とZoom/Planner実装](sky-tools-complete-design.md#sky-foundation)。一般公開は保留。

## 製品のドメイン入口

利用者確認済みの`avoado.si`を総合/Sky、`avocadomini.si`をMini、`avocadopro.si`をProの案内入口として共通化する。接続画面と本人用Zoom Labへ導線を追加し、domain指定を認証/CORS権限や配備済みの証拠へ転用しない。Labはlocalhost限定。[責任と検証](workstreams/05-web-pwa-sites.md)。

## Zoom本人用Labの実行境界

Skyの作成/Add/実行/本人確認/停止をdevelopment/loopbackのtab-local recipeとして先行実装する。共通workflowのrevision/終端拒否を再利用し、public API/storeへの登録経路を追加しない。手入力処理と実Zoom/OS/Broker操作の受入を分け、一般公開保留を維持する。[全Tool詳細設計](sky-tools-complete-design.md#sky-private-zoom-lab)。

# RockstarOS 全体詳細設計

## 共通Brokerの本人確認・権限・安全（2026-10-20）

本人の追加要件を、共通RockstarOS環境と既存OS clientの両方へ適用する。RockstarOS Core/Brokerがaccountと端末の認証、仕事ごとの能力・送信先・資料・期限・予算、個別承認、短期lease、失効、監査を強制する。Skyは能力の選択、Eveは本人に見せる承認・進捗・停止、Linuxは受入済みlease内の実行を担う。modelの出力を本人承認、Tool成功、入金証拠へ昇格させない。eSIM profile/端末鍵/通常session/passkey/支払方法はそれぞれ別の証拠であり、互いの代用にしない。

用途、各actorの責任、入力/出力、状態・保存、失敗/復旧、承認、負例を含む完了条件と実装順は[Security workstreamの共通受入契約](workstreams/04-security-identity-compliance.md#owner-identity-permission-safety-20261020)を正本とする。既存`SIM01`・`SYS13`へ結び、新しい要件番号は起こさない。現行sourceの端末session、署名付きCloud要求、Operator Dock、Broker承認は部分実装で、一般利用者passkey、全資格情報の一括失効、job実行中のlease/失効伝播、実issuer/Cloud/Providerの縦断受入は未完了。一般公開・実課金のgateは維持する。

2026-10-18 avocadoMini R5の追加最低機能: [携帯の新しい形と空間インターフェース](avocado-mini-r5/phone-spatial-interface.md)に従い、RockstarOS共通Coreのowner／端末能力／権限／job／保存復旧を、Miniの空間入力・通知出力・通話状態・生体照合・着脱通信へ接続する設計とする。端末のsensor推定を本人承認や通話成立へ昇格させず、共有空間での個人情報表示は本人確認をgateにする。Mini自身の衛星WAN→Wi-Fi、携行中の空間操作、音声回線はMP01〜06で同一実機を受け入れる。現段階は設計であり、Mini native OS、通話、衛星、空間表示の実機合格ではない。


2026-10-18最新指示: Skyの主軸は本人の選択・拒否・回収・退出を可能にすること。ユーザーが欲しい機能をAgentとして作成し、Zoom等の対応hostへAddする応用層を進める。最初は既存本人jobの持出し/独立閲覧を実装する。[一般ローンチ保留・米国/スペイン/日本/韓国への共有準備](sky-launch-design.md#sky-private-review)を別gateとし、「人の中にAgent」という希望は未実証の長期研究目標としてソフトウェア受入から分離する。

## Skyの本人主導・退出可能性（2026-10-18）

利用者の明示指示で、Skyは本人の選択・拒否・実行できる力を増やし、Sky自体からも退出できる共通契約を持つ。Agent/Provider/対応ローカル実行の選択・交換、送信データ/権限/費用/推薦理由の可視化、停止/失効、本人データ回収、別環境への移行、契約終了/退会を設計・受入対象にする。[目的・体験・責任・入出力・状態・保存・失敗/復旧・承認・SF01〜SF08・未決定の決め方](sky-tools-complete-design.md#sky-user-freedom)を正本とする。

ROCKは既存Broker/Connector/workflow/成果/usageを使い、本人別の版付きexport、独立viewerでの閲覧、停止と新規dispatch禁止、回収/削除記録を実装する。EXTERNALはProvider停止・保持・license、JOINTは実失効と別client取込み、OWNERは対象/移行先/終了を決める。元の権限・secret・購入権を移行先の許可にせず、非互換や結果不明を表示する。eSIM終了時の新規管理実行停止を保ち、期限内本人データの回収を有料資格から分け、電話/緊急連絡/OS基礎機能を保つ。取得済みarchiveはSky通信/sessionなしで読めること、backup復元で削除/失効が戻らないことを受け入れる。設計反映のみで、汎用移行・退会後回収・本番受入は未完了。

## 共通SI CoreとavocadoMini／avocadoProのDevice Profile（2026-10-18）

利用者の明示方針により、Pixel、avocadoMini、**avocadoPro AI専用PC**は同じRockstarOSのSI（スーパーインテリジェンス）サービス、Sky／Zema、owner・job・承認・費用・成果・復旧契約を共有する。Proの主目的はPC上でAI／Agentの仕事を作成・実行・再開すること。入力／出力とlocal処理は実機のDevice Profileで変える。GrapheneOS／Android Terminal／AVF LinuxはPixel版の有力基盤であり、Mini／Proへ同一binaryを搭載する前提ではない。[目的、利用体験、責任、入出力、状態、保存、失敗、復旧、承認、合格条件、未決定の決め方](device-support-architecture.md#shared-si-device-profiles)を共通設計として参照する。Mini R5の現行条件は[統合基本設計](avocado-mini-r5/README.md)を優先し、ProのPC hardware・OS・model構成は未確認。OS componentとしてのDevice Profile／output adapterは設計段階であり、Mini／Pro native OS、空間表示、local LLMの実装・受入を示さない。

同日追加の目的は「PCの前に立たなくてもものが作れる、携帯を持たなくてもやり取りできる」こと。Miniで本人が制作を依頼・修正・検収し、受入済みのProまたは明示承認済みCloudが同じSky／Zema jobの処理を担う。通話・メッセージはMini自身の受入済み通信経路で成立を確かめ、Proやスマートフォンを必須中継点にしない。出力先と実行先の変更、費用、外部送信を本人に分けて確認し、接続断やPro停止時もjob/revisionと既存成果を保つ。[端末間の一周と受入境界](device-support-architecture.md#shared-si-device-profiles)、[Mini OI07](avocado-mini-r5/product-invention-r1.md#試作と停止条件)。実機・通信・制作Toolの成立は未検証。

Pro内部は[Value単GPU、拡大StudioのPerformance単GPU、GB10 Compact研究](device-support-architecture.md#pro-internals)の3候補を同じSky/Zema仕事契約で比較する。価格対抗の入口は16GB GPU/64GB RAM/2TB NVMe、32GB GPUには大きい筐体/1000W級電源が必要、GB10は小型大容量メモリだが別OS/供給/費用gate。どれも設計候補であり、実機SKU、販売価格、NVIDIA供給、Linux/NVIDIA driver、Miniからの遠隔実行を受入済みとしない。

## eSIM継続利用権とSI月額・選択制AI課金（2026-10-18）

目的は、Pixel 10 native SI版をeSIMの申込・導入から始め、契約中だけRockstar管理のSky/Zema/Cloud AgentとLinuxローカルモデルを使えるようにすること。本人は月額サービスと対象標準Cloud LLMの月間token枠を確認し、追加の有料LLM/Agentは版付き単価・見積・上限を個別承認する。eSIMはOS binaryを格納せず、正式署名imageと復旧受入後にexact端末へ導入する。Sky単独Web/PWAは別提供形態として残す。

ROCKは既存SIM claim、Broker、Sky/Zema job、費用予約、usage/明細をつなぎ、EXTERNALはissuer契約event、eSIM profile、Cloud usage、決済を提供する。JOINTは端末・provider sandboxで同じowner/order/jobの開始・終了・復活を照合し、OWNERは契約地域・単価・月間枠・端末操作を決定する。入力は認証済みowner、契約/料金版、eSIM注文と署名install receipt、carrier状態、device ref、job予算と本人承認。出力は`service_activated_at`、Rockstar利用可能scope、残枠/予約、成果、項目別usage/invoice、失効理由である。carrier、月額、端末導入、仕事、請求/入金は別状態で本人別に保存する。

issuerの検証済み契約終了または期限到達時に新規Cloud/Agent dispatchとRockstar管理のLinuxモデル起動を拒否し、圏外時は期限付きoffline leaseで上限を持たせる。既存の承認済み仕事は停止・精算規則を照合して結果不明を再実行しない。汎用Terminal、基本電話、請求/異議/再開、成果exportを端末ごと封鎖しない。eSIM契約復活と支払/本人/端末再照合後に権限を復旧する。月額の起算は明示契約後のservice activationで、追加usageは検証済みjob分だけ月末計上。Cloud標準枠を超えて自動課金しない。端末内Linux tokenはCloud利用量へ算入しない。未決定の価格、token換算、猶予、offline期限、issuer/地域は契約と同一端末の実測で決め、実eSIM・実課金・OS buildの完了とは表示しない。[導入/状態/復旧](sim-led-product-architecture.md#esim-si-subscription)、[料金](sky-billing.md#esim-si-plan)、[端末](device-support-architecture.md#graphene-si-minimal)。

## Terminal／任意ローカルLLMからSky Addへ成果を返す構成（2026-10-18）

利用者の追加指示により、Sky Addは対象アプリのPlugin事前導入を必須としない。RockstarOSまたは本人が起動したSky端末側AgentがOSのアクセシビリティ／画面共有権限の範囲で対象アプリを観測・操作する「端末Agent経路」を第一候補とする。WebだけのSkyはOSの別アプリを直接操作できず、端末実行部がない時は本人が開くSky画面での手入力・私的成果表示へ縮退する。対象画面のアプリID・PID・windowと操作要素を各stepで再確認し、観測と入力、送信・削除等の外部作用を別の本人承認に分ける。modelが提案した座標・文言・手順は非信頼入力でありBrokerの許可へ昇格しない。成果はZema job/revisionへ保存して本人表示後に必要なZoom UI操作だけを実行し、画面上で結果を読戻す。Zoomの公式SDK／OAuth経路は追加の文脈・データ・配布が必要な時に選ぶ。macOSの限定AX研究probeは`/scripts/sky-add-macos-ax.swift`にあり、Zoom実受入やSky/Broker接続ではない。詳細と失敗・復旧・合格条件は[Sky全Tool設計](sky-tools-complete-design.md#sky-add-agent-ecosystem)を正本とする。

Pixel上で利用者がTerminal/Linuxを開いて限定した開発・データ処理を行い、選択したローカルLLMで下書きやplan候補を生成できるようにする。初期imageへ全model weightsを入れず、本人がlicense、model hash、形式、runtime、RAM/保存容量、発熱を確認したprofileを導入・選択・削除する。model出力とLinux guest rootはBrokerの権限やTool成功にはならない。許可されたadapterが成果を型・hash・job ID/revision・作者／model／Tool版・保存scope付きでSkyへ登録し、Zemaが承認・進捗・停止・再取得を扱う。Sky Addは接続先アプリ／端末ごとの能力・origin・scopeを宣言したplugin Agent群を配る構造で、未対応の任意アプリ操作を保証しない。

Agent作者は利用者の具体的な困りごと、入力例、期待成果、失敗時の戻り方を雛形へ記入し、既存Studio／Sky Tool SDKで有限manifestと入出力schemaを作る。local sandboxと本人による実用試験、権限／料金／license審査後にMarketplaceへ公開する。価格・購入権・返金・売上・Provider入金・作者払出しは別状態とし、現行の買い切りJPY／10%手数料だけを既存実装範囲として使う。Cloud従量、月額、Agent成果報酬は未決定。詳細な目的、体験、責任、失敗／復旧、受入は[Sky設計](sky-tools-complete-design.md#sky-add-agent-ecosystem)と[モデル設計](llm-evaluation-architecture.md#user-selectable-local-models)。設計のみで、任意model導入、Linux連携、外部アプリSDK、実販売・払出しの受入ではない。

## GrapheneOSベースの最小SI端末構成（2026-10-18）

Pixel 10 GL066／`frankel`の初期RockstarOSは、Cloud LLM、Sky Marketplace／Agent、Zema、任意のTerminal/Linux、汎用browserを利用者に見せる中心機能とする。Homeを依頼・Agent発見・仕事の三入口へ絞る。GrapheneOS／Androidの起動・通信・SIM/eSIM・権限／隔離・暗号化・Vanadium/WebView・署名更新・backup／復旧は、UIを単純化しても必須基盤として残す。Game、Wallet収益面、Fund、汎用Toolプリロード、ローカルLLM weights等は初期Home／初期imageの必須搭載から外し、既存RQ01〜RQ49、費用予約とusage、独立した応用gateは維持する。browser高速化は実測の原因別に行い、GrapheneOSの保護機能を無検証で外さない。

ROCKはShell／Brokerと同一jobのSky／Zema契約、EXTERNALは上流OS／Cloud Provider、JOINTは同一Pixelの起動・性能・保存・OTA・復旧、OWNERは端末書込み・外部送信・費用承認を担う。入力はowner、端末、job ID/revision、モデル／Agent／Tool版、scope、予算上限。出力は仕事状態、成果、receipt、itemized usage。既存workflow／本人別保存を正本に、通信断・VM停止・結果不明・再起動では同じIDを照合し、無断の再送／Cloud切替／二重請求を防ぐ。見積と本人承認は有料dispatchの前提。初期imageのpackage allowlistと性能閾値は実機測定で決める。詳細な残す／外す構成、実装順、合格条件は[機種設計](device-support-architecture.md#graphene-si-minimal)。設計反映のみでfull OSや実Providerの受入ではない。

## SI Managed Serviceの契約起算と月末請求（2026-10-18）

OS内Sky/Zemaで使うCloud LLM/Agentは、契約account単位のSI Managed Serviceという商材候補で提供する。支払責任者が契約版・料金表・月間上限・支払方法を明示承諾した後、初回有償利用を `billable_started_at` に記録する。SIM/eSIM claim、Marketplace閲覧、無料機能、アプリ導入だけでは請求を開始しない。月末に検証済みusageを集め、OSサービス料金、Agent利用、Tool商品、通信、端末/貸与、税/実費を別lineで示す。既存OS月額は維持し、金額と日割り・最低額は契約決定待ち。[契約・状態・失敗復旧・地域・受入](sky-billing.md#rockstaros-siサービス契約と月末請求の商材案2026-10-18)。

ROCKは本人/支払責任者、契約版、billing period、job ID、usage/receipt、invoice、与信・月間cap、異議・制限を既存Core/Sky/Zema/Walletへ結ぶ。Providerは収納と支払方法を扱い、OWNERは最初の国/顧客層・料金・与信を確定する。見積や承認を省略せず、利用済み＋未確定予約＋今回最大見積がcapを超える時はdispatchしない。失敗・結果不明・二重usage・支払失敗・異議・解約後最終請求を別状態として保存し、同じ契約/usage/invoice IDから復旧する。米国内法人向けは先行pilot仮説、日本等は現地契約/税/支払手段の別受入。端末付きプランは機種別OS/復旧受入後に判断し、販売済みとはしない。


## SI専用OSのクラウドLLM・Sky Marketplace・Zema統合（2026-10-18）

**目的と体験**: SIはスーパーインテリジェンス。RockstarOSのHomeをクラウドLLMへの依頼入口とし、同じOS内のSky MarketplaceでAgent/Toolを発見・条件確認・接続し、Zemaで一件の仕事を見積、承認、実行、停止、成果・使用額の確認まで進める。単体Sky Web/PWAも同じ本人・仕事契約を使う。SIM/eSIMはサービス利用権の入口であってSIの略語やOS格納先ではない。初期画面はこの仕事を優先し、RQ18の基本アプリとWallet/Game等の応用契約は維持する。[画面とruntimeの一体設計](rockstaros-1.0-architecture.md#rockstaros-再設計一つの仕事を端末間で完了するサービスos)。

| 項目 | 統合契約 |
| --- | --- |
| 責任 | ROCKはHome/Sky/Zema画面とBrokerの本人・scope・予算・receipt照合を担う。EXTERNALはLLM/Agent APIと計量証拠を提供する。OWNERは接続・権限・見積上限を承認し、JOINTで機種別native動作を受け入れる。モデル出力は承認やTool成功を代行しない。 |
| 入出力・状態 | owner、entitlement、agent/tool/model版、job ID/revision、request、見積・上限、実行先を入力とし、`draft → estimated → awaiting_approval → queued → running → review → completed` と停止・失敗・結果不明を表示する。成果、provider receipt、予約・使用額、itemized usageを同じjobへ結ぶ。 |
| 保存・失敗・復旧 | 本人別の既存workflow/usage/receiptへ保存し、端末間・再起動後は同じjob ID/revisionを再読込する。offline下書きとcloud実行中を区別し、timeout/結果不明では同じIDを照合して二重送信・二重課金を防ぐ。stop要求とprovider停止確認を別状態にする。 |
| 承認・合格 | 有料実行前に単価、送信先、scope、見積、上限を明示し、許可済み予算を超えない。host/fixtureでは既存workflowの状態一致、Provider sandboxでは実応答・usage/費用・失敗復旧、Pixel nativeでは同一imageの起動・権限・保存・復旧を別々に証明する。設計保存だけで実Provider、OS image、実機を合格にしない。 |
| 未決定の決め方 | 対応Provider・料金・保存地域・機種別UI/Terminal/Linux能力は、契約と同一条件の計測・実機受入から決める。browserの遅さは起動、入力反応、結果表示を同じ端末・回線・仕事で測り、WebView、画面、通信、Provider待ちに分ける。GrapheneOSの隔離・更新・必要なWebViewを維持し、Linuxは対応端末の任意で隔離された能力とする。 |


## ランドセル防犯ベルサイズDevice Profile（2026-10-14）

利用者の明示指示により、ランドセルへぶら下げ、外して手で持って話せる防犯ベル程度のhardwareを、RQ48の限定Device Profileとして追加する。`avocado Companion`は仮称。二つの目で状態を伝え、明示操作中だけマイクを開き、保護者スマホ／Wi-Fiから許可済みCloud Agentへ接続する。SOS入力と独立local alarmは取り外す本体側に置き、会話・通信が落ちても使える。full Android／LinuxやR5の空間表示を小型筐体へ詰めず、署名済み低消費電力firmwareと保護者端末／cloud側RockstarOSへ責任を分ける。screenless safety比較案を残し、家庭側service dockは有線給電・診断候補。任意のphone tap／typeはalarm経路へ含めない。[目的、体験、責任、入出力、状態、保存、失敗、復旧、受入、未決定事項](avocado-schoolbag-safety-device.md)。設計段階であり実機・認証・製造・販売の受入ではない。

## Sky単独提供とNFC・eSIM・iOSの共通入口（2026-10-12）

指定チャットの最新明示方針へ同期。SkyはOS完成やeSIM購入を待たず単独Web/PWAとして使える品質を目指し、NFCは既存Skyを大学名・おすすめ付きで開く。任意eSIMのclaimも同じ本人・購入・接続・Zemaへ合流する。iOS初期提供はbrowser/PWA、native/App Clip/App Intentsは後続候補で、eSIMによる自動導入・無制限常駐を約束しない。[目的・利用体験・入出力・状態・保存・失敗/復旧・承認・責任・進捗・合格条件](sim-led-product-architecture.md#sky-shared-entry)を共通仕様とする。main、local大学版、指定公開Siteと別Sky Siteの証拠を区別し、仕様保存で本番受入を更新しない。

## GrapheneOSの長所の再利用（2026-10-10）

Pixel版のGrapheneOS／Android基盤、権限と隔離、AVBと署名更新、対応端末のTerminal／Linuxを再利用し、RockstarのHome／Sky／Zema／Agentへ接続する方針。Linuxは開発環境と限定Toolの任意実行先候補であり、製品全体のVM移行やhost rootの共通API化ではない。既存Broker、workflow、本人・予算・保存契約を維持する。[目的、利用体験、責任、入出力、状態、保存、失敗、復旧、承認、合格条件と未決定の決め方](device-support-architecture.md#graphene-reuse)を多機種設計へ統合した。設計反映のみで、Linux adapter、AVF実機、性能、full OSの受入は未完了。既存QEMU／Pixel／clientとSIM/eSIMの各gateを保持する。

2026-10-07: eSIMに結び付く登録済みgateway鍵の保有証明をCloud APIへ接続。要求単位の署名・期限・replay拒否・既存利用権/失効を実装する。秘密鍵は送信しない。eUICC保管・実端末adapter・データ非保存は別受入。[目的・状態・保存・失敗・復旧・承認・合格条件](sim-led-product-architecture.md#esimに結び付く端末鍵でのcloud-apiアクセス2026-10-07)。

## メインSIM通信を使うクラウド提供形態（2026-10-07）

任意のeSIM提供形態では、本人が設定した既存メインSIM/Wi-Fiでclientから共通クラウドへ接続する。eSIM内の専用OSとRockstarOSを区別し、Home/Sky/Zema・本人・利用権・仕事・予算/usageを再利用する。eSIMごとのクラウド複製や通信回線購入は共通要件にしない。既存`service_only` claimと実eSIM導入証拠adapterを分け、後者の署名・注文照合は保持する。目的、体験、責任、入出力、状態、保存、失敗、復旧、承認、合格条件、未決定の決め方は[共通設計](sim-led-product-architecture.md#main-sim-cloud-service)を正本とする。設計のみで、browserによるSIM指定、実eSIM発行、実機、本番課金の受入は未完了。

## AWSクラウド導入・提携準備（2026-10-05）

利用者の明示指示でAWSをクラウド導入・技術提携の優先相談先にする。相談主体はavokado llc／米国（本人申告）。[AWS提携設計](provider-contract-readiness-20260930.md#aws-partnership-preparation)に目的・利用体験・入出力・状態・費用・保存・復旧・責任・受入・未決定条件を定義する。初回は既存管理系からAWSの代表Agent実行へ接続し、その後の管理系移行を別受入する案。本人/利用権・Broker・Wallet・Zemaの契約は保持し、AWS認証やmodel出力を本人承認へ昇格させない。adapter実装、AWS配備、提携成立、顧客課金、OS実機受入は未完了。

## 2026-10-05 選択可能なeSIM提供形態の課金境界

最新の明示方針は、対応可能な端末・提供形態で選べるeSIM経由のRockstarOSクラウドOSと、そこでのSkyエージェント利用に対する従量課金。製品全体をこの方式へ一本化せず、eSIM不要のWeb/app、native OSの端末内LLM/offline agent、local/cloud併用を維持する。通信量販売を中心にせず、本人別の利用権・見積り・上限・承認・実行・停止・保存/再開・利用量・請求照合を一体の体験にする。具体的な責任、入出力、保存、失敗、復旧、承認、合格条件、料金の未決定事項は[共通設計](sim-led-product-architecture.md#2026-10-05-cloud-os-business-direction)を参照する。既存Tool/SDK/Walletを再利用し、端末内LLMとPixel/QEMUの受入は独立して保持する。これは設計変更であり、本番実行・課金や実機対応の完了ではない。


版: 1.0 / 2026-09-18
対象: RockstarOS Core、Web／PC、Linux／QEMU、Android／Pixel、Sky、Zema、Local AI、Tool、Wallet、運用、更新・復旧。

> 2026-09-24更新: rocketstar、A-LINK、avokado、colonyまで含む最新の統合設計基準は[RockstarOS 設計書完全版 v1.0](rockstaros-complete-design-v1.0.pdf)。本Markdownはrepository実装、既存component、詳細正本への入口として保持する。PDFの全文検索用[抽出テキスト](rockstaros-complete-design-v1.0.txt)と[完全性記録](../data/rockstaros-complete-design-v1.0.json)を同じ版として参照する。PDFの「完全版」は設計範囲の被覆であり、実装・実機・飛行・量産の完成宣言ではない。

2026-09-24追加保存: [rocketstar完全版 R1.0・全付録](rocketstar-design/README.md)は、44ページ・35章のロケット統合設計と、A-LINK、OS、コロニー、端末ボタンの設計履歴をまとめる。ロケットの製造・実機・飛行受入は未完了。これらは設計資料であり、このrepositoryのOS componentやToolを追加した記録ではない。

[OS v1.0付録原本](rocketstar-design/outputs/RockstarOS_Complete_Design_v1_0/README.md)を今回受領し、既存PDFとのSHA-256一致と付録manifest 59件を確認した。7 schema、DDL、例、要求台帳、構造検査・再現記録を設計アーカイブとして保存する。当初の「付属原本未受領」は受領済みに更新するが、runtime導入や追加の実機受入は行っていない。原本のE3・別Hub前提は[現行R5](avocado-mini-r5/README.md)へ適用せず、R5 Device Profile・adapter統合は未完了のまま保持する。

この文書は「OSに何が入っているか」だけでなく、利用者の操作がどのcomponentを通り、どこへ保存され、失敗時にどう止まり、どの証拠で合格するかを一続きに説明する。各機能のfield単位・機種単位の正本はリンク先に置き、この文書を全体の読み方と依存方向の正本とする。

## 1. 一言でいうと

2026-10-01の製品方針更新: **物理SIM/eSIMを購入・有効化するとRockstarOSと統合サービスへ簡単にアクセスできる製品**を中心にする。SIMは通信とサービス利用権の提供入口であり、RockstarOSバイナリをSIM内に格納する前提ではない。正確な端末に署名済みOS導入・復旧経路が成立する場合はOS版、それ以外は既存OS上のclientまたはブラウザ版へ案内する。既存のゲーム、生活、ハードウェア設計は応用先として維持し、このSIM/eSIM主導サービス導線と競合する優先入口にはしない。

**RockstarOSは、SIM/eSIMをきっかけに一度だけ本人登録し、Sky・Zema・Agentへ接続して、cloud作業の進捗・費用・成果を同じ利用体験で扱うAIサービス基盤である。**

SkyはAgent/Tool・接続・本人・仕事/成果・費用の共通基盤、Zemaは依頼から成果確認までの管理面、RockstarOS Platform CoreはSky契約に従い端末で許可された仕事を実行・保存・復旧する環境である。

## 2. 利用者の一周

2026-09-27のSky Market決済追加: 有料の審査済みPackageは「購入」→Stripeの支払い画面→購入履歴で照合→接続先確認へ進む。作者は「販売する」で受取先と価格・条件を登録する。Web API／D1が注文と利用権を管理し、Stripe Connectが決済と10%のSky手数料配分を担う。カード・銀行情報はStripe画面で扱い、LLMの判断だけで支払いを成立させない。これはAgent/Tool marketplace決済の再利用可能な部品であり、SIM/eSIMによるRockstarOS利用権購入とは別商品・別契約である。後者は販売チャネル、通信料金、サービス権利、cloud AI usageを明細上で分離する。[決済設計](sky-billing.md)は有料Package用であり、SIM/eSIMのcarrier billingやクラウドAIのproduction usage billingを受け入れた証拠ではない。

```text
購入チャネルでRockstarOS対応SIM/eSIMを選ぶ
  ↓ 通信条件・利用権・料金を確認する
SIM有効化／対応SIM追加を行う
  ↓
Rockstar identityへ一度サインインし、購入権利を結ぶ
  ↓ 正確な端末・型番のOS導入条件を判定
署名済みOS導入（対応時）または既存OS client/browserで開く
  ↓
HomeからSky・Zema・Agentsを直接使う
  ↓ 料金・見積・上限を確認
Zemaで依頼し、必要予算を明示承認
  ↓ 足りない情報を確認
計画・単価・概算を見る
実行前に予算を承認する
実行する
  ↓ 端末 / PC / Cloud / Provider
進捗を見る・止める
  ↓
結果を確認する
  ↓
成果、実行receipt、費用、検証済み収益を別々に保存する
```

SIM/eSIM profileの有効化はRockstarOSの導入成功・service entitlement・Agent権限を意味しない。チャネルから受け取る注文/activation proofを本人、対象プラン、端末、service entitlementへ束ね、通信事業者の回線状態とOS/client導入状態を独立に表示する。未対応機種はeSIMが入ってもfull OS版とは表示せず、利用可能なclient/browserへ案内する。

利用者の会話中の「はい」だけで、送金、外部投稿、広告、DM、物理実験、出願等を承認しない。承認画面には対象、変更内容、送信先、費用上限、期限を固定して表示する。

## 2026-10-02 共通契約の実装統合

Webと公開PreviewのSky→Zemaは、公開package内の`handoff.js`を共通sourceとして使用する。v1のTool ID、本文上限、local provider正規化とsession上限を共有し、WebのUUID/一回消費/10分TTLはhostが強制する。不正・期限切れの保存は除去し、再依頼で復旧する。公開Previewは既存の`local`表記を維持し、remote・不正timestampは共通validatorで拒否する。双方の契約試験と公開packageの試験をroot verifyに含める。UIのセッションがready/completedであることは、Broker権限・本人承認・実機受入の代わりにはならない。

AI通信、MCP、owner/revision保存、Stripe通信の共通化も同じ原則で行う。業務状態や商品別価格/在庫を共通helperへ埋め込まず、[Tool詳細の共通基盤](sky-tools-complete-design.md#共通基盤の統合2026-10-02g04)と[統合記録](git-consolidation.md#2026-10-02-共通実装の統合g04)を実装入口とする。DB migration、OS image変更、backup format変更はない。既存schema/versionとPR revertを復旧経路にし、Node/mockの合格をnative/Provider/本番の合格へ昇格させない。

## 3. 三つの実装を一つと呼ばない

### Web／PC

現在のHome、Sky、Zema、CSV、Wallet、Market、Studio、Settings、各APIを提供する。認証された利用者ごとにD1へ仕事状態や台帳を保存し、原稿・相談本文・秘密鍵は必要以上にserver保存しない。PC ToolはMCP Connectorを介して本人PCで実行する。

SkyのココナラToolは応募前チェックと本人用案件台帳を一つの画面で提供する。代表者の受注と制作担当者への発注・支払を別の記録にし、固定報酬・支払期日・権利・修正範囲・顧客説明・規約確認の参照を担当開始前に保存する。見込収支と手入力の入出金を分離し、ココナラの実取引、外部送金、Walletの検証済み収益には接続しない。[Tool詳細](sky-tools-complete-design.md#9-ココナラ)。

### Linux／QEMU

Buildroot、read-only rootfs、書込みdata disk、専用UID、local IPC、署名Tool、Registry、Runner、Wallet、A/B更新、backup、復旧のnative契約を検証する。QEMU合格はPixel合格ではない。

### Android／Pixel


#### Pixel Shellの画面契約（2026-10-09）

利用者のGitHub正本に基づく開発・デザイン改善指示を受け、既存Webの中性デザインへ揃える。目的は、依頼・Tool選択・仕事・接続設定を長い一枚のフォームから分離し、普段の操作を見つけやすくすること。`dev.rock.shell`の4入口は「ホーム」「Sky」「仕事」「設定」。ホームは依頼下書きと実際に保存された仕事の件数、Skyは端末Toolと接続済みAgent、仕事は依頼・進捗・成果・クラウド利用状況、設定はアカウント・端末・復旧を担当する。クラウド見積や開発設定は必要時に展開する。背景`#0b0d10`、面`#14171c`、罫線`#2b3037`、文字`#f4f6f8`を基本とし、48dp以上の操作領域、文字拡大、画面端・キーボードのinsetを扱う。

入力はホームの未送信下書き、Skyの選択、Brokerの状態。出力は本人が確認できる依頼編集画面と実際の進捗であり、ナビゲーション自体は実行しない。ホームから仕事へ引き継ぐと実行同意を解除し、既存の異なる下書きがある場合は置換確認を要求する。下書きはタブ移動と構成変更の間だけメモリーに保持し、端末の永続保存や外部送信は行わない。画面選択のみinstance stateに保持する。Brokerが仕事・Tool選択・鍵・課金上限・本人承認を所有し、Shellへ新たな通信・DB・鍵の権限は追加しない。見積・Wallet予約・最終承認の既存契約も維持する。

状態は未連携、連携待ち、接続先未設定、接続失敗を区別する。接続先未設定ではアカウント連携を開始せず、通信障害と誤表示しない。Local AIの`no_model`はモデル準備待ち、`ready`はruntimeの報告として示し、推論やTool成功へ昇格させない。 端末能力snapshotのLocal AI API版は`contracts/local-ai-runtime.json`（現在v4）と一致させ、旧版・未知の新版・不正trust・readyとmodelLoadedの矛盾は拒否する。`os:check`で版の一致、実機試験で新しいsnapshotの表示を検査する。失敗時は本人の入力・保存仕事を維持し、更新・再確認を選べる。復旧と実行停止は設定／仕事から開く。更新は保持済み署名による非破壊APK上書きが前提で、署名不一致時のデータ削除はこのUI変更から許可を推測しない。

合格条件はShell/APIのSDK build・lint、4画面の表示、下書き保持、未入力拒否、置換確認、同意解除、自動実行なし、同一署名の実機上書き前後でTool選択・仕事件数が維持されること。`ShellNavigationTest`はBrokerを初期化せず、前後の仕事件数と選択を照合する。アプリ受入をfull OSやサービス契約の合格に転用しない。クラウド接続先・model配布の未決定は各既存gateで判断し、UIだけで解決済みとしない。


`dev.rock.shell`を利用者UI、`dev.rock.automation`をheadless Broker、Local AI、Tool、Operator Agentを別APK／別UIDにする。現在は既存Android上の試験署名APK受入までで、Pixel向けRockstarOS full imageは未完成。

#### eSIM device entitlement gateway

端末はeSIMチップ内でRockstarOSを実行せず、Sky注文で指定された初期Agent Packの利用権を、検証済みprofile導入証拠と注文ownerに結び付ける。Workerの5分challengeにはowner、order、profile digest、device ref、install receipt hash、starter pack ID/version/manifest hashをまとめた`receiptContext`を含める。Android Coreの`EsimDeviceEntitlement`はそのchallengeと、privileged installer adapterから受けた同一profileの`verified + installedEnabled`証拠を照合し、hardware-backed P-256鍵だけでdomain-separated ES256 receiptを署名する。署名はAndroid JCAのDERからWebCryptoの64-byte P1363へ変換し、server canonical field orderで送る。profile secret、ICCID、EID、SIM状態一覧を読む処理は含まず、`READ_PHONE_STATE`も要求しない。

Brokerは署名APIを本人の認証済み注文へだけ結び、serverは一度だけentitlementを保存する。challenge期限切れ、owner/order/profile/device/install hash不一致、installer証拠なし、software/revoked/non-P-256 key、package hash driftは停止し、key/installer authorityの受入前にactive表示へ昇格しない。鍵と証拠はclient側へ永続保存せず、serverは署名対象hashと利用権状態を注文と共に保持する。同じ注文の再送は既存状態照合にし、二重有効化しない。

Android Shell API v5は、サインイン済み注文画面から受け渡されたchallenge JSONをexact-package/signer検査済みShellからBrokerへ渡し、BrokerがUUID、5分以内の期限、canonical 32-byte nonce、Google attestation authority、`dev.rock.automation`を検査してnonce由来aliasのAndroidKeyStore P-256鍵を準備するsource経路を持つ。同じnonceでの応答消失・再試行では同じalias/keyを再利用し、公開鍵と上限付きDER証明書チェーンをShellへ返す。結果は常に`pending_server_and_install_proof_verification`であり、回線・利用権を有効化しない。AIDLにowner IDを書き込む引数は設けない。Brokerがchallenge JSON内のowner値を本人確認に使うこともなく、Workerの認証owner・challenge store・server verifierが最終判断を続ける。現在のShell操作は開発用の貼り付け手順であり、ブラウザ認証からアプリへの自動handoffやAIDLからWorkerへの投稿ではない。

Android Core JUnit 51件とJava／TypeScript共有canonical vector、Worker/D1 API 424 assertions、隔離JVM verifierのunit/upstream試験は合格。これはJVM／host fixture受入である。今回AIDL v5、Broker nonce-bound key preparation、Shell開発UI、同一challenge retry sourceを追加し、OS source-contract／Android architecture checksは通過したが、Android SDK platform/build-toolsがなく、AIDL/APK compileとinstrumentationは未実施。OEM/carrier eUICC install evidence source、challenge自動handoff、receiptを伴うサーバーsubmit、private TLS verifier ingress、provider sandbox、実機利用権表示は未受入。完成条件は同じowner・注文・profile・device・starter packを結ぶattested hardware-key receiptと実機profile install evidenceを契約sandboxで受け入れ、署名失効・端末交換・再起動・再送を検証すること。詳細は[Android/device workstream](workstreams/07-android-device-local-ai.md#esim-device-entitlement-gateway)と[provider contract readiness](provider-contract-readiness-20260930.md)を参照する。

## 4. component構造

| component | 持つ責任 | 持たない権限 |
| --- | --- | --- |
| Device Support Package | boot、driver、電源、熱、hardware鍵、AVB、OTA、純正復旧 | Toolや特定modelの業務判断 |
| Shell / Home | 画面、入力、accessibility、信頼済み承認画面への導線 | DB、鍵、Wallet、任意Toolへの直接権限 |
| Platform Core / Broker | owner、component認証、capability、承認、仕事、receipt、保存、更新gate | UIの都合による権限省略 |
| Local AI Adapter | 選択されたmodelを読み、閉じたschemaのplanを返す | Tool直接実行、権限付与、台帳書込み |
| Agent Runtime | plan検証、有限step、queue、停止、再開 | manifest外の操作、無制限自律実行 |
| Sky | Tool発見、比較、接続、実行場所選択 | Broker管理権限、秘密の無断送信 |
| Zema | 依頼、質問、計画、進捗、停止、結果、履歴 | 会話だけによる高risk承認 |
| Tool | 宣言した個別処理 | 他Tool、他owner、OS内部への横断アクセス |
| MCP Connector | 本人PCのMCPを認証付きで接続 | 任意host・任意commandの暗黙実行 |
| Provider Adapter | 外部serviceのcapabilityとreceiptを共通化 | 未宣言機能の擬似実装 |
| Wallet | 収益、費用、hold、取消、精算の照合 | seed保管、包括送金、推定収益の残高化 |
| Operator Agent | 端末状態、限定命令、監査 | 任意shell、私的内容、Wallet、backup鍵 |

依存方向は`UI → Broker → Runtime → Tool／Provider`。ToolやUIがCore DBへ直接書く逆方向を作らない。

## 5. identityとauthority

混同してはいけないID:

- `ownerRef`: データと仕事の所有者。
- `deviceRef`: 実行端末。
- `componentId`: Shell、Broker、Tool、Provider等。
- `workId`: 利用者が確認する一つの仕事。
- `runId`: 一回の実行。
- `attemptId`: retryを含む一回の試行。
- `operationId`: 外部作用を重複させないID。
- `artifactId`: 入力・成果の参照。
- `receiptId`: 実行や照合の証拠。

componentはpackage、署名者、UID、version、API range、capabilityをBrokerが実体と照合する。表示名やmanifestの自己申告だけを信頼しない。ownerは認証gatewayまたは端末の信頼済みidentityから決め、request本文のowner IDを採用しない。

## 6. capabilityとTool接続

Toolは少なくとも次を宣言する。

- Tool ID、版、作者、署名、license
- 入力・出力schemaと最大size
- 必要な権限と外部送信先
- 実行場所: device、PC、Sky Cloud、Provider
- effect: `local-pure`、`remote-read`、`external-write`
- timeout、停止、retry、結果不明の照会方法
- 料金、費用上限、課金単位
- 成功確認とreceipt形式
- 保存内容、保持期間、削除方法
- offline可否、resource上限、対応Core/API範囲

導入時と実行直前の両方でcapabilityを確認する。古いcache、未知の必須capability、署名・版不一致では動かさない。

## 7. 仕事の状態

利用者向け状態:

```text
draft → ready → active → review → completed
  │       │       │         └→ active（修正）
  │       │       ├→ waiting
  │       │       ├→ failed
  └───────┴───────┴→ cancelled
```

実行step状態:

```text
pending → queued → running → succeeded
                    ├→ needs_review
                    ├→ failed
                    ├→ cancelled
                    └→ uncertain
```

`waiting`にはapproval、network、resource、provider、reconciliation等の理由を付ける。`uncertain`は外部で成立したか分からない状態であり、失敗として自動再送しない。完了したstepを別の結果で上書きせず、新revisionまたは取消eventを追加する。

## 8. 一回の実行

1. owner、Tool selection、request hash、revisionを保存する。
2. Local AIまたは有限recipeが閉じたschemaでplanを作る。
3. BrokerがTool、入力、権限、effect、費用、実行先を再検証する。
4. 必要なら信頼済み承認画面でapprovalを発行する。
5. transaction内でattempt、boot identity、期限、fencing tokenを保存する。
6. Toolへ最小入力だけをdispatchする。
7. callbackのowner、run、token、generation、入力hash、実UIDを照合する。
8. artifact、receipt、状態、次queue、eventを一transactionで確定する。
9. 利用者が成果をreviewする。
10. 外部収益は別の署名済みEarning Receiptを受けて初めてWalletへ進む。

停止は新規dispatchを止め、tokenを失効し、協調停止を要求する。既に成立した外部作用を「停止済み」と消さず、Provider照会または補償操作へ進める。

## 9. Local AIとmodel

本人の2026-10-21指示「LLMを作ろう」「まず設計から」により、Eve・AMC・Sky Toolを結ぶ[実行SI向け自社LLMの設計](llm-evaluation-architecture.md#execution-si-owned-model)を追加した。第一の仕事はEveからSky Tool一件を実行して同一jobへ根拠と実resultを戻すこと。モデルは型付き作業案を出し、Broker/Engineが権限・承認・予算・Tool結果を確定する。学習方式・重み・実行hardwareは未決定で、既存Qwen/Pixel試験の合格を新モデルの合格へ転用しない。

2026-10-20のAI・モデル管理の追加要件は[共通Coreの登録・適合・取得・測定・実行先・資料・復旧契約](ai-native-os-architecture.md#ai-model-management)を正本とする。Skyはmodelの追加・比較と実行先候補、Eveは仕事ごとの選定理由・見積・承認・資料と生成結果の区別、Brokerは各操作直前の権限・上限・停止世代の再検査、Linux/端末adapterは隔離された推論と計測を担当する。未承認の外部送信、資料内の命令の採用、model自己申告によるTool成功・請求確定は禁止する。登録から旧仕事閲覧までの状態と失敗条件を同リンクで追い、現行の固定APK/Pixel Linux/Cloud候補の合格範囲を混同しない。

`ModelProfile`はmodel ID、版、weight・tokenizer・template hash、license、形式、context、plan schema、RAM／storage、測定条件、品質結果を一組にする。仕事開始時にprofileを固定し、途中でmodelを差し替えない。

更新順は`download → hash/license/容量/API検査 → 隔離試験 → 待機時切替 → health確認`。失敗時は互換性を確認した旧profileへ戻す。失効modelへは戻さず仕事を停止し、新modelでのreplanを新revisionにする。

現在のAndroid Local AIは固定package、version、API、署名と一つのQwen構成による限定受入。汎用model/runtime交換、二profile比較、共通長期記憶は未実装である。

## 10. Agentの記憶

記憶を三つに分ける。

| 種類 | 内容 | 規則 |
| --- | --- | --- |
| 仕事記録 | request、plan、step、attempt、結果、event | 状態の正本。消してはならない |
| 短期context | 現在の会話や検索結果 | cache。消えても権限・完了は変わらない |
| 長期記憶 | 本人確認済みの好み、手順、参照 | 出所、用途、期限、訂正、削除を持つ |

model固有tokenやembeddingはprojection cache。canonical記憶としない。AIの推測を本人の事実や承認へ昇格させない。credential、seed、秘密鍵を記憶本文へ入れない。

## 11. 実行場所とnetwork

| 実行場所 | 利用条件 | 通信断時 |
| --- | --- | --- |
| device | 導入済みTool、端末capability、resource余裕 | `local-pure`は継続可能 |
| PC | Connection Passport、本人PC、fresh health | 接続不明で停止。別PCへ自動移送しない |
| Sky Cloud | 認証owner、配備版、送信同意 | requestを再照合し、完了を推測しない |
| Provider | adapter、scope、費用、idempotency、照会 | `uncertain`から照会で解消する |

Cloud／PC fallbackで送信先が変わる場合は別同意を必要とする。local不足を理由に自動で外部送信しない。

## 12. external-write

外部投稿、広告、DM、請求、送金、出願、物理実験等は`external-write`である。

状態は`prepared → dispatched → confirmed | rejected | uncertain`。送信前にoperation ID、payload hash、対象、費用、approval ID／期限、Provider idempotency keyを永続化する。同じkeyで異なるpayloadを拒否する。

送信直後に切断しても「失敗」と決めて再送しない。Provider referenceまたは同じkeyで照会する。照会も冪等再送も保証されない場合は`uncertain`で止め、人またはProviderへ解決を求める。

## 13. artifactとreceipt

artifactは原稿、CSV、画像、候補graph等の成果。receiptは「誰が、どの版で、何を実行し、どうなったか」を照合する記録である。成果物の内容と実行証拠を同じfieldへ混ぜない。

receiptには少なくともowner、work、run、Tool／Provider、version、input digest、output digest、environment、時刻、outcome、費用、署名または照合根拠を持たせる。environmentはfixture、sandbox、Web、QEMU、emulator、試験署名実機、OS image、本番を区別する。

## 14. 保存とdatabase

保存の原則:

- owner IDを全読書きの条件にする。
- 原記録を上書きせず、revision、event、取消で変更する。
- request keyと内容hashを組にし、同じkeyの別内容を拒否する。
- 私的本文、原稿、raw camera、秘密、credentialを既定telemetryへ入れない。
- serverに不要な入力・成果は端末memoryまたはowner領域に限定する。
- 金額は浮動小数でなく最小通貨単位の整数を使う。
- migrationは旧reader互換、backup、rollback可能性を検査する。

WebのD1、Android SQLite、Linux data diskは別の正本であり、自動的に同期済みとは扱わない。同期機能を追加するときはauthority deviceとwriter epochを固定する。

## 15. backupと復旧

backupはowner、schema、generation、artifact hash、authority状態を含み暗号化する。復元時は空のtarget、所有者phrase、integrity、schema rangeを検査し、新しいKeystoreへ再bindingする。

復元後は仕事をpausedにし、旧tokenをrotateし、active approvalを停止する。旧端末と復元端末を同時writerにしない。物理wipe、鍵喪失、clone拒否、owner再結合を別々に試験する。

現在はAndroid emulatorでtransactional import、所有Pixelで非破壊exportまで確認済み。物理wipe後の全損復元は未完了。

<a id="data-sync-recovery-algorithms"></a>
### データ・同期・復旧のアルゴリズム（OS10 / ROCK）

2026-10-20の本人指定を、RockstarOS Coreの共通仕事契約として定める。Eveは依頼・競合・成果を表示し、Skyは能力を接続する。本人性、状態遷移、外部作用、予算、保存と復旧の判定はCore/Brokerが行う。Web D1、Android SQLite、Linux data diskの既存実装を一つのDBと呼ばず、まず各正本と複製範囲を明示する。

| 記録 | 必須の識別・検査 | 永続化と一意性 |
| --- | --- | --- |
| ownerと端末 | 認証済みowner ID、端末ID、権限scope、writer epoch | ownerを全読書き・object storage key・暗号鍵参照へ結合。要求本文のowner IDだけを信用しない。端末登録と失効は監査eventへ残す |
| 仕事と操作 | owner/job ID、operation ID、request key、正規化した入力hash、expected revision | job作成と操作受領を原子的に保存。同一owner・scope・key・hashは元の結果へ戻し、同じkeyでhash違いは409。IDは再利用しない |
| 成果と使用量 | artifact ID、原本hash、projectionの元ID/版、receipt ID、usage ID、provider reference | 同一job/attemptへ紐付け、usage IDとprovider referenceの重複確定を一意制約で拒否。原本、表示用変換、実行証拠を別objectとする |

**操作の決定順。** (1) 認証とowner/利用権/scopeを検査、(2) key重複を先に照会、(3) expected revisionと現在のwriter epochを比較、(4) 許可された状態遷移、承認ID/期限、予算予約を検査、(5) 一つのtransactionで操作・新revision・送信前outboxを確定する。重複keyの同一内容は保存済み結果を返す。古いrevisionは409と現revision/競合に必要な情報を返し、サーバーが黙って上書きしない。承認前の`prepared`から`running`へ飛ばす経路を設けず、Brokerが承認証拠を再検査する。端末時刻やLLMの提案を承認証拠に使わない。

**leaseとcheckpoint。** 実行者はjob/attempt/owner/writer epochに結合した有効期限付きleaseをcompare-and-swapで取得する。heartbeatは単調なfencing tokenと期限を更新し、期限切れ・失効・予算上限・停止要求後は新しい外部作用を始めない。期限切れの旧実行者が戻っても、古いtokenからの成果確定と請求確定を拒否する。checkpointはstep、入力/Tool版とhash、既に確定した外部作用のreference、未確定outbox、残予算、次の安全な再開点を原子的に記録する。再開時は権限・利用権・料金版・契約期限を再検査し、checkpoint以後の未確定作用を先に照合する。Providerに送信済みの処理を新attemptとして盲目的に再実行しない。

**結果不明と会計。** 送信前にoperation ID、provider idempotency key、payload hash、予約IDをdurable outboxへ書く。timeout/切断後は`uncertain`として同じkeyまたはprovider referenceで照会する。Providerが照会・冪等再送を保証しなければ手動解決まで保留し、成功・失敗・無料のいずれにも推定しない。使用量は署名または契約済みの根拠、単価版、単位、時刻、job/attemptと照合し、一つのusage IDを一回だけ確定する。Wallet予約→usage確定/解放→請求/支払の各段階に別receiptを持ち、応答消失で新しい請求や送金を作らない。

**端末間同期。** Coreが管理する各recordのauthoritative writerとepochを宣言し、端末へ`owner, job, revision, event cursor, artifact hash`を返す。端末は最後に確認したcursorから増分を取得し、欠番/期限切れならowner限定のsnapshotとhashを取り直す。offline編集は`base revision + operation ID + payload hash`で端末内に保留し、再接続時に順番に提出する。作業内容の衝突は双方の版を表示し本人が選ぶ。承認、支払、外部送信、失効は自動mergeしない。offlineの停止操作はexecutorの受領まで「停止依頼中」と表示する。端末間で同一契約を共有しても基本料を重複作成しない。

**成果、backup、退出。** 原本はimmutable、変換済み表示は再生成可能なprojection、receiptは別の監査記録とする。成果の書込後にSHA-256とsizeを保存し、読戻し・export・復元時に検証して破損なら配布を止める。backup manifestはowner、schema範囲、writer epoch、generation、各object hash、暗号方式/鍵参照を含む。別環境の空targetへ復元してmanifest/全hash・件数を照合し、旧token/承認/leaseを失効、新epochで再bind、未確定操作を照合してから実行を再開する。旧端末と復元先の同時writerを拒否する。保持期間、法定保持、削除猶予、export形式と退会後取得期限は契約版ごとに定める。削除は対象・保留理由・backup世代の消去予定を本人へ示し、法的保持中のreceiptと削除済み本文を区別する。値が未決定のまま実販売・自動消去を開始しない。

合格には、同一ownerの二端末と別owner、offline競合、重複/改変key、承認飛越し、lease期限切れ後の旧worker、checkpoint直後の再起動、Provider応答消失、usage/支払重複、成果bit破損、空の別環境へのbackup復元、旧端末のwriter拒否、export/削除/保持期限を同じ候補で試験する。Web/Android/Linuxの各fixture結果と、実端末・実Provider・本番受入を別々に記録する。既存Webの`lib/workflow.ts`、D1のowner/revision条件、Wallet台帳、native backupを再利用し、移植時は同一fixtureで契約の一致を検査する。この節は設計であり、全経路のruntime実装・復元試験合格を意味しない。

## 16. updateとrollback

OS、runtime、model、Tool、policyを別の更新単位にする。

| 更新 | 主な検査 | rollback |
| --- | --- | --- |
| OS image | AVB、partition、SELinux、API、data migration | Virtual A/Bとrollback index |
| runtime | signer、API range、対応profile、health | 前の互換runtime |
| model | 全hash、license、容量、品質profile | 検査済み旧profile |
| Tool | author署名、manifest、権限差分、schema | Tool単位の旧版 |
| policy | signer、generation、期限、対象 | 既知の安全policy。失効版へ戻さない |

OSのtrial slotではmark-good前にhardware rollback indexを進めない。bootだけで健康とせず、UI challenge、必要service、保存、権限、rollback可能性を確認する。

## 17. UIとaccessibility

HomeはSky、Zema、Wallet、Market、Settingsへの入口。仕事はZemaへ集め、専用Tool画面からも同じwork／receiptへ戻る。

2026-10-09の明示指示によりHomeのvisual contractは下記「Home: 意図から仕事へ」を優先する。その他のWeb Previewのvisual contractは、avokado製品Siteと同じグラファイトのshellとHome、銀色の文字・面、淡い青のfocus／選択手掛かりを基準にする。Sky、Wallet、Market、Settings、CSVなど情報量の多い画面には冷たい白い面を使い、Zema会話とStudioは暗い操作面を維持する。Homeの旧既定黄緑accentだけを新既定色へ移行し、利用者が選んだ別色は保持する。Tool固有アイコン、成功／警告／失敗の意味色はブランドaccentと分け、色だけで状態を伝えない。狭い画面でもHome導線、主要操作、実際の接続状態が見え、横方向のページはみ出しを起こさない。これらはWeb表示の設計であり、native OS・Provider接続・本番公開の完了を意味しない。

全画面で表示するもの:

- 実行場所と最終確認時刻
- offline／接続不明／Provider待ち
- 入力中、実行中、停止要求、停止確認、review、完了、失敗、結果不明
- 料金と外部送信範囲
- 使用Tool／model／版
- fixture、sandbox、実機、本番の区別

keyboard、touch、screen reader、文字倍率、色以外の状態表現、動きを減らすmodeを画面ごとに受け入れる。会話だけを唯一の操作方法にしない。

## 18. Wallet、収益、Fund

Tool完了、販売成立、Provider入金確認、Earning Receipt、Wallet反映、払出しを別状態にする。自己申告、予測、PAPER損益、simulation PnLを残高へ入れない。

旧収益連動契約の試験式はProvider確認済み収益から実費を引いた残額を基礎に月最大888 USD cents。売上0なら請求0、未達分を債務化・翌月繰越しない。現行ToC収益料金は収益動線と新条件の確定まで保留し、この試験式を新たな本番請求へ適用しない。Sky Market買い切り販売の10% application fee、月額サービス、AI使用料、ATM自社手数料0はそれぞれ別の版付き条件である。秘密鍵や利用者資産を保管せず、外部Wallet／Providerへの指図と照合だけを行う。

<a id="wallet-revenue-external-finance"></a>
### Wallet・収益・外部金融接続（2026-10-20の明示要件）

目的は、自動化の仕事が生んだ実収益だけを、本人と関係者へ一回ずつ正しく帰属させること。利用者は仕事、販売・入金、留保、確定、返金、出金の各状態と、その根拠、費用、承認履歴をWalletで追える。Sky・Eve・Toolの実行成功だけでは収益を確定しない。

- **入力と結合キー:** `owner/account`、`job/executionReceiptId`、Earning Receipt ID、Provider IDと取引参照、契約・料金policy版、通貨・最小単位、gross/税/Provider費用/運営実費、受益者の役割と受取先、発生・Provider確定・台帳記帳の時刻を分ける。Providerの署名済み通知と独立の取引再照会を照合し、署名鍵の有効期間、時刻許容差、同一取引の金額・通貨・finalityを検査する。通知到着順を会計上の確定順にしない。
- **状態と保存:** `売上候補 → 入金待ち → 入金確認・保留 → 分配可能額確定 → 払出し指図中 → 払出し確認`を別記録にする。返金・chargeback・送金失敗・結果不明・失効は元行を削除せず、参照付きの追記仕訳と未払額・回収対象の再計算で表す。Provider側の出金依頼受理と銀行・Wallet着金を同一状態にしない。本人別のappend-only台帳にevent ID、元仕訳、契約版、承認digest、Provider証拠hash、照合時刻を残す。
- **二重分配防止:** 同じ`(provider, providerReference, finality event)`とEarning Receipt、実行、払出し指図を一度だけ採用する。入金確認額のうち返金・留保・既配分・予約を差し引いた分だけを原子的に予約する。異なる通知IDによる再送、並行承認、逆順通知、再起動後の再照合でも、全受益者の確定配分と未処理予約の合計が対象純入金を超えない。不明な結果は同一指図を照会し、新規IDで自動再送しない。
- **取り分:** 作者、利用者、Rock、決済Providerを別の受益/費用lineで表示する。提供者の売上、Provider処理費用、実費、税、Rockの対象収益・手数料、作者還元原資を相殺して見えなくしない。Rock回収は当該商品の版付き対象条件、本人同意、検証済み入金、上限をすべて満たした時だけ。旧888 centsは上記の保留を維持し、Sky Market 10%や月額16 USDの別契約へ流用しない。返金後は既回収分を別の調整仕訳で追跡し、負残高を勝手に別の収益から回収しない。
- **外部adapterと本人承認:** Wallet、決済、custody、払出しProviderは版付きcapability、対象国・通貨、sandbox/live、照会・取消・失効、署名鍵を宣言する。受取先は本人の対象・chain/口座・nonce・期限へ束縛した署名で登録し、鍵や受取先の失効後は新規指図を拒否する。実資金の送金、受取先変更、換金、返金等は金額・通貨・相手・手数料・期限・取引IDへの個別承認と監査を要する。ProviderのKYC/custody/実送金とRockの台帳・権限は責任を分ける。
- **ATM:** Rockが徴収するATM利用・払出し手数料は0。同じ手数料を名称変更や換算差で加算しない。外部ATM/決済/送金の実費は金額、負担者、事前同意を別表示し、不明な場合は総額無料と表示しない。ゲーム交換adapterと承認は独立させ、共通Wallet予約だけを共有する。

ROCKは状態機械、台帳、重複防止、本人承認、監査と安全停止を実装する。EXTERNALは署名付き決済・保管・送金・KYCと照会APIを提供し、JOINTは同じ入金から返金/chargeback/払出しまでsandboxと限定liveで縦断受入する。OWNERは対象国、販売/決済/払出しProvider、料金版と上限、本人の受取先署名、実資金操作を決める。合格証拠は同一job/receipt/provider取引の入金再照会、並行二重分配拒否、逆順・重複通知、返金/chargebackと失敗払出しの補正、署名失効、ATM 0/外部実費の表示、個別承認/監査の各試験である。現行の合成fixtureやsourceだけで実Provider・実入金・実払出しを合格扱いしない。実装の入口と次の受入順は[Wallet workstream](workstreams/03-wallet-billing-providers.md#wallet-revenue-finance-20261020)に置く。

Fundは複数Toolの検証済み純実績が蓄積するまでPAPER。LIVE運用、利回り保証、自動再投資は行わない。

## 19. Securityとprivacy

基本規則:

- least privilege、別UID、別署名、入力上限、allowlist。
- platform鍵を第三者Toolへ渡さない。
- 任意shell、root、任意URL、任意host pathを共通Tool APIにしない。
- 取得data内の命令を権限変更として実行しない。
- secretは専用保管参照で扱い、log、memory、URL、artifactへ埋め込まない。
- telemetryはcategory別同意、目的、保持、送信先、削除、撤回を持つ。
- raw job、私的会話、写真、連絡先、鍵、credential、正確な位置を既定収集しない。

Operator DockはOS外、端末Agentはlauncher非表示・限定scope。管理serverだけでは有効命令を作れず、利用者確認済みWebAuthn署名、端末側検証、単調counter、追記監査を必要とする。

## 20. Device Support Package

共通Coreと機種固有driver／firmware／partition／power／thermal／camera等を分離する。DSPは対応Core範囲とhardware capabilityを宣言し、未確認機種を同型として扱わない。

Android Broker snapshot v3は、Androidが報告するeUICC機能・管理有効状態・複数profile同時有効機能に加えて、このBrokerがAndroid 15以降のDevice Owner／Profile Ownerに登録済みか、組織所有端末で自動profile有効化APIの条件を満たすかを読み取り専用で返す。有効期限は30秒。これは端末上で管理tierを判別する材料であり、carrier privilege、LPA対応、空きport、対象プラン・profileの適合、導入成功を示さない。Profile Ownerが個人所有端末である場合はmanaged-subscription管理適格と自動有効化適格を分離する。eUICC非対応、管理無効、確認不能も別状態にする。profile導入状態、契約プランとの一致、データ接続、機種向けRockstarOS imageの適合はこの表示から推論せず、別のOS/DSP受入が必要である。subscriber identifierを取得せず、診断結果を保存・送信しない。汎用Capability APIはBrokerが所有し、端末の測定値と試験保証範囲を版付きで返す。

最初の物理対象はPixel 10、model GL066、product `frankel`。Google stock factory imageとfull OTA、vendor inventory、正式署名、full build、flash、SELinux、CTS/VTS、OTA rollback、純正復旧が揃うまで完成対応を表示しない。

## 21. 運用と診断

利用者画面、開発診断、運営緊急保護を分離する。診断bundleには版、component health、失敗code、receipt参照、resource状態を含められるが、私的入力・成果・秘密を既定含有しない。

重大incidentは検知、影響範囲、失効、停止、利用者表示、復旧、証拠保全、再発防止の順に扱う。運営が不在でも端末は期限切れ命令を拒否し、基本offline機能と利用者による停止・exportを維持する。

## 22. application systems

| system | Coreとの接続 | 独立受入 |
| --- | --- | --- |
| Sky / Zema | Tool selection、work、approval、event、artifact | 一台／多端末、Web／nativeを分ける |
| Wallet / Fund | receipt、Earning Receipt、reconciliation | 実Provider、実資金、地域ごと |
| Game / IP | owner、job、artifact、save、receipt | game本体、金融交換、動画、VRを分ける |
| Material Invention / avocadoMini | work、Tool、safety、evidence、Patent AI | XR、sensor、simulation、lab、材料、特許を分ける |
| Business Tools | 共通Tool contractとZema | Toolごとに入力、外部作用、品質を受け入れる |

応用systemをCore bootの必須依存へ入れない。応用が未完成でもCoreを試験でき、Core合格だけで応用完成とも呼ばない。

## 23. 代表的な失敗と挙動

| 失敗 | 表示・状態 | 自動でしてはいけないこと |
| --- | --- | --- |
| modelをloadできない | model利用不可、仕事を保持 | Cloudへ送る、入力を削除する |
| Tool署名・版不一致 | 実行拒否 | 警告だけで続行 |
| PC接続が古い | 接続不明 | onlineと表示、別PCへ移送 |
| 通信切断 | waiting／uncertain | 外部作用を失敗として再送 |
| callback重複 | 既存receiptを返す | 二重成果・二重課金 |
| 保存容量不足 | 開始前拒否または安全停止 | 旧modelや成果を勝手に削除 |
| backup復元 | paused、token rotate | 旧端末と同時writer |
| update失敗 | trial拒否、旧slotへ戻る | 壊れた版をmark-good |
| Provider未確認収益 | pending | Wallet残高へ記帳 |
| sensor／AIの低confidence | preview／needs info | 確定操作へ昇格 |

## 24. 合格matrix

| gate | 必須証拠 |
| --- | --- |
| host test | pure logic、schema、異常入力、決定性 |
| Web | 認証、owner分離、revision、API、build、asset closure |
| QEMU | boot、UID、IPC、保存、再起動、更新、rollback、backup |
| Android emulator | Binder、UID、DB、backup import、異常callback |
| 試験署名Pixel APK | 機内モード、実再起動、熱、hardware Keystore、非破壊export |
| RockstarOS Pixel image | full build、AVB、SELinux、CTS/VTS、OTA、stock recovery、wipe restore |
| Provider sandbox | auth、冪等性、照会、返金、結果不明、失効 |
| production | 正式鍵、契約、地域、監視、incident、復旧訓練、本人の公開判断 |

一つのgateの合格を別gateへ転用しない。

## 25. 現在未確定の設計値

| 未確定 | 決める方法 | 決定前の挙動 |
| --- | --- | --- |
| 比較採用するLocal AI model | 同じ入力、品質、p95、電池、熱で比較 | 現行固定runtime以外を対応表示しない |
| 一般Tool capability schemaの最終版 | SDK、native、MCPのfixtureを相互変換 | P1固定contract外を拒否 |
| 多端末writer移送transport | offline競合、fencing、旧端末停止を試験 | 自動移送しない |
| production identity／key ceremony | owner、HSM、別人検証、復旧訓練 | test鍵を本番扱いしない |
| 最初の外部収益Provider | 契約、sandbox、返金、照会を受入 | fixture収益だけを表示 |
| Pixel OS hardware budget | full build後に容量、RAM、電池、熱を実測 | 仮目標を出荷値にしない |

## 26. 詳細正本

- [AIネイティブOS共通設計](ai-native-os-architecture.md)
- [RockstarOS 1.0構成](rockstaros-1.0-architecture.md)
- [Platform Core](platform-core.md)
- [Android production architecture](android-production-architecture.md)
- [Device Support Package](device-support-architecture.md)
- [Native OS統合](native-os-integration.md)
- [Sky／Zema／全Tool詳細設計](sky-tools-complete-design.md)
- [保存境界](data-storage-boundaries.md)
- [backup・復旧](android-backup-recovery.md)
- [緊急保護](security-incident-response.md)
- [Material Invention／avocadoMini](rockstaros-avocado-mini-complete-design.md)
- [release gate](release-minimum-gates.md)

## 27. Web画面とAPIの配置

| 入口 | 責任 | 正本・境界 |
| --- | --- | --- |
| `/` | Home、主要systemへの入口、現在状態 | `components/home-screen.tsx` |
| `/sky` | Tool発見、比較、選択、Zema引継ぎ | `components/sky-workspace.tsx` |
| `/sky/network` | 接続経済、MCP／Provider状態 | `components/sky-network.tsx` |
| `/sky/publish` | ToB掲載、Package、診断 | `components/sky-publisher-form.tsx` |
| `/chat` | Zema、MCP bot、方向修正、停止、結果 | `components/sky-chat-workspace.tsx` |
| `/work` | 仕事作成、step、review、履歴 | `lib/workflow.ts`、`lib/work-store.ts` |
| `/activity` | 実行・仕事の確認 | event／job APIのread model |
| `/csv` | CSV Tool専用受付・成果取得 | CSV設計とjob store |
| `/wallet` | owner別残高、売上、経費、取消 | Wallet API。秘密鍵を持たない |
| `/market` | typed PAPER market | LIVE取引なし |
| `/polymarket` | 公開市場read-onlyとbacktest | 注文・秘密鍵なし |
| `/fund` | PAPER fund構成と測定 | LIVE運用なし |
| `/income/mercari` | 出品draftと収益loop | 外部操作は本人／Connector別承認 |
| `/studio` | Tool Package生成、登録、MCP公開 | [Sky Tool SDK](sky-tool-sdk.md) |
| `/settings` | 利用者設定、接続、privacy入口 | 権限付与はBroker／Provider側で再検査 |
| `/settings/system` | backup、更新、診断等のsystem操作 | `components/system-maintenance.tsx` |
| `/rockstaros` | Developer Preview説明 | 実装環境とgateを過大表示しない |
| `/rockstaros/guide` | 導入・利用案内 | release状態に応じる |

APIは領域別に分ける。

- 仕事: `/api/jobs`、`/api/work-jobs`、`/api/runs`、`/api/tool-controls`。
- Sky: `/api/sky/connections`、`developer-tokens`、`mcp/inspect`、`submissions`、`tool-events`、`tool-packages`、`tool-publications`、`tool-registry`。
- Tool固有: `/api/csv-jobs`、`legal-guidance`、`patent-research`、`revenue/mercari`、`markets/analysis`、`markets/bot/assess`。
- 金融: `/api/wallet`、`earnings/receipts`、`billing/token`、`fund`、`automation-funds`、`market`。
- 端末・運用: `/api/devices`、`operations`。

更新APIは認証ownerとsame-originを必須にし、body size、未知field、revision、idempotencyを検査する。routeがあることを本番Provider接続やOS機能完成の証拠にしない。

## 28. Android package配置

| package／module | 役割 | 現在地 |
| --- | --- | --- |
| `dev.rock.shell` | Home、Sky、Zemaの薄いUI | 試験署名APK。広い権限なし |
| `dev.rock.automation` | Platform Broker、owner DB、仕事、Tool dispatch、Wallet fixture | emulator／所有Pixel限定受入 |
| Local AI package | API v2で閉じたplanを返す | 固定runtime／model |
| `dev.rock.tools.article` | citationsとfree-article固定2工程 | P1専用。同署名、INTERNETなし |
| `dev.rock.operator.agent` | 限定緊急命令の端末側検証 | 本番credential／Device Owner未受入 |
| `shell-api` | ShellからBrokerへの署名限定AIDL | API v5。Sky selection、owner recovery、開発用eSIM nonce-bound key preparation。実ビルド・Binder受入待ち |
| `tool-sdk` | BrokerからToolへのP1 AIDLと型 | 第三者公開SDKではない |

最終OS imageではpackage、privapp許可、SELinux domain、signer、UID、version、permissionを同じbuild artifactで検査する。単体APKの成功だけでproduct imageへの搭載を主張しない。

## 29. Linux／QEMU service配置

| service領域 | 役割 |
| --- | --- |
| `platform` / `core` | local IPC、identity、state、receipt |
| `registry` | catalog、署名、hash、revision、失効 |
| `runner` | Tool隔離、limit、result |
| `service_access` / `mcp_broker` | owned serviceとMCP接続 |
| `wallet_backend` / `wallet_auth` | owner台帳、資格、reconciliation |
| `settlement` / `atm` | 合成精算、ATM simulator |
| `game_exchange` | GX00／GX01の合成交換 |
| `ai_routes` | local／cloud／PC route policy |
| `update` / `system` | A/B、health、rollback、電源、backup |
| `operations` / `security` | 診断、保護、監査 |
| `ui` | framebuffer native UI |

各serviceを専用UIDと有限IPCで接続し、UIへdatabase socketやroot権限を渡さない。QEMUのservice配置をAndroidへpath単位で移植せず、契約とfixtureを比較してplatform固有実装へ写す。

## 2026-10-05 旧PRと現行Coreの互換統合

AI02〜AI06の旧host fixtureを現行のSIM/eSIM・署名付きPlatform Coreへ併存させる。`ModelProfiles` の試験用schemaは `fixture_model_*` に分離し、署名・失効・版固定を持つ `PlatformStore` の製品registryを置き換えない。限定記憶、external-write outbox、単一executorのfixtureは入力版・owner/project・operation keyを照合し、競合や結果不明を実行成功へ変換しない。既存の共通DBを使い、復旧時は同じ仕事とkeyを照合する。host SQLite/JUnitの成功とAndroid Binder/実機受入は別に記録する。実機のモデル交換・記憶移行・外部作用の本番運用は受入が残る。

非金融Game fixtureはseed固定・粒子world・保存再読込を検証する試験基盤であり、外部ゲームの残高や資金を変更しない。Decision FabricのRouter/Harnessと任意Jev providerは提案だけを返し、Brokerの権限や本人承認を付与しない。Agent Control Plane公開APIは認証済みdry-runのみを受け付け、見積・owner予算予約・冪等dispatch・Provider receiptの接続までremote起動を拒否する。詳細は[LLM境界](llm-evaluation-architecture.md)と[Agent Control Plane](agent-control-plane.md)を参照する。

統合対象・除外理由・検証環境は[PR統合証拠](evidence/pr-consolidation-20261005.json)に保存する。旧仕様へのrollbackはmerge履歴から追跡し、現行署名registry、SIM entitlement、本人別保存、課金上限を失う一括巻戻しをしない。

## 共通決済とeSIMクラウドの境界（2026-10-05）

利用者の明示指示により、Sky/CSV/ハードウェア/クラウドのStripe transportと本人向け支払い入口を共有する。商品/使用量/入金は異なる正本へ保存し、eSIM利用権から課金承認を推論しない。目的、利用体験、責任、入力/出力、状態、保存、失敗、復旧、承認、合格条件と未決定は[共通決済](sky-billing.md#共通決済2026-10-05)を参照。直接LLM回収はtest専用で、A2AのWallet予約/精算を追加カード請求へ変換しない。OS/native署名、実資金、端末受入または商用完成を示さない。

## Optional eSIM cloud access — 2026-10-05

既存BIZ01/SKY19/BIL02のeSIM導入証明を、owner別クラウドアクセスキーへ接続する。`/sky/purchases`で導入確認後に開始し、期限・再発行・停止を管理する。`/connect`は通常Web/appと併存する任意入口を案内する。目的、責任、設定、入出力、状態、保存、失敗、復旧、承認、合格条件と未決定事項は[共通契約](sim-led-product-architecture.md#optional-esim-cloud-access-implementation)を正本とする。

追加保存はWeb D1 migration `0059`のhash/owner/order/device/receipt/scope/expiry/失効履歴。署名済みinstall proof、gateway鍵、現行Package審査、返金状態を使用ごとに照合する。キーは許可されたcloud APIだけへ接続し、同じownerの見積・予算・usageを再利用する。eSIM同梱Starter Packの表示を既存利用権APIへ追加し、OS Brokerの権限・本人承認・Tool成功へ昇格させない。キー自体で支払いや管理操作は行えない。未設定は提供準備中、競合は状態再取得、紛失は再発行、失効は拒否し既存成果を保存する。自動的なブラウザ起動、実通信会社接続、実機導入、商用クラウド実行、従量単価と合算請求は未受入。[ローカル証拠](evidence/esim-cloud-access-local.json)を本番成功へ読み替えない。

## Home: 意図から仕事へ（2026-10-09）

### 全画面の発見型フロント（2026-10-19の明示変更）

- 目的・利用体験: 利用者の「OSのフロントをAirbnbと同じ形」「アプリ全体の見た目と操作」「Web版とPixel端末内の両方」という明示指示を、カテゴリ選択→意図入力→カードからSky/Zema/仕事/利用権を開く共通操作へ翻訳する。既存の2026-10-09の無彩色指定より、この明示指示をWeb/HomeとPixel Shellの現行外観判断として優先する。Airbnbのブランド、画像、文言、宿泊情報は流用しない。
- 責任: Product / UX、HOME01 / WEB04 / OS10、ROCK。Webは`OSHeader`と共通token、Pixelは`ShellUi`と4画面ナビを担当する。Sky/Agent実行、通信、課金、機種受入は既存の担当・gateを保持する。
- 入出力・状態: Web Homeは従来の意図本文と本人job APIを使用し、Sky/Zema/仕事/接続へ既存routeで移動する。Pixel Homeは従来の下書きとSky/仕事/設定画面へ既存画面遷移で移動する。loading、未認証、失敗、確認待ち、完了を既存workflowのまま表示し、カードの存在を使用可能・購入済み・承認済みの証拠にしない。
- 保存・失敗・復旧・承認: Webの一回引継ぎ/10分TTL、Pixelのメモリー内下書き・置換確認、本人承認、予算上限、停止と結果の読戻しを変更しない。検索やカードのタップは画面遷移または下書きに限定し、外部実行や請求を開始しない。読込失敗は既存の再試行とサインイン導線を残す。
- 合格条件: Web Homeと主要画面のPC/mobileでカテゴリ・検索/意図・カード・仕事・共通ナビの操作と横はみ出し/焦点/状態を確認し、Pixel同一APKでHome→Sky→仕事→設定、下書きの引継ぎ/置換確認/再起動後状態を非破壊で検証する。変更したsourceの型・build・設計整合と実機表示を別々に記録する。今回の編集は配備、APK導入、端末受入、Cloud/決済の合格を意味しない。
- 未決定の決め方: Mini/Proの空間表示や入力は機種別能力と本人の操作受入で決める。WebとPixelで同一寸法を強制せず、カテゴリ/意図/カード/状態/承認の意味を共通契約にする。

- 目的・体験: Homeで依頼を入力し、Zemaへ引継ぎ確認。本人の仕事を状態別に見て再開する。道具は上部のアプリ一覧と検索可能dialogから開く。
- 責任: Web / PWA / Sites、ROCK、HOME01 / WEB01。Homeは表示と下書き引継ぎを担い、認証・workflow・予算承認を代行しない。
- 入出力: 1〜2000文字の依頼をsessionStorageへ保存し、Zemaの編集欄へ一回だけ読み出す。GET /api/work-jobsの本人jobを一覧・絞込み・詳細リンクへ表示する。
- 状態: loading / ready / signin / errorと、active / review / completed / cancelledを区別。activeはworkflow状態でありAgent実行中の捏造ではない。
- 表示: 2026-10-09の追加修正指示で無彩色のHomeへ変更。彫刻・ライム・大見出し・浮遊dockを撤去し、既存アプリの暗い面・銀色文字・細い罫線へ合わせる。集中表示はアプリ一覧・説明・入力例を畳む。
- 保存: 下書きは同じタブ、10分で失効、読出時消去。URL・localStorage・新規serverへ本文を保存しない。集中表示のbooleanだけをlocalStorageへ保存。旧外観設定値を削除しない。
- 失敗・復旧: 保存拒否なら入力を残してコピーとZemaへの直接導線を提示。401は履歴を消してサインイン、読取失敗は空件数を捏造せず再読込。中断・古い応答は破棄する。
- 承認: HomeはGETだけ。下書き引継ぎでTool実行・外部送信・支払は開始しない。実行は既存画面の承認に従う。
- 合格条件: handoff一回/期限/不正値/保存失敗試験、typecheck、既存回帰、PC/mobileで入力→Zema・検索dialog・集中表示・仕事導線を確認。motion低減とkeyboard/focusを保持する。
- 未決定: provider本番受入・native移植は既存gateへ残す。別Site移行は今回のUI刷新へ混ぜず、指定されたpublic Siteのaudienceを保持する。

## Web共通デザイン（2026-10-09修正）

- 目的・体験: Home・Sky・Zema・Wallet・Market・設定を、同じ製品のアプリとして行き来する。全画面で同じRockstarOSヘッダー、主要6アプリのナビゲーション、選択表示、コンテンツ幅を使う。Home単独の中性化では不十分という利用者の明示指示に基づく。
- 共通定義: `app/os-design-tokens.css`を背景・面・文字・罫線・focus・意味色の正本にする。`components/os-header.tsx`と`app/os-appearance.css`を共通操作部にする。背景#0b0d10、面#15181d、文字#f4f6f8、選択・主操作は銀色。入力focusは淡い青、成功・注意・失敗は意味色とラベルを併用する。
- 責任・入出力: Web / PWA / Sites、ROCK、WEB04 / HOME01。既存routeとpathname、実行中状態を入力に表示する。API・owner認証・仕事状態・料金・権限を変更しない。
- 状態・保存: loading、未認証、失敗、workflow状態をそのまま表示する。共通ナビに現在地をaria-currentで示す。新規サーバー保存なし。Home集中表示は説明と入力例だけを畳み、共通ナビを残す。
- 失敗・承認・復旧: running時は共通ナビも既存の離脱防止に従う。表示の変更で接続・送信・支払を実行しない。Sitesの前版v46を保存し、必要なら同版へ戻せる。
- 合格条件: PC1280・スマホ390/320で全6routeのヘッダー・背景・選択・横はみ出し・入力・検索を確認。共通文字/面のcontrast、既存style contract、typecheck、design:check、npm run verify、配信version/sourceを記録する。
- 未決定: native OS受入、provider本番・課金gateは既存契約へ残す。public製品紹介・OS配布案内はアプリ画面とは役割が異なり、一般利用可能という表示へ変更しない。


### Pixel既存OS clientへの共通外観適用（2026-10-09）

利用者の接続Pixelへの反映指示により、ShellUiの背景・面・枠・文字・銀色primary・選択tabをWeb共通tokenと同値にする。端末内のHome/Sky/仕事/設定の目的・入力・Broker責任・保存契約は維持。Home末尾の「Web版を開く」は既存のpublic HTTPS SiteをAndroid ACTION_VIEWでブラウザへ渡し、秘密・下書き・本人tokenをURLへ付けず、サインインを自動移送しない。ブラウザがなければ案内を表示して再試行できる。Webの6画面と端末内4画面の実装・本人sessionを区別する。Web未通信時も端末内機能の状態を変えない。更新は同一署名APKの上書きのみ、仕事数/Tool選択とAPK hashの前後照合、実機画面・キーボード/下書きの既存非破壊試験を合格条件とする。対象違い・署名不一致なら停止し、削除再導入へ切り替えない。URL変更は明示された配備先と照合し、OS image/flashや本番Cloud受入を外観更新の完了に含めない。

## 登録不要の出力テスト（WEB04 / 2026-10-09）

目的・体験: `/test` は既存catalogの全項目を列挙し、サンプル一括実行、編集入力の個別実行、結果のコピー・保存・リセットを提供する。実処理・模擬データ・接続待ちを同じ状態語で表示する。CSV、文章、企画、受付文、照合は既存の純粋関数を再利用し、Zema試験はlib/workflow.tsへsample=trueの記録を通す。本番完了へ昇格しない。

責任・入力出力: ROCKのstateless POST `/api/output-tests`。同一Origin/JSONのみ、本文64KB・欄12,000文字まで。固定allowlist以外の入力・Tool・owner指定を拒否。応答はid/mode/status/output/details/executedAt。Provider、DB、Broker、Wallet、本番保存API、任意shellは呼ばない。模擬Marketは入力検査のみ、Walletは表示計算のみ、実注文・実残高ではない。未接続Toolのanswerはnull/not_run。

状態・保存・失敗復旧: idle→running→output/not_run/error。失敗は当該項目だけに表示し、再実行可能。編集時に古い出力を破棄。一括はサンプルへ戻すと明示。結果と入力はReactの画面メモリのみ、再読込で消去。アプリDBへの記録なし、ログへ本文を書かず、Cache-Control:no-store。利用者操作でテキスト/CSV/全結果JSONを端末へ保存。アプリ自身の保持・削除と配信基盤のメタデータログは区別する。

承認・合格・未決定: 登録不要でも本番の本人性・予算・同意を緩和しない。サンプルは架空と明示し、法務/特許は受付整理に限定。外部公開・送金・AI API呼出なし。全catalog coverage、入力変化、境界拒否、workflow未完了、ブラウザ一括/個別/保存/リセット、verifyで検収する。Cloud鍵・利用枠、候補Toolの実行環境、Pixel端末内modelは別途OWNER/EXTERNALの準備と実受入が必要。撤去時はheader入口と/test・stateless endpointを除去、旧配備へrollbackできる。

## Pixel内の登録不要テストモード（OS10 / 2026-10-09）

目的・体験: 利用者の「ピクセルに入ってんの」「テストでなんでもできる状態にして」を受け、既存ShellのHome先頭にテストモードを置く。別ブラウザではなくnative Activityで17項目のサンプル一括、機能選択、入力変更、実行、出力、コピー、SAF保存、リセットを提供する。8実処理・9模擬の別と未実施の範囲を各結果に埋め込む。出典整理・無料記事は既存ArticleToolsを再利用。CSVは上限付きのUTF-8簡易変換で、Webの文字コード/納品契約の全移植ではない。

責任・入力出力: ROCKのOutputTestToolsはpure Javaで固定17 IDのみ。入力/補足は各12,000文字。出力はテキスト、全結果exportはrockstaros-native-output-tests/1 JSON。model応答・録音・HTTP取得の模擬結果は推論/取得成功と表示しない。ShellConnection・DB・Providerを呼ばず、ShellのINTERNET権限なしを維持する。TestModeActivityはexported=false、明示したHome入口から起動する。通常Brokerの本人性・予算・同意・仕事状態を変更しない。Zema表示例は本番workflowではなくfixtureとし、正式な仕事を作らない。

状態・保存・復旧: idle→running→output/error。入力編集で旧出力を破棄し、入力不正は当該項目だけ失敗、一括は他項目を続行。重複クリックをbusyで抑止。画面メモリだけで保持、閉じると破棄。回転はretained instanceで入力を保持、実行中断は再試行する。自動保存・backupへの組込なし。本人がコピーまたはDocument Pickerで保存先を選んだ場合だけ端末へ出力する。保存失敗はメッセージとコピーの代替を提示。登録・課金・送金・外部公開なし。

配布・承認・合格: 接続Pixel 10 GL066/frankelのAPK署名一致と更新前hashを確認し、adb install -rで非破壊更新する。旧APKをGit外へ保持。Core単体、Article parity、SDK/APK/lint、OS/design/verify、同一APK実機4新規試験と既存7試験、Broker件数・選択の不変、候補/実機hash一致を別々に記録。OS flash・初期化・正式OS受入へ換算しない。

実機受入: 同一署名のShell APKを非破壊更新し、実機hash 9cdb428de6a144fc7a47ed0244dc81e62b4386b78d8976db38e942eeb9e2b1d4を照合。Core116・SDK7・parity36・build/lint・実機11/11・全体verify exit0が合格。17結果とexport JSON内容、入力編集、clipboard、reset、Homeからnative起動、Broker件数/選択の不変を確認。SAF保存先を実際に選んだファイル書込は未検証。生画像・ログはGit外、要約は下記証拠へ保存。

未決定: 本物のcloud AIにはOWNERの接続先・鍵・利用枠、local AIには署名済みmodelの選定・導入受入、外部ToolにはProvider環境が必要。模擬結果を本番許可やTool成功へ昇格しない。次段階は対象を特定した実接続受入。証拠はdocs/evidence/pixel-native-testing.json。

## Game / IPと現実の共通出力（2026-10-09）

2026-10-20の本人列挙を[Game・制作・交換の実行順](workstreams/08-game-market-fund.md#game-creation-material-20261020)、[Material Inventionの実行順](workstreams/11-material-invention-avocado-mini.md#material-creation-20261020)、[開発運営の受入順](workstreams/10-git-ci-operations.md#operations-acceptance-20261020)へ結ぶ。作品/権利/版と同一仕事の現実・ゲーム成果、隔離された不正code、作者pointとWallet記帳の分離、交換の本人同意/両台帳、Miniの計測・共同表示/光学安全、物質候補/差分再計算/CAD/BIM・物理試験を独立して受け入れる。予測市場、ファンド、実交換は別gate。現状のSDK/合成fixture/設計やPAPERを実game、本番取引、Mini実機、運用合格へ昇格させない。

RockstarOSは現実とGTAへの作品・仕事・Agent出力を結ぶ。既存Coreのowner／job／artifact／approval／receiptを保持し、Zemaの親仕事へ対象別配送とゲーム由来eventを接続する。[詳細仕様](gta-reality-bridge.md)に全11設計項目を定義。ゲームから戻るeventは非信頼入力で、現実の送信・購入・機器操作は既存Brokerで別認可する。FiveMは検証候補で、OS本体の受入・GTA実動作・提携を完了扱いにしない。

2026-10-18の明示訂正により、Gameは特定ゲームとの連携に加え、**ゲームを作る経路と、他の作者が作ったゲームを持ち込んで遊ぶ経路の両方**を持つ。共通作品ID・版・digestで制作、試遊、export、持込み、互換性診断、起動、入力、本人別save、更新／rollbackを結ぶ。Sky／Zemaの仕事・承認・費用はゲーム実行環境と別の権限で扱う。機種ごとのCPU／GPU／入力／保存／権利を診断し、ProとMiniの対応はそれぞれの実測で判定する。目的、責任、入出力、状態、失敗、復旧、承認、合格条件と未決定の決め方は[Game creation and intake](workstreams/08-game-market-fund.md#game-creation-and-intake)を正本とし、公式資料と現行実装との差・実装順は[実現調査](game-creation-and-intake-research.md)に記録する。これは設計であり、任意game binaryの実行、全engine互換、公開・販売、実機受入を意味しない。

## 大学別NFC Sky（2026-10-12、WEB06 / SKY21）

利用者の追加指示で5大学別のbrowser入口と大学別brief、一般MCP5枠・対象学生6枠を追加。さらに大学別PWA追加、Sky内Agent Hubでの購入/仕事表示、Sky配下でのZema管理画面の再利用を指示。主担当Web / PWA / Sites、ROCK。OS完成を必須にせず、NFCはURL入口とする。本人単位の枠管理を実装し、有料拡張の価格・cloud MCP/Agent実行・Apple Pay・公開同一artifact・実NFC/端末の受入は別gateに残す。[目的・状態・保存・失敗/復旧・責任・合格条件](sky-tools-complete-design.md#大学別nfc-sky2026-10-12)。

### Webゲームの起動入口（2026-10-15）

`/game`は固定したGTA Web URLを標準／軽量設定で別タブ起動し、本人の手動試験メモを既存home-intent経由でZema下書きへ引き継ぐ。目的、責任、入力上限、状態、保存・復旧、承認と未受入範囲は[Webゲーム連携契約](gta-reality-bridge.md#12-webゲームの起動とzemaへの手動引継ぎ2026-10-15)を参照。ゲーム内API同期、native組込、Mini／Pro実機の合格を意味しない。

### FiveMとの世界境界bridge（Mac先行）

最新の明示指示でFiveMを選択。本人承認したカードを同一NUIへ届け、確認を同じ仕事へ返す。ゲーム側の依頼は未承認下書き。既存workflow/composition契約を試験専用ローカル保存で利用する。権限・入出力・保存・失敗・復旧・合格条件・本番/実機の残条件は[GTA bridge §13](gta-reality-bridge.md#13-fivem選択とmac先行の世界境界bridge2026-10-15)を正本とする。主担当AI06/ROCK、実ゲームはJOINT。


### MacのAgent仕事（2026-10-15、AI06 / ROCK）

利用者の「繋げるやつ全部となければ作成」により、対象名の回答待ちを解除。既存compositionの利用可能5 ToolをローカルAgentとして一覧化し、本人が最大6手順のAgentを作成できる。LLM推論ではない。ゲームNUIで目的・素材を依頼し、現実側で内容を承認して実処理、同じ仕事IDの最大10版を継続、成果を明示共有、検収/停止する。既存workflow契約・revision・操作IDを維持しSQLiteへ保存。ゲーム側には現実側の原稿・設定・過去版を出さず、共有した成果だけ戻す。最大100仕事/20 custom Agent、素材UTF-8 8000バイト、停止/失敗を成功に昇格しない。失敗時は設定済みAgentまたは次の版で修正する。無料記事Toolは標準設定だけでは実行できず、詳細設定が必要。

Sky外部AgentはROCK_BRIDGE_SKY_ORIGIN（HTTPS origin）とROCK_BRIDGE_SKY_TOKEN（既存本人session）の明示設定で登録一覧を取得するread-only connector。資格情報はgateway内のみ。未設定・認証失敗は未接続表示、登録済みを実行可能にしない。外部実行は既存見積/予算/Broker/delegation/usage経路の接続と受入が未完了。GTA VI、実FiveM、本番Zema、通貨交換、skin販売の成功ではない。

合格証拠: tests/fivem-bridge.test.mjs 11/11＋旧launcher 2/2、Mac UIで仕事cd237d92-84cb-4c33-a334-875fcf2d3bcdの出典整理→同ID第2版→明示共有→completedとcustom Agent作成。次は外部接続の本人環境・許可済み予算を設定して別受入する。


### FivePlay公開システム解析とadapter（2026-10-15、AI06）

利用者が指定したFivePlay軽量URLを解析。build 8b0b5899edはWASM/WebGPU、GPU/IO worker、IndexedDB userdata、COOP/COEPのWeb版。FiveMやGTA VI公式APIと混同しない。Mac IABで6%→No progress表示、world未到達。ロード表示はタイマーで6ポイントまで進むため起動成功証拠ではない。原因は未確定。

ゲームメモリや通貨を変更する入口は確認できず、公開コードから連携に使えるのは起動設定と画面上の診断。本人入力の仕事端末をChrome拡張として重ね、専用localhost:5217 gatewayにagent_requestを送り、同じworkflowで現実側の実行・継続・共有を扱う。目的/素材/Agentが入力、仕事要約/明示共有成果が出力。専用SQLiteとsession token、1時間失効、同ID再照会、原稿非公開、外部実行なし。拡張実導入は未受入。詳細・失敗/復旧・権限・受入手順はtoolkits/fiveplay-adapter/README.md。14/14対象試験＋lint合格。次は利用者確認後の拡張導入と同site UI往復、ゲームengine起動は提供者側の問題として独立して切り分ける。


## Mini単体のWebゲーム設計（2026-10-15）

利用者の追加指示により、主担当MAT15/JOINT、Game AI06連携として[R5ゲーム実行設計](avocado-mini-r5/game-runtime-design.md)を追加。1本自律・200mm以内・別Edge Hub不要を維持し、WASM/WebGPU、GPU driver、メモリ比較、電源/熱、OS/game focus、同一仕事IDの継続、原稿非公開、失敗/復旧、MG01〜07の合格条件を定義。Chrome拡張はMac参照adapterで、Mini本番はOS操作面/Brokerへ移植する。Mini実装・実機・FivePlay起動・裸眼表示・製造の合格ではない。原本packageは不変。


## 建築埋込・着脱・衛星経由の携帯Wi-Fi（2026-10-15）

利用者の画像と明示指示により、[R5着脱通信設計](avocado-mini-r5/embedded-portable-connectivity.md)を追加。建築/家具側dockと可搬core、取り外し後の電源、衛星WANとWi-Fi LAN、job継続と場所権限失効、給電/熱/通信の失敗復旧、DP01〜05を定義。従来の外部給電のみの前提を変更するが、battery部品・衛星方式は未選定。1本自律/200mm以内/別演算Hub不要を維持。画像は機構参考であり、屋内衛星通信・実機・施工・製造合格ではない。MAT15/18の設計追補、原本packageは不変。


### Agent利用料の月次後払い（2026-10-15）

利用者指示により、Agent利用を契約accountごとに毎月まとめて請求する方向へ更新。[請求・未払い対応設計](sky-billing.md)で単価/見積/上限、usage照合、支払方法、通知/猶予/有料実行制限/入金復旧/適法な回収を定義。通信・端末・OS・Agentの明細は分ける。銀行口座をOSが直接凍結する権限は持たせない。後払い与信・Provider sandbox・実請求は未受入。

2026-10-19の追加指示: PixelのSkyから既存Linuxを起動し、依頼・下書き確認・Android標準保存・停止を行う[本人用入口](sky-tools-complete-design.md#sky-private-linux-deployment)。固定localhost契約と公開Launcherを使い、一般公開は保留。[実機証拠](evidence/sky-pixel-linux-entry.json)で旧ブラウザ経路と分けて受け入れる。

### Sky追加済み担当の管理とEveへの引継ぎ

`/sky/agents`は、Skyで追加したToolと自分用文章担当の役割・LLM・有効状態を本人別に保存する管理入口。Eveでの依頼/進捗/成果と既存workflowは再利用し、OSの権限・利用権・予算強制を越えない。LLM要求時に本人と現在revisionを再検査する。購入、provider準備、Tool固有LLM、端末内Linuxの実行能力は独立状態である。入出力から復旧/承認/合格条件までの正本は[Sky管理詳細](sky-tools-complete-design.md#sky-agent-library)。これはWeb管理面の追加であり、Pixel full OSや任意Agent runtimeの受入ではない。

### 任意追加のWallet/Marketとニュース配信元

2026-10-20の明示変更でWallet/MarketをSkyから本人が追加する機能にする。追加時の使い道と、後に必要となる金融/KYC情報・承認は分離する。Home/共通ナビは本人の追加状態を使い、外しても記録・資産・契約を削除しない。[11項目の詳細](sky-tools-complete-design.md#sky-optional-features)。さらにニュースはSkyで配信元を追加してHome timelineに表示する要件を記録し、未確定配信元の初期候補をXとする。[ニュース要件と未実装境界](sky-tools-complete-design.md#news-source-plugins)。ニュース原文を政治的な理由だけで除外せず、出典/要約/反証/訂正を追跡する。学習済みニュースLLMとX連携の完成は意味しない。

2026-10-21の本人指示で[Eve News 1.0のモデル・記事契約](llm-evaluation-architecture.md#eve-news-1-0)を追加した。OSは本人、source利用権、job/revision、model profile、掲載権限、予算/停止、元記事と訂正履歴の保存を強制する。Eveは情報源と根拠付き下書き、検収、掲載/訂正の状態を表示し、Skyは許諾済み配信元の接続と出典を供給する。モデルの草稿を公開許可や確認済み事実へ昇格させない。政治的立場だけで原文を除外しない一方、未確認の主張は帰属/未確認を明示し、初期公開を編集検収に通す。現在は設計のみで記事公開とニュース専用weightsの受入は未実施。

同日の`/os`ニュース欄は、現行`components/home-screen.tsx`のSkyタイムライン内に置き、旧アイコン型Homeを別画面として重ねない。Sky側のGDELT DOC 2.0 metadata adapterが返した見出し・元URL・媒体domain・GDELT検出日時を表示する。OSは外部見出しを非信頼表示として扱い、本人操作で元記事へ移動する。APIは固定query、HTTPS link検査、重複除去、短期cache、取得失敗時の古さ表示、期限後の失敗を持つ。Eve News草稿/記事の掲載権限や本人別仕事とは別で、`/os/eve`へはモデル受入後に接続する。

### HomeとSkyを一つの情報マーケットへ（2026-10-20 明示変更）

`/`で配信元の情報、Hugging Faceのモデル/データ/Spaces、追加済み担当と既存Tool/MCPを扱う。`/sky`は互換入口。Eveは依頼/進捗/承認/成果を扱い、本人・利用権・権限・予算は既存OS runtimeで強制する。発見の楽しさを暮らしや制作の成果へ結ぶことが本人の追加設計意図。HF reference追加、モデル導入、推論、Tool job、購入を別状態とする。料金、固定API、保存、同意、失敗/復旧、合格条件と未決定の正本は[情報マーケット詳細](sky-tools-complete-design.md#sky-information-market)。local検索/Add/Eve draftと選択した導入済みQwenの実文章応答は確認。Xは本人がAdd済みだが公式配信429で実投稿未受入。Pixel、全OS、本番請求、公開の合格へ転用しない。

<a id="personal-os-world-versions"></a>
## 自分のRockstarOS版から、自分のWorldを作る（2026-10-20 明示方針・設計）

本人の「OSは自分で好きなバージョンを作れる形」「好きな国を作る話の導入」を、個人のOS版の作成→共有→参加→共同運営へ続く製品方針として採用する。名称は作成者が選べる。ここでいうWorldは参加者が選んで入るネット上の共同環境を指す。現在地は設計反映であり、版作成UI、Worldの複数本人運営、DAOの実決済が完成した意味ではない。

1. **目的と利用者**: 個人・作者・コミュニティーが、自分の暮らし/制作/仕事/ゲームに合うOS版を作り、必要なら他者を招待する。個人利用だけでも成立し、国づくり/DAOへの参加は任意。
2. **体験**: 「自分のOSを作る」→空の版または他者の版を複製→名前/ロゴ/色/配置→標準LLM/Agent/Tool/情報源→保存/共有→World作成→ルールと参加方法を示して招待。参加者は内容・権限・料金・改訂を確認し、参加/退出/自分用複製を選ぶ。仕事と成果はそのWorldの文脈から同じEveへ渡す。
3. **責任**: ROCK Coreが本人、権限、予算、隔離、実行receipt、保存/復旧を強制する。作者はOS版の内容と更新、World運営者は参加/役割/ルール改訂を担当。World管理者は参加者の私物データ・秘密・個人予算を自動取得しない。LLMはルール提案者になれるが権限発行者にはならない。
4. **版と入出力**: Core releaseとOS edition revisionを別管理。`editionId/ownerId/revision/parentDigest/coreCompatibility/deviceCapabilities/theme/catalogRefs/defaultModels/newsRefs/ruleSetRef`を版付きmanifestで持つ。Worldは `worldId/editionRevision/rulesRevision/membershipRevision` を参照。仕事は開始時の版と承認を固定し、途中の国のルール変更で課金/権限を拡張しない。
5. **変えられる範囲**: 名称・表示・標準能力・自作Agent/ゲーム・情報源・通知・操作入口、参加資格・役割・提案/投票・共同制作・成果評価/分配のルール。見た目のテンプレートからコードを持つ拡張まで段階を用意する。独自native OS binaryの作成も拡張先として残し、各機種のDSP・署名・更新・純正復旧・同一image受入を通す。Web/client用editionの成功をnative image合格にしない。
6. **状態・保存**: draft→validated→preview→shared→active→superseded/withdrawn。共有前に本人が保存scopeを選ぶ。manifest/公開asset/配布許諾付き参照と本人の秘密/仕事を分離する。複製時は新ID・新owner・親digestを付け、Cookie/API鍵/請求情報/原稿/他者会員を複製しない。World単位で私有/共有データを分け、退出時の持出し/保持/共有成果の扱いを参加前に示す。
7. **構成アルゴリズム**: bounded schema検証→依存graphのcycle/版競合検査→端末能力と要求能力の照合→権限/価格/送信先の差分→作者署名/hash確認→本人のexact revision承認→staging→CASで有効版を切替→health確認。失敗時は旧pointerへ戻す。署名は作者の同一性であり安全保証ではない。対応しない能力は理由と代替先を示し、勝手に有料Cloudへ移さない。schemaの上限とcanonical encodingは実装時に固定fixtureで決める。
8. **圏外・競合・復旧**: 確定済みeditionはローカルで読める範囲を示す。共有改訂は接続回復後に現revisionを照合し、他者改訂を上書きしない。OS版を切替/退出しても既存jobの予算・成果・台帳を削除しない。非互換Core更新はactive版を維持して移行preview/rollbackを用意する。再起動と別host復元を別受入にする。
9. **ルール・経済・承認**: Worldの憲法/ルールは版を固定し、役割、提案、投票方法、変更/退出条件を参加前に示す。DAO、IP/NFT、Run to Earnは既存Wallet/権利/receipt契約へ接続する。稼働回数や自己申告を売上にせず、検収済み成果・入金・取消を照合して分配する。月16 USD、含有枠/超過、商品代・通信・外部実費・作者売上を分ける既存方針を維持。World作成/参加だけで他者への課金やオンチェーン操作を実行しない。
10. **合格条件**: 個人版の作成→preview→保存/再読込→export/import→他者の独立した複製を同じmanifestで照合。未知field、秘密混入、権限拡張、非対応端末、同時改訂、更新失敗、旧版復帰を拒否/回復する。Worldは別々の本人による招待/参加/役割/ルール変更/退出/個人データ分離を実測する。native版、DAO/本番請求は各専用gate。
11. **実装順と未決定**: 主担当Product/UX・ROCK、既存OS10/SKY21に接続。最初はedition schema・本人draft・preview・export/import、次にSkyの発見/共有/複製、Worldの複数本人とrule revision、既存job/成果/分配との接続、最後に機種別nativeビルド。初期Worldのルール、投票方式、公開範囲、料金/分配と保持期間は作者/参加者の選択として設計し、サンプルを製品の固定制度にしない。

本人Xの専用表示経路は[Sky/X専用ビュー詳細](sky-tools-complete-design.md#x-account-view)。Pixel追加APKで本人が投稿表示を確認したことと、Web Home内の混在timeline/全OS image受入を分ける。


## Eveの永続記憶とSkyコミュニティー（OS10 / SKY21、2026-10-20）

1. **目的・利用者**: 同じ本人がPixel・PC・将来のMiniで会話と仕事の文脈を引き継ぐ。Skyは自身のタイムラインと、アカウントから作れるコミュニティーを提供する。Miniの管理SIは製品方向で、センサー能力や需要を実証した意味ではない。
2. **一周の体験**: Eveへ話す→暗号化保存→同じaccountで履歴復元→過去の本人発言を出典付きで参照。Skyはサインイン→公開名→コミュニティー作成/参加→投稿/フォロー→共有モデルや公開Toolを自分のSkyへ追加→担当とLLMを設定→Eveへ依頼する。作品・OS構成はHTTPS参照の共有までで、OS版builder/安全な適用/実機OS交換は別の未受入範囲。
3. **責任・禁止権限**: ROCKがWeb/API/DB/ACL/索引/表示を担当、EXTERNALが認証gateway・D1・モデル/配信元、JOINTが実Provider/実機復元、OWNERが公開/保存/共有範囲を決める。投稿・参加ルール・過去発言をshell権限、支払承認、Tool成功に昇格しない。Eveは自動公開しない。
4. **入出力・ID・版・上限**: account IDと公開profile UUIDを分離。Eveはowner+thread UUID、revision CAS、message ID、16発言/batch・32,000文字/発言、取得100発言/page・会話一覧50/page・参照最大6件。Skyはcommunity/post UUID、本文1,000文字、名前60文字、説明300文字、ルール500文字、投稿20/page、表示コミュニティー100、作成者あたり稼働50、保存投稿100/24h・follow500の初期上限。公開ルール/名前は現版固定（公開名のみ変更可能）、規約改定・投票・DAOは実装範囲外。
5. **状態・失敗**: 未認証401、プロフィール未設定は作成案内、Eve暗号鍵未設定503、別端末競合409、削除済み再保存410。communityはpublicまたはmembers、本人は未参加→ルール確認→参加→退出。作成者は招待発行/参加解除/投稿削除/終了可能。終了は投稿と参加を削除しarchive記録を保持。解除はbanではなく、有効な招待を持つ人の再参加は可能。
6. **保存・削除・backup**: D1にEve header/messagesをAES-256-GCM、owner別HKDF鍵で暗号化し、検索語はHMAC索引。保持に短期TTLを設けず、本人がexport/削除する。削除は本文/索引消去と最小tombstoneで古い端末の復活を拒否。サーバー管理鍵なのでE2EEではない。DBと鍵の本番backup/失効/復旧訓練は未受入。Skyの公開本文/プロフィール/ルールは共有DBの通常データ、members投稿は読取ACLで制限しE2EEではない。招待はhash保存、リンクの再発行で前token失効。個人会話・秘密鍵・指紋/顔のtemplateをsocialへ転送しない。
7. **offline・再送・不明結果**: 接続失敗は未保存と表示し端末メモリー上の入力を維持。Eveは差分queue、競合後は再読込まで書込停止。community/postの再送は同一UUIDと同一payloadだけを受け入れる。Skyおすすめはfollow優先、次に参加場所、各群で新しい順。理由を表示し、反応時間や思想を推定しない。follow変更後はcursorを更新し再取得する。
8. **更新・互換・復旧**: 既存migrationは保ち0070/0071を追加。Eve envelopeにkeyIdを持ち旧鍵読取を許す。鍵ring更新と再暗号化/鍵回収は本番運用gate。旧owner不明のsessionStorage履歴は自動移送しない。復元した会話のactiveRequestは実行権として復活させない。共有URLは導入/実行の証拠ではなく、既存Sky/Broker/料金の確認へ戻す。
9. **安全・外部承認**: same-origin、account境界、private communityのmembership、投稿者/作成者権限をserverで強制。外部URLはHTTPS、実行しない。公開Toolは既存catalog ID、HF追加は既存metadata検証を使う。検索/追加は外部通信を伴い利用条件を引き継ぐ。X個人画面は補助入口として保持し、Skyのnative feedとは区別。Xの本人follow/おすすめは未接続で、cookie中継やscrapingで取り込まない。一般公開前のUGC通報/異議/運営監査と負荷試験は未受入。
10. **環境・合格証拠**: host SQLite/crypto/ACL試験、Worker/D1 API認証/Origin/競合/復元/招待、ローカルUIを別々に記録する。[今回の証拠](evidence/eve-memory-sky-community.json)。ローカルfixtureを実device間、実Mini、公開D1、本番復旧、実X連携の合格へ流用しない。
11. **未決定・決め方**: OWNERがMiniの具体的sensor/健康データ種と同意/保持を指定後、機種別能力と別schemaで設計する。ROCK/OWNERで本番鍵保管・復旧目標・UGC運営・本人削除/退会と法定保持・規模上限を決め、別account/盗難端末/招待漏洩/負荷で受入。eSIM発行/実課金/専用Linux運用とOS image受入は既存gateを維持する。


<a id="keyed-community-os"></a>
## 専用鍵付きコミュニティーOS（OS10/SKY21）

2026-10-20、本人が「コミュニティーごとのルール・デザイン・LLM・Agent」「リンクでなく追加して使う」「専用鍵がないと入れない」を明示したため、前のリンク共有/公開参加の範囲を更新する。

1. **目的と利用者**: コミュニティー作者が自分たちのOS構成を作り、鍵を持つ参加者がRockstarOS上へ追加して使う。Web/client共通構成であり、bootable OS imageや全機種実機受入とは別。
2. **一周の体験**: account/公開名→community作成とアクセス鍵/管理者復旧鍵→ルール・投稿方針・デザイン・LLM・最大6追加Agentを編集→版を共有→招待鍵でルール確認/参加→構成/digestを確認→追加/適用→Skyの本人用Agentと標準Eveで使用。共有投稿にも版付きAdd入口を置く。JSON export/importは設定を新しい編集案に読み込み、鍵や参加権をコピーしない。
3. **責任と禁止権限**: ROCKがschema/ACL/版/追加/CAS/見た目/Eve接続、EXTERNALが認証・保存・実model/runtime、JOINTが実Provider/端末、OWNERがルール・共有・鍵配付・費用を担当。作者のルールはLLMへの非信頼設定で、Core権限/本人承認/予算上限を書換えない。communityの投稿方針（全メンバー/作成者のみ）はserverで強制する。
4. **ID・版・入出力・上限**: manifest `rockstar-community-os/1`、community UUID+整数版、正規化JSON SHA-256、本人別install revision/active、作成者publish CAS。背景/文字/アクセントは6桁色、文字contrastは内部基準4.5以上、stream/cards、round/square。ルール500字、OS名40字、標準LLMと追加Agent6（役割600字/人）、既存LLM/Tool ID検証を使う。任意CSS/HTML/script/endpoint/秘密/権限フィールドは拒否。Agentコピーは既存保存100件枠を共有する。
5. **状態と失敗**: communityは常に鍵必須。未認証401、accountはあるが鍵なし/誤鍵/他人鍵/失効/非参加403、古いルール/構成/追加状態409。招待鍵→最新ルール確認→本人用アクセス鍵を登録→入室。旧communityは初回だけ作成者が鍵を発行でき、発行後はaccountだけで再発行できない。復旧鍵でアクセス鍵/復旧鍵を更新する。管理者解除は再参加も拒否し、管理者が許可してから招待で戻す。
6. **保存・保持・削除・backup**: serverは招待/アクセス/復旧鍵のSHA-256 hashのみ、版snapshotは追記、installはowner別保存。各鍵は256bit乱数。clientはprofile別localStorageにアクセス/復旧鍵を保存し、本人が`.rockkey`へbackup/importする。これはhardware-backed keyやE2EEではなく、同一originのscriptと端末を信頼するWeb Preview。管理者の自分用鍵と配付する招待鍵を分ける。OS構成に鍵/API credential/会話/支払権限を含めない。コミュニティー本文自体はE2EE化していない。
7. **offline・再送・重複・不明結果**: 鍵はURL/queryへ送らず同一originの専用headerでaccountと併用。作成/参加前にclient側で鍵を保持し応答消失時にも再照合できる。onlineで鍵・membershipを確認できなければcommunity取得/追加を許可しない。版/ownerから決まるAgent IDでAdd再送を重複コピーにしない。公開版はimmutableで、更新の自動適用はしない。
8. **更新・互換・復旧**: 既存migrationを保ち0072を追加、旧public参加/旧招待を鍵必須へ切替え、投稿とEve履歴は保持。版ごとに本人用Agentコピーを追加し、以前の個人編集を上書きしない。過去版へ戻せるが既存コピーは本人設定を維持。activeは本人あたり一つ、別画面の選択競合を拒否。「標準に戻す」は外観/defaultを戻し、本人のAgentコピー・会話・仕事は削除しない。
9. **安全と外部承認**: 失効/退出/鍵紛失後の新規community API読取/書込/版取得/Addを拒否。active profileは次回確認（focus/操作/最大60秒poll）で解除表示となる。既に本人へコピーされた設定や会話を遠隔消去しない。その個人コピーで本人のmodelを使う権限と、communityへ入る権限は別。model本体導入/有料推論/外部作用はAddでは始まらず、既存Eve・workflow・Broker・料金gateを使う。実行中jobの権限を作者が獲得しない。
10. **合格環境と証拠**: host SQLite/crypto/schema/key isolation、Worker/D1 auth/Origin/版/Add/CAS、local browserで鍵発行→編集→共有→追加→Eveを分けて受入。[証拠](evidence/community-os-keyed-editions.json)。旧リンクのみ/旧public参加の証拠は当時の履歴として維持し、今回の成功に読み替えない。
11. **未決定と決め方**: OWNER/ROCKでproductionの鍵保管（passkey/端末Keystore等）、盗難端末・紛失時の本人再確認、運営/監査/通報・規模・licenseを決め、実account/別実機/負荷/復旧を受け入れる。現在の構成共有と本番security audit、署名済みnative image、実eSIM/課金/全端末対応は別gate。

## 2026-10-21 — 生体認証・生体情報の本番利用条件

本人が「生体認証とか入るぐらいのレベル」を明示。現状はDeveloper Previewで、生体情報を本番保存できる受入は未合格。GrapheneOS上のAPK/AVFと、独自の署名済み全OS受入を区別する。

- 指紋/顔の認証原本はOSのTEE/Secure Element内で処理し、Eve/LLM/Linux/クラウドへ原本を送らない。認証済みという自己申告booleanを権限へ昇格させず、認証で利用可能になった鍵の署名・challengeを検証する。
- 今回のEve同期tokenはKeystore AES-GCMと端末unlockで保護しているが、BiometricPromptによる鍵の都度解錠は未実装。暗号化しているだけで生体認証済みとはしない。
- 会話履歴はowner別AES-GCM/HKDF、運営管理鍵で復号可能。E2EE未受入。未知の生体認証フィールドはAPI schemaで拒否するが、自由文内の生体情報を完全検出/除去するものではない。
- コミュニティーアクセス/復旧鍵のブラウザlocalStorage保管は残る弱点。専用vault/鍵解錠/失効/回復の受入前に高機密情報の保管庫と表示しない。
- 心拍/睡眠等のsensor streamは別のsensitive vault、目的別権限、保持期限、本人の解除/削除、監査を要する。SIの自動実行用低権限鍵と、高機密vaultの認証必須鍵を分ける。
- 端末紛失/悪性Agent/盗難session/管理側侵害/復旧を負例にした独立検収が未受入。Mini/Proの安全な鍵保管能力は機種別に受け入れ、Pixelの合格を移さない。eSIM利用権を本人認証やデータ暗号化の代用にしない。

一次資料: https://source.android.com/docs/security/features/biometric 、 https://developer.android.com/identity/sign-in/biometric-auth 、 https://grapheneos.org/features 。観測はsource照合であり侵入試験ではない。

## 共通OSフレーム（2026-10-21、本人スクリーンショットによる明示修正）

1. 目的: Sky/HomeからEveへ移動しても色、ヘッダー、主要タブの見た目と操作が切り替わらない。
2. 利用体験: ivory/forest green/bronzeの共通枠、同じ5項目（Sky・探す・Eve・追加したAgent・コミュニティー）。Wallet/Marketは既存の任意追加導線を使う。
3. 責任: Web/ROCK。コミュニティー本文の装飾と、OSの共通操作枠の安定性を分ける。権限や鍵を外見によって変えない。
4. 入出力: 現在path/hashから選択状態を出し、既存routeへ遷移。public /osとlocalhostのroute差をosRouteHrefで解決する。
5. 状態: 同じcomponentから5項目を描画。feature追加/解除で主要タブの数を変えない。
6. 保存: デザイン修正は会話・仕事・成果やコミュニティー設定の保存内容を変えない。
7. 失敗: 非対応public routeをOS prefixへ勝手に書き換えない。Wallet/Market/Settingsは受入済み既存routeを維持。
8. 復旧: 通常遷移/戻る/再読込でpath/hashから選択項目を復元。実行中guardを維持。
9. 承認: 本人が示したHome/Eve差異の修正。契約・費用・新しい外部権限の承認を兼ねない。
10. 合格条件: 共通navigation契約3件、既存home/style/service契約21件と型検査合格。ローカルの実画面比較済み。公開Sitesの旧Home全体移行は別受入で、今回ローカルの合格を公開全体へ転用しない。
11. 未決定: 公開旧Homeと新timelineのschema差を照合してから移行。独自OS image/Pixel nativeの見た目受入は別。

### Eve同一会話の実機往復と公開v94

本人SSOとPixelへの明示承認後、Web→Pixel内Linux→Web、Pixelの同じ会話→Webを実行し、2依頼・4発言を確認した。下書きであり内容の確認済みへ昇格させない。旧20件を保持して22件、継続前の21件は内容も保持、担当6個・モデル2個。最新ニュースを含む公開ソースへ共通フレームとowner応答照合を追加し、公開v94を配備した。推論先の「端末内」と、会話を送信するクラウド履歴を明確に表示する。根拠と未完了は docs/evidence/eve-cross-device-sync.json。生体vault/E2EE/鍵全損回復/独立検収/全OS/本番課金は未受入。USB再接続後、最終候補9eca1805の読取り専用検査と保存文面を確認。既存22件内容一致、モデル2個・担当6個を保全し、画面点灯設定0と元の試験APK d21e9442へ復旧した。新規推論は増やしていない。動画の「同期未完了」の現在原因・native画面整理は未解決として保持する。


## メインドメインの会員登録付きWebOS（2026-10-21）

1. 目的: 本人の「avoado.siのmainドメインをosで走らせる、会員登録付きwebos」を採用し、`https://avoado.si/`をRockstarOSのSkyホームにする。
2. 利用体験: メイン画面で登録・ログインし、同じアカウントのEve・会話・仕事・成果へ進む。既存`/os`と`/os/eve`は互換入口として保持する。
3. 責任: ROCK Web/PWA/Sites（HOME01/WEB04/OS10/SKY21）がdomain router・UI・認証照会、EXTERNALが既存Sites認証/配信、OWNERが本人ログインと端末承認を担当する。
4. 入出力: main-domain rootのrequestを既存Sky Workerへ渡す。`GET /api/os/account`は既存requestUserを使い、本人識別子や履歴を返さずsignedInだけを返す。
5. 状態: 確認中、未ログイン、接続済み、照会失敗を区別する。公開v95の初期登録/ログインは既存SitesのChatGPTサインインを使う。本人の登録停止の指示を受け、v99は下記のID/パスワードと任意パスキー、独立Web Cookieを使う。credentialの入力・最終登録は本人が行う。
6. 保存: 新しい顧客DB/料金台帳を作らない。同じ既存accountの暗号化Eve履歴とowner別仕事を使う。既存Pixel22件を自動uploadしない。
7. 失敗: 匿名は401、照会異常は503/no-store。未確認をログイン成功と表示せず、再確認を案内する。既存データは消さない。
8. 復旧: `/os`と端末の保存済みURL、既存承認済み端末を保持し、再読込/focusでaccount状態を照会する。Sky/Eveの共通5タブから同じrootへ戻れる。
9. 承認: main-domain入口の変更は本人の明示指示。会員登録だけで契約・有料実行・外部送信範囲を増やさない。月16ドル、一定枠＋超過従量の既存設計を維持し、未受入の課金を始めない。
10. 合格条件: rootがMini proxyを通らずSkyへ到達、既存Mini preorder/Columbiaを保全、匿名照会401・既存本人照会200、main Home→Eve→同じ4発言、型検査/既存verifyを別々に記録する。配備版と証拠は`docs/evidence/eve-cross-device-sync.json`のmainDomainWebOsで追う。
11. 未完了: 独自メール登録、常時background実行、本番請求、Run to Earn、生体vault、全OS image、一般ローンチの受入は別gate。登録と実行利用権、SIM状態、料金を同一視しない。

<a id="independent-rockstar-account"></a>
## ChatGPT不要の会員登録と共通Coreの開発

1. **目的**: 本人の2026-10-21追加指示により、ChatGPTなしの登録から自分のSky/Eveを使い、Pixelと同じアカウントで継続する。共通本体一つと端末別adapterの既存設計を開発順へ落とす。
2. **体験**: メインドメインで独立登録/ログイン→Skyで担当とLLMを設定→Eve依頼→Pixel内Linux→同じWeb/Pixelの会話・成果。既存利用者は本人確認した同じownerのデータを保って独立したログインを追加する。
3. **責任**: Web/PWA/SitesのROCKが主担当。Security/Android/Native/Sky/Billingへ接続する。EXTERNALは認証器・OS/driver・Provider、JOINTは実機/実接続、OWNERは新credential/端末承認・外部作用/費用。
4. **入出力**: 入力ownerは認証serverで確定する。新規登録はserver採番、既存accountへの認証方法追加は本人確認を要求する。出力は同一owner/thread/job/artifact/usageと、版付きの端末能力/実行契約。
5. **状態**: 匿名、登録待ち、本人確認済み、session有効/失効、端末承認待ち/有効/失効、executor準備/実行/停止/不明を区別。パスキーに加えてID/パスワード登録・ログイン・復旧を実装し、公開v99へ配備した。本人の独立password sessionを実APIのmethod=passwordで確認し、既存owner/Pixel grantを保持した新2依頼・同一会話4発言のWeb→Pixel内Linux→Webとnative継続を受け入れた。旧22件の全内容、モデル2個・Agent6個を保持し、停止・設定復旧を読戻した。新しい匿名利用者の公開新規登録/再login/復旧と、新規端末コード承認は別の未受入条件。ソフトウェア/専用Workerのsignup/二owner/失効/復旧と、実機/公開の範囲を混同しない。証拠は docs/evidence/rockstar-independent-account.json。
6. **保存**: 既存owner別保存・暗号化履歴・revision・台帳を維持する。新しい認証方法だけで別ownerへデータを移さず、メール一致で統合しない。復旧コードは256bit乱数を初回だけ表示し、DBにはSHA256のみ保存する。秘密・顔/指紋templateは会話/Git/ログに保存しない。
7. **失敗**: RP/origin/challenge/期限/user verification/一回消費/rate limit/Cookie/CSRFを検査し、偽userId、並行登録、session固定化、再送、アカウント越境を拒否する。ログアウト後に別のSSOへ暗黙に切り替えない。
8. **復旧**: credential・session・端末の失効範囲と回復手順を定義し、既存履歴を保持する。端末断とLinux停止を分け、同じjob/予約を照合してから再実行を判断する。通常の鍵追加では旧鍵/セッション/Pixel grantを保持する。コードによる復旧では旧鍵・セッション・device grant・承認済み接続コードを失効させ、履歴は保持する。鍵全損の実機受入は未完了。
9. **承認**: 実装は既存承認を使う。新しい鍵の最終登録や別ownerへの権限付与は本人が実機で確認する。登録を本番課金・機微情報保管・全OS/全hardware合格の承認へ拡張しない。
10. **合格条件**: ChatGPT sessionなしの新規登録と再login、二owner分離、Sky設定→Eve→実Pixel→Webの同一成果、継続/失効/再送/復旧、旧22件とモデル2/Agent6の保全を同一候補で記録する。host/公開/実機/本番は別々に扱う。
11. **残作業の決め方**: [共通Coreの開発プロンプト](prompts/rockstaros-common-core-development.md)のCORE01〜12を既存RQ/taskと照合し、本人認証と実機一周を先に受け入れる。Mini/Pro/MCUは実在能力と個別driver/安全/更新復旧で追加する。料金未確定値や未知のhardware能力を作らない。

**Pixelの登録・ログイン入口（2026-10-21）**: 利用者の画面指摘により、Eveの端末同期画面を登録・ログイン入口へ変更する。Pixelは一回限りの端末コードを発行し、既定ブラウザの`/account`でID/パスワードまたはパスキー登録/ログイン、同じコードの`/connect/device`で本人承認、端末アプリで承認結果の照合を行う。Webの`HttpOnly`・`SameSite=Strict`・HTTPS時`Secure`のログインCookieはWebだけで使い、Androidへコピーしない。Androidは既存の端末専用grantをKeystoreで保存する。未接続、承認待ち、接続済み、失効とLinux実行環境の切断を別状態で示し、Linux切断時もWeb会話を読める。既存仕事の同期は本人が選んだものだけで、端末接続を登録だけで自動承認しない。合格にはWeb新規登録→同じコードの端末承認→Pixelで同じownerの会話・仕事、再ログイン/失効/接続切断の実機読戻しを要する。同署名候補APK298e21では既存の承認済みPixelから同じ会話を続ける実機受入を確認した。新規browser登録→端末コード初回承認の通し受入は未完了で、既存grantの継続から代用しない。


### 登録できない環境へのパスワード経路と操作の動き

- **目的/体験**: 本人のパスキー認証が完了しなかったため、ID/パスワードで登録→Sky/Eve→同一Pixelを開ける入口を追加する。パスキーは選べる追加手段とする。既存のgateway ownerは本人認証済みの同じデータへ初回ログイン方法を追加する。
- **責任/入出力**: ROCK Web/Security、OWNERは自分のcredential入力と復旧コード保管、JOINTは実ブラウザ/Pixelの完走。clientのowner指定を拒否し、新ownerはserver採番。IDは公開識別子でメール本人確認とは扱わない。パスワードは15〜128文字、固定コストの標準scrypt（N32768/r8/p3、32MiB）とランダムsaltで検証する。生体templateは受け取らない。
- **状態/保存**: 未登録、初回追加、ログイン、ログアウト、期限切れ、rate limit、復旧を区別。`rockstar_account_passwords`と`rockstar_account_sessions`にverifier/hashed token/版だけを保存し、平文とFIDO payloadを記録しない。CookieはHTTPSでHost限定/Secure/HttpOnly/Strict。passkeyとpasswordのsessionを表示し、独立ログインとgatewayの本人性を混同しない。
- **失敗/復旧**: ID衝突、別owner、CSRF、古いsession、復旧再送を拒否する。通信結果が不明な登録は同じIDでログインして照合する。復旧コードの本人入力と旧アクセス解除の明示同意により、同一transactionでaccount revisionと新PWを固定し、旧password/passkey/session/device grant/保留登録を失効させる。会話と成果を消さない。パスキー側の復旧でも旧PWの版が無効になる。
- **承認/合格/未決定**: 新credentialの最終入力は本人が行う。二owner/再login/失効/復旧/実Worker/D1と公開本人/Pixelを別証拠にし、ソフトウェア7試験、専用Worker/D1の21 assertions、公開v99の入口と架空ID拒否を確認した。本人の登録、独立password session、同一Pixel/Webの新2依頼・4発言と旧22件の内容保持を受け入れた。新規の匿名公開登録/再login/復旧と初回端末承認、background実行、本番の機微情報保管は別gate。独立security reviewと高負荷/実認証器は残る。registerだけで契約・請求を作らない。
- **操作**: 現行の色と5タブを保持し、登録画面に登場/step切替/押下/処理中/完了の短い動きを入れる。`prefers-reduced-motion`では動きを止める。iOSとの機能同一性や全UI完了は主張しない。
- **一次資料**: [Cloudflare Node crypto](https://developers.cloudflare.com/workers/runtime-apis/nodejs/crypto/)と[OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)を根拠に実WorkerでKDFを検証し、設定値だけで安全性を保証しない。


<a id="portable-adapter-execution"></a>
## 共通Host・Executor・Outputと端末所有者用text実行

1. **目的**: CORE02（RQ04/07/12/41/42/48）の、同じ仕事を端末別driverへ渡す共通実行本体を実装する。既存HTTP clientを保持し、実行交渉・状態・保存・出力を追加する。月16ドルの契約/料金台帳を作り直さない。
2. **体験**: 目標はSky/Eveから同じ本人の許可済み実行先へ依頼して同じ成果を受け取ること。今回のNode hostは明示したOS所有者用CLIで導入済みOllamaへ1件を渡せる段階。Webアカウント接続と新しいPixel protocolの導入を完了扱いにしない。
3. **責任**: Native/ReleaseのROCKが共通ABI・kernel・journal・adapter、Web/Android/Securityが既存Broker/本人/同期へ接続する。hostは保護したowner・権限確認とatomic persistence、executorは制限付きtext処理、outputは表示用投影を担当。外部model/OSはEXTERNAL、実機はJOINT、端末承認/実費はOWNER。
4. **入出力**: `rockstaros.adapter/1`のhost/executor/outputと共通protocol1を交渉。観測は30秒以内、trueのみ利用候補、unknown/false/版不一致は拒否。requestはjob/thread、本文、Agent pin、model pin、期限、出力token上限だけを受け、owner/費用/shellは受けない。GGUF SHA256とOllama manifest SHA256を別schemeにする。出力は`rockstaros.text-output/1`のreview・原文・hash・model・usage・出所・未確認表示で、外部Tool成功/金融receiptではない。
5. **状態**: 未対応/観測失効/承認拒否、running、review、unknownを分ける。同じIDと内容の再送は保存状態を返し、異なる内容は拒否。別controllerから稼働中を確認できない保存済みrunningはunknownとして表示し、再推論しない。文章生成の完了を既存workflowの限定手順へ記録し、modelの文章から権限/本人承認を作らない。
6. **保存**: Nodeは同一OS UID・0700 directory・0600 file、exclusive lock、job ID claim、revision CAS、fsync/atomic renameでprivate jobを保存。顧客DB/料金台帳を新設しない。Web ownerとlocal UIDを自動結合せず、Web Cookieや秘密を持ち込まない。既存Pixelの24件を新storeへ移したり再発注したりしない。
7. **失敗**: 古い観測/期限、未対応ABI、owner越境、変更Agent/model、権限不足、出力破損、容量/競合を拒否。実行後の切断・期限切れ・結果不整合はunknownとし、別ID/Providerへ自動再送しない。Node driverは固定loopbackのtags/show/chatだけを使い、download/pull/任意URL/shell/外部Toolを追加しない。
8. **復旧**: 同じIDのjob・成果hashを別process/standalone bundleから再読する。古いlockはPIDだけで消さず明示確認が必要。HTTP abortは推論停止の証明ではない。background・電源断・停止receipt・鍵全損はCORE03/05/06の別受入。
9. **承認**: private CLIの`--accept-local-text`は当該OS所有者の0円Cloud previewだけを許可。公開製品では既存の本人/利用権/予算/送信先/失効をBrokerが検証してgrantを返す必要がある。観測のtrueや署名、Nodeへの導入だけで新しい端末へのaccount権限を付けない。
10. **合格条件と今回の証拠**: package30試験、Web/Android/Mac hostの同一合成fixtureと旧Linux形式との出力一致、Mac最終候補の実推論1件（private試験は全5件）・別process bundleで同じjob/hashの再読/再推論0、既存Pixel2件の保存receiptのhash一致を確認。証拠は[adapter runtime](evidence/rockstar-adapter-runtime.json)。保存receiptの投影を新しい実機protocol交渉の成功に置き換えない。
11. **未決定と次の受入**: 既存Brokerへの接続、追加hostの端末コード承認/同一accountのSky/Eve、Pixel driverの共通ABI化と同一候補の実機試験を優先する。CPU/RAMのhard isolation、熱/電池/品質/license適合、他機種、常時稼働、請求は別に検証する。private hostだけでCORE02や共通Core全体を完了としない。

<a id="sky-continuous-timeline"></a>
## Skyの継続タイムライン（HOME01 / WEB04 / SKY21）

1. **目的**: 本人の「もっと動的に、関連しながら更新されるtimeline」を既存Homeへ実装する。
2. **利用体験**: 投稿とニュース原文リンクを同じstreamに並べ、12件ずつscrollで追加。6話題の切替、関連する話題、Eveへの引継ぎ、新着通知、更新停止/再開を提供する。
3. **責任**: ROCK Web/PWAが並び順・重複・cursor・owner/key再確認を担当。EXTERNALはGDELT/API/MCPの供給。JOINTは実投稿/実画面、OWNERは接続先と共有を選ぶ。
4. **入力**: 既存social APIの閲覧許可済み投稿、follow/community、loaded投稿のlike/bookmark、画面内で選択したnewsの語、GDELT固定6query。会話/生体情報をrankingへ送らない。
5. **出力**: native投稿/原文headline、媒体/検出時刻/前回分表示。外部本文の転載や自動LLM生成による投稿補充を行わない。Eve handoffは原文URLと題名を既存入口へ渡す。
6. **状態**: 初回/追加読込/live/一時停止/新着待機/通信待ち/前回取得/読み終わり。表示済みの順序を保ち、new headは本人操作で挿入。1画面200件を上限に再開入口を提示する。
7. **保存**: posts/reactions/followは既存owner DB。追加のクリック話題は画面memoryのみ、owner変更では使わない。news共有cacheはquery別15分、同時取得を合流。cold fallbackは日時付き実取得見出しを24時間だけ前回分と表示。話題別取得が失敗した場合は保存済み見出しの語で絞り込み、その旨を表示する。新DB migrationなし。
8. **アルゴリズム**: freshness=14/(1+ageHours/6)、語一致=6×一致語数（最大18）、follow=8、community=5。直近6件で同じsourceごと8減点。5件目ごとfreshness中心で探索。candidate keyでdedupe。serverはfollow/communityに72時間のrecency bucketを加え、cursorにreference時刻を固定。rankingは許可を付与しない。
9. **失敗/復旧**: visible時social25秒、news60秒（cache15分）の確認。非表示/offlineでは取得を止め、50/100/120秒へbackoff。旧項目は消さずnew候補へ追加。private投稿最大200 IDを既存account/key境界で再確認し、削除/失効を表示から除く。通信断で判定済みにしない。取得可能データの終端を表示し同一記事を無限再掲しない。
10. **承認**: 自動閲覧更新のみ。source追加、外部投稿、実行/課金、端末grantの既存承認境界を保つ。新規費用/credentialなし。GDELT検出は真偽判定ではない。
11. **合格/未決定**: 純ranking・append・backoff・key失効・cursor fixture、公開source build、公開UIの続きを確認し証拠へ別記録。意味embedding/政治的中立実証、X本人おすすめ供給、新Pixel OS/生体vault/実課金の合格へ換算しない。実データの増加後に比較評価して係数・window virtualizationを改良する。

2026-10-21追補: 200件の候補が埋まると新着を捨てる挙動を修正。newsは新しい候補200件に表示中の旧news最大200件を保護して最大400件、renderは既存200件の上限を維持する。private投稿は既存200 IDの再確認を維持して新着を優先する。日本語はIntl.Segmenterで単語へ分け、非対応clientは従来の字句抽出へ戻す。初回取得は新着通知にせず、時刻の古い遅着も新しい実受信IDとして検出するが、stale応答から新着通知は作らない。前回記事のstale表示を新応答で消さない。画面先頭（scrollY≤120）かつvisible・live・入力/文字選択なしの場合だけ新着を自動表示し、それ以外は既存の新着ボタンへ保留する。枠を使い切っただけで受信停止せず、実データ終端は待機状態を示す。semantic embedding/政治的中立の実証や無限の投稿供給を保証するものではない。

証拠: [継続timeline](evidence/sky-continuous-timeline.json)。実装: `lib/sky-continuous-ranking.ts` / `components/use-sky-continuous-feed.ts` / 既存social store。検証: `node --experimental-strip-types --test tests/sky-continuous-*.test.mjs tests/sky-social.test.mjs tests/sky-timeline-interactions.test.mjs tests/eve-news-feed.test.mjs tests/home-timeline-frontend.test.mjs`。


<a id="portable-runtime-service"></a>
## 共通runtimeと既存Eveサービスの接続（CORE02 / OS10 / SKY21）

1. **目的**: private text kernelを既存account/device-link、同じ仕事IDとEve履歴へつなぎ、端末別に業務契約/顧客DB/台帳を作り直さない。
2. **体験**: 本人のWebで実行先・担当・モデルのhash/scheme・本文・上限token・0円Cloud previewを承認し、明示交渉したHost/Executor/Outputで受領→推論→同じ会話へ下書きを返す。今回のsource追加を公開/本人Mac grant/新Pixel ABIの実機合格としない。
3. **責任**: ROCK Web/PWAが既存owner/device session、queue claim、replica/historyを担当。Nativeは共通kernel/journal、EXTERNALは実モデル/OS、JOINTは同一artifactの実host/API、OWNERは新しい端末grantの最後の承認。
4. **入力**: `rockstaros.runtime-presence/1`は30秒の3 descriptor・full agent recipe hash・model pin scheme・prepared inventory。Web POSTは固定job/thread/device/agent/model/上限/本文と明示confirm。Bearer deviceは新規依頼承認を作れない。直近会話は既存owner履歴4発言/1200文字以内を参照情報として固定し、表示用本文を別保持。
5. **出力**: `rockstaros.runtime-command/1`と`runtime-report/1`。request hash、claim ID、model scheme/hash、review本文/hash/時間またはUNKNOWNのcodeを照合する。成果はlinked-device-reportで外部Tool成功/金融receiptではなく、真偽/品質/実hardwareの保証でもない。
6. **状態**: runtime-pending→runtime-claimed:claimId→保存/読戻し→runtime-done。claimはCAS一回、別claimは拒否。同一claimの再読は新規実行権を作らず期限検査を別実施。response loss、孤立claim、再起動後runningはUNKNOWN。期限後に別workerへ自動引継ぎしない。
7. **保存**: 既存`eve_device_commands`/`eve_device_jobs`、既存owner暗号化と安定message IDを共用。legacyと共通runtimeは`eve-device-replicas`のCAS/appendを使う。kindで旧Pixelのreaderを保護し、旧ABIへ新commandを渡さない。Node journalはowner/device/local UIDを別の0700領域・0600 binding/records・exclusive lockへ固定。既存private UID5件を採用/送信せず、新grantのtokenをpackage/logに保存しない。
8. **失敗**: 古い/未知capability、recipe/model変更、owner/device越境、Origin、破損出力hash、state/版不整合、期限/失効を拒否。任意shell/URL/model download/cloud fallbackを増やさない。共通hostの0円text previewを月16ドルの本番利用権/予約/計量の合格に換算しない。
9. **復旧**: claim応答消失なら推論0。publish応答消失なら同じjournal/ID/hashをread backし再推論0。appendの一時失敗は同じreplicaを再送して修復。ack応答消失は保存済み同じ成果から照合。削除会話のtombstoneとdevice失効を維持し、UNKNOWNを完了や停止証拠に変えない。
10. **承認/検証**: 新host grantは具体的準備後に本人へ最終確認。既存Pixel24件を再発注せず、software store/実Worker/実Mac model/公開Web/新Pixel実機/本番を別受入。新server/worker fixtureは`tests/eve-runtime-sync.test.mjs`、packageの`linked-worker.test.mjs`、`scripts/check-work-api.mjs`、実推論は明示`ROCKSTAR_RUNTIME_REAL_LOCAL=1`の隔離合成ownerだけ。
11. **未決定/次**: 公開source接続、host secret保護/登録UI、同一owner実Mac grantとEve UI、新Pixel driver ABI、background・独立security・resource hard limit・E2EE/生体・課金を続ける。field/schemaだけで完成と呼ばず実経路の証拠を読む。[証拠](evidence/rockstar-runtime-service-bridge.json)。

検証追記: `1.0.0-dev.3`のpackaged bundleをrepo外でimportし、合成worker一件の重複推論0と別Nodeプロセスの同一hash再読を確認した（新しい実モデル推論0件）。全体`npm run verify`はexit0、Node1221件中1220合格/1skip/失敗0、Worker1679・CSV113 assertions。43件package試験と15件store/legacy試験は別集計。実Macの逐語copy不一致は未解決で、品質合格へ変更しない。公開Web更新、新Mac grant、新Pixel ABIの実機受入、GitHub保存/main統合は未実施。

<a id="portable-runtime-host-ui"></a>

## 共通runtimeの実行先選択と接続情報保管

1. **目的**: 既存Sky/Eveの同じ会話で、legacy Pixelと版付き追加hostを選べるようにする。
2. **利用体験**: Skyの接続した担当→Eve、実行先/担当/基盤モデル/版/送信先/0円preview確認→受領待ち→保存済み下書き/UNKNOWN→同じ会話・文章持出し。モデル品質の検収とは分ける。
3. **責任**: ROCK WebがUI/owner照合/既存API、Node hostが保護storage/共通kernel、JOINTが実機と独立security、OWNERが新host grantと起動時解除を担う。WEB04/OS10/SKY21。
4. **入力**: 既存URLのdevice/agent/model hashに`runtime=1`とmodelSchemeを加える。legacyとの取り違え、scheme変更、期限切れ/未知capability/版不一致は実行前に拒否する。
5. **出力**: 同じownerのpending/received、review/unknown、原依頼、job ID、model pin、成果hash、使用料。受領を実行完了や停止証拠に昇格しない。
6. **状態**: UIの同意はowner/端末/担当/hash/scheme/adapter版/能力へ束縛。送信中は選択を固定する。既知の受付成功後は操作IDを解放し、応答不明時は同じIDで照合する。画面非表示/通信断ではread pollingを止め、復帰時に再確認する。
7. **保存**: 仕事/履歴は既存Eve store。Nodeの任意保管は0700 directory/0600 ciphertext、UUID profile/UID binding、固定scryptとAES-256-GCM。平文token/解除句を成果やpackageへ混ぜない。既存profileは上書きしない。
8. **失敗**: owner混在401、旧/新protocolの置換、model digest scheme変更、adapter失効、保存改変/不正mode/symlink、解除失敗/期限切れを拒否する。自動cloud切替・model取得・新grant再発行はしない。
9. **復旧**: 同じprofileは起動時に本人が解除し、確認済みowner/deviceでjournalを開く。既存の同じjob/hashを照合する。画面の再読で再推論しない。生体vault、同user process侵害、鍵全損・常時自律稼働は未受入。
10. **承認/合格**: API/selector/storage fixture、実Workerと同一build、公開本人UI、新Mac grant/推論、新Pixel ABI、独立Securityを別受入にする。Macモデルの既存逐語copy不一致は未合格のまま。
11. **未決定/次**: 保護storageを使うhost設定・起動導線を完成させ、具体的な新hostだけ本人に最終承認してもらう。旧Pixel24件を再実行しない。証拠は[host UI](evidence/rockstar-runtime-host-ui.json)。

公開v105/source `9e54419a7ae86e44f6070283cfa676dfa58309df`を配備し、既存ownerの6担当/2モデル→Eveの同じ担当/モデル選択、同意未選択・古い接続で実行無効を確認した。ヘッダーとアイボリー配色の継承は実画面と回帰試験で確認。全体verify exit0（1225合格/1skip/失敗0、API1694/CSV113、asset203欠損0）、SDK50、selector8。Node SDK dev.4のsoftware暗号化保管はrepo外/別processで解除再読。新規実モデル推論0、実Pixel操作0、新Mac grant0。Mac起動導線/最終本人承認・同一public ownerのMac実行、新Pixel ABI、生体vault/独立Security/本番課金は未受入。旧実モデルcopy不一致は未合格のまま。配信用Gitは保存済み、正本GitHub branch/mainは未反映。 [詳細](evidence/rockstar-runtime-host-ui.json)。

### 公開入口の責務と担当設定の接続（2026-10-22、WEB04/HOME01/SKY21）

- **目的・体験**: `/#catalog`はホーム上の検索・追加ダイアログとして開き、閉じると同じタイムラインに戻る。既存URLと検索/分類/追加を保つ。`/sky/agents`を引用Toolへ転送せず、自分の担当・LLM・設定の一覧へ接続する。引用Tool本体と既存仕事は保持する。
- **責任・入力・出力**: 既存owner別`sky_agent_settings`とCASを再利用。設定保存は実行/購入/権限付与を開始しない。Eveへ担当ID/版を渡し、本人・enabled・現在版・provider/modelをサーバーで照合する。Free Cloudでは役割を非信頼のモデル入力にし、仕事のdigestと`agentBinding`に版を固定する。Tool receipt・本人承認には昇格させない。
- **状態・保存**: 設定済み、接続未確認、実行先未接続、queued/waiting/completed/unconfirmedを区別。同じEveから無料Cloudの既存owner別仕事を読む。結果がモデル応答を得てもworkflowはreview。端末内の固定recipeとは別の設定であり、独自ローカル役割をPixelへ配布したとは表示しない。
- **失敗・復旧・承認**: stale版/別owner/停止/違うLLMは送信前に拒否。再送には同じIDを使い、曖昧な送信を自動再実行しない。無料Cloudは既存の明示同意と利用枠を通し、有料fallbackはない。受理済み仕事の版は固定し、停止はEveの個別停止で確認する。設定/仕事のデータは削除しない。
- **合格条件・範囲**: owner/CAS/モデル/役割、queue再開と再読込みでの版保持、1回の送信・review維持を合成試験する。公開画面の同一owner保存と再表示は別に確認する。新しい実推論は0件で開始し、PixelのCloud仕事統合、任意ローカル役割、他の有料Providerと本番請求の合格には転用しない。
- **未決条件**: Source v108の金融回帰試験9件は、今回の変更を外した同一Sourceに修正済み合成DB初期化を適用しても同じ9件が失敗した。本番金融/一般公開合格にはせず、CORE09で原因と台帳/枠/照合の証拠を修復する。Source-only無料Cloud backendとRootの統合も独立した未完了項目。

## 業者共通の使用量表示（2026-10-22）

BIL02/AI02/AI05/SKY14/SKY21のLLM/Agent計量は[共通計量と作者還元](sky-billing.md#cross-provider-usage-observation)に従う。Eve/仕事画面から同じProvider観測と既存確定記録を読み、権限・上限・台帳・作者契約を分離する。GPU学習/有料実行は今回行わない。

共通の使用量表示は[計量表示と保存](sky-billing.md#cross-provider-usage-observation)へ接続する。 Sourceの復元前提を持つ検証初期化と実計量UIの依存を[回帰修復の証拠](evidence/sky-source-regression-repair.json)へ束縛し、fixture修正と本番DB/料金の受入を分ける。無料Cloudは既存jobへ観測を保存し、結果不明でも同じjobから読み、再送・支払い確定にはしない。直接chatの一時表示と永続明細を区別する。公開/本人UI/請求/実機は別受入。 公開v111/source6f32e4d5を本人承認で配備し、正式ドメイン200と匿名API401を確認。本人UIはCUA接続障害で未確認。[同一候補の証拠](evidence/sky-usage-public-integration.json)。

<a id="eve-execution-si"></a>
## Eve実行SI — 最初の実Tool縦断（SI01、2026-10-22）

目的はEveからSkyの既存Toolを動かし、独立検査・同一仕事/会話への保存・再開/停止を可能にすること。全体手順は[詳細プロンプト](prompts/eve-execution-si-development.md)。今回の実装は引用整形に限定し、任意目的の自律計画/学習/外部操作の受入ではない。

**利用体験。** 同じEve会話内で「SkyのToolで仕事を進める」を開き、引用整形の目的と非秘密の原稿、本人用素材/成果保存の同意を入力。0円・外部呼出なし・固定2工程を確認して計画保存→引用Tool→検査工程→成果確認/完了。各工程は一要求で終わり、ブラウザを閉じても勝手に次工程を実行しない。保存した仕事を再読込し続行/停止できる。

**責任。** 主担当Sky/MCP・ROCK、AI02/AI05/SKY14/SKY21、WEB04/OS10/BIL02連携。ROCKはserver owner照合、固定計画、URL独立検査、CAS、保存/同期/停止。EXTERNALは既存Tool原本の仕様。JOINTは公開/端末の同一候補UI受入。OWNERは原稿権利/保存同意/成果確認。一般公開・課金・送金は別gate。

**入力/出力。** /api/eve/tool-workのPOSTはjobId/threadId/objective/source/saveMaterial。素材最大10000文字、依頼1000文字、HTTP48KB。版付きeve.tool-work/1 bindingが既存composition WorkJobへthreadId、素材/依頼hash、決定的recipe版、検査/成果hashを保持。plannerはdeterministic-citations/1。mr-citations固定commitとcompose-checkのみ、予算0JPY、外部権限なし。PATCHはadvance/complete/cancel/syncとrevision/commandId、GETは本人の一覧/仕事。結果はjob/historySaved/明示した0円のbounded-local-tool usage。

**状態/保存。** WorkJobのactive→review→completed、cancelledを保持。既存work_jobsへ素材/成果/command重複排除/版を保存し、既存Eve暗号化historyへ固定IDの目的/成果メッセージを反映。素材自体は既存work_jobsの保存方式なので秘密情報を入力しない。検索記憶は新規会話で既定false、既存同意を保持。専用の会計/仕事/アカウントDBは追加しない。汎用composition変更・汎用完了で専用検査を迂回させない。

**検査。** Toolと別実装でMarkdownリンク先集合を前後比較し、追加/欠落と空/過大成果を拒否。これはURL集合の保持で、URL到達性・記事の真偽・本文意味・全Markdown構文の正しさは証明しない。compose-checkの形式検査と本人確認も別段階。検査失敗はneeds_reviewで自動修正ループはまだない。

**失敗/復旧/承認。** 固定の副作用なしadapterのみ、CASで1更新のみ確定。同じcommand再送は成果を再確定せず、異なる内容の再利用を拒否。素材hashを照合し、削除済み会話から再開しない。停止は次工程配送を止める（外部長時間processの取消ではない）。会話反映だけが失敗したらhistorySaved:falseと表示し、syncでToolを再実行せず修復。削除済み会話へは再保存しないが仕事の停止は可能。利用権失効後も本人の停止を許す。

**合格条件/未決。** 実Tool変換・独立URL検査・SQLite再読込・再送/競合・owner分離・削除/同期修復をtests/eve-tool-work.test.mjsとWorkerのcheck-work-apiで検査。UIは実ブラウザで計画→実行→成果→再読込→停止を操作する。最終npm run verifyを実施。実Provider/複数端末/公開UIはその候補で別受入。次はSI02非信頼Planner、SI03限定修正、SI04拡張復旧、SI05〜08のAgent/費用/公開まで継続し、SI01だけで全体完了にしない。

### SI02：非信頼LLM計画候補の接続（2026-10-22）

実Sourceの限定受入追記：明示選択の既存qwen2.5:1.5bによる1回の計画生成をserverで検証し、採用前Tool0、採用後mr-citations/compose-check/URL保持検査/同job完了・会話保存・Worker再起動一致、同推論再送409を確認。入力471/出力191報告、model digest前後一致。一般planning評価の不合格と自動採用禁止は維持。実UI/Pixel/汎用計画/意味真偽/公開/課金を含まない。証拠docs/evidence/eve-real-planner-source-worker.json。


**目的/体験/責任。** 同じ引用整形仕事について固定recipeをbaselineとして保持し、本人用localhostの既存Ollama/LLM APIから計画候補を得る。本人が導入済みモデルを選び、候補検証→内容確認/保存→実Tool工程へ進む。主担当ROCK、外部モデルは候補生成だけ、本人はモデル/目的/素材保存/工程実行を選ぶ。新しいCloud利用権やOS権限は候補から付与しない。

**入出力/検証。** eve.plan-candidate/1はjobId/objective/sourceSha256/nodes/unknowns/stopReason、最大16000文字。モデルへ渡すのは目的と素材hashと許可Tool仕様で、素材本文は計画生成に送らない。Serverは未知field、仕事/目的/素材の不一致、未決/停止理由あり、存在しないTool、循環/型不一致/不正設定、検査へ未接続の成果を拒否する。今回許可するのはmr-citations/compose-check/compose-joinのみ。計画は2〜12工程で引用整形を含み、成果leafはその後の検査へつなぐ。追加scope/予算/Tool出力/成功宣言を候補に受け付けない。独立URL検査と予算0JPYはserver側で固定する。

**状態/保存/承認。** 候補作成はTool未実行。採用時に既存WorkJobへ候補hash、計画hash、入力hash、申告モデル名、origin:untrusted-submitted-candidateを保存する。モデル名の申告は真のモデル識別/請求/作者権利の証明にはしない。計画hashを実行前に照合。出力step IDを固定s1へ依存させず、実行した成果と検査を同一job/会話へ反映する。候補内容を変更したら以前の候補を破棄する。

**失敗/復旧/停止。** 不正な候補の再提案は最大2回、transport失敗は無条件再送しない。モデル導入済み一覧は既存private localhost discoveryを使い、production buildでも明示したloopback用開発ownerがある場合だけ確認可。公開hostでは不可。失敗時Cloudへ切替えず、固定手順を選べる。候補作成の中止は候補採用/以降のTool実行を止めるもので、remote process取消の証明ではない。Ollama adapterは要求したmaxOutputTokensをnum_predictへ渡す。

**実測/合格/未完。** scripts/check-eve-local-planner.mjsは導入済みモデルのみを使うopt-in評価。ローカルLLM→候補検証→既存引用Tool→独立検査→SQLite/history読戻しを合成原稿で確認。初回のcold推論timeoutは成功に含めない。Qwen2.5:1.5bの実測では最初の余分fieldを拒否し2回目候補で完了した一例がある。モデルの一般品質/最適性、独自重み、公開/実機受入ではない。候補生成attemptの永続queue、一般Tool/Agent、検収後の修正loop、remote取消/予算/精算は後続工程として残る。検証入口はeve-plan-candidate/eve-tool-work/llm-providers試験、実Worker/API、実ブラウザ、npm run verify。

### SI03：失敗の永続記録と完成条件を維持する限定修正（2026-10-22）

目的は失敗を隠さず、進展のある限定修正だけを同じworkflowで行うこと。serverがadapter例外/検査不合格を検出したら、既存composition operationへfailを記録し、pendingFailure、失敗step/command/計画hash/時刻/安全なcodeをWorkJobへ保存する。生の例外や原稿断片をエラーに含めない。会話にも修正待ち/自動続行停止を反映する。主担当ROCK、本人は修正後の工程と成果を確認、外部Agent/remote取消は未接続。

今回修正できるのは、URL保持検査を通った同一の引用成果をcompose-joinが重複結合し、12000文字を超えた場合。合格済み成果を保持し、冗長結合を除いて既存compose-checkへ接続する。目的/素材hash/完成条件/予算0/権限を変えず、plan hashとrepairCountを更新する。修正自体もrevision/CAS/command再送排除を通し、Toolの再実行や別のCloud呼出をしない。

必要文言/文字数などが元の既定条件より強い場合、非同一成果、URL保持検査の不合格、不明なadapter失敗は、自動で基準を緩めず停止する。再開は対応できる計画/本人判断の別工程。修正上限は2回で、終了済み/停止済みは再開しない。候補生成の最大2回とは別の制限である。

受入は実際の重複結合で上限エラー→SQLへ失敗保存→合格成果保持→限定修正→検収/完了、および強い完成条件を保った拒否と修正上限をtests/eve-tool-repair.test.mjs/Worker APIで検査する。任意の失敗を解決する一般的な自律修正、独立した意味検収、remote/有料Agentの補償実行は未受入。ブラウザ操作ツールの接続断によりSI02/SI03の今回UI受入も保留し、API/host合格と区別する。

### SI04/SI05：既存Agent委任を同じEve会話へ接続・停止照合（2026-10-22）

**目的と利用体験。** Eve内で既存Workbenchを開き、既存cloud-agent仕事の見積/承認/予算/実行/成果確認を使う。「この会話へ接続する」でその仕事を同じEve threadへ結ぶ。別のjob/Agent runner/金融台帳を作らない。保存済みの委任はworkJob/thread URLから再読込し、進捗を会話へ反映できる。

**責任/入出力。** ROCKは既存WorkJobとowner/thread binding、状態・使用量投影、停止intentとCAS/SQLによる送信拒否、同じ履歴への保存を担当。EXTERNALは真のAgent処理/取消/usage receipt、JOINTは独立Agent/実端末/本番の受入、OWNERは接続/送信先/見積/予算/停止。/api/eve/agent-workのPOSTはjobId/threadId/revision、GETはidまたはthread、PATCHはjobId/action:stop|sync、stop時はrevision/commandId。新規の外部実行承認は既存A2A quote/Broker/暗号化input/予約経路だけで行う。

**保存/状態/権限。** 既存WorkJobにeve.agent-work/1のthreadId、stopRequestedAt、stopCommandIdを保持。既存A2Aの子row/予約/署名検証済みreceipt/成果数とread-only親snapshotを使い、Eve暗号化historyへ固定message IDで投影する。原稿/認証鍵/暗号化artifact本文をsnapshotへ載せない。別owner/別threadへの付替え/削除済み会話の復活を拒否。新しい会話の検索記憶は既定false。bindingだけでscope/支払承認を作らない。

**停止/失敗/復旧。** 最初に親の停止intentをCAS保存する。子の新規作成・承認・dispatch claim・remote send markerは同じDB内の親停止を検査し、古いreadに依存しない。送信markerより前は既存requestCancelで局所取消、既に送信した処理はcancel_requested/cancel_unconfirmedとして外部照合を待つ。停止要求自体と外部終了確認を区別する。全子がterminalになってから既存workflowで親cancelledへ確定する。処理途中で落ちた場合、同じjobのsyncが保存intentと既存子rowから取消/照合を再開する。結果不明の新規送信・自動再委任はしない。

**完了/会計。** Eveへ接続した親のcompleteは全子のremote_completed/成果保存/usage receiptを要求し、保存時のCAS SQLでも未完了子を拒否する。中止した子や失敗した子を黙って成功へ置換しない。停止確認は実行終了の確認で、料金0や全予約解除、Provider invoice/入金/作者送金の照合を意味しない。使用額未報告はnull、保存済みreceiptの共通usage投影を表示する。会話への反映が失敗したらhistorySaved:falseとし、元jobを保持して再反映する。

**合格条件/未決。** tests/eve-agent-work.test.mjsでowner分離、送信前取消、取消未確認の再読込、停止保存直後の中断、readとsend markerの間に停止が入る競合、親完了CASの拒否を確認する。Worker APIで同じ仕事のbinding/停止と実workerd再起動後の状態保持→既存取消receipt→停止確定を検証する。実物の独立Agentの送信/取消、端末/公開UI/有料Provider/精算はその候補で別受入。ブラウザ接続障害による未受入をAPI成功へ換算しない。次は同一候補で独立Agent/端末・UI受入、永続planner lifecycle、一般的な検収/修正、SI06〜08の残作業へ接続する。

Agent仕事の停止と会話保管を分離する。Eve履歴鍵が一時的に利用不能でも、認証済み本人の既存Agent停止・状態照合は継続し、historySaved:falseを返す。新規bindingは暗号化保管なしでは拒否し、平文fallbackを作らない。鍵復旧後のsyncで保存済み停止状態を同じ会話へ再反映する。

SI04/SI05の停止復旧では既存Agent workerの定期処理も保存済みintentを回収する。新規有料実行の可否や履歴鍵の停止とは独立に既存の取消状態機械を呼び、外部終了未確認は保持する。停止前のworkflow起動は送信markerをclaimせず終了し、競合時はSQLも新規送信を拒否する。未確認の仕事はprobe時刻/revisionを保存して限定件数scanの後ろへ回し、後続の停止要求を塞がない。UI/公開/本番Providerの受入とは分ける。

LLM学習準備は本人指定microgpt-lessonの分解手順を[CPU基礎実験契約](llm-evaluation-architecture.md#eve-microgpt-reference)へ反映。自作合成データ、train/eval分離、checkpoint復元とbaseline比較をGPUなしで準備し、実験出力でBroker権限やTool成功を確定しない。現時点は参照と設計のみで学習未実行。

SI04の計画生成を既存WorkJobへ永続化する。`eveTool.planning`はmodelの申告名/digest、draft/leased/proposed/adopted/recipe、最大2attempt、90秒lease、候補hash、invalid/unknown、最大12commandのfingerprintを保存する。これは推論receipt/usage/モデル権利の証明ではない。候補自体は型/本人job/目的/source hash/許可Toolをserverで検査し、検証後も本人採用まで実Toolのadvance/completeを拒否する。外部副作用・予算は増やさない。

画面は推論前に同じ仕事を保存し、claim後に既存localhost Ollama APIを呼ぶ。再読込でattempt数をリセットせず、再開時は同じmodel名/digestを再確認する。期限切れ/中断/応答喪失はunknownとし、遅着結果を新leaseへ採用しない。候補本文の不正部分は保存せずhashと安全な理由のみを残す。本人が固定手順を選ぶ場合もattempt履歴を保持する。停止・削除会話・他owner・CAS競合は新しい採用を拒否。停止は仕事の続行を止める意味であり、ローカル推論プロセスの終了を確認済みとは表示しない。汎用background planner/lease worker・有料Provider・最新UI/実機の受入は別に残る。

永続plannerの互換/復旧：旧clientからの読み取り/停止は保持し、新serverは候補採用前の実行を拒否する。planner gateを知らない旧serverへの単純切戻しは受入対象外。公開/切戻し前に未採用の計画仕事を停止してバックアップし、gateを保つ互換serverで再開を検証する。今回のsource/API/実モデル受入は証拠JSONのSI04_durablePlannerに限定。汎用worker/UI/公開受入をこの限定成功へ読み替えない。

SI04/SI06の計画推論の使用量保存：既存`/api/llm/text`にowner-scopedな`evePlanner:{jobId,attemptId}`を結び、既存WorkJob/CASへ送信markerを保存した1要求だけを既存Ollama adapterへ渡す。端末内接続だけで、saved model/目的/source hash/期限/停止/会話を検査し、prompt/system/出力token上限600はserverで構成する。入力metadataだけでCloudを開始せず、他Providerは既存のquote/予算経路に保持する。

応答はブラウザ受領前に安全な共通usageと候補hash/型検証結果を同じattemptへ保存。外部応答に含まれるcounterの観測であり請求書/作者権利の証明ではない。invalid/未報告/nullを保持し、cache/total内訳を再加算しない。金額・invoiceVerified・作者支払いを勝手に確定しない。ブラウザから同じ試行の候補を差替えできず、server構成の候補も本人の採用まではToolを実行できない。

停止/lease超過/新しい試行後の遅着は使用量のみ旧attemptへ保存し、仕事や計画を再開しない。応答不明はusage null・inference unknownとsafe codeを保存し、同じ試行を再送しない。保存CAS競合は最大3回の再読取りだけで、LLMを再呼出しない。途中crash後のsendingは照合待ちとして残し、完了済み推論に見せない。これは計画用ローカルLLMの限定受入で、全Providerの精算/請求・汎用background plannerは別gate。rollback時は既存のplanner gate保持条件を守る。

### Eve計画のモデル版照合（T09・2026-10-22）

目的は、本人が選んだモデル名の参照先が変わった時に同じ承認で計画候補を採用しないこと。ROCKは既存WorkJob/attempt/CASと共通Ollama inventory reader、EXTERNALは接続先のモデル名/digest応答、JOINTは実接続での前後観測、OWNERは変更後のモデル選択を担当する。本人は導入済みモデルを選び、版変更なら新しい仕事で選び直すか明示的な固定手順へ進む。

入力は既存job/attemptと保存modelLabel/modelDigest。loopback・redirectなし・4秒・128000byte・最大50件の一覧を読み、重複名は曖昧として拒否する。送信前にdigest不一致/不明ならinference.state=not_sent、usage=null、attempt.invalid/model_changedまたはmodel_unavailableを同じ仕事へ保存し、実推論しない。確認中の停止/revision競合/期限失効は送信CASで拒否する。応答後も一覧digestと応答model名を照合し、変更/欠落/接続失敗なら候補を保存・採用せず、報告usageと出力hashは保持する。自動再試行・別モデル・Cloudへのfallbackはしない。Tool権限・料金・作者支払へ昇格しない。

前後digest・観測状態は既存attemptのmodelIdentityへ追加する任意fieldで、旧reader/旧記録を保持する。前後一致はobserved_matchであり、途中のalias差替えや実際の重みを証明しない。強い実行pinは未受入として残す。モデル一覧の復旧後も同attemptを再送せず、本人が保存状態と残る試行上限を確認する。候補のschema JSONは詳細を開いた時だけ表示する。合格条件は送信前変更で0call、送信後変更でもusage保持/採用拒否、停止競合で0call、正常時の既存Tool縦断維持、API再起動/UIと全体検証。未知の他Providerへの拡張はその公式revision/receipt契約を確認して決める。根拠：[Ollama一覧](https://docs.ollama.com/api/tags)・[chat応答](https://docs.ollama.com/api/chat)。

### Eve計画の暗号化会話投影と競合復旧（2026-10-22）

目的は、別画面で同じ会話を開いた時に計画の候補/拒否/使用量まで最新の仕事へ辿れること。ROCKはWorkJob正本と既存Eve暗号化history、EXTERNALはProviderが報告した使用量、JOINTは実Worker/会話再読込、OWNERは素材保存・記憶設定・削除と復旧判断を担当する。本人はEveから同じ仕事を開き、会話反映失敗時には「会話へ再反映」を使う。

入力は既存owner/job/thread/revisionと保存済みplanner state/usage/成果。出力は同じtool-resultメッセージIDへの状態・指定モデル・試行別の入力/出力/キャッシュ内訳・未確定表示・独立検査/成果。JSON候補/生のProvider本文/鍵は投影しない。計画待ち/応答待ち/検証済み採用待ち/結果不明/版変更/確認不可を分け、固定ToolのCloud実費0と計画AIの観測/金額未確定を区別する。新しい支払根拠にはしない。

server内だけのhistory.save第2引数fenceで、既存history INSERT/UPDATEを同じDB batch内のwork_jobs owner/id/revision/対応thread/schemaへ結ぶ。公開save bodyにはfenceを受け付けない。暗号化準備中のjob更新・他owner/thread・旧版はhistoryを書換えず409。投影処理は最大3回だけ最新jobとhistoryを読み直す。既存message merge/encryption/remember/tombstoneを保持し、旧client readerと未指定fenceの既存APIは互換。新table/migration/台帳/runnerは作らない。

推論と使用量の保存後に会話へ反映し、失敗でもjobを保持してhistorySaved=falseを返す。会話投影の再試行は推論/Toolを再実行しない。鍵不明/削除済み会話を平文で復旧・再生しない。停止は履歴鍵障害中も正本へ保存し、復旧後に同じjobを会話へ投影する。合格条件は旧revision/owner/thread拒否、暗号化準備中の停止競合、鍵障害後の再投影0推論、推論中の会話削除非復活、実Worker再起動/停止/鍵復旧、最新Eve表示と全体回帰。旧native/helper画面や公開版への統合は別gate。

### EveからAgent仕事を作る最初の保存（2026-10-22）

目的は、Eveで作ったAgent仕事を別の会話接続操作なしで同じthreadへ保存すること。ROCKは既存Workbench/WorkJob/Eve history/API、EXTERNALは後段の実Agent/Providerの応答、JOINTはUI/Worker再起動と実委任の別受入、OWNERは依頼/権限/料金の承認を担当する。EveのAgent欄はcloud-agentを初期選択し、仕事名を入力して作成すると同じEve会話へ入る。

既存/api/eve/agent-workのPOSTへcreate:true/jobId/threadId/titleを渡す。serverは既存createWorkJobのcloud-agent template/固定承認gateとbindEveAgentWorkを使い、最初のwork_jobs INSERTからeveAgent.threadIdとcreationRequestSha256を保存する。title/thread/templateのhashは作成要求の照合専用で、後の本人の計画編集・停止を巻き戻さない。同一要求は同じ親jobを返し、IDの別内容や別thread、他owner、削除会話、鍵なし作成は拒否。会話作成は既存暗号化/tombstone/CASを使い、反映失敗はhistorySaved=falseで再照合する。新しい仕事DB/runner/支払台帳は追加しない。

UIは送信前にjob/thread IDを保持し、応答喪失でも同じ作成要求を使う。URLにthreadとworkJobを残し、再読込で同じ仕事へ戻る。既存の外部で作った仕事を会話へbindする経路も維持する。子委任や見積、grant、予算予約、外部送信は作成しない。実行は従来のAgent Card/quote/本人Broker承認/予算と配送を必須にし、既存停止intent/失効を守る。作成/会話保存とAgentが実行できたことは区別する。

合格は最初からboundであるDB検査、同時/応答喪失再送で親1件、別内容409、再起動後同ID、停止後再送非復活、owner/Origin/鍵/tombstone拒否、最新Eveの作成/再読込/停止。独立Agentのwire実行/検査/課金/Pixel/公開は別の未完gateとする。未決の汎用目的から自動委任する範囲は、既存A2A契約と同一任務の測定に基づき決める。


## 配信Sourceのowner workspace移行修復（CORE01/06/08/09・WEB04/SKY21）

公開済みmain系列0026〜0028の時刻が0025のwatermarkより小さく、Drizzleによる既存DB更新ではEve履歴・Sky timeline/community・本人accountの23表が未適用となる経路を隔離D1で再現した。既存0020〜0030のSQLと時刻は固定し、Source-onlyの0031_owner_workspace_schema_recoveryを4102444800003で追加する。新規作成はIF NOT EXISTSのtable/indexのみで、既存仕事・金額・暗号化envelopeを更新/削除しない。

入力は復元済みmain DBと既存の移行台帳、出力は欠けたschemaと新watermarkである。途中再試行と二ownerの同じthread IDを保持する。sky_communitiesのrecovery_hash/os_revision/post_mode、sky_social_postsのreply_toが既存tableに不足する場合はzero-row queryで失敗し、移行完了を記録せずoperatorのbackup/明示修復へ戻す。空DBのproduction bootstrapでも、所有者API/復号・生体vaultの受入でもない。

同じSourceのdb/schemaへ既存0030のSky Agent設定定義を取り込み、schema検査は固定した復元前提と明示した既存timestamp例外だけを検証する。新しい時刻逆行、公開SQL改変、root/drizzleとmainの不一致は拒否する。実D1のupgrade/再読/拒否試験と、schema inventoryを別々に記録する。新しい公開配備・実DB更新は未実行。Source-only差分と環境は docs/evidence/sky-source-regression-repair.json を参照。


### SI05 Agent成果を同じ会話へ投影する契約

目的は、保存済みAgent成果へ同じEve会話から戻れること。ROCKは本人照合・復号・参照投影と既存履歴CAS、EXTERNALはAgentの成果本文と署名、JOINTは実配送と画面読戻し、OWNERは成果の検収を担当する。既存Agent仕事の「進捗を会話へ反映」で、委任/保存成果ID/SHA256と最大4,000文字の抜粋を暗号化履歴へ保存する。全文は既存artifact保管に残し、別台帳を作らない。抜粋は未検収データであり、命令/権限/仕事成功/請求確定に昇格しない。

入力は認証owner・bound job/thread・既存artifact鍵。既存artifactのtask一致とAES-GCM/hash照合を通し、最大8子×2参照、本文は各1,600文字・合計4,000文字を上限とする。非テキストは実行しない。出力は既存会話の固定message IDへの更新で、重複発言を追加しない。保存はserver-only Agent work revision/thread/schema fenceと履歴CASを通し、競合/削除ではhistorySaved:falseとなり次のsyncで再照合する。鍵不足/復号失敗は成果参照と復旧案内を残し、停止制御を妨げず、平文fallbackや外部再送を行わない。本人停止と外部停止確認の既存境界は保持する。

合格は独立processの実成果が同会話へ復号投影され、再syncで同ID1件、古いwork revisionの履歴書込拒否、鍵なし停止と再送0、他owner復号拒否を確認すること。ブラウザ/別端末/本番Providerは別gate。未決の一般成果検収/大規模結果UIは既存artifact契約を使って実測し決める。[証拠](evidence/eve-execution-si.json)。

SI05成果投影のローカルbuilt UI: 同会話の参照/hash/未検収抜粋、仕事の全文/署名usage、同DBのserver再起動、終端子を持つ親停止/再読込を確認。最終receipt時のmeter報告待ち表示を訂正。本browser試験は既存storeへの実通信seed後の読戻しで、UI発行/本番Workflow/実Provider/実機/公開は別gate。[候補hash・画面証拠](evidence/eve-execution-si.json)。


### SI05 Broker承認を既存APIから確認して実行予約する

目的はEveで確認した委任を、同じ本人の端末Broker承認と原子的な予算予約へつなぐこと。ROCKは画面の条件照合・既存API接続・非同期競合処理、EXTERNALは端末Broker/Providerの資格と応答、JOINTは同候補の本人画面と実接続、OWNERは送信先/本文/料金上限の明示承認を担当する。

入力は保存したdraft/message/hash/期限/署名見積と、既存GET /api/sky/a2a-delegations/[id]のexecutionEnabled・Broker登録/期限。本人は端末で該当依頼を承認後「Broker承認を確認」を押し、未達なら理由と次操作を読む。条件が揃った場合だけ「表示した条件で実行を予約」を選べる。押下時にも再読して、既存PATCH approveへ本文とauthorization digestを一度だけ渡す。UIのreadyは権限や署名検証ではなく、serverが本人/Origin/実行gate/quote/本文hash/Broker鍵失効/予算を再検証する。新しい承認issuer/runner/金融台帳は追加しない。

依頼ID/親/送信先/版/本文hash/額/期限不一致、承認待ち以外、期限切れ、Broker未登録は実行予約を案内しない。仕事切替/確認閉鎖/アンマウント後は遅い応答から予約を始めない。応答喪失時は自動PATCH retryをせず、同じ依頼の状態を再読する。受付済み/実行中/結果不明/停止は承認待ちへ戻さない。API保存・予算予約と実Agentの開始/成功/請求確定は別状態。

合格は一致/改変/失効/未登録/期限/既承認を集中試験し、本人APIのgate/登録メタデータと他owner拒否、画面で未接続理由→確認→明示予約を検証すること。本番/物理BrokerとUI全縦断は別gateとし、不足はその接続を担当する工程で解消する。[実装・候補hash・受入範囲](evidence/eve-execution-si.json)。

SI05承認UIのlocal built受入: 合成ownerの無料署名quote→条件確認→Broker未登録拒否→一時鍵の証明登録→明示的な既存API実行予約（上限1 minor/親2 minor）→未配送停止/予約解放まで確認。user_approved1/remote_send_claimed0。UIで発見した既存quote fingerprint欠落を修正。物理Broker/配送Worker/外部Agent/実課金ではない。再読込後の承認待ちdraft再確認と端末handoffは残る。[候補hashと証拠](evidence/eve-execution-si.json)。


### SI05 承認待ちdraftの暗号化再開

目的は、画面を閉じても同じ親仕事・委任ID・本文・見積を確認し直せること。ROCKは既存入力保管への暗号化保存と本人/状態/CAS照合、EXTERNALはProvider見積/Broker証明の有効性、JOINTは再読込/再起動の同候補受入、OWNERは再確認後の明示予約を担当する。

POST /api/sky/a2a-delegationsは設定済みA2A入力鍵で本文を暗号化し、既存agent_delegation_inputsへawaiting_approvalのrevision/owner/hash/期限/親停止fence付きで保存する。新table/平文localStorage/別仕事台帳は作らない。鍵未設定の旧環境は条件draftだけを保持しresumeAvailable:falseと案内する。保存と再読込は承認/予算予約/配送ではない。

本人が「保存した依頼を確認・承認」を選ぶとGET ?review=1で復号し、親の本人/active状態/会話削除/停止、子の状態/期限、input hashとauthorization digestを照合して元のrequestを返す。最後のDB照合で確認中の親revision/子revision/削除/停止変更も拒否する。通常一覧/GETに本文を混ぜない。UIは遅い応答の親一致を確認し、同じreviewと既存承認APIへ戻す。restore時は既存の本人別Agent候補も読む。

既存approveの原子batchは同じowner/hashの暗号化入力だけを更新でき、承認前保存行と衝突して二重予約しない。入力TTLと既存purgeを共有する。承認済み/停止/期限切れ/別owner/鍵障害/不一致は再開しない。旧本文未保存は明示し、勝手に新draftや推論を作らない。停止APIは復号鍵に依存させない。

合格は暗号文保管と再読、旧行/別owner/鍵/改変/停止/削除/確認中競合の拒否、再開だけで予約/送信0、既存承認への1件移行、実画面再読込/再起動を確認すること。期限切れ見積の更新と物理Broker/実Provider/公開は別受入。[候補hashと証拠](evidence/eve-execution-si.json)。

SI05承認待ち再開のlocal built受入: 同DBでpreview serverを実再起動し、同thread/job/delegationの本文/送信先/上限/digestを画面で再読。候補restoreも確認。再開後もawaiting_approval1件・予約null・承認0・送信0。集中29/29、既存Workflow19/19、全体verify成功。物理Broker/実配送/公開とは別。[候補hashと画面](evidence/eve-execution-si.json)。


## PixelとWebの共通画面・端末同期（CORE05/06/08/12、OS10/SKY21・ROCK） {#pixel-common-ui-host}

2026-10-22 16:57 UTCの限定実機受入: 保存済みAPK24b443c0で既存accountのforeground同期、26jobs/2models/6agents/6replicas、鍵alias保全を確認。元試験APKへ復旧、メイン不変・同期service停止を読戻した。更新前remote履歴baselineはなく、同じ仕事の新規実行・全画面の目視・後続Native候補の受入は未完。[実機証拠](evidence/pixel-common-ui-integration.json)。

### 目的・体験と責任

Pixelの旧SkyLinuxActivity/EveLinuxActivityを現行のEve画面と混同しない。本人用debug APKの入口から、正規の`https://avoado.si/`と`/os/eve`を既存ブラウザで開き、同じ会員登録・Sky・Eve・ナビゲーションを使う。ブラウザのログインは本人の通常ログインを使い、端末sessionをcookieへ変換しない。旧native画面は端末内の実行・保存・停止・接続設定として保持する。ROCKは入口と同期・状態・復旧、EXTERNALはAndroid/GrapheneOS/Terminal・ブラウザ、JOINTは同一APK/Pixelでの縦断、OWNERはログイン・新端末承認・費用と実行の許可を担う。公開Webの新しい配備や全OSの合格は別gate。

### 入出力・状態・保存

既存account grant、Android Keystore、AVF tap相互TLS、同じLinux manager・job・model/Agent pin・`/api/eve/device-sync`・暗号化履歴を再利用する。debug限定のEvePixelHostServiceが、本人のアプリ起動/開始操作からforeground dataSyncとして最長30分、15秒間隔でstatusと同期を照合する。worker排他は既存Activity同期と共通化し、二重処理系を作らない。状態は停止中→接続確認→同期確認/再接続待ち→本人停止/時間終了。最後に確認できた時刻を表示し、通信中というだけで成果・停止を確定しない。端末ロック中はアカウント操作を保留する。新しいmodel取得・推論の自動開始・新規grant・端末認証鍵の作成は入口処理へ追加しない。

### 失敗・停止・復旧・承認

同期停止とLinux内で実行中の仕事の停止を分け、後者はEveの既存停止契約で照合する。serviceを止めても仕事・成果・モデル・Agentを消さない。接続障害は同じrequest IDの照会と既存冪等性で回収し、別仕事への無条件再送をしない。30分終了、AndroidのdataSync時間制限、process終了後はSTART_NOT_STICKYとし、本人の再起動操作から再開する。boot receiver、root、Doze解除、任意shell、JS/native bridge、cookieやbearerの持出しを追加しない。release Shellのno-network Binder契約と利用開始module既定無効は維持する。

Android 15以降のdataSyncは背景実行時間に制限があるため、常時自律実行やロック中同期の保証へ換算しない。公式の[start条件](https://developer.android.com/develop/background-work/services/fgs/launch)と[timeout](https://developer.android.com/develop/background-work/services/fgs/timeout)へ従いonTimeoutで停止する。

### 受入条件と未決定

`stage-pixel-common-ui.py`のhost試験、既存sourceに3段のoverlayを適用したAndroid build/unit/lint、同じ既存署名の照合、非破壊更新前のprivate baselineを必須とする。同じPixelで旧job/モデル/Agent/履歴のcanonical一致、foreground sync確認、停止、ブラウザの正規画面・同アカウント継続、同一仕事の実行/成果/保存/再開を個別に記録する。入口のbrowser起動だけで機能統合完了にしない。生の履歴/データはGit外・端末privateへ保存し要約だけを証拠にする。一般配布向けの背景起動方式、より長い自律運転、全損復旧、任意端末/生体vaultは未受入。実機前はsource/build準備と記録し、OS image/flash、本番請求、公開完了とはしない。


### SI05 A2A使用量照合context拡張（既定OFF）

目的は、一般の依頼文を変更せず外部Agentが同じ仕事の署名usageを作れること。公式A2A 1.0のmetadata/拡張交渉に従うRockstar固有契約であり、A2A標準の請求schemaではない。URIは `https://avoado.si/sky/extensions/usage-context/v1`、metadata keyは `org.rockstar.usageContext`、schemaは `rock-a2a-usage-context/1`。URIは識別子であり、この文書で公開endpointの配備を宣言しない。

ROCKは保存済み承認条件からの構築・allowlist・Broker/予算検証・receipt照合、EXTERNALはAgent宣言と独立署名/実報告、JOINTは同candidateのUI/Workflow/wire、OWNERは送信条件の確認を担当する。operatorのA2A_USAGE_CONTEXT_EXTENSION_URIが上記URIと完全一致し、取得済みAgent Cardが宣言する時だけ渡す。既定未設定は従来wireを保持する。一般公開/実Provider有効化の前にWebとnative Brokerのデータ開示・対応版・契約条件を照合し、古い承認への適用を再検査する。現時点の本番有効化は未受入。

入力は既存owner/parent/delegation/message ID、本文hash、authorization hash、通貨/上限、期限、存在する場合だけ料金版。本文/credentials/ciphertext/生Broker証明/任意追加fieldは含めない。contextは明細照合データであり、credential・実行許可・署名済みreceiptではない。Agentが受け取ってもOS権限/予算/再委任権限は増えない。UIは同意前に送る識別子を表示する。

clientは対象message ID/hash/期限/形式を照合し、宣言なし・未設定・不一致・余分なfieldを送信前拒否する。認可前にsnapshotを固定し、非同期処理中の変更で追加情報を送らない。既存authorizeDelegationが承認済み永続snapshotを検証してからだけSendMessageへ進む。message.extensionsとカンマ区切りA2A-Extensionsを同時に送り、Package拡張と併用する。本文はそのまま。失敗/応答喪失の既存一度送信/結果不明契約を保持する。

保存は既存WorkJob/delegationの承認条件とWorkflow stepへ関連付け、新台帳を作らない。戻るusageは従来のProvider鍵/owner/job/task/金額相関で独立検証し、context echoだけで成功/請求/入金/作者配分へ昇格しない。合格は一般文→独立Node Agent→署名receipt保存、未設定の互換、無権限/ID/hash/期限/未知field拒否、認可中変更の隔離をwireで確認すること。参考：[A2A公式仕様](https://a2a-protocol.org/latest/specification/)。同環境UI→予約→実Workflow→成果、物理/本番/公開は別gate。[証拠](evidence/eve-execution-si.json)。

SI05同環境Agent縦断: 最新built Webと既存A2A Workflowを同D1/R2へ接続。UI作成→独立Node Agentの署名見積→draft条件確認→合成Broker登録→UI予約→既存Workflow bindingへdispatch trigger→通常本文＋交渉済みcontext→独立署名usage/暗号化成果→UI検収2gate→親完了→同会話保存/reloadを確認。再Workflow照合でも送信1回、0 USD、予約settled。contextは既定OFF、実機Brokerデータ開示/契約/本番TLS/cron/Providerは未受入。汎用意味品質と修正は別。[同候補のhash・画面・範囲](evidence/eve-execution-si.json)。

Eve実行中Agent停止の追加証拠（AI02/AI05/SKY14/SKY21、ROCK）: 通常WorkJobの取消経路も設定済み成果復号鍵を既存会話投影へ渡し、停止時に完了済みsiblingの成果抜粋を保持する。鍵不足でも停止を妨げない。同環境built Web/Workflow/独立AgentのUIでworking→停止確認待ち→取消応答/署名usage→会話sync/reloadを確認し、送信/取消各1回・予約settled。合成Broker/loopback/ローカルWorkflow起動に限定し、取消未確認UI・実Provider・実機・公開は別gate。[証拠](evidence/eve-execution-si.json#SI05_workingStopUi)。

Eveの停止未確認と条件記録の再開: 同環境の独立合成AgentでCancelTaskがWORKINGを返した場合、既存Workflowの2回目照合でも取消は再送せず、cancel_unconfirmed/receiptなし/予約heldを保存し、UI再読込でも外部確認待ち/使用額未確定を示す。依頼条件の第一手順は、同じ親jobの保存済みquote digestがある子委任から確認できるようにし、予約後や再読込でも記録を失わない。表示対象のAgent/origin/上限/IDを示し、既存APIが本人・親job・保存署名quoteを再検証する。記録は承認/送信ではなく、停止済み親では不可。失敗時は同じ仕事を再読込し、別jobを作って回避しない。合格は既存状態の読戻しと手順記録であり、一般の意味検査/修正・本番Provider・実機/公開は別gate。[証拠](evidence/eve-execution-si.json#SI05_unconfirmedStopUi)。

Eve Toolの未達条件表示: 決定的な完成条件検査でneeds_reviewとなった工程では、保存済みartifactの不合格check（条件名/詳細）を本人画面と同じ暗号化会話へ残す。URL保持など別項目の合格を全条件の合格にせず、pendingFailureの工程/code/限定修正可否を併記する。条件の編集/緩和、再送、外部権限追加は行わない。再読込時も同jobの保存checksから復元し、修正不可能なら続行/完了を拒否して停止を残す。合格は必須文言不足の拒否と履歴再読、既存限定重複結合修正の成果/条件/予算保持で判断する。一般の意味品質/Agent成果修正は別の未完了範囲。[証拠](evidence/eve-execution-si.json)。


### main Sourceの梱包境界と旧系列の試験維持（CORE06/08/09・WEB04/RLS02）

main Siteの配信Sourceはroot drizzleをdrizzle-mainへ置換するため、Columbiaの元root系列を持たない。登録済みproject IDであることだけをSQL適合の証明にせず、`sites-migration-lineage.mjs`でcopy/remove前にmain/Columbiaの必須ファイルと混在を確認し、別SiteのSourceを拒否する。適合しない場合は元の梱包出力も保つ。本番DBへの照会・適用は行わない。

旧系列のempty/current・filename/Drizzle・保存row・SQL byteの回帰は、公開Source686fd5ab78015f6d8dc29030bfd4f76fb912a920のSQL9本とjournalの固定fixtureで全条件を保持する。fixture原本hash/生成物一致を検査し、main packageからの再生成を拒否する。fixtureをmainのbootstrapやColumbiaの新規配備へ使わない。mainは現行12本、0031のwatermark、restored DB前提と6件の実D1保全/拒否を引き続き別に検査する。正しいColumbia sourceの梱包と、欠落/混在での出力保全も含め集中27/27。公開/本番DB受入とは区別する。

Eve Agentの保存成果検査: 本人は新しいAgent仕事の作成時に任意の必須文言（最大20件/各200文字）と文字数範囲（1〜24000文字内、UI初期値1〜24000）を固定する。既存eveAgent bindingへeve.agent-criteria/1を保存し、作成要求hashへ含める。作成済み条件を変更するAPIはなく、通常plan編集でも条件は緩めない。旧仕事は既定の完全テキスト検査を使う。未完了/鍵なし/復号やhash/schema/task不一致/切詰め/非text省略/空本文/文字数や文言未達はpassedにせず、同じ会話へ理由を残す。成果本文の命令・URLは実行せず、合格は指定形式と文字列の一致で、事実/意味品質や外部成功の証明にしない。既存WorkJob結果記録/完了もserverが再検査し、CASで本人/親/終端子・完全なartifact集合を再照合する。成果追加/差替や新子が検査後に割り込んだら保存を拒否し再読込する。鍵障害でも停止を維持し、未達では再送/料金ゼロ/条件緩和へ逃げず保存成果と接続を確認する。独立Agent/同UI縦断、owner越境、欠落/不正/条件違反、検査後artifact追加の拒否が合格条件。一般Agent修正/意味検査/Provider/実機/公開は後続gate。[証拠](evidence/eve-execution-si.json)。

Eve Agentの同じ仕事内の限定修正: 元Agentがremote_completed/成果取得済みで、復号/hash/schema/完全textは正しいが文字数または必須文言が未達、かつ既存の検証済み利用receiptがある時だけ修正案を作る。本人のprepare-repairは既存WorkJobへ元成果ID/hash集合・固定criteria hash・新依頼ID/message ID/冪等key・8KB以内の固定draft本文hashをrevision CASで保存する。保存は新しい委任/課金/送信/権限ではない。再訪は同じ案/IDへ戻し、停止/会話削除/条件や元成果変更は拒否する。既存predecessor SQL一段/unique契約を保持し、初期上限は親あたり1回。後段へ渡す元出力はJSONの非信頼データ、元権限を引き継がず、本文共有・新quote・Broker証明・共通予算予約を既存経路で個別確認する。修正案本文/元ID/新IDが保存bindingと違う子作成は拒否する。一般の続きと修正を区別し、明示binding/同親predecessor/固定入力hash/元artifact集合/再検査passedが揃った時だけ不合格元成果のdeliverableを置換できる。元のfailed記録・成果・receipt/使用額は保持し、全子の終端/receipt・全artifact集合と子数CASは完了時も照合する。未達修正/上限/鍵や欠落/大きな本文は新しいjobや条件緩和へ逃がさず保留/停止を案内する。合格済みの無関係nodeを再実行しない。合格は同UI/同jobの未達→案保存→新承認→別ID一回送信→条件再検査→元成果/費用保持→完了、並行停止/CAS/越境/偽binding/上限/結果不明拒否。一般意味品質と多段修正/大artifact転送・モデル選定・本番Provider/実機/公開は別gate。[証拠](evidence/eve-execution-si.json)。

限定修正bindingは目的hashと元依頼の期限も固定する。後段の期限は元期限以下、元成果/条件/目的/本文hashと一致しなければ採用しない。active/reviewの既存状態を維持し、他nodeの合格を取り消さずに準備できる。8件上限では案を追加しない。


### Eve SI06：Agent原始利用元の追跡

目的は本人がEveの同じ仕事から署名済み利用receiptとPackage登録作者へ辿ること。入力はserver固定owner/parentJob/delegationのみ。既存A2A receipt storeの行/owner/provider/reference/通貨/合計を共通観測で検査し、receiptのSHA256を返す。binding参照がなければagent_only、参照/digest/Agent版/Provider/価格版/manifest不一致はpackage_unavailable、一致時だけpackage_attributedとexact Package/現在registry登録作者を返す。登録作者は報酬契約の受取人とは別で、developerPaymentはcontract_not_bound/amountMinor=nullを維持する。

ROCKはread-only投影と暗号化Eve会話への参照保存、EXTERNALは元Provider明細、JOINTは同一receipt/Package実接続、OWNERは後続の報酬契約を担う。新しい台帳/料金/配賦/請求/送金/権限は作らない。元receiptを変更せず再読込は同じ保存行を読む。現在registryが対象manifestを持たなければ作者を推測せず保留。失効したbindingも過去の出典として失効状態付きで表示し、実行資格へ昇格しない。原稿/鍵/生の署名原本を表示しない。

合格条件は別owner/親job拒否、receiptの照合失敗は投影なし、Agent/価格版/digest/manifestの改変で誤帰属なし、同一source反復で料金/DB変更なし、Eve会話にreceipt参照/hashと帰属の確定度が保存されること。障害時は既存receipt/仕事を保持して再読し、再実行しない。集中試験と実UIを分ける。永続作者契約版/入金/配賦は未実装で次のgate。


## 共通画面の色・導線・独立アカウント入口（CORE01/08/12・WEB04/WEB06/SKY21） {#common-os-entry-alignment}

- 目的・利用体験: Home、見つける、自分のSky、Eveを移動しても同じOSとして使う。共通frameはアイボリーの背景/面、深緑の主操作、ブロンズのfocus。主要5導線と仕事中の遷移制限を保持する。既存Toolの入力順や実行契約は変更しない。
- 責任: 主担当Web/PWA/Sites・ROCK。EXTERNALは配信基盤/ブラウザ、JOINTは同一配備候補の実端末表示、OWNERは登録・認可・公開を担う。Root、保持したSite Source、公開v111、Pixelの表示/実行受入は別に記録する。
- 入出力: `os-design-tokens.css`と`os-shell.css`の9色を一致させ、Home/timelineの補助文字に同じ色を使う。旧workspace CSSが持つ青系面は共通frameが上書きする。文字色#626e65と背景#f6f4efの計算比は約4.85、面#fffdf8では約5.25。通常文字4.5、focus3以上を対象色で検査し、全UIのWCAG認証とは扱わない。
- 導線: ガイドのブランドは`/os`、Mini製品リンクは`https://avocadomini.si/`へ戻す。利用権claimの認証切れは`/account?returnTo=%2Fconnect`を別タブで開く。ChatGPTを必須の登録方法にしない。リンクを開くだけでclaim登録/購入/課金しない。
- 状態・保存: 画面の検索、Agentの本人別一覧/設定/revision、会話/仕事/成果は既存保存/APIを使う。外観/URL修正だけで新しい仕事、履歴、credentials、device grant、台帳を作らない。認証切れ後の再確認はGETのみ、以前の入力と冪等性を保つ。
- 失敗・復旧: localhostの共通ナビが`/os/sky/agents`を404へ送っていたため、公開hostとloopbackのalias処理を同じにする。書換えでもhost/query/method/body/origin/cookieを保持し、Miniへ転送しない。任意の外部hostをalias対象へ追加せず、認証/許可originは緩めない。配備前は現行公開版を保ち、local候補は既存sourceから再buildできる。
- 承認: Add/モデル取得/Provider接続/実行/購入/新端末承認を表示確認に含めない。公開は同一Source/build/DB受入と本人の配備承認を別に通す。Pixelのアプリ更新はWeb候補の配備と同一視しない。
- 合格条件: 共通6契約、既存navigation/router/現行Agent一覧/認証切れclaimの試験、型/lint/build、実browserのHome→catalog→Eve→自分のSky→guideを確認する。Sourceの旧試験が強制citations転送や旧ChatGPT URLを期待した場合は、現行の本人別設定/APIと独立登録へ保護条件を移し、金融/同意/冪等性/入力保全のassertionを残す。
- 今回の観測: 隔離local DBの候補画面でHome/catalog/Eve/自分のSky/guideを確認。暗号化会話の秘密設定や本人データは入れていないため、空一覧/保存未設定表示は本人アカウントの同期合格ではない。Sourceの残る履歴/公開readiness試験と公開/Pixelの縦断は別gate。[証拠](evidence/common-os-entry-alignment.json)。
- 未決定の決め方: 初見操作の実測、全Toolの細部/動作、モバイル/実Pixelでの読みやすさは本人操作と同一候補で検証する。黄金比の普遍的優越、未配備の共通UI、全機種対応、生体情報保護の完成を宣言しない。

### Eve SI06：利用元の初回固定と競合検知

本人の「進捗を会話へ反映」で、既存WorkJob.eveAgent.usageSourcesへserver照合したreceipt/Provider/価格版/Package/現在の登録作者とcapturedAtを追記する。receipt本文や鍵、新しい金銭台帳は追加しない。同一delegationは初回だけ保存し、再反映ではrevisionを増やさない。並行保存は既存親revision CASで一つだけ受け付け、停止が先に確定した場合は再読込を要求する。停止回収では帰属保存を行わず、停止を優先する。

固定後にreceipt参照/hash/Provider/価格版/Package/作者の観測が変わった場合は保存時の利用元を保持し、現在情報との照合待ちを表示する。binding失効は現在状態として別表示し、保存済み出典は変更しない。復旧は同じjobを再読する。登録作者の確定や報酬契約の同意はこの保存から推定せず、developerPayment契約未結合/amount nullを維持。全owner/子件数/既存暗号化会話の境界を保持する。ROCKは保存と競合、OWNERは後続報酬条件の承認、JOINTは実Provider/請求一周を担当。集中試験で一回保存/並行競合/作者変更/失効を検証し、実UIの反映/再読を別に受け入れる。

### Eve SI06：二者署名の作者利用契約と固定source結合

目的は、保存済みAgent利用元を特定の作者・運営の合意した契約版へ一度だけ結ぶこと。独自内部schema `sky.author-usage-agreement/1` はid/version、publisher/platform/provider、exact Package/manifest、価格版、通貨、terms SHA256、発行/期限、双方key ID/Ed25519署名を持つ。独立の署名domainを使用し、全署名対象fieldを固定。server環境 `SKY_AUTHOR_AGREEMENT_TRUSTED_KEYS` のrole/principal/key/package pin/statusに一致する異なる二つの公開鍵のみ信用する。設定なしは拒否する。

既存認証/Origin/body12KB保護のEve Agent PATCH action `bind-author-agreement` はowner/parent/sourceを照合し、固定済みusageSourcesと現在のreceipt/Package/登録作者が一致・bindingがactiveである場合だけ検証する。契約の発行より前のreceiptや通貨/価格版違いは拒否。既存WorkJobのsourceへ契約原本/hash・receipt hash・boundAtを保存し、親revision CASで一度だけ確定。同一契約再通知は保存revision不変、別契約への上書きは拒否。停止済み仕事/履歴鍵利用不可は新規結合を拒否。

状態はcontract_not_bound、agreement_bound_pending_collection、agreement_unavailable。毎回のsnapshotで現鍵の失効/期限/出典競合を再検査し、保存済み契約は保持したまま有効性確認待ちを示す。結合は金銭台帳・追加請求・作者配賦・送金を作らず、amountMinorはnull。ROCKは署名/照合/原子保存、OWNERと作者は実際の条件本文確認と署名、JOINTは実Provider/Invoice照合を担う。今回の合成署名は法的契約成立・本人の署名操作を実証しない。terms本文の登録/表示/明示同意UI、契約単位失効、旧sourceに通貨/receipt時刻がない場合の確認移行、既存請求/配分連携は後続gate。任意JSON/自己申告の同意を契約として扱わない。集中試験は二者署名/改変/通貨/owner/期限/失効/上書き/並行を含み、UI・実契約・本番は別に受け入れる。

### Eve SI06：契約本文の不変版registryと本人確認表示

内部資料registry `sky_author_agreement_documents`（0080 migration、db/schema対応）はplatform/publisher/agreement ID/versionを主キーとし、二者署名原本/digest、terms本文/hashと作成/失効を保存する。金融台帳は追加しない。`register-author-agreement` は既存owner/WorkJob/captured sourceと二者署名を検証後、正確なUTF-8本文8KB/hash一致時のみ登録。同じ版の再登録は同じrowを返し、別本文/digestは拒否。DB triggerも本文/署名/版の更新・削除・失効取消を拒否する。失効はserver内部の当事者actor付き操作のみ、未認証公開endpointなし。

利用元への結合は登録本文の存在/hash/非失効を必須とし、WorkStore更新の同一SQL条件で非失効/契約digestを再検査する。preflight後の失効競合でも新結合を拒否。読取は署名有効性と独立に保存済み失効本文を保持し、現在の資格は別表示。既存auth/Origin/12KB request境界を保持。契約本文は通常snapshotへ含めず、本人のGET `id=...&terms=1` で対象sourceの同一Package/publisher/provider/価格版/通貨に一致する最大10版/childを取得。scriptを実行せずReactのplain textで表示し、親仕事が変われば旧要求をabortして表示を破棄する。

Eve「作者利用契約を確認」から登録済み/利用元結合待ち/照合済み/失効の本文を読める。これは同意・請求操作ではない。ROCKは不変版/署名hash/原子結合/本人表示、作者/OWNERは内容と実署名、JOINTは後続の実作者/Provider/Invoice一周。合格は本文改変/版競合/失効取消/owner越境拒否、preflight失効CAS競合、HTTP登録/結合/本文読取、実UIのplain text/再読込/空状態。本人署名ceremony・法的有効性・料金計算/入金/返金/作者配賦/本番は別gate。資料hashは内容の合法性・合意の法的成立を保証しない。



## 配信用Sourceの端末bindingと共通仕事API {#source-runtime-device-binding}

1. **目的**: CORE02/03/05/06/07、RQ04/07/12/41/42/48、OS10/DSP01/SKY21/WEB06。RootとSourceの端末登録契約差を閉じ、共通runtimeの同じjob/thread/reportを実Worker/D1で検証する。
2. **体験**: 既存device-code登録と本人のbrowser承認を使う。`X-Rockstar-Device-Binding: owner-device/v1`を明示した新hostにだけbeginのbinding宣言、authorizedの実session deviceId、未消費owner拒否のreasonを返す。未指定の旧Androidには元の厳密な応答fieldを保持する。SDK dev.7がbegin/pollだけで交渉し、body形式やAndroid parserの保護は緩めない。利用者の登録手順や新しいUI、実行権限を追加しない。公開版の更新とは別のローカル候補である。
3. **責任**: ROCK/Android Device Local AI、Source AMCはO6/OS10・DSP01が主担当、O5/SKY21・O7/WEB06と接続。OWNERは具体的な新端末承認、JOINTは同一公開候補/実機、EXTERNALはhosting/OS。合成ownerの試験を本人のgrantへ昇格させない。
4. **入力**: 既存beginのdeviceName、one-time deviceCode/userCode、browserのowner、runtime presenceと固定GGUF/Agent/hash、job/thread/claim UUID。 拡張headerは未指定か厳密なowner-device/v1だけとし、不明値はcode/session作成前に400。新しい任意shell、scopeや課金項目は受け付けない。合成の履歴暗号鍵はlocal Workerの試験bindingだけに設定する。
5. **出力**: 既存ランダムBearerに対応するowner/device ID、拒否状態、共通仕事/履歴/usage。Ownerによる未消費codeの拒否だけ`reason=owner_denied`を返し、消費後のaccess_deniedはreasonなしで保持。token応答喪失を「権限が作られていない」へ誤変換しない。
6. **状態**: pending→approved/denied→consumedと既存expiry/poll制限は維持。runtimeのpresence→pending→claim→authorize→report→ackを再利用。重複enqueue/reportは同じ仕事を照合、別claimは409。device Bearerによるbrowser発注は403。
7. **保存**: 既存auth/session/command/replica/history table、token SHA256、暗号化envelopeを使う。新しい顧客・料金DB/migrationを追加しない。報告本文やBearerがreplica暗号文へ平文で出ないことを検査する。過去のarchiveはその版のまま保全する。
8. **失敗**: 未認証401、悪いOrigin403、別ownerの発注/読取り、任意field、二重claim、失効済みBearerを拒否する。明示拒否と消費済み応答不明を区別し、勝手な再登録を許可しない。serverの保護・既存Guard・金融gateを弱めない。
9. **復旧**: 実Workerを停止/再起動し、同じD1のreport/hashと同threadの2発言を再読する。ack後に旧queueやlegacy device-syncへ残さず、device失効後の遅着reportは拒否し、本人の保存済み成果は読めるまま保持する。
10. **検証**: 旧Androidの厳密な6-field begin/4-field authorized/1-field deniedを保った実Worker試験、未知headerで認可row非増加、SDK headerと旧bodyの一致を検証する。新hostでの原始使用量や権限・費用の契約は変えない。`scripts/check-work-api.mjs`に既存SDKと同じbinding応答の照合、`runtime-device-api-acceptance.mjs`に実Worker/D1・Source本体のAPI経路を追加。build/型/lint合格、API1506 assertionsを確認。生成結果は手動の合成reportで実LLM/Native実行ではない。Source full verifyはNode2419pass/1skip・API1506/CSV385、RootはNode1405pass/1skip・API2059/CSV113、SDK60/60と別に記録。823file/12SQLの最終build梱包、_headersなし12応答/実JSbyte/8headerも一致。local proxyのLocation書換えは実公開redirectの証拠へ転用しない。
別途17:25 UTCのPixel読取り受入: 旧APK24b443c0の既存account/deviceで公開`/api/eve/runtime`を照合し、pending0と既存26jobs/2models/6agents/鍵alias保全を確認。最初のLinux接続timeoutは保持し、Terminal通常起動だけでmTLS statusの読戻しが復帰した。ただしphaseはstoppedで、新Nativeの能力・実推論は未受入。元試験APKへ復旧しメイン不変、端末の点灯設定15は保持。既存Pixelの継続試験はSource公開待ちを前提にしない。

11. **未完/次**: 同じ新Sourceの保存/公開は保留中の明示承認と正規helperのgateを通す。新Native APK/guestの実Android TLS/Keystore/AVF・実job・再起動/停止、Node packageの実本人grantは別受入。既存APKのPixel同期合格をここへ転用しない。[Source同一候補証拠](evidence/source-runtime-device-binding.json)。

## 配信用Sourceの応答保護・現行仕様・証拠参照（CORE05/08/09/12・WEB04/WEB06/SKY21） {#source-readiness-alignment}

- 目的/体験: 実行/認証に進む前に、Home・旧URL・エラー・独自SWが同じ保護方針で応答し、次担当が現行マスターと同じ機能/資料から再開できるようにする。
- 責任: 主担当Web/PWA/Sites・ROCKはrouter/stage/検査/資料の整合。配信基盤はEXTERNAL、同一Sourceの公開応答はJOINT、配備/本人認可/費用はOWNER。Rootのrouter契約試験とSites専用stage/実測を混ぜない。
- 入出力: `withMiniSite`の外側で、既存security policyのCSP/COOP/CORP/Referrer/HSTS/nosniff/X-Frame/Permissionsの8 headerをResponseへ強制する。status、既存private/no-store、cookie/認可境界、本文stream、WebSocket付属情報を保ち、本文を先読みしない。独自SWはscope`/`とno-cache/no-store/must-revalidateを返す。
- 状態/保存: Source buildはapplicationとouter routerを別ファイルでstage。既にwrapperがある再stageでもrouterだけ最新へ更新し、application bytesを保持する。未知のentryは元出力を変更せず拒否する。runtimeのowner/job/契約/金融台帳を変更しない。
- 検証/復旧: `/sky`互換は同originの正確な308先と8 headerを確認する。現在のmanifest/アイコン/hash付きJS/cacheをlocal production8応答で実測し、11入力hashとapplication/routerのbuild hashへ結ぶ。旧観測は元commit/旧hashで追跡する。検査の期待値だけを新hashへ変更しない。公開失敗は同じversion/responseを照合して復旧し、別配備を増やさない。
- scope: localhostで測ったSW asset分岐と、canonical public hostの独自SW分岐は別。Host headerの上書きだけではWranglerのURL hostが変わらなかったので、後者のruntime成功へ換算しない。独自SW/拒否/redirectはunitで確認し、本番のcache/更新/offline/本人データ保護は別gateに残す。
- 証拠の参照: main梱包で除外された旧`0014_jennifer_execution_integrity.sql`は、既存9本の不変fixture/原本hash/元commit686fd5ab…へAMC02の参照を移す。active migrationへ古いSQLを戻さず、履歴の合格を捏造しない。
- 現行仕様: Sourceも確定要望49と本人指定の全体マスターを入口にする。旧RQ50/Sky Compute Gridは追加拡張としてコード・固定lot・金融保留・負例を保持する。旧Turntable/E3の価格・4塔/Hubを現行R5へ要求しない。R5は単体/200mm/携帯電源の設計、電池方式・表示・実機・製造・価格は未受入。Homeは投稿stream、主要frameはアイボリー/深緑/ブロンズ。 R5専用CSSは旧dark campaignから残る薄い本文を共通OS tokenへ局所overrideし、他製品CSSを変更しない。導入リンクは`/os`へ直接開く。
- 承認: 以上の整合で実Cloud、署名/契約、課金、作者配賦、OS flash、実機/一般公開を開始しない。新しい本文/credentials/秘密鍵を証拠へ入れない。
- 合格条件: 変更前の保護header/stage負例、変更後のrouter/SSE/未知entry拒否、real local8応答、公開readinessのblock維持、baselineの49/拡張保持/旧価格拒否/未受入拒否、全Source verifyと同じ候補の表示確認を別に記録する。
- 現行公開と歴史証拠: Sites read-only metadataで現行project6abdf…/public v111/source6f32…/成功deploymentを同じIDで結ぶ。旧6aa…の本人限定auditとv53の合格は、固定した歴史identity/原証拠hash/範囲として保持し、現行publicへ転用しない。現行proofのsite/version/deployment/URL/sha/role/read-onlyを照合し、公開runtime gateはblocked必須とする。新配備/権限付与/本人journey受入は0。[読戻し](evidence/sites-current-public-observation.json)。
- 公開応答の不足: v111の匿名読取りではHome200/API401に8 header、旧URL308/独自SW/JS assetには8 headerがなかった。Sourceのwrapper修正とlocalhost実測だけでpublic解消としない。assetがWorkerの前で配信される場合の基盤対応、同一配備での再読取りをJOINT gateへ残す。
- 設計coverage: ecosystemの確定49項目と保存Source拡張1項目をそれぞれ完全照合する。旧RQ50のCompute Grid coverageを追加拡張として原文/参照/金融保留ごと移設し、設計coverageを実装や収益の達成率へ換算しない。
- 試験用DB: Sourceのmain0020は既存D1のALTERで、空DB導入の証明ではない。local Workflow/API/CSVの試験は、現行12 SQLと固定歴史fixtureから作る空の復元schemaを前提にする。table/index/trigger全定義を保持し、row/本人データ/filename・Drizzle migration receiptを出力しない。複文triggerを壊さずstatement単位でD1へ適用し、移行のfresh/current/中断/原本byte/誤Site拒否は独立試験で維持する。
- 未決定/次: Source全体の合格後も公開gate・同一account Pixel・共通ABI・storage/機微保護・一般SI・料金/入金/作者・各機種受入を続ける。全体goal完了とはしない。[同一sourceの証拠](evidence/source-readiness-alignment.json)。


### Eve：作者料の試算と詳細表示の整理（SI06 / ROCK）

作者/platformの二者署名が束縛する本文に`sky.author-remuneration-terms/1`を明示し、authorChargeのmeter/unitと既存Sky販売10%方針を固定する。原始quote digest/receipt/通貨/価格版/数量×単価/上限/契約失効をserverで照合し、指定作者料だけへ既存手数料を適用する。その他の利用料を作者売上やProvider原価へ推測しない。同じWorkJob.usageSourcesに決定的IDの候補を1回保存し、同じ再送はrevisionを増やさず、変更は拒否する。状態はpending_invoice_and_collection、transferRefはnull。既存LinuxInvoice allocation型を再利用するが、Invoice/入金/送金storeへの接続は未実装であり精算完了ではない。旧plain text契約は読めるが計算不可。

Eveでは契約状態と作者受取候補を短く表示し、本文・料金条件・保存hashは折りたたんで確認する。本ちゃん共通フレームを維持し、計算操作は詳細内から明示実行する。失敗は理由を表示、停止済みjobは試算不可。契約本文はplain text、仕事変更/unmountでは遅着応答を破棄する。受入は署名/改変/端数/再送/失効のfixture、型/lint、実UIの開閉・再読込を別記録。実作者署名・Invoice接続・UI全体の会話統合・公開は未完了。


### Eveの継続仕事で新規入力を折りたたむ（SI05/SI07/T12）

ROCKは既存Workbenchと同じjob/thread/状態遷移を維持し、Eveで仕事選択済みなら新規仕事を「別の仕事を作成」から開く。初回の仕事作成は展開する。既存Agentがある場合の追加依頼、新しいCloud依頼もsummaryから開く。限定修正/前段成果の引継ぎ/明示PackageやCloud draftは入力を継続できるよう展開する。既存依頼の進捗・予約/利用額・承認待ち・停止・エラーは折りたたむ新規formの外に保持する。開閉で外部送信や同意は発生せず、本人が元の見積・承認手順を実行する。開閉は一時表示状態、仕事/予算/契約/成果の正本は既存server。失敗は既存errorを表示し、再読込で同じ仕事からやり直す。共通色token/余白へ合わせ、独自テーマなし。合格は継続job初期非表示、開く/閉じる/入力/再読込、既存停止/受取候補の読取、外部送信0。実UI/全体回帰と公開は別gate。


### Agent契約明細を既存支払い画面から照合（SI06）

既存`POST /api/sky/payments/statement`へ`source:sky_agent`と元delegationのsourceIdを渡す読取経路を追加。ROCKはowner-scoped WorkJobの固定source/現在binding/二者署名/非失効本文/元quote/receipt/承認上限/保存済み配分候補を再照合し、`sky.agent-usage-statement/1`を返す。入力金額は受け付けず、観測総額、作者料、既存10%手数料、作者受取候補、他利用額、通貨、原始参照hashと同じEve job/threadへの参照を示す。collectionはnot_configured、providerInvoiceはunreconciled、customerPaymentはunconfirmed。型既定のcloud_llm経路は維持し、不明sourceを拒否する。

既存支払い画面のAgent行で「契約と配分候補を照合」を選び、結果と同じEveへの導線を読む。読取は仕事/支払/金融台帳を変更せず外部APIも呼ばない。失効・鍵不足・source変化・候補改変は理由を示し、履歴の元利用額を0へ置換しない。詳細読取の遅着応答は画面更新/unmountで破棄する。Agent checkoutは未対応のまま、LLM専用FK/trigger/二重請求防止を維持する。Invoice/顧客回収への接続には前節のsource移行と実請求条件が必要で、この明細を請求可能/入金済みとしない。EXTERNALは実Provider請求/決済、OWNERは請求主体/BYOK既払/課金範囲/返金配分、JOINTは将来の実sandbox照合。合格はserver再計算、owner/未登録/失効/候補改変拒否、同じ明細の再読取不変、金融row0、実UIの読取/戻り先/失敗。公開は別gate。


### 署名済みAgent請求経路の準備（SI06、未回収）

`sky.author-remuneration-terms/2`は既存作者料条件にcollectionを追加する。modeはplatform_invoice/external_provider、chargeScopeはauthor_fee/receipt_total/none、usageFundingはplatform/byok、refundPolicyはitemized_source/1。組合せを厳密検証し、external_providerはnoneのみ、platform_invoiceのBYOKはauthor_feeのみ。旧v1/plain textは保持し、請求経路を推測しない。既存不変本文/hash・作者/platform二者署名へcollectionも束縛する。本文変更は新しい契約版・署名が必要。

既存Agent statementは、照合済み本文と再計算済み候補からsky.agent-collection-plan/1を返す。platform_invoice候補は指定作者料または総額の原始minor額、BYOK作者料限定ではその他利用額を除外する。external_providerのRockstar請求候補はnullで、支払済みや無料とは扱わない。planは同じallocationCandidateId/receiptSHA/agreementSHA/通貨を持ち、customerConsent=missing、providerInvoice=unreconciled、invoice=not_created。既存collection=not_configured/入金未確認を維持する。

本人はEveの契約詳細と既存支払い明細で請求経路/対象/保留条件を読む。開閉/読取は同意・Invoice作成・引落ではない。ROCKは厳密parse/原始額再計算/版束縛/表示、OWNERは実契約と請求同意、EXTERNALはProvider請求/既払の証拠、JOINTは将来の回収照合。返金はsource lineへ紐付ける方針だけを固定し、部分返金/税/紛争の配分と既払検証が実装されるまでは回収/作者送金を無効にする。新台帳や架空LLM/Linux記録を作らない。失効/不正条件は拒否し、旧記録を保持して新契約で復旧する。合格は署名改変拒否、BYOK総額再請求拒否、direct providerのnull保持、旧契約未設定、同明細再読取不変、金融record0、実UIと回帰。既存月次Invoice/回収source移行と利用者同意束縛は未実装の次工程。

## 静的assetとWorkerを同じ応答保護へ通す（CORE05・WEB04/WEB06） {#source-asset-security}

- 目的/体験: JS/CSS/icon、旧URL、サービスワーカー、API拒否を同じ保護方針で返す。静的ファイルの先行配信で認証や応答保護を飛ばさず、画面の読込み・更新・cache効率を保つ。
- 責任: ROCK WebはSource buildのstageと検査。EXTERNALはSites/Cloudflareのasset配信。JOINTは同一package/配備の実応答、OWNERは既存audience/認可・公開の条件。RootにはSites専用stageを作らない。
- 入出力: Sourceの生成wrangler設定で元assets directory/他設定を保持し、binding=ASSETS、run_worker_first=trueを固定する。実frameworkはビルド済みJSを404としたため、GET/HEADの`/_next/static/`だけouter routerからASSETSへ渡し、8headerを付ける。API/POST/画像最適化/Miniは元の経路、binding不在は既存frameworkへ委譲。正常200/206/304の公開assetには既定immutable cacheを適用し、private/no-store/Set-Cookie/404は昇格しない。本文は先読みせずETag/型/状態を保つ。
- 状態: 元app→既存router wrapper→保護された配信。再stageはbuilt app bytesを変えず、routerとassets設定を更新する。既にWorker先行でも同じ設定になる。
- 保存: 元SQL/DB/claim/usage/本人データは変更しない。build config、application/router bytes、入力hash、実測のURL/status/header/cache/本文hashを証拠へ束縛する。
- 失敗: assets directory欠落、異なるbinding、未知のentrypointを変異前に拒否する。ASSETS配線不明やpublic応答不一致を、local合格や_headersの存在だけで成功にしない。
- 復旧: 元Source/packageの固定hashを保持し、同じ版の再読取り/rollbackを使う。Sites配備結果不明で別配備を乱発しない。旧public v111の観測は修正後へ転用しない。
- 承認: 新しい公開範囲・device grant・model実行・課金は作らない。既存認証/Origin/owner/host/query/body/機微cacheの境界を保つ。
- 合格: 実asset serviceで_headersなし・Worker存在/API401保護済みでもasset-firstのJS/SWが迂回する負例、stage後のGET/HEAD/304/404/旧URL308/canonicalSW/API401を確認。実production buildのstatic bytes/type/cacheと画面読込み、packageがWorker先行設定を保持することを独立確認する。
- 梱包検査: Sites Source内の`python3 scripts/check-sites-package.py /absolute/path/site.tar.gz`で全file集合/各byte・Site identity・ASSETS設定・選択済みSQL集合/byteを読取り比較する。追加/欠落/改変、._/__MACOSX、重複、危険path、link/特殊file、上限超過を拒否し、diskへ展開しない。Macの正規helperはCOPYFILE_DISABLE=1で実行する。検査合格だけでSource commit保存/配備/公開受入としない。
- 未決定: 同梱toolのconfig解釈、実Sites配備、canonical hostでのreadbackが残る間はpublic runtime gateをblockedへ保つ。Worker invocation増加による遅延/CPU費用は未測定であり性能優位を宣言しない。
- 参照/次: [一次資料: asset binding](https://developers.cloudflare.com/workers/static-assets/binding/)、[headers](https://developers.cloudflare.com/workers/static-assets/headers/)。Source候補の実測→Source全verify→package→同じversion/deploymentの公開読戻しを別々に進め、全Goalの合格に換算しない。


### Agent請求準備の本人アカウント確認（SI06）

既存Eve commandにrecord-agent-collection-consentを追加。本人認証/Origin/同じjob/source/暗号化会話/現binding/二者契約/非失効本文/元quote/receipt/保存候補を照合し、利用者が表示したstatementDigest、正確なminor額、通貨、confirmed=true、親revisionを検査する。platform_invoice候補だけが対象で、Provider直接払い・旧未設定・BYOK総額への変更は不可。確認記録sky.agent-collection-consent/1は同じWorkJob.usageSourcesへ保存し、新金融台帳を作らない。記録はowner/source/digest/候補ID/契約SHA/receiptSHA/額/通貨/時刻/保留status。IDはこれらの確定参照から決定的に生成。同条件の再送は同じ記録/版、異条件は409。同時更新は既存CASと原子的な契約非失効fenceを通す。

支払い面の「この金額・条件の確認を記録」は請求準備用の確認であり、自動引落/送金の許可や法的契約成立の実証ではない。既存会話へ短い確認記録を投影し、再読込では同じ条件の確認済みを表示。確認前/記録後ともProvider請求未照合・Invoice未作成・入金未確認・collection無効を保持する。失効/金額/版違いでは理由を表示し、保存済み確認記録を改変せず、新しい有効条件で復旧する。停止済みjobの保存済み利用明細確認は可能だが、job status/stop intentを保持し新しい委任・権限・予約を作らない。ROCKは照合/保存/UI、OWNERは内容を読んだ操作、EXTERNALは実Provider/決済、JOINTは将来の実Invoice/同意/回収一周。

合格はowner/改変/未確認/古い版/失効拒否、CAS競合/失効競合、同一確認再送、停止job非復活、元usageと金融record不変、会話/実UI/reload。本人署名ceremony、実請求契約、Invoice source移行、Provider請求/既払/部分返金/税/異議、実収納/送金は未完了で、確認記録を実回収へ昇格しない。


### 完了Agentの請求準備を既存支払いstoreへ保存（SI06 / migration 0081）

既存sky_usage_paymentsをsource_kindでcloud_llm/sky_agentへ分ける。既存source_id→remote_ai_text_executions FKを残し、Agent用agent_source_id→agent_delegations FKとconfirmation_idを追加する。旧LLM全列/入金参照/返金/時刻をそのままcopyし、cloud_llm既定・Agent列nullで移行する。sourceごとの一意制約、session/intent一意、額/通貨/参照不変、返金単調、削除禁止を保持。新台帳や架空LLM/Linux jobは作らない。

Agent行はtest/prepared専用、source_id=null、元Agent/確認参照必須、session/intent=null・返金0。CHECKでpaid等への昇格を拒否する。準備額は原始JPY/USD整数（1〜99,999,999minor）をそのまま保存し、checkout最低額へ切り上げない。既存LLMの50minor最低額とstate集合は保持。SQL insert guardはowner/job/完了Agent/receipt/承認上限/現在binding/固定source/確認digest/額通貨/候補/非失効の署名本文を照合し、BYOK作者料のみ・platform管理の明示総額だけを受ける。暗号署名とquote hashの再計算は既存server resolverが先行し、保存時の契約失効競合はDB guardで拒否。

既存POST /api/sky/payments/prepare-agent-invoiceはSKY_PAYMENTS_MODE=testかつSKY_USAGE_AGENT_INVOICE_PREPARATION_ENABLED=trueの検証環境だけで、同じstatement digest/金額/通貨と本人確認済みを再照合して保存する。入力owner/支払済み情報は受けない。同じsource/mode再送は同じrecord、異条件/不明/失効は409。Provider/Stripe APIは呼ばず、既存confirm/webhook同期はAgent preparedを拒否する。支払い面では確認済み候補から明示保存し、保存済み・Provider未照合を読む。旧LLMの照合ボタンをAgentへ表示しない。読み直しで復旧し、履歴参照を置換しない。

ROCKは移行/原子照合/保存/UI、OWNERは候補条件の確認、EXTERNALは実Provider請求と入金、JOINTは将来の実Invoice・回収一周。移行はmigration managerのtransaction/D1 batchで適用し、途中失敗をrollbackする。検証は旧LLM全項目/FK/guard保持、SQLiteと実D1 batch rollback、既存6移行系列、Agent一回保存/別owner・額・失効拒否、JPY端数非切上げ、paid昇格不可、実UI。初回の新D1試験はMiniflare旧形式起動設定で失敗し、既存convertV4MiniflareOptionsへ合わせて再検証する。

このrecordは請求準備で、正式Invoice/Provider請求照合/顧客収納/作者送金ではない。liveはschema/APIとも無効。失敗・取消Agentの費用、月次集約、実契約/本人の収納委任、既払/BYOK照合、税/部分返金/異議/送金、一般公開のgateを残す。実データへの移行/公開は未実行。

### 同じEve仕事内の利用明細（SI05/SI06/T12）

本人のデザイン相違指摘に対応し、Eveの既存会話sidebar・共通上部5項目を保持したまま、Workbenchの選択済みAgent仕事に「この仕事の利用と支払い」を追加する。開いた時だけ既存SkyPaymentsをembedded表示し、閉じる/仕事切替時は読取り応答を無効化。保存済みAgent仕事を選ぶ時は、そのjobの保存済みthread IDへ会話を切替え、workJob URLも同じ選択へ保持する。同じ会話内の仕事選択では未送信の依頼文を消さない。別の会話一覧、仕事/支払い台帳、認証は作らない。アカウント全体の明細画面も同じcomponentを再利用する。

- 入出力/責任: ROCKが認証済みownerとparent job IDでGET agent-summaryを取得。外部Provider呼出・料金変更なし。元receiptの利用額、既存0081の準備額、未照合状態、次の操作を先に表示。料金内訳/作者配分候補、保存hashは閉じたdetails。Eve内では二重の常設仕事一覧をやめ、保存済み仕事は「保存した仕事を選ぶ」から開く。接続済みの案内は共通の通常色とし、明細はその案内の外へ配置する。成果条件も独立したdetailsで参照できる。本人確認対象の請求候補額・通貨・未入金・未請求書の状態は隠さない。
- 保存/競合: 条件確認と準備保存は既存API/WorkJob/sky_usage_paymentsのみ。本人条件確認の戻りjobは同じIDかつ古くないrevisionに限りWorkbenchへ反映する。画面開閉は仕事作成/Agent送信/支払いを行わない。停止済みjobの状態を変更しない。
- 取得/失敗: アカウント全体の直近100件をclientで絞る方式を使わず、owner+parent jobで照会する。他ownerのjobは利用/準備行とも空。各jobが100件を超えれば101件目を検出し、部分表示を全件と偽らず409で停止。全体の期間検索・ページングは未実装のため案内しない。契約失効/変更時の明細再照合は既存server guardが拒否し、古い候補を破棄する。
- 復旧/承認: 同じ会話/jobへreloadし再取得する。既存契約・本人確認・test-only準備flagを維持。月次請求/Provider invoice/入金/送金/公開は別gate。未実装0082の生成差分は取り下げ、受入済0081を保持する。
- 合格条件: 他仕事101件後も古い対象jobの元receipt/準備行が見える、他owner非開示・余計なquery拒否・上限時保留、実Eve内で開閉/内訳/確認/保存/reload/同job同recordを確認。全verifyと同じbuildの実表示を別証拠に残す。実Provider・Pixel・公開には繰り上げない。

### Agent月次準備明細の保存（SI06 / migration 0082）

既存sky_usage_paymentsのsky_agent/test/prepared行を原本とし、共有sky_linux_service_documentsへkind=agent_monthly_statementを追加する。これは参照文書であり、Linux workspace/契約/基本料/利用権や別の金融台帳を作らない。ROCKは集約・本人分離・CAS・原本照合、EXTERNALは将来のProvider invoice、JOINTは将来の入金照合、OWNERは既存の各明細確認と将来の実請求/送金承認を担当する。

- 入力/状態: 本人がUTC利用月と元通貨USD/JPYを選び、検証flag下で月次下書きを保存。schema sky.agent-monthly-statement/1、mode=test/state=draft_unreconciled/baseMinor=0、invoice=not_created/collection=disabled/customerPayment=unconfirmedを固定。実請求書ではない。
- 原本: receipt.issued_atのUTC月（準備保存月/ローカル時刻ではない）と元通貨でprepared行を取得。各sourceの現在の署名済み契約・元usage・本人確認・digest/金額を再検査し、一件でも失効/不一致なら文書全体を保留。未報告/未準備を0円の行へ変えない。1〜200件、201件目は省かず409。未来月/不正月/通貨/他ownerは拒否または非開示。
- 合計/作者: 請求準備額と観測額を別集計。作者料/commission/payable/その他は原本ごとの整数をBigIntで合算、月額から10%を再計算しない。BYOK実費を準備額へ足さず、為替/料金改定/税務確定を行わない。
- 保存/復旧: owner+月+通貨+modeから決定ID、owner/kind/period/currencyの一意index、member payment ID重複拒否、各receipt月と元paymentの照合、旧memberの不変性をSQLで強制。署名照合と保存の間に契約/接続の期限が過ぎた場合も、DB時刻との比較で保存を拒否する。遅着した準備行だけ既存文書へappend、revision CASで同時更新拒否/同内容再送は同ID/revisionを返す。月次文書は削除/支払済み昇格不可。本文は元仕事/会話/receipt/契約の参照と料金メタデータだけ、原稿/署名原本は複製しない。既存Linux文書の6列はbyteを保持、新period/currencyはnull。0082中断はD1 batch内で旧表/制約までrollback。既存コードとmigration順は配信Sourceの独自系列へ個別適応する。
- 本人UI: アカウント全体の支払い明細内「月ごとの請求準備を開く」から月/通貨指定→保存/保存済み読戻し。観測総額と候補合計・未照合を先に、作者配分と元Eve仕事はdetailsで表示。Eve内の同job表示は全月の他jobを混ぜず、アカウント全体へのリンクを使う。保存一覧は最新100件と明示。閉鎖/遅延応答は無効化、条件確認や支払いへ自動昇格しない。
- 合格/未決: 同時同内容一件、遅着append、JPY19+19の手数料2/作者36、通貨分離、他owner拒否、改変/削除/member消失拒否、失効raceで全体保存拒否、旧文書保持/中断rollback、実D1と実UI/全verifyを同一候補で検査。現在はtest draftのみ。締め後訂正/正式invoice番号/Provider照合/入金/税務/作者送金/本番gateは未完、各実契約条件と既存BIL02で決定する。


## 共通Nodeホストの初回接続と再開 {#runtime-host-enrollment}

1. **目的**: CORE01/02/07、RQ04/07/12/41/42/48、OS10/SKY21。dev.5の既存setup/connect/run/statusを実際の導入・接続・保存再開へ結ぶ。別のowner DB、実行runner、料金台帳は作らない。
2. **利用体験**: 導入済みの許可モデルをsetupで検査し、Git外の専用profileを用意する。本人のTTYで15文字以上の解除句を非表示入力し、Webの端末名/scopeを見て承認する。既存sessionでreceiverを開き、Eveで承認した下書きを同じ仕事/会話へ返す。statusは保存済みの接続状態であり稼働確認とは別。
3. **責任**: ROCKはpackage、CLI、profile/暗号化vault、既存device/runtime/replica/historyと再送防止。OWNERは解除句と具体的な新host承認。EXTERNAL/JOINTは実OS/daemon/公開サービスの稼働・同一候補の受入。metadata確認を安全な隔離や実model品質の証明にしない。
4. **入力**: HTTPS origin（開発時のみ明示loopback HTTP）、端末名、導入済みmodel pin、既存schemaの担当設定、短命の端末コード。認証結果owner/device IDを保護credentialへ固定し、入力JSON/モデルから本人を指定しない。
5. **出力**: 接続状態、受信可能状態、同じjob/thread/output hashとreview/UNKNOWN。下書き保存を本人検収・外部Tool成功・入金へ昇格しない。npm bin symlink/macOS path aliasはrealpathでentryを照合し、配布CLIとして実行でき、importだけでは起動しない。
6. **状態**: prepared→pending→linked。serverが明示した`access_denied/reason=owner_denied`と`expired_token`だけpreparedへ戻し、次の接続は新コードと新たな本人承認を要する。消費済みコードのaccess_denied、poll応答喪失、承認後の保存不明、本人中止だけで終端未照合はuncertainを保持する。理由なしaccess_deniedを拒否確定と解釈しない。
7. **保存**: 既存0700 profile/0600 file、UUID+POSIX UID binding、scrypt/AES-GCM vaultを再利用。解除句/tokenをargv/env/JSONログ/会話/tgzへ含めない。ローカルjournalは認証済みowner/deviceに束縛し、私有UIDの旧成果を自動採用しない。既存lockをPIDだけで自動削除しない。
8. **失敗**: binding未対応は本人の承認画面/poll前に拒否してpreparedを保持。違う解除句/owner/device/並行起動はpromptやjob実行前に拒否。consume後の応答喪失はsessionを作り直さず、本人がサービス側で既存grantを照合/失効するまで新しい接続を拒否する。
9. **復旧/停止**: reportのSQL commit後にHTTP応答だけを失った場合、別processで同じ暗号化credentialを解錠し、同じjournal/job/output hashを再読して既存reportをackする。再推論・新job・新grantなし。closeは新規配送を止め、進行中の実停止確認とは別。engineStopConfirmed=falseを保持する。
10. **承認/検証**: 新Mac grant、本人解除句入力は準備後の最終本人操作。合成owner/fixture driverを使う実SQLite store・隔離HTTP・standalone tgz・別Node processの試験を`npm --prefix packages/rockstaros-runtime test`で実行する。Root verifyにも入口を含め、実Worker APIでbinding/device ID/拒否理由とgrant非増加を照合する。実推論/公開/Pixel受入とは別。
11. **未決定/次**: 現在の公開Sourceはowner-device binding宣言/device IDを返さない版で、Rootの新host対応を公開済みと表示しない。承認待ちのasset修復Source候補へこの差分を混ぜない。Source独自系列への適応→同じ公開版の読戻し→具体的な本人Mac grant/同じEve会話を別gateで続ける。Pixel共通ABI、生体vault、hard resource isolation、常駐、全損復旧、本番請求と全Coreの完成は未受入。[証拠](evidence/rockstar-runtime-host-enrollment.json)。

### 資料付きNews草稿のEve仕事接続（SI07/T10/T12）

既存toolkits/eve-newsのvalidatePacket/validateDraftを再利用し、既存WorkJobへtemplateId=eve-news/eveNews schema=eve.news-work/1を追加する。公開feedの見出し/検出時刻だけを、本文や利用権/公開時刻へ昇格しない。現段階は資料付き草稿の取込と参照検査で、ニュース自動取得→LLM生成→意味検収→掲載/訂正の全縦断は未完である。

- 本人体験/責任: Eveの既存会話frameに「ニュースの草稿と資料を確認」を置く。既存CLIの--bundle出力（packet/draft/modelLabel）をファイル選択→非秘密資料/草稿の本人アカウント保存への同意→同じ会話の仕事に保存→参照検査→reload/停止/会話反映。ROCKはparser・source hash/ID・状態・本人分離/停止/保存・参照検査、EXTERNALは取得元/生成モデルと本当の本文・利用権、JOINTは将来の実資料/モデル/公開/訂正受入、OWNERは素材利用範囲の確認と人による採否を担当する。fileの余分なjob/thread/consent等はclientが持ち込まず、serverは許可fieldだけを受理する。
- 入出力: source packetは既存1〜12資料、草稿の主張1〜80件と既知source ID、articleText上限12,000字、権利scopeをparser検査。HTTPは128KiB、保存入力は96,000字。公開HTTPSは参照文字列の制約（IP/内部名/認証情報/独自port拒否）で、DNS/原文への接続確認ではない。本文は非信頼データとして保存・plain text表示し、命令や実行権限にしない。資料本文は本人同意下の既存WorkJob payload、会話投影は既存暗号化historyに置く。秘密情報の保存を許可する入口ではない。
- 状態/検査: 取込元model label/digestはunverified_import、externalToolSuccess=false、生成usage/金額はnot_reported（0へ置換しない）。serverの独立auditはtracking/hashを除いたURL重複、厳密UTC/公開取得順/未来日時、指定訂正・撤回資料の参照漏れ、主張台帳文言の草稿内有無を検査。未参照資料/公開日不明/7日超/反証・対立・不明は保持し表示する。政治的立場で削除/同じ重みに調整しない。各claimのverified_fact/supportedも生成元の申告であり真偽検証済みと表示しない。構造通過はreview=人による確認待ちまで、semanticTruth=not_verified/politicalFairness=not_evaluated/publication=not_publishedを保持。全体の意味的主張網羅や根拠の強弱は未評価。一般record/edit/complete APIで昇格できない。
- 保存/失敗/復旧: 既存workStoreのowner/job/revisionとrequest hash（資料・草稿・指定model・thread）で作成再送を同jobへ束縛、入力変更は409。checkは操作UUIDを既存eventsに記録し再送を重複実行しない。owner/threadで絞ってから最新100件を返す。初回INSERTは同owner会話のtombstoneをSQLで検査、仕事を保存してからnews/schema/thread/revisionのDB fence付き暗号化投影を行う。会話との競合/鍵障害でも保存仕事を失わずhistorySaved=falseとしsyncで修復。停止はhistory鍵・期限/利用権gateから独立して新しいcheckを拒否し、素材・失敗結果を保持。停止後のcreate再送は復活しない。一般Workbenchの実行候補に混ぜず専用Eve表示から確認する。
- 承認/非対応: 取込/参照検査は推論/原文取得/投稿/課金を呼ばず、掲載APIを持たない。取込元の使用量・本当のmodel実行証明、学習同意/撤回、意味評価、政治立場入替えモデル評価、原文の再取得、訂正の旧稿連結・公開/取消は別の未完gateにする。ローカルCLIは既存導入済みモデルだけを使い、推論前後inventory digestが違う/再確認不能なら出力しない。前後一致は実行重みの暗号学的証明ではない。
- 合格: 同時作成/再送と同job/thread再開、他owner拒否/削除race/古いhistory投影拒否/鍵なし停止、訂正未参照・重複URL・古い/未来資料・未知出典・利用権なし拒否、同一入力の話者属性を替えても構造検査基準が変わらないこと、実Worker/実UI/全verifyを候補hashで記録する。話者入替えの構造対称性をLLMの政治的公平性へ転用しない。


## Pixel Linuxを共通Coreから実行する接続層 {#pixel-portable-executor}

1. **目的**: CORE02/03/07、RQ04/07/12/41/42/48、OS10/SKY21/DSP01。共通kernelから既存Pixel Linux manager/workerを同じjob/thread/Agent/model/hashで実行する。別runner・顧客DB・金融台帳は増やさない。
2. **利用体験**: 第一者hostが認可済みrequestを`@rockstaros/runtime/linux`の`createPixelLinuxExecutor({manager})`へ渡す。managerの内部executeText/describeTextを使い、既存の仕事・成果・停止へ接続。新しい一般向け画面やHTTP actionを用意した意味ではなく、Android側の共通ABI接続と本人受入は別に続く。
3. **責任**: ROCKはdriver、ABI交渉、引数/保存/再送防止、実行上限、既存packageの同一hash。OWNERは具体的なhost grant、model/資料/外部送信、実機解除。EXTERNAL/JOINTはAVF/Linux/llama、同じ実機/候補の停止・再開・権限・資源の実効性。合成Linux metadataを実機証明にしない。
4. **入力**: 既存common requestのjob/thread UUID、固定Agent ID/設定hash、GGUF model ID/hash、入力4000文字、出力1〜1024tokens、120秒以内のdeadline。既存managerの追加済み/準備済みmodelと担当を照合し、自由なshell/endpoint/codeを受け付けない。Ollama manifest hashとGGUF hashを交換しない。
5. **出力**: 既存Linux runのreview下書き、同じjob/thread、model pin、原文hash、durationとlocal usage0を共通text-outputへ投影。外部Tool成功、本人検収、実収益/請求へ昇格しない。保存済みの同じrequestは追加推論なしで再読する。
6. **状態**: workerの固定`capabilities`操作で`rockstaros.linux-text-capability/1`・protocol1・最大1024/120000・Linux/aarch64を実行前に検査。不明/旧ABIはcommon認可/claimやmodel生成の前で拒否。ready/prepare/active/stop未確認、review/confirmed/UNKNOWNを既存状態へ対応させ、abortを停止確認済みと同一視しない。
7. **保存**: 既存manager state.runsの同じjobへsurface=runtime、threadId、runtimeBinding（request SHA/deadline/cap）を保存。旧surface=eve/従来仕事とはID衝突を拒否。共通hostの既存owner/device journal・暗号化Eve replica/historyを再利用し、私有UIDの旧仕事やAndroidのcredentialをguestへ自動採用/コピーしない。
8. **失敗**: model/Agent/hash変更、scope外request、期限切れ、出力cap不正、busy、旧worker ABIを実行前に拒否。生成失敗/停止/応答不明は同じIDを自動再実行しない。起動や期限の検査が失敗しても一時promptをfinallyで削除する。エラー文やusageへ個人本文/credentialを入れない。
9. **復旧/資源**: run中断は既存stop/PID+boot+start照合を使用し、遅い成果を採用しない。共通requestだけworkerの-n、残wall timeout、RLIMIT_CPUを上限へ束縛。Popen後にも残期限を計算。旧入力は512tokens/180秒/CPU170の契約を維持。RAM/egress/cgroup完全隔離、電源断、常駐、実CPU実測を今回のhost fixtureで合格にしない。
10. **承認/検証**: 一般HTTP actionにexecuteTextを公開しない。認可は既存Core/Broker、driverは文章計算のみ。`tests/pixel-portable-executor.test.mjs`でCore→既存manager→worker引数→Eve SQL/history、同ID再読/競合/停止/旧ABI拒否を検査。Python subprocess/rlimit設定はfake child/captureのcomponent試験。SDK pack/standaloneとPixel guest11ファイルmanifestのbuild/hash一致を別確認。実Pixel・native mTLS・新ABI全工程は未受入。
11. **未決定/次**: SDK dev.6を開発候補としdev.5の受入artifactを上書きしない。公開Sourceへのhost binding適応と最終本人grant、Android/Keystore→既存mTLS→内部portの目的限定接続、保存済み実機試験/新ABIの同一候補実機受入を進める。一般公開/実課金/全OS flash/鍵生成は今回実施しない。SDKのNode hostは別途承認されたclientであり、Androidのgrantをguestへ渡す仕組みではない。[証拠](evidence/pixel-portable-executor.json)。


## Pixelの共通実行private transport {#pixel-runtime-private-transport}

1. **目的**: CORE03/05/07、RQ04/07/12/41/42/48、OS10/SKY21/DSP01。既存Android Keystore/mTLSの先で、同じLinux managerの共通executorへ目的限定の接続を足す。別runner/仕事DB/会計台帳を作らない。
2. **体験/入口**: Pixel serverはguest内owner-private Unix socketを作り、既存Python mTLS clientがruntime-capabilities/start/read/cancelだけをrelayする。従来HTTP actionは変えず、Android既存UIも自動で共通仕事へ切り替えない。account controllerによる実際の共通仕事のpoll/claim/authorize/report/ackは次工程。
3. **責任/信頼境界**: ROCKはframe/引数/相関/保存/停止・復旧、OWNERは既存accountと具体的な権限/実機解除、EXTERNAL/JOINTは同一機種のKeystore/TLS/AVFと実効性。guestの同UIDは第一者の信頼領域で、scope文字列自体をcloud認証証明としない。cloud grantをAndroidで検証するcontrollerなしに認証済み全実行を宣言しない。
4. **入力**: protocol1、scope SHA256、claim UUID、同じrequest SHAと既存common text request。目的はpixel-linux-gguf/text.generate、費用上限0、期限はrequestと一致。24KB/1 frame/15秒、タスク記録100件。credential/任意endpoint/shell/余分なfieldは拒否する。scopeはNativeがservice originとKeystore内ownerから導くopaque値とし、modelやWeb入力へ発行権を与えない。
5. **出力**: starting/running/review/unknown/not_found/cancel_requestedと同job/thread/claim/digest、review時だけ原文/model/hash/duration。capabilitiesはprotocol/scoped flagと実worker ABI。cancel_requestedだけではstopConfirmed=false。Native validatorは正確なcapability名・数値/boolean型、schema/相関/原文hash/許可fieldを検査し、秘密値付きframeを拒否する。
6. **状態**: startは非同期で既存executeTextを一度呼び、読取りで確定する。別scope/claim/digestは不在と同じ応答、同じIDの上書き/joinは拒否。接続喪失/Node終了/Native終了/実engine停止は別で、not_foundを再送許可にしない。旧ABIとの切替は新規配送前に能力を確認する。
7. **保存**: 既存run.runtimeBinding.hostBindingに正規化したscope/claimを保存し、同じrequest digest/threadを保持。旧無scope/legacy jobを新accountへ自動採用しない。socket directory0700/file0600、既存endpointはlive/deadを憶測して上書きしない。tokenやAndroid秘密鍵をguestへコピーせず、socketは同UIDを越える完全sandboxの代用にしない。
8. **失敗/保全**: 再起動試験で、成果作成後の後処理中にcloseがcancelして成果を消す競合を再現。transport/managerのcloseと環境停止はactiveだけへ停止要求し、review済み成果は後処理完了を待って保持する。別scopeからのread/cancel、改変/有料権限/期限変更/過大frame/二つ目のsocket起動は拒否する。
9. **復旧**: 同scope/claim/digestの保存済み成果を新しい接続から再読し追加推論0。異なるscopeは同じUUIDでも読めない。旧socketが残る場合は新portを未準備にし、従来Skyのデータを保持。停止確認前の遅着textは返さない。常駐/電源断/全損復元/同UID侵害/実ネット隔離は別受入。
10. **候補と検証**: stage-pixel-runtime-transport.pyは別debug sourceへNative応答検証だけを追加し、release manifest/権限/署名identityを変えない。host実UDS/Python relayと実manager保存、stage拒否、Android debug/release build・JVM/lintを検証。mTLS部分は既存の証明書pin処理を保持したsource/buildの確認で、今回実Android TLS接続を行った証拠ではない。
11. **未完と次**: `EveAccountSync`の既存credential/同期exclusion・foreground制御に、保存済みclaim journal、固定owner/device/readback、source/guest capability前検査、grantの目的限定変換、UNKNOWN/report/ackを接続する。新Native/guest候補は未導入、元APKとdev.6封印物は保持。一般公開/実課金/OS flash/新署名鍵/生体情報の本番保管へ進めない。[証拠](evidence/pixel-runtime-private-transport.json)。

## Pixel共通仕事の暗号化claim保存 {#pixel-native-claim-journal}

1. **目的**: CORE03/05/07、RQ04/07/12/41/42/48、OS10/SKY21/DSP01。Nativeから共通仕事をclaimする前に、同じowner/device/job/request digestとclaim IDを保存する。別の顧客DB・仕事runner・金融台帳は作らない。
2. **体験/入口**: `EvePortableClaimJournal`は共通controller用の内部部品で、画面追加や旧同期の自動切替は行わない。`stage-pixel-claim-journal.py`は別debug候補へ配置する。実行開始/実機導入とは別の準備である。
3. **責任/境界**: ROCKは暗号化、型/版/hash、CAS、保存失敗時の配送停止を担う。factoryは既存accountのorigin/ownerを照合し、既存Android Keystore aliasの鍵だけを読む。鍵不在時に生成せず、token・鍵をguestやjournalへ入れない。実device/grantの照合は次のcontrollerの責任で、journal stateを権限にしない。
4. **入力**: 正確なruntime-command/1 field、owner/device、GGUF固定model/担当hash、UUID、request canonical SHA256。input4000/display2000、担当名80/instructions1200、model ID80、output1〜1024、初回deadlineは未来120秒以内。余分なcredential field、型強制変換、安全整数外、制御文字、modelの`..`を拒否する。
5. **出力**: commandのcopyと不変claim UUID、revision、観測state。JSのsorted-key canonicalと順序付き担当recipe hashをUnicode/孤立surrogateも含めて照合する。copyを編集しても保存内容は変わらない。出力だけではCloud認可・engine成功・停止・課金の証明にならない。
6. **状態**: prepared→claim_unknown→claimed→dispatch_unknown→dispatched→report_unknown→reported→acked。未確定箇所からunknownへ止められるが、unknown/ackedからprepared/dispatchへ戻せない。CASと同じ依頼hashを照合し、期限後の再読は許可しても新規実行許可にしない。report本文保存/照合はcontroller接続時に追加する。
7. **保存**: noBackup内0700 directory、0600 lock/ciphertext、FileLock、AES-GCMとpurpose/package/origin/owner/deviceのAAD、同IDのclaim保持、全体/record revision。100件・envelope4MiBまで、fsync→atomic rename→directory fsync→byte readback後にmemoryを更新する。既存成果を空ける自動evictionは行わない。
8. **失敗**: 別bindingのciphertext、改変、暗号化済み内部schema不整合、unsafe mode/symlink、同時instance、鍵不在を拒否する。破損ciphertextは削除しない。write/rename後の応答喪失も含め、当該instanceを使用不能にし、古いmemoryで後続上書きをしない。
9. **復旧**: lockを解放して同じbindingで開き直し、同job/claim/revisionを読み直す。保存済みstateをblind resend許可にしない。AES-GCM単独で古い正規ciphertextの巻戻しは検出できないため、server claim/fencingの再照合が必須。実電源断・disk full・Android実fsync/Keystore全損をhost試験で合格としない。
10. **合格条件/検証**: production JSとJVM golden照合、owner/device/origin/packageすり替え、CAS/UNKNOWN/再読/改変/鍵不在/lock/rename後失敗、stageのdrift/repeat拒否を検証する。debug/release build、JVM/lintとRoot全体verifyを同じsourceへ揃える。release manifest、既存bridge、鍵生成関数はstage前後同byteで確認する。
11. **未完と決め方**: Native account controller、厳密なdevice/server grant、非重複legacy queue、結果/reportの永続保存、UNKNOWN照合、実機受入を順に追加する。候補APKは実機へ未導入。生体/健康本番保管・実課金・全OS flash・公開の完了へ昇格させない。[検証記録](evidence/pixel-native-claim-journal.json)。

## PixelのNativeアカウント共通実行 {#pixel-native-account-controller}

以下のJVM51と候補は前段の保存済み受入。実HTTP・失効停止の後続変更と現在の候補は[Nativeの実通信統合](#pixel-native-host-integration)に記録する。

1. **目的**: CORE03/05/07、RQ04/07/12/41/42/48、OS10/SKY21/DSP01。既存Eve account・暗号化claim journal・Linux managerを同じjob/thread/digestで接続し、別runner/顧客DB/台帳を作らず一周させる。
2. **体験/入口**: 既存Activity同期と本人開始の30分foreground同期から同じcontrollerを使う。共通仕事の取込みはserverのbrowser承認後だけ。従来Pixelの保存済み仕事/同期対象は保持し、runtime namespaceを旧consumerで消費しない。新APK/guest候補は実機へ未導入。
3. **責任/境界**: ROCKは固定origin/owner/session/deviceの照合、状態・保存・停止/再送制御。JOINTは実HTTP/Keystore/mTLS/AVF/同候補の受入。OWNERは既存account/新端末grant/実機解除。BearerはNative専用、guestにはscope hash/job/claim/request digestとtext.generate/費用0/期限しか渡さない。model出力をTool/課金成功へ昇格させない。
4. **入力/能力**: runtime-command/1の型・版・正確なfield・UUID・model/Agent hash・output cap/deadlineを検査する。固定GGUF/Pixel Linux/aarch64の実worker ABIをclaim前に検査し、30秒descriptorを既存presence APIへ送る。最大8候補から1仕事ずつ扱う。24KBを超えるstartは送信marker前に拒否。未接続の能力や古いserver claimを新規実行許可にしない。
5. **出力**: 同jobのrunning/review/unknown/waiting/保存確認。reviewは同thread/model/hash/duration、現在のgrantを再検査後に下書きとして保存。unknownを完了/停止確認/0円請求済みにしない。guest cancel_requestedはstopConfirmed=falseのまま表示し、古いscopeの仕事だけを停止要求する。
6. **状態**: claim_unknownを先に永続化し、同claimのserver読戻しでclaimedへ進む。dispatch_unknown後の不明はreadだけで照合し、not_foundでも再startしない。実行観測とpublication prepared→confirmed→ackedを分離し、publication開始後は実行状態へ戻さない。server orphan claimにlocal recordがなければUNKNOWN、勝手に引継がない。
7. **保存**: 同じAES-GCM/noBackup journalへimmutable reportとpublication revisionを保存し、元のprimary revision/global revisionも照合する。成果の送信前にreportを保存、serverの同id/claim/request/model/output再読後にconfirmed、ack応答後にacked。既存Eve replica/history APIを使い、旧成果を別ownerへ自動uploadしない。
8. **失敗**: claim/start/report/ackの応答喪失、別owner/費用/期限/permission、guestのmodel/thread/hash変化、余分なsecret field、旧ABIを拒否。401は同じcaptured sessionだけを失効扱いにする。アカウント切替/停止/既知の認可拒否後は、そのscopeの進行中仕事へcancelを要求し新規配送を止める。通信切断中は期限120秒の既存grant範囲を越えて継続しない。
9. **復旧**: 同じjob/claim/reportを再読し、report/ackだけが未完ならLinuxなしでもaccount側の照合を進める。報告応答喪失後に同一reportのserver保存が見つかれば再publish/再推論しない。ack喪失後はqueueに仕事が消えていても保存済みreportを照合する。失効/期限後のlate結果、全損/新deviceへの復旧は自動的にgrantを再発行せず別gateで扱う。
10. **検証**: JVMで実暗号化ファイル・別instance再読・偽account/guest portによるlost-response/停止/失効を検査する。JS本体とのcanonical/report golden（Unicode/孤立surrogate/空白）も照合。既存manager/UDS回帰、Python encoding/stage、fresh 3-stage同byte配置、debug/release build/lint、Root verifyを同じsourceへ揃える。実HTTPと実Pixelを組み合わせた証明はまだない。
11. **次と未決**: 実Eve auth/replica/historyとproduction Linux managerへNative controllerを一つのhost試験で接続し、次に同じAPK/guestのPixel受入へ進む。公開Sourceのsession/device binding、現在保留の公開承認は別に解消する。恒常background、実電源断、資源制限実効、生体/健康vault、全OS flash/本番請求は本候補で合格としない。[証拠](evidence/pixel-native-account-controller.json)。



## Pixel guest更新の保全・停止・復旧 {#pixel-guest-update}

1. **目的**: CORE03/05/07、RQ04/07/12/41/42/48、OS10/DSP01/SKY21。既存update-pixel.pyを使い、共通ABIを含む同じfirst-party server/worker/Android relayを切り替える。端末ごとの新顧客DB・runner・金融台帳は作らない。
2. **体験**: Developer Previewの本人用更新。通常Terminalの所有者UIDで、別の信頼できる場所に固定したpackage manifest/updater SHAを確認し、`python3 update-pixel.py --manifest-sha <sha256>`を実行する。AIの実行環境を止め、Android同期consumerも止めてから更新する。任意作者のSky pluginや一般OS installerではない。
3. **責任**: ROCK/Android Device Local AIが11-file package検証、保全、固定2 service、記録、失敗復旧を担う。JOINTは同じPixel/guest/Nativeでの実接続・推論・保存、OWNERは本人の導入/具体grant。署名済み公開更新・同UID侵害防御・全OSをこのSHA検査で合格にしない。新しい鍵・OS flash・回線/課金は変更しない。
4. **入力**: exact11file manifest、独立に固定したSHA256、既存app/state/models/worker/bridge/pairing。payloadはhash照合した同じbyteをstageへ書き、manifestの再読すり替えを避ける。Node/runtime-lockの変更は別gate。symlink/別所有者private file/過大code、稼働/準備中/停止未確認を拒否する。
5. **出力**: 更新ID、manifest hash、committed/rolled_back/要復旧、保持job/model/Agent件数、private data/pairing保全とcapability確認。機微receiptはowner-privateに置き、Eveや共有Downloadへ鍵/本文を転送しない。buildのowner-update-review.jsonはhashメモで、署名ではない。
6. **状態**: staged→services_stopped→old_moved→installed→committed。FileLock、private更新記録、stage codeのfsyncとdirectory rename/fsync、workerと実行中relay client.pyのatomic切替を行う。新しいserverは記録の未完了/破損/不足を配送停止として扱い、HTTP mutationとprivate runtime-startを止める。status/既存export/緊急停止は残す。
7. **保存**: 既存state.jsonのowner/schema/jobs/models/agents/選択をcanonical hashで照合し、アプリだけをprivate updatesへ退避する。未追跡のapp内code fileも保持。worker/relay旧codeを保存するが、モデル・account・接続秘密鍵・owner stateをbackupで自動上書きしない。private identityの照合結果は保全のbooleanとして扱う。
8. **失敗**: hash/所有/lock/版/並行書込/切替/ABI/service確認の不一致を失敗として残す。既知の新codeと退避old codeだけを戻し、未知の変更・変更されたbackup・変化したprivate dataは推測で消さず要復旧。この更新script自体をmodel出力から起動するAPIは追加しない。応答不明を再実行の許可にしない。
9. **復旧**: 未完了記録がある間は次の更新を拒否。`--recover <current transactionId>`は現在のpointerと一致する未完了IDだけを受け入れ、固定service停止/旧code/既存data照合/再起動を行う。以前利用できたprivate capabilityも復旧確認し、未確認なら成功にしない。電源断/鍵全損/全損データ復元は別gate。
10. **検証**: 実ファイル/lock/fsync/receiptと合成serviceでPython18ケース、manager/guard/実UDSと停止回帰、旧Native/JDK HTTP縦断、同一package11fileとupdater hash、Root full verifyを検査する。実systemd・実Android TLS/AVF・実モデル・物理電源断へ転用しない。同UIDは信頼する開発境界で、公開配布の署名/独立Security受入が残る。
11. **次/決め方**: 2026-10-22の実Pixelでguest更新と26jobs/2models/6agents・private data/pairingを保持、Native308e候補の既存鍵/HTTPS/mTLS/ABIと既存6replica・foreground履歴同期/停止を確認した。これは既存仕事の接続受入で、新しい共通仕事の推論受入ではない。同じ候補の実Android journalは既存鍵・隔離した合成記録でatomic保存/再読/二重writer/改変拒否を確認し、試験用領域を削除した。既存cache準備、Web本人が明示する1仕事/同thread/成果/再起動・停止/UNKNOWNを次gateにする。Source公開待ちを既存Pixelgrantの試験停止理由にせず、ownerログイン前にdevice tokenで本人操作を代行しない。[現在の証拠](evidence/pixel-guest-update.json)。

## Nativeの実通信・再起動・失効停止 {#pixel-native-host-integration}

1. **目的**: CORE03/05/07、RQ04/07/12/41/42/48、OS10/SKY21/DSP01。共通controllerを実HTTPS・既存認証/SQL保存・private Linux managerへ接続し、同じ仕事/会話/成果の再開を検証する。前段の偽account/guest portだけの検査から進める。
2. **体験**: 既存Activityと本人開始のforeground同期を使う。runtime専用HTTP clientをAndroid bindingとhost検証で共有し、従来同期のHTTP処理は保持する。新候補は未導入。別の保存済みAPK `24b443c0`では、既存accountのforeground同期と仕事26件/モデル2件/Agent6件、6会話replicaの保全を実Pixelで確認した。更新前のremote履歴baselineはなく、新候補の実行受入には転用しない。
3. **責任**: ROCKは固定account/origin/session/device、HTTP制限、暗号化保存と停止要求。JOINTは実Android TLS/Keystore/AVFと同一候補の受入、OWNERは端末解除・必要な具体的権限。fixture CAは子JVM専用の一時truststoreのみで、OS/Androidの信頼設定を変更しない。新しい実利用者権限、署名鍵、実課金を作らない。
4. **入力**: `EvePortableHttpClient`は固定`/api/eve/runtime`のGET/PUTと厳密UUID照会だけ。HTTPS、明示localhost開発だけHTTP、redirect禁止、接続10秒/読取り15秒、送信120000/受信640000 bytes。毎回sessionを前後照合し、device cacheは同じsessionからのjournal検索用hintに限る。HTTP本人照合やgrantの代用にしない。
5. **出力**: 既存job/thread/report/historyとrunning/review/unknown/保存確認。正確な`application/json`と有効UTF-8を検査し、HTML/JSONPを拒否。401は一致する古いsessionだけを失効させる。404のみ照会不在へ変換し、他の拒否・切断を空の成功にしない。
6. **状態**: encrypted publication prepared→confirmed→ackedを維持する。reportの応答喪失後、JVM強制終了・server/SQL/manager再起動でも同じclaim/reportを照合し、保存済み成果を再推論しない。初回inspect時の401/403/409や停止でも既存journalの自分の進行中scopeへcancelを要求する。
7. **保存**: 既存AES-GCM journal、Eve replica/history、Linux manager保存を再利用する。device IDは固定session hashごとの既存private prefsへ同期commitし、Bearerを保存しない。次回はjournalを開いてからHTTP認証を確認し、失効時に既存runを特定できるようにする。新しい顧客/課金DBは作らない。
8. **失敗**: 初回host検証はJDKがOrigin headerを抑止して403。試験子JVMにだけ互換設定を加え、server側のOrigin検査は維持した。また次回inspect拒否時の停止漏れと、空本文401でtyped拒否に到達しない経路を修正。redirect先へcredentialを送らず、不正content type・失効後の遅着成果を保存しない。
9. **復旧**: 同じjournal/owner/deviceでserver保存を再読し、失効時のcancelに新しい実行grantを要求しない。停止要求と停止確認は分ける。ローカルlogout・鍵の利用不可などでbinding作成前に止まる場合の即時cancelは未受入で、既存最大120秒の実行期限だけを即時停止の証明にしない。
10. **合格証拠**: JDK3 process/1 SIGKILL、実TLS、既存auth store、実SQLite file再open、production UDS/managerの再起動と本文なし401を検証。生成childだけは合成で2実行、保存1仕事/2履歴、再開時追加推論0、scoped停止1。Android JVM52/52・debug/release build/lint、fresh3-stage/17file一致を別記録する。実Cloudflare route/publicサービス、実LLM、AndroidのTLS/AVF/資源制限はこのhost gateで合格にしない。
11. **未完と決め方**: 公開Sourceのsession/device bindingと保留中の公開承認を確認後、同じ新候補APK/guestの実Android TLS・AVF・同job/thread/artifact・再起動/停止を受け入れる。既存APKでの履歴同期合格と混同しない。恒常background、UNKNOWN全復旧、全OS、生体/健康vault、本番請求、全体Goalは未完。[現在の同一source証拠](evidence/pixel-native-host-integration.json)、[既存APK実機証拠](evidence/pixel-common-ui-integration.json)。

### News草稿の同一仕事内修正（SI03/SI07）

目的/体験: 参照検査で要確認になった草稿を、同じowner/thread/jobのまま修正・再検査する。ROCKはCAS・操作ID・過去版・上限、OWNERは修正版と理由、EXTERNALは取込元モデル情報、JOINTは同候補のUI/保存復旧を担う。PATCH reviseはdraft/modelLabel/reasonと既存revision/commandIdを受ける。資料packetと初回request hashは固定。旧draft/audit/理由/時刻とreplacement hashをWorkJob内へ最大2件保存し、旧結果を消さない。修正版は未検査activeへ戻し、専用checkだけがreviewへ進める。掲載/真偽/公平性/Tool成功/料金の権限を得ない。

失敗/復旧/承認: 停止/完了/検査合格/未検査からの修正、同内容、変更された同操作ID、他owner、古いrevision、削除会話を拒否。応答喪失は同操作ID/hashで再読、CAS競合は読戻し、暗号化履歴投影失敗でもWorkJobを保持。上限2回は進展なし時の保留を明示し、検査を緩めない。本人の保存済み資料だけを使い、モデル呼出/投稿/外部送信を自動追加しない。合格条件は原稿/検査保持、再検査、同ID再送、再起動、停止非復活と上限の実保存試験/UI。これは本人編集の基盤であり、自動修正モデル/意味品質/公開は別gate。自動修正の方式は実測比較と既存予算承認を満たして選ぶ。

### Newsの上限付きローカルモデル修正（SI03/SI07）

目的/体験: 失敗した参照検査を原因として、同じ資料・仕事・会話の草稿をローカルOllamaで1回修正し、同じ独立検査へ通す。ROCKは既存generateText/Ollama inventory/共通usageとWorkJob CASを使い、EXTERNALはモデル応答/counters、OWNERはモデル名/digest/保存済み素材の実行サーバー内送信同意、JOINTは同候補の実HTTP/Worker/UIで検証する。`EVE_NEWS_LOCAL_REPAIR_ENABLED=true` の明示設定時のみAPI実行可能で、既定無効。Cloud fallback/新モデルdownload/公開/課金を追加しない。

入力は既存job/revision/commandId、auto-repair、導入済みmodelLabel/modelDigest、consentLocal。packet・前稿・失敗検査を非信頼データとして24,000文字まで、出力900token、既存adapter20秒timeout、試行60秒lease、最大2試行/修正版2回を強制。資料の重複/日時不整合は固定packetをモデルで直せないため呼出を拒否。正しいモデル前後観測に加えreportedResourceId照合後だけ草稿をparse/権利・参照schema検査→中央revision reducer→独立参照auditへ通す。名前/hashだけの変更を進展としない。合格しても人確認待ち・未掲載、真偽/政治公平性未検証。

保存/失敗/復旧/停止: 同じWorkJob内にinput hash、試行ID、同意モデル、lease、sendingをCAS保存してから呼ぶ。同ID再送は保存状態だけ返す。報告usageは既存SkyUsageObservation（原始token/未知金額/未照合/作者未契約）で保存、初回import生成の未報告usageと混同しない。timeout/応答喪失/worker crashのsending/unknownは再配送しない。異なるcommandの再試行もsending/unknownでは拒否。モデル変更/利用不可/不正草稿/無変更は採用せず理由を保持。停止後の遅着はusageを保存し草稿を採用しない。削除会話へ再投影せず、鍵障害では仕事と観測を保持。モデル呼出が停止済みとは確認できない場合、OS job停止と外部計算終了は別。合格証拠は集中/実HTTP/Worker再起動/同ownerUI/全verify。実Qwen品質・意味品質・複数実業者・Pixel・公開は別gate。次のモデル/上限は固定条件の実測から決める。

### News修正の構造化候補と失敗node限定（SI03/SI07）

原因/目的: 実QwenがJSONをMarkdown枠で囲み、主張文言も本文に含まれなかった。受信parserや独立auditは緩和せず、既存adapterのOllama専用`ollamaSchema`へserver生成schemaを渡す。公式仕様は https://docs.ollama.com/capabilities/structured-outputs （2026-10-22確認）。ROCKはtyped候補/parse/CAS/監査、EXTERNALは文法制約へのモデル応答と実token、OWNERは同じ保存済み目的・素材・モデル同意、JOINTは実HTTP/Worker/UIの同候補受入を担う。

入出力/状態/保存: ledger_text_presentだけが失敗した時は{articleText}候補だけを要求。既存headline/claimLedger/unresolvedQuestions/packetはserverで保持し、余計な候補fieldを拒否する。訂正参照の失敗には既存draftJsonSchema(packet)の全草稿候補を使い、許可source IDをschemaへ束縛する。共通adapterはOllama時だけschemaをformatへ、temperature0をoptionsへ付け、他providerへのschema転用・16,000文字超・不正schema形を呼出前に拒否する。通常呼出は既存wireを維持。24,000文字prompt/900token/20秒adapter/60秒lease/最大2試行とWorkJob・旧版・usage契約を維持する。

失敗/復旧/承認/合格: Markdown除去等の寛容parseや、URL/権利/主張対応検査の削除は行わない。実の全草稿schema試験が20秒timeout/unknownとなった事実を保持。同試行は再送せず、別候補試験前にserverログの500/cancel/全slot idleを確認。本文修正の実Qwenは構造対応まで合格したが、台帳外の表現や意味品質は未検証で人確認待ち・未掲載。修正済みというだけで真偽/政治公平性/投稿/Tool成功へ昇格しない。合格は同じ仕事/会話・旧版保持・実counter/前後digest・独立参照check・停止/再起動・Worker/UI・全verifyの範囲へ限定。次の課題は主張網羅/意味照合・対照評価と通常editor/選定で、既存の未完gateを維持する。

### News本文・台帳・資料の文字対応と通常編集（SI03/SI07）

目的/体験: 台帳文言が本文にあるという片方向検査だけでは、本文の台帳外記述が残る。ROCKは本文の文・段落をUTF-16位置付きで分け、claim文字の対応・未対応断片・同じ文言がある資料候補を保存/表示する。EXTERNALは資料やモデル応答の実内容、OWNERは編集・主張/出典/分類/理由の確認、JOINTは既存WorkJob/会話/再起動/UIで検証する。政治立場を判定/排除せず、原文を非信頼データとしてReact文字表示する。

入出力/状態/保存: NewsAuditの互換optional coverage(eve.news-coverage/1)とbody_ledger_coverage検査を追加。256文・段落/対応情報60,000文字を上限に、超過・空本文・未対応文字があれば通過させない。句読点/空白の扱いと逐語対応だけで、否定・数値・記号・その他の未対応文字を保持。主張の指定資料内に同文言があるかも別表示し、言い換えは意味未確認とする。資料で同文言が見つかっても、真偽/支持/主張の意味的網羅は合格にしない。前の4検査だけの保存物は新しい文対応を未検査と示し、専用checkで更新した時だけ現行結果へ変える。Source3検査とdraft2検査を混同しない。

操作/承認/失敗/復旧: 同じ本人の草稿編集をJSONから見出し/本文/主張文言/分類/根拠状態/資料checkbox/理由/未解決事項へ変更。未対応文を主張へ加える操作は本人が明示し、既定はunverified_claim/unknown、同文言資料は候補としてのみ選ぶ。資料packet/ID/初回hashを変更せず既存revise/CAS/2回上限/旧稿・旧audit保持/停止非復活を維持。serverの権利・参照schema検査は継続。本文文字対応だけの失敗でledger側が存在する時は全草稿schemaで主張を補う候補を扱い、本文限定修正はledger_text_presentも失敗した場合だけ。旧auditでの自動修正は再検査を要求。上限到達/不明/鍵障害/競合は既存保留・読戻し経路に戻す。

合格/未決: 否定/数値/Unicode位置/台帳外の資料由来文/過大範囲/旧audit移行/同jobでの台帳訂正・再検査・履歴・UIを検証。文字対応の成功は政治公平性/意味的支持/公開受入ではない。次はsemantic entailment/対照評価と適格model選定、取得/掲載/同意datasetを同じGoalの未完gateで進める。主張抽出・複合文の方式は対照fixtureと独立レビューで選び、文字一致を意味品質へ一般化しない。

### News主張ごとの資料照合モデル提案（SI03/SI07）

目的/体験: 逐語対応から進み、保存した主張1件と資料をモデルへ照合させ、支持/反証/不足/混在の提案・理由・引用を同じ仕事へ残す。ROCKは既存Newsローカル実行/WorkJob CAS/adapter/inventory/usageを再利用、EXTERNALは実モデル応答/counter、OWNERは主張/モデル/digest/保存資料のローカル送信同意、JOINTは同候補の実HTTP/Worker/UIで検証。Jevの明示Sky利用やremote権限へ置換しない。

入出力/権限: PATCH evaluate-claimはjob/revision/commandId、保存済みclaimId、modelLabel/modelDigest、consentLocal。既存local repair flagは既定無効で、各資料照合の明示操作/同意も必要。生成のadopted attemptで前後一致を観測したdigestと同じモデルは呼出前に拒否。生成本人性不明はwriter_unverifiedと明示し、別digestでも独立性/正確性の保証とはしない。資料/主張本文は非信頼データ。照合専用profileはschema指定800token、24,000文字prompt/40秒loopback adapter/60秒lease（300token/20秒で最終回答不足の実測を反映、既存修正900token/20秒は維持）、修正2試行と照合2試行を同job内で別計数し、いずれかsending/unknownなら新規呼出は止める。Cloud fallback/新download/課金を追加しない。

保存/検査/状態: 同じ既存attempt集合にpurpose=evidence-review/claimId/draftSequence/input hashをsendingとしてCAS保存後に1呼出。応答のclaim ID、enum、理由500文字、最大4引用/各600文字を検査し、引用は名指しした保存資料のexcerptへ逐語一致を要求。支持・反証・混在には該当relationの引用が必要。ただしrelation自体はモデルの申告で、引用存在から意味支持/真偽へ昇格しない。主張文言はserver保存値から付ける。モデル提案・実usage・前後digest・出力hashを保存し、草稿/参照audit/status/公開権限を変えない。semanticTruthはnot_verifiedを維持し、他の主張を評価済みにしない。

失敗/復旧/編集: 同ID再送は読戻しのみ。捏造/別主張/不正schemaはinvalid_review、モデル変化や期限/停止/草稿変更/削除会話後の遅着は保留しusageを保持。unknownを0金額/成功へ変えない。鍵がなくても既存停止は使える。前後参照検査が通ったreview草稿でも本人は既存2版上限内で訂正でき、旧提案は過去草稿向けと表示。モデル結果で本人の編集権限や公開許可を増やさない。合格はschema/quote偽装、並行1送信、停止/late usage、old scope/再起動、本人UIと全verifyの範囲。実モデルの意味品質・政治対照評価・ニュース掲載は別gate。次の評価モデル/小課題は固定の対立資料と独立した正解付けで選ぶ。

News照合の追加実測: 小Qwenは引用文字が正しくても意味評価を誤るため、protocol保存を品質合格としない。支持/反証relationが両方ある応答はmixed以外を拒否する。OllamaがHTTP応答したのに最終textが空の場合は、既存LlmProviderErrorへ観測meterだけを保持してNews attemptへ保存する（thinking本文は保存しない）。輸送不明はunknown/nullを維持。Qwen3はlocal /api/showのthinking.values=[true]を尊重してfalseを指定せず、800token/40秒の有限profileでも最終回答不成立なら不合格のまま記録。公開LLM APIのrequest bodyへこのtimeout指定を転送しない。モデルの適格性は固定課題の正解との一致と役割別実測で選び、引用一致だけで自動fact checkerとして扱わない。

Eve Newsの資料照合/モデル修正/本人訂正理由は既存offerFormの縦配置とcheckbox/selectLabelを使い、狭い画面でも項目名・値・同意を区別する。同一commandの再提示は保存済み結果のみを返し、実モデル試行のWorker再起動でも再送しない。実Qwen job revision10の全状態一致・再提示200・追加推論0は限定ローカル受入であり、モデル意味品質の合格ではない。

### News資料照合の限定適格性評価suite

ROCKは既存`check-eve-news-local-evidence.mjs --suite`で本人作成の架空8件を既存WorkJob/adapterへ配送する。支持・反証・資料不足・対立の各2件は政治ラベルだけを入れ替え、期待assessmentと必要な出典/関係を事前固定する。各caseは独立した評価jobで同じ仕事の草稿/audit/statusを保持し、原始usage・digest・入力hash・suite版・時間・成功/不成立を逐次保存。最大8呼出、各800出力token/40秒、再試行0。結果不明・model変更/不明・保存異常はsuiteを停止して保存済み試行を再送しない。再実行は新規測定であり中断再開ではない。比較には同じfixture hash/model digest/runtimeを使う。

引用の実在検査と期待assessment・必要根拠関係を別に評価する。両政治ラベルで同じ誤答でも公平性/適格性の合格にはしない。8件すべて通っても実世界の真偽・一般的中立性・独立性・自動routing採用を保証しない。未完了/未報告は未測定、金額nullは0円へ変えない。外部Provider/実機/公開や学習利用には別受入が必要。EXTERNALは実model応答とmeter、OWNERは素材権利と外部送信、JOINTは同候補の実接続受入。失敗は元のreport/usageを保持し、次候補/改善は同一suiteの観測で決める。

### News照合モデルの用途別評価表示

目的/体験: 本人が照合モデルと64桁hashを入力すると、既存capabilitiesの測定記録から用途別の根拠を読む。ROCKのreaderは名前+digestの完全一致、suite版、8caseの件数/score、測定日時（未来5分許容・30日以内）を照合し、未選択/hash不足/未評価/別digest/古い評価/不完全/不合格/fixture限定を区別する。モデル未評価は0点へ変えず、該当しない成績を表示しない。資料hash/suite/参照記録日時と評価範囲は折りたたみで読める。

保存/責任: 元データは`data/llm-capabilities.json`の限定評価、readerは`lib/eve-news-model-advice.ts`、画面は既存News form。新DB/課金台帳/Provider呼出/自動routing/Cloud fallbackを追加しない。EXTERNALは観測された実model応答、OWNERは手動model選択/送信同意、JOINTは同候補の実UIと実接続受入。表示は助言であり、仮に架空case全件一致でも自動reviewerAccepted=false。Broker/送信時の前後digest・権限・上限・既存明示同意を変更しない。画面の日時は端末時計で助言表示するため権限の根拠には使わない。

失敗/復旧/合格: 古い記録や版変更は未適用の理由を表示、既存仕事/モデル入力/保存済みusageを保持する。新測定は同じsuite/hash/runtimeで比較し正本の記録へ反映。合格証拠は一致/別版/未評価/古い日時/不完全値/全件一致でも権限なしの境界試験、本人browserで2/8未採用と別digest/未評価を操作して追加推論0、全verify。ニュースの真偽・政治公平性・実公開・適格候補決定は別gate。

### ニュースリンクから本人資料メモへの接続

目的/体験: 既存Sky/HomeニュースとNews一覧の「Eveで資料メモを作る」から、URL/見出し/GDELT検出時刻/staleをEveの通常formへ渡す。本人は原文の利用できる範囲（最大1,000文字）、種類、確認済み発行時刻（空欄unknown）、保存/要約/引用の利用権を入力する。準備はローカルの決定処理で、未確認主張/根拠unknownの作業メモと原文範囲sha256を作り、既存の保存同意→News API→WorkJob/暗号化会話へ進む。保存後は引継ぎqueryを除き、既存jobへ戻る。

責任/入出力/保存: ROCKは既存feed・timeline・News保存/CAS/owner照合を再利用。EXTERNALのリンク検出は本文取得/発行時刻/ライセンスの証拠ではない。OWNERは素材利用権と非秘密確認/保存同意、JOINTは同candidateのUI/再起動。source.discoveryは任意でprovider=GDELT、seenAt、stale、verification=unverified_handoffだけを検査/保存し、旧packetはそのまま読める。日時はUTC形式、記事公開日時とは別、retrievedAtは本人転記の時刻、sha256は転記された範囲の同一性。serverは引継ぎ元の真正性/権利を保証せず、queryを承認や命令へ変えない。

状態/失敗/復旧/承認: 既存createの保存権限/同意/会話tombstone/96K上限/重複ID/replayを維持。権利未確認・private参照・不正metadata・過大文を拒否。準備後も保存前は本人の入力のみで、失敗は入力を保持して理由表示。source URL/本文変更は権利確認を解除する。資料メモを真偽確認済み/モデル生成/Tool成功/掲載/学習同意へ昇格しない。新しいrunner/台帳/Provider契約/自動取得は追加しない。モデルによる要約、複数資料/訂正追加、自動取得の利用条件、掲載と学習は別gate。合格は型/権利/日付/私有参照/metadata改変/replay/owner試験と実Worker/UI保存/再起動、全verify。

## 旧Pixel同期と共通runtimeの接続観測を共存させる {#eve-presence-coexistence}

1. **目的**: CORE02/03/05/07、RQ04/08/41/42/48、OS10/DSP01/SKY21。Nativeがcommon→legacyの順に送る接続観測の上書きをなくし、既存仕事/新しい共通仕事の実行先をそれぞれ識別する。
2. **体験**: 同じ承認済みPixelに旧履歴同期と共通runtimeが共存する。接続観測だけでは仕事を開始せず、本人の明示job・版・scope・claim・予算検証を別に維持する。新しいアカウントや再ペアリングを要求しない。
3. **責任**: ROCK/Android Device Local AIが共通storeとRoot/Sourceの互換migration、暗号化、負例を担当。JOINTが同じWorker/D1・実Pixel・実Webの受入、OWNERが必要なowner login/具体grantと公開の最終操作を担う。金融/顧客DBは並立させない。
4. **入力**: 既存の認証済みdevice ID、owner、typed runtime presenceと旧device presence。Agent/modelのhash、capability/期限、サイズ/件数/phase検査は維持し、旧観測を新runtimeへ型変換して昇格しない。
5. **出力**: runtime endpointは共通観測、旧device-sync endpointは旧観測を返す。書込順序や並行pollで相手の観測/更新時刻を変えない。表示された接続と実行grantを区別する。
6. **状態**: 各用途にready/stopped等の既存状態と30秒鮮度を独立適用する。片方のreadyで他方の停止/古い観測を補完しない。新規仕事の受付・lease/claim/結果保存/ackは既存state machineのまま。
7. **保存**: 同じD1へRoot migration0083、配信Source main/mirror lineage0032でeve_runtime_presence(owner,device)を追加。旧eve_device_presence/暗号文/仕事/履歴/鍵を変更しない。新用途の暗号AADはruntime-presence:deviceで、既存owner別暗号化に束縛。旧rowは新tableへcopyせず、同じdevice credentialによる次回の新鮮な観測を待つ。
8. **失敗**: migration未適用、旧観測、失効/別owner、用途間暗号文copy、改変、不正schemaは利用可能grantへ変換しない。missing tableを旧共用rowへのfallbackで隠さない。観測の保存失敗から実行成功/0費用を推定しない。
9. **復旧**: additiveで再適用可能なDDL。旧暗号文/仕事queueを残し、code更新後に認証済みdeviceが観測を再送する。jobや成果の再発注はしない。rollback時の未更新観測は鮮度切れとして扱い、履歴/成果は既存storeから読める。
10. **検証**: 変更前は両書込順序で接続先消失を実SQLiteで再現。変更後は両順序、並行書込、独立timestamp/停止/鮮度、二owner/失効、AAD改変、既存DBへの再適用を検査。実Source Worker/D1の両endpoint・暗号化・再起動、Root/Source全verify、SDK/Native hostと実機準備を別scopeで記録する。
11. **次/決め方**: Pixel内の保存済み0.5BはUIで準備済みだが、未配備のbackend修正を公開成功にしない。同一アカウントのWebログインと実機の準備済み読戻しは確認済み。Sourceの正確な候補配備後、既存本人UIの明示1仕事（256出力token/120秒/0費用/Toolなし）の同job/thread/artifact/history、再起動/停止/UNKNOWNを受入する。[証拠](evidence/eve-presence-coexistence.json)。


### 同じNews仕事への追加資料・訂正

目的/本人操作: 既存News仕事で追加URL/利用できる範囲/種類/発行時刻/利用権を通常formに入力し、準備→理由→追加保存同意で既存PATCH append-sourcesへ送る。本文・主張は自動変更しない。ROCKは既存WorkJob reducer/CAS/owner履歴/上限を再利用、EXTERNALの原文やGDELT引継ぎは非信頼、OWNERは保存権限/理由/非秘密同意、JOINTは同candidateの実Worker/UI/再起動受入。

入出力/状態/保存: job/revision/commandId/sources/reason/saveMaterial。元packetのID/topic/source prefixを固定、新source ID/URLは重複拒否。3回追加・12資料・現行96K/旧資料含むjob512K文字・200event上限。sourceRevisionsへ追加前packet/draft/audit（未検査ならなし）/理由/時刻/command/hashを保持し、現行auditを解除、全step passed=false/status=activeへ戻す。初回requestSha256、同job/thread、元のsource/本文/主張/生成時刻、既存model usage/attempt、草稿修正2回上限は保持する。新DBや別金融台帳は作らない。

失敗/復旧/承認: 他owner、保存未同意、rights不明、不正source、duplicate、revision競合、停止/完了、live model送信中、上限を拒否。履歴の存在/暗号化を確認してCAS保存し、projection失敗は既存syncで復旧。初回追加と再送はclean source+reason hashで照合し、同commandの内容変更を拒否。古いclientのreplayは既存結果読戻しだけで再追加しない。旧packetはsourceRevisionsのない版0として読む。追加中の同じ資料本文を上書きせず、訂正は新しいsourceとして記録する。

評価の版: model review attemptへpacketSequenceを追加（旧attempt省略は0）。草稿の版と資料の版が両方一致するときだけ現行への提案と表示、資料追加前の提案は過去の資料/草稿への提案として保持する。model結果の採用前input hash/lease/停止確認も維持。資料追加でモデル呼出/試行上限をリセットしない。追加された訂正を既存台帳が参照しない場合は次のauditで要確認、文字参照が通っても訂正の意味的反映・真偽・政治公平性・掲載は未受入。合格は不変条件/旧版/再送/並行/停止/権利/上限、実UI追加→再検査/旧提案/履歴→同artifact再起動とfull verify。

### 訂正資料を本人の草稿へ明示反映する

体験/責任: 既存News editorの資料ガイドで番号・媒体・種類・原文・公開不明/取得時刻を確認し、本人が主張の文言/分類/根拠状態/資料選択/本文を訂正する。同じ媒体の原記録と訂正を資料番号で区別する。原文は一つの折りたたみガイドへまとめ、各主張のcheckboxへ全文を重複展開しない。ROCKは既存editor/News revise/check/CAS/履歴を再利用、OWNERは根拠/対立/原文利用の判断、EXTERNALの原文/申告は非信頼、JOINTは同candidateのUI保存/再起動受入。

状態/保存/失敗/承認: 元記録と訂正を帰属付きの別主張として本文へ反映し、対立/独立検証が未解決ならdisputed/unknownを保持する。旧sourceRevisions/旧draft/audit/usage/初回hash/同job/threadを維持し、既存2回の草稿修正とcommand/revision/停止の規則を使う。参照検査が通ったstatus=reviewは、人の確認待ちであって真偽・政治公平性・Tool成功・掲載の合格ではない。本文外の意味網羅や発行/訂正関係の確認を文字一致へ代用しない。保存失敗/競合は元のjobを維持して再読込、旧稿は既存の履歴から確認する。

合格: 同jobに追加した訂正について、本文の逐語対応/両source参照/対立warning/semanticTruth not_verified/politicalFairness not_evaluated/not_publishedを境界試験で確認。実browserで資料選択と原文ガイド→本文/台帳の通常編集→保存/再検査→旧稿/旧資料/旧model提案保持→同artifact再起動を記録し、full verifyを通す。意味品質/政治的中立性/自動モデル採用/実取得/実公開/学習許諾は別gate。


## Home内の「追加・管理」への統合 {#home-add-manage}

1. **目的**: 2026-10-22の本人指摘「/#catalog と /os/sky/agents は要らない」に対応。HOME01/WEB04/SKY21/UXRS01、RQ02/04/26/39/40/48。検索と管理の独立タブを廃し、必要な能力へ進む入口をHomeへまとめる。以前の共通5タブ指定は今回の本人指示により3タブへ改訂する。
2. **体験**: 主ナビゲーションはSky/Eve/コミュニティー。Homeの「追加・管理」から「探して追加」「追加済み・設定」を切替。投稿からのAdd、既存担当の設定、使うLLM、Eveへの依頼を継続する。
3. **責任**: ROCK/Product UXが導線・状態・互換を実装、Webが同一候補を配備、JOINTが実ブラウザ/Pixelを確認。OWNERは使いやすさと公開条件を判断。外部catalog/モデル稼働は提供元の責任と別に検証する。
4. **入力/出力**: Home hash/#sky/#sky-manage、検索語、既存本人agent ID/revision/modelが入力。検索/Add/管理UIと既存Eve URLが出力。管理画面を開くだけで仕事・支払い・grantを開始しない。
5. **状態**: Homeのdiscover/manageを同じdialogで表示、キーボードtab/矢印/Home/End、Escape/閉じるを扱う。主ナビではいずれもSky選択。初回表示時に管理componentを遅延読込する。
6. **保存**: 既存/api/sky/agents、本人別保存、revision/CAS、担当停止、端末接続とSky→Eveの固定ID/版を保持。同じHome内ではpanel/タブを閉じても未保存editorとtimelineをunmountしない。page離脱/再読込を未保存draftの永続化と呼ばない。
7. **失敗**: signed-out、取得失敗、競合、非対応modelは既存表示/保護を維持。画面統合で本人照合や権限/費用検査を省略しない。
8. **復旧/互換**: 旧/#catalogと/#optional-featuresはHome内検索へ、旧/sky/agentsと/os/sky/agentsは/#sky-manageへ戻す。既存APIと保存データを削除しない。Tool専用の下位URLは個別契約を保持する。
9. **承認**: 可逆なUI整理は今回の本人指摘に沿う。新モデル実行・送信先・費用・端末権限は各既存gateで確認。本人が候補bc8f2c0b…の公開を明示承認し、同一payloadの次版v112を配備済み。今後の送信/課金/新端末権限は各既存gateを守る。
10. **合格**: 3つの主タブ/旧URL/既存library API・CAS・Eve設定、dialog内draft/scroll/キーボードを集中試験と実UIで確認。同一Root/Source候補の型・lint・full verify、archive/公開response/実機を環境別に記録する。
11. **次/未決定**: 集中33/33、Root全verify（Node1449中1448pass/1skip、API2061/CSV113）、Source全verify（Node2430中2429pass/1skip、API1530/CSV385）と同一buildの実UIを確認。draft保持/矢印キー/保存と再表示/旧URL/Eveの同agent・revision・model、12配信応答と梱包13SQLが合格。公開v112/Source160ff13d…を配備し、本人の実ブラウザで旧URL→Home、Add/管理切替、既存担当/LLM/Pixel担当6件、主ナビ3項目を確認。公式helperの梱包822件は承認候補と全payload/mode一致。未認証terminalの公開応答は上流403でHTTP byte/header検査は未受入として残す。Pixelの共通実行試験は次。独立した管理機能を捨てた、全OS完成、実課金合格とはしない。[証拠](evidence/home-add-manage.json)。

### News学習準備の個別同意・撤回（設計契約）

目的/体験: GPU/学習の前に、本人が選んだNews仕事の現行資料と草稿だけを、評価用または学習候補の準備データとして確認する。会話保存・remember・sourceの引用権・公開を学習同意へ昇格しない。ROCKは既存News WorkJob/command/revision/owner/history/暗号化を再利用し、別DB/台帳/汎用runnerを追加しない。OWNERは全選択内容の利用権と秘密/個人情報確認を明示、EXTERNALのlicenseやmodel品質は別検証、JOINTは同candidateのWorker/UI/撤回/競合/再起動受入。

入出力/状態: 保存済みpacket/draftのSHAと現行job revisionへ、用途dataset_preparation_only・範囲current_news_material_and_draft・split evaluation/training_candidate・3つの明示同意を束縛する。既存News配下のlearningConsentsへgrant/withdrawのcommand/指紋/時刻を保存（grant最大10回、全履歴最大21（連続する撤回は現行撤回へ圧縮し、既存event上限内で操作履歴を保持）、撤回は停止・契約失効・鍵不明時も本人認証下で可能）。資料/草稿変更はdigest不一致で旧同意を適用しない。停止/会話削除/他owner/不正rights/疑わしい秘密や個人情報/既知評価素材のtrain候補化を拒否する。引用可summarize_and_quoteは学習準備権にしない。

準備/出力: serverで現在内容のallowlistとSHA・重複確認用content hash・用途を生成し、直前に同job revision/同意/会話存在を読戻す。権利はowner_authoredに限定し全内容の権利を本人が別確認。秘密/連絡先scannerは既知パターンの検出で保証ではなく、検出時は自動削除/改変せず出力を保留する。既知fixture指標を含む素材は評価用にだけ準備でき、train/eval汚染・横断重複・model/data license・独立品質・訓練設定/予算は未受入と明示する。trainingAllowed=false、モデル思考全文/秘密/金融receipt/過去版/一般会話を出力に混ぜない。

復旧/撤回/合格: withdraw後やsource変更後は新しいpreview/exportを拒否し、同command再送で旧grantを復活させない。既に本人がコピーしたファイルや学習済み重みの消去/忘却を保証しない。表示/ダウンロードごとにserverを再照合し、browserのcached許可を使わない。実訓練/外部転送は今回開始しない。境界試験はowner・保存/remember非同意・rights・secret・fixture汚染・digest変更・再送・撤回/停止/削除/並行照合、UIと同artifact再起動、全verify。News以外の実行trace、包括PII検査、実license確認、dataset集約/train-eval分離、実訓練・重み切替は残るgateとして記録する。

同意前でも撤回はrevisionを進める。これにより撤回と並行した古いgrantのCASが失敗し、遅着grantが準備許可を復活させない。過去grantは保持、連続撤回だけを圧縮する。

同じ本人の全保存済みNews仕事で過去に評価用へgrantしたcontent hashまたはdata SHAは、別jobへのコピー・撤回後・注釈だけの変更後も学習候補へ昇格させない。評価用grantは撤回で消さず、削除済み会話の割当も保持する。他ownerの仕事は照合せず、job ID/本文/件数を漏らさない。候補同意のUPDATEとpreview最終SELECTは同じSQL文内で評価割当の不存在を再検査し、並行評価grantが先に保存されたら拒否する。候補準備の後に評価割当が追加されても以降の候補preview/exportは拒否する。コピー済みJSONは回収できないため実訓練前の再照合は必須。正規化や近似重複、外部dataset、他owner横断の汚染確認は未受入で、実訓練前に別検査が必要。grantは元会話live条件をCASのSQLへ束縛し、previewは最後のlive会話join済みjob読戻し後に追加awaitをせず判定する。

#### 複数News仕事の準備データ集約

本人が一覧から1〜20仕事と単一用途を選び、各仕事の既存個別同意を再照合してまとめる。ここで同意は作らず、未同意/異用途/撤回/他owner/停止/会話削除/版変更/評価素材混入が1件でもあれば全体を拒否する。既存WorkJob/historyを読み、別DB・学習台帳・外部転送・model呼出を追加しない。各preview後に記録全体のSHAで完全一致だけを統合し、本文が同じでも注釈・根拠・source metadataが違えば保持する。選択全job/revision/data/contentSHA/consent commandと、統合前の全参照を残す。job ID順で決定的に出力、dataset本文のUTF-8 JSON.stringifyにSHAを付け、保存用整形JSONを128 KiBに制限する。

最後に全会話を復号可能か確認し、一つのSELECTで全job/live会話と同owner評価履歴を照合する。最終読戻し後にawaitせず、撤回・削除・編集・並行評価のいずれかを検出したら全体を409で拒否する。失敗時は選択を読み直し、問題の仕事の個別同意/資料を修正して再試行する。表示とJSON保存は毎回server再照合し、cached結果を実訓練の許可にしない。trainingAllowed=false、model license・実訓練config・近似重複・外部dataset汚染・独立品質は未受入。コピー済みJSONは回収できない。合格条件は重複統合と全provenance保持、順序不変hash、異なる注釈保持、全件同意、owner/CAS/撤回/削除/並行評価の拒否、実Worker/UIと再起動読戻し。


<a id="mini-os-interface"></a>
## Mini専用OS操作画面（2026-10-22・WEB04／MAT15）

**目的・利用者／体験。** 本人の「サイトとしてじゃなくてmini専用os画面」に従い、avocadomini.siのrootをMini操作画面へ向ける。Home、Eve依頼準備、仕事、通信、設定の5画面。暗色、静止した表示、急な強い発光なし、画面内明るさ65〜100%を提供する。まぶしさの実機受入は未実施。

**責任。** ROCKは画面と既存サービスへの導線、EXTERNALはブラウザ/表示/端末driver、JOINTは同じbuildの実Mini入出力、OWNERはログイン・依頼・料金承認。既存公開Siteのaudienceを保持し、一般製品ローンチ/実機対応の合格にしない。

**入力・出力。** hashによる画面選択、4000文字までの依頼文、明るさ、休止、全画面を入力。出力はブラウザ画面と明示操作によるclipboard copy。Eveはhttps://avoado.si/os/eveへ通常遷移する。依頼本文をURLへ入れず、自動送信しない。Mini実機入力/生体/衛星/電話は未接続。

**状態。** Browser online/offlineはnavigator.onLineの申告であり疎通/衛星接続の証拠ではない。電池・dock・sensor・光学・衛星・AP・本人の仕事は未取得。架空の通知、仕事、残量を作らない。

**保存。** 下書き・設定はページのメモリ内だけで保持し、reloadで消える。アカウント/仕事/料金の別DB、localStorage、認証token、録音は追加しない。既存Eveへ貼り付け後の仕事は既存workflow/owner/revisionで管理する。

**失敗・復旧。** clipboard拒否は本文選択と手動copy案内。全画面非対応/拒否は理由を返す。休止はinertとfocusを切り替え、戻る/ESCで復帰する。休止はセキュリティlockではない。再読込の下書き復元や不明な仕事の自動再実行はしない。

**承認。** 外部AI、Tool、課金、通話、hardware制御をこの画面から実行しない。既存Eveで本人が承認する。画面のbrightnessはCSS描画だけでbacklight/光学出力を制御しない。

**合格条件。** 配信中v43のsource f4df7b8f134472fa9d9bbff7e05cf6248eba2dfdからの限定変更、Astro/Worker build、配備版/source/URL読戻しを記録する。今回test suiteは未実施。UI表示とMini native boot/物理入出力を分ける。

**未決定の決め方。** 本人連携は既存device session/portable runtimeを再利用し、取得権限/失効/費用/成果を同じowner/jobで受け入れる。MCU private healthをブラウザへ直接公開しない。実機driver・光学・通話・衛星の受入前に有効化しない。

### 待機中の発見と同じ端末の実行先選択（2026-10-22）

1. **目的**: CORE02/03/05、OS10/DSP01/SKY21。公開v112後の実測で、仕事受信後だけpresenceを送る循環と、旧/共通接続の同一deviceIdによる選択衝突を修正する。
2. **体験**: 同じ物理Pixelは一覧で1台。新しい共通接続を優先し、旧URLで明示した接続は保持する。依頼本文や過去の仕事を作り直さない。
3. **責任**: ROCK/Androidがidle通知、ROCK/Webが選択と同意を実装。JOINTは同一APKと公開UI/仕事、OWNERは本人認証と自動審査で要求された新候補の公開承認、EXTERNALはAVF/OS/配信基盤。
4. **入出力**: Nativeは認証済みowner/device、current ABI、ready snapshotだけで接続を通知。Webの内部選択keyにはdevice/runtimeの種類を含める。serverへ送るdevice UUIDと既存Agent/model digest、job契約は変更しない。
5. **状態**: idle通知だけではclaim/journal実行記録/推論を作らない。共通接続が消えた時、明示選択済みのruntimeを旧形式へ黙って変更せず、選び直しへ戻す。種類変更で従来の同意keyを使い回さない。
6. **保存**: 用途別に暗号化した旧/共通presenceを継続。旧26仕事の全内容・2モデル・6Agent・鍵を保持し、実試験1仕事を追加して27件。同じjob/thread/成果hashとNative暗号化journalのack、会話内request/result各1件を照合。
7. **失敗**: 異なる本人、旧ABI、期限切れ/停止/未準備の共通接続は利用可能にしない。旧v112に残った同名選択衝突はv113で修正。接続がない時は新実行を無効にし、保存済みの成果は同じ本人で読む。
8. **復旧**: 受入済み308e APKを復旧用に保存。同署名5abb候補はmanifest/権限不変。失敗時は旧APKへ復旧し、試験APKはd21へ戻す。本人の画面点灯設定15は変更しない。
9. **承認**: 自動審査の拒否後、本人が具体候補a4fa8d14のSource保存・公開を承認。公式helperでSource1f4d3904…を保存/push、v113を既存public範囲へ配備。別の永続停止WIPは含めない。
10. **合格**: 最小Native5abbの54単体/lint/buildと実機3/3、target11、配信候補全体verify2433件/2432pass/1skip/0fail・API1530/CSV385/assets213欠損0、同build UIを確認。v113の公開UIから既存0.5Bへ1依頼、同じEve成果を保存。実機で同一job/report/原本を2回照合し、間のapp process再起動後も追加推論0。
11. **次/未決定**: 256token/120秒/クラウド0円の共通text一周とapp再起動再読は合格。guest/端末OS再起動、停止/失効/UNKNOWNの追加受入、請求、本体OS image等は独立した残gate。[証拠](evidence/eve-presence-coexistence.json)。
## Eve Tool作成時の会話削除競合

目的は同じ本人・会話の仕事だけを保存すること。入力は既存Tool依頼とthreadId、出力は同じWorkJobと暗号化会話で、新台帳は作らない。会話同期後の仕事INSERTにも既存WorkStoreのlive conversation条件を渡し、owner一致・deleted_at=0を原子的に再確認する。会話が削除された競合では仕事を作成せず失敗を返し、復旧時も同じ削除済みIDを再作成しない。権限/費用/Tool実行の承認を追加せず、失敗を成功へ変えない。集中試験は同期とINSERTの間へ削除を注入し、仕事行0と削除保持を確認。公開/実端末受入は別。


## Pixelの永続停止要求と保存容量（本人用Preview・限定実機受入） {#pixel-durable-stops}

### Pixelのカーネル再起動時の専用接続

専用Unix socketはguestの実boot IDに固定した名前を使う。古いsocketは接続先に採用せず削除・奪取せず、同一bootの既存listenerは拒否する。mTLS本人接続と同じowner-privateディレクトリに停止journalを残すため、boot ID変更を停止解除や再実行許可にしない。Android本体再起動の初回試験では古い固定socketの残存で照会に失敗した。修正の合格条件は28仕事/鍵/元の成果/同一停止tupleの維持、実boot ID変化、取得済みモデルの再準備、新規推論0。修正guest44d3f886で通常Android再起動後、本人解除と公式Terminal VM起動を経た同一28仕事/鍵/保存成果/停止tupleの一致と取得済み0.5B再準備に合格した。無人boot常時稼働や全OS imageの受入ではなく、lock/鍵喪失/UNKNOWN等の残gateは別に保持する。


1. **目的**: セッション解除・鍵利用不能でも、元の仕事の正確なtupleだけを停止する。遅着startと停止を照合する。
2. **体験**: 停止要求・停止確認待ち・確認済み・結果不明を分け、未確認を完了へ変換しない。Pixel 10をguest manifest229b82c1/Native13f06113へ保全更新し、本人Web停止を限定受入。
3. **責任**: ROCKのguest bridge/native handleが停止の保存と照合を行う。OS鍵の解除は本人、外部workerの停止receiptは実行先の責任。
4. **入出力**: job/scopeSha256/claim/requestSha256の完全一致を使用。stop statusは内容なしの状態だけを返し、認証鍵・token・prompt・成果を停止storeへ置かない。
5. **状態**: Nativeのarm→requested→content-free照合、guestのreserved→fencedとworkerの実停止を別管理。fenceだけでworker停止済みとしない。
6. **保存**: guest schema2は予約とfenceの和集合最大256件をprivate atomic fsyncで保存。dispatch前に停止容量を永続予約し、未知tupleで満杯でも既存予約の停止枠を消費しない。旧schema1のfenceは保持して移行。Native読取はNOFOLLOW・実読取最大100001byte・受入最大100000byte・厳格UTF-8。
7. **失敗**: 保存不明は新startを拒否。容量超過は新仕事を拒否し、fenceを自動削除して回避しない。古いsessionの停止を新accountへ流用しない。
8. **復旧**: 再openで完全一致を確認。旧guestから更新する際の稼働中仕事、容量保全とmaintenanceは別受入が必要。現行端末へ未確認protocolを投入しない。
9. **承認**: 新しい停止handleは実行・閲覧の権限ではない。公開v115の本人停止候補として明示承認済み。本人grant・価格・料金を変更しない。
10. **合格**: 前段のguest/bridge23・stager2・Native64/Root1484passは履歴の証拠。現在の本人停止はNative71/lint/build、Java/TLS/SQLite/private guest1、隔離Source2523pass/1skip、公開v115と同じ候補の実機6試験・停止済みjobの再起動読戻し2回を別々に受入。Root全体の最後の実装検証は1505pass/1skip/0failだが他担当17入力が途中更新されたため固定Root全体の証拠とはしない。実OS/AVF再起動・logout/key-loss/lock/遅着start/UNKNOWN・quota保全は別受入。証拠は[永続停止](evidence/pixel-durable-stops.json)。
11. **未決定**: quotaの安全なmaintenanceと移行をfixture/実機の反例で決める。別WIPの全体verify・実機まで揃ってから配布判定する。
### Eveから同じ仕事を停止する（Web v115・Pixel限定実機受入）

1. **目的**: 本人Webから、受付済みの同じjob/threadを停止できるようにする。従来のlogout/key-lossに対する端末内停止と別の入口である。
2. **体験**: 開始前取消、要求保存、端末の実停止確認、停止前終了、結果不明を分ける。保存済み成果と依頼は保持する。 停止カードと操作後の通知は共通の状態表現を使い、同じowner/job/threadの最新観測に追随する。別本人・別会話・サインアウト時は操作通知を引き継がず、応答喪失は実停止へ昇格させない。
3. **責任**: ROCKはowner/device認証、command/replicaの同時更新、状態と同一性を強制。JOINTはPixel実機と同じ公開候補の往復。OWNERの既存grant/実行同意は拡張しない。
4. **入出力**: owner PUT stopはjob IDと明示操作だけ。device PUT stop-receiptはjob/claim/request hashとpending/confirmed/finished/unknownだけを渡す。guestには従来のscope hashを加えた完全tupleで問い合わせ、原稿やcredentialを停止metadataへ入れない。
5. **状態**: runtime-cancelledはclaim前CASに成功した取消。runtime-stop/stop-unknownは実停止未確認、runtime-stoppedは認証済み端末のdurable status照合、runtime-stop-finishedは実行終了の照合。未知を完了へ変換しない。
6. **保存**: 既存eve_device_commands、暗号化replica/history、Native journal、guest停止journalを使い、新しい顧客DB/実行権限は作らない。成果INSERT/UPDATEに同じcommand状態と有効deviceをSQL内で要求し、owner停止CASは観測したreplica版/hashまたは不存在を固定する。
7. **失敗**: stop要求だけでは停止成功としない。scope不一致やorphanのabsenceだけでは実停止を証明しない。旧hostがexecution.stopを申告しない場合は稼働中停止を提示せず、旧ABIへ新状態を流さない。
8. **復旧**: 同じ要求/receiptを再照合し推論は再発注しない。finished成果はreceipt送信前にNativeへstageし、応答喪失後も同じreportを保存する。以前からUNKNOWN reportが固定済みの仕事は上書きせず、guest内成果の回収は別検収として残す。
9. **承認**: Web本人の停止とdeviceの実停止報告は別API。device bearerでowner停止を代行できない。取り消し操作は新しい実行・外部送信・費用の許可にならない。
10. **合格条件**: owner隔離、旧host、claim競合、成果INSERT/UPDATEと停止の両順序、既存UNKNOWN保持、再起動、実停止と次仕事、同じ仕事のUIを受入する。ローカル/合成/実機/公開を別記し、旧64単体と旧fullを今回変更の成功へ転用しない。
11. **残る判断**: Source ac24bc0d/v115、Native13f06113、guest229b82c1で本人Web停止とアプリプロセス再起動読戻しを受入。実機job1f51c47dのcancelled/confirmed/durable fence、元27件/2モデル/6担当/Android鍵保持、総28件で再発注なしを確認。Native71・Source2523pass/1skip・実機6試験は別gate。実OS/AVF再起動、logout/key-loss/lock/遅着start/UNKNOWN、quota maintenance、完全OS/eSIM/実請求は残る。停止card確認後も要求時のpending通知文が残るため次候補で同期する。


### Tool一覧の本人・種類・会話スコープ

Tool再開一覧はownerとeve.tool-work/1、指定会話をSQLで絞ってから直近100件を返す。他種の仕事が多い場合も再開対象を押し出さない。既存の全仕事一覧とNews一覧の契約は維持し、別owner/別会話は返さない。101件の非Tool仕事を追加する回帰試験で修正前は対象が消えることを再現し、修正後は本人の同じTool仕事だけを読めることを確認する。

### 計画用モデルへの構造化出力の指示

計画用localhost Ollama呼出では、保存したjobId/objective/sourceSha256をconstにしたJSON Schemaを送る。許可Toolはmr-citations/compose-check/compose-joinのみ、未知のフィールドは禁止し、step/入力/検査条件/未決事項の長さ・件数を制限する。これは返答形式の指示であり、既存parseEvePlanCandidateの本人仕事/素材/権限/予算/グラフ/出典/完成条件の検査や本人採用を代替しない。600token、2試行、停止/重複排除を保持する。実測の20秒応答未確認を受けてlocalhost推論だけ40秒上限（既存90秒lease内）とし、CLIや外部課金の上限は変更しない。実Toolの出力は「## 出典」で、目的が明示しない必須文言を作らないよう指示する。構造化指示があっても不正候補は拒否、失敗usageを残し自動fallbackしない。実モデルの合格は同候補の実応答とTool縦断で別に受け入れる。

### 本文を使えない応答の使用量

Plannerの信頼したOllama adapterがEMPTY_RESPONSEと共に正規化済みusageを返した場合、LLM/provider一致を確認して同じ仕事/試行へ記録する。本文が使えないことと使用量未報告を分け、応答が失敗でも報告済みtokenをnullや0へ置き換えない。モデル名/digestは前後照合し、不一致は候補採用を拒否する。報告の保存で計画/Tool成功、本人承認、金額/請求/入金/作者精算を作らない。停止後の報告も同じ試行に保持し、再送しない。usageのないtransport timeoutは引き続きunknown/nullである。合成回帰試験は空本文+入力17/出力8を返し、通常/停止後の保存、候補なし・Tool0、同試行拒否と会話明細を確認する。

### AMCによる開発成果の条件追跡

本人はAMCで詳細タスクと進捗を揃え、指定結果からの差分・取りこぼしを検出する体験を求めている。既存Goal/Taskの完成条件・依存・対象path・成果・証拠・独立reviewを同一仕事へ結び、条件の未割当/未検証/未統合を可視化する。進捗変化時は影響する依存と再検証範囲を更新する。完了保証や自動連携の実装済み宣言はせず、[Eve開発プロンプトの追加方針](prompts/eve-execution-si-development.md#18-本人追加方針amcによる開発目標と詳細タスクの追跡)を受入の指示とする。


<a id="mini-spatial-computer-use"></a>
## 空間全体のコンピュータユーズ（2026-10-22・MAT15／OS10／WEB04）

**目的と利用者。** 本人はInstagram reel Dc74JgZybZJを示し「こんな感じで空間全体でコンピュータユーズができるようにする」と明示。Miniの最終体験を、空間に配置した仕事/成果/対応appの対象を声・手で操作するものとして具体化する。5画面のbrowser UIは確認用入口で、空間runtimeの実装とは区別する。参考URL https://www.instagram.com/reel/Dc74JgZybZJ/ はWeb取得失敗、browser操作も失敗し映像未視聴。映像内の機種/表示/操作方式を推測して採用しない。視線入力は対応sensor/許可がある場合の候補で、必須の採用部品ではない。

**利用体験。** 「ここに建物を出して」で場所と成果を選び、必要情報/費用を確認して対応rendererへ表示。手で対象を選び、移動・拡大・編集案を確認する。「この案を仕事の相手に送って」は宛先/内容/権限を確認し既存Toolを通す。Miniを移すと同じ仕事へ戻り、旧空間の座標を新空間へ無条件に再利用しない。

**責任。** ROCKは空間対象と仕事/権限の対応、focus、入力解決、OS Broker/既存workflow、成果/停止/復旧。EXTERNALはsensor、位置推定、optics、表示/対象appのOS API。JOINTは同じ実機・場所・版での位置合わせ/入出力/誤操作/表示負担の受入。OWNERは観測・共有範囲・宛先・外部送信・費用承認。

**入力と出力。** 入力は校正版/観測時刻/誤差付きのpose/手、音声の候補、明示選択。scene対象はowner、place/epoch、scene revision、object ID、job/artifact revision、実行先device、表示surface、許された操作を持つ設計。world座標から表示surface/app座標へ変換し、最前面/対象/版を解決してpreviewを返す。生の座標や認識結果を権限にしない。出力はtyped UI/scene命令、対応app操作要求、状態/成果/usage。空間座標契約とrendererは未実装。

**状態と実行経路。** 未校正→観測→対象選択→操作候補→必要な本人承認→Broker実行→対象状態の読戻し→成果保存。Eve/modelは非信頼planner。専用Tool/APIを優先し、承認されたOS accessibility/画面操作adapterを対応appに限って接続する。Webのみで任意の他app/desktopを操作できると扱わない。画面操作には最新の対象観測/active window/surface対応/操作scope/expiryを必要とし、任意shell/root APIは作らない。ブラウザのlocal操作表示、実app操作、外部Tool成功、物理作用を別receiptにする。

**保存。** 既存owner別job/artifact/revision、承認とusageを正本として再利用。scene配置/場所校正は別の場所scopeで紐づけ、映像や生体streamを当然には保存しない。アカウント/顧客/請求台帳を増設しない。

**失敗。** 校正喪失、古い観測、別窓へのfocus変更、対象の移動/版変更、共有者の失効、通信断で該当操作を無効化する。認識の曖昧さは対象の選び直しへ戻す。実行後の応答喪失はUNKNOWNで、click/send/購入/物理作用を自動反復しない。

**復旧。** 再観測/再校正/本人と場所の再照合、既存job/操作結果の読戻しを先行し、必要な承認を取り直す。持出し・dock離脱では旧placeEpoch/入力座標を失効。保存した仕事の復帰と物理出力再開は別判定。

**承認と表示条件。** sensor利用、録音/撮影、外部送信、共有、app scope、料金/物理作用は既存の本人/予算gateを使用。『まぶしくない』を条件とし、光源直視回避、急な強発光/点滅回避、周囲に応じた調光、即時の表示停止を要求。ソフトの暗色を光学実機の合格としない。空間全体で裸眼/複数人に見えることと、場所を計測できることは別の能力。

**合格条件。** 一つの同意済み実空間で、実測校正→対象表示→手/声による選択→許可されたapp/Toolの一操作→実結果の読戻し→保存→移設/再開を同一buildで記録する。誤対象/focus変更/観測失効/切断/不明結果/費用超過の拒否も必要。既存AS01〜06/OI/MPへ接続し合格件数は増やさない。今回の成果は設計追記だけで、runtime/物理受入0。

**未決定の決め方。** 映像は添付/正規取得で観察後に操作を分解する。最初の対象app一つ、表示surface一つ、sensor/renderer一式を実部品から選び、視域/精度/遅延/明暗/目の負担/熱/電力/許可を測る。机上3D sceneや動画の再生を空間コンピュータユーズの達成へ換算しない。
<a id="smis-network-effects"></a>
## smisのネットワーク効果：解決方法を追加・実用・改善して渡す

2026-10-22、本人の「このOSのシステム内でより良いネットワーク効果を得たい」を既存RQ02/03/21/37/48、HOME01・SKY21・OS10へ具体化する。以下は設計と受入条件であり、利用者増による便益や成長を実測した記録ではない。

1. **目的と一人目の価値**：一人でもEveへの依頼から仕事・成果・保存・再開まで使える。その人が作った担当や手順を本人の選択で共有し、他の人の最初の成果を早める。利用者→作者、作者→利用者、共同体→共同改善、接続開発者→利用可能な道具/端末、という循環を共通Coreで結ぶ。人数や投稿数が増えただけで効果ありと判定しない。
2. **利用体験**：困りごと→Eveで担当/手順を作る→自分で実用して成果を確認→公開する設定と説明を選ぶ→smis投稿の「自分に追加」→受け手が必要な接続/LLM/予算を確認→自分のEveで実行→役立ち方を共有/改善版を作る。Homeの投稿はニュース、成果、追加可能な能力を扱い、私的な仕事の自動公開を行わない。
3. **責任**：主担当Product/UX・ROCK、実装Web/SMIS・HOME01/SKY21/WEB04、仕事/版/停止OS10、収益は既存BIL02へ接続。ROCKは共有manifest・読取ACL・版付きAdd・由来・実利用の投影を担当する。EXTERNALはModel/Tool/機器/配信元の提供、JOINTは同一候補による別本人/実端末の利用確認、OWNERは利用権/公開範囲/改変許諾/実行予算/成果公開を選ぶ。
4. **再利用する対象と現在の不足**：既存`sky_agent_settings`、social投稿/ACL、community OSの版付き構成Add、workflow/Broker、同じjob/artifact/usageを使う。公開Toolのagent添付とcommunity OS経由の担当コピーは存在する。個人Agent単体の版付き配布、親版/派生版の由来、別本人の実成果と発見の結合は未受入。既存共有を未実装と読み替えず、新しい仕事台帳を作らない。
5. **入出力と版**：最初は任意コードを含まない担当設定/手順を対象にする。提案manifestはpackage ID・author profile・整数版・正規化hash・親package/版/hash・用途・必要入力/出力・Tool/model要件・対応能力・既知制約・利用/改変条件・公開範囲を持つ。公開する具体内容をpreviewし、秘密/個人情報の確認を行う。会話本文、入力原本、生体/健康情報、credential、実行grant、支払設定は自動同梱しない。モデル重み/第三者素材を含める場合は別の配布権と容量/整合性検査が必要。
6. **状態と保存**：共有はdraft→preview→published→withdrawn、本人への追加はpreview→installed→configured→ready/disabledを基本とする。保存先は既存owner Agentと共有manifest/由来の最小追加記録に絞り、publish/install/updateはownerとrevision/hashを照合する。公開版を変更せず、新版として出す。Addは新しい本人用設定を作り、Tool接続・外部送信・実行・課金を自動開始しない。作者名/署名は同一性の手掛かりで、安全性や知財所有を保証しない。
7. **失敗・更新・復旧**：不適合なmodel/Tool/入力/端末は不足を表示して実行前に止め、別能力を勝手に承認しない。親版を削除/非公開にしても由来参照は最小tombstoneで保ち、内容へのアクセスは現ACLに従う。追加済み版は更新preview/差分/本人選択を経て移行する。作者の新指示で既存仕事/予算/成果を変更しない。繰返しAdd/更新の二重作成、失効後アクセス、同時revision競合、offline再送を既存方式で扱う。配布停止後の既存コピーの利用条件は明示したlicenseとCoreの失効条件を分けて決める。
8. **発見と推薦**：閲覧ACLを先に強制し、適用/実行時は必要能力・本人接続・利用権・予算を再確認する。並び順は目的との関連、対応環境での実用結果、継続利用、修正状況、鮮度、作者/情報源の多様性を候補にする。「実行完了」「本人が役立ったと回答」「独立検収済み」を別の信号として表示し、モデル自己採点やTool成功だけを目的達成へ昇格させない。少数標本の不確実性と新作者の発見枠を持ち、重み/閾値は比較実験前に記録して実測する。ニュースの人気を真偽判定や政治的立場の優劣にしない。
9. **共同体と作者の動機**：鍵付きcommunityは選んだ担当/Tool/LLM/ルール/デザインをまとめる既存OS構成を使い、構成単位で追加/改善する。公開とcommunity限定を同じ版/ACL契約で扱う。原作者と派生作者の貢献を由来として残す。run to earnは契約済みの利用/検収/入金と既存作者台帳へ接続し、閲覧・クリック・推論token消費だけでは報酬を発生させない。月16 USD、現行手数料/分配/外部実費の規則は変更しない。
10. **計測と悪用対策**：主指標は「追加した別本人が、同じ版を使って成果を受け取れた割合」。母数となる有効Add、必要接続待ち/不適合/失敗/停止も別記録し、重複eventと同job再送を加算しない。初回成果までの時間、7/30日再利用、利用者から作者への移行、改善版の再利用、苦情/撤回も見る。private実行履歴を公開評価へ無断転用しない。自己利用と別本人利用を区別し、複数accountによる水増しは未解決の不正対策として扱う。信頼低下/危険な副作用/費用増も評価し、滞在時間だけを成功にしない。
11. **実装順・合格・未決定**：第一に版付き個人Agent共有→Add→既存Eveへの引継ぎ、次に親/派生版と対応環境/実成果の表示、次にcommunityまとめ追加と推薦比較、最後に既存契約による作者還元を接続する。最初の受入は隔離したAが作成/共有、Bが追加して既存の対応Toolで成果確認、Bが改善版を共有しCが追加できる一周とし、私的情報/鍵/権限が移らないこと、再送/CAS/更新/退出/撤回を確認する。host/Worker fixture、実ブラウザ、同一公開候補、別実owner/Pixelを別記録する。licenseの具体選択、公開成果の条件、保持期間、不正判定、推薦重み/実験期間は実装前に既存契約と照合して決める。一般ローンチ/効果の実証は未完了。


### 個人Agentの版付き共有候補（HOME01/SKY21/WEB04/OS10）

`/api/sky/agent-shares`の本人別preview→内容/hash/版/権利/利用条件の確認→publish→Home投稿→別本人のAddを実装。追加は既存`sky_agent_settings`へ無効状態で保存し、接続や実行を始めない。公開Toolの共有はそのまま、個人担当は`agent-template`の新添付で詳細を確認する。親版/hash/作者/利用条件を保持し、改善版として再共有できる。community限定は現在の専用鍵と参加/失効を読取・書込transactionで照合し、公開範囲外への自動移送を拒否する。公開は作者がCC BY 4.0を明示確認した文章、限定共有は表示した複製/改変/同場所への再共有許可`community-copy/1`を候補として扱う。商用素材・privacy・法的運用の本番受入は別で、取得済みの公開licenseを公開停止で撤回したとは表示しない。model weights/任意code/会話/成果/生体情報/鍵/Tool grantは自動同梱しない。

CAS/source revision/同時Add/save token/100 Agent上限/内容hash/公開停止を検査。公開停止は新しい取得/Addを止め、本人の追加済み設定と過去仕事を消さない。 作者の版一覧はownerと共有先に固定し、再訪時も旧版を確認/停止できる。 共有書込は本人のWeb/password/passkey/gateway sessionとOrigin/owner intentを使い、共通認証が認識するdevice/eSIM runtime sessionでは受け付けない。同期の本人解決を公開の許可へ昇格させない。公開応答不明はID/版/hashの読取照合へ戻し、自動で次版を公開しない。既存Eveへの設定/版の引継ぎを使うが、Agentから任意Toolを呼ぶ権限や成果検収の完了を共有で作らない。合成A→B→Cのstore受入と固定WorkerのHTTP/D1再起動を分けて記録する。[証拠](evidence/smis-agent-shares.json)。共有担当とToolの同job結合は次項の候補を検証する。実ブラウザ/同一公開候補/実Pixel、実成果の推薦/計測/作者精算は残る。月16 USD/既存収益契約は維持。


### 共有担当から同じEve仕事・成果へ（HOME01/SKY21/WEB04/OS10）

**目的・利用体験。** 版付き共有からAddした担当を本人設定で有効化し、Eveで役割と引用Toolを確認して一つの仕事を作る。対応するOllamaモデルがある場合は、その担当の役割を計画候補へ渡し、本人が候補を採用してから既存Toolを実行する。固定手順を選べばLLMを呼ばない。共有→別本人の実用→改善版という循環の実行接点で、利用増による効果は未実測。

**責任・入出力。** ROCKは既存Tool WorkJobへowner別Agent ID/revision、開始時の役割/provider/model/hash、元共有のID/版/hash/作者/licenseを保存する。clientはID/版と明示確認だけを渡し、snapshotはserverが捕捉する。EXTERNALはモデル実行先、JOINTは同じ候補の実owner/端末での一周、OWNERは役割/素材保存/Tool/計画採用を確認。新しい仕事台帳やmigrationは増設しない。

**状態・保存。** 役割確認→既存WorkJob作成→任意の既存planner lease/観測/候補検査→本人採用→既存workflowのTool/独立検査→本人完了→同じ暗号化Eve履歴へ投影。新規作成時は担当のenabled/revision/必要接続と会話tombstoneを同じINSERTで照合する。失敗時はjobも未作成仕事のgoal messageも残さない。開始後の役割は固定し、作者の新版や本人のprofile変更で古い仕事を書き換えない。

**権限・失敗・復旧。** roleの内容は非信頼のuser contextでありsystem指示へ昇格しない。計画は既存のTool whitelist/schema/入力/検収/予算/停止条件で検査する。Ollamaの保存modelとdigestが一致しない時は推論しない。他provider/端末へ自動fallbackしない。役割停止は新規依頼を止め、進行中の仕事はEveの停止を使う。停止中にモデル応答が届いても観測usageを残し、Tool実行/仕事復活をさせない。同じjobの再送は既存仕事を返し、新モデル呼出や別jobを作らない。共有元の公開停止は追加済みコピーや過去成果を消す指示にならない。

**承認・合格条件・未決定。** bound作成には本人owner intentと担当/Toolの確認が必要。Addや担当instructionsだけではTool grant/支払同意にならない。合成A共有→B追加/有効化→同jobの制御LLM→採用→実引用Tool/URL保持検査→本人完了→同会話/Worker再起動後一致、別owner/stale/disabled/作成競合/停止後usage保持を受入条件にする。host・HTTP/D1・実画面・実owner/Pixel・公開は別判定。[現在の証拠](evidence/smis-agent-tool-loop.json)。実成果の公開/推薦/計測と有料配布/作者精算、他Tool/provider/実行先への拡張は残る。月16 USDと既存課金条件は変更しない。


### 同意付き利用結果：成果から担当を発見する（HOME01/SKY21/WEB04/OS10）

**目的と体験。** 他の本人が追加した担当でEveの仕事を完了し、本人が「役立った/まだ役立たなかった」を選び、公開文と公開先をpreview→明示確認→Homeへ投稿する。投稿から同じ共有版を確認/Addできる。共有詳細は公開された回答の集計を表示する。原稿・会話・成果本文・private job/thread ID・実際の接続先・秘密の役割文は投稿しない。公開回答は学習/送金の許可ではない。

**責任・入出力。** Sky/MCP ROCKが仕事/保存版/URL集合検査の照合、preview/hash/owner intent、公開postと集計を担当。EXTERNALは接続済みモデル/Tool、JOINTは同じ候補の実owner/画面/端末、OWNERは回答・公開先・公開停止を決める。入力は本人のjob ID/revisionとboolean回答だけ。serverはcompleted・共有元版/hash・保存成果hash・URL集合の保持・live threadを再確認する。これは事実の正しさ・仕事全体の有用性の独立保証ではない。

**保存と算法。** 既存work_jobs/共有manifest/social post/ACLを使う。新DB・仕事台帳・migrationなし。公開post IDを本人と共有ID/版から安定生成し、一プロフィール・版の回答を一つにする。元の役割文/provider/model設定を変更した実行は別集計。作者本人を集計から除く。四つのCOUNT DISTINCT(profile)で元設定/変更設定×肯定/否定を返す（現状はpost数Pに対しO(P)、追加入力は定数）。プロフィールは実人数ではなく、別accountによる水増しは未解決。公開を選んだ標本なので全利用成功率を算出しない。重み付き順位変更や成長効果は未実証で、既存follow/関連/鮮度を保つ。比較実験前に採否基準を記録する。

**状態・承認・失敗。** 完了→回答選択→preview（書込み0）→公開確認→post→再読/変更/公開停止。clientの公開本文や検査成功申告は受け付けない。直接social postで利用結果kindを偽造できない。公開のINSERT/UPDATEは同じSQLでjob revision/completed、live thread、共有版/公開状態、現community鍵/投稿権限を再検査。別owner、古いpreview、公開先の違う既存postとの衝突、削除/失効/競合は拒否する。

**訂正・停止・復旧。** 回答変更は元postのfingerprintによるCASで置き換え、元回答への反応を同transactionで消す。公開停止/通常post削除は内容なしのtombstoneを保持し、古いpublish intentで復活させない。tombstoneは一覧/確認ID/集計から除く。再公開には新しいpreviewと明示確認が必要。作者は保持したpost fingerprintで、community退出後も自分の回答を公開停止できる。書込み応答不明は同post ID/内容の読取照合へ戻し、自動で再投稿しない。既存仕事/成果は保持する。

公開前に保存source hashも照合し、固定手順/採用した計画候補を公開文へ明記する。時刻が同じでも更新・撤回の保存時刻を前回+1以上にし、回答が往復して元の文へ戻るABAでも旧fingerprintで復活させない。集計はモデル/役割の単独性能試験ではない。

**合格と未受入。** A共有→B Add→同job実Tool/検収→本人の肯定/否定→native Home post→Cが同版をAdd、同プロフィールの複数jobを加算しない、設定変更/作者除外/非公開ACL/撤回・再送・race/再起動を確認する。[証拠](evidence/smis-agent-outcomes.json)。実ブラウザ・実owner/Pixel・同一公開候補・実需要/成長・推薦比較・有料license/作者精算は別受入。料金と既存金融gateは維持。

参考にした一次資料：Hugging Faceの[Collections](https://huggingface.co/docs/hub/collections)はmodel/dataset/Space等をまとめて共有する仕組み、[Model Cards](https://huggingface.co/docs/hub/model-cards)は用途/制約/評価の説明を持つ。上記の仕事/成果/派生/Addの循環はRockstarOSへの設計提案であり、これらの資料が成長効果を保証するものではない。

<a id="eve-account-runtime-work-port"></a>
## 共通Eve Coreのaccount/runtime WorkPort（入口組込み前）

### 共通Coreの未到達停止を既存adapterへ接続

Coreのread=nullは停止証明ではないが、そこで戻らず同じpending referenceを既存adapter.stopへ渡す。ROCKがowner/会話/担当/model/実行先と同じIDを検証し、未到達はserver fenceを保存して遅延startを無効化する。claim済み/結果不明ならEXTERNAL/JOINTの同claim停止receiptまでunknownを保持。入力は既存pendingとbinding、出力は同じCore状態、保存は既存handle/queue/history、新job/権限は作らない。失敗やstop=nullではhandleを残し、同じIDを読み直して復旧する。OWNERの元依頼と停止指定を保持し、終端確認後だけ待機へ戻す。Root/Source集中・SDK合格と、実Worker/実UI/実端末/音声を区別する。[原因・修正・検証](evidence/eve-core-missing-delivery-stop.json)。


**目的・体験。** 同じOS Coreのprepare/start/read/stopを現行account runtimeへ結ぶ。声または文字で依頼を確認した後も、同じowner/会話/担当版/model版/device/job IDを保持する。今回のadapterは選択済み担当を扱い、担当作成と実画面への組込みは未実装。ROCKは共通Core/adapter/既存queue/状態/所有検証、EXTERNALはhost実行とstop receipt/実音声、JOINTは同じ実機一周、OWNERは対象/依頼/権限を確認する。

**入力と出力。** `lib/eve-runtime-work-port.ts` は既存EveWorkPortへ接続。固定bindingはowner/thread/device/agent ID/agent hash/model hash/scheme、入力は確認済み1000文字以内の依頼と同じjob ID。prepareは現在presence/準備済みmodel/adapter交渉を確認するだけで実行・担当作成をしない。startは既存POST /api/eve/runtimeでmax256tokenの同じ依頼を保存する。read/stopはowner別の同IDを使い、他のjobへ置き換えない。

**状態と個別読戻し。** `GET /api/eve/runtime?requestId=ID` は既存encrypted commandとreplicaからowner/pending/executionを返す。50件/20件の一覧にない仕事でも個別照合する。pending DTOへagent ID/hashを加えるがDB/envelopeを増設・移行しない。device sessionからの読取りは元deviceも照合する。owner・thread・device・input・agent/model/schemeが違えばadapterは成果を返さない。LLMのreviewを外部Tool成功へ昇格しない。

**本人と保存。** 既存認証を唯一の権限とし、既存agent設定APIと同じ `x-sky-owner` intent headerをruntimeにも任意追加。新adapterは常に送る。送信中にcookieのownerが変われば409でqueue更新前に拒否する。headerはcredentialではない。既存clientのheader省略は互換維持。共通Coreのpending handleをowner/thread/device/担当/model版/schemeごとのsessionStorage keyへ分離し、server queueとowner履歴を正本にする。

**停止・失敗・復旧。** 停止要求の保存だけではunknown。cancelled-before-start/端末のstop-confirmed/stop-finished、または保存済みreviewを同IDで確認して待機へ戻す。欠落/期限切れ/所有変更/結果不明は勝手に完了・停止済みとせず、同仕事を読戻す。ネットワーク失敗でstartを自動再送しない。context失効後のprepare結果は採用しない。owner変更では古いownerへの書込みをしない。旧pendingは別の本人へ移さない。

**合格条件と現在。** 復元SQLite＋実route handler＋同じCoreで、文字wake→依頼確認→同IDqueue→開始前取消→待機、51件の新規行で一覧外となった元jobの個別read、owner変更race拒否、誤thread/device/pin拒否、review保持、receipt前unknown/receipt後stoppedを検証。集中33/33、型exit0、変更対象lint exit0。全体lintは他担当のsky-agent-shares試験12件で失敗を記録し、全体成功へ読み替えない。実workerd/実UI/担当作成/現行native mTLS/ASR/Pixel音声/全入口は未受入。

**次と未決。** 現行の担当作成/host準備契約を確認し、一般の目的から作った担当を同じbindingへ結合する。その後eve-sync-workspaceの既存owner/pin/実行/stop/saveへ共通panelを組み込み、現Native13f sourceを保ったnative入口と実ASRを接続する。新DB/端末別workflow/鍵/モデルdownloadは今回0。一般公開保留を維持する。


### 空間Computer Useの実現設計書

2026-10-22の本人依頼に従い、[20章の基本設計](avocado-mini-r5/spatial-computer-use-design.md)と[未実装の通信契約](../contracts/avocado-mini-spatial-runtime.json)を追加。範囲/観察者、sensor/光学、座標/focus、アプリ操作、性能/電力計算、SC01〜10、工場E0〜E3を定義する。既存mini-spatial-computer-useの詳細化で、native/光学/製造受入の追加ではない。


## Eve共通操作パネルの現行入口接続（2026-10-22）

既存EveSyncWorkspaceのaccount-runtime担当選択へEveRuntimeInteractionを接続。目的は選択済み担当でのHey Eve／確認／同一仕事読戻し／Thanks Eve停止を共通coreへ通すこと。ROCKはowner・会話・端末・担当hash・model hash/schemeで固定したWorkPortとpending keyを管理し、端末は既存mTLS runtimeの実行・停止receiptを担当。本人はマイクと依頼内容を確認する。新規担当作成はこのadapterでは行わず、作成表示を出さない。

入力は依頼と選択済み実行先、出力は既存runtimeの状態・下書き。既存owner queue/replica/historyを再利用し別台帳を作らない。画面の通常更新でWorkPortを再生成せず、owner／会話／対象／版の変更時は別keyへ移る。旧pendingは保持し、応答喪失・未確認停止を成功へ変換しない。外部Tool成功にも昇格しない。空白を含む依頼は既存serverのtrim正規化に合わせて同一IDを照合する。

合格証拠はdocs/evidence/eve-runtime-entry-integration.json。現在はhost結合14件と型・対象lint。実ブラウザ、真の音声、新規担当作成から端末準備、Pixel同一候補の一周は未受入。次に既存Agent作成とhostへの登録・presence再読戻しを接続し、目的が固定されない担当を同じowner/jobへ結ぶ。公開は行わない。


<a id="eve-agent-preparation-port"></a>
## Eveの担当登録と実行準備（2026-10-22・OS10／SKY21）

**目的・体験。** 本人の目的から作った担当を、既に準備済みの端末内モデルへ登録し、同じ担当ID/hashを実行前に読み戻す。登録は文章推論やTool成功ではない。ROCKはschema・既存owner認証/承認・配送/読戻し・保存・失効、EXTERNALは端末/workerの稼働、JOINTは同一APK/guest/modelの実機一周、OWNERは目的/役割/入力と実行先の確認を担当。

**入出力。** private `prepareTextAgent`は厳密なagent（id/name/instructions/modelId/sha256）、model（id/gguf-sha256/hash）、最大2分のdeadlineを受ける。本人hostの承認を前提とする非公開portで、一般manager action/HTTPには追加しない。bridgeでは別の`runtime-agent-capabilities`を交渉し、`runtime-agent-prepare`をscope/preparation ID/request hash/agent.prepare/最大0円/同じexpiryへ束縛。既存text.generate権限を流用しない。Androidのresponse validatorは同じ依頼/会話/claim、担当全項目/model全項目とJS互換のrecipe hashを照合。出力は保存された担当・model pinで、実行receiptではない。

**状態・保存。** 未登録→本人host検証→端末内登録→ID/hash読戻し→別の実行承認と既存runtime enqueue。既存managerのstate.json/agentsを使い、呼出側のIDを保持。既存IDと全項目が一致する再送は再起動後も同じ担当を返し、内容相違は拒否。上限32件を維持。新DB・別job台帳・モデル取得・shell/root実行を追加しない。

**失敗・復旧。** 期限切れ、model不一致/未準備、失効、実行/準備/保存競合、停止済みmanagerでは登録しない。応答喪失は同じID/hashで照合し、別IDを勝手に発行しない。担当保存済みとmodel実行済みは分ける。現行account queueへの登録commandとnative controllerはまだ未接続のため、UIから登録済み/実行可能と表示しない。

**合格と次工程。** host28件/JVM8件はfixtureでの既存保存・再起動・別権限/不一致拒否・新担当の既存executor利用を確認。実モデル/実発話/実機導入/新APK受入ではない。証拠はdocs/evidence/eve-agent-preparation.json。次は既存account queueへowner別prepareを接続し、現行native controllerから処理→presence読戻し→本人確認済み実行へ通す。stagingは現行候補のhashを保持し、wire helperと既存EvePortableCommandsを同版でcompileする。一般公開/契約/課金/flashは保留。


<a id="eve-agent-preparation-queue"></a>
## Eve担当登録を既存accountキューへ配送（2026-10-23）

**目的・体験・責任。** 本人が確認した担当の役割を既存端末runtimeへ渡し、登録の読戻し後に同じ会話で実行を承認する。ROCKは既存owner/Origin/device認証、暗号化キュー、CAS、権限・hash・読戻し、EXTERNALは端末/guestの実登録、JOINTは現行APK/guest/modelの一周、OWNERは役割/対象モデル/実行先の確認を担う。

**入出力。** `/api/eve/runtime`のPUT `prepare-agent`は厳密なid/threadId/deviceId/agent/model/confirmを受け、実行とは別の確認値`prepare-owner-local-agent`を要求する。既存Linux recipeのhash、GGUFモデルの実準備、期限付きhost `agent.prepare`広告を照合。新規期限はserverで2分に固定。端末の専用GET `agentPreparations=1`とclaim/authorize/ack操作を追加し、通常GETの旧レスポンス形を保持。ownerはGET `preparationId`で同じIDを照会する。登録依頼の文章を実行結果に転用しない。

**状態・保存。** 既存eve_device_commandsと既存history鍵に保存し、agent-prepare-pending→claimed→doneを別namespaceで管理する。既存runtime/legacy consumerは登録を拾わない。1 owner/deviceで有効な登録は8件、取得は4件まで。idempotencyは同じID/全入力digest、claimはCAS。別DB/会話/仕事台帳は作らない。

**承認・失敗。** deviceによる作成承認を拒否し、本人のbrowser確認を要する。guestへ渡す権限は`agent.prepare`/preparation ID/request hash/最大0円/expiryで、text.generateと分ける。非同期の準備確認後にも、session失効・claim状態・会話削除をSQLで再確認してgrantを出す。不一致/期限切れ/上限/別owner/device/未対応capabilityは拒否。

**読戻し・復旧。** ackは同じclaim/hash/agent/modelを要求し、最新presenceに同じ担当全項目・model pinがあることを確認してdoneへ進む。登録応答だけでdoneにしない。取消は将来grant/ackを失効させるが、既に保存されたローカル役割が消えたとは表示しない。claimed/取消/期限後の登録有無は未確認を保ち、同じIDを照会する。推論は別commandであり登録取消を実モデル停止の証拠にしない。

**合格・未決。** SQLite/実route fixture/既存runtime回帰36件が成功。routeのdevice identityは合成mappingで、実credential検証・実機受入ではない。現在のnative controllerと新規担当UIは未接続。次は既存account binding/mTLSの同じpollから能力交渉→登録キュー→同じ担当IDのguest登録→新snapshot/presence→ackを通し、応答喪失/期限後は既存IDの読戻しを優先する。実音声/実保存/実停止は同一APK/guestで別途確認。証拠docs/evidence/eve-agent-preparation-queue.json。一般公開・課金・flashなし。


## Mini空間操作・分散表示の開発更新（2026-10-23・MAT15／OS10／WEB04）

合成ray→候補固定→host承認→local draft移動→実app読戻しを実装。sourceは `systems/rock-star-os/targets/avocado-mini/spatial/`、詳細は `docs/avocado-mini-r5/spatial-computer-use-design.md` 21〜25章。Nodeはprivate journalへ保存し、browser/MCP transportを偽記録しない。browser Labはbuild済み、実browser受入は接続エラーにより未実施。実sensor・光学・Eveとの一周・native起動は未接続。

本人承認で複数表示部も比較。Miniが本人/job/権限を管理し表示部は校正済み領域を担当。4/8/16台の有限姿勢モデルに未達が残り、全範囲表示は未解決。光学必要条件・部品envelopeの再計算は `python3 docs/avocado-mini-r5/factory-development/optical-layout.py --output work/mini-spatial-engineering`。工場用RFQは未送信の設計開発依頼で、製造CAD/製造releaseではない。既存料金・OI/MP/AS gateは変更なし。次は配置最適化、光学/低眩しさの実測、実sensor/BSP、完全配線/熱/保護pack設計。build/typecheckのみ実行、unit/full suite未実行。


<a id="eve-native-agent-preparation"></a>
## Eve担当登録を既存native同期へ接続（2026-10-23）

**目的と体験。** 本人が確認した新しい担当を端末へ登録し、同じID/役割/modelを読戻してから実行へ進む。ROCKは既存account HTTP/mTLS同期、命令検証・先行停止・登録/読戻し・状態保存、EXTERNALはAndroid/guestの稼働、JOINTは同一APK/guest/modelの一周、OWNERは役割/実行先/依頼と必要な権限・料金の確認を担う。

**入出力・承認。** 新規EvePortableAgentPreparationは既存EvePortableAccountBinding/HttpClientと同じ資格情報を使い、登録専用GET/claim/authorize/ackを処理。queueのowner/device/preparation ID/thread/agent/model/deadline/hashを検査する。guest能力を別交渉し、text.generateと別のagent.prepare grantを検証。guestへaccount tokenを渡さない。1tickは登録1件まで、既存runtime実行/停止のpollを先に行い、idleの場合だけ登録する。

**状態・保存。** 同じpreparation IDをclaim IDにも用い、同じ担当IDで既存managerへ登録する。新しいjob台帳/journal/DBは作らない。登録応答が失われても、再pollは同じclaimと担当のfresh snapshotを読み、既に存在すればguest登録を再発行せずpresence/ackへ進む。登録に推論・新モデル取得・外部Tool成功は含まない。

**失敗と復旧。** owner/session変更、別device/claim/hash、期限切れ、モデル差替え、readback不在、取消後のgrant/ackを成功へ変えない。登録済みでもack未確認は未確認のまま。期限後にqueue一覧から消えたclaimedの発見と、作成UIの同一thread復旧は次工程に残る。旧guestの登録能力なしは通常runtime経路へ戻り、旧serverの実行専用GET形も新規登録として扱わない。

**版と検証。** 受入済み13f06113…APKを保つソースから別フォルダを作り、登録6sourceをoverlay。元候補/manifest/既存署名鍵を保持。Android SDKコンパイルでJSONObject.similar非対応を確認し、既存canonical JSONへ修正。隔離APKのunit77/77・lint・build、署名一致、guest11ファイルのmanifest整合を確認。単独JVM13件はAPK unitと重複し、合算しない。host35件は合成fixture。詳細はdocs/evidence/eve-native-agent-preparation.json。

**未受入と次工程。** APK/guestとも未導入、公開なし、鍵/モデル追加なし。ADBはsandbox EPERMを区別して再確認し、許可環境でも接続0台。本人へUSB接続・画面解除を依頼中。目的から担当を作るUI、同一threadの登録途中復旧、日本語端末内ASR、実発話・普通の文章で保存/再表示・Thanks Eve実停止/待機は未受入。Mini/Proは同じ登録契約を用い、各実機の入力/出力/電源受入を別に行う。


<a id="eve-purpose-agent-creation"></a>
## 目的から担当を作り共通runtimeへ渡す（2026-10-23）

**目的・本人の操作。** Eveの「目的から新しい担当を作る」でHey Eve→依頼→役割/実行先/基盤モデル/出力上限/クラウド使用料を確認→本人確認→担当保存/端末登録/同じ仕事の実行へ進む。既存担当を使う方法も明示選択できる。担当が0件でも準備済みGGUFモデルがあれば作成できる。目的は入力から決定的に役割へ変換するbaselineで、独自LLM学習や汎用知能の証明ではない。

**責任。** ROCKは既存owner/会話/個人Agent Library/登録queue/runtime/history、非信頼役割・hash/版・費用/権限の検証。EXTERNALはdevice/guest/modelの実計算。JOINTは同一候補の実ブラウザ/実機一周。OWNERは具体的な役割と素材、実行先・必要な権限/費用を確認する。Mini/Pro/Pixelで別の仕事管理を作らない。

**入出力・承認。** 1,000文字以内の確認済み目的とowner/thread/device/GGUF model id/hashを受け、同じpurposeを含む1,200文字以内の文章担当を作る。名前はgraphemeを壊さず80文字以内。入力のshell/権限等を実操作にしない。画面で実際の名前と役割を確認できる。ローカル文章用provider/modelを明示し、Cloudへ自動切替しない。出力上限256、クラウド使用料0円は推論用Cloud課金の話で、電気/端末費は未計測。

**状態・保存。** role確認→client intent（元IDを保存）→既存個人Library→既存端末登録queue→fresh presence/ack→共通coreが同じruntime実行IDを保存→既存実行/成果/停止。client intentはowner/thread/device/model scopeのsessionStorageへ最初の書込前に保存し、資格情報や権限の正本にはしない。server既存queueのowner/thread読出しを追加し、32件とhasMoreを返す。旧IDや期限切れ/取消を保持し、履歴が切れていれば新しいIDを推測発行しない。新DB/仕事台帳なし。

**失敗・復旧。** Library保存/登録enqueueの応答喪失では元IDを再読込み。client保存が消えても同一会話の登録recipe/hash/modelを照合し担当を再利用する。保存済み担当の無効化/provider/model/hash変更は新しい実行前にclientで再確認する。既存実行のread/stopはLibrary変更後も可能。登録中のThanks Eveはcontinuingを失効させqueue取消を照合し、runtime startを送らない。取消応答不明はintentを保持。保存済み役割を消したとは表示しない。

**画面の継続。** 最初の担当がpresenceに現れても、目的モードのpanel keyはowner/thread/device/modelに固定。処理中や結果未確認でモード切替を許さない。登録の単独取消ボタンはcreating/running中に無効で、共通停止操作を使う。入力/準備の参照が古くなれば実行を保留する。

**合格と残gate。** host29件、型/対象lint成功。実runtime route/SQLiteと共通coreを使うが、Library APIとdevice/推論reportはfixture。実LLM・実発話・実ブラウザ合格ではない。GUI接続はsession reset後もnative pipe closed。新しいWeb変更は未公開、用意済みnative APK/guestも未導入。期限後の失われた登録ack、まだruntime commandが存在しない配送前停止のserver fence、実保存/停止/待機を引き続き確認する。全SI/Tの合格へ繰上げない。詳細docs/evidence/eve-purpose-agent-creation.json。


<a id="eve-purpose-worker-wire"></a>
## 目的別担当のWorker/D1・native登録wire受入（2026-10-23）

**目的と体験。** ローカル画面経路の同じpurpose WorkPortを、コピーして固定した実Worker/D1・実個人Library・実device session検証へ通す。本人fixtureが依頼を確認→role保存→端末登録→既存runtime仕事→成果/履歴→Worker/manager再起動→同じID読戻し→停止照合を行う。ROCKはBroker/保存/停止・境界、EXTERNALは実機/モデルの真の稼働、JOINTは実ブラウザ/実Android/モデル受入、OWNERは実行先/権限/費用確認を担当。

**入出力と版。** 新しいscripts/check-eve-purpose-worker.mjsはJDK17と既存org.json jarを明示指定して実行する。Workerはdistの独立コピー、module inventory hashと対象source hashを試験前後で照合。nativeは実EvePortableHttpClient/AgentPreparation/HostProbeをcompileし、実HTTPS→Worker device認証→D1 queue→private Unix bridge→production managerへ登録する。入力・owner・device token・出力はすべて合成。モデル子プロセスは合成出力であり、モデル実測ではない。

**状態・保存・復旧。** D1の既存個人担当/登録/実行/履歴を使用。Workerとmanager、native JVMを再起動して同じ成果/履歴を保持。enqueue応答喪失1件とguest登録commit後の応答不明1件を故障注入し、元のIDと役割を再照合して登録を増やさずackする。JVM3プロセス、登録4回、合成生成2回、合成停止1回。停止要求だけではunknownを保持し、実managerの停止確認をdevice receiptで保存した後に待機へ戻る。

**承認と拒否。** device sessionは実認証storeで発行・検証する合成の2台。同じownerでも別deviceの登録読出し、別owner読出し、未認証・異Origin・deviceによるbrowser作成承認・owner intent不一致を拒否。外部通信は拒否して0回。子JVMだけが一時test CAを信頼し、OS trust/本人鍵/端末/公開設定は変更しない。新しいpublic/private service契約や支払はない。

**合格条件と限界。** 新wire131 assertions成功、Worker/Source hash driftなし。旧native実行・停止・失効・応答喪失/再起動のTLS/SQLite回帰も成功し、native HttpClientの追加型依存を既存compile対象へ追加。証拠docs/evidence/eve-purpose-worker-wire.json。実Android TLS、Pixel、日本語ASR/実発話、普通の文章ファイルを端末で保存/再表示、実停止/待機は未受入。期限後の登録ackと未到着startのserver停止fenceを引続き実装/照合する。全SI/Tを合格へ繰上げない。


<a id="eve-expired-agent-preparation"></a>
## 担当登録期限後の読戻しと未確認保存（2026-10-23）

**目的・本人の体験。** 登録commit後の応答喪失が2分の期限を越えても、同じ担当を読み戻し、存在とmodel pinを確認して登録済みへ進む。確認できなければ未確認として保存し、新しい登録/権限へ切替えない。ROCKは既存queue/session/CAS/読戻し/表示、EXTERNALは端末状態とmodelの真の稼働、JOINTは同一buildの実機、OWNERは不明状態の照会/中止を担当。

**入出力と状態。** 既存device登録GETは期限切れclaimedも返す。pendingの期限切れは配送しない。既存native同期はfresh snapshotの同じagent/modelを確認し、あれば既存ackのみ行う。読戻せなければ`unknown-agent-preparation`へ同じid/claim/hashを送る。serverはowner/device/session、期限経過、claimed状態、会話未削除を検査し、既存rowのstateだけunknownへCAS更新。registeredはnullで、削除/未登録/実行成功の証拠にはしない。

**保存・上限・復旧。** 既存暗号化requestを保持し新DB/台帳なし。unknownは配送queueから除外してowner/thread照会に残す。期限切れclaimedも未解決枠として8件上限に含め、照合を飛ばして無限に新規登録しない。登録がある場合は読戻し/ack、ない/不明の場合は新しいgrantやguest登録を出さない。clientにも未確認の照会/中止を表示し、再登録しない。内部unit用clockはHTTPから設定できない。

**失敗と承認。** 別claim/hash/device、期限前unknown、取消/失効/削除との競合は拒否。旧APK候補と証拠を退避し、新しい隔離APKは78unit/lint/build・同一署名を確認。未導入・公開なし。

**合格と未実行。** host27件はclockを進めるunit。実2分を待つWorker/native wireは`--expiry`（登録あり）/`--expiry-missing`（未確認）で別々の合成storeを使って確認する。実際の時間をHTTPで上書きしない。実機/音声/実モデル/ファイル保存は未受入。結果とsource hashはdocs/evidence/eve-expired-agent-preparation.jsonへ記録。未到着runtime startの停止fenceは別の残gate。

期限後登録の接続受入追記：実際の2分期限を待つ`--expiry`/`--expiry-missing`が各138項目成功。同一IDの登録済み読戻し／未確認保存を確認し、再登録なし。実Worker/D1・JDK HTTPS・private bridge・合成出力の範囲で、実モデル/Android/Pixel/公開の合格にはしない。証拠は`docs/evidence/eve-expired-agent-preparation.json`。

<a id="eve-missing-start-stop"></a>
## 未到着の開始要求に対する停止（OS10／SKY21／CORE03／WEB04）

**目的。** 開始応答がない仕事を停止した後、遅れて届いた開始要求で実行を始めない。
**利用体験。** 本人が同じ仕事で停止し、serverに停止記録が保存されたことを読戻して待機する。404だけで停止完了にしない。
**責任。** ROCKは原子的なqueue重複排除・本人/入力版照合・読戻し。EXTERNALは既に動いた端末の実停止。JOINTは実機停止確認。OWNERは同じ仕事の停止指示。
**入出力。** browser本人限定PUT fence-startは元の開始要求の全フィールドと同じdigestを受け、同じIDの取消状態を返す。端末credentialによる作成は禁止。
**状態。** 未到着ならruntime-fenced、既存pendingなら取消、claimedなら既存stop/receipt経路。runtime-fencedは配送・claim・grant対象外。成果/Tool成功/料金確定を生成しない。
**保存。** 既存暗号化eve_device_commandsに別schemaの負の記録を保存。別DB/台帳/実行IDを作らず、本人・会話・端末・担当/model hash・input・token上限を照合。ID競合はINSERTのON CONFLICTで決着。
**失敗。** 異なるinput/担当/model/端末とのID再利用、別本人の端末、削除済み会話を拒否。応答喪失時は同一IDを照会する。確認できなければUNKNOWNを保持。
**復旧。** store再生成後も同一記録を読む。遅れた同一開始は取消を返し、現在presenceを必要とせず再実行しない。既存成果と実行中のreceipt照合を保持。
**承認。** 負の停止記録は実行権限を付与しない。元のownerの既存端末登録は必要。端末失効後も停止記録は可能だが実行許可には戻さない。
**合格条件。** 未到着停止→遅延開始0配送、並行開始/停止、offline presence、再生成読戻し、異入力/他owner/削除拒否、claimed時UNKNOWN→実receipt後停止を試験。実機音声/本番とは区別。
**未決定。** 現在は既存ownerキュー保持方針に従う。一般公開前に既存retention/export/deleteと負の記録の容量・復旧を同じ契約で確認する。

未到着start停止の限定受入：対象40件、Root全体verify exit0、固定Worker/D1＋JDK/bridge 147項目成功。遅延start配送0と再起動後停止記録を確認。実モデル0、実機・UI・公開は未受入。証拠docs/evidence/eve-missing-start-stop.json。

<a id="eve-runtime-draft-export"></a>
## 保存済み端末下書きの文章持出し（OS10／SKY21／WEB04・T08）

**目的・体験。** 本人がEveの成果を通常のUTF-8文章ファイルとして読み、OS/smisを開かず利用できる。
**責任。** ROCKは本人・同一仕事・版・本文hashの読戻しと文章化、EXTERNALはbrowser/端末の保存先、JOINTは実画面で保存ファイルを開く受入、OWNERは明示保存と持出し先管理。
**入出力。** 保存クリック時に既存requestId GETをx-sky-owner付きで読み、executionのid/thread/device/revision/digestと表示済み成果を照合。review本文のSHA256一致時のみ.txtと本文hashを生成。
**状態。** 保存済み下書き→読戻し→版/本文検査→download要求。UNKNOWN・本文欠落・版変更・別本人は保存しない。browserのclickを端末上の保存完了証拠にはしない。
**保存。** 既存暗号化replica/historyが正本。新台帳/復元grantを作らず、出力は本文・下書き注意・担当名・基盤model・仕事ID・成果hash・既存費用説明のallowlist。
**失敗。** 古い画面、削除済み会話、再認証、hash不一致、通信断は理由を表示して再読込へ戻す。
**復旧。** 同じ仕事を読み直して本人が再度保存できる。Tool/推論の再実行は不要。削除済み仕事をファイルから自動復元しない。
**承認。** 保存操作は本人のclickで開始。通信中/文章hash計算後のaccount変更を照合し、別本人へ渡さない。
**合格条件。** 実storeでreport→同一仕事読戻し→通常文章、改変hash/誤版/誤thread/device/UNKNOWN拒否、会話削除後GET拒否を対象試験で確認。実browser・実ファイル再読込・実機は別gate。
**未決定。** browser保存先やAndroid共有先は実機接続後に確認。ファイルへ実行権限/credentialを含めない。バックアップ復元は既存owner/鍵/移行契約を別途検証。

文章持出し限定受入：対象14件・型/lint・Root full exit0。固定Worker153項目の中で合成UTF-8ファイルの書出し/読戻しhash一致、再起動後の同文を確認。browser downloadとPixel実ファイルは未受入。証拠docs/evidence/eve-runtime-draft-export.json。

## Eve共通実行の隔離Sourceへの統合

### 隔離Sourceの月次観測保存と反転保留

BIL02/SKY21/OS10/WEB04・ROCKのSource候補19fe452に、本人の既存Invoice/Provider参照・通貨/額を入力とする観測保存を追加。目的はunknownや逆順応答で保留を失わないこと。既存Invoiceの2 nullable JSON列へpending/request/revisionと検証済み反転証拠を保存し、最新slotだけ結果を書けるCASと、遅延した負の証拠も残す独立保留を使う。読取りは同じowner/accountから復旧し、旧schema/clientと元行を保持する移行を用意。型/形式/本人/保存失敗では保留し、通常再照会を解除承認にしない。EXTERNAL/JOINTの実Provider・受取先・返金/送金、OWNERの権利/費用/解除条件は別gateで、全状態で送金許可は出さない。合格はhostの競合/移行と同一Worker/D1再起動の範囲に限定し、実UI/本番/Root runtimeへの統合とは区別する。[実装・復旧コマンド・証拠](evidence/eve-monthly-payment-observation.json)。


共通実行Source受入：対象35/35、型/lint、Source全verify exit0（2705件/2704pass/1skip、API1582/CSV385/assets222欠損0）。固定Source Worker＋既存Root native/JDK/managerの165項目成功。Source既存の合成復元済みschemaを使用し、新規/本番DB移行合格ではない。inventory c272d754e3d7b8071f684d7293bdcf76b4f1fedfbae3feb22b567165bb0e9d72、Source1568入力の検証中変更0。実UI/Pixel/実model/公開/Source cloud保存/GitHub pushは未実施。証拠docs/evidence/eve-common-runtime-source.json。 Source側の役割/入出力/状態/保存/失敗/復旧/承認/合格条件は同候補の#eve-common-runtime-integrationに記録。RootのSDK・native/実機の合格をSource Webへ移さず、今回の判定は同Source Workerと既存native接続の組合せに限る。


### 配信候補へのモデル評価・共通実行の統合

**目的・責任。** WEB04/SKY21/OS10・Web/ROCK O5が、保存済みfc2f8b34の評価/実測候補とa6b8b3c6の共通実行を、版付き共有・利用結果を含む現Source候補へ統合する。EXTERNALはモデル/端末、JOINTは同一候補の実画面/端末、OWNERは対象・資源・外部送信・公開を選ぶ。既存Source-only backendへ適応する。

**入力と保存。** owner/job/revision/run/task・現在の導入済みmodel digest/capabilities・推定メモリ予算を確認し、最大3問/各600token/40秒の逐次観測を既存WorkJobへ保存する。資源予算は候補判定用推定で、OSのRAM hard limitではない。共通runtimeの担当作成/登録/開始前停止/成果持出しは既存owner暗号化queue/replica/historyを使う。新DB/仕事台帳/移行は作らない。

**状態・失敗・復旧。** 共有担当の開始時snapshotを測定前にも検証し、破損ならモデル呼出0件で拒否する。測定/候補確認で担当・Tool権限・仕事状態・予算を昇格しない。停止後の観測usageとunknownを保持し、再起動後も同IDで読み、同じ測定を再送しない。文章持出しはexact request ID/owner/thread/revision/output hashを再照合する。未到着startのfenceと、実行先の実停止receiptを分ける。

**共存と合格。** 版付き共有→本人Add→同じjobの測定/候補確認→保存済み版で計画→実引用Tool/独立URL検査→本人完了→同意付き利用結果が、同じjob/threadで保持されることを合成Sourceで検証する。別のJDK/TLS/private bridge試験で、共通runtime登録/実行/保存/停止/再起動を確認する。元の担当版・出典・公開範囲・料金・旧Pixelデータを維持する。候補の自動採用、実モデル品質、実ブラウザ/Pixel、全OS/本番金融・成長の受入へ換算しない。

### 下部タブの共通配置と操作領域

現行の3つの入口（smis・Eve・コミュニティー）は、項目数をCSS変数へ渡して均等配置する。過去の5列を残さず、72pxの共通高さとsafe-areaを使う。タブ名を見える状態にし、不透明な背景とフォーカス表示を保つ。下部固定が有効な全画面幅（1279px以下）でHome/仕事の最終操作まで余白とscroll-marginを確保し、本文の追加ボタンをタブの下へ隠さない。これは導線の削除/追加ではなく、既存3入口と任意Wallet/設定の導線を保つ修正。狭幅・中幅・横向き・キーボード・入力中・戻る/scrollと、同じ候補のWeb/Pixelを別々に受け入れる。証拠`evidence/os-bottom-navigation-fix.json`。

### 会社ロゴの共通原本

2026-10-23の本人指示により、紺色の6輪と中央円を正式マークにする。`data/company-brand.json`と`public/brand/rockstaros-logo-source.png`を全担当の共通原本、`data/company-brand-assets.json`を再生成hashとする。旧URL/resource名は互換のため残し、Web/PWA/Android/Mini/Proで同じ絵柄・比率を使う。生成/commit/配備/APK導入/実表示を別々に受け入れ、旧銀色マークの履歴証拠を新候補の表示証拠へ流用しない。

### 実測した計画モデルを同じ仕事へ採用する

目的は、仕事別の測定→候補確認→本人のモデル採用→計画作成→計画採用→実Toolという順序を同じjob/threadで保持すること。候補確認とモデル採用では推論・Tool・支払いを始めない。ROCK（WEB04/SKY21、Web O5）はUI/API/状態/保存/停止、EXTERNALは導入済みOllamaの提供、JOINTは同じartifactの実応答・Web/Pixel、OWNERは担当/モデル/実行の個別確認を担う。

`POST /api/llm/adopt`は本人用localhost限定。Origin、独立本人認証、`x-sky-owner`、Eve利用権、4KB入力、job/revision/commandId/runId/model/digest/task/memoryBudgetを照合する。clientの点数/report/権限は受け取らない。server保存済みの最新合格評価、suite3の課題/JSON/thinking抑制/上限を含むhash、1時間の期限、現時点のモデル容量/context/hashと照合する。選択した担当のモデルと異なる場合は拒否する。

未実行のactive仕事だけで、同じ既存work_jobs payloadへ採用元のrun/版/hash/能力と計画用modelを保存する。新DB/台帳/queue/権限は作らない。既存の計画試行・Tool成果を置き換えず、停止・revision競合・会話削除は同一SQL更新で採用を止める。同じcommandIdの応答喪失は読戻し、内容変更/別操作での再利用は拒否する。

実際の計画推論前後にもモデルhash/容量/context/completionを観測する。変更/未確認なら別モデルへfallbackせず、前段で拒否、または遅着使用量だけを保持して候補を採用不可にする。期限切れ、後続評価、担当/モデルの変更も確認する。これは観測したmetadataの一致であり、実行weightsの暗号学的証明ではない。遅着応答は停止済み仕事を再開しない。

不完全/停止/応答失敗の限定採点は画面と暗号化会話で「未確定」と表示する。全3問を採点した結果の0点とは分け、判定済み形式件数・報告済み使用量は残す。旧suite2の履歴は削除せず、現suiteの推薦へ流用しない。メモリ予算は候補容量の推定で、OS RAMの強制上限ではない。

合格条件は同job/thread/素材/予算/担当/評価の保持、明示クリック前の採用0、採用時の推論/Tool0、再送/再起動の一致、実行前後の版/能力変更拒否、停止/削除の競合拒否、不完全評価の未確定表示である。現在はSourceローカル候補。Web実画面と実Pixel、共有済み担当の同ID native準備、native成果の本人検収→利用結果共有→別本人Addは別の受入条件として続ける。Ollama計画用の採用をPixel GGUFの適合/導入済みへ換算しない。[証拠](evidence/eve-model-evaluation-integration.json#protocolFollowup)。

**次の条件。** 実装した明示採用/pinの同一Worker/実画面受入、共有済み担当を同じIDでnativeへ準備する入口、実UI/同一公開候補/実Pixel発話・保存・停止、実モデルの出力適合は残る。根拠と現在のsource差は[eve-model-evaluation-integration](evidence/eve-model-evaluation-integration.json)を参照する。全CORE/SI/U/RQのGoalを保持する。

**固定候補の受入境界。** 保存済み747までを取り込んだ同一Sourceは、全体2753pass/1skip/0fail、API1582/CSV385、共有HTTP207、JDK/Linux165項目を合成利用者・制御モデルで通過した。後続1c870e5（suite3/JSON/thinking抑制）は未統合で、次版では送信前の共有担当検査を保持して適応する。partialの数値0は品質未確定であり、UI/履歴を未確定表示に直す条件を残す。推薦の実行時固定・共有済み担当の同ID native再利用・実UI/Pixel/公開を合格へ繰り上げない。


## Mini分散光学・実入力adapterの更新（2026-10-23・MAT15／OS10／WEB04）

[空間設計正本](avocado-mini-r5/spatial-computer-use-design.md)26〜28章を追加。3×3mサービス範囲は固定し4×4m設置も比較。仮1.2m角開口52台で24,336有限姿勢の必要条件は未達0だが、巨大・未実測・干渉未評価なので製品採用なし。連続全範囲/任意位置の空中表示は未解決。sensor-camera.mjsは既存smis画素契約と実カメラAPIを接続、実機未受入。display-coordinator.mjsはhost登録/校正/測定済み輝度/快適上限/health/frame承認とblackout要求を実装し、実表示adapter/通信/独立遮断は未接続。回路分割JSONとKiCad面積図を追加したが新しい配線済みmainboardではない。既存料金・本人/job経路を維持。次は設置制約と連続余裕付き探索、実光学/カメラ、native driverとengine選定、完全回路/PCB。実機/公開/購入なし。unit/full suite未実行。

Source固定buildの追加受入：実Toolの出力上限失敗から冗長mergeのみ1回修正し、合格artifact hash/完成条件/予算を保持。必須文言未達は修正/完了を拒否して停止を保存。Worker3回再起動一致、LLM0。また実ローカルmodelの応答完了後・Worker配送前に同jobを取消し、遅着候補/Tool実行を拒否、報告usageのみ保存、再起動後取消保持。同試行再送409。Provider推論中断や物理停止の証拠にはしない。証拠docs/evidence/eve-repair-source-worker.jsonとeve-real-planner-source-worker.jsonのlateResponseStop。

Pixel実機更新の限定受入：Pixel10/GL066/frankel、既存APK13f06113…から同一debug signerのcf552350…へinstall -r。実機APK読戻しとaccount暗号文/prefs/stop handles/claim journal集約hashの前後一致を確認。Linux/model/OS/鍵を変更せず、Keystore復号・新guest登録・実音声/実UI/本番OSの成功にはしない。画面接続native pipe不通、本人へ既存Linux/同期開始を依頼。証拠docs/evidence/eve-native-agent-preparation-pixel.json。


## Mini少数表示部・実入力source・出力の詳細（2026-10-23・MAT15／OS10／WEB04）

[空間設計正本](avocado-mini-r5/spatial-computer-use-design.md)29〜34章を追加。52個は必要最小数ではない。研究の3基AIRRは大型光学/多数発光moduleを含む設置装置で、Miniや低眩しさの合格へ転用しない。4/8/16基の仮追従開口にも有限姿勢の未達が残り、像位置も移るため固定CADの解ではない。少数全範囲の最終方式は未選定。

Linux V4L2 stereo_marker_observer.pyとprivate子process/OS readerを追加。実カメラAPIのsourceだが実機なし。marker観測、露光/精度unknown、操作適格falseを維持。source-preview.mjsでlocal draftから元画像を描くLabをbuild。通知の平面像、2D透視図、真の立体/任意位置像を分けた。像源未選定なので新しい量産回路/配線済みmainboardは未完成。料金・まぶしさ・本人/job/保存は維持。次は一光学cellと同じ実sensorで光路/精度/露光/快適性を測り、連続配置/最終回路へ進む。


## Mini光学/像源の型番選定と5V配線source（2026-10-23・MAT15／OS10／WEB04）

E0はASKA3D-200NT＋Waveshare 5.5inch HDMI AMOLED/SKU16103＋D405を選定、CM5参照hostを再利用。少数全範囲の最終部品ではない。実部品寸法/45度仮光路の24,336姿勢で1/2/4cellの未達22,256/20,176/16,568、四枚案を全範囲として不採用。E1の立体像源候補はLooking Glass Go＋拡大LeAIRRで、中継適合・lens型番・視域・glare未受入。selected-cell.jsonとselected-cell-model.pyへ保存。

D405固有のSDK2.56.5取得sourceとprivate子process/OS readerを追加。実機なし、点観測だけ、位置誤差/時計対応不明、操作適格false。TPS22965DSGRの5V評価回路/28×23mm配線含むKiCad sourceを追加したが、ERC/DRC/DFM・実板未受入、dummy loadのみ。current limit/reverse isolation/watchdog/独立光学停止/HDMI回り込みは未対応。新しい最終Mini回路・配線済みmainboard完成ではない。料金維持、購入/公開なし。次は実光学/像源の光と停止、D405精度、E1光路を測り、全範囲と最終回路を閉じる。新共通ロゴをPDFへ参照。

## Mini E1 拡大LeAIRRと深度計画（MAT15 / OS10 / WEB04）

目的/体験: 本人指定Goの光線を空中像へ中継するE1を具体化。既存本人/job/保存/料金を再利用し、少数node全範囲は未受入。責任はROCKの光路/adapter設計、EXTERNALの部品図面/SDK、JOINTの光学・機構・実板受入、OWNERのcomfort上限。

入力/出力: e1-leairr-prescription.jsonにFRLN-300S-300P、FRLN-300S-150P、RF-ACと未送付BS特注要求、150/150/150/200mmを保存。e1-leairr-model.pyは一次開口診断のみ。leairr-prewarp.mjsは光学座標点→深度補正計画、実Go描画やaction権限を返さない。薄lens逆写像は校正済み多視点rendererの開発入力。

状態/保存/失敗: optical-coordinate-planとBridge/software/scanout/裸眼visibleを分離。7点水平区間±5.73度をeyeboxへ昇格させない。Go校正、光学→place、時刻/位置誤差がなければ実操作不可。校正/lease失効は既存coordinator停止経路、独立光学停止は未確定で再投入不可。sourceに秘密/生フレームを保存しない。

承認/料金/復旧: 出力は既存本人/場所/輝度/期限profileへ拘束、ToolはBrokerと既存workflow。nodeで料金を複製しない。Go5V3Aは既存2A couponへ未接続、USB逆給電/内蔵表示継続を含む停止・復旧を閉じてから実装。

合格/未決定: 詳細はspatial-computer-use-design.md章40〜43。BSはstock未選定、lensはcatalog候補・現行図面未受入。実測像質/視域/低glare、正確なhost/Bridge/Go、広域sensor、連続配置と独立停止で判断。最終mainboard/net/配線PCB/製造受入は未達。今回の計算や既存couponを完成証拠へ使わない。

## smisのタイムラインと共通ヘッダー・タブ

- 目的: smisを投稿の流れへ集中し、コミュニティーとEveの役割を分ける。本人指定の紺色6輪ロゴとsmis表記を使う。
- 利用体験: smisにはタイムライン、上部の追加・メニュー、共通3タブを表示する。恒常的なサイドバー/仕事一覧/アカウント案内は表示しない。追加・管理は＋から開く。コミュニティーは一覧/作成/招待鍵の画面から、選んだ場所の投稿/OSへ入る。
- 責任: ROCKは配置・表示・既存APIとの接続、OWNERは鍵・ルール・投稿/作成の承認、JOINTは公開WebとPixelの実表示を受け入れる。
- 入出力: 既存本人profile/communities/posts、URL fragmentと操作を入力し、既存選択/作成/参加/投稿の画面を出力する。API/schema/端末利用権・料金を変えない。
- 状態: 一覧、鍵不足、場所選択、作成入力、招待確認、読み込み/失敗を区別する。コミュニティータブに全体の投稿や外部feedを混ぜない。
- 保存: 既存social/key/library/account/仕事storeを再利用し、新しい台帳を作らない。端末は既存同署名APKを-r更新し、鍵/保存データを維持する。
- 失敗: ヘッダーのCSSを別画面のimportへ依存させず、3項目の実数から列を決める。取得失敗/鍵不足を空データ/参加済みへ置換しない。
- 復旧: 公開前版と旧同署名APKを保持し、データ削除で直さない。一覧へ戻る、再取得、同じ招待確認を提供する。
- 承認: 作成/投稿/参加/外部公開は既存同意と今回の明示指示を維持。表示切替やロゴで実行/契約/鍵権限を増やさない。
- 合格: componentの一覧→場所→一覧と既存form開閉、全verify、公開版とAPK hash、実際のWeb/Pixel表示/タブ操作を個別に記録する。
- 未決定: 画面操作ツールが接続できない場合は実画面を未受入のまま保持し、本人の画面確認または復旧した操作経路で確かめる。fixtureを実UIへ換算しない。

## Mini E1 両眼光路とGo/D405の同一host接続（MAT15 / OS10 / WEB04）

目的/体験: 部屋全体を裸眼で使う条件を維持し、Go拡大AIRRの視域を両眼で再計算。ROCKは逆追跡/校正identity/hostコード、EXTERNALはGo/Bridge/光学/sensor、JOINTは同一実空間の光学・停止・操作、OWNERは撮影/表示mode/comfort/費用を担当。

入力/出力: e1-binocular-layout.pyで3×3mの507位置、両眼64mm・各瞳5点、同一20mm立体9点を追跡。小像の必要条件だけで製品要求は縮小しない。倍率/270〜900mm仮開口/1〜8基、48方位傾斜候補を比較し、少数全範囲の採用解なし。有限幾何/未評価の垂直cone・遮蔽・収差・glareを区別する。

状態/保存/失敗: Go observerは事前導入SDK/正確なnative library hashとexact serialを照合し、画素出力なしでscalar subsetを観測。完全校正/scanoutではない。go-depth-session.mjsとgo-d405-preview-host.mjsは同じcalibration ID/place epoch/owner profileへ拘束し、Go500ms/深度受信100ms、boot/sequence/期限/校正変更を検査。失敗で失効・両process停止、host12秒/SIGKILL猶予1.5秒。新しいsourceのみで実行未受入。serial/私用profile/生frameをGit保存しない。

承認/復旧/料金: local captureとSDK設定変更を明示flagで要求。SDK telemetryはdisableTracking=True。Go既存の自律再生を停止した保証はない。Tool権限なし、露光同期/手指/精度/光学受入まではspatialActionEligible=false。既存Broker/workflow/料金/本人別成果と停止を再利用し、nodeで月額を重複させない。

合格/未決定: spatial-computer-use-design.md章44〜46とspatial/GO-D405.md。全範囲の固定像を満たす光学部が未確定のため、最終回路/配線mainboard/製造releaseは未完成。能動pupil操舵は研究候補で、8mm移動の論文をroom全域の証拠へ転用しない。正確なGo描画・実sensor・独立光学停止・連続両眼/遮蔽/comfortを同一nodeで受け入れる。

<a id="smis-eve-workbench"></a>

Eveの制作画面では、確認した目的を文章担当へ保存し、選択した実行先へ同じIDの登録を要求する。smisから開いた担当は保存済みrevision・役割・モデルを再照合して登録し、別の担当を増やさない。既存の暗号化された端末コマンドqueue、本人承認、期限、同一IDの再照会を共有する。登録成功は同じAgent/model pinのpresence読戻しで判定し、推論成功とは分ける。実行は既存workflow/runtimeの文章出力256トークンに限定し、外部Tool権限・任意shell・モデル取得・課金fallbackを与えない。成果は既存Eve会話・Job・Artifactへ保存し、Web/Pixelが同じアカウントで再読込する。設定変更、停止、応答喪失、端末切断時は保存データと同じ依頼番号を残し、自動再発行しない。実画面と実モデルの合格は`docs/evidence/eve-smis-execution-loop.json`で独立に記録する。
## smisの中身とEveの作成・開発画面

本人の「Skyにあった中身をsmisに更新して表示」「smisのエージェントはEveで簡単に作る」「Eveをビルド・開発しやすくし、指定した実行画面を分かりやすくする」を最新の具体化として採用する。既存RQ01〜49と内部sky識別子は継続する。

1. **目的**：旧SkyのLLM/Agent/Tool/ニュース接続と保存済み担当へsmisから到達し、Eveで作成・実行・成果確認へ進む。
2. **体験**：smisはタイムラインを保ち、自分に追加した担当/LLM等を私用カードとして表示。＋で全Tool等を探し、Eveの「エージェントを作る」で自然文→編集できる設定→モデル選択→確認→保存→smisで確認する。
3. **責任**：ROCKは画面、本人別保存、revision競合、表示状態を管理。Providerは接続/モデル実行。OWNERは設定保存・実行先/費用/外部送信を確認する。設定ひな形を作る処理はLLM推論ではない。
4. **入出力**：目的文から既存SkyAgentSettingsの名前/役割/provider/model/enabledを作り、既存/api/sky/agentsへ保存。同じID/revisionでEveへ渡す。既存/api/sky/hubの不足していたSource route/storeを再利用して復元する。
5. **状態**：作成/モデル/確認/保存済みと、実行の準備/受領/結果/停止を分ける。カードは登録状態を示し、接続済み・推論成功を保証しない。
6. **保存**：既存sky_agent_settings/sky_hub_pluginsと本人の会話/仕事/成果を使用。新しいアカウント、料金台帳、SQL migration、モデルweightを作らない。私用保存は一般投稿ではない。
7. **失敗**：取得失敗/401/別owner混在は私用一覧を表示しない。保存応答不明は元IDのGETだけで版と内容を照合し、新IDで再送しない。二重clickは同期refで抑止する。
8. **復旧**：既存URL・API・DB・owner境界を継続。作る/実行の切替で各画面を保持し、入力と会話/選択を残す。通常画面は依頼欄を履歴/成果より前に置き、詳細設定を折りたたむ。
9. **承認**：作成/保存/画面移動だけでTool権限、クラウド推論、課金、配備、SNS投稿、端末同期を始めない。実行/停止は既存業務契約を通す。
10. **合格**：合成UIで自然文から保存・smis表示・同版Eveリンク、保存応答消失のGET照合、別owner拒否を確認し、実Worker/D1の該当routeと全verifyを通す。実browser/Pixel/実推論は別受入。
11. **未決定**：自然文からソースコードを生成・buildする処理、任意モデルのnative登録、外部Provider利用、一般公開の共有審査は既存個別gateで決める。この設定builderを任意コードのbuild成功と表示しない。物理部品実験の公開保留を維持。

## Mini参考2動画・板/膜なしの手入力と回路接続（MAT15 / OS10 / WEB04）

目的/利用体験: 本人指定の2動画を再生確認し、透ける像と手に連続反応するsceneをMiniへ反映。本人追加回答は像の場所に板/膜を置かない。ROCKはhand/source/OS/profile/接続表と光路計算、EXTERNALはcamera/model/光学/Bridge、JOINTは同一実機の可視性/精度/停止/基板、OWNERは撮影/実行/comfort/費用。Smithが最新表記で既存schema互換と料金を維持。

入力/出力: hand_landmark_observer.pyは事前導入MediaPipeとexact V4L2から画像xy21点を返すsource。モデルhash/版/本人profile/place/期限を束ね、自動取得なし。hand-preview.mjsの開く→つまむ→動かす→離す状態をhand-preview-host.mjsが既存createLocalDraftAppへrevision付きで適用/読戻しするsource。実行は未受入、room座標/空間tapへ昇格しない。

状態/保存/失敗/復旧: 子process pipeに限定、生画像/私用profileのGit保存なし。一時下書きだけで既存job/会話へ偽実行を記録しない。失踪/2手/急変/端/100ms欠落で取消、古い/改変/再起動/sequence違反は失効。host12秒、100frame、kill猶予1.5秒。profile再照合と開く動作から再開し、保存/権限は既存Broker/実appの受入へ残す。

承認/合格: local captureとlocal draftを明示flagへ限定。外部Tool/AI料金/光学通電は行わない。実camera/model、RGB/depth同期/位置誤差、対象/遮蔽、両眼の光学可視性、測定済みcomfort、独立停止が実操作の合格条件。動画のsensor/媒体/光学方式や画面の明るさは未確定。

回路/未決定: reference-interface-map.jsonに既存Pico2 module physical pin/harness/3V3接点とLEDのみのGP7を記録。GoはメーカーHDMI→USB-C active adapterを参照候補としexact host未受入、2A couponへGo5V3Aを接続しない。内部shutterは未選定候補。free-space-exit-bound.pyは4側面/光線角と焦点を理想化しても有限出口で未達が残る比較で、全方式の不可能性や必要台数証明ではない。最終光学/停止/電源/高速netが閉じておらず、新しい最終回路/配線mainboard/製造releaseは未完成。詳細章47〜50、手順HAND-PREVIEW.md。

## Mini上下の光学出口と参照CMの共通OS接続（MAT15 / OS10 / WEB04）

目的/体験: 像の場所へ板/膜を置かず上下も含む自由な観察と手操作を維持。参照CMチャット「avocado✖️architecture 🎬 (2)」の音楽copy/紙→Web/実寸配置をcomputer-use-scenarios.jsonへ対応づける。CMの部品寸法/表示性能は実装根拠ではない。ROCKは幾何/OS契約、EXTERNALは光学/像源/部品、JOINTは同一個体の可視性/低glare/入力/停止/回路、OWNERは同意/comfort/費用を担当。

入力/出力/状態: optical-exits.mjsへ内側の眼/対象、包囲boundsと各面の出口rect/guardを入力し、逆延長の境界面/位置と候補出口ID、geometricPathAvailableを返す。physicalVisible=falseを固定し、実driverやgrantを返さない。calculate-six-exits.mjsは3×3m領域/35,721組/18瞳点で上下を含む6面を計算。6面全体80㎡の理想条件は未達0、10mm guardで708未達。部品選定でも6小型Miniの合格でもない。

保存/失敗/復旧/承認: bounds/exitsをhostの校正profileへ登録する設計入力で、計算sourceに私用poseや原稿は保存しない。未登録/guard内は必要光線なし、範囲外や一致点は拒否。境界の再配置は再校正/lease失効、実測profileと既存Brokerを通すまで出力不可。光線の生成/迷光/家具と人体の遮蔽/縁/複数人の受入は別。旧入力leaseの失効、新nodeの校正と同一owner/job/scene/asset revision/anchor、実結果保存の照合で引継ぎ、料金を複製しない。

合格/未決定: 幾何の閉包を実光学の完成へしない。CM40mmと工学仮定76×186mm/Go幅80.4mmの収納相違を保持。章48/51、six-exits-result.jsonとcomputer-use-scenarios.jsonを参照。出射面積/継ぎ目/生成光線/像源/部品/独立停止が閉じてから最終回路/PCBを確定。今回新しい最終回路/配線mainboard/製造releaseなし。既存料金/まぶしさを維持。


### Pixelで最新Eveを試す接続（2026-10-23 / OS10・DSP01・SKY21）

目的・体験: 古い端末補助画面と最新RootのEveの取り違えを解消し、USBで本人PCの最新EveをPixelに表示する。部品なしの目的確認は先に利用でき、実行には別途端末承認・実Linux能力・準備済みモデルを要する。ROCKは画面接続/限定試験版/更新手順、JOINTは実Pixel一周、OWNERは新しい端末承認を担当する。

入力・出力: 既存公式scrcpyを同一byteのMac app入口へ包むscripts/prepare-pixel-mirror-app.pyで操作対象を復旧。scripts/stage-pixel-private-preview.pyは既存署名debugソースから本人用候補を作り、正本の6ループロゴ/Smith表記と最新agent.prepare契約を組み合わせる。新しい鍵・権限・モデルは作らない。接続はdebuggableかつhttp://localhost:5199だけ、127.0.0.1 bindとUSB逆転送でRootの/os/eve/moduleへ到達する。通常constructorのHTTPS検査と本番経路は保持し、専用constructorへの明示opt-inだけがそのexact localhostを認める。生のコードやtokenを文書へ保存しない。

状態・保存: 通常サイトの暗号化セッションはそのまま保持し、本人PC用sessionをno_backup/private-eve-preview/session-v2.binへ分離、保留コードも分離する。cookie/credentialの移送や自動承認はしない。接続切替前はforeground同期の終了を待ち、準備中/未確定の仕事/停止確認待ちを拒否する。同期停止だけを仕事停止と表示しない。

失敗・復旧・承認: USB切断/localhost停止/新grant未承認では実行不可。元の仕事と成果を保持し、通常サイトへ戻す入口を備える。新しいPC内試用アカウントからPixelへ仕事を送れる権限は、実際の承認カードを本人が確認してから付与する。通常サイトの資格を再利用して試験用へ流さない。guestは既存署名manifestの保護付きcode-only updaterで停止中に更新し、job/model/agent/鍵/私用stateの保持とruntime-agent-capabilitiesを照合、失敗は同じtransactionの復旧手順へ戻る。

合格・未決定: 画面操作復旧、部品なしの水やり目的で水分センサーと継続処理不足の表示、guest更新後の28仕事/2モデル/6担当・私用データ/鍵保持、agentPreparation=trueを実Pixelで確認。本人用最新Eveから担当作成/実モデル実行/保存ファイル読戻し/同じ仕事の停止はまだ未受入。ローカル開発アカウントを本番本人確認済みと呼ばず、公開v118・単体APK・共通OS image・Mini/Pro受入を分ける。一般公開・新モデル導入・有料Cloud・flashは行わない。続行条件は端末承認と同一候補の最終UI/結果/停止証拠。根拠はdocs/evidence/smis-object-purpose.json#pixelNoPartsFollowup20261023。


#### 2026-10-24 Pixel本人用試用の保存先修正と実操作

本人が試用接続を承認。Root localhost5199の同じ目的/会話/担当/モデルをPixelへ渡し、担当登録、端末内推論、文章保存、別viewerでの開封、同じ仕事の停止と待機を確認した。初回の1961bytesは正規exportとSHA一致。ただし初回の返答は依頼に合わず内容品質を合格扱いしない。役割名は目的の先頭だけへ短縮し、本文を返す指示へ整理。「箇条書き」も文章依頼として候補照合し、未確認の操作を実行済みにしない/本人確認待ちの境界は保持する。試用moduleページは通常Eveと同じquery解析で担当/会話を復元し、会話変更でもmodule入口を保持する。

保存事故と復旧範囲：EvePortableAccountBindingのdefault constructorへ試用realmが適用されておらず、localhost用AADで通常サイトの端末credentialを開いた際に削除された。通常サイトの端末再ログインが必要で本人へ通知済み。サーバーアカウントは削除していない。中央constructorで専用領域へ分岐し全呼び出しへ適用、journalはexact localhostの明示opt-in constructorを追加した。通常HTTPSの既定検査を維持。実機の隔離保存試験1/1とJVM82/82を通過、新鍵発行/新しい認可は行わない。以前の「通常接続不変」は事故前の読戻しに限定し、今回の現在状態へ転用しない。

整理：同じSHAのアプリ内モデル原本を確認したうえで、Download内の重複GGUF2個だけ1,278,893,376bytesを削除。内部hardlink化はSELinuxに拒否され、内部ファイルの置換/削除なし。旧ロゴのBrokerは現行Shellが必要なため保持。新しいモデル/パッケージは取得しない。同期は30分枠で終了し、同じ承認済み接続の開始ボタンから再開する。同期停止と仕事停止を区別する。

証拠と未受入：docs/evidence/smis-object-purpose.jsonのfollowup20261024へ同じrequest/成果/停止/cleanupを追記。実機はローカル開発アカウントの試用であり本番本人確認・全OS・Mini/Pro・音声・実BLE・一般公開は未受入。通常接続の復旧と内容品質の再確認を残す。ローカル開発DBへ既存3migrationだけを追加、private backupを保持し無関係な課金migrationは適用しない。


停止修正の実機追記：1.5B試行では仕事がcancelledでも別sessionの計算子プロセスが残った。内部診断で同じjobを止め、既存managerでstop confirmedを再照合。worker子プロセスへLinuxの親死亡時SIGKILLと起動時の親PID照合を付け、同じfenceでcancelled/unconfirmedの仕事だけmanagerの実停止receiptを取り直せるよう修正。hostの境界試験16/16、Pixel内Linuxの小プロセス試験4/4（AI推論なし）、保護したcode更新で32仕事/2モデル/10担当/鍵を保持。旧28仕事と旧6担当の全内容・2モデル・鍵alias一致、実行中0をAndroidから照合した。1.5Bの有用な返答や、修正後の新AI推論の合格は主張しない。

本人の旧版混在の訂正により、本人用APKのMain/SkyLinux/EveLinux仕事画面はmanifestから除外。Eve主要入口・仕事ボタン・会話履歴を同じ最新Webへつなぎ、同じ試用接続を開くときは接続切替をやり直さない。旧X接続専用APKはowner userから取り外し、データと復元APKをGit管理外へ保持。試験APK2個と転送用folderは削除。通常サイト端末credential消失の再接続は未完、内容品質/実行時間も未合格。一般公開なし。


<a id="pixel-eve-entry"></a>
## PixelのEve入口と端末の設定（2026-11-02）

目的は端末の管理を依頼の前に要求しないこと。通常起動は既存browserで同じ`/os/eve`を開き、初回にWebへ移る前のnative側は虹色ロゴ/白/墨色/52dp以上の操作へ整える。Webから戻った時はEveを開く/端末の設定の二つに絞る。設定は接続と同期、端末内AI準備、アカウントと診断の三群で、Eveへ戻る/Webの設定への出口を持つ。起動でモデル取得・自動承認をせず、同期開始は従来の既存接続条件だけを維持する。

ROCKはActivityとdebug resource、JOINTは本人Pixelの同署名APK/同アカウントの操作受入、OWNERは既存ログインと依頼の送信同意を担う。入力は従来のdeviceSettings intent、選択済みnormal/private realm、browser、既存接続。出力は同じ正規Eve routeと、既存の同期/準備/停止handler。新しいWebView/JS bridge/credential移送/DBを作らない。状態は通常入口/設定/外部Eve/失敗案内。画面状態と業務状態は分離し、設定中だけ既存診断refreshを動かす。

保存は既存account/Keystore/model/job/stop journalを維持。新しい虹色は公開v139のPNGのbyte一致コピーをdebug drawableへ置き、旧原本/production manifestは保持。browserが無い時は入口のstatusへ案内し、更新失敗は既存APKを同署名install -rで復旧する。アンインストール/データ消去/新しい署名鍵/OS flashは行わない。

合格は旧APK再現→新APK署名一致→Android build/unit/lint→追加推論なしの実機保全比較→Pixelの起動/入力/戻る/設定操作。実行中または停止未確認/AI準備中は更新を進めない。未知の実行先障害は別に診断し、UI更新だけでモデル実行の成功としない。実機/公開/native OS/金融受入は別に記録する。


### Pixel接続・保存済みAIの準備改善（2026-11-02）

OS10/DSP01/WEB04・JOINT。本人が列挙した8課題への修正。目的は既存登録・モデル・仕事を保持した再接続と、Eveで選ぶ担当のモデル準備。入力は既存account/Keystore/bridgeと照合したmodel ID/hash、出力は既存cache-only状態と同期。モデル/仕事/接続を追加しない。

アプリ独自の30分停止を除去し、Android dataSync timeoutのstopSelfとロック中保留を維持。同期停止後は実際のpoll終了を待ち、照合・準備の送出直前にもidle/account/lock/pending-stopを再検査。選択は5分間の既存inventory/session/hashへ束縛し、期限切れは再照合。担当名とモデルを併記し、準備後は同じrequest IDを自動照会、ready時だけ画面前面から同期再開を依頼する。ready heartbeatの30秒は変更しない。

失敗はlock/同期処理中/停止未確認/account通信/Linux bridgeを区別し、秘密値や生例外は表示しない。結果不明は再prepareせず同じ操作を照会する。Terminalは別アプリのVMで、終了時の停止をAPKで回避せず起動入口とアプリ切替案内を提供する。既存の通常/PC試用realmを保持し、新しい鍵/権限/ダウンロード/推論は作らない。

ROCKはUI・同期とguard、EXTERNALはAndroid/Terminal lifecycle、JOINTは同署名APKと実機保全、OWNERは担当/モデル選択。合格条件はhostの遅延選択・expiry/lock/account/stop/同期競合拒否、Android build/unit/lint、実機34仕事/2モデル/10担当と接続hash一致、準備→同期→Eve準備済み。実機の未実行をhost成功で代用しない。状態と残条件はdocs/evidence/pixel-connection-usability.json。 Terminalの起動補助は通常のアイコンと同じMAIN/LAUNCHERを別taskで開く。実機でTerminal自身の画面例外と起動拒否を確認したため、復元・再インストールは進めず、既存Linux/backupの保全と復帰を未完了として追跡する。


<a id="eve-noah-navigation"></a>
## Eve・Noahの画面間引継ぎ（WEB04 / HOME01 / SKY21）

2026-11-02の本人指示で監査R01〜R07を修正する。現行の主体はEveとNoahのみ。旧Jennifer/Sky/Zema/smisの内部識別子・API・保存形式は互換保持し、画面の第三の製品名には使わない。

1. 目的: Noahで見つけた能力・記事をEveへ渡し、同じ仕事の成果と戻り先を見失わない。
2. 利用体験: Noahのホーム／探して追加／ライブラリ／Tool一覧／端末・担当／接続を共通ナビでつなぐ。Eveにはメニューと常時見える仕事と成果・Tool・Noahへの入口を置く。
3. 責任: ROCK/O5が画面・URL・focusを担当。EXTERNALは配信/認証、JOINTは実job/成果/共有、OWNERは権限・費用・実参加の承認。認証と実行許可は変更しない。
4. 入力: Tool/thread/package/workJob等の既存query、選択担当とmodel pin、newsSource/title/seenAt/stale、同一originのreturnTo。URLは表示・選択の情報であり権限ではない。
5. 出力: Toolは既存 /os/eve?mode=tools を正規入口とする。旧 /chat は全queryを保持して転送。本人確認前にも選択Toolと理由・Noahへ戻るリンクを表示し、パスキー設定の復帰URLにも選択を保持する。
6. 状態: 成果一覧 #eve-work-results、Cloud #eve-cloud-results、Tool #eve-tool-results、資料 #eve-news-work を区別。指定欄を展開してfocus/scrollし、同じ会話・選択担当のqueryを維持。管理の成果リンクは成果一覧へ直接進む。
7. 保存: 新たなDB・権限・課金・モデル実行は追加しない。既存owner別保存・revision・未送信入力の離脱確認・一時handoffを保持する。URL選択を保存成功と表示しない。
8. 失敗: 接続不能・暗号化設定なし・未認証では既存の停止状態を維持。未確認Tool、危険な記事URL、外部/再帰returnToは安全な案内へ戻す。元記事の外部リンクは資格情報なしHTTPSに限定する。
9. 復旧: アカウントの既定はNoah。設定・接続・Eve由来は安全なreturnToと行き先に合う文言を使う。公開問題は直前の同Site保存版へ戻し、保存済みの仕事や認証を削除しない。
10. 承認: 記事の受取とTool選択だけで推論・投稿・外部送信を始めない。本人確認・資料保存・実行・費用の既存承認を維持。
11. 合格条件: 旧Tool入口のTool/thread保持と認証継続、Cloud/Tool成果の展開と同会話保持、管理成果への直行、設定/Noahの正しい戻り、ニュースの初期表示/原文/復帰、Noah内の一貫したナビ、390pxのメニューと成果入口を同じ配備artifactで確認。実行/保存/共有の一周は別受入。未決定のストア全体再構成や実機対応をこの導線修正で完成扱いしない。

Tool modeの共通ナビはhashではなく既存のview=work契約を使い、tool/threadを保持して会話・成果を往復する。Cloud/Toolの子パネルとカタログ説明もEve/Noah表示へ同期する。公開v141の実UI証拠はdocs/evidence/eve-noah-navigation-repair.json。共有root runtimeの統合とは区別する。
