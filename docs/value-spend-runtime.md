# RockstarOS Value/Spend Runtime

更新: 2026-10-01。状態: host上のSIMULATION/PAPER vertical slice。LIVE、実USDC、Polymarket API、秘密鍵/API key、本番providerは未接続。

## 製品境界

HubとMCPは同じ入口/管理・実行面であり、別製品として扱わない。Walletは単なる残高画面ではなく、crypto、game、internal、externalの価値を資産別に正規化するValue Routerとする。ゲーム内資産とUSDCを同一残高へ暗黙変換しない。

外部効果は必ず次の状態機械を通る。

```text
Hub / MCP command
  -> Spend Proposal（対象・資産・上限・mode・期限を固定）
  -> Policy / Risk Guard
  -> USER または限定POLICY approval（proposal digestを固定）
  -> Wallet SPEND_HOLD（append-only journal）
  -> Secret Vault handle -> Signing Service
  -> adapter（署名済みauthorizationだけを受領）
  -> execution receipt
  -> commit / release / UNKNOWN hold
  -> reconciliation
```

adapterはWallet DB、秘密値、任意送金権限を受け取らない。予約後・provider claim前の中断は同じexecution keyで安全に再開できる。provider claim後の中断や結果不明は再送せず`UNKNOWN`へ固定し、holdを保持してreconciliationだけを行う。

## 実装したvertical slice

- `blackberryrock.spend.ValueSpendRuntime`: proposal、risk、approval、二相支出、receipt、position、PnL、settlement、event、Hub/MCP command。
- `Asset Registry`: `crypto / game / internal / external`、issuer、network、scale、`transferable / redeemable / external_withdrawal`、valuation source。登録後の条件はimmutable。
- 既存Wallet: 同じSQLite transaction、`wallet_journals`、`wallet_postings`、`wallet_idempotency`を再利用。`SPEND_HOLD / SPEND_COMMITTED / SPEND_FEES / SPEND_GAS`を追加し、全journalを再照合する。
- `SecretVault` / `SigningService`: dry-runでは秘密値を持たないopaque handleと模擬署名だけを作る。adapterへ渡すauthorizationにはsecret materialを含めない。
- `PolymarketDryRunAdapter`: 第一号adapter。upstream botのソースはコピーせず、共通proposal/receipt契約へ変換する。外部order IDとfinancial transactionは常にfalse/none。
- OS標準mode: SIMULATIONとPAPERのみ利用可。LIVEはpolicy表示でもruntime能力でもfalse。Polymarket dry-run adapter自体もLIVEをsupportしない。
- Risk Guard: emergency stop、order上限、24時間realized loss上限、open exposure、slippage、strategy enableをproposal時とexecution直前に確認する。
- Strategy controls: manualのみ初期有効。arbitrage/dip_arbは明示操作まで無効、Smart Moneyはupstream境界が解消するまで有効化自体を拒否する。
- 資産別balance/positions/PnL: `wallet.synthetic.usd`だけが合成支出に使用できる。`polygon.usdc`はregistryに存在するが残高は`NOT_CONNECTED`で、合成残高と合算しない。
- local Hubの`POST /api/hub-mcp`が同じ厳密command contractを公開し、`GET /api/state`からValue/Spend状態を確認できる。

## Hub/MCP commands

すべて`{"v":1,"op":"..."}`を使用し、未知fieldを拒否する。

| command | 役割 |
| --- | --- |
| `asset.list` | registryと資産制約 |
| `spend.snapshot` / `spend.get` | balance、proposal、receipt、position、PnL、risk |
| `spend.propose` | exact proposalとquote/risk結果を保存 |
| `spend.approve` | exact digestへUSER/POLICY decisionをappend |
| `spend.execute` | hold、署名、adapter、commit/release/unknown |
| `spend.reconcile` | 送信済み結果を照会し、同じreceiptだけで終端 |
| `a2a.budget.reserve` / `a2a.budget.get` | A2A親job・委任・承認digest・Unix millisecond deadlineを結んだ合成Wallet hold |
| `a2a.budget.dispatch` | 一度だけ送信開始状態へ進め、以後の取消解放を禁止 |
| `a2a.budget.indeterminate` | 結果不明としてholdを保持し、自動再送・解放を禁止 |
| `a2a.budget.release` | 未dispatchのholdだけをAVAILABLEへ戻す |
| `a2a.budget.settle` | 注入済みtrusted receipt verifierが受け入れた実額を記録し、残額を返す |
| `event.list` | 共通eventをprefixで参照 |
| `position.mark` | asset別unrealized PnLを更新 |
| `settlement.record` | 合成payoutとrealized PnLを記録 |
| `risk.configure` / `risk.emergency_stop` | 上限と全新規支出停止 |
| `strategy.set` | adapter単位のstrategy制御 |

