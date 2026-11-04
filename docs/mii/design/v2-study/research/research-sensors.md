# 30cm 室内センサーユニット（1部屋4台）— 非装着センシングの実現可能性調査（2026-11 時点）

前提：ユニット約30cm、各部屋4台、居住者は何も身に着けない。価格は調べられた範囲での実売・参考価格（USD/EUR/GBP混在、税別・送料別）。見つからなかったものは「不明」。数量別価格は多くのベンダーが非公開（RFQ）であり、その場合は「不明（RFQ）」と記す。推定値は必ず「推定」と明記。

凡例（実現性）：**今日買える** = 市販モジュールで実装可 / **R&D** = 研究プロトタイプはあるが市販品・30cm箱への実装は開発が要る / **物理的に無理** = 原理上このユニット形態では成立しない

---

## 1. 離れた位置からの虹彩認証（Worldcoin Orb 的）

| 方式 | 距離・精度（実測の根拠） | 部品/製品と価格（1個・100・1000） | 実現性 | 出典URL |
|---|---|---|---|---|
| **EyeLock nano NXT**（屋内据置、NIR虹彩、ウォークスルー型） | 動作距離：公称「in-motion, at-a-distance」だが数値は公開資料に無し（屋外版 nano EXT は 16–30 inch = 40–76 cm）。処理能力 最大20人/分、照合2秒未満、最大1万人登録 | ディーラーMSRP **$1,650**（IPVM調べ）。100/1000個：不明（RFQ） | 今日買える（ただし至近距離・協力前提） | https://ipvm.com/reports/sri-s-1000-access-iris-reader , https://www.securityinfowatch.com/access-identity/biometrics/iris-recognition-solutions/product/12390529/eyelock-nanonxt-and-harrington-iris-authentication-solutions-from-eyelock , https://www.swiftlane.com/blog/eyelock-complete-guide/ |
| **Iris ID iCAM7S** | 虹彩取得距離 **28–38 cm**（iCAM7101S-B / 7111S-H1B）。寸法 178×211×64 mm（30cm箱に入る大きさ） | 旧 iCAM7000 系で約 **$3,000**（ディーラー）。100/1000：不明 | 今日買える（至近距離） | https://www.irisid.com/?p=11546 , https://ipvm.com/reports/sri-s-1000-access-iris-reader |
| **SRI / Princeton Identity IOM Access200**（IOM = Iris on the Move） | 0.25秒未満で歩行中に捕捉。距離は公表資料に数値無し（旧 SRI タブレット型は 8 inch ≒ 20 cm） | SRI タブレット型 $1,000（MSRP）。Access200 価格：不明（「affordable」のみ） | 今日買える（至近距離） | https://www.biometricupdate.com/201804/princeton-identitys-iom-access200-now-available-worldwide , https://ipvm.com/reports/sri-s-1000-access-iris-reader |
| **Worldcoin / World Orb**（オープンソース設計） | 距離は「腕の長さ以内（arm's length）」で位置合わせが容易と記載＝おおむね 30 cm 前後。構成：広角カメラ（NN で両眼位置推定）＋2Dジンバル駆動の約5°望遠カメラ＋**液体レンズ ms オートフォーカス**＋グローバルシャッター、NIR 照明 **740/850/940 nm パルス、LED 79個**、NIR広角カメラ・3D ToF・サーマルカメラ（なりすまし防止）、Jetson Xavier NX。 | 1台のBOM/販売価格：不明（非売品。Jabil 委託生産）。Orb Mini（2025-05、スマホ型）仕様・価格：不明 | R&D（設計はGitHubで公開＝複製は技術的に可能だが、距離は腕の長さ） | https://worlddao.gitbook.io/worlddao-white-paper/technical-implementation/the-orb , https://www.biometricupdate.com/202301/worldcoin-shares-details-of-open-source-iris-biometrics-scanning-orb , https://www.github.com/worldcoin/orb-hardware , https://www.biometricupdate.com/202507/worlds-latest-phone-sized-updates-throw-doubt-on-future-of-big-shiny-orb |
| **CMU 長距離虹彩（Savvides）** | **6–12 m** で歩行者の両虹彩＋顔を取得（2015年デモ、車のバックミラー越し等）。精度の数値は未公表。特許あり、商用化報告なし | 価格：不明（非売品） | R&D（10年前のデモから製品化されていない） | https://nextgov.com/emerging-tech/2015/05/long-range-iris-scanning-here/112672 |
| **CASIA（Zhenan Sun）長距離虹彩** | 2009年：3 m 静止・1人（PTZ、捕捉体積約 0.15×0.15×0.1 m）。2021年プロトタイプ：**1–10 m、複数人（≥3）、歩行 1 m/s** 対応。比較表に SRI 25 m、Eagle-Eyes 3–6 m、商用 IriStar S200P / Irisian 1–2 m。2024–25年の新しい進展は同スライドに無し | 不明（研究機） | R&D | https://www.comp.hkbu.edu.hk/wsb2025/slides/Zhenan_Sun.pdf |
| 物理的な制約（計算） | 虹彩直径約12 mm に ISO 推奨の ≥150 px 程度 → **約 0.08 mm/px**。2 m なら角度分解能 40 µrad → 2.4 µm 画素で焦点距離 ≈ 60 mm、横FOVは約 32 cm しかない → **パン・チルト（ジンバル）＋オートフォーカス必須**、被写界深度は数 cm。NIR 照明は 1/r² で 2 m では 30 cm 時の約40倍の放射が要り、IEC 62471 の眼安全上限と衝突。商用機が 25–40 cm に留まる理由がこれ | — | 1–4 m・非協力は R&D | （上記サーベイ）https://www.datalearner.com/academic/journal-papers/0031-3203/volumes-and-issues/451/paper-detail/23439 |

