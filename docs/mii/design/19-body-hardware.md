# 19 mii本体 HW1 — 部品選定・端子・組立配線

2026-11-02 / HW1 / MAT15・MINI01・MINI02・OS10 / 設計担当 ROCK。

**今回の対象は、4本のTower、専用Hub、表示部からなるmii本体。** 18章のMac＋Webカメラ／Piは開発用検証装置であり、本体ではない。HW1では市販のセンサー・演算・給電モジュールを本体へ組み込む。Macは初期設定・firmware転送に使える保守端末で、常用の演算機にはしない。

**本書はモジュール接続・低圧ハーネスの組立設計。** 実物の組立、通電、専用firmware、Hubの共通OS adapter、閉箱の温度・転倒・光学試験は未実施。カスタムPCBや量産筐体の製造releaseではない。配線後ただちに完成アプリが動くという意味ではない。[14章の共通OS](14-common-os.md)を維持し、業務台帳・本人性・権限・予算を別に作らない。

機械可読正本: [部品とネットリスト](body-hw1/bom-netlist.json)。通信追加の2部品・2接続は[20章](20-connectivity.md)と[通信BOM](body-hw1/communications.json)。印刷図は `python3 docs/mii/design/body-hw1/render.py` で `output/pdf/mii-body-hw1-wiring.pdf` に生成する。図は端子間の接続図であり、コネクターを正面から見た接点配置図ではない。

## 1. 本体の構成を固定する

```text
                         mii 専用Hub
 Tower T1 ──10m Cat6A── port17 ┐
 Tower T2 ──10m Cat6A── port18 │ USW-Pro-24-PoE
 Tower T3 ──10m Cat6A── port19 │ 400W PoE budget
 Tower T4 ──10m Cat6A── port20 ┘
                               port25 SFP+
                                  │ UACC-CM-RJ45-MG-US → Cat6A 2m
                                  ▼
                     J17 [Jetson AGX Orin 64GB Dev Kit]
                     J1  [Samsung 980 PRO 1TB]
                     J24 ← 同梱USB-C PD電源
                     J18 DisplayPort
                                  │ DP2HD4K60S active adapter
                                  │ HDMM2M / HDMI 2m
                                  ▼
                         HDMI1 [BenQ TK710STi]
                                  → 初期設定1080p60・壁1面
```

- **Tower**: OAK-D Pro W PoEでGS左右カメラ・RGB・IMU・ISP/encoderをまとめ、Teensy 4.1で2マイク、在室レーダー、温度、SEを扱う。TowerにLinuxや別版のRockstarOSは置かない。Teensyに映像encodeを任せない。
- **Hub**: JetsonのメーカーBSP/driver上に共通runtimeとmii I/O adapterを載せる設計。AGX Orin Dev Kitの10GbE・DisplayPort・電源端子まで指定する。BSP起動とRockstarOS実機受入は別。既存phone/QEMU用imageをそのまま書き込まない。
- **表示**: 型番未確認の手持ちprojectorに依存せずTK710STiを選定。使用する場合は別variantとして型番とEDIDを照合する。1台で壁1面を評価し、空中像・上下全域の合格にはしない。

## 2. 選定BOM（4 Tower＋Hub＋表示1式）

価格・在庫・発注は未確定。メーカー型番のない汎用受動部品は、値・許容差・電力・耐圧を注文仕様にする。部品受領時にSKU、board revision、付属PSU、地域用AC cordを照合する。CAMは**IMX378版 A00574**、MCUは**Ethernet PHY付き4.1**、HUBは**64GBのDeveloper Kit一式**を選び、類似品に置換しない。

