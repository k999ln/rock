# 会社の窓口（gig-desk）

- 本人が言う一言: 「この募集、うちで受けられる？」／参加者は「確認の仕事ある？」
- Goal（Eveが作る）: 目的＝窓口のアカウント1つで募集に応募し、受注した仕事の確認を参加者へ配る / 入力＝lane runner が読んだ募集（snapshot）、売れる仕事の型、参加者の一覧 / 期待成果＝応募する・しないの決定、額と納品日、提案文、確認の問いの割当、作業料の寄与 / 予算上限＝1回の巡回の応募数（lane 側、最大7）と1日の提案数（初期値30）/ 要る権限＝snapshot の読み取り。サイトの操作は lane runner が持つ。
- Noaがつなぐもの: lib/sky-gig-desk.ts、lib/sky-gig-offers.ts、lib/sky-device-tiers.ts、lib/sky-recipe-planner.ts、lib/sky-company-order.ts。手は上流の gig の4 lane（apply / reply / paid / storefront）。実行例は `node --experimental-strip-types scripts/sky-gig-desk.mjs desk.json --lane snapshot.json`。
- AMCの工程:
  1. 読む（担当: lane runner → Noa）— 合格条件: `postingFromLaneDetail` が snapshot の募集を読める。本人が貼った文面は `parseCoconalaPosting`。
  2. 決める（担当: AMC）— 合格条件: `triageGig` が propose か、理由つきの skip を返す。AI不可の募集、予算・納期・応募人数が合わない募集、作る工程が無い募集は skip。
  3. 選ぶ（担当: AMC）— 合格条件: `decideLanePass` の submit_required が1回の上限・1日の上限以内で、応募済み・受付終了の募集を含まない。得にならない募集は禁止にせず持ち越す。
  4. 提案文（担当: Eve）— 合格条件: 額・納品日・納品物・AIを使うこと・人が確認することが文面にある。200〜3000文字。
  5. 送信（担当: lane runner。`policy.submission` が owner の時は本人）— 合格条件: 送信は1回だけ。公式画面で読み戻して記録する（lane 側の effect の照合）。
  6. 受注後の確認を配る（担当: AMC）— 合格条件: 1つの問いを同じ人に二度渡さない。資料を外へ出せない受注は会社の管理下の人だけ。
  7. 答えをまとめる（担当: Jev）— 合格条件: 過半数がそろった問いだけ結論。割れた問いは会社の人へ。
- Jevの合格条件: 提案額 ≥ 型の最低額、`checkOrderQuote.acceptable === true`、寄与IDの重複 0、割当外・二度目の答えを数えていない。
- 出力先: スマホ・Pro の画面（今日出す提案、見送った理由、参加者には自分の問いだけ）。
- Wallet: 販売先の手数料（ココナラの通常の販売手数料 22% 税込を初期値）/ 作業料＝確認1件 × 単価、多数側の答えに払う / 分配は company-order と同じ台帳。
- hardware profile 依存: phone でも可。全部。
- 失敗時: 割れた問いは会社の担当者が見る。人数が足りない問いは short として表示。採用されない型は採用率が下がり、得にならなくなった時点で提案が止まる。
- 記録: Receipt に、募集ID、判定と理由、提案額、送信の記録、問いID・答えた人・結論。募集の本文と依頼者の名前は残さない。
- 変えない境界: 窓口のアカウントは1つ。参加者の個人アカウントは操作しない。出品代行はしない。lib/sky-gig-desk.ts からサイトへ直接つながない（手は lane runner）。規約の該当条は [sky-work-loop.md §7.2](../sky-work-loop.md)。
- 未実装: lane runner との実接続（[task 36](../../codex/tasks/36-mr-gig-upstream-sync.md)、[task 37](../../codex/tasks/37-lane-runner-bridge.md)）、参加者の画面と保存（[task 35](../../codex/tasks/35-gig-desk-screen.md)）、参加者の端末へ問い・計算を届ける経路。
