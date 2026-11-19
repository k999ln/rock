# Noah セレクト・リセール実行契約

## 2026-11-17 — ターミナル用テンプレート

本人の追加指示により、主な起動方法として[CLIテンプレート](../../toolkits/noah-resale-agent/README.md)を追加。`node agent.mjs`からinit/doctor/status/run/watch/apply/quote/review/execute/reconcile/stop/resumeを実行し、Webサーバー・ブラウザ不要で既存リセールserviceと公式adapterを呼ぶ。既存Webは保持する。CLIのWork監査transportはterminalで、一般Webのrecord APIからterminal実行を偽装することは許さない。

設定は`noah.resale.cli/1`、確認書は`noah.resale.cli-approval/1`。3担当の条件・共有予算は同じ保存先のWork SQLiteへ保存する。ローカル本人領域は0700、DB/設定/確認書は0600。WebのD1とは独立で、自動同期や同じ実予算の二重利用はしない。ROCKは共通処理/CAS予約/lease/梱包を担当し、OWNERは保存先・予算・API利用権・個別内容を確定、EXTERNALは注文/出品の正本、JOINTが実provider受入を担う。

確認書は5分・owner・provider mode・資格情報fingerprint・商品条件・Work revisionに固定し、外部購入/公開は表示内容hashの明示指定でのみ実行する。保存後の条件変更、別保存先、別アカウント、再利用、期限切れは拒否。watchは探索だけを15分間隔で実行し、同じ保存先の多重watchを期限付きSQLite leaseで拒否する。stopは永続停止、SIGINTは当該watch終了。異常終了/通信断は既存の照合・予約保持を使い、APIへ再発注しない。バックアップは全プロセス停止後に保存先全体を非公開領域へコピーする。

配布は共有sourceをbundleした単一agent.mjsと設定/説明/manifest。Node.js 22.13以上だけで起動でき、node_modules不要。生成物はGit管理外のwork/noah-resale-agent-templateへ置く。demoはネットワーク禁止下で全工程を動かす明示fixtureで、別の一時保存先を使い、実商品・入金・利益と表示しない。合格条件は再起動復元、端末監査、同時発注1回、確認書改ざん/別owner/別account/期限切れ拒否、watchのlease/停止、別ディレクトリの独立起動。証拠はdata/project-status.json#noahSelectResaleAgents.cli。LLM自動目利き・完全無人売買・入金自動同期・API資格情報の自動取得は未実装。以下はWeb版の履歴と共通業務契約。


2026-11-16。本人の「役割だけでなく、商品探しから仕入れ・出品・利益管理まで実際に動くagent」の実装。Business Pilots / ROCK、B02・B05・B06。稼働先は `/Volumes/avokado` の本人用 `http://127.0.0.1:3107/noah/resale`。root側にも再開用ソースを保持する。既存の3役割設定とは別に、実APIと永続状態を持つ専用実行画面を追加する。

## 目的と利用体験

ストリート服、アーカイブ服、デザインオブジェの3担当が、保存した検索語でeBay商品を探索し、1つの候補・在庫へ集約する。商品URLの手動登録も可能。採算の根拠→配送税込み見積→購入→受取/検品→販売原稿→掲載→売上/返品・収支を同じ商品IDで追う。写真・実寸・来歴・適切な手入れによる情報と状態の改善を扱い、架空の限定数や値上がりを作らない。

## 責任と権限

ROCKは本人隔離、状態遷移、予算予約、重複防止、保存復旧、adapterを実装。EXTERNALのeBayはAPI利用可否・商品/注文/出品/決済の正本。OWNERが予算、商品ごとの購入条件、実検品、写真の利用権と出品内容を確定する。JOINTがsandbox/本番の実往復を受入する。モデルの評価を取引権限に昇格しない。現在は決定規則による実行器で、LLMの自動目利き、実物の手入れ・撮影・梱包・発送、値上がり保証は含まない。

## 入出力・ID・版・上限

`GET/POST /api/noah/resale`、schema `noah.resale/1`。所有者から安定したWork UUIDを作り、3担当が1つの台帳を共有する。商品UUIDとprovider商品ID、操作UUIDを別々に持つ。入力はaction/revision/itemId等、出力はWork/予算集計/接続設定有無/内容digest。入力20KB、provider応答1MB、1検索20件、保存100商品・外部操作100件、Workイベント1000件、訂正50件。USDはcent整数、JPYは円整数。換算しない。初期eBay adapterはEBAY_USで、販売通貨/配送先の互換性はprovider受入で確認する。

## 状態と失敗

