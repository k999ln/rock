# Noah — Agent本体の取り寄せと接続

- 本人が言う一言: 「全部ワンクリックで接続」「いや取り寄せてワンクリックでできるようにして」
- Goal: 詳細の接続操作から、配布物の特定・取得・版と内容の記録・対応runtimeの準備・実測接続までをNoahが進める。紹介先へ移動しただけでは完了にしない。
- Noaがつなぐもの: 出典付きcatalog、公開GitHub/Hugging Face Spacesの配布物、版固定した実行adapter、本人のMac上のCodex/Anicca。
- AMCの工程: 本人確認→配布元解決→本体取得→commit/hash照合→実行adapterの準備→疎通→状態保存。未対応の配布形式は必要条件と取得済みの本体を残す。
- Jevの合格条件: 同時クリックで取得1回、異なるownerの操作0件、外部Origin/任意URL/commandの受理0件、取消後起動0件、上限超過の中断、再起動後の偽接続0件、取得済みだけの接続済み表示0件。GitHub/HFの実取得とCodexの公式protocol応答を検証する。
- 出力先: Noah詳細の取得進捗と接続結果、および自分のNoahの取り寄せ一覧。
- Wallet: 取得・接続確認でモデル推論・購入・有料hardware申込・外部業務を開始しない。推論/実務は既存Broker/Work/Walletの実行契約へ別接続する。
- hardware profile依存: 初回実装は本人のloopback開発Mac。SSDのowner別cacheへ保存する。公開cloud/スマホ→Mac pairing/複数account共用hostの受入は別工程。
- 失敗時: 配布元未確定・本体非公開・認証必要・実行adapter未対応・取得失敗を区別する。再試行は固定版を再利用し、取消はowned子processだけ停止する。
- 記録: ownerScope hash、catalog ID、source URL、commit、archive SHA-256、容量、検出した依存ファイル、状態・時刻。鍵やCodex account詳細は保存/返却しない。端末cacheはaccountの正本には昇格しない。

## 接続契約

- 2026-11-17 Tool接続版: `qwen2.5-tools:1.5b-v1`は固定`qwen2.5:1.5b`の重みを再利用し、Tool定義をJSON描画するtemplateだけをNoah専用参照へ保存する。基底digest・原template SHA256・`tool-functions-json/1`・結果template SHA256・派生digest/容量をcatalogに固定する。元tag/既存aliasを上書きしない。基底の準備/leaseを共有し、create応答消失後は同じ内容のaliasだけ再利用する。未知template/改変された基底/派生hash違いは実行不可。画面に元モデルと修正版の関係を表示し、削除は既存の接続/Work/instance/運用参照保護を使う。
- 同版の基底同時準備は既存single-flightへ集約。修正版の準備/削除も同じ相互排他、取消、失敗再試行を使う。モデル管理画面からの準備とAgent接続は共通経路。QwenPawの新しいWorkは派生model ID/digestを保持し、旧Work/運用は不変。旧運用は停止状態で環境変更を確認してから再開する。
- Jev条件: 不明なtemplateでcreate0件、派生hash不一致で実行0件、同版並行準備のcreate1回、応答消失後の再create0件、参照中削除0件、元tag/hash不変。実APIのTool定義がJSONとして読めること、以前失敗した3ファイル依頼が公式AgentのToolで指定内容を返すことを別途確認する。
- 2026-11-17表示負荷: 接続詳細/一覧、実行履歴、運用状態の定期読取はvisibleな画面だけで行う。hiddenで待機タイマーと進行中の読取を中断し、visibleへ戻ると最新状態を再取得する。1読取処理の同時実行は1件まで。中断済み応答は画面へ反映しない。接続/実行/停止のPOSTはこの読取中断と分離する。合格条件は非表示中の追加定期読取0件、復帰時の再取得、画面破棄による停止POST0件、旧応答による表示上書き0件。
- `GET /api/noah/catalog/owner` は既存account認証からownerScopeを返す。本人IDをブラウザ入力から採用しない。
- 開発host専用 `GET /__noah/installations`、`GET /__noah/installations/:id`、`POST /:id/connect|disconnect|remove`。POSTは同一loopback Origin、ownerScope、空JSON必須。
- 状態: `idle → resolving → fetching → preparing → checking → connected | setup_required | adapter_required | unavailable | failed`。取消/切断は`disconnected`。ページを閉じても取得はhost側で続ける。
- GitHub/HF Spacesの公開sourceをbare Gitとして取得し、commit固定のtarとSHA-256を記録する。未審査sourceをcheckout/実行しない。submodule/LFS実体や依存packageは自動取得しない。
- 取得は1件256MiBまで、tar256MiBまで、3分で中断。host全体同時2件、owner保存20件まで。端末cacheから削除可能。更新は既存版を暗黙に置換しない。
- Codexは公式app-serverで既存本人の接続を確認し、依頼時の送信確認を経て、本人desktopを使わない一時threadと専用VMで実行する。認証ファイルをAgentへ渡さず、進捗・成果・停止をWorkへ記録する。認証の存在だけを推論成功や残量保証にしない。
- Aniccaは固定commitの公式composition runnerを専用VMで動かし、Noahの限定transportから本人Codexへ文章・作業計画の1依頼を渡す。旧Mac設定画面の直接起動・本人desktop操作は使わない。常駐loopや外部サイト業務は未受入。
- 配布物のないSaaSや名称だけの登録を、似た名前のOSSで勝手に置き換えない。モデル/SDK/教材を独立Agentとして起動しない。
- 公開・有料NoahでのCodex認証は別の提供条件と正式な認証統合が必要。本ローカル接続をその許可へ流用しない。