**結論**：虹彩は 2026 年でも「市販品＝30–40 cm で立ち止まって覗き込む」。1–10 m は CMU/CASIA の研究機のみで、30cm ユニットに入れるにはジンバル望遠＋液体レンズ＋高出力NIRを自作する必要がある（Orb 設計を2–4 m向けに再設計するに等しい）。家庭内の「誰か」を見分けるだけなら §5 の NIR 顔認識で代替するのが現実的。

---

## 2. 非接触の心拍・呼吸

| 方式 | 距離・精度（実測の根拠） | 部品/製品と価格（1個・100・1000） | 実現性 | 出典URL |
|---|---|---|---|---|
| **rPPG（RGBカメラ、顔の色変化）** | 監視カメラ実験（ECG 基準、150 lux）：**0–3.2 m で精度 >99.99%、4–4.8 m で >97%、5.6 m 以上で 90%**。照度は約 100 lux 以上で飽和、32 lux で 96.7%。CHROM 法で中照度 MAE ≈ **1.04 bpm**。ただし 2025-12 の npj Digital Medicine（Bielefeld）：**心拍が上がると精度が急落**、遠隔医療に使えない方法もある。静止・正面顔が前提。暗所（<30 lux）・横顔・歩行中は不可 | 普通の RGB カメラ（例：Raspberry Pi Camera Module 3 ≈ $25、IMX系）＋計算（PhysNet等）。1/100/1000：数十ドル規模（カメラ依存、不明） | 今日買える（静止・明所・正面のみ信頼） | https://www.biorxiv.org/content/10.1101/2021.05.13.443967.full.pdf , https://arxiv.org/abs/2107.13193v2 , https://aktuell.uni-bielefeld.de/2025/12/09/contactless-pulse-measurement-falters-at-high-heart-rates/?lang=en |
| **TI 60 GHz mmWave（IWR6843 Vital Signs Lab）** | TI 公式回答：**最大約 1 m、1人のみ**（2人まで拡張可、それ以上はメモリ/MIPS 不足）。精度数値は TI 非公表 | IWR6843AOPEVM **$150**（1個）、$147（1000）。IWR6843AOP チップ単価：不明（TI サイト在庫切れ・価格非表示） | 今日買える（1 m・1人） | https://e2e.ti.com/support/sensors-group/sensors/f/sensors-forum/914201/ccs-iwr6843-how-many-people-and-how-far-can-measure-vital-signs-with-iwr6843-es2-0 , https://e2e.ti.com/support/sensors-group/sensors/f/sensors-forum/1397078/iwr6843aopevm-vital-signs-multiple-person-detection , https://ichome.com/product-detail/texas-instruments/iwr6843aopevm |
| **Infineon BGT60TR13C（60 GHz, 1TX3RX）** | ベンダーは「心拍・呼吸のサブ mm 動きを検出」と記載。精度・距離の公式数値：不明。Sleepiz 等が睡眠時（静止）用途で商用化 | チップ参考価格 **$18.60（1）/ $16.55（100）/ $15.62（1000）**（Cytech 参考値、要RFQ）。DEMO BGT60TR13C ボード価格：不明 | 今日買える（静止者向け） | https://www.cytechsystems.com.cn/de/product/bgt60tr13cswxuma1 , https://www.sensortips.com/featured/can-60-ghz-radar-sensing-change-healthcare-monitoring/ |
| **Seeed MR60BHA2（60 GHz 呼吸・心拍モジュール）** | 心拍検出 **最大 1.5 m**、精度数値なし（マーケ文言のみ） | **£28.80**（1個、PiHut）。100/1000：不明 | 今日買える（1.5 m・1人） | https://thepihut.com/products/60ghz-mmwave-breathing-and-heartbeat-detection-sensor-mr60bha2 |
| **DFRobot C1001（60 GHz 転倒・在室・バイタル）** | 呼吸・心拍 **0.4–1.5 m**（胸部）、睡眠 0.4–2.5 m、在室/転倒 最大 11 m（天井 2.7 m）。心拍レンジ 60–100 bpm のみ。精度数値なし、医療機器でない | **A$46.36**（≈US$30、1個）、A$44.05（20+）。1000：不明 | 今日買える | https://core-electronics.com.au/c1001-60ghz-mmwave-fall-detection-sensor-arduino-esp32-microbit.html.plain.md |
| **研究レベル 77 GHz MIMO（IWR1642, 2 TX/4 RX）複数人** | **0.5–5 m、同時 3 人**、呼吸数誤差平均 **2.06%**、心拍誤差平均 **6.57%（最悪 12.95% ≒ 14 bpm）**、観測窓 25.6 秒、距離が伸びると SNR 低下で精度低下 | IWR1642BOOST EVM ≈ $300 前後（不明・参考）＋DCA1000 | R&D（アルゴリズムは論文公開、製品化は自前） | https://arxiv.org/pdf/2511.21255 |
| **Novelda UWB（X4M200 呼吸）** | 呼吸モニタ範囲 **0.4–5.0 m**、<1 mm の動きを検出。心拍は公式には呼吸のみ | X4M200/X4M300 **$80（1000個時）**（2016年当時の発表値）。X7F202 開発キット（Digikey 掲載）価格：不明 | 今日買える（呼吸のみ） | https://www.eejournal.com/industry_news/extreme-sensitivity-occupancy-and-non-contact-respiration-sensors-benefit-from-noveldas-latest-x4-uwb-radar-soc/ , https://azcus.digikey.com/en/products/detail/novelda/X7F202-Development-Kit/25558545 |
| **Vayyar Care（60 GHz, 4D イメージング）** | 転倒検知・在室が主用途。バイタル精度：公表値不明。B2C は Amazon Alexa 連携製品 | 価格：不明（B2B は RFQ） | 今日買える（転倒・在室） | https://vayyar.com/care-docs/b2c/ |

