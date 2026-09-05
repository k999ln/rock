# 検証記録

## Rock star OS P1 実装 / 2026-09-05

- 共通JavaコアをTemurin17/Gradle8.11.1でコンパイルし、実SQLiteの16テストに成功。2工程/再起動後の再開、同時claim、冪等受付、古いtoken/期限切れ結果の拒否、3回までの再試行、停止/中止/人の再試行、sample非通過、transaction失敗時のrollback、改変成果物、未知DB版を含む。
- 合成fixture12件に対し、Javaと既存TypeScriptの出典整理/無料版/2工程接続を36項目で照合し一致。全入力の同値保証ではない。
- 既存Web/PCの `npm run verify` は33テスト・API143 assertions・型/lint/buildに成功。OS契約の検査を既存テストへ追加し、最終変更後にも再検証する。
- 初期のGradle再実行は外付けExFATの生成物削除で失敗。ソースを削除せず、`rockBuildRoot` で一時APFSへ生成先を分離して16テストを再実行した。
- Java/Gradleは公式配布のチェックサムを照合し、一時領域へ展開。グローバルインストール、OS署名鍵の生成、Android端末への導入/初期化/書込は実施していない。
- AOSPのr4 manifest commit、Cuttlefish製品継承先、aosp_current→bp4aのrelease aliasを公式Gitで確認した。ただしSoongのbuild/OS起動は未実施。
- `os:host` はLinux/x86-64/RAM/空き容量/KVMが条件を満たさず終了コード2となることを確認。機材を購入/契約せず、OS02〜05を完了扱いしない。
- Android APKのbuild/lintとSDK契約テストはGitHub CIで確認中。Binder境界・画面OFF・実電源断・実機の隔離/電池/OTAは未検証。既存Sitesは非公開設定・分岐・公開停止を維持。

## Rock star OS 設計v0.1 / 2026-09-05

- 利用者の「OS開発をメイン」の指示に基づき、[開発設計書](os-development-design.md)を作成。既存product/architecture/fund/MCP/workflowと、配信側 `c6942d5` のbackend-design/READMEを読み、9要求・OS責務・14受入条件・7初期チケットへ対応付けた。
- AOSP/Android/Googleの一次資料で、Cuttlefish、Pixelの解除/復旧とvendor入手条件、Linuxビルド要件、バックグラウンド制約、UID/SELinux/Keystore、署名/Store、AVB/Virtual A/Bを確認。参照リンクを設計判断の近くへ記載した。MCPとネイティブOAuthの安全境界も公式仕様で確認。
- 設計案と既存実装を区別し、OS本体/SDK/第三者Store/Pixel対応は未実装・未検証と明示した。工程/電池/資源の数値は将来の仮目標で、測定実績ではない。
- READMEとproject.mdをOS中心の案内へ更新し、初期仕様とWeb/PC資産・ファンドの試算式は保持。旧WebのAPI/DB衝突は解消しておらず、本番公開は保留のまま。OS設計の依存条件からは分離した。
- 今回は文書・進捗・継続ルールのみの変更。端末購入/初期化/解除/書込、AOSP取得・build、実機試験、署名鍵作成、サイト公開、branch統合は行っていない。
- `npm run verify` 成功。進捗整合、型検査、製品lint、既存33テスト、Web build、仕事APIの143 assertionsを確認した。これは既存Web/PCの回帰検証であり、OS/Android/実機の合格を意味しない。
- 文書内の相対リンク64件、manifestのJSON例、Q01〜Q09の受入条件への対応、AT01〜AT14の存在、コード区切りを検査。`git diff --check` と文書更新後の `npm run project:check` も成功。

## Rock star R2 / 2026-09-05

### ブラウザ確認

