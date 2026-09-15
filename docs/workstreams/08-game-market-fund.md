# Game / Market / Fund

## 目的

ゲーム作者向けAPI/SDK、Walletとゲーム通貨の交換、型付き価値のPAPER市場、自動化実績から更新するファンドを、安全な台帳とexact approvalの上で提供する。

## 現在地

- 複数owner/player/game分離、ATMと独立したゲーム交換fixture、作者SDKとsandboxを実装・検証済み。
- PAPER市場はproposal、risk、digest承認、receipt、position、append-only eventを実装済み。
- Web/D1はapproval・reservation・receipt・positionのowner／proposal一致をrelation triggerで強制し、直接SQLでも孤立・別owner参照を拒否する。
- ファンドは検証済みreceiptがある場合だけ構成・配分・観測利回りを再計算する。
- 実ゲームsandbox、実市場注文、清算、実Wallet資金移動、自動再投資は未接続。

主なtask: `GX00`, `GX01`, `GX02`, `DX01`, `MKT01`, `MKT02`, `SPN01`, `FND01`。

## 次に進める順番

1. 接続対象の実ゲーム、交換方向、通貨、rate、取消条件を明示選択する。
2. 正式sandboxで残高、予約、確定、取消、再送、二重使用拒否を検証する。
3. 作者SDKのfresh導入時間、成功率、復旧時間を第三者環境で測る。
4. 市場とファンドはPAPERを維持し、Provider、地域、KYC、清算が揃うまでLIVEを有効化しない。

## 完了条件

- gameのポイント発行権限とWalletの資金記帳権限を分離する。
- exact digestに含まれない条件で実行しない。
- receipt、position、両台帳、取消結果が再起動後も一致する。
- 収益証拠がない場合に利回りを表示しない。

## 関連資料

- [OS/Sky/Wallet/Game design](../os-sky-wallet-game-design.md)
- [Game API draft](../game-api-contract-draft.md)
- [GX01 plan](../gx01-contract-implementation-plan.md)
- [Value/spend runtime](../value-spend-runtime.md)
- [Market and fund](../everything-market-and-autonomous-fund-20260913.md)

## 検証

- `node --experimental-strip-types --test tests/everything-market.test.mjs tests/fund.test.mjs tests/markets-adapter.test.mjs`
- nativeのGX00/GX01/DX01受入script