candidate → purchasing → purchased → received → publishing → listed → sold。購入/公開の通信断はpurchase_unknown/listing_unknownとして予約を保持し、再送しない。状態不一致・期限切れ見積・赤字条件・予算超過・重複・revision競合は拒否する。初期予算と1点上限は0。仕入累計と予約を差し引き、売上による予算の自動増額は行わない。本人による過去購入記録は事実記録のため予算超過も保存でき、残額が負になる。

## 保存と復元

既存D1 `work_jobs` のowner別payload/revisionを使い、新DBやWalletを作らない。`lib/workflow.ts`で専用形式を復元・イベント記録し、一般Workのcomplete/recordによる誤完了を拒否する。取引済み・操作履歴ありの商品は削除不可。未購入候補のみ削除できる。取引番号と集計だけを保存し、資格情報をWork・ブラウザ・Gitへ入れない。配送見積には本人の配送先が含まれ得るため、ローカル本人領域から公開しない。バックアップは既存local-web-stateのD1保存先を使う。版変更時は旧payloadとの互換を先に検証する。

## 停止・再送・照合

購入/出品の前にCASで予約を永続化し、停止状態を再読込する。発注は確認済み見積のitem/quantity/配送/総額digestが最新provider読戻しと一致する場合だけ1回。発注前に停止/見積変更したとコード上で証明できる場合だけnot_dispatchedとして予約解除し、見積を取り直す。送信後の例外には適用しない。出品はoffer IDを保存してから公開する。停止は新規発注/公開を止めるが、送信済み注文を取消す機能ではない。unknown/pendingは同一注文・SKUのprovider読戻しで解決する。照合できない失敗は予約を残して個別対応し、未成立を推測して解除しない。

## 接続と実行

既定はsandbox。サーバーsecretとして `RESALE_EBAY_BROWSE_TOKEN`、`RESALE_EBAY_BUYER_TOKEN`、`RESALE_EBAY_SELLER_TOKEN` を接続範囲ごとに設定。出品には `RESALE_EBAY_LOCATION`、`RESALE_EBAY_FULFILLMENT_POLICY`、`RESALE_EBAY_PAYMENT_POLICY`、`RESALE_EBAY_RETURN_POLICY` も必要。トークン失効は接続エラーとし、勝手に再認証・権限拡大しない。本番は `RESALE_EBAY_ENV=production` と `RESALE_EBAY_LIVE_ENABLED=true`、同accountのprovider受入・本人の具体的取引確認が必要。資格情報の存在表示はAPI利用許可・稼働成功ではない。

eBay Order APIは承認された利用者向けであるため、API利用権を先に確認する（[公式Order API](https://developer.ebay.com/develop/api/buy/order_api_v1)）。購入接続が使えない販売先は公式画面で購入し、注文番号を本人入力する。メルカリ個人向けの無断自動操作を追加していない。[Browse API](https://developer.ebay.com/develop/api/buy/browse_api)、[Inventory API](https://developer.ebay.com/develop/api/sell/inventory_api)を使う。

3担当の検索語を画面で保存後、稼働sourceで `node scripts/noah-resale-watch.mjs --once` が一巡、`--watch` が15分間隔の探索。ブラウザは不要だがMac・Noahサーバー・当該プロセスの稼働が必要。Ctrl-C/SIGTERMまたはNoahの停止で新規探索を止める。起動設定の自動登録は行っていない。探索器は購入/公開を呼ばない。購入と出品には画面で具体的内容の確認が必要で、完全無人売買は未実装。

## 利益と限界

記録上の利益 = 売上 − 購入総額 − 販売/決済手数料 − 発送送料 − 手入れ/梱包など実費 − 返金。訂正前の値を履歴へ残す。現状は本人が取引明細を入力し、provider入金の自動同期・Wallet残高・税務上の確定利益にはしない。限定性・真贋・成約相場は根拠資料が必要で、販売中価格を成約価格として使わない。

## 受入・証拠・未決定

`node --experimental-strip-types --test tests/noah-resale.test.mjs tests/mercari-revenue.test.mjs` はSQLite実保存復元・owner隔離・3担当探索・返金損失・同時発注・通信断/再起動・予算・見積変更・公開checkpointを検証する。fetchは合成応答であり実eBay合格ではない。UI、型、lint、build、全体検証結果はrootの `data/project-status.json#noahSelectResaleAgents.runtime` と対象のCHANGELOGへ記録する。予算/1点上限・利用市場/アカウント・公式API利用権はOWNERと確認待ち。接続後はsandboxで同一商品→発注→掲載→照合を受入し、その証拠を本番へ読み替えない。実購入・実掲載・実売上・一般公開・Git main統合は未実施。
