# 仕様書 85 — 取り込みと名寄せ（外の台帳 → 候補 → 系列 → 接続要件の下書き）

task: [codex/tasks/85-noah-intake-ledger.md](../../codex/tasks/85-noah-intake-ledger.md)。先に要る物: 84（面の値）。
型契約: [noah-intake-v1.ts](../contracts/noah-intake-v1.ts)、[noah-v1.sql](../contracts/noah-v1.sql)（`noah_intake_*`、`noah_probe_hosts`）、[noah-regroup-v1.sql](../contracts/noah-regroup-v1.sql)。試験: [noah-intake.test.mjs](../design-validation/noah/noah-intake.test.mjs)（7 群）、[validate-noah-v1.py](../design-validation/noah/validate-noah-v1.py)（取り込みの 3 群）。

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
| 取り下げは「全件の巡回で見えなかった物」。ただし、前回の 9 割未満しか見えなかった巡回では行わない | 相手の障害で、全部を取り下げにしないため |

## 3. 今あるコードと、変える所

| ファイル | 今 | 変える事 |
| --- | --- | --- |
| `drizzle/0044_noah_intake.sql`、`db/schema.ts`、`drizzle/meta/_journal.json` | 無い | [noah-v1.sql](../contracts/noah-v1.sql) の `noah_intake_sources`・`noah_intake_candidates`・`noah_intake_checks`・`noah_intake_families`・`noah_probe_hosts` と索引を移す |
| `lib/noah-intake-draft.ts` | 無い | 型契約から `draftFromRegistry`・`draftFromSpace`・`draftFromAcp`・`noahCandidateId`・`NOAH_INTAKE_REASONS` を移す |
| `lib/noah-intake-family.ts` | 無い | 型契約から `groupNoahFamilies`・`noahRepositoryKey`・`NOAH_BULK_THRESHOLD` を移す。[noah-regroup-v1.sql](../contracts/noah-regroup-v1.sql) の文を、文字列の配列として同じファイルに置く |
| `lib/noah-intake-store.ts` | 無い | 新規。`createIntakeStore({ db, now, fetcher })` → `{ sync, regroup, list, detail, status }`。作りは `lib/noah-discovery-store.ts` に合わせる |
| `lib/noah-intake-api.ts`、`app/api/noah/intake/route.ts`、`app/api/noah/intake/[id]/route.ts` | 無い | 新規。`lib/noah-discovery-api.ts` と同じ検査（Origin、ownerScope、本文は `{}` だけ） |
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
   - 下書きの `connect_sha256` が変わった候補は、checks を `level=0`・`result='unchecked'`・`tools_sha256=NULL`・`next_check_at=now` に戻す（確かめ直すまで、印を出さない）。
   - 1 頁の書き込みは `db.batch` で 100 文ずつ。頁の最後に `cursor` を保存する（途中で止まっても、次の呼び出しが続きから読む）。
4. 最後の頁まで読んだら（`nextCursor` が無い）:
   - 取り下げ: この巡回で見えた件数が、前回の `observed` の 9 割以上の時だけ、`source=? AND state='active' AND seen_at < sweep_started_at` を `withdrawn` にする。
   - `regroup()` を流す（[noah-regroup-v1.sql](../contracts/noah-regroup-v1.sql) の 8 文を上から順に。`:threshold` は 20）。
   - `cursor=NULL`、`sweep_started_at=NULL`、`last_success_at=now`、`next_run_at` ＝ 台帳と Space は 1 時間後、ACP は 24 時間後。
5. 失敗した時: `error_code` に `rate_limited`・`unavailable`・`invalid_response` を入れ、`failure_count+1`、`next_run_at = now + min(2^failure_count 分, 6 時間)`。429 は `Retry-After` を使う。lease は放す。
6. 応答 `{ "outcomes": [{ "source", "pages", "seen", "changed", "more" }], "sources": <status()> }`。

