# Sky Compute Grid — Android worker設計

更新: 2026-10-11 ／ task: `GRID01` ／ 状態: **設計のみ。未実装・未受入**

[Sky Compute Grid設計](sky-compute-grid.md)の永続gridへ、実際のAndroid端末をつなぐworkerの設計である。server側（注文、割当、検証、credit台帳、API）と、最初のSKUのJava実装は実装済みで、このworkerが残りの部分になる。実装者はこの文書と、合わせるべき相手である次のfileを読めば着手できる。

| 相手 | file |
| --- | --- |
| wire protocolと上限 | [`lib/sky-compute-grid-live.ts`](../lib/sky-compute-grid-live.ts) |
| 端末要求への応答と拒否code | [`lib/sky-compute-grid-api.ts`](../lib/sky-compute-grid-api.ts)、[`lib/sky-compute-grid-store.ts`](../lib/sky-compute-grid-store.ts) |
| 端末の要求を1 byteまで再現する試験用端末 | [`tests/sky-compute-grid-live-fixture.mjs`](../tests/sky-compute-grid-live-fixture.mjs) |
| 計算の実装とtest vector | [`ComputeGridLexicalEmbedding.java`](../android/core/src/main/java/dev/rock/core/ComputeGridLexicalEmbedding.java)、[`contracts/sky-compute-grid-lexical-embedding-vectors.json`](../contracts/sky-compute-grid-lexical-embedding-vectors.json) |

## 1. 目的と範囲

充電中で、本人が使っておらず、従量でない通信につながり、熱くない端末が、**同じaccountの注文**（owner pool）のlotを受け取り、計算し、署名した結果を返す。本人が端末を手に取ったら、その瞬間に止める。

範囲に入れるもの: 既存のBroker app（`dev.rock.automation`）へのworker追加、本人が入り切りする設定、状態表示、試験、実機受入。

範囲に入れないもの: public pool（他人の注文）、料金・credit表示の拡張、意味を扱うembedding model、Local AI runtime（`com.localactionassistant`）の変更、端末へのcode配布、iOS。

## 2. Ownerの体験

1. account連携と端末鍵の登録を済ませる（既存の`beginRockstarDeviceLink`、`enrollA2ABrokerDevice`）。済んでいなければ、gridの設定は「先に連携と端末登録が必要」と表示して入にできない。
2. Shellの設定で「使っていない時間に、自分の注文を計算する」を入にする。既定は**切**。入にする時に、動く条件（充電中・画面が消えている・Wi‑Fiなど従量でない通信・発熱していない）と、渡されるdataが自分の注文だけであることを一画面で示す。
3. 入にすると端末は供給条件（offer）を登録する。以後、条件がそろった時だけ自動で仕事を取りに行く。通知は出さない。
4. 設定画面には、最後に動いた時刻、最後の状態（計算した／仕事なし／条件を満たさず停止／要再連携など）、累計の合格lot数だけを出す。lotの中身は出さない。
5. 切にすると、実行中の仕事を返却し、予約を取り消し、供給条件を取り下げる。

本人が画面を点けたら、計算中のlotを捨てて止める。済んでいたlotだけを結果として返し、残りは他の端末へ回る。本人から見て、端末の動作は変わらない。

## 3. 責任と禁止

| component | 責任 | 禁止 |
| --- | --- | --- |
| `ComputeGridJobService` | 条件の確認、1回の実行（offer更新→claim→計算→receipt）、協調停止 | 条件を満たさない実行、leaseの期限を越えた計算 |
| `ComputeGridWorker` | leaseの検査、lotの計算、receiptの組み立て | leaseにないdataの送信、入力・出力の保存、log出力 |
| `ComputeGridTransport` | `/api/sky/compute-grid/device`へのHTTPS、応答の検査 | redirectの追従、cookie、origin以外への送信 |
| `ComputeGridConditions` | 充電・画面・通信・温度の測定と監視 | 位置・通話・他appの情報の取得 |
| `ComputeGridSettings` | 入切と表示用の状態の保存 | session tokenや鍵の保存（既存storeの責任） |
| `RockShellService` | Shellからの入切と状態取得（本人操作の入口） | Shell以外の呼出元の受付 |

