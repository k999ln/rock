## 何をしたか

本人の指示（2026-11-22 23:10）「ユーザーエクスピリエンスを辿ってデバグしてほしい（略）全部一個一個因数分解してちゃんといますぐ全機能が使えるか確かめて欲しい（略）Codexにもデバグやらせるからそれ用の指示も（略）全体の流れをMD図で表して、言葉や矢印でも説明して（略）抜け道があるかどうかとかぜんぶぜんぶ込みで第三者視点で調べて改善点を最終形までもってってね」。

本番（avoado.si、Sites 206）を、知らない人のスマホ幅で**読むだけ**で開いて調べた。書き込む操作は、同じ main を手元で本番と同じ形に build して押した。結果は [docs/noah/ux-audit-2026-11-22.md](../blob/main/docs/noah/ux-audit-2026-11-22.md) にまとめた（全体の流れの図・言葉と矢印の説明・機能ごとの表 21 行・抜け道の表 10 行・自前のサーバーかクラウドか・本人に聞く事 5 つ）。残りは [task 128](../blob/main/codex/tasks/128-noah-ux-debug.md) に小項目 D1〜D13 で書いた。

## 直した事

| 直した事 | 前 | 後 |
| --- | --- | --- |
| 日本語で探す（`lib/noah-search-terms.ts`） | 「画像」「翻訳」「要約」「動画」「音楽」「天気」「税金」が、全件 1,957 件でも 0 件 | 105・9・12・83・40・18・4 件。語ごとに当て、日本語の語を英語の語幹にも広げる。短い英語は語の切れ目で当てる（tax は syntax に当てない） |
| 自分の Agent を追加 | テンプレートのまま保存すると「固定テストで整理する実行先に接続できません」で必ず失敗 | 検証の実行先が無い所では、その選択を最初から外し、押せなくする。手元の build で、テンプレートのまま保存できた |
| 保存したもの → Agent | ブラウザだけの人に「サインインしてください。」と「このMacに取り寄せたAgent」 | 使えない人には、その 2 つの節を出さない |
| 利用状況 | 運営でない人にも「Noah全体」が出て、押すと 403 | 運営にだけ出す |
| 公開の紹介案件の一覧 | 呼ぶたびに全件を読み、外へ取りに行く（448KB・`no-store`） | 同じ実行環境の中で 5 分だけ使い回す。失敗は使い回さない |
| 押す所の大きさ | スマホの頭の「登録情報を見る」36px・「戻る」32px、登録情報の画面のリンク 19〜23px | 44px 以上 |

確かめの道具を 2 つ足した（どちらも読むだけ）: `scripts/noah-public-walk.mjs`（スマホ幅で開いて、はみ出し・小さい押す所・失敗した API を出す）、`scripts/noah-public-probe.mjs`（GET を返す API を、知らない人とブラウザの本人の 2 通りで呼ぶ）。

## わかった事（直していない物は task 128 と本人の判断へ）

- 追加した自分の Agent は「このMacの隔離環境」でしか動かない。スマホの人は動かせない（本人の判断 Q1）。
- 外部への登録の代行は、Agentboard の 1 件だけ。
- 定期便は閉じている。開いても、ブラウザだけの本人は入れない（サインインは ChatGPT の account だけ）。
- 「接続できる」173 件のうち 165 件は、まだ誰も動かしていない。
- ブラウザだけの本人はいくらでも作れるので、本人ごとの上限が全体の上限にならない（D1）。
- なりすまし（名前の見出しを外から付ける）は通らなかった。応答の見出し（CSP の frame-ancestors・CORP・HSTS など）も揃っていた。

## 確かめた事

- 足した試験（どれも、直す前の file では落ち、直した後で通る）: `noah-search-terms`（6 本）、`noah-upload-account-ui` に 1 本、`noah-library-public-sections`（2 本）、`noah-usage-operator-tab`（1 本）、`noah-revenue-catalog-cache`（1 本）。
- `npm test`（手元。Node 22・root）: 5,144 本のうち 5,107 本が通った。落ちた 33 本は、手を入れていない main でも同じ名前で落ちる物（root で動かした事と、Node 22 に無い SQLite の機能。CI は Node 26.12.1）。新しく落ちた物は 0。
- `tsc --noEmit`・`lint:product`・`repository:check`・`project:check`・`design:check`: 通った。
- 手元の build で、「自分のAgentを追加」をテンプレートのまま保存できた。`scripts/noah-public-walk.mjs` で、ホームの小さい押す所が 0 になった。
- 本番で書き込む確かめ（接続・依頼・ボード・登録情報）は、本人の許可を待っている（文書の 8 章）。

- 2026-11-23: main `9cb7f5d1`（#32）を merge した後、4 本（収集・ボード・デザインの参照・一周の確かめ）を重ねて、もう一度流した。`npm test`: 5,222 本のうち 5,182 本が通った（4 本は skip）。落ちた 36 本（名前は 35）は、全部、手を入れていない main `9cb7f5d1` でも同じ名前で落ちる（新しく落ちた物は 0）。`tsc --noEmit`・`lint:product`・`repository:check`・`project:check`・`design:check`・`release:check`・`schema:check`・`database:check`: 通った。gitleaks: 0 件。

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01JzDjJ2sHXBQS8oDJ7NBhAu
