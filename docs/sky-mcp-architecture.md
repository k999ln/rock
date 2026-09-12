# Sky MCP接続設計

最終更新: 2026-09-12

## 目的

Skyは、ToBが少ない入力で自動化ツールを掲載し、ToCがタイムラインから「使える状態」と条件を確認して接続する入口である。MCPは接続方式の一つであり、MCPサーバーを無審査で実行する仕組みにはしない。

```text
ToB
  │ 名前・用途・版・接続先・料金・データ利用・権利
  ▼
掲載申請 ──> 技術確認 ──> 審査版を固定 ──> Sky Timeline
                 │                                │
                 ├─ MCP initialize / capabilities │ 条件を見る
                 ├─ tools/list とschema            │ 接続・同意
                 ├─ transport / auth metadata      ▼
                 └─ 停止・失敗時の挙動          ToC
                                                   │
                           端末 / PC / Cloud <─────┘
                                  │
                                  ▼
                             結果・実行記録
```

## ToBの掲載入力

必須情報は、ツール名、一言説明、提供者、semantic version、接続方式、実行場所、必要権限、料金、データ利用、利用規約、サポート先、掲載権限の確認である。さらに実行パスポートとして、主な実行場所、実行先の管理者、Cloud依存、Codexの役割、データ保存先、オフライン可否、無人継続、必要処理能力を必須にする。Streamable HTTPまたはHTTPS APIは認証情報を含まないHTTPS接続先を、stdio packageまたはRock recipeは公開可能な配布元を求める。

秘密鍵、API key、password、access tokenは掲載フォームへ入力させない。申請は`submitted`として保存し、即時公開しない。`under_review`、`published`、`rejected`の審査状態を分ける。

## ToCのSky Timeline

各項目は少なくとも次の状態を表示する。

- `今すぐ使える`: 審査済みで、この画面または端末内で実行できる。
- `接続後に使える`: PC、外部アカウント、OAuthなど本人の接続が必要。
- `確認が必要`: 権限、料金、データ送信先、版に差分がある。
- `導入候補`: 候補情報だけで、Skyから取得・実行できない。
- `停止`: 作者停止、失効、安全上の停止、接続障害を理由付きで表示する。

「タイムラインにある」ことと「実行可能」を同一視しない。ボタンは現在の状態に応じて、使う、接続、条件確認、詳細のいずれかにする。

商品詳細は宣言された経路と現在観測した経路を分ける。例としてサブスク顧問は、宣言上はRockstarOS端末を主実行先、PCをフォールバック、Cloud不要、Codexは任意のMCPクライアントとする。Web SkyがPC接続MCPだけを確認できた場合は「このPCの経路を利用可能」と表示し、RockstarOS実機接続済みとは表示しない。

## MCP標準との対応

基準はMCP 2025-11-25とする。

| 領域 | Skyでの扱い |
|---|---|
| Registry | 公開MCPは公式Registryの`server.json`を候補情報として取り込める。非公開MCPは組織のprivate registryまたは直接接続として分ける。Registry掲載だけを安全審査済みとはみなさない。 |
| Transport | 遠隔はStreamable HTTP、端末・PC内packageはstdioを基本とする。HTTPはOrigin検証、認証、localhost bind要件を満たす。 |
| Initialization | protocol versionとcapability negotiationを記録し、未対応capabilityをUIに出さない。 |
| Tool discovery | `tools/list`のname、description、inputSchema、annotationsを取得し、掲載申告との差分を審査する。 |
| Authorization | OAuth 2.1のprotected resource metadataとresource indicatorを使う。token passthroughは禁止する。 |
| Elicitation | 一般入力はform mode、秘密情報や決済はURL modeへ分離する。 |
| Long-running | Tasksはexperimentalとしてcapability negotiation後だけ使う。非対応先はRockの既存job状態へ変換し、同じ意味だと偽らない。 |

参照:

- [MCP Authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)
- [MCP Transports](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)
- [MCP Elicitation](https://modelcontextprotocol.io/specification/2025-11-25/client/elicitation)
- [MCP Tasks](https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/tasks)
- [Official MCP Registry](https://modelcontextprotocol.io/registry/about)
- [Registry publish quickstart](https://modelcontextprotocol.io/registry/quickstart)

## 現在地と未実装の境界

現状のRockstarOSには、固定fixtureに対するloopback接続と、`snapshot / connect / disconnect / prepare / submit / status / reconcile`を持つprivate device APIがある。これは一般のMCP 2025-11-25 clientでも、任意MCPサーバーへつなぐ公開SDKでもない。

今回実装した範囲は次の通り。

- 製品表示名をSkyへ統一し、既存の`hub` API・DB名は移行互換のため保持。
- ToB掲載フォームと`sky_tool_submissions`保存API。
- ToC向けの状態付きSky Timeline。
- 接続先URLから認証情報を排除し、遠隔MCPにnetwork権限を必須化。
- Web/PCで使用可能4件、OSS候補3件、native内蔵6種類・9版を実数から検査。
- OS審査済みサービスの固定カタログ、SHA-256照合、安全なZIP展開、MCP preflight、個人データ分離、起動・停止・削除を行う`SkyServiceManager`。
- Native Platform IPCの`sky.service.status / activate / lifecycle`と、認証済みPC接続MCPの`sky_service_status / activate / lifecycle`。
- サブスク顧問の商品画面から、表示済み固定ハッシュを渡して「OSに導入して起動」するワンタップ導線。

サブスク顧問ではMCP preflightまで実装した。次に必要な実装は、専用UID・namespace/seccompを適用したサービス実行、公式/private registry adapter、OAuth接続、審査者画面、公開revision、失効配信、実行前の条件再確認、Tasks adapter、実サーバー相互運用試験である。Native rootfs組込みはソースとホストテストまでで、QEMU/実機ブートは未確認である。

## 受入条件

1. ToBは秘密情報を入力せず、3区分のフォームで申請を保存できる。
2. 未審査申請はToCの「使う」導線へ出ない。
3. 表示された権限・料金・送信先と実行時条件が異なる場合は送信しない。
4. stdio serverは専用UID、資源上限、読取専用package、限定filesystem/networkで起動する。
5. HTTP serverはTLS、Origin、OAuth resource binding、scope縮小、token passthrough禁止を検査する。
6. timeout、切断、再試行で同じ仕事を重複送信せず、結果不明を成功にしない。
7. 作者停止・版失効がTimeline、端末、PCへ反映され、過去の実行記録は改変されない。
