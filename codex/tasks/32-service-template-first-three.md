# 32 サービス書式で最初の 3 枚を書く — ヨガ矯正 / 工場保守ガイド / 請求書作成

正本: docs/structure/04-eve-noa-amc-sky.md §3 の書式。コードは書かない。

## やること
1. `docs/services/yoga-pose-correction.md`: mii 専用（4 Tower の 3D body）。Jev の合格条件は関節角の誤差（例 < 5°）。Wallet はレッスン料（インストラクター）または無料。phone 版は「カメラ 1 台の 2D 版」として「可（精度低）」。
2. `docs/services/factory-maintenance-guide.md`: 「この機械のフィルター交換教えて」。RAG（会社マニュアル）→ Maintenance Agent → 現物認識 → 表示層でボルトを指す。Receipt に誰が・いつ・どの手順。企業ライセンス。phone 版は AR なしの手順表示で可。
3. `docs/services/invoice-generation.md`: 「来月の請求書作って」。Noa が会計 Tool（Sky）をつなぐ。Jev は合計の検算一致。Wallet は天引き（成果報酬があれば）。全 profile 可。
4. 3 枚とも 100 行以内。書けない項目は「未決: …」と書き、空欄にしない。
5. 09-repo-layout.md §4 の表に docs/services/ を追記（済んでいるか確認）。

## 合格条件
- 3 ファイル。各 Jev 合格条件が数値または真偽で書かれている。
