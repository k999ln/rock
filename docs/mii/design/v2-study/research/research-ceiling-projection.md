# 天井中央パック型プロジェクタ（床・机・壁投影、電動チルト）設計調査

調査日: 2026-11-05。数値は出典ページ記載のものを転記。出典に無い値は「不明」。
価格は特記なき限り USD、1個（単品/評価用）価格。100/1000個の量産価格は原則どの供給元も非公開（RFQ）で、見積依頼が必要。
※ WebSearch は本調査途中で回数上限に達したため、一部項目（Alibaba の個別出品価格、RoomAlive原論文、Cinemood、Lightform等）は取得できず「不明」のまま。

---

## 0. 主要な結論（先に）

| 論点 | 結論 |
|---|---|
| DLP チップ選定 | **DLP2010 / DLP3010 / DLP4710 は TI が「LAST TIME BUY」**（終息）。新規設計は DLP230NP（0.23″ 1080p、最大450 lm）、DLP3310（0.33″ 1080p、最大800 lm）、DLP471TP/470TP（0.47″ 4K-XPR、最大1800 lm）を使う必要あり。出典: TI製品ページ（後述） |
| 床2 m円に必要な光束 | 16:9エンジンで床面照度 150 lux → 約 **1,100 lm**、300 lux → 約 **2,100 lm**（光学的に円内だけに光を集められる特殊光学なら半分弱）。環境光 100 lux 下で ANSI/AVIXA の「受動視聴 7:1」相当にするには 4,000 lm 級が必要 → **コンパクトLEDエンジン（〜600 lm）では夜間・暗室用途に限定** |
| スロー比 | 天井2.4 m（レンズ高さ約2.3 m）から床に直径2 m円 → 16:9画面の短辺を2 mにする必要があり **TR ≈ 0.65（短焦点）**。1.5 m円なら TR≈0.86、2.5 m円なら TR≈0.52。市販モジュールの TR は 0.9–1.2（標準）か 0–0.4（超短焦点）が大半で、**0.5–0.8 帯は Anhua の F11/F56/FY81/FY86 系（DLP4710, 600–1500 lm）など少数** |
| 壁への斜め投影 | 天井中央から壁中央（高さ1.5 m、水平1.8 m）は光軸が壁法線から約27°傾く。4辺台形補正は Aladdin X2 Plus でも ±40°対応だが、**画素損失＋画面上下で焦点距離が約±0.35 m違う**ため LED-DLP は AF 必須。LBS（レーザー走査）はフォーカスフリーでここが強い |
| 遅延 | DLPC34xx 系コントローラは 1フレーム（60 Hz で 16.7 ms、120 Hzで 8.3 ms）。実製品の小型DLPは 22 ms（XGIMI MoGo 3 Pro ゲームモード）〜61 ms（台形補正ON時の Nebula）。**台形補正・AFの後処理をOFFにできる経路が要る** |
| 安全 | LED-DLP は IEC 62471 で RG1 程度（低リスク）。レーザーDLP（レーザー蛍光体/RGBレーザー）は IEC 62471-5 の RG2 が消費者上限、RG2 で出力60%超なら「子供の頭上に設置」警告が義務（FDA）。**LBS（走査レーザー）は FDA ガイダンスの適用外で個別 variance が必要**（米国販売時）。Ultimems HD309 は IEC 60825-1 Class 1 を取得 |
| 床タッチ | 天井2.4 m からの深度カメラで指先 5–10 mm 精度（Kinect v2 を 1.6 m で 4.8 mm：DIRECT）。**2.4 m では深度量子化が悪化**するため、精密タッチは机（距離1.6 m）で、床は「足・体のゾーン検出」に割り切るのが現実的 |

---

## 1. ピコ/コンパクト DLP 光学エンジン

### 1-1. TI DMD と EVM（評価モジュール）

