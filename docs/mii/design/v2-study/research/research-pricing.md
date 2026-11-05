# ハードウェアBOM 価格調査（30 cm センサーノード×4・計算ハブ・表示部）

調査日: 2026-11-05 ／ 換算レート: 1 USD = 150 JPY（EUR は参考値、¥換算せず）
凡例: 「不明」= 公開価格が確認できず（要見積／ページ取得不可）。表示通貨の価格→（¥換算）。
取得制約: DigiKey・Alibaba・AliExpress・Edmund Optics・B&H・Amazon はページ取得がブロックされたため、Mouser 検索ページ・Made-in-China・各メーカー直販・Octopart 等で代替。数量ブレークは掲載値のみ（中間数量は補間せず）。

---

## A. カメラ

| 部品 | 1個 | 100個 | 1,000個 | MOQ/備考 | 出典URL |
|---|---|---|---|---|---|
| Arducam 2MP GS OG02B10 カラー Pivariety (B0348, M12レンズ付, Pi向け) | $109.99 (¥16,499) | 不明 | 不明 | 数量割引非掲載。IRカットフィルタ内蔵（可視光のみ）。NIR用途はモノクロ OG02B1B 要 | https://www.arducam.com/product/arducam-2mp-global-shutter-og02b10-color-camera-modules-pivariety-b0348/ |
| OG02B10 GS 2MP MIPI モジュール（中国工場, Hstd） | $59.90 (¥8,985) | $59.90 (¥8,985)※単一価格 | 不明（1,000超はリードタイム変更のみ記載） | MOQ 1。数量ティア無し | https://hengshengtongda.en.made-in-china.com/product/HpIRPiFrbscL/China-Industrial-Og02b10-Global-Shutter-Camera-2MP-Mipi-Camera-Module.html |
| OG02B1B モノクロ GS 2MP 120fps USB (Arducam 120fps Mono GS USB) | 不明（Amazonページ取得不可） | 不明 | 不明 | Arducam が 2026 年に発売。価格確認要 | https://www.amazon.com/Arducam-Shutter-Android-Devices-Raspberry/dp/B0FXWWF55X |
| OG02B1B GS 2MP USB（Alibaba） | 不明（ページ取得不可） | 不明 | 不明 | Alibaba 掲載あり。MOQ/価格は要ログイン確認 | https://www.alibaba.com/product-detail/OG02B1B-Sensor-Global-Shutter-2MP-USB_1600063489506.html |
| Veye OG02B1B MIPI モジュール | 不明 | 不明 | 不明 | Veye サイトに OG02B1B 製品ページ・価格を確認できず | https://www.veye.cc/en/ |
| e-con Systems NIR GS カメラ | 不明（見積制） | 不明 | 不明 | e-con は Webstore 一部のみ公開、OG02B1B 品は要見積 | https://www.e-consystems.com/camera-category/near-infrared-nir-cameras.asp |
| Arducam IMX296 モノクロ GS 1.58MP M12 (Pi向け, B0619) | $64.99 (¥9,749) | 不明 | 不明 | 数量割引非掲載 | https://www.arducam.com/1-58mp-imx296-mono-global-shutter-camera-module-with-m12-lens-for-raspberry-pi.html |
| Arducam IMX296 モノクロ GS USB3.0 (B0641) | $199.99 (¥29,999) | 不明 | 不明 | 数量割引非掲載 | https://www.arducam.com/arducam-1-58mp-imx296-mono-global-shutter-usb-3-0-camera-module.html |
| Raspberry Pi Global Shutter Camera (IMX296, C/CS) | $50.00 (¥7,500) Adafruit／$55.00 (¥8,250) PiShop | 不明（公式MSRP $50 固定） | 不明 | Adafruit 在庫切れ時あり。数量割引なし | https://www.adafruit.com/product/5702 ／ https://www.pishop.us/product/raspberry-pi-global-shutter-camera/ |
| M12 レンズ 100° F2.0 ― Arducam LN069 (2.7mm F2.8, 100°H/113°D) | $26.99 (¥4,049) | 不明 | 不明 | F2.8（F2.0 ではない） | https://dlscorp.com/shop/arducam-100-degree-low-distortion-1-2-3%E2%80%B3-m12-lens-with-lens-adapter-for-raspberry-pi-high-quality-camera/ |
| M12 レンズ 2.8mm F2.0 (92°) ― m12lenses PT-02820 | $6.88 (¥1,032) | 不明 | 不明 | 在庫切れ表示。数量割引非掲載 | https://www.m12lenses.com/ProductDetails.asp?ProductCode=PT-02820 |
| M12 レンズ 2.8mm 1/2.7" 2MP (124°H) ― ChuangAn 工場 | $1.00–2.50 (¥150–375) | 同レンジ | 同レンジ | MOQ 1。F値非掲載 | https://www.made-in-china.com/showroom/visionlenscom/product-detailZweJdhWjlmcQ/China-1-2-7-2MP-2-8mm-M12-Board-Lens.html |
| 850 nm バンドパスフィルタ（Optolong, 5–85mm カスタム） | 不明（MOQ 10） | $17.00 (¥2,550) [100–499] | $8.00 (¥1,200) [500+] | 10–49個 $27、50–99個 $23。MOQ 10 | https://optolongoptics.en.made-in-china.com/product/tTqYbxguFaWG/China-850nm-Light-Filter-Optical-Infrared-Filter-850nm-850-Nm-Bandpass-Filter.html |
| 850 nm バンドパス 12.5mm (Edmund Optics) | 不明（ページ取得不可） | 不明 | 不明 | 参考: 製品番号 #27847 (OD4 50nm) | https://www.edmundoptics.com/p/850nm-cwl-125mm-dia-hard-coated-od-4-50nm-bandpass-filter/27847/ |
| RGB フィッシュアイ 160–180° ― Arducam IMX219 220° (B0286) | $15.99 (¥2,399) セール／通常 $21.99 (¥3,299) | 不明 | 不明 | 220°（160–180° 超） | https://www.arducam.com/arducam-imx219-wide-angle-camera-module-drop-in-replacement-for-raspberry-pi-v2-and-nvidia-jetson-camera-b0286.html |
| M12 レンズ 35mm F2.0 2/3" 5MP（虹彩カメラ用, Joney） | 不明（MOQ 20） | $8.50 (¥1,275) [100–499] | $8.00 (¥1,200) [500+] | 20–99個 $9.00。MOQ 20 | https://joneytechnology.en.made-in-china.com/product/dQMRIVqTXxWF/China-CCTV-Board-Lens-35mm-F2-0-M12-2-3-Inch-with-5-Megapixel-Security-Digital-Camera.html |

