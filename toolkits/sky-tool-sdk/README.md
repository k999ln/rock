# Sky Tool SDK — Developer Preview

既存のNode.jsコードへ数行追加し、同じ定義から次を行う開発者向けSDKです。

- Sky Tool Packageの生成と所有者領域への登録
- 任意の宣言済み掲載（自動インストールは別の検証gate）
- MCP `initialize` / `tools/list` / `tools/call`
- 匿名Installation ID単位の成功・失敗・処理時間の記録
- 入力Schema検査、timeout、外部変更・金融操作の承認callback

## 最小導入

新しいToolは雛形から開始できます。現在のリポジトリ内で試す場合は次を実行します。

```sh
node toolkits/sky-tool-sdk/bin/create-sky-tool.mjs init work/my-sky-tool --developer your-developer-id --app-id com.example.my-tool
```

SDKがパッケージ配布された後の入口は`npx create-sky-tool init my-tool`です。生成された`index.mjs`の`handler`だけを既存の自動化関数へ置き換え、説明・Schema・副作用・料金を実態どおりに確認します。

既存プロジェクトへ直接組み込む場合の最小例は次です。

```js
import { createSkyToolApp } from '@rockstaros/sky-tool-sdk';

const sky = createSkyToolApp({
  developer: {
    id: 'example-developer',
    name: 'Example Developer',
    supportUrl: 'https://example.com/support'
  },
  app: {
    id: 'com.example.text-tools',
    name: 'Example Text Tools',
    version: '0.1.0',
    sourceUrl: 'https://github.com/example/text-tools',
    license: 'MIT',
    // 公開登録する場合だけ、実際に稼働するHTTPS MCP URLを指定します。
    // publicMcpUrl: 'https://tools.example.com/mcp'
  }
});

sky.tool({
  name: 'count_characters',
  title: '文字数を数える',
  description: '入力された文章のUnicode文字数を数え、構造化された結果として返します。',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['text'],
    properties: { text: { type: 'string' } }
  },
  handler: async ({ text }) => ({ characters: [...text].length })
});

await sky.start({ port: 8787 });
```

完全な例は[`examples/minimal.mjs`](examples/minimal.mjs)です。

### 非推論の追加例

[`examples/line-counter.mjs`](examples/line-counter.mjs)には、文章の行数を数えるToolと二つの整数を足すToolがあります。どちらも決定的な処理です。`createLineCounter()`は定義を作るだけで、登録・公開・起動はしません。作者はこの例を参考に、Tool名、入出力Schema、副作用、料金、handlerを自分の処理に合わせて変更できます。個別ToolのIDをOSの仕事処理へ追加する必要はありません。

作例の`inputSchema`には、版付き`x-rockstaros-tool-contract`で必要な能力IDとpermission・scopeを明示しています。`count_lines`は`example.count-lines`、`add_integers`は`example.add-integers`です。作者は自分のToolの実際の処理と接続先に合わせて能力ID・permission・完全一致する対象scopeを設定してください。network等の対象が必要な権限でscopeが空の場合は未確認です。Smithでは期待する入出力型・能力ID・許容permission/scopeと実Toolを指定して照合します。Packageと実Toolで宣言が一致しても、実行権限・安全性・提供者の申告・料金が検証されたことにはなりません。

隔離した一時ディレクトリと合成の登録情報を使い、SDKのローカルMCPとConnector、明示承認、既存の仕事、miiソフトウェア読戻しをまとめて確認する場合は、リポジトリのルートで次を実行します。

```sh
node --experimental-strip-types --test tests/eve-smith-mii-platform-integration.test.mjs
```

この試験は外部サービスやモデルを呼びません。試験用に検証済みとして扱うPackageはfixtureであり、実際のcatalog掲載・審査・利用権や、任意の第三者コードの安全性を保証するものではありません。実利用には対象Packageの検証状態と利用権、実行先、入力内容、実行時の承認を別途確認します。miiの確認もソフトウェア上の合成入力に限ります。

同じ仕事からの実行は現在、既存`local-preview:` IDを明示したloopback開発環境に限定されます。通常account/eSIMや有料Toolでの実行権限は、この例を起動しても得られません。Connectorは受け取ったTool仕様と仕事の一回claimを照合し、確認できなければ実行しません。

## 登録と公開の境界

`start()`でMCPをPC内で起動すると、SDKは`~/.sky/mcp-tools`へ権限を制限した接続定義を置きます。PC Connectorが動いていれば、RockstarOSのSky一覧にこのAppが自動で現れ、そのカードから接続できます。MCP管理画面でも機能を確認でき、実行時は内容ごとの承認を通します。停止時は接続定義を取り除きます。保存場所を変える場合はSDKとConnectorの両方に同じ`SKY_LOCAL_TOOL_DIR`を設定します。

`app.publicMcpUrl`がない場合はPC内だけで利用し、Sky URLと開発者キーは不要です。公開登録と匿名利用記録は行いません。公開する場合だけ、実際に稼働するHTTPS URL、`skyUrl`、`developerToken`を指定してください。その場合`start()`は既定でSky登録を試し、通信できない場合もローカルMCPは起動します。登録を必須にする場合は`registration: 'required'`、無効にする場合は`registration: false`を指定します。`autoPublish: true`はRegistryへ「開発者宣言済み」として掲載しますが、Sandbox実行、作者署名、接続、金融操作の検証を代替しません。状態が`published_declared`のToolはSkyから自動インストールできません。

公開用の開発者キーはRock Studioで発行し、`SKY_DEVELOPER_TOKEN`環境変数へ保存します。GitやTool Packageへ含めません。キーはSky側へSHA-256のみ保存され、再表示されません。

## 利用情報

SDKが送る情報はランダムなEvent ID、Package ID、MCP Tool名、匿名Installation ID、成功・失敗・拒否・不明、処理時間、実行時刻だけです。入力、出力、会話、APIキーは送信しません。イベント送信は同じEvent IDで最大3回試みますが、プロセスをまたぐ永続保存は行いません。送信失敗でToolの結果を失敗に変えません。

## 外部変更と金融操作

`sideEffects: ['external_write']`または`['financial']`を宣言するToolは`authorize` callbackなしでは登録できません。callbackはSkyのExecution Covenantや自サービスの権限を検証し、真偽値を返します。SDKは`true`以外を拒否します。未知の結果を自動再送せず、`maxAttempts`は常に1です。

このDeveloper Previewは任意コードをSandbox化しません。handlerは開発者のNode.jsプロセスで動きます。Skyの検証済み自動実行へ進めるには、Rock StudioのSandbox、署名、権限差分、取消・照合試験が別途必要です。
