# Sky MCP Connector

Skyと複数のMCP serverの間で動く、PC内の共通Connectorです。`registry.json`へ接続定義を追加すると、Sky側のコードを変えずに同じ「接続 → initialize → tools/list → Connection Passport → 承認付き実行」を使えます。

## 起動

Node.js 22.13以上が必要です。macOSは配布パック内の`Sky MCP接続.command`を開きます。開発環境ではrepository rootから次を実行します。

```sh
npm run mcp:connector
```

Connectorは`127.0.0.1:38479`だけで待ち受けます。Skyの許可済みOrigin以外は拒否し、ブラウザsessionと接続tokenを結びます。

## MCPを追加

stdio MCPは、`registry.json`へ実行ファイルと引数を別々に指定します。shell文字列は実行せず、`shell: false`で起動します。MCPへ渡す環境変数も名前だけをallowlistに追加し、値はPC側の環境から読みます。

```json
{
  "id": "my-automation",
  "name": "自分の自動化",
  "description": "何を行うMCPか",
  "transport": "stdio",
  "command": "node",
  "args": ["my-automation/server.mjs"],
  "cwd": "..",
  "env": ["MY_AUTOMATION_TOKEN"],
  "required": false
}
```

遠隔MCPは`transport: "streamable_http"`とHTTPS URLを指定します。redirect、URL内の認証情報、private/loopback/link-local IPへの接続を拒否します。Bearer tokenが必要なら値ではなく`authEnv`へ環境変数名を指定します。OAuth browser flowはまだ未接続で、401/403は`needs_authorization`として停止します。

## 安全境界

- 接続時にprotocol version、server identity、capabilities、tool schemaを取得し、SHA-256 digest付きConnection Passportを作ります。
- tool annotationsは第三者入力として扱い、全toolを既定で承認必須にします。
- 実行前の`prepare`でserver・tool・引数・tool digestに結び付いた5分有効の一回券を発行します。
- `execute`は同じ内容と明示確認がある時だけ通します。券の再利用や承認後の引数変更は拒否します。
- `tools/call`は自動再送しません。送信後timeoutは`outcome_unknown`として、人またはprovider固有status APIで照合します。
- UIから任意commandを登録するAPIはありません。配布・審査済みregistryをPC所有者が導入します。

詳しい共通契約は[`../../docs/sky-mcp-connector.md`](../../docs/sky-mcp-connector.md)を参照してください。