## B. レーダー

| 部品 | 1個 | 100個 | 1,000個 | MOQ/備考 | 出典URL |
|---|---|---|---|---|---|
| TI IWR6843AOPEVM（評価ボード） | $206.53 (¥30,980) Mouser | 不明（最大注文 10） | 不明 | 非在庫・12週。TI Store は価格非表示（ログイン要）。Arrow 在庫切れ・価格非表示 | https://www.mouser.com/c/?q=IWR6843AOPEVM ／ https://www.ti.com/store/ti/en/p/product/?p=IWR6843AOPEVM |
| TI IWR6843AQGABL（AOP チップ） | $46.63 (¥6,995) | $31.99 (¥4,799) | $29.21 (¥4,382) ※IWR6843AQGABLR リール, 非在庫 26週 | 10個 $38.11、250個 $31.42 | https://www.mouser.com/c/?q=IWR6843AOP |
| TI IWR6843ARQGALPR（ALP パッケージ, 参考） | $46.16 (¥6,924) | $35.73 (¥5,360) | $33.22 (¥4,983) リール | 500個 $34.34 | https://www.mouser.com/c/?q=IWR6843 |
| Infineon BGT60TR13CE6327XUMA1 | $18.74 (¥2,811) | $14.17 (¥2,126) | 不明（500個リール $14.01 ¥2,102、2,500個 $12.57 ¥1,886） | リール最小 4,500。ブローカー市況 $11.5–13.8 | https://www.mouser.com/c/?q=BGT60TR13C ／ https://octopart.com/bgt60tr13c+e6327-infineon-119635833 |
| Infineon DEMOBGT60TR13CTOBO1（評価ボード） | $214.57 (¥32,186) | 不明 | 不明 | 在庫 67 | https://www.mouser.com/c/?q=BGT60TR13C |
| Novelda X7F202 Development Kit | 不明（DigiKey ページ取得不可、Amcore は RFQ） | 不明 | 不明 | Novelda 直販は「開発キット申請」制。Mouser 取扱なし | https://www.digikey.com/en/products/detail/novelda/X7F202-Development-Kit/25558545 ／ https://novelda.com/x7-radar-direct/ |
| Novelda X4 (X4F103 Shield 等) | 不明 | 不明 | 不明 | X4 は旧世代。DigiKey 掲載あり価格取得不可 | https://www.digikey.at/en/products/detail/novelda/X4F103-Shield/21689866 |

