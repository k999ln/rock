# 仕様書 87 — 道具を持つ担当（1 文で頼む・入力欄で頼む）

task: [codex/tasks/87-noah-tool-agent.md](../../codex/tasks/87-noah-tool-agent.md)。先に要る物: 86（口）。74 と一緒に動いて初めて、本人の画面に出る。
型契約: [noah-tool-agent-v1.ts](../contracts/noah-tool-agent-v1.ts)、[noah-v1.sql](../contracts/noah-v1.sql)（`noah_asks`）。試験: [noah-tool-agent.test.mjs](../design-validation/noah/noah-tool-agent.test.mjs)（11 群）、[validate-noah-v1.py](../design-validation/noah/validate-noah-v1.py)（「頼む」の群）。

## 1. 完成の姿

- 相手のサーバーにつないだ Agent（中身は「道具」）へ、本人が 1 文で頼むと、成果が返る。道具を選んで呼ぶのは Noah の基盤。
- 道具が 1 つで入力が少ない時は、入力欄がそのまま出て、モデルを使わずに動く（費用 0）。
- 書き込みをする道具は、最初の 1 回、名前と入力を見せて確かめる。前面には割り込まず、「あなたの番」に出る。
- 頼んだ後に画面を閉じても、仕事は進む。

これは新しい Agent の品揃えではない。Eve → Noa → AMC → Jev の構造は変えない。

## 2. この仕様で決めた事

| 決めた事 | 理由 |
| --- | --- |
| 仕事の種類を 2 つに分ける。`form`（入力欄から道具を 1 回呼ぶ）と `agent`（1 文から、モデルが道具を選ぶ） | `form` はモデルも別の実行の場も要らない。今ある配備のまま出せる。`agent` は最長 240 秒・モデル 8 回で、1 つの要求の中では終わらない |
| `form` は、今の Web の本体の中で動かす（応答を返した後の `waitUntil`。待ちは 25 秒まで） | 新しい配備が要らない。越えた仕事は「結果を確かめられませんでした」にし、呼び直さない |
| `agent` は、専用の Worker（`services/noah-relay`）の Durable Object で動かす。1 つの仕事に 1 つ | 今の `services/noah-test-runtime`（Durable Object の alarm と、5 分ごとの cron）と同じ作り。**配備は本人の許可の後。** それまでは手元（`wrangler dev`）でだけ動く |
| 鍵と token は、専用の Worker へ渡さない。道具の呼び出しは、Web の本体へ頼み返す | 鍵を持つ所を 1 つにする（Broker）。専用の Worker が持つのは、依頼・途中のやり取り・モデルの鍵だけ |
| 途中のやり取り（依頼と道具の結果）は Durable Object の中にだけ置き、終わったら消す。D1 には状態と数だけ | 依頼と成果の本文は、既存 Work にだけ置く決まり |
| 道具の名前は、モデルの API が受ける形（英数字・`_`・`-`、64 文字まで）へ直して渡し、戻す | MCP の名前は `.`・`/`・`:` を含み、128 文字まである |
| 道具の定義が 32KB を越える時は、依頼の言葉に近い道具から入れる | 標本の 11.8% の接続先が 32KB を越える（最大 606KB） |

## 3. 今あるコードと、変える所

| ファイル | 今 | 変える事 |
| --- | --- | --- |
| `lib/noah-tool-agent.ts` | 無い | 型契約から全部を移す |
| `lib/workflow.ts` の `WorkJob` | `noahExecution?: NoahExecution` を持つ | `noahRemote?: NoahRemoteExecution` を足す（任意の項目。今の job は変わらない）。Noah の受け取り（423 行目付近。`noahExecution` を確かめている所）に、`noahRemote` の分岐を足す |
| `lib/noah-remote-work.ts` | 無い | 新規。`createNoahRemoteWork(id, value)`・`updateNoahRemoteWork(job, change)`。作りは `lib/noah-execution.ts` の `createNoahWork`・`updateNoahWork` に合わせる（4.1） |
| `drizzle/00NN_noah_asks.sql`、`db/schema.ts` | 無い | [noah-v1.sql](../contracts/noah-v1.sql) の `noah_asks` と索引 |
| `lib/noah-ask.ts`、`app/api/noah/ask/route.ts`、`app/api/noah/ask/[id]/route.ts` | 無い | 新規（5 章） |
| `lib/noah-relay-api.ts`、`app/api/noah/relay/route.ts` | 無い | 新規。専用の Worker からの頼み返しを受ける（6.3） |
| `services/noah-relay/src/worker.mjs`、`wrangler.jsonc` | 無い | 新規（6 章）。`services/noah-test-runtime` を土台にする |
| `components/noah-ask.tsx`、`components/noah-work-list.tsx` | 無い | 新規（7 章）。`components/noah-work.tsx`・`noah-execution-panel.tsx` は残す（家の端末の仕事の表示） |

