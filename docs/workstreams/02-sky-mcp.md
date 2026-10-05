# Sky / MCP

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
