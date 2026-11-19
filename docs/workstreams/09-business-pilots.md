# Business Pilots

2026-11-17: 同じB02/B05/B06・ROCKで、[ターミナル用テンプレート](../../toolkits/noah-resale-agent/README.md)を追加。WebサーバーへHTTP接続する旧watchとは別に、共有serviceを直接呼ぶCLIとWork SQLiteを使用する。デモと実取引、CLIの保存先とWebのD1を区別する。


2026-11-16追加指示により、[専用実行機能](../services/noah-select-resale.md)を実装。`/noah/resale`と既存Work/D1で3担当の探索・予算予約・注文/公開API・検品・収支をつなぐ。初期予算0、実API利用権/アカウント/予算は未確定。以下の役割登録だけという記述は2026-11-15時点の履歴。外部実取引・全自動売買の合格はまだない。


## Noahのセレクト・リセール担当

2026-11-15の本人指示「おしゃれなせどり」「Noah」「それぞれに分けてagentを」に基づき、本人用localhost Noahの既存「文章担当を追加」で3担当を保存した。主担当Business Pilots / ROCK、既存B02/B05/B06。ストリート・セレクトはストリート服・小物、アーカイブ・セレクトは古着/デザイナーズ、オブジェ・セレクトは限定雑貨/デザイン/アートを担当する。[再現用テンプレート](../../data/noah-select-resale-agents.json)は専用のupload manifestではなく、`specialty + 改行 + commonInstructions`を既存の役割欄へ入れるための設定原本。現在のNoah UI・本人認証・revisionを利用し、製品catalog/会社役割/runtimeは増やしていない。

各担当は希少性の一次根拠・再販予定・同条件の成約・真贋・状態を調べ、全実費を含む採算3案、手入れ/撮影/見せ方、出品草稿と次行動を返す。未接続の検索・未閲覧の相場・物理作業を実行済みにしない。価値向上は確認可能な手入れ・情報・表現・梱包で行い、利益を保証しない。売切れや高い出品価格を数量限定/成約の証拠にしない。

ROCKは役割設定・入力/成果契約、EXTERNALはmarketplace/決済/配送、OWNERは予算・対象・販売条件・物理作業、JOINTは取引の結果照合を持つ。3担当共通の予算予約・在庫重複防止は実行前の必要条件であり、今回新しい共有台帳や自動売買adapterを実装したわけではない。外部操作には承認済み条件と受入済みの正規経路が必要。個人メルカリは既存の[出品支援境界](../mercari-revenue-loop.md)を維持する。

Noahの「役割を設定した担当」から選び「Eveに依頼する」で使う。初回依頼例は「この商品資料を比較して、仕入れ候補3件・保守的な利益・手入れ案・販売原稿を出して」。導入済みとして画面で確認したOllama `qwen3:4b`を選択したが、本作業での推論品質試験は未実施。購入・出品・検索Toolの接続、常駐監視、実取引、収益、公開Noahへの登録は未実施。

完了証拠はlocalhost UIでの3件保存成功と再読込後の3件表示、既存strict parserによる指示953/947/948字の受入、Agent Library/Mercari既存13試験の成功。途中のlocal server停止後は一覧に1件のみ残ることを確認して、未保存の担当だけ再作成した。次は総予算・1点上限・仕入れ/販売先を確定し、対応経路・入力資料・同じAgent版の推論を検証する。コマンドと全体検証結果は`data/project-status.json#noahSelectResaleAgents`に記録する。

## 仕事獲得AI

2026-11-14の本人指示「仕事をとるai」「ココナラとか、報酬が出る内容の自動化エージェントがあるから」を受け、[仕事獲得AI](../../.cursor/agents/avokado-job-acquisition.md)をREV00の用途別入口として追加。主担当Business Pilots / ROCK、既存B02/B03/B05/B06と営業18役を再利用し、製品catalogや新しい会社役割は追加しない。

本人のAgent能力確認→有償募集の取得→全成果物の適合と費用照合→上位3件の応募パケット→合意後の既存制作経路への引継ぎを有限batchで行う。初回は最大10候補。出品一覧と募集を分け、URL・確認日時・報酬・納期・Agent/版・不明点を記録する。未指定の分野を建築pilotへ固定しない。

現sourceの応募前チェック・案件管理・納品記録照合は、案件取得・自動応募・制作実行の接続ではない。`lib/catalog.ts`の提案文/依頼整理/受託workflow/台本/SEO/LP等も候補登録と実行接続を区別する。既存ココナラToolの自動応募禁止を変更せず、本担当の送信も本人の具体的な明示指示と正規経路の範囲に限る。

次回は本人の接続済みAgentと同じ版の成果を確認し、現在閲覧できる募集から応募案を作る。Web仕事は既存workflow、本人別管理は既存APIを使い、AI単独案件を人の固定報酬契約へ架空入力しない。顧客本文・応募草案はGitへ保存しない。設定/参照の静的確認、既存ココナラ試験、`npm run project:check`、`npm run baseline:check`、`npm run design:check`、`npm run verify`を実施し、結果は`data/project-status.json#jobAcquisitionAgent`へ記録する。実サイト探索・応募・実案件受入は別検証。

### 仕事の配布・実行管理

