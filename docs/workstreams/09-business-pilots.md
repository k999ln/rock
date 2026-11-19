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

## 目的

自動化を実際の仕事と収益へつなぎ、コード完成、販売開始、第三者取引、入金照合、継続利用を別々に測る。

2026-10-19の明示方針により、主担当は`ROCK`とし、企業価値へつながる事業証拠をここで管理する。Rockは仕事・成果・費用・receiptの照合を作り、`EXTERNAL`は決済・市場・業務Providerの実記録、`OWNER`は対象顧客・契約・支出・販売/公開を決める。実取引と継続利用の縦断受入は`JOINT`。主な既存taskは`B02`・`B03`・`B05`・`B06`で、`CSV00`・`BIL03`は別仕事の事業証拠との比較対象とする。`FB01`〜`FB06`はFashion Brand Opsであり、Facebook地域対話のtaskではない。[経営判断と未実証範囲](../rockstaros-1.0-strategy.md#2026-10-19-avokadoの企業価値を高める経営判断)。

## 現在地

### 企業価値10時間調査：第1区間の事実監査（2026-10-20開始）

`avokado-strategy-executor`を開始した。最初の区間は製品・Git・Business Pilotsの受入境界を固定する。以下は戦略の最終選定ではない。

| 区分 | 2026-10-20の確認事項 | 戦略判断への影響 |
| --- | --- | --- |
| 実装・限定試験で確認 | [`lib/workflow.ts`](../../lib/workflow.ts)は仕事ID、revision、重複command ID、終了状態を照合する。[`lib/earning-bridge.ts`](../../lib/earning-bridge.ts)はProvider署名・完了済み実行を確認し、Billingへreceiptを渡す。[`lib/esim-cloud-access.ts`](../../lib/esim-cloud-access.ts)はowner/order/scope/期限/失効を照合する。 | 同じ仕事IDで成果・費用・復旧を追うpilotの既存部品にできる。コード存在を顧客需要や実売上としない。 |
| 限定受入 | [PixelのSky Linux証拠](../evidence/sky-private-linux-deployment.json)はPixel 10/Vanadiumと本人用Linuxの限定text lifecycleを示すが、一般公開・Cloud請求・full OSは受入外。[eSIM cloud access証拠](../evidence/esim-cloud-access-local.json)はlocal検証で、実回線・実Cloud・実請求・配備は未受入。 | Sky/EveのWeb/既存OS経路による仕事pilotを先に測れる。SIM/eSIMサービス入口の確定方針と、現在どの導入経路が使えるかを分ける。 |
| 有料Cloudの現在地 | [`lib/remote-ai-pricing-gate.ts`](../../lib/remote-ai-pricing-gate.ts)は外部有料model/agent経路の共通料金gateを`false`に固定し、見積・予算承認・確定usageが同じ実行経路につながるまで送信しない。[Pixel service setup状態](../../data/service-setup-integration.json)もserver/Androidが既定無効、実eSIM・Provider契約・本番がfalse。 | 最初の顧客pilotで有料CloudやPixel eSIM加入が既に使える前提を置かない。無料/決定的Toolまたは人が実行する仕事と、将来のCloud/eSIM商品受入を別の実験にする。 |
| 収益未実証 | [`lib/sky-linux-billing.ts`](../../lib/sky-linux-billing.ts)にはInvoiceの契約・本人・金額照合、[`lib/rockstar-service-setup-billing.ts`](../../lib/rockstar-service-setup-billing.ts)には引落0の支払方法準備がある。[Earning Receipt証拠](../evidence/tool-earning-wallet-bridge-20260915.json)のPASSは合成/限定相関で、実販売・Provider入金・払出し・返金を証明しない。ココナラ画面も手入力の案件/報酬記録で外部送信や振込を行わない。 | 仕事単位の採算は実入金、直接費、専門家/支援時間を取得するまで不明。月16 USDの設計基本料と未確定の枠/超過単価を実売上へ転用しない。 |
| Git/CIの境界 | GitHubの[main](https://github.com/k999ln/rock/commit/70c3e3ef3a05d6f0c9d068616a98f47a38b96d4a)は`70c3e3ef3a05d6f0c9d068616a98f47a38b96d4a`、作業branchは`951d82d5a491a284aed4e0d4d280171d835d4b43`。比較はdiverged、main側625 commit・branch側3 commit。main同一SHAの[verify](https://github.com/k999ln/rock/actions/runs/39101089973)、Android、SPIDERはsuccess。branch同一SHAは[source preparation](https://github.com/k999ln/rock/actions/runs/39052277743)のみsuccess。PR [#130](https://github.com/k999ln/rock/pull/130)、[#147](https://github.com/k999ln/rock/pull/147)はopen。 | 次の実装に入る前にmainの新しい共通契約・引継ぎ入口・優先順位を作業branchへ同期し、dirty差分を機能別に保全する。文書保存、branch反映、main統合、公開を別に追う。 |
| 顧客・地域 | 2026-10-20時点では本人が最初の検証地域に**New York City**を指定した。後続の明示方針ではNYCは**初回の対面開催地**であり、美術と建築の題材・協働先は地域を限定しない。市内のborough/地区、最初の有料仕事と支払者は未指定。Facebookを対話の主要インフラとする方針は決定済みだが、専用グループ、募集投稿、実案件、会費/放送契約は未受入。 | NYCの現地pilot候補にはNYC固有の母数・代替・制度を使い、地域非限定の美術/建築仕事には所在地ごとの資料と権利・資格を別に確認する。NY州全体や日本全国の住宅数/投稿数をNYCの顧客・収益へ変換しない。支払者比較は仮説のまま行う。 |

Phase 0の証拠を四分類する。「実証」は記載した**観測範囲の事実**に限り、顧客価値の実証へ広げない。

今回の事業pilotに流用できる資産と、引き継げない合格範囲を固定する。既存taskの`B02/B03/B05/B06`はいずれも`in_progress`、`SIM01`と`MAT18`も`in_progress`。`CSV00`は`in_progress`、`BIL03`の`done`はメルカリの出品準備・未照合売上管理のsource範囲であり、NYC案件の販売実績ではない。

`B06`はココナラ代表受注と制作担当者への日本語・円建て個別発注を扱う。NYCの店舗改善案件に流用するのは、依頼・条件・納品・検収・手入力入出金を分ける**設計上の知見**までである。現行taskの`in_progress`を米国の有料契約、専門家報酬、NYCの施工/資格の受入と扱わない。`FB01`〜`FB06`の完了条件もFashion Brand Ops固有であり、地域Facebookの参加・成果指標へ移さない。

別のWeb仕事候補`CSV00`には[2026-10-01の公開sample/Pixel確認](../evidence/sky-csv-trial-payment-acceptance.json)があり、本人サインイン、合成sample処理、画面上の再読込/ダウンロードまでの限定受入を記す。ただし同証拠の`productionStripePayment`・本番Webhookは未実施、Stripe live支払はpauseである。これはNYC空間pilotより先に実環境の仕事を観測できる可能性を示す比較材料であり、真正な第三者収益や現在も同じ配備物が公開中だという再読戻しではない。

| 既存資産 | 確認した範囲 | NYC事業pilotでなお必要なもの |
| --- | --- | --- |
| Eve/仕事 | `workflow`のowner・revision・状態、`work_jobs`のowner別D1保存 | 空間仕事template、関係者別同意/権利/成果/費用、保存期限と削除、複数関係者の権限 |
| Sky実行とAgent | 現branchの決定的text/CSV composition、見積/上限を扱うsource、料金gateで有料Cloud送信を停止。mainには本人限定の実無料Cloud応答と再開の限定証拠が別にある | 空間用Toolと専門家検収、現branch/mainの契約統合、同一実行での有料Provider usage/請求/返金、Cloud商用gate |
| eSIM/端末 | owner/order/scope grantのlocal試験、本人Pixel/Linux限定受入 | 実回線/issuer、販売国、機種別OS/復旧、一般顧客の導入。顧客課題pilotの必須条件にしない |
| avocadoMini/Proと空間 | `MAT18`は空間pilot/専門家協業の設計中。[Material workstream](11-material-invention-avocado-mini.md)はMiniの共同空間表示AS01〜06の物理受入0/6、工場向けR0は開発見積入力で製造指示ではなく、ProのPC hardware仕様も未確認と記録 | 同一閉箱の空間表示/安全、CAD/BIM原本照合、製造/販売/保守、Proの顧客用途と購入意思。最初の一件の仕事価値をMini/Pro完成待ちにしない |
| Earning/請求 | Provider署名receiptのhost/fixture確認、契約・Invoice/支払方法準備のsource | 本人以外の真正な注文・支払・入金、USD契約、直接費、返金、税/専門家契約 |
| 地域の対話 | Facebook会社ページ公開入口と、Sky自身のcommunity/投稿の[local合成受入](../evidence/eve-memory-sky-community.json) | NYCの参加者と課題、Meta上の実対話から本人同意済みjobへの移管、公開UGC運営/成果測定。Sky local communityをFacebook group実施と取り違えない |

[PixelのSky Linux限定証拠](../evidence/sky-private-linux-deployment.json)には実推論と端末上での保存・読戻しがある一方、`modelQuality`は最初のSI依頼を人材採用と誤解し、本人の成果レビューは未確認と記す。端末内LLMが動いたことを、NYCの専門家判断・契約書/図面の品質・顧客価値の証拠にしない。空間pilotは専門家の独立検収と本人の成果判定を別に必要とする。

| 観点 | 実証 | 限定受入 | 仮説 | 不明 |
| --- | --- | --- | --- | --- |
| 技術と導入 | GitHub main同一SHAのverify/Android/SPIDERが成功、branch同一SHAはsource preparationのみ成功 | 共通job/receipt/eSIMのhost fixture、本人用PixelとLinuxの限定text lifecycle。main側には本人の無料Cloud応答/再開の限定実利用証拠 | 既存Webと人手の専門家で一件の空間仕事を記録できる | NYCでの第三者一般利用、実eSIM/回線、full OS、有料Cloud実行と収益、再現可能な導入費 |
| 顧客と地域 | 本人の後続指示ではNYCは初回対面開催地で、美術/建築の題材・協働先は地域非限定。NYC公式資料の住宅賃貸・storefront空室は同市の各定義内の観測事実 | Metaの対話機能と既存Facebook会社ページは確認済み。専用communityと実案件は未開始 | NYCの一商業街路は候補の一つ。owner/店主/専門家/地域団体の判断・見積・承認が反復仕事になりうる | 初回有料案件の所在地・課題、到達可能な決裁者、現在の支出、支払者、再依頼、地域側の便益 |
| 料金と収益 | 月16 USDは設計基本料、旧888 cents式とSky Market 10%は別契約。現時点の料金gateは閉鎖 | 請求/receipt照合のsourceと合成試験はあるが、実Providerの入金・請求・払出しを証明しない | 案件費と専門家報酬を基本料から分ければ採算を検証できる | 真正な注文/入金、直接費と支援時間、返金、USDでの契約/税、仕事別貢献額 |

Phase 0からPhase 1へ持ち越す欠測は、(a) NYCの一商業corridor、または地域非限定の一施設/美術・建築仕事で実際に判断が止まった案件、(b) 利用者と費用を出す決裁者の同一性/相違、(c) 既存の無料支援・専門家・業務ソフトでなお残る作業、(d) 権利者と案件所在地の資格者のscope、(e) 真正な発注/入金と直接費・支援時間、の五つに絞る。公的な空室/助成/事業所数は(a)〜(e)の代理指標にはならない。候補のNew Lotsを選ぶなら、Cypress Hills LDCの既存staff/商店会と市支援が強い反例であることを先に検証し、既存の地区調査をAvokadoの実績として再計上しない。

実装開始の制約は、(1) main側625 commit/branch側3 commitの引継ぎ・優先順位を同期、(2) NYCの一件に必要なowner/権利・専門家・通貨・承認schemaを現在の共通jobと照合、(3) Cloud料金gateと外部Providerを別受入に置くこと。共有dirty checkoutの文書保存をbranch反映やmain統合と取り違えない。

同一artifactの鮮度も分ける。[eSIMの2026-10-05証拠](../evidence/esim-cloud-access-local.json)が記録する`lib/esim-cloud-access.ts`のSHA-256は`bb8df2…`だが、今回のcheckoutは`9cc73d…`で一致しない。証拠のsource baseから現在のbranchまでにrequest token/cookie、route scope、認証入口の追加があり、前のhashの試験結果をこの追加分へ自動継承しない。[Pixel/Linuxの2026-10-19証拠](../evidence/sky-private-linux-deployment.json)が記録する`lib/workflow.ts`のSHA-256は`99e01d…`で、今回の共有dirty sourceは`ca07ce…`である。どちらも**その時点・その範囲の履歴証拠**として参照し、現在の全変更を同一SHAで再受入したとは言わない。現行sourceの集中host試験とGitHubの同一SHA CIは別に記録する。

branchの差分は単に「古い」と総称しない。現branchには`lib/sky-payments.ts`と`app/api/sky/payments/[action]/route.ts`があり、[同一source hashの支払証拠](../evidence/unified-payment-verification.json)はfixture Stripe/localhost・実請求0・未公開である。これらは今回観測した`origin/main`にはない。一方、mainにはowner限定・外部送信同意付きの`lib/sky-free-cloud.ts`と対応APIがあり、現branchにはない。[main側の無料Cloud実利用証拠](https://github.com/k999ln/rock/blob/70c3e3ef3a05d6f0c9d068616a98f47a38b96d4a/docs/evidence/sky-free-cloud-live.json)は2026-10-17に本人アカウント・合成の無料専用契約・公開`avoado.si`でPollinationsの実応答を限定受入、[tab閉鎖後の再開証拠](https://github.com/k999ln/rock/blob/70c3e3ef3a05d6f0c9d068616a98f47a38b96d4a/docs/evidence/sky-free-cloud-background.json)もmain統合を記録する。ただし**無料・owner限定の経路**であり、NYCの第三者顧客、有料Cloud、production billingは未受入。mainの`/api/work-jobs`は現branchの経路にない`ownerScopeFor`読戻しと`rejectChangedOwner`をPOST/PATCHへ追加しており、同期時に本人切替拒否を落とさない。main/branchの`remoteAiPricingGateAccepted()`はともに`false`。この2026-10-17配備証拠を2026-10-20現在の公開読戻しへ自動更新しない。実装着手前には、mainだけの仕事API/無料Cloudとbranchだけの支払/導入コードを同じ契約・source/fixtureで照合し、優先順位を決めてから統合する。

mainの`lib/sky-free-cloud.ts`は`text.pollinations.ai`の匿名Free API Classicへ送る。背景継続を選ぶ場合は入力promptを`freeCloud.backgroundPrompt`としてjobへ載せ、mainの`lib/work-store.ts`はそのjobを`work_jobs.payload`へJSON保存する。この経路にapplication-levelの入力暗号化・案件別保存期限を確認できない。[Pollinations公式Terms（2026-09-16更新）](https://enter.pollinations.ai/terms)はbeta/previewのmodel・quota・価格変更や停止、出力を使う側のレビュー、SLA creditなしを定める。[公式Privacy（2026-10-15更新）](https://enter.pollinations.ai/privacy)はFree API ClassicのIP等のmetadata、選択model/経路による外部provider処理、標準DPAが現Termsへ組み込まれていない点を示す。本人の算術例の無料応答から、NYCの物件図面・借主/顧客情報を送れる権利、必要な機密保持、安定稼働、無料枠の商用継続を推定しない。初期の案件資料は外部送信なしの手順または契約/同意を確認した経路に留める。

同main証拠にある月140 USD/含有100 USD、Stripe Sandbox請求行1件は**合成契約とsandbox readback**であり、本人が設計した16 USD基本料の現実の申込/入金やNYC顧客の価格受容ではない。無料Cloudの`chargeMinor=0`も当該匿名API応答の記録で、案件支援・現地調査・専門家・保守の総原価0を意味しない。

Phase 0の差分を、後続の修正順と合格証拠へ落とす。いずれも本調査で実装・契約が済んだ意味ではない。

| 差分と原因 | 次の順序・担当 | 合格証拠と未解決条件 |
| --- | --- | --- |
| main/branchが625対3 commitに分岐し、mainの無料Cloud/仕事APIとbranchのSky Payments/導入契約が別 | `ROCK`が両方の入口・schema・既存仕事を保全して優先順位を決め、対象branchへ同期する。`Git / CI`の同一head検証を取る | 同じjob/owner/price版での互換試験と作業branch同一SHAの必要CI。共有dirty文書、main CI、branch統合を別記。統合手段・衝突内容は未決定 |
| 空間案件の型付き入力/版付きscope/多者同意が共通jobにない | `ROCK`が一件の実際の依頼から最小schemaと保存/撤回を定義し、`OWNER`が対象/公開を決め、権利者・専門家と`JOINT`で検証 | 誰のどの版への同意か、専門家が担うscope、保存/削除/持出しのreadback。初回物件、地区、決裁者は不明 |
| Provider署名receiptとSky Paymentsはfixture/限定sourceで、真正な外部顧客の入金・案件原価はない | `OWNER`が販売主体・役務範囲・価格仮説を決め、`EXTERNAL`が決済/専門家条件、`JOINT`がsandbox→限定取引を照合 | 実注文→納品→顧客検収→Provider決済/返金→仕事別直接費の同一ID証拠。建築専門役務の契約主体と受取先は未決定 |
| 有料Cloud価格gateが閉じ、無料Cloudは本人限定・匿名外部送信 | `ROCK`は課題pilotを決定的Tool/人の仕事として分離し、Cloud利用が必要な案では料金版・予算/usageとデータ送信条件を先に受入 | 同一実行で見積/上限/予約/実測usage/請求/失敗復旧。本人/物件資料の外部送信権限、Provider条件、原価は未確認 |
| eSIM利用権と物理回線・月16 USD契約開始は未受入 | `ROCK`がWeb案件価値とは別に導入/請求stateを保存し、`EXTERNAL`がissuer/Provider、`JOINT`が同一端末・契約を検証 | 真正な開通・本人結合・対応端末/復旧・料金版/実入金。Web仕事の受注をSIM転換率としない |

この段階の仮説は、Facebookで地域と専門家の課題を集め、Sky/Eveで一つの反復仕事を記録・検収する組合せを、SIM/OS/hardware先行案と同じ基準で比較すること。顧客・支払者、専門家責任、獲得費用、直接費、再依頼、実入金、競合代替の証拠が揃うまで推奨戦略とは呼ばない。GitHub ref/CIは実行開始時に再取得したsnapshotであり、このdirty checkoutの同一SHA CIではない。

90日実験には独立した二つのgateを置く。**顧客課題と成果のgate**では、対象者・適格案件・完了/未完了を分母付きで記録し、現行代替、実際の承認者、検収された成果、再依頼と真正な支払を確認する。現段階では人手の専門家判断、決定的Tool、許可済み環境を使って仕事の価値を検証できる。**有料Cloud Agentの商用gate**では、同じ仕事への事前単価と見積、本人の上限承認、実行中の予約/費用、確定したitemized usage、実請求、直接費、障害/返金まで同じ経路で照合する。`remoteAiPricingGateAccepted()`が`false`の現在、この後者は未受入であり、Cloud利用を必要条件とする案はgateが開くまで有料pilotへ進めない。前者の良い結果だけでCloudの粗利や継続を推定しない。

支払意思も契約別に測る。CBOが助成/事務予算から一回の案件管理や技術支援を外注する意思、店主/ownerが一件の資料整理へ支払う意思、専門家事務所が反復softwareへ払う意思は、同じ`WTP`に合算しない。[共通月16 USDの設計契約](../sky-billing.md#rockstar-monthly-billing-contract)は本人の同意・真正なサービス開通証拠などを起算条件とし、現在の[server/Android setup状態](../../data/service-setup-integration.json)は無効・実eSIM/Provider/本番未接続である。一回のWeb先行受注だけでこの月額契約の継続や物理SIM導線の転換を証明せず、反対にWebの実仕事を回線契約待ちだけで顧客課題不存在とも判断しない。案件費を試すならRockの情報整理役務とNY資格者の専門役務・対価を区分した別の契約/決済gateが先に必要である。

Facebookは本人方針に沿う対話・課題発見の主要インフラとする。[Meta公式のグループ区分](https://www.facebook.com/help/1414053028933409/)はmember、visitor、participantを区別し、[eventの公開範囲](https://www.facebook.com/help/208747122499067/)もpublic/privateで異なる。閲覧・参加・反応を契約同意や支払意思に換算しない。物件や成果の権利、本人同意、案件承認、費用上限、成果の正本はSky/Eve側の本人別仕事記録で扱い、Facebook上の会話から移す際には本人の明示同意と出所を記録する。この連携は設計仮説であり、実利用・API連携の受入ではない。

New Lotsの[地域団体Program Manager職務票](https://www.nyc.gov/assets/sbs/downloads/pdf/neighborhoods/Program%20Manager%20New%20Lots.pdf)は商店主や住民との会合、現地event、複数市機関との調整を担当範囲に含む。[Cypress Hills LDCの現行案内](https://www.cypresshills.org/business-partnerships)は事業支援を英語/スペイン語でも提供すると記す。Facebookを主要な対話入口としても、現地の権利者/店主がそこへ参加する率と使う言語は不明。候補地区の課題をFacebookだけから集めて代表性を推定せず、団体がすでに使う現地経路と重複/取りこぼし、通訳/編集に要する時間を分母付きで比較する。団体の会合への参加や協力は未実施。

Sky自身の新しい[`socialAttachment`](../../lib/sky-social.ts)は`work`等の共有URLについてHTTPS等の形式を検査するが、物件情報・写真・関係者の公開許可を検証するものではない。[local合成/loopback受入](../evidence/eve-memory-sky-community.json)もNYCの実案件共有やMeta連携を証明しない。案件から公開対話へ移す資料は、公開範囲と所有者/借主/専門家の個別同意を別に記録してから最小化する。

`data/project-status.json#phaseGates`では旧候補の`B02-NATIVE`/`B03-FIXTURE`がdoneでも、真正な入金を扱う`B03-PROVIDER`とPC比較の`B05-COMPARE`はplanned。旧QEMU/単一owner fixtureの達成を現商品、外部顧客、Pixel full OS、本番金融の受入へ転用しない。

対象の`app/`・`components/`・`lib/`に対する建築/インテリア/音環境の語句監査では、今回読んだ共通workflow/請求/ココナラのsourceから、専用の空間案件Toolや専門家の現地判断を自動で完走する受入は確認できなかった。初回pilotは既存の仕事ID・承認・保存・費用の契約を使い、専門家の判断と現地/権利確認を人が担う前提で設計する。必要な専用入力/成果schemaは実案件の不足証拠から後で決める。「共通基盤がある」と「空間業務が完成した」を区別する。

実際の[`workflowTemplates`](../../lib/workflow.ts)は記事・ココナラ・Cloud Agentの仕事を定義する。米国の空間案件用templateはこのsourceで未定義。[ココナラ案件schema](../../lib/coconala-team.ts)は`grossYen`等の円固定で、入出金も本人の手入力記録である。米国pilotでは共通job/owner/revisionの考え方を再利用しても、USDの見積/支払・専門家契約・現地資格/責任・Provider確認済み入金を別の受入として設計する。既存の円建て見込差額や手入力receiptを米国の貢献利益へ換算しない。

共通`WorkJob`はタイトル/step/eventと限定的な`composition`成果を保存するが、店舗の住所、現況写真、図面/見積の版、tenant/property owner署名、専門家license、施工/維持の原本を型付きで持たない。Skyに別の成果/保存系統があっても、このjob契約との同一artifact照合は未確認。最初の資料収集を始める前に、既存の本人別保存を再利用できる項目と、専用契約・retention/アクセス制御が必要な項目を実案件で切り分ける。

[`createWorkJob()`](../../lib/workflow.ts)は任意のtemplate名を受け取らず、既定templateか`composition`だけを公開create経路へ通す。[`/api/work-jobs`](../../app/api/work-jobs/route.ts)はowner認証・Eve scopeとrevision付き保存を使うが、現状の[`compositionCapabilities`](../../lib/work-composition.ts)はtext/CSVの限定Toolだけが実行可能。`composition`の`currency='USD'`と`budgetMinor`は計画入力であり、空間案件の契約・支払・専門家承認・US税/Provider請求を実装した意味ではない。初回の実案件をこのまま「空間workflow完成」と表示せず、顧客の一件から不足schema/状態を決めて既存のowner/job保存契約へ追加する。

[`workStore`](../../lib/work-store.ts)の読取り・一覧・更新は`user_id`で分離し、更新時は旧revisionを照合する。一覧には100件上限がある。ただしこのstoreと`/api/work-jobs`には削除/保存期限の経路がなく、地区pilotで物件写真・借主情報・見積/権利資料を収集する場合の保存期間、export、撤回後の削除をここから受入済みとは言えない。pilotの募集前に最小取得項目と保存/削除/閲覧権限を別に決め、実案件で検証する。

別の[`sky-owner-export`](../../lib/sky-owner-export.ts)は選択した仕事と保存済み文章を上限2 MiBの人間可読bundleにできるが、自身の説明でも元の添付とaccount全体は含まず、`composition` graph/成果にも欠落警告を付ける。したがって「Skyにexportがある」ことと、NYC物件の写真・図面・署名・見積を撤回/引継ぎ時に完全に持ち出せることは別受入にする。

このjob保存経路は`user_id`一人の読取/更新契約であり、tenant、property owner、CBO、専門家が同じ案件へそれぞれ署名/承認する仕組みは確認できない。[`sky.app-result/1`](../../lib/sky-app-contract.ts)の`notes.owners`も会議メモ内の文字列で、権限や署名ではない。多者の合意が必要な案件では、誰のどの版への同意かを本人ごとに記録する別gateを用意するまでは、Rockが代理承認しない。

共通[`applyWorkCommand()`](../../lib/workflow.ts)はstepの順番、Tool名、revision、重複記録を検査するが、一般の`record`で`sample=false`かつ`outcome=passed`を受けるとstepを通過させる。これは保存された実行記録であり、NYCの顧客検収、専門家署名、現地施工、第三者入金を独立に証明する仕組みではない。仕事`completed`も同じ区別で扱い、pilotの本当の成果には顧客/Provider/専門家の別証拠を要する。

最初のsource境界の集中確認は`node --experimental-strip-types --test tests/workflow.test.mjs tests/earning-bridge.test.mjs tests/coconala-team.test.mjs`で14/14合格（Git外log `/private/tmp/avokado-strategy-phase0-focused-20261020.log`）。本人分離、revision競合、署名/未完了receipt拒否、仕事の順序をhost/fixtureで再確認した結果で、外部顧客、Provider入金、米国地域での実案件、公開環境の受入ではない。

料金・採算の監査では、[月16 USD契約](../sky-billing.md#rockstar-monthly-billing-contract)は枠/超過単価/販売地域/税/実請求が未受入、[`lib/earning-receipt.ts`](../../lib/earning-receipt.ts)の888 centsは対象となる検証済み収益からの旧上限式、[`lib/sky-marketplace-policy.ts`](../../lib/sky-marketplace-policy.ts)の10%はSky Marketの表示・見積policyである。これらを同じ顧客の確定売上へ足し合わせない。[`lib/coconala-team.ts`](../../lib/coconala-team.ts)の`estimatedOperatorMargin`は見込受注額から推定platform手数料と担当者報酬を引いた値で、実入金、返金、AI/決済/支援費を含む確認済み貢献利益ではない。最初の有料仕事では`Provider照合済み入金 − 返金 − 専門家報酬 − 決済/販売手数料 − AI/Cloud/通信の直接費 − 案件支援時間×記録済み時間単価`を別計算し、欠測項目は0で埋めず「不明」とする。

上の式は**Rockが当該役務を適法に販売・収納し、専門家への報酬も自社の直接費となる契約**の場合の仮置きである。NY資格者が顧客と直接契約・直接受領する場合は、その専門家報酬をRockの売上にも原価にも入れず、Rock自身の調整/Software役務の照合済み入金と直接費だけを計算する。契約主体、請求者、受取先が確定しない限り、工事総額や助成総額をRockの売上・粗利分母にしない。

`EarningReceipt`の`grossAmountMinor`と`operatingCostMinor`はUSD整数額として検査されるが、費目別の専門家報酬、現地訪問、支援時間、返金を記録するschemaではない。署名付きreceiptを受け取れたとしても、その二数値だけからNYC案件の貢献額・継続採算を算出しない。時間と外部費用は同じjob IDに別途根拠付きで紐づけ、決済明細と照合する必要がある。

[Sky Marketの現行買い切り実装](../sky-billing.md#sky-market決済2026-09-27実装)は審査済みPackageの円建て販売であり、Stripe sandbox・実課金・他通貨は未受入。NYCのUSD案件費や専門家報酬をこの10%表示policyへ流用しない。Stripe `mode=setup`の支払方法準備も引落や売上を意味しない。

[`sky-linux-billing`](../../lib/sky-linux-billing.ts)のUSD Invoice照合は`sky_linux_workspace`、請求ID、contract digest、customer/amount/modeへ束縛され、Linux workspaceの契約に属する。これを空間案件の請求adapterと同一視しない。NYCの案件費を実際に受けるなら販売主体・契約、役務範囲、通貨/税、専門家とRockの受取先、返金/紛争とProvider sandboxを対象jobへ結ぶ別受入が必要である。

月16 USDを12か月支払った場合の**基本料部分は192 USD／契約・年**という算術例にすぎず、実契約・回収・継続・粗利ではない。超過使用料や外部実費を含む請求総額の上限でもない。高接触の地域案件をこの基本料だけで賄える前提にせず、案件費・専門家報酬・サービス基本料・AI/通信/外部実費を別契約/価格仮説として比較する。

New York Cityは初回の対面開催地であり、borough/地区と有料案件の所在地は未指定である。次の一次資料は**NYC現地pilotの調査入口**であり、地域非限定の美術/建築仕事全体の母数やavokadoの顧客数・需要・成果ではない。2026-10-20確認。NYC案件の人口/住宅/空室の母数と誤差は[Census ACS API](https://www.census.gov/programs-surveys/acs/data/data-via-api.html)、業種別事業所は[Census County Business Patterns](https://www.census.gov/programs-surveys/cbp/data.html)を候補にし、事業所数を有料顧客数へ置き換えない。施策の投入・活動・短期結果・地域の長期変化を分ける評価には[OECDの地域政策評価](https://www.oecd.org/en/publications/place-based-policies-for-the-future_e5ff6716-en/full-report/measuring-progress-better-cutting-edge-approaches-to-monitoring-and-evaluating-place-based-policies_a6030baf.html)を参照し、Facebookの会員/投稿数だけを地域改善と呼ばない。既存の設計・見積・請求・AI機能を提供する[Houzz Proの公式料金/機能](https://pro.houzz.com/pro-learn/blog/houzz-pro-pricing)、[Houzzの専門家検索](https://www.houzz.com/professionals/probr0-bo~)、[Thumbtackのインテリア専門家検索](https://www.thumbtack.com/k/interior-designers/near-me)、[AngiのAI案内によるhome services採用構想](https://ir.angi.com/node/13051/pdf)、[Nextdoorの地域事業者向け導線](https://business.nextdoor.com/en-us/)を競合代替の候補とする。「AI付き設計管理」や「AIで専門家を探す」だけを独自性としない。機能/価格と対象地域での実際の利用は比較時に再取得する。

次区間で比較する支払者候補はすべて仮説。抽象的な「欲しいか」より、直近3か月で判断が止まった実案件の時系列、承認者、作り直した資料、実支出、検収条件を非誘導質問で聞く。以下の「代替」は公式資料から見える候補で、当該顧客が実際に使ったと確認したものではない。面談・注文は未実施であり、回答・成約率を作らない。例えば[Houzz Proの公式料金](https://pro.houzz.com/pro-learn/blog/houzz-pro-pricing)はDesign/Proに30日trialと見積・支払・共有機能を掲げるが、候補事務所がHouzzを使っているか、そこから乗り換える費用/理由があるかは未確認。

| 支払者候補／使う人 | 仕事・候補代替・初回成果 | 購買権限と再依頼の未確認点 | 採算・責任の未確認点 |
| --- | --- | --- | --- |
| 店舗を運営する小規模事業者／店主 | 一店舗の現状、改善範囲、専門家見積、選択/承認の記録。代替候補は自身の写真/表計算、施工者・デザイナーへの個別相談、市の店舗改善ガイド | 賃借人に改修決裁/発注権があるか、物件ownerの同意が要るか、改善後に別仕事を自発的に依頼するか | 案件費から現地調査・専門家・support/決済費を引けるか。NY免許者が担う範囲を確認 |
| 物件owner／オーナーまたは管理者 | テナントと同じ物件の権利、改修条件、見積、施工前後の確認。代替候補は管理会社、建築家/施工者への直接発注 | 本人所有/管理権限、賃借人との費用分担、空室・契約更新時の反復頻度 | 権利確認と現地/施工責任、owner側の時間、専門家報酬、建築/保険/許認可の費用 |
| 建築・内装・音環境の専門家／事務所 | 複数顧客の聞取、revision、見積、承認/引渡し。代替候補は既存の設計・案件管理ソフトや手作業 | 顧客が採用を許すか、導入/入力二重化を超える利点があるか、反復利用する事務所の決裁者は誰か | Houzz Pro等の既存機能との差、データ移行・support費、NY資格/署名責任と契約主体 |
| 地区団体・BID・CBO／program担当者 | 店舗横断の応募、権利者同意、選定、資金、専門家見積、成果/維持を追う。代替候補はSBSのProgram Guideと既存のprogram manager | 団体予算・助成の対象と時期、調達権限、複数店舗で同じ仕事が生じるか。BID assessment予算は私有物件の資本工事に使えず、事務/技術支援費は候補。Avenue NYCの現応募は締切 | 団体支援時間、公平な選定/データ保護、外部専門家、運用/報告費。助成額をavokado売上としない |
| NYCの行政部門／市側担当者 | 地区の募集/調達、政策成果と監査。代替候補は既存の市の公募・報告手順 | 調達部署/年度/仕様が一致するか。市の社会的便益とRockへの支払は別 | 調達期間、アクセシビリティ/保存/監査、契約/法務・長期support費 |
| 住民・Facebook参加者／地域側 | 課題提示、専門家回答の有用性評価、再訪。代替候補は既存の地域会話や相談 | 直接購入する理由があるか、誰が参加と便益の費用を負担するか | Moderation、同意、翻訳/編集とprivacyの費用。投稿数を売上/地域改善にしない |

上の表は選定結果ではない。NYCの案件数を米国全体・NY州全体・別国の空き家件数から外挿しない。NYCのACS地理単位と推定誤差を確認し、雇用あり事業所の[CBP定義](https://www.census.gov/programs-surveys/cbp/about/glossary.html)と必要なら[2024 Nonemployer Statistics](https://www.census.gov/data/developers/data-sets/nonemp-api/2024.html)を分ける。どちらも購入意思の母数ではない。

NYCの住宅案と商業街路案も同一視しない。[NYC HPDの2023 Housing and Vacancy Survey初期結果](https://www.nyc.gov/assets/hpd/downloads/pdfs/about/2023-nychvs-selected-initial-findings.pdf) p.27は、定義された賃貸住宅ストック約2,357,000戸に対する募集可能な空室33,210戸、net rental vacancy 1.41%を報告する。これは「住宅の空き家が大量にあり、そのまま案件化できる」という根拠にはならない。商業街路案は[NYC SBS Neighborhood 360](https://www.nyc.gov/site/sbs/neighborhoods/neighborhood-360.page)の[Commercial District Needs Assessments](https://www.nyc.gov/site/sbs/neighborhoods/commercial-district-needs-assessments.page)で地区別の商店・買い手・街路課題の原資料を確認し、具体の一地区と関係者を絞る調査入口がある。[NYC City Planningの2024 storefront activity report](https://www.nyc.gov/assets/planning/download/pdf/planning-level/housing-economy/nyc_dcp_storefront_report_1024.pdf)は存在を確認したが本文の読戻しが未了で、数値を引用しない。これらは需要・成約・改修可能性の証拠ではない。

[NYC Comptrollerの2026年6月4日報告](https://comptroller.nyc.gov/reports/whos-minding-the-storefronts/)は、Live XYZの目視調査（2026年4月15日時点）をもとに、NYC約142,000 storefrontのうち約15,700が空室、空室率11.0%と報告する。街路から入れる一店舗を一件として数え、入居事業者がいない状態を空室とし、一時休業・開店準備中は入居ありに含める。床面積で重み付けしていない。「small business」は売上/従業員数の資料がないため市内5店舗未満の固有名などによる近似分類で、誤分類も認めている。住宅賃貸の1.41%とは母集団と定義が違う。集計単位はNeighborhood Tabulation Areaで、SBSのCommercial District Needs Assessmentが扱う商業corridorともそのまま一致しない。空室の所有者に連絡できる数、改修可能な数、avokadoの顧客数や支払意思へは換算しない。

空室には入居中の店主がいないため、空室率を根拠に**店主を最初の支払者**とするのは論理がつながらない。空室の仕事なら物件owner/管理者の権限・賃貸条件・投資意思を確認し、営業中店舗の改善なら店主と物件owner双方の同意・費用分担を確認する。どちらの課題がNYCの一地区でより切迫し、90日で実仕事に届くかは、地域側の接点と直近案件の証拠で選ぶ。

[NYC SBSのStorefront Improvement Program Guide](https://www.nyc.gov/assets/sbs/downloads/pdf/neighborhoods/storefront-improvement-program-guide.pdf)は既に地域団体向けに、資金・管理・専門家支援、申請者の工事範囲と複数見積、賃貸契約、tenant/property owner署名、選定、施工、事後評価までの手順を示す。これは初回仕事を「一店舗の課題→権利者同意→scope/見積→専門家と地域側の判断→成果/支出/維持」に絞る候補根拠であり、同時に強い既存代替である。avokadoがこの既存手順をどれだけ改善できるか、誰がその改善に払うかは未実証。地区の空室率だけで候補を選ばず、地元団体/事業者との接点、決裁者、資金と一件の実仕事があるかを先に確認する。

同ガイドの資金・運営章（PDF pp.17–18, 22–30）では、専門家・工事補助・program人件費を別予算に置き、BIDのassessment予算は私有物件の資本工事に使えない一方、program事務/技術支援費には使えると説明する。申請にはscope、複数見積、賃貸情報、tenant/property owner双方の署名、施工前後の確認、支払証明等が伴う。従ってBID/CBOが支払者なら候補はまず**既存programの案件管理/技術支援**であり、工事費をRockの売上へ計上しない。同ガイドのsample project金額・match比率は説明例で、2026年の実見積/現行grant額やavokado価格ではない。BID/CBOの現予算と外注権限、実際の購入意思は個別に確認する。

同ガイドのsample timeline（PDF pp.31–32）はprogram設計/募集を最初の3か月、選定を4か月目、工事を8〜11か月目、closeoutを12か月目に置く**例**であり、現案件の工期予測ではない。90日実験では施工後の売上増や街区改善を約束せず、現地の課題・権利者・既存手順・決裁者、scope/見積比較、本人同意済み案件化と実際の支払/予算枠を観測する。工事・長期地域outcomeは別の長期縦断受入へ置く。CBOの一回の委託費/技術支援への支払意思、個人/事務所のRockstarOS基本料への継続支払意思、SIM/eSIM導入率、有料Cloud usage採算もそれぞれ別実験とする。

ガイド冒頭にある店舗改善後の売上増加の紹介（PDF p.8）は外部研究と個別事例に基づき、今回のNYC地区での比較試験やAvokadoの効果ではない。90日内の売上・来訪・雇用、空室減少をその数値から代入せず、必要なら同意を得た対象店舗の基準値と追跡期間を事前に定める。

地域便益を測る際は、[OECDの地域政策評価](https://www.oecd.org/en/publications/place-based-policies-for-the-future_e5ff6716-en/full-report/measuring-progress-better-cutting-edge-approaches-to-monitoring-and-evaluating-place-based-policies_a6030baf.html)に沿い、募集/会話/資料作成という活動、案件のscope/決定という短期結果、店舗の継続・街区環境という長期結果を分ける。改善後の家賃・借主の維持や、小規模事業者への負担も意図しない影響の**候補**として把握する。SBSの申請例が賃料/leaseを確認することは、この配慮の入口にはなるが、本人の同意なく詳細な賃貸条件をFacebookへ公開する理由にはしない。

ガイド末尾はSBS自身がCBOへ店舗改善の技術支援を提供すると記す（PDF p.34）。CBO向けの有料案件管理を提案する場合も、無料の行政支援や既存staff/表計算/業務ソフトで解けない手間と、その短縮価値を実測する。SBS guideに載る長期指標（店舗売上、雇用、改善面積等）はCBOの評価候補であり、Facebook投稿や90日の未施工pilotから生じた効果と推定しない。

[NYC SBSのStorefront Improvement案内](https://www.nyc.gov/site/sbs/neighborhoods/storefront-improvement.page)は、CBOが地区単位の改善programを運営し、店主/物件ownerが個別の改善対象となる区分を示す。掲載されたDowntown Jamaica/Transform Tremontの過去募集はどちらも受付終了。[Avenue NYC助成案内](https://www.nyc.gov/site/sbs/neighborhoods/avenue-nyc.page)も現在の申請は締切と表示する。掲載の助成上限や過去採択団体は、将来のavokado向け財源/顧客獲得の証拠ではない。CBO向けの複数店舗program管理と、一店の店主/owner向けの判断支援は利用者・購買権限・費用・反復頻度が異なるため別の支払者仮説にする。

市とCBOの購買経路も別に調べる。[NYC SBSの市契約案内](https://www.nyc.gov/site/sbs/businesses/contracting-opportunities.page)は、市へ直接販売する事業者にPASSPort/PIP登録を求める。[SBS Fiscal Manual（2024年9月版）](https://www.nyc.gov/assets/sbs/downloads/pdf/about/fiscal-manual.pdf) pp.20–21は、**SBSとの契約を持つProvider**が対象scopeに関わる役務を再委託する場合に事前のsubcontractor承認・契約書を求め、職員で担える仕事へのconsultant費用に条件を置く。同manualの請求章は支出証憑を伴う月次報告と審査後の償還を規定する。これを全CBO・全資金源へ一律に適用しないが、CBOの「予算がある」を即時にRockへ発注・入金できる状態とみなさない。初回の有料候補では契約/助成の種類、当該費目、購買・再委託の承認者、請求から入金までの立替期間を確認する。

SBSのCDNA一覧は地区候補の入口。[East New YorkのCDNAスペイン語版](https://www.nyc.gov/assets/sbs/downloads/pdf/neighborhoods/n360-cdna-eny-SP.pdf) pp.2, 4–7を2026-10-20に読んだ。同調査は**2015年12月〜2016年5月**にCypress Hills LDC、Highland Park CDC、LDC of East New Yorkと行い、239件以上の調査・関係者会合を基にFulton Street、Atlantic Avenue、Liberty Avenue、Pitkin Avenueを扱う。空き店舗、店舗正面、清掃、安全、食料アクセスなどは**当時**の課題候補であり、報告のLiberty Avenue空室18.9%、商店主の賃借70%などを2026年の現況・顧客母数・改修需要へ転用しない。現地のCBO/関係者へのアクセス、同じ商業corridorの更新資料、実際の決裁・資金の有無を確認するまで地区は選定しない。Ocean Hill–Weeksville等の他の個別CDNA本文は未読であり、ComptrollerのNTA空室率との単純比較もしない。

同じ「East New York」を名に含む[East New York–New LotsのAvenue NYC CDNA](https://www.nyc.gov/assets/sbs/downloads/pdf/neighborhoods/avenyc-cdna-newlots.pdf)もSBS一覧にある。検索索引で抽出できたp.6は店舗inventoryを2024年10〜12月に収集したと記し、p.8はCypress Hills LDCが2024年秋〜2025年冬に商店主122件・消費者162件へ調査したと記す。p.8の「来訪者を増やすための変更」にはstorefront improvementsも含まれる。ただし2026-10-20の**PDF全体の取得は容量制限で失敗**し、抽出ページ以外の方法・回答者の代表性・最新状態は未確認。調査で挙がった希望を、改修の発注権、支払意思、Rockの需要へ転用しない。古いEast New Yorkの四corridorやComptrollerのNTAとNew Lots/Livonia/Sutter/Van Sinderenを合算せず、空室率の前後比較にも使わない。後続調査ではPDF全体の原文と地理、商店主/物件ownerの決裁/費用項目を先に確かめる。

[NYC SBSの2024年採択発表](https://www.nyc.gov/site/sbs/about/pr20240806-nddgrants.page)は、New LotsのCypress Hills Local Development CorporationをAvenue NYC Commercial Revitalization Grantの六採択団体の一つとして列挙する。これは当該地区に既存の地域実行主体がいたという履歴事実であり、2026年現在の担当者・未消化予算・Avokadoへの発注可能額や面談接点ではない。後続の地区比較では、現在も運営する主体と現行案件/予算の確認を優先する。

[同団体の公開Business Partnerships](https://www.cypresshills.org/business-partnerships)は2026-10-20の読取りで、East New York Merchants AssociationがNew Lots/Livonia/Sutter/Van Sinderenの事業者を支援し、Cypress Hills Fulton BIDは**別のFulton Street corridor**を扱うと説明する。団体は1対1事業相談、branding/marketing/AIの講座や地域事業者の組織化も提供している。事業相談の個別料金はこのページでは確認できない。[SBS掲載のNew Lots Program Manager職務票](https://www.nyc.gov/assets/sbs/downloads/pdf/neighborhoods/Program%20Manager%20New%20Lots.pdf)は、商業地区調査、複数関係者の調整、program実施/評価、指標記録を**その職の担当範囲**とする。よって「地区課題の整理」や「AI/marketing相談」自体には既存の強い代替があり、Rockが追加料金を得る差分は未証明。職務票の掲載を現在の在職/欠員、委託予算、会話/契約成立と扱わない。

この地区は、既存団体がいるため関係者の問題を聞く**候補**になる一方、団体がすでに役務を提供しているため有料Software/外注先としては厳しい対照にもなる。CBO仮説が前へ進むには、団体staffの反復業務で現行手順が実際に詰まった一件、外注可能な予算費目と決裁者、Rock側の費用を含む短縮効果が必要。商店会の会員やgrant受給歴だけで発注を予測しない。

店主向けには行政の無料代替も強い。[NYC SBS](https://www.nyc.gov/site/sbs/index.page)は開業・運営・成長の無料Business Solutionsを案内し、[市の開業案内](https://nyc-business.nyc.gov/nycbusiness/business-services/initiatives/opening-a-business-in-nyc)は無料の個別法律支援、商業賃貸相談、資金/許認可相談、BEST、無料consultationを列挙する。[NYC311](https://portal.311.nyc.gov/article/?kanumber=KA-02898)のBusiness SolutionsにはMarketing and Technologyの講座もある。一般的な許認可案内や事業相談だけを有料商品にする仮説は、利用者が無料サービスでも解けなかった具体の一件と、支払者が買う追加成果を示せるまで弱い。無料支援の存在自体はavokadoへの購入意思や購入拒否を測った結果ではない。

[NYCの2026年7月OPEN発表](https://www.nyc.gov/mayors-office/news/2026/07/mayor-mamdani-announces--open-for-small-business---over-50-refor)は、500超の事業者への市のroundtable/調査で開業遅延、遵守要件の不確実さ、執行の不統一が多く挙がったと説明し、新規事業者向けBEST担当者による許認可・検査の伴走拡張を掲げる。これは市全体の政策/行政代替の事実であり、New Lotsでの当該支援の到達率やAvokadoへの支払意思ではない。許認可ナビを商品候補にするなら、今後の実施状況と無料支援で残る具体の未解決仕事を確認する。

専門家事務所向けにも競合が強い。[Houzz Pro公式の2026年プラン説明](https://pro.houzz.com/pro-learn/blog/houzz-pro-pricing)はDesign 99 USD/月、Pro 199 USD/月、Teams 399 USD/月からとし、見積・提案・請求、3D、bids、change orders、budget、AI、Teamsではrole別権限・subcontractor dashboard・client dashboardを掲げる（2026-10-20読取）。したがって「AI付きデザイン管理」や「複数関係者の進捗共有」だけの差別化仮説は厳しい。NYC地区のCBO/店主/物件owner/専門家にまたがる権利・支出上限・検収/復旧の一件で、この代替と比べた具体的な時間/品質/費用差と移行負担を測るまでは、独自性も価格優位も主張しない。競合の公表価格をavokadoの受注額や顧客予算へ転用しない。

専門家責任も仕事のscopeで分ける。[NYSEDの建築業務ガイド](https://www.op.nysed.gov/professions/architecture/professional-practice/practice)はNY所在案件の建築サービスをNYで免許・登録済み、または限定許可を得た人が担うとする。[NYSEDの建築と内装ガイド](https://www.op.nysed.gov/professions/architecture/professional-practice/architects-and-interior-design)と[Education Law Article 161](https://www.op.nysed.gov/professions/interior-design/laws-rules-regulations/article-161)は「Certified Interior Designer」の称号と建築・工学業務を区別し、内装会社が無資格の建築/工学サービスを自社提供する形にも注意を促す。初回pilotでRockが候補とするのは顧客の要件・資料・見積・承認履歴の整理であり、建築案の作成、予備図面、署名、工事/許認可判断、現地安全、設計/施工は案件所在地の該当資格を確認した専門家の責任とする。契約構造と具体scopeは個別に確認し、資料読取りだけで法的結論や提供許可を確定しない。

同NYSED建築ガイドは、建築サービスを許可されない一般会社経由で顧客へ再販売/仲介する契約にも強い制限を説明する。[内装との契約ガイド](https://www.op.nysed.gov/professions/architecture/professional-practice/architects-and-interior-design)は、建築/工学が必要な場合に顧客が資格者を直接依頼する方法と、役務/報酬/署名者を分ける三者契約の検討例を示す。従って「Rockが設計一式を受注し資格者へ下請けに出す」を初期売上モデルとして置かない。Rockの情報整理/調整役務と、資格者が顧客へ提供する専門役務・対価を分け、実契約前にNYの該当scope/法人形態について専門確認を得る。これは一般資料からのリスク整理であり個別案件の法的判定ではない。

現地workの分類も物件ごとに違う。[NYC Department of BuildingsのStorefront Renovations区分](https://www.nyc.gov/site/buildings/dob/project-categories-storefronts.page)は、既存建物の店舗外装改修と、用途/避難経路等を変えて新たなCertificate of Occupancyが必要となるAlterationを分ける。[NYC Landmarks Preservation Commission](https://www.nyc.gov/site/lpc/applications/storefronts.page)は指定建物の店舗外装変更について同委員会の許可を要すると説明する。初回の概念/見積整理で「施工可」と判定せず、住所が確定した後に所有/賃借権、DOB/LPC該当、専門家の署名/申請者を確認する。すべての候補店舗がlandmarkという意味ではない。

### 企業価値10時間調査：Phase 1の顧客課題・支払者・仕事比較（45分以降、調査中）

下表の「困り事」はNYCの制度・地域・競合資料と本人提示の添付提案から作る**面談仮説**であり、特定顧客が経験したと確認した事実ではない。最初の有料支払者と案件所在地を選ぶ前に、本人が最近行った実仕事・代替・購入権限・直接費を同じ単位で観測する。NYCは初回対面開催地で、美術/建築仕事の地理を限定しない。Facebookの地域対話は本人の主要発見経路という方針を維持するが、当該支払者に届いた実績はない。

| 課題と初回の仕事仮説 | 実際に使う人／支払者候補 | 現行代替と検証する差 | 反復・購買の最小証拠 |
| --- | --- | --- | --- |
| 営業中の一店舗で看板/正面改修のscope・複数見積・借主/所有者の承認が止まる。成果候補は資格者判断前の版付き判断資料 | 店主が使い店主または物件ownerが払う。費用分担と発注権は未確認 | [SBSの既存guide](https://www.nyc.gov/assets/sbs/downloads/pdf/neighborhoods/storefront-improvement-program-guide.pdf)、無料の[SBS相談](https://nyc-business.nyc.gov/nycbusiness/business-services/initiatives/opening-a-business-in-nyc)、施工者/設計者への直接相談。提出往復・決定時間を同じ一件で比較 | 直近のscope/見積修正と実支出、借主・ownerの署名、実発注/入金、次の自発的依頼。単店舗の改修頻度は不明 |
| 空室の一店舗で次の利用条件・改修投資の判断が止まる。成果候補は所有者の条件と専門家の選択肢の整理 | 物件owner/管理者が使い、投資決裁者が払う候補。空室には現役の店主がいない | 管理会社、broker、建築家/施工者。市の[空室観測](https://comptroller.nyc.gov/reports/whos-minding-the-storefronts/)は所有者に届く数ではない | 所有/管理権、具体の募集・投資予定、最近の外注額、所有物件数と次案件までの期間 |
| 複数店舗の募集→権利者同意→採択→見積/進捗→報告が煩雑。成果候補はCBO担当者の案件横断台帳 | CBO/BIDのProgram Managerが使い、団体の承認済み事務/技術支援費から払う候補。BIDならBoard等の予算決裁を別に確認 | SBS guide、団体staff/表計算、[Cypress Hills LDCの既存支援](https://www.cypresshills.org/business-partnerships)。対象契約では[SBSの再委託条件](https://www.nyc.gov/assets/sbs/downloads/pdf/about/fiscal-manual.pdf)も確認 | 担当者の直近案件で繰返した作業・時間、現行方法の限界、使える費目/決裁者、外注承認、支払時期。助成額だけでは不十分 |
| 一つの施設/場所で修繕依頼、見積、権限者承認、完了確認、請求照合、次の維持判断が繰り返される。成果候補は持出せる版付き履歴 | 運営担当者が使い、施設owner・運営会社・団体のどの予算が払うか未確認。所在地も未定 | [AppFolio](https://www.appfolio.com/property-manager/maintenance)、[Buildium](https://www.buildium.com/features/property-management-maintenance-software/)、[UpKeep](https://upkeep.com/product/procurement/)は既に依頼、承認、見積、請求、履歴の多くを扱う。業者直連絡、会計/表計算も代替。添付文は需要証拠ではない | 同じ運営者の直近の独立した複数案件、現行時間/費用、承認・発注権、請求差異、再発頻度、真正な支払と支援費。現地作業/専門家判断は別責任 |
| 専門家事務所で複数案件のrevision/承認/引渡しが重複。成果候補は同一仕事の記録・復旧 | 建築/内装等の実務者が使い事務所のsoftware購買者が払う候補 | [Houzz Pro](https://pro.houzz.com/pro-learn/blog/houzz-pro-pricing)等の見積・請求・AI・role別共有/移行支援。CBO/権利者との往復でなお残る作業を比較 | 実案件の二重入力時間、現在のsoftware支出、切替費、月次の自発継続、NY資格者のscope。月16 USDのサービス基本料への同意は別測定 |
| 美術と建築を合わせた一件の空間作品で、場所の権利者と創作者のscope・承認・維持費が未整理。成果候補は制作・引渡し前の判断記録 | 私有地なら設置権限者/commissioning主体、公有地なら所管機関/選考主体と契約当事者を分ける。所在地は未定 | NYCの公有地では[DCLA Percent for Art](https://www.nyc.gov/site/dclapercentforart/registry/registry-faq.page)が市のcapital projectから作家を選び、[Design Commissionの案内](https://www.nyc.gov/site/designcommission/design-review/submissions/artwork-installation.page)も審査・市承認を求める。これはRockへの委託経路/予算ではない | 実在するcommission、権利者の利用許可、選考/発注主体、制作と長期維持の予算、資格者のscope、創作者への報酬とRockの独立した役務料。作品一件を月次継続へ換算しない |
| 地域の課題を行政施策へつなぐ。成果候補は案件の状態と地域側評価の整理 | 住民/CBO/市職員が使い、市が直接買う候補は別の調達手続 | 既存の行政・団体の募集/報告。[市との直接契約](https://www.nyc.gov/site/sbs/businesses/contracting-opportunities.page)はPASSPort/PIP等の経路を要する | 実際の所管部署・年度予算・仕様・調達権限と期間。地域便益やFacebook参加を市の発注意思としない |
| 空間案件に限らず小規模事業者/創作者が資料整形や成果引渡しを繰り返す。成果候補はSkyの一つの決定的Toolによる検査可能な納品 | 仕事の依頼者が使い、同じ人または発注企業が払う候補。NYCの地域改善とは別の顧客群 | 既存の手作業、表計算、外注、他のAI Tool。現行CSVや制作案件のhost/fixtureは実顧客の需要証拠ではない | 過去の実発注/外注費、同種仕事の月次頻度、納品/再依頼、支払・返金、Tool実費と支援時間。地域便益は別測定 |

住民/Facebook参加者は問いの発見と有用性評価に欠かせないが、直接の支払者とはまだ確認できない。住民の再訪・独立した課題・専門家の有用な回答・同意済み案件化を分母付きで測り、会員数や反応を注文へ換算しない。既存の[Nextdoor地域事業者導線](https://business.nextdoor.com/en-us/)も発見経路の比較対象だが、同社の自己申告リーチをAvokadoの到達率へ代入しない。

地区団体の中でもBIDとBID外のCBOを分ける。[NYC SBSのBID説明](https://www.nyc.gov/site/sbs/neighborhoods/bids.page)は、BIDのBoardに物件owner・店主・住民等を含め、program/予算/人員の重要判断を担わせ、区域内ownerへのassessmentを主な財源とする。[小規模BID支援](https://www.nyc.gov/site/sbs/neighborhoods/small-bid-support-grants.page)はNYCの78 BIDの過半がassessment年60万USD以下、一般に運営staffが2人以下と説明する（2026-10-20読取）。これは反復事務の負荷と購買予算の狭さの**両方**を示す文脈であり、78団体・assessment総額・FY27支援上限をAvokadoの購入可能顧客数/売上としない。同ページのFY27申請は締切済み。New Lotsの商店会をCypress Hills Fulton BIDと同一組織/同一予算として扱わず、候補団体ごとの法人・理事会/manager権限・資金源を確認する。

[SBS Neighborhood Challenge](https://www.nyc.gov/site/sbs/neighborhoods/neighborhood-challenge.page)はCBOとtech会社が組んで商業地区のデータ/業務課題を扱う公的経路の実例だが、掲載回の申請は終了している（2026-10-20読取）。公募の存在は「CBOがRockの有償Softwareを今買える」証拠ではなく、助成審査・契約・入金までの時間も未知である。FY27小規模BID支援と同様、90日内の売上見込みへ足さない。既存の[SBS BID資源](https://www.nyc.gov/site/sbs/neighborhoods/resources-for-bids.page)には地区ニーズ調査や計画の雛形もあり、一般的な調査票/報告生成だけを商品差分とする仮説には反例となる。

この比較を厳しくする反例を先に置く。いずれも未観測の仮説で、実案件の結果で更新する。

| 反例 | 実際に確かめること／棄却または変更の条件 |
| --- | --- |
| 市全体の空き店舗11.0%でも、候補corridorで連絡可能な所有者や改修を検討する物件がない | NTA統計から直接案件数を作らず、所有/管理者と予定案件が確認できなければ空室起点案を止める |
| 店主は市の無料支援・既存設計者で問題を解くか、助成の償還前に工事費を立て替えられず、資料整理へ追加対価を払えない | 直近の未解決一件、実支出/購入権限、当該programの立替条件が出なければ店主課金案を下げる |
| CBO担当者は既存staff・SBS guide/技術支援で十分、外注費目も承認できない | New Lotsを含む団体の実作業時間と承認済み調達費目が出なければ団体販売案を下げる |
| 専門家はHouzz Pro等から移らず、二重入力・移行費用が節約時間を上回る | 同一案件で測った追加時間と費用が改善しなければ事務所SaaS案を下げる |
| Facebook参加者は店主/所有者の代表でなく、現地会合や英語/スペイン語の声を取りこぼす | [SBS guideの対面訪問・電話・地域会合などの募集経路](https://www.nyc.gov/assets/sbs/downloads/pdf/neighborhoods/storefront-improvement-program-guide.pdf)とも到達・資格・同意の分母を比較し、決裁者へ届かなければ導線を修正する |
| 権利者の同意・NY資格者の設計/署名・DOB/LPC手続が一件のscopeと費用を変える | 適法なRock役務と専門家直接契約を分けられない案件は有料pilotへ進めない |
| 候補成果に借主/物件資料・図面・見積の秘匿情報が必須で、現在の仕事保存/無料Cloud経路では同意、閲覧者、削除、外部処理条件を満たせない | 本人別/関係者別の最小取得・保存/削除・外部送信条件を満たすまでは実資料を使わず、匿名/合成情報の机上比較にとどめる |
| 一回の受注があっても支援/通訳/専門家/決済費が収入を超え、次の仕事もない | 役務別の真正な入金・直接費・支援時間、次案件までの周期が取れなければ継続採算を受け入れない |
| 物件ownerが改修による賃料/資産価値を得ても、店主の費用・立退きリスクや地域側の評価が悪化する | ownerの支払だけを地域便益とせず、借主の更新/負担と地域側の同意・評価を別に追い、不利益が強ければ対象仕事を変更する |
| 美術と建築の創作に地域の関心があっても、公有地の選考・設置承認・長期維持予算はRockが決められず、作品制作の対価もRockの継続Software収入ではない | [DCLAの作家選考](https://www.nyc.gov/site/dclapercentforart/registry/registry-faq.page)と[市有地の審査](https://www.nyc.gov/site/designcommission/design-review/submissions/artwork-installation.page)に従う案件なら契約当事者/予算/作家を確認する。私有地でも権利者の実発注がなければ委託売上へ数えず、作品完成と再依頼を分ける |
| 施設の現場担当には反復する修繕があってもSoftwareを買う予算権限がなく、owner/運営団体/市の費目も一致しない | 利用者、見積承認者、契約署名者、請求書宛先、最終支払元を同一の実案件で確認できなければ施設運営者向け継続課金を下げる |
| 文化施設のcapital支援をSaaS購入額と誤認する | [DCLA FY27設備catalog](https://www.nyc.gov/assets/dcla/downloads/pdf/Capital-Equipment-Catalog.pdf)はsubscription softwareを対象外とする。別の承認済み運営費目が示されなければ、この資金を売上見込みに含めない |
| 既存FMIS/CMMSの承認・請求・exportで仕事が完結し、Rockの追加Toolが二重入力を増やす | [AppFolio](https://www.appfolio.com/property-manager/maintenance)、[UpKeep](https://upkeep.com/product/procurement/)、[MaintainX](https://www.getmaintainx.com/pricing)と同じ原本で再開時間/差戻し/支援時間を比較し、差がなければ施設台帳案を下げる |
| 大規模施設に反復仕事があっても、初回の小規模pilotでは統合・24時間支援・参考顧客の調達条件を満たせない | [2021年NYC H+H FMIS RFP](https://a856-cityrecord.nyc.gov/Search/GetFile?documentId=32411&requestId=20210819108&requestStatus=Archived&sectionId=6)の最低条件と現行Rockの機能・支援体制を比較し、同等条件を要する買手は短期の候補から外す。この終了済みRFPを現在の見込契約としない |
| 義務的な数年周期の建物点検は、毎月の有料継続仕事を生まない | [DOBの周期](https://www.nyc.gov/site/buildings/property-or-business-owner/property-maintenance.page)を月次仕事数へ代入せず、同一運営主体の独立した仕事の実発生日と再依頼・支払を観測する |
| 土地・建物の利用権の調整に価値があっても、実際の有料仕事が他人の物件募集/賃貸交渉/賃料徴収または契約の法的判断を不可避に含む | [NY DOSのbroker FAQ](https://dos.ny.gov/real-estate-broker-frequently-asked-questions)と[法律実務memo](https://dos.ny.gov/legal-memorandum-li04-real-estate-brokers-and-salespersons-and-unauthorized-practice-law)に照らし、仕事範囲・報酬・ownerの許可と資格者を確定できなければRock単独の有料pilotへ進めない。情報整理だけで顧客成果が出ないなら仕事仮説を下げる |

面談するなら、希望機能を先に示さず「直近3か月で判断が止まった一件を順番に教えてください」「誰が承認し、資料や見積を何回作り直しましたか」「今の代替は何で、時間と実費はどれだけでしたか」「類似の仕事に最後に誰がいくら支払い、今は誰に購入権限がありますか」「十分な成果と判断した出来事は何でしたか」と聞く。CBO/市には加えて、どの契約/予算行と調達承認に属したかを聞く。これは**質問設計のみ**で、面談や購入意思確認は未実施。

店主/ownerの資金条件は仕事の詰まり方に直結する。[SBS店舗改善guideの選考例](https://www.nyc.gov/assets/sbs/downloads/pdf/neighborhoods/storefront-improvement-program-guide.pdf) p.27は、工事費を償還前に立て替える能力とownerの署名入り支持文書を確認項目に含める。これはguide上の**sample評価票**で、NYCの全programに適用する条件ではない。一件の候補では当該資金/契約の条件を読んでから、改修の意思決定が情報不足で止まったのか、資金・権利で止まったのかを分ける。後者をSkyの資料整理で解決したと主張しない。

面談/試用の前に、同じ一件を追う観測票を作る。候補corridor、店舗/プログラムの種類、紹介経路、実際の依頼者・利用者・決裁者・受益者、直近の停滞箇所、現行代替、過去の実支出、権利者/専門家のscope、承認資料の版数、成果条件、次の同種仕事までの周期を別欄にする。紹介・Facebook参加・面談・適格案件・実発注・納品検収・入金・自主的再依頼を各段階の分母付きで記録し、断った人/止まった案件/無料代替で解決した案件も残す。地域側の便益・不利益とRockの入金/直接費は別欄にし、年単位の施工成果を初期90日の成果へ代入しない。最初の一組織だけから得た紹介が地区全体を代表するとみなさず、店主、owner、CBO/BID、専門家へ別々に確かめる。これは調査票の設計で、現時点の観測件数は0。

反復の時計も顧客ごとに違う。一店舗の改修は同じ店主の次の改修まで長く空く可能性があり、同一案件の見積revisionを「新しい有料注文」へ数えない。CBOなら別の店舗案件/募集回、専門家事務所なら別の顧客案件、Sky単独のToolなら別の定期業務が自発的な再利用の単位となる。90日内に次の仕事が生じない候補は継続率を未測定とし、短期の単発案件費への支払と月16 USDのservice access継続課金を別の購入実験にする。物理SIM/eSIM経由の加入転換と有料Cloudのusage単価/粗利は、Web先行の仕事が役立っても独立した受入gateに置く。

次の調査順は**販売先の選定ではない**。初回対面hostであるNYCの一商業corridorではCBO/BID担当者が扱った最近の案件と、当該店主・物件ownerの同じ案件の時系列を独立に照合し、「地区横断の事務負荷」と「一店舗の意思決定負荷」を比較する。同時に、所在地を限定しない一施設の運営者について直近の独立した複数修繕・予算権限・現行Toolを調べ、空間に依存しないSkyの反復仕事も同じ購買証拠で比べる。専門家事務所には実案件のTool・作り直し・切替費用を確認する。CBOが案件/予算へアクセスできなければ他の地区を検討し、店主/ownerに実発注権がなければ単店舗販売の仮説を下げる。施設運営者の現行Toolで十分なら施設管理案を下げる。全候補で既存の無料/有料代替に不足が見つからなければ、空間案件を初回有料商品とする仮説を棄却する。NYCの地区を空室率だけで固定せず、実案件・紹介可能な権利者・地域側の評価経路が揃うかを先に確かめる。

一件の仕事を比べるための仮の最小成果は、住所/写真の公開許諾とは切り離した「scopeの版、異なる見積の比較、借主/owner/専門家それぞれの未確認・承認状態、費用上限、次の判断者、引渡し時の顧客検収」を同じ案件IDで追える判断記録とする。[SBS guideの選考・見積・専門家/契約手順](https://www.nyc.gov/assets/sbs/downloads/pdf/neighborhoods/storefront-improvement-program-guide.pdf)を既存基準として、資料の作り直し回数、判断までの経過、漏れ/差戻し、手作業・支援時間を前後で比較する。ただしguideのsample票を全programへ強制せず、実際の契約/権利者/資格者の承認原本をRockの汎用`passed` eventで代用しない。この最小成果も**顧客が必要と言った結果ではない**ため、面談の前に完成商品として実装しない。

#### 添付提案から追加する検証仮説（2026-10-22）

本人が提示した「なくならない目的と交換可能な技術」の文章は、本人回答により**正味10時間調査で検証する仮説**と確定した。商品・料金・事業方針の採用や顧客需要の確認ではない。既存RQ、SIM/eSIMを主商品入口とするservice access、Sky、製品名としてのEve LLM、Facebookの対話方針、Mini/Pro、Gameを変更しない。長期目的の候補は「人が場所を安心して使い続けられること」だが、この理念への賛同と、最初の顧客が対価を払う一件の仕事は別に検証する。NYCは初回対面開催地であり、美術・建築の題材と協働先は地域非限定。NYCの店舗統計・制度を他地域の案件に転用しない。

| 添付文からの仮説 | 最初の観測単位と反証 |
| --- | --- |
| 建物の存在より、情報・利用権・関係者の合意・予算・専門家判断・運営をつなぎ「使える状態」へ進める仕事に価値がある | 同一案件の実際の停滞点を、情報不足、権利/許可、資金、専門家の判断、実務遂行に分ける。主要障害が資金・許可で、Rockの調整で動かないならこの仕事仮説を下げる |
| 完成時の一回限りの提案より、修繕依頼→条件/見積→権限者の承認→実施確認→請求照合→維持/引継ぎが反復する | 店舗改修の単発jobとは別に、施設/場所の運営者と支払者の直近複数件、発生周期、現行の管理software/業者、手戻りを確認する。次の独立した仕事や対価がなければ継続価値は未証明 |
| 「誰が何を根拠に決め、実行後どうなったか」の版付き履歴と持出しが再説明・確認漏れを減らす | 既存手段と同じ案件で、担当交代後の再開時間、誤認/差戻し、必要な原本の持出し成功を測る。記録を増やすだけで手間が減らない、または閲覧・撤回・削除を満たせないなら採用しない |
| AI、決済方式、DeFi/ReFiは目的を果たすための選択可能な手段 | AI案を権利・安全・契約の承認に昇格させず、既存の本人承認、費用上限、Provider照合、実資金gateを維持する。金融・環境creditを初期売上へ足さず、普通の契約・決済で解けない特定の必要性が実証された場合に別途検討する |

比較する初回支払者は従来の店主/owner/CBO/専門家/市に、**継続する施設・場所の運営者**を加える。その人が複数の修繕・承認・請求照合を自ら担当し、予算を決められるかは未確認。利用者、受益者、請求書の宛先、決裁者、実入金先を一件ごとに分ける。長期の「場所を使い続ける」目的を、単発の店舗改修だけに固定しない一方、修繕管理が最初の商品に適するとも決めない。建物の現地作業、法的な権利/許可判断、資格者の設計/安全判断は該当者に残し、Rockの候補役務は情報と承認状態の接続に限定して検証する。

添付文にはOHCHR、World Bank、BIS、ICVCMへの帰属があるが、原資料へ辿れるURLは含まれない。今回はその記述を**未検証**として、住宅権、土地記録、DLT/権利、炭素creditの制度的主張や収益予測の根拠に使わない。該当する仕事が候補に残った時に、原資料と案件所在地の制度を一次資料で別途確認する。添付文・本節は顧客面談、専門家の法的判断、商品販売、環境credit発行の合格証拠ではない。

#### Phase 1追加監査：施設・場所の運営者は誰が買うか（2026-10-22時点の公開資料）

「施設運営者」を一つの支払者にまとめない。NYCの[DCAS](https://www.nyc.gov/site/dcas/agencies/managing-dcas-facilities.page)では建物の上級custodianが施設managerで、DCAS自身の技能職と外部contractorが維持・修繕を担う。[DCLAのCultural Institutions Group](https://www.nyc.gov/site/dcla/cultural-funding/city-owned-institutions.page)では市有施設を文化団体が運営し、市の運営・資本支援と団体の役務が重なる。DCLAの[募集終了済みAsset Manager職務票](https://cityjobs.nyc.gov/job/asset-manager-in-manhattan-jid-15875)は団体の維持計画、年次報告、DOB Now、CIG/Legal/Finance/調達担当との連携を別の作業として挙げる。文化施設の公開された一例である[BRICの職務一覧](https://bricartsmedia.org/about/leadership/)には施設coordinator、Operations、Finance、理事会が別々に存在する。これらは**役割分離の例**であり、掲載組織がRockの見込客、また各役職が購買権限者という証拠ではない。市施設、文化団体、民間の管理会社、借主が運営する場所では、依頼者・作業承認者・契約者・費用負担者を一件ごとに確認する。

| 運営主体の候補 | 購買・反復を判定する未取得の原本 | 強い反例 |
| --- | --- | --- |
| 自己運営の小規模文化/地域施設 | 直近の独立した修繕記録、運営予算の役務/Software費目、実際の署名・支払権限 | 担当者は困っても理事会/financeの支出承認を持たず、既存の無料Toolで足りる |
| 民間の物件管理会社 | 管理委託契約、ownerへ転嫁できる費用、会社自身のSoftware購買者、施設横断の案件数 | ownerの工事予算と管理会社のSoftware費が別で、[AppFolioのvendor portal](https://www.appfolio.com/help/vendor-portal)が既に見積→完了→請求を扱う |
| 市有の文化施設を運営する団体 | 当該団体の運営費目と承認閾値、DCLAまたは他の資金契約、既存台帳 | 市capital設備予算はSaaS購入に使えず、施設担当の困り事だけでは団体の発注にならない |
| 市が直接管理する施設 | 所管部署の調達仕様・予算行・現行契約・決裁期間 | DCASの内製/既存contractorと市調達があり、早期の小口実注文へ直結しない |

予算の存在とRockへ使える費目を分ける。[DCLAの文化施設支援](https://www.nyc.gov/site/dcla/about/about-cultural-affairs.page)は運営費・energy支援と、設計/施工/設備のcapital費を別にする。[DCLAのcapital手順](https://www.nyc.gov/site/dcla/cultural-funding/capital-funding-process.page)では市の採択予算、対象団体、project scope、調達管理者が段階的に決まり、設備の最低申請額はitem/systemごと50,000 USD、建設/改修は最低500,000 USDである。さらに[FY27 Capital Equipment Catalog](https://www.nyc.gov/assets/dcla/downloads/pdf/Capital-Equipment-Catalog.pdf) p.2はsubscription softwareと関連hardwareを対象外としている。したがって施設に市のcapital予算があっても、月16 USD設計基本料や別のSaaS役務の購入可能額には算入できない。これは**DCLAの設備capital枠についての資料**で、団体の独自運営予算や他制度まで一律に不適格とする結論ではない。実際、[別の市部署の2026年SaaS調達告知](https://a856-cityrecord.nyc.gov/RequestDetail/20260211033)があり、市は他経路でSaaSを買い得るが、これは施設業務のRockへの発注意思ではない。団体の運営予算の費目、役務/Softwareの購買権限、理事会承認閾値と実際の請求書は未取得。[DCLAの公開GPO調査票](https://www.nyc.gov/site/dcla/about/gpo-survey.page)も施設管理、購買software、IT/通信の区分と、組織予算・購買担当者・発注方法を別々に問う。これは設問の存在だけで、調査結果・現行program・Rockへの購入意思ではない。[DCLAのCFP](https://www.nyc.gov/site/dcla/cultural-funding/capital-funding-feasibility.page)は市がconsultantと契約する仕組みで、FY27募集締切は2026-06-04、参加も将来のcapital採択を保証しない。これを現時点のAvokado受注経路としない。市へ直接売るなら[PASSPortの登録](https://www.nyc.gov/site/mocs/passport/articles/complete-vendor-enrollment.page)後も契約保証はない。[市監査官の契約primer](https://comptroller.nyc.gov/services/for-city-agencies/contract-registration-2/contract-primer/)は費目・CFO承認・法務・登録・請求を別段階と説明し、[FY25年次報告](https://comptroller.nyc.gov/reports/annual-summary-contracts-report-for-the-city-of-new-york-2025/)では登録済み契約の72.64%が契約開始日より後に登録された。この割合は特定の施設契約の所要日数やRockの入金確率ではないが、90日で市売上を得る仮説には契約経路と資金繰りの別証拠が要る。

反復仕事は制度上あり得るが、頻度やRockへの支払ではない。[NYC DOB](https://www.nyc.gov/site/buildings/property-or-business-owner/property-maintenance.page)は所有者の維持責任と、対象建物の外壁5年/ガス配管4年などの点検周期を示す。[住宅・community施設向けDOB案内](https://www.nyc.gov/site/buildings/property-or-business-owner/project-requirements-owner-residential.page)は「permit不要」と「無資格で実施可能」を同一視せず、普通のplumbingにも有資格者が必要な場合を説明する。[NYSED](https://www.op.nysed.gov/professions/architecture/professional-practice/practice)はNY所在案件のarchitecture役務をNYの有資格/許可者へ限定する。Rockの仮説役務は権利者の承認状態と資料・費用・作業履歴の整理で、点検、設計、安全判定、施工、法的承認を肩代わりしない。NYC以外の案件には所在地の制度を別途照合する。

土地・建物の利用権へ近づく場合も業務を切り分ける。[NY州Department of Stateのbroker FAQ](https://dos.ny.gov/real-estate-broker-frequently-asked-questions)は、他人のために有償で不動産売買・賃貸を交渉し、賃料を集める等の行為にbroker免許が必要と説明する。同FAQは、管理会社が貸主の代わりに入居者を入れる/賃料を集める場合は免許を要し、**純粋な維持管理**ならその理由では要しないと区別する。免許あるbrokerでも所有者の許可なく売買・賃貸を提示できない。[同省の法律実務memo](https://dos.ny.gov/legal-memorandum-li04-real-estate-brokers-and-salespersons-and-unauthorized-practice-law)は不動産契約の法的条項・助言を弁護士の仕事と区別する。したがってNYC pilotでRockが仮に案件資料・権限者の確認・承認履歴を記録しても、それだけで物件を募集/紹介/交渉し、賃料を預かり、権利・契約条項を判断する役務まで許可されたとは扱わない。初回仕事の作業指示、契約相手、報酬方式、掲載/送客、金銭保管の有無を決めてからNY側の資格者/法律家に適用を照合する。現在は具体物件・契約がないため、Rockの個別行為への免許要否は**未判定**。地域非限定の案件は所在地ごとに制度を確認する。

美術×建築の仕事は、設置時のcommissionと設置後の維持を別の費用・責任として比較する。[NYC Public Design CommissionのArtwork Installation checklist（2025年3月版）](https://www.nyc.gov/assets/designcommission/downloads/pdf/checklists/PDC_Checklist_Artwork_Install.pdf)は市有地作品の提出を市の所管agency liaison経由とし、制作/設置/保険/建築・工学役務/作家費/維持基金を分け、維持計画に必要な資金、実施責任者、保存方法、作品寿命を記すよう求める。[NYC DOT Art](https://www.nyc.gov/html/dot/html/pedestrians/dotart.shtml)は自局の恒久作品の管理・維持をDOTの責任と明示する。これは「完成後も使い続ける」ための仕事と責任が実在する例であり、維持基金は制作時に組み込まれることもあるため、新たな月次発注やRockへのソフトウェア費ではない。民間作品でも案件ごとに設置権利、委託者、作家/資格者、維持担当、制作費と維持費を分ける。NYCの市有地制度を地域非限定の作品へ転用しない。同じ[NYC DOT Artの自費型temporary artwork経路](https://www.nyc.gov/html/dot/html/pedestrians/dotart.shtml)はartist単独では申請できず、CBO/BID等のpartner団体がartist選定、制作費、project管理、保険、契約、展示中の維持を担い、申請は設置予定の少なくとも90日前とする。これは団体が作品の支払者/管理者になり得る例だが、団体の予算・Avokado委託は未確認で、最初の90日を現地設置の完了期限にしない。同ページのDOT出資型Community Commissionsではagencyが作家へのproject feeを提供し、団体は協働partnerである。団体の参加を団体からの発注額へ、agencyの作家費をRockの収益へ換算しない。

公開された大規模施設の**過去の調達例**として[NYC Health + Hospitalsの2021年FMIS RFP](https://a856-cityrecord.nyc.gov/Search/GetFile?documentId=32411&requestId=20210819108&requestStatus=Archived&sectionId=6) p.6–7は、年間約65百万USDの維持・修繕program（内製と業者費の合計）と、当時の複数system/表計算による重複を説明し、承認・版管理・引継ぎの統合systemを募集した。これは大規模operatorが具体的な業務課題を調達仕様にした例だが、**2021年の終了済み公募**であり、65百万USDはSoftware予算でもRockのTAMでもない。RFPの参加最低条件には24/7/365支援、公私の参考顧客、PeopleSoft・Hyperion・network storage連携、PC/モバイル対応、保守更新があり、既存software・導入/連携・security・net 90も仕様に出る。同RFPは資料・工程の版管理、内部/外部のreviewと承認、電子署名も求めており、「版付き承認」の課題設定自体は既知である。これは当該2021年公募の条件であり、全施設顧客の一律条件ではない。小規模の初回pilotを同じ販売経路で90日以内に取れるとは推定しない。

競合の機能はこの仮説の厳しい反例。[AppFolioのproperty maintenance](https://www.appfolio.com/property-manager/maintenance)はowner/住民/管理者のwork order、PO承認、請求、監査履歴とAI調整を掲げ、[Buildium](https://www.buildium.com/features/property-management-maintenance-software/)は見積からbill、反復task、予算・進捗を扱う。[UpKeepのprocurement](https://upkeep.com/product/procurement/)は金額・site別承認、PO/受領/請求の照合と履歴を扱い、[work orderのCSV export](https://upkeep.com/product-releases/upkeep-product-release-march-20-2025/)も公表している。[MaintainXの公開料金](https://www.getmaintainx.com/pricing)はBasicでwork order無制限の無料入口（繰返しwork orderは2件の制限）を置き、購買/承認などは上位tierに分ける。同社の[役割別の購買フロー](https://help.getmaintainx.com/about-purchase-orders)では現場担当が要求し、管理者/承認者が価格・発注を扱う。これはRockの候補機能が既存Toolにあることを示すが、月16 USDのSIM/eSIM service access基本料とは契約内容が異なるため単価だけを直接比較しない。「AI付き修繕台帳」「承認履歴」「持出し」「低価格」だけで差別化したとは言えない。CSV exportが写真・同意・専門家原本まで完全移行できるとは未確認だが、持出し機能が存在しないとも言えない。運営者の現行Toolで同じ原本・承認・引継ぎが足りるなら、この候補を下げる。既存Toolを捨てる費用、二重入力、専門家/owner/借主との境界をまたぐ特定の未解決点がある場合にだけ、同じ一件で時間・差戻し・顧客検収を比較する。

施設運営候補の次の観測票は、最近の**独立した修繕/運営仕事を複数件**、発生日とともに記録する。各件で施設の所有者/賃借人/委託運営者、依頼者、見積・支出上限の承認者、請求書宛先、支払元の予算費目、施工/設計資格者、使用中の台帳、最後の決裁資料、完了/不具合再開を別欄にする。直近の発注書・請求書・役務契約は同意を得て秘匿情報を伏せて照合する。**同一案件のrevisionは新規の再注文と数えない**。既存手段で解決した件、役職上は困っていても予算がない件、顧客の現金支出よりRockの支援時間が重い件も残す。面談、記録閲覧、注文、入金はすべて未実施である。現行の[`WorkJob`](../../lib/workflow.ts)は一ownerのstep/event/revision記録で、施設owner・運営者・施工者の別々の署名や物件原本を型付きで受け入れない。[保存・exportの現状監査](#企業価値10時間調査第1区間の事実監査2026-10-20開始)に照らし、複数者の承認/引継ぎが本当の購入理由なら、その不足を実装・運用費として見積もる。実案件なしに既存のgeneric `passed` を適法な承認として売らない。月16 USDの現行service setupも[`ServiceSetup`](../../lib/rockstar-service-setup.ts)の一ownerに結びつくownerId/orderId/deviceRefと[`serviceSetupBilling`](../../lib/rockstar-service-setup-billing.ts)のowner→Stripe customer・支払方法準備を中心にし、この経路から団体の購買担当/複数seat/発注書/役務請求の受入は確認できない。施設運営者が買うSaaS仮説を現行のservice setupが満たすとみなさず、当該契約・販売主体・費目・請求/返金を別gateとする。

Phase 1での暫定比較は、重みを恣意的に置いた単一の「企業価値点数」にしない。各支払者候補について、(1)最近の独立した実仕事と現行の実支出、(2)本人の予算/契約権限または特定済み決裁者、(3)無料・有料の代替で残る損失、(4)専門家/仲介/権利者の責任を分けた適法な成果、(5)入金から全直接費と支援時間を引いた一件の貢献額、(6)同じ支払者からの独立した再依頼、を横並びの未確認欄として残す。店主・ownerの**案件費**、事務所・運営会社の**継続Software費**、CBO/市の**役務委託費**は購入行動と予算科目が異なる。運営会社に複数案件があってもownerだけが発注費を出すなら、利用者と支払者を再定義する。市/団体のpublic funding、既存FMISの導入、NYでの資格/仲介境界のどれかが90日内の初回検収を妨げる場合は、初回有料顧客の候補順位を下げる。これは**次の面談・原本照合の判定法**であり、誰の支払意思も現時点で観測していない。

公開資料からの**暫定探索順という推論**は、まず発注権と実仕事を同一組織内で照合しやすい民間の自己運営owner/小規模施設運営者を探し、同じ質問を複数案件を扱う専門家事務所にも並行して当てる、というもの。前者には既存CMMSで十分という反例、後者には[Houzz Pro](https://pro.houzz.com/pro-learn/blog/houzz-pro-pricing)等への切替費という反例がある。NYCの店主一店舗は[SBS無料支援](https://nyc-business.nyc.gov/nycbusiness/business-services/initiatives/opening-a-business-in-nyc)とowner署名/立替を超える有料成果が見える場合に案件費を検証する。CBO/BIDは[SBSに記載のBoard予算決定](https://www.nyc.gov/site/sbs/neighborhoods/bids.page)、市直営は[契約登録と調達](https://comptroller.nyc.gov/services/for-city-agencies/contract-registration-2/contract-primer/)を確認できる実案件がある場合に進める。この順は市場規模や成約確率の順位ではなく、予算決裁と検収を観測する**作業順の仮説**。自己運営ownerが存在しても直近の別案件・外注支出・購入権が示せなければ順を逆転する。空間以外のSky仕事で真正な支払が先に得られても、それは「場所を使い続ける」仮説やSIM/eSIM導線の受入とは別の事業証拠にする。

### 地方創生とFacebook専門家コミュニティ

2026-10-20の本人方針は「街や暮らしをもっと良くすることに時間を使う」。地域の空き家・空き店舗・公共空間など、地域側が示す一つの課題から始め、建築家、デザイナー、世界各地の不動産事情に詳しい協力者を募る。既存の建築・インテリア・サウンド方針を地方創生の実案件へつなぐ。10時間調査の開始後、本人はいったん初期地域を**New York City**と指定した。その後の明示方針で、NYCは**初回対面開催地**に限り、美術・建築の題材と協働先は地域非限定になった。市内の地区、案件所在地、参加条件・報酬は未決定である。

Facebook会社ページは公開の案内口で、総合 `avoado.si`、Mini `avocadomini.si`、Pro `avocadopro.si` へのリンクが記録済み。オンラインサロン用グループ、Facebook API連携、募集投稿は未作成・未実施。まず公開ページで活動趣旨と参加案内を示し、承認制の専門家グループで事例共有と月1回の案件検討を行う案とする。参加申請では専門分野、対象地域、実績、協力可能な範囲を本人同意のもと確認する。地域住民・物件所有者・自治体の意向を先に聞き、図面・物件情報・個人情報の掲載には個別許可を得る。AIの提案は現地調査、法令・権利、専門家の責任ある判断に代えない。

本人提示の[Holland Village Members’ ClubのFacebookグループ](https://www.facebook.com/groups/4507165225969815)は**第三者の参考例**。同サロンの[DMM入会ページ](https://lounge.dmm.com/detail/8636/)は有料入会・申請・審査・決済をDMM側、会員交流を非公開Facebookグループ側で扱う。Avokadoの所有グループや連携先ではない。Avokadoが有料サロンを採用するなら、募集ページ→会員申請/条件確認→決済・会員状態→専用グループ参加承認→退会時のアクセス停止を別状態で設計する。DMMを使うか、参加費を設けるか、価格/特典/退会条件は未決定で、参考サロンの会員や投稿をAvokadoへ移さない。

2026-10-21の本人訂正: 本人はHVMCの会員だと申告し、同サロン**内に新しい同好会を立ち上げる**方針を示した。Avokado独自のFacebookグループや単発ゲスト企画とは別の仕事として扱う。HVMC運営側の[2026年8月発表](https://prtimes.jp/main/html/rd/p/000000079.000108253.html)は会員が同好会を新設・運営すると説明するが、申請画面・審査条件・命名/商用利用規則は公開資料だけでは確認できない。作業名は**「街と暮らしを良くする同好会」**。会員が旅先・居住地で心地よい街や困る場所を持ち寄り、建築・デザイン・世界の不動産事情の視点で学び、地域側の具体的な課題に接続する。初期の現地題材候補はNew York Cityで、地区や案件は未選定。HVMCの活動をAvokadoの顧客名簿・販売導線と取り違えない。

立ち上げ準備は、(1)会員アカウントで新設導線と規則を確認、(2)趣旨・代表者・共同運営者・投稿頻度・外部公開方針をまとめる、(3)HVMC内に会員向けの新設操作が確認できた場合だけ申請・承認と同好会ページを読戻す、(4)初回自己紹介と街に関する問い、(5)月内に専門家との対話1回と任意参加の街歩き候補を検討、の順。最初の30日は週1回の問いと月1回の会を提案し、参加・再訪・地域側の評価を記録する。追加会費、案件勧誘、会員への無断DM、録音/転載/テレビ公開を初期活動の条件にしない。会員の投稿・音声・写真の外部利用は個別の許諾、実案件化は関係者/専門家/支払者の別承認を要する。2026-10-21に会員Facebook画面の`Joined`を読戻した。親グループの一般会員投稿は一時停止中。新設の申請・運営承認・開設は未実施。

2026-10-21の追加指示: **事務局への問い合わせは行わず、HVMC内の同好会に限定する**。Facebookで本人名義の新規グループ作成画面は確認できたが、これはHVMC公式同好会の登録や親グループとの連携を示さないため、独立グループは作らない。HVMCグループの会員表示は`Joined`。親グループの通常投稿は管理者のみの一時停止状態で、会員メニューに同好会新設操作は確認できなかった。会員向けの同好会規則ファイルは見つかったが、Chromeで添付本文の表示がブロックされ、新設条件を読めなかった。本人にファイル添付や保存を求めない。会員側で直接設立できる経路が確認できるまで、公式同好会の申請・作成・告知は未実施とする。

同日更新: 本人がローカルにダウンロード済みの資料を提示したため、保存・複製せずに新設手順を確認できた。会員向けの正式な発足申請フォームと最新版ルールへの導線も確認した。前段の「新設経路未確認」はこの時点で解消。活動地域は**ニューヨーク**、作業名は**「ニューヨーク 街と暮らしを良くする同好会」**とし、本人は現地で隔月以上の対面開催を担えると回答した。申請案は建築・公共空間・暮らしを街歩きで学ぶ非商業の会員活動に絞る。Avokadoの営業、会員勧誘、不動産仲介、会員の外部移送は申請・活動の目的に含めない。本人提供の必須情報と最新版ルールへの本人回答をフォームへ入力済み。勤務形態の選択だけ確認待ちのため、**未送信**。審査・開設・告知も未了。申請後も事務局への別途問い合わせは行わず、運営による審査結果を待つ。会員限定資料の本文と個人情報はGitに保存しない。

同日名称訂正: 本人は上記の長い作業名を却下した。申請フォームの名称欄を短い仮案**「NYC 街の余白」**に差し替えた。本人が「毎日働く」と再確認したため、勤務欄は週末・休日を含む選択肢にし、自由記述に毎日活動と明記した。名称の本人確認と同意を伴う正式送信の直前確認は未了。申請は**未送信**のまま保持する。

同日再修正: 本人は仮名にも活動内容にも具体性がないと指摘。申請フォームの作業名を**「NYC Urban Walks」**に変更し、活動を「隔月にNYCの一地区を歩く→建築・公共空間・住まいを観察→対面レビューで課題を一つ選ぶ→会員内で改善案を一枚にまとめる」と明記した。建築家・デザイナー・住環境に詳しい会員の参加を想定するが、営業や不動産仲介には接続しない。これは送信前の提案であり、本人の名称・内容評価と送信直前確認が残る。

同日方向修正: 本人は「NYC Urban Walks」と街歩き中心の内容も却下した。元の構想は、建築家・デザイナー・世界各地の不動産事情に詳しい人を集め、街や暮らしを良くする地方創生の事業につなぐこと。街歩きは本人が指定した中核活動ではない。HVMC申請の名称・目的・企画欄から却下案を消し、**未送信**とした。HVMCの非商業同好会では会員間の地域課題・各国事例・専門知の交流までを設計し、Avokadoの事業勧誘や不動産仲介を会内の活動として書かない。この境界を踏まえ、名称より先に会内で実際に提供する活動と初回テーマを本人に示して確認する。

同日構想の明確化: 本人は、HVMC会員には不動産情報が豊富にあるという**仮説**を示し、その分野に建築家を招き、**artと建築を掛け合わせたものを作る**意図を明示した。活動対象をニューヨークに限定しない。申請文や会内活動の次案は、この創作・空間構想を中心に置く。公開情報または権利者の同意を得た場所だけを題材とし、会内での物件売買・仲介・事業勧誘を行わない。まずHVMC会員の建築家との協働可能性を探り、外部ゲスト参加はルール上の手続きを確認してから扱う。初回の作品形態、対象の場所、名称は未確定で、申請も未送信。

2026-10-22 既存同好会との重なりを確認: 本人の指摘を受け、近いテーマのHVMC公式同好会が既に存在することを公開プロフィールで確認した。活動本文は未参加者には見えず、新設案との実質的な重複は未判定。会員向けの規則と申請条件の詳細はGitに転載せず、新設を進める前に適合と差分を確認する。フォームの入力状態が別操作で変わっているため上書きしない。申請は未送信。

同日の名称確認: 本人は「同好会」を名称末尾に付ける必須性を事務局へ直接尋ねるよう明示。公開プロフィールで公式Instagram窓口を確認し、フォームとルールの名称欄に末尾指定の明文は見つからなかった。公式グループ表示名の運用は未確認。ChromeのInstagramがログアウト状態で、ログイン導線の操作が自動承認審査で拒否されたため、本人のログイン待ち。DMは未送信。

本人の追加決定: Facebookを専門家と地域参加者が話題を広げる主要インフラとして使う。運営の一周は「地域からの問い→建築家/デザイナー/不動産専門家の異なる視点→会員同士の対話→同意を得た短い記事・音声・映像→公開ページ・参加先からの新しい問い→地域での提案/評価」。グループ内では地域別、空間/暮らし別、世界の先例別に見つけやすくし、月次の対話会を設ける。編集担当が実在する事例・出典・権利を確認する。単なる大量投稿・反応誘導を拡散の合格条件にしない。測るのは有用な返答、再訪、専門家と地域側の共同提案、地域側の評価、同意済みの公開視聴とする。

テレビ放映は企画提案、媒体選定、出演/著作/映像/土地・物件の権利、編集・字幕、放送局との契約と実放映の読戻しを別gateにする。携帯/PCでは音声番組の再生と字幕/文字版、本人が明示的に起動する音声参加を候補とする。マイク権限、録音範囲、保存期間、外部公開の個別同意を確認し、常時聞き取りを初期仕様にしない。Facebook投稿の自動取得/一括投稿が使える前提にせず、公式の現行許可と運用手順を確認してから接続する。当時の「最初の30日は一地域の一課題」というpilot案は、後続の本人指示により対象地域の決定ではない。現在はNYCを初回対面開催地とし、美術・建築の題材と協働先は地域非限定で、実案件の場所・一課題も未選定。専門家の公開募集案、対話会1回、許諾済みの短い音声/映像1本の制作案も候補の受入単位にとどめ、会費徴収・実放映・新規グループ公開は別に記録する。

主担当はBusiness Pilotsの`ROCK`（募集導線・案件記録・成果/費用の照合）。`EXTERNAL`はFacebookの機能提供と各地域の専門家・権利者、`OWNER`はグループ開設/投稿/参加・案件/契約の最終判断、`JOINT`は実案件の同意から成果検収まで。既存の製品/UX・Webの入口と連携し、`FB01`〜`FB06`はFashion Brand OpsのIDなのでFacebookサロンの完了証拠へ転用しない。最初の合格証拠の候補は、実案件の所在地と一課題、関係者の同意、専門家の役割、提案、費用見積、地域側の評価を同じ案件記録で追えること。所在地はNYC開催から推定しない。会員数だけを地方創生の成果としない。

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

各pilotは同じ顧客・同じ仕事IDで、導入→初回成果→自主的な再依頼→真正な注文/入金→直接費と支援時間を追う。件数だけでなく対象者・未完了・返金の分母を残す。売上が確認できても粗利や継続は別判定とし、採算が見えないまま広告・外部契約・製造投資を拡大しない。会社評価額や市場首位の主張は実証対象外。

## 完了条件

- P0コード、P1取引1件、P2複数利用者、P3自動接続、事業検証を別状態で記録する。
- 顧客データと成果物を本人別に分離し、retentionと削除を実測する。
- 外部市場の規約、公式API、固定IP、OAuth、決済条件に従う。
- 売上、利益、時間短縮を実測なしに表示しない。

## 関連資料

- [営業・事業運営18役の定義](../../data/revenue-role-map.json)（担当別の入力・成果物・完了条件・引継ぎ・指標）
- [CSV仕事 v1](../csv-business-v1.ja.md)
- [CSV security](../csv-business-security.ja.md)
- [Mercari revenue loop](../mercari-revenue-loop.md)
- [Fashion Brand Ops](../fashion-brand-ops-integration.md)
- [Skyのココナラ](../sky-tools-complete-design.md#9-ココナラ)
- [CSV task manifest](../../data/csv-business-tasks.json)
- [企業価値戦略・正味10時間の実行プロンプト](../prompts/avokado-company-value-ten-hour-strategy.md)（2026-10-20に事実監査から実行開始、600分の完了は未達）
- [avokado戦略実行係](../../.cursor/agents/avokado-strategy-executor.md)（プロジェクト専用subagent、調査中）

## 検証

- `npm run csv:check`
- `node --experimental-strip-types --test tests/csv-transform.test.mjs tests/csv-fee-policy.test.mjs`
- `npm run test:fashion-brand-ops`
