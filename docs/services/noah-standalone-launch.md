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

本人指示: 共通の認証・保存を使い、Noah専用のトップ・メニュー・利用画面にする。紫を基調とする。追加指示「xと同じフロント」により、左ナビ・中央フィード・右検索/Agent欄の3カラム、Agent絞り込み/解除ボタン、区切り線の投稿、モバイル下部は現在地付きの「メニュー」1ボタンにまとめ、開いた一覧に4項目のアイコン・用途説明・現在地を表示する。選択・外側クリック・Escapeで閉じる。

- `/noah`: 既存の統合タイムラインを維持。通常投稿とAgentを既定で全件表示し、Agentボタンで絞り込み、「すべてに戻る」で解除する。フォロー投稿を優先する。ニュース・コミュニティーを外し、専用メニューから探す・使う・仕事・成果へ進む。カード型ホームには変更しない。
- `/noah/explore`: 実行対応Agentを名前・説明で検索する。カードから `/noah/activity` の依頼入力へAgent IDを渡す。研究用の候補一覧とは区別する。
- 共通のNoah専用ナビゲーション: タイムライン、Agentを探す、実行中、成果データ。登録・接続・実行・停止・成果保存の権限は既存APIを使う。
- `/noah#timeline`、既存のqueryとコミュニティーへの遷移、ローカルOSのホーム表示を維持。タイムラインを複製・移動しない。
- サインインは共通accountへ遷移し、Noahに戻る。NoahのヘッダーはNoahの名前・専用メニューにし、OSアプリ切り替えを置かない。
- 合格条件: 主導線がNoah内の既存操作へ到達する、取得失敗を成果0件や実行成功にしない、検索できる、タイムラインと絞り込み・検索・投稿の機能が保持される、390pxで横にはみ出さない、キーボードで主要操作に到達できる。
- リモート実行のL4〜L9完成をこの画面変更で主張しない。現時点で実行できる一覧はMac接続が必要である旨をカードと接続案内に表示する。

- 機能一覧は設けない。旧 `/noah/features` はタイムラインへ戻し、ナビとフッターの全入口を外す。

- ブランド（2026-11-21）: Noahのマークは会社の正式花形ロゴ `/company-mark.png` を使用し、ヘッダーとページアイコンに揃える。白い背景、チャコールの本文、グレーの補足、紫の主要操作と現在地。独自のn.マークは使わない。

- 個人の見解（2026-11-21）: 感想・発見・評価の本文と実際の作者を大きく表示し、返信と反応の確認へつなぐ。フォロー投稿2件・通常投稿1件・Agent紹介1件の順で混ぜる。紹介は「Agent紹介」と明示する。投稿入口には感想を促す問いを置き、投稿本文を自動生成・事前入力しない。空、公開名の設定待ち、取得失敗を区別し、動きを減らす設定に対応。

### 実行中ページと接続の案内（2026-11-21）

- タイムライン上部とメニューの「実行中」から `/noah/activity` を開く。既存の `/api/noah/launch` と所有者確認を共用し、表示中だけ3秒間隔で受付待ち・処理中・完了・停止・結果不明を確認する。実際に処理中の要求だけ動作表示を付け、架空の進捗率や画面共有は作らない。
- 同じページで受領した成果本文・ファイル保存・停止を提供する。Agentの出力はテキストとして表示。通信失敗は0件と区別し、再読み込みできる。
- 接続画面は「1. Agentを選ぶ」「2. Macをつなぐ」「3. 仕事を頼む」の順に案内。Mac未接続時には接続手順への入口を置き、Agentの選択を接続手順とサインインの往復で維持する。Apple Silicon Macの初回導入・本人承認は引き続き必要。
- 回帰確認: `node --experimental-strip-types --test tests/noah-launch-ui.test.mjs`。実コンテナでの接続→実行→成果受領→実行中停止→切断は `node --experimental-strip-types scripts/check-noah-launch-isolation.mjs --root /absolute/existing/noah/root`。既に稼働している専用エンジンと固定Node imageを使い、API・本人・審査はメモリ内の試験データ。外部Agentや本番接続の合格ではない。

- 最新の画面整理: `/noah/launch` の独立画面を廃止し、Agent指定を保持して `/noah/activity` へ転送する。「仕事を頼む」で同じページに接続・依頼入力を開閉し、依頼受付後は成果一覧へ戻る。メニューの重複する自分のAgent・仕事を実行中へ集約。

- 表示は見出し・状態・操作を優先。Agentの能力/実行先/版は項目別の詳細へ、Mac接続は「Noahを開いて接続」と初回ダウンロードに整理する。必要な条件・停止だけを展開して確認できる。

### ボタンで接続するMacアプリ（2026-11-21）

- `/noah/mac` → `noah://connect?agent=<id>` → `Noah.app` の「接続する」。URLはAgent選択を渡すだけで、導入・本人確認・仕事を自動開始しない。画面にターミナルやコマンド入力を要求しない。
- Apple Silicon / macOS 15以降。SwiftUIの単独アプリにRunnerと検証用manifestを同梱。Nodeは公式の固定版・SHA-256を照合してユーザー専用領域へ取得。実行ツールが不足した時だけ固定のHomebrew formulaを導入。Appleの開発ツールが無い場合はmacOSのインストール画面を開く。Homebrew自体が無い場合は公式の固定pkgを照合し、macOSインストーラーを開く。管理者の許可は本人が行う。
- 初回は既存device authorizationをブラウザで承認。認証情報は既存の本人所有600ファイルに保存し、GUIイベントには渡さない。承認URLは公式origin・固定path・短いコードに限定する。既存認証を別originへ転送しない。
- アプリからの接続は公式 `https://avoado.si` が対象。localhost previewへの認証転送・本番API配備は行わない。実接続は公開APIと本人承認が揃ってから別途受入する。
- 導入前に重複起動を排除し、実行器の登録応答後だけ接続済みにする。アプリを閉じても接続を維持。停止・終了時は子プロセスと専用実行環境の終了を待つ。終了確認が失敗した時は停止済みにしない。画面・入力操作の権限を追加しない。
- 配布ZIPはNoah.app一つ。現時点はad-hoc署名の開発プレビューで、Developer ID署名・公証・未導入の別Macの受入は未完了。Gatekeeper回避を利用者手順に含めない。本番配布を完了とは扱わない。
- 合格条件: コマンドを入力せずGUIから準備/承認へ到達、準備失敗/拒否/二重起動で接続成功にしない、停止確認前に停止済みにしない、選択Agentを往復で維持。回帰: `tests/noah-mac-onboarding.test.mjs`、`tests/noah-mac-runner.test.mjs`、`tests/noah-launch-ui.test.mjs`。パッケージ: `node scripts/package-noah-mac.mjs --out <新しい出力先>`。
- 取得元: [Node公式固定版](https://nodejs.org/download/release/v24.22.3/)、[Homebrew公式pkg](https://github.com/Homebrew/brew/releases/tag/7.0.15)、[公式導入条件](https://docs.brew.sh/Installation)。固定URL・上限・hashは `scripts/noah-mac-app/runtime.json`。
