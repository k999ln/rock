# 外部Wallet／ファンドProvider境界 — 2026-09-13

## 決定

RockstarOSはWallet会社やファンド会社の業務を内製せず、それらの事業者が持つ機能を安全に接続する受け側に徹する。Rockは金融商品の提供者、資金の保管者、運用者、約定・払出し主体を兼ねない。外部事業者は交換可能なProviderとして参加し、追加や差替えのたびにOS本体を再buildしない。

この境界は、二次事業者が独自のWallet、保管、交換、ファンド商品、運用、レポート機能をRockstarOS利用者へ提供できる余地を残すためのもの。Rockがすべてを作ることや、特定のDubai事業者への固定を意味しない。

## 責任分界

| 項目 | RockstarOS | Wallet／ファンドProvider |
| --- | --- | --- |
| 接続 | Providerの同一性、manifest、session、失効を管理 | API、sandbox、本番資格情報を提供 |
| 機能 | capabilityを発見し、対応済みだけを表示 | 実際に許可された機能を宣言・実行 |
| 本人操作 | 条件、費用、送信先、金額を表示しexact consentを取得 | KYC/AML、対象地域、商品適合性を判定 |
| 資金 | 指図、状態、receipt、内部参照、照合を管理 | 保管、入出金、交換、約定、払出しを実施 |
| ファンド | 商品一覧・構成・状態を共通表示 | 運用判断、基準価額、申込・解約を正本化 |
| 記録 | append-onlyの指図・受領receiptと照合結果を保持 | 法定帳簿、残高、取引、税務帳票の正本を保持 |
| 障害 | timeoutを不明状態として保持し自動再送しない | query/reconcileと取消・返金結果を返す |

## Provider Adapter契約

Providerはversion付きmanifestで、自社が実際に提供できるcapabilityだけを宣言する。

- Wallet: `custody`、`receive`、`payout`、`exchange`、`reporting`
- Fund: `fund_catalog`、`subscribe`、`redeem`、`valuation`、`reporting`
- 共通: 対象国・通貨・chain、料金、上限、必要な本人確認、sandbox/live、取消・照合能力

RockstarOSは宣言されていないcapabilityを補完または擬似実装しない。Provider固有機能は権限、データ送信先、料金、実行主体を示す拡張manifestとして追加できるが、任意shell、OS root、秘密鍵の取得、内部Wallet台帳の直接書込み、包括的送金権限は許可しない。

標準状態は `disconnected`、`sandbox_available`、`sandbox_verified`、`live_eligible`、`suspended`、`revoked` とし、UI上の「接続済み」と「実資金を利用可能」を同じ状態にしない。live eligibilityはProviderの回答だけでなく、本人・受益者、契約、対象地域、許認可、custody、秘密情報、税務表示、sandbox受入、owner承認を満たした場合だけ成立する。

## 実行フロー

```text
Provider manifest取得
  -> capability・地域・費用・資格の照合
  -> quote / proposalを固定
  -> exact digestへの本人同意
  -> Providerへidempotentな指図
  -> pending / completed / failed / unknownを保存
  -> Provider receiptを検証
  -> 内部Wallet／ファンド表示と照合
```

Provider receiptは外部取引の正本参照であり、RockstarOSの自己申告や推測値で置換しない。応答timeout時は`unknown`のまま照合し、同じ資金指図を新規IDで自動再送しない。

## 現在地と受入順

現在のWeb Wallet、PAPER Market、native Value/Spend、自律型ファンドは内部台帳またはsimulation/PAPERであり、外部Wallet、外部ファンド、実資金、LIVE運用には接続していない。

1. 合成Wallet Providerと合成Fund Providerでmanifest、capability、同意、idempotency、timeout、照合、失効を検証する。
2. 候補Providerのsandboxへ同じ契約を接続し、Provider固有差分を拡張manifestへ閉じ込める。
3. 法務・規制・運用gateを満たしたProviderだけを`live_eligible`へ進める。
4. 実資金の最小受入後もProvider単位で停止・失効できるようにする。

この文書の保存はProvider選定、契約、外部接続、課金、実入出金、ファンド申込、税務判断を実施したことを意味しない。
