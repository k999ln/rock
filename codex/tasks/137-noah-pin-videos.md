# 137 Noah のピンの動画を集めて、5〜8 秒のループにし、Agent ごとに割り当てる

本人の指示（2026-11-25）:
- 「文章いらない、題名だけ、ピン画像のgifにしてイメージを説明する動画みたいな感じ、ディティールは説明動画５〜8秒とか」
- 「こういう動画をgifにしてピン画像にする」（本人の Mac の「ダウンロード」にある `Higgsfield Seedance 25 Community explore AI camera control for creators.mp4` と `… (1).mp4`〜`… (49).mp4` の 50 本を添えて）
- 「作らない、かっこいい動画収集してそれをgifに変換する、30本あげたからそれ参考にhiggsfieldとかオシャレなAI動画ネット上で探してきて。わかるよね？」
- Higgsfield の動画の使い方について: 「すでに許可とってるから大丈夫だよ」

本人の決定（2026-11-25）: 見えている間は繰り返す・AI で作られた動画を中心に、足りない所は実写・Agent ごとに中身で探す・動画の出どころ（作った人とサイトの名前）は今は書かない。
答えが無かった所（Claude がこう決めた。変える時は本人に聞く）: ファイルは GIF と同じ見た目の音の無い mp4（本物の GIF の約 8 分の 1 の重さ）・縦 3:4・動画が無い Agent は図解（task 131）を見えている間繰り返す。
仕様: [docs/noah/spec-115-pin-grid.md](../../docs/noah/spec-115-pin-grid.md) の 10 章。

## 1. もうある物（この task の前の PR）
| 物 | 場所 | 中身 |
|---|---|---|
| 1 本の形 | `lib/noah-pin-video.ts` | `NoahPinVideo`（mp4・最初の絵・縦 3:4・5〜8 秒・出どころ・元の ID と頁・AI か）と、確かめる `parseNoahPinVideo` |
| 選ぶ式 | `lib/noah-pin-video.ts` | `pickNoahPinVideo(言葉, 動画の表, 使った回数)`。重なり 3 つに 1 つ以上・AI を先・1 回使うごとに 0.2 点引く・合う物が無ければ null |
| 変換の道具 | `scripts/noah-pin-video.mjs` | ffmpeg で 5〜8 秒（既定 6 秒）・縦 3:4（480×640）・24 コマ/秒・音なしの H.264。終わり 0.5 秒で始めへ溶かす（つなぎ目が見えない）。名前は mp4 の SHA-256 の頭 32 字。`--gif` で本物の GIF も |
| 画面 | `components/noah-art-motion.tsx`・`components/noah-agent-pin.tsx`・`components/noah-pin-grid.tsx` | カードの `pinVideo` を、見えている間だけ読み込んで繰り返す。動きを減らす設定では最初の絵だけ。カードは題名だけ。保存は PC で乗せた時だけ・スマホは題の右の「…」 |
| 試験 | `tests/noah-pin-video.test.mjs` | 形の確かめ・選ぶ式・使う所の決め方・切り出し・合成した動画からの変換とつなぎ目 |

## 2. やる事（この順で。1 つずつ PR にして、合格条件で確かめてから次へ）

### 2.1 動画の棚を作る（本人の Mac で）
- 作業場所は本人の Mac。まず「ダウンロード」の 50 本（上の名前）を、作業フォルダーへ**写す**（元のファイルは動かさない・消さない）。
- 本人が示した物を見本に、Higgsfield のみんなの動画（Seedance 2.5 など）から、格好いい AI 動画を足す。本人は「すでに許可とってるから大丈夫だよ」と言った。1 本ずつ、元の頁の URL（`sourceUrl`）と元の ID（`sourceId`）を記録する（どの動画を使ったかを、後からたどれるように）。「ダウンロード」の 50 本は、元の頁が分からないので、`sourceId` はファイルの名前、`sourceUrl` は `https://higgsfield.ai/seedance-2-5-community` にする。
- 使わない動画: 実在の人（有名人・一般の人の顔がはっきり分かる物）・会社のロゴや商品名・暴力や性的な物・字幕や透かしが大きく入った物・5 秒より短い物。
- 1 本ごとに、AI が絵を見て、映っている物の言葉を英語の小文字で 5〜15 個書く（`tags`。例: `receipt`・`desk`・`neon`・`city night`）。`ai` は、AI で作られた物なら true。
- 数は、まず 300 本。2.4 の確かめで足りない話題が分かったら、そこを足す。
- 実写で足す時（Pexels・Coverr など、商用で使えて作り変えてよい所）: API の決まりでは、Pexels へのリンクや、Coverr と作った人の名前を出す事になっている。本人の決定は「出どころは今は書かない」なので、API で集める前に、出どころの表示をどうするかを本人に聞く。

