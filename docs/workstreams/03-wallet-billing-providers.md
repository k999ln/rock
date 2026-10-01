# Wallet / Billing / Providers

## 目的

自動化の仕事、費用、検証済み収益、Rock利用料、払出しを追記型台帳とreceiptで分離し、Wallet会社・ファンド会社を交換可能なProviderとして接続する。

## 現在地

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

Sky Market決済の主担当は `JOINT`。`ROCK` は商品・注文・手数料・照合・本人分離・返金停止を実装し、`EXTERNAL` のStripeは決済・受取先本人確認・銀行払出しを担う。`OWNER` は既存の決済実装指示を前提に、実アカウントと資格情報・販売条件を用意する。現段階はローカルmockでの `ROCK_READY` であり `PROVIDER_READY` / `INTEGRATED` / `LIMITED_LIVE` / `PRODUCTION` ではない。

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

## eSIM専用製品の開発

既存BIL02の[Bootstrap host fixture](../../toolkits/esim-bootstrap/README.md)とCallback V3/owner-order bindingに加え、eSIM Go REST API v2.5 clientを追加。validate→currency/wholesale cap→one-shot durable dispatch marker→transaction→provider order reference/profile digest記録→paid Sky order bindingを接続し、provider_completed状態は`GET /esims/assignments?reference=`で取引を再送せず再開する。wholesale上限超過時はclaim作成・transactionとも行わず、DBに平文install secretを保存しないことをfixtureで検証。`POST /api/esim/orders/{orderId}/issue`は認証済みowner・paid/live Sky order・manifest hash・server-owned plan catalogの一致を要求する。catalogでbundle、retail amount/currency、provider currency、wholesale capを選び、顧客入力から変更できない。catalog version・provider→retail minor-unit換算比・fee reserve・最低gross margin・bundle・販売額をcanonical JSON snapshotとSHA-256で注文レコードに固定し、provider quoteにも卸値capと同じ利益下限を再適用する。通貨差の試算はoperator設定を検査するだけで、実FX・provider invoice・payment feeの根拠ではない。Provider debit gateはdefault-offで、secret間の値重複も拒否する。`POST /api/esim/orders/{orderId}/install-material`は同じownerのpaid orderだけに、AES-GCMで暗号化されたICCID/Matching ID/SM-DP+をdelivery request key単位で再取得可能に返し、本人ack時に暗号文を削除する。APIはno-store/no-cache。primaryOwnerはROCK、外部依存は契約済み通信会社API、本人認証gateway、端末受信部。raw-body署名検証、ICCID専用HMAC、owner/order照合は実装済みで、通知は利用権・注文・service stateを変更しない。transaction timeout/503/不正応答は`reconciliation_required`に止め、provider APIにclient idempotencyを確認できないため再送しない。provider completed後にローカル保存で失敗しても、assignment GET再開後に導入情報を保存し同一Profileをbindingする。migration 0032、same-key再取得、別key拒否、tamper拒否、ack消去fixtureを追加。eSIM固有fixture 17件、Webhook/provider/order/adapter 7件、catalog/snapshot 3件、install-material 2件成功。未受入はpricing assumptions/fee reserveを契約・実明細で確定すること、API credential・sandbox・production D1/secrets/cron再起動、実端末での受入。currentStageはhost + local D1/API contract fixtureの部分的ROCK_READY。BIL02全体はin_progressを維持する。

2026-09-30: 所有者認証付き`GET /api/esim/orders/{orderId}/status`を追加し、Sky注文のpaid/refund状態、provider order state、profile binding、install-materialの未取得／acknowledgementだけを返す。認証済み`POST /api/esim/orders/{orderId}/reconcile`は確定済みprovider referenceへのGETとassignment GETだけを行い、status・bundle・price・currency・profile digestを一致照合してbindingを再開する。provider transactionは発行せず、`reconciliation_required`でreferenceが不明な取引は自動解決しない。既存注文は発行時の署名済みpricing snapshotを参照し、現在のcatalogが変わっても販売条件を入れ替えない。共有Sky Runtimeの1分cronから同じread-only reconcilerを最大10件ずつ呼び、API key・profile-hash key・install-material keyの別管理設定がなければ何もしない。local D1 fixtureは既知referenceのprofile binding、一巡後の重複pollなし、reference不明注文の除外に加え、WebhookのICCID HMAC digestから既存paid orderへの一回限りの相関と、未一致callbackを未bindのまま残すことを確認。worker test 2/2、typecheck、lint、runtime dry-runは成功。Cloudflare本番D1/secret/cron、再起動受入、provider sandbox、実端末は未完了。

