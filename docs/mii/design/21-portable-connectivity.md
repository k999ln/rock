# 21 可搬mii P2 — LTE・Wi-Fi・衛星と着脱電源の組立設計

2026-11-02 / P2 / MAT15・MINI-08・NET01・SIM01・OS10 / 主担当 Material Invention・ROCK。

**取り外すのは、OS・保存・電池・3種類の通信を持つCore一式。** ドックに電池やWANモデムを残さない。本人の最新指示を受け、19〜20章の「可搬core/radio未選定」から本章の選定へ進めた。部品表と端子間の組立配線は本章と [BOM/netlist](portable-p2/bom-netlist.json)、印刷図は `output/pdf/mii-portable-p2-wiring.pdf`。これは可搬通信のモジュール試作設計であり、実機で通信できたという報告ではない。

## 1. 持ち出すもの・固定側に残すもの

| 部分 | P2での責任と構成 |
| --- | --- |
| **可搬Core** | Pi 4B上の共通RockstarOS runtime、accountの端末cache、同じjob/保存、microSD、電池、LTE modem/SIM/antenna、内蔵Wi-Fi、衛星modem/antenna、冷却。スマホ・PC・固定HubをWAN中継や常用演算に必須としない |
| **dock** | 機械的保持、UPSへ5V給電、任意の1GbE。初号はUSB-C/RJ45の手動抜差し。独自pogo電源、USB-C PDトリガー、磁石だけの保持は作らない |
| **固定空間側** | HW1の4 Tower・AGX・投影機を保持。P2と組み合わせる場合AGXは任意の空間演算worker。Coreと二重に仕事/承認/財布を実行しない |
| **表示** | P2は通信Coreの設計。衛星通信やAPの成功を空中像・板膜なし・少数表示部・上下全域・低眩しさの合格へ転用しない。光学C-02は残る |

```text
                 ┌──────── 取り外す mii Core 一式 ──────────┐
固定AC → SC0218 ─┤ PiSugar 3 Plus + 同梱5000mAh電池          │
  手動USB-C抜去   │     │ 純正背面contact: 5V/GND + I2C       │
                 │     ▼                                     │
固定LAN ─ RJ45 ──┤ Pi 4B 4GB + microSD / 共通OS              │
  任意・dataのみ │     ├─ 内蔵Wi-Fi + 基板antenna             │
                 │     ├─ USB-A → Micro-B → SIM7080G HAT     │
                 │     │                     └LTE1→FXP14    │
                 │     └─ USB-A → USB-C → 9704-ANT          │
                 │                            └一体patch↑空  │
                 └───────────────────────────────────────────┘
```

C-01は「構成未選定」から「P2構成選定・物理受入待ち」へ進む。1m Towerを外すだけで単独動作するという意味ではない。初号Coreは通信と保存に集中する。持ち出したCore単体での音声入出力・空間表示は本BOMには未搭載で、既存Towerのmic/cameraを移植済みとはしない。事前保存した有限の通信要求はCoreだけで実行する設計であり、スマホのAP接続は任意の操作入口。

## 2. 型番を固定する部品表（Core 1台）

現物のboard revision、モデムfirmware、地域表示、付属電池表示を受領時に記録する。同じ商品名の別revisionへ無条件に代替しない。価格/在庫/回線契約は未確定。

