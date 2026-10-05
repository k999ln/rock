# Wallet / Billing / Providers

## 目的

自動化の仕事、費用、検証済み収益、Rock利用料、払出しを追記型台帳とreceiptで分離し、Wallet会社・ファンド会社を交換可能なProviderとして接続する。

## 現在地

- 2026-10-01: BIL02の[決済統合設計](../sky-commerce-design.md)と[Wallet詳細設計](../wallet-commerce-design.md)、型/DDL草案と再現用検証を追加。旧月額8.88 USD案は利用者指示で対象外。これは設計の完了範囲であり実Provider受入・runtime実装の完了ではない。

- Sky Marketの商品購入はWeb D1の別経路として実装。`/sky/sell` のStripe Express受取先登録、審査済み `external_contract` Packageの円建て買い切り販売、10% application fee、Checkout、`/sky/purchases` の支払い照合、提供者返金を含む。LLM Packageも同じ条件を使う。
- Web migration `0018_sky_commerce.sql` と四つのserver-only `SKY_*` 決済設定が必要。カード・銀行情報はStripeが保持する。全migrationを使うSQLiteとStripe HTTP mockのcommerce試験37件は成功したが、実資格情報、Stripe sandbox、live money、配備は未実施。
- 購入記録だけでは第三者MCPへのアクセス制御を強制できない。提供者側の認証・利用権失効、および本番Sites gatewayと匿名署名Webhookの到達を共同受入する。
- 本人別の売上、経費、取消、残高、receiptをD1へ保存するWallet APIと画面がある。
- 月最大8.88 USDの旧精算核は回帰検証用の履歴として保持。現行の利用者向け料金案は収益動線が確定するまで保留し、新しいToC収益Receiptは精算Workerで拒否する。
- Rock First-party Settlement Walletのsandbox契約を実装済み。
- Base Mainnet USDCの受取先所有署名、公式contract、exact金額、finalized block照合コードはある。
- Provider署名を検証し、完了済み・非サンプルのTool実行と利用者・Tool・時刻を照合してからEarning ReceiptをWalletへ一度だけ渡すbridgeは、fixture縦断試験まで合格済み。
- owner Walletの本登録、最初の実transfer、払出しProviderの実受入は未完了。

主なtask: `WLT01`〜`WLT06`, `BIL01`, `BIL02`, `B03`。

## Direct cloud LLM usage billing backlog

Direct LLM execution has a local-only implementation path alongside the A2A receipt path: signed rate card → exact-request quote → owner approval digest → shared parent-budget reserve → single-send claim → observed provider usage → itemized priced record. Migration `0046`, `/api/llm/quotes`, `/api/llm/quotes/{id}`, and the quote-bound branch of `/api/llm/text` implement this state path; 9 synthetic SQLite D1 tests pass. This local record is a metering calculation, not a payment, provider invoice, funded balance, or carrier charge.

Workbench now persists a quote against the selected active parent job, checks the request cap against shared remaining budget, presents explicit approval only when the execution gate accepts it, polls saved state after reconnect, displays an opt-in persisted result, and renders itemized calculated usage. Responses streaming now persists a monotonic provisional cost estimate from the quoted input-token upper bound plus visible output UTF-8 bytes / 3; it is labelled approximate and is not provider-reported usage or a settlement input. Final itemized pricing still requires completed Provider response usage. `remoteAiPricingGateAccepted()` remains false, and therefore direct LLM approve/send controls are disabled. Remaining product backlog: accept Provider-supported in-progress usage if available, verify streamed usage and invoice reconciliation, exercise the full Workbench/HTTP/Worker path in a local-listener-capable test environment, and integrate a funded authoritative Wallet before enabling paid use. Do not count local tests/usage as production billing proof.

Sky Market決済の主担当は `JOINT`。`ROCK` は商品・注文・手数料・照合・本人分離・返金停止を実装し、`EXTERNAL` のStripeは決済・受取先本人確認・銀行払出しを担う。`OWNER` は既存の決済実装指示を前提に、実アカウントと資格情報・販売条件を用意する。現段階はローカルmockでの `ROCK_READY` であり `PROVIDER_READY` / `INTEGRATED` / `LIMITED_LIVE` / `PRODUCTION` ではない。

## Cloud agent quote → native Wallet approval status (2026-10-02)

Operator configuration, release gates, monitoring, stop behavior, and recovery steps are documented in the [Sky cloud execution runbook](../sky-cloud-operations-runbook.md). Its production steps remain gated on provider contracts, production D1/key custody, and invoice/funded-Wallet acceptance.

The native Core now stores a paid A2A reservation against the exact user request hash, provider-signed quote digest, per-task cap, enclosing parent-job cap, and a stable delegation ID before remote dispatch. It signs the Cloud-compatible Broker authorization only after re-reading and matching that same reservation in `HELD` state. The Provider's later task ID remains bound to the pre-dispatch delegation identity through the signed receipt. This reuses the current A2A quote verifier, Wallet reservation table/ledger, Cloud proof contract, and recovery model; it does not create a parallel billing system.

The Android owner-facing source path is now wired end to end: the Shell/AIDL lists connected agents, requests and verifies a signed quote after prompt-sharing consent, saves and recovers a non-dispatchable draft, requests a separate device-credential Wallet approval, creates the exact quote-bound hold, signs Broker authorization only from that held row, requires a distinct final Cloud approval, and recovers the same delegation after an uncertain response. The Home UI presents rate/estimate/cap/deadline and separate consents; cancellation and settlement readback have separate operations. This corrects the earlier “path still incomplete” status below and in the 2026-10-02 bridge-audit snapshot. Keep paid Cloud A2A dispatch disabled: source wiring and Node contract checks are not Android compilation/runtime acceptance. Direct Cloud LLM and A2A remain separate execution paths but must share parent spending limits and distinguish reserved cap, provider-reported live usage, and invoice-confirmed amount. Android JUnit/APK/device, real provider prices/usage/invoice, funded Wallet and production charges remain unaccepted.

