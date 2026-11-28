# 引き継ぎ 2: 9 本の枝を iceiceice999/rock に入れて、avoado.si を公開し直す（2026-11-23）

## 2026-11-28｜Sites v268 の全画面測定

2026-11-28 JST（Codex）。Sites v268 の全75経路を未サインインの Chrome で390px・1280pxとも再測定。それぞれ200が67経路、所定の公開終了410が8経路。44px未満0、横あふれ0、ページ例外0。MacとLinuxのメニューは各11件、差分0。書き込み受入の実行は自動承認レビューが拒否。明示許可、実サインイン、実機の一周が残る。

## 2026-11-28｜Sites v268 の公開

2026-11-28 JST（Codex）。https://github.com/iceiceice999/rock/pull/127 の8チェック、https://github.com/iceiceice999/rock/pull/126 の7チェックが合格。main 1bf5d961bf9d35a67d7d4c7718f090056855580c から Sites v268 を avoado.si に公開。Sites ソース 248c1ccf68ce6670f1c11bab75ee19b1337447e1 と main の tree 96237972bc64a66953a4640071645fe5d44f4503 は一致。復旧先は v267。体調ノートは390px・1280pxで保存、再読込、週次表示、JSON書き出し、削除に成功。Cloudflare OAuth、本番の書き込み受入の明示許可、実サインインと物理スマホ受入が残る。

## 2026-11-28｜Codex の引き継ぎ

2026-11-28 JST（Codex）。署名付きの実装差分を転送し、https://github.com/iceiceice999/rock/pull/127 と https://github.com/iceiceice999/rock/pull/126 を作成。CodeQL が見つけた新規サインイン試験のタグ除去を JSX 構文木方式に修正。関連試験12件とD6・体調ノートの19件が合格。CI・マージ・公開の確認中。Tool札用0060は合成SQLiteで1表・19列・索引1つを確認。本番SQLは未実行。

本人（ノエル）の言葉:

- 2026-11-22 22:55 ごろ「push・PR・マージまで」（iceiceice999/rock への push・PR・マージを許可）。
- 2026-11-23 21:43「好きにしていいよ／だから早く完成品世に出したい」。

安全の直し（React 19.2.9）は、Codex が PR #36 で入れた（main `35afadfc`）。ここに書くのは、その後の 9 本。

Claude のセッションには k999ln/rock（旧リポジトリ）が付いていて、同じ名前の iceiceice999/rock は付けられない。だから枝は旧リポジトリの `claude/ice2/*` に置いた。k999ln/rock は public なので、付けなくても読める。

## 枝

| 順 | 旧リポジトリの置き場所 | commit | PR の題 | CHANGELOG の仮の印 | PR の本文 |
|---|---|---|---|---|---|
| 1 | `claude/ice2/noah-collector-steady` | `d5dcc8f78c322bdf119f063f03989fe2f02aea3a` | fix(noah): 1 回きりの出所の失敗で、収集の実行全体を落とさない | `COLLECT` | `pr/collector.md` |
| 2 | `claude/ice2/noah-board-picks` | `e8c52a2e22b34998042bb0eb0eaaa63e96ce8296` | feat(noah): ボードに「このボードに合う Agent」を出す | `BOARDPICK` | `pr/boardpicks.md` |
| 3 | `claude/ice2/design-references` | `a3a2fca6ee6ec5a377fef63a611911f27885d0bf` | docs(design): Noah のデザイン参照ライブラリと、画面を作る時の決まり | `REFLIB` | `pr/reflib.md` |
| 4 | `claude/ice2/noah-ux-audit` | `6146e310145d4ea99416e02d5ac4fc60910eefdb` | fix(noah): 知らない人の目で一周して、日本語の検索・Agent の追加・保存の画面・小さい押す所を直す（task 128） | `UXAUDIT` | `pr/ux.md` |
| 5 | `claude/ice2/noah-launch` | `2ce2d5b1b578`（23:10 に main `f285200f`＝PR #37 を merge して進めた） | fix(noah): 世に出す前の決めと直し（Q1〜Q5・task 128 の D3） | `LAUNCH`（と、本文の `UXAUDIT`） | `pr/launch.md` |
| 6 | `claude/ice2/noah-quota` | `f239bda2b870`（同じく進めた） | fix(noah): ブラウザだけの本人を、全員まとめた 1 日の上限で抑える（抜け道 S1・task 128 の D1） | `QUOTA` | `pr/quota.md` |
| 7 | `claude/ice2/noah-taps` | `c8ba8b5ae271` | fix(noah): 残っていた小さい押す所を 44px にする（task 128 の D7） | `TAPS` | `pr/taps.md` |
| 8 | `claude/ice2/noah-search-words` | `183c31fba346` | fix(noah): 日本語の検索で 0 件だった、よく頼まれる仕事の語 15 個を足す（task 128 の D11） | `SEARCHWORDS` | `pr/search-words.md` |
| 9 | `claude/ice2/noah-store-taps` | `6d5d24e21c7f` | fix(noah): Agent Store の行と詳細の小さい押す所を 44px にする（task 128 の D7） | `STORETAPS` | `pr/store-taps.md` |

