# Sky Agent Interconnection and MCP接続設計

最終更新: 2026-10-17

## 目的

あらゆる端末・アプリ・サービス・ゲーム・組織が将来agentとして振る舞いうる前提で、RockstarOSはそれらを発見し、利用者のidentity・権限・予算・同意を保ったまま接続する共通面を担う。接続役は単一の万能agentではなく、Skyのregistry／capability router、Zemaのjob・委任管理、Core/Brokerのpolicy enforcement、protocolごとの交換可能なadapterの組合せとする。MCPはTool接続、A2Aは独立agentへの非同期委任に使い分け、providerやprotocolが違っても同じowner・承認・費用・監査境界を維持する。

Skyは、ToBが少ない入力で自動化ツールを掲載し、ToCがタイムラインから「使える状態」と条件を確認して接続する入口である。MCPは接続方式の一つであり、MCPサーバーを無審査で実行する仕組みにはしない。

## 使いたいものを追加するaddプラグイン基盤

2026-10-17の本人指示「skyは全てのaddプラグインになる拡張機能、固定されたものやオフィシャルなものはなく、ただみんなが使いたいものがある」により、Skyを、利用者・作者が必要な能力を持ち寄り、さまざまな対象へ追加・交換して使う拡張の入口として定義する。掲載機能・作者・接続先を固定しない。Sky独自の「公式機能」という専用商品枠を設けず、作者の出自は事実として表示する。「公式」を必須条件や自動選択の優遇理由にせず、Rock製の既存機能も選べる実装例として扱う。RockstarOS・Mini・特定model・特定registryの導入をSky全体の条件にしない。

**体験と対象。** LLM、Agent、Tool、仕事recipe、成果の表示plugin、機器/家具/建築のhost adapterを、それぞれの能力契約を保つaddプラグインとして発見・比較・追加・組合せ・取り外しできることを目標にする。必要なのは利用者が実現したいことと対象hostであり、全pluginへLLMを必須にしない。検索/作者からの直接案内/公開・private registryを入口にでき、作者の名前や人気から実行権を推測しない。自動選択は作業適合、実接続/端末適合、検証実績、データ送信、費用と本人の指定を説明する。

**責任・入出力・保存。** 作者は既存manifest/SDKへplugin ID、作者の同一性、版/digest、提供能力、入出力schema、host/runtime互換、依存関係、license、必要権限、送信先、価格/usage、停止/照会を宣言する。Skyは発見と条件表示・接続、host/Brokerは権限と資源制限、Zemaは仕事・成果・承認・停止を担当する。本人ごとに選んだ版/digest、設定、grant、送信同意、仕事とreceiptへの参照を保持し、作者の署名と配布・OS鍵を分離する。作者の同一性を安全性保証へ昇格しない。schemaの新設や単一の万能実行APIを本決定だけで実装済みにはしない。

**状態・失敗・復旧。** 発見/適合未確認/追加準備/導入済み/接続/実行可能/無効化/失効を分ける。非対応・不明な作者/内容・不足権限・通信失敗はその状態と条件を表示し、利用者が別のpluginを選べるようにする。追加や更新には対象版と権限差分の確認を行う。無効化・取消は新規実行を止め、保存成果と費用照合を保持する。未知結果は照会してから復旧し、更新で進行中の仕事のpinを差し替えない。本人の送信・外部作用・予算承認は作者によらず同じ条件で守る。

**現在地と受入。** PixelのAPK同梱署名catalogは特定runtime/modelの実機検証範囲であり、Sky全体の固定商品一覧・公式限定の方針にはしない。任意作者の動的なnative plugin導入は未実装。この制限を外すには既存のpackage/作者鍵/互換/隔離/更新/失効契約を実装して受け入れる。SKY07/SKY21（ROCK）とOS11/WEB04が、(1)独立した2作者の同種能力を同じ適合条件で比較・追加・交換、(2)別hostでの利用、(3)更新権限差分拒否・失効・取消・旧成果readbackを検証する。これらは未実行。未対応形式や必要な計測hardwareは個別adapter briefで決め、未確定価格・外部契約を既成事実にしない。

