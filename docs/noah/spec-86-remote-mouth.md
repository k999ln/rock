# 仕様書 86 — リモートの口（握手・道具の一覧・相手の許可）と、握手までの接続試験（L1）

task: [codex/tasks/86-noah-remote-mouth.md](../../codex/tasks/86-noah-remote-mouth.md)。先に要る物: 85（候補と checks の表）。
型契約: [noah-mouth-v1.ts](../contracts/noah-mouth-v1.ts)。試験: [noah-mouth.test.mjs](../design-validation/noah/noah-mouth.test.mjs)（9 群）。実測の写し: [fixtures/mcp-exchange-mizan.json](../design-validation/noah/fixtures/mcp-exchange-mizan.json)。

**ローンチまでに作る範囲は 10 章（握手・道具の一覧・道具の呼び出し・握手までの巡回）。** 相手の許可（5 章）は、出した後の最初。10 章と食い違う所は、ローンチまでは 10 章が勝つ。

## 1. 完成の姿

- 取り込んだ「相手のサーバー」の候補へ、Noah が握手して、道具の一覧を読む。**道具は呼ばない。** 結果（応答した／相手の許可が要る／応答しない／読めない）と、道具の定義の hash が候補に付く。
- 相手の許可が要る接続先は、Noah が事前の取り決めなしで client として登録でき、本人が相手の画面で 1 回許可すれば、その後は聞かれない。
- 鍵と許可は、Noah の中継だけが持つ。Agent・道具を持つ担当・画面へ渡らない。別の接続先へ送られない。

## 2. この仕様で決めた事

| 決めた事 | 理由（握手の標本 500 host と、401 を返した 174 host の実測） |
| --- | --- |
| 今の `lib/mcp-inspection.ts`（掲載の診断）は変えず、口を別の file に作る。URL の検査（`remoteMcpUrl`）と版の一覧（`MCP_PROTOCOLS`）は、そこから import する | 掲載の診断は、道具の名前だけを 100 個・256KB まで読む作りで、応答の形も違う。実測では、定義が 256KB を越える接続先が 1.9%、道具が 100 個を越える接続先が 2.3% ある |
| 受け入れる版に `2024-11-05` を足す | 273 件のうち 4 件（1.5%）がこの版を返す。道具の一覧と呼び出しの形は同じ。「読み取りだけ」の宣言が無い版なので、全部の道具を「確認が要る」として扱う |
| 最新の版（`2025-11-25`）を名乗り、相手がエラーを返した時だけ、1 つ前（`2025-06-18`）でもう 1 回だけ試す | 標本の 96% は `2025-06-18` を返した。版の言い直しに応じない相手を落とさないため |
| SSE の応答は、途中の通知を読み飛ばし、自分の `id` の応答が来た所で読むのをやめる | 接続を開けたままにする相手がいる。実測の写し（mizan.ac）も SSE で返す |
| 相手の許可は、client 文書（CIMD）と動的登録（DCR）の両方に対応し、両方あれば client 文書を使う | 動的登録 159、client 文書 62（両方 55、動的登録だけ 104、client 文書だけ 7）。片方だけだと 4%〜60% を落とす。両方で 166/174（95.4%） |
| PKCE（S256）を宣言していない相手とは、つながない | 対応 166/174。MCP の認可の決まりでも必須 |
| 鍵の宣言が無い接続先も、握手するまで「鍵なし」と書かない | 鍵の宣言が無い 452 件のうち 162 件（35.8%）が 401 を返した |
| 402（呼ぶたびの支払い）は「未対応」として分ける | 標本で 4 件。台帳には `payment-signature` の header を宣言する記録が 379 件ある |

## 3. 今あるコードと、変える所

| ファイル | 今 | 変える事 |
| --- | --- | --- |
| `lib/noah-mouth-mcp-remote.ts` | 無い | 型契約から、握手・一覧・呼び出し・閉じる・`noahToolsSha256`・`createNoahGuardedFetch`・`isNoahPrivateAddress`・`parseNoahWwwAuthenticate`・`NoahMouthError` を移す |
| `lib/noah-mouth-space.ts` | 無い | 新規（10 行ほど）。`noahSpaceMcpUrl(host)` で URL を作り、上の握手を呼ぶ。呼ぶ前に、候補の `running` が 1 であることを確かめる（寝ている物を起こさない） |
| `lib/noah-oauth.ts` | 無い | 型契約から `noahProtectedResourceUrls`・`noahAuthorizationServerUrls`・`planNoahOAuth`・`noahClientMetadata`・`noahRegistrationBody`・`noahPkcePair`・`noahAuthorizationUrl`・`noahTokenRequestBody` を移す |
| `lib/noah-oauth-service.ts` | 無い | 新規。5 章の発見・登録・開始・戻り・更新。表は `noah_oauth_clients`・`noah_oauth_states`・`noah_oauth_grants` |
| `lib/noah-broker-cipher.ts` | 無い | 新規。`lib/sky-x-account.ts` の `xAccountCipher(hex, owner)` と同じ作り（32 byte の鍵から HKDF で本人ごとの鍵、AES-GCM）。鍵は環境変数 `NOAH_BROKER_KEY`。無い時は、相手の許可の段を「準備が必要」にする |
| `app/oauth/client.json/route.ts` | 無い | 新規。`noahClientMetadata(origin)` を `application/json` で返す。`Cache-Control: public, max-age=3600` |
| `app/api/noah/oauth/start/route.ts`、`…/callback/route.ts` | 無い | 新規（5 章） |
| `lib/noah-probe.ts` | 無い | 新規。`probeL1(candidate)`（4 章） |
| `lib/noah-intake-store.ts`（85） | `sync()` | 出どころの巡回の後に、握手を 1 回の呼び出しで 8 件まで行う（`probeDue()`） |
| `lib/mcp-inspection.ts`、`lib/mcp-client.ts`、`lib/fashion-mcp-client.ts` | 掲載の診断、手元の接続 | **変えない** |

