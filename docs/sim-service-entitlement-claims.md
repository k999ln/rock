# SIM/eSIM購入とRockstarサービス利用権

2026-10-02の現行製品方針を実装へ落とす文書。SIM/eSIMはRockstarOS内の通信商品ではなく、RockstarOSとSky/Zema/Agentへの簡単な入口を含む製品オファーである。OS binaryをSIMへ保存する設計ではない。物理SIM・eSIMの販売は通信事業者、Rockstar直販、端末販売店、オンライン販売など複数チャネルを許容し、チャネルから受け取る購入証明を共通利用権へ変換する。

## 現行実装の監査

| 領域 | 再利用できるもの | 方針変更・不足 |
| --- | --- | --- |
| 購入 | `sky_commerce_orders`の決済状態、Stripe checkout、注文の一意性パターン | Sky Market注文はSky package購入用であり、Rockstarサービスの販売チャネル共通権利ではない。直接eSIM profileと結びつけない |
| eSIM | provider注文・webhook inbox・profile digest・install materialの暗号化・reconciliation | 回線契約/開通は利用権claimと別の状態。物理SIM/他社販売も同じ利用権フローへ入れる |
| 認証 | `requestUser`によるRockstarアカウントのowner識別、所有者スコープのAPI | サービスごとの再登録を避け、claim後の一つのowner IDをSky/Zema/Agentへ渡す |
| 端末 | capability snapshot、attestation、device entitlement、OS/app/browser分岐 | eSIM端末機能やinstall proofを購入権利の代用にしない。OS導入は端末/SKUごとの検証が必要 |
| Cloud/Agent | A2A durable job、再開/再調整、オフライン継続同意、owner auth | claimに含まれるのはアクセス権のみ。Agent実行はCloudで行い、料金・予算・実績usageは実行ごとに別記録する |
| 課金 | Wallet budget reservation、署名rate-card/quote、A2A live meter snapshot、provider usage receipt、Stripe請求の既存部品 | Zema task UIに単位単価・依頼別見積・上限・予約/暫定meter/確定計算明細を表示するsourceはある。Provider契約、実rateの確認、production meter/invoice、funded Wallet debitは未受入 |

## 購入から利用まで

1. 販売元が物理SIM/eSIM (またはサービスアクセス単体offer) を販売し、キャリア回線の契約/開通は販売元の回線手続きで行う。購入商品にRockstarOS/サービス利用権が含まれる条件を購入画面で表示する。
2. 購入経路はRockstar直販、通信事業者、端末販売店、外部オンライン販売元等を許容し、RockstarOS内の回線catalogを必須の販売面にしない。信頼済み販売元issuerは署名付きclaimと高エントロピーclaim codeを購入者へ別途渡す。短い導線には`/connect#rockstar-claim=<base64url(JSON {claim,claimCode})>` handoffを利用できる。claim codeはfragmentにだけ含みHTTP requestへ送らず、clientはsame-tab session storageへ一時退避後にURL fragmentを消し、利用者が明示的に登録操作を行うまでserverへ送信しない。署名検証とone-owner bindingは引き続きserver側が行う。現在のclaimはissuer ID・offer ID・ランダムclaim ID・購入参照のhash・codeのhash・SIM form factor・grant scope・有効期限を結びつけるため、issuer IDはissuer keyringと運用台帳上の配布チャネル/販売主体へ対応付ける。署名対象に個人情報、ICCID/EID、QR/LPA、通信secretを入れない。
3. 購入者は一つのRockstar IDを端末または`/connect`で連携し、同じowner-bound claim endpointへ一度送る。Android ShellはBroker内のdevice sessionで直接登録でき、Web `/connect`はfragment/file/pasteのfallbackを維持する。APIはissuer/key trust設定、Ed25519署名、code、時刻、scope/form factorを検証する。Migration `0050_rockstar_entitlement_purchase_once.sql`は`(issuer_id, purchase_reference_sha256)`をuniqueにし、同じ購入明細から異なるclaim ID/codeが発行されても、最初のredeemだけが一つのaccount ownerへbindされる。並列redeemも一件だけ成功し、別owner replayは拒否、全く同じpackageを同じownerが再送した場合は冪等。販売元は1権利単位のpurchase reference hashを使い、複数権利をまとめた注文番号をそのまま使わない。

