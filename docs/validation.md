# 検証記録

## Rock First-party Settlement Wallet / 2026-09-13

- `org.rockstar.settlement-wallet`を共通Financial Provider契約の第1号として追加。capabilityは`collect_platform_fee`と`reporting`、modeはSANDBOX、利用者資産保管・ファンド運用・LIVE回収はfalseへ固定した。
- `prepareRockFeeCollection`は署名検証済み収益から既存Workerが配分するRock利用料を入力とし、receipt IDに結び付いた同一instruction/idempotency keyを生成する。収益0は`not_required`、月累計888 cents超過、LIVE、未知field、非USDを拒否する。
- 新規4テストと製品baseline負例を含む`npm run verify`が終了コード0。Web 240 tests、Fashion Brand Ops 16 tests、release signing 64 tests、Worker/D1 API 143 assertions、project/repository/release/baseline/Sky/device、型、lint、MCP package、Billing Worker dry-run、本番build、Web bundle 120 component、asset 69参照・missing 0に成功した。
- この合格は自社利用料のsandbox指図契約まで。実収益の入金、Rockの実口座・実Wallet、利用者への払出し、外部Wallet／ファンド接続、利用者資産の保管、LIVE transferは未実施。

## 外部Wallet／ファンドProvider受け身設計 / 2026-09-13

- RQ34として、RockstarOSはcapability discovery、本人同意、指図、状態、receipt、照合だけを共通化し、保管、運用、約定、払出し、KYC/AML、地域・税務判断は外部Providerへ残す責任境界を固定した。
- `npm run baseline:check`と`tests/product-baseline.test.mjs`に成功。Providerによる内部台帳直接書込み、任意shell、未接続ProviderのLIVE表示、Rockによる未対応機能の擬似実装を許可する変更を拒否する。
- `npm run project:update`後の`npm run project:check`は62/86件で整合。`npm run build`、Web bundle 120 componentの照合、Web asset 69参照・missing 0、MCP配布package一致に成功した。
- `npm run verify`はrelease、baseline、Sky、device、型、lintまで成功後、既存`tests/everything-market.test.mjs`がassertion成功後も終了しないため手動中断した。変更対象テストは単独で終了コード0。並行時に不安定だった既存client/device 2テストも単独24件で全成功した。したがって全体verify完走は未確認として残す。
- この検証は設計・機械可読契約・build整合の確認であり、外部Provider選定、契約、sandbox接続、実資金、LIVEファンド運用を行っていない。

## QEMU rc2配布要件とnative SBOM境界の機械固定 / 2026-09-12

- `scripts/check-release-signing.mjs` で、候補準備15件、owner legal approval 11件、保護署名29件、本人署名9件の計64公開fixture試験を `npm run verify` に統合。各suiteの試験数も固定し、試験の削除を成功扱いにしない。本人署名は未暗号化／ExFAT／別mountの保管先を鍵読取り前に拒否する。実production鍵・owner承認・隔離環境・実候補署名・署名後受入は未実施のまま分離した。
- rc2のversion、source commit、archive名・size・SHA-256を、受入結果、434,523件inventory、公開表示データと照合する `data/qemu-release-audit.json` を追加。SHA-256一致を確認した1,003,224,286 byteのrc2 archiveから同梱legal bundleを抽出し、10必須要件のうち6件を範囲付きPASS、4件をBLOCKEDとした。
- QEMU auditと全体公開台帳は同じgate ID・必須状態・statusを要求する。archive SHAの改変、要件数のずれ、未達のnext action欠落、license/production署名より先の最終受入合格を自動拒否する。
- current rc2同梱のBuildroot `manifest.csv` 24 target packageと `host-manifest.csv` 37 build dependencyをrepositoryへ証拠保存。CSV SHA-256、component数、同梱legal bundle SHA-256 `ad6453…3d94`、配布archive SHA-256を自動照合し、CycloneDX 1.6へ変換する。componentごとのscope、source archive/site、license fileを保持し、自作3 componentのlicense未選択を消さない。
- `npm run release:sbom` はWeb/npm 854 component、current rc2 native 61 component、旧native 61 componentを別のignored fileへ生成する。旧native inventoryをrc2のcurrent SBOMへ差し替える負例、current manifest hash改変、正確なarchive hashとscopeを含むrelease tests 12件を通した。
- GitHubのrc2 Draft Releaseから1,003,224,286 byteのarchive本体を取得し、SHA-256 `5ce072…e95e`を照合後、legal bundleだけを展開してmanifestを保存した。Draft公開状態は変更していない。部品表完成は製品license clearanceではない。
- `npm run verify` は終了コード0。公開台帳・QEMU audit・製品ベース・repository・端末対応、型、lint、Web 175 tests、Fashion Brand Ops 15 tests、MCP package、Billing Worker dry-run、production build、仕事API 143 assertionsが成功した。物理端末、実資金、一般公開、正式鍵生成は実施していない。

