# Sky ローンチ運用・受入

対象日: 2026-10-01。設計の正本は [Sky サービス設計](sky-launch-design.md)。下記は実装在庫と公開環境で観測した条件であり、一般利用・売上・銀行着金の証明ではない。

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
- CSVの7日は取得期限。未配備候補には定期cleanup handlerと失敗後の再試行を実装したが、本番Cronは未設定・未受入。処理中の仕事は対象から外し、停止したprocessingのlease照合は別途必要。物理削除の保証時刻を契約へ書かない。
- Skyの未配備候補はruntime schema v4。静的bootstrapは既存DBにも不足table/indexを補い、全guardが揃うまでAPIを503に止める。0037のCSV支払い台帳と0038のライブラリは追加のみ。破損tableや既存dataの変換は自動修復しない。旧codeの再配備だけでDBを戻さず、旧codeとの互換と対になるDB/R2復元を別に受け入れる。

## 完了判定

`npm run sky:launch:check` は不足を一覧にする。`node scripts/check-sky-launch.mjs --require-stage basic` は必要証拠が未合格なら失敗する。marketplace、paid、clientsも独立判定する。現時点は全stageの一般受入が未完了である。

運営者に残る入力は、API/Stripe契約の有無、本人サインイン、実在作者/商品、私有サポート宛先、契約条件と販売者情報。実装担当に残る仕事は、それを受けた本番受入、provider entitlement、別client認証、定期cleanup、停止/復元受入。仮の契約やmockの結果で穴を埋めない。

### 掲載候補の入力忠実性と個別受入（2026-10-02）

全34件の画面をSky v28のbuildで個別確認し、20候補を合成ownerの実Worker/D1で実行・完了記録・結果バイト数まで照合した。11件は端末内の定型下書き、9件は接続計画。サービスとしては過去の限定本番受入3／local14／接続必須16／当環境で利用不可1に分類する。各IDと環境・保存範囲は`docs/evidence/sky-individual-tool-verification.json`へ記録し、これだけで同じ公開版の全顧客導線や外部サービス成功を合格にしない。

顧客インタビューの固定テーマ・仮説と予定調整の固定日時・時間・形式が入力に反することを再現した。候補処理はAI分析済みと表示せず、入力を添えた記入用テンプレートであることを画面と出力へ示す。2 Toolは未検証のテーマ・仮説・日時を自動確定せず、確認欄を未記入にする。本文・結果はserverへ送らず、共通jobsへ状態・処理時間・サイズを記録する。reloadで候補の本文は復元されないため、Markdownを手元へ保存する。クラウドAIの実接続とカレンダーOAuthは残る。合格条件は異なる合成入力でも固定の事実を捏造せず、入力保持、外部未実行表示、metadataと出力サイズ一致を再buildしたUIで確認すること。

候補の認証失効試験では、旧共通signinが同じタブを遷移させ、直接Tool画面の入力がサンプルへ戻る不具合を再現した。共通ExecutionSigninは元画面を保持し、別タブsigninと明示GET接続確認へ変更する。成功はowner jobsのJSON配列を読み戻して判定し、401/redirect・通信失敗・不正JSONでは既知の失効を解除しない。接続確認はjob作成/実行を再送せず、本人の次の実行まで入力をメモリへ保持する。全Toolの本文を10分保存すると誤って約束していた共通説明も訂正した。候補と記事Toolで未認証→別タブsignin→接続確認→一度だけの実行、確認失敗時の停止を再buildしたUIで受け入れる。


## 公開v33からschema v4候補への配備・復旧条件

2026-10-02の照合では公開先は既存Skyの `appgprj_6abdfad4c5648191bcae957913bd02fa`、公開version 33。候補のnative Sites sourceとGitHub mainは異なる履歴なので、このworktreeのnative履歴をGitHubへpushしない。Sky用の4つの決済設定名は既存設定を再利用し、11hotelや別Siteへ付け替えない。値をログ/証拠へ出さない。汎用Market webhook secretとAI provider資格情報は、確認時点の設定名に存在しない。CSVの専用webhook secretは別であり、汎用購入権限へ流用しない。

