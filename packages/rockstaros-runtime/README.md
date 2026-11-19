# RockstarOS portable runtime — 1.0 Developer Preview

Eve・Skyの既存サービスへ、Mini、Pro、Pixel、既存PC/ブラウザの接続層から同じ契約で接続するES module。モデル重み、native OS image、BSP、センサーdriver、実回線契約はこの配布物に含まれない。現段階の受入はmacOS hostのHTTP代替試験と既存workflow実コードの試験で、Mini実機や全platformの合格ではない。

## ビルドと配布

repositoryルートで `npm --prefix packages/rockstaros-runtime run build`。`npm pack --prefix`ではなく、このpackageディレクトリから`npm pack --pack-destination <絶対出力先>`を実行する。生成されたtgzの`dist/index.mjs`はroot repositoryへの相対importを含まず、Node.js 22.13以降または対応browser/WebViewのホストから読み込める。browserは同じorigin上のサービスを使う。cross-origin CORSを開放しない。

```js
import { createRockstarRuntime, diagnoseHardware } from '@rockstaros/runtime';
const rock = createRockstarRuntime({
  origin: 'https://avoado.si',
  // hostの既存Keychain/Keystore等から都度取得。modelやsensorが発行しない。
  getSessionToken: () => hostSecureStorage.readRockstarDeviceSession(),
});
const entitlement = await rock.entitlement();
const histories = await rock.eve.list();
const jobs = await rock.jobs.list();
// history保存時はserverから取得したrevisionをそのまま使う。
// 有料処理は既存の見積と本人承認を完了した後だけsubmitApprovedを呼ぶ。
```

接続は`connection.begin(deviceName)`→本人が返されたverification URLで確認→`connection.poll(deviceCode)`。返されたsessionをhostの秘密領域へ保存し、失効/401時は再接続する。poll間隔はserverの指示に従う。SDKはtokenをログ・履歴・packへ保存しない。OSは任意shellやrootを提供せず、既存Toolの認証・sandboxを通す。

dev.7はbegin/pollだけに`X-Rockstar-Device-Binding: owner-device/v1`を付け、元のrequest bodyは維持する。対応serverはbinding宣言、実session deviceId、未消費owner拒否のreasonを返す。旧Androidへの無header応答は従来の厳密なfield集合を保持する。Node hostは宣言のないserverで本人承認やconsumeへ進まず、消費後の結果不明を新しい登録で回避しない。headerは能力交渉であり、本人の承認や実行権限ではない。

## Eveと仕事

`eve.list/read/save/recall`は既存の`/api/eve/history`を使う。保存はowner別暗号化・revision競合をserverが強制し、生体情報・鍵を履歴に入れない。`jobs.list/create/command`は既存`/api/work-jobs`へ接続する。計画編集/停止/本人検収は既存`lib/workflow.ts`を使い、クライアントによるTool成功記録を拒否する。停止はjob取消であり、すでに送信された外部providerを取消済みにはしない。

`text.quote/status/submitApproved`は既存の見積・予約・usage照合を使う。有料実行の承認画面/承認・予約は第一者の既存経路で行う。SDKに見積IDやdigestを書いただけでは実行権限を得られない。推論成功、Tool成功、会話保存は別状態。現行の端末内実行同期APIはPixelに限定されており、Mini/Proの実行先としてここから登録・指名しない。SDK導入だけでlocal Eveや任意modelがインストールされることはない。

## 料金・断線・復旧

利用権、基本料金、usage、予約、請求書は既存のaccount/contractとserver台帳が正本。端末追加による新しい料金や顧客台帳を作らない。既存契約の基本料とAI/Agent追加使用料、通信料、外部実費を区別する。SDKから料金・owner・利用権を自己申告して変更できない。

mutating requestは一度だけ送る。timeout/応答消失/5xxは`outcome: unknown`とし、元のjob/quote IDを読戻して照合する。自動再送、Cloudへの自動切替、上限の自動拡大はない。history/jobを読み直すまで古いrevisionの更新を繰り返さない。OS停止時にも電池保護・物理停止は独立して動作する必要がある。

