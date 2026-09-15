# Wallet / Billing / Providers

## 目的

自動化の仕事、費用、検証済み収益、Rock利用料、払出しを追記型台帳とreceiptで分離し、Wallet会社・ファンド会社を交換可能なProviderとして接続する。

## 現在地

- 本人別の売上、経費、取消、残高、receiptをD1へ保存するWallet APIと画面がある。
- 検証済み収益から実費を先に引き、月最大8.88 USDだけを回収する精算核を実装済み。
- Rock First-party Settlement Walletのsandbox契約を実装済み。
- Base Mainnet USDCの受取先所有署名、公式contract、exact金額、finalized block照合コードはある。
- owner Walletの本登録、最初の実transfer、払出しProviderの実受入は未完了。

主なtask: `WLT01`〜`WLT06`, `BIL01`, `BIL02`, `B03`。

## 次に進める順番

1. owner受取先を本人署名で登録し、環境・chain・contract・addressを固定する。
2. test条件でEarning Receipt、Provider入金、返金、重複、finalityを縦断する。
3. 販売、決済、払出しProviderの責任、KYC、税、chargeback、最低払出額を確定する。
4. 最初の本人確認済み実transferをexact receiptへ結び、照合証拠を残す。
5. LIVE有効化は秘密鍵非保管と本人最終確認を維持して別gateで行う。

## 完了条件

- execution成功、成果物完成、入金確定、払出し完了を別状態で保存する。
- 同じreceipt、provider reference、実行IDを二重計上しない。
- 秘密鍵、seed phrase、包括送金権限をRockstarOSが保持しない。
- 0売上時の請求、債務化、翌月繰越を行わない。

## 関連資料

- [Wallet front](../wallet-front-design.md)
- [Sky billing](../sky-billing.md)
- [Provider boundary](../external-wallet-fund-provider-boundary-20260913.md)
- [First-party settlement](../rock-first-party-settlement-wallet-20260913.md)
- [Production rail](../rock-wallet-production-rail-20260913.md)

## 検証

- `npm run billing:check`
- `node --experimental-strip-types --test tests/settlement.test.mjs tests/wallet-backend.test.mjs tests/financial-provider.test.mjs tests/rock-wallet.test.mjs`
