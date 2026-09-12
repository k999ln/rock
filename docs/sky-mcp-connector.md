# Sky MCP Connector 共通基盤

最終更新: 2026-09-12

## できること

Sky固有の自動化コードと個別MCPを直接結ばず、すべてを同じ接続契約へ変換する。現在の配布registryには「Sky 基本自動化」4機能と「受注型ブランド運営」38機能があり、SkyのMCP画面からそれぞれをワンタップで初期化・検出できる。

```text
Sky / n8n / Make / Zapier / 独自workflow
                    │
                    ▼
         Sky MCP Connector (localhost)
          │ registry  │ approval gate
          ├───────────┼──────────────┐
          ▼           ▼              ▼
       stdio MCP  Streamable HTTP  将来のOAuth adapter
```

自動化ツール側が使う操作は`servers`、`connect`、`prepare`、`execute`の4段階に固定する。MCP serverごとの機能名や個数は`tools/list`から動的に取得するため、4機能・38機能などの固定実装を持たない。

## Connection Passport

接続成功時に次を保存・表示できる形で返す。

- server name / version
- negotiated MCP protocol version
- capabilities
- tool name / title / description / inputSchema
- tool一覧全体のSHA-256 digest
- 接続確認時刻
- 各toolのapproval policy

Passportは安全性の保証ではなく、接続時点で確認した相手と機能のスナップショットである。第三者のdescription、schema、annotationsは未信頼入力として画面表示時にescapeし、annotationsだけで承認を省略しない。

## Provider / 自動化ツールからの利用

1. `POST /connect`でOriginに結び付いたPC sessionを作る。
2. `GET /servers`で導入済みMCPを取得する。
3. `POST /servers/:id/connect`でinitialize、initialized notification、tools/listを実施する。
4. 読み取り・書き込みを問わず`POST /servers/:id/prepare`で実行内容を固定する。
5. 人が表示内容を確認した後、同じ引数と一回券を`POST /servers/:id/execute`へ送る。

外部作用を持つProviderは、そのMCP内部でも価格変更、広告出稿、請求送信、返金などに個別approvalを要求できる。Connectorの承認は「どのMCPへ何を送るか」、Provider側の承認は「外部サービスで何を確定するか」を守る二層構造になる。

## Transportと認証

- stdioは審査済みregistryだけから起動し、shellを介さない。UI入力からcommandを作らない。
- Streamable HTTPはHTTPSだけを許可し、DNS解決後のprivate/loopback/link-local宛て、redirect、URL credentialを拒否する。
- 認証値はSkyやregistryへ保存せず、Connectorを起動したPCの環境変数からだけ読む。
- OAuth 2.1の認可画面、PKCE、Protected Resource Metadata、scope追加同意は次段階。未実装の接続先は`needs_authorization`で停止し、接続済みと表示しない。

## 互換性と移行

既存Skyの`/mcp`経路は、配布済み4機能向けの互換入口として残す。新しい自動化はserver IDを持つ汎用経路を使う。これにより既存コードを壊さず、機能数固定を段階的に廃止できる。

公式MCP 2025-11-25のlifecycleとstdio / Streamable HTTPを基準にし、2025-06-18、2025-03-26、2024-11-05を接続時に互換確認する。実行送信後のtimeoutは自動再試行せず、結果不明として照合へ回す。
