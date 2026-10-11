# Sky Compute Grid — 使われていない携帯を束ねるVirtual Compute Plant

更新: 2026-10-11 ／ task: `GRID01` ／ owner: ROCK（O5 Sky・Zema・Wallet、O6 Device Adapter連携）

## 1. 目的と利用者

Sky Compute Gridは、世界中の **充電中・未使用・unmetered network接続中のAndroid端末**を、短く中断可能な計算ロットの供給源として束ねる。買い手は個々の端末を借りるのではなく、期限・地域・信頼度・価格上限を指定した`ComputeOrder`を出し、Sky Matcherが適合する`CapacityOffer`へ割り当てる。

電力網との対応は次のとおり。

| 電力網 | Compute Grid |
| --- | --- |
| 家庭の太陽光・蓄電池 | Android端末の余剰計算能力 |
| 発電余力の入札 | `CapacityOffer` |
| 電力需要 | `ComputeOrder` |
| 系統運用者 | Sky Matcher |
| 給電指令 | `ComputeLease` |
| 電力量計 | verified Compute Lot / usage receipt |
| 売電精算 | Walletへ渡す検証済み精算候補 |

対象利用者は、可用性より価格と分散性を優先できるbatch計算の買い手と、自分の端末を使わない時間だけ明示的に提供したい所有者である。汎用cloud server、常時稼働API、低遅延推論の代替とは扱わない。

2026-10-11、ownerの指示で次を採用した。

| 判断 | 採用 |
| --- | --- |
| 最初の計算 | text embedding。最初に端から端まで通すのは整数演算の字句embedding（`text-lexical-embedding-v1`）。意味を扱うmodelは端末側engineの選定後 |
| 最初の買い手 | Rock自身 |
| 最初のプール | **owner pool**（同じaccountの端末だけ）。他人の端末を使う**public pool**は次の受入 |
| 供給端末 | Android arm64だけ。契約は他の機種を足せる形にする |
| 配布 | 最初はAPKの直接配布 |
| 報酬 | grid内のcredit。現金・払出しなし |
| Skyの取り分 | 0%。列として記録するだけ |
| 本番 | 既定で無効。本番DBへの反映と有効化は別の受入 |

この文書は二つの層を扱う。**host fixture**は合成dataだけで契約を再現する純粋関数（`sky-*-/1`）。**永続grid**は実端末と実注文を扱うcoordinator（DB、署名付きの端末要求、API）で、既定では無効である。

## 2. End-to-end体験

1. 端末所有者は、提供時間、粗い地域、固定runtime/modelのhash、速度、最低単価、data class、温度・通信・電池上限を提示する。
2. 買い手は、固定SKU、入力lot hash、期限、地域、最低trust tier、単価上限、総予算、検証方式を指定する。
3. Matcherは互換性をhard filterし、価格、完了確率、benchmark、地域、trustで候補を並べる。
4. Skyは10分以内の有限`ComputeLease`を発行する。leaseは固定artifactとlotだけを含み、任意codeや買い手の秘密を含めない。
5. Android workerは充電・idle・unmetered・温度を再検査し、ownerが端末を使い始めたら停止して未完lotを戻す。
6. 結果は入力・出力・runtime/model/tokenizer hash、時刻、端末安全条件を持つ`ComputeReceipt`として返す。
7. 中央の独立参照計算、または別leaseのduplicate quorumで各lotを検証する。
8. 合格lotだけを精算する。host fixtureは`sky_test_credits`のhold previewまで。永続gridは`sky_compute_credits`をgrid内の台帳へ記帳する。どちらもWallet書込みとlive payoutは行わない。

買い手へ表示するのはcoarse region、capability、trust tier、価格、完了見込み、pseudonymだけである。所有者の本人情報、端末固有ID、正確な位置は表示しない。

## 3. 責任と禁止authority