## C. 赤外 LED

| 部品 | 1個 | 100個 | 1,000個 | MOQ/備考 | 出典URL |
|---|---|---|---|---|---|
| OSRAM SFH 4715S（850 nm） | 不明 | 不明 | 不明 | Mouser: Obsolete・地域販売不可。DigiKey 掲載あるが取得不可 | https://www.digikey.com/en/products/detail/ams-osram-usa-inc/SFH-4715S/3128754 ／ https://www.mouser.com/c/?q=SFH%204715S |
| OSRAM SFH 4735（広帯域 NIR） | 不明 | 不明 | 不明 | Mouser: Obsolete、工場梱包 2,000 | https://www.mouser.com/c/?q=SFH%204735 |
| OSRAM SFH 4715AS R33（850 nm, 後継候補） | $3.25 (¥488) | $1.85 (¥278) | $1.55 (¥233) リール | 500個 $1.62、3,000個 $1.40、6,000個 $1.36。EOL 表示あり | https://www.mouser.com/c/?q=LPY-SFH-4715AS |
| OSRAM SFH 4716AS（850 nm） | $3.36 (¥504) | $1.92 (¥288) | 不明（600個リール $1.60 ¥240、1,200個 $1.49 ¥224） | 在庫 10,536。EOL 表示あり | https://www.mouser.com/c/?q=SFH%204716AS |
| 定電流 LED ドライバ IC ― Diodes AL8861MP-13 | $0.66 (¥99) | $0.36 (¥54) | $0.331 (¥50) リール | 250個 $0.346、2,500個 $0.299 | https://www.mouser.com/c/?q=AL8861 |

## D. 計算系

| 部品 | 1個 | 100個 | 1,000個 | MOQ/備考 | 出典URL |
|---|---|---|---|---|---|
| STM32H743VIT6TR | $18.49 (¥2,774) | $12.32 (¥1,848) | $11.09 (¥1,664) リール | 500個 $11.52。トレイ品 VIT6: 1個 $17.09、100個 $11.45、1,080個 $10.64 | https://www.mouser.com/c/?q=STM32H743VIT6 |
| RP2350A (SC1509(13)-A4) | $0.80 (¥120) | $0.80 (¥120) | $0.80 (¥120) | リール 3,400 単一価格。SC1509-A4 は $0.90（リール 500） | https://www.mouser.com/c/?q=RP2350A |
| Jetson Orin Nano 8GB モジュール (900-13767-0030-000) | $449.82 (¥67,473) Seeed／€399.43 Silicon Highway | 不明（10個以上は要問合せ） | $399 (¥59,850) NVIDIA 1KU+（2026/7 値上げ後、旧 $299） | Seeed はキャリア同時購入条件 | https://www.seeedstudio.com/Jetson-Orin-Classic-Bundle.html ／ https://www.siliconhighwaydirect.com/nvidia-jetson-orin-nano-8gb-module-900-13767-0030-p/900-13767-0030-000.htm ／ https://www.cnx-software.com/2026/07/22/nvidia-increases-the-price-of-jetson-modules-and-devkits-by-up-to-101/ |
| Jetson Orin NX 16GB モジュール (900-13767-0000-000) | $1,077.02 (¥161,553) Seeed | 不明 | $999 (¥149,850) NVIDIA 1KU+（旧 $599） | Arrow 在庫切れ・価格非表示 | https://www.seeedstudio.com/Jetson-Orin-Classic-Bundle.html ／ https://www.cnx-software.com/2026/07/22/nvidia-increases-the-price-of-jetson-modules-and-devkits-by-up-to-101/ |
| Raspberry Pi 5 8GB (SC1112) | $175.00 (¥26,250) Mouser | 不明（最大注文 100） | 不明 | 公式ページは 16GB $305 のみ表示。$175 は 2026 年の DRAM 高騰反映と推定（要再確認） | https://www.mouser.com/c/?q=Raspberry%20Pi%205%208GB ／ https://www.raspberrypi.com/products/raspberry-pi-5/ |
| Hailo-8 M.2 (HM218B1C2HAE 等) | $169.00 (¥25,350) | 不明 | 不明 | Hailo-8L は $85 (¥12,750)。数量ブレーク非掲載 | https://www.mouser.com/c/?q=Hailo-8 |

