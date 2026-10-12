# Sky ローンチ運用・受入

最終判定日: 2026-10-02。設計の正本は [Sky サービス設計](sky-launch-design.md)。下記は実装在庫と公開環境で観測した条件であり、一般利用・売上・銀行着金の証明ではない。

## 最新の公開状態と判定

2026-10-02: 既存Sky v28（source cb55411549649bd57429fa1afeb974139fc024da）公開成功。CSV専用Stripeはliveで、既存JPY50円受付はcompleted/stripe_verified/attempt1/revision3を公開D1で再確認した。新しい決済はしていない。一般MarketplaceのStripe/Connect受入とは別。クラウドProvider keyと信頼料金は未設定、pricing gateはfalse、production Cloud executionは0件。Pixelは接続済みだがロック中。保存回答管理と会話引継ぎの合成受入を本番owner/実AIの証明にしない。

`focused` stageを追加し、既存basic条件に実Cloud AIの応答・所要時間・項目別usage/cost・上限/timeout、同じ公開sourceのdesktop/Pixel顧客導線、全34 Toolの個別分類、対応端末のApple Payを加えた。既存paid-marketplace/clients scopeを省略せず独立して保持する。`node scripts/check-sky-launch.mjs --require-stage focused` は不足が残る限りexit 1で、設定キーの存在やmockだけでは合格にしない。検査自体の整合は`npm run verify`へ追加した。必要stage/gateの削除、基本受入の省略、合成環境のpassed、根拠欠落、依存cycle、未完了でのlaunch claimを7件の試験で拒否する。

旧version4/v8の観測は下記の履歴として保持する。最新公開と混同しない。

## 現在の機能と不足

CatalogにはSkyのToolが12件、導入候補が22件ある。`ready` は掲載分類であり、本番の稼働保証ではない。公開Registryの審査済み外部件数は、取得完了前の表示を0件として集計しない。

| 機能群 | 実装済みの範囲 | ローンチ前の確認 |
| --- | --- | --- |
| 検索・カテゴリ・LLM・対応環境 | 独立Market、候補と審査済み外部の区別 | スマホ/PCで選択→詳細→実行まで受入 |
| 記事無料版・出典整理 | ブラウザ処理、Markdown取得、任意の端末保存、実行履歴 | 公開本人サインイン、保存/再読込、本文漏洩なし |
| 法務・特許 | 標準ガイド/整理、同意付き外部AI入口 | 標準機能の受入。外部AIは契約・予算・実接続が別途必要 |
| ココナラ | 本人別案件台帳、条件・担当・制作・支払いの記録 | A/B分離と再読込。応募/外部振込の成功にしない |
| CSV | 受付、見積り、入金照合番号、決定的変換、独立検査、私有成果取得/削除 | 本番の保存→取得→削除、期限/本人分離。カード掲載の税込3,000円は試験条件で、自動Stripe徴収ではない |
| Market Scanner | PAPER市場の分析・模擬注文 | 実資金の売買/送金・実収益として案内しない |
| メルカリ | 出品準備と利益計算 | 個人出品の外部操作、Shops Connectorは個別接続 |
| ブランド運用 | ブラウザ簡易プラン、PC/MCPの実装 | mock成果と実投稿/受注/課金を区別、提供者接続受入 |
| 納品記録・サブスク台帳 | PC側Python/SQLite処理と接続契約 | 公開Web→本人PC接続、読取範囲、停止/失効 |
| Jev品質評価 | Cloud評価と同意・上限 | AI Gateway接続が未設定。本番評価の受入が必要 |
| 作者掲載・SDK/Studio | 申請、Package登録、hashに結び付く審査、公開Registry | 審査者設定と実在作者1件の公開→第三者実行→更新/失効 |
| 購入・販売・返金 | Stripe Checkout/Connect、署名通知、再照合、購入記録 | Stripe設定/KYC、sandbox、提供者の購入権限強制、本人の実決済受入 |
| OS/Mini/他アプリ | 共通Tool契約・既存OS接続設計 | 別clientの認証/購入権限/正本履歴、Mini能力と実機受入 |

## 公開環境の観測

2026-10-01 12:43 UTCにSky専用Siteのversion 4を公開。12:48 UTC頃に通常ブラウザの `/sky/help` で以下を読み戻した。

