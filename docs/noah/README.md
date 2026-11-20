# Noah 実装仕様書（作業単位ごと）

2026-11-20。[Noah の設計書（全体）](../noah-design.md) と [詳細設計書](../noah-detailed-design.md) の下の層。**作業単位 1 つ（＝ `codex/tasks/` の 1 枚＝ 1 PR）につき 1 本**で、その単位を実装するのに要る事を全部書く: 今あるコードのどこをどう変えるか、入出力の形、規則の全表、画面と文言、処理の順、試験、完了の定義。

読む順は、task 1 枚 → その仕様書 1 本 → 仕様書が指す型契約（[docs/contracts/](../contracts/)）と試験（[docs/design-validation/noah/](../design-validation/noah/README.md)）。それ以外は読まなくてよい。

**ローンチまでに作る範囲は、[ローンチの最小限（MVP）](mvp-launch.md) が決める。** 各仕様書の最後の「ローンチの範囲」の章が、その仕様書のうち、出すまでに作る所と、その完了の定義。出すまでは、その章だけを作る（表の「ローンチ」の列が、作る順）。

| 順 | ローンチ | task | 仕様書 | 型契約・参照実装 | 動く試験 |
| --- | --- | --- | --- | --- | --- |
| 0 | L1（10 章） | 84 | [画面を取らない決まりと検査](spec-84-screenless.md) | `noah-screenless-v1.ts` | `noah-screenless.test.mjs` |
| 1 | L3（11 章） | 85 | [取り込みと名寄せ](spec-85-intake.md) | `noah-intake-v1.ts`、`noah-flags-v1.ts`、`noah-v1.sql`、`noah-regroup-v1.sql`、`noah-listing-v1.sql` | `noah-intake.test.mjs`、`noah-flags.test.mjs`、`validate-noah-v1.py` |
| 1 | L2・L5（9 章） | 96 | [接続要件と接続計画](spec-96-connect-plan.md) | `noah-connect-v1.ts` | `noah-connect.test.mjs` |
| 1 | L4（10 章） | 86 | [リモートの口と、握手までの接続試験](spec-86-remote-mouth.md) | `noah-mouth-v1.ts`、`noah-form-v1.ts` | `noah-mouth.test.mjs` |
| 1 | L6（11 章） | 87 | [道具を持つ担当（入力欄で頼む・1 文で頼む）](spec-87-tool-agent.md) | `noah-form-v1.ts`、`noah-tool-agent-v1.ts`、`noah-listing-v1.sql`（上限の数え方・接続先の枠） | `noah-form.test.mjs`、`noah-tool-agent.test.mjs`、`validate-noah-v1.py` |
| 1 | L5（11 章） | 74 | [1 回でつなぐ](spec-74-one-click-connect.md) | `noah-connect-v1.ts`、`noah-v1.sql`、`noah-form-v1.ts`（つなぐ前の上限）、`noah-listing-v1.sql`（上限の数え方・接続先の枠） | `noah-connect.test.mjs`、`noah-form.test.mjs`、`validate-noah-v1.py` |
| 1 | L7（9 章） | 88 | [大量の接続試験と見回り](spec-88-mass-probe.md) | `noah-intake-v1.ts`、`noah-listing-v1.sql` | `noah-intake.test.mjs`、`validate-noah-v1.py` |
| 1 | —（出した後） | 89 | [ターミナルの口](spec-89-terminal-mouth.md) | `noah-mouth-v1.ts`、`noah-intake-v1.ts` | `noah-mouth.test.mjs` |
| 2 | L8（全部） | 97 | [出すための運用](spec-97-launch-ops.md) | `noah-flags-v1.ts`、`noah-intake-v1.ts` | `noah-flags.test.mjs`、`noah-intake.test.mjs` |
| 2 | L9（全部） | 90 | [手元だけの一周](spec-90-phone-only-loop.md) | （参照実装の全部をつなぐ） | `noah-loop.test.mjs`（通信しない一周。`tests/` には、本物の入口を通す版を足す） |

段 2 以降の残り（83・92・94 など）の仕様書は、ローンチの後に同じ形で足す。それまでは詳細設計書の章が入口。

## 別の機械で始める時

設計・参照実装・試験・task は、全部 main に入っている。手元にしか無い物は無い。

1. `git clone https://github.com/k999ln/rock`（もう clone があれば `git pull origin main`）。続けて `npm ci`。Node.js 22.13 以上、Python 3.9 以上。
2. 検証キットが通る事を確かめる: `node --experimental-strip-types --test "docs/design-validation/noah/*.test.mjs"` と `python3 docs/design-validation/noah/validate-noah-v1.py`。2026-11-20 に、main を別の場所へ取り出して確かめた結果は、試験 61/61・DDL 10/10。
3. 読む順: [ローンチの最小限](mvp-launch.md) の 1〜3 章と 6 章（作る順）→ その PR の task（`codex/tasks/`）→ 下の表の仕様書の「ローンチの範囲」の章。
4. 最初の PR は L1（task 84）と L2（task 96 の純関数）。どちらも、先に要る物が無く、並べて進められる。その後は L3（85）→ L4（86）→ L5（74。96 の計画の API とカードを含む）→ L6（87）→ L7（88）。L8（97）は L3 の後ならいつでも。L9（90）が受入。
5. 本番への migration・配備・切り替え・契約は、どの PR も行わない（本人の許可の後。[ローンチの最小限](mvp-launch.md) の 7 章と 9 章）。

