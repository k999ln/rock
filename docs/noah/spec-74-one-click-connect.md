# 仕様書 74 — 1 回でつなぐ（接続の API・その場のサインイン・Passport）

task: [codex/tasks/74-noah-one-click-connect.md](../../codex/tasks/74-noah-one-click-connect.md)。先に要る物: 96（計画）、86（口と相手の許可）、87（頼む）。ローンチ分（11 章。L5）で先に要るのは、96 の純関数（L2）と 86 の握手（L4）まで。87 のローンチ分（L6）は、この後に作る。
型契約: [noah-connect-v1.ts](../contracts/noah-connect-v1.ts)（状態遷移）、[noah-v1.sql](../contracts/noah-v1.sql)（`noah_connections`）。試験: [noah-connect.test.mjs](../design-validation/noah/noah-connect.test.mjs)、[validate-noah-v1.py](../design-validation/noah/validate-noah-v1.py)（「接続」の群）。

**ローンチまでに作る範囲は 11 章（相手のサーバーへつなぐ道と、`/noah/ready` の 2 画面）。** 家の端末を同じボタンでつなぐ道と、相手の許可の続きは、出した後に足す。11 章と食い違う所は、ローンチまでは 11 章が勝つ。

## 1. 完成の姿

- カードの「接続」を 1 回押すと、ボタンが「頼む」に変わる。足りない物がある時だけ、下からシートが出る。
- 相手のサーバーの Agent は、Mac が無くてもつながる。今の 13 件は、応答している家の端末があれば、同じ 1 回でつながる。
- つないだ記録（Passport）は account にある。端末を再起動しても、スマホを替えても、「つながっているもの」は消えない。

## 2. この仕様で決めた事

| 決めた事 | 理由 |
| --- | --- |
| 接続の ID（client が作る UUID）を、家の端末への接続の命令（`noah_runner_commands.id`）にもそのまま使う | 今の `/api/noah/launch` の connect と同じ 1 行になる。今の画面（`/noah/launch`）からも同じ接続が見える |
| Passport は、同意した時の接続要件の写し（`connect_json`）を持つ | 後で接続要件が変わった時に、何が変わったかを比べられる（`diffNoahConnect`）。版の履歴の表を足さなくて済む |
| 家の端末が再起動したら、Noah が接続の命令を出し直す。本人に「接続」をやり直させない | 今の `run` は、同じ起動（`boot_id`）で通った接続の命令を求める（`lib/noah-launch.ts` の `enqueue`）。Mac を再起動するたびに「接続」を押すのは、「当たり前に使う」に合わない |
| **鍵の入力は、この task に入れない。** 印が「準備が必要」の Agent は、足りない物を見せる所まで | 鍵を画面に貼らせる作りは、保存・表示・消し方を決めてから別の task にする（表 `noah_connection_secrets` だけ用意してある）。この task で出すのは、入力なしでつながる 82% の方 |
| 復旧コードの表示の時機は変えない | `components/rockstar-account.tsx` は、復旧コードを登録の時に 1 回だけ見せる。これを後ろへ動かすのは account の安全の作りの変更で、本人の決定が要る（詳細設計書 18 章へ足した） |
| 段ごとの到達数は、新しい表を作らず `noah_connections` から数える | 状態・手数・時刻が行にある |

## 3. 今あるコードと、変える所

| ファイル | 今 | 変える事 |
| --- | --- | --- |
| `drizzle/00NN_noah_connections.sql`、`db/schema.ts` | 無い | [noah-v1.sql](../contracts/noah-v1.sql) の `noah_connections`・`noah_connection_secrets`・`noah_oauth_*`（86 が先に入れていれば、接続の表だけ） |
| `lib/noah-connect.ts` | 無い | 新規。`createNoahConnectService(deps)`・`createNoahConnectApi(deps)`（4〜5 章） |
| `app/api/noah/connect/route.ts`、`app/api/noah/connect/[id]/route.ts` | 無い | 新規 |
| `lib/noah-launch.ts` | `createNoahLaunchService(deps)` が `enqueue`・`stop`・`overview` を持つ | **変えない。** 接続の service から `enqueue(owner, { id, deviceId, action: 'connect', agentId })` を呼ぶ |
| `lib/noah-ask.ts`（87） | 置き場所が `provider` の依頼だけ | 置き場所が `home` の依頼を受け、5.4 の出し直しの後に `enqueue(owner, { id, action: 'run', connectionId: runner_command_id, prompt, deviceId })` を呼ぶ |
| `components/noah-connect-button.tsx`、`components/noah-connect-sheet.tsx` | 無い | 新規（6 章） |
| `components/noah-card.tsx`（96） | `onConnect` は `/noah/launch` へ移るだけ | 上のボタンを入れる |
| `components/noah-library.tsx` | `GET /api/noah/library` と招待の一覧 | 「つながっているもの」の節を足す（`GET /api/noah/connect`） |
| `components/noah-launch.tsx`、`/api/noah/launch`、`/api/noah/instances` | 細かい操作の画面と API | **変えない**（残す） |