- 実行記録: データ保存サービスに接続可能。
- CSV: 保存設定あり。R2の実際の書込/取得/削除はまだ本人の受入が必要。
- 法務・特許の外部AI: 接続待ち。標準ガイドを利用可能。
- Jev: 外部AIの接続待ち。
- 購入・販売: 決済サービスの接続待ち。

公開version 4のSource SHAは `563f2844be18e476d0ec80893d139561e90643b7`。GitHub mainの照合時点は `b3e2676abd8ae2a0b3f78f48483e067b429d9bc8`。両者を同じ更新として扱わない。後続の配備ID/Source SHAは配備結果の引継ぎ記録へ保存する。

## 設定の準備

秘密値をchat、Git、原稿、公開Issueへ貼らない。Siteのサーバーsecret設定面を使用する。設定は接続成功を保証しない。

| 対象 | 必要設定 | 条件 |
| --- | --- | --- |
| 作者審査 | `SKY_REVIEWER_SECRET` / `SKY_REVIEWER_ID` | secretは40文字以上。IDは3〜100文字、既存の小文字英数字/区切り契約。審査者だけが保持し、一般作者へ配布しない |
| 法務・特許AI | `SKY_REMOTE_LLM_ENABLED=true` / `OPENAI_API_KEY` | モデルAPI契約・利用予算・送信同意・上限を確認。ChatGPTサブスクリプションと別 |
| Jev評価 | 同remote有効化 / `AI_GATEWAY_API_KEY` | 実際のJevモデル可用性、送信先条件、費用をproviderで受入 |
| 決済 | `SKY_PAYMENTS_MODE` / `SKY_STRIPE_SECRET_KEY` / `SKY_STRIPE_WEBHOOK_SECRET` / `SKY_PAYMENT_ORIGIN` | 最初はtest、環境と鍵の整合、公開Skyの正確なOrigin。liveへ切り替える前に受入 |

AIやStripeの本番契約情報が未回答のため、架空の値や別サービスの秘密を流用しない。購入のreceiptとproviderへの実行権限は別である。

## 本人による基本利用の受入

個人情報を含まない短いサンプルで行う。既存本人のサインインを使い、代理で新規規約同意や本番購入を完了しない。

1. 未ログインでMarketが開き、掲載数と候補/接続条件を区別できる。
2. 出典整理からサインインし、戻り先が選んだToolへ戻る。
3. 重複するHTTPS URLを含むサンプルを整理し、結果とMarkdownが一致する。
4. 任意の端末保存→再読込→削除を試す。共有ブラウザの保存範囲は案内どおり。
5. 別本人Bのserver履歴/案件/CSVで本人Aのデータを返さない。
6. CSVサンプルを仕様どおり変換し、変更報告と独立検査が一致する。結果を取得し、削除後は取得できない。
7. 非公開stagingで期限経過、保存失敗、接続切れ、再送、復元を試す。実ユーザーのファイルを故障試験に使わない。

各結果に日時・環境・使用版・担当・期待/観測・失敗原因を残す。原文、CSV本文、tokenを証拠へ保存しない。

## 作者1件の市場受入

1. 配布権利のある実在Toolを作者本人で登録する。fixtureを一般商品にしない。
2. manifest、作者、版、license、料金、送信先、権限、停止/再試行、入力/出力契約を確認する。
3. 接続検査と審査証拠を現在のmanifest hashへ結び付ける。`/api/sky/tool-reviews` には審査者資格が必要。
4. 公開Registryがその有効版だけを返すことを確認し、別利用者Bが必要な認証と同意を経て実行する。
5. 版更新で旧審査を流用しない。停止/失効後は新規起動を拒否する。
6. OAuth/MCP/PCの秘密が画面・履歴・ログへ残らないこと、timeoutで完了扱いにならないことを確認する。

## 決済受入

[既存の決済設計](sky-billing.md)に従う。設定とConnect本人確認、JPY買い切り商品、10%手数料、販売/返金条件を確定する。匿名Stripe通知がraw bodyと署名を保ったまま到達するかを最初に確認する。本人用APIの認証を外して通知を通さない。

sandboxで成功、取消、失敗、通知再送/順序逆転、受取先停止、返金/紛争、本人違いを試す。提供者が未購入/別本人/返金済み/失効した利用権を拒否して初めて有料Toolの受入となる。銀行着金と注文のpaidを別に照合する。

## 障害・更新・復元

