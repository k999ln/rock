# 124 定期便の台帳（入金・締め・払い出し）

本人の決定（2026-11-22 13:04）「配給制にする。…ほんとにお金欲しい人はエージェント作る側になってお金稼げばいいけど一般ユーザは配給。オイシックスみたいなオシャレな感じ」。その後の回答「ゆくゆくは15万が全部配給、でも今はまず現金で」「現金で渡す」「Noahに登録した人全員, 寄与した人」「等分は物、寄与の分は現金」「今日は無料で出す、有料は後」「本人の分から差し引く」。

仕様は [spec-124](../../docs/noah/spec-124-teikibin-ledger.md)。お金の決まりは [07](../../docs/structure/07-decisions-from-minutes.md) の 2026-11-22 と、[04](../../docs/structure/04-eve-noa-amc-sky.md) の「配給のお金の決まり」。

## 段

1. **台帳（この task）**: 表 5 つ（`drizzle/0055_noah_teikibin.sql`）、計算（`lib/noah-teikibin.ts`。`settleCompanyOrder` の 2 層を使う）、保存（`lib/noah-teikibin-store.ts`）、入口（`/api/noah/teikibin`）、利用者の画面（`/noah/teikibin`）、運営の画面（`/noah/review/teikibin`）、試験。切り替え `NOAH_TEIKIBIN` は閉のまま出す。
2. **開ける前（本人と運営）**: 仕様の 12 章。税理士・弁護士の回答、本番の migration 0055 と鍵 `NOAH_TEIKIBIN_KEY`、最初の月の入金の記録、本人の分の率と有料の値段。
3. **物の定期便**: 仕入先が決まったら、運営 Dock の割当（`services/operator-dock`）と、台帳の「物」の行をつなぐ。

## 合格条件（1 段目）

- `node --experimental-strip-types --test tests/noah-teikibin.test.mjs`（17 本）と、関係する試験（`noah-unified-ui`・`noah-intake-*`・`noah-shelf*`・`noah-trial`・`noah-reviewer`・`noah-plan-limits`・`migration-union`）。
- `npm run typecheck`、`npm run lint:product`。
- 切り替えが閉の間、本番の動きは変わらない（新しい表を読むのは、審査者か、開けた後だけ）。

## 引継ぎ

- 振込は運営（ノエル）が押す。Claude・Codex は振込の一覧（CSV）を作るだけ。
- 口座番号・回線番号は保存しない。確かめた身元は HMAC（鍵は `NOAH_TEIKIBIN_KEY`）だけを持つ。
- 本番の migration の適用と鍵の設定は、本人の許可の後（AGENTS.md の 6 章）。
- 同じ PR で、棚・300 人の試行・公開の審査者の判定を、`noahReviewerAccess`（ID と account の印の両方）に揃えた。本番は account の印だけを入れているので、それまで本番では、この 3 つの審査者の操作が使えなかった。
- 決めていない事は仕様の 13 章。