1〜4 は main `9cb7f5d1`（#32）を merge 済み。5 は 4 の上の 2 commit（2 つ目は、1 つ目で 404 にした `/noah/billing` を、既存の試験に合わせて元に戻した物）、6 は 5 の上の 1 commit なので、4 → 5 → 6 の順にマージする。どれも SSH の署名つき、作者は `noellesugar99 <noellesugar99@users.noreply.github.com>`、committer は Claude。

main は 23:0x に PR #37（Agent Store）が入って `f285200f` になった。5〜7 は、それを merge 済み（ぶつかった所は Claude が解いた。応答の見出しの確かめも測り直した）。1〜3 はぶつからない。4 は `CHANGELOG.md` だけがぶつかる（`tools/merge-changelog.py` で両方の行を残せる）。どの枝も migration を足していない（`drizzle/` を触っていない）。

## 最終版の計画（11-27 16:20。これが最新）

**今の状態（11-28 19:35 JST）**: PR #131 は Sites v270 で公開済み（main `a2539a4c`）。本番の確かめ（Claude・読むだけ）: ホームの日本語 20/20・96/100・378/400、外す 3 件は出ない、Discond の頭と道具 4/4 が日本語、`noah:prod:check all` は 300 回の読み込みで、はみ出し 0・小さい押す所 0・誤り 0。次の枝 `claude/ice2/noah-card-menu` = `b260779f`（main `a2539a4c` の上に 3 commit: `904ae1b0` ホームのカードの保存と「…」を 11-25 の決定どおり全部のカードで乗せた時だけ／スマホは右下の「…」に〔説明付きのカードで絵の中の題を隠していた〕・`86880a9f` 見つかった物の詳細の頭も日本語の 1 行〔元の説明は「自動翻訳 · 原文」〕・`b260779f` 公式を名乗る作者の違うインストーラーを紹介から外す〔ホームの 145 枚目〕）。PR の本文は `pr/card-menu.md`、印は `FINALMENU`。全部の試験は 5,759 件・落ちる 34（main と同じ名前）。19:44 に Codex（窓 111）へ送れた（19:40 は Mac の空きが 531MB で送れず、ノエルに頼んだ）。次: Codex の PR・印・マージ・公開 → 本番で確かめる。

**今の状態（11-28 18:52 JST）**: Codex が PR #131（`codex/noah-launch-ja-20261128` = `1aab806d` ＋ 印の commit `ffdbc3ad`。FINALJA は残っていない）を作り、18:49 にマージした（main `a2539a4c`、tree `94aa0ecf` は PR の枝と同じ。5 commit とも main にある）。Sites への公開を待っている（18:52 の本番はまだ前の版）。

**今の状態（11-28 18:35 JST）**: 18:34 に Codex（窓 111）へ送れた（Mac の空きが戻った）。頼んだのは `1aab806d`（5 commit）の PR・印・マージ・main から 1 回公開。全部の試験は 5,752 件・落ちる 34（main と同じ）。公開の後に `launch/prodja.mjs`（説明・道具・見つかった物の日本語、外す物、共有のカード）と `noah:prod:check` で確かめる（公開前の本番: ホームの最初の 100 枚のうち日本語 1 枚）。

**今の状態（11-28 18:25 JST）**: 枝 `claude/ice2/noah-launch-ja` = `1aab806d`（5 commit。4 つ目までに足して、ホームの見つかった物の説明 207 件の日本語と、外す語〔ゲームの不正の実行器・定額の契約を API に変える中継〕）。今日の並びで、ホームの最初の 100 枚のうち 98 枚が日本語。Codex への頼みは `1aab806d` に直してから送る（Mac の空きはまだ 0。18:14 に送って ENOSPC）。全部の試験を `1aab806d` で走らせている。

**今の状態（11-28 18:15 JST）**: 枝 `claude/ice2/noah-launch-ja` = `40b81759`（main `a607a97b` の上に 4 commit: `bb069a0a` Agent の説明・`9f87a244` D13 の確かめ・`d2b84aa7` 「こんな事を頼めます」の道具の説明 779 件・`40b81759` 試用のリセットなど利用規約をすり抜ける道具を紹介に出さない。本番のホームの 59 枚目にあった）。全部の試験は 5,747 件・落ちる 34（main と同じ）、build・checks・lint は通る。PR の本文 `pr/launch-ja.md`。Mac の空きが 0 で Codex が送れない（17:52「ENOSPC: no space left on device」）。ノエルに空けてもらうよう頼んだ（17:53）。頼む文は Codex の入力欄に入っている（SHA を 40b81759 に直してから送る）。本番の体調ノートを一周した（記録・書き出し・全部消す。サーバーへ記録は送られない。はみ出し 0）。

