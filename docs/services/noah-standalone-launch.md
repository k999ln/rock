# Noah 単体ローンチ

- 本人の一言: 「登録・審査・公開から、別ユーザーが追加して接続・実行・停止するまで繋げて、初めてのMacでも使えるところまでテストして」
- Goal: 対応済み固定Agentと審査済みNode/Python配布版を、Eveを開かずNoahから使う。
- 接続: 公開Webのaccount・既存Package/Review/instance/Work・本人Mac runner。Macは既存device authorizationで本人が承認し、外向きHTTPSのみで取得する。認証情報は実行containerへ渡さない。
- 工程: 私有登録→固定source→掲載申請→別権限の審査→公開一覧→利用者の追加/接続→明示依頼→Work成果→停止確認。対応確認前のAgentは調査一覧に残し、実行ボタンを出さない。
- 合格条件: 別ownerの取得/停止0、自己審査0、未審査/撤回/期限切れ配布の新規実行0、同じ要求IDの実行1回以下、本人画面へのアクセス0。回線喪失とrunner終了で自動再実行0。停止はprocess終了後に確認する。原本のhashと配布hashを照合する。
- 出力先: Noahの対応Agent・公開版・作者管理・Mac接続・仕事。登録/実行可能/審査/公開は独立表示。
- Wallet: 初回は無料配布または既存の有効利用権に限定。価格/課金規則を変更せず、購入権と仕事の明示実行を分ける。
- 端末: macOS/Apple Siliconを初期検証対象。隔離VM、Node/Python、固定モデル。Codex系は本人の公式ログインと送信確認が別途必要。Intelは実受入前に対応済みとしない。
- 失敗: lease期限を超えた処理は結果不明、再配送しない。runnerは通信を継続確認できなければ停止し、未報告結果を私有receiptへ保存し、`noah receipts`で同じIDのサーバー履歴と照合する。履歴範囲外は未確認のままにし、自動再送・自動再実行しない。
- 記録: device credentialのhash、owner、boot ID、固定Agent pin、制御commandの状態とlease、既存Workの成果。DBのcommandは配信制御であり別Job台帳ではない。

## API・保存

`/api/noah/launch`は公開対応一覧と本人library/commandを返す。`POST`はconnect/run/stop/revoke、同一OriginとownerScope必須。`/api/noah/runner`はdevice sessionだけでenroll/poll/heartbeat/finishを処理し、browser cookieを受け付けない。tokenをhashでdeviceへ固定する。runner一台の同時処理は1件。leaseは30秒、heartbeatは5秒以内。期限切れ/古いbootの接続を再利用しない。

`noah_runner_devices`はowner/session hash/boot/期限状態、`noah_runner_commands`はowner/device/boot/type/pin/request digest/lease/stop/resultを保存する。秘密値は一覧へ返さない。審査は既存sky_tool_packagesとsky_tool_package_reviewsを使用。審査者accountの明示設定が必要で、作者の自己承認は拒否する。

## 検証の区別

独立した3利用主体のDB/API試験、実隔離VM、公開WebのUI、空のMac保存領域、未導入の別Macをそれぞれ記録する。自動試験の審査fixtureは本番審査ではない。実機を使うまで「初めてのMacで合格」とは書かない。本番migrationは本人の明示許可後にのみ適用する。