## 4. 握手（やり取りの形）

### 4.1 送る物と、返る物（実測の写しから）

```
POST https://mizan.ac/mcp
content-type: application/json
accept: application/json, text/event-stream
mcp-protocol-version: 2025-11-25

{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"noah","version":"1"}}}
```

```
HTTP/2 200
content-type: text/event-stream

event: message
data: {"result":{"protocolVersion":"2025-06-18","capabilities":{"tools":{"listChanged":true}},"serverInfo":{"name":"mizan",…}},"jsonrpc":"2.0","id":1}
```

続けて `notifications/initialized`（`id` なし。応答は 202 が多い。失敗しても握手の失敗にしない）、`tools/list`（`nextCursor` があれば 10 頁まで）。応答に `mcp-session-id` があれば、2 回目から同じ値を付ける。終わったら `DELETE` でセッションを閉じる（相手が対応していなくてもよい）。

版の名乗り方: Noah が知っている版は 4 つ（`2025-11-25`・`2025-06-18`・`2025-03-26`・`2024-11-05`）。最初に、最新の `2025-11-25` を名乗る。相手が返した版が 4 つのどれかなら、その版で続ける（上の例は `2025-06-18` に下がっている）。**相手が初期化にエラー（4.2 の `incompatible`）を返した時だけ、1 つ前の `2025-06-18` で、もう 1 回だけ名乗り直す。** それも通らなければ「形が合わない」。実測では、名乗り直しで通った相手が 274 のうち 2 あった（10.2）。

### 4.2 握手の結果（`NoahMouthError.code` → `noah_intake_checks`）

| 相手の応答 | code | `result` | `level` | `auth` | 次に確かめる時 |
| --- | --- | --- | --- | --- | --- |
| 握手と一覧が通った。道具が 1 つ以上 | — | `ok` | 1 | `none` | 7 日後（88） |
| 同じ。道具が 0 個 | — | `incompatible` | 0 | `none` | 7 日後 |
| 401 | `auth_required` | `auth_required` | 0 | 5 章の発見が通れば `oauth`、通らなければ `key` | `oauth` は 7 日後。`key` は 30 日後 |
| 402 | `payment_required` | `payment_required` | 0 | `payment` | 30 日後 |
| 403 | `forbidden` | `forbidden` | 0 | `unknown` | 7 日後 |
| 429 | `rate_limited` | `rate_limited` | 変えない | 変えない | `Retry-After`（無ければ 60 秒）の後。`noah_probe_hosts.not_before` にも入れる（[noah-listing-v1.sql](../contracts/noah-listing-v1.sql) の `host_wait`。その時刻まで、巡回も、利用者の操作から始める握手も送らない） |
| 名前が引けない・つながらない・時間切れ・404・410・5xx | `unreachable` | `unreachable` | 変えない（88 が、続いたら下げる） | 変えない | 間隔を 2 倍 |
| 応答が読めない・版が合わない・相手がエラーを返した・400・405・406 | `incompatible` | `incompatible` | 0 | 変えない | 7 日後 |
| 応答が 1MB を越えた・道具が 500 個を越えた | `too_large` | `too_large` | 0 | 変えない | 30 日後 |
| 接続先が検査を通らない | `blocked` | `blocked` | 0 | 変えない | 確かめ直さない（記録が変わるまで） |
| 別の host へ転送された（`sameHost` で握手した時。`detail.redirectedTo` がある） | `blocked` | `blocked` | 0 | 変えない | 30 日後（転送をやめる相手、台帳の URL を直す相手が居る） |

通った時に書く列: `tools_sha256`、`tool_count`、`read_only`（全部の道具が読み取りだけと宣言されているか）、`latency_ms`（握手から一覧の終わりまで）、`l1_at`、`checked_at`、`failures=0`、`first_failure_at=NULL`。**道具の定義そのものは保存しない**（hash と数だけ。定義は、つなぐ時に読み直す）。

道具の扱い: 名前が `[A-Za-z0-9_.:/-]{1,128}` でない物と、重複した名前は入れない（数だけ数える）。`annotations.readOnlyHint === true` の物だけを「読み取りだけ」とする。宣言が無い物（標本の 24.8% の接続先は、宣言が 1 つも無い）は、読み取りだけとして扱わない。

### 4.3 上限（`NOAH_MOUTH_LIMITS`。数値は候補）

握手と一覧の待ちは、要求 1 つにつき 10 秒（実測: 初期化から一覧の終わりまで、中央値 1.2 秒、9 割が 2.1 秒以内、最大 11.7 秒。10.2）。道具の呼び出しの待ち 60 秒。1 応答 1MB（実測の最大 606KB）。道具 500 個。一覧 10 頁。転送 3 回。

