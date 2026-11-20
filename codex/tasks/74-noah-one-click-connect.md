# 74 1 回でつなぐ（接続の API・その場のサインイン・Passport）

仕様: **[docs/noah/spec-74-one-click-connect.md](../../docs/noah/spec-74-one-click-connect.md)**。型: docs/contracts/noah-connect-v1.ts（状態遷移）、noah-v1.sql（`noah_connections`）。先に 96・86・87。

## ローンチまで（先に、この範囲だけを出す。[ローンチの最小限](../../docs/noah/mvp-launch.md) の L5）

仕様書の **11 章** だけを見て作る。完了の定義も、その章にある。

- 先に要る PR: L2（96 の純関数）と L4（86 の握手）。87 のローンチ分（L6）は、この PR の後
- やる: 相手のサーバーへつなぐ道だけ。`noah_connections` の migration、`lib/noah-connect.ts`（11.3。要求 1 回の中で握手まで終える）、入口 2 つ、`disconnect`・`retry`
- やる: 新しい画面 `/noah/ready`（一覧）・`/noah/ready/agent?id=`（詳細）、`noah-connect-button.tsx`、96 の `noah-card.tsx` と計画の API、navigation の 1 行（11.5）
- やる: その場のサインイン（11.4。下の「やること」の 6）
- やる: つなぐ前の上限（`noahConnectGate`。新しく行を作る時だけ）と、握手の前に接続先の枠を取る事（`host_take`。取れなければ送らない）。相手が 429 を返したら `host_wait`（11.3 の 4・6）
- やらない（出した後）: 4（家の端末を同じボタンでつなぐ。照合と、再起動の後の出し直し）
- やらない（出した後）: `noah-connect-sheet.tsx`、`resume`、相手の許可の続き、`noah_connection_secrets` の表、`noah-library.tsx` の節
- やらない（出した後）: **今の `components/noah-launch.tsx`・`noah-public-catalog.tsx`・`noah-timeline.tsx` と、その API は触らない**

## やること（全部。ローンチの後に、残りをやる）

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