**今の状態（11-28 17:50 JST）**: 本人 17:03「全部任せるから現時点でできてないこと全部実装までやって／埋めるだけじゃ意味ないよ／世界一になる企業としてほこりをもって／今日ローンチするから大事なことから細部までよろしく」。1 本目: 掲載中の Agent の説明を日本語で出す枝 `claude/ice2/noah-launch-ja` = `9f87a244`（main `a607a97b` の上に署名ありの commit 2 つ: `bb069a0a` 212 系列の日本語の 1 行・カードと絵の字・詳細の頭と「自動翻訳 · 原文」・共有のカード、`9f87a244` D13 は移し済みの確かめ）。CHANGELOG と 00-index の印は `FINALJA`。PR の本文は `pr/launch-ja.md`。全部の試験・build・checks は通る（落ちる 34 は main と同じ）。手元の本番の build で 390px・1280px とも、はみ出し 0・小さい押す所 0・誤り 0。次: Codex に PR・印・マージ・main から 1 回公開を頼む → 本番で確かめる。2 本目（作っている）: 「こんな事を頼めます」の道具の説明（掲載中の系列の最初の 4 つ、779 件）の日本語。D13 は、main の 7ae9a04d・98904606 が #421・#425 と同じ中身で、もう済んでいた。

**今の状態（11-28 13:15 JST）**: Agent の詳細の作り直しは公開済み。Codex が PR #130（`27833c6f` ＋ 印の commit `4c74e787`）を作り、CI 7 件が通ってマージ（main `a607a97b`）、Sites v269 で avoado.si に出した。本番の確かめ（Claude）: `noah:prod:check` で 75 経路 × 2 幅 × 本人の有無が、はみ出し 0・小さい押す所 0・画面の誤り 0。詳細の 3 つ（Find and book a local service pro・Discond・AthenaHQ）で「こんな事を頼めます」・短い「要る情報」・最初から開いた「操作の流れと道具」・使い方・安全が出る。道具の一覧が出る Agent は 212 件中 158 → 188。残り 24 件のうち 18 件は、本番の巡回が次に相手を確かめると出る見込み（11-29 に数え直す）。D6 の 9 件と、ノエルの番の一覧はそのまま。

**今の状態（11-28 10:45 JST）**: Agent の詳細の作り直しは枝 `claude/ice2/noah-detail-plain` = `27833c6f`（main `1bf5d961` の上に署名ありの commit 4 つ: `a0a2f90f` 最初から開く・`b4667e5e` 大手のストアの並び・`e6ac8d44` D6 の確かめ直し・`27833c6f` 道具の写しの取り直し）。本番の 212 系列のうち 54 系列で「こんな事を頼めます」が出ていなかった（同梱の道具の写しが本番と合わない）ので、取り直す道具 `scripts/noah-tool-catalog-refresh.mjs` を作り、39 系列の写しを足した（写しは系列ごとに 2 つまで）。本文は `pr/detail-plain.md`（印 `FINALOPEN`・`FINALPLAIN`）。Codex への頼み（`scratchpad/codex-plain.txt`）は 27833c6f に直した。Mac がつながっていない（8:00・10:00 に確かめた）ので、まだ送っていない。次の確かめは 12:00（その後 2 時間おき、22:00 まで）。公開の後、本番で道具の一覧が出る系列の数を数え直す（前は 158）。

**今の状態（11-28 01:35 JST）**: Codex の「Fix Noah help and D2 issues」（ノエルのチャット。「これやる」）が、区切り 1 を PR #127（`0572070e`）、区切り 2 を PR #126（`5061fa04` ＋ 印の commit `5c528ca4`）にして CI を回している。Sites で公開する予定。だから追記18・19 は送っていない（二重になる）。Mac の空きが約 177 MiB で、Codex の全体のチェックアウトが止まった。12 問の 1・2（お金・定期便）は、別の PR #125 にノエルの答えがある（定期便の物は受け取る人が払わない・初回の体験を超えたら eSIM 月 800 円・中身はおまかせ）。

**ノエルの番（11-28 00:15 の時点。最後の報告でも同じ一覧を渡す）**
1. 12 問の答え（下の「本人に聞いた事」。答えが無い間は既定で進めている）。
2. Cloudflare のログイン（Mac の Codex で）: 本番 D1 に 0060（許可済み・Codex が手順と戻し方を確かめて当てる）、無料 Worker の配り直し、別のスレッドの 0044・0061。
3. Workers Paid（$5/月）: Claude が申込の画面の押す直前まで開く（Mac がつながってから）。押すのはノエル。
4. 実機の一周（spec-90 の 5 章）: 2〜7・8 の後半（パスキーで登録して戻る）・9（D6 で握手が通らなかった Agent を使う）・10〜13。スマホの幅で。
5. D6: 2 回続けて握手が通らなかった Agent を、審査者として `/noah/review/intake` で外すか、巡回に任せるか（11-28 05:25 の確かめ直しの後に一覧を渡す）。
6. 画面の「接続」はアカウントが要るのに、API はブラウザだけの本人でもつなげる。どちらに合わせるか。
7. 14 日の試しのアカウント（費用 0 円の物から）: 既定は SUZURI（メール・振込先）＋ Instagram のプロアカウント（メール・電話）。ほかの候補はココナラ（メール・電話・本人確認・振込先）、LINE Creators Market（メール・振込先）。作るのと本人確認はノエル。
8. 体調ノートの目的・窓口・名前（今は既定）。

