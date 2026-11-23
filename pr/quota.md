## 何をしたか

使い勝手と抜け道の確かめ（PR #UXAUDIT）の抜け道 S1（重さ 高）・[task 128](../blob/main/codex/tasks/128-noah-ux-debug.md) の D1。本人「抜け道があるかどうかとかぜんぶぜんぶ込みで第三者視点で調べて改善点を最終形までもってってね」「好きにしていいよ／だから早く完成品世に出したい」。

ブラウザだけの本人（Cookie の保存先、`noah-browser:`）は、Cookie を捨てるだけで何人でも作れる。だから本人ごとの上限（依頼 1 日 200 回・下書き 64MiB・Agent 100 件など）だけでは、D1（10GB まで）と R2 が際限なく増えた。ブラウザだけの本人を全員まとめた 1 日（UTC）の上限を掛けた。サインインした本人は数えない。

| 種類 | 1 日の上限（候補） | 掛けた所 |
| --- | --- | --- |
| 新しい接続 | 5,000 | `lib/noah-connect.ts`（本人ごとの上限の後、行を作る前・相手へ握手する前） |
| 依頼 | 10,000 | `lib/noah-ask.ts`（本人ごとの上限の後、Work と行を作る前・相手へ送る前） |
| Agent の登録 | 500 | `lib/noah-agent-api.ts`（新しい ID だけ。同じ ID の送り直しは数えない） |
| 下書きのファイル | 10,000 | `lib/noah-draft-storage.ts`（新しいファイルだけ） |
| R2 に置くバイト数（下書き・Agent のコード） | 4GiB | 同上 |
| コードの取り込み（GitHub・Hugging Face） | 300 | `lib/noah-agent-api.ts`（取りに行く前） |

越えたら 429 と「今日は、ブラウザだけの保存先からの受付が、Noah 全体の上限に達しました。時間をおいて（日本時間の 9 時を過ぎてから）、また試してください。」を返す。

数え方（`lib/noah-browser-quota.ts`）: 新しい表は作らない（本番 D1 への migration は本人の許可が要る。AGENTS.md の 6）。本番に既にあるアカウントの回数表 `rockstar_account_rate_limits(request_key, window, attempts)` に、`noah-quota:<種類>` と、その日の終わりの分で数える。アカウントの側の掃除（`window < 今の分 − 10` を消す）が、日が終わって 10 分たつと消す。条件つきの upsert 1 文（`INSERT … SELECT … WHERE ? <= ? ON CONFLICT … DO UPDATE … WHERE attempts + excluded.attempts <= ? RETURNING`）で、数えるのと書くのを一緒にする。同時に来ても上限を越えない。断った時は 1 も足さない。表が無い D1（Noah の表だけの試験の世界など）では、上限を掛けずに通す（Noah の本体を止めない）。

## してない事

- 数値を環境変数で変える事（今は `NOAH_BROWSER_DAILY` の定数。本人が変える時は、この file を直す）。
- 専用の表へ移す事（本人が migration を許可した時）。
- 1 分の中で何人分にも分ける使い方（task 128 の D2）: 1 人は 1 分 10 回まで（相手の枠 30 回の 3 分の 1）。何人分にも分けた量は、この 1 日の上限で抑えた。ブラウザだけの本人の作成に、人の確かめ（例: Cloudflare Turnstile）を足すのは、外部の設定が要るので本人の判断。

## 確かめた事

- `tests/noah-browser-quota.test.mjs`（6 本）: 全員まとめた上限・バイトは足して数え越える 1 回は丸ごと断る・サインインした本人は数えない・次の日に数え直し、掃除は日が終わって 10 分後・同時に来ても越えない・表が無い D1 では通し、ほかの失敗は投げる。
- `tests/noah-browser-quota-flows.test.mjs`（2 本）: 本物の入口（接続・依頼・取り込み・下書きのファイル）で、上限に達した日は 429 で断り、行を作らず、相手へも GitHub へも R2 へも送らない。サインインした本人は通す。上限の部分を外した file では、2 本とも落ちる。
- 接続・依頼・Agent・下書き・取り込みに触る既存の試験 27 file（252 本）: 全部通った。
- `tsc --noEmit`・`lint:product`: 通った。gitleaks: 0 件。
- 1〜6 を重ねた全体の `npm test`（手元）は流している。全体は CI の verify で確かめる。

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01JzDjJ2sHXBQS8oDJ7NBhAu