| 製品/部品 | 仕様（lm, 解像度, サイズ, W） | 価格 1/100/1000 | 限界 | 出典URL |
|---|---|---|---|---|
| TI DLP2010 DMD | 0.2″ (5.29 mm), 854×480 WVGA, システム最大 200 lm | 不明 / 不明 / 不明（部品ページ価格欄空欄） | **LAST TIME BUY（終息）**。EVM DLPDLCR2010EVM は Obsolete | https://www.ti.com/product/DLP2010 , https://ichome.com/product-detail/texas-instruments/dlpdlcr2010evm |
| TI DLP3010 DMD | 0.3″ (7.93 mm), 1280×720, システム最大 300 lm | 不明（部品ページ在庫なし） | **LAST TIME BUY** | https://www.ti.com/product/DLP3010 , https://www.ti.com/product/DLP3010/part-details/DLP3010AFQK |
| TI DLPDLCR3010EVM-G2（DLP3010 EVM） | 220 lm（Eprotech RGB LED エンジン）, 720p, DLPC3433+DLPA3000, 電源19 V（Mean-Well GST90A19 90 W級、消費電力は記載なし）, 寸法 不明 | $838.80（ichome 灰市場、在庫2） / 量産なし | RS Japan では取扱終了。終息DMD | https://www.ti.com/tool/DLPDLCR3010EVM-G2 , https://ichome.com/product-detail/texas-instruments/dlpdlcr3010evm-g2 , https://jp.rs-online.com/web/p/display-development-tools/2659764 |
| TI DLP4710 DMD | 0.47″ (11.93 mm), 1920×1080, システム最大 1800 lm, DLPC3439/3479 + DLPA3000/3005 | 不明 | **LAST TIME BUY** | https://www.ti.com/product/DLP4710 |
| TI DLPDLCR4710EVM-G2 | **600 lm**（Young Optics エンジン, OSRAM P1W RGB LED, R 12 A/G 16 A/B 16 A）, 1080p, **TR 1.39, オフセット100%, 焦点範囲 40–120 inch**, 電源 19 V/4.74 A（最大約90 W） | 不明（TI直販ログイン要） | TI は「1000 lm には変更不可、1000 lm超はパートナーエンジンを使え」と回答 | https://www.ti.com/tool/DLPDLCR4710EVM-G2 , https://www.ti.com/lit/pdf/dlpu079 , https://e2e.ti.com/support/dlp-products-group/dlp/f/dlp-products-forum/945501/dlpdlcr4710evm-g2-1000-lumens-application |
| TI DLP4710EVM-LC（ライトコントロール版） | 1080p, Young Optics RGB LED エンジン, LED最大電流16 A, 電源19 V, lm/寸法 記載なし, 重量2.2 kg（梱包） | **$1,558.80**（ichome）/ 351,400 RUB（ChipDip） | 3Dプリンタ/計測向け。終息DMD | https://www.ti.com/tool/DLP4710EVM-LC , https://ichome.com/product-detail/texas-instruments/dlp4710evm-lc , https://chipdip.ru/product0/8004998030 |
| TI DLP471TP DMD | 0.47″, 1920×1080 ミラー → XPR で 3840×2160 表示, システム最大 1800 lm, DLPC6540 | 不明 | 現行（ACTIVE 表記は確認できず。製品ページに終息表記なし） | https://www.ti.com/product/DLP471TP |
| TI DLPDLCR471TPEVM | **最大 500 lm**（Anhua エンジン）, 4K UHD, 30-bit HDMI, DLPC6540+DLPA3005, 電源 19 V/4.74 A | **$1,198.80**（ichome、在庫1） | 光源種・寸法・消費電力は非記載 | https://www.ti.com/tool/DLPDLCR471TPEVM , https://ichome.com/product-detail/texas-instruments/dlpdlcr471tpevm |
| TI DLP230NP DMD（DLP2010/3010 の後継） | 0.23″, 1920×1080, システム最大 **450 lm**, DLPC3436 | 不明 | **ACTIVE** | https://www.ti.com/product/DLP230NP |
| TI DLPDLCR230NPEVM | **最大 100 lm**（Young Optics エンジン）, 1080p, 81×87 mm（名刺サイズ）, 電源 5 V/4 A, **Raspberry Pi 4 直結** | **$358.80**（ichome） | 100 lm では床投影不可。プロト用 | https://www.ti.com/tool/DLPDLCR230NPEVM , https://ichome.com/product-detail/texas-instruments/dlpdlcr230npevm |
| TI DLP3310 DMD | 0.33″, 1920×1080, システム最大 **800 lm**, DLPC3437 | 不明（在庫なし表示） | ACTIVE | https://www.ti.com/product/DLP3310 |
| TI DLP470TP DMD | 0.47″, 4K (XPR), DLPC6421×2 | 不明 | 最大lm 不明 | https://www.ti.com/product/DLP470TP |

### 1-2. 第三者光学エンジン（TI DLP-OMM-SEARCH v4 公式一覧 Display シート、2026年入手）

ソース: https://www.ti.com/tool/DLP-OMM-SEARCH （zip 内 `DLP_Products_Optical_Module_Search_Tool_v4.xlsx`）。輝度は TI のプリセット帯（150–300 / 300–600 / 600–1500 / 1500–2000 lm）。**全モジュール価格非公開（不明）**。寸法・W は xlsx に列なし → 不明。

本設計に関係する候補（TR 0.5–0.8 または高輝度）を抜粋:

| 製品/部品 | 仕様（lm, 解像度, サイズ, W） | 価格 1/100/1000 | 限界 | 出典URL |
|---|---|---|---|---|
| Anhua F11GS / F11HG / F56 / FY81HA（DLP4710） | 600–1500 lm, 1080p, LED, オフセット1, **TR 0.5–0.8**（床2 m円に最も近い） | 不明/不明/不明（単品注文可） | DLP4710 は LAST TIME BUY → 長期供給リスク | TI OMM v4; https://www.ti.com/tool/ANHUA-3P-DLP4710-D ; https://www.anhuaoe.com |
| Anhua FY86HA（DLP4710） | **1500–2000 lm**, 1080p, LED, TR 0.5–0.8 | 不明 | 同上。消費電力推定 100 W 超（600 lm EVM が 90 W 電源） | TI OMM v4 |
| Anhua FF81HA / FF86HA / F25D_MF（DLP471TP） | 600–1500 / **1500–2000** lm, 4K-XPR, LED, TR 0.5–0.8 | 不明 | 現行DMD。価格は RFQ | TI OMM v4; https://www.ti.com/partner/ANHUA |
| Anhua F27F_MF / FY82HA_MF（DLP4710）, F17D_MF / FF82HA_MF（DLP471TP） | 600–1500 lm, LED, **超短焦点 TR 0–0.4**, オフセット1.2 | 不明 | UST は天井中央→床の「真下投影」には不向き（大オフセット前提） | TI OMM v4 |
| Ongine OPD85L（DLP4710）/ OPD85（DLP470TP） | **2000 lm**, 1080p/4K, LED, **光学ズーム 0.98–1.43**, TI EVM互換 | 不明（小ロット可） | TR 0.98 以上 → 床2 m円は不可（2.3 m から幅 2.35 m、高さ 1.3 m） | TI OMM v4; http://www.ongine.com.cn/ |
| Ongine USD85L（DLP4710）/ USD85（DLP470TP） | 1500 lm, UST TR 0.22 | 不明 | 同上 UST | TI OMM v4 |
| Ongine OPD53 / USD53（DLP3310） | 700 lm（TR 1.2）/ 650 lm（TR 0.19、ズーム0.98–1.43）, 1080p, LED | 不明 | 現行DMD。TR が合わない | TI OMM v4 |
| Young Optics FLA7-S / FLA7S+（DLP4710）, FLA11H（DLP470TP） | 600–1500 lm, LED, TR 0.9–1.2 | 不明（低ロット可） | TR 0.9 で床2 m円不可 | TI OMM v4; https://www.youngoptics.com/en/top-95-product72 |
| Young Optics FLA12-FH+（DLP230NP） | 150–300 lm, 1080p, TR 0.9–1.2 | 不明 | 暗すぎ | TI OMM v4 |
| Appotronics F18H（DLP4710）/ U18U+（DLP470TP） | **2000 lm / 1800 lm（ALPD レーザー蛍光体）**, 245×226×93 mm 1.9 kg / 312×305×96 mm 3.5 kg, TR 0.9–1.2 | 不明 | 大型・重い（天井パックには不向き）。レーザー光源 → IEC 62471-5 RG 判定必要 | TI OMM v4 |
| Hisense LM5 / LM9（DLP470TP） | 600–1500 lm, レーザー, UST TR 0–0.4 | 不明 | レーザーTV用 | TI OMM v4 |
| eViewTek E4PH（DLP2010） | **100 lm, 47.0×41.9×9.8 mm, 6.5 W, TR 1.2** | 不明 | 参考：ピコエンジンの典型サイズ/電力。終息DMD | http://www.eviewtek.com/en/a/products/lm4/%7B37.html |
| EKB DPM-E3010LC（DLP3010 LC EVM） | 200 lm, 720p, 38″@1 m, RGB LED | **$799**（定価$899）/ 不明 / 不明 | 単品販売の相場感 | https://www.ekbtechnologies.com/e-store/dlp-lightcrafter-e3010-lc |
| EKB DPM-3010ULC（量産モジュール） | **300 lm**, 720p, TR 1.2, RGB LED | **$729**（定価$899）/ 不明 / 不明 | 同上 | https://www.ekbtechnologies.com/e-store/dlp-lightcrafter-e3010ulc |
| Alibaba 「DLP pico module」価格ガイド（自動生成ガイド、信頼度低） | LED 30–200 lm / レーザー(MicroVision PL530) 300 lm+, 2.5–4.5 W, 50×50×15 mm 級 | 「DLP3010互換モジュール $47–68」「OEM モジュール（AAXA KP-101, MicroVision PL530）$180–366、100個から」「DMD 単体 $12–45」「500個以上で40%引」 | 具体的出品・MOQ の裏取り不可（Alibaba 商品ページは取得不能）。**参考値扱い** | https://electronics.alibaba.com/buyingguides/dlp-pico-projector-module-guide-what-you-actually-need |
| Alibaba 「DLP optical engine」価格ガイド（同上） | Entry: ≤1000 lm, 854×480, LED **$180–350**；Mid: 1200–2000 lm, 1080p **$650–1,300**；Premium: RGB レーザー **$1,600–2,200** | 同左（数量不明） | 同上 | https://electronics.alibaba.com/buyingguides/dlp-optical-engine-guide-how-to-choose-right |
| Alibaba 出品例（DLP4710 UV 光学エンジン、3Dプリンタ用） | 1280×800, UV | **$3,000, MOQ 10**（Shanghai Hangzhou Import & Export） | 可視光投影用ではない。可視光モジュールの出品価格は取得不能 | https://electronics.alibaba.com/product/dlp-pico-projector-module |

