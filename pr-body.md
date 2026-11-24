## 何をしたか

Noah の全画面の読み込み（`NoahLoading variant="page"`）を、マスコット「点のトラ」のスケボーゲームに差し替えた。読み込みを待つ間に遊べる。

- **点のトラ**：Claude Code の Clawd と同じ作り方で、オレンジ 1 色の点（24 × 10 点、1 点 3 px）だけで描く。目・鼻・縞 4 本は点を抜いた穴。黒い板のスケボーに乗り、ときどき後ろ足で地面を蹴る。スペースキー・↑・タップでオーリー、長く押すと高く跳ぶ。
- **難しさ**：今は難しい版。開いた瞬間に始まり、コーンの上にハトを縦に積んだ「穴が 1 つだけの壁」が 0.5〜0.67 秒おきに来る。ふつう版（押すまで待ち、コーン・ベンチ・ハトをよける）は `NOAH_TIGER_NORMAL` として残してあり、`NOAH_TIGER_ACTIVE` を書き換えるだけで戻せる。
- **見た目**：色の付いた物はトラだけ。ほかは灰色。地は塗らず、Noah の画面の地がそのまま見える。文字は DotGothic16 を使う文字だけ切り出した 40KB（OFL）。本当の進み具合は分からないので、帯は流れるだけ（％は出さない）。
- **文**：6 か国語の辞書（`lib/noah-i18n.ts`）に足した。
- **見本**：`design/references/components/noah-tiger-loading.html`（ふつう版）・`noah-tiger-loading-hard.html`（難しい版）と README の記録。

本人の指示（2026-11-24）：04:57「可愛いローディング画面作って オリキャラかなんか使って googleで電波ない時のゲームみたいなやつ」、05:04「スケートしてる感じにして」、07:05「めちゃめちゃ難しくして、開けた瞬間すぐ死ぬ…今の状態は保存して後で復旧できる状態で…難易度以外は完全にそのまま」。

## 変えたファイル

- 新規：`lib/noah-tiger-game.ts`、`components/noah-tiger-game.tsx`、`components/noah-tiger-game.module.css`、`tests/noah-tiger-game.test.mjs`、`public/fonts/noah-dotgothic16-subset.woff2`、`public/fonts/OFL-DotGothic16.txt`、`design/references/components/noah-tiger-loading*.{html,webp}`
- 変更：`components/noah-loading.tsx`（page だけ差し替え。cards・connection・compact・default はそのまま）、`lib/noah-i18n.ts`、`tests/fixtures/noah/screen.mjs`（計算だけの lib を試験台に 1 行足した）、`public/fonts/README.md`、`design/references/README.md`、`README.md`、`CHANGELOG.md`、`docs/structure/07-decisions-from-minutes.md`

## 確かめた事

- `node --experimental-strip-types --test tests/noah-tiger-game.test.mjs`：7 件すべて合格。難しい版の 9 種類の穴（地面・18〜60 px）が、速さ 8.5 と 13 のどちらでも通れる押し方を持つこと。壁が 2 つ続いても間に合うこと（最短 28 フレーム ＜ 間隔 30 フレーム）。開いた瞬間に始まり、何もしないとぶつかること。
- `npx tsc --noEmit`：合格。
- `npm run lint:product`：合格。
- `npm run private:check`・`project:check`・`repository:check`・`design:check`・`baseline:check`・`noah:screenless:check`：合格。
- `npm test`：全 5,366 件のうち 5,327 件が合格、失敗 35 件・スキップ 4 件。失敗の 35 件は、変更前の main（71014dfd）で同じファイルを流しても同じ名前で失敗する（migration-aliases 24 件など、この環境に由来）。この PR で増えた失敗は 0 件。
- `npm run build`：合格。書体は既存の Noto Sans JP と同じく `dist/client/_site-assets/…/fonts/` に入り、asset-map に載る。続けて `npm run release:web-bundle:check`・`release:web-assets:check`：合格。
- 画面：`vinext dev` で確認用の一時ページ（コミットしていない）を開き、390 px と 1280 px で、開いた直後に走り出す・壁にぶつかると「ぶつかった！」・横にはみ出さない・点の書体が読み込まれる・ページのエラーなし、を確かめた。

## まだの事

- `npm run verify` を 1 本の命令としては流していない。上に書いた検査（typecheck・lint:product・test・build・公開物の検査ほか）を個別に流した。sky・android・billing などの、この変更と関係しない検査は流していない。
- 本番（avoado.si）への反映はしていない。
- `NoahLoading variant="page"` を使っているのは今 `components/noah-browser-access.tsx` の 1 か所だけ。接続中（connection）の花のロゴの待機画面は変えていない。

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01JzDjJ53k8TpG9uT5rgqzYZ
