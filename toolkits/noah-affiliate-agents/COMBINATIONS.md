# サービスとAgentの組み合わせ

公開入口は https://avoado.si/noah/combinations 。本人確認なしで準備票を作る。運用botの投資判断・発注・鍵の保管は行わない。運営側の紹介報酬と利用者の投資損益を分ける。

## 工程

1. `combination-candidates.mjs` の `draftCombinationCandidates(tools, offers)` へ、公式根拠で確認したサービスキーを持つツール・案件を渡す。名称の類似だけでは組み合わせない。候補はすべて未公開・紹介無効で作る。
2. 対応サービス、利用規約、成果地点、除外条件、提携、実媒体、許可チャネル、正式リンク、公開原稿を照合する。各確認を `combination-core.mjs` の設定形式へ記録する。候補数の増加で確認を省かない。
3. 検証済みの公開情報だけ `guideApproved` を設定すると定期処理がガイドへ反映する。`contentApproved`、`mediaApproved`、`partnered`、`termsConsistent` は別の確認。記事公開や設定の存在を、広告主の承認として扱わない。
4. 15分ごとのDurable Object alarmが条件と取得期限を点検する。5分ごとのWorker cronがalarmの欠落を復旧する。新しい規約を自動で承認する処理ではなく、期限切れでは紹介を停止する。
5. 匿名準備票で適合条件を確認し、すべての条件が揃う場合だけ正式Rentracks URLへ匿名uixを追加する。WebとMCPは同じ判定を使う。停止操作後は紹介を返さない。
6. 支持された既存Chrome Tabを `collectCombinationObservations(tab, config)` に渡す。全媒体・全状態の365日以内の注文/承認を、表形式・小計・範囲を検証して取得する。0件も実取得の受領とし、取得不能とは分ける。
7. `publishCombinationObservations(observations, token)` で所有者口に保存する。案件・媒体・発行済みuixが一致する実成果だけ帰属し、重複を加算しない。確定状態の逆行は自動で上書きしない。

## 設定と運営

非公開設定は `noah-combinations/1` の `schemes` 配列。実案件の単価・媒体ID・正式URL・契約根拠・所有者トークンはGitへ入れない。Worker secretのサイズ制限に合わせ、JSONを順序付きの `COMBINATION_CONFIG_PART_01`〜`32` に分割できる。単一の `COMBINATION_CONFIG_JSON` は試験や小さい設定に対応する。分割数を減らす場合は残った旧partを削除してから切り替える。

配備設定は `combination.wrangler.jsonc`。所有者の `POST /operations/api` はBearer認証必須。操作は `start`、`stop`、`status`、`observe`、`cost`。費用は累積額と現在revisionを指定し、記録されていない費用を0円とみなさない。承認額から費用を引いた値も銀行入金を意味しない。

公開MCP `/consult/mcp` は `list_service_combinations` と `prepare_service_connection` を提供する。ASPへのログイン権限や運営操作を公開しない。公開HTTP `/api/catalog` と `/api/prepare` はNoahの画面でも利用する。準備票の生入力を台帳へ保存しない。

## 現時点の検証と未完了

2026-11-22に3件の公開準備ガイドを配備。初回alarm実行、公開APIの準備票、紹介URLが出ないこと、無認証の運営操作401を実確認。実成果・承認の6時間ごとの読取はCodexの既存Chromeチャットで設定したが、初回確認はログイン切れのため未取得。実行には端末の稼働・Chrome操作ツール・ASP認証が必要。未接続を受領済みにしない。

金融案件は現行条件の再確認・提携・実媒体・正式リンクが未受入で、報酬対象の紹介は0件。銀行着金の確認も未受入。新規媒体登録は本人が不要と回答しており送信しない。申請・問い合わせ・取引を勝手に実行しない。実際の成果承認までの通し受入が終わるまで、全工程自動化や収益獲得の完了とは扱わない。

試験: `node --test tests/noah-combinations.test.mjs tests/noah-business-sources.test.mjs`。合成データは試験内のみ。実ASP・銀行へ試験注文を作らない。

## 収集Agentと提携済み案件の照合

