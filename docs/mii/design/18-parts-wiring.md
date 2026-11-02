# 18 型番・端子・組立配線

V1.2 / 配線版 W1 / 2026-11-02。本人指示「OSの中身は共通のまま、使う部品の型番と端子を具体化して、実機を組むための配線図まで」による。[14章](14-common-os.md)の共通OSを保持し、市販完成品を接続する卓上試作を定義する。**部品選定・配線設計まで完了、組立・通電・実声/実指先試験は未実施。** 製品TowerのPCBや光学回路を製造releaseしたものではない。

## 1. 今回組むもの

| 構成 | 目的 | 今回の到達点 |
| --- | --- | --- |
| P0a 手持ちMacのみ | 内蔵camera/mic/displayで操作環境を確認 | 新規部品なし。実browserの権限・モデル資産・日本語音声能力は要確認 |
| P0b 外付け入力 | Mac＋BRIO 500、映像と音声をUSB-C一本で接続 | 型番、端子、ケーブル、手順を選定。所持確認はMacのみ |
| P1a センサーノード1台 | Pi 5＋GS cameraを単体起動し、MacとLAN接続 | 部品と組立配線を選定。ネットワークcamera adapterは未実装/未受入 |
| P1b以降 | 同型2台の同期/校正、4台拡張、製品光学 | 15章のP1/P2/P3を維持。P1aの1台接続では合格しない |

**Macは開発host。** 本人提示画像から14インチMacBook Pro（2024年11月）、Apple M4、16GB、macOS Sequoia 15.7.4を確認した。serial/画像自体は保存しない。ベースM4はThunderbolt 4対応USB-C×3、HDMI、MagSafe 3を持つ[S01]。筐体のUSB-Cへ剥がせるラベルU1（camera）、U2（LAN）を付ける。U1/U2は今回の配線識別子で、Appleのport番号ではない。

macOSを置き換えず既存client/browserから共通のWorkJob・owner・revision・権限・予算・保存へ接続する。Pi側のRaspberry Pi OSはセンサー取り込み用。別の仕事台帳や別版のRockstarOSを作らない。M4/16GBだけでローカルLLM能力やnative RockstarOS受入を宣言しない。

## 2. 選定BOM（数量はP0b＋P1a各1式）

価格・在庫・購入/提供は未確定。SKUを一次資料で確認できない品は、**公式の製品名＋容量/長さ/地域variant**を注文照合キーにし、推測した番号を付けない。現品のラベルとboard revisionは受領票に追記する。

| ID | メーカー・型番/注文照合キー | 数 | 接続・付属品・選定理由 | 根拠 |
| --- | --- | ---: | --- | --- |
| H01 | Apple MacBook Pro 14-inch / M4 / 16GB / November 2024 | 既存1 | USB-C、内蔵display/mic/camera。ACアダプターの定格は画像から確認できない | S01、本人画像 |
| C01 | Logitech BRIO 500 Graphite、US MPN **960-001493** | 1 | 固定USB-C cable 1.5m、mic内蔵、clip同梱。1080p30/720p60対応は機材上限 | S02/S03 |
| N01 | Raspberry Pi **5 4GB** | 1 | Gigabit RJ45、CAM/DISP1、USB-C電源、microSD、FANを使用 | S04 |
| C02 | Raspberry Pi Global Shutter Camera **SC0715** / Sony IMX296 | 1 | 15pin CSI、C/CS mount、IR-cut付き。可視光試作、最大1456×1088/60fps | S05/S06 |
| L01 | Raspberry Pi公式 **6mm wide-angle CS-mount lens** | 1 | GS cameraへCSで直付け。6mm/F1.2の公式variant。16mm C-mount品と取り違えない | S06/S07 |
| F01 | Raspberry Pi **Camera Cable Standard - Mini, 200mm** | 1 | camera側15pin/1mm、Pi 5側22pin/0.5mm。Display Cableではない | S08/S09 |
| P01 | Raspberry Pi **27W USB-C Power Supply, US plug** | 1 | Pi向け5.1V/5A、固定USB-C cable。使用地のコンセントに合うvariantを受領時照合 | S10 |
| T01 | Raspberry Pi **Active Cooler for Pi 5** | 1 | 専用FAN 4pin cable、thermal pad、固定部材を使用 | S11 |
| S01 | Raspberry Pi **SD Card 64GB A2、blank版（初期書込用）** | 1 | microSD slotへ。Macで公式Imagerから64-bit版を準備。image版/hashを記録 | S12 |
| R01 | StarTech **SDMSDRWU3AC** USB-C/USB-A card reader | 1 | microSD slotを使用。初期設定時だけMacの空きUSB-Cへ直結 | S17 |
| E01 | Belkin **F2CU040btBLK** USB-C to Gigabit Ethernet Adapter | 1 | USB-C male→RJ45 female、10/100/1000BASE-T。macOS上の実認識は受入対象 | S13 |
| E02 | StarTech **N6PATC2MBK** | 1 | 2m Cat6、RJ45 male同士の完成patch cable。今回はdataのみ | S14 |
| M01 | Manfrotto **MTPIXI-B** PIXI mini tripod | 1 | cameraの1/4-20固定部に使用。FFCを荷重支持に使わない | S05/S15 |
| D01 | StarTech **HDMM2M**、2m HDMI male同士 | 条件付き1 | 手持ちprojectorがHDMI Type-A入力なら採用。P0/P1aでは不要 | S16 |

