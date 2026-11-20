# 仕様書 97 — 出すための運用（巡回を起こす・切り替え・窓口・見張る数・戻し方）

task: [codex/tasks/97-noah-launch-ops.md](../../codex/tasks/97-noah-launch-ops.md)。先に要る物: 85 のローンチ分（L3）。
[ローンチの最小限](mvp-launch.md) の L8。**この仕様は、全部がローンチの範囲。**
型契約: [noah-flags-v1.ts](../contracts/noah-flags-v1.ts)、[noah-intake-v1.ts](../contracts/noah-intake-v1.ts) の `NOAH_WAKE`・`NOAH_PATROL_BUDGET`、[noah-form-v1.ts](../contracts/noah-form-v1.ts) の `NOAH_ASK_LIMITS`。試験: [noah-flags.test.mjs](../design-validation/noah/noah-flags.test.mjs)、[noah-intake.test.mjs](../design-validation/noah/noah-intake.test.mjs) の「巡回を起こす合図」。

## 1. 完成の姿

- 本番で、人が触らずに、台帳の読み取りと握手が毎分進む。運営の機械（本人の Mac）が動いている必要が無い。
- 開ける・閉じるが、決まった 4 つの切り替えでできる。閉じた時に何が止まり、何が残るかが決まっている。
- 外の提供者が、Noah が何者で、何を読み、どう止めてもらえるかを、1 つの頁で読める。
- 運営が、出してよいか（[ローンチの最小限](mvp-launch.md) の G2・G4）と、出した後の調子を、決まった数で見られる。

## 2. この仕様で決めた事

| 決めた事 | 理由 |
| --- | --- |
| 巡回は、毎分の合図を送るだけの専用の Worker が起こす。処理は全部、Web の本体が行う | 既存の `services/sky-free-cloud-wake` と同じ作り。Web の本体の `scheduled` は、本番で定期に呼ばれる事が確かめられていない（[sky-launch-operations.md](../sky-launch-operations.md) の「CSV期限切れ削除の候補」） |
| 切り替えは環境変数。値が `true` の時だけ開く。形の違う値は、閉じた物として扱う | 既存の `SKY_FREE_CLOUD_BACKGROUND_ENABLED=true` と同じ持ち方。間違えた値で開かない（検証キットが確かめている） |
| 閉じていても、審査者（`NOAH_REVIEWER_USER_IDS`）は使える | 一般に開ける前に、本番で受入（[90](spec-90-phone-only-loop.md) の 5 章）を行うため |
| 巡回は、Workers と D1 の有料の枠を前提にする | 3 章の表。無料の枠では、CPU 時間と D1 の書き込みが足りない |
| 報告の数で自動で伏せる作りは、ローンチに入れない | 窓口と、運営の取り下げ（その場で効く）で始める。表を足さない |

## 3. 配備先の上限と、要る契約（本人が確かめる。D5）