## E. ネットワーク／電源

| 部品 | 1個 | 100個 | 1,000個 | MOQ/備考 | 出典URL |
|---|---|---|---|---|---|
| 7ポート GbE スイッチ IC ― Microchip KSZ9897RTXC(-TR) | $12.83 (¥1,925) | 不明（90個 $10.61 ¥1,592） | $10.66 (¥1,599) リール | 25個 $10.70 | https://www.mouser.com/c/?q=KSZ9897 |
| PoE PSE コントローラ ― TI TPS23881B1RTQR（8ch） | $8.95 (¥1,343) | $5.90 (¥885) | $5.38 (¥807) リール | 500個 $5.46、2,000個 $5.09。入荷 2027/8 予定 | https://www.mouser.com/c/?q=TPS23881 |
| 8ポート 2.5G PoE+ スイッチ完成品（UTP Fiber, MIC） | $119 (¥17,850) [1–9] | $99 (¥14,850) [50+] | 不明 | 10–49個 $109。サンプル $89 | https://utpfiber.en.made-in-china.com/product/VtERueMDqaWP/China-8-Port-2-5g-802-3at-Poe-1-Port-10g-Base-X-SFP-Multi-Gigabit-Ethernet-Switch.html |
| 8ポート GbE PoE スイッチ 120W（Takfly, MIC） | $10–100 (¥1,500–15,000) レンジ表示 | 不明 | 不明 | MOQ 1。サンプル $50 | https://takfly.en.made-in-china.com/product/xsoESMkbZrcI/China-120W-Long-Distance-8-Port-Gigabit-Poe-Network-Switch.html |
| 8ポート GbE 管理型スイッチ基板モジュール（Telefly, MIC） | $117.65–125.10 (¥17,648–18,765) | 同レンジ | 不明 | MOQ 1。PoE 版は別価格 | https://sztelefly.en.made-in-china.com/product/PxmrSdQJvYkO/China-8-Port-Gigabit-Industrial-Managed-Network-Switch-Module-Group-Poe-Ethernet-Motherboard-PCB.html |
| PoE PD コントローラ TI TPS2373-4RGWR | $5.00 (¥750) | $3.12 (¥468) | $2.76 (¥414) リール | 500個 $2.94。-3 版: 1個 $3.94／100個 $2.46／1,000個 $2.18 | https://www.mouser.com/c/?q=TPS2373 |
| 1GbE PHY (PTP) TI DP83867IRPAPR | $7.23 (¥1,085) | $4.65 (¥698) | $4.16 (¥624) リール | 500個 $4.40。入荷 2027/1 予定 | https://www.mouser.com/c/?q=DP83867IRPAP |
| 1GbE PHY (IEEE1588) TI DP83640TVVX/NOPB | $15.24 (¥2,286) | $10.26 (¥1,539) | $9.39 (¥1,409) リール | 入荷 2026/12 予定 | https://www.mouser.com/c/?q=DP83640 |
| Cat6A 10 m パッチケーブル ― HARTING 0948E4E47A8100 | $21.37 (¥3,206) | $15.44 (¥2,316) | 不明（500個 $13.41 ¥2,012） | Panduit UTP28X10MGR: 1個 $56.80／100個 $46.25／250個 $45.35 | https://www.mouser.com/c/?q=Cat6A%2010m%20patch%20cable |