| ID | 型番・注文照合キー | 全数 | 使用端子・役割 | 出典 |
| --- | --- | ---: | --- | --- |
| CAM | Luxonis OAK-D Pro W PoE / IMX378 / A00574 | 4 | M12 X-coded 8pin PoE; M8 aux capped NC | S01/S02 |
| MCU | PJRC Teensy 4.1 / Ethernet PHY搭載版 | 4 | VIN 5V; GPIO 3.3V; Ethernet kit; NE版不可 | S04/S06/S31 |
| ETH | PJRC ETHERNET_KIT | 4 | 純正2×3/2mm header・ribbon・MagJackを一式使用 | S05 |
| MCU-SOCKET | 2.54mm 1×24 male header×2＋1×24 female socket×2 / 1組 | 4 | Teensy着脱用; female高さ8.5mm以上、Ethernet裏面部品と干渉しないこと | DESIGN |
| MIC-L | Adafruit 3421 / SPH0645LM4H | 4 | I2S left, SEL=GND | S07/S28 |
| MIC-R | Adafruit 3421 / SPH0645LM4H | 4 | I2S right, SEL=3.3V | S07/S28 |
| RAD | DFRobot SEN0623 / C1001 | 4 | 5V VIN; 3.3V IO2 presence; UART NC | S08 |
| SE | Adafruit 4314 / ATECC608 breakout | 4 | I2C VIN=3.3V; 鍵書込・lock未実施 | S09/S29 |
| TMP | Adafruit 1782 / MCP9808 | 4 | I2C VIN=3.3V; address 0x18 | S10/S30 |
| FLEX | Ubiquiti USW-Flex | 4 | port1 PoE++ in; port2 CAM; port3 control | S11 |
| SPL | Adafruit 3785 / MicroUSB 5V 2.4A isolated PoE splitter | 4 | 100Mbps data only; minimum load 100mA | S15 |
| USB | Adafruit 1833 / USB Micro-B breakout | 4 | VBUS / GNDのみ使用 | S16 |
| SW | Pololu 2810 / Mini MOSFET Slide Switch LV | 4 | radar power; slide OFF固定; ON=MCU3 | S17 |
| F1 | Littelfuse RXEF110 / radial PPTC | 4 | hold 1.1A at 20°C; thermal derating; 5V枝のみ | S18 |
| RLOAD | 43Ω ±5%, 2W以上, 難燃リード抵抗 | 4 | 最小負荷用; 5Vで約0.58W; 浮かせて実装 | DESIGN |
| RPD | 100kΩ ±5%, 0.25W リード抵抗 | 8 | radar ON / IO2のpulldown各1 | DESIGN |
| CIN | 100µF 16V 電解capacitor | 4 | +5V_NODE-GND; +極は5V | DESIGN |
| COUT | 10µF 16V 電解capacitor | 4 | +5V_RADAR-GND; +極は5V | DESIGN |
| CBYP | 100nF X7R 25V以上 リードcapacitor | 8 | SW VIN-GND / radar VIN-GND各1 | DESIGN |
| PROTO | Adafruit 1609 / Perma-Proto half size | 4 | 低圧配電と受動部品; 全機器を一枚に載せない | S27 |
| M12 | Luxonis M12 X-coded male to RJ45 male Ethernet Cable / 2m variant | 4 | CAM専用; ページ名3mでも2m variantを照合 | S03 |
| UPLINK | StarTech NLBL-10M-CAT6A-PATCH | 4 | 10m RJ45 male-male / PoE++ 100W対応 | S25 |
| CTRL-CABLE | StarTech NLBL-2M-CAT6A-PATCH | 4 | 2m FLEX3→SPL input | S26 |
| HUB | NVIDIA Jetson AGX Orin 64GB Developer Kit | 1 | carrier / factory cooler / included PSU一式; module単体不可 | S19/S20 |
| SSD | Samsung 980 PRO 1TB / MZ-V8P1T0BW | 1 | M.2 2280 NVMe; HUB J1; data用 | S21 |
| PSE | Ubiquiti USW-Pro-24-PoE | 1 | 17–20=4 Tower; 25=SFP+ 10G; budget400W | S12/S13 |
| SFP | Ubiquiti UACC-CM-RJ45-MG-US | 1 | PSE25 SFP+→10GBASE-T RJ45 | S14 |
| HUB-CABLE | StarTech NLBL-2M-CAT6A-PATCH | 1 | 2m SFP→HUB J17, dataのみ | S26 |
| DP | StarTech DP2HD4K60S | 1 | active DP1.4 male→HDMI2.0 female | S23 |
| HDMI | StarTech HDMM2M | 1 | 2m HDMI male-male; HW1 1080p60 | S24 |
| PJ | BenQ TK710STi | 1 | HDMI1; factory power cord; 1面表示 | S22 |

ほかに、各Towerの低圧電源配線AWG22（赤/黒）、信号AWG26、熱収縮tube、絶縁スペーサー、結束/ストレインリリーフ、適合する取付ねじを用意する。Teensyは1×24の2列socketで着脱可能にし、ハーネスをsocket側のPROTO配線へ接続する。VIN/3.3V/GND印字と向きを照合し、裏面Ethernet kitに十分な空間を空ける。他モジュールは印字されたthrough-hole padへはんだ付けし、引張荷重をpadで受けない。脱着端子を追加する改版ではコネクター型番・極性・嵌合図を追記する。HW1で無指定の圧着コネクターを挟まない。