## 4. API

### 4.1 `POST /api/noah/connect`

本文 `{ "id": <UUID>, "agentId": <文字列>, "planSha256": <64 hex> }`。共通の検査（Origin、ownerScope、JSON、4,000 bytes まで）。

| 応答 | 中身 |
| --- | --- |
| 202 | `{ "id", "state", "revision", "place", "placeLabel", "nextStep"?: { "kind": "oauth", "url": "/api/noah/oauth/start?connect=<id>&service=<serviceId>", "label" } }` |
| 200 | 同じ `id`・同じ内容の再送。今の状態 |
| 401 | 未サインイン（client は 6.3 の手順） |
| 409 | 同じ `id` で内容が違う「同じ操作IDの内容は変更できません。」 |
| 409 | 条件が変わった `{ "error": "条件が変わりました。もう一度確かめてください。", "plan": <新しい計画> }` |
| 409 | 家の端末が応答していない「端末が応答していません。Mac の電源とネットワークを確かめてください。」（今の `enqueue` は別の文を返すので、ここで言い直す） |
| 409 | 同じ系列に、別の版の接続がある「新しい版があります。つながっているものの一覧で確かめてください。」（入れ替えは task 93） |
| 422 | `blocked`、または入力の要る段がある `{ "error": "準備が必要です。<最初に足りない物>", "plan" }` |

### 4.2 `GET /api/noah/connect/[id]`、`GET /api/noah/connect`

1 件 `{ "id", "state", "revision", "agentId", "name", "digest", "place", "placeLabel", "deviceId", "nextStep"?, "error"?, "sampleAskId"?, "connectedAt"?, "lastUsedAt"? }`。読むたびに 5.3 の照合を 1 回行う。一覧は、本人の切っていない接続（新しい順、50 件）。別の本人の `id` は 404。

### 4.3 `POST /api/noah/connect/[id]`

本文 `{ "action": "disconnect" | "retry" | "resume", "revision": <数> }`。`revision` が違えば 409 と今の状態。

| action | 条件（`nextNoahConnectionState`） | する事 |
| --- | --- | --- |
| `disconnect` | 切っていない | 新しい依頼を受けない。終わっていない依頼へ停止を出す。家の端末なら、今の `stop(owner, runner_command_id)`。許可（`noah_oauth_grants`）は、同じ接続先を使う接続が他に無ければ取り消す。`state='disconnected'`、`disconnected_at`。**成果と費用の記録は消さない** |
| `retry` | `failed` | `planned` に戻して、5.1 を最初から |
| `resume` | `needs_action` | 相手の許可の戻り（86 の callback）が呼ぶ。5.1 を最初から（終わった段は飛ばす） |

`unknown` は `retry` できない。5.3 の照合だけが進める。

## 5. 処理

### 5.1 接続（`POST` と `retry`・`resume` が同じ関数を通る。段は何回通っても同じ結果になるように書く）

1. **版と接続要件。** `agentId` が今の Agent なら `resolveNoahPin(deps, owner, agentId)` と 96 の `connectForPin`。取り込んだ系列なら、代表の候補の `connect_json`。`invite` は 422。
2. **計画。** 96 の `planStateFor` と `planNoahConnection`。`noahPlanSha256` が本文の `planSha256` と違えば 409 と新しい計画。`blocked` と、入力の要る段（`typed > 0`）は 422。
3. **行。** `request_sha256 = noahDigest(JSON.stringify({ agentId, planSha256 }))`。`INSERT OR IGNORE INTO noah_connections …`（`state='planned'`、`connect_json`、`plan_sha256`、`cost_taps`・`cost_typed`、`consent_json = { permissions, sendsTo, at }`、`price_json`）。同じ `id` の行があれば hash を比べる。同じ本人・同じ系列の切っていない行が別の `id` であれば、同じ `digest` ならその行を 200 で返し、違えば 409。
4. **利用権**（`entitle_start`）。今は全部無料なので `entitle_ok`。有料は、flag `NOAH_PAY_AFTER_CONNECT` が閉じている間 422。
5. **置き場所の準備と疎通**（`prepare_ok` → `probing`）。
   - `provider`: 86 の握手。401 → 発見と登録 → `prepare_needs_action`（`needs_json` と `nextStep`）。許可を持っていれば、token を付けて握手。通ったら `tools_sha256` を保存して `probe_ok`。応答しない → `probe_failed`（「相手のサーバーが応答しません。時間をおいて試してください。」）。
   - `home`: `enqueue(owner, { id, deviceId, action: 'connect', agentId })`。`runner_command_id = id`。ここで 202 を返す。続きは 5.3。
   - `cloud`・`pocket`: flag が閉じている間は、計画が候補に入れないので来ない。
