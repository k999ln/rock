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
