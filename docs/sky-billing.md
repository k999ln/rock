# Sky Market決済と旧収益精算

**2026-10-01 設計更新:** 既存実装に対する[決済・Wallet統合詳細設計](sky-commerce-design.md)と[Wallet詳細](wallet-commerce-design.md)を追加した。型/DDLは実装前の参照契約。今回の利用者指示で旧月額8.88 USD案は対象外とし、下記の過去実装記録とは区別する。

**2026-09-27 現行判断:** 利用者の「決済もできるようにして」という明示指示により、Sky Marketの商品購入をStripe Checkout / Connectへ接続する実装を追加した。Sky手数料10%、登録・接続・公開・基本利用料0円を維持する。外部決済、API、AIモデル、cloud等の第三者実費は別項目である。実資格情報の設定、Stripe sandbox受入、実課金、本番配備は未実施。8.88 USDのToC収益料金案は引き続き保留し、旧精算Workerは新しいToC Earning Receiptを409 `SKY_FEE_POLICY_ON_HOLD`で拒否する。

## Sky Market決済（2026-09-27実装）

### 利用経路と対象

提供者は `/sky/sell` からStripeのExpressアカウント登録へ進み、Stripe上で本人情報・銀行口座を入力する。Skyはカード番号・銀行口座情報を保存しない。アカウントの `charges_enabled`、`payouts_enabled`、`details_submitted`、`transfers=active` を照会してから、本人所有の審査済みPackageに販売価格・販売条件URL・返金条件を保存する。

購入者は `/sky/marketplace` のPackageを選び、金額と条件を確認してStripe Checkoutへ進む。戻り先 `/sky/purchases` で支払いを再照合する。署名Webhookでも照合し、Stripeから再取得したSession、PaymentIntent、Chargeの注文ID、金額、JPY、test/live、受取先、10%手数料、支払い成功が一致した場合にだけ購入済みとする。戻りURLやブラウザの申告だけでは購入済みにしない。

現在の対象は `pricing.model=external_contract`、現行manifest hashに結び付く有効な `verified` review、提供者の販売設定を持つPackageの円建て買い切り販売である。価格は50〜99,999,999円の整数。LLMのPackageも同じ条件で販売できるが、カタログのLLM候補や既存Toolに価格を自動付与しない。月額、従量課金、他通貨、税・請求書・割引の自動計算は今回の対象外。

Skyは注文額の `floor(amountMinor × 1000 / 10000)` をStripeの `application_fee_amount` に設定し、提供者の接続アカウントへdestination chargeを作る。10,000円ならSky手数料1,000円、提供者への分配9,000円。Stripe等の処理費用、税、返金・紛争の負担は別であり、1,000円をSkyの純利益とは表示しない。アカウント作成では処理費用と決済損失のpayerをplatformに設定している。銀行への払出し完了はこの注文記録から推測せず、Stripe側で確認する。

### 保存とAPI

実装は `lib/sky-commerce.ts`、`lib/sky-commerce-store.ts`、`lib/sky-stripe.ts`。Web D1の `drizzle/0018_sky_commerce.sql` が `sky_commerce_sellers`、`sky_commerce_offers`、`sky_commerce_orders`、`sky_commerce_events` を追加する。旧Billing WorkerのDBとは独立している。

| API | 動作 |
| --- | --- |
| `GET /api/sky/commerce/offers` | 公開販売価格・条件・revisionを取得。現行reviewが失効した商品を除外 |
| `GET /api/sky/commerce/seller` | 本人の受取先状態、Package、販売設定、売上を取得 |
| `POST /api/sky/commerce/seller` | `{ "action": "onboard" }` で本人の受取先登録URLを作成 |
| `POST /api/sky/commerce/offers` | 本人の `packageKey`、`amountMinor`、`currency: "jpy"`、`active`、`termsUrl`、`refundPolicy` を保存 |
| `POST /api/sky/commerce/checkout` | `packageKey` と閲覧済みの `offerRevision` から注文・Checkout URLを作成 |
| `GET /api/sky/commerce/purchases` | 本人の注文、返金額、購入アクセス状態を取得 |
| `POST /api/sky/commerce/reconcile` | 本人の `orderId` をStripeへ再照合 |
| `POST /api/sky/commerce/refund` | 提供者本人の `orderId` の未返金残額を返金 |
| `POST /api/sky/commerce/webhook` | Stripeのraw body署名を検証し、最新の決済情報を照合 |

