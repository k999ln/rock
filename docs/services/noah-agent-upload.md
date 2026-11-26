# Noah — 外部Agentの登録・接続

2026-11-26 移行案。以下は現在の登録仕様。既存掲載分の保守範囲と、新規掲載をEveとJevに通すための変更は[開発・掲載の移行設計](eve-noah-agent-fund.md)を参照する。

## 2026-11-17 下書き保存量と登録後整理

- 既存draftの上限32件に、入力JSONと管理対象添付の64MiB、未回収object512件を追加。予約/回収待ちも算入する。旧保存量が超過しても削除せず、増加する保存を拒否する。DBの条件付き更新で同時要求を制限。
- 添付はowner hash/draft ID/保存操作ID/hashの専用keyへ格納する。同じ現行ファイルは再利用し、差替は不変objectとして追加する。保存前予約、保存後のstate照合、draft CASにより期限超過/回収claim後の遅延応答を参照へ昇格させない。
- 保存済み下書きの参照を登録要求へ渡す。manifestと原本（固定テストの同梱を含む）が一致し、Agentがreadyの場合だけ、同じrevisionを登録済みとして整理する。登録中に編集が進んだら新しい下書きを残す。登録の再送で新しい編集を消さない。
- GET /api/noah/drafts/storageで入力/添付/回収待ち/予約と上限を表示。POST同pathで本人namespaceの旧objectを有界走査し、失敗した回収を再試行。cursorはserverが保持する。添付回収はdraft/登録原本の参照を再検査し、回収済みkeyへの新しい参照を拒否する。private公開物/Work/modelのprefixを列挙・削除しない。
- 削除/登録済み下書きは7日間復元可能（POST /api/noah/drafts/[id]/restore、観測revision必須）。期限後は本文と添付参照を回収し、IDの墓標は維持する。未参照添付は24時間の猶予後、既存draft操作と保存管理画面の保守要求で回収する。常設cloud cronとは別の稼働条件。
- 合格条件: 同時保存でquota超過0、他ownerの取得/回収0、参照中object削除0、登録中の新編集消去0、同じ登録再送で整理重複0、失敗後の再試行と復元をUIで確認。回収後も登録済み同版を実VMで実行できること。

2026-11-17招待の実行共有: 作者は「保存版コードのダウンロード」に加えて「この版の実行」を明示許可する。受取人は招待を受け取った後、接続・依頼・停止とライブラリ追加を選ぶ。view/sourceの既存招待へ実行権は後付けしない。`executionAllowed`はsource権限とNode/Pythonのruntime定義がある時だけ受け付ける。`invite-<UUID>`を既存の背景runnerへ接続し、Workに招待/原本ID・manifest/source hash・runtime・grant revision・期限を固定する。開始時・モデル呼出時・終了時に照合し、実行中は期限timerと2秒間隔の権限再確認（通信時間は別）で期限切れ/撤回/許可変更を検出してprocess終了を待つ。画面を閉じても照合は継続し、失効による停止はWorkのfailedとして理由を保存する。購入・外部送信の許可は含めず、既取得ファイルの遠隔消去は行わない。作者の利用集計は既存Workから算出し、仕事本文や成果を公開しない。実UIの接続/実モデル結果/招待撤回と、別利用主体の合成DB試験は別々に記録する。

