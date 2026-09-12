# RockstarOS Value/Spend Runtime

日付: 2026-09-12。状態: host上のSIMULATION/PAPER vertical slice。LIVE、実USDC、Polymarket API、秘密鍵/API key、本番providerは未接続。

## 製品境界

Sky（既存API/DBの内部互換名Hub）とMCPは同じ入口/管理・実行面であり、別製品として扱わない。Walletは単なる残高画面ではなく、crypto、game、internal、externalの価値を資産別に正規化するValue Routerとする。ゲーム内資産とUSDCを同一残高へ暗黙変換しない。

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
| `event.list` | 共通eventをprefixで参照 |
| `position.mark` | asset別unrealized PnLを更新 |
| `settlement.record` | 合成payoutとrealized PnLを記録 |
| `risk.configure` / `risk.emergency_stop` | 上限と全新規支出停止 |
| `strategy.set` | adapter単位のstrategy制御 |

共通eventは`spend.* / trade.* / position.* / settlement.* / risk.* / pnl.*`。append-onlyの`value_events`がHub表示と将来の重要通知の同じ参照元になる。現時点では外部push通知は未接続。

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

既存baselineとの変更理由: v1.10では予測市場runtimeはdiscussion onlyだったが、利用者が2026-09-12に共通runtimeと第一号Polymarket integrationの設計・実装を明示したため、並行追加されたRQ18/RQ19を保持してRQ20としてSIMULATION/PAPERの実装許可へ更新した。実資金/LIVEの許可へは拡張していない。月888 cents、ATM自社手数料0、ゲーム交換条件、既存台帳を変更しない。