**光源方式の比較（本調査で得た数値ベース）**

| 方式 | 本調査での到達輝度（コンパクト） | 安全区分 | 備考 |
|---|---|---|---|
| RGB LED（OSRAM P1W 等） | 600 lm（TI EVM, 90 W 電源）〜 2000 lm（Anhua FY86HA, Ongine OPD85） | IEC 62471 RG1 程度（Alibabaガイド記載） | 最も入手性高。1000 lm 超は 100 W 級の放熱 |
| レーザー蛍光体（ALPD） | 1800–2000 lm（Appotronics F18H/U18U+、1.9–3.5 kg） | IEC 62471-5 RG2 以下に設計（FDA LIP 扱い） | 筐体が大きく天井パック向きでない |
| RGB レーザー（Aladdin X3 Laser: Nichia QuaLas RGB） | 1600 ANSI lm（4.3 kg 天井一体機） | 同上 RG 判定 | 色域広いがコスト高（本体 ¥249,800） |
| LBS（MEMS 走査） | 15–37 lm | Class 1（Ultimems HD309）/ FDA は走査レーザーを LIP ガイダンス外 | 床2 m円には 2 桁足りない（§2） |

---

## 2. レーザー走査（LBS/MEMS）ピコプロジェクタ

| 製品/部品 | 仕様（lm, 解像度, サイズ, W） | 価格 1/100/1000 | 限界 | 出典URL |
|---|---|---|---|---|
| Ultimems HD309D1-C1（モジュール、現行） | **34±3 lm**（MEMS から 400 mm で測定）, 720p/60, USB-C DP Alt Mode, 4.75–5.5 V, ピーク 6.5 W/通常 <5.5 W, **TR <1.3, フォーカスフリー, IEC 60825-1:2014 + IEC 62471-5 → Class 1** | 不明/不明/不明 | 34 lm：床2 m円（7.1 m²）で約 5 lux → 使用不可。壁の小画面・夜間限定 | https://manuals.plus/ultimems/hd309d1-c1-scanning-projection-module-manual , https://www.ultimems.com/ |
| Ultimems 2D MEMS ミラー（部品） | 径1.2 mm, 光学FOV 42°×26°, 28 kHz/60 Hz | 不明 | 自社でレーザー駆動・安全設計を行う必要 | https://www.ultimems.com/ |
| Sony MP-CL1（2015, 終息） | 37 ANSI lm, 1920×720, TR 1.21, 10×80×150 mm, 0.2 kg, フォーカスフリー, 光源は MicroVision PicoP | MSRP $349（終息） | 終息。輝度不足 | https://www.projectorcentral.com/sony-mp-cl1.htm |
| Nebra AnyBeam（2019, MEMS LBS） | 22 ANSI lm（「DLP 130 lm 相当」と主張）, 720p/60, 190×60×103 mm, 140 g, 3.0 W, フォーカスフリー, 台形補正あり | £166.66（税抜、Dev Kit）/ £229（本体） — **Sold out** | 暗室必須、150″ に 5 m 必要 | https://www.nebra.com/products/nebra-anybeam-developer-kit , https://www.theregister.com/2019/05/09/nebra_anybeam_laser_projector/ |
| TriLite Trixel 3（AR 用 LBS） | **15 lm**, <1 cm³, 1.5 g, FOV 24°×18°, 320 mW。エンジニアリングサンプル提供中 | 不明（sales@trilite-tech.com） | AR グラス用。投影機として輝度不足 | https://www.trilite-tech.com/product/ |
| MicroVision PicoP/PL530 | Alibaba ガイドに「PL530 300 lm+、$366+」の記載のみ | 不明 | MicroVision は LiDAR に転換済（本調査では現行供給を確認できず → 不明） | https://electronics.alibaba.com/buyingguides/dlp-pico-projector-module-guide-what-you-actually-need |