### 4.4 接続先の検査（`createNoahGuardedFetch`）

1. URL は `remoteMcpUrl`（既存）を通す: HTTPS、認証情報なし、`#` なし、数字だけの host と内部向けの名前（`localhost`・`.local`・`.internal`・`.lan`・`.test`・`.invalid`・`.onion`）を拒否。
2. 転送は自分で追う（`redirect: 'manual'`）。転送先ごとに 1 をやり直す。3 回まで。
3. 別の host への転送には、`authorization` と本人の鍵の header を付けない（`content-type`・`accept`・`mcp-protocol-version`・`user-agent` だけを残す）。`sameHost` を真にした時は、別の host への転送そのものに従わない（ローンチの使い方。10.3 の 9）。
4. 名前を引いた先のアドレスの検査（`check`）。動かす所で作りが違う:
   - Cloudflare の Worker（製品）: Worker から内部のアドレスへは届かない。`check` は何もしない。1〜3 だけで足りる。
   - Node（手元の巡回、端末の runner）: `dns.lookup(host, { all: true })` の全部のアドレスを `isNoahPrivateAddress` に通し、1 つでも内部向けなら拒否する。通ったアドレスへつなぐ（引き直しで別のアドレスへ行かないように、`lookup` を固定した agent を使う）。

## 5. 相手の許可

### 5.1 発見（握手が 401 を返した時。`probeL1` と、つなぐ時の両方で使う）

1. `WWW-Authenticate` から `resource_metadata` と `scope` を読む（実測: 174 件のうち、header あり 165、`resource_metadata` あり 159、`scope` あり 40）。
2. 保護された資源の公開情報を読む。順: `resource_metadata` の URL → `https://<host>/.well-known/oauth-protected-resource<接続先のパス>` → `https://<host>/.well-known/oauth-protected-resource`。最初に 200 で JSON を返した物を使う（見つかった 167）。
3. `authorization_servers[0]` の公開情報を読む。パスの無い issuer は `/.well-known/oauth-authorization-server` → `/.well-known/openid-configuration`。パスのある issuer は、間に挟む形 2 つと、後ろに付ける形 1 つ（`noahAuthorizationServerUrls`）。
4. `planNoahOAuth` で決める。結果を `noah_intake_checks.oauth_json` に `{ "issuer", "method", "scope", "resource" }` として保存する（token は入れない）。通れば `auth='oauth'`。
5. 候補の接続要件へ `services: [{ "id": "<issuer の host>", "method": "oauth", "required": true, "purpose": "<issuer の host> のアカウントで許可" }]` を足し、`connect_sha256` を計算し直す。

| `planNoahOAuth` の結果 | 接続計画の段 |
| --- | --- |
| `ok`、`method: 'cimd'` か `'dcr'` | `services`: 1 タップ |
| `no_pkce`・`no_registration`・`issuer_mismatch`・`not_https`・公開情報が無い | `auth='key'`。`secrets: ['Authorization']`。「準備が必要（Authorization を入力）」 |

### 5.2 登録（認可サーバーごとに 1 回）

- `cimd`: 登録は要らない。`client_id` は `https://<Noah の origin>/oauth/client.json`。`noah_oauth_clients` に `method='cimd'` で 1 行入れる。
- `dcr`: `POST <registration_endpoint>` に `noahRegistrationBody(origin)`（`application/json`）。返った `client_id` を `noah_oauth_clients` に保存し、使い回す。`client_secret` が返っても使わない（public client。`token_endpoint_auth_method: 'none'`）。登録が 4xx を返したら、5.1 の表の下の行と同じに扱う。

### 5.3 開始と戻り

**`GET /api/noah/oauth/start?connect=<接続の ID>&service=<serviceId>`**（サインイン済み。同じ本人の接続だけ）

1. `noahPkcePair()`。`state` は 32 byte の乱数（base64url）。
2. `noah_oauth_states` に入れる: `state_sha256`、本人、接続の ID、`service_id`、`issuer`、`resource`、`verifier_ciphertext`（`noah-broker-cipher` で包む）、`redirect_uri`、`return_path`（元のカードのパス。`/noah` で始まる物だけ）、`expires_at = now + 10 分`。
3. `noahAuthorizationUrl(…)` へ 302。

**`GET /api/noah/oauth/callback?code=…&state=…`**

1. `UPDATE noah_oauth_states SET used_at=? WHERE state_sha256=? AND owner_id=? AND used_at IS NULL AND expires_at > ? RETURNING *`。行が返らなければ 400「許可の手続きをやり直してください。」。
2. 応答に `iss` があり、保存した `issuer` と違えば拒否する。`error=access_denied` なら、接続を `needs_action` のままにして、元のカードへ戻す。
3. `POST <token_endpoint>`（`application/x-www-form-urlencoded`、本文は `noahTokenRequestBody`）。
4. `noah_oauth_grants` に入れる（同じ本人・同じ `resource` の古い行は `revoked_at` を入れてから）。`token_ciphertext`・`refresh_ciphertext`、`expires_at = now + expires_in 秒`、`scopes`。
5. 接続の処理を続ける（74 の `resume`）。`return_path` へ 302。