2026-10-01 retest: `node --test tests/esim-bootstrap.test.mjs tests/esim-plan-catalog.test.mjs tests/esimgo-webhook.test.mjs tests/esim-install-material.test.mjs tests/esim-reconciliation-worker.test.mjs` passed 33/33. These are host/local-D1 fixtures only; they do not accept a live eSIM, provider sandbox, device install, or billing. The standalone bootstrap suite remains separately reported as 15/15.

## A2A cloud usage receipt（2026-09-30）

異なるAgent providerに委任したcloud作業について、A2A taskの自己申告を請求根拠にしないProvider署名付き最終usage receiptの契約・Ed25519検証・親job予算pool精算を実装した。receiptは完了／失敗／取消などterminal taskのowner・親job・remote task・Agent版・currency・予約capに束縛し、署名済みmeter明細合計が一致しcap以下の場合だけ、一回限りで内部reservationをsettledへ移す。provider/reference重複、署名不正、task不一致、上限超過を拒否し、未提出receiptの予約は保持する。trust inventoryはRuntime Workerの`A2A_TRUSTED_USAGE_KEYS`運営設定であり、provider実証明書・鍵運用は未受入。

この処理はA2A parent budget poolの内部精算までであり、利用者Wallet残高の資金拘束、外部Wallet台帳へのdebit、provider invoice／契約rate cardの照合、実cloud費用の回収を行わない。既存の所有者Walletは現在の会計表示／収益receipt経路と、別のRock OS spend simulationがあり、いずれもこのRuntimeからcloud使用料を引き落とす実残高契約とは異なる。production実行gateはWallet funding/reservation adapter・provider sandbox・端末鍵lifecycle受入まで無効のまま。

## A2A向けRockstarOS Wallet hold（2026-10-01）

`ValueSpendRuntime`にowner・親job・delegation・承認digest・deadlineへ結び付くsynthetic USD予約を追加。既存の`AVAILABLE → SPEND_HOLD → SPEND_COMMITTED/AVAILABLE`のappend-only ledgerを再利用する。Hub/MCP command、exact payload idempotency、pre-dispatchだけのrelease、dispatch後のindeterminate hold、verifier無しでのsettlement拒否を追加し、Hub HTTP経由を含むPython tests 25件が成功。詳細は[Value/Spend Runtime](../value-spend-runtime.md)。

これは**端末内合成Walletの予約**であり、A2A D1の子budget reservationと同じ資金ではない。`ValueSpendRuntime.authorize_a2a_proof` callableをBrokerへ注入でき、owner/device・delegation ID・親job・通貨・cap・approval digest・Unix millisecond deadlineを同一SQLite transactionで照合する。proofが有効な間は予約をreleaseできず、同じcontrol key以外の再認可を拒否する。runtime 17件、Hub HTTP 9件、Broker core 33件、A2A Node/Python protocol suite 34件が成功し、そのうちBroker suiteは実Wallet callableを注入したcross-module fixtureを含む。Cloudflare local Workflow/D1は署名・形状が正しい期限切れproof、失効鍵proof、proofなしを各々送信前に拒否し、Agent discovery／remote send claim 0件を確認した。fixtureに署名field外の親予算値が混ざり、期限／失効検査に届いていなかったtest defectも修正した。一方、device Gatewayのproduction process wiring、実Providerを使うCloudflare positive Workflow、実残高、実Provider請求は未受入。usage verifierもHubには未設定でfixture注入時だけsettlement動作を試す。これらが接続するまでは本番dispatchと実請求を無効に保つ。

