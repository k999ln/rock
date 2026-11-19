# 仕様書 86 — リモートの口（握手・道具の一覧・相手の許可）と、握手までの接続試験（L1）

task: [codex/tasks/86-noah-remote-mouth.md](../../codex/tasks/86-noah-remote-mouth.md)。先に要る物: 85（候補と checks の表）。
型契約: [noah-mouth-v1.ts](../contracts/noah-mouth-v1.ts)。試験: [noah-mouth.test.mjs](../design-validation/noah/noah-mouth.test.mjs)（9 群）。実測の写し: [fixtures/mcp-exchange-mizan.json](../design-validation/noah/fixtures/mcp-exchange-mizan.json)。

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

### 4.2 握手の結果（`NoahMouthError.code` → `noah_intake_checks`）

| 相手の応答 | code | `result` | `level` | `auth` | 次に確かめる時 |
| --- | --- | --- | --- | --- | --- |
| 握手と一覧が通った。道具が 1 つ以上 | — | `ok` | 1 | `none` | 7 日後（88） |
| 同じ。道具が 0 個 | — | `incompatible` | 0 | `none` | 7 日後 |
| 401 | `auth_required` | `auth_required` | 0 | 5 章の発見が通れば `oauth`、通らなければ `key` | `oauth` は 7 日後。`key` は 30 日後 |
| 402 | `payment_required` | `payment_required` | 0 | `payment` | 30 日後 |
| 403 | `forbidden` | `forbidden` | 0 | `unknown` | 7 日後 |
| 429 | `rate_limited` | `rate_limited` | 変えない | 変えない | `Retry-After`（無ければ 60 秒）の後。`noah_probe_hosts.not_before` にも入れる |
| 名前が引けない・つながらない・時間切れ・404・5xx | `unreachable` | `unreachable` | 変えない（88 が、続いたら下げる） | 変えない | 間隔を 2 倍 |
| 応答が読めない・版が合わない・相手がエラーを返した・400・405 | `incompatible` | `incompatible` | 0 | 変えない | 7 日後 |
| 応答が 1MB を越えた・道具が 500 個を越えた | `too_large` | `too_large` | 0 | 変えない | 30 日後 |
| 接続先が検査を通らない | `blocked` | `blocked` | 0 | 変えない | 確かめ直さない（記録が変わるまで） |

通った時に書く列: `tools_sha256`、`tool_count`、`read_only`（全部の道具が読み取りだけと宣言されているか）、`latency_ms`（握手から一覧の終わりまで）、`l1_at`、`checked_at`、`failures=0`、`first_failure_at=NULL`。**道具の定義そのものは保存しない**（hash と数だけ。定義は、つなぐ時に読み直す）。

道具の扱い: 名前が `[A-Za-z0-9_.:/-]{1,128}` でない物と、重複した名前は入れない（数だけ数える）。`annotations.readOnlyHint === true` の物だけを「読み取りだけ」とする。宣言が無い物（標本の 24.8% の接続先は、宣言が 1 つも無い）は、読み取りだけとして扱わない。

### 4.3 上限（`NOAH_MOUTH_LIMITS`。数値は候補）

握手と一覧の待ち 10 秒（実測の 9 割は 1.2 秒以内）。道具の呼び出しの待ち 60 秒。1 応答 1MB（実測の最大 606KB）。道具 500 個。一覧 10 頁。転送 3 回。

### 4.4 接続先の検査（`createNoahGuardedFetch`）

1. URL は `remoteMcpUrl`（既存）を通す: HTTPS、認証情報なし、`#` なし、数字だけの host と内部向けの名前（`localhost`・`.local`・`.internal`・`.lan`・`.test`・`.invalid`・`.onion`）を拒否。
2. 転送は自分で追う（`redirect: 'manual'`）。転送先ごとに 1 をやり直す。3 回まで。
3. 別の host への転送には、`authorization` と本人の鍵の header を付けない（`content-type`・`accept`・`mcp-protocol-version`・`user-agent` だけを残す）。
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

1. 取る: `SELECT candidate_id FROM noah_intake_checks WHERE next_check_at <= ? AND lease_until < ? ORDER BY next_check_at LIMIT 8` を `UPDATE … SET lease_until = now + 60000 … RETURNING` で（2 つの巡回が同じ候補を取らない事は、検証キットが確かめている）。
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
