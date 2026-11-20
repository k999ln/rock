# 仕様書 85 — 取り込みと名寄せ（外の台帳 → 候補 → 系列 → 接続要件の下書き）

task: [codex/tasks/85-noah-intake-ledger.md](../../codex/tasks/85-noah-intake-ledger.md)。先に要る物: 84（面の値）。ローンチ分（11 章。L3）で先に要るのは、96 の純関数（L2）だけ（ローンチで入る候補は、面が「無し」の物だけなので、84 を待たない）。
型契約: [noah-intake-v1.ts](../contracts/noah-intake-v1.ts)、[noah-v1.sql](../contracts/noah-v1.sql)（`noah_intake_*`、`noah_probe_hosts`）、[noah-regroup-v1.sql](../contracts/noah-regroup-v1.sql)、[noah-listing-v1.sql](../contracts/noah-listing-v1.sql)、[noah-flags-v1.ts](../contracts/noah-flags-v1.ts)。試験: [noah-intake.test.mjs](../design-validation/noah/noah-intake.test.mjs)（10 群）、[noah-flags.test.mjs](../design-validation/noah/noah-flags.test.mjs)（4 群）、[validate-noah-v1.py](../design-validation/noah/validate-noah-v1.py)（取り込みと一覧の 4 群）。

**ローンチまでに作る範囲は 11 章。** 公式台帳だけを、最初は全件、その後は毎時「更新された物だけ」読む。Space と ACP は出した後。

## 1. 完成の姿

- 外の 3 つの台帳（MCP の公式台帳、Hugging Face の MCP の Space、ACP の台帳）の全件が、Noah の表に「候補」として入る。1 件ずつに、口・面・要る鍵・つなげない理由が付く。**この task は何も実行しない。握手もしない**（握手は 86）。
- 同じ物のコピーと量産が「系列」にまとまり、カード 1 枚になる。
- 運営の画面に、口ごと・理由ごとの件数が出る。利用者の画面はまだ変わらない（flag `NOAH_INTAKE_PUBLIC` は閉じたまま）。

## 2. この仕様で決めた事

| 決めた事 | 理由 |
| --- | --- |
| 今の発見の表（`noah_discovery_*`）へ足さず、**取り込み用の表を別に作る** | 今の表は `CHECK(provider IN ('github','huggingface'))` を持ち、SQLite は CHECK だけを変えられない（表の作り直しが要る）。鍵がリポジトリ（`owner/name`）で、台帳の記録の約 36% はリポジトリを持たない。上限が 10,000 件で、台帳は 66,608 件ある。既存の表の意味を変えない決まりにも合う |
| 候補の ID は `出どころ:鍵`（例 `mcp-registry:ac.mizan/registry`） | 人が読める。出どころの中で一意。接続要件の `candidateId` と同じ値 |
| 巡回は「空の POST 1 回で、期限の来た分を上限つきで進める」作り | 今の発見（`POST /api/noah/discovery` に `{}`）と同じ。呼ぶ側は出どころも時刻も指定できない。誰が何回呼んでも、進むのは lease を取れた 1 つだけ |
| 名寄せは SQL で行い、規則の正本は純関数に置く | 6 万件を毎回メモリへ読まない。SQL が純関数と同じ系列を作ることを、検証キットが確かめている |
| 取り下げは「全件の巡回で見えなかった物」。ただし、持っている有効な候補の 9 割以上が見えた巡回でだけ行う | 相手の障害で、全部を取り下げにしないため。比べる相手を「前の巡回で見えた件数」にすると、半分だけ・空の一覧が 2 回続いた時に、2 回目で残りを全部取り下げる（11.8 の 5） |
| 握手の記録を消して確かめ直すのは、**接続先に関わる項目が変わった時だけ**。版や説明だけの更新では消さない | 台帳の記録は 1 時間に約 100 件更新され、その大半は接続先を変えない。記録が変わるたびに消すと、確かめた物と「動いた」が毎時消える（11.8 の 1） |
| 形の違う記録は、1 件だけ読み飛ばす。1 頁で 10 件を越えたら、その頁を失敗にする | 1 件のために、その頁から先を読めなくしない。台帳の形そのものが変わった時は、黙って先へ進まない（11.8 の 2） |

## 3. 今あるコードと、変える所

| ファイル | 今 | 変える事 |
| --- | --- | --- |
| `drizzle/0044_noah_intake.sql`、`db/schema.ts`、`drizzle/meta/_journal.json` | 無い | [noah-v1.sql](../contracts/noah-v1.sql) の `noah_intake_sources`・`noah_intake_candidates`・`noah_intake_checks`・`noah_intake_families`・`noah_probe_hosts` と索引を移す |
| `lib/noah-intake-draft.ts` | 無い | 型契約から `draftFromRegistry`・`draftFromSpace`・`draftFromAcp`・`noahCandidateId`・`NOAH_INTAKE_REASONS` を移す |
| `lib/noah-intake-family.ts` | 無い | 型契約から `groupNoahFamilies`・`noahRepositoryKey`・`NOAH_BULK_THRESHOLD` を移す。[noah-regroup-v1.sql](../contracts/noah-regroup-v1.sql) の文を、文字列の配列として同じファイルに置く |
| `lib/noah-intake-store.ts` | 無い | 新規。`createIntakeStore({ db, now, fetcher })` → `{ sync, regroup, list, detail, status }`。作りは `lib/noah-discovery-store.ts` に合わせる |
| `lib/noah-intake-api.ts`、`app/api/noah/intake/route.ts` | 無い | 新規（系列の ID は `/` と `:` を含むので、パスに入れず、`?id=` で渡す）。`lib/noah-discovery-api.ts` と同じ検査（Origin、ownerScope、本文は `{}` だけ） |
| `scripts/noah-discovery-daemon.mjs` | `POST /api/noah/discovery` を 60 秒ごとに呼ぶ | `POST /api/noah/intake` も同じ間隔で呼ぶ（1 行足す）。loopback だけの条件は変えない |
| `components/noah-review.tsx` | 審査の画面 | 「取り込み」の節を足す（6 章） |
| `lib/noah-discovery-*.ts`、`noah_discovery_*` | 発見（GitHub の topic と Space の検索、2 時間ごとに 10 件） | **変えない** |