## ハードウェア接続

`diagnoseHardware(snapshot)`は最大30秒のadapter観測を検査する。`true`だけを確認済み能力候補として扱い、null、期限切れ、未来の観測は有効化しない。観測は認証・本人承認・実機受入の代わりにならない。MiniではIF08のwake、IF09のMCU状態、IF14のセンサー、IF16のdock離脱をdriverが処理し、場所scope失効と出力停止を実装する必要がある。本packageには物理出力driverを含めず、未接続の空間表示・衛星Wi-Fiは利用可能と表示しない。

native OS版ではこの共通runtimeに機種ごとのBSP/boot/driver/署名更新/復旧を組み合わせる。既存OSがある機器はclientとして導入できる条件を確認する。MCU単体は署名済み限定firmwareと許可済みhostとのbridgeが必要で、Node/JS runtimeを持たないMCUへこのmoduleを直接入れない。


## 共通実行kernelとNode host（1.0.0-dev.2）

HTTP clientに加え、`createTextExecutor`・`negotiateTextAdapters`・`projectTextReceipt`をexportする。`@rockstaros/runtime/node`はNode用のprivate journal、固定loopbackのOllama executor、Host/Output descriptorを提供する。model weightsやdriver、Webの端末grantは含まない。

`rockstaros.adapter/1`はrole/版/protocol/観測時刻/期限/capabilitiesを検査し、30秒を超える観測、unknown能力、版不一致を拒否する。能力交渉は本人権限を与えない。hostの保護したownerと認可callbackが、owner/job/request hash/executor/permission/費用0/期限を同じgrantへ結ぶ。modelやclientのJSONからownerや予算を設定しない。公開serviceの実装は既存Broker/利用権/予算を検証する必要があり、以下のlocal UID認可を転用しない。

このrepositoryの明示CLI試用は次の形式で行う。これはWeb accountへの接続操作ではない。

```sh
node --experimental-strip-types scripts/run-rockstar-host-text.mjs --state-dir PRIVATE_DIRECTORY --accept-local-text < PRIVATE_REQUEST_JSON
```

requestのキーは`id/threadId/input/agent/model/deadline/maxOutputTokens`のみ。IDはUUID、本文4000文字、期限120秒以内、出力1〜1024 tokens。agentは`id/name/instructions/modelId/sha256`で、hashは`executionDigest(JSON.stringify({name,instructions,modelId}))`。modelは`id/scheme/sha256`。Ollamaのschemeは`ollama-manifest-sha256`で導入済みtagsのdigestを使う。Pixel GGUFの`gguf-sha256`と同じものとして比較しない。追加downloadやcloud fallbackはない。

journalはOS UIDを固定し、0700 directory/0600 file、exclusive lock、atomic claim、revision CAS、fsync/renameを使う。同じIDを再実行せず、別内容は拒否する。再開時は`core.read(jobId)`で読む。CLI submitの期限が過ぎたrequestを延長して再送しない。古いlockはプロセス/実行状況を確認して復旧し、自動で削除しない。raw input/結果を含むjournalはGit/公開logへ置かない。

runtimeの完了はreviewの下書きで、本人検収や外部Tool/請求の成功ではない。応答不明/中断はUNKNOWN、同じ仕事の照合を優先し、HTTP abortを実engine停止と断定しない。outputは原文・model pin・hash・usage・未確認表示を保つ。

Mac最終候補で導入済みQwen2.5:1.5bの1件（private試験は全5件）と、repo外のbundle/別processによる同一job/hash再読（再推論0）を確認した。30試験のWeb/Android/Macは合成host fixtureで、実Web/Androidで新kernelを実行した証拠ではない。旧Pixelの保存済み2成果は同じ出力schemaへ投影できるが、新ABIのPixel導入、同一Web account、background/CPU/RAM hard isolation、機微情報保管は未受入。[詳細証拠](../../docs/evidence/rockstar-adapter-runtime.json)。