workerは端末へ届いたcodeを実行しない。動かすのはappに同梱したSKUの実装だけで、leaseの3つのhashが同梱実装の定数と一致しない時は計算せず返却する。Accessibility、root、shell、電池最適化の除外申請は使わない。

## 4. 構成

すべて`android/automation/src/main/java/dev/rock/automation/`に置く。計算と、Androidに依存しない組み立ては`android/core`へ置き、JVMの単体試験で確かめる。

| class | module | 内容 |
| --- | --- | --- |
| `ComputeGridLexicalEmbedding` | core | **実装済み**。SKUの計算と3つのhash定数 |
| `ComputeGridProtocol` | core | 要求payload（JSON文字列）の組み立て、署名対象byte列、lease応答の検査、lot入力の検査、receiptの組み立て。`org.json`に依存しない純Javaにするか、automation側へ置いて`org.json`を使うかは実装時に決める（§12） |
| `ComputeGridConditions` | automation | 条件の一回測定と、実行中の監視（listener） |
| `ComputeGridTransport` | automation | HTTPS POST。`AndroidJsonResponse`と`RockstarServiceOrigin`を使う |
| `ComputeGridWorker` | automation | 1回分の処理。JobServiceから別threadで呼ぶ |
| `ComputeGridJobService` | automation | `JobService`。job id `4201` |
| `ComputeGridScheduler` | automation | jobの登録・取消。`BootReceiver`から再登録 |
| `ComputeGridSettings` | automation | no-backup領域の`AtomicFile`。入切、地域、最後の状態、累計 |

既存の部品はそのまま使う: `AndroidRockstarDeviceSessionStore`（`authorizationHeader()`、`ownerUserId()`）、`AndroidA2ABrokerDeviceRefStore`（`getOrCreate()`）、`AndroidA2ABrokerDeviceTransport.devices()`で得るactiveな`keyId`、`A2ABrokerDeviceKeyStore.open(context, keyId).sign(bytes)`（P-256、r‖s 64 byteを返す。署名対象は16,384 byteまで）。

`AndroidManifest.xml`へ`ComputeGridJobService`（`android.permission.BIND_JOB_SERVICE`）と`android.permission.ACCESS_NETWORK_STATE`を足す。新しい危険権限は要らない。

`IShellApi`は`API_VERSION`を1つ上げ、次の2つを足す。

```text
/** Turn idle compute for the owner's own orders on or off; returns the resulting status JSON. */
String setComputeGridEnabled(boolean enabled, String regionCode) = 40;
/** Read-only status: enabled, prerequisites, last run, last outcome code, verified lot count. */
String computeGridStatus() = 41;
```

## 5. Protocolへの結び付け

送信先は`{origin}/api/sky/compute-grid/device`だけである。`origin`は`BuildConfig.ROCKSTAR_SERVICE_ORIGIN`を`RockstarServiceOrigin.canonicalOrigin`へ通した値。headerは`Authorization: Bearer rock_session_…`、`Content-Type: application/json; charset=utf-8`、`Accept: application/json`、`Accept-Encoding: identity`、`Cache-Control: no-store`。redirectは追わない。

本文は`{"payload": <JSON文字列>, "signature": <base64url>, "outputs": {…}}`。`outputs`は`receipt`の時だけ付ける。

- `payload`はJSON objectを文字列にしたもの。**署名するのはこの文字列のUTF-8 byte列そのもの**なので、送る文字列と署名した文字列を同じ変数から作る。keyの順序は自由だが、keyの集合は下表と完全に一致させる（余分なkeyは拒否される）。
- 署名対象 = ASCIIの`rock-sky-compute-grid-device-request/1`、`0x00` 1 byte、`payload`のUTF-8 byte列。
- `signature` = `A2ABrokerDeviceKeyStore.sign`の64 byteを、paddingなしのbase64url（86文字）にしたもの。
- `payload`は15,000 byte以下。本文全体は1,572,864 byte以下。

全actionに共通のkey: `schema`（`sky-compute-grid-device-request/1`）、`action`、`requestId`（小文字のUUID。要求ごとに新しく作る）、`authorityId`（`android-key-attestation-google`）、`deviceRef`、`keyId`、`issuedAt`（端末時計のepoch ms）。

