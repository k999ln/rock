task 129 の D6（「まだ誰も動かしていない」Agent を本番で全部確かめる）と、目的型の Agent「体調ノート」（task 142）。本人の頼み（2026-11-27 15:58）「このチャットでやった事を全部改良して、世に出せる最終版にして」の 2 つ目の区切り。本人の許可「D6 の 165 件の確かめで、外の道具を呼んでよい」「目的型（ヘルスケア）の Agent を無料で 1 つ作って、出してよい」による。PR #FINALFIX の上に積んだ枝（commit は 2 つ: `42f2704f`・`3121b434`）。

## わかった事

- **D6**: 本番（avoado.si、2026-11-27）の一覧で、接続の札が「まだ誰も動かしていない」物は 167 件（11-22 は 165 件）。1 件ずつ確かめると、動く 73・鍵や相手のアカウントが要る 23・入力が要る 24（うち 7 件は「入力は要らない」と宣言していたのに、相手が入力を求めた）・相手の混雑で一時的に失敗 1・読み取りだけの道具が無い 37・握手が通らない 9。
- 握手が通らない 9 件のうち 6 件は同じ相手（`ai.agentlookups`）。サーバーが 1 つ止まっていただけかもしれない。巡回の決まり（spec-88）は「6 時間あけて確かめ直し、2 回続けて失敗したら外す」なので、1 回の失敗では外さない。
- 外すのは巡回（握手の失敗）か審査者（`/noah/review/intake`）だけ。ユーザーの依頼の失敗は数に入らない（`lib/noah-ask.ts` は成功の時だけ記録する）。Claude は審査者ではないので、外していない。
- **公開の画面の一覧**: avoado.si では、`services/sky-web/main-page-policy.mjs` の一覧に無い画面は 404 になる。新しい画面を足す時は、ここにも入れる必要がある（今まで、メニューの行き先がこの一覧にあるかを確かめる試験は無かった）。
- Noah の画面のうち、本文を翻訳しているのは 131 のうち 51。最近の画面（初回の売上・参加型計算）と同じく、体調ノートの本文は日本語だけ（メニューの名前は 5 つの言語に訳した）。

## やった事

- **D6 の確かめ**: ブラウザだけの本人として、知らない人と同じ API で 1 件ずつ、つなぐ → 読み取りだけと宣言され入力の要らない道具を 1 つだけ 1 回頼む → 成果を待つ → 切る（Noah の上限を守り、つなぐ間は 6.5 秒。2 人の本人を使った。切り忘れ 0）。成果が返った 73 件は、Noah の決まりどおり「動いた」（L2）になった。結果の表は `docs/noah/d6-unverified-agents-20261127.md`（1 件ずつの表と、外す事・次の事）。
- **道具**: `node scripts/noah-prod-check.mjs unverified <origin> --write [--limit=N] [--ids=…]`（`scripts/noah-prod-unverified.mjs`）。結果の分け方（鍵が要る・宣言と違う入力・混雑・壊れている）を、相手の返した文で分ける。`--ids` は、落ちた物だけを間をあけて確かめ直す時に使う。
- **体調ノート**（`/noah/goals/health`、無料）: 毎朝、睡眠・体・気分を 5 段で選ぶ（メモは 140 字まで）。週ごとの振り返り（記録した日数・3 つの平均・先週との違い・合計の高い日と低い日・メモ）。28 日分で「完成」。記録は端末のブラウザにだけ置き（Noah のサーバー・ほかの会社・言語モデルへは送らない）、JSON の書き出しと全部消す（2 回押す）ができる。ブラウザの保存が止まっている・いっぱいの時は、保存できない事を画面に出す（黙って捨てない。書けなかった後も、その画面を開いている間は書いた物を見せる）。助言・病気の判断・薬の指示は出さない事を画面に出す。入口は Noah のメニュー。設計は `docs/noah/spec-goal-health.md`。目的・窓口・名前は、本人の答えを待つ間の既定（毎朝の体調を記録して週ごとに振り返る・Noah の中だけ）。
- **公開の一覧**: `/noah/goals/health` を `MAIN_PAGE_PATHS` に入れた。`tests/noah-menu-served.test.mjs` で、メニューの決まった行き先が全部 200 になる事を確かめる。
- **web security の手元の実測**: メニュー（`components/noah-shell.tsx`）と公開の一覧が、実測の入力に入っているので、手元の本番の build（リポジトリの決まりの Wrangler 4.147）で取り直した（`data/web-security-response-current.json`。`npm run release:check` が通る）。main が先に進んで、ほかの PR がこの 2 つの file を変えていたら、取り直す。
- docs: task 129 の D6、task 142（新）、00-index の 129・142 の行、CHANGELOG（印 `FINALD6`）、07 に本人の 11-27 の許可。

