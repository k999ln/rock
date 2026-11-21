# task101 — 相談・運営AgentをNoahへ載せる

本人指示: レントラックスの案件を利用した相談・運営の両AgentをNoahへ載せられる形にする。参照チャット「gitのrockを確認」01a1f8f6-e45c-7260-bc55-53b2712253bb。

正本: docs/structure/04-eve-noa-amc-sky.md、docs/services/noah-affiliate-agents.md。

範囲: toolkits/noah-affiliate-agents/、tests/noah-affiliate-agents.test.mjs、記録文書。進行中の登録Agent/Noahフロントは変更しない。

合格条件: 相談/運営の分離、紹介許可の検査、非公開情報の投影除外、台帳点検・原稿下書き・実績集計、Noah source ZIP互換、NoahのMCP clientとの接続/呼出試験。未承認リンク・認証なし運営応答0件。

検証: `node --experimental-strip-types --test tests/noah-affiliate-agents.test.mjs`、`npm run verify`。

残件: 配備URLと運営用認証の設定、Noahへの本人用登録、ASPの新媒体掲載許可・正式リンク、スマホ実機の通し受入。レントラックス実績の自動取得・外部送信は今回の実装に含めない。
