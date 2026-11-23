## 何をしたか

本人の指示（11-22 03:56）「どのボードに保存したかでおすすめが変わるようにして。ボードごとの違いを実際に触って見たい」を、Noah 本体に入れた。Codex が作ったのは、ノエルの Mac の中の試作（余白）だけで、Noah には入っていなかった。

旧リポジトリの k999ln/rock#418 を、この main（b310b319）の上に移した。

- `GET /api/noah/pins?board=<ボードの ID>`（`boardPicks`）: そのボードの新しい保存 20 件を起点に、**他の人の**ボードを経て、今ある Pixie（spec-115 の 5 章の 6）で行き着く物を 12 件まで返す。
  - ボードに入っている物と、見る人が「表示しない」にした物は出さない。
  - 5 人より少ない人の保存からは出さない（今の「これも使われています」と同じ決まり）。
  - 持ち主か、公開のボードだけ（ほかは 404）。形の違う ID は 400。
- ボードの頁（`/noah/boards/<id>`）の下に「このボードに合う Agent」。ボードに保存すると、その場で出し直す。おすすめが無い時は、節ごと出さない。
- 学習なし・乱数なしのまま（spec-115 の決まり）。spec-115 に「追加: ボードのおすすめ」の章を足した。
- 画面の試験の台（`tests/fixtures/noah/screen.mjs`）で、名前の付いた部品を `file#名前` で描けるようにした。

## 確かめた事

- `noah-pins` と、画面の試験の台を使う試験 23 本、合わせて 204 本（足した 2 本: 他の 5 人が 1・2 と 3・4 を一緒に保存している時、1 のボードには 2、3 のボードには 4 が出る／公開のボードは誰でも・自分だけのボードは持ち主だけ／隠すと消える／保存を足すと変わる／画面に節が出る・無い時は出ない）: 全部通った。
- 4 つの直し（安全・収集・ボードのおすすめ・デザイン参照）を、main 94d2c762 の上に重ねて確かめた。その後 main に入った #10・#11 と重なるのは CHANGELOG だけなので、b310b319 の上に移し直した。
  - `npm test`（手元。Node 22・root）: 5,137 本のうち 5,099 本が通った。落ちた 34 本のうち 33 本は、手を入れていない main（94d2c762）でも同じ名前で落ちる（root で動かすと断る試験と、Node 22 に無い SQLite の API。CI は Node 26.12.1）。残りの 1 本（`undici-dependency-security`）は `sites/avocado-mini` の `npm ci` をしていなかったためで、CI と同じく入れてから流すと通った。
  - `tsc --noEmit`・`lint:product`・`repository:check`・`project:check`・`design:check`・`release:check`・`schema:check`・`database:check`: 通った。
  - gitleaks（`.github/spider/gitleaks.toml`）: どの commit も 0 件。

- 2026-11-23: main `9cb7f5d1`（#32）を merge した後、4 本（収集・ボード・デザインの参照・一周の確かめ）を重ねて、もう一度流した。`npm test`: 5,222 本のうち 5,182 本が通った（4 本は skip）。落ちた 36 本（名前は 35）は、全部、手を入れていない main `9cb7f5d1` でも同じ名前で落ちる（新しく落ちた物は 0）。`tsc --noEmit`・`lint:product`・`repository:check`・`project:check`・`design:check`・`release:check`・`schema:check`・`database:check`: 通った。gitleaks: 0 件。

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01JzDjJ2sHXBQS8oDJ7NBhAu
