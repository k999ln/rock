# Sky Market決済と旧収益精算

## Agent利用料の月次後払いと未払い対応（2026-10-15）

利用者は「携帯料金と同じシステムでAgent利用を毎月請求し、強い支払義務にする」と明示した。主担当Billing/BIL02、ROCKは契約・計測・請求状態とサービス権限、EXTERNALは決済/収納・適法な債権回収、JOINTは請求/入金/復旧の受入、OWNERは契約主体・対象国・料金・支払条件を確定する。本項は料金方式の設計変更であり実請求・引落し・回収の実施ではない。

### 契約と請求

- Agent利用料は契約account単位で毎月まとめて後払い請求する方向とする。携帯キャリアの実請求への合算は別契約/接続が必要で、今回成立したとは扱わない。
- Agent/Provider、使用単位、単価の版、実行job、利用期間、税/値引/返金を明細化。通信料、SIM/eSIM、端末代、既存OS料金、Agent料金、第三者実費を分ける。定額/無料枠/超過単価は未定で、既存Sky基本無料・商品販売10%手数料・旧8.88案保留を一括上書きしない。
- 締日、支払日、通貨、回収方法（口座振替/カード等）、収納主体、支払同意、税、返金、解約時の最終請求、契約変更通知を契約版へ固定する。銀行/カード情報は選定決済Providerへ預ける。
- 後払いでも単価提示、実行見積、月額利用上限、実行中予約を必須にする。上限内の包括利用同意と個々の高額/権限変更承認を区別。後払い与信枠は未設計/未受入で、既存の実行gateを無条件に解除しない。
- 月次集計は検証済みusageを一度だけ計上。通信切断/遅延receipt/重複webhookで二重請求せず、不明usageを推測確定しない。未確定項目は保留・翌月調整等を契約に定義する。請求書発行、引落し要求、引落し成功、入金照合を別状態にする。

### 支払いを確実にする設計

`accruing → invoice_open → payment_pending → paid` を基本状態にし、`payment_failed / overdue / disputed / restricted / recovery_review` を支払状態と権限状態の組合せで管理する。

1. 開始時に支払方法の確認と契約同意、本人/法人の支払責任者を記録する。
2. 締め前に利用額と上限、請求確定時に明細と支払期限を提示する。
3. 決済失敗は残高不足・認証待ち・Provider障害・結果不明を区別。結果不明は照合し、無制限再引落ししない。
4. 未払いは通知、契約で定めた猶予と再試行、異議申立て/訂正窓口を通す。争いのある明細は確定した支払義務と分離する。
5. 期限超過時は新規の有料Agent実行と追加与信を停止する。安全停止、保存済み成果の確認/適切なexport、請求確認/支払い/異議申立ての入口は残す。家の施錠・警報・電池安全を回収手段として止めない。通信回線停止はその通信契約と事業者の責任に従い、OSが任意に切断しない。
6. 入金確認・請求訂正後に権限を復旧する。支払済みと誤認して与信を増やさず、二重回収/二重返金を拒否する。
7. 長期未払いは契約/利用/請求/通知/異議/入金の証拠を保全し、人の審査と対象国で認められる回収手続きを経る。自動的に訴訟/差押えを実行しない。

