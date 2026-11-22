# 引き継ぎ: 4 つの直しを iceiceice999/rock に入れる（2026-11-22）

ノエルは 2026-11-22 22:55 ごろ、チャットで「iceiceice999/rock に push していい？」に「push・PR・マージまで」と答えた。

前のセッションには k999ln/rock（旧リポジトリ）が付いていた。同じ名前 rock の iceiceice999/rock は、同じセッションに付けられない。だから前のセッションは、4 つの枝を旧リポジトリの `claude/ice/*` に置いた。commit の中身は変えずに、そのまま iceiceice999/rock に push する。

## 枝

| 順 | 旧リポジトリの置き場所 | iceiceice999/rock での名前 | commit | PR の題 | CHANGELOG の仮の印 | PR の本文 |
|---|---|---|---|---|---|---|
| 1 | `claude/ice/security-rsc-19-2-9` | `claude/security-rsc-19-2-9` | `25a55cf5d3436ba9884638277cb121f3a45326b7` | fix(security): React Server Components の RCE を直す（19.2.9） | `SECFIX` | `pr/security.md` |
| 2 | `claude/ice/noah-collector-steady` | `claude/noah-collector-steady` | `17e1abf170e4761c7b5b6b2646f7c7af12c138ae` | fix(noah): 1 回きりの出所の失敗で、収集の実行全体を落とさない | `COLLECT` | `pr/collector.md` |
| 3 | `claude/ice/noah-board-picks` | `claude/noah-board-picks` | `e2c2fc043a1ac1312abb28ed717f7152022458d7` | feat(noah): ボードに「このボードに合う Agent」を出す | `BOARDPICK` | `pr/boardpicks.md` |
| 4 | `claude/ice/design-references` | `claude/design-references` | `f9ee0b25ca7b75b23e6fb85605752e060b633902` | docs(design): Noah のデザイン参照ライブラリと、画面を作る時の決まり | `REFLIB` | `pr/reflib.md` |
| 5 | `claude/ice/noah-ux-audit` | `claude/noah-ux-audit` | `c49ed0bdeb06` で始まる commit | fix(noah): 知らない人の目で一周して、日本語の検索・Agent の追加・保存の画面・小さい押す所を直す（task 127） | `UXAUDIT` | `pr/ux.md` |

どれも main `b310b319`（#11）の上の 1 commit。5 は 2026-11-23 00:09 に足した（本人の指示 2026-11-22 23:10「ユーザーエクスピリエンスを辿ってデバグしてほしい」の 1 回目の直し）。SSH の署名つきで、作者は `noellesugar99 <noellesugar99@users.noreply.github.com>`、committer は Claude。

## 手順

1. iceiceice999/rock を push の権利で足して、clone する。k999ln/rock は足さない（名前がぶつかる）。最初に AGENTS.md を読む。
2. 旧リポジトリから取ってくる。k999ln/rock は public なので、足さなくても読める。
   ```bash
   git fetch https://github.com/k999ln/rock 'refs/heads/claude/ice/*:refs/remotes/staging/*'
   git rev-parse staging/security-rsc-19-2-9 staging/noah-collector-steady staging/noah-board-picks staging/design-references
   ```
   上の表の commit と同じか確かめる。違ったら止めて報告する。
3. 1 つずつ push して、PR を作る（GitHub の REST）。
   ```bash
   git push origin staging/security-rsc-19-2-9:refs/heads/claude/security-rsc-19-2-9
   gh api repos/iceiceice999/rock/pulls -f title='fix(security): React Server Components の RCE を直す（19.2.9）' \
     -f head=claude/security-rsc-19-2-9 -f base=main -F body=@pr/security.md --jq .number
   ```
