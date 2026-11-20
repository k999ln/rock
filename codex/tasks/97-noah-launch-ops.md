# 97 出すための運用（巡回を起こす・切り替え・窓口・見張る数・戻し方）

仕様: **[docs/noah/spec-97-launch-ops.md](../../docs/noah/spec-97-launch-ops.md)**（これ 1 本で足りる）。[ローンチの最小限](../../docs/noah/mvp-launch.md) の L8。型と参照実装: docs/contracts/noah-flags-v1.ts、noah-intake-v1.ts の `NOAH_WAKE`・`NOAH_PATROL_BUDGET`。試験: docs/design-validation/noah/noah-flags.test.mjs。先に 85 のローンチ分（L3）。**この task は、全部がローンチの範囲。**

## やること

1. components/sky-service-help.tsx: `<section id="bot">`（仕様書 5 章の文。名乗り、送る物、間隔、止め方、出どころ）。宛先が決まるまで `hidden` で置く。
2. lib/noah-intake-store.ts の `status()` と components/noah-review.tsx: 見張る数（仕様書 6 章の 13 行。切り替えの状態、台帳の巡回、まだ握手していない数、載せている数、載せていない理由、握手の結果、同じ接続先への間隔、接続、依頼、最初の成果、戻ってきた人、画面の幅、失敗の多い接続先）。
3. 合図 1 回の記録: `console.info` の 1 行（仕様書 4 章）。失敗は、合図の応答を 500 にする。
4. services/noah-patrol-wake/README.md: 鍵の作り方・置き方・配備・止め方・替え方（仕様書 4 章）。
5. PR 本文に、本人が行う事の一覧（契約の確かめ、配備、migration 3 本の適用、開ける順、戻し方）を、仕様書 3・4・7・8 章から写す。

## 決めてある事（変えない）

- 切り替えは、値が `true` の時だけ開く。形の違う値は閉じた物として扱う。閉じていても、審査者は使える。
- 合図が持つのは、時刻と署名と空の本文だけ。専用の Worker に HTTP の入口・利用者の情報・鍵（合図の鍵を除く）を持たせない。
- 運営の画面と記録に、本人の ID・依頼の中身・接続先の URL を出さない。5 件未満の接続先を、失敗の多い接続先の行に出さない。
- **この PR は、本番への配備・migration の適用・切り替え・契約を行わない**（AGENTS.md §6）。数（上限・間隔）は候補で、変えるのは本人。
- 報告の数で自動で伏せる作りを入れない（窓口と、運営の取り下げで始める）。

## 合格条件

- 仕様書 9 章の試験: 切り替え 4 群、窓口の文、見張る数（一時 DB で、手で数えた値と同じ）、戻し方（一覧 404・接続と依頼 503・進んでいる依頼は最後まで）、記録に名前と ID が無い。
- `npm run typecheck`、`npm run lint:product`。
- `services/noah-patrol-wake` が `wrangler deploy --dry-run` を通る。配備はしない。