## 設計v1.1と実装の再照合・進捗補助の修正 / 2026-09-09

- 16:51 UTCの3branch監査に加え、修正した `npm run prompt:context` を17:07 UTCにオンライン実行。main/native/reviewのSHAは監査入力と一致し、reviewのcheck-run 0は `NO_CHECKS / allSuccessful:false`。全branchとopen PRの再照合にも成功。これはメタデータ取得でありsourceレビュー済みを自動宣言しない。
- ALIGN01〜05を監査・設計v1.1・実行プロンプト・受入雛形・進捗へ反映。GX00の単一owner→複数player境界、backup試験入口の新旧形式、台帳変更と旧OS互換、段階依存を訂正。既存native sourceを読み取り確認したがruntimeを修正・試験したわけではない。
- 追加18テストで、PRなしbranchのchecks取得対象、ref順序/変更/削除、チェックなし/未完了の非成功、段階ゲートの参照/重複/循環/完了根拠/旧形式互換を検証。ベース検査にも設計入力SHA欠落と未承認市場の実装許可化を拒否する負例を追加。
- 最初の全体verifyは新テスト18箇所のPromise記述をlintが拒否。既存の記述規則に合わせて明示的なvoidを付け、条件を弱めず再実行。
- 再実行した `npm run verify` は終了コード0。project/repository/baseline、型、製品lint、53 unit tests（fail/skip 0）、既存Web build、合成ローカルAPI143 assertionsが成功。既知のVite configLoader/Node module API警告は残る。ブラウザQA・native新image・実機の試験ではない。
- 利用者の市場案とGTA補足は、公式一次資料を調べた検討メモへ分離。自動化で人の挑戦を増やす目的を設計に明記し、特定ゲームの未確認機能・通貨値上がり・実資金運営を確定しない。
- 今回変更は文書/進捗取得・検査補助のみ。native checkoutはcleanのまま、SSD/VM再起動なし。main/nativeのmerge、実ゲーム/SDK実装、実課金/送金/ATM/実機/公開なし。設計承認待ちを維持する。

## OS稼働受入・ゲーム作者向けWallet・ATM手数料のプロンプト / 2026-09-09

- GitHub 16:09 UTCのmain `7cdbb5fedc86ee3978ed329d9312147d137c9199`、native `fcedcfec4dd2a242a1ba8fd7ff5eebba97b8ecd5`、PR #1 OPEN、同SHAの各CI成功を取得しfetchで一致を確認。監査は `docs/os-readiness-audit-20260909.md`。
- RQ12〜15、OS受入のNOT_RUN雛形、実行プロンプト、進捗入口を保存。手数料0の対象は利用者の補足どおりATM。ゲーム料金を無料とも有料とも確定せず、既存OS月額を保持。新しい「OS内にgame要素を入れるとどうなるか」は相談として扱い、全OSのゲーム化を確定仕様にしていない。
- 別担当がOS不足/Wallet・ATM・ゲーム境界と最終文書を読み取り確認。逆交換の確定消費と原資のWallet側確認、ゲーム作者のmint権限禁止、復元時の同一authority単一writer、2gameの分離を補強した。
- `npm run verify` 終了コード0。project/repository/baseline整合、型、製品lint、35 unit tests、build、ローカルAPI143 assertionsに成功。既知のVite configLoaderとNode module API警告は残る。本番サイトを公開せず、合成ローカルAPIのみ。
- ベース検査にRQ12〜15・受入雛形・ATM手数料0・ATM非依存を追加。欠落、手数料の非0化、ATM必須化を拒否する負例も同じ既存テストへ追加し成功。構造検査は意味の完全一致やOS安全性の証明ではない。
- native runtime/新imageのbuild/boot・ゲーム/SDK実装・物理ATM・実資金・実機は今回未実施。SSDを再接続/再マウントしていない。D01は文書成果だけの完了で、V01/GX01/GX02/DX01、既存B/Nの未完了を解消したとはしない。
- 続く利用者の「設計書を確認してから実行」に従い、設計書v1.0と全入口へ承認待ちを追記。Game入口/達成演出を提案として提示し、同意前に実装しない。設計書追加後もproject/baseline/対象テストで入口を検証する。

