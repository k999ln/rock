# 検証記録

## Rock star R1 / 2026-09-05

- サービス名をRock starへ変更。旧保存キー・イベント名・既存ファンドIDは互換性のため維持。旧PC接続URLも移行用に許可し、新URLを追加した。
- 4つの参照元を固定commitで確認し、事業を変更しない採用範囲を [参照記録](reference-repositories.md) に残した。Mr.原本4件の固定ハッシュは維持。
- gg直下をGitルートに統合。既存3commitと未commitの名称変更を保持し、originを `k999ln/rock`、従来配信先をsitesへ分離。
- ユニット/SQLite/MCPテスト33件が成功。新規の仕事状態・順序・サンプルと不合格・完了確認・入力検証・再送・revision競合・ユーザー分離を含む。既存ファンドの料金・分配テストも成功。
- 型チェック、`lint:product`、本番ビルド成功。未変更の生成済みUI部品を含む全体lintは従来の指摘が残る。今回のコードをその除外に隠していない。
- 全3移行を一時D1に適用し、本番WorkerのローカルHTTP検証143 assertionsが成功。401/403/400/413、ユーザー分離、順序違反、サンプル・失敗・確認要の非通過、再送、同時更新の片方だけ成功、最終確認、完了後の変更拒否、Worker再起動後の復元、既存実行履歴との非二重計上を確認。
- このHTTPテストはゲートウェイ認証ヘッダーを合成するローカル専用検証。実際のSitesログイン操作やブラウザ→ローカルMCPの権限操作を検証したものではない。実案件・本番DB・外部サービスには接続していない。
- 外付けSSDのAppleDoubleメタデータがDrizzle/Workerdに誤読されるため、移行生成とHTTPテストはメタデータを除いた一時コピーを使用。ソースや適用済みSQLは上書きしない。
- 進捗JSONからREADMEとproject.mdを同期し、`project:check` とGitHub Actionsに同じ検証を組み込んだ。実装commit [`b460ccf`](https://github.com/k999ln/rock/commit/b460ccfe236217af117bbd952b5b4c5cc50869d8) をmainへ保存済み。[GitHub Actions](https://github.com/k999ln/rock/actions/runs/33973073350) がUbuntu/Node.js 22のクリーンインストールから全検証に成功。ローカルmainの追跡先もorigin/mainへ変更済み。
- その後の[文書更新のCI](https://github.com/k999ln/rock/actions/runs/33973241769)で、403後の次のPOSTがMiniflare内部の `Network connection lost` となる断続的な失敗を検出。型・lint・33テスト・ビルドは成功していた。上流にも[未読のPOST本文を伴うローカルプロキシの報告](https://github.com/cloudflare/workers-sdk/issues/15203)があり、同系統と推定して調査。APIの早期拒否時に未読本文を明示的にcancelし、403→400を20回繰り返す回帰検証へ強化したが、[CIでは再発](https://github.com/k999ln/rock/actions/runs/33973570547)した。
- API検証の起動方法をMiniflare直接起動へ変更。コンパイル済みAPIとD1を実行し、静的資産ルーティングとWranglerの追加開発プロキシを検証対象から分離した。HTTP応答の成功条件は変えず、500の再試行も追加していない。Miniflare 5の `resourcePersistencePath` で一時DBを再利用し、全移行・143 assertions・再起動後の復元にローカルで成功。リモートCIは再確認中。開発プロキシ自体の上流不具合が修正されたとは主張しない。
- ブラウザの画面操作・見た目QA、実ウォレット接続、外部応募・納品・収益回収は未実施。既存Sitesの再公開は今回のGitHub保存とは別で、まだ実施していない。

以下は以前の実装時の記録です。

確認日: 2026-09-04（米国東部時間）。

## 実施

- 初期ページのローカルHTTP応答: 200。初期版の表示をCodexへ要求（queued）。
- TypeScriptの型確認。
- 試算・ウォレット応答の自動テスト7件: 無収入時の料金0、低収入で控除上限、実コストを含む赤字、月額上限、円丸め、無効値拒否、Ethereumアドレスの形式、ユーザーキャンセル/保留中リクエスト。
- 配信用ビルド。
- 公開API実行: `transcription` でGitHub/Hugging Faceから合計24件の候補を取得、失敗0。取得物は非実行JSONとして保存し、掲載候補として扱う。
- 初期雛形の依存部品に既知の問題11件があったため、互換性を合わせて修正版へ更新。更新後npm installの監査結果は0件。将来の脆弱性まで保証するものではない。

## 未検証・未連携

- ブラウザのクリック・画面サイズ変更・スクリーンショットによるUI検証は未実施（依頼範囲外）。
- WebMCPを実行・検証できる接続手段が今回の環境では見つからず、登録・成功/失敗の実機契約確認は未実施。通常UIは非対応ブラウザでも利用可能。
- 実ウォレットとの接続操作は未実施。アドレス形式と失敗メッセージのテストのみ。
- 認証署名、実決済、ファンド入金、収益分配、ココナラ自動操作は未実装のため検証対象外。
- 稼働収益、ユーザー数、実測電力・通信量の根拠は提供されていない。

## Mr.取り込み後

- GitHubの固定commitから4ファイルを取得し、原本のSHA-256を保存。
- 追加テスト12件: 出典の重複、コード/非リンク出典の保持、出典欄が先にある原稿、出典内のコード、有料本文を残す制約、不正URL等、案件条件、Python原本との照合、結果ファイルの上書き拒否、納品証跡の正常/自己レビュー/改変/パス異常。既存7件と合わせて19件。
- Pythonのローカルパックは架空の原稿・契約・レビューで実行。実アカウントへの応募・納品・投稿は実施していない。


## Fund Club / MCP update

- 27 Node tests pass, including all four real stdio MCP calls, supplied-file delivery verification, tamper rejection, POSIX/Windows path rejection, huge integer resilience, malformed messages, and 1,200 fund accounting cases.
- The production Worker build was run locally with the same migrated D1 state directory. Auth required, per-user plan isolation, plan PUT/GET persistence, invalid plan rejection, Origin checks, and idempotent run metadata all pass. Synthetic test users only.
- Loopback Streamable HTTP: initialize → initialized notification (202) → tools/list (4) → Python delivery sample (PASS). Unauthorized Origin/Bearer, unsupported protocol, GET405, and private-network preflight checked.
- TypeScript, scoped lint of changed product components/routes, and production build pass. npm audit has zero findings after an esbuild override for Drizzle's development dependency. The untouched generated UI catalog retains baseline full-project lint findings.
- The final market-style front shows four ready strategy presets and two preparation-only previews. No fabricated balances, yields, participant totals, or paid gacha. Search/category/status filters select the cards shown. Real tool completion and sample runs have distinct labels.
- Browser screenshots/click QA were not requested and were not performed. Loopback HTTP was verified at protocol level; a browser may still require the user's initial local-network permission. WebMCP list_funds/select_fund is feature-detected; the stdio/HTTP MCP transport is the verified execution integration.