| action | 追加のkey |
| --- | --- |
| `offer` | `offer`: `skuId`、`pools`（`["owner"]`）、`platform`（`android`）、`abi`（`arm64-v8a`）、`region`、`memoryMiB`、`maxLotsPerLease`、`priceMicrosPerLot`（`0`）、`maxInputBytesPerLot`、`dataClasses`、`availableFrom`、`availableUntil`、`runtimeArtifactSha256`、`modelSha256`、`tokenizerSha256` |
| `withdraw` | `skuId` |
| `claim` | `skuId`、`conditions`: `charging`、`deviceIdle`、`unmeteredNetwork`、`thermalStatus` |
| `release` | `leaseId`、`reason`（`owner_active`／`unplugged`／`metered_network`／`thermal`／`shutdown`／`runtime_error`） |
| `receipt` | `leaseId`、`startedAt`、`completedAt`、`runtimeArtifactSha256`、`modelSha256`、`tokenizerSha256`、`deviceEvidence`（`chargingThroughout`、`deviceIdleThroughout`、`unmeteredThroughout`、`maximumThermalStatus`）、`results[]`（`lotId`、`inputSha256`、`outputSha256`、`outputBytes`） |

`receipt`の`outputs`は`{ lotId: 出力のbase64 }`。**padding付きの標準base64**（`Base64.getEncoder()`）で、keyの集合は`results`の`lotId`と一致させる。

### offerの値

| key | 値 |
| --- | --- |
| `skuId`と3つのhash | `ComputeGridLexicalEmbedding`の定数 |
| `abi` | `Build.SUPPORTED_ABIS[0]`が`arm64-v8a`の時だけ。違えばworkerを入にできない |
| `region` | 本人が設定で選ぶ粗い地域code（`JP`、`JP-KANTO`など。正規表現`^[A-Z]{2}(-[A-Z0-9]{2,12})?$`）。位置情報から求めない |
| `memoryMiB` | `ActivityManager.MemoryInfo.totalMem`をMiBへ切り捨て |
| `maxLotsPerLease` | `4`（上限8。実機の所要時間を測ってから見直す） |
| `maxInputBytesPerLot` | `65536` |
| `dataClasses` | `["public","synthetic","owner_private"]` |
| `availableFrom`／`availableUntil` | 現在時刻と、その7日後から1分引いた時刻（幅は7日以下でなければならない） |

offerは、入にした時、設定を変えた時、`availableUntil`まで2日を切った時、serverが`offer_not_registered`または`offer_key_mismatch`を返した時に送り直す。同じ端末・同じSKUのofferは`issuedAt`が新しいものだけが採用される。

### 応答と拒否codeへの対応

成功は200。拒否は`{ "code": …, "error": … }`で、`code`だけを見て動く。

| 状況 | 対応 |
| --- | --- |
| `claim` 200、`lease`がnull | `reasons`を最後の状態として記録して終了。次の定期実行を待つ |
| `claim` 200、`lease`あり | §6の検査へ |
| `receipt` 200 | 記録して終了 |
| `receipt` 409 `receipt_conflict` | 先に送った結果が記録済み。成功として終了し、再送しない |
| 409 `lease_not_active`／`lease_expired`、404 `lease_not_found` | そのleaseを捨てる。再送しない |
| 409 `offer_not_registered`／`offer_key_mismatch` | offerを送り直し、同じ実行の中で1回だけ`claim`し直す |
| 401 `device_request_stale` | 端末時計のずれ。状態を「時計を確認」にして終了 |
| 401 `device_signature_invalid`、403 `device_key_not_enrolled` | 鍵が無効。状態を「端末の再登録が必要」にし、workerを自動では再開しない |
| 401 `sign_in_required` | 状態を「accountの再連携が必要」にする |
| 403 `service_entitlement_required` | 状態を「利用権を確認できない」にする |
| 503 `compute_grid_disabled` | serverが無効。次の実行まで6時間以上あける |
| その他の4xx | 実装の誤り。codeだけを記録して終了。同じ要求を繰り返さない |
| 通信失敗・5xx・応答の形式不正 | `claim`は何もせず終了（次回、同じleaseが返る）。`receipt`は§8 |

## 6. 一回の実行