**結論**：呼吸は mmWave/UWB で 1–5 m・静止者なら実用。心拍は 2026 年時点で「**1–1.5 m、1人、静止**」が市販品の限界。rPPG は明所・正面・静止で 3 m まで良好だが、運動後・暗所・歩行中は破綻。「部屋にいる人全員の心拍を常時」は複数人分離（MIMO ビームフォーミング）が研究段階で、4台配置で死角を減らしても 1 台あたり 1–2 人・数 m が現実。

---

## 3. 体温（LWIR）

| 方式 | 距離・精度（実測の根拠） | 部品/製品と価格（1個・100・1000） | 実現性 | 出典URL |
|---|---|---|---|---|
| **FLIR Lepton 3.5（160×120, ラジオメトリ）** | 公称精度 **±5 °C または 5%（高ゲイン）**、NETD <50 mK、HFOV 57° → **IFOV 6.2 mrad ＝ 1 m で 6 mm/px、3 m で 19 mm/px**。発熱スクリーニングで信頼できる内眼角（約1 cm）は 1 m でも 1–2 px → 測定点として成立しない。黒体参照なしでは ±5 °C | **$172**（GroupGets, 1個）。Digikey 500-0771-01 価格：不明（ページ非表示）。100/1000：不明（RFQ） | 今日買える（人検出・顔の相対温度はOK、絶対体温は不可） | https://groupgets.com/products/flir-lepton-3-5 |
| **FLIR Boson+ 320 ラジオメトリ（320×256）** | 公称 **±5 °C or 5%**。 | **$2,029**（1個、GroupGets）。100/1000：不明 | 今日買える | https://groupgets.com/products/flir-boson-321 |
| **FLIR Boson 640 ラジオメトリ（640×512）** | 公称 **±5 °C or 5%**。24° レンズで IFOV 0.65 mrad → 1 m で 0.65 mm/px、3 m で 2 mm/px。Sensors 2021 の推奨（均一 10×10 px を確保、中央 3×3 のみ使用）を内眼角 1 cm に当てると **約 1–1.5 m が上限** | **$4,572**（1個）。100/1000：不明 | 今日買える（高価、箱に入るサイズ） | https://groupgets.com/products/radiometric-flir-boson-640 , https://mdpi.com/1424-8220/21/2/607 |
| **Seek Thermal Mosaic Core（320×240 / 200×150、FOV 15–105°、−40〜330 °C）** | ラジオメトリ精度：不明（スペックシート未取得） | S312NPX / S319SPX Digikey 掲載、価格：不明（ページ非表示） | 今日買える | https://www.eenewseurope.com/en/thermal-camera-cores-expanded-to-53-offerings , https://www.digikey.ca/en/products/detail/seek-thermal/S312NPX/14267526 |
| **InfiRay Tiny1-C（256×192, 中国製）** | 販売店記載：産業 ±2 °C/2%、**「生体 ±0.5 °C」**（ベンダー主張、第三者検証なし）。NETD <50 mK | **$288.89**（1個、小売）。100/1000：不明 | 今日買える（精度主張は未検証） | https://rcdrone.top/ja/products/new-tiny1-c-25hz-mini-thermal-imager-256-192-resolution-lwir-uncooled-vox-thermal-imager-sensor-module-ja |
| **HikMicro OEM コア（256×192 等）** | 価格・精度：不明（調査範囲で一次情報なし） | 不明 | 今日買える | https://www.thermobeeldcamera.nl/en/tags/hikmicro |
| **Melexis MLX90640（32×24 サーモパイル）** | 公称 **±1 °C**（対象温度、全レンジ典型）、NETD 0.1 K @1 Hz、FOV 55°×35° または 110°×75°。**IFOV ≈ 30 mrad ＝ 1 m で 3 cm/px** → 顔全体が 3–5 px。内眼角は不可能、「顔の平均表面温」のみ | **$66.19**（1個、ICHome）。Digikey/Mouser 価格：ページ非表示で不明。1000：不明（推定 $35–45、未確認） | 今日買える（在室・大まかな表面温） | https://www.melexis.com/-/media/files/documents/product-flyers/mlx90640-product-flyer-melexis.pdf , https://ichome.com/product-detail/melexis/mlx90640esf-bab-000-tu |
| **Melexis MLX90641（16×12）** / **Heimann HTPA 32×32d** | 精度・価格：不明（MLX90641 は 90640 より低解像、Heimann は RFQ） | 不明 | 今日買える | https://www.digikey.com.au/en/product-highlight/m/melexis/mlx90641-high-temperature-infrared-thermal-sensor-array , https://azimp.ru/upload/pdf-static/Heimann%20Sensor/matrix/Overview-HTPA32x32d_Rev3.pdf |
| **臨床的妥当性（装置に依らない）** | Sci. Rep. 2021：3 社の発熱スクリーニング IRT（**1.5 m**、黒体あり/なし）と口腔温の相関は **ρ = 0.33–0.49（弱）**、平均差 +0.26 〜 −1.90 °C、30 秒内の再測定ばらつき ±0.34–0.38 °C（公称 ±0.3 °C を超える）。英 MHRA / NPL：皮膚温→深部体温推定は「厳密に管理された条件でなければ」信頼できない、動く対象は更に困難、IEC 80601-2-59 は内眼角を規定 | — | **深部体温の非接触測定は R&D 以下（スクリーニング用途でも弱相関）** | https://link.springer.com/10.1038/s41598-021-91361-6 , https://www.npl.co.uk/getattachment/products-services/Temperature/clinical-thermometer/MHRA-CCT-TG-on-Body-Temperature-measurement-v1.pdf.aspx?lang=en-GB |

