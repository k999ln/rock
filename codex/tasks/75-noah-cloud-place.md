# 75 クラウドの実行先

設計: docs/noah-agent-market-design.md §4.3・§6、docs/services/noah-cloud-place.md。先に 73・74。

## 先に要る本人の許可

Cloudflare の有料契約、月の上限額、モデルの出どころ、無料枠の回数（設計書 §9 の 1〜3）。許可の前は、ローカルの Workers 試験と合成の負荷までにする。本番の鍵と契約には触れない。

## やること

1. services/noah-cloud-place/: 専用 Worker と Sandbox。`/api/noah/runner` と同じ受け渡し（取りに来る・lease・heartbeat・finish・停止確認）。
2. 外向きの通信: 全閉から始め、接続要件の `egress` だけ許可。モデル提供元の host は中継へ向け、鍵は中継が付ける。
3. 接続計画と `POST /api/noah/connect` に place=`cloud` を足す。本人の端末一覧には出さない。
4. 無料枠、本人の月の上限、運営全体の月の上限。使用量を Work と /noah/usage へ。
5. 実測: 契約の「最初に測るもの」。結果を docs/services/noah-cloud-place.md に足す。

## 変えないもの

- `noah-terminal/1`、`noah-isolation/1`、`LIMITS`。既存の `noah_runner_devices`・`noah_runner_commands` の意味。
- 有料の実行の gate（Wallet）。無料枠の外は、従量の受入が済むまで止める。

## 合格条件

- 別の 2 アカウントで、隔離環境・成果・停止が混ざらない。
- 宣言外の host への通信が拒否される。隔離環境の中に鍵が無い。停止の後に隔離環境が残らない。
- 同じ要求 ID の実行は 1 回。lease を越えた仕事は結果不明になり、再配送されない。
- 初めての本人が、Mac 無しで、カードの「接続」から最初の成果まで進む。
- tests/noah-cloud-place.test.mjs、`npm run typecheck`、`npm run lint:product`。