6. **見本**（`connected` になった後）。置き場所が `provider` で、候補に見本（`sample_json`）があり、87 の入力欄で頼める道具なら、同じ入力で 1 回頼み、`sampleAskId` を返す（見本が出るまでが「つながった」の体験）。それ以外は何もしない。

### 5.2 状態と、画面の文

| 状態 | ボタン | その下の 1 行 |
| --- | --- | --- |
| （行なし） | 「接続」 | 印・動く所・料金。置き場所が `provider` なら「入力は <host> へ送られます。」 |
| `planned`・`entitling`・`preparing`・`probing` | 「準備しています…」（押せない） | 30 秒を越えたら「まだ進んでいます。閉じても大丈夫です。」 |
| `needs_action` | シートを出す | 6.2 |
| `connected` | 「頼む」 | 「<動く所> につなぎました」（3 秒で消す） |
| `failed` | 「もう一度」 | `error`（2 文） |
| `unknown` | 「確かめています…」（押せない） | 「結果を確かめられませんでした。もう一度確かめます。」 |
| `blocked` | 出さない | 「この Agent は、今の端末ではつなげません。<理由>」 |
| `disconnected` | 「接続」 | — |

### 5.3 家の端末の照合（`GET /api/noah/connect/[id]` のたび。`state` が `preparing`・`probing`・`unknown` の時だけ）

`noah_runner_commands` の `runner_command_id` の行を読む。

| 命令の状態 | 接続の出来事 | 次 |
| --- | --- | --- |
| `queued`・`claimed` | — | そのまま（`preparing`） |
| `succeeded` | `prepare_ok` と `probe_ok` | `connected` |
| `failed`・`cancelled` | `prepare_failed` | `failed`。`error` は命令の `result.message`。無ければ「端末で準備できませんでした。もう一度試してください。」 |
| `unknown` | `prepare_ok` と `probe_unknown` | `unknown`。**自動でやり直さない。** 端末が戻って今の `reconcileUnknown` が命令を確かめ直した時に、`reconciled_ok`／`reconciled_failed` |

更新は `UPDATE noah_connections SET … WHERE id=? AND revision=?`（古い読み取りで上書きしない）。

### 5.4 家の端末の再起動の後（87 の「頼む」が、依頼を入れる前に行う）

1. その接続の端末の今の `boot_id` を読む。`runner_command_id` の命令が、同じ `boot_id` で `succeeded`、かつ止められていなければ、そのまま使う。
2. そうでなければ、接続の命令を出し直す。命令の ID は、接続の ID と `boot_id` から決まる値（`noahDigest(connectionId + ':' + bootId)` の先頭 32 桁を UUID の形にする）。同じ起動で何回呼んでも 1 件。
3. 依頼は「待ち」に置き、行に「端末を準備しています…」と出す。命令が `succeeded` になったら、`runner_command_id` を書き換えて、依頼を入れる。`failed` なら依頼を `failed` にする。
4. 端末が応答していない時は、依頼を入れずに 409「端末が応答していません。…」。**黙って別の置き場所で動かさない。**

## 6. 画面

### 6.1 `components/noah-connect-button.tsx`

| props | 中身 |
| --- | --- |
| `agentId`、`connect`（96 の印）、`connection`（今の接続。無ければ null）、`ownerScope`、`onConnected(connectionId)` | |

押した時: ① `crypto.randomUUID()` で `id` を作り、`sessionStorage['noah-connect:' + agentId]` に `{ id, at }` を置く（再読込と二重押しで同じ `id` を使う。10 分で捨てる）。② `GET /api/noah/connect-plan?agent=`。③ `account` の段が `needed` なら 6.3。④ `POST /api/noah/connect`。⑤ `GET /api/noah/connect/[id]` を 1 秒ごと（30 秒を越えたら 3 秒ごと。画面が裏の間は読まない）。終わりの状態になったら、`sessionStorage` の項目を消す。