## 相違解消プロンプトの改訂 / 2026-09-09

- 15:01 UTCのGitHub取得でmain `f9b1cbd99eeaa20f7cbc80bd2d88909949cca863`、native `fcedcfec4dd2a242a1ba8fd7ff5eebba97b8ecd5`、OPENのPR #1と同SHAのCI成功を確認。[追補監査](progress-audit-20260909-followup.md)へ入力と限界を保存した。
- GAP01〜04を修正順・担当・合格証拠・未解決条件へ対応付けた。引継ぎ統合を段階0/B04、既存商品実利用と商品条件を段階1〜2/B02、Walletを段階3/B03、最終比較を段階4/B05に分離した。作業branchへの反映と元native/mainへの反映、schemaと実接続、fixtureと実収益、host画面と携帯実機価値を混同しない条件を追加。
- 別担当の読み取りレビューで、4問題の対応と権限境界を確認。PC商品のpathを正し、B02→B03→最終比較の依存が循環しないようB05を分離した。B03の台帳/fixture基礎が通れば、実サービス待ちでも比較へ進めるが、実収益の未接続は未解決に残す。
- `npm run verify` は型、製品lint、35テスト、buildまで成功後、sandbox内API待受でEPERM。許可されたローカル通信でverify全体を再実行し、終了コード0、API143 assertions成功。既存Vite configLoader/Node module APIの警告は残る。
- 本改訂は文書と進捗のみ。既存商品・OS/Hub/Wallet runtimeは変更せず、native統合、Hub操作、実サービス接続、実機・本番は未実施。B04/B02/B03/B05をplannedのまま保持し、完了数を製品完成率に変換しない。

## 製品ベース・進捗からのプロンプト作成 / 2026-09-09

- main `5cec83478fe97bf272869298160a572ef7fcefee` とPR #1/native `fcedcfec4dd2a242a1ba8fd7ff5eebba97b8ecd5` をGitHubで確認。PRはOPEN。HEAD一致のWeb/native/Android CIがsuccessであることをAPIで読み戻した。監査対象と限界は [差分監査](progress-audit-20260909.md) に固定した。
- 利用者要望を [製品ベース](product-baseline.md) のRQ01〜RQ11に整理し、AGENTSと既存設計の入口を更新。Hub＋Wallet、tobの商品供給、実行/料金/権利の独立軸、既存商品のHub実利用、利用者の不便の比較を次のプロンプトへ保存した。native実装や既存料金の再実装/廃止は指示していない。
- `npm run verify` 成功。進捗/repository/製品ベース、型、製品lint、35テスト、build、API143 assertions。sandbox内では最後のAPI待受がEPERMとなり、許可されたローカル通信でverify全体を再実行して終了コード0。既存Vite configLoaderとNode module APIの警告は残る。
- 追加したベース検査はRQ欠落、監査snapshotの最新扱い、SHA不一致、repository外参照、AGENTS入口欠落を拒否する。最終の供給元未確定表現への修正後も対象テストとlintを再実行した。
- `npm run prompt:context` のonline実行でGitHubのmain/全branch/open PR/同SHA checksを取得。mainとPR headを再取得して取得中の変更も検知する。offline実行は `liveMetadataVerified:false`、ネットワーク失敗時は終了コード2で、最新成功に見せかけない。出力はメタデータで、sourceReviewCompleteはfalseのまま。実装コードの確認を別途必須にする。
- 別担当の読み取りレビューで、native実装根拠と会話要望の整合を確認。remote/local Walletの正本構成、合成取引の範囲、供給元の独占性未確定、PCツールpathを明確化した。
- 今回のOS/Hub runtime、商品コード、Wallet資金処理は変更していない。新しいHub操作、不便の比較測定、OS起動、実PC/USB/BlackBerry、実金融・本番公開は未実施。これらはB02/B03とnative側の各受入条件へ残した。