Cloudflare の上限（読んだ日 2026-11-20: [Workers](https://developers.cloudflare.com/workers/platform/limits/)、[D1](https://developers.cloudflare.com/d1/platform/limits/)、[D1 の料金](https://developers.cloudflare.com/d1/platform/pricing/)）と、この設計が使う量。

| 上限 | 無料 | 有料 | この設計が使う量 | 無料で足りるか |
| --- | --- | --- | --- | --- |
| 1 回の実行の CPU 時間 | 10 ms | 30 秒（既定） | 合図 1 回で約 0.3〜0.5 秒（台帳 1 頁 100 件の下書きと hash に約 27 ms。手元の計測）。道具の一覧が 600KB の接続先では、依頼 1 件に約 15 ms | **足りない** |
| 1 回の実行の、外向きの通信 | 50 回 | 10,000 回 | 合図 1 回で、台帳 10 頁＋握手 8 件 × 4 回 ＝ 約 42 回（握手 1 件は、実測で 3 回が 88%、4 回が 11%。[86](spec-86-remote-mouth.md) の 10.2）。握手を 16 件にすると約 75 回。接続 1 件・道具の一覧 1 回は、握手の 3〜4 回（セッションを使う相手は、閉じる要求で 1 回多い）。依頼 1 件で 5 回 | 既定の数なら足りる |
| 同時に開ける外向きの接続 | 6 本 | 6 本 | 握手は同時に 4 件まで（`NOAH_PATROL_BUDGET.concurrent`） | 足りる |
| 応答の後に続けられる時間（`waitUntil`） | 30 秒 | 30 秒 | 依頼 1 件で、握手 8 秒＋呼び出し 20 秒まで | 足りる |
| D1 の query（1 回の実行） | 50 | 1,000 | 合図 1 回で、最初の全件の間（約 70 分）は約 110（台帳 10 頁で約 100）、毎時の更新は約 20、握手だけの合図は 11（`db.batch` は 1 と数える。手元の計測。[86](spec-86-remote-mouth.md) の 10.6）。接続 1 件で 7（相手が 401・402 の時は 11）、道具の一覧で 4、切るで 2、計画を読むで 2（本人の確かめの分を除く。手元の計測。[74](spec-74-one-click-connect.md) の 11.8）。依頼 1 件で約 12 | **足りない**（最初の全件の間） |
| D1 の書き込み | 1 日 10 万行 | 月 5,000 万行まで含む | 最初の取り込みと握手の 1 巡で約 95 万行（1 回だけ）。その後は 1 日に約 17〜21 万行（下の内訳） | **足りない** |
| D1 の読み取り | 1 日 500 万行 | 月 250 億行まで含む | 一覧は索引を使い、1 頁 21 行。検索は 1 回に約 18,000 行 | 利用が少ない間は足りる |
| D1 の大きさ | 500MB | 10GB | 候補 6.8 万行（1 行の記録は中央値 409 bytes）で、数十 MB | 足りる |
| Cron Trigger の数（account） | 5 | 1,000 | 1 つ足す（今の `services/` に、毎分の物が 2 つ、5 分ごとが 1 つある） | 数え直しが要る |

D1 の書き込みの内訳（1 日。索引の書き込みも 1 行と数える）:

| 何 | 行 |
| --- | --- |
| 握手（1 回の合図で 8 件が上限。実際は 7 日ごとの確かめ直しで、1 日に約 5,000 件）。1 件で、取る・結果・接続先の間隔・系列への写しの約 7 行 | 3.5 万〜8 万 |
| 台帳の「更新された物だけ」（1 日に約 2,600 件 × 約 9 行） | 2.3 万 |
| 名寄せ（1 日 1 回。まとめた候補の約 12,000 件を書き直す） | 4.8 万 |
| 並びの引き直し（1 日 1 回。載せている約 18,000 系列） | 3.6 万 |
| 全件の読み直し（7 日に 1 回、約 13.5 万行）の 1 日あたり | 1.9 万 |
| 依頼・接続（利用による） | 少 |

**無料の枠のままでは出せない。** 有料の枠（Workers Paid）に入っているか、入るかを、本人が決める（契約と料金は、本人だけが変える。AGENTS.md §6）。今の Web の本体が「Sites」の配備で動いていて、その上限がここと違う場合は、本人が上の表の「この設計が使う量」と照らす。

1 回の合図で進める量は `NOAH_PATROL_BUDGET`（環境変数。JSON）で変える。既定は `{"pages":10,"probes":8,"concurrent":4,"seconds":25}`。最初の握手の 1 巡の間だけ `"probes":16` にしてよい（約 1.5 日で終わる）。

## 4. 巡回を起こす Worker（配備は本人の許可の後。D6）

作るのは 85 の 11.3（`services/noah-patrol-wake/`）。ここは、配備と止め方。

| 手順 | 中身 |
| --- | --- |
| 鍵を作る | 32 文字以上の乱数を、Git の外で作る。ログ・証拠・設定ファイルに書かない |
| 置く | 同じ値を、専用の Worker の secret `NOAH_PATROL_WAKE_KEY` と、Web の本体の環境変数 `NOAH_PATROL_WAKE_KEY` に置く（今の合図の鍵と同じ置き方。`services/sky-free-cloud-wake/README.md`） |
| 配備 | リポジトリの根から `npx wrangler deploy --config services/noah-patrol-wake/wrangler.jsonc`。Web の本体は、他の環境変数を保ったまま、今の保存版を配備し直す |
| 動かす | Web の本体の `NOAH_PATROL_ENABLED=true`。閉じている間、合図は届くが、何もしない（200 `disabled`） |
| 止める | `NOAH_PATROL_ENABLED=false`（握手と台帳の読み取りが止まる。今ある一覧は、そのまま出る）。合図そのものを止めるなら、専用の Worker の cron を外す |
| 鍵を替える | 両方を同時に替える。合図は、時刻が 2 分より離れると通らない |

合図が持つ物は、時刻と署名と、空の本文だけ。利用者の情報・依頼・鍵・接続先を持たない。専用の Worker には、HTTP の入口が無い。

合図 1 回の記録: Web の本体が `console.info(JSON.stringify({ event: 'noah-patrol', pages, seen, changed, skipped, probes, ok, authRequired, unreachable, rateLimited, skippedHost, toolsChanged, swept, error, ms }))` を 1 行出す。接続先の名前・URL・本人の ID は出さない。`skipped` は、形が違って読み飛ばした台帳の記録の数（[85](spec-85-intake.md) の 5.1 の 3。0 でない日が続く時は、台帳の形が変わっていないかを見る）。`error` は、巡回が失敗した時の理由の符号（`unavailable`・`rate_limited`・`invalid_response`。失敗していなければ `null`）。握手の数（`probes` から `toolsChanged` まで）は、L4 から入る。`swept`（止まった依頼と接続の後始末。[88](spec-88-mass-probe.md) の 9.5）は、依頼と接続を作った後の層が入れる。それまでは 0。`toolsChanged` は、握手が通った物のうち、道具の定義の hash（`tools_sha256`）が前の握手と違った数（最初の握手は数えない）。道具の定義が、日や週の単位でどれだけ変わるかを、配備先のログから数える（実測は 1 時間で 274 のうち 1。[86](spec-86-remote-mouth.md) の 10.2）。失敗（台帳が読めない、D1 が書けない）は、合図の応答を 500（表を読み書きできない時は 503）にして、専用の Worker の実行を失敗として残す（監視で、成功に見せない）。失敗の後の待ち時間の間に届いた合図は、何もせず 200 を返す（失敗ではない）。

## 5. 取り下げ・報告の窓口（`/noah/help` に `#bot` の節を足す）

今の `/noah/help` は `components/sky-service-help.tsx`。`<section id="bot">` を 1 つ足す。文は下のとおり（`<宛先>` は本人が決める。D8。決まるまで、この節を出さない＝出さない間は、ローンチしない）。

> **外の道具・Agent を提供している方へ**
>
> Noah は、Official MCP Registry に載っている記録を 1 時間に 1 回ほど読み、鍵の要らない接続先へ、応答するかどうかを確かめる通信を送ります。送るのは、接続の開始（`initialize`）と、道具の一覧の読み取り（`tools/list`）だけです。同じ接続先へは、1 時間に 1 回までです。名乗りは `NoahBot/1` です。道具を自動で呼ぶ事はしません。
>
> 利用者が Noah の画面から道具を使う時は、その利用者が入力した内容だけを、名乗り `Noah/1` で送ります。利用者の名前・アカウントは送りません。1 つの接続先へ、利用者の操作から始める接続は、全員を合わせて 1 分に 60 回までです。
>
> 「混んでいる」（429）と `Retry-After` を守ります（その時刻まで、定期の確かめも、利用者からの接続も送りません）。認証を求める応答（401）を返す接続先は、一覧に載せません。別の host への転送には従いません。
>
> 一覧から外してほしい時、説明が違う時、迷惑な内容を見つけた時は、<宛先> へ知らせてください。台帳の記録を外した物・非推奨にした物は、1 時間以内に、Noah の一覧からも外れます。
>
> 出どころ: Official MCP Registry。Noah は、このデータを読んで並べています。台帳の運営と、提携や公認の関係はありません。

宛先の既定の候補: 公開リポジトリの issue（題名の先頭に `[noah]`）。メールにする時は、本人が、公開してよい宛先を決める。

取り下げの手順（運営）: 申し出を受けたら、運営の画面でその系列を開き、「取り下げる」（85 の 11.5 の `withdraw`）。その場で、一覧・検索・詳細から消え、握手が止まり、つないでいる人の新しい依頼が止まる。申し出た相手へ、外した事を返す。戻す時は「戻す」。

## 6. 見張る数（運営の画面 `components/noah-review.tsx` の「取り込み」の節に足す）

出す物（上から）。本人の ID・依頼の中身・接続先ごとの利用者の数は出さない。

| 行 | 問い合わせ | 使う所 |
| --- | --- | --- |
| 切り替えの状態 | `parseNoahFlags(env)` の値と `warnings` | 開け間違いに気づく |
| 台帳の巡回 | `SELECT last_success_at, next_run_at, checkpoint_at, last_full_at, sweep_started_at, error_code, failure_count, observed FROM noah_intake_sources WHERE id = 'mcp-registry'` | G4。`last_success_at` が 2 時間より前なら、赤い字でなく「止まっています」の文で出す |
| まだ握手していない数 | `SELECT COUNT(*) FROM noah_intake_checks k JOIN noah_intake_candidates c ON c.id = k.candidate_id WHERE c.state = 'active' AND k.mouth = 'mcp-remote' AND k.setup = 0 AND k.result = 'unchecked' AND c.family_id NOT LIKE 'bulk:%'` | G2（0 になったら、最初の 1 巡が終わっている） |
| 載せている数 | 88 の 9.6 の 2 つの数（動いた・握手まで） | G2（合わせて 15,000 以上、動いたが 100 以上） |
| 載せていない理由 | [noah-listing-v1.sql](../contracts/noah-listing-v1.sql) の `counts` を `noahListing` に通した内訳 | 見込み（[ローンチの最小限](mvp-launch.md) の 5 章）と比べる |
| 握手の結果 | `SELECT result, COUNT(*) FROM noah_intake_checks WHERE mouth = 'mcp-remote' AND setup = 0 GROUP BY 1` | 標本の割合（応答 55%、401 が 35%、応答しない 9%）から大きく外れたら、原因を調べる |
| 同じ接続先への握手の間隔 | `SELECT COUNT(*) FROM (SELECT c.host FROM noah_intake_checks k JOIN noah_intake_candidates c ON c.id = k.candidate_id WHERE k.checked_at > :hour_ago AND c.host IS NOT NULL GROUP BY c.host HAVING COUNT(*) > 1)` | G4（0 である事）。`checked_at` は、巡回の握手だけが書く（利用者の接続・依頼では書き換えない）ので、巡回の間隔だけを数えられる |
| 接続 | `SELECT state, COUNT(*), AVG(probe_ms) FROM noah_connections WHERE place = 'provider' AND created_at >= :since GROUP BY 1` | 仮説 1（押した数のうち `connected` の割合。握手の時間） |
| 依頼 | `SELECT state, COUNT(*) FROM noah_asks WHERE created_at >= :since GROUP BY 1` | 仮説 3（成果・相手の誤り・結果不明の割合） |
| 最初の成果 | `SELECT (SELECT COUNT(DISTINCT owner_id) FROM noah_connections WHERE place = 'provider' AND connected_at >= :since) AS connected, (SELECT COUNT(DISTINCT owner_id) FROM noah_asks WHERE state = 'succeeded' AND created_at >= :since) AS succeeded` | 仮説 2 |
| 戻ってきた人 | `SELECT COUNT(*) FROM (SELECT owner_id FROM noah_asks WHERE state = 'succeeded' GROUP BY owner_id HAVING COUNT(DISTINCT created_at / 86400000) >= 2)` | 仮説 4 |
| 画面の幅 | `SELECT screen, COUNT(*) FROM noah_asks WHERE created_at >= :since GROUP BY 1` | 仮説 5 |
| 混んでいる接続先 | `SELECT COUNT(*) FROM noah_probe_hosts WHERE user_window_at > :minute_ago AND user_count >= :limit`（`:limit` は `hostHandshakes`）と、`SELECT COUNT(*) FROM noah_probe_hosts WHERE not_before > :now` | 直近 60 秒の枠を使い切った接続先の数と、相手が「混んでいる」と返して待っている接続先の数。0 でない時間が続いたら、送りすぎを疑う |
| 失敗の多い接続先 | `SELECT host, SUM(state = 'failed') AS failed, SUM(state = 'unknown') AS unknown, COUNT(*) AS n FROM noah_asks WHERE created_at >= :since GROUP BY host HAVING COUNT(*) >= 5 ORDER BY (failed + unknown) * 1.0 / n DESC LIMIT 20` | 取り下げを考える物。5 件未満の接続先は出さない |

`:since` は 24 時間前と 7 日前の 2 つ。結果は 5 分間、同じ値を返してよい。入口は 85 の 11.5 の `GET /api/noah/intake?state=1`（審査者だけ）に、`"launch": { … }` として足す。

## 7. 切り替え・開ける順・戻し方

切り替え（Web の本体の環境変数。読むのは `lib/noah-intake-server.ts` と、それを使う `*-server.ts` だけ）:

| 名前 | 既定 | 開けると | 閉じると |
| --- | --- | --- | --- |
| `NOAH_PATROL_ENABLED` | 閉 | 合図のたびに、台帳を読み、握手する | 外への定期の通信が止まる。一覧は、今ある物をそのまま出す |
| `NOAH_INTAKE_PUBLIC` | 閉 | 一覧・詳細・検索・navigation の行が、誰にでも見える | 審査者だけに見える |
| `NOAH_ASK_FORM` | 閉 | 接続と、入力欄で頼む事が、誰にでもできる（`NOAH_INTAKE_PUBLIC` も開いている時だけ） | 新しい接続と依頼が 503。進んでいる依頼は、最後まで進む。つないだ記録と成果は残る |
| `NOAH_PROBE_L2` | 閉 | （ローンチの範囲に、開けた時の動きは無い。本人の決定の後に作る） | — |
| `NOAH_ASK_LIMITS` | 無し（既定の数） | JSON で数を上書きする。例 `{"perDay":50}`。項目は 8 つ: 依頼（`open` 8・`perMinute` 10・`perDay` 200・`hostPerMinute` 30）、接続（`connectLive` 50・`connectPerMinute` 10・`connectPerDay` 100）、1 つの接続先へ、利用者の操作から始める握手を全員合わせて 60 秒に何回まで（`hostHandshakes` 60） | — |
| `NOAH_PATROL_BUDGET` | 無し（既定の数） | 同上。例 `{"probes":16}` | — |

開ける順は [ローンチの最小限](mvp-launch.md) の 9 章（段 0〜3）。環境変数を変えた後は、今の保存版を配備し直す（変えるだけでは効かない）。

戻し方:

| 起きた事 | する事 | 効くまで | 残る物 |
| --- | --- | --- | --- |
| 1 つの Agent がおかしい（嘘の案内、迷惑、申し出） | 運営の画面で「取り下げる」 | その場 | 記録は残る。つないでいる人には「取り下げられました」 |
| 1 つの接続先へ、送りすぎている | `NOAH_ASK_LIMITS` の `hostHandshakes`（接続・道具の一覧・依頼の握手）と `hostPerMinute`（依頼）を下げる。1 つの接続先だけを止める時は、その接続先の `noah_probe_hosts.not_before` を先の時刻にする（その時刻まで、巡回も、利用者の操作から始める握手も送らない。運営の画面の操作にはしない。D1 を直に書く時は、本人の許可を取る） | 配備し直した後 | — |
| 依頼の道全体がおかしい | `NOAH_ASK_FORM=false` | 配備し直した後 | 一覧は見える。つないだ記録と成果は残る |
| 一覧そのものを引っ込める | `NOAH_INTAKE_PUBLIC=false` | 配備し直した後 | 審査者には見える |
| 外への定期の通信を止める | `NOAH_PATROL_ENABLED=false` | 配備し直した後 | 候補と握手の記録は残る。開け直すと、続きから進む |
| コードを戻す | 前の保存版を配備する。表は消さない（新しい表は、古いコードから読まれない）。**L6 より前へは、そのまま戻さない**: `noah-agent-remote` の Work が 1 件でもあると、古いコードは、その本人の Work の一覧を読めない（87 の 11.8）。依頼の切り替えを閉じるだけにするか、戻す版に `normalizeWorkJob` の枝を入れる | 配備の後 | 全部 |

ローンチの前に、`NOAH_ASK_FORM` と `NOAH_INTAKE_PUBLIC` を閉じる操作を、本番で 1 回行って、表のとおりになる事を確かめる（G6）。

## 8. 本番への適用（本人の許可の後。D7）

| 物 | 中身 | 出どころの PR |
| --- | --- | --- |
| migration 1 | `noah_intake_sources`・`noah_intake_candidates`・`noah_intake_checks`・`noah_intake_families`・`noah_probe_hosts` と索引 | L3 |
| migration 2 | `noah_connections` と索引 | L5 |
| migration 3 | `noah_asks` と索引 | L6 |
| 環境変数 | 7 章の表と `NOAH_PATROL_WAKE_KEY` | L3 |
| 専用の Worker | `services/noah-patrol-wake` | L3 |

3 本とも、新しい表を作るだけ（`CREATE TABLE IF NOT EXISTS`・`CREATE INDEX IF NOT EXISTS`）。今ある表を変えない。今ある行を書かない。適用の後、表の定義が [noah-v1.sql](../contracts/noah-v1.sql) の該当の部分と同じである事を、`sqlite_master` の `sql` を比べて確かめる。`noah_connection_secrets`・`noah_oauth_*`・`noah_standing_works`・`noah_usage_events` は、ローンチでは作らない。

## 9. 変える所と試験

| ファイル | 中身 |
| --- | --- |
| `components/sky-service-help.tsx` | 5 章の節。宛先は、環境変数でなく、本人が決めた文をそのまま書く |
| `components/noah-review.tsx`、`lib/noah-intake-store.ts` の `status()` | 6 章の行 |
| `services/noah-patrol-wake/README.md` | 4 章の手順 |
| `docs/services/noah-agent-intake.md` | 運用の節から、この仕様書へ 1 行 |

| 試験 | 期待 |
| --- | --- |
| 切り替え（移す） | [noah-flags.test.mjs](../design-validation/noah/noah-flags.test.mjs) の 4 群 |
| 合図（移す） | 署名・時刻・本文・道 |
| 窓口の文 | `/noah/help` の木に `id="bot"` があり、「NoahBot/1」「1 時間に 1 回まで」「1 分に 60 回まで」「提携や公認の関係はありません」を含む。数は、`NOAH_ASK_LIMITS` の既定と同じ（既定を変えた時は、文も直す） |
| 上限の上書き | `NOAH_ASK_LIMITS` に `{"connectPerMinute":2,"hostHandshakes":5}` を置くと、直近 60 秒の 3 件目の接続が 429。同じ接続先への、60 秒の間の 6 回目の握手が、相手へ送られない |
| 見張る数 | 6 章の問い合わせが、一時 DB で、手で数えた値と同じ。5 件未満の接続先が、失敗の多い接続先の行に出ない。応答に、本人の ID・依頼の中身が無い |
| 戻し方 | 切り替えを閉じた時の応答が、7 章の表のとおり（一覧 404・接続と依頼 503・進んでいる依頼は最後まで） |
| 記録 | 合図 1 回の `console.info` の 1 行に、接続先の名前・URL・本人の ID が無い |

## 10. 完了の定義

- 9 章の試験が通る。`npm run typecheck`、`npm run lint:product`。
- `/noah/help#bot` の文が、宛先を除いて入っている（宛先が決まるまで、節は `hidden` で置く）。
- PR 本文に、本人が行う事の一覧（3 章の契約の確かめ、4 章の配備、8 章の適用、7 章の開ける順）を、そのまま写せる形で書く。**この PR は、本番への配備・適用・切り替えを行わない。**
