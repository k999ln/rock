# Value/Spend Runtime 次の再開指示

2026-09-12の監査起点はmain `9f4930b45e2d38a5371f4a489be4d53b38f28ba7`、当時のlaunch candidate `2562469c8f6c075822b425cb7c86202980de7036`、設計branch `27b34adc02a9e06a4816aa18a5e38cf38b330953`。現在のfeature PRとCIを再取得し、`docs/value-spend-runtime.md`、RQ20、実装とtestを読んでから進める。

次は、host vertical sliceの契約をnative `os/mcp_broker`の購入者/端末principalとmanaged Wallet admissionへ接続する。local Hubのsessionを本番本人確認へ読み替えず、同じproposal digest、approval purpose、hold、send claim、UNKNOWN、reconciliationを維持する。イベントは重要通知の購読へ接続するが、未変化や非actionable状態を通知しない。

その後、Polymarket公式sandboxまたは許可されたread-only APIでbalance/market/positionを取得するadapterを追加する。private/API keyをprocess環境へ置かず、production Secret Vault/Signing Serviceと短命authorizationを先に実装する。provider receiptとfee/gas、partial fill、cancel、market settlement、reorg/timeoutをRock台帳へ照合する。Smart Moneyはupstream live path、PnLとfee accounting、risk修正の採用・再試験までdisabledを維持する。

LIVEは独立gate。利用者の明示許可、所在地/提供条件、本人確認、実polygon.usdc残高、予算、production signer、provider sandbox、少額上限、emergency stop/cancel、再起動/重複/結果不明試験が全部揃うまで有効化しない。SIMULATION/PAPER成功を実取引成功として表示しない。