## Sky Market決済の次の受入

1. [設定・API手順](../sky-billing.md#sky-market決済2026-09-27実装)に従い、Web DB migrationとStripe test資格情報を設定する。
2. Sites本人gatewayの迂回がないこと、`/api/sky/commerce/webhook` がログインなしでStripe raw署名を受け取れることを配備先で検証する。
3. test受取先登録から審査済み商品購入、10%分配、返金・部分返金・紛争、通知重複/順序逆転/不達、別本人拒否、有料MCP側のアクセス失効までStripe sandboxで縦断する。
4. 処理費用、返金・紛争、サポートの運用を確認し、本番設定・配備・実資金・銀行払出しはそれぞれの証拠を残す。結果不明の再送は20時間の上限を越えて自動継続しない。

## 旧収益精算・Walletの次に進める順番

1. 収益動線、料金の対象・計算・上限・回収方法・同意を確定し、新しい料金契約を設計する。
2. 最初の販売・決済Providerを一つ選び、sandbox署名を現在のbridgeへ接続する。
3. Provider sandbox条件で入金、返金、順序逆転、重複、結果不明を縦断する。
4. 販売、決済、払出しProviderの責任、KYC、税、chargeback、最低払出額を確定する。
5. 最初の本人確認済み実transferをexact receiptへ結び、照合証拠を残す。
6. LIVE有効化は秘密鍵非保管と本人最終確認を維持して別gateで行う。

## 完了条件

- execution成功、成果物完成、入金確定、払出し完了を別状態で保存する。
- 同じreceipt、provider reference、実行IDを二重計上しない。
- 秘密鍵、seed phrase、包括送金権限をRockstarOSが保持しない。
- 0売上時の請求、債務化、翌月繰越を行わない。

## 関連資料

- [Wallet front](../wallet-front-design.md)
- [Sky billing](../sky-billing.md)
- [Provider boundary](../external-wallet-fund-provider-boundary-20260913.md)
- [First-party settlement](../rock-first-party-settlement-wallet-20260913.md)
- [Production rail](../rock-wallet-production-rail-20260913.md)

## 検証

- `node --experimental-strip-types --test tests/sky-commerce.test.mjs tests/sky-stripe.test.mjs`
- `npm run schema:check`、`npm run typecheck`、`npm run lint:product`
- `npm run billing:check`
- `node --experimental-strip-types --test tests/earning-bridge.test.mjs tests/billing-worker.test.mjs tests/settlement.test.mjs tests/wallet-backend.test.mjs tests/financial-provider.test.mjs tests/rock-wallet.test.mjs`

## SIM/eSIM購入からRockstarOSサービス利用への接続

製品形態は物理SIMまたはeSIMの購入にRockstarOS/Sky/Zema/Agentのservice accessを含める。eSIM Goの現行実装は通信profile order用の一つのprovider adapterであり、製品をeSIM専用に限定しない。物理SIM fulfillment、複数販売チャネルの購入claim、carrier activation、Rockstar accountへの一度限りの利用権bindは別の未受入integrationである。OS binaryはSIMに保存せず、対応端末へOSまたは既存OS上clientを導入する。

### 初期Agent Packの注文固定

各`ESIMGO_PLAN_CATALOG_JSON` planは`starterAgentPack`を必須にする。`id`、semverの`version`、1〜12件のSky Package `packageKey`と`manifestSha256`を指定する。これらの値は価格・通信bundleと同じcanonical pricing snapshotへ入り、発行後の再試行やread-only reconciliationで後から別Toolへ差し替わらない。初回provider発行要求の直前に、各PackageをSky Registryからexact key/hashで再読込し、`status=verified`かつreview期限内でmanifest再計算hash一致の場合だけ進む。不一致・未審査・失効・取り消しはProvider送信より前に拒否する。 注文状態APIは同じ固定参照からPackage名・要約を表示用に解決するが、現在の審査済みRegistryでkey/hashが一致した場合だけ「審査有効」とし、それ以外は「利用不可」とする。これは端末インストール・実行権限・利用権付与を意味しない。

この照合は初期構成の候補を注文へ固定する処理であり、Packageを端末へ導入したり実行権限を付与する処理ではない。Lifeline/Developerのproduction pack catalog、端末署名付き導入証跡、Sky entitlementの有効化、本人ごとの権限承認は別の受入gateとして維持する。実在する審査済みPackageを確認できない間はserver plan catalogを未設定のままにし、fixture名を販売表示へ流用しない。

### 端末ゲートウェイから利用権を有効化

導入issuer receiptの検証後に限り、認証済み注文Ownerが`POST /api/esim/orders/{orderId}/device-entitlement`でchallengeを作成する。challengeは既存の署名済みinstall receipt、同じowner/device/order/profile digest、および現在審査中のstarter pack全体（ID/version/構成hash）へ5分間束縛し、nonceそのものはD1へ保存しない。Android client向け応答には署名に必要な全結合値を`receiptContext`として返す。端末ゲートウェイのEd25519またはES256 receiptが同じ値と`installed_enabled`を返した場合、D1 transactionで一回だけ利用権を有効化する。Status APIは実際の署名鍵が現在もactiveで、paid・未返金注文、install proof、現行package review/hashがすべて一致する間だけ`esimDeviceEntitlementState=active`と`starterPackActivationState=active_on_authenticated_device`を返す。鍵失効・返金・package変更・order/profile/device不一致時は有効扱いしない。

端末公開鍵は運営の`ESIM_DEVICE_GATEWAY_KEYS` trust inventoryだけから解決し、端末自身の任意登録で信頼化しない。device receiptはprofile secretを含まない。ホスト側Ed25519/ES256試験とlocal Worker/D1統合はfixtureであり、実OEM/secure element key enrollment、Android Binder接続、Sky Tool実行grantではない。ES256はAndroid hardware-backed P-256鍵に合わせた署名方式対応で、attestation検証や実機接続を意味しない。

Android Brokerには`EsimDeviceGatewayKeyStore`を追加した。OEM enrollment challengeをAndroidKeyStoreのP-256 key generationへ渡し、TEE/StrongBox security levelを照合し、DER署名をCore receipt contractへ提供する。StrongBoxを要求するSKUには`requireStrongBox=true`を使えるが、一般のhardware-backed TEE鍵も区別して扱う。attestation certificate chainの取得、公開点の抽出、alias退役も実装した。server/OEM側がattestation chainを検証し、公開鍵を運営trust inventoryへ登録する処理はまだない。ローカル退役はサーバー失効の代替にならず、サーバーtrust inventoryが利用権状態の最終権威である。

instrumentation testはPixel等のAndroid実機でhardware level、attestation chain、receipt署名、退役拒否を受け入れる契約として追加したが、Android SDK platform/build-toolsが未導入のためAndroid APK/AIDL/instrumentationは未コンパイル・未実行である。現テスト内の`InstalledProfileEvidence`は合成fixtureであり、端末の実active eSIM状態を証明しない。key attestationは端末内の`KeyInfo`判定で終わらせず、信頼できる別サーバーでcertificate chain、動的root、CRL、attestation challenge、app identity、security levelを検証する。公式候補はApache-2.0の[Android Key Attestation Verifier](https://github.com/android/keyattestation)。2026-10-01にupstream commit `55c35040a1b5b72e6d63bfb150c5c68a175c1462`を読取り確認したところ、upstreamはv0.1をtest releaseと説明し、Gradleの既定は`0.1-SNAPSHOT`、Java 21 toolchainを要求する。現時点の手元JVMは17でAndroid SDKもないため、安定した公開依存とみなしてAndroid appやCloudflare Workerへ直結せず、server-side JVM verifierとしてpin・build・更新/CRL運用を整える。固定コミットと確認範囲は[attestation verifier evidence](../evidence/android-esim-gateway-contract-20261001.json)に記録した。[Android公式検証要件](https://developer.android.com/privacy-and-security/security-key-attestation)。契約前にOEM/carrierから、鍵発行とrotation/revocation authority、hardware-backed key attestation trust roots/CRL、OS/Broker build binding、eUICC/controller receiptの真正性、端末交換時の移行手順を受け入れる必要がある。現行Android通常アプリはactive profileを読まないため、これらが成立するまでは実機で利用権を有効化できない。

**自動eSIM導入の対応tier:** 一般BYODのSky/AndroidアプリはLPAへ導入画面を渡し、追加のOS確認が出たときは本人の操作を待つ。アプリがeSIM installを行ったと扱わず、install proofが来るまで利用権を有効化しない。Android 15（API 35）以降のmanaged-subscription APIはDevice Owner／Profile Ownerなど管理端末向けで、`switchAfterDownload=true`による自動enableはorganization-owned deviceの管理者に限られる。自動導入を製品要件に含めるSKUは、所有者enrollment、Device/Profile Owner設定、LPA/carrier権限、port競合とOS confirmation、完了・取消callback、OEM/carrier署名install proofを一件通してから`managed_esim`対応に登録する。Pixel 10 GL066でこの経路が実装または受入済みとはしない。[Android EuiccManager](https://developer.android.com/reference/android/telephony/euicc/EuiccManager) · [AOSP eSIM architecture](https://source.android.com/docs/core/connect/esim-overview)

### 購入前プランカタログAPI（契約前）

利用者はSkyで導入前にプラン条件を読める。公開GET `/api/esim/catalog` は運営が別設定する`ESIM_PUBLIC_CATALOG_JSON`を、server-owned `ESIMGO_PLAN_CATALOG_JSON`内の同一`packageKey`とmanifest hashへ照合して返す。入力には表示名・説明・coverage国コード・roaming国コード・容量（MBまたはunlimited）・有効日数・利用開始条件・導入前提だけを含める。空の公開設定は空配列と`catalog_not_configured`を返す。provider価格catalogまたは公開条件の不正は503でfail closed。 各公開プランにはserver-owned initial pack ID/versionとPackage参照も付け、購入前に名称・要約を比較できる。名称・要約は現在レビュー済みRegistry内でpackageKeyとmanifest SHA-256を照合・再計算できた場合だけ返し、未登録、失効、改変時は`unavailable`とする。Packageキー/hash、provider bundleと卸価格は顧客応答に含めない。

`/sky/esim`は上記catalogを表示し、未設定と契約待ちを区別する。顧客条件が設定されても、価格を創作せず購入ボタンを無効のままにする。供給元と販売主体・通信料請求モデルの比較では、eSIM Go Travel APIは一時旅行向けとしてだけ候補に残し、60日超の同一国内利用・IoT用には使わない。初期lifeline向けには、国内の長期利用、地域/SKU、販売権、請求者・サポート責任をsandbox前に契約で確認できるproviderを選ぶ。販売主体が確定するまではcheckoutを作らない。

契約・実価格・売買条件の根拠が揃っていない現在は、返却に常に`purchaseEnabled:false`と`commerceState:contract_pending`を付ける。購入・checkout routeはこのAPIから呼び出さず、ユーザー入力で発行catalogを選ばせない。内部packageKey/hash、provider bundle名・通貨・卸上限、販売価格や為替・reserve・marginはprojectionから除去する。公開カタログはGETごとにproviderをpollせず、運営の静的設定だけを使う。保持データは設定済み公開条件のみで、request body・subscriber識別子・端末profile・eSIM秘密情報を受け付けない。

変更時の復旧は設定を直して再デプロイするだけで、購入権・注文・profile状態は変更しない。要件条件は「未設定は空で成功」「不正な公開条件は503」「発行catalogにないplanを表示しない」「顧客投影から卸情報を漏らさない」「購入不可がtrueへ昇格しない」。今回のhost fixtureはprojection・malformed input・未知package・秘密情報除去を検査する。未決定は契約先、実提供国/提携網、容量・有効期限のProvider根拠、Retail価格、税・返金・サポート、決済手段、販売主体。これらの合意・実証後にのみ別の購入契約とcheckout gateを設計する。

既存BIL02の[Bootstrap host fixture](../../toolkits/esim-bootstrap/README.md)とCallback V3/owner-order bindingに加え、eSIM Go REST API v2.5 clientを追加。validate→currency/wholesale cap→one-shot durable dispatch marker→transaction→provider order reference/profile digest記録→paid Sky order bindingを接続し、provider_completed状態は`GET /esims/assignments?reference=`で取引を再送せず再開する。wholesale上限超過時はclaim作成・transactionとも行わず、DBに平文install secretを保存しないことをfixtureで検証。`POST /api/esim/orders/{orderId}/issue`は認証済みowner・paid/live Sky order・manifest hash・server-owned plan catalogの一致を要求する。catalogでbundle、retail amount/currency、provider currency、wholesale capを選び、顧客入力から変更できない。catalog version・provider→retail minor-unit換算比・fee reserve・最低gross margin・bundle・販売額をcanonical JSON snapshotとSHA-256で注文レコードに固定し、provider quoteにも卸値capと同じ利益下限を再適用する。通貨差の試算はoperator設定を検査するだけで、実FX・provider invoice・payment feeの根拠ではない。Provider debit gateはdefault-offで、secret間の値重複も拒否する。`POST /api/esim/orders/{orderId}/install-material`は同じownerのpaid orderだけに、AES-GCMで暗号化されたICCID/Matching ID/SM-DP+をdelivery request key単位で再取得可能に返し、本人ack時に暗号文を削除する。APIはno-store/no-cache。primaryOwnerはROCK、外部依存は契約済み通信会社API、本人認証gateway、端末受信部。raw-body署名検証、ICCID専用HMAC、owner/order照合は実装済みで、通知は利用権・注文・service stateを変更しない。transaction timeout/503/不正応答は`reconciliation_required`に止め、provider APIにclient idempotencyを確認できないため再送しない。provider `orderReference`が失われた場合は現在のeSIM Go adapterでは安全に自動復旧できない。request応答消失を一意に回復するprovider idempotencyまたは永続client referenceは契約必須で、sandbox acceptanceで確認されるまでprovider debitは有効にしない。known referenceでのprovider completed後にローカル保存で失敗した場合は、assignment GETで再開して同一Profileをbindingする。migration 0032、same-key再取得、別key拒否、tamper拒否、ack消去fixtureを追加。eSIM固有fixture 17件、Webhook/provider/order/adapter 7件、catalog/snapshot 3件、install-material 2件成功。未受入はpricing assumptions/fee reserveを契約・実明細で確定すること、API credential・sandbox・production D1/secrets/cron再起動、response-loss idempotency acceptance、実端末での受入。currentStageはhost + local D1/API contract fixtureの部分的ROCK_READY。BIL02全体はin_progressを維持する。

2026-09-30: 所有者認証付き`GET /api/esim/orders/{orderId}/status`を追加し、Sky注文のpaid/refund状態、provider order state、profile binding、install-materialの未取得／acknowledgementだけを返す。認証済み`POST /api/esim/orders/{orderId}/reconcile`は確定済みprovider referenceへのGETとassignment GETだけを行い、status・bundle・price・currency・profile digestを一致照合してbindingを再開する。provider transactionは発行せず、`reconciliation_required`でreferenceが不明な取引は自動解決しない。既存注文は発行時の署名済みpricing snapshotを参照し、現在のcatalogが変わっても販売条件を入れ替えない。共有Sky Runtimeの1分cronから同じread-only reconcilerを最大10件ずつ呼び、API key・profile-hash key・install-material keyの別管理設定がなければ何もしない。local D1 fixtureは既知referenceのprofile binding、一巡後の重複pollなし、reference不明注文の除外に加え、WebhookのICCID HMAC digestから既存paid orderへの一回限りの相関と、未一致callbackを未bindのまま残すことを確認。worker test 2/2、typecheck、lint、runtime dry-runは成功。Cloudflare本番D1/secret/cron、再起動受入、provider sandbox、実端末は未完了。

2026-10-01 retest: `node --test tests/esim-bootstrap.test.mjs tests/esim-plan-catalog.test.mjs tests/esimgo-webhook.test.mjs tests/esim-install-material.test.mjs tests/esim-reconciliation-worker.test.mjs` passed 33/33. These are host/local-D1 fixtures only; they do not accept a live eSIM, provider sandbox, device install, or billing. The standalone bootstrap suite remains separately reported as 15/15.

2026-10-01 status/install API integration: `scripts/check-work-api.mjs` checks through the built Worker and local D1 that a catalog-matched paid eSIM order reports `paid_waiting_for_esim_issuance`, an unrelated paid Sky tool order reports `not_esim_order`, and another owner cannot read the order state or install material. The owner can receive encrypted profile plus allowed direct-install links with the one-time delivery key, then acknowledge and erase the ciphertext. This guards the shared Sky commerce namespace and owner-scoped enrollment material. `npm run build`, `npm run typecheck`, and `npm run test:api` passed; API integration suite reports 289 assertions. Synthetic local fixtures only; no provider sandbox, real eSIM, device install, or billing.

2026-10-01 eSIM direct-install preparation: eSIM Go's documented `additionalFields=installUrl` assignment lookup is requested after provider completion and during read-only recovery. Apple/Android links are accepted only on the provider-documented OS setup hosts and path with an LPA carddata parameter; the link and profile credentials stay inside owner/order AES-GCM storage and leave only via the existing authenticated one-shot delivery API. The Sky purchase history now has an owner-clicked status check, explicit retrieval of install material, Apple/Android deep-link buttons, manual SM-DP+/activation-code fallback, and explicit server erasure acknowledgement. Link host/path/LPA data is checked again in the client and `no-referrer` is set. The UI does not call the provider issuance endpoint, so checkout alone cannot trigger a carrier debit. The delivery key survives same-tab retry via session storage. Source-level UX guard and API crypto tests pass; typecheck, lint, and production build pass. No signed-in browser acceptance, real provider, actual device installation, QR generation, or device compatibility determination has been accepted; the UI asks users to check device and plan support.

## A2A cloud usage receipt（2026-09-30）

異なるAgent providerに委任したcloud作業について、A2A taskの自己申告を請求根拠にしないProvider署名付き最終usage receiptの契約・Ed25519検証・親job予算pool精算を実装した。receiptは完了／失敗／取消などterminal taskのowner・親job・remote task・Agent版・currency・予約capに束縛し、署名済みmeter明細合計が一致しcap以下の場合だけ、一回限りで内部reservationをsettledへ移す。provider/reference重複、署名不正、task不一致、上限超過を拒否し、未提出receiptの予約は保持する。trust inventoryはRuntime Workerの`A2A_TRUSTED_USAGE_KEYS`運営設定であり、provider実証明書・鍵運用は未受入。

この処理はA2A parent budget poolの内部精算であり、利用者Wallet残高の資金拘束や実cloud費用の回収とは別である。2026-10-01にAndroid-independent `PlatformStore`へnative A2A Wallet reservation lifecycleを追加した。ownerの一回承認により既存台帳の資金から上限を確保し、残高を他の承認済み支出から保護する。dispatch前だけ取消解放し、dispatch後の結果不明・復旧後は上限全額を保持する。Provider署名usage receiptを同じowner/job/task/agent/通貨/価格版/capへ再束縛して検証した後、一回だけappend-only debitを記録し、未使用分を返す。recoverable backupは稼働中holdを`RECOVERY_REQUIRED`にし、再dispatchや先行解放を拒否する。

2026-10-02 Android trust configuration boundary: `RockApplication` now always constructs `PlatformStore` with `A2AUsageReceiptVerifier`, populated only by the operator-supplied Gradle property `a2aProviderUsageKeysJson`. The property defaults to the empty JSON array, so an unconfigured build cannot treat a received receipt as trusted. Each exact row binds `providerId`, `keyId`, `agentOrigin`, canonical base64 32-byte Ed25519 public key, and `revoked`; missing/extra fields, malformed keys, duplicate tuples, and oversized inventories are rejected. Invalid optional configuration disables only Provider receipt application, not unrelated OS startup. Device enrollment keys are not Provider receipt keys and cannot add themselves to this inventory. Example build input (replace with Provider-contract-confirmed public keys; never commit operational key material or test fixtures): `-Pa2aProviderUsageKeysJson='[{"providerId":"provider-x","keyId":"usage-2026-01","agentOrigin":"https://agent.example","publicKeyBase64":"<32-byte-key-base64>","revoked":false}]'`. The public key is not a secret, but its provenance and rotation/revocation are security-critical. This source wiring is not compiled in the current checkout and includes no real Provider keys; absent configuration and untrusted receipts remain fail-closed.

2026-10-02 Android pre-approval quote verification: `A2AUsageReceiptVerifier` now also validates the provider's Ed25519-signed `rock-a2a-provider-price-quote/1` before a device can show paid approval. It binds the exact requested agent/origin/version, request digest, currency, estimate, authorized maximum, expiry, itemized usage arithmetic, and operator-trusted provider/key/origin tuple; the return value is the canonical signed-terms SHA-256 intended for a later Wallet-hold binding. Android Core and the Cloud TypeScript verifier share `android/core/src/test/resources/a2a-price-quote-v1.json`; Node interop tests pass 5/5 and check an identical signing digest. This advances quote verification only: no flow yet persists that digest in a native hold or prevents Shell dispatch until that hold exists. The test key is RFC public test material, Android/JVM compilation is unavailable in this checkout, and no provider key, production rate, payment, or invoice was accepted. [Local evidence](../evidence/android-a2a-price-quote-verifier-20261002.json)

Historical 2026-10-02 native reservation bridge audit: at that inspection point, the Core had `PlatformStore.reserveA2ABudget`, but the Shell reservation/proof operations and stable pre-dispatch identity were still open. The subsequent source implementation uses the stable Cloud delegation UUID as the pre-dispatch task/correlation ID, binds the signed Provider receipt to the later remote task ID, and checks the exact held reservation before signing. Do not use that earlier snapshot as current status. Keep the Cloud PATCH proof check and the execution feature flag fail-closed. [Historical source audit](../evidence/android-a2a-reservation-bridge-audit-20261002.json)

2026-10-02 native quote-bound reservation Core slice: `Hold` now carries request SHA-256, exact provider quote SHA-256 and parent-job cap. For paid holds, `a2aBudgetPayloadDigest` uses reservation v2; its digest is stored in the already durable `approval_digest`, so no schema or backup migration is needed. The task correlation stored before send is the stable Cloud delegation ID. At settlement the Provider's signed receipt must still bind that exact delegation and supplies the post-dispatch remote task ID. `PlatformStore.authorizeHeldA2ADelegation` creates the Cloud-compatible Broker authorization only if the owner reservation is still `HELD` and its original approval digest matches the exact prompt/quote/agent/currency/caps/deadline. A shared RFC test-key Broker proof is accepted by the Cloud TypeScript verifier; Node contract tests pass. Java/JUnit source for the matching signature, reserve and settlement path has been added but cannot be executed here (no Java runtime/Gradle). Shell AIDL/Android call path, proof HTTPS submission, Cloud approval roundtrip and device acceptance remain open; execution stays disabled. [Local evidence](../evidence/android-a2a-native-reservation-core-20261002.json)

At the time of the 2026-10-01 evidence snapshot, Android Broker/Shell handoff transport and UI wiring were not connected. That statement is historical and has been superseded by the later Shell API v18 source flow described above. The existing Core JVM and local settlement results use synthetic provider credit and RFC test keys; they do not prove real funding, customer Wallet balances, external settlement, billing, or Provider rate/receipt terms. Android SDK/APK/AIDL/Binder/instrumentation/device acceptance is still unverified, so production paid execution remains disabled pending Wallet/provider contracts, attestation/key lifecycle, and supported-device acceptance. [Historical local evidence](../evidence/android-a2a-wallet-reservation-20261001.json)

### 2026-10-02 current Android source audit correction

`IShellApi` v18 and `RockShellService` expose the owner-authenticated quote, draft, recovery, Wallet approval/hold, Broker proof, final Cloud approval, cancellation, and settlement-sync calls. `MainActivity` exposes the review and consent sequence, including rate/estimate, task and parent caps, expiry, prompt-sharing consent, offline-continuation consent, and same-delegation recovery. `tests/sim-service-entry.test.mjs` asserts the source ordering and fail-closed boundaries; the shared Node quote/authorization vectors verify cross-language digests. The current audit is recorded in [Android A2A reservation bridge source audit](../evidence/android-a2a-reservation-bridge-audit-20261002.json).

The source audit is not an Android runtime result. Java/Gradle/Android SDK are unavailable in this checkout, so Core JUnit, AIDL generation, APK build, Binder/instrumentation, device credentials, restart/offline/reconnect, and physical-device UI remain unrun. Production Cloud dispatch, live Provider rates/meters/invoices, funded Wallet settlement, carrier activation, and exact-SKU RockstarOS installation remain unaccepted. Local usage rows and fixtures are not proof of production billing.

## A2A向けRockstarOS Wallet hold（2026-10-01）

`ValueSpendRuntime`にowner・親job・delegation・承認digest・deadlineへ結び付くsynthetic USD予約を追加。既存の`AVAILABLE → SPEND_HOLD → SPEND_COMMITTED/AVAILABLE`のappend-only ledgerを再利用する。Hub/MCP command、exact payload idempotency、pre-dispatchだけのrelease、dispatch後のindeterminate hold、verifier無しでのsettlement拒否を追加し、Hub HTTP経由を含むPython tests 25件が成功。詳細は[Value/Spend Runtime](../value-spend-runtime.md)。

これは**端末内合成Walletの予約**であり、A2A D1の子budget reservationと同じ資金ではない。`ValueSpendRuntime.authorize_a2a_proof` callableをBrokerへ注入でき、owner/device・delegation ID・親job・通貨・cap・approval digest・Unix millisecond deadlineを同一SQLite transactionで照合する。proofが有効な間は予約をreleaseできず、同じcontrol key以外の再認可を拒否する。runtime 17件、Hub HTTP 9件、Broker core 33件、A2A Node/Python protocol suite 34件が成功し、そのうちBroker suiteは実Wallet callableを注入したcross-module fixtureを含む。Cloudflare local Workflow/D1は署名・形状が正しい期限切れproof、失効鍵proof、proofなしを各々送信前に拒否し、Agent discovery／remote send claim 0件を確認した。fixtureに署名field外の親予算値が混ざり、期限／失効検査に届いていなかったtest defectも修正した。一方、device Gatewayのproduction process wiring、実Providerを使うCloudflare positive Workflow、実残高、実Provider請求は未受入。usage verifierもHubには未設定でfixture注入時だけsettlement動作を試す。これらが接続するまでは本番dispatchと実請求を無効に保つ。

## Cloud利用receiptから端末Walletへの署名済みhandoff fixture（2026-10-01）

Cloud Workerとnative runtimeでusage receiptのcamelCase金額fieldが異なる問題を直し、両言語が同じcanonical signing bytes／Ed25519 signatureを検証する共通fixtureを追加。開発用localhost Hubは`ROCKSTAR_A2A_TRUSTED_USAGE_KEYS`でtrust keyを明示した場合に限りreceipt verifierを注入する。Hub HTTP結合テストで、synthetic WalletにUSD 20.00相当をholdし、fixture署名のUSD 6.50利用receiptをsettle、未使用USD 13.50を戻す一連の処理を確認した。Python receipt tests 3/3、Hub API tests 10/10、Wallet spend runtime tests 17/17が成功。RFC公開test keyとsimulation-only Walletの試験であり、production鍵／実残高／cloud D1からの端末へのreceipt配信・同期／Provider sandbox acceptanceではない。本番egressと実請求は無効のまま。

2026-10-01 harness investigation: do not weaken the public HTTPS origin allowlist to reach a local HTTP A2A mock. Cloudflare documents a Miniflare `fetchMock` integration for controlled outbound responses, but the currently installed `miniflare@5.20260811.0-alpha` package does not export `createFetchMock`; Miniflare's D1 API probe also remained pending after `ready`. A local Wrangler service-binding mock appeared connected but its subrequest hung inside the Workflow runtime, so that experimental path was removed. The `wrangler dev` local Workflow/D1 rejection suite still passes all three no-proof/expired/revoked cases, with zero remote send claims. A separate attempt to execute the Wrangler-built Worker directly through the current Miniflare V4 API failed during Workerd startup with an internal runtime error even before dispatch; that temporary harness is not retained as a passing test. The host A2A protocol suite (including independent Node and Python HTTP agents) passes 46/46 when localhost is permitted; eSIM fixtures pass 33/33. At this point the positive Cloudflare Workflow path was still unverified. The follow-up sections below supersede that checkpoint and record the successful Workers Vitest positive/restart fixtures. Keep the production HTTPS-only allowlist intact.

## Cloudflare positive A2A Workflow fixture（2026-10-01）

上記の「positive path未検証」は、同日後続の再試験で解消した。Cloudflare公式Workers Vitest plugin（Vitest 4.1.0、`@cloudflare/vitest-plugin` 1.3.4、同梱Wrangler 4.145.0 / Miniflare 5.20260930.0-alpha）を使い、実際の`wrangler.jsonc` WorkerとWorkflow、local D1 migrations 0019–0026を起動するfixtureを追加。テスト専用のservice bindingだけを承認済みHTTPS fixture agentへ接続し、Agent Card取得と`SendMessage`を各1回に制限する。

`npm run sky:a2a:workflow:positive`成功。署名済みBroker proof検証、同意済み入力の復号、Agent Cardの名前・版照合、one-shot remote send claim、完了task receipt、イベント列、owner/delegation/taskに束縛した暗号化成果物の保存と復号まで確認した。運用HTTPS allowlistの緩和や外部接続はない。WorkerdではFetch `redirect: "error"`が実装されずrequest前に例外となる実行互換性欠陥も見つけ、`redirect: "manual"`へ変更した。3xx応答は2xx限定の既存判定で拒否し、転送先へ追従しない。A2A protocol/store/security tests 46/46、eSIM fixture 33/33、typecheck、product lint成功。別途Wrangler local Workflow/D1のproofなし・期限切れ・失効鍵拒否3/3、remote send claim 0を再確認。

この成功は**ローカルfixtureのpositive Workflow受入**であり、Cloudflare本番永続化・controller/worker再起動後のresume・実Provider相互運用・Provider署名鍵運用・実残高Wallet debit/照合・実請求・native Broker Gateway・端末圏外継続を証明しない。次はWorkflow再起動/reconciliationをlocal runtimeで受け入れ、契約後のProvider sandbox手順とWallet/device gateway接続を準備する。BIL02/SKY07はin_progress。

2026-10-01 follow-up: Extended the positive Workers Vitest case with Cloudflare `WorkflowInstance.restart()` after a completed task. The restarted instance observes the terminal D1 row, returns `not_dispatchable`, and the persisted `remote_send_claimed` count remains 1; the mock also rejects repeated Card/send calls. Vitest passes 1/1. This is an instance restart after terminal completion, not a process-loss test or an in-flight/indeterminate reconciliation test; those remain next. The explicit restart emits a Workerd engine-abort diagnostic while the runtime interrupts its current execution, but the asserted restarted Workflow completes and no duplicate external request occurs.

2026-10-01 ambiguous-send extension: The second Cloudflare Vitest case now simulates the controlled agent recording the approved `SendMessage` and returning HTTP 503. D1 becomes `indeterminate`; a 25-minor-unit child reservation remains `held` and unsettled. Restarting that errored Workflow returns `not_dispatchable`, leaves the remote-send claim at exactly one, and the test service rejects any duplicate message ID. Both local positive and ambiguous-restart cases pass (2/2). This demonstrates no automatic replay and budget retention for a possibly accepted task. It does not resolve a provider task ID after an actual lost response, simulate Workerd process loss, or prove a contracted provider's `GetTask`; those remain unaccepted.

2026-10-01 repository verification: `npm run verify` passed end to end with loopback enabled for local-only Miniflare/HTTP fixtures: 520/520 Node tests, 64 release-signing tests, production web build, bundle and asset closure checks, and 265 Work API assertions. Release readiness still reports 0/6 public targets ready; this is repository validation, not provider, production, device, contract or commercial acceptance.

2026-10-02 correction to the Wrangler/Workerd process-restart evidence: `npm run sky:a2a:workflow:test` now verifies only that three prepared rows persist across two local Workerd process boots and that no remote-send claim exists. The harness did not establish that the scheduled scanner resumed those rows or rejected their proofs; a previous note overstated what the process test proved. Dispatch and proof rejection are covered by the separate Worker Vitest fixture (`npm run sky:a2a:workflow:positive`, 13/13), which is a controlled local Worker/D1 test, not process-level cron recovery. Production scheduler, Cloudflare durability, Provider execution, billing, and device acceptance remain open.

2026-10-01 A2A 1.0 JSON-RPC conformance correction: official A2A 1.0 specifies PascalCase JSON-RPC methods. The client and independent Node/Python fixtures now use `SendMessage`, `GetTask`, and `CancelTask`; previously the client advertised protocol 1.0 but emitted legacy lower-case method names. A2A client interoperability tests pass 10/10, Cloudflare Workflow tests pass 2/2, `npm run sky:agent-runtime:check` bundles the corrected runtime, and full `npm run verify` passes. The protocol allows messageId deduplication but does not require it, and the provider generates new task IDs, so lost-response lookup still needs a contracted provider request-reference API or demonstrated messageId recovery behavior. See [provider contract readiness](../provider-contract-readiness-20260930.md) and [workflow evidence](../evidence/sky-a2a-workflow-local-20260930.json).

2026-10-01 Cloud-to-device Wallet settlement seam: added `GET /api/sky/a2a-delegations/{id}/wallet-settlement`. The owner-only endpoint refuses nonterminal jobs, missing/unsettled Cloud reservations, or receipts that fail a fresh signature and intent check; an accepted response carries the exact terminal Provider receipt, reservation binding, receipt hash and deterministic native `a2a.budget.settle` idempotency key. The existing native `ValueSpendRuntime.settle_a2a_budget` independently verifies the Provider receipt and settles/release portions of its local hold. `npm run typecheck`, `npm run build` and `npm run test:api` pass (404 Worker/D1 assertions). The local API fixture confirms 401/404 owner isolation, 409 before settlement and identical command/key on repeated reads. This closes the server handoff contract only: Android/native Gateway wiring, native Wallet balance reconciliation with production funds, Provider sandbox and production key custody remain unaccepted; billing stays disabled.

2026-10-01 cross-runtime acceptance extends that fixture: `scripts/check-work-api.mjs` passes the actual API handoff JSON and its ephemeral Ed25519 trust key to an isolated Python RockstarOS Wallet, where the same command reserves, verifies, settles 37 synthetic minor units, releases 213, and remains idempotent on replay. The full Worker/D1 API test passes 410 assertions; evidence is `docs/evidence/a2a-cloud-python-wallet-handoff-20261001.json`. Android does not yet fetch/apply the handoff, and the Python fixture balance is not a real or funded device wallet. Cloud D1 and device Wallet therefore remain separate ledgers; production spending remains disabled.

## Android Core cross-runtime receipt verifier (2026-10-01)

Added `A2AUsageReceiptVerifier` to Android-independent Core. It verifies the exact provider/key/agent-origin trust tuple, Ed25519 signature bytes shared with the Cloudflare TypeScript and RockstarOS Python implementations, and binds owner, parent job, delegation, remote task, agent name/version, price version, currency, cap, issuance time, and usage-line total to the expected hold context. The existing shared fixed signature vector passes in Java; altered owner/task/amount/time, unknown/revoked keys, malformed keys and over-cap receipts are rejected. Android Core compiles and passes 62/62 JVM tests with the cached Temurin/Gradle toolchain. [Evidence](../evidence/android-a2a-usage-verifier-20261001.json).

This is a reusable verifier only. It is not wired into an Android Broker/Gateway or persistent Android Wallet reservation; no Android APK/AIDL build or device test ran. Python simulation Wallet and Cloud D1 remain separate ledgers. A production key inventory, actual funded-balance hold/settlement, Android handoff fetch/apply, Provider sandbox and invoices remain unaccepted; production billing stays disabled.

## Cloud Agent価格見積と支出明細（2026-10-01）

Workbenchでbudget minor unitsを通貨別に表示し、Provider signed final usage receiptをtask詳細から取得してmeter/数量/価格版/行金額を提示する。2026-10-01に署名累積meter snapshot contract `rock-a2a-provider-live-usage/1`、public signed callback、D1 immutable sequence log、連番・金額単調増加・task/price version binding・reservation cap enforcement・final receipt reconciliationを追加した。Workbenchはactive taskがある間10秒ごとに同期し、Provider報告暫定額を最終確定receiptから分離表示する。API callback replay、署名改変、D1保存、final reconciliationはlocal fixtureで試験する。契約先がこの形式を提供するか、通知遅延、取消後の最終meter、実行中のcap enforcement保証は未受入。providerが累積meterを報告しない場合は暫定額を表示せず未報告とする。Zema UIにProvider別extensionとして結ぶ実行見積、quote期限・request hash・price versionのapproval binding、Wallet cap reservation、final settlementの既存境界を維持する。実Provider価格・Cloud実支出・invoice settlement・Android Wallet同期は未受入で、A2A production実行は無効。

## 2026-10-02 Package runtime positive dispatch and SIM-led status

`npm run sky:a2a:workflow:positive` passes 12/12. Added a Cloudflare Worker/D1/Workflow positive test that registers a Provider-signed Package runtime binding, pins it through approved delegation, confirms the Worker preserves Agent Card extension declaration across durable serialization, sends the bound operation and request digest to a controlled fixture service, captures the completed artifact encrypted, verifies a synthetic Provider-signed usage receipt, and settles the local logical reservation. The mock service binding is not a real Provider or production integration. This updates the previous checkpoint that the successful Package executor path was absent: a local executor fixture now exists, while real Provider implementation, external interoperability, real rates, invoice settlement, and funded Wallet reconciliation remain open. Full `npm run verify` passes after the code change (Node 737/737, API 994 assertions, CSV 113 assertions, Fashion 19/19, typecheck/lint/build and repository gates). Production D1 readback remains 0/6 and all OS/carrier/customer acceptance gates remain separate. See [correction evidence](../evidence/sim-led-product-correction-20261002.json).

## 開発実行プロンプト

[決済とWalletの開発プロンプト](../prompts/sky-commerce-wallet-development.md)を使用する。設計差分の実装、Commerce管理者権限、監査、サポート、停止/復旧、監視、sandboxから限定liveまでの受入を含む。外部Stripe/Cloudflare/OSSの利用と、自社コードの担当を区別する。プロンプト保存は実装合格ではない。

