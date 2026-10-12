# データ保存境界と重複整理

RockstarOSには複数のSQLite/D1があり、同じような名前のtableでも保存先と責任が異なる。名前だけを根拠に統合・削除しない。

| 境界                | 正本                                                                   | 主な用途                                        | 関係の強制                                                                     |
| ------------------- | ---------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------ |
| Web D1              | `db/schema.ts`、`drizzle/`                                             | Hub、仕事、Marketplace、CSV、Sky                | index/unique制約とMarketplace関係trigger                                        |
| Operator Dock D1    | `services/operator-dock/migrations/`                                  | 運営端末登録、緊急命令、監査                    | user Webと別DB、監査のupdate/delete拒否trigger                                  |
| OS Wallet/Spend     | `systems/rock-star-os/src/blackberryrock/wallet.py`、`spend.py`        | 追記型Wallet、支出承認、保留、receipt、position | SQLite `REFERENCES` と `PRAGMA foreign_keys=ON`                                |
| Android Work Engine | `android/core/src/main/resources/schema.sql`                           | work、artifact、run、event                      | SQLite外部キー                                                                 |
| Android Platform    | `android/core/src/main/java/dev/rock/core/platform/PlatformStore.java` | component、owner approval、OS側ledger、event    | 現在はtransactionとアプリ検証が中心。列間は論理関係                            |

## 重複に見えるが削除しないもの

- `0002_operations_backend.sql` と `0002_work_jobs.sql` は、過去に別々の配信先へ公開された履歴である。filenameとbytesを変更しない。
- `0004_union_bridge.sql` は、その2履歴をデータを失わず同じschemaへ収束させるmigrationである。既存tableへの再宣言はすべて `IF NOT EXISTS` であり、単純な重複ではない。
- Wallet/SpendとWeb Marketplaceは、端末内の権威ある台帳とWeb上のサービス状態という別境界である。tableを共用しない。
- `PlatformStore` 内の `platform_approvals` 再作成はschema v1からv2への移行である。

## 追加・変更手順

1. Web DBの正本は `db/schema.ts` だけを編集する。
2. `npm run db:generate -- --name=変更名` で追加入力のmigrationを生成する。公開済みSQLを編集・削除しない。
3. `npm run schema:check` でtable名重複、migration番号、journal、最終schema一致を数秒で確認する。
4. `npm test -- --test-name-pattern='migration'` または `npm run verify` で、過去2履歴からのデータ保持を含む重い検証を行う。

`schema:check` は、公開済み0002の2ファイルと0004の収束定義だけを明示的に許可する。新しい番号重複、非冪等な再定義、journal漏れ、`db/schema.ts` とmigration結果の差は失敗する。

Marketplaceはtable再作成を避け、`0012_marketplace_relation_guards.sql` のtriggerで新規書込みを検査する。approvalは同じowner・digest・`PROPOSED` proposal、reservation/receipt/positionは同じownerの`EXECUTED` proposalだけを受け入れる。reservationの金額とpositionのasset・side・数量・価格・notionalもproposalと一致しなければならない。既存行の削除や書換えは行わない。

運営端末管理は利用者Web D1へ入れず、Operator Dock専用D1の`operator_managed_devices`、`operator_device_commands`、`operator_audit_events`へ保存する。DockはAccess JWTの署名、issuer、専用audience、単一operator subjectをasset配信前に検証し、監査eventは`0001_operator_device_control.sql`のtriggerで更新・削除を拒否する。この境界は命令の受付と運営監査の正本であり、Android端末側の受領・署名検証・実行記録を代替しない。
