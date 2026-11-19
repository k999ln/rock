# Gen1 BOM 価格調査（天井設置スマートパック：プロジェクタ＋センサ＋計算機）

調査日：2026-11-05
方針：**価格は出典ページに記載のあるもののみ**。数量別価格が出典に無い場合は「不明」。通貨は出典のまま（USD/EUR/GBP/AUD/NZD/JPY/RON）。
調査の制約：本セッションの Web 検索回数上限（200 回/ターン・全エージェント共有）に途中で到達したため、**第 4〜9 カテゴリ（光学エンジン・電源/取付・LED 照明・ジンバル・機構・認証費用）は検索を完了できず、大半が「不明」**。該当カテゴリは次ターンで追加調査が必要。また Digi-Key / Mouser / Alibaba の商品ページは本環境の取得ツールで本文を読めず（Digi-Key, Mouser: 価格が描画されない。Alibaba: robots 拒否）、代替として LCSC・RS・element14・各社ストア・ニュース記事を用いた。
取得不能だった URL：`https://www.jtia.or.jp/`（日本消防検定協会）, `https://www.waveshare.com/product/raspberry-pi/boards-kits/hailo-8.htm`（権限要求未応答）。

---

## 1. コンピュート（SoM / AI アクセラレータ）

| 品目 | 候補品 | 1 台 | 100 台 | 1,000 台 | 納期/備考 | 出典URL |
|---|---|---|---|---|---|---|
| RK3588S2 SoM | Radxa CM5 4GB/32GB eMMC | $69.00（2024-04 導入価格・期間限定） | 不明 | 不明 | 8GB/64GB $89、16GB/128GB $105。CM5 Lite（GPU 無）4GB/32GB $55、8GB/64GB $75、16GB/128GB $90。Allnet（独）掲載あり価格非表示。thinkrobotics（印）CM5 Lite 4GB/32GB ₹10,849.99・在庫切れ | https://radxa.com/blog/CM5-Official-Announcement ; https://shop-en.allnet.de/Radxa-CM5-Rock5-RK3588S2-Compute-module-4GB-RAM-32GB-EMMC-no-Wifi/218009 ; https://thinkrobotics.com/products/radxa-cm5-cm5-lite |
| RK3588 SoM | Firefly Core-3588J 4GB/32GB | $229（2022-03 時点、Firefly ストア） | 不明 | 不明 | 8GB/64GB $309。Firefly ストアでの現行価格は未確認（要再調査）。ロシア代理店は要ログイン | https://www.cnx-software.com/2022/03/17/rockchip-rk3588-trm-android-12-sdk-released/ ; https://e-streloy.ru/catalog/4917297-firefly-core-3588j-8gb64gb.html |
| RK3576 SoM（CM4 互換） | Banana Pi BPI-CM5 Pro 4GB/32GB | €237.75（Wi-Fi 有）／€225.75（Wi-Fi 無）openelab、いずれも売切 | 不明 | 不明 | 同一設計の ArmSoM-CM5 8GB/64GB は予約 $103、CM5-IO キャリア同梱 $138（2024-09）。※BPI-CM5「Pro」は RK3576。RK3588 版 BPI-CM5 の価格は不明 | https://openelab.io/a/s/products/banana-pi-bpi-cm5-pro ; https://www.cnx-software.com/2024/09/09/banana-pi-bpi-cm5-pro-rockchip-rk3576-raspberry-pi-cm4-alternative-with-up-to-16gb-ram-128gb-flash-a-6-tops-npu/ |
| RK3576 SoM | Firefly Core-3576JD4 4GB/32GB | $119（2024-10） | 不明 | 不明 | 8GB/64GB $149。AIO-3576JD4 キャリア込み約 $199 | https://www.cnx-software.com/2024/10/11/firefly-introduces-rockchip-rk3576-som-and-all-in-one-carrier-board-compatible-with-nvidia-jetson-orin-nano-and-orin-nx-modules/ |
| RK3576(J) SoM（Jetson 互換） | Radxa NX4 | $82.22〜$219（構成別、AliExpress、2026-01） | 不明 | 不明 | NX4 IO ボード $92.80。産業用 RK3576J 選択可 | https://www.cnx-software.com/2026/01/13/radxa-nx4-som-rockchip-rk3576j-industrial-soc-nx4io-carrier-board/ |
| Jetson Orin Nano 8GB モジュール | NVIDIA Jetson Orin Nano 8GB (Super 対応) | 不明（単品小売なし） | 不明 | **$399（1KU+、2026-07 改定後。改定前 $299）** | Orin Nano 4GB モジュール $349（旧 $199）。Orin Nano Super Dev Kit $399（旧 $249）。Orin NX 8GB $649 / 16GB $999。値上げ理由は公式発表なし（LPDDR4 高騰で一部モジュール EOL の文脈） | https://cnx-software.com/2026/07/22/nvidia-increases-the-price-of-jetson-modules-and-devkits-by-up-to-101 |
| Raspberry Pi CM5 | CM5 4GB/32GB eMMC 無線無 (CM5004032) | $135（公式プロダクトブリーフ掲載リスト価格） | 不明 | 不明 | 無線有 CM5104032 $140。8GB/32GB $200（無線 $205）。16GB/32GB $330。Lite 4GB $100。※2024-11 発売時は「$45〜$95」だったが 2025-10 に DDR4 高騰で +$5〜10 値上げ、現行ブリーフは上表のとおり大幅高 | https://pip-assets.raspberrypi.com/categories/944-raspberry-pi-compute-module-5/documents/RP-008181-DS-10-cm5-product-brief.pdf ; https://www.raspberrypi.com/news/compute-module-5-on-sale-now/ ; https://www.cnx-software.com/2025/10/02/ddr4-supply-demand-stress-leads-to-raspberry-pi-cm4-cm5-price-increases/ |
| Pi AI アクセラレータ | Raspberry Pi AI HAT+ 2（Hailo-10H、40 TOPS、8GB） | $130（公式発表価格、2026-01）／SparkFun $200（在庫切）／Adafruit $225（在庫有・2 個制限） | 不明 | 不明 | 旧 AI Kit（Hailo-8L 13 TOPS）$70、Switch Science ¥14,300 税込・売切・後継品案内 | https://www.cnx-software.com/2026/01/15/raspberry-pi-ai-hat-2-targets-generative-ai-llm-vlm-with-hailo-10h-accelerator/ ; https://www.sparkfun.com/raspberry-pi-ai-hat-2.html ; https://adafruit.com/product/6451 ; https://jeffgeerling.com/node/3382 ; https://www.switch-science.com/products/9695 |
| Hailo-8L M.2 | Raspberry Pi 純正 Hailo-8L M.2 B+M 2280 (HM21LB1C2LAE) | NZ$169.67（税抜）@1 | NZ$149.40 @10+（100 不明） | 不明 | **メーカー納期 21 週、納入開始 2027-03-08（element14 NZ）** | https://nz.element14.com/raspberry-pi/hm21lb1c2lae/ai-acceleration-mod-m-2-2280-pcie/dp/4906520 |
| Hailo-8 M.2 (26 TOPS) | Waveshare Hailo-8 M.2 | A$313.59（税抜）@1 | A$297.91 @5+（100 不明） | 不明 | Jeff Geerling の問合せでは単品 $150〜200 の回答 | https://core-electronics.com.au/hailo-8-m2-ai-accelerator-module-26-tops.html ; https://jeffgeerling.com/node/3382 |
| QCS6490 SoM | Lantronix Open-Q 6490CS SOM | $362.93（e-store） | 不明 | 不明 | 4GB/32GB・8GB/64GB・16GB/64GB。数量価格・納期は非掲載。Thundercomm TurboX C6490 は価格非公開（Macnica 経由要見積）。参考：Radxa Dragon Q6A SBC 4GB $62.07〜16GB $124.29、Thundercomm RUBIK Pi 3 $179 | https://estore.lantronix.com/products/open-q-6490cs-som-system-on-module ; https://www.cnx-software.com/2025/10/27/radxa-dragon-q6a-a-qualcomm-qcs6490-edge-ai-sbc-with-gbe-wifi-6-three-camera-connectors/ ; https://www.thundercomm.com/product/c6490-som |
| Ambarella CV5 / CV72 | — | 不明 | 不明 | 不明 | 公開価格なし（NDA 直販）。検索結果に価格情報なし | https://www.ambarella.com/products/consumer/ |

