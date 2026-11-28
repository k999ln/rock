ホームのカードの保存と「…」が、絵の中の題を隠さないようにする。ホームの見つかった物（GitHub など）の詳細も、カードと同じ日本語の 1 行を頭に出す。公式の製品を名乗る、作者の違うインストーラーを紹介から外す。本人指示（2026-11-28 17:03）「全部任せるから現時点でできてないこと全部実装までやって」「今日ローンチするから大事なことから細部までよろしく」。

## わかった事

- PR #131 の公開の後に本番のホームを 390px・1280px で見ると、ほぼ全部のカードで、丸い「…」と「保存」が絵の上に出たままで、絵の中の題（例: 「Enzo's」の「Enz」）を隠していた。
- 2026-11-25 の本人の決定「乗せた時だけ出す」（PC はマウスを乗せた時だけ絵の上に、スマホは絵に何も重ねず「…」から。spec-115 の 9 章）は、題名だけのカード（`pin` か動画があるカード）にしか効いていなかった。今の本番のホームの最初の 20 枚には題名だけのカードが無く、説明付きのカード 16 枚と、Noah の外のカード 4 枚。説明付きのカードは、11-25 より前の作り（保存はいつも絵の右上、「…」はログインした人だけ絵の左上）のままだった。
- ホームの「すべて」に 5 枚に 1 枚入る見つかった物（GitHub など）は、PR #131 でカードが日本語の 1 行になったが、押した先の詳細（`/noah/discover/agent?id=project-…`）の頭には、韓国語・中国語・英語の元の説明が出ていた。本番の答え（`/api/noah/discover/project`）には、もう `summaryJa` がある。
- 本番のホームの 145 枚目に、作者の違う「claude-code-cli-windows-native-installer」（「Claude Code CLI Windows Native Installer — Anthropic Agentic Terminal, MCP Server & Git」）が出ていた。公式の配り方（npm・公式のサイト）でない「インストーラー」は、偽物を配ってマルウェアを入れさせる型としてよく使われる。この repo は同じ日のうちに GitHub から読めなくなった（clone が認証を求める）。紹介から外す決まり（成人向け・利用規約をすり抜ける道具）には当たらなかった。

## やった事

- `components/noah-agent-pin.tsx`: `NoahAgentPin` に `menu` を足した（`data-menu`。題名だけのカードは今までどおり付く）。
- `components/noah-pin-grid.tsx`: ホームと検索の並びの全部のカード（Noah の外のカードを除く）で、題名だけのカードと同じ組を出す: 絵の上の保存、「…」の中のスマホの保存と、ログインした人の「表示しない」。説明付きのカードの説明・提供元の行・評価はそのまま。
- `components/noah-agent-pin.module.css`: 決まりを `.card[data-plain]` から `.card[data-menu]` に広げた。PC はマウスを乗せた時かキーで選んだ時だけ絵の上に出す（「…」はログインした人の「表示しない」がある時だけ）。スマホは保存を隠し、「…」はカードの右下。説明付きのカードの下の行（提供元 · 状態）は「…」の点の分だけ空け、語の途中で折り返さない（「スマホで今すぐ」の「ぐ」だけが次の行に落ちていた）。
- `components/noah-project-detail.tsx`: 日本語の画面で `summaryJa` がある時は、頭に日本語の 1 行。提供者が書いた元の説明は「自動翻訳 · 原文」で読める（spec-74。Agent の詳細と同じ部品）。本文に同じ元の文をもう 1 回は出さない。頭の絵は、カードと同じく元の説明で場面を選び、絵の中の字だけを日本語にする。
- `lib/noah-collection.ts`: `NOAH_COLLECTION_IMPERSONATION`（Claude・Claude Code・Anthropic・ChatGPT・OpenAI・Codex・Cursor・Copilot・Gemini の名の直後の「(OS の名) (native) installer」）。`noahCollectionBlocked` が使うので、ホームの一覧・紹介の API・収集機の公開で同じく外れる。自分の物を入れる道具（`@sellable/install`）・道具の追加の手伝い（plugin installer）・自分のアプリのインストーラーを作る道具は外さない。
- docs: CHANGELOG（印 `FINALMENU`）、spec-115 の 9 章、task 128 の 9.9、`docs/services/noah-agent-collection.md`、07（任された判断の (5)〜(7)）、00-index の 128 と 131 の行（印 `FINALMENU`）。

