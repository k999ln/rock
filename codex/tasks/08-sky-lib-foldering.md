# 08 lib/sky-*.ts 104 本を lib/sky/ 配下へ

目的: Codex が Sky を直すときに 104 本を全部読まないで済むようにする。

## やること
1. `ls lib/sky-*.ts` を機能で分類し、この md に表を書く。候補のサブフォルダ: `lib/sky/catalog/`（market, listing, pricing）、`lib/sky/runtime/`（agent-runtime, a2a 連携）、`lib/sky/billing/`、`lib/sky/model/`（model-routing, Luna/Sol/Astra）、`lib/sky/web/`（sky-web, domain router）、`lib/sky/handoff/`（zema→work handoff）。
2. 1 サブフォルダ = 1 PR で `git mv`、import 更新、tests/ の対応ファイルも同じ PR。
3. 各サブフォルダに `README.md` 10 行以内（何が入っているか、入口の関数）。
4. `npm run verify` と `npm run sky:check`。

## 合格条件
- `ls lib/sky-*.ts` が 0 本。
- import パスを変えただけで振る舞いは不変（tests が通る）。

## やらないこと
- 関数の分割・統合・リネーム（移動のみ）。