Android Shellのnative登録欄は、device-home APIがissuer設定から有効なredeem入口を報告した場合だけ表示する。購入者は販売元から受け取ったclaim JSONを入力し、現在のRockstar IDへ結び付けることを明示承認する。入力は保存対象から外し、登録要求は自動再送しない。これは購入後のclaimを端末内で入力できるsource実装であり、販売元からShellへのhandoff配信、Android build/端末受入、実購入は未検証。[ローカル証拠](evidence/sim-service-android-native-claim-local-20261002.json)。
4. `/connect`は利用端末の能力を確認し、実際に受け入れ済みのexact SKUのみRockstarOS installを選ぶ。ほかはWeb/app service clientへ移る。claim成功はOS installやcarrier activationの証拠ではない。
5. 主画面からSky、Zema、Agent、job履歴を一つの認証で開く。taskはCloudへ送信し、ユーザーが明示許可したtaskは端末がofflineになってもCloud上で継続する。再接続時はprogress/result/usageを再取得する。
6. Paid execution前に現在の料金表とestimateを表示し、ユーザーが指定した上限内の予算holdを取得する。実行中のreserved/settled額、完了後の署名されたitemized usageを同じtask detailへ表示する。上限超過は新たな明示承認がない限り実行しない。

## 実装・ローカル検証・外部受入の境界

この設計文書は、SIM/eSIM購入がRockstarOS service accessを含むという現在の製品方針に従う。利用者向けにはeSIMをOS内で売る前提にせず、物理SIM/eSIM・Rockstar直販・キャリア・端末店・オンラインの購入チャネルから、一つの署名claimとRockstar IDへ接続する。通信activation、サービスentitlement、OS/client導入は別々の状態である。

## 今回実装した範囲

購入後の短い案内は`/connect`へ集約する。購入/回線開通、Rockstar IDの一度の連携とclaim引換、端末に適したOS/clientの選択、Sky/Zema/Agentへの直接入口、依頼の見積・上限承認・進捗/結果を順に案内する。販売チャネルや通信開通の資格がない状態でも、これらのUI/sourceが実購入や回線利用開始済みと誤表示しない。

`/connect`では、販売元が渡す`{ "claim": ..., "claimCode": "rsk_…" }` JSONをfragment handoff link、ファイル選択、または貼り付けで受け取り、16 KiB以内のclaim/code envelopeだけをAPIへ渡す。利用開始linkは同じタブのsession storageを一時transportにし、URL fragmentを除去後、画面から明示承認されるまで登録しない。Android Shellは端末連携済みの場合、同じJSONをnative formからBrokerへ渡し、Brokerが暗号化sessionを使って同じowner APIへHTTPS POSTする。native入力はview state/autofillへ保存せず、成功時またはowner session解除時に消去し、失敗時も自動再送しない。両方ともissuer署名検証・有効期限・scope検証・one-owner bindingはserver-sideで行う。Android native pathはsource実装済みだが、Java/AIDL/APK/device acceptanceは未実施。seller checkout、実販売元によるclaim発行/配信、issuer契約、本番鍵配備、購入者配送は未接続。

### Offer別の初期Agent構成

購入claimはサービス利用権を付与し、ツールを自動実行・導入する権限は付与しない。任意設定`ROCKSTAR_SERVICE_OFFER_PROFILES` (`rockstar-service-offer-profiles/1`) が、署名claimの`issuerId + offerId`を`profileId + version + label + exact Sky packageKey + manifestSha256`へ対応させる。これによりLifeline、Developer等で異なる構成を複数の販売チャネルから同じowner-bound entitlement経路で案内できる。構成を更新する場合は既存購入の意味を変えないよう、新しい`offerId`とprofile versionを発行し、旧claim用のmappingを保持する。

