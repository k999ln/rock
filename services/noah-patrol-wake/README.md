# Noah 巡回の合図（`services/noah-patrol-wake`）

毎分、`https://<NOAH_ORIGIN>/api/noah/intake/tick` へ、署名の付いた空の JSON（`{}`）を 1 回送るだけの、専用の Worker。
処理は全部、Web の本体が行う（台帳の読み取り・握手・止まった依頼と接続の後始末）。この Worker は、何を読むか・どこへ握手するかを知らない。

- HTTP の入口が無い（`scheduled` だけ。`workers_dev`・`preview_urls` は閉）。
- 持つ物は、行き先の host（`NOAH_ORIGIN`。設定の file にある）と、合図の鍵（`NOAH_PATROL_WAKE_KEY`。secret）だけ。利用者の情報・依頼・接続先・モデルの鍵は持たない。
- 合図が持つ物は、時刻（`x-noah-time`。ミリ秒 13 桁）と、署名（`x-noah-signature`。HMAC-SHA256 の hex 64 桁）と、空の本文だけ。
- Web の本体が 2xx を返さなければ、その回の実行は失敗として残る（監視で、成功に見せない）。転送には従わない。待つのは 55 秒まで。
- 鍵や行き先の形が違う時（鍵を置く前に配備した時も）は、何も送らずに、`Invalid Noah wake configuration` で失敗する。

仕様は [docs/noah/spec-97-launch-ops.md](../../docs/noah/spec-97-launch-ops.md) の 4 章（配備と止め方）・7 章（切り替えと戻し方）・8 章（本番への適用）。
試験は `tests/noah-launch-ops.test.mjs`（この Worker が送った合図を、Web の本体の入口がそのまま受ける事）と、`tests/noah-intake-api.test.mjs`・`tests/noah-intake-resilience.test.mjs`（Web の本体の側）。

**リポジトリの中の作業では、配備していない。** 本番の migration・この Worker の配備・鍵の設定・`NOAH_PATROL_ENABLED` などの切り替えは、どれも本人の明示の許可が要る（AGENTS.md §6。[ローンチの最小限](../../docs/noah/mvp-launch.md) の D5〜D7）。

## 手元での検証（配備しない）

リポジトリの根から。束ねられる事だけを確かめる（外へは送らない）。

```sh
WRANGLER_WRITE_LOGS=false npx wrangler deploy --dry-run --config services/noah-patrol-wake/wrangler.jsonc --outdir work/noah-patrol-wake-dry-run
```

2026-11-21 の結果（wrangler 4.122.0）: 束ねた物は 1.84 KiB。binding は `env.NOAH_ORIGIN`（`avoado.si`）だけ。中身は、合図の署名（`lib/noah-intake-wake.ts`）と、この Worker の `scheduled` だけ（握手・台帳・表を読むコードは入らない）。

## 配備の手順（本人が行う。段 1）

先に済ませておく事（[spec-97](../../docs/noah/spec-97-launch-ops.md) の 3 章・8 章）:

- Cloudflare の契約が、有料の枠（Workers Paid）である事を確かめる。無料の枠では、Web の本体の側の CPU 時間と D1 の書き込みが足りない。account の Cron Trigger の数も数える（この Worker で 1 つ増える）。
- 本番の D1 へ、Noah の migration を **4 本とも**適用してある事（取り込み・接続・依頼・索引）。1 本でも欠けたまま巡回を開けると、合図は毎回 503 で失敗する（握手は接続の表を見る。後始末は、依頼と接続の表を読む）。
- Web の本体が、L1〜L8 を含む版である事。