## F. サーマル

| 部品 | 1個 | 100個 | 1,000個 | MOQ/備考 | 出典URL |
|---|---|---|---|---|---|
| FLIR Lepton 3.5 (500-0771-01) | $172.00 (¥25,800) | 不明 | 不明 | Mouser 在庫 673／GroupGets 同価格。数量ブレーク非掲載 | https://www.mouser.com/c/?q=FLIR%20Lepton%203.5 ／ https://groupgets.com/products/flir-lepton-3-5 |
| FLIR Boson 320 (320×256) | $1,624–2,544 (¥243,600–381,600) レンズ無し／レンズ付 $2,131〜 | 不明 | 不明 | 価格はレンズ・放射測定オプションで変動 | https://www.oemcameras.com/collections/flir-boson |
| Melexis MLX90640ESF-BAA-000-SP（110°） | $38.78 (¥5,817) | $30.12 (¥4,518) | 不明（500個は見積） | BAA-TU: 1,035個 MOQ $29.71 (¥4,457), 非在庫 20週。BAB(55°)-SP: 1個 $38.18 | https://www.mouser.com/c/?q=MLX90640 |

## G. 表示部

| 部品 | 1個 | 100個 | 1,000個 | MOQ/備考 | 出典URL |
|---|---|---|---|---|---|
| Hisense PX3-PRO（UST 3,000 ANSI lm） | MSRP $3,499 (¥524,850)／実売 $2,497.97 (¥374,696) | 不明 | 不明 | 民生品。B2B 数量価格非公開 | https://www.projectorreviews.com/hisense/hisense-px3-pro-laser-cinema-projector-review/ ／ https://www.projectorscreen.com/Hisense-PX3-PRO-trichroma-triple-laser-4k-ultra-short-throw-projector-for-home-cinema-3000-ansi-lumens.html |
| Formovie Theater Premium（2,200 ISO lm） | MSRP $3,499 (¥524,850)／セール $2,999 (¥449,850)／Best Buy $2,399 (¥359,850, 新品取扱終了) | 不明 | 不明 | 民生品 | https://www.notebookcheck.net/Formovie-Theater-Premium-New-2-200-ISO-Lumen-UST-projector-drops-by-500-but-only-for-a-short-time.925012.0.html ／ https://www.bestbuy.com/product/formovie-theater-premium-4k-ultra-short-throw-projector-triple-laser-ust-with-dolby-vision-2200-iso-lumen-laser-tv-dark-gray/CZTX9XT7WR |
| NexiGo Aurora Pro（2,400 lm） | 通常 $2,999.99 (¥450,000)／セール $2,299.99 (¥345,000) | 不明 | 不明 | 在庫切れ・予約受付 | https://www.nexigo.com/products/aurora-pro-4k-triple-color-ust-laser-projector |
| DLP 光学エンジン 0.65" 1080p 300 lm（Xiamen Zhisen, MIC） | $700–10,000 (¥105,000–1,500,000) レンジ | 不明 | 不明 | MOQ 1。タイトル「4K」だが解像度 1080p | https://zsmachinery.en.made-in-china.com/product/uvbJYKlVJmaW/China-Zs-Good-Price-DLP-4K-Projector-Light-Engine-1080P-LED.html |
| DLP 光学エンジン RGB LED 1080p/1280×800 300 lm（Zhisen, MIC） | $2,650–3,000 (¥397,500–450,000) | 不明 | 不明 | MOQ 1 | https://zsmachinery.en.made-in-china.com/product/rSLQbBJGBnax/China-1280-800p-High-Resolution-OEM-ODM-RGB-LED-Light-Source-DLP-Optical-Engine-Module.html |
| DLP 1080P 構造化光エンジン（Xiangxi, Alibaba） | $1,400–1,500 (¥210,000–225,000) | 不明 | 不明 | MOQ 1 set。Alibaba 一覧ページより | https://www.alibaba.com/countrysearch/CN/optical-engine-dlp.html |
| DLP 光学エンジン（Zhisen, Alibaba） | 不明（MOQ 10） | $3,000 (¥450,000) ※MOQ10 単価 | 不明 | 4K 100/1000 個の価格は未公開 | https://www.alibaba.com/countrysearch/CN/optical-engine-dlp.html |
| TI DLP471TPFQQ（0.47" 4K UHD DMD） | $279.32 (¥41,898) | 不明（25個 $218.99 ¥32,849） | 不明 | 10個 $240.21。EVM DLPDLCR471TPEVM $1,198.84 | https://www.mouser.com/c/?q=DLP471TP |
| 15.6" 1000 nit FHD 高輝度 LCD パネル（Chuan Ling, MIC） | $173 (¥25,950) [1–99] | $169 (¥25,350) [100+] | 不明 | MOQ 小ロット可 | https://cl-lcd.en.made-in-china.com/product/fXhEyYKVZWrv/China-Best-HP-15-6-Inch-Inch-High-Bright-1000-Nits-Rugged-Industrial-LCD-Panel.html |
| PMMA フレネルレンズ Ø300–500 mm（Alibaba） | 不明（ページ取得不可） | 不明 | 不明 | Alibaba 400mm 品掲載あり | https://www.alibaba.com/product-detail/400mm-Fresnel-Lens-Dia-Large-Optical_1600389358491.html |
| 3M Diamond Grade DG³ 4090 白（再帰反射） | $3,320.95 (¥498,143)/ロール 48in×50yd = 55.7 m² → 約 $59.6 (¥8,940)/m²【当方計算】 | 同単価 | 不明 | ロール単位販売。小幅ロールは単価上昇 | https://www.hillas.com/Categories/3M-Diamond-Grade-DG-Reflective-Sheeting-4090-White-6-in-x-50-yd/3M-Diamond-Grade-DG-Reflective-Sheeting-4090-White-48-in-x-50-yd.html |
| 50/50 ビームスプリッタ板ガラス（VY Optics, MIC, 〜460 mm） | $1–5 (¥150–750) レンジ表示／サンプル $5 | 不明 | 不明 | 300 mm 品は別見積の可能性大（レンジは小径含む） | https://vyoptics.en.made-in-china.com/product/bFctXwYokRrN/China-Vy-Customized-Optical-Glass-50-50-Beam-Splitter-Window-Sheet-Flat-Beamsplitter-with-Hole.html |
| Asukanet ASKA3D プレート | 不明（公式非公開）。樹脂サンプル「数万円」、ガラス大型 約 ¥1,000,000（伝聞） | 不明 | 不明 | 株主 note 記事ベース。要直接見積 | https://note.com/aska3d_news/n/n1796f0af9bde ／ https://aska3d.com/ja/aska3d-420.html |
| Looking Glass 27" Light Field Display | $10,000 (¥1,500,000) | 不明 | 不明 | 売切表示 | https://checkout.lookingglassfactory.com/products/27-lightfield-display |
| Looking Glass 32" Spatial Display | 不明（要問合せ） | 不明 | 不明 | 16" OLED は $4,000 (¥600,000) | https://petapixel.com/2024/05/14/looking-glass-debuts-16-inch-oled-and-32-inch-holographic-spatial-displays/ |

