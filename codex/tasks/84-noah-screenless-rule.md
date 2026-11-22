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

## 開発進捗

[PR #329](https://github.com/k999ln/rock/pull/329): L1の実装・ローカル検証済み。起動引数を変えずに `engineArgs()` を抽出し、監査の正本を `lib/noah-screenless-audit.mjs` へ移設。固定13件・Node/Python実行と配置・VMの18構成をverifyで検査する。15通りの緩和拒否と、overviewなしのpoll → start → finishによるWork成果保存を確認した。

検証: `npm ci` と `npm ci --prefix sites/avocado-mini` の後、`PATH=/opt/homebrew/opt/openssl@3/bin:$PATH npm run verify` 成功（主テスト4,438成功・既存skip4・失敗0、仕事API1,918項目・CSV保存385項目、build含む）。関連30テスト・設計キット61件・DDL10項目も成功。使い捨てコピーの `terminalContainerArgs` に DISPLAY=:0 を追加した実CLIは終了コード1で拒否。途中の既存ブラウザー試験のタイムアウトは、単独4件成功と全体verifyの再成功を確認した。

旧PR #329提出時の記録: 面の分類とMac実機の前面アプリ・窓・クリップボード・権限観測はローンチ後。実機OSの合格ではない。本番migration・配備・切り替えなし。PRは未マージ。GitHubの秘密値検査はmainから引き継いだ過去3コミットの合成テスト入力を検出している（詳細はPR）。検査・履歴・例外設定は変更していない。

### 2026-11-23　Agentが必要とする画面と入力の分類

[PR #22](https://github.com/iceiceice999/rock/pull/22)で工程3を `lib/noah-surface-class.ts` に実装。依存・import・コマンドから使う可能性のある面を読み、審査済みの定義や画面なしで成功した試行から、接続要件に書く面を決める。本人端末の操作を必要とする未審査のAgentには実行先を返さない。設計キットも同じ関数を参照する。

分類・隔離・画面を閉じた後の成果保存・設計キットの関連試験12件と、起動引数18構成の検査が成功した。受付への組み込みはtask89。工程6ではMacで前面アプリ、窓、クリップボードの版、権限を同時に観測する。ココナラの限定経路では、Sites 207でタブを閉じた後のMac観測994回でAgentの前面化・表示窓がともに0回。クリップボードと権限を含む工程6は別途観測する。[PR #11の本番受入](https://github.com/iceiceice999/rock/pull/11)
