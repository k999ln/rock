# 74 1 回でつなぐ（接続の API・その場のサインイン・Passport）

仕様: **[docs/noah/spec-74-one-click-connect.md](../../docs/noah/spec-74-one-click-connect.md)**。型: docs/contracts/noah-connect-v1.ts（状態遷移）、noah-v1.sql（`noah_connections`）。先に 73・86・87。

## やること

1. `noah_connections`・`noah_connection_secrets` の migration。
2. lib/noah-connect.ts: `createNoahConnectService`・`createNoahConnectApi`。接続の処理は仕様書 5.1 の 6 段（版と接続要件 → 計画の照合 → 行 → 利用権 → 置き場所の準備と疎通 → 見本）。どの段も、何回通っても同じ結果になるように書く。
3. app/api/noah/connect/route.ts・[id]/route.ts: `POST`（本文は `{ id, agentId, planSha256 }`）、`GET`、`disconnect`・`retry`・`resume`。応答の表は仕様書 4 章。
4. 家の端末: 今の `createNoahLaunchService(deps).enqueue(owner, { id, deviceId, action: 'connect', agentId })` を呼ぶ（接続の ID ＝ 命令の ID）。照合は仕様書 5.3。再起動の後の出し直しは 5.4（lib/noah-ask.ts が、依頼を入れる前に行う）。
5. components/noah-connect-button.tsx・noah-connect-sheet.tsx（仕様書 6 章。シートの文とボタンの表）。components/noah-library.tsx に「つながっているもの」。
6. 未サインインから: `sessionStorage['noah-connect-handoff']` → `/account?returnTo=…` → 同じ `id` で続ける（components/rockstar-entitlement-claim.tsx と同じ持ち方）。

## 決めてある事（変えない）

- lib/noah-launch.ts、`/noah/launch` の画面、`/api/noah/launch`・`/api/noah/instances`（細かい操作の入口として残す）。Broker の実行前確認。同一 Origin と ownerScope。結果不明の自動再送なし。
- **鍵の入力は作らない。** 印が「準備が必要」の Agent は、足りない物を見せる所まで（`POST` は 422）。復旧コードの表示の時機は変えない。
- 端末が応答していない時に、黙って別の置き場所で動かさない。切っても、成果と費用の記録は消さない。

## 合格条件

- `node --experimental-strip-types --test tests/noah-connect.test.mjs`（仕様書 8 章の 13 行: 相手のサーバー、相手の許可、家の端末、端末が止まっている、二重押し、条件が変わった、再起動の後、結果不明、切る、他人、未サインイン）。
- 幅 390 の実ブラウザで、サインイン済みの本人が、鍵の要らない相手のサーバーの Agent の「接続」1 回で「頼む」になる。Mac を使わない。送り先の 1 行が出る。
- 応答している家の端末がある本人は、今の 13 件でも「接続」1 回。Mac を再起動した後、「接続」を押し直さずに頼める。
- `npm run typecheck`、`npm run lint:product`。本番 D1 の migration は適用しない。