## 一次資料

- [Codex app-server](https://learn.chatgpt.com/docs/app-server): stdio初期化とaccount/read。現在の実行範囲は[実行契約](noah-agent-execution.md)を参照。
- [Hugging Face Spaces](https://huggingface.co/docs/hub/spaces-overview): repositoryのclone。private/protected sourceの取得権限は別。
- Anicca既存固定版 `28e7f3f333474f18b5da51acfe18b063cf727ad0` のREADME/getting-started。既存ホームのschedulerや業務設定は変更しない。


## 2026-11-17 背景モデル準備と共有参照

接続操作は画面を開かず、必要なモデルを裏側で準備して依頼待ちにする。現在の対応はQwen 2.5 1.5BとQwen 3 4B。既存Ollamaの一覧、pull、copy、delete APIを再利用し、配布名・digest・容量を照合する。配布名が別の内容へ更新された場合は自動採用せず停止する。Noah専用名はcheckout namespaceとdigestから決め、本人の元モデル名を削除・上書きしない。

- `GET /__noah/models`: loopback本人限定。確認済み2モデルの準備状態・進捗・接続数・account参照先を返す。
- `POST /__noah/models`: 同じOriginとowner scope、JSON `{action: prepare|remove, model, digest, accepted: true}`のみ。準備は202で受付、削除は完了確認後200。401/403本人条件、409版/使用中/状態競合、413サイズ、415形式、503通信/保存障害。
- `GET /api/noah/models/references?model=...`: accountの使用版、準備候補、queued/running/unknown Work、有効/停止中/未決着の運用を照合。本人の参照だけ返す。参照不能時は削除拒否。
- 接続中leaseはモデルごとに数え、同一モデルの準備は共有する。1接続の取消は他の準備を取消さない。削除中は新規準備を拒否し、結果不明の削除は再照合して再試行する。保存領域を別processと共有しない。
- 新しいWork/運用bindingに`modelSha256`を保持。過去の未記録Workへdigestを補完しない。旧運用はdigest付き環境と厳密一致せず、停止後に新しい運用を設定する必要がある。モデルの複数版更新/復元は未完了。
- `work/runtime-state/noah-models/state.json`はhost cache。accountのinstanceとWorkが利用関係の正本。既存モデルが共有するbytesの実回収量を推測表示しない。
- 推論の`keep_alive: 30s`はNoah専用名だけへ渡す。他アプリの設定を変更しない。タブ非表示時はGETの監視を休止し、接続・実行・停止要求は表示とは独立して完了させる。

合格条件: 2接続で準備1回、片方停止後も削除拒否、全lease解放後もaccount参照があれば削除拒否、取消/保存障害/不明応答から再試行、原本モデル名の保全、実推論とWorkのdigest一致。ブラウザ操作中の実行と停止は実VMで別途確認する。Mac停止後の継続・Pixel/GGUF統合・全85Agentの対応をこの合格へ含めない。

公式仕様: [モデルAPI](https://docs.ollama.com/api/pull)、[copy](https://docs.ollama.com/api/copy)、[delete](https://docs.ollama.com/api/delete)、[メモリ保持](https://docs.ollama.com/api/chat)。


## SSD未接続からの復旧（2026-11-18）

`npm run noah:workspace:check` は既存SSDイメージと保存先を検査し、未接続なら既存sparsebundleだけを元の `/Volumes/avokado` にマウントする。`npm run noah:dev` は同じ検査後にIPv4 loopbackの3107番で起動する。別の保存先はNOAH_WORKSPACE/NOAH_WORKSPACE_IMAGEで明示する。空の保存先・新しいDB・イメージの作成、format、pruneはしない。別内容のmountpointや不足ファイルはエラーで止める。専用VMの起動設定は保存用40GiB、root10GiB、CPU2・RAM4GiBで、既存image/Workを保全する。

合格条件: SSDが無いときに代替DB生成0、別mountpointへの上書き0、再接続後の既存source hash一致、旧Workの保持、接続→実成果→停止/再接続の確認。これはMac停止後のクラウド実行を提供する処理ではない。

## Webの常駐起動（2026-11-18）

`NOAH_NODE=/opt/homebrew/bin/node node scripts/noah-launch-agent.mjs <準備フォルダ>` は本人用plistと既存復旧スクリプトのコピーを準備する。生成だけでは登録/起動しない。登録先は `~/Library/LaunchAgents/si.avokado.noah.local.plist`、launcherは `~/Library/Application Support/avokado/Noah/noah-workspace-recovery.mjs`、ログは `~/Library/Logs/avokado/Noah/`。作業ディレクトリを本人ホームにしてSSD未接続時にも既存imageを検査できるようにする。

RunAtLoad/KeepAlive、再試行間隔30秒、所有者のみ書込の設定を使う。Viteのprivate previewはIPv4/strictPortで3107に固定する。Webの再起動と業務の再送は別。履歴不明のWorkを自動実行しない。停止は `launchctl bootout gui/$(id -u)/si.avokado.noah.local`、同じ設定を再開する場合は `launchctl bootstrap gui/$(id -u) "$HOME/Library/LaunchAgents/si.avokado.noah.local.plist"`。Macログイン・起動状態とSSDが必要。

検収: 実行中Workが0件のときにWebへSIGTERMを送り、launchd PID変更・runs 1→2・HTTP200・既存Noahのタイムライン復帰を確認。Mac自体の再起動試験は未実施。記録は `work/verification/noah-offline-20261118/`。

## avoado.siの公開入口（2026-11-18）

既存公開Site `appgprj_6abdfad4c5648191bcae957913bd02fa` の `/noah` に公開カタログを追加する。`GET /api/noah/public-catalog` は1〜50件の検索・分類・cursor、`GET /api/noah/public-catalog/:id` は固定IDの概要/詳細保存先を返す。D1・本人の登録・Work・接続tokenを参照しない。詳細JSON/透過ロゴは既存asset bindingから配信する。ローカルの `/noah/public` は同じcomponent/APIの確認用。

合格条件: 匿名/認証付きで同じ公開情報、上限違反400、未知ID404、書込拒否、検索条件変更で旧応答を破棄、一覧→検索→詳細→配布元の表示。既存ドメイン・認証・Site ID・公開範囲・DB migrationを維持し、Macのlocalhostを公開proxyしない。追加/接続/実行/停止は起動中のMacのNoahへ明示移動する。スマホからMacの認証付き中継、一般Agentのcloud実行、私有データ同期は未完了。