**結論**：30cm ユニットに LWIR は入る（Lepton なら $172、Boson 640 なら $4.6k）。しかし「体温」としての絶対値は、内眼角を 10×10 px で捉えられる 1–1.5 m（Boson 640 級）＋黒体参照＋静止、でも口腔温との相関は弱い。現実的な出力は「**その人の平常時との相対差（日内トレンド）**」で、発熱の絶対判定は謳えない。

---

## 4. 歩容（gait）・振戦など行動バイオメトリクス

| 方式 | 距離・精度（実測の根拠） | 部品/製品と価格 | 実現性 | 出典URL |
|---|---|---|---|---|
| **カメラ歩容認識（シルエット/骨格, 深層学習）** | 実験室 CASIA-B（124人）Rank-1 **95.5%**（GaitRDAE, 2025）。屋外「in the wild」ベンチマーク：**GREW 78.6%、Gait3D 73.6%**（同論文、公開SOTA級）。服装・荷物・視点変化で大きく落ちる。家庭内 2–6 人のクローズドセットなら登録学習で実用的だが、認証（本人確認）ではなく「推定」 | 普通の RGB/NIR カメラ＋エッジ GPU（Jetson Orin Nano ≈ $249、不明・参考） | 今日買える（識別＝ソフトバイオメトリクス、認証不可） | https://arxiv.org/pdf/2510.16541 , https://arxiv.org/pdf/2205.02692 |
| **mmWave レーダー歩容識別（mID, IWR1443）** | 12 人で **89%**、**6 人以下で約 95%**、追跡距離 >5.5 m（設定最大 5 m）、追跡誤差中央値 0.16 m。窓などの反射で偽検出、人数増で精度低下 | IWR1443BOOST ≈ $300 前後（不明・参考）、量産チップ：不明 | R&D〜今日買える（家庭の少人数なら実装可） | https://www.cs.ox.ac.uk/files/10889/%5BDCOSS19%5DmID.pdf |
| **mmWave Wi-Fi 歩容識別** | 論文あり（精度は環境依存、詳細未確認） | — | R&D | https://aitopics.org/doc/arxivorg:EDFC9589 |
| **振戦（Parkinson/本態性）の非接触評価（Tremerity-Fi, 2026）** | 市販 mmWave レーダーで振戦検出 **94.51%**、重症度評価 **89.13%**、患者 5 名＋健常 25 名、オフィス/自宅/病院。距離：不明 | 市販 mmWave（機種非公開） | R&D（臨床検証は小規模） | https://arxiv.org/abs/2607.10258 |

