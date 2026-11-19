# 71 Noah単体ローンチ

本人の依頼: 対応Agentの登録・審査・公開から別ユーザーの追加・接続・実行・停止、初めてのMacまで通す。

設計正本: `docs/structure/04-eve-noa-amc-sky.md`、実装契約: `docs/services/noah-standalone-launch.md`。

編集範囲: Noah画面/API、既存Package審査・利用権・Workとの接続、Mac実行器・配布、必要なDB追加、対応試験・README。Eve builder、契約・本番課金・OS書込みは範囲外。

合格条件: 作者と別の審査担当、別の利用者で固定版を照合。接続からWork成果・停止報告まで確認。重複実行0、他owner操作0、自己審査0、期限切れ後の自動再配送0、本人画面の操作0。別Macは実機の結果を区別して残す。

状態: 進行中。制御APIと配布物を実装、合成DB/API試験を実施。本番DB未変更、公開反映・別Mac受入は未完了。

検証: `npm run verify`、`node --experimental-strip-types --test tests/noah-standalone-launch.test.mjs tests/noah-mac-runner.test.mjs`、配布物の新規保存領域導入、別Macの実機受入。

2026-11-19 保存時点: 最新typecheckと主要7テスト成功、ビルド成功。作者/審査者/利用者を分けたローカルHTTP＋実隔離コンテナで接続→Work成果→実行中停止→切断を確認。配布ZIPを空の保存領域へ導入・診断済み。実行は既存MacのVMを使用。利用者は別のApple Silicon Macを利用可能と回答。

全体検証: 残っていた12件を修正し、`PATH=/opt/homebrew/opt/openssl@3/bin:$PATH npm run verify` 成功（主テスト4,319成功・既存skip 4・失敗0、仕事API 1,918項目、CSV保存385項目）。追加したMac認証ファイルのリンク・権限拒否試験も成功。公開済みDB移行のハッシュは保持し、新規11移行の全テーブル・インデックスを実D1で確認。新規移行はDDLのみとし、既存下書きの整合処理と配信元の初期登録は通常データ処理へ分離した。

セキュリティ: CodeQLのファイル読取競合4件とテストURL検証1件を修正。残る8件は固定ローカル試験・JSON証拠出力に限定されることを個別確認し、GitHub上で理由を付けて used in tests と判定。解析自体やテストは無効化していない。

Git保存: [PR #322](https://github.com/k999ln/rock/pull/322)。mainとの競合なし。このチャットへ作業ツリーとPRを接続済み。公開・本番HTTPS確認は同PRのリリース記録に追記する。審査者accountの設定、本番アカウントでの実行、別のApple Silicon Macでの実機受入は未完了。