**今の状態（11-27 23:55 JST）**: 区切り 2 の枝 `claude/ice2/noah-final-d6` = `3121b434`（区切り 1 の `0572070e` の上に署名ありの commit 2 つ）: D6（本番の「まだ誰も動かしていない」167 件を 1 件ずつ確かめた。動く 73・鍵が要る 23・入力が要る 24・混雑 1・読み取りだけの道具が無い 37・握手が通らない 9。表は `docs/noah/d6-unverified-agents-20261127.md`。外したのは 0）と、目的型の Agent「体調ノート」（`/noah/goals/health`、無料。記録は端末だけ。task 142）。公開の画面の一覧（`services/sky-web/main-page-policy.mjs`）に入れないと avoado.si で 404 になる事を見つけて直した（試験 `tests/noah-menu-served.test.mjs`）。web security の手元の実測も取り直した（リポジトリの決まりの Wrangler 4.147 なら、手元でも本番の build を動かせる: `node scripts/local-wrangler.mjs --config dist/server/wrangler.json --port 8811 --ip 127.0.0.1 --persist-to <Git の外>`）。本文は `pr/final-d6.md`（印 `FINALD6`）。
次: Mac がまだつながらない（23:23 に確かめた）。つながったら Codex に追記18（区切り 1）→ 追記19（区切り 2）。11-28 05:25 に、握手が通らなかった 9 件を `--ids` で確かめ直す（scheduled task。2 回続けて通らない物を外す候補にする）。

**今の状態（11-27 22:40 JST）**: 区切り 1 の枝 `claude/ice2/noah-final-fixes` = `0572070e`（署名ありの commit 2 つ、main `7337b003` の上）: D2（1 人の分は相手の枠の 3 分の 1）・D7（全部の画面の 44px。本番の 74 画面 × 390px・1280px。直した CSS を本番の画面に足すと小さい押す所 0）・D8（サインインの行き先 2 つ）・本番の確かめの道具（`npm run noah:prod:check`）。本文は `pr/final-fixes.md`（CHANGELOG と 00-index の印 `FINALFIX`）。確かめは `notes/2026-11-22/tests.json` の最後の 7 行。
次: Codex（追記18）に PR・印・マージ・main から 1 回公開を頼む（Mac がつながっていない間は送れない。21:45 ごろはノエルが Codex を使っていた）→ 公開の後、`npm run noah:prod:check -- https://avoado.si --write` で本番を確かめる。12 問の答えはまだ無い（既定で進める）。
見つけた事（本人の判断）: 画面の「接続」は Noah のアカウントが要るが、API はブラウザだけの本人でもつなげる。

本人の頼み（2026-11-27 15:58。本文は `notes/2026-11-27-request.txt`。要約は notes/2026-11-22/progress.txt の同じ日）: このチャットでやった事を全部改良して、世に出せる最終版にする。最後まで止まらずに。先に許された事: 本番 D1 に 0060（Codex 経由・手順と戻し方を確かめてから）／D6 の 165 件で外の道具を呼ぶ／Workers Paid は申込の直前まで（押すのは本人）／試行（NOAH_TRIAL_OPEN）を開く／稼ぐ設計図の 14 日の試しを費用 0 円の物から（アカウントと本人確認は本人）／目的型（ヘルスケア）の Agent を無料で 1 つ作って出す。

今の状態（16:00）: main `7337b003`（11-24 から別のスレッドの PR #61〜#122 が入った）。開いている PR は #29・#63・#112・#123（どれも別のスレッド）。本番は公開第 258 版より後（CHANGELOG）。本番の歩き（390px・10 画面）: はみ出し 0、小さい押す所は /noah/help の 2 つだけ。試行は閉（`/api/noah/trial?me=1` が 404）。

### 一覧（項目・今の状態・足りない物・終わったと確かめる方法・誰の番）

