# 85 取り込みと名寄せ（外の台帳 → 系列 → 接続要件の下書き）

設計: docs/noah-agent-market-design.md §3・§4.3、docs/services/noah-agent-intake.md、docs/noah-agent-census-20261120.md。先に 84。本番 D1 の migration は本人の許可の後。

## やること

1. 今の発見の作り（`lib/noah-discovery-store.ts`、`noah_discovery_*`）に出どころを足す。`noah_intake_checks` の表（契約の「保存と API」）。今の調査台帳（`data/noah-research-index.json`）と、発見の既存の行の意味は変えない。
2. 取り込み。MCP の公式台帳（`/v0/servers?version=latest`、cursor、1 時間ごとの差分）、Hugging Face の `mcp-server` の Space（runtime を含む一覧）、ACP の台帳。出どころの URL・取得時刻・元の記録の hash を持つ。
3. 名寄せ。提供者（名前空間）と host、同じ名前のコピー、版違いを 1 系列にまとめる。代表は、動いていて、いいねと更新が新しい物。
4. 見分ける。口、面（84 の関数）、要る鍵（台帳の必須の header・環境変数）、相手の許可の要否 → `noah-connect/1` の下書き。何も実行しない。
5. 日本語の 1 行説明。モデルで作り、元の説明と並べて保存する。作った物だと分かる印を付ける。
6. 今の候補の一覧に、口・深さ・語の絞り込みを足す。件数の集計（口ごと、深さごと）。

## 変えないもの

- 台帳の文章からコマンドを作らない（`lib/noah-execution-contract.mjs` の決まり）。この task は何も起動しない。
- 巡回の名乗りと回数制限（Hub は未ログインで 5 分 500 回）。寝ている Space を起こさない。

## 合格条件

- 固定した台帳の断片（fixture）から、census と同じ集計（口ごとの件数、必須の鍵の件数）が出る。
- `mcp-sentiment` のコピー 100 件が 1 系列になる。同じ host に 2,000 件を置く提供者が 1 枚のカードになる。
- 必須の秘密の header がある記録の接続の手数が「準備が必要」になる。鍵の宣言が無い記録は、86 の握手まで「未確認」。
- tests/noah-intake.test.mjs、`npm run typecheck`、`npm run lint:product`。