### 5.4 使う時（中継）

- `ctx.headers()` が、その接続の `resource` と同じ `noah_oauth_grants` の行から `authorization: Bearer …` を作る。**発行先の resource と、送り先の URL が違えば付けない。**
- 期限まで 60 秒を切っていて `refresh_ciphertext` があれば、`grant_type=refresh_token`（`resource` も付ける）で更新する。更新が失敗したら、その行に `revoked_at` を入れ、接続を `needs_action`（「<host> の許可が切れました。もう一度許可してください。」）にする。
- 切る（接続の `disconnect`）時に、その `resource` を使う接続が他に無ければ、`revoked_at` を入れる。認可サーバーに取り消しの口（`revocation_endpoint`）があれば呼ぶ。

## 6. 巡回での握手（`probeDue()`。1 回の呼び出しで 8 件まで）

1. 取る: `SELECT candidate_id FROM noah_intake_checks WHERE setup = 0 AND mouth IN ('mcp-remote','space-mcp','a2a') AND next_check_at <= ? AND lease_until < ? ORDER BY next_check_at LIMIT 8` を `UPDATE … SET lease_until = now + 60000 … RETURNING` で（2 つの巡回が同じ候補を取らない事、端末で動かす配布と鍵の要る物を取らない事は、検証キットが確かめている。条件は、索引 `noah_intake_checks_due` の条件と同じ形で書く）。
2. host の間隔: `noah_probe_hosts` へ `INSERT … ON CONFLICT(host) DO UPDATE … WHERE last_probe_at <= now - 3600000 AND not_before <= now RETURNING host`。行が返らなければ、その候補は今回は握手せず、`next_check_at` を 1 時間後にする（同じ host へは 1 時間に 1 回まで）。
3. 握手する。名乗りは `user-agent: NoahBot/1 (+https://<origin>/noah/help#bot)`。401 なら 5.1 の発見まで行う（同じ host と、その認可サーバーへの GET が 2〜4 回）。
4. 4.2 の表のとおりに書く。lease を放す。握手の後、道具の定義の hash が前と違えば、88 の「内容が変わった」の処理へ渡す。

## 7. 試験

| 試験 | 中身 | 今の状態 |
| --- | --- | --- |
| 実測の写し（移す） | mizan.ac の応答を読み、版・名前・道具 5 個・全部が読み取りだけ・セッションなし | 通過 |
| 相手の振る舞い（移す） | JSON と SSE、途中の通知、セッション、頁、名前の検査、版の言い直し、`2024-11-05`、知らない版、通知の失敗、401（token の有無）、402、403、429、404、503、405、つながらない、HTML、大きすぎる、道具が多すぎる | 通過 |
| 呼び出し（移す） | 1 回だけ。失敗しても呼び直さない。セッションを閉じる | 通過 |
| 接続先の検査（移す） | 通らない URL 7 種へ 1 回も送らない。別の host への転送に許可を持ち出さない。内部のアドレスへの転送、転送の回数、名前を引いた先 | 通過 |
| 相手の許可（移す） | 公開情報の探し方、取り方の決定 10 通り、PKCE（RFC 7636 の値）、認可の URL、token の本文 | 通過 |
| 握手の結果を書く（足す）`tests/noah-probe.test.mjs` | 4.2 の表の全行。host の間隔。取り合い | 足す |
| 許可の往復（足す）`tests/noah-oauth-service.test.mjs` | 試験用の認可サーバー（client 文書だけ／動的登録だけ／両方／PKCE なし）。`state` は 1 回だけ・10 分・本人だけ。別の resource へ token を付けない。更新の失敗で `needs_action` | 足す |
| 公開の接続先（手で 1 回） | 鍵なしで応答する 20 件に L1 が付く。401 を返す 5 件に `auth='oauth'` が付く | PR 本文に結果を書く |

## 8. 決めていない事

- `NOAH_BROKER_KEY` を置くこと（本人が決める。置くまで、相手の許可の段は「準備が必要」）。
- 次の版（2026-07-28 の `server/discover`）への切り替え。標本で応じたのは 273 件のうち 8 件。今は使わない。割合が 5 割を越えたら、握手の前に試す。
- 握手を Cloudflare の Worker から行う時の、同時の数と 1 日の回数（subrequest の上限）。最初は、手元の巡回（60 秒に 8 件 ＝ 1 日 11,520 件）で始める。3 万 host を 1 巡するのに約 3 日。
- 旧い SSE だけの接続先（704 件）への対応。今は「つなげない」。

## 9. 完了の定義

- `node --experimental-strip-types --test tests/noah-mouth-remote.test.mjs tests/noah-oauth.test.mjs tests/noah-probe.test.mjs tests/noah-oauth-service.test.mjs` が通る。
- 手元の D1 で巡回を回し、鍵の宣言が無い候補 100 件に握手の結果が付く。内訳（応答・401・失敗）を PR 本文に書く。実測（54.6%・34.8%・10.6%）から大きく外れたら、原因を書く。
- `npm run sky:check`（`lib/mcp-*` を変えていない事）、`npm run typecheck`、`npm run lint:product`。

## 10. ローンチの範囲（[ローンチの最小限](mvp-launch.md) の L4）