### 6.2 `components/noah-connect-sheet.tsx`（足りない物がある時だけ。1 段に 1 つのボタン）

```
┌ シート（画面の下から出る）
│ mcp.worldku.com のアカウントで許可
│ mcp.worldku.com が、あなたの代わりに使うことを許可します。
│ mcp.worldku.com のアカウントが要ります。
│ 入力は mcp.worldku.com へ送られます。
│            [ mcp.worldku.com で許可する ]
│                      やめる
└
```

| 段 | 文 | ボタン | 押した時 |
| --- | --- | --- | --- |
| サインイン | 「つなぐには、あなたの確認が要ります。」 | 「パスキーで続ける」 | 6.3 |
| 相手の許可 | 「<host> が、あなたの代わりに使うことを許可します。<host> のアカウントが要ります。」 | 「<host> で許可する」 | 同じ tab を `nextStep.url` へ |
| 権限 | 「この Agent は次のことをします: <権限の一覧>」 | 「許可して接続」 | 計画を読み直して `POST` |
| 準備が必要 | 「この Agent をつなぐには、<足りない物> が要ります。」 | 端末なら「端末を足す」（`/noah/mac` へ）。鍵なら、ボタンを出さず「鍵を入れてつなぐ機能は、まだありません。」 | — |

「やめる」は、シートを閉じるだけ。行が `needs_action` で残っていれば、`disconnect` を送る。

### 6.3 未サインインから

1. `sessionStorage['noah-connect-handoff']` に `{ agentId, id, at }` を置く（`components/rockstar-entitlement-claim.tsx` と同じ持ち方。値は接続の ID と Agent の ID だけ）。
2. `/account?returnTo=<今のパス>` へ移る。
3. 戻った時、カードを出す画面が handoff を読み、10 分以内なら、その Agent のボタンで ②（計画の読み直し）から続ける。`id` は同じ。読んだら消す。

## 7. 数える物（運営の画面。新しい表は作らない）

`SELECT state, place, COUNT(*), AVG(connected_at - created_at) FROM noah_connections WHERE created_at >= ? GROUP BY 1, 2`。出す値: 接続を押した数、`connected` に届いた数、届くまでのミリ秒の平均、`needs_action` で止まっている数、`failed` の `error` の上位。本人の ID と依頼の本文は出さない。

## 8. 試験

| 試験 | 前提 | 期待 |
| --- | --- | --- |
| 状態遷移（移す） | 10 状態 × 17 の出来事 | 決まっていない組み合わせは進まない。結果不明を自動でやり直さない |
| 表の制約（移す） | 同じ本人・同じ系列 | 切っていない接続は 1 件。切るとつなぎ直せる。置き場所と端末、状態と時刻の対 |
| 相手のサーバー（足す）`tests/noah-connect.test.mjs` | サインイン済み、鍵の要らない試験用の接続先、L2 済み | `POST` 1 回で `connected`。`tools_sha256` が入る。Mac の行（`noah_runner_commands`）が増えない |
| 相手の許可 | 401 と動的登録を返す試験用の接続先 | `needs_action` と `nextStep`。callback の後 `connected`。2 つ目の Agent（同じ接続先）は聞かれない |
| 家の端末 | 応答中の端末、今の 13 件の 1 つ | `noah_runner_commands` に connect が 1 件（`id` は接続の ID）。端末が `succeeded` を返すと `connected` |
| 端末が止まっている | `last_seen_at` が 31 秒前 | 計画は `setup`。`POST` は 422。行が増えない |
| 二重押し・再読込 | 同じ `id` で 3 回 | 行は 1 件。命令も 1 件。3 回とも同じ応答 |
| 条件が変わった | 計画を読んだ後に、接続要件の hash を変える | 409 と新しい計画。古い条件の行ができない |
| 再起動の後 | `connected` の後、端末の `boot_id` を変える → 頼む | 接続の命令が 1 件増える（同じ起動で 2 回頼んでも 1 件）。依頼は、命令が通った後に入る |
| 結果不明 | 命令を `unknown` にする | 接続は `unknown`。`retry` は 409。自動の再送なし |
| 切る | `connected` | `disconnected`。新しい依頼は 409。成果と利用の記録の行数が変わらない |
| 他人 | 別の本人の `id`、別の Origin、違う ownerScope | 404、403、409 |
| 未サインイン | handoff を置く → サインイン → 戻る | 同じ `id` で 1 件。10 分を越えた handoff は使わない |