`ComputeGridScheduler`は次の条件でjobを登録する: `setRequiresCharging(true)`、`setRequiresDeviceIdle(true)`、`setRequiredNetworkType(JobInfo.NETWORK_TYPE_UNMETERED)`、`setPersisted(true)`、周期15分。device idleを条件にしたjobへbackoffを指定すると`build()`が例外を投げるので、`setBackoffCriteria`は呼ばない。OSが条件を満たした時だけ`onStartJob`が呼ばれる。

`onStartJob`は別threadで次を行い、`true`を返す。

1. 設定が入、userがunlock済み、sessionがある、activeな端末鍵がある、を確かめる。欠ければ状態を記録して終了。
2. `ComputeGridConditions`で現在の条件を測る。一つでも欠ければ`claim`せずに終了する（serverへ「条件を満たさない」と伝える必要はない）。
3. 必要ならofferを送る。
4. 条件の監視を始めてから`claim`を送る。
5. leaseを検査する。一つでも合わなければ計算せず`release`（`runtime_error`）する。
   - `schema`が`sky-compute-lease/2`、`pool`が`owner`
   - `skuId`と3つのhashが同梱実装の定数と一致
   - `executionPolicy`の6項目が期待どおり（充電・idle・unmeteredが必須、温度は`light`まで、code不可、本人使用で停止）
   - `expiresAt`が現在時刻より90秒以上先
   - lotが1〜8件。各lotで、base64を戻したbyte列の長さが`inputBytes`、SHA-256が`inputSha256`、JSONが`{"schema":"sky-compute-lot-input/1","items":[…]}`の2 keyだけ、`items`の件数が`itemCount`、全itemが孤立surrogateを含まない
6. lotを順に計算する。1 lotごとに、開始前に停止要求と締切（`expiresAt`の60秒前と、job開始から8分の早い方）を確かめる。締切を過ぎたら残りのlotは計算しない。
7. 計算できたlotが1件以上あれば`receipt`を送る。0件なら`release`を送る。
8. 状態と累計を記録し、`jobFinished(params, false)`。

計算threadは`Process.THREAD_PRIORITY_BACKGROUND`で1本だけ動かす。入力と出力はmemoryにだけ置き、送信後に0で上書きして参照を捨てる。

### 条件の定義

| 項目 | 測り方 | 監視 |
| --- | --- | --- |
| `charging` | `BatteryManager.isCharging()` | `ACTION_POWER_DISCONNECTED` |
| `deviceIdle` | `!PowerManager.isInteractive()`（画面が消えている） | `ACTION_SCREEN_ON`、`ACTION_USER_PRESENT` |
| `unmeteredNetwork` | active networkが`NET_CAPABILITY_NOT_METERED`と`NET_CAPABILITY_VALIDATED`を持つ | `ConnectivityManager.NetworkCallback` |
| `thermalStatus` | `PowerManager.getCurrentThermalStatus()`: `NONE`→`none`、`LIGHT`→`light`、`MODERATE`→`moderate`、`SEVERE`以上→`severe` | `addThermalStatusListener` |

実行中に一つでも崩れたら、**計算中のlotを捨てて**直ちに止める。それまでに計算し終えたlotは、条件を満たした状態で計算したものなので、`deviceEvidence`の3つを`true`、`maximumThermalStatus`を観測した最大値（`none`か`light`）として`receipt`で返す。崩れた後に計算した結果は一つも含めない。こうするとworkerが偽の申告をすることはない。serverが「条件を破った」という申告を拒否する経路は、この規則を守らないclientのためにある。

`onStopJob`（OSが条件の喪失や時間切れで止める時）も同じ扱いにする: 計算を止め、済んだlotがあれば`receipt`、なければ`release`を、残り時間で1回だけ試みる。間に合わなければ何も送らない。leaseは失効時刻＋30秒を過ぎるとserverの回収対象になり、lotは他の端末へ回る。

## 7. 保存・保持・削除

端末に保存するのは`ComputeGridSettings`の次の値だけである: 入切、地域code、最後に送ったofferの`issuedAt`と`availableUntil`、最後の実行時刻、最後の状態code、累計の合格lot数。no-backup領域に置き、appのbackupには含めない。

lease、lotの入力、出力、receiptは保存しない。process終了で失われてよい: 次の`claim`で同じleaseが返り、計算は決定的なので同じ出力になる。logへはcodeと件数だけを出し、payload、入力、出力、token、署名を出さない。

