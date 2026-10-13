# Rockstarサービス利用権と任意claim

Rockstarの無料アカウントを基本の入口とし、同じ本人認証でSky、Zema、Jennifer（利用者表記Jenniffer）と対応するOS/clientへ進む。利用開始にSIM/eSIM購入を要求しない。機器、招待、店頭販売、サービスofferに付帯する追加利用権が必要な場合だけ、既存の署名claimを本人のaccountへ結び付ける。SIM/eSIMは任意の通信・販売adapterとして扱い、OS binaryをSIMへ格納しない。消費者向けeSIMの発行・販売は保留、既定で無効の互換経路として保持する。

本書は利用権の契約を定める。無料account、通信契約/profile、追加利用権、OS/client導入、Package導入、仕事の実行承認、予算・請求はそれぞれ独立した状態である。利用権取得だけでTool実行、端末操作、有料si、回線開通、OS導入を承認しない。既存技術ID・API・schema名は互換のため保持する。

## 目的・利用体験・責任

利用者は一度Rockstar IDでサインインし、SkyでAgent/Toolを選び、Zemaで依頼・見積・承認・進捗・停止・成果・使用額を管理する。任意claimがある場合は `/connect` または対応するAndroid Shellから内容を確認して登録する。claimがない利用者の無料account入口と、追加権利を登録する操作を混同しない。

端末能力を確認し、署名済みimage・boot・復旧が同じexact SKUで受け入れられた場合だけnative OS導入を案内する。それ以外は受入済みapp/browserへ進む。受入済みのCloud jobは、別途の圏外継続同意と承認済み上限内で継続し、再接続時に同じjobの進捗・結果・usageを取得する。

主担当はSecurity / Identity、既存task `SIM01`。責任は次のとおり。

- `ROCK`: owner/session分離、署名・scope・期限・取消の検証、冪等保存、Package照合、停止・復旧、状態表示。
- `EXTERNAL`: issuerの販売/招待条件、外部配送、返品/chargeback、carrier activation、Provider処理、KMS/HSM等の鍵保管。
- `JOINT`: 同じoffer/claim/jobによる外部sandbox受入、鍵rotation、retry/ack、usage/invoice照合。
- `OWNER`: 本人accountへの登録、端末導入、外部送信、権限、見積・予算・実行の明示承認、実契約・支払い。

既存Sky購入注文、Stripe checkout、eSIM provider注文、owner認証、device session/attestation、D1、永続Workflow、Wallet予約・台帳を再利用する。Sky Package購入注文を全サービス共通利用権へ読み替えず、profileやinstall proofをaccount本人性の代用にしない。

## 署名claimと本人登録

### 署名対象と信頼

`rockstar-service-entitlement-claim/1` の署名対象は `schema`、`issuerId`、`issuerKeyId`、`claimId`、`offerId`、`purchaseReferenceSha256`、`claimCodeSha256`、`formFactor`、`scopes`、`issuedAt`、`expiresAt`。固定順JSONと `rockstar-service-entitlement-claim-signature/1\0` のdomain prefixをEd25519で署名し、`signature`を付ける。

- issuer/key/claim/offer IDは既存128文字以内の形式。購入参照とcodeはSHA-256 hashで束縛する。issuer IDを運用台帳の配布主体/チャネルへ対応付ける。
- `formFactor` は `physical_sim | esim | service_only`、scopeは `rockstaros_access | sky | zema | agents` の非重複allowlist。任意の招待・機器・サービス権利は現行 `service_only` を利用できる範囲で表し、新しいfieldやscopeを実装済みとは扱わない。
- `claimCode` は `rsk_` に続く高エントロピーcode。issuer helperは32 random bytesから発行し、claim IDもランダムにする。
- `issuedAt` は安全な整数で、未来30秒を超えるもの、366日より古い発行を拒否する。`expiresAt` はnullまたは発行後かつ現在より未来、発行から最大10年。期限切れを再送で延長しない。
- 未知field/schema/scope、重複scope、code不一致、改ざん、無効/失効/未知鍵、期限不一致を拒否する。信頼設定不備ではfail closedとする。
- `ROCKSTAR_SERVICE_CLAIM_ISSUERS` のoperator設定済み `issuerId + issuerKeyId + publicKeyHex + status` だけを信頼する。issuer自己登録を設けず、重複・不正keyringを受け入れない。署名対象に個人情報、ICCID/EID、QR/LPA、通信secretを入れない。

