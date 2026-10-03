# Database status

> `data/project-status.json`、schema、migration、`data/database-deployments.json`から生成する。source検証と本番readbackを混同しない。

更新日: 2026-10-02

## 全体

- データ境界: 6、table: 85
- source inventory: 6/6確認済み
- current production readback: 0/6
- 作業進捗: 158 task中 104 done、33 in progress、20 planned、1 blocked
- 現在milestone: Pixel 10 compile-only Developer Previewの初回full build準備

## 保存境界と配備状態

| 境界 | 責任 | table | source | 配備状態 | 本番適用済み | current readback |
| --- | --- | ---: | --- | --- | --- | --- |
| Web D1 | Webサービス状態 | 37 | VERIFIED | OWNER_ACCESS_BLOCKED | 未確認 | 未確認 |
| Sky Billing D1 | 収益精算・請求・受取Wallet | 13 | VERIFIED | DOCUMENTED_NOT_READ_BACK | 0004_rock_settlement_wallet.sql | 未確認 |
| Operator Dock D1 | 運営専用の端末登録・緊急命令・監査 | 5 | VERIFIED | SOURCE_ONLY | 未確認 | 未確認 |
| OS Wallet / Spend SQLite | 端末内Wallet・支出承認・PAPER position | 17 | VERIFIED | QEMU_SCOPED | 未確認 | 未確認 |
| Android Work Engine SQLite | Android work・artifact・run・event | 7 | VERIFIED | EMULATOR_SCOPED | 未確認 | 未確認 |
| Android Platform Core SQLite | component登録・owner承認・OS側ledger | 6 | VERIFIED | SOURCE_ONLY | 未確認 | 未確認 |

## Web D1

- expected latest migration: 0018_sky_commerce.sql
- migration files: 19
- accidental duplicate: 0
- published convergence definitions: 6
- Marketplace relation guards: 8

| 分野 | table | 内訳 |
| --- | ---: | --- |
| 仕事・実行・端末・基本台帳 | 8 | book_records, devices, fund_plans, job_events, jobs, tool_controls, tool_runs, work_jobs |
| Sky接続・Tool管理 | 14 | sky_activation_codes, sky_commerce_events, sky_commerce_offers, sky_commerce_orders, sky_commerce_sellers, sky_connections, sky_developer_tokens, sky_provider_connections, sky_remote_ai_rate_limits, sky_tool_events, sky_tool_grants, sky_tool_package_reviews, sky_tool_packages, sky_tool_submissions |
| Marketplace | 7 | marketplace_approvals, marketplace_assets, marketplace_events, marketplace_positions, marketplace_proposals, marketplace_receipts, marketplace_reservations |
| CSV業務 | 4 | csv_billing_accounts, csv_job_events, csv_jobs, csv_monthly_fees |
| 自動化ファンド・受託案件・事業補助 | 4 | automation_fund_memberships, automation_funds, coconala_team_cases, mercari_revenue_plans |

## 境界別の全table

<details><summary>Web D1: 37 table</summary>

`automation_fund_memberships`、`automation_funds`、`book_records`、`coconala_team_cases`、`csv_billing_accounts`、`csv_job_events`、`csv_jobs`、`csv_monthly_fees`、`devices`、`fund_plans`、`job_events`、`jobs`、`marketplace_approvals`、`marketplace_assets`、`marketplace_events`、`marketplace_positions`、`marketplace_proposals`、`marketplace_receipts`、`marketplace_reservations`、`mercari_revenue_plans`、`sky_activation_codes`、`sky_commerce_events`、`sky_commerce_offers`、`sky_commerce_orders`、`sky_commerce_sellers`、`sky_connections`、`sky_developer_tokens`、`sky_provider_connections`、`sky_remote_ai_rate_limits`、`sky_tool_events`、`sky_tool_grants`、`sky_tool_package_reviews`、`sky_tool_packages`、`sky_tool_submissions`、`tool_controls`、`tool_runs`、`work_jobs`

次の確認: 既存Sitesの所有workspaceへ接続し、検証済み最新mainを同じSiteへ配備。公開設定変更後に匿名health、本人別API、migration、件数、孤立関係、backup状態をreadbackする