## 9. 決めていない事

- 鍵を入れてつなぐ機能（保存の鍵 `NOAH_BROKER_KEY`、見せ方、消し方）。
- 有料の接続（flag `NOAH_PAY_AFTER_CONNECT`。task 78）。
- 置き場所を変える（`change_place`）、新しい版への入れ替え（task 93）。
- 復旧コードを、最初の成果の後に見せる案（account の安全の作りの変更。本人の決定が要る）。

## 10. 完了の定義

- `node --experimental-strip-types --test tests/noah-connect.test.mjs tests/noah-connect-plan.test.mjs` が通る。
- 幅 390 の実ブラウザで、サインイン済みの本人が、鍵の要らない相手のサーバーの Agent の「接続」を 1 回押して「頼む」になる。Mac を使わない。ボタンの下に送り先の 1 行が出る。
- 応答している家の端末がある本人は、今の 13 件でも「接続」1 回で「頼む」になる。Mac を再起動した後、「接続」を押し直さずに頼める。
- `npm run typecheck`、`npm run lint:product`。本番 D1 への migration は適用しない。

## 11. ローンチの範囲: 相手のサーバーへつなぐ・`/noah/ready` の 2 画面（[ローンチの最小限](mvp-launch.md) の L5）

ローンチまでに作るのは、この章に書いた範囲だけ。家の端末を同じボタンでつなぐ道（5.3・5.4）と、相手の許可の続き（シート）は、出した後に 1〜10 章のとおりに足す。

### 11.1 入れる物・後にする物

| 章 | ローンチまで | 後 |
| --- | --- | --- |
| 3 変える所 | migration（`noah_connections` だけ）、`lib/noah-connect.ts`、入口 2 つ、`noah-connect-button.tsx`、96 の `noah-card.tsx` と計画の API、新しい画面（11.5）、`noah-navigation.tsx` の 1 行 | `noah_connection_secrets`・`noah_oauth_*` の表、`noah-connect-sheet.tsx`、`noah-library.tsx` の節、`lib/noah-ask.ts` の家の端末の受け口。**`components/noah-launch.tsx`・`noah-public-catalog.tsx`・`noah-timeline.tsx` と、その API は触らない** |
| 4.1 `POST` | 取り込んだ系列（相手のサーバー）だけ。握手まで、その要求の中で終える（11.3） | 今の Agent（家の端末）、`nextStep`、有料 |
| 4.2 `GET` | 入れる（照合は無い） | 5.3 の照合 |
| 4.3 | `disconnect`・`retry` | `resume` |
| 5.2 状態と文 | `connected`・`failed`・`disconnected`・`blocked` と、途中の「準備しています…」 | `needs_action`・`unknown` |
| 5.3・5.4 | 無し | 全部 |
| 6.1・6.3 | 入れる | 6.2（シート） |
| 7 数える物 | 入れる | — |

### 11.2 この範囲で決めた事

| 決めた事 | 理由 |
| --- | --- |
| 新しい画面を 2 つ足す（一覧 `/noah/ready` と、詳細 `/noah/ready/agent?id=<系列の ID>`）。今の `/noah`・`/noah/agents`・`/noah/launch` は変えない | 今の Mac の道（task 71）は、本番の受入の途中。同じ画面と API を触らない。今の公開カタログの API は「D1 を読まない」決まりで書かれている（`lib/noah-public-catalog-api.ts` の先頭） |
| 接続は、要求 1 回の中で握手まで終え、結果を返す（202 と読み直しを使わない） | 握手の実測は中央値 1.2 秒・9 割が 2.1 秒以内。相手のサーバーへの接続は、途中で止まっても、やり直して害が無い |
| `agentId` は系列の ID（例 `mcp-registry:ac.mizan/registry`）。接続要件は、代表の候補の物 | 一覧と同じ ID で引ける |
| 載せていない系列（`noahListing` が偽）は、つなげない | 画面を通さない要求で、鍵の要る物・量産・取り下げた物へつながせない |
| 取り下げられた物へつないでいた接続は、次に使おうとした時に `blocked` にする | 台帳が外した記録（迷惑・悪意・違法の疑い）へ、送り続けない |

### 11.3 接続の処理（`POST /api/noah/connect`。本文は 4.1 と同じ）

