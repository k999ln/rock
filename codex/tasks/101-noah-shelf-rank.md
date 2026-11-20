# 101 実績の並びと、見せた記録（出した後）

仕様: **[docs/noah/spec-100-shelf.md](../../docs/noah/spec-100-shelf.md)** の 5・6・11 章。型と参照実装: docs/contracts/noah-shelf-v1.ts の `noahRate`・`noahCardScore`・`noahCardNumbers`・`rankNoahShelf`・`noahShelfBand`・`noahEvidenceFromRow`。DDL 案: `noah_package_evidence`・`noah_shelf_daily`・`noah_shelf_seen`。問い合わせ: `evidence_rollup`・`evidence`・`shown`・`seen`・`seen_hide`・`seen_of_owner`・`seen_forget`・`seen_forget_hidden`。先に 100 と 87（`noah_asks`）。

## やること

1. migration: 上の 3 表。
2. lib/noah-shelf-store.ts: `rollup()`（`evidence_rollup` を、`since = now - 90 日` で流す。1 日 1 回、巡回の合図の中）と、`list(viewer)` の `byEvidence`（切り替え `NOAH_SHELF_RANK`）。本人の点は、今の `scoreNoahRecommendation` に、カードの棚と領域をタグとして渡して作る。
3. 見せた記録（切り替え `NOAH_SHELF_SEEN`）: `GET /api/noah/shelf` の応答の後に `shown`、詳細を `from`・`pos` 付きで開いた時に `opened`。本人の行（`seen`）は、`noah_recommendation_settings.history_enabled` が真の本人だけ。
4. 「非表示」: `POST /api/noah/shelf`（`{ action: "hide", id, hidden }`。サインイン済みの本人）。
5. 履歴を消す・利用をやめる（今の `PUT /api/noah/recommendations` の `clearHistory` と `historyEnabled: false`）に、`seen_forget`・`seen_forget_hidden` を足す。
6. カードに数を出す（`noahCardNumbers`。5 人未満は「まだ数字はありません」）。試しに出したカードに「新しく入りました」。
7. lib/noah-timeline-feed.ts: カードを、種類の 1 つとしてタイムラインへ流す（出どころは「Noah の棚」）。

## 決めてある事（変えない）

- 学習したモデルと乱数を使わない。人気（回数そのもの）と売上を入れない。5 人未満の実績を使わない・出さない。
- 見せた記録に、本人の ID（同意した本人の行を除く）・位置そのもの・本文を置かない。
- 学習を足す条件は仕様書 11 章。この task では足さない。

## 合格条件

- 検証キットの並びの 4 群と、DDL の検証の「実績の数え直し」「見せた記録」が、tests/ で通る。
- 手元の DB に、仕様書 5 章の例の 2 枚（20 人・400 人）と、実績の無い 3 枚を入れると、棚が、試験と同じ順で出る。切り替えを閉じると、運営の順に戻る。
- 同意していない本人で棚を 10 回開いても、`noah_shelf_seen` に行ができない。履歴を消すと、その本人の行が消え、「非表示」だけが残る。
- `npm run typecheck`、`npm run lint:product`。