ローンチまでに作るのは、この章に書いた範囲だけ。相手の許可（5 章の全部）は、出した後の最初に足す。

### 10.1 入れる物・後にする物

| 章 | ローンチまで | 後 |
| --- | --- | --- |
| 3 変える所 | `lib/noah-mouth-mcp-remote.ts`（握手・一覧・呼び出し・閉じる・接続先の検査）、`lib/noah-form.ts`（[noah-form-v1.ts](../contracts/noah-form-v1.ts) を全部移す。握手の時に、入力欄で使える道具の数を数えるのに使う。87 も使う）、`lib/noah-probe.ts`（`probeL1`・結果の書き方）、`lib/noah-intake-probe.ts` の `probeDue()`（`createIntakeStore` が出す） | `lib/noah-mouth-space.ts`、`lib/noah-oauth.ts`、`lib/noah-oauth-service.ts`、`lib/noah-broker-cipher.ts`、`app/oauth/client.json`、`app/api/noah/oauth/*`、`noah_oauth_*` の表 |
| 4 握手 | 全部。4.2 の表は 10.3 の違いつきで | — |
| 5 相手の許可 | 無し。握手が 401 を返したら `result='auth_required'`・`level=0`・`auth='unknown'` と書くだけで、**公開情報を探す通信（5.1）を 1 回も送らない** | 出した後の最初 |
| 6 巡回での握手 | 入れる。10.3 の違いつきで | — |

### 10.2 参照実装を、実在の接続先に通した結果（2026-11-20）

握手の標本と同じ 500 host へ、参照実装の `noahMcpHandshake`（最新の版を名乗る）を通した。道具は呼んでいない。

| 結果 | 件数 | 割合 | ローンチでの扱い |
| --- | --- | --- | --- |
| 握手と一覧が通った | 276 | 55.2% | 入力欄で使える道具があれば、一覧に載せる |
| 相手の許可が要る（401） | 174 | 34.8% | 載せない（出した後、相手の許可を入れた時に載る） |
| 呼ぶたびの支払いが要る（402） | 4 | 0.8% | 載せない |
| 応答しない（つながらない 16、404 が 16、410 が 2、5xx が 8） | 42 | 8.4% | 載せない。巡回が確かめ直す |
| 形が合わない（405 が 2、406 が 1、相手のエラー 1） | 4 | 0.8% | 載せない |

- 410（無くなった）は、この実測で 2 件あった。参照実装を直して「応答しない」に数えるようにした（前は「形が合わない」）。
- 最新の版（`2025-11-25`）を名乗った時に相手が返した版: `2025-11-25` が 211、`2025-06-18` が 51、`2025-03-26` が 9、`2024-11-05` が 5。先の調査（`2025-06-18` を名乗った）では、262 件が `2025-06-18` を返していた。**ほとんどの相手は、名乗った版に合わせる。** 最新の版を名乗った初期化が通らず、1 つ前の版で名乗り直して通った相手が 2 あった（通った物の 0.7%。返した版は `2025-06-18` と `2025-03-26`）。4.1 の名乗り直し（相手がエラーを返した時だけ、1 つ前の版でもう 1 回）が無いと、この 2 つは「形が合わない」になる。名乗り直しは、ローンチでも入れる。
- セッションを使う相手は 29（10.5%）。握手の時間（`initialize` から一覧の終わりまで）は、中央値 1.18 秒、9 割が 2.05 秒以内、最大 11.7 秒。
- 先の調査の作業用のスクリプトが一覧を読めなかった 11 件も、参照実装は読めた（SSE の読み方の違い）。
- 道具は合わせて 3,699 個。接続先ごとに中央値 6、9 割が 25 以下、最大 244。名前の形で入れなかった道具は 1 個。全部の道具が読み取りだけと宣言された接続先は 129（46.7%）、宣言が 1 つも無い接続先は 71（25.7%）。

**1 時間あけて、もう 1 回握手した**（上で通った 276 host。同じ日の 20:37 JST。間隔は 61〜63 分。道具は呼んでいない）:

| 見た事 | 結果 | 設計での扱い |
| --- | --- | --- |
| もう 1 回も通った | 274（99.3%）。残りの 2 は、10 秒待っても応答しなかった | 1 回の失敗では外さない。6 時間後に確かめ直し、2 回続いたら外す（88 の 9.3） |
| 相手が返した版 | 274 のうち、1 回目と違う物は 0 | — |
| 初期化を名乗り直した | 2（0.7%）。初期化の要求だけが 2 回で、2 つとも通った | 上の箇条書きのとおり。握手が 1 往復増える |
| 接続先の全部の道具の hash が変わった | 1（0.4%）。道具が 1 つ増えた（9 → 10） | `level` を変えない。hash と数を新しくするだけ（88 の 9.4） |
| 1 つ 1 つの道具の定義が変わった・消えた | 3,563 個のうち 0 | 本人が見た道具 1 つの定義と照らす作り（87 の 11.4）なら、この 1 時間で止まる依頼は無い。接続先の全部の hash で止める作りなら、1 host が止まる |
| 握手 1 回で送った要求の数 | 3 回が 242、4 回が 31（セッションを閉じる 29、名乗り直し 2）、6 回が 1（下の転送） | 巡回の見積もり（97 の 3 章）は、1 件 4 回で数えている |
| 別の host へ転送する | 1（276 のうち。0.4%）。要求のたびに、別の名前の host へ回した。転送に従えば握手は通る | **ローンチでは従わない**（10.3 の 9）。この接続先は `blocked` になり、載らない。載る見込み（約 18,000）から約 60 系列減る。幅の中 |
| 同じ host の中の転送 | 0 | 従う作りはそのまま（試験は検証キットにある） |
| 握手の時間 | 中央値 1.19 秒、9 割が 2.27 秒以内 | 1 回目（1.18 秒・2.05 秒）と同じ |

