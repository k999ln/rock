# 仕様書 73 — 接続要件と接続計画（純関数・計画の API・カードの印）

task: [codex/tasks/73-noah-connect-plan.md](../../codex/tasks/73-noah-connect-plan.md)。先に要る物: 84。雲の契約は要らない。
型契約: [noah-connect-v1.ts](../contracts/noah-connect-v1.ts)。試験: [noah-connect.test.mjs](../design-validation/noah/noah-connect.test.mjs)（9 群）。

## 1. 完成の姿

- どの Agent のカードにも、押す前に「あと何をすればつながるか」が 1 つの印で出る: 「1 クリック」／「あと 1 タップ（◯◯）」／「準備が必要（◯◯）」／「まだ誰も動かしていない」。
- 印は、**本人の今の状態から毎回計算する。** 端末を足した後、許可を 1 つ取った後、同じカードの印が変わる。
- 計画は何も変えない。権限も利用権も与えない。

## 2. この仕様で決めた事

| 決めた事 | 理由 |
| --- | --- |
| 接続要件（`noah-connect/1`）は、Package や候補の横に置く別の記録にする。`sky-tool-package/1` と `noah-agent/1` の parser と hash は変えない | 既存の版の hash を変えないため |
| 口と置き場所と面の組み合わせを、parser が拒否する（相手のサーバーの口は `provider` だけ・面は `none` だけ。端末の口に `provider` は不可） | 機種の名前や、成り立たない組み合わせを、保存の前に落とす |
| モデルの使い方に `local`（端末のモデル）を足す | 今の 13 件のうち 11 件は、Mac の中のモデル（`qwen2.5:1.5b` など）で動く。`relay` でも `none` でもない |
| 相手の許可（OAuth）の印は「あと 1 タップ（<host> のアカウントで許可）」と書く | 401 を返した 174 host の認可の相手は 167 種類。1 タップの先に、その提供者のアカウントが要る |
| 秘密値の検査は、URL では host を見ず、パスと query を接頭辞だけで見る | 全件に通した時、AWS の関数 URL の host（32 文字の英数字）と、パスの中の ID を、鍵と誤って落とした。直した後に落ちるのは、本物の鍵 6 件 |

## 3. 今あるコードと、変える所

| ファイル | 今 | 変える事 |
| --- | --- | --- |
| `lib/noah-connect-requirements.ts` | 無い | 型契約から、型・`parseNoahConnect`・`canonicalJson`・`sha256Hex`・`noahConnectSha256`・`looksLikeNoahSecret`・`isNoahPublicHost`・`noahPublicHttpsUrl`・`diffNoahConnect` を移す |
| `lib/noah-connect-plan.ts` | 無い | 型契約から `planNoahConnection`・`noahPlanSha256`・状態遷移（`nextNoahConnectionState` ほか）を移す |
| `lib/noah-connect-source.ts` | 無い | 新規。今ある Agent から接続要件を作る（4.3）と、本人の状態を集める（4.4） |
| `lib/noah-connect-plan-api.ts`、`app/api/noah/connect-plan/route.ts` | 無い | 新規。`GET` だけ |
| `lib/noah-launch.ts` の `catalog()`、`lib/noah-feed.ts`、`lib/noah-public-catalog-api.ts` | 一覧の各項目は `id`・`name`・`summary`・`version`・`author`・`kind`・`model` | 各項目に `connect`（5.2）を足す。今ある項目は変えない |
| `components/noah-card.tsx` | 無い | 新規（6 章）。`components/noah-launch.tsx`・`noah-public-catalog.tsx`・`noah-timeline.tsx` の一覧の 1 行を、この部品に置き換える |

変えない物: `/api/noah/launch` と `/api/noah/instances` の検査。`resolveNoahPin`・`authorizedNoahRelease`。

## 4. 規則

### 4.1 接続要件の検査（`parseNoahConnect`。合わなければ `NoahConnectError`。`code` は機械用）

