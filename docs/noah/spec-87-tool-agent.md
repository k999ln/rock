# 仕様書 87 — 道具を持つ担当（1 文で頼む・入力欄で頼む）

task: [codex/tasks/87-noah-tool-agent.md](../../codex/tasks/87-noah-tool-agent.md)。先に要る物: 86（口）。74 と一緒に動いて初めて、本人の画面に出る。ローンチ分（11 章。L6）で先に要るのは、74 のローンチ分（L5。`noah_connections` と「接続」）まで。
型契約: [noah-tool-agent-v1.ts](../contracts/noah-tool-agent-v1.ts)、[noah-form-v1.ts](../contracts/noah-form-v1.ts)、[noah-v1.sql](../contracts/noah-v1.sql)（`noah_asks`）。試験: [noah-tool-agent.test.mjs](../design-validation/noah/noah-tool-agent.test.mjs)（10 群）、[noah-form.test.mjs](../design-validation/noah/noah-form.test.mjs)（11 群）、[validate-noah-v1.py](../design-validation/noah/validate-noah-v1.py)（「頼む」の群）。

**ローンチまでに作る範囲は 11 章（入力欄で頼む。道具を選ぶ画面を含む）。** 1〜10 章の「1 文で頼む」は、出した後に足す。11 章と食い違う所は、ローンチまでは 11 章が勝つ。

## 1. 完成の姿

- 相手のサーバーにつないだ Agent（中身は「道具」）へ、本人が 1 文で頼むと、成果が返る。道具を選んで呼ぶのは Noah の基盤。
- 道具を選んで、入力欄を埋めて頼むこともできる。モデルを使わずに動く（費用 0）。使える道具が 1 つだけの時は、入力欄がそのまま出る。
- 書き込みをする道具は、最初の 1 回、名前と入力を見せて確かめる。前面には割り込まず、「あなたの番」に出る。
- 頼んだ後に画面を閉じても、仕事は進む。

これは新しい Agent の品揃えではない。Eve → Noa → AMC → Jev の構造は変えない。

## 2. この仕様で決めた事

| 決めた事 | 理由 |
| --- | --- |
| 仕事の種類を 2 つに分ける。`form`（入力欄から道具を 1 回呼ぶ）と `agent`（1 文から、モデルが道具を選ぶ） | `form` はモデルも別の実行の場も要らない。今ある配備のまま出せる。`agent` は最長 240 秒・モデル 8 回で、1 つの要求の中では終わらない |
| `form` は、今の Web の本体の中で動かす（応答を返した後の `waitUntil`。握手 8 秒・呼び出し 20 秒まで） | 新しい配備が要らない。Workers が応答の後に続けられるのは 30 秒。越えた仕事は「結果を確かめられませんでした」にし、呼び直さない |
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
- 終わった Work は `review`（止めた時は `cancelled`）。`steps` は通した事にしない（`normalizeWorkJob` に `noah-agent-remote` の枝を足す: `noahRemote` があり、`verification` が `relay_observed_unverified`、`chargeMinor` が 0、通った step が無い事。今の `noah-agent-local` の枝と同じ形）。

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
5. `mode` を決める。`form` は、`noahToolForm(その道具)` が使えて、入力が `noahFormArgs` と `checkNoahToolArgs` を通る時だけ（11 章）。`agent` は、flag `NOAH_MODEL_RELAY` が開いているか、本人が運営（`deps.reviewers`）の時だけ。閉じていれば 422「1 文で頼む機能は、まだ使えません。入力欄から使えます。」。
6. Work を作る（`createNoahRemoteWork`）。`noah_asks` に入れる（`INSERT OR IGNORE … WHERE (終わっていない数) < 8 RETURNING`）。
7. `form`: 202 を返し、`waitUntil` で 6.1 を行う。`agent`: 専用の Worker へ「始めて」を送り（6.2）、202 を返す。

応答 202 `{ "id", "workId", "state": "queued", "mode" }`。

### 5.2 `GET /api/noah/ask/[id]` と `GET /api/noah/ask`

1 件 `{ "id", "workId", "state", "mode", "revision", "pending"?: { "tool", "input" }, "used", "error"?, "result"?: { "text", "truncated", "attachments" }, "createdAt", "updatedAt" }`。`result` は、終わった依頼の成果の文（正本は Work。この API が、同じ本人の Work から読んで返す）。一覧は、本人の新しい 50 件で、`result` を持たない（一覧の読み直しで、成果の本文を毎回読まないため）。画面は、`succeeded` になった行ごとに 1 回だけ、1 件の方を読む。

### 5.3 `POST /api/noah/ask/[id]`

本文 `{ "action": "stop" | "approve" | "deny" | "redo", "revision": <数> }`。`revision` が今と違えば 409 と今の状態。

| action | 今の状態 | する事 |
| --- | --- | --- |
| `stop` | 終わっていない | `stop_requested=1`。`queued` なら、その場で `stopped`。`running` は、実行の場が次の区切りで止める。**止まった確認が返るまで、画面に「止めました」と出さない** |
| `approve` | `your_turn` | `noah_connections.confirmed_tools_json` にその道具の名前を足す。`running` に戻し、実行の場へ「続けて」を送る |
| `deny` | `your_turn` | `stopped`。道具は呼ばれない |
| `redo` | `succeeded`・`failed`・`limit` | 新しい `id` で、前の成果の先頭 2,000 文字と直す点を付けて頼み直す（client が新しい `POST /api/noah/ask` を送る。この action は、元の仕事に「直してもらった」と記録するだけ） |

止めた後に遅れて届いた成功は採らない（`UPDATE … WHERE finished_at IS NULL AND (stop_requested=0 OR 新しい状態='stopped')`。検証キットが確かめている）。

## 6. 実行

### 6.1 `form`（Web の本体の中。`waitUntil`）

