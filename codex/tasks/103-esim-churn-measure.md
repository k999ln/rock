# 103 離脱率を測る — eSIM つきとカードだけを、同じ値段・同じ機能で比べる

本人の仮説（2026-11-21 22:31）: 「データでも eSIM は、アプリに比べて離脱率が低いはず」。測り方は 22:54 に決定（[07](../../docs/structure/07-decisions-from-minutes.md)、[03 の 0.3.3](../../docs/structure/03-esim.md)）。

## 決めてある事（変えない）

- 2 つの組: `esim`（eSIM つき）と `card`（カードだけ。PWA）。値段・機能は同じ。請求はどちらもカード。
- 組は Stripe の price で分ける（同じ額の別の price）。対応は環境変数 `CHURN_ARMS`（例 `{"price_A":"esim","price_B":"card"}`）。
- 集計は `lib/churn-cohort.ts`（実装済み・試験済み）:
  - 月ごとの解約率 ＝ 解約の数 ÷ 結果が出た月の数（1 か月の支払いを 1 回の試行と数える。続いている人の今の月は、まだ結果が出ていないので数えない）。
  - 3 か月の継続 ＝ 始めてから 3 か月以上たった人のうち、3 回以上払った人の割合。
  - どちらも Wilson の 95% の幅を付ける。
  - 判定は 4 つ: `insufficient`（どちらかの組の試行が 100 未満）、`esim_lower`（eSIM の解約率の幅が、カードの幅より全部下）、`card_lower`（その逆）、`unclear`（幅が重なる）。
- 人数が 5 人未満の組は、数を画面に出さない（task 114 と同じ）。

## やること

1. **元の数を引く。** `services/sky-billing` の `billing_subscriptions` と `billing_invoices` から、契約ごとに `{ arm, startedAt（最初に払った時刻）, periodsPaid（払った回数）, endedAt（解約が効いた時刻。続いていれば null） }` を作る関数を書く。price が `CHURN_ARMS` に無い契約は数えない。
2. **運営の画面。** Noah の運営の画面（task 114 の「試行」の節の隣）に、2 つの組の数・解約率と幅・3 か月の継続と幅・判定を出す。1 人ずつの行は出さない。
3. **始める手順を書く。** Stripe の test mode で同じ額の price を 2 つ作り、`/connect` で組ごとの price を使う手順を、この task に書く。本番の price を作るのは本人の許可の後。

## 合格条件

- `tests/churn-cohort.test.mjs` が通る（実装済み）。
- 試験用の D1 に、2 つの組の契約と請求の行を入れると、運営の画面の数が `cohortChurn` の結果と一致する。
- `CHURN_ARMS` に無い price の契約は、どちらの組にも入らない。
- 5 人未満の組の数が、画面に出ない。
- `npm run typecheck`・`npm run lint:product`。

## やらないこと

- 本番の Stripe の price の作成・切り替え。広告・案内の文の変更。判定の結果で値段や機能を自動で変えること。

## Stripe test mode で始める手順

1. Stripe Dashboard で test mode に切り替える。試験用の商品に、**同じ金額・通貨・毎月請求**の price を 2 つ用意する。機能、割引、試用期間などの条件をそろえ、どちらもカード払いにする。別々の `price_…` を控える。 [Stripe のテスト環境](https://docs.stripe.com/test-mode) · [Products と Prices](https://docs.stripe.com/products-prices/manage-prices)
2. test mode の Payment Link を組ごとに作り、eSIM つきには一方の price、カードだけ（PWA）にはもう一方の price を固定する。決済後のリダイレクト先を試験サイトの `/connect` に設定する。テスターが試験サイトの `/connect` でサインインした後、運営から割り当てた組のリンクを渡す。テストカードで支払い、`/connect` に戻ることを確認する。1 人につき 1 組・1 契約で試す。端末への実回線発行や公開の案内変更は不要。 [Payment Links](https://docs.stripe.com/payment-links/create) · [決済後の遷移](https://docs.stripe.com/payment-links/post-payment) · [テストカード](https://docs.stripe.com/testing)
3. 試験用 Worker の `CHURN_ARMS` に `{"price_A":"esim","price_B":"card"}` の形式で手順 1 の ID を設定する。`BILLING_CHURN_SHARED_SECRET` は 32 文字以上の専用値を Worker と試験サイトの両方に設定する。試験サイトの `BILLING_SERVICE_URL` をその Worker に、`NOAH_REVIEWER_USER_IDS` を審査者の ID に設定する。
4. ローカルの試験 D1 には `npx wrangler d1 migrations apply DB --local --config services/sky-billing/wrangler.jsonc --persist-to work/churn-d1` で migration を適用する。Worker も同じ `--persist-to work/churn-d1` を指定して起動する。現在の `/connect` は購入済み利用権を登録する画面で、旧 Stripe 購読 Checkout と Webhook は停止済み。Stripe test mode の契約・請求を確認した後、試験用の行をこの D1 に手動で投入する。

   - `billing_subscriptions` に契約 ID、試験用の利用者 ID、customer ID、割り当てた price ID、最新の状態を入れる。解約が効いた契約の `ended_at` には Stripe Subscription の `ended_at` を Unix 秒で入れる。解約予約中は未解約として扱う。旧データで `ended_at` が空の場合は、`canceled` を記録した Stripe イベントの時刻を代用する。
   - `billing_invoices` に同じ契約 ID・利用者 ID と、実際に支払われた月次の請求を 1 回に 1 行で入れる。`stripe_invoice_id` は重複させず、`paid_at` は Unix 秒、`amount_paid` は最小通貨単位で入力する。臨時請求や日割り調整はこの試験データから外す。
5. 審査者として `/noah/review` を開き、「試行」の隣の「eSIM の離脱率」で、2 組の契約数、月ごとの解約率と 3 か月の継続率、その 95% 信頼区間を照合する。未登録の price が入らず、利用者が 5 人に満たない組では数が出ないことを確認する。表示の件数は契約単位。匿名化の表示条件は組ごとの異なる利用者 ID で判定する。

自動の組割り当て、`/connect` から Stripe への自動遷移、Stripe から D1 への自動取込は試験開始前の別作業。現在の照合は test mode の手順と試験 D1 の集計を対象とする。