| ID / 数 | 選定型番 | 端子・配置 |
| --- | --- | --- |
| CORE / 1 | **Raspberry Pi 4 Model B 4GB（SC0194系列）** | **Cypress CYW43455**（基板内SDIO接続、2.4/5GHz 802.11ac）とantennaを含む完成基板。J8、黒いUSB2-A×2、RJ45、microSD。内蔵RFに後付けcoaxをはんだ付けしない |
| UPS / 1 kit | **PiSugar 3 Plus 5000mAh** | 同梱電池/保護回路/背面接点/取付ねじをセット採用。Type-Cは充電IN。MicroUSB予備INと拡張padはNC。PiSugar 3無印/S/Airとは区別 |
| LTE / 1 | **Waveshare SIM7080G Cat-M/NB-IoT HAT (EN), SKU 17693** | USBJ1 Micro-B、LTE1 IPEX、SIM_CARD1。Piの40pinへ積まない。P1/H1は未接続、GNSS/GPS1は未接続・OFF |
| LTE-ANT / 1 | **Taoglas FXP14.07.0100A** | 100mm coax先端I-PEX MHF I（U.FL互換）→ LTE1。70×20×0.2mm FPCを樹脂面へ。MHF4/RP-SMAではない |
| SAT / 1 | **Ground Control RockBLOCK 9704-ANT** | Iridium 9704＋一体patch antenna。USB Type-C給電/serial。16pin外部header、V_BATT、GNSS出力はNC。SMA版/APNT/9603と混同しない |
| SD / 1 | **Samsung PRO Endurance MB-MJ64KA/AM** | 64GB microSDXC → COREのmicroSD slot。電源断後に挿抜。耐久商品でも電源断保存保証や鍵の耐タンパー保証ではない |
| FAN / 1 kit | **Raspberry Pi 4 Case Fan（純正3線型、付属heatsink）** | 赤→J8 pin4、黒→pin6、青→pin8/BCM14。付属heatsinkをCPUへ。専用ブラケットで吸排気を確保 |
| C-LTE / 1 | **StarTech USBAUB50CMBK** | 0.5m USB-A male → Micro-B male。charge-only不可 |
| C-SAT / 1 | **StarTech USB2AC50CM** | 0.5m USB-A male → Type-C male、data＋power。充電器へ挿してもserial接続にはならない |
| PSU / 1 | **Raspberry Pi SC0218 / KSA-15E-051300HU** | US Type-A、固定5.1V/3A、直付1.5m Type-C → UPS。日本の調達時は当該国内販売品の表示/適合を照合。Pi自身のUSB-Cには挿さない |
| C-LAN / 1、任意 | **StarTech NLBL-2M-CAT6A-PATCH** | CORE RJ45 → 本人管理router LAN、または隔離した固定worker LAN。P2にはPoE HATなし |
| MECH / 1 set | **MII-P2-MECH-01（本設計の加工品番号）** | 180×160×90mmの配置枠、非導電保護部、ねじ止め基板、電池保持、充電点検口、開放型cradle。加工仕様は§6。既製品型番や製造承認ではない |

別途必要なサービス部材: **1.8V対応・LTE-M利用可能・data用のIoT SIM**。試作はnano SIMを維持し、SIM_CARD1のMicro SIM相当socketにキャリア供給の3FF保持枠で固定する。回路図の `SIM_CARD_MID` と現物の15×12mm適合を確認してから装着し、裸のnanoを大きいsocketに押し込まない。3サイズ共通カードを選び、空の保持枠は挿入しない。carrier/APN/契約SKU/国内module利用承認は未決定。市販consumer eSIMをこのslotへ入れる設計ではなく、SGP.32量産要件は別の次版。