APIはSky registryでpackage key、署名済みmanifest hash、現在のverified/review状態を照合し、一つでも不一致・未登録・失効があれば`review_required`として表示する。利用開始画面の各ready PackageからSky Marketplaceの正確なpackage keyへdeep linkし、Registry再取得後にそのPackageの詳細を開く。遷移時点で審査済みRegistryから消えている場合はinstallableな項目として扱わず、購入権自体は維持して利用者へ再確認を促す。購入者にはレビュー済みの初期構成を示すだけで、install/executeは個別の本人操作とpackage側の権限・予算承認を要求する。追加agentはSky Marketplaceから別途選べる。現在は汎用mapping/runtimeと合成packageのローカル試験のみで、Healthcare/Lifeline実provider package、販売offerへの本番設定、実端末への導入は未実装・未受入。Healthcare用途や緊急対応を提供済みとは表示しない。

Marketplaceはowner-scopedのactive entitlement profileを読み、現在のofferに含まれるexact packageを別売りとして再購入させない。利用権取得中は単品価格を未確定として表示し、entitlement APIが失敗した場合も二重購入を避けるため購入を停止する。Checkout APIもactive claim・offer mapping・exact reviewed PackageをD1から再照合し、付帯Packageは`409`で拒否する。offer profile設定がparse不能なら有効なclaimがあるcheckoutを`503`で停止する。期限切れ・取消済みclaimは再購入を妨げない。これらのAPI挙動はsynthetic SQLite/Worker fixtureで検証済みで、本番Stripe/販売や請求受入ではない。この表示・checkout gateはSIM/eSIM offerの構成案内と重複購入防止であり、Package単位の実行authorization/license recordや、Sky/Zema/providerへの接続完了を意味しない。Package実行に必要なprovider接続、runtime permission、作者側利用料、LLM/cloud usage料金、実際のagent起動経路はそれぞれ個別に確認する。Marketplace CTAは付帯PackageのkeyをZema Workbenchへ渡し、Workbenchがactive claimと現在の審査済みmanifestを確認した後、Package key・manifest hash・概要を見積対象の依頼文に含める。これは依頼仕様の参照情報で、A2A Agent実行能力やPackage installを保証せず、利用者が実行先を別途選ぶ。PC上の追加経路は、`mcp_stdio`・PC対象・Package無料宣言・接続済みowner PC stdio MCP runtime・完全一致するinput/output schemaを満たす場合にだけ手動候補を出し、選択後は既存Connectorのtool固定・内容確認・一回限りのapprovalを使う。MCP serverが宣言するschema自体は実装同一性の証明ではないため、これは明示的なinterface bindingであり、Package source codeのinstallや完全な動作互換保証ではない。remote MCP、有料Package/Tool、未接続runtime、schema欠落/不一致はこの直接実行経路で扱わない。見積同意、支出上限、圏外継続許可、実行承認を既存A2A gateで維持する。成果確認stepは同じ親jobのremote-completed委任、取得成果、Provider署名済みusage receipt、利用者の明示確認を必要とする。local source/fixture検証は実Provider実行・production billing・実SIM利用権付与の証拠ではない。

例（package keyとhashはレビュー済み実registry値で置き換える運用設定）:

```json
{
  "schema": "rockstar-service-offer-profiles/1",
  "profiles": [{
    "issuerId": "carrier-jp",
    "offerId": "lifeline-v1",
    "profileId": "lifeline",
    "version": "1.0.0",
    "label": "Lifeline",
    "packages": [{ "packageKey": "publisher.tool@1.2.3", "manifestSha256": "<64-lowercase-hex>" }]
  }]
}
```

`GET/POST /api/rockstar/entitlements`とowner-authenticated `/api/rockstar/device-home`はprofile stateを返す。device-homeではpayload上限のため最大5件のactive entitlementだけをprofile解決し、各profileは最大4件のpackage名に絞る。購入・claim状態とprofile状態を独立に保持するため、Package catalog不調やreview失効は基本サービス利用権を取り消さない。

