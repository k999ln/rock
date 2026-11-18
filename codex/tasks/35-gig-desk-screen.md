# 35 会社の窓口（gig-desk）の画面と保存

設計: docs/services/gig-desk.md、docs/sky-work-loop.md §7。コード: lib/sky-gig-desk.ts（判定・下書き・割当は実装済み。画面と保存は未実装）。task 34（会社受注の保存）の後に行う。

## やること

1. /sky/tools/coconala に「募集を貼る」欄を足す。貼った文面を `parseCoconalaPosting` → `triageGig` → `selectProposals` → `draftProposal` に通し、今日出す提案・見送った理由・下書きを表示する。下書きは複写ボタンと、募集ページを開くリンクだけ。送信ボタンは作らない。
2. 会社が売れる仕事の型（GigOffer）と方針（GigDeskPolicy）を D1 に保存する。型ごとの提案数・採用数（ProposalRecord）を、本人が「送った」「採用された」を押した時に更新する。
3. 受注後、確認の問いを作り（`planJudgmentTasks`）、参加者へ配る（`assignJudgmentTasks`）。参加者の画面は自分の問いだけを表示し、依頼者の名前・募集の本文は出さない。
4. 答えを `resolveJudgments` でまとめ、寄与を task 34 の受注に足す。

## 変えないもの

- ココナラへ接続するコード（fetch・ブラウザ自動操作）を足さない。tests/sky-gig-desk.test.mjs がソースを検査している。
- 送信・契約・納品・出品の変更は本人。
- 資料を会社の外へ出す承諾（dataMayLeaveCompany）が無い受注は、会社の管理下の人にだけ配る。

## 合格条件

- 貼る → 判定 → 下書きの複写 → 「送った」記録 → 「採用」記録 → 問いの割当 → 答えの集計 → 寄与、が画面で一周する。
- `node --experimental-strip-types --test tests/sky-gig-desk.test.mjs tests/sky-company-order.test.mjs`、`npm run sky:check`、`npm run typecheck` が通る。
