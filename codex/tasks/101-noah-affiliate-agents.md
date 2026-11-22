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


### 2026-11-22 Chrome引継ぎ後の実確認（PR #374、作業中）
- 既存Chromeのログイン済みレントラックス接続に成功。登録口座、注文・承認・支払、登録媒体を読取。詳細はGit外の本人用資料に保存し、銀行番号・名義・実案件報酬はGitへ記載しない。
- 注文は365日まで、2021-04-01以降の閲覧制限を実画面で確認。直近365日の全状態・売上日/承認日を取得。現在の対象案件は0件、ASP支払履歴は明細なし。既存別媒体の否認成果はNoahへ帰属させない。
- `business-rentracks.mjs` と `business-sources.mjs`: フィルター・見出し・小計・期間の検証、対象案件だけの必要列投影、所有者認証下の原子的保存、重複排除、0件の受領票、24時間の鮮度、銀行明細の一意照合。取得後は既存alarmを起動する。
- 登録媒体は既存の他サイトだけ。Noahの媒体登録内容を準備したが、本人の「いらない」により送信しない。既存ブログは公開確認済み、編集側は未ログイン。銀行の公式照会入口は未認証。新サービス追加、銀行認証の抽出、申込や問い合わせの送信はしていない。
- 未完了: 媒体登録・正式リンク、ASP継続読取実行器、支払明細発生時の通知書/成果内訳取得、銀行認証・読取接続、実成果から実入金の通し受入。単発の取得成功を全工程自動化の完成にしない。

### 2026-11-22 実取得・検索導線の追加検証
- `business-browser-collector.mjs` を支持されたCUAのChrome Tabで実行し、365日の注文/承認と支払を一巡取得。手動CSVではなく画面操作→検証→必要列抽出→Workerの所有者口へ保存→alarmの自動点検を実確認。対象案件0件、支払明細0件。取得記録・受領票・実行結果はGit外へ保存。取得処理の常駐実行は未接続。
- Worker版 `94a65c7b-b8a7-4a43-a178-be95a7ed18a6` を配備。記事4件、robots.txt、公開6 URLのsitemap.xml、canonical/descriptionと運営画面noindexを確認。検索掲載や集客数の発生を保証するものではない。
- 取得後の本番実行はrun 8、2026-11-21T21:05:15.233Z。自社記事・相談・実績点検は稼働、紹介は停止、ASP継続取得/銀行は未接続。合成の成果・入金は本番未投入。
- 関連24試験・oxlint成功。全体verifyは型検査/lintまで成功、Node 4,794試験中4,787成功・3失敗・4 skip。失敗は既存 `pixel-cached-prepare.test.mjs` の並列負荷下の待ち時間超過（preparing）。同ファイル単独17試験成功。テスト・対象外実装・履歴は変更していない。全体一括成功とは扱わない。
- 本人の最新優先順位は銀行を並行とし、集客→相談→正式紹介→実成果取得を先行。新規媒体登録は送信しない。既存媒体用のHTTPS公式タグをそのまま保持する記事原稿をGit外へ準備。ブログ管理の認証と、Noahから既存媒体への条件適合した接続は未受入。
- 全体verifyの `npm test` より後の全チェーン（パッケージ、課金、Web/API、build、公開asset、担当台帳）は別実行ですべて成功。

### 2026-11-22 組み合わせAgentの追加
本人の追加指示により `combination-*`、専用Worker、公開Noah導線と対応試験を追加。実bot/口座開設案件から始め、根拠付き組み合わせを共通評価する。正本 `docs/services/noah-revenue-combinations.md`。金融の取引実行は対象外。提携・媒体・成果地点の未確認を有効化しない。

