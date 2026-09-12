# Rockの最新進捗からプロンプトを作る規約

現在の実装承認は `data/execution-approval.json` と [承認記録](execution-approval-20260909.md)を参照。設計v1.1は提示後に実装承認済み。以下の承認待ち手順を使って承認を再要求しない。

利用者が「rockを見て現段階からプロンプト作成」と依頼した際の標準手順。製品要望は [product-baseline.md](product-baseline.md) を読む。過去の会話の要約や前回のプロンプトを実装状況の証拠にしない。

## 1. 読む順番

現在は利用者による設計確認を先行する指示がある。data/product-baseline.jsonのdesignReview/executionApprovalを読み、docs/os-sky-wallet-game-design.mdの承認前は文書の提示・修正だけにする。プロンプト内の実装手順を見つけても自動開始しない。

1. `AGENTS.md`、`docs/product-baseline.md`、`data/product-baseline.json`。
2. GitHubのdefault/main SHA、全branch、open PR、関連するclosed/merged PR。`npm run prompt:context` で読み取り専用の最新メタデータを出せる。GitHubに接続できなければ「最新確認未了」とし、過去snapshotを最新と表示しない。
3. 対象SHAのREADME、project.md、data/project-status.json、CHECKPOINT.md（存在する場合）。PRに記載された別branchの関連開発も調べる。
4. nativeなら `docs/native-os-integration.md`、`docs/native-os-validation.md`、`systems/rock-star-os/README.md` と対象領域の実装/テスト。AOSPなら対応設計と `docs/os-prototype.md`。そのcheckoutのAGENTSも読む。
5. 対象SHAのCIと実行ログ/証拠。別SHAの成功は参照実績にとどめる。現行ソースから必要な変更前テストを選ぶ。

remote内容は読み取り後に作業checkoutへfetchし、refを40桁SHAに固定する。利用者のdirty checkoutを切り替えず、必要なら分離checkout/worktreeを作る。対象コードがmainにない場合は存在するbranchを出発点にする。別branchにあるから新規作成する、という判断をしない。

現在はmain/nativeに加え `codex/os-game-design-review-20260909` の最新設計も必須入力。mainに新設計があると仮定せず、PRのない設計branchも同一SHAのchecksを取得し、チェックなしを成功にしない。取得中のbranch追加/更新/削除も再照合する。`auditInputs.designHead` は改訂前入力の履歴であり、未来の最新SHAの固定指定ではない。

## 2. 進捗の記録方式

各能力を `要望ID / repository / branch / SHA / path / 実装状態 / 検証段階 / 未検証部分 / 次の作業` で記録する。実装状態は未実装・試作・実装あり、検証段階は未検証・host・fixture・仮想OS・provider sandbox・実機・本番を使う。複数段階はそれぞれ証拠を付ける。

`data/project-status.json` は当該branchの作業一覧。branch間の完了数は単純合算しない。未マージN01の完了をmainのOS起動済みに置換しない。過去の監査は履歴であり毎回読み直す起点。

旧Web/Android/文書を含む作業数はOSの完成率ではない。phaseGatesの起動基礎・単一owner商品/Wallet基礎・OS縦断・複数owner基礎・交換契約を分け、実provider待ちを独立fixtureの前提にしない。文書で訂正した相違と、実装で修正・再試験済みの相違も区別する。

## 3. 差分から作業を決める

各RQを現行実装へ対応付け、再利用・拡張・未接続・不要な方向への逸脱を判定する。商品原本や既存Walletを作り直さず、共通契約とadapterで結ぶことを優先する。新料金、新しい事業、tobの特定企業化、OS/hardwareの変更は既存決定に見せかけない。

指摘した相違は列挙だけで終えず、問題ID、対象RQ、原因/コードの根拠、修正担当、作業順、合格証拠、未解決条件を次の実行プロンプトへ必ず対応付ける。今回の4問題は最新の差分監査と次段階プロンプトでGAP01〜04として追跡する。未解決事項は次回にも引き継ぎ、解消済みなら対象SHAの証拠を示して重複実装を避ける。