- 一般公開前に、私有問い合わせ窓口と責任者、応答時刻、サービス停止/再開の手段を確定する。公開Issueには原文・秘密を送らせない。
- provider障害は外部AI/Toolだけ停止し、ブラウザ内の有限処理まで不要に停止させない。結果不明の外部操作は照合してから再開する。
- 購入/返金が不明なら再課金を止め、Stripe再照合と注文receiptを確認する。DB上の状態を直接paidに書き換えない。
- D1と私有R2を対でバックアップ・復元し、owner、hash、期限、削除済み状態の整合をstagingで確認する。
- CSVの7日は取得期限。再試行可能な削除処理と定期handlerを実装したが、本番Triggerは未設定・未受入。processing中の仕事は保護し、停止した処理のlease復旧と物理削除の保証時刻は別途受入する。
- GitHub正本は既存drizzleの追記migrationで更新する。CSV支払い台帳0037を保持し、Skyライブラリは0059を追加する。専用Sitesの静的schema bootstrap/versionとcanonical migrationの番号を混同しない。旧codeへの切替だけではDB/R2を復元したことにならない。

## 完了判定

`npm run sky:launch:check` は不足を一覧にする。`node scripts/check-sky-launch.mjs --require-stage basic` は必要証拠が未合格なら失敗する。marketplace、paid、clientsも独立判定する。現時点は全stageの一般受入が未完了である。

運営者に残る入力は、API/Stripe契約の有無、本人サインイン、実在作者/商品、私有サポート宛先、契約条件と販売者情報。実装担当に残る仕事は、それを受けた本番受入、provider entitlement、別client認証、定期cleanup、停止/復元受入。仮の契約やmockの結果で穴を埋めない。

## Pixel実機受入の現在地

2026-10-01、利用者のUSB接続指示を受け端末1台を検出。USB承認後にPixel 10／GL066／frankel、Android17・API37を既存の限定property readerで確認。PixelのSky画面操作は本人から明示許可済み。Vanadiumで公開Marketの表示、Android向け絞り込み、CSV検索1件、詳細からCSV専用画面への移動と未ログイン時のサインイン案内を実機確認した。本人ログイン、受付・処理・保存・再表示・ダウンロード、本番利用者の分離は未受入。スクリーンショットと結果を受入JSONへ記録した。[受入記録](evidence/sky-pixel-service-acceptance.json)にWeb/CSV/端末readerのhost試験と再build後のAPI回帰を残した。端末診断は既存 `scripts/inspect-phone.py` の限定property readerを使い、serialと全getpropを証拠へ保存しない。実機操作や本番ログインが通るまで、基本利用gateを合格へ変更しない。


2026-10-01追加受入: 公開Sky v8（632ac3eb…）でPixel本人ログイン、サンプルCSV処理、検査合格・納品可能の表示、サーバー再読込後の同受付復元を確認。result.csv 0.09KBの既存ダウンロード確認がブラウザに出た。CSVバイト/hash、別本人隔離、削除は未受入。50円試験の入口は公開済みだが、本番キー・CSV署名secretが未登録で無効。Stripe本番有効化は本人情報確認の途中で本人作業待ち。


Stripe最新readback: 本番ダッシュボードへ到達したが支払いが一時停止。追加情報タスクはセキュリティ対策措置状況申告書で、担当者の本人確認書類タスクも残る。申告の実施者・実施済み対策は本人が確認し提出する。フォームを本人操作用に残し、未確認の対策や本人情報は代理入力していない。Sky非公開設定には本番API keyとCSV専用署名secretが未登録。実課金は未実施。

### 掲載候補の入力忠実性と個別受入（2026-10-02）

全34件の画面をSky v28のbuildで個別確認し、20候補を合成ownerの実Worker/D1で実行・完了記録・結果バイト数まで照合した。11件は端末内の定型下書き、9件は接続計画。サービスとしては過去の限定本番受入3／local14／接続必須16／当環境で利用不可1に分類する。各IDと環境・保存範囲は`docs/evidence/sky-individual-tool-verification.json`へ記録し、これだけで同じ公開版の全顧客導線や外部サービス成功を合格にしない。

