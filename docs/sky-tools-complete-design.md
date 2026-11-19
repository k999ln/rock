<a id="noah-connection-sharing"></a>

<a id="noah-select-resale"></a>
## Noah本人用リセール実行（2026-11-16）

2026-11-17の本人指示で、[ターミナル用テンプレート](../toolkits/noah-resale-agent/README.md)を追加。ブラウザに依存せず共通service/Work状態遷移を実行し、専用SQLiteへ本人別に保存する。terminal監査、5分の内容固定確認書、多重watchのlease、独立配布/復旧/受入は実行契約のCLI節へ統合する。Webの保存先とは自動同期せず、OS実機・実provider受入を追加で主張しない。

[実行契約](services/noah-select-resale.md)を目的・体験・責任・入出力・状態・保存・失敗/復旧・承認・受入・未決定事項の詳細とする。3担当の探索/在庫を既存Workのowner/revisionへ保存し、公式eBay adapterへ予算予約と具体的条件確認を通して接続する。first-party localhost専用機能で、新規公開catalog ToolやOS実機対応の合格ではない。実取引/無人売買/入金自動同期は未受入。

## Noahの発見・接続・共有とEveへの選択引継ぎ

v0.4の[Noahストア・端末管理](noah-agent-model-store-design.md)を主導線にする。Eveは共通知能、NoahはAgent構成とストア、AMC/Broker/Work/Jevは工程・権限・実行・評価を担い、独立したSkyは置かない。Agent/LLMの検索→端末へ追加→Eveで仕事・編集→更新/削除を既存モデル管理へ接続する。旧sky系識別子とv0.3の3機能DB/APIを保持。計62件の受入設計で、新runtime・導入・配備は未実行。

[Noah設計](noah-connection-sharing-design.md)に、投稿1件の出典/ACL確認、Eveの未送信入力、本人別担当保存、能力/実行先の選択、同Jobの成果と停止、任意共有を統合した。既存のAgent Library、social/community、MCP/SDK、Agent share/outcome、物との3接続方式を再利用する。各章が11必須設計項目を担い、N01〜N12に加え、外部送信E01〜E08、下書きD01〜D08、招待I01〜I08、DB/APIのC01〜C08で環境と合格証拠を指定する。

PR305の投稿pinは採用候補でmain未統合。Rootの共有schemaとmainの差、配備済みNoahの画面往復と実行未受入を分ける。出典hash・作者署名・readyは実行権限ではなく、限定資料の外部送信、未送信下書き、招待の期限/一回利用/撤回はv0.2の3契約に詳細化し、実装/Provider/backupの受入は残す。新catalog Tool、API、料金、runtimeの変更は今回行わない。[記録](evidence/noah-connection-sharing-design.json)。

## 2026-10-23 — 正式表記はSmith

本人の明示訂正により、旧Sky／smisの製品表示は **Smith** とする。Eveで担当を作り、Smithが対象・能力・実行先をつなぐ責任は維持する。既存の `/sky`・`/api/sky`・`smis.*`・header・保存・権限scope・設計anchorは互換維持。以下の旧表記は経緯として残す。表示変更はPixel実機の一周や公開の合格を意味せず、一般公開は保留する。

## OS内の統一を先に行う（2026-10-22本人訂正）

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






