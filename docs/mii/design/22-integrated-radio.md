# 22 可搬mii P3 — 同一本体のLTE・Wi-Fi・衛星、成立条件と改訂配線

2026-11-02・調達再確認版 P3.1 / MAT15・MINI-08・NET01・SIM01・OS10 / 主担当ROCK・Material Invention。

**P3は、共通OS・電池・Wi-Fi・LTE/衛星共用モデム・測位を一緒に持ち出す設計。アプリの通信経路を選択し、modemの電源・網維持は別管理する。** 固定Hub、PC、スマホの回線中継は必要としない。P2の別体LTE＋Iridiumはこの構成では取り外す。図面は [BOM/netlist](portable-p3/bom-netlist.json)、`output/pdf/mii-portable-p3-wiring.pdf`。共通OSは [14章](14-common-os.md)のまま。

**現在は条件付き組立設計。送信可能な完成品・最終調達図ではない。** 電気的な接続と選定品を具体化した一方、EVKのUSB給電条件、同居RF、地域別認証、アンテナの実品仕様が公開資料だけでは閉じていない。これらを後述のR01〜R04で閉じるまで、全部品を買えば確実に通信するとは案内しない。実機もサービス契約も未取得であり、実通信の証拠はない。

**P3.1訂正**: Skyloの接続要件に照らし、旧版の「Wi-Fi時modem OFFによる排他送信」を撤回した。日本の提供条件・代替品の端子・メーカー確認文は[23章](23-japan-procurement.md)。アプリ経路の選択は電波の排他保証ではない。全部品の一括調達は回答待ち。

## 1. 今回確認できたことと設計変更

| 論点 | 根拠と結論 | P3への反映 |
| --- | --- | --- |
| P2の9704同居 | Ground Controlの9704設置資料は同じhousingの他送信機を禁止する記載を含む。ANT版への例外を確認できない | **9704-ANTとSIM7080Gを外す**。時間分割や内部隔壁で元の条件を回避したとはしない |
| LTE＋衛星 | Murata **LBAD0XX1SC-005**はLTE-MとNB-IoT NTN。**LBAD0XX1SC-DMSB-EVK-B**が対応評価kit | 1 modem / 1 SIM socket / 共用RF端子へ統合。LTEとNTNは排他RAT切替 |
| 日本のサービス | Soracomの2026年7月更新でplanNT1の日本利用開始を確認。古い英語概要の国一覧には日本がまだない | 日本を一律「未提供」としない。ただしサービス開始と当該機器の日本適合を分離 |
| 日本の機器適合 | Murata 1SC-005 datasheet v1.1の表11.1は、TELEC **003-180242をCat-M/NB側**に記載し、NTN欄は「-」 | **日本NTN送信の承認は未確認**。既存TELEC番号を衛星へ転用しない。更新証明/適用band/firmwareをR02で取得 |
| Wi-Fi同居 | MurataのHardware Design Guidelinesは、人体20cm以内または他送信機同居では追加FCC/IC評価が必要になり得ると明記 | Wi-Fi使用中もmodemの網維持送信が起こり得る。完成miiの同居・同時送信条件を確認する。20cmは人体との距離で、アンテナ間距離ではない |
| 位置情報 | NTNは端末の位置が必要。スマホ位置の固定値では持ち出せない | **GlobalSat BU-353N5**を追加。Coreが実測GNSSから位置を供給、衛星は初号では静止設置時に限定 |
| 充電電圧 | SC0218の公差、DDR-15G-5の過渡をPiSugar入力上限内と保証できない | **PiSugarと独自dock変換器を除去**。Waveshare UPS Module 3S＋指定12.6V充電器＋P28A×3へ変更 |