標本は 1 回・1 時間だけ。日や週の単位でどれだけ変わるかは、まだ測っていない。出した後は、巡回の合図の記録の `toolsChanged`（道具の定義の hash が、前の握手と違った数）で数える（[97](spec-97-launch-ops.md) の 4 章）。

### 10.3 巡回での握手（ローンチ版。6 章との違い）

| # | 違い | 理由 |
| --- | --- | --- |
| 1 | 握手するのは、`mouth='mcp-remote'` で `setup=0` の候補だけ（6 章の 1 の問い合わせ。ローンチでは `mcp-remote` の候補しか入っていない）。量産の系列と、取り下げた系列は握手しない（88 の 9.7・9.8） | ローンチで載せない物へ、通信を送らない |
| 2 | 握手が通った時に書く列に、`form_tools`・`one_tap_tools`（`noahFormSummary(tools)`）を足す | 入力欄で使える道具が無い接続先を、一覧に載せない。「押すだけで試せる」の絞り込み |
| 3 | 握手の表を書いた直後に、その候補が代表の系列へ写す（[noah-listing-v1.sql](../contracts/noah-listing-v1.sql) の `touch`。値は `noahListing` から） | 次の名寄せ（1 日 1 回）を待たずに、一覧へ出す・外す |
| 4 | 401 の時、発見（5.1）を行わない | 相手の許可は、出した後 |
| 5 | 「応答しない」が 2 回続いたら `level=0`（88 の 9.3）。1 回目の後は、6 時間後に確かめ直す | 止まった物を、何日も並べたままにしない |
| 6 | 道具の定義の hash が前と違っても、`level` を変えない。hash と数を新しくするだけ（88 の 9.4） | 呼ぶ時に、本人が見た道具 1 つの定義を確かめる（87 の 11.4） |
| 7 | 1 回の合図で握手するのは `NOAH_PATROL_BUDGET.probes` 件（既定 8）。同時に 4 件まで。握手 1 件の全体の待ちは 12 秒まで（`ctx.signal` に `AbortSignal.timeout(12_000)`） | Workers は、同時に開ける外向きの接続が 6 本まで。合図 1 回を 25 秒に収める |
| 8 | 名乗りは `user-agent: NoahBot/1 (+https://<origin>/noah/help#bot)`。利用者の操作から握手する時（接続・道具の一覧・依頼）は `Noah/1 (+…)` | 相手が、定期の確かめと、人の利用を見分けられる |
| 9 | 巡回・接続・道具の一覧・依頼の全部で、`createNoahGuardedFetch(fetch, { sameHost: true })` を使う。**別の host への転送には従わない**（`blocked`。同じ host の中の転送には従う） | 画面に「入力は <host> へ送られます。」と出した送り先の外へ、本人の入力を送らない。接続要件の `egress` が、その host 1 つだけである事と対になる。巡回も同じにするのは、握手で別の host へ回される物を、一覧に載せないため。実測では、握手が通った 276 のうち 1（10.2）。出した後に足せる作り: 転送先を握手の記録に持ち、「入力は <転送先> へ送られます。」と見せた上でつなぐ |

| 10 | 401 の候補を、次に確かめるのは 30 日後（4.2 の表は、相手の許可なら 7 日後・鍵なら 30 日後） | 発見を行わないので、どちらか分からない（`auth='unknown'`）。相手の許可を入れる時に、401 の候補の期限を今に戻して、4.2 の表へ戻す |
| 11 | 1 回の合図で取る候補は、握手の数の 4 倍まで（上限 90）。握手の対象でない物（量産の系列・取り下げた系列・台帳で取り下げになった記録）は、取った時に 30 日後へ送る。同じ接続先を握手したばかりの物は、1 時間後へ送る。残りは、期限をそのままにして放す | 期限の列の先頭に、握手しない物が溜まると、握手が進まない。名寄せの直後にも、量産の系列の候補を 30 日後へ送る（88 の 9.7）。握手の対象に戻った候補（量産がほどけた・取り下げを戻した）で、まだ 1 回も握手していない物は、名寄せの時に期限を今に戻す |
| 12 | 握手 1 件の待ち（12 秒）が、合図の残り時間に無い時は、新しい握手を始めない。接続先の枠（`noah_probe_hosts`）は、握手を始める直前に取る | 合図 1 回を 25 秒に収める。握手しないのに、接続先の枠だけを使わない |
| 13 | 握手の結果は、取り置きの値（`lease_until`）が、取った時のままの時だけ書く。書けなかった結果は、系列にも写さない | 握手の間に、取り込みが握手の記録を消した（接続先が変わった）時に、前の接続先の結果で上書きしない。2 つの合図が、同じ候補の結果を書かない |
| 14 | 系列へ写すのは、その候補が、今の系列の代表の時だけ。値は、名寄せの SQL と同じ決まりで出す。載せる条件（深さ・載せる印・押すだけの印・印の種類）が変わらない時は、系列の行を書かない | 7 日ごとの確かめ直しで、系列の `revision` を進めない（運営の取り下げの操作が、「内容が更新されました」で弾かれない）。名寄せと握手で、値が行き来しない |
| 15 | 手元の入口（`POST /api/noah/intake` に `{}`）は、台帳の読み取りだけ。握手は、合図の入口（`/api/noah/intake/tick`）と、受入の script（`scripts/check-noah-probe.mjs`）だけ | 手元の開発の server は、内部のアドレスへ届く。名前を引いた先の検査（4.4 の `check`。`probeCheck` として渡す）を付けられる所でだけ握手する。手元の server で合図の入口を開ける（合図の鍵と `NOAH_PATROL_ENABLED` を置く）と、この検査なしで握手するので、握手の確かめには script を使う |