| component | 責任 | 禁止 |
| --- | --- | --- |
| Android worker | 端末状態の測定、審査済みSKUの実行、協調停止、要求とreceiptへの署名 | 任意APK/codeの取得、leaseにないdataの送信、Wallet記帳 |
| Sky Matcher（`claim`） | hard filter、有限lease、budget予約、期限切れの再割当 | offer条件の緩和、地域越境、無断cloud fallback、1端末への二重lease |
| Result Verifier（`settleLot`） | 構造検査、参照計算、提供者間の合議 | workerの自己申告だけで他人の注文を合格にすること |
| Credit台帳 | 検証済みassignmentを1回だけ記帳 | 未検証結果の記帳、Wallet・実料金への接続、現行料金holdの解除 |
| Buyer | pool、data class、地域、期限、上限、検証方法の指定 | public poolへの個人情報・秘密の投入、任意codeの投入 |
| Owner | 提供のon/off、時間、pool、data class、価格条件 | 他ownerや買い手の情報へのアクセス |

Sky Compute Gridは既存AI05のauthority deviceを自動で移す仕組みではない。AI05はowner自身の仕事を一台のauthority deviceへ固定する。Gridは独立したinterruptible lotだけを配る。

### Poolと許可範囲

| | owner pool | public pool |
| --- | --- | --- |
| 組み合わせ | 注文と端末が同じaccount | 注文と端末が別account（同じaccountの端末も参加できる） |
| data class | `public`、`synthetic`、`owner_private` | `public`、`synthetic`だけ |
| 検証 | `owner_trust`、`independent_reference`、`duplicate_quorum` | `independent_reference`、`duplicate_quorum`だけ |
| 合議の独立性 | 別の端末 | 別のaccount |
| 料金 | 常に0。台帳に記帳しない | offerの単価（注文の上限以下）。creditで記帳 |
| 有効化 | `SKY_COMPUTE_GRID_MODE=owner_pool` | `owner_and_public_pool`。fraud・Sybil・法務の受入前に有効化しない |

`owner_private`は本人のdataを本人の端末へ渡すだけなので許可する。serverには暗号文で保存し、lotが確定した時点で入力を消す。

## 4. 入出力・ID・版・上限

### Host fixture（`sky-*-/1`）

正本schemaは[`contracts/sky-compute-grid.json`](../contracts/sky-compute-grid.json)。実装は[`lib/sky-compute-grid.ts`](../lib/sky-compute-grid.ts)。

- `CapacityOffer` (`sky-capacity-offer/1`): Android arm64、粗いregion、provider ref hash、pseudonym、artifact hashes、memory、benchmark、reliability、window、max lots、test-credit単価、data policy、現在条件。artifact hashesは審査済みSKUのものだけを受け付ける。
- `ComputeOrder` (`sky-compute-order/1`): `public-text-embedding-v1`だけ。public/synthetic data、artifact hashes、region、trust、memory、lot size、単価・総予算、deadline、検証方法、入力hash。予算が全lotに足りない注文も受け付け、matcherが`partial`を返す。
- `ComputeLease` (`sky-compute-lease/1`): 最大10分、order/offerへ固定。IDは入力lot/hash/bytes、artifact、単価、提供者表示、地域・trust、安全条件、発行・失効時刻と、**非公開のprovider ref hash**から決定する。買い手に見えるleaseは提供者を明かさないが、後から別の提供者へ差し替えるとIDが合わなくなる。
- `ComputeReceipt` (`sky-compute-receipt/1`): lease/order/offer/artifactへ固定し、lotごとのinput/output hashとdevice conditionを持つ。
- 検証の入力: matcher自身が持つ`matchedOffer`（receiptと一緒に届いた値ではない）。duplicate quorumの相手は、同じorder・同じlotを持つ自己整合したlease全体と、そのofferで示す。lease IDの文字列だけでは数えない。同じ提供者の別leaseも数えない。
- settlement preview (`sky-compute-settlement-preview/1`): `service_credit_hold`、`livePayoutAuthorized=false`、`walletMutationAllowed=false`。

### SKU registry

実装は[`lib/sky-compute-grid-skus.ts`](../lib/sky-compute-grid-skus.ts)。端末へcodeは配らない。SKU idとruntime／model／tokenizerの3つのhashを渡し、端末は署名済みappに同梱した実装を動かす。offerと注文は、hashがregistryの値と一致する時だけ受け付ける。

| SKU | 状態 | 出力 | 一致の判定 | 参照計算 |
| --- | --- | --- | --- | --- |
| `text-lexical-embedding-v1` | `dispatchable` | `i8-vectors/1`、256次元 | byte完全一致 | あり（server） |
| `public-text-embedding-v1` | `fixture_only` | `f32le-vectors/1`、384次元 | item別cosine ≥ 0.99 | なし（engine未選定） |

