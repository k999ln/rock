## 何をしたか

本人の指示（11-22 01:48）「実際に使えるように参照ライブラリの雛形を作って。ムードボードとコンポーネント用のフォルダ、記入例つきのREADME、AGENTS.mdに追記する文も入れて」。Codex が作った雛形は、ノエルの Mac の作業フォルダの中だけにあり、rock には入っていなかった。それを、架空の記入例のままではなく、**Noah の実際の参照**で埋めて入れた。

旧リポジトリの k999ln/rock#422 を、この main（b310b319）の上に移した。AGENTS.md の 8（`iceiceice999/rock` を正本にする行）は、この main のまま残した。

- `design/references/moodboard/`
  - `noah-diagram-cards.webp`: 図解のカード（紙の粒子・分野の色の面・大きな日本語の動詞句・入れる物 → できる物の絵）。
  - `noah-yohaku-photo-grid.webp`: 余白の写真の並び（静かな色・余白・文字は最小）。
- `design/references/components/`
  - `noah-pin-grid-v169.webp`: 第 169 版のピンのグリッド（Masonry・高さ 3 段・分野の札）。
  - `yorimichi-timeline-talk.webp`: よりみちのタイムラインとトーク（下のタブ・未読の数・投稿の形）。
- `design/references/README.md`: 1 枚ずつ、取り入れる事・使う所・確かめる点・出典（本人の指示と日時）。追記用の型。
- `AGENTS.md`「9. 画面を作る時」: 作る前に参照を見る／今ある部品で入れる／スマホ 390 px と PC 1280 px で見比べる。AGENTS.md は 66 行。
- `docs/structure/09-repo-layout.md` に 1 行。

画像は、書き出しの ZIP の画像を WebP にして、1 枚 27〜183 KB。

## 確かめた事

- `repository:check`・`project:check`・`design:check`: 通った。画像は 4 枚で 27〜183 KB。
- 4 つの直し（安全・収集・ボードのおすすめ・デザイン参照）を、main 94d2c762 の上に重ねて確かめた。その後 main に入った #10・#11 と重なるのは CHANGELOG だけなので、b310b319 の上に移し直した。
  - `npm test`（手元。Node 22・root）: 5,137 本のうち 5,099 本が通った。落ちた 34 本のうち 33 本は、手を入れていない main（94d2c762）でも同じ名前で落ちる（root で動かすと断る試験と、Node 22 に無い SQLite の API。CI は Node 26.12.1）。残りの 1 本（`undici-dependency-security`）は `sites/avocado-mini` の `npm ci` をしていなかったためで、CI と同じく入れてから流すと通った。
  - `tsc --noEmit`・`lint:product`・`repository:check`・`project:check`・`design:check`・`release:check`・`schema:check`・`database:check`: 通った。
  - gitleaks（`.github/spider/gitleaks.toml`）: どの commit も 0 件。

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01JzDjJ2sHXBQS8oDJ7NBhAu