## H. 機構

| 部品 | 1個 | 100個 | 1,000個 | MOQ/備考 | 出典URL |
|---|---|---|---|---|---|
| Ø60 アルミ丸管（6061/6063 押出, Shuangjiu, MIC） | 不明（MOQ 1 t） | 不明 | $1,400–2,700/t (¥210,000–405,000/t) → Ø60×t3 (約1.45 kg/m) で約 $2.0–3.9 (¥300–585)/m【当方計算】 | MOQ 1 トン。アノダイズ品 $2,100–2,600/t | https://shuangjiusteel.en.made-in-china.com/product-catalog/Aluminum-Tube-Pipe-1.html |
| CNC 削り出し Al 筐体（例: 6061 ブラケット 80×60×25, 3軸, アノダイズ） | 不明 | $25 (¥3,750)/個 中国、$70 (¥10,500) 米国 | 不明 | 小型筐体 70×35×25 は 200個で $4.10 (¥615)/個（中国） | https://www.davantech.com/how-much-does-cnc-machining-cost/ |
| ダイカスト Al 筐体 | 不明 | 不明 | 不明（金型 $3,000–30,000+ ¥450,000–4,500,000、損益分岐 1,000–2,000個） | PCBWay/JLCCNC は価格非掲載・見積制 | https://www.rallymachining.com/cnc-vs-die-casting-aluminum-enclosures/ ／ https://www.pcbway.com/rapid-prototyping/cnc-machining/metal/ |
| 鉄系ベース 2.5 kg（鋳鉄カウンターウェイト, Mingpan, MIC） | 不明（MOQ 100 lb） | $1.38/lb (¥207/lb) → 2.5 kg ≈ $7.6 (¥1,140)【当方計算】 | $1.30/lb [1,000–4,999 lb] → 2.5 kg ≈ $7.2 (¥1,075) | 5,000 lb+ $1.08/lb。塗装のみ・加工別 | https://mingpansports.en.made-in-china.com/product/jwMTKqYdktRb/China-Black-Painted-Cast-Iron-Counterweight-Plate-for-Gym-Steel-Equipment.html |
| PMMA NIR 透過黒窓（NMOT, MIC, 3–300 mm カスタム） | 不明（MOQ 10） | $4.50 (¥675) [10–499] | $0.30 (¥45) [500+] | サイズ未記載 | https://optics.en.made-in-china.com/product/ZNUxodmDrCcP/China-Stocked-Black-IR-Transmission-Acrylic-PMMA-Sheet-Infrared-Filter.html |
| IR 透過アクリル板 3143 12×12in t2.0mm（ePlastics, 米国） | $17.40 (¥2,610) | 不明（50枚+ $4.91 ¥737） | 不明 | 10–19枚 $8.70 | https://www.eplastics.com/plexiglass/acrylic-sheets/ir-transmitting |
| 4層 PCB + 実装（JLCPCB 実例 140×75 mm≈105 cm², 75 BOM 行, 片面 SMT, 部品込） | 2枚: $140.49 (¥21,074)/枚 | 不明（50枚 $37.36 ¥5,604/枚、20枚 $49.62） | 不明（要見積） | 固定費約 $167/件（セットアップ $8.18、ステンシル $1.53、Extended 部品 $3.07/種）。150 部品では部品代が支配的 | https://jlcpcb.com/blog/reduce-pcb-assembly-cost-prototype ／ https://jlcpcb.com/help/article/pcb-assembly-price |

