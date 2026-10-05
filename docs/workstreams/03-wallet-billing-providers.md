# Wallet / Billing / Providers

## 目的

自動化の仕事、費用、検証済み収益、Rock利用料、払出しを追記型台帳とreceiptで分離し、Wallet会社・ファンド会社を交換可能なProviderとして接続する。

## 現在地

- Sky Marketの商品購入はWeb D1の別経路として実装。`/sky/sell` のStripe Express受取先登録、審査済み `external_contract` Packageの円建て買い切り販売、10% application fee、Checkout、`/sky/purchases` の支払い照合、提供者返金を含む。LLM Packageも同じ条件を使う。
- Web migration `0018_sky_commerce.sql` と四つのserver-only `SKY_*` 決済設定が必要。カード・銀行情報はStripeが保持する。全migrationを使うSQLiteとStripe HTTP mockのcommerce試験37件は成功したが、実資格情報、Stripe sandbox、live money、配備は未実施。
- 購入記録だけでは第三者MCPへのアクセス制御を強制できない。提供者側の認証・利用権失効、および本番Sites gatewayと匿名署名Webhookの到達を共同受入する。
- 本人別の売上、経費、取消、残高、receiptをD1へ保存するWallet APIと画面がある。
- 月最大8.88 USDの旧精算核は回帰検証用の履歴として保持。現行の利用者向け料金案は収益動線が確定するまで保留し、新しいToC収益Receiptは精算Workerで拒否する。
- Rock First-party Settlement Walletのsandbox契約を実装済み。
- Base Mainnet USDCの受取先所有署名、公式contract、exact金額、finalized block照合コードはある。
- Provider署名を検証し、完了済み・非サンプルのTool実行と利用者・Tool・時刻を照合してからEarning ReceiptをWalletへ一度だけ渡すbridgeは、fixture縦断試験まで合格済み。
- owner Walletの本登録、最初の実transfer、払出しProviderの実受入は未完了。

主なtask: `WLT01`〜`WLT06`, `BIL01`, `BIL02`, `B03`。

Sky Market決済の主担当は `JOINT`。`ROCK` は商品・注文・手数料・照合・本人分離・返金停止を実装し、`EXTERNAL` のStripeは決済・受取先本人確認・銀行払出しを担う。`OWNER` は既存の決済実装指示を前提に、実アカウントと資格情報・販売条件を用意する。現段階はローカルmockでの `ROCK_READY` であり `PROVIDER_READY` / `INTEGRATED` / `LIMITED_LIVE` / `PRODUCTION` ではない。

## Sky Market決済の次の受入

