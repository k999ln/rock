## 未完了13件の最新開発入口（2026-10-23 / G04・OS10 / ROCK）

[統合開発プロンプト](../prompts/rockstaros-remaining-work-development.md)と[対応表](../../data/rockstaros-remaining-work-plan.json)へ進む。P01〜P13を既存taskと結び、eSIM・請求・Mini/Proを含む。main7304e449/branch951d82d5の669/3分岐とRoot/別Sourceを保全・照合し、最初に引継ぎ入口を同期する。ROCK実装と外部/本人/実機/本番の受入を分ける。作成時の検証は[証拠](../evidence/rockstaros-remaining-work-prompt.json)へ記録し、文書保存をruntime/main統合の完了にしない。

## Homeの追加・管理統合（2026-10-22 / HOME01・WEB04・SKY21・UXRS01 / ROCK）

本人指摘の検索/管理2タブを、Home内の一つのdialogへ統合する。既存owner store/CAS/model設定とEveの実行契約を保持。旧catalog/agents URL互換、draft/scroll/keyboard、3主タブの同一候補受入を担当し、EXTERNALのモデル/配信元稼働とJOINTの実機/公開を別判定とする。集中33/33・Root/Source full・同一build実UIを受入後、本人承認でv112を公開。旧URL/検索管理切替/既存設定/3主タブを公開実UIで読戻し、Pixel共通実行は次。詳細[共通設計](../rockstaros-complete-design.md#home-add-manage)・[証拠](../evidence/home-add-manage.json)。

## 全体の詳細開発プロンプト（2026-10-22 / OS10・SKY21・HOME01 / ROCK）

[既存の共通Coreプロンプト](../prompts/rockstaros-common-core-development.md)を全体の詳細版へ改訂。主担当Product / UXのROCK、横断先Sky/MCP・Security・Web・Android/Native・Billing・Game・Material。ROCKは共通契約と実装/状態、EXTERNALは実Provider/機器/決済、JOINTは同一候補の接続受入、OWNERは対象/条件/最終本人操作を担当します。CORE01〜12・実行SI00〜08・usage U01〜05・RQ01〜49・研究87項目を照合し、各領域の入出力/保存/権限/失敗復旧/合格を統合しました。2026-10-22T06:44ZのGitHub metadata、公開v110、ローカルSI02/限定SI03、未公開計量を分離。次は同じSourceの統合/新UI/保存再開と共通hostの接続。文書保存・Git保存・main・配備・実機・本番金融を別記録とします。検証はproject/design/baselineチェックと最終verify、runtimeの次段階は各担当の同一候補証拠を使います。

## 指定された再設計チャットからの開発入口（OS10・SKY21・UXRS01・HOME01 / ROCK）

2026-10-21の実機検証直後の本人依頼で、同じ[開発プロンプト](../prompts/rockstaros-redesign-development.md)を更新。main `883e311e…`とbranch `951d82d5…`を再取得して固定し、Pixelの同APKで新規一件→実推論→保存→再表示33.732秒、次の通常起動26.060秒の証拠を追記した。最初にTerminal転送の恒久対策と同一jobのEve連携を実装し、A16/A9/A13、Home投稿、eSIM/月次計量、作者/World/Wallet/Game、GrapheneOS/全端末の順序と合格条件へ接続する。ROCKは共通契約と実装、EXTERNALはProvider/OS/機器、JOINTは同一artifact、OWNERは対象/同意/保存・内容判断。今回の文書更新自体は、その次のruntime改修を実施した意味ではない。

利用者が指定した[「RockstarOSを再設計」チャット](codex://threads/01a14d54-daee-7c30-87a8-faea84641a40)の最新指示を、[横断の開発実行プロンプト](../prompts/rockstaros-redesign-development.md)へ反映した。Skyで発見/Add→Eveの同一仕事→OS実行/保存/費用→本人の成果/復旧を最初に通し、投稿Provider、SIM/eSIM・月額、Wallet分配、Pixel/他端末を別gateへつなぐ。87件の照合snapshotとmain v2.08/RQ50の追加を保持し、旧X風黒Homeを最新配色や本人X feed完成の証拠にしない。文書保存はruntime実装ではない。

## 「RockstarOSを再設計」チャットの開発入口（OS10 / ROCK、2026-10-21）

本人の指定チャット全体を現行設計・87件照合台帳・main/作業branchの実体と突き合わせ、[開発実行プロンプト本体](../prompts/rockstaros-redesign-development.md)と[RDR01〜10詳細実行表](../prompts/rockstaros-redesign-thread-development.md)に共通SI Core、SIM/アカウントの利用開始、Eve→Sky→Linux→成果/費用の一件縦断、Home投稿受信、World/端末/料金の別受入を記録した。今回の文書作成はruntime、実Provider、Pixel全OS、実課金、公開の受入ではない。最初に共有dirtyを保全して引継ぎ入口・優先順位をmainと同期し、同じowner/契約/jobのROCK側一周から実装する。

## Eveの仕事窓口（UXRS01・SKY12・SKY21・BIL02・OS10 / ROCK）

2026-10-21の[開発実行プロンプト](../prompts/eve-work-desk-development.md)は、最新mainと作業branchの同期、既存Web/Cloud/Wallet/成果契約の再利用、EVE01〜08の修正順と合格証拠を指定する。文書保存とruntimeの全項目受入は別状態。

全体検証の追補: 並行migrationが`0070`へ整理された後、`npm run verify`は新Eve履歴3表の分類未反映で`database:check`に停止した。局所ブラウザ受入とは別に再実行する。

2026-10-20追加実装: EveでSky Toolを選ぶ、または依頼文から接続済みToolを選べた場合、会話モデルがremote設定でもToolの入力確認カードへ進む。従来はremote文章モデルの見積分岐が先に走り、Tool実行へ進めなかった。既存のTool runnerで本人が入力・条件を確認してから明示的に実行し、成果を同じ会話に戻す。remoteモデルへTool依頼を暗黙送信しない。Tool未接続時の接続案内、候補の下書き表示、外部MCPの個別承認・料金gateは維持する。ROCKはWebの分岐と表示、EXTERNALは外部Tool本体、JOINTは実接続先のreceipt、OWNERは実行内容と必要な外部作用を承認する。対象18試験、型、対象lint、baseline/design/Sky/project checks合格。localhost実ブラウザでOpenAI会話モデル選択のままSky登録済み`mr-citations`を合成入力で実行し、同じ会話と再読込後に成果を確認した。全verifyは並行追加中のmigration番号0069重複でschema:check停止。実Provider、複数Toolの自動連鎖、Pixel全OS、公開は別受入。

2026-10-20の本人要件を[詳細正本](../rockstaros-complete-design.md#eve-work-desk)へ反映。会話から目的/入力/期待成果を確認し、Sky選択を同じ本人のjobへ引き継ぎ、計画・依存・送信先・見積/上限・停止条件を承認前に提示する。本人向け7状態、画面を閉じた後の承認範囲内継続、追加費用/権限/送信先の再承認待ち、予約/確定額、停止証拠、検収、独立アプリでの読戻し、失敗時の残存データ/再開方法を対象とする。ROCKは既存workflow/Broker/Wallet/保存への接続、EXTERNALは実行・停止/計量receipt、JOINTは同一jobのsandbox/端末受入、OWNERはscope/上限/送信先/成果検収を担当。現段階は設計記録で、runtime・Provider・実機・公開の全項目完了ではない。次は既存Web jobとCloud委任のsource/fixtureを比較し、未接続箇所を既存taskへ割り当てて一件を通す。検証は`npm run design:check`、`npm run baseline:check`、`npm run project:check`、完了前に`npm run verify`。

## フロントの構図と操作品質（HOME01・WEB04・SKY12 / ROCK）

本人の2026-10-20指示により、[共通設計](../rockstaros-complete-design.md#frontend-composition)でPC約62:38、スマホ一列、主操作・実行先要約・実仕事を優先する。黄金比の普遍的優越と実ユーザー統計は未実証。ROCKはHome/共通UI/Pixel表示、JOINTは実端末と外部実行、OWNERは最終的な使いやすさの評価。既存の権限/費用/保存を維持し、全verifyと実表示を別々に受け入れる。証拠docs/evidence/frontend-design-refinement.json、他の端末と全Toolの移行は継続対象。

## 現行の大元：RockstarOSの中にSky・Eve・Linux

2026-10-20の本人指示「osが大元」「osの中にskyもeveも」「osの中にlinux」に従い、製品全体の大元は**RockstarOS**とする。OSの中に、能力の登録・追加・接続を担う**Sky**、会話・依頼・計画確認・承認・進捗/停止・成果・利用額のSI窓口である**Eve**、対応するmodel/Agent/Toolを処理する**Linux実行環境**を置く。本人・eSIMサービス利用権・権限・予算・保存/復旧・利用量/請求はOSの共通管理へ結び、Sky/Eve/modelへOS権限を移さない。

利用の流れは、Eveへの依頼→Skyで登録/追加した能力の選択→OSによる本人/利用権/権限/予算の確認→対応Linuxで実行→共通の仕事/成果/使用量→Eveで確認。Skyから機能を選んでEveへ渡す入口も同じOS内にある。TerminalはLinuxを直接扱う任意の操作口で、日常の依頼はEveから行える体験を目指す。クラウドサービスはOS外にある外部実行先で、対応adapterから呼び出す。全クラウドmodel本体を端末内に格納するという意味ではない。

Pixel版はGrapheneOS/Android上の対応Linux guestを使う方針、Mini/Proは機種別のLinux/runtime適合で決め、Pixel用binaryを転用しない。既存のLinux計量・LLM・権限・保存コードを再利用する。これは前の「Skyを全体の大元」とする説明を利用者が訂正した設計階層の修正であり、全OS image・全機種・全Cloud/使用量統合の完成宣言ではない。月額16ドルの枠付き共通契約、Eveへの呼称統合、保存済みデータと既存IDを引き継ぐ。

## 正式名称：Eve（イヴ、旧称Zema）

2026-10-20、利用者の明示指示「zemaじゃなくてeveにしよadamとeveのeve」により、仕事・会話・進捗・承認・停止・成果・使用額を扱う製品の表示名を **Eve** に変更する。名前の由来はAdamとEveのEve。既存のSky、Jennifer、月額16ドルと利用枠、本人承認・保存・復旧の業務契約を引き継ぐ。文中の旧称Zemaは同じ製品の過去名として読む。

既存の`/chat`、`zema`利用権scope、保存キー、`sky-zema-core` package、公開済みの関数/schema/ファイル識別子は互換性のため保持する。名称変更で既存の会話/仕事/成果を消したり、新規サービス契約/追加課金を開始しない。過去の受入証拠・配布物の名称とhashは当時の記録として保持する。Web sourceの表示・名乗りと、Android APK/OS image・公開環境への反映は別に受け入れる。

### EveをSIの一つの窓口に統合

同日の本人追加指示「ジェニファーって何すんのeveでまとめて良くないそれ」「aiじゃなくてsiね」に従い、利用者向けのシステム種別は**SI（スーパーインテリジェンス）**、名前は**Eve**とする。Eveは会話・依頼・計画の確認・実行の依頼/承認・進捗/停止・成果・利用枠/費用を見る一つの窓口。Jennifer localは既存ローカルmodel profileの過去の表示名であり、別の製品/追加契約/独立した利用窓口にしない。model/runtimeの技術的な識別・版・実行場所と本人権限は内部で維持し、Eveの設定で確認/選択する。Eveという名称で未実装の推論能力・実行権限・計量接続を完成扱いにしない。

## Skyの操作の整理（SKY12 / ROCK）

依頼を先頭にし、状態ごとに一つの主操作を示す[共通ルール](../sky-tools-complete-design.md#sky-user-first-flow)。PixelのSky入口は依頼と二つの管理項目へ整理し、依頼画面は現在の仕事・成果・停止を中心にする。細かな設定と以前の全文は開いたときに表示。新しい実行権限やCloud送信を追加しない。build/表示と実行一周/ユーザー評価を分けて記録し、一般公開は保留。

## Sky全体の普通の言葉による表示（UXRS01 / ROCK）

主担当Product / UX。利用者の明示訂正によりZoom限定をやめ、[共通契約](../sky-tools-complete-design.md#sky-plain-language)を全Sky画面・進捗・成果・エラー・持出しへ適用する。ROCKは固定文・状態・安全なエラー・成果の第一表示を担当、EXTERNALの作者本文は改変せず、JOINTの外部実行やOWNERの確認・費用承認を表示だけで合格にしない。完了条件は共通状態/秘密非表示/元本文保持の試験、プランナーを含む画面操作と持出し、全verify。実ユーザーの理解度、native表示、多言語と実提供元は別受入。一般公開保留。[実装証拠](../evidence/sky-plain-language.json)。

## Sky公開判定の検証結果

公開完了判定の整合検査をverifyへ追加。focused stageは既存basic受入を保持し、実Cloud AI/公開両端末/全Tool分類/Apple Payの受入を要求する。7 guard testsと正本全verify exit0（692 Node/19 Fashion/938 Worker-D1）。`--require-stage focused`は期待どおりexit1で未合格を示す。公開v28はこのturnで変更せず、一般marketplace/ConnectをCSV専用50円成功へ昇格しない。直近30分の公開error検索0件は実AI/可用性の受入ではない。証拠docs/evidence/sky-focused-release-check.json。GitHub mainへの保存/統合は未実施。

## Sky focused公開判定の修正（2026-10-02）

ROCK/WEB04: 2026-10-02: 既存Sky v28（source cb55411549649bd57429fa1afeb974139fc024da）公開成功。CSV専用Stripeはliveで、既存JPY50円受付はcompleted/stripe_verified/attempt1/revision3を公開D1で再確認した。新しい決済はしていない。一般MarketplaceのStripe/Connect受入とは別。クラウドProvider keyと信頼料金は未設定、pricing gateはfalse、production Cloud executionは0件。Pixelは接続済みだがロック中。保存回答管理と会話引継ぎの合成受入を本番owner/実AIの証明にしない。

`focused` stageを追加し、既存basic条件に実Cloud AIの応答・所要時間・項目別usage/cost・上限/timeout、同じ公開sourceのdesktop/Pixel顧客導線、全34 Toolの個別分類、対応端末のApple Payを加えた。既存paid-marketplace/clients scopeを省略せず独立して保持する。`node scripts/check-sky-launch.mjs --require-stage focused` は不足が残る限りexit 1で、設定キーの存在やmockだけでは合格にしない。検査自体の整合は`npm run verify`へ追加した。必要stage/gateの削除、基本受入の省略、合成環境のpassed、根拠欠落、依存cycle、未完了でのlaunch claimを7件の試験で拒否する。

## Sky v28配備の受入範囲

WEB04/ROCK: 保存回答の本人限定Markdown取得・本文だけの削除確認・会話から仕事への未送信依頼の引継ぎを既存Skyへv28/source cb55411549649bd57429fa1afeb974139fc024daで公開成功。正本全verify exit0:681 Node/19 Fashion/938 Worker-D1（認証付きattachment/削除済み拒否の回帰を含む）、Site24 Worker/D1項目・型/lint/build/bundle/assets合格。Siteの全project検査は既存SKY20根拠欠落で不合格のまま。公開DBの既存50円受付はcompleted/stripe_verified/attempt1/revision3を保持し追加請求なし。cloud実行0件・provider key未設定・Pixel keyguard showing=true。本番ownerの新UI受入、実Provider応答/費用/請求/資金gate、Apple Pay・外部OAuth・製品サイト入口は未完了。合成回答/料金/ログインを本番成功とはしない。GitHub main b3e2676へ本変更をpush/統合した証拠はなく、正本未commitとSites公開を区別する。

## Skyクラウド回答の取得と会話からの仕事引継ぎ（2026-10-02）

会話の現在の依頼文だけをcomponent memoryで仕事画面へ引き継ぎ、仕事選択・見積・承認は本人の操作とする。URL/新しいbrowser storage/D1へ依頼本文を追加保存せず、reloadで未送信の下書きは消える。保存済み回答は本人認証付きMarkdown attachment（private/no-store）で取得でき、未保存/削除済み/別本人は拒否する。本文削除は対象と不可逆性をdialogで確認し、state・usage・予算台帳は保持する。共有予算の確定額は請求書照合済みと表示しない。ローカルbuilt Siteの合成アカウントで引継ぎ/再読込/削除dialog取消/135byteのダウンロード一致を確認、Worker/D1で24項目合格。実AI/本番ownerログイン/Apple Payは未受入、追加課金なし。正本の全verifyと同一Site公開は次の検証。
証拠: [local results verification](evidence/sky-cloud-results-verification.json)。

## 2026-10-01 Sky専用サービス公開

専用URL https://sky-marketplace.noellesugar1.chatgpt.site/sky/marketplace を一般公開。利用者が一般公開を明示了承し、access_mode publicの反映成功。Site version3、source 4d6d66332f7793b3e0d47ac175e100b6fea10b56、deployment appgdep_6abdfec3f6b081918cfca91dae0a06e5 succeeded。製品サイトと旧OSサイトは変更なし。公開ブラウザでMarket→出典整理→未サインイン実行禁止→OpenAI公式ログイン画面への遷移を確認。本人ログイン後の本番処理は未実施。公開DBには初期化済みmarker version1をreadbackし、164 schema statement（26 triggerを含む）の準備完了を確認。Sitesの通常migration配備はSQLITE_ERRORだったため、専用配備adapterで新規DBの確定schemaをprepared statementで初期化し、全guard完了まではAPIを503にしている。既存正本migrationと既存SiteのDBは変更しない。adapterの控えはservices/sky-web、実配備sourceはSitesへ保存。正本の全verify520 tests＋Fashion19＋API265はadapter追加前の受入で、adapterは型/build・SQLite冪等適用・公開DB marker受入のみ。製品サイトの案内リンク追加は編集権限待ち。Mini対応、外部Provider、本番課金の合格ではない。

## Sky単独サービス配備（2026-10-01）

同じSkyをOSと独立アプリから使う方針を受け、専用manifest、起動先/sky/marketplace、既存UIの保持を実装。Node520/520、Fashion19/19、API265項目、型・lint・build・asset closureと全verify合格。専用Siteのversion1は保存済みだが、配備はDB初期化SQLITE_ERRORで失敗。一般公開設定は自動承認審査が拒否し、本人限定のまま。公開完了ではない。


## 2026-10-01 Sky文章ツールの成果再利用

ROCK／WEB04: Sky Market経由の出典整理・無料記事・応募前チェックの既存実行画面に「この端末に保存」、保存成果再表示・削除を追加。原稿は端末処理、成果は本人が選んだ同一ブラウザのlocalStorageへ全Tool合計20件、サーバーには本文を送らない。共有端末の閲覧可能性とMarkdown代替を明示。関連15試験・typecheck成功。独立作業コピーの全verifyは519 tests・265 API assertions・build等完走（既存database-status期待件数101→102の整合を含む）。実ブラウザでMarket検索→出典整理→保存→再読込→再表示、無料記事作成・保存を確認。稼働コピーは2026-10-01チャットのwork/sky-service。共有作業treeの以後の変更はこの合格へ算入しない。本番未配備。別Siteへの誤配備はversion41へ取り消し済みだが、旧版へのrollbackでありGitHub最新版の復元ではない。製品Siteは現接続で編集不可。既存デザインを維持し、正本と公開sourceの対応を揃える。アカウント別クラウド成果同期・実Provider接続の合格ではない。

# Product / UX

## データ・同期・復旧の共通契約（OS10 / ROCK）

主担当はProduct / UXのROCK。Eveが同じ仕事の状態・競合・成果・復旧を表示する共通契約を[OS全体設計](../rockstaros-complete-design.md#data-sync-recovery-algorithms)に定める。ROCKはowner分離、revision/operation ID、状態・lease、offline保留と競合表示、artifact/usage/backupの照合を実装する。EXTERNALはProviderの冪等性・照会・請求根拠、JOINTは同一候補の二端末/実Provider/別環境復元、OWNERは競合解決・削除/持出し・契約条件の選択を担う。既存`lib/workflow.ts`とWallet/Cloudの一意制約を再利用する。

完了条件は、別owner拒否、二端末の古いrevision拒否、重複操作とusage/支払一回性、承認飛越し拒否、旧leaseのfencing、checkpoint再開、結果不明の照合、offline競合表示、成果hash破損検出、空の別環境への復元、旧writer失効、保持/削除/持出しを同一候補で示すこと。まず`node --experimental-strip-types --test tests/workflow.test.mjs`と関連するWallet/Cloudの集中試験、`npm run design:check`、統合前に`npm run verify`を行う。[2026-10-21開発実行プロンプト](../prompts/rockstaros-data-sync-recovery-development.md)から実装を開始する。現時点は設計とプロンプトの記録で、端末間と実Providerの一周・全損復元は未受入。

## PCから離れて作り、携帯を持たずに連絡する体験（2026-10-18 / DOC04・UXRS01、ROCK）

利用者の明示目的は、PC画面を操作せずに制作を一件完了し、スマートフォンを手に持たずに通話・短い連絡を行えること。[共通のMini/Pro仕事契約](../device-support-architecture.md#shared-si-device-profiles)をUXの入口にする。Miniの短い入力・確認からSkyでTool/Agentと実行先を選び、Zemaで同じjob/revisionの見積、本人承認、途中修正、成果と停止を扱う。Proが利用可能なら本人が許可した計算を担当する。Proが使えない時は待機/不足理由を見せ、Cloudへ自動切替しない。連絡はMini自身の受入済み回線で実到達を確認する。ROCKは共通UX、権限・費用・成果・復旧を実装、EXTERNALは通信・制作Tool、JOINTは同一owner/同一試作機の制作と通話/送信、OWNERは最初の作品・相手・公開/共有・費用を決める。合格はPC/スマートフォンを操作せずに一件を開始→修正→成果検収/保存→中断/復旧し、通話/送信の実成立と第三者への漏えい・誤操作を測ること。MiniのOI07とMP gate、Proの機種別受入が残る。`npm run baseline:check`、`npm run design:check`、`npm run device-support:check`は文書整合で、実利用合格ではない。

## 2026-10-18 RockstarOS画面とruntimeの一体再設計

全体設計の基準は[RockstarOS 1.0 architecture](../rockstaros-1.0-architecture.md#rockstaros-再設計一つの仕事を端末間で完了するサービスos)。Home→Sky→Zema→Wallet/Usageを同じ仕事の導線にし、runtimeでは同一owner/job ID/revision・利用権・権限・費用上限・receipt・復旧を共有する。SIM/eSIM購入/開通、service claim、client/OS導入は別状態。画面は未接続・fixture・sandbox・実機・Provider・本番の実態を表示し、未承認の作用や料金を始めない。

同日の利用者補足: SIはスーパーインテリジェンス。ROCK/UXRS01は、OS内HomeのクラウドLLM依頼、Sky MarketplaceのAgent選択・接続、Zemaの仕事・承認・停止・成果を第一者画面として一体化する。SIM/eSIMは販売・利用権経路として維持し、単体Sky Web/PWAも残す。Wallet/Game等のRQを削らず、初期画面ではSIの仕事を優先する。EXTERNALのCloud Provider/API、JOINTの端末別native受入、OWNERの権限・予算承認は個別gate。合格条件は同一owner/job IDで依頼→選択→見積/上限→明示承認→進捗/停止→成果/明細→再起動・別client復旧を確認し、browser速度は同条件で計測すること。

この更新は設計統合であり、RQ追加、runtime/API/DB schema変更、Web/native UI実装、実Provider/課金/端末受入を行った記録ではない。既存WEB04/HOME01などの完了はその記録範囲に限る。次の設計着手時はWeb/Android/native間の実在job contract、owner/revision同期、Walletの状態対応表をsourceとfixtureで照合し、共通contractの不足を特定する。

## 2026-10-02 SIM/eSIM-led service direction audit and onboarding correction

Authoritative product flow: purchase a physical SIM/eSIM through any accepted channel → carrier activation handled and shown separately → one Rockstar account signs in and claims service entitlement → route by exact device capability to supported signed OS installation or existing-OS app/browser → open Sky, Zema and Agent work directly → quote and authorize a per-task spend cap → follow cloud progress while offline → retrieve result and itemized usage after reconnect. SIM purchase does not store or install an OS image, activate a carrier profile by itself, or count as cloud payment. Hardware/avocadoMini is not a prerequisite.

2026-10-02 follow-up: Android Shell now shows owner-bound service claims and Sky/Zema/Agent scopes, with `/connect` guidance when no claim is registered. Agent details also expose same-delegation Cloud/Wallet reconciliation after client restart; reconciliation requires a matching durable owner/device Wallet reservation, and only a confirmed pre-dispatch Cloud terminal state exposes an explicit reservation-release action. See [recovery contract and limits](../sky-cloud-continuity.md).

Audit: keep channel-neutral signed entitlement claims, owner-scoped account/device authorization, device capability snapshot, A2A/Cloudflare job recovery, approval digests, rate-card/quote stores, shared budget reservations, live meter snapshots and itemized receipts. Correct the old OS-first product positioning in the architecture/index documents, mark the older device-LLM-first development plan as history, and state that the eSIM bootstrap package is only an eSIM fixture rather than a product-channel restriction. Main Home now has direct Sky, Zema and Agent Workbench actions; `/connect` explains the intended onboarding and routes those actions. The eSIM catalog is demoted to a secondary technical/offer reference and no longer appears as the primary purchase route; the service offer explicitly includes both physical SIM and eSIM distribution channels. SIM01 remains `in_progress`: issuer/purchase distribution, physical SIM fulfillment, carrier activation, accepted Provider price/meter/invoice, production billing, shared production D1, Android SDK/APK acceptance and native OS installation remain unproven. Local usage rows and fixture receipts do not prove production billing.

Follow-up correction: [SIM/eSIM-led product architecture](../sim-led-product-architecture.md) is now the canonical customer/system flow and P0/P1 backlog. It prioritizes quick cloud LLM/agent access, visible usage pricing, and integrated Sky/Zema; treats the purchased SIM/eSIM as the service-access offer rather than an OS download medium; and separates carrier activation, signed entitlement, identity, device install, cloud execution, and AI billing. `docs/product-baseline.md`, `docs/rockstaros-1.0-architecture.md`, and Sky launch documentation now use that same onboarding and accepted-device routing. An A2A Package invocation extension is locally encoded in `SendMessage` metadata and bound to the signed quote/delegation; Provider execution, interoperable responses and execution receipts are still unaccepted.

2026-10-02 continuation: added the authenticated, channel-neutral seller delivery API (`POST` idempotent registration, `GET` exact pending-package recovery, `PATCH` explicit delivery acknowledgement) over the encrypted issuer D1 store. Seller bearer credentials are issuer-scoped by configured token digest; signed package, caller issuer, bounded request, encryption keyring, and idempotency are checked before disclosure. The endpoint has no external checkout/carrier integration. Local tests verify retry/recovery, authentication scope, changed-request rejection, delivery acknowledgement/secret clearing and fail-closed configuration; production issuer secret custody, actual seller webhook/checkout, buyer notification and purchase fulfillment remain pending contract/sandbox work. `npm run build` includes the endpoint; production deployment and D1 readback were not performed.

The same endpoint now applies an atomic persisted per-issuer rate limit of 120 authenticated requests per minute across registration, recovery, and acknowledgement. Excess requests receive `429` with `Retry-After`; a synthetic SQLite test verifies isolation between sellers and window reset. Migration `0054` is source/local only until shared production D1 is separately deployed and read back.

2026-10-02 Android A2A quote review source: added Shell API v12 methods for owner-authenticated connected-Agent discovery and quote-only Provider pricing, with the exact configured HTTPS origin, path allowlists, bounded I/O, no redirects/cookies/cache, and no automatic retry. The Broker verifies the returned Ed25519 Provider quote against the operator-provisioned key inventory and exact selected Agent origin/name/version, prompt hash, currency, budget cap, and expiry before returning it to the Shell. A subsequent integration supersedes the original “no delegation/Wallet/Cloud connection yet” note: Shell API v18 now carries the approved quote into a stable-ID Cloud draft, obtains a separate device-credential-gated Wallet approval, creates the exact quote-bound hold, registers Broker proof only from that HELD row, then requires explicit Cloud approval and same-ID recovery. See [native reservation evidence](../evidence/android-a2a-native-reservation-core-20261002.json) and [source boundary audit](../evidence/android-a2a-reservation-bridge-audit-20261002.json). Source-contract/canonical-vector checks pass. Android Java/JUnit, generated AIDL, APK, credential prompt, restart/reconnect behavior and device UI remain uncompiled/unverified here; Cloud dispatch stays closed by default until runtime and external Provider acceptance.

Local result: the baseline service-entry run passed `npm run verify` with Node 669/669, Fashion 19/19, Worker/D1 API 863 assertions, typecheck, product lint, build and bundle/asset checks; see [SIM service entry evidence](../evidence/sim-service-entry-local-20261002.json). Follow-up audit found the direct-LLM estimate endpoint did not return the signed rate card's unit rates to the UI. The estimate API and Workbench now display input/output rates per million tokens, plus cache input/write rates for text-token cards. Targeted currency/rate tests pass 14/14, typecheck passes, and rebuilt Worker/D1 API tests pass 865 assertions. The current full `npm run verify` also passes: Node 672/672, Fashion 19/19, Worker/D1 API 869 assertions, typecheck, product lint, build and bundle/asset checks; A2A Worker/D1 Workflow fixture passes 10/10. An unprivileged test attempt cannot bind loopback; the same local fixtures pass in the authorized run. This verifies local source and fixtures only. Issuer distribution, physical SIM fulfillment, carrier activation, A2A Provider unit quote, production price/meter/invoice, funded billing, Android APK/device acceptance and exact-SKU OS installation remain open.

### Updated backlog order

1. Keep versioned prompt-disclosure consent before quote-only Provider egress. Migration `0049`, `/api/sky/a2a-price-quotes`, and Android Shell API v18 cover the request boundary, device-side signature review, exact quote-bound Wallet hold, Broker proof and distinct Cloud approval; synthetic SQLite, source-contract and shared canonical-vector checks pass. Prompt-sharing consent remains separate from paid execution authorization. Next run Android compile/instrumentation on a supported CI/device host, then validate the enabled path only against a contracted Provider sandbox and funded Wallet. Paid dispatch remains disabled by default.
2. Run Android CI compile/instrumentation for Shell AIDL v12, the quote review, P-256 enrollment/revocation, Provider trust parser, no-backup device identity and same-job reconnect/readback. The trust inventory arrives only through Gradle property `a2aProviderUsageKeysJson`; `[]` or malformed input disables receipt application while other OS use remains available. This checkout lacks a working Java/Gradle/Android SDK toolchain, so only Node/source contracts are currently verified.
3. Preserve the channel-neutral purchase claim and single Rockstar identity. `/connect` accepts a bounded JSON seller package by file, paste, or `#rockstar-claim=<base64url>` link. The link code stays in the URL fragment, is removed from the address after client capture, and is never redeemed automatically; the server remains authoritative for issuer signature and single-owner binding. `lib/rockstar-entitlement-issuer.ts` provides local channel-neutral claim/event signing and replacement material generation; `replaceRockstarEntitlementClaimWithAcknowledgement` gates replacement delivery on a matching cancellation event acknowledgement and passes stable event/claim IDs to adapter callbacks. `lib/rockstar-entitlement-issuer-store.ts` and D1 migrations 0052/0053 add idempotent issue recovery, AES-GCM claim-code storage, key IDs for rotation, timeout-safe retry, and ciphertext deletion after delivery acknowledgement. Internal server API `/api/internal/rockstar/entitlement-deliveries` now authenticates seller tokens per issuer, verifies signed claims, and exposes register/recover/ack lifecycle. Seller-specific checkout/link delivery, process-level production key custody, webhook retries and seller acceptance remain unconnected.
4. Accept seller/channel claim delivery, physical SIM fulfillment and carrier activation as separate external gates; confirm included RockstarOS entitlement and unified Sky/Zema/Agent access after purchase. Keep service claim, network state, account and device installation as separate visible statuses.
5. Accept production Provider prices, live meter, invoice reconciliation and funded Wallet debit before enabling paid Cloud execution. Then validate exact-SKU native OS installs or existing-OS app/browser support across device families. A reserved cap is not live provider spend, and local usage is not an invoice. No SKU is supported based on SIM capability alone.

Implemented source, locally verified behavior, and external acceptance are separate states. Local usage rows, fixtures, and synthetic receipts are not production bills, actual carrier activations, or OS installation proof.

2026-10-02 product-direction audit follow-up: corrected the earlier gap list after tracing the current Android source through `MainActivity`, `ShellConnection`, `RockShellService`, `PlatformStore`, and Cloud A2A routes. Quote review → native Wallet hold → Broker authorization → explicit Cloud approval is present in source, with source-contract and shared quote/authorization vector tests; the prior “final atomic handoff missing” entry is stale. Android compilation, generated AIDL, APK, credential, restart/reconnect and exact-device behavior remain unverified because this host has no Java/Gradle/Android SDK toolchain. Provider, funded Wallet, invoice, SIM/carrier and OS-install acceptance gates are unchanged. See [follow-up correction evidence](../evidence/sim-led-product-correction-followup-20261002.json).

## 目的

2026-09-30検証記録の更新：製品正本のvisual accentを現行のice-blue `#bedce6`へ揃え、baseline validatorの旧`acid_green`要求を更新。製品説明READMEの英語文とURL-encoded task linkをテストが受け入れるようにし、`npm run baseline:check`、関連docs tests、schema/migrationの既知期待件数を修正した。`npm test`はloopback許可付きで493/493成功。R5設計・物理受入のstatusや未実施境界は変更していない。

## 目的

物理SIM/eSIM購入を入口にRockstarOS service accessを短い手順で提供し、SkyでAgentを見つけ、Zemaで依頼し、見積・上限・進捗・成果・使用料を一つの認証で確認できる体験を作る。OS/Coreは端末本人性、権限、仕事、復旧を支え、端末内LLMは対応端末の追加能力である。各端末で実際に使える能力を表示し、利用者の不便削減で判断する。

## 現在地

- SIM/eSIM購入後の本人連携は、Web `/connect`に加えてAndroid Shellからも署名付きclaimを登録できるsource経路を追加した。端末内入力は保存せず、現在のRockstar IDへの明示確認を要求し、署名・一度限りのowner bindingはserverが検証する。Android compile/実機、販売元handoff、実購入は未受入。[証拠](../evidence/sim-service-android-native-claim-local-20261002.json)。

- 同監査の追加入口: `/sky/network`のMCP画面、`/sky/publish`の表示と公開SDKコピー成功を確認。Studioのコピー失敗表示・API key発行401時サインイン入口を修正し、追加2試験・対象lint・typecheck・差分検査合格。key発行と401の実環境再現は未実施。

- 2026-09-27 WEB04 / ROCK: Sky全入口を再監査し、ready Toolの登録経由、専用アプリ起動先との不一致、候補登録エラー非表示、非URLの提供元リンク、端末適合表示の差、Fashion入力の親画面依存CSSを修正した。Marketと詳細は`lib/use-sky-tool-context.ts`でホームと同じ接続信号を使い、Fashionブラウザ簡易版はPC専用から除外。390pxで全34詳細の見出し・横はみ出し0・エラーoverlayなし、ホーム全34アイコンの概要開閉・画面内表示・scrollTop 0・Escapeを確認。サービス接続・MCP・埋込掲載フォームは320／390／768／1280pxで内部横はみ出し0。長い設定の保存位置までのスクロール、MCP右矢印タブ切替、空掲載フォームで名前欄focusを確認。Fashion簡易プランと出典整理サンプルはホームから結果表示まで成功。全Tool実行の合格ではない。関連26試験、Sky検査、typecheck、product lint、build、差分・設計チェック、進捗同期は合格。全体verifyは既存baseline表示基準不一致で停止し、掲載D1試験も無応答のため未合格。Provider資格情報・申請送信・実MCP接続・API key発行・課金・本番配備は未実施。詳細な画面受入はTool設計§1.2とproject.mdに記録。

- 2026-09-27 WEB04 / ROCK: 利用者のスクリーンショットで、Skyの狭い画面にある45px列と56pxアイコンの不一致による片側約5.5pxの重なり、旧main・footerのグローバルCSS干渉を確認。ホームとMarketを`components/sky-tool-card.tsx`／同CSSの共通カードへ移し、架空の作者handle・重複する役割名を除いた。`components/sky-workspace.module.css`で一覧と常時検索を整理し、`components/sky-surface.module.css`と共通shellの`tone="sky"`でホーム・Market・Tool詳細・ココナラを同じ暗色面にする。Marketは短い見出しと検索を先に置き、環境説明を展開式にした。Tool詳細は実行欄を先に、手順・licenseを展開欄へまとめる。概要の抽象的な共通注意書きを外して、個別の接続・認証条件は保持。ローカル実ブラウザでホーム・Marketの320／390／440／768／1280pxは横はみ出し0、アイコンと本文の間隔12／14px。Jev Router・ココナラの320／390／768／1280pxも横はみ出し0、main landmark各1個。全Tool検索でJev Routerへ到達し、ホーム・Marketの共通概要、Escとfocus復帰を確認。ココナラのBase UI Dialogは320／390pxでfocus trap・Esc・元ボタンへの復帰を確認し、保存エラーは入力画面内に表示する。出典整理サンプルの成功と結果表示を確認。関連17試験、typecheck、`lint:product`、`sky:check`、buildは合格。全体verifyは既存baselineの`acid_green`／`light_scroll_product_showcase`期待値不一致で停止し、無限定lintにも未変更vendor・生成物のエラーがあるため全体合格ではない。次は正本と検査を現行方針に整合し、全体verifyを再実行する。本番配備・Tool本体接続・決済は未実施。

- 2026-09-26 WEB04 / ROCK: avokado製品Siteの黒・銀・淡い青をWeb OS全体へ適用。Home、共通chrome、Sky、Zemaの仕事画面、Wallet、Market、設定、Studio、CSVの黄緑を抑え、暗い操作面と冷たい白い情報面を一つの製品としてつないだ。Tool固有アイコンの識別色、接続・実行の実状態、警告色は変更しない。保存済みHome旧既定色だけ新既定色へ移行し、利用者の他の選択色は維持する。782pxと390pxのローカル画面で主要画面を確認し、390pxの全7画面で横はみ出し・error overlayなし。画面契約15/15、typecheck、lint、design check、build合格。`npm run verify`は既存README文言試験1件の失敗と全体Node試験の無出力停止で中断。外部依存・本人操作なし。Web Previewの画面改修であり、native OS画像や公開Siteの更新ではない。

- 2026-09-25 WEB04 / ROCK: avokado公開画面の黒・銀・淡い青、簡潔な見出し、余白をZemaへ反映。大きな色付きBot列と黄緑の操作面を抑え、最初の画面を「目的→選択中ツールの状態→依頼」に整理した。ツールは最初4件と選択中を表示し、22候補は検索・全件展開で個別に選べる。入力欄のfocusと操作ボタンは見える位置を維持。約782px、1280px、390pxのローカル画面で表示、検索、展開、スマホの一覧開閉、入力欄focus、横はみ出しなしを確認。外部Tool接続状態は変更しない。

- 2026-09-25 WEB04 / ROCK: Zemaで候補Botを選んだ直後、約782px幅では会話の案内と入力欄が初期画面より下に押し出されていた。会話面を画面高に固定し、メッセージ部分だけをスクロール可能にして入力欄を常時表示した。選択Botの説明・実際の接続状態・次の操作を空状態へ追加し、IP Studioなど専用画面を持つ候補は送信前に起動リンクを見せる。未接続Botを実行可能と誤表示しない。約782px幅と390px幅のローカル実ブラウザで案内と入力欄の同時表示、依頼ボタンの入力欄focusを確認。外部アプリ実起動やAR表示の受入ではない。

- UXCHAR01再調整: 追加の参考画像に合わせ、小さく斜めの黒目2つだけを持つ5輪郭（しずく・角丸四角・三角・六角・カプセル）へ変更。口と眉をなくし、彩度の高い色、上部ハイライト、下部の陰影で艶を表現。SVGのグラデーションIDはuseIdでインスタンス間の衝突を防ぐ。詳細を開く既存動作は維持。

- UXCHAR01の外観改善: 利用者の再フィードバックを受け、ツヤ・虹彩・反射を除去。ベタ色、丸・角丸四角・丸三角・花形の4種類の輪郭、シンプルな黒い目と口へ変更し、小さくても判別できる記号的な顔にした。主要Toolの配色と顔を明示固定し、一覧56px・発言48px・詳細120pxで表示。詳細は「いま、していること」と実際の依頼文を先頭にし、次の操作と成果を続け、機能説明は展開式にした。直近jobと現在会話を表示文言で区別する。動作軽減設定ではhover移動を停止する。

- 2026-09-21 UXCHAR01 / ROCK: 利用者指定の丸くつやのある目付きキャラを、共通SVGコンポーネントとしてSkyとZemaへ導入。Tool IDから色と表情を固定し、画面間で同じ顔を維持する。Skyの顔、Zemaの一覧・担当・発言の顔からダイアログを開き、説明、現在状態、会話内の結果、次の操作を確認する。名前による会話切替と顔の詳細操作を分ける。詳細を開いても実行しない。結果は該当Toolの現在会話内メッセージ、状態は現在要求または取得済みjobから表示し、未取得結果を生成しない。外部依存なし。キーボード操作、狭い画面、型・lint・全体verifyで受入を確認する。

- 2026-09-20のZema会話デザインと送信経路: ヘッダーはZema名と担当Botを整理し、Bot選択時の定型自己紹介と実行進捗の重複吹き出しを除いた。チャット、実行カード、入力欄を同じ暗色で統一し、依頼本文をMr.系Toolの入力欄へ引き継ぐ。Bot切替は新しい会話URLへ進め、前Botの履歴に混入させない。会話返信のIDをUUIDにし、モデル未接続時はTool実行可能なことを一つの返答で明示する。localhost:3001で架空案件の条件チェック1件、架空の出典整理2件がローカル成功し、会話への結果表示、履歴復元、Bot切替、幅390pxの表示を確認した。`npm run verify`は製品350件、Fashion 19件、仕事API149項目とbuildを含めて合格。ローカル会話モデルの橋渡し先4317番は起動しておらず、自由会話の成功は未確認。担当はROCK、外部依存なし。モデル実起動と自然会話の受入は残る。
- 2026-09-20のZema左欄固定: デスクトップではBot・履歴欄と会話欄を3：7に固定し、Bot選択、新規会話、履歴選択でも左欄を維持する。狭い画面だけ開閉できる。約794px幅の実ブラウザーで左238px・右556pxを計測し、Bot選択と新規会話の後も比率と左欄表示を確認。390px幅では開閉、Bot選択後の自動格納、デスクトップ幅への復帰を確認。`npm run verify`は同時作業中の発見用テストのLint警告を1行修正した後に全合格。担当はROCK、外部依存と本人操作はなし。Toolの実行結果や本番接続はこの表示修正の受入に含めない。
- 2026-09-20のZemaレイアウト修正: 約794px幅でBot欄と会話欄を二重に左へ押していた旧余白270pxを除き、開いたBot欄を220px、入力欄を526pxにした。閉じた状態は入力欄746px。未使用画面の依頼例を読みやすいボタンへ整え、直接`/chat`を開いたときは候補Botの先頭を自動選択せず、自動担当の新しい会話にする。「新しい会話」は同じURLでも会話と入力をリセットする。実ブラウザーでBot欄の開閉、新規会話、依頼例から入力欄への反映を確認。`npm run verify`は製品349件、Fashion 19件、仕事API149項目とbuildを含めて合格。外部Toolの実行結果は今回の画面修正の受入対象外。
- 2026-09-20のSky/Zema Web使いやすさ改善: Skyは依頼欄を最初に置き、おすすめ5件、ready全件、導入候補22件を切り替える。検索は全Toolを対象にし、役割ボタンは最初4件と展開入口に絞る。ZemaのBot一覧は選択中を残して最初4件とし、全件展開・検索を用意した。Skyの自然文依頼は未接続Toolなら直ちに接続確認を開く。localhost:3001のSkyで5件表示、候補22件表示、候補検索、依頼から接続確認までを操作確認。Zemaは未サインイン画面を確認したが、Bot展開の実操作は未確認。`npm run verify`は自動試験349件、Fashion 19件、仕事API149項目とbuildを含めて合格。
- 履歴: 2026-09-19以前はavocadoMiniを対外的な先行商品としていた。2026-10-02以降、SIM/eSIM主導のサービスが主商品となり、avocadoMiniと`/rockstaros`のhardware紹介は別programとして扱う。実機と販売は未実施。
- `/connect`は購入claim、回線開通、共通アカウント、端末別導入、Sky/Zema/Agentへの入口を案内する。`/`は利用画面、`/rockstaros/guide`は対象端末向けDeveloper Preview条件を示す。Sky/Zemaは独立アプリとOSの双方から利用できる。旧avocadoMini希望価格は現行のSIM/eSIM service料金ではない。
- GitHub READMEの冒頭はavocadoMiniの外観と利用場面の構想参考画像から始める。設計画像と実機写真を区別し、製品別GIF、RockstarOSとアプリの役割、開発状況への導線を続ける。クラファンの実URLは未確認で募集済みとは表示しない。
- 対外メッセージは利用者の目的と役に立つAIの発見を先に伝える。Skyで探し、Zemaで進め、Studioで試す体験とavocadoMini構想を示した後に、料金方針や内部技術を説明する。
- 無料配布を理念とし、OSは従量課金を予定する。無料配布の対象と利用量の計量・単価は未確定。Skyの現行収益連動精算と混同しない。
- RQ01〜RQ49を製品ベースへ固定済み。RQ49のMaterial Invention Coreは装置非接続sandboxを実装済み。Zema、simulation、外部ラボ、実験設備とのruntime接続は未実装。
- RQ49 Material Invention Coreの標準製品体験としてSpatial Invention Studio、四方向sensor端末`avocadoMini`、手によるdigital twin操作、差分再計算、Patent AI provenance bridgeを設計済み。別の任意XR addonではない。XR runtime、sensor rig、実機は未実装。
- Home、全画面からHomeへ戻る導線、Sky／Zema分離、Studio、Developer Preview紹介、共通visual systemを実装済み。
- Material Invention／avocadoMiniを含む全12層と7本のend-to-end flowを構成監査へ固定した。設計選択は適合、全体統合とproductionは未完了。
- 仕事作成、処理履歴、CSV、Wallet、設定への主要導線がある。
- 画面の存在は、本番provider、実機OS、一般公開の完了を意味しない。

主なtask: 設計の`AI01`とapp／OS能力の`AI05`、`R01`, `B01`, `B02`, `B05`, `HOME01`, `HOME02`, `SKY01`, `SKY10`〜`SKY15`, `WEB02`〜`WEB04`。

## 次に進める順番

## 2026-10-01 SIM/eSIM共通サービスclaim監査・実装

最新の製品要件を監査し、Skyのpackage販売/eSIM order/device entitlementをRockstarサービスの包括利用権と同一視しないよう整理した。再利用する基盤はowner認証、Ed25519 issuer trust、D1 unique制約、A2A durable job/recovery、Wallet holdとusage receipts、端末capability/attestation。物理SIM/eSIMの注文・通信activation、利用権claim、OS install、Cloud task usageは別々のrecord/evidenceを持つ。

channel-neutral claim contract、onboarding状態、再利用/差分/不足一覧は[SIM/eSIM entitlement設計](../sim-service-entitlement-claims.md)。`POST/GET /api/rockstar/entitlements`、owner-only read API、active issuer readiness、migration `0039`、署名bundle入力/claim済み権利/Sign inを表示する`/connect` UIを実装。`ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED=true`時にZema新規jobは`zema`、Sky A2A directory/MCP inspectionは`sky`、LLM requestは`rockstaros_access`、新規委任/承認/Broker proof登録は`agents` scopeを要求する。migration `0040`と`POST /api/rockstar/entitlements/events`はEd25519署名refund/revocation、冪等再送、event ID conflict拒否、権利無効化を実装する。Cloudflare Workflowのdispatch直前とscheduled prepared-job scanも権利を再確認し、失効後に未送信のjobはremoteへ送らず`prepared`保留にする。失効後のBroker proof登録も拒否する。Read-only task/result/artifact retrieval、cancel、settlement reconciliationは既存仕事を閉じるため維持する。Cloud quote verifierはrequest creation、D1 persistence/single-use、approval/Broker digest、Wallet reservation amount binding、Workflow preflightまで統合。migration `0042`のD1 rate-card catalog、operator-authenticated registration/revocation、estimate-only Zema flow、migration `0043`の8-task/4-concurrent delegation limit、migration `0044`の署名累積meter snapshot/予約cap/final reconciliationを追加。Zemaはactive delegation中に10秒ごとにpollし、暫定Provider報告費用をfinal receiptと区別する。Worker/D1 API suite 638 assertions、Cloudflare Workflow suite 9/9、migration convergence 9/9、live meter signature test 1/1をローカルfixtureで検証。A2A delegationはroot jobから一段のみで、owner credentialを外部agentへ渡さない。paid direct LLM routes (text/legal/patent/Jev)はProvider quote・実行承認・usage reconciliation不在時にfail closedし、Cloud flags/consentだけではProvider egressしない。残りは実Provider quote-only/live-meter/reversal semanticsとWallet settlement; 外部接続のある全有料Tool/event producerと直接/background pathの追加監査; issuer/provider key rotationと販売元webhook; production billing/Carrier/SIM/OS acceptance。合成鍵とfixtureはローカル証拠のみで、本番販売・carrier activation・決済・production billing・OS installation acceptanceではない。

## 2026-10-01 Zema cloud-agent支出表示

A2A Workbenchは「通貨最小単位」をISO currency digitsの金額表示にし、budget上限と見積を区別する。既存parent poolの上限・予約額・Provider署名receipt照合済み額は別欄。実行中は署名累積meter snapshotが届けば暫定累計を表示し、10秒pollで状態を更新する。meter未報告時は未報告とし、予約capを実利用額と誤認させない。owner-only task detailではfinal署名receiptの単価版・meter・数量・行金額を別に表示する。provider contractが無い間はpaid dispatchを閉じる。

公式A2A仕様ではtask lifecycle/transport/Agent Card/Extensionは定義されるが料金見積Core operationは見当たらず、価格quoteはversioned ExtensionとProvider署名quoteが必要となる。契約準備仕様は[A2A pricing extension](../a2a-pricing-extension.md)。ここでのextensionは設計案でありAgent Cardへ広告していない。currency formatting tests 2/2、typecheck、`lint:product`、production build合格。これは画面/API配線とlocal verificationであり、rate card、Provider quote、RT meter、Provider invoice、production billingまたは実Cloud agent task acceptanceではない。

## 2026-10-01 Direct cloud LLM pricing foundation

Direct remote model routes remain fail closed until production pricing, user authorization, and usage reconciliation are accepted. Added `lib/remote-ai-rate-card.ts` to validate a provider-signed rate card against an operator-provisioned Ed25519 key and exact provider/model/currency, then calculate an upward-rounded maximum amount from a conservative text-size bound and output-token ceiling. The rate-card is versioned, expires, and hashes into an estimate descriptor. The persisted quote/store/API and single-send execution path described below have since been added. This module does not retrieve a production Provider price, reconcile an invoice, or prove billing; those require Provider contract acceptance.

## 2026-10-01 Provider rate estimate API and Zema preview

Added authenticated `POST /api/llm/estimate` and estimate-only Zema flow. Owners with RockstarOS entitlement can compare a conservative maximum-cost estimate to a currency-aware cap; the response explicitly says `providerSubmission=not_performed` and `executionAuthorized=false`, and the prompt is never sent to the model Provider. Signed Provider rate-card bodies now live in immutable D1 table `remote_ai_rate_cards` (migration `0042`), with authenticated operator registration/revocation at `/api/internal/remote-ai/rate-cards`; only the bounded public trust-root key list remains in `REMOTE_AI_TRUSTED_RATE_KEYS` (Cloudflare environment-variable size limit is 5 KB; see [platform limit](https://developers.cloudflare.com/workers/platform/limits/)). Each estimate rechecks row digest, Provider signature, key status, effective/expiry time, and returns source/version/expiry plus maximum charge. Same-card registration is idempotent and revoked cards cannot be reactivated. Local Worker/D1 API suite 572 assertions, rate-card/quote focused tests 9/9, migration convergence 9/9, typecheck, product lint, and production build pass. Fixture keys/cards are synthetic and establish neither Provider-issued prices nor production registry/billing; paid execution, live meter, carrier service, SIM fulfillment, and OS/device acceptance remain unverified.

Test scope and limitations are recorded in [estimate API evidence](../evidence/remote-ai-estimate-api-20261001.json).

### 2026-10-01 Persisted direct-text quote and execution path (local only)

Reusable: signed rate-card verification, Rockstar owner/session auth, RockstarOS service scope, active parent Zema job, D1 migration `0046`, A2A-shared parent budget pool, and the separate A2A signed-usage-receipt path. Implemented: owner/request-idempotent quote persistence, explicit approval digest, atomic cap reservation, single dispatch claim, same-input/model/tier revalidation, hold on timeout or unknown usage, exact itemized pricing, owner-only status/result readback, and opt-in saved result deletion. The public quote endpoints persist and expose the current state; `/api/llm/text` has a quote-bound remote execution branch. `tests/remote-ai-text-store.test.mjs` passes 9/9 with synthetic keys, credential, response, and SQLite D1 compatibility.

Workbench now connects selected parent jobs to estimate and persist direct-text quotes, set the per-task cap against the shared parent budget, explicitly approve only when execution is accepted, refresh status, retrieve opt-in saved output, and render itemized usage calculations. On reconnect the saved execution list is fetched again; a quoted task requires re-entering the exact request whose hash is bound to the quote. The current `remoteAiPricingGateAccepted()` remains false, so approval/dispatch is disabled and a `sending` record can show only its reserved cap because direct-text live provider meter is not connected. Remaining: UI/API/Worker HTTP end-to-end under an environment that can bind the local test worker, direct-text live provider metering and invoice reconciliation, then funded Wallet reservation/settlement acceptance. Synthetic test records and local meters are not production invoices, carrier activation, or OS installation evidence.

UXCHAR01受入（2026-09-21）: `npm run verify`全合格（型、lint、既存試験、production build、asset closure、仕事API149項目）。localhost:3017でSkyのアイコン詳細をEnterで開き、Zemaの一覧・発言から詳細をクリック表示し、Escで元の顔へfocusが戻ることを確認。開発用アカウントの架空出典1件をローカル処理し、完了状態・成果本文が顔の詳細へ反映されることを確認。390×844でもダイアログの本文・閉じるボタンを表示確認。自然会話モデル未接続、本番配備は今回未実施。

1. stock Pixel上でSky／ZemaからBroker、Local AI、汎用Tool、成果再表示まで一本で接続する。
2. 再起動と失敗復旧を含め、操作時間、手作業、再利用率を既存手順と比較する。
3. モバイル、keyboard、focus、処理中navigation、状態表示の回帰を残す。
4. UI上の「利用可能」「未接続」「準備中」をruntime事実と一致させる。

## 完了条件

- 対象RQと利用者の不便が明記されている。
- 正常系だけでなく、入力不足、切断、競合、再起動後の復旧を確認している。
- 画面文言が実装済み範囲を越えて本番・実機・収益を主張しない。

## 関連資料

- [avokadoの事業説明・解決する課題・製品入口](../../README.md)
- [AIネイティブOS詳細設計](../ai-native-os-architecture.md)
- [Sol設計監査](../ai-native-os-design-audit.md)
- [製品ベース](../product-baseline.md)
- [全体構成監査](../system-composition.md)
- [1.0戦略](../rockstaros-1.0-strategy.md)
- [1.0構成](../rockstaros-1.0-architecture.md)
- [Chat usability](../chat-usability-20260912.md)
- [フロント機能性監査](../frontend-usability-audit-20260915.md)

## 検証

- `npm run typecheck`
- `npm run system:composition:check`
- `node --experimental-strip-types --test tests/web-route-style-contract.test.mjs tests/sky-studio-chat.test.mjs`
- 主要画面の実ブラウザ操作

## 2026-10-02 Android Agent委任案の保存・復旧

Shell API v13は、所有者のZema実行/レビュー中jobから親jobを選び、署名・依頼文hash・見積期限・子/親上限を再検証して、未実行のAgent委任案をCloudへ保存する。作成POSTの前に親job ID・冪等キー・入力hashを端末内に永続化し、応答が不明なら再POSTせず、同じ三つの値でGET照合する。親job一覧は所有者認証・Zema利用権で絞り、promptや認証情報を返さない。ローカルWorker/D1の948 assertionでは、認証済み所有者にだけ実行中jobを返し、返却列をID・revision・status・title・更新時刻に限定することを追加確認した。委任案の保存はAgent実行、Wallet予約、請求を開始しない。source-contract checksは通過。Android SDK不在のためJava/AIDL/APK/実機は未検証。次は別個の有料実行同意、同一条件のローカルWallet hold、Broker proof、Cloud承認を一つのdelegation IDで接続する。証拠: [Android A2A Cloud draft bridge](../evidence/android-a2a-cloud-draft-bridge-20261002.json)。

## 2026-10-02 Android Wallet approval, reservation and Broker proof wiring

Shell API v14 connected the saved quote-bound draft to Core's native approval and reservation store. The owner confirms the exact owner, Cloud parent/delegation, Provider/Agent version, currency, quote digest, request hash, amount and deadline through the device credential screen. Approval expiry is deterministic from signed quote issuance, retries preserve the approval digest, and the exact HELD row recovers idempotently. Shell API v15 adds a separate explicit Cloud/offline-continuation consent and signs the Broker authorization only after `PlatformStore` verifies that same quote-bound HELD row. The proof is uploaded to the owner-scoped Cloud endpoint; uncertain POST results are read back without repost, and the delegation GET returns only registration metadata, never the signed proof. Release checks the Cloud state and refuses while a registered proof remains valid. The UI still says that the Cloud task remains awaiting approval: no Provider request, Cloud dispatch, payment capture, or invoice is performed. Full `npm run verify` passes, including the Worker/D1 API suite (948 assertions), `npm run typecheck`, source-contract checks, and SIM/eSIM entry test. Android Java/AIDL/APK/device acceptance remains unverified because the host has no Java/Gradle/Android SDK. The final Cloud approval handoff must atomically compare the Cloud state with native Wallet dispatch state before enabling execution; paid dispatch stays fail-closed. Provider billing, carrier activation, SIM fulfillment and OS/device acceptance remain unproven.

## 2026-10-01 RockstarOS端末の共通アカウント認証

ブラウザ/既存の認証gatewayへ一度サインインしてから、native端末の8文字user codeとdevice codeを結ぶDevice Authorization APIを追加した。ログイン中の利用者が端末名を見て承認し、端末は一回だけ返る90日セッションを受け取る。D1にはauthorization codeとtokenのSHA-256 hashを保存し、所有者向けセッション一覧と個別失効を実装した。`requestUser`を利用するAPIは同じBearer sessionから既存ownerを解決するため、サービスごとの再登録を要求しない。local Worker/D1 API suite 711 assertionsに、開始、表示、Origin拒否、承認一回性、poll一回性、期限切れ、entitlement/Sky/Zema API認証、平文token非保存、失効を追加し合格。合成ID/ローカルD1であり実利用者、Androidクライアント、保護ストレージ、本番セッションproviderの受入ではない。設計と残作業は[端末アカウント接続](../rockstar-device-link.md)、[ローカル証拠](../evidence/rockstar-device-link-local-20261001.json)。

[GTA VI調査§125、§131](../gta-reality-bridge.md#131-追加調査realismはユーザーの目標に役立つところだけ再現し選択の意味づけを奪わない2026-10-18--ai06-mat18-agent-ux) records Rockstar's self-reported iterative field research and its balance between realism and convenience as analogies for Avocado pilots. Automate irrelevant friction while surfacing constraints that affect outcome, authority, data sharing, cost, risk or reversibility; explain the recommended route and keep meaningful decisions with the user. No product UX or approval behavior changed.

[GTA VI調査§135](../gta-reality-bridge.md#135-追加調査accessibility-featureは実際に対応する版単位のmetadataとして見せる2026-10-18--rq14-catalog-ux-mat18) uses Sony's optional, developer-provided accessibility tag categories as a marketplace UX example. Avocado candidate: disclose accessibility controls by exact version and distinguish provider claims from tested behavior, with user filters and no inferred ability labels. The page does not establish GTA VI's tags; no catalog schema or accessibility claim changed.

Read-only cross-check found current [`sky-tool-package/1`](../lib/sky-tool-package.ts) rejects unknown fields and has no accessibility metadata. A versioned profile therefore needs explicit whole/tool-design and compatibility review before any schema change; this research does not authorize it.

[GTA VI調査§136](../gta-reality-bridge.md#136-追加調査offline-playの商品表示は全feature-license-checkのoffline保証ではない2026-10-18--ai06-sim-e-sim-catalog-trust) is a product-copy analogy: a store may say offline play is supported while its legal text says some services need an account/network. For Avocado, describe offline capability per action and recovery path instead of implying every component works offline. This does not alter existing connectivity enums or claims.

[GTA VI調査§138](../gta-reality-bridge.md#138-追加調査remote-play-platform-cloud-save-cross-platform-portabilityは別の能力2026-10-18--rq12-sim-e-sim-state-continuity) separates remote console access, same-platform cloud save and cross-platform migration. Avocado should use named capabilities and state evidence instead of treating “remote access” as a backup/restore guarantee.

The latest [§144 storefront/legal comparison](../gta-reality-bridge.md#144-追加調査remote-playはconsole-stream-cloud-saveはstate-roamingで別の条件を持つ2026-10-18--rq12-sim-e-sim-continuity) also finds the U.S. PS page listing “offline play enabled” while the legal description limits certain features to internet/accounts/codes/fees and notes services can change. Avocado candidate: break “offline” into launch, local actions, saved state, activation/license check, provider calls, sync, updates, and account-gated offers; each can have a different network requirement and recovery route.

[GTA VI調査§139](../gta-reality-bridge.md#139-追加調査対応言語の数とui音声字幕の内訳は別の表示項目2026-10-18--rq14-catalog-metadata) notes the product listings' language count does not reveal the interface/voice/subtitles matrix; Microsoft's publisher guidance treats those as separate declarations and supports a region/package caveat. Avocado candidate: versioned language claims by UI, audio, subtitles/transcripts and docs, with package/market limits and source/verification. Existing package schema has no such matrix; no catalog change is authorized or made by this research.

[GTA VI調査§140](../gta-reality-bridge.md#140-追加調査xbox-presence実績single-playerはそれぞれ別の事実2026-10-18--rq14-catalog-capability-claims) separates Xbox presence/achievement service features from single-player vs joinable multiplayer/co-op. Avocado listing candidate: keep owner activity, achievement evidence, persistence and actual invitations/shared execution distinct, and never infer collaboration from platform presence. No social or marketplace capability changed.

[GTA VI調査§145](../gta-reality-bridge.md#145-追加調査年齢区分購入表示任意性地域別表示を別々のclaimにする2026-10-18--rq14-catalog-trust-sim-e-sim) compares the current U.S. ESRB entry with PlayStation's mutable product copy: age/content rating, in-game purchase presence, optionality, platform function and subscription renewal are separate claims with distinct source and region scope. The CERO guidance in [§128](../gta-reality-bridge.md#128-追加調査age-ratingは国issuer対象mediaversionを結合し古いstore-copyと混同しない2026-10-18--rq14securityregional-catalog) similarly treats age category as insufficient evidence of purchases or online communication. Avocado candidate: keep these fields separately sourced and time-stamped, with stale/conflicting disclosures visible. This is research, not Avocado age policy, pricing or catalog schema approval.

[GTA VI調査§147](../gta-reality-bridge.md#147-追加調査日本ストアのrating-badge-legal-copy-決済条件の更新時刻を別に追う2026-10-18--sim-e-simregional-catalog-trust) directly cross-checks the Japanese PlayStation and Xbox listings. The PS page shows CERO Z/18+ terms but retains a generic pending-review purchase note; the Xbox page retrieved here still rendered pending imagery and had older crawl freshness, despite current trade-press reporting of an Oct. 17 update. Avocado catalog candidate: record store/region/SKU/observed-at, visible badge, legal copy, checkout rule and authority separately; recheck stale/mixed material before using it for eligibility. Store-specific Japan payment mechanics are not Avocado policy; no claim or schema changed.

[GTA VI調査§148](../gta-reality-bridge.md#148-追加調査ps5-pro対応badgeはゲーム別feature実証の代替ではない2026-10-18--rq14-catalog-metadata-device-capability) compares the GTA VI PS5 Pro badge with Sony's statement that Pro improvements vary by title. Avocado candidate: bind a compatibility claim to exact hardware/OS/runtime/feature setting/prerequisites and actual test result, and keep that badge separate from measured performance or guaranteed outcome. GTA VI's exact Pro modes are not quantified in the cited listing; no Avocado support claim or matrix changed.

The expanded [§147 Japanese rating and checkout comparison](../gta-reality-bridge.md#147-追加調査日本ストアのrating-badge-legal-copy-決済条件の更新時刻を別に追う2026-10-18--sim-e-simregional-catalog-trust) compares Xbox Japan's CERO Z card-only age-check rule and prepaid-balance restriction with PlayStation Japan's full-price card charge regardless of wallet funds. Avocado candidate: keep rating eligibility, account/store region, accepted funding source, wallet application and captured amount separate, and show which platform owns a checkout failure; do not copy these jurisdiction/platform-specific mechanics into Avocado policy.

The official PEGI updates described in [§145](../gta-reality-bridge.md#145-追加調査年齢区分購入表示任意性地域別表示を別々のclaimにする2026-10-18--rq14-catalog-trust-sim-e-sim) also demonstrate criteria and product-listing drift: new functionality criteria took effect for newly submitted games in June 2026, and PEGI began selected retroactive changes in October while asking publishers to update storefront listings and future marketing. Avocado candidate: timestamp the issuer's criteria version/effective window and each storefront's current display independently; track propagation rather than treating a previously observed classification as immutable. This adds a research candidate only; current exact-key package schema and rating policy remain unchanged.

The newly re-opened live Japan Xbox listing now shows CERO Z where a prior crawl showed a pending image, and the same Japanese PlayStation SKU continues to mix a pending-review checkout sentence with explicit CERO Z legal text; current product-page observations supersede the older snapshot without erasing it. Their one-month GTA+ preorder bonus also has separate Xbox and PlayStation eligibility/redemption/renewal wording in [§154](../gta-reality-bridge.md#154-追加調査同じ予約特典でもxboxとplaystationでgta-redemption期限条件の表現が異なる2026-10-18--sim-e-sim-rq15-promotion-state). Avocado candidate: bind claim snapshots to exact store, region, SKU, edition, locale, observation time and promotion instance; retain stale values as history, and do not normalize relative and fixed deadlines into one generic expiry.

The direct PS5 overview page also keeps a rating-undecided FAQ answer beside CERO Z legal/store content, and the launch-trailer press release still contains a pending-rating field, as documented in [§156](../gta-reality-bridge.md#156-追加調査同じps公式商品ページでcero-zの法的表示と未定faqが併存する2026-10-18--rq14-classification-provenance). Avocado candidate: resolve eligibility from the issuer record and retain site FAQ, store copy, checkout behavior and press-kit text as separate source artifacts with their own freshness and conflict flags; one stale snippet must not determine a global age gate.

The media discovery note in [§117](../gta-reality-bridge.md#117-追加調査公式launch-trailerはcinematic-media-assetとして提示しplayable-proofと区別する2026-10-18--rq14-media-discovery-accessibility) also checks Rockstar's music hub: score/single, curated station previews, and the full album/singles list have separate labels, and a trailer placement does not establish radio placement or reuse rights. Avocado can link such records while keeping asset type, preview scope, product placement, rights owner and reuse permission distinct.

[GTA VI調査§105](../gta-reality-bridge.md#105-追加調査ゲーム内の音楽licenseと動画利用権は目的媒体地域で異なる2026-10-17--rq14-ipmedia-provenance) rereads Rockstar's Jan. 2025 fan-content statement: permitted occasional non-commercial gameplay use is bounded by use, release state, spoiler/cutscene form and third-party music claims; the page routes broader commercial uses to case-by-case licensing. Avocado candidate: capture the submitted asset, release status, format, proposed audience and monetization before moderation; a fan-content policy excerpt is not a creator or redistribution license.

[GTA VI調査§150](../gta-reality-bridge.md#150-追加調査classification-recordは同じtitle文字列でもmedia-category-applicant-versionを照合する2026-10-18--rq14-catalog-trust) compares Australia’s Rockstar/T2 gameplay-demonstration record with a separate Netflix promotional-film record and same-name IARC search results. Avocado candidate: resolve ratings against artifact/version, medium, platform, issuer/submitter, market and date; title-only matches are candidates, not merged evidence. No age-gating or rating field changed.

Freshly reopened [§145](../gta-reality-bridge.md#145-追加調査年齢区分購入表示任意性地域別表示を別々のclaimにする2026-10-18--rq14-catalog-trust-sim-e-sim) cross-market comparison: the U.S. PS5 page says in-game purchases are optional, while today's Japanese PS Store listing shows “ゲーム内課金あり” and does not include that optionality sentence. This is a difference in market/page fields; it does not prove a purchase is mandatory in Japan. Keep purchase presence and optionality separate by market and source.

For [§147](../gta-reality-bridge.md#147-追加調査日本ストアのrating-badge-legal-copy-決済条件の更新時刻を別に追う2026-10-18--sim-e-simregional-catalog), CERO's own [rating-system explanation](https://www.cero.gr.jp/rating.html) defines the formal “審査予定” mark as pre-review promotional material. The Japanese PS purchase-help sentence that uses the phrase is not itself a classification decision; compare it to the current product badge/legal body and issuer record instead of letting a reusable template overrule them.


[GTA VI調査§160](../gta-reality-bridge.md#160-追加調査cfxはサーバー検索用metadataをportalへ移しタグを5個に制限予定-2026-10-18-rq14-catalog-migrationdiscovery) gives a current example of a listing migration: centralized owner-edited data, recently discoverable fields backfilled, visible “missing server data” prompt, five search-filter tags and normalized image sizes. UX candidate: let the owner preview exactly what is public, identify missing/auto-migrated fields, clarify which saved metadata controls search versus the detail card, and make the publication checklist actionable. Its Oct. 21 start is announced rather than observed complete and is specific to FiveM/RedM.


[GTA VI調査§161](../gta-reality-bridge.md#161-追加調査cfx-marketplaceでverified-creatorと個々のresourcecompatibilityを別に表示-2026-10-18-rq14-marketplace-trustcreator-onboarding) observes that Cfx profiles and details expose creator/status labels, search filters, price/purchase type, platform/framework, dependencies, source availability, docs, support and report affordance. Avocado candidate: define exactly what “verified” means, keep that badge separate from install/runtime acceptance, and reveal hard dependencies and fallback integrations before install; download volume is popularity, not quality. The specific resource's computer/SIM/app claims are seller-reported FiveM functionality, not GTA VI proof or demand validation.
[GTA VI調査§163](../gta-reality-bridge.md#163-追加調査ai-assistantの製品ラベルと実際のモデル権限を分ける-2026-10-18-rq14-ai06-security-boundary) uses Rockstar's GTA Online assistant and Mission Creator as adjacent interaction examples. The assistant's published actions and three personas are specified, but no model type is; do not let an “AI” label imply generative capability. The Mission Creator's editable examples, test loop and patch history suggest discoverable examples, resettable tests, validation, version/revision and failure recovery for any future approved authoring workflow. Neither is GTA VI support or Avocado demand proof; no product UI or creator feature changed.

[GTA VI調査§164](../gta-reality-bridge.md#164-追加調査公式mission-creatorの学習試作推薦執行は独立した段階-2026-10-18-rq14-creator-lifecycle) observes Rockstar's GTA Online sequence of editable examples, prototype feedback, publish, optional feature-consideration tag, player bookmarking/feedback, and separate editorial selection. UX candidate for any authorized Avocado author flow: show the current stage and next action, keep creator feedback/nomination/featured badge distinct, and explain which route accepts product feedback. No Avocado authoring/publishing/discovery UI changed.

[GTA VI調査§164](../gta-reality-bridge.md#164-追加調査公式mission-creatorの学習試作推薦執行は独立した段階-2026-10-18-rq14-creator-lifecycle) also notes the Oct. 1 GTAV 1.73 path where players nominate up to 16 jobs and some jobs nominated by current-lobby peers may enter the next-job vote. This is contextual opt-in discovery, not global ranking or guaranteed display; if Avocado ever suggests work/Tools, show reason/context, actual exposure and user selection separately. Do not copy Rockstar's limit.

[GTA VI調査§165](../gta-reality-bridge.md#165-追加調査creator向けaiは役割期待が割れるので提案の主導権と編集権を計測-2026-10-18-ai06-rq14) records a CHI 2019 mixed-methods study of an AI game-level editor: creator expectations of the AI role varied; the first study's participants deleted 60% of AI additions on average and a later qualitative study retained 14 practicing designers. Candidate for an approved authoring pilot: compare opt-in suggest/co-edit/review modes, make per-change accept/revise/undo/dismiss obvious, and measure control and recovery as well as speed. The paper isn't a GTA/Avocado evaluation or a universal user preference.

[GTA VI調査§166](../gta-reality-bridge.md#166-追加調査購入者レビュー不正通報返金サポートは別の窓口と証拠-2026-10-18-rq14-trustsupport) records Sony's US PlayStation review policy: only acquired-product accounts can post, reviews are public/account-linked, ratings/reviews are distinct from the report path, and the reviews surface is not technical support/refund support. Avocado candidate: show the product revision and the basis for any “purchased/installed/tested” label, disclose incentives and route support/report/refund to their actual owner. This Sony US policy is not Avocado or GTA VI contract language.

[GTA VI調査§165](../gta-reality-bridge.md#165-追加調査creator向けaiは役割期待が割れるので提案の主導権と編集権を計測-2026-10-18-ai06-rq14) additionally cites a 185-person mixed-initiative co-creation story study: preferences varied by creator/AI experience and participants wanted inspectable (“scrutable”) behavior. Its <30-minute story task and older model setup are unlike Avocado jobs; treat user-led vs agent suggestion, local vs whole-task reflection and inspectable behavior as pilot conditions, not fixed product modes.

[GTA VI調査§167](../gta-reality-bridge.md#167-追加調査contextual-aiは送信元ごとの選択と状態表示を測る-2026-10-18-ai06-mat18-privacy-boundary) references ContextCam (CHI 2024; 23 formative interviewees, 16-person/three-day study) as a context-aware image generation example. Inputs included location, weather, camera/face, music and phone screen, with per-source controls; actual use varied by person and some participants disabled sources as they learned the tool. UX hypothesis for a task-specific Avocado context selector: identify the exact job-relevant source(s), preview what will be used, provide no-context/easy opt-out, and measure comprehension/usefulness/burden. Not a call to add ambient sensors.


[GTA VI調査§168](../gta-reality-bridge.md#168-gta-vi%E9%A2%A8fivem%E5%95%86%E5%93%81%E3%81%AF%E5%85%AC%E5%BC%8F%E4%BB%95%E6%A7%98%E3%81%A7%E3%81%AA%E3%81%8F%E8%B2%A9%E5%A3%B2%E8%80%85%E8%87%AA%E8%BA%AB%E3%81%AE%E6%83%B3%E5%83%8F%E3%81%A8%E6%98%8E%E7%A4%BA-2026-10-18-rq14-catalog-claim-provenance) captures a FiveM seller using “GTA VI-inspired” in a paid HUD title and then acknowledging the interface claim is speculation. UX candidate: label official evidence, seller claim, independently reproduced compatibility and speculative inspiration separately, with source/date and correction route. This marketplace example is not GTA VI UI evidence or validated Avocado demand.


[GTA VI調査§169](../gta-reality-bridge.md#169-mission-creator%E3%81%AE%E5%86%8D%E8%B5%B7%E5%8B%95%E9%96%93%E8%A8%AD%E5%AE%9A%E6%BC%8F%E3%82%8C%E3%83%BB%E3%83%86%E3%82%B9%E3%83%88%E7%B5%8C%E8%B7%AF%E4%B8%8D%E4%B8%80%E8%87%B4%E3%81%AF%E7%8B%AC%E7%AB%8B%E3%81%97%E3%81%A6%E8%A8%98%E9%8C%B2) uses Rockstar's GTA Online Mission Creator patch defects as a bounded authoring/recovery analogy: identify the exact input revision and setup, test first-run and reused/restarted states, and expose reset after failure. It does not assert an Avocado defect or change a release gate.

[GTA VI調査§170](../gta-reality-bridge.md#170-gta-online%E3%81%AEcontent-rating%E3%81%AB%E3%82%B2%E3%83%BC%E3%83%A0%E5%86%85%E5%A0%B1%E9%85%AC%E3%81%8C%E4%BB%98%E3%81%8F) records GTA Online's in-game GTA$500 plus RP for rating content. If any approved Avocado feedback flow has rewards, state them clearly and separate rewarded feedback from product verification; the game-specific example does not set Avocado incentives or policy.


[GTA VI調査§171](../gta-reality-bridge.md#171-artifact-migration-family-sync-versus-cross-family-copy) notes GTAV Creator migration differences: same-family edits can sync, cross-family player-created missions are copied without future edit sync, while the listed shared ratings apply to Rockstar-created/Verified missions. Candidate for any authorized Avocado portability UI: label copy/fork/live-sync/export, source revision, edit direction, conflict behavior and whether feedback follows; no portability contract changed.


[GTA VI調査§172](../gta-reality-bridge.md#172-escrow-protected-vs-visible-files-customer-version-drift) records that Cfx Escrow seller reuploads replace seller-side prior versions while customers may keep downloaded older versions, and recent seller documentation separates encrypted Lua from editable configuration and unencrypted NUI. UX candidate: show installed revision, component visibility/protection, required companion updates, migration/backup path and unsupported integrations. No Avocado catalog/version behavior changed.


[GTA VI調査§174](../gta-reality-bridge.md#174-2026-mod-guidelines-multiplayer-ip-and-voice-boundaries) separates product info, single-player mods, multiplayer creator services and licensed creator marketplaces. Do not let “GTA VI-inspired” UI or Rockstar branding imply endorsement/compatibility; expose whether a feature is an Avocado product layer, permitted mod/channel, or unsupported/unverified. This Rockstar guideline is not proof GTA VI has any creator service. No interface/policy changed.


[GTA VI調査§175](../gta-reality-bridge.md#175-music-hub-score-radio-album-and-merch-distinction) notes Rockstar’s hub separates original score, six hand-picked in-game-radio previews, nine album singles, a 34-track album claim and separate physical preorders. Media catalog UX candidate: label product-playback vs promo vs album/physical item, exact source/license, territory/term/channel and sampled vs complete listing. An album listing is not proof in-game or external streaming rights. No Avocado media catalog or playback changed.


[GTA VI調査§176](../gta-reality-bridge.md#176-cfx-manifest-declared-targets-and-loader-requirements) uses Cfx `fxmanifest.lua` as an adjacent example of author-declared game/version targets and hard loader prerequisites, while separately noting deprecations and future manifest requirements. Avocado catalog UX candidate: reuse existing Tool fields but distinguish declared compatibility, blocking dependencies, deprecation date and independently tested version/host. A manifest or signature is not safety approval; no schema changed.


[GTA VI調査§179](../gta-reality-bridge.md#179-creator-popularity-is-not-item-quality) uses a 2024 Roblox study (1,301 fighting games) where creator followers/limited-item holdings correlated positively with popularity, not item quality. Avocado candidate: label popularity separately from item-specific rights, moderation and tested compatibility; disclose measurement window and paid-versus-organic placement. Study is platform/genre-specific; no Avocado ranking/badge changed.

[GTA VI調査§183](../gta-reality-bridge.md#183-追加調査ゲーム内のai起因エラーは作中の嘘と誤情報を区別しにくくする-2026-10-18--ai06-rq14-trust-ux) cites one 29-person CHI 2024 study of an AI-written 2D RPG; participants trusted some NPC claims and could interpret unexplained errors as bugs, while AI-writing disclosure reduced trust/attachment for some. Candidate UX check: mark model inference vs sourced/product fact, provide source/date and correction path, and test user calibration; preserve the existing non-trusted planner/Broker authority boundary. This is not GTA VI evidence or proof all users reject AI; no behavior or disclosure policy changed.

[GTA VI調査§184](../gta-reality-bridge.md#184-追加調査ai能力の開示効果は役割と熟練度で変わる-2026-10-18--ai06-trust-calibration) cites an arXiv preprint comparing a StarCraft II opponent and cooperative information assistant; disclosure effects differed by task and expertise, with potential overreliance. UX candidate: explain the component's role, allowed actions and limits; measure users' ability to predict authority and recognize errors instead of treating AI-label recognition or higher trust as success. Existing approval/Broker authority remains unchanged; preprint is not Avocado evidence.

[GTA VI調査§185](../gta-reality-bridge.md#185-追加調査ゲームのaccessibility-preferenceは診断名ではなく必要機能で表し実動作を検証-2026-10-18--ai06-deviceaccessibility-ux) cites a 2026 qualitative Access Profiles study (nine disabled players, five indie developers). It proposes feature preferences rather than diagnosis labels for discovery/configuration, while warning that tags/profile integration do not prove a feature works and are not certification. UX candidate: keep accessibility preferences optional, scoped and user-editable; distinguish self-described features from exact-version tested behavior and reports. Review against existing consent/profile contracts before changes; no schema or catalog claim changed.

[GTA VI調査§186](../gta-reality-bridge.md#186-追加調査作者向けtool支援には更新保守と再現できるbug-reportも要る-2026-10-18--rq14-sdk-maintenance) cites a peer-reviewed Nexus Mods analysis of 9,521 popular mods: official support correlated with faster releases/higher median endorsements, while many reports lacked actionable details or remained unresolved. Avocado already has a `rock-game-sdk-diagnostic/1` sandbox example; this paper does not justify replacing or extending it. Candidate: review the existing fixture and task contract for exact environment/version, reproducibility and privacy-safe evidence only if an approved Tool task exposes a concrete gap. One historical PC-mod platform, observational/selected sample; no GTA VI evidence or diagnostics changed.

[GTA VI調査§187](../gta-reality-bridge.md#187-追加調査安全を優先するai挙動は信頼再協力意向を上げても正しい権限判断の証明ではない-2026-10-18--ai06-trust-calibration) cites two controlled game experiments (N=88, N=153) where visibly benevolent behavior raised reported trust/use intent; every participant still completed the game and could not die. Avocado candidate: measure whether safety-related decisions are genuinely scoped and recoverable alongside trust/return intent. Persona or confidence is not authorization, rollback or correctness evidence. No AI or permission policy changed.
[GTA VI調査§190](../gta-reality-bridge.md#190-追加調査ローンチ映像の感情的な核は製品仕様の証拠と分ける-2026-10-18-product-ux-evidence-labeling) notes Rockstar's edited launch trailer puts Jason/Lucia's relationship at the emotional center and links diverse quick cuts with music. As a future demo/onboarding hypothesis, open with a recognizable user outcome, then anchor product claims in visible verifiable status and accessible detail for permissions/cost/recovery; measure task comprehension separately from affect/views. A single trailer is creative reference, not UX evidence. No marketing copy, UI or release claim changed.

## WebとPixelの発見型フロント（HOME01 / WEB04 / OS10）

2026-10-19の利用者の明示指示で、RockstarOSアプリ全体の見た目と操作をAirbnbのように、カテゴリ・検索/意図・カード棚で探せる形へ変更する。Web HomeはSky/Zema/仕事/利用権の実routeをカードにし、主要画面は共通の明るいtoken、丸い面、PC上部/スマホ下部ナビへ合わせる。Pixel Shellは同じ色・角丸・4画面ナビ、Homeのカテゴリと意図を先頭にする。主担当Product / UX、ROCK。EXTERNALのProvider/Carrier、JOINTのPixel build/実機、OWNERの承認・費用を画面変更で代行しない。既存の下書き引継ぎ、work/revision、権限、予算、状態と復旧は維持する。合格は同一sourceのWeb PC/mobile表示と操作、Pixel APK非破壊表示・引継ぎ・復旧の個別証拠で判断する。Mini/Proは機種別入力と表示の受入後に同じ意味の契約を移植する。詳細は[全体設計](../rockstaros-complete-design.md#全画面の発見型フロント2026-10-19の明示変更)。

## 自分のOS版とWorld（2026-10-20）

本人の最新指示を[全体詳細](../rockstaros-complete-design.md#personal-os-world-versions)へ反映。主担当Product/UX・ROCK、既存OS10/SKY21。最初は本人別edition schema/draft/preview/export/import、Skyの共有/複製、次に複数本人のWorld/ルール改訂/退出。Core権限・予算・秘密・Walletを作者設定から強制変更させない。EXTERNALはhost/モデル/決済/chain、JOINTは端末互換と別本人の共同運営受入、OWNERは各版・参加・権限・料金を選ぶ。現在は設計のみ。合格条件と残条件は全体正本の11項目を使う。
## smisのネットワーク効果（HOME01・SKY21・OS10 / ROCK）

2026-10-22本人指示を[全体正本](../rockstaros-complete-design.md#smis-network-effects)へ記録。Eveで作る→本人が共有→別本人がAdd/実用→改善版を共有、を最初の循環にする。既存Tool/コミュニティーOS共有は保持し、個人Agentの版付き配布と由来、実成果の発見への接続を不足として扱う。月16 USDと既存収益契約を維持し、private dataの公開/学習利用を推定しない。ROCKは共有/ACL/Add/CAS/計測、JOINTは別ownerの実利用、OWNERは公開/license/予算を担当。設計記録でありruntime未受入。受入条件/検証順は同節11項目、設計変更はdesign/baseline/projectチェックと最終verify、runtimeのA→B→C/UI/公開/実端末は次工程。