| 項目 | 今の状態 | 足りない物 | 終わったと確かめる方法 | 番 |
| --- | --- | --- | --- | --- |
| D1・D3・D4・D9・D10・D11 | 済み（PR #43 ほか） | — | 本番の確かめ（下の道具） | — |
| D7 44px（全部の画面） | 済み（区切り 1。74 画面 × 390px・1280px で、直した CSS を本番の画面に足すと小さい押す所 0） | 公開の後に本番で測り直す | 両方の幅で小さい押す所 0（道具の結果） | Claude |
| D8 サインインの行き先 | 済み（区切り 1。初回の売上と参加型計算の 2 つ） | — | `/noah/account` へ行く「サインイン」が無い試験 | — |
| D2 1 人で相手の枠を使い切れない | 済み（区切り 1。1 人の分は相手の枠の 3 分の 1） | Turnstile は本人の判断 | 1 人が 30 回送った後も別の人が通る試験 | 本人（Turnstile） |
| D5 本番の一周（1〜13） | 未 | 自動でできる行。実機の行（8・9・11〜13） | 13 行の表 | Claude（実機は本人） |
| D6 未確認の 165 件 | 済み（区切り 2。167 件の表、動く 73。外したのは 0） | 握手が通らない 9 件を 6 時間あけて確かめ直す（11-28 05:25）。外すのは審査者か巡回 | 167 件の表と外した数 | Claude（外すのは本人＝審査者） |
| D12 repository-map | 別のスレッドで済み | — | — | — |
| D13 旧リポジトリにだけある #421・#425 | 済み（main の 7ae9a04d・98904606 が同じ中身。11-28 に確かめた。task 129 の D13） | — | — | — |
| 無料のクラウド（neuron） | コードは main（#44）。無料 Worker は古い版のまま（/health に版が無い） | 配り直し（Cloudflare の承認は本人） | 配った後、1 件の仕事で使った量が返る | 本人の承認→Codex |
| Workers Paid | 申し込んでいない | 申込の直前までの用意 | 押す所の説明 | 本人が押す |
| 0060 を本番 D1 へ | 未適用 | 手順と戻し方を確かめて当てる（Codex） | 本番で札が出る・試験 | Codex |
| 300 人の試行のお金 | 決め（#51）と試算（#55）。11-25 の会話（「1 円もお金取らん」）と矛盾が未決 | 本人の答え | 07 と spec-124 が 1 つの形 | 本人の答え |
| 試行を開く | 閉 | 試行の表の migration（本番）・Worker の trialProtocol・審査担当・経路の札 | 札付きのリンクで入れて、運営の画面に出る | 本人の答え（札）→Codex |
| 定期便を始める前 | 切り替えは閉 | 専門家の相談・形（箱か予算か） | — | 本人 |
| 稼ぐ設計図の 14 日の試し | 見積もり（#60）。#101 が招待制の「初回の売上」を作った | 始める設計図・アカウント | 試しの台帳に 1 件目 | 本人の答え→Claude |
| 動画をオープンソースで作る | 調べだけ（#60） | 動かす場所（Cloudflare の Containers は Paid だけ／Mac） | 1 本作って費用を測る | 本人の答え |
| 市場調査と成果の読み取り | 済み（task 130 の Eve の部品: `eve-part:keyword-research`・`eve-part:results-csv`。区切り 2 の 42f2704f で docs に記録） | — | Eve の組み合わせに入っている | — |
| 目的型（ヘルスケア）の Agent | 作った（区切り 2。「体調ノート」`/noah/goals/health`。既定の目的・窓口・名前） | 公開と本番の確かめ。本人の答え（目的・窓口・名前） | 本番で記録 → 振り返り → 書き出し → 全部消す | Codex（公開）→Claude（確かめ） |
| 本番の確かめの道具 | 済み（区切り 1: `npm run noah:prod:check`。区切り 2 で `unverified --ids`） | 公開の後に本番で動かす | `npm run` 1 つで全部の結果 | Claude |
| 匿名の保存先の試験の名前 | 残っている（Cookie が無く消せない） | 本番 D1 から消すかの判断 | — | 本人の答え |

### 順番

1. 答えが要らない物: D7・D8・D2（Turnstile 無し）・本番の確かめの道具 → PR → Codex でマージと公開 → 本番で確かめる。
2. 許しのある本番の作業（Codex）: 0060 → D6 の 165 件。
3. 答えの後: 試行を開く・ヘルスケアの Agent・14 日の試し・動画・D13・D5 の実機の行。
4. 最後に全部の画面を両方の幅とサインインの有無で確かめ、docs・CHANGELOG・07・00-index を合わせる。

### 本人に聞いた事（16:20。答えが無い間は「既定」で進める）

1. 利用者のお金: 11-24「600 円を本人の分から差し引く」と 11-25「1 円もお金取らん」のどっち？（既定: 決まるまで試行は無料のまま）
2. 定期便の形: おまかせの箱か、1 人あたりの予算で買い物か。（既定: 定期便は閉のまま）
3. 試行を開く: 試行の表の migration も本番 D1 に当てていい？ 段 1 の経路の札・審査担当・開く日は？（既定: 準備だけ進める）
4. D13 の #421・#425 を入れていい？
5. D2 の Turnstile を作る？（既定: 作らず、1 人あたりの枠だけ）
6. D5 の実機の行をノエルのスマホでやる？（既定: 表を渡す）
7. 無料 Worker の Cloudflare の承認はいつ押せる？
8. ヘルスケアの Agent の目的・窓口・名前（既定: 「毎朝の体調を記録して、週末に振り返る」を Noah の画面だけで）
9. 14 日の試しをどの設計図から？ 持っているアカウントは？ #101 の「初回の売上」と同じ物でいい？
10. 動画のオープンソースは Mac で動かす？ Workers Paid を待つ？
11. 匿名の保存先の試験の名前を本番 D1 から消していい？
12. D6 で壊れた物を、今の決まり（続けて失敗したら外す）で外していい？（既定: 外す）

## 今の状態（11-24 15:30）

