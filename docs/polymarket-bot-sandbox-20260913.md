# Polymarket bot sandbox統合

更新日: 2026-09-13

## 対象

- Repository: `https://github.com/MrFadiAi/Polymarket-bot`
- Reviewed commit: `3a04fc842bc3112a11b872263bb55e6712096f9a`
- License: MIT
- 統合範囲: 固定commit・clean treeのoffline backtestだけ

## 原本監査で直接接続しなかった理由

READMEは`DRY_RUN=true`を安全なsimulationとして案内するが、監査commitの`bot-with-dashboard.ts`はdry-runでも`POLYMARKET_PRIVATE_KEY`がないと終了し、その後のSDK作成にも秘密鍵を渡す。dashboard commandはprocess再起動や注文ごとのRockstarOS承認なしでLIVEへ切替可能で、simulation tradeの推定profitを共通daily/monthly/total PnLへ加算する。

したがって原botをそのままSkyの収益ツールやEarning Receipt発行元にしない。READMEの「arbitrage profit」表現も約定、価格変動、流動性、手数料、gas、部分約定、清算等の実務リスクを消さないため、収益保証には使用しない。

## 実装

- `toolkits/polymarket-bot-sandbox/run-backtest.mjs`がcommitとclean treeを検査し、秘密鍵関連の環境変数を除いて原本のoffline backtest runnerだけを起動する。
- 出力を`rockstaros-polymarket-bot-backtest/1`へ封入し、source commit、input SHA-256、LIVE無効、収益不計上を固定する。
- `/api/markets/bot/assess`は同一origin、JSON、64KB上限、固定出所、数値整合、秘密情報不在を検査する。reportは保存しない。
- `/polymarket`はreportを検証し、標本不足またはsimulation限定として表示する。positive PnLでも回収原資は0 USDである。

## 実収益への将来ゲート

実注文を有効にする変更は今回含まない。将来も所在地・提供地域・年齢・KYC・利用規約・Wallet署名・注文内容・最大損失に結び付いた明示承認、資金分離、緊急停止、Provider sandboxを先に受け入れる。ファンドへ計上できるのはProviderが約定、清算、手数料、gas、取消、返金を照合した実現損益をExecution Receiptへ一意に結び付けた場合だけである。