**結論**：歩容は「家族の誰か」を 90%台で当てる補助識別には使える（カメラでもレーダーでも）。鍵の代わり（認証）には使えない。振戦・歩行速度・立ち上がり時間などの**健康モニタリング指標**としては mmWave/深度カメラで現実的で、ユニットの価値はこちらにある。

---

## 5. NIR 顔認識（1–4 m）とプライバシー法

| 方式 | 距離・精度（実測の根拠） | 部品/製品と価格 | 実現性 | 出典URL |
|---|---|---|---|---|
| **NIR 顔認識（暗所対応）** | 2025 年研究（10 名、4–20 m の 5 距離）：**近距離（4 m）約 93% → 20 m で 55%**、全体 80%（InceptionResNetV2 + Triplet）。1–4 m で 940 nm 照明＋5–8 MP カメラなら、家庭内 5 人程度のクローズドセットでは実用的（照度不要・暗所で動作） | NIR 対応カメラ（例：IMX462/IMX678 系モジュール $30–80、不明・参考）＋940 nm LED＋エッジ推論 | 今日買える | https://www.scitepress.org/PublishedPapers/2025/142692 |
| **可視光顔認識（NIST FRTE 1:1）** | 高品質画像では上位アルゴリズムの FNMR は 0.1%台（FMR 1e-6）。遠距離・低照度・横顔では劣化（FRTE は主に ID 写真/マグショット） | — | 今日買える | https://pages.nist.gov/frvt/html/frvt11.html |
| **日本・個人情報保護法** | 顔・虹彩の特徴量は**個人識別符号**（施行令1条1号ロ・ハ）＝個人情報。PPC Q&A 1-14：顔識別機能付きカメラは「防犯」だけでなく**顔識別を行うこと自体を利用目的に特定し通知・公表**（「取得状況から明らか」例外は不適用）、入口・カメラ位置に運営者名・目的・問合せ先・URL/QR 掲示を推奨。健康情報（病歴・診療情報）は**要配慮個人情報**で原則本人同意、オプトアウト第三者提供不可、1件でも漏えいで PPC 報告義務。注意：法の義務主体は「個人情報取扱事業者」。自宅で自分と家族のために使う純粋な私的利用は対象外だが、**ノエルの会社が製品/サービスとして提供するなら事業者として全義務を負う**（来客の顔・虹彩・心拍・体温＝同意と目的公表が必要） | — | 法的要件（設計に組み込む） | https://www.ppc.go.jp/all_faq_index/faq1-q1-14_ , https://www.businesslawyers.jp/practices/274 , https://www.ppc.go.jp/personalinfo/camerakentoukai/20230314 |
| **米国イリノイ BIPA** | 対象：網膜/虹彩スキャン、指紋、声紋、手・顔の形状。**取得前に書面（電子署名可）の同意と目的・保存期間の通知**が必要。損害賠償 **$1,000（過失）/ $5,000（故意・重過失）/違反**＋弁護士費用、私訴権あり。2024-08-02 改正（SB 2979）で「**1人につき1違反**」に限定（以前はスキャンごと）。遡及適用は未確定。他州（TX, WA）も類似法、CA CPRA も生体情報を機微情報扱い | — | 法的要件 | https://www.alston.com/en/insights/publications/2024/08/law-limits-damages-information-privacy-act |

---

## 6. OPM-MEG による「思考の読み取り」

