# Polymarket-bot sandbox adapter

`MrFadiAi/Polymarket-bot`の注文機能を直接取り込まず、固定commitのoffline backtestだけをRockstarOS用の検証reportへ変換するadapterです。

## 使い方

```bash
git clone https://github.com/MrFadiAi/Polymarket-bot.git
git -C Polymarket-bot checkout 3a04fc842bc3112a11b872263bb55e6712096f9a
npm --prefix Polymarket-bot ci --ignore-scripts
node toolkits/polymarket-bot-sandbox/run-backtest.mjs \
  --repo Polymarket-bot \
  --input /absolute/path/to/snapshots.jsonl
```

標準出力のJSONをRockstarOS Marketsの「Botバックテスト検証」へ貼り付けます。adapterはcommitとclean treeを検査し、子processへPATH等とbacktest専用設定だけをallowlistして渡します。Wallet秘密鍵、API token、Cloud資格情報等の親process環境は渡しません。

## 境界

- 注文、Wallet接続、approve、redeem、panic sell、LIVE切替は実行しません。
- backtest損益は合成結果であり、ファンド収益、利回り実績、8.88 USD回収原資にはなりません。
- 実現損益を将来計上する場合も、取引Providerの約定・清算・手数料・返金証跡とRockstarOS Execution Receiptの照合が別に必要です。
- 原リポジトリはMIT Licenseですが、Polymarket利用条件、提供地域、税務、Wallet管理は別条件です。
- 監査時の原本lockfileには`npm audit`で30件（critical 1 / high 7を含む）、production依存だけでも22件（high 3を含む）の報告がありました。criticalはtest runner系ですが、解消までは隔離環境・install script無効・offline backtest限定を維持し、原botのdashboardやLIVE runtimeを起動しません。