Piは非導電性の安定した作業台/支持具へ置き、基板下面を金属から離し、冷却口を塞がない。GS cameraはM01へ固定する。携帯/移動時に使う筐体や保持機構の設計ではない。P0bのclipはMacの画面を開いた状態で装着し、取り付けたまま蓋を閉じない。

BRIOは外付けmicも兼ねるため、別のUSB micを追加しない。Mac内蔵入力との選択違いに注意する。L01は室内全域用レンズの確定ではなく、近距離の手・校正板の試作用。GS cameraのIR filterは除去しない。新たなIR照明、radar、電池pack、PoEはこのBOMに含めない。

## 3. P0b 配線図

```text
 [C01 BRIO 500 / 960-001493]
      camera + mic
           │ W01 固定USB-C 1.5m / data + bus power
           ▼
 [H01 MacBook Pro M4] U1: USB-C / Thunderbolt 4
      ├─ 内蔵画面・keyboard → 確認 / 保存 / 停止
      ├─ 内蔵battery（最初の動作確認）
      ├─ MagSafe 3 ← 手持ちの適合充電器（銘板確認後）
      └─ HDMI ── W08 / HDMM2M ── projector HDMI IN
                  条件付き・型番未確認・初回は接続しない
```

W01はcamera内蔵cableなので別売USB-C cable/Hub/変換器は不要。USB-Cの内部pinを手配線しない。cameraの物理shutterを閉じてもmicを停止した証拠にはならない。入力停止はcamera track停止・音声認識停止・OS/browser権限と使用中表示で確認し、必要時はW01を抜く。USBを抜くこととWorkJobの停止/取消は別操作。

**現在sourceの実際:** `CameraSession`は640×480・15fps ideal、最大30fps、videoのみを要求する。BRIOの720p60対応を現アプリの60fps受入にしない。`deviceId`の専用選択UIはなく、browserで使用cameraを選び、実入力を確認する。指定機材を選べなければBLOCKEDとしてdevice選択adapterを先に実装する。音声側もcamera trackとは別で、OS/browser側の入力micを読戻す。

`lib/mii-local-speech.ts`は`ja-JP`の端末内音声認識とinstalled packを要求する。Macにmicがあることだけでは成立しない。利用不可ならtext入力を使い、A01音声はBLOCKED。cloud ASRへ無断で切り替えない。手追跡の固定model資産・camera権限も必要。P0aの内蔵cameraが選ばれた試験とP0bは別attemptにする。

## 4. P1a 配線図（センサーノード1台）

