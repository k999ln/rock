# 96 接続要件と接続計画（純関数・計画の API・カードの印）

仕様: **[docs/noah/spec-96-connect-plan.md](../../docs/noah/spec-96-connect-plan.md)**。型と参照実装: docs/contracts/noah-connect-v1.ts。試験: docs/design-validation/noah/noah-connect.test.mjs。先に 84。雲の契約が無くても始められる。

## ローンチまで（先に、この範囲だけを出す。[ローンチの最小限](../../docs/noah/mvp-launch.md) の L2（純関数）と L5 の一部（計画の API・カード））

仕様書の **9 章** だけを見て作る。完了の定義も、その章にある。

- 先に要る PR: 純関数（L2）は無し。計画の API とカード（L5）は、L4（86 の握手）の後
- やる: L2: 下の「やること」の 1・2（純関数と試験を全部移す。`lib/` のどこからも、まだ呼ばれなくてよい）
- やる: L5: 4 と 6 のうち、取り込んだ系列（相手のサーバー）の分（9.3・9.4）。74 のローンチ分と同じ PR に入れる
- やらない（出した後）: 3（`lib/noah-connect-source.ts`。今ある 13 件の接続要件）
- やらない（出した後）: 5（今の一覧への `connect` の追加と、行の置き換え）。`components/noah-launch.tsx`・`noah-public-catalog.tsx`・`noah-timeline.tsx` は触らない

## やること（全部。ローンチの後に、残りをやる）

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

## 開発進捗

[PR #330](https://github.com/k999ln/rock/pull/330): L2（純関数）の実装・ローカル検証済み。`lib/noah-connect-requirements.ts`・`lib/noah-connect-plan.ts` へ型と全関数を移設し、設計側は再exportへ集約。参照実装との関数本体・型の一致を確認。検証キットの9群を製品の2テストへ移し、共通入力を `tests/fixtures/noah/connect.mjs` に配置。

検証: `npm ci` と `npm ci --prefix sites/avocado-mini` の後、`PATH=/opt/homebrew/opt/openssl@3/bin:$PATH npm run verify` 成功（主テスト4,444成功・既存skip4・失敗0、仕事API1,918項目・CSV保存385項目、build含む）。設計キット61件・DDL10項目も成功。作業フォルダ間の依存共有によるパス照合失敗は、各フォルダへの独立インストールで解消した。

残件: L5のAPI・カード、既存13件への組み込みは未着手。本番migration・配備・切り替えなし。PRは未マージ。GitHubの秘密値検査はmainから引き継いだ過去3コミットの合成テスト入力を検出している（詳細はPR）。検査・履歴・例外設定は変更していない。

2026-11-21（Claude。[PR #342](https://github.com/k999ln/rock/pull/342)。未マージ）: L5 の、計画の API を入れた。`lib/noah-connect-source.ts`（つなぐ相手の読み取りと、ローンチ版の本人の状態）、`lib/noah-connect-plan-api.ts`、`app/api/noah/connect-plan/route.ts`。一覧の各項目の `connect` も、同じ関数（`noahLaunchPlanState`）で計算する。試験は `tests/noah-connect-plan-api.test.mjs`（6 本）。記録は [仕様書 96](../../docs/noah/spec-96-connect-plan.md) の 9.6。残り: `components/noah-card.tsx`（画面と一緒に、本人の決定の後）、今ある 13 件への組み込み（出した後）。本番への適用・配備・切り替えなし。

2026-11-21 02:30 JST（Claude。同じ [PR #342](https://github.com/k999ln/rock/pull/342)。未マージ）: カード（`components/noah-card.tsx`）を、L5 の画面と一緒に入れた。名前（詳細への入口）・提供者・説明・印／動く所／料金・主ボタン 1 つ。印とボタンは、一覧の `connect` と本人の接続だけで決める（`lib/noah-ready-view.ts` の `noahBadgeText`・`noahConnectButtonView`）。試験は `tests/noah-ready-ui.test.mjs`（主ボタンが 1 つ・印が文字・状態ごとのボタンの表）。今ある 13 件（Mac の道）のカードへの組み込みは、出した後。