**フォーカスフリーの価値**: 天井→床（2.3 m）・机（約1.6 m）・壁（斜め、画面上下で ±0.35 m）を切り替える本設計では LBS が理想的だが、**現行 LBS モジュールの最大輝度は 34 lm で、必要量（§4、1,000 lm 級）の 1/30**。採用不可。

**レーザー安全（IEC 60825-1 / IEC 62471-5）の含意**
- Class 1: あらゆる使用条件で眼に安全。Class 2: 可視・偶発的な視認は安全（0.25 s 以上の凝視は危険の可能性）。Class 3R: 1–5 mW、低リスクだが潜在的に危険。Class 3B: 500 mW まで、眼・皮膚に極めて危険。出典: https://www.lasermet.com/us/laser-safety-services/an-overview-of-the-led-and-laser-classification-system-in-en-60825-1-and-iec-60825-1/
- レーザー光源プロジェクタ（LIP）は IEC 62471-5 の Risk Group（RG0–3、1 m で測定）。**RG2 が消費者製品の上限**。FDA Laser Notice 57（2019）: RG2 で出力が RG2 限界の 60% 超なら **「MOUNT ABOVE THE HEADS OF CHILDREN」警告と設置指示が義務**、取説に「子供を監督・ビームを見つめさせない」記載義務。RG3 は variance 必要、固定設置は危険域下端を床上 3 m 以上。**走査レーザー（LBS）はこのガイダンスの範囲外で、21 CFR 1040.10/11 が引き続き適用（個別 variance）**。出典: https://www.fda.gov/media/90796/download
- Schulmeister & Daem (J. Laser Appl. 2016): RG2 限界の投影機でも 1 m 未満の視認での網膜障害リスクは「very low to negligible」。RG2 限界は概ね 7,000 lm 以上に相当、0.45″ チップでは約 5,000 lm が上限なので **小型チップ機は RG2 限界に達しない**。出典: https://pubs.aip.org/lia/jla/article/28/4/042002/221476/Risk-of-retinal-injury-from-Risk-Group-2-laser
- 本設計への含意: 天井 2.4 m のパックは真下に人（子供）がいて**レンズを見上げる**姿勢になり得る。LED-DLP（RG1）なら表示上の問題は小さい。レーザー蛍光体/RGBレーザーなら RG2 判定＋人体検知での減光（FDA が「出力低減センサで警告代替可」と明記）を設計要件にすべき。

---

## 3. 天井投影の先行製品