## 4. データ（1 件が、どの列になるか）

### 4.1 MCP の公式台帳

取り方: `GET https://registry.modelcontextprotocol.io/v0/servers?version=latest&limit=100[&cursor=…]`。応答は `{ "servers": [{ "server": {…}, "_meta": { "io.modelcontextprotocol.registry/official": { "status", "updatedAt", … } } }], "metadata": { "nextCursor" } }`。2026-11-20 は 678 頁・67,703 件（有効 66,608、非推奨 1,095）。

| 列 | 値 |
| --- | --- |
| `id`・`external_key` | `mcp-registry:<server.name>`・`<server.name>` |
| `group_key` | `server.name` の `/` より前（名前空間） |
| `name`・`summary` | `server.title ?? server.name`（200 文字まで）・`server.description`（制御文字を除き、500 文字まで） |
| `repository` | `noahRepositoryKey(server.repository.url)`（GitHub・GitLab・Hugging Face だけ。他は NULL） |
| `host` | 下書きの口が `mcp-remote` の時、`connect.egress[0]`。それ以外は NULL |
| `record_json`・`record_sha256` | `server` のうち、型契約の `RegistryServer` が持つ項目と `title`・`description`・`websiteUrl`。hash は `sha256Hex(canonicalJson(server))`（＝ 接続要件の `candidateDigest`） |
| `state`・`reason` | `_meta` の `status` が `active` 以外 → `withdrawn`。`draftFromRegistry` が通る → `active`。通らない → `unsupported` と理由 |
| `source_updated_at` | `_meta` の `updatedAt` |

下書きが通った時だけ、`noah_intake_checks` の行を作る。

| 列 | 値 |
| --- | --- |
| `mouth`・`surface` | 下書きの値（`mcp-remote` は `none`、`mcp-package` は `terminal`） |
| `connect_json`・`connect_sha256` | 下書きと `noahConnectSha256` |
| `setup` | `connect.secrets` が 1 つ以上なら 1 |
| `auth` | `setup=1` なら `key`。`mcp-package` で `setup=0` なら `none`。`mcp-remote` で `setup=0` なら `unknown`（握手するまで分からない。鍵の宣言が無い接続先の 34.8% が 401 を返す） |
| `level`・`result`・`next_check_at` | 0・`unchecked`・今（86 の握手が順に拾う）。`auth=key` の物は握手できないので、`next_check_at` を 30 日後にする |

### 4.2 Hugging Face の MCP の Space

取り方: `GET https://huggingface.co/api/spaces?filter=mcp-server&limit=1000&expand[]=runtime&expand[]=sdk&expand[]=likes&expand[]=lastModified`。次の頁は応答の `Link: <…>; rel="next"`。2026-11-20 は 13 頁・12,856 件。未ログインの上限は 5 分に 500 回。

| 列 | 値 |
| --- | --- |
| `id`・`external_key`・`group_key` | `hf-mcp-space:<id>`・`<id>`・`id` の `/` より後ろを小文字にした物 |
| `host`・`running`・`likes` | `runtime.domains[0].domain`・`runtime.stage === 'RUNNING'`・`likes` |
| `state` | `sdk` が `gradio` なら `active`。それ以外は `unsupported`（理由 `no_endpoint`） |

checks の行は、**動いている時にだけ**作る（`draftFromSpace`）。寝ている物・止まっている物・エラーの物（合わせて 66%）は、候補の行だけを持ち、握手の対象にしない。起こさない。

### 4.3 ACP の台帳

取り方: `GET https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json` を 1 日 1 回。46 件。`draftFromAcp(agent, 'linux-aarch64')`（今の家の端末は Apple silicon の Mac の中の Linux）。x86_64 の端末を足す時（95）に、候補ごとに platform 別の下書きを持つ形へ広げる。

## 5. 処理の順

### 5.1 `sync()`（`POST /api/noah/intake` に `{}`。1 回の呼び出しで行う事）