顧客インタビューの固定テーマ・仮説と予定調整の固定日時・時間・形式が入力に反することを再現した。候補処理はAI分析済みと表示せず、入力を添えた記入用テンプレートであることを画面と出力へ示す。2 Toolは未検証のテーマ・仮説・日時を自動確定せず、確認欄を未記入にする。本文・結果はserverへ送らず、共通jobsへ状態・処理時間・サイズを記録する。reloadで候補の本文は復元されないため、Markdownを手元へ保存する。クラウドAIの実接続とカレンダーOAuthは残る。合格条件は異なる合成入力でも固定の事実を捏造せず、入力保持、外部未実行表示、metadataと出力サイズ一致を再buildしたUIで確認すること。

候補の認証失効試験では、旧共通signinが同じタブを遷移させ、直接Tool画面の入力がサンプルへ戻る不具合を再現した。共通ExecutionSigninは元画面を保持し、別タブsigninと明示GET接続確認へ変更する。成功はowner jobsのJSON配列を読み戻して判定し、401/redirect・通信失敗・不正JSONでは既知の失効を解除しない。接続確認はjob作成/実行を再送せず、本人の次の実行まで入力をメモリへ保持する。全Toolの本文を10分保存すると誤って約束していた共通説明も訂正した。候補と記事Toolで未認証→別タブsignin→接続確認→一度だけの実行、確認失敗時の停止を再buildしたUIで受け入れる。

配備受入: 既存Sky v30/source 5bdb4ecc0a1f12eb7036163818c4bbb86e224e78、env rev2で公開成功。20候補の処理と保存サイズ照合、2入力反例、candidate/articleの別タブsignin復帰・503時停止・手動2回だけの記録を合成Worker/D1/UIで確認。公開未認証UIで新案内・別タブtarget・実行停止を読み戻した。正本verify692/19/948・exit0、Site type/lint/build/bundle/assets合格。Site全設計検査は元v28に欠けているeSIM設計参照で失敗し、全体greenに換算しない。旧50円completed/stripe_verified/attempt1/rev3を配備後も確認し、新規課金なし。実Cloudは0件/資格情報なし、Pixel 10は現時点Keyguard showing=true。owner desktop/Pixel、Apple Payと実Providerは未受入。GitHub mainはb3e2676、今回の正本変更は未pushでSitesソース保存と区別する。


## 2026-10-02 — CSV受付衝突の保存保護と実公開認証境界

WEB04/ROCK: 旧v30の合成Worker/D1/R2で、別ownerが既存受付IDを指定するとHTTP500になり、先のownerのR2入力が消えることを再現した。全IDの衝突を409として拒否し、同時受付ごとの一意input keyを保存rowへ結ぶ。INSERT応答が不明な時は保存rowを照合し、勝者のinputを削除せず、DB照合不能なら入力を保持する。修正したbuildのCSV実API回帰95項目（同owner replay、別owner、同時受付、成果4種、再起動、削除、期限切れ）が合格。旧v28→v30→v28の更新・rollbackでも同一成果hashを保ったが、停止・バックアップ復元を含む本番復旧gateの合格にはしない。実公開v30で公開2件200、私有API6件と偽認証2件401を確認。非user platform credentialは本人signinの代替ではなく、匿名拒否をowner成功へ換算しない。Pixel 10はshowing/inputRestricted=true。追加課金・実Provider送信なし。証拠docs/evidence/sky-csv-storage-verification.json、docs/evidence/sky-production-auth-verification.json。Site公開と正本全体verifyはこの修正ではまだ未完了。


配備完了（CSV保存保護）: 既存Sky v31/source c89a651d9e2cd29011f2f6153201a93a82033643、deployment appgdep_6abf90330634819184f3095d248bc118、env rev2で公開成功。配布アーカイブのlocal永続D1/R2による138項目が合格し、旧固定input_keyの成果4種hashを更新後も保持した。旧v28へのrollbackは合成データの読み戻し試験だけであり、既知の衝突不具合を戻す本番復旧手順として使わない。全体verify exit0（692 Node/19 Fashion/948 Worker-D1＋95 CSV-D1-R2）、最後の検査コードlint修正は対象lintと95項目で再確認。公開v31では公開2経路200、私有6経路・偽認証2経路401。旧JPY50円CSVはcompleted/stripe_verified/attempt1/revision3、成果hash99fbb674…を公開D1で再確認した。デザイン・env設定維持、追加課金なし、Cloud実行0。本人の既存ブラウザーはreload後signin待ち、Pixelはロック中。実owner、実Provider資格情報/信頼料金/予算、Apple Pay、停止/backup復元、サポート条件の受入が残り、完全ローンチ未完了。正本変更は未push、Site保存とGitHub main統合を区別する。証拠docs/evidence/sky-csv-storage-verification.json、docs/evidence/sky-csv-storage-publication-verification.json。


