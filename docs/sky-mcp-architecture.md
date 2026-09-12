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

必須情報は、ツール名、一言説明、提供者、semantic version、接続方式、実行場所、必要権限、料金、データ利用、利用規約、サポート先、掲載権限の確認である。Streamable HTTPまたはHTTPS APIは認証情報を含まないHTTPS接続先を、stdio packageまたはRock recipeは公開可能な配布元を求める。

秘密鍵、API key、password、access tokenは掲載フォームへ入力させない。申請は`submitted`として保存し、即時公開しない。`under_review`、`published`、`rejected`の審査状態を分ける。

## ToCのSky Timeline

各項目は少なくとも次の状態を表示する。

- `今すぐ使える`: 審査済みで、この画面または端末内で実行できる。
- `接続後に使える`: PC、外部アカウント、OAuthなど本人の接続が必要。
- `確認が必要`: 権限、料金、データ送信先、版に差分がある。
- `導入候補`: 候補情報だけで、Skyから取得・実行できない。
- `停止`: 作者停止、失効、安全上の停止、接続障害を理由付きで表示する。

「タイムラインにある」ことと「実行可能」を同一視しない。ボタンは現在の状態に応じて、使う、接続、条件確認、詳細のいずれかにする。

## MCP標準との対応

基準はMCP 2025-11-25とし、既存の2025-06-18／2025-03-26／2024-11-05接続は能力交渉の結果として扱う。版番号の完全一致やツール総数の固定ではなく、使う能力と必要なツール名を確認する。

| 領域           | Skyでの扱い                                                                                                                                                                 |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Registry       | 公開MCPは公式Registryの`server.json`を候補情報として取り込める。非公開MCPは組織のprivate registryまたは直接接続として分ける。Registry掲載だけを安全審査済みとはみなさない。 |
| Transport      | 遠隔はStreamable HTTP、端末・PC内packageはstdioを基本とする。HTTPはOrigin検証、認証、localhost bind要件を満たす。                                                           |
| Initialization | protocol versionとcapability negotiationを記録し、未対応capabilityをUIに出さない。                                                                                          |
| Tool discovery | `tools/list`のname、description、inputSchema、annotationsを取得し、掲載申告との差分を審査する。                                                                             |
| Authorization  | OAuth 2.1のprotected resource metadataとresource indicatorを使う。token passthroughは禁止する。                                                                             |
| Elicitation    | 一般入力はform mode、秘密情報や決済はURL modeへ分離する。                                                                                                                   |
| Long-running   | Tasksはexperimentalとしてcapability negotiation後だけ使う。非対応先はRockの既存job状態へ変換し、同じ意味だと偽らない。                                                      |

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
- 遠隔MCPの掲載前に`initialize`、セッション、`tools/list`の全ページを読み、ツールを実行せず接続結果を表示。認証必須の接続先はOAuth確認待ちとして審査へ残す。
- 公開HTTPS以外、IP直指定、ローカル・内部ネットワーク名、巨大応答、過剰なツール一覧を掲載診断から拒否。
- PC接続は対応MCP版を交渉して保持し、4件の必須ツールがあれば追加ツールを許容。ツール総数の増加だけでは接続を壊さない。
- 現在の本人限定SiteをPCパックの許可Originへ追加し、公開中のSkyからloopback接続できる配布物へ更新。
- Web/PCで使用可能4件、OSS候補3件、native内蔵6種類・9版を実数から検査。

次に必要な実装は、公式/private registry adapter、OAuthの実ログイン、審査者画面、公開revision、失効配信、実行前の条件再確認、Tasks adapter、第三者の実サーバー相互運用試験である。掲載前診断は到達性と公開能力を確認するもので、安全審査や実行許可の代替ではない。

会話型の役割振り分けと、アプリを毎回入れずに利用者情報を必要な役だけへ渡す方針は[Sky Assistant / Sky Memory設計](sky-assistant-and-memory.md)に分離する。

## 受入条件

1. ToBは秘密情報を入力せず、3区分のフォームで申請を保存できる。
2. 未審査申請はToCの「使う」導線へ出ない。
3. 表示された権限・料金・送信先と実行時条件が異なる場合は送信しない。
4. stdio serverは専用UID、資源上限、読取専用package、限定filesystem/networkで起動する。
5. HTTP serverはTLS、Origin、OAuth resource binding、scope縮小、token passthrough禁止を検査する。
6. timeout、切断、再試行で同じ仕事を重複送信せず、結果不明を成功にしない。
7. 作者停止・版失効がTimeline、端末、PCへ反映され、過去の実行記録は改変されない。