1. 共通の検査。`noahAllowed(flags, 'ask', 審査者か)` が偽なら 503「今は、新しい接続を受け付けていません。」。未サインインは 401（画面は 6.3）。
2. 系列と、代表の候補・checks を読む。無ければ 404。`noahListing(…)` が偽なら 422「この Agent は、今はつなげません。」。
3. 計画（96 の 9.3）を作り、`noahPlanSha256` が本文の `planSha256` と違えば 409 と新しい計画。`blocked` と、入力の要る段があれば 422。
4. **つなぐ前の上限。** 新しく行を作る時だけ見る（同じ `id` の行がある時と、同じ系列の切っていない接続がある時は、数えずに 5 へ進み、5.1 の 3 のとおり、今ある行を返す）。[noah-listing-v1.sql](../contracts/noah-listing-v1.sql) の `connect_gate` で 3 つの数（切っていない接続・直近 60 秒に作った接続・直近 24 時間に作った接続）を取り、`noahConnectGate(counts, flags.askLimits)`（[noah-form-v1.ts](../contracts/noah-form-v1.ts)。既定は 50 件・10 件・100 件）。越えていれば、その status（409 か 429）と文。行を作らない。相手へ送らない。
5. 行を入れる（5.1 の 3 と同じ。`family_key` と `agent_id` は系列の ID、`digest` は候補の `record_sha256`、`place='provider'`、`consent_json = { "permissions": ["read_user_input", "write_results"], "sendsTo": <host>, "at": <今> }`、`price_json = { "model": "free" }`）。同じ `id` の再送と、同じ系列の別の `id` の扱いは 5.1 の 3 のとおり。
6. 状態を進める: `entitle_start` → `entitle_ok`（無料）→ `prepare_ok`。握手の前に、**接続先の枠を 1 つ取る**（`noah-listing-v1.sql` の `host_take`。`:limit` は `flags.askLimits.hostHandshakes`。1 つの接続先へ、利用者の操作から始める握手は、全員合わせて 60 秒に 60 回まで。相手が「混んでいる」と返して待っている間は 0 回）。取れたら、相手と握手する（全体で 8 秒。名乗りは `Noah/1 (+https://<origin>/noah/help#bot)`）。
   - 枠が取れない: `probe_failed`。`error`「この Agent は、今こんでいます。少し待ってから試してください。」（`NOAH_HOST_BUSY`）。相手へ送らない。
   - 通った: `probe_ok`。`tools_sha256`・`probe_ms`・`connected_at` を書く。系列の `connections` の列は、ローンチでは書かない（つないでいる人が居るかは、見回りが握手の時に `noah_connections` を見て決める。88 の 9.3。数を別に持つと、ずれる）。
   - 相手が 401: `probe_failed`。`error`「この Agent は、相手の許可が要るようになりました。まだ対応していません。」。86 の握手の結果と同じ書き込み（`level=0`・`result='auth_required'`・系列への写し。`checked_at` は書き換えない。87 の 11.4 の終わり）で、一覧から外す。
   - 相手が 429: `probe_failed`。`error`「相手のサーバーが混んでいます。少し待ってから試してください。」。`host_wait` で、`Retry-After`（無ければ 60 秒）の時刻まで待つ事を書く（その間、その接続先への接続・道具の一覧・依頼は、相手へ送らずに断る。巡回も握手しない）。
   - それ以外の失敗: `probe_failed`。`error`「相手のサーバーが応答しません。時間をおいて試してください。」。握手の表には書かない（外すかどうかは、巡回の 2 回続けた失敗で決める）。
7. 200 `{ "id", "state", "revision", "place": "provider", "placeLabel": "相手のサーバー（<host>）", "error"? }`。

更新は全部 `WHERE id=? AND revision=?`。要求が途中で落ちて `planned`〜`probing` のまま残った行は、30 秒たったら巡回の合図が切る（88 の 9.5。`disconnect`。本人には「接続」がもう一度出る）。

`disconnect`: 4.3 のとおり（許可の取り消しは無い）。終わっていない依頼は `stop` と同じ扱い。`retry`: `failed` から、3 と 6 をやり直す（行は作らないので、4 は見ない）。その行の `updated_at` から 5 秒たっていなければ 429「少し待ってから試してください。」（続けて押して、相手へ握手を送り続けない）。

取り下げ: 道具の一覧（87 の 11.3）と依頼（同）が、候補が `active` でない・系列が取り下げられている事を見つけたら、その接続へ `revoked` を当てて `blocked` にする（`error`「この Agent は、出どころから取り下げられました。使えません。」）。

