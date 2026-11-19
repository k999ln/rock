# 73 接続要件と接続計画（純関数と表示）

設計: docs/noah-agent-market-design.md §4.4、docs/services/noah-one-click-connect.md。先に 84。雲の契約が無くても始められる。

## やること

1. lib/noah-connect-requirements.ts: `noah-connect/1` の parser と hash。未知の項目と秘密値らしい値を拒否する。Package の `packageKey`・`manifestSha256` を指す sidecar にし、`sky-tool-package/1` の parser と hash は変えない。
2. lib/noah-connect-plan.ts: `planNoahConnection(requirements, state)`。I/O を持たない純関数。サービス契約の「計画の試験」の表をそのままテストにする。
3. 既存の Agent から接続要件を作る変換。固定 adapter 13 件（`RECIPES`）、`noah-terminal/1` の登録、審査済みの公開版。今の実装から決まる値だけを入れる（mouth は source、surface は terminal、places は home だけ、model は relay か none、egress は空）。取り込みの台帳（85）の行からも同じ形で作れるようにする。
4. `GET /api/noah/connect-plan`。未サインインでも返す。書き込まない。
5. カードと詳細の主ボタンと、その下の 1 行（読むもの・動く場所・料金・接続の手数）。

## 変えないもの

- 計画は権限も利用権も与えない。`/api/noah/launch` と `/api/noah/instances` の検査はそのまま。
- `sky-tool-package/1`、`noah-agent/1` の parser と hash。

## 合格条件

- tests/noah-connect-plan.test.mjs: 契約の表の全行、段の順、同数の時の置き場所の選び方、`surface=own-device` が `blocked`、機種の名前を含む places の拒否。
- 13 件と公開版の全部に接続の手数が出る。応答中の家の端末が無い本人には「準備が必要」、ある本人には「1 クリック」と出る。
- `npm run typecheck`、`npm run lint:product`、`node --experimental-strip-types --test tests/noah-connect-*.test.mjs`。