### 入力・session・冪等性

`POST /api/rockstar/entitlements` は既存owner認証を通した16 KiB以内の `{claim, claimCode}` envelopeを受け、署名・code・時刻・scopeをserver側で検証する。初回は`201`、同じownerの同じclaim再送は`200`と`alreadyClaimed`を返す。別ownerでの再引換は`409`、取消済みclaimも`409`。DB/config障害は`503`で止める。

Webは `/connect#rockstar-claim=<base64url(JSON {claim,claimCode})>`、JSON file、貼付けを受ける。fragmentは最大32,768文字、復号packageは16 KiB以内。fragmentのcodeをHTTP URLへ載せず、同じタブのsession storageへ一時退避してからURLを消す。保存できなければURLを残して明示再試行を可能にする。account確認後に一時transportを取り出し、利用者が「このRockstar IDに登録」を押すまで送信しない。成功時は入力と一時transportを消す。接続結果不明時は本人操作で同じpackageを再送し、新claimを自動発行しない。署名の有効期限をserverで毎回確認し、session storageを永続秘密保管や権限証明にしない。

Android Shellはdevice-homeがredeem入口を報告した場合だけ入力欄を出し、現在のownerへbindすることを明示確認する。Brokerが既存暗号化device sessionで設定済みsame-origin HTTPS endpointへ送る。入力をview saved state/autofillへ保存せず、成功またはowner session解除時に消去し、自動再送しない。device-homeはissuer設定を公開せず、redeem可能かだけ示す。native登録経路の既存Java/AIDL/APK build・API 35 emulator CIは`19ef1020`と[端末連携の証拠](rockstar-device-link.md)で確認する。販売元→Shellのhandoff配信、実購入、変更後の実端末/Pixel全OS受入は別条件である。

Webのfragment/file/pasteは一つの登録候補を共有し、別入力を選んだら旧link候補を破棄する。不正な新入力から旧購入へ戻さず、file読込中は登録を止め、遅延読込で最後の選択を上書きしない。登録中の入力変更も止める。一覧/登録は共通transportでheader/bodyを合わせて10秒以内、redirect自動追従なしとする。応答喪失・不正成功応答は一覧readbackで照合し、POSTを自動再送しない。同じ購入入力は画面内で保持し、401では旧一覧/操作を隠し、別タブsign-in後に元画面で再確認する。画面を閉じた後の入力保持は保証しない。

`GET /api/rockstar/entitlements` は本人の最大100件の権利とprofile状態を返す。他ownerやissuer鍵詳細を返さない。`rockstar_service_entitlements`にはowner、claim/offer、購入参照hash、code hash、scope、form factor、署名、期限・取消状態を保存し、平文codeや通信秘密を保存しない。既存owner/revision競合判定と安全なsession保存を維持する。

### 購入単位の一意性・取消・再発行

Migration `0039` と `0050_rockstar_entitlement_purchase_once.sql` の `(issuer_id, purchase_reference_sha256)` unique制約で、同じ購入権利から異なるclaim ID/codeが出ても同時引換は一件だけ成功する。issuerは権利単位のreference hashを使い、複数権利を束ねた注文番号を使い回さない。無料account作成や追加権利の発行理由を、実決済完了の証拠にしない。

`POST /api/rockstar/entitlements/events` は8 KiB以内のissuer署名済み `rockstar-service-entitlement-event/1` を受ける。署名対象はschema、issuer/key ID、event ID、claim ID、購入参照hash、`refunded | revoked`、発行時刻で、claimとは別のdomain prefixを使う。未来30秒超・90日より古いevent、署名なし、不正鍵、同じevent IDの異内容を拒否する。同じissuer/event IDと同じ署名内容の再送は冪等とする。

引換前でも取消eventをtombstoneとして保存し、遅着した旧claim/codeを拒否する。引換後はactive権利を`refunded`または`revoked`へ一方向に変更する。これはservice entitlementの取消であり、回線取消や決済返金完了を意味しない。

`replaceRockstarEntitlementClaim` は旧claimの取消eventと新claim/code packageを準備する。`replaceRockstarEntitlementClaimWithAcknowledgement` は同じ署名済みmaterialを受け、exact event ID・`revoked` status・`alreadyApplied` booleanの確認応答がそろうまで新packageの配信callbackを呼ばない。issuer・購入参照が同じ、旧/新claim IDが異なることも照合する。取消送信の冪等キーはevent ID、代替配信の冪等キーは新claim ID。adapterは同じmaterialを秘密保護されたdurable storeへ残してtimeout後にも再利用する。