1. `noah_intake_sources` に 3 行が無ければ作る。
2. 出どころを 1 つ選ぶ: `next_run_at <= now AND lease_until < now` のうち `next_run_at` が最も古い物。`UPDATE … SET lease_id=?, lease_until=now+60000 WHERE id=? AND lease_until < now RETURNING *` で取る。取れなければ `{ outcomes: [] }` を返す。
3. 頁を読む。1 回の呼び出しで、台帳は 10 頁まで、Space は 2 頁まで、合わせて 20 秒まで。頁ごとに:
   - 各記録を 4 章の列に直す。`INSERT … ON CONFLICT(id) DO UPDATE` で書く。`record_sha256` が同じなら `seen_at` だけを更新する。違えば `revision+1`・`changed_at=now` にし、下書きを作り直す。
   - 接続要件のうち**接続先に関わる項目**（口・面・置き場所・接続先・通信先・サービス・鍵・モデル。`diffNoahConnect(前, 今).reconsent`）が変わった候補と、有効に戻った候補は、checks を `level=0`・`result='unchecked'`・`tools_sha256=NULL`・`next_check_at=now` に戻す（確かめ直すまで、印を出さない）。前の接続要件を読めない時も戻す。
   - それ以外の更新（版・説明・題名など）は、checks の `connect_json`・`connect_sha256` だけを書き換える。握手で確かめた値（`level`・`result`・`tools_sha256`・`l1_at`・`l2_at`）と、系列の行は書かない。**`connect_sha256` の違いで戻さない**: 接続要件は記録の hash（`candidateDigest`）を含むので、`connect_sha256` は、記録が変わるたびに必ず変わる。端末で動かす配布物（`mcp-package`）の版が変わった時に確かめ直すかどうかは、その口を作る時に決める（ローンチでは握手しない）。
   - 形の違う記録（記録でない物、`server` の項目の型が違う物、名前が 287 文字を越える物、台帳での状態 `status` を読めない物）は、その 1 件を読み飛ばして数える。保存も更新もしない。状態を読めない記録を「有効ではない」と読まない（台帳の形が変わった時に、読めた記録を全部取り下げにしないため）。**1 頁で 10 件を越えて読めない時は、その頁を `invalid_response` にする**（その頁の記録は 1 件も保存しない。台帳の形が変わった物として止める）。
   - 1 頁の書き込みは `db.batch` で 100 文ずつ。頁の最後に `cursor` を保存する（途中で止まっても、次の呼び出しが続きから読む）。
4. 最後の頁まで読んだら（`nextCursor` が無い）:
   - 取り下げ（全件の巡回だけ）: `source=? AND state='active' AND seen_at < sweep_started_at`（この巡回で見えなかった物）を `withdrawn` にする。ただし、**持っている有効な候補**（`state='active' AND first_seen_at < sweep_started_at`）のうち 9 割以上が、この巡回で見えた（`seen_at >= sweep_started_at`）時だけ。届かない巡回では取り下げない（`error_code` は付けない。`last_full_at` は進める）。次の全件の巡回で、同じ式でもう一度確かめる。1 割を越える候補が台帳から一度に消えた時は、自動では取り下げない（応答しなくなった物は、[88](spec-88-mass-probe.md) の 9.3 で一覧から外れる）。
   - `regroup()` を流す（[noah-regroup-v1.sql](../contracts/noah-regroup-v1.sql) の 9 文を上から順に。`:threshold` は 20）。候補が 1 件も無くなった系列を隠し、候補が戻った系列を戻す（握手の失敗が続いて隠した系列は、戻さない。88 の 9.3）。
   - `cursor=NULL`、`sweep_started_at=NULL`、`last_success_at=now`、`next_run_at` ＝ 台帳と Space は 1 時間後、ACP は 24 時間後。
5. 失敗した時: `error_code` に `rate_limited`・`unavailable`・`invalid_response` を入れ、`failure_count+1`、`next_run_at = now + min(2^failure_count 分, 6 時間)`。429 は `Retry-After` を使う。lease は放す。`failure_count` は、**続けて**失敗した回数（1 頁を書けて `cursor` を保存したら 0 に戻す）。6 回続けて失敗したら、進行中の巡回を捨てる（`sweep_started_at`・`updated_since`・`cursor` を NULL にする。`checkpoint_at` は動かさない）。待ち時間の後、同じ印から始め直す（保存した `cursor` の続きが、もう読めない時のため）。`rate_limited` では始め直さない（読み直す分だけ、相手への通信が増える）。
6. 応答 `{ "outcomes": [{ "source", "pages", "seen", "changed", "more" }], "sources": <status()> }`。

名乗り: `User-Agent: NoahBot/1 (+https://<Noah の origin>/noah/help#bot)`。転送は追わない（`redirect: 'manual'`）。1 応答は 4MB まで。

### 5.2 `list()`・`detail()`・`status()`

- `GET /api/noah/intake?mouth=&level=&state=&q=&cursor=` → 系列の一覧（20 件ずつ）。`noah_intake_families` と代表の候補・checks を結ぶ。`q` は `name`・`summary` の前方一致と部分一致（`LIKE`。全文検索は後）。flag `NOAH_INTAKE_PUBLIC` が閉じている間は、審査者（`deps.reviewers`）だけ。他は 404。
- `GET /api/noah/intake?state=1` → 出どころごとの最後の成功・次の時刻・エラーと、集計（下の画面の表）。
- `GET /api/noah/intake?id=<系列の ID>` → 系列 1 つと、中の候補（50 件まで）。

集計の問い合わせ: `SELECT k.mouth, k.level, k.setup, COUNT(*) FROM noah_intake_candidates c JOIN noah_intake_checks k ON k.candidate_id=c.id WHERE c.state='active' GROUP BY 1,2,3` と、`SELECT reason, COUNT(*) FROM noah_intake_candidates WHERE state='unsupported' GROUP BY 1`。結果を 5 分間、同じ値で返してよい。