出典: [9704設置](https://docs.groundcontrol.com/iot/rockblock-9704/installation)、[Murata製造元datasheet（正規販売店掲載）p22–23](https://www.mouser.lt/pdfDocs/2LBADXX01SC-005_Data_Sheet_v11.pdf)、[Soracom日本開始](https://changelog.soracom.io/ja/wei-xing-tong-xin-sabisu-ntn-dui-ying-no-plannt1-gari-ben-demoli-yong-dekiruyouninarimasita-314ddm)、[Murata作成Hardware Design Guidelines 2024-07-16 §6.1／FCC公開提出資料のミラー](https://device.report/m/057f20c41558e18e66dc2bc34f1b099ccb3dc7134bbc931d8361367f00fa1626)。ミラーの解説を認証根拠にせず、文書の著者・版・対象FCC IDを照合した。最新grant原本/完成hostへの適用確認はR01に残す。

## 2. 一台分の選定部品

既製kitの付属品で単品MPNが非公開のものは、kit SKUと付属品の組を固定する。未確認のMPNやpin番号を作らない。代替antenna、非NTN iSIM EVK、裸moduleへの置換は本配線の範囲外。

| ID | 型番・variant | 接続・扱い |
| --- | --- | --- |
| CORE | **Raspberry Pi 4 Model B 4GB**（SC0194系列） | 共通runtime、SD、内蔵CYW43455 Wi-Fi、黒いUSB2-A×2、J8、任意RJ45 |
| UPS | **Waveshare UPS Module 3S** | 5V regulator/3S保護/均等化回路、93×60mm。指定12.6V 2A charger付属optionを選択 |
| BAT | **Molicel INR-18650-P28A** ×3 | 新品・同一lot、3S holderへ。3.6V/2800mAh、65.2mm以内。中古/別型番との混用なし |
| MODEM | **Murata LBAD0XX1SC-DMSB-EVK-B** | **Soracom SKU 4573326593342**（Global Connect、NTN版）を調達単位に選定。UART0/AT CMDのMini-BへUSB。ソケットは3FF micro SIM |
| RF-ANT | **4573326593342付属NTN用antenna** | kitの主RF SMAへ。独立MPN/利得/寸法/対応bandは納入明細で確定するR03。販売ページ内でもcellular/NTNの記載差があるため、無条件受入不可 |
| SIM | **Soracom plan01s標準IoT SIM＋planNT1、国内LTE用planX1** | kit同梱3FF、**LDV版ではない**。plan追加・開通は未実施。planX1/NT1とも同じカードのsubscription container、OS binaryは格納しない |
| GNSS | **GlobalSat BU-353N5** | 内蔵受信patch＋直付USB-A、約1.52m cable。NMEA 0183、初期4800/8N1。直径53×19.2mm。外付けphone不要 |
| C-MODEM | **Murata EVK付属USB-A–Mini-Bケーブル** | 2本のうち1本のみUART0へ。Micro-Bと混同しない。UART1には挿さない |
| SD | **Samsung MB-MJ64KA/AM** | 64GB PRO Endurance microSDXC |
| FAN | **Raspberry Pi 4 Case Fan（純正3線型）** | 赤J8-4、黒J8-6、青J8-8。UART console/TXとの兼用を停止 |
| PSU | **UPS Module 3S指定12.6V 2A充電器** | メーカーkitのcharger付属option。単品MPN/AC plug/使用国表示は納品銘板をR04で照合。汎用AC/DCに置換しない |
| C-IN | **UPS Module 3S付属DC5521–XH2.54** | 約15cm、INPUT用。DC5521をdock着脱点にし、本体側ケーブルを保持 |
| C-PWR | **UPS Module 3S付属XH2.54–Type-C** | 約20cm、UPSの**5V** socketからPiのUSB-Cへ。**BAT socketへ挿さない** |
| SW | **UPS Module 3S付属self-lock switch** | 約15cm、XH2.54→SWITCH。shutdown保存後に使用 |
| C-I2C | **Adafruit 266** | 2.54mm F-F、28AWG、約150mm。3本をSDA/SCL/GND用に使用。電源大電流用には使わない |
| MECH | **MII-P3-MECH-01**（加工品番号） | 樹脂frame 180×160×90mm配置枠。電池点検口、GNSS上向き保持、antenna固定。上方金属なし。アンテナ/plug込み200mmは未成立確認 |
| C-LAN（任意） | **StarTech NLBL-2M-CAT6A-PATCH** | 初回有線管理・任意worker用。WAN中継を常設条件にしない |

主要出典: [Murata kit](https://store.soracom.io/product/murata-type-1sc-ntn-evaluation-kit-global-connect-sim/)、[Skylo接続](https://www.skylo.tech/skylo-ecosystem-get-started-article/getting-started-murata-module)、[GNSS製造元manual](https://www.globalsat.com.tw/files/User%20Manual-BU-353N5_BR-355N5%20V1.1_20240905.pdf)、[Waveshare製品](https://www.waveshare.com/product/ups-module-3s.htm)、[Waveshare Wiki](https://www.waveshare.com/wiki/UPS_Module_3S)、[メーカー作成manualのミラー、p11–13端子図](https://www.airsupplylab.com/images/Learn/RaspberryPi/L00/waveshare_23884/resources/UPS_Module_3S_Manual.pdf)、[Molicel P28A v1.3](https://www.molicel.com/wp-content/uploads/INR18650P28A_1.3_Product-Data-Sheet-of-INR-18650-P28A-80093.pdf)、[Adafruit 266](https://www.adafruit.com/product/266)。Waveshare本サイトの直接取得は403、検索indexとメーカー作成PDFを照合。実物revision/銘板は受領時に照合する。継続部品の出典は[21章](21-portable-connectivity.md)。

## 3. 端子間配線

```text
固定dock                         │        持ち出す mii Core
AC→kit指定12.6V 2A charger       │
   DC5521 plug ═ female ────────┼─C-IN XH2.54→UPS INPUT
                                │                 ├P28A×3（純正3S holder）
                                │                 ├SWITCH←付属SW
                                │                 └5V socket
                                │                    ↓付属XH→Type-C
任意LAN ─────────── RJ45 ────────┼─Pi4 USB-C / SD / 共通OS / Wi-Fi内蔵
                                │  ├─USB2上段→Mini-B UART0→Murata
                                │  │                         ├3FF SIM
                                │  │                         └SMA→kit RF antenna
                                │  ├─USB2下段→BU-353N5（GNSS受信）
                                │  ├─J8 4/6/8→fan 赤/黒/青
                                │  └─J8 3/5/9←UPS header 2/1/5
```

| 接続ID | From → To | 信号/施工 |
| --- | --- | --- |
| P01/P02 | kit charger DC5521 → C-IN → UPS **INPUT** | **12.6V充電専用の着脱点**。純正cableを加工せず、極性とINPUT表示を確認。Piへ直結しない |
| P03a/b | UPS **5V** socket → C-PWR → CORE **USB-C** | 純正約20cm cable。BAT/INPUTの同形socketと混同しない。GPIOへ給電を重ねない |
| P04 | 付属SW → UPS **SWITCH** | self-lock。同梱acrylic保護を保持、回転/抜け防止。OS保存完了後に出力停止 |
| P05 | P28A×3 → UPS 3S holder | 各slotの＋/−表示に従う。セルへのはんだ付け/別packの並列接続なし |
| I01/I02/I03 | UPS header **2(SDA)/1(SCL)/5(GND)** → CORE J8 **3/5/9** | I2C選択は**3.3V**。基板裏面端子図に合わせ、反対面の見た目で左右を推測しない。3V3/5V headerはNC |
| U01 | CORE黒USB2上段（基板から遠い側）→C-MODEM→MODEM UART0/AT CMD | A1→Mini1 VBUS、A2→Mini2 D−、A3→Mini3 D＋、A4→Mini5 GND、Mini4 ID=NC |
| U02 | GNSS直付USB-A → CORE黒USB2下段（基板側） | 5V＋USB data。線を切断/短縮しない。余長はRFから離して緩く保持 |
| R01 | RF-ANT → MODEM主RF SMA | kit純正のまま。RP-SMA/MHF4へ変換せず、GNSS端子と取り違えない |
| F01/02/03 | CORE J8 **4/6/8** → FAN 赤/黒/青 | 5V / GND / BCM14制御。J8は物理番号。UART console/TXとの兼用を停止 |
| S01 | SD → CORE microSD | 書込/OS導入は別作業、抜差しは電源OFF |
| E01 | CORE RJ45 → C-LAN → owner LAN | 任意、dataのみ。P3にPoE HATなし |

UPSにはINA219が搭載される。PiSugar用0x57/0x68 driverは使わない。現物revisionのメーカーdemo/回路図からI2C address・shunt値を確定して読戻す。単純な電圧の直線換算を正確な残量として使わず、unknown時は有料通信を止める。I2Cケーブルは支持具で抜け止めし、未使用5V/3V3 pinを絶縁coverで覆う。UPSの3.3V**出力**をPiの3.3V**出力**へ接続しない。

GPIOにmodemの1.8V UARTを直結せずCP210x経由で**115200/8N1**のserial ATを使う。初号はSW2手動起動、firmware/実USB IDを取得。`ttyUSB0`固定ではなく`/dev/serial/by-id`等とportを照合する。serial消失時は旧sessionを破棄する。

NC: Pi USB3×2、UPS BAT出力/未使用header 3/4/6/7/8、EVK UART1/外部5V/header/GNSS端子、CSI/DSI/HDMI、その他外部GPIO。EVKへUSBと外部5Vを二重給電しない。USB/Type-C cable内部、電池holderの3S配線とSWITCHはメーカー完成assemblyを保持し、pinの再加工はしない。netlistは外部接続の論理照合用。Piの5V_SYSTEMと電流制限switch後の5V_USB_HOSTを分離し、GPIOからUSB VBUSへのバイパス配線はしない。

## 4. 電源の成立条件

P3受入枠は **Pi本体1.50A＋EVK 1.00A＋GNSS 0.10A＋fan 0.18A = 2.78A**。UPS基板の5A ratingに対して2.22A余裕があるが、Piへの給電枠は3Aとして0.22A、USB全port上限1.2Aに対して1.10Aで0.10Aの余裕。**5A基板だから全connector/cableも5Aとはしない**。これらは試作の負荷割当で、メーカー保証最大/実測値ではない。重いLLMやcamera集約は含めない。battery low/full、起動・探索・送信時を実測する。

**R04: EVKのUSB電力契約は未解決。** 1SC datasheetの400/800mAはmodule側typicalでEVK USB最大値ではない。USB2全体1.2Aは1deviceへ1Aを許す根拠ではない。UART0 USBの最大/突入/列挙前電流、descriptor、指定hostを入手する。500mAを超える基板なら通常USB2 bus-powerとして承認せず、メーカー指定の外部給電＋逆流防止接続へ図面を改版する。未知のheader pinやUSB Yケーブルで救済しない。U01は条件付き破線。

**電源を再選定した理由**: SC0218公差と、DDR-15G-5メーカー試験のovershoot 5.6%（5V換算5.28V）はPiSugarの5.2V上限と整合しない。両候補とPiSugarを現BOM/配線から除去した。[DDR試験票p2](https://www.meanwell.com/Upload/PDF/DDR-15/DDR-15G-5-rpt.pdf)。PiJuice2.5Aも負荷枠不足。代わりに3S充電・保護・均等化・5V出力のメーカーkitを使う。**12.6VはUPS INPUTだけ**、Piは5V出力から給電する。

P28Aは1本4.2V充電、3直列で12.6V、標準充電2.8A。kitの2Aをこの値以下と照合した。65.2mm長はholderの67mm未満に収まる。M35Aは現行v1.4の充電上限1.7Aとkit 2Aが合わないため選ばない。新品同一lot3本を、絶縁外装・電圧・容量/内部抵抗の一致を確認して組む。初期セル差は設計基準50mV以下、破損/逆挿し警告LEDがある場合は充電禁止。BOOTの使用はメーカー手順に従う。保護回路を迂回せず、裸セルを持ち運ばない。

初号は**電池点検口を開け、20〜30°Cの不燃台上で監視充電**。メーカー0〜60°C充電範囲より狭い運用枠とし、セル45°C到達/異常な温度差で停止。これはP3の保守的試験条件。INA219は温度センサーではなく、BMSの自動過温停止を確認できていないため、密閉/無人充電は未受入。量産・閉筐体版には各cell温度検出と充電遮断の追加設計が必要。供給chargerの銘板/使用国/CC-CV動作と各cell≤4.2Vを受領検査する。指定kit充電器以外を使わない。

Core接続前にdummy loadで定常・起動・負荷除去・充電着脱を確認し、**Pi端5V railを4.85〜5.25V内**に保つ設計受入とする。純正cableの接点降下/温度、逆流、電池lowの遮断、shutdownの時間余裕を測る。R04はこれらの未実測を含む。監視I2C異常時はunknown→保存・停止を使い、BMS強制遮断まで仕事を続けない。

10.8V×2.8Ah×効率85%×使用率80%を仮定すると約20.56Wh、平均6Wで約3.4時間。航続保証ではない。取り外しはjob保存→固定worker grant失効→RJ45抜去→**充電DC5521抜去**→保持解除。電池/UPS/CPU/両USB装置/I2CはCoreに残す。予告なしのpower/link消失も共通の保存/失効契約を使う。

## 5. 通信・SIM・アンテナを同居させる条件

| アプリ経路 | 無線側の扱い | 初号での用途 |
| --- | --- | --- |
| LOCAL | 新規アプリ送信なし。接続中modemの網維持は別状態 | queue/保存結果。無送信保証が必要な全体停止は別の手順 |
| WIFI | Wi-Fi STAまたはAP、BT OFF。modemの給電・網維持を継続する案 | 既知AP通信またはローカル操作。modem制御面との同居評価が必要 |
| LTE | LTE-M socket、Wi-Fi/BTは停止する案 | 有限message。Linux一般WAN/PPPは未受入 |
| NTN | 共用modemのNB-IoT NTN、Wi-Fi/BTは停止する案 | 屋外静止、GNSSから位置を得て小容量UDP |

**旧P3の「modemをOFFにすれば同時送信ゼロ」という前提は撤回。** Skylo conformance §2.4.4のdetach/電源断制限に合わせ、アプリのrouteとmodemの給電・網維持状態を分ける。Wi-Fi AP→LTE/衛星hotspotは初号用途外だが、網制御送信はアプリ送信の停止後も起こり得る。R01の同居評価を時間分割で代替しない。通常route変更にCFUN=0やUSB抜去を使わない。

Skylo §2.4.2の地上網優先と再探索周期をproviderのsubscription手順へ統合する。接続状態の維持費/制御通信を含めた承認範囲と、本人停止・予算到達・低電池・故障による終了方法はR02の回答で確定する。**無断課金を許す例外は設けない**。費用上限と正式停止手順が両立しない間はサービスを開始しない。物理的な異常時は保存可能な範囲で本体全体を安全停止し、ネットワーク条件を理由に通電を続けない。実装/適合受入前のEVKは無給電を保持する。

根拠: [Skylo conformance §2.4.2/2.4.4](https://www.skylo.tech/knowledge-base/device-conformance-document)。許可された省電力状態や例外を推測せず、[23章の確認文](23-japan-procurement.md)で適用範囲を取得する。

LTE/NTNは同じ送信系であり同時2接続ではない。Wi-Fiとのantennaは共用しない。KITのSMA antennaはLTE-Mと実施国のNTN bandに対応する必要がある。Pi基板antennaは無改造。樹脂面の端にRF、反対側にWi-Fi、上面にGNSSを割り当てるが、任意の20mm離隔を認証済みと呼ばない。電池・fan・USB shield・金属ねじ・ケーブル束から離し、GNSS受信低下とLTE/NTNの受信感度を同一配置で測る。アンテナ込み200mm外形が不成立なら筐体を再設計する。

### 地域別の初期profile

- **日本のWi-Fi**: country=JP、初号は2.4GHz/20MHz/ch1〜11、BT OFF。基板antennaは無改造、純正RF firmware/CLMを使い、実国不明時は無効。5GHz屋外利用を初号へ含めない。表示・board revision・適用証明書を現物照合する。
- **日本**: plan01s標準カードへplanX1（KDDI LTE-M用）とplanNT1を追加する設計。国内LTE-M band/端末承認は現物/契約で照合。日本NTNの提供開始は確認済み、**当該1SCのNTN国内認証とband/firmwareはR02未解決**。Skylo旧guideのB255記載を最新日本運用の確定値へ昇格しない。
- **米国**: 同じplan01sカードのLTE-M対応網とplanNT1を使う設計。Soracom現行設定guideはNTN B23を指定する一方、Skyloの古いguideにはUS B255がある。**採用SIM providerの最新地域設定を優先**し、exact firmware/antenna/FCC grantを照合。B255へ勝手にfallbackしない。
- FCC/ICでの20cm separationを設置条件の出発点にするが、20cm離せば同居確認不要とはしない。日本へそのまま転用せず、国ごとの条件を記録する。国外/不明国ではNTNを無効にする。

参照: [Soracom SIM種別/planX1](https://docs.soracom.io/en/services/air/sim-types)、[NTN要件と制限](https://docs.soracom.io/en/services/satellite)、[設定/切替](https://docs.soracom.io/en/services/satellite/configuration)、[Murata用設定](https://docs.soracom.io/en/devices/murata-1sc)。国のサービス範囲と各module/bandの適合は別項目として保存する。

## 6. Coreだけで送れるためのadapter契約

仕事・owner・revision・権限・使用額は14章の既存契約。新しい台帳/一般root APIを作らない。Piはaccount正本のcacheを持ち、固定AGXは任意worker。BSP/driver、電池/detach、serial socket、GNSS、アプリrouteとmodem網状態の管理をこのhardware profileの実装差とする。現時点でP3 adapterは**未実装/未実機受入**。

1. 起動時はアプリroute=LOCAL。R01〜04の適合manifestが未成立ならmodem sessionを開始しない。USB ID/board revision/`ATI`/firmware、SIMの識別hash、国profile、UPS状態を読取。IMSI/鍵の原文はログやGitへ残さない。
2. 既存Brokerで通信mode・宛先・料金上限・期限を確認。NTNでは最大**UDP payload 1,024bytes（暗号化/認証envelope込み）**、再送最大2回、TTL15分を初号値にする。providerの上限1,200bytes以内。制御/確認にも通信費があり、payloadだけで請求見積を確定しない。
3. LTE/NTN経路へ入る際はWi-Fi/BTを停止し、既存アプリsocketを閉じて世代更新。detachやmodem電源断は通常のroute切替に使わない。**RAT切替とSIM subscription切替は別操作**。planNT1追加は他subscriptionの自動切替にも影響する。planNT1の配信ready確認後、provider定義のCSIMコマンドで選択し、`AT+CIMI`を期待IMSIとローカル照合する。readyは開通/通信合格ではない。
4. 設定guideのCSIM/CFUN例とSkyloのattach方針を併用する正式手順は未取得。コマンド列を確定済み実装として使わない。初期化・RAT/profile変更・終了の各手順をproviderと確定する。エラー/serial再列挙ではアプリ状態unknown、旧grantを復活させない。網維持送信が止まったとは表示しない。
5. GNSS USBからchecksum正常のGGA/RMCを取得。初号は有効fix、age≤30秒、HDOP≤2、速度≤0.5m/sを10秒継続したことを**設計上の静止条件**とする（精度保証ではない）。実際の緯度/経度/高度をmodemへ供給。高度の基準はprovider/firmware仕様で確定し、GGA MSLとellipsoidを混同しない。位置不明/移動検知ではNTN送信を止める。
6. 初期APN候補は`AT%PDNSET=1,"soracom.io","IP"`。NTN RAT/国別band/位置はprovider承認手順で設定し、通常route切替のたびにofflineへ落とす旧手順は廃止する。静止位置の`AT%NTNCFG`を使う際は毎回実測位置へ更新し、例示都市の座標をコピペしない。受領firmwareで内部GNSS/静的指定の競合がないことを確認する。
7. 網登録1/5とRATを確認→有限UDPで自社受信口へ送る。**NTNのTCP/HTTP/MQTT/SMSは初号対象外**。UDPはそれだけでは暗号化も相互認証もない。既存認証message envelope、replay防止、許可宛先をadapterで実装する。Soracom Harvestの201は配送検証であり、仕事完了ではない。初回試験は秘密を含まないfixtureに限定する。
8. peer ACKのrequest ID/世代/署名を照合して既存jobへ保存。不明時は同じID照会、二重実行しない。subscription/RAT変更でTLS/UDP sessionは維持できない前提。復帰時のWi-Fiも自動有料fallbackも、承認範囲を超えて開始しない。

現行tetheringの`controller.py`、`LinuxPacketGate`、`NetworkQuota`、`message_adapter.py`/`message_service.py`を再利用する。NTNを任意Web用のIP routerへ開放しない。無線が通ることと、共通OSの署名済BSP/本人性/保存復旧が合格することは別。

## 7. 購入・無線送信前に閉じる4条件（技術照会中）

| ID | 誰が・何を確認するか | 必要な回答/証拠、閉じ方 |
| --- | --- | --- |
| **R01 同居RF** | JOINT: Murata/認証試験担当 | exact EVK/fw＋Pi4 CYW43455の同一frameに対する適用grant/追加試験。Wi-Fiとmodem網維持の同時送信を含む。人体距離は国別に確認、国別文書・測定記録が必要 |
| **R02 地域/回線** | EXTERNAL＋OWNER | 日本NTN認証番号・band/firmware/antenna条件、米国B23の該当grant、Skylo/provider開通対象、LTE-M網・SIM profile・APN・単価/上限、Skylo attach/終了/地上網優先と予算停止の両立。古いTELEC表/coverage mapだけでは閉じない |
| **R03 kit実品** | EXTERNAL＋ROCK | SKU 4573326593342がNTN版、付属SMA antennaのMPN/利得/対応band/寸法、USBコネクタ・board revision・FW。納入仕様が違えばこの図を改版、代替を勝手に認めない |
| **R04 電力** | EXTERNAL＋JOINT | UART0 USB給電の最大/突入/列挙前電流と許可host、必要なら正式外部給電回路。指定charger/セル適合、dummy load→実機でPi3A/USB1.2A枠、始動/scan/送信/負荷除去時のrailを測る。全体brownout/逆流なし、USB契約内を証明 |

[23章](23-japan-procurement.md)にSoracom/Quectelへの照会項目と送信状況を記録した。本人の承認後、Quectelへ1件送信済み、Soracomは会社連絡先の入力待ち。必要な回答がない間は「同居可能と確認済み」にしない。公開資料が不足したための残条件であり、本人が再度OSを選び直す必要はない。

## 8. 組立・試験の順序

1. **非送信組立**: SKU/rev/各端子と電池極性を照合。充電器を外しSWをOFF、純正cableをINPUT/5V/SWITCHへ接続。I2C 3.3V設定とheader方向を確認する。新品同一lot P28A×3をholder表示どおり挿入し、逆挿しLEDなしを確認。同梱acrylic/絶縁/保持具を取り付ける。セルへのはんだ付けなし。
2. **P3-A01 電源**: Core未接続、メーカー手順でBOOT/起動。5V dummy loadで定常/起動/着脱波形・接点降下・温度/各cell電圧を確認。合格後Coreのみ→GNSS→R04解決後EVK。12.6V/BAT出力をPiへ接続しない。
3. **P3-A02 機構**: antenna/USB余長/冷却込みの外形実測、保持、電池点検口。200mm以下、冷却/アンテナを塞がない。設計枠の寸法だけで合格にしない。
4. **P3-A03 GNSS**: phone/PC/LANなしで位置取得、stale/移動/不正NMEAで送信許可が閉じる。静止→位置変化→再測位を試験。GNSS受信のみを衛星送信成功にしない。
5. **P3-A04 radio**: R01〜04合格後、Wi-Fi/LTE/NTNを別々に往復。国/firmware/SIM/antenna/OS image同一組を記録。登録成功、UDP受信、認証ACK、既存job保存の4段階を分ける。
6. **P3-A05 切替・費用**: Wi-Fi→LTE→NTN→Wi-Fiで無許可アプリ送信0、無断課金0。modem網維持中のWi-Fi同居とproviderのattach/地上網優先手順を検証し、通常route変更でdetach/電源断しない。ACK喪失/serial断/予算切れ/位置不明/期限切れで二重実行0。NTN→Wi-Fi後も未知状態を成功へ丸めない。
7. **P3-A06 単体**: dock powerとRJ45を10回外す。boot ID継続、保存欠落0、旧grant復活0。PC/phone/routerを使わず電池＋LTE/衛星で有限往復。同一profileで1時間以上、20%で新規有料要求停止、10%で保存shutdown。時間は目標で実績ではない。
8. **P3-A07 共通OS**: 同じjobの作成/承認/停止/保存/再起動/読戻し、固定workerとの二重実行0。光学C-02/音声入出力は別。P3にはmic/speaker/空中表示を新規搭載していない。

現在はR01〜R04未完了、P3-A01〜07すべてNOT_RUN。静的検査/PDF/全repository検査の結果は [validation JSON](../../../data/mii-integrated-radio-validation.json) に記録する。購入/契約/開通/OS書込/無線送信/main統合は未実施。

## 消防入力F2との電力境界

[25章](25-retrofit-fire-hardware.md)のUSB入力を追加する場合、本章でNCだった青USB3下段を使用する評価差分となる。本章のP3単体netlistは維持する。追加host受入枠100mAでは全USB合計1.2Aとなり余裕がなく、全通信＋消防入力の同時接続はHOLD。初回F-Hはmodem/GNSSを未接続として入力を評価。R04とF-E02の最大・突入・列挙・温度の実測後に全構成を改版する。消防部の電源をP3や感知器回線へ分岐しない。
