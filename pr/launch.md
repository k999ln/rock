## 何をしたか

本人（2026-11-23 21:43）「好きにしていいよ／だから早く完成品世に出したい」。使い勝手と抜け道の確かめ（PR #UXAUDIT、[docs/noah/ux-audit-2026-11-22.md](../blob/main/docs/noah/ux-audit-2026-11-22.md)）の 9 章で本人に聞いていた Q1〜Q5 を、任された Claude が決めて、世に出す前に要る直しを入れた。決めは [docs/structure/07](../blob/main/docs/structure/07-decisions-from-minutes.md) の 2026-11-23 の行。本人が変える時は、その後に 1 行足す。

## 決めた事と、直した事

| 決め | 前 | 後 | 試験 |
| --- | --- | --- | --- |
| Q4 Noah 自身の紹介の窓口（広告を含む） | ホームの先頭 3 件の下の行が `noah-revenue-agents.mr-kirin999.workers.dev` で、誰の案内か分からない | 下の行を「Noahの案内（広告を含む）」にする。送信先の名前は詳細の画面に出す（`lib/noah-pins.ts` の `noahCardOrigin`） | `tests/noah-card-origin.test.mjs`（3 本） |
| Q5 「ココナラの仕事」（Mac だけ） | 全員のメニューに出て、スマホの人は先へ進めない | Mac で開いた時だけメニューに出す（`useSyncExternalStore`。サーバーの描画と最初の描画では出さない）。`/noah/coconala` は残す | `tests/noah-mac-menu.test.mjs`（2 本） |
| Q1 コードを保存した自分の Agent | どこで動くか書いていない（スマホの人がテンプレートのまま足すと、動かせない Agent ができる） | 作りはこのまま。コードを選んだ時に「MacのNoahで動く。スマホから使うなら MCP・Web」と書く | `tests/noah-upload-runs-on.test.mjs`（1 本） |
| Q3 お金の受取口座と本人確認の書類 | ブラウザだけの本人（Cookie の保存先）でも置けた。共有の端末では、同じブラウザの人が見られる（抜け道 S9） | ブラウザだけの本人には新しく置かせない（API は 403、画面は入力と書類の追加を出さず理由を書く）。前に置いた物は、読む・消す事だけ。サインインした本人は今までどおり | `tests/noah-profile-signed-in-only.test.mjs`（6 本） |
| Q2 定期便 | 閉じている | 閉じたまま（変更なし） | — |
| task 128 D3 | `/api/internal/rockstar/entitlement-deliveries` が、鍵の無い知らない人に 503 `SELLER_REGISTRY_UNCONFIGURED` | 鍵（Bearer）の無い人には 401 だけ。鍵を持つ売り手には、今までどおり設定の不足を返す | `tests/rockstar-entitlement-delivery-unconfigured.test.mjs`（2 本） |

`components/noah-shell.tsx` は応答の見出しの確かめの入力なので、手元の本番と同じ build を wrangler で動かし、`node scripts/check-web-security-response.mjs http://127.0.0.1:8787 --record-local-production` で `data/web-security-response-current.json` を測り直した。

## してない事（理由）

- task 128 D8（サインインの行き先）: `/noah/account` は元の画面へ戻すだけだが、戻った先でブラウザだけの本人が自動で作られるので、ほとんどの画面で行き止まりにならない。本当のサインインが要る画面（`noah-launch.tsx` など）の行き先は、既存の試験が `/noah/account?…` で固定している。試験を書き換えずに直せないので、本人の判断に回した。
- `/api/sky/service-status`: Sky の画面が使う、意図した公開の前提の情報（秘密の値は返さない）なので、変えない。
- `/noah/billing`: 1 つ目の commit で 404 にしたが、既存の試験 `tests/noah-route-unification.test.mjs` が `/sky/billing` と同じ画面として固定していたので（全体の試験で見つけた）、2 つ目の commit で元に戻した。リンクも sitemap も無い。外すなら、`services/sky-web/noah-page-routes.mjs` の対応表と試験を、本人の判断で変える。
- `/noah/free-cloud`: どこからもリンクが無く、運営でない人には API が 401。残した。
- task 128 D1・D2（ブラウザだけの本人の、全体の上限）: 次の PR にする。

## 確かめた事

- 足した試験 5 file（14 本）: `noah-card-origin`（3）・`noah-mac-menu`（2）・`noah-upload-runs-on`（1）・`noah-profile-signed-in-only`（6）・`rockstar-entitlement-delivery-unconfigured`（2）。どれも直す前の file では落ち、直した後で通る。
- 1〜5 を main `9cb7f5d1` の上に重ねた全体の `npm test`（1 つ目の commit の時。手元。Node 22・root）: 5,237 本のうち 5,196 本が通った（4 本は skip）。落ちた 37 本のうち 36 本（名前は 35）は、手を入れていない main でも同じ名前で落ちる。残りの 1 本（`tests/noah-route-unification.test.mjs` の「Noah pages reuse the original features」）は、1 つ目の commit で `/noah/billing` を 404 にした事が原因で、2 つ目の commit で元に戻した（その試験は通る）。
- `tsc --noEmit`・`lint:product`・`repository:check`・`project:check`・`design:check`・`release:check`: 通った。`release:check` のために、手元の本番と同じ build で応答の見出しを測り直した（PASS）。gitleaks: 0 件。
- 手元の本番と同じ build を Playwright で開いた: 「自分のAgentを追加」の注記が出る。スマホと Linux の PC では、メニューに「ココナラの仕事」が無い。Mac（`userAgentData.platform = macOS`）では有る。登録情報の「受取口座」「本人確認」が「サインインした本人だけ」で、書類の追加が無い。

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01JzDjJ2sHXBQS8oDJ7NBhAu