- `POST /api/rockstar/entitlements` はサインイン済みownerから署名claim/codeを受け、operator-configured `ROCKSTAR_SERVICE_CLAIM_ISSUERS`の公開鍵だけを信頼する。issuer自己登録はない。
- `lib/rockstar-entitlement-issuer.ts`は、外部KMS/HSM等から渡された非抽出Ed25519 signing keyを受けて、purchase-reference hashに結び付いた高エントロピーclaim codeと署名claim、refund/revocation eventを生成するchannel-neutral issuer helper。extractableな鍵・公開鍵・sign権限のない鍵は拒否し、claim codeは一度だけ返す。SDKは秘密鍵を永続化しない。`replaceRockstarEntitlementClaim`は取消eventと代替claim packageを準備する。続く`replaceRockstarEntitlementClaimWithAcknowledgement`は同じ署名済みpackageを受け取り、event APIがevent IDと`revoked` statusの一致を返すまでは配信callbackを呼ばない。取消submitはevent ID、代替配信はclaim IDを冪等キーとして渡し、販売adapterは同じ署名済みpackageをdurable storeへ保存してtimeout後にも再利用する。
- `lib/rockstar-entitlement-issuer-store.ts`とmigration `0052/0053`は、販売チャネル共通の発行・配信台帳をD1へ追加する。販売元のidempotency keyはhashだけを保存し、同じkey/同じ購入条件の再送は同じ署名claim/codeを復旧し、条件変更は拒否する。AES-GCM claim code暗号文はnonce、request digest、claim digest、key IDに結び付き、平文codeをD1へ書かない。keyringにはcurrent keyとprepared record復旧用のprevious keyを保持できる。delivery timeoutは状態を`prepared`のまま維持して、同じpackageとidempotency keyで再送する。販売元ack確認後はcode ciphertext/nonceを削除し、claim/receiptの監査記録を残す。migration `0054`はissuerごとのrate counterを永続化する。checkoutや外部email/SMS等の販売・購入者配送adapterは未接続。
- `POST/GET/PATCH /api/internal/rockstar/entitlement-deliveries`はseller-neutral server APIを提供する。POSTは16 KiB以内のissuer署名済みclaim/code packageをverifyして暗号化保存し、GETは同じ`Idempotency-Key`の未配信packageを回復し、PATCHはclaimId一致を確認して受領ackしciphertextを消す。seller bearer tokenはissuer単位にhashで登録し、token hashをconstant-time比較する。認証済みsellerごとに3 API method共通で毎分120要求の永続D1 window制限を原子的に適用し、超過は`429`と`Retry-After`を返す。request bodyとHTTP responseはbounded/no-store、sellerのclaim issuer public keyはoperator trust configで別検証する。APIは販売元の購入成功を判断せず、通信会社のactivationや配送providerへ通信もしない。sellerは自ら購入確定を確認してから登録し、delivery providerがその同じclaim packageを受け入れた後にだけPATCH ackを送る。
- Key rotationでは新しい`currentKeyId`で新規packageを暗号化し、未配信行の旧`code_encryption_key_id`に対応する復号keyを残す。旧keyを削除する前に`prepared` rowsが0件であることを運用者が照合する。署名private keyとcode-encryption keyは別鍵・別目的とする。secret値、claimCode、LPA/ICCIDをログへ出さず、production keyringはCloudflare secret/KMS等の別設定・review対象とする。

内部seller APIのoperator設定:

- `ROCKSTAR_ENTITLEMENT_DELIVERY_SELLERS`: JSON array。各rowは`issuerId`と`tokenSha256`のみを持つ。sellerには256-bit以上のrandom bearer tokenを別secret channelで発行し、RockstarにはSHA-256 digestだけを設定する。同じissuer ID/token hashを重複登録しない。
- `ROCKSTAR_SERVICE_CLAIM_ISSUERS`: 既存issuer ID/key ID/public key registry。server APIで受け入れるclaim signature trust root。
- `ROCKSTAR_ENTITLEMENT_DELIVERY_CODE_KEYS`: JSON object `{ "currentKeyId": "...", "keys": { "key-id": "64 hex chars" } }`。current/previous wrapping keysは運用secret storeへ置く。test fixture keyをproductionへ昇格しない。
- sellerはPOST登録後、配信結果不明時に同じbearerと`Idempotency-Key`でGETし、外部配送へ同じpackageと同じdelivery idempotency keyを渡す。provider enqueueを確認した後にだけPATCH ackを行う。最終ユーザーが受信したという意味ではなく、配送providerの受入状態を表す。

### Seller API request contract

各claim/購入権利に一つの再利用可能な`Idempotency-Key`を割り当てる。購入注文番号をclaim複数件で共有しない。seller adapterは外部購入と返品状態を自身の販売台帳で確定し、このAPIは注文金額・決済・回線開通を判定しない。

