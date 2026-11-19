# 34 会社受注を 1 件、分配の計算まで通す

設計: docs/services/company-order.md、docs/sky-work-loop.md §3.2〜3.3。コード: lib/sky-company-order.ts（計算は実装済み・保存と画面は未実装）。

## やること

1. D1 に `sky_company_orders`（id, user_id, payload, revision, updated_at）を足す。lib/coconala-team-store.ts と同じ CAS 更新の書き方にする。migration は drizzle/ に置き、本番へは適用しない。
2. lib/sky-company-order-store.ts: 受注の作成、条件（AI可否・持ち出し可否・規約確認の記録）の保存、寄与の追加（寄与IDで冪等）、入金・返金の手入力記録。
3. app/api/sky/company-orders と app/sky の画面 1 枚: 受注一覧、実行先の判定、見積り確認、分配の内訳（作業料・配当・会社・予備）。
4. 最初の受注は会社の計算だけ（company_only）で通す。Compute Grid とはまだつながない。

## 変えないもの

- 応募・契約・入金確認・送金は自動化しない。現金の移動は本人。
- lib/coconala-team.ts（人へ再委託する案件の台帳）は別物として残す。
- 既存の earnings 天引き（lib/settlement.ts）と混ぜない。

## 合格条件

- 受注 1 件について、条件確認 → 見積り → 検収記録 → 入金記録 → 分配の内訳表示が画面で一周する。
- 分配の合計 ＝ 入金額（テストで差 0 を確認）。
- `node --experimental-strip-types --test tests/sky-company-order*.test.mjs`、`npm run billing:check`、`npm run typecheck` が通る。