---

## 2. センサ

| 品目 | 候補品 | 1 台 | 100 台 | 1,000 台 | 納期/備考 | 出典URL |
|---|---|---|---|---|---|---|
| サーモパイル 32×24 | Melexis MLX90640ESF-BAA-000-SP | $26.70（LCSC 開始価格、在庫切） | 不明 | 不明 | BAB（55°）版は Arrow 在庫切、Digi-Key 価格取得不可。ブローカー components-store：$16.21@1 / $15.16@10 / $14.02@25（在庫 2,708、非正規） | https://lcsc.com/product-detail/Image-Sensors_Melexis-MLX90640ESF-BAA-000-SP_C17290953.html ; https://www.arrow.com/en/products/mlx90640esf-bab-000-sp/melexis.html ; https://www.components-store.com/product/Melexis/MLX90640ESF-BAB-000-SP.html |
| サーモパイル 16×12 | Melexis MLX90641ESF-BCA-000-SP | $40.85（LCSC 開始価格、在庫切） | 不明 | 不明 | dasenic 表示 $22.40@1（非正規） | https://www.lcsc.com/product-detail/C17464371.html ; https://static-lang.dasenic.com/product/melexis-mlx90641esf-bca-000-sp-6795081 |
| LWIR 160×120 | FLIR Lepton 3.5（放射測定） | $172.00（GroupGets） | 不明 | 不明 | 在庫表示矛盾（"340 left" と "Sold out" 併記） | https://groupgets.com/products/flir-lepton-3-5 |
| LWIR 160×120 広角 | FLIR Lepton 3.1R（95°H / 119°D） | $149.00（GroupGets、在庫切） | 不明 | 不明 | 数量割引非掲載 | https://groupgets.com/products/flir-lepton-31r |
| LWIR 256×192 | InfiRay Tiny1-C | $99.00（Tindie 個人出品）／$288.89（rcdrone、売切） | 不明 | 不明 | 13×13×8 mm、240 mW typ、SPI/DVP+I2C、NETD <50 mK | https://www.tindie.com/products/zenoslee/tiny1-c-thermal-mini-camera-module/ ; https://rcdrone.top/products/new-tiny1-c-25hz-mini-thermal-imager-256-192-resolution-lwir-uncooled-vox-thermal-imager-sensor-module |
| サーモパイル 32×32 | Heimann HTPA32x32d | 不明 | 不明 | 不明 | 代理店（Boston Electronics 等）見積制。公開価格見つからず | https://www.boselec.com/product-category/imaging-ir-sensors-thermopile-arrays/ |
| 60 GHz レーダ IC | Infineon BGT60TR13CE6327XUMA1 | $14.75 (LCSC) | $11.70 @100+ | 不明（リール 4,500） | 在庫 236（LCSC） | https://www.lcsc.com/product-detail/rf-transceiver-ics_infineon-technologies-bgt60tr13ce6327xuma1_C3606641.html |
| 60 GHz レーダ IC（低消費） | TI IWRL6432BDQGAMFR | $10.92 (LCSC) | $7.70 @100+ | 不明（リール 1,000） | 在庫 623。IWRL6432BDBAAMFR は $21.64@1・在庫 4。TI 直販 1ku 価格はログイン要で取得不可 | https://www.lcsc.com/product-detail/C22456994.html ; https://www.lcsc.com/product-detail/C22428198.html |
| 60 GHz レーダ AoP | TI IWR6843AOP (IWR6843ARQGALP) | 不明 | 不明 | 不明 | TI.com：在庫なし・価格非表示 | https://ti.com/product/IWR6843AOP/part-details/IWR6843ARQGALP |
| 60 GHz モジュール（呼吸/心拍） | Seeed MR60BHA2（XIAO ESP32-C6 同梱キット） | $24.90（Seeed）／£28.80 税込（PiHut、売切） | 不明 | 不明 | — | https://www.hackster.io/news/seeed-adds-home-assistant-ready-breathing-fall-detection-sensors-to-its-mmwave-range-c97eeb97b8d9 ; https://thepihut.com/products/60ghz-mmwave-breathing-and-heartbeat-detection-sensor-mr60bha2 |
| 60 GHz モジュール（転倒検知） | Seeed MR60FDA2 | $24.90（Seeed）／£28.80 税込（PiHut、売切） | 不明 | 不明 | — | 同上 ; https://thepihut.com/products/mmwave-human-fall-detection-sensor-mr60fda2-60ghz |
| カメラ IMX296（GS 1.6MP） | Arducam IMX296 カラー GS M12（RPi 用） | $80.92（RobotShop、米関税込、残 2） | 不明 | 不明 | — | https://robotshop.com/products/arducam-158mp-imx296-color-global-shutter-camera-module-m12-lens-rpi |
| カメラ IMX462（低照度 2MP） | Waveshare IMX462 IR-CUT（ISP 内蔵） | $82.99〜84.99 | 不明 | 不明 | — | https://www.waveshare.com/product/modules/cameras-audio-video/cameras.htm?mode=list&p=2 |
| カメラ IMX678（8.3MP） | Arducam IMX678 USB3 | $159.99〜174.99 | 不明 | 不明 | — | https://www.arducam.com/product/arducam-8-3mp-imx678-manual-focus-usb-3-0-camera-module/ |
| ToF 8×8 | ST VL53L8CXV0GC/1 | $7.44 (LCSC 開始価格) | 不明 | 不明 | 在庫 984 | https://www.lcsc.com/product-detail/C7386355.html |
| ToF カメラ | PMD Flexx2 | 不明 | 不明 | 不明 | 検索未達 | — |
| CO2 | Sensirion SCD41-D-R2 | $19.76 (Symmetry) | $16.33 @100 | $14.51 @600（1,000 不明） | 在庫 4,800、標準パック 600 | https://www.symmetryelectronics.com/products/sensirion/scd41-d-r2 |
| VOC/NOx | Sensirion SGP41-D-R4 | RON 31.53（税抜、SOS electronic） | RON 26.10 @100+ | RON 21.14 @1000+ | 在庫 244、T&R 2,500 | https://www.soselectronic.com/cz/products/sensirion/sgp41-sgp41-d-r4-359695 |
| 環境 4-in-1 | Bosch BME688 | $8.14 (LCSC 開始価格) | 不明 | 不明 | 在庫 5,683 | https://www.lcsc.com/product-detail/C3664478.html |
| PIR | — | 不明 | 不明 | 不明 | 検索未達 | — |
| MEMS マイクアレイ 4ch | Seeed ReSpeaker Mic Array v2.0 (107990053, XMOS, 4 mic) | A$92.25（税抜、element14 AU） | 不明 | 不明 | 在庫 32、メーカー標準納期 18 週 | https://au.element14.com/seeed-studio/107990053/respeaker-board-microphone/dp/3932082 |
| SPL / 超音波 | — | 不明 | 不明 | 不明 | 検索未達 | — |

---

## 3. 火災警報 OEM モジュール・IC

