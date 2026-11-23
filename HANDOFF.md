# 引き継ぎ 2: 6 本の枝を iceiceice999/rock に入れて、avoado.si を公開し直す（2026-11-23）

本人（ノエル）の言葉:

- 2026-11-22 22:55 ごろ「push・PR・マージまで」（iceiceice999/rock への push・PR・マージを許可）。
- 2026-11-23 21:43「好きにしていいよ／だから早く完成品世に出したい」。

安全の直し（React 19.2.9）は、Codex が PR #36 で入れた（main `35afadfc`）。ここに書くのは、その後の 6 本。

Claude のセッションには k999ln/rock（旧リポジトリ）が付いていて、同じ名前の iceiceice999/rock は付けられない。だから枝は旧リポジトリの `claude/ice2/*` に置いた。k999ln/rock は public なので、付けなくても読める。

## 枝

| 順 | 旧リポジトリの置き場所 | commit | PR の題 | CHANGELOG の仮の印 | PR の本文 |
|---|---|---|---|---|---|
| 1 | `claude/ice2/noah-collector-steady` | `d5dcc8f78c322bdf119f063f03989fe2f02aea3a` | fix(noah): 1 回きりの出所の失敗で、収集の実行全体を落とさない | `COLLECT` | `pr/collector.md` |
| 2 | `claude/ice2/noah-board-picks` | `e8c52a2e22b34998042bb0eb0eaaa63e96ce8296` | feat(noah): ボードに「このボードに合う Agent」を出す | `BOARDPICK` | `pr/boardpicks.md` |
| 3 | `claude/ice2/design-references` | `a3a2fca6ee6ec5a377fef63a611911f27885d0bf` | docs(design): Noah のデザイン参照ライブラリと、画面を作る時の決まり | `REFLIB` | `pr/reflib.md` |
| 4 | `claude/ice2/noah-ux-audit` | `6146e310145d4ea99416e02d5ac4fc60910eefdb` | fix(noah): 知らない人の目で一周して、日本語の検索・Agent の追加・保存の画面・小さい押す所を直す（task 128） | `UXAUDIT` | `pr/ux.md` |
| 5 | `claude/ice2/noah-launch` | `43f45e4861fad9c3770dfc389c2356dd1d304e9b` | fix(noah): 世に出す前の決めと直し（Q1〜Q5・task 128 の D3） | `LAUNCH`（と、本文の `UXAUDIT`） | `pr/launch.md` |
| 6 | `claude/ice2/noah-quota` | `c5129571968030263278712f66428b83fc497a2d` | fix(noah): ブラウザだけの本人を、全員まとめた 1 日の上限で抑える（抜け道 S1・task 128 の D1） | `QUOTA` | `pr/quota.md` |

1〜4 は main `9cb7f5d1`（#32）を merge 済み。5 は 4 の上の 2 commit（2 つ目は、1 つ目で 404 にした `/noah/billing` を、既存の試験に合わせて元に戻した物）、6 は 5 の上の 1 commit なので、4 → 5 → 6 の順にマージする。どれも SSH の署名つき、作者は `noellesugar99 <noellesugar99@users.noreply.github.com>`、committer は Claude。

今の main `35afadfc` と比べると、1〜3 はぶつからない。4〜6 は `CHANGELOG.md` だけがぶつかる（`tools/merge-changelog.py` で両方の行を残せる）。どの枝も migration を足していない（`drizzle/` を触っていない）。

## 手順

1. 取ってきて、表の commit と同じか確かめる。違ったら止めて報告する。
   ```bash
   git fetch https://github.com/k999ln/rock 'refs/heads/claude/ice2/*:refs/remotes/staging2/*'
   git rev-parse staging2/noah-collector-steady staging2/noah-board-picks staging2/design-references staging2/noah-ux-audit staging2/noah-launch staging2/noah-quota
   ```
2. 1 本ずつ push して PR を作る（フォークからでもよい）。本文は `pr/*.md`。
3. PR の番号が出たら、その枝の CHANGELOG の仮の印を番号にする（1 commit 足す。force push はしない）。5・6 は 4 を含むので、`#UXAUDIT` も 4 の番号に、6 は `#LAUNCH` も 5 の番号にする（同じ行を同じ文に直しておけば、main を merge した時にぶつからない）。
4. main を merge する（`git merge origin/main`）。CHANGELOG.md だけがぶつかった時は `python3 tools/merge-changelog.py CHANGELOG.md` で両方の行を残す。ほかの file がぶつかったら止めて報告する。
5. check（ci.yml の verify など）が全部 success・neutral・skipped になったら、1 → 2 → 3 → 4 → 5 → 6 の順にマージする。1 本マージしたら、次の枝に main を merge し直して、check を待つ。落ちた check があれば、マージせずに、落ちた試験の名前と、main の直近の同じ check でも落ちているかを報告する。
6. 6 本が main に入ったら、avoado.si（Sites）を main から公開し直す。AGENTS.md の 8 のとおり、公開の前に main と Sites ソースの `git rev-parse 'HEAD^{tree}'` を照合する。migration は無いので、Sites の配備で SQL は増えない（PR #36 と同じく、アップロードする成果物に migration を足さない）。
7. 公開の後、スマホ幅で次を確かめて、結果を報告に書く（読むだけ。書き込まない）:
   - `/noah/explore?q=画像` が 0 件でない（前は 0 件）。
   - ホームの Noah 自身の案内の下の行が「Noahの案内（広告を含む）」。
   - スマホのメニューに「ココナラの仕事」が無い。
   - `/noah/profile` の「受取口座」「本人確認」が「サインインした本人だけ」。

## 報告に書く事

PR の番号（6 本）、マージした commit、公開した Sites の版、公開の前の tree の照合、7 の結果。

## してはいけない事

- AGENTS.md の 6 にある事（本番 D1 への migration、本番の鍵、実資金の移動、外部への申込・問い合わせ、git の履歴の書き換え、main への直接 push）。
- force push。ほかの人の枝や PR を触る事。試験を消したり、書き換えたりする事。
- 秘密の値を、チャット・Git・ログに書く事。

## 確かめ済みの事（Claude、2026-11-23）

- 1〜4 を main `9cb7f5d1` の上に重ねて: `npm test` 5,222 本のうち 5,182 本が通った（4 本は skip）。落ちた 36 本（名前は 35）は、全部、手を入れていない main でも同じ名前で落ちる（root で動かした事と Node 22。CI は Node 26.12.1）。新しく落ちた物は 0。`tsc --noEmit`・`lint:product`・repository / project / design / release / schema / database の検査: 通った。gitleaks: 0 件。
- 5: 足した試験 5 file（14 本）は、どれも直す前の file では落ち、直した後で通る。手元の本番と同じ build を wrangler で動かし、応答の見出しの確かめを測り直した（PASS）。画面は Playwright で確かめた（追加の画面の注記・スマホと Linux の PC ではメニューにココナラ無し・Mac では有り・登録情報の受取口座と本人確認が「サインインした本人だけ」）。
- 6: 足した試験 2 file（8 本）は、上限の部分を外した file では落ち、付けた file で通る。接続・依頼・Agent・下書き・取り込みの既存の試験 27 file（252 本）は全部通る。
- 1〜6 を重ねた全体の `npm test` の結果は `pr/launch.md` と `pr/quota.md` に書いた。
