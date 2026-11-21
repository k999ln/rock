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

## 2026-11-22 ①法人si導入準備の拡張（作業中）
本人の追加指示により、`business-*` モジュール、独立Worker、同試験、Noahの公開導線/掲載用定義、関連設計/記録を範囲へ追加する。
利用者の会員登録なしで相談→成果を返す。掲載・承認・入金の条件は推測で有効化しない。受入は新サービスシートに従う。
検証: 専用試験、Noah MCP/入力schema、Workerローカル実保存/再起動、公開URL、`npm run verify`。

### 本人の補足: Agentの完了条件
「一連の流れをagentで自動化していること」。手動フォーム/CSVの基盤だけでは未完了。自社記事公開・相談処理・実績点検・改善判断をDurable Objectで継続実行。ASP実取得と銀行接続は未接続。受取銀行は本人へ再質問せず登録情報から確認する。接続済みメール2件のレントラックス支払/口座通知検索は0件。2026-11-22時点でブラウザ操作ツールが使用不可のため管理画面の口座確認は未実施。

### 2026-11-22 配備と検証
- 公開入口 https://avoado.si/noah/business-si は未認証302で独立Workerの相談画面へ進む。公開NoahホームのボタンをHTTPで確認。Sites版175は本件のソースcommitを保持したmergeで配備成功。ブラウザ操作の受入はツール欠如により未実施。
- Worker: noah-business-si、版5cb01d34-b05a-42b7-a404-7068317f303d。運営APIの未認証401、公開MCPの道具分離を確認。
- 継続実行を開始し、初回の業務別記事が自動公開（HTTP200）。15分alarm・5分watchdog。ASP/銀行工程は接続待ち、紹介は媒体確認待ち。成果と入金の合成値は本番へ投入していない。
- `PATH=/opt/homebrew/opt/openssl@3/bin:$PATH npm run verify` 全チェーン成功（継続実行器追加前）。追加後は関連18試験、oxlint、Worker配備を成功。OS標準LibreSSLでは署名試験が失敗するためHomebrew OpenSSL3を使用。
- 残件: 実Rentracks取得接続、管理画面で受取口座確認、銀行読み取り接続、媒体許可/正式リンク、実承認・実入金の自動通し運用。これらが揃うまでPRはdraftとし、Agent完成・収益化完了と呼ばない。