</details>

<details><summary>Sky Billing D1: 13 table</summary>

`billing_checkout_locks`、`billing_customers`、`billing_events`、`billing_invoices`、`billing_subscriptions`、`earning_ledger_entries`、`earning_receipts`、`monthly_earning_settlements`、`monthly_fund_earning_settlements`、`payout_instructions`、`rock_fee_collection_instructions`、`rock_wallet_challenges`、`rock_wallet_operators`

次の確認: current productionをreadbackし、0004適用と台帳件数を再確認する

</details>

<details><summary>Operator Dock D1: 5 table</summary>

`operator_audit_events`、`operator_device_commands`、`operator_device_request_nonces`、`operator_managed_devices`、`operator_webauthn_assertions`

次の確認: ownerが専用hostname、Cloudflare Access application、D1を作成後、0001・0002適用、production credential設定、端末attestation登録と認証済みreadbackを行う

</details>

<details><summary>OS Wallet / Spend SQLite: 17 table</summary>

`spend_approvals`、`spend_policy`、`spend_positions`、`spend_proposals`、`spend_receipts`、`spend_reservations`、`spend_strategies`、`value_assets`、`value_events`、`value_spend_schema`、`wallet_bills`、`wallet_consents`、`wallet_idempotency`、`wallet_journals`、`wallet_postings`、`wallet_sales`、`wallet_withdrawals`

移行時だけ使用して最終schemaに残さないtable: `wallet_postings_spend_v1`

次の確認: 同一QEMU候補と将来の実機で保存・再起動・復旧を別々に受入する

</details>

<details><summary>Android Work Engine SQLite: 7 table</summary>

`artifacts`、`events`、`rock_meta`、`runs`、`settings`、`sky_selection`、`works`

次の確認: 対象端末を確定後、full buildと実機保存・復旧を受入する

</details>

<details><summary>Android Platform Core SQLite: 6 table</summary>

`platform_approvals`、`platform_components`、`platform_events`、`platform_ledger`、`platform_meta`、`platform_registration_requests`

次の確認: Kotlin/APK native build後、Soong imageと実機でschema移行を受入する

</details>

## 次の作業

SYS15のSPIDER改善cycleで警告取得→原因確認→小さな修正→回帰→同一SHA再検査→PR報告を反復する。初回のHTTP認証・エラー応答・SW更新境界3件はGitHub再解析でfixedを確認済み。残るCodeQL44件とDependabot18件、履歴候補を優先度順に確認する。1時間ごとのローカルCodex実行はPC／アプリ起動を要する。main統合・required check・OS同一image／Pixel／24時間運転は未受入。SYS15のGitHub SPIDERでk999ln/rockの実履歴を検査し、PR check・CodeQL結果と未解決候補を確認する。Dependabot通知・修正PRは設定済み。mainへのworkflow統合とrequired check設定は未実施で、未統合の定時検査を稼働済みとしない。OS同一image boot、Pixel、24時間運転の受入は独立して継続する。SYS15のofflineコード検査ファイルを配布し、今回のnative security.inspectCodeを同一SHAのLinux CIで確認する。生成物とsourceのhashを保存し、既存OS監視の受入とは分ける。SYS15のSecurity Agent役割・native表示・送信前拒否についてLinux source検証を保存し、同一SHAのCIと既存の受入gateへ接続する。アニメーション・役割追加・旧a7cfca3の証拠を分離し、表示先は現行security panelを維持する。RockstarOS本体のPlatform固定範囲監視とMCP／Runner送信前検査、native状態画面、boot監督を検証し、同一imageで起動・再起動・障害復旧・24時間運転を受け入れる。hostやWeb補助機能の成功をOS常駐受入へ換算しない。avocadoMiniはR5を基準に、1本自律・使用時200mm・全空間裸眼表示の方式と安全、精密3D入力、実部品収納を先に検証する（MAT15）。E3の4本＋別Hubを必須構成へ戻さない。Pixel/QEMU等の既存OS受入は独立して継続する。

本番readbackは読み取り専用で行い、migration適用やデータ変更とは分離して記録する。
