# Commerce v2 設計検証の再現キット

このディレクトリは、[決済設計](../sky-commerce-design.md)・[Wallet設計](../wallet-commerce-design.md)・[型契約](../contracts/sky-commerce-v2.ts)・[DDL案](../contracts/sky-commerce-v2.sql)を実装へ引き継ぐための、ローカル検証用コードです。実装済みの決済システムや、本番リリース判定ではありません。外部API、認証情報、実決済、Cloudflareへの接続は使用しません。

## 実行

リポジトリ直下で実行します。Node.js 22.13以上とPython 3.9以上（標準ライブラリの`sqlite3`、JSON関数を備えたSQLite）が必要です。このキット単独の実行に`npm install`や追加のPythonパッケージは不要です。

```sh
node --test docs/design-validation/commerce-state-model.test.mjs
python3 docs/design-validation/validate-sky-commerce-v2.py
```

両コマンドとも失敗時は終了コードが非0になります。機械可読の結果を次に保存します。

- `work/design-validation/commerce-model-results.json`
- `work/design-validation/sky-commerce-v2-validation.json`

出力先を変える場合は、それぞれ`COMMERCE_MODEL_RESULT`、`COMMERCE_SQL_RESULT`環境変数にパスを指定します。相対パスは実行時のカレントディレクトリ基準です。検証結果の件数・SQLiteバージョン・実行時刻は生成したJSONを確認してください。

```sh
COMMERCE_MODEL_RESULT=docs/evidence/sky-commerce-reference-model-results.json node --test docs/design-validation/commerce-state-model.test.mjs
COMMERCE_SQL_RESULT=docs/evidence/sky-commerce-sql-validation.json python3 docs/design-validation/validate-sky-commerce-v2.py
```

引継ぎ時のスナップショットは[有限モデルの結果](../evidence/sky-commerce-reference-model-results.json)（32/32成功）と[SQLiteの結果](../evidence/sky-commerce-sql-validation.json)（103/103成功）です。ソースSHA-256も結果へ記録しています。これはその時点の入力への結果であり、変更後の成功を保証しません。

SQLite検証は既存の`drizzle/*.sql`を名前順に一時DBへ適用し、続けて`docs/contracts/sky-commerce-v2.sql`を適用します。migration inventoryとjournalを照合し、対象SHAと各migrationのhashを記録します。2026-10-01の19件という数を後続mainへ固定しません。検証対象のDDLを正式なmigrationフォルダへコピーしません。一時DBは終了時に破棄され、既存DBやソースファイルを変更しません。

2026-10-01の証拠は履歴として保持し、2026-10-05のmain統合検証は `docs/evidence/sky-commerce-main-integration-validation.json` と `docs/evidence/sky-commerce-sql-main-validation.json` に分離します。過去の全体verify失敗や合格件数を現在の結果に置き換えません。

## 検証する内容

`commerce-state-model.mjs`は設計上の有限な状態モデル、`commerce-state-model.test.mjs`はその反例検査です。金銭の観測事実・返金case・利用権を分離し、返金の重複・順序違い・部分返金・遅延失敗、紛争、OAuth連携、審査、再購入時の世代、短期キャッシュの失効を検査します。返金caseを閉じただけで利用権は戻らず、`refundEntitlementDisposition`、`commerce.refund_case.resolve`権限、注文と利用権の期待revision、証拠参照を要求します。旧注文の返金訂正は新注文の利用権を奪いません。

内部で新しい返金を予約する`reserveRefund`は残額とrevisionを検査します。一方、外部で確定したRefundの観測は結果不明の内部予約と重なっても捨てません。1万円の購入に内部の結果不明予約1万円と外部の成功5千円が重なれば、成功5千円を保持し、未照合予約1万円を別に示して利用を停止します。合計を確定済みの返金総額と表示したり、予約を根拠なく5千円に減らしたりしません。

`validate-sky-commerce-v2.py`は実際のDDLをホストのSQLiteで実行し、制約違反の拒否、条件付き更新、outbox・監査・inboxの更新、返金訂正、再購入、アカウント作成journalなどを確認します。観測やAPIの動作を模したfixtureのみを使用し、Stripeには接続しません。結果には入力DDLのSHA-256と、適用した既存migrationの名前を保存します。

## 有限モデルと検証範囲の限界

- 金額は主に10,000の例、注文は購入グループあたり最大2、返金は最大4、キャッシュの順序は最大3操作です。1,440行の決定表には到達不能な組合せも含みます。順列検査は指定した独立イベント集合に対するもので、無制限の金額・件数・並行実行を網羅する証明ではありません。
- 権限・本人意思・証拠はテスト用の値です。実gateway、署名、鍵ローテーション、OAuth、本人確認、契約の真正性を検証していません。返金caseのrevisionはこのモデルでは注文revisionに含めています。実装で別aggregateを設ける場合はそのrevisionも同じtransactionで検査します。
- モデルのclone後commitは原子的な成功/失敗を仮定します。ホストSQLiteの結果もCloudflare D1のバッチ、レプリカ、障害時処理、負荷、実運用の分離レベルを保証しません。実装ではD1環境で競合・切断・再試行を別途検証します。
- モデルは本番の決済関数をimportしていません。モデルの全件成功は既存アプリ、将来の実装、Stripe SDK/API、外部Toolの認可が成功することを意味しません。状態名・scope・制約の変更時には型、DDL、モデルを同時にレビューしてください。
- 有限モデルでは内部予約とProvider Refundを同じcollectionの異なるIDで簡略化しています。実装ではoperation journalとRefundオブジェクトを分離し、対応付けが確認できた予約だけを重複計上から除きます。モデルは実際の対応付けアルゴリズムや全件ページングを実装していません。
- `requires_action`や遅延返金失敗を扱うのは安全な状態保持のためです。初期リリースでカード以外の決済手段を有効化したことにはなりません。銀行振込や入金、payout、税務処理の受入検証も含みません。
- 既存の`npm run verify`や既存テストの結果は別の証拠です。このキットの成功で既存baselineの失敗や、本番受入条件の未確認を上書きしません。

## 引継ぎ時の更新

このディレクトリを検証コードの正本とします。作成時の作業用スクリプトを再コピーすると契約修正を失うため、以後はここを更新してください。実装者は契約を変更したら2コマンドを再実行し、生成JSONと変更した型・DDLの差分を一緒にレビューします。固定の成功件数だけを合格条件にせず、既知の失敗を検出できる反例検査が維持されていることも確認してください。
