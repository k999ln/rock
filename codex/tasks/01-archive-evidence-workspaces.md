# 01 歴史を「復元可能・既定では読まない」形にする

目的: Codex が docs/evidence・workspaces・旧ルート文書を既定で開かないようにし、情報は 1 バイトも減らさない。

## すでに済んでいること（2026-11-02 Fable）
- ルート `.ignore` に archive/, docs/evidence/, workspaces/, drizzle-legacy/, toolkits/mr, vendor/mr, CHANGELOG.md を記載（rg/fd が既定で無視）。
- 旧 README/AGENTS/project.md/PROJECTS.md → `archive/root-snapshot-20261029/`。
- 整理前の main 全体 → branch `archive/pre-restructure-20261102-main-1daf5c3`。

## やること
1. `scripts/check-product-baseline.mjs:1515` の `'project.md'`、`scripts/check-sky.mjs:75` の `PROJECTS.md`、`scripts/project-status.mjs:125-127`、`scripts/workspaces.mjs:207` を `archive/root-snapshot-20261029/...` のパスに直す。project-status が project.md を**書き換える**処理（replaceMarkedBlock）は archive 側に書かないよう、`--legacy` フラグ付きのときだけ動かす。
2. `docs/evidence/` を参照している script（`rg -l "docs/evidence" scripts data --no-ignore`、約 220 箇所）を変えずに済むか判断する。**変えない**のが既定。移すなら `archive/evidence/` へ `git mv` し、参照を全置換、`npm run verify:full` 通過が条件。1 PR で終わらないなら移さない。
3. `workspaces/`（H1, M1–M4, IDEAS.md）は data/development-portfolio.json と重複。`archive/workspaces-20261029/` へ `git mv`。`scripts/workspaces.mjs` が生成している README を archive 側へ向けるか、スクリプトを `scripts/legacy/` に移す。
4. `data/archived-paths.json` に移動したパスを追記（既存の慣習）。
5. CHANGELOG.md 先頭に 1 行。

## 合格条件
- `npm run verify`（task 02 後の短縮版）と `npm run verify:full` が通る。
- `rg -l "project.md|PROJECTS.md" scripts` が archive パスだけを返す。
- `git log --follow` で移した各ファイルの履歴が追える。

## やらないこと
- ファイル削除。docs/evidence の中身の編集。
