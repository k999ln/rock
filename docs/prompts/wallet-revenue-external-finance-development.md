# Wallet・収益・外部金融接続の開発実行プロンプト

作成日: 2026-10-21（America/New_York）。主担当は Wallet / Billing / Providers、既存 `BIL02`・`WLT06`・`B03` の `ROCK`。これは**実装を進めるための引継ぎプロンプト**である。要件文書の再記述だけで終了せず、既存のWallet・請求・Sky Marketを再利用して、同一の外部取引を売上候補から入金・分配・返金・払出しまで安全に追跡する。最初の成果は実資金を動かさないsandbox/fixtureの縦断実装とする。製品正本は[Walletの追加要件](../product-baseline.md)、[OS全体 §18](../rockstaros-complete-design.md#wallet-revenue-external-finance)、[作業入口](../workstreams/03-wallet-billing-providers.md#wallet-revenue-finance-20261020)。RQ20・RQ15とRQ01〜RQ49を保持する。

## 0. 現在地とGit入口を固定する

着手時に正本5ファイル、`docs/workstreams/README.md`、責任分界、Wallet workstream、`docs/prompt-playbook.md`、承認記録、`data/project-status.json#phaseGates`、対象sourceと同一artifactの証拠を読む。GitHub main・全branch・open/関連closed PR・同一SHAのCIを再取得し、refを40桁SHAへ固定する。今回の `npm run prompt:context` はGitHub文脈取得に失敗してexit 2。同等のGitHub接続読取りで2026-10-21に確認した値は次のとおりであり、実装直前に再取得する。

`data/product-baseline.json#auditInputs` が保持する**履歴監査**の起点は `main=7cdbb5fedc86ee3978ed329d9312147d137c9199`、`nativeHead=fcedcfec4dd2a242a1ba8fd7ff5eebba97b8ecd5`、`designHead=de5b102d3525daccf604efd5685bdf8c14ad5d50`。これらを次表の最新GitHub読戻しと取り違えない。

| 入力 | 読戻しSHAと状態 | CIと扱い |
| --- | --- | --- |
| GitHub `main` | `01b6aecd8b4d8bd2385665232dfb4b57029f991f` | 同一SHAの Rock star verification、SPIDER repair/repository security/CodeQL はsuccess。ローカルの全未保存変更のCIではない。 |
| `codex/esim-cloud-access` | `951d82d5a491a284aed4e0d4d280171d835d4b43` | 同一SHAの Phone source preparationのみsuccess。Wallet全体CI成功と読まない。 |
| 両者の差 | 比較APIでdiverged、branch起点からmainは652 commit ahead、branchは3 commit独自。作業木は多数の未commit差分。 | **最初に**mainの製品入口・Wallet関連実装・優先順位を作業側へ同期し、未保存差分を保護する。reset/強制上書きしない。 |

関連open PRは[#105](https://github.com/k999ln/rock/pull/105)（仕事の二重保存・復旧競合、head `6b72470ce25d4e7b20940b1698fde5a12281ed69`、同一SHA verify successだがrepository security failure）、[#104](https://github.com/k999ln/rock/pull/104)（Grid receipt中断復旧、head `aba88bdd8c12cc84d533954a81729651e2f72855`、同一SHA verify successだがrepository security failure、baseは[#103](https://github.com/k999ln/rock/pull/103)のGrid branch）、[#130](https://github.com/k999ln/rock/pull/130)（main catchup、head `3a805132c7d85c50ca76eb9de960c90b5b3e77da`、同一SHAのrun未取得）である。open PRの機能をmain反映済みにしない。#104のGrid台帳をWallet全体の精算証拠へ転用しない。関連closed PR #159は月次Cloud請求に関する別契約の履歴である。

同期は必要なら分離checkoutで行い、元のdirty checkoutを保存する。`AGENTS.md`、README、project、進捗JSON、次promptと対象設計の再開先を同じ順にそろえる。文書のローカル保存、作業branch commit/push、main統合、配備を別々に記録する。

## 1. 既存コードと受入境界を棚卸しする

各項目を `要望/RQ・repository/branch/SHA・path・実装状態・host/fixture/Provider sandbox/実資金の証拠・不足` で記録し、mainと現在のbranchを別々に判定する。

- `lib/earning-bridge.ts` と `app/api/earnings/receipts/route.ts` はProvider署名を検査し、完了済み非sample Tool実行・owner・Tool・時刻とReceiptを照合する。`services/sky-billing/migrations/0002_earnings_settlement.sql` はReceipt ID、実行ID、`(source_provider,provider_reference)`をuniqueにしている。これは外部入金の金額・finality・返金と独立照会まで証明しない。[fixture証拠](../evidence/tool-earning-wallet-bridge-20260915.json)は実売上/実Providerを未受入としている。
- `services/sky-billing/src/worker.ts` は旧888 cents式のToC Receiptを通常入口で `SKY_FEE_POLICY_ON_HOLD` として拒否し、過去の試験経路だけに残す。同じWorkerの `earning_ledger_entries`、`monthly_earning_settlements`、`payout_instructions` と `0004_rock_settlement_wallet.sql` を拡張対象とする。既存の一Receipt一指図・月上限を消さない。
- `lib/rock-wallet.ts` と[本番受取レール](../rock-wallet-production-rail-20260913.md)は、Rockへ送られたBase USDCについて所有署名とexact recipient/amount/finalizedを照合する。一般の販売入金、作者受取先、外部払出しの完了証拠ではない。`lib/financial-provider.ts` のRock ProviderはSANDBOXでcustody/LIVEを拒否する。
- `lib/sky-commerce.ts`、`lib/sky-commerce-store.ts`、`lib/sky-stripe.ts`、`drizzle/0018_sky_commerce.sql` は審査済みPackageの買い切り販売、10% application fee、Stripe取引再照会、返金/紛争の別経路を持つ。Sky Market購入を自動化Earning Receiptや本人銀行着金へ自動昇格させない。[現行料金](../sky-billing.md)とProvider責任を照合する。
- `lib/workflow.ts`、Cloud/A2Aの予約・usage、native Value/Spendは仕事・費用の別台帳である。保留資金、確定収益、請求後払い与信、PAPER損益を同じ残高へ混ぜない。`docs/evidence/launch/sky-billing-fee-hold-20260924.json` は旧料金保留の配備readbackであり、現在の実送金証拠ではない。

## 2. 問題ごとの実装と合格証拠

| ID / 対象 | 原因と修正順（ROCKの成果） | 合格証拠と未解決条件 |
| --- | --- | --- |
| WAL01 / RQ20・B03 | 現ReceiptはTool完了とProvider申告を結ぶが、販売Providerの**実入金**を独立照会した正本はない。既存Receiptを版付きprovider transaction/入金証拠へ結合し、署名鍵の有効期間、owner、金額、通貨、時刻、finality、取消可能性を検証。認証済みWebhookを受けても照会未了は保留する。 | 偽署名、金額差、別owner、遅延/逆順、未finalized、Provider照会失敗を拒否。実行成功・自己申告・Checkout戻りだけで分配可能額が増えない。実Provider契約/APIと取引条件が未指定ならfixtureまで。 |
| WAL02 / RQ20・BIL02 | unique Receiptはあるが、同一入金の複数受益者・並行処理を一つの原子的残額で管理していない。既存台帳/migrationを互換拡張し、`売上候補→入金待ち→保留→分配可能額確定→払出し指図→着金`と不明/失敗を別保存。`confirmed net - refund - hold - allocated - reserved >= 0`をDB内CAS/transactionで強制する。 | 同じProvider参照を別通知ID・別Receipt IDで再送、並行2分配、restart/逆順通知でも取引あたり確定＋予約が純入金を超えない。旧reader/migration/rollbackと本人別分離を試す。 |
| WAL03 / RQ20・BIL02 | 旧台帳のgross/実費/Rock fee/beneficiary payableだけでは作者、利用者、Rock、決済Providerの内訳を契約別に説明できない。版付き商品/取引の役割、税/Provider費/運営実費、Rock対象額・上限をlineとして固定し、合計を照合。Sky Market 10%、SI月額16 USD、AI従量、旧888 cents、ATM 0を異なるpolicyに保つ。 | 0売上は旧成功報酬0、旧888 fixture上限/月/owner重複拒否、ToC現行収益料金保留、ToB/Marketplace別契約、同一契約複数端末の基本料重複なし。成功報酬率・利益定義・新上限・税/費用負担が未確定なら新料金を本番有効化しない。 |
| WAL04 / RQ20・WLT06 | Rock受取先の所有署名は一般の受益者払出し承認ではない。受取先のowner、Provider、口座/chain、nonce、期限、署名、失効epochを検査し、変更後の旧指図を止める。送金/換金/返金は金額・通貨・相手・Provider費用・期限・指図IDを表示し個別承認・監査する。 | 別owner、署名再使用、期限切れ、宛先変更、失効済み指図、二重承認を拒否。鍵/seed/包括送金権限を保管しない。実所有署名はOWNER本人、KYCと送金はEXTERNAL。 |
| WAL05 / RQ20・BIL02 | 返金、chargeback、払出し失敗後に元売上/配分を直接書換えると監査と上限が崩れる。元仕訳参照の追記補正、既払/未払/回収対象を区別し、結果不明は同じprovider referenceで照会。新IDの自動再送を禁止する。 | 部分/全額返金、争議、先払後の返金、送金失敗、通知重複/逆順、timeout/再起動で合計と履歴が一致。別収益からの無承認相殺なし。Provider側の返金/chargeback責任はEXTERNAL。 |
| WAL06 / RQ15・BIL02 | ATM 0の表示が外部実費と混ざり得る。Rock徴収ATM手数料を計算/明細で0に固定し、外部ATM/決済/送金実費は金額・負担者・同意を別表示。ゲーム交換adapter/同意を独立させ、利用可能額の予約だけ共通化。 | 0自社手数料、別名目での上乗せ拒否、外部費不明時の総額無料表示拒否、ATM障害とGame交換の分離。物理ATM/実資金受入は別gate。 |

## 3. 実装と検証の順序

1. **同期と差分固定:** WAL01〜06を現main/sourceへ再マップし、旧branchにないmain実装は取り込むか参照を固定する。最初に代表的な同一ownerの実行/販売候補を一件選び、`Sky Package→資格/費用→Eve仕事/承認→Tool結果→Provider販売/入金→Earning Receipt→Wallet`のID対応図を作る。現実の販売動線が未確定なら合成Provider fixtureと明示する。
2. **ROCK_READY:** 既存D1/SQLite migrationとWorkerに状態/補正/CASを互換追加し、最小の署名付きProvider fixtureを接続する。WAL01・02の失敗fixtureを先に書き、WAL03〜06を同じ取引IDで縦断する。旧データ読戻し、繰返し100回、並行書込、worker停止直後を試す。UIは売上候補/保留/確定/出金を区別し、手数料・外部実費・承認内容を本人が確認できるようにする。
3. **PROVIDER_READY→INTEGRATED:** 最初のProvider候補は既存Sky MarketのStripe test経路を評価できるが、Sky Market注文を自動化収益に流用する条件は別に確定する。販売・決済・custody・払出しの担当/契約/対象国/KYC/税/最低払出/手数料/鍵rotation/再照会APIを決め、sandboxで署名付き入金から返金/紛争/払出し失敗まで同じprovider referenceで往復する。Provider未設定ならここを未受入としてROCK_READYで止める。
4. **LIMITED_LIVEは別gate:** 本人の受取先署名と、チェーン・資産・宛先・額・費用を固定した個別承認、Provider契約、運用・復旧条件がそろった対象だけで最小実transferを照合する。既存の条件付き了承を実行済みとしない。一般公開や無制限の自動送金は行わない。

集中試験は `node --experimental-strip-types --test tests/earning-bridge.test.mjs tests/billing-worker.test.mjs tests/settlement.test.mjs tests/wallet-backend.test.mjs tests/financial-provider.test.mjs tests/rock-wallet.test.mjs tests/sky-commerce.test.mjs tests/sky-stripe.test.mjs` から始め、変更したmigrationとWorkerのD1/SQLite並行・障害試験、`npm run billing:check`、`npm run schema:check`、`npm run typecheck`、`npm run lint:product`を加える。統合前に`npm run project:update`、`npm run baseline:check`、`npm run design:check`、`npm run verify`。UIを変えたら本人のWallet/売上/返金/承認画面を操作する。2026-10-20の集中Wallet 21/21とbilling dry-runは**旧候補・local**の結果であり、同一新候補の合格として再利用しない。全verifyの以前のsandbox localhost `EPERM`と自動承認審査時の容量不足は環境失敗として残し、最新環境で再検証する。

証拠は変更後のsource SHA、command、件数、DB/Provider参照、拒否/補正結果、receipt hash、環境段階を小さく保存する。長いlog・秘密・実資金情報はGit外。`project.md`、`data/project-status.json`、READMEと該当workstreamへ着手/判断変更/検証結果/再開点を残す。必要なOS componentまたはSky Toolを変更するなら全体/Tool詳細設計と`data/design-document-index.json`を同じ変更で更新する。Webの新しい仕事状態は`lib/workflow.ts`を通し、native移植は同じ契約/fixtureで検証する。

完了報告は**文書保存、作業branchへのcommit/push、main統合、Provider sandbox、限定live、公開**を別々に記載する。ROCKの元帳/承認、EXTERNALの決済/custody/KYC/払出し、JOINTの縦断受入、OWNERの料金版/対象国/実資金操作を区別する。最後にRQ01〜RQ49、特にRQ15/20、旧888 cents保留、Sky Market 10%、SI月額16 USD、Game料金未定、秘密鍵非保管、0売上0回収、二重分配なしを自己点検し、未解決条件を次の実行入口へ返す。
