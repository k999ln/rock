# toolkits/ — Tool実装・SDK・connector・試作

Skyの **Toolそのものの実装**、Toolを作るための **SDK**、接続のための **connector**、実資金を動かさない **PAPER試作** をまとめた場所です。ここにあるものは、利用者が所有するAI自動化チームの部品で、それぞれが独立した製品というわけではありません。

- 全Toolと各エージェントの機能は [エージェント・Tool総覧](../docs/agents-and-tools.md)
- 製品・実装単位からの入口は [プロジェクト別ガイド](../PROJECTS.md)
- Sky catalogの登録正本は [`lib/catalog.ts`](../lib/catalog.ts)。ここにフォルダがあるだけでは、Skyの一覧に載った・動いた、という意味になりません

| フォルダ | 種類 | 何か | Sky catalogとの関係 |
| --- | --- | --- | --- |
| [`sky-tool-sdk/`](sky-tool-sdk/) | SDK | Tool作者向けのpackage、サンプル、契約。既存ツールにコードを足してSkyの商品にする | Toolを登録する入口 |
| [`sky-mcp-connector/`](sky-mcp-connector/) | connector | MCPの接続先と権限を管理するPC内の共通Connector（`servers → connect → prepare → execute`） | 全MCP Toolの接続経路 |
| [`mr/`](mr/) | adapter | `Mr.` の固定原本（[`vendor/mr/`](../vendor/mr/)）をSkyへ接続するRock側の実装 | `coconala`・`mr-free-article`・`mr-citations`・`mr-delivery` |
| [`fashion-brand-ops/`](fashion-brand-ops/) | Tool実装 | 受注型ブランド運営の独立MCPサービス（41操作） | `fashion-brand-ops` |
| [`rockstar-ledger/`](rockstar-ledger/) | Tool実装 | サブスク顧問のローカル台帳 | `rockstar-ledger` |
| [`amc-agent/`](amc-agent/) | エージェント定義 | Codexの司令官・実行担当・独立検収と、CLIの入口 | `rockstar-amc` の実行側（Webからの起動は未接続） |
| [`spider-guard/`](spider-guard/) | 共通部品 | 機密情報の検出、外部送信前の検査、端末内コード検査 | catalog Toolではない。OS本体の常駐とは別 |
| [`esim-bootstrap/`](esim-bootstrap/) | 試験fixture | eSIM provider接続を試すhost fixtureとadapter | catalog Toolではない。製品形態を限定しない |
| [`avokado-llm/`](avokado-llm/) | 研究試作 | random-initの小型モデルをCPUで学習・保存・再開する試作 | catalog Toolではない |
| [`mini-game-client/`](mini-game-client/) | 診断launcher | 本人の明示操作で公式Remote Play（PS5／Xbox）へ渡す | catalog Toolではない |
| [`polymarket-bot-sandbox/`](polymarket-bot-sandbox/) | PAPER試作 | 外部市場を動かさないbacktest | `rockstar-markets-analysis` の周辺。LIVE禁止 |
| [`meme-intelligence-sandbox/`](meme-intelligence-sandbox/) | PAPER試作 | ミームコイン候補評価 | 同上 |
| [`avocado-farm-sandbox/`](avocado-farm-sandbox/) | PAPER試作 | 集中流動性LPの候補評価・レンジ計画・リスク制御 | 同上。実トランザクション送信は未接続 |

Toolkitを足したら、[プロジェクト別ガイド](../PROJECTS.md) にも同じ変更で載せます（`npm run sky:check` が欠落を検出します）。
