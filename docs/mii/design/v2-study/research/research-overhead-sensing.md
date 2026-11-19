# 天井中央 1 枚のセンサーパック（高さ 2.4–2.7 m）で何が取れるか — 調査メモ

調査日: 2026-11-05。WebSearch / WebFetch で一次資料（論文・データシート・販売ページ）を確認したもののみ記載。確認できなかった値は「不明」。価格は取得時点の販売ページ表示（税込/税抜はページ依存）。

凡例（「今日買える/R&D/無理」列）
- **買える**: 市販品・モジュールとして今日注文できる
- **R&D**: 研究論文やデモで実証はあるが、製品として天井 2.4–2.7 m の条件で仕様化されたものがない／自前実装が必要
- **無理**: 物理的・幾何学的に 2.4–2.7 m 天井 1 枚では成立しない（または報告例なし）

---

## 1. 真上からの姿勢推定・手指追跡・商用天井センサー

### 1-a. 研究データセットと精度（真上視点）

| 方式/製品 | 天井からの距離・精度 | 価格 | 今日買える/R&D/無理 | 出典URL |
|---|---|---|---|---|
| **ITOP データセット**（深度カメラ・真上 vs 正面、20 人・約 10 万フレーム）— Viewpoint-Invariant 3D Pose (Haque+ 2016) | カメラ高さ: 不明（「天井から床へ向けて」）。**真上視点 3D 姿勢検出率 @10 cm**: 頭 98.1 / 首 97.6 / 肩 96.1 / 肘 86.2 / **手 85.5** / 胴 72.9 / **腰 61.2 / 膝 51.6 / 足 51.5**。上半身 91.4、下半身 54.7、全身 mAP 75.5。論文は「下半身関節は真上からほぼ常に遮蔽」と明記 | — | R&D | https://arxiv.org/pdf/1603.07076 |
| **THEODORE+ / PoseFES**（魚眼・真上、合成 5 万枚 + 実写 701 フレーム）— Human Pose Estimation in Monocular Omnidirectional Top-View Images (2023) | カメラ高さ: 不明（天井設置）。13 キーポイント（目・耳は除外）。HRNet 微調整後 **AP 81.8 / 78.6**（Sc1/Sc2）。検出器込み（OmniPD, 85.6%）では AP 65.4 / 63.8。CenterNet 系は AP 35–54。「遮蔽された関節の推定は COCO 事前学習からほぼ改善しない」(CenterNet) | — | R&D | https://arxiv.org/pdf/2304.08186v1 |
| **CEPDOF**（魚眼・真上、8 本・25,504 フレーム、平均 6.8 人・最大 13 人）— RAPiD 人物検出 | 高さ: 不明。**人物検出 AP50: MW-R 96.7 / HABBOF 98.1 / CEPDOF 85.8**（1024 px）。通常照明の CEPDOF 動画は AP50 ≥ 94。消灯 65.6、IR フィルタ 54.5（IR 照明ありで 87.5 に回復）。プロジェクター画面への誤検出、強い影で劣化 | — | R&D（検出は実用域） | https://arxiv.org/pdf/2005.11623 |
| **Top-view 全方位サーベイ**（2023）— 真上魚眼データセット一覧 | 姿勢推定: 「数値精度の報告なし、未開拓」。転倒検出: 「データセット・精度の報告なし（ルールベースのみ）」。Re-ID: FRIDA のみ。検出以外は研究段階と総括 | — | R&D | https://arxiv.org/pdf/2304.08193 |
| **天井 2.6 m Kinect 転倒検出**（Kepski & Kwolek 2014） | **高さ 2.6 m**、カバー面積 **約 5.5 m²**（広角レンズ付きで 15.2 m²）。模擬転倒 66 回すべて検出、誤報「0% に近い」— ただし**加速度計を併用**し、感度/特異度の表なし。若年被験者のみ | — | R&D | https://www.scitepress.org/Papers/2014/47424/47424.pdf |
| **MUVIM**（天井設置 IP/ZED/Orbbec/FLIR サーマル、模擬住宅、若年 30 + 高齢 10 名）— 転倒検出ベースライン | 天井高: 不明。動画ごと AUC-ROC: **IP 赤外 0.950** / Orbbec IR 0.923 / ZED 深度 0.874 / サーマル 0.874 / ZED RGB 0.859。全体共通しきい値では IP 0.889、RGB 0.619 まで低下。サーマルは FOV 50°×38° が狭く多くの転倒を捉えられず | — | R&D | https://arxiv.org/pdf/2206.12740.pdf |
| **天井 4 m RGB-D キッチン ADL 認識**（頭・手の 3D 位置 → HMM） | **高さ約 4 m**、320×240、1 fps。行動認識 F1: 手のみ 0.68 / 頭のみ 0.71 / 頭+手 0.77 | — | R&D | https://vrai.dii.univpm.it/sites/default/files/adls-poster.pdf |
| Azure Kinect ボディトラッキングを天井直下向きで使用（フォーラム報告） | 真下向きではスケルトンが歪み、点群を回転補正しても精度限定的。代替として点群のボックス切り出し + ブロブ追跡（左右手の区別は失う） | — | R&D | https://forum.derivative.ca/t/compensate-for-kinect-ceiling-mounted-downward-viewing-angle/294080 |