変えない物: `lib/noah-execution.ts`（家の端末の仕事）、`noah_runner_commands`、`LIMITS`、Broker の実行前確認。

## 4. データ

### 4.1 Work（成果の正本）

`templateId: 'noah-agent-remote'`。`steps` は今と同じ 1 つ（`{ id: 'agent-result', title: 'Agentの結果を本人が確認', tool: 'noah-agent-remote', runner: 'noah-relay', passed: false }`）。

```ts
type NoahRemoteExecution = {
  connectionId: string; familyKey: string; digest: string;      // どの接続の、どの版か
  mode: 'agent' | 'form';
  prompt: string;                                               // form の時は、道具の名前と入力を 1 行にした物
  inputSha256: string;                                          // noahDigest(JSON.stringify([connectionId, mode, prompt, formInput ?? null]))
  toolsSha256: string;                                          // 頼んだ時の道具の定義
  state: 'queued' | 'running' | 'your_turn' | 'returned' | 'failed' | 'cancelled' | 'limit' | 'unknown';
  used: string[];                                               // 呼んだ道具の名前
  modelCalls: number; toolCalls: number; inputTokens: number; outputTokens: number;
  chargeMinor: 0; verification: 'relay_observed_unverified';
  startedAt?: number; completedAt?: number;
  result?: { text: string }; error?: string;
};
```

- 成果に添える 1 行（Work の `events` に足す）: 「<作者か提供者> の <Agent の名前> が、<使った道具> を使いました。費用 <金額か「未計測」>。」
- 成果の文は 131,072 bytes まで（`LIMITS.resultBytes`）。越えたら切って、「（長いので切りました）」を足す。

### 4.2 `noah_asks`（進み具合。本文は置かない）

列は [noah-v1.sql](../contracts/noah-v1.sql) のとおり。`state` と Work の `state` の対応: `succeeded` ↔ `returned`、`stopped` ↔ `cancelled`。他は同じ名前。

| 今 | 起きた事 | 次 |
| --- | --- | --- |
| （無し） | 受け付けた | `queued` |
| `queued` | 実行の場が取った | `running` |
| `running` | 読み取りだけでない道具を、初めて呼ぼうとした | `your_turn`（`pending_json` に道具の名前と入力） |
| `your_turn` | 本人が許可した／断った | `running`／`stopped`（Work は `cancelled`、理由「確認で断られたので止めました。」） |
| `running` | 成果が出た／モデルが応答しない／上限／本人が止めた | `succeeded`／`failed`／`limit`／`stopped` |
| `running` | lease が切れた | `unknown`（取り直さない） |

## 5. API

### 5.1 `POST /api/noah/ask`

本文 `{ "id": <UUID>, "connectionId": <UUID>, "prompt"?: <1 文>, "form"?: { "tool": <名前>, "input": { … } } }`。`prompt` と `form` は、どちらか一方。

処理の順:

1. 共通の検査（Origin、ownerScope、JSON）。本文は 16,000 bytes まで。`prompt` は 12,000 bytes まで（`LIMITS.inputBytes`）。
2. 接続を読む（`noah_connections`、同じ本人、`state='connected'`、`place='provider'`）。無ければ 404。`connected` でなければ 409「接続を確かめてください。」。置き場所が `home` の接続は、今の `/api/noah/launch` の run へ回す（74 が 1 つの入口にまとめる）。
3. 同じ `id` の行があれば、`request_sha256` を比べる。同じなら今の状態を 200 で返す。違えば 409「同じ操作IDの内容は変更できません。」。
4. 上限: その本人の、終わっていない依頼が 8 件あれば 409。今日の無料枠（`NOAH_FREE_RUNS_PER_DAY`、既定 10。`mode='agent'` だけを数える）を越えていれば 429「今日の無料の回数を使い切りました。明日また使えます。」。
5. `mode` を決める。`form` は、`noahDirectForm(今の道具)` が返す道具と同じ名前で、入力が `checkNoahToolArgs` を通る時だけ。`agent` は、flag `NOAH_MODEL_RELAY` が開いているか、本人が運営（`deps.reviewers`）の時だけ。閉じていれば 422「1 文で頼む機能は、まだ使えません。入力欄から使えます。」。
6. Work を作る（`createNoahRemoteWork`）。`noah_asks` に入れる（`INSERT OR IGNORE … WHERE (終わっていない数) < 8 RETURNING`）。
7. `form`: 202 を返し、`waitUntil` で 6.1 を行う。`agent`: 専用の Worker へ「始めて」を送り（6.2）、202 を返す。