握手の結果の書き方は 4.2 の表のまま（上の 4〜6・10 を除く）。`unreachable` の行は「`failures` を 1 増やす。2 回目で `level=0`」と読み替える。書く値は、純関数 `planNoahProbeWrite`（`lib/noah-probe.ts`）が決める。level が 0 になる時は、その段になった時刻（`l1_at`・`l2_at`）を消す。前に見た道具の hash と数は残す。最初の失敗から 30 日で系列を隠し、握手が通ると戻す（88 の 9.3 を、ここで入れた）。

接続先の検査（4.4）: Web の本体（Workers）では、`createNoahGuardedFetch(fetch)` を `check` なしで使う。手元の巡回（Node）では、4.4 の `check`（名前を引いた先のアドレスの検査）を付ける。**本番の Worker から、内部向けのアドレスを指す名前へ届かない事は、この設計では確かめていない**（Workers の作りからの推定）。出す前に 1 回確かめる（[ローンチの最小限](mvp-launch.md) の G3）:

1. 確かめ方: Cloudflare の上で動く形（`wrangler dev --remote` か、審査者だけが呼べる一時の入口）で、内部のアドレスに引ける公開の名前へ、`createNoahGuardedFetch(fetch)` を通して 1 回ずつ握手を試す。例: `127.0.0.1.nip.io`、`10.0.0.1.nip.io`、`192.168.0.1.nip.io`、`169.254.169.254.nip.io`（どれも、名前の検査 `remoteMcpUrl` は通る）。
2. 合格: 4 つとも「応答しない」（`unreachable`）か「つなげない」（`blocked`）。
3. 1 つでも届いた時の手当て（その時だけ作る）: 握手の前に、名前を公開の DNS（DNS over HTTPS。`accept: application/dns-json`）で引き、A と AAAA の答えを `isNoahPrivateAddress` に通す `check` を、Workers でも付ける。1 つでも内部向けなら `blocked`。引けなければ `unreachable`。この `check` は、巡回・接続・道具の一覧・依頼の全部の握手に付ける。
4. 結果（4 つの名前と、それぞれの結果）を PR 本文に書く。

### 10.4 試験（7 章に足す。`tests/noah-probe.test.mjs`）

| 試験 | 前提 | 期待 |
| --- | --- | --- |
| 握手・呼び出し・接続先の検査（移す）`tests/noah-mouth-remote.test.mjs` | — | [noah-mouth.test.mjs](../design-validation/noah/noah-mouth.test.mjs) のうち、握手・呼び出し・検査の群（相手の許可と起動の型紙の群は、今は移さない） |
| 入力欄の関数（移す）`tests/noah-form.test.mjs` | — | [noah-form.test.mjs](../design-validation/noah/noah-form.test.mjs) の 11 群 |
| 握手の結果を書く | 4.2 の表の全行 | `result`・`level`・`auth`・次に確かめる時。通った行に `form_tools`・`one_tap_tools` が入る |
| 系列への写し | 握手が通る／入力欄で使える道具が 0 | 一覧に出る／出ない。名寄せを呼ばない |
| 401 | 相手が 401 と `WWW-Authenticate` を返す | `auth_required`。相手が受けた要求は `initialize` の 1 回だけ。認可サーバーの host へ 0 回 |
| 410 | — | 「応答しない」に数える |
| 2 回続けて失敗 | — | 1 回目は一覧に残り、次は 6 時間後。2 回目で一覧から消える |
| 定義が変わる | 2 回目の握手で、道具の説明が違う | `tools_sha256` が新しくなる。`level` はそのまま |
| 対象から外す物 | 鍵の要る候補、量産の系列、取り下げた系列 | 握手しない |
| 同時の数と時間 | 握手が 5 秒掛かる相手を 8 件 | 同時に 4 件まで。合図 1 回が 25 秒を越えない（残りは次の合図） |
| host の間隔 | 同じ host の候補が 5 件 | 1 時間に 1 件 |
| 名乗り | 巡回／接続 | `NoahBot/1`／`Noah/1` |
| 別の host への転送 | 握手に、別の host への 307 を返す相手 | `blocked`。転送先へ 1 回も送らない。一覧に載らない。次に確かめるのは 30 日後 |
| 版の名乗り直し | 最新の版での初期化にエラーを返し、1 つ前の版なら通る相手 | 握手が通る。初期化は 2 回。3 回目は送らない（2 回とも通らなければ「形が合わない」） |
| 30 日の失敗 | 握手が、最初の失敗から 30 日を越えて通らない | 系列を隠す。握手が通ると戻り、一覧に出る |
| 握手の間に記録が変わる | 握手の途中で、取り込みが握手の記録を消す | 結果を書かない。系列にも写さない |
| 合図の応答と記録 | 握手の数を 2 件にした環境変数／台帳が 503 | 握手は 2 件。応答と 1 行に、握手の数。台帳を読めない合図でも握手は進み、応答は 500 |
| 一覧の SQL（移す） | — | `lib/noah-intake-listing.ts` の文が、[noah-listing-v1.sql](../contracts/noah-listing-v1.sql) の同じ名前の文と 1 文字も違わない |

