# Sky メルカリ収益ループ

**2026-09-24 現行判断:** 8.88 USDの精算案は収益動線が決まるまで保留。以下の計算・手順は旧案の設計履歴で、現在の利用料ではない。出品支援と未照合売上の安全な記録は継続するが、新たな料金計上・請求・回収は行わない。

最終更新: 2026-09-12

## 目的

Skyの8.88 USDを先払い請求せず、利用者が自分の在庫から販売収益を作る工程を支援し、外部Providerで取引完了と金額を確認できた実費後収益からだけ月最大8.88 USDを精算する。販売の成立、時期、価格、利益は保証しない。

## 実装済み

- Sky標準ツール「メルカリ収益スターター」と`/income/mercari`の利用画面
- 本人別D1保存、100件上限、revisionによる競合更新拒否
- 商品事実、状態、販売価格、販売手数料、送料、原価、その他実費からの出品原稿と見込み手取り作成
- 在庫保有、正確な説明、禁止出品物の確認と、出品前の明示承認
- `review → approved → listed → awaiting_provider_verification`の順序付き状態遷移
- 自己申告の取引完了を未照合のまま保持し、検証済み収益へ昇格させない境界
- 取消、再送、古いrevision、同じIDで異なる内容を拒否するAPI

## 個人メルカリ

Skyはアカウントのメール、パスワード、Cookie、二要素認証を取得せず、ブラウザbotで出品しない。コピー可能な原稿と利益計算を作り、本人がメルカリ公式画面で写真、カテゴリ、配送条件、説明、価格を確認して出品する。購入者対応、取引メッセージ、発送、評価、出金も本人が公式フローで行う。

メルカリの[禁止されている行為](https://help.jp.mercari.com/guide/articles/258/)と[繰り返し出品に関する案内](https://help.jp.mercari.com/guide/articles/1864/)に反する代理取引、外部決済誘導、虚偽表示、保有数を超える出品、検索露出目的の大量削除・再出品は自動化しない。メルカリ自身の[AI出品サポート](https://help.jp.mercari.com/guide/articles/1867/)と同様、生成後の内容確認は本人が行う。販売利益は通常、発送後に取引が完了してから反映されるため、出品や支払い通知だけを確定収益にしない（[売上金の反映](https://help.jp.mercari.com/guide/articles/95/)）。

## メルカリShops Connector

[Mercari Shops公式API](https://api.mercari-shops.com/docs/index.html)はGraphQL、BearerのPersonal API Access Token、契約で指定されたUser-Agentを使用する。本番とSandboxはendpointとTokenが別である。APIは日本国内の専用固定IPからのアクセスを求めるため、動的なCloudflare Sitesから直接呼ばず、日本国内固定IPのPCまたは小型server上のSky Connectorを実行点とする。

Connectorは最初にSandboxで`createProduct`相当の出品準備、承認された単一mutation、注文取得、取消を検証する。Webhookは非推奨の`order_*`ではなく`order_transaction_created`、`order_transaction_paid`、`order_transaction_canceled`と一部取消用`order_cancellation_completed`を使用し、受信元IP制限後にGraphQLで最新状態と金額を再取得する。Webhookの本文だけで精算しない。

## 精算へ渡す条件

次をすべて満たすまでSky Billing WorkerへEarning Receiptを送らない。

1. 承認された出品操作に対応するExecution Receiptが一つある。
2. Providerの一意な取引IDが別のReceiptで使われていない。
3. Provider APIで取引完了、取消・一部取消・返金状態、通貨、総額を再取得できる。
4. 販売手数料、送料、商品原価、その他直接実費を確定できる。
5. 結果不明、dispute、返金、chargebackでない。

この条件を通った実費後収益だけ、RQ20の署名済みEarning Receiptへ変換する。売上0なら回収0、残額が8.88 USD未満ならその残額だけ、不足分の債務化・翌月繰越・カード請求は行わない。

## 残る本番条件

- メルカリShopsの利用契約、Sandbox / production Token、API client name
- 日本国内の専用固定IPを持つConnector実行環境
- Sandboxでの商品作成、注文、全取消、一部取消、timeout、再試行の受入
- JPY売上をUSD精算へ変換する確定FX source、時刻、丸め、費用負担の方針
- 販売主体、本人確認、税、返金、問い合わせ、払出しの運用
- 最小live取引による入金・取消・Earning Receipt・払出し指図の照合

したがって、個人メルカリの出品支援は利用可能だが、メルカリShopsからの検証済み実収益と8.88 USDの本番自動回収は外部条件が揃うまで無効である。