価格、手数料、受取先、購入者IDを購入リクエストから採用しない。注文は販売条件とmanifest hashを固定し、後の価格変更で書き換えない。同じ購入者・Package・環境の進行中注文は一つに制限し、Stripeのidempotency keyも注文IDへ固定する。イベントと注文状態はD1 batchで保存する。

`sky_commerce_orders` の支払い済み状態がSkyの購入アクセス記録を兼ねる。Packageの停止、review期限切れ、manifest変更、返金・紛争では接続先を表示しない。ただしRegistryのendpointは公開情報になり得るため、この表示制御だけでは第三者MCP serverへのアクセスを防げない。有料提供者は自身の認証・利用権・失効処理を実装する必要がある。今回の購入記録をMCPへの認証済み接続やTool実行成功に読み替えない。

### サーバー設定と導入

| 設定 | 条件 |
| --- | --- |
| `SKY_PAYMENTS_MODE` | `test` または `live`。未設定・不正値では決済不可 |
| `SKY_STRIPE_SECRET_KEY` | modeに一致する `sk_test_…` / `sk_live_…` または対応するrestricted key。Stripe呼出しはサーバー内のみ |
| `SKY_STRIPE_WEBHOOK_SECRET` | その環境の送信先に対応する `whsec_…` |
| `SKY_PAYMENT_ORIGIN` | 正確なOrigin。パス、query、fragment、認証情報を含めない。HTTPはtestのlocalhost / 127.0.0.1だけ |

鍵はWebサーバーのsecret bindingまたはGit対象外のローカル環境へ設定する。`NEXT_PUBLIC_` / `VITE_` 等で公開せず、ブラウザ、LLM、商品MCP、ログへ渡さない。test/liveの注文・販売設定・受取先は分離される。未設定時の一覧APIは接続待ちを返し、書込みは503で止まる。旧 `BILLING_SERVICE_URL` 等だけでは新しい購入機能を設定できない。

1. Web D1へ既存migrationと `0018_sky_commerce.sql` を順に適用する。ローカルは `npx wrangler d1 migrations apply DB --local --config wrangler.local.jsonc`。配備先はそのWebアプリのDBへ適用し、旧Billing DBへ誤適用しない。
2. Stripeのtest環境とConnectを用意し、四つの設定をWebサーバーへ登録する。`npm run dev` で `/sky/sell`、`/sky/marketplace`、`/sky/purchases` を確認する。
3. Stripeの通知送信先を `<SKY_PAYMENT_ORIGIN>/api/sky/commerce/webhook` に設定する。対象は `checkout.session.completed`、`checkout.session.async_payment_succeeded`、`checkout.session.async_payment_failed`、`checkout.session.expired`、`charge.refunded`、`charge.dispute.*`。raw bodyと `Stripe-Signature` が変更されず到達することを確認する。
4. 本人サインインで受取先登録、審査済み `external_contract` Packageの販売条件設定、testカード購入、戻り先照合、Webhookを実際のStripe sandboxで受け入れる。
5. 受取先、販売条件、返金・紛争対応とsandbox結果を確認した後、本番資格情報・本番Webhook・HTTPS Originを設定する。本番配備と実資金の結果は別に記録する。

liveの本人APIは現在、HTTPSの `.chatgpt.site`、設定Origin、`x-dispatched-app: site---…` と既存Sites本人ヘッダーを使う。公開経路が本人ヘッダーを除去・検証・再設定すること、およびそれを迂回できる直接Worker Originが公開されないことが必須。host/dispatch文字列だけでは署名認証にならない。testモードの合成ヘッダー試験を実サインイン検証としない。

