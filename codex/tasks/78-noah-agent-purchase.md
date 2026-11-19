# 78 Agent の売り買い（試用・つながってから払う・直した版の権利）

設計: docs/noah-agent-market-design.md §4.8、docs/services/noah-agent-purchase.md。先に 73・74。

## 最初に確かめること

Stripe の sandbox で、分配付き（destination charge）の後確定が通るか。通らない時は、支払い → 接続の確認 → 失敗なら自動で全額返金、の順にする。sandbox の受入は本人の Stripe アカウントが要る。

## やること

1. `/api/noah/launch` の公開一覧に、有料の公開版を出す。主ボタンは接続計画の entitlement の段から決める。
2. 販売条件に `trialRuns` と `updates` を足す。既存の条件は `trialRuns=0`・`updates=this_version` として読む。migration は drizzle/ に置き、本番へは適用しない。
3. 利用権の判定を、`updates=family` の注文が同じ系列の審査済みの新しい版にも効くようにする（`authorizedNoahRelease`）。
4. 仮売上 → 接続の確認 → 確定、または取消。同じ注文 ID で冪等。
5. 本人の同意の上で支払い方法を Stripe に保存し、2 回目から 1 タップにする。
6. 作者の受取先の登録を、価格を 1 円以上にした時だけ求める。

## 変えないもの

- 手数料率（`lib/sky-marketplace-policy.ts`）、最低価格、JPY、返金と紛争の処理、test / live の分離。
- 価格・宛先・手数料はサーバーが決める。戻り URL で支払い済みにしない。
- 提供者サーバー型の有料 Agent は、task 82 の利用権の受け渡しが入るまで売らない。

## 合格条件

- 接続の確認が通らない注文は確定されない。通った注文だけ確定され、分配の額が既存の計算と一致する（差 0）。
- 更新を含む条件で買った本人が、直した版を追加の支払い無しで使える。この版のみの条件では使えない。
- 返金の後、全部の版で新しい実行が拒否される。
- tests/noah-agent-purchase.test.mjs、`npm run billing:check`、`npm run typecheck`。