**rolloverの現在の限界:** 引換前に旧claimを取り消した場合は、tombstoneを保ったまま同じ購入参照の別claimを引換できる。引換済みrowは取消後も`0050`のunique制約を占有するため、同じ購入参照の新claimを無条件に登録できない。引換済み購入のrolloverは未受入で、owner保持・監査・並列競合を守る移行/契約が必要。制約回避のために購入参照を変えたり、旧rowを自動削除したりしない。

本番`0050`適用前にはread-onlyで次を確認する。重複があれば移行を止め、権利者を自動削除/統合せずissuerと照合する。

```sql
SELECT issuer_id, purchase_reference_sha256, COUNT(*)
FROM rockstar_service_entitlements
GROUP BY issuer_id, purchase_reference_sha256
HAVING COUNT(*) > 1;
```

## issuer・配信台帳・鍵管理

`lib/rockstar-entitlement-issuer.ts` は外部KMS/HSM等の非抽出Ed25519 private signing keyを受ける。公開鍵、抽出可能な鍵、sign権限なしの鍵を拒否し、秘密鍵を永続化しない。codeは発行時に一度だけ返し、再送復旧は別の暗号化配信台帳で行う。

`lib/rockstar-entitlement-issuer-store.ts` とmigrations `0052/0053` は、issuerごとのhash化idempotency key、request/claim digest、署名claim、暗号化code、`prepared | delivered`をD1へ保存する。同じkey・同じ条件の再送/並列要求は一つの保存済みpackageへ収束し、条件変更は拒否する。AES-GCMのAADはissuer・idempotency digest・request digest・claim digest・key IDへ束縛し、nonceとciphertextを保存する。平文codeをD1へ書かない。

delivery timeoutは`prepared`を維持し、同じpackageと同じdelivery idempotency keyで再試行する。外部配送providerがそのpackageを受け入れた後にだけackし、code ciphertext/nonceを削除する。署名claimと非秘密の監査情報は残す。ackはprovider enqueueの確認であり、最終利用者の受信・閲覧の証拠ではない。

operator設定は次を使う。

- `ROCKSTAR_ENTITLEMENT_DELIVERY_SELLERS`: `{issuerId, tokenSha256}`のJSON array。issuer/token hashの重複を拒否。256-bit以上のrandom bearerを別secret channelで渡し、Rockstarにはdigestだけ置く。認証はconstant-time比較。
- `ROCKSTAR_SERVICE_CLAIM_ISSUERS`: claim/event公開鍵trust inventory。seller bearer認証と署名trustを別々に検証する。
- `ROCKSTAR_ENTITLEMENT_DELIVERY_CODE_KEYS`: `{"currentKeyId":"...","keys":{"key-id":"64 hex chars"}}`。current/previous wrapping keysを運用secret storeへ置く。

新規packageはcurrent keyで暗号化し、未配信rowの`code_encryption_key_id`に対応するprevious keyを復旧用に残す。旧key削除前に、それを参照する`prepared` rowsが0件であることを照合する。署名private keyとcode-encryption keyは別鍵・別目的。production keyringはCloudflare secret/KMS等で別設定・reviewし、test鍵を昇格しない。secret、claimCode、LPA/ICCIDをログへ出さない。seller token失効・rotation・redaction・retentionも外部受入の対象にする。

### seller-neutral API

`POST/GET/PATCH /api/internal/rockstar/entitlement-deliveries` はissuer単位のbearerと権利単位の`Idempotency-Key`を要求する。複数claimで同じ注文keyを共有しない。sellerは自ら販売/招待成立・返品状態を確定する。このAPIは購入金額、決済、通信開通を判断せず、配送providerにも直接送信しない。

```http
POST /api/internal/rockstar/entitlement-deliveries
Authorization: Bearer <seller-secret>
Idempotency-Key: <stable-per-claim-key>
Content-Type: application/json

{"claim":{"...":"operator-trusted signed claim"},"claimCode":"rsk_<one-time-secret>"}
```