- 独立Worker `noah-revenue-agents` 版 `db87b9fb-a943-453d-8cbc-fb2a4f63eaf3`。3件の準備ガイド、初回alarm、無認証401、正式紹介0を実確認。MCPとHTTPは同じ判定。
- Noah版187、source `d7627702d305655da7c511c9f22c2c9411da0433` に一覧/個別共有/準備票を公開。既存Noahの最新ホーム・他の変更を維持。
- 6時間のASP読取を既存Chromeチャットへ設定。初回確認はログイン画面のため未取得、0件としての投入はなし。実承認・銀行入金は未受入。
- Chromeで公開Noah一覧→詳細→匿名準備票を実操作。比較入力・未チェックでも準備資料が返り、条件不適合時の紹介URLなし。ログイン要求なし、未知IDは404画面。
- 組み合わせ7試験成功（実Worker/SQLite、MCP、停止、永続復旧、重複、帰属、条件失効、候補作成）。Sites型検査・build成功。
- `PATH=/opt/homebrew/opt/openssl@3/bin:$PATH npm run verify` 全チェーン成功。Node試験4,801件中4,797成功・4 skip・失敗0。最後の停止表示修正は専用7試験とoxlintで再検証。標準PATHでは署名試験がOpenSSL 3不足で停止したため、既設OpenSSL 3を選択して実行。

### 2026-11-22 登録済み媒体経由の紹介を開始（PR #374）
- Chrome再ログイン後に現行の提携状態・掲載条件・媒体別HTTPSタグを確認。登録済みブログへ記事を公開し、正式タグのURL/rel/targetを原文と照合した。新規媒体の申請は行っていない。
- `registeredArticle` を追加し、Noah自身の媒体未承認を維持したまま登録記事へ案内。媒体origin/サイトID/原文タグ確認/証拠/期限を検査。追跡パラメーター追加は既定で無効。ASP取得は案件名と媒体IDの両方で抽出。
- 公開Noah→法人相談→登録記事をChromeで実操作。希望しない相談には紹介なし。qa-launchの動作確認を実申込・成果に扱わず、ASPフォーム送信は未実施。
- Workerコード版 `1d7623e2-a10b-473d-bf24-0d1ad69ab379` を配備し秘密設定を更新。11月22日02:31 UTCの注文/承認/支払の実取得を本番保存。対象成果0・支払明細0。run32で紹介running、取得observed、銀行needs_connectionを確認。
- 既存6時間追跡はACTIVE。実画面で同じ提携・条件・原文タグを確認できた場合だけ7日の有効期限を更新する。条件相違は停止、認証切れは延長しない。Mac稼働・Chromeログインに依存するため、常時クラウドだけで完結とは呼ばない。
- 関連14試験成功（実Worker/SQLiteの相談→登録記事、媒体不一致、タグ改変防止、別媒体除外、成果/入金照合）。全体verifyの結果は本PRに記録。
- 未完了: 実顧客の申込/広告主承認、銀行接続、支払明細の実発生時対応。金融等の未提携組み合わせは準備のみ。紹介開始と報酬獲得は分ける。
- 全体verifyはNode 4,802件中4,795成功・3失敗・4 skipで停止。対象外のmiiブラウザ試験にChrome起動ポート/画面待機の失敗があり、当該2ファイルを `--test-concurrency=1` で再実行すると5件すべて成功。テスト削除・待ち時間緩和・対象外実装の変更はなし。一括verify成功とは扱わない。
- 公開後のalarmを実確認: run32（02:32:55 UTC）からrun33（02:47:55 UTC）へ操作なしで進み、紹介runningを維持。次回03:02:55 UTC。Chromeの6時間取得の次回成功とは区別する。
- Node試験より後のverify全チェーンを別実行し、パッケージ・課金・公開Web・本番build・asset・API（1,918 assertions）・担当台帳まで成功。ログはGit外へ保存。

## 2026-11-22 収集担当との統合（作業中）
本人の継続指示により revenue-* の定期一覧取得、非公開提携案件索引、候補の照合・証拠ゲート・公開状態・取得履歴と試験を追加。provider/Work実行は収集担当の契約を再利用し、独自の実行権限を作らない。登録済み法人MCPを最初の稼働先とする。未知の組み合わせは要確認、承認額は既存ASP台帳の実観測のみ。