## I. その他

| 部品 | 1個 | 100個 | 1,000個 | MOQ/備考 | 出典URL |
|---|---|---|---|---|---|
| MEMS マイク ― TDK ICS-43434 | 不明（EOL・地域販売不可） | 不明 | 不明 | Adafruit ブレークアウト #6049 $8.95 (¥1,343)。代替品再選定要 | https://www.mouser.com/c/?q=ICS-43434 |
| IMU Bosch BMI270 | $4.23 (¥635) | $3.18 (¥477) リール | $2.80 (¥420) | 500個 $2.89、5,000個 $2.65。在庫 68,987 | https://www.mouser.com/c/?q=BMI270 |
| IMU TDK ICM-42688-P | $5.44 (¥816) | $3.70 (¥555) リール | $3.30 (¥495) | 500個 $3.40。在庫 0・工場 52週 | https://www.mouser.com/c/?q=ICM-42688-P |
| セキュアエレメント NXP SE050C2HQ1/Z01SDZ | $5.03 (¥755) | $3.20 (¥480) | $2.98 (¥447) リール | 500個 $3.00、3,000個 $2.72。SE050E2: 1個 $4.35／1,000個 $2.51 | https://www.mouser.com/c/?q=SE050C2HQ1 |
| セキュアエレメント Microchip ATECC608B-SSHDA-B | $0.90 (¥135) | $0.725 (¥109) | 不明（リール 4,000 $0.744 ¥112） | 10個 $0.869 | https://www.mouser.com/c/?q=ATECC608B |
| 120 W PSU ― Mean Well GST120A24-P1M（AC アダプタ 24V 5A） | $44.69 (¥6,704) | 不明（20個 $39.50 ¥5,925、60個 $39.49） | 不明（500個は見積） | 在庫 2,771 | https://www.mouser.com/c/?q=GST120A24 |
| 150 W PSU ― Mean Well LRS-150-24（内蔵型, 参考） | $18.80 (¥2,820) | 不明（200個 $16.59 ¥2,489） | 不明（1,000個は見積。520個 $16.58） | 工場梱包 40 | https://www.mouser.com/c/?q=LRS-150-24 |
| 40 kHz 超音波トランスデューサ Ø16 mm（KangTong KT40-R1611, MIC） | 不明（MOQ 50） | $0.26–0.33/個 → 100個で $26–33 (¥3,900–4,950) | 同単価レンジ | MOQ 50。サンプル $0.33 | https://comton.en.made-in-china.com/product/RwEnMiOrHJkK/China-40kHz-16mm-Open-Aluminum-Ultrasonic-Sensor-Transducer.html |