## 2026-10-02 — 私有CSVの期限切れ再試行と対の保存復元

WEB04/ROCK: 公開v31の実アーカイブで合成CSVをquality_failedにし、入力を復旧して期限切れへ変更したところ、retryがHTTP200/completed/attempt2になった。取得/初回acceptだけの期限確認では不十分なため、共通processCsvJobのclaim前にも期限を確認し、ownerのexpired rowとobjectsを削除して410を返す。匿名/別ownerは削除へ進めず、期限内の品質再試行は引き続き可能とする。修正build、API回帰、全体verify、公開はこの差分では未完了。

別の合成stagingではv31 Workerを停止しD1/R2を対でsnapshot、保存領域を実際に喪失させ、整合manifestを確認して対で復元した。owner row、入力hash/metadata、成果4種hash、実行event、snapshot前の削除保持、復元済み期限切れの410・purge、別owner/匿名拒否、改変snapshot拒否の82項目が合格。復元観測349msはlocal fixtureだけであり本番RTOではない。snapshot後のowner書込は0。本番Sites backup/restore、offsite暗号化・保持期間、snapshot後の削除journal replay、停止操作の受入は残る。旧脆弱版へのproduction rollbackは使わない。証拠docs/evidence/sky-paired-storage-recovery-verification.json、docs/evidence/sky-csv-expiry-verification.json。追加課金・実Provider送信・本番データ喪失なし。


配備完了（期限切れ再試行）: 既存Sky v32/source 5fcfe884d7038723e228156a54bfd78bfcabde89、deployment appgdep_6abf94008be08191953fc7c67e647eb0、env rev2で公開成功。正本verify exit0（692 Node/19 Fashion/948 Worker-D1＋113 CSV-D1-R2）。Site type/lint/build/bundle/assetsと113回帰が合格し、同じ配布アーカイブでexpired retry 410、対snapshotの実喪失/復元を84項目確認。旧JPY50円受付と成果hashを公開D1で再確認し、追加課金なし。環境keyは既存Stripe4件のみでOPENAI_API_KEYなし。本人desktop接続確認はsignin待ち、Pixel 10はshowing/inputRestricted=true。実Provider key/信頼料金/予算と両端末owner・Apple Pay・本番backup/削除journal・サポート条件は未受入。正本未pushとSite保存を区別し、完全ローンチは未完了。証拠docs/evidence/sky-csv-expiry-verification.json、docs/evidence/sky-csv-expiry-publication-verification.json。


## 2026-10-02 — GitHubへのCSV修正の切り出し

WEB06/ROCK: 正本main b3e2676から今回のCSV受付衝突/競合cleanupと期限切れprocessing/retryだけをbranch codex/sky-csv-storage-retentionへ切り出し、commit05f676338944f60e05552b22dddc6f50453e3be6とdraft PR https://github.com/k999ln/rock/pull/51 を保存した。main自体のlockfile・migrationでtype/lint/build/design、172 Worker API＋113 CSV-D1/R2が合格。全文verifyは既存visual-system baseline不整合でexit1。Node全体440中429pass/11failで、PR差分を退避した未変更main controlも同じ11失敗。GitHub同一HEADのCI run37002726882もNode22.23.3の同じbaseline assertionでfailure。署名制御CIはsuccessであり一般verifyの代わりにしない。デザインや未反映のStripe/Cloud/SIMをこの差分へ混ぜず、mainへのmergeは未完了。公開Skyはv32/source5fcfe884を維持し、PRは公開版の全sourceではなく同等CSV修正だけ。自分の合成runtimeとGitHub保存済み一時worktreeを整理し、正本・本番データを触らなかった。次は既存mainの検査/文書/migration不整合を既存デザインを維持して解消してからCI/mergeを判断し、owner desktop/Pixel・実Provider credential/rate/budget・Apple Pay・本番復旧/運営受入を続ける。証拠docs/evidence/sky-csv-github-sync-verification.json。完全ローンチ未完了。