統合の編集範囲に `lib/noah-revenue-*`、共通directoryの自社レーン、`app/api/noah/revenue/catalog` を追加。外部Registryを偽装せず、固定公開ゲートを通った自社Agentだけを本人scope/Workの既存providerへ渡す。収集担当とのhandoffでproviderは別担当と合意。

### 2026-11-22 PR #8 本番照合の受入
- 収集担当とprovider/Workと紹介Workerの編集責任・接続契約を共有。最新main #6を統合し、同時期の計算配置task101と本タスクを索引で区別した。
- 旧Cloudflareアカウントへの再認証後、既存revenue Worker版146075e8-ab58-4330-b46c-2d9fa6492738を更新。所有者口へ3,224件の提携済み索引を投入し、完全な1,763件の公開Agent世代と用途照合を実行。8万件超の用途一致は候補であり承認/実行済みとは扱わない。公開ゲートを通した既存自社法人相談は1件。
- Chromeの認証済み注文/承認/支払を再取得して旧businessへ保存。対象成果0件・支払0件、別媒体の否認3件は対象外。既存6時間自動取得の処理先を統合worktreeへ更新し、target chatとACTIVEを保持。
- 本人が一度新アカウントへの移設を選択した後、旧アカウント継続へ訂正。新アカウントの空Workerは配置済みだが紹介を無効化し、台帳/Noah URLは移設しなかった。旧Workerのaccount_idを固定。
- 関連試験は成功。初回全体verifyのMini依存1件は正しいnpm ci後に成功、main追加依存も同期。最終全体verify/共通Noah実行/次回alarmは続けて受入中。

- mainのprovider PR #7（bb2e44e34）を統合し、レビュー済み自社レーン→固定MCPのresolver結線を追加。実business Workerを模擬環境で呼び、匿名準備票→共通SQLite Work→再読込→他所有者拒否→同じ依頼の非再実行まで検証。関連21試験成功。
- 主要Node試験5,121件の失敗0（5skip）。後続coconala依存を正しいnpm ciで同期して単独成功、残る全検証工程は別実行でbuild・asset・API1,918・CSV385・担当台帳まで成功。一括実行成功とは区別する。
- 本番Workerを用途索引照合・日本語の保存サイズ上限に対応した版e21be6e1-a4c2-4503-96f1-c13243b31604へ更新。既存の索引/完全世代/台帳を保持。

### 2026-11-22 PR #8 統合版の本番受入
- 最終head e429e5f1eの全CI成功。npm run verifyは主要5,133件（5,129成功・4skip・失敗0）、build、仕事API1,918、CSV385を含め成功。main 6de808de76f37f9a684484a58d0f4a164289c4a5へマージ。
- Sites206を同一treeで公開。共通一覧の自社法人AgentからChromeで接続→相談票作成→保存/成果一覧→同じWorkの再表示・reload保持を確認。模擬業務・qa-integration・相談希望falseで検証し、広告主への申込や承認報酬は発生させていない。
- 本番の一括catalog APIは1,764件（自社1件を含む）。非公開の提携索引は3,224件。用途候補は個別実行・媒体根拠を満たすまで公開しない。
- 法人実行器の非公開案件IDと提携索引の一致を公開条件に追加。旧business版9452e4b6、revenue版e6b8d25cで一致と私有ID非露出を確認。12:16UTCの手動同期後12:31UTC、最終更新後も12:46UTCに自動alarmの更新を実測。
- 6時間ごとのASP読取は既存のACTIVE自動処理を維持。24時間以上経過した回は全案件を再取得して総数・重複を検証して索引を更新する。Mac/Chromeの利用可能性に依存し、次回成功は未確認。
- 実成果・承認・支払は0件。銀行接続、実顧客の申込と広告主承認、実入金の通し受入は引き続き未完了。
- 公開MCPの保存説明は、提供元の本文非保存とNoahの依頼・成果保存を区別する。
- 独立したChrome 157 / 390px・タッチ試験でも、一覧検索→使う→実行→保存→reload→保存一覧から同一Work再表示が成功。外部遷移0・申込なし。証拠はGit外の `work/noah-production-qa-20261122/revenue-production-mobile/report.json`。Sites206のtreeは `2e0f4eafec9915b274074f79e1296346b4e7a7d3`。
- 保存範囲の補正文言を既存business Worker版 `5ae9e805-5917-4db3-9ef4-c181753c277b` へ配備し、公開MCP tools/listで提供元とNoahの保存説明を確認。実行schema・紹介判定・台帳は変更なし。