| 品目 | 候補品 | 1 台 | 100 台 | 1,000 台 | 納期/備考 | 出典URL |
|---|---|---|---|---|---|---|
| 光電式煙センサ IC（光学一体） | ADI ADPD188BI-ACEZR7 | $5.73 (LCSC) | $4.21 @100+ | 不明（リール 1,000） | 在庫 2,407 | https://www.lcsc.com/product-detail/C659442.html |
| 煙検知 AFE | TI TPS8802DCPR | 不明 | 不明 | 不明 | TI.com 在庫なし・価格非表示。参考資料：SLVAFN0（TPS8802+MSPM0 デュアル波長）、SLAA930（MSP430FR2355） | https://www.ti.com/product/TPS8802/part-details/TPS8802DCPR ; https://www.ti.com/solution/smoke-heat-detector |
| 煙検知 IC | Microchip RE46C190S16F | — (MOQ 50) | $1.18 @50 / $1.14 @250 | $1.10 @1,000 | **製造終了（最終受注 2024-10-31）→ 後継 RE46C194S16**。Master Electronics 在庫 1,000、納期約 4 週 | https://www.masterelectronics.com/en/microchip-technology/re46c190s16f-47040191.html |
| CO センサ（電気化学） | Figaro TGS5141-P00 | ₹2,441.25 税込（robozar、在庫切）／Arrow 約 $47.5〜51.0（MOQ 10、在庫 0） | 不明 | 不明 | — | https://www.robozar.com/product/figaro-tgs5141-p00-carbon-monoxide-sensor-home-air-quality-monitor/ ; https://octopart.com/part/figaro/TGS5141 |
| CO センサ（電気化学） | Figaro TGS5042-A00 | £25.38（税抜、RS UK） | £23.66 @5+（100 不明） | 不明 | 在庫 49、追加 10 個 2026-10-23 入荷 | https://uk.rs-online.com/web/p/environmental-sensor-ics/1346642?gb=s |
| CO センサ | Alphasense CO-AF | $126.50（CO2Meter、売切） | 不明 | 不明 | MOQ 10、納期 6〜8 週 | https://www.co2meter.com/products/0-500ppm-carbon-monoxide-sensor |
| 熱感知サーミスタ | — | 不明 | 不明 | 不明 | 検索未達 | — |
| 完成品煙警報器 PCB（深圳 OEM） | — | 不明 | 不明 | 不明 | Alibaba は本環境から取得不可（robots 拒否）。要再調査 | https://www.alibaba.com/product-detail/Nice-Price-Independent-Fire-Alarm-Smoke_1600614002653.html |
| 日本 住警器メーカー（モジュール販売可否） | 新コスモス電機 火報くん SA-262E/265E | 価格・納期「問い合わせ」 | 不明 | 不明 | iPROS 上に OEM/モジュール販売の記載なし。ホーチキ・能美・パナソニック・ニッタンは検索未達（要再調査） | https://mono.ipros.com/product/detail/2000540333 |
| 日本 プラグ式警報器 | スペースワークス PKK-1（温度式 80℃） | 価格帯「〜1 万円」 | 不明 | 不明 | 納期〜1 週。「技術移転・共同開発」の問い合わせ受付。2016 年更新で古い | https://www.ipros.com/product/detail/2000090765 |

### 日本の制度メモ（住宅用火災警報器）
- 住宅用防災警報器は 2010 年時点では「鑑定」品目であったが（総務省事業仕分け資料）、現在は検定対象 12 品目の第 12 項目「住宅用防災警報器」として**検定（型式承認＝総務大臣、型式試験・型式適合検定＝日本消防検定協会または登録検定機関）**。流れ：型式試験申請→第 1 段階（試料・図面・部品表で性能・寸法試験）→第 2 段階（工場で検査設備・製造工程・社内検査体制審査）→型式承認申請→承認→型式適合検定申請→抜取試験→合格表示。出典：https://www.kaigai-shobo.jp/files/internationalforum/20201001_FirePreventionMeasuresAndFireProtectionEquipmentCertification.pdf ; https://www.fdma.go.jp/singi_kento/kento/items/kento254_13_shiryo1-4-7.pdf
- **手数料**：消防法施行令 別表第 3 で規定（総務省資料は金額非掲載）。住宅用防災警報器の型式承認・型式適合検定の金額は**本調査では取得できず（不明）**。参考として自治省告示第 251 号の「感知器の型式変更試験」手数料：光電式スポット型 20,100 円／件（自動試験機能対応は +7,800 円）、熱煙複合式 27,200 円等。出典：https://www.fdma.go.jp/laws/kokuji/post76/ ; https://www.soumu.go.jp/menu_sosiki/syokan/gyoumu_jigyou/pdf/14.pdf
- **審査期間**：不明（jtia.or.jp は本環境から取得不可）。

---

## 4. プロジェクタ光学エンジン

| 品目 | 候補品 | 1 台 | 100 台 | 1,000 台 | 納期/備考 | 出典URL |
|---|---|---|---|---|---|---|
| DMD 0.23" 1080p | TI DLP230NP | 不明（TI.com ログイン要） | 不明 | 不明 | **Active**。960×540 ミラー配列、5.4 µm。EVM DLPDLCR230NPEVM 在庫有（価格非表示）。制御 DLPC3436 + DLPA2000/2005/3000/3005 | https://www.ti.com/product/DLP230NP |
| DMD 0.2" WVGA | TI DLP2010 | 不明 | 不明 | 不明 | **LAST TIME BUY（生産終了予定）** | https://www.ti.com/product/DLP2010 |
| DMD 0.3" 720p | TI DLP3010 | 不明 | 不明 | 不明 | **LAST TIME BUY**。システム輝度最大 300 lm | https://www.ti.com/product/DLP3010 |
| DMD 0.47" 4K UHD | TI DLP471TP | 不明 | 不明 | 不明 | Active。システム輝度最大 1,800 lm。EVM 在庫有（価格非表示） | https://www.ti.com/product/DLP471TP |
| 中国製光学エンジン（Alibaba） | — | 不明 | 不明 | 不明 | Alibaba 取得不可（robots 拒否）＋検索上限到達。要再調査 | — |
| Anhua / Appotronics モジュール | — | 不明 | 不明 | 不明 | 検索未達 | — |
| レーザ MEMS 走査 | Nebra Anybeam / Sony MP-CL1 / Ultimems | 不明 | 不明 | 不明 | 検索未達（レーザクラスも未確認） | — |
| 500〜900 lm RGB LED ピコエンジン完成品 | — | 不明 | 不明 | 不明 | 検索未達 | — |

---

## 5. 電源・取付

| 品目 | 候補品 | 1 台 | 100 台 | 1,000 台 | 納期/備考 | 出典URL |
|---|---|---|---|---|---|---|
| 引掛シーリング（角形/丸形/埋込ローゼット） | パナソニック WG1000 等 | 不明 | 不明 | 不明 | 検索未達。耐荷重（ローゼット vs シーリング）も未確認 | — |
| AC-DC 60/100/150 W オープンフレーム | Mean Well EPP / RPS / IRM | 不明 | 不明 | 不明 | 検索未達 | — |
| US 4" オクタゴンボックス取付板 | — | 不明 | 不明 | 不明 | 検索未達 | — |
| PoE+ PD モジュール | Silvertel Ag5xxx | 不明 | 不明 | 不明 | 検索未達 | — |
| バックアップ（スーパーキャパシタ/Li） | — | 不明 | 不明 | 不明 | 検索未達 | — |
| Wi-Fi 6 / Thread / Zigbee モジュール | Espressif ESP32-C6-WROOM-1-N8 | $2.98 (LCSC 開始価格) | 不明 | 不明 | 在庫 5,384 | https://www.lcsc.com/product-detail/C5366877.html |
| BLE/Thread SoC | Nordic nRF5340 | 不明 | 不明 | 不明 | 検索未達 | — |
| Wi-Fi/BT（Qualcomm） | — | 不明 | 不明 | 不明 | 検索未達 | — |

---

## 6. LED 照明モジュール

| 品目 | 候補品 | 1 台 | 100 台 | 1,000 台 | 納期/備考 | 出典URL |
|---|---|---|---|---|---|---|
| COB 4,000〜5,000 lm + ドライバ | — | 不明 | 不明 | 不明 | 検索未達 | — |
| 0–10 V / PWM 調光ドライバ | — | 不明 | 不明 | 不明 | 検索未達 | — |

---

## 7. ジンバル / チルトアクチュエータ

| 品目 | 候補品 | 1 台 | 100 台 | 1,000 台 | 納期/備考 | 出典URL |
|---|---|---|---|---|---|---|
| 小型パンチルト（ステッパ/BLDC、スリップリング付） | — | 不明 | 不明 | 不明 | 検索未達 | — |
| ジンバルモータ | GB2208 等 | 不明 | 不明 | 不明 | 検索未達 | — |