### 11.4 その場のサインイン（6.3 のとおり。ローンチに入れる）

未サインインの人が「接続」を押した時だけ通る。`sessionStorage['noah-connect-handoff'] = { agentId, id, at }` を置いて `/account?returnTo=<今の詳細の画面のパスと query>` へ移り、戻った詳細の画面が、10 分以内の handoff を読んで、同じ `id` で計画の読み直しから続ける。**本人は「接続」を押し直さない。** `returnTo` に渡すのは `/noah/ready` で始まるパスだけ。

### 11.5 画面

一覧（`/noah/ready`）:

```
┌ すぐ使える Agent
│ [ 語で探す                              ]
│ ( すべて ) ( 押すだけで試せる )
├ つながっているもの
│   Mizan — mizan.ac                [ 頼む ]
├ 動いた
│   （カード）
├ まだ誰も動かしていない
│   （カード）…
│   （下まで来たら、続きを読む）
├ 自分の Mac で動かす Agent →
└ 出どころ: Official MCP Registry …
```

詳細（`/noah/ready/agent?id=…`）:

```
┌ Mizan                          提供: ac.mizan
│ （説明。提供者の文のまま）
│ 相手のサーバー（mizan.ac）・無料・道具 5 個
│ 最後に確かめた日 11/20
│ 入力は mizan.ac へ送られます。Noah が送るのは、あなたが入力した内容だけです。
│                                      [ 接続 ]
├ （つないだ後: 87 の 11.5 の、道具と入力欄と仕事）
├ [ 切る ]
└ 出どころ: Official MCP Registry。Noah が作った物ではありません。 報告・取り下げの申し出 →
```

| ファイル | 中身 |
| --- | --- |
| `app/noah/ready/page.tsx`・`app/noah/ready/agent/page.tsx` | 2〜3 行。下の部品を出すだけ（今の `app/noah/*/page.tsx` と同じ書き方）。詳細は、系列の ID を query の `id` で受ける（ID が `/` を含むので、パスに入れない。85 の 11.5） |
| `components/noah-ready.tsx` | 一覧。`GET /api/noah/intake`（85 の 11.5）を読み、`noah-card.tsx` を並べる。語の欄は 300 ミリ秒待ってから読む。「押すだけで試せる」は `oneTap=1`。下まで来たら `nextCursor` で続きを読む（今の `noah-public-catalog.tsx` の `IntersectionObserver` と同じやり方）。サインイン済みなら、上に「つながっているもの」（`GET /api/noah/connect`）。API が 404 の時は「まだ公開していません。」だけを出す |
| `components/noah-ready-detail.tsx` | 詳細。`GET /api/noah/intake?id=` と `GET /api/noah/connect-plan?agent=`。未接続なら `noah-connect-button.tsx`。`connected` なら `noah-ask.tsx` と `noah-work-list.tsx`（87）と「切る」。`blocked`・`failed` は `error` の文と、`failed` だけ「もう一度」 |
| `components/noah-connect-button.tsx` | 6.1 のとおり。違い: `POST` の応答で結果が決まるので、読み直しは行わない。押してから応答までは「準備しています…」（押せない） |
| `components/noah-navigation.tsx` | `destinations` に `['ready', '/noah/ready', 'すぐ使える']` を足す。`GET /api/noah/intake?limit=0` が 200 を返した時だけ出す（結果は `sessionStorage` に 10 分持つ）。閉じている間、審査者でない人には出ない |

見た目: 新しい画面は、今の `app/noah/layout.tsx` の中に出る（上段の「Noah / Eve」の切り替えは、そのまま）。class は、今の `components/noah-timeline.module.css` の物を使い、足りない分だけを `components/noah-ready.module.css` に足す。新しい色・字・余白の決まりを作らない。

画面の文:

| 所 | 文 |
| --- | --- |
| 段の見出し | 「つながっているもの」「動いた」「まだ誰も動かしていない」 |
| 段の下の 1 行 | 動いた: 「人が動かして、成果が返った物です。」／まだ: 「Noah が、応答する事だけを確かめた物です。」 |
| カードの印 | 96 の 6 章。ローンチで出るのは「1 クリック」「まだ誰も動かしていない」「あと 1 タップ（サインイン）」 |
| カードの補い | `oneTap` が真なら「押すだけで試せる」。`tools` があれば「道具 <n> 個」 |
| 送り先 | 「入力は <host> へ送られます。Noah が送るのは、あなたが入力した内容だけです。」 |
| 出どころ | 「出どころ: Official MCP Registry。Noah が作った物ではありません。説明は、提供者が書いた文のままです。」 |
| 窓口 | 「報告・取り下げの申し出」→ `/noah/help#bot` |
| Mac の行 | 「自分の Mac で動かす Agent」→ `/noah/launch`（今の画面。変えない） |
| 一覧が空 | 「今、並べられる物がありません。少し後で開いてください。」 |
| 探して無い | 「見つかりませんでした。別の語で探してください。」 |

出どころの書き方は、台帳の利用条件に合わせる（「Official MCP Registry から来たデータ」とは書ける。提携・公認と読める書き方はしない。[利用条件](https://modelcontextprotocol.io/registry/terms-of-service) の 6）。

### 11.6 試験（8 章に足す。`tests/noah-connect.test.mjs`・`tests/noah-ready-ui.test.mjs`）

| 試験 | 前提 | 期待 |
| --- | --- | --- |
| 状態遷移・表の制約（移す） | — | 型契約と DDL の検証 |
| つなぐ | サインイン済み、握手が通る試験用の相手、載せている系列 | `POST` 1 回で 200 `connected`。`tools_sha256`・`connected_at` が入る。`noah_runner_commands` の行が増えない |
| 相手が応答しない | 握手が時間切れ | 200 `failed` と 2 文の `error`。`retry` で `connected` |
| 相手が 401 | — | `failed`。系列が一覧から消える |
| 載せていない物 | 鍵の要る系列・量産・取り下げた系列の ID | 422。行ができない。相手へ 1 回も送らない |
| 二重押し・再読込 | 同じ `id` で 3 回 | 行は 1 件。握手は 1 回。3 回とも同じ応答 |
| 条件が変わった | 計画を読んだ後に、接続要件の hash を変える | 409 と新しい計画 |
| 同じ系列を 2 回 | 別の `id` で、同じ系列 | 前の行を 200 で返す。行は 1 件 |
| 切る | `connected` | `disconnected`。新しい依頼は 409。Work の行数が変わらない。もう一度つなげる |
| 取り下げの後 | つないだ後に、候補を `withdrawn` にして、道具の一覧を開く | 409。接続が `blocked` |
| 切り替え | `NOAH_ASK_FORM` が閉、審査者でない | 503 |
| つなぐ前の上限 | 切っていない接続が 50 件／直近 60 秒に 10 件作った／直近 24 時間に 100 件作った | 409／429／429。行ができない。相手が受けた要求は 0 回。同じ `id` の再送は、上限に達していても、今の行を返す |
| 接続先の枠 | 同じ接続先の系列へ、別々の本人が、60 秒の間に 61 回つなぐ | 61 回目は `failed`「この Agent は、今こんでいます…」。相手が受けた握手は 60 回。60 秒たつと通る |
| 相手が「混んでいる」 | 握手に 429 と `Retry-After: 120` | `failed`「相手のサーバーが混んでいます…」。120 秒の間、その接続先への接続・道具の一覧・依頼は、相手へ送らずに断る。巡回も握手しない |
| 続けて押す | `failed` の直後に `retry` を 3 回 | 2 回目と 3 回目は 429。相手が受けた握手は 1 回。5 秒後は通る |
| 他人 | 別の本人の `id`、別の Origin、違う ownerScope | 404、403、409 |
| 未サインイン | handoff を置く → サインイン → 戻る | 同じ `id` で 1 件。押し直さない。10 分を越えた handoff は使わない |
| 画面 | 既存の画面の試験と同じやり方 | カードの主ボタンは 1 つ。印が文字で出る。「入力は <host> へ送られます。」が、接続の前に出ている。出どころの文がある |

### 11.7 完了の定義（L5）

- `node --experimental-strip-types --test tests/noah-connect.test.mjs tests/noah-connect-plan-api.test.mjs tests/noah-ready-ui.test.mjs` が通る。
- 手元で、審査者の account と幅 390 のブラウザで、握手が通った実在の系列の「接続」を 1 回押して「頼む」になる（道具の一覧が出る所まで）。Mac を使わない。
- 切り替えが閉じている時、審査者でない人に、新しい画面と navigation の行が出ない。今の `/noah`・`/noah/agents`・`/noah/launch` の表示と API の応答が変わらない（`npm run verify`）。
- 本番 D1 への migration を適用していない。