POSTは16 KiB以内の署名済みpackageを検証・暗号化保存する。初回`201`、再送`200`で`{issuerId,claimId,state:"prepared",replayed}`を返し、codeを返さない。GETは同じissuer/keyの未配信packageを復旧し、外部providerへ同じpackage/keyを送る。PATCHは`{"claimId":"<exact-claim-id>"}`の一致を確認してackする。ack後GETは`package:null,state:"delivered"`で秘密を再表示しない。body/responseをbounded/no-storeにする。

Migration `0054` は認証済みissuerごとのPOST/GET/PATCH共通120要求/分のD1 windowを原子的に強制し、超過時は`429`と`Retry-After`を返す。sellerは同じkeyで指定秒数後に再試行する。

- `400`: JSON/claim/key不正。入力を修正し、新しい権利条件には新しいkeyを使う。
- `401`: token不正。credentialのrotation/revocationを確認する。
- `404`: 同じissuer/keyのrowなし。成立を推定せずissuer台帳と照合する。
- `409`: key再利用の条件/claim不一致、または未配信でないrowへの不正ack。別claimの自動作成で回避しない。
- `413/415`: 16 KiB超/JSON以外。仕様通り修正する。
- `503`: trust/keyring/store/復号不備。自動新規claim化せず運用照合する。

## offer・Package・実行先の結合

claimは追加のservice scopeとofferを示す。`ROCKSTAR_SERVICE_OFFER_PROFILES` の `rockstar-service-offer-profiles/1` が `issuerId + offerId` を `profileId + version + label + exact packageKey + manifestSha256`へ対応させる。構成変更は新offer ID/profile versionで行い、既存claim用mappingを保持する。Package設定の例は次の形で、key/hashは現行レビュー済みRegistryのexact値を使う。

```json
{"schema":"rockstar-service-offer-profiles/1","profiles":[
  {"issuerId":"trusted-channel","offerId":"developer-v1","profileId":"developer",
   "version":"1.0.0","label":"Developer",
   "packages":[{"packageKey":"publisher.tool@1.2.3","manifestSha256":"<64-lowercase-hex>"}]}
]}
```

APIはPackage key、署名済みmanifest hash、現在のverified/review/失効を照合する。不一致・未登録・失効は`review_required`、設定なしは`not_configured`、catalog不調は`catalog_unavailable`とし、追加権利自体はcatalog不調だけで取消しない。device-homeはpayload上限のためactive権利最大5件、profileごとのPackage名最大4件に絞る。

ready PackageはSky Marketplaceのexact keyへdeep linkし、Registryを再取得して詳細を開く。失効/消失時はinstallable扱いをやめて再確認を促す。初期構成は任意の候補で、install/executeは本人操作・Package権限・provider接続・費用承認を別途要求する。Healthcare/Lifelineの実Package、緊急対応、本番offer、端末導入を提供済みと表示しない。

Marketplaceはownerのactive claimとexact reviewed offer Packageを照合し、付帯Packageを別売りとして二重購入させない。取得中は単品価格未確定、entitlement API失敗時は購入停止。Checkout APIもD1から再確認し、付帯Packageは`409`、有効claimがあるのにprofile設定parse不能なら`503`。期限切れ/取消済みclaimは正当な再購入を妨げない。この表示gateはPackage単位のlicense record・実行authorizationやProvider接続完了の代用にならない。作者利用料、LLM/cloud usage、runtime permissionは別確認する。

付帯Package CTAはkeyをZema Workbenchへ渡し、Workbenchがactive claimと現行審査manifestを確認した後にkey/hash/概要を見積対象の依頼へ含める。依頼仕様への参照であり、実行先は本人が選ぶ。

- PCの直接候補は`mcp_stdio`、PC対象、Package無料宣言、ownerの接続済みPC stdio runtime、exact input/output schema一致がそろう場合だけ出す。本人選択後は既存Connectorのtool固定・内容確認・一回approvalを使う。schema一致はinterface bindingでありsource install/実装同一性の証明ではない。remote MCP、有料Package/Tool、未接続、schema欠落/不一致は扱わない。
- Cloud `rockstar-sky-package-runtime-binding/2` はAgent Card hash、Package key/manifest hash、operation ID、A2A extension URI、input/output schema hash、pricing version、必須usage meterをEd25519署名へ束縛し、信頼鍵をexact Package版/hashへpinする。`POST/PATCH /api/internal/sky-package-runtime-bindings` は運営認証、署名、設定済みURI、現行review/manifest/schemaを確認してimmutable登録・冪等再送・失効する。
- 同じbinding digestを見積・delegation・approval・Broker proofに固定し、Workerはdispatch前にactive bindingと全条件を再確認する。SendMessageのProvider-declared extension header/message extension/invocation metadataはRockstar protocol proposalであり、Providerのoperation実行・schema検査・署名receipt受入は別条件である。
- 成果確認には同じ親jobのremote-completed委任、取得済み成果、Provider署名usage receipt、本人の明示確認を要する。候補表示やlocal fixtureをTool成功へ昇格しない。