**真上から信頼できる関節**: 頭・首・肩（95%+）、肘・手（85% 程度）。**信頼できない**: 腰・膝・足（50–60%、自己遮蔽）。立位では胴〜脚が頭と肩に隠れるため、「転倒＝頭の高さ急減＋床面積比の増加」のような代替特徴が使われる。

### 1-b. 真上からの手指追跡（1.5–2.5 m）

| 方式/製品 | 天井からの距離・精度 | 価格 | 今日買える/R&D/無理 | 出典URL |
|---|---|---|---|---|
| **Kinect v1 を卓上 1.2 m 上に設置、指先追跡**（MIT） | **センサー〜卓面 約 1.2 m**。指先の平均誤差 **5.3 px ≒ 10 mm**、キャリブ誤差 2.1 / 4 mm。指 1 本のみ評価。30 Hz、レイテンシ未報告。深度分解能は 5 m で約 50 mm | — | R&D（1.2 m なら 1 cm 級） | https://groups.csail.mit.edu/mug/projects/gesture_kinect/docs/fingertip-tracking.pdf |
| **Azure Kinect 卓上ホログラム用ハンドジェスチャ**（14 関節 CNN） | 手〜カメラ **35–70 cm** で評価。F1: 0.993 (35–50 cm) / 0.976 (50–60) / **0.951 (60–70)**、「70 cm 以上では手を正確に検出できず」。カメラから 30° 以上回ると検出不可。mm 単位の関節誤差は未報告 | — | R&D | https://www.mdpi.com/1424-8220/20/16/4566 |
| 天井 2.4–2.7 m からの**指単位（mm 精度）追跡** | 床上の手まで 2.4 m、卓上（0.75 m）の手まで約 1.7 m。公開研究で 1.5 m 以上の真上距離で指関節 mm 精度を報告したものは**見つからず**（上記 2 件は 0.35–1.2 m）。手の位置（手首〜掌の重心）は ITOP 85% 級で可能 | — | 掌位置: R&D / 指 mm: 無理（現状） | 上記 2 件 |

### 1-c. 商用天井センサー（出力と価格）

| 方式/製品 | 天井からの距離・精度 | 価格 | 今日買える/R&D/無理 | 出典URL |
|---|---|---|---|---|
| **Xovis PC2SE**（ステレオ 3D、AI） | 取付高 **2–6 m**（販売ページ）/ 2.2–6 m（Cochrane 7.22–19.69 ft）。カバー 0.3–35 m²。公開カバー表: 標準レンズ 2.5 m で **1.88×1.06 m**、3.0 m で 3.75×2.13 m；超広角 UL 2.5 m で 2.63×2.13 m、3.0 m で 5.0×4.0 m。出力: 入退カウント、ゾーン滞在、座標トラック（匿名）。精度の公式数値は非公開 | **£786.68**（youritdelivered）〜 **£908.12**（spaice） | 買える | https://intercom.help/vemco/en/articles/15445338-xovis-sensor-coverage-tables-all-models / https://www.youritdelivered.com/xovis-pc2se-people-counter-sensor-ceiling-mountable-wall-mountable-for-indoor-pl-pc2se / https://www.spaice.com/xovis-pc2se-people-counter-sensor-pc2se.html |
| **Xovis PC3** | カバー表は **6.0 m 以上**から開始（PC3-H は 14 m〜）。2.4–2.7 m 天井には不適 | 不明 | 買える（高天井専用） | https://intercom.help/vemco/en/articles/15445338-xovis-sensor-coverage-tables-all-models |
| **Terabee People Flow Counting L-XL**（ToF 深度） | 取付高 **2.4–4.0 m**。カバー **2.4 m で 1.50×1.10 m**、3.2 m で 2.30×1.70 m、4.0 m で 3.40×2.55 m。FOV 74°×57°。精度 **98%**（入退合計）。出力: 入退カウント + 深度画像（色マップ） | **€1,097.26**（RobotShop EU） | 買える | https://www.mouser.lt/pdfDocs/Terabee-People-Counting-L-XL-Specification-sheet.pdf / https://eu.robotshop.com/products/terabee-people-flow-counting-l-xl |
| **Terabee Occupancy（サーマル）** | 取付高 **2.4–4.0 m**、固定フットプリント **8×8 m = 64 m²**（8 ゾーン分割）。精度 **>98%**（標準オフィス）。出力: 0–10 V 占有、LoRaWAN/Ethernet/Wi-Fi、HTTP/MQTT。霧・蒸気・ガラス越し・金属反射で低下 | 不明（サブスク無料） | 買える | https://www.terabee.com/wp-content/uploads/2026/06/EN-Occupancy-Specification-Sheet-Terabee-2026.pdf |
| **Hella Aglaia APS-B / APS-90E**（ステレオ 3D） | 天井高 **2.0–4.0 m**（APS-B）/ 2–6 m（APS-90E）。ドア幅 1.6–5.6 m、最大 30 m²。精度 **最大 99%**。出力: 入退、大人/子供分離、（オプション）車椅子・自転車 | 不明（ログイン要） | 買える | https://people-sensing.com/wp-content/uploads/2024/04/Datasheet-APS-B-2024-B-en.pdf / https://www.videor.com/en/aps-90e-io-w-k-sol.html |
| **Butlr Heatic 2 / 2+**（低解像サーマル、電池） | 最大取付高 **約 3.2 m**。1 台で「約 4 デスク／小会議室」。3 m で 1.5×1.5 m 内の **最大 6 人**を分離。解像度・FOV・精度数値は非公開（NDA）。出力: 占有・人数・滞在・ベッド在/不在・夜間活動、API に「転倒低減・アラート」カテゴリ | 不明（デモ要請） | 買える（B2B） | https://support.butlr.io/hc/en-us/articles/41507514621965-How-large-an-area-can-a-Heatic-sensor-cover / https://support.butlr.io/hc/en-us/articles/41507548998797-How-accurate-are-the-sensors-and-how-many-people-can-one-detect-at-once / https://www.butlr.com/platform/heatic-2-sensor |
| **Nobi Smart Lamp / Nobi Ceiling**（天井灯一体型カメラ、エッジ処理） | 天井高: 不明。転倒・離床・退室・夜間誘導灯。メーカー主張「転倒 100% 検出」「30 秒以内通知」。NHS 評価（840 名）: 転倒 1.85→1.27 件/人・月（−32%）、救急出動 −23%。検出率・誤報率の独立検証は**なし** | 約 **$2,500**/住戸 + **$19/月**、またはレンタル **$119/月** | 買える（B2B 中心） | https://nobi-smart-lamps.prezly.com/nobi-debuts-ceiling-mounted-smart-lamp-at-ces-and-announces-plans-to-bring-its-full-line-of-fall-detection-and-prevention-lamps-to-us-consumers / https://www.lancaster.ac.uk/media/lancaster-university/content-assets/documents/dhr/c4ar/SlidepackforNobiEvaluation.pdf / https://www.techhive.com/article/579134/the-nobi-smart-lamp-can-detect-when-a-person-falls-in-their-home-and-will-call-for-assistance.html |