```text
 Mac U2 USB-C ─W02─ [E01 Belkin F2CU040btBLK]
                              RJ45
                                │ W03 / E02 Cat6 2m / dataのみ
                                ▼
 [P01 27W公式電源] ─W04─ USB-C [N01 Pi 5 4GB] RJ45
  AC plug US / 適合コンセント        │    │    │
  5.1V/5A指定rail                   │    │    └ microSD ← S01 64GB
                       CAM/DISP1   │    └ FAN 4pin ←W06─ T01 Active Cooler
                         22pin     │
                           ║ W05 / F01 Camera Standard-Mini 200mm
                         15pin     │
                     [C02 SC0715]   └ GPIO / PCIe / CAM/DISP0: 未接続
                         ├ L01 6mm CS lens
                         └ M01 tripod / 1/4-20
                     XTR / XVS / MAS / test pads: 未接続
```

記号は接続関係で、基板上の位置・大きさ・表裏を表さない。現物の**CAM/DISP1**印字を確認する。PiのUSB-CはP01からの電源入力専用として使い、MacからPiへUSB-Cを追加接続しない。W03はネットワークdataのみ。Pi用PoE HATもPSEも使わない。各機器の内部信号pinへのはんだ付けは不要。

| Wire ID | from端子 → to端子 | cable/信号 | 向き・禁止事項 |
| --- | --- | --- | --- |
| W01 | C01固定cable → H01 U1 USB-C receptacle | 1.5m USB-C、video/audio/bus power | 完成品を直結、splitterなし |
| W02 | E01固定USB-C plug → H01 U2 USB-C receptacle | USB data＋adapter bus power | U1と異なる空きUSB-C。Mac↔Piの給電線ではない |
| W03 | E01 RJ45 → N01 RJ45 | E02、8接点完成Cat6 patch 2m | 1000BASE-T交渉を確認、PoEなし、自作結線なし |
| W04 | P01固定USB-C plug → N01 USB-C POWER | 5.1V/5A rail、純正cable | Piに必要な5A供給。27Wは商品名、5.1×5=25.5Wが該当rail定格 |
| W05 | C02 camera 15pin → N01 CAM/DISP1 22pin | F01、CSI-2＋制御/給電の公式配線 | **両側無通電で挿抜**。15-15同梱cableはPi 5に使わない |
| W06 | T01 fan plug → N01 FAN 4pin | 同梱key付きcable、5V/PWM/tach | GPIO 40pinに挿さない。key方向を確認し無理に押さない |
| W07 | S01 microSD → N01 microSD slot | storage、電源offで着脱 | 起動媒体は電源投入前に装着 |
| W09 | R01 USB-C plug → H01空きUSB-C、S01 → R01 microSD slot | 初期設定時のみ、USB給電 | USB-A側は同時接続しない。書込検証後ejectしてS01をPiへ移す |
| W08 | H01 HDMI → projector HDMI IN | D01、2m HDMI、条件付き | exact型番・入力・EDID確認後。初期目標1080p60、実交渉を記録 |

### FFCの組立順

1. PiのP01をコンセント/基板から外す。cameraも無通電にする。ESDに配慮して基板の縁を持つ。
2. cameraとPi両側のlock flapを開ける。**金属接点をflapと反対側へ**向け、平行に奥まで入れ、lockを閉じる[S09]。現物の受け接点との一致を確認し、ケーブルの色だけで判断しない。
3. F01の広い15pin端をcamera、狭い22pin端をPiのCAM/DISP1へ接続。connectorを跨いだpin番号の手作業対応は不要。メーカー完成品の接点変換を使う。
4. camera cable接続後、公式手順でActive Coolerのpad/固定ピン/FAN plugを装着する。FFCをcoolerの下で挟まない。
5. L01はCS mountとして取り付ける。C-mount用5mm adapter ringは使わない。公式lens手順に沿ってback focus/iris/focusを調整し、M01へ固定する。
6. microSD、LANを装着して機械的な保持を確認する。最後にP01を接続する。FFCの挿し直しはshutdown・給電除去後に行う。

GS cameraの外部trigger回路はboard revisionに依存する[S06]。今回XTR等は**NC（未接続）**でfree-running撮像のみ。3.3V GPIOを直接つながない。外部triggerの電圧・pulse・GND・必要改造と波形測定はP1b用の別配線版で確定する。free-runningの2台化を同期合格にしない。

## 5. 起動・接続の確認手順

以下は**実行予定手順**であり今回実行した結果ではない。個体serial、raw映像/音声、認証情報はGitへ保存しない。