### 2.2 変換して置く
- 1 本ずつ `node scripts/noah-pin-video.mjs --in 元 --out 出す所 [--start 秒] [--seconds 6] [--x 0.5]` にかける。いちばん格好いい 5〜8 秒を選ぶ（コマを見て `--start` を決める。横長の動画は、主役が入る `--x` を選ぶ）。
- できた `<hash>.mp4` と `<hash>.jpg` を R2 の `noah/pin-video/v1/` に置く。画面からは同じサイトの道 `/api/noah/pin-video/<hash>.mp4` で読む（route を足す。名前は `^[0-9a-f]{32}\.(mp4|jpg)$` だけ通す。Range に応える。`Cache-Control: public, max-age=31536000, immutable`）。
- 動画の表（`data/noah-pin-videos/library.json` か D1 の表）に、1 本ずつ `NoahPinVideo` の形と `tags` を書く。書く前に `parseNoahPinVideo` で確かめる。

### 2.3 Agent ごとに割り当てる
- task 131 の `pin` がある Agent ごとに、Luna Max が、題・入れる物・返る物から、動画を探す言葉を英語の小文字で 5〜10 個書く。
- `pickNoahPinVideo` で選ぶ（使った回数を数えながら、全部の Agent を 1 回ずつ。並びは id の順で、毎回同じ結果になるように）。合う物が無ければ動画は付けない（図解のまま）。
- 保存: `noah_intake_candidates` に `pin_video_json` の列を足す migration（番号は次の空き）。**本番 D1 の migration は、本人の許可の後**（AGENTS.md §6）。集めた紹介（R2 の `noah/collection/v1/*.json`）の 1 件には `pinVideo` を足し、`parseCollectionSnapshot` が `parseNoahPinVideo` で確かめる（形が違えば、その項目だけ落とす）。

### 2.4 中身が合っているかを確かめる
- task 131 の 2.3 と同じ審査者の画面に、無作為の 200 件を並べる: 左に提供者の説明（原文）、右にカード（題名と動画）。審査者が「合う／合わない（理由）」を押す。
- **合う割合が 95% 以上になるまで、一般の人のグリッドには動画を出さない**（審査者だけに出す）。合わない物は、言葉か棚を直す。
- 本人にも、200 件の画面のリンクを渡す（「格好いいか」「何をする Agent か伝わるか」を見てもらう）。

### 2.5 画面
- `noahReadyItems`（`lib/noah-intake-store.ts`）とディレクトリ（`lib/noah-agent-directory.ts`）のカードに `pinVideo` を載せる（読む時にも `parseNoahPinVideo` で確かめる）。グリッドは、もう `pinVideo` を描ける。

## 3. 合格条件
- 2.1 の棚の全部の動画に、`sourceId`・`sourceUrl`・`tags`・`ai` がある。実在の人・ロゴの物が無い（審査者の目で）。
- 全部の mp4 が `parseNoahPinVideo` を通る。音が無い。5〜8 秒。縦 3:4。繰り返してもつなぎ目が見えない。
- 無作為の 200 件で、動画が中身と合う割合が 95% 以上（2.4 の画面の記録で）。本人が「格好いい」「伝わる」と言う。
- 同じ動画を使う Agent の数が、表の上で見える（使い回しが多い動画は、棚を足す目安にする）。
- `npm run verify` が通る（この環境の外の理由で落ちる物は、PR 本文に、変更前でも同じだと書く）。スマホ（2 列）と PC で、本物の Agent のグリッドを撮って PR に貼る。

## 4. やらない事
- AI で動画を作る事（本人「作らない」）。
- 元の頁と ID の記録が無い動画を使う事。
- 音を出す事。
- 出どころの表示を本人に聞く前に、Pexels・Coverr などの API で集める事。
- 本人の「ダウンロード」のファイルを動かす・消す・書き換える事。
- 本番 D1 の migration を、本人の許可の前に当てる事。
- 鍵をチャット・Git・ログに書く事（Actions secret だけ）。

## 5. 進み具合
- （ここに、PR ごとに追記する）