## 参照実装の使い方（実装する Agent へ）

1. `docs/contracts/noah-*-v1.ts` は、通信も保存もしない関数の集まり。**`lib/` の同じ名前のファイルへ、関数ごと移す。** 移す先は各仕様書の「変える所」の表。書き直さない。
2. `docs/design-validation/noah/*.test.mjs` を `tests/` へ移し、import の先を `lib/` に変えて、同じ結果になることを確かめる。fixture は `tests/fixtures/noah/` へ移す。
3. 移した後、`docs/contracts/` の方は消さずに残し、先頭に「正本は lib/ へ移した」と 1 行足す（設計の記録）。両方を直す状態を作らない。
4. DDL は `docs/contracts/noah-v1.sql` から、その task が使う表だけを `drizzle/` の新しい番号と `db/schema.ts` へ移す。`drizzle/meta/_journal.json` の `when` は、今の最大より大きい値にする（[drizzle/README.md](../../drizzle/README.md)）。本番への適用は本人の許可の後。
5. 通信・保存・画面は、仕様書の「処理の順」と「画面と文言」のとおりに、今ある型（下の表）に合わせて書く。

## 今あるコードの型（全部の仕様書に共通）

| 事 | 今の書き方 | 例 |
| --- | --- | --- |
| API の入口 | `app/api/noah/<名前>/route.ts` は 2〜3 行。`export const GET=(r:Request)=>createNoah<名前>Api(noahReleaseDependencies())(r); export const POST=GET;` | `app/api/noah/launch/route.ts` |
| 依存の受け渡し | `noahReleaseDependencies()`（`lib/noah-release-server.ts`）が `{ db, authenticate, bucket, mode, reviewers, serviceOfferProfiles }` を返す。`cloudflare:workers` の `env` を読むのは `*-server.ts` だけ | `lib/noah-release-server.ts` |
| 処理の本体 | `lib/noah-<名前>.ts` に `createNoah<名前>Service(deps)` と `createNoah<名前>Api(deps)`。`now` を差し替えられる | `lib/noah-launch.ts` |
| 書き込みの検査 | `request.headers.get('origin') !== new URL(request.url).origin` → 403「同じNoahから操作してください。」。`x-rock-owner-scope` が `await ownerScopeFor(owner)` と違う → 409「アカウントが変わりました。」 | `lib/noah-launch.ts` の `createNoahLaunchApi` |
| 本文の読み方 | `JSON.parse(new TextDecoder().decode(await boundedNoahBody(request, <上限>)))`。content-type が `application/json` でなければ 415 | 同上 |
| エラー | `throw new NoahAgentError('<日本語の文>', <status>)`。未サインインは `authenticate` が `Error('UNAUTHORIZED')` を投げ、401「サインインしてください。」。その他は 503「Noahの処理を確認できません。」 | 同上 |
| 応答 | `Response.json(v, { status, headers: { 'Cache-Control': 'no-store, private', 'X-Content-Type-Options': 'nosniff' } })` | 同上 |
| 同じ操作の再送 | 本文の hash（`noahDigest(JSON.stringify(input))`）を行に持ち、同じ `id` で hash が違えば 409「同じ操作IDの内容は変更できません。」。同じなら今の行を返す | `enqueue` |
| 数の上限 | `INSERT OR IGNORE … SELECT … WHERE (SELECT COUNT(*) …) < 8 RETURNING *`。行が返らなければ 409 | `enqueue` |
| 端末が応答しているか | `!revoked_at && last_seen_at > now - 30_000`（`LEASE`） | `presentDevice` |
| 画面の読み直し | 3 秒ごと。`document.hidden` の間は読まない。`visibilitychange` で 1 回読む。操作の後は GET で読み直す | `components/noah-launch.tsx` |
| 未サインインからの続き | 続きに要る物を `sessionStorage` に置き、`/account?returnTo=<元のパス>` へ移る | `components/rockstar-entitlement-claim.tsx` |
| 本人ごとの暗号化 | 32 byte の鍵（環境変数）から HKDF で本人ごとの鍵を作り、AES-GCM で包む | `lib/sky-x-account.ts` の `xAccountCipher` |
| 別の Worker で続ける仕事 | 専用の Worker と Durable Object の alarm。5 分ごとの cron が、落ちた alarm を戻す | `services/noah-test-runtime/` |
| 試験 | `tests/<名前>.test.mjs`（`node:test`）。`node --experimental-strip-types --test tests/<名前>.test.mjs` | `tests/noah-*.test.mjs` |

## 言葉（画面に出す物）

接続／頼む／止める／切る／受け取る／直してもらう／あなたの番。置き場所は「相手のサーバー」「あなたの端末」「スマホの中」「雲の端末」。技術の言葉（MCP、OAuth、token、runner、lease、container、hash）は画面に出さない。失敗の文は「何が起きたか。次に何をすればいいか。」の 2 文。
