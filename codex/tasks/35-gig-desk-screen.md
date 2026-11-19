# 35 参加者の画面（受取額・確認の問い）と保存

設計: docs/services/gig-desk.md、docs/work-loop.md §7。コード: lib/sky-gig-desk.ts（判定・下書き・割当は実装済み。画面と保存は未実装）。task 34（会社受注の保存）の後に行う。

## やること

1. 参加者の画面を1枚作る: 今月の受取額（作業料・配当の内訳、確定と未確定を分ける）、自分に来ている確認の問い、答える操作。依頼者の名前・募集の本文は出さない。入口は Telegram の bot からのリンクでよい。
2. 受注ごとに確認の問いを作り（`planJudgmentTasks`）、配り（`assignJudgmentTasks`）、答えをまとめる（`resolveJudgments`）。寄与を task 34 の受注に足す。
3. 運営の画面: 今日の lane の決定（応募した・しなかった理由・持ち越し）、型ごとの提案数と採用数、問いの割当の偏り、割れた問い。
4. 売れる型（GigOffer）と方針（GigDeskPolicy）を D1 に保存する。初期値は lib/sky-gig-offers.ts と COCONALA_DESK_POLICY。

## 変えないもの

- lib/sky-gig-desk.ts にサイトへ接続するコードを足さない（tests/sky-gig-desk.test.mjs がソースを検査している）。
- 資料を会社の外へ出す承諾が無い受注は、会社の管理下の人にだけ配る。
- 受取額は入金の記録から計算したものだけを表示する。見込み額を受取額として見せない。

## 合格条件

- 受注 → 問いの割当 → 参加者が答える → 集計 → 寄与 → 受取額の表示、が画面で一周する。
- `node --experimental-strip-types --test tests/sky-gig-desk.test.mjs tests/sky-company-order.test.mjs`、`npm run sky:check`、`npm run typecheck` が通る。
