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
