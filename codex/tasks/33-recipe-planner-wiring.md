# 33 recipe planner を Eve の依頼へつなぐ

設計: docs/work-loop.md §3.1、docs/structure/04 §5。コード: lib/sky-recipe-planner.ts（実装済み・未接続）。

## やること

1. lib/work-composition.ts の `compositionCapabilities` から `RecipeCapability[]` を作る変換を lib/sky-recipe-catalog.ts に書く。素材の型は MaterialKind（text / csv）から始め、Tool ごとの出力型（cited-text、edited-text、checked-text 等）を足す。実費・分数は Tool ごとに定数で置き、根拠を 1 行コメントで書く。
2. Work の Receipt から `RecipeObservation[]`（能力ごとの実行回数・検収合格回数）と `RecipeHistory[]`（工程 key ごとの直近結果）を集計する関数を lib/sky-recipe-observations.ts に書く。
3. components/sky-chat-workspace.tsx の `routeSkyRequest` 呼び出しの前に planner を試す。候補があれば `chooseRecipe` の結果を CompositionPlan に変換して本人へ見せる。候補が無ければ従来の `routeSkyRequest` へ落とす（既存 13 役の挙動は変えない）。
4. gap が返った時は、missingMaterials を検索語として Noah 側へ渡す。

## 変えないもの

- planner は実行を許可しない。Broker・Wallet・Jev の gate を通す。
- tests/sky-routing.test.mjs の期待値。

## 合格条件

- `node --experimental-strip-types --test tests/sky-recipe-*.test.mjs tests/sky-routing.test.mjs` が通る。
- 「この原稿の出典を整えて記事にして検査して」が、出典整理 → 記事編集 → 完成条件を検査 の 3 工程として 1 回で提案される（新しいテスト）。
- `npm run sky:check` と `npm run typecheck` が通る。
