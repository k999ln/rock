# 73 接続要件と接続計画（純関数・計画の API・カードの印）

仕様: **[docs/noah/spec-73-connect-plan.md](../../docs/noah/spec-73-connect-plan.md)**。型と参照実装: docs/contracts/noah-connect-v1.ts。試験: docs/design-validation/noah/noah-connect.test.mjs。先に 84。雲の契約が無くても始められる。

## やること

1. lib/noah-connect-requirements.ts: 参照実装の型・`parseNoahConnect`（規則 14 個）・`canonicalJson`・`noahConnectSha256`・`looksLikeNoahSecret`・`noahPublicHttpsUrl`・`diffNoahConnect` を移す。
2. lib/noah-connect-plan.ts: `planNoahConnection`・`noahPlanSha256`・状態遷移（`nextNoahConnectionState`）を移す。
3. lib/noah-connect-source.ts（新規）: `connectForPin(pin)`（仕様書 4.3。`RECIPES` の 13 件は 口 `source`・面 `terminal`・置き場所 `['home']`、モデルは `provider` があれば `own_account`、無ければ `local`）と、`planStateFor(deps, owner, subject)`（4.4。端末は `noah_runner_devices`、応答中は `last_seen_at > now - 30000`）。
4. lib/noah-connect-plan-api.ts、app/api/noah/connect-plan/route.ts: `GET` だけ。未サインインでも返す。書き込まない（仕様書 5.1）。
5. 一覧の各項目に `connect` を足す（lib/noah-launch.ts の `catalog()`、lib/noah-feed.ts、lib/noah-public-catalog-api.ts）。今ある項目は変えない。
6. components/noah-card.tsx（新規。仕様書 6 章の図と props）。印の文は 4 種。カードは `connect` だけを見る。

## 決めてある事（変えない）

- 計画は権限も利用権も与えない。`/api/noah/launch` と `/api/noah/instances` の検査、`sky-tool-package/1`・`noah-agent/1` の parser と hash はそのまま。
- 段の順（account → entitlement → place → runtime → model → services → secrets → consent）と、同数の時の置き場所の順（provider → home → cloud → pocket）。
- 相手の許可の印は「あと 1 タップ（<host> のアカウントで許可）」。

## 合格条件

- `node --experimental-strip-types --test tests/noah-connect-*.test.mjs`: 通る形 6、拒否する形 37、計画の表 27 行、状態遷移 170 通り、今ある 13 件の全部から接続要件が作れる。
- Mac の runner を動かした本人には 13 件が「1 クリック」、止めた本人には「準備が必要（端末を動かす）」。未サインインでも計画が返り、表の行数が変わらない。
- 幅 390 でカードがはみ出さない。`npm run typecheck`、`npm run lint:product`。