1. `UPDATE noah_asks SET state='running', lease_until=now+30000, step=1 WHERE id=? AND state='queued' RETURNING` で取る。
2. その接続先へ握手し、道具の定義の hash が `noah_connections.tools_sha256` と同じかを確かめる。違えば、接続を `needs_action`（「内容が変わりました。もう一度確かめてください。」）にし、仕事は `failed`。
3. 読み取りだけでない道具で、`confirmed_tools_json` に無ければ、`your_turn` にして終わる（許可の後、もう 1 回ここから）。
4. `stop_requested` を確かめる。道具を 1 回呼ぶ（待ち 20 秒）。**失敗しても呼び直さない。**
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
│ 560 の一覧を返しました …            [ 開く ] [ 直してもらう ]
└
```

上の段が入力欄（道具を選ぶ画面と、その道具の欄。形は 11.5）。下の段が仕事の一覧。

- `components/noah-ask.tsx`: 道具を選ぶ画面と入力欄（11.5）。「1 文で頼む」が使える本人（`NOAH_MODEL_RELAY` が開いているか、運営）には、その上に 1 文の入力欄を足す。1 文の欄は、送った後に空にする。
- `components/noah-work-list.tsx`: `GET /api/noah/ask` と、今の `GET /api/noah/launch` の `commands`・`jobs` を、時刻の順に 1 つの一覧にする。読み直しは、終わっていない物がある間だけ 3 秒ごと。

| 状態 | 行の文 | 操作 |
| --- | --- | --- |
| `queued` | 「順番を待っています」 | 止める |
| `running` | 「進んでいます（<経過>）」 | 止める |
| `your_turn` | 「確認が要ります: <道具の名前> を使います」と、入力の項目（項目名と値。値は 200 文字で切る） | 許可する／断る |
| `succeeded` | 「結果を受け取りました」と、成果の先頭 3 行、添える 1 行 | 開く／直してもらう |
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

## 11. ローンチの範囲: 入力欄で頼む（[ローンチの最小限](mvp-launch.md) の L6）

ローンチまでに作るのは、この章に書いた範囲だけ。「1 文で頼む」（モデル・専用の Worker・「あなたの番」）は、出した後に 1〜10 章のとおりに足す。
型契約: [noah-form-v1.ts](../contracts/noah-form-v1.ts)（L4 で `lib/noah-form.ts` へ移してある）。試験: [noah-form.test.mjs](../design-validation/noah/noah-form.test.mjs)（11 群）。

### 11.1 入れる物・後にする物

| 章 | ローンチまで | 後 |
| --- | --- | --- |
| 1 完成の姿 | 入力欄で頼む。**道具が幾つあっても、選ぶ画面から頼める**（「道具が 1 つで入力が少ない時だけ」の条件をやめる）。画面を閉じても進む | 1 文で頼む。「あなたの番」 |
| 3 変える所 | `lib/workflow.ts`、`lib/noah-remote-work.ts`、migration（`noah_asks`）、`lib/noah-ask.ts` と入口 2 つ、`components/noah-ask.tsx`・`noah-work-list.tsx` | `lib/noah-tool-agent.ts`、`lib/noah-relay-api.ts`、`app/api/noah/relay`、`services/noah-relay` |
| 4 データ | Work は `mode: 'form'` だけ。`noah_asks` の状態は `queued`・`running`・`succeeded`・`failed`・`stopped`・`unknown` を使う | `your_turn`・`limit`、`pending_json`、`step`、モデルの使用量の列 |
| 5 API | 11.3 の形（`prompt` は受けない。`approve`・`deny`・`redo` は無い） | 5 章の全部 |
| 6 実行 | 11.4（6.1 を置き換える） | 6.2〜6.4 |
| 7 画面 | 11.5 | 1 文の入力欄 |

### 11.2 この範囲で決めた事

| 決めた事 | 理由（握手が通った 276 host・道具 3,699 個の実測） |
| --- | --- |
| 道具を選ぶ画面を足す | 道具が 1 つだけの接続先は 11（4.0%）。選ぶ画面があれば、使える道具が 1 つ以上ある接続先は 274（99.3%）、道具の 95.5% が入力欄で使える |
| 確かめは、送る前に画面で行う。「あなたの番」の往復を使わない | 本人が画面に居て、本人が道具を選び、本人が項目を埋めた直後。確かめが要る道具（読み取りだけの宣言が無い）は、使える道具の 31.0% |
| 確かめた記録は、名前と、その時の定義の hash の組（`[{ "name", "sha256" }]`） | 確かめた後に、道具の説明や入力の形が変わったら、確かめ直す |
| 呼ぶ前に照らすのは、**その道具 1 つの定義**（`noahToolSha256`）。本人が入力欄を開いた時の値と、呼ぶ時の値が同じ時だけ呼ぶ | 本人が見ていない定義で呼ばない。関係の無い道具の説明が変わっただけでは止めない（接続先の全部の道具の定義が、1 時間あけた 2 回の握手で変わっていた割合は、仕様書 86 の 10.2） |
| 応答を返した後の実行は、握手 8 秒・呼び出し 20 秒まで | Workers が応答の後に続けられるのは 30 秒。握手の実測は中央値 1.2 秒・9 割が 2.1 秒以内 |
| 入力欄に無い項目は、道具へ渡さない。提供者の正規表現（`pattern`）は実行しない | 画面を通さない要求で、定義に無い入力を送らせない。提供者の式で、Noah の計算を止めさせない |
| 成果は、文字の部分を先に採る。全体が JSON の成果は、項目ごとの行にして出す | 道具の成果は、モデルが読む前提の JSON が多い。値と並びは変えない |
| 道具の定義は、D1 に保存しない。選ぶ画面を開くたびに、相手から読む | 定義は相手の物で、変わる。大きい（中央値 4.9KB、9 割が 26.6KB 以下、最大 627KB） |

### 11.3 API（ローンチ版）

**`GET /api/noah/connect/[id]/tools`**（サインイン済み。同じ本人の、`connected` で `place='provider'` の接続）

**この入口は、L5 で入れた**（`lib/noah-connect.ts` の `tools`。握手は `lib/noah-user-handshake.ts`。試験は `tests/noah-connect.test.mjs`）。作る時に決めた事: ① `noahAllowed(flags, 'ask', 審査者か)` が偽なら 503「今は、新しい依頼を受け付けていません。」（閉じている間、相手へ握手を送らない）。② 相手へ送る前に、使ってよい接続かを確かめる（`usable`。取り下げ・接続先や条件の変更。[74](spec-74-one-click-connect.md) の 11.3 の終わり）。③ `last_used_at` は、握手の前に書く（同時の 2 回目も止める。失敗の直後に開き直しても、5 秒は相手へ送らない）。`revision` と `updated_at` は変えない。④ 握手の失敗は、相手の応答ごとの文（11.4 の表の「握手の時」）で返す。status は、401・402 が 409、429 と枠が無い時が 429、それ以外が 502。⑤ `?tool=<名前>` の応答は、その 1 つだけを `tools` に入れ、`form` と `description`（説明の全文。4,000 文字まで。改行は保つ）を付ける。無い名前は 404「道具が見つかりません。」。⑥ 握手のセッションを閉じる要求は、応答の後に回す（`waitUntil`）。

1. その接続の `last_used_at` が 5 秒以内なら 429「少し待ってから開いてください。」（同じ接続先へ、続けて握手しない）。続けて、接続先の枠を 1 つ取る（[noah-listing-v1.sql](../contracts/noah-listing-v1.sql) の `host_take`。`:limit` は `flags.askLimits.hostHandshakes`。74 の 11.3 の 6 と同じ枠）。取れなければ 429「この Agent は、今こんでいます。少し待ってから試してください。」（`NOAH_HOST_BUSY`）。どちらも、相手へ送らない。
2. 相手と握手する（全体で 8 秒）。失敗は 502「相手のサーバーが応答しません。時間をおいて試してください。」。相手が 429 を返したら 429「相手のサーバーが混んでいます。少し待ってから試してください。」とし、`host_wait` で `Retry-After`（無ければ 60 秒）の時刻まで待つ事を書く。相手が 401 を返したら 409「この Agent は、相手の許可が要るようになりました。まだ対応していません。」とし、86 の握手の結果と同じ書き込み（`level=0`、`result='auth_required'`、系列への写し）を行う。
3. `noahToolMenu(tools, confirmed_tools_json)` を返す。`last_used_at` を今にする。握手は閉じる。

```json
{ "host": "mizan.ac", "toolsSha256": "<64 hex>", "tools": [
    { "name": "lookup_player", "summary": "A player id, profile link or name…", "readOnly": true, "sha256": "<64 hex>", "usable": true, "required": 1, "needsConfirm": false,
      "form": { "usable": true, "tool": "lookup_player", "fields": [ { "name": "query", "label": "query", "help": "A player id…", "kind": "text", "required": true, "maxLength": 200 } ], "fixed": {}, "omitted": 0 } } ] }
