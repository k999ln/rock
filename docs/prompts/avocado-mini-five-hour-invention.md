# avocadoMini R5 — 5時間の製品発明・実行プロンプト

作成: 2026-10-19 00:02 UTC。依頼: 利用者が、avocadoMiniを発明する作業に**実時間で5時間**を与え、この実行プロンプトの作成を求めた。この文書の作成は5時間の発明作業を実行した証拠ではない。

## このプロンプトを実行する担当へ

あなたは`k999ln/rock`のavocadoMini製品発明担当。開始時刻をUTCで記録し、**実際に300分を使って**調査、発散、定量比較、設計収束、自己反証を行う。開始から300分より前に「5時間完了」と報告しない。時計待ちだけで時間を消費せず、各段階で新しい検討と証拠を残す。進捗は節目ごとに短く共有し、利用者の新しい指示が届けば優先して設計へ反映する。実行の終了時刻、経過時間、調べた範囲、未完了を記録する。

### 目的と変えてはいけない条件

発明するのは、ユーザーが「使いやすい」と感じられる**一つの可搬avocadoMini**。PCの前に立たなくても小さな作品を作り、携帯電話を手に持たなくても連絡できる。住宅・制作・Game・持出しは用途の壁で切らず、同じ本人、仕事、停止、成果、費用の連続体験にする。電話が来れば共有空間では匿名の合図から始まり、本人を確かめた後に空間へ必要な操作を示し、空間タップで応答・拒否できる。音声・物理操作は失敗時にも使える。

利用者が指定した最低機能は、センサー、生体認識、機器・サービス連動、RockstarOS／Sky／Zemaの実利用、Mini本体による**直接の双方向衛星IP通信**とWi-Fi共有、dockから外した後のポケットWi-Fi、空間着信と空間タップ、電話・PCなしの連絡と制作。R5の使用時200mm以内、一本自律、同型Miniの増設可能性、別演算Hubを必須にしない条件を保つ。近距離の平面空中像の成立を、元R5の全空間裸眼3D研究の達成へ置き換えない。もし同時に成立しないと分かれば、黙って条件を弱めず、衝突する数字・必要な要求変更・代案を利用者が判断できる形で示す。

外観の優先方向は、**細い銀色の可搬円筒と上部の黒いセンサー帯**。02木天井、05石のアイランド、10深い軒裏は一台の設置profileの比較であり、三台必須ではない。面一収納から軸方向にせり出して手で外す。低い卓上円盤は任意の据付dock、太い均一径の筒は工学比較、旧二重筒は退役した意匠。最初の着脱・空間操作場所は、流し・熱源から離れた**手の届く乾いたアイランドの模擬カウンター**。天井や軒裏は別profileとして評価し、到達できない設置場所で毎日の手動着脱ができると主張しない。

