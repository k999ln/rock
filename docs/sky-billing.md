# Sky 自動化収益の8.88 USD精算

## 収益モデル

Skyは利用開始時にカードへ8.88 USDを請求しない。Skyの自動化が生み、外部の販売・決済Providerで入金まで確認できた収益だけを対象に、利用者ごと・UTC月ごとに次の順で精算する。

1. 検証済み自動化売上を計上する。
2. その売上に直接対応する外部Provider、API、モデル等の実費を回収する。
3. ToC分は実費後の残額からSky利用料を最大888 USD centsまで回収する。
4. 残額を利用者の払出し指図へ入れる。

式は `sky_fee = min(gross - operating_cost, 888 - fee_already_collected_this_month)`。売上0なら利用料0、実費後の残額が888 cents未満ならその範囲だけ、未達分の債務化・翌月繰越・カード請求はしない。ToBのSky利用料とSky売上手数料は0なので、`beneficiary_role=tob`のReceiptではSky利用料を計上しない。

## 信頼境界

ブラウザや利用者が売上額を自己申告するAPIではない。販売・決済Providerを照合する内部adapterだけが、次の証拠を持つEarning Receiptを送る。

- SkyのExecution Receipt ID
- Provider名と重複しない入金参照
- 利用者、ToC/ToB区分、払出し先参照
- USD cents整数の確定売上と直接実費
- 入金証拠のSHA-256
- 32 bytes以上の`SETTLEMENT_INGEST_SECRET`による、時刻付きraw body HMAC署名

単なるツール実行成功、成果物作成、手入力売上、未確定PaymentIntentは受け入れない。同じReceipt ID、Execution Receipt ID、Provider入金参照の再送は同一内容なら冪等に返し、異なる内容なら409で止める。

## 実装経路

独立Cloudflare Workerの`POST /v1/earnings`が署名付きReceiptを受ける。D1 migration `0002_earnings_settlement.sql`は以下を保存する。

- `earning_receipts`: 実行・Provider入金・証拠hash・金額の対応
- `monthly_earning_settlements`: 利用者/月ごとの売上、実費、Sky回収、分配額
- `earning_ledger_entries`: `AUTOMATION_REVENUE`、`OPERATING_COST`、`SKY_SERVICE_FEE`、`BENEFICIARY_PAYABLE`の追記型台帳
- `payout_instructions`: Provider adapterが残額を送るための一意な指図、5分lease、idempotency key、送金結果

Receiptの割当、月集計、台帳、払出し指図、適用済み印は一つのD1 batchで更新する。途中失敗で未適用Receiptが残った場合、同じ署名済みReceiptの再送で再開できる。`POST /v1/payouts/claim`はProvider adapterへ未処理の指図を5分leaseし、`POST /v1/payouts/result`は同じleaseで`paid`、`failed`、結果不明を記録する。adapterは再試行時も指図の同じidempotency keyを使う。`GET /v1/status`はSkyの短命ユーザーtokenとOriginを検証し、本人の当月集計だけを返す。

以前の`POST /v1/checkout`、`POST /v1/portal`、`POST /v1/webhooks/stripe`は410 `UPFRONT_BILLING_RETIRED`を返す。旧`0001_billing.sql`は移行履歴を壊さないため保持するが、新しい契約・請求を作らない。

## Provider adapterの接続条件

このWorkerは収益の検証・配分台帳であり、仕事を受注したり銀行送金を単独で行うものではない。実収益化には、各自動化商品について次のadapterを接続する。

1. 需要側から有償注文を受ける販売adapter
2. Execution Covenantに従って仕事を実行し、納品・承認を記録するadapter
3. 決済Providerの署名Webhookまたは公式照会で入金確定を確認するadapter
4. Execution Receiptと入金を一対一で照合してEarning Receiptへ署名するadapter
5. `payout_instructions`を同じidempotency keyで実送金し、成功・失敗を照合するadapter

販売主体、資金保管、本人確認、提供地域、税、返金、chargeback、最低払出額はProviderごとに確定する。Provider sandboxで入金、Webhook再送、順序逆転、返金、払出し失敗、再照合が合格し、所有者が本番資格情報と口座を確認するまで実入金・実払出しは有効化しない。

## 設定と検証

`services/sky-billing/wrangler.jsonc`へSkyの公開OriginとD1 IDを設定し、Git外のsecretとして次を登録する。

```sh
npx wrangler secret put BILLING_SHARED_SECRET --config services/sky-billing/wrangler.jsonc
npx wrangler secret put SETTLEMENT_INGEST_SECRET --config services/sky-billing/wrangler.jsonc
```

Sky側には同じ`BILLING_SHARED_SECRET`と`BILLING_SERVICE_URL`を設定する。Provider adapterだけに`SETTLEMENT_INGEST_SECRET`を渡し、ブラウザ、商品MCP、ログ、Gitへ出さない。

ローカルでは `node --experimental-strip-types --test tests/billing.test.mjs tests/billing-worker.test.mjs tests/settlement.test.mjs` で、署名、改ざん、低収益、月上限、ToB無料、Receipt再送、競合、本人別status、先払いAPI停止を確認する。Worker bundleは`npm run billing:check`、全体回帰は`npm run verify`で確認する。

2026-09-12のローカル受入では`npm run verify`を完走し、Web本体118 tests、Fashion Brand Ops 14 tests、仕事API 143 assertions、D1移行互換、Worker dry-run bundle、本番buildが成功した。実販売Provider、実決済、実口座、実払出しは未接続であり、この結果を収益・回収・送金実績とは扱わない。