```http
POST /api/internal/rockstar/entitlement-deliveries
Authorization: Bearer <seller-secret>
Idempotency-Key: <stable-per-claim-key>
Content-Type: application/json

{"claim":{"...":"operator-trusted signed claim"},"claimCode":"rsk_<one-time-secret>"}
```

初回は`201`で`{issuerId,claimId,state:"prepared",replayed:false}`、再送は`200`で同じclaimと状態を返すが、どちらもclaim codeを返さない。配送providerへ渡すpackageを復旧する場合は、同じseller credentialとidempotency keyで`GET`を呼ぶ。外部配送providerが同じpackageを受け入れた後に、`PATCH`へ`{"claimId":"<exact-claim-id>"}`を送る。受領確認後の`GET`は`package:null,state:"delivered"`だけを返し、消去済みcodeを再表示しない。PATCH成功はprovider enqueueの確認であり、最終購入者の受信・閲覧を保証しない。

| HTTP | 意味／seller側の処理 |
|---|---|
| `400` | JSON/claim/idempotency keyが不正。入力を修正し、新しい購入条件なら新しいkeyを使う |
| `401` | seller token不明・不正。secret rotation/revocationを運用確認する |
| `404` | 同じissuer/keyの配信行なし。購入成立を推定せず、販売台帳とissuer操作ログを照合する |
| `409` | key再利用時の条件/claim不一致、または未配信でないrowへのack。自動で別claimを作らず照合する |
| `413` / `415` | 16 KiB request limit超過／JSON以外。内容を縮小して仕様通り再送する |
| `429` | issuerごとの毎分120要求制限。`Retry-After`秒待って同じkeyで再試行する |
| `503` | trust/keyring不備、永続store失敗、暗号package復旧不能。自動新規claim化せず運用者へ照合を依頼する |

