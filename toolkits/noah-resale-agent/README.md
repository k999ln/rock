# Noah Select Resale — ターミナル用Agentテンプレート

Node.js 22.13以上だけで動く、3担当のリセール実行器です。ブラウザ・Noah Webサーバー・Ollamaの起動は不要。`agent.mjs`、設定JSON、ローカルSQLiteで探索→採算→仕入れ→検品→出品→収支を扱います。既存Noahの業務処理・Workの状態遷移を共有し、LLMの自動目利きや値上がり予測を実装したものではありません。

## すぐ試す

配布フォルダ内で実行します。`node_modules`もnpm installも不要です。

```sh
node agent.mjs demo
```

デモは新しい一時保存先を作り、3担当の架空候補を探索し、1商品を仕入れ→検品→出品→売上記録まで進めます。すべての出力に`mode: fixture`、`simulated: true`を付けます。外部通信・実購入・実出品はありません。表示される利益も架空の検証値です。

開発リポジトリからは `npm --prefix toolkits/noah-resale-agent run demo`。配布版の生成は `node scripts/package-noah-resale-agent.mjs` で、`work/noah-resale-agent-template/`へ出力します。

## 自分のAgentを作る

`agent.example.json`をコピーして、3分野の検索語を編集します。初期予算と1点上限は0です。USDはcent、JPYは円の整数で、通貨換算はしません。例えばUSDの100.00は10000です。初期providerはeBay Sandboxです。

```sh
cp agent.example.json my-agent.json
node agent.mjs init --input my-agent.json
node agent.mjs doctor
node agent.mjs status
```

保存先の既定は `~/.local/share/noah-resale`。全コマンドに `--workspace /自分の保存先` を付けると独立したAgentを作れます。同じ保存先の3担当は同じ予算・在庫を共有します。別保存先は別予算なので、同じ実予算で複数の保存先を運用しないでください。

設定変更はコピーしたJSONを編集し、`configure --input my-agent.json`で反映します。実行時の予算・検索語はDBの記録を正本とし、ファイルの書換えだけでは予算を増やしません。探索間隔は`watch --interval`または保存先の`agent.json`で変更して再起動します。providerモードは初期化時に固定されます。

## API接続と探索

自分が利用権を持つeBay APIのキーを、Git外の環境変数ファイルに保存します。`.env.example`は項目一覧です。秘密値を設定JSON・コマンド引数・チャットへ貼らないでください。秘密ファイルは本人だけが読める権限にしてください。

```sh
node --env-file=/自分の秘密ファイル agent.mjs doctor
node --env-file=/自分の秘密ファイル agent.mjs run --once
node --env-file=/自分の秘密ファイル agent.mjs watch --interval 900
```

`run`は3担当の検索を一巡し、重複を除いて保存します。`watch`は指定間隔の探索専用です。端末とプロセスを起動しておく必要があり、Macのスリープ中やプロセス終了後は動きません。自動起動・クラウド常駐は登録しません。同じ保存先のwatch重複をSQLite leaseで拒否し、異常終了時は最後のleaseから探索間隔＋120秒後に再開できます。

Ctrl-Cでwatchを終了できます。別ターミナルの`stop`は保存済み停止状態を更新し、次の探索/発注/公開を停止します。待機中のwatchは次回起床時に終了します。`resume`で停止を解除します。送信済み注文の取消は別途providerで行います。

[Browse API](https://developer.ebay.com/develop/api/buy/browse_api)、承認利用者向けの[Order API](https://developer.ebay.com/develop/api/buy/order_api_v1)、[Inventory API](https://developer.ebay.com/develop/api/sell/inventory_api)を使います。現在のadapterはEBAY_US、対応通貨/配送条件はprovider受入が必要です。本番は別の保存先を`mode: ebay-production`で初期化し、API利用権・本人の取引条件を確認したうえで`RESALE_EBAY_LIVE_ENABLED=true`を設定します。キーの存在を実接続成功としません。実provider受入は未実施です。

## 商品・検品・利益を扱う

`actions.example.json`から必要な操作のオブジェクト1つを`action.json`へコピーし、実際のID・金額・根拠を入れます。

```sh
node agent.mjs apply --input action.json
node agent.mjs status
```

対応操作は`import`（商品URL登録）、`assess`（採算根拠）、`receive`（本人の受取/検品結果）、`draft`（出品原稿）、`settlement`（売上/費用/返金）、`record_purchase`/`record_listing`（公式画面で行った実取引の記録）、`remove_candidate`（未購入候補のみ削除）、`searches`（検索語）です。架空の限定数・真贋・成約実績は作りません。現物の検品・手入れ・撮影・発送は本人作業です。

利益は売上−仕入総額−販売/決済手数料−発送送料−実費−返金。入金明細の自動同期ではなく、本人入力に基づく集計で、Wallet残高へは反映しません。売上訂正は前の値を履歴へ保存します。

## 仕入れ・出品を実行する

購入前に採算を保存し、購入見積を取得します。`quote`はaccountに結びつくcheckout sessionを作りますが、発注はしません。

```sh
node --env-file=/自分の秘密ファイル agent.mjs quote ITEM_ID
node --env-file=/自分の秘密ファイル agent.mjs review purchase ITEM_ID
```

価格・配送先・数量・期限が入った確認書とSHA-256が表示されます。内容を読んで、表示されたパスとhashを使います。

```sh
node --env-file=/自分の秘密ファイル agent.mjs execute --input REVIEW_PATH --confirm SHA256
```

確認書は5分有効で、保存先・アカウント鍵のfingerprint・商品条件・revisionに固定します。`--yes`で一括通過する機能はありません。キーrefreshや設定変更後はreviewを作り直します。別の保存先/アカウントや、編集した誤解を招くpreviewでは実行できません。

出品は受取/検品→draft→`review publish ITEM_ID`→`execute`の順。同じ仕組みで原稿・実物写真・価格を確定します。無在庫出品・全自動購入/公開は行いません。

予約を永続化してから1回だけ送信し、発注前と証明できる停止は予約解除、送信後の不明結果は予約保持・再送禁止です。結果不明時は`status`の操作IDで照合します。

```sh
node --env-file=/自分の秘密ファイル agent.mjs reconcile OP_ID --reference ORDER_ID
```

購入番号が分からない場合や公開前offerの状態が確認できない場合はprovider履歴を確認し、再注文で解決しないでください。

## 保存・復旧・終了コード

保存先は0700、本人ID/設定/確認書/DBは0600で作成。既存`work_jobs`と同じschema/owner/revisionのSQLiteを使い、Web版のD1とは独立した保存先です。Web版の予算・在庫は自動同期しません。WebとCLIで同じ実予算を重複して使わないでください。必要なバックアップは全プロセス停止後に保存ディレクトリ全体（SQLiteとWAL/SHMを含む）を本人の非公開領域へコピーします。確認書には配送先が含まれ得ます。

exit 0はコマンド処理成功、1は設定/入力/接続の失敗、2は一部探索失敗または取引の未成立/要照合です。statusの`operations`を確認してください。保存100商品・外部操作100件・Workイベント1000件の上限があります。現行版は長期の履歴整理・複数販売先への出品・入金同期・トークン更新を自動化しません。デモ/内部試験と実provider取引の合格は区別します。