### P0b

1. C01を取り付けてU1へ接続。macOSのUSB一覧で機種、sound入力でmicを確認。browser側camera/micの選択と権限を確認する。
2. 既存の本人用localhost Lab/認証済み仕事画面でcameraを開始。`MediaStreamTrack.getSettings()`のwidth/height/frameRate、取得した機材ラベル、model/browser版を匿名化して記録する。raw device IDは保存しない。
3. 指先で対象を選び、内容を確認し、既存`edit_plan`のexpected revisionで保存。event読戻しで1回更新を確認する。カメラ入力だけで自動保存/実行しない。
4. 端末内`ja-JP`がavailableの場合のみ実声試験を行う。利用不可はtext試験と分けて記録。入力停止、競合、応答喪失、再起動は16章A01〜04/06/11/12を使う。

### P1a

1. 初期設定の設計: R01をMacの空きUSB-Cへつなぎ、S01をR01のmicroSD slotへ入れる。公式Raspberry Pi ImagerでPi 5、Raspberry Pi OS (64-bit)、対象S01を選び、hostname（例 `mii-node-01`）、本人管理のuser、SSH公開鍵、必要なら本人のWi-Fiを設定する[S18]。書込先容量/名前を照合し、書込とverify後にejectする。これらはカードを消去する後続作業であり今回未実行。image版/hash、Pi board/camera revision、firmware、`rpicam`版を記録する。
2. 初回はImagerで設定した同じWi-FiにMacとPiを接続し、`mii-node-01.local`等の実hostnameへSSHする。Wi-Fi/SSHの利用可否を本人の環境で確認できない場合は初期設定をBLOCKEDにし、別の設定経路を先に確定する。認証した端末から`rpicam-hello --list-cameras`でIMX296を確認。撮像の例は`rpicam-hello --nopreview --timeout 5000`。これが通っても画角/実画像の合格ではない。原音/顔を含めない校正板を使った別の視認試験でフォーカス・露光・dropを確認する。コマンドがなければOS/アプリ導入状態を先に直す。
3. MacのU2 adapterとPiのEthernetは隔離した直結LAN。候補はMac `192.168.77.1/30`、Pi `192.168.77.2/30`、gateway/DNSなし。Wi-Fi/VPN/他LANと重ならないことを確認してから設定する。interface名は現物で特定し、固定の`enX`を推測しない。Internet Sharingは不要。
4. linkが1Gbpsで交渉したこと、相互到達、切断/復帰を確認。認証・権限を持つ専用capture adapterの実装後にだけ映像を共通OSへ接続する。LANをつなぐだけではbrowserの`getUserMedia`へ現れない。
5. 当面の転送評価profileは640×480、30fps、8bit grayscale候補（payload 73.728Mbps）。取得/変換/encoder/transportは未実装・未測定。センサー全画素RAW10/60fpsは約950.477Mbpsでoverhead前から1GbEに近いため、そのまま送る設計にしない。初回はPi上の単体captureで検証し、A08全streamはNOT_RUNのまま保持する。

R01は初期設定用として選定済み、所持は未確認。常用LANを固定するまでは初期Wi-Fi経路で設定し、設定後はLAN経由で再認証・到達確認する。保存したWi-Fi認証情報/秘密鍵をBOMやGitへ入れない。Piの画面/keyboardがあるとは推定しない。

## 6. 受入票と残作業

| ID | 合格に必要な観測 | 現在 |
| --- | --- | --- |
| W-A01 | BOM現物一致、label/board版、FFC向き、短絡/無理な荷重なし | NOT_RUN |
| W-A02 | P0bの指定camera/mic選択・実解像度・停止読戻し | NOT_RUN |
| W-A03 | IMX296列挙、実画像、focus、fan、低電圧/温度、shutdown/再起動 | NOT_RUN |
| W-A04 | E01 macOS認識、1GbE交渉、LAN切断/復帰 | NOT_RUN |
| W-A05 | 認証済みNode adapter→共通OS、時刻/校正/lease付き入力 | BLOCKED_ADAPTER |
| W-A06 | 16章A01〜04/06/11/12の同一job一周 | NOT_RUN |
| W-A07 | projector exact型番→HDMI入力/EDID→表示/停止 | BLOCKED_MODEL |