Webhook経路はStripeがサインインなしで到達でき、raw署名で認証される必要がある。Sitesのアクセス設定がこの例外経路を実際に提供できるかは未確認。配備前に匿名POSTの到達を確認し、ログイン画面への転送や認証要求で止まる場合は、署名とraw bodyを保持する専用の受信経路を用意してから接続する。本人用APIの認証を外して解決しない。

### 返金、結果不明、受入

提供者は売上画面で注文と未返金額を確認して返金する。Stripeへ `reverse_transfer=true` と `refund_application_fee=true` を指定する。画面から任意額の部分返金はできないが、Stripe側で行った部分返金はWebhookで金額とともに記録する。部分返金・返金確認中・紛争中はアクセスと再購入を止め、全額返金が確認できた場合に新規購入を認める。返金・紛争より遅く到着した支払い完了でアクセスを復活させない。

受取先作成の結果不明、Sessionを保存できなかった注文の再作成、結果不明の返金は、最初の要求から20時間を超えると自動再送を止めてStripeでの確認を求める。再照合で返金の初回要求時刻を延長しない。返金失敗や紛争解決後の利用再開、紛争の証拠提出、銀行払出しの追跡は運用確認が必要で、画面からの手動状態書換えや自動再開は実装していない。

ローカル検証:

```sh
node --experimental-strip-types --test tests/sky-stripe.test.mjs tests/sky-commerce.test.mjs
npm run schema:check
npm run typecheck
npm run lint:product
```

commerceの37件は、全Web migrationを適用したSQLiteとStripe HTTP mockで、購入縦断、10%固定、本人分離、同時購入、通知署名、金額・宛先不一致、review失効、返金・紛争の順序逆転、再送期限を確認した。これはProvider sandboxでの受入ではない。

Provider sandboxでは、実際のConnect本人登録、買い切り支払い・認証失敗・取消、10%分配と処理費用の明細、Webhook再送・順序逆転・不達後の再照合、全額/部分返金・紛争、受取先無効化、別本人からの拒否、有料MCP側の認証と返金後失効、銀行払出し状態の区別を確認する。現時点で実Stripe資格情報、provider sandbox実行、live money、配備の証拠はない。

## 旧収益精算Workerの範囲

以下の888 cents計算式、Earning Receipt、払出し台帳は旧収益モデルの設計・回帰検証の記録。上記の商品購入とは別経路であり、今回の変更で再有効化していない。

公開Workerでは状態確認に`BILLING_SHARED_SECRET`と`SETTLEMENT_INGEST_SECRET`を必要とする。`PAYOUT_ADAPTER_SECRET`は払出しadapter接続時だけ必要で、未登録なら払出しclaim/resultを503で拒否する。料金保留中の状態確認やToC拒否まで503にしない。[公開環境の確認記録](evidence/launch/sky-billing-fee-hold-20260924.json)。

## 旧料金案・実装履歴

2026-09-19方針更新: 無料配布を理念とし、OSの利用料を従量課金とする意向が示された。以下のSky収益連動精算は現行runtimeの契約であり、OSの利用量を計測する新料金ではない。対象範囲、計量単位、単価・上限が決まるまで料金計算を変更しない。

2026-09-17追加設計・最新訂正: SkyをToolチームの主入口へ統合し、**Sky経由の検証可能な利益に対する成功報酬の一部を開発者還元原資とする提案**へ更新した。成功報酬率、利益の定義、既存888 cents月上限の扱い、回収方法、開発者配分率/weight/留保は未確定で、最新要望を確認中。以下は既存runtimeの経済契約であり、新方針への移行は未完了。料金計算や実請求を無断変更しない。[Skyの貢献・還元契約](sky-network-economy.md)。

## 収益モデル

Skyは利用開始時にカードへ8.88 USDを請求しない。Skyの自動化が生み、外部の販売・決済Providerで入金まで確認できた収益だけを対象に、利用者ごと・UTC月ごとに次の順で精算する。