## 3. TowerのEthernetと給電 — 4本とも同じ

```text
     HubのPSE port17/18/19/20
               │ E01 / Cat6A 10m / 1GbE + 802.3bt
               ▼
       [USW-Flex port1]   ← Towerの底部
           ├ port2 ─ E02 / Luxonis純正M12–RJ45 2m ─ CAM M12
           │                      1GbE + PoE         OAK-D Pro W PoE
           └ port3 ─ E03 / Cat6A 2m ─ SPL PoE IN
                                            ├ RJ45 OUT ─ ETH MagJack
                                            │             └ 純正ribbon → MCU Ethernet 2×3
                                            └ MicroUSB OUT ─ USB 1833 Micro-B
                                                            VBUS → F1 → +5V_NODE
                                                            GND  → 共通GND
       port4/5: 未接続・無効化 / CAM M8: 防塵cap・全pin未接続
```

CAMのM12は**X-coded 8pin**。一般のRJ45を直接挿せず、M12 A-coded品とも違う。Ethernet/PoEの接点を切断して自作配線しない。メーカーの完成cableを使う。CAMのM8 auxは同期用として予約するが、**外部FSYNCは絶縁入力側の仕様**を持つため、内部1.8V信号やTeensy 3.3Vと混同しない。HW1では全pinをNCとし、同期線を追加しない。[S01/S03]

SPLは**100Mbps限定**。マイク・制御だけを通す。カメラをSPLへ移すと映像帯域の設計が崩れる。ETHキットはPJRCの2×3/2mm基板用headerと純正ribbon/MagJackを組み立てる。2.54mm汎用headerで代用しない。コネクター向きはPJRC組立写真と現物pin1で照合する。[S05/S15]

### 3.1 低圧電源の配線

```text
 USB 1833 VBUS (USB pin1) ── F1 RXEF110 ── +5V_NODE ─┬─ MCU VIN
 USB 1833 GND  (USB pin5) ─────────────── GND         ├─ SW VIN
                                                     ├─ RLOAD 43Ω/2W ─ GND
                                                     ├─ CIN 100µF/16V ─ GND
                                                     └─ CBYP-A 100nF ─ GND
 SW VOUT ── +5V_RADAR ── RAD VIN
                 ├─ COUT 10µF/16V ─ GND
                 └─ CBYP-B 100nF ─ GND
 MCU 3.3V ── mic L/R 3V、SE VIN、TMP VIN、mic R SEL
 MCU GND  ── 全モジュールGND、mic L SEL、SW GND
```

USBのD+/D−/IDは未接続。F1は**5V側**に置くPPTC（20°C hold 1.1A）で、PoEの約48V側には使わない。過電流時に瞬時・完全遮断する素子ではない。実温度でのderatingと電圧降下を確認する。全5V線をAWG22とし、枝電流の初回受入上限は0.6A。短絡時は給電を抜き、原因を直して冷却後に再試験する。[S16/S18]

SPLには5V側100mA以上の最小負荷がある。RLOADをF1の後で常時接続し、**4.75V・抵抗+5%でも約105mA**を確保する。5V時は約0.58W、5.25V・抵抗−5%では約0.68W。2W以上の難燃品を、基板/樹脂から10mm以上浮かせ、放熱と指の接触防止を設ける。受入でRLOAD端の実電圧と温度を測る。省電力の製品基板ではこの負荷を不要にするPD設計へ変更する。[S15]

**外部VIN給電中にTeensyのMicroUSBをPCへ接続しない。** VINとVUSBは標準で接続されている。firmware転送時は全Tower給電を外し、ETH ribbonを外してTeensyをsocketから取り出し、**MCU単体**でPC USBへ接続する。これによりUSBから5V枝/最小負荷抵抗へ逆給電しない。書込後はPC USBを抜き、向きを照合してsocket/ribbonへ戻し、最後にTower給電を再開する。通電中の抜差しはしない。VIN/VUSB traceはHW1では切断しない。プログラム転送用USBは付属品の有無を確認し、データ対応Micro-B cableを保守工具に用意する。[S31]

### 3.2 信号ネットリスト — pad印字を使う

数字は**Teensy GPIO番号**。基板を一端から数えた物理pin番号ではない。全信号は3.3V、5V耐性はない。[S06]