`revenue-sync.mjs build-index capture.private.json output.private.json` は全ページ件数と重複を確認し、提携中だけの用途索引を作る。単価・顧客・銀行・広告タグを索引へ含めない。元の取得日を保持し、変換日を現行条件の確認日へ置き換えない。

`revenue-sync.mjs sync index.private.json secrets.private.json --start` は既存Workerのowner認証で索引更新・開始・1回の照合を行う。以降は同じDOのalarmが15分ごとに進める。`revenue_status` は完全世代・取得中ページ・候補理由・自社Agentの公開判定を返す。`revenue_stop` はexpectedRevision付きで停止し、公開一覧を直ちに空にする。候補一覧は最大250件のサンプルと全件集計で、全件が承認されたという意味ではない。

自社Agentは `BUSINESS_OPERATIONS_TOKEN` で既存の法人実行器の条件を読み、固定先だけを `/api/revenue` へ公開する。外部収集Agentは用途が一致しても実行証拠・対応/媒体確認がない間は要確認。Noahの公開一覧では自社の専用レーンとして扱い、MCP公式登録や第三者収集実績を創作しない。提供元実行は収集担当の共通Work/所有者ゲートへ統合する。

この統合の本番適用には、既存WorkerのCloudflare配備権限、最新mainのSites反映、provider担当のMCP対応commitが必要。コードの試験成功だけで本番適用済みと記録しない。

## 公開サイトの実診断
`site-diagnostics.mjs` は固定2操作（WordPress保守相談 / EC制作準備）のみを、実測toolDigestと照合して呼ぶ。`execution` の検証日時は7日以内、提携索引は24時間以内、登録記事の原文タグ確認が必要。対象は管理を許可された公開HTTPSトップページに限定。無料上限と24時間キャッシュを守り、認証・支払い・別操作へ自動で進まない。

公開は `/api/revenue` と共通Noah一覧、各 `/consult/site/{id}/mcp`。運営の既存 `start/stop` と提携索引停止が公開・紹介を閉じる。診断中に停止されても紹介は返さない。診断の公開結果だけを最大100件キャッシュし、相談本文は保持しない。

`registeredArticle` は対象ブログの記事URL・媒体ID・原文タグ一致の証拠。正式タグへuixを追加しない。`collectCombinationObservations` は案件名と媒体IDで絞った観測に媒体IDを添えて取り込む。`report.registeredMedia` は媒体単位で、個別Noah帰属の `approvedYen` とは別。クリック・診断・紹介件数は報酬ではない。

6時間の取得では各追加記事の掲載・原文タグ・提携条件も再確認する。提供元の操作定義変更/無料利用条件の変更は自動承認せず、公開を止めて再検証する。ASPのログイン切れは0件として取り込まない。

## サイト診断2件の集客運用

登録済み記事の広告タグを保持して、冒頭の `/start/{id}?source=blog` から固定Noahカードへ案内する。入口は公開条件の再確認後のみ302、失効時503。sourceはblog/x/otherだけを保存し、運営status.acquisitionにUTC日付別のブラウザ遷移要求数を返す。人数・クリックの完全排除・個別成果帰属を保証しない。HEADによる動作確認は加算せず、実ブラウザのQAは別記録にする。

既存6時間heartbeatはChromeでブログ/X指標とASPの実注文・承認を読み、最も前段で止まる箇所を改善する。非公開growth-journal.private.jsonを操作前に読み、操作の確定直後にURL・日時・変更理由・前後の本文・観測値・欠測理由を保存する。二重送信を避けるため、結果不明時は投稿一覧を照合してから次へ進む。既存記事の1点改善と、自社Xで役立つチェック項目を紹介する通常投稿のみ。新規媒体、正式タグ改変、有料広告、DM、架空申込なし。

成果確認が認証切れなら欠測を記録し、新規誘導は保留する。古い観測の日付を更新しない。承認を待つ案件は実際の保留日と案件の承認期限を確認し、自動承認・問い合わせ送信は行わない。Mac/Chromeとログインへの依存、定期実行の次回成功未検証を運営結果に明示する。