---

## 8. 機構

| 品目 | 候補品 | 1 台 | 100 台 | 1,000 台 | 納期/備考 | 出典URL |
|---|---|---|---|---|---|---|
| PC/ABS 射出成形筐体 Ø300 mm 2〜3 部品 金型費（中国） | — | 不明 | 不明 | 不明 | 検索未達 | — |
| 同 部品単価 | — | 不明 | 不明 | 不明 | 検索未達 | — |
| ヒートシンク / ファン | Noctua 40 mm, Sunon | 不明 | 不明 | 不明 | 検索未達 | — |
| スピーカ 2×5 W フルレンジ | — | 不明 | 不明 | 不明 | 検索未達 | — |

---

## 9. 認証費用・期間

| 認証 | 対象 | 費用 | 期間 | 備考 | 出典URL |
|---|---|---|---|---|---|
| UL 217（煙警報器） | 煙検知部 | 不明 | 不明 | **UL 217 第 10 版（2024）/ CAN/ULC 531 第 5 版への移行期限 2027-11-17**。既存認証品も全面再評価が必要（変更が大きいため）。UL の AHJ 向け資料は火災報知「サービス会社」認証の費用（「俗説の 1 万ドルの半分未満」）しか示さず、製品 Listing 費用ではない | https://w3inte.intertek.com.mx/siteassets/resources/sun/2025/ul-217-superseded-by-ul-217---ulc-531-sun-ed-11-17-2027.pdf ; https://www.ul.com/sites/default/files/2019-04/Myths_vs_Facts_Handout_Cert_Services_AHJ_August_2017_FINAL_V1.pdf |
| UL 2034（CO 警報器） | CO 検知部 | 不明 | 不明 | 検索未達 | — |
| 日本 検定（住宅用防災警報器） | 煙/熱検知部 | 不明（消防法施行令 別表第 3。参考：感知器型式変更試験 光電式 20,100 円/件） | 不明 | 型式試験→型式承認（総務大臣）→型式適合検定（日本消防検定協会）。工場審査（第 2 段階）を含む | https://www.fdma.go.jp/laws/kokuji/post76/ ; https://www.kaigai-shobo.jp/files/internationalforum/20201001_FirePreventionMeasuresAndFireProtectionEquipmentCertification.pdf |
| PSE（電気用品安全法：照明器具/電源） | 照明・AC-DC | 不明 | 不明 | 検索未達 | — |
| 技適（電波法） | Wi-Fi/Thread/60 GHz レーダ | 不明 | 不明 | 検索未達。※60 GHz レーダは 技適 の対象周波数・空中線電力要件を別途確認必要 | — |
| FCC / IC | 無線 | 不明 | 不明 | 検索未達 | — |
| CE | 全体 | 不明 | 不明 | 検索未達 | — |
| UL/IEC 62368-1 | 機器安全 | 不明 | 不明 | 検索未達 | — |
| IEC 60825 / IEC 62471（レーザ / 光生物学的安全） | プロジェクタ | 不明 | 不明 | 検索未達 | — |

---

## 長納期・EOL 注意

1. **TI DLP2010 / DLP3010 が「LAST TIME BUY」**（TI.com 表示）。小型 DMD は DLP230NP（0.23" 1080p、Active）か DLP471TP（0.47"、Active）に寄せるべき。中国製エンジンを選ぶ際も搭載 DMD の型番を確認。
2. **Microchip RE46C190 は製造終了**（最終受注 2024-10-31、後継 RE46C194S16）。
3. **Hailo-8L（RPi 純正 M.2）はメーカー納期 21 週、納入 2027-03 開始**（element14 NZ）。RPi AI HAT+ 2（Hailo-10H）も SparkFun 在庫切（Adafruit は 2 個制限で在庫有）。
4. **NVIDIA Jetson 全モジュール 2026-07 に 33〜101% 値上げ**。Orin Nano 8GB は 1KU $399。背景に LPDDR4 高騰による旧モジュール EOL。
5. **Raspberry Pi CM5 も DDR4 高騰で値上げ**（2025-10）。現行プロダクトブリーフでは 4GB/32GB $135 と発売時（$45〜95）から大幅上昇。メモリ搭載 SoM 全般に価格変動リスク。
6. **Melexis MLX90640 / MLX90641 は LCSC・Arrow で在庫切**。正規流通で 1,000 個の確保は要前倒し発注。
7. **TI IWR6843AOP / TPS8802 は TI.com 在庫なし**（サンプル購入制限表示）。IWRL6432 は LCSC に在庫あり。
8. **Seeed MR60BHA2 / MR60FDA2 は PiHut 売切**（Seeed 直販 $24.90）。
9. **Banana Pi BPI-CM5 Pro は openelab 売切**、Radxa CM5 は Allnet で価格非表示、thinkrobotics 在庫切。
10. **UL 217 第 10 版への移行期限 2027-11-17**。これ以降は新版での評価が必須。初版認証を 2027 年前後に計画する場合は最初から第 10 版で申請する。
11. **Figaro TGS5141 は Arrow 在庫 0（MOQ 10）**、Alphasense CO-AF は MOQ 10・納期 6〜8 週。
12. **ReSpeaker Mic Array v2.0 のメーカー標準納期 18 週**。

---

## 追加調査が必要な項目（次ターン）
- 第 4〜9 カテゴリ全般（Alibaba 光学エンジン、引掛シーリング/ローゼット耐荷重・WG1000 価格、Mean Well EPP/RPS/IRM、Silvertel Ag5xxx、nRF5340、COB+ドライバ、ジンバル、金型費、ヒートシンク/ファン、スピーカ）。
- 認証費用（UL 217/2034 Listing 見積、PSE、技適、FCC/IC、CE、62368-1、60825/62471）。
- 日本消防検定協会の手数料表・標準処理期間（jtia.or.jp を直接確認）。
- ホーチキ・能美・パナソニック・ニッタンのモジュール/OEM 供給可否。
- Digi-Key / Mouser の 1,000 個価格（本環境で描画不可のため、ブラウザ経由または API で取得）。

---
---

# 第 2 ターン追加調査（カテゴリ 4〜9）

調査日：2026-11-05（第 2 ターン）。方針は第 1 ターンと同じ：**価格は出典ページに記載のあるもののみ**、数量別価格が無ければ「不明」。通貨は出典のまま（USD/GBP/EUR/SEK/CNY/NZD/AUD/JPY）。取得不能だった URL：`uk.rs-online.com/web/c/?searchTerm=…`（検索ページは robots 拒否。個別商品ページは取得可）、`youngoptics.com`（client error）、`anhuaoe.com`（robots 拒否）、`parts-express.com`（本文空）、`soundimports.eu` の一部、`laws.e-gov.go.jp`（本文描画されず）、`jfeii.or.jp`（日本消防検定協会。手数料ページが見つからず）。※第 1 ターンで「取得不能」とした `jtia.or.jp` は日本繊維輸入組合であり誤 URL。日本消防検定協会の正しいドメインは `jfeii.or.jp`。

---

## 4A. プロジェクタ光学エンジン（追加）