| # | 規則 | 違反の code |
| --- | --- | --- |
| 1 | object。未知の項目が無い | `shape`・`unknown_key` |
| 2 | `schema` は `noah-connect/1` | `schema` |
| 3 | `packageKey`＋`manifestSha256`（載せた版）か、`candidateId`＋`candidateDigest`（取り込んだ物）の、どちらか一方。hash は hex 64 桁 | `subject` |
| 4 | `mouth` は `mcp-remote`・`space-mcp`・`a2a`・`mcp-package`・`acp`・`source`。`surface` は `none`・`terminal`・`browser`・`screen`・`own-device` | `enum` |
| 5 | `places` は `provider`・`home`・`cloud`・`pocket` から重複なしで 1 つ以上（機種の名前は 4 の違反になる） | `enum`・`places` |
| 6 | 相手のサーバーの口（`mcp-remote`・`space-mcp`・`a2a`）は `places=['provider']`・`surface='none'`・`codeDelivery='none'`。それ以外の口は `provider` を持てず、`surface` は `none` 以外、`codeDelivery` は `cloud_only` か `device_allowed` | `places`・`surface`・`codeDelivery` |
| 7 | `pocket` は口が `source` の時だけ | `places` |
| 8 | `target`（口ごとの形。下の表） | `url`・`header`・`identifier`・`integrity`・`arg`・`env` |
| 9 | `model.use` は `none`・`local`・`relay`・`provider`・`own_account`。`own_account` は `places=['home']` だけ。`local` は `home`・`pocket` だけ | `enum`・`places` |
| 10 | `egress` は公開の host の名前だけ（`*`、数字のアドレス、内部向けの名前は不可）。32 個まで。相手のサーバーの口は、接続先の host 1 つと一致 | `egress` |
| 11 | `services` は 16 個まで。`id` は重複なし。`method` は `oauth`・`official_login`・`none` | `shape`・`enum` |
| 12 | `secrets`（本人が入力する物の名前）16 個まで、`uses` 16 個まで、`try.input` 2,000 文字まで | `shape` |
| 13 | 値を持てる欄（URL のパスと query、header の固定値、引数、固定の環境変数、見本の入力、`uses`）に、秘密値らしい値が無い | `secret` |
| 14 | 決まった順の JSON にして 16KB まで | `size` |

`target` の形:

| 口 | 形 | 検査 |
| --- | --- | --- |
| `mcp-remote` | `{ url, headers: [{ name, required, secret, value?, template? }] }` | URL は HTTPS・公開の host・認証情報なし・`#` なし。`{名前}` の差し込みはパスと query だけ。header は 8 個まで。Noah が自分で付ける header（`Host`・`Content-Type`・`Accept`・`Origin`・`Cookie`・`Mcp-Session-Id`・`Mcp-Protocol-Version`・`User-Agent` ほか）は書けない。秘密の header に固定の値は置けない。`template` は「接頭辞 {名前}」の形 |
| `space-mcp` | `{ spaceId, host }` | `host` は `*.hf.space` |
| `a2a` | `{ cardUrl }` | URL の検査は同じ |
| `mcp-package`・`acp` | `{ registryType, identifier, version, integrity, args, command?, extras?, env, fixedEnv? }` | `npm`: 名前の形と、1 つに決まる版（`^1.0.0`・`latest` は不可）。`pypi`: 名前の形と版。`oci`: `host/path` と tag。`binary`: HTTPS の URL、`integrity` と `command` が必須。`integrity` は `sha512-…`（npm）か `sha256:…`。固定の前は null。引数は 16 個まで、`[A-Za-z0-9@%_+=:,./-]` だけ。環境変数の名前は 32 個まで |
| `source` | `{ runtime: 'recipe' ｜ 'noah-terminal/1', key }` | `key` は小文字・数字・`-` |

秘密値らしい値（`looksLikeNoahSecret`）: `sk-`・`ghp_`・`gho_`・`github_pat_`・`xoxb-` などの接頭辞の後ろに 8 文字以上。`Bearer ` の後ろに 12 文字以上。区切りの無い英数字が 32 文字以上で、英字と数字の両方を含む並び。

### 4.2 接続計画（`planNoahConnection(req, state)`）

段は、いつも次の順で並べる: `account` → `entitlement` → `place` → `runtime` → `model` → `services`（要る数だけ）→ `secrets`（要る数だけ）→ `consent`。各段は `fill`（`auto`・`tap`・`typed`）と `state`（`satisfied`・`needed`・`blocked`）を持つ。

| 段 | 済み（何もしない） | 1 タップ | 入力・導入が要る | 画面の 1 行 |
| --- | --- | --- | --- | --- |
| `account` | サインイン済み | 未サインイン | — | 「サインイン」 |
| `entitlement` | 作者本人・無料・購入済み・試用中 | 有料で、支払い方法がある | 有料で、支払い方法が無い | 「購入」「支払い方法の登録」 |
| `place` | `provider`・`cloud`。`home`・`pocket` は応答中の端末がある | — | 端末が無い／止まっている | 「端末を足す」「端末を動かす」「この端末で開く」 |
| `runtime` | いつも済み（端末が用意する） | — | — | — |
| `model` | `own_account` 以外。`own_account` でログイン済み | — | `own_account` で未ログイン | 「提供元のアカウントにログイン」 |
| `services` | 必須でない／`method=none`／許可を持っている | `oauth` で、Noah が client として登録できる | それ以外 | `services[].purpose`（例「GitHub の許可」） |
| `secrets` | 無い | — | 1 つごとに 1 段 | 「<名前> を入力」 |
| `consent` | 同じ接続要件に同意済み。または、無料で、権限が `read_user_input`・`write_results` だけ | それ以外 | — | 「権限の確認」 |