- 公開: PR #54（「すべて見る」44px）をマージして、Codex が avoado.si を Sites v230 として 1 回出した（main と Sites のソースの tree 9c8ab771… が一致。D1 の migration なし）。本番の /noah は小さい押す所 0。今日はじめて歩いた /noah/registration（「規約・送信情報」の高さ 39px と、空のリンク）と /noah/help（文の中のリンク 19px）に小さい押す所が 4 つある（本人に「直すなら言って」と伝えた。まだ直していない）。
- Git: PR #55（300 人の試算の写し）と PR #60（稼ぐ設計図 470 件の見積もり・オープンソースの Agent の一覧・目的型は一旦無料の記録）がマージ済み（main e32c86c4）。
- 見積もり（真ん中、1 年目、1 件あたり・月）: 利益 −380 円、動画と画像をオープンソースで作れば +259 円。黒字の物だけ（398 件）で 1 人 377 円。数は Sheets の「稼ぐ設計図」（式）と `docs/noah/business-blueprints-average.md`、計算は `tools/profit-model/earn.py`。
- Codex: 自分の窓（789。ファイル > 新しいウィンドウ）で「修正して avoado.si を再公開」を使った。窓 92 は別のセッションも使っていて、打った後に別のチャットへ切り替わる事がある。送る直前に題名を確かめ、送った後に待ち列の場所を確かめる。
- 無料 Worker の配り直しは、まだ本人の Cloudflare の承認待ち。

## 今の状態（11-24 07:10）

- PR #51（300 人の試行のお金の決め）はマージ済み（main `71014dfd`）。Mac が戻り、Codex のアプリが更新で再起動していた。「4 つのチャットを再開するか」は「止めたまま」を選び、こちらのチャット（「修正して avoado.si を再公開」、窓 92）だけ開いて再開した。ほかの 3 つ（「当てて道具一覧を公開」「Noah収集機能を配備」「Complete Noah task 127 validation」）は止まったまま。本人が開けば動く。
- Codex に並んでいる: 追記12（公開の版の確かめ）→ 追記13（44px の直しの PR・マージ・main から 1 回公開）→ 追記14（#53 と 00-index の 129 の行がぶつかった時の解き方）。
- 本人（07:03）「まず今の状態でgitあげて／で最後までやって／で終わったやつをまたgitにあげて」。表「Noah 300人の利益試算」を `docs/noah/trial-300-profit.md` に写した: `claude/ice2/noah-trial-profit`（`67421771`。CHANGELOG の印 `TRIALPROFIT`）。表の式を組み直した計算（`tools/profit-model/model.py`）が表の値 504 個と一致。
- ノート（`notes/2026-11-22/` の progress.txt・tests.json・init.sh）と、本番の確かめの道具（`tools/prod-checks/`。受入・画面・Mac のメニュー・一周。Cookie の file は入れない）をこの枝に置いた。
- 次（本人の 07:00 の頼み）: 稼ぐ設計図（spec-122 の 470 件）を全部試した時の利益の平均、オープンソースのエージェントの今の一覧と、もっと良い組み合わせ。終わったら、またこの枝と PR に上げる。

## 今の状態（11-24 05:35）

- **公開は済んだ**: 別スレッドの PR #50（noah-sites-v227-reconcile）が #41 の画面を main に入れ（main `06bfe89e`。Q4 の `noahCardOrigin` は残った）、05:18 ごろ別スレッドが main から avoado.si を出した。#41 待ちは終わり。`claude/ice2/pr41-on-main-2` はもう要らない。
- 本番で確かめた（Claude、05:18〜05:26）: entitlement-deliveries 401（main の版）、受入 16/16、一周の行 1・2・3・4・6・7・10（5 は本番では送らない）、画面（検索「画像」3 件・広告の表示・スマホのメニューにココナラ無し・受取口座と本人確認はサインインした本人だけ）、Mac だけのメニュー（Mac 1・Linux 0）、6 画面ではみ出し 0。`/api/noah/trial?me=1` の 404 は、試行の切り替えが閉じているからで、決めた通り（`lib/noah-trial-api.ts`）。
- **残っていた小さい押す所 1 つ**（/noah の「注目のAgent」の「すべて見る」73×40px）の直し: `claude/ice2/noah-store-heading-tap`（`682fceabf4974b1428caa245aa42548feafd7e24`、main `ca38ad01` の上）。`.listHeading a` の min-height 40→44px、試験 `tests/noah-store-heading-tap.test.mjs`（直す前は落ちる）、00-index の 129 の行（D1・D3・D4・D7・D9・D10・D11 は済み）、CHANGELOG の仮の印 `HEADINGTAP`。
- Codex のチャット（「修正して avoado.si を再公開」）に、追記12（#51 の後で、今の公開が main ≥ `06bfe89e` から出ているかを確かめるだけ）と追記13（上の直しの PR・マージ・main から 1 回公開。AGENTS.md の 8 の確かめ、本番 D1 の migration はしない、0060 は未適用のまま）が並んでいる。05:33 に Mac が眠って、そこで止まっている。
- PR #51（300 人の試行のお金の決め。docs 5 file だけ、先 `b4cbd43b`）は CI 中。緑ならマージ。
- 無料 Worker の配り直しは、まだ本人の Cloudflare の承認待ち（Wrangler の OAuth が時間切れ）。
- 300 人の利益の試算は Sheets「Noah 300人の利益試算」（https://claude.ai/artifact/KsF5u8VBCtGvhHB4xwYFUJ）。本人の答え: 収益は会社が回す Agent の売上、300 人が集まるまで（3 か月）は無料で本人の分も配らない、本人の分は余剰の 75%、有料 600 円、作った人の分 20%、買い手を連れてくる割合はわからない（1 段目で測る）。