| Net | 接続元 → 接続先 | 配線条件 |
| --- | --- | --- |
| S01 BCLK | MCU **21** → MIC-L/R **BCLK** | 同じclock、≤100mm |
| S02 LRCLK | MCU **20** → MIC-L/R **LRCL** | mic基板印字LRCL、≤100mm |
| S03 I2S DATA | MIC-L/R **DOUT** → MCU **8**（IN1） | 同じdata線。左右SELを必ず分ける |
| 左channel | MIC-L **SEL** → GND | 0固定 |
| 右channel | MIC-R **SEL** → MCU 3.3V | 1固定 |
| S04 I2C SDA | MCU **18** → SE **SDA**、TMP **SDA** | 100kHzから、≤100mm |
| S05 I2C SCL | MCU **19** → SE **SCL**、TMP **SCL** | breakout上のpullup使用、5Vへpullupしない |
| S06 radar enable | MCU **3** → SW **ON**、100kΩ→GND | SWのslideは**OFF固定**。Highで給電 |
| S07 presence | RAD **IO2** → MCU **4**、100kΩ→GND | 入力モード、内部pullupなし |
| status | MCU内蔵LED **13** | 前面から見える位置。firmware状態表示 |
| NC | MCU 23/MCLK、RAD TX/RX/IO1、TMP ALERT | 未使用padは絶縁。MCLKはmicに不要 |

micはSPH0645LM4Hを指定。**2枚のDOUTを共通化できるのはSELを左右に分けるため**。マイク底面の集音孔を塞がない。初期audio profileは44.1kHz、左右各32bit slot（BCLK=2.8224MHz）。PJRC Audio入力のデータ整形・符号/bit alignmentと実clockを試験する。48kHz化、4 Towerの共通clock、8chビームフォーミングは追加firmware/同期回路の課題であり、同一Towerの左右I2S同期で代替しない。[S07]

TMPはdefault 0x18、SEは受領時にI2C address/device IDを読戻す（ATECC608の通常address 0x60は実個体で照合）。SEの鍵生成・write/lockは実施しない。breakoutのpullupを並列にした合成抵抗とrise timeを測り、100kHzで成立しない場合は配線短縮/抵抗調整の改版を先に行う。3.3V外部負荷は50mA以下を設計予算とし、Teensyの外部供給上限250mAと区別する。[S04/S09/S10]

RADは**在室の有無をIO2で読む**。IO2はfall modeで有効な3.3V出力。工場mode/起動待ち/High-Lowの意味を実物で確認し、期待通りでなければレーダー入力をBLOCKEDにする。TX/RXの電気定格・mode設定手順が確定するまでUARTを配線しない。位置・速度・心拍・転倒判定の製品機能には使わない。[S08]

SWはslide OFFで、ON=Low/未接続ならOFF、ON=HighならON。resetでpin3が入力へ戻っても100kΩでOFFを維持する設計。firmware watchdogとlease喪失時もpin3をLowへ戻す。**SWは安全用の非常遮断器ではない**。初回はT1だけレーダーを有効化し、T2〜4はOFF。電源ON/OFFを1ms TDMと呼ばず、4台同時送信の干渉は別受入にする。[S17]

## 4. Hubの接続と電源容量

| 系統 | From → To | 固定する設定 |
| --- | --- | --- |
| T1 | PSE **17** → T1 FLEX **1** | 802.3bt、60W給電枠、1GbE |
| T2 | PSE **18** → T2 FLEX **1** | 同上 |
| T3 | PSE **19** → T3 FLEX **1** | 同上 |
| T4 | PSE **20** → T4 FLEX **1** | 同上 |
| 集約 | PSE **25** → SFP module → Cat6A 2m → HUB **J17** | **10Gbps**交渉。1Gbpsへfallbackしたら4本stream開始不可 |
| 保存 | SSD → HUB **J1** | M-key / 2280。初回はeMMC bootを保持し、data領域の準備を別作業にする |
| 表示 | HUB **J18 DP** → DP2HD4K60S → HDMM2M → PJ **HDMI1** | 初期1920×1080/60Hz、EDID読戻し |
| Hub給電 | Developer Kit同梱USB-C PD PSU → **J24** | DC jackの上のUSB-C。J40/40pinへ誤配線しない |
| switch給電 | 同梱AC cord → PSE背面AC IN | 接地を保持。USP-RPS端子はNC |
| projector給電 | 同梱AC cord → PJ AC IN | 使用地に適合する完成品電源系統 |

