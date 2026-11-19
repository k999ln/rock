# 84 画面を取らない決まりと検査

設計: docs/noah-agent-market-design.md §1.3・§4.2、docs/services/noah-screenless.md。最初にやる。契約も許可も要らない。

## やること

1. lib/noah-surface-class.ts: 面の見分け（`none`・`terminal`・`browser`・`screen`・`own-device`）。依存と import から決める純関数。理由を返す。説明文だけで決めない。
2. scripts/check-noah-screenless.mjs: リポジトリの検査。隔離環境の起動引数（`scripts/noah-isolated-runtime.mjs`、`scripts/noah-terminal-runtime.mjs`）に `DISPLAY`・host の mount・host の network・特権が無いこと。runner と client の権限の宣言に、画面・入力・録画・自動操作が無いこと。`npm run verify` に足す。
3. 今ある 13 件（`RECIPES`）と `noah-terminal/1` の登録に面を付ける。全部 `terminal` になることを試験で固定する。
4. 「閉じても進む」の回帰試験。依頼の後に client を切り、runner だけで完了と成果の保存まで進むこと。
5. 画面の決まり。実行中の表示を、操作を塞がない小さな表示にする。許可待ちは「あなたの番」の一覧と通知へ出す。
6. Mac の検査用の計測（検査用の端末でだけ動かす）: 実行中の前面アプリ・窓の一覧・クリップボードの版・runner の権限。結果を Work に残す。

## 変えないもの

- `noah-isolation/1` の値。隔離の条件。Broker の実行前確認。
- 画面の内容や入力の中身を記録しない。

## 合格条件

- tests/noah-surface-class.test.mjs: `pyautogui`・`osascript`・`adb` を使う例が `screen` か `own-device` になり、接続計画が `own-device` を `blocked` にする。
- 検査のスクリプトが今の main で通り、起動引数に `--env DISPLAY=:0` を足した変更で落ちる。
- 13 件の実行中、検査用の Mac で、前面アプリの変化 0、新しい窓 0、クリップボードの変化 0。
- 依頼の後に画面を閉じた仕事が完了し、次に開いた時に成果がある。
- `npm run typecheck`、`npm run lint:product`。
