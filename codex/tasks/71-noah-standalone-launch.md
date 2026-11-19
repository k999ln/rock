# 71 Noah単体ローンチ

本人の依頼: 対応Agentの登録・審査・公開から別ユーザーの追加・接続・実行・停止、初めてのMacまで通す。

設計正本: `docs/structure/04-eve-noa-amc-sky.md`、実装契約: `docs/services/noah-standalone-launch.md`。

編集範囲: Noah画面/API、既存Package審査・利用権・Workとの接続、Mac実行器・配布、必要なDB追加、対応試験・README。Eve builder、契約・本番課金・OS書込みは範囲外。

合格条件: 作者と別の審査担当、別の利用者で固定版を照合。接続からWork成果・停止報告まで確認。重複実行0、他owner操作0、自己審査0、期限切れ後の自動再配送0、本人画面の操作0。別Macは実機の結果を区別して残す。

状態: 進行中。制御APIと配布物を実装、合成DB/API試験を実施。本番DB未変更、公開反映・別Mac受入は未完了。

検証: `npm run verify`、`node --experimental-strip-types --test tests/noah-standalone-launch.test.mjs tests/noah-mac-runner.test.mjs`、配布物の新規保存領域導入、別Macの実機受入。

2026-11-19 保存時点: 最新typecheckと主要7テスト成功、ビルド成功。作者/審査者/利用者を分けたローカルHTTP＋実隔離コンテナで接続→Work成果→実行中停止→切断を確認。配布ZIPを空の保存領域へ導入・診断済み。実行は既存MacのVMを使用。利用者は別のApple Silicon Macを利用可能と回答。

全体検証: `PATH=/opt/homebrew/opt/openssl@3/bin:$PATH npm run verify` を実施。集計・DB移行整合性などの既存試験に失敗が残るため、現段階はドラフトとして保存。テストを削除・スキップして成功扱いにはしていない。配布物と本番migrationの準備はあり、本番D1適用は未実施。審査者accountの設定、本番HTTPS、別Mac実機の受入が残る。