workerを切にした時とaccountの連携を解いた時は、`ComputeGridSettings`を消し、jobを取り消す。

## 8. 失敗・retry・重複

- `claim`の再送は安全。serverは同じ端末に同じleaseを返す。
- `receipt`の送信が通信失敗で終わった時は、**同じ本文（同じ`payload`と`signature`）をmemoryから**再送する。間隔は2秒、8秒、30秒の3回まで、かつ`expiresAt`＋20秒まで。同じ本文の再送には記録済みの判定が返る。serverは`issuedAt`が5分より古い要求を拒否するので、それより後には再送しない。
- processが落ちて本文を失った後は、次の実行で`claim`し直す。先の`receipt`が届いていれば、leaseは閉じているので新しい仕事が返る。届いていなければ同じleaseが返るので計算し直して送る。新しい本文で送って`receipt_conflict`が返った時は、先の分が記録済みなので成功として扱う。
- `release`は失敗しても再送しない。失効後にserverが回収する。
- 同じlotを二度計算しても害はない。記帳はserver側で1回だけになる。
- 連続して3回、4xxの「実装の誤り」に当たったら、workerは自分で切になり、状態に残す。原因を直さずに要求を繰り返さない。

## 9. 更新・互換性・rollback

SKUの実装を変える時は、仕様文・hash・test vector・Javaの定数を同時に変え、新しいSKU idとして出す。古いappは新しいSKUのleaseを§6の検査で返却する。serverは古いappのofferを、hashが登録と合わないので受け付けない。

wire protocolを変える時は`schema`の番号を上げる。appが知らない`schema`のleaseは返却する。

rollbackはappを前の版へ戻すだけでよい。端末に移行すべきdataはない。server側は`SKY_COMPUTE_GRID_MODE`を外せば、すべての端末が`compute_grid_disabled`を受けて待機する。

## 10. 安全・privacy

- 渡されるのは同じaccountの注文だけ（owner pool）。`pool`が`owner`でないleaseは計算しない。
- 端末がserverへ送るのは、設定した粗い地域、memory量、4つの条件、結果だけである。位置、連絡先、他appの情報、端末固有番号は送らない。`deviceRef`はapp導入ごとの乱数である。
- 署名鍵はAndroid Keystoreのhardware-backed鍵で、appの外へ出ない。sessionとは別に要求ごとに署名するので、session tokenだけを奪っても結果を偽装できない。
- 条件の申告は、鍵を持つ正規appの申告であって物理的な証明ではない。owner poolでは本人の端末なのでこれで足りる。public poolへ広げる時は、申告を信じず結果を別accountとの合議で検証する（server側は実装済み）。
- 電池と熱: 充電中・画面消灯・`light`以下だけで動き、計算threadは1本。OSの電池最適化を迂回しない。実測は§11の受入で行う。

## 11. 試験と受入

### 試験

| 層 | 内容 | 場所 |
| --- | --- | --- |
| JVM | SKUがtest vectorを再現する（実装済み）。`ComputeGridProtocol`が、試験用端末（`deviceBody`）と同じkey集合のpayloadを作る。lease検査が§6の各違反を拒否する | `android/core/src/test` |
| Node | JavaとTypeScriptの出力が一致する（実装済み、`npm run os:parity`）。Javaが作った要求本文を`verifyComputeGridDeviceRequest`が受理する | `scripts/check-os-parity.mjs` |
| emulator | 条件の測定とlistener、停止時にlotを捨てること、設定の保存と消去、Shell APIの入切。**emulatorはx86_64なのでofferが受理されない**。端から端までの試験はemulatorで行わない | `android/automation/src/androidTest`（`rockAcceptanceTarget=emulator`） |
| 実機 | 下の受入 | Pixel（arm64） |

Nodeの2つ目は、Javaのharness（`main`）に固定の入力を渡して要求本文を出力させ、試験用の鍵で署名した本文をserver側の検証関数へ通す。署名鍵をKeystore以外から与えられるよう、`ComputeGridProtocol`は署名を`Signer` interface越しに受け取る。

### 実機受入（owner pool、Pixel 1台）