2026-10-02 Sky引継ぎ（GitHub検証復旧）: PR #51のhead `691fb279a3c4238ef46f956a76b558c987bac850`でfresh npm ci／Node22.23.3の全体CI `37004335830`とrelease-signing `37004335480`がsuccess。既存pale-blueにbaselineを合わせ、英語README、37-table migration union、Fashionの現行保存buttonを検証する。CSS/componentは変更せず、CSV保存衝突・期限切れretry修正は維持。CIはNode441、Fashion19、Worker-D1 172、CSV-D1/R2 113、bundle131・asset114/missing0と公開crypto fixture303/rejection142を通過した。証拠`docs/evidence/sky-release-verification-alignment.json`。canonical dirty treeの同名tests/migration-unionは別の67-table作業を含むため、37へ上書きしない。PRはdraft、mainはb3e2676で未merge。live Skyは同じprojectのpublic active v32をnative取得で確認し、env revision2はStripe用4キーだけ。初回publicationフィールドのv28とは別にcurrentRuntimeReadbackへ最新v32を明記した。desktopはサインイン待ち、Pixelはkeyguard表示。実Cloud/owner journey/Apple Pay/production復旧は未受入。次は不足するproviderの本人設定とowner実機・desktop受入、main統合判断、運用gateを進める。キーをchatへ貼らせず、owner操作を代行認証しない。

## 共通接続復旧の公開v33

公開v33は接続未確認時の実行停止と同じ画面の入力保持・読取再確認・明示実行を反映した。接続設定の取得失敗中は保存を止め、認証復旧後は編集入力を保持して一覧を読み直す。合成ローカルの出典整理・記事・設定保存/再取得は確認済み。native配備・保護APIと既存50円CSV記録の読戻しは[配備証拠](evidence/sky-access-publication-verification.json)を参照。実AI資格情報/信頼済み料金/利用予算、本人desktop/Pixel、Apple Pay、外部実連携は残り、ローンチ完了ではない。


## CSV期限切れ削除の候補

`lib/csv-retention.ts`が本人操作と期限切れ削除の共通処理を持つ。先に本人・job ID・revision・非processingを照合して`cleanup_pending`へ更新し、新しい処理開始をfenceする。作成ごとにランダムなinput keyから成果keyの世代を分離し、claimとDB最終削除にもinput keyを照合する。同じ受付番号を再作成しても、遅い旧削除は新しいinput・成果・DB行に作用しない。元のinput keyとその世代の4種類の成果key（旧版の固定keyも互換cleanup）を削除するため、DBへの最終記録前に書かれた部分成果も対象になる。記録されたkeyが別jobのprefixを指す場合、削除を拒否して記録を保持する。

R2削除失敗ではkeyとjobを保持し、再試行で不存在objectも安全に扱う。R2削除後のDB失敗ではjob/eventの削除をD1 batchのtransactionでrollbackし、worker再起動後も削除待ちから再試行する。CSV試験の独立支払いsession台帳は削除しない。集計logはscanned/deleted/failed/changedの件数だけで、owner・ファイル名・本文・key・Stripe情報を出さない。

本人一覧は期限切れを表示せず、削除失敗1件で有効な仕事の一覧を停止しない。未期限の本人削除が失敗した行は「削除待ち・再試行可能」と表示し、成果取得と新しい処理を止める。処理中の本人削除は409で拒否する。期限切れの処理中jobは取得410で拒否するが、active writerとの競合を防ぐため自動削除から外す。長時間停止したprocessingの検出・lease照合・停止後の削除は未受入。

Workerの`scheduled`は既知のCSV Cronだけを処理し、1回20件を上限に、失敗した行を後ろへ回しつつ他の行を続ける。失敗件数があればCron実行を例外にして監視から成功と見せない。handler単体では定期実行されない。本番へのTrigger登録とSites配備の対応確認は未完了であり、SitesのAI編集scheduleをデータ削除Cronの代わりに作らない。DDL・新しいDB・binding・権限・本番secretは追加していない。

合成localhostの実Worker/D1/R2で、本人分離、20件上限、支払いsession保持、部分R2削除、DB失敗rollback、再起動、誤ったprefixの拒否、処理中保護、結果再取得を検証する。R2の部分失敗注入は同じsource helperを実ローカルD1/R2へ渡すcomponent試験で、Provider障害の実証とはしない。公開の物理削除、運用監視通知、processing lease復旧は合格へ転記しない。