| 品目 | 候補品 | 1 台 | 100 台 | 1,000 台 | 納期/備考 | 出典URL |
|---|---|---|---|---|---|---|
| DMD 0.23" 1080p 単体 | TI DLP230NPAFQP | $100.20（eBay ブローカー出品、終了済・非正規） | 不明 | 不明 | TI 直販・Mouser は価格非表示（ログイン要）。参考値のみ | https://www.ebay.de/itm/355979176911 ; https://www.mouser.ca/ti-dlp230np-dmd |
| DLP230NP EVM（光学エンジン付き完成評価基板） | TI DLPDLCR230NPEVM | 不明（TI.com ログイン要、Digi-Key/Mouser 価格描画不可） | — | — | **最大 100 lm**、Young Optics 製エンジン搭載、81×87 mm、RGB 18bit パラレル入力、RPi4 直結。5V/4A 電源別売 | https://www.ti.com/tool/DLPDLCR230NPEVM ; https://www.mouser.fi/new/texas-instruments/ti-dlpdlcr230npevm-lightcrafter-display/ |
| DLP4710 EVM（0.47" 1080p） | TI DLPDLCR4710EVM-G2 | $422.91（LCSC、在庫切） | 不明 | 不明 | RS（SE）は「取扱終了予定・再入荷不明」 | https://www.lcsc.com/product-detail/C2972034.html ; https://se.rs-online.com/web/p/display-development-tools/2659765 |
| 0.23" 1080p 光学モジュール（中国メーカー） | Anhua Optoelectronics H23 / H23E / HY33HC-MFC / HY37HB-MFC | 不明 | 不明 | 不明 | TI 3P（サードパーティ）ページに「1080p モバイルプロジェクタ向け光学モジュール」として掲載。輝度・寸法・消費電力・価格は TI ページに非掲載、anhuaoe.com は取得不可 → 直接見積要 | https://www.ti.com/tool/ANHUA-3P-DLP230NP-D |
| 0.23" 光学モジュール（iView） | iView IVIEW-3P-DLP230KP-D / 1281GS（720p、スマートスピーカ向け） | 不明 | 不明 | 不明 | TI 3P ページ。価格・輝度非掲載 | https://ti.com/tool/IVIEW-3P-DLP230KP-D |
| 0.47" 1080p RGB-LED 光学エンジン（780 lm） | iView Limited "Pico Optical Module" IPD 1961GQ | 不明 | 不明 | 不明 | 780 lm、1920×1080、コントラスト 600:1、154×130×45 mm（レンズ 40 mm）、投射 0.6 m〜∞。HKTDC 掲載、価格非掲載 | https://sourcing.hktdc.com/en/Product-Detail/Pico-Optical-Module-1X1UBR3O |
| 0.23" FHD DMD + RGB LED **完成品プロジェクタ**（550 ANSI lm） | 中国メーカー（Global Sources 掲載、社名非表示、従業員 100〜149 名） | US$232.9（1〜499 個） | US$232.9（1〜499 個） | **US$227.9（500〜2,999 個）／US$222.9（3,000 個〜）** | 550 ANSI lm、15,000 mAh（55.5 Wh）バッテリ・5W×2 スピーカ内蔵の完成品。納期 7〜31 日。**光学エンジン単体ではなく完成品の価格**。エンジン単体はこれより大幅に安いはず（要見積） | https://m.globalsources.com/Projector/DLP-1224174385p.htm |
| 中国製 DLP 光学エンジン（Made-in-China） | Xiamen Zhisen 等 | FOB US$3,000〜10,000（プレースホルダ価格） | 不明 | 不明 | 掲載 26 件すべて 0.45〜0.65" DMD（3D プリンタ/業務用）、「300 lm」「MOQ 1」の定型値。**実売価格ではなく交渉前提の表示**。0.23" 小型エンジンの掲載なし | https://www.made-in-china.com/products-search/hot-china-products/DLP_Optical_Engine.html |
| レーザ MEMS 走査モジュール | **Ultimems HD309D1-C1** | 不明 | 不明 | 不明 | **Class 1（IEC 60825-1:2014 + IEC 62471-5）**、34±3 lm、720p/60fps、消費電力 通常 <5.5 W・ピーク 6.5 W。推奨金属ベース 105×66.5×23 mm。価格は要見積 | https://manuals.plus/ultimems/hd309d1-c1-scanning-projection-module-manual.pdf |
| レーザ MEMS 走査（RPi HAT） | Nebra AnyBeam HAT | £166.66（税抜、Nebra 直販、**売切**）／£191.66（Pi Supply、売切）／Kickstarter 時 $260 | 不明 | 不明 | 23 ANSI lm（「DLP 換算 130 lm」）、720p/60fps、3.0 W、5V/1.5A。レーザクラスは製品ページ・データシートに記載なし（不明）。MEMS エンジン供給元非公開 | https://nebra.com/products/nebra-anybeam-hat-laser-projector-for-the-raspberry-pi ; https://uk.pi-supply.com/collections/nebra-anybeam-mems-laser-projectors ; https://media.distrelec.com/Web/Downloads/_t/ds/NBR-0002_eng_tds.pdf ; https://www.cnx-software.com/2019/04/10/nebra-anybeam-laser-projector-raspberry-pi/ |
| レーザ MEMS 走査（Sony） | Sony MP-CL1（完成品、生産終了） | $350（2015 年発売時） | — | — | 37 lm、1920×720、バッテリ 2 時間。エンジン単体の外販なし | https://www.soundandvision.com/content/today%E2%80%99s-mini-projectors-put-big-picture-remarkably-small-pocket-sony-mp-cl1-laser-projector |
| 500〜900 ANSI lm RGB-LED エンジン（MOQ 価格） | — | 不明 | 不明 | 不明 | 公開 MOQ 価格はエンジン単体では見つからず。上記 550 ANSI lm 完成品（$222.9@3,000）と iView 780 lm エンジン（価格非掲載）が最も近い公開情報。Appotronics は検索未達 | — |

**所見（4A）**：0.23" DMD 系で lumen を 500 lm 以上にするのは DLP230NP の仕様上（EVM 100 lm、DLP3010 系 300 lm 上限）困難で、550〜780 lm 級は 0.47" DMD（DLP471TP / DLP4710）エンジンが現実的。レーザ MEMS 走査は Class 1 を達成した市販モジュール（Ultimems）があるが輝度は 20〜40 lm 級で天井投射用途には不足。

---

## 5A. 電源・取付（追加）

