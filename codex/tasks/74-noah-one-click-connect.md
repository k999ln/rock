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

## 開発進捗

- 2026-11-21 01:15 JST: **L5（つなぐ）は Claude が作業中。** 枝は `claude/noah-connect-l5-20261121`。同じ範囲を、別の枝で作り始めない。
- 積み方: 握手（L4。[PR #335](https://github.com/k999ln/rock/pull/335)）の上に、Codex の成果データ（[PR #334](https://github.com/k999ln/rock/pull/334)。migration 0045）と Noah 専用の画面（[PR #337](https://github.com/k999ln/rock/pull/337)）を合わせた枝 `claude/noah-l4-with-ui-stack-20261121` を base にする。`noah_connections` の migration は **0046**（0045 と番号が当たらないように。**後で 0047 に変えた。** 下の 02:00 の行）。
- 順: 先に、画面に依らない所（migration、`lib/noah-connect.ts`、`/api/noah/connect`・`/api/noah/connect-plan`、試験）。画面は、#337 の新しい枠（左のナビ・中央のタイムライン・右の Agent 欄）に合わせる必要があるので、本人に 2 つ確かめてから作る（置く場所。つなぐ時にサインインを求めるか）。確かめるまでの既定は、仕様書 11 章のとおり（サインインを求める。その場のサインイン）。
- 本番への migration・配備・切り替えは行わない。
- 2026-11-21 02:00 JST: **画面の前まで、入れた**（[PR #342](https://github.com/k999ln/rock/pull/342)。未マージ）。
  - 入れた物: migration `0047_noah_connections`（最初は 0046 で作ったが、Codex の `0046_noah_feedback`（[PR #337](https://github.com/k999ln/rock/pull/337)。01:03 JST の push）と番号が当たったので、後から来たこちらを 0047 にした。`drizzle/`・`drizzle-main/`・`db/schema.ts`）、`lib/noah-connect-source.ts`、`lib/noah-connect-plan-api.ts`、`lib/noah-user-handshake.ts`、`lib/noah-connect.ts`、入口 4 つ（`app/api/noah/connect/route.ts`・`[id]/route.ts`・`[id]/tools/route.ts`、`app/api/noah/connect-plan/route.ts`）。見回りが、つないでいる人が居る系列を 24 時間ごとに確かめる（`lib/noah-intake-probe.ts`）。
  - 決めた事と理由・D1 への往復の数・受入の結果は、[仕様書 74](../../docs/noah/spec-74-one-click-connect.md) の 11.8。
  - 確かめ方: `node --experimental-strip-types --test tests/noah-connect.test.mjs tests/noah-connect-plan-api.test.mjs`（32 本）。`node --experimental-strip-types scripts/check-noah-connect.mjs`（手元の D1。外へは通信しない）。`npm run typecheck`、`npm run lint:product`、`python3 docs/design-validation/noah/validate-noah-v1.py`。
  - 次の層（L6: 頼む）が使う物: `createNoahConnectService(deps).usable(owner, id)`（使ってよい接続かの確かめ。取り下げ・接続先の変更）、`createNoahUserHandshake(deps).handshake(target)`（接続先の枠・握手・401 と 429 の扱い。握手の後の session と、道具の呼び出しに使う ctx を返す）、`NOAH_HANDSHAKE_MESSAGES`。`disconnect` に、終わっていない依頼を止める文を足す。
  - 残り: 画面（仕様書 11.5。本人の決定を 2 つ待っている）、その場のサインイン（11.4）、navigation の 1 行、`tests/noah-ready-ui.test.mjs`。途中で止まった接続の後始末は L7、運営の画面の数は L8。
  - 本番への migration・配備・切り替えは行っていない。