---

## 2. 天井からの転倒検出（mmWave レーダー）

| 方式/製品 | 天井からの距離・精度 | 価格 | 今日買える/R&D/無理 | 出典URL |
|---|---|---|---|---|
| **Vayyar Care**（60 GHz 4D イメージングレーダー） | **天井取付: 天井高 8'2"–9'10"（2.5–3.0 m）、部屋中央**。壁取付は床上 1.5 m。カバー約 **13 ft × 13 ft（≒4×4 m）**、大部屋は複数台。出力: 転倒・在室・（B2B）異常行動。**精度・誤報率の数値は非公開**。同室 2 人の区別不可、階段非対応 | 本体 **約 $225–250**（Amazon）+ Alexa Together **$19.99/月** | 買える | https://elderlivinghub.com/reviews/vayyar-care-review/ / https://vayyar.com/care-docs/b2c/ |
| **Aqara FP2**（60 GHz） | **天井モード: 例 2.8 m、転倒検出範囲 半径 2 m**、転倒精度「98% 以上」（Best Buy 掲載値）。ゆっくりした転倒・壁に寄りかかる転倒は検出不可、落下物で誤報あり（取説明記）。壁モード: 8 m・120°・5 人追跡・30 ゾーン | 不明（本調査で価格ページ取得できず） | 買える | https://manuals.plus/aqara/fp2-presence-sensor-manual / https://bestbuy.ca/en-ca/product/aqara-presence-sensor-fp2-white/17156841 |
| **Seeed MR60FDA2**（60 GHz, XIAO 搭載） | 転倒検出範囲 **3×3×3 m**、静止在室 6 m、FOV 120°×100°（表記揺れあり）。取付高の公式値: 不明。精度数値: 不明 | **£28.80**（PiHut）/ **€34.95**（OpenELAB） | 買える | https://thepihut.com/products/mmwave-human-fall-detection-sensor-mr60fda2-60ghz / https://openelab.io/a/s/products/seeed-studio-xiao-60ghz-mmwave-human-fall-detection-sensor-mr60fda2 |
| **Seeed MR60FDA1**（旧型, 天井専用） | **天井吊り高 2.2–3.0 m**、検知半径 **2 m**、ビーム ±60°。**転倒認識精度 90%**（条件不記載、β 版データシート）。「浴室・トイレの小面積・単独者向け」 | 不明 | 買える | https://download.kamami.pl/p1195722-MR60FDA2_Fall_Detection_Module_Datasheet.pdf |
| **DFRobot C1001 (SEN0623)**（60 GHz） | **天井モード取付高 2.7 m**（製品ページ）。最大 11 m・100°×100°。点群で「横たわり」姿勢・転倒・静止継続時間。**呼吸・心拍は胸まで 0.4–1.5 m**、睡眠は 0.4–2.5 m（→ 天井 2.4 m からは呼吸・心拍の仕様外） | **$29.00** | 買える | https://www.dfrobot.com/product-2861.html / https://wiki.dfrobot.com/SEN0623 |
| **TI IWR6843 3D People Counting**（参考設計） | 推奨は**側壁 1.5–2.5 m・下向き 10–15°**。天井直下向きは「ノイズフロア上昇」と注意。1 人で GFR 79–100%、位置誤差 0.18–0.35 m；人数増で急落（5 人で 29–80%）。「座って静止すると点群から消える」 | EVM 数百ドル | R&D | https://dev.ti.com/tirex/explore/content/mmwave_industrial_toolbox_4_11_0/labs/People_Counting/3D_People_Counting/docs/3d_people_counting_user_guide.html / https://ti.com/document-viewer/lit/html/TIDUE71D/test-results-id-155d859a-7149-4498-b9e2-f1aa0b8fab03.html |

