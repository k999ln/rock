## 2026-10-09 SKY20／ROCK — コードのタイムライン公開

明示指示に基づきコード本文・commit・履歴・差分・複製・非公開／再公開を実装。SYS15のSPIDERを既定のserver検査へ接続し、交換・取り外しを版ごとに記録する。主担当ROCK、外部検査器は未接続、OWNERは公開権限／licenseと保護変更の確認を担当する。Package審査／実行／料金とは独立。合格条件は本人別保存・CAS競合・再送・検査迂回拒否・実画面。検証入口: `node --experimental-strip-types --test tests/sky-code-timeline.test.mjs`、`npm run verify`。[詳細](../sky-tools-complete-design.md#skyタイムラインのエージェントコードと交換可能な保護)。本番配備は未実施。

## 2026-10-01 SKY21 / JOINT — Pixelのサービス受入

[実機受入記録](../evidence/sky-pixel-service-acceptance.json): USB承認済みPixel 10／GL066／frankel、Android17を限定propertyで確認。Rock3アプリは0.1.0。Web27・CSV8・端末reader3試験合格、全体verifyはNode550・Fashion19・合成API376合格。PixelのSky画面操作は本人から明示許可済み。Vanadiumで公開Marketの表示、Android向け絞り込み、CSV検索1件、詳細からCSV専用画面への移動と未ログイン時のサインイン案内を実機確認した。本人ログイン、受付・処理・保存・再表示・ダウンロード、本番利用者の分離は未受入。スクリーンショットと結果を受入JSONへ記録した。本人の実機・本番サインインと、fixtureの成功を分離する。

## 2026-10-01 SKY21 / ROCK — 独立Skyのサービスローンチ

[ローンチ設計](../sky-launch-design.md)と`data/sky-service-launch.json`を追加。基本利用、外部作者市場、有料販売、別client/実機対応を別々に受け入れる。service-status APIと同じ利用条件をSky home/market/detailへ反映し、標準ガイドと外部AIを分離。`/sky/help`で現在の保存場所と制限を案内し、公開readback済み。作者申請は入力前に本人条件を確認し、401はサインインへ案内、接続失敗は再確認可能。運用・受入手順を `docs/sky-launch-operations.md` に追加。source/fixture/publication/authenticated productionの証拠を分け、未設定の決済や未受入のMCP公開を完成扱いにしない。

# Sky / MCP

## 2026-10-10 GRID01／ROCK — Sky Compute Grid host fixture

未使用Androidの余剰計算を固定・中断可能なlotへmatchingするplatform serviceをSkyへ追加した。MCPの第三者任意Tool実行とは分け、初期SKUは固定runtime/model/tokenizerによるpublic/synthetic text embeddingだけとする。`CapacityOffer`、`ComputeOrder`、`ComputeLease`、`ComputeReceipt`のclosed contract、hard filter、score、有限lease、独立参照／duplicate検証、service-credit hold preview、合成demo UI/APIをhostで実装した。実端末worker、remote dispatch、本番storage、実需要、実料金・払出しは未接続。詳細は[Sky Compute Grid](../sky-compute-grid.md)。

## 2026-10-01 MCP直接実行の料金gate

全MCPのTool一覧に料金方式を持たせ、価格申告をPassport digestへ含めた。Sky Tool SDKは料金未定義・未知方式のTool登録を拒否する。PC ConnectorはローカルSDK descriptorまたはremote MCPの`_meta['rockstaros.dev/pricing']`から料金方式を読み、欠落は`unknown`として実行を停止する。`free`であってもUIは提供元申告と表示し、Rockstar独立検証済みとは主張しない。さらに遠隔MCPの`free`自己申告は、署名見積・予算予約の共通経路がないため直接実行不可とする。local SDK descriptorは別境界であり、表示上の`free`は外部料金がない証明ではない。subscription/usage/external contractも直接実行不可。料金条件の変更はPassport digestを変え、承認を更新させる。

この変更は、MCP tool callを直接呼び出すとProvider料金が発生しうる一方、MCP標準自体には価格見積とusage finalityの共通契約がないという既存設計上の穴を閉じる。料金付きcloud agentはA2Aのquote/cap/live usage/receipt経路へ接続する。確認対象はSDK登録、provider metadataの表示・欠落時拒否、遠隔free自己申告も含むapproval前の実行拒否である。Node connector/SDK tests、typecheck、product lint、buildでローカル検証する。これはprovider metadataの真実性、production billing、第三者MCPの契約受入を証明しない。

2026-10-01の追加回帰試験では、remote MCP fixtureが`free`と自己申告してもPassport表示だけに留まり、`prepare`が自己申告理由付きで拒否することを確認する。Cloud LLM/legal/patent/Jevの直接remote routesは、価格・予算・settlementが未接続の間はfail-closed。これは列挙した経路とローカルfixtureの再確認で、全repoの任意background egressが不存在であることの証明ではない。

## 目的

自動化Toolを安全に発見、登録、接続、権限確認、実行、停止、結果確認できる共通面を提供する。MCPごとの個別例外ではなく、Connection Passportと一回承認を共通契約にする。

## 現在地

- 2026-10-04 SKY07／SKY14（ROCK）: IP StudioへLiveKit音声・電話の接続設定・Zema候補選択・依頼振分けを追加。設定保存は実接続ではなく、別アプリ本体と音声・電話runtimeの受入は未完了。[契約と残る作業](../sky-tools-complete-design.md#ipキャラクターの音声会話電話連携2026-10-04)。

- 2026-09-27 SKY14 / ROCK（SKY15連携、全体進行中）: 全Sky／Zema／OS Tool実用化・サーバー管理不要・ローカルLLM優先の最初の実用milestoneを確認。ローカルViteの共通管理runtimeから同梱Connector／Fashionを自動起動・健康確認し、実ブラウザのFashion保存操作→ProducerのDB書込→`instagram.calendar.list`再読込一致を確認した。Sky接続操作から基本4機能の検出、Zema納品サンプルから自動接続→`verify_delivery`の実照合`PASS`も確認。`components/delivery-runner.tsx`の非実在接続導線と未接続時disabledを修正した。合成入力のみで外部納品なし。関連35試験（isolated Vite終了後の両port停止を含む）、API回帰172項目、最終build・型・対象lint・package一致・差分検査は合格。全体testは389件中378合格・11失敗（既存visual baseline、README文言、migration-union件数差）、全体verifyも既存baseline停止で未合格。34件の最小経路棚卸しはブラウザ6、Web API／DB3、PC2、外部AI1、候補22で、LLM起動だけで候補adapterは実装されない。FashionのProvider4件はmock、ページ再読込後の結果復元UIは未実装。推論runtime／モデル導入は本人回答待ちで未導入。Ledger、IP Studio、候補22件、native常駐・公開Web→本人PC relay・外部Providerの受入は残る。既存SKY14／SKY15の状態は過去の範囲のまま保持し、全34 Tool完成へ読み替えない。[実装根拠・実行分類・受入範囲](../sky-tools-complete-design.md#13-全toolの実行器棚卸しと管理runtime進行中)。

- 2026-09-27: Sky Marketの各catalogカードと個別詳細に「アイコンを押して機能を見る」導線を追加。機能説明・現在の状態・利用環境・費用をダイアログで確認できる。カードの他の場所は詳細へ進むまま維持。Jev Routerの詳細は重複した情報欄を閉じた表示にしても、未接続・PC CLI条件と公式導入先を本文に残す。アイコン操作は接続・実行・認証を開始しない。対象9試験、typecheck、lint、Sky/設計チェック、buildに合格。Chromeのローカル画面で開閉・詳細遷移・Enter/Escape・console errorなしを確認。全体verifyは既存visual systemとavokado配色の不一致で`baseline:check`停止。
- 2026-09-27: マーケットの端末適合表示を追加。ブラウザのOSから明確に不適合なPC専用・macOS専用Toolだけを初期非表示にし、対象外も理由付きで再表示できる。判定不能な端末や未検証のソフト・アカウント・実接続を「対応済み」と扱わない。Jev Router詳細は接続に見える汎用の下書き欄を外し、本人PCのCLI・Node・TypeSafe認証が必要な未接続候補と明記。PC Connector/CLI adapter・秘密管理・外部送信同意・routing receipt・失敗時fallback・E2E受入が揃うまでSkyワンクリック接続は未提供。対象7試験、型、lint、Sky/設計チェック、build合格。Browser Useからlocalhostへ到達できず目視未確認。全体verifyは既存visual systemと現行avokado配色の不一致で`baseline:check`停止。
- 登録入口の区別: Sky Marketの「開発したツールを登録」はWebの`/sky/register`掲載申請。`/sky/publish`は既存のStudio/SDK設定であり、掲載フォームではない。Sky本体の「掲載」ボタンからも同じ掲載フォームを開ける。
- 2026-09-27: Sky Marketの登録CTAを実際の掲載申請へ直結。申請者本人の前回提出から提供者名・サポートURLのみ明示操作で再利用し、遠隔MCPが応答した場合だけサーバー名をツール名の下書きに入れる。権利・ライセンス・料金・データ利用は自動推定しない。料金の「無料」初期値を撤去して選択を必須化し、審査済み外部Packageの料金方式を一覧に表示。購入者決済・開発者払出しは有効化せず、商流とProvider条件の決定後に別受入とする。対象のマーケット試験4件、typecheck、lint、build、Sky/設計チェック合格。全体verifyは既存visual system期待値と現行avokado配色の不一致で`baseline:check`にて停止。
- 2026-09-27: Sky内に`/sky/marketplace`を追加。ROCK担当で、34件の既存catalogと有効な`verified`公開Registryを検索・カテゴリ・状態別に分け、各Sky Tool詳細とStudioの入口をつなぐ。Tool詳細も提供元・license・料金・実行先・手順を確認できる画面へ更新。22件の導入候補は本体未接続と表示し、公開Packageの購入や自動インストールは有効化しない。対象18試験、typecheck、lint、build、PC/390pxブラウザで検索と候補絞り込みを確認。全体verifyは既存visual system期待値と現行avokado配色の不一致で`baseline:check`にて停止。外部Providerの本番接続と一般公開は別受入。
- 2026-09-25: Sky/Zemaの34 catalog Toolに固有アイコンを割り当て、Zemaから候補22件を個別に選べるようにした。Zemaの依頼文は候補のローカル確認画面へ引き継ぐ。旧Mr.11件は下書き、外部研究Tool10件はTool別の接続計画、IP Studioは専用アプリ入口として表示し、いずれも本体未接続・外部実行未確認の境界を保持。ローカルD1初期化後、YouTube台本の下書き表示とfaster-whisperの接続条件表示を実画面で確認。固有アイコン試験・対象6試験・buildは合格。全体verifyはREADME日本語文言を期待する既存の文書試験2件で停止。残りの外部本体接続と22件個別受入は未完了。
- Sky公開RegistryとTelegram配布を、有効期限内の証拠付き`verified` Packageだけへ限定した。開発者の`published_declared`は審査待ちとして非公開にし、固定source revision／SHA-256、権利、license、権限、privacy、料金、Sandbox、出力品質、証拠URL、reviewerを追記専用台帳へ保存する。失効時は既存grantも即時に一覧・再取得から除外する。利用イベントはEvent IDで冪等化し、一時失敗を最大3回再送する。sourceの型・schema・lint・対象15試験は合格。Web D1 migration `0016`、server-side審査credential、本番readbackは未実施のため`SKY20`は進行中。
- Product Hunt候補から公開URLをSky掲載申請へ引き継ぐ導線を追加。URLのホスト・経路・認証情報を検証し、提供者・接続先・ライセンス・権限を本人が確認する審査キューで止める。Product Hunt APIの無断収集・自動公開は行わない。
- 候補収集は`npm run discover`でGitHubとHugging Faceの公開メタデータを取得し、`npm run discover:watch`またはGitHub Actionsの6時間間隔で再実行できる。`data/discovered.json`は同一候補を更新して最大500件まで保持し、すべて`reviewStatus: pending`・`executionEnabled: false`のままSkyの審査前データとして保存する。Product Huntは`PRODUCT_HUNT_ACCESS_TOKEN`と事業利用承認フラグの両方がある場合だけ収集し、トークンはWebアプリへ渡さない。
- 2026-09-20の再受入: 起動済みPC ConnectorをSky画面から接続し、MCP 45機能（基本4、Fashion 41）を認識。基本MCP4機能を合成入力で実呼び出しし、全4件で非エラーの成果本文を確認。Sky→Zema→PC納品照合→`PASS`本文も完走し、サブスク顧問はPC台帳への接続と質問回答を確認。Marketはサインイン済み画面でPAPER提案・承認・実行・レシート保存まで完走。ready 12件中、ローカル/合成データで成果を確認できたのは10件。メルカリは実在庫確認を要するため実画面の作成を保留、Jevは外部AI設定と本人同意が未充足。候補22件には本体実行器がなく、下書きのみ。Sky/Zemaで候補を「接続済み」「完了」と誤読しない表示に修正し、PC接続後の納品照合カードからZemaへ直接進めるようにした。
- 同修正後の`npm run verify`はローカル接続を許可した環境で完走。型、lint、ビルド、仕事API149項目を含む全gateが合格。外部Providerの本番成功はこの合格へ算入しない。
- 2026-09-20の34件実行監査: ready 12件中、Sky/Zemaの実画面でサンプル成果本文またはCSV成果物を確認できたのは7件（CSV、Fashion簡易プラン、ココナラ案件チェック、記事無料版、出典整理、法務受付、特許アシスタント）。Marketとメルカリは個別自動試験合格だが実画面で完走していない。納品照合・顧問はPC未接続、JevはProvider接続と利用同意が必要。candidate 22件は共通ローカル下書き経路で本体実行の成功なし。候補画面の操作文言を「接続確認の下書き」に修正し、実画面で再確認した。対象試験32件、SDK/市場14件、メルカリ等13件、CSVチェック・型・lint・buildは合格。通常の制限環境では全体verify中のローカルサーバー試験が進まなかったため、ローカル接続を許可して再実行し、全体verify合格（自動試験346件、Fashion別枠19件、仕事API149項目）を確認した。この合格を外部Provider/候補本体の実成功へ換算しない。
- Catalogの34件それぞれについて`/sky/tools/<id>`をローカルサーバーから取得し、34/34件がHTTP 200。これは個別画面の到達確認であり、候補や未接続Toolの本体実行合格ではない。
- 2026-09-20のlocalhost:3001実画面監査: PC未接続、MCP 0機能、Telegram公開Tool 0件。catalogの`ready` 12件は本番成功件数ではなく、`candidate` 22件は外部サービスの実行成功に数えない。ココナラ案件チェック、記事の無料版メーカー、出典整理ツールはサンプルでローカル成果本文を確認。IP Studioは起動したがHiggsfieldとMake未設定、登録IP 0件。
- Zemaへ個別runnerの結果通知を接続し、MCP空応答を失敗、候補の成果を「下書き」と表示する変更を実施。型、lint、production build、MCP結果4件、PC Connector 6件は合格。全体`verify`は`remote_ai_rate_limits`分類欠落で中断。個別`sky:check`は旧製品名Hub、`design:check`はcatalogと設計台帳の不一致で失敗。PC／Provider／外部投稿の実成功は未受入。
- Sky内のPC Connector、MCP initialize、tools/list、必須4機能、heartbeat、実行履歴を実装済み。
- stdioとStreamable HTTPのregistry、掲載前inspect、Tool Package、Studioからの登録・公開を実装済み。
- PC内Sky Tool SDK 0.1.2のAppをConnectorが自動検出し、Sky一覧のカードからPassport確認後に接続できる。旧Mr. Hubの11件は候補表示のみで、実行器は未接続。
- Chatは接続済みToolをbotとして扱い、方向修正、承認、停止、receipt表示を行う。
- ZemaでMCPの`isError: true`を失敗として表示し、成功時は成果本文を表示する。Skyからの依頼とZemaで直接始めるbot依頼は仕事ごとのチャットを作り、同じタブのsessionStorageで最大10分だけ会話と結果を復元する。本人別の長期履歴は未実装。
- Zemaの会話画面は履歴を開閉でき、自由文は文章モデルのAPIへ渡す。ローカルBinder未接続時は利用不可を明示し、外部文章モデルへの送信は依頼ごとの許可とserver側の有効化を必須にする。Tool実行の確認・承認は従来どおり維持する。
- 現在実接続可能と扱える標準経路は「このPC」。Sky Cloudとprovider MCPは未受入。

主なtask: `SKY02`〜`SKY09`, `SKY11`, `SKY14`, `SKY15`, `SKY20`, `N05`。

## 次に進める順番

0. 検証済みのローカル管理runtimeを起点に、Fashionの再読込後の結果復元、Ledger／IP Studio、候補22件の本体adapter、外部Provider、native常駐／公開Web relayを個別に受け入れる。本人回答前に推論runtime／モデルを新規導入しない。全体test／verifyの既存不整合は、基準を無断で緩めず別途整合する。
1. 現在のmergeを解消し、PC Connectorの既存試験を同一sourceで再実行する。
2. Sky Cloudとprovider MCPのOAuth 2.1、audience、権限差分、失効、再同意を設計・実装する。
3. 本人別の長期履歴、結果不明時の再送禁止と照合、connection replacement、lease失効を外部MCPで受け入れる。
4. 任意shellや秘密値貼付を許さず、審査済みregistryからのみ起動する。
5. Android/nativeへの搭載は端末ストリームの受入と分ける。

## 完了条件

- initialize、capability、schema、OAuth、実行先、費用、作者、版がPassportに固定される。
- 引数に結び付いた本人承認後だけ変更系Toolを実行する。
- disconnect、失効、schema変更、timeout、結果不明を安全に処理する。
- 「接続候補」と「接続済み」をUIと証拠で区別する。

## 関連資料

- [Sky設計](../sky.md)
- [MCP Connector](../sky-mcp-connector.md)
- [MCP architecture](../sky-mcp-architecture.md)
- [MCP usability](../sky-mcp-usability-20260912.md)
- [Sky Tool SDK](../sky-tool-sdk.md)
- [MCP inspection](../../lib/mcp-inspection.ts)

## 検証

- `npm run sky:check`
- `npm run mcp:package:check`
- `node --experimental-strip-types --test tests/mcp-connector.test.mjs tests/mcp-inspection.test.mjs tests/sky-mcp-onboarding.test.mjs`

## 端末圏外中のクラウド継続実行

2026-09-30の明示指示を[継続実行契約・受入計画](../sky-cloud-continuity.md)へ固定。既存SKY07、primaryOwner ROCK。rockDeliverableは受付receipt、永続controller、予算・期限、承認待ち、停止確認、再接続照合。externalDependencyはcloud/model/MCP provider、ownerActionは契約・費用確定後の実接続判断。承認本文の暗号保存とlocal Cloudflare Workflow dispatch controllerまで実装・fixture確認済みだが、本番runtimeは未接続で12受入シナリオは未実行。ROCK_READYにはしない。

2026-10-01 provider候補再調査: Cloudflare Workers/Workflows/D1は既存controller継続候補。Cloudflare Containers/SandboxesはGA済みの隔離Linux候補（公開上限4 vCPU/12 GiB、GPUなし）、Google Cloud RunはGPU推論候補として比較表へ追加。Cloudflare料金はWorkflows step/storage課金開始を含め公式単価へ更新。実際のdata region・account terms・負荷試験・契約見積は未取得。[Provider readiness](../provider-contract-readiness-20260930.md)。

2026-09-30追加：人・端末・サービスとGTAへの適合は[Sky MCP設計](../sky-mcp-architecture.md)へ記録。既存SKY07／SKY15とGame側DX01に関連する要件準備。GTAとの実接続・動作試験は未実施。

2026-09-30 A2A agent接続基盤のROCK進捗：端末・アプリ・サービス・ゲームがagentとして参加しうる前提で、Skyを発見／接続、Zemaを委任job管理、Core/Brokerをidentity・権限・予算の強制、MCP/A2Aを交換可能なprotocolとして整理。`lib/a2a-client.ts`のA2A 1.0 JSON-RPC discovery／send／get／cancel、本人指定originからのAgent Card取得・owner-scoped snapshot/digest保存と`services/sky-agent-runtime`のscheduled Cloudflare Workflow dispatch／status reconciliation／one-shot cancelを実装。D1 migrations `0019`〜`0023`はowner-scoped委任、承認digest、期限・予算、idempotency、one-shot marker、append-only event、暗号化入力と成果を保存する。remote text artifactは32 KB以内に正規化・暗号化し、owner-only `GET /api/sky/a2a-delegations/{id}/artifacts`で取得可能。Zema Workbenchに委任draft・条件digest表示・状態確認・停止要求・成果レビューを接続したが、Wallet／Provider acceptanceまでは実行承認UIを無効にし、APIとWorkerのdispatch双方も明示enable flagがなければ停止する。`rock-a2a-broker-authorization/1`のEd25519 proofについて、Web検証器に加え`Broker.authorize_a2a_delegation()`の発行methodを実装。本文をBroker receiptへ保存せず、exact consent・owner/device・target・input hash・budget・deadlineを短命proofへ束ね、同じkeyの再要求には同一receiptを返す。Ed25519鍵は外部signer adapterからのみ利用する。Python Broker 45件、Web proof verifier/trust fixture 3件はcross-language固定signing bytes vectorを含め成功。実機signer／Wallet-WebAuthn、owner/device key登録・失効、native OS UIとHub wire公開、owner-scoped proof API、operator-managed trust resolver、Runtime Worker認可hookはfixture接続済み。実鍵管理とWallet連携は未実装。A2A関連テスト35件、API統合251 assertionsも成功。旧Worker local smoke（origin allowlist追加前）はAgent Card到達失敗→`remote_failed/PREFLIGHT_FAILED_BEFORE_SEND`を確認した。現在の空listはauth fixture、Worker dry-run、サイトAPIの認証済みdiscovery 403で検証し、実Providerへは未送信。Sky全体の検索・Agent Card審査・提供者認証、本番egress経路の受入、Wallet予約、同一production D1・secret、異社SDK interoperability、Provider sandbox受入、remote file artifact取得、鍵rotation／KMSは未完了。production readback 0/6、remote migration未適用。SKY07はin_progressを保持する。詳細は[Sky A2A Bridge](../sky-a2a-bridge.md)、[native Broker](../../systems/rock-star-os/docs/MCP-BROKER.md)、[継続実行契約](../sky-cloud-continuity.md)。
# 2026-09-30 Broker proofをA2A承認・送信境界へ接続

`POST /api/sky/a2a-delegations/{id}/broker-authorization`は本人・署名鍵・owner/device・現在の依頼本文と委任条件を検証し、承認待ち中にproofを一度保存する。通常のWeb承認は、現在の信頼鍵でproofが再検証できる場合だけ`prepared`へ進む。Runtime WorkerもAgent Card取得前、one-shot外部送信marker前、A2A `message/send`直前に同じproofを照合する。不在・期限切れ・失効鍵・intent差替え時は外部HTTP要求前に停止する。`A2A_TRUSTED_BROKER_KEYS`はoperator-managed JSON allowlistで、現在のhost fixture以外の鍵は設定されていない。検証器は既存Ed25519 raw鍵に加え、Android Key Attestationと適合するuncompressed P-256 SEC1点を受け付ける。Android公式attestation schemaではattested asymmetric algorithmにRSA/EC/ML-DSAが列挙されるため、Android Broker実装はP-256 hardware keyへ移行し、Java DER ECDSA署名をCloud WebCrypto用P1363へ変換する。これはattestation・trust registrationの完了を意味しない。HubGateway/device wire、実device鍵登録・失効authority、Wallet原子的予算予約、本番D1/secret、Provider sandbox実接続は未完了。

2026-10-01 Cloud usage receiptのWorkflow縦断fixture：`services/sky-agent-runtime/vitest.config.ts`は専用Ed25519 fixture provider keyで、A2A completed task metadataへRockstar usage receiptを署名して返す。Runtime Workerは`A2A_TRUSTED_USAGE_KEYS`で署名とtask/owner/agent/通貨/capを検証し、D1 receiptと子予約settlementを一括反映する。`npm run sky:a2a:workflow:positive` 3/3、`npm run typecheck`成功。USD 100 centsの内部予約から37 centsだけをsettleし、親pool `reserved=0 / settled=37`、同じprovider receipt reference、再起動後のone-shot dispatchを確認。これはlocal fixture／D1内部poolだけで、実provider請求やnative Wallet残高の予約・settlement handoffではない。

2026-10-01 cancellation Workflow縦断fixture：`CancelTask`の署名済み最終利用量11から内部50単位予約を精算し、`cancel_requested`と`remote_cancelled`を分けて確認。再起動で終端状態を読んだcontrollerがProviderへ再照会しないよう修正し、取消claimが一度だけであることを確認。さらに取消要求と完了が競合し、Providerが`TASK_STATE_COMPLETED`・成果物・署名済み利用量を返すケースで、completed状態と暗号化成果を維持し、一度だけ精算することを追加確認。`npm run sky:a2a:workflow:positive` 6/6。証拠は[local cancellation fixture](../evidence/a2a-cancel-workflow-local-20261001.json)と[cancel/completion race fixture](../evidence/a2a-cancel-completion-race-local-20261001.json)。これはcontrolled local A2A agentであり、契約Providerの取消意味・実停止・請求仕様や本番クラウドの合格ではない。

再現検査: `npm run typecheck`、`npm run schema:check`、A2A fixture suite（35件）、`npm run build`、`npm run test:api`（Miniflare Worker/D1 251 assertions）、`npm run sky:agent-runtime:check`。Miniflare APIは所有loopbackで実行する。runtime dry-runはbundle構成の確認でありWorkflow dispatchの実行試験ではない。Workflow付きMiniflareはbinding RPC取得時に停止したためno-proof dispatchのend-to-endは未検証。

# 2026-09-30 親job共通予算予約とWorkflow preflightの更新

D1 migration `0025_a2a_shared_budget_reservations.sql`を追加。parent job単位のcurrency／budget capと子delegationごとの予約を保持し、承認条件digestへ親capも含める。承認時はD1 batch内で子上限を予約し、triggerが同時予約による上限超過を拒否する。承認前cancel、期限切れ、`PREFLIGHT_FAILED_BEFORE_SEND`は予約を解放し、remote send marker後のindeterminate／remote taskは利用量receiptが照合されるまで予約を保持する。これは内部A2A上限の排他で、Wallet残高の実予約、Provider utilization receipt、settlementとは区別する。

`tests/a2a-delegation-store.test.mjs`へ同時承認・親cap超過・owner分離・pre-send解放・indeterminate保持の5 assertion群を追加。D1 triggerのmetadataが複数rowを数える場合に正常状態遷移を失敗扱いしたため、guarded update／reservation insertの成功条件を「少なくとも1行が変化」に修正し、event row自体は厳密に検査する。Workflow local E2Eを新schemaに追随させ、proofなし・期限切れ・失効鍵の全3ケースで予約を保持したままpreflight拒否、`remote_send_claimed=0`、Agent Card discovery未到達、予約解放を検証した。

今回の検査: A2A関連Node tests 38/38、native Broker loopback tests 30/30、Cloudflare Wrangler local Workflow/D1 3/3、`npm run typecheck`成功、`npm run schema:check` 45 tables/25 migrations。`npm run database:status`は93 tables・production readback 0/6を記録した。migrationはsourceにありremote D1未適用。Wallet台帳との実予約・receipt settlement、production secrets/D1、端末signer/key lifecycle、Provider sandbox dispatch・利用量確認・cancel acceptance、A2A異社実装interoperabilityは未完了。旧上のWorkflow試験未検証メモはこのlocal fixture範囲では置き換える。SKY07は`in_progress`のまま。

# 2026-10-01 圏外継続の本人同意をZemaからWorkerまで固定

ZemaのA2A draftで「受付・承認後に端末が圏外／アプリ終了中もクラウドで続ける」本人選択を既定offで追加。falseのままではUIがdraft作成を止め、APIとstoreも拒否する。同意値をD1 `agent_delegations.continue_while_device_offline`へ保存し、idempotency比較とapproval digestへ含める。既存recordのmigration defaultはfalse。

`rock-a2a-broker-authorization/2`へschema/domainを上げ、Web・Pythonの署名fieldに同意値を加えた。RockstarOS Brokerとnative Wallet reservation checkはtrue以外を拒否する。Runtime Workerも署名検証の前に同意を確認し、古い／false rowはAgent Card取得やremote send claim前に`PREFLIGHT_FAILED_BEFORE_SEND`で停止する。

確認: A2A fixture 46/46、Cloudflare Wrangler/Workerd Workflow 3/3、Python Broker 33/33、Wallet/Spend 17/17、API Worker/D1 301 assertions、typecheck、schema check、design check、product lint、Runtime Worker dry-run、web buildを通過。Worker local testは有効な署名を持つoffline consent=false draftをAgent discovery／send claim前に`PREFLIGHT_FAILED_BEFORE_SEND`として拒否し、予約を解放する。Python/TypeScript固定proof vectorも一致。Provider sandbox、production D1/Secrets、実機Broker signer/owner presence、端末圏外継続の12受入シナリオは未実施。SKY07は`in_progress`を保持する。

2026-10-01 lost-response recovery: draft POST応答が失われた場合、Zemaは保持している同じparent job・idempotency keyと本文SHA-256でowner-scoped status lookupを行う。戻ったdelegationのID、message、target、budget、deadline、同意、input digestを元の依頼と一致照合し、`awaiting_approval`なら既存のauthorization digestを再表示する。結果が見つからない／一致しない時は新しいキーで再送しない。store/API・UIの実装を追加し、A2A fixture 45/45、API Worker/D1 301 assertions、typecheck、product lint、buildを確認。Providerが受付後に応答を落としたremote `messageId`照合とは別であり、契約sandboxが必要。

## 2026-10-02 SIM-led product correction and Package dispatch acceptance

The SIM/eSIM is the distribution and service-entitlement offer; RockstarOS binaries are delivered through supported device routes, not stored on the SIM. The app/Home provides direct Sky, Zema and Agent entry points, while shared identity, durable cloud jobs, offline continuation consent, recovery and itemized usage remain the implementation base. `npm run sky:a2a:workflow:positive` now passes 12/12 Worker/D1/Workflow tests. The new positive case carries a reviewed Package binding through quote/delegation/Broker authorization/dispatch, preserves required extension declarations across Workflow serialization, and validates a completed result plus a synthetic signed usage receipt and local logical settlement. A controlled service binding stands in for the Provider; external execution, paid production billing, physical SIM/eSIM activation and exact-device RockstarOS installation remain unaccepted. Earlier entries describing the positive Package executor as absent or all positive Worker dispatch as unverified are superseded by this checkpoint only for the local fixture scope. See [SIM-led architecture](../sim-led-product-architecture.md), [A2A bridge](../sky-a2a-bridge.md), and [evidence](../evidence/sim-led-product-correction-20261002.json).

# 2026-10-01 A2A非同期task進捗・最終成果・利用量の縦断fixture

Cloudflare Workers Vitest／local D1上で、制御されたservice-binding上のA2A 1.0 test agent fixtureが`SendMessage`へ`TASK_STATE_SUBMITTED`を返し、別Workflow reconciliationで`TASK_STATE_WORKING`、次回に`TASK_STATE_COMPLETED`・成果artifact・Provider署名usage receiptを返す非同期fixtureを追加。Zema側では受付時点でremote task IDを保存し、作業中は子予算reservationを保持、terminal完了時にowner/task/agent/budgetへ束縛したusage receipt 42 centsだけを一度settle。最終成果物はowner-scoped encryptionでD1へ保管し、remote send claimは全過程で一回。Workers Vitest 4/4、A2A clientの独立Node/Python HTTP agent相互運用7/7、typecheck、Worker dry-runが成功。これはCloudflare/fixture構成上の縦断契約検証であり、実Provider sandbox、Provider task IDの実仕様、production D1/secrets、異なる実企業agent二者の契約接続ではない。Providerの結果不明後のGetTask/CancelTask・usage invoice意味論と秘密鍵運用は契約後に受入する。

2026-10-01 post-change verification: `npm run verify` passed after the asynchronous workflow fixture was added: repository-wide Node tests 530/530, release-signing checks 64/64, type/lint/build, Worker/D1 API 301 assertions, bundle/assets checks; targeted Workers Vitest 4/4 and independent Node/Python A2A interop 7/7 also pass. Product gates are still declared honestly: public targets ready 0/6, production D1 readback 0/6 and Pixel first-flash 0/4. This does not constitute a contracted provider, live cloud, funded Wallet or physical-device acceptance.


2026-10-01追加受入: 公開Sky v8（632ac3eb…）でPixel本人ログイン、サンプルCSV処理、検査合格・納品可能の表示、サーバー再読込後の同受付復元を確認。result.csv 0.09KBの既存ダウンロード確認がブラウザに出た。CSVバイト/hash、別本人隔離、削除は未受入。50円試験の入口は公開済みだが、本番キー・CSV署名secretが未登録で無効。Stripe本番有効化は本人情報確認の途中で本人作業待ち。


Stripe最新readback: 本番ダッシュボードへ到達したが支払いが一時停止。追加情報タスクはセキュリティ対策措置状況申告書で、担当者の本人確認書類タスクも残る。申告の実施者・実施済み対策は本人が確認し提出する。フォームを本人操作用に残し、未確認の対策や本人情報は代理入力していない。Sky非公開設定には本番API keyとCSV専用署名secretが未登録。実課金は未実施。


## 2026-10-02 Zema-supervised follow-up Agent draft

Added `lib/a2a-result-handoff.ts` and a Workbench action on an owner-scoped completed delegation with captured text results. Zema serializes the prior Agent identity and complete text artifacts as JSON marked untrusted; the prompt explicitly says prior output is not instruction, authorization or proof and cannot transfer permissions. Truncated artifacts or omitted non-text parts are refused. The action only prefills a new sibling-task draft, clears the prior target and quote consent, retains the same parent job's shared budget cap, and requires selecting another Agent plus a fresh Provider quote, cap and approval. It does not dispatch or re-delegate from inside the Agent; depth remains one and child count/concurrency remain bounded. Focused tests cover the composition limits and UI source contract; typecheck/lint and full `npm run verify` pass locally. The local two-Agent Worker/D1 composition is now covered in the following section; it does not turn this user-mediated draft into an autonomous parent controller or prove external Provider interoperability.

## 2026-10-02 Two-Agent Cloudflare Worker/D1 handoff fixture

Extended the controlled Agent endpoint fixture with a second origin and separately versioned Agent Card. The positive Workflow test runs two separately approved sibling delegations under the same owner/parent/currency cap. It captures the first signed completion artifact encrypted in D1, reads it through the test, builds the same untrusted-result prompt used by Zema, and sends that as the second delegation to the other origin. The first child settles 31 cents and the second 29 cents; while the second is held the parent has 60 reserved + 31 settled against a 100-cent cap, and after completion it has 0 reserved + 60 settled. Restarting each completed durable Workflow returns `not_dispatchable`, with exactly one remote send claim per child.

Verification: `npm run sky:a2a:workflow:positive` 13/13, `npm run typecheck`, `npm run lint:product`, and `node --test tests/a2a-result-handoff.test.mjs` 3/3. This establishes the local Cloudflare Worker/D1 composition across two separately addressed fixture Agents; the endpoints and receipts are synthetic. The second task remains separately approved, so this is not an autonomous parent controller. Commercial Provider interoperability, production D1/secrets/invoices, funded Wallet settlement, and device acceptance remain open. Evidence: [two-Agent Cloudflare workflow fixture](../evidence/a2a-two-agent-cloud-workflow-local-20261002.json).

## 2026-10-02 Zema parent progress and budget controller snapshot

Added `lib/a2a-parent-controller.ts` and extended the existing owner/job-scoped delegation list API to return a derived controller snapshot. Zema Home now shows parent-state, per-child approval/dispatch/run/reconciliation/result counts, remaining parent budget, and the next safe user action; it refreshes through the existing progress poll. The snapshot is read-only and derived from current delegation, budget, and reservation records. It does not persist a separate parent state machine, automatically submit or sequence children, grant approvals, or treat local usage records as invoices. Every paid child still needs an explicit fresh approval.

Local checks: `node --test tests/a2a-parent-controller.test.mjs` 9/9; `npm run typecheck`; `npm run lint:product`; rebuilt app plus `npm run test:api` 1021 assertions and CSV 113 assertions. Evidence: [parent controller local fixture](../evidence/a2a-parent-controller-local-20261002.json). Production Provider execution/receipts/invoices, durable autonomous parent orchestration, production data deployment, and device acceptance remain open.

## 2026-10-02 Scheduled A2A deadline enforcement

Closed a deadline gap in the one-minute scheduled Worker sweep. `expireOverdueBeforeDispatch` now transitions overdue approval, prepared, and pre-send dispatch records to `expired`; the existing D1 trigger releases a held child reservation exactly once. Overdue remote tasks, including an in-flight `dispatch_submitting` with an uncertain task receipt, move to `cancel_requested` and enter the existing reconciliation/cancel path. The UI and parent snapshot distinguish expired work. A cancellation request remains unconfirmed until the remote Agent reports a terminal result; a possibly accepted task never releases its budget hold just because its deadline passed.

Local store tests verify expiry/idempotency, budget release, overdue task selection, and reservation retention for remote cancellation. This proves local store logic and Worker schedule wiring only. Actual Provider clock/deadline guarantees, cancellation semantics, incurred usage after cancellation, production scheduler operation, and contract sandbox acceptance remain open.

2026-10-02 A2A runtime recheck: the Worker/D1 positive suite passes 13/13; Node/Python A2A client interoperability tests pass 10/10; canonical authorization, reservation, and quote vectors pass 12/12. Wrangler process-restart test now claims only that prepared D1 rows survive two local process boots and that remote-send claims remain zero. It does not verify scheduled dispatch/recovery; a previous progress entry overstated that harness. See [runtime recheck evidence](../evidence/a2a-runtime-recheck-20261002.json). Production scheduler, external Provider, invoice/funded settlement, carrier activation, and exact-device acceptance remain unverified.

## 2026-10-02 Persisted reviewed-result successor link

Added `predecessor_delegation_id` to A2A child rows and a D1 uniqueness/consistency guard. When Zema prepares a follow-up from a complete, captured result, it carries the source delegation ID into the successor draft. API and database both require the predecessor to belong to the same owner and parent job, be `remote_completed`, and have captured artifacts. A reviewed result can have only one direct successor, and the stored link is returned in the parent child list after reload. Lost-response recovery also binds the predecessor ID, so it cannot accept an otherwise matching child with different provenance.

This persists a user-mediated linear chain while retaining a fresh quote, child cap, explicit approval, and normal independent dispatch for every successor. It does not make an Agent invoke another Agent or autonomously execute a plan. Local checks: A2A store/result-handoff/recovery tests 28/28; typecheck and product lint; schema and database checks; rebuilt Worker API 1024 assertions and CSV 113 assertions. Evidence: [persisted handoff edge fixture](../evidence/a2a-persisted-handoff-link-local-20261002.json). Migration `0057` has no production D1 readback; commercial Provider handoff, billing, and device acceptance remain open.

### 2026-10-02 Enforce the redelegation depth limit

`A2A_MAX_REDELEGATION_DEPTH` was declared as one but was not enforced. Successor creation now computes lineage depth in the owner-scoped store, the API rejects a second follow-up, and migration `0057`'s D1 insert trigger refuses a predecessor that already has a predecessor. One user-approved follow-up remains allowed; another agent in that follow-up chain must start a new independent parent job. The per-parent fan-out limit and four-active-task limit still apply independently.

For an uncertain cloud task, query the same owner/parent, idempotency key, and exact input hash. Do not submit a replacement while acceptance is unknown. If a remote task ID exists, reconcile that task; treat a cancellation request as pending until the provider reports a terminal cancellation. Keep its shared-budget reservation held while execution or cancellation is uncertain. Require a terminal state and encrypted artifact capture before showing a result as ready or allowing the one follow-up. Further work after that follow-up starts in a separate independent job. These are local source-backed controls; production Provider deadline, cancel, usage receipt, and invoice matching still need contract acceptance.

### Persisted Zema plan steps bind to A2A evidence

The existing `cloud-agent` WorkJob template persists an ordered brief/approval step and result-review step. A step event now stores the A2A delegation ID it refers to. The authenticated `/api/work-jobs` PATCH checks that the row belongs to the same owner and parent before accepting progress: the first step needs the persisted signed quote; the result step and final review need remote terminal completion, captured artifact rows, and a stored usage receipt. A client cannot mark a Cloud Agent plan complete with a generic success event or a random delegation ID. The receipt is a provider-usage record, not an invoice or paid-settlement proof. The independent parent controller remains read-only and continues to derive active/reconciliation state from durable D1 children/reservations.

Local verification includes a forged-progress API regression (valid-shaped but nonexistent delegation ID rejected), serialized WorkJob event coverage, and the existing successful local parent/child workflow fixtures. This still is not an autonomous LLM-authored plan: the two-step cloud-agent template is fixed and user-directed. Multi-step authoring beyond the version-1 objective editor, production Provider acceptance, and actual customer/device acceptance remain open.

### 2026-10-02 Versioned editable Zema plan v1

`WorkJob` now stores `plan.schemaVersion`, the owner-editable objective, and a fixed `approvalGates` list in its existing persisted JSON payload. The objective can be revised while the job is active and before its first step is recorded; each edit is an owner-authenticated, revision-checked event. Gate requirements are generated from the server template and are not accepted from client input: Cloud Agent work requires a signed quote, native Wallet reservation and explicit Cloud approval before paid execution, then terminal Cloud status, captured result and a stored usage receipt before result review. Editing the objective never reuses an execution approval or changes the separate Agent request text.

Legacy WorkJob payloads without a plan are read with a version-1 default, and altered/mismatched gate definitions are repaired to the server-derived requirements. Local Node/SQLite tests cover edit-before-start, edit rejection after work begins, unsupported version and client-supplied gate rejection, migration of legacy payloads, and persistence. Focused suite: `tests/workflow.test.mjs` and `tests/sim-service-entry.test.mjs`; TypeScript and product lint pass. This version only allows editing the goal; arbitrary step authoring, runtime A2A dispatch, Android acceptance and production Provider billing remain separate work.