`text-lexical-embedding-v1`はUTF-8 byteの2・3・4-gramをhashして符号付きで数え、最大値で8bitへ量子化する。浮動小数点を使わないので、どの端末でも同じbyte列になる。仕様文のSHA-256がそのままartifact hashで、[`contracts/sky-compute-grid-lexical-embedding-vectors.json`](../contracts/sky-compute-grid-lexical-embedding-vectors.json)が全実装の合わせるべきtest vectorである。字句の重なりを測るembeddingであり、意味検索用のmodelではない。

浮動小数点のSKUは、同じmodelでもchipが違うと下位bitがずれる。hashの一致では正直な端末同士も不一致になるため、item別のcosine類似度で比べ、非有限値は比較前に拒否する。

### 永続gridのwire protocol

実装は[`lib/sky-compute-grid-live.ts`](../lib/sky-compute-grid-live.ts)。

- **端末の要求**: `POST /api/sky/compute-grid/device`へ`{ payload, signature, outputs? }`。`payload`はJSON文字列で、`schema`（`sky-compute-grid-device-request/1`）、`action`、`requestId`、`authorityId`、`deviceRef`、`keyId`、`issuedAt`とaction別の項目を持つ。`signature`は`rock-sky-compute-grid-device-request/1\0` + payloadのUTF-8 byte列へのP-256 ECDSA（r‖s 64 byte、base64url）。鍵はA2A Broker登録と同じ、Android Key Attestationで検証済みのhardware-backed鍵である。
- **action**: `offer`（供給条件の登録）、`withdraw`、`claim`（現在の充電・idle・通信・温度を添えて仕事を要求）、`release`（結果なしで返却）、`receipt`（結果）。
- **端末が名乗らないもの**: 所有者、trust tier、provider ref、表示名、受け取る単価。所有者はsession、trustは登録記録、単価は保存済みofferから決める。
- **lease** (`sky-compute-lease/2`): lease id、order id、SKUと3つのhash、pool、data class、単価、発行・失効時刻、実行policy、lotごとの入力（base64）。買い手のaccountは含まない。
- **lot入力** (`sky-compute-lot-input/1`): `{"schema":…,"items":[…]}`のUTF-8 byte列。端末はこのbyte列をhashし、`items`を計算する。孤立surrogateを含む文字列はAndroidとV8でbyte列が変わるため注文時に拒否する。
- **注文**: `POST /api/sky/compute-grid/orders`へ`orderId`（clientが決めるUUID）、`pool`、`skuId`、`dataClass`、`regions`（空は制限なし）、`minimumMemoryMiB`、`maximumPriceMicrosPerLot`、`budgetMicros`、`deadlineAt`、`validation`、`lots[{ lotId, items[] }]`。

上限（[`COMPUTE_GRID_LIMITS`](../lib/sky-compute-grid-live.ts)）: 1注文64 lot・入力合計1.5 MiB、1 lease 8 lot・10分、receiptの猶予30秒、注文期限は1分後から7日後まで、1 lotの失敗は6回まで、合議の追加は2台まで、署名するpayloadは15,000 byteまで。

CPU時間ではなく **検証済みlot**で単価を付ける。遅い端末ほど多く稼げる逆インセンティブを作らないためである。

## 5. 状態と失敗遷移

```text
order:      open → completed | completed_with_failures | cancelled | expired
lot:        queued → verified | failed | cancelled
lease:      active → submitted | rejected | released | expired
assignment: leased → submitted → verified | rejected | unverified
            leased → rejected | expired | released
```

- `claim`は条件を満たす注文を期限の近い順に選び、1端末へ同時に1 leaseだけを発行する。同じ端末がもう一度`claim`すると同じleaseを返す。
- `release`と、receiptに載らなかったlotは待ち行列へ戻る。失敗回数には数えない。
- leaseが失効時刻＋猶予を過ぎると`expired`になり、lotは別の端末へ再割当される。失効後のreceiptは拒否する。
- 実行条件を破ったと自ら申告するreceipt、別のruntimeを名乗るreceipt、leaseにないlotを含むreceiptは丸ごと`rejected`。そのlotは同じ端末へ二度と渡さない。
- 結果は`submitted`として保存し、`settleLot`が判定する。`owner_trust`は本人の端末を信じる。`independent_reference`はserverが再計算して比べる。`duplicate_quorum`は必要数の提供者が互いに一致した時だけ合格とし、一致しなければ1台ずつ追加し、上限まで一致しなければlotを`failed`、結果を`unverified`にして誰にも記帳しない。
- 同じlotが6回失効・拒否されると`failed`にする。期限を過ぎた注文は`expired`にし、残りのlotを`cancelled`にする。