## Gitプロジェクト統合 / 2026-09-07

- `rock` commit `9e4dc89d995ccbf11f9e3a15efa0e65868874d48`と、非公開`Mr.` commit `a82a728`のtracked blobを比較。完全一致するpath組は78件で、主にUI boilerplate、既存4ツールの固定原本、MIT licenseだった。
- 製品正本を`k999ln/rock`の1件、`k999ln/Mr.`を非公開運用component、`k999ln/vvvv`を新規作業禁止の旧履歴、`k999ln/mr-bot-workrooms`を非正本の成果物置場として [`repository-map.json`](../data/repository-map.json) に固定した。
- `npm run repository:check`に成功。active sourceに`github.com/k999ln/vvvv`がないこと、`vendor/mr/provenance.json`の取得元/commitと4原本のGit blob SHA/SHA-256が一致することを確認した。
- `npm run verify`は進捗同期、repository境界、型、対象lint、34テスト、本番buildまで成功。最後のAPI試験だけsandboxのloopback待受が`EPERM`になったため、同じ`npm run test:api`を許可されたローカル通信で再実行し143 assertionsに成功した。
- 整理commit [`42371f0`](https://github.com/k999ln/rock/commit/42371f0cea0a2e1fd1abab25fee078d6a07b1f59)をrock/mainへ保存し、[Rock star verification / 34170597685](https://github.com/k999ln/rock/actions/runs/34170597685)が成功した。非公開`Mr.`にもoperations componentの境界をcommit `c7ecead`として保存した。
- GitHub descriptionを読み戻し、`rock`はpublic/product SSOT、`Mr.`はprivate operations、`vvvv`はprivate/legacy・archive待ちと一致することを確認した。
- 非公開のTelegram、provider、account registry、顧客情報、receipt、deployment設定は公開`rock`へ移していない。`Mr.`のDocker applianceをAOSP OSとして統合・完了扱いしていない。
- GitHub repositoryのarchive/削除、visibility変更、branch/historyの強制更新、稼働deployment・scheduler・siteの切替は未実施。`vvvv`は外部の稼働参照を監査した後にarchive可否を判断する。

## Rock star OS P1 実装 / 2026-09-05

- 共通JavaコアをTemurin17/Gradle8.11.1でコンパイルし、実SQLiteの16テストに成功。2工程/再起動後の再開、同時claim、冪等受付、古いtoken/期限切れ結果の拒否、3回までの再試行、停止/中止/人の再試行、sample非通過、transaction失敗時のrollback、改変成果物、未知DB版を含む。
- 合成fixture12件に対し、Javaと既存TypeScriptの出典整理/無料版/2工程接続を36項目で照合し一致。全入力の同値保証ではない。
- OS契約の静的検査を追加した後、既存Web/PCの `npm run verify` は34テスト・API143 assertions・進捗同期・型/lint/buildに成功。ローカルAPIとGradleはsandboxの通信制限で一度起動できず、承認されたローカル通信権限で再実行した。製品の検査条件は変更していない。
- 初期のGradle再実行は外付けExFATの生成物削除で失敗。ソースを削除せず、`rockBuildRoot` で一時APFSへ生成先を分離して16テストを再実行した。
- Java/Gradleは公式配布のチェックサムを照合し、一時領域へ展開。グローバルインストール、OS署名鍵の生成、Android端末への導入/初期化/書込は実施していない。
- AOSPのr4 manifest commit、Cuttlefish製品継承先、aosp_current→bp4aのrelease aliasを公式Gitで確認した。ただしSoongのbuild/OS起動は未実施。
- `os:host` はLinux/x86-64/RAM/空き容量/KVMが条件を満たさず終了コード2となることを確認。機材を購入/契約せず、OS02〜05を完了扱いしない。
- 2APKのbuild/lint、SDK契約4テスト、コア/照合は[Android CI](https://github.com/k999ln/rock/actions/runs/33982158631)で成功。続く[エミュレーター試験](https://github.com/k999ln/rock/actions/runs/33982402787)は充電条件・権限設定が成功、記事Toolの処理が失敗した。Androidが拒否するJava SEの `UNICODE_CHARACTER_CLASS` フラグを使用していたため、起動時に対応を判定する修正を行った。[Android Pattern仕様](https://developer.android.com/reference/java/util/regex/Pattern)
- 修正commit `47043ad` の[Android CI](https://github.com/k999ln/rock/actions/runs/33982932964)は全工程成功。コア16・SDK4・Java↔TS照合36項目・2APK build/lintに加え、標準Android35上の接続2テストが成功した。実際の別APKをBinderで呼び、SQLite再接続後の次工程・成果物保存・同じ結果の二重拒否・空確認メモの拒否・本人確認後の完了を検証した。充電必須/永続周期ジョブの登録とINTERNET/RUN_TOOL権限設定も確認。UIを閉じた周期発火や本物の再起動を行った試験ではない。
- 同commitの[Web CI](https://github.com/k999ln/rock/actions/runs/33982933087)も34テスト・API143 assertions・型/lint/buildに成功。既存のファンド試算・料金・分配契約を維持。
- Soong専用manifestにはGradleが補うpackage/versionを明記し、それ以外の差分を `os:check` で拒否する。clean checkoutから生成したAOSP local manifestは実装commitの40桁SHAへ固定された。相対文書リンク72件、`git diff --check`、進捗同期も確認済み。これらはSoong build/bootの代替試験ではない。
- 初回Web CIで追加テストのPromiseの明示がなくlintに失敗し、`void test(...)` に修正。さらにOS検査の予約変数名を修正した。検査条件の緩和や失敗テストの除外はしていない。
- Binder否定試験・画面OFF・実電源断・実機の隔離/電池/OTAは未検証。既存Sitesは非公開設定・分岐・公開停止を維持。

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

## バックエンド追加の確認（2026-09-05）

- 自動テスト41件が成功。新たに、所有者の分離、同時実行枠、時間あたり上限、停止設定、期限切れ、終端状態の不変性、取消の整合性、DB失敗時のロールバック、完了報告の再送、入力本文の非送信を確認。
- 公開用WorkerとローカルD1で、認証なし401、異なるOrigin403、形式不正415、サイズ超過413、旧履歴API410を確認。
- 同じIDの同時作成は1件、同時開始は一方のみ成功、同時完了は履歴1件。別ユーザーによる読込・変更、PC解除後の接続報告、ツール停止後の実行を拒否。
- アプリの実行管理から、実際のローカルHTTP MCP接続・ping・出典整理・納品サンプル照合・D1への完了/履歴保存まで成功。原稿や成果物は合成データのみ。
- 公開先の管理情報がRock Starに変更されていたため、保存済みソースの一致で同じアプリと確認。PCパックの許可Originに現在の公開先を追加し、接続検証にも使用。
- スキーマ追加は新規5テーブルのみ。既存データを保持したローカル移行が成功。過去の適用済み移行ファイルは変更なし。
- 検証の対象は現在の固定4ツールと管理API。実ウォレット署名、売上取得、決済/分配、アプリ終了後の常駐実行、ブラウザのクリック・画面サイズ確認は未検証・未実装。

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
- The final installable app front has a direct home screen, four ready fund presets, one preparation-only preview, activity history, and settings. No fabricated balances, yields, participant totals, or paid gacha. Real tool completion and sample runs have distinct labels.
- PWA manifest, 192px/512px icons, and service worker endpoints return 200 locally. The app shell does not cache API responses or tool input.
- Browser screenshots/click QA were not requested and were not performed. Loopback HTTP was verified at protocol level; a browser may still require the user's initial local-network permission. WebMCP list_funds/select_fund is feature-detected; the stdio/HTTP MCP transport is the verified execution integration.
# 2026-09-12 — システム診断・暗号化端末設定バックアップ

- `/settings/system`をローカル実ブラウザで開き、通信、端末内保存、Web Crypto、Service Worker、RockstarOS API、PC Connectorの6項目が実測状態へ更新されることを確認した。確認時は5/6準備済みで、未接続のPC Connectorだけを注意表示した。
- 暗号化バックアップ画面を開き、パスフレーズ、除外対象、保存操作が画面内に収まることを確認した。
- `tests/system-backup.test.mjs`で、許可済みホーム設定だけの暗号化往復、平文非露出、無関係または将来追加される未許可localStorageの保持、誤パスフレーズ、改ざん、外部key混入の拒否に合格した。
- 制限外で`npm run verify`を実行し、Web 157 tests、Fashion Brand Ops 15 tests、Worker/D1 API 143 assertions、型、lint、製品ベース、MCP配布一致、Billing Worker dry-run、本番buildに合格した。通常sandboxではloopback待受がEPERMとなるため、MCP ConnectorとD1移行試験だけを含む全検証はローカル待受可能な環境で再実行した。
- 物理端末のBSP/bootloader/recovery、正式署名鍵、外部MCP・販売・決済・払出しProviderは未接続であり、この検証の合格範囲へ含めない。

# 2026-09-12 — 最低限のOS運用と公開審査gate

- `/settings/system`を実ブラウザで確認し、安全な接続、通知、永続保存、PWA表示を含む10項目が実測値へ更新され、「稼働できます」と利用可能数が分離表示されることを確認した。
- 通知テスト、保存保護、個人情報を除外する診断JSON、暗号化バックアップ、改ざん検知付き復元、Service Worker更新確認、確認付きホーム設定初期化を同じ画面へ配置した。初期化の確認Dialogを開閉し、アカウント、Wallet、実行履歴を削除しない説明を確認した。
- 公開条件の折り畳みを開き、Web/PWA、QEMU、Android CDD/CTS・GMS、物理端末/BSP、production署名、OSS/法令、マイナンバーを別gateとして表示することを確認した。未実施項目を合格表示していない。
- `tests/system-backup.test.mjs`で、許可済みホーム設定だけが初期化され、未知のRockstarOS keyと無関係なlocalStorage keyを保持することを確認した。
- 制限外で`npm run verify`を実行し、Web 163 tests、Fashion Brand Ops 15 tests、Worker/D1 API 143 assertions、型、lint、製品ベース、MCP配布一致、Billing Worker dry-run、本番buildに合格した。
- この確認はWeb/PWA Developer Previewの受入であり、Android CDD/CTS、Google Play/GMS、実機flash、production署名、無線機器認証、特定個人情報の取扱審査を完了した証拠ではない。

# 2026-09-12 — 配布方法別の最低条件・SBOM

- `data/release-readiness.json`で、本人限定Web/PWA、一般公開Web/PWA、QEMU配布、Android物理端末、iPhone/iPad client、マイナンバー連携の6対象を別判定する。本人限定Sitesの安全なaccessと最新版同期も別gateにし、現状の算出結果はready 0、blocked 6。
- `npm run release:check`で必須gate、根拠file、所有者license選択、top-level LICENSE、production鍵実施記録、マイナンバー無効化を検査した。未決条件をpassへ改変する否定試験5件に合格した。
- `package-lock.json`の887 package entryを検査し、license metadata欠落0。`npm run release:sbom`でCycloneDX 1.6、854 unique componentを`work/release/rockstaros-web.cdx.json`へ生成し、bom-refが854件すべて一意であることを確認した。lock SHA、17 license expressionと件数を別監査へ固定し、MPL/LGPL系41件、選択式5件、CC-BY表示1件の計47件をPURL（component名・version）単位で追加review対象に固定した。lock上は本番到達可能な必須7件・optional 11件、開発専用の必須4件・optional 25件である。分類隠蔽、component省略、本番到達性/optionality改変、lock差替えを拒否する4否定試験に合格した。このlock監査単独はWeb/npm package-lock scopeであり、実bundle同梱、義務履行、法的clearance、native Buildroot inventoryの代用ではない。
- Vite build pluginでclient 52 chunk／119 npm component、RSC 85 chunk／6 component、SSR 64 chunk／119 componentを記録し、環境間の重複を除くと120 componentだった。未解決node_modulesは0、package-lockの追加review 47 PURLとの生成bundle内一致は0。flat・scoped・nested lock path、review照合、未解決module、lock hash差替えの単体試験に合格した。出力はignored `work/release/`へ0600で置き、絶対module pathを公開しない。`npm run verify`はproduction build直後にこの検査を必須実行する。build tool自体の利用条件やlicense/NOTICE/source提供、製品license、法的clearanceは別gateのまま残す。
- 設定の公開準備は値を同じ台帳から導出し、本人限定Web/PWA 4/5、一般Web 3/5、QEMU 6/10、Android実機0/5、iPhone/iPad client 0/1、マイナンバー1/7を表示する。本人限定Sitesは安全なaccessを維持しているが、稼働version 29のsourceが監査HEADより古いため最新版同期gateを未達にする。過去QEMU候補を現在の配布可能状態として表示しない。
- `data/web-security-policy.json`、`next.config.ts`、static asset用`public/_headers`を同じ値へ結合し、全responseのCSP frame/object/form/base制限、COOP/CORP、no-referrer、HSTS、nosniff、DENY framing、camera/payment/USB等のbrowser capability無効化を3試験で固定した。最初の実測でWorkerが返す`/`とstatic assetの`/sw.js`にNext configのheaderが届かない差を検出し、両配信経路を分離して修正した。再build後、`npm run web:security:check -- http://127.0.0.1:8787`で`/`、`/sky`、Service Worker、manifest、3 install icon、実hash付きJSの8経路に8 universal headerと個別cache ruleが完全一致した。[ローカル実測](evidence/launch/web-security-local-20260913.json)。現在のSites v29はこのsourceより古いため、実Sites response headerの合格証拠にはせず、最新版配備後の本人認証済みreadbackを必須にした。
- Service Workerのinstall時`skipWaiting`を削除し、新版は利用者が「更新を適用」を押すまで待機する。適用時だけ専用messageで切替え、`controllerchange`確認後に再読込する。旧`loop-app-*`と現`rockstaros-shell-*`の古いgenerationだけを削除し、他product cacheを残す。API、sign-in/out、foreign originをcache handlerが横取りしない3試験に合格した。更新後のworker SHAを上記ローカル実測へ再結合した。
- PWA manifestへ固定`id`、root `scope`、`lang`、`dir`、related native appを優先しない指定を追加した。192/512 PNGを実寸検査し、Safariが推奨する1024角・全面不透明のmaskable SVGを別途追加した。source 2試験に加え、production HTTP上のmanifest値、3 iconの参照とContent-Typeを上記8経路で確認した。これはWeb appの導入条件でありApp Store native client審査の合格証拠ではない。
- ローカル待受が許可された環境で`npm run verify`を実行し、Web 202 tests、Fashion Brand Ops 15 tests、Worker/D1 API 143 assertions、型、lint、公開gate、製品baseline、MCP配布一致、Billing Worker dry-run、本番buildに合格した。`/settings/system`の実ブラウザ表示はconsole error 0、横切れなし、6対象の数値と台帳が一致した。
- 製品ライセンスの明示選択、production鍵の作成・保管、一般公開承認、実機/SKUと外部審査は所有者または外部authorityが必要であり、今回完了扱いにしていない。