**要点**: 2.4–2.7 m の天井からのレーダー転倒検出は、Vayyar / Aqara / Seeed / DFRobot すべて**半径 2 m 程度（≒4×4 m）が実質カバー**。6 畳〜8 畳（約 10–13 m²）なら 1 枚で届くが、LDK 20 m² 超は 2 枚以上が前提。

---

## 3. 真上からの人物識別（世帯内クローズドセット）

| 方式/製品 | 天井からの距離・精度 | 価格 | 今日買える/R&D/無理 | 出典URL |
|---|---|---|---|---|
| **FRIDA**（真上魚眼 3 台、20 人、24 万 bbox）— 外見ベース Re-ID | カメラ高: 不明。外見 DL（CTL）**QMS 79.5% / mAP 83.4%**、色ヒストグラム 63.8%、併用 83.1%。位置ベース（複数カメラ三角測量）94–95%。「真上では体の見え方が大きく変わる、似た服・体型は外見だけでは不可」 | — | R&D | https://arxiv.org/pdf/2212.11477 |
| **深度カメラ 歩容+身長 識別（在宅想定）**（Dubois & Bresciani 2015） | Kinect、歩行線まで 2 m、高さ不明。12 名中既知 10 名: **85% 正解、誤認 0**（残り 3/20 は「不明」扱い）、未知 2 名は 100% 拒否。被験者は若年のみ、直線歩行のみ | — | R&D | https://perso.unifr.ch/jean-pierre.bresciani/confpapers/Dubois15.pdf |
| **天井カメラからの顔認識** | 2.4–2.7 m 天井中央から立位の顔は俯角 50–80°（頭頂・額が主）。本調査では天井真上視点での顔認識精度を定量化した資料は**見つからず**。Nest/Ring 等の「familiar face」は壁・ドアベルの水平視点前提（下記） | — | 無理（真上）／壁寄せ斜め設置なら R&D | — |
| **Google Nest 「familiar face」** | Nest Aware 必須。顔ライブラリは家全体で共有、新型は端末内保存。精度は「時間とともに向上」とのみ。角度・照明条件の公式記載なし。Tom's Guide 比較では初期は未知顔扱い、統合操作後に改善；Eufy は「99.9%」主張（ローカル）；Ring は AI Pro $19.99/月で顔認識 | Nest Aware サブスク | 買える（正面カメラ） | https://support.google.com/googlenest/answer/16594330 / https://www.tomsguide.com/home/smart-home/which-security-camera-has-the-best-ai-we-put-six-to-the-test-from-google-ring-blink-and-others-to-find-out |
| **音声話者識別（世帯プロトコル）** | 4–10 人世帯 + 同数ゲスト、登録 3–4 発話、2 秒チャンク。**オープンセット EER 1.3–3.8%**（VoxCeleb 1.3–1.9%、ASVspoof 多室条件 3.0–3.8%）。クローズドセット正解率は未報告。遠距離・残響条件でしきい値が転移しにくい | ソフトのみ | R&D（実装容易） | https://arxiv.org/pdf/2205.00288 |

**実用見立て**: 4–5 人世帯なら「身長（真上深度で直接取れる）＋体格・肩幅＋歩容＋声」の組合せで 85–95% 級が研究値。顔は天井 1 枚では使えない。

---

## 4. 天井レーダーによる呼吸・心拍（垂直 2.4 m）

