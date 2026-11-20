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

## 共通処理と維持する違い

| 経路 | 共通化先 | 固有の条件 |
| --- | --- | --- |
| 本人Macのlocalhostからaccount APIへ | `scripts/noah-local-api.mjs` | 呼出元のsocket/Host/Origin確認を維持。転送する認証headerは固定し、外部URLへ転送しない。Work/instance/operationのquery、revision、owner照合は各契約を保持 |
| 私有登録・招待・審査済み公開版のコード取得 | `scripts/noah-source-bytes.mjs` | 2MiB上限・実受信容量照合を共有。私有登録の本人性、招待の実行許可/期限、公開版のmanifest/審査/利用権の照合はそれぞれのloaderで維持。取得は実行許可を新しく発行しない |
| 単一コード・複数ファイルprojectの型検査 | `scripts/noah-source-typecheck.mjs` | 提供されたsourceとcompiler標準libraryだけを読み、host設定・plugin・周囲の依存を読み込まない。各入口の対象ファイルとエラー上限を保持 |
| EveのTool仕事・ニュース仕事の読み書き | `lib/eve-work-client.ts` | 通信処理のみ共通。作成ID・command ID・revision・同意・再開/停止判断は各画面と既存Workが管理。通信層で自動再送しない |

公開WebとMac Runnerの接続はdevice sessionによる外向きHTTPS。localhostのcookie転送とは別契約であり、`scripts/noah-mac-runner.mjs`の認証・lease・切断停止を維持する。固定Agent、本人のNode/Python、招待、審査済み公開版を一律の権限へまとめない。

対象試験: `tests/noah-local-api.test.mjs`、`tests/eve-work-client.test.mjs`、既存`noah-terminal` / `noah-invite-runtime` / `noah-release-runtime` / `noah-mac-runner` / `noah-managed-installations`。全体は`npm run verify`。

## 専用フロント（2026-11-20・task100）

本人指示: 共通の認証・保存を使い、Noah専用のトップ・メニュー・利用画面にする。紫を基調とする。追加指示「xと同じフロント」により、左ナビ・中央フィード・右検索/Agent欄の3カラム、下線タブ、区切り線の投稿、モバイル下部ナビにする。

- `/noah`: 既存の統合タイムラインを維持。ニュース・Agent・投稿・コミュニティーを読み、専用メニューから探す・使う・仕事・成果へ進む。カード型ホームには変更しない。
- `/noah/explore`: 実行対応Agentを名前・説明で検索する。カードから既存のNoah接続画面へAgent IDを渡す。研究用の候補一覧とは区別する。
- 共通のNoah専用ナビゲーション: タイムライン、Agentを探す、自分のAgent、仕事、成果。登録・接続・実行・停止・成果保存の権限は既存APIを使う。
- `/noah#timeline`、既存のqueryとコミュニティーへの遷移、ローカルOSのホーム表示を維持。タイムラインを複製・移動しない。
- サインインは共通accountへ遷移し、Noahに戻る。NoahのヘッダーはNoahの名前・専用メニューにし、OSアプリ切り替えを置かない。
- 合格条件: 主導線がNoah内の既存操作へ到達する、取得失敗を成果0件や実行成功にしない、検索できる、タイムラインと絞り込み・検索・投稿の機能が保持される、390pxで横にはみ出さない、キーボードで主要操作に到達できる。
- リモート実行のL4〜L9完成をこの画面変更で主張しない。現時点で実行できる一覧はMac接続が必要である旨をカードと接続案内に表示する。