| 製品/部品 | 仕様（lm, 解像度, サイズ, W） | 価格 | 限界 | 出典URL |
|---|---|---|---|---|
| Aladdin X2 Plus（旧 popIn Aladdin 2 Plus） | **900 ANSI lm**, Full HD, 0.23″ DLP（X2 Light 記載より推定）, 照明 3,800 lm, 約 4.9 kg, 引掛シーリング取付（工事不要）, **100″ に 2.0 m（→ TR ≈ 0.90）**, 80″ 1.47 m, **上下可動域 最大 32°**（ガラスカバーを手で動かし微調整）, 4辺台形補正 ±40°（手動）, フォーカスはリモコンから（AF 記載なし） | ¥129,800（定価）/ 公式 ¥109,800 | 壁専用。床・机投影は想定外。可動は手動 | https://www.aladdinx.jp/products/aladdin-x2-plus-2y , https://butsuyoku-gadget.com/aladdin-x2-plus-review/ , https://www.rentio.jp/matome/popin-aladdin-compare/ |
| Aladdin X2 Light | 700 lm, Full HD, 0.23″ DLP, LED, 456×121×456 mm, 4.7 kg, 100″ に 1.78 m（TR≈0.80）, 上下可動 最大 19°, 台形補正 上下/左右 手動, 32 dB | ¥99,800（定価）/ 実売 ¥60,280〜 | 同上 | https://kakaku.com/item/K0001659566/spec/ , https://www.rentio.jp/matome/popin-aladdin-compare/ |
| Aladdin X3 Laser | **1600 ANSI lm**, 4K, **RGB レーザー（Nichia QuaLas RGB, 2026）**, 照明 5,500 lm, 約 4.3 kg, 100″ に 1.77 m, 8 W×2 Harman Kardon | ¥249,800（発売時 ¥179,800） | 壁専用 | https://note.com/makuring/n/n10b5c8c5b002 |
| Aladdin Marca / Marca Max（超短焦点シーリング） | 1000 lm FHD / 2500 lm 4K, 100″ に壁から 0.24 m / 0.18 m | ¥149,800 / ¥379,800 | UST、壁専用 | https://www.rentio.jp/matome/popin-aladdin-compare/ |
| XGIMI Aladdin（国際版, CES2024） | HD, 100″, **投射比 0.7:1**, Harman Kardon 360° | 不明（日本先行、欧米未定） | 詳細不明 | https://techradar.com/televisions/projectors/xgimi-launches-a-clever-projector-hidden-in-a-ceiling-light-and-a-stylish-imax-4k-projector |
| XGIMI Horizon Max（電動ジンバル ISA 5.0 の例） | 3,100 ISO lm, 4K, **電動ジンバルで壁の投影位置へ自動照準**（角度範囲 不明） | 不明（記事時点） | 据置機。ジンバル仕様非公開 | https://9to5google.com/2024/01/07/xgimi-horizon-max-with-imax/ |
| EyeClick BEAM Pro / SE（床・机・壁インタラクティブ） | **4,000 lm / 6,000 lm, レーザー 30,000 h**, 天井 ≥2.4 m（8 ft）設置, 8 ft で 305×201 cm（Pro, 角度付き 50 cm セットバック）/ 273×166 cm（SE, 直下）, 「3D モーショントラッキング」（センサ種 不明）, 床/机/壁 3 モード | **$5,796 から** | 商用FEC向け。重量・W・遅延 不明 | https://eyeclick.com/projectors/beam-interactive-projector |
| EyeClick Obie | **3,000 lm**, HD, 天井 7–11 ft, 8 ft で床画像 6′1″×3′10″〜7′3″×4′6″（ズーム）, ランプ光源, 78 ゲーム | **$4,995.95**（Kaplan）/ EyeClick 系 $5,796〜 | センサ種 不明 | https://www.kaplanco.com/product/37060/obie-floor-projection?c=15%7CCO1075 , https://eyeclick.com/projectors/obie-interactive-projector |
| Lü Üno/Düo（体育館用） | **5,200 lm WXGA**（欧州 WUXGA）, 470 W, 16.8 kg, プロジェクタ床上 6 m・壁から 8.5 m, **3D カメラモジュール**（機種 不明、1.38 kg, 36 W, 床上 5.5 m、最遠投影角まで 7 m）, 投影 5.8×3.3 m, Heart モジュール 216 W | 見積制（過去報道 $21K–28K） | 巨大。参考はカメラ距離 7 m でゾーン検出が成立する点 | https://play-lu.com/wp-content/uploads/2022/08/Installation-Manual_EN-Mars2022.pdf , https://eyeclick.com/resources/blog/eyeclick-vs-competitors |
| 競合比較（EyeClick ブログ） | LUMOplay: ソフト $263–585/年 + 自前機材 $2,000–2,500（3D カメラ）；ActiveFloor ONE3 $5,300〜MAX3 $11,900 + ライセンス $1,300–5,400；Breeze Dynamic Floor 4,300 lm；FX Game Zone HD IR カメラ | 同左 | 自社ブログの比較 | https://eyeclick.com/resources/blog/eyeclick-vs-competitors |
| Sony Xperia Touch G1109（2017, 終息） | **100 lm**, 1366×768, レーザーダイオード UST, 机モード **23″**（床置き）, 壁 80″（最大100″, 壁から 38 cm）, AF・自動台形補正, **IR センサによる 10 点タッチ**（机は遅延なし・良好、壁は精度低下、23″ 超ではタッチ不可、凹凸面・ガラスは不可）, 1,200 mAh 約1 h | 約 $1,700 / €1,500（終息） | 超短距離 IR ライトプレーン方式 → 天井 2.4 m では使えない | https://www.gsmarena.com/sony_xperia_touch_review-news-25540.php |
| FunFloor | 取得不能 → 不明 | 不明 | — | — |
| Cinemood 360 | 取得不能（projector-database がブロック）→ 不明 | 不明 | — | https://www.projector-database.com/pro/cinemood360-en.html |
| Lightform LF2/LFC | 取得不能（Notion ページ JS 必須）→ 不明 | 不明 | — | https://lightform.notion.site/How-are-LF2-2-and-LFC-different-90ab090c7d704963a8f31a20eda0d19d |

**Aladdin が天井から壁へ投影する仕組み（判明分）**: 引掛シーリングに本体を固定し、レンズ部を手動で最大 19°（X2 Light）/32°（X2 Plus）上下に振り、残りは 4辺手動台形補正（±40°）で吸収。TR ≈ 0.8–0.9 の短焦点レンズで 1.8–2.0 m 先の壁に 100″。自動台形補正・AF の記載はなし（手動フォーカス）。

---

## 4. 天井中央から床・机・壁へ投影する設計の数値（必要 lm, throw, 遅延, 安全）

### 4-1. 幾何（計算。天井高 2.4 m、レンズ面を天井下 10 cm = 2.3 m と仮定）

| 項目 | 式 | 値 |
|---|---|---|
| 床に直径 2 m 円を内接させる 16:9 画面 | 短辺 = 2.0 m → 長辺 = 2.0×16/9 = 3.56 m | 画面 3.56×2.0 m、面積 7.1 m²、**円は画面面積の 44%**（π/4×9/16） |
| 必要スロー比（TR = 距離/画面幅） | 2.3 / 3.56 | **TR ≈ 0.65** |
| 1.5 m 円 | 幅 2.67 m | **TR ≈ 0.86**（市販 0.9–1.2 帯の下限で可） |
| 2.5 m 円 | 幅 4.44 m | **TR ≈ 0.52** |
| 天井 2.7 m（レンズ 2.6 m）で 2 m 円 | 2.6/3.56 | TR ≈ 0.73 |
| 画素ピッチ（床、幅 3.56 m） | 1080p: 3.56/1920；720p: /1280；WVGA: /854；4K-XPR: /3840 | **1.85 mm / 2.78 mm / 4.17 mm / 0.93 mm** |
| 机（天板高 0.7 m、距離 1.6 m）で同一レンズ | 幅 = 1.6/0.65 | 画面 2.46×1.38 m → 机（例 1.2 m 幅）には電子クロップ必要（1080p で約 940 px 幅が机上に乗る）。**焦点 2.3 m→1.6 m の切替 → AF 必須** |
| 壁（水平 1.8 m、壁面中心高 1.5 m）への斜め投影 | 俯角 = atan(0.9/1.8) | 光軸は水平から **26.6°下向き**、床直下から **63.4°** のチルト。壁法線に対し 26.6° の斜入 |
| 壁画面上下の距離差（画面高 1.5 m） | 上端 2.01 m–下端 2.59 m（概算） | 焦点距離差 ≈ **±0.3 m** → F/1.7–2.0 級 DLP レンズでは片側ボケ。AF＋小絞り or LBS |
| 台形補正の画素損失（26.6° 斜入、概算） | 台形の短辺/長辺 ≈ cos 成分比 | **約 20–30% の画素を捨てる**（4辺補正後の矩形内接。製品個別値は 不明） |

