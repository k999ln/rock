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