同日の追加依頼「仕事をふる処理をしてくれる機能もつけて」により、[仕事を振る担当](../../.cursor/agents/avokado-work-dispatcher.md)を案件獲得AIへ接続。既存REV00の用途別入口で、工程ごとの担当・入力版・依存・成果物・期限・予算・合格条件・実行IDを渡す。利用可能な委任ツール/既存Web経路で実行を依頼し、合格した成果だけを後続へ渡す。制作者とは別の検収、初回＋修正1回を既定上限とし、停止確認前の担当変更と二重配布を避ける。既存同時active上限3は親/検収/他担当を含む。

受注額は実行予算の承認ではなく、使用＋予約＋新規見積を既存予算へ照合する。未知の結果/費用は保留し、未接続Agent、任意shell、preview-onlyの制御APIを実実行へ読み替えない。人の固定報酬契約へAI作業を架空入力しない。顧客への応募・納品・発注・支払は具体的な明示指示の範囲だけで行う。今回の編集は担当設定と呼出し導線であり、製品runtime/API/schema/catalog変更・Noah配備はない。検証は合成内部案件の実委任/依存/別検収と既存回帰を分け、`data/project-status.json#jobAcquisitionAgent.dispatch`へ残す。

## Founder & CEO / Product Ownerの運用責任（2026-11-03）

本人の主担当を`OWNER`の **Founder & CEO 兼 Product Owner** とする。本人の「役割を細分化して」により、既存4担当を**統括1役＋専門17役**へ分ける。CEOは方向、重要商談、価格・契約・公開・支出・提携の決裁、最終受入を持ち、調査・営業事務・導入・継続運営は下記の担当へ渡す。

役割の定義は[data/revenue-role-map.json](../../data/revenue-role-map.json)。REV00〜REV17は担当IDであり、既存B02/B03/B05/B06のtaskを増やしたり、製品の完了数を変えるものではない。既存4ファイルは互換のため保持し、REV00を統括、旧Sales & PartnershipsをREV12の提携専任、Solutions EngineerをREV09、Pilot SuccessをREV14へ絞る。

| 担当ID | 分野 | 役割 | 必須成果物 | 次の専門担当 |
| --- | --- | --- | --- | --- |
| REV00 | 統括 | [事業進行・統括](../../.cursor/agents/avokado-revenue-operator.md) | 案件一覧、次担当・期限、CEOへの判断一覧 | REV01・REV02・REV03・REV04・REV05・REV06・REV07・REV08・REV09・REV10・REV11・REV12・REV13・REV14・REV15・REV16・REV17 |
| REV01 | 集客・調査 | [市場・顧客課題調査](../../.cursor/agents/avokado-market-researcher.md) | 顧客層・困り事・既存代替・反証をまとめた調査票 | REV02・REV04・REV08 |
| REV02 | 集客・調査 | [見込み顧客リスト作成](../../.cursor/agents/avokado-lead-researcher.md) | 出典・確認日・公式窓口付きの候補票 | REV03 |
| REV03 | 集客・調査 | [顧客適合・優先順位判定](../../.cursor/agents/avokado-lead-qualifier.md) | 適合・保留・除外の判定と確認質問 | REV06・REV08 |
| REV04 | 集客・調査 | [商品企画・訴求設計](../../.cursor/agents/avokado-product-marketer.md) | 一枚の商品説明、価値仮説、offer、表現根拠 | REV05・REV06・REV10 |
| REV05 | 集客・調査 | [発信・コンテンツ・コミュニティ](../../.cursor/agents/avokado-content-community.md) | 投稿・事例・紹介資料の草案と問合せへの導線 | REV07 |
| REV06 | 営業 | [初回営業・個別文面](../../.cursor/agents/avokado-outreach-specialist.md) | 相手固有の件名・本文・依頼内容・宛先確認 | REV07 |
| REV07 | 営業 | [返信・日程・追客管理](../../.cursor/agents/avokado-sales-coordinator.md) | 返信案、日程候補、商談準備票、追客または終了判断 | REV03・REV08・REV11 |
| REV08 | 営業 | [課題ヒアリング・商談設計](../../.cursor/agents/avokado-discovery-specialist.md) | 現行手順、困り事、決裁者、成功条件、反証の商談記録 | REV09・REV10・REV03 |
| REV09 | 提案・受注 | [技術提案・デモ設計](../../.cursor/agents/avokado-solutions-engineer.md) | 能力対応表、デモ手順、pilot範囲、必要時間・直接費入力 | REV04・REV10・REV13・REV14 |
| REV10 | 提案・受注 | [提案書・見積・採算設計](../../.cursor/agents/avokado-proposal-pricing.md) | 版付き提案書、見積案、範囲・条件・採算計算 | REV11・REV17 |
| REV11 | 提案・受注 | [商談進行・交渉・受注](../../.cursor/agents/avokado-deal-manager.md) | 交渉論点、条件差分、受注または失注根拠、次行動 | REV17・REV13・REV16 |
| REV12 | 提案・受注 | [提携・紹介網・外部供給](../../.cursor/agents/avokado-sales-partnerships.md) | 提携候補・役割分担・紹介導線・契約論点 | REV02・REV07・REV09・REV17 |
| REV13 | 導入・継続 | [顧客導入・初回設定](../../.cursor/agents/avokado-onboarding-specialist.md) | 導入手順、担当者、初回利用記録、保留・復旧手順 | REV14・REV09 |
| REV14 | 導入・継続 | [試用運営・成果検収](../../.cursor/agents/avokado-pilot-success.md) | 成果と顧客判定、失敗・復旧、支援時間、続行判断案 | REV15・REV16・REV09 |
| REV15 | 導入・継続 | [継続支援・再利用・紹介](../../.cursor/agents/avokado-customer-success.md) | 継続計画、再利用証拠、離脱理由、許諾済み紹介・事例候補 | REV08・REV10・REV05・REV16 |
| REV16 | 事業管理 | [請求準備・入金照合・採算](../../.cursor/agents/avokado-revenue-finance.md) | 請求案、注文・入金・返金照合、仕事単位の採算表 | REV10・REV15 |
| REV17 | 事業管理 | [契約・権利・外部専門家窓口](../../.cursor/agents/avokado-contract-operations.md) | 条件差分表、未解決論点、専門家照会資料、署名状況 | REV11・REV12・REV13・REV16 |