アスペクトの選択肢: (a) 16:9 のまま円を内接（画素 44% 利用）、(b) DMD を 1:1 に近いアスペクトで使う専用光学（存在 不明、カスタム）、(c) **投影はフル矩形にして床のデザイン（マット）で円を見せる**。コスト最小は (c)。

### 4-2. 必要光束（照度ベース、ANSI lm ≈ 画面上光束、ゲイン 1、円内外を区別しない矩形照射）

| 目標 | 面積 | 必要 ANSI lm |
|---|---|---|
| 床 150 lux（2 m 円内、矩形 7.1 m² を照射） | 7.1 m² | **1,070 lm** |
| 床 300 lux | 7.1 m² | **2,140 lm** |
| 円内だけに集光できる仮想光学（3.14 m²） | 3.14 m² | 150 lux: 470 lm / 300 lux: 940 lm |
| 1.5 m 円（矩形 2.67×1.5 = 4.0 m²） | 4.0 m² | 150 lux: 600 lm / 300 lux: 1,200 lm |
| 2.5 m 円（4.44×2.5 = 11.1 m²） | 11.1 m² | 150 lux: 1,670 lm / 300 lux: 3,330 lm |
| 机 1.2×0.7 m（クロップ後、実効 0.84 m² に 1,000 lm 機の約 34% が乗る） | 0.84 m² | 1,000 lm 機 → 約 400 lux（机は明るく出来る） |

**環境光とのコントラスト**（床面環境光 E_a、投影白 E_w、暗部は環境光のみと仮定。コントラスト ≈ (E_w+E_a)/E_a）

| 環境光 | 1,000 lm 機（E_w≈140 lux） | 2,000 lm 機（280 lux） | 4,000 lm 機（560 lux） |
|---|---|---|---|
| 夜・常夜灯 10 lux | 15:1 | 29:1 | 57:1 |
| 間接照明 50 lux | 3.8:1 | 6.6:1 | 12:1 |
| 一般室内 150 lux | 1.9:1 | 2.9:1 | 4.7:1 |
| 昼の窓際 300–500 lux | ≈1.3–1.5:1（ほぼ見えない） | 1.6–1.9:1 | 2.1–2.9:1 |

参考基準: SMPTE 暗室 16 fL（≈55 cd/m²）、低環境光 27–39 fL、中 40 fL、高 60 fL（出典 https://www.projectorscreen.com/blogs/news/what-are-foot-lamberts-and-why-do-i-care ）。床の反射率 ρ≈0.3（木・濃色カーペット）とすると輝度 L = E·ρ/π → 16 fL には **E ≈ 576 lux → 矩形 7.1 m² で約 4,100 lm**。白い ALR 相当マット（ρ≈0.85）なら E≈203 lux → 約 1,450 lm。
→ **結論: コンパクト LED エンジン（600–2,000 lm）は「夜間〜間接照明（≤50 lux）で床 2 m 円」が成立域。昼間は不成立。** 床用 ALR マットは専用品を本調査では確認できず（不明）。ALR スクリーンは天井光（上方入射）を拒絶する構造のため、天井から真下に投影する床用途では ALR の角度選択原理が逆に働く（天井光と投影光が同方向）→ 実質「高反射率の白マット」しか効かない。

### 4-3. 熱・電力（実測値から）

| 機器 | 光束 | 電源 |
|---|---|---|
| TI DLPDLCR4710EVM-G2（LED 1080p） | 600 lm | 19 V/4.74 A（90 W 級）、LED 12–16 A 駆動 |
| TI DLPDLCR471TPEVM（4K） | 500 lm | 19 V/4.74 A |
| TI DLPDLCR230NPEVM | 100 lm | 5 V/4 A（20 W） |
| eViewTek E4PH（DLP2010） | 100 lm | 6.5 W |
| Lü プロジェクタ（商用） | 5,200 lm | 470 W |
→ 1,000–2,000 lm LED で **100–200 W 級**、天井パック内に強制空冷必須。Aladdin X2 Plus（900 lm）は 4.9 kg、X3 Laser（1600 lm）4.3 kg が「天井一体機」の実在サイズ感。

### 4-4. 遅延

| 要素 | 値 | 出典 |
|---|---|---|
| TI DLPC34xx 表示コントローラ | **1 フレーム**（120 Hz で 8.33 ms、60 Hz で 16.7 ms）。次 VSYNC で表示 | https://e2e.ti.com/support/dlp/f/94/t/511693 |
| BenQ DLP 4K（ゲームモード） | 1080p/60: 16.7 ms、1080p/120: 8.3 ms、1080p/240: 4.2 ms；LCD は 26–38.8 ms | https://www.benq.com/en-us/knowledge-center/knowledge/benq-input-lag-and-gaming-projector-performance.html |
| XGIMI MoGo 3 Pro（0.23″級 DLP, 394 lm 実測, $449） | **22.2 ms**（ゲームモード、台形補正 OFF） | https://www.thesmarthomehookup.com/ultimate-portable-projector-comparison-2024-update/ |
| Nebula Capsule 3 / Mars 3 Air | **約 61 ms（台形補正 ON）** | 同上 |
| LG Cinebeam Q | 64.4 ms | 同上 |
| BenQ GV50 / JMGO N1 / Dangbei Atom / Nebula Mars 3 | 35 ms 未満 | 同上 |
| 床タッチ検出（DIRECT, Kinect v2） | 深度→タッチ点 **約 15 ms**（平滑化なし）＋Kinect 30 fps（33 ms） | https://chrisharrison.net/projects/direct/DIRECT.pdf |
→ 設計目標: 表示 ≤25 ms（台形補正・AF を**自前のワープ処理（GPU）に統合し、エンジン側補正は OFF**）、センシング 30–60 fps で合計 60–80 ms がゲーム用の現実的下限。

### 4-5. オートフォーカス / 電動チルト部品