置き場所の決め方:

1. 候補は、接続要件の `places` のうち、今の設定で使える物。`cloud` は `cloudEnabled` が真で、本人の希望が「自分の端末だけ」でない時。`home`・`pocket` は、希望が「雲だけ」でない時。
2. 候補ごとに段を作り、手数（入力の数、タップの数）を数える。
3. 入力の数が最も少ない所。同じなら、タップの数が最も少ない所。それも同じなら `provider` → `home` → `cloud` → `pocket` の順。
4. 家の端末は、応答している物のうち、並びの先頭（本人が既定にした端末を先に並べる）。

印:

| 条件（上から順） | 印 | カードの文 |
| --- | --- | --- |
| 面が `own-device`／利用権が取り消し／使える置き場所が無い | `blocked` | 一覧に出さない。詳細では「この Agent は、今の端末ではつなげません。<理由>」 |
| 入力が 1 つ以上 | `setup` | 「準備が必要（<最初に足りない物>）」 |
| 取り込んだ物で、接続試験が L2 に届いていない | `unverified` | 「まだ誰も動かしていない」 |
| タップが 1 つ以上 | `taps` | 「あと <n> タップ（<最初に足りない物>）」 |
| どれでもない | `one_click` | 「1 クリック」 |

試験の表（27 行）は [noah-connect.test.mjs](../design-validation/noah/noah-connect.test.mjs) の `接続計画: 表の全行`。行を足す時は、表と試験の両方へ足す。

### 4.3 今ある Agent の接続要件（`lib/noah-connect-source.ts` の `connectForPin(pin)`）

今の実装から決まる値だけを入れる。作者に書かせない。

| 種類（`NoahAgentPin.kind`） | 口・面・置き場所 | `target` | `model` | その他 |
| --- | --- | --- | --- | --- |
| `catalog`（`RECIPES` の 13 件） | `source`・`terminal`・`['home']` | `{ runtime: 'recipe', key: recipe.key }` | `recipe.provider` があれば `{ use: 'own_account' }`。無ければ `{ use: 'local', needs: [modelFor(recipe)] }` | `packageKey: 'catalog:' + pin.agentId`、`manifestSha256: pin.digest`、`egress: []`、`codeDelivery: 'device_allowed'` |
| `upload`・`release`（`noah-terminal/1`） | `source`・`terminal`・`['home']` | `{ runtime: 'noah-terminal/1', key: 'terminal' }` | `runtime.model` が `none` なら `{ use: 'none' }`。それ以外は `{ use: 'local', needs: [runtime.model] }` | `packageKey`・`manifestSha256` は pin から。`egress: []` |
| `invite` | 対象外（今の `/api/noah/launch` と同じく 422） | — | — | — |

13 件の面は、84 の `decideNoahSurface`（審査済みの実行の定義）で全部 `terminal`。雲（75）を始めた時に、`places` へ `cloud` を足す。

### 4.4 本人の状態（`planStateFor(deps, owner | null, subject)`）

| 項目 | 取り方 |
| --- | --- |
| `signedIn` | `owner !== null` |
| `entitlement`・`price` | 載せた版は `authorizedNoahRelease(deps, owner, packageKey, manifestSha256)` の結果と `manifest.pricing`。作者本人は `owner`。`catalog`・`upload`・取り込んだ物は `free`（今は全部無料） |
| `hasPaymentMethod` | 今は偽に固定（flag `NOAH_PAY_AFTER_CONNECT` が閉じている間、有料は「準備が必要」に見える） |
| `devices` | `SELECT id, last_seen_at, revoked_at FROM noah_runner_devices WHERE owner_id=?`。`revoked_at` が無い物。`place` は `home`。`online` は `last_seen_at > now - 30000` |
| `cloudEnabled` | flag `NOAH_CLOUD_DEVICE`（既定は閉） |
| `ownAccountReady` | 偽に固定（本人の契約で動く Agent は、最初の接続まで「準備が必要」。つないだ後は「頼む」になるので、計画は出ない） |
| `grantedServices`・`serviceRegistration` | 86 が足す（`noah_oauth_grants`、`noah_intake_checks.oauth_json`）。それまでは空 |
| `consentedSha256` | 74 が足す（切っていない `noah_connections` の `connect_sha256`）。それまでは null |
| `permissions` | 載せた版は manifest の権限。それ以外は `['read_user_input', 'write_results']` |
| `preference` | 今は `auto` に固定 |
| `intakeLevel` | 取り込んだ物だけ。`noah_intake_checks.level` |

