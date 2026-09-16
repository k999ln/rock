# Database status

> `data/project-status.json`、schema、migration、`data/database-deployments.json`から生成する。source検証と本番readbackを混同しない。

更新日: 2026-09-16

## 全体

- データ境界: 6、table: 72
- source inventory: 6/6確認済み
- current production readback: 0/6
- 作業進捗: 107 task中 76 done、23 in progress、8 planned、0 blocked
- 現在milestone: AI自動化チームの最小収益loopとAndroid事前試験

## 保存境界と配備状態

| 境界 | 責任 | table | source | 配備状態 | 本番適用済み | current readback |
| --- | --- | ---: | --- | --- | --- | --- |
| Web D1 | Webサービス状態 | 27 | VERIFIED | SOURCE_AHEAD | 未確認 | 未確認 |
| Sky Billing D1 | 収益精算・請求・受取Wallet | 13 | VERIFIED | DOCUMENTED_NOT_READ_BACK | 0004_rock_settlement_wallet.sql | 未確認 |
| Operator Dock D1 | 運営専用の端末登録・緊急命令・監査 | 3 | VERIFIED | SOURCE_ONLY | 未確認 | 未確認 |
| OS Wallet / Spend SQLite | 端末内Wallet・支出承認・PAPER position | 17 | VERIFIED | QEMU_SCOPED | 未確認 | 未確認 |
| Android Work Engine SQLite | Android work・artifact・run・event | 6 | VERIFIED | EMULATOR_SCOPED | 未確認 | 未確認 |
| Android Platform Core SQLite | component登録・owner承認・OS側ledger | 6 | VERIFIED | SOURCE_ONLY | 未確認 | 未確認 |

## Web D1

- expected latest migration: 0012_marketplace_relation_guards.sql
- migration files: 13
- accidental duplicate: 0
- published convergence definitions: 6
- Marketplace relation guards: 8

| 分野 | table | 内訳 |
| --- | ---: | --- |
| 仕事・実行・端末・基本台帳 | 8 | book_records, devices, fund_plans, job_events, jobs, tool_controls, tool_runs, work_jobs |
| Sky接続・Tool管理 | 5 | sky_connections, sky_developer_tokens, sky_tool_events, sky_tool_packages, sky_tool_submissions |
| Marketplace | 7 | marketplace_approvals, marketplace_assets, marketplace_events, marketplace_positions, marketplace_proposals, marketplace_receipts, marketplace_reservations |
| CSV業務 | 4 | csv_billing_accounts, csv_job_events, csv_jobs, csv_monthly_fees |
| 自動化ファンド・事業補助 | 3 | automation_fund_memberships, automation_funds, mercari_revenue_plans |

## 境界別の全table

<details><summary>Web D1: 27 table</summary>

`automation_fund_memberships`、`automation_funds`、`book_records`、`csv_billing_accounts`、`csv_job_events`、`csv_jobs`、`csv_monthly_fees`、`devices`、`fund_plans`、`job_events`、`jobs`、`marketplace_approvals`、`marketplace_assets`、`marketplace_events`、`marketplace_positions`、`marketplace_proposals`、`marketplace_receipts`、`marketplace_reservations`、`mercari_revenue_plans`、`sky_connections`、`sky_developer_tokens`、`sky_tool_events`、`sky_tool_packages`、`sky_tool_submissions`、`tool_controls`、`tool_runs`、`work_jobs`

次の確認: owner-scoped read-only accessでmigration、件数、孤立関係、backup状態を確認する

</details>

<details><summary>Sky Billing D1: 13 table</summary>

`billing_checkout_locks`、`billing_customers`、`billing_events`、`billing_invoices`、`billing_subscriptions`、`earning_ledger_entries`、`earning_receipts`、`monthly_earning_settlements`、`monthly_fund_earning_settlements`、`payout_instructions`、`rock_fee_collection_instructions`、`rock_wallet_challenges`、`rock_wallet_operators`

次の確認: current productionをreadbackし、0004適用と台帳件数を再確認する

</details>

<details><summary>Operator Dock D1: 3 table</summary>

`operator_audit_events`、`operator_device_commands`、`operator_managed_devices`

次の確認: ownerが専用hostname、Cloudflare Access application、D1を作成後、0001適用と認証済みreadbackを行う

</details>

<details><summary>OS Wallet / Spend SQLite: 17 table</summary>

`spend_approvals`、`spend_policy`、`spend_positions`、`spend_proposals`、`spend_receipts`、`spend_reservations`、`spend_strategies`、`value_assets`、`value_events`、`value_spend_schema`、`wallet_bills`、`wallet_consents`、`wallet_idempotency`、`wallet_journals`、`wallet_postings`、`wallet_sales`、`wallet_withdrawals`

移行時だけ使用して最終schemaに残さないtable: `wallet_postings_spend_v1`

次の確認: 同一QEMU候補と将来の実機で保存・再起動・復旧を別々に受入する

</details>

<details><summary>Android Work Engine SQLite: 6 table</summary>

`artifacts`、`events`、`rock_meta`、`runs`、`settings`、`works`

次の確認: 対象端末を確定後、full buildと実機保存・復旧を受入する

</details>

<details><summary>Android Platform Core SQLite: 6 table</summary>

`platform_approvals`、`platform_components`、`platform_events`、`platform_ledger`、`platform_meta`、`platform_registration_requests`

次の確認: Kotlin/APK native build後、Soong imageと実機でschema移行を受入する

</details>

## 次の作業

Pixel 10 GL066上のTool／端末Walletと署名済みBilling Walletを同一合成実行IDで相関し、物理6/6・署名精算7/7・Sky→Zema回帰19/19に合格した。次に外部Provider sandboxをfull build前必須にするか、初回buildを非価値移転Developer Previewへ限定するかを確定し、GL066のBSP／vendor／partition／boot／純正復旧入力、source／artifact／production署名計画をfreezeしてOS full build可否を再判定する。

本番readbackは読み取り専用で行い、migration適用やデータ変更とは分離して記録する。