2026-11-17: Node/Pythonの画面なしテンプレートと任意runtime定義を追加。登録した固定コードをNoahから専用隔離環境へ接続・実行できます。Macの画面・入力・本人browserを渡さず、Anicca旧host設定serverの新規起動は停止しています。現在の境界は[実行契約](noah-agent-execution.md#2026-11-17-本人の画面を操作しないagentテンプレート)を優先します。

2026-11-16: 本書は現在のアップロード実装の契約。下記の初版に対し、末尾のtask68で下書き・URL取得・ZIP整理を拡張した。`/noah`はタイムライン、`/noah/library`は私有登録・取寄せ・受領招待・既存担当設定の参照一覧へ移行。限定招待と作者公開仕様の実装契約は[統合仕様のtask68節](../service-design/noah-agent-platform.md#2026-11-16-task68の実装契約)を使う。一般実行先・売買からの自動実行は引き続き未統合。

- 本人が言う一言: 「自分のagentをアップロードできるようにして」「いろんなagentに繋げれるように」
- Goal: URLまたは定義JSONと任意のZIPを本人用一覧へ保存し、詳細から対応する実行先へ接続する。アップロードは無料、業務実行費用は別。
- Noaがつなぐもの: 専用Web画面、MCP Streamable HTTP、A2A、固定allowlistのローカルアプリ。GitHub URLだけでは実行可能にしない。
- AMCの工程: 定義検査→本人用保存→必要条件表示→明示接続→実行先へ引渡し。Eve内のTool実行は既存Work/Broker/Walletを通す。
- Jevの合格条件: 異なるownerの読取/更新/ファイル取得0件、同じ登録の再送は同じID、改変再送409、上限超過413、未接続を稼働中と表示0件、ZIPの自動展開/実行0件。
- 出力先: `/noah/agents`（一覧）、`/noah/agents/new`（追加）、`/noah/agents/[id]`（詳細・接続・削除）、既存`/noah`・`/noah/discover`からリンク。
- Wallet: 登録は決済しない。外部サービスの料金説明を表示。販売/購入は既存Sky審査・offer・entitlementを再利用する。
- hardware profile依存: 登録・閲覧はphone/PC共通。ローカルアプリは接続されたPC上のみ。公開Webから利用者のMacを勝手に起動できない。
- 失敗時: 入力・認証・保存先・接続診断のエラーを分けて表示し、入力保持・再試行を可能にする。
- 記録: account所有の定義、版、SHA-256、登録時刻、削除時刻。接続診断はその時点の観測であり、永続的な実行許可ではない。

## DB / API契約

- `noah_agent_uploads`: `id` UUID PK、`owner_id`、`manifest` JSON、`manifest_sha256`、`source_key/name/bytes/sha256` nullable、`created_at`、`deleted_at`。定義は不変。更新は新しい登録ID/版。削除はtombstoneで一覧・downloadから除外する。
- `GET /api/noah/agents`: 本人用一覧とownerScope。`POST`: JSON `{id, manifest, rightsConfirmed:true}`、またはmultipartで同項目と`source` ZIP（最大10MiB）。定義JSON最大32KiB。ID再送は同内容なら200、初回201、変更409。
- `GET /api/noah/agents/[id]`: 本人用詳細。`DELETE`: 同一OriginとownerScope必須。`GET .../source`: 所有権確認後、非公開R2からattachmentとしてdownload。
- 全mutationで既存account認証・明示Origin・ownerScopeを検査。未認証401、他人のID/削除済み404、入力400、上限413、保存不可503。R2 URLは返さない。
- R2は`noah/private/<owner-hash>/<id>/<source-hash>`へ保存する。ZIPの整理はtask68のメモリ内検査に限定し、ホストのファイルシステムへ展開しない。DB保存失敗時の未参照blobと削除後blobは保守時に回収する。公開配備前に容量/quota/回収運用を受入する。
- `noah-agent/1`: id（slug）、version、name、summary、author、license、sourceUrl、adapter（web/mcp_http/a2a/local_app/source）、endpointUrl、permissions、priceNote。秘密値・shell commandは定義に含めない。`source`はコード必須・endpointUrl=nullで、準備待ちとして保存する。
- MCPは既存`/api/sky/mcp/inspect`でprotocol/toolsを診断。診断成功だけでTool実行許可を作らない。A2Aは既存allowlist付きdirectoryへ登録。Webは本人操作で専用画面を開く。
- 市場掲載は`/noah/publisher`で公開仕様を別途登録し、既存Packageの審査へ明示申請する。私有ZIPや非公開定義を自動公開しない。旧`/sky/register`の受付は互換経路として保持。

## ローカルAnicca

- 対象は`Daisuke134/anicca`の固定commit `28e7f3f333474f18b5da51acfe18b063cf727ad0`。公式onboarding UIへ引渡す。自身のモデル・処理を維持する。
- loopback専用の開発ホストで、設定済みcheckout/Pythonだけを起動する。ブラウザからcommand/path/環境変数を渡せない。接続解除はNoahが起動したprocessだけを停止する。
- UI起動成功、業務アカウント設定、業務Job成功は別の状態。一般公開Web→Macのremote bridge、任意ZIPのsandbox導入・起動、売買/本番配備は今回の実装検証と別の受入条件。

## 2026-11-16 Agent追加時の自動リファクタ

本人の一言: 「NoahにAgentをユーザが追加する時にリファクトされたコードを保存される仕様」「ファイルアップロードや貼る時」。VS Codeの保存イベントとは別の登録機能。

- Goal: ファイル選択・貼り付けのどちらでも、1回の登録で元コードを先に保管し、対応ルールで整理したコードをNoahに保存する。
- Noaがつなぐもの: 登録API、構文解析器、既存の本人用D1/R2保存。外部モデルへコードを送らない。
- AMCの工程: 本人/Origin/権利/入力上限確認→原本の予約・保存→サーバーでリファクタ→再解析→結果blob保存→D1で保存版を確定。途中失敗はpendingのまま同じID/原本で再送できる。
- Jevの合格条件: ファイルと貼り付けで同じhashの修正版を保存する。原本downloadは入力bytesと完全一致。変更ルールの前後で合成例の出力が一致。二重送信は1登録。別ownerの読取/原本/削除成功0件。構文不正・未対応で「リファクタ済み」表示0件。
- 出力先: Agent詳細で処理状態、原本と保存版のhash、行別の変更内容、原本と保存版のdownloadを表示する。変更箇所のbefore/afterはテキスト扱い。
- Wallet: 登録の構文処理に外部API課金なし。価格設定を変更しない。
- hardware profile: Webサーバーで処理する。ローカルAider/VS Code/Ollamaの起動を前提にしない。
- 失敗時: 元データは保持する。構文不正はoriginalを保存し理由を表示。R2/D1失敗はpendingのまま再送する。保存完了を実行可能/市場公開/動作合格へ昇格させない。
- 記録: 原本/結果のSHA-256、処理器とルール版、状態、変更箇所、構文確認の範囲。

### 初版の範囲

JS/TS（js/mjs/cjs/jsx/ts/mts/cts/tsx）単一ファイル64KiBまで。`if (条件) return true; else return false;`（逆順を含む）を同じ評価順のboolean returnへ整理する。対象範囲にコメントがある場合はコメント保全のため変更しない。フォーマットのみをリファクタ完了とは呼ばない。変更不要は「変更なし」、ZIP/他言語/64KiB超は「自動整理の対象外・原本を保存」、構文不正は「構文を確認できず・原本を保存」。コードを実行せず依存ライブラリも導入しない。型・業務動作の検証は未実施と表示する。

ファイル4バイト〜10MiB、定義32KiB、貼り付けUTF-8 64KiB。ZIPは現行どおり展開しない。他言語は保存のみ。ソースURLは参照情報で、自動取得はしない。秘密値を含めないようフォームで案内する。

### DB / API

既存`noah_agent_uploads`に`original_key/name/bytes/sha256`と`processing_json`を追加する。`source_*`は現在の保存版、`original_*`は登録時の原本で上書きしない。旧レコードはNULLのまま互換読取。`upload_state`のpending/readyは保存状態で、処理状態は`refactored/unchanged/unsupported/failed`に分ける。

`POST /api/noah/agents`: multipartの`source`、またはJSONの`code:{name,content}`。同じ登録IDで内容が違えば409。クライアントから結果・合格フラグ・保存keyの指定不可。`GET /api/noah/agents/:id`に`original`と`processing`を追加。`GET /api/noah/agents/:id/source`は保存版、`?variant=original`は原本。両方とも本人だけ、attachment/no-store/nosniff/CSP sandbox。削除は両方の読取を停止する。

### AIリファクタを追加する次段階

複数ファイル/ZIP/他言語や設計変更は、原本snapshot→既存Workへ公式Agentを割当→隔離した型/固定テスト→候補の差分→保存版確定の非同期処理にする。AI出力だけで動作合格にしない。Work ID/モデル・処理器版/検証証拠を保存し、ブラウザを閉じても処理を追跡、結果不明時は自動再実行しない。この非同期AI処理は本機能の初版では未実装。

### 実測（2026-11-16）

Chromeの追加フォームから合成TSコードを貼り付け、登録`7129d4aa-a01d-4af3-a280-cdad22fd8f71`に保存。`if (value) { return true; } else { return false; }`から`return !!(value);`への差分表示を確認した。同じ原本をmultipartで登録し、原本・結果のhashがそれぞれ一致することをAPIで照合。原本106 bytes、結果73 bytes。再送200、別Origin403、owner不一致409、テスト登録削除後の原本/結果download404。ブラウザのdownloadイベント待機はツールが応答しなかったため、byte照合はAPI経由で確認した。

ローカル開発D1をbackup後に0034を適用。本番migration・公開配備は未実施。変更後の構文確認の合格であり、任意Agentの業務動作や公開配布の合格ではない。

## 2026-11-16 task68: 下書き・リポジトリ取得・ZIP内整理

- 本人の一言: 「Noahの未完了部分を全部実装して、接続から実行までテストして」。この節はそのうち作者の保存/取込で受け入れた範囲。全Agent稼働の完了ではない。
- Goal: 未完成の定義・貼付コード・ファイルをaccount別に保存し、再読込で復元する。公開GitHub/Hugging Faceから固定commitのコードを取得し、登録時にZIP内JS/TSも整理する。
- 工程: 本人・Origin・ownerScope・保存権利→取得元/commit/上限→私有下書き→原本保管→ZIP検査→対応コード整理→全体採否→保存版確定。
- 合格条件: revision競合/他人操作/削除後復活を拒否する。同一操作の再送で1版に収束する。ZIP内の複数コードを整理してもLICENSE等の内容は保持する。構文不正のファイルが1つでもあれば全体の変更を不採用にする。private/gated、転送先の逸脱、取得超過で部分取得成功を返さない。
- 出力先: 下書き一覧・復元URL、Agent詳細のファイル別結果/変更内容/原本と保存版。取得ZIPの`noah-import.json`に取得元・commit・対象範囲・省略件数・各ファイルのSHA-256を記録する。このファイル自体は実行許可やサーバー署名ではない。
- Wallet/端末: 公開ソースの取得と構文処理のみ。外部モデル課金・ユーザーのCodex設定変更・Agentコードの実行を伴わない。
- 失敗時: 保存入力を保持し再試行。下書きはrevision競合を上書きしない。ZIP検査失敗は原本を保存して失敗表示。取得失敗は既存選択ファイルを維持する。

### 下書きのDB/API

`noah_agent_drafts`: id/owner_id/content/source_key・name・bytes・sha256/revision/command_id/input_sha256/created_at/updated_at/deleted_at。`content`は不完全なmanifestとcodeMode/codeName/code/rights。1accountの未削除下書き32件。revisionはCAS、commandIdと内容hashが一致した再送だけ前回成功を返す。削除はtombstone。

- `GET /api/noah/drafts`: 本人の一覧とownerScope。
- `GET /api/noah/drafts/[id]`: 内容/版/ファイルmetadataを返す。
- `PUT`: JSON `{revision, commandId, content, clearSource}`、またはmultipart `draft` JSON＋`source`。初回201・更新/再送200。貼付64KiB・ファイル10MiB。コード/ファイルの保存にはrights=trueが必要。
- `DELETE`: `{revision}`。`GET .../source`は本人用attachment。
- 未認証401、他人の読取404、owner/revision競合409、Origin403、quota429。非公開R2 keyを返さない。

### 公開URLの取得API

`POST /api/noah/import`: `{url, revision?, rightsConfirmed:true}`。URLはGitHubリポジトリまたはHugging Face model/space/datasetのトップ。URL中の秘密値・クエリ・任意hostを拒否。既定版を一度commitへ解決し、以降は固定commitから取得する。公開コード/設定/README/LICENSEだけ1〜32ファイル、各512KiB・計8MiB・要求60秒以内。モデルweightsは対象外。redirectはHugging Faceの同一origin resolve-cache経路だけ許す。認証tokenは送らない。

応答はZIP、`X-Noah-Source-Commit/Files/Omitted/SHA256`。32件超や取得失敗は全体を失敗として返し、切り詰め成功にはしない。除外されたbinary等の件数を画面に出す。利用者はZIPを確認後、通常の登録操作で保存する。取得だけでは利用可能にならない。

### ZIPの処理範囲

入力/展開後とも10MiB、128entryまで。central/local header、サイズ・CRC・重複名・絶対path/traversal・symlink/特殊file・暗号化を検査する。JS/TS32ファイル・合計512KiB、各64KiB以内を構文整理。対象外の言語/大きさは原本を保持し、ファイル別に未対応と記録する。原本ZIPは不変、変更後ZIPを別hashで保存する。AIによる構造設計の変更、Python等のリファクタ、型検査・固定テストによる業務動作検証は未実装。

実通信確認: Hugging Face `agents-course/First_agent_template` commit `8c5c24b6f1ed08e7fd34a59f44e854580def9101`から9ファイル取得・対象外1件。画面から取得→下書き→本人用登録→原本download経路を確認。主にPythonのため「自動整理の対象外」と表示し、実行対応には昇格しない。