応答 202 `{ "id", "workId", "state": "queued", "mode" }`。

### 5.2 `GET /api/noah/ask/[id]` と `GET /api/noah/ask`

1 件 `{ "id", "workId", "state", "mode", "revision", "pending"?: { "tool", "input" }, "used", "error"?, "createdAt", "updatedAt" }`。成果の文は Work から読む（`GET /api/work-jobs/[workId]`。既存）。一覧は、本人の新しい 50 件。

### 5.3 `POST /api/noah/ask/[id]`

本文 `{ "action": "stop" | "approve" | "deny" | "accept" | "redo", "revision": <数> }`。`revision` が今と違えば 409 と今の状態。

| action | 今の状態 | する事 |
| --- | --- | --- |
| `stop` | 終わっていない | `stop_requested=1`。`queued` なら、その場で `stopped`。`running` は、実行の場が次の区切りで止める。**止まった確認が返るまで、画面に「止めました」と出さない** |
| `approve` | `your_turn` | `noah_connections.confirmed_tools_json` にその道具の名前を足す。`running` に戻し、実行の場へ「続けて」を送る |
| `deny` | `your_turn` | `stopped`。道具は呼ばれない |
| `accept` | `succeeded` | 既存の検収（Work の `agent-result` を通す） |
| `redo` | `succeeded`・`failed`・`limit` | 新しい `id` で、前の成果の先頭 2,000 文字と直す点を付けて頼み直す（client が新しい `POST /api/noah/ask` を送る。この action は、元の仕事に「直してもらった」と記録するだけ） |

止めた後に遅れて届いた成功は採らない（`UPDATE … WHERE finished_at IS NULL AND (stop_requested=0 OR 新しい状態='stopped')`。検証キットが確かめている）。

## 6. 実行

### 6.1 `form`（Web の本体の中。`waitUntil`）

1. `UPDATE noah_asks SET state='running', lease_until=now+30000, step=1 WHERE id=? AND state='queued' RETURNING` で取る。
2. その接続先へ握手し、道具の定義の hash が `noah_connections.tools_sha256` と同じかを確かめる。違えば、接続を `needs_action`（「内容が変わりました。もう一度確かめてください。」）にし、仕事は `failed`。
3. 読み取りだけでない道具で、`confirmed_tools_json` に無ければ、`your_turn` にして終わる（許可の後、もう 1 回ここから）。
4. `stop_requested` を確かめる。道具を 1 回呼ぶ（待ち 25 秒）。**失敗しても呼び直さない。**
5. Work に成果を書く。`noah_asks` を `succeeded`（道具が `isError` を返したら `failed`、理由は道具の文の先頭 240 文字）。利用の記録を 1 行書く（94 が入るまでは、`noah_usage_events` へ直に `INSERT OR IGNORE`）。
6. 例外・時間切れ: `unknown`。「結果を確かめられませんでした。課金していません。」

成果の文の作り方: `structuredContent` があれば JSON を整えた文字列。無ければ、`content` の `type: 'text'` の物を改行でつなぐ。画像やファイルの部分は「（画像 1 件）」と書く（保存は後の task）。

### 6.2 `agent`（`services/noah-relay`）

Durable Object は仕事 1 つに 1 つ（名前は仕事の `id`）。保存する物: 依頼、途中のやり取り（`NoahAgentMessage[]`）、使った量、確かめた道具、次にやる事。終わったら全部消す。

| 入口 | 誰が呼ぶ | する事 |
| --- | --- | --- |
| `POST /asks/<id>/start` | Web の本体（`Authorization: Bearer <NOAH_RELAY_SECRET>`） | 本文の job（依頼、道具の定義、hash、上限、確かめた道具）を保存し、alarm を今に置く。同じ `id` の 2 回目は何もしない |
| `POST /asks/<id>/resume` | Web の本体 | `your_turn` の答え（許可／断り）を保存し、alarm を今に置く |
| `POST /asks/<id>/stop` | Web の本体 | 止める印を保存する |
| `alarm()` | 自分 | 1 step を進める（下）。続きがあれば、次の alarm を今に置く |
| `scheduled()`（5 分ごと） | Cloudflare | Web の本体へ「終わっていない仕事」を聞き、alarm が無い物の alarm を置き直す |

`alarm()` の 1 step（`runNoahToolAgent` の 1 周を、保存をはさんで行う）:

1. 止める印があれば、Web の本体へ `finish`（`stopped`）を送って消える。
2. 上限（モデル 8 回、道具 16 回、始めてから 240 秒）を確かめる。越えていれば `finish`（`limit`）。
3. モデルを呼ぶ（6.4）。失敗したら `finish`（`failed`）。
4. 道具の呼び出しが無ければ、`finish`（`succeeded`、成果の文）。
5. 道具の呼び出しごとに: 一覧に無い名前と、形の違う入力は、その理由を道具の結果として積む。読み取りだけでなく、確かめていない道具は、Web の本体へ `your_turn` を送り、ここで止まる（alarm を置かない）。それ以外は、Web の本体へ `call` を頼み、結果を積む。
6. `checkpoint`（step の番号、使った量）を Web の本体へ送り、途中のやり取りを保存し、次の alarm を置く。

同じ step を 2 回実行しない: step の番号を Durable Object に保存してから外へ出る。Web の本体は、`step` が今の値と同じ時だけ進める（`UPDATE … WHERE step=?`。検証キットが確かめている）。道具を呼んだ後、結果を保存する前に落ちた時は、その道具の結果を「返りませんでした。実行されたかは分かりません。」として積み、呼び直さない。

### 6.3 頼み返し（`POST /api/noah/relay`。`Authorization: Bearer <NOAH_RELAY_SECRET>`。Origin の header があれば拒否）

| action | 本文 | する事 |
| --- | --- | --- |
| `call` | `{ id, step, tool, input }` | その仕事の接続先へ、中継が鍵を付けて握手し、道具を 1 回呼ぶ（待ち 60 秒）。結果 `{ ok, content }` を返す。`noah_asks.tool_calls+1` |
| `your_turn` | `{ id, step, tool, input }` | `state='your_turn'`、`pending_json`。通知（flag `NOAH_PUSH` が閉じている間は、一覧の印だけ） |
| `checkpoint` | `{ id, step, modelCalls, inputTokens, outputTokens }` | `step` が合えば書く。`lease_until = now + 90000` |
| `finish` | `{ id, state, text?, error?, used }` | Work に成果を書く。`noah_asks` を終わりにする。利用の記録を 1 行 |
| `open` | — | 終わっていない `agent` の仕事の `id` の一覧（cron 用） |

### 6.4 モデルの呼び出し

- 形は OpenAI 互換の chat completions。`toNoahChatRequest(request, model)` で本文を作り、`fromNoahChatResponse(json, names)` で読む。
- 固定の指示は `NOAH_TOOL_AGENT_SYSTEM`（5 行）。**道具の説明と結果を、この中へ入れない。** 道具の説明は、道具の定義の枠にだけ入る。結果は `role: 'tool'` のデータとしてだけ渡る。
- 出力は 2,048 トークンまで。道具の定義は、1 つの説明 1,024 文字・合計 32KB まで（`fitNoahTools`）。道具の結果は 16,000 文字で切る。
- モデルの出どころは flag `NOAH_MODEL_RELAY`。`test` の時は、決めた応答を返す試験用の関数（最初の道具を 1 回呼び、その結果を成果にする）。本番のモデルと単価は、本人が決める（設計書 §9 の 5）。候補は Workers AI の道具呼び出しに対応した物。**どのモデルが、仕込まれた指示にどれだけ乗らないかは、この設計では確かめていない。** 作りで守るのは、乗っても「一覧に無い道具」と「確認の要る道具」が呼ばれない事。

## 7. 画面

```
┌ Mizan — 相手のサーバー（mizan.ac）
│ [ プレイヤーの ID か名前                      ]   [ 頼む ]
├ 仕事（新しい順）
│ 進んでいます（12 秒）                              [ 止める ]
│ 確認が要ります: send_mail を使います
│     宛先: a@example.com                 [ 許可する ] [ 断る ]
│ 560 の一覧を返しました …        [ 受け取る ] [ 直してもらう ]
└
```