### 細分化した担当の共通運用

**起動と所有**: 各担当は`AGENTS.md`、指定の正本5ファイル、workstream入口、責任分界、本節と役割台帳の自分の行を読む。主担当はBusiness Pilots。目的に必要な役割だけを呼び出し、同時activeは親と既存開発担当を含め最大3。役割設定は常駐実行・予約・通知・雇用を開始しない。24時間の応答などは運用目標であり、担当の起動や継続監視の設定がない期間を対応済みにしない。

**共有更新**: 各専門担当は割り当てられた専用成果物を所有し、REV00は営業pipelineと変更要求を集約する。project/status/README等の共有pathは既存開発registryのglobalWriterCurrentと明示された引継ぎを優先し、現在のglobal writerまたは当該変更の引継ぎ済みrootが更新する。REV00を全社共通writerへ自動昇格させない。他担当の編集を戻さず、所有pathが重なる場合は現在のownerと統括が調整する。顧客PII・連絡先・会話原文・契約本文はGitへ保存せず、本人が指定したprivate systemを使う。

全社の開発・QA・リリース・運用との接続は[全社分担](10-git-ci-operations.md#営業開発品質運用の全社分担)を参照する。前記18役は営業・顧客運営の範囲で、会社全体の役割の完成を意味しない。

**引継ぎ票**: 各成果に「案件匿名ID、担当ID、入力根拠、成果物参照、完了条件の判定、次担当ID、次の一手、期限、未解決条件」を添える。次担当一覧は候補であり、該当先だけを選ぶ。REV00が内容を照合して次担当と期限を確定し、不足は発生元へ戻す。合格根拠のない成果を完了にしない。期限までに進まない案件は、理由と再開条件を付けて保留・終了またはCEO判断へ移す。

**判断権限**: 社内調査・分析・草案・引継ぎは依頼された範囲で進め、既承認行動の再承認は求めない。メール・DM・投稿・会議招待などの送信は本人の明示依頼・許可内で行う。価格・契約・支出・公開は既存OWNER権限、法務・税務・資格判断はEXTERNAL専門家へつなぐ。使用accountの選択や役割ファイルの作成だけで対外送信を許可済みにしない。

**技術との接続**: REV09が顧客仕事を`accepted_now / manual / build_required / external_dependency / not_offered`へ対応付け、必要な実装を既存開発担当へtask ID・最小path・合格条件付きで渡す。現在の名称はEve・Noahを使い、既存API/schemaの互換を維持する。

### 案件の進め方とCEOへの報告

顧客獲得の主経路は`REV01/04 → REV02 → REV03 → REV06 → REV07 → REV08 → REV09 → REV10 → REV11`。契約確認が必要ならREV17を経由し、合意後はREV13の導入、REV14の成果検収、REV15の継続支援へ渡す。REV05の発信とREV12の提携から来た問合せもREV07へ集め、適合判定へ戻す。

REV16は見積時の原価入力から、受注後の請求・入金・返金照合まで並行して関わる。支払の時期は契約条件によるため、再利用の後に必ず支払う一本道にはしない。案件状態、連絡状態、pilot状態、請求/入金状態をそれぞれ記録する。従来のpipelineStatesは履歴・表示用の語彙として保持し、新しいruntime状態遷移は実装しない。除外、失注、休止はどの段階でも理由と再開条件を残せる。

CEOの窓口はREV00に一本化する。通常は週2回20分の判断block、適合済みの重要商談、週1回30分のreviewを目安にし、カレンダー登録済みとは扱わない。各判断は「決めること、推奨、根拠、正確な文面/金額、リスクと取消、承認後の次行動」の6点で出す。担当全員からCEOへ別々に確認を重ねず、既に決まった範囲はそのまま進める。

最初の仮説は、小規模な建築・インテリア専門家の一つの実案件で、依頼、revision、見積、承認、成果を追う7日concierge pilot。既存sprint目標の適合調査10件・個別草案5件・discovery候補3件・pilot提案1件は維持する。REV00が実在する成果物を照合し、REV01/04が顧客とoffer、REV02/03が候補と適合、REV06が個別の最終文面を整えて判断一覧を作る。以前の調査・草案件数の報告を、この細分化だけで再受入したとは扱わない。

`ROCK`は担当設定・社内準備・実装・試験・証拠を担い、`EXTERNAL`は専門家・Provider、`JOINT`は実顧客/端末/Providerを含む受入、`OWNER`は本人の決裁を担う。既存の料金、権限、実機、本番、公開gateは維持する。

## avocadoProを米国で実際に販売・製造・発送するgate（2026-10-21）

本人は「購入して商品も用意して送れる」事業を明示し、初回販売・発送地域を米国、販売名義を`avokado LLC`、資金方針を「自転車操業で始める」と指定した。これは**在庫を積まない一台ずつの受注生産**の方針であり、無資本で納期・返金を約束できるという意味ではない。Proの先行募集は継続するが、現時点の`/pro/`は注文・決済ではない。[販売判定データ](../../data/avocado-pro-sales-readiness.json)と`node scripts/check-pro-sales-readiness.mjs`が不足証拠を列挙する。判定は内部運用補助であり、Stripe checkoutに接続された技術的販売gateではない。`salesEnabled=false`、有料Pro注文0件、発送0件を維持する。

本人はavokado LLCの登記州をNYと申告し、New York, NYの住所は**連絡先のみ**と指定した。完全な住所は公開repo/サイトへ複写しない。登記の公的照合、組立場所、返品の現物受取先、顧客公開用連絡先は未確認。[NY Department of Stateの法人status検索](https://dos.ny.gov/node/35461)で法人情報を照合する。NYで課税対象の現物を販売する場合は[NY税務局のsales tax vendor登録案内](https://www.tax.ny.gov/bus/st/register.htm)と[Certificate of Authorityの案内](https://www.tax.ny.gov/bus/doingbus/sell.htm)を照合し、登録済みの証拠を取る。一般に必要な申請は販売/免税証明書の使用開始予定より20日以上前という案内があり、現時点の住所提供だけで登録済み・徴税可能とは記録しない。

Sites v39で公開画面へ米国先行と「構成→実機検証→個別offer→組立検査/追跡配送」を追加。本人の筐体選択後、**現行v40**（source `10c42c69b3b8b6e503f72f908e8b66b690ac4810`、deployment `appgdep_6ad88342660881918833dfc5ddae24e2`）で銀色A4-H2Oを最初の試作筐体候補として構成UIに表示し、丸いStudio画像は別の外観構想であり初号機の実写ではないと明記。`https://avocadopro.si/`の実responseで新文言を読戻した。14 route build、36/36 site tests合格。画面は将来の購入手順を説明するだけで、現在の有料checkout・実部品・納品はない。

### 最初の一機種と調達

暫定SKU `pro-studio-16`は既存のValue構成を起点にAMD Ryzen 7 9700X、[ASUS Dual RTX 5060 Ti 16GB OC `DUAL-RTX5060TI-O16G`](https://www.asus.com/us/motherboards-components/graphics-cards/dual/dual-rtx5060ti-o16g/techspec/)、ASUS B850-I、QVL確認済み64GB RAM、2TB NVMe、750W級SFX PSU、CPU cooler、11Lの銀色[Lian Li A4-H2O `A4 H2OA5 SILVER`](https://lian-li.com/product/a4h2o/)を候補とする。本人はA4-H2Oを**最初の実機筐体**として選択し、低いMac Studio風の専用筐体を次版に回した。GPUの公式寸法229×120×50mm・2.5 slot・8-pinと、A4-H2OのGPU長最大322mm・3 slotの**紙上寸法**は合う。ケーブル曲げ/温度/騒音まで含む物理適合は未試験。筐体は326×140×244mm、CPU cooler高最大55mm、mini-ITX/SFX対応である。現サイトの丸いStudio renderを初号機の実売外観、同一実機の部品写真、熱試験の結果として使わない。[ASUS board公式仕様](https://rog.asus.com/us/motherboards/rog-strix/rog-strix-b850-i-gaming-wifi/spec/)はAM5 Ryzen 9000、DDR5 2 slot、ITXを示すが、memory kitのQVL、BIOS、GPU実寸/補助電源ケーブル、CPU冷却とdriverは**同じ試作機**で確認する。[NVIDIA公式](https://www.nvidia.com/en-us/geforce/graphics-cards/50-series/rtx-5060-family/)のRTX 5060 Ti 180W/推奨600Wは個別製造元カードの実装適合を証明しない。5090とGB10は初回SKUに入れず、検証後の別商品候補とする。

調達入口は[Ingram Micro USのreseller登録](https://usa.ingrammicro.com/site/cms?page=Become-a-Reseller)を第一候補とし、実際の再販アカウント、価格、在庫割当、支払期日、返品/RMA、drop ship可否、出荷先とsales-tax resale certificateを**書面で**確認する。登録・与信・仕入発注は未実施。第二候補の小売/別卸は同じ型番と新規正規品、保証/シリアル、キャンセル可否で比較する。仕入先が単一部品だけ欠品した場合も、無断代替をしない。構成変更は顧客へ差分と新価格・納期を再提示して明示同意を得る。価格・在庫のWeb表示は引当ではない。

2026-10-21の[ASUS製品ページ](https://www.asus.com/us/motherboards-components/graphics-cards/dual/dual-rtx5060ti-o16g/techspec/)はこのGPUのStore Priceを$799.99と表示した。一方、[NVIDIA発表時の16GB開始価格](https://www.nvidia.com/en-us/geforce/news/rtx-5060-desktop-family-laptop-5060-coming-soon/)は$429であり、現在の単品公開価格を初回SKUの低原価と仮定できない。いずれもavokado LLC向けの在庫確約・一台納入価格ではなく、`economics.partsCents`へ入力しない。価格競争を狙うなら卸の書面見積と代替カードの正規在庫を比較し、既製筐体/検査/返品reserve込みで最低contributionを満たすことが先決。

**仕入先への未送信RFQ草案**: “avokado LLC is evaluating one US build-to-order AI desktop prototype with an RTX 5060 Ti 16GB. Please quote the exact manufacturer part number, new/authorized stock, one-unit delivered cost and a separate ten-unit scenario, quote expiry, allocation/lead time, payment or net terms, cancellation/RMA process, manufacturer warranty transfer, and component serial traceability. Please also state whether you can drop ship parts to our designated US assembler and whether resale certificates are required for that ship-to state. No substitutions without a revised written quote.” 型番の最終表と送信先は契約/会社情報確認後に埋める。この草案は送信済み見積ではない。

### 一件の注文を成立させる運用

1. **証拠の固定**: 部品ごとの製造元型番、仕入見積番号・有効期限・数量割当、税/輸送費、組立担当、実機serialを内部台帳に固定する。顧客PIIや資格情報はGitへ保存しない。
2. **一台試作**: 同じ構成で機械的fit、給電、GPU/CPU連続負荷、温度/騒音、メモリ/SSD、ネットワーク、driverとlicense、初期化/更新/バックアップ/復旧、Sky/Eveの限定仕事を測る。RockstarOS 1.0のnative imageを未受入で出荷しない。出荷時のOS/client/service accessは同一実機で受け入れた範囲をSKU表示へ明記する。
3. **販売条件**: avokado LLCの正式住所/連絡先、対象州と税登録、総額・税・配送費、配送対象ZIP、発送見込み日、キャンセル/遅延/返品/保証/故障受付を公開し、本人が承認する。米国[FTC通信販売rule](https://www.ftc.gov/business-guidance/resources/business-guide-ftcs-mail-internet-or-telephone-order-merchandise-rule)に従い、約束した発送時期の合理的根拠を持ち、遅延時は購入者の同意か適時の返金へ進む。時期を明示しない場合も30日発送の合理的根拠が必要。確証のない将来日で決済を開かない。保証の文面は[FTCのwritten warranty規則](https://www.ftc.gov/legal-library/browse/statutes/magnuson-moss-warranty-federal-trade-commission-improvements-act)を確認する。
4. **見積と利益判定**: 顧客提示価格（sales tax除外）から部品・仕入送料・組立/検査・梱包・発送・顧客サポート・保証・返品reserve・決済手数料を引いて一台のcontributionを出す。既存Mini実装を再利用する場合の比較値として[Stripe標準米国online domestic cardの公開料金](https://stripe.com/pricing)2.9%+30¢を**仮置き**し、採用する決済事業者の実契約と支払手段ごとに再計算する。内部仮説は最低15%かつ$200のcontributionで、**未承認**。閾値を満たしても固定費・所得税・広告費・在庫事故まで補填する証明ではない。部品を支払う時点と決済入金時点の差額は手元資金か書面で確定した仕入与信で賄う。顧客からの前受け全額を無条件で仕入に使わず、返品/chargebackのreserveを保有する。
5. **決済**: 事業者は未選択。StripeはMiniにCheckout/署名付きwebhook/返金照合のコードがあるための第一候補であり、Proの確定方針ではない。USの顧客カード/銀行支払手段、総手数料、入金までの日数、返金/異議申立、税、本人/会社名義、private注文台帳との照合を比較してOWNERが決める。選定後、Pro専用の確定SKU/価格/条件snapshot、二重処理防止、支払失敗/期限切れ/返金/異議申立、sandboxと限定liveを検証する。MiniのJPY先行予約をProのUSD売上へ流用しない。2026-10-21のStripe app接続は再認証を要求し、CLI profileも期限切れ。本人が認証画面を開いたが、アカウント読取りと本番決済は未確認。税の自動徴収は必要な登録・州判定が整うまで有効にしない。
6. **組立・出荷**: 入荷時に型番/シリアル/破損照合→静電気・トルク・ケーブル検査→burn-inとOS/回復媒体→factory reset/顧客データ非残存→注文IDとserial紐付け→内箱固定/外箱、輸送落下試験→保険/追跡つきcarrier label→集荷scan→配達proof→顧客受領確認。梱包は[FedEx公式のdesktop PC梱包資料](https://www.fedex.com/downloads/downloadcenter/learn/HowToPack_EN.pdf)を参照し、GPUの輸送支持材/内部破損の検査を同一梱包で追加する。ラベル発行だけを発送完了にしない。
7. **支援と照合**: 7/30日目の故障・返品・driver/復旧問合せ、実返金、chargeback、組立時間、輸送事故を追い、SKUの次回原価/保証reserveへ反映する。注文ごとに`interest → quote → accepted terms → paid → parts allocated → built → QA passed → carrier accepted → delivered → support/closed`を分ける。`paid`はwebhook照合、`shipped`はcarrier受託scan、`delivered`はcarrier証拠とし、手入力の完了宣言を売上/納品証拠にしない。

### 米国Pro決済の候補比較（2026-10-21、未選定）

本人はStripeを候補に残し、他社と比較する方針を選択した。下表は各社の公開標準料金で、avokado LLCの審査結果・特約・入金保留・税処理を示すものではない。請求額が確定したら決済手段別の実契約料金で一台の採算を再計算する。

| 候補 | 米国内online cardの公開標準料金 | Proでの実装・運用上の確認点 |
| --- | --- | --- |
| [Stripe Payments](https://stripe.com/pricing) | 2.9% + $0.30 | MiniのCheckout/署名webhook/返金照合を調査して再利用可能部分を特定。ただしPro専用USD注文・税・出荷・返金は未実装、account読戻しは再認証要求。 |
| [Square Free Online](https://squareup.com/us/en/pricing) | 3.3% + $0.30（Free planのonline/invoice）。Payments API経由のonline rateは別枠2.9% + $0.30 | [hosted checkout](https://developer.squareup.com/reference/square/checkout-api/webhooks)と注文/返金webhookは提供される。どの料率がProの実際の実装に適用されるかをmerchant条件で確認。新しい注文連携が必要。 |
| [PayPal Checkout](https://www.paypal.com/us/business/accept-payments/checkout) | 通常card 2.99% + $0.49、PayPal/Venmo 3.49% + $0.49。Expanded Checkoutのcardは別条件 | ウォレットの選択肢はあるが、[注文作成→capture](https://developer.paypal.com/platforms/checkout/standard/integrate)と返金/異議申立の連携を新規実装・検証する。 |

現時点では既存コードと公開card料率からStripeが最初の技術検証候補だが、**採用決定ではない**。実際のmerchant受入、支払手段別料金、入金時期/保留、返金・異議申立、顧客体験、sandboxの同一注文照合を評価してOWNERが決める。比較だけでlive決済や顧客前受けを始めない。

### 現時点の責任とstop条件

`ROCK`: exact BOM/RFQ/価格gate、Pro専用注文とprivate ledger、QA記録、返金/配送照合を準備。`EXTERNAL`: GPU/筐体/部品の在庫・与信、組立/物流、Stripe、州税、保証/RMA条件。`OWNER`: avokado LLC名義の正式資料、販売州、使える運転資金または仕入与信、試作1台の発注、販売価格/保証/公表条件を決裁。`JOINT`: 同一実機、sandbox決済、限定の実決済、実配送、返金と収支を順に受け入れる。初回販売を開くための最低証拠は`data/avocado-pro-sales-readiness.json`全gateの添付先、`node scripts/check-pro-sales-readiness.mjs`のready、実checkout/物流dry run、ownerによる条件承認。**まだどれも販売可能という判定ではない**。仕入・顧客への請求・連絡はこの文書作成では実行していない。

## avocadoPro先行募集pilot（2026-10-21）

本人が事業として即時ローンチを明示。既に選択した「構成を保存して購入希望を受け付ける」範囲で、公開中の[avocadoPro](https://avocadopro.si/#pro-build)をSites v38へ更新した。製品紹介、実在部品の参考表示、構成保存/共有、初回製作への関心登録、申込取消を提供する。画面は「構成→実機試作/適合検証→確定した価格・地域・条件の提示」を説明し、決済、予約、納期確約はしない。公開ドメイン/TLSはSitesでactive、公開画面で受付可能と読戻した。D1 `pro_purchase_interests`は公開前の読取りで0件。合成受付/取消は既存試験で確認、今回の実顧客申込・契約・売上は0件。

主担当Business Pilots、既存`B05`/`DSP01`、Web `WEB13`と共同。`ROCK`は申込/取消・本人情報の私有保管・構成と関心の集計・試作/費用証拠を担う。`OWNER`は最初のSKU、対象地域、正式価格、契約条件、公開募集の顧客対応を決定する。`EXTERNAL`はGPU等の供給、筐体/組立、決済/配送/保守の契約。`JOINT`は顧客が望む仕事を同じ実機で試し、見積・注文・入金・納品・支援費を別々に照合する。受付データはSites D1でownerが確認し、同意した相手だけに手動で返信する。現時点で自動メールや外部募集投稿はない。

次の順序は (1) 申込の用途・地域・構成を本人同意の範囲で確認、(2) まず16GB GPUの単一SKUを候補に正確なBOM/供給/原価を取得、(3) 一台を組み立て、寸法・熱・騒音・電力・driver・OS復旧・Sky/Eve仕事を測定、(4) 販売地域の税/配送/返品/保証/サポート条件と確定価格を文書化、(5) 初回の有料注文/決済/納品をProvider記録と照合する。申込件数、用途の適合率、見積提示後の購入意思、実注文、確認済み貢献利益を別指標にする。部品の参考型番やSitesの公開を実機完成・価格受入・売上へ換算しない。


PR252の初回HEAD verifyは既存EVE13 testの非同期fingerprint未追跡で1fail。原固定18/失敗logを保持し、製品sourceを変えず待機Promiseをtrackするfixture修正と有限遅延回帰を別検収する。[原因・旧反例・待機境界](../evidence/development-execution/eve13-confirmation-fixture.json)。Pro source4/旧archive/共通権限契約は不変、単なる再実行成功で閉じない。

## PRO-02保存済みjobの再開入口（ROCK・2026-10-28）

最新main c3a9/PR251・同SHA全6check/4workflow成功から、Pro exact4をbyte不変採用。UUID形式確認→固定avoado.si job-onlyの明示別tab入口で、新規仕事/原本archiveと分ける。既存auth/owner/revision/同意/保存/停止/成果を再利用し、local notesや権限を送らない。sourceはRoot別検収PASS_SCOPED/5probe、中央関連95成功。author local実browserと合成common component/GET-only fixtureは別層。現在一覧外（100件上限）のexact GET、実認証/保存停止export/配備/実Pro/wholePRO02は未受入。

主担当Pro09、Git10統合、Root最終metadata別検収。次は固定manifestの検収→Git/HEAD/main同SHA CI。[11項目契約](../rockstaros-complete-design.md#pro-existing-job-resume)／[採用記録](../evidence/development-execution/pro-existing-job-resume-main-adoption.json)。検証: `node --experimental-strip-types --test tests/pro-existing-job-resume.test.mjs`、関連compose UI/route/artifact fixture、`npm run verify`。未配線helper・金融・full OS flashをこの入口の偽依存にしない。一般公開/616は保留。

## PRO-01原本archive入口候補

検収済み3source/testをmainb1b0基点で採用。Pro local export→固定avoado.si/account/import/pro→手動再選択/本人account確認/別同意を案内し、既存archive/auth/crypto/schemaは不変。関連40/独立5群とChrome local1512/390 UIを限定確認。最終head CI/独立metadata検収、認証済server保存・公開先実click/配備/native/wholePRO01は別gate。[詳細](../rockstaros-complete-design.md#pro-original-archive-entry)／[有限11lane引継ぎ](../evidence/development-execution/all-lanes-main-handoff-summary.json)。Rootregistry非操作、残616公開保留。

## PRO-01原本account archive候補

ROCKは既存Pro parserとEve暗号化履歴を再利用し、選択file→local preview→本人account確認/別同意→原本保管→全bytes/SHA読戻しをexact6で限定採用。旧P1/P2はr2で閉鎖、first56/current69の履歴訂正をhashで保持。新schema/鍵/WorkJob/Tool/modelなし、実account/browser/native/全移行は未受入。[設計](../rockstaros-complete-design.md#pro-account-original-archive)／[証拠](../evidence/development-execution/pro-account-import-main-adoption.json)。統合主担当10、Security/Eve境界を共有。

# Business Pilots

## CSV共通処理の4修正（2026-10-05、G04）

CSV変換・出力・検査・報告は共通標準機能として扱い、今回は[既存変換契約](../csv-business-v1.ja.md)の未知指定拒否、boolean型検査、未選択の重複キーの誤計数、code point順sortだけを修正する。主担当はGit / CI / Operations、ROCK。最新mainの受付・保存・復旧を保持し、料金・販売経路は変更しない。合成fixtureと4回帰試験は実顧客の受注・納品・検収・入金の証拠ではなく、P1/P2/P3やAMC完成へ換算しない。[統合証拠](../evidence/amc-fixture-csv-main-integration.json)。

## 目的

自動化を実際の仕事と収益へつなぎ、コード完成、販売開始、第三者取引、入金照合、継続利用を別々に測る。

## 現在地

- CSV整形は決定的変換、独立検査、私有成果物、7日保持、料金policyのP0実装中。35作業中11完了、5進行中、外部gate 19。
- メルカリは本人操作を前提に出品準備、費用計算、承認、未照合売上の安全な保存を実装済み。
- Fashion Brand OpsはCampaign、Sales Concierge、Production Cockpit、Instagram候補取込、MCP操作をmockで実装済み。
- SkyのココナラToolには応募前チェックと案件管理を統合。代表受注と担当者への個別発注、事前合意済み報酬・支払期日、進行、手入力の入金・返金・支払をowner別に記録する。実取引や振込は未接続で、手入力を売上実績としない。
- 真正な第三者有料取引、Provider入金、返金、払出し、継続利用の実績は未完了。

主なtask: `CSV00`, `BIL03`, `FB01`〜`FB06`, `B02`, `B05`, `B06`。

## 次に進める順番

1. CSV P0の独立queue、lease回収、scheduled purge、実スマホ動作を完成する。
2. 販売主体、注文表示、連絡、返金、個人情報、provider証拠を確定する。
3. 第三者の真正な有料取引1件を納品、検収、入金照合まで通す。
4. 5人、10件へ広げ、受注0、未入金、返金、介入、再注文も分母へ含める。
5. 自己購入、合成入金、手入力だけの完了を売上実績にしない。

## 完了条件

- P0コード、P1取引1件、P2複数利用者、P3自動接続、事業検証を別状態で記録する。
- 顧客データと成果物を本人別に分離し、retentionと削除を実測する。
- 外部市場の規約、公式API、固定IP、OAuth、決済条件に従う。
- 売上、利益、時間短縮を実測なしに表示しない。

## 関連資料

- [CSV仕事 v1](../csv-business-v1.ja.md)
- [CSV security](../csv-business-security.ja.md)
- [Mercari revenue loop](../mercari-revenue-loop.md)
- [Fashion Brand Ops](../fashion-brand-ops-integration.md)
- [Skyのココナラ](../sky-tools-complete-design.md#9-ココナラ)
- [CSV task manifest](../../data/csv-business-tasks.json)

## 検証

- `npm run csv:check`
- `node --experimental-strip-types --test tests/csv-transform.test.mjs tests/csv-fee-policy.test.mjs`
- `npm run test:fashion-brand-ops`

## メルカリ出品原稿の保存復旧

BIL03（AMC O5、ROCK）の原稿作成は、同じowner・保存ID・正規化済み商品条件で再確認できる。サーバー生成時刻や後続の承認状態は再送比較へ含めず、同時再送も本人別readbackで1件へ収束させる。入力変更は409、他ownerは内容を返さず、PATCHのrevision競合拒否は維持する。画面は応答不明時に入力と保存IDを保持し、新規作成・状態変更を止め、本人の操作で同じ内容を再確認する。確認前は画面を閉じないよう案内する。 追加の認証・離脱レビューでは、確認前の同一タブ内リンク移動を止め、別タブのサインインとダウンロードを許可する。認証確認中はフォームを保持したまま隠し、復帰後は本人別一覧を再取得する。component／navigation試験とローカルbrowserのHomeリンク停止→保存確認後の移動で検証する。

2026-10-11、修正前に時刻差のある再送と同時再送の409を再現。`node --experimental-strip-types --test tests/mercari*.test.mjs` は15件合格。実handlerとSQLiteで4096 byte境界、壊れたJSON/UTF-8、owner・Origin・認証、100件上限、保存前DB失敗、保存後の再送、再読込を検証した。component試験は保存後の応答喪失・同一ID再確認・二重submit防止を確認。ローカルbrowserの390px/1280pxでは合成商品の保存前503→同じ内容で再確認→1件保存→再読込→原稿承認を確認した。未確認入力は画面内だけに保持し、実出品・取引・Provider入金・料金徴収は行わない。

## ココナラの保存復旧

案件と手入力の入出金記録は、結果不明時に同じID・同じ正規化入力で再確認する。最初の作成条件と変更操作を本人別D1 payloadに残し、後続更新や応答喪失を挟んでも再送を重複計上しない。画面は未確認操作を保持して別操作を止める。API／SQLite、componentの応答喪失試験、ローカルbrowserの一時的保存失敗→再確認→再読込で検証する。外部受注・入金照合・銀行送金は追加しない。

2026-10-11の追加競合検証では、一覧GETへ世代を付け、認証失敗・新しい本人別一覧・保存開始より前の応答を破棄する。ココナラは401後の旧案件復活、アカウント切替後の旧一覧、担当開始PATCH後の画面巻戻しを3つの実component回帰で拒否する。メルカリは初回GETの空一覧が新規保存カードを消す競合を回帰試験とChromeの実component＋合成transportで検証した。サーバーのowner条件・同一ID再送・revision CASは変更していない。

追加の離脱回帰ではココナラも共通`usePendingSaveNavigation`へ接続した。ローカル実vinext/API/D1で保存前503→Home/Library移動の停止と入力維持→同一記録の再確認→移動再開を確認し、手入力receiptは0→1、revisionは1→2。別タブ認証・exportは許可する。強制終了・crash・history/programmatic navigationの永続復旧は保証しない。


## 保存途中の認証切替

2026-10-11、Material・メルカリ・ココナラで、Aの保存前DB失敗→401→Bとして同じPOSTを再確認すると、未保存の旧入力がBへ登録されることを実route／全migration SQLiteで再現した。既にAへcommit済みならID衝突で409、別ownerへの金額PATCHは404であり、認証権限の突破や自動二重入金ではなかった。

3画面は既存の一覧GETに追加した`ownerScope`を未確認操作へ固定し、送信直前のGET一致と`X-Rock-Owner-Scope`のAPI照合を行う。scopeは現在の`requestUser`のSHA-256識別値で、認証・権限・新DBではない。`POST/PATCH /api/coconala-team`（DELETEにも適用）、`POST/PATCH /api/revenue/mercari`、Material POST／WorkJob PATCHは、headerがある場合は不正値・別ownerを409 `OWNER_CHANGED`で書込前に拒否し、owner決定は常に`requestUser`に従う。既存API client互換のためheader自体は任意だが、この3復旧UIは確認済みscopeを必須とし、省略・不明を同一ownerと見なさない。

別ownerでは旧操作の再送と旧入力の表示を止め、元ownerで接続確認する。保留解除は元ownerで同じ保留操作を表示しているときだけ許可し、古いhandlerや別ownerから新しい保存IDへ移さない。解除は本文を残し、保存済み記録を削除しない。元owner側の保存結果確認を案内し、確認前の強制終了・永続復旧は従来どおり保証しない。外部送信・取引・実決済は追加しない。

関連98試験が合格（実route／SQLiteのowner固定8、実component復帰31、既存Material/Coconala/Mercari/WorkJob/eSIMの回帰）。未知scope、401→BでPOSTなし、A復帰の同一ID再送、確認直後のowner切替409、明示解除後の本文保持と新IDを検証した。Chromeでは実Mercari component・既存認証確認hook・実HTTP client・実route／SQLiteを接続し、認証入口だけを合成化したlocal fixtureで、A保存前503→401→Bで再送停止・A0/B0→Aへ戻り同一操作保存→再読込後A1/B0を確認した。本番IdPや実取引の受入ではない。

## Pro unknown原本archiveの限定復旧（2026-10-27）

ROCK/09主担当、05保存UI、10/G04統合。[同ID復旧契約](../rockstaros-complete-design.md#pro-archive-unknown-recovery)は未照合中のfile置換を同期live guardで拒否し、quarantine中cancelでもowner/targetだけを保持、私有内容は隠す。既存暗号化履歴/server/CAS/同意は不変。独立38+追加2・旧4反例とRoot31は別count。全verify/Git/main/同SHA CIは[新候補証拠](../evidence/development-execution/pro-recovery-eve-drain-main-adoption.json)で分ける。wholePRO01/実本人保存/native/公開は未受入。