## 確かめた事

- 新しい試験 `tests/noah-card-menu.test.mjs`（2 本）: 説明付き・題名だけ・外のカードを、サインインの有無で並べ、説明付きと題名だけのカードは同じ組（絵の上の保存 1・「…」1・「…」の中のスマホの保存 1・「表示しない」はログインした人だけ）、外のカードには無い、評価は説明付きのカードだけ。カードの `data-menu` と、CSS の PC（乗せた時だけ）・スマホ（保存を隠す・右下の「…」・下の行を空ける）の決まり。
- 新しい試験 `tests/noah-project-detail-ja.test.mjs`（2 本。1 本目は直す前の画面で落ちる）: 日本語の 1 行が頭に 1 回、元の説明は「原文」の中に 1 回だけ、絵はカードと同じ（場面は元の説明・字は日本語）。日本語の 1 行が無い物・日本語以外の画面・訳が元と同じ時は今までどおり。
- 新しい試験 `tests/noah-collection-impersonation.test.mjs`（3 本）: 外す例 6 個、外さない例 6 個、掲載中の 212 系列は外れない。本番のホームの最初の 1,200 枚で当たるのは 145 枚目の 1 件だけ（手元で今日の一覧に当てた）。
- 全部の試験 `npm test`（`b260779f`）: 5,759 件のうち 5,721 通る・落ちる 34・飛ばす 4。落ちる 34 は main でも落ちる 7 ファイル（migration-aliases 24・mcp-connector 3・mcp 2・noah-operation-packs 2・mr-pc-adapter 1・noah-mac-runner 1・undici-dependency-security 1）で、名前も PR #131 の時と同じ。足した試験 7 本は通る。
- `npm run build`・`typecheck`・`lint:product`・private・project・repository・noah:screenless・version・release・design・baseline・release:web-bundle・release:web-assets: 通る。gitleaks: 2 commit で 0 件。
- 手元の本番の組み立て（`wrangler` で `dist/server`）に、今日の本番のホームの一覧（20 枚）を返して、iPhone 15 Pro（指で触る端末）と 1280px（マウス）、サインインの有無の 4 通りで開いた:
  - 押していない時に絵の上に出ている保存・「…」: 0（4 通りとも）。Noah の外の 4 枚以外は全部 `data-menu`。
  - スマホ: 「…」は 16 枚の右下。点が字に重なるカード 0（2 行で切る説明の隠れた行は数えない）。押すと、画面の中に「保存」（ログインした人は「表示しない」も）。「保存」で保存の画面が開く。
  - PC: カードに乗せると保存が絵の右上に出る（ログインした人は「…」も左上に）。
  - はみ出し 0・44px より小さい押す所 0・誤り 0（4 通りとも）。
- 見つかった物の詳細（本番の open-receipt の答え）を iPhone 15 Pro と 1280px で: 頭が日本語の 1 行、「自動翻訳 · 原文」を開くと元の韓国語、閉じている時に元の文は出ない。はみ出し 0・小さい押す所 0・誤り 0。

## 次の事

- マージした後、main から avoado.si を 1 回出す（D1 の migration は無し）。本番のホームで、スマホの絵の上に保存と「…」が無い事、PC で乗せると出る事、見つかった物の詳細の頭が日本語な事を、Claude が確かめる。

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01JzDjJ2sHXBQS8oDJ7NBhAu
