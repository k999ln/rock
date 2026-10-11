# Rockstar Market / 自律型ファンド — 2026-09-13

## 結論

Polymarketそのものを掲載・接続する画面から、RockstarOS独自の汎用市場へ置き換えた。自動化、デジタル成果物、サービス、商品、稼働枠を同じasset registryへ登録し、アプリ内でPAPER取引を最後まで実行できる。既存の自動化ファンドは別機能として維持し、本人の検証済み帳簿と実行receiptから構成・配分・観測returnを再計算する。

## 採用したバックエンド境界

過去に実装・監査された `ValueSpendRuntime` の境界をWeb/D1へ移植した。

```text
typed asset registry
  -> spend proposal（価格・数量・mode・期限・riskを固定）
  -> SHA-256 exact digest
  -> owner approval
  -> PAPER reservation
  -> execution receipt
  -> position + append-only event
```

proposalの注文条件・risk・idempotency keyは更新禁止、approval・receipt・eventはmigration triggerで更新・削除を拒否する。追加のrelation guardは、approval・reservation・receipt・positionが同じownerとproposalへ結び付くこと、reservation金額とpositionのasset・side・数量・価格・notionalがproposalと一致することをDB側でも強制する。APIはSites gatewayの本人IDとsame-originを必須にし、未知field、失効、上限超過、digest不一致、未承認実行、LIVE modeを拒否する。PAPER opening balanceは1,000 USD、1注文上限は500 USD、総open exposureは1,000 USDで、これは換金・譲渡・外部注文できない検証値である。

## 自律型ファンド

ファンド数は固定せず、1ファンドの構成ツール数も1〜20で指定できる。ready toolを対象に方針適合、検証済み純収益、receipt数、失敗数をスコア化し、役割の重複を避けて候補を選ぶ。

画面は30秒ごとに再取得する。APIはその時点の本人別データから次を再計算する。

- 署名検証済みEarning Receiptのツール別売上と実費
- 本人所有のtool run receiptの完了数と失敗数
- 純収益
- 実費に対する観測return
- 推奨ツール構成と配分

通常のWallet手入力は自己申告なので利回りの証拠へ使わない。Earning Receiptの `automationToolId` がcatalogのtool IDと一致する場合だけ結び付ける。実費が0または検証receiptがない場合、観測returnは算定待ちとし、架空の利回りを表示しない。

## 非対応・LIVE gate

この版は実資金市場ではない。Polymarket API/CLOB、外部order、秘密鍵、USDC、実Wallet予約、清算、結果判定、配当、再投資、自動資金移動は無効である。PAPER市場の損益はファンドの検証済み収益へ入れない。

LIVE化には、少なくともprovider契約、本人確認、地域・年齢条件、保管・清算主体、対象資産の権利、価格形成、返金・取消・異議、AML/不正監視、税務、秘密鍵/HSM、sandbox受入、ownerの明示承認が必要である。

## 操作

- `/market`: 検索、カテゴリ、取引対象追加、提案、承認、PAPER実行、レシート確認。
- `/fund`: 方針とツール数を指定してファンド形成。30秒ごとに構成・配分・観測returnを更新。
- `/polymarket`: 旧bookmark互換として同じRockstar Marketを表示する。

## 復旧

市場の新規処理を止める場合は `/market` の入口を非表示にし、`app/api/market/route.ts` のPOSTを503で閉じる。D1のproposal、approval、receipt、position、eventは削除せず保持する。deploymentを直前のSites versionへ戻しても、migrationは破壊せず新tableが未使用のまま残る。
