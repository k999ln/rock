# 103 つなげる数を、料金ごとにする（出した後）

仕様: **[docs/noah/spec-100-shelf.md](../../docs/noah/spec-100-shelf.md)** の 8 章。型と参照実装: docs/contracts/noah-shelf-v1.ts の `NOAH_PLAN_CARDS`・`noahLiveCards`・`noahPlanConnectGate`。DDL 案: `noah_package_connections`。問い合わせ: `live_cards`。先に 74（`noah_connections` と、つなぐ前の上限）と 100。

本人の決定（2026-11-20）: 無料でも基本は使えて、5〜6 個つなげる。課金すると、もっとつなげる。値段は未定。

## やること

1. migration: `noah_package_connections`。カードの中でつないだ接続に、1 行を足す（lib/noah-connect.ts が、接続の行と同じ transaction で書く）。
2. lib/noah-connect.ts: つなぐ前の上限を、切り替え `NOAH_PLAN_LIMITS` が開いている時だけ `noahPlanConnectGate` に替える。数は `live_cards`。閉じている間は、今の `noahConnectGate`（全員 50）のまま。
3. 料金の読み方: 本人の利用権から `free`・`paid` を決める関数を 1 つ（lib/noah-plan.ts）。今の月額の利用権の読み方に合わせる。どの利用権を `paid` と見るかは、本人が決めるまで「全員 free」に倒さず、**切り替えを閉じたまま**にする。
4. 画面: 「つながっているもの」の見出しに「6 個のうち 4 個」。上限の時の文は仕様書 8 章。

## 決めてある事（変えない）

- 数えるのはカード。同じカードの中の接続は 1。直近 60 秒・24 時間の上限は、料金で変えない。
- 値段・月額に含めるか・新しい課金の型は、この task で決めない（既存の月額の型から、本人が選ぶ）。
- もうつないである物を、上限を理由に切らない（上限は、新しくつなぐ時にだけ見る）。

## 合格条件

- 検証キットの「つなげる数」と、DDL の検証の「つなげる数」が、tests/ で通る。
- 切り替えを開け、無料の本人で 6 枚つなぐと、7 枚目が 409 と仕様書の文になる。同じカードの 2 本目の接続は通る。1 枚切ると、つなげる。
- 切り替えを閉じると、今の上限に戻る。
