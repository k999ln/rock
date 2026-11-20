# 104 300 人の試行（経路の札・段の判定・本人の報告）

仕様: **[docs/noah/trial-300.md](../../docs/noah/trial-300.md)**（これ 1 本で足りる）。型と参照実装: docs/contracts/noah-shelf-v1.ts の `NOAH_TRIAL`・`noahTrialGate`・`noahTrialReach`・`noahEarnEstimate`・`noahTrialVia`。DDL 案: `noah_trial_channels`・`noah_trial_entries`・`noah_trial_reports`。問い合わせ: `trial_totals`・`trial_funnel`・`trial_earn`。先に 100 と 97（運営の画面）。

## やること

1. migration: 上の 3 表。lib/noah-trial.ts へ、参照実装を移す。
2. 入口: `/noah/ready` と、カードの詳細が `?via=` を読む。`noahTrialVia` を通った札だけを `sessionStorage` に持ち、サインインの後に `noah_trial_entries` へ 1 行（`INSERT OR IGNORE`。もう行がある本人には書かない）。段は、その札の段。
3. components/noah-review.tsx の「試行」の節: 今の段、`trial_totals` の 4 つの数と 3 つの割合、`noahTrialGate` の足りない条件、`trial_funnel`、`trial_earn`。経路の札を足す・閉じる（`POST /api/noah/trial`。審査者だけ）。
4. 本人の報告: 「稼ぐ・仕事を省く」の棚のカードで、成果まで行った本人の、カードの詳細の下に、4 つの欄（出品した／していない・売れた件数・手取り・掛けた分）。`POST /api/noah/trial`（`{ action: "report", … }`。同じ本人・同じカードは上書き）。
5. 公開: 5 人以上が報告したカードの合計を、カードの詳細に出す（「報告した 12 人のうち、出品した 7 人・売れた 3 人。1 件の手取りの平均 ¥2,600・掛けた分の平均 35 分」）。

## 決めてある事（変えない）

- 金額を約束しない。出すのは、測った合計だけ（5 人以上）。報告は任意で、しなくてもカードは同じように使える。
- 経路の札は、運営が登録した物だけ。入口は、本人 1 人につき 1 行。5 人未満の経路の数を、画面に出さない。
- 段の人数と割合（30・100・300、9 割・5 割・2 割）は候補。変えるのは本人。
- 切り替え `NOAH_TRIAL_OPEN` は閉じたまま入れる。投稿・動画・人への連絡は、この task では行わない（本人が行う）。

## 合格条件

- 検証キットの「300 人の試行」と、DDL の検証の「300 人の試行」が、tests/ で通る。
- 手元で、札を 2 つ登録し、7 人を入れる（6 人と 1 人）と、運営の画面に、6 人の経路だけが出る。知らない札の付いたリンクでは、行ができない。
- 段 1 の条件を満たす数を入れると「段 1 を終えました」、また使う人を減らすと、段 2 で「また使う割合が足りません」と出る。
- `npm run typecheck`、`npm run lint:product`。本番への migration と切り替えは行わない。
