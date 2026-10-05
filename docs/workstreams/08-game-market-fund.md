# Game / Market / Fund

## 目的

AIネイティブOSの共通仕事・記憶・権限契約を、Game／IP制作、ゲーム作者向けAPI/SDK、ゲームとの連携へ広げる。非金融の制作・ゲーム体験はファンド収益の完成と独立して進める。Walletとゲーム通貨の交換、PAPER市場、ファンドはそれぞれの台帳と承認・照合契約を使う。

## 現在地

- 複数owner/player/game分離、ATMと独立したゲーム交換fixture、作者SDKとsandboxを実装・検証済み。
- PAPER市場はproposal、risk、digest承認、receipt、position、append-only eventを実装済み。
- Web/D1はapproval・reservation・receipt・positionのowner／proposal一致をrelation triggerで強制し、直接SQLでも孤立・別owner参照を拒否する。
- ファンドは検証済みreceiptがある場合だけ構成・配分・観測利回りを再計算する。
- 実ゲームsandbox、実市場注文、清算、実Wallet資金移動、自動再投資は未接続。
- `GM01`（AI06から切り出し、進行中・draft PR）: R5統合設計§03／GAME01の最小操作を、決定的な2D粒子sandbox（`lib/game-sandbox.ts`）としてhost／fixture段階で実装した。選択、保持中だけの移動、放す、衝突・結合、分離、取消、時間停止、追跡喪失時の保持解除＋休止、版付きsaveからの再開を扱い、不正save・形式版違い・規則版違いを拒否する。別プロセス再起動を挟んだ再開が無停止実行と同じ状態digestになることを試験する。金額・課金・交換・Wallet・GX01には接続しない。R5裸眼空間表示、精密3D入力、安全、熱・電源・収納（MAT15）、実機・OS統合の合格ではない。共通仕事・限定記憶・Zema進捗への接続（AI06本体）は未着手。

主なtask: 非金融Game／IP縦断の`AI06`（2D最小loopは`GM01`）、`GX00`, `GX01`, `GX02`, `DX01`, `MKT01`, `MKT02`, `SPN01`, `FND01`。

## 次に進める順番

1. 共通Core契約を使うGame／IPの非金融fixtureを作り、Zemaの進捗・成果・プロジェクト分離・中断再開を確認する。
2. 外部ゲームを接続する段階で、対象と公式API／sandboxを確定し、作者SDKの導入時間、成功率、復旧時間を測る。
3. 金融交換を追加する段階で交換方向、通貨、rate、取消条件を明示し、正式sandboxで残高、予約、確定、取消、再送、二重使用拒否を検証する。
4. 市場とファンドはPAPERを維持し、Provider、地域、KYC、清算が揃うまでLIVEを有効化しない。これを非金融Game／IP開発の依存にしない。

## 完了条件

- gameのポイント発行権限とWalletの資金記帳権限を分離する。
- exact digestに含まれない条件で実行しない。
- receipt、position、両台帳、取消結果が再起動後も一致する。
- 収益証拠がない場合に利回りを表示しない。

## 関連資料

- [AIネイティブOS詳細設計・Game／IP縦断案](../ai-native-os-architecture.md)
- [OS/Sky/Wallet/Game design](../os-sky-wallet-game-design.md)
- [Game API draft](../game-api-contract-draft.md)
- [GX01 plan](../gx01-contract-implementation-plan.md)
- [Value/spend runtime](../value-spend-runtime.md)
- [Market and fund](../everything-market-and-autonomous-fund-20260913.md)

## 検証

- `node --experimental-strip-types --test tests/everything-market.test.mjs tests/fund.test.mjs tests/markets-adapter.test.mjs`
- `node --experimental-strip-types --test tests/game-sandbox.test.mjs`（GM01、`npm test`経由で`npm run verify`に含まれる）
- nativeのGX00/GX01/DX01受入script