| 品目 | 候補品 | 1 台 | 100 台 | 1,000 台 | 納期/備考 | 出典URL |
|---|---|---|---|---|---|---|
| 引掛シーリング（角型ボディ） | パナソニック WG1000P 角型引掛シーリング | **¥333 税込（¥303 税抜）** ケーズデンキ／MonotaRO 角型ボディ ¥285 税込〜 | ¥242 税込/個（MonotaRO 10 個セット ¥2,418） | 不明 | 在庫有・1〜2 日。MonotaRO 当日出荷 | https://www.ksdenki.com/shop/g/g4902710032035/ ; https://www.monotaro.com/s/q-%E5%BC%95%E6%8E%9B%E3%82%B7%E3%83%BC%E3%83%AA%E3%83%B3%E3%82%B0%20%E3%83%91%E3%83%8A%E3%82%BD%E3%83%8B%E3%83%83%E3%82%AF/ |
| 引掛シーリング（丸型フル） | パナソニック 丸型フル引掛シーリング | ¥351 税込（MonotaRO）／別型 ¥439 | ¥330 税込/個（10 個セット ¥3,298） | 不明 | 当日出荷 | 同上 |
| 引掛埋込ローゼット / フル引掛ローゼット | パナソニック WG6005 系（型番はページ非表示） | ¥1,318 税込 | 不明 | 不明 | 当日〜5 日。※器具側に「耐荷重 5 kg 超は ローゼット（ハンガー付）」が照明業界の慣例だがページ上の耐荷重記載なし → 要カタログ確認 | 同上 |
| 引掛シーリングキャップ（器具側） | パナソニック 角型引掛シーリングキャップ WG4000 系 | ¥219〜230 税込 | 不明 | 不明 | 当日出荷。ロック付（黒）¥439 | 同上 |
| 引掛シーリングハンガ（吊り金具） | パナソニック 丸型 WK1102 適合 ¥538／角型 ¥252 | ¥252〜538 税込 | 不明 | 不明 | 当日出荷 | 同上 |
| 引掛埋込ローゼット取付金具 | パナソニック | ¥164 税込 | 不明 | 不明 | 当日出荷 | 同上 |
| 増設アダプタ（ヒートン） | パナソニック WG9910 | ¥87 税込（¥79 税抜） | 不明 | 不明 | 4 日以内。WG4481〜4483 用 | https://www.monotaro.com/g/00409756/ |
| 東芝 引掛シーリング | — | 不明 | 不明 | 不明 | 検索未達（パナソニックで代替可） | — |
| 秋月電子 | — | 取扱なし | — | — | 「引掛シーリング」検索 0 件 | https://akizukidenshi.com/catalog/goods/search.aspx?search=x&keyword=%E5%BC%95%E6%8E%9B%E3%82%B7%E3%83%BC%E3%83%AA%E3%83%B3%E3%82%B0 |
| AC-DC 60 W 封止モジュール | Mean Well IRM-60-12 | **£12.89**（税抜、RS UK）／NZ$50.18（element14 NZ） | £11.35 @50+（RS UK）／NZ$39.04 @100+ | 不明 | RS 在庫有。**メーカー標準納期 20 週**（element14） | https://uk.rs-online.com/web/p/switching-power-supplies/1358968 ; https://nz.element14.com/mean-well/irm-60-12/power-supply-ac-dc-12v-5a/dp/2815519 |
| AC-DC 80 W 封止モジュール | Mean Well IRM-90-12 | £21.50（税抜、RS UK） | 不明（数量割引非掲載） | 不明 | 在庫有、追加 36 個 2026-10-19 | https://uk.rs-online.com/web/p/switching-power-supplies/2006186 |
| AC-DC 102 W 筐体型 | Mean Well LRS-100-12 | £19.77（RS UK）／$15.80（Jameco） | £16.15 @50+（RS）／$13.90 @20+（Jameco） | 不明 | RS 在庫 220。Jameco 在庫 39・補充 16 週・関税対象 | https://uk.rs-online.com/web/p/switching-power-supplies/1065844 ; https://www.jameco.com/z/LRS-100-12-MEAN-WELL-102W-12V-8-5A-Single-Output-High-Efficiency-Power-Supply_2257678.html |
| AC-DC 102 W オープンフレーム PFC | Mean Well EPP-100-12 | $40.55（Jameco／Bravo） | $35.75 @25+（Jameco、100 不明） | 不明（Jameco「大口見積」） | Jameco 納期 2 週 | https://www.jameco.com/z/EPP-100-12-MEAN-WELL-AC-to-DC-Switching-LED-Open-Frame-Power-Supply-Single-Output-with-PFC-Function-12V-8-5A-102W_2172391.html ; https://www.bravoelectro.com/epp-100-12.html |
| AC-DC 120 W オープンフレーム 医療/ITE | Mean Well RPS-120-12 | $23.31（Future） | $22.20 @30+（100 不明） | 不明 | **在庫 0、工場納期 16 週** | https://futureelectronics.com/p/6186678 |
| PoE+/bt PD モジュール 60 W | Silvertel Ag5810 | **$21.66**（Symmetry/Braemac）／¥3,413.97（Farnell JP） | $18.51 @112 | $18.37 @504（1,000 不明） | Symmetry 在庫 463。Farnell 在庫 32・**メーカー納期 20 週** | https://symmetryelectronics.com/products/silvertel/ag5810 ; https://jp.farnell.com/silvertel/ag5810/power-over-ethernet-module-12/dp/4472697 |
| Ag5812 | — | 不明 | 不明 | 不明 | 検索未達（Ag5810 で代替） | — |
| 10 年リチウム一次電池 AA 3.6 V | Tadiran TL-5903/S | $9.28 @5（MOQ 5） | $5.04 @100 | **$5.00 @1,080** | Master Electronics 在庫 4,032、標準納期 18 週。ページに「製造終了」注記あり（要確認、後継 TL-5903/P/T 等） | https://www.masterelectronics.com/en/tadiran-batteries/tl5903s-45303486.html |
| CR123A リチウム | EEMB CR123A | 不明（Özdisan 在庫 0・要見積） | 不明 | 不明 | 汎用 CR123A（ormix.lv）€3.50 @1／€2.50 @25、在庫 0 | https://www.ozdisan.com/en/p/lithium-batteries-483/eemb-cr123a-1431679 ; https://ormix.lv/en/product/34742 |
| スーパーキャパシタ | — | 不明 | 不明 | 不明 | 未調査（優先度低） | — |
| nRF5340 モジュール（BLE 5.2 + 802.15.4/Thread + NFC） | Ezurio（旧 Laird）BL5340 453-00052R（内蔵アンテナ、T&R） | **$11.15** | $10.77 @100 | **$10.22 @1,000** | 在庫・納期非掲載（Symmetry） | https://www.symmetryelectronics.com/products/ezurio/453-00052r |
| nRF52840 モジュール（BLE/Thread/Zigbee）※nRF5340 ではない | Fanstel BT840F | $13.21 | $10.07 @100 | **$8.77 @1,000** | 標準パック 1,000。Fanstel の nRF5340 版は BT40F（価格未取得） | https://www.symmetryelectronics.com/products/fanstel-corporation/bt840f |
| Thread/Matter 対応 Wi-Fi 6 モジュール | Espressif ESP32-C6-WROOM-1-N8 | $2.98（第 1 ターン既出） | — | — | — | https://www.lcsc.com/product-detail/C5366877.html |
| US 4" オクタゴンボックス（ハンガーバー付・ファン対応） | Carlon B620KR-CFB（PVC 20 cu in） | **$11.42**（Home Depot） | 不明 | 不明 | バー 14.38〜22.5"、耐荷重 ファン 35 lb／照明 50 lb | https://www.homedepot.com/p/p/329774303 |
| US 4" オクタゴン金属ボックス（ハンガー付） | Hubbell RACO 926-1（1-1/2" 深） | $29.51（Platt） | 不明 | 不明 | Platt 在庫 442 | https://www.platt.com/p/0632943/hubbell-raco/4-octagon-ceiling-box-with-hanger-1-1-2-deep-kos-metallic/050169092613/rac9261 |

---

## 6A. LED 照明モジュール（追加）

| 品目 | 候補品 | 1 台 | 100 台 | 1,000 台 | 納期/備考 | 出典URL |
|---|---|---|---|---|---|---|
| COB 5,700 lm 級 | Citizen CLU048-1212C4-403M2K1（4000 K, CRI80, Vf 34.6 V, 5,734 lm） | $14.93（LCSC 開始価格、**在庫切**） | 不明 | 不明 | — | https://lcsc.com/product-detail/Chip-On-Board-COB-Light-Sources_CITIZEN-CLU048-1212C4-403M2K1_C6883124.html |
| COB 10,000 lm 級（絞って 5,000 lm 運用可） | Bridgelux Vero 29 BXRC-30E10K0-D-73（3000 K, CRI80, 81.3 W, 2.1 A, Vf 38.7 V, LES 29.2 mm） | 248.29 SEK（税抜、Farnell SE） | 221.86 SEK @100+ | 不明 | 在庫 28、**メーカー標準納期 28 週** | https://se.farnell.com/bridgelux/bxrc-30e10k0-d-73/cob-led-warm-white-3000k-81-3w/dp/2916914 |
| Cree CXB | — | 不明 | 不明 | 不明 | 未調査（上記 2 種で代替） | — |
| 定電流 LED ドライバ 42 W 調光（PWM / 1〜10 V） | Mean Well LCM-40（350〜1,050 mA 選択、2〜100 V） | **£23.39**（税抜、RS UK） | £21.64 @25+（100 不明） | 不明 | 在庫有、追加 188+33 個 2026-10-19、108 個 2026-10-26 | https://uk.rs-online.com/web/p/led-drivers/7717720 |
| 定電流 LED ドライバ 35 W 非調光 | Mean Well APC-35-700 | £8.83 | £7.85 @25+ | 不明 | 在庫 74、追加 75 個 2027-02-19 | https://uk.rs-online.com/web/p/led-drivers/7717786 |
| 定電圧 LED 電源 50 W 24 V 非調光 | Mean Well SLD-50-24 | £14.39 | £12.88 @100+ | 不明 | 在庫 36、追加 20 個 2027-03-01 | https://uk.rs-online.com/web/p/led-drivers/2077595 |
| ELG-50 / LDD / APV 系 | — | 不明 | 不明 | 不明 | RS 検索ページが robots 拒否のため個別ページ到達できず | — |
| **参考：8 畳用 LED シーリングライト完成品** | アイリスオーヤマ CL8DL-HADCF（4,000 lm、調光 10 段・調色 11 段） | **¥7,678 税込**（ケーズデンキ） | — | — | 消費電力 約 40 W 級。旧型 CL8D5.0KC は ¥5,580 税込（ビックカメラ、生産完了） | https://www.ksdenki.com/shop/g/g4967576769396/ ; https://www.biccamera.com/bc/item/3512917/ |