## 今の状態（11-24 01:50）

- 9 本は全部 main に入った（#38・#40・#42・#43）。クラウドの直し（無料のクラウドを neuron で数える）も #44 で入った（main `6283f6a6`）。
- **無料 Worker の配り直しは、本人の Cloudflare のログイン待ち**: Mac の Wrangler に旧アカウント（`noah-free-cloud-agents` がある方）への有効なログインが無い。本人がログインしたら、`services/noah-cloud-agents` で `npm ci`、`npx wrangler deploy --config ./wrangler.free.jsonc`、`/health` と配った版を報告する。パスワード・トークンは扱わない。Sites と Worker は、どちらを先に出しても動く。
- **公開は #41 待ちのまま**（下の 00:45 と同じ理由）。#41 を main に入れる時の参考は `claude/ice2/pr41-on-main-2`（`8c5be853`）に作り直した: #41 の `1cca7753` を main `5631fa7c` に merge（Q4 の `noahCardOrigin`・Q5 の `macMenu` を残す。CHANGELOG と 00-index は両方の行。応答の見出しの確かめは build して測り直して PASS）、「すべて見る」を 44px（試験 1 本）、そのあと main `6283f6a6` を merge（CHANGELOG と `lib/noah-i18n.ts` は両方の行）。前の `claude/ice2/pr41-on-main`（`a6195ddd`）は古い。
- 別スレッドの #45（Agent の説明に材料の流れ）は、main と CHANGELOG の同じ所（## 2026-11-24）を足すので、マージの前に main を merge する要がある（向こうの PR なので触らない）。

## 今の状態（11-24 00:45）

- マージ済み: #38（収集）・#40（ボード）・#42（参照ライブラリ）。4〜9 は #43（先 `47093b8c`）で CI 中。
- #43 の途中で直した事: CodeQL の 2 件（`scripts/noah-public-probe.mjs`、`3f0b7341`）。main に #25 が入り task 128 を使ったので、こちらの一周の確かめは **task 129**（`codex/tasks/129-noah-ux-debug.md`）にした（`47093b8c`）。
- **公開は待つ**: 本番 v225 は、別スレッドがマージ前の #41（kaiya.kk）から出した物。main から出すと #41 の画面が消えるので、AGENTS.md の 8 のとおり、#41 が main に入ってから main で 1 回出す。#41 は触らない。
- #41 を main に入れる時の参考: `claude/ice2/pr41-on-main`（`a6195ddd`。#41 の `5e16872e` を `3f0b7341` の上に merge。`components/noah-pin-grid.tsx` はカードの下の行を `noahCardOrigin` に、`components/noah-shell.tsx` は Mac だけの「ココナラの仕事」を残す。応答の見出しの確かめは測り直し済み。#41 はその後も進んでいる）。

## いまの手順（23:55。上の「今の状態」が新しい）

いま: 1（収集）は #38、2（ボード）は #40 でマージ済み（main `cab0dc49`）。3（参照ライブラリ）は Codex が #42 にした（先 `c060ad57`）。

1. **#42 はそのまま**: check が通ったらマージする。
2. **4〜9 は 1 つの PR にする**: 枝は `claude/ice2/noah-all` = `f2aef440af92756f4b497b63341d9796ba2f3df3`。main `cab0dc49` と #42 の先 `c060ad57` を merge 済みで、CHANGELOG の `#BOARDPICK` は `40`、`#REFLIB` は `42` に直してある（コードの中身は `9cbabc6c` と同じで、確かめ済み）。本文は `pr/all.md`。
   - #42 がマージされたら、この枝に main を merge する（#42 の merge commit だけなので、ぶつからないはず）。
   - PR の番号 N が出たら、残りの印を N に直す: `perl -pi -e 's/(#|pull\/)(UXAUDIT|LAUNCH|QUOTA|TAPS|SEARCHWORDS|STORETAPS)\b/${1}N/g' CHANGELOG.md`
   - check が全部通ったらマージして、avoado.si を main から公開し直す（下の手順の 6・7）。
3. 4（一周の確かめ）を単独で進めかけていたら、それはやめる（単独の PR を作っていたら、閉じてよい。こちらのスレッドの PR だけ）。
4. #39・#41（kaiya.kk）は触らない。#41 が先に main に入って、`noah-all` が CHANGELOG 以外（`components/noah-shell.tsx`・`data/web-security-response-current.json`）でぶつかったら、止めて教える。こちらで解いて `noah-all` を進める（force push はしない）。

## 速くするための変更（23:25）

