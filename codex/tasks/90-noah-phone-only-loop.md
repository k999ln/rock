# 90 手元だけの一周（PC の前に座らない受入）

仕様: **[docs/noah/spec-90-phone-only-loop.md](../../docs/noah/spec-90-phone-only-loop.md)**（これ 1 本で足りる）。[ローンチの最小限](../../docs/noah/mvp-launch.md) の L9。先に 87 のローンチ分（L6）まで。**この task は、全部がローンチの範囲。** 新しい機能は作らない。「出してよいか」を判定できるようにする。

## やること

1. tests/helpers/noah-remote-fixture.mjs: 合成の接続先（握手・一覧・呼び出し・相手の誤り・時間切れ・401・429）と、台帳の 1 頁を返す fetcher。一時 DB は、今の tests/helpers/noah-release-runtime-fixture.mjs の持ち方に、ローンチの migration 3 本を足す。
2. tests/noah-phone-loop.test.mjs: 仕様書 3 章の 14 段（取り込む → 見つける → 計画 → つなぐ → 道具 → 頼む 3 種 → 同時 → 動いた → 受け取る → 切る → 端末の表が変わらない → 手数）。画面が呼ぶのと同じ入口だけを呼ぶ。頼んだ後、読み直しを 1 回も呼ばずに成果が入る事を確かめる。
3. tests/noah-ready-ui.test.mjs: 仕様書 4 章の 9 つの決まり（主ボタンは 1 つ、印は文字、送り先、出どころ、進行で塞がない、提供者の文を HTML にしない、画面に出さない言葉、確かめ、読み直し）。やり方は tests/noah-timeline-ui.test.mjs と同じ。
4. 実機の確かめ（仕様書 5 章の 1〜12）を、本番で、審査者の account と、スマホのブラウザだけで行う。結果を PR 本文に書く。13（account を持っていない人の一周）は、切り替えを開けた直後に行う。

## 決めてある事（変えない）

- 実ブラウザを動かす試験の道具を、リポジトリへ足さない。幅 390 での見え方は、実機の表で確かめる。
- 本人の Mac の画面を操作しない。受入用の account は、支払いと外部送信を持たない。
- ローンチの一周に、通知・「あなたの番」・端末の一覧・家の端末の Agent を入れない（出した後に足す。仕様書 7 章）。
- 手元の合格を、本番の合格と書かない。

## 合格条件

- `node --experimental-strip-types --test tests/noah-phone-loop.test.mjs tests/noah-ready-ui.test.mjs`、`npm run verify`。
- 切り替え（`NOAH_INTAKE_PUBLIC`・`NOAH_ASK_FORM`）を閉じた時、一覧が 404、接続と依頼が 503。
- PR 本文に、実機の 1〜12 の合否と、通らなかった行の画面の文。本番で行えない間は、手元の結果と、本番で残っている行。

## 開発進捗

- 2026-11-21 05:55 JST: **L9（受入）は Claude が作業中。** 枝は `claude/noah-loop-l9-20261121`（L8 の枝 `claude/noah-ops-l8-20261121` = [PR #346](https://github.com/k999ln/rock/pull/346) の上）。同じ範囲を、別の枝で作り始めない。
- L9 で入れる物: 一周の自動試験 `tests/noah-phone-loop.test.mjs`（仕様書 3 章の 15 段と、切り替えを閉じた時）、画面の決まりの試験（仕様書 4 章の 9 つ。`tests/noah-ready-ui.test.mjs`・`tests/noah-ask-ui.test.mjs` に足す）、実機の表（仕様書 5 章）の、手元での結果。**手元の結果を、本番の合格と書かない。**
- すでに入っている物（作り直さない）: 合成の接続先と、一時の表（`tests/fixtures/noah/`。仕様書 6 章の `tests/helpers/noah-remote-fixture.mjs` に当たる物は、L4・L5 で、ここに作ってある）。機能のコードは、変えない（試験が通らない所が見つかったら、その機能の仕様書に戻って直す）。
- 入れない物: 本番での確かめ（仕様書 5 章の表を、本番で行う事）。配備・migration の適用・切り替えは、本人の許可の後。
