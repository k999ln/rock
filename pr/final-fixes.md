task 129 の残りのうち、本人の答えが要らない物（D2・D7・D8）と、本番の確かめの道具。本人の頼み（2026-11-27 15:58）「このチャットでやった事を全部改良して、世に出せる最終版にして」の 1 つ目の区切り。commit は 2 つ（`d2b2eb55`・`0572070e`）。

## わかった事

- **D2**（抜け道 S2）: 1 つの相手への依頼は、全員合わせて 1 分 30 回（`hostPerMinute`）。1 人は 1 分 10 回（`perMinute`）なので、今は 3 分の 1 までしか使えない。ただ、この 3 分の 1 は「本人の 1 分の上限がたまたま 10」だから成り立っていて、`NOAH_ASK_LIMITS` の JSON で `perMinute` を上げると、1 人で相手の枠を使い切れる（ほかの人は「今こんでいます」になる）。
- **D7**: 本番の avoado.si（2026-11-27）の 74 画面（`app/noah` の画面と星座名の URL。利用開始の `/noah/account` を含む。審査者の画面は除く）を、390px と 1280px、ブラウザだけの本人の有無で測った。はみ出しは 0。小さい押す所は、390px で 37 画面・219 個、1280px で 47 画面・196 個。前の歩き（10 画面）は、チェックボックスの行・開く印・選ぶ欄を数えていなかった。
- **D8**: #91 の後に入った 2 つのリンクが、まだ `/noah/account` へ行っていた。`components/noah-first-earning.tsx` の「サインイン」（#101）と、`components/noah-shared-compute.tsx` の「ログインする」（#121）。どちらの API もブラウザだけの本人に 401 を返すので、先へ進めなかった。
- 本番の画面では、Agent の詳細の「接続」は Noah のアカウント（パスキー・ログイン）が要る（ブラウザだけの本人は利用開始の画面へ進む）。一方、API（`POST /api/noah/connect`）は、ブラウザだけの本人でもつなげる。画面と API で決まりが違う（本人の判断。下の「次の事」）。

## やった事

- **D2**: 1 人が 1 つの相手へ直近 60 秒に頼めるのは、相手の枠の 3 分の 1（切り捨て、最低 1 回）まで。`lib/noah-limits.ts` の `noahAskOwnerHostLimit`、`lib/noah-form.ts` の `noahAskGate` に 5 つ目の数（渡した時だけ見る。`code: 'share'`、文「同じ Agent へ続けて頼みすぎています。少し待ってから試してください。」）、`lib/noah-ask.ts` で数える（本人の 1 分の上限の方が小さいか同じ時は数えない。既定の数では問い合わせは増えない）。`NOAH_ASK_LIMITS` の項目と契約の SQL は変えていない（既存の試験が固定している）。Turnstile は作っていない（本人の判断）。
- **D7**: Noah の殻の中身の箱（`components/noah-service-shell.module.css` の `.content`・`.gridBody`）に、全部の画面で同じ下限を掛けた（ボタン・選ぶ欄・開く印・タブ・リンク・チェックボックスの行を 44px 以上。詳しさ 0 の `:where` なので、各画面の CSS が書いた表示・幅はそのまま。文の中の class の無いリンクと、`hidden` の付いた物は変えない）。各画面が 30〜43px と書いていた所は 44px にした（`noah-pins`・`noah-mac-handoff`・`sky-tool-workspace`・`sky-mcp-center`・`sky-library`・`sky-commerce`・`sky-application`・`sky-output-center`・`rockstar-account`）。全体の CSS の部品（`.rock-button`・`.studio-*`・`.sky-*`）は、Noah の画面の中だけ 44px にした（ほかのサイトの画面は変えない）。`/noah/help` の 2 つは、その画面の CSS でも直した。
- **D8**: 2 つとも `noahSignInHref`（ChatGPT のサインイン。元の画面へ戻る）にした。
- **本番の確かめの道具**: `npm run noah:prod:check -- <origin> [--write] [--out=<dir>]`（`scripts/noah-prod-check.mjs`）。`pages`（全部の画面を 2 つの幅 × 本人の有無で測る）・`devices`（Mac と Linux の PC でメニューが同じか）・API の probe（既存の `scripts/noah-public-probe.mjs`）。`--write` で `accept`（ブラウザだけの本人で、つなぐ → 読むだけの道具を 1 回頼む → 切る、ボード、登録情報。作った物は途中で落ちても消す）と `loop`（一周のうちアカウントの要らない行）。測る規則は `scripts/noah-page-measure.mjs`（本人の端末のブラウザでも同じ関数を実行できる）。AGENTS.md の 8 に「公開の後に動かす」を足した。
- docs: task 129（D2・D7・D8・道具の行）、00-index の 129 の行（D12 は 2026-11-26 に済み、と合わせた）、spec-97 の `NOAH_ASK_LIMITS` の行、ux-audit の S2 の行、CHANGELOG（印 `FINALFIX`）。