1. 検証済み自動化売上を計上する。
2. その売上に直接対応する外部Provider、API、モデル等の実費を回収する。
3. ToC分は実費後の残額からSky利用料を最大888 USD centsまで回収する。
4. 残額を利用者の払出し指図へ入れる。

式はToCの旧保留案については `sky_fee = min(gross - operating_cost, 888 - fee_already_collected_this_month)`。売上0なら利用料0、実費後の残額が888 cents未満ならその範囲だけ、未達分の債務化・翌月繰越・カード請求はしない。ToBの現行表示ポリシーは、検証済みTool売上の10%をSky手数料、残り90%を提供者側として扱うが、実際のReceipt計上・請求・払出しは受入完了まで無効である。

## 信頼境界

ブラウザや利用者が売上額を自己申告するAPIではない。販売・決済Providerを照合する内部adapterだけが、次の証拠を持つEarning ReceiptをSkyの`POST /api/earnings/receipts`へ送る。

- SkyのExecution Receipt ID
- Provider名と重複しない入金参照
- 利用者、ToC/ToB区分、払出し先参照
- USD cents整数の確定売上と直接実費
- 入金証拠のSHA-256
- 32 bytes以上の`EARNING_PROVIDER_SECRET`による、時刻付きraw body HMAC署名（`Avocado-Provider-Signature`）

Sky bridgeは署名を先に検証し、`sourceProvider`が設定済み`EARNING_PROVIDER_ID`と一致すること、Execution Receipt IDが本人所有の完了済み・非サンプルjobであること、利用者・Tool・発生時刻が一致することを確認する。合格した同じraw bodyだけを`SETTLEMENT_INGEST_SECRET`で再署名して精算Workerへ送る。ブラウザ、LLM、Tool自身にはどちらの秘密も渡さない。

単なるツール実行成功、成果物作成、手入力売上、未確定PaymentIntentは受け入れない。同じReceipt ID、Execution Receipt ID、Provider入金参照の再送は同一内容なら冪等に返し、異なる内容なら409で止める。Providerからbridgeへの再送後も、精算Workerの一意制約によってWalletへは一度だけ反映する。

## 実装経路

Skyの`POST /api/earnings/receipts`がProvider署名とWeb D1のjobを照合し、独立Cloudflare Workerの`POST /v1/earnings`だけがbridge署名済みReceiptを受ける。D1 migration `0002_earnings_settlement.sql`は以下を保存する。

- `earning_receipts`: 実行・Provider入金・証拠hash・金額の対応
- `monthly_earning_settlements`: 利用者/月ごとの売上、実費、Sky回収、分配額
- `earning_ledger_entries`: `AUTOMATION_REVENUE`、`OPERATING_COST`、`SKY_SERVICE_FEE`、`BENEFICIARY_PAYABLE`の追記型台帳
- `payout_instructions`: Provider adapterが残額を送るための一意な指図、5分lease、idempotency key、送金結果

Receiptの割当、月集計、台帳、払出し指図、適用済み印は一つのD1 batchで更新する。途中失敗で未適用Receiptが残った場合、同じ署名済みReceiptの再送で再開できる。`POST /v1/payouts/claim`はProvider adapterへ未処理の指図を5分leaseし、`POST /v1/payouts/result`は同じleaseで`paid`、`failed`、結果不明を記録する。adapterは再試行時も指図の同じidempotency keyを使う。`GET /v1/status`はSkyの短命ユーザーtokenとOriginを検証し、本人の当月集計だけを返す。

以前の`POST /v1/checkout`、`POST /v1/portal`、`POST /v1/webhooks/stripe`は410 `UPFRONT_BILLING_RETIRED`を返す。旧`0001_billing.sql`は移行履歴を壊さないため保持するが、新しい契約・請求を作らない。

## Provider adapterの接続条件

### 開発者還元への接続境界