**所見（6A）**：8 畳用完成品が ¥7,678（小売）で売られている以上、COB + ドライバ単体（LCSC $15 + RS £23 ≒ ¥6,000〜7,000 @1）は 1 台買いでは割高。1,000 台では COB $5〜8、ドライバ $8〜12 程度が相場だが本調査では公開数量価格を確認できず（不明）。

---

## 7A. パンチルト / ジンバル（追加）

| 品目 | 候補品 | 1 台 | 100 台 | 1,000 台 | 納期/備考 | 出典URL |
|---|---|---|---|---|---|---|
| ジンバルモータ + AS5048A エンコーダ | iFlight iPower GM2804（12N14P、Ø35×25 mm、51 g、中空軸 Ø8/6.5、9 Ω、250〜350 g·cm、≤25 W） | **$38.99**（iFlight 直販） | 不明 | 不明 | 在庫有 | https://shop.iflight.com/ipower-gm2804-gimbal-motor-with-as5048a-encoder-pro288 |
| ジンバルモータ（磁気リング内蔵） | iFlight iPower GBM2804H-100T（Ø35×15 mm、39 g、10 Ω） | €38.99（upgraderc.be） | 不明 | 不明 | 在庫有（サプライヤ） | https://upgraderc.be/products/iflight-ipower-gbm2804h-100t-gimbal-motor-w-integrated-magnetic-ring |
| GB2208 | — | 不明 | 不明 | 不明 | 検索未達（GM2804 系で代替） | — |
| スリップリング 6 ch 2 A（フランジ付 Ø22） | Adafruit #736 | **$14.95** | 不明 | 不明 | — | https://www.adafruit.com/category/230 |
| スリップリング 6 ch 2 A（ミニ Ø12） | Adafruit #775 | $17.50 | 不明 | 不明 | — | 同上 |
| スリップリング 12 ch 2 A（ミニ Ø12） | Adafruit #1195 | **$24.95** | 不明 | 不明 | — | 同上 |
| スリップリング 6 ch 2 A | SparkFun（RobotShop） | $21.50 | 不明 | 不明 | 在庫表示なし | https://www.robotshop.com/products/sparkfun-slip-ring-6-wire-2a |
| 小型ギヤドステッパ 5 V（28BYJ-48 相当） | Adafruit #858 | $4.95 | $3.96 @100+ | 不明 | 在庫有。ドライバ ULN2003 別 | https://www.adafruit.com/product/858 |
| NEMA17 ステッパ 12 V 350 mA | Adafruit #324 | $14.00 | $11.20 @100+ | 不明 | 在庫有 | https://www.adafruit.com/product/324 |
| ステッパドライバ | — | 不明 | 不明 | 不明 | 未調査（A4988/TMC2209 は LCSC $1〜3 帯が相場だが未確認） | — |

---

## 8A. 機構（追加）

| 品目 | 候補品 | 1 台 | 100 台 | 1,000 台 | 納期/備考 | 出典URL |
|---|---|---|---|---|---|---|
| 射出成形 金型費（中国）— アルミ単キャビティ | 業界レンジ | **$1,000〜5,000**（abismould）／$1,000〜3,000・7〜14 日（Haizol） | — | — | 寿命 5〜10 万ショット。Ø300 mm 筐体 2〜3 部品なら部品数分 | https://www.abismould.com/info/how-much-does-plastic-injection-molding-cost-103311378.html ; https://www.haizol.com/blog/low-volume-injection-molding |
| 同 — P20 鋼 単キャビティ | 業界レンジ | **$10,000〜25,000**（abismould）／$8,000〜15,000（CoreLMould）／$1,500〜8,000・10〜20 日（Haizol） | — | — | 寿命 50 万ショット+。サイドアクション（スライド/リフター）1 箇所 +$1,500〜5,000、H13 硬化 +20〜30%、テクスチャ +15〜25% | 同上 ; https://cm-astro-landingpage.pages.dev/en/blog/injection-molding-costs-china-comparison |
| 同 — 硬化鋼 多キャビティ | 業界レンジ | $25,000〜80,000（abismould）／$5,000〜25,000・20〜40 日（Haizol） | — | — | 寿命 100 万ショット+ | 同上 |
| 射出成形 部品単価（ABS、1,000 個） | 業界レンジ | — | — | **約 $8/個（金型償却込、Haizol）／$1.50〜4.00（アルミ型・1K〜5K 帯、金型別、abismould）** | 1 万個で $0.18〜0.35/個（CoreLMould）。T1 サンプル 10〜15 営業日、1,000 個納入（空輸込）20〜28 日（Haizol）。**Ø300 mm 級の具体見積は無く、上記は一般値** | 同上 |
| 40 mm ファン 5 V 静音 | Noctua NF-A4x10 5V | $17.23（税抜、3DJake） | 不明 | 不明 | 在庫 8 | https://www.3djake.com/noctua/fan-5v-nf-a4x10 |
| 40×10 mm ファン 12 V | Sunon MF40101V1-1000U-A99（8 cfm、0.62 W） | €5.99（税抜、RS IE） | €4.30 @50+ | 不明 | 在庫 47、追加 200 個 2026-12-22、400 個 2027-02-02 | https://ie.rs-online.com/web/p/axial-fans/2025401 |
| 40×10 mm ファン 5 V | Sunon MF40100V1-1000U-A99 | CNY 83.78（税抜、element14 CN） | CNY 46.92 @100+ | 不明（250+ CNY 44.40） | 在庫 59、**メーカー標準納期 25 週** | https://www.element14.cn/en-CN/sunon/mf40100v1-1000u-a99/dc-fan-vapo-40mm-7000rpm-5vdc/dp/4382059 |
| 2" フルレンジ 5 W 4 Ω | Dayton Audio CE48-4（5 W RMS/10 W max） | **€7.95**（SoundImports） | 不明（4 個で €7.55） | 不明 | 在庫 10+ | https://www.soundimports.eu/en/dayton-audio-ce48-4.html |
| 32 mm フルレンジ 2 W 4 Ω | Dayton Audio CE32A-4 | €5.90 税込（€4.92 税抜、Audiophonics） | 不明 | 不明 | 残少 | https://www.audiophonics.fr/en/midrange-midbass-full-range/dayton-audio-ce32a-4-mini-speaker-driver-full-range-2w-4-ohm-81db-240hz-20khz-o32cm-p-12510.html |
| BMR フルレンジ | Tectonic TEBM35C10-4 | 不明 | 不明 | 不明 | Parts Express / SoundImports ページ取得不可 | — |
| 85 dB 圧電サウンダ | Murata PKM22EPPH4007-B0（85 dB@10 cm、Ø22×10.8 mm） | A$1.34（税抜、element14 AU） | A$0.79 @50+ | A$0.579 @750+ | **在庫 19・「再入荷なし」、RS UK は Discontinued**。後継品選定要（Murata PKLCS 系等） | https://au.element14.com/murata/pkm22epph4007-b0/sounder-4khz-85db/dp/2443203 ; https://uk.rs-online.com/web/p/piezo-buzzers/1669831 |
| 78 dB 圧電サウンダ（小型） | Murata PKM13EPYH4000-A0 | $0.166（LCSC 開始価格） | 不明 | 不明 | 在庫 695。※住警器は 70 dB/1 m 以上が基準（日本）、UL 217 は 85 dBA/10 ft | https://www.lcsc.com/product-detail/C162678.html |

---

## 9A. 認証費用・期間（追加）