1. [設定・API手順](../sky-billing.md#sky-market決済2026-09-27実装)に従い、Web DB migrationとStripe test資格情報を設定する。
2. Sites本人gatewayの迂回がないこと、`/api/sky/commerce/webhook` がログインなしでStripe raw署名を受け取れることを配備先で検証する。
3. test受取先登録から審査済み商品購入、10%分配、返金・部分返金・紛争、通知重複/順序逆転/不達、別本人拒否、有料MCP側のアクセス失効までStripe sandboxで縦断する。
4. 処理費用、返金・紛争、サポートの運用を確認し、本番設定・配備・実資金・銀行払出しはそれぞれの証拠を残す。結果不明の再送は20時間の上限を越えて自動継続しない。

## 旧収益精算・Walletの次に進める順番

1. 収益動線、料金の対象・計算・上限・回収方法・同意を確定し、新しい料金契約を設計する。
2. 最初の販売・決済Providerを一つ選び、sandbox署名を現在のbridgeへ接続する。
3. Provider sandbox条件で入金、返金、順序逆転、重複、結果不明を縦断する。
4. 販売、決済、払出しProviderの責任、KYC、税、chargeback、最低払出額を確定する。
5. 最初の本人確認済み実transferをexact receiptへ結び、照合証拠を残す。
6. LIVE有効化は秘密鍵非保管と本人最終確認を維持して別gateで行う。

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

- `node --experimental-strip-types --test tests/sky-commerce.test.mjs tests/sky-stripe.test.mjs`
- `npm run schema:check`、`npm run typecheck`、`npm run lint:product`
- `npm run billing:check`
- `node --experimental-strip-types --test tests/earning-bridge.test.mjs tests/billing-worker.test.mjs tests/settlement.test.mjs tests/wallet-backend.test.mjs tests/financial-provider.test.mjs tests/rock-wallet.test.mjs`

## 2026-10-05 全体監査とクラウドOSへの優先順位

今回の追加は対応可能なeSIM提供形態に限る。全体のnative/local/Web/appを一本化しない。詳細は[共通導入・従量課金契約](../sim-led-product-architecture.md#2026-10-05-cloud-os-business-direction)。ROCK主担当、既存BIZ01/SKY19/BIL02。本人別利用権・計測・予算/承認・保存/復旧と表示はROCK、実Provider実行/請求と販売/導入連携はEXTERNAL、縦断受入はJOINT、商品単価/利益配分/契約はOWNER。文書修正はruntime修正ではない。

監査対象: GitHub main `aa7f2b41ce34a32c262500a83238bb713c003dee`とlocal `c9b806fe3b497a292f5f7a7c13e00d68060c0b17`を2026-10-05に照合。限定したソース/CI/ローカルUI/SQLite fixture監査であり、全行・全端末・本番サービスの完全検証ではない。

1. **入口の版ずれ**: localはLiveKit branch、mainのSIM/Cloud追加2 commitが未統合。local Market承認欄の売買/数量欠落はUIで確認したがmainでは修正済み。main同期とLiveKit保持を最初に行い、同一SHA build/画面を照合する。
2. **PAPER市場の同時実行制限破り（両版）**: `lib/everything-market-store.ts`のexecuteは残高/在庫をDB batchより前に照合し、書込時に再判定しない。実storeと2 migrationを一時SQLite fixtureに読み、write batchを直列化したうえで並行呼出しを再現。既存50000＋40000の買い2件が両方EXECUTED、exposedMinor=130000（上限100000）。在庫1から並行売り2件が両方EXECUTED、数量=-1。その後、一時Miniflare D1でも同じ2件を再現した。実資金は動かしていない。条件照合を原子的な予約/更新へ移し、独立提案の同時実行・取消/期限境界試験で上限と在庫非負を証明する。
3. **最新mainのWeb CI失敗**: [verify](https://github.com/k999ln/rock/actions/runs/37265108941/job/111620156119)はnpm ciで`@cloudflare/workers-types@5.20261005.1`がlockに欠落して停止。package/lockを同じ依存解決へ同期しfresh npm ciと全verifyを受入する。
4. **Android CI失敗**: [prototype](https://github.com/k999ln/rock/actions/runs/37265108935/job/111620156004)は`A2AWalletReservationTest.java:190,204`の`A2ABrokerAuthorization`参照でcompileTestJavaが失敗。テストのimport/依存を確認して修正し、Core testと実AIDL/APKを別々に受入。新SIM/Cloudの端末runtimeは23/23の旧APK証拠では証明できない。
5. **native受入未完**: [source-tests系列](https://github.com/k999ln/rock/actions/runs/37265108899)のmain-1は322 executions、exit_code=0でもunclean_log=trueで失敗。失敗内容のartifact解析が未了で、322件すべてのassertion失敗とも成功とも言えない。原ログのResourceWarning等を特定しLinux同一候補で再検証する。native入口のBlackBerry-first表記は現行Pixel方針と矛盾し、履歴扱いを明確化する。
6. **事業成立の未受入条件**: mainにはSIM導入/Cloud jobs/見積り/利用量のソースがあるが、実販売からサービス利用権、実Provider usageから請求/返金/資金までの同一候補受入は未了。既存readyやfixtureを本番利益へ換算しない。正規署名/rollback/純正復旧/全損backupのPixel gateも継続。

検証: 最新mainの独立snapshotで`node audit-market-race.mjs`（Git管理外、一時SQLite/D1互換adapter）は上記2競合を再現。D1の既存3 testファイル実行とlocal `npm run verify`はsandbox下のNode試験が進まず中断、合格に数えない。再現scriptとログは`/private/tmp/rock-audit-20261005-9mnxof8r/`等の一時領域。最終の文書project/baseline/design/database検査とlocal `npm run verify`はexit 0。最新mainのCI失敗は別扱い。保存済み[再現script](../evidence/market-concurrency-audit.mjs)をrepo rootから`node docs/evidence/market-concurrency-audit.mjs`で実行すると、一時D1で2競合を確認できる。[同一SHAを区別した証拠](../evidence/cloud-os-direction-audit.json)を参照。実回線・実課金・実OS導入は未実行。