PSEの1〜16はat側なのでTower upstreamには使わない。Flexは**bt/60W入力時の下流46W枠**で選定。CAMはメーカー仕様の802.3af Class 3で15.4W枠、SPLも15.4W枠として30.8W≤46W。各枝もFlexの1port最大25W以内。上流4×60=240W≤PSE総PoE枠400W。PSE/Flexが実際にこの給電modeで交渉したかは管理画面と実負荷で読戻す。静的計算だけではmulti-PDの起動・突入・瞬断を受入れない。[S11–S13]

制御5V枝は0.6A以下（3W以下）を受入上限とする。外部3.3Vは50mA、radarは最大100mA、最小負荷抵抗は約116mA@5Vを含める。CAMの消費、Flex自己消費、各変換/配線損は別。**240Wは給電予約上限、400WはPSE容量であり、実消費電力ではない。** AC入力はPSE・Jetson・projectorを個別に測って合計する。旧73W小計や120W adapterをこの構成の電源選定へ転用しない。ACをDIY分岐/裸配線せず、各付属PSU/cordと定格に余裕のある設置場所の電源を使う。

JetsonはDisplayPortが表示出口。USB-CにDP Alt Modeを期待しない。DP2HD4K60Sはactive変換器、HDMM2Mは今回1080p60で使用する。部品の一部が4K60でも、HDMM2Mの4K上限や実EDIDを飛ばして4K60/120対応と表示しない。TK710STi単体の1080p120/240対応も、この変換系の120Hz保証にはならない。[S19/S22–S24]

## 5. 配置・機構のHW1組立条件

HW1は市販モジュールを積むため、**最終目標のØ150 head・Ø260×25 base・小型Hubに入るとは扱わない**。初回は下記の開放した取付治具でハーネスを作り、実寸を確かめた後にカバーを製作する。これならコネクターへアクセスした状態で電気試験できる。閉箱や建築埋込の加工図は次の版である。

| 部位 | HW1で確保する寸法・製作仕様 | 置き方 |
| --- | --- | --- |
| head用取付面 | 180×220mm、厚3mmアルミ板、縁を面取り。奥行180mmを作業包絡に確保 | cameraは上部、左右micは中心間60mm、radarは前面下部。部品固定穴はメーカー図/現物を転写 |
| head位置 | 底面z=780、上面z=1000mm | 2か所以上のクランプで柱に固定。cameraのyaw/tiltは手動、締結後固定 |
| 柱 | 外径60mm、肉厚3mmアルミ管。露出部710mm | クランプの差込み/固定長を加えて現物に合わせて切断。荷重をcableで支えない |
| base包絡 | Ø320×70mm、底鋼板Ø320×6mm | plate単体概算3.79kg（穴加工前）。初回は剛性のある治具/床へ固定 |
| base固定 | floor固定用Ø7穴×4、中心からR140mm、90°間隔 | 固定先の強度・アンカー適合は設置時確認。未固定の自立運用は未受入 |
| base内 | Flex 122.5×107.1×28mm、中央柱と干渉しない位置 | 純正mount使用、portsへアクセス。内部ケーブル余長を無理なく収納 |
| Hub取付面 | 600×400mm以上、開放架台 | switch 442.4×285.4×43.7mm、JetsonとPSUを別固定。吸排気側に100mm以上の空間を仮確保し実測 |

cameraは純正mount/既設取付部を使い、ねじ長を実ねじ深さで照合する。カメラ筐体へ穴を開けない。headの基板は絶縁スペーサーで保持し、低圧分配用Perma-ProtoとTeensy、mic、SE/TMPを別々に配置する。mic/signalハーネスは100mm以内、SWとradar間も100mm以内。電源線は短くし、I2Sのclock線はGNDと対にして引き回す。

**光学・RF窓を仮の黒板/金属板で覆わない。** cameraのレンズ・IR出射部、radar正面、mic孔を開放し、IRはdefault OFFを読戻して初期試験する。透明材の赤外透過率、radomeの61GHz特性、表面温度は未測定。選定済みcameraの内蔵940nm emitterを使う設計で、外付け850nm・放射3Wの自作光源はHW1に追加しない。