利用者が示した[住宅利用映像集](https://higgsfield.ai/ja/asset/projects?projectId=2895ffaf-daf4-4c00-8508-26eb7895ff1a)と[形状を固定しない空間体験例](https://higgsfield.ai/ja/asset/projects?projectId=289d1861-f105-41a2-9b1a-4568d9686405)、`codex://threads/01a135ff-4d40-77c3-bf40-e614db076b0e`、`codex://threads/01a15082-9371-7d30-a75f-6745dc248ec0`を参照する。既に確認した実映像は住宅側EP03／EP08／EP13、体験例の卓上バスケットボールと床への組立案内。映像の白い箱、丸い照明、四本の長いポールは生成上の形状で、Miniの採用外形・光学実証ではない。追加で見る場合は、どのクリップの何を見たかを記録する。

### 着手時に読む正本とGit境界

1. `AGENTS.md`、`docs/product-baseline.md`、`data/product-baseline.json`、`README.md`、`project.md`、`data/project-status.json`、`docs/workstreams/README.md`、`docs/workstreams/00-responsibility-boundaries.md`を読み、主担当をMaterial Invention / avocadoMini、MAT15（JOINT）とする。[担当とgate](../workstreams/11-material-invention-avocado-mini.md)を確認する。RQ01〜RQ49、現行SIM/eSIMサービス導入、RockstarOS／Sky／Zemaの共通契約、予算承認、権限、一般ローンチ保留を維持する。
2. [R5原本入口](../avocado-mini-r5/README.md)、[空間携帯の最低機能](../avocado-mini-r5/phone-spatial-interface.md)、[Orbit発明案](../avocado-mini-r5/product-invention-r1.md)、[R5着脱通信](../avocado-mini-r5/embedded-portable-connectivity.md)、[Game実行](../avocado-mini-r5/game-runtime-design.md)、[Mini全体設計](../rockstaros-avocado-mini-complete-design.md)、[OS設計portal](../rockstaros-design-portal.md)、[OS全体詳細](../rockstaros-complete-design.md)、[Sky全Tool](../sky-tools-complete-design.md)、[製品判断の8原則](../rockstaros-1.0-strategy.md)を読む。R5の固定packageとhashは変更しない。
3. `git status --short --branch`でdirty差分を保護し、`npm run prompt:context`またはGitHub connector等の同等の読み取りで**その時点の**main、実在する作業branch、関連PR、同一SHAのCIを再取得する。読み取り失敗なら最新未確認と書く。既存source・設計・証拠を読まずに過去の進捗行を現在の実装証拠にしない。mainの基盤が作業branchに未反映なら引継ぎ入口と優先順位を先に同期する計画を立て、dirty checkoutを上書きしない。GitHub保存、作業branch反映、main統合、Site配備を別に記録する。

作成時の読み取り記録: GitHub connectorでmain `70c3e3ef3a05d6f0c9d068616a98f47a38b96d4a`、実在する`codex/esim-cloud-access` `951d82d5a491a284aed4e0d4d280171d835d4b43`を確認。比較はmerge-base `9f64aee3de9cc74e6b6e7eae34052780e000c296`、main側625 commit、作業branch側3 commitの分岐。mainの同一SHAには`verify`等の成功checkがあり、作業branchの同一SHAは`source-preparation`一件のみでfull CIの証拠ではない。関連する建築方向の[open PR #130](https://github.com/k999ln/rock/pull/130)は未統合。現ローカルcheckoutには未コミット差分が多数あり、`docs/avocado-mini-r5/product-invention-r1.md`は作成時のmainには存在しない。`npm run prompt:context`はローカル`gh` token無効・shellのDNS不通で失敗したため、上記はGitHub connectorによる代替確認である。**これらのSHA、PR、CIは実行時に必ず取り直す。**

旧監査の固定入力 `7cdbb5fedc86ee3978ed329d9312147d137c9199`（当時main）、`fcedcfec4dd2a242a1ba8fd7ff5eebba97b8ecd5`（当時native）、`de5b102d3525daccf604efd5685bdf8c14ad5d50`（当時design）はbaselineの履歴照合用であり、現在の開始SHAではない。

### 5時間の作業順

**0〜40分 — 基準と利用場面。** 動画・設計から「最初の5分」「着信→応答」「小作品を声と短い空中操作で作る」「本体を外して通信を持ち出す」「帰宅して同じjobを再開」を、一人の利用者と一つの場所で連続する場面にする。現行のスマホ／PC／家庭機器なら必要な操作数、移動、持替え、費用確認を列記し、Miniで減らしたい摩擦と逆に増える摩擦を明記。生活・Game・制作のうち最初に測る各一件を選ぶ。個人情報を誰が見聞きできるかを描く。

**40〜120分 — 方式を発散。** 同じ最低機能を狙う独立した物理構成を少なくとも3案比較する。既存のStow／Ready／Carry・Aperture Lift／Place Passport／Scene Contract／Route Guardianを必ず候補に含め、別の光学配置・latch・antenna配置・音声routeを持つ対案も作る。外観は参考に合わせつつ、端面が面一の時に光学出口、指検知、物理停止、生体入力へ本当にアクセスできるかを断面と視線で示す。製品の形、機能配置、使い方を混ぜて架空の一案にしない。

**120〜205分 — 一次資料と数字で反証。** 公開の公式datasheet、通信事業者の技術／料金／tethering条件、光学一次論文・安全資料を再確認し、URL、版、取得日、適用範囲を残す。少なくとも①200mm以内の寸法stackと質量、②通話待受・空中表示・Wi-Fi AP・衛星送受信を含む電力/熱、③光路・像の幅/距離/視域/室内照度と指位置誤差、④衛星双方向IP、antenna姿勢/見通し/屋内遮蔽、⑤本人確認と共有空間の漏えい、⑥dock着脱中の給電/場所scope/座標失効、⑦回線料金と通信上限を数字または「未取得」に分けて比較する。受信だけ、衛星messageだけ、外部terminal、地上eSIMだけを直接衛星IP hotspotの合格へ流用しない。公式[Iridium 9770](https://www.iridium.com/products/iridium-certus-9770)の大きさ・重さ・低速上限と[9704](https://www.iridium.com/products/iridium-certus-9704-module)のmessage用途は既知の衝突例として扱い、同じ部品の値を再確認する。物理的に無理な案は明確に落とす。

**205〜260分 — 一案へ収束。** 最優先の製品案を選び、選択理由を「使いやすさ」「最低機能との一致」「部品と契約の入手可能性」「安全・privacy」「電力・熱」「量産への道」の根拠付きで説明する。選んだ案の外形・三状態・光路/RF/電池/演算の実寸配置、本人と場所の状態機械、通話とWi-Fiの費用表示、Sky／Zemaの一件の制作とGame、失敗時操作を示す。できれば断面図と一周の図を既存設計の関連資料へ加える。先行技術と比較する際は、既知の要素、組合せの候補、調べ切れない点を分け、特許性や実施自由を断言しない。

**260〜300分 — 独立の自己反証と納品。** 最も厳しい反例を少なくとも5つ挙げる。特に「Stowでセンサーが隠れる」「人に見える着信詳細」「屋内衛星遮蔽」「携行時のantennaと手の干渉」「低速・高額回線でGame/作品の転送」「誤応答」「離脱後に古い住設権限が残る」を検査する。数値が不足する案には試験と停止条件を付ける。候補比較の履歴を消さず、最終案へ反証の結果を反映する。時間満了までに1ページ要約と下記の成果を保存する。

### 納品物と合格判定

- **製品発明設計**: 既存`docs/avocado-mini-r5/product-invention-r1.md`を更新する。形、内部配置、操作、五つの利用場面、RockstarOS／Sky／Zemaの責任、状態、保存、失敗、復旧、権限、費用、未決条件を一続きに示す。短い要約は`docs/avocado-mini-r5/README.md`と`docs/workstreams/11-material-invention-avocado-mini.md`へ同期。新しい日付付き入口文書を乱立させない。
- **候補と決定表**: 3案以上を同じ指標で比較し、落とした理由、選んだ理由、未決の数値を残す。製品外観の図と、光学・衛星・電池・放熱・latchを置いた寸法断面を区別する。構想画像を実物の証拠にしない。
- **同一閉箱の検証計画**: OI01〜07、MP01〜06、DP01〜05、MG01〜07の関係を表にし、bench→模擬カウンター→同一200mm以内閉箱→実利用の順で合格証拠と停止条件を定義する。別の開発基板や屋外terminalだけで通った項目をMini単体合格にしない。音声、光、RF、電池の安全と適法性は専門担当の確認条件を置く。
- **発明の境界**: `ROCK`はBroker、owner、job、budget、Device Profile、`EXTERNAL`は光学/RF/音声回線/機構/施工、`JOINT`は同一実機の一周、`OWNER`は対象利用者、地域、回線、費用、製造/公開判断。部品購入、加工、通電、レーザー/強光、端末書込、provider契約、公開、実資金操作は設計だけから実施しない。
- **検証と記録**: 新しい明示指示の理由を`docs/product-baseline.md`と`data/product-baseline.json`に、着手・判断変更・終了時刻、実際の検証結果、次の一手、未解決を`project.md`と`data/project-status.json`へ記録し、`npm run project:update`でREADMEへ反映する。設計componentを追加・変更した場合は`data/design-document-index.json`、OS/Tool詳細設計も同じ変更へ同期する。変更箇所の確認後、`npm run baseline:check`、`npm run design:check`、`npm run project:check`、`git diff --check`と、AGENTS.mdに従う`npm run verify`を実行する。取得・実行失敗を成功にしない。長いログと全動画フレームはGit外へ置く。

終了報告では、開始・終了UTC、実経過時間、選定案、もっとも大きい物理的障害、合格／未実施gate、保存したfile、検証結果、GitHub branch/main/公開の各状態を短く提示する。**完成した製品、特許、実機、衛星契約、一般販売**のいずれも、対応する証拠なしに宣言しない。
