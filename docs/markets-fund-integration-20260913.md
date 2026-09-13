# RockstarOS Markets・自動化ファンド統合

更新日: 2026-09-13

## 結論

RockstarOS Marketsを、動的な自動化ファンドが選べる1つの市場分析ツールとして統合した。Marketsは公開ライブ市場の確率・出来高・流動性を読み取るだけで、注文、清算、Wallet移動、収益認識は行わない。ファンド数は固定せず、1ファンドの初期推奨5ツールと利用者による構成数変更を維持する。

## ソース比較と競合解消

| 項目 | RockstarOS Markets | 自動化ファンド正本 | 統合結果 |
| --- | --- | --- | --- |
| 市場情報 | ライブAPIと表示用fallbackを持つ | Provider確認済みReceiptだけを実績にする | RockstarOS側adapterは`source=live`だけを通し、fallback時は503で閉じる |
| quote / 損益 | 判断用のindicative estimate | 確定売上−承認済み直接実費だけを純収益にする | quote、未確定損益、出来高を収益へ渡さない |
| 残高・配分 | Markets UI内の表示領域 | D1 fund membershipとSky Billing台帳が正本 | Marketsから残高や配分をimportせず、会計を重複させない |
| ツール構成 | 単独の市場terminal | ready catalogから動的に形成 | `rockstar-markets-analysis`をready候補として追加 |
| 取引 | venue接続の可能性 | 外部作用は個別approval gate | RockstarOS adapterでは注文実行を無効に固定 |

## 実装境界

- `/api/markets/analysis`は公開ライブ市場だけを最大12件まで読み取り、取得不能・fallback・空データではサンプル値を返さない。
- `/polymarket`は取得状態、確率、出来高、流動性を「分析」と明示し、利回り・確定収益ではないと表示する。
- `MrFadiAi/Polymarket-bot`は固定commit・clean treeのoffline backtestだけをsandbox wrapperから利用し、reportをMarkets内で検証する。秘密鍵、LIVE切替、注文runtimeは接続しない。
- Marketsをready catalogへ追加したため、新規ファンドの候補には自動的に入る。初期の検証済みgross/cost/receiptはすべて0である。
- ファンド会計は既存のSky Billingを唯一の正本とし、Provider参照、Execution Receipt、重複防止、UTC月ごとの利用者合算上限888 cents、成果報酬0、共同留保0を維持する。
- 旧80/10/10は`/fund/legacy`の履歴表示だけに残し、Marketsおよび新規ファンドへ適用しない。

## 実取引のゲート

今回の統合で実注文、自動再投資、Walletからの資金移動、一般公開範囲の変更は行わない。将来の注文には、所在地と提供地域、年齢、KYC、利用規約、規制、Wallet署名、注文内容と最大損失に結び付いた明示承認が必要である。取引Providerで注文完了、取消、清算、手数料、返金を照合し、確定した実現損益だけをEarning Receipt候補にできる。

## 検証

- `tests/markets-adapter.test.mjs`: live限定、件数上限、fallback拒否、収益不計上を確認する。
- `tests/automation-fund.test.mjs`: ファンド数非固定、初期5ツール、構成数変更、重複・不足時の安全停止を確認する。
- `npm run verify`: 正本同期、型、lint、全テスト、package、Billing dry-run、本番build、API契約をまとめて確認する。