## scope gate・費用・停止

無料accountの基本利用とoptional claimの追加条件を商品/UIで分ける。既存`ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED=true`の配備は、新規Zema仕事に`zema`、Sky A2A directory/MCP接続に`sky`、Cloud LLM requestに`rockstaros_access`、新Agent委任/承認/Broker proof登録に`agents`を要求する。Workflow dispatch直前・prepared-job scannerも再検査し、失効した未送信jobは`prepared`へ保留する。既存job閲覧・cancel・結果回収、送信済みremote taskの照合を保持する。

未設定flagはDeveloper Preview互換の実装であり、本番認証設計の代用ではない。無料accountを本番の基本accessへ対応付ける場合は、商品scopeと全route/background/recoveryの対応を明示し、owner・権限・失効・費用検査を保持した受入が必要。文書変更だけでscope gateを変更済みとしない。

有料si/Agentは単価・Provider・通貨・見積・最大額・入力共有・圏外継続可否を先に提示し、本人の見積同意、予算hold、実行承認を保存してからdispatchする。親job/並列jobの共通予約で二重使用を防ぎ、許可済み予算を超えて実行しない。実資金確保と予約は別gate。上限保証できないProviderを有料有効化せず、増額は再見積・明示再承認を要する。

- `0041_a2a_price_quotes.sql` はquoteを委任へ保存し、quote digest再利用をunique partial indexで拒否する。
- `0042_remote_ai_rate_cards.sql`、rate-card store、`POST/PATCH /api/internal/remote-ai/rate-cards` は署名済み料金表を不変IDで保存し、冪等登録・失効を扱う。運営Bearerと`REMOTE_AI_TRUSTED_RATE_KEYS`のProvider署名trustを分ける。
- `0043_a2a_delegation_fanout_limits.sql` は親job総委任8件・同時active4件をD1 triggerで強制し、現在の一段委任とともに過剰再帰/並列を抑える。
- `0044_a2a_live_usage_snapshots.sql`、`POST /api/sky/a2a-delegations/{id}/usage-snapshots`、`lib/a2a-live-usage.ts` はowner/task/price/currencyを束縛したEd25519累積meterを追記保存する。連番・額・時刻の単調増加とhold capをD1でも強制し、同じ署名eventは冪等、改変再送は拒否する。最終receiptは最新暫定meter以上・同じProvider/task/pricing versionでなければsettleしない。
- Workbench/Zemaはactive taskを10秒ごとに更新し、reserved/暫定meter/確定usage/invoice/settledを区別する。receiptなしで予約上限を実利用額にしない。通貨はISO 4217の桁数で表示し、未認識通貨の桁数は推測せずcode/最小単位を明記する。rate-card単価は100万tokens当たり等の単位を示す。
- 直接LLMのtext/legal/patent/Jev経路は実料金・実行認可・usage精算未受入時にfail closedを維持する。durable queueやstream由来の暫定estimate、Provider response usageを本番請求の証拠にしない。実行中の確定meter未報告を明示する。

価格拡張は[A2A価格見積契約](a2a-pricing-extension.md)、停止・同一job復旧は[Cloud運用手順](sky-cloud-operations-runbook.md)を使う。A2A Core標準や本番の停止保証をProvider契約なしで宣言しない。Stripe、通信料、作者料金、Wallet settlementは個別照合し、同じ費用を二重請求しない。

## 互換経路: 任意eSIMのCloud access

この節は既存の通信同梱adapterを保全する契約であり、通常の無料accountにSIMを要求するものではない。消費者向けeSIM販売は既定無効。再開には販売/通信/鍵/端末/Providerの各受入が必要で、既存署名・注文・review検査を取り外して無料account経路へ流用しない。サービス登録QR/URLとeSIM activation codeを分ける。

### 前提・設定・credential