| 方式/製品 | 天井からの距離・精度 | 価格 | 今日買える/R&D/無理 | 出典URL |
|---|---|---|---|---|
| **24 GHz FMCW を天井に設置、ベッド上 ~2 m**（VTT, Sensors 2020） | **天井→上半身 約 2 m、真下向き**。仰臥・左右側臥・伏臥。**心拍 MAE 1.03 bpm（相対 3.6%）、呼吸 MAE 1.41 /min（9.1%）**。体位で心拍差ほぼなし、左側臥で呼吸誤差やや増 | 研究機 | R&D（最も近い実証） | https://www.mdpi.com/1424-8220/20/22/6505 |
| **天井設置 FMCW で呼吸数（30 名・7 活動）**（TU Delft 2025） | 天井高に傾斜設置、被験者は **4 m 超**でも **呼吸 MAE 2.18 rpm**、3.1 秒窓で全条件 MAE <4.3 rpm。腰高さ基準機と同等。心拍は対象外 | — | R&D | https://repository.tudelft.nl/record/uuid:3a74c2dd-b3e3-49cf-8202-dc9abba6fba8 |
| **26 GHz バイスタティック**（座位 1–4 m、仰臥は「上から」） | 2 m 座位: 呼吸 17/16、心拍 67.8/68.0。4 m: 呼吸 20/14 と悪化。仰臥（距離不明）: 呼吸 14/14、心拍 60.0/59.0、毛布越しでも劣化小。歩行中は不可、腕・頭の動きで心拍抽出不可 | — | R&D | https://arxiv.org/pdf/2509.11767 |
| **TI IWR6843AOP 高さ 1 m/胸/2 m、距離 0.8 m 立位** | 2 m から俯角 41.5°。呼吸 MAE 5.3 /min、心拍 MAE 4.0 bpm（全高さ平均） | — | R&D | https://eprints.gla.ac.uk/317663/1/317663.pdf |
| **Sleepiz One+**（FDA 510(k) K223163、CW ドップラー） | **ベッドサイド・マットレスよりやや上**設置（天井ではない）。心拍 vs ECG 94–96%、呼吸 vs ベルト 99%（±3）、安静・睡眠時のみ | 不明 | 買える（医療、ベッドサイド） | https://fda.innolitics.com/device/K223163 |
| **Xandar Kardian XK300**（IR-UWB, FDA K202464） | **壁または天井設置可**、検知半径 **最大 7 m**。HR 60–120、RR 6–55。精度はベンチ試験のみ、数値非公開。在不在・動き・体調変化スコア | 不明 | 買える（B2B 医療） | https://fda.innolitics.com/device/K202464 / https://www.eastersealstech.com/2024/11/07/xk300-sensor-provides-vital-signs-monitoring/ |
| **Somnofy (VitalThings)** | **天井設置可**、ベッド・胸の近くに置く。「**天井が 3 m 超だと測定品質低下**」。ベッドサイドは枕上 20–40 cm。最大距離は設定値（数値非公開） | 不明 | 買える | https://kb.vitalthings.com/placement-and-mounting |
| **DFRobot C1001** | 呼吸・心拍は胸まで **0.4–1.5 m**、睡眠検知 0.4–2.5 m → 天井 2.4 m は呼吸・心拍の仕様外 | $29 | 買える（距離不足） | https://wiki.dfrobot.com/SEN0623 |
| Withings Sleep（参考・接触式マット） | ベッド下マット、天井とは無関係。本調査では詳細未取得 | — | 買える（接触） | — |

**要点**: ベッドが天井センサーの直下付近なら、天井→胸 約 1.9–2.0 m（ベッド高 0.5 m）で呼吸 ±1.5 /min、心拍 ±1 bpm 級が研究で実証済（VTT）。製品では Somnofy・XK300 が天井可だが「ベッドに近づけよ／3 m 以内」。**ソファで座っている人（天井から胸まで約 1.8–2.2 m、斜め）**は呼吸なら可能性あり、心拍は体動で頻繫に欠測。歩行中は不可。

---

## 5. LWIR アレイによる早期火災検知（天井）

| 方式/製品 | 天井からの距離・精度 | 価格 | 今日買える/R&D/無理 | 出典URL |
|---|---|---|---|---|
| **Melexis MLX90640**（32×24 サーマルアレイ） | 対象温度 **−40〜300 °C**、FOV 55°×35° / 110°×75°、NETD 0.1 K@1 Hz。メーカーの用途に「fire prevention」。1 kW コンロ火・ロウソクの検知距離を定量した一次資料は**本調査では取得できず**（KTH 修士論文・HRPUB 論文はロボット拒否） | 不明（Digi-Key 価格ページ非表示；モジュール市販数十ドル級） | 買える（部品）/ 検知アルゴは R&D | https://www.melexis.com/-/media/files/documents/product-flyers/mlx90640-product-flyer-melexis.pdf |
| **FLIR Lepton 3.5**（160×120） | 高ゲイン −10〜140 °C、**低ゲイン −10〜400 °C**、FOV 57°、NETD <50 mK | **$172**（GroupGets） | 買える（部品） | https://groupgets.com/products/flir-lepton-3-5 |
| **FLIR Lepton UW**（120×120 有効、**FOV 160°**） | シーン最大 **400 °C**、NETD <50 mK。「火災検知・人数計測向け」とメーカー記載。検知距離の仕様なし | 不明 | 買える（部品） | https://www.laserfocusworld.com/detectors-imaging/article/14301348/lwir-microthermal-camera-module-suits-fire-detection |
| **FLIR A40 をコンロ上に設置した調理活動検知**（CMBES） | 高さ不明（三脚）。バーナーマスク 80 °C、人体 30 °C しきい値。イベント感度 100%（33/33）、**誤報 2 件はいずれも蒸気**。鍋の空焚き検知は future work | — | R&D | https://proceedings.cmbes.ca/index.php/proceedings/article/download/363/357/726 |
| **Gdańsk 工科大「低解像ボロメータで火種検出」**（2021） | 「安価な低解像モジュールでもホットスポット検出可」と結論。距離・火サイズ・誤報は要旨に数値なし | — | R&D | https://pub.pg.edu.pl/en/publication/156040/smart-city-and-fire-detection-using-thermal-imaging |
| **Cooktop Safety Inc.**（AI サーマル、コンロ監視） | コンロ周辺の在不在・放置・焦げ予兆 → 警告 → 電源遮断。距離・価格・発売日は未記載（特許出願中） | 不明 | R&D/製品化前 | https://newswire.ca/news-releases/cooktop-safety-inc-reveals-breakthrough-ai-thermal-sensor-technology-879770614.html |
| **Bosch AVIOTEC 8000i IR**（可視カメラ映像火災検知） | 標準設定の最小検知サイズ **炎: 画面幅の 1.1%、煙: 1.6%**。EN54 試験火 TF1/2/4/5 で「吸引式煙感知器の平均 3 倍速い」（Bosch 社内試験）。産業・大空間向け、VdS/EN54 認証の明記なし | 不明 | 買える（産業用） | https://community.boschsecurity.com/t5/Fire/Which-is-the-min-detection-size-for-smoke-or-flame-of-AVIOTEC/ta-p/60088 / https://www.boschbuildingtechnologies.com/lifesafetysystems/en/news-events/aviotec/ |
| **映像火災検知 DL（DetectNet_v2, Jetson）**（Frontiers 2025） | 静止画 400 枚: 炎 精度 95.6%/再現 0.953、煙 92%。**誤報 3.5%**。誤検出源: 溶接火花・蒸気・霧・反射 | — | R&D | https://www.frontiersin.org/articles/10.3389/fcomp.2025.1636758 |
| **ONFIRE 2025 コンテスト**（映像火災・煙） | 300 本超の訓練動画、判定窓 −5 s〜+60 s。2023 年の上位手法は「精度不足」と主催者コメント。公開スコアなし | — | R&D | https://mivia.unisa.it/onfire2025/ |
| **住宅用火災警報器（熱式・定温式）日本** | 公称作動温度 **60 または 65 °C**（台所向け特種）。設置: 天井なら壁から **60 cm 以上**、エアコン吹出口から **1.5 m 以上**、壁付は天井下 15–50 cm。コンロ直上は不可。台所は法令義務でなく推奨 | 数千円級（価格は資料に記載なし） | 買える（規格品） | https://www.fdma.go.jp/laws/tutatsu/assets/170125an17.pdf / https://www.city.tsuruoka.lg.jp/anzen/shobo/kasaiyobo/jyukeiki.files/qa.pdf |
| **Honeywell 5809（UL 521 熱感知器）** | 定温 **57 °C（135 °F）**、差動 **8 °C/分**（38 °C 超で差動無効）。UL 間隔 50×50 ft。オーブン・通風口近傍は不可 | 不明 | 買える（規格品） | https://www.alarmgrid.com/documents/honeywell-5809-data-sheet |