## 6. 画面（運営だけ。`components/noah-review.tsx` に 1 節）

節の上から順に出す物:

1. 見出し「取り込み」と、最後に確かめた時刻・次の時刻（出どころごと）。
2. 件数の表（下は 2026-11-20 の実測を入れた例。握手の前なので、系列の深さは全部「まだ確かめていない」）。

| | 候補 | 入力なし | 準備が要る |
| --- | --- | --- | --- |
| 相手のサーバー | 44,640 | 40,503 | 4,137 |
| 端末で動かす | 18,158 | 14,132 | 4,026 |
| Space（動作中） | 4,331 | 4,331 | 0 |

3. つなげない物の内訳の 1 行: 「つなげない 3,810: 型紙の無い配布 1,654 ／ 接続先が無い 962 ／ 旧い接続先だけ 704 ／ …」
4. 絞り込み 3 つ（口・深さ・語）と、系列の一覧（1 行に、名前・口・深さ）。量産の系列は「io.github.pipeworx-io の道具 1,936 個」のように出す。

理由の表示名: `unsupported_registry` 型紙の無い配布／`no_endpoint` 接続先が無い／`legacy_sse_only` 旧い接続先だけ／`bad_url` 接続先の URL が通らない／`needs_host_file` 本人の端末のファイルが要る／`needs_runtime_arguments` 起動の引数が型紙の外／`bad_argument` 引数の形／`published_secret` 鍵が公開されている／`bad_identifier` 版が 1 つに決まらない／`bad_env` 環境変数の名前の形／`bad_header` header の名前の形。

## 7. 試験

| 試験 | 入力 | 期待 |
| --- | --- | --- |
| 下書き（移す） | 公式台帳の実記録 25 件＋合成 7 件 | 口・置き場所・target・egress・鍵・理由が fixture のとおり |
| 説明文を命令にしない（移す） | 同じ配布で、説明と題名だけを変えた記録 | target が変わらない |
| 名寄せ（移す） | 規則ごとの合成の集まり | 純関数と SQL の両方が、同じ系列と代表 |
| 巡回（足す）`tests/noah-intake-store.test.mjs` | 3 頁を返す試験用の fetcher | 1 回目で 3 頁を読み、候補と checks が入る。`cursor` が NULL に戻る |
| 途中で止まる | 2 頁目で例外 | `cursor` が 2 頁目を指し、次の呼び出しが続きから読む。1 頁目の行は残る |
| 変わらない記録 | 同じ頁をもう 1 回 | `revision` が増えない。`seen_at` だけが進む |
| 変わった記録 | 版と接続先が変わる | `revision+1`。checks が `level=0`・`unchecked` に戻る |
| 版や説明だけが変わった記録 `tests/noah-intake-resilience.test.mjs` | 握手済みの候補の、版・説明だけが変わる | `revision+1`。checks の握手の値はそのまま。`connect_sha256` だけが変わる。系列の行を書かない。一覧に残る |
| 読めない記録 | 1 頁に、形の違う記録が 9 件 | 読めた記録だけが入り、巡回が終わる。結果に `skipped: 9` |
| 読めない記録が多い頁 | 1 頁に 11 件 | `invalid_response`。その頁の記録は 1 件も入らない。10 件なら読み飛ばして進む |
| 続けて失敗 | 同じ頁が 6 回続けて読めない | 6 回目で進行中の巡回を捨て、待ち時間の後、最初の頁から読み直す。429 では捨てない |
| 取り下げ | 2 巡目で 1 件が消える | その 1 件が `withdrawn`。系列の `members` が減る |
| 安全弁 | 全件の巡回が、5 割・5 割・空・空と続く | どの巡回でも取り下げない。`error_code` は付かない。その後、1 割以下が消えた巡回では、その分だけ取り下げる |
| 隠した系列を戻す | 取り下げの後で台帳に戻る／量産の系列がほどける | 次の名寄せで `hidden_at` が NULL に戻る。握手の失敗が続く代表の系列は、戻らない。変わらない名寄せは、系列の表を 1 行も書かない |
| 取り合い | `sync()` を同時に 2 回 | 頁を読むのは 1 つ。もう 1 つは `outcomes: []` |
| 上限 | 台帳が 30 頁ある | 1 回の呼び出しは 10 頁で止まり、`more: true` |
| 見せない | flag が閉、審査者でない本人 | 404 |
| 集計 | fixture 全部 | 口ごと・理由ごとの件数が、fixture の期待から数えた値と同じ |

## 8. 実測（2026-11-20。参照実装に全件を通した結果）

| 結果 | 件数 | 割合 |
| --- | --- | --- |
| `mcp-remote`、入力なし | 40,503 | 60.8% |
| `mcp-remote`、準備が必要 | 4,137 | 6.2% |
| `mcp-package`、入力なし | 14,132 | 21.2% |
| `mcp-package`、準備が必要 | 4,026 | 6.0% |
| 下書きを作れない | 3,810 | 5.7% |