| 認証 | 対象 | 費用 | 期間 | 備考 | 出典URL |
|---|---|---|---|---|---|
| UL 217（煙警報器）Listing | 煙検知部 | **約 $31,000〜45,000**（新規煙検知器の試験費、System Sensor 元担当者談） | 試験 1 セット+報告 **12〜16 週**（UL 標準）、実務では **18〜20 週**、＋Listing 手続 約 4 週。不合格・再試験で延伸 | 50 以上の個別試験、サンプル約 30 台提出。※記事は UL 268（システム用検知器）寄りだが UL 217 も同一ラボ・同規模。第 10 版移行期限 2027-11-17（第 1 ターン既出） | https://www.securitysales.com/contributed/a-look-at-the-smoke-detector-listing-process/ |
| UL 2034（CO 警報器）Listing | CO 検知部 | 不明（公開見積なし） | 不明 | **UL 2034 Ed.4 2022-10-07 改訂版への適合期限 2027-01-01**（未更新レポートは取下げ）。新規要件：1 年 CO センサ安定性試験（44A）、風速感度試験（44B）、電池要件 | https://preview.intertek.fi/siteassets/resources/sun/2026/ul-2034-rev-3-25-2015-thru-10-7-2022-ed-1-1-2027-amendment-4.pdf |
| 日本 検定（住宅用防災警報器） | 煙/熱検知部 | **不明**。参考：(a) 2009 年総務省資料：検定移行前の「鑑定」手数料は型式試験 14 万円/件、個別鑑定 50 円/個 で、新検定手数料はこれを基礎に協会が定める予定とされた。(b) 総務省の手数料一覧：消防法 型式承認に係る試験 **12,200〜130,000 円**（品目別、住警器の個別額は非掲載） | 不明（標準処理期間の公開ページ見つからず） | 日本消防検定協会（jfeii.or.jp）サイト内に手数料ページを確認できず → 協会へ直接照会（https://www.jfeii.or.jp/contact/）。e-Gov 消防法施行令 別表第三 は本環境で本文描画されず | https://www.soumu.go.jp/main_content/000193559.pdf ; https://www.soumu.go.jp/main_content/000131822.pdf ; https://www.jfeii.or.jp/activity/ |
| PSE 適合性検査（特定電気用品） | 内蔵 AC-DC（**直流電源装置 ＝ 特定電気用品**） | **950,000 円**（TÜV Rheinland Japan 公開料金：人件費 684,000 + 物件費等 266,000。典型設計 1 サンプルの概算、部品試験・特殊構造は追加） | 不明 | LED 電灯器具・LED ランプは「特定電気用品以外」（丸 PSE、自己確認）で適合性検査不要（要 METI 別表で最終確認）。JET/JQA の公開料金表は検索で見つからず（見積制） | https://www.tuv.com/content-media-files/japan/pdfs/1421-pse(denan)-and-s-mark-certification-for-japan/tuv-rheinland-jp-calculation-basis-of-conformity-assessment-fee-list-ja.pdf ; https://www.chubu.meti.go.jp/c23product_safety/electrical_products/faq/faq20240229.pdf |
| 技適 工事設計認証（TELEC） | 2.4 GHz Wi-Fi/BLE/Thread | **認証基本手数料 150,000 円 + 試験手数料 90,000 円 = 240,000 円**（2.4 GHz 帯小電力データ通信 第 19 号/19 号の 2） | 不明 | ISO9001 未取得工場 +60,000 円、電波暗室使用 +100,000 円/件・日。Espressif/Nordic 等の **技適取得済モジュール** を使えば本項不要（モジュール認証を流用） | https://www.telec.or.jp/services/tech/files/ninsho_charge6.pdf |
| 技適 工事設計認証（TELEC） | 5 GHz Wi-Fi | 150,000 + 90,000 = **240,000 円** | 不明 | 同上 | 同上 |
| 技適 工事設計認証（TELEC） | **60 GHz 移動体検知センサ（レーダ）** | 認証基本手数料 **300,000 円 + 試験手数料 150,000 円 = 450,000 円**（特定小電力機器） | 不明 | ミリ波レーダ 60.5 GHz は +環境試験 120,000 円の項あり。Infineon BGT60TR13C / TI IWRL6432 搭載の技適取得済モジュール（Seeed MR60 系）を使えば流用可 | 同上 |
| FCC Part 15（意図的放射器：Wi-Fi/BT） | 無線 | **$9,000〜12,000**（試験所公開レンジ） | 不明（「数週間」級、具体値なし） | モジュール認証流用（host 評価のみ）なら大幅減。非意図的放射器（Part 15B SDoC）は $3,000〜5,000 | https://compliancetesting.com/fcc-certification-faqs/fcc-certification-cost/ |
| IC（カナダ） | 無線 | 不明 | 不明 | 通常 FCC と同時試験で追加費は小 | — |
| CE（RED/EMC/LVD） | 全体 | 不明 | 不明 | 未調査 | — |
| UL/IEC 62368-1（AV/ITE 安全） | 機器全体 | 不明。参考：UL 認証一般レンジ **$10,000〜20,000+**（電源アダプタ/IT 機器、UL 1310/60950 系）、LED 照明器具（UL 1598）$5,000〜15,000+（Alibaba/Accio 系ブログの推定値、公式見積ではない） | 不明 | 年次フォローアップ（四半期請求）費用は非掲載 | https://www.accio-ai.com/blog/everything-you-need-to-know-about-ul-certification-costs |
| IEC 62471（光生物学的安全） | LED 照明・プロジェクタ | **不明**（RISE・Nemko とも見積制） | 不明 | Ultimems は IEC 62471-5（プロジェクタ）で Class 1 取得例 | https://www.ri.se/en/metrology/service/testing-of-photobiological-safety-in-accordance-with-ss-en-62471 ; https://nemko.com/lighting-equipment-photobiological-safety |
| IEC 60825-1（レーザクラス分け） | レーザ MEMS 採用時 | **不明**（Lasermet「見積依頼」、RISE「Price on tender」） | 不明（「スケジュールは空き次第」） | DLP（LED 光源）なら不要。レーザ採用時のみ | https://www.lasermet.com/?p=4549 ; https://www.ri.se/en/metrology/service/classification-of-lasers-and-laser-products-in-accordance-with-ss-en-60825-1 |

### 認証費用の概算合計（公開値が取れた項目のみ、日本＋米国、1 モデル）
| 区分 | 金額 | 根拠 |
|---|---|---|
| UL 217 Listing | $31,000〜45,000 | securitysales |
| FCC Part 15C（意図的放射器、自社認証の場合） | $9,000〜12,000 | compliancetesting |
| PSE 適合性検査（直流電源装置） | ¥950,000 | TÜV Rheinland Japan |
| 技適（2.4 GHz + 5 GHz + 60 GHz、自社認証の場合） | ¥240,000 + ¥240,000 + ¥450,000 = ¥930,000（＋ISO9001 無し +¥60,000、暗室 +¥100,000/件） | TELEC |
| 日本 住警器検定 / UL 2034 / 62368-1 / 62471 / 60825 | 不明 | — |
| **小計（判明分）** | **約 $40,000〜57,000 + ¥1,880,000**（≒ 合計 $52,000〜70,000 相当）。技適・FCC は認証済モジュール流用で ¥930,000 / $9,000〜12,000 の大半を回避可能 | — |

---

## 追加調査が必要な項目（第 3 ターン以降）
- 日本消防検定協会への直接照会：住宅用防災警報器 型式試験・型式適合検定 手数料と標準処理期間（Web 公開なし）。
- Anhua / iView / Young Optics への光学エンジン見積（0.23" 1080p 100〜200 lm、0.47" 500〜800 lm、MOQ 100/1,000）。
- UL 2034・UL 62368-1・IEC 62471・IEC 60825 の正式見積（UL Solutions / Intertek / TÜV へ RFQ）。
- JET / JQA の PSE 適合性検査 見積（TÜV 公開値 ¥950,000 との比較）。
- Ø300 mm PC/ABS 筐体の金型 RFQ（3D データ必要。Haizol / Xometry / JLCMC へ）。
- Digi-Key / Mouser の 1,000 個価格（本環境で描画不可）：DLP230NP、Citizen COB、Mean Well 各種。
- Murata PKM22EPPH4007 の後継 85 dB サウンダ選定。
- Tadiran TL-5903 の現行品番（/S が「製造終了」表示）。
