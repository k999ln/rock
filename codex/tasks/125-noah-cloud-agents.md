# 125 NoahのCLI管理クラウドと提供元接続

本人指示（2026-11-22）: CLI型の実行環境をクラウドに用意し、利用者の設定なしでNoahから接続・利用する。指定元クラウドへの直接接続も扱う。

正本: [サービス契約](../../docs/services/noah-cloud-agents.md)。対象は `services/noah-cloud-agents/`、`lib/noah-cloud-*`、`lib/noah-provider-*`、Agent詳細/接続UIとAPI、関連試験。追加指示で全掲載を接続対応の対象とし、公式配布元からの自動解決と全件の対応状況点検を進める。

合格条件: 公式Agentの実クラウド処理、本人/Origin/再送/停止/上限/鍵非露出、スマホで接続→依頼→結果再表示。公開結果・CI・PRは受入後に記録する。

状態: 実装中。2026-11-22にCloudflareのcontainers:write/ai:write追加認証は成功。新旧両アカウントとも、Containers APIがWorkers Paid未契約を理由に配備を拒否。新ログインから旧環境を管理する選択は承認済み。有料化は未承認。

PR: [iceiceice999/rock #1](https://github.com/iceiceice999/rock/pull/1)（Draft、旧 [k999ln/rock #402](https://github.com/k999ln/rock/pull/402)）。実クラウド受入・マージ・本番公開は未完了。公開198とGit mainの変更を両側保全して統合済み。

確認済み:
- 公開一覧1,762件の取得と、全件の接続定義点検を開始。GitHub/npm/Dockerの公式定義からMCPへ接続する共通経路、MCPの入力とWork保存、標準入出力CLI profileの拡張を追加。全件の実行合格ではない。
- 実提供元guessit-jsの公開MCPへ入力し、実結果を本番と同じschemaのローカルSQLite Workへ保存。別runtimeでの再読込、別owner拒否、同一ID再送の再実行なしを確認。
- Time 2026.11.18とSequential Thinking 2.2.0をnetwork noneのLinux containerでprobeし、公式ツールを呼出して結果を取得。モデル応答はfixture。本番クラウドの配備未完了は継続。
- `node --experimental-strip-types --test tests/noah-cloud-*.test.mjs`: 36件（今回のAPI/実行器18件を含む）。本人/Origin/委任停止、モデル上限、結果hash、停止と起動競合、再送、ブラウザなしのWork保存、結果再送を含む。
- `npm run check`（`services/noah-cloud-agents`）: Docker amd64イメージとWorkerのdry-run成功。
- 公式Hermes SDKのterminal/file操作で `total.txt` の内容 `2000`、公式boss CLIで面接質問5件を、外部通信なしのLinuxコンテナで確認。モデル応答は固定fixture。
- `scripts/test-noah-cloud-browser.mjs`: Chrome 320/390/1280px、接続・入力・タップ・停止・結果再表示・ファイル保存・読込障害からの復帰。API fixtureによるUI試験。
- 全体 `npm run verify` は最新main統合後に終了0で成功（2026-11-22）。その後の配布版照合はAPI/実行器18試験・typecheck・lintを再実行して成功。途中で見つけた依存フォルダの除外漏れはサービスの.gitignoreで修正。別toolkitの依存不足は `npm ci --prefix toolkits/noah-coconala --ignore-scripts` で解消し、その試験は合格。

再開:
1. 旧Cloudflare環境を維持し、新ログインへ管理権限を追加する。CLI配備はWorkers Paidの契約判断が別途必要。追加OAuth認証は完了済み。サービスに固定したWranglerを使い、`--config ./wrangler.jsonc` を明示する。認証情報をログに出さない。
2. READMEに従い実行器の配備・サーバー間secretを設定し、実モデルで公式Agentの実行・停止・結果保存を確認。
3. GitHubの検証を通してPRをマージ。本番Sitesを最新mainと同じGit treeへ同期し、treeを照合してから公開。Secretsはnative Sites環境設定へ登録する。
4. 本番の実Chromeスマホ幅で検索→接続→依頼→結果/外部評価を確認し、task・CHANGELOG・READMEへ実測の公開版を追記する。未確認の段階では✅を付けない。

アカウント移行（2026-11-22）:
- 旧74ブランチの履歴とmain一致を検証。通常ブランチから到達できなかったPR 28件を新リポジトリの `codex/legacy-k999ln-pr-<番号>` に復元し、全SHAを照合。
- PR 403件・レビュー67件・コメント176件を [移行バックアップ](https://github.com/iceiceice999/rock/releases/tag/migration-k999ln-20261122) に保存。再ダウンロードしたZIPと格納418ファイルのhashを確認。
- 新リポジトリでverify/repair/web measurementは成功。secrets検査の3分時間切れを10分へ延長し、対象や検出規則は維持。CodeQLにprivateリポジトリの実行情報取得用actions:readを追加。変更後の全体 `npm run verify` と実Gitleaksのscanner/policy試験20件、CodeQL workflow試験4件に成功。
- 本人の明示指示で新rockを以前と同じ公開へ変更し、CodeQL結果APIの取得成功を確認。更新後のGitHub CIは別途照合する。
- 新GitHubにActions Secretsは未登録。旧収集用secret、X/Smithery認証、スケジュールの移行は別途必要。旧アカウントのSecretsを読み出して移したとは扱わない。

## 全掲載への拡張（2026-11-22）
直接接続はPR #7へ分離し、マージ後に本番Sites205へ公開済み。Chrome390pxのタップで検索→公式MCP接続→実行→保存一覧→再読込と外部評価の表示を確認。CLIはHermes/BossにTime/Sequential Thinkingを追加。公式配布物の固定版・hashを照合し、Linuxコンテナ内network=noneで初期化/道具一覧/実ツール応答を確認（モデル応答はfixture）。実クラウド・実モデルの成功とは扱わない。
全1,762件の定義監査: 既存接続170、定義確認187（MCP54/Gradio133）、固定CLI4、追加対応1401。個別にguessit公開MCPの実実行とSQLite保存/再読込/別所有者拒否を確認。秘密や個人入力を監査ファイルへ保存しない。
旧Cloudflareアカウントへ戻す本人指示を連携先から受領。旧OAuthのContainers/AI権限追加後も、Containers APIが401 Workers Paid requiredを返すことを実確認。新規有料契約はしていない。新main/PR #7取り込みと最終検証を継続する。

最終検証更新: 新main統合後のクラウド/提供元67試験は成功。外付けTMPDIRで全体verifyを試した際に無関係なAMC試験が時間切れ・停止したため、内蔵ディスクで当該69試験を再実行して成功。その後の新rock PR #1（d2364495）の全7 CIは成功（verify 7分12秒）。

## 追加CLIと新ログインの確認（2026-11-22）

- main94d2c762（収益統合PR #8/#9）を両側保全して取り込み。Memory 2.2.1/Filesystem 2.4.0を追加し、Node 24のdigest固定イメージへ更新。旧Cloudflare account_idを配備設定へ固定。
- 公式stdio4配布物のprobe/実ツールがnetwork noneのLinuxで成功。Memory生成物/次の依頼の空の記憶、Filesystem生成物/読戻し/領域外とsymlink拒否、成果hashを確認。モデルはfixture。関連68試験成功。
- 22:40 JSTの実API確認: kirin.999@icloud.comは旧環境の管理と既存7 Workersの読取が可能。smash@avoado.siの権限はSuper Administratorだが招待はpending。新ログイン用の分離OAuthも旧メールで認証され、新ログイン自身での管理は未確認。Containersは401 Workers Paid requiredを維持。契約・本番CLI有効化は未実施。
- 今回追加後の型/lint・Worker/amd64イメージdry-runも成功。全体verifyは本人が指示した全チャット統合担当の最新統合版へ集約し、PR #1のSHA/検証結果を渡す。実クラウド受入は引き続き未完了として保持する。

- 本番掲載のMemory/FilesystemはDockerページであることを確認し、Docker公式mcp-registryの配布記録が同じ公式上流のsrc/memory・src/filesystemを指すことを照合して別名登録。掲載カードから固定CLIへ解決する19試験が成功。

## 2026-11-22 全チャット差分の統合検証（PR #12）

- [PR #12](https://github.com/iceiceice999/rock/pull/12)でCLI `9f888cc36`、公開サイト診断 `e88bab58d` と、mainに入ったココナラ `9bd709013`・Pixel受入記録を統合。追記文書は両側を保持。
- 統合 `7c543a79d` の `PATH=/opt/homebrew/opt/openssl@3/bin:$PATH npm run verify` が全工程成功。主要5,155成功・5skip・失敗0、仕事API1,918、CSV385。型検査・lint・ビルド・資産欠落0も成功。後続mainマージ `49fc3cd2f` は同一tree。GitHubの最終検査結果とマージSHAはPRに記録する。
- CLI本番配備・実モデル受入、共通Noah画面での追加診断受入は別工程。検査成功を本番実行・実注文・承認・入金の成功として扱わない。

## 追加料金なしの継続（2026-11-23）

新ログインの招待を再取得したAPIはまだpending、新ログインのChromeでも旧環境は権限エラー。管理移行の受入は未完了。課金変更は行わず、固定した旧accountへ無料Workerを配備した。

公式Memory/Filesystem/ThinkingのfactoryをWorkersへ組み込み、workerdでTool・記憶分離・領域外/symlink拒否・alarmだけの結果送達・停止と遅延応答・期限を検査。実クラウドではMemoryとFilesystemが実モデル2回で成果を返し、ファイルhashを確認。Noah公開画面と画面閉鎖後のWork保存は統合後の独立受入を待つ。無料版のPython/shell対応は未完了。