出典: [Pi 4](https://www.raspberrypi.com/products/raspberry-pi-4-model-b/)、[Pi電力・fan](https://www.raspberrypi.com/documentation/computers/raspberry-pi.html)、[PiSugar](https://docs.pisugar.com/docs/product-wiki/battery/pisugar3/pisugar-3-series)、[Waveshare製品](https://www.waveshare.com/product/iot-communication/sim7080g-cat-m-nb-iot-hat.htm)、[Waveshare回路/外形図](https://www.waveshare.net/w/upload/0/0d/SIM7080X-Cat-M-NB-IoT-HAT-Schematic.pdf)、[FXP14](https://cdn.taoglas.com/datasheets/FXP14.07.0100A.pdf)、[9704仕様](https://docs.groundcontrol.com/iot/rockblock-9704/specification)、[SD](https://www.samsung.com/us/memory-storage/memory-card/pro-endurance-adapter-microsdxc-64gb-sku-mb-mj64ka-am/)、[fan端子図](https://datasheets.raspberrypi.org/case-fan/case-fan-product-brief.pdf)、[C-LTE](https://media.startech.com/cms/pdfs/usbaub50cmbk_datasheet.pdf)、[C-SAT](https://media.startech.com/cms/pdfs/usb2ac50cm_datasheet.pdf)、[PSU](https://datasheets.raspberrypi.com/power-supply/usb-c-power-supply-product-brief.pdf)。新規の未確認部品番号を作らず、型番のない純正kitは製品名/variantで固定した。

## 3. 接続表とpinout

**J8は物理pin番号。BCM番号と混ぜない。** USB2の黒い2段口を、基板から遠い上段=U-LTE、基板に近い下段=U-SATと本設計で付番する。青いUSB3は両方未使用。ラベルはPiメーカーのconnector番号ではない。

| 接続 | From → To | 信号・注意 |
| --- | --- | --- |
| P01 | PSU captive Type-C → UPS Type-C IN | 5.1V、3A能力。USB-C native接続のまま。延長/PD昇圧なし。取り外すのはこのplug |
| P02 | UPS純正背面spring contacts → CORE裏面GPIO接点 | 5V/GND、I2C SDA/SCL。純正取付方向・4本のねじで固定。電池を含むUPSごとCoreに残す |
| P03 | UPS同梱battery → UPS PH2.0 battery socket | 工場のbattery harnessを使用。極性をJST外形だけで推定しない。交換pack、自作セル/並列化なし |
| U01 | CORE U-LTE → C-LTE → LTE USBJ1 | USB-A 1 VBUS → Micro-B 1 VBUS、2 D−→2、3 D+→3、4 GND→5。Micro-B 4 IDは未接続。shieldは完成ケーブルのまま |
| U02 | CORE U-SAT → C-SAT → SAT USB-C | USB2 data＋5V。USB-C内部CC/抵抗は完成ケーブル・基板へ任せる。手配線やY分岐なし |
| R01 | LTE-ANT MHF I plug → LTE LTE1 | 中心=RF、shell=GND。無通電で真上から着座。GPS1と取り違えない |
| F01 | CORE J8 pin4 → FAN red | 5V電源。GPIO出力pinでfanを給電しない |
| F02 | CORE J8 pin6 → FAN black | GND |
| F03 | CORE J8 pin8 / BCM14 → FAN blue | 3.3V制御。UART console/TX用途を無効にし、fanに専有させる |
| S01 | SD → CORE microSD | OS/BSPと共通runtimeの導入は別作業。今回書込みはしない |
| E01 | CORE RJ45 → C-LAN → owner router LAN | 初回の任意有線管理。固定worker使用時は分離した専用LANへ差し替える。roleを変えた旧grantは失効 |

UPSのI2CはCORE J8 **pin3=BCM2/SDA、pin5=BCM3/SCL**の既存bus。5V railはJ8 pin2/4、GNDはpin6等へ内部で共通。ここはネットの対応を示すもので、独自pogo配置や追加ジャンパの指示ではない。純正背面contactの製造revを確認し、反転・位置ずれのまま締めない。初期addressはpower **0x57**、RTC **0x68**。I2Cへ5Vを入れない。

LTEのオプションheader **P2: 2–3（VCC_UP→3V3）**のみjumper、**4–5（PWR→P7）は外す**。P1/H1は一切つながないためUSBだけが5V供給源になる。基板のK1/PWRKEYを約1秒押して起動。自動起動を仮定しない。LTE USBのVBUSとPi header側5Vは回路上つながるため、別電源を同時に挿さない。内蔵MP1482を通るVBATへ5Vを直入れしない。

SATのUSB経路は電源sequencingを基板が扱う。defaultの約460mA supercapacitor充電設定を保持し、800mA高速充電jumperをshortしない。初回約40秒を見込み、RDYとUSB列挙を待つ。serial初期値230400 baud、実USB ID/serial/portと結び、`ttyUSB0`を固定値としない。16pin UARTとUSBを同時使用しない。[9704 hardware](https://docs.groundcontrol.com/iot/rockblock-9704/hardware)。

NC固定: CORE USB-C、USB3×2、micro-HDMI×2、CSI/DSI、PoE header、J8の他の外部端子、LTE P1/H1/GPS1、SAT 16pin全pin/V_BATT/GNSS出力、UPS MicroUSB/拡張pad。PiSugarの既存内部接続や工場のRF接続を外す意味ではない。

## 4. 電源・電池・着脱

PiSugar 3 Plusは5V出力最大3A。Pi 4のUSB周辺機器枠は**全port合計1.2A**で、3AをUSBへ流せるという意味ではない。P2は次の**試作受入上限**を採る。上限は実測値でも全動作条件のメーカー保証でもない。

| 5V負荷 | 設計枠 |
| --- | ---: |
| Pi 4本体、Wi-Fi/SDを含む（外部USB/fan除外） | 1.50A |
| LTE USBJ1 | 0.50A |
| SAT USB-C、default充電を含む | 0.50A |
| 純正fan | 0.18A |
| **合計** | **2.68A = 13.4W、3Aに対し0.32A余裕** |
| **USB計** | **1.00A、1.2Aに対し0.20A余裕** |

SIM7080Gの公開資料の0.5Aは**3.8V VBATでのtypical peak**であり、USB側最大値ではない。HATのDC/DC損失・始動・圏外再探索を含め、USB入力で0.50A枠を超えないことを測る。USB列挙前も含むsink要件/descriptorを確認し、枠を超えるならP2は不合格。電流制限の解除や端子の二重給電で救済せず、給電回路/BOMを改版する。[SIM7080G電源](https://files.waveshare.com/upload/e/e7/SIM7080G_Hardware_Design_V1.03.pdf)。

Pi本体1.50A枠は重いローカルLLM/4 camera fusionを含まない。P2では無線制御・queue・共通runtime・小容量cacheを対象にし、camera raw集約/重い推論は固定workerまたは許可済cloudへ。workerがない時は当該能力をunavailableとし、共通OSの権限や仕事の意味は変えない。電源枠はCPU制限だけで保証できないので同一実機のworst-case試験を必須にする。

同梱5000mAh電池の公称電圧を現物で確認する。**3.7Vとした仮計算は18.5Wh**、効率0.85×使用率0.8を仮定して12.58Wh。平均6Wなら約2.10時間、10Wなら約1.26時間、13.4W連続なら約0.94時間。これは寿命/温度/電圧降下未反映の計算で、航続時間の保証ではない。初号受入目標は規定通信profileで1時間以上、残量20%で新規有料job禁止、10%で保存→正常shutdown（値は実測校正で再判断）。

**充電は点検口と電池区画を開いて、換気された不燃台上で行う。** メーカーは充電中の密閉容器・袋・3D printed case内使用を禁じている。閉箱のままdock充電できる製品とはまだしない。電池0〜40°Cのメーカー範囲を守り、試作は20〜30°Cの室内で始める。表面/電池温度を独立測定し、40°C到達前に充電を止める。PiCPUの温度だけを電池温度の代用にしない。[PiSugar使用条件](https://docs.pisugar.com/docs/product-wiki/battery/safety-precautions)。

UPS入力はメーカー記載の4.5〜5.2V範囲を守り、初号は4.75〜5.2Vで受入れる。SC0218の公称5.1Vに対し仕様のload regulation ±5%は上側5.355Vまで含み得るため、公称値だけで互換合格にしない。無負荷/充電/負荷変動で入力5.2V超を観測した個体は接続せず、より狭い電圧公差の給電へ改版する。

PSUの3A入力能力は「本体3A＋電池充電3A」を意味しない。送信/CPU負荷時は充電を停止する設定から受入れ、負荷を落とした状態で充電を検証する。外部power消失はUPSの0x57:0x02 bit7で観測可能だが、これは電圧有無であり機械的dock検出ではない。[I2C仕様](https://docs.pisugar.com/docs/product-wiki/battery/pisugar3/pisugar-3-i2c)。

着脱手順は「取り外し要求→固定worker入力停止/保存→dockに付随するgrant失効→RJ45抜去→UPS Type-C抜去→保持具解除」。予告なしのpower/link消失でも旧grantを閉じるadapterが必要。UPSが運転継続しても、OS側のgrant失効や保存が実装済みとは言わない。再装着は物理接続だけで自動承認しない。PiSugarのpower/TAPボタンは手で届く位置へ出し、正常shutdown後に出力OFF。非常時の長押し断は未保存を失う可能性がある。

## 5. LTE・Wi-Fi・衛星の使い分け

| 経路 | P2で選ぶ能力 | 同一実機の合格条件 |
| --- | --- | --- |
| LTE | SIM7080G **Cat-M1/LTE-M**、NB-IoTは初期OFF、5Gなし。許可済自社cloudの制御/メッセージ中心。公称DL≤589kbps/UL≤1119kbps、実効値は未測定 | exact module firmware、1.8V SIM、国内carrierのLTE-M band/APN/利用承認、USB PPP interface、IP/DNS/TLS、切断復旧。帯域の小さいLTEなので一般4G高速routerと表示しない |
| Wi-Fi | Pi内蔵802.11ac。初期は**STAかAPの一方**。bulk取得はSTA。APは許可端末のローカル操作入口、LTE共有はquota/契約/packet gate受入後 | 現物radio/driver `brcmfmac`、国設定、`iw list`でAP能力、認証/隔離/IPv4/IPv6 quota。Bluetooth初期OFF。AP+STA同時動作は初号対象外 |
| 衛星 | **Iridium IMT**、message bridge。初号payload上限1,024byte/要求、再送最大2回、TTL15分を設計値とし、送信前にbyte/料金枠を予約。大きいfileは明示承認した有限chunkへ | Provider開通/国内外使用条件、endpoint認証、送受信/ACK/重複排除、上限、同じjobへの結果保存。一般IP、任意Web、映像、衛星経由の無制限hotspotは提供能力にしない |

Wi-Fiの部品はPi4に実装された **Cypress CYW43455** と基板antennaで固定する。接続端子は基板内SDIOで、ユーザー配線用のUSB/U.FL端子はない。完成Pi基板を採用してRF/SDIO配線をそのまま使う。根拠は[Pi公式移行資料 Wireless/Bluetooth節](https://pip.raspberrypi.com/categories/685-app-notes-guides-whitepapers/documents/RP-003475-WP/Transitioning-from-Pi-3-to-Pi-4.pdf)。

LTEはUSB serial/PPPを採る。SIM7080G **1951B17SIM7080**でUSB PPPの実装例が公開されるが、他社hostでの検証をPi/Linux実機へ転用しない。受領firmwareの対応を確認し、Linux option/PPP portを列挙して使う。非対応なら勝手にfirmwareをflashしない。[Espressif USB PPP対応表](https://docs.espressif.com/projects/esp-iot-solution/en/latest/usb/usb_host/usb_ppp.html)。APの可否は基板名だけで確定せず、地域・image・driverの組を保存する。

有料経路への切替は明示的な通信予算と許可で行う。Wi-Fi断からLTEへbulkを流さず、LTE圏外から衛星へ無断送信しない。衛星ACKは配送であってTool成功ではない。利用権、SIM profile、網登録、IP経路、Provider queue、Job状態、請求を分離する。owner/device/boot/connection generationを保存し、復帰後は同じrequest/job IDで照会する。

### RF配置・適合で残る条件

9704-ANTは本体にpatchを含む。別の市販Iridiumアンテナへ交換せず、patchを空へ向ける。メーカーの外形は72(95)×72×16.5mmなので**95×72**の最大側で配置枠を取る。LTEとWi-Fiは別radio/antennaで、対応bandや部品認証だけを完成miiの適合証明にしない。

**Ground Controlの9704-SMA設置条件には、同じhousing内の他の送信機を禁止する記載がある。9704-ANTへの適用範囲と一体miiでの追加試験・認証条件は未確認。** ANT版だから例外、時間分割で自動的に適合、内部隔壁だけで別housingとは扱わない。本BOMは配線・非送信組立を進める選定で、同居した状態の送信releaseは保留。試験担当がexact ANT版とLTE/Wi-Fi配置・国別使用についてメーカー/認証条件を確認し、必要なら衛星を独立した可搬podへ改版してから送信する。podへ変更しても外部電源やPCを必須にしないが、200mm包絡/単体条件を改めて受入れる。今回は問い合わせ送信をしていない。[メーカー設置条件](https://docs.groundcontrol.com/iot/rockblock-9704/installation)。

RF同居・日本の電波適合・carrier承認を解決するまではSATをUSB未接続、LTEはSIMなし/USB未接続として各段階を切り分け、許可された試験環境以外でradioを送信しない。softwareのOFF指示は物理的RF遮断の証明ではない。3radio同時送信の性能/適合は未受入。初号で単一radioずつ測ることも法的/メーカー要件の免除にはならない。

## 6. 組立と機械配置

P2の配置枠は**180 W ×160 D ×90 H mm、最大外形200mm以下を目標**とする。これは部品配置図の割当であり、完成筐体の干渉/放熱/RF合格ではない。配線込み最大寸法を実測し、はみ出すなら図を改版する。

- 加工品MII-P2-MECH-01: 非導電板180×160×3mmを上下2枚、M3 nylon支柱長80mm×4で保持する初号frame。角から10mmにφ3.2mm穴。周囲は接触防止guard、電池区画は開閉できる構造。屋外防水/IP等級なし。充電中は電池区画を完全に開放する。
- 下段: Pi/PiSugarを約95×70×35mm枠へ。PiSugar純正ねじを別の長さで置換しない。電池面へ支柱/ねじ端を向けず、圧迫/折曲げ/接着固定をしない。メーカー保持構造を補助する非導電retainerを用いる。
- LTEは65×30.5mm基板の4穴をM2.5絶縁支柱で固定（穴径3mm、中心58×23.2mm）。SIM側に点検空間。H1/P1の露出pinをinsulation guardで覆う。USB曲げ空間と100mm同軸の到達を確認する。
- 上段: SATは95×72×16.5mm枠を取り、patch上方を無金属のRF windowとする。メーカーCADの取付穴で固定、patchに穴を開けない。基板下面には5mm以上の絶縁間隔を設計値として取り、USB strain reliefをframe側へ。具体的穴位置は現物/CAD照合後に穴あけする。
- LTE FPCは樹脂の側面、Pi内蔵Wi-Fi antennaは樹脂側面近く。電池・heatsink・USB shield・ねじをantenna直上に置かない。仮の20mm離隔は配置目標で、認証条件や干渉保証ではない。SAT/LTE/Wi-Fiの同居gateは§5を適用。
- USB線は0.5mを緩いループでframeに保持、coaxとfanへ絡めない。コネクタに筐体の荷重をかけず、裸線のはんだ配線やバッテリー線の切断は不要。
- dockは184×164mm以上の受け面と保持strapを持つ開放cradle。ポートへ押し込んで自動接続する機構にはしない。Type-CとRJ45を手で外し、strapを解いてCore一式を持ち出す。

まず無通電で完成ケーブルと取付方向を照合する。UPS単体→Pi/SD→fan→LTE（RF試験条件成立後）→SAT（同居条件成立後）の順で負荷を追加。USB-C二重給電、LTE1/GPS1誤挿し、PiSugarの反転接触、充電点検口の閉鎖、SAT高速充電jumperの変更があれば停止する。

## 7. 共通OSへ接続する実装境界

[14章](14-common-os.md)のWorkJob、Broker、owner/revision、保存、料金/予算を再利用する。Pi用に別の商品台帳/Job状態/Walletを作らない。P2の[hardware profile](../../../systems/rock-star-os/targets/mii-portable-p2/README.md)はI/O・電源・通信・演算/表示上限だけを持つ。Pi用BSPを使うことと、共通OSの仕事契約を変えることは別。同一binaryをPixel/Jetson/Piへそのままbootできるとはしない。

| adapter | 入出力・失敗・復旧 | 実装/受入 |
| --- | --- | --- |
| battery/detach | I2C電圧有無/残量、TAP要求、link世代→保存/停止要求。I2C読取不能時はunknown、新規grant拒否。電源復帰だけで旧grantを復活させない | P2結線と状態契約を設計。実Pi daemon/低残量shutdownは未実装・未試験 |
| LTE/STA/AP | USB ID/firmware/PPP、brcmfmac/実interface→既存LinuxPacketGate/ManagedAP/NetworkQuota。端末別認証、費用枠、IPv4/IPv6双方を閉じる | [既存tethering](../../../systems/rock-star-os/targets/avocado-mini/tethering/README.md)を再利用。P2実modem/AP/網側hard capは未受入 |
| satellite | USB serial→9704公式library→既存MessageAdapter/Service。有限chunk、TTL、再送、digest、配送ACKと処理完了を分離 | [既存message契約](../../../systems/rock-star-os/targets/avocado-mini/tethering/MESSAGES.md)。P2 driver/Broker/Provider/実Job接続は未実装・未受入 |
| 固定worker | Coreがjob/leaseを所有し、AGXには期限付き空間処理だけを依頼。detachで入力を止める。未完了remoteはunknownで照会 | HW1とは別のP2 worker mode。1GbEへ4 Tower raw（約1.034Gbps）を流さず、初期は校正済低帯域結果のみ、合計50Mbps以下の設計枠 |

OS/profile状態は `hardware_selected / assembled / bsp_booted / adapter_ready / physical_accepted` を別記する。OS署名鍵/flash/無線設定は今回変更していない。基板にTPM/SEを追加していないため、microSDの鍵/cacheを耐タンパー保護済みと呼ばない。共通OSのcredential保護/失効/紛失復旧は実機移植で確認する。

## 8. 同一実機の受入表（すべて未実施）

| ID | 合格条件 | 現在 |
| --- | --- | --- |
| P2-A01 | 全型番/revision/電池表示/端子/極性、SIM寸法、NC、ケーブル/機構の照合。選定と実物の差分0 | NOT_RUN |
| P2-A02 | low/full battery、cold start、圏外scan、SAT cap充電、CPU/Wi-Fi/fanでCORE 5V rail 4.75〜5.25V、UPS入力4.75〜5.2V、UPS≤3A、USB≤1.2Aかつ各radio≤0.5A。brownout/reboot 0 | NOT_RUN |
| P2-A03 | 許可済み環境で、外部USB-C/RJ45抜去後Coreのboot ID継続。10回着脱で保存欠落0/二重job0/旧grant復活0。別PC/phoneのWAN中継なし | NOT_RUN |
| P2-A04 | exact国内module/SIM/APN/RF条件受入後、LTE-M IP/DNS/TLS往復、断復帰、usageと上限。IP電話音質や高速通信は別評価 | BLOCKED_CARRIER_AND_RF |
| P2-A05 | STAとAPそれぞれの認証、端末間隔離、無許可転送0。LTE共有は網側条件と料金上限の両方確認後 | NOT_RUN |
| P2-A06 | ANT版同居/日本・米国条件の文書確認、閉箱RF再測定、許可済衛星送受信、ACK消失/TTL切れ/重複/byte上限、同じjob保存 | BLOCKED_COLOCATION_AND_PROVIDER |
| P2-A07 | 通信profile記録の上1時間、温度/電圧/電流ログ、20%/10%停止、復旧。充電時点検口開放、電池40°C未満 | NOT_RUN |
| P2-A08 | 同じjobの作成/承認/停止/保存/再起動/結果照会を共通OSで一周、CoreとAGXの二重実行0。SD全損復元は別gate | NOT_RUN |

静的検証: `python3 docs/mii/design/portable-p2/check.py`、図の再生成: `python3 docs/mii/design/portable-p2/render.py`。reportlab・日本語fontが必要。文書/配線整合は実測と区別する。購入、契約、SIM開通、問い合わせ、実機通電、無線送信、OS書込みは未実施。次はP2-A01/02の受領・電源試験準備とP2 adapter実装、RF同居/国内回線条件の確定である。
