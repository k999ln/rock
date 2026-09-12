# Sky 月額8.88 USDの実決済

## 実装した境界

Sky本体のホストへカード処理を載せず、独立したCloudflare WorkerからStripe Checkoutを開く。Skyは認証済みユーザーへ5分だけ有効な署名トークンを発行し、課金Workerはトークン、SkyのOrigin、StripeのWebhook署名をすべて検証する。

1. Skyの`/wallet`が`POST /api/billing/token`を呼ぶ。
2. Sitesの認証済みユーザーIDを含む短命HS256トークンを返す。
3. ブラウザが課金Workerの`POST /v1/checkout`を呼ぶ。
4. WorkerはStripeに登録された価格が`USD 888 cents / month`か毎回検査し、Stripe Checkoutへ移動する。
5. `checkout.session.completed`、`invoice.paid`、`invoice.payment_failed`、subscription更新/解約の署名WebhookだけをD1台帳へ反映する。
6. 同じユーザーの有効契約と同時Checkoutを拒否し、Stripeの30分下限へ通信余白を加えた31分でCheckoutとDB lockの期限を揃える。作成結果が不明なら即時再申込みを許さず、Stripeのidempotency keyとWebhook event IDで再送を重複させない。
7. 支払方法変更と解約はStripe Customer Portalで行う。

カード番号、Stripe秘密鍵、Webhook秘密はSkyの画面・DB・Gitに保存しない。Skyの手入力売上台帳と月額課金台帳も混ぜない。

## 最初のsandbox接続

1. Stripeのテストモードで商品と、`8.88 USD`、月次、数量1のPriceを作る。Price IDを控える。
2. Cloudflareで`rockstar-sky-billing`用D1を作り、返されたdatabase IDを`services/sky-billing/wrangler.jsonc`へ設定する。
3. 同ファイルの`SKY_ORIGIN`、`RETURN_ORIGIN`、`STRIPE_PRICE_ID`を設定する。
4. 32byte以上のランダムな`BILLING_SHARED_SECRET`を作り、Skyのホスティング環境と課金Workerの両方へ同じ値をsecretとして設定する。
5. 課金Workerへ`STRIPE_SECRET_KEY`、`STRIPE_WEBHOOK_SECRET`もsecretとして設定する。実値を`.dev.vars`やGitへ保存しない。
6. `npm run billing:migrate`、`npm run billing:deploy`の順に実行する。
7. Stripe Workbenchで`https://<billing-worker>/v1/webhooks/stripe`をWebhook endpointにし、上記6種類のeventを購読する。
8. Skyのホスティング環境へ`BILLING_SERVICE_URL=https://<billing-worker>`を設定する。
9. Stripeテストカードで初回決済、翌月更新、失敗、再試行、解約、同時二重申込みを確認する。

ローカルの価格・token・署名・event shapeテスト、D1 migration、Worker bundleは `npm run verify` に含まれる。Stripe Test Clockまたはテスト用subscriptionで翌月更新を起こし、Webhookの再送・順序逆転、Checkout応答timeout後の31分lock、Customer Portal解約、Stripe請求とD1台帳の一致を実アカウントのtest modeで別途受け入れる。

Worker secretsは次の形で入力する。

```sh
npx wrangler secret put BILLING_SHARED_SECRET --config services/sky-billing/wrangler.jsonc
npx wrangler secret put STRIPE_SECRET_KEY --config services/sky-billing/wrangler.jsonc
npx wrangler secret put STRIPE_WEBHOOK_SECRET --config services/sky-billing/wrangler.jsonc
```

## 本番へ切り替える前の条件

- Stripeアカウントの事業者確認、入金口座、提供国・通貨を確定する。
- 利用規約、プライバシー表示、解約、返金、税表示、問い合わせ先を実際の販売主体に合わせる。
- sandboxのWebhook再送と順序逆転を合格させ、Stripe上の請求とD1台帳を照合する。
- `sk_live_`とlive Priceを設定した後、所有者本人が総額、受取口座、手数料、税設定を確認してから最小額の本番受入を行う。

この実装の`$8.88`は税や値引前の月額基本料金である。課税設定による顧客の最終請求額、Stripe手数料、返金、税、為替後の受取額と純利益は別であり、8.88 USDの純利益を保証しない。
