# task101 — 相談・運営AgentをNoahへ載せる

本人指示: レントラックスの案件を利用した相談・運営の両AgentをNoahへ載せられる形にする。参照チャット「gitのrockを確認」01a1f8f6-e45c-7260-bc55-53b2712253bb。

正本: docs/structure/04-eve-noa-amc-sky.md、docs/services/noah-affiliate-agents.md。

範囲: toolkits/noah-affiliate-agents/、tests/noah-affiliate-agents.test.mjs、記録文書。進行中の登録Agent/Noahフロントは変更しない。

合格条件: 相談/運営の分離、紹介許可の検査、非公開情報の投影除外、台帳点検・原稿下書き・実績集計、Noah source ZIP互換、NoahのMCP clientとの接続/呼出試験。未承認リンク・認証なし運営応答0件。

検証: `node --experimental-strip-types --test tests/noah-affiliate-agents.test.mjs`、`npm run verify`。

残件: 配備URLと運営用認証の設定、Noahへの本人用登録、ASPの新媒体掲載許可・正式リンク、スマホ実機の通し受入。レントラックス実績の自動取得・外部送信は今回の実装に含めない。

## 2026-11-22 実装と検証（PR #374）

- 相談・本人用運営のZIP生成、Noah source/terminal契約、MCP相談口と鍵付き運営口を実装。専用11試験、型付きlint、Worker dry-run成功。生成物にはsource内の固定テストとMarkdown/JSONの成果hashを含む。
- GitHubの全体verifyは実装commit `8fdaf9758` で成功（[run 44931044825](https://github.com/k999ln/rock/actions/runs/44931044825)）。
- ローカルは `npm ci`、`npm ci --prefix sites/avocado-mini` とOpenSSL 3のPATH指定が必要。全体verifyのNode試験は4,751成功・1失敗・4 skip。失敗は既存 `tests/mr-pc-adapter.test.mjs` の過大出力後の子プロセス終了確認（Python 3.15）。単独再実行は21のPython試験を含め成功。全体verifyがローカルで一括成功したとは扱わない。 `npm test` より後の全検証（ビルド、公開asset、API/CSV、担当台帳まで）は別途順番に実行して成功。
- GitHub SPIDER / secretsは、base履歴の `docs/design-validation/noah/noah-connect.test.mjs:85` を3コミットで検出して失敗（[run 44931044971](https://github.com/k999ln/rock/actions/runs/44931044971)）。今回の変更ではなく、履歴や検査設定を変更していない。
- 公開Gitには空台帳と合成テストのみ。本人用台帳・配布物はGit外。Noahへの本番登録、配備、新媒体の許可・正式リンク、実機受入は上記の残件のまま。