**天井 LWIR の見立て**: MLX90640 110° 版を 2.5 m に付けると床面約 7×3.5 m を 32×24 画素で見る → 1 画素 ≒ 22×15 cm。鍋底・コンロ炎（300 °C 超で飽和）は数画素で確実に閾値超え、ロウソク（炎は小さいが 600 °C 超、周囲加熱は弱い）は 1 画素未満で**部分充填により見かけ温度が下がり**検出は不確実（本調査で距離対ロウソク検出の実測資料は得られず＝不明）。誤報源として一次資料に挙がるのは**蒸気**（CMBES）、ヒーター・オーブン・日射は規格品の設置制約（Honeywell・消防庁）から推定される要因。**規格（UL 521 / EN 54-5 / 日本の住宅用火災警報器）はいずれも「空気温度 57–65 °C」で作動するスポット感知器が前提で、画像式サーマルの住宅用規格は存在しない（＝自前センサーは法定警報器の代替にならない）。**

---

## 6. 天井からの人数カウント

| 方式/製品 | 天井からの距離・精度 | 価格 | 今日買える/R&D/無理 | 出典URL |
|---|---|---|---|---|
| **Xovis PC2SE**（ステレオ） | 2–6 m、0.3–35 m²。2.5 m で 1.88×1.06 m（標準）〜2.63×2.13 m（UL）。精度数値非公開（業界では「99%」と称するが Xovis 公式ページには数値なし） | £787–908 | 買える | 上記 1-c |
| **Terabee People Flow L-XL**（ToF） | 2.4–4.0 m、2.4 m で 1.5×1.1 m。**98%** | €1,097 | 買える | 上記 1-c |
| **Milesight VS135**（ToF 第 2 世代） | 低天井版 **最大 3.5 m**、高天井版 6.5 m。「**最大 99.8%**」。カバー面積: 不明 | **$950–1,060**（MCCI） | 買える | https://store.mcci.com/products/milesight-ultra-tof-people-counter-vs135 |
| **Hikvision DS-2CD6825G0/C-IS**（デュアルレンズ） | 取付高 **2.1–6.0 m**。最大検知幅 2.1 m で 1.02 m、**2.6 m で 2.30 m**、3.1 m で 3.58 m。身長フィルタ。精度数値なし | 不明（B&H 取扱終了） | 買える | https://us-legacy.hikvision.com/sites/default/files/data_sheet/ps_pc_ds-2cd6825g0c-ivs_121619na_0.pdf |
| **Hella APS-B**（ステレオ） | 2.0–4.0 m、ドア幅 1.6–5.6 m、**最大 99%**、大人/子供分離 | 不明 | 買える | 上記 1-c |
| **Butlr Heatic 2**（サーマル） | ≤3.2 m、3 m で 1.5×1.5 m 内 6 人分離 | 不明 | 買える | 上記 1-c |
| **Terabee Occupancy**（サーマル面カウント） | 2.4–4.0 m、64 m²、>98% | 不明 | 買える | 上記 1-c |
| **mmWave（TI IWR6843）** | 1 人 79–100%、2 人 62–100%、5 人 29–80%。静止者は消える | EVM | R&D | 上記 2 |
| **mmCounter**（79 GHz 4 チップカスケード、密集静止） | 既知環境 F1 86.8%・MAE 0.6、未知環境 F1 59.6%・MAE 1.1。三脚 2.4 m・40° 傾斜 | 研究機 | R&D | https://arxiv.org/pdf/2512.10357 |
| **真上魚眼 + RAPiD** | 検出 AP50 85.8–98.1（照明良好時 94+）。カウントは検出の積算 | カメラ数千円〜 | R&D（実用域） | https://arxiv.org/pdf/2005.11623 |