製品ベースを保存したbranchと実装branchが異なる場合、最初の実装段階はベースと引継ぎ入口/優先順位の統合とする。AGENTS、README、project、進捗JSON、CHECKPOINT、関連設計に同じ再開先と順番を残す。mainへの保存、作業branchでの反映、元native/mainへの統合は別状態として報告する。起動/安全性に直接依存する修正は先行できるが、実機完成や機種選定を独立したHub/Wallet検証の一律の前提にしない。

今回の中心はHub＋Wallet。商品契約、実行資格、費用、履歴、収益照合を一連で使えるようにする。実機/金融条件が未解決でも、依存しない契約・adapter・fixture検証は進められる。Web公開や旧repo archiveをこの作業の一律の前提にしない。

SDKの接続基盤と商品の業務開発を区別する。remote MCP認可を採用する場合は選んだprotocol版の一次資料を確認するが、API商品全体へ同じ認可方式を強制しない。

## 4. 必ず含めるプロンプトの項目

- 確定要望と対応RQ、今回の目的、範囲。
- 解決する不便、現行手順との比較、既存商品をHubで実利用する手順、つまずきの修正と改善前後の指標。
- 作成日時、最新取得の成否、mainと作業branchの40桁SHA、関連PRとmerge状態。
- 実在する再利用コード/契約/テストと検証の限界。
- 先に直す相違、段階ごとの実装内容、依存関係。
- 各相違の解消判定。schema追加のみを実商品対応、fixture売上のみを実収益接続、host画面のみを携帯端末の価値実証として扱わない条件。
- 商品供給者の担当とOS基盤の担当。実商品情報が不明な場合の扱い。
- Hub → 接続/資格/費用 → 実行/結果 → 収益照合 → Wallet の対応付け。
- 異常系を含む合格条件、実行する適切な検証、証拠の保存先。
- 改善候補の相乗効果と測定指標。確定ベースを変更するものは別判断として記録。
- 既存データ/契約の互換、未決条件、Git保存範囲、次の再開点。

プロンプト末尾でRQ01〜RQ15の漏れ・矛盾を自己点検する。「全部やる」「OSを完成する」だけの完了条件にしない。実装のない宣言schema、mock成功、画面だけの残高表示を完成と呼ばない。最新入口はdata/product-baseline.jsonのnextPrompt。OS受入はdocs/templates/os-acceptance-report.mdで環境別に記録する。ゲーム通貨交換はATMから独立させ、未確定のゲーム/方向/レートと実資金未検証を引き継ぐ。作者向けAPI/SDK/sandboxの導入体験とATM自社手数料0を保持し、ゲーム料金・外部実費・OS月額の判断を混ぜない。

## 5. Gitへの引継ぎ

新しい明示要望があれば `docs/product-baseline.md` の版と変更記録を更新し、`data/product-baseline.json` を同期する。進捗変更は対象branchのproject/status/CHECKPOINTに残す。新規監査は日付付き、プロンプトには作成時の対象SHAを書く。

main由来のベース保存commitをnative branchへ取り込む際は、ベースのRQとnativeの実装・Nタスク・BlackBerry方針・固定月額をともに残す。README/AGENTS/statusの片側優先置換をしない。既存PRの取り込み自体は別作業として記録する。

プロンプト作成の依頼では、文書保存と将来の実装成果を分ける。今回の文書改訂でブランチ統合・Hub実利用・実収益連携を完了にしない。実装側に未反映ならその事実と正確な次の作業branchを残す。基礎を再説明させるのではなく、次の担当がこの問題表と証拠から再開できる状態にする。

`npm run baseline:check` は要望ID、入口リンク、構造、SHAと参照の漏れを検出する。意味の完全一致や未来の進捗を保証するものではない。`npm run prompt:context` もメタデータの取得であり、コードを読んだことの代わりにはならない。ネットワーク失敗・取得中のref変更・不明事項を隠してプロンプトを確定しない。