## 2026-11-22 追加の提携案件との実行連携（作業中）
既存combination Workerへ公開サイト診断2種を追加。編集範囲はsite-diagnostics関連、既存combination/revenueの公開と台帳、lib/noah-revenue-directoryとDirectoryEntryの固定型、試験/記録。provider/Workの本体は変更しない。合格条件はdocs/services/noah-site-diagnostics.md。実条件/正式タグ/外部診断の証拠はGit外。

- 追加2種の実MCP呼出しを本人の公開サイトで確認。提携・条件・媒体用原文タグとブログ公開2件をChromeで検証。関連48試験・型検査・Worker dry-run成功。現在は旧Workerの配備と共通Noahへの反映を受入中。実注文/承認は追加対象0件。統合担当がこのコミットを取り込んだ版で全体verifyとPR番号を記録する。

## 2026-11-22 全チャット差分の統合検証（PR #12）

- [PR #12](https://github.com/iceiceice999/rock/pull/12)でCLI `9f888cc36`、公開サイト診断 `e88bab58d` と、mainに入ったココナラ `9bd709013`・Pixel受入記録を統合。追記文書は両側を保持。
- 統合 `7c543a79d` の `PATH=/opt/homebrew/opt/openssl@3/bin:$PATH npm run verify` が全工程成功。主要5,155成功・5skip・失敗0、仕事API1,918、CSV385。型検査・lint・ビルド・資産欠落0も成功。後続mainマージ `49fc3cd2f` は同一tree。GitHubの最終検査結果とマージSHAはPRに記録する。
- CLI本番配備・実モデル受入、共通Noah画面での追加診断受入は別工程。検査成功を本番実行・実注文・承認・入金の成功として扱わない。

## 2026-11-22 公開サイト診断2種の本番受入（PR #14）

- PR #12のmain `0e7042d605df7ef0b862c0be470af4c3f6148716` をSites208へ公開。Sites source `b19148f05060af3cfd698092a2ae5081eb42f234` とtree `47dec6d3cb778d25c454c9a7b49cb477305c128a` が一致。既存法人Agentを含む公開API3件を確認。
- 旧combination Worker最終版 `d4e5d292-5ea8-43f9-94ba-43b84b02b094`。新D1 migration・新規契約・アカウント移設なし。ECの判定区分保持、公開時刻の通信差による除外、共通成果が番号だけになる表示を補正。固定接続・公開条件・媒体タグの制限を維持。
- WordPressとECを別担当のChrome390pxで、検索→使う→外部診断→読める診断本文/準備事項→保存→reload→保存一覧から同一Work再表示まで確認。入力は本人の公開サイト `https://avoado.si/`、相談希望false。広告主への申込なし。WPはタッチ・横溢れなし・JS例外なしも確認。
- Git外の証拠: WPは `work/noah-production-qa-20261122/site-diagnostics-mobile/report.json` と `wordpress-result.png`。ECは `work/noah-affiliate-delivery-20261122/expansion-noah-ec-acceptance.private.json` と `expansion-noah-ec-result.jpg`。失敗した初回の表示記録も保全し、既存Workを書き換えない。
- 登録済みブログへ広告を明示した2記事を公開。原文広告のURL・rel・targetを照合。WordPressは `/archives/15895863.html`、ECは `/archives/15895910.html`（いずれも `kirin8038.livedoor.blog`）。正式タグ・案件条件・報酬単価はGit外。
- レントラックスの365日・全状態の注文/承認をChromeで取得し、追加2件を含む8観測を台帳へ保存。追加案件の実注文・承認は0件。媒体集計を個別Noah利用者へ推測帰属せず、入金済みに昇格しない。
- 自動alarmが手動実行なしで13:52→14:07 UTC、runCount73→74へ進み、lastError=null・追加2件readyを実測。既存6時間のASP取得を2件へ拡張。次回6時間取得の成功は未確認で、Mac/Chromeの稼働・ログインに依存する。
- 関連49試験、型検査、lint、ビルド、既存基準の全体verifyを実施。時刻補正は応答が100ms後となる再現、表示補正は実WorkerのMCP応答を共通成果表示へ渡して診断・準備・広告導線が残る試験を含む。最終PRの検証結果はPR本文に記録する。
- 未完了: 実顧客の申込・広告主承認・銀行入金の通し受入。公開や診断成功は報酬獲得を意味しない。残る候補は個別実行・媒体・現行条件の根拠が揃うまで公開しない。

## 2026-11-23 集客の実行と改善

本人指示「公開して終わりじゃなくて、実際に人を集めて申込・成果承認が出るところまで」に対応。

- 既存WP/EC記事を公開更新。検索意図に合わせたタイトル、冒頭の対象Agent入口、4/5項目のチェックリスト、依頼メモ、公式出典を追加。正式広告のhref/rel/targetは公開DOMで一致確認。
- 自社X [紹介投稿](https://x.com/evesi_/status/2124518969063485728) を2026-11-23 00:02 JSTに公開。2記事へのリンクと広告表記を確認。表示1件は自己確認を含み、実顧客流入とは呼ばない。
- `/start/wordpress-maintenance` と `/start/ec-production` は公開ゲートを通った固定Noahカードにのみ302。経路blog/x/other・UTC日付別のブラウザ遷移要求を30日分集計。IP/URL/個人識別子なし。人数・注文とは区別。HEADとprefetchは非加算、任意リダイレクトなし。停止で503、再起動後保持を試験。
- 旧Worker version `3072171e-0958-4b18-aabc-1a4b148ed9d2` に配備し、公開記事から各カードへの遷移と各1件の記録を実確認（全てQA）。共有Sites209は再配備していない。配備後のalarmはrunCount 77→78、2026-11-22T15:07:35.507Zに自動進行し、入口2件とQA集計の保持を確認した。
- 既存heartbeat `noah` を6時間の集客改善・実成果・承認追跡へ更新。通常投稿は24時間に最大1回、JST9–21時、重複確認/台帳記録、本文改善は1日1点。広告費0。実申込の自動生成・DM送信なし。
- 証拠は非公開work/noah-affiliate-delivery-20261122の `growth-articles.private.json`、`growth-journal.private.json`、`growth-after-status.private.json` と `growth-*.jpg`。運営鍵・広告タグはGitへ含めない。
- 未完了: Rentracksは現在ログイン切れで新しい成果取得は未実施。最後の実ASP観測2026-11-22T13:50:26.830Zは2件とも注文/承認0。次回自動実行の成功、実顧客獲得、申込、広告主承認をまだ実証していない。ログイン依頼済み。古い0を現在の結果とみなさない。
- 検証: 関連10試験成功。全体verifyは未変更eve-smith-mii-browserのtimeoutで初回失敗し単独2試験成功。全体verifyの再実行が全工程成功（主要5,164 pass / 5 skip / 0 fail、API1,918、CSV385、build等）。
