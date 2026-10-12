# Sky MCP Connector 共通基盤

最終更新: 2026-09-12

2026-09-20更新: Sky Tool SDKで起動したPC内Toolを`~/.sky/mcp-tools`から自動検出する。接続定義は所有者専用権限、`127.0.0.1`のHTTP URL、一時キーだけを許可する。ConnectorはPC Toolを`local_http`として一覧に加え、同じPassportと一回承認を適用する。SDK停止後は一覧から外す。外部向け`streamable_http`のHTTPS/private network拒否規則は維持する。

2026-10-02 SPIDER改善cycle: 接続定義をpathで確認してから開き直す競合を除く。symlinkをたどらずnonblockingで一度だけ開き、そのfile handleの通常file・所有者専用権限・sizeを検査し、同じhandleから最大4,097 byteだけ読む。4 KiB超過、非通常file、読取失敗は接続候補へ昇格させず、handleは必ず閉じる。開いた後にpathが差し替わっても、検証した元のfileを読み、差し替え先を開き直さない。SDKの正常なatomic renameと一回承認は維持する。defaultのowner専用directoryとその親を信頼するローカル境界であり、悪意ある同一UIDや親directoryの全面的な保護を主張しない。

POSIXでは開いたfileの所有者も実効UIDと照合する。必要な`O_NOFOLLOW`／`O_NONBLOCK`を提供しない環境では、このlocal自動検出を安全側で拒否し、無保護な読取へfallbackしない。macOS／Linuxの回帰と、未対応platformを区別する。

## できること

Sky固有の自動化コードと個別MCPを直接結ばず、すべてを同じ接続契約へ変換する。現在の配布registryには「Sky 基本自動化」4機能と「受注型ブランド運営」41機能があり、SkyのMCP画面からそれぞれをワンタップで初期化・検出できる。

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

自動化ツール側が使う操作は`servers`、`connect`、`prepare`、`execute`の4段階に固定する。MCP serverごとの機能名や個数は`tools/list`から動的に取得するため、4機能・41機能などの固定実装を持たない。

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

2026-10-04の互換境界: `/mcp`は同梱MRの正確な接続定義（ID、stdio、python3、同梱cwd／script、単一引数、追加環境変数なし）に限る。許可する操作はinitialize、initialized通知、ping、tools/listと、coconala_check／format_citations／make_free_article／verify_deliveryの4機能だけ。定義・操作が異なればtransportへ渡す前に403 `legacy_mcp_not_supported`で拒否し、定数メッセージでserver IDの接続→prepare→本人確認→executeへ案内する。拒否は設定・入力を保存せず、接続定義を戻すか汎用経路を使えば復旧できる。

この4機能の互換経路は一回券を要求しない限定例外であり、全経路で一回承認を強制しているとは扱わない。許可Origin・session認証と送信前データ保護は維持する。同一ID、readOnlyHintやTool名だけで第三者実装へ例外を広げない。信頼済み配布source・PATH・PC所有者の設定が前提で、同一UIDによる改変への隔離や無認証侵入の修復を主張しない。

回帰は何も実行しないtransport stubで定義7形式・操作6形式の拒否と転送0を確認し、同梱MRでは実際のlifecycle・基本4機能を合成入力で通す。汎用経路の一回承認・再利用拒否も維持する。

公式MCP 2025-11-25のlifecycleとstdio / Streamable HTTPを基準にし、2025-06-18、2025-03-26、2024-11-05を接続時に互換確認する。実行送信後のtimeoutは自動再試行せず、結果不明として照合へ回す。


## Web接続clientの共通化（2026-10-02）

`lib/mcp-client.ts`が基本PC接続とFashionのJSON-RPC送信、MCP初期化、protocol照合、初期化通知、Tool一覧取得を共通処理にする。通信先は従来の各loopback URLのままで、redirectを拒否し、Tool呼出しは自動再送しない。sessionの保存と世代確認は各clientに残す。基本PCの4機能必須・追加機能許容と、Fashionのserver名・41機能・202応答必須は別の条件として維持する。接続の成功で本人承認・Provider承認を代替しない。

Skyの接続IDとjob受付IDは`lib/catalog.ts`から導出する。job受付は従来の基本4 Toolとcandidateのローカル下書きに限定し、catalogの`ready`だけでは実行権を増やさない。基本PCのMCP操作名も同じcatalogの明示metadataを使う。公開registryや外部Packageの審査・認可は変更しない。

検証: `tests/mcp-client.test.mjs`、`tests/device-lifecycle.test.mjs`、`tests/fashion-mcp-client.test.mjs`、`tests/operations.test.mjs`。世代の古い401応答や切断応答が再接続後のsessionを消さないこと、protocol/token/初期化通知の拒否、結果不明時の単回送信、登録IDと実行受付の境界を含む。外部Provider・本番配備・実機OSの合格ではない。

## Sky限定試験の権限境界（受入前）

目的は接続コード発行の前に、対象を既存SkyとMac内の基本自動化4機能へ限定できる候補を準備すること。`registry.pilot.json` + `--pilot` のstdio 1件、指定Sky Origin、SDK発見なし、固定4機能のlist/call照合を使用する。汎用MCP経路と互換 `/mcp` の両方で制限し、resource/prompt/custom RPCは拒否する。Skyフロントのinitialize→list→ping→明示Tool実行の契約は維持し、追加serverやremote Providerへ接続しない。

初回キー発行から30分に固定し、refresh/reconnectで延長しない。期限到来でtoken/承認券を消去し、待受とstdioの停止を要求する。既存の通常modeには自動SDK発見を残す。キー・registry本文・入力を運用ログへ追加しない。失敗は403 scope拒否、401未認証/失効、MCP既存失敗コードとして返す。利用者の接続操作と具体的承認が必要で、自動審査の拒否をこのmodeで回避しない。

合格条件は同一候補で4機能だけを発見・実行できること、期限後に旧キーを拒否して再接続で期間が延びないこと、終了時に子プロセス・試験接続を片付けること。pure policyと未認証HTTP拒否に加え、使い捨てprocess内fixtureでgrant再利用・不正Bearer・模擬時計での期限拒否を確認した。実PCでの発行・再接続・Tool実行・実時間停止・本番端末記録の片付けは未受入。

公開画面の既存配布導線を照合し、通常Connectorの許可Originに現行Skyを追加した。health取得200・未認証のservers取得401だけを検証し、キー発行や全Toolの本番受入は行っていない。承認待ちの4機能試験は通常modeを流用せず限定modeを使用する。