### 10.5 完了の定義（L4）

- `node --experimental-strip-types --test tests/noah-mouth-remote.test.mjs tests/noah-form.test.mjs tests/noah-probe.test.mjs` が通る。
- 手元の D1 で合図を回し、鍵の宣言が無い候補 100 件に握手の結果が付く。内訳（通った・401・応答しない）と、通った物のうち `form_tools >= 1` の割合を PR 本文に書く。10.2 の表（55%・35%・9%、入力欄で使える道具がある物は 99%）から大きく外れたら、原因を書く。
  - やり方: `node --experimental-strip-types scripts/check-noah-probe.mjs --live --records=<台帳の記録の .jsonl> --limit=100`（表は、手元の、終わると消える D1。握手だけを送る）。引数なしなら、合成の台帳と接続先（外へ通信しない）。
- 一覧の API（85 の 11.5）に、握手が通った系列が「まだ誰も動かしていない」として出る（審査者の account で）。
- `lib/noah-oauth*.ts` と `noah_oauth_*` の表を作っていない。`npm run sky:check`（`lib/mcp-*` を変えていない事）、`npm run typecheck`、`npm run lint:product`。

### 10.6 実装の記録（2026-11-21）

| 物 | 場所 |
| --- | --- |
| 握手・道具の一覧・道具の呼び出し・閉じる・接続先の検査 | `lib/noah-mouth-mcp-remote.ts`（型契約から、関数ごと移した。型契約の側は、相手の許可と起動の型紙を残して、再 export） |
| 入力欄の関数 | `lib/noah-form.ts`（型契約の全部。型契約の側は再 export） |
| 握手 1 回（`probeL1`）、結果の書き方（`planNoahProbeWrite`）、見回りの間隔（`nextNoahCheck`） | `lib/noah-probe.ts`（表を読まない。通信は、渡された fetch だけ） |
| 巡回での握手（`probeDue`） | `lib/noah-intake-probe.ts`。`createIntakeStore` が `probeDue` を出し、合図の入口（`lib/noah-intake-api.ts` の `createIntakeTick`）が、台帳の巡回の後に呼ぶ |
| 名寄せの直後の、握手の期限の手当て | `lib/noah-intake-sync.ts` の `regroupStatements` |
| 受入 | `scripts/check-noah-probe.mjs`（既定は合成。`--live` は実在の接続先） |

1 回の合図で進める量（`NOAH_PATROL_BUDGET`）は、合図の入口で `flags.patrolBudget` を渡す（L3 では、環境変数の値が巡回へ届いていなかった）。

D1 の query の数（合図 1 回。`db.batch` は 1。手元の計測）: 最初の全件の間（台帳 10 頁＋握手 8 件）は約 110。毎時の更新（100 件＋握手 8 件）は約 20。握手だけの合図は 11。握手だけの合図の 11 のうち、握手 8 件ぶんは 9（取る 1・系列を読む 1・接続先の枠 2・結果 2・系列への写し 2・放す 1）。残りの 2 は、台帳の巡回の確かめ。

受入の結果（10.5。2026-11-21 00:19 JST。台帳の写し 2026-11-20 から、鍵の宣言が無い・相手のサーバーの記録を、接続先が別々になるように無作為に 100 件。握手だけ。道具は呼んでいない。1 接続先に 1 回。合図 15 回・全部で 52 秒）:

| 結果 | 件数 | 10.2 の表（500 件） |
| --- | --- | --- |
| 握手と一覧が通った | 51 | 55.2% |
| 相手の許可が要る（401） | 35 | 34.8% |
| 応答しない | 11 | 8.4% |
| 形が合わない | 2 | 0.8% |
| つなげない（別の接続先への転送か、名前を引いた先の検査。接続先の URL の検査は、100 件とも通る） | 1 | 転送は 276 のうち 1 |

通った 51 のうち、入力欄で使える道具がある物は 50（98%。10.2 は 99%）。押すだけで頼める道具がある物は 38。一覧に載る系列は 50。握手の時間は、中央値 1.17 秒・9 割が 2.36 秒以内・最大 4.24 秒（10.2 は 1.18 秒・2.05 秒）。100 件の標本の幅（±10 ポイント）の中で、10.2 の表と合う。

確かめていない事: 本番の Worker から、内部向けのアドレスを指す名前へ届かない事（10.3 の最後の手順。出す前に 1 回。[ローンチの最小限](mvp-launch.md) の G3）。