host fixtureのmatcherは`matched | partial | unmatched`を返す。条件を満たさないofferには機械可読理由を残す。budgetが足りない場合は割り当てられる分だけ`partial`にし、上限を超えて予約しない。

## 6. 保存・保持・削除・backup

host fixtureは永続保存しない。永続gridは[`drizzle/0063_sky_compute_grid.sql`](../drizzle/0063_sky_compute_grid.sql)の8 tableへ保存する。

| table | 内容 |
| --- | --- |
| `sky_compute_offers` | 端末×SKUの供給条件、provider ref hash、表示名、最後に申告した状態、実績の件数 |
| `sky_compute_orders` | 注文条件、予算・予約・確定額、lotの件数 |
| `sky_compute_lots` | 入力hash、暗号化した入力、必要な結果数と空き枠、確定した出力hash |
| `sky_compute_leases` | 端末への割当と期限 |
| `sky_compute_assignments` | lease×lot。状態、単価、暗号化した出力 |
| `sky_compute_receipts` | 署名済みpayloadと判定の記録。leaseごとに1件 |
| `sky_compute_credit_entries` / `_accounts` | 追記専用の台帳と残高 |

- 入力と出力はAES-256-GCMで暗号化する（[`lib/sky-compute-grid-crypto.ts`](../lib/sky-compute-grid-crypto.ts)）。associated dataでowner、order、lot、役割、平文hash（出力はassignmentも）へ固定する。鍵は`SKY_COMPUTE_GRID_DATA_KEY`。未設定なら注文も結果も保存しない。
- 入力はlotが確定（verified／failed／cancelled）した時に消す。出力は注文が閉じてから7日で消す。買い手は閉じた注文の入力と出力をすぐ消せる。hash、状態、台帳は残す。
- 買い手に返すのは提供者の表示名と粗い地域だけ。端末に渡すleaseに買い手のaccountは含めない。
- 枠、予約、残高はDBのtriggerが更新し、CHECK制約と一意indexが不可能な状態を拒否する: 1端末1 active lease、1 lease 1 receipt、予約＋確定 ≤ 予算、残高 ≥ 0、確定済みassignmentの状態・単価の変更禁止、台帳とreceiptの更新・削除禁止。

削除SLA、法令上の会計保持、backup/restoreの具体値は本番前の未決事項。

## 7. Offline・retry・重複・結果不明

- lease取得前の通信切れは実行しない。
- lease中の通信切れは端末内のlotだけを期限まで続けられるが、失効時刻＋30秒を過ぎた結果は拒否する。
- 注文の作成は`orderId`で冪等。同じ内容の再送は保存済みの注文を返し、同じIDで内容が違えば拒否する。
- `claim`の再送は同じleaseを返す。同じ端末の同時要求でもleaseは1件。
- receiptはleaseごとに1件。同じbyte列の再送は記録済みの判定を返す。同じleaseへの別のreceiptは拒否する。記帳はassignmentが`verified`になる遷移でtriggerが1回だけ行うので、再送・競合・再判定で二重に記帳されない。
- 古い署名のofferで新しいofferを上書きできない。5分より古い、または1分より先の時刻の要求は拒否する。
- 外部作用を伴うworkloadはSKUに入れない。embedding lotは同じ入力・版なら再計算できる。
- timeout後に結果が不明なlotは検証されるまで記帳しない。再割当しても、先の結果が後から合格することはない（leaseが閉じている）。

host fixture側: Verifierはleaseをorder・offerへ照合し、改変lease、別orderのreceipt、差し替えた提供者を合格へ移さない。同じleaseはreceipt IDを変えても同じsettlement keyになる。同じoffer IDの重複入力は拒否する。

## 8. 更新・互換性・rollback・復旧

runtime、model、tokenizerはSHA-256完全一致でleaseへ固定する。いずれかが変われば別versionのSKUとして扱い、進行中leaseを移行しない。matcher／verifierの更新は、保存済みfixture、test vector、期限、重複、改変、部分一致の回帰を通す。