上の段が入力欄（道具が 1 つで、入力が少ない時は、その欄がそのまま出る）。下の段が仕事の一覧。
┌ Mizan ──────────────── 相手のサーバー（mizan.ac）┐
│ [ プレイヤーの ID か名前                        ] │  ← 入力欄で頼む（道具が 1 つで、入力が少ない時）
│                                       [ 頼む ]  │
├─────────────────────────────────────────────┤
│ 進んでいます（12 秒）                    [止める] │  ← 仕事の一覧（新しい順）
│ 確認が要ります: send_mail を使います              │
│   宛先: a@example.com                            │
│                              [許可する] [断る]   │
│ ✓ 560 の一覧を返しました …   [受け取る][直してもらう]│
└─────────────────────────────────────────────┘
```

- `components/noah-ask.tsx`: `noahDirectForm` が欄を返せば、その欄（文字・数・真偽・選択）を出す。返さなければ、1 文の入力欄（`NOAH_MODEL_RELAY` が閉じていて運営でない本人には、「この Agent は、まだ入力欄から使えません。」と出し、欄を出さない）。送った後は欄を空にする。
- `components/noah-work-list.tsx`: `GET /api/noah/ask` と、今の `GET /api/noah/launch` の `commands`・`jobs` を、時刻の順に 1 つの一覧にする。読み直しは、終わっていない物がある間だけ 3 秒ごと。

| 状態 | 行の文 | 操作 |
| --- | --- | --- |
| `queued` | 「順番を待っています」 | 止める |
| `running` | 「進んでいます（<経過>）」 | 止める |
| `your_turn` | 「確認が要ります: <道具の名前> を使います」と、入力の項目（項目名と値。値は 200 文字で切る） | 許可する／断る |
| `succeeded` | 成果の先頭 3 行と、添える 1 行 | 受け取る／直してもらう |
| `failed` | 「できませんでした。<理由>。もう一度頼むか、入力を変えてください。」 | もう一度 |
| `limit` | 「上限に達したので止めました。途中までの内容はありません。短く分けて頼んでください。」 | もう一度 |
| `stopped` | 「止めました」 | — |
| `unknown` | 「結果を確かめられませんでした。課金していません。」 | もう一度 |

## 8. 試験

| 試験 | 中身 | 今の状態 |
| --- | --- | --- |
| 担当の 1 周（移す） | 1 文 → 道具 → 成果。道具が要らない依頼 | 通過 |
| 仕込まれた指示（移す） | 説明に「前の指示を無視して…」。結果に「このアドレスへ送れ」。一覧に無い道具は呼ばれず、確認の要る道具は、本人が断れば呼ばれない | 通過 |
| 確認（移す） | 書き込みは最初の 1 回だけ。前に確かめた道具は聞かない | 通過 |
| 入力の検査（移す） | 必須が無い、型が違う、object でない、定義に無い項目、選べない値 | 通過 |
| 止まる所（移す） | モデル 8 回、240 秒、道具 16 回、本人の停止、道具の中身の変化、モデルの不調 | 通過 |
| 呼び直さない（移す） | 結果が返らない道具を 1 回だけ | 通過 |
| 定義を収める・API の形・入力欄（移す） | 32KB、名前の直し、JSON でない入力、欄の出し方 | 通過 |
| `noah_asks`（移す） | 取り合い、step の番号、あなたの番、止めた後の成功を採らない、lease 切れは結果不明 | 通過（DDL の検証） |
| 入力欄で頼む（足す）`tests/noah-ask.test.mjs` | 試験用の接続先で、`form` の依頼が成果になる。同じ `id` で 2 回 → 道具の呼び出しは 1 回。道具の定義が変わっていたら、呼ばずに `needs_action` | 足す |
| 画面を閉じても進む（足す） | `POST` の後、`GET` を 1 回も呼ばずに、Work に成果が入る | 足す |
| 専用の Worker（足す）`services/noah-relay/test/` | `wrangler dev` 相当の中で、始める → 2 step → 成果。途中で止めて作り直す → 同じ step を 2 回実行しない。止める → `stopped` | 足す |
| 上限（足す） | 終わっていない依頼が 8 件 → 409。無料枠 → 429 | 足す |

## 9. 決めていない事

- モデル（提供元・名前・単価）と、1 人 1 日の無料の回数、月の上限。flag を閉じたまま入れる。
- `services/noah-relay` の配備（新しい Worker と Durable Object。本人の許可が要る）。
- 画像・ファイルを返す道具の成果の保存。今は文字だけ。
- 1 回の仕事で 2 つ以上の接続を使うこと。今は 1 つだけ（別の接続の成果や記憶を渡さない）。

## 10. 完了の定義

- `node --experimental-strip-types --test tests/noah-tool-agent.test.mjs tests/noah-ask.test.mjs` が通る。`services/noah-relay` の試験が通る。
- 手元で、鍵の要らない接続先（86 で L1 が付いた物）へ、入力欄から頼んで成果が出る。Mac を使わない。画面を閉じても Work に成果が残る。
- `npm run typecheck`、`npm run lint:product`、`npm run work:check`（`WorkJob` に足した項目が、今の検査を壊さない事）。
- 本番への配備と、本番 D1 への migration は行わない。PR 本文に、要る事を書く。