- `/connect`はowner-scoped entitlement endpointを読み、issuer keyringが有効な環境でだけ販売元のclaim bundle入力を表示する。サインイン案内、claim登録、再送結果、登録済みscopeを同じ入口へ出す。
- Claim署名はschema/domain separation付きEd25519。未知field、unknown scope、replay、期限切れ、無効/失効鍵、claim-code不一致は拒否する。
- `rockstar_service_entitlements`は購入参照hash・claim code hash・scope・SIM form factor・署名を保管し、個人情報・回線秘密情報を保存しない。D1 unique owner bindingで二重引換を防ぐ。
- `GET /api/rockstar/entitlements` は本人の利用権だけを返し、issuer鍵の詳細は返さずclaim可能かだけ示す。HTTP経路は合成issuer鍵を使うlocal Worker/D1統合試験でowner認証、正常引換、同一owner再送、別owner拒否、改ざん拒否、未redeem取消eventの受付、取消済み旧code拒否、同じpurchase hashの代替claim redemptionまで検証する。
- `ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED=true`の環境ではZemaの新規仕事に`zema`、Sky A2A directory/MCP connectに`sky`、クラウドLLM requestに`rockstaros_access`、新しいAgent delegation/承認/Broker証明登録に`agents` scopeを要求する。Cloudflare Workflowのdispatch直前とprepared-job scannerも権利を再確認し、失効後の未送信jobは外部へ送らず`prepared`として保留する。既存jobの閲覧・cancel・結果回収と、実行済みremote taskの照合は可能な状態を維持する。default未設定はRockstarOS Developer Preview互換であり、本番launch時は販売issuer鍵・entitlement migrations・refund/revocation処理と一緒に明示有効化する。
- 販売issuer向け`POST /api/rockstar/entitlements/events`は署名済みrefund/revocationだけを受け付け、同じissuer/event IDの再送を冪等にする。署名のないeventと異なる内容でのevent ID再利用を拒否する。redeem前でも取消eventをtombstoneとして記録し、遅れて届く元claimを拒否する。redeem後はactive entitlementを`refunded`または`revoked`へ一方向に遷移させる。別claim IDで同じ購入参照hashを再発行すれば、取消済み旧コードを保ったまま引換できる。これはサービス利用権の状態であり、回線activationや請求返金完了とは別である。SDK署名とevent APIはローカルD1 fixtureでのみ確認済み。実販売元の発行/取消event配送・key custody・webhook retry/ack契約は未接続。
- eSIM supplier/APIでの販売は、複数チャネル対応の一つのadapterに限定する。1GLOBAL Connectの公開資料はpartner website/app/marketplace販売や他offerとのbundle、別途Consumer RSP資料は店頭・QR/link・in-app/eID配布も説明する。これは契約前の候補根拠であり、Rockstarの国内販売資格、購入経路、物理SIM配送、利用者への請求、実eSIM発行を受け入れた証拠ではない。[provider/渠道の契約質問](provider-contract-readiness-20260930.md#販売チャネル設計製品要件-2026-10-01)
- migrations `0039_rockstar_service_entitlements.sql` / `0040_rockstar_entitlement_events.sql` とローカルD1 Worker経路でclaim、owner replay拒否、scope gate、署名返金、冪等再送、event ID conflict、失効後のAgent作成/承認/Broker proof登録/Cloud dispatch拒否を統合確認する。migration `0041_a2a_price_quotes.sql`はProvider quoteをdelegationへ保存し、unique partial indexでquote digestの使い回しを拒否する。migration `0042_remote_ai_rate_cards.sql`、`lib/remote-ai-rate-card-store.ts`、`POST/PATCH /api/internal/remote-ai/rate-cards`は署名済み料金表を不変ID付きでD1保存し、冪等登録と失効を扱う。migration `0043_a2a_delegation_fanout_limits.sql`は親jobごとの総委任数8件、同時active数4件をD1 triggerで強制し、現在の一段委任モデルと合わせて再帰・過剰並列を抑える。migration `0044_a2a_live_usage_snapshots.sql`、`POST /api/sky/a2a-delegations/{id}/usage-snapshots`、`lib/a2a-live-usage.ts`はowner/task/price/currencyに束縛したEd25519累積meterを、連番・金額・時刻の単調増加とheld reservation capをD1でも強制して追記保存する。重複eventは同一署名内容なら冪等、改変再送は拒否。最終receiptは最新の暫定meter以上・同一provider/task/pricing versionでなければsettleしない。Workbench/Zemaはactive taskの一覧を10秒ごとに更新し、Provider報告の暫定額を最終確定額と分けて表示する。運営用Bearer secretはrate-card登録・失効に使い、Provider公開鍵のtrust rootだけを`REMOTE_AI_TRUSTED_RATE_KEYS`で保持する。直接remote LLMのtext/legal/patent/Jev経路は、Providerの実料金・実行認可・usage settlement未受入時にfail closedのまま。Worker/D1 API suite 638 assertions、Cloudflare Workflow positive suite 9/9、migration convergence 9/9、live meter signature tests 1/1をローカル検証した。

これは共通claimと取消event、署名料金表registry、AES-GCM保護されたseller issue/delivery stateとその内部HTTP APIのローカル実装であり、issuer/Provider契約と鍵発行・本番secret配備・販売チャネルcheckout連携・実販売元の返品/chargeback webhook接続・本番DB反映・支払い・回線activation・device acceptance・OS installの検証ではない。Migration 0050の本番適用前はread-onlyで`SELECT issuer_id,purchase_reference_sha256,COUNT(*) FROM rockstar_service_entitlements GROUP BY issuer_id,purchase_reference_sha256 HAVING COUNT(*)>1`を実行する。重複があれば移行を止め、権利者の自動削除や統合を行わず、販売元と解決する。現在production D1のreadbackは未実施。seller delivery endpoint、cancel tombstone、cancel-ack前replacement gateとencrypted retry storeはlocal Worker/D1 handler/SQLite fixtureまで実装・検証済みだが、production seller API credentials、seller registry、channel checkout/link delivery、external send/ack semantics、refund webhookは未受入。署名付き合成claim/eventやlocal delivery recordは実購入/production billingの証拠ではない。

## 次の実装順

1. 直接route・background worker・再開経路をroute単位で監査し、必要な`sky`/`agents`/`rockstaros_access` scope gateにbypassがないことを確認する。確認済みのA2A/LLM entitlement gateを維持し、未接続の有料actionがあればproduction enablementより先に塞ぐ。Preview flagの切替条件をrelease gateに固定する。
2. Package handoffはexact reviewed key/hashをZemaの依頼仕様へ含める。限定的なPC runtime bindingも実装済みで、完全一致したSchemaとowner選択後に限り既存local stdio MCP one-time approvalへ接続する。Cloud `rockstar-sky-package-runtime-binding/2`はEd25519署名でAgent Card hash、Package key/manifest hash、operation ID、A2A runtime extension URI、input/output Schema hash、pricing version、必須usage meterを束縛し、信頼鍵を正確なPackage版/hashへpinする。認証済み内部API`POST/PATCH /api/internal/sky-package-runtime-bindings`は署名、運営設定済みextension URI、現行審査Package manifestとSchema hashを照合してimmutable登録・冪等再送・失効する。Package見積でbindingを取得し、delegation/approval/Broker proofへ同一binding digestを固定し、Workerは外部送信前に現在のactive bindingと全条件を再確認する。A2A SendMessageにProvider-declared extension header、message extensionおよび署名bindingを指すinvocation metadataを含めるsourceとclient fixture testを追加した。これはProvider対応待ちのRockstar protocol proposalで、成功executor/結果receiptではない。実Providerがoperationを実行し、schemaを検証し、署名receiptを返す受入は未実施。遠隔/有料実行には依頼前のquote・上限・明示承認、圏外継続許可、実行承認を既存A2A gateで維持する。
3. D1 store/internal seller endpointをchannel checkout adapterへ接続し、secret redaction/rotation/retention、seller token revoke、provider retry/ack、実購買照合をproduction sandboxで検証する。署名issuer contractとkey custody、test keyをproduction issuerとして誤設定できないoperational gate、実販売元のrefund/chargeback webhookを受け入れる。取消eventの確認応答より先にreplacement codeを配信しない。
4. WebとAndroid sourceには共通session、Sky/Zema/Agent入口、Cloud job submit/status/result recoveryがある。Android JDK/SDK CIで一つのsame-job flowをquote→hold→offline continuation consent→explicit approval→disconnect→reconnect→result/receiptまで受け入れ、production Cloud durable executionはshared bindingを別確認する。
5. rate-card単価、依頼別estimate/cap、direct-LLM encrypted durable queue、stream-derived provisional estimate、final Provider response usage、A2A signed live snapshotとreceiptのsource/UIを実装・local fixture検証済み。直接LLMの実行中確定meterはProviderから未報告として表示し、proxy estimateを請求証拠にしない。次はProvider sandboxでsigned usage/invoice reconciliation、stop-at-cap、funded Wallet settlementを受け入れる。Stripe/eSIM/agent請求は各providerの決済記録と照合し、サンプルledgerから本番課金完了を推定しない。
6. exact OS image/device SKUごとに署名、installer、rollback、first boot、Sky/Zema起動を実機acceptanceする。unsupported hardwareはapp/browserへ留める。

### 価格の見せ方と実装境界（2026-10-01）

Cloud A2A Agentのタスク画面では、通貨最小単位をISO 4217の桁数で表示し、単に`minor units`の数値を見せない。`Intl.NumberFormat`が認識しない通貨コードは桁数を推測せず、通貨コードと最小単位を明記する。利用者が設定する最大上限はprovider見積とは別物として表示し、実行承認は価格条件が未接続の間は無効とする。完了後はowner-only task detailから既存のProvider署名済みusage receiptを取得し、Provider・pricing version・meter/quantity/unit/金額・発行時刻を表示する。receiptがない場合に予約上限を実利用額として扱わない。

`lib/currency-format.ts`と`components/workbench.tsx`ではISO通貨の利用額と、rate card単価（100万tokens当たり）を表示する。API fixtureでlegacy input/output料金とtext-token pricingのcache区分を確認する。署名累積meterのlocal callbackとWorkbench暫定費用表示もsource実装済みだが、実Provider live usage接続・契約上の停止保証は未受入。これは表示/UI契約のローカル検証であり、Wallet本番残高/予約/決済、キャリア通信料、production請求は未実装・未受入。quote extensionの契約設計は[`A2A価格見積拡張`](a2a-pricing-extension.md)に分け、provider契約なしでA2A Coreの共通機能だと扱わない。