| 製品/部品 | 仕様 | 価格 1/100/1000 | 限界 | 出典URL |
|---|---|---|---|---|
| Corning Varioptic A-39N0 液体レンズ | CA 3.9 mm、**−5〜+15 D**、電圧駆動 | 見積（Edmund、数量ティアあり）/ 不明 / 不明 | **口径 3.9 mm → 投影レンズ（瞳径 10 mm 超）には使えない**。カメラ側 AF/測距用 | https://www.edmundoptics.com/p/39mm-ca-a-39n0-corning-varioptic-variable-focus-liquid-lens/3669/ |
| Optotune EL-16-40 等 大口径可変焦点 | 取得不能 → 不明 | 不明 | 投影光路挿入は収差・耐光性の検証必要 | — |
| ステッパ/ボイスコイル AF（市販ポータブル機の標準） | XGIMI/Aladdin 系は ToF or カメラ測距＋モータ駆動（仕様非公開） | 不明 | 本設計では「床/机/壁」3 プリセット距離を記憶して駆動する方式で足りる | — |
| Waveshare 2軸パンチルト（ST3215 シリアルサーボ×2） | **30 kg·cm @12 V**, パン ±180°, チルト −45〜+90°, 12-bit 磁気エンコーダ, 441 g | **$109.99**（量産ティア $107.95〜） | ペイロード非公開。1 kg 級エンジン＋レンズを天井から吊るには剛性不足の可能性 | https://www.waveshare.com/2-axis-pan-tilt-camera-module.htm?sku=24984 |
| Ingiant YZ-W001YT 2軸ジンバル（産業用） | ペイロード ≤1 kg、パン 0–360° 連続、チルト −60〜+20°（オプション ±90°）, ウォームギア自己保持, DC 24 V, 150×100×152 mm, 2.9 kg | 不明 | 大きく重い | https://www.directindustry.com/prod/jiujiang-ingiant-technology-co-ltd/product-204639-2859035.html |
| XGIMI Horizon Max ISA 5.0 電動ジンバル | 壁へ自動照準（範囲 不明） | 不明 | 民生品実装例として参考 | https://9to5google.com/2024/01/07/xgimi-horizon-max-with-imax/ |
→ 本設計では**チルト 1 軸（床直下 0° → 壁 63°）のみ**でよい（パンはパック自体の取付向きで決める）。ウォームギア or 自己保持型で停電時に落下・振れを防ぐこと。アラジンの手動 32° 可動と違い、63° まで振ると筐体内でレンズ開口が側面に来る → 側面にも投光窓が要る。

### 4-6. 安全（天井・人の頭上・子供）

- LED-DLP: IEC 62471（光生物学的安全）RG1 相当（Alibaba ガイド記載、要メーカー試験）。1,000–2,000 lm で真下 2.3 m からレンズを見上げても、RG2 限界（≈7,000 lm 級）に遠い。
- レーザー光源: IEC 62471-5 RG2 判定。RG2 の 60% 超なら「MOUNT ABOVE THE HEADS OF CHILDREN」表示。本設計は常に頭上設置なので要件自体は満たしやすいが、**天井設置機は「レンズを見上げる」状況が常態化**するため人体検知減光を推奨。
- LBS: Class 1 達成例あり（Ultimems）だが FDA は走査レーザーを LIP ガイダンス外 → 米国販売は variance。日本は JIS C 6802（IEC 60825-1 整合）クラス表示。
- 機械安全: 4–5 kg 級（Aladdin 実績）を引掛シーリング（JIS 耐荷重 5 kg 以下が一般）に吊るか、専用金具か。電動チルトの可動部に指が入らない構造。

---

## 5. 明るさ vs 環境光、入力遅延（要約）

- 昼間（床 300–500 lux）: 4,000 lm でもコントラスト 2–3:1 → **不成立**。遮光カーテン前提か、昼は「机モード」（約 400 lux/1,000 lm で局所的に有利）に限定。
- 夜〜間接照明（≤50 lux）: 1,000 lm で 4:1、2,000 lm で 7:1 → **ゲーム・案内表示が成立**。
- ALR 床マット: 市販品確認できず（不明）。原理上、天井光と投影光が同方向のため ALR の指向性選択は効かず、白高反射マット（ρ 0.8–0.9）で輝度約 2.5–3 倍が実効策。
- 入力遅延: DLP コントローラ 1 フレーム。製品実測 22 ms（補正 OFF）〜61 ms（補正 ON）。補正 ON のペナルティ約 +40 ms が実測で確認できる。

---

## 6. 天上カメラによる床・机インタラクション

| 製品/研究 | センサ・距離 | 精度/性能 | 限界 | 出典URL |
|---|---|---|---|---|
| DIRECT（Xiao, Hudson, Harrison, ISS 2016） | **Kinect v2 (ToF 512×424, 30 fps) を机上 1.60 m**（視野端で 2.0 m）、プロジェクタ 2.35 m | タッチ検出率 **99.3%**、指先位置誤差 **4.8 mm**（補正後 4.46 mm、深度格子 4.4 mm 量子化が約 3.1 mm 分）、複数指分離 75.5%、**遅延約 15 ms**、接触閾値 1 cm | 深度画素への量子化、多指で未検出 22%。Kinect v1（構造化光）では IR エッジ法が使えない | https://chrisharrison.net/projects/direct/DIRECT.pdf |
| MIT CSAIL 指先追跡（Kinect v1, 2011 頃） | Kinect v1 640×480、机上 **1.2 m** | 位置誤差 5.3 px ≈ **10 mm**、フレーム間ノイズ 1.3 mm、前景閾値約 7.8 mm、30 Hz | 深度分解能 0.5 m で 1.5 mm → 5 m で 50 mm と距離で急劣化 | https://groups.csail.mit.edu/mug/projects/gesture_kinect/docs/fingertip-tracking.pdf |
| Azure Kinect vs Kinect v2 評価（Sensors 2022） | ToF、1–5 m | Azure Kinect: 系統誤差 **1.0–2.0 m で <2 mm**、ランダム誤差 0.6–3.7 mm（光軸近傍は 3.5 m でも <2.5 mm）、NFOV unbinned 640×576；Kinect v2: 0.5–3.0 m で系統誤差 0–4 mm、中心部ランダム誤差 <約4 mm | Azure Kinect DK は Microsoft が生産終了（後継は Orbbec Femto Bolt — 本調査では未確認 → 価格 不明） | https://www.mdpi.com/1424-8220/22/7/2469 |
| Sony Xperia Touch | IR ライトプレーン、23″ 机面 | 10 点、机は遅延なし | 23″ 超・壁・凹凸面で不可。**天井 2.4 m 方式には転用不能** | https://www.gsmarena.com/sony_xperia_touch_review-news-25540.php |
| Lü | 「3D カメラ」床上 5.5 m、最遠 7 m | 体・ボールのゾーン検出（精度値 不明） | 指先タッチではない | https://play-lu.com/wp-content/uploads/2022/08/Installation-Manual_EN-Mars2022.pdf |
| EyeClick BEAM/Obie | 「3D モーショントラッキング」（機種 不明）、天井 2.1–3.4 m | 足・手の動きゾーン検出 | タッチ精度値 非公開 | https://eyeclick.com/projectors/beam-interactive-projector |
| RoomAlive（MSR 2014） | Kinect + プロジェクタ複数台（原論文は本調査で取得不能 → 数値 不明） | — | — | — |
| CVPR 2026 「Real-Time Multimodal Fingertip Contact Detection via Depth and Motion Fusion」 | PDF 取得不能 → 不明 | 不明 | — | https://openaccess.thecvf.com/content/CVPR2026/papers/Toshpulatov_Real-Time_Multimodal_Fingertip_Contact_Detection_via_Depth_and_Motion_Fusion_CVPR_2026_paper.pdf |

