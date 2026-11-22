# 125 NoahのCLI管理クラウドと提供元接続

本人指示（2026-11-22）: CLI型の実行環境をクラウドに用意し、利用者の設定なしでNoahから接続・利用する。指定元クラウドへの直接接続も扱う。

正本: [サービス契約](../../docs/services/noah-cloud-agents.md)。対象は `services/noah-cloud-agents/`、`lib/noah-cloud-*`、`lib/noah-provider-*`、Agent詳細/接続UIとAPI、関連試験。追加指示で全掲載を接続対応の対象とし、公式配布元からの自動解決と全件の対応状況点検を進める。

合格条件: 公式Agentの実クラウド処理、本人/Origin/再送/停止/上限/鍵非露出、スマホで接続→依頼→結果再表示。公開結果・CI・PRは受入後に記録する。

状態（2026-11-23）: 公式Memory・Filesystem・Sequential Thinkingの無料Workers実行と、画面を閉じた後の成果受取をSites210で本番受入済み。停止・再送非実行・別所有者拒否も確認。Hermes・boss・Timeは本番未対応で、任意CLI全体の実行合格ではない。新ログインから旧環境への管理移行は未確認、有料化・新規契約なし。

PR: 無料実行器・共通成果は [#18](https://github.com/iceiceice999/rock/pull/18)、従来コンテナ修正・Pixel記録は [#19](https://github.com/iceiceice999/rock/pull/19)。旧 [#1](https://github.com/iceiceice999/rock/pull/1) / [k999ln #402](https://github.com/k999ln/rock/pull/402) の経緯は以下に保持する。

初期実装の確認（2026-11-22、当時の状態）:
- 公開一覧1,762件の取得と、全件の接続定義点検を開始。GitHub/npm/Dockerの公式定義からMCPへ接続する共通経路、MCPの入力とWork保存、標準入出力CLI profileの拡張を追加。全件の実行合格ではない。
- 実提供元guessit-jsの公開MCPへ入力し、実結果を本番と同じschemaのローカルSQLite Workへ保存。別runtimeでの再読込、別owner拒否、同一ID再送の再実行なしを確認。
- Time 2026.11.18とSequential Thinking 2.2.0をnetwork noneのLinux containerでprobeし、公式ツールを呼出して結果を取得。モデル応答はfixture。本番クラウドの配備未完了は継続。
- `node --experimental-strip-types --test tests/noah-cloud-*.test.mjs`: 36件（今回のAPI/実行器18件を含む）。本人/Origin/委任停止、モデル上限、結果hash、停止と起動競合、再送、ブラウザなしのWork保存、結果再送を含む。
- `npm run check`（`services/noah-cloud-agents`）: Docker amd64イメージとWorkerのdry-run成功。
- 公式Hermes SDKのterminal/file操作で `total.txt` の内容 `2000`、公式boss CLIで面接質問5件を、外部通信なしのLinuxコンテナで確認。モデル応答は固定fixture。
- `scripts/test-noah-cloud-browser.mjs`: Chrome 320/390/1280px、接続・入力・タップ・停止・結果再表示・ファイル保存・読込障害からの復帰。API fixtureによるUI試験。
- 全体 `npm run verify` は最新main統合後に終了0で成功（2026-11-22）。その後の配布版照合はAPI/実行器18試験・typecheck・lintを再実行して成功。途中で見つけた依存フォルダの除外漏れはサービスの.gitignoreで修正。別toolkitの依存不足は `npm ci --prefix toolkits/noah-coconala --ignore-scripts` で解消し、その試験は合格。

当初の再開手順（2026-11-22、無料版公開前）:
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
## 画面閉鎖後の成果受取（2026-11-23、受入中）

- 本人の追加指示で、クラウド実行と画面を閉じた後の成果受取を進める。連携先チャットでの本人指定「追加料金なし」を保持し、新規有料契約は行わない。無料枠の公式実装組込は実行器担当が検証する。
- 共通の実行中/成果一覧と仕事詳細へ、本人の保存済みcloud Workを統合。閲覧は実行器を起動せず、結果本文・成果ファイルを再表示する。停止は既存cloud APIの本人/Origin/実行器停止処理を通し、停止失敗を完了表示にしない。
- コールバックで保存した成果の再表示、他所有者拒否、Agent/接続の条件、版の競合、停止失敗をSQLiteで確認。既存cloud/providerを含む32試験成功。本番実測はまだ行っていない。
- 本番受入は、開始後のjobId付きGET（結果を取得して保存する経路）を遮断し、Chrome全体を終了してから保存済み履歴だけを確認する。閉鎖後の保存時刻、実モデル呼出、成果ファイルの内容/hash、新しいChromeでの再表示を確認する。Cookieや運営鍵を試験記録へ保存しない。

無料実行器と共通成果を [PR #18](https://github.com/iceiceice999/rock/pull/18) に統合。依存追加に伴うlicense件数の期待値を実台帳へ更新し、release関連40試験成功。最終全体verifyとGitHub CIは実行中。新しいWorkerは旧accountの `noah-free-cloud-agents`、Noah本番の有効化はまだ行っていない。

<a id="pixel-209-and-real-model"></a>

## 2026-11-23 実モデルとPixelの再検証

- 公開209はmain `42cf4b619ee19bcb47612250d70539457dec1977` と同じtree `fde361844ba21fd581f3ea10a60ba87d4682f1e9`。Sites source `459c0439f778bb605e6b52179be886a8cc2b1e6a`、deployment `appgdep_6b02fea378e08191a30436c416c25aa7` succeeded、env17。既存のデザインと機能は変更していない。同じ内容の重複配備は実施しなかった。
- 実モデル `@cf/openai/gpt-oss-20b` が返すTool呼出の本文 `null` を次の入力へ渡すとHTTP400になることを実APIで再現。空文字列へ正規化し、Tool ID・引数・結果は維持する。回帰試験9件成功。
- 公式stdio実行器は、Toolを一度も実行しない文章だけの「完了」を受け付けない。1回だけ実操作を促し、それでも実操作がなければ失敗にする。未知の道具名は書き換えて実行せず、未実行のエラーをモデルへ返す。既存の8回/240秒上限は維持。
- ARM64 Linux・network none・非rootの隔離コンテナに固定版の公式6配布物を入れ、ホストから実Workers AIへ中継。キーはコンテナへ渡していない。Timeの現在時刻、Sequential Thinking、Memoryの作成/読戻しと `memory.jsonl`、Filesystemの作成/読戻しと `result.txt`、Hermesの `total.txt=2000`、bossの面接質問5件を確認。モデル応答はfixtureではない。Filesystemはモデルの不正な道具名/応答で失敗した試行もあり、再試行の成功と分けて記録。6種を同一実行で全件成功したとは扱わない。Containers本番はWorkers Paid未契約の拒否を再確認し、有料契約はしていない。
- `scripts/test-noah-cloud-stdio.mjs` は公式パッケージで8シナリオ成功（モデルはfixture）。通常処理に加え、文章だけの完了からの復帰、未知Toolを実行しない復帰、文章だけの完了を2回返した時の失敗、Memoryの依頼間分離、Filesystemの領域外/symlink拒否を含む。
- Pixel 10の公開209で `Noah-Pixel-209-20261123` を新規登録（今回だけ使用）→登録202/完了200→plan/connect/tools200→認証付き `whoami` 202→成果の詳細200→キャッシュを使わない再読込後も名前と「利用中」を表示。Work `5f64b90b-f569-4578-9bd1-f0444dd3c6eb`。この試験用ブラウザの所有者に限定され、既存本人の保存データは変更していない。411pxで横溢れなし。最初の読み込みにDNS失敗があったが、再読込後は完走し、登録の重複送信はなし。
- Pixelで通常タップの16ms振動と接続成功の `[12,45,12]`、Web Audioのrunning状態での再生開始を確認。Androidのvibrator_managerも対応する12ms×2のfinishedを記録。今回の音は再生処理の確認で、録音による音質評価はしていない（公開203の実録音はtask100に保持）。
- 証拠は `work/noah-tap-feedback/work/noah-production-209/` の `publication.json`、`model-probe.json`、`real-model-guarded.log`、`model-filesystem-diagnostic.log`、`stdio-regressions.log`、`pixel-roundtrip.json`、`pixel-feedback.json`、`pixel-vibrator.txt`、`pixel-result-reloaded.png`。キーや本人の既存データを含めず、途中の失敗も保存。全体verifyとGit/公開の最終結果は受入後に追記する。

- [PR #19](https://github.com/iceiceice999/rock/pull/19): `PATH=/opt/homebrew/opt/openssl@3/bin:$PATH npm run verify` が単一実行exit0（主要5,163成功・5skip・失敗0、API1,918・CSV385、型/lint/build/資産/mission/work/bot成功）。最終の記録と試験出力表示の更新後にも `npm run design:check` / `npm run lint:product` 成功。GitHub CI・マージ・公開の状態はPRへ追記する。


## 2026-11-23 本番の画面閉鎖後受取・停止

- 公開: Sites210 / env18、main `16a9eae6dac5a40ab0f1bfacc4ecad2de9e34617`、Sites source `d39bae2e498c5ebebf69d29f7cd843c2aaac72de`、同一tree `2ee821d56b488268944d613b919e4dfac081a6e0`。deployment `appgdep_6b03102cfa388191b44965b3498eab31` がsucceeded。無料Worker版 `debcd483-f69b-4a0b-a5e8-eac0964fc59b`。
- 実行条件: Chrome157.0.8103.79、390×844px/touch。各依頼をNoah UIから接続・送信し、queued受理後にChromeプロセス全体を終了。15秒間HTTPも送らず、その後は実行器へ通信しない共通 `/api/noah/ask/:id` のD1読取だけでsucceededを確認した。jobId付きcloud GETは送らず、閲覧による結果保存を除外。モデルfixtureなし。Cookie・運営鍵は記録しない。
- 新しいChromeへ同じセッションをメモリ内で復元し、「保存したもの → 成果」→仕事詳細→再読込→ファイルdownloadを実操作。全件、本文・成果hash一致、横溢れ/JS例外なし。実機Pixelでの新クラウド検査ではない。

| 公式profile | Work | Chrome終了 UTC | D1保存 UTC | 実モデル回数 / 公式Tool | 保存ファイル |
| --- | --- | --- | --- | --- | --- |
| memory 2.2.1 | `2ce85ea7-1da6-42e7-9327-9175dbb16281` | 2026-11-22T15:57:04.645Z | 2026-11-22T15:57:07.605Z | 2 / create_entities × 1 | memory.jsonl, noah-execution.json |
| filesystem 2.4.0 | `3f08c6ca-1dca-4e33-ac89-332afd4ef3d9` | 2026-11-22T15:57:40.063Z | 2026-11-22T15:57:42.828Z | 2 / write_file × 1 | total.txt, noah-execution.json |
| thinking 2.2.0 | `1e0238d5-7abd-46be-b197-bd7917c6d66a` | 2026-11-22T15:58:13.355Z | 2026-11-22T15:58:26.465Z | 4 / sequentialthinking × 3 | noah-execution.json |

成果のSHA-256（downloadした実bytesと一致）:

- memory `memory.jsonl`: `6d844fd92d98b40854e6fed3bd060636f2dd96f6916a3b7f603b933d33679571`。
- filesystem `total.txt`: `4146b7ad487eec28c783029bc192e30f610fbf229d791f9eb3abc4ecd040a502`。
- thinking `noah-execution.json`: `ffa413017317524d7d0c2ee97b1c3587700b3dacd43874a3fb91fcc09aa910ae`。

停止の別担当受入: Thinking Work `8af51dd6-02d5-4c28-94c9-683a01e77185` を接続→running→タップ停止。6秒後と再読込後もcancelledで成果なし。同じstart再送は200/cancelled、別所有者は404。実行中のmodelCallsは公開APIに出ないため、停止した依頼のモデル開始回数や計算自体の中断は断定しない。

証拠はローカル `work/noah-cloud-production-acceptance-20261122/run-1795363012731/`、`run-1795363047378/`、`run-1795363081869/` のreport.json/result.png、停止は `work/noah-production-qa-20261122/free-cli-research/mobile-stop/report.json` とstopped.png。公開出所は同free-cli-research/publication.json。受入scriptは同acceptanceディレクトリのclosed-browser.cjs / run-suite.cjs。これらの作業用ファイルには認証Cookieを保存していない。

受入で、保存済みcloudFilesにも「添付の内容は保存されていません」と出る汎用注記の不整合を発見。共通結果表示へ保存済み添付数を渡し、未保存の添付がある場合だけ注記を出すよう補正した。次版での表示再確認と最終検査は後続PRへ記録する。

検証基点: PR18の最終head `1a12b4bb4ac77b954cfa33c0d93105413a1e94e9` でローカル全体verify全工程成功（主要5,175成功/5skip/失敗0、API1,918、CSV385）、GitHub全8チェックSUCCESS。新規課金・本番D1 migration・外部申込なし。残る制約は無料枠上限、未対応CLI3種、新ログイン管理移行、実機Pixelでの新クラウド受入。