CLIで期限の過ぎた保存結果を読むときは `--state-dir PRIVATE_DIRECTORY --read-id JOB_UUID` を使う。追加推論/権限付与はない。journalは非負のPOSIX UIDとprivate file modeを確認できるmacOS/Linux用で、Windowsのstoreは未対応。callback/driverは第一者のhost実装であり、AgentのJavaScriptをここへロードしない。Agentは制限付きの文章設定だけを渡す。最終候補の返答は要求した準備項目を返さず完了を主張したため、内容品質は不合格・未検収として残した。model出力からTool成功や本人検収を作っていない。

Ollamaのloopback接続だけでlocalと判定しない。tags/showのremote_model/remote_host、GGUF format、completion能力を確認してからpromptを送る。responseのremote情報/Tool callも受け入れず、tagのdigestを前後で照合する。[公式APIのfields](https://github.com/ollama/ollama/blob/main/api/types.go)と[cloud機能の説明](https://docs.ollama.com/faq)を参照。これは信頼するlocal daemonのmetadata検査で、侵害済みdaemonや通信の完全な遮断を証明しない。daemonのglobal設定は変更せず、service利用権/料金経路やnetwork isolationのgateへ接続する。

## 共通Eveサービス接続（1.0.0-dev.3）

`createLinkedTextWorker`と`runtime.executions.inspect/read/announce/claim/authorize/publish/acknowledge`を追加。Web側の明示POST承認から届く一件を既存kernelで実行し、同じIDで既存暗号化Eve replica/historyへ戻します。device clientには新規承認を作るメソッドがありません。保存済み出力/UNKNOWNの照合を先に行い、応答消失時に別の実行先へ送り直しません。

承認済みserviceから確認した`{owner, deviceId}`だけを`openNodeExecutorJournal(newPrivateDirectory, identity)`へ渡します。新しいbindingは0600 manifestへ固定し、別owner/deviceや既存private UIDの仕事を自動採用しません。device tokenはcallerの既存保護storageから供給し、HTTPクライアントは保管しません。Node向けの任意の暗号化保管はdev.4を参照してください。新しい本人Macのgrant、保護storage、公開UI/new Pixel ABIは別受入です。

実装は`lib/eve-runtime-sync.ts`、許可は既存device sessionとWebの明示0円local preview承認、保存は既存Eve tablesです。有料実行・本番利用権/計量・外部Tool成功の経路として使わないでください。[契約](../../docs/rockstaros-complete-design.md#portable-runtime-service)と[証拠](../../docs/evidence/rockstar-runtime-service-bridge.json)。

配布物の検証: dev.3のpack/importと、repo外の合成worker・別Node processの同一成果再読を確認済み。package試験43件、store/legacy15件、隔離Worker API1679 assertions。実Mac model一件はtransportと保存だけを受入し、逐語copy品質は不一致のため未合格です。公開アカウントのhost追加と新Pixel ABIの受入は含みません。

## Nodeホストの接続情報保管（1.0.0-dev.4）

`@rockstaros/runtime/node`の`saveNodeHostCredentials(directory, profileId, credentials, unlockBytes)`と`loadNodeHostCredentials(directory, profileId, unlockBytes)`を使えます。`credentials`は認証済みサービスで確認した`{origin, owner, deviceId, accessToken, expiresAt}`、`unlockBytes`は本人がその起動で入力する15文字以上のUTF-8 byte配列です。パスフレーズやtokenを引数・環境変数・Git・ログへ入れず、入力側が使い終えたbyte配列を消去してください。

POSIX user/private mode、UUID profile/UID/AAD binding、固定scrypt、AES-256-GCM、改変検知、profile上書き禁止を検証します。別processでの再開には本人の解除が必要です。これはsoftwareによるディスク上の暗号化で、OSの生体認証・同じuser権限で侵害されたprocess・E2EE・background常駐・全損復旧の合格ではありません。初回接続UI/CLIと公開ownerの最終grantは引き続き準備中です。


## 初回接続と受信CLI（1.0.0-dev.5・開発候補）

repo外に展開したpackageの`dist/host-cli.mjs`をNode.js 22.13以降で起動する。npmのbinリンクからの起動も同じentryへ入る。現行公開Sourceはこの版が必要とするowner/device binding未対応のため、初回の本人Mac接続はまだ公開受入できていない。以下は対応する開発サービスでの手順で、実アカウントの接続完了を示さない。

```sh
node /absolute/package/dist/host-cli.mjs setup --state-dir /absolute/private-outside-git/host --name "My Mac" --model "qwen2.5:1.5b"
node /absolute/package/dist/host-cli.mjs connect --state-dir /absolute/private-outside-git/host
node /absolute/package/dist/host-cli.mjs run --state-dir /absolute/private-outside-git/host --max-jobs 1
node /absolute/package/dist/host-cli.mjs status --state-dir /absolute/private-outside-git/host
```

setupは導入済みmodelのmetadata/hashを検査するだけで推論/download/grantを作らない。connectは本人TTYで解除句を2回非表示入力し、表示されたサービスのURLで端末名とscopeを確認して承認する。成功後は同じ起動でreceiverを開く。後のrunは同じ解除句で解錠する。解除句をコマンド引数/環境変数/チャットへ入れない。`--max-jobs`は1〜8で、未指定は本人が終了するまで既存承認済みのlocal text previewを受信する。終了は新規受信を止めるが、engine停止確認とは別。

明示owner_deniedと期限切れだけsetup済み状態へ戻る。応答喪失/消費済みコード/承認後の保存不明はuncertainとして止まり、自動再接続やprofile削除はしない。本人がWeb側の端末grantを照合/失効してから復旧する。statusのlinkedは保存情報で、現在のサービス到達やreceiver常駐を保証しない。実HTTPの別process試験でも使うmodel driverは合成であり、実モデル品質・実Web owner・Pixel・hard isolation・生体情報・本番課金の受入には数えない。[11項目の契約](../../docs/rockstaros-complete-design.md#runtime-host-enrollment)。


## Pixel Linuxの既存manager接続層（1.0.0-dev.6・開発候補）

`@rockstaros/runtime/linux`の`createPixelLinuxExecutor({manager})`を共通hostのdriverとして使う。managerは第一者の既存`createLinuxLocalManager`で、追加済み/準備済みGGUF・担当と同じjobを使用する。describeは実worker ABIを検査し、generateは内部executeTextへ渡す。認可やcustomer identityをdriverへ自己申告するAPIはない。programmatic host用で、現行CLI setupは引き続きOllama向け。Pixelのnative共通ABI/UI・公開ownerの接続は未受入。

共通requestの出力cap（1〜1024）とdeadline（120秒以内）だけを既存workerへ渡し、-n/残wall timeout/CPU capを制限する。旧Pixel入力は512tokens/180秒を維持。abortは既存stopで照合し、遅着結果/中断/消費済みIDを再実行しない。Android KeystoreのtokenをLinuxへコピーせず、新しいNode hostのgrantは本人が別に承認する。HTTPの任意実行口は増やしていない。[詳細11項目](../../docs/rockstaros-complete-design.md#pixel-portable-executor)、[限定証拠](../../docs/evidence/pixel-portable-executor.json)。

## Object attachment compatibility

`parseSkyObjectAttachment`, `skyObjectRequirements` and `negotiateSkyObjectAttachment` reuse the existing versioned host/executor/output descriptors. A physical module can supply input while an approved host supplies inference and output. The result is compatibility metadata only: no execution authority, hardware acceptance or driver is supplied. Missing/unknown input, processing or output and stale descriptors are rejected. Object labels and stable owner-only URLs are not credentials. Full contract: `docs/sky-tools-complete-design.md#sky-object-attachment` in the canonical repository. Firmware, hardware/BOM and real object input/output remain unaccepted.

The authorized host calls `runtime.sky.inspectAgent(agentId)` to read the existing owner-bound role/revision and desired attachment. It uses the same protected session and fixed service origin; it does not mint permission, enroll hardware or dispatch a job.

### smisの共通画像入力（本人用試作）

`observeSmisPixels`は64×64のopaque RGBA画素を共通の時刻付き観測へ変換し、`matchSmisVisualObservation`はowner別に登録した見た目の候補だけを返す。browser cameraの切出し/明示許可/停止はWeb adapter、Miniの実sensor取得は別driverの責務。候補は権限、意味理解、物理操作成功、実Mini受入ではない。写真・重みをpackageへ同梱しない。[3方式と自由なユーザー用途](../../docs/sky-tools-complete-design.md#smis-three-connection-ways)。

## OS共通のEve入力/会話

保存済みの仕事を`resume`した場合、または存在を確認した場合、Coreは既存pending keyへ`knownExisting:true`を追加して同じ5項目のreferenceと区別して保存します。再読込みでもこの印を保持します。adapterは`stopExisting(reference)`で、途中の404を新規の未到達依頼へ置き換えず、同じ既存仕事の停止だけを照合してください。未対応adapterでは停止を未確認として記録を残します。通常の初回配送用`stop`は別の経路です。古い5項目記録は読めますが由来の区別はできず、旧版clientによる6項目の読取り・全DB消失・保存更新失敗とserver消失が重なる場合の復旧は未受入です。metadataは本人認証や実行権限を付与しません。

`createEveInteractionSession`は同じOS Coreをexportします。声や文字を確定依頼へ渡し、既存owner-bound work portのprepare/start/read/stopへ接続します。host adapterが本人/権限/予算/同じjobとreceiptを検証し、入力自体へ実行権を与えません。旧Pixel/Linux DTOはCore外のadapterに隔離、Mini/Pro/nativeの実結合は別受入です。新storeや料金体系は追加しません。

## 付け替えて使う入力部品（本人用試作）

`createSmisModuleSession`・`decodeMicrobitMotion`・`smisModuleRequestSuffix`・`SMIS_MODULE_MAX_AGE`・`guardSmisModuleWorkPort`を共通Coreから使える。物に付けた部品の生の加速度を、本人が確認した物・接続・取り付け番号へ結び、10秒以上更新されない部品接続や付け替え後の依頼開始を拒否する。依頼には確認時点の単発値を添え、実行中の現在値とは扱わない。元の仕事の読戻しと停止は接続断後も残す。物の取り外しは自動検出できず、本人の「外す」操作が必要。重さ・温度・位置・実行権限は入力から作らない。

最初のbrowser adapterはmicro:bit V2の固定BLE加速度サービスを読む。driverは本packageに同梱せず、対応host側へ分離する。Miniも同じ入力契約と仕事経路へ接続するが、実機driverと機種別の受入は別途必要。モデル・firmwareのダウンロードや基板への書込みは行わない。部品未入手のため、現時点の一周確認は合成入力によるhost試験だけで、Pixel上の実物試験は未完了。[設計](../../docs/sky-tools-complete-design.md#smis-removable-module)・[証拠](../../docs/evidence/smis-removable-module.json)。

## 目的から必要な部品と同じEve仕事へ

`smisObjectNeeds`／`suggestSmisObjectNeeds`／`assessSmisObjectPurpose`／`smisObjectPurposeRequest`をexportする。候補は限定的な語句照合であり、本人が訂正・確認する。hostが実接続と実行先の状態を渡すと、部品不足と未対応処理を分けて返す。現在使えるのは動きの単発値と文章下書きで、文章実行先は常に必須。未知の追加能力・未確認・準備不足から実行用依頼は作らない。目的と確認した範囲は既存Eveの可視入力へ入り、同じguard／job／保存／停止を使う。部分試行は元の目的の達成と分ける。候補は認証・Tool権限・部品の実機合格ではない。[正本](../../docs/sky-tools-complete-design.md#smis-object-purpose)。
