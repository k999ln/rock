# Sky CSV・50円の決済試験

2026-10-01、利用者の指示で実際に50円を払う試験を準備。通常の3,000円受付とは別に、指定サンプルCSV専用の見積りとStripe Hosted Checkoutを追加した。

Apple PayはStripe Checkoutのcard方式に含まれ、対応環境とWallet設定でStripe側が表示を判定する。50円はJPYのzero-decimal amount=50として送る。CSVの既存内部quoteは1円の百分の一単位なので、試験quote=5000をサーバーで固定し、通常quote=300000と混同しない。実Apple Pay表示・決済はまだ未受入。

## 本番接続

Skyの非公開runtime設定へ次を登録する。秘密はチャット、Git、ブラウザ配信bundleへ保存しない。

- `SKY_PAYMENTS_MODE=live`
- `SKY_STRIPE_SECRET_KEY`: 本人のStripe本番キー。サーバーのみで使用するsecret。
- `SKY_PAYMENT_ORIGIN=https://sky-marketplace.noellesugar1.chatgpt.site`
- `SKY_CSV_STRIPE_WEBHOOK_SECRET`: CSV専用送信先の署名secret。

Stripeの本番イベント送信先は `https://sky-marketplace.noellesugar1.chatgpt.site/api/csv-jobs/payment-webhook`。対象は `checkout.session.completed` と `checkout.session.async_payment_succeeded`。既存Sky Market商品購入の `SKY_STRIPE_WEBHOOK_SECRET` と送信先は別である。本番キーとこの送信先の署名secretが揃うまで50円ボタンを無効化する。設定後は公開版を再配備して適用する。

## 利用と判定

1. Skyへ本人サインインし、CSV画面で「50円試験の見積りを作る」を選ぶ。
2. 保存された受付で「50円を支払う」を選ぶ。Stripe画面の金額と購入条件を確認し、本人がApple Payまたはカードで支払う。
3. Skyへ戻り「支払いを確認して開始」を選ぶ。Webhookでも同じ確認を行う。
4. サーバーは永続化したSessionをStripeから再取得し、受付ID、Session ID、目的、JPY50、live/test、PaymentIntentの成功と受領額、Chargeの関連・返金・紛争を照合してから開始する。ブラウザの戻りURLや自己申告を支払い証拠にしない。
5. CSV検査合格、成果物ダウンロード、再読込後の復元、本人分離を確認する。

同じ受付・modeのSessionは永続化して再利用し、作成のidempotency keyを固定する。結果不明の作成から20時間を超えたら自動再作成を止める。支払後の受付を削除すると自動納品できないため、照合・納品確認前に削除しない。返金は現在Stripeで運用者が確認・実行し、Sky内からの自動返金はない。

## 検証

支払い条件・JPY単位・本人分離・未払い・金額不一致・返金・紛争・通知署名・環境不一致・冪等性・未設定拒否を含む関連82試験がローカルfixtureで合格。型検査とlint合格。実StripeのApple Pay、本番Webhook到達、本番支払い・納品は未受入。Stripeログインと本番接続を本人と進める。

参考: [Stripe Apple Pay](https://docs.stripe.com/apple-pay)、[JPYと最小決済額](https://docs.stripe.com/currencies)。


2026-10-01追加受入: 公開Sky v8（632ac3eb…）でPixel本人ログイン、サンプルCSV処理、検査合格・納品可能の表示、サーバー再読込後の同受付復元を確認。result.csv 0.09KBの既存ダウンロード確認がブラウザに出た。CSVバイト/hash、別本人隔離、削除は未受入。50円試験の入口は公開済みだが、本番キー・CSV署名secretが未登録で無効。Stripe本番有効化は本人情報確認の途中で本人作業待ち。


Stripe最新readback: 本番ダッシュボードへ到達したが支払いが一時停止。追加情報タスクはセキュリティ対策措置状況申告書で、担当者の本人確認書類タスクも残る。申告の実施者・実施済み対策は本人が確認し提出する。フォームを本人操作用に残し、未確認の対策や本人情報は代理入力していない。Sky非公開設定には本番API keyとCSV専用署名secretが未登録。実課金は未実施。
