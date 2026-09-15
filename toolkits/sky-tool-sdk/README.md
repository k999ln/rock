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
  skyUrl: process.env.SKY_URL,
  developerToken: process.env.SKY_DEVELOPER_TOKEN,
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
    publicMcpUrl: 'https://tools.example.com/mcp'
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

## 登録と公開の境界

`start()`は既定でSky登録を試し、通信できない場合もローカルMCPは起動します。登録を必須にする場合は`registration: 'required'`、無効にする場合は`registration: false`を指定します。`autoPublish: true`はRegistryへ「開発者宣言済み」として掲載しますが、Sandbox実行、作者署名、接続、金融操作の検証を代替しません。状態が`published_declared`のToolはSkyから自動インストールできません。

開発者キーはRock Studioで発行し、`SKY_DEVELOPER_TOKEN`環境変数へ保存します。GitやTool Packageへ含めません。キーはSky側へSHA-256のみ保存され、再表示されません。

## 利用情報

SDKが送る情報はPackage ID、MCP Tool名、匿名Installation ID、成功・失敗・拒否・不明、処理時間、実行時刻だけです。入力、出力、会話、APIキーは送信しません。イベント送信失敗でToolの結果を失敗に変えません。

## 外部変更と金融操作

`sideEffects: ['external_write']`または`['financial']`を宣言するToolは`authorize` callbackなしでは登録できません。callbackはSkyのExecution Covenantや自サービスの権限を検証し、真偽値を返します。SDKは`true`以外を拒否します。未知の結果を自動再送せず、`maxAttempts`は常に1です。

このDeveloper Previewは任意コードをSandbox化しません。handlerは開発者のNode.jsプロセスで動きます。Skyの検証済み自動実行へ進めるには、Rock StudioのSandbox、署名、権限差分、取消・照合試験が別途必要です。