**要点**: ゲート型（入退）カウンターは 2.4–2.7 m で**幅 1–2.6 m しか見ない**（ドア用）。部屋全体の在室人数には面カウント型（Terabee Occupancy 64 m²、Butlr、魚眼カメラ）が必要。

---

## 7. 天井投影 + カメラ型インタラクティブ床

| 方式/製品 | 天井からの距離・精度 | 価格 | 今日買える/R&D/無理 | 出典URL |
|---|---|---|---|---|
| **Lü Interactive Playground**（Üno / Düo / Möve） | Üno: 天井 **最低 3 m（理想 6 m）**、壁 4.2×2.5 m 以上。Möve（可動）: 天井 2.4 m 以上、12×12 ft 遊技域。センサー: 「3D センサー」「動体検知カメラ」（型番非公開）。レイテンシ: 不明。Düo プロジェクター **5,200 lm** WXGA、Mobile は 5,500 lm レーザー | **Mobile $25,324.99**（Camcor）；他は見積 | 買える | https://play-lu.com/faq/ / https://www.cdw.com/product/lu-do-dlp-projector/8576339 / https://www.camcor.com/cat/Lu-Interactive-Playground-Mobile-System-LU-MOB.html / https://www.idema.com/en-GB/technical-components |
| **EyeClick BEAM Pro / SE / Obie** | 天井 **2.4 m 以上**（最大不明）。8 ft で投影 **305×201 cm**（Pro）/ 273×166 cm（SE）。**Pro 4,000 lm、SE 6,000 lm**。「3D モーショントラッキング」（型番非公開）。レイテンシ: 不明 | **$5,796〜**（見積、サブスクあり） | 買える | https://eyeclick.com/projectors/beam-interactive-projector / https://eyeclick.com/pricing |
| **OM Interactive omiVista Install** | 天井 2.4 m で投影 **2×1.5 m**、**4,300 lm**。センサー: 不明（「Touch Interactive」） | **£6,540（税抜）** | 買える | https://learningspace.co.uk/products/omivista-install-interactive-floor-table |
| **omiVista Mobii**（可動） | 床投影 200–260 cm 幅、卓上 100–150 cm。カメラ（赤外/深度の明記なし）、2 点高さキャリブ。強い日光で感度低下 | 不明 | 買える | https://cdn.shopify.com/s/files/1/0649/0688/7411/files/omiVista_Mobii_Product_Manual_V3.pdf |
| **Rompa 低価格可動型** | 3,500 lm ランプ、投影 1.6×1.0 m | 不明 | 買える | https://www.rompa.com/cost-conscious-mobile-interactive-floor-projection.html |
| **FunFloor** | 本調査で一次資料（公式仕様・価格）を取得できず | 不明 | 不明 | — |

**要点**: 商用システムはいずれも**センサー型番・レイテンシを非公開**。共通点は「天井 2.4 m 以上、4,000–6,000 lm、投影 2–3 m 幅、IR/深度カメラの動体差分」。家庭の 2.4–2.7 m 天井では投影幅約 2–3 m が上限。

---

## 天井 1 枚で取れるもの・取れないもの（4 本の Column Node と比べて）

前提: 天井中央 1 枚 = 魚眼 RGB/IR + 深度（ToF/ステレオ）+ 60 GHz レーダー + 32×24〜160×120 LWIR + マイクアレイ、高さ 2.4–2.7 m。Column Node 4 本 = 部屋の四隅、高さ 1.0–1.8 m、水平〜やや俯角の視点。