2026-10-01 harness investigation: do not weaken the public HTTPS origin allowlist to reach a local HTTP A2A mock. Cloudflare documents a Miniflare `fetchMock` integration for controlled outbound responses, but the currently installed `miniflare@5.20260811.0-alpha` package does not export `createFetchMock`; Miniflare's D1 API probe also remained pending after `ready`. A local Wrangler service-binding mock appeared connected but its subrequest hung inside the Workflow runtime, so that experimental path was removed. The `wrangler dev` local Workflow/D1 rejection suite still passes all three no-proof/expired/revoked cases, with zero remote send claims. A separate attempt to execute the Wrangler-built Worker directly through the current Miniflare V4 API failed during Workerd startup with an internal runtime error even before dispatch; that temporary harness is not retained as a passing test. The host A2A protocol suite (including independent Node and Python HTTP agents) passes 46/46 when localhost is permitted; eSIM fixtures pass 33/33. The positive Cloudflare Workflow path remains unverified. Next use Cloudflare's supported Workers Vitest integration/test harness compatible with the installed Wrangler toolchain, or a contracted provider sandbox, then assert D1 task/artifact/usage state and restart reconciliation. Keep the production HTTPS-only allowlist intact.

## Cloudflare positive A2A Workflow fixture（2026-10-01）

上記の「positive path未検証」は、同日後続の再試験で解消した。Cloudflare公式Workers Vitest plugin（Vitest 4.1.0、`@cloudflare/vitest-plugin` 1.3.4、同梱Wrangler 4.145.0 / Miniflare 5.20260930.0-alpha）を使い、実際の`wrangler.jsonc` WorkerとWorkflow、local D1 migrations 0019–0026を起動するfixtureを追加。テスト専用のservice bindingだけを承認済みHTTPS fixture agentへ接続し、Agent Card取得と`message/send`を各1回に制限する。

`npm run sky:a2a:workflow:positive`成功。署名済みBroker proof検証、同意済み入力の復号、Agent Cardの名前・版照合、one-shot remote send claim、完了task receipt、イベント列、owner/delegation/taskに束縛した暗号化成果物の保存と復号まで確認した。運用HTTPS allowlistの緩和や外部接続はない。WorkerdではFetch `redirect: "error"`が実装されずrequest前に例外となる実行互換性欠陥も見つけ、`redirect: "manual"`へ変更した。3xx応答は2xx限定の既存判定で拒否し、転送先へ追従しない。A2A protocol/store/security tests 46/46、eSIM fixture 33/33、typecheck、product lint成功。別途Wrangler local Workflow/D1のproofなし・期限切れ・失効鍵拒否3/3、remote send claim 0を再確認。

この成功は**ローカルfixtureのpositive Workflow受入**であり、Cloudflare本番永続化・controller/worker再起動後のresume・実Provider相互運用・Provider署名鍵運用・実残高Wallet debit/照合・実請求・native Broker Gateway・端末圏外継続を証明しない。次はWorkflow再起動/reconciliationをlocal runtimeで受け入れ、契約後のProvider sandbox手順とWallet/device gateway接続を準備する。BIL02/SKY07はin_progress。

2026-10-01 follow-up: Extended the positive Workers Vitest case with Cloudflare `WorkflowInstance.restart()` after a completed task. The restarted instance observes the terminal D1 row, returns `not_dispatchable`, and the persisted `remote_send_claimed` count remains 1; the mock also rejects repeated Card/send calls. Vitest passes 1/1. This is an instance restart after terminal completion, not a process-loss test or an in-flight/indeterminate reconciliation test; those remain next. The explicit restart emits a Workerd engine-abort diagnostic while the runtime interrupts its current execution, but the asserted restarted Workflow completes and no duplicate external request occurs.

2026-10-01 ambiguous-send extension: The second Cloudflare Vitest case now simulates the controlled agent recording the approved `message/send` and returning HTTP 503. D1 becomes `indeterminate`; a 25-minor-unit child reservation remains `held` and unsettled. Restarting that errored Workflow returns `not_dispatchable`, leaves the remote-send claim at exactly one, and the test service rejects any duplicate message ID. Both local positive and ambiguous-restart cases pass (2/2). This demonstrates no automatic replay and budget retention for a possibly accepted task. It does not resolve a provider task ID after an actual lost response, simulate Workerd process loss, or prove a contracted provider's `tasks/get`; those remain unaccepted.