4. PR の番号を、その枝の CHANGELOG に入れる。commit を 1 つ足して push する（force push はしない）。
   ```bash
   git switch -c claude/security-rsc-19-2-9 origin/claude/security-rsc-19-2-9
   sed -i "s/SECFIX/<番号>/g" CHANGELOG.md
   git diff --stat   # CHANGELOG.md の 1 行だけが変わる事
   git -c user.name=Claude -c user.email=noreply@anthropic.com commit -S \
     --author='noellesugar99 <noellesugar99@users.noreply.github.com>' -am 'docs: CHANGELOG に PR #<番号> を入れる'
   git push origin claude/security-rsc-19-2-9
   ```
   署名の設定が無い時は `-S` を外す。commit の最後には、そのセッションの決まりの署名行（Co-Authored-By など）を付ける。
5. マージする。
   - 安全の直し（表の 1）を最初にする。その PR の最新の commit で、check（ci.yml の verify、spider.yml など）が全部 success・neutral・skipped になったら、マージする。
     ```bash
     gh api -X PUT repos/iceiceice999/rock/pulls/<番号>/merge -f merge_method=merge -f sha=<その PR の最新の commit>
     ```
   - check が 1 つでも落ちたら、マージしない。落ちた check と試験の名前、main の直近の同じ check でも落ちているかを調べて、報告する。
   - 1 が入ると、2〜4 の CHANGELOG がぶつかる。その枝に main を merge して、両方の行を残す。
     ```bash
     git fetch origin main && git switch claude/noah-collector-steady && git merge origin/main
     python3 tools/merge-changelog.py CHANGELOG.md   # CHANGELOG.md 以外がぶつかったら止めて報告する
     git add CHANGELOG.md && git -c user.name=Claude -c user.email=noreply@anthropic.com commit -S --no-edit \
       --author='noellesugar99 <noellesugar99@users.noreply.github.com>'
     git push origin claude/noah-collector-steady   # fast-forward だけ
     ```
     check が全部通ったら、2 → 3 → 4 → 5 の順にマージする。5 の CHANGELOG は `## 2026-11-23` の新しい節なので、ほかとはぶつからない事が多い。
6. 安全の直しが main に入ったら、avoado.si（Sites）を main から公開し直す必要がある。公開はノエルか Codex がする。AGENTS.md の 8 のとおり、公開の前に main と Sites ソースの `git rev-parse 'HEAD^{tree}'` を照合する。これを報告に書く。
7. 旧リポジトリの PR（k999ln/rock#416・#417・#418・#422）は、前のセッションが「移した」と書いて閉じた。新しい PR の番号は、報告に書く。

## してはいけない事

- AGENTS.md の 6 にある事（本番 D1 への migration、本番の鍵、実資金の移動、外部への申込・問い合わせ、git の履歴の書き換え、main への直接 push）。
- force push。他の人の枝や PR を触る事。試験を消したり、書き換えたりする事。
- 秘密の値を、チャット・Git・ログに書く事。

## 確かめ済みの事（前のセッション、main 94d2c762 の上に 4 つを重ねて）

- `npm test`: 5,137 本のうち 5,099 本が通った。落ちた 34 本のうち 33 本は、手を入れていない main でも同じ名前で落ちた（root で動かした事と、Node 22 に無い SQLite の機能。CI は Node 26.12.1）。残りの 1 本は、`npm ci --prefix sites/avocado-mini` をしたら通った。
- `tsc --noEmit`・`lint:product`・repository・project・design・release・schema・database の検査: 通った。
- b310b319 の上に移した後も、もう一度流した。上の検査は全部通った。`npm test` は 5,137 本のうち 5,100 本が通り、落ちた 33 本は、手を入れていない main でも落ちる物と同じだった（新しく落ちた物は 0）。
- 安全の直し: build、build の出力に 19.2.8 が無い事、wrangler local で `/`・`/noah`・`/noah/explore`・`/noah/teikibin` が 200、応答ヘッダの検査が PASS、web-bundle・web-assets の検査が通った。`npm audit` は 18 件（critical 1・high 3）から 10 件（critical 0・high 1）。
- gitleaks（`.github/spider/gitleaks.toml`）: どの commit も 0 件。