共通eventは`spend.* / a2a.* / trade.* / position.* / settlement.* / risk.* / pnl.*`。append-onlyの`value_events`がHub表示と将来の重要通知の同じ参照元になる。現時点では外部push通知は未接続。

## A2A job Wallet予約とBroker proof fence（2026-10-01）

`ValueSpendRuntime.authorize_a2a_proof(principal, proof, key)`はBrokerの`a2a_wallet_reservation_authorizer`へ直接注入できるcallable。schema/authority/owner/device/delegation/parent job/USD cap/approval digest/deadlineとproof lifetimeを検証し、同一SQLite transaction内で予約と照合してproof有効期限までのfenceを記録する。owner・device・control key・approval digestが同一の再試行だけを許し、異なるkey／条件は拒否する。fence中は通常releaseを拒否し、期限切れ後は未dispatch holdをreleaseできる。dispatch・indeterminate・settlementは別状態のままで、usage receiptの信頼設定がなければsettleしない。

既存のRockstarOS synthetic Wallet／ValueSpend ledgerに`a2a_wallet_reservations`を加えた。親job・delegation ID・USD上限・owner承認digest・期限を一意に固定し、同じSQLite transactionで`AVAILABLE → SPEND_HOLD`へ移す。親・owner・金額・通貨・期限の差替えは同じdelegationへ適用できず、idempotency keyのpayload差替えも拒否する。

状態は`HELD → DISPATCHED → INDETERMINATE → SETTLED`。明示的なpre-dispatch状態`HELD`からだけ解放できる。dispatch後は結果不明でもholdを維持し、provider/Walletの信頼済みusage verifierが設定されていない場合、receipt精算はfail-closedで拒否する。verified receiptの実額だけを`SPEND_COMMITTED`へ記帳し、未使用額は`AVAILABLE`へ戻す。Wallet verifierはDB transaction外で動き、精算時に予約の不変bindingを再照合する。

Hub `/api/hub-mcp` の厳密command schemaから同じ機能を呼べる。host testはatomic hold、idempotency conflict、上限超過、dispatch後解放拒否、indeterminate hold保持、verifierなし拒否、trusted-verifier fixtureによる一回精算を検査する。

**この追加は合成USD Wallet内の予約契約であり、A2A cloud D1のreservationとのwire/proof binding、実Wallet資金、実provider課金または署名鍵運用をつないだものではない。** Local DEVELOPMENT Hubは`ROCKSTAR_A2A_TRUSTED_USAGE_KEYS`が明示設定された場合のみEd25519 verifierを注入し、既定ではreceiptを確定できない。公開RFC test keyでHub経由のsigned-receipt settlementを検証するfixtureを追加した。本番execution gateと外部送信は引き続きdefault-off。

## Polymarket upstream監査

参照元は`MrFadiAi/Polymarket-bot` main `82647014e0c355a5684e09666d8a0a522234640d`（MIT）。Rockはupstreamコードや`.env`方式を取り込んでいない。

- `bot-with-dashboard.ts`のSmart Money callbackはdry-runだけを処理し、live側がplaceholder。
- dashboardのPnLはposition価格からunrealizedを別計算する一方、total更新と取引receipt/fee/gasを同じ台帳で照合する経路は完成証拠がない。
- upstream PR #9 `d7581bae7d659b4a8118d2700dc085458c9b3783`はfee-blind計算、無保護market order、dual-order race、exposure未強制等13件の修正を記載するが、2026-09-12監査時点でOPEN。mainへmerge済みとは扱わない。
- upstream READMEはprivate keyをbotの環境変数へ置く方式。Rockの設計では採用せず、adapter processに平文を渡さない。

したがってupstreamのrisk表示やstrategy成功を信頼境界にせず、Rockが支出前に上位制御する。upstreamの実strategyやAPIは将来のToB/provider側で、Rockの共通runtimeを置換しない。

## 検証と未実装境界

unit testsは、資産分離、exact approval、idempotency、append-only balance、fee/gas、緊急停止、失効、daily loss/exposure/order/slippage、秘密値非露出、予約後の中断復旧、provider claim後のUNKNOWN hold、reconciliation、position/PnL、Hub/MCP command、既存Game台帳との双方向migrationを合成データで確認する。

未実装はPolymarket API/CLOB、実balance/position取得、実USDC予約、production vault/HSM、provider sandbox、KYC/地域条件、実fee/gas照合、実order cancel/settlement、外部通知、native OSのHTTPS MCP gatewayへの同command配線、Android移植、LIVE enable ceremony。これらが揃うまでLIVEは有効化できない。

既存baselineとの変更理由: v1.10では予測市場runtimeはdiscussion onlyだったが、利用者が2026-09-12に共通runtimeと第一号Polymarket integrationの設計・実装を明示したため、RQ18としてSIMULATION/PAPERの実装許可へ更新した。実資金/LIVEの許可へは拡張していない。月888 cents、ATM自社手数料0、ゲーム交換条件、既存台帳を変更しない。