## 5. API

### 5.1 `GET /api/noah/connect-plan?agent=<agentId>`（未サインインでも可。書き込まない）

`agent` は、今の `agentId`（`research-…`・`release-…`・upload の ID）か、取り込んだ系列の ID。

```json
{ "agentId": "research-8782e21ebeda898af4b7", "digest": "<64 hex>", "connectSha256": "<64 hex>", "planSha256": "<64 hex>",
  "badge": "one_click", "cost": { "taps": 0, "typed": 0 }, "place": "home", "placeLabel": "あなたの端末（Noelle の Mac）", "deviceId": "<uuid>",
  "need": null, "steps": [ { "kind": "account", "fill": "auto", "state": "satisfied" }, "…" ],
  "sendsTo": null, "price": { "model": "free" }, "note": null, "ownerScope": "owner-v1:<64 hex>" }
```

- `sendsTo` は、置き場所が `provider` の時 `{ "host": "mizan.ac" }`。それ以外は null。
- `note` は、84 の「動かない機能」の 1 行（あれば）。
- 404: Agent が無い。422: `blocked`（`{ "error": <reason> }`）。
- `Cache-Control: no-store, private`。

### 5.2 一覧の各項目に足す `connect`

```json
{ "connect": { "badge": "taps", "taps": 1, "typed": 0, "place": "provider", "placeLabel": "相手のサーバー（mcp.worldku.com）",
    "need": "mcp.worldku.com のアカウントで許可", "level": 1, "price": { "model": "free" }, "note": null } }
```

サーバーが `planNoahConnection` で計算する。カードは自分で計算しない。未サインインの時は、`signedIn=false`・端末なしで計算する。

## 6. 画面（`components/noah-card.tsx`）

```
┌ カード 1 枚（高さは固定）
│ Mizan                                      提供: ac.mizan
│ ゲームの ban の記録を調べる
│ 見本  入力: （なし）  →  成果: 560 の一覧 …
│ 1 クリック ・ 相手のサーバー（mizan.ac）・ 無料
│                                              [ 接続 ]
└
```

上から: 名前（1 行で切る）と作者／1 行説明（2 行で切る）／見本（あれば。2 行）／印・動く所・料金（必ず 3 つ）／主ボタン（44px 以上。1 枚に 1 つ）。

| props | 型 | 中身 |
| --- | --- | --- |
| `agent` | `{ id, name, summary, author? }` | 今の一覧の項目 |
| `connect` | 5.2 の形 | 印とボタンは、これだけで決める |
| `connected` | `boolean` | 真なら主ボタンは「頼む」 |
| `onConnect` | `(agentId) => void` | 74 が足す。それまでは `/noah/launch?agent=<id>` へ移る |

印の文: `one_click` →「1 クリック」。`taps` →「あと {taps} タップ（{need}）」。`setup` →「準備が必要（{need}）」。`unverified` →「まだ誰も動かしていない」。動く所は `placeLabel`。料金は `price.model === 'free'` なら「無料」、それ以外は「¥{amountMinor}」。色だけで分けない（文字を必ず出す）。カードの高さは固定し、読み込みで位置が動かないようにする。

## 7. 試験

| 試験 | 中身 |
| --- | --- |
| 接続要件（移す） | 通る形 6、拒否する形 37、秘密値の見分け、hash |
| 接続計画（移す） | 表の 27 行、つなげない物 4、端末の選び方、計画の hash |
| 状態遷移（移す） | 10 状態 × 17 の出来事の全部 |
| 今ある Agent（足す）`tests/noah-connect-source.test.mjs` | `RECIPES` の 13 件の全部から接続要件が作れ、`parseNoahConnect` を通る。`provider` を持つ 2 件（Anicca・Codex）は `own_account`、残りは `local`。応答中の家の端末がある本人には `one_click`、無い本人には `setup`（「端末を足す」） |
| 計画の API（足す）`tests/noah-connect-plan-api.test.mjs` | 未サインインで 200（`account` が 1 タップ）。無い Agent で 404。書き込みが起きない（表の行数が変わらない）。別の本人の端末が混ざらない |
| 一覧（足す） | `GET /api/noah/launch?public=1` の全部の項目に `connect` があり、`badge` が計画の API と同じ |

## 8. 完了の定義

- `node --experimental-strip-types --test tests/noah-connect-*.test.mjs` が通る。
- 手元で、Mac の runner を動かした本人には 13 件が「1 クリック」、止めた本人には「準備が必要（端末を動かす）」と出る。
- 幅 390 で、カードが横にはみ出さない。主ボタンが 1 枚に 1 つ。
- `npm run typecheck`、`npm run lint:product`。