## 確かめた事

- 新しい試験 5 本。D2・D7（/noah/help）・D8 の 3 本は、直す前は落ちて、直した後は通る。
  - `tests/noah-ask-host-share.test.mjs`: 本人の上限を 40 にして、1 人が 30 回送ると 10 回目までが通り、残りの 20 回は 429（Work も行も作らず、相手へも送らない）。その後、別の人が通る。60 秒たてば同じ人もまた通る。
  - `tests/noah-help-tap.test.mjs`・`tests/noah-tap-floor.test.mjs`: 下限の規則と、利用開始の画面の 44px。
  - `tests/noah-signin-destination.test.mjs`: `components/noah*.tsx` と `app/noah` の「サインイン」「ログイン」と書いた全部のリンクが、`/noah/account` へ行かず、ChatGPT のサインインへ行く。
  - `tests/noah-prod-check.test.mjs`: 画面の一覧（全部の画面と星座名の URL、値の要る画面と審査者の画面は除く）と、書き込む確かめは `--write` 無しでは動かない事。
- 既存の試験は変えていない。関係する 144 file（1,196 件）: 1,195 件が通り、1 件は今までどおり飛ばし、落ちた物は 0（noah-*・sky-*・rockstar-account・common-os-entry など。`NOAH_ASK_LIMITS` の 8 項目の固定と、契約の SQL の 1 字ずつの一致も通る）。
- `npm test`（全部、5,689 件。1 つ目の commit の時）: 手元（Node 22.23）では 5,651 件が通り、4 件は今までどおり飛ばし、34 件が落ちた。34 件は、同じ手元で触っていない main（`7337b003`）でも同じ 34 件が落ちる（7 file: migration-aliases 24・mcp-connector 3・mcp 2・noah-operation-packs 2・mr-pc-adapter 1・noah-mac-runner 1・undici-dependency-security 1）。理由は手元の Node 22 に `node:sqlite` の authorizer・serialize が無い事（「Secure SQLite authorizer/serialize/deserialize APIs are required」）と、子の process・入っている undici の版。CI は Node 26.12.1 で動くので、この PR の CI で確かめる。
- `npm run build`・`npm run typecheck`・`npm run lint:product`・release:web-bundle / release:web-assets / private / project / repository / noah:screenless / version / design / release / baseline の check: 通る。build した CSS に下限の規則が入っている事も確かめた。
- 本番で（今の公開の版。この PR の前）:
  - 直した CSS を本番の画面に足して測る: 74 画面 × 2 つの幅で、小さい押す所 0・はみ出し 0（利用開始の画面は、ログインと新規登録を開いた形も）。見た目は、前と後の写真を並べて見た（押す所が少し高くなるだけ）。
  - `accept --write`: 20 項目が通る（日本語で探す 3 つ・押すだけの候補 6・つなぐ → 道具 → 頼む → 成果（DJZS Trust MCP の `query_pol_certificates`、791 字）→ 切る・ボードを作って消す・登録情報に試験の名前を入れて消す）。1 つ目の候補（dotsy の `get_plan`）は相手の道具が失敗したので、2 つ目で確かめた。
  - `loop --write`: 1 行目（最初の画面）は通る。8 行目の前半（サインインしていない人が「接続」→ 利用開始の画面にパスキーとログイン、元の画面へ戻る行き先）は通るが、利用開始の画面に小さい押す所が 3 つあった（この PR で直した）。
  - `devices`: Mac と Linux の PC で、メニューの行き先 10 個が同じ（Mac だけのメニューは、共通メニューにまとめた時に無くなっている）。

## 次の事

- マージした後、main から avoado.si を 1 回出す（AGENTS.md の 8 の確かめ。本番 D1 の migration は無し）。本番で `npm run noah:prod:check -- https://avoado.si --write` を動かし、小さい押す所 0・はみ出し 0・受入と一周の行を確かめる（Claude が動かす）。
- 本人の端末で: 一周の 2〜7・10（アカウントが要る）、8 の後半（パスキーで登録して戻る）、11〜13。
- 本人の判断: 画面は「接続」にアカウントが要るが、API はブラウザだけの本人でもつなげる。どちらに合わせるか。D2 の Turnstile を作るか。

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01JzDjJ2sHXBQS8oDJ7NBhAu