## 確かめた事

- 新しい試験 4 本と、足した試験: `tests/noah-goal-health.test.mjs`（式。日付と週・記録の形・壊れた保存の読み直し・振り返りの数・28 日で完成・注意の文・通信しない）、`tests/noah-goal-health-ui.test.mjs`（画面。記録 → 振り返り → 書き直し → 全部消すは 2 回押す・保存できない時の文）、`tests/noah-goal-health-store.test.mjs`（端末の保存先。読めない・書けない時）、`tests/noah-menu-served.test.mjs`（メニューの行き先が公開で 200。体調ノートを一覧に入れる前は落ちる）、`tests/noah-prod-unverified.test.mjs`（分け方・選び方・`--write` 無しでは動かない）。
- 既存の試験は変えていない。関係する 355 file（2,526 件）: 2,522 件が通り、1 件は今までどおり飛ばし、3 件が落ちた。3 件は、手元の Node 22 で main でも落ちる物（`noah-mac-runner` の「Apple Silicon Mac と Node.js 24 以上が必要」と `noah-operation-packs`。PR #FINALFIX に書いた 34 件の中）。`npm test` の全部（`3121b434`、5,715 件）: 手元（Node 22.23）では 5,677 件が通り、4 件は今までどおり飛ばし、34 件が落ちた。34 件は、PR #FINALFIX に書いた物と同じ 7 file（migration-aliases 24・mcp-connector 3・mcp 2・noah-operation-packs 2・mr-pc-adapter 1・noah-mac-runner 1・undici-dependency-security 1）で、触っていない main でも手元で落ちる。この PR はそのどれも変えていない。CI（Node 26.12.1）で確かめる。
- `npm run build`・`typecheck`・`lint:product`・release（release:check・web-bundle・web-assets）・private・project・repository・noah:screenless・version・design・baseline の check: 通る。
- 手元の本番の build を、リポジトリの決まりの Wrangler で動かして:
  - `/noah/goals/health` は、Noah の殻の中で 390px と 1280px とも、はみ出し 0・小さい押す所 0・画面の誤り 0。メニューに「体調ノート」（英語のブラウザでは Health notes）があり、44px。
  - `Host: avoado.si` で、`/noah/goals/health` は 200、`/noah/goals` と知らない道は 404。
  - 記録が 17 日分ある形でも、390px・1280px で、はみ出し 0・小さい押す所 0。
- 本番（今の公開の版）で、D6 の確かめを 167 件。

## 次の事

- マージした後、main から avoado.si を 1 回出す（本番 D1 の migration は無し）。本番で `npm run noah:prod:check -- https://avoado.si --write` を動かし、体調ノートを含む 75 画面を確かめる。体調ノートは、記録 → 振り返り → 書き出し → 全部消す、を本番で確かめる（Claude が動かす）。
- 2026-11-28 05:25（JST）ごろ、握手が通らなかった 9 件を `--ids` で確かめ直し、2 回続けて通らない物を表に書き足す（追いの commit）。
- 本人の判断: 2 回続けて通らない物を、審査者として外すか、巡回に任せるか。「入力が要る」物に見本の入力を決めて頼むか。体調ノートの目的・窓口・名前（今は既定）。本文を 5 つの言語に訳すか。

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01JzDjJ2sHXBQS8oDJ7NBhAu