例外 0 件。系列は 50,767（量産としてまとめた 83 系列が 12,114 件を含む）。同じリポジトリを持つ台帳の記録は、1 件だけが 32,081、2 件が 556 組、3〜19 件が 289 組、20 件以上が 45 組（7,286 件）。2〜19 件の組は、別の道具であることが多い（例: 同じ作者の `kleinanzeigen` と `willmehr`）ので、握手の前はまとめない。握手の後、道具の定義の hash も同じ物だけをまとめる。

## 9. 決めていない事

- 日本語の 1 行説明（`summary_ja`）を作るモデルと費用。列は作る。作るのは `NOAH_MODEL_RELAY` を決めた後。
- `q` の検索（今は `LIKE`）。件数が 10 万を越えたら、検索用の表を足す。
- ~~公式台帳の「更新された物だけ」の取り方（`updated_since`）。~~ 2026-11-20 に確かめて、11.2 で決めた（毎時は更新された物だけ。全件は 7 日に 1 回）。
- 発見の候補（`noah_discovery_candidates`）と同じリポジトリの系列を、詳細の画面で並べて見せるか。

## 10. 完了の定義

- `node --experimental-strip-types --test tests/noah-intake-draft.test.mjs tests/noah-intake-family.test.mjs tests/noah-intake-store.test.mjs` が通る。
- `python3 docs/design-validation/noah/validate-noah-v1.py` が通る（DDL を migration へ移した後も、同じ文であること）。
- 手元の D1 で `POST /api/noah/intake` を 70 回呼ぶと、台帳の候補が 6 万件以上入り、運営の画面の件数が 8 章の表と 1% 以内で合う（台帳は増え続けるので、同じにはならない）。
- `npm run typecheck`、`npm run lint:product`、`npm run schema:check`、`npm run database:check`。
- 本番 D1 への migration は適用しない。PR 本文に、適用が要る事を書く。

## 11. ローンチの範囲（[ローンチの最小限](mvp-launch.md) の L3）

ローンチまでに作るのは、この章に書いた範囲だけ。1〜10 章のうち、下の表で「後」とした所は作らない。

### 11.1 入れる物・後にする物

| 章 | ローンチまで | 後 |
| --- | --- | --- |
| 3 変える所 | migration・`noah-intake-draft`・`-family`・`-store`・`-api`・運営の画面の節。足す物は 11.3 の表 | `scripts/noah-discovery-daemon.mjs` の変更は手元用として入れる |
| 4.1 公式台帳 | 入れる。読み方は 11.2 に変える（毎時 10 頁ずつ全件を回す案をやめる） | — |
| 4.2 Space・4.3 ACP | 入れない。`noah_intake_sources` の行も作らない | 出した後 |
| 5.1 `sync()` | 11.2 と 11.4 のとおり | — |
| 5.2 一覧・詳細・状態 | 入れる。形は 11.5 | 全文検索 |
| 6 運営の画面 | 入れる。件数の表は「相手のサーバー」「端末で動かす」の 2 行と、載せていない理由の内訳 | Space の行 |
| 9 決めていない事 | 「更新された物だけ」の取り方は 11.2 で決めた | 日本語の 1 行説明 |

### 11.2 台帳の読み方（最初は全件、その後は更新された物だけ）

