現行の製品名は **Eve（イヴ、旧称Zema）**。2026-10-20の本人指示による改名で、以下のZemaは同じ製品を指す。既存契約・保存・利用権/SDK識別子は互換性を保持する。

<a id="rockstar-monthly-billing-contract"></a>
## RockstarOS共通サービスの料金・契約・請求契約（2026-10-20）

本人の追加要件はBIL02の実装・受入条件とする。月額基本料は初期プランの**16 USD／契約account／月**を維持し、同一契約へ端末を追加しても重複させない。対象AI・Linuxの利用枠を含め、枠を超えた対象使用量のみ版付き単価で計算する。枠の数量・対象meter・超過単価・繰越・日割り・販売地域・税は未確定であり、現在のfixture値を販売条件にしない。既存契約の料金を遡及変更しない。

### 契約前から実行前まで

1. 料金表は`offerId`、`priceVersion`、適用開始／終了時刻、通貨、月額、各meterの単位・含有量・超過単価、税区分、決済手数料の負担、地域条件、上限、締日・支払日、解約・保存・停止・復帰条件を一つの不変snapshotとして保存する。変更時は新しい版と適用時刻を発行し、既存の仕事と請求期間には同意済み版を使う。
2. 申込前に基本料、含有枠、超過時の具体例、通信料、Linux資源、Cloud AI、外部Tool実費、商品代、税・決済費用を分けた見積を提示する。未知の単価・税・第三者実費は「無料」と表示せず、有料dispatchを保留する。本人が月間上限、job上限、保存期間、未払い時の制限を確認し、契約本文・料金版・表示内容のdigestへ同意する。
3. 支払い方法の登録はProviderのSetupIntent等で照合し、カード等の生情報をRockに保存しない。登録成功と実引落し・入金は別状態。初回登録時の引落額は0で、契約同意、真正なeSIMサービス利用権、管理Linuxの署名済み準備証拠がそろった`serviceStartAt`から基本料を起算する。準備待ち・失敗中は起算も新規有料実行もしない。
4. 各実行ではowner／契約／job／実行先／Tool・model版／料金版／入力digestを固定し、含有枠の残量、月間上限、job上限、与信・既存予約を**同じ原子的判定**で確認して最大見積を予約する。承認済み額を超える可能性がある場合は送信前に縮小・再見積・再承認する。端末やAgentからの自己申告額で予約を増やさない。

### 計量から月次Invoiceまで

5. 実行中は、Cloudの入力・出力・cache token、Linuxの実CPU時間と契約に含む他の資源、Tool呼出し件数／外部実費をmeter別に集め、`実測済み`・`概算`・`予約中`・`Provider未照合`を明示してEveへ更新する。Providerが中間usageを返さない場合は保守的な予約額を表示し、確定額と呼ばない。実測または最大見積が上限へ達したら新しい出力・Tool・再試行を止め、すでに送信済みの外部作用は取消結果と最終usageを照合する。
6. 確定usage receiptには`receiptId`、issuer／署名または信頼済み取得経路、owner、契約、job、実行ID、meter、数量・単位、観測期間、料金版、通貨、元Provider参照、digestを結ぶ。同じissuer＋receiptId＋実行IDは一度だけ記帳し、同一IDの異なるdigestは競合として隔離する。遅延・逆順receipt、取消、結果不明を二重請求や推測確定に変えない。
7. 契約timezoneの月次締めでは、対象meterごとに確定数量を集約し、その期間に含む枠を**一度だけ**控除する。`課金対象数量 = max(0, 確定数量 − 対象枠)`とし、契約版の単位・丸め規則で超過額を計算する。含有枠外の商品代、通信、外部Tool、税、決済手数料は別行。予約は使用量ではなく、未確定receiptや異議行は照合待ちとする。基本料の起算日、日割り、繰越が未確定ならその期間のInvoiceを自動確定しない。
8. Invoiceは契約account＋期間で一意にし、各行へ料金版、meter、数量、枠控除、単価、金額、job／receipt参照を保存する。本人に税・地域・通貨・決済費用と問い合わせ先を表示する。Provider側Invoiceへ同じ行を冪等送信し、customer、契約、期間、通貨、税、合計、Provider請求IDを読戻して一致するまで自動収納へ進めない。Provider原価Invoiceは顧客への請求と別に照合し、差額を黙って顧客へ転嫁しない。

### 収納・制限・復帰

9. `draft → open → paid`に加え`past_due`、`void`、`refunded`、`disputed`、`reconciliation_required`を区別する。支払い方法登録、請求書発行、引落し要求、Provider決済成功、実入金は別記録。Webhookは署名とProvider GETで金額・本人・請求ID・modeを再照合し、重複／逆順通知を安全に処理する。返金・取消・異議は元Invoice行と実決済参照へ結び、作者配分や残高を必要に応じ凍結・修正する。
10. 支払期限・版付き猶予を過ぎた未払いは新規有料実行を制限する。既存の仕事・成果・請求明細・問い合わせ・支払更新・データ持出しは保持し、実入金とeSIM利用権が再確認できたら同じworkspaceへ復帰する。停止済み仕事を無断で再送しない。保存期限と削除／exportは契約版で示し、回線・端末・本人利用権・請求状態を一つのboolへ潰さない。

**責任と実装順。** ROCKは既存`lib/sky-linux-service.ts`・`lib/sky-linux-billing.ts`、Cloud価格／usage、Wallet予約、Eve明細の共通ID・版・原子性・復旧を担当する。EXTERNALはeSIM issuer、Cloud／Linux meter、決済・税／通信Providerの実証拠を提供する。JOINTは同一契約・月境界・同時job・重複receipt・支払失敗／異議／返金・復帰をsandboxで通す。OWNERは枠量・単価・対象地域・税／決済費用の負担・日割り・猶予・契約文言を版として確定する。順序は料金版と同意→原子予約／計量→枠控除／明細→Provider請求・入金→制限／復帰→実環境受入。現在のLinux実装はCPU枠・作者料・月次Invoiceのlocal経路、Cloud tokenは別の閉鎖中経路であり、この共通契約の本番一周は未受入。

<a id="smart-payment-experience"></a>
### 決済をスマートにする本人体験（2026-10-21追加指示）

「スマート」は、**本人が次の行動と最大負担額をすぐ判断でき、同じ請求を何度も操作せず、失敗しても同じ契約・データへ安全に戻れる**ことと定義する。Sky、Eve、eSIM、Linux、商品購入の本人向け入口は一つの支払い状況へ案内し、各行の販売主体・通貨・料金版・責任は分離する。別SiteのStripe Customerやメール一致を根拠に請求を自動統合しない。既存のSky単独140 USD Sandbox、RockstarOS共通16 USD、買切り商品、通信、外部Tool、旧Walletを一つの汎用残高に混ぜない。

