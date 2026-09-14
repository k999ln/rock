# Rock Wallet本番受取レール — 2026-09-13

## 結論

RockstarOSの最初の実受取レールを **Base Mainnet / USDC** で実装する。`/wallet` からMetaMask等のEIP-1193対応Walletを接続し、Rockの受取アドレスの所有を期限付き署名で確認する。秘密鍵、seed phrase、token approval、包括的な送金権限、利用者資産はRockstarOSへ渡さない。

受取対象は、外部Providerが署名したEarning Receiptを既存の成果連動ルールで配分した `SKY_SERVICE_FEE` だけである。任意の入金、利用者への払出し、交換、ファンド運用はこのレールに含めない。

## 調査と採用判断

- Coinbaseの旧 `build-onchain-apps` は参考実装だがarchive済み。現行の `onchain-app-template` とBase公式ドキュメントを優先した。
- Base公式はOnchainKitをmaintenance終了として、wallet接続はwagmi/viemへの移行を案内している。このためserver側の署名・log検証にはviemを使い、client側は既存bundleを過度に増やさないEIP-1193呼出しに限定した。
- 接続契約はEIP-1193、将来の複数injected wallet発見はEIP-6963、所有確認messageはEIP-4361のorigin、chain、nonce、issued/expirationの考え方を採用した。
- chain idはBase Mainnet `8453`、assetはCircle公式Base USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`、decimalは6で固定した。

参照:

- <https://github.com/coinbase/build-onchain-apps>
- <https://github.com/coinbase/onchain-app-template>
- <https://docs.base.org/onchainkit/wallet/wallet-dropdown-fund-link>
- <https://eips.ethereum.org/EIPS/eip-1193>
- <https://eips.ethereum.org/EIPS/eip-6963>
- <https://eips.ethereum.org/EIPS/eip-4361>
- <https://docs.base.org/base-chain/api-reference/rpc-overview>
- <https://developers.circle.com/stablecoins/usdc-contract-addresses>

## フロー

```text
本人限定Site /wallet
  -> BILLING_SERVICE_URLへの5分token
  -> EIP-1193 WalletでBase Mainnetへ切替
  -> Workerが5分challengeを生成
  -> Walletが所有確認messageへ署名
  -> Workerが署名を検証し、Rock受取アドレスをD1へ固定

署名済みEarning Receipt
  -> 実費を先に配分
  -> SKY_SERVICE_FEE（UTC月最大888 cents）
  -> rock_fee_collection_instructions
  -> 外部の収益・決済ProviderがBase USDCを送る
  -> tx hashを照合
  -> exact contract / recipient / amount / success / finalized
  -> collected
```

最初のowner claimは、現在のSiteがowner限定であることを前提にする。operator行はProvider単位で1件に固定され、別userはchallenge作成・上書き・照合ができない。一般公開へ変更する場合は、その前にowner受取先の登録を必須gateにする。

## APIと台帳

| 操作 | Endpoint | 性質 |
| --- | --- | --- |
| 状態・回収一覧 | `GET /v1/rock-wallet` | ownerだけが回収明細と集計を参照 |
| 所有確認challenge | `POST /v1/rock-wallet/challenge` | address / Base chainを固定、5分失効 |
| 受取先登録 | `POST /v1/rock-wallet/verify` | one-time challengeと署名を検証 |
| 受取先解除 | `DELETE /v1/rock-wallet` | 履歴は残し、新規の有効受取だけ停止 |
| 着金照合 | `POST /v1/rock-wallet/reconcile` | exact USDC Transferとfinalizedを確認 |

D1 migration `0004_rock_settlement_wallet.sql` は、operator、one-time challenge、receipt単位の回収指図を追加する。`receipt_id`、`idempotency_key`、`transaction_hash`はuniqueで、二重配分・二重計上を拒否する。RPC障害や未finalized時は`unknown`または`confirming`を保存し、自動で別transferを作らない。

## セキュリティ境界

- browserへ渡すBilling tokenは5分、SiteとWorkerの共有secretはbrowserへ渡さない。
- ownership messageはSite origin、Base chain、nonce、issued time、expiration、provider IDへ束縛する。
- Wallet署名は所有確認だけで、`eth_sendTransaction`、ERC-20 `approve`、秘密鍵入力を要求しない。
- WorkerはBaseの公式USDC contract以外のlog、異なる受取先・金額、revert、未finalizedを着金済みにしない。
- public Base RPCは小規模な初期運用の既定値。負荷・SLA・rate limitが必要になれば `BASE_RPC_URL` を認証済みproviderへ差し替える。
- 初版はinjected EOA Walletが対象。EIP-1271 contract walletとEIP-6963の複数Wallet chooserはProvider拡張として追加する。

## 本番完了条件

- [x] Walletフロント、challenge、署名検証、D1台帳、Base USDC照合を実装
- [x] 改ざん・誤chain・誤受取先・誤金額・revert・未finalizedの否定試験
- [ ] Workerのremote migrationとproduction deploy
- [ ] 同一source commitをowner限定Siteへdeploy
- [ ] ownerが本番 `/wallet` で受取Walletを接続し、所有署名を承認
- [ ] 最初の実Earning Receiptに対応するUSDC transferをfinalized後に照合

最後の2項目はowner Walletでの本人操作と実取引が必要であり、コード・fixture・代理署名で合格にしない。