既存`earning_receipts.sky_fee_minor`は旧契約のSky利用料割当額、`applied_at`は収益台帳への適用であり、現金/USDCの回収完了ではない。旧契約の回収正本は`rock_fee_collection_instructions`の`collected`状態と、既存reconcileが確認したtransaction・金額・宛先・finality・確認時刻である。これを新契約の成功報酬へ自動変換しない。新契約でも利益発生、請求、実回収を分け、利用者やToolが申告した「回収済み」を証拠にしない。

追加する貢献・配分準備側は、既存の署名検証済み収益を再利用し、新契約の利益照合と成功報酬回収証拠へ結ぶ設計とする。新契約への移行または回収readbackが未完了なら金額未確定のままにする。pending明細はBillingの4勘定や利用者向け`payout_instructions`への新たな記帳ではなく、確定した支払債務でもない。今回の設計で既存払出しworkerへ開発者宛の送金を追加しない。

原資は実回収済み成功報酬だけとする提案であり、先の`collected_sky_fee`固定案を訂正する。draft policyの成功報酬率/月上限/回収方法/開発者配分率/weight/留保条件は未設定値を保持する。設定が揃うまで開発者配分金額は未確定、実払出しは無効。未合意の利用者残額控除、ToB商品売上、PAPER収益、未回収成功報酬から原資を補わない。将来policy有効化時は、版/hash、対象期間、原資の一意性、合計が利用可能原資を超えないこと、最小単位の丸め、取消・返金・既配分との照合が必要である。

Walletは、利益の根拠と成功報酬の請求内容を表示し、本人の支払い・領収・照合を円滑にする決済窓口である。外部サービスが本人の銀行口座へ入金した事実は、Skyへの支払完了でも銀行自動引落しの委任でもない。口座登録や入金確認から回収権限を推測せず、新しい支払手段・同意・結果照合を契約と実装で確定する。

作者帰属は認証登録者と実行時の検証済みTool版/hashを結ぶ。manifestの`developerRecipientId`は宣言値なので、そのまま実払出先にしない。現行のExecution/Earning Receiptだけでは作者版のsnapshotを持たない過去実行もあるため、証拠のない過去分を現在のpackage登録者へ遡及配分しない。

収益・回収・貢献は別保存境界のため、全体を単一transactionで確定したとは扱わない。安定したsource IDとhashで冪等再照合し、途中失敗は既存Billingの適用結果を確認してから再開する。返金やchargebackは元Receiptを上書きせず参照付きの保留/相殺を必要とし、Provider返金連携未受入を「返金なし」とみなさない。再実行やpolicy更新による二重配分を防ぐ受入後にのみ、将来の支払機能へ進める。

このWorkerは収益の検証・配分台帳であり、仕事を受注したり銀行送金を単独で行うものではない。実収益化には、各自動化商品について次のadapterを接続する。

1. 需要側から有償注文を受ける販売adapter
2. Execution Covenantに従って仕事を実行し、Skyの一意なjob IDへ納品・承認を記録するadapter
3. 決済Providerの署名Webhookまたは公式照会で入金確定を確認するadapter
4. Execution Receiptと入金を一対一で照合し、`EARNING_PROVIDER_SECRET`でEarning Receiptへ署名するadapter
5. `payout_instructions`を同じidempotency keyで実送金し、成功・失敗を照合するadapter

販売主体、資金保管、本人確認、提供地域、税、返金、chargeback、最低払出額はProviderごとに確定する。Provider sandboxで入金、Webhook再送、順序逆転、返金、払出し失敗、再照合が合格し、所有者が本番資格情報と口座を確認するまで実入金・実払出しは有効化しない。

## 設定と検証

`services/sky-billing/wrangler.jsonc`へSkyの公開OriginとD1 IDを設定し、Git外のsecretとして次を登録する。

```sh
npx wrangler secret put BILLING_SHARED_SECRET --config services/sky-billing/wrangler.jsonc
npx wrangler secret put SETTLEMENT_INGEST_SECRET --config services/sky-billing/wrangler.jsonc
npx wrangler secret put PAYOUT_ADAPTER_SECRET --config services/sky-billing/wrangler.jsonc
```

