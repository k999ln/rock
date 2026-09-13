# Polymarket-bot sandbox adapter

`MrFadiAi/Polymarket-bot`の注文機能を直接取り込まず、固定commitのoffline backtestだけをRockstarOS用の検証reportへ変換するadapterです。

## 使い方

```bash
git clone https://github.com/MrFadiAi/Polymarket-bot.git
git -C Polymarket-bot checkout 3a04fc842bc3112a11b872263bb55e6712096f9a
npm --prefix Polymarket-bot ci
node toolkits/polymarket-bot-sandbox/run-backtest.mjs \
  --repo Polymarket-bot \
  --input /absolute/path/to/snapshots.jsonl
```

標準出力のJSONをRockstarOS Marketsの「Botバックテスト検証」へ貼り付けます。adapterはcommitとclean treeを検査し、子processから秘密鍵関連の環境変数を除外します。

## 境界

- 注文、Wallet接続、approve、redeem、panic sell、LIVE切替は実行しません。
- backtest損益は合成結果であり、ファンド収益、利回り実績、8.88 USD回収原資にはなりません。
- 実現損益を将来計上する場合も、取引Providerの約定・清算・手数料・返金証跡とRockstarOS Execution Receiptの照合が別に必要です。
- 原リポジトリはMIT Licenseですが、Polymarket利用条件、提供地域、税務、Wallet管理は別条件です。