配備前に、候補source commit、server/client bundle hash、migration journal（0037/0038）、schema bootstrap、既存DB/R2 bindingと秘密設定名を同じ候補の記録へ固定する。新しい同名DBやbucketを作って稼働済みの記録を失わない。旧版のCSV job・Stripe session・私有artifact・接続失効状態を含むバックアップと復元を非公開環境で確認し、支払い不明は再徴収せず照会する。公開DBの破損実験、Stripe状態の手書き変更、本人PC権限の代行発行は行わない。

新しいWorkerはAPIの初回requestでschema guardを確認する。失敗は503/Retry-Afterで止まり、v4 markerを先に書かない。同一の失敗promiseを保持せず、修復後の次requestで再試行する。既存v3、部分失敗、保存済みCSV/支払い/成果物の保持は、built Worker/D1/R2の合成212 assertionsで確認済み。本番DB/R2からのexport・restore、実稼働Worker切替、旧Workerへのrollbackは未受入。

配備後は取得したdeployment IDとsite versionをsource/buildに結び付け、公開本人のSky保存→Zema library→run→結果取得、本人A/B分離、認証失効、支払い/購入権限、停止/復旧をこの配備で再検証する。local synthetic結果や公開v33の過去の有料CSV完了を新配備の受入に転記しない。最終判定は `npm run sky:launch:check -- --require-stage complete` でpaidとclientsを両方要求する。設定あり・candidate提出・stage合格を区別する。


## CSV期限切れ削除の候補

`lib/csv-retention.ts`が本人操作と期限切れ削除の共通処理を持つ。先に本人・job ID・revision・非processingを照合して`cleanup_pending`へ更新し、新しい処理開始をfenceする。作成ごとにランダムなinput keyから成果keyの世代を分離し、claimとDB最終削除にもinput keyを照合する。同じ受付番号を再作成しても、遅い旧削除は新しいinput・成果・DB行に作用しない。元のinput keyとその世代の4種類の成果key（旧版の固定keyも互換cleanup）を削除するため、DBへの最終記録前に書かれた部分成果も対象になる。記録されたkeyが別jobのprefixを指す場合、削除を拒否して記録を保持する。

R2削除失敗ではkeyとjobを保持し、再試行で不存在objectも安全に扱う。R2削除後のDB失敗ではjob/eventの削除をD1 batchのtransactionでrollbackし、worker再起動後も削除待ちから再試行する。CSV試験の独立支払いsession台帳は削除しない。集計logはscanned/deleted/failed/changedの件数だけで、owner・ファイル名・本文・key・Stripe情報を出さない。

本人一覧は期限切れを表示せず、削除失敗1件で有効な仕事の一覧を停止しない。未期限の本人削除が失敗した行は「削除待ち・再試行可能」と表示し、成果取得と新しい処理を止める。処理中の本人削除は409で拒否する。期限切れの処理中jobは取得410で拒否するが、active writerとの競合を防ぐため自動削除から外す。長時間停止したprocessingの検出・lease照合・停止後の削除は未受入。

Workerの`scheduled`は既知のCSV Cronだけを処理し、1回20件を上限に、失敗した行を後ろへ回しつつ他の行を続ける。失敗件数があればCron実行を例外にして監視から成功と見せない。handler単体では定期実行されない。本番へのTrigger登録とSites配備の対応確認は未完了であり、SitesのAI編集scheduleをデータ削除Cronの代わりに作らない。DDL・新しいDB・binding・権限・本番secretは追加していない。

合成localhostの実Worker/D1/R2で、本人分離、20件上限、支払いsession保持、部分R2削除、DB失敗rollback、再起動、誤ったprefixの拒否、処理中保護、結果再取得を検証する。R2の部分失敗注入は同じsource helperを実ローカルD1/R2へ渡すcomponent試験で、Provider障害の実証とはしない。公開の物理削除、運用監視通知、processing lease復旧は合格へ転記しない。