Sky側には同じ`BILLING_SHARED_SECRET`と`BILLING_SERVICE_URL`を設定する。現在は一つの収益Provider adapterをfail-closedで固定するため、Sky側へ`EARNING_PROVIDER_ID`、`EARNING_PROVIDER_SECRET`、`SETTLEMENT_INGEST_SECRET`もsecretとして設定する。収益Provider adapterへ渡すのは`EARNING_PROVIDER_SECRET`だけであり、精算Workerの`SETTLEMENT_INGEST_SECRET`はSky bridge以外へ渡さない。払出しadapterには別の`PAYOUT_ADAPTER_SECRET`だけを渡す。これらをブラウザ、LLM、商品MCP、ログ、Gitへ出さない。複数Providerの本番接続前に、Providerごとのsecret保管・rotation・失効を追加する。

ローカルでは `node --experimental-strip-types --test tests/earning-bridge.test.mjs tests/billing.test.mjs tests/billing-worker.test.mjs tests/settlement.test.mjs` で、完了job照合、サンプル・未完了・本人／Tool不一致の拒否、二重計上拒否、署名、改ざん、低収益、月上限、ToB無料、Receipt再送、競合、本人別status、先払いAPI停止を確認する。Worker bundleは`npm run billing:check`、全体回帰は`npm run verify`で確認する。

2026-09-12のローカル受入では`npm run verify`を完走し、Web本体118 tests、Fashion Brand Ops 14 tests、仕事API 143 assertions、D1移行互換、Worker dry-run bundle、本番buildが成功した。実販売Provider、実決済、実口座、実払出しは未接続であり、この結果を収益・回収・送金実績とは扱わない。

2026-09-15のROCK_READY受入では、Web D1上の完了jobからProvider署名、bridge再署名、Billing D1のReceipt・4勘定・払出し指図までを一つのfixtureで縦断した。同一Receiptの再送は1件のまま、同じ実行への別Receiptは409、未署名、別Provider、未完了、サンプル、本人／Tool不一致、収益鍵と払出し鍵の相互流用は拒否した。2026-09-16には同じ合成実行IDと証拠hashをPixelのTool／端末Wallet区間とこの署名精算区間へ渡し、物理6/6・host 7/7で相関を確認した。二つの試験区間であり、実Provider sandbox、配備済み端末からの一本通し、実収益は引き続き未接続である。

## Rock受取Wallet / Base USDC

RQ36により、`0004_rock_settlement_wallet.sql`でRock受取operator、5分challenge、receipt単位の回収指図を追加した。`GET /v1/rock-wallet`、`POST /v1/rock-wallet/challenge`、`POST /v1/rock-wallet/verify`、`DELETE /v1/rock-wallet`、`POST /v1/rock-wallet/reconcile`を短期Billing tokenで認証する。

受取先は外部EIP-1193 Walletの所有署名で確認する。署名はSite origin、Base chain id、nonce、発行・失効時刻へ束縛し、秘密鍵、seed phrase、token approval、送金権限を要求しない。回収指図はEarning Receiptへ既に配分された `SKY_SERVICE_FEE` だけから作り、受取先未登録、着金待ち、finalized待ち、着金済み、結果不明を分ける。

着金済みへの遷移には、Base Mainnet `8453`、Circle公式Base USDC contract、exactなrecipient、`amount_minor * 10,000` units、成功receipt、finalized blockの一致をすべて要求する。receipt、idempotency key、transaction hashはuniqueである。RPC timeout・不明状態・未finalizedでは自動送金または別transferを作らず、同じ指図を明示的に再照合する。初期の `BASE_RPC_URL` は公開Base RPCで、運用負荷に応じて認証済みRPCへ差し替える。[設計と本番gate](rock-wallet-production-rail-20260913.md)。


## 2026-10-01 CSVの50円決済試験

[CSV試験の接続と受入](sky-csv-trial-payment.md)。通常受付と別の指定サンプルにJPY50のHosted Checkoutを追加。Apple Pay表示と実課金は本番接続・本人決済の受入待ち。