新しい版に問題があれば`SKY_COMPUTE_GRID_MODE`を外して新規の注文・lease・receiptを止める。保存済みのdataと台帳はそのまま残る。Android worker更新時も、leaseのartifact hashが端末の実装と一致しなければ実行せず返却する。端末交換や自動cloud fallbackで仕事の実行先・費用・data境界を黙って変えない。

## 9. 安全・privacy・security・外部承認

- Android supplyだけを初期対象にする。iOSは買い手UI・結果確認だけにし、background供給を約束しない。
- charging、device idle、unmetered network、thermal `light`以下を開始・継続条件にする。owner操作を最優先し、停止を収益より優先する。
- 最初はAPKの直接配布。配布経路にかかわらず、downloaded executable code、DEX/JAR/native library、shell、root、Accessibilityによる迂回を許可しない。審査済みSKUへdataとbounded parameterだけを渡す。
- public poolはpublic/synthetic dataだけ。個人情報、秘密、credential、会話、写真、正確な位置は拒否する。`owner_private`はowner poolだけで、本人の端末にしか渡さない。
- 端末の要求は登録済みのhardware-backed鍵の署名で認証する。充電・idle・温度などの申告は、その鍵を持つ正規appの申告であって、物理的な証明ではない。
- attestationはdevice/app integrityの一要素であり、計算結果の正しさを証明しない。public poolの結果は参照計算または別accountとの合議で別に検証する。
- regionはdata residencyの代替証明ではない。本番の越境要件は契約・storage・routingの別受入を必要とする。
- creditはgrid内の記帳である。換金、払出し、他serviceへの充当はできない。開始残高を与えるのはdeployment側の操作だけで、APIはない。
- 実課金・払出し、税務、労働・通信・消費者法、盗難端末、bot farm、Sybil対策は法務・Provider・OWNERの個別承認前に有効化しない。

## 10. 受入環境と証拠

2026-10-11の実装範囲は **host fixtureの契約修正** と **永続gridのserver側**。実端末は接続していない。

| 範囲 | 証拠 |
| --- | --- |
| host fixtureの契約（提供者の固定、審査済みhash、独立した合議、partial budget） | [`tests/sky-compute-grid.test.mjs`](../tests/sky-compute-grid.test.mjs) |
| SKU、test vector、二つの独立実装の一致、cosine比較 | [`tests/sky-compute-grid-skus.test.mjs`](../tests/sky-compute-grid-skus.test.mjs) |
| 永続grid: 実D1（Miniflare）と実migrationで、署名、割当の競合、偽造、再送、失効と再割当、参照・合議・類似度の検証、台帳、取消、削除、DBのguard | [`tests/sky-compute-grid-store.test.mjs`](../tests/sky-compute-grid-store.test.mjs) |
| HTTP: 注文から結果まで、拒否のstatusとcode、無効時の応答、routeの配線 | [`tests/sky-compute-grid-api.test.mjs`](../tests/sky-compute-grid-api.test.mjs) |
| SKUのJava実装（[`ComputeGridLexicalEmbedding.java`](../android/core/src/main/java/dev/rock/core/ComputeGridLexicalEmbedding.java)）: test vectorの再現と、TypeScript参照との出力一致 | `android/core`のJVM試験、[`scripts/check-os-parity.mjs`](../scripts/check-os-parity.mjs) |

- fixture: [`contracts/sky-compute-grid-fixture.json`](../contracts/sky-compute-grid-fixture.json)、demo API `GET /api/sky/compute-grid/demo`、demo UI `/sky/compute-grid`
- 永続gridのAPI: `GET /api/sky/compute-grid/status`、`GET|POST /api/sky/compute-grid/orders`、`GET|DELETE /api/sky/compute-grid/orders/{id}`、`GET|DELETE /api/sky/compute-grid/orders/{id}/results`、`POST /api/sky/compute-grid/device`

試験の「端末」は、登録済みのP-256鍵で署名し参照実装で計算するsimulatorである。Javaで実装済みなのはSKUの計算だけで、端末を動かすworkerは[設計](sky-compute-grid-android-worker.md)の段階である。**未受入**: Android worker、実機での計算・停止・熱・電力、実際のKey Attestation経路、Cloudflare D1本番での性能と上限、本番migration、public poolの有効化、意味を扱うembedding model、creditの利用先、実需要、実料金、実払出し。

