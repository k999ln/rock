# 97 出すための運用（巡回を起こす・切り替え・窓口・見張る数・戻し方）

仕様: **[docs/noah/spec-97-launch-ops.md](../../docs/noah/spec-97-launch-ops.md)**（これ 1 本で足りる）。[ローンチの最小限](../../docs/noah/mvp-launch.md) の L8。型と参照実装: docs/contracts/noah-flags-v1.ts、noah-intake-v1.ts の `NOAH_WAKE`・`NOAH_PATROL_BUDGET`。試験: docs/design-validation/noah/noah-flags.test.mjs。先に 85 のローンチ分（L3）。**この task は、全部がローンチの範囲。**

## やること

1. components/sky-service-help.tsx: `<section id="bot">`（仕様書 5 章の文。名乗り、送る物、間隔、止め方、出どころ）。宛先が決まるまで `hidden` で置く。
2. lib/noah-intake-store.ts の `status()` と components/noah-review.tsx: 見張る数（仕様書 6 章の 13 行。切り替えの状態、台帳の巡回、まだ握手していない数、載せている数、載せていない理由、握手の結果、同じ接続先への間隔、接続、依頼、最初の成果、戻ってきた人、画面の幅、失敗の多い接続先）。
3. 合図 1 回の記録: `console.info` の 1 行（仕様書 4 章）。失敗は、合図の応答を 500 にする。
4. services/noah-patrol-wake/README.md: 鍵の作り方・置き方・配備・止め方・替え方（仕様書 4 章）。
5. PR 本文に、本人が行う事の一覧（契約の確かめ、配備、migration 4 本の適用（L7 で、索引の 1 本が増えた）、開ける順、戻し方）を、仕様書 3・4・7・8 章から写す。

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

## 開発進捗

- 2026-11-21 04:55 JST: **L8（出すための運用）は Claude が作業中。** 枝は `claude/noah-ops-l8-20261121`（L7 の枝 `claude/noah-patrol-l7-20261121` = [PR #345](https://github.com/k999ln/rock/pull/345) の上）。同じ範囲を、別の枝で作り始めない。
- L8 で入れる物: `/noah/help` の `#bot` の節（宛先が決まるまで、出さない）、運営の画面の見張る数（仕様書 6 章。`GET /api/noah/intake?state=1` の `launch`）、`services/noah-patrol-wake/README.md` の手順、試験（仕様書 9 章。切り替え・合図・窓口の文・上限の上書き・見張る数・戻し方・記録）、本人が行う事の一覧（PR 本文）。
- すでに入っている物（作り直さない）: 巡回を起こす専用の Worker と合図の入口（L3）、合図の記録の 1 行（L3・L4。`swept` は L7）、切り替えの読み方 `lib/noah-flags.ts`（L3）、つながると確かめた数（L7）。
- 入れない物: 本番への配備・migration の適用・切り替え・契約（本人の許可の後）。報告の数で自動で伏せる作り。
- 2026-11-21 06:10 JST: **L8 を実装した（[PR #346](https://github.com/k999ln/rock/pull/346)。L7 の #345 の上。未マージ。本番への配備・適用・切り替えは、行っていない）。** 記録は、仕様書の 11 章。
  - 入れた物: 運営の画面の「見張る数」（`lib/noah-launch-status.ts`。`GET /api/noah/intake?state=1` の `launch`。16 文を 1 回の batch で数え、5 分の間は同じ値）と、その画面（`components/noah-intake-review.tsx`。期間ごとの数は、表でなく 1 行ずつの文。見出しと行の間を、スマホの幅で読めるようにした）。`/noah/help` の `#bot` の節と、文（`lib/noah-bot-notice.ts`）。一覧と詳細の「報告・取り下げの申し出」の道は、宛先が決まるまで出さない。`services/noah-patrol-wake/README.md` の手順書（鍵・配備・動いているかの見方・止め方・鍵の替え方）。専用の Worker は、鍵が無い時も、送らずに、同じ文で失敗する。
  - 試験: `tests/noah-launch-ops.test.mjs` の 17 本（仕様書 9 章の表の行と同じ順）と、`tests/noah-ready-ui.test.mjs` の 1 本。合格条件の 3 つ（9 章の試験・`typecheck` と `lint:product`・専用の Worker の `wrangler deploy --dry-run`）は、手元で通した。
  - **本人が決める事: D8（取り下げ・報告の窓口の宛先）。** 未定の間、`#bot` の節と、そこへの道は出ない。入れる所は `lib/noah-bot-notice.ts` の `NOAH_REPORT_CONTACT` の 1 行。巡回の名乗りが、この節の URL を持つので、段 1（巡回を開ける）の前に決める事を勧める。
  - 次の担当へ: L9（受入。task 90）が使う物は、`tests/noah-launch-ops.test.mjs`（閉じた時の応答）、運営の画面の「見張る数」（G2・G4 を読む所）、`services/noah-patrol-wake/README.md`。手元で `/noah/review` を開くには、手元の D1 に `sky_tool_packages` の表が要る（`drizzle/0021_sites_schema_convergence.sql` の、その表を作る文だけを流す。手元だけ）。
