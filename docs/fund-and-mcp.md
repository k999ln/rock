# LOOPファンドとワンボタン実行

## 今回の提供範囲

ホームをLOOPファンドに変更。参加状態、4ツールへの予算配分計画、実行履歴、費用控除と分配、ブーストの試算を同じ画面に配置した。参加・配分・試算条件とサイトから報告された実行メタデータはSitesのD1に、ログインした利用者ごとに保存する。未保存の試算はタブ移動でも保持する。

入金・売上・送金は未連携。「残高0円」「分配実績」など実績と誤解する表示をせず、未接続と表示する。支援予定額は購入済み口数でも投資受付でもない。Sitesの公式利用制限ではfinancial transactionsは非対応のため、このホスト上で金銭の受付・自動徴収・払出を有効化しない。

出典: https://learn.chatgpt.com/docs/sites#understand-limits-and-unsupported-uses

## ファンドの試算

Rは販売先の手数料を引いた月間共通収益、Cはファンド自身が負担する共通運用費。利用料は実行回数やツール数にかかわらず、このファンドの月合計に最大8.88 USD相当を1回だけ適用する提案。

- 回収運用費 = min(R, C)
- LOOP利用料 = min(R − 回収運用費, round(8.88 × 入力為替))
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

| MCP名             | 機能                                       |
| ----------------- | ------------------------------------------ |
| coconala_check    | 案件と提案の条件照合                       |
| format_citations  | 出典リンク整理                             |
| make_free_article | 入力されたまとめを使った記事の無料版作成   |
| verify_delivery   | 受け取ったファイルと独立レビューの記録照合 |

Web向けには同じサーバーを `--http` で起動し、127.0.0.1:38479のStreamable HTTPで提供。公開Siteそのものにremote MCP/OAuthを実装したとは表示しない。ブラウザから任意ターミナルを開くのではなく、最初にユーザーが起動したPC接続アプリに処理を渡す。サイトの「このPCを接続」はinitialize → initialized通知 → tools/listの実通信を確認する。接続後のツール実行は同じMCP tools/call経由。

未接続時は既存の3つのテキスト処理をブラウザ内で利用できる。画面に実行経路を表示し、PC接続に失敗しても黙って別経路へ切り替えない。納品照合にはPC接続が必要。Codex設定とブラウザのPC接続状態は別で、サイトからCodex登録状態を推測しない。

HTTPは固定Origin・Host制限、初回接続で取得するOriginごとのメモリ上のBearer、リクエストサイズ制限、接続読込期限を持つ。トークンはブラウザタブのsessionStorageに保持。任意コマンド・任意ホストパス・ネットワーク取得・自動投稿・金銭操作の機能はない。納品照合の入力は一時ディレクトリ内に復元し、POSIX/Windowsのパス逸脱を拒否し、終了時に削除する。原稿やファイル本文をサイトのサーバーやログへ送信しない。ファンドの実行履歴には本文を含めない。

本番サイトからループバックへの通信は、ブラウザによって初回のローカルネットワーク許可が必要。HTTPプロトコルの疎通と実行は検証するが、ブラウザ画面での許可操作は自動完了したとは主張しない。

MCP仕様: https://modelcontextprotocol.io/specification/2025-11-25/basic/transports
Codex設定: https://learn.chatgpt.com/docs/extend/mcp?surface=cli

## インストール可能なアプリ画面

The final front is a mobile-first installable PWA. Home puts the active fund, four direct tool actions, run state, and PC/MCP connection status in the first flow. Fund, activity, and settings each have one dedicated app view. Mobile uses a bottom navigation; desktop uses a fixed sidebar.

Four choices are strategy presets over the same four Mr. utilities (Coconala Works, Creators, All-in LOOP, Editor Lab); Voice is clearly preparation-only. Selecting a fund shows its included tools, and switching saves that preset's allocation as the user's active LOOP plan. This does not buy an investment. All execution totals belong to the user across LOOP. Detailed allocation/boost assumptions, wallet, app installation, and PC setup are available from settings.

The service worker caches only the app shell and same-origin static assets after a successful network response. It excludes `/api/`, so account data and tool execution input are not placed in the app cache.
