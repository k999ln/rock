# 各製品の役割と接続

2026-10-15確定: RockstarOSはJennifer・Sky・Zemaを統合し、各サービスは単体でも利用できる。Sky単体でAgentの選択・接続・実行・usage計測・月次請求・入金確認まで成立させ、Jennifer/Zema/native OS/Mini/SIMを必須にしない。Zemaは同じ明細を参照する。[責任・保存・復旧・独立利用の受入](../sky-billing.md)は設計であり、本番課金受入ではない。

再構成版 1.0。サービスの仕事・権限・成果契約を共有しながら、機器ごとの価値と成立条件を保つ。Sky/Zema/OSを使うためにMini・Pro・rocketstarの完成を待たず、Miniの基本動作にProを要求しない。

## ソフト・家具・建築へ開くマーケットプレイスとハブ

2026-10-15の本人指示でSkyはAgent/LLMのマーケットプレイス兼ハブを製品の中心定義とする。RockstarOS以外のapp/Web/機器/家具/インテリア/建築へ、共通の能力宣言と本人/データ/費用/停止契約で接続する。Miniは空間の任意host、Pixelは第一者端末、Pro/cloudは選べる計算先。ソファー例は実センサー→荷重adapter→Sky→有効性/本人確認→ヘルスケアAgentの記録/傾向表示とし、計測・校正・共有同意を分ける。[詳細・責任・未実行SF01〜05](../sky-mcp-architecture.md#家具建築まで開くskyの融合)を参照。catalog掲載や製品名だけで実機接続・健康計測・協業契約の成立にしない。

## SkyとZema

Skyの主な利用者は能力を使う本人と、能力を届ける作者。発見→条件比較→接続/購入→仕事または対応アプリへ進む。入力は本人の目的、catalog/manifest、接続能力、購入記録。出力は版付きの能力選択と接続状態で、本人承認・実行成功は出力しない。作者公開はPackage宣言と明示した公開コードを区別し、原稿やsecretを登録しない。

Zemaの主な利用者は仕事を依頼・修正・検収する本人。依頼と成功条件を受け、既存WorkJob・step・event・artifactを表示する。主な操作は次に必要な一つの行動、入力修正、確認、停止、成果取得。原稿・成果の保存とrevisionを共通契約へ委ね、別の仕事DBを作らない。OS内では管理役、Sky単体では管理への共通導線、host appではアプリ文脈の成果表示を目指す。

失敗・認証切れ・接続不明は保存済み仕事を照合し、実行や購入を自動で再送しない。更新は旧仕事のTool版と入力を保持する。受入は本人A/B、desktop/mobile、保存・再取得・停止・費用の一周。外部host app認証・成果連携は独立受入とする。[Sky設計](../sky-launch-design.md)、[全Tool正本](../sky-tools-complete-design.md)、[共通契約](02-system-contracts.md)へ接続する。

## Jennifer

**会話を選ぶ利用者の、Rockstar全体のプロジェクト統括窓口。** 目的をGoalへ言語化し、projectを選び、担当siと必要な確認、成果受領をまとめる。ZemaはJenniferの裏でJob/Task/Run、進捗、承認、停止、artifact、費用、Receipt、履歴を管理し、競合する人格として前面へ出さない。Skyは能力の発見・接続、Brokerは本人・権限・費用の強制を持つ。

根拠は[JenniferのGit正本](https://github.com/k999ln/rock/blob/3349c2475468443bc7ecd94a4e3782343f514a8f/docs/jennifer-coordination.md)、`codex/jennifer-zema-execution` / `3349c2475468443bc7ecd94a4e3782343f514a8f` / [PR #113](https://github.com/k999ln/rock/pull/113)。役割は未定義ではなく、Web構成・計画・実行接続sourceはPR #113からmain `01d2e418`へ統合済み。今回の設計branchにもmainを保全mergeした。Jevは既存の任意remote evaluatorで、Jenniferと別system。

入力は本人の依頼、目的/意図、範囲と対象外、成功条件、選択したprojectと許可資料。出力はGoal Contract、依存付き計画、担当profile、必要確認、成果の統合報告。計画は`proposed / advisory-only`、本人確認前のGoalはdraft。計画生成はboundedな決定論的処理で、万能な自然言語LLMや自動実行を実証したものではない。

社内開発/運営の8project（RockstarOS、Hardware、rocketstar、Jennifer/Zema、AMC、Spider Security、Business/Wallet、Governance/Release）に各一つのmanager profileを置く。一般利用者のtenant案件と資料・保存・許可を分け、profileから管理権限を得ることはない。担当siは必要時に呼ぶ論理責任者で、常時稼働process・独自credentialを増やさない。Zema内AMCは確認済みGoalを`milestone → work package → task → step`へ分ける。branchの上限はdepth5、1親12子、100node、初回候補8leaf。各専門siは一leafの成果と証拠を提出し、自分で受入済みにしない。

本人が「Goalを確認してZemaへ保存」して既存AMCへ渡す。readyなleafだけ別Cloud Agent jobへ結び、worker/reviewerを別delegationとして見積・予算・Broker証明・本人承認へ進める。Zema runtimeのone-shot送信、GetTask照合、CancelTask、結果不明保持、暗号化text artifact、署名済みusage receiptを使う。計画作成やGoal保存は外部送信・費用予約・Tool成功を意味しない。

短期計画は既存ZemaのsessionStorage（最大8session/24message/10分TTL）に置き、長期Goalはowner確認後のAMC。Jennifer専用の重複DB/長期memoryを作らない。default data accessはnone、本人が対象を指定する。COLOMBIAは上位contextの登録口で、原本/URL/版/hashは`awaiting-source`。内容を推測して適用せず、大学Columbiaとも同一にしない。

現行mainの[AMC API](../../app/api/amc/route.ts)と[型付き報告](../../lib/jennifer-execution-reports.ts)は、保存済みroot/plan/taskとA2A委任、暗号化artifact、usage Receiptを照合してTaskReportを生成する。reviewerはworkerのpredecessor委任、正確なworker report digest、全criteriaへ結び付け、`origin|Agent名|版`で構成するprincipalがworkerと同一なら拒否する。これはserver相関処理のsourceが存在するという意味で、実Providerの本人性・運用上の独立性・公開環境の一周は別受入である。Workbenchのowner手動判断、型付きremote検収、ownerの最終Goal受入を別々に示す。COLOMBIA等のcontext未受入を報告生成だけで解消しない。

失敗時は同じGoal/operation/delegationを読み直し、応答喪失を自動再送しない。componentの更新・期限・失効と予算を送信直前に再検査する。actorが変わった時に前の私有計画を表示しない。unknown schema/fieldと権限昇格を拒否する。

最初の参照SHA `d0151e89`はCI6成功/2失敗だったが、`89f869df`/`3349c247`で生成/依存/ZIPを修復し、PR #113 headの8checkとmerge後mainの7checkがそれぞれの同一SHAで全成功。これは公開/Provider/真正review受入ではない。残る合格条件は公開環境のowner別保存/再照合、実Providerでのworker/reviewer証拠相関、context選択、native同等UI、実Provider/D1/secret/trust/callbackの受入。担当はJennifer/Zema projectと既存Sky/AMC/Core/Security担当へ割り当てる。

## RockstarOS

共通runtimeの目的は、利用者が端末やProviderを変えても、自分の仕事・承認・成果・停止・復旧を失わないこと。入力は認証済み要求、component identity、有限capability、device capability、予算/承認。出力は実行状態、照合したreceipt、artifact、診断と復旧操作。

native OSは、署名済みimage・exact SKU・boot/保存/復旧が受け入れられた端末へ提供する。その他は既存OS上のclient/browserへ分岐する。Linux/QEMU、Android試験APK、Pixelの全OS imageは別profile。Local LLMは対応機種の能力で、ブラウザ利用の必須条件にしない。

保存はowner別の既存SQLite/D1と保護file、更新はcomponent identity・署名・互換性・保存schemaを検査する。失敗時は保存済み仕事の照合、互換versionへのrollback、受け入れたbackup経路を使う。未知schemaや全損を勝手に初期化して正常復旧としない。[native統合](../native-os-integration.md)、[native検証](../native-os-validation.md)、[Pixel Preview](../phone-preview-20260911.md)の各gateを維持する。

### Pixel専用OSとiOS機能追加の提供順

本人の2026-10-15指示でPixel 10 GL066 / frankelの独自OS統合を最初の物理商品とする。iOSはeSIM通信＋si利用権をaccountへ結び、client/Webと受入済みのApp Intents等で同じJob/Artifact/費用へ接続する後続経路。eSIMとclient/native権限を別状態にし、iOSをPixel経由の中継clientにしない。[多機種契約の保存・失敗・復旧・一次資料・IP01〜04](../device-support-architecture.md#pixel先行とiosへの機能追加)を参照。Pixel全OS/iOS native連携は未受入。

## avocadoMini

価値は、身体・手・日本語音声で遊び、作り、学び、暮らしへ広げる空間端末。現行R5は**使用時全高200mm以内の銀色円筒、1本自律、同型mini増設、設置中給電＋携帯電源（部品未選定）、別Edge Hub不要**。テレビ・スマホ・Pro・外部PC・インターネットを基本操作と保存の必須条件にしない。[R5正本](../avocado-mini-r5/README.md)と[統合基本設計](../avocado-mini-r5/package/integrated_design.md)を引き継ぐ。

建築一体型はR5 coreの任意設置profile。新築の計画時に建築士・設備設計者・施工者と天井内の設置位置、点検口、電源、熱、室内への展開/収納、撤去後の原状回復を協議する。天井の種類ごとにmounting kitを分けるが、Mini一台のlocal起動・入力・保存・停止を建物ネットワークやProへ依存させない。施工者と建物所有者は設置・設備の責任を持ち、居住者の私的な音声・映像・作品・Jobの閲覧権を得ない。住まいのToolや家電は対応hostのread/propose/act権限と本人承認を別に受け入れる。設計段階への参入は販路構想であり、契約済み物件や施工完了の証拠ではない。[設置profileと受入](../avocado-mini-r5/README.md#建築一体型miniの設置profile2026-10-14)を参照。

Miniはcloud accountなしのlocal guest/個人profileで起動・入力・遊び・保存・停止できる。cloud link、選択作品の同期/送信は別の強い本人確認と同意で結び、service期限切れやlink解除でもlocal作品と停止を保持する。

入力profileはsensor/pose/手/声、game interaction、本人切替。出力はscene/game状態、検査済みartifact、表示能力と安全状態。顔候補の識別を強い本人認証にせず、人別保存・切替・離席lockをOSへ結ぶ。sensor uncertainty・入力喪失・表示停止・熱・給電停止の時は安全な停止と保存へ進み、ゲームの操作をcloud支出へ変換しない。

裸眼で周囲の空間へ粒子が舞う表示は維持する研究目標だが、現行Display HALは`unavailable`。2D/AR等の研究profileで仕事や操作を検証しても、R5全空間表示の成立とは呼ばない。光学・精密3D入力・実部品収納・熱・回路・加工・製造と、実機の安全・性能は未受入。14件のR5算術検査を実機証拠へ転用しない。

通信optionの確定方針は**国内LTE、IoT data専用SIM、試作カード・量産chip、SGP.32対応SIM、遠隔profile切替を自作しない**。回線つき別model/optionと回線なしMiniを保持する。通信料は自社名義の機器service料に含める設計で、consumer eSIM販売の再開ではない。[Mini通信](../avocado-mini-cellular.md)と[data正本](../../data/avocado-mini-cellular.json)を使う。開発boardのbench試験はR5閉箱受入と分ける。含まれるLTE通信は自社cloudへの制御・Agent・音声のみ。OS/model更新・映像/streaming・game取得等の大容量転送はWi-Fiへ分け、LTEへの無断fallbackを行わない。

未決は光学方式、module/carrier、BOM・熱・電源・収納の統合。MAT系担当が候補比較と非金融prototypeを出し、OWNERが実機・調達条件を確定する。受入は同一実機の単独入力/停止/保存/再起動と、採用表示方式の測定、安全、通信option、製造工程を別々に記録する。

[着脱・衛星Wi-Fiと月次請求の統合](08-mini-connectivity-and-billing.md)で、可搬coreの電源、通信能力、場所権限と本人jobを分離し、実機/収納Providerの受入へ進む。

## avokadoPro

価値は、**NVIDIAのGPU/chipを使って作る高性能si PC**。2026-10-13の利用者補足を明記し、ローカルmodel推論・制作の性能を中心に、既存のPCゲーム要望も保持する。形状はMac mini風の小型据置PCを目指す。Miniなしで使え、Miniへ計算・保存・game能力を追加する接続は任意。[Pro P0設計](../avokado-pro-pc-design.md)と[data正本](../../data/avokado-pro-pc.json)は既にmainにある。

入力は本人のPC操作、対応game、有限のTool/compute要求。出力はPCの成果・保存・game体験と、許可済みMini接続の結果。ホスト管理者権限をMini/Androidへ移さず、外部Toolをplatform鍵で署名しない。ネットワーク断ではPCの基本利用と保存を保持し、Miniとの不明な結果を照合する。

2026-10-05の販売目標**80万円/台**を維持し、税・構成・販売条件は未決。旧88万円は履歴。RTX5080 Laptop 16GB、128GB RAM、4TB SSD等はP0候補で、調達・搭載・性能確定ではない。OEM/ODM、量産販売OS、統合BOM、値入りICD、QVL、収納、電力・騒音・熱、siとgame実測、原価とsupportは未受入。

MAT16/P2が統合候補・調達条件・閉箱受入matrixを出す。OWNERが見積と構成、販売OS等を決める。合格は同一構成で長時間siと代表game、保存/再起動/復旧、Mini任意接続を測ること。Miniの受入をPro固有の完成へ加算しない。

Pro private推論/制作、契約cloud Provider、Android公開/合成embedding lotのGridは別adapter。ProをGrid供給機やprivate原稿のGrid fallback先に自動登録しない。資源不足時は停止/照合し、違う送信先・価格には新しい同意を要する。

## rocketstar

価値は衛星輸送、両段の帰還・回収、同機番の再使用を目指す独立工学program。現行[rocketstar R1.0原本と全付録](../rocketstar-design/README.md)は44ページ・35章・60要求・18interface。原本、生成元、manifest/hashを保ち、今回のサービス設計で工学値を書き換えない。

OSの接続範囲は地上の計画、担当、engineering artifactの版、必要承認、観測、整備記録、費用と受入証拠。専用Gatewayで通信/観測結果をjobへ結ぶ。機上制御と独立飛行安全系は一般のAgent/Broker Toolと統合しない。対話・model plan・署名・通信到達を飛行の許可/実行成功へ変換しない。

A-LINK、衛星、地上設備、回収はrocketstar内部system。利用者通信と機体管制は経路・資格・容量を分ける。既存A-LINK v0.4はPC HTTP/SQLiteの模擬受信・経路切替・重複排除・再起動prototypeで、実無線・衛星・modem切替や本線OS統合の証拠ではない。

500kg×2等の比較仮定と算術監査は設計入力。製造BOM・加工図・飛行設定・製造手順、実機/飛行/回収/再使用、許認可は未成立。担当工学部隊が要求→interface→検証計画→試験記録を同機番/版で追跡し、OWNERと専門担当が各gateを判断する。サービスの完成やSky公開を飛行受入へ換算しない。

## 共有するものと機器で決めるもの

共有するものは本人、有限権限、job/step、Asset/provenance、revision、operation ID、結果不明照合、費用、更新/復旧。機器で決めるものは入力、表示、実行資源、物理作用、安全、回線、thermal、boot/driver、製造と保守。

新しいprofileは目的→利用体験→責任→入力/出力→状態→保存→失敗→復旧→承認→同一候補の合格条件→未決定の決め方を埋める。interfaceの名前だけを追加せず、[全設計台帳](../../data/design-document-index.json)と対応する詳細へ接続する。


<a id="mini-pro-purpose"></a>
## Miniは暮らし・まちづくり、ProはAI専用PC・半導体確保

2026-10-21の本人確定目的。Miniの価値は生活や空間で人の行動を支え、暮らしとまちづくりに貢献すること。Proの価値はAI専用PCとして仕事・制作・計算を支えることと、その製造・販売事業を通じて半導体や関連部品の継続的な確保につながる調達基盤を育てること。PCの需要把握・構成標準化・品質検証から供給元との調整へつなぐのは実施方針であり、供給枠や在庫を確保済みとはしない。半導体製造・独占供給・転売益を約束しない。

- **利用体験:** Miniは家庭での操作・連絡・創作、地域施設での案内・学び・遊び、住民が場の改善案を伝える入口を活用仮説とする。Proは利用者がAI用途から構成を選び、希望を伝え、実機検証と条件確認後に購入を判断する。Mini単独・Pro単独を維持し、Proを街全体の必須Hubにしない。
- **責任:** ROCKはUI、共通runtime、同意・権限、構成/希望受付、調達候補と証拠の整理。EXTERNALは施設管理、部品製造・供給・施工等の各事業者。OWNERは対象施設、用途、予算、購入・契約・公開範囲の決定。JOINTは住民・施設と現場受入、供給元と品質・供給条件の検収。
- **入出力・保存:** Miniは本人が明示した操作・質問・改善案から、案内や承認された操作/仕事/成果を返す。常時撮影・住民追跡・自動公開を前提にせず、個人profileと施設共有設定を分離する。現行サイトのアイデア受付は地域相談の実運用基盤ではない。Proは構成・任意の用途・購入希望から候補BOM/見積/調達計画を作る。現行受付は `pro_purchase_interests`、部品候補と未受入gateは `data/avocado-pro-sales-readiness.json` を使用し、会社内の供給契約・秘密条件をGitへ置かない。
- **状態:** Miniは活用仮説→対象場所/責任者合意→試作→同意/安全/機器適合確認→限定実証→評価。Pro調達は用途/需要→候補BOM→見積・供給確認→予算/契約承認→購入→納品/数量/真贋/互換/品質検収→在庫・供給実績照合。希望件数、見積、注文、入庫を同じ「確保」にしない。
- **失敗・復旧:** Miniは通信断や認識不成立時に停止し、手動操作/既存案内へ戻す。住民相談・緊急対応を未受入端末に依存させない。Proは欠品/価格変動/不適合時に保留して代替候補と見積を再提示し、本人再承認なしで発注・仕様変更しない。返品/取消・保証条件と在庫照合を個別に記録する。
- **承認・合格条件:** 今回の合格は正本・main・両公開サイトで目的が一致し、目的を実績と誤認させず既存受付・販売停止が維持されること。地域での有用性は操作成功率、使いやすさ、同意と削除、現場の改善結果を実証して判断。半導体確保は対象部品、数量、供給元確認、承認済み条件、納品/検収証拠で判断する。今回、施設導入・発注・供給契約・有料注文を実行しない。
- **未決定の決め方:** 地域の対象者/場所/優先課題は住民・管理者との合意と試験で選ぶ。部品の種類/必要量/予算/供給元は需要、候補BOM、実見積、適合/在庫/資金繰りの証拠で本人が決める。既存MAT15/MAT16とWEB13/WEB06を用い、新規機能や成果を架空に追加しない。