次の受入は順に、(1) [Android worker設計](sky-compute-grid-android-worker.md)の実装、(2) §12の注文consoleの実装、(3) §13の受入用deploymentとPixel 1台でowner poolの注文を実際に計算する（worker設計のW1〜W10）、(4) 同じaccountの2〜5台で切断・発熱・本人使用・改変を試す。50台と外部の買い手はその後である。(1)と(2)の実装はCodexが担当する（2026-10-11、ownerの指示）。

物理MVPの仮説（未達成）: 日本、同系統Pixel/Android 50台、買い手3社以下、1 SKU、期限内verified 95%以上、false accept・二重精算・温度/電池違反・data事故0、比較cloud比総費用25%以上低いこと、4週後provider継続50%、買い手3社中2社が4週間repeatすること。

## 11. 未決事項・decision owner・判定方法

| 未決 | owner | 決めるための試験 |
| --- | --- | --- |
| 意味を扱うembeddingの端末側engineとmodel | O6 / OWNER | Local AI runtimeへのembedding API追加と、grid専用engine同梱の比較。同一入力で機種間のcosineを実測 |
| 端末のemulator受入でのABI | O6 | arm64限定のまま、CI emulator（x86_64）をどう試験経路にするか |
| creditの利用先（cloud利用への充当） | OWNER / O5 | 料金動線の確定後に別契約として受入 |
| public poolの開始残高とSybil対策 | Security / OWNER | 改変worker・複数account・遅延・誤出力を含むred-team |
| 最初のanchor buyerと許可dataset | OWNER / Sales / Legal | 実需要3件のdata分類・期限・単価を比較 |
| 1 lotの正確な文書数・reference Pixel時間 | O6 / O5 | pilot前の同一端末benchmark |
| verification率とduplicate比率 | Security / O5 | red-teamと全費用の比較 |
| provider creditとbuyer price、Sky spread | OWNER / O5 | 全費用（検証・retry・egress・support）込みunit economics |
| 税・利用規約・端末所有者の扱い | Legal / OWNER | 日本pilotの契約・会計review |
| production Wallet rail | OWNER / Wallet | sandbox精算、返金、chargeback、初回限定live受入 |
| retired phone rackをfirm reserveにするか | O6 / OWNER | live phoneとの熱・電力・故障・稼働率比較 |

最大の事業riskは、検証、再計算、通信、fraud、supportを含めるとcloudより高くなること。供給者数を先に増やさず、anchor demandと1 SKUのunit economicsを先に閉じる。

## 12. 注文console — 設計のみ・未実装

永続gridには注文を出す画面がない。APIはあるので開発者は使えるが、ownerが自分で「この文章を自分の端末で計算する」ことはできない。owner poolの受入（worker設計のW2以降）にも注文を出す手段が要る。そのための最小の画面を設計する。

### 体験

1. サインインして`/sky/compute-grid`を開く。永続gridが有効な環境では、説明の下に「自分の端末で計算する」が出る。無効な環境と未サインインでは、今と同じ説明と合成fixtureだけを出し、「この環境では有効化されていません」「サインインすると使えます」と書く。
2. **自分の端末**: 供給条件を登録した端末の一覧。表示名、粗い地域、状態（`active`は受付中、`withdrawn`は取り下げ済み。`active`でも`availableUntil`を過ぎていれば期限切れと出す）、最後に条件を申告した時刻、合格lot数。0件の時は「端末のRockstarOS Shellで『使っていない時間の計算』を入にしてください」と出す。
3. **新しい注文**: 文章を1行に1件ずつ貼る。dataの種類（自分の非公開data／公開data／合成data。初期値は自分の非公開data）、確かめ方（自分の端末を信じる／serverでも計算して比べる／2台で計算して一致を確かめる。初期値は「serverでも計算して比べる」）、期限（1時間／6時間／24時間。初期値6時間）を選び、「自分の端末で計算する」を押す。料金は0と表示する。
4. **注文の一覧**: 状態、合格・失敗・残りのlot数、期限。進行中の注文は「取り消す」、閉じた注文は「結果を保存」と「入力と結果を今すぐ消す」。
5. 端末が動くのは充電中・画面消灯・Wi‑Fiの時だけなので、注文はすぐには終わらない。画面には「端末が条件を満たした時に計算します。この画面を閉じても続きます」と書き、終わるまで待たせる表示（spinnerだけの画面）にはしない。