| 方式 | 距離・精度（実測の根拠） | 部品/製品と価格 | 実現性 | 出典URL |
|---|---|---|---|---|
| **QuSpin QZFM Gen-3（SERF 型 OPM）** | 感度 **<15 fT/√Hz（典型 7–10 fT/√Hz）**、3軸型 <23 fT/√Hz。**ダイナミックレンジ ±5 nT**、動作には**背景磁場 ≤ 約 50 nT** が必須＝「磁気シールド室または能動的磁場制御環境向け」と明記。地磁気 **50 µT** の中では**動作しない**（1000 倍以上の減衰が要る）。センサーヘッド 12.4×16.6×24.4 mm、蒸気セルは頭皮から 6.5 mm | **$10,000（1–3個）/ $8,500（4–7）/ $8,000（8–15）/ $7,700（16–32）**、3軸 +$1,250/個、それ以上は見積 | 今日買える（がシールド室が前提） | https://quspin.com/products-qzfm/ |
| **小型磁気シールド室（QuSpin × MSL）** | 内寸 **1.3×1.3×2 m**、シールド係数 903（0.01 Hz）〜7,500（10 Hz）、脱磁後残留磁場 **<3 nT**。従来の SQUID-MEG 用 MSR は約 $1M | **約 $150,000**（1室） | 今日買える（部屋サイズ、30cm 箱には入らない） | https://quspin.com/a-small-low-cost-magnetically-shielded-room |
| **商用 OPM-MEG システム（Cerca Magnetics 等）** | 13ch プロトタイプ → 50ch 全頭システム。ヘルメット装着型＝**「何も着けない」要件と矛盾** | **GBP 375k 〜 1.5M**（基本〜上級）。従来 MEG >GBP 2M、運用費 GBP 150k/年。FieldLine HEDscan 価格：不明 | 今日買える（装着・シールド室必須） | https://results2021.ref.ac.uk/impact/13becdf3-a76b-4a88-b7d1-3cb64c55ddcd/pdf , https://www.newswire.com/news/fieldline-launches-hedscan-a-next-generation-device-for-non-invasive-21405607 |
| **非シールド動作の研究（全磁場型原子グラジオメータ, Limes 2020）** | 地磁気 51.4 µT 中で MEG 信号を検出。ノイズ **15.7 fT/cm√Hz（非シールド）**。ただしセンサーは**頭皮から 1.2 cm**、聴覚誘発反応の加算平均、50/60 Hz 電源線（75 m 先）と鉄道 25 Hz が最大の妨害、「通常の実験室・病院環境にはグラジオメータ・アレイが必要」と著者ら。脳磁場は地磁気の約 1 億分の 1 | 研究機（非売品） | R&D | https://arxiv.org/pdf/2001.03534v1 |
| **物理（10 cm 離れた非装着センサー）** | 脳磁場は頭皮直近で約 50–500 fT（≈ 地磁気の 10⁻⁸〜10⁻⁹）。皮質源（深さ約 3–4 cm）から頭皮 1 cm のセンサーまで ≈ 4–5 cm。これを 10 cm 離すと源–センサー距離 ≈ 14 cm → 電流双極子近似で 1/r² なら **約 1/10**、高次成分 1/r³ なら **約 1/40** → 数 fT 〜 十数 fT。QZFM の雑音 7–15 fT/√Hz と同程度以下で、1 Hz 帯域でも SNR ≈ 1 未満、単一試行の復号は不可能。しかも家庭環境のノイズ（家電・配線・車の通過）は nT〜µT 級＝信号の **10⁴〜10⁹ 倍**。頭の動き・位置も毎回変わる（装着型は固定で解く） | — | **物理的に無理**（非装着・非シールド・10 cm・家庭） | https://quspin.com/products-qzfm/ , https://www.frontiersin.org/journals/medical-technology/articles/10.3389/fmedt.2025.1515548/full |
| **実際に何が復号できているか：MEG（Meta Brain2Qwerty, 2025）** | 306ch MEGIN（SQUID、シールド室）、35 名、**タイピング中の文字**を文単位・オフラインで復号、**文字誤り率 MEG 32%（最良 19%、最悪 45%）、EEG 67%**。被験者ごとに約 1 時間/セッション×複数、GPU 12 時間学習。**キー入力のタイミングと正解が教師として必要**、リアルタイム不可、ウェアラブルでない、閉じ込め患者には不適と著者ら明記 | — | R&D（「思考」ではなく「打鍵運動」の復号） | https://arxiv.org/pdf/2502.17480 |
| **fMRI 意味復号（Tang & Huth 2023, Nat. Neurosci.）** | 3 名、各 **16 時間**の fMRI 訓練データ、聞いた物語の**要旨**（gist）を言い換えとして再構成、正確な語の再現は稀。**他人への転移不可（個人別モデル）**、本人の協力が必須、別のことを考えれば（動物名を列挙など）**復号を阻止できる**、fMRI は非可搬 | — | R&D（可搬性ゼロ、協力必須） | https://www.nih.gov/news-events/nih-research-matters/brain-decoder-turns-persons-brain-activity-into-words |

**結論**：OPM センサーそのものは $7,700–10,000/個で買える。だが（1）地磁気の中で動かない（±5 nT レンジ）、（2）頭皮に密着させた装着型＋シールド室（$150k〜）＋個人別に何時間も訓練、で**ようやく「打鍵文字 68%」「聞いた物語の要旨」**。10 cm 離れた非装着・非シールド・家庭環境では信号が雑音床の下に沈み、**2026 年の物理では不可能**。「頭の近くの磁場から思考を読む」は 30cm ユニットの要件から外すべき。

---

## 7. 人数カウント・在室検知

