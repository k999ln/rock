task 129 の残りのうち、本人の答えが要らない 3 つ（D2・D7・D8）を直す。本人の頼み（2026-11-27 15:58）「このチャットでやった事を全部改良して、世に出せる最終版にして」の 1 つ目の区切り。

## わかった事

- **D2**（抜け道 S2）: 1 つの相手への依頼は、全員合わせて 1 分 30 回（`hostPerMinute`）。1 人は 1 分 10 回（`perMinute`）なので、今は 3 分の 1 までしか使えない。ただ、この 3 分の 1 は「本人の 1 分の上限がたまたま 10」だから成り立っていて、`NOAH_ASK_LIMITS` の JSON で `perMinute` を上げると、1 人で相手の枠を使い切れる（ほかの人は「今こんでいます」になる）。
- **D7**: 本番の avoado.si（2026-11-27、スマホ幅 390px、10 画面）で、はみ出しは 0。小さい押す所は `/noah/help` の文の外のリンク 2 つだけ（「マーケットへ戻る」120×19px・「Mac用Noahと導入手順を見る」203×19px）。
- **D8**: #91 の後に入った 2 つのリンクが、まだ `/noah/account` へ行っていた。`components/noah-first-earning.tsx` の「サインイン」（#101）と、`components/noah-shared-compute.tsx` の「ログインする」（#121）。どちらの API もブラウザだけの本人に 401 を返すので、`/noah/account` で元の画面へ戻っても、また「サインイン」が出て、先へ進めなかった。

## やった事

- D2: 1 人が 1 つの相手へ直近 60 秒に頼めるのは、相手の枠の 3 分の 1（切り捨て、最低 1 回）まで。`lib/noah-limits.ts` の `noahAskOwnerHostLimit`、`lib/noah-form.ts` の `noahAskGate` に 5 つ目の数（渡した時だけ見る。`code: 'share'`、文「同じ Agent へ続けて頼みすぎています。少し待ってから試してください。」）、`lib/noah-ask.ts` で数える（本人の 1 分の上限の方が小さいか同じ時は、そちらが先に止めるので数えない。既定の数では、問い合わせは増えない）。`NOAH_ASK_LIMITS` の項目と、契約の SQL（`docs/contracts/noah-listing-v1.sql`）は変えていない。Turnstile は作っていない（本人の判断）。
- D7: `components/sky-service-help.module.css` に `.page > a, .page section > a { display: inline-flex; align-items: center; min-height: 44px; }`。文の中のリンクは、文の行の高さのまま。
- D8: 2 つとも `noahSignInHref`（ChatGPT のサインイン。元の画面へ戻る）にした。
- docs: task 129（D2・D7・D8 の行）、00-index の 129 の行（D12 は 2026-11-26 に済み、と合わせた）、spec-97 の `NOAH_ASK_LIMITS` の行、ux-audit の S2 の行、CHANGELOG。

## 確かめた事

- 新しい試験 3 本。どれも、直す前は落ちて、直した後は通る。
  - `tests/noah-ask-host-share.test.mjs`: 本人の上限を 40 にして、1 人が 30 回送ると 10 回目までが通り、残りの 20 回は 429（Work も行も作らず、相手へも送らない）。その後、別の人が通る。60 秒たてば同じ人もまた通る。
  - `tests/noah-help-tap.test.mjs`: 2 つのリンクの規則と、2 つが規則の当たる場所にある事。
  - `tests/noah-signin-destination.test.mjs`: `components/noah*.tsx` と `app/noah` の「サインイン」「ログイン」と書いた全部のリンクが、`/noah/account` へ行かず、ChatGPT のサインインへ行く。
- 既存の試験は変えていない。関係する 22 本（208 件）が通る: noah-form・noah-ask・noah-launch-ops（`NOAH_ASK_LIMITS` の 8 項目の固定）・noah-probe（契約の SQL と 1 字ずつ同じ）・noah-connect・noah-first-earning・noah-ready-ui・noah-standalone など。
- `npm test`（全部、5,689 件）: 手元（Node 22.23）では 5,651 件が通り、4 件は今までどおり飛ばし、34 件が落ちた。34 件は、同じ手元で触っていない main（`7337b003`）でも同じ 34 件が落ちる（7 file: migration-aliases 24・mcp-connector 3・mcp 2・noah-operation-packs 2・mr-pc-adapter 1・noah-mac-runner 1・undici-dependency-security 1）。理由は手元の Node 22 に `node:sqlite` の authorizer・serialize が無い事（「Secure SQLite authorizer/serialize/deserialize APIs are required」）と、子の process・入っている undici の版。CI は Node 26.12.1 で動くので、この PR の CI で確かめる。
- `npm run typecheck`・`npm run lint:product`: 通る。
- private / project / repository / noah:screenless / version / design / release / baseline の check: 通る。

## 次の事

- マージした後、main から avoado.si を 1 回出す（AGENTS.md の 8 の確かめ。本番 D1 の migration は無し）。本番で `/noah/help` の小さい押す所 0、「初回の売上」「参加型計算」のサインインが `/signin-with-chatgpt?return_to=…` へ行く事を確かめる。
- 本番の確かめの道具をリポジトリの道具にする（両方の幅・サインインの有無・全部の画面）。次の PR。

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01JzDjJ2sHXBQS8oDJ7NBhAu