1（収集）は PR #38 でマージ済み。2（ボード）は PR #39 で進めてよい。**3〜9 は、1 本にまとめた枝 `claude/ice2/noah-all`（`9cbabc6c8644`）で 1 つの PR にする**（2〜9 と main `97cf7cfe` を merge 済み。本文は `pr/all.md`）。こうすると、CHANGELOG のぶつかりで CI を 7 回待たずに済む。

- PR #39 がマージされたら、`claude/ice2/noah-all` の CHANGELOG の `#BOARDPICK`（`pull/BOARDPICK` も）を `39` に直してから main を merge する（同じ行が同じ文になるので、ぶつからない）。
- 残りの印は、まとめの PR の番号 N に直す（mac でも動く書き方）: `perl -pi -e 's/(#|pull\/)(REFLIB|UXAUDIT|LAUNCH|QUOTA|TAPS|SEARCHWORDS|STORETAPS)\b/${1}N/g' CHANGELOG.md`（N を番号に）。CHANGELOG 以外に印は無い。
- まとめの PR の check が全部通ったらマージして、avoado.si を main から公開し直す（下の 6・7）。

## 手順

1. 取ってきて、表の commit と同じか確かめる。違ったら止めて報告する。
   ```bash
   git fetch https://github.com/k999ln/rock 'refs/heads/claude/ice2/*:refs/remotes/staging2/*'
   git rev-parse staging2/noah-collector-steady staging2/noah-board-picks staging2/design-references staging2/noah-ux-audit staging2/noah-launch staging2/noah-quota staging2/noah-taps staging2/noah-search-words staging2/noah-store-taps
   ```
2. 1 本ずつ push して PR を作る（フォークからでもよい）。本文は `pr/*.md`。
3. PR の番号が出たら、その枝の CHANGELOG の仮の印を番号にする（1 commit 足す。force push はしない）。5・6 は 4 を含むので、`#UXAUDIT` も 4 の番号に、6 は `#LAUNCH` も 5 の番号にする（同じ行を同じ文に直しておけば、main を merge した時にぶつからない）。
4. main を merge する（`git merge origin/main`）。CHANGELOG.md だけがぶつかった時は `python3 tools/merge-changelog.py CHANGELOG.md` で両方の行を残す。ほかの file がぶつかったら止めて報告する。
5. check（ci.yml の verify など）が全部 success・neutral・skipped になったら、1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 の順にマージする。1 本マージしたら、次の枝に main を merge し直して、check を待つ。落ちた check があれば、マージせずに、落ちた試験の名前と、main の直近の同じ check でも落ちているかを報告する。
6. 9 本が main に入ったら、avoado.si（Sites）を main から公開し直す。AGENTS.md の 8 のとおり、公開の前に main と Sites ソースの `git rev-parse 'HEAD^{tree}'` を照合する。migration は無いので、Sites の配備で SQL は増えない（PR #36 と同じく、アップロードする成果物に migration を足さない）。
7. 公開の後、スマホ幅で次を確かめて、結果を報告に書く（読むだけ。書き込まない）:
   - `/noah/explore?q=画像` が 0 件でない（前は 0 件）。
   - ホームの Noah 自身の案内の下の行が「Noahの案内（広告を含む）」。
   - スマホのメニューに「ココナラの仕事」が無い。
   - `/noah/profile` の「受取口座」「本人確認」が「サインインした本人だけ」。

## 報告に書く事

PR の番号（9 本）、マージした commit、公開した Sites の版、公開の前の tree の照合、7 の結果。

## してはいけない事

- AGENTS.md の 6 にある事（本番 D1 への migration、本番の鍵、実資金の移動、外部への申込・問い合わせ、git の履歴の書き換え、main への直接 push）。
- force push。ほかの人の枝や PR を触る事。試験を消したり、書き換えたりする事。
- 秘密の値を、チャット・Git・ログに書く事。

## 確かめ済みの事（Claude、2026-11-23）

- 1〜4 を main `9cb7f5d1` の上に重ねて: `npm test` 5,222 本のうち 5,182 本が通った（4 本は skip）。落ちた 36 本（名前は 35）は、全部、手を入れていない main でも同じ名前で落ちる（root で動かした事と Node 22。CI は Node 26.12.1）。新しく落ちた物は 0。`tsc --noEmit`・`lint:product`・repository / project / design / release / schema / database の検査: 通った。gitleaks: 0 件。
- 5: 足した試験 5 file（14 本）は、どれも直す前の file では落ち、直した後で通る。手元の本番と同じ build を wrangler で動かし、応答の見出しの確かめを測り直した（PASS）。画面は Playwright で確かめた（追加の画面の注記・スマホと Linux の PC ではメニューにココナラ無し・Mac では有り・登録情報の受取口座と本人確認が「サインインした本人だけ」）。
- 6: 足した試験 2 file（8 本）は、上限の部分を外した file では落ち、付けた file で通る。接続・依頼・Agent・下書き・取り込みの既存の試験 27 file（252 本）は全部通る。
- 1〜6 を重ねた全体の `npm test` の結果は `pr/launch.md` と `pr/quota.md` に書いた。