1. **次の一手を一画面にする。** 本人認証後、直近の確定請求、予約中、利用量確認中、支払い待ち、異議、返金、使用可能残枠と月/job上限を出典付きで表示する。要対応を優先順位と期限で一件ずつ示し、`支払い方法を登録`、`同じ請求を照合`、`本人確認を続ける`、`異議を申し立てる`、`データを持ち出す`を状態に応じて出す。未接続の操作を押せるように見せない。現行`/sky/payments`の直近100件だけから全期間の債務なしとは宣言しない。
2. **実行前に最適化案を出す。** 同じ本人の目的・品質条件・実行先制約の範囲で、含有枠、従量単価、Tool実費、税・通信の既知分を用い、最大見積と上限到達時の停止方法を比較する。安い代替モデル/Toolや実行時刻の提案はできるが、品質・送信先・外部作用・料金版を勝手に変更しない。未知価格を0円扱いせず有料送信を保留する。提案の採否と上限変更には本人の新しい承認を要する。
3. **登録と引落しを分ける。** 支払い方法の登録は初回0引落しの準備として表示し、環境準備と利用権の確認後にだけ契約の月額を起算する。月次Invoiceを本人に事前提示し、Providerの請求ID・金額・通貨・税・明細を読戻して一致させる。Checkoutの戻り画面やSetupIntent成功だけで`paid`にしない。Stripeの[SetupIntent](https://docs.stripe.com/api/setup_intents)は支払手段の保存、[Checkoutのsetup mode](https://docs.stripe.com/api/checkout/sessions/create)は後日の請求準備に使えるが、採用形態と地域の適合は別受入。
4. **失敗から一操作で復帰する。** 署名Webhookを永続受付し、重複/逆順/欠落を同一InvoiceのProvider GETで照合する。失敗理由を`認証が必要`、`手段更新が必要`、`処理中/結果不明`、`異議中`へ分け、本人へ必要な操作だけを示す。期限切れの確実な未払いと結果不明を区別し、同じ請求の結果不明中に新attemptや作者送金を作らない。再試行間隔・回数・猶予は契約版とProvider能力に従い、AIの推測やクリック連打で増やさない。Stripeの[Invoiceイベント](https://docs.stripe.com/api/events/types)と[Customer Portal機能](https://docs.stripe.com/api/customer_portal/configurations/create)はadapter候補であり、現時点のRockstar共通請求が導入済みという意味ではない。
5. **証拠と問い合わせをつなぐ。** 各明細から契約版、job、usage receipt、枠控除、Invoice、Payment/Refund/Disputeの参照と問い合わせIDへ辿れるようにする。本人は明細の訂正要求、支払い方法更新、領収書取得、解約/保存・exportの条件確認ができる。決済失敗で成果閲覧・適切なexport・問い合わせを塞がない。機微な決済情報はProviderに保持し、Sky/Eveへカード番号を保存しない。

**合格指標と順序。** まず既存データだけで読取専用の「次の一手」を表示し、誤った支払済み判定・二重請求・異議中の再試行を0件に保つ。次に合成契約で見積比較→本人承認→原子予約→利用中表示→月次明細→失敗/訂正/復帰を同一IDで試す。最後に実Provider Sandboxで同一Invoiceの月次一周、欠落通知と再起動、本人UI操作を検証する。測定値は申込完了までの操作数/時間、請求前の金額理解率、結果不明の残存時間、本人による復帰成功率、問い合わせ解決時間、重複請求件数。目標値はpilot測定後にOWNERが決め、未実測の改善率を宣言しない。販売地域、税、価格、回収同意が未確定の間は本番請求を閉じる。

## Sky Linux 16の共通実装（2026-10-20）

初期プランは月額16 USDで一定のAI・Linux利用枠を含め、対象枠の超過分だけを事前単価/本人承認上限で課金する。枠の量・対象・超過単価は未確定。既存Package審査・eSIM grant・Zema workflowを専用Linuxの使用量、月次Invoice、入金確認後の作者精算へつなぐ。未払いの新規実行制限とデータ保持/支払復帰、電子契約とsalt付きchain証明を採用。[11項目の正本](sky-tools-complete-design.md#sky-linux-marketplace)。主担当Sky/MCPのROCK、既存SKY14/15/21・SIM01・BIL02。source/local fixtureのみで、Provider sandbox・実Linux/Pixel・本番・chain公開は未受入。新しい従量単価/無料量/上限は未確定。既存の別商品/旧台帳を新プランへ自動変更しない。

## 本人用Linuxと共通料金表示（2026-10-18）

利用者の明示指示により、基本月額＋追加計算資源＋選択商品の代金という表示原則を、実行先の追加/準備/実行/停止にも適用する。既存Sky基本無料、native SI基本月額と標準Cloud枠、Marketplace売上10%を保持し、すべてのusageへ一律手数料を追加しない。本人用Linuxの先行実装は自分のCPUで固定modelを動かすためCloud token使用量/Cloud使用料/自作担当代0。電気代/機器代は未計測、基本月額は未確定と明示し、新契約や後払いを起算しない。Linux VMと保存ファイルは仕事の終了後も残り、VM停止でも成果は残す。商用CloudはGPU稼働/待機/保存/通信の単価、上限、予約、usage照合が揃うまで有料実行を無効のままにする。[実行・停止・回収の契約](sky-tools-complete-design.md#sky-private-linux-deployment)。

# Sky Market決済と旧収益精算

2026-10-18追加方針: [Skyの本人主導・退出可能性](sky-tools-complete-design.md#sky-user-freedom)に従い、契約終了/未払い制限、有料実行権、本人データ回収、削除を別状態にする。保存期限内の本人成果・履歴・請求記録を回収する経路は本人認証で保ち、Agent購入/再契約を強制しない。終了後の新規Cloud/Agent dispatch・Rockstar管理モデル起動の停止、既存月額/手数料、usage精算、第三者実費、作者licenseは維持する。結果不明/未確定usage/予約/最終請求/異議は照合を続け、停止要求を返金や未請求の証拠にしない。終了前に回収期限と保持/削除対象を提示し、電話/緊急連絡/OS基礎機能/本人所有fileを壊さない。BIL02/SKY21でSF06と実契約・Provider応答を別に受け入れ、現時点で終了後回収APIや本番課金の受入済み宣言はしない。

<a id="esim-si-plan"></a>
## native SI版: eSIM継続条件、月額と選択制の追加AI料金（2026-10-18）

最新の利用者指示ではRockstarOS native SI版をeSIMから導入し、eSIM契約終了時に管理サービスを停止する。既存の「初回有償利用を請求起算」とする下記のManaged Service候補はこのnative SI月額には適用しない。native SI版の**基本月額**は、支払責任者が料金・期間・日割り/解約条件を承諾し、eSIM開通と本人/端末利用権を検証して`service_activated_at`を記録した契約上の時点から発生する。SIM購入、eSIM profile追加、アプリ導入、無料閲覧だけでは月額を起算しない。金額・初月日割り・支払期日・税は未決定で、従来の既存OS月額契約を無断で改定しない。

基本月額には版付き料金表で指定した標準Cloud LLMの**月間N token相当枠**を含める。対象model、入力/出力tokenの換算、time zone、月境界、未使用枠の繰越有無、枠超過時の動作を契約へ固定する。使用量は検証済みprovider usageを既存usage ID/job IDで一度だけ計上し、予約中と確定済みを別表示する。標準枠を使い切ったら追加課金への自動移行をせず、新しい見積と本人承認を要求する。ローカルLinux VM内のモデル推論はCloud token枠の消費やtoken課金対象にせず、端末計算資源・model licenseと管理サービス利用権の制限だけを扱う。

有料Cloud LLM、Sky Agent、外部Toolは本人が選んだ場合だけ、版付き単価/単位、概算、最大上限、送信内容、実行先をjobごとに提示する。契約accountの月間cap・与信枠と既存Wallet/親job予約を原子的に照合してからdispatchし、承認上限を超える出力/再試行を許さない。月末は「基本サービス月額」「対象枠内使用量 0円」「追加Cloud LLM」「追加Agent/Tool」「Marketplace買い切り」「通信」「外部実費」「税」を別明細で示す。同じjobの実usageと請求/返金を照合する。キャリア代金との請求合算は提携契約ができるまで別請求とする。

eSIM終了は認証済みcarrier/issuer eventと契約時刻で判定し、Rockstar利用権を失効させて新規管理実行を止める。支払失敗は猶予/異議を経て制限し、既存成果・invoice・支払/再開/解約の経路を残す。圏外即時停止は保証しない。責任とstate/recoveryは[導入設計](sim-led-product-architecture.md#esim-si-subscription)に従う。ROCK/BIL02、EXTERNAL issuer・決済/LLM provider、JOINT provider sandbox/Pixel、OWNER料金/地域/契約条件。受入は契約activation、月境界と枠リセット、同時job上限、eSIM終了/復活、支払失敗/返金/逆順webhook、明細と実usage照合まで同一契約で完走すること。現状は料金とruntimeの設計であり、実請求・eSIM契約連携は未受入。

## RockstarOS SIサービス契約と月末請求の商材案（2026-10-18）

利用者の追加方針は、RockstarOS（Sky）を使い始めた人へ携帯料金のように月末でまとめて請求し、eSIMやアプリ内の都度決済より明確な継続契約を商材の中心に置くこと。**RockstarOS SI Managed Service**を契約account単位の商材候補とし、OS/Sky/Zema利用権、Cloud LLM/Agent利用、本人別の仕事・成果・使用額管理、サポートを一つの注文書・サービス契約へ束ねる。既存SIM/eSIM offerは購入・本人への利用権付与の経路として残し、SIM取得やアプリ起動だけで後払い債務を発生させない。契約内容・料金・期間・顧客層は候補であり、販売決定ではない。

### 何を「使い始めた」とするか

支払責任者が契約版、料金表、月末締め・支払日、解約、月間上限、支払方法に明示同意し、本人accountと支払手段の設定を確認した後の**初回の有償SIサービス利用**を `billable_started_at` とする。Sky Marketplaceの閲覧、無料機能、SIM/eSIM claim、アプリ導入は請求開始イベントにしない。既存OS月額の起算と日割りの有無は契約で明示し、未決定の新料金を作らない。Cloud LLM/Agentは実際の検証済みusageだけを同じ契約accountへ計上し、注文書に含む無料枠、月額、Tool商品代、端末代/貸与料、通信料、AI使用料、第三者実費、税を別lineで扱う。

```text
契約提示 → 支払責任者の明示同意・支払手段設定 → 利用権active
  → 初回有償利用で請求起算 → jobごとの見積・上限承認
  → 検証済みusageを一度だけ集計 → 契約timezoneの月末で締め
  → 明細・請求書確定 → 契約済み支払方法で収納 → 入金照合
```

後払いの支払可能性は端末やSIMの所有だけでは保証されない。契約accountに請求先法人/個人、管理者と支払責任者、契約版、決済同意reference、支払期限、与信枠、月間capを結び付ける。初回は小さな与信枠と短い督促・利用制限で損失を限定し、無制限のCloud dispatchを許可しない。既存Walletの資金holdと後払い与信枠を同じ残高と見せず、Brokerは利用済み＋未確定予約＋今回最大見積が契約cap/与信枠の両方に収まる場合だけ送信する。二重usage、結果不明、異議のある明細は確定請求から分ける。未払い時は新規の有料実行を制限し、成果閲覧・請求確認・支払・異議・解約の経路を残す。

### 商材と地域の段階案

最初の検証候補は、米国法人 `avokado llc` を契約/請求主体とする**米国内の法人向けManaged Service契約**。注文書＋サービス条件＋料金表＋支払同意により、名義人、管理者、請求先、上限、解約・紛争を固定する。法人向け先行は回収保証ではなく、契約担当者と月次請求を特定しやすいという実証仮説。個人向け米国、日本、EU/英国は別の市場候補で、現地の定期契約表示・税・支払手段・消費者対応を受け入れるまで同じ条件を自動展開しない。日本向けは価格、支払時期・方法、提供時期、解約条件等を申込直前に明確に表示する必要がある。[消費者庁の最終確認画面案内](https://www.caa.go.jp/notice/assets/consumer_transaction_cms203_240315_02.pdf)。Stripeは米国・日本などで事業者が利用でき、米国の事業者が国外の顧客に請求する決済経路を提供するが、対象国の税・契約条件や選んだ支払手段の利用可否を自動で満たす意味ではない。[Stripeの国別提供](https://stripe.com/global)、[通貨と支払手段](https://docs.stripe.com/currencies)。

専用Pixel版などの管理端末を貸与・販売し、SIサービス契約に紐づける**端末付きプラン**は、同一機種の署名OS・boot・更新・data/Keystore復旧・サポート・返却条件が受入済みになった後の追加商材候補。端末の所有/貸与とCloud請求債務は別明細で、ハードウェアの存在を無断引落しや回線停止の権限に変えない。携帯キャリア請求書への実合算はキャリア契約と技術接続の別gate。

ROCKは既存Sky/Zema/Walletのaccount、job、usage、receipt、契約・請求状態を接続する。決済Providerは月次invoiceと支払手段を扱い、顧客のカード/銀行情報はProviderが保持する。[Stripeの従量制・後払い料金モデル](https://docs.stripe.com/billing/subscriptions/metered-billing/thresholds)、[請求と自動回収](https://docs.stripe.com/api/subscriptions/object)。OWNERは最初の国/顧客層、商品名、月額/単価、締日/支払日、与信枠、契約主体を決める。JOINTは契約同意→初回有償利用→月末集計→invoice→決済失敗/異議→復旧をProvider sandboxで受け入れる。現状は設計のみで、実契約、実Provider請求、端末付きプランの販売は未受入。

Stripeを収納Providerに選ぶ場合は、月額と従量の請求が契約上の一つの月末明細へ照合できる構成をsandboxで確かめる。usageの計量正本を二つ作らず、Providerへ送るイベントは既存usage IDで冪等化する。契約/請求の非同期変化には署名検証付きWebhookで `customer.subscription.*`、`invoice.paid`、`invoice.payment_failed` 等を処理し、Checkout完了画面だけで有効化・入金済みとしない。[Stripeのsubscription Webhook](https://docs.stripe.com/billing/subscriptions/webhooks)。税は対象地域の登録・商品分類を確認してから設定し、`automatic_tax` の指定だけで徴収済みと見なさない。[Stripe Taxの定期請求](https://docs.stripe.com/billing/taxes/collect-taxes)。

## Agent利用料の月次後払いと未払い対応（2026-10-15）

利用者は「携帯料金と同じシステムでAgent利用を毎月請求し、強い支払義務にする」と明示した。主担当Billing/BIL02、ROCKは契約・計測・請求状態とサービス権限、EXTERNALは決済/収納・適法な債権回収、JOINTは請求/入金/復旧の受入、OWNERは契約主体・対象国・料金・支払条件を確定する。本項は料金方式の設計変更であり実請求・引落し・回収の実施ではない。

### 契約と請求

- Agent利用料は契約account単位で毎月まとめて後払い請求する方向とする。携帯キャリアの実請求への合算は別契約/接続が必要で、今回成立したとは扱わない。
- Agent/Provider、使用単位、単価の版、実行job、利用期間、税/値引/返金を明細化。通信料、SIM/eSIM、端末代、既存OS料金、Agent料金、第三者実費を分ける。定額/無料枠/超過単価は未定で、既存Sky基本無料・商品販売10%手数料・旧8.88案保留を一括上書きしない。
- 締日、支払日、通貨、回収方法（口座振替/カード等）、収納主体、支払同意、税、返金、解約時の最終請求、契約変更通知を契約版へ固定する。銀行/カード情報は選定決済Providerへ預ける。
- 後払いでも単価提示、実行見積、月額利用上限、実行中予約を必須にする。上限内の包括利用同意と個々の高額/権限変更承認を区別。後払い与信枠は未設計/未受入で、既存の実行gateを無条件に解除しない。
- 月次集計は検証済みusageを一度だけ計上。通信切断/遅延receipt/重複webhookで二重請求せず、不明usageを推測確定しない。未確定項目は保留・翌月調整等を契約に定義する。請求書発行、引落し要求、引落し成功、入金照合を別状態にする。

### 支払いを確実にする設計

`accruing → invoice_open → payment_pending → paid` を基本状態にし、`payment_failed / overdue / disputed / restricted / recovery_review` を支払状態と権限状態の組合せで管理する。

1. 開始時に支払方法の確認と契約同意、本人/法人の支払責任者を記録する。
2. 締め前に利用額と上限、請求確定時に明細と支払期限を提示する。
3. 決済失敗は残高不足・認証待ち・Provider障害・結果不明を区別。結果不明は照合し、無制限再引落ししない。
4. 未払いは通知、契約で定めた猶予と再試行、異議申立て/訂正窓口を通す。争いのある明細は確定した支払義務と分離する。
5. 期限超過時は新規の有料Agent実行と追加与信を停止する。安全停止、保存済み成果の確認/適切なexport、請求確認/支払い/異議申立ての入口は残す。家の施錠・警報・電池安全を回収手段として止めない。通信回線停止はその通信契約と事業者の責任に従い、OSが任意に切断しない。
6. 入金確認・請求訂正後に権限を復旧する。支払済みと誤認して与信を増やさず、二重回収/二重返金を拒否する。
7. 長期未払いは契約/利用/請求/通知/異議/入金の証拠を保全し、人の審査と対象国で認められる回収手続きを経る。自動的に訴訟/差押えを実行しない。

「口座が止まるほど」は強い回収可能性を求める意図として記録する。RockstarOSに銀行口座凍結権を与える設計にはしない。日本では、銀行預金等の差押えは判決や仮執行宣言付支払督促等の債務名義に基づく裁判所の債権執行手続であり、利用規約への同意だけで口座全体を自由に停止できるという意味ではない。日本以外は対象国の専門家による別確認が必要。[裁判所の債権執行案内](https://www.courts.go.jp/saiban/syurui/syurui_minzi/minzi_25_08/index.html)（2026-10-15確認）。信用情報への登録や他口座への横断的制限も自動権限としない。

### 保存・受入・次の決定

既存のusage、予算予約、Wallet/請求storeとProvider参照を再利用する。契約version、支払同意reference、billing period/timezone、usage ID、invoice ID、明細revision、入金reference、通知履歴、異議、restriction reasonを本人別に保存。確定請求を直接上書きせず訂正記録で追跡する。

合格条件は、同一account複数Mini/ゲーム/Agentの集約、上限を超える同時実行拒否、月境界/遅延usage、重複/順序逆転通知、引落し失敗/結果不明、異議/訂正、制限後の入金復旧、解約後最終請求のsandbox往復。すべて追加の本番受入は未実施。対象国、B2C/B2B、請求/収納主体、料金単位、締日/支払日、猶予/再試行、与信/上限、収納Provider、回収委託先は未確定。既存買い切り決済やfixtureを月次後払いの完成へ換算しない。


## 2026-10-05 選択可能なeSIM提供形態の課金境界

最新の明示方針は、対応可能な端末・提供形態で選べるeSIM経由のRockstarOSクラウドOSと、そこでのSkyエージェント利用に対する従量課金。製品全体をこの方式へ一本化せず、eSIM不要のWeb/app、native OSの端末内LLM/offline agent、local/cloud併用を維持する。通信量販売を中心にせず、本人別の利用権・見積り・上限・承認・実行・停止・保存/再開・利用量・請求照合を一体の体験にする。具体的な責任、入出力、保存、失敗、復旧、承認、合格条件、料金の未決定事項は[共通設計](sim-led-product-architecture.md#2026-10-05-cloud-os-business-direction)を参照する。既存Tool/SDK/Walletを再利用し、端末内LLMとPixel/QEMUの受入は独立して保持する。これは設計変更であり、本番実行・課金や実機対応の完了ではない。


**2026-09-27 現行判断:** 利用者の「決済もできるようにして」という明示指示により、Sky Marketの商品購入をStripe Checkout / Connectへ接続する実装を追加した。Sky手数料10%、登録・接続・公開・基本利用料0円を維持する。外部決済、API、AIモデル、cloud等の第三者実費は別項目である。実資格情報の設定、Stripe sandbox受入、実課金、本番配備は未実施。8.88 USDのToC収益料金案は引き続き保留し、旧精算Workerは新しいToC Earning Receiptを409 `SKY_FEE_POLICY_ON_HOLD`で拒否する。

## Sky Market決済（2026-09-27実装）

### 利用経路と対象

提供者は `/sky/sell` からStripeのExpressアカウント登録へ進み、Stripe上で本人情報・銀行口座を入力する。Skyはカード番号・銀行口座情報を保存しない。アカウントの `charges_enabled`、`payouts_enabled`、`details_submitted`、`transfers=active` を照会してから、本人所有の審査済みPackageに販売価格・販売条件URL・返金条件を保存する。

購入者は `/sky/marketplace` のPackageを選び、金額と条件を確認してStripe Checkoutへ進む。戻り先 `/sky/purchases` で支払いを再照合する。署名Webhookでも照合し、Stripeから再取得したSession、PaymentIntent、Chargeの注文ID、金額、JPY、test/live、受取先、10%手数料、支払い成功が一致した場合にだけ購入済みとする。戻りURLやブラウザの申告だけでは購入済みにしない。

現在の対象は `pricing.model=external_contract`、現行manifest hashに結び付く有効な `verified` review、提供者の販売設定を持つPackageの円建て買い切り販売である。価格は50〜99,999,999円の整数。LLMのPackageも同じ条件で販売できるが、カタログのLLM候補や既存Toolに価格を自動付与しない。月額、従量課金、他通貨、税・請求書・割引の自動計算は今回の対象外。

Skyは注文額の `floor(amountMinor × 1000 / 10000)` をStripeの `application_fee_amount` に設定し、提供者の接続アカウントへdestination chargeを作る。10,000円ならSky手数料1,000円、提供者への分配9,000円。Stripe等の処理費用、税、返金・紛争の負担は別であり、1,000円をSkyの純利益とは表示しない。アカウント作成では処理費用と決済損失のpayerをplatformに設定している。銀行への払出し完了はこの注文記録から推測せず、Stripe側で確認する。

### 保存とAPI

実装は `lib/sky-commerce.ts`、`lib/sky-commerce-store.ts`、`lib/sky-stripe.ts`。Web D1の `drizzle/0018_sky_commerce.sql` が `sky_commerce_sellers`、`sky_commerce_offers`、`sky_commerce_orders`、`sky_commerce_events` を追加する。旧Billing WorkerのDBとは独立している。

| API | 動作 |
| --- | --- |
| `GET /api/sky/commerce/offers` | 公開販売価格・条件・revisionを取得。現行reviewが失効した商品を除外 |
| `GET /api/sky/commerce/seller` | 本人の受取先状態、Package、販売設定、売上を取得 |
| `POST /api/sky/commerce/seller` | `{ "action": "onboard" }` で本人の受取先登録URLを作成 |
| `POST /api/sky/commerce/offers` | 本人の `packageKey`、`amountMinor`、`currency: "jpy"`、`active`、`termsUrl`、`refundPolicy` を保存 |
| `POST /api/sky/commerce/checkout` | `packageKey` と閲覧済みの `offerRevision` から注文・Checkout URLを作成 |
| `GET /api/sky/commerce/purchases` | 本人の注文、返金額、購入アクセス状態を取得 |
| `POST /api/sky/commerce/reconcile` | 本人の `orderId` をStripeへ再照合 |
| `POST /api/sky/commerce/refund` | 提供者本人の `orderId` の未返金残額を返金 |
| `POST /api/sky/commerce/webhook` | Stripeのraw body署名を検証し、最新の決済情報を照合 |

価格、手数料、受取先、購入者IDを購入リクエストから採用しない。注文は販売条件とmanifest hashを固定し、後の価格変更で書き換えない。同じ購入者・Package・環境の進行中注文は一つに制限し、Stripeのidempotency keyも注文IDへ固定する。イベントと注文状態はD1 batchで保存する。

`sky_commerce_orders` の支払い済み状態がSkyの購入アクセス記録を兼ねる。Packageの停止、review期限切れ、manifest変更、返金・紛争では接続先を表示しない。ただしRegistryのendpointは公開情報になり得るため、この表示制御だけでは第三者MCP serverへのアクセスを防げない。有料提供者は自身の認証・利用権・失効処理を実装する必要がある。今回の購入記録をMCPへの認証済み接続やTool実行成功に読み替えない。

### サーバー設定と導入

| 設定 | 条件 |
| --- | --- |
| `SKY_PAYMENTS_MODE` | `test` または `live`。未設定・不正値では決済不可 |
| `SKY_STRIPE_SECRET_KEY` | modeに一致する `sk_test_…` / `sk_live_…` または対応するrestricted key。Stripe呼出しはサーバー内のみ |
| `SKY_STRIPE_WEBHOOK_SECRET` | その環境の送信先に対応する `whsec_…` |
| `SKY_PAYMENT_ORIGIN` | 正確なOrigin。パス、query、fragment、認証情報を含めない。HTTPはtestのlocalhost / 127.0.0.1だけ |

鍵はWebサーバーのsecret bindingまたはGit対象外のローカル環境へ設定する。`NEXT_PUBLIC_` / `VITE_` 等で公開せず、ブラウザ、LLM、商品MCP、ログへ渡さない。test/liveの注文・販売設定・受取先は分離される。未設定時の一覧APIは接続待ちを返し、書込みは503で止まる。旧 `BILLING_SERVICE_URL` 等だけでは新しい購入機能を設定できない。

1. Web D1へ既存migrationと `0018_sky_commerce.sql` を順に適用する。ローカルは `npx wrangler d1 migrations apply DB --local --config wrangler.local.jsonc`。配備先はそのWebアプリのDBへ適用し、旧Billing DBへ誤適用しない。
2. Stripeのtest環境とConnectを用意し、四つの設定をWebサーバーへ登録する。`npm run dev` で `/sky/sell`、`/sky/marketplace`、`/sky/purchases` を確認する。
3. Stripeの通知送信先を `<SKY_PAYMENT_ORIGIN>/api/sky/commerce/webhook` に設定する。対象は `checkout.session.completed`、`checkout.session.async_payment_succeeded`、`checkout.session.async_payment_failed`、`checkout.session.expired`、`charge.refunded`、`charge.dispute.*`。raw bodyと `Stripe-Signature` が変更されず到達することを確認する。
4. 本人サインインで受取先登録、審査済み `external_contract` Packageの販売条件設定、testカード購入、戻り先照合、Webhookを実際のStripe sandboxで受け入れる。
5. 受取先、販売条件、返金・紛争対応とsandbox結果を確認した後、本番資格情報・本番Webhook・HTTPS Originを設定する。本番配備と実資金の結果は別に記録する。

liveの本人APIは現在、HTTPSの `.chatgpt.site`、設定Origin、`x-dispatched-app: site---…` と既存Sites本人ヘッダーを使う。公開経路が本人ヘッダーを除去・検証・再設定すること、およびそれを迂回できる直接Worker Originが公開されないことが必須。host/dispatch文字列だけでは署名認証にならない。testモードの合成ヘッダー試験を実サインイン検証としない。

Webhook経路はStripeがサインインなしで到達でき、raw署名で認証される必要がある。Sitesのアクセス設定がこの例外経路を実際に提供できるかは未確認。配備前に匿名POSTの到達を確認し、ログイン画面への転送や認証要求で止まる場合は、署名とraw bodyを保持する専用の受信経路を用意してから接続する。本人用APIの認証を外して解決しない。

### 返金、結果不明、受入

提供者は売上画面で注文と未返金額を確認して返金する。Stripeへ `reverse_transfer=true` と `refund_application_fee=true` を指定する。画面から任意額の部分返金はできないが、Stripe側で行った部分返金はWebhookで金額とともに記録する。部分返金・返金確認中・紛争中はアクセスと再購入を止め、全額返金が確認できた場合に新規購入を認める。返金・紛争より遅く到着した支払い完了でアクセスを復活させない。

受取先作成の結果不明、Sessionを保存できなかった注文の再作成、結果不明の返金は、最初の要求から20時間を超えると自動再送を止めてStripeでの確認を求める。再照合で返金の初回要求時刻を延長しない。返金失敗や紛争解決後の利用再開、紛争の証拠提出、銀行払出しの追跡は運用確認が必要で、画面からの手動状態書換えや自動再開は実装していない。

ローカル検証:

```sh
node --experimental-strip-types --test tests/sky-stripe.test.mjs tests/sky-commerce.test.mjs
npm run schema:check
npm run typecheck
npm run lint:product
```

commerceの37件は、全Web migrationを適用したSQLiteとStripe HTTP mockで、購入縦断、10%固定、本人分離、同時購入、通知署名、金額・宛先不一致、review失効、返金・紛争の順序逆転、再送期限を確認した。これはProvider sandboxでの受入ではない。

Provider sandboxでは、実際のConnect本人登録、買い切り支払い・認証失敗・取消、10%分配と処理費用の明細、Webhook再送・順序逆転・不達後の再照合、全額/部分返金・紛争、受取先無効化、別本人からの拒否、有料MCP側の認証と返金後失効、銀行払出し状態の区別を確認する。現時点で実Stripe資格情報、provider sandbox実行、live money、配備の証拠はない。

## 旧収益精算Workerの範囲

以下の888 cents計算式、Earning Receipt、払出し台帳は旧収益モデルの設計・回帰検証の記録。上記の商品購入とは別経路であり、今回の変更で再有効化していない。

公開Workerでは状態確認に`BILLING_SHARED_SECRET`と`SETTLEMENT_INGEST_SECRET`を必要とする。`PAYOUT_ADAPTER_SECRET`は払出しadapter接続時だけ必要で、未登録なら払出しclaim/resultを503で拒否する。料金保留中の状態確認やToC拒否まで503にしない。[公開環境の確認記録](evidence/launch/sky-billing-fee-hold-20260924.json)。

## 旧料金案・実装履歴

2026-09-19方針更新: 無料配布を理念とし、OSの利用料を従量課金とする意向が示された。以下のSky収益連動精算は現行runtimeの契約であり、OSの利用量を計測する新料金ではない。対象範囲、計量単位、単価・上限が決まるまで料金計算を変更しない。

2026-09-17追加設計・最新訂正: SkyをToolチームの主入口へ統合し、**Sky経由の検証可能な利益に対する成功報酬の一部を開発者還元原資とする提案**へ更新した。成功報酬率、利益の定義、既存888 cents月上限の扱い、回収方法、開発者配分率/weight/留保は未確定で、最新要望を確認中。以下は既存runtimeの経済契約であり、新方針への移行は未完了。料金計算や実請求を無断変更しない。[Skyの貢献・還元契約](sky-network-economy.md)。

## 収益モデル

Skyは利用開始時にカードへ8.88 USDを請求しない。Skyの自動化が生み、外部の販売・決済Providerで入金まで確認できた収益だけを対象に、利用者ごと・UTC月ごとに次の順で精算する。

1. 検証済み自動化売上を計上する。
2. その売上に直接対応する外部Provider、API、モデル等の実費を回収する。
3. ToC分は実費後の残額からSky利用料を最大888 USD centsまで回収する。
4. 残額を利用者の払出し指図へ入れる。

式はToCの旧保留案については `sky_fee = min(gross - operating_cost, 888 - fee_already_collected_this_month)`。売上0なら利用料0、実費後の残額が888 cents未満ならその範囲だけ、未達分の債務化・翌月繰越・カード請求はしない。ToBの現行表示ポリシーは、検証済みTool売上の10%をSky手数料、残り90%を提供者側として扱うが、実際のReceipt計上・請求・払出しは受入完了まで無効である。

## 信頼境界

ブラウザや利用者が売上額を自己申告するAPIではない。販売・決済Providerを照合する内部adapterだけが、次の証拠を持つEarning ReceiptをSkyの`POST /api/earnings/receipts`へ送る。

- SkyのExecution Receipt ID
- Provider名と重複しない入金参照
- 利用者、ToC/ToB区分、払出し先参照
- USD cents整数の確定売上と直接実費
- 入金証拠のSHA-256
- 32 bytes以上の`EARNING_PROVIDER_SECRET`による、時刻付きraw body HMAC署名（`Avocado-Provider-Signature`）

Sky bridgeは署名を先に検証し、`sourceProvider`が設定済み`EARNING_PROVIDER_ID`と一致すること、Execution Receipt IDが本人所有の完了済み・非サンプルjobであること、利用者・Tool・発生時刻が一致することを確認する。合格した同じraw bodyだけを`SETTLEMENT_INGEST_SECRET`で再署名して精算Workerへ送る。ブラウザ、LLM、Tool自身にはどちらの秘密も渡さない。

単なるツール実行成功、成果物作成、手入力売上、未確定PaymentIntentは受け入れない。同じReceipt ID、Execution Receipt ID、Provider入金参照の再送は同一内容なら冪等に返し、異なる内容なら409で止める。Providerからbridgeへの再送後も、精算Workerの一意制約によってWalletへは一度だけ反映する。

## 実装経路

Skyの`POST /api/earnings/receipts`がProvider署名とWeb D1のjobを照合し、独立Cloudflare Workerの`POST /v1/earnings`だけがbridge署名済みReceiptを受ける。D1 migration `0002_earnings_settlement.sql`は以下を保存する。

- `earning_receipts`: 実行・Provider入金・証拠hash・金額の対応
- `monthly_earning_settlements`: 利用者/月ごとの売上、実費、Sky回収、分配額
- `earning_ledger_entries`: `AUTOMATION_REVENUE`、`OPERATING_COST`、`SKY_SERVICE_FEE`、`BENEFICIARY_PAYABLE`の追記型台帳
- `payout_instructions`: Provider adapterが残額を送るための一意な指図、5分lease、idempotency key、送金結果

Receiptの割当、月集計、台帳、払出し指図、適用済み印は一つのD1 batchで更新する。途中失敗で未適用Receiptが残った場合、同じ署名済みReceiptの再送で再開できる。`POST /v1/payouts/claim`はProvider adapterへ未処理の指図を5分leaseし、`POST /v1/payouts/result`は同じleaseで`paid`、`failed`、結果不明を記録する。adapterは再試行時も指図の同じidempotency keyを使う。`GET /v1/status`はSkyの短命ユーザーtokenとOriginを検証し、本人の当月集計だけを返す。

以前の`POST /v1/checkout`、`POST /v1/portal`、`POST /v1/webhooks/stripe`は410 `UPFRONT_BILLING_RETIRED`を返す。旧`0001_billing.sql`は移行履歴を壊さないため保持するが、新しい契約・請求を作らない。

## Provider adapterの接続条件

### 開発者還元への接続境界

既存`earning_receipts.sky_fee_minor`は旧契約のSky利用料割当額、`applied_at`は収益台帳への適用であり、現金/USDCの回収完了ではない。旧契約の回収正本は`rock_fee_collection_instructions`の`collected`状態と、既存reconcileが確認したtransaction・金額・宛先・finality・確認時刻である。これを新契約の成功報酬へ自動変換しない。新契約でも利益発生、請求、実回収を分け、利用者やToolが申告した「回収済み」を証拠にしない。

追加する貢献・配分準備側は、既存の署名検証済み収益を再利用し、新契約の利益照合と成功報酬回収証拠へ結ぶ設計とする。新契約への移行または回収readbackが未完了なら金額未確定のままにする。pending明細はBillingの4勘定や利用者向け`payout_instructions`への新たな記帳ではなく、確定した支払債務でもない。今回の設計で既存払出しworkerへ開発者宛の送金を追加しない。

原資は実回収済み成功報酬だけとする提案であり、先の`collected_sky_fee`固定案を訂正する。draft policyの成功報酬率/月上限/回収方法/開発者配分率/weight/留保条件は未設定値を保持する。設定が揃うまで開発者配分金額は未確定、実払出しは無効。未合意の利用者残額控除、ToB商品売上、PAPER収益、未回収成功報酬から原資を補わない。将来policy有効化時は、版/hash、対象期間、原資の一意性、合計が利用可能原資を超えないこと、最小単位の丸め、取消・返金・既配分との照合が必要である。

Walletは、利益の根拠と成功報酬の請求内容を表示し、本人の支払い・領収・照合を円滑にする決済窓口である。外部サービスが本人の銀行口座へ入金した事実は、Skyへの支払完了でも銀行自動引落しの委任でもない。口座登録や入金確認から回収権限を推測せず、新しい支払手段・同意・結果照合を契約と実装で確定する。

作者帰属は認証登録者と実行時の検証済みTool版/hashを結ぶ。manifestの`developerRecipientId`は宣言値なので、そのまま実払出先にしない。現行のExecution/Earning Receiptだけでは作者版のsnapshotを持たない過去実行もあるため、証拠のない過去分を現在のpackage登録者へ遡及配分しない。

収益・回収・貢献は別保存境界のため、全体を単一transactionで確定したとは扱わない。安定したsource IDとhashで冪等再照合し、途中失敗は既存Billingの適用結果を確認してから再開する。返金やchargebackは元Receiptを上書きせず参照付きの保留/相殺を必要とし、Provider返金連携未受入を「返金なし」とみなさない。再実行やpolicy更新による二重配分を防ぐ受入後にのみ、将来の支払機能へ進める。

このWorkerは収益の検証・配分台帳であり、仕事を受注したり銀行送金を単独で行うものではない。実収益化には、各自動化商品について次のadapterを接続する。

1. 需要側から有償注文を受ける販売adapter
2. Execution Covenantに従って仕事を実行し、Skyの一意なjob IDへ納品・承認を記録するadapter
3. 決済Providerの署名Webhookまたは公式照会で入金確定を確認するadapter
4. Execution Receiptと入金を一対一で照合し、`EARNING_PROVIDER_SECRET`でEarning Receiptへ署名するadapter
5. `payout_instructions`を同じidempotency keyで実送金し、成功・失敗を照合するadapter

販売主体、資金保管、本人確認、提供地域、税、返金、chargeback、最低払出額はProviderごとに確定する。Provider sandboxで入金、Webhook再送、順序逆転、返金、払出し失敗、再照合が合格し、所有者が本番資格情報と口座を確認するまで実入金・実払出しは有効化しない。

## 設定と検証

`services/sky-billing/wrangler.jsonc`へSkyの公開OriginとD1 IDを設定し、Git外のsecretとして次を登録する。

```sh
npx wrangler secret put BILLING_SHARED_SECRET --config services/sky-billing/wrangler.jsonc
npx wrangler secret put SETTLEMENT_INGEST_SECRET --config services/sky-billing/wrangler.jsonc
npx wrangler secret put PAYOUT_ADAPTER_SECRET --config services/sky-billing/wrangler.jsonc
```

Sky側には同じ`BILLING_SHARED_SECRET`と`BILLING_SERVICE_URL`を設定する。現在は一つの収益Provider adapterをfail-closedで固定するため、Sky側へ`EARNING_PROVIDER_ID`、`EARNING_PROVIDER_SECRET`、`SETTLEMENT_INGEST_SECRET`もsecretとして設定する。収益Provider adapterへ渡すのは`EARNING_PROVIDER_SECRET`だけであり、精算Workerの`SETTLEMENT_INGEST_SECRET`はSky bridge以外へ渡さない。払出しadapterには別の`PAYOUT_ADAPTER_SECRET`だけを渡す。これらをブラウザ、LLM、商品MCP、ログ、Gitへ出さない。複数Providerの本番接続前に、Providerごとのsecret保管・rotation・失効を追加する。

ローカルでは `node --experimental-strip-types --test tests/earning-bridge.test.mjs tests/billing.test.mjs tests/billing-worker.test.mjs tests/settlement.test.mjs` で、完了job照合、サンプル・未完了・本人／Tool不一致の拒否、二重計上拒否、署名、改ざん、低収益、月上限、ToB無料、Receipt再送、競合、本人別status、先払いAPI停止を確認する。Worker bundleは`npm run billing:check`、全体回帰は`npm run verify`で確認する。

2026-09-12のローカル受入では`npm run verify`を完走し、Web本体118 tests、Fashion Brand Ops 14 tests、仕事API 143 assertions、D1移行互換、Worker dry-run bundle、本番buildが成功した。実販売Provider、実決済、実口座、実払出しは未接続であり、この結果を収益・回収・送金実績とは扱わない。

2026-09-15のROCK_READY受入では、Web D1上の完了jobからProvider署名、bridge再署名、Billing D1のReceipt・4勘定・払出し指図までを一つのfixtureで縦断した。同一Receiptの再送は1件のまま、同じ実行への別Receiptは409、未署名、別Provider、未完了、サンプル、本人／Tool不一致、収益鍵と払出し鍵の相互流用は拒否した。2026-09-16には同じ合成実行IDと証拠hashをPixelのTool／端末Wallet区間とこの署名精算区間へ渡し、物理6/6・host 7/7で相関を確認した。二つの試験区間であり、実Provider sandbox、配備済み端末からの一本通し、実収益は引き続き未接続である。

## Rock受取Wallet / Base USDC

RQ36により、`0004_rock_settlement_wallet.sql`でRock受取operator、5分challenge、receipt単位の回収指図を追加した。`GET /v1/rock-wallet`、`POST /v1/rock-wallet/challenge`、`POST /v1/rock-wallet/verify`、`DELETE /v1/rock-wallet`、`POST /v1/rock-wallet/reconcile`を短期Billing tokenで認証する。

受取先は外部EIP-1193 Walletの所有署名で確認する。署名はSite origin、Base chain id、nonce、発行・失効時刻へ束縛し、秘密鍵、seed phrase、token approval、送金権限を要求しない。回収指図はEarning Receiptへ既に配分された `SKY_SERVICE_FEE` だけから作り、受取先未登録、着金待ち、finalized待ち、着金済み、結果不明を分ける。

着金済みへの遷移には、Base Mainnet `8453`、Circle公式Base USDC contract、exactなrecipient、`amount_minor * 10,000` units、成功receipt、finalized blockの一致をすべて要求する。receipt、idempotency key、transaction hashはuniqueである。RPC timeout・不明状態・未finalizedでは自動送金または別transferを作らず、同じ指図を明示的に再照合する。初期の `BASE_RPC_URL` は公開Base RPCで、運用負荷に応じて認証済みRPCへ差し替える。[設計と本番gate](rock-wallet-production-rail-20260913.md)。


## 2026-10-01 CSVの50円決済試験

[CSV試験の接続と受入](sky-csv-trial-payment.md)。通常受付と別の指定サンプルにJPY50のHosted Checkoutを追加。Apple Pay表示と実課金は本番接続・本人決済の受入待ち。

## 共通決済（2026-10-05）

利用者の明示指示により、共通化の主担当をWallet / Billing（BIL02、JOINT）とする。これはRockが販売と請求を管理し、カード処理・受取先本人確認・銀行入金をStripeへ委ねる構成。自社acquirerやcustodyの完成を意味しない。

### 目的・利用体験・責任

`/sky/payments`でTool/eSIM注文、CSV受付、直接LLMの計算済みusage、A2A usage、カード入金/返金状態を本人別に確認する。既存購入画面から入れる。商品注文・CSV受付は従来の本人確認/履行/返金APIへ戻り、直接LLMは明細確認→金額への明示承認→Hosted Checkout→本人による再照合または署名Webhookの順とする。再読み込みや決済の戻りURLは入金を確定しない。カード入力はStripeで行い、Rockへ保存しない。

Rockは金額・通貨・注文/実行ID・利用者・同一処理の結合、再送制御、秘密非表示、保存/復旧を担当する。Stripeは決済処理を担当する。eSIMは入口/利用権であり課金承認ではない。WebとeSIMで同じ実行IDを再利用しても請求受付は一つ。制限付きeSIM Cloud tokenへ決済権限を追加せず、本人アカウントへサインインして承認する。

### 共通実装と入出力

`shared/stripe.mjs`の単一transport/signatureをSky、CSV（skyStripe経由）、Mini販売Worker、Fashionで再利用する。Mini/Fashionの独立配布コピーは`npm run shared:sync`で生成し、`shared:check`で同一性を確認する。固定Stripe origin、15秒timeout、明示idempotency key、リダイレクト非追随、エラーの秘密非表示を共通化した。Workersで非対応の`redirect:error`を`manual`へ変更し、全非2xxを拒否する。独立Siteの履歴やStripe Customerを自動統合した意味ではない。同じ販売主体のmerchant設定とアカウント対応付けは別の運用受入が必要。

`GET /api/sky/payments/summary`は本人の直近記録だけを返す。`POST statement`は直接LLMの保存済みcompleted recordから料金を再計算し、source digest・項目別利用量・金額を返す。`POST checkout`はsourceId/digest/amountMinor/currencyを再照合する。owner・価格・eSIM claim・送金先をクライアント入力から採用しない。LLMの内部settled額は資金の入金ではなく原価計算であり、小売料金確定前のためこの回収経路はtest専用。JPY/USDの50最小通貨単位未満は勝手に最低額へ切り上げず停止する。他通貨や利用集約は未対応。

### 状態・保存・失敗・復旧

Migration `0060_sky_usage_payments.sql`は直接LLM実行を参照し、owner、source digest、金額、通貨、mode、Stripe session/intent、返金額を保存する。source+mode、session、intentをuniqueにし、元の金額/owner/参照/作成時刻はimmutable。状態はpending / paid / expired / partially_refunded / refunded / disputed。usage budgetのsettled値は回収時に再加算しない。A2Aは既存の署名usage→Wallet精算経路を表示し、追加カード回収へ流さない。将来別の回収方式を使う場合は資金予約・既払い状態・返金まで共通の排他契約が先に必要。

Checkout timeout時も同じ永続IDを使う。20時間を越えた結果不明の作成は再送せずStripe照合へ止める。署名Webhookから元のsource digestと注文条件を確認してsessionを復旧できる。通知の重複や順序逆転では、Stripe APIから現状を取得し、全額/部分返金と紛争を遅いpaid通知で戻さない。これらは[Stripeの冪等性仕様](https://docs.stripe.com/api/idempotent_requests)と[履行・通知の仕様](https://docs.stripe.com/payments/checkout/fulfill-orders)に基づく。

### 承認・合格条件・未決定

既存`SKY_*` merchant設定に加え、直接LLM回収は専用`SKY_USAGE_STRIPE_WEBHOOK_SECRET`と`SKY_USAGE_PAYMENTS_TEST_ENABLED=true`を使う。ただし`SKY_PAYMENTS_MODE=live`では環境変数を設定しても回収を503で拒否する。実行側の`remoteAiPricingGateAccepted()`も閉じたまま。Webhook pathは`/api/sky/payments/webhook`、対象はcheckout.session.completed / async_payment_succeeded / expired、charge.refunded / dispute.created / dispute.closed。ローカル設定だけで本番通知先を変更しない。

合格証拠は全migration上のowner分離、8並行一件受付、金額/通貨/送金先改変拒否、本文署名、応答消失の復旧、返金/紛争と遅延通知、20時間後の再送拒否、同じusage予算の二重精算拒否。実Provider請求、実受取先、運用の復旧、独立Siteのmerchant同一性、顧客の小売単価/利益/税/返金条件、funded Walletと実行前資金確保、A2A異種回収排他、本人desktop/Pixel操作の受入が残る。次担当はこれらを一つずつ確定し、同一公開artifactで受け入れてからlive gate変更をレビューする。

既存50円CSV受入は保持するが、この新しい経路の実課金試験は行っていない。新機能の公開・GitHub main統合は別状態で記録する。

## 本番受入までの逆算工程

指定した販売範囲で、本人の承認→資金確保→決済→商品提供/クラウド実行→明細→返金→銀行/Provider照合→障害復旧が同じ取引IDで完走した状態をPRODUCTIONと定義する。永久に欠陥ゼロという意味の「完全」は宣言しない。

2026-10-05 UTC。調査開始07:58、主要調査08:05まで。ユーザー指定の5分を目安に一次資料と対象コードを確認した範囲であり、網羅的な外部監査ではない。ローカルHEAD37c06cec＋未commit差分。観測main592daeea。通常verify成功、SPIDER repository security失敗、CodeQL再実行中。

AMCの意味は確認待ち。表示形式は暫定的に、工程・作業・到達点・合格条件のCanvasとして整理。ここに書いた前払方式、工数、pilot基準は提案であり、料金や本番解禁の確定指示ではない。

### 結論と順序

PRODUCTION ← 締め/入金/返金/復旧の運用受入 ← 上限付き限定実利用 ← 同一配備物の外部sandbox・実機受入 ← 提供/失効・照合/復旧実装 ← 共通本人/請求ID・実資金予約 ← 料金/契約/対象確定 ← 版固定

28項目は9工程にまとめた粗い見積で、ROCK側の実装・検証作業は合計24–41人日。1人で週5日なら約5–9稼働週相当。外部審査/契約/専門家確認/Provider回答/入金/請求周期と大きな不具合修正は含めない。所要日数の実測ではなく、今回の短時間調査に基づく仮説。G1確定後に再見積する。各項目への重複配賦はしていない。

同じ支払い画面・本人アカウントは共有する。自社商品、Connectの販売者商品、用途限定クラウド利用枠、通信Provider料金、既存A2A Walletは金銭責任を分けて照合する。共通化は汎用残高への混在を意味しない。

最初の3作業はG0/01の版固定、G1/04–06の料金と契約整理、G2/07の共通請求アカウント設計。G4の復旧骨格・試験設計は外部契約待ちの間に進められる。G3の小売実装は料金方式確定後、G5の実発行はProvider条件確定後に進める。

### 現在地（コード/保存証拠から）

- **共通transportと本人別明細 — 確認済み**: 前ターンの全体verify合格: Node882、Worker/D1 1133、CSV113。外部決済は合成Provider。 根拠: `docs/evidence/unified-payment-verification.json`。
- **クラウド本番実行/回収 — 未受入**: pricing gateはfalse、回収はtest-only。小売単価とfunded authorizationが未受入。 根拠: `lib/remote-ai-pricing-gate.ts / lib/sky-usage-payment.ts`。
- **全入口の注文・顧客統合 — 実装残**: Mini/Fashionはtransport共有まで。共通Customer、履歴の認可付き横断、合算請求は別作業。 根拠: `lib/sky-payments.ts / docs/sky-billing.md`。
- **自動復旧と紛争決着 — 実装残**: 新usage経路はWebhookと手動confirm。永続event inbox/定期scannerなし。disputedは固定、expiredからの再attemptなし。 根拠: `lib/sky-usage-payment.ts / drizzle/0060_sky_usage_payments.sql`。
- **少額請求と端数 — 設計残**: 実行ごとの原価を切上げる計算はあるが、請求周期単位の小売集約とは異なる。 根拠: `lib/remote-ai-text-pricing.ts:197`。
- **eSIMの注文応答消失 — 外部確認**: orderReferenceが保存できた後は読戻し可能。参照自体を失うとreconciliation_requiredで止まる。 根拠: `lib/esimgo-provider.ts / docs/workstreams/03-wallet-billing-providers.md`。
- **公開ドメインと本人認証 — 条件付き**: liveは.chatgpt.site＋dispatchを要求。独自domain対応には信頼境界の設計と試験が必要。 根拠: `lib/sky-payments.ts:35`。
- **新画面の本人操作と外部実取引 — 未検証**: 画面/読込/設定不足案内は確認済み。本人サインイン→Checkout→戻り→返金は未受入。 根拠: `docs/evidence/unified-payment-verification.json`。

### 詳細工程

#### G0 対象と検証する版を固定

担当: ROCK。依存: なし。仮工数: 1–2人日。到達点: 同じコードを試験・配備・監査する。

**01. ローカル変更をmainとの差分へ整理**
- 作業: 37c06cec上の決済/eSIM差分を分離して保存し、最新mainを取り込む。既存migration番号の衝突を確認する。 観測main 592daeeaの通常verify成功とSPIDER repository security失敗を別々に扱い、原因と影響範囲を解消/判定する。
- 合格証拠: commit SHA、変更一覧、migration整合、同一SHAのCI成功

**02. 販売対象と公開先を一覧化**
- 作業: Sky商品、CSV、eSIM、直接LLM、A2A、Mini/Fashionを分類。販売者、通貨、対象国、公開Site、顧客ID、精算先を明示する。
- 合格証拠: 各商品に責任者と対象環境があり、対象外を完了数へ入れない

**03. リリース判定を固定**
- 作業: ROCK_READY→PROVIDER_READY→INTEGRATED→LIMITED_LIVE→PRODUCTIONを既存BIL02の証拠に結ぶ。
- 合格証拠: 未受入項目がある範囲の本番gateは閉じたまま

#### G1 料金・販売者・資金負担を確定

担当: OWNER / JOINT。依存: G0。仮工数: 2–3人日＋契約待ち。到達点: 誰が何にいくら払うかが決まる。

**04. 小売料金表を確定**
- 作業: 商品代、通信料、OS月額、AI使用料、実費、無料枠、BYOKを分離。税・為替・丸め・最低請求額・返金条件を決める。Sky売上10%をクラウドへ自動流用しない。
- 合格証拠: 版付き販売料金表と同意文面。原価と小売価格を独立表示

**05. 請求方式を選ぶ**
- 作業: クラウドは用途限定の前払利用枠、または与信上限付きのまとめ請求を比較。前払案を推奨候補とするが、契約/地域条件確認前に採用しない。
- 合格証拠: 少額利用を集約する単位、締め、端数、未払い、失効/返金を確定

**06. 通信と販売責任を確定**
- 作業: 1GLOBAL優先候補・eSIM Go比較候補という既存調査を保持。通信Provider直接請求かRock再販か、利用国・期間・一次サポート・再販権を契約確認する。
- 合格証拠: 販売主体・通信責任・Provider条件の承認記録。審査日数は未確定

#### G2 本人・顧客・販売口座を接続

担当: ROCK / JOINT。依存: G0、G1。仮工数: 3–5人日＋アカウント審査。到達点: 一人の注文が全入口で追える。

**07. 共通請求アカウントを設計**
- 作業: 本人ID→販売主体→Stripe顧客→注文/利用IDを対応付ける。Mini/Fashion別Siteの注文は認可付き参照で統合し、メール一致だけで自動結合しない。
- 合格証拠: 別人の記録を見せず、同じ本人はWeb/eSIM/clientで同じ明細を読む

**08. 販売者口座を実確認**
- 作業: 自社売上とConnect販売者売上の経路を分け、KYC・charges/payouts・能力失効・売上10%・受取先をsandboxで読む。
- 合格証拠: 販売者停止中は販売拒否。正しい相手へ正しい純額が分配される

**09. 認証gatewayと公開ドメインを受入**
- 作業: 現在live APIは.chatgpt.siteとdispatchヘッダーを要求する。独自domainを使う場合は信頼gatewayを整備し、単にsuffix検査を外さない。eSIM cloud keyに決済権限を与えない。
- 合格証拠: 匿名、偽ヘッダー、別owner、失効tokenは拒否。本人再認証が成功

#### G3 実行前の資金確保とクラウド請求

担当: ROCK / JOINT。依存: G1、G2。仮工数: 5–8人日。到達点: 払える範囲だけ実行し、一度だけ精算。

**10. 小売見積を原価見積から独立**
- 作業: model・tier・キャッシュ・単価版・有効期限・入力digestを固定し、承認額に小売条件を結ぶ。現行原価のchargeMinorをそのまま売上にしない。
- 合格証拠: 表示額・承認額・請求額が一致し、改定が実行途中へ混入しない

**11. 実残高/与信と予約を原子的に結ぶ**
- 作業: 既存Wallet/親job予算を再利用。入金確認→利用可能→予約→実行→確定/解放を一つの資金権限で管理。A2Aと直接LLMの二重使用を防ぐ。
- 合格証拠: 同一残高から複数端末が競合しても上限超過ゼロ。未入金では送信ゼロ

**12. 少額の集約と月額更新**
- 作業: 保存済み高精度numerator/denominatorから請求期間へ集約し、丸め規則を定義。Stripe Meters/Credits採用なら別adapterと重複防止を追加。既存OS月額を維持し、更新/解約/支払失敗/再認証/適用期間を独立lineで扱う。
- 合格証拠: 1円未満・50円未満・期間跨ぎ・訂正・再送が一致。勝手な最低額切上げなし

**13. 停止・不明usage・返金を処理**
- 作業: 取消後の到着usage、応答消失、料金超過、Provider請求差異を保留する。支払い取消やchargeback後の未使用枠を失効し、使用済み損失の負担を記録する。
- 合格証拠: 結果不明を無料/成功へ変えない。既存A2Aをカードへ二重請求しない

#### G4 通知・再決済・返金の復旧を完成

担当: ROCK。依存: G2、G3の契約。仮工数: 3–5人日。到達点: 通知や通信が壊れても回収状態を復元。

**14. 通知の永続受付と定期照合**
- 作業: 署名検証後にevent ID/処理状態を永続化して再処理。外部APIを待たず安全に受付できる構成へ。未通知・未確定をschedulerで照合する。
- 合格証拠: 重複/逆順/数日停止/再起動でも二重計上ゼロ。処理待ちが監視される

**15. 失効決済と結果不明を区別**
- 作業: 現行20時間後の不明停止を維持し、Stripe照合後だけ再開。確実に未払いで期限切れのsessionは新attemptへ移せる契約を作る。
- 合格証拠: 旧attemptが後で成功しても一請求。解決担当と証拠が残る

**16. 返金・紛争の完了状態を作る**
- 作業: クラウド返金を実行する管理権限、部分返金/失敗/取消、dispute won/lostの決着を追記。現行disputed固定を直接paidへ書換えない。
- 合格証拠: カード返金・販売者送金戻し・手数料返金・利用権を各々照合

#### G5 購入後の提供と失効を商品別に完走

担当: JOINT / EXTERNAL。依存: G1、G2、G4。仮工数: 3–6人日＋Provider待ち。到達点: 支払った商品だけを一度提供。

**17. eSIM発行を実Providerで受入**
- 作業: validateと実transactionを分離。応答消失時にorderReferenceを回復できる永続client referenceまたはProvider冪等性を確認。未確認なら自動再送しない。
- 合格証拠: 同じ注文から二重仕入れなし。不明注文を正しいProfileへ一意に復旧

**18. eSIMからクラウド利用権へ接続**
- 作業: 支払→Profile配信→実端末導入proof→本人service access→cloud keyを別状態で保存。返品/期限切れ/端末交換/鍵再発行を検証する。
- 合格証拠: Pixel 10 GL066の同じ本人で導入/利用/失効。秘密QRをログへ残さない

**19. Tool・CSV・ハードウェアを受入**
- 作業: 外部Toolの提供者側認証/返金失効、CSV通常料金と50円試験の区別、物理商品は在庫/納期/配送/返品を接続する。
- 合格証拠: 各販売SKUで購入から提供・返金まで証拠あり。買えるだけを完成にしない

#### G6 同じ配備物で外部sandbox・実機試験

担当: JOINT。依存: G3、G4、対象商品のG5。仮工数: 3–5人日。到達点: mockを外しても一連の取引が成立。

**20. 実Stripe sandboxを接続**
- 作業: 別sandbox、専用webhook、固定API版、test/live分離、server-only鍵を設定。合成eventだけでなく実際にtest Checkoutを作って通知を受ける。
- 合格証拠: Stripe session/intent/chargeとRock行の実ID・金額・通貨が一致

**21. 失敗系を通す**
- 作業: 3DS成功/中断、残高不足、ブラウザ終了、二重クリック、復帰、Webhook重複/逆順、API timeout、返金失敗を試す。
- 合格証拠: 全シナリオの期待結果と実結果を同一buildで記録

**22. 利用と予算の端末間一致**
- 作業: PCとPixel、本人A/B、複数端末、圏外→再接続、料金改定、usage欠落、Provider再起動を試す。
- 合格証拠: 古い画面や他端末から支払/権限/上限を上書きできない

#### G7 入金・原価・復旧を運用へ接続

担当: ROCK / OWNER / JOINT。依存: G4、G6。仮工数: 2–4人日。到達点: 売上と実際の手残りが説明できる。

**23. 日次の多者照合**
- 作業: 注文/請求、Stripe charge/refund/fee/balance transaction/payout、銀行着金、LLM usage/invoice、通信卸明細を関連付ける。
- 合格証拠: 未説明差額ゼロ。端数/FX差は理由と担当を記録。10%売上手数料を純利益と呼ばない

**24. 監視と停止手順を実演**
- 作業: 長時間pending、不明注文、負残高、通知失敗、原価超過、鍵失効、Provider残高不足を検知。新規決済/実行を止めても照合と返金は動かす。
- 合格証拠: 通知先、当番、対応期限、停止/再開操作を実演。閾値はpilot前に確定

**25. 復元と秘密管理を受入**
- 作業: D1/R2・暗号鍵・監査記録を復元し、外部Stripe/Providerの後続取引を再照合する。鍵ローテーション、PCI自己評価等のアカウント要件、サポート、決済/認証境界の独立レビューを確認する。重大・高リスク未解決を残さない。
- 合格証拠: 復元後も再請求・再発行ゼロ。RPO/RTOは計測して承認し、DB復元だけで完了にしない

#### G8 限定実利用から本番判定へ

担当: OWNER / JOINT。依存: G0〜G7の対象gate。仮工数: 2–3人日＋入金/請求周期。到達点: 指定範囲のPRODUCTIONを宣言できる。

**26. 一つの代表商品で限定実利用**
- 作業: 対象owner、金額上限、SKU、Provider、期間を確定。受入済み版を配備し、購入→提供→利用→明細→返金の最小実取引を照合する。
- 合格証拠: 同一source/build/deploy IDの証拠。過去CSV50円を新経路の合格へ流用しない

**27. 締めと障害を観測**
- 作業: 少なくとも対象の実入金・Provider請求が閉じるまで観測。月額/まとめ請求は請求周期を受入。返金と復旧演習の未解決を解消する。
- 合格証拠: 二重請求・承認超過ゼロ、未説明差額ゼロ、重大未解決ゼロ

**28. 対象別に本番表示を解禁**
- 作業: Sky商品、eSIM、cloud、hardwareを個別に判定。未受入SKUやnative OSを一括で本番対応にしない。版更新時も同じgateを再適用する。
- 合格証拠: 運用責任者が証拠付き判定。一般公開後も監視・更新・再受入を継続

### 段階ごとの必要試験

各項目は環境（fixture / Provider sandbox / 実機 / limited live）、source/build/deploy ID、実行日時、秘匿した取引参照、期待結果、実結果、差額、未解決条件を記録する。合成データを実課金や実機受入の証拠にしない。

- **本人・承認**: A/B分離、偽gateway、eSIM keyから決済拒否、鍵失効、同一本人2端末。合格: 他人情報/無断承認なし。
- **金額**: 単価更新、通貨変更、quote期限切れ、1円未満、50円未満、税/端数、親予算競合。合格: 承認額を超えず、集約明細と総額一致。
- **送信・通知**: 8並行、timeout直後の再起動、同じ通知10回、逆順、通知数日停止。合格: 外部注文/請求は一件、復旧が同じIDへ収束。
- **決済**: 3DS成功/中断、拒否、ブラウザ終了、期限切れ、結果不明20時間超。合格: 未払を払済みにせず、安全な再開へ。
- **提供**: Stripe支払済み・eSIM仕入失敗、導入失敗、二重発行、Toolアクセス拒否。合格: 不提供を検出し返金/再提供へ。二重仕入れなし。
- **取消**: 全額/部分返金、返金失敗、売手口座停止、紛争勝敗、使用済みクラウド。合格: 資金・利用権・履歴が一貫。
- **復元**: D1復元、Worker/cron再起動、旧鍵/新鍵、圏外復帰、外部で先行した入金。合格: 再課金せず照合。RPO/RTOを計測。
- **経理**: 手数料、Connect分配、payout、銀行着金、通信卸・LLM請求。合格: 理由のない差額ゼロ。収益と入金を区別。

### OWNER側で確定する5項目

- **D1 最初に売る商品・国・通貨**: 対象SKU、販売者、対象国、JPY/USD、公開先。必要時期: G1前半。
- **D2 クラウド小売単価**: 原価、上乗せ、無料枠、税、端数、返金条件。必要時期: G3着手前。
- **D3 資金確保方式**: 用途限定前払か上限付きまとめ請求か。汎用Wallet転用をしない。必要時期: G3着手前。
- **D4 通信供給と請求主体**: 直接請求経路の有無、再販権、残高資金、支援窓口。必要時期: G5外部受入前。
- **D5 限定実取引の条件**: 本人、SKU、Provider、金額上限、期間、停止担当。必要時期: G8直前。

### コマンドと証拠の使い方

既存回帰: `node --experimental-strip-types --test tests/shared-stripe.test.mjs tests/sky-stripe.test.mjs tests/sky-commerce.test.mjs tests/csv-trial-payment.test.mjs tests/sky-usage-payment.test.mjs tests/sky-payment-worker.test.mjs`。eSIM固有試験は既存workstreamのコマンドを再利用。
各変更後に対象試験、`npm run typecheck`、`npm run design:check`。統合候補は `npm run verify`。`npm run sky:launch:check` と `node scripts/check-sky-launch.mjs --require-stage focused` は既存gateに従う。full verify成功は本番gate合格を意味しない。新しいfunding/集約/復旧の試験は実装と同時に追加する。
G6以降はCLIによる合成通知だけでは不足し、外部sandboxの実test注文/通知、実端末、配備先DBの読戻しを必要とする。Web/client課金の完成はPixel native OS全体の完成と分離し、OS image/正式署名/flash/全損復元は別の既存release gateで受け入れる。

### 一次資料（今回確認）

- [Stripe 最低決済額](https://docs.stripe.com/currencies#minimum-and-maximum-charge-amounts) — 最小額は決済/入金通貨に依存。JPY50・USD0.50の表があり、極少額usageの都度徴収には集約設計が必要。
- [Stripe Billing credits](https://docs.stripe.com/billing/subscriptions/usage-based/billing-credits) — 対象は所定のmetered subscription。単発Checkoutへの自動適用や第三者への支払い・汎用残高を前提にしない。
- [Stripe Webhooks](https://docs.stripe.com/webhooks) — 順序保証なし、重複あり、本番自動再送は最大3日。Rockの定期照合・復旧証拠が必要。
- [Stripe 冪等性](https://docs.stripe.com/api/idempotent_requests) — 冪等キーは少なくとも24時間経過後に削除され得る。長期の結果不明を単純再送しない。
- [Stripe Connect destination charges](https://docs.stripe.com/connect/destination-charges?platform=web&ui=stripe-hosted) — 決済手数料・返金・紛争はplatform残高へ影響。販売者送金戻しとapplication fee返金の照合が別途必要。
- [Stripe Billing試験](https://docs.stripe.com/billing/testing) — 実testオブジェクトからの通知と失敗系を検証。採用する場合はtest clocksで請求周期も確認。
- [Stripe 入金照合](https://docs.stripe.com/reports/payout-reconciliation) — カード決済成功と銀行着金は別。payoutと構成取引を突合する。
- [Stripe セキュリティ](https://docs.stripe.com/security/guide) — Hosted Checkoutでも自社側のPCI責任は残る。該当申告と構成を確認する。
- [Stripe 鍵管理](https://docs.stripe.com/keys-best-practices) — 秘密をserver側に限定し、最小権限・ローテーション・監査を運用する。
- [eSIM Go v2.5 orders](https://docs.esim-go.com/api/v2_5/operations/orders/post/) — 実注文の契約を確認。公開ページ内にidempotency記述は見つからず、非対応とは断定しない。Provider確認が必要。
- [eSIM Go install details](https://docs.esim-go.com/api/v2_5/operations/esimsassignments/get/) — referenceを使って既知注文の導入情報を取得。注文応答自体を失った場合の一意復旧とは別。
- [eSIM Go 本番受入](https://docs.esim-go.com/guides/going_live/) — 残高、鍵管理、実端末への配信、エラー処理、V3署名callbackを受入する。自動補充は予算承認なしに有効化しない。
- [Cloudflare D1 復元](https://developers.cloudflare.com/d1/reference/time-travel/) — DBの復元手段。外部決済まで過去へ戻るわけではなく、復元後の外部照合はRockの設計事項。

### 未確定・今回の作業範囲

契約アカウント・販売地域・実単価・予算は未確定。この調査では問い合わせ送信、契約、実注文、実課金、配備、main統合を行わない。前ターンの試験証拠を再掲し、今回新たなruntime合格とはしない。今後の実装許可と本番実取引の条件を混同しない。

<a id="cross-provider-usage-observation"></a>
## 業者共通LLM/Agent計量と作者還元（2026-10-22）

1. **目的/体験**: Eveの仕事ごとにProvider・model/Agent・入力/出力/cache/thinking/Provider meter単位・価格版・金額とその確定度を同じ明細で見る。利用者の許可候補・外部送信・上限を既存selector/Brokerで先に絞り、異なるtokenizerのtoken数だけで品質や割安を決めない。
2. **責任**: BIL02/AI02/AI05/SKY14/SKY21、主担当Billing/ROCKはadapter、明細/契約版、本人別保存と照合。EXTERNALはAPI計量/価格/Invoice/作者身元と受取条件、JOINTは同一job/Provider応答/Invoice/入金/返金の受入、OWNERは候補/送信/上限と作者契約を決める。
3. **入出力**: `sky-usage-observation/1`はsource(llm/agent)、providerId、resourceId/報告名、basis、status、meter/unit/quantity/包含関係、通貨/amountMinor/価格版/reference、invoiceVerified=false、developerPayment契約未結合を持つ。LLMはAPI応答の固定fieldだけ抽出し本文/credentialは保存しない。Agentは既存owner-scoped署名検証済みreceipt DB行を投影し、rowとowner/親job/delegation/provider/reference/currency/合計の一致を確認。
4. **モデル別の意味**: OpenAI/compatibleは入力にcacheが含まれ、reasoningは出力の内訳。Anthropic通常入力/cache読取/cache作成は独立。Gemini candidates/thoughts/cache/tool入力を別項目にし、知らない内訳を再加算しない。Ollamaはprompt/eval/cacheカウンタで、local/remote実行場所は別契約。wall timeをGPU請求秒へ換算しない。Pollinations/将来業者は未報告から開始し、adapter受入前に全社対応を宣言しない。
5. **状態**: reported/partial/not_reported/invalid、価格計算済み、invoice照合、入金済み、報酬計算/送金を別管理。生のProvider応答counterは請求の権限ではない。既存OpenAI final usage＋trusted rate＋承認上限の再計算と、A2A署名/予約/最終receiptのgateを維持。
6. **保存**: paid OpenAIは既存暗号化request/usage/price行、Agentは既存receipt/署名/累積snapshotを使用。新観測は表示投影で、他社の永続/単価/請求adapterや作者配賦台帳は未統合。direct会話の直近meterは同じthreadにのみ表示し、台帳に昇格しない。
7. **失敗/復旧**: 欠損はnull、負数/小数/overflow/既知total不一致はinvalid。価格不明は未確定、0円と表示しない。署名/owner/row不一致のAgent投影はnull。既存同一ID再読/照合を使い、meterの欠落で再実行しない。
8. **承認/報酬**: model供給者、GPU運営者、model著作者、Agent作者を区別し、権利と契約の受取先/価格版/計算基準をserverで結合する。既存Sky販売の作者料率だけをその販売契約へ適用し、LLM原価に一律10%を上乗せしない。受取契約未結合はdeveloperPayment.amountMinor=null。使用量だけから既存EarningReceipt/Walletへ入金や作者報酬を捏造しない。
9. **合格条件**: 全現行adapterのfixture応答から計量が返る、cache/total/thinkingの二重加算なし、欠落/0/異常値の区別、owner/receipt不一致拒否、型/lint/既存Provider・署名/HTTP検証、一般UIの読み取り表示。host fixture、実Provider、公開Site、本番入出金は別受入。
10. **次の未完了**: 各Providerの版付き料金・最大額予約・永続idempotency・最終応答/Invoice照合、作者権利/受取契約・入金済み元明細の一度限り配賦・返金/争議・既存settlementへの接続を順に実装。接続条件未定の業者を有料実行しない。

一次資料: [Gemini usage](https://ai.google.dev/gemini-api/docs/tokens)、[Ollama chat](https://docs.ollama.com/api/chat)、[Anthropic cache inputの区分](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)。OpenAIの現在の価格検証は既存remote-ai-text設計を正本とする。

### 保存した共通使用量の表示（U01）

検証DBは本番の復元前提と区別する。配信用drizzle-mainは既存/backup復元済みDB用で、0020のALTERを空DBへ直接適用しない。検証用は同一系列のSQLと、元Source1b65413の0016〜0019から固定した10表/11triggerを使う。generic store試験はTEMPの移行記録で業務データを汚さず、ファイル型monthly sandboxのみ移行記録を保存する。元のinvoice合計・改変拒否・共有quota、再読時の一回計上、二owner/再送の期待値を保持する。旧$140/$100 sandboxは$16の料金決定へ転用しない。修正はSource-only patchと[現在の受入証拠](evidence/sky-source-regression-repair.json)に保存し、本番DBや請求の修正済み宣言にはしない。


公開v111/source6f32e4d55fc1eecb156bffba8f8e8fdaba1a1cafを本人の明示承認で配備。正式ドメイン/匿名拒否を確認、本人UIとU02/U03は未完了。Source全体verifyの古い参照欠落、原版でも再現する金融9失敗を、Rootの全体成功と区別する。

目的は、Eve/仕事/無料Cloudの結果で提供元・指定モデル/Agent・応答モデル・計量内訳・未確定額を同じ意味で読むこと。ROCK/O5（SKY21/BIL02）は既存owner/job/receiptへ投影し、Providerは原始応答、作者契約/入金/送金は別gateを担う。

入力はLLM応答counter、owner-scopedの保存済みremote AI、既存署名検証済みA2A receipt、free Cloud WorkJob。出力sky-usage-observation/1はinput/output/cache/reasoning/totalの包含関係、requested/reported model、出典reference、reported/partial/not_reported/invalidを持つ。未報告はnull、amount未確定は0円にしない。観測表示は実行権限・請求・入金・作者支払いの証明ではない。

free Cloudは既存work_jobs JSONへ保存し、同一ownerの再訪/同一ID再送で同じ観測を読む。応答後に完了検査が失敗したunconfirmedも観測だけを保持し、新規送信・成功・金額確定へ昇格させない。古い仕事にないtotal/cache/reasoningを推測しない。直接chatの表示は会話を切り替えるとclearし、多Providerの全attempt永続台帳はU02で接続する。

障害時は同じjob/receiptを再取得し、結果不明を再送で解消しない。owner/revision/外部送信同意、既存budget・Spider Guard・停止を保持する。原稿/API keyを計量へ入れない。表示追加だけで課金・権限・作者債務を作らない。

合格は既存adapterの合成応答、欠落/0/不整合、cache/thinking二重加算拒否、owner/receipt不一致、queue再開・応答不明・再送なし、同じsource build/公開/本人UIを別々に記録すること。検証はtests/sky-usage-observation.test.mjs等。Provider料金/Invoice/作者契約は未決を保持し、現段階は独自料金や入金/送金を追加しない。証拠docs/evidence/sky-usage-public-integration.json。

Eve計画用の端末内Ollama推論は、既存WorkJobのattemptへserver受領usageを保存する。送信marker/期限/同じownerをCASで検査し、browser応答喪失後もcounterと候補を再読取りできる。local tokenを有料Cloud枠へ課金せず、null/invalidを0や支払済みにしない。署名Agent receipt・課金済みProvider請求とは異なる観測であり、作者契約/入金/配分の確定には使用しない。全Providerの原価/顧客請求/作者報酬の接続は既存の別gateに保持する。


### Eve実行SI・SI06への接続箇所（2026-10-22、実コード照合）

### 隔離Sourceの月次観測保存と反転保留

BIL02/SKY21/OS10/WEB04・ROCKのSource候補19fe452に、本人の既存Invoice/Provider参照・通貨/額を入力とする観測保存を追加。目的はunknownや逆順応答で保留を失わないこと。既存Invoiceの2 nullable JSON列へpending/request/revisionと検証済み反転証拠を保存し、最新slotだけ結果を書けるCASと、遅延した負の証拠も残す独立保留を使う。読取りは同じowner/accountから復旧し、旧schema/clientと元行を保持する移行を用意。型/形式/本人/保存失敗では保留し、通常再照会を解除承認にしない。EXTERNAL/JOINTの実Provider・受取先・返金/送金、OWNERの権利/費用/解除条件は別gateで、全状態で送金許可は出さない。合格はhostの競合/移行と同一Worker/D1再起動の範囲に限定し、実UI/本番/Root runtimeへの統合とは区別する。[実装・復旧コマンド・証拠](evidence/eve-monthly-payment-observation.json)。


Sourceの既存月次adapterへ、明示的なPOST `inspect-payment`による現在のInvoice/PaymentIntent/Charge/Refund GET照合を追加。pending返金はamount_refunded0でも保留、現在の返金/異議と未知/分割/残ページを区別する。これはreadbackでありInvoice/作者精算の状態は書き換えず、送金許可を発行しない。実Provider受入・永続返金/送金/回収処理は未完。[同一候補の検証](evidence/eve-monthly-payment-evidence.json)。


**現行Sourceとの統合差分（2026-10-23）。** `work/eve-v115-agent-integration` の固定候補では、署名作者契約→配分候補→同意→月次明細取込までがあり、作者へのtransfer/refundの永続処理は未結合。RootのLinux/commerce決済をこのSourceの受入へ転用しない。集中43件成功は合成Providerを含む境界の証拠で、実請求/入金/作者払出しではない。[差分と合格条件](evidence/eve-author-settlement-gap.json)。次は既存Invoice配分・返金・transfer契約とschemaを照合し、同じ原始source/作者契約/Invoice行へ接続する。未入金/返金/異議の凍結、重複/逆順通知、既送金後の要回収、端数負担を検証し、未確定の契約条件を勝手に補わない。


- Agent原始明細は`a2a_delegation_store`の同一owner/parent/delegation署名検証済みreceipt、表示は`observeStoredAgentUsage`。`developerPayment=contract_not_bound`を維持する。修正前後は別delegation/receiptで、元成果の置換は元費用の取消ではない。
- Cloudの既存回収入口は`lib/sky-usage-payment.ts:cloudUsageStatement`。現在は`source=cloud_llm`、既存RemoteAiTextStoreとOpenAIの確定usage/verified rate/cap再計算だけを使う。Agentや別Providerをこの入口で回収済みとしない。
- Linuxの既存作者配分は`lib/sky-linux-service.ts`の`close-month`で、保存済みlisting.creatorId/authorMinorを集計して既存Invoice.allocationsへ保存する。`lib/sky-linux-billing.ts`がそのInvoiceの入金/配分/返金側のadapter。Agentの提供原価をauthorMinorへ直接コピーしない。
- `lib/settlement.ts`は旧収益/原価の純粋計算器であり、A2A原始usageの永続精算台帳ではない。全体promptの「既存settlementを再利用」はこのファイルへ新しい並列台帳を作る意味ではない。

次の実装は既存商品/作者契約と版付きのsource receipt結合から着手する。owner・parent・delegation・provider/receipt reference・currency・価格版・契約版・受取作者をserverで照合し、同一sourceの重複結合/owner越境/返金後の再配分を拒否する。金額不明・契約未登録・未入金は保留し、請求/送金を起動しない。ROCKはこの結合とfixture、JOINTは後続の同一Provider/Invoice照合、OWNERは作者契約/価格/受取条件を担当。これは接続設計の明確化であり、U02/U03 runtime完成や実決済の受入ではない。


### Eve SI06：Agent原始利用元の追跡

目的は本人がEveの同じ仕事から署名済み利用receiptとPackage登録作者へ辿ること。入力はserver固定owner/parentJob/delegationのみ。既存A2A receipt storeの行/owner/provider/reference/通貨/合計を共通観測で検査し、receiptのSHA256を返す。binding参照がなければagent_only、参照/digest/Agent版/Provider/価格版/manifest不一致はpackage_unavailable、一致時だけpackage_attributedとexact Package/現在registry登録作者を返す。登録作者は報酬契約の受取人とは別で、developerPaymentはcontract_not_bound/amountMinor=nullを維持する。

ROCKはread-only投影と暗号化Eve会話への参照保存、EXTERNALは元Provider明細、JOINTは同一receipt/Package実接続、OWNERは後続の報酬契約を担う。新しい台帳/料金/配賦/請求/送金/権限は作らない。元receiptを変更せず再読込は同じ保存行を読む。現在registryが対象manifestを持たなければ作者を推測せず保留。失効したbindingも過去の出典として失効状態付きで表示し、実行資格へ昇格しない。原稿/鍵/生の署名原本を表示しない。

合格条件は別owner/親job拒否、receiptの照合失敗は投影なし、Agent/価格版/digest/manifestの改変で誤帰属なし、同一source反復で料金/DB変更なし、Eve会話にreceipt参照/hashと帰属の確定度が保存されること。障害時は既存receipt/仕事を保持して再読し、再実行しない。集中試験と実UIを分ける。永続作者契約版/入金/配賦は未実装で次のgate。

### Eve SI06：利用元の初回固定と競合検知

本人の「進捗を会話へ反映」で、既存WorkJob.eveAgent.usageSourcesへserver照合したreceipt/Provider/価格版/Package/現在の登録作者とcapturedAtを追記する。receipt本文や鍵、新しい金銭台帳は追加しない。同一delegationは初回だけ保存し、再反映ではrevisionを増やさない。並行保存は既存親revision CASで一つだけ受け付け、停止が先に確定した場合は再読込を要求する。停止回収では帰属保存を行わず、停止を優先する。

固定後にreceipt参照/hash/Provider/価格版/Package/作者の観測が変わった場合は保存時の利用元を保持し、現在情報との照合待ちを表示する。binding失効は現在状態として別表示し、保存済み出典は変更しない。復旧は同じjobを再読する。登録作者の確定や報酬契約の同意はこの保存から推定せず、developerPayment契約未結合/amount nullを維持。全owner/子件数/既存暗号化会話の境界を保持する。ROCKは保存と競合、OWNERは後続報酬条件の承認、JOINTは実Provider/請求一周を担当。集中試験で一回保存/並行競合/作者変更/失効を検証し、実UIの反映/再読を別に受け入れる。

### Eve SI06：二者署名の作者利用契約と固定source結合

目的は、保存済みAgent利用元を特定の作者・運営の合意した契約版へ一度だけ結ぶこと。独自内部schema `sky.author-usage-agreement/1` はid/version、publisher/platform/provider、exact Package/manifest、価格版、通貨、terms SHA256、発行/期限、双方key ID/Ed25519署名を持つ。独立の署名domainを使用し、全署名対象fieldを固定。server環境 `SKY_AUTHOR_AGREEMENT_TRUSTED_KEYS` のrole/principal/key/package pin/statusに一致する異なる二つの公開鍵のみ信用する。設定なしは拒否する。

既存認証/Origin/body12KB保護のEve Agent PATCH action `bind-author-agreement` はowner/parent/sourceを照合し、固定済みusageSourcesと現在のreceipt/Package/登録作者が一致・bindingがactiveである場合だけ検証する。契約の発行より前のreceiptや通貨/価格版違いは拒否。既存WorkJobのsourceへ契約原本/hash・receipt hash・boundAtを保存し、親revision CASで一度だけ確定。同一契約再通知は保存revision不変、別契約への上書きは拒否。停止済み仕事/履歴鍵利用不可は新規結合を拒否。

状態はcontract_not_bound、agreement_bound_pending_collection、agreement_unavailable。毎回のsnapshotで現鍵の失効/期限/出典競合を再検査し、保存済み契約は保持したまま有効性確認待ちを示す。結合は金銭台帳・追加請求・作者配賦・送金を作らず、amountMinorはnull。ROCKは署名/照合/原子保存、OWNERと作者は実際の条件本文確認と署名、JOINTは実Provider/Invoice照合を担う。今回の合成署名は法的契約成立・本人の署名操作を実証しない。terms本文の登録/表示/明示同意UI、契約単位失効、旧sourceに通貨/receipt時刻がない場合の確認移行、既存請求/配分連携は後続gate。任意JSON/自己申告の同意を契約として扱わない。集中試験は二者署名/改変/通貨/owner/期限/失効/上書き/並行を含み、UI・実契約・本番は別に受け入れる。

### Eve SI06：契約本文の不変版registryと本人確認表示

内部資料registry `sky_author_agreement_documents`（0080 migration、db/schema対応）はplatform/publisher/agreement ID/versionを主キーとし、二者署名原本/digest、terms本文/hashと作成/失効を保存する。金融台帳は追加しない。`register-author-agreement` は既存owner/WorkJob/captured sourceと二者署名を検証後、正確なUTF-8本文8KB/hash一致時のみ登録。同じ版の再登録は同じrowを返し、別本文/digestは拒否。DB triggerも本文/署名/版の更新・削除・失効取消を拒否する。失効はserver内部の当事者actor付き操作のみ、未認証公開endpointなし。

利用元への結合は登録本文の存在/hash/非失効を必須とし、WorkStore更新の同一SQL条件で非失効/契約digestを再検査する。preflight後の失効競合でも新結合を拒否。読取は署名有効性と独立に保存済み失効本文を保持し、現在の資格は別表示。既存auth/Origin/12KB request境界を保持。契約本文は通常snapshotへ含めず、本人のGET `id=...&terms=1` で対象sourceの同一Package/publisher/provider/価格版/通貨に一致する最大10版/childを取得。scriptを実行せずReactのplain textで表示し、親仕事が変われば旧要求をabortして表示を破棄する。

Eve「作者利用契約を確認」から登録済み/利用元結合待ち/照合済み/失効の本文を読める。これは同意・請求操作ではない。ROCKは不変版/署名hash/原子結合/本人表示、作者/OWNERは内容と実署名、JOINTは後続の実作者/Provider/Invoice一周。合格は本文改変/版競合/失効取消/owner越境拒否、preflight失効CAS競合、HTTP登録/結合/本文読取、実UIのplain text/再読込/空状態。本人署名ceremony・法的有効性・料金計算/入金/返金/作者配賦/本番は別gate。資料hashは内容の合法性・合意の法的成立を保証しない。


### Agent作者料から既存回収へ接続する前の制約

`drizzle/0060_sky_usage_payments.sql`はsource_idにremote_ai_text_executionsへのFKを持ち、INSERT triggerも完了済みLLM/owner/確定額/上限を検査する。`lib/sky-usage-payment.ts`もcloudUsageStatementを再計算し、test modeと明示enableだけを許可する。AgentをLLMの架空executionへ写してこの制約を通すことは禁止。`lib/sky-linux-service.ts`のInvoiceも別のLinux契約/period/jobへ束縛するため、Agent sourceを黙って混在させない。

ROCKの次の実装は、既存回収recordのversioned source種別を拡張する移行とserver source resolverを設計し、LLM旧record/FK同等検査/immutable/重複防止/返金単調性を維持すること。Agent側は同じowner/job/receiptSHA/quoteDigest/二者契約/料金版/候補IDから再計算し、Invoiceと入金の照合前は保留。請求主体・Providerへの既払/BYOK・作者料のみか合計か・返金時の項目配分は未確定なので実課金へ昇格させない。OWNERは実契約と料金/請求条件、JOINTはProvider/決済sandbox照合を担当する。既存残高を複写せず、返金と支払候補の元sourceを保持する。移行・旧データ再開・同source二重請求拒否・別owner拒否・未入金/返金/紛争で作者払出し不可が合格条件。これは未実装の接続順で、今回の候補保存/UI受入を回収/精算完了にしない。


### Agent契約明細を既存支払い画面から照合（SI06）

既存`POST /api/sky/payments/statement`へ`source:sky_agent`と元delegationのsourceIdを渡す読取経路を追加。ROCKはowner-scoped WorkJobの固定source/現在binding/二者署名/非失効本文/元quote/receipt/承認上限/保存済み配分候補を再照合し、`sky.agent-usage-statement/1`を返す。入力金額は受け付けず、観測総額、作者料、既存10%手数料、作者受取候補、他利用額、通貨、原始参照hashと同じEve job/threadへの参照を示す。collectionはnot_configured、providerInvoiceはunreconciled、customerPaymentはunconfirmed。型既定のcloud_llm経路は維持し、不明sourceを拒否する。

既存支払い画面のAgent行で「契約と配分候補を照合」を選び、結果と同じEveへの導線を読む。読取は仕事/支払/金融台帳を変更せず外部APIも呼ばない。失効・鍵不足・source変化・候補改変は理由を示し、履歴の元利用額を0へ置換しない。詳細読取の遅着応答は画面更新/unmountで破棄する。Agent checkoutは未対応のまま、LLM専用FK/trigger/二重請求防止を維持する。Invoice/顧客回収への接続には前節のsource移行と実請求条件が必要で、この明細を請求可能/入金済みとしない。EXTERNALは実Provider請求/決済、OWNERは請求主体/BYOK既払/課金範囲/返金配分、JOINTは将来の実sandbox照合。合格はserver再計算、owner/未登録/失効/候補改変拒否、同じ明細の再読取不変、金融row0、実UIの読取/戻り先/失敗。公開は別gate。


### 署名済みAgent請求経路の準備（SI06、未回収）

`sky.author-remuneration-terms/2`は既存作者料条件にcollectionを追加する。modeはplatform_invoice/external_provider、chargeScopeはauthor_fee/receipt_total/none、usageFundingはplatform/byok、refundPolicyはitemized_source/1。組合せを厳密検証し、external_providerはnoneのみ、platform_invoiceのBYOKはauthor_feeのみ。旧v1/plain textは保持し、請求経路を推測しない。既存不変本文/hash・作者/platform二者署名へcollectionも束縛する。本文変更は新しい契約版・署名が必要。

既存Agent statementは、照合済み本文と再計算済み候補からsky.agent-collection-plan/1を返す。platform_invoice候補は指定作者料または総額の原始minor額、BYOK作者料限定ではその他利用額を除外する。external_providerのRockstar請求候補はnullで、支払済みや無料とは扱わない。planは同じallocationCandidateId/receiptSHA/agreementSHA/通貨を持ち、customerConsent=missing、providerInvoice=unreconciled、invoice=not_created。既存collection=not_configured/入金未確認を維持する。

本人はEveの契約詳細と既存支払い明細で請求経路/対象/保留条件を読む。開閉/読取は同意・Invoice作成・引落ではない。ROCKは厳密parse/原始額再計算/版束縛/表示、OWNERは実契約と請求同意、EXTERNALはProvider請求/既払の証拠、JOINTは将来の回収照合。返金はsource lineへ紐付ける方針だけを固定し、部分返金/税/紛争の配分と既払検証が実装されるまでは回収/作者送金を無効にする。新台帳や架空LLM/Linux記録を作らない。失効/不正条件は拒否し、旧記録を保持して新契約で復旧する。合格は署名改変拒否、BYOK総額再請求拒否、direct providerのnull保持、旧契約未設定、同明細再読取不変、金融record0、実UIと回帰。既存月次Invoice/回収source移行と利用者同意束縛は未実装の次工程。


### Agent請求準備の本人アカウント確認（SI06）

既存Eve commandにrecord-agent-collection-consentを追加。本人認証/Origin/同じjob/source/暗号化会話/現binding/二者契約/非失効本文/元quote/receipt/保存候補を照合し、利用者が表示したstatementDigest、正確なminor額、通貨、confirmed=true、親revisionを検査する。platform_invoice候補だけが対象で、Provider直接払い・旧未設定・BYOK総額への変更は不可。確認記録sky.agent-collection-consent/1は同じWorkJob.usageSourcesへ保存し、新金融台帳を作らない。記録はowner/source/digest/候補ID/契約SHA/receiptSHA/額/通貨/時刻/保留status。IDはこれらの確定参照から決定的に生成。同条件の再送は同じ記録/版、異条件は409。同時更新は既存CASと原子的な契約非失効fenceを通す。

支払い面の「この金額・条件の確認を記録」は請求準備用の確認であり、自動引落/送金の許可や法的契約成立の実証ではない。既存会話へ短い確認記録を投影し、再読込では同じ条件の確認済みを表示。確認前/記録後ともProvider請求未照合・Invoice未作成・入金未確認・collection無効を保持する。失効/金額/版違いでは理由を表示し、保存済み確認記録を改変せず、新しい有効条件で復旧する。停止済みjobの保存済み利用明細確認は可能だが、job status/stop intentを保持し新しい委任・権限・予約を作らない。ROCKは照合/保存/UI、OWNERは内容を読んだ操作、EXTERNALは実Provider/決済、JOINTは将来の実Invoice/同意/回収一周。

合格はowner/改変/未確認/古い版/失効拒否、CAS競合/失効競合、同一確認再送、停止job非復活、元usageと金融record不変、会話/実UI/reload。本人署名ceremony、実請求契約、Invoice source移行、Provider請求/既払/部分返金/税/異議、実収納/送金は未完了で、確認記録を実回収へ昇格しない。


### 完了Agentの請求準備を既存支払いstoreへ保存（SI06 / migration 0081）

既存sky_usage_paymentsをsource_kindでcloud_llm/sky_agentへ分ける。既存source_id→remote_ai_text_executions FKを残し、Agent用agent_source_id→agent_delegations FKとconfirmation_idを追加する。旧LLM全列/入金参照/返金/時刻をそのままcopyし、cloud_llm既定・Agent列nullで移行する。sourceごとの一意制約、session/intent一意、額/通貨/参照不変、返金単調、削除禁止を保持。新台帳や架空LLM/Linux jobは作らない。

Agent行はtest/prepared専用、source_id=null、元Agent/確認参照必須、session/intent=null・返金0。CHECKでpaid等への昇格を拒否する。準備額は原始JPY/USD整数（1〜99,999,999minor）をそのまま保存し、checkout最低額へ切り上げない。既存LLMの50minor最低額とstate集合は保持。SQL insert guardはowner/job/完了Agent/receipt/承認上限/現在binding/固定source/確認digest/額通貨/候補/非失効の署名本文を照合し、BYOK作者料のみ・platform管理の明示総額だけを受ける。暗号署名とquote hashの再計算は既存server resolverが先行し、保存時の契約失効競合はDB guardで拒否。

既存POST /api/sky/payments/prepare-agent-invoiceはSKY_PAYMENTS_MODE=testかつSKY_USAGE_AGENT_INVOICE_PREPARATION_ENABLED=trueの検証環境だけで、同じstatement digest/金額/通貨と本人確認済みを再照合して保存する。入力owner/支払済み情報は受けない。同じsource/mode再送は同じrecord、異条件/不明/失効は409。Provider/Stripe APIは呼ばず、既存confirm/webhook同期はAgent preparedを拒否する。支払い面では確認済み候補から明示保存し、保存済み・Provider未照合を読む。旧LLMの照合ボタンをAgentへ表示しない。読み直しで復旧し、履歴参照を置換しない。

ROCKは移行/原子照合/保存/UI、OWNERは候補条件の確認、EXTERNALは実Provider請求と入金、JOINTは将来の実Invoice・回収一周。移行はmigration managerのtransaction/D1 batchで適用し、途中失敗をrollbackする。検証は旧LLM全項目/FK/guard保持、SQLiteと実D1 batch rollback、既存6移行系列、Agent一回保存/別owner・額・失効拒否、JPY端数非切上げ、paid昇格不可、実UI。初回の新D1試験はMiniflare旧形式起動設定で失敗し、既存convertV4MiniflareOptionsへ合わせて再検証する。

このrecordは請求準備で、正式Invoice/Provider請求照合/顧客収納/作者送金ではない。liveはschema/APIとも無効。失敗・取消Agentの費用、月次集約、実契約/本人の収納委任、既払/BYOK照合、税/部分返金/異議/送金、一般公開のgateを残す。実データへの移行/公開は未実行。

### Agent月次準備明細の保存（SI06 / migration 0082）

既存sky_usage_paymentsのsky_agent/test/prepared行を原本とし、共有sky_linux_service_documentsへkind=agent_monthly_statementを追加する。これは参照文書であり、Linux workspace/契約/基本料/利用権や別の金融台帳を作らない。ROCKは集約・本人分離・CAS・原本照合、EXTERNALは将来のProvider invoice、JOINTは将来の入金照合、OWNERは既存の各明細確認と将来の実請求/送金承認を担当する。

- 入力/状態: 本人がUTC利用月と元通貨USD/JPYを選び、検証flag下で月次下書きを保存。schema sky.agent-monthly-statement/1、mode=test/state=draft_unreconciled/baseMinor=0、invoice=not_created/collection=disabled/customerPayment=unconfirmedを固定。実請求書ではない。
- 原本: receipt.issued_atのUTC月（準備保存月/ローカル時刻ではない）と元通貨でprepared行を取得。各sourceの現在の署名済み契約・元usage・本人確認・digest/金額を再検査し、一件でも失効/不一致なら文書全体を保留。未報告/未準備を0円の行へ変えない。1〜200件、201件目は省かず409。未来月/不正月/通貨/他ownerは拒否または非開示。
- 合計/作者: 請求準備額と観測額を別集計。作者料/commission/payable/その他は原本ごとの整数をBigIntで合算、月額から10%を再計算しない。BYOK実費を準備額へ足さず、為替/料金改定/税務確定を行わない。
- 保存/復旧: owner+月+通貨+modeから決定ID、owner/kind/period/currencyの一意index、member payment ID重複拒否、各receipt月と元paymentの照合、旧memberの不変性をSQLで強制。署名照合と保存の間に契約/接続の期限が過ぎた場合も、DB時刻との比較で保存を拒否する。遅着した準備行だけ既存文書へappend、revision CASで同時更新拒否/同内容再送は同ID/revisionを返す。月次文書は削除/支払済み昇格不可。本文は元仕事/会話/receipt/契約の参照と料金メタデータだけ、原稿/署名原本は複製しない。既存Linux文書の6列はbyteを保持、新period/currencyはnull。0082中断はD1 batch内で旧表/制約までrollback。既存コードとmigration順は配信Sourceの独自系列へ個別適応する。
- 本人UI: アカウント全体の支払い明細内「月ごとの請求準備を開く」から月/通貨指定→保存/保存済み読戻し。観測総額と候補合計・未照合を先に、作者配分と元Eve仕事はdetailsで表示。Eve内の同job表示は全月の他jobを混ぜず、アカウント全体へのリンクを使う。保存一覧は最新100件と明示。閉鎖/遅延応答は無効化、条件確認や支払いへ自動昇格しない。
- 合格/未決: 同時同内容一件、遅着append、JPY19+19の手数料2/作者36、通貨分離、他owner拒否、改変/削除/member消失拒否、失効raceで全体保存拒否、旧文書保持/中断rollback、実D1と実UI/全verifyを同一候補で検査。現在はtest draftのみ。締め後訂正/正式invoice番号/Provider照合/入金/税務/作者送金/本番gateは未完、各実契約条件と既存BIL02で決定する。
