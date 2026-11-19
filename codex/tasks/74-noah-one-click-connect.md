# 74 1 クリック接続（接続の API・その場のサインイン・Passport）

設計: docs/noah-agent-market-design.md §4.2・§4.7、docs/services/noah-one-click-connect.md。先に 73。

## やること

1. `POST /api/noah/connect`: `/api/noah/instances` の prepare と `/api/noah/launch` の connect を 1 操作にまとめる。操作 ID で冪等。見た計画と今の計画が違えば 409。
2. 未サインインで押した時: 操作の digest だけを sessionStorage に持ち（lib/eve-agent-creation.ts と同じ持ち方）、/account → `returnTo` で戻って同じ操作 ID で続ける。
3. パスキーで登録した直後の復旧コードの表示を、最初の成果の後へ移す。表示は無くさない。保存するまで、アカウントの画面に未保存と出す。
4. Passport の保存、「つながっているもの」の一覧、切る、場所を変える（`POST /api/noah/connect/[id]`）。
5. 見本の入力がある Agent は、接続の後にそのまま最初の実行をする。
6. 接続の段ごとの到達数と完了数を記録する。本人の ID と依頼の本文は入れない。

## 変えないもの

- Broker の実行前確認（外部への書き込み、金融）。同一 Origin と ownerScope。結果不明の自動再送なし。
- 既存の `/noah/launch` の画面と API（細かい操作の入口として残す）。

## 合格条件

- 実ブラウザで、サインイン済みで応答中の Mac がある状態から、カードの「接続」1 回で「頼む」になる。
- 未サインインから、パスキー 1 回で同じ所まで進む。途中で閉じても、同じ操作 ID で続きから。
- 二重クリックと再読込で接続は 1 回。別 Origin 403、ownerScope 不一致 409。
- tests/noah-one-click-connect.test.mjs、`npm run typecheck`、`npm run lint:product`。
