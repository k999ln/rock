# サブスク顧問 — Sky接続

Skyの自動化Hubから、PC内で動くRockstar Ledgerのサブスク台帳を読み取り専用で確認する接続です。

## 導入

1. Skyの「サブスク顧問」から `rockstar-ledger.zip` を取得して展開します。
2. 展開先で `python3 scripts/run_local.py` を実行します。
3. `http://127.0.0.1:8765` が開いた状態でSkyの「準備を確認」を押します。

Skyには月額換算、契約・候補数、要対応、更新日と警告が表示されます。「今月いくら？」「要対応は？」「次の更新は？」などをサブスク顧問へ会話形式で質問できます。回答は表示時に取得したローカル台帳だけから作り、外部AIへ送りません。契約や明細の実データはRockstar Ledgerの `data/ledger.sqlite3` にだけ保存され、Gitには含まれません。

CodexなどからMCPで使う場合は、展開先の `.mcp.json` を読み込むか `python3 scripts/mcp_server.py` をstdioサーバーとして登録します。

## 境界

- Sky側は確認専用です。追加・編集・解約・支払い・税務申告は実行しません。
- 異なる通貨を勝手に換算・合算しません。
- 現在の直接接続はローカル開発版Skyと同じPCでの利用が対象です。HTTPSで配信されたWeb版からHTTPのloopbackへ接続する構成は対象外です。
- Native SkyのMCP brokerへの常駐接続とWalletへの費用転記は次の段階です。

同梱物: Rockstar Ledger commit `0d3f29f3f8986669ac6516cea252aa2fa506a1ef`、MIT。配布ZIP SHA-256: `abfdbbc884fb0723f74a1f4ece73cbe755104312eb1ec51e4f4f83bdb0224651`。