```

- `form` は、並びの先頭から 100 個の使える道具にだけ付ける。それより後ろは `form: null` で、`?tool=<名前>` を付けて読んだ時に、その 1 つを `form` と説明の全文（4,000 文字まで）つきで返す（道具が 100 個を越える接続先は 7／276）。
- 応答は `Cache-Control: no-store, private`。画面は、同じ接続について 5 分間、`sessionStorage` の値を使ってよい。

**`POST /api/noah/ask`** 本文 `{ "id": <UUID>, "connectionId": <UUID>, "form": { "tool": <名前>, "toolSha256": <64 hex>, "input": { … }, "confirm"?: true }, "screen"?: "narrow" | "wide" }`

`screen` は、頼んだ画面の幅の区分（`window.innerWidth < 600` なら `narrow`）。「スマホで使われるか」を数えるためだけに `noah_asks.screen` へ入れる。他の値は入れない。同じ操作の検査（5）には使わない。

1. 共通の検査（Origin、ownerScope、JSON）。本文は 16,000 bytes まで。`form.tool` は `[A-Za-z0-9_.:/-]{1,128}`、`toolSha256` は hex 64 桁、`input` は object。違えば 400。`prompt` を持つ本文は 422「1 文で頼む機能は、まだ使えません。入力欄から使えます。」。
2. `noahAllowed(flags, 'ask', 審査者か)` が偽なら 503「今は、新しい依頼を受け付けていません。」。
3. 接続を読む（同じ本人、`place='provider'`）。無ければ 404。`connected` でなければ 409「接続を確かめてください。」。
4. その接続の候補が `active` で、系列が取り下げられていない事。違えば 409「この Agent は、取り下げられました。使えません。」。同意した時から接続先や条件が変わっていれば 409「この Agent の接続先や条件が変わりました。切って、つなぎ直してください。」（3 と 4 は、`lib/noah-connect.ts` の `usable(owner, id)` を呼ぶ。L5 で入れた）。
5. 同じ `id` の行があれば、`request_sha256`（`noahFormRequestSha256({ connectionId, tool, toolSha256, args: input })`）を比べる。同じなら今の状態を 200 で返す。違えば 409「同じ操作IDの内容は変更できません。」。`confirm` は hash に入れない。
6. 上限: [noah-listing-v1.sql](../contracts/noah-listing-v1.sql) の `gate` で 4 つの数を取り、`noahAskGate(counts, flags.askLimits)`。越えていれば、その status と文。通ったら、接続先の枠を 1 つ取る（`host_take`。この依頼の握手の分。接続・道具の一覧と同じ枠）。取れなければ 429（`NOAH_HOST_BUSY`）。どちらの時も、Work も行も作らない。
7. Work を作る（`createNoahRemoteWork`。`mode: 'form'`、`prompt` は「<道具の名前> <入力の JSON>」を 1,000 文字で切った物）。`noah_asks` に入れる（`mode='form'`、`host`、`tool`、`tool_sha256`。`INSERT OR IGNORE … WHERE (その本人の終わっていない数) < :open RETURNING *`。行が返らなければ 409）。
8. 202 `{ "id", "workId", "state": "queued", "mode": "form" }` を返し、`defer(run(id, input, confirm))`（`waitUntil`。`lib/noah-outbox-server.ts` と同じ渡し方）。

**`GET /api/noah/ask/[id]`**・**`GET /api/noah/ask?connection=<接続の ID>`** → 5.2 と同じ形から `pending` と `used` を除き、`tool` と `host` を足した物。`result`（全文）は 1 件の方だけ。一覧（新しい 50 件）は `noah_asks` の行だけを読む。

**`POST /api/noah/ask/[id]`** 本文 `{ "action": "stop", "revision": <数> }`。`queued` なら、その場で `stopped`。`running` なら `stop_requested=1`（相手で実行が始まっていれば止められない。届いた成果は採らない。画面の文は「止めました。相手のサーバーで実行されたかは分かりません。」）。 実行の場が無くなっている依頼（`running` のまま、`lease_until` を過ぎて 5 秒）は、その場で `stopped` にする（止める事を頼んでも、聞く相手が居ない。巡回の合図を待たせない。88 の 9.5）。

成果を受け取る操作は無い。成果が Work に入った時点で、行に「結果を受け取りました」と出す（今の Noah の仕事と同じ。`components/noah-execution-panel.tsx` の `returned` の文）。Work は `review` のままで、step を通した事にはしない（相手のサーバーが返した内容を、Noah は確かめていない。`verification: 'relay_observed_unverified'`。今の `noah-agent-local` と同じ決まり）。

### 11.4 実行（`run`。応答を返した後、同じ実行の中で続ける）

1. `UPDATE noah_asks SET state='running', lease_until=?+30000, revision=revision+1, updated_at=? WHERE id=? AND state='queued' AND stop_requested=0 RETURNING *`。行が返らなければ終わり（止められた、または 2 回目）。Work を `running` にする。
2. 相手と握手する（全体で 8 秒。握手に渡す `ctx.signal` を `AbortSignal.timeout(8_000)` にする。8 の呼び出しには、この signal を渡さない）。名乗りは `user-agent: Noah/1 (+https://<origin>/noah/help#bot)`。失敗 → `failed`「相手のサーバーが応答しません。時間をおいて試してください。」。401 → `failed`「この Agent は、相手の許可が要るようになりました。まだ対応していません。」と、11.3 の 2 と同じ書き込み。
3. 道具を名前で探す。無い、または `noahToolSha256(道具) !== tool_sha256` → `failed`「この道具の内容が変わりました。入力欄を開き直してください。」（呼ばない）。
4. もう一度、候補が `active` で、系列が取り下げられていない事を確かめる（握手の間に外された物を呼ばない）。
5. `noahToolForm(道具)` が使えない → `failed`「この道具は、入力欄では使えません。」。`noahFormArgs(form, input)` が誤り → `failed`（その文）。`checkNoahToolArgs(道具の定義, args)` が誤り → `failed`「入力の形が、道具の定義と合いません。」。
6. 確かめ: 道具が読み取りだけでなく、`confirmed_tools_json` に同じ組（名前と hash）が無い時。`confirm !== true` → `failed`「この道具は、最初の 1 回、内容を確かめてから使います。」。`confirm === true` → 組を足す（`UPDATE noah_connections SET confirmed_tools_json=?, revision=revision+1 WHERE id=? AND revision=?`。同じ名前の古い組は置き換える）。
7. 道具を呼ぶ直前に、依頼の行へ「相手へ送る」の印を付ける: `UPDATE noah_asks SET tool_calls=1 WHERE id=? AND owner_id=? AND finished_at IS NULL AND stop_requested=0`（版は進めない）。付かなければ、呼ばない（止める事が頼まれていれば `stopped`。もう終わっていれば、何もしない）。印を付けてから呼ぶので、実行の場が途中で落ちても、後始末が「送っていない」と「送ったかもしれない」を分けられる（88 の 9.5。L7 で、止める印を読むだけの作りから、替えた）。
8. 道具を 1 回呼ぶ（`noahMcpCall(session, tool, args, ctx, 20_000)`）。**失敗しても呼び直さない。** 送るのは、道具の名前と `args` だけ。本人の名前・account・端末の情報は送らない。送り先は、接続の時に見せた host だけ（`createNoahGuardedFetch(fetch, { sameHost: true })`。相手が別の host へ転送しても、従わない）。
9. `noahResultText(結果)` を Work に書く（`returned`、`result: { text }`。添える 1 行は「<host> の <道具の名前> が返した内容です。費用 0。」）。`noah_asks` を `succeeded`。道具が `isError` を返したら `failed`、理由は文の先頭 240 文字。書き方は `UPDATE … WHERE finished_at IS NULL AND (stop_requested=0 OR ?='stopped')`（止めた後に届いた成功は採らない）。
10. 成功した時: 接続の `last_used_at` を今にする。その接続の系列を「動いた」にする（88 の 9.2）。
11. 握手を閉じる（`noahMcpClose`。成果と状態を書き終えた後に行う。閉じる要求が、実行の残り時間に収まらずに切られても、依頼の結果は変わらない）。
12. 呼び出しの途中の例外・時間切れ: `unknown`「結果を確かめられませんでした。相手のサーバーで実行されたかは分かりません。」。実行そのものが落ちた依頼（`running` のまま `lease_until` を過ぎた物）は、巡回の合図の後始末が終える: 7 の印が付いていれば `unknown`、付いていなければ `failed`「途中で止まりました。相手のサーバーへは、送っていません。もう一度頼んでください。」（88 の 9.5）。**取り直して呼び直さない。**

1 件の依頼が相手へ送る要求は、握手 3 回（`initialize`・通知・`tools/list`）、呼び出し 1 回、閉じる 1 回（セッションを使う相手だけ。実測で 10.5%）。

相手の応答と、依頼の結果（`NoahMouthError.code` → 状態と文。2・8 の中身）:

| 相手 | 握手の時 | 呼び出しの時 |
| --- | --- | --- |
| 401（`auth_required`） | `failed`「この Agent は、相手の許可が要るようになりました。まだ対応していません。」。一覧から外す | 同じ |
| 402（`payment_required`） | `failed`「この Agent は、呼ぶたびの支払いが要るようになりました。まだ対応していません。」。一覧から外す | 同じ |
| 403（`forbidden`） | `failed`「相手のサーバーが、Noah からの接続を断りました。」（接続・道具の一覧でも同じ文を使うので、「この依頼」と書かない） | `failed`「相手のサーバーが、この依頼を断りました。」 |
| 429（`rate_limited`） | `failed`「相手のサーバーが混んでいます。少し待ってから試してください。」。`host_wait` で、その接続先の `noah_probe_hosts.not_before` に `Retry-After`（無ければ 60 秒）の時刻を入れる（その時刻まで、巡回も、利用者の操作から始める握手も、相手へ送らない） | 同じ |
| 応答しない（`unreachable`） | `failed`「相手のサーバーが応答しません。時間をおいて試してください。」 | `unknown`（送った後なので、実行されたかが分からない） |
| 相手が、決まった形のエラーを返した（`incompatible` で、`detail.rpc` がある） | `failed`「相手のサーバーの応答を読めませんでした。」 | `failed`「相手のサーバーが、この入力を受け付けませんでした。」と、相手の文の先頭 200 文字（文字として出す） |
| 応答を読めない（`incompatible` で、`detail.rpc` が無い） | `failed`「相手のサーバーの応答を読めませんでした。」 | `unknown` |
| 大きすぎる（`too_large`。1MB を越えた） | `failed`「相手のサーバーの応答を読めませんでした。」 | `failed`「成果が大きすぎて、受け取れませんでした。相手のサーバーでは、実行されています。」 |
| つなげない（`blocked`） | `failed`「この接続先にはつなげません。」 | — |

依頼の失敗で、握手の表の `failures` は増やさない（外すかどうかは、巡回の握手だけで決める。1 人の依頼の失敗で、全員の一覧から外さない）。401 と 402 だけは、相手の作りが変わった事がはっきりしているので、その場で書く（`result`・`level=0`・`auth`・`next_check_at` と、系列への写し）。この時、`checked_at` は書き換えない（巡回が最後に握手した時刻のまま。巡回の間隔を数える問い合わせに、利用者の操作を混ぜない。[97](spec-97-launch-ops.md) の 6 章）。接続（74 の 11.3）と道具の一覧（11.3）で 401・402 が分かった時も同じ。

### 11.5 画面

```
┌ Mizan — 相手のサーバー（mizan.ac）
│ 道具を選ぶ                              [ 語で絞る ]  ← 道具が 13 個以上の時だけ
│ ▸ lookup_player          読み取りだけ
│     A player id, profile link or name…（説明の先頭。2 行で切る）
│ ▸ registry_stats         読み取りだけ ・ 押すだけ
│ ▸ configure_feed         入力欄ではまだ使えません          ← 薄く出す。押せない
├ lookup_player
│ query *
│ [                                            ]
│ A player id, profile link or name…
│ ▸ 細かい設定（2）
│ 入力は mizan.ac へ送られます。
│                                              [ 頼む ]
├ 仕事（新しい順）
│ 進んでいます（3 秒）                           [ 止める ]
│ lookup_player — mizan.ac が返した内容です。
│   560 件 …（先頭 3 行）                    [ 開く ]
└
```

`components/noah-ask.tsx`（props: `connection`、`ownerScope`）:

**L6 で、下の表の全部を入れた（11.8）。** L5 で入れた分（2026-11-21。[74](spec-74-one-click-connect.md) の 11.5）: 下の表の「道具の一覧」の行のうち、並び・名前・説明の先頭 2 行・印の 3 つまで（props は `connectionId` と、使えなくなっていた時に詳細の画面へ知らせる `onUnusable`）。読んだ一覧は、この tab が 5 分持つ（`sessionStorage['noah-tools:' + 接続の ID]`。11.3 の「5 分間、画面が読んだ値を使う」）。語で絞る欄・1 つだけの時に入力欄を出す・入力欄から下は、L6 で、この部品に足す（props を、表のとおり `connection`・`ownerScope` に広げる）。

| 面 | 決まり |
| --- | --- |
| 道具の一覧 | `GET …/tools` の並びのまま。行は、名前（提供者が付けた名前のまま）、説明の先頭（2 行で切る）、印。印は「読み取りだけ」（`readOnly`）、「押すだけ」（`readOnly` で `required === 0`）、「送る前に確かめます」（`needsConfirm`。11.8）、「入力欄ではまだ使えません」（`usable` が偽。薄く出し、押せない）。道具が 13 個以上なら、名前と説明を語で絞る欄を上に出す（21.4% の接続先）。使える道具が 1 つだけなら、一覧を出さずに入力欄を出す |
| 入力欄 | 必須の欄を先に、定義の順で。任意の欄は「細かい設定（n）」の中（閉じた状態）。`omitted > 0` なら、その中に「ほかに n 個の設定があります（入力欄では使えません）。」。欄の下に `help`（提供者の文のまま）。`default` は欄に入れて見せる |
| 欄の形 | `text`: 1 行から伸びる textarea（`format` が `date`・`email`・`uri` なら、その形の input）。`number`: `inputmode="decimal"`（`integer` なら `numeric`）。`boolean`: 「はい／いいえ」（任意の欄は「指定しない」を足す）。`choice`: 7 個以下は横に並ぶ選択、それより多ければ select。`list`: 1 行に 1 つの textarea。選択肢があれば複数選択 |
| その場の検査 | `noahFormArgs` を使う。誤りは、その欄の下に出す（文は関数が返す）。主ボタンは「頼む」1 つ |
| 確かめ | `needsConfirm` の道具で「頼む」を押すと、送らずに、欄の下へ出す: 「<道具の名前> を使います。この道具は「読み取りだけ」と宣言されていません。相手のサーバーで、何かを変えたり送ったりするかもしれません。」、入力の一覧（項目名と値。値は 200 文字で切る）、「確かめて頼む」「やめる」。「確かめて頼む」で `confirm: true` を付けて送る |
| 送り先 | 「頼む」の上に必ず「入力は <host> へ送られます。」 |
| 送った後 | 欄の値は残す（少し変えて、もう一度頼める）。`id` は送るたびに新しくする。失敗の後は、道具の一覧を読み直す |

`components/noah-work-list.tsx`（props: `connectionId`）: `GET /api/noah/ask?connection=`。終わっていない依頼がある間、1 秒ごと（30 秒を越えたら 3 秒ごと。画面が裏の間は読まない）。`succeeded` になった行は、`GET /api/noah/ask/[id]` を 1 回だけ読み、成果の先頭 3 行を出す（読んだ成果は、その画面の間、持っておく）。

| 状態 | 行の文 | 操作 |
| --- | --- | --- |
| `queued` | 「順番を待っています」 | 止める |
| `running` | 「進んでいます（<経過>）」 | 止める |
| `running` で、止める事を頼んだ後 | 「止めています…（相手のサーバーで始まっていれば、止められません）」 | 無し。45 秒より長く続いた時だけ、「止める」をもう一度出す（実行の場が無くなった時の出口。押すと、その場で止まる。88 の 9.5。L7 で足した） |
| `succeeded` | 「結果を受け取りました」「<道具の名前> — <host> が返した内容です。」と、成果の先頭 3 行 | 開く（全文。`GET /api/noah/ask/[id]` の `result`） |
| `failed` | 「できませんでした。<理由>」 | — |
| `stopped` | 「止めました。」（`running` から止めた時は「止めました。相手のサーバーで実行されたかは分かりません。」） | — |
| `unknown` | 「結果を確かめられませんでした。相手のサーバーで実行されたかは分かりません。」 | — |

成果の出し方: 文字として出す（HTML として解釈しない。改行は保つ）。全体が JSON なら `noahResultOutline` の行にして出し、「元の形で見る」で文のままも出す。`https://` で始まる所だけを、行き先の host を横に書いたリンクにし、新しい tab で開く（`rel="noopener noreferrer nofollow"`）。画像などは「（画像 1 件）」の行だけ。

画面の決まり: 幅 390 で横にはみ出さない（長い名前と長い 1 語は折り返す）。押す所は 44px 以上。全画面を覆う進行表示と、閉じるまで操作できない dialog を使わない。色だけで見分けない（印は文字）。

### 11.6 試験（8 章に足す。`tests/noah-ask.test.mjs`。相手は、試験の中の関数）

| 試験 | 前提 | 期待 |
| --- | --- | --- |
| 入力欄の関数（移す） | — | [noah-form.test.mjs](../design-validation/noah/noah-form.test.mjs) の 11 群 |
| 一周 | 鍵の要らない試験用の接続先、読み取りだけの道具 | `POST` は 202。`GET` を 1 回も呼ばずに、Work に成果が入り、`noah_asks` が `succeeded`。相手への `tools/call` は 1 回 |
| 同じ `id` | 同じ本文で 3 回 | 行は 1 件。`tools/call` は 1 回。3 回とも同じ `id` と `workId` |
| 同じ `id` で別の入力 | — | 409 |
| 定義が変わった | 入力欄を開いた後に、その道具の説明を変える | `failed`「この道具の内容が変わりました…」。`tools/call` は 0 回 |
| 別の道具だけが変わった | 関係の無い道具の説明を変える | `succeeded` |
| 確かめ | 読み取りだけでない道具。`confirm` なし | `failed`。`tools/call` は 0 回 |
| 確かめの記録 | `confirm: true` で 1 回 → `confirm` なしで 2 回目 | 2 回目も `succeeded`。`confirmed_tools_json` に組が 1 つ |
| 確かめの後の差し替え | 確かめた後に、その道具の説明を変えて、`confirm` なし | `failed`（確かめ直し） |
| 入力欄に無い項目 | `input` に、定義に無い項目 | `failed`「入力欄に無い項目です。」。`tools/call` は 0 回 |
| 相手のエラー | 道具が `isError` | `failed`。理由は相手の文の先頭 240 文字 |
| 時間切れ | 道具が 20 秒返らない | `unknown`。呼び直さない |
| 止める | `queued` で止める／`running` で止めた後に成果が届く | `stopped`。成果は採らない |
| 取り下げ | 依頼の前に系列を取り下げる | 409。握手もしない |
| 上限 | 終わっていない 8 件／1 分に 10 回／1 つの接続先へ 1 分に 30 回 | 409／429／429 |
| 接続先の枠 | 同じ接続先へ、接続・道具の一覧・依頼を合わせて、60 秒の間に 61 回 | 61 回目は 429「この Agent は、今こんでいます…」。相手が受けた握手は 60 回。Work も行も増えない |
| 相手が「混んでいる」 | 握手か呼び出しに 429 と `Retry-After: 120` | `failed`。次の依頼・道具の一覧は、120 秒の間、相手へ送らずに 429 |
| 切り替え | `NOAH_ASK_FORM` が閉、審査者でない | 503。審査者は 202 |
| 送る物 | 相手が受けた要求を全部記録 | 本人の ID・ownerScope・cookie・Noah の account の情報が、header にも本文にも無い |
| 別の host への転送 | `tools/call` に、別の host への 307 を返す相手 | `failed`「この接続先にはつなげません。」。転送先が受けた要求は 0 回 |
| 他人 | 別の本人の接続・依頼 | 404 |
| 道具の一覧の API | 道具 130 個の相手 | 先頭 100 個の使える道具に `form`。`?tool=` で 101 個目。5 秒以内の 2 回目は 429（相手へ送らない） |
| 画面 | 既存の画面の試験と同じやり方（`tests/noah-timeline-ui.test.mjs`） | 使える道具が 1 つの時は入力欄だけ。`needsConfirm` の時、最初の「頼む」では送らない。主ボタンは 1 つ。「入力は <host> へ送られます。」が出る |

### 11.7 完了の定義（L6）

- `node --experimental-strip-types --test tests/noah-form.test.mjs tests/noah-ask.test.mjs` が通る。
- 手元で、握手が通った実在の接続先 3 つ（押すだけ／入力あり／確かめが要る道具）へ、入力欄から頼んで成果が出る。Mac を使わない。頼んだ直後に画面を閉じても、Work に成果が残る。結果を PR 本文に書く。
- `npm run typecheck`、`npm run lint:product`、`npm run work:check`（`WorkJob` に足した項目が、今の検査を壊さない事）。
- `services/noah-relay` と `lib/noah-tool-agent.ts` を作っていない。本番 D1 への migration を適用していない。

### 11.8 実装の記録（L6。2026-11-21）

入れた物:

| ファイル | 中身 |
| --- | --- |
| `drizzle/0048_noah_asks.sql`（`drizzle-main/` も同じ）・`db/schema.ts` | [noah-v1.sql](../contracts/noah-v1.sql) の `noah_asks` と索引 4 つを、そのまま移した。本番 D1 へは適用していない |
| `lib/workflow.ts` | `WorkJob.noahRemote`。`normalizeWorkJob` に `noah-agent-remote` の枝（確かめていない・費用 0・通った step が無い）。今ある Work の操作（完了・取消）は、この Work を動かせない |
| `lib/noah-remote-work.ts` | Work の記録を作る・始める・終える関数（通信も保存もしない）。4.1 の型に、`host`・`tool`・`toolSha256`（本人が見た定義）と、成果の `truncated`・`attachments`、添える 1 行 `note` を足した |
| `lib/noah-ask-store.ts` | 依頼の行の形と、終わりの書き方（`finishNoahAsk`: Work と依頼の行を、1 回の batch で一緒に書く）。切った時に止める `stopNoahAsksOfConnection` |
| `lib/noah-ask.ts`・`app/api/noah/ask/route.ts`・`[id]/route.ts` | 受け付け・実行・読む・止める（11.3・11.4）。`createNoahAskService`・`createNoahAskApi` |
| `lib/noah-user-handshake.ts` | 枠を先に取る `take`、握手の後の失敗にも同じ後始末をする `settle`（401・402 は一覧から外す・429 は待つ）、枠を取り直さない握手（`slotTaken`） |
| `lib/noah-connect.ts` | 切った時に、その接続の終わっていない依頼を止める。`usable` が、版（`digest`）と、つないだ時の道具の定義の hash を返す |
| `lib/noah-intake-listing.ts` | 型契約の `gate` を、文字列のまま移した |
| `lib/noah-ask-view.ts`・`components/noah-ask.tsx`・`components/noah-work-list.tsx` | 画面（11.5）。文と、状態 → 見た目の決まりは `noah-ask-view.ts`（通信も保存もしない関数） |
| `tests/noah-ask.test.mjs`（13 本）・`tests/noah-ask-ui.test.mjs`（7 本） | 11.6 の表。相手は、試験の中の関数。相手が受けた要求を全部記録して確かめる。画面の試験は、画面の要求を本物の入口へ通す |
| `scripts/check-noah-ask.mjs` | 受入（手元の D1。下） |

この範囲で決めた事（上の 4.1・11.3・11.4・11.5 と違う所は、ここが正）:

| 決めた事 | 理由 |
| --- | --- |
| 同じ `id` の再送は、最初に、今の状態で答える（11.3 の 5 を、2〜4 の前に行う） | 受け付けた後に、切り替えが閉じた・接続を切った・上限に達した、のどれが起きていても、同じ依頼の「今」が返る（[74](spec-74-one-click-connect.md) の 11.3 の 1 と同じ決まり） |
| Work と依頼の行は、1 回の batch で一緒に入れ、一緒に終える | 片方だけが残る形（成果はあるのに「進んでいます」のまま・行はあるのに Work が無い）を作らない。終わっていない依頼の上限（8 件）も、同じ batch の中で数える |
| 接続先の枠は、受け付ける前に 1 つ取る。実行の握手では、取り直さない | 枠が無い時は、Work も行も作らずに 429 で断る（11.3 の 6）。依頼 1 件が使う枠は 1 つ |
| 確かめた記録を足す時、接続の `revision` は進めない（`confirmed_tools_json` の中身を照らして書く） | 画面が持っている接続の版で、「切る」がそのまま通る。道具の一覧の `last_used_at` と同じ考え |
| 成果に添える 1 行は、Work の `events` ではなく `noahRemote.note` に置く | `events` は、決まった操作（`WorkCommand`）だけを持つ型 |
| 成果の文は `{ text, truncated, attachments }` で Work に置く（4.1 は `{ text }`） | 長いので切った事・画像などの数を、読む側が、文を解釈せずに知れる |
| 止めた時の理由: 相手へ送る前なら空（画面は「止めました。」）、送った後なら「止めました。相手のサーバーで実行されたかは分かりません。」、切った時は「接続を切ったので、止めました。」 | 何が起きたかを、本人が区別できる |
| 相手へ送る前に実行の場が落ちた時（表を読めない等）は `failed`「途中で止まりました。相手のサーバーへは、送っていません。もう一度頼んでください。」。送った後なら `unknown` | 送っていない時に「実行されたかは分かりません」と言わない |
| 読む・止めるは、切り替えが閉じていてもできる | 閉じた後に、進んでいる依頼を見られない・止められない、を作らない |
| 道具の一覧の行に、「送る前に確かめます」の印を足した（読み取りだけと宣言されていず、まだ確かめていない道具） | 手元の実物で、実在の相手の「問い合わせを送る」道具を開いた時、選ぶ前の行に印が 1 つも無かった |
| 応答が届かなかった「頼む」は、押し直した時に、同じ操作 ID で送る（入力が同じ時だけ） | 同じ依頼が 2 つにならない |
| 説明の全文（`?tool=` の `description`）は、画面では、まだ出していない（一覧の説明の先頭 160 文字だけ） | 1 つ開くたびに握手が 1 回要る。要るかどうかは、使われ方を見てから |

D1 への往復（1 文の実行か、1 回の batch。`scripts/check-noah-ask.mjs` で数えた。本人の確かめ＝`authenticate` の分は含まない）:

| 操作 | 往復 | 中身 |
| --- | --- | --- |
| 受け付け（`POST /api/noah/ask`。202 を返すまで） | 6 | 同じ `id` の行 1・使える接続かの確かめ 2・上限 1・接続先の枠 1・Work と行（batch）1 |
| 実行（応答の後。成果が出た時） | 14〜15（L6 の時は 15〜16） | 行を取る 1・Work を読んで進める 2・使える接続かの確かめ 4（握手の前後に 2 回ずつ）・相手へ送る印を付ける 1（L6 の時は、止める印を読む 1）・終わりの書き込み 2（Work を読む・batch）・使った時刻 1・「動いた」の写し 3〜4（もう「動いた」の系列は 3）。握手と、道具の呼び出しそのものは、D1 へ往復しない（接続先の枠は、受け付けの時に取ってある）。L6 の時は、終わりを書いた後に、書けた事を読む 1 があった |
| 実行（確かめの記録を足す時） | 16（L6 の時は 17） | 上（もう「動いた」の系列で 14）に、確かめの記録を読む・書くの 2 |
| 読む（`GET /api/noah/ask/[id]`。成果つき） | 2 | 行・Work |
| 一覧（`GET /api/noah/ask`） | 1 | — |
| 止める（まだ始まっていない依頼） | 5 | 行・Work を読む・終わりの batch・止める印・読み直し |
| 切る（終わっていない依頼が 2 件ある接続） | 6 | 切る 3（[74](spec-74-one-click-connect.md) の 11.8）に、始まっていない依頼の終わり 2・進んでいる依頼の止める印 1 |

実行は、応答の後の仕事なので、本人は待たない。L7 で決めた事: 終わりを書いた後の読み直しは、やめた（書き込みの結果で、書けたかどうかが分かる。1 往復）。握手の前後の確かめ（4 往復）は、残した（握手の前の分をやめると、受け付けてから実行が始まるまでの間に取り下げられた物へ、握手を送り得る）。`--trace` を付けると、送った文が、順に出る。

手元の実物での確かめ（L6 の完了の定義の 2 つ目。2026-11-21 03:15〜03:30 JST。`npx vinext dev`・手元の D1・実在の台帳から載った系列・審査者の account・幅 390 の Chromium）:

- 道具の一覧を読んだ実在の相手は 7 つ（道具は合わせて 40 個。**読み取りだけと宣言されていない道具は 2 個**で、入力欄で使える物は、そのうち 1 個）。
- **押すだけの道具:** 道具を選ぶ →「頼む」→ 成果が出た（受け付けてから終わるまで 1,061 ミリ秒。成果 3,513 文字）。
- **入力のある道具:** 空のまま「頼む」→ 欄の下に「… を入れてください。」、数でない値 →「… は数で入れてください。」（どちらも送らない）→ 直して「頼む」→ 成果が出た（855 ミリ秒。入れた数どおりの計算の結果が返った）。欄の値は残った。
- **頼んだ直後に画面を閉じる:** 要求を送った所で tab を閉じ、別の tab から読むと、依頼は `succeeded` で、Work に成果が入っていた（865 ミリ秒）。
- 動かした系列は、一覧の「動いた」の段に移り、印が「1 クリック」になった（「動いた 1 件・まだ誰も動かしていない 38 件」）。
- **確かめが要る道具（読み取りだけと宣言されていない、実在の道具）は、呼んでいない。** 見つかった 1 個は、相手の事業者へ問い合わせを送る道具だった。本人の許可なく、外へ問い合わせを送らない（AGENTS.md の 6 章）。確かめたのは、送る手前まで: 行に「送る前に確かめます」の印が出る／必須の欄を埋めて「頼む」を押すと、送らずに、確かめの画面（道具の名前・入力の一覧・送り先・「確かめて頼む」「やめる」）が出る／この間に、Noah の API へも相手へも、書き込みの要求は 0 回／「やめる」で閉じる。**確かめた後に実際に呼ぶ所は、試験の中の相手でだけ確かめた**（`tests/noah-ask.test.mjs` の「tools that may change something」、`tests/noah-ask-ui.test.mjs` の 4 本目）。完了の定義の「確かめが要る道具へ頼んで成果が出る」は、実在の相手では通していない。
- 止める所も、実在の相手では確かめていない（相手が 1 秒前後で返すので、止める前に終わる）。試験の中の相手で確かめた。
- 見た目: 幅 390・1360 で、横のはみ出し 0。押す所は高さ 44px 以上。
- 相手へ送った物: 道具の呼び出しは 3 回（どれも、読み取りだけと宣言された、一覧と計算の道具）。握手は、1 つの接続先へ、接続・道具の一覧・依頼ごとに 1 回ずつ。終わった後、手元の接続は全部切った。

受入の結果（`node --experimental-strip-types scripts/check-noah-ask.mjs`。2026-11-21 03:50 JST。表は、Miniflare の D1。終わると消える。台帳も相手も、script の中の合成の物で、外へは通信しない）:

- 合成の相手は 17（握手は、どれも通って、一覧に載る。道具を呼んだ時の答えが、相手ごとに違う）。つなぐ → 道具の一覧 → 頼む → 読む → 止める → 切る を、入口（API の関数）から通した。
- 依頼は 63 件: 成果が出た 42・失敗 14・結果不明 2・止めた 5。**依頼と Work は 1 対 1 で、終わっていない物は 0。** 状態は、どれも Work の側と合っている。相手が受けた道具の呼び出しは 52 回で、依頼の行の `tool_calls` の合計と同じ（1 件につき 1 回まで。呼び直していない）。
- 相手の答えごとの結果（11.4 の表）: 成果（SSE で返す相手・セッションを使う相手・構造のある成果・長くて切った成果）／道具が「できなかった」／決まった形のエラー／読めない応答と 503（どちらも結果不明）／403／別の host への転送（従わない。転送先へ送った要求は 0 回）／429（言われた 120 秒の間は、送らずに断る。行も Work も増えない。過ぎれば通る）／401・402（その場で一覧から外れる。載っている系列が 17 → 15）／つないだ後に握手に答えなくなった相手（道具を呼ばない）。
- 入力の検査（必須の欄が空・入力欄に無い項目・長すぎる値・入力欄にできない道具）は、どれも、相手へ道具を呼ばずに `failed`。確かめが要る道具は、`confirm` なしでは呼ばず、`confirm: true` の後は、2 回目から確かめずに通る。入力欄を開いた後に定義が変わった道具は、呼ばない。
- **止める・切る・上限の SQL を、D1 の上で通した:** 始まる前に止める（相手へ送らない）・握手の間に止める（道具を呼ばない）・相手へ送った後に止める（届いた成果を採らない）／切ると、その接続の終わっていない依頼が止まる／終わっていない 8 件・1 分に 10 回・1 つの接続先へ 1 分に 30 回（3 人で 30 回。4 人目が断られる）・接続先の枠（受入では、枠を 4 に絞って確かめた）。どれも、越えた時に、行も Work も増えず、相手が受けた要求も増えない。
- 切り替えが閉じている間は 503（読む事はできる）。他人の依頼は、読めない・止められない・一覧に出ない。
- 相手が受けた要求の全部（header と本文）に、本人の ID・ownerScope・依頼の ID・接続の ID・Work の ID が無い。名乗りは、人の操作から始めた要求が `Noah/1`、巡回が `NoahBot/1`。家の端末への命令は、1 件も増えない。
- 実在の相手へ頼む受入は、この script では行わない（実在の道具を、機械に選ばせて呼ばない）。実在の相手で確かめた分は、上の「手元の実物での確かめ」だけ。

出す時に気を付ける事（[97](spec-97-launch-ops.md) の 7 章の「コードを戻す」へ）: `noah-agent-remote` の Work が 1 件でもある状態で、L6 より前のコードへ戻すと、その本人の Work の一覧（`/api/work`）が読めなくなる（古い `normalizeWorkJob` は、この種類を知らない）。戻す前に、依頼の切り替え（`NOAH_ASK_FORM`）を閉じるだけにするか、戻す版に `normalizeWorkJob` の枝だけを入れる。

残っている物: 依頼の成果を「成果データ」（`/noah/data`。Codex の `lib/noah-result-data.ts` は、家の端末の仕事 `noahExecution` だけを読む）と「実行中」（`/noah/activity`）に出す所。Codex の「利用人数」（`noah_runner_commands` だけを数える）に、依頼を足す所。実行が落ちて `running` のまま残った依頼の後始末は、L7 で入れた（88 の 9.5・9.11）。棚のカードから来た時の `&tool=`・`&from=`・`&pos=`（[PR #343](https://github.com/k999ln/rock/pull/343) の task 100）。

