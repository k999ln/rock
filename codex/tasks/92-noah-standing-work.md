# 92 継続して任せる（予定を account に置く）

設計: docs/noah-design.md §4.4、docs/services/noah-background-operation.md、docs/services/noah-agent-operations.md。先に 74・84。

## やること

1. 予定（時刻、または他の Agent の成果を起点）を account 側に保存する。今の Mac のローカルの計画（`lib/noah-operations.ts`、`scripts/noah-general-operations.mjs`）と同じ意味にする。
2. 予定が来たら Noah が Work を作る。専用の端末（今は本人の Mac）が取りに来る。端末が止まっている間は待ちにし、黙って別の置き場所へ回さない。
3. 始める前に 1 回、回数・期間・金額の上限を確かめる。初期値は今の計画（最大 24 時間・100 回・同時 1 件）。上限で止まる。
4. まとめて知らせる。毎回は鳴らさない。失敗が 3 回（候補）続いたら止めて知らせる。
5. 止める・再開は 1 タップ。手元（スマホ）からできる。

## 変えないもの

- 「依頼と上限の確認後に開始する」。更新による自動実行 0（既存の合格条件）。
- 画面・入力・clipboard・本人の browser session を Agent へ渡さない。常駐する Agent を雲で受けない。

## 合格条件

- 画面を閉じ、Web の tab も閉じた状態で、予定の 3 回が実行され、成果が Work に残る。
- 上限の回数・金額に達した時に止まり、通知が 1 回届く。
- Mac を止めている間の予定は待ちになり、戻した時に重複して走らない。
- tests/noah-standing-work.test.mjs、`npm run typecheck`、`npm run lint:product`。
