# 76 載せる 1 画面と自動入力（Eve のビルドの静的な段）

設計: docs/noah-agent-market-design.md §4.6、docs/services/eve-agent-build.md の「見分ける」。隔離環境が無くても始められる。

## やること

1. lib/noah-build-classify.ts: 見分ける。入力は ZIP の中身か貼付。何も実行しない。出力は、種類、言語、入口、依存、モデルの使い方、通信先、要る鍵、ライセンス、名前と説明の下書き。
2. 読み取った内容から `noah-agent/1`・`sky-tool-package/1`・`noah-connect/1` の下書きを作る。必ず既存の parser を通す。
3. /noah/sell を「載せる」1 画面にする。受け取る → 下書きを確かめる → 価格（既定は無料）→ 載せる。既存の /noah/agents/new と /noah/publisher は「細かく直す」入口として残す。
4. 直書きの鍵らしい文字列を見つけたら、公開の操作を止めて場所を見せる。
5. 取込の形を足す。`SKILL.md` の folder（種類＝担当）。Eve の担当は task 80 と共有。
6. 確認を 1 回にまとめる（権利と、公開する内容の一覧）。今の 5 つの確認の中身は、その一覧に全部出す。

## 変えないもの

- `/api/noah/drafts`・`/api/noah/agents`・`/api/noah/publisher` の API と保存先。審査は別権限。自己承認は不可。
- 下書きは提案。読み取った内容を、権利・安全・動作の証明にしない。

## 合格条件

- fixtures: Node のテンプレート、Python のテンプレート、`SKILL.md`、鍵入りの悪い例、OpenAI 互換の SDK を直接呼ぶ例。作者の入力 0 のまま、既存の parser が通る下書きが出る。鍵入りは止まる。
- 実ブラウザで、ファイルを 1 つ落として「載せる」を 1 回押すと、審査待ち（または task 77 の後は掲載）まで進む。
- tests/noah-build-classify.test.mjs、`npm run typecheck`、`npm run lint:product`。