出どころの決まり（[MCP Registry Aggregators](https://modelcontextprotocol.io/registry/registry-aggregators)）のとおりにする。2026-11-20 に実際に読んで確かめた: `/v0.1/servers` が `limit`・`cursor`・`version=latest`・`updated_since` を受ける。直前の 1 時間に更新された記録は 109 件（2 頁）で、`status: "deleted"` の記録が 1 件入っていた。

| 決まり | 参照実装（[noah-intake-v1.ts](../contracts/noah-intake-v1.ts)） |
| --- | --- |
| 1 頁の URL は `https://registry.modelcontextprotocol.io/v0.1/servers?limit=100&version=latest[&updated_since=<RFC 3339>][&cursor=…]` | `noahRegistryPageUrl` |
| 全件を読むのは、最初の 1 回と、前の全件から 7 日たった時。それ以外は、前回の印から 10 分さかのぼった時刻より後の物だけ | `noahRegistrySyncPlan`、`NOAH_REGISTRY` |
| `updated_since` は、1 巡の間ずっと同じ値を使う。印は、全部の頁を書き終えた後にだけ進める | 同上（`nextCheckpoint` は巡回を始めた時刻） |
| `status` が `active` 以外（`deprecated`・`deleted`）は取り下げ | `noahRegistryState` |

`noah_intake_sources` の `mcp-registry` の行の使い方:

| 列 | 意味 |
| --- | --- |
| `next_run_at` | 次に巡回を始めてよい時刻。巡回を始めた時刻 ＋ 1 時間 |
| `sweep_started_at`・`updated_since`・`cursor` | 進行中の巡回。始めた時刻、その巡回の `updated_since`（全件は NULL）、次に読む頁 |
| `checkpoint_at` | 最後に書き終えた巡回を、始めた時刻（＝次の `updated_since` の元） |
| `last_full_at` | 最後に書き終えた全件の巡回を、始めた時刻 |

1 回の合図（11.3）で行う事:

1. lease を取る（5.1 の 2 と同じ）。
2. 進行中の巡回が無い時: `next_run_at > now` なら何もしない。そうでなければ `noahRegistrySyncPlan({ now, checkpoint: checkpoint_at, lastFullAt: last_full_at })` を取り、`sweep_started_at = now`、`updated_since`、`cursor = NULL`、`observed = 0` を書く。
3. 頁を読む。`NOAH_PATROL_BUDGET.pages`（既定 10）頁まで、かつ、合図の残り時間まで。記録ごとに:
   - 4.1 の列に直して `INSERT … ON CONFLICT(id) DO UPDATE`。`record_sha256` が同じなら `seen_at` だけ。
   - 新しく入った有効な候補には、**その場で「1 件で 1 系列」の行を作る**（候補の `family_id` は、入れる時に、候補の ID と同じ値にする。系列の ID も同じ値。次の名寄せが、まとめる物だけを付け替える）: `INSERT OR IGNORE INTO noah_intake_families(id, representative_id, members, level, badge_hint, listed, one_tap, shuffle, updated_at, revision) VALUES(?, ?, 1, 0, ?, 0, 0, abs(random()) % 1000000000, ?, 1)`（`badge_hint` は、鍵の入力が要れば `setup`、それ以外は `unverified`）。握手が通ると、86 が同じ行へ写す。
   - 取り下げになった候補が代表の系列は、その場で外す: [noah-listing-v1.sql](../contracts/noah-listing-v1.sql) の `touch` を `level=0`・`listed=0`・`one_tap=0`・`badge_hint='unverified'` で流す。その候補へつないでいる人の新しい依頼は、87 が止める（87 の 11.4 の 4）。
   - 1 頁ごとに `cursor` を保存する。
4. 最後の頁まで読んだら:
   - `checkpoint_at = sweep_started_at`。全件の巡回なら `last_full_at = sweep_started_at` と、5.1 の 4 の取り下げ（持っている有効な候補の 9 割以上が見えた時だけ）。
   - 名寄せ（[noah-regroup-v1.sql](../contracts/noah-regroup-v1.sql)）を流すのは、全件の巡回の後と、UTC の日付が変わって最初に終わった巡回の後だけ（毎時は流さない。まとめた候補を書き直すため）。
   - 同じ時に、並びを引き直す（`noah-listing-v1.sql` の `reshuffle`）。
   - `sweep_started_at = NULL`、`updated_since = NULL`、`cursor = NULL`、`last_success_at = now`、`next_run_at = 巡回を始めた時刻 + 3,600,000`。
5. 失敗は 5.1 の 5 と同じ。進行中の巡回の列は消さない（次の合図が、同じ `updated_since` と `cursor` から続ける）。6 回続けて失敗した時だけ、消して始め直す。

最初の全件は 678 頁。1 回の合図で 10 頁なら約 70 分。その後は、毎時 1〜2 頁。

### 11.3 巡回の入口と、足すファイル

今の発見の巡回（`scripts/noah-discovery-daemon.mjs`）は、手元（loopback）からだけ動く。本番は、既存の「合図の Worker」と同じ作りにする（`services/sky-free-cloud-wake` と `lib/sky-free-cloud-background.ts` の `verifyWake`）。

| ファイル | 中身 |
| --- | --- |
| `lib/noah-flags.ts` | [noah-flags-v1.ts](../contracts/noah-flags-v1.ts) を移す（`parseNoahFlags`・`noahAllowed`） |
| `lib/noah-intake-server.ts` | 新規。`cloudflare:workers` の `env` と `waitUntil` を読み、`{ db, authenticate, reviewers, flags: parseNoahFlags(env), wakeKey: env.NOAH_PATROL_WAKE_KEY, fetcher: fetch, now: Date.now }` を返す。`env` を読むのはここだけ |
| `lib/noah-intake-wake.ts` | 型契約から `NOAH_WAKE`・`noahWakeSignature`・`verifyNoahWake` を移す |
| `app/api/noah/intake/tick/route.ts` | 新規。`POST` だけ。`verifyNoahWake({ key, timestamp: header 'x-noah-time', signature: header 'x-noah-signature', body, now })` が偽なら 401。`flags.patrol` が偽なら 200 `{ "disabled": true }`。真なら `sync()` を呼び、件数だけを返す。巡回が失敗した時（結果に `error` がある時、表を読み書きできない時）は 2xx にしない（500・503。専用の Worker の実行が、失敗として残る）。合図 1 回ごとに、件数の 1 行を出す（[97](spec-97-launch-ops.md) の 4 章）。`Origin` の header が付いた要求は 403（画面から呼ぶ入口ではない） |
| `services/noah-patrol-wake/worker.ts`・`wrangler.jsonc`・`README.md` | 新規。`services/sky-free-cloud-wake` を写す。毎分（`"crons": ["* * * * *"]`）、空の本文 `{}` と署名を `https://<NOAH_ORIGIN>/api/noah/intake/tick` へ送る。HTTP の入口・利用者の情報・モデルの鍵を持たない。**配備は本人の許可の後**（[97](spec-97-launch-ops.md) の 4 章） |

合図は「起きて」だけを伝える。何を読むか、どこへつなぐかは、Web の本体だけが決める（合図の本文が `{}` でなければ拒否する。検証キットが確かめている）。

### 11.4 D1 の書き方（上限に合わせる）

D1 の上限（[読んだ日 2026-11-20](https://developers.cloudflare.com/d1/platform/limits/)）: 1 文に結べる値は 100 個、1 文は 100KB、1 回の実行で query は有料 1,000（無料 50）。`db.batch` は 1 query と数える。書き込みは、索引の分も行として数える。

| 決まり | 理由 |
| --- | --- |
| 候補の 1 件は 1 文（列は 21 個）。1 頁 100 件を、50 文ずつの `db.batch` 2 回で書く。checks と系列の行も同じ batch に入れる | 1 頁の query を 2〜4 回に収める |
| `record_sha256` が同じ記録は `seen_at` だけを書く | 更新された物だけの巡回では、ほぼ全部が変わった記録。全件の巡回では、ほぼ全部が変わらない |
| 名寄せは 1 日 1 回。変わらない行は書かない | まとめた候補（約 12,000）だけを書き直す |
| `record_json` は 65,536 bytes まで。越える記録は、`remotes` と `packages` を外して `"oversize": true` を足した形で保存する。下書きと `record_sha256` は、外す前の記録から作る | 実測: 保存する形の大きさは中央値 409 bytes、99% が 2,078 bytes 以下。65,536 を越えるのは 67,703 件のうち 1 件（72,523 bytes） |

書き込みの見込みは [97](spec-97-launch-ops.md) の 3 章。

### 11.5 一覧の API（ローンチ版）

見せてよいかは `noahAllowed(flags, 'list', 審査者か)`。偽なら 404。

**`GET /api/noah/intake?cursor=&q=&oneTap=1`**（サインイン不要）

```json
{ "items": [ { "id": "mcp-registry:ac.mizan/registry", "name": "Mizan", "provider": "ac.mizan", "summary": "…（提供者の文のまま）",
               "host": "mizan.ac", "section": "ran", "tools": 5, "oneTap": true, "checkedAt": 1795170000000,
               "connect": { "badge": "one_click", "taps": 0, "typed": 0, "place": "provider", "placeLabel": "相手のサーバー（mizan.ac）",
                            "need": null, "level": 2, "price": { "model": "free" }, "note": null } } ],
  "nextCursor": "n:734122001:mcp-registry:io.example/x", "counts": { "ran": 132, "new": 17990 },
  "source": "Official MCP Registry", "ownerScope": null }
```

- 20 件ずつ。先に「動いた」（`noah-listing-v1.sql` の `ran`）を最後まで、続けて「まだ誰も動かしていない」（`new`）。`cursor` は `r:<l2_at>:<id>` か `n:<shuffle>:<id>`。形の違う `cursor` は 400。
- `q`（80 文字まで）がある時は `search` だけを使う（段に分けない。`cursor` は `s:<offset>`、200 件まで）。`oneTap=1` は `new` の絞り込み。
- 各項目は、系列の代表の候補と checks から作る。`provider` は台帳の名前の `/` より前。`tools` は `tool_count`。`checkedAt` は `checked_at`。`connect` は 96 の `planNoahConnection`（未サインインなら `signedIn=false`）。
- `counts` は 5 分間、同じ値を返してよい。
- 応答は `Cache-Control: no-store, private`（サインインの有無で `connect` が変わるため）。サインインしていない人への応答は、同じ `cursor`・`q`・`oneTap` について、サーバーの側で 60 秒持ってよい（一覧は鍵も本人の情報も含まない。検索 1 回は、載せている系列の約 18,000 行と、その代表の候補を読むので、同じ問い合わせで D1 を読み直さない）。`q` は 2 文字以上。

**`GET /api/noah/intake?id=<系列の ID>`** → 系列 1 つ `{ …上の項目, "members": 1, "website": <台帳の websiteUrl か null>, "repository": <鍵か null>, "sourceUpdatedAt", "connection": { "id", "state" } | null }`。`connection` は、サインイン済みで、切っていない接続がある時だけ。載せていない系列（`noahListing` が偽）は、審査者でなければ 404。

**`GET /api/noah/intake?state=1`**（審査者だけ）→ 出どころの状態、`noah-listing-v1.sql` の `counts` を `noahListing` に通した内訳（載せている数、理由ごとの数）、`flags.warnings`。

**`POST /api/noah/intake`**（審査者だけ。共通の書き込みの検査）本文 `{ "action": "withdraw" | "restore", "id": <系列の ID>, "revision": <数> }` → `withdrawn_at` を入れる／消す。`revision` が違えば 409。

**`POST /api/noah/intake`** に本文 `{}`（手元の巡回用。今の発見と同じ検査）→ `sync()`。本番では使わない（本番は 11.3 の合図）。

**系列の ID を、URL のパスに入れない。** ID は `mcp-registry:ac.mizan/registry` や `same:<16 桁>:github.com/owner/name` の形で、`/` と `:` を含む。パスの中の `%2F` は、配備先や途中の中継で `/` に直される事があるので、いつも query（`?id=`・`?agent=`）か本文で渡す（公式台帳の API も、パスに入れる時は必ず符号化する決まり）。`limit=0` を付けた一覧は、`items` を空にして `counts` だけを返す（navigation が、見せてよいかを確かめるのに使う）。

### 11.6 試験（7 章に足す）

| 試験 | 入力 | 期待 |
| --- | --- | --- |
| 読み方（移す） | — | `noahRegistryPageUrl`・`noahRegistrySyncPlan`・`noahRegistryState` |
| 最初の全件 | 3 頁を返す試験用の fetcher。印なし | URL に `updated_since` が無い。終わると `checkpoint_at` と `last_full_at` が巡回を始めた時刻 |
| 更新された物だけ | 印あり。1 頁 | URL の `updated_since` が、印の 10 分前。2 頁目も同じ値 |
| 途中で止まる | 2 頁目で例外 | `checkpoint_at` が進まない。次の合図が、同じ `updated_since` と保存した `cursor` で続ける |
| 外された記録 | `status: "deleted"` の記録 | 候補が `withdrawn`。系列が一覧から消える（名寄せを待たない） |
| 新しい記録 | 初めて見る名前 | 候補・checks・系列の 3 行が入る。`listed` は 0 |
| 7 日後 | `last_full_at` が 7 日前 | 全件を読む |
| 名寄せの回数 | 同じ UTC の日に 3 回の巡回 | 名寄せと並びの引き直しは 1 回 |
| 合図（移す） | 署名・時刻・本文・道 | 型契約の試験と同じ |
| 合図の入口 | 鍵なし／古い時刻／本文あり／`Origin` あり／`flags.patrol` が偽 | 401／401／401／403／200 `disabled` |
| 合図の応答 | 台帳が 503／待ち時間の間／読めた／表を読み書きできない | 500／200（何もしない）／200／503。どれも、件数の 1 行を出す。1 行に、接続先の名前・URL が無い |
| 切り替え（移す） | — | [noah-flags.test.mjs](../design-validation/noah/noah-flags.test.mjs) |
| 一覧 | 握手済みの系列 25、動いた 3 | 1 頁目は「動いた」3 と「まだ」17。2 頁目は残り 8。重なりなし |
| 見せない | `NOAH_INTAKE_PUBLIC` が閉、審査者でない | 404。審査者は 200 |
| 検索 | `q=100%` | `%` を文字として探す |
| 取り下げ | `withdraw` → 一覧・検索・詳細 | 消える。`restore` で戻る |

### 11.7 完了の定義（L3）

- 10 章の試験に、11.6 を足した物が通る。`python3 docs/design-validation/noah/validate-noah-v1.py` が 10/10。
- 手元の D1 で、合図を 70 回送ると候補が 6 万件以上入り、71 回目からは `updated_since` 付きの 1〜2 頁だけを読む。運営の画面の「相手のサーバー」の行が、8 章の表と 1% 以内で合う。
- `services/noah-patrol-wake` が `wrangler deploy --dry-run` を通る。配備はしない。
- 切り替えを全部閉じた時、今の画面と API の動きが変わらない（`npm run verify`）。

### 11.8 点検で直した所（2026-11-20）

L3 の実装（PR #332）を、手元で動かして確かめて見つけた所。1・2・5・6 は、この仕様の書き方が誤っていた・足りなかった所（上の章も直した）。3 は、[97](spec-97-launch-ops.md) の 4 章に書いてあった事が、入っていなかった所。4 は、型契約（名寄せの SQL）の誤り。試験は `tests/noah-intake-resilience.test.mjs`（直す前の実装では 12 件のうち 11 件が落ちる）と、`validate-noah-v1.py` の名寄せの確認。

| # | 直す前に起きた事 | 直した後 |
| --- | --- | --- |
| 1 | 握手済み（L1・L2）の候補の記録が、版や説明だけ更新されると、checks が `level=0`・`unchecked` に戻り、系列が一覧から消えた。5.1 の 3 が「`connect_sha256` が変わったら戻す」と書いていて、接続要件が記録の hash を含むため | 接続先に関わる項目が変わった時と、有効に戻った時だけ戻す（5.1 の 3） |
| 2 | 1 頁に形の違う記録が 1 件あると、その頁が `invalid_response` になり、読み直しても同じ所で止まった（その頁の、読める記録も入らない） | 1 件だけ読み飛ばす。10 件を越えたら、その頁を失敗にする（5.1 の 3） |
| 3 | 台帳を読めなかった合図が、200 で返った（専用の Worker の実行が、成功として残る）。件数の 1 行が出なかった | 500。1 行を出す（11.3。[97](spec-97-launch-ops.md) の 4 章） |
| 4 | 名寄せのたびに、すでに隠してある系列の行（量産の系列にまとめた候補の元の行。実測で約 12,000）を書き直した。**隠した系列を戻す文が無く、**取り下げの後で台帳に戻った候補や、ほどけた量産の系列の候補が、握手が通っても一覧に出なかった | 隠すのは 1 回だけ。候補が戻った系列は戻す（[noah-regroup-v1.sql](../contracts/noah-regroup-v1.sql) の 8・9 文目） |
| 5 | 全件の巡回が、半分だけの一覧を 2 回続けて受け取ると、2 回目で、見えなかった半分を全部取り下げた（空の一覧が 2 回なら、全部）。比べる相手が「前の全件の巡回より後に見えた候補の数」で、1 回目の後に小さくなるため | 持っている有効な候補の 9 割以上が見えた時だけ（5.1 の 4） |
| 6 | 保存した `cursor` の続きが読めなくなると、同じ所で失敗し続けた。`failure_count` は、巡回が終わるまで増え続けた（頁を書けても戻らない） | 続けて 6 回で、同じ印から始め直す。1 頁を書けたら 0 に戻す（5.1 の 5） |

決めた数（候補。本人が変える）: 1 頁で読み飛ばしてよい記録 10 件、始め直すまでの失敗 6 回、取り下げてよい割合 90%。どれも `lib/noah-intake-sync.ts` の先頭にある。