### 責任と禁止

| 部品 | 責任 | 禁止 |
| --- | --- | --- |
| `components/sky-compute-grid-console.tsx`（client component） | 状態の取得、入力の検査、注文の作成・取消・削除、結果の保存 | 入力・結果を`localStorage`や`sessionStorage`へ保存すること、public poolの注文を作ること、creditの残高を「使えるお金」として出すこと |
| `app/sky/compute-grid/page.tsx` | consoleを説明の下、合成fixtureの上に置く | fixtureの数字を実績として見せること |
| 既存のAPI | 変更しない | — |

consoleが作る注文は固定値を持つ: `pool`は`owner`、`skuId`は`text-lexical-embedding-v1`、`regions`は`[]`、`minimumMemoryMiB`は`1024`、`maximumPriceMicrosPerLot`と`budgetMicros`は`0`。

### 入出力

- 取得: `GET /api/sky/compute-grid/status`。開いた時と、進行中（`open`）の注文がある間は5秒ごと。tabが見えていない間（`document.visibilityState !== 'visible'`）は止め、見えた時に1回取り直す。古い応答が新しい応答を上書きしないよう、要求に通し番号を付け、最後に出した要求の応答だけを画面へ反映する。
- 入力の検査（送る前。serverも同じ検査をする）: 空行を除く。1件も残らなければ送れない。孤立surrogateを含む行は「使えない文字があります（行番号）」として送らない。32件ずつlotへ分け、`lotId`は`lot-0001`からの連番。lotが64を越える（2,048行を越える）、1 lotのJSON（`{"schema":"sky-compute-lot-input/1","items":[…]}`のUTF-8）が65,536 byteを越える、合計が1,572,864 byteを越える時は、どの上限を越えたかを示して送らない。65,536 byteを越えるlotは、越えなくなるまで件数を半分にして分け直す。1行だけで越える時は、その行番号を示す。
- 確かめ方: 「自分の端末を信じる」は`{ method: 'owner_trust', quorum: 1 }`、「serverでも計算して比べる」は`{ method: 'independent_reference', quorum: 1 }`、「2台で計算して一致を確かめる」は`{ method: 'duplicate_quorum', quorum: 2 }`。最後のものは、受付中で期限切れでない端末が2台以上ある時だけ選べる。
- 作成: `orderId`を`crypto.randomUUID()`で作り、**その値をcomponentの状態に持ってから**`POST /api/sky/compute-grid/orders`。通信失敗や5xxの後の「もう一度送る」は同じ`orderId`と同じ内容で送る（serverは同じ注文を返す）。入力を編集したら新しい`orderId`にする。`201`と`200`はどちらも成功。
- 取消: `DELETE /api/sky/compute-grid/orders/{id}`。確認を1回出す。
- 結果: `GET /api/sky/compute-grid/orders/{id}/results`の応答を、そのまま`compute-grid-{orderId}.json`として保存する（`Blob`とdownload link）。画面にはlot数と1件あたりの次元数だけを出し、vectorの中身は出さない。`purged`が`true`の時は「結果は削除済みです」と出す。
- 削除: `DELETE /api/sky/compute-grid/orders/{id}/results`。「入力と結果を消します。元に戻せません」と確認する。

### 状態

```text
console:  loading → signed_out | disabled | ready
draft:    editing → invalid | sending → sent | failed（同じorderIdで再送できる）
```

### 失敗の扱い

| 応答 | 表示と動作 |
| --- | --- |
| `401 sign_in_required` | サインインへの導線。下書きは画面に残す |
| `403 service_entitlement_required` | 「RockstarOS Sky利用権を確認できません」。注文欄を閉じる |
| `503 compute_grid_disabled`／`compute_grid_data_key_unavailable` | 「この環境では有効化されていません」。注文欄を閉じる |
| `429 too_many_open_orders` | 「進行中の注文が上限です。終わるのを待つか、取り消してください」 |
| `409 order_id_conflict` | 新しい`orderId`を作り直して、もう一度送れる状態へ戻す |
| `413` | 上限を越えた旨。入力の検査と同じ文 |
| その他の4xx | 応答の`error`の文を出す |
| 通信失敗・5xx | 「送れたか分かりません。もう一度送っても二重にはなりません」と出し、同じ`orderId`で再送できる |

