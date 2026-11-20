# Noah patrol wake worker

毎分、署名つきの空の本文（`{}`）を `https://<NOAH_ORIGIN>/api/noah/intake/tick` へ送るだけの、専用の Worker。
台帳を読む・握手する・保存するのは、全部 Web の本体（`lib/noah-intake-store.ts`）。この Worker は、HTTP の入口・利用者の情報・依頼・モデルの鍵・接続先を持たない。
作りは `services/sky-free-cloud-wake` と同じ。仕様は [docs/noah/spec-85-intake.md](../../docs/noah/spec-85-intake.md) の 11.3 と [docs/noah/spec-97-launch-ops.md](../../docs/noah/spec-97-launch-ops.md) の 3〜4 章。

**配備は、本人の許可の後（AGENTS.md §6。ローンチの最小限の D5・D6）。** この folder を main に入れても、何も動かない。

## 送る物

| 物 | 値 |
| --- | --- |
| 道 | `POST /api/noah/intake/tick` |
| header | `x-noah-time`（ミリ秒 13 桁）、`x-noah-signature`（hex 64 桁）、`Content-Type: application/json` |
| 本文 | `{}`（これ以外は、Web の本体が拒否する） |
| 署名 | HMAC-SHA-256。鍵は `NOAH_PATROL_WAKE_KEY`、対象は `<時刻>\nPOST\n/api/noah/intake/tick\n{}` |

Web の本体は、鍵が 32 文字より短い・時刻が 2 分より離れている・本文が `{}` でない・署名が違う、のどれでも 401 を返す。`Origin` の header が付いた要求は 403（画面から呼ぶ入口ではない）。`NOAH_PATROL_ENABLED` が `true` でない間は、200 `{"disabled":true}` を返して何もしない。

## 配備の手順（本人が行う）

1. Cloudflare の契約を確かめる。巡回は、Workers と D1 の有料の枠が前提（仕様書 97 の 3 章の表）。Cron Trigger の数も数え直す。
2. 鍵を作る。32 文字以上の乱数を、Git の外で作る。ログ・証拠・設定ファイル・この README に書かない。
3. 同じ値を 2 か所に置く: この Worker の secret `NOAH_PATROL_WAKE_KEY`（`npx wrangler secret put NOAH_PATROL_WAKE_KEY --config services/noah-patrol-wake/wrangler.jsonc`）と、Web の本体の環境変数 `NOAH_PATROL_WAKE_KEY`。
4. 送り先を確かめる。`wrangler.jsonc` の `NOAH_ORIGIN` は `https://avoado.si`。別の origin で動かす時だけ変える（https の origin だけ。道は付けない）。
5. リポジトリの根から `npx wrangler deploy --config services/noah-patrol-wake/wrangler.jsonc`。
6. Web の本体に `NOAH_PATROL_ENABLED=true` を置き、他の環境変数を保ったまま、今の保存版を配備し直す。

配備せずに形だけ確かめる: `npx wrangler deploy --dry-run --config services/noah-patrol-wake/wrangler.jsonc`。

## 止める・鍵を替える

- 巡回を止める: Web の本体の `NOAH_PATROL_ENABLED=false`（台帳の読み取りと握手が止まる。今ある一覧は、そのまま出る）。合図は届くが、何もしない。
- 合図そのものを止める: `wrangler.jsonc` の `crons` を外して配備し直す。
- 鍵を替える: 両方を同時に替える。合図は、時刻が 2 分より離れると通らない。

## 確かめ方

Web の本体は、合図 1 回につき `{"event":"noah-patrol","pages":…,"seen":…,"changed":…,…,"ms":…}` を 1 行出す。接続先の名前・URL・本人の ID は出さない。
台帳が読めない・保存できない時は、合図の応答が 500 になり、この Worker の実行が失敗として残る。手元では `tests/noah-intake-api.test.mjs` が、署名・時刻・本文・`Origin`・切り替えを確かめる。
本番で動いた事（72 時間・成功 99% 以上）は、配備した後に本人と審査者が確かめる（ローンチの最小限の G4）。ここに書いてある事は、手元の試験の結果で、本番の合格ではない。