| 機能 | 天井 1 枚 | 4 本の Column Node | 根拠 |
|---|---|---|---|
| 位置・人数（面カウント） | **◎** 遮蔽ほぼなし、座標が直接出る。半径 2–3 m 内は検出 AP 94+（照明良好）。レーダーは静止者を失うが深度/熱で補える | ○ 相互遮蔽（人の後ろの人）、家具の影。4 視点合成で回復するが位置合わせが必要 | CEPDOF/RAPiD, Terabee Occupancy, TI 人数カウントの静止者消失 |
| 上半身姿勢（頭・肩・肘・手） | **○** 検出率 85–98%（ITOP 真上） | ◎ 正面/側面は COCO 系で全身 AP 高い | ITOP 表 |
| 下半身姿勢（腰・膝・足）、歩容 | **×〜△** 真上は 50–60%、「ほぼ常に遮蔽」 | ◎ 側面視点が最良 | ITOP、Dubois 歩容 |
| 床上の手（しゃがみ・床遊び） | ○ 掌位置は出る、指は不可（2.4 m） | △ 床は机・体に隠れやすい | MIT 指先 1.2 m 10 mm、Azure Kinect 70 cm 限界 |
| テーブル上の手・物 | ○ 掌位置・物体配置は真上が最も見やすい（天井→卓面 1.7 m）。指 mm 精度は無理 | △ 卓上は本人の体で隠れる | 同上、天井 4 m ADL F1 0.77 |
| 転倒 | **◎** 「頭の高さ急減＋床面積増」が真上で最も明瞭；レーダー転倒製品は天井モードあり（半径 2 m） | ○ 側面は横たわりは見えるが家具で隠れる | Kepski 2.6 m、Vayyar/Aqara 天井モード、MUVIM |
| 人物識別（世帯内） | **○** 身長（深度で直接）+ 頭肩形状 + 服色 + 声。顔は**無理** | ◎ 顔（正面）＋歩容＋声 | FRIDA 80–83%、Dubois 85%/誤認 0、Nest familiar face |
| 呼吸・心拍（寝ている人） | **○** ベッドが直下〜斜め 2 m 以内なら呼吸 ±1.5、心拍 ±1 bpm（研究）。製品は「3 m 以内」 | ○ ベッド脇の柱なら 1 m 以内で最良（Sleepiz 相当） | VTT 2 m 天井、Somnofy、Delft |
| 呼吸・心拍（座位・ソファ） | △ 呼吸は可能性、心拍は体動で欠測 | △ 同様（正面 1–2 m なら心拍やや有利） | 26 GHz 論文、Glasgow |
| 早期火災（コンロ・暖房器具の過熱） | **○** 天井から部屋全体を 1 枚で俯瞰。鍋・コンロは 300 °C 飽和で確実。ロウソク級は不明。蒸気で誤報 | △ 柱 1 本がコンロを直視できる配置なら近距離で有利、死角が多い | MLX90640/Lepton 仕様、CMBES |
| 法定火災警報 | × 画像式サーマルは住宅用規格外（別に 57–65 °C スポット感知器が必要） | × 同じ | 消防庁通達、UL 521 |
| 床へのインタラクティブ投影 | **◎** 天井中央が唯一自然な投影位置（2.4 m で 2–3 m 幅、4,000 lm 級） | × 柱からは床に投影できない（極端な斜投影） | BEAM / omiVista |
| 音声・話者識別 | ○ 天井マイクは全員から等距離だが残響の影響 | ○ 柱は口に近い | 世帯話者 EER 1.3–3.8% |
| 配線・施工 | ○ 照明位置の電源 1 系統で済む（Nobi 方式） | × 4 箇所の電源・設置 | Nobi |

**結論（天井 1 枚のみでの限界）**: (1) 下半身・歩容・顔が取れないので「誰が／どう歩いているか」は身長・体格・声に頼る、(2) レーダー系の実用半径は 2 m、呼吸・心拍はベッド直下付近限定、(3) 指単位の手操作は不可、(4) 20 m² 超の部屋は 1 枚で足りない。

## 2 枚（同室）・隣室との連携で改善するもの

| 連携 | 改善するもの | 根拠 |
|---|---|---|
| **同室 2 枚（天井、約 3–4 m 離す）** | ・レーダー転倒／呼吸の実質カバー（半径 2 m ×2）→ LDK 全域<br>・位置ベース Re-ID が 94–95%（外見のみ 80%）まで上がる＝**多視点三角測量が識別精度を最も改善**<br>・魚眼周縁部（解像度低下・検出ミス）を互いの中心で補完<br>・ベッドとソファの両方を「直下 2 m 以内」に置ける | FRIDA 位置ベース 94.4–95.0% vs 外見 79.5%；Vayyar「大部屋は複数台」；RAPiD 周縁ミス |
| **同室 2 枚（天井 + 低い斜め視点 1 本）** | ・下半身・歩容・顔が取れる → 識別 85%→90%+ 級、姿勢は全身<br>・サーマルで天井が見えないコンロ側面・鍋の中身 | ITOP 真上 vs 正面；Dubois 歩容 |
| **隣室との連携（ドア通過のハンドオフ）** | ・入退カウントの整合（ゲート型 98–99%）で在室人数の累積誤差をリセット<br>・識別は「前の部屋で誰だったか」の事前確率で継続（位置ベース Re-ID と同じ原理）<br>・火災: 隣室の温度上昇・煙は本室からは見えない → 各室 1 枚が必要（熱感知器も室ごと）<br>・転倒・呼吸: 改善しない（レーダーは壁越しに原則見ない） | Xovis/Hella/Terabee ゲート精度；消防庁の室ごと設置 |
| **連携しても改善しないもの** | ・指 mm 精度（距離が物理的に遠い）<br>・法定警報器の代替<br>・歩行中の心拍 | MIT/Azure Kinect 距離限界；UL 521/消防庁；26 GHz 論文 |

---

### 調査で取得できなかった一次資料（不明として残した項目）
- Vayyar Care 公式インストールガイドの数値（manualshive / manuals.plus はボット遮断）→ 第三者レビュー値（天井 2.5–3.0 m、4×4 m）で代替
- MLX90640 / Lepton を用いたロウソク・コンロ火の検知距離の実測（KTH 修士論文 diva2:1620371、HRPUB 2019 はロボット拒否）
- Butlr Heatic 2 の画素数・価格、Hella APS の価格、Xovis 公式精度値
- Lü 固定型・FunFloor の価格と使用センサー型番、各社インタラクティブ床のレイテンシ
- Aqara FP2 の現行価格