`GET/POST /api/esim/orders/{orderId}/cloud-access` を通常のowner accountから管理する。入力条件はlive paid・未返金の既存注文、そのprofile binding、exact installed/enabled署名receipt、対応するtrusted/attested gateway鍵、現在レビュー済みStarter Packのexact key/hash。ブラウザーのboolean、IP、EID/ICCID、別SIM通信成功でこれを代用しない。元のcarrier/device handoffは外部受入待ちであり、導入だけでbrowser起動やCloudログインを自動作成しない。

Migration `0061_esim_cloud_access_keys.sql` とserver専用 `ESIM_CLOUD_ACCESS_POLICIES_JSON` を使用する。JSON rowは `{packageKey, manifestSha256, accessDurationDays, scopes}`。unique purchased key/hashごとに1–366日の期間、allowlist内の非重複scope、必須`rockstaros_access`を明示する。設定欠落/不正はgrantを止める。`ESIMGO_PLAN_CATALOG_JSON`、不変注文pricing snapshot、`ESIM_INSTALL_RECEIPT_KEYS`、既存gateway鍵を再利用し、商用期間/scopeをofferごとに決める。fixture値を価格/契約として採用しない。

GETはeligibility、scope、service期限、公開key metadataと `not_issued | active | suspended | expired | revoked` を返す。POSTは`issue`またはcurrent `expectedKeyId`を伴う`rotate/revoke`。stale IDは`409`。D1は注文ごとに一つのactive keyを強制し、tokenのSHA-256 hash、owner/order/device/receipt参照、scope、期限、rotation linkと監査rowだけを保存する。raw secretをJSON、markup、Web storage、ログへ返さない。

issue/rotateはmetadataとHttpOnly・SameSite=Strict・Path=`/api`のcookieだけを返し、loopback HTTP以外はSecure。browser bearer保有はhardware proofではなく、元のattested order/deviceへ結合したまま毎回再検査する。scopeはcredential自身との積集合に限定し、Previewやownerの広い権利で拡張しない。明示allowlistのCloud work APIのみ受け付け、account管理・Provider接続・支払い・完全な`/chat`管理には通常account/sessionを要求する。key自身でissue/rotateしない。

credential期限は最大30日かつ元gateway activationからのservice期間以内。rotationでservice期間を更新しない。毎回paid/refund、profile/install receipt、gateway trust、現行Package review/hash、policyを再確認し、不一致/期限切れ/失効で停止する。既存job/receiptの回収や別途保持するservice claimはこのkeyの停止で取消さない。

### 並列競合・cookie・購入画面の復旧

exact購入 `{packageKey, manifestSha256}` pinsで、Cloud認証、issue、install proof、device activation、購入状態/catalogを照合する。一般Registryの表示件数による排除を権利失効にしない。pinsは重複排除し、queryごと最大40組（review時刻を含む81 parameters）へ分ける。現行review期限、Package status、canonical manifest hashは引き続き必須とする。

並列rotationは一件だけ勝ち、旧keyは停止する。revokeは元のrevocation状態と比較する。replacement途中でeligibilityが変わった場合は、revoked predecessorを明示retry用に発見可能なまま残す。issue応答が失われた場合は状態を取得し、保存済みcurrent keyを本人操作でrotateする。平文secretをstoreから復旧しない。

revokeでcookieを消すのはcredential hashがexact owner/order/keyへ一致する場合だけ。比較結果は原子的な更新のbooleanとして扱い、hash/secretをmetadataへ返さない。別注文のcookieを消さない。issue/rotateは返答前にcurrent keyをreadbackし、別操作で置換/失効した、またはeligibilityを失った場合は `409 CLOUD_ACCESS_CONFLICT` を `Set-Cookie`なしで返す。本人がrefreshしてcurrent recordを明示rotateする。readback後も失効し得るため、無期限の有効性を保証しない。

購入画面は共通transportでresponse header/body待機の両方を10秒に制限し、sign-in redirectを追跡しない。delivery、erasure、rotationを自動再実行しない。非eSIM/不適格、install materialの利用不能/ack済み、要求失敗ではcached install codeを消す。要求失敗では古いentitlement/cloud metadataも消して、現在状態を確認してから次の操作へ進む。結果不明は「不明」と示しserver mutation失敗へ読み替えない。同じタブのdelivery IDを保ち、本人の取得retryで同じ試行を復旧する。設定/DB障害ではfail closedで内部エラーを露出しない。