前提: `SKY_COMPUTE_GRID_MODE=owner_pool`と`SKY_COMPUTE_GRID_DATA_KEY`を設定した**本番ではない**deployment、migration `0063`適用済み、Key Attestationの検証serviceが動いていること、端末がaccount連携と鍵登録を済ませていること。

| id | 確かめること | 合格 |
| --- | --- | --- |
| W1 | 入にするとofferが登録される | `GET /api/sky/compute-grid/status`の`offers`に端末が1件、`trustTier`が`hardware_backed` |
| W2 | 充電・画面消灯・Wi‑Fiで、2 lotの注文が計算される | 注文が`completed`、結果がserverの参照実装の出力と一致、端末の累計が2 |
| W3 | 計算中に画面を点ける | 1秒以内に計算が止まり、済んだlotだけが`verified`、残りは`queued`へ戻る |
| W4 | 計算中に充電を抜く／Wi‑Fiを切る | W3と同じ。通信が切れた場合は、leaseが失効後に回収される |
| W5 | 計算中に機内modeにし、失効後に戻す | lotが再割当可能になり、遅れた結果は記帳されない |
| W6 | 実行中にappを強制停止し、次の実行を待つ | 同じleaseが返るか、失効後に再割当され、二重に記帳されない |
| W7 | 64 lot（1 lot 64 KiB）の注文を一晩 | 全lotが`verified`または`failed`で閉じ、lease 1件あたりの所要時間、電池温度の最大値、消費電力を記録 |
| W8 | workerを切にする | 実行中のleaseが返却され、offerが`withdrawn`、jobが消える |
| W9 | 端末鍵を失効させる | 次の要求が拒否され、workerが自動で再開しない |
| W10 | logを確認 | payload、入力、出力、token、署名が1件も出ていない |

2〜5台の受入では、`duplicate_quorum`の注文で別の端末同士が一致すること、1台だけ改変した結果を返した時にその1台だけが`rejected`になることを足す。

合格の記録は、実機、appの版（commitとAPKのSHA-256）、deploymentの版、日時、各idの結果を残す。emulator、host、試験用端末の合格を実機の合格として扱わない。

## 12. 未決事項と決め方

| 未決 | 決め方 |
| --- | --- |
| `ComputeGridProtocol`をcore（純Java、JSONを自前で組む）に置くか、automation（`org.json`）に置くか | coreに置けばJVM試験とNodeの照合ができる。JSON文字列の組み立てが40行を越えて危うくなるなら、組み立てだけautomationへ置き、検査はcoreに残す |
| `setRequiresDeviceIdle(true)`で十分な頻度で動くか | W7で一晩の実行回数を数える。1時間に1回を下回るなら、この条件を外し、画面消灯の監視だけで動かす案を比べる |
| `maxLotsPerLease`の既定 | W7の所要時間から、1 leaseが3分以内に終わる件数にする |
| 夜間だけ動かす設定を入れるか | 最初は入れない。ownerが求めたら、端末側の時刻条件として足す（serverの変更は要らない） |
| emulatorで端から端まで試すか | 今は試さない。必要になったら、試験用deploymentだけで追加のABIを認めるserver設定とmigrationを別の変更として出す |
| 意味を扱うembedding | Local AI runtimeへembedding APIを足す案と、grid専用engineを同梱する案を、同じ入力の機種間cosineの実測で比べる。決まるまで`public-text-embedding-v1`は`fixture_only`のまま |

## 13. 実装の順序

1. `ComputeGridProtocol`とそのJVM試験（payloadのkey集合、署名対象byte列、lease検査）。
2. Nodeの照合を足す（Javaの要求本文をserverの検証関数が受理する）。
3. `ComputeGridConditions`、`ComputeGridSettings`、`ComputeGridTransport`。
4. `ComputeGridWorker`、`ComputeGridJobService`、`ComputeGridScheduler`、manifest、`BootReceiver`。
5. `IShellApi`の2 methodと`RockShellService`の実装、Shellの設定画面。
6. emulatorの試験。
7. 実機受入（W1〜W10）と記録。

各段階で`gradle -p android :core:test :automation:assembleDebug :automation:lintDebug`と`npm run verify:public`（鍵のある環境では`npm run verify`）を通す。Androidの通信helperを共通化する変更が先にmainへ入っている場合は、その共通部品（`AndroidJsonResponse`、`RockstarServiceOrigin`）を使う。