| 方式 | 距離・精度（実測の根拠） | 部品/製品と価格 | 実現性 | 出典URL |
|---|---|---|---|---|
| **Terabee People Counting / Flow M（ToF、ドア上）** | 入退計数精度 **95%**、設置高 2.3–3.0 m、幅 90 cm のドア（1人ずつ通過前提）、FOV 15°、カメラ無し（画像を撮らない＝プライバシー有利） | 価格：不明（Mouser 取扱、サブスク無し） | 今日買える | https://terabee.com/wp-content/uploads/2025/02/EN-Flow-M-Specification-Sheet-Terabee-2025.pdf |
| **60 GHz mmWave 在室・人数（DFRobot C1001 / Seeed / Infineon 入口カウンタ）** | C1001：在室 最大 11 m、天井 2.7 m で転倒も。人数カウント精度：不明（ベンダー数値なし）。Infineon Smart Entrance Counter（BGT60TR13C ベース）精度：ページ取得不可で不明 | C1001 ≈ US$30、BGT60TR13C $15.6（1000） | 今日買える（在室・大まかな人数） | https://core-electronics.com.au/c1001-60ghz-mmwave-fall-detection-sensor-arduino-esp32-microbit.html.plain.md , https://infineon.com/cms/en/product/promopages/smart_entrance_counter_solution |
| **Novelda X4M300 UWB 在室** | 最大 10 m（断面 0.1 m² の対象） | $80（1000個、2016 発表値）。X7 系：不明 | 今日買える | https://www.eejournal.com/industry_news/extreme-sensitivity-occupancy-and-non-contact-respiration-sensors-benefit-from-noveldas-latest-x4-uwb-radar-soc/ |
| **カメラ人数カウント（YOLO 系 + エッジ）** | 室内俯瞰で人検出 mAP は高いが、遮蔽・密集で誤差。精度は配置依存（数値：不明） | RGB/深度カメラ＋Jetson/NPU | 今日買える | — |
| **Milesight VS351（PIR/ToF 人流）** | 精度：不明（データシート未取得） | 不明 | 今日買える | https://resource.milesight.com/milesight/iot/document/vs351-datasheet-en.pdf |

---

## 8. その他の非接触センサー

| 方式 | 距離・精度 | 部品/製品と価格（1・100・1000） | 実現性 | 出典URL |
|---|---|---|---|---|
| **UWB レーダー（Novelda X4 / X7）** | X4：在室 10 m、呼吸 0.4–5 m、<1 mm 動き。X7：車室内着座検知向けに拡張（2024–25）。価格 1000個時 $80（X4 モジュール、2016 値）；X7 モジュール/開発キット：不明 | 上記 | 今日買える | https://www.eenewseurope.com/en/seat-occupancy-detection-added-to-novelda-uwb-in-cabin-sensor , https://azcus.digikey.com/en/products/detail/novelda/X7F202-Development-Kit/25558545 |
| **Acconeer XM125（A121, 60 GHz PCR）** | 在室・距離・呼吸デモあり。価格：不明（Digikey ページ非表示） | 不明 | 今日買える | https://www.digikey.com/en/products/detail/acconeer-ab/XM125/17883267 |
| **ToF 深度：Orbbec Femto Mega / Bolt（iToF, 1024×1024, 0.25–5.5 m, FOV 120°）** | Azure Kinect 後継（Microsoft 協業）。骨格推定・歩容・転倒に向く | Femto Mega **$868.75**、Femto Bolt：見積（不明）。Gemini 335（ステレオ, 0.15–5 m）**$330** | 今日買える | https://www.roboticscenter.ai/blog/best-depth-cameras-robotics , https://www.hackster.io/news/orbbec-partners-with-microsoft-on-new-indirect-time-of-flight-depth-sensing-camera-models-f1f5576e361d |
| **Intel RealSense（2026 状況）** | **2025-07-11 に Intel から分離独立**（RealSense Inc.、Series A $50M：Intel Capital・MediaTek）、既存製品サポート継続、新製品 D555（PoE、Vision SoC V5）。D435i **$550**、D455 **$650**（0.2–6 m、アクティブ IR ステレオ）。供給継続リスクは低下したが、長期ロードマップは要確認 | 上記 | 今日買える | https://www.tomshardware.com/tech-industry/realsense-completes-spin-out-from-intel-gets-usd50-million-in-funding-from-intel-capital-and-mediatek |
| **CO₂：Sensirion SCD41（光音響 NDIR, 400–5000 ppm, ±(40 ppm+5%)）** | 在室人数推定（CO₂ 上昇率）・換気の指標に使える | **€18.40（1）/ €14.60（100）/ €13.60（600+）**（SOS electronic, 税別） | 今日買える | https://www.soselectronic.com/en-us/products/sensirion/scd41-d-r2-347342 |
| **環境光／UV：LTR-390UV、TSL2591、AS7331** | 照度・UV インデックス。rPPG の照度判定（≥100 lux か）にも使う | LTR-390 ブレークアウト（Adafruit 4831）約 $4.5、チップ単価：不明（推定 $1–2）。TSL2591・AS7331 チップ価格：不明 | 今日買える | https://www.digikey.sg/en/products/detail/adafruit-industries-llc/4831/13619756 |

---

## 30cm ユニットに今入れられるセンサー一覧（確信度付き）

確信度：◎ = 市販品・実測根拠あり / ○ = 市販品だが精度条件が狭い / △ = 入るが出力の信頼性は限定的