projectorは付属脚で固定した台に置く。TK710STiのthrow ratio 0.69〜0.83から、幅2mの像なら**レンズから壁まで1.38〜1.66m**を初期配置値とする。遮光/視線/机や人の影を現地確認し、台形補正OFFで矩形に置く。これは超短焦点0.25の元目標とは異なる。表示停止のHDMI blackと、発光停止/人への露光停止は別に検証する。[S22]

## 6. 通信profileと共通OSへの接続

初期profileは各Towerの左右mono **640×400・60fps・8bit**、RGB H.264 **720p30・上限8Mbps**、audio **2ch・44.1kHz・32bit slot**、IMU/control用2Mbps枠。メーカーの最大値を全stream同時性能とはしない。実DepthAI pipeline・Teensy firmware・Hub adapterを実装し、timestamp、clock、format、dropを読戻す。

- 左右mono: 2×640×400×60×8 = **245.76Mbps/Node**。
- audio: 2×44100×32 = **2.8224Mbps/Node**。
- RGB/control込みpayload予算: **258.5824Mbps/Node、4本1.0343296Gbps**。overhead前から集約1GbEを超えるため10GbE。
- 同解像度120fpsへ上げた場合は **504.3424Mbps/Node、4本2.0173696Gbps**。この算術は120Hz同期・処理遅延・drop率の合格ではない。

専用sensor LANは他のLAN/VPNと衝突しなければ10.77.0.0/24を使用。Hub=.1、PSE=.2、Flex=.11〜14、CAM=.21〜24、MCU=.31〜34を予約する。CAMの初期DHCPを見落とさず、Hub側の隔離DHCPサービスで実MACに予約を作る。実MAC/serial/秘密鍵はGitへ入れない。UniFi NetworkでPSE/Flexを本人のlocal管理へ採用し、未使用portを無効化する。これらの初期設定は今回未実施。

sensor LANを家庭/Internetへbridgeせず、HubのIP forwardingはOFF。cloudを使う時は別の承認済みWAN interfaceを追加し、予算/本人権限を共通OSで強制する。追加指示により[20章](20-connectivity.md)でUSB31000Sの専用有線WAN portを選定した。LTE/SIM、Wi-Fi AP、衛星の既存要求と未選定部品も20章へ接続する。offlineの基本動作設計と、cloud機能利用可能を分ける。

**SEを載せただけではOAKの映像endpointを認証できない。** CAMとTeensyは別Ethernet機器であり、camera経路にSE署名が付くわけではない。HW1は物理的に隔離した実験LANまで。Hub adapterはdevice/board/firmware、room calibration revision、capture timestamp、lease、信頼状態を付けてSpatialFrameへ変換する。未ペアリング、clock不明、校正違い、lease切れ、再接続後の旧frameは操作候補に使わない。

仕事変更は既存WorkJob/owner/expected revision/確認/保存/event読戻しを通す。視線・音声・在室だけで実行権限を生成しない。saveの正本、Receipt、予算予約、復旧は14章と既存systemへ委譲する。Hub交換時は再認証・校正照合、Tower交換/移動時は再校正。raw映像/音声の永続保存はdefault OFF。

## 7. 組立順と初回通電

以下は**今後実行する手順**。通電試験を今回実施した記録ではない。

1. **受領照合**: BOM、board revision、CAM IMX378、MCU Ethernet版、付属品、DC/AC銘板を記録。異なる品は勝手にpin対応を推定せず、BOM改版で解決する。
2. **無通電で配線**: 全PoE/USB/ACを外す。ETHキットをメーカー手順で組む。PROTO上の5V/3.3V/GND配線、F1、RLOAD、capacitor極性を確認。端子間netlistと導通、隣接pad短絡を照合。MCU/RAD/CAMは初め切り離す。
3. **電源枝単体**: FLEX port1へbt給電、port3からSPLへ。RLOADだけ接続した5V出力が持続するか、F1後で4.75〜5.25Vを測る。SW slide OFF、ON pulldownでVOUTがOFFか確認。RLOAD過熱/異臭/電圧異常なら給電を抜く。
4. **MCUと3.3V負荷**: 給電を外してMCU/mic/SE/TMPを接続。試験firmwareの転送は上記のMCU単体手順を使い、PC USBを外してからsocketへ戻す。再給電して3.3V、電流、I2C ID、status LED、温度、100Mbps linkを確認。SEへの鍵書込/lockはしない。
5. **mic/RAD単体**: oscilloscope/logic analyzerでBCLK/LRCLK/DOUT、左右channel分離、sample dropを確認。RADはT1だけ接続しIO2を実測後に入力として使う。reset、lease喪失、watchdogでON/VOUTが落ちるか測る。未実装firmwareのまま電源Highへ固定しない。
6. **CAM単体**: 給電を外してFLEX2→M12を接続。メーカーtoolで個体認識、左右/RGB/IMU、IR OFF、実fps/formatを確認。初回は可視光で校正板を撮る。M8はcapを維持する。
7. **Hubと表示**: J17の10Gbps、各Tの1Gbps/100Mbps、J1 SSD認識、J18→HDMI1のEDID/1080p60を確認。PSU/冷却/SSD温度を観測。初期BSP/driver版を記録してからadapterの版を固定する。
8. **T1→T2→T4へ増設**: 各端末を別IDでペアリングし、同時stream、PoE再起動、ネットワーク切断、最悪負荷60分、各部温度を測る。1本の成功を4本の成功へ転用しない。
9. **同一仕事一周**: 16章A01〜12に従い、入力→確認→保存→読戻し→停止→再起動を受入れる。光学O01〜04、電池/携帯、閉箱は別試験として残す。