名乗り: `User-Agent: NoahBot/1 (+https://<Noah の origin>/noah/help#bot)`。転送は追わない（`redirect: 'manual'`）。1 応答は 4MB まで。

### 5.2 `list()`・`detail()`・`status()`

- `GET /api/noah/intake?mouth=&level=&state=&q=&cursor=` → 系列の一覧（20 件ずつ）。`noah_intake_families` と代表の候補・checks を結ぶ。`q` は `name`・`summary` の前方一致と部分一致（`LIKE`。全文検索は後）。flag `NOAH_INTAKE_PUBLIC` が閉じている間は、審査者（`deps.reviewers`）だけ。他は 404。
- `GET /api/noah/intake?state=1` → 出どころごとの最後の成功・次の時刻・エラーと、集計（下の画面の表）。
- `GET /api/noah/intake/[id]` → 系列 1 つと、中の候補（50 件まで）。

集計の問い合わせ: `SELECT k.mouth, k.level, k.setup, COUNT(*) FROM noah_intake_candidates c JOIN noah_intake_checks k ON k.candidate_id=c.id WHERE c.state='active' GROUP BY 1,2,3` と、`SELECT reason, COUNT(*) FROM noah_intake_candidates WHERE state='unsupported' GROUP BY 1`。結果を 5 分間、同じ値で返してよい。

## 6. 画面（運営だけ。`components/noah-review.tsx` に 1 節）

```
取り込み                                   最後に確かめた: 11/20 05:10（次: 06:10）
┌──────────────┬────────┬──────────┬──────────┬────────┐
│              │ 候補   │ 入力なし │ 準備が要る│ 系列   │
│ 相手のサーバー│ 44,640 │ 40,503   │ 4,137    │ …      │
│ 端末で動かす │ 18,158 │ 14,132   │ 4,026    │ …      │
│ Space（動作中）│ 4,331 │ 4,331    │ 0        │ …      │
└──────────────┴────────┴──────────┴──────────┴────────┘
つなげない 3,810: 型紙の無い配布 1,654 ／ 接続先が無い 962 ／ 旧い接続先だけ 704 ／ …
[ 口: すべて ▾ ] [ 深さ: すべて ▾ ] [ 語で絞る            ]
io.github.pipeworx-io の道具 1,936 個     相手のサーバー   まだ確かめていない
Mizan                                     相手のサーバー   まだ確かめていない
…
```

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
| 取り下げ | 2 巡目で 1 件が消える | その 1 件が `withdrawn`。系列の `members` が減る |
| 安全弁 | 2 巡目が、前回の 5 割しか返さない | 取り下げを行わない。`error_code` は付かない |
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
- 公式台帳の「更新された物だけ」の取り方（`updated_since`）。census は全件を読んだ。指定が使えると確かめたら、毎時の巡回を差分にし、全件は 1 日 1 回にする。確かめるまでは、毎時 10 頁ずつ進み、68 回（約 1 時間強）で 1 巡する。
- 発見の候補（`noah_discovery_candidates`）と同じリポジトリの系列を、詳細の画面で並べて見せるか。

## 10. 完了の定義

- `node --experimental-strip-types --test tests/noah-intake-draft.test.mjs tests/noah-intake-family.test.mjs tests/noah-intake-store.test.mjs` が通る。
- `python3 docs/design-validation/noah/validate-noah-v1.py` が通る（DDL を migration へ移した後も、同じ文であること）。
- 手元の D1 で `POST /api/noah/intake` を 70 回呼ぶと、台帳の候補が 6 万件以上入り、運営の画面の件数が 8 章の表と 1% 以内で合う（台帳は増え続けるので、同じにはならない）。
- `npm run typecheck`、`npm run lint:product`、`npm run schema:check`、`npm run database:check`。
- 本番 D1 への migration は適用しない。PR 本文に、適用が要る事を書く。