「口座が止まるほど」は強い回収可能性を求める意図として記録する。RockstarOSに銀行口座凍結権を与える設計にはしない。日本では、銀行預金等の差押えは判決や仮執行宣言付支払督促等の債務名義に基づく裁判所の債権執行手続であり、利用規約への同意だけで口座全体を自由に停止できるという意味ではない。日本以外は対象国の専門家による別確認が必要。[裁判所の債権執行案内](https://www.courts.go.jp/saiban/syurui/syurui_minzi/minzi_25_08/index.html)（2026-10-15確認）。信用情報への登録や他口座への横断的制限も自動権限としない。

### 保存・受入・次の決定

既存のusage、予算予約、Wallet/請求storeとProvider参照を再利用する。契約version、支払同意reference、billing period/timezone、usage ID、invoice ID、明細revision、入金reference、通知履歴、異議、restriction reasonを本人別に保存。確定請求を直接上書きせず訂正記録で追跡する。

合格条件は、同一account複数Mini/ゲーム/Agentの集約、上限を超える同時実行拒否、月境界/遅延usage、重複/順序逆転通知、引落し失敗/結果不明、異議/訂正、制限後の入金復旧、解約後最終請求のsandbox往復。すべて追加の本番受入は未実施。対象国、B2C/B2B、請求/収納主体、料金単位、締日/支払日、猶予/再試行、与信/上限、収納Provider、回収委託先は未確定。既存買い切り決済やfixtureを月次後払いの完成へ換算しない。


## 2026-10-05 選択可能なeSIM提供形態の課金境界

最新の明示方針は、対応可能な端末・提供形態で選べるeSIM経由のRockstarOSクラウドOSと、そこでのSkyエージェント利用に対する従量課金。製品全体をこの方式へ一本化せず、eSIM不要のWeb/app、native OSの端末内LLM/offline agent、local/cloud併用を維持する。通信量販売を中心にせず、本人別の利用権・見積り・上限・承認・実行・停止・保存/再開・利用量・請求照合を一体の体験にする。具体的な責任、入出力、保存、失敗、復旧、承認、合格条件、料金の未決定事項は[共通設計](sim-led-product-architecture.md#2026-10-05-cloud-os-business-direction)を参照する。既存Tool/SDK/Walletを再利用し、端末内LLMとPixel/QEMUの受入は独立して保持する。これは設計変更であり、本番実行・課金や実機対応の完了ではない。


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

## 共通決済（2026-10-05）

利用者の明示指示により、共通化の主担当をWallet / Billing（BIL02、JOINT）とする。これはRockが販売と請求を管理し、カード処理・受取先本人確認・銀行入金をStripeへ委ねる構成。自社acquirerやcustodyの完成を意味しない。

### 目的・利用体験・責任

`/sky/payments`でTool/eSIM注文、CSV受付、直接LLMの計算済みusage、A2A usage、カード入金/返金状態を本人別に確認する。既存購入画面から入れる。商品注文・CSV受付は従来の本人確認/履行/返金APIへ戻り、直接LLMは明細確認→金額への明示承認→Hosted Checkout→本人による再照合または署名Webhookの順とする。再読み込みや決済の戻りURLは入金を確定しない。カード入力はStripeで行い、Rockへ保存しない。

Rockは金額・通貨・注文/実行ID・利用者・同一処理の結合、再送制御、秘密非表示、保存/復旧を担当する。Stripeは決済処理を担当する。eSIMは入口/利用権であり課金承認ではない。WebとeSIMで同じ実行IDを再利用しても請求受付は一つ。制限付きeSIM Cloud tokenへ決済権限を追加せず、本人アカウントへサインインして承認する。

### 共通実装と入出力

`shared/stripe.mjs`の単一transport/signatureをSky、CSV（skyStripe経由）、Mini販売Worker、Fashionで再利用する。Mini/Fashionの独立配布コピーは`npm run shared:sync`で生成し、`shared:check`で同一性を確認する。固定Stripe origin、15秒timeout、明示idempotency key、リダイレクト非追随、エラーの秘密非表示を共通化した。Workersで非対応の`redirect:error`を`manual`へ変更し、全非2xxを拒否する。独立Siteの履歴やStripe Customerを自動統合した意味ではない。同じ販売主体のmerchant設定とアカウント対応付けは別の運用受入が必要。

`GET /api/sky/payments/summary`は本人の直近記録だけを返す。`POST statement`は直接LLMの保存済みcompleted recordから料金を再計算し、source digest・項目別利用量・金額を返す。`POST checkout`はsourceId/digest/amountMinor/currencyを再照合する。owner・価格・eSIM claim・送金先をクライアント入力から採用しない。LLMの内部settled額は資金の入金ではなく原価計算であり、小売料金確定前のためこの回収経路はtest専用。JPY/USDの50最小通貨単位未満は勝手に最低額へ切り上げず停止する。他通貨や利用集約は未対応。

### 状態・保存・失敗・復旧

Migration `0060_sky_usage_payments.sql`は直接LLM実行を参照し、owner、source digest、金額、通貨、mode、Stripe session/intent、返金額を保存する。source+mode、session、intentをuniqueにし、元の金額/owner/参照/作成時刻はimmutable。状態はpending / paid / expired / partially_refunded / refunded / disputed。usage budgetのsettled値は回収時に再加算しない。A2Aは既存の署名usage→Wallet精算経路を表示し、追加カード回収へ流さない。将来別の回収方式を使う場合は資金予約・既払い状態・返金まで共通の排他契約が先に必要。

Checkout timeout時も同じ永続IDを使う。20時間を越えた結果不明の作成は再送せずStripe照合へ止める。署名Webhookから元のsource digestと注文条件を確認してsessionを復旧できる。通知の重複や順序逆転では、Stripe APIから現状を取得し、全額/部分返金と紛争を遅いpaid通知で戻さない。これらは[Stripeの冪等性仕様](https://docs.stripe.com/api/idempotent_requests)と[履行・通知の仕様](https://docs.stripe.com/payments/checkout/fulfill-orders)に基づく。

### 承認・合格条件・未決定

既存`SKY_*` merchant設定に加え、直接LLM回収は専用`SKY_USAGE_STRIPE_WEBHOOK_SECRET`と`SKY_USAGE_PAYMENTS_TEST_ENABLED=true`を使う。ただし`SKY_PAYMENTS_MODE=live`では環境変数を設定しても回収を503で拒否する。実行側の`remoteAiPricingGateAccepted()`も閉じたまま。Webhook pathは`/api/sky/payments/webhook`、対象はcheckout.session.completed / async_payment_succeeded / expired、charge.refunded / dispute.created / dispute.closed。ローカル設定だけで本番通知先を変更しない。

合格証拠は全migration上のowner分離、8並行一件受付、金額/通貨/送金先改変拒否、本文署名、応答消失の復旧、返金/紛争と遅延通知、20時間後の再送拒否、同じusage予算の二重精算拒否。実Provider請求、実受取先、運用の復旧、独立Siteのmerchant同一性、顧客の小売単価/利益/税/返金条件、funded Walletと実行前資金確保、A2A異種回収排他、本人desktop/Pixel操作の受入が残る。次担当はこれらを一つずつ確定し、同一公開artifactで受け入れてからlive gate変更をレビューする。

既存50円CSV受入は保持するが、この新しい経路の実課金試験は行っていない。新機能の公開・GitHub main統合は別状態で記録する。

## 本番受入までの逆算工程

指定した販売範囲で、本人の承認→資金確保→決済→商品提供/クラウド実行→明細→返金→銀行/Provider照合→障害復旧が同じ取引IDで完走した状態をPRODUCTIONと定義する。永久に欠陥ゼロという意味の「完全」は宣言しない。

2026-10-05 UTC。調査開始07:58、主要調査08:05まで。ユーザー指定の5分を目安に一次資料と対象コードを確認した範囲であり、網羅的な外部監査ではない。ローカルHEAD37c06cec＋未commit差分。観測main592daeea。通常verify成功、SPIDER repository security失敗、CodeQL再実行中。

AMCの意味は確認待ち。表示形式は暫定的に、工程・作業・到達点・合格条件のCanvasとして整理。ここに書いた前払方式、工数、pilot基準は提案であり、料金や本番解禁の確定指示ではない。

### 結論と順序

PRODUCTION ← 締め/入金/返金/復旧の運用受入 ← 上限付き限定実利用 ← 同一配備物の外部sandbox・実機受入 ← 提供/失効・照合/復旧実装 ← 共通本人/請求ID・実資金予約 ← 料金/契約/対象確定 ← 版固定

28項目は9工程にまとめた粗い見積で、ROCK側の実装・検証作業は合計24–41人日。1人で週5日なら約5–9稼働週相当。外部審査/契約/専門家確認/Provider回答/入金/請求周期と大きな不具合修正は含めない。所要日数の実測ではなく、今回の短時間調査に基づく仮説。G1確定後に再見積する。各項目への重複配賦はしていない。

同じ支払い画面・本人アカウントは共有する。自社商品、Connectの販売者商品、用途限定クラウド利用枠、通信Provider料金、既存A2A Walletは金銭責任を分けて照合する。共通化は汎用残高への混在を意味しない。

最初の3作業はG0/01の版固定、G1/04–06の料金と契約整理、G2/07の共通請求アカウント設計。G4の復旧骨格・試験設計は外部契約待ちの間に進められる。G3の小売実装は料金方式確定後、G5の実発行はProvider条件確定後に進める。

### 現在地（コード/保存証拠から）

- **共通transportと本人別明細 — 確認済み**: 前ターンの全体verify合格: Node882、Worker/D1 1133、CSV113。外部決済は合成Provider。 根拠: `docs/evidence/unified-payment-verification.json`。
- **クラウド本番実行/回収 — 未受入**: pricing gateはfalse、回収はtest-only。小売単価とfunded authorizationが未受入。 根拠: `lib/remote-ai-pricing-gate.ts / lib/sky-usage-payment.ts`。
- **全入口の注文・顧客統合 — 実装残**: Mini/Fashionはtransport共有まで。共通Customer、履歴の認可付き横断、合算請求は別作業。 根拠: `lib/sky-payments.ts / docs/sky-billing.md`。
- **自動復旧と紛争決着 — 実装残**: 新usage経路はWebhookと手動confirm。永続event inbox/定期scannerなし。disputedは固定、expiredからの再attemptなし。 根拠: `lib/sky-usage-payment.ts / drizzle/0060_sky_usage_payments.sql`。
- **少額請求と端数 — 設計残**: 実行ごとの原価を切上げる計算はあるが、請求周期単位の小売集約とは異なる。 根拠: `lib/remote-ai-text-pricing.ts:197`。
- **eSIMの注文応答消失 — 外部確認**: orderReferenceが保存できた後は読戻し可能。参照自体を失うとreconciliation_requiredで止まる。 根拠: `lib/esimgo-provider.ts / docs/workstreams/03-wallet-billing-providers.md`。
- **公開ドメインと本人認証 — 条件付き**: liveは.chatgpt.site＋dispatchを要求。独自domain対応には信頼境界の設計と試験が必要。 根拠: `lib/sky-payments.ts:35`。
- **新画面の本人操作と外部実取引 — 未検証**: 画面/読込/設定不足案内は確認済み。本人サインイン→Checkout→戻り→返金は未受入。 根拠: `docs/evidence/unified-payment-verification.json`。

### 詳細工程

#### G0 対象と検証する版を固定

担当: ROCK。依存: なし。仮工数: 1–2人日。到達点: 同じコードを試験・配備・監査する。

**01. ローカル変更をmainとの差分へ整理**
- 作業: 37c06cec上の決済/eSIM差分を分離して保存し、最新mainを取り込む。既存migration番号の衝突を確認する。 観測main 592daeeaの通常verify成功とSPIDER repository security失敗を別々に扱い、原因と影響範囲を解消/判定する。
- 合格証拠: commit SHA、変更一覧、migration整合、同一SHAのCI成功

**02. 販売対象と公開先を一覧化**
- 作業: Sky商品、CSV、eSIM、直接LLM、A2A、Mini/Fashionを分類。販売者、通貨、対象国、公開Site、顧客ID、精算先を明示する。
- 合格証拠: 各商品に責任者と対象環境があり、対象外を完了数へ入れない

**03. リリース判定を固定**
- 作業: ROCK_READY→PROVIDER_READY→INTEGRATED→LIMITED_LIVE→PRODUCTIONを既存BIL02の証拠に結ぶ。
- 合格証拠: 未受入項目がある範囲の本番gateは閉じたまま

#### G1 料金・販売者・資金負担を確定

担当: OWNER / JOINT。依存: G0。仮工数: 2–3人日＋契約待ち。到達点: 誰が何にいくら払うかが決まる。

**04. 小売料金表を確定**
- 作業: 商品代、通信料、OS月額、AI使用料、実費、無料枠、BYOKを分離。税・為替・丸め・最低請求額・返金条件を決める。Sky売上10%をクラウドへ自動流用しない。
- 合格証拠: 版付き販売料金表と同意文面。原価と小売価格を独立表示

**05. 請求方式を選ぶ**
- 作業: クラウドは用途限定の前払利用枠、または与信上限付きのまとめ請求を比較。前払案を推奨候補とするが、契約/地域条件確認前に採用しない。
- 合格証拠: 少額利用を集約する単位、締め、端数、未払い、失効/返金を確定

**06. 通信と販売責任を確定**
- 作業: 1GLOBAL優先候補・eSIM Go比較候補という既存調査を保持。通信Provider直接請求かRock再販か、利用国・期間・一次サポート・再販権を契約確認する。
- 合格証拠: 販売主体・通信責任・Provider条件の承認記録。審査日数は未確定

#### G2 本人・顧客・販売口座を接続

担当: ROCK / JOINT。依存: G0、G1。仮工数: 3–5人日＋アカウント審査。到達点: 一人の注文が全入口で追える。

**07. 共通請求アカウントを設計**
- 作業: 本人ID→販売主体→Stripe顧客→注文/利用IDを対応付ける。Mini/Fashion別Siteの注文は認可付き参照で統合し、メール一致だけで自動結合しない。
- 合格証拠: 別人の記録を見せず、同じ本人はWeb/eSIM/clientで同じ明細を読む

**08. 販売者口座を実確認**
- 作業: 自社売上とConnect販売者売上の経路を分け、KYC・charges/payouts・能力失効・売上10%・受取先をsandboxで読む。
- 合格証拠: 販売者停止中は販売拒否。正しい相手へ正しい純額が分配される

**09. 認証gatewayと公開ドメインを受入**
- 作業: 現在live APIは.chatgpt.siteとdispatchヘッダーを要求する。独自domainを使う場合は信頼gatewayを整備し、単にsuffix検査を外さない。eSIM cloud keyに決済権限を与えない。
- 合格証拠: 匿名、偽ヘッダー、別owner、失効tokenは拒否。本人再認証が成功

#### G3 実行前の資金確保とクラウド請求

担当: ROCK / JOINT。依存: G1、G2。仮工数: 5–8人日。到達点: 払える範囲だけ実行し、一度だけ精算。

**10. 小売見積を原価見積から独立**
- 作業: model・tier・キャッシュ・単価版・有効期限・入力digestを固定し、承認額に小売条件を結ぶ。現行原価のchargeMinorをそのまま売上にしない。
- 合格証拠: 表示額・承認額・請求額が一致し、改定が実行途中へ混入しない

**11. 実残高/与信と予約を原子的に結ぶ**
- 作業: 既存Wallet/親job予算を再利用。入金確認→利用可能→予約→実行→確定/解放を一つの資金権限で管理。A2Aと直接LLMの二重使用を防ぐ。
- 合格証拠: 同一残高から複数端末が競合しても上限超過ゼロ。未入金では送信ゼロ

**12. 少額の集約と月額更新**
- 作業: 保存済み高精度numerator/denominatorから請求期間へ集約し、丸め規則を定義。Stripe Meters/Credits採用なら別adapterと重複防止を追加。既存OS月額を維持し、更新/解約/支払失敗/再認証/適用期間を独立lineで扱う。
- 合格証拠: 1円未満・50円未満・期間跨ぎ・訂正・再送が一致。勝手な最低額切上げなし

**13. 停止・不明usage・返金を処理**
- 作業: 取消後の到着usage、応答消失、料金超過、Provider請求差異を保留する。支払い取消やchargeback後の未使用枠を失効し、使用済み損失の負担を記録する。
- 合格証拠: 結果不明を無料/成功へ変えない。既存A2Aをカードへ二重請求しない

#### G4 通知・再決済・返金の復旧を完成

担当: ROCK。依存: G2、G3の契約。仮工数: 3–5人日。到達点: 通知や通信が壊れても回収状態を復元。

**14. 通知の永続受付と定期照合**
- 作業: 署名検証後にevent ID/処理状態を永続化して再処理。外部APIを待たず安全に受付できる構成へ。未通知・未確定をschedulerで照合する。
- 合格証拠: 重複/逆順/数日停止/再起動でも二重計上ゼロ。処理待ちが監視される

**15. 失効決済と結果不明を区別**
- 作業: 現行20時間後の不明停止を維持し、Stripe照合後だけ再開。確実に未払いで期限切れのsessionは新attemptへ移せる契約を作る。
- 合格証拠: 旧attemptが後で成功しても一請求。解決担当と証拠が残る

**16. 返金・紛争の完了状態を作る**
- 作業: クラウド返金を実行する管理権限、部分返金/失敗/取消、dispute won/lostの決着を追記。現行disputed固定を直接paidへ書換えない。
- 合格証拠: カード返金・販売者送金戻し・手数料返金・利用権を各々照合

#### G5 購入後の提供と失効を商品別に完走

担当: JOINT / EXTERNAL。依存: G1、G2、G4。仮工数: 3–6人日＋Provider待ち。到達点: 支払った商品だけを一度提供。

**17. eSIM発行を実Providerで受入**
- 作業: validateと実transactionを分離。応答消失時にorderReferenceを回復できる永続client referenceまたはProvider冪等性を確認。未確認なら自動再送しない。
- 合格証拠: 同じ注文から二重仕入れなし。不明注文を正しいProfileへ一意に復旧

**18. eSIMからクラウド利用権へ接続**
- 作業: 支払→Profile配信→実端末導入proof→本人service access→cloud keyを別状態で保存。返品/期限切れ/端末交換/鍵再発行を検証する。
- 合格証拠: Pixel 10 GL066の同じ本人で導入/利用/失効。秘密QRをログへ残さない

**19. Tool・CSV・ハードウェアを受入**
- 作業: 外部Toolの提供者側認証/返金失効、CSV通常料金と50円試験の区別、物理商品は在庫/納期/配送/返品を接続する。
- 合格証拠: 各販売SKUで購入から提供・返金まで証拠あり。買えるだけを完成にしない

#### G6 同じ配備物で外部sandbox・実機試験

担当: JOINT。依存: G3、G4、対象商品のG5。仮工数: 3–5人日。到達点: mockを外しても一連の取引が成立。

**20. 実Stripe sandboxを接続**
- 作業: 別sandbox、専用webhook、固定API版、test/live分離、server-only鍵を設定。合成eventだけでなく実際にtest Checkoutを作って通知を受ける。
- 合格証拠: Stripe session/intent/chargeとRock行の実ID・金額・通貨が一致

**21. 失敗系を通す**
- 作業: 3DS成功/中断、残高不足、ブラウザ終了、二重クリック、復帰、Webhook重複/逆順、API timeout、返金失敗を試す。
- 合格証拠: 全シナリオの期待結果と実結果を同一buildで記録

**22. 利用と予算の端末間一致**
- 作業: PCとPixel、本人A/B、複数端末、圏外→再接続、料金改定、usage欠落、Provider再起動を試す。
- 合格証拠: 古い画面や他端末から支払/権限/上限を上書きできない

#### G7 入金・原価・復旧を運用へ接続

担当: ROCK / OWNER / JOINT。依存: G4、G6。仮工数: 2–4人日。到達点: 売上と実際の手残りが説明できる。

**23. 日次の多者照合**
- 作業: 注文/請求、Stripe charge/refund/fee/balance transaction/payout、銀行着金、LLM usage/invoice、通信卸明細を関連付ける。
- 合格証拠: 未説明差額ゼロ。端数/FX差は理由と担当を記録。10%売上手数料を純利益と呼ばない

**24. 監視と停止手順を実演**
- 作業: 長時間pending、不明注文、負残高、通知失敗、原価超過、鍵失効、Provider残高不足を検知。新規決済/実行を止めても照合と返金は動かす。
- 合格証拠: 通知先、当番、対応期限、停止/再開操作を実演。閾値はpilot前に確定

**25. 復元と秘密管理を受入**
- 作業: D1/R2・暗号鍵・監査記録を復元し、外部Stripe/Providerの後続取引を再照合する。鍵ローテーション、PCI自己評価等のアカウント要件、サポート、決済/認証境界の独立レビューを確認する。重大・高リスク未解決を残さない。
- 合格証拠: 復元後も再請求・再発行ゼロ。RPO/RTOは計測して承認し、DB復元だけで完了にしない

#### G8 限定実利用から本番判定へ

担当: OWNER / JOINT。依存: G0〜G7の対象gate。仮工数: 2–3人日＋入金/請求周期。到達点: 指定範囲のPRODUCTIONを宣言できる。

**26. 一つの代表商品で限定実利用**
- 作業: 対象owner、金額上限、SKU、Provider、期間を確定。受入済み版を配備し、購入→提供→利用→明細→返金の最小実取引を照合する。
- 合格証拠: 同一source/build/deploy IDの証拠。過去CSV50円を新経路の合格へ流用しない

**27. 締めと障害を観測**
- 作業: 少なくとも対象の実入金・Provider請求が閉じるまで観測。月額/まとめ請求は請求周期を受入。返金と復旧演習の未解決を解消する。
- 合格証拠: 二重請求・承認超過ゼロ、未説明差額ゼロ、重大未解決ゼロ

**28. 対象別に本番表示を解禁**
- 作業: Sky商品、eSIM、cloud、hardwareを個別に判定。未受入SKUやnative OSを一括で本番対応にしない。版更新時も同じgateを再適用する。
- 合格証拠: 運用責任者が証拠付き判定。一般公開後も監視・更新・再受入を継続

### 段階ごとの必要試験

各項目は環境（fixture / Provider sandbox / 実機 / limited live）、source/build/deploy ID、実行日時、秘匿した取引参照、期待結果、実結果、差額、未解決条件を記録する。合成データを実課金や実機受入の証拠にしない。

- **本人・承認**: A/B分離、偽gateway、eSIM keyから決済拒否、鍵失効、同一本人2端末。合格: 他人情報/無断承認なし。
- **金額**: 単価更新、通貨変更、quote期限切れ、1円未満、50円未満、税/端数、親予算競合。合格: 承認額を超えず、集約明細と総額一致。
- **送信・通知**: 8並行、timeout直後の再起動、同じ通知10回、逆順、通知数日停止。合格: 外部注文/請求は一件、復旧が同じIDへ収束。
- **決済**: 3DS成功/中断、拒否、ブラウザ終了、期限切れ、結果不明20時間超。合格: 未払を払済みにせず、安全な再開へ。
- **提供**: Stripe支払済み・eSIM仕入失敗、導入失敗、二重発行、Toolアクセス拒否。合格: 不提供を検出し返金/再提供へ。二重仕入れなし。
- **取消**: 全額/部分返金、返金失敗、売手口座停止、紛争勝敗、使用済みクラウド。合格: 資金・利用権・履歴が一貫。
- **復元**: D1復元、Worker/cron再起動、旧鍵/新鍵、圏外復帰、外部で先行した入金。合格: 再課金せず照合。RPO/RTOを計測。
- **経理**: 手数料、Connect分配、payout、銀行着金、通信卸・LLM請求。合格: 理由のない差額ゼロ。収益と入金を区別。

### OWNER側で確定する5項目

- **D1 最初に売る商品・国・通貨**: 対象SKU、販売者、対象国、JPY/USD、公開先。必要時期: G1前半。
- **D2 クラウド小売単価**: 原価、上乗せ、無料枠、税、端数、返金条件。必要時期: G3着手前。
- **D3 資金確保方式**: 用途限定前払か上限付きまとめ請求か。汎用Wallet転用をしない。必要時期: G3着手前。
- **D4 通信供給と請求主体**: 直接請求経路の有無、再販権、残高資金、支援窓口。必要時期: G5外部受入前。
- **D5 限定実取引の条件**: 本人、SKU、Provider、金額上限、期間、停止担当。必要時期: G8直前。

### コマンドと証拠の使い方

既存回帰: `node --experimental-strip-types --test tests/shared-stripe.test.mjs tests/sky-stripe.test.mjs tests/sky-commerce.test.mjs tests/csv-trial-payment.test.mjs tests/sky-usage-payment.test.mjs tests/sky-payment-worker.test.mjs`。eSIM固有試験は既存workstreamのコマンドを再利用。
各変更後に対象試験、`npm run typecheck`、`npm run design:check`。統合候補は `npm run verify`。`npm run sky:launch:check` と `node scripts/check-sky-launch.mjs --require-stage focused` は既存gateに従う。full verify成功は本番gate合格を意味しない。新しいfunding/集約/復旧の試験は実装と同時に追加する。
G6以降はCLIによる合成通知だけでは不足し、外部sandboxの実test注文/通知、実端末、配備先DBの読戻しを必要とする。Web/client課金の完成はPixel native OS全体の完成と分離し、OS image/正式署名/flash/全損復元は別の既存release gateで受け入れる。

### 一次資料（今回確認）

- [Stripe 最低決済額](https://docs.stripe.com/currencies#minimum-and-maximum-charge-amounts) — 最小額は決済/入金通貨に依存。JPY50・USD0.50の表があり、極少額usageの都度徴収には集約設計が必要。
- [Stripe Billing credits](https://docs.stripe.com/billing/subscriptions/usage-based/billing-credits) — 対象は所定のmetered subscription。単発Checkoutへの自動適用や第三者への支払い・汎用残高を前提にしない。
- [Stripe Webhooks](https://docs.stripe.com/webhooks) — 順序保証なし、重複あり、本番自動再送は最大3日。Rockの定期照合・復旧証拠が必要。
- [Stripe 冪等性](https://docs.stripe.com/api/idempotent_requests) — 冪等キーは少なくとも24時間経過後に削除され得る。長期の結果不明を単純再送しない。
- [Stripe Connect destination charges](https://docs.stripe.com/connect/destination-charges?platform=web&ui=stripe-hosted) — 決済手数料・返金・紛争はplatform残高へ影響。販売者送金戻しとapplication fee返金の照合が別途必要。
- [Stripe Billing試験](https://docs.stripe.com/billing/testing) — 実testオブジェクトからの通知と失敗系を検証。採用する場合はtest clocksで請求周期も確認。
- [Stripe 入金照合](https://docs.stripe.com/reports/payout-reconciliation) — カード決済成功と銀行着金は別。payoutと構成取引を突合する。
- [Stripe セキュリティ](https://docs.stripe.com/security/guide) — Hosted Checkoutでも自社側のPCI責任は残る。該当申告と構成を確認する。
- [Stripe 鍵管理](https://docs.stripe.com/keys-best-practices) — 秘密をserver側に限定し、最小権限・ローテーション・監査を運用する。
- [eSIM Go v2.5 orders](https://docs.esim-go.com/api/v2_5/operations/orders/post/) — 実注文の契約を確認。公開ページ内にidempotency記述は見つからず、非対応とは断定しない。Provider確認が必要。
- [eSIM Go install details](https://docs.esim-go.com/api/v2_5/operations/esimsassignments/get/) — referenceを使って既知注文の導入情報を取得。注文応答自体を失った場合の一意復旧とは別。
- [eSIM Go 本番受入](https://docs.esim-go.com/guides/going_live/) — 残高、鍵管理、実端末への配信、エラー処理、V3署名callbackを受入する。自動補充は予算承認なしに有効化しない。
- [Cloudflare D1 復元](https://developers.cloudflare.com/d1/reference/time-travel/) — DBの復元手段。外部決済まで過去へ戻るわけではなく、復元後の外部照合はRockの設計事項。

### 未確定・今回の作業範囲

契約アカウント・販売地域・実単価・予算は未確定。この調査では問い合わせ送信、契約、実注文、実課金、配備、main統合を行わない。前ターンの試験証拠を再掲し、今回新たなruntime合格とはしない。今後の実装許可と本番実取引の条件を混同しない。