初回作業工具: 絶縁したはんだ工具、導通/電圧計、電流測定器、logic analyzer/oscilloscope、LAN/PoE管理表示、温度計、保守用USBデータcable。商用AC内部の加工はない。センサーを即時無給電にするには該当Tower upstreamを抜くかPSE portをOFFにする。camera port2だけを切ってもmic/RADは止まらない。センサー停止とWorkJob取消はそれぞれ確認する。

## 8. 製品目標との差と合格条件

| 項目 | HW1で選定した実物・設定 | 残る条件 |
| --- | --- | --- |
| GS / RGB | OAK内蔵GS stereo / IMX378、初期mono60fps | 元1920×1280/120・RGB魚眼160〜180°を未達。coverage再測定 |
| IR | 内蔵940nm、初期OFF | 元850nm/放射3Wとは違う。外部driver/露光安全未受入 |
| 同期 | Tower内mic左右共通I2S、camera free-running | 4 Tower HW同期、PTP≤10µs、8ch位相、120Hz未受入 |
| radar | SEN0623、IO2在室、初回1台だけON | 3Tx/4Rx、外部trigger、1ms TDM、多台干渉を未達 |
| Hub | AGX Orin 64GB Dev Kit＋別PoE switch、1TB | Orin NX小型carrierの量産機構とは異なる。熱/騒音/消費は要測定 |
| 表示 | TK710STi、DP→HDMI、1080p60壁1面 | 4K120、≤10ms、空中像、上下全域、低眩しさを未受入 |
| 機構 | 1m高さ、head/baseを拡張した固定治具 | Ø150/Ø260、3.5〜4kg、閉箱、携帯単体C-01未解決 |
| OS / 認証 | 共通OSにadapterを足す設計、SE搭載 | driver/pipeline/firmware/Broker接続・全endpoint認証未受入 |

| 受入ID | 合格証拠 | 現在 |
| --- | --- | --- |
| HW-A01 | 現物一致、全ネット導通/短絡、極性、固定・ケーブル保持 | NOT_RUN |
| HW-A02 | 無負荷対策、5V/3.3V、0.6A枝上限、PoE mode、起動/瞬断 | NOT_RUN |
| HW-A03 | 4 CAM映像/IMU、8 mic channel、1 radar IO2、温度/SE ID | NOT_RUN |
| HW-A04 | 10GbE集約、実stream rate/drop、clock差、60分の最悪温度 | NOT_RUN |
| HW-A05 | firmware watchdog/lease、sensor給電遮断、再接続旧frame拒否 | BLOCKED_FIRMWARE |
| HW-A06 | 共通OS同一job/owner/revision、保存/停止/再起動 | BLOCKED_ADAPTER |
| HW-A07 | EDID/表示/実遅延/遮光/発光停止/配置、O01〜04 | NOT_RUN |
| HW-A08 | 閉箱/転倒/騒音/耐久/地域適合、携帯C-01、表示C-02 | NOT_RUN |

ROCKは設計・adapter/firmware・記録、EXTERNALは部品/driver情報、JOINTは同一実機の組立/計測、OWNERは実施対象・設置/予算・購入条件を担当。部品発注・端末書込・SE provisioning・外部問い合わせは今回行っていない。次は**HW-A01の受領/導通確認と、HW-A05の試験firmware**。予算や部品未所持を推測して購入しない。