- `npm run dev -- --host 127.0.0.1 --port 3001` の表示URLでHTTP200を確認。Chromium（agent-browser 0.36.0）でホーム→仕事→標準ローカルサインインを操作した。サインイン前は作成不可、サインイン後はD1保存が可能。
- ローカルDBのみで `QA 2026-09-05 記事フロー（合成）` を作成。出典サンプル実行は0/2のまま、合成原稿の出典整理で1/2、無料版作成で2/2・最終確認となることを確認。確認メモが空の完了ボタンは無効。メモ入力後に完了し、再読込→「完了・中止も表示」から同じ仕事を再表示できた。GET APIでもcompleted・revision4・4履歴・両手順通過を確認。
- 別の合成ココナラ案件（面談必須・発注率10%）はneeds_reviewで0/2・作業中のまま。中止ボタンとホームへの復帰を確認した。外部への応募・納品・記事投稿・販売は行っていない。
- テンプレートの選択欄が内部ID `article` を表示する問題を日本語名へ修正。ホームの仕事入口が1180px以下で隠れる問題に専用リンクを追加し、390px幅でもクリックして/workへ進めることを再確認。
- PC1280px・スマホ390px幅のスクリーンショットを確認。ホーム・仕事画面に横はみ出しなし。スマホ検索「音声」でボイス ファクトリー1件に絞られることを確認。操作中のブラウザ実行時エラー・エラーオーバーレイなし（開発用Vite/React通知のみ）。
- React確認ではリンクの意味・フォーカス表示を維持し、追加の状態・イベント購読・データ取得は導入していない。スクリーンショットはローカル一時ファイルで、公開リポジトリやサイト配信物には含めない。
- 開発サーバーの終了時ログにはHMR後の複数renderer/context警告と依存最適化警告が残っていた。画面操作・API応答は成功したが、これを本番で警告がない証明とはしない。ブラウザのconsoleエラーとは区別する。
- PC接続時のブラウザ初回ローカルネットワーク許可、実ウォレット、実決済・外部サービス操作は未検証。R1のAPI/stdio MCP検証とは区別する。

### 本番反映

- 画面修正後の `npm run verify` が成功。進捗同期・型・対象lint・33テスト・本番ビルド・D1 API143 assertionsを確認した。
- 修正commit [`89d2d66`](https://github.com/k999ln/rock/commit/89d2d6688a2f0aa311e000182b0656fbb7f80e3b) をGitHubへ保存し、[GitHub Actions](https://github.com/k999ln/rock/actions/runs/33975762050)も全検証に成功。
- 本人だけが閲覧できる既存Sitesのアクセス範囲を確認した。配信物はAppleDoubleを除いたビルド成果物・hosting設定・全3移行からSites標準ヘルパーで作成し、エントリーポイントと移行の同梱を確認した。ただし配信用ソースpushが非fast-forwardで拒否されたため、この配信物はアップロード・公開していない。
- `sites/main` を取得し、別の2commit・39ファイルの差分を確認。保存済みSitesバージョン4のソースは `c6942d5ef72e9dd16345b9363e68e0e18ca25079` で、今回のrock/mainとは分岐している。保存済みという情報だけでは本番DBへの適用境界を断定しない。
- API・画面・Drizzle移行の衝突があるため強制pushや一方の削除は行わず停止。[統合設計](deployment-integration.md) に再開条件を記録した。今回のSites version保存・本番公開・本番DB書込・本番でのログイン後操作は未実施。
- fetchでSSD上に生成されたAppleDoubleの `.idx` 補助ファイルをGitが誤読したため、その1件のみ `/private/tmp/rock-release-FQzn44/appledouble-pack-index.backup` へ退避した。Gitの本物のpack/indexと履歴は保持。ローカル開発サーバーと検証用ブラウザは終了した。

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
- API検証の起動方法をMiniflare直接起動へ変更。コンパイル済みAPIとD1を実行し、静的資産ルーティングとWranglerの追加開発プロキシを検証対象から分離した。HTTP応答の成功条件は変えず、500の再試行も追加していない。Miniflare 5の `resourcePersistencePath` で一時DBを再利用し、全移行・143 assertions・再起動後の復元にローカルで成功。修正commit `7103e55` の[GitHub Actions](https://github.com/k999ln/rock/actions/runs/33974155924)でも全検証が成功。開発プロキシ自体の上流不具合が修正されたとは主張しない。
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
