# Rock First-party Settlement Wallet — 2026-09-13

## 決定

RockstarOSが検証済み自動化収益からRock分を回収できるよう、最初のFinancial ProviderをRock自身の `org.rockstar.settlement-wallet` とする。外部事業者待ちで回収経路の設計が止まらないようにする一方、外部Wallet／ファンドと同じProvider Adapterを通し、内製専用の例外経路を作らない。

最初の役割は **Rockに帰属する確定済み利用料の受取と報告** に限定する。利用者の全残高を預かること、任意入金、外部送金、交換、投資運用、ファンド申込、出金を同時に有効化しない。

## 最初のcapability

- `collect_platform_fee`: 署名検証済みEarning Receiptから既存ルールで配分されたSky利用料だけを受ける。
- `reporting`: receipt、対象月、通貨、回収額、状態を監査可能に表示する。

Provider manifestは`SANDBOX`、`userFundsCustodied: false`、`fundManagementEnabled: false`、`liveEnabled: false`で固定する。月の累計は888 USD centsを超えず、収益0なら0、未回収分の債務化・翌月繰越・カード先払いを行わない。

## 資金境界

```text
外部Providerが確認した収益
  -> 署名済みEarning Receipt
  -> 実費を先に回収
  -> Rock利用料を月最大888 centsで配分
  -> Rock Settlement Walletへの回収指図
  -> 残額は利用者への支払可能額
```

現在は最後の回収指図までをsandboxで生成し、実口座・実Walletへのtransferは行わない。Rock Settlement Walletは利用者資産の正本ではなく、Rockの債権・回収状態の正本である。利用者への払出しは別Provider capabilityとして分離する。

## 将来の外付け

外部Wallet会社とファンド会社は同じversion付きmanifest、本人同意、idempotency、状態、receipt、照合契約で追加する。RockのProviderを既定にしても排他的にはせず、利用者や地域に応じたProvider選択と差替えを残す。

LIVE回収には、販売・決済・払出しProvider、Rockの受取主体と口座、契約・表示、対象地域、税務・会計、資格情報、sandbox受入、owner承認が必要である。この文書とfixtureは実資金開始の承認ではない。