Pixelの動的追加実装は[LLM・Agent共通契約](llm-evaluation-architecture.md#pixelでのllmagentの動的追加)。固定作者/モデルIDの追加をAPK更新の条件にせず、owner別のadmissionと失効で扱う。対応形式以外の任意コードの実行受入ではない。

## 家具・建築まで開くSkyの融合

2026-10-15の本人指示で、**SkyはAgent・LLMのマーケットプレイス兼ハブであり、RockstarOSの外のソフト、機器、家具、インテリア、建築とも組み合わせ、暮らしの質を上げる基盤**とする。Pixelは最初の第一者si端末で、Sky全体の利用条件ではない。第三者app/Web/機器は自分の認証・sandbox・権限境界を保って接続する。RockstarOSは第一者runtime、Miniは空間での入力/表示/音声/有限処理を担う一つのhost、Pro/cloudは選べる計算先。全連携にMini/独自OSを購入させる契約にしない。

### 共通の組み合わせ方

Skyはmodel/Agent/Toolとhost adapterの作者・版・能力・license・依存条件・実行先・データ送信先・費用を掲載する。hostは既存融合契約のschema、観測の由来/鮮度/不確かさ、read/propose/act、停止/復旧を宣言する。modelは計画/分析、Agentは有限工程の進行、hostは観測/操作を提供し、modelにないセンサーや物理作用をLLMだけで補完したことにしない。

作者は既存Sky Tool SDK/manifest、MCP/A2A/HTTPS/host adapterの該当境界を使い、対応能力だけを公開する。Zemaは同owner/Job/Artifact/費用を相関し、第三者のhost側強制とserver側のgrant/予算/承認を確認する。RockstarOSのBinder/root権限を外部機器へ配らない。Agent同士の連携も型付き成果と有限委任を使う。model/Agent実行先は[Skyの選択契約](llm-evaluation-architecture.md#skyでmodelとagent実行先を選ぶ)へ従い、local/cloudを自動fallbackしない。

### 具体例：ソファーを体重の記録へつなぐ

構成は `センサーを組み込んだソファー → 荷重の読取adapter → Skyの能力接続 → 有効な観測の検査 → 本人が選んだヘルスケアAgent → 本人用の記録/傾向表示`。Mini/対応appは確認・読み上げ・表示を担う任意の入口。単なるソファーへSkyソフトを登録するだけでは重量情報は生まれず、対応センサーと検証済み計測系が必要である。

1. 家具側で荷重を実際に受ける位置のセンサー、信号変換、給電/接続、無荷重基準と校正を成立させる。TIの[荷重計測reference guide §1.4/§2](https://www.ti.com/lit/pdf/sbau175)はload cell/ADC/校正/風袋引きの技術参考で、特定ソファーの精度・安全・部品採用を証明しない。本例はこの原理からの設計案である。
2. adapterはhost/計測ID、時刻、単位、値、校正版、荷重安定性/有効性/誤差条件、観測の由来を返す。数値変換と妥当性判定は検証可能な有限処理にし、LLMに測定値を創作させない。予定schemaは既存型付き成果へ接続する設計候補で、実capabilityをcatalog登録したことにはしない。
3. 足で床を押す、姿勢/クッション/接地が違う、複数人/ペット/荷物がある場合を試す。荷重だけで本人や正確な体重と断定しない。条件が成立しない値は荷重/無効観測として区別し、本人の体重履歴へ確定保存しない。基準計測との誤差/再現性/有効率を実測し、合格値は試作briefで先に定める。
4. 利用者が自分のprofileと記録範囲・期間・共有先を選ぶ。重量だけを本人認証にせず、guest/家族の記録を混ぜない。校正/基準値等の機器設定と、健康観測/本人履歴の保存・削除を分離し、生の継続sensor streamを無断でcloudへ送らない。外部Agentへ送る場合は必要項目と受取先を本人が確認する。体重の記録/傾向表示を本例の範囲とし、医学的診断/治療能力は別の受入とする。
5. センサー不通/校正期限/古い値/不明な本人は状態を表示して履歴確定を保留する。event IDと時刻を照合し、再接続の重複値を二重記録しない。Mini/cloud停止時もソファーの基本利用を損なわず、選んだ別経路へ切り替える時は本人へ確認する。

### 家具・建築の協業と責任

家具/センサーpartner（EXTERNAL/JOINT）は構造・耐久・計測・校正・設置/交換、建築/設備担当は天井収納等の施工・給電・点検/撤去を担当する。ROCKはSkyのcatalog/adapter契約、仕事/成果/費用/停止/削除を担当し、OWNERは導入と本人の記録/共有範囲を選ぶ。家具の所有/購入、建物管理権、機器保守権を、居住者の健康データ閲覧権へ変換しない。連携先/販売/保守/費用分担は未契約で、既存Sky料金や利用権を無断で変更しない。

Miniの建築一体型profileを使えば部屋での対話や表示へ広げられる。建築への組込みと、ソファーの計測受入、Mini本体の表示/入力受入、健康記録の本人同意は独立して検証する。最初は一つの家具/センサー/対応hostを選んだread-only試作とし、既存の冷蔵庫/家電/店舗の案も同じ契約で保持する。

### 担当と受入

主担当SKY07/SKY21（ROCK）、同期DOC04、Mini/建築MAT15（JOINT）、host体験WEB04、計測hardwareはpartnerと分担する。SF01はRockstarOS/Miniなしの外部host接続、SF02は実荷重/校正/姿勢/床条件と無効値、SF03は複数人/ペット/guestの分離、SF04はlocal/cloudの同意/保存/削除とpartner閲覧拒否、SF05は切断/失効/古い値/重複/復旧。全5件は未実行。ROCKとJOINTが対象家具と計測briefを具体化し、OWNERが記録範囲を選ぶ。現状は設計例で、ソファー計測や建築連携、一般healthcare商品の稼働を宣言しない。

## 異種hostと複数Agentの融合契約

2026-10-14の利用者方針は、Skyが特定アプリやOSだけで完結せず、家電を含む異種hostの能力と多数の専門Agentを組み合わせられることである。host adapterは`hostId`、版、principal、`capabilities[]`、入力/成果schema、観測の由来/鮮度/不確かさ、read/propose/act区分、必要scope、送信先、費用、停止/照会を宣言する。MCP、A2A、HTTPS API、端末内SDKは交換可能なtransportだが、同じ権限だとはみなさない。Sky registryは候補・審査・実接続・本人権限を別状態に保ち、Zemaは複数Agentの親job/委任/成果/費用/停止を相関させる。

Agentが別Agentを必要と判断しても、能力検索の候補しか作れない。Brokerは各委任で本人、対象host/Agent、入力digest、scope、データ送信、期限、予算、side effectを照合する。親の取消、権限失効、費用上限超過は下流の新規実行を止める。読取結果から外部購入や機器動作へ移る際は個別の本人承認が必要で、観測値やLLMの推定を購入許可にしない。型付き成果の出所/版/hash/Receiptを残し、応答がない外部作用を自動再送しない。

冷蔵庫例では、在庫読取adapter、献立Agent、買い物Agent、店舗注文adapterを別capabilityとする。在庫が不確かなら利用者が修正してから買い物案へ渡す。注文はカート案と金額上限を承認し、店舗の確定応答を照合する。一般化に先立ち、読取専用host fixture、型付き二Agent連携、実hostの本人A/B、注文失敗/重複/結果不明のsandboxを別々に受け入れる。現在の公開Skyに対応冷蔵庫や店舗の本番adapterはない。

## MCP料金と直接実行の境界（2026-10-01）

MCP標準の`tools/list`には実行ごとの署名見積もり、予算予約、利用量確定の共通契約がない。このためMCP Toolの`_meta['rockstaros.dev/pricing']`は提供元の料金申告をUIへ渡す情報として扱い、Rockstarが検証した料金表・見積もりとしては表示しない。料金条件が欠落・不正なら`unknown`とし、`prepare`で実行を拒否する。遠隔MCPが`free`と申告した場合も表示には残すが、提供元の自己申告にすぎないため署名見積・予算予約なしでは直接実行を拒否する。Rockstar管理PC上でユーザーが導入したlocal SDK Toolは、ローカル記述の料金申告と一回承認で使う別境界であり、外部サービス利用料がないことを独立証明するものではない。

`subscription`、`usage`、`external_contract`、および価格が未検証の遠隔`free` Toolを直接MCP実行する経路は閉じる。将来開く条件は、本人が確認できる署名価格見積もり、上限つきWallet予約、実行中の利用量・停止、署名済み最終receiptの照合、明細表示が一つの承認digestへ結び付いていること。現状の料金付きagent委任はこの境界を実装しているA2A quote/cap/usage経路へ送る。MCPの提供元申告、ローカルテスト、アプリ内イベントだけを本番課金の証拠にしない。

Sky Tool SDKは全Toolに明示的な料金方式を要求する。Rockstar PC ConnectorはローカルSDK descriptorの料金方式とremote MCPのprovider metadataをConnection Passportへ固定し、価格変更時に承認を無効化する。審査・独立検証がない第三者metadataは未検証として扱う。

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

## IP／生成／ゲーム／配信を交換可能にするCapability Router

Higgsfield、Roblox、YouTube、GTA等の固有名は接続例であり、IP StudioやRockstarOSの業務契約へ直書きしない。Zemaは依頼を閉じたjobへ整理し、IP StudioはIP、素材、権利、版、派生関係の正本を持つ。Skyはjobが要求するcapabilityと本人の条件に合うProvider adapterを選び、Brokerが外部送信、費用、公開、ゲーム提出、報酬付与を強制する。

```text
Zema request
    │
    ▼
IP Studio job + IP / rights / version
    │
    ▼
Sky Capability Router
    ├─ image.generate  ──> Provider A / Provider B / local / manual
    ├─ video.generate  ──> Higgsfield / other generator / local
    ├─ voice.session   ──> LiveKit Agents / accepted voice adapters
    ├─ telephony.*     ──> accepted inbound / outbound phone adapters
    ├─ game.*          ──> Roblox / GTA-FiveM / engine / custom SDK
    ├─ social.publish  ──> YouTube / Instagram / other channel
    └─ analytics.read  ──> accepted platform adapters
    │
    ▼
Asset Registry ──> review / exact approval ──> publish or game delivery
    │
    └────────────────> receipt / result / revenue feedback
```

音声・電話は[IP Studio詳細](sky-tools-complete-design.md#ipキャラクターの音声会話電話連携2026-10-04)の追加契約に従う。LiveKitは設定候補で実接続未受入。音声送信、録音、発信、着信応対の権限を分け、IP／声の権利、費用、停止・結果不明時照会をsessionに結ぶ。

### Provider manifest

各adapterは最低限、Provider IDと版、提供capability、入力／出力schema、認証方式、外部送信先、保存・削除条件、商用利用条件、対象地域、費用の計算方法と上限、timeout、取消、結果不明時の照会、失効方法を宣言する。Provider固有機能はversion付きextensionへ分離し、共通capabilityとして存在しない機能を別操作で模倣しない。

### 共通jobとAsset

jobはProvider名ではなく、目的、capability、入力Asset、出力要件、品質条件、予算上限、privacy、商用権利、期限、許可した送信先を固定する。結果は共通Assetとして、Asset ID、元IP、入力と生成条件のdigest、Provider／model／版、出力hash、provenance、権利、費用、Provider receipt、review状態、公開・ゲーム導入の承認状態を保持する。Provider固有URLだけを長期正本にしない。

### 選択とfallback

- `ask`: 利用者が候補、費用、送信先、権利条件を比較して毎回選ぶ。
- `preferred`: 本人が定めた優先Providerを使い、失敗時は許可済みfallbackだけを試す。
- `policy`: 費用、品質、速度、privacy、権利、地域の本人policy内で自動選択する。

fallbackで送信先、外部費用、権利条件、公開範囲が変わる場合は再承認する。同じidempotency keyを別Providerへそのまま流用せず、親jobに結び付くProvider別attemptを作る。複数Providerの比較結果は一つのasset lineageへ保存する。

### 拡張の完了条件

新しい生成サービス、ゲーム、SNS、Toolは、OS imageやIP Studio本体を再buildせず、審査済みmanifestとadapterで追加できることを目標にする。追加完了は、capability交渉、schema検査、秘密非保存、費用表示、外部作用承認、停止、timeout後照会、receipt、Asset lineage、失効をsandboxで通した時点とする。catalog登録や接続設定画面だけを実Provider成功と表示しない。

## 現在地と未実装の境界

RockstarOSには既存native OS向けの固定fixtureとprivate device APIに加え、Web版Sky向けの汎用`Sky MCP Connector`がある。両者は同じものではなく、native側の購入資格・永続reconcile契約をWeb Connectorが代替したとは扱わない。

今回実装した範囲は次の通り。

- 製品表示名をSkyへ統一し、既存の`hub` API・DB名は移行互換のため保持。
- ToB掲載フォームと`sky_tool_submissions`保存API。
- ToC向けの状態付きSky Timeline。
- 接続先URLから認証情報を排除し、遠隔MCPにnetwork権限を必須化。
- 遠隔MCPの掲載前に`initialize`、セッション、`tools/list`の全ページを読み、ツールを実行せず接続結果を表示。認証必須の接続先はOAuth確認待ちとして審査へ残す。
- 公開HTTPS以外、IP直指定、ローカル・内部ネットワーク名、巨大応答、過剰なツール一覧を掲載診断から拒否。
- PC接続は対応MCP版を交渉して保持し、4件の必須ツールがあれば追加ツールを許容。ツール総数の増加だけでは接続を壊さない。
- 現在の本人限定SiteをPCパックの許可Originへ追加し、公開中のSkyからloopback接続できる配布物へ更新。
- Sky catalogの35件（AMCを含むready 13件、導入候補22件）、native内蔵6種類・9版を実数から検査。AMCは計画・手動記録用であり、MCPやLLMの自動実行を追加しない。
- 審査済みregistryからstdio / Streamable HTTPを扱うPC内Connector。
- MCP 2025-11-25から2024-11-05までのversion確認、initialize、initialized通知、pagination付きtools/list。
- server identity、capabilities、tool schema digest、接続時刻を持つConnection Passport。
- 基本4機能とブランド運営38機能の同一Connector実接続。
- server・tool・引数・tool digestへ結び付く5分有効の一回承認と、直接`tools/call`迂回の拒否。
- Sky内の動的server一覧とワンタップ接続、macOS向け配布ZIP。

次に必要な実装は、公式/private registryの署名・更新adapter、OAuth 2.1 browser flow、審査者画面、公開revision、失効配信、Tasks adapter、公開remote MCP相互運用試験、Sky Cloud常駐である。現在のStreamable HTTP adapterはHTTPS、redirect拒否、private network拒否、環境変数認証までを実装したが、公開remote serverとの受入は未実施である。

会話型の役割振り分けと、アプリを毎回入れずに利用者情報を必要な役だけへ渡す方針は[Sky Assistant / Sky Memory設計](sky-assistant-and-memory.md)に分離する。

## 受入条件

1. ToBは秘密情報を入力せず、3区分のフォームで申請を保存できる。
2. 未審査申請はToCの「使う」導線へ出ない。
3. 表示された権限・料金・送信先と実行時条件が異なる場合は送信しない。
4. stdio serverは専用UID、資源上限、読取専用package、限定filesystem/networkで起動する。
5. HTTP serverはTLS、Origin、OAuth resource binding、scope縮小、token passthrough禁止を検査する。
6. timeout、切断、再試行で同じ仕事を重複送信せず、結果不明を成功にしない。
7. 作者停止・版失効がTimeline、端末、PCへ反映され、過去の実行記録は改変されない。

## 2026-09-30 人・端末・サービスへの適合とGTA

利用者は「みんなに適合できるシステムを作る、もちろんgtaにも」と指定した。既存Sky Package／Capability Routerを共通契約とし、相手ごとのadapterを交換する。本人の目的・言語・入力・表示・予算・保存・許可をprofileで扱い、eSIM種別だけで機能を固定しない。端末能力と接続先が変われば、ローカル／cloud／利用不可を再判定する。新しい接続先をLLMが推測して登録・認可しない。

自律動作は観測→計画→認可→実行→結果確認→記憶・復旧の共通契約へ接続する。ゲーム世界と現実の操作は別のcapabilityとして扱い、権限・owner・データを混同しない。既存Core、Zema、Package、作者SDK、IP Studio、Asset Registryを作り直さない。

GTAは明示的な対象。既存の協議・合意に関する利用者説明を引き継ぎ、対象機能と技術interfaceは資料で具体化する。タイトル／版／プラットフォーム／実行先／接続口を固定し、GTA V、GTA Online、GTA VI、FiveM等を一括の対応済みにしない。起動・入力、ゲーム外si支援、Asset制作・導入、ゲーム内agent／NPC、経済連携は別capabilityとし、最初の一件を実際に利用可能な接続口と本人の目的から選ぶ。現在は要件追記で、これらのadapter実装・GTA実動作を完了していない。

LLMの動作とゲーム本体の動作、本体実行と外部ホスト実行を分ける。取得できないゲーム内部状態は不明と表示し、切断時に入力を解除する。復帰時に古い移動・射撃等を自動再送しない。assetや会話の共通管理を、ゲーム進行・通貨の任意移植と同一視しない。

受入条件は、本人交代・端末能力変更・接続先の版変更・権限不足・追加承認・結果不明・切断復帰。共通fixtureと実ゲーム環境を別に検証する。関連：[既存ゲーム接続仕様](avocado-mini-conversation-2026-09-27/avocadoMini_game_platform_integration_2026-09-27.md)、[Sky全Tool設計](sky-tools-complete-design.md)、[cloud継続実行](sky-cloud-continuity.md)。

## 2026-09-30 エージェント間の発見・接続・委任

利用者は、あらゆる対象がsiエージェントを持つ将来に、エージェント同士をつなぐ役割が必要と示した。Skyは提供者・能力・条件の掲載、発見、比較、接続を担う。Zemaは親子の仕事、委任、進捗、承認、停止、成果を管理し、Core/Brokerがowner・権限・予算・保存を強制する。marketplaceはこの共通基盤への入口である。

既存MCPのTool・データ接続を維持し、独立agentとの委任には[A2A](https://a2a-protocol.org/)等の公開仕様をadapterとして評価する（2026-09-30公式入口確認）。対応版と認証、status、取消、成果の意味を実装時に固定する。Agent Card等の自己申告は、本人認証、審査、能力試験、実行許可を代替しない。

委任時にはowner、親job、子task、入力hash、納品条件、許可データ・操作、期限、費用上限、再委任範囲を固定する。子agentの権限・予算を親より広げず、深さ・回数・同時数を制限して循環と無限増殖を防ぐ。親子共通の予約台帳を用い、親集計と子の実費を二重計上しない。秘密は接続先別の認可で扱い、他agentへ包括的な認証情報を渡さない。

発見、購入、受付、実行成功、成果検証、本人の完了確認、利用量確定、請求・払出しを分ける。結果不明の委任は照合し、別agentへの切替で同じ外部処理を二重実行しない。取消応答と実停止・費用確定を分ける。

異なる二つのagent実装で発見から成果・記録まで通すことを受入条件とし、別owner、版変更、能力不一致、上限超過、循環、切断・復旧、停止と完了の競合を検証する。GTA、個人端末、業務agentは共通契約へ載せる対象だが、各接続口と許可を実証する。

2026-09-30にA2A 1.0 JSON-RPC client、owner-scoped child task store／状態event log、Cloudflare Worker reconciliationと暗号化text artifact経路を追加した。さらに本人が指定した公開HTTPS originからAgent Cardを取得し、originとJSON-RPC版を検査、card digest・版・時刻をD1へowner別に保存するSky個人接続帳とZema候補選択UIを追加した。候補は自己申告・未審査として明示し、登録だけでは委任しない。native Brokerからの短命Ed25519 proof発行methodとWeb検証器を実装し、Broker 45 tests、proof verifier/trust 3 testsのcross-language固定vector、API/Worker/D1 251 assertionsが成功。Web承認前にowner-scoped Broker proofを登録し、Runtime WorkerはAgent Card取得前・send marker前・message/send直前に検証するfixture経路を追加した。実機signer、Wallet/WebAuthn、trusted device key lifecycle、device gateway、production key listとWorkflow実行受入は未完了。詳細と限定範囲は[Sky A2A Bridge](sky-a2a-bridge.md)と[native Broker](../systems/rock-star-os/docs/MCP-BROKER.md)。Sky全体の検索・提供者審査、本番egress経路の受入、Wallet連携・予約、異なる実装間の相互接続、実Provider／cloud継続／請求は未実装・未受入。fixtureや既存MCP試験を外部相互運用の合格へ転用しない。
