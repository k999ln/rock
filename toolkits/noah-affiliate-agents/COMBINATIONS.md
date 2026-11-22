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
