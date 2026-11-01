# 40 Jennifer を AMC に統合する

決定: 06-naming.md。Jennifer（project chief of staff）は AMC（工程分解・担当・合格条件・進行）と役割が重複。AMC に吸収し、名前を消す。

## 現状
lib/jennifer-amc-decomposition.ts, jennifer-amc-execution.ts, jennifer-coordination.ts, jennifer-execution-reports.ts, jennifer-execution-store.ts, jennifer-passkey.ts, jennifer-projects.ts（7）、app/api/jennifer、data/jennifer-*.json、docs/jennifer-coordination.md、.codex/skills/jennifer-project-manager、drizzle 0014/0015/0023（jennifer_*）、tests/jennifer-*。

## やること（task 04 の後）
1. `lib/amc/` を作り、7 ファイルを `git mv`（decomposition.ts, execution.ts, coordination.ts, execution-reports.ts, execution-store.ts, passkey.ts, projects.ts）。既存 lib/amc-*.ts も同フォルダへ。
2. `app/api/amc/*` に新ハンドラ、`app/api/jennifer/*` は同じハンドラを再 export（1 世代）。
3. docs/jennifer-coordination.md → docs/amc-coordination.md に統合（内容は全文残す。先頭に「旧 Jennifer」）。
4. D1 の table/column 名（jennifer_*）は**変えない**。コード側の型名だけ Amc* に。
5. .codex/skills/jennifer-project-manager → .codex/skills/amc-project-manager。
6. `npm run verify`, `npm run mission:check`, tests/jennifer-* を tests/amc-* に改名して通す。

## 合格条件
- `rg -i jennifer lib app components --no-ignore` が互換 re-export とコメントだけ。
- 旧 API path が同じ応答。