端末ごとの会話/担当/仕事/成果/料金/停止を増やさず、RockstarOS共通Coreと同じ既存store/workflowに統合する。[11項目の正本](rockstaros-complete-design.md#os-unified-interaction)。前段のMini音声は共通Core/画面と旧Pixel接続adapterへ分離し、native/account/runtimeの同じjobへの結合を次に行う。機種別には実入出力/電源/driverを実装し、一般ローンチ保留と既存データ保全を維持する。Core抽出だけで全経路/全実機の統合済みとはしない。

## Miniの声からEve・smisへ

本人の2026-10-22追加指示による[Hey Eve/Thanks Eveの正本](rockstaros-avocado-mini-complete-design.md#mini-hey-eve)を参照。Hey Eve→依頼の確認→Eveの担当作成→smisで同じ仕事の実行/出力→Thanks Eveで指定jobの停止照合→待機。完全電源断と音声待機を分け、Pixel前景ASR/本人用LinuxとMini AON/実機を別受入にする。一般ローンチは保留。

## 2026-10-22 — Skyをsmisへ改名し、無機物・有機物を問わずつなぐ

本人の「skyじゃなくてsmisにしよう」「無機物有機物関係なく繋がるのを目標にする」を最新の明示方針とする。現行の製品表示名は **smis**（旧Sky）。Eveで困りごとから担当を作り、smisが対象・Agent・Tool・実行先を結び、RockstarOSが本人・権限・予算・仕事・保存を支える。お皿・ペン・植物・生き物・本人の記録を物質区分の固定リストで除外しない。実際に使える入力・処理・出力と、対象者の同意や取り付け条件は個別に確認する。名称や接続目標を、全対象への物理適合・未観測の状態取得・生体作用の実現済みとは扱わない。

理由は本人による改名と接続対象の明示的な拡大。既存`/sky`・`/api/sky`・schema/SDK識別子・task ID・保存データを保持し、旧文書のSkyは同じsmisを指す。正式ドメインは`avoado.si`、`avocadomini.si`、`avocadopro.si`のまま。一般ローンチは保留し、今回のsource/UI変更を配備済みとしない。[接続の詳細正本](sky-tools-complete-design.md#sky-object-attachment)。

## Eve LLMとの接続（2026-10-21本人訂正）

EveはLLMの製品名で、SkyはそのEveへ渡すModel/Agent/Toolの発見・登録・接続を担う。Skyで選んだ基盤モデルはEveの技術profile候補であり、Eveの製品名を置き換えない。Eveの生成案はBrokerの本人権限・Tool schema・費用・停止の再検査を通し、実Tool結果だけを同じjobのreceiptへ記録する。自社Eve重みやSky全Toolの縦断受入を完了扱いにしない。[OS全体の責任](rockstaros-complete-design.md#eve-llm-product-identity)。

<a id="eve-cross-device-sync"></a>

## EveのPixel/Web同一アカウント同期（eve-cross-device-sync）

2026-11-02の接続復旧補足：Androidの認可pollは通信開始時刻を受け取る一方、サーバーは処理時点から90日のexpiresAtを発行する。通信差だけで正規sessionを保存前に拒否しないよう、認可とKeystore暗号文の保存・読戻しに共通の上限検査を使い、90日上限に5分だけ通信/時計差の許容を設ける。サーバーのexpiresAt自体は延長・書換えせず、期限切れ・owner/origin/token不一致・過大期限は拒否する。目的は同じ本人の既存Pixel接続の回復で、モデル実行権の追加ではない。旧登録・仕事・model・private realm・bridge鍵を保持し、失われた通常サイトsessionは本人の明示再承認からのみ発行する。ROCKは互換判定と試験、OWNERは再承認、JOINTは同署名install-rと実画面/保存hashの読戻しを担う。合格条件は通信差再現→修正後通過、期限切れ/上限外拒否、実機既存データ保持とEve実行先表示。実推論と全OS受入は今回の範囲外。証拠はdocs/evidence/eve-noah-publication.jsonのconnectionRepairへ記録する。

同日実機読戻し：同アカウント再接続、既存TLS認証、保存済みモデルのcache-only準備を経て、EveのPixel · Linux／既存担当／Qwen2.5 1.5Bが「接続・準備済み」と表示。34仕事・2model・10agentの内容hashと接続保護4hashを保持、実行中0・追加推論0。Terminalは終了せずアプリ切替で保持し、native同期（最長30分）を再開する。cache照合には確立済みbridgeと同期停止が必要で、30秒の照合選択期限を過ぎた準備は再照合する。仕事の実行品質・無人再起動・全OSの受入は別gate。

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

<a id="sky-marketplace-mcp-lifecycle"></a>

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

## Sky：Model・Agent・Tool市場とMCP接続の一周

2026-10-20の本人明示要件を、既存RQ22〜RQ24、SKY14/15/20/21、BIL02の受入条件として固定する。RockstarOSの中のSkyは能力の発見・追加・接続を担い、Eveは依頼・承認・進捗・停止・成果を同じ本人jobで扱う。既存Package／Registry／Studio／Connector／Commerceを再利用する。以下は製品契約であり、各実行先の本番合格を意味しない。

| 段階 | 利用者が確認する内容 | 保存・検証・失敗時の扱い |
| --- | --- | --- |
| 登録と発見 | Model／Agent／Toolを登録、検索、比較、追加、更新、削除する。作者の本人性、配布元、license、依存関係、版を表示する。 | 商品ID・作者ID・配布元・版・content hash・署名主体・license・依存版を版付きで保存する。署名とhashは取得物と作者の同一性・完全性の確認に用い、安全性保証と表示しない。依存未解決・license不明・hash不一致は追加/更新を止める。削除は本人の追加記録を外し、既存job/receiptは監査期間中保持する。 |
| 商品条件 | 入力/出力schema、必要権限、実行先、商品価格、外部実費、Rock側料金を商品ごとに比較する。 | 未確定価格や未検証Provider申告を確定額へ昇格しない。版・権限・料金・実行先が変われば旧承認を無効化し、差分と再承認を表示する。 |
| 審査と試用 | 提出、審査、sandbox試用、公開範囲、失効を別状態で示す。 | 作者の署名だけで公開・実行可能にしない。審査済み版のdigestと有効期限を固定する。試用成果はsandboxと表示し、失効後の新規接続・実行を拒否する。 |
| MCP接続 | このPC、Sky Cloud、提供者MCPから接続先を選び、initialize、能力交渉、tools/list、prepare、tools/call、結果照合へ進む。 | 接続先ID、protocol、capabilities、Tool一覧digest、schema、scope、期限をConnection Passportに固定する。未対応能力を提示せず、Tool一覧・接続先・scope差分で再承認する。timeout後の外部作用は結果不明として照合し、盲目的再送をしない。 |
| 外部認可 | OAuth等の許可範囲、期限、再接続、解除を本人が確認する。 | 秘密値は商品manifestや公開Registryへ保存しない。期限切れ・解除・scope拡大は接続停止、最小scopeで再認可する。実Provider OAuthはJOINT受入まで準備中と表示する。 |
| 実行と記録 | 実行失敗、部分成功、結果不明、取消を区別し、作者・利用者が利用記録と成果記録を参照する。 | 同じowner/job/revision、商品版、実行先、承認digest、attempt、usage、receipt、成果hashを結ぶ。取消は未送信作用の停止と既送信作用の照合を分ける。本人別閲覧・保持/削除と作者に見せる集計のprivacy境界を維持する。 |
| 作者導入 | SDK、動くsandboxサンプル、導入診断で不足権限・依存・接続・成果照合を特定する。 | 作者の試験通過を全利用者・全実行先の合格へ転用しない。端末/Cloud/Providerごとの同一版E2E証拠を残す。 |

**追加・購入・実行は三つの別操作**とする。「追加」は本人の能力選択記録だけを作る。有料商品の購入は明示価格/条件を見たCheckoutとProvider再照合後の利用権付与で成立する。仕事の実行はさらに現在の利用権、商品版、接続先、権限、見積・費用上限、本人承認をBrokerが確認した後だけ送信する。追加済み、有料購入済み、MCP接続済みのいずれもTool成功を表さない。

ROCKはcatalog・状態遷移・Passport・権限/費用gate・receiptと復旧を実装する。EXTERNALはMCP server、OAuth issuer、商品固有処理と価格/権利条件を提供する。JOINTはPC／Sky Cloud／提供者MCPごとにsandboxで登録→審査→Add→認可→単回実行→失敗/取消→照合→失効までを同一版で検証する。OWNERはscope、費用上限、購入、外部作用、公開範囲を決める。現状PC接続と既存Package/Commerceの一部source・fixtureはあるが、Sky Cloud／提供者MCPの実OAuth・料金付きMCP直接実行・全商品の縦断受入は未完了。`npm run design:check`、`npm run baseline:check`、Connector/Package/Commerce対象試験、`npm run verify`をローカル整合に使い、実Providerの一周は別証拠で判定する。

## 料金・契約・請求の共通連携（2026-10-20）

Sky listingとEveの表示は、[BIL02共通請求契約](sky-billing.md#rockstar-monthly-billing-contract)の版付き料金、事前見積、原子予約、meter別使用量、枠控除、月次Invoice、入金・異議・未払い復帰を同じaccount/job/receiptへ結ぶ。表示やProvider自己申告だけで請求・入金を確定しない。Cloud tokenとLinux CPUの統合は未受入。

## SkyからEveの同一仕事へ引き継ぐ契約

2026-10-20の本人要件。Skyで選んだModel/Agent/Toolは同じ本人のEve下書きへ、ID/版/接続状態/必要scope/料金/実行先を添えて渡す。Eveは目的・入力・期待成果を確認し、複数担当の依存、送信先、見積/上限、停止条件を本人に示す。Add・引継ぎ・会話上の同意だけで実行を始めない。実行開始と追加費用/権限/送信先の再承認、予約/確定費用、停止要求と実行先の証拠、検収/独立アプリ読戻し、失敗からの復旧は[RockstarOS内Eveの詳細契約](rockstaros-complete-design.md#eve-work-desk)に従う。Skyは能力の登録/接続状態と結果の出所を保持し、Broker/workflow/Walletの権限・状態・費用を代行しない。現在のsource/fixture合格とCloud/Provider/端末の受入は別に記録する。

## ホーム・依頼入口の情報順位

2026-10-20の本人指示による[構図/操作品質の共通契約](rockstaros-complete-design.md#frontend-composition)を適用する。Eveへの下書きと実行承認を分け、現在の実行先は見せ、長い選択肢を必要時に開く。Sky登録/Add/実行/費用/停止/成果の責任と保存契約は維持する。今回の範囲はHome/共通UIとPixel依頼入口で、全Tool画面の移行やユーザー統計は未受入。

## 最新再設計と端末・ブランドの統一（2026-10-20）

本人の明示訂正により、今のRockstarOS再設計を最新版とし、旧Buildroot OSは良い実装の選択再利用元とする。旧OS完成や旧QEMU合格を現商品の完成条件/証拠へ置き換えない。表示名RockstarOSと既存avokado会社ロゴを統一し、Pixel・avocadoMini・avocadoPro・吊り下げ相棒を共通owner/job/権限/契約/料金へ接続する。端末差は能力と入出力adapterで扱い、同一契約の端末追加による基本料重複を防ぐ。相棒のSOS/独立警報は通信/LLM/課金と分離する。[詳細正本](device-support-architecture.md#current-device-adaptation)。現段階の各実装・実機・請求受入は独立して記録する。

PixelのeSIM追加・料金/契約・支払い方法・専用Linux・Sky/Eveの利用開始は、[OS完成後に組み込むmodule](sim-led-product-architecture.md#pixel-service-setup)としてsource開発中。初回setupは引落0、既存月末請求へ接続し、実eSIM/実機/Provider/OS受入前は既定無効。

## 最新の標準提供：既存OSへ共通RockstarOS環境を接続する

商品の意味は、通信容量を売るeSIMではなく、自分用のcloud Linux・LLM・Agentが追加されるservice profile。携帯の圏外/電源OFF後も、executorが受領済みの仕事を本人承認済みの権限・予算・期限内で進める。LLMがlocalなのは配置先Linuxに対してで、全iPhone内へのmodel搭載を意味しない。PCの前に立たない制作、携帯を持たないやり取り、実利用/検収/収納に基づくRun to Earnを同じ仕事/成果へつなぐ。実行Linuxまで外部通信断なら、導入済みmodelの自己完結処理と、外部作用の待機/再照合を区別する。

2026-10-20の本人追加指示「各端末の専用osを作らなくて済む」「何にでも対応」「このシステムは既存じゃないから発明して」により、標準商品は、eSIM導入から本人専用の共通RockstarOS環境を準備し、既存OSの端末へ接続する方式とする。RockstarOSの中のSky・Eve・管理Linux・OS Coreを共用し、端末ごとの差は能力契約と薄い入出力adapterで扱う。eSIM非対応機器は本人承認した子接続で同じ契約へ追加する。GrapheneOS forkや機種別OS imageは追加のnative系列であり、標準利用開始の前提にはしない。

[発明する起動・接続protocol、アルゴリズム、状態、責任と受入条件](sim-led-product-architecture.md#esim-service-attachment)と[機械可読案](../contracts/rockstar-service-attachment.json)を現在の詳細とする。eSIM側アプレットは対応発行元と端末での研究対象。iPhoneの完全無操作起動、同意なしのapp導入、全hardwareの全機能は未実装・未受入であり、手動Web起動へ希望を縮小して完成扱いにしない。従来のnative優先説明はその追加系列に限って読む。RQ01〜RQ49、月16ドルの枠付き契約、本人権限/費用上限/持出しを保持する。

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

Skyはmodel/Agent/Toolの登録・発見・比較・追加・接続を扱い、Eveは同じ本人の依頼・計画確認・費用承認・進捗/停止・成果・利用量を扱うSIの窓口。普段はEveで仕事を進め、能力の追加/交換が必要な時にSkyを開く体験へ統合する。Skyの選択/追加だけでは仕事の実行や有料購入を成立させない。

実行入口の現行Web契約は、選択済みまたは接続済みSky Toolへ振り分けた依頼を、EveのTool確認カードへ渡すこと。会話用modelがremoteでも、Toolはremote文章生成の見積だけで止めず、Tool自身の接続・料金・権限を再確認する。確認カードから本人が実行を開始した後、runnerの実結果を同じEve会話へ戻す。Tool候補の下書きや接続案内は本体実行の成功ではない。複数Toolの依存順、Cloud/Providerの停止・usage receipt、owner永続成果は別受入。

現在のWeb sourceはSkyの選択したTool・依頼文・短命の引継ぎ番号を`/chat?tool=...&thread=...`へ渡し、Eveが一度だけ受け取る。保存済み会話は同じ内部キーで読み、仕事は既存workflow/owner別work_jobsへつなぐ。本人・eSIM利用権・許可されたscope・予算をBroker/実行adapterが確認し、対応する端末内/管理Linux/Cloudの実行先へ渡す。成果/usageを仕事へ照合してEveへ返す到達設計であり、UIの引継ぎだけを全実行先の縦断合格にしない。

現在はWebの引継ぎ/会話保存と管理Linuxの共通job保存がlocalで検証された範囲。全Sky ToolがEveへ統一済み、Cloud/Pixel全経路の使用量が同じ月額枠へ精算済み、Mini/Proの実装済みという意味ではない。実行権限・課金・作者配分・deviceの受入を名称変更と分けて記録する。

<a id="sky-linux-marketplace"></a>
## Sky Linux 16：モデル市場と専用Linuxの利用契約

実行SI向け自社LLMは[設計段階](llm-evaluation-architecture.md#execution-si-owned-model)のmodel候補である。最初の縦断はEve依頼→AMC job→選択済みSky Tool一件→実result/receipt→同じEve job。Sky catalogはTool ID/版/schema/権限/料金を提示し、LLM出力をTool成功や実行許可として登録しない。重み・学習方式・配布profileは未確定。

2026-10-20追加のAI・モデル管理は[RockstarOS共通Core契約](ai-native-os-architecture.md#ai-model-management)に従う。Skyの一覧はmodelの出所・版・license・容量・hash、実行先ごとの適合と実測、仕事別の比較理由、未測定項目を提示する。追加/選択だけでCloud送信やTool権限を許さず、Eveの一件の仕事へprofileと実行先・費用上限を固定してBrokerへ渡す。Pixel限定の複数GGUF試験を任意modelの市場/Cloud実行合格へ転用しない。

2026-10-20の明示指示：Hugging Faceを参考にLLM／Agentの登録→Add→専用Linux実行→月次請求→作者配分をつなぐ。最初の商品は **月額16 USDの一プランで、一定のAI・Linux利用枠を含み、対象枠の超過分だけを従量課金**する。これは本人の追加回答で確定した方式で、枠の数量・対象・超過単価・繰越は未確定。AI tokenと運用者管理Linux CPUは別単位で示し、同じ使用を二重請求しない。単価を月末に変更するのではなく、契約時に固定した従量単価と本人が承認した上限から実使用額を求める。電子契約とチェーン上の証明を選択済み。今回の実装はsource／local fixtureであり、実eSIM契約、Linux production、実課金、実払出し、チェーン公開を合格にしない。

1. **目的・利用者**：作者は既存Studioの審査済みPackageへ版固定GGUFと文章担当・利用料を登録し、利用者は `/sky/marketplace` → `/sky/linux` で比較・Add・依頼する。SKY14/15/21・SIM01・BIL02、主担当Sky/MCPのROCK。現在の実行adapterは対応する文章GGUFだけ。画像・音声・任意作者コード・クラウドモデルの同一実行窓口への移植は未受入。
2. **利用体験**：価格と上限を読む→eSIM注文／導入端末を既存grantで照合→電子契約を同意記録→発行元の現在の有効状態を確認→LinuxをAdd→審査済み担当をAdd→一件の上限・保存・実行を承認→実測→下書き→本人確認／持出し。仕事は既存`lib/workflow.ts`を使い、Eveの`work_jobs`へ同じID/revisionで原子的に保存する。
3. **責任と禁止権限**：ROCKは登録・既存審査者資格によるモデル/担当の追加審査・契約・grant・予約上限・請求・精算・復旧。EXTERNALはeSIM issuerの現契約状態、Linux供給、Stripeの収納/KYC/送金、model license、chain。JOINTは同一契約/実Linux/Provider sandboxでの縦断、OWNERは契約条件・月間上限・入力・支払方法・公開chainを決める。LLMやeSIMの画面表示へ本人認証・Tool権限・入金を委ねない。
4. **入力・出力・版・上限**：既存Package key/hashと作者ID、`sky.local-model/1`、`sky.local-agent/1`、登録digest、USD料金版、契約digest、eSIM注文・端末、job/input hash、CPU最大170秒と個別上限。モデル登録は元Package審査だけで利用可能とせず、追加定義digestの審査期限も要求する。出力は共通job、本人確認前の下書き、実CPU/使用料金、月次明細、入金ref、作者配分/送金ref。実行同時予約は無料枠を先取りせず最悪料金で確保する。
5. **状態・失敗**：登録未審査→期限付き審査→Add、Linuxは`added/restricted`、仕事はqueued/running/review/completed/cancel_requested/cancelled/unknown、請求はopen/paid/reversed。停止要求と実停止は区別し、停止後の遅い下書きを採用しない。Package失効、停止未確認、使用量不明、上限超過、期限超過では新規実行／請求確定を拒否する。
6. **保存・保持・退出**：migration0064はowner別契約/登録/審査と証拠IDを保存。仕事本体は既存Eveの保存と同一D1 transactionで同期する。未払いはAddの新規実行とlease更新を停止し、設定・履歴・成果・請求確認・exportを残す。支払いとeSIM利用権が両方復旧したら同じデータを使う。本実装には停止を理由とした自動削除処理はない。契約のretentionDaysは最低保持条件で、全損backup・削除/法定保持・大規模archiveの実運用は別受入。
7. **offline・重複・結果不明**：実eSIMの導入証拠を現在の契約有効性へ転用しない。issuerは注文/端末/単調増加sequence/最大24時間のvalidUntilを持つ署名eventを供給する。実行leaseは最大300秒、請求月境界とissuer期限を超えず、継続時に再照合する。通信断・失効で次の仕事/leaseを止める。仕事は一回claimし自動再実行しない。receiptは署名・役割・workspace・モード・期限と全体一意IDで照合。結果不明の計算予約を確定料金へ換えない。
8. **更新・復旧**：登録済み版・契約単価・使用model hashを上書きしない。D1のrevision競合または既存Eve仕事の競合時はbatch全体をrollbackする。Linuxは一workspace一OS userを前提に、既存固定llama.cpp/workerのhash確認を使う。productionのimage更新/再導入/全損復元、Pixel/Mini/Proへの同一image転用は未合格。
9. **安全・料金・契約**：16 USDは一か月有効な基本サービス。UTC暦月で締め、初月とeSIM有効期間の端月は確認済み期間を秒で按分し最終centで切上げる。CPU従量は実子processのuser+system CPU時間を月内で合算し、月額に含めた契約上のCPU利用枠を控除して料金単位の端数を切上げる。停止/失敗も実計算費のみ、作者利用料は成功した仕事のみ。作者分には既存10% Marketplace手数料を適用し、基本料/計算実費へ重ねて適用しない。未承認の追加課金なし。Linuxモデルprocessはbubblewrapのnetwork/PID/user等のnamespace、限定read-only mount、CPU/出力/FD制限を要求し、未対応時は制限なし実行へfallbackしない。root・API鍵・汎用shellをmodelへ渡さない。専用VM全体/管理者からの機密性保証ではない。
10. **請求・分配・合格**：`lib/sky-linux-billing.ts`は既存Stripe transportで確定明細からdraft Invoiceを作り、永続binding後だけfinalizeして自動収納へ渡す。InvoicePayment/PaymentIntent/Charge、金額/通貨/本人/契約/modeを読み戻し、未入金から作者送金しない。入金後に既存作者の受取口座へv2 recipient capabilityと元Chargeを再検査して別Transfer、返金/異議では新規配分を凍結してTransfer reversalを照合する。未知の請求/送金を20時間以後に盲目的再作成しない。Webhookは必須で`/api/sky/linux/payments`、支払後画面は入金根拠にしない。税区分/販売地域/登録・手数料実費はProvider受入で決め、未設定の自動税を表示しない。証拠は`docs/evidence/sky-linux-service.json`。
11. **未決定・次の実受入**：CPU単価/無料量、月間上限、猶予、最低保持、実eSIM issuerと有効状態adapter、専用Linuxの能力/隔離/常駐、Stripe sandbox口座/Customer結合/KYCと税、チェーン/contract addressは未確定。環境の`SKY_LINUX_SERVICE_ENABLED`と`SKY_LINUX_BILLING_ENABLED`は既定閉鎖。`contracts/SkyAgreementProof.sol`はsalt付きcommitmentをtimestampするソースで、契約本文や本人データを載せず、支払い・利用権の正本にはしない。法的有効性とチェーン公開は別受入。まず運用者管理Linuxで本当にCPUを測り、同じeSIM契約・一件の実job・Invoice・Transfer・失効/支払再開までsandboxで照合する。任意model/作者コードを無条件に掲載するHF規模Hub、cloudモデル統合、production、一般公開は未完了。


### Eve・Jenniferの利用計算の責任

2026-10-20の本人確認対象。Eveは依頼、使用担当/model、実行先、見積/承認上限、進捗/停止、成果、使用量/請求明細を示す仕事面。実機記録`docs/evidence/sky-owned-si-employees.json`のJennifer localはQwen3-4B系profileによる端末内文章AIで、名称だけで専用課金商品や独自計量器とは扱わない。

共通の契約account/月、job ID、Agent/Tool版、model/runtime版、usage IDで計量を結ぶ。Cloud AIは検証済みProvider usageの入力/出力/cacheと版付き単価、運用者管理Linuxは実子process CPUを使い、月額に含む対象枠を控除して超過を明細化する。端末内JenniferのtokenをCloud使用量へ計上せず、Eveを開く/担当を選ぶだけの操作へ追加usageを発生させない。LLMの生成した数字は請求根拠にせず、予約/概算/確定usage/請求/入金を分け、本人の上限と重複排除を維持する。

現在の新LinuxサービスはCPUの枠控除/超過計算とEve job保存のsource/local fixtureまで。既存のCloud token料金計算は別経路にあり、有料実行gateは閉鎖中。Cloud AI月額枠とJennifer/native実行を同じ契約明細へ接続する受入、対象枠/換算/繰越、実Linux計量・決済/作者配分は未完了。Eve/モデルを含む全経路の統合計量が完成したとは表示しない。

<a id="sky-multi-model-pixel"></a>
## Pixelでモデルと担当を追加して同じ流れで使う（2026-10-20）

本人の明示依頼「固定モデルだけでなく別モデル/担当の追加、必要な環境準備から実行・成果確認・持出し・停止。Pixelで試験、普通の言葉、一般公開しない」に基づく変更。同日の「いろいろダウンロードされている理由」への指摘により、導入物はSky内部、Downloadは本人が選んだ持出し先として分ける。続く「全体確認を最後まで直し、不要なファイルを増やさず取得の目的を普通の言葉で示す」の明示依頼により、Web/Pixelの取得前案内と確認用成果の自動回収を実装する。従来の限定受入を新候補へ流用しない。

1. **目的・利用者**: 本人が対応する文章AIと担当を追加し、PCや有料Cloudを使わずPixel内Linuxで仕事を進める。SKY14/15/21、O5、主担当ROCK。
2. **利用体験**: 依頼欄を入口にし、設定でAI選択/Hugging FaceのGGUFリンク確認/設定ファイル取込み→名前・配布元・容量・利用条件の確認→追加→準備→担当選択/作成・取込み→料金/保存同意→依頼→下書き→文章保存→停止。担当が使うAIが未準備なら同じ主操作でそのAIを準備し、元の依頼は保持する。
3. **責任・権限**: ROCKは登録/互換チェック・固定実行adapter・workflow・保存・停止、EXTERNALはHugging Face配布物/llama.cpp/Debian/Android、JOINTは同一Pixel実動作、OWNERは利用条件/素材/保存先/内容確認。設定ファイルはデータのみ。作者shell・root・インストーラ・任意依存・外部送信権限を受け付けない。
4. **入出力・版・上限**: `sky.local-model/1`はid/名前/HF repository/40桁revision/単体GGUF名/SHA256/bytes/license/promptFormat/memoryMiB。8モデル・合計6GiB・単体1.5GiBまで、対応文形式chatml/llama3、要求RAM2〜4GiBを確認する。互換性は宣言だけで保証しない。リンク確認はHF公式の公開metadataだけを上限1MiB・15秒で読み、版・SHA・容量・licenseを固定した同schemaへ変換する。確認だけではAI本体を取得しない。任意host/認証/installerリンクは扱わず、文章形式は本人が配布元の案内に合わせる。`sky.local-agent/1`は名前/指示/使用modelId。32担当・指示1200字・依頼4000字・100仕事を維持する。追加済み同idの版/形式/条件を上書きしない。
5. **状態・進捗・失敗**: 登録、準備中、モデル別準備済み、実行中、下書き確認待ち、確認済み、停止済みを分ける。取得は実byteを表示し、確認・環境配置・動作確認は実処理の状態を表示する。未対応/メモリ不足/空き不足/通信/照合失敗を使用可能と表示しない。仕事の失敗も普通の言葉で表示する。
6. **保存・保持・退出**: 既存UID別state/旧model/担当/成果を保持する。モデルは本人homeの`models/<id>`、版と内容を対応付ける。同じ内容のAIはSHA照合後に既存blobを再利用できる。取得は`.part`を照合してから置換し、失敗/中断は部分ファイルを削除。導入後の固定runtime archiveも`~/sky-private/distribution`へSHA照合して保持し、日々の起動/準備を共有Downloadに依存させない。開発用の導入・診断・fixtureは通常のDownloadへ残さず、重複したモデルを追加取得しない。取得前にAIの名前・文章を作る目的・初回の容量・配布元/条件・Sky内部の保存先・通信と再利用を表示する。保存済みAIの照合前に前回中断した専用`.part`を回収する。成果は本人の保存操作だけで書き出す。実機試験の成果は試験が生成したUUID一時名だけを終了時に自動回収し、本人の保存済み成果へ触れない。担当設定をJSON、成果を通常の文章として本人指定先へ保存。削除GUI/全損backup/別人認証の移行は別受入。
7. **offline・重複・結果不明**: 照合済みの端末内モデルは再取得しない。初回のmodel取得のみ配布元へ通信し、依頼本文を送らない。固定版/配布先を制限し、SHAとGGUFを検査する。既存requestId/agent/input一致、共通revisionと再送拒否を維持し、再起動時に依頼を自動再実行しない。
8. **互換・更新・復旧**: v1の単一model保存を読み、旧担当/成果をその版に結び付けたまま移行する。旧受入sourceは`android-entry-v1.patch`、新しいUIは別snapshot。APKは同署名でデータを残して更新。旧APKと配布物をGit外へ保存し、OS image/Terminalデータを消さず戻せるようにする。
9. **停止・資源・承認**: 準備中も停止可能。停止は準備processの終了を待ち、実推論はPID/開始時刻/boot照合とprocess group停止を行い、停止後の遅い出力を保存しない。未確認の停止では次の仕事を拒否する。既存systemdのCPU200%/memory2GiB/tasks64、workerの時間/出力制限を維持。文章生成は固定のtemp0/seed42/最大512 token/context4096、repeat penalty1.1/直近128 tokenを使い、作者設定から実行引数を注入しない。モデルの入手同意と各依頼の実行同意は別。Cloud使用料0、電気/機器代未計測、契約/請求を開始しない。
10. **合格条件・証拠**: 集中host試験とは別に、同一Pixel/配布manifest/APKで旧データ保持、新モデル設定/担当取込み、端末内準備と実推論、画面の下書き/費用、実Android保存、Sky終了後の一致読戻し、進行中の実停止を確認する。新UIの縦断受入は今回新たに行う。証拠は`docs/evidence/sky-multi-model-pixel.json`へ記録し、取得/転送/型検査だけで実機合格にしない。
11. **未決定・範囲**: 最初はQwen2.5の従来1.5Bと追加0.5B。追加可能な他のGGUFは互換性/容量/品質を個別実行で判定する。画像/音声/safetensors/作者code/コンテナ/全機種/常時稼働/熱・電池/品質保証/HF規模の共有Hub/Cloud GPU/本番課金は別gate。本人の内容評価も技術受入と分ける。正式domainはavoado.si/avocadomini.si/avocadopro.si、本人runtimeはlocalhostのまま、一般公開保留。

<a id="sky-private-linux-deployment"></a>

<a id="pixel-sky-eve-mtls"></a>

### PixelのSky・Eve・Linuxと転送に依存しない接続

2026-10-21の本人実装指示により、既存OS10/SKY21/DSP01・ROCKで開発する。目的は、Skyで選んだ担当/モデルをEveへ渡し、既存Linux managerの同じowner/job/revisionへ依頼・進捗・下書き・使用額・保存を接続すること。新しい仕事台帳は作らない。Eveの入口は本人用`EveLinuxActivity`とPixel内Webの`/eve`、Skyは既存能力管理。`run`はEveからのagent/model SHAを再照合し、同一request IDは同じ仕事へ戻す。旧仕事は移行のために再実行しない。

接続はdebug/本人Developer Preview向け。Androidの`avf_tap_fixed`にあるprivate IPv4だけで5198を待ち受け、Linuxから既存APIへ中継する相互TLSを追加した。物理LAN/Internetへ待受を広げず、Android権限は既存INTERNET/POST_NOTIFICATIONSを維持する。Android Keystoreの専用EC鍵とLinuxの0600秘密鍵は外へ出さず、公開証明書の指紋を両側へ固定する。TLS用digest認可は[Android一次資料](https://developer.android.com/reference/android/security/keystore/KeyGenParameterSpec.Builder#setDigests(java.lang.String...))に従い、署名APIを外部公開しない。接続先証明書、期限、応答ID/schema、5MiB上限とqueue上限を検査し、失効・VMアドレス変更・切断では再接続するが、送信結果不明の変更操作を自動再送しない。ペア設定後は認証なしHTTPへfallbackしない。

保存は従来のLinux `state.json`が正本で、Eve由来の仕事へsurfaceと承認時の担当/model hashを補足する。0円表示はこの本人local試用のCloud使用料/自作担当代で、電気/機器代は未計測、月額・実請求を開始しない。依頼/成果は通常のworkflowとreviewを通し、本人検収とは分ける。接続断では最後の記録と入力・依頼番号を保持し、停止済みと推定しない。更新installerも既存仕事の実行状態が読めなければ停止/上書きへ進まない。従来の5199転送は旧経路として分離し、Terminal本体の上流不具合を修正済みとは呼ばない。

開発者の最初のペア登録だけは、本人承認された同署名APKとhash固定したLinux packageで公開証明書を交換する。一般利用者向けの導入/再ペアUI、account同期、証明書更新/紛失復旧、全OS/別機種/Provider/本番課金は別gate。既存appのbackup、旧APK、転送設定によるrollbackを残す。合格は、5199転送OFFでSky→Eve→実推論→Android保存/独立読戻し→停止→再表示、旧仕事の不変、VM/アプリ再起動、未承認証明書の拒否を同じ候補で測る。物理結果は[既存実機証拠](evidence/sky-pixel-linux-entry.json)へ追記する。EXTERNALはAVF/GrapheneOS、JOINTは同一Pixel、OWNERはペア対象・費用/入力/保存/内容判断を担う。

コードは`toolkits/sky-linux-local/android-eve-bridge.patch`、`android-bridge.py`、`install-android-bridge.py`、既存manager/workflow。検証入口は`tests/sky-linux-local.test.mjs`、`PixelSkyEveAcceptanceTest`、Android build/unit/lint、design/baseline/full verify。今回のCSV試験は生成manifestを含むbuild一式のhashをコピー前後で照合する。前回のエラーは再試験では未再現で、取込み不整合を検出する対策と正常113 assertionsを区別して記録する。
## 本人用Linuxへのモデル・担当の追加と実行（2026-10-18）

**追加の明示指示（2026-10-19）: 実行先はPixel本体のLinux。** 先行したPixel画面→PC Linuxの受入を今回の達成条件に転用しない。以下の共通契約を維持したまま、既存Terminal Debian guestに画面・仕事の管理・保存・実推論を配置する。

### Pixel内実行の追加契約

1. **目的**: PCを経由せず、本人のPixel内でモデルと文章担当を追加して一周使う。一般公開は保留。
2. **利用体験**: Pixelブラウザの端末内画面でmodel追加→Linux準備→担当追加→料金/保存同意→実推論→成果確認/文章保存→仕事停止/AI停止。内部IDは詳しい記録に置く。
3. **責任**: SKY14/15/21のROCKは共通workflowと固定native adapter、BIL02は費用表示。EXTERNALは既存Android Terminal/Debian/Node/llama.cpp/Qwen、JOINTは同一Pixel実動作、OWNERは素材・モデル条件・保存・端末操作の時間を決める。OS imageは変更しない。
4. **入力・権限**: PC版と同じ名前/役割/依頼の上限、モデルの固定版、本人UIDを使う。実行先は`environment.spawn/prepare/stop`で固定し、PC/Lima/Cloudへfallbackしない。モデル出力は文章だけで、shellやToolの許可にしない。汎用コード実行を追加しない。
5. **出力・状態**: 共通`WorkJob`のactive/review/completed/cancelledとrevisionを保持する。Linux/kernel/boot ID/model SHAの準備記録を返し、readyを実依頼成功と混同しない。「AIの実行を停止」は新規計算停止と自分のprocess停止確認であり、Linux VM全体の終了とは区別する。
6. **保存・持出し**: guest本人home `~/sky-private/state`に役割/元依頼/仕事/成果、同home配下にmodel/runtime/限定job記録を保存する。共有Downloadの配布folderは勝手に走査せず、固定名ファイルだけ読む。成果は本人の保存操作で通常の文章/任意の詳しいJSONへ回収し、Sky停止後も読める。
7. **失敗・停止**: 容量/ABI/依存/照合/localhost転送の失敗を使用可能としない。Pixel guestの実測1GBを受け、モデル準備は2GiB未満を拒否し、本人用試験ではTerminal設定4GBを使う。boot ID変更後は新たな環境準備を必須にする。停止はPID/開始時刻/boot IDを照合し、未確認なら次の依頼を拒否する。元依頼を自動再送せず、停止後の遅延成果を破棄する。Androidによるguest終了を常時稼働と表示しない。
8. **更新・復旧**: `sky:linux:pixel:build`で同じUI/managerを配布物にまとめ、manifestと固定Node/runtime/model SHAを照合する。既存自分のserverが動く場合は自動更新しない。再起動はbootstrap、前回activeは共通再起動照合で停止する。正式署名update、端末喪失復元、汎用rollbackは未受入。
9. **承認・公開**: guest127.0.0.1:5199のみ待受し、接続peer/Host/Originを検査する。Android側転送も端末内限定を実測してから受入。本人用一人構成でLinux同一UIDの悪意あるprocess隔離は未受入。準備のlibgomp1導入はguest内だけ。OS flash、bootloader、公開domain、課金契約を操作しない。
10. **合格・証拠**: native環境adapterがPC実行APIを呼ばないことをhost試験で確認し、実Pixelで作成/準備/実推論/費用/保存/実process停止を実測する。PC5198停止・Lima停止のまま動き、Sky停止後の実downloadを読戻す。同一source/配布manifest/model/job/boot IDを証拠へ残す。配布物転送とhost25試験の成功だけで実機合格にしない。
11. **先行ブラウザ経路の受入と未決定**: 新しいnative入口は下節と専用証拠で独立して受け入れる。同一Pixelの共有mount、端末内TCP転送、実測4001152KiBのguest、3担当保存、実推論37.696秒/65.540秒、費用表示、703byteの実DownloadとSky終了後の一致読戻し、実在PID/開始時刻/boot IDの確認後の停止を限定受入。[同一配布物の証拠](evidence/sky-private-linux-deployment.json)。本人の内容確認は未実施。初回のSI解釈誤りを残し、一般品質を合格にしない。Terminalのguest再起動後に転送が復帰せずアプリの通常再起動が必要だった。background接続の停止もあり、試験はスリープ防止30分で実施した。常時稼働、熱/電池/性能の受入、全機種の起動、任意モデル/作者コンテナ/複数利用者/全OS/本番料金は別gate。

### PixelのSkyから使う入口（2026-10-19の明示指示）

1. **目的**: 普段はTerminalに入力せず、Skyだけで起動・依頼・成果確認・保存・停止する。本人用の文章作成に限定し、一般公開は保留する。
2. **利用体験**: Skyの「このPixelでAIを使う」→「Skyを起動して準備する」→担当を選んで依頼→下書きを確認→「成果を文章で保存」→Androidの保存先を選ぶ→停止。起動時だけ既存Linuxの通常起動画面を開き、接続確認後に本人が準備通知を押してSkyへ戻る。Androidの背景画面起動制限を回避しない。
3. **責任**: SKY21/O5・ROCKはnative画面と共通job API、EXTERNALはAndroid Terminalの公開Launcherと既存guest、JOINTは同一Pixel一周試験、OWNERは入力、Network許可、保存先、成果の内容確認を担う。旧Android AI担当の受入とは別の経路。
4. **入力・権限**: 本人用debug版だけにprivate Activity・INTERNET・通知権限・localhost用設定を含め、入口もdebuggable時だけ表示する。正式版Shellの通信なし/Binder契約は維持する。private Activityから固定localhost APIだけへ接続。WebView橋渡し、任意URL、汎用shell/root実行は提供しない。Network許可は端末内接続にも必要で、失敗時は自分のアプリ設定への案内を示す。モデルに実行権を渡さない。
5. **出力・状態**: 共通workflowとrevision、重複防止request IDを保持する。「起動しています」「依頼できます」「下書き」「停止」の普通の言葉を使い、通信不能と停止を混同しない。通信断で依頼を自動再送しない。
6. **保存**: 本文はguest本人領域。native側は再送識別用IDと入力hashだけをprivate設定へ保持。保存時はAndroid標準pickerの本人選択URIへ文章を書き、同じURIを読戻して一致を確認する。内容確認は保存と独立した本人操作。
7. **失敗・停止**: 通知の許可を起動時に求め、準備または60秒の起動待ち後にSkyへ戻る本人操作用通知を出す。APIの接続/応答に上限を設ける。失敗や取消で成果を消さない。実行中の仕事とAI全体の停止を共通process照合へ渡す。AI停止はLinux/画面の終了を意味しない。
8. **導入・更新・復旧**: 一度だけ固定systemd unitを既存guestへ登録し、droid本人として固定serverを起動（終了時は回数制限付きで再起動）。再起動後はboot ID/開始時刻を含むmanager lockを照合し、PID番号の再使用をliveと誤認しない。APKは既存署名でデータを残して更新する。Terminalアプリの非公開VM serviceへ外部Intentで介入しない。
9. **資源・承認**: unitはCPU200%、memory2GiB、tasks64、再起動回数/停止時間を制限。モデル/依頼/保存の同意を別々に扱う。端末のスリープ制限、熱/電池、無期限background動作は未受入。OS image、公開domain、契約・課金は変更しない。
10. **合格証拠**: 同一APK・patch・固定server/modelを記録し、Linux停止状態からSky起動、実依頼、実Android picker保存、Sky終了後の同一文章読戻し、実行中の仕事の停止、保存状態の再開を実機で測る。host契約試験、Android unit/lint、全体verifyと実機を分ける。[入口の証拠](evidence/sky-pixel-linux-entry.json)。
11. **未決定**: 全機種、正式署名配布、全損復元、任意モデル/作者コード、常時稼働、品質保証、本番料金は別gate。個別の失敗と再検証を証拠へ残し、試験なしに受入へ昇格させない。

2026-10-21の再接続では、既存APK `cb14c10d…`でLinux内Skyが動作し、Networkと5199転送の許可がONでもAndroid側の待受がない状態を再現した。Sky service再起動と本人による5199のOFF/ONでは復帰せず、実行中0件を確認した後のTerminalプロセス再起動で復帰した。接続不能を仕事停止・未実行と推測せず、同じrequest/jobを照会し、新しいIDで再送しない。実行中/結果不明の仕事がある場合はその照合を先行する。アプリデータ消去は復旧手順にしない。転送状態の根本原因と恒久修正は未完了。

同じAPKで新規の合成依頼一件をnative画面から実行し、Qwen2.5-0.5Bの実推論13,162ms、Android標準picker保存、byte読戻し、AI停止、画面再表示を確認（試験全体33.732秒）。旧18件は変更せず全19件となった。Terminal終了後の独立保存534byteと元exportのSHA256が一致し、次の通常Sky起動26.060秒でも新しいguest boot ID・19件・同じ成果hashを確認した。成果の内容は本人未検収で、旧18件の再実行はない。[同一artifactの再検証](evidence/sky-pixel-linux-entry.json#connectedRecheck20261021)。この試験をEve連携・全OS image・本番課金の受入へ転用しない。

### 共有契約と先行PC Linux経路

1. **目的・利用者**: 本人がSkyでモデルと担当を追加し、必要なLinux環境の準備から依頼、料金確認、成果回収、停止まで一周できる。Hugging Face型の保管・配置・起動の分離を参考に、Skyを共通の入口とし、RQ01〜RQ49を増減しない。一般公開は保留。
2. **利用体験**: 開発用Skyの「自分のLinuxでモデルと担当を使う」→利用条件を確認してモデル追加→環境準備→担当名と役割を追加→料金/保存に同意して依頼→確認待ちの下書き→文章/仕事と担当設定を保存→仕事またはLinux環境を停止。追加と実行は別操作。自作担当は文章用の設定であり、会社運営の自律実行や外部アプリ操作の達成ではない。
3. **責任・権限**: 主担当Sky / MCP、ROCK、SKY14/15/21・BIL02。既存`lib/workflow.ts`のrevision、record/review/complete/cancelを再利用する。OWNERは素材、モデル条件、環境準備、保存と実行を確認。EXTERNALはLima/Debian/llama.cpp/Qwenの配布物・license、JOINTは同一Linuxでの実推論/停止/持出し。モデルにshell、資格情報、Tool実行権を与えず、任意依存installerを受け入れない。
4. **入出力・識別子・上限**: `/__sky/linux`はdevelopment middlewareのみ。同一loopback origin/HostとJSON POSTを照合し、別origin、Originなし、遠隔peer、未知項目を拒否する。実行先は専用Lima `sky-private`、モデルは固定SHA/byte lengthの既存GGUF一候補、runtimeは固定版/公開SHA。担当32、仕事100、役割1200文字、依頼4000文字、受信32KB、成果32KB。UUID仕事IDと入力hashで同じ依頼の重複/内容変更を拒否する。
5. **状態・失敗**: モデル追加、環境準備中、使用可能、準備失敗、Linux停止を区別。仕事はactive→review→本人確認でcompleted、停止はcancelledと停止確認requested/confirmed/unconfirmedを別表示。実行失敗や空の成果を成功にしない。互換性/hash/容量/timeout/本人状態不一致で拒否し、Cloudへ自動切替しない。
6. **保存・保持・削除・backup**: Mac管理側はGit外`work/sky-linux-private/state.json`へ本人OS UID、モデル、担当、元依頼、job/revision、成果と費用をprivate mode/atomic renameで保存。Linuxは専用home配下へmodel/runtimeと最大100仕事の記録を保存し、一時promptは実行後削除。原稿/成果/weights/VM/logはGitへ入れない。モデルとLinux停止は保存済み成果の削除と別。暗号化backup、全損復旧、GUI削除は後続gate。
7. **offline・再試行・不明**: 初回は公式配布物/OS依存libraryの取得に回線が必要。準備後の文章推論はLinux内のCPUで行い、Cloud APIを使わない。依頼受理後に返信が失われても同一request IDで二重起動しない。再起動時のactiveは再実行せず、元Linuxプロセスの停止を照合。停止未確認なら次の実行を拒否する。
8. **更新・互換・復旧**: runtime-lockでLinux aarch64版、配布archive SHA/byte lengthとmodel SHA/byte lengthを固定。準備で公式archiveを検証して配置し、各推論前にmodelとruntimeファイルhashを再照合する。担当は内容hashで不変の版、同内容追加は再利用。実行中の環境再準備は拒否。既存colima/Android/QEMU原本を上書きせず、Pixelのsi社員をLinux移行済みとしない。VM/配布版の汎用rollbackは未受入。
9. **安全・費用・公開**: 専用VMは2CPU/4GiB/16GiB、host directory mountなし。固定の文章推論のみで外部作者コード隔離の受入とは別。子プロセスgroupを仕事に結び、Linux boot ID/PID/start時刻を照合してTERM→KILL、実停止確認後だけ停止済みとする。CPU170秒/実時間180秒、ファイル出力/descriptor制限、core dump無効。自作担当代/Cloud使用量は0、電気/機器費未計測、月額未確定と明記。環境準備は無料配布物取得であり、有料Cloud/契約/請求は開始しない。`avoado.si`は総合/Sky入口、Mini/Proドメインは案内のみで、私的画面や保存先を公開domainへ配備しない。
10. **合格・証拠**: host境界/共有workflow/二重送信/停止競合/再起動を`tests/sky-linux-local.test.mjs`、type/lint/design/baseline/full verifyと実browserで検証する。同じ専用Linuxで追加/環境準備/実モデル/料金表示/成果保存/実停止/VM停止後の読戻しを測り、`docs/evidence/sky-private-linux-deployment.json`へsource/hashと非対象を要約する。host fixtureをLinux実推論へ換算しない。
11. **未決定と決め方**: 任意model/CPU-GPU互換、任意コード/コンテナ、ネイティブLinux管理host、Cloudの自動配備、月額/標準枠/超過単価/GPU待機/保存料金、正式署名、実機OS、支援契約は未受入。各adapterに同一候補の導入・実行・料金上限・停止・回収・復旧証拠が揃った後に有効化する。価格はOWNER/BIL02で原価と契約を確認して決定し、この0円local fixtureから本番料金を推定しない。

<a id="sky-plain-language"></a>
## Sky全体の共通ルール: 普通の言葉で、成果と次の操作がわかる

<a id="sky-user-first-flow"></a>
### 依頼から成果までを中心にする画面

2026-10-19、利用者は「機能を並べるだけで、まとめられる所や便利にできる所が残っている」と指摘し、ユーザー目線での整理を求めた。SKY12 / ROCKの継続改善として、Sky全体の共通ルールを更新する。一般公開は保留。

1. **目的**: 内部の機能構成を覚えず、やりたいことを依頼し、進み具合と成果を同じ場所で扱えること。
2. **体験**: 依頼を書く→必要な実行準備→料金・保存の確認→依頼→作業中の停止→下書き確認→保存。状態ごとの主操作を一つにする。起動で勝手に依頼を送らない。
3. **責任**: Product / UX・SKY12のROCKが構造、文言、焦点、状態と操作の対応を担う。EXTERNALのモデル/Androidは既存契約、JOINTの実行一周は別証拠、OWNERが入力・実行同意・成果の確認を担う。
4. **入力**: 最初に依頼欄を置く。担当は既存候補から選べ、モデル/接続/作者向けの細かな項目は必要時に開く。条件不足なら該当設定へ案内し、入力を書き直させない。
5. **出力・状態**: 作業中は進み具合と停止を中心に表示し、停止要求中/未確認でも新しい依頼を許可しない。下書きでは文章・保存・本人確認を優先。過去の仕事は短い一覧から必要なものを開き、全件全文を積まない。架空の進捗率は表示しない。
6. **保存**: 元の依頼/成果・共通job/revisionを維持し、見た目の変更で本人確認や保存済みを作らない。選択した担当は端末内設定に保持し、再送ID/入力hashは既存方式を使う。持出しは既存のAndroid保存先選択と読戻し。
7. **失敗**: 入力と保存済み成果を残し、次に開く場所を示す。通信不能を処理完了や停止済みと表示しない。Cloud/有料への自動切替を行わない。
8. **復旧・互換**: 新しい台帳や実行APIは作らず、既存の共通workflow/固定localhost接続を再利用。元のAPKと受入時のsource snapshotを保存し、旧版の実行受入を新しい画面の合格に転用しない。
9. **承認・費用**: 実行先とクラウド使用料は実行前に読める位置、電気代/機器代の未計測表示と明示同意を保つ。停止、費用、外部送信の条件を設定内へ隠さない。モデルの出力を本人承認へ昇格しない。
10. **確認**: 最初の適用はPixelのSky入口と端末内依頼/成果画面。既存ShellUiの色・余白・文字・操作面を再利用し、狭い画面で主操作まで到達できるかを見る。buildと表示確認、自動試験、実推論の一周、本人による使いやすさの評価を別々に記録する。
11. **残り**: Webや他端末の全画面移行、実ユーザーの初見成功率/操作時間、変更後UIでの実行一周は別の確認。今回の新UIは本人用試用で、全面受入や一般公開としない。

2026-10-19のRockstarOSフロント変更では、Skyをカテゴリ・意図検索・カード棚から見つける共通操作へ接続し、WebのSky画面/ダイアログとPixel Shellにも明るい面・丸い操作領域を適用する。カードのタップは既存の詳細・接続・依頼画面へ進むだけで、Toolの有効化・実行・購入・費用承認は開始しない。作者、権限、見積、未接続、実行先、仕事、成果と明細の意味は既存契約を保持する。見た目の整合と、実行・保存/復旧・本人理解の合格を別々に記録する。全画面の判断は[RockstarOSの発見型フロント](rockstaros-complete-design.md#全画面の発見型フロント2026-10-19の明示変更)に従う。


2026-10-18、利用者はZoom限定の読みやすさ修正を訂正し、Sky全体の画面・進捗・成果・エラー・持出しファイルへ同じルールを適用するよう明示した。RQ01〜RQ49と本人主導・退出可能性を維持する。主担当はProduct / UXのUXRS01（ROCK）、接続と成果の適用先はSky / MCPの既存系列。一般公開は保留。

1. **目的・利用者**: 開発用語を知らない人が「何をするか・何ができたか・何が残るか・次に何をするか」を理解して仕事を扱えること。Zoom、プランナー、会話、商品一覧、接続、成果、購入・利用額、掲載申請、対応端末への今後の移植に共通適用する。
2. **最初から最後までの体験**: 欲しい機能を選ぶ→使う情報・接続先・費用上限を読む→許可して実行→普通の言葉で進み具合を読む→成果を確認→必要なら停止→手元に保存→Skyなしで読む。難しい用語の説明を読むことを開始条件にしない。
3. **責任と権限**: ROCKが固定の画面文・状態・エラーの表示を管理する。本人の入力、資料、AIの回答、作者の作品やコードを機械的に翻訳・要約して書き換えない。表示処理で認証、仕事状態、本人承認、保存可否、費用、停止の成否を変えない。外部提供元の実行と本人の成果確認は別状態。
4. **入力・出力・番号・上限**: `lib/sky-presentation.ts`が固定文と状態の表示を共通化する。`SkyNotice`、`SkyWorkProgress`、`SkyAppResultView`を使い、説明、現在の状態、次の操作を出す。処理番号・更新番号・照合用の値・JSONは必要な人だけが開く「詳しい記録」へ置く。権限・送信する情報・利用額・破棄するデータは折り畳んで隠さない。入力や成果の文字数上限は変更しない。
5. **状態と失敗**: 作業中、実行待ち、あなたの確認待ち、成果の確認待ち、確認済み、相手側の処理終了、失敗、停止済み、結果不明を区別する。未知の状態は「結果を確認できません」とし、成功や0件へ置換しない。完了率や残り時間は測れている場合にだけ出す。提供元の終了を本人の確認済みと呼ばない。
6. **保存・保持・削除・持出し**: 表示のための保存領域を追加しない。既存の本人別保存と保持期限を維持する。全仕事のHTML持出しでは、できたもの、次にすること、利用額、保存できた範囲を先に表示し、元の記録と照合情報を詳細に残す。文章ファイルも内部番号を先頭へ出さず成果を読めるようにする。未保存・省略・添付除外を見える位置に説明する。
7. **接続切れ・再試行・重複・結果不明**: エラーは原因を断定できる場合だけ説明し、次の安全な操作を添える。通信失敗は「実行されなかった」「停止できた」と断定しない。外部送信や支払いの結果不明時は状態を読み直し、無条件の再実行を案内しない。
8. **互換・更新・復旧**: 内部の状態名、API、仕事の番号、更新競合判定、履歴、成果形式は保持する。見せ方だけを変更し、元の記録から追跡できるようにする。既存の持出しファイルはその時点の形式で読める。新ルールは今後作る画面や端末表示にも適用するが、Web修正をnative端末での実装完了と扱わない。
9. **安全・秘密・公開**: エラーの生の応答、個人情報、パス、認証情報を画面へ流さない。問い合わせ用には既知の確認コードだけを任意表示する。未知の応答は普通の案内へ置換する。利用額の未確認を無料とせず、予算の取り置き・利用額・請求・支払いを分ける。`avoado.si`、`avocadomini.si`、`avocadopro.si`の役割と本人用PC内試作を維持し、今回の修正は配備・一般公開を含まない。
10. **合格条件と証拠**: 共通表示の試験で状態混同、秘密の表示、未知状態の成功化、元の成果の改変を拒否する。Zoom以外の仕事でもHTMLの最初に成果と未完了・費用・持出し範囲が読め、元の各記録のハッシュが一致すること。本人用の画面を操作して作成→実行→確認→停止、未接続時の案内を確認し、`npm run verify`を実行する。試験用文章の合格を実提供元・課金・全端末の合格へ拡張しない。
11. **残る判断**: 多言語化、実ユーザーによる理解度、読み上げや各端末表示は別に確認する。文章を簡単にしただけで「誰でも理解できた」と実証したことにはしない。新しい専門用語が必要なときは、担当が用途と操作を普通の言葉で説明し、本人が理解して選べるか試してから採用する。

Pixel 10の既存OSアプリは、同じ状態fixture、実2 Tool、本人確認済みへの操作、文章保存、停止を同一候補で実機確認した。[同一APKの証拠と実装場所](evidence/sky-device-plain-language.json)。他の機種・言語・利用者の理解度と全OS受入は別に確認する。一般公開は保留。

<a id="sky-foundation"></a>
## Sky共通基盤とRockstarOSの端末実行環境

現行の明示指示（2026-10-20）: **RockstarOSが大元で、その中にSky・Eve・Linux実行環境がある。** Skyの共通request/result/job契約をOS内の接続基盤として再利用し、EveやZoom/Planner等の応用へ結ぶ。既存Broker、本人・利用権、workflow、保存、usage、権限強制を保持する。2026-10-18のSkyを大元とする説明は、今回の本人訂正に従う。

- **目的**: Agent/Tool、本人、接続、仕事、成果、費用、保存/退出の共通契約をSkyに集約し、アプリや端末ごとに別の仕事状態を作らない。SIM/eSIMは開始/利用権の入口、Zemaは管理面、Walletは費用/検証済み精算。
- **利用体験**: Zoomのメモ整理、Plannerのタスク準備を同じSky仕事として作成→実行→review→本人確認、または停止する。Plannerへ返した成果はさらにPlanner本人確認待ちで、外部作業/計画達成へ自動昇格しない。RockstarOS搭載機では同じ契約を機種の入出力へ結ぶ。
- **責任**: SKY14/15/21のROCKが共通request/result/workflowとadapter、本人別API、私的受渡しを担当。OSは端末資格、capability、Broker、実行隔離、保存/復旧、機種適合を強制する。EXTERNALはOS API/Zoom/Provider/hosting、JOINTは同一app/機器での縦断受入、OWNERはscope/素材/採用/費用/公開条件を決める。model出力や署名を実行許可にしない。
- **入力**: `sky.app-request/1`: appId(zoom/planner)、sourceId、sourceRevision、title/objective、最大6000文字/120行の素材、Zoomは制限付きrecipe。未知field、任意code/endpoint、他appのrecipe、無言の切捨てを拒否。Planner旧handoffのfingerprintはSHA-256でsourceRevisionへ結ぶ。
- **出力**: `sky.app-result/1`: 同一job ID/app/source ID/sourceRevision、`meeting.notes`または`task.preparation`、body、`provisional:true`、`bounded-text-adapter`。現在のPlanner処理は依頼を整理した準備メモで、LLM/調査/実作業の成功ではない。外部返却は本人の別操作。
- **状態**: 既存`lib/workflow.ts`と`WorkStore`を使うhidden `sky-app` job。create→active→adapterがextract/validateを記録してrevision2/review→本人confirmでrevision3/completed。active/review→cancelledでは成果を破棄する。public仕事作成/recordではこの実行を偽装できず、専用APIの既知adapterが生成する。競合更新/CAS失敗は遅延成果を返さない。
- **保存**: ①Zoom/Plannerの単独Labはtab memory。②cross-originのローカルPlanner受渡しは開発サーバーmemoryだけ、10分/最大20件、再起動で失う。③本人用`/api/sky/app-work`は明示保存同意後に既存owner別`work_jobs`へ素材/recipe/成果/履歴を保存。新DBを作らない。成果画面と本人exportの`sky-app.json`/Markdown/HTMLで回収できる。認証secret/旧承認は移さない。
- **失敗**: 入力/型/元taskの版違い、本人外/unknown source、期限、容量上限、30秒超過、停止/同時更新を拒否。登録LLMや外部操作へ暗黙fallbackしない。ブラウザーCOOP `same-origin`は維持する。別originのopenerが切れた実測により、Plannerは短命256bit受渡しIDを用いるローカル窓口へ変更した。
- **復旧**: 共通job/revisionで再読込し、APIの同一commandId再送は二重実行/二重採用を防ぐ。明示停止後に遅れて計算された成果をdiscardする。ローカル受渡しのIDは初回fragmentで渡して直ちに消し、その後は専用header/POSTだけで使う。素材/成果をURLに載せない。channel expiry/開発サーバー再起動ではPlannerからやり直す。外部反映前に元task fingerprintと未完了/未採用を再検査する。
- **承認/公開**: 両Labと`/api/sky/app-lab`はdevelopment+loopbackのみ。本番は404。窓口はcredentialなし・固定loopback originだけのCORSで、cookieや本番本人資格を共有しない。本人用永続APIは`SKY_APP_WORK_PRIVATE_OWNERS`に明示した既存認証ownerだけ、未設定/対象外は404、本人A/Bは既存auth/Originで分離する。UI保存は任意で、未設定を接続済みに見せない。一般公開/DNS/本番環境変数の設定/実機操作は行わない。
- **合格/未決定**: Zoom/Planner同じ契約、元task/版/owner違い拒否、停止と遅延結果の競合、private default閉鎖、再送/再起動/持出し、COOP保持下のPlanner→Sky→本人確認→元タスク確認待ちを合成入力で測る。`tests/sky-app*.test.mjs`、既存Zoom/export試験、Worker/D1 API、実browser、design/baseline/verifyで証拠を残す。OS/native/Pixel/Mini/Proの実行は機種別gateで後続受入、同一binary/本番Provider/実Zoom/本番SSO/一般公開の合格へ転用しない。

<a id="sky-user-freedom"></a>

**最新の開発・共有方針**: 本人主導・退出可能性を主軸とし、ユーザーが欲しい機能を自作Agentにして対応ソフトウェアへAddする応用層を進める。一般ローンチは利用者指示により保留。[米国・スペイン・日本・韓国への共有準備と未実証の人への接続研究目標](sky-launch-design.md#sky-private-review)は、ソフトウェア受入と別に管理する。

## Skyの本人主導・退出可能性 — 人を自由にする側の設計（2026-10-18）

**決定理由・目的**: 利用者は「Skyを人を自由にする側にし、Sky自体にも閉じ込められないようにしたい」と明示した。Skyは本人が望むことを実行できる力と、望まないことを拒否できる力を増やす。AgentをAddする接続層に、交換・停止・切断・本人データ回収・乗換え・退会を対の契約として置く。RQ01・RQ02・RQ04・RQ08・RQ18・RQ22・RQ24を具体化する追加方針で、RQ01〜RQ49を増減しない。以下は設計要求であり、runtime受入済みの表示ではない。

### 本人が選べる体験

- **選ぶ・交換する**: 用途、作者/版、実行先、送信データ、費用、持出せる成果形式、依存サービスを同じ候補画面で確認する。適合する別Agent、別Provider、対応ローカル実行を選べる設計とする。推薦理由、広告・販売上の利害、並び順の条件を示し、本人が推薦を解除して検索できる。未対応先は理由を示し、架空の代替先を提示しない。
- **見える・断れる**: 提案、引用元、推定、実操作、費用を区別する。送信先・scope・上限・保存先・停止条件を承認前に示す。閲覧やAddを外部送信/有料実行の同意にせず、拒否後も別候補や手作業へ戻れる。
- **止める・切る**: Agent単位、接続先単位、Sky全体の新規実行を止める入口を用意し、Cloud継続/定期実行も対象を明示する。停止要求、Rock側dispatch禁止、Provider停止確認、接続失効を別表示する。接続解除と保存済み成果の削除を別操作にする。
- **回収する・出る**: 仕事と設定にデータ持出し、接続解除、契約終了、アカウント削除の入口を設け、各作用と期限を示す。取得済み成果はSkyへの再ログインなしで一般viewerから読める形式へ回収する。回収のための新しい有料Agent購入や再契約を強制しない。移行先への送信、再実行、新契約は本人が別に選ぶ。

### 責任・権限・プライバシー

主担当はSky / MCPの`ROCK`。既存SKY07のConnector、SKY14の仕事制御、SKY15のSDK、SKY21の独立Sky受入、AI02の端末内モデル、BIL02の契約/請求へ接続する。ROCKは本人認証、scope、データ最小化、dispatch禁止、持出し/削除の記録とUIを担う。`EXTERNAL`はProviderの停止/失効API、保持条件、成果license、移行形式を提供し、`JOINT`で実接続と別client取込みを受け入れる。`OWNER`は持出し範囲、移行先、接続解除、契約終了/削除を選ぶ。

モデル出力は本人承認にならず、Skyも意思を推測して権限を広げない。Brokerは既存の本人・scope・予算上限を強制する。接続仕様・データ形式・互換readerの仕様は参照可能にし、本人データの公開範囲は本人が決める。学習/広告/販売への二次利用や端末外送信を基本利用の暗黙条件にしない。本人が選んだ記憶・設定も回収/削除対象とする。作者のsource、商品、model weightsの公開/再配布licenseを一律変更せず、本人が保有または持出しを許諾されたデータを対象にする。

### 入出力・保存・持出し契約

入力は認証済み本人、対象job/成果/接続、revision、データ範囲、移行先、処理種別、request ID。既存`lib/workflow.ts`、委任/成果store、Connector、usage/receipt、retentionを再利用する。持出し/移行/削除には別の操作記録を設け、既存jobを勝手に完了へ進めない。

出力は版付きmanifest、UTF-8 JSONの仕事/設定/履歴・usage/receipt、Markdownまたはtextの閲覧用要約、許諾された元の成果ファイルを候補とする。manifestにはschema版、snapshot時刻、対象ID/revision、件数、各fileの型/size/hash、出典・作者/Tool/モデル版、license、期限、欠損/省略理由、機能互換表を含める。原文非保存や期限切れの情報を生成して完全な回収に見せかけない。

OAuth token、秘密鍵、session cookie、復旧秘密、実行承認token、他人のデータはexportしない。個人情報を含むarchiveの保存先は本人が選び、一時archiveはprivate保存・期限・削除記録を持つ。公開URL/外部registryへ自動掲載しない。大容量は上限を事前表示して分割・再開し、一覧取得とfile取得完了を区別する。再試行は同じrequest ID/snapshotへ戻り、既存のretention（CSVの取得期限7日等）を無断延長しない。

### 状態・失敗・乗換え・復旧

以下は今後の操作記録の設計状態であり、現行workflowのenumではない。

- **持出し**: `requested → preparing → ready / partial / failed → expired`。対象revisionを固定し、その後の変更は差分として報告する。不足、容量超過、通信断、期限切れを明示し、完全性未確認のarchiveを`ready`にしない。再開と新snapshot作成を分ける。
- **乗換え**: 形式/意味/版/license照合→互換性preview→移行先の本人認証→scope/費用の新規同意→取込み確認。importは非信頼データとして型/hash/容量を検査し、scriptやAgent指示を実行しない。旧owner IDを新環境の認証にせず、本人が所有者を結び直す。旧承認、secret、購入権、実行中jobを実行許可へ移さず、二重実行を防ぐ。非互換項目は元fileと読取り用要約を残し、成功扱いしない。
- **停止・退出**: `exit_requested → dispatch_blocked → reconciling → recovery_available → account_closed`を候補とする。新規/予約/定期dispatchを止め、既存委任の停止/失効を要求し、receipt・usage・予約額を照合する。応答がなければ結果不明として残し、停止成功・未請求・返金済みと表示しない。同じjob/request IDで照合し、危険な再送や新規dispatch再開をしない。
- **削除・backup復元**: 退会、契約終了、データ削除、Provider削除、backup保持を別記録にする。回収前の削除は消える対象を本人に示す。法令/契約上必要な最小の請求・異議・監査記録は目的、期限、閲覧者、削除予定を示し、通常のAgent入力や学習へ再利用しない。Provider未確認/backup期限待ちは削除完了にしない。復元時は削除/失効記録を先に適用し、データや接続を復活させない。

Sky障害時にも取得済みarchiveをSky通信/sessionなしで読める形を受け入れる。ローカルTool/モデルは機種・license・利用権が適合する場合に使い、offline不可の処理を示す。別Provider、端末外送信、追加費用へ無断fallbackしない。別環境での再実行は互換性・新規承認・利用権の別受入を要する。

移行は元データを保持した読取り専用snapshotから始め、未知のschema版は安全に拒否する。取込み中断/競合時は移行先で追加したデータだけを識別して取消・再開し、元の成果や履歴を上書きしない。既に成立した外部作用/課金をデータrollbackで取り消した扱いにしない。契約終了の効力、データ回収、Providerの未確定照合は並行して扱い、停止応答待ちを理由に本人の解約/回収を無期限に保留しない。残る照合は最小の監査記録で続け、アカウントを閉じた後も新規実行権を復活させない。

### 契約終了・料金・端末の境界

eSIM起点のnative SI版は、既存方針どおり終了後の新規Cloud/Agent dispatchとRockstar管理下のモデル起動を制限する。単独Sky Web/PWA、通信契約、商品購入権、成果回収、アカウント削除を同一状態へまとめない。未払い/利用権失効中も、保存期限内の本人データ・請求記録の回収、異議、解約の専用経路を本人認証で使える設計にする。有料実行権を再付与せず、既存の認証/復旧を弱めない。

電話・緊急連絡、OS基礎機能、本人所有fileを契約回収のために壊さない。既存月額、Marketplace手数料、利用済みusage精算、第三者実費、作者licenseを別扱いとし、退出を新規課金/無制限保存の同意にしない。回収期間・データ別期限を契約前/終了前に示し、再契約への誘導で回収を妨げない。

### 最初の実装: 選択した仕事の持出しと独立閲覧

受入の現在地: [host/fixtureの証拠とsource hash](evidence/sky-owner-export-local.json)。集中17件、ローカルWorker/D1のAPI1218項目、CSV113項目、全体verifyは合格。API取得HTMLの独立parserで6 fileのsize/hashとscript/外部参照なしを確認した。実ブラウザでのfile閲覧はツールのfile:// policyで未実施。SF03/04の包括合格、実機・本番受入へ転用しない。

`/sky/outputs`と大学別の同じ成果画面に「この仕事を持ち出す」を設ける。`GET /api/sky/exports/{jobId}?revision={revision}`は既存本人認証とowner別storeで一件だけを読み、job記録/履歴、保存済みA2A text成果、保存を選んだCloud AI回答、予算/予約/確定usage要約を自己完結HTMLへまとめる。`lib/sky-owner-export.ts`は`sky.owner-work-export/1` manifest、scope、snapshot日時、file型/size/SHA-256、欠損、元成果のhash/作者/版を出力する。JSON/Markdownのfile欄は本文をUTF-8/LFへ戻して読取り・照合できる。HTMLはscript/外部resourceを持たず、CSPとtext escapingを施し、Sky稼働/sessionなしで一般browserから読める。

持出しは既存workflowの読取り操作で、job状態/予約/承認を変更しない。`RemoteAiTextStore.listForExport`は履歴画面用の期限更新を行わない専用read。ownerは要求の値で指定できず、paid実行資格を追加条件にしない。前後のjob/委任/成果/usageを照合し、revision競合は409、復号/完全性不明は503、件数/容量超過は413としてfileを作らない。二利用者、別Origin、cross-site、追加queryを拒否する。再試行は同じjob/revisionの再読取りで、永続snapshotの再開/全account分割exportは後続。

最初の上限は既存親job当たり委任8件、Cloud記録50件、成果は委任当たり32件未満、file本文合計2 MiB、HTML全体12 MiB。上限を超えた場合に先頭だけを成功扱いしない。CSV元file、非text添付、保存しなかった/期限切れ回答、端末内履歴/設定/記憶、商品本体、署名usage receipt原文は対象外とmanifest/UIへ示す。保存時のtext省略・添付省略・usage不明は`partial`。secret/session/実行承認/他人のデータを構造化exportへ入れず、本人が本文に書いた機微情報は私有fileとして本人が保存/共有先を管理する。hashは転送整合の照合用で、第三者署名・内容の正しさ・仕事成功を保証しない。一般account削除/契約終了後の認証復旧、別client import、native実機、本番はこの一件readの完成へ含めない。

### 合格条件と証拠（段階別に受入）

既存task内の受入ID `SF01`〜`SF08`を使い、host/fixture、Provider sandbox、独立client、実機、本番を分ける。文書検査の合格をruntime合格にしない。

1. **SF01 選択・拒否**: 候補の実行先/データ/費用/推薦理由・利害/持出し形式を確認できる。拒否・推薦解除後に別候補/手作業へ戻れ、無断dispatch/請求/送信が0件。
2. **SF02 停止・失効**: queued/running/offline継続/定期実行で新規dispatch拒否とProvider停止確認を別に証明する。timeout/重複/再起動でも権限が復活せず、未確認作用/費用を未確認として保持する。
3. **SF03 本人回収**: 本人A/B、失効、欠損、容量超過、通信断、期限切れで越境取得/secret混入/完全性偽装を拒否。manifestと元file・usageの件数/版/hashが一致し、失敗から再開できる。
4. **SF04 Skyなしの閲覧**: 取得済みarchiveを一般viewerで開き、Sky通信/ログインなしで代表成果・履歴・使用額を読める。独立clientの取込みは別に受入し、非互換/欠損を表示する。
5. **SF05 安全な乗換え**: 別Agent/Providerと対応ローカル経路を個別に受入。旧承認/旧owner ID再利用、不正archive、revision競合、二重外部作用を拒否し、未受入先は非対応と示す。
6. **SF06 終了・退会**: 保存期限内の本人回収がeSIM失効/有料資格終了/未払い制限中も再契約なしで可能。有料実行を再開せず、最終usage/未確認額/予約/取消/異議を分け、基礎端末機能を保つ。fixtureを実eSIM/実請求の合格へ転用しない。
7. **SF07 最小化・削除**: 二次利用/外部送信を拒否した範囲で利用できる。Provider残存/backup期限/法令契約保持を表示し、再試行やbackup復元で削除済みデータ/失効接続が復活しない。
8. **SF08 障害・退出負担**: Sky停止中のarchive閲覧、offline下書き、失効/移行失敗からの回収を確認する。持出し/停止/解約の操作数、時間、欠損、再試行を同じ版で測り、入口の隠蔽、理由のない拒否、再契約強制がないことを操作で検収する。計測前に成功率や自由の実現を宣言しない。

**未決定の決め方・実装順**: ROCKは既存成果API、workflow/委任、Connector失効、usage/receipt、データ別retentionを棚卸しする。先行dirty差分を保全しmainの引継ぎ入口/migrationを同期後、SKY21で代表一件の持出しとSkyなしの閲覧（SF03/04）を先行実装する。次にSKY07/14の停止/失効、BIL02の終了後回収、SKY15の互換reader/adapterによる別client取込みへ進む。archive容量/生成期限/再開粒度/schema移行、終了後回収期間、Provider停止保証、backup保持はfixture・容量計測・Provider契約・Securityレビューで決め、OWNERが公開条件を確定する。未決定値で削除/本番運用を始めず、結果を本節と進捗JSONへ戻す。検証は`npm run project:update`、`npm run baseline:check`、`npm run design:check`、`npm run verify`。最初の一件持出しは`tests/sky-owner-export.test.mjs`、`tests/sky-owner-export-store.test.mjs`、`scripts/check-work-api.mjs`で検証し、一般browserで保存fileを開いて通信/sessionなしの閲覧を確認する。全account分割回収、別client取込み、終了後認証復旧など残るSF試験は後続で、文書保存だけで合格にしない。

<a id="sky-private-zoom-lab"></a>
## Zoom本人用Agent Lab — 制限付きrecipeの作成から停止

製品の共通入口は`avoado.si`（総合/Sky）、`avocadomini.si`（Mini）、`avocadopro.si`（Pro）。利用者は総合domainの綴りを明示再確認済み。`lib/product-domains.ts`を使い、Labと接続画面から製品サイトへ明示リンクする。Lab自体はlocalhost限定、成果や本人情報をURLに載せない。新domainの公開配備/SSOは未受入。[Web責任と配備境界](workstreams/05-web-pwa-sites.md)。

- **目的**: 本人がZoom会議後に欲しい処理をAgentの設定として作り、Add/実行/確認/停止を自分で試す。一般公開は保留する。
- **利用体験**: `npm run dev -- --host 127.0.0.1`→`http://localhost:3000/sky/add/zoom/lab`。目的/名前/出力/見出しを入力→作成→読む情報/出力先/費用を確認しチェック→このLabにAdd→手入力メモで実行→成果を確認済みにする。実行中と確認待ちに停止可能。設定変更/取外しは停止とAdd解除。再実行は新job。
- **責任**: SKY14/15/21のROCKが画面、制限付きparser、workflow、停止、持出しを担当。EXTERNALのOS/Zoom APIとJOINTの実Zoom受入は未接続、OWNERがテスト素材とAddを選ぶ。認証済みowner sessionを偽装せず、一つのローカルtabだけを処理単位にする。
- **入力**: `sky.private-zoom-recipe/1`（名前80/目的240文字、概要/決定/担当の選択、先頭1〜5行、異なる見出し各24文字）。メモ6000文字/120行。未知field/任意code/endpoint/scope追加は拒否。目的文は説明であり実行promptではない。
- **出力**: `sky.private-zoom-result/1`と同一job ID、recipe snapshot、`browser-private-manual-text`。概要は先頭行の抜粋、決定/担当は見出し完全一致のコロン後だけ抽出。推論/意味要約はしない。設定JSON再読込み、成果Markdown/履歴JSON持出しは明示操作。設定はSDK Package/署名/Registry承認ではない。
- **状態**: form→created→本人チェック→added。仕事は`lib/workflow.ts`の専用tab-local constructorと共通`applyWorkCommand`を使いactive→review→completed、active/review→cancelled。revision競合と終端後の更新を拒否。専用templateはpublic `createWorkJob`に追加せず、API/DBの仕事へ昇格させない。
- **保存**: 設定/素材/成果/履歴はtab memoryのみ。サーバー、localStorage、cookieに書かない。再読込み/終了で消える。過去10件はjob ID/名前/状態だけ、本文/成果は再実行・編集前に持ち出す。本人account/Zema永続保存は後続gate。
- **失敗**: 空/過大素材・不正recipeを拒否、無言の切捨てをしない。30秒上限を各処理区切りで検査し、停止してerrorを表示。未知のOS/Zoom操作やネットワーク実行へfallbackしない。HTMLはReact textとして表示。
- **復旧**: AbortControllerと実行ごとの参照を用い、停止/取外し/編集/消去/unmount後の遅延成果を抑止。停止時に成果を破棄し、再実行は別ID。出力済みfileの取消はできない。reload後は自分の設定JSONを読み、改めてAddを確認する。
- **承認**: production/testは404、developmentでもHostがlocalhost/127.0.0.1/[::1]だけ。noindex。これは本番認証の代用ではない。実行費用0・手入力だけ・私的表示の確認をAdd前に行う。Zoom permission、OS Accessibility/Screen Recording、外部送信、有料実行、公開/政府送付を付与しない。
- **合格条件/未決定**: recipe差異が成果を変える、Add前は実行不可、形式検査後にreview、本人確認後だけcompleted、途中/確認待ち停止、終端更新拒否、遅延result拒否、取外し/編集時のAdd解除、設定/成果持出しと再読込み、production404を受入。`tests/sky-private-zoom-lab.test.mjs`、実browser、typecheck/lint/design/verifyで記録する。実Zoomの対象画面と操作は本人選択後、既存端末Agent/Broker/本人DBへ結ぶ別受入として決める。

<a id="sky-zoom-local-runtime"></a>
## 実Zoomの本人用読取と作業別ローカルLLM選定

変更理由: 2026-10-18の本人指示「実際のZoomで作成/Add/実行/成果/停止を試す」「GPT必須にしない」「ログイン不要のLLMからSkyが作業に適した候補を厳選」。一般公開保留、既存SIM/eSIM契約・Cloud料金・RQ01〜49を維持する。

- **目的/利用者**: 本人のMac上のZoomに外部補助AgentをAddし、表示中の文章を私的な会議メモにする。Zoom内の新規ボタン設置や会議参加を自動で実現する機能とは分ける。
- **利用体験**: developmentのloopback `http://localhost:3000/sky/add/zoom/device` → 名前/目的を作成 → Skyが導入済みモデルを合成試験 → 推奨理由を確認（合格候補への変更可能） → 開いているZoom画面を本人選択 → 15分の接続へAdd → 別の読取確認 → 表示文章preview → 選定モデルで実行 → review → 本人確認completed → Markdown/JSON回収または「Skyなしで読めるHTMLを準備」→明示保存→停止/取外し→保存ファイルを別アプリで読戻し。手入力Labは独立して残す。
- **責任/権限**: SKY14/15/21 / ROCKが選定、対象固定、期限、型検査、共通workflow、停止を実装。OSがAccessibilityを強制し、EXTERNALはZoomのAX情報とOllama/model、JOINTは版別字幕/Chatの表示品質と実会議の受入、OWNERがmodel/license・対象・資料利用・OS許可を判断。model出力は文章だけであり、Tool承認・任意shell/root・送信・支払い・OS権限を持たない。既存DecisionRouterのpreflight/Broker境界は変更しない。
- **入力/ID/上限**: 既存recipeの名前80/目的240/出力/見出しを使う。固定Zoom bundle `us.zoom.xos`、PIDとhelperプロセス内に保持した同一AXUIElementへ結び、title一致だけで対象同一とはしない。表示枠と交差するstatic textと、Zoom 7.1.9の送信済みchat cell（`ZMTextMessageCellView`）内の非編集`AXUnknown` descriptionを読む。後者は本文の改行を保持し、同一windowの枠内だけを対象とする。入力欄/secure欄/TextArea/ComboBoxの走査は除外し、任意のdescriptionを収集しない。最大2000要素/深さ16/8秒、本文6000文字/120行、過大時は拒否。画像/録音は取得しない。captureから2分以内、sourceRevisionは実本文SHA-256、sourceIdはZoom PID/index。接続はCSPRNG256bitのメモリ内capability、URLに載せない。
- **model選定**: `lib/sky-model-selector.ts`は作業種別ごとの合成fixture、digest/版、context、local性、推定RAM、品質・速度・容量を扱う。現接続は会議メモのみで、翻訳/code/planningのfixture定義は未接続。Ollama固定loopback `127.0.0.1:11434`の導入済み一覧/showを読み、remote/cloud、不明format、文章生成非対応、context<8192、推定weights×1.5+1.5GB>端末RAM25%を除外。最大20件を調査し、適合した小容量順3候補を1回に実測。suite v2では要約をLLM、指定見出しの決定・担当をコードで処理する同じ組合せを合成3問で検査する。modelの決定/担当欄は採用せず、未決定と引用内命令を含む試験で、全問JSON/品質95以上の候補を品質80%・時間15%・容量5%で順位付ける。実メモは比較へ送らない。これは限定fixtureによる推薦で、全世界の最適・日本語の総合品質・実RAM/熱の証明ではない。結果はtask/suite/model digest/1時間へ固定し、再実行前に導入モデルを照合。メモリ予算は正のsafe-integer byte、contextはsafe-integer token、local/completionは真のbooleanだけを採用する。予算が未観測/NaN/無限/文字列なら候補を通さず、現在時刻と観測時刻も非負safe-integerとして期限を照合する。実会議で目的文を要約してしまう不具合を再現したため、実測fixtureと同じくuser messageは取得本文だけとする。目的文は共通jobへ保持し、要約行数はコードで上限を適用する。Cloud fallback、model download、API key、Sky/LLM accountログインはない。利用者のモデルlicense確認は別に必要。このMac版はCPU（num_gpu:0）を使い、候補比較後に当該modelのcacheを解放する。25%は推定予算であり実メモリ予約・電力/熱制御ではない。
- **出力/状態**: `sky.app-result/1.execution=local-llm`とmodel名/digest/task/suite、型付きnotes、provisionalを既存jobへ保存。目的に沿った文章下書きで、会議の事実は本人検収する。作業は`lib/workflow.ts`でactive→review rev2→completed rev3、active/review→cancelled。run二重送信は既存jobを返すstate読戻しを使い、無条件の再推論をしない。確認はTool/Chatへの投稿許可にはならない。
- **持出し/オフライン読戻し**: 2026-10-18の本人指示により既存`buildSkyOwnerExport`をZoomへ再利用する。review/completedの状態を正確に残し、HTML一つに成果Markdown、元のSky request/result、仕事履歴、利用額の未確認表示、UTF-8 hash/byte一覧を格納。2MiBの素材上限と既存CSP（script/外部通信なし）、escape/許可fieldを維持する。本人の「みんなが分かる形」という訂正により、最初に決まったこと・担当・原文で明示された未定事項を普通の日本語で表示する。ID/model/hash/JSON等の記録は「元のメモと詳しい記録」へ折り畳み、機械向けfileは改変せず残す。HTML準備は端末内だけで、本人が保存linkを押す。object URLはjob/revisionの変更、タブ終了で失効し、自動uploadや本番DB保存はしない。失敗時は元のjob/成果を保持し再試行。合格は保存バイト/hashと、Skyを終了した別アプリで同じ成果/素材を読めること。実会議の合格には同じ会議の原文との照合が必要。
- **保存/保持/削除/backup**: タブと端末開発サーバーのメモリだけ。D1/本番account/Registryへ昇格しない。短命capability/本文はGit・URL・ログに保存しない。成果確認後だけ本人がMarkdown/素材を含むJSONを回収。stopでcaptureを消去し、job素材/確認済み成果/停止記録は最大接続期限まで保持、期限/サーバー終了で破棄。Ollama側のログ/キャッシュはその設定に従う。試験時の原稿はGitへ置かない。
- **offline/再送/不明**: model導入済みならloopbackのみで処理。外部networkへfallbackしない。stateで同じcapabilityの仕事を読戻し、active不明時に二重実行せず停止して新Add。model未導入/不適合/試験不合格/timeout/出力不正を具体的に示す。停止競合では遅延resultを記録しない。
- **更新/復旧**: server/helper再起動・OS許可失効・対象閉鎖/変更・期限切れで接続失効、再Add/再読取/再測定。helperはprivate temp directoryに現在sourceをcompile、終了時削除。元の研究probeは変更せず、任意CLIを共通APIへ公開しない。モデル版変更で過去計測を無効化する。
- **安全/承認**: Vite `serve` middlewareのみ。socket loopback・Origin/Host/port完全一致・JSON POST・no-store、CORSなし。pageはproduction/test404、一般ドメインには置かない。macOS Accessibilityの新規許可は本人がOSで実行。Addと読取とrunを別操作にし、Screen Recording/マイク/カメラ/Chat送信は付与しない。client abort/stop/期限/closeでhelper/推論へ中断を要求し、遅延成果を捨てる。GPU停止の物理完了はOllama応答に依存する。
- **合格/未決定**: pure選定fixture・local runtime fixtureで品質/remote/期限/同一job/確認/取消/遅延拒否、production404、Swift型検査、実browserを実施する。実モデル計測と実Zoom読取は証拠を別記し、fixtureやlogin画面だけで実会議受入としない。model比較候補拡張、RAM/熱/電池実測、品質suite改善、正式署名helper配布、二利用者、Zoom版別字幕/Chat、OS権限失効、実会議の一往復はJOINT/OWNERの次の試験。一般公開はこの合格で自動解除しない。

<a id="sky-add-agent-ecosystem"></a>

## Sky Add：実用Agentを作る・追加する・成果を受け取る（2026-10-18）

2026-10-18追加指示: オフィシャルの既存Agentを探す経路に加え、候補がない時に欲しい機能から既存SDK/Studioで雛形を作る作者導線を優先する。Zoomは代表host。本人の例示入力と期待成果→制限付き試作→入力/出力/scope/費用/作者版/停止条件の宣言→sandbox検査→本人同意→Addを分け、生成しただけの任意コードを実行許可へ昇格させない。現在のZoomパネルは手入力fixtureの固定Agentで、ユーザー作成AgentのRegistry登録→Zema実行→実Zoom返却は後続の受入対象。

Addの設計・審査・受入には[本人主導・退出可能性](#sky-user-freedom)を適用し、交換・停止・失効・持出し・退出の条件をAdd前に示す。

**目的と対象**: SkyをRockstarOS内だけの一覧から、対応する仕事・アプリ・端末へAgent能力を「Add」する配布・接続層へ育てる。Agentは利用者の具体的な悩み、例示入力、期待する成果、時間短縮または品質の検収から作る。機能数より、本人が実際の仕事を最後まで完了し再利用できる率を評価する。「何に対しても」は接続先を拡張する方向であり、任意のアプリやLinux hostを無権限で操作できるという実装状態ではない。最初はRockstar Home／Sky Web／Zemaと第一者同一origin app output slot、次に登録済み外部app、Terminal/Linuxの限定adapterへ拡張する。

**利用体験**: 利用者は「この作業で困っている」を入力し、Marketplaceで用途・実行先・作者・送信データ・料金・成果形式を比べ、対象アプリにAddする。Zemaで同一jobの見積、権限、予算、本人承認、実行、停止、成果、使用額を確認。ローカルLLMまたはTerminalで生成した成果も、型付きartifactとしてSkyの本人別受け皿へ取り込み、選んだアプリの許可済みslotで表示する。未対応target、offline、model未導入、接続失効、購入権不足、schema不一致は利用不可理由を表示し、別のcloud実行へ無断切替しない。

**アプリ起点のAdd Plugin**: 「Zoomで会議後に決定事項と担当者を整理したい」のように、利用者は対象アプリと欲しい処理から対応Agentを探せる。Skyは対象アプリに対するAgentの入力能力、必要scope、出力先、実行先、料金、対応版と現在の接続状態を示し、適合したものだけAddできる。流れは発見→適合確認→本人の接続・scope同意→Add→Zema jobの見積・必要な実行承認→処理→型付き成果の保存→許可されたアプリslotまたはSkyでの表示→停止・失効。会議データ等は本人が許可した会議・項目だけ取得し、モデルが読んだ本文に含まれる指示を権限へ昇格させない。外部書込み・送信には対象操作の別承認と冪等receiptを要する。アプリ側の正規API、MCP、拡張口など、接続先ごとに受入済みの経路だけを使う。アプリ内UI追加はhostの拡張口がある場合に限り、なければSkyの成果画面と本人選択のexportを使う。Zoomは要求を説明する例であり、Zoom連携・会議データ取得・Zoom内表示の実装済み証拠ではない。

**Sky Add Momentの発明候補（調査中）**: 常設されたhost側の小さなSky入口で本人が「欲しい機能」を言い、host adapterがアプリID・画面種別・許可済みデータ種別・有効期限・nonceだけを含む短命Context Capsuleを発行する。Skyは接続先の機能contractと登録済みAgentを照合し、本人に送信データ、費用、実行先、成果の返却先を表示する。承認済みjobをBroker経由で実行し、型付きartifactを同じhost slotへ返し、表示または書込みのackを同じjob／revisionへ記録する構想。Capsuleやモデル出力は本人認可、接続先の正式なcontext検証、Tool実行権限の代わりにしない。即時性は「入口の発見・適合表示」を先に実測し、Agent処理時間と分ける。独自性・特許性・全アプリ互換は未検証である。

**優先経路の訂正：Agentが対象アプリへ入る（2026-10-18、利用者の追加指示）**: Zoom Appの事前導入を必須条件にした前段の経路は、利用者の「導入済みじゃなくても」「エージェントが入ってやる」という明示訂正に合わない。第一経路はRockstarOS／Sky端末側AgentからOSの画面操作機能を使うものとし、Zoom App／Marketplace追加なしで、本人が今使っているZoomを対象にする。既存のZoom Apps SDK経路は、文脈・会議media・Zoom内の専用UI等が必要な場合の追加接続とする。Sky端末側AgentまたはRockstarOSが存在せずOS許可もない端末に、Webページや遠隔modelだけで侵入できる意味ではない。未導入端末ではSky URLを開いて手入力の私的成果を受け取る導線から始め、端末操作は本人がSky clientとOS許可を有効化してから使う。

端末Agentの利用体験は「Sky共通呼出し→『このZoomで決定事項と担当を整理』→対象windowと読取範囲を本人が確認→Agent候補・料金/上限・操作内容を表示→観測→下書き生成→本人が確認→許されたUI要素へ入力→必要なら送信だけ別承認→対象画面の読戻し・Zema成果表示→停止/失効」。低リスクの観測・移動・下書き入力は、本人が許可した対象・目的・時間・上限の短命job lease内でAgentが連続して行い、各クリックで本人を止めない。各stepの対象再確認はBrokerが自動で行う。共有送信、削除、支払い、権限変更には操作内容を示した別の本人承認を要する。Zoom UIに存在する操作だけを行い、新規機能や未許可の会議データ権限を創出しない。画面の情報が不足する場合は本人の選択・手入力を求め、Zoom SDK/REST/RTMSが必要な能力は未接続として示す。「その場で受け取る」はまずSkyの小窓／端末overlayの私的表示、Zoom UIの入力欄への下書き、本人承認後の投稿を別成果先として扱う。共有Chatへの投稿を私的成果表示と取り違えない。

端末Agentの契約は、入力をSky owner、target bundle ID／PID／window識別子／アプリ版、観測したUI treeまたは本人選択領域のhash、許可されたdata class、目的、Agent/Tool版、費用上限、期限、job/revision、本人承認digestとする。出力は観測receipt、提案action列、各stepの対象UI role/title/pathと事前・事後fingerprint、実行結果または結果不明、型付きartifact、費用明細、停止/失効receipt。状態は`unavailable → permission_required → target_confirmed → observing → awaiting_action_approval → executing → readback_confirmed → artifact_saved`を基本に、`cancelled`、`target_changed`、`permission_revoked`、`indeterminate`へ分岐する。画面内容・画像・会議本文は目的外収集せず、必要なものだけ本人の保存選択と既存retention契約へ渡す。リトライ時は同一job/revisionと画面fingerprintを照合し、投稿等の外部作用は結果不明なら自動再実行しない。

ROCKは端末Agentの対象アプリ固定、OS権限確認、step検査、Broker予算/本人承認、Zema記録、停止を担当する。OSはmacOSのAccessibility許可を本人に求め、画面画像が必要な場合のScreen Recording許可を別に求める。[AppleのAXUIElement](https://developer.apple.com/documentation/applicationservices/axuielement_h)はaccessibilityを通じて別アプリを制御でき、[macOSの許可画面](https://support.apple.com/guide/mac-help/allow-accessibility-apps-to-access-your-mac-mh43185/mac)は本人による明示許可を要する。[ScreenCaptureKit](https://developer.apple.com/documentation/screencapturekit)は画面取得を別許可として扱う。Windowsは[UI Automation](https://learn.microsoft.com/en-us/windows/win32/winauto/uiauto-clientsoverview)が別アプリのUI要素を読取・操作できる候補で、実装と受入は別。EXTERNALはZoom UI・OS API・権限提供、JOINTはZoomの版ごとの実動作と本人二人の分離、OWNERは対象、読取、費用、送信を承認する。Cloud modelが返すactionはBroker権限の根拠ではない。

`scripts/sky-add-macos-ax.swift`はZoom bundle `us.zoom.xos`が前面の時だけAX role/title/pathを最大160要素・深さ5で観測し、`AXValue`を収集しない限定研究probe。UIラベルやwindow名にも会議情報が含まれ得るため、本人データのあるZoomではまだ実行しない。`press`／`set-text`は同じwindowと要素を直前に再確認し、対話端末の一回確認がある時だけ実行できる。このCLIの各操作確認は研究段階の制限であり、完成UXのクリックごとの承認ではない。これは本番の本人承認証拠でもなく、Sky/Zema/Broker連携やZoomの実動作受入でもない。次は本人承認digestを短命job leaseに固定し、外部作用だけ別承認として、対象window変更、権限解除、誤送信、二利用者、費用上限、再起動、Zoom版更新を限定Mac環境と実Zoomで受け入れる。初回セットアップ時間と再利用時の呼出し→結果時間を分けて測る。未決定はSky端末Agentの配布方式、Sky共通呼出し、OS別UI要素品質、Zoomの対象版、overlay方式、画面記録の範囲/保持であり、実機と本人pilotで決める。

**Zoom先行経路と試作**: [Zoom AppsのSurface](https://developers.zoom.us/docs/build-flow/surface/)はMeeting内等のin-client WebViewを提供する。[Zoom App Context](https://developers.zoom.us/docs/zoom-apps/zoom-app-context/)は起動文脈とサーバーで検証する暗号化context headerを定義する。[Data Access](https://developers.zoom.us/docs/zoom-apps/data-access/)はSDK文脈、サーバー側REST/Webhook、RTMSのデータ層を分け、RESTをfrontendから直接呼ばない。公開済み・導入済みAppなら[Zoom deep link](https://developers.zoom.us/docs/zoom-apps/guides/open-zoom-apps-from-native-web-apps/)で会議側panelを開ける。ローカル`/sky/add/zoom`は公式`@zoom/appssdk` 0.16.42の`config`を呼び、一般browserでは手入力fixtureとして動く。現行画面は試作Agent一件のメモ整理と同画面結果表示のみ。Zoom実アプリ登録、配布、OAuth、会議データ、Zema保存、第三者Agent、Zoom内の動作は未受入。

[Zoom App構築手順](https://developers.zoom.us/docs/zoom-apps/create/)は開発者権限、Meeting用scope、公開HTTPSのHome URLとCSP等を要求する。[Zoom App Architecture](https://developers.zoom.us/docs/zoom-apps/architecture/)はZoom側がHTML応答の安全ヘッダーを検査し、backendに認可・API・launch処理を求める。[配布手順](https://developers.zoom.us/docs/distribute/)ではprivate／beta／unlisted／publicを分け、publicとunlistedは[Zoomの審査](https://developers.zoom.us/docs/distribute/app-review-process/)を通る。最短の再利用体験は、対応Appを先に本人が追加済みで、Zoom内のSky入口を開き、その時の要望を入力する形である。初回導入とOAuth consentに要する時間を「瞬時」に含めず別に実測する。これは公式資料からの設計上の推論であり、実クライアントでのクリック数・起動時間は未測定。

**Zoom入口別の実装契約（08:25 UTC調査）**: [Team Chat App shortcuts](https://developers.zoom.us/docs/chat/app-shortcuts-and-apps-sdk/)は既存メッセージまたは作成欄にショートカットを置き、選択時にApp Home URLをWebViewで開く。Zoom Apps SDKの`getChatContext`で起点本文を得る例があり、`sendMessageToChat`や署名付き`composeCard`は同じChatへの書込み口となる。Skyでは「ショートカット→欲しい機能→Agent適合→Add→本人だけに結果プレビュー」を先行し、Chatへの送信は宛先・本文を確認する別操作とする。会議中は[Meeting deep link](https://developers.zoom.us/docs/zoom-apps/guides/open-zoom-apps-from-native-web-apps/)とin-client side panelが入口だが、このdeep linkは公開済みAppと本人による追加が条件で、未追加なら概要ページに遷移する。従ってSky Agentの内部AddとZoom App自体の初回導入を別状態にする。[Zoom Plugin SDK](https://developers.zoom.us/docs/plugin-sdk/)はmacOS／Windows native appとZoom WorkplaceのIPC接続であり、Zoom内WebViewやTeam Chatショートカットの代替入口ではない。上記はZoom公式仕様の確認とSky側の設計判断で、実Zoom動作の証拠ではない。

**Zoomデータ・権限の段階**: 第1段階は本人の手入力または明示選択したChat文脈だけを入力に使い、パネル／ショートカット内で私的な成果を表示する。[Zoom App Context](https://developers.zoom.us/docs/zoom-apps/zoom-app-context/)の`X-Zoom-App-Context`はbackendで復号し`exp`を検証する。`typ`、`uid`、会議`mid`、Chatの`msgid`／`chid`等は起点照合に使い、Home URLの平文queryやfrontendの`runningContext`だけを本人権限としない。追加でZoom REST情報が必要なら[in-client OAuth](https://developers.zoom.us/docs/zoom-apps/authentication/)の`authorize`／`onAuthorized`、state照合、backendでのcode交換とscope別承認を要する。同資料によると未公開Appでin-client install flowは試せず、既存Marketplace導入と第三者OAuthの経路も維持する。会議音声・映像・transcriptは[RTMS](https://developers.zoom.us/docs/rtms/meetings/getting-started/)の別段階で、Developer Pack credits、必要scopeとevent設定、host／admin／参加者の制御、[streamの停止・再接続](https://developers.zoom.us/docs/rtms/meetings/work-with-streams/)を個別受入する。RTMS料金をSky Agent料金へ隠さず別見積にする。Chat送信、会議参加者への共有、録音相当の取得をAgentのAddだけで自動開始しない。

| 起点 | 本人への最初の成果 | 追加で必要な条件 | 現在地 |
| --- | --- | --- | --- |
| Meeting side panel | 同じパネル内の私的な型付き成果 | 公開・追加済みZoom App、本人セッション、必要な入力の許可 | browser手入力試作のみ |
| Team Chat message／compose shortcut | WebView内の私的プレビュー | App shortcut設定、正式context検証、Chat本文利用の同意 | 公式仕様確認のみ |
| Team Chat投稿／card | 対象Chatへの送信receipt | 宛先・本文の別承認、SDK capability、card署名 | 未実装・未受入 |
| 会議media／transcript | パネル内プレビューとZema artifact | RTMS権限・credits・host等の許可・停止/失効・費用上限 | 未実装・未受入 |

**次の実装順と合格証拠**: (1) host surfaceと入力sourceを分けるSky Agent適合contractを既存Registry／Passportへ結ぶ。(2) Zoom Home URL受信backendで暗号化contextの復号・期限・起点・本人対応を実装し、検証済み短命Sky sessionだけをWebViewへ渡す。(3) 既存Zema/Brokerのowner、scope、quote/cap、job、artifact、revisionで一件の読み取り専用Agentを動かし、同じZoom slotの本人画面へ返す。(4) Chat送信とRTMSを別gateで受け入れる。証拠はfixtureの改ざん／期限切れ拒否、実Zoom二利用者の取り違え拒否、Agent追加・停止、同一job成果の画面再表示、必要クリック数と発見時間、取消時の送信・費用停止を別々に残す。Zoom App登録・OAuth・RTMS・Marketplace公開は条件未充足のため未実行。

**複数アプリへ一般化するAdapter境界（09:22 UTC調査）**: 公式資料で、[Slackのglobal／message shortcuts](https://docs.slack.dev/interactivity/implementing-shortcuts/)はHTTP interaction payloadを受け、3秒以内にackし、`trigger_id`でmodalを開く。message shortcutには起点message文脈があり、globalにはない。公開送信前に確認modalを置くことをSlackが推奨する。[Slack署名検証](https://docs.slack.dev/authentication/verifying-requests-from-slack/)はraw body、timestamp、署名secretで行い、timestampずれ5分超をreplayとして拒否する例を示す。[Teams message extension](https://learn.microsoft.com/en-us/microsoftteams/platform/messaging-extensions/build-bot-based-message-extension)はmanifestの`composeExtensions.commands`で`message`／`compose`／`commandBox`を選び、action commandのtask moduleへ入力・結果を出せる。message actionにはattachment詳細がinvokeへ自動同梱されない。[Teams会議tab](https://learn.microsoft.com/en-us/microsoftteams/platform/apps-in-teams-meetings/build-tabs-for-meeting)は`meetingSidePanel`等をmanifestへ宣言し、参加者のapp導入・tab設定と役割ごとの操作制約を受ける。これらは各host固有の入口・検証・返却契約であり、Skyが任意アプリ画面に無条件の共通ボタンを挿入できる根拠ではない。

Skyの正規化contractは`host surface`、`input source`、`return slot`をAgentごとに明示し、三つが一致した候補だけを発見画面へ出す。入力sourceは本人の手入力、選択message、会議transcriptを分離し、返却slotは本人だけの埋込プレビューと共有Chat投稿を分離する。試作の`lib/sky-add-host-contract.ts`はこの**発見用の静的照合だけ**を実装し、`/sky/add/zoom`は手入力→私的プレビューの組合せだけを宣言した。Zoom Apps SDKの`runningContext`による画面種別表示も正式contextの本人検証ではないため「文脈未検証」と明示する。Slack／Teamsは型の候補に追加しただけで、adapter、OAuth、署名検証、modal／task module、実表示は未実装。

共通job開始は「host requestの検証→Sky ownerとhost userの結合→必要scopeとAgent Packageの適合→見積と予算上限→本人承認→Broker実行→Zema job／revisionへ型付きartifact保存→許可済みslotへ配達→本人表示ack」の順とする。Slackの3秒ack等、hostの応答締切には受付だけ返し、処理完了や課金確定と混同しない。hostからのmessage本文やモデル出力は次のAgent権限を増やさない。再利用時の「欲しい機能→候補表示」を短縮し、初回host app導入、OAuth、Agent内部Add、job実行、共有書込みの所要時間をそれぞれ計測する。この共通化と効用は設計推論であり、Zoom以外の実アプリ受入や発明の独自性は未確認。

**導入・料金表示のhost差分**: [Zoom Apps mobile](https://developers.zoom.us/docs/zoom-apps/guides/mobile/)ではiOS／iPadOS／AndroidのZoom App内でStripe等によるin-app購入も、外部購入導線へのbutton／link／CTAも許されない。したがってモバイルZoom内のSky Agent発見を、有料Agent購入画面や外部checkoutへの誘導として設計しない。既存契約に含まれる能力の実行とusage/上限の表示は、販売・課金導線とは分け、Zoom審査でその具体例を確認する。[Slack distribution](https://docs.slack.dev/app-management/distribution/)では他workspaceへの配布にSSLとOAuthが必要で、管理者承認によりユーザーが即時installできない場合がある。[Teams custom app upload](https://learn.microsoft.com/en-us/microsoftteams/platform/concepts/deploy-and-publish/apps-upload)も組織のapp setup policy、HTTPS、manifest/packageに依存する。host App未導入や管理者待ちを、Sky内部Agentの即時Addで飛び越えられるとは表示しない。Zoom mobileの購買禁止は公式要件、無料／既存契約内でのSky処理をどう見せるかは審査前の設計仮説である。

**Zoom正式contextの検証境界（10:28 UTC調査・ローカル部品）**: [Zoom App Context](https://developers.zoom.us/docs/zoom-apps/zoom-app-context/)はHome URLへの`X-Zoom-App-Context`をZoom Client Secret由来のAES-256-GCMで復号し、`exp`を検査してから使うよう定める。`lib/zoom-app-context.server.ts`へWeb Cryptoの復号、envelope長の検査、`typ`／`uid`／`ts`／`exp`の確認を実装した。合成headerで有効値、鍵違い、期限切れ、形式不正を拒否／受入確認した。公式資料の公開sampleは`exp`を含まないため、復号例としては参照できても有効なSky起動としては受け付けない。13:33 UTCにHome URL pageの表示判定へ接続したが、実Zoom header、Client Secret、Cloudflare本番runtimeでの受入は未了。secretや復号した個人識別子をclient、URL、一般ログへ渡さない。

12:29 UTC追補: [Guest Mode公式](https://developers.zoom.us/docs/zoom-apps/guides/guest-mode/)ではguestの`X-Zoom-App-Context`に`uid`がない。このため現行verifierはguestをSky ownerへ結合できず拒否する。guestでの私的手入力体験を別途許すなら、本人別保存・有料実行・RESTアクセスのない独立した一時契約を設計してから受け入れる。[Zoom App Context](https://developers.zoom.us/docs/zoom-apps/zoom-app-context/)の`mid`はmeeting UUIDで、breakoutではroom UUIDになり、`pid`が親meeting UUIDとなる。verifierは`meetingUuid`と`parentMeetingUuid`を区別して返す。数値のMeeting IDを参加者結合キーにしない。[role別権限ガイド](https://developers.zoom.us/docs/zoom-apps/guides/roles-and-permissions/)もMeeting IDの再利用可能性を指摘している。合成headerのbreakout／guest拒否を確認したが、実Zoomのbreakoutやguest受入は未実施。

13:33 UTC追補: [Zoom App Context](https://developers.zoom.us/docs/zoom-apps/zoom-app-context/)のheaderはApp Home URLのHTTP requestへ渡されるため、`/sky/add/zoom`のserver pageで`next/headers`から読み、サーバー環境の`ZOOM_ADD_APP_CLIENT_SECRET`がある時だけ復号・期限検査する。`lib/sky-add-zoom-launch.server.ts`はブラウザー試作／secret未設定／不正header／検証済みを分け、clientへ渡すのは検証状態と`typ`だけで、Zoom `uid`、会議・Chat ID、header、secretは渡さない。headerが不正・secret未設定、またはZoom SDK画面種別と検証済み`typ`が合わない場合は試作Agent候補を表示しない。headerなしの一般browserでは従来の手入力試作が動く。Zoom headerが検証済みでもSky ownerのnonce結合、Zoom OAuth grant、Agent権限・予算には昇格しない。Home URL用の[必須HTML security headers](https://developers.zoom.us/docs/zoom-apps/architecture/)と現在の`public/_headers`の実配信一致、Zoom実Clientのページ表示はJOINT受入に残る。

[Zoom Local Test](https://developers.zoom.us/docs/build-flow/local-test/)ではDevelopment設定のAppを本人のZoom Clientへ追加・試験でき、同一アカウント内のtesterへ認可URLを共有できる。[Beta／Private配布](https://developers.zoom.us/docs/build-flow/beta-test/)で外部アカウントへ広げる場合は別条件と共有承認がある。よって最初の実Zoom受入は公開Marketplaceを待たず、本人が作成・設定したDevelopment AppのLocal Testで行う計画とする。ただし実App作成、Client Secret設定、HTTPS Home URL配備、Zoom認可、会議参加やデータアクセスは未実施。外部tester配布も未着手。開発credentialとproduction credentialは[build flow](https://developers.zoom.us/docs/build-flow/)で別なので混用しない。

**Zoom UIDとSky ownerの結合**: Zoom headerが証明するのはZoom側の起動利用者・画面・期限であり、Skyのowner、Agent利用権、予算、会議データの同意ではない。既存Sky A2A／quote APIは`requestRockstarUser`でRockstar本人を取得し、quote同意、Package/Runtime binding、予算を別検査する。Zoom WebViewのSDK成功や`uid`をこのSky本人IDへ直結しない。[Zoom security](https://developers.zoom.us/docs/zoom-apps/security/)ではZoom Appのmeeting／panel間でcookie scopeが分かれ、秘密値やPIIをURL・client storage・平文ログへ出さないよう求める。したがって初回のSkyログイン／account linkは認証済みSky側と検証済みZoom起動をnonceで相互照合し、Zoom user IDのdigest・Sky owner・host App ID・許可surface・期限・失効をserver側へ保存する短命のhost sessionとする設計が必要。既存の90日`rock_session_`端末tokenをZoom WebViewの汎用tokenとして渡さない。本人結合のUI、DB schema、失効API、二利用者・meeting/panel切替の受入は未実装。Zoom本接続で一件実行する前にこの境界を合格させる。

14:33 UTC追補: [Zoomの第三者OAuth手順](https://developers.zoom.us/docs/zoom-apps/authentication/)は、認可リンクだけを根拠にアカウントを結ぶと別利用者に誤結合できると警告し、起動したZoom user/sessionに結ぶ`state-nonce`、PKCE、戻り時のsession照合を求める。既存`rockstarDeviceLinkStore`の90日端末tokenはこの用途に流用しない。`lib/sky-add-owner-binding.server.ts`にZoom UIDとmeeting/chat起点をApp IDと別server secretでHMAC化する関数と、Sky owner、host App ID、検証済みZoom UID／起点、許可画面、5分以内の期限、失効を照合する純粋なserver判定を追加した。合成の二利用者／別meeting／画面切替／期限切れ／失効は拒否し、一致結果は`ready-for-capability-check`までとする。これはlink recordを信頼できるOAuth・nonce flowで発行する部品ではない。実Zoom OAuth state、Sky認証済みlink UI、D1 lease、再認可readback、失効endpoint、job開始時再照合は未実装。次の実装は同一Zoom起動に結びついた一回限りのnonceを、外部browserの認証済みSky ownerの応答と照合し、host sessionを短命で保存する。URL／WebViewへZoom UID、Client Secret、Sky長期tokenを渡さない。独立したserver証拠が揃うまでAgent実行を開かない。

15:35 UTC追補: 既存第一者`SkyAppOutputSlot`は同一originの本人別`/api/sky/a2a-delegations/{id}/artifacts`を読み、truncated／非text省略／schema不一致を区別する。これはZoom WebViewでのSky本人sessionやcross-origin取得を保証しない。最初の会議メモ成果として`lib/sky-add-zoom-artifact.ts`に`sky.zoom.meeting-notes/1`を固定し、`manual.text`から`embedded.private`への内容だけを検査する。試作の決定的整理結果をこの型で画面へ返し、別schema、会議transcript偽装、Chat共有slot、空値・容量超過を拒否する。job ID、owner、revision、保存、hash、delivery ackはこの内容payloadに自己申告させず、将来のserver側Zema job／artifact／host leaseに結びつける。現在はbrowser内の一時結果であり、A2A保存済み成果や実Agent実行ではない。実Zoomへ返す際は成果取得時にも同じowner、lease、host起点、job revisionと許可slotを再確認し、失効時には新規取得・共有を拒否する。

**Zoom Appの審査済み機能境界（11:30 UTC調査）**: [Zoom App Review Guidelines](https://developers.zoom.us/docs/distribute/app-review-guidelines/)は隠れた機能を禁じ、scopeをMarketplace掲載の現行機能に必要なものへ限定する。[公開Appの継続審査](https://developers.zoom.us/docs/distribute/published-apps/ongoing-monitoring-and-reviews/)によるとscope追加はfunctionalとsecurityの両審査対象で、[更新手順](https://developers.zoom.us/docs/distribute/published-apps/updating/)はscope変更後の利用者再認可を要求する。元の目的を超える機能・新しいデータへのアクセスにもsecurity reviewが求められうる。既存認可は更新後も最大90日使えるが、旧scopeのrefresh token失効後は新scopeで再認可が必要となる。これらはZoom公式の配布条件であり、Sky内AgentのAddがZoom App自体の審査・権限・再認可を省く根拠はない。

Sky側の設計判断として、host Appが申告・審査された機能、承認済みscope、利用者に実際にgrantされたscope、許可されたdata classとsurface、返却先の積集合を**host capability envelope**として扱う。Agent候補の必要条件がこの範囲から一つでも外れる場合、内部Addだけで実行可能と表示せず、App更新／審査／再認可または別の正規入口が必要という状態へ分岐する。審査時に将来の任意Agent用scopeを先取りしない。各Agentの用途、第三者へのデータ転送先、料金、出力先が申告済み用途に収まるかも版付きで確認する。このenvelopeはサーバーがZoom App設定・認可・Registryの版から組み立て、frontendの自己申告やAgent説明文を権限証拠にしない。`lib/sky-add-host-contract.ts`の現在の三項照合にはこの審査・grant照合は未実装で、手入力試作だけが使える。正式Zoom Appの申告内容とscopeを選ぶ前に、具体的なAgent一件でZoom審査の扱いを確認する。

12:29 UTCに追加した`lib/sky-add-capability-envelope.ts`は**発見時の宣言照合だけ**を実装する。候補の目的・必要scope・data class・surface/input/returnと、Appの申告済み宣言を照合し、scope追加などを`host-app-update-required`、承認済みscopeに対する利用者grant不足を`host-reauthorization-required`、session/期限/版の不一致を`host-session-required`へ分ける。[Zoom Guest Mode](https://developers.zoom.us/docs/zoom-apps/guides/guest-mode/)の`unauthenticated`／`authenticated`／`authorized`を区別し、[role別権限](https://developers.zoom.us/docs/zoom-apps/guides/roles-and-permissions/)の`getSupportedJsApis`または`config.unsupportedApis`で確認するSDK method可否はOAuth scopeと別に`host-action-unavailable`へ分ける。Zoom公式はrole不足のmethod呼出しで403を返しうる。現在は合成宣言／grantの純粋関数だけで、ZoomからのApp審査版、実grant、role、本人性を取得するadapterはない。返値`candidate-only`は実行許可ではなく、短命context検証、Sky owner結合、Broker/Zema予算・承認を通す前段の候補表示に限る。Zoom実Clientでの状態変化と再認可後のreadbackは未受入。

**失効とWebhookの配布差（12:29 UTC調査）**: [Zoomの利用者認可資料](https://developers.zoom.us/docs/integrations/end-user-auth/)によると公開Appには`app_deauthorized`の通知が届く一方、private Appと開発中Appではこの通知が発生しない。したがってpilotのhost session／Sky Agent grantは短命lease、本人の明示失効操作、実行直前のhost認可再確認を基本にする。公開後の解除通知は追加の即時失効経路とし、[Zoom Webhook検証](https://developers.zoom.us/docs/api/webhooks/)のraw request body、`x-zm-request-timestamp`、`x-zm-signature`、secret-token HMACを検証してからowner結合を失効させる。Webhook欠落／遅延時もlease expiry以降に権限を残さず、進行中のjobと予約費用はZema/Brokerの停止・照合状態へ移す。これらは設計で、Webhook endpoint、再認可readback、実失効は未実装。

**10時間調査の合格条件**: 2026-10-18 07:21 UTC頃から17:21 UTC頃まで、Zoom Apps、Chat shortcuts、Plugin SDK、REST/Webhook/RTMS、OAuthと審査・配布、他アプリの公式拡張口、先行技術を一次資料で調べる。発見からAdd表示までの必要クリック数・時間、初回と再利用時、meeting／chat／browser、出力先と失効、サーバー検証を分けて評価する。実Zoom内での本人A/B・管理者設定・会議権限・一件実行・同一成果表示・停止をJOINT受入に残す。10時間経過と調査完了、ローカル画面動作、Zoom本接続を別々に記録する。

17:38 UTC最終判定: 調査開始07:21 UTC頃から約10時間18分が経過し、所定の10時間窓を満たした。Zoom Apps SDK／Surface／App Context／Team Chat shortcuts／native Plugin SDK／REST・Webhook・RTMS／OAuth・Local Test・Marketplace審査・配布、Slack／Teamsの正式入口、既存Sky Registry・Zema・Broker・第一者成果受け皿、US11126446B2とWO2025207372A1の先行請求項を一次資料・repo sourceで確認した。製品仮説は「導入済みhostの一つのSky入口→希望処理→審査済み範囲内のAgent候補→本人・予算承認→同一job/revisionの私的成果→停止・失効」であり、任意Appへの無条件挿入や一般的な自然言語plugin選択の独自性は主張しない。ローカル`/sky/add/zoom`はブラウザーで手入力の検索・試作Agent選択・型付き決定事項／担当の同画面表示を操作確認した。暗号化Zoom起動header検証、発見用capability照合、短命本人結合判定は合成fixtureでのみ確認し、実Zoomのheader／Client／OAuth／二利用者／会議本文・media／Zema保存job／外部送信／RTMS／Marketplace公開は未受入。最初の実受入はuser-managed Development AppのLocal Testで、HTTPS Home URLと実header・allowlist、同じZoom Clientでの初回／再利用と二利用者、失効、同一成果の再表示を検証する。調査窓の終了は製品の本番完成や特許性の立証ではない。

16:31 UTCの入口・即時性の再評価: [Zoom Surfaceの公式表](https://developers.zoom.us/docs/build-flow/surface/)では、Meeting内Apps SDKとChatのApps SDK／App Shortcutsを同一製品で使う候補は**user-managed App**であり、admin-managed AppのMeeting欄にはApps SDKがない。admin-managedはLocal TestでZoom ClientのMy appsへ表示されない。[Chat shortcut設定](https://developers.zoom.us/docs/chat/za-sdk-features/)はApp ShortcutsとDisplay on Zoom Clientを有効にし、message／composeの入口を選ぶ。[App shortcuts仕様](https://developers.zoom.us/docs/chat/app-shortcuts-and-apps-sdk/)はAppごと最大20 shortcut、選択時にHome URLを開き、利用するdomainのallowlistを要求する。したがってAgentごとにZoom shortcutを増やすのではなく、固定のSky入口一つで希望処理から内部Agentを検索する設計とする。これはSky側の構成判断で、実Zoom設定は未実施。

[Zoom deep link公式](https://developers.zoom.us/docs/zoom-apps/guides/open-zoom-apps-from-native-web-apps/)はProduction Appの公開と利用者のApp追加を直接起動の条件とし、未追加ならApp概要へ進む。[Local Test公式](https://developers.zoom.us/docs/build-flow/local-test/)はDevelopment Appを本人Clientへ追加して試せる。よって「思った瞬間」は**導入済みの再利用時**に、Zoom内入口→希望処理→候補→内部Add→本人だけの結果を素早く到達する価値として定義する。初回のZoom App追加、Sky本人リンク、Zoom OAuth scope同意は別導入時間として実測する。現時点に実測値はない。計測点は`起動操作→Home画面表示→希望処理確定→候補表示→内部Add→Zema受付→型付き成果表示`とし、Meeting／Chat、初回／再利用、認可済み／再認可、拒否・失効を分け、操作回数・各区間時間・p50/p95・離脱を同一開発版の実Zoom Clientで記録する。Agentの処理時間を入口発見時間に混ぜない。

[Zoom Architecture](https://developers.zoom.us/docs/zoom-apps/architecture/)はHome URLの200 HTML応答に`Strict-Transport-Security`、`X-Content-Type-Options`、`Content-Security-Policy`、`Referrer-Policy`を要求する。16:31 UTCのローカルHTTP `GET /sky/add/zoom`では4 headerが実応答に存在した。ただしHTTP localhost、Zoom ClientのWebView、公開HTTPSの同一artifactでは未受入。Chat内WebViewの[公式tutorial](https://developers.zoom.us/docs/chat/tutorial/use-za-sdk/)はHome URLと`appssdk.zoom.us`を含むDomain Allow List設定を示す。正式Appの登録時に実際のSDK bundle／networkを観測して必要domainを最小化し、設定とZoom画面の読み込みを検証する。現在のlocal header存在だけをZoom表示成功にしない。

**先行技術の初期確認**: [WO2021076307A1](https://patents.google.com/patent/WO2021076307A1/en)はアプリ等の自然言語入力からskill／add-inを選び、その場へ表示・導入・実行する広い構成を記載する。[WO2025207372A1](https://patents.google.com/patent/WO2025207372A1/en)は文脈からAI pluginを選択して呼ぶ構成を記載する。したがって「自然言語で適切なpluginを選びアプリ内で実行する」という一般概念だけの新規性は主張しない。候補の独自性を論じるなら、host確認済みの短命context、権限・料金・実行先の一致、同一jobの型付き成果返却と失効までを先行claimと対照する必要がある。これは初期検索で、権利範囲や特許性の確定評価ではない。

11:30 UTCの請求項照合: [US11126446B2の請求項1・3・5・8](https://patents.google.com/patent/US11126446B2/en)には自然言語のtask intentからskillをrankして同一surfaceでadd-inを選択・実行する構成、surfaceとrender／data-fetchingを持つmanifest、tenant承認済みskillが含まれる。US11126446B2は前記WO2021076307A1と同じ優先権系列であり、WO公開の状態だけから国別権利を判断しない。Skyの「欲しい機能→候補→Add」やsurface manifest、単純な承認済み候補絞り込みを独自発明として主張する根拠は弱い。[WO2025207372A1の請求項1](https://patents.google.com/patent/WO2025207372A1/en)は検索で得た文書と候補plugin説明をLLM promptへ入れ、選んだpluginへqueryを送り、その応答からagent responseを作る構成で、文脈からpluginを選ぶ一般手順に先例がある。Skyでなお検討できる差分は、host起動の暗号化・期限付き証拠とSky本人の相互結合、App審査済みenvelopeとAgent権限の版付き交差、予算予約・停止、同一job/revisionの型付き成果のhost slot返却と失効が**一つの強制契約**として成立するかである。これも技術仮説であり、追加の請求項・審査経過・国別権利範囲を調べるまでは特許性や非侵害を判断しない。

**作者導線**: 既存`/studio`、`create-sky-tool init`、`sky-tool-package/1`、`/sky/publish`、`/sky/sell`を再利用し、悩み→入力例／期待成果→SDK雛形→local sandbox→安全・実用性テスト→作者宣言→審査→Marketplace掲載→販売／利用明細→返金／失効／収益照合を一続きにする。制作補助Agentはschema、説明、例、試験候補を提案できるが、作者が権利、外部作用、料金、support、成果品質を確認する。原稿・秘密値・モデルweightsを公開Packageへ含めない。最初の公開候補は、非金融で型付き成果を既存第一者アプリへ返す一件を選び、実際の悩みから初回完成率・復旧時間・継続利用・販売転換を測る。

**契約と責任**: 入力はowner、target app ID／origin／version、Agent/Package ID／作者／署名・hash、model profileまたはCloud Provider版、job ID/revision、入力hash、許可scope、実行先、料金版／上限、同意digest。出力は状態、型付きartifactとhash／保存先、Tool／model／provider receipt、usageと費用、成果を受け取ったappのack。ROCKはRegistry、Broker権限、model/Terminal adapter、成果schema、本人別保存・失効・課金照合を担う。EXTERNALはアプリ接続先、model license、決済・LLM Provider。JOINTはSDK／外部app／Provider sandboxのend-to-end受入。OWNER／作者は入力、公開条件、外部作用、価格、費用を承認する。署名は作者同一性であり安全・品質保証ではない。

**状態・保存・失敗／復旧**: Agentは`draft → local_tested → submitted → verified → installed → active`を設計上の導線とし、rejected／revoked／unavailable／uninstalledを別にする。既存Registryの`published_declared`を`verified`へ読み替えない。仕事は既存Zema workflow、成果はowner別job／artifactを正本とする。Terminal guestやappの一時保存だけを正本にしない。通信断、VM停止、重複呼出、結果不明、schema違反、作者更新、返金／権利失効では同じID・版・hashを照合し、外部作用と有料実行の自動再送を止める。入力／成果の保存は目的・期限・削除／exportを本人に示す。Agent削除後も請求・返金に必要な最小記録の保持は別契約に従う。

**収益化の境界**: 現在のSky Marketは審査済みPackageの買い切りJPYと10%手数料のsource経路を持つが、Stripe Connect／Provider sandbox／作者払出しは未受入。販売額、返金後の純額、手数料、Provider入金、作者への払出しを別表示する。Cloud LLM使用料と作者商品代、RockstarOS月額を別明細にする。月額Agent、利用回数課金、成果報酬、他通貨は価格／meter／税／返金／作者同意を決めてから個別追加し、実販売や確定収益として表示しない。

**受入と未決定**: ROCKは最初の一件で初心者が雛形作成→local試験→審査→Add→本人の一件完了→Sky成果表示→対象アプリ表示→停止／削除まで再現し、別owner、改ざん、期限切れ、失効、重複、VM再起動、offline、未払いを拒否する。JOINTは外部appのorigin／OAuth／callbackと決済sandboxで注文・返金・入金を照合する。最初のAgent／target／成果schema、local model format・runtime／端末容量、Terminal transport、実用品質閾値、販売価格／国は実ユーザー課題と端末・契約の証拠から決める。現時点は設計で、任意model交換、Linux成果取込み、外部app共通SDK、creator収益の本番受入ではない。[Studio/SDK](sky-tool-sdk.md)、[App Output Plugins](sky-launch-design.md#sky-app-output-plugins)、[既存料金](sky-billing.md)を使う。

<a id="sky-agent-smith-research-20261019"></a>
### エージェントスミス構想の実アプリ接続調査（2026-10-19）

「エージェントスミス」は、本人が欲しい機能からAgentを作り、対応アプリへ追加して成果を受け取る構想の比喩。RQ01〜RQ49、一般ローンチ保留、本人による停止・持出し、相手アプリの権限境界は変えない。主担当はSky / MCPのSKY14・SKY15・SKY21 / ROCK。EXTERNALはZoom・Appleの提供APIと仕様、JOINTは実Zoomと二利用者の受入、OWNERはOS許可・素材・外部送信・費用を決める。

| 経路 | 一次資料で確認した条件 | このcheckoutの証拠 | 判断 |
| --- | --- | --- | --- |
| macOS端末Agent / Accessibility | [Appleの本人許可](https://support.apple.com/guide/mac-help/mh43185/mac)が必要。[AX操作](https://developer.apple.com/documentation/applicationservices/1462091-axuielementperformaction)は未対応・要素失効・応答不明を返し得る。画面録画・システム音声は[別の許可](https://support.apple.com/guide/mac-help/control-access-screen-system-audio-recording-mchld6aa7d23/mac)。 | `scripts/sky-zoom-reader.swift`でZoom 7.1.9の本人だけの会議チャットを読み、結果のオフライン読戻しまで限定受入。`scripts/sky-add-macos-ax.swift`は型検査済みの研究probeで、press/set-textの戻り値は`readback:not_verified`、Broker実行ではない。 | Zoom App未導入の本人用Mac先行経路。OSの広い許可をSky内の短命な対象アプリ・画面・操作・job・費用の範囲へさらに狭める。 |
| Zoom Plugin SDK | [Zoom公式](https://developers.zoom.us/docs/plugin-sdk/)はネイティブアプリとZoom WorkplaceのIPC連携。[macOS要件](https://developers.zoom.us/docs/plugin-sdk/macos/get-started/)は開発者アカウント、Zoom Workplace 7.0.2以降、Xcode 16.1以降。[導入](https://developers.zoom.us/docs/plugin-sdk/macos/integrate/)にはSDK取得・ライブラリ再署名・OAuthの`plugin_sdk:read:connection_meta` scopeが必要。 | 現MacのZoom 7.1.9は版条件のみ満たす。SDK取得、OAuth、実メソッド、配布・失効の受入はない。 | AXより安定したZoom固有操作の候補として、別途最小の読取・可逆操作・停止を比較する。Zoom内WebViewや任意アプリへの入口とは扱わない。 |
| Zoom Apps SDK / Team Chat shortcut | [Meetingのdeep link](https://developers.zoom.us/docs/zoom-apps/guides/open-zoom-apps-from-native-web-apps/)は公開済みAppと本人の追加が条件。[App context](https://developers.zoom.us/docs/zoom-apps/zoom-app-context/)はbackendで暗号化headerと期限を検証。[in-client OAuth](https://developers.zoom.us/docs/zoom-apps/authentication/)はscope同意とbackendのcode交換が必要。 | `/sky/add/zoom`は手入力の候補・私的成果と合成context検証まで。実Zoom App登録、本人結合、OAuth、Zoom内成果は未受入。 | Zoom内の正式な表示・Chat連携に使う。Sky内部AgentのAddをZoom App導入や本人認可と同一視しない。 |
| Zoom RTMS | [RTMS公式](https://developers.zoom.us/docs/rtms/meetings/getting-started/)は媒体別scopeとDeveloper Pack creditsを要し、[host/admin制御](https://developers.zoom.us/docs/rtms/meetings/ux-host-admin-tools-ctrls/)を受ける。 | RTMS契約・媒体取得・相手側の同意の証拠なし。 | 音声・動画・transcriptの後続gate。チャット読取やAgent Addで媒体取得を始めない。 |

**10時間研究・第1チェックポイント（他host/端末、2026-10-19）**: 「AgentをAdd」はSky内部でのrecipe選択と、hostへのApp/拡張導入、本人または管理者のデータ許可、各jobの実行承認を別状態にする。以下は公式仕様からの実装候補であり、このcheckoutに実adapterの受入証拠はない。

| 接続先 | 公式入口と制約 | Skyへの含意・未受入 |
| --- | --- | --- |
| Slack | [shortcut](https://docs.slack.dev/interactivity/implementing-shortcuts/)はglobal/message文脈から起動し、`commands` scopeとApp導入が必要。受信HTTPは[署名と時刻を検証](https://docs.slack.dev/authentication/verifying-requests-from-slack/)する。 | hostの署名済み起点・workspace/user/messageをSky ownerと結合し、成果の送信は別承認。署名を通しただけでSky本人認可や投稿許可へ昇格させない。 |
| Microsoft Teams | [message extension](https://learn.microsoft.com/en-us/microsoftteams/platform/messaging-extensions/what-are-messaging-extensions)はcompose/messageから本人が起動し、結果をcomposeへ置いて本人が送る経路を持つ。[権限](https://learn.microsoft.com/en-us/microsoftteams/app-permissions)はApp能力、delegated、application、resource-specific consentを分ける。 | 未送信下書きの返却先として評価。tenant管理者の同意、resource範囲、Sky本人、投稿操作は独立gate。 |
| Chrome系browser | [activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab)は本人の明示起動で一時的に現在tabを許可し、別originへの移動やtab閉鎖で失効する。script挿入には`scripting`も必要。 | URL/origin/tab/操作をjob leaseへ束縛する候補。ページ再移動と権限失効時は再承認し、全サイト権限を暗黙の既定にしない。 |
| Windows desktop | [UI Automation](https://learn.microsoft.com/en-us/windows/win32/winauto/uiauto-clientsoverview)はUI要素の取得・操作を提供するが、[UIPI/UIAccess](https://learn.microsoft.com/en-us/previous-versions/windows/it-pro/windows-10/security/threat-protection/security-policy-settings/user-account-control-allow-uiaccess-applications-to-prompt-for-elevation-without-using-the-secure-desktop)は権限段差を区別し、UIAccessには署名と保護された設置場所が要る。 | macOS AXの許可をWindowsへ流用せず、通常権限の限定画面だけ別adapterで実証。昇格画面を共通Agentの操作対象にしない。 |
| Android / Pixel client | [AccessibilityService](https://developer.android.com/reference/android/accessibilityservice/AccessibilityService)はUI取得・gestureを提供するが、gestureのdispatch成功はアプリ上の目的達成を証明しない。[Google Play方針](https://support.google.com/googleplay/android-developer/answer/10964491)は、一般assistantがAccessibility APIで自律的に開始・計画・実行する使い方を禁じ、狭い人間定義の決定的scriptを別扱いする。 | **Play配布の汎用自律UI操作を製品前提にしない。** これはPlay配布方針であり、native RockstarOS imageの技術能力やPixelの単体APK受入結果と同義ではない。Pixel経路は正規App API/共有・限定script・OS固有adapterを分けて検証する。 |

横断の設計判断: hostが返す本文・画面文字列・LLMのplanは非信頼入力で、host起点の署名、OS/hostの権限、Sky本人結合、Brokerの操作許可、Zema job/revision、利用額上限、操作後readbackの**全て**を別々に満たしてから実行する。署名済みpayloadは内容の真実性を保証せず、UI actionやgestureのAPI成功も業務結果の合格ではない。外部送信・購入・参加者データ取得は明示された用途と追加承認がない限り止める。各hostの正式App/配布審査、二利用者・失効試験は未実施。

**第2チェックポイント（実コードの接続差）**: `lib/sky-add-host-contract.ts`はsurface/input/returnの静的発見判定、`lib/sky-add-capability-envelope.ts`はhost宣言とgrantの候補判定、`lib/sky-add-owner-binding.server.ts`は検証済みZoom launchとSky ownerの短命linkを評価する部品である。後二者の呼出しは現時点で集中test内に限られる。`app/sky/add/zoom/page.tsx`はlaunch headerの検証状態だけをUIへ渡し、`components/sky-add-zoom-prototype.tsx`は固定候補・手入力メモを端末内で整理する。`lib/sky-add-zoom-artifact.ts`の型検査はjob/owner証拠を持たず、Zoomの会議本文取得や投稿はしない。一方、`lib/sky-tool-package-store.ts`は審査済みpackageのdigest照合、`app/api/internal/sky-package-runtime-bindings/route.ts`は別のA2A runtime binding、`app/api/sky/app-work/route.ts`はprivate owner別のZema仕事とrevision/停止を実装している。いずれもSky Addの実hostから同一jobへ直結する経路ではない。これらを「部品あり」と「縦断受入あり」に分ける。

次の接続契約は、(a) host起点/owner linkと実grantのserver readback、(b)候補Agentの`packageKey`・`manifestSha256`と審査有効性、宣言されたsurface/input/return・操作scopeとの照合、(c)本人が承認した一件のZema job/revision・入力sourceのhash・対象app/画面・短命lease、(d)無料なら費用0、cloud利用なら署名単価/見積/上限予約と失敗時hold、(e)実行前後の対象・許可再照合と成果artifactのjob/owner/schema結合、(f)停止/再起動/失効/結果不明の状態と読戻しを同じjobに残すこと。順序は**既存のPackage・A2A・Zema・料金台帳を再利用した設計案**で、現在のZoom試作がこの縦断を実装したという意味ではない。

**今回の結論（資料からの設計推論）**: 最初の実証は、本人だけのZoom会議で、既存のチャット読取→本人確認済みの一件のjob→Zoomの既存入力欄へ下書きだけ置く可逆操作→同じ欄の読戻し→停止・失効を同一job/revisionで記録する。チャット送信・録音・参加者データ取得・Cloudへの素材送信はこの試験に含めない。研究probeのTTY確認はBroker承認ではなく、`press_returned_success`/`text_entry_returned_success`は画面上の結果確認ではない。現在のpath・role・title・PID再照合に加え、操作直前のwindow/要素同一性、対象欄が他人宛やsecure欄へ変わっていないこと、操作後の読戻し、結果不明時の無条件再試行禁止を実装・検査する。

**修正順と合格証拠**: (1) `sky.app-request/1`の既存owner、sourceRevision、recipe snapshot、予算0の限定jobを端末操作leaseへ結合し、対象Zoom bundle/PID/windowと許可操作を明記する。(2) 操作前後に同一対象を検査し、下書きの本文hash/宛先/未送信状態を画面から読戻す。中断・OS権限失効・Zoom再起動・画面変更時はjobを停止/結果不明にする。(3) 自分だけの実Zoomで作成→Add→読取→下書き→検収→停止を記録し、次に二利用者で他人の会議/Chat取り違えと送信拒否を検査する。(4) Plugin SDKは同じ一操作と失効を比較し、採否を実測で決める。検証は既存`tests/sky-zoom-local-runtime.test.mjs`/`tests/sky-app-foundation.test.mjs`、AX probeのSwift型検査、実画面の操作前後記録、`npm run design:check`、`npm run verify`。この節は研究結果であり、端末操作やPlugin SDKの受入完了を示さない。

## AWS実行adapterと提携準備（2026-10-05）

AWSを優先相談先として、SKY07のCloud接続へ代表Agentの実証を計画する。新しいcatalog Toolや価格を追加せず、既存のPackage/審査/quote/予算/receipt/成果契約をAWS実行adapterで受け入れる。[詳細契約](provider-contract-readiness-20260930.md#aws-partnership-preparation)に入力・出力、状態/失敗、保存/削除、停止/復旧、本人承認、合格条件と未決定事項を記載。既存A2A 1.0 clientとAWS公開サンプルのwire差分、sessionの一時性、service認証とowner binding、job別usageと請求照合を検証するまで有料dispatchを有効化しない。OpenAI/Jev/local経路を無断で置換しない。今回は設計・相談準備のみでAWS runtimeや提携は未成立。

## Sky focused公開判定の修正（2026-10-02）

ROCK/WEB04: 2026-10-02: 既存Sky v28（source cb55411549649bd57429fa1afeb974139fc024da）公開成功。CSV専用Stripeはliveで、既存JPY50円受付はcompleted/stripe_verified/attempt1/revision3を公開D1で再確認した。新しい決済はしていない。一般MarketplaceのStripe/Connect受入とは別。クラウドProvider keyと信頼料金は未設定、pricing gateはfalse、production Cloud executionは0件。Pixelは接続済みだがロック中。保存回答管理と会話引継ぎの合成受入を本番owner/実AIの証明にしない。

`focused` stageを追加し、既存basic条件に実Cloud AIの応答・所要時間・項目別usage/cost・上限/timeout、同じ公開sourceのdesktop/Pixel顧客導線、全34 Toolの個別分類、対応端末のApple Payを加えた。既存paid-marketplace/clients scopeを省略せず独立して保持する。`node scripts/check-sky-launch.mjs --require-stage focused` は不足が残る限りexit 1で、設定キーの存在やmockだけでは合格にしない。検査自体の整合は`npm run verify`へ追加した。必要stage/gateの削除、基本受入の省略、合成環境のpassed、根拠欠落、依存cycle、未完了でのlaunch claimを7件の試験で拒否する。

## Skyクラウド回答の取得と会話からの仕事引継ぎ（2026-10-02）

会話の現在の依頼文だけをcomponent memoryで仕事画面へ引き継ぎ、仕事選択・見積・承認は本人の操作とする。URL/新しいbrowser storage/D1へ依頼本文を追加保存せず、reloadで未送信の下書きは消える。保存済み回答は本人認証付きMarkdown attachment（private/no-store）で取得でき、未保存/削除済み/別本人は拒否する。本文削除は対象と不可逆性をdialogで確認し、state・usage・予算台帳は保持する。共有予算の確定額は請求書照合済みと表示しない。ローカルbuilt Siteの合成アカウントで引継ぎ/再読込/削除dialog取消/135byteのダウンロード一致を確認、Worker/D1で24項目合格。実AI/本番ownerログイン/Apple Payは未受入、追加課金なし。正本の全verifyと同一Site公開は次の検証。
証拠: [local results verification](evidence/sky-cloud-results-verification.json)。

## Skyサービスのローンチ設計

[Skyサービス設計とローンチ受入](sky-launch-design.md)を、独立Sky・OS/他アプリ接続・作者公開・有料市場の実用化設計として追加。既存のデザインと状態機械・本人認証・課金gateを維持し、設定状態と本番合格を分離する。設定状態APIは秘密や本人情報を返さず、必要サービスの利用条件を各画面へ反映する。利用者向け入口は `/sky/help`。

### クラウド文章生成の見積と使用量（2026-10-01）

ROCK／WEB04の準備として、OpenAI標準tierの文字入力・文字出力に署名料金表v2を追加した。既存v1の署名byte列と登録・失効は維持するが、v1は入力・出力だけの参考見積で実行用quoteへ昇格させない。v2は通常入力、キャッシュ読込、キャッシュ作成、出力の4単価とtext-only/defaultの範囲を署名する。入力のキャッシュ区分が実行前に不明なため、見積は3種類の入力単価の最大値を予約候補とする。単価は信頼鍵で署名した料金表から読み、公式ページの例示倍率やfixture単価を本番価格にしない。

`lib/remote-ai-text-pricing.ts`は本人・request ID・実送信と一致するtrim済み入力のhash・出力上限・承認上限・料金表digestへ5分以内のquoteを束縛する。quoteに本文を含めず、同じ入力の再確認ではhashを照合する。期限切れ、変更、別本人、別料金版は拒否する。0046 migrationと`RemoteAiTextStore`はquoteをD1へ永続化し、owner/requestの冪等性、親job単位の共有budget、原子的な予約、send claimの一回性、結果不明時のhold、使用量確定と明細再取得を実装する。`/api/llm/quotes`と`/api/llm/quotes/{id}`は見積保存・本人承認/取消・状態照会・保存成果削除を接続し、`/api/llm/text`はquote ID・approval digest・同一入力を再検証して送信する実行経路を持つ。

Zema Workbenchの選択中jobからdirect-text quoteを作成し、親jobの残予算と依頼別capを照合して、永続quote、状態readback、保存結果、itemized cost計算を表示するUIを接続した。回答保存は初期offで利用者が選ぶ。quoteは入力hashへ束縛し、画面再読込後に実行する場合は依頼文を再入力して同一hashを確認する。承認/送信は実行gateが有効な場合に限り表示する。現在`remoteAiPricingGateAccepted()`は常にfalseのため承認ボタンは無効であり、送信されない。reserved/sending時に表示できるのは予約capまでで、直接LLMの実行中provider meterは未接続。完了後の項目別額もprovider usageからの計算結果であり、Provider invoice、production billing、funded Walletの証拠ではない。ローカルのbuilt Worker/D1と合成アカウントで、仕事作成→見積保存→reload時に同じ仕事/履歴復元→認証期限切れの案内→同じ仕事へ復帰→見積取消→別jobへの切替時に履歴を混在させないことをブラウザで確認した。これは本番OAuth・実Provider・実課金の受入ではない。履歴APIは本人/parent単位で50件を取得し、未送信の期限切れ予約だけを解放する。sending/unreconciledは保持する。POSTの応答が不明な場合は自動再送せず、状態読込へ案内する。残る受入は実Provider/費用/資金gateが有効な縦断、保存成果のUI readback/delete、Sky会話composerから仕事への導線、本番配備と本人の実ログイン、invoice照合・funded Wallet統合。

応答のキャッシュ読込と作成は総入力の互いに重ならない区分として保存用metadataへ保持する。標準文章生成は`service_tier=default`を送信し、実応答tierを別に保持する。使用量計算は各区分をBigIntで加算し、通貨minor unitへの切上げを総額で一度だけ行い、項目ごとのtoken数・署名単価・正確な分子を返す。欠落した使用量を0と推定せず、別model/tier、未知のTool、検索、入力/出力上限超過、quote条件不一致はunreconciledとする。これらは予約保持と照合が必要な状態であり、支払い・請求書照合の成功を意味しない。

保存・復旧は正本ローカルでrequest-bound quoteのD1保存、本人別の原子的予約、一度だけのsend claim、送信結果不明時のhold、明細の一度限り確定と再取得を実装した。取消はD1のtriggerを含む更新件数ではなく本人の保存状態で確認し、共有budgetを一度だけ解放する。本文はquoteへ保存せず、成果本文も明示opt-in時だけ保存し、本文削除後も使用量と会計記録を保持する。未完了点はSky会話composerからの引継ぎ、保存成果のUI受入、Sitesへのmigration/実装配備、実Provider応答・invoice照合と資金接続の受入。既存A2A台帳はProvider署名receiptを要求するため、OpenAIの通常JSON応答をその署名receiptと偽って流用しない。資金接続・使用額承認の未受入も維持する。法務・特許の検索追加費用はこのtext-only料金表に含まれず、従来の停止gateを通す。実Provider credential、実測のframing上限、実応答・invoice照合はJOINT/OWNERの受入が残る。

合格条件はv1互換署名、v2単価改ざん拒否、最高単価での見積、本人/入力/予算/期限の束縛、4区分の正確な計算と未知使用量拒否、D1料金表登録から見積APIの一致、全文verify。公開v24の更新や実AI実行の証拠へは転用しない。公式仕様: [Prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching)、[Responses create](https://developers.openai.com/api/reference/cli/resources/responses/methods/create)。


## 2026-10-01 Sky文章ツールの成果再利用

ROCK／WEB04: Sky Market経由の出典整理・無料記事・応募前チェックの既存実行画面に「この端末に保存」、保存成果再表示・削除を追加。原稿は端末処理、成果は本人が選んだ同一ブラウザのlocalStorageへ全Tool合計20件、サーバーには本文を送らない。共有端末の閲覧可能性とMarkdown代替を明示。関連15試験・typecheck成功。独立作業コピーの全verifyは519 tests・265 API assertions・build等完走（既存database-status期待件数101→102の整合を含む）。実ブラウザでMarket検索→出典整理→保存→再読込→再表示、無料記事作成・保存を確認。稼働コピーは2026-10-01チャットのwork/sky-service。共有作業treeの以後の変更はこの合格へ算入しない。本番未配備。配備元7c79e43のSiteは一般公開設定で、以前のOS管理者限定要求との相違があるため公開範囲の回答待ち。アカウント別クラウド成果同期・実Provider接続の合格ではない。

# Sky／Zema／全Tool詳細設計

## メインSIM通信と共通Agent実行（2026-10-07）

Skyのcatalog/Package/Provider/予算/usage契約を共通に使い、eSIM入口の有無や通信経路によって新しいTool、本人権限、別の課金台帳を作らない。端末はメインSIM/Wi-Fiで既存cloud APIへ接続し、eSIM発行・端末連携は独立adapterとする。通信切替でも同じjob/承認/receiptを維持し、クラウド利用量と通信料金を分離する。目的から未決定事項までの設計と検証順は[メインSIMクラウド設計](sim-led-product-architecture.md#main-sim-cloud-service)を参照。既存Tool販売10%をクラウド原価へ自動加算しない。これは既存契約の設計補足で、新規Tool実装・本番請求の合格ではない。

## 2026-10-05 選択可能なeSIM提供形態の課金境界

最新の明示方針は、対応可能な端末・提供形態で選べるeSIM経由のRockstarOSクラウドOSと、そこでのSkyエージェント利用に対する従量課金。製品全体をこの方式へ一本化せず、eSIM不要のWeb/app、native OSの端末内LLM/offline agent、local/cloud併用を維持する。通信量販売を中心にせず、本人別の利用権・見積り・上限・承認・実行・停止・保存/再開・利用量・請求照合を一体の体験にする。具体的な責任、入出力、保存、失敗、復旧、承認、合格条件、料金の未決定事項は[共通設計](sim-led-product-architecture.md#2026-10-05-cloud-os-business-direction)を参照する。既存Tool/SDK/Walletを再利用し、端末内LLMとPixel/QEMUの受入は独立して保持する。これは設計変更であり、本番実行・課金や実機対応の完了ではない。


版: 1.2 / 2026-09-27
対象: Skyにある12件のready Tool、22件の導入候補、native開発Tool、Tool追加基盤。

この文書は、Tool名の一覧ではなく、各Toolについて「誰が何を入力し、どこで動き、何を保存し、どこから外部作用になり、何をもって完了とするか」を同じ形で説明する。カタログの機械可読正本は`lib/catalog.ts`。この文書とカタログの欠落は`npm run design:check`で検出する。

## 共通基盤の統合（2026-10-02、G04）

同じ処理への修正がToolごとにずれないよう、法務/特許の送信・HTTP失敗処理・公式HTTPS引用parserは`lib/research-ai.ts`、Jevの既存Gateway呼出しは`lib/jev-transport.ts`へ集約する。認証、外部送信の明示許可、4000/12000文字の入力上限、緊急停止、Tool固有prompt/rubricは呼出元が維持する。引用はHTTPS・userinfoなし・公式domainのみ、失敗時は各Tool既存のHTTP応答へ戻し、自動remote fallbackやAI結果による承認は加えない。

PC/FashionのMCP session・RPC・handshakeは`lib/mcp-client.ts`を使い、世代が変わった接続結果は採用しない。両adapterのorigin/token/protocol条件、個別の変更承認は保持する。Tool IDはcatalogからJob/connection一覧を導出し、IP Studioは一回だけ登録する。Fashion件数はregistryから検査する。

Workとココナラのowner別JSON/revision保存は`lib/owner-revision-json-store.ts`を共有し、本人ownerと期待revisionをSQL更新条件に維持する。Stripe低水準通信/署名は`shared/stripe.mjs`を共通sourceとし、SkyのConnect配分・Mini在庫・Fashion請求書は各adapterに残す。ネットワーク結果不明を成功にせず、既存の再送keyと照合を維持する。

Sky→Zemaは公開Previewにも同梱する`handoff.js`の共通契約を使う。v1の`local`表記/省略は`local-model`へ正規化し、remoteを拒否する。WebはsessionStorageのUUID、10分TTL、Tool一致、一回消費を追加適用する。入力不正・期限切れは保存から除去、別Toolの依頼は保持、再作成で復旧する。本文をtelemetryへ送らない。既存key/versionは維持し、session作成は`ready`で実行承認ではない。

合格条件は各adapterの既存回帰と共通helperの異常系、公開Preview/本体の互換試験、配布物一致、`npm run verify`の成功。実Provider/実機/本番受入は別gate。未mergeの新機能・native実行器の意味の違いは[統合記録](git-consolidation.md#2026-10-02-共通実装の統合g04)で区別する。残る統合の決定者はROCK、商品条件/外部作用は既存のOWNER/JOINT受入による。

## 1. SkyとZemaの役割

```text
Sky                                    Zema
Toolを探す                             依頼を受ける
作者・版・料金・権限を見る             不足情報を質問する
実行場所を選ぶ                         計画と承認点を見せる
接続・停止・失効する                   実行・停止・進捗・結果を管理する
             └──── Tool IDと依頼を渡す ────┘
```

Skyはapp storeだけではなく、発見から接続、実行場所、停止、結果までを同じ契約にする。Zemaはchatbotだけではなく、仕事の正本状態を表示・操作する。会話文は権限ではない。

`/sky/marketplace`はSky内のAI・自動化Tool発見面。名称・用途・作者の検索、カテゴリ、SkyのTool／導入候補／審査済み外部Packageの状態別表示を持つ。ホームとMarketは共通カードを使い、アイコンまたは「機能・利用条件」から説明・現在の接続状態・環境・費用をその場で開く。ホームの主ボタンは実際の対応状況に応じて起動・接続・条件確認へ進み、Marketの主ボタンは`/sky/tools/<id>`へ進む。個別画面のアイコンも同じ概要を開き、手順・license・補足は「使い方・ライセンス」から展開する。外部Packageは公開Registryの有効な`verified`だけを表示し、作者・版・権限・料金・実行先を見せる。

アイコンの開閉は画面内の一時状態で保存や外部作用はなく、閉じる・再度開く操作で復旧できる。掲載、`ready`、`verified`は利用者の接続完了や実処理成功ではない。候補22件の本体実行や公開remote MCPの自動導入は有効にしない。有料Packageの明示購入だけは§1.4の条件付き決済入口へ分離する。Registry取得失敗時はSky catalogを残して外部件数を未確認と示す。合格条件はアイコンがキーボードから開閉可能で、カードの主操作と混同せず、候補の未接続表示が残ること。

### 1.1 共通カードと狭い画面のレイアウト

2026-09-27の表示修正では、Skyホームの45px列に56pxアイコンを配置していたため、片側約5.5pxが本文へ重なる問題を対象とする。旧グローバルCSSによるmain・footerへの干渉も同時に除く。担当はProduct / UXのROCK、既存WEB04。

- 実装: `components/sky-tool-card.tsx`と同CSSで、ホームとMarketのアイコン、名称、状態、説明、主操作を共通化する。架空の作者handleと重複する役割名は表示しない。`lib/sky-tool-ui.ts`の実状態を入力にし、カード表示から新しい接続状態を推測しない。
- 画面境界: `components/workspace-shell.tsx`の`tone="sky"`と`components/sky-surface.module.css`でSkyの暗色面を限定し、ホーム、Market、Tool詳細、ココナラを揃える。ホーム固有の配置は`components/sky-workspace.module.css`で管理する。アイコン列は実サイズを確保し、名称列は縮小・折返し可能にする。
- 利用体験: 検索を常時表示する。Marketは短い見出しと検索を先に置き、利用環境の説明は展開する。Tool詳細は実行欄を先に表示し、重複する情報sidebarと大きな導入説明を外す。ココナラは余白とmain landmarkの二重化を解消し、既存の報酬・取引条件は展開欄に保持する。
- 表示情報: `components/sky-tool-overview.tsx`と同CSSで概要を共有する。全Tool共通の抽象的な注意書きは重ねず、未接続・認証・対象外端末など、そのToolに必要な利用条件を表示する。実行器、入力保存、認証、案件管理、送金の挙動は変更しない。
- 受入（2026-09-27）: ローカル実ブラウザのホームとMarketは320／390／440／768／1280pxで横はみ出し0、アイコンと本文の間隔12／14px。Jev Routerとココナラは320／390／768／1280pxで横はみ出し0、main landmark各1個。ホームの全Tool検索でJev Routerへ到達し、ホームとMarketから同じ概要を開閉、Escとfocus復帰を確認した。ココナラのBase UI Dialogは320／390pxでfocus trap・Esc・元のボタンへの復帰を確認し、保存失敗は入力画面内に表示する。出典整理のサンプル実行と結果表示も確認した。
- 検証範囲: 関連17試験、typecheck、`lint:product`、`sky:check`、buildは合格。2026-09-30に製品ベースとbaseline validatorのアクセント期待値を現行workspace CSSのice-blue `#bedce6`へ合わせ、R5文書・DB status testを含む該当テストを通した。全体verifyはこの更新後に未実施。無限定lintは未変更vendor・生成物のエラーを含みうる。本番配備、Tool本体接続、決済は未実施。

### 1.2 全入口・開閉画面の監査と実行導線

2026-09-27の追加監査は、一覧の外観だけでなく、ホームとMarketから34 Tool詳細、概要、サービス接続、PC/MCP接続、掲載フォームまでを対象にする。主担当はProduct / UXのROCK、既存WEB04。初期画面が表示できることと、実行器・外部Providerの成功は別に受け入れる。

- 目的と操作: ready Toolは不要な登録確認を挟まず、`launchPath`があればその専用アプリ、なければTool詳細の入力画面を開く。自然文の依頼は選択Toolと依頼文をZemaへ引き継ぐ。ココナラも依頼文ありならZemaへ保持し、依頼文なしなら案件台帳を開く。アイコンの機能概要も同じ主操作にする。PC実行が必須のToolは既存PC接続条件を保持する。
- 登録と状態: 候補のSky登録は利用許可の記録であり、本体やProviderの接続を意味しない。登録失敗は概要内に表示し、成功していない処理を完了扱いにしない。提供元がURLでない場合はリンク化しない。ホームとMarketで同じ端末適合判定を使い、Fashionのブラウザ簡易版はPC専用として除外しない。Marketと詳細は`lib/use-sky-tool-context.ts`でホームと同じPC・Fashion・登録記録を参照する。ブラウザから確認できないCLI導入・秘密設定・外部契約は推測しない。
- 表示境界: Fashionの入力、簡易プラン結果、MCP詳細は`components/fashion-brand-ops-runner.module.css`で自己完結させ、Tool詳細・Zemaの親画面に依存しない余白、暗色面、可読性、折返しを保つ。ホーム概要では共通の主操作から専用入力画面へ進む。サービス接続は長い設定を固定見出し下でスクロールでき、MCPタブは矢印キーで選択内容も更新する。掲載フォームは入力欄へのfocus、成功後reset、ヘルプアイコンを修正し、単独画面のmain landmarkを一つにする。
- 保存・権限・失敗: 表示と画面遷移の変更に限り、既存の本人認証、ジョブ保存、scope、外部送信・課金の承認条件は維持する。利用者は画面を閉じて再度開ける。エラーは関連する入力・操作の近くで示し、結果未確認の外部作用は成功表示しない。
- 画面受入: 390pxで全34 Tool詳細の見出し、横はみ出し0、エラーoverlayなしを確認。修正後のホーム全34アイコンで概要の開閉、画面内表示、横はみ出し0、初期scrollTop 0、Escapeで戻ることを確認した。サービス接続・MCP・埋込掲載フォームは320／390／768／1280pxで画面内表示と内部横はみ出し0。長いrouting設定の保存位置までのスクロール、MCP右矢印タブ切替、空掲載フォームで名前欄focusを確認。単独`/sky/register`は390pxでmain landmark 1個、横はみ出し0。全Toolの外部接続・個別実行合格とは扱わない。
- 代表実行: ホームのFashionアイコン→主操作→専用画面でローカル簡易プランを生成。出典整理の主操作→専用画面でサンプル実行と結果成功を確認。法務詳細の暗色表示も目視した。Provider資格情報入力、掲載申請送信、実MCP接続、料金操作、本番配備は未実施。
- 検査と残る範囲: 主要Sky修正後の関連26試験、`sky:check`、typecheck、`lint:product`、build、差分空白検査、設計チェック、進捗同期は合格。単独掲載画面は1280pxでも目視し、直近ブラウザエラー照会8件の範囲でアプリエラーなし。全体verifyは既存baselineのvisual system期待値不一致で停止し、掲載フォームresetのD1試験も無応答で未合格。API key発行も未実施。
- 追加入口: `/sky/network`のMCP画面と`/sky/publish`の暗色・横はみ出し0を確認。Studioのコピー失敗表示とAPI key発行401時のサインイン入口を修正し、公開SDKのコピー成功を実画面で確認した。追加Studio 2試験・対象lint・typecheck・差分検査は合格。key発行と401の実環境再現は未実施。

### 1.3 全Toolの実行器棚卸しと管理runtime（進行中）

利用者の要求範囲は、Sky／Zema／OSの全Toolを実用にし、個別サーバー管理を利用者へ要求せず、ローカルLLMを優先すること。次の分類は2026-09-27のsourceにある最小機能の棚卸しであり、全件のruntime受入、外部接続成功、`ready`の再認定ではない。

| 分類 | 件数 | 対象と実際の処理 |
| --- | ---: | --- |
| ブラウザ決定処理 | 6 | ココナラ案件チェック、記事無料版、出典整理、法務ローカルガイド、特許ドラフト、Fashion簡易プラン |
| Web API／DB主体 | 3 | CSV整形、市場PAPER検証、メルカリ出品支援 |
| 別PCサービス必須 | 2 | 納品照合（38479）、サブスク顧問（8765） |
| 外部AI必須 | 1 | Jev評価。料金見積・支出上限・usage照合の受入まで外部実行を停止 |
| 候補・固定下書き | 11 | 旧Mr.11件。入力を差し込む下書きであり、モデル推論ではない |
| 候補・接続計画 | 10 | faster-whisper、Transformers.js、Playwright、Jev Ultrafast／Trader／Review／Router／Browser、TypeSafe Computer Use、Mobile Jev。本体adapter未接続 |
| 候補・別アプリ入口 | 1 | IP Studio。18767のアプリを開く経路であり、Skyからの本体起動・実行成功を保証しない |

合計34件。複数機能を持つToolは最小経路で一度だけ数えた。ココナラ案件台帳は案件チェックとは別にDBを要し、Fashionの実運用は簡易プランとは別のMCP、法務・特許のオンライン調査は別の外部AI経路である。根拠は`lib/catalog.ts`、各runner、`components/sky-candidate-runner.tsx`の`outputFor`。ローカルLLMを起動しても、候補22件の本体adapter、ブラウザ操作権限、予定や通知Providerは自動で実装・接続されない。

- 共通blocker: `lib/operations-client.ts`は記事・出典・ココナラチェックと候補下書きの計算前にジョブの作成・開始を保存する。ローカル処理でも本人認証とDB migrationが必要。CSVは`lib/csv-job-store.ts`のDB＋BUCKETを要する。モデルAPIも`app/api/llm/text/route.ts`で本人確認とDBの利用上限記録を通る。これらを無効にして「動いた」とは扱わない。
- 最初の実用milestone: ローカルViteから同梱Connector／Fashionの起動・health・停止を共通runtimeで管理する実装を確認した。再利用するConnectorはstdioのMr.／FashionとSDK descriptorを扱う。管理対象の正確なローカルoriginを許可し、3107の接続拒否を解消したが、任意originや任意shellは許可しない。実装・試験根拠は`scripts/sky-local-runtime.mjs`、`lib/sky-local-runtime.ts`、`tests/sky-local-runtime.test.mjs`。Sky接続操作から手動サーバー起動なしで基本4機能を検出した。
- Fashion実行と保存: 実ブラウザの「プランを作って保存」から自動起動→本物のProducer→合成TシャツのDB書込を行い、「保存した下書きを再確認」の`instagram.calendar.list`で一致した（run_id `cc7dc198-718a-47d6-bec6-47594978f301`）。簡易テンプレート生成とは別の保存経路である。Provider4件はmock未接続で、LLM推論や実投稿は行っていない。ページ再読込後の結果復元UIは未実装。本人別データ、Passport、scope、一回承認、停止、receiptの既存条件は維持する。
- 納品Runner: `components/delivery-runner.tsx`の、Zemaに存在しない「右上PC接続」への案内と未接続時disabledを修正。サンプルの一操作から共通runtimeで自動接続し、`verify_delivery`の実照合`PASS`と会話内結果表示を確認した。合成サンプルの照合であり、品質承認・実案件完了・外部への納品ではない。
- 検証結果: runtime／device／MCP／Fashion関連35件が合格。origin拒否、再起動、停止、readback、Producerの冪等性に加え、isolated Vite起動→両サービス自動起動→`await server.close()`後の両port停止を確認した。isolated Worker／D1のAPI回帰172項目、最終build、typecheck、対象lint、package一致、差分検査も合格。全体`npm test`は389件中378合格・11失敗で、既存visual baseline条件、README日本語文言期待、migration-unionの期待32件と現状33件の差が残る。全体`verify`も既存visual baselineで停止し、全体合格には数えない。今回の合格のために既存基準を変更していない。
- 推論と配備境界: ローカル推論runtime／モデルは未導入で、新規導入は本人回答待ち。LLM APIのloopbackはWebサーバー自身を指すため、ローカルWebと公開Web→本人PC relayを同一視しない。Ledger、IP Studio、候補22件の個別adapter、外部Provider、native常駐搭載には個別の起動・保存・復旧受入が残る。外部AIへの無断fallbackやモデルの権限昇格は行わない。
- 担当・受入: ROCKのSKY14継続、SDK掲載はSKY15と連携。既存task状態を変更せず、最初の実用milestoneの検証結果として記録する。全体作業は進行中であり、全34 Tool実行、本番配備、native OS、外部Provider、モデル推論の完了とは記録しない。

### 1.4 Sky Marketの購入・販売・返金

- 目的・責任: BIL02のROCK実装として、審査済みAI・自動化Tool・LLM Packageの購入と10%手数料配分を扱う。StripeはHosted Checkout・受取先確認と決済処理、提供者は商品条件・履行・有料MCP側のアクセス制御、Skyは所有者確認・金額固定・購入記録と返金状態の照合を担う。決済記録はTool成功や銀行着金を証明しない。
- 利用体験: Marketカードにserver側の有効価格がある場合だけ購入操作を出す。販売条件・返金条件を見てStripe画面へ進み、`/sky/purchases`で戻り通知を照合する。作者は`/sky/sell`の「受取先登録→価格設定」。既存候補や無料機能は購入せず使う。設定未完了・未ログイン・テスト決済は通常状態と明確に分ける。
- 入出力: 作者は審査済み`external_contract` Package、円価格、HTTPS販売条件、返金条件、公開状態を送る。購入者はPackage keyと見た価格revisionだけを送る。買い切りJPYのみで、無料・月額・従量を自動変換しない。金額・10%・販売者・送金先はserverが決定し、購入確認後だけ接続先を返す。
- 状態・保存: D1 `sky_commerce_sellers/offers/orders/events`に環境別の受取先ID、価格版、固定注文条件、Provider ID、返金済み額、状態遷移を保存する。カード・銀行情報は保存しない。`pending→paid`で購入権を得るが、審査期限切れ・失効・manifest変更・部分/全額返金・異議申立てでは利用権を返さない。同一購入者/商品/環境の有効注文は一件にする。
- 失敗・復旧: 通知の署名だけでなくStripeから現在のCheckout/PaymentIntent/Chargeを再取得し、金額・通貨・mode・metadata・10%・送金先を照合する。遅れたpaid通知で返金状態を巻き戻さない。支払い画面の中止は注文失敗と決めず履歴から再確認できる。API応答を失った処理は同一idempotency keyを再利用し、安全な20時間を過ぎた不明処理は新規決済を作らず運営照合へ止める。
- 承認: 価格変更時は購入を止め、新価格を表示して再操作を求める。支払いの確定はStripe画面。返金は販売者本人が注文・残額を確認するdialogで明示する。LLM・閲覧・戻りURLだけで金銭処理や購入完了を成立させない。外部MCPの接続許可と購入は別である。
- 実装: `components/sky-commerce.tsx`と同CSS、`components/sky-marketplace.tsx`、`app/api/sky/commerce/[action]/route.ts`、`lib/sky-commerce.ts`、`lib/sky-commerce-store.ts`、`lib/sky-stripe.ts`。共有手数料は`lib/sky-marketplace-policy.ts`。migrationは`drizzle/0018_sky_commerce.sql`。
- 合格条件・未完了の決め方: SQLite/API・Provider代替fixtureで改ざん/重複/失効/部分返金/所有者分離を検証する。実Stripe sandboxで購入→通知→権利→返金、公開Webhook到達、認証gateway、提供者認可、実売上配分と銀行払出しは別の受入。現在はStripe資格情報未設定、Provider sandbox・本番配備は未実施で、BIL02を完了扱いにしない。設定手順と運営確認は[決済設計](sky-billing.md)を正本にする。

## 2. 共通Tool契約

### Toolが必ず宣言するもの

| 区分          | 必須内容                                              |
| ------------- | ----------------------------------------------------- |
| identity      | Tool ID、版、作者、署名、license、support先           |
| purpose       | 解く問題、対象利用者、禁止場面                        |
| data          | 入力・出力schema、最大size、秘密区分                  |
| runtime       | device／PC／Cloud／Provider、必要資源、timeout        |
| authority     | 必要権限、許可通信先、filesystem範囲                  |
| effect        | local-pure／remote-read／external-write               |
| money         | Tool料金、外部実費、費用上限、返金条件                |
| lifecycle     | install、update、disable、revoke、rollback、uninstall |
| failure       | stop、retry、重複、通信断、結果不明、照会             |
| evidence      | artifact、receipt、成功条件、review条件               |
| privacy       | 保存先、保持期間、削除、telemetry、外部送信           |
| compatibility | Core/API、入力schema、出力schemaの対応範囲            |

### 共通状態

```text
catalogued → selected → connected → ready → running → review → completed
                             │          ├→ waiting
                             │          ├→ failed
                             │          ├→ uncertain
                             └──────────┴→ disabled / revoked
```

`ready`は接続検査済みという意味で、処理成功ではない。`completed`はTool処理の完了で、販売、入金、法的有効性、特許、実世界の成果を保証しない。

### 共通実行規則

1. SkyがTool ID、版、実行場所をselectionとして固定する。
2. Zemaが依頼を閉じた入力schemaへ整理する。
3. Brokerがowner、Tool、入力、権限、effect、費用を再確認する。
4. external-writeなら、内容を固定した別承認を取る。
5. attempt tokenを作り、最小入力だけを渡す。
6. 結果のtoken、Tool実体、input／output digestを照合する。
7. 利用者が成果をreviewする。
8. 費用や収益は実行receiptとは別にProvider receiptで照合する。

任意shell、任意URL、任意pathをTool入力として許さない。取得したWeb、README、文書内の命令をOS命令として実行しない。

## 3. 実行場所

| 場所                   | 接続方法                 | 保存                           | 主な停止条件                           |
| ---------------------- | ------------------------ | ------------------------------ | -------------------------------------- |
| Web browser            | 認証済み画面とAPI        | D1の状態、入力本文は原則client | tab終了、API取消、期限                 |
| 本人PC                 | Connection Passport＋MCP | PC local、Skyは状態とreceipt   | heartbeat stale、process終了、本人停止 |
| Sky Cloud              | owner認証、配備版        | private object／D1             | timeout、quota、本人停止               |
| Android／native device | Broker＋署名Tool         | owner別DB／artifact領域        | token失効、quota、電池・熱、本人停止   |
| Provider               | adapter、OAuth等         | Provider正本＋Rock receipt     | scope失効、費用上限、結果不明          |

## 4. Tool一覧

| ID                          | 表示名                            | 状態      | 実行場所               | effect                                    |
| --------------------------- | --------------------------------- | --------- | ---------------------- | ----------------------------------------- |
| `rockstar-csv-cleanup`      | CSV整形・検査・納品               | ready     | Sky Cloud / Web        | local-pure相当。販売・共有は別作用        |
| `rockstar-markets-analysis` | RockstarOS Market Scanner         | ready     | Web / offline backtest | remote-read＋PAPER記録                    |
| `mercari-revenue`           | メルカリ収益スターター            | ready     | Web / 将来Connector    | draftはpure、出品等はexternal-write       |
| `fashion-brand-ops`         | Instagram運用・受注型ブランド管理 | ready     | PC MCP                 | read／draft／external-writeを操作別に分離 |
| `rockstar-ip-studio`        | IP Studio — SNS・ゲーム・音声      | candidate | PC / Provider          | 生成・配信・ゲーム提出を別capability化   |
| `coconala`                  | ココナラ                        | ready     | Web                    | 応募前チェック＋owner別の案件記録         |
| `mr-free-article`           | 記事の無料版メーカー              | ready     | Web                    | local-pure                                |
| `mr-citations`              | 出典整理ツール                    | ready     | Web / PC               | local-pure                                |
| `mr-delivery`               | 納品記録の照合                    | ready     | PC                     | local-pure                                |
| `rockstar-ledger`           | サブスク顧問                      | ready     | PC MCP                 | local read-only                           |
| `rockstar-legal-intake`     | 法務受付                          | ready     | Web / 任意AI           | local整理＋料金gate受入後にremote-read     |
| `rockstar-patent-assistant` | 特許出願アシスタント              | ready     | Web / 任意AI           | local draft＋料金gate受入後にremote-read   |
| `faster-whisper`            | 文字起こし候補                    | candidate | PC                     | 未接続                                    |
| `transformers-js`           | ブラウザAI候補                    | candidate | browser                | 未接続                                    |
| `playwright`                | 許可Web操作候補                   | candidate | PC / Cloud             | 未許可                                    |
| `jev-ultrafast`             | 選択型browser agent候補           | candidate | 本人PC                 | 未接続・未実行                            |
| `openjev`                   | local typed-decision候補          | candidate | GPU PC                 | 未導入                                    |
| `jevlike`                   | 判断model研究候補                 | candidate | AI Lab                 | 研究限定                                  |
| `jev-trader`                | 市場判断研究候補                  | candidate | PAPER sandbox          | LIVE禁止                                  |
| `awesome-jev-by-typesafe`   | Jev開発reference                  | candidate | 文書                   | 実行しない                                |
| `typesafe-computer-use`     | Mac画面操作候補                   | candidate | 隔離macOS              | observeから開始                           |
| `jev-review`                | code review候補                   | candidate | 本人PC                 | 自動変更禁止                              |
| `jev-router`                | model routing候補                 | candidate | 本人PC                 | routing-only                              |
| `jev-browser`               | 連続browser操作候補               | candidate | 本人PC                 | 未接続・未実行                            |
| `mobile-jev`                | Android操作候補                   | candidate | 隔離試験端末           | 個人端末禁止                              |

## 5. CSV整形・検査・納品

公開接続状態の`csvPayments`はCSV専用Webhook、同一originのStripe設定、DB/R2を確認し、一般Marketplaceの`payments`とは別に返す。CSV専用secretをMarketplaceへ転用しない。利用案内は「購入・販売」と「CSVの50円試験」を分けて表示する。`live`は設定確認であり、新規実決済や全商品の販売受入を証明しない。

### 目的と一周

利用者がCSV一件と、列名、列順、空白、重複、並び、文字codeの指示を送る。受付がsizeと変換可能性を検査し、決定的に変換する。別検査が入力、出力、変更報告を照合し、結果CSV、変更報告、検査JSONを一組で渡す。

### 詳細契約

- 入力: CSV一件、最大10 MB／50,000行／100列、変換指示。
- 出力: 変換CSV、変更report、独立inspection JSON。
- 保存: 暗号化private storage。受付から7日で取得拒否、または本人削除。
- 受付衝突: 同owner・同入力/指示の再送は同じ受付を返す。別ownerまたは異なる入力は409。R2入力keyは受付IDだけで共有せず、挿入試行ごとのUUIDを保存rowへ結ぶ。同時受付の敗者は自分の未採用objectだけを削除し、INSERT応答が不明なら保存rowを照合する。照合不能時は先に入力を削除しない。旧固定keyの受付も保存rowのinput_keyで読み戻す。
- 合格条件: `scripts/check-csv-storage.mjs`で既存ID攻撃・同時受付・private成果4種・別owner拒否・再起動・本人削除・期限切れを実Worker/D1/R2で確認する。合成ownerを本番ログイン受入へ換算しない。
- 再試行の期限: initial/quality_failed retryともprocessing claim前に保管期限を確認する。期限切れならowner rowとR2 objectsを削除し410を返し、attemptを増やさず処理しない。期限内の再試行成功、匿名/別ownerの拒否、期限切れの不実行と物理削除を同じAPI回帰で確認する。
- 禁止: 値の推測、文字列の勝手な数値化、複数file結合、外部市場代理操作。
- effect: 変換はTool内。buyer共有、販売、入金、返金は別adapter／承認。
- 完了: 3成果のhashと検査合格。手入力入金をWallet収益にしない。
- 失敗: 破損、上限超過、曖昧指示、非決定変換は`needs_review`または拒否。

正本: [CSV business v1](csv-business-v1.ja.md)、`lib/csv-transform.ts`、`lib/csv-job-store.ts`、`data/csv-business-tasks.json`。

50円試験はROCKの受付・Stripeの決済・本人の最終支払いを分ける。CheckoutはJPY 50を送り、Adaptive Pricingをsession単位で無効化して換算表示を出さない。決済復帰URLのjob IDは本人の保存済み受付と一致した場合だけ対象を表示・focusする。`stripe_verified`かつ`completed`で成果取得、`canceled=1`かつ`unpaid`で未払い案内、それ以外は照合待ちを表示する。URLだけで入金・成功を認定しない。ページ更新は同じ受付を復元し、再課金・再実行を行わない。受入は実機で金額・店舗名・キャンセル／成功の復帰・成果物hashを照合し、通知重複とowner分離はAPI fixtureと本番再送で別検証する。Apple Payは対応環境で本人が確認し、未試験を合格にしない。

## 6. RockstarOS Market Scanner

- 目的: 型付き価値対象を登録し、価格・需要・PAPER履歴を検証する。
- 入力: 対象type、説明、価格、供給量、注文案、本人承認digest。
- 出力: PAPER quote、risk判定、position、event、receipt。
- 実行: Web市場。外部Polymarketは公開dataのread-onlyと固定commit offline backtest。
- 保存: market、order、position、eventをownerとmodeで分離。
- 禁止: 秘密鍵、LIVE切替、外部注文、実Wallet移動、simulation PnLの実収益化。
- 完了: 同一digestの本人承認後にPAPER台帳が一度だけ更新される。
- 失敗: 外部取得失敗をsampleで補完しない。unknown marketや不正数値を拒否。

正本: [Everything Market / Fund](everything-market-and-autonomous-fund-20260913.md)、[Polymarket sandbox](polymarket-bot-sandbox-20260913.md)。

## 7. メルカリ収益スターター

- 目的: 所有在庫から出品原稿、実費後見込み、確認、取引完了までを管理する。
- 入力: 所有商品、状態、価格、販売手数料、送料、仕入原価。
- 出力: 出品draft、見込み手取り、確認事項、取引状態。
- 個人メルカリ: 本人が公式画面で出品・連絡・発送・出金する。
- Shops: 日本固定IP、公式API契約、token、個別承認後だけConnectorを使用する。
- 保存: owner別listing draft、費用、状態。個人credentialは保存しない。
- 禁止: 無人出品、大量再出品、購入、message、発送、出金。
- 完了: Providerが取引完了と入金を確認した売上だけEarning Receipt候補になる。
- 失敗: 自己申告売上は未検証のまま。販売や利益を保証しない。

正本: [Mercari revenue loop](mercari-revenue-loop.md)、`lib/mercari-revenue.ts`。

## 8. Instagram運用・受注型ブランド管理

### 中の四system

1. Campaign Autopilot: 目標、商品、予算から市場仮説、content plan、draft、approval requestを作る。
2. Sales Concierge: DM履歴と購入意向から返信案、見積り、次の一手を作る。
3. Production Cockpit: paid orderから資材、原価、能力、納期、工程、発送を管理する。
4. Management Dashboard: 広告、DM、注文、粗利、制作結果を次の仮説へ返す。

### 詳細契約

- 入力: brand policy、product、goal、asset、social account ref、顧客event、決済event。
- 出力: plan、draft、approval request、DM draft、order、production task、analytics。
- 実行: 本人PCのNode MCP。初期Providerはmock。
- secret: `env://`またはvault参照。access token本文をDBやmetadataへ保存しない。
- external-write: 価格変更、外部生成、投稿、広告、DM送信、請求、返金、通知は操作別の署名付きapprovalが必要。
- money: `paid`／`refunded`は署名検証済みProvider eventだけが変更できる。
- 冪等性: provider event ID、run ID、approval digestで重複を拒否。
- 完了: draft作成と外部投稿成功を分け、productionはpaid orderと能力計画を結ぶ。

正本: [Fashion Brand Ops integration](fashion-brand-ops-integration.md)、`toolkits/fashion-brand-ops/README.md`、同toolkitのruntime／tests。

## 8.5 IP Studio — 交換可能な制作・配信・ゲーム展開

公開Skyの専用画面では、スマートフォンと端末判定前／判定不能時にPC内アプリへのリンクを出さず、PCの起動とスマートフォン連携未実装を案内する。PCでは起動確認が未取得であることを表示して既存loopback入口を維持する。ライセンスのloopbackリンクも同じ条件で非表示にする。本人のPC／スマートフォンのloopbackをクラウド実行先と見なさず、外部生成・投稿・ゲーム提出には接続と個別承認が必要。受入はPixelでPC条件が表示され、専用画面ボタンがないこと、PCで起動条件と入口が保たれること。

2026-09-30追加：人・端末・サービスへの適合とGTAを含むadapter要件を[Sky MCP設計](sky-mcp-architecture.md#2026-09-30-人端末サービスへの適合とgta)へ追記。個人profile、端末能力、接続先capabilityを分離し、GTAの版・起動・入力・ゲーム内AI・制作・経済を個別に受け入れる。今回の追記は要件で、GTA adapterの実装・実ゲーム受入ではない。

IP StudioはHiggsfield専用の生成画面でも、Roblox／GTA専用の投稿画面でもない。同じIPを画像、動画、3D、音声、ゲームAsset、SNS素材へ派生させ、元IP、入力素材、権利、生成条件、版、公開先、反応を一つのlineageで管理する。Zemaが依頼と進行を持ち、Skyがcapabilityに合う接続先を選び、IP StudioがAssetの正本を持つ。

- 入力: IP／character ID、参考Asset、目的、必要capability、出力要件、品質条件、予算上限、privacy、商用権利、期限、許可送信先。
- Provider選択: 毎回選択、優先Provider＋許可済みfallback、本人policy内の自動選択。Higgsfield等の固有名は候補であり、job schemaへ固定しない。
- 生成capability: `image.generate`、`video.generate`、`model3d.generate`、`voice.generate`、`asset.transform`。
- 展開capability: `game.asset.publish`、`game.experience.publish`、`social.publish`、`reward.grant`、`analytics.read`。
- 出力: 共通Asset ID、出力hash、元IP／入力digest、Provider／model／版、provenance、権利条件、費用、Provider receipt、review状態、公開・ゲーム導入状態。
- external-write: SNS公開、広告、ゲーム提出、公開Asset更新、報酬付与は対象と内容を固定した別承認を必須とする。
- fallback: 新しい送信先、費用、権利条件、公開範囲へ変わる場合は再承認し、別attemptとして親jobへ結ぶ。
- 完了: 生成完了、review合格、公開成功、ゲーム反映、売上／反応取得を別状態にし、前段成功から後段を推測しない。
- 失敗: timeoutや結果不明はProviderへ照会し、同じ外部作用を自動再送しない。Provider失効後も過去Assetのprovenanceとreceiptを保持する。

接続契約の正本は[Sky MCP接続設計](sky-mcp-architecture.md)。現在のcatalog／接続画面は候補と設定面であり、Higgsfield、Roblox、YouTube、GTA等の本番成功を意味しない。

### IPキャラクターの音声会話・電話連携（2026-10-04）

利用者の「IPのやつに追加」により、RQ48のIP StudioへLiveKit Agentsを接続候補として追加した。制作した同じIPキャラクターと音声で話し、必要に応じて電話で応対することを目指す。主担当はSky / MCPのROCK、既存SKY07／SKY14に接続する。今回の実装は設定の保存・表示・依頼振分けであり、別アプリIP Studioの実行器、Agent配備、音声送受信、電話発着信は未実装・未受入。

- 利用体験: SkyのIP Studio詳細→「音声・電話の接続設定」→「LiveKit — IP音声・電話」で環境、サーバーURL、Agent名を保存。ルーティングの「IPの音声会話」「IPの電話連携」は独立した任意選択で、初期値は未選択。SIP参照IDは電話利用時のみ必要。Zemaでも同じ候補を選べる。
- 入出力と保存: owner別の既存`sky_provider_connections`へ環境、URL、Agent名、任意の発信用Trunk ID／着信用Dispatch Rule IDを保存。秘密情報、宛先番号、音声、会話本文は含めない。設定APIは未知field、資格情報やquery/hash/path入りURL、外部の平文WebSocketを拒否し、自己hostのloopback検証だけ`ws://`を許す。
- 状態: `setup_required`は下書き、既存DBの`ready`は画面上「設定保存済み」。設定保存を実接続へ昇格させず、catalogは`candidate`を維持する。番号取得・回線契約・発信を実行するAPIは追加しない。
- 後続runtime契約: IP／character IDと版、声の権利参照、言語、モデル、送信先、予算・時間上限をsessionへ固定する。`voice.session`、`telephony.inbound`、`telephony.outbound`を別capabilityとし、UIの`realtime_voice`／`telephony`は候補選択用の分類とする。本人・room限定の短命tokenをserverで発行し、AgentとMCPは既存Brokerの許可範囲内で実行する。発話や電話接続だけを外部Tool実行の承認にしない。
- 権限: マイク、カメラ、外部音声送信、録音、文字起こし保存を分けて同意し、録音・会話保存は既定OFF。発信は宛先、対象IP、目的、時間・費用上限を固定した一回承認、着信は承認済み番号・IP・応対条件に限定する。投稿やゲーム提出と承認を流用しない。
- 失敗・停止・復旧: 保存失敗は理由を表示して再編集する。後続runtimeは切断・失効・時間超過で送信を停止し、結果不明の発信を自動再送せずProvider session／call IDを照会する。再起動後は通話を自動再開せず、別Providerへ無断fallbackしない。
- 完了条件: 今回は設定のowner分離、任意電話設定、秘密情報拒否、旧routing互換、Zema振分けを検証。実用受入は本体adapter、声・IPの権利、LiveKit環境、モデル、番号・回線と費用の確定後、日本語会話、割込み、停止、取消、再接続、発着信と費用receiptを別途検証する。
- 外部依存と未決: LiveKit・Agent・音声モデル・電話回線はEXTERNAL、本体との縦断接続はJOINT。OWNERが利用先と契約・費用上限を決める。Manus Cueの投稿はクラウドPC／電話番号という体験の参考で、公式API・利用条件が未確認のため実行adapterや接続済みProviderには登録しない。

実装: `lib/sky-connections.ts`、`lib/operations.ts`、`components/sky-connection-center.tsx`、`components/sky-chat-workspace.tsx`、`lib/sky-routing.ts`。検証: `tests/operations.test.mjs`、`tests/sky-routing.test.mjs`。公式資料: [LiveKit Agents](https://docs.livekit.io/agents/)、[電話連携](https://docs.livekit.io/telephony/)、[OSS](https://github.com/livekit/agents)。

## 9. ココナラ

Skyで`coconala`を選ぶと`/sky/tools/coconala`へ直接進む。同じ画面の「案件管理」と「応募前チェック」で下記2機能を切り替えられる。独立した「受託チーム」アプリや別のSky Toolは作らない。旧`/coconala-team`はこのSky画面へ転送する。

### 応募前チェック

- 目的: 依頼文と提案文から、単発・非同期案件として条件が合うかを送信前に確認する。
- 入力: 依頼文、提案文、契約形態、発注率等の本人確認情報。
- 出力: eligibility、理由、要確認事項。
- 実行・保存: browser local処理。本文を永続化・外部送信しない。
- 禁止: 自動応募、返信、受注判断、入金確認。
- 完了: 判定理由を表示し、本人が元pageの条件と規約を確認する。
- 限界: 規約適合、受注、報酬を保証しない。

正本: `lib/mr-tools.ts`、`toolkits/mr/rock_star_tools.py`、固定Mr.原本hash。

### 案件管理

- 目的: 代表者が顧客の受注・入金と担当者への発注・支払を、案件ごとに分けて管理する。複数担当者へ割り振る場合も、担当者ごとに個別案件と事前合意を作る。
- 入力: 顧客の案件参照、委託範囲、納期、検査、修正、権利、受注額、販売手数料の見込率、担当者の固定報酬と支払期日。規約確認、顧客へのチーム制作説明、担当者への条件明示の参照記録を必須とする。
- 状態: `draft → assigned → delivered → accepted`。担当開始後の報酬条件は黙って変更せず、新しい合意を別案件として記録する。入金、返金、担当者支払は状態と独立した記録であり、顧客入金を担当者への支払条件にしない。
- 保存: 認証されたownerごとにD1の`coconala_team_cases`へ保存。操作IDとrevisionの照合で重複・競合更新を防ぐ。画面は`/sky/tools/coconala`、APIは`/api/coconala-team`。
- 計算: 通常サービス22%を編集可能な見込率として初期表示する。3%は手数料後の見込手取りから逆算する参考ボタンのみ。税、追加費用、返金・修正リスクを含まず、見込差額を利益や実売上としない。
- 外部作用: ココナラの契約・メッセージ・入金照合、銀行送金、担当者への発注書送付は行わない。金額と参照番号は本人の手入力で、Provider確認済みの収益やWallet残高へ昇格しない。
- 失敗・受入: 未認証、他owner案件、古いrevision、過払記録、入力上限違反を拒否する。受入は下書き、事前合意、進行、個別入出金、owner分離と画面を確認する。実規約上の再委託可否、実際の入金・送金、税務・法務判断は別gate。

Pixelで保存済み成果を開き直したときの出力textareaは、背景と本文色をSkyの暗色面へ明示して可読性を保つ。復元した出力のスクリーンショットを合格証拠とする。

Pixelで結果の保存ボタンが縦に細く伸びる問題を確認したため、760px以下のチェック結果は見出しと操作列を縦配置し、ボタン列は折り返す。

案件保存の401・サインイン転送は本人認証切れとして扱い、開いている入力画面を保持する。ダイアログ内にも別タブのサインインと接続再確認を表示する。再確認はGETだけで、下書きの再送や契約・送金を行わない。チェック本文のserver永続保存は追加せず、案件管理の17項目と変更履歴は本人別D1へ保存する。10秒の通信期限と不正なJSON応答の検出は共通requestへ揃える。合格条件は匿名画面で保存不可・入力保持・Skyへの復帰先を確認し、認証済み端末でチェックと保存・再読込を別々に検証する。


#### 発注前の下書き削除

不要な案件内容を本人が消せるよう、発注前の詳細画面に「下書きを削除」を置く。既存のSky配色・レイアウト・同一workspaceを保ち、対象名と取り消せないことを確認した後だけDELETEを送る。入力はcaseIdと最後に確認したrevision、出力はdeletedCaseId。本人セッションと同一originを要求し、D1のid・user_id・revision・draftを一つのDELETE条件で照合する。成功時は17項目の内容と変更履歴を含むその行を削除し、一覧から外す。担当開始済みの記録は消さない。

未認証は確認画面を保持して別タブ認証へ復帰する。別owner/不存在は404、古いrevisionや状態変更は409、不正入力は400。通信結果不明の場合は確認画面を閉じてGETで一覧を確認し、再読込からDELETEを自動送信しない。受入はowner分離・競合・状態変更のAPI/DB試験、実機で取消→記録保持→明示削除→再読込→D1行不在を照合する。削除はSky内だけで、ココナラの契約・連絡・送金を変更しない。進行済み案件の保持期間・削除方針と外部実取引の受入は未完了として分ける。

実装正本: `lib/coconala-team.ts`、`lib/coconala-team-store.ts`、`app/api/coconala-team/route.ts`、`components/coconala-team-workspace.tsx`、`tests/coconala-team.test.mjs`。参考: [ココナラ販売ガイド](https://coconala.com/pages/guide_sell)、[利用規約](https://coconala.com/pages/terms_user)、[公取委のフリーランス法案内](https://www.jftc.go.jp/freelancelaw_2025/)。

## 10. 記事の無料版メーカー

- 目的: 本人が使用権を持つ完全版原稿から、無料紹介版を作る。
- 入力: Markdown、無料範囲、summary、価格、残す有料内容、案内URL。
- 出力: 無料版Markdown。
- 実行: browserまたはAndroid固定Toolのlocal-pure処理。
- 保存: 入力と出力はclient／owner artifact。本文をtelemetryへ送らない。
- 禁止: 自動執筆、権利未確認原稿の利用、note投稿、販売。
- 完了: 入力schema、出力size、本人review。sample結果だけでは次stepへ進めない。
- 互換: `article-preparation@1`の二工程では出典整理後に実行する。

正本: [`contracts/article-tool.json`](../contracts/article-tool.json)、[`contracts/article-fixtures.json`](../contracts/article-fixtures.json)、`lib/mr-tools.ts`。

## 11. 出典整理ツール

- 目的: Markdown本文内のURLを重複整理し、codeや非link出典を壊さず一覧化する。
- 入力／出力: UTF-8 Markdown。PC Connectorは入出力各65,536 byte、3秒、同時1件。
- 実行: browser、PC固定CLI、Android固定Tool。
- effect: local-pure。network先の記事内容は読まず、URLを整理するだけ。
- 禁止: 出典の事実確認、引用妥当性の保証、本文内容の外部送信。
- 完了: 同じ入力から同じ出力、重複URL、CRLF、code、絵文字fixtureが一致する。
- 失敗: size、timeout、原本hash不一致、未知入力を拒否する。

正本: [PC citations adapter](pc-citations-adapter.md)、`toolkits/mr/pc_citations.py`、Android `article-tool`。

## 12. 納品記録の照合

- 目的: 契約条件、成果物、制作記録、独立reviewの不一致を納品前に発見する。
- 入力: 構造化された契約、成果物参照、制作log、別review。
- 出力: 一致、不一致、欠落のcheck report。
- 実行: 本人PCのPython。指定file以外を走査しない。
- 禁止: 品質の自動保証、秘密情報不在の保証、自動納品。
- 完了: 全参照file digestと照合結果を表示し、本人が納品判断する。
- 失敗: file欠落、schema不一致、別成果のdigestを拒否する。

正本: `toolkits/mr/rock_star_tools.py`、[Mr integration](mr-integration.md)。

## 13. サブスク顧問

- 目的: 契約、更新日、支払い失敗、定期課金候補を通貨別に確認する。
- 入力: PC local SQLiteの契約とcard明細由来候補。
- 出力: 要対応、更新予定、通貨別月額。異通貨を勝手に合算しない。
- 実行: PC MCP。Sky側はread-only。
- 保存: 契約dataは本人PC。Skyは入力本文を保存しない。
- 禁止: 解約、支払い、税務申告、card操作。
- 完了: Connection Passportとfresh health後にqueryし、最終確認時刻を表示する。
- 失敗: 接続staleをoffline／unknownとし、古い値を最新と表示しない。

正本: `toolkits/rockstar-ledger/README.md`、`lib/subscription-advisor.ts`。

## 14. 法務受付

法務・特許のオンライン処理は共通Responses transportを利用する。資格情報はserverだけで使用し、20秒のabort、redirect拒否、`store:false`、失敗時の自動再送なしを維持する。未完了・不正JSON・公式citationなしを成功にしない。成功応答には実model・経過時間・検証済みtoken数（欠落/不整合ならnull）・観測したweb検索call数を返す。これらは応答metadataであり、D1利用台帳・請求額・provider invoice照合の完了ではない。入力本文を追加保存しない。trusted料金表、検索料金、本人の予算予約、精算が同じ経路へ接続するまで料金gateは閉じ、資格情報だけで実行を開始しない。本人認証とRockstarサービス利用権checkを保持する。公開版では既存のpreview設定を維持し、利用権enforcementの有効化とclaim用D1 migration受入は別作業である。Fixture合格と実provider実行を区別する。公式schema: https://developers.openai.com/api/reference/cli/resources/responses/methods/create 。

- 目的: 状況を整理し、政府・裁判所等の公式情報と無料窓口を案内し、必要なら専門家への引継ぎを準備する。
- 入力: 分野、地域、危険、逮捕、公的書類、期限、状況、希望。
- 出力: 緊急案内、確認事項、公式source、一般情報、引継ぎsummary。
- 保存: 相談本文をSky serverに保存しない。AI利用時は明示同意した内容だけ送る。
- 禁止: 法的助言の断定、期限確定、勝敗予測、自動連絡、受任保証。
- 緊急: 差し迫る危険は通常Tool flowより緊急serviceを優先表示する。
- 完了: allowlistされた公式citationを持ち、本人が専門家連絡内容を確認する。
- 失敗: jurisdiction不明、公式sourceなし、緊急性不明では追加確認または安全案内へ止める。

- 外部実行: 現在の`/api/legal-guidance`はSky service scopeを確認後、料金見積・上限・利用明細が未受入ならProvider送信前に503で停止する。ローカルガイドは利用できる。
正本: [Sky legal intake](sky-legal-intake-20260912.md)、`lib/legal-intake.ts`、`lib/legal-ai.ts`。

## 15.5 Jev品質評価

`jev-evaluation` は本来、本人が送信対象・送信先・料金・保持条件を確認した後に、最小化した入力を評価するremote evaluatorとして設計する。現在はprovider price quote、owner cap、usage receipt settlementがAPI経路へ未接続のため、server routeをfail-closedにし外部送信を拒否する。料金gate、Sky scope entitlement、明示同意をserver側で受け入れた後に限り再有効化する。評価Receiptはreview signalであり、権限付与、Tool成功、仕事完了、専門家判断の代替にはしない。

## 15. 特許出願アシスタント

- 目的: 発明情報、先行技術候補、差分、明細書、請求項、要約のdraftを準備する。
- 入力: 発明者／出願人候補、公開状況、課題、仕組み、構成、効果、既存技術差。
- 出力: disclosure、official DB search plan、citation候補、claim chart、filing packet draft。
- 保存: 発明本文をSky serverへ保存しない。AI調査は明示同意後だけ送信する。
- 外部実行: 現在の`/api/patent-research`はSky service scopeを確認後、料金見積・上限・利用明細が未受入ならProvider送信前に503で停止する。端末内ドラフトは利用できる。
- source: 公式特許DB等のallowlist。引用なしのAI断定を受け入れない。
- 禁止: 特許性、登録、侵害回避、法的発明者、権利帰属、期限の確定。自動署名、支払、提出。
- 完了: public disclosure警告、source付き比較、human／professional review gateを持つ。
- Material連携: avocadoMini eventの人、AI、simulation、文献、実測を分けたpacketを受ける。bridgeは未実装。

正本: [Patent assistant](sky-patent-assistant-20260912.md)、`lib/patent-assistant.ts`、`lib/patent-ai.ts`。

## 16. 導入候補22件

### Zemaでの個別入口（2026-09-25）

ZemaのBot一覧と担当選択には22候補を個別Tool IDで表示する。各候補はSky/Zema共通の固有アイコンを持ち、検索、選択、状態確認ができる。選択だけでSky接続済み、Provider接続済み、`ready`にはならない。Zemaで書いた依頼は、同じTool IDの確認画面へ引き継ぐ。ローカル下書きと接続計画はSky共通ジョブとして記録し、外部作用は起こさない。

| 区分 | 現在の入力・出力 | 完了表示の意味 | 残る受入 |
| --- | --- | --- | --- |
| 旧Mr.由来11件 | 本人が入力した文から、Tool別のローカル下書き・整理結果を作る | 下書きの作成と表示のみ | 元Service Cell、Coconala、Calendar、Telegram、Product Hunt等の本体接続・権限・成果照合 |
| 外部研究Tool10件 | 本人の目的から、Tool別の実行環境・最初の安全な試験・停止条件を整理する | 接続計画の作成と表示のみ | upstream導入、資格情報、実runtime、権限、fixture、失敗・停止試験 |
| IP Studio 1件 | 専用ローカルアプリへの入口 | 起動・実行成功を意味しない | PC serviceの稼働、素材・生成・投稿の個別受入 |

入力本文と出力はZemaの同一タブ会話に一時復元され、共通ジョブには状態と実行量を記録する。外部Toolの音声、画面、Git差分、個人アカウント、秘密情報はこの確認処理では取得しない。失敗時は結果を成功扱いせず、入力と接続状態を見直して再実行する。将来の本体接続は各ToolのPassport、effect、本人承認、独立した結果検証を通す。合格条件は全22件が個別アイコンと担当として見え、依頼から正しい個別画面へ進めること、旧Mr.の下書きと外部Toolの接続計画を混同しないこと。外部サービスの実行合格は別証拠を要する。

### 追加された候補

`rockstar-ip-studio` はSNS・ゲーム運用の候補。`coconala-proposal-draft`、`gig-workflow`、`coconala-inbox`、`youtube-script-writer`、`seo-blueprint`、`landing-page-sprint`、`sales-objection-reply-builder`、`user-interview-synthesizer`、`calendar-coordination`、`telegram-notifications`、`producthunt-discovery` は旧Mr. Automation由来の候補である。いずれもSkyのcatalogには登録済みだが、本人接続、権限、保存、外部作用、結果確認をToolごとに受入するまで、実行済み・接続済みとは表示しない。

### faster-whisper

音声を本人PC内で文字起こしする候補。採用前にmodel license、download、CPU／GPU、音声形式、言語、精度、処理時間、保存、削除、speaker情報、MCP schemaを固定する。現時点は自動導入・実行・収益連携なし。

### Transformers.js

browser内分類・要約等の候補。library licenseと個別model licenseを分け、model hash、WebGPU fallback、memory、download容量、cache、input privacy、出力schemaをToolごとに受け入れる。現時点は特定modelも処理も未選定。

### Playwright

許可されたWebテスト・操作の候補。origin allowlist、credential保管、操作schema、screenshot、download、外部送信、CAPTCHA／MFA、利用規約、external-write承認、結果不明を設計するまで第三者siteの無人操作を許可しない。

### Jev Ultrafast

構造化したWeb操作候補からAIが一手を選ぶbrowser agent候補。RockstarOSでは専用Chrome profile、一仕事一tab、origin allowlist、`observe`／`prepare`／`act`の三段階、有限operation、秘密入力拒否、external-write直前の一回承認、完了の独立検証を必須にする。upstream sourceとMIT license、Python 3.12以上、Browser Harness、外部APIを確認済みだが、source取得、依存導入、API key接続、MCP adapter、Chrome操作は未実施。詳細は[Jev Ultrafast統合設計](jev-ultrafast-integration-design.md)。

### OpenJev

公開4B model等を使い、文章を生成せずruntime-defined optionの確率を読むlocal decision候補。Python 3.10以上、CUDA、GPU、model downloadが必要。model revision、prompt hash、calibrationを固定し、結果から外部作用を直接実行しない。

### Jevlike

変化する選択肢を採点する小型modelの学習・評価候補。dataset／checkpoint provenance、train／validation分離、model card、誤選択を検証するAI Lab用途とし、game demoを一般的な判断能力の証明にしない。

### Jev Trader

order bookから売買方向を選ぶ市場研究候補。RockstarOSでは`PRIVATE_KEY`を渡さず、固定replayとPAPERだけに限定する。実注文、実資金、LIVE、収益実績への計上を禁止する。

### Awesome Jev by TypeSafe

communityによるuse case、pattern、prompt、starter codeの資料集。実行ToolではなくDesign Libraryのreference-onlyとして登録し、紹介先のlicense、価格、model、外部作用を個別に確認する。

### TypeSafe Computer Use

OCR等でMac画面を読み、Jevが次のactionを選ぶPC操作候補。専用macOS account、許可app、observe mode、emergency stopを必須とし、Terminal、system設定、credential、決済、無承認送信を拒否する。

### Jev Review

Git差分または指定codebaseを段階的にreviewする候補。scopeとcommitを固定し、秘密fileを除外する。report作成までで、自動修正、commit、push、merge、issue投稿は行わない。

### Jev Router

Codex／Claude Codeの新しいturnをmodelへ振り分ける候補。既存CLIのsession、permission、authenticationを維持し、routingを権限拡大やprompt改変に使わない。

現行Sky詳細は候補の状態・対応PC環境・料金・公式導入先を示すだけで、従来の「接続条件の下書き」実行欄をJev Routerでは表示しない。機能・料金・提供元は押せるアイコン内の情報パネルにまとめ、本文には未接続とPC CLI導入条件を残す。アイコンを押しても導入・認証・外部送信は始まらない。対象は本人PCのCodex CLIまたはClaude Code、Node.js 20.12以上、TypeSafeの認証済み環境であり、Sky Web／native OS／スマホからのワンクリック接続は未実装。入力となる依頼文を外部へ送る場合は本人の同意と費用上限が必要で、ブラウザへAPIキーを入力させない。対応環境の表示と実際のCLI導入・認証・実行成功は別状態として扱う。将来の接続完了条件は、PC側の限定adapterによる存在・版・認証状態の検証、routing-only試験、既存CLI権限の維持、失敗時のfallback、費用と選択理由のreceiptを本人が確認できること。未達なら接続済みと表示しない。

### Jev Browser

既存browser toolの観測・操作・検証loopでJevが要素を選ぶ候補。installerを自動実行せず、専用profileとowned siteのread-only試験から始め、各stepをBrowser Brokerで検査する。

### Mobile Jev

Mobilerun経由のAndroid操作候補。Rock所有のwipe可能な試験端末と許可appだけを使い、個人端末、SIM、連絡先、写真、password、決済、予約確定、権限変更を拒否する。TypeSafeの意味判断を端末から使う実装候補として、`android/jev-provider`にpublic-only typed request、固定公式endpoint、bounded response、cost／timeout gate、advisory-only resultのsourceを追加した。ただしpackageは専用UID／network domainでmanifest-disabled、product既定除外であり、safe key provisioning、Mobile操作、Broker／Tool統合、実機受入は未実施である。既存の`android/jev-preview` loopback debug clientはMobile JevやOS componentの受入証拠に数えない。

10件のJev ecosystem全体の役割分離、共通schema、Tool別権限、受入順は[Jev ecosystem全体詳細設計](jev-ecosystem-integration-design.md)を正本とする。

候補はready Tool数、対応機能、収益機会へ数えない。

## 17. native開発Tool

Linux／QEMU imageには次の6 family・9 versionがある。

| family               | version       | 入出力                    | 権限                         |
| -------------------- | ------------- | ------------------------- | ---------------------------- |
| 共有用チェックリスト | 1.0.0 / 2.0.0 | text→Markdown checklist   | `text.input` / `text.output` |
| 引用整理             | 1.0.0         | text→整理済みtext         | 同上                         |
| 提案下書き           | 1.0.0 / 1.1.0 | 募集条件→draft            | 同上                         |
| 文章を整える         | 1.0.0 / 2.0.0 | text→空白整理text         | 同上                         |
| リストの重複を整理   | 1.0.0         | lines→unique sorted lines | 同上                         |
| SHA-256              | 1.0.0         | text→hashとbyte数         | 同上                         |

すべて端末内の有限処理、価格0、公開RFC test鍵の開発package。本番作者identity、商用安全性、Android移植を証明しない。

正本: `systems/rock-star-os/examples/registry/`、`systems/rock-star-os/docs/TOOL-SDK.md`。

## 18. Material Inventionは通常Tool一個ではない

Material Invention／avocadoMiniは、Core、sensor、XR、Safety、Simulation、Patent AI、labを束ねるapplication systemである。SkyからsimulationやPatent AI等をTool／Providerとして選ぶが、候補graphと証拠の正本はMaterial Invention Coreに置く。詳細は[空間発明システム設計](rockstaros-avocado-mini-complete-design.md)。

## 19. Game、Wallet、Fundも通常Toolと区別する

- Game本体はapplication。生成や変換だけをToolにできる。
- Walletは金融台帳・Provider境界。通常Toolの自己申告で残高を変更しない。
- Fundは確認済み実績から構成を比較するsystem。Tool自身に配分authorityを与えない。
- ATMはWalletとは別adapter。ATM手数料0を他Tool料金へ転用しない。

## 20. Tool追加の完了条件

1. `lib/catalog.ts`またはnative Registryへidentityを追加する。
2. 共通Tool契約11区分を全て記載する。
3. 入力・出力schemaと正常fixtureを追加する。
4. size、unknown field、重複、timeout、cancel、通信断の負例を追加する。
5. effectと承認点を分類する。
6. secret、保存、保持、削除、telemetryを記載する。
7. artifactとreceiptを分ける。
8. Zemaで開始、進捗、停止、review、結果を扱えるようにする。
9. fixture、Web、PC、QEMU、APK、OS image、Provider、本番の合格を分ける。
10. 全設計台帳と本書へ追加し、`npm run design:check`を通す。

## 21. 現在の共通未完成点

- 第三者Toolの本番author identity、署名登録、失効、review、sandbox。
- 一般Tool capability schemaとAndroid P1 AIDL／native package／MCPの相互運用。
- CPU、memory、storage、network、電池、熱の強制quota。
- external-write outboxとProvider照会の全Tool共通実装。
- 多端末selectionと一つの仕事のauthority移送。
- 本番料金、返金、dispute、receiptのProvider横断契約。
- candidate 13件の採否と具体的Tool schema。Jev ecosystem 10件は統合schemaを設計済みだがruntime未実装。

これらを未決定のまま「全Tool platform完成」と表示しない。

## Sky単独アプリの配布入口（2026-10-01）

SkyはOS内と単独Webアプリで同じマーケットプレイスを共有する。OS導入を利用前提にせず、単独アプリはSky専用manifestから `/sky/marketplace` を開く。詳細な起動範囲、本人認証、未接続Tool、オンライン条件、Mini実機との境界は[Sky仕様](sky.md#単独アプリとos内の共通マーケットプレイス)に従う。元のデザインとOSの起動設定は保持する。公開配備・実端末導入は未受入。

### 法務・特許の任意ローカル実行履歴（2026-10-01）

ROCK／WEB04・SKY21: 既存の端末内ガイドを維持し、初期値オフの明示チェックでのみ既存jobs状態機械へ記録する。入力は端末内、出力は画面／本人によるダウンロードに保持し、serverへはTool ID、browser実行、日時、成否、処理時間、入出力バイト数を送る。本文・名前・発明内容は送らない。緊急の法務案内は履歴・認証を待たず表示する。オンライン調査の送信同意とは独立し、この履歴はlocal実行だけを対象とする。

ログイン失効、通信断、曖昧なstart応答では純粋なlocal計算を一度だけ実行し、履歴未保存を表示する。別タブでサインインして元画面の入力を保持し、本人の再実行で復旧する。完了通知の再送はmetadataのみで、生成処理を再実行しない。完了保存失敗でも結果を保持し、保存済みとは表示しない。合格条件は未同意時に通信0、同意時に本人別完了記録が残ること、未認証でも結果が返ること、本文非送信、二重生成なし。provider応答・cloud usage・本文の復元はこの記録では保証しない。自動試験と公開UI/D1の受入を別々に記録する。

Market `/market` の認証失効はHTTP 401で判定し、同じ画面に別タブのサインインと再読込を表示する。入力画面を維持し、認証後は既存GETで状態を再取得する。法務のlocal履歴保存中はオンライン調査と表示せず、本文の端末内処理とmetadataの通信を区別する。公開UI受入を別記する。

受入追記: Sky公開v15、Pixelの両Tool completed metadataをD1で確認。特許の初回保存は未確認（原因未特定）、入力保持後の明示再実行は保存成功。desktop未認証法務の結果保持・未保存表示と、Market 401の別タブsignin/reload・検索入力保持を確認。全体verify620件、Fashion19件、API540項目合格。cloud実応答、owner再認証、Apple Pay、未試験Toolは残る。

履歴保存の診断: owned JSON APIのHTTP status、TIMEOUT、NETWORK、INVALID_RESPONSE、CLIENT_ERRORだけを表示し、応答本文・元例外messageは診断へ転記しない。非JSONの401も認証失効として扱い、redirectを追わない。完了通知失敗は本人の受付IDと固定codeで履歴を照合できる。local計算自体の例外は保存失敗と混同せず、一度だけ失敗を返し、成功結果や自動再実行を捏造しない。初回Pixel特許保存失敗の過去原因は未特定のまま保持する。関連14試験合格、公開受入は実施中。

### PAPER市場の実行結果とサンプル表示

`/market`の既定6対象はPAPERのサンプル。架空の出来高・騰落率・VERIFIEDを表示せず、参照価格と実売買実績でないことを明示する。APIの所有者別proposal／receipt／positionを使い、提案内容（方向・数量・単価・合計）を承認前に提示する。提案成功後は入力チケットを閉じて同じ画面の承認欄へ移動する。実行済みは最新20件を履歴に残し、レシートを再読込後も表示する。JSON応答、401転送、10秒期限は共通requestで確認し、通信失敗を実行成功としない。外部注文、送金、実資金の承認には使わない。合格証拠はPixelでPAPER提案→承認→実行の状態とD1の対応する3記録、公開UIの再読込とreceipt一致。現在Cloud AI／外部サービスの実行受入を意味しない。

PixelのPAPER実行履歴受入で、旧Market共通CSSの絶対配置により検索欄が仮想残高へ重なる問題を確認した。800px以下のPAPER workspaceに限定して検索をheader gridの2行目へ通常配置する。合格条件は検索・仮想残高・保存済み履歴の公開実機スクリーンショットで重なりがないこと。既存Skyカードと他Market面の配置は変更しない。

2026-10-02配備受入: 同じSky v27/source 3e895271f4b01542109882fa6c7af521d8166f1bへ上記quote/history UIを配備。schema version 2/quote 0件/旧50円完了保持とdesktop未認証案内を確認。正本full verify663/19/858、Site対象30＋更新15項目合格。raw trigger SQLのnative分割は失敗したため、起動時D1 batchへstatement全体を渡し全guard適用後にAPIを開く。これを実Provider価格・請求、本人quote作成、Pixel UI受入へ転用しない。Pixelはowner解除待ち。

### 掲載候補の入力忠実性と個別受入（2026-10-02）

全34件の画面をSky v28のbuildで個別確認し、20候補を合成ownerの実Worker/D1で実行・完了記録・結果バイト数まで照合した。11件は端末内の定型下書き、9件は接続計画。サービスとしては過去の限定本番受入3／local14／接続必須16／当環境で利用不可1に分類する。各IDと環境・保存範囲は`docs/evidence/sky-individual-tool-verification.json`へ記録し、これだけで同じ公開版の全顧客導線や外部サービス成功を合格にしない。

顧客インタビューの固定テーマ・仮説と予定調整の固定日時・時間・形式が入力に反することを再現した。候補処理はAI分析済みと表示せず、入力を添えた記入用テンプレートであることを画面と出力へ示す。2 Toolは未検証のテーマ・仮説・日時を自動確定せず、確認欄を未記入にする。本文・結果はserverへ送らず、共通jobsへ状態・処理時間・サイズを記録する。reloadで候補の本文は復元されないため、Markdownを手元へ保存する。クラウドAIの実接続とカレンダーOAuthは残る。合格条件は異なる合成入力でも固定の事実を捏造せず、入力保持、外部未実行表示、metadataと出力サイズ一致を再buildしたUIで確認すること。

候補の認証失効試験では、旧共通signinが同じタブを遷移させ、直接Tool画面の入力がサンプルへ戻る不具合を再現した。共通ExecutionSigninは元画面を保持し、別タブsigninと明示GET接続確認へ変更する。成功はowner jobsのJSON配列を読み戻して判定し、401/redirect・通信失敗・不正JSONでは既知の失効を解除しない。接続確認はjob作成/実行を再送せず、本人の次の実行まで入力をメモリへ保持する。全Toolの本文を10分保存すると誤って約束していた共通説明も訂正した。候補と記事Toolで未認証→別タブsignin→接続確認→一度だけの実行、確認失敗時の停止を再buildしたUIで受け入れる。

配備受入: 既存Sky v30/source 5bdb4ecc0a1f12eb7036163818c4bbb86e224e78、env rev2で公開成功。20候補の処理と保存サイズ照合、2入力反例、candidate/articleの別タブsignin復帰・503時停止・手動2回だけの記録を合成Worker/D1/UIで確認。公開未認証UIで新案内・別タブtarget・実行停止を読み戻した。正本verify692/19/948・exit0、Site type/lint/build/bundle/assets合格。Site全設計検査は元v28に欠けているeSIM設計参照で失敗し、全体greenに換算しない。旧50円completed/stripe_verified/attempt1/rev3を配備後も確認し、新規課金なし。実Cloudは0件/資格情報なし、Pixel 10は現時点Keyguard showing=true。owner desktop/Pixel、Apple Payと実Providerは未受入。GitHub mainはb3e2676、今回の正本変更は未pushでSitesソース保存と区別する。

## 接続確認とサインイン復旧（共通Web実行）

目的は、認証と履歴保存先を確認してからToolを起動し、通信失敗・認証期限切れでも現在の画面の入力を保持すること。ROCK/WEB04が共通hookと画面を管理し、本人認証はSites gateway、外部OAuth・実行権は各Providerの責任とする。

- 入力: `/api/jobs` の本人別一覧取得。出力: `checking` / `ready` / `signin` / `unavailable`。一覧の配列応答だけを接続確認成功とし、401/認証redirectはサインイン、その他のHTTP失敗・通信切断・10秒timeout・不正な応答は接続未確認とする。
- `checking`・`signin`・`unavailable`では実行/設定保存を停止。別タブのサインインから戻り、同じ画面で読取専用の再確認を行い、本人が改めて実行する。再確認は仕事/課金/外部送信を作成せず、古い確認応答で後発の認証失効を解除しない。
- 入力の保持は開いている画面のcomponent memoryのみ。新しいbrowser storage、URL本文、サーバー本文保存は追加しない。再読み込みは未保存入力を失うため案内する。既存の端末成果保存と本人別server実行metadataは別の保存範囲。
- 接続設定は認証復旧後に本人別一覧を再取得する。編集済み入力を取得応答で上書きしない。取得失敗中は設定保存を止め、読取専用の再取得を提供する。設定保存をOAuth/外部実行成功と表示しない。
- 合格条件: 通信切断/503/不正配列/timeout/401で実行停止、入力保持、再確認のwrite 0、復旧後の明示実行1件、metadata保存、結果の端末保存/再取得、接続設定の再取得と編集保持。秘密値/実ユーザー本文を障害fixtureへ入れず、合成ローカル受入を本人実機/本番へ換算しない。
- 未決: 本人desktopとPixelの現行公開版での再受入、Apple Pay対応端末、実AI資格情報/信頼済み料金/予算。公開済みの判定はnative deployment結果を別に記録する。

## Tool・eSIM・クラウドの共通決済（2026-10-05）

Sky購入画面から`/sky/payments`で本人の注文・CSV・確定usageと入金/返金を確認する。Tool売上10%は従来どおり、クラウド原価へ10%を自動加算しない。eSIMはアクセス経路で、別の支払権限や二重請求対象ではない。直接LLMのtest回収は永続実行ID/金額/通貨/digestを照合し、A2Aは既存Wallet精算を維持する。共通transportはMini/Fashionにも配布するが、別Siteの顧客・注文・merchantは自動統合しない。詳細の11項目（目的から未決定の決め方まで）は[共通決済契約](sky-billing.md#共通決済2026-10-05)に記載。本番クラウド課金は未受入。

## Optional eSIM cloud access — 2026-10-05

既存BIZ01/SKY19/BIL02のeSIM導入証明を、owner別クラウドアクセスキーへ接続する。`/sky/purchases`で導入確認後に開始し、期限・再発行・停止を管理する。`/connect`は通常Web/appと併存する任意入口を案内する。目的、責任、設定、入出力、状態、保存、失敗、復旧、承認、合格条件と未決定事項は[共通契約](sim-led-product-architecture.md#optional-esim-cloud-access-implementation)を正本とする。

追加保存はWeb D1 migration `0059`のhash/owner/order/device/receipt/scope/expiry/失効履歴。署名済みinstall proof、gateway鍵、現行Package審査、返金状態を使用ごとに照合する。キーは許可されたcloud APIだけへ接続し、同じownerの見積・予算・usageを再利用する。eSIM同梱Starter Packの表示を既存利用権APIへ追加し、OS Brokerの権限・本人承認・Tool成功へ昇格させない。キー自体で支払いや管理操作は行えない。未設定は提供準備中、競合は状態再取得、紛失は再発行、失効は拒否し既存成果を保存する。自動的なブラウザ起動、実通信会社接続、実機導入、商用クラウド実行、従量単価と合算請求は未受入。[ローカル証拠](evidence/esim-cloud-access-local.json)を本番成功へ読み替えない。

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

## IP Studioから現実とGTAへの出力（2026-10-09）

同じIP／作品／Agent設定を現実のサービスとGTA向けrenditionへ展開し、結果をZemaへ返す。[橋渡し仕様](gta-reality-bridge.md)をIP StudioとGame連携の追加契約とする。目的・体験・責任・入出力・状態・保存・失敗復旧・承認・受入・未決定事項を同文書に定義。NUI表示、3D導入、NPC動作、現実の外部作用は別能力とし、最初のFiveMデモ候補を本番対応や金融交換へ換算しない。新しいready Toolは追加せず、adapterも未実装。

## Skyのアプリ内成果受け皿（2026-10-12）

Sky単体は各アプリへAgent能力を接続するplatformで、OS上のZemaは仕事全体の管理役とする。Skyに成果の共通履歴を用意し、第一者同一originアプリへ本人別の保存済み成果だけを渡す。例のFitnessアプリは `sky.fitness.plan/1` の型付きテキストだけを運動プランとして描画する。目的、入力、責任、状態、保存、失敗、復旧、承認と外部アプリへの拡張条件は[Sky App Output Plugins](sky-launch-design.md#sky-app-output-plugins)を正本にする。これは新しいcatalog Tool/Agentの実装ではなく、既存成果の出力先の追加である。外部アプリ向け実行権付与や任意callbackは実装済みとしない。

## 大学別NFC Sky（2026-10-12）

入口全体は[NFC・通常Web・任意eSIM・iOSの共通仕様](sim-led-product-architecture.md#sky-shared-entry)へ同期する。指定チャットの最新方針により既存SkyのAgentフィード・役割・Market・接続・Sky内Zemaを共用し、大学別の独立したフォーム中心Hubを主画面にしない。eSIM/OSは単独Skyの利用条件に加えない。以下の枠・本人・保存契約を保持し、旧Hubの試験、現行source、GitHub main、異なる公開Siteの受入は別に記録する。

利用者の明示指示を受け、NYU・FIT・Columbia・Fordham・John Jayの学生向けに、既存OSのブラウザから使うSky入口を追加する。一般のMCP無料接続枠は5個、対象5大学学生の特別枠は6個。一般6個目・対象学生7個目から有料拡張の対象とする。金額・期間・税・返金条件は未決定で、現時点では追加購入を有効にしない。既存のTool売上10%・Cloud使用料・外部実費とは別の接続枠方針である。

目的はポスターから大学別の制作・研究・協働へ短い手順で入ること。NFCにはHTTPS URLだけをNDEF URIとして書く。同じURLをQRにも用い、NFC非対応時もbrowserから開ける。OS binaryやSkyをタグへ格納せず、OS導入・SIM/eSIMを必須にしない。大学との提携や公式サービスは未確認であり、学生コミュニティ向けの独立サービスと表示する。

入力は許可済みcampus ID（nyu/fit/columbia/fordham/johnjay）、既存tag ID、本人の3項目各500文字の下書き。出力は大学名付き画面、用途別brief、テキストdownload/copy、既存Zema入力への一回限りの引継ぎ。NYUはfilm/AI/startup、FITはfashion/portfolio/branding、Columbiaはresearch/evidence、Fordhamはcommunity/career、John Jayはcivic/policy。下書き整形は決定的なbrowser処理でAI回答と呼ばない。Zema以降の仕事は既存lib/workflow.ts、本人・revision・予算・承認に従い、自動実行しない。

入口は `/sky/campus/{id}`。大学選択は `/sky/campus`。既存Campusのタグ登録にskyモードを追加し、登録済みSkyタグ `/t/{tagId}` は大学別Agent Hub `/sky/campus/{id}/hub` へ直接解決する。既存のSkyタグが大学別トップを保存している場合もHubへ転送し、tag/sourceの情報を維持する。従来の非Skyモードは維持。停止した登録タグは大学prefixによるfallbackへ昇格させない。未知タグは選択画面へ戻し、不正IDは404。DB障害時も直接の大学URLとbrowser briefは使える。端末がNFCのURLを開けば初回からHubを使えるが、iPhoneの背景読取りではOS通知を本人がタップする手順が入る。PWAの端末追加は利用者の操作に従う別状態であり、タグ読取りだけで自動installしない。[AppleのNFC仕様](https://developer.apple.com/documentation/corenfc/adding-support-for-background-tag-reading)、[PWA installの操作要件](https://web.dev/learn/pwa/installation-prompt)。

接続枠の権限はNFC/URL/cookie/localStorageから付与しない。本人認証後のCampus profileがstudentかつdomain_verifiedで対象5大学の場合のみ6枠。メールdomain確認は在籍証明そのものではなく、student属性は自己申告である。既存IdPで大学メールを確認できない場合は一般5枠を維持する。個別の在籍証明制度・有効期限が必要になった場合はOWNERが方式を決め、別の最小情報による受入を行う。

D1 `sky_mcp_slots` にowner ID・Connector tokenの一方向SHA-256 fingerprint＋server ID・表示名・作成時刻だけを保存する。トークン、認証メール、原稿は保存しない。1枠は1 Connector installation/serverで、内包Tool数は数えない。異なる端末の接続も本人の同じ上限へ合算。同じキーの再試行は冪等。SQLのcount・所属確認・insertを一文にして競合時の超過を防ぐ。接続失敗／結果不明では枠を保持し、再試行またはConnectorのdisconnect成功後に枠解除。PCを失った場合は本人の「Manage saved connections」でSky枠を削除でき、以後のSky prepare/executeを拒否する。枠削除は既存jobの停止やPC process停止ではないと画面で説明する。学生証明喪失時は新規追加を5枠以下に制限し、既存接続を無断切断しない。

WebのMCP接続・prepare・executeは本人の枠を確認する。ブラウザ→本人PCのConnectorという既存構成を再利用し、ユーザーが直接動かす独立OSS Connectorの利用や任意改変をSaaSの課金強制で制御できたとは扱わない。スマホ単独のcloud MCP relay/OAuthと、受入済みserver側実行境界へのquota強制はまだない。したがって今回の枠管理だけでスマホ外部MCP・全機能有料サービスのproduction合格としない。

責任: ROCKは画面・枠API・競合/owner分離・タグ無効化・回帰。EXTERNALはNFC端末挙動・IdP・MCP/AI provider。JOINTは公開同一artifactの本人A/B、実NFC/iPhone/Android、接続/実行/解除。OWNERは有料条件・タグ書込み対象・大学配布・外部費用上限。既存Sky公開先のv39を確認したが、この新差分の配備は別判定。

保存・削除・復旧: guest原稿はReactメモリのみ、画面離脱で消えるためdownloadを案内。Zema引継ぎは既存sessionStorageで10分・一回限り。profile削除は既存Campus管理、枠削除は本人のdisconnect。枠台帳はD1 backup対象、0063 migrationは追加のみ。rollbackでは台帳を保持し、旧版の枠非対応MCPを公開有効にしない。旧Skyタグは保存先を変更せず、読取り時のHub転送で互換性を維持する。

合格条件: 5大学名・各briefの入出力・copy/download/Zema引継ぎ、未知/停止タグ、一般5/学生6/超過拒否/同時要求/別owner/未確認所属/所属変更、320/390px表示を検査。`node --experimental-strip-types --test tests/campus-sky.test.mjs tests/campus.test.mjs tests/campus-store.test.mjs tests/sky-mcp-onboarding.test.mjs`、`npm run typecheck`、`npm run design:check`、`npm run verify`。本番公開・実NFC書込み・実端末・有料受入をlocal合格へ混同しない。

追加明示指示（同日）: Skyを学生のスマホに専用アプリのように置き、Sky MarketでAgentを購入した後もSky内でZemaを使って管理する。NFCのHTTPS URIは大学別入口だけを決め、学生資格・購入権・OS権限を付与しない。本人がbrowserのInstall/Add to Home Screenを選んだ場合、大学別manifestの固有ID・大学名・開始URLでPWAとして追加する。インストール非対応・拒否でも同じURLのbrowser版を使う。SkyのAgent Hubは既存の本人別購入履歴APIとZema job APIを読取り、決済未設定、未ログイン、通信失敗、保留/返金/失効を空の「利用可能」と誤表示しない。Marketへ大学文脈付きで戻れるようにし、Zemaは既存`sky-chat-workspace`と`lib/workflow.ts`の状態・本人・revisionを同じSky配下のURLで再利用する。購入前の価格・作者・権限・実行先を確認し、Apple PayはStripe Checkoutと端末/ブラウザ/決済設定が適格なときだけ提示され、決済成功は署名通知とProvider再照合を要する。購入したPackageのendpointを端末が直接実行できるとは限らず、実行権限は本人・有効な購入/サービス利用権・manifest版・Provider接続・予算承認をserver側で照合する。

Web体験の修正（同日）: NFCで到着するAgent Hubを宣伝文と空のstatusだけのLPにしない。最初に大学別の依頼入力と例を表示し、入力をtab内の一回限り・10分の下書きとしてSky内Zemaのcomposerへ移す。送信や実行は行わない。無登録で使える3項目briefは既存決定的`buildCampusBrief`を再利用し、結果をcopy/download/Zemaへ渡す。大学別のPeople・資料/案件・Sky Marketへ実リンクを出し、本人の仕事/購入/MCP接続枠は既存owner-scoped APIの状態を表示する。未ログイン・決済未設定・未接続を明示し、購入やAgentの稼働を偽装しない。PWA追加は補助導線に下げる。合格は初回画面から依頼→Zema composerの内容一致、guest briefの結果一致、5大学固有の見出し/例/導線、320/390pxの横はみ出しなし、本人別status読戻しで判定する。

最新の明示修正（同日、公開Sky確認後）: 上記の専用Hub画面を現行着地点として扱わない。Sky単体でも成立する既存アプリのフィード・役割選択・Tool詳細・Marketplaceを大学別Hub URLで直接再利用し、大学名と既存`ready` Toolのおすすめ、購入履歴・接続・Sky内Zemaの管理導線を変える。NFCから別LPや別仕事フォームへ誘導しない。大学別briefは `/sky/campus/{id}` の補助Toolとして残し、Agent選択・購入・接続・実行の代替とはしない。責任/状態/保存/失敗/復旧/承認は既存Sky・Commerce・Zema・MCP契約を共有し、大学IDを実行権限に使わない。合格は同じSky画面で5大学別おすすめと操作導線、390/320px幅、本人別の購入/接続/仕事の読戻し、決済からProvider利用と費用/停止までの縦断受入を分けて判定する。今回のローカル画面変更は前半のみで、後半の本番受入は未完了。

責任はROCKがmanifest/Hub/Zema内導線と本人別表示、EXTERNALがNFC/PWA挙動・Stripe/Apple Pay・Agent Provider、JOINTが実機/決済/実行の同一artifact検収、OWNERが販売条件と大学配布。入力は許可済み大学ID、本人セッション、購入/仕事の既存記録。出力は大学名付きSky、購入状態、仕事状態と次の操作。保存は既存購入台帳・仕事台帳のみを正本とし、PWA追加自体を購入権や本人資格として保存しない。通信/決済不明時は既存注文の照合を優先し、仕事の自動再送・二重購入・予算外実行をしない。合格条件は5大学manifestの識別、NFC/QR→大学名、browser/PWA導線、本人A/Bで購入と仕事の隔離、未決済/返金/失効の拒否、実Apple Pay適格端末、購入AgentのProvider利用とZema仕事readback/停止/費用、320/390px実機。現時点のsourceは入口・Hub・Zema再利用までで、実決済・スマホ単独Provider/MCP実行・本番公開は未受入。Agent販売対象/料金、Cloud実行先、学生本人確認水準、NFC配布先は各責任者の受入で決める。
<a id="sky-zoom-interpretation"></a>
## Zoom標準の翻訳字幕・音声を使う

2026-10-18の依頼は本人の日本語発話を相手の言語で字幕・音声として届けること。2026-10-19に利用者は、Zoom標準機能が存在するなら独自通訳を発明しないと明示修正した。以前の開発用字幕bridgeは撤去し、RQ01〜RQ49は変更しない。主担当はSky / MCPのSKY14・SKY15・SKY21 / ROCK、Zoom機能はEXTERNAL、二人の実会議受入はJOINT、会議・言語・利用権はOWNER。

1. **目的・利用体験**: 本人はZoomで日本語を話し、各参加者はZoom内で翻訳字幕と聞きたい音声言語を選ぶ。Skyの `/sky/add/zoom/interpret` はZoom標準機能の設定案内だけを表示し、翻訳・音声合成・手動字幕投稿は行わない。
2. **責任・権限**: ROCKは公式条件と未確認状態を分かりやすく案内する。Zoomは字幕生成、音声翻訳、配信と会議の権限を管理する。OWNERは会議と利用権を確認する。SkyはZoomのライセンス購入、会議設定変更、マイク許可を代理しない。
3. **入力・出力**: Skyの画面入力は相手の言語コードだけで、対応可否の参考表示と公式説明へのリンクを返す。音声、会議ID、字幕URL、翻訳文、Zoom credentialはSkyへ入力・送信しない。言語コード選択を利用可能の証明にしない。
4. **状態**: 利用権と対象言語の確認→Zoom会議で話す言語を日本語に設定→相手が字幕/音声言語を選択→相手側で短文を読んで聞く→会議終了。Skyに独立した通訳sessionや送信状態は作らない。
5. **保存・費用**: Skyは会議の音声/翻訳/トークンを保存しない。Zoom標準機能の利用権とAI Credit等の費用はZoomの表示・契約で確認する。Skyの使用量やZema仕事の完了として計上しない。
6. **失敗・復旧**: メニューが見えない、字幕または音声が届かない、言語が未対応の場合はZoomのアプリ版、ホスト設定、会議種別、追加利用権、言語ペアを確認する。受信を確認できないまま「送信成功」と表示しない。
7. **承認**: OWNERがZoomのプラン/追加利用権/課金を判断し、相手が自分の字幕・音声言語を選ぶ。Skyが第三者への音声送信、課金、Zoom設定変更を自動開始しない。
8. **言語境界**: Zoom翻訳字幕は対応言語とホスト設定で変わる。Zoom Voice Translatorの公式対応は現時点で英語、中国語、フランス語、日本語、スペイン語、ドイツ語、イタリア語、アラビア語、ポルトガル語。Live Translation add-onまたはZoomMate等の条件がある。任意入力を全言語の音声対応と呼ばない。未対応音声は正式な言語通訳チャンネルと担当者を別に検討する。
9. **既存契約との関係**: SkyのZoom会議メモAX readerは表示文章の読取であり、字幕/音声翻訳機能へ昇格させない。`meeting.notes` の仕事結果やBroker権限、本人承認をZoomの翻訳結果で変更しない。
10. **合格条件・検証**: 公式Zoom資料と実アカウントの利用権を照合し、二人の実会議で本人が日本語を話して、相手側で指定言語の字幕と音声を別々に確認する。hostの画面表示、fixture、概念図を相手側の受信証拠へ転用しない。コードは `npm run typecheck`、`npm run design:check`、`npm run verify` を通す。
11. **未決定の決め方**: 最初の対象言語、会議ホストの利用権、Zoomの費用、相手の環境を一会議で確認し、その後に対応言語を広げる。音声のない言語は通訳チャンネルの条件を先に確かめる。公式資料: [Zoom翻訳字幕](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0060844)、[Voice Translator](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0084896)、[言語通訳](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0064768)。

<a id="smis-three-connection-ways"></a>
<a id="smis-object-purpose"></a>
## 物を便利にする目的から必要な部品と同じEve仕事へ（2026-10-23本人指示）

変更理由は本人が「Eveにこの物をこう便利にしたいと頼み、今の部品でできることと足りない部品を確認し、そのまま担当作成・smis実行・保存・停止まで」と明示したため。物の種類を固定せず、目的と必要能力を照合する既存外付け試作の具体化。料金・RQ01〜49・既存store・一般ローンチ保留を維持する。

1. **目的・対象者**：ユーザーの自由な目的を入口に、現在確認できる入力と処理で進める仕事、追加部品が必要な仕事、部品があっても未対応処理がある仕事を区別する。部品の購入や物の名称を実接続・能力・権限へ換算しない。
2. **体験**：本人用 `/os/eve/module` で目的入力→必要な働きの候補→本人が追加／訂正／確認→今できること／部品／部品以外の準備→同じ画面の本人Eve・会話・実行先の準備→部品を固定し値を確認→同じ目的を引継ぎ→作る担当と実行内容の最終確認→既存仕事の実行→成果の文章保存→Thanks Eve／停止の照合。実行先を準備する前でも候補照合ができる。見張り／通知等を満たさない目的は準備待ちを表示し、実行済みとしない。
3. **責任**：主担当11 Material Invention／avocadoMini、既存SKY21・OS10・DSP01・ROCK。ROCKは `lib/smis-object-purpose.ts` の候補／照合と同じEveへの引継ぎ、EXTERNALは対象に合う部品・機種driver、OWNERは目的・必要な働き・取り付けと実行内容の確認、JOINTは同じPixelと基板での受入。LLMや自然文候補にTool権限を発行させない。
4. **入出力・上限**：目的300字、必要な働きは重複なしの既存候補11項目まで、その他200字、本人の確認bool。最初の候補抽出は端末内の限定的な語句照合であり、LLMが任意の物を理解／開発した証拠ではない。候補は動きの単発値、文章、水分、温度、重量、画像読取り、ボタン、開閉／着脱、音声出力、継続監視／通知、駆動。自由入力のその他は確認待ちになり、候補一覧を最終の機能上限にしない。機械的に実行可能なのは現在 `motion` と `text`、文章実行先は常に必須。今回読む生の加速度から重さ・水分・位置や画像内容を推定して実測扱いしない。
5. **状態・不足**：目的未入力→候補確認→本人確認待ち→準備待ち／確認範囲の文章仕事へ→Eveのreview→creating→running→result→停止照合→待機。水やり時期の例は水分センサー＋測定処理＋監視／通知処理が不足。micro:bitのボタン／スピーカーやPixelカメラを使う案は、既存部品の対応処理を先に確認し、自動で追加購入を求めない。接続が未確認なら基板・固定・電源・USBの準備と受信確認を表示する。
6. **保存**：準備前の目的／候補はprivateページ内のReact memoryで保持し、同じ画面で実行先を準備しても引継ぐ。再読込で消える未保存下書きで、新たなDB／sessionStorage／料金台帳は作らない。最終確認後の目的と選択範囲は可視の文章として既存owner別担当指示と同じ仕事入力へ保存し、既存pending／成果／export／削除を使う。アカウント／会話／実行先が変わっても新規承認を自動継承しない。
7. **失敗・復旧**：未確認・その他の未対応能力・不足部品・未対応処理・AI未接続で担当作成／実行を始めない。目的／選択／単発観測の再取得で元の確認tokenを同期失効。guardは取り付けscopeだけでなくrequest／suffixの一致をprepareとstartまで照合し、遅い応答から古い依頼を開始しない。切断後も元jobの読戻し／停止を残す。結果不明を自動再送しない。
8. **部分実行・互換**：足りない能力を黙って省かない。本人が「目的を今の動きの記録に変更して試す」を選ぶと、元の目的の未実行表示を残して新しい目的を作り、再確認を必要にする。既存用途入力／選択担当／savedWork／旧Pixel DTOと同じEveWorkPortを保持する。`@rockstaros/runtime`から候補・照合・可視依頼の4関数／定義を公開し、Mini／Proのhostも同じ照合を使えるが実driverは別受入。
9. **承認・公開・費用**：候補確認、部品選択、担当作成の最終確認、既存OSの権限／予算を分離。model／firmware／言語データの自動取得、購入、外部送信や部品操作APIを追加しない。部品不足表示は購入命令ではなく、適合と保持を確認するための候補。development opt-in＋loopbackだけのページを維持し、本番404・一般ローンチ保留。
10. **合格条件**：候補未承認／未知／不足処理で新規実行0、部品と処理の分離、内蔵ボタン等の不要購入0、目的の自由入力、明示した部分目的と元目的の分離、prepare／startの内容変更失効、同じ既存SQLite／担当作成／実行／文章export／停止／成果保持をhost合成試験で確認。UI実操作・実BLE・実モデル・Pixel保存先読戻し・音声・Mini／Proは同一候補の別受入。[証拠](evidence/smis-object-purpose.json)。
11. **未決定の決め方**：その他に書かれた働きや具体的な測定対象から、必要な情報・部品の適合・driver・校正・出力・停止を決め、機種と能力の実測受入後に対応候補を追加する。購入候補／実接続／実機受入の各状態を別に残す。

<a id="smis-removable-module"></a>
## 交換式の本体・物に合う取り付け部分・共通OS（2026-10-23本人指示）

変更理由は、30分の先行技術調査後に本人が「その構成を正本へ反映し、Pixelで同じ部品を違う物へ付け替え、Eveの担当作成から実行・成果保存・停止まで試せるように」と明示したため。物への内蔵・外付け・周辺観測を共存させ、RQ01〜49、既存料金、一般ローンチ保留を維持する。研究上の新規性や全物体への適合を確定しない。

1. **目的・対象者**：便利にしたいユーザーがEveで担当を作れる共通環境を開発する。電子本体は再利用し、物への保持と測定位置を決めるクリップ・バンド・台座・接触センサー等を対象に合わせる。Pixel・Mini・Proの共通Coreは同じ本人・担当・仕事・保存・停止を管理する。小型MCUは共通OSの周辺機器であり、同じLinux imageやLLMを全ての部品へ搭載する前提にはしない。
2. **利用体験**：本人用Eve→実行先と会話→部品を選ぶ→物へ固定して名前を確認→物を動かして受信値の変化を本人確認→観測を依頼に添える→目的と担当・実行先・出力上限を確認→担当作成・登録→同じ仕事で下書き→成果一覧から文章保存→Thanks Eve／停止ボタンで停止照合→待機→物との結び付きを解除→次の物へ。物の種類や仕事を固定用途リストに制限しない。
3. **責任・権限**：主担当はMaterial Invention／avocadoMini（既存SKY21・OS10・DSP01、ROCK）。ROCKは接続部・観測形式・取り付け世代・古い入力の拒否と既存Eve経路への接続。EXTERNALは基板・センサー・Bluetooth・ブラウザー・機種driver。OWNERは部品の調達・保持・物と観測値・目的・費用の確認。JOINTは同一Pixel・基板・プログラムの実受入。能力の申告・物の名前・加速度変化を本人認証、測定精度、Tool権限、物理接触の証明へ昇格させない。
4. **入出力・ID・上限**：先行試作はmicro:bit V2の加速度GATT service `e95d0753-251d-470a-a062-fa1922dfa9a8`、characteristic `e95dca4b-251d-470a-a062-fa1922dfa9a8`だけを読む。6 byte・little-endianのsigned int16×3以外は接続を終了。任意UUID・endpoint・shell・firmware書込・駆動部への書込APIを追加しない。`smis.module-observation/1`は本人、接続中部品ID、対象ID／名40字、取り付け世代、受信時刻・連番、部品自体の加速度生値を保持する。受信時刻は基板での測定時刻ではない。部品から10秒以上更新が届かない接続は利用不可。依頼に添えるのは本人が確認した時点の単発値で、実行中に新しい値へ差し替えず、現在値とは表示しない。依頼と可視の観測文を合わせて1000字以内。既存担当／model hash／仕事IDは既存runtimeで照合する。
5. **状態・失敗**：未接続→本人が機器選択→接続確認→受信待ち→物の確認→値の変化確認→依頼に添える。接続／再接続／付け直しで世代を変更し、旧scopeを利用不可にする。64 raw unit以上の変化の確認は動きの入力試験で、校正ではない。停止確認前は別対象の設定や新規実行へ進まない。実際に外したことはこの基板だけでは自動検出しないため、「外す」の本人操作が必要。将来の接点付き台座とは別の受入にする。
6. **保存・保持・削除**：Bluetoothの機器ID、連続値、対象の割当は画面のメモリだけ。写真・音声・MAC原本や鍵を追加保存しない。確認した単発観測と目的は、既存担当指示と同じ仕事の入力として既存の本人別保存へ入り、既存の保持・削除規則に従う。新Object DB・job・課金台帳を作らない。保存済み成果は部品を外しても消さない。成果の文章書出しは既存`runtimeEveTextExport`を使い、Androidで保存先ファイルを開く受入は別に行う。
7. **offline・重複・結果不明**：Bluetooth入力の切断・10秒の受信途絶・背景移行で新しい実行を止め、同じ仕事の停止照合を行う。準備中の取り付け変更は旧担当登録の中止照合へ渡す。既に配送された仕事は同じIDを読戻す。接続が戻っても自動で開始し直さない。画面再読込で部品が消えても既存pendingを復元し、読戻し・停止は利用可能にする。停止要求だけを端末停止済みと表示しない。
8. **更新・互換・復旧**：既存EveWorkPortをguardで包み、実装済みの目的→個人担当保存→端末登録→実行経路と同じpending keyを維持する。module依頼の確認内容を開始前に差し替えない。取り付け変更は新しい物／仕事として扱い、旧成果を新しい物の測定へ転用しない。同じ物の入力方式切替や永続的な対象再識別、Mini固有driverは次工程で、現試作に実装済みとは表示しない。
9. **安全・privacy・承認**：`/os/eve/module`は`SMIS_MODULE_PRIVATE_PREVIEW=1`かつdevelopmentかつloopback Hostだけの先行文書。dev serverも127.0.0.1へbindする。同じ限定文書にだけBluetooth(self)・microphone(self)を指定し、その他の既存policyを維持する。選択とbrowser許可前に機器を走査しない。public版のBluetooth禁止policyを変更しない。APK内WebView等にAPIがなければ対応外と表示し、Pixel Chrome等の対応browserを使用する。新モデル・言語データ・hex・依存物を自動取得せず、用途・保存先・取得／書込対象を本人へ説明する。
10. **合格・証拠**：hostはcodec、世代・本人・期限・切断・遅い応答・再読戻し、同じ部品を2対象へ切替、共通Eve作成／runtime／SQLite／文章書出し／停止を合成入力で検査。実受入は同一Pixelの対応browser・基板と準備用プログラムhashを固定し、異なる2物への実固定、実受信、実目的・担当登録・モデル生成、同じ成果のAndroid保存先での読戻し、Thanks Eve／停止と再開を確認する。host合格を実Pixelや全OS合格へ転用しない。本人は部品未所持と回答し調達予定。PixelのUSB接続は確認、画面接続はnative pipe closedで未受入。[証拠](evidence/smis-removable-module.json)。
11. **未決定・決め方**：最初に必要なのはmicro:bit V2 1台（動きの送信）、面ファスナー／柔らかいバンド（保持と付け替え）、適合電池ボックスと電池（無線状態の給電）、通信用USBケーブル（準備用プログラムの導入）。USB給電でも卓上確認は可能。自動着脱検出は接点付き台座とfirmwareが追加で必要。重量・温度・画像内容・駆動は個別の部品・配置・校正・権限・停止受入で追加する。部品が届いたら、まず保持と動きの読取りの実測で選定を見直す。購入や基板書込は今回実施しない。

部品選定の原文： [micro:bitのBLE仕様](https://lancaster-university.github.io/microbit-docs/ble/accelerometer-service/)、[MakeCodeの準備](https://makecode.microbit.org/reference/bluetooth/start-accelerometer-service)、[対応Chromeの条件](https://developer.chrome.com/docs/capabilities/bluetooth)。配布用hexは未生成。MakeCodeのBluetooth拡張で`bluetooth.startAccelerometerService();`を起動し通常のペアリングを使う。準備用プログラムの機種適合・実接続は基板到着後に確認する。

## ユーザーが作る担当と3つの接続方式（SKY12/14/21・DSP01）

2026-10-22の追加明示指示により、先行の外付け部品中心の試作順を、以下の共通環境へ拡張する。目的/担当を作るのはユーザー、実現環境を作るのは開発側である。

1. **目的**: 無機物・有機物に固定用途を押し付けず、ユーザーがEveで困りごとを役割・条件・必要情報・処理/Tool・成果へ具体化する。smisは実在する能力の組合せを接続し、OSは既存owner/workflow/予算/停止を強制する。
2. **体験**: Eveで担当作成→対象と結ぶ→必要能力の準備/不足を確認→内蔵/外付け/周辺観測の入力→対象/情報を本人が確認→同じ担当ID/版で依頼→既存仕事の結果/持出し/停止へ。開発側が列挙する探す/知らせる/作業支援/記録/環境調整等は例で、限定リストではない。
3. **3方式**: **内蔵**は対象内のsensor・通信・電源と必要な出力、**外付け**は着脱部品の識別・sensor・通信・出力、**周辺観測**はMini/Pixel等のsensorが対象を観測して担当へ渡す。LLM/Agentの重い処理は適合した端末/Linux/明示許可Cloudへ分担する。方式は組合せ可能。対象に電気部品がない周辺観測だけで、対象内にsensor/駆動機構があるとは扱わない。
4. **責任**: ROCKは作成/能力照合/共通観測/本人確認/既存仕事への接続、EXTERNALは機器/sensor/firmware/画像処理model/Tool、JOINTは同じ対象・機器・入力から成果/実出力/停止までの実測、OWNERは目的/対象/外部送信/費用/取り付け/結果の採用。Miniのdriver/全生体/製造受入は別gate。
5. **入出力**: 役割は既存`SkyAgentSettings.instructions`と`attachment`を再利用。初期観測`smis.visual-observation/1`はsource(browser-camera/mini-camera)・時刻・64×64 RGBA由来の見た目特徴。`observeSmisPixels`/`matchSmisVisualObservation`をportable runtimeにも公開し、camera固有の切出しは`lib/smis-camera.ts`へ隔離する。Miniは同じ画像を渡す入力adapterを別実装し、存在しないdriverを搭載済みとしない。
6. **状態**: 本人確認→担当選択→明示camera許可→3回の対象登録/背景登録→候補/不明/曖昧→本人確認→現在のowner/担当版/有効状態再照合→camera停止→Eveの同じ担当へ。識別と、画像内容理解/実測/権限/仕事の実行成功は別状態。候補は10秒、Eveへのtab内参照は2分の期限。再読戻しで別owner/停止/改版/不明では代替しない。
7. **保存**: 写真/映像/音声をupload・永続保存せず、3参照と背景の数値特徴をowner別browser領域へ保存する。最大10対象/150k文字、既存account/Agent/仕事/料金DBを新設しない。Eveへの参照はowner/担当ID/版/対象名/観測と本人確認の時刻/sourceだけ、秘密/写真/指示/実行grantをURLや参照に混入させない。特徴も対象の手がかりなので本人が消せるようにする。
8. **失敗・復旧**: 暗い/一様/背景と区別不能/似た候補/古い観測は不明。camera拒否/取消/画面を離れる/pagehide/unmount/本人再照合切れでtrackを停止する。開始許可の遅い応答も世代番号で破棄し、停止後に再起動やEve遷移をしない。browser領域破損/上限は黙って消さず覚え直しを案内する。
9. **承認・実行**: cameraは専用`/sky/objects/camera`の同originだけをpolicyで許容し、入退出はdocumentを読み替えてSPA前pageのpolicyを引き継がず、他pageは従来通りcamera=()、マイクは全て無効。本人操作とbrowser許可後だけ開く。見た目照合は登録物の候補にすぎず、`authorizationGranted=false`/`semanticImageUnderstanding=false`/`physicalActionAccepted=false`。Eveでは過去の本人確認として表示し、仕事/外部送信/課金/機器操作は既存Brokerと明示同意を通す。
10. **合格条件**: source境界を共通化し、同じ画素でPixel/Mini sourceの候補が一致する合成試験、特徴の厳密形式/上限/不明・曖昧・背景/期限/owner分離/改版停止/遅い許可後の停止拒否を通す。実Pixelは実cameraの起動/登録対象と違う実物・背景の拒否/本人確認→同じ担当/再開・停止・背景移行/既存data保全を同一candidateで記録する。synthetic画像やDesktopの合格を実Pixel/実Miniの合格へ転用しない。
11. **未決定・次の開発**: 自由な役割を実行できるかはmodel/Toolが提供する実能力で診断する。文字/物体/状況の意味理解、連続追跡、複数対象、Miniの実sensor、機器制御、電池/熱/精度は必要なadapter/model/実測ごとに受け入れる。初期の色・配置・輪郭照合は同じ背景/近い姿勢の本人用実験で、普遍的な識別精度を宣言しない。部品/Model取得が必要なら目的/容量/保存/再利用を案内し、無断Cloud切替をしない。証拠は既存`docs/evidence/sky-agent-library.json`へ追記する。

<a id="sky-object-attachment"></a>
## 無機物・有機物の対象とAgentをsmisでつなぐ（SKY12/14/21・DSP01）

2026-10-22の本人指示「皆の負をEveでAgentにする」「お皿でも何でも」「くっ付ければそれがエージェントになる」を正本へ反映する。後続の本人指示により無機物・有機物を問わずつなぐことを目標とし、対象を物質種別のwhitelistで制限しない。植物・生き物も既存の対象名と能力契約で表す。これは特定のペン専用機能ではなく、共通の取り付け部品が物をEve/smisの仕事へ結ぶ構想である。

1. **目的**: 利用者ごとの困りごとをEveで役割へ具体化し、smisで必要な機能と接続先を組み合わせる。物ごとにLLMを作り直したり、全ての物へ重みを格納したりする必要を減らす。Agentは既存market/library、本人・仕事・予算・保存は既存OS Coreを使う。
2. **体験**: `/os/eve/create-agent`で対象・困りごと・欲しい結果・受け取りたい情報・伝え方を入力→ひな形の名前/役割/既存モデル設定を確認→本人のsmisへ保存→`/sky/objects/{agentId}`で最新の役割と接続条件を確認→同じ担当ID/revisionでEveへ。ひな形の作成は文字列の組立であり、LLM生成や学習と偽らない。共有/配布は既存Market審査/公開範囲を別途通す。
3. **取り付け部品**: 物の識別と、用途に応じたマイク/ボタン/カメラ/センサー・表示/音/信号、給電、認可済みhostへの通信を持つ共通部品を目指す。処理は対応する端末/管理Linux/許可済みCloudへ分担できる。受動タグは識別と起動入口のみ、能動部品は給電と実入出力が必要。両者を自律観測/物理操作の同じ合格へ置換しない。正確な部品/形状/BOM/firmwareは未確定。お皿へ付けたことだけでは料理/量/温度等を検知できない。植物なら実際の土壌センサー等、本人なら同意した記録や対応する装着機器等を入力候補とし、分類だけから生体情報や操作能力を推測しない。
4. **責任**: ROCKは作成・owner/revision・能力契約・接続/失効表示、EXTERNALは部品/driver/transport/Tool固有機能、JOINTは同じ部品と対象物の実接続・取付け・通信・給電・安全な着脱・更新/復旧、OWNERは用途/送信先/費用/物理接続/検収を担う。接続先未対応の市販品をsmisに置換済みと表示しない。動画のFlowticaは参考例で、実adapter/連携契約/firmware改変は未実施。
5. **入出力**: `SkyAgentSettings.attachment`は`sky.object-attachment/1`の物名40文字と希望input（text/audio/image/sensor/button）・output（text/audio/signal）だけを許可し、grant/鍵/任意shell/任意endpointを拒否する。実観測は既存`rockstaros.adapter/1`のhost/executor/outputと30秒有効期限/true・false・unknownへ分離。`negotiateSkyObjectAttachment`は入力・処理・出力を全て照合し、text生成だけで音声認識/画像認識/センサー処理があると推測しない。
6. **状態**: 困りごと入力→下書き→本人確認→保存、部品未接続→観測/認可待ち→適合候補→既存Brokerの承認→実行→結果確認。今回のsourceは保存と適合候補までを提供し、機器の実接続状態は未確認表示のまま。能力一致は`authorizationGranted=false`/`executionAuthorized=false`/`physicalAcceptance=false`を維持する。
7. **保存**: 新しいaccount/job/料金台帳・Object DBを増やさず、既存`sky_agent_settings.settings` JSONに希望接続を保存する。旧5field行はそのまま読める。smisで編集してもattachmentを保持し、同じCAS/revisionとowner分離を使う。物の入口URLは同じownerの最新Agentを読み、認証/再確認後にEveへ渡す。URLは認可鍵ではなく、原音声やセンサー原本を設定へ格納しない。
8. **失敗・復旧**: 権限/owner違い、能力不明・不足、期限切れ、protocol違いを拒否し、勝手なCloud切替を行わない。設定保存の応答不明では同じUUIDを維持して読み戻し、同じowner/同内容の第1版だけを保存済みとして照合する。作成画面と管理画面は`X-Sky-Owner`を送り、serverが現在の本人と違う場合は409で保存を止める。物のURLを開いただけでは仕事を作らず、停止/削除/版変更を既存設定とEveで再照合する。
9. **承認・実行**: 役割文・取付け・能力報告・署名のいずれも、単独では本人承認/Tool成功/課金根拠にならない。現在の文章経路では設定をpromptへ渡して相談できるが、部品から来ていない情報を観測したと主張させない。物理入力の取込/出力返却・停止receiptは対応driverと同一jobを実装/受入してから利用可能にする。
10. **合格条件**: 無機物・有機物の区分や種類を固定せず困りごとから保存/再読込/編集保持/同じEveへ引継ぎ、別owner/未知grant拒否、古いrevision/停止拒否、欠けたマイク・処理・出力/古い観測を拒否し、従来text契約を維持すること。実物は別に、同一部品の取付け/電源/安全/実入力→同一job/成果→出力→切断/失効/停止/再起動を確認する。水/熱/食品接触等は対象物と取付け方法ごとに試験し、全対象への機械的適合を保証しない。植物・生き物は取り付け方法・負担・観測範囲、本人の情報は本人の同意・撤回を同じ接続条件へ含める。観測と身体への作用は別能力として扱い、未実装の作用は拒否する。
11. **未決定**: 最初の共通部品の寸法・電源・通信・センサー/出力・取付け方式・安全条件・最初の困りごとを実測で選ぶ。受動タグの手動入口を最終の能動部品完成に置き換えない。専用重み/実機/Flowtica/全OS/一般ローンチ/実請求は個別gate。証拠は既存`docs/evidence/sky-agent-library.json`の`objectAttachment`へ追加する。

<a id="sky-agent-library"></a>
## Skyのマイエージェント・LLM設定とEve（SKY12／SKY14／SKY21）

### Eve仕様に合わせた接続参照（2026-10-21）

- **目的・体験**: EveをLLMの製品名として維持し、Skyで作った担当、追加済みTool、同じaccountで接続したPixel内の担当を、役割・基盤モデル・実行先に分けて表示する。Skyは能力の発見/設定/接続、Eveは依頼/承認/進捗/成果/停止、OSは本人/権限/予算/workflowの強制を担当する。
- **入出力**: 本人別`GET /api/sky/agents`は`ownerUserId`を返す。端末担当は既存`/api/eve/device-sync`の同じownerの報告を投影する。`lib/sky-eve-connections.ts`はIDと担当/modelのSHA256だけをEveへ渡し、指示本文・秘密・認可tokenをURLへ含めない。サービス担当は`/os/eve?mode=tools&agent=...&agentRevision=...`へ渡す。
- **状態**: 端末報告の接続・準備中・停止・要準備・30秒以上前の情報を普通の言葉で表示する。「準備済み」は直近の報告であり、実行許可/成功ではない。報告取得が失敗してもSky設定を隠さず、端末の接続障害を別表示する。
- **保存・責任**: 新しい担当/仕事/請求台帳を作らず、Skyの設定とPixelの能力報告は各保存元を正本にする。端末設定の変更・追加は対応する端末の既存経路で行う。ROCKは参照と照合、EXTERNALはTool/modelの処理とreceipt、JOINTは各実環境の一周、OWNERは外部送信・上限・検収を担当する。
- **失敗・復旧**: 不正/部分的な参照、解除済み端末、なくなった担当、担当/modelのhash変更では別の担当へ代替しない。Skyで再取得し本人が選び直す。Eveの同意はowner・端末・担当hash・modelhashに結び、報告更新で組み合わせが変わると失効する。POST時にserverもhashを再確認し、違えば409で新規queueを拒否する。既存clientのhashなし依頼は互換のため維持するが、新Sky導線は両hashを送る。
- **承認・停止**: 表示とEveを開く操作は推論・購入・課金を始めない。依頼の同一IDでの再送は既存commandの照合のみ。実行は既存job/workflow、結果は同じ会話、成果書出し/停止は既存のEve/端末経路を使い、停止要求を停止確認へ置き換えない。
- **合格・未決定**: owner不一致、古い/変更済みhash、解除、参照の誤形式、重複依頼をfixtureで拒否し、実UIで設定済み担当→Eveの同じ参照を確認する。公開配信元への統合、Sky経由の新しいPixel実一周、任意外部Agent/全端末への展開は個別受入を残す。Eveの自社学習重みは未作成、接続改善から完成扱いにしない。詳細証拠は既存`docs/evidence/sky-agent-library.json`の`eveConnectionAlignment`へ追記する。


- **目的**: Skyで追加した担当と、自分用の文章担当の役割・使用LLMを一箇所で管理し、依頼・進捗・成果を既存Eveへ渡す。
- **利用体験**: 新規作成は`/sky/agents`で「エージェントを作る」→用途例（調査・文章・計画）または自由入力→名前/役割→LLM選択→名前・役割・LLM・Tool状態の確認→保存→Eveに依頼。接続済みSky Toolを使う場合はそのTool担当を選び、同じ段階導線で設定する。既存Agentの編集は直接フォームを維持する。購入と利用権は既存購入パネルで確認する。購入済み表示だけで実行可能へ昇格しない。
- **責任**: ROCKは本人別保存、revision競合、LLM設定束縛、表示とEve導線。EXTERNALはモデル提供/稼働/料金/資格。OWNERはモデル・役割・仕事ごとの同意と予算。Agentの役割文は非信頼入力であり権限を発行しない。
- **入力・出力**: `GET/PUT /api/sky/agents`で本人の設定を扱う。名前80文字、役割1200文字、model ID120文字、既存provider registryだけを受け入れる。PUTは同一Origin、12KBのstream上限、未知field拒否。Eve URLはID/revisionと既存Tool IDのみで、役割本文/秘密値を含めない。
- **状態**: 作成中の役割→LLM→確認、未保存変更、保存中、保存成功/失敗を分ける。初期の追加済みToolはrevision 0の派生設定、保存後はrevision 1以降。新規自分用担当はUUIDで作成。有効/停止とprovider接続状態を分け、モデル選択を接続成功と表示しない。最大100保存、一覧最大200接続。
- **保存**: `sky_agent_settings`の本人/ID一意とCASで設定を永続化。既存`sky_connections`が追加済みToolの正本。解除されたToolの設定は一覧/新規推論へ出さない。購入履歴は別の既存commerce正本。Eve会話は既存の同一tab・10分保存に担当ID/revisionを付け、永続WorkJobや全端末同期を称さない。
- **失敗**: 他人のIDは404、古いrevision/停止/モデル不一致は409、読み書き障害は503。保存失敗時は入力を保持し、通信結果不明の再作成でも同じUUIDを使う。別画面変更を無断上書きしない。LLM呼出しと料金見積はサーバーで本人・現在版・有効状態・provider/modelを再確認し、保存した役割を採用する。Agent設定経由の任意endpoint上書きを認めない。
- **復旧**: 一覧再取得→最新設定確認→保存→新しい参照でEveを開く。停止しても旧会話/仕事/成果を削除しない。進行中のTool停止は既存Eve/workflowで行う。削除・自動移行・任意codeの実行器は追加しない。
- **承認**: 保存/画面遷移では推論・購入・課金を開始しない。文章担当のmodelはEve会話、既存Toolのmodel設定は依頼整理へ適用し、Tool本体の固有model/実行器/価格を変更しない。既存の権限・service entitlement・外部送信・価格/上限/予約条件を通す。Cloud会話は現在の料金見積のみで、未接続の実行を成功としない。
- **合格条件**: 用途例から名前/指示を編集して三段階で保存し、LLM接続状態とTool未接続が明示されること。接続済みTool担当の設定では元Tool IDを維持し、保存だけでTool実行しない。本人分離、保存再読込、同時編集一件だけ成功、追加/解除Toolとの整合、停止/旧版/LLM差し替え拒否、履歴の担当参照維持、既存APIとworkflow回帰。host fixture、local Worker、実UI、Pixel、provider、本番を分けて証拠へ記録する。
- **未決定の決め方**: 任意作者Agentの内部LLM差し替え、LLM登録/取得、恒久会話、端末/Linux同期、Cloud本実行と実課金は各既存実行器/提供元の契約と受入後に追加する。今回の管理設定をこれらの完成と呼ばない。

<a id="sky-optional-features"></a>
## Skyから追加するWallet・Market（2026-10-20 明示変更）

- **目的**: Wallet/Marketは必要な本人がSkyで追加し、不要な人の初期画面を増やさない。
- **利用体験**: Skyの追加機能で使い道を選んで追加→ホーム/共通ナビから開く。直URLで未追加なら同じ追加画面を表示。Walletは収支記録/報酬受取準備、Marketは探索/PAPER/取引対象登録を選ぶ。追加だけで取引・課金は開始しない。
- **責任**: ROCKは本人別の追加状態と復帰導線、既存Wallet/Marketを再利用する。外部決済/KYC/受取先/実取引は既存EXTERNAL/JOINT/OWNER gate。追加設定は金融権限ではない。
- **入出力**: `GET/PUT /api/sky/features`は機能ID、有効状態、列挙された使い道、revisionのみを扱う。同一Origin/本人認証、未知field拒否、既存4KB JSON制限。銀行/カード/本人確認書類/秘密鍵は入力させない。
- **状態**: 未追加revision 0→追加→ホームから外す→再追加。provider未接続/本人確認未済/本番無効は別状態。
- **保存**: `sky_feature_additions`をowner/feature一意でD1保存し、更新はCAS。端末ローカル保存を本人の全端末同期成功と読み替えない。
- **失敗**: 読取失敗は追加状態未確認と表示し、新規追加を止める。保存失敗時に選択を保持、409時は再取得。新規同時追加は一件だけ成功。
- **復旧**: 同一本人で再取得・再追加できる。外しても金融記録/保有資産/契約/注文へDELETEや取消を行わない。既存の本人認証されたデータAPIの閲覧/復旧条件は維持。
- **承認**: 表示用追加を送金/実注文/口座開設/新規契約/有料接続の同意にしない。現在MarketはPAPER、Wallet銀行送金は未接続。
- **合格条件**: 初期未追加、本人分離、同時更新拒否、外す/再追加、他記録保持、直接URLの追加入口、ホーム/共通ナビの反映、既存API回帰。実取引合格とは分離する。
- **未決定**: 追加情報は操作ごとに既存Providerの正確な必要項目を確定する。実口座/KYC/本番取引をこの表示設定から自動開始しない。

<a id="news-source-plugins"></a>
## ニュース配信元pluginとHome timeline（2026-10-20 実装・外部制限あり）

本人は政治的立場だけで情報を隠さないニュース用LLMを希望し、好きな配信元をSkyから追加してHome timelineで読むと指定した。現在HomeとSkyは同じ画面。初期URLはHugging Face公式Xの公開profile。本人が規約欄を確認してAddを実行し、同意版 `x-public-timeline-v1` と本人別の有効状態を保存した。取得不能を架空投稿で埋めない。

[X公式埋込み案内](https://help.x.com/en/using-x/embed-x-feed)は公開profile/listを対象とする。本人フォローのhome timelineは[別のOAuth API](https://docs.x.com/x-api/posts/timelines/introduction)で、未接続。公式widgets.jsのcreateTimelineへprofile/listを渡す。専用のopaque sandbox文書でSDKを実行し、親のoriginやstorageにアクセスさせず、no-referrerと限定CSPを使う。利用条件の最終確認は本人が済ませた。埋込みの配信順はXに依存し、Skyが無検閲・完全性・真偽・政治的中立を保証したことにはならない。

実browserでは公式iframeが **Rate limit exceeded** を表示し、server側でもHTTP429を確認。pluginの保存は成功したが、投稿本文の実表示は未受入。短時間の再取得・proxy回避を行わず、時間を置いた公式経路の再確認か、別途本人認可されたX APIを使う。配信有効状態と投稿取得成功を区別する。ニュース用学習済みLLM、原文/要約/反証/訂正の独立台帳、立場入替え評価は未実装。ニュース原文を政治的理由だけで除外しない方針は維持し、「完全中立」「誤情報ゼロ」を未実証で宣言しない。

[Eve News 1.0](llm-evaluation-architecture.md#eve-news-1-0)は、このsource pluginとHome表示の上に載せる設計段階のモデル/記事仕事である。Skyは配信元ID/版、正規URL、公開/取得時刻、利用権、原文参照、訂正を型付きで渡す。モデルは証拠付き下書きとclaim ledgerだけを返し、Sky catalog登録やHome掲載を直接実行しない。掲載は既存workflowの本人別job/revisionと権限/費用確認を通る。初期版は編集検収後にAI生成・出典・訂正履歴付きで公開する。発信先、許諾済み媒体、基盤weights、学習集合、掲載runnerは未選定/未実装。X投稿本文を基盤LLMの学習へ入れず、現行Pixel account viewerの本人確認済み表示をニュース記事化の受入へ転用しない。

先行する`/os#news`タイムラインは現行Sky Homeの外部feedとして表示し、旧アイコン型OS Homeを併置しない。[公開GDELT DOC 2.0 metadata API](https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/)の固定query `politics sourcelang:english`、過去24時間・検出日時降順・最大20件を読む。Skyは元記事本文を取得/保存せず、見出し、原文HTTPS URL、媒体domain、GDELT検出時刻を型付きで返す。UIは外部見出しとEve検証済み記事を混同せず、日時の意味、取得時刻、元媒体を表示する。429等では15分cacheまたは24時間以内の実取得seedをstale表示し、それも無ければ空欄/失敗を示す。最初の実取得は10件、公開時は除重複と非記事URL/古いarchive検査後8件を表示した。これは単一英語queryの初期接続であり、言語/地域の広がりや政治的無偏りの証拠ではない。

<a id="sky-information-market"></a>
## HomeとSkyを統合した情報マーケット（2026-10-20 明示変更）

- **目的と体験**: `/`をSkyの情報マーケットにする。自分のX配信→Hugging Faceのモデル/データ/Spaces検索→追加済み能力/担当→既存Tool/MCP管理を同じ入口に置く。`/sky`は互換転送、大学別指定は既存campus Hubへ戻す。依頼・進捗・承認・成果はEveへ引き継ぐ。
- **日常での価値**: 本人は、発見の楽しさと暮らしに結びつく使い道が継続利用を生むと明示。Skyで関心に沿う情報や能力を見つけ、Eveで日常/制作の用事を進め、使える成果を受け取る流れを設計基準にする。滞在時間は未計測で、ドーパミン反応や継続率を実証したとは扱わない。有用な成果、繰返す用事の完了、次回の再開のしやすさを今後確認する。
- **責任**: ROCKは認証/固定接続先/検証/本人別保存/CAS/表示/Eve引継ぎ。EXTERNALはHFの公開metadata・配布条件とXの配信。JOINTは同じlocal/公開artifactで検索→追加→Eve→対応runtime実応答を照合。OWNERは配信元/条件/有料実行と権限を選ぶ。公開や全モデル対応をこの画面で認定しない。
- **入出力**: `GET /api/sky/huggingface?kind=model|dataset|space&q=...`、qは最大80文字、固定HF APIへ12件まで。公開ID・用途・likes/downloads・license・gated・SDK・配布元・revisionだけを投影。12秒timeout・1MB stream制限、redirect拒否、HTML/code/tokenを転送しない。取得元の文字列を未信頼の表示dataとして扱う。[HF公式API](https://huggingface.co/docs/hub/api)。
- **追加と保存**: `GET/PUT /api/sky/hub`、同一Origin・本人、4KB JSON、未知field拒否。`sky_hub_plugins`へowner/key、kind/resource、enabled、revision、server取得metadata、consent版、更新日時を保存。最大100件。HF Addは正確な公開repositoryと40桁shaを再取得して固定。Xは正規化済みprofile/list URLだけ。clientのready/価格/metadataを信じない。reference追加はモデルdownload/installやcode実行ではない。
- **状態と失敗**: 未追加→追加→外す→再追加。外す操作は保存済み成果や会話を削除しない。CAS409は再取得、取得障害503/429やmissing shaは追加成功にしない。検索の先行requestは次の検索/種類変更/離脱で取消し、古い応答を別種類の結果へ混ぜない。未認証・読取失敗では追加を止める。
- **Eve/実行**: HFのID/配布元/確認sha/実行準備依頼を、既存10分・一回限りのsessionStorage draftとしてEveへ渡す。URLへ依頼本文/秘密値を置かない。HF referenceから未知runtimeを直接起動せず、実行先・形式・条件・resource/予算/本人承認を確認する。既存Toolのjobは `lib/workflow.ts` のまま。個人文章担当は既存owner/現在revision/provider/model照合を通す。
- **導入済みモデル**: 本人用localhost開発環境に限り、`GET /api/llm/local-models`で固定loopback Ollama `/api/tags`を4秒・128KB上限で読み、最大50件のname/digestを返す。推論なし。公開productionでは404。HF repo shaとOllama artifact digestの同一性は別検証。全端末自動検出やHF自動installとしない。
- **料金と承認**: HF検索/追加のSky料金は0。外部推論/計算resourceの実費、OS月16 USD、既存作者有料販売の10%は別。本人は決済会社が10%を必要とするか質問した段階で、10%は自社取り分で必須ではないと説明済み。作者販売を0%へ変更する決定は受けていない。AddやEve遷移を購入/有料推論の同意にしない。
- **復旧と合格条件**: 本人再認証→一覧再取得→同じkey/現在revisionで再開。本人分離・初回競合・既存改訂競合・同意なし拒否・不正URL/metadata拒否・上流障害・実browser引継ぎを検証する。local実UIでHF Qwen reference追加とsha引継ぎ、導入済みQwen1.5Bの担当保存→Eve実応答を確認。これは汎用Agent仕事の完了/全HFモデル対応/ニュース品質評価ではない。実X本文は429で未受入。[証拠](evidence/unified-sky-information-market.json)。
- **未決定の決め方**: X OAuth/private feedは提供条件/認可/実費と同じ接続の実投稿で受入。任意モデルは既存Linux/Pixelの形式/容量/導入許諾/実推論のgateへ接続。HFのAgent/Spaceの自動実行・未知code・有料Provider・作者分配・本番請求は既存商品/実行/決済契約で別に受け入れる。

<a id="x-account-view"></a>
## 本人のXを表示する専用ビュー（2026-10-20）

1. **目的・利用者**: 自分のXアカウントの投稿を読みたい本人向け。本人の最新指示により、API開発者契約を必須にせず、公式X画面を本人が操作する経路を優先する。
2. **利用体験**: Sky/HomeのXカードから「自分のXを開く」。Webは公式Xの別画面、Androidは任意の専用ビューへ進む。Pixelの `dev.rock.xsession` は独立した追加APKで、固定の `https://x.com/home` を表示する。初回は本人がログインする。リンクを開いただけで「接続済み」とは記録しない。
3. **責任**: ROCKは導線・固定宛先・セッション分離・表示状態を担当。Xは認証・配信・並び順を提供。OWNERがログイン・投稿等を操作する。専用ビューはBroker API、Shell DB、本人の仕事・Walletへアクセスしない。
4. **入出力・版**: `rockstarx://home` と明示packageだけを使い、intentからURL/秘密を受け取らない。出力は公式画面。投稿DOMの抽出・Cookie転送・Agentへのアカウント権限移譲はしない。Webリンク/専用ビュー/投稿カードのAPI取得を別経路として扱う。
5. **状態**: 未導入→導入→公式画面起動→本人ログイン→表示。今回のPixelでは導入・起動のCLI成功後、本人が「ログインして投稿が見えた」と回答した。これは本人による目視証拠で、エージェントが実機画面を独立に撮影した証拠ではない。
6. **保存**: Xのsessionは専用APKのUIDとWebView profile `x-account` に保存する。Android backup/cleartext/file/content accessを無効化、第三者Cookieを拒否。明示manifest権限はINTERNETだけだが、Pixel SDK37の互換追加でLOCAL_NETWORK/OTHER_SENSORSもpackage readbackに現れた。後続のtarget SDK更新と権限読戻しを残し、実効権限までInternetだけと表現しない。投稿・個人アカウント名・Cookie・認証コードをGitへ保存しない。
7. **失敗・圏外**: X側のログイン失効・障害は公式画面で扱い、架空投稿を生成しない。圏外でX投稿を最新取得できるとは表示しない。SkyのLinux作業継続とは独立した状態。
8. **更新・復旧**: 同じpackage/署名の更新でsessionを保持する設計。今回、再起動・再インストール・ログアウト・全損復元の受入は未実施。削除で専用sessionが消えることとXアカウントの削除を区別する。既存ShellのINTERNET禁止は維持。
9. **安全・承認**: JSはX公式サイトの動作のためだけに有効。native bridge/任意script注入/SSL回避はない。カメラ・マイク・位置・ファイル要求を拒否。外部HTTPSの本人クリックは通常ブラウザへ渡す。ログイン情報をSky server/LLMへ送らない。
10. **受入・現在地**: Pixel 10/frankel SDK37で開発署名APK v0.1.0を非破壊追加し、本人が実投稿表示を確認した。Web Homeの「自分のX」導線も実browserで確認。Web Homeのカード内へ本人feedを混在させる処理、Shell Home内へのnative埋込み、全OS imageの受入は未完了。[証拠](evidence/x-account-integration.json)。
11. **未決定**: OS Shellからの直接起動/戻り方、target SDK更新、複数アカウント、SSO、session削除、再起動/回復は同じPixelで個別に受け入れる。他端末は各hostの公式画面表示で検証する。

### 公開埋込み429と任意APIの扱い

内部syndication URLの直指定を、別origin相当のopaque sandbox文書に置いた公式widgets.jsのcreateTimelineへ変更した。親はframe/source/channelを照合し、timeout・15分待機を示す。公開widgetは本人が開いたときだけ取得し、通常のHome表示で再試行を繰り返さない。X公式Publishでも投稿が出ず、本人アカウントの通常公式Homeでは実投稿が見えたため、この二つの経路の成否を分ける。429自体が解消したとは記録しない。

任意の公式API adapterは初期OFF。明示承認flag・秘密設定・公開source allowlist・日次call上限が全部揃った場合だけ使用する。固定API/no redirect、8秒/256KB、最大5投稿、source lease、global429待機、15分cache、24時間を超えた表示停止、protected/auth失敗時のcache排除を実装。本人別plugin同意/現在revisionとOriginを確認し、GETでは有料取得しない。call上限は金額保証ではなく、API契約・実費・支出承認と実取得の受入は未実施。今回の本人用経路にAPI契約は不要。[X公式埋込み](https://help.x.com/en/using-x/embed-x-feed) / [Xの自動化条件](https://help.x.com/en/rules-and-policies/x-automation) / [Android WebView](https://developer.android.com/develop/ui/views/layout/webapps/webview)。

開発用buildは `scripts/build-x-session.py` に既存のJava Home/aapt2/android.jar/AGP builder.jar/apksig.jar/debug keystore/output-dirを明示して実行できる。工具のdownload・本番署名鍵生成は行わない。通常のSDK環境では `gradle -p android :x-session:assembleDebug`。今回の手動build成功をGradle/full AOSP build成功へ換算しない。

<a id="os-edition-world-catalog"></a>
## Skyで自分のOS版とWorldを探す・作る（設計）

SkyはModel/Agent/Tool/情報源に加え、OS editionとWorld recipeの発見・比較・複製・共有・更新入口を担う。「自分のOSを作る」を国づくりの最初の一歩にする。editionの配布元/license/Core互換/端末能力/固定revision/親digest/標準LLM/必要権限/料金/ルール/退出条件を示す。Add、本人の設定適用、World参加、購入、native書込みを別状態にする。EveはそのWorldで生じた依頼・進捗・承認・成果を扱い、既存workflowを通す。

目的・体験・責任・入出力・状態・保存・構成アルゴリズム・圏外/競合・更新復旧・承認・環境別合格・未決定の正本は[自分のOS版/World設計](rockstaros-complete-design.md#personal-os-world-versions)。現行Webでは[鍵付きコミュニティーOS](#keyed-community-os)で版付き作成・共有・Add・適用を実装した。native image builderと一般公開catalogは未受入。native imageの自由作成は機種別build/署名/復旧gateへつなぎ、非対応hostには対応能力を持つclient/browser editionを表示する。既存のAgent/モデル/Wallet/作者SDKを再利用し、任意shell/rootやOS platform鍵をWorld作者へ渡す共通APIを追加しない。


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
5. 状態: 確認中、未ログイン、接続済み、照会失敗を区別する。初期登録/ログインは既存SitesのChatGPTサインインをトップレベルで使い、独自パスワード認証や本人の代理登録を追加しない。
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

### EveのLLM・担当表示の整理（2026-10-21）

OS10/SKY21/WEB04の既存Eve同期画面は、[全体設計](rockstaros-complete-design.md#eve-cross-device-sync)のLLM表示契約に従う。Eveの製品名、担当の役割、実基盤model、実行端末を表示し、Sky Toolの権限や成功を追加しない。学習開始要件は[LLM設計](llm-evaluation-architecture.md#eve-training-prerequisites)で管理する。

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
## smisの共有・実用・改善によるネットワーク効果

版付き個人担当のpreview/publish/Add/派生/公開停止のローカル候補を追加。入出力/保存/失敗/承認/合格条件と未受入は[全体正本](rockstaros-complete-design.md#smis-network-effects)と[証拠](evidence/smis-agent-shares.json)を参照。

本人の2026-10-22指示により、個人がEveで作る担当/手順を版付きで共有し、別本人がsmisからAddして実用し、改善版を次の本人へ渡す[共通設計](rockstaros-complete-design.md#smis-network-effects)を追加する。公開Tool添付とcommunity OSの担当コピーは再利用し、個人Agent単体の配布・親/派生版・実成果による発見は追加開発する。`sky_agent_settings`/social ACL/community構成/workflow/Broker/job/usageを使い、任意script・credential・生体情報・Tool grantを配布しない。本人の公開/実行/費用確認、license、更新差分、停止/失効を維持する。現段階は設計であり、実装・公開・成長・作者支払いの受入ではない。

<a id="eve-account-runtime-work-port"></a>
## 共通Eve Coreのaccount/runtime WorkPort（入口組込み前）

**目的・体験。** 同じOS Coreのprepare/start/read/stopを現行account runtimeへ結ぶ。声または文字で依頼を確認した後も、同じowner/会話/担当版/model版/device/job IDを保持する。今回のadapterは選択済み担当を扱い、担当作成と実画面への組込みは未実装。ROCKは共通Core/adapter/既存queue/状態/所有検証、EXTERNALはhost実行とstop receipt/実音声、JOINTは同じ実機一周、OWNERは対象/依頼/権限を確認する。

**入力と出力。** `lib/eve-runtime-work-port.ts` は既存EveWorkPortへ接続。固定bindingはowner/thread/device/agent ID/agent hash/model hash/scheme、入力は確認済み1000文字以内の依頼と同じjob ID。prepareは現在presence/準備済みmodel/adapter交渉を確認するだけで実行・担当作成をしない。startは既存POST /api/eve/runtimeでmax256tokenの同じ依頼を保存する。read/stopはowner別の同IDを使い、他のjobへ置き換えない。

**状態と個別読戻し。** `GET /api/eve/runtime?requestId=ID` は既存encrypted commandとreplicaからowner/pending/executionを返す。50件/20件の一覧にない仕事でも個別照合する。pending DTOへagent ID/hashを加えるがDB/envelopeを増設・移行しない。device sessionからの読取りは元deviceも照合する。owner・thread・device・input・agent/model/schemeが違えばadapterは成果を返さない。LLMのreviewを外部Tool成功へ昇格しない。

**本人と保存。** 既存認証を唯一の権限とし、既存agent設定APIと同じ `x-sky-owner` intent headerをruntimeにも任意追加。新adapterは常に送る。送信中にcookieのownerが変われば409でqueue更新前に拒否する。headerはcredentialではない。既存clientのheader省略は互換維持。共通Coreのpending handleをowner/thread/device/担当/model版/schemeごとのsessionStorage keyへ分離し、server queueとowner履歴を正本にする。

**停止・失敗・復旧。** 停止要求の保存だけではunknown。cancelled-before-start/端末のstop-confirmed/stop-finished、または保存済みreviewを同IDで確認して待機へ戻す。欠落/期限切れ/所有変更/結果不明は勝手に完了・停止済みとせず、同仕事を読戻す。ネットワーク失敗でstartを自動再送しない。context失効後のprepare結果は採用しない。owner変更では古いownerへの書込みをしない。旧pendingは別の本人へ移さない。

**合格条件と現在。** 復元SQLite＋実route handler＋同じCoreで、文字wake→依頼確認→同IDqueue→開始前取消→待機、51件の新規行で一覧外となった元jobの個別read、owner変更race拒否、誤thread/device/pin拒否、review保持、receipt前unknown/receipt後stoppedを検証。集中33/33、型exit0、変更対象lint exit0。全体lintは他担当のsky-agent-shares試験12件で失敗を記録し、全体成功へ読み替えない。実workerd/実UI/担当作成/現行native mTLS/ASR/Pixel音声/全入口は未受入。

**次と未決。** 現行の担当作成/host準備契約を確認し、一般の目的から作った担当を同じbindingへ結合する。その後eve-sync-workspaceの既存owner/pin/実行/stop/saveへ共通panelを組み込み、現Native13f sourceを保ったnative入口と実ASRを接続する。新DB/端末別workflow/鍵/モデルdownloadは今回0。一般公開保留を維持する。


### Mini空間操作から既存Toolへ接続する詳細設計

[Mini実現設計書](avocado-mini-r5/spatial-computer-use-design.md)の3/10/11/15/16章を参照。目的は空間で選んだ対象を既存jobへ結ぶこと。入力はowner/job/object/scene/appと承認参照、出力は対象adapterが読戻した結果。責任はROCKのBroker/保存、EXTERNALのapp API、JOINTの実一周、OWNERの権限/費用。候補/承認待ち/実行/結果不明を区別し、既存owner保存と復旧を使う。未知結果は照合し自動反復しない。承認は既存gate、合格はSC05〜07、未対応appは実装と実機の証拠から決める。新catalog Toolの追加や実行成功ではない。


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

### 共有した担当のTool実用接続

選択した本人Agentの役割/版/由来を既存Eve Tool WorkJobへ固定する。入力・状態・保存・失敗・停止/復旧・本人確認・合格条件は[全体正本](rockstaros-complete-design.md#smis-network-effects)の「共有担当から同じEve仕事・成果へ」、検証範囲は[証拠](evidence/smis-agent-tool-loop.json)。引用Toolと任意のOllama計画の限定接続であり、他Tool/providerや一般Agentの自律権限を追加しない。


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

### 本人が共有する担当の利用結果

既存の完了仕事/共有版/URL集合検査を確認し、本人の回答を既存postへ公開する。入力/成果本文は同梱しない。同意・保存・ACL・訂正/停止・失敗/復旧・合格条件・算法と未実証は[正本](rockstaros-complete-design.md#smis-network-effects)と[証拠](evidence/smis-agent-outcomes.json)。作者支払い/実人数/全利用成功率への転用はしない。

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

共通実行Source受入：対象35/35、型/lint、Source全verify exit0（2705件/2704pass/1skip、API1582/CSV385/assets222欠損0）。固定Source Worker＋既存Root native/JDK/managerの165項目成功。Source既存の合成復元済みschemaを使用し、新規/本番DB移行合格ではない。inventory c272d754e3d7b8071f684d7293bdcf76b4f1fedfbae3feb22b567165bb0e9d72、Source1568入力の検証中変更0。実UI/Pixel/実model/公開/Source cloud保存/GitHub pushは未実施。証拠docs/evidence/eve-common-runtime-source.json。 Source側の役割/入出力/状態/保存/失敗/復旧/承認/合格条件は同候補の#eve-common-runtime-integrationに記録。RootのSDK・native/実機の合格をSource Webへ移さず、今回の判定は同Source Workerと既存native接続の組合せに限る。


### 配信候補へのモデル評価・共通実行の統合

### 共通Coreの未到達停止を既存adapterへ接続

Coreのread=nullは停止証明ではないが、そこで戻らず同じpending referenceを既存adapter.stopへ渡す。ROCKがowner/会話/担当/model/実行先と同じIDを検証し、未到達はserver fenceを保存して遅延startを無効化する。claim済み/結果不明ならEXTERNAL/JOINTの同claim停止receiptまでunknownを保持。入力は既存pendingとbinding、出力は同じCore状態、保存は既存handle/queue/history、新job/権限は作らない。失敗やstop=nullではhandleを残し、同じIDを読み直して復旧する。OWNERの元依頼と停止指定を保持し、終端確認後だけ待機へ戻す。Root/Source集中・SDK合格と、実Worker/実UI/実端末/音声を区別する。[原因・修正・検証](evidence/eve-core-missing-delivery-stop.json)。


### 隔離Sourceの月次観測保存と反転保留

BIL02/SKY21/OS10/WEB04・ROCKのSource候補19fe452に、本人の既存Invoice/Provider参照・通貨/額を入力とする観測保存を追加。目的はunknownや逆順応答で保留を失わないこと。既存Invoiceの2 nullable JSON列へpending/request/revisionと検証済み反転証拠を保存し、最新slotだけ結果を書けるCASと、遅延した負の証拠も残す独立保留を使う。読取りは同じowner/accountから復旧し、旧schema/clientと元行を保持する移行を用意。型/形式/本人/保存失敗では保留し、通常再照会を解除承認にしない。EXTERNAL/JOINTの実Provider・受取先・返金/送金、OWNERの権利/費用/解除条件は別gateで、全状態で送金許可は出さない。合格はhostの競合/移行と同一Worker/D1再起動の範囲に限定し、実UI/本番/Root runtimeへの統合とは区別する。[実装・復旧コマンド・証拠](evidence/eve-monthly-payment-observation.json)。


**目的・責任。** WEB04/SKY21/OS10・Web/ROCK O5が、保存済みfc2f8b34の評価/実測候補とa6b8b3c6の共通実行を、版付き共有・利用結果を含む現Source候補へ統合する。EXTERNALはモデル/端末、JOINTは同一候補の実画面/端末、OWNERは対象・資源・外部送信・公開を選ぶ。既存Source-only backendへ適応する。

**入力と保存。** owner/job/revision/run/task・現在の導入済みmodel digest/capabilities・推定メモリ予算を確認し、最大3問/各600token/40秒の逐次観測を既存WorkJobへ保存する。資源予算は候補判定用推定で、OSのRAM hard limitではない。共通runtimeの担当作成/登録/開始前停止/成果持出しは既存owner暗号化queue/replica/historyを使う。新DB/仕事台帳/移行は作らない。

**状態・失敗・復旧。** 共有担当の開始時snapshotを測定前にも検証し、破損ならモデル呼出0件で拒否する。測定/候補確認で担当・Tool権限・仕事状態・予算を昇格しない。停止後の観測usageとunknownを保持し、再起動後も同IDで読み、同じ測定を再送しない。文章持出しはexact request ID/owner/thread/revision/output hashを再照合する。未到着startのfenceと、実行先の実停止receiptを分ける。

**共存と合格。** 版付き共有→本人Add→同じjobの測定/候補確認→保存済み版で計画→実引用Tool/独立URL検査→本人完了→同意付き利用結果が、同じjob/threadで保持されることを合成Sourceで検証する。別のJDK/TLS/private bridge試験で、共通runtime登録/実行/保存/停止/再起動を確認する。元の担当版・出典・公開範囲・料金・旧Pixelデータを維持する。候補の自動採用、実モデル品質、実ブラウザ/Pixel、全OS/本番金融・成長の受入へ換算しない。

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

### Eve実Plannerの限定Source受入

実Sourceの限定受入追記：明示選択の既存qwen2.5:1.5bによる1回の計画生成をserverで検証し、採用前Tool0、採用後mr-citations/compose-check/URL保持検査/同job完了・会話保存・Worker再起動一致、同推論再送409を確認。入力471/出力191報告、model digest前後一致。一般planning評価の不合格と自動採用禁止は維持。実UI/Pixel/汎用計画/意味真偽/公開/課金を含まない。証拠docs/evidence/eve-real-planner-source-worker.json。

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
