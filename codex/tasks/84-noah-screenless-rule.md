# 84 画面を取らない決まりと検査

仕様: **[docs/noah/spec-84-screenless.md](../../docs/noah/spec-84-screenless.md)**（これ 1 本で足りる）。型と参照実装: docs/contracts/noah-screenless-v1.ts。試験: docs/design-validation/noah/noah-screenless.test.mjs（今の main で通過済み）。最初にやる。契約も許可も要らない。

## ローンチまで（先に、この範囲だけを出す。[ローンチの最小限](../../docs/noah/mvp-launch.md) の L1）

仕様書の **10 章** だけを見て作る。完了の定義も、その章にある。

- やる: 下の「やること」の 1・2・4・5（`engineArgs()`、`lib/noah-screenless-audit.mjs`、`scripts/check-noah-screenless.mjs` と `verify` の鎖、`tests/noah-screenless.test.mjs`、`tests/noah-launch-close.test.mjs`）
- やらない（出した後）: 3（`lib/noah-surface-class.ts` と、その試験）。端末で動かす配布を入れる 89 と一緒に
- やらない（出した後）: 6（検査用の Mac での観測）

## やること（全部。ローンチの後に、残りをやる）（仕様書 6 章の順）

1. scripts/noah-isolated-runtime.mjs: VM の起動引数を `export function engineArgs()` に切り出す。引数の中身は 1 文字も変えない。
2. lib/noah-screenless-audit.mjs（`.mjs`。scripts から import するため）: 参照実装の `auditNoahContainerArgs`・`auditNoahVmArgs` を移す。
3. lib/noah-surface-class.ts: 参照実装の `NOAH_SURFACE_SIGNS`・`noahRuntimeDependencies`・`classifyNoahSurface`・`decideNoahSurface`・`noahPlacesForSurface` を移す。書き直さない。
4. scripts/check-noah-screenless.mjs: `RECIPES` の 13 件の `containerArgs`、`terminalContainerArgs`（実行 2 通りと配置）、`engineArgs()` を検査する。package.json に `noah:screenless:check` を足し、`verify` の鎖へ入れる。
5. 試験を tests/noah-surface-class.test.mjs・tests/noah-screenless.test.mjs へ移す。「閉じても進む」の回帰試験 tests/noah-launch-close.test.mjs を足す（`overview` を呼ばずに、端末側の `poll` → `start` → `finish` だけで Work に成果が入る）。
6. scripts/noah-screenless-observe.mjs（検査用の Mac でだけ動かす）: 前面のアプリ・窓の数・クリップボードの版・runner の権限。取り方は仕様書 6 章の候補を Mac で確かめてから決める。

## 決めてある事（変えない）

- 面は 2 段。依存から読むのは「使おうとする面」。接続要件に書くのは「決めた面」。今の 13 件は、審査済みの実行の定義なので全部 `terminal`（Anicca と QwenPaw は、依存に playwright・mss を持つが、止めない）。
- 読むのは実行時の依存だけ。名前は完全に一致した時だけ当てる。説明文は入力にしない。
- `noah-isolation/1` の値、`containerArgs`・`terminalContainerArgs` の引数、Broker の実行前確認、`RECIPES`。画面の内容や入力の中身を記録しない。

## 合格条件

- `node scripts/check-noah-screenless.mjs` が今の main で 0。`terminalContainerArgs` に `'--env','DISPLAY=:0'` を足した作業用の変更で 1。
- `node --experimental-strip-types --test tests/noah-surface-class.test.mjs tests/noah-screenless.test.mjs tests/noah-launch-close.test.mjs`。緩めた変更 15 通りが落ちる。
- `npm run typecheck`、`npm run lint:product`、`npm run verify`。
- PR 本文に、検査用の Mac での観測（4 項目の変化の数）か、まだ行っていない事を書く。