ROCKはBOM/adapter/共通契約、EXTERNALは部品・driver、JOINTは同一個体での接続・測定、OWNERは所持/試験対象/予算/条件を確定する。接続失敗は配線・給電・列挙・profile・権限・保存のどこで止まったかを分け、原因不明のまま再送や有料代替をしない。

この配線で未解決なのは、端末内日本語ASRの実可用性、Pi初期設定経路とNode adapter、2台同期/3D校正、4台ネットワーク、最終筐体C-01、光学4条件C-02、電池/熱/独立発光停止。購入・OS書込・メーカー連絡・実機通電・公開は実施していない。初回組立はP0b、次にP1a単体capture。P1bの同期仕様とadapterを閉じてから台数を増やす。

機械可読の部品・接続: [wiring/bom.json](wiring/bom.json)。印刷図の再生成: `python3 docs/mii/design/wiring/render-wiring.py --output output/pdf/mii-prototype-wiring.pdf`（reportlab、Arial Unicode相当の日本語fontが必要）。印刷図は本章と同じW1、3ページ。全図は端子間の接続図であり、基板銅箔の回路図ではない。

## 7. 一次資料（2026-11-02照合）

- S01 [Apple / MacBook Pro 14-inch M4 2024 technical specifications](https://support.apple.com/en-la/121552)
- S02 [Logitech / BRIO 500 Graphite](https://www.logitech.com/en-us/shop/p/brio-500-webcam)（公式pageの製品データでMPN/色を照合）
- S03 [Logitech / BRIO 500 setup guide](https://www.logitech.com/assets/66219/3/brio-500.pdf)（USB接続、mount、shutter/mic）
- S04 [Raspberry Pi / Pi 5](https://www.raspberrypi.com/products/raspberry-pi-5/)
- S05 [Raspberry Pi / Global Shutter Camera](https://www.raspberrypi.com/products/raspberry-pi-global-shutter-camera/)、[SC0715製品情報](https://pip.raspberrypi.com/search?page=2&q=Raspberry+Pi+Camera)
- S06 [Raspberry Pi / GS camera hardware and trigger](https://www.raspberrypi.com/documentation/accessories/global-shutter-camera.html)
- S07 [Raspberry Pi / 6mm CS lens guide](https://datasheets.raspberrypi.com/hq-camera/cs-mount-lens-guide.pdf)
- S08 [Raspberry Pi / Camera Cable](https://www.raspberrypi.com/products/camera-cable/)
- S09 [Raspberry Pi / camera installation and software](https://www.raspberrypi.com/documentation/accessories/camera-software.html)
- S10 [Raspberry Pi / 27W USB-C PSU](https://www.raspberrypi.com/products/27w-power-supply/)
- S11 [Raspberry Pi / Active Cooler](https://www.raspberrypi.com/products/active-cooler/)
- S12 [Raspberry Pi / SD Cards](https://www.raspberrypi.com/products/sd-cards/)
- S13 [Belkin / F2CU040btBLK](https://www.belkin.com/p/usb-c-to-gigabit-ethernet-adapter/F2CU040btBLK.html)
- S14 [StarTech / N6PATC2MBK datasheet](https://media.startech.com/cms/pdfs/n6patc2mbk_datasheet.pdf)
- S15 [Manfrotto / MTPIXI-B](https://www.manfrotto.com/global-uk/pixi-mini-tripod-black-mtpixi-b/)
- S16 [StarTech / HDMM2M datasheet](https://media.startech.com/cms/pdfs/hdmm2m_datasheet.pdf)
- S17 [StarTech / SDMSDRWU3AC datasheet](https://media.startech.com/cms/pdfs/sdmsdrwu3ac_datasheet.pdf)
- S18 [Raspberry Pi / Imager and first boot](https://www.raspberrypi.com/documentation/computers/getting-started.html)

資料にない現行macOSでの実動作、交換部品の適合、在庫/納期は未確認。特にF2CU040btBLKの公式直販ページは取得時に在庫なし表示だった。代替品はport/driver/給電条件を照合してBOM版を上げる。互換を推測して部品を置換しない。
