# Rock starファンドとワンボタン実行

本書は旧Web試算/MCPの記録。現行の中心は [製品ベース](product-baseline.md)のHub＋Wallet。nativeのWallet/月888 centsと以下の未接続記述を混同せず [差分監査](progress-audit-20260909.md)を参照する。ホスティング制限の出典は当時の判断で、現在の提供可否は採用時に再確認する。

## 今回の提供範囲

ホームをRock starファンドに変更。参加状態、4ツールへの予算配分計画、実行履歴、費用控除と分配、ブーストの試算を同じ画面に配置した。参加・配分・試算条件とサイトから報告された実行メタデータはSitesのD1に、ログインした利用者ごとに保存する。未保存の試算はタブ移動でも保持する。

入金・売上・送金は未連携。「残高0円」「分配実績」など実績と誤解する表示をせず、未接続と表示する。支援予定額は購入済み口数でも投資受付でもない。Sitesの公式利用制限ではfinancial transactionsは非対応のため、このホスト上で金銭の受付・自動徴収・払出を有効化しない。

出典: https://learn.chatgpt.com/docs/sites#understand-limits-and-unsupported-uses

## ファンドの試算

Rは販売先の手数料を引いた月間共通収益、Cはファンド自身が負担する共通運用費。利用料は実行回数やツール数にかかわらず、このファンドの月合計に最大8.88 USD相当を1回だけ適用する提案。

- 回収運用費 = min(R, C)
- Rock star利用料 = min(R − 回収運用費, round(8.88 × 入力為替))
- 分配原資D = R − 回収運用費 − 利用料
- 基本分配枠 = floor(D × 入力した基本分配率)
- ブースト枠 = floor(D × 入力したブースト分配率)
- 基本分配は仮定した人数で均等。本人のブーストは全支援予定額に対する本人支援額の比率。
- 分配されないブースト枠と円未満端数は共同留保。全分配合計＋留保は常にDと一致。
- 支援金そのものはRにもDにも足さない。収益が0なら支援額にかかわらず分配0。
- 未回収費用は別表示。端末の電気代・通信費・税金は個人の外部負担。

旧個人用計算機はそのまま折りたたみ内に残す。こちらは個人収入から利用料を控除して端末費用を引く別の試算であり、ファンド台帳には足さない。

## MCPと実行経路

`toolkits/mr/mcp_server.py` は、固定4ツールをMCPで提供する標準ライブラリのみのPythonサーバー。Codexのstdio接続時はCodexが必要に応じて自動起動する。

| MCP名 | 機能 |
|---|---|
| coconala_check | 案件と提案の条件照合 |
| format_citations | 出典リンク整理 |
| make_free_article | 入力されたまとめを使った記事の無料版作成 |
| verify_delivery | 受け取ったファイルと独立レビューの記録照合 |

Web向けには同じサーバーを `--http` で起動し、127.0.0.1:38479のStreamable HTTPで提供。公開Siteそのものにremote MCP/OAuthを実装したとは表示しない。ブラウザから任意ターミナルを開くのではなく、最初にユーザーが起動したPC接続アプリに処理を渡す。サイトの「このPCを接続」はinitialize → initialized通知 → tools/listの実通信を確認する。接続後のツール実行は同じMCP tools/call経由。

未接続時は既存の3つのテキスト処理をブラウザ内で利用できる。画面に実行経路を表示し、PC接続に失敗しても黙って別経路へ切り替えない。納品照合にはPC接続が必要。Codex設定とブラウザのPC接続状態は別で、サイトからCodex登録状態を推測しない。

HTTPは固定Origin・Host制限、初回接続で取得するOriginごとのメモリ上のBearer、リクエストサイズ制限、接続読込期限を持つ。トークンはブラウザタブのsessionStorageに保持。任意コマンド・任意ホストパス・ネットワーク取得・自動投稿・金銭操作の機能はない。納品照合の入力は一時ディレクトリ内に復元し、POSIX/Windowsのパス逸脱を拒否し、終了時に削除する。原稿やファイル本文をサイトのサーバーやログへ送信しない。ファンドの実行履歴には本文を含めない。

本番サイトからループバックへの通信は、ブラウザによって初回のローカルネットワーク許可が必要。HTTPプロトコルの疎通と実行は検証するが、ブラウザ画面での許可操作は自動完了したとは主張しない。

MCP仕様: https://modelcontextprotocol.io/specification/2025-11-25/basic/transports
Codex設定: https://learn.chatgpt.com/docs/extend/mcp?surface=cli


## Hub / retained plans and operations

The standard homepage is the automation Hub. The existing four Mr. tools open directly, with prerequisites, processing location, output review and file export. `/fund` retains saved strategy presets, allocation and cost assumptions without changing their storage contract. It never purchases an investment.

The preserved Sites execution lifecycle at `/api/jobs` authorizes every tool before actual execution. The workflow at `/work` uses `/api/work-jobs` and its existing revision/idempotent event contract. The same tool execution enters tool_runs once; the workflow event is separate progress, not another execution.

`/activity` shows execution history. `/wallet` keeps manual JPY bookkeeping marked unverified, with append-only reversals. `/settings` exposes tool admission controls and verified PC connection records. These are not native Wallet balances or financial provider connections.

PWA metadata and service-worker upgrading are retained. Cache v3 excludes all APIs, sign-in/out paths, RSC requests, private/no-store responses; cacheable static assets and successful public Hub shell only. Published user identity is still enforced by the Sites gateway. Local validation does not establish live Sites access or migration acceptance.