元の未統合作業コピーには端末署名付きアクセスの追加候補があるが、現行mainのcookie/key経路をその候補で置き換えない。schema、migration番号、owner/scope、replay防止、signer、device鍵保管、同じjobの復旧をsourceと照合し、既存migrationとの競合を解消してから個別に統合/受入する。eUICC鍵・現在のSIM挿入・回線固定をsource未受入のまま証明済みにしない。

## 検証・残る受入・次の実装

既存local source/fixture証拠は、署名claimとone-owner binding、引換前取消tombstone、replacement ack、暗号化再送/rotation、seller API/rate limit、Package/profile gateを対象とする。合成鍵・残高・注文・receiptを、実購入・実請求・本番配備に換算しない。証拠は [claim/Android source](evidence/sim-service-android-native-claim-local-20261002.json)、[replacement ack](evidence/sim-service-replacement-ack-local-20261002.json)、[配信store](evidence/sim-service-issuer-delivery-store-local-20261002.json)、[seller API](evidence/sim-service-issuer-delivery-api-local-20261002.json)、[rate limit](evidence/sim-service-issuer-rate-limit-local-20261002.json)、[offer profiles](evidence/rockstar-service-offer-profiles-local-20261002.json)を参照する。

互換eSIM経路の合格条件は、exact pinのreview/hash/失効、他owner拒否、credential秘密非公開、scope隔離、並列rotation/revoke、期限非更新、predecessor復旧、cookie一致/readback競合、header/body timeout、同じdelivery IDの結果不明復旧である。source/SQLite/component fixtureとcarrier/端末/Provider本番は分ける。

再現する際は対象契約の試験を先に実行し、結果と実行環境を新しい受入記録に残す。

```sh
node --experimental-strip-types --test tests/rockstar-entitlement-claim.test.mjs tests/rockstar-entitlement-issuer.test.mjs tests/rockstar-entitlement-issuer-store.test.mjs tests/rockstar-entitlement-delivery-http.test.mjs
node --experimental-strip-types --test tests/esim-cloud-access.test.mjs tests/esim-cloud-recovery.test.mjs tests/esim-purchase-recovery.test.mjs
npm run design:check
TMPDIR=/private/tmp npm run verify
```

exact-pin/cookie/purchase-screen復旧の専用fixtureは引継ぎ元の `tests/esim-cloud-recovery.test.mjs` と `tests/esim-purchase-recovery.test.mjs` で追跡する。対象source/fixtureが現在branchへ同期されていない場合は先に保全同期し、未実行を成功に数えない。本書の再編だけではruntime検証を更新しない。

残る条件と順序は次のとおり。

1. main/作業branch/未commit差分を保全同期し、無料accountの基本accessと任意claim条件を商品・全route・background・recoveryへ対応付ける。既存安全gateを保持し、引換済み購入のrolloverを別の未解決taskとして定義する。
2. issuer契約、signing/wrapping key custody、production token/keyring、test鍵拒否、seller checkout/招待/外部配送、refund/chargeback webhook、retry/ack/rotationをcontracted sandboxで受け入れる。取消ack前にreplacementを配信しない。
3. production D1 migration前の重複検査とreadbackを実施する。既存local記録のproduction readbackは0/6で、現在の本番適用を証明しない。
4. exact Package runtime、Provider operation/schema/署名meter/receipt、live rate、stop-at-cap、invoice reconciliation、funded Wallet settlementを受け入れる。production直接LLMを文書だけで有効化しない。
5. Android SDK/JDK CIとexact端末で、同じjobのquote→hold→圏外継続同意→明示approval→切断→再接続→result/receiptを確認する。既存native登録sourceのbuild/API 35 emulator証拠は上記の範囲で保持し、このcloud縦断・変更後の実機/full OS・Provider受入へ転用しない。未実行の項目は`NOT_RUN`で残す。他のAPK/QEMU/実機証拠をこの経路の合格へ転用しない。
6. consumer eSIM販売を再開する場合だけ、carrier資格/契約、profile発行/導入/失効、物理SIM履行、購入者配送を別受入する。native OSは同じexact image/SKUで署名・installer・rollback・first boot・Sky/Zema起動を別受入し、未対応機種はapp/browserへ留める。

商用offerの期間/scope、無料accountと付帯権利の本番policy、招待issuer運用、引換済みrollover、carrier/device signer、料金/税/最低額/請求周期/返金条件は、既存商品・Provider・release gateで根拠を揃えて決める。条件未指定を実行許可・提供済みへ読み替えない。
