# 37 apply lane の判断を Sky の gig-desk につなぐ

設計: docs/sky-earn-parity.md §3。コード: lib/sky-gig-desk.ts `decideLanePass`、scripts/sky-gig-desk.mjs `--lane`。task 36 の後。

## やること

1. Mr. の `skills/earn/gig/scripts/application_direct.py` が planner へ渡している snapshot を、`node --experimental-strip-types scripts/sky-gig-desk.mjs <desk.json> --lane <snapshot.json>` にも渡し、返った decisions を `schemas/application_decisions.schema.json` で検証して使う経路を足す。切り替えは設定1つ（既定は上流の planner のまま）。
2. desk.json の offers / capabilities は lib/sky-gig-offers.ts から生成する。提案数・採用数（ProposalRecord）は lane の outcome 記録から集計する。
3. 上流の planner と Sky の判断を、同じ snapshot で並べて記録する（どちらが採用につながったかを比べるため）。
4. storefront lane 用に、SKY_GIG_OFFERS の型ごとの出品の契約（market_product_contract）を作る。

## 変えないもの

- 送信の二重防止（effect の照合と fence）、公式画面での読み戻しは lane 側のものをそのまま使う。
- lib/sky-gig-desk.ts にサイトへ接続するコードを足さない。

## 合格条件

- 同じ snapshot に対して decisions が schema を通る。
- 受付終了・応募済みの募集に submit_required が出ない。
- `node --experimental-strip-types --test tests/sky-earn-loop.test.mjs tests/sky-gig-desk.test.mjs` が通る。