| # | センサー | 得られるもの | 条件・限界 | 目安コスト/台 | 確信度 |
|---|---|---|---|---|---|
| 1 | 60 GHz mmWave（BGT60TR13C or IWR6843AOP） | 在室・人数（概算）・位置追跡 5 m・転倒・呼吸 1–5 m・心拍 1–1.5 m（1人）・歩容/振戦指標 | 心拍は 1人・静止・1.5 m 以内。4 台で死角を補うが複数人心拍は R&D | $16–150 | 呼吸◎ 心拍○ 歩容△ |
| 2 | UWB（Novelda X4/X7）※1 と択一か併用 | 在室 10 m、呼吸 0.4–5 m | 心拍は非対応 | $80（1k） | ◎ |
| 3 | RGB カメラ（5–8 MP）＋ 940 nm NIR 照明 | 顔認識 1–4 m（家庭内クローズドセット）、人数カウント、rPPG 心拍（明所・静止・≤3 m）、歩容識別（補助） | 暗所の rPPG 不可、運動後の心拍不可、顔認識は 4 m 93%（研究値） | $30–100 ＋推論 SoC | 顔○ 人数◎ rPPG○ 歩容△ |
| 4 | ToF 深度（Orbbec Femto / Gemini 335） | 骨格・歩行速度・転倒・人数（遮蔽に強い） | 0.25–5.5 m | $330–870 | ◎ |
| 5 | LWIR（Lepton 3.5 / Boson 320–640 / MLX90640） | 暗所の人検出、顔表面温の**相対変化**（本人の平常比） | 絶対体温は不可（±5 °C 公称、口腔温との相関 ρ<0.5）。内眼角測定は Boson 640 で ≤1.5 m | $66（MLX）/ $172（Lepton）/ $2–4.6k（Boson） | 人検出◎ 体温△ |
| 6 | CO₂（SCD41）＋温湿度 | 換気・在室人数の裏付け | — | €14–18 | ◎ |
| 7 | 環境光/UV（LTR-390 等） | 照度（rPPG 可否判定）、UV | — | $1–5 | ◎ |
| 8 | 虹彩カメラ（EyeLock/Iris ID 級モジュール、または Orb 設計の流用） | **ユニットの前 30–40 cm で覗き込んだ時だけ**虹彩認証 | 離れた位置からは不可。4 台のうち出入口の 1 台に載せる形なら実用 | $1,650–3,000（完成品） | ○（至近のみ） |
| 9 | エッジ推論 SoC（Jetson Orin Nano 級） | 上記の顔・歩容・rPPG・人数をローカル処理（画像をクラウドに出さない＝法令対応上も重要） | 発熱・電源 | ≈ $250（不明・参考） | ◎ |

## 入れられない・別装置が要るもの

| 要件 | 判定 | 理由 | 代替 |
|---|---|---|---|
| **1–4 m 離れた非協力者の虹彩認証** | R&D（30cm 箱では別途開発） | 市販品は 25–40 cm。ISO 画質（≥150 px/虹彩）を 2 m で得るには 60 mm 級望遠＋ジンバル＋液体レンズ AF＋高出力 NIR（眼安全限界）。CMU 12 m・CASIA 10 m は研究機で 2015/2021 以降製品化なし | 出入口ユニット 1 台に至近虹彩（覗き込み）＋他は NIR 顔認識＋歩容で補助識別 |
| **部屋にいる全員の心拍を常時** | R&D | 市販レーダーは 1–1.5 m・1 人。複数人 MIMO 分離は論文段階（3 人・5 m・HR 誤差 6.6%） | 呼吸は全員分可。心拍は「ソファ/ベッド前の 1 台で 1 人」設計 |
| **絶対体温（発熱判定）** | 別装置（接触/耳式体温計）か、△ の相対指標に留める | 内眼角 1 cm を 10×10 px で捉える距離が Boson 640 でも ≤1.5 m、黒体参照が要り、それでも口腔温と弱相関（ρ 0.33–0.49）。MHRA は診断主張を禁止 | 本人の平常時顔表面温との差分トレンド |
| **運動直後・暗所・歩行中の rPPG 心拍** | 無理（方式の限界） | 高心拍で精度急落（2025）、<30 lux で破綻 | レーダー心拍（静止後） |
| **OPM-MEG による思考読み取り（非装着・10 cm・非シールド）** | **物理的に無理** | 脳磁場 50–500 fT ≪ 地磁気 50 µT（10⁸ 倍差）。QZFM は ±5 nT レンジ・背景 ≤50 nT 必須＝シールド室（$150k〜、1.3×1.3×2 m）。10 cm 離すと信号 1/10〜1/40 で雑音床以下。装着＋シールド＋個人別訓練でも復号は「打鍵文字 CER 32%」「要旨」まで、協力必須・阻止可能 | ユニットの要件から外す。将来の BCI は装着型ヘルメット＋別室（シールド）設計 |
| **歩容による「認証」（鍵代わり）** | 無理（識別のみ） | in-the-wild Rank-1 73–79%、家庭少人数で 90%台は出るが誤受入を許容できない | 顔/虹彩と組み合わせたスコア融合の補助要素に |
| **法令** | 設計に組み込む | 顔・虹彩特徴量＝個人識別符号、健康データ＝要配慮個人情報（JP）。BIPA：書面同意・$1,000–5,000/人。来客を含む全員の同意取得 UI、目的掲示、ローカル処理・暗号化、保存期間が製品要件 | — |
