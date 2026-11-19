# 75 専用の端末（雲）— 端末を持たない人の置き場所

設計: docs/noah-design.md §3.7、docs/noah-agent-market-design.md §4.1・§6、docs/services/noah-own-device.md。先に 73・74・84。個別の残件。本線（本人の Mac → mii の Hub）の後ろで、本人の許可が出た時に始める。

## 先に要る本人の許可

Cloudflare の有料契約、月の上限額、モデルの出どころ、無料枠の回数（設計書 §9 の 3〜5）。許可の前は、ローカルの Workers 試験と合成の負荷までにする。本番の鍵と契約には触れない。

## やること

1. services/noah-own-device/: 専用 Worker と Sandbox。`/api/noah/runner` と同じ受け渡し（取りに来る・lease・heartbeat・finish・停止確認）。
2. 本人ごとの端末を `noah_runner_devices` に platform=`cloud` の行として作り、端末の一覧に出す。初めて必要になった接続の時に作る。
3. 仕事ごと・Agent ごとに別の隔離環境。同じ owner の別の Agent のファイルを見せない。同時 3 件（候補）。`noah_runner_one_claim` の既存の意味は変えない。
4. 共通の image を 1 つ。依存を入れ終えた層と Agent の状態は、Sandbox の backup で保存して戻す。Agent ごとの image は作らない。
5. 外向きの通信: 全閉から始め、接続要件の `egress` だけ許可。モデル提供元の host は中継へ向け、鍵は中継が付ける。
6. 接続計画と `POST /api/noah/connect` に place=`cloud` を足す。置き場所の変更（`change_place`）をまとめて行える。
7. 無料枠、本人の月の上限、運営全体の月の上限。使用量を Work と /noah/usage へ。
8. 実測: 契約の「最初に測るもの」。結果を docs/services/noah-own-device.md に足す。

## 変えないもの

- `noah-terminal/1`、`noah-isolation/1`、`LIMITS`。既存の `noah_runner_devices`・`noah_runner_commands` の行の意味。
- 有料の実行の gate（Wallet）。無料枠の外は、従量の受入が済むまで止める。
- 本人の月額契約のログインを雲へ運ばない。常駐は受けない。

## 合格条件

- 別の 2 アカウントで、隔離環境・成果・停止が混ざらない。同じアカウントの 2 つの Agent でも、ファイルが見えない。
- 宣言外の host への通信が拒否される。隔離環境の中に鍵が無い。停止の後に隔離環境が残らない。
- 同じ要求 ID の実行は 1 回。lease を越えた仕事は結果不明になり、再配送されない。
- Mac も mii も持たない本人が、スマホだけで、ターミナル型の Agent のカードの「接続」から最初の成果まで進む。
- 84 の検査が通る。tests/noah-own-device.test.mjs、`npm run typecheck`、`npm run lint:product`。