## 9. 一次資料（2026-11-02照合）

- S01: [Luxonis OAK-D Pro W PoE](https://docs.luxonis.com/hardware/products/OAK-D%20Pro%20W%20PoE)
- S02: [Luxonis product / IMX378 variant A00574](https://shop.luxonis.com/products/oak-d-pro-w-poe)
- S03: [Luxonis M12 to RJ45 cable / select 2m](https://shop.luxonis.com/products/ethernet-cable-m12-rj45-3m-cable)
- S04: [PJRC Teensy 4.1](https://www.pjrc.com/store/teensy41.html)
- S05: [PJRC Ethernet Kit](https://www.pjrc.com/store/ethernet_kit.html)
- S06: [PJRC Teensy 4.1 pin card](https://www.pjrc.com/teensy/card11a_rev4_web.pdf)
- S07: [Adafruit SPH0645LM4H microphone pinout](https://learn.adafruit.com/adafruit-i2s-mems-microphone-breakout/pinouts)
- S08: [DFRobot SEN0623 C1001 pinout](https://wiki.dfrobot.com/sen0623)
- S09: [Adafruit ATECC608 pinout](https://learn.adafruit.com/adafruit-atecc608-breakout/pinouts)
- S10: [Adafruit MCP9808 pinout](https://learn.adafruit.com/adafruit-mcp9808-precision-i2c-temperature-sensor-guide/pinouts)
- S11: [Ubiquiti USW-Flex](https://techspecs.ui.com/unifi/switching/usw-flex)
- S12: [Ubiquiti USW-Pro-24-PoE QSG](https://dl.ui.com/qsg/USW-Pro-24-POE/USW-Pro-24-POE_EN.html)
- S13: [Ubiquiti PoE budget](https://dl.ui.com/ds/usw_pro_poe_ds.pdf)
- S14: [Ubiquiti UACC-CM-RJ45-MG](https://techspecs.ui.com/unifi/accessories/uacc-cm-rj45-mg)
- S15: [Adafruit 3785 PoE splitter](https://www.adafruit.com/product/3785)
- S16: [Adafruit 1833 Micro-B breakout](https://www.adafruit.com/product/1833)
- S17: [Pololu 2810 power switch](https://www.pololu.com/product/2810)
- S18: [Littelfuse RXEF datasheet](https://www.littelfuse.com/assetdocs/littelfuse_ptc_radial_leaded_rxef_datasheet?assetguid=e9a7b6b3-79ce-478c-a39a-0a70ee48ccec)
- S19: [NVIDIA AGX Orin developer kit connector layout](https://docs.nvidia.com/jetson/agx-orin-devkit/user-guide/latest/hardware_layout.html)
- S20: [NVIDIA AGX Orin developer kit quick start](https://docs.nvidia.com/jetson/agx-orin-devkit/user-guide/latest/quick_start.html)
- S21: [Samsung 980 PRO datasheet](https://download.semiconductor.samsung.com/resources/data-sheet/Samsung-NVMe-SSD-980-PRO-Data-Sheet_Rev.2.1_230509_10129505081019.pdf)
- S22: [BenQ TK710STi specifications](https://www.benq.eu/en-uk/projector/gaming/tk710sti/spec.html)
- S23: [StarTech DP2HD4K60S](https://media.startech.com/cms/pdfs/dp2hd4k60s_datasheet.pdf)
- S24: [StarTech HDMM2M](https://media.startech.com/cms/pdfs/hdmm2m_datasheet.pdf)
- S25: [StarTech 10m Cat6A PoE++ cable](https://media.startech.com/cms/pdfs/nlbl-10m-cat6a-patch_datasheet.pdf)
- S26: [StarTech 2m Cat6A cable](https://media.startech.com/cms/pdfs/nlbl-2m-cat6a-patch_datasheet.pdf)
- S27: [Adafruit Perma-Proto half size](https://www.adafruit.com/product/1609)
- S28: [Adafruit microphone 3421](https://www.adafruit.com/product/3421)
- S29: [Adafruit secure element 4314](https://www.adafruit.com/product/4314)
- S30: [Adafruit temperature sensor 1782](https://www.adafruit.com/product/1782)
- S31: [PJRC Teensy power / backside pin card](https://www.pjrc.com/teensy/card11b_rev4_web.pdf)
- S32: [Luxonis mechanical envelopes](https://github.com/luxonis/luxonis-isaac-sim/blob/main/README.md)