| 手順 | する事 |
| --- | --- |
| 1. 鍵を作る | 32 文字以上の乱数を、Git の外で作る（例: 手元の端末で `openssl rand -hex 32`）。**ログ・証拠・設定の file・PR・チャットに書かない。** |
| 2. この Worker に置く | `npx wrangler secret put NOAH_PATROL_WAKE_KEY --config services/noah-patrol-wake/wrangler.jsonc`（値は、聞かれた所へ貼る。コマンドの引数に書かない）。Worker がまだ無いと言われた時は、先に手順 4 の配備をしてから、もう一度行う（鍵が無い間の実行は、何も送らずに失敗するだけ）。 |
| 3. Web の本体に置く | 同じ値を、Web の本体の環境変数 `NOAH_PATROL_WAKE_KEY` に置く（今ある合図の鍵 `SKY_FREE_CLOUD_WAKE_KEY` と同じ置き方。[services/sky-free-cloud-wake/README.md](../sky-free-cloud-wake/README.md)）。他の環境変数は、そのまま保つ。 |
| 4. 配備する | リポジトリの根から `npx wrangler deploy --config services/noah-patrol-wake/wrangler.jsonc`。ここから、毎分の合図が届き始める。Web の本体の `NOAH_PATROL_ENABLED` が閉じている間は、合図は届くが、何もしない（200 `{"disabled":true}`。台帳も、相手も、表も、触らない）。 |
| 5. 動かす | Web の本体の `NOAH_PATROL_ENABLED=true`。環境変数は、変えるだけでは効かない。今の保存版を、配備し直す。 |
| 6. 確かめる | 下の「動いているかの見方」。 |

`NOAH_ORIGIN`（`wrangler.jsonc` の `vars`）は、行き先の host の名前だけ（`https://` も、道も、port も付けない）。

## 動いているかの見方

- この Worker の実行の記録（Cloudflare の画面の Logs。`observability` を開けてある）: 毎分 1 回、成功している。失敗の文は、`Noah wake HTTP 401`（鍵が合わない・時刻が 2 分より離れている）、`Noah wake HTTP 500`（Web の本体が、台帳を読めなかった）、`Noah wake HTTP 503`（Web の本体が、表を読み書きできなかった）、`Invalid Noah wake configuration`（鍵が無い・短い、行き先の形が違う）。
- Web の本体の記録: 合図 1 回に 1 行。`{"event":"noah-patrol","pages":…,"seen":…,"changed":…,"skipped":…,"probes":…,"ok":…,"authRequired":…,"unreachable":…,"rateLimited":…,"skippedHost":…,"toolsChanged":…,"swept":…,"error":…,"ms":…}`。数と、理由の符号だけ（接続先の名前・URL・本人の ID は出ない）。
- 運営の画面（`/noah/review` の「取り込み」→「見張る数」）: 切り替えが「巡回 開」。台帳の巡回の「最後の成功」が進む。「まだ握手していない数」が減っていき、0 になったら最初の 1 巡が終わっている。「同じ接続先へ、1 時間に 2 回以上握手した数」が 0。

最初の動き: 台帳の全件を読む（約 70 分）→ 握手の 1 巡（既定の毎分 8 件で、約 3 日）。この間だけ、Web の本体の `NOAH_PATROL_BUDGET` を `{"probes":16}` にしてよい（約 1.5 日。終わったら戻す）。

## 止める

| 止めたい物 | する事 | 残る物 |
| --- | --- | --- |
| 外への定期の通信（台帳の読み取りと握手） | Web の本体の `NOAH_PATROL_ENABLED=false` にして、今の保存版を配備し直す | 候補と握手の記録は残る。一覧は、今ある物をそのまま出す。開け直すと、続きから進む |
| 合図そのもの | `wrangler.jsonc` の `triggers.crons` を空（`[]`）にして、この Worker を配備し直す | Worker と鍵は残る。戻す時は、cron を戻して配備する |

巡回を止めている間は、合図の終わりの後始末（途中で止まった依頼と接続の片付け）も止まる。その間も、本人は「止める」で、止まった依頼を終えられる。開け直した最初の合図で、残りが片付く。

## 鍵を替える

この Worker の secret と、Web の本体の環境変数を、**同時に**替える（Web の本体は、配備し直す）。片方だけが新しい間は、合図が 401 になり、その回の実行が失敗として残る（その間、巡回が進まないだけで、他の物は壊れない）。合図は、時刻が 2 分より離れると通らない（前の合図を、後から送り直す事はできない）。鍵が漏れたと思ったら、すぐ替える。
