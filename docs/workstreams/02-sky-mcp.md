# Sky / MCP

## 目的

自動化Toolを安全に発見、登録、接続、権限確認、実行、停止、結果確認できる共通面を提供する。MCPごとの個別例外ではなく、Connection Passportと一回承認を共通契約にする。

## 現在地

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