---

## 見積りの注意（為替・関税・歩留まり・NRE）

1. 為替: 本表は 1 USD = 150 JPY の固定換算。実勢レートが ±10 円動くと BOM 総額は約 ±7% 変動するため、発注時点のレートで再計算すること。
2. 関税・付加税: Mouser 表示は米国向け関税注記（TI 38%、Würth 20%、Infineon/Hailo 8%、Mean Well 30% 等）で、日本向けは別。日本輸入では消費税 10% と品目別関税（多くの半導体は無税、完成品プロジェクタ等は要確認）が加算される。
3. 中国工場価格（Made-in-China/Alibaba）は FOB/EXW が基本で、送料・保険・通関手数料・輸入消費税を含まない。サンプル価格は量産価格より高い。
4. 数量ブレークは掲載値のみを記載し、1,000 個の空欄は「公開されていない」の意。多くの IC は 1,000 個リールで見積依頼（Quote）扱いになる。
5. 供給リスク: ICM-42688-P（52 週）、TPS23881B1（2027/8 入荷）、DP83867IRPAPR（2027/1）、STM32H743 トレイ品（2027/11）など長納期品が多い。1,000 台計画では代替品の二重承認（second source）が必須。
6. EOL/Obsolete: SFH 4715S・SFH 4735・ICS-43434・OG02B10 Arducam 旧品など廃番・EOL が複数。設計確定前に後継品（SFH 4715AS/4716AS 等）へ置換すること。
7. Jetson は 2026 年 7 月に NVIDIA が 1KU 価格を最大 101% 値上げ（Orin NX 16GB $599→$999、Orin Nano 8GB $299→$399）。Raspberry Pi 5 も DRAM 高騰で流通価格が大幅上昇しており、計算ハブの価格感は年内でも変動しうる。
8. 歩留まり: PCBA の初回ロットは 3–5% の不良・リワーク、光学部品（フィルタ・レンズ・フレネル）は 5–10% の外観不良を想定し、必要数に対し余剰発注する。カメラ・レーダーのキャリブレーション不合格分も加算。
9. NRE（一時費用）: JLCPCB 実装は 1 件あたり約 $167 の固定費（セットアップ・ステンシル・部品ローディング）。ダイカスト筐体は金型 $3,000–30,000+ で損益分岐 1,000–2,000 個。CNC は金型不要だが 100 個で $25/個級。ASKA3D・Looking Glass 32"・Novelda・e-con は見積制で NRE/MOQ 条件が別途発生。
10. 価格は 2026-11-05 時点のスナップショット。DigiKey・Alibaba・Edmund Optics・B&H はページ取得がブロックされたため未取得項目があり、WebSearch 回数上限にも到達したため追加探索は次ターンで要継続。