**本設計への換算**
- 机（カメラ距離 1.6 m）: DIRECT と同条件 → **指先 ≈5 mm、接触判定 1 cm、遅延 15 ms + 33 ms（30 fps）**。1080p 床画素 1.85 mm に対し十分（ボタン ≥ 20 mm 角）。
- 床（カメラ距離 2.3–2.4 m、視野端 2.8 m）: Azure Kinect 級で系統誤差 2–5 mm、ランダム 2–4 mm だが、ToF の 1 画素が床で約 4–5 mm（640 px で幅 3.5 m を見る場合 5.5 mm/px）→ **指先タッチは 10 mm 級、足・手のゾーン検出は余裕**。床は「踏む・手を置く」UI に設計。
- RGB 単眼＋手検出 ML（MediaPipe 等）は 2.4 m でも手の 2D 位置は取れるが接触判定ができない → 深度必須。

---

## 7. 判定

| 設計要素 | 判定 | 根拠 |
|---|---|---|
| 光学エンジン方式 | **LED-DLP、現行 DMD（DLP471TP または DLP3310）** | DLP2010/3010/4710 は LAST TIME BUY。LBS は 34 lm で 2 桁不足。レーザー蛍光体は 2–3.5 kg 筐体で天井パック不向き |
| 輝度 | **最低 1,000 lm、推奨 1,500–2,000 lm（Anhua FY86HA/FF86HA 1500–2000 lm, TR 0.5–0.8）** | 床 2 m 円 150–300 lux に 1,070–2,140 lm。昼間使用は諦める（4,000 lm でも 2–3:1） |
| スロー比 | **TR 0.65（2.4 m 天井・2 m 円）、0.5–0.8 帯のモジュールが必須** | 0.9–1.2 帯の標準モジュールは床で 1.3–1.7 m 円が上限 |
| 床/机/壁切替 | **1 軸電動チルト 0–63°＋3 プリセット AF＋GPU ワープ（補正はエンジン側 OFF）** | 壁は 26.6° 斜入で画素 20–30% 損失・焦点差 ±0.3 m；補正 ON の実測 +40 ms を避ける |
| 遅延 | 表示 ≤25 ms、タッチ 50 ms 前後、合計 60–80 ms が現実解 | DLPC 1 フレーム、MoGo 3 Pro 22 ms、DIRECT 15 ms + 30 fps |
| センシング | **ToF 深度（Azure Kinect 級、640×576 以上）を投影軸と同軸近傍に**。机=指先タッチ、床=ゾーン | 1.6 m で 5 mm、2.4 m で 10 mm 級 |
| 安全 | LED なら RG1 で設計負荷軽。レーザー採用時は RG2 判定＋人体検知減光。LBS は規制上も輝度上も不採用 | FDA LN57、Schulmeister 2016 |
| 電力・質量 | 100–200 W、4–5 kg（Aladdin 実績）→ 引掛シーリング耐荷重と放熱設計がボトルネック | TI EVM 90 W/600 lm、Aladdin 4.3–4.9 kg |
| コスト（単品） | EVM 級 $360（100 lm）〜$1,560（1080p LC）。1,500–2,000 lm モジュールの単価・100/1000 個価格は**全社非公開 → RFQ 必須**。Alibaba ガイドの参考帯は Mid 1080p 1,200–2,000 lm で $650–1,300/個（信頼度低） | §1 |
| 総合 | **「夜間〜間接照明の部屋で床 2 m・机・壁を切り替える 1,500–2,000 lm LED-DLP 天井パック」は部品レベルで成立**。未解決は (1) TR 0.5–0.8・2,000 lm モジュールの量産価格、(2) 63° チルト時の筐体開口と放熱、(3) 深度センサの供給（Azure Kinect 後継）、(4) 昼間使用の断念を製品コンセプトに織り込むこと | — |

---

## 取得できなかった項目（再調査候補）
- Alibaba / Made-in-China の可視光 DLP モジュール個別出品（価格・MOQ）: 商品ページが bot 遮断。Anhua/Ongine/iView/eViewTek 直接 RFQ が早い。
- TI DMD 1ku 単価（部品ページの価格欄が空欄）。
- Cinemood、Lightform LF2/LFC、FunFloor、RoomAlive 原論文、CVPR 2026 指先接触論文、Optotune 大口径レンズ価格、Orbbec Femto Bolt 価格。
- elepn.com（ELEPN モジュール）は取得許可待ちでタイムアウト（未取得）。
- WebSearch の回数上限により、上記は追加セッションでの再検索が必要。
