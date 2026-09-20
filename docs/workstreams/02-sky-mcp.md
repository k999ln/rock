# Sky / MCP

## 目的

自動化Toolを安全に発見、登録、接続、権限確認、実行、停止、結果確認できる共通面を提供する。MCPごとの個別例外ではなく、Connection Passportと一回承認を共通契約にする。

## 現在地

- 2026-09-20の再受入: 起動済みPC ConnectorをSky画面から接続し、MCP 45機能（基本4、Fashion 41）を認識。基本MCP4機能を合成入力で実呼び出しし、全4件で非エラーの成果本文を確認。Sky→Zema→PC納品照合→`PASS`本文も完走し、サブスク顧問はPC台帳への接続と質問回答を確認。Marketはサインイン済み画面でPAPER提案・承認・実行・レシート保存まで完走。ready 12件中、ローカル/合成データで成果を確認できたのは10件。メルカリは実在庫確認を要するため実画面の作成を保留、Jevは外部AI設定と本人同意が未充足。候補22件には本体実行器がなく、下書きのみ。Sky/Zemaで候補を「接続済み」「完了」と誤読しない表示に修正し、PC接続後の納品照合カードからZemaへ直接進めるようにした。
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

主なtask: `SKY02`〜`SKY09`, `SKY11`, `SKY14`, `SKY15`, `N05`。

## 次に進める順番

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