### 安全・privacy

- 注文の入力は自分の非公開dataでありうる。consoleはbrowserの保存領域へ書かず、tabを閉じれば下書きは消える。保存した結果のfileは利用者の端末に残るので、保存の時に「このfileにはあなたの文章から作ったvectorが入ります」と書く。
- 一覧に出すのは自分の注文と自分の端末だけである（APIがaccountで絞る）。
- この画面はZemaの仕事（work item）を作らない。gridの注文は独自の状態を持ち、`lib/workflow.ts`の状態遷移には載せない。Zemaの一覧へ出す時は、`lib/workflow.ts`を通す別の設計として出す。

### 試験と合格条件

| 層 | 内容 |
| --- | --- |
| Node | 入力の検査を純粋関数（`lib/sky-compute-grid-console.ts`）へ出し、空行、孤立surrogate、32件の分割、65,536 byteでの分け直し、64 lot、合計の上限を試す。作ったlotをserverの`parseComputeOrder`が受理することも同じ試験で確かめる |
| component | 既存の`tests/sky-mcp-center-recovery.test.mjs`と同じ方法で、古い応答が新しい応答を上書きしないこと、通信失敗の後の再送が同じ`orderId`を使うこと、無効・未サインインで注文欄が出ないことを試す |
| browser | `SKY_COMPUTE_GRID_MODE=owner_pool`のlocal起動で、注文の作成から取消まで。390px幅で横overflowがないこと |

合格: 上の3層が通り、`npm run verify`が通ること。実端末が計算した結果を画面から保存できることは、worker設計のW2で確かめる。

### 未決事項

| 未決 | 決め方 |
| --- | --- |
| 1 lotあたりの件数（初期値32） | W7の所要時間から、1 leaseが3分以内に終わる件数にする |
| 結果のfile形式（JSONのまま／vectorだけのbinary） | 最初の利用者（Rock自身）が結果を何に使うかで決める。決まるまでAPIの応答のまま |
| fileの取込（1行1件のtext、CSV） | 貼り付けで足りない件数が実際に出てから |
| 確かめ方の初期値 | W7で参照計算の負荷を測り、serverの費用が問題になれば「自分の端末を信じる」へ変える |

## 13. 受入用deployment — 手順の設計・未実施

実機受入は本番ではないdeploymentで行う。用意するのはownerで、実装者は手順と確認だけを行う。設計の依頼から、公開・契約・本番への反映の許可を推測しない。

| 手順 | 担当 | 内容 |
| --- | --- | --- |
| 1 | OWNER | 受入に使うCloudflare accountと、本番とは別のWorker・D1を決める。既存の検証用環境があればそれを使う |
| 2 | ROCK | そのD1へmigrationを最新（`0063`を含む）まで適用する。本番のD1には適用しない |
| 3 | OWNER | `SKY_COMPUTE_GRID_DATA_KEY`を作る（乱数32 byteを16進64文字にしたもの）。secretとして設定し、Gitにも会話にも書かない。この鍵を失うと保存済みの入力と結果は読めなくなる（注文を出し直せば足りる） |
| 4 | OWNER | `SKY_COMPUTE_GRID_MODE=owner_pool`を設定する。`owner_and_public_pool`にはしない |
| 5 | ROCK | Android Key Attestationの検証serviceがその環境で動いていることを、既存の端末鍵登録（`enrollA2ABrokerDevice`）が成功することで確かめる |
| 6 | ROCK | `ROCKSTAR_SERVICE_ORIGIN`をその環境のoriginにしたAPKをbuildし、SHA-256を記録する |
| 7 | ROCK / OWNER | Pixelでaccount連携、端末鍵登録、workerを入にし、W1から順に行う |

確認: `GET /api/sky/compute-grid/status`の`mode`が`owner_pool`であること。止める時は`SKY_COMPUTE_GRID_MODE`を外す（保存済みのdataと台帳は残る）。

受入が終わっても本番へは進まない。本番DBへのmigration適用と有効化は、W1〜W10と2〜5台の受入の記録をownerが見てから決める別の判断である。
