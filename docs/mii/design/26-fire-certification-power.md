# 26. mii F3 — 検定条件・既設互換・分岐給電

2026-11-03 / MAT15・JOINT / 共通OSは[14章](14-common-os.md)のまま。

**設計レビュー用の改版。消防代替用の完成BOM・量産配線図としては未完成。** 住宅・小規模施設・一般ビルの全対象と「新規建物配線・AC100V直結・天井内工事なし」の要望を維持する。[25章](25-retrofit-fire-hardware.md)の消防端子は維持し、F3では給電を見直した。完成miiのOEM head、検定、取付機構、実物件、modemの日本NTN・USB条件は未受入。

## 1. 今回確定した判断

- **消防電源から演算・通信へ給電しない。** 固定消防側の専用電池／適合受信機と、着脱Coreの充電池を独立させる。Coreを外しても法定の感知・現場警報・必要な設備連動を残す。
- **PiのUSBへ全負荷を集めるF2給電を撤回。** F3の机上試作は、完成品電池A1289のC1→Pi、C2→外部給電USB Hubへ分ける。裸セルUPS、12.6V充電器、UPS-I2C線はF3に接続しない。
- **YECN028AAは候補から除外。** 2026-11-03に読んだQuectelの部分回答（受信表示11月2日）で、BG770A認証アンテナリスト外と確認。YCN001AA／YE0011BA／YE0013CA／YECT002AA／YECT003AAが代替提示された。短い**YECT003AA**を照合第一候補にするが、この回答だけでは日本NTNのband・利得・筐体同居条件まで確定しない。Murataへ流用しない。23章を訂正した。
- **LTEとNTNのデータ通信を同時には行わない。** 現選定は一つの共用modem。Wi-Fi＋modem＋GNSS＋消防入力を同時に給電する設計であり、3回線同時送信の完成ではない。Wi-Fi利用時にもmodemの網維持動作は残し、通常の経路変更で電源断/detachしない。3回線同時データ転送を実現するには別modemと再度のRF・給電評価が必要。
- **無配線工事と無資格の交換は別条件。** ビルのhead交換、届出・点検の扱いを一般住宅の電池式警報器と同じにしない。

## 2. F3の電源・端子・購入照合部品

下記は開放した作業台／可搬評価用。製品天井取付には使わない。新品国内正規品、正確な型番・銘板・PSE表示・説明書・回収対象の個体照合を受領時に行う。販売ページの在庫表示を納期保証にしない。

| ID | 選定品・数量 | 使用端子と役割 |
| --- | --- | --- |
| PB | **Anker 737 Power Bank A1289011 / 本体A1289** ×1 | C1＝Pi用、C2＝USB Hub用、USB-A＝未使用。各Cは5V/3A、2C合計最大140W。140Wを5Vで使える電力とは解釈しない。旧製品名PowerCore24K／現説明書名Power Bank(24K,140W)を銘板A1289で照合 [P1] |
| HUB | **Raspberry Pi USB 3 Hub SC1636** ×1 | 外部給電USB-C 5V/3A、直付8cm USB-A upstream、4 USB-A downstream。ケース約57.4×52.4×18mm、量産機構寸法ではない [P2] |
| CP1/CP2 | **StarTech USB2CC50CM** ×2 | 50cm、USB-C male–male、3A。加工／Y分岐なし [P3] |
| CHG | **Anker Nano II 65W A2663115** ×1 | 既存コンセント→USB-C→PB.C1。充電専用。65W以下で使用し、PBの100W以上での約1時間充電を保証しない [P4] |
| CC | PB付属140W USB-C–Cケーブル ×1 | CHGからPBへ。Core稼働用2本と分ける |
| CORE | **Raspberry Pi 4 Model B 4GB SC0194** ×1 | USB-C受電、青USB3下段→HUB。早期基板のUSB-C相性を避け、revision1.2以降を受領確認 |
| MODEM | **LBAD0XX1SC-DMSB-EVK-B / Soracom4573326593342** ×1 | HUB.U1→付属A–Mini-B→**UART0 AT CMD**。UART1・外部電源padsは未接続。原本回答待ち、調達／無線送信HOLD |
| GNSS | **GlobalSat BU-353N5** ×1 | 直付USB-A→HUB.U2 |
| I2/I1 | **Phidgets3060_0 / 1018_3** 各1 | HUB.U3→3017_1→I2.host Mini-B、I2.device A→3017_1→I1.Mini-B。Full Speed、電源/GND/data絶縁 |
| 消防側 | **FSKJ226-M/C＋FSOJ001B-S** | 25章の専用電池・純正線を維持。I1.Digital Inputs0/Gだけ使用。接点の微小負荷条件はF-E01未解決 |

HUBのU1〜U4はメーカー端子番号ではなく、現物に貼る設計管理ラベル。4口の任意の一口ずつを固定して記録する。U4は空ける。Piの残るUSB口、PBのUSB-Aには負荷を追加しない。Piの純正fanはJ8物理4＝赤5V、6＝黒GND、8＝青制御を維持。SDと無線アンテナ・SIMは22/23章の条件付き選定を継承する。

**充電中の無停止動作は仕様に含めない。** 稼働時はC1/C2を出力に使うためC1から同時充電できない。共通OSの保存・停止→Coreを外す→CP1/CP2を抜く→CHG＋CCをPB.C1に挿す。充電後はCHGを抜いて再接続する。A1289に充電しながらC2/Aを使う機能があっても、この配線のUPS受入には代えない。USB切替瞬断の耐性を実機で試す。

## 3. F3電力図とネットリスト

```text
【固定消防側：専用電池／適合既設回線だけで動作】
FSKJ226-M ≈≈ FSKJ226-C ≈≈ FSOJ001B-S
                                  │純正火災移報ケーブルA/B
                                  └─ 1018_3 DI0/G ─ Mini-B
                                                       │3017_1
                                                 3060_0 USB-A
                                             [電源/GND/data絶縁]
                                                 3060_0 Mini-B
                                                       │3017_1
【可搬Core：固定消防から受電しない】                    HUB.U3
A1289.C1 ─ USB2CC50CM ─ Pi4 USB-C                      HUB.U2 ─ BU-353N5
                           青USB3下段 ─ HUB直付upstream HUB.U1 ─ UART0 Mini-B EVK
A1289.C2 ─ USB2CC50CM ─ HUB USB-C POWER                 HUB.U4 ─ NC
              同じPB、独立出力口                         ↑外部給電
```

| Net | 接続元 → 接続先 | 条件 |
| --- | --- | --- |
| P01 | PB.C1 → CP1 → CORE.USB-C | 5V、設計上限2.50A（fan／Wi-Fiを含む） |
| P02 | PB.C2 → CP2 → HUB.USB-C POWER | 5V、設計上限1.50A（hub自消費を含む） |
| D01 | HUB.captive USB-A → CORE.青USB3下段 | 市販ハブの標準upstream。給電専用Y線やGPIO5Vはなし |
| D02 | HUB.U1 → EVK付属A–Mini-B → MODEM.UART0 | modem1.00Aは電源設計枠。USB2許容電流ではない |
| D03 | GNSS.USB-A → HUB.U2 | 0.10A設計枠 |
| F07-F3 | HUB.U3 → 3017_1 → I2.host Mini-B | F2のPi直結F07を置換。他のF01〜F06は25章と同じ |
| C01 | CHG.USB-C → CC → PB.C1 | 停止・切離し後の充電だけ。P01/P02と同時接続しない |

**設計電力枠は20.0W**＝5V×(Pi系2.50A＋Hub系1.50A)。従来のPi1.50A＋fan0.18Aという概算に対し、Pi系を2.50Aへ広げた。Hub系はmodem1.00＋GNSS0.10＋消防I/O0.10＋hub自消費0.30＝1.50A。全数値は試験時の上限枠であって、機器の実測最大値ではない。

各Cの3Aとの設計余裕はPi系0.50A、Hub系1.50A。F2のPi USB合計1.20A上限へ直結する構成を解消する。PBの2C同時5V供給、hub自己給電時のupstream電流／逆流、過渡負荷、ケーブル降下、停止順序は現物で検証する。**容量計算だけでF-E02をCLOSEDにしない。** HUB総量3AはUSB2 deviceへの1A許可ではなく、R04の列挙前／連続／突入／descriptor確認は継続する。外部5V padsやQuectel J0201へ推測で給電しない。

20Wを24時間連続で使うと負荷側だけで480Wh/日を要する。24000mAhを5Vの24000mAhと換算せず、取り出せるWhと劣化・温度・待機を測って持続時間を決める。消防用電池の6年／10年とCoreの稼働時間は別。

PBは約632g・156×55×49mm、メーカー動作範囲0〜35℃。**このPBは完成消防製品用の内蔵電池ではない。** 既存感知器用baseに吊らない、ケースを開かない、密閉積層しない。現P3包絡・最終miiのサイズ／荷重条件を合格扱いにしない。完成品には消防の温度・機械条件も満たす電池assemblyとOEM取付構造を別途確定する。

## 4. 検定に提出する条件を条項へ落とす

e-Gov原文を2026-11-03に読み、住宅向けは**光電式2種**を申請設計の前提とする。以下は主要条項の審査用抜粋で全適用条項の代替ではない。熱式を採る場合は別の感度試験が必要。実施はOEM／試験機関が校正設備を用いて行う。

| 対象・原本 | 数値／条件 | mii完成形の試験・提出物 |
| --- | --- | --- |
| 住宅 第3条10号 [L1] | 警報部前方1mで70dB以上（より高い公称値ならその値）、1分以上。電池は動作下限電圧 | Core装着／離脱、最大fan・音声中でも現場警報を阻害しない。miiの音声だけで代替しない |
| 住宅 第3条11・15号 [L1] | 電池下限と自動試験異常の通知を72時間以上。自動試験は原則60秒以内（試験中も感知できる場合の例外あり） | 固定側で実現。H4の単純接点から電池正常／故障正常を生成しない |
| 住宅 第3条11の2・19号 [L1] | 停止後の監視復旧15分以内等。無線の識別・送受信・3m電界強度、所定の火災信号受信→発信5秒以内 | 元警報器以外から元の発報を止められない等、連動全条件。5秒はLTE/衛星配送時間の規格ではない |
| 住宅 第4条／感知器第5条 [L1,L2] | 有害な附属装置を設けない | 演算発熱、RF、煙流、音孔、荷重、USB短絡、Core落下／着脱・電池不良を含め完成形で評価 |
| 住宅 第5条 [L1] | 0〜40℃（拡大時はその範囲）、40℃/95%RHで4日、外光5000lx、振動・50G×5回・粉塵等 | A1289の0〜35℃を完成miiの0〜40℃適合へ転用不可。候補部品の環境差を解消する |
| 住宅 第5条・第7条 [L1] | 電池の全使用電圧域。光電2種K=10%/m、風速20〜40cm/s、1.5Kで60秒以内、0.5Kで5分不作動 | 正規の煙試験器と所定の前処理。取付姿勢・筐体・Core熱／RFを凍結して測る |
| 住宅 第5条9・10号 [L1] | 500VDC絶縁測定50MΩ以上、当該低電圧構成では原則AC500V/1分耐力等 | 適用端子・金属部の試験点を機関と確定。3060の1kVDC製品表示をこの試験に代えない |
| ビル光電2種・非蓄積 第17条 [L2] | K=10%/m、風速20〜40cm/s、1.5Kで30秒以内に信号、0.5Kで5分不作動 | 住宅の60秒をビル用に使わない。その他の感知器共通規格と無線／連動追加規格も適用判断 |
| 型式・製造検定 [L3] | JFEII検定業務規程 **R8.4.1**。型式の試験と型式適合検定を分離 | 明細書：住宅は別記様式2号の6の1（PDF85〜87頁／本文81〜83頁）、材質・base・基板・電池・音響・無線・自動試験・連動・図面を提出 |
| 量産検定ロット [L3] | 附表3では住宅警報器50個、光電式スポット感知器50個（減光式25個）を1回の最低受検数として記載 | **型式試験のサンプル数ではない。** 現実の申請・適用例外・供試数はOEM/JFEIIと確定。単品自作品で量産検定を代用しない |

申請の順序は、OEMと申請主体・品目/型式・附属装置境界を確定→最終BOM/筐体/電池/antenna/FW/対応表を凍結→型式試験・承認→製造品質体制と型式適合検定・合格表示→建物ごとの設置受入。OSが共通でも消防機器内の検知FWは別管理で、OSの更新・停止が消防機能を変更しない構造を審査対象にする。新規OEM headを既存FDK246の型式番号で売らない。

## 5. ビル互換性を判定する表

| 組合せ | 公開原本で確認できた範囲 | 現段階の判定 |
| --- | --- | --- |
| FSKJ226-M/C＋FSOJ001B-S | 住宅用同一familyの無線・指定電池・接点 [25章H資料] | Hの机上評価。法定自火報が必要な店舗／ビルの代替にはしない |
| FDKJ235-M/C＋FDLJ920-C | 一警戒区域向け。住宅用とは別family | 適用可能な小規模施設のみ。FSOJ001B-K→miiはメーカー接続制限によりHOLD |
| **FDK246＋FZBJ014-R-2** | 適合base、DC15〜30V、定格24V。baseのL・S+／C・S− [B1,B2] | 既設P型L/Cをそのまま使用する照合基準。mii用新headの承認ではない |
| FDK246＋FZB013-2／FZB018-2 | B1の適合表に記載（旧baseを含む） | 古いbaseの劣化・保持・現行保守方針は個別確認。穴間隔だけで互換としない |
| FDK246-X＋4刃base | 指定はFZB013-4／FZB018-4／FZBJ014-R-4 | 室外表示灯用の別構成。2刃と置換しない |
| NOHMI P型 | B1はN-13回路／B-10回路以降、B-11・15を除外 | FAPJ202-R-5LTは照合候補。現物回路・最大台数・終端・必要感度を設備図書で照合して初めて採用 |
| NOHMI R型 | B1はR-12／R-1100シリーズ以降の適合**中継器**経由を記載 | RアドレスループへFDK246/miiを直結しない。中継器型番・アドレス・負荷も確認 |
| 型番不明／熱・炎・防爆等 | 以下の光電式比較だけでは適合証拠にならない | 未判定。汎用変換台や抵抗で強制適合させない |

### 5.1 4社・8系列の比較（本人の追加回答を反映）

本人が「いろんな方を調べてみて」と指定したため、物件選定を待たずメーカー公開資料を横断した。以下は**既製消防機器の対応証拠とOEM設計の照合先**。まだ存在しないmii headの検定番号や互換保証ではない。端子名は既設回線の識別用で、ピン番号・接触片位置・汎用変換アダプターの製造図ではない。

| メーカー／系列 | 既製head＋指定base | 確認した端子・受信機の範囲 | mii設計へ残る条件 |
| --- | --- | --- | --- |
| 能美防災・2刃 | **FDK246＋FZBJ014-R-2**。旧FZB013-2／FZB018-2も承認図記載 | **L・S+／C・S−**。N-13／B-10以降（B-11・15除外）。Rは指定中継器経由 [B1,B2] | 同社回路版・機械ロック・負荷を個別照合 |
| 能美防災・4刃 | **FDK246-X＋FZBJ014-R-4**。旧FZB013-4／FZB018-4 | 室外表示灯付き別構成。2刃端子図を4刃へ転記しない [B1] | 4刃の正式端子図と表示灯回路が必要 |
| ホーチキ・移報なし | **SLV-2＋YBR-RL/1＝SLV-2RL**。埋込YBR-UL/1 | 光電2種、15〜30V。**RPP-EDW05**はSLV 30個/回線・全5回線105個まで。Rは中継器を要する [B3,B4] | 受信機の回路版と端子図、既設台数・終端を照合。R直結不可 |
| ホーチキ・S端子 | **SLV-2＋YBR-RL/2＝SLV-2RLK**。埋込YBR-UL/2 | **L→受信機L、C→受信機C**は有極性。**S**は専用中継器向け、24V/60mA仕様 [B3,B5] | Sを無電圧接点と誤認しない。mii DI/GPIOへ直結不可 |
| ニッタン・2端子 | **CK2B-016＋CX2B-001** または既設**B2-C** | **L–C：24V/65mA**。1PM,S,V,Z／2PK,M系列。総数20×回線数、1回線最大40個 [B6,B7] | 旧2KH3の後継表は根拠になるが、miiは別承認。既設baseの劣化と端子位置を確認 |
| ニッタン・P端子 | **CK2B-P-032＋CX3B-002** または既設**B3-J** | **L–C：65mA、P–C：50mA、24V**。外部制御用P、同上受信機系列 [B6,B7] | P端子を2端子baseへ落とさない。Pをmii入力へ直結不可 |
| パナソニック・2線式 | **BV454818＋BVK4010**（露出）／**BVK4017**（埋込） | **L/C**、通常2線図は無極性。24V/100mA、15〜30V。同社シンプルP-2/P-1・フレキシブルP-1に30個/回線 [B8,B9] | シンプルP-1の**BVJ10105HK**を照合候補。旧BVJ10105Hは販売終了、同じ物と扱わない [B10] |
| パナソニック・3線式 | **BV454818＋BVK4030**／**BVK4037** | **L/C/S**、出火室表示用。旧**BV4920／BV4921**は現行head非互換 [B9] | 2信号**BV456618＋BV4860/4867**とも区別。SとDLを混同しない |

同じBVK4010へ自動試験対応BVE系が付く場合でも、BV系headを同じ受信機へ交換できる根拠にはならない。取付寸法66.7mmが共通でも、電気方式・ロック・検定の組合せは別。**メーカー間の相互交換は0件確認**。4社比較を受けた設計判断は「共通Core＋系列別の固定消防部」。共通OSが持つ警報イベント契約は変えず、受信機に現れる電気特性をOEM消防部で維持する。

**物件受入0件。** 最初の物件は未選定。必要な現場票は、用途/面積/階・警戒区域、受信機型式と回路版、head/base全文字、終端と送り配線、台数と回路負荷、予備電源、付属表示灯、警報／故障／脱落／復旧挙動、取付下地・許容荷重・点検空間、管轄・保守者の交換区分。機械可読の[8系列照合表](fire-f3/compatibility.json)は全行`miiReplacementAccepted=false`として保持する。

工事不要の判定は、既設の適合台・配線・終端を変更しない、現行の感度種別と区域を満たす、正規のOEM mii headが対応表に入る、重量・落下防止・煙流／音響を合格する、交換後試験と届出等の取扱いが決まる、の全条件。資格・届出不要の一律表示はしない。[L4]

## 6. 組立評価の順序と数値受入

全試験 **NOT_RUN**。実設備を撤去せず、まず疑似接点とdummy loadで試す。

1. **部品照合**：PB/chargerの日本品・表示・回収対象確認、Pi基板版、hub、全ケーブル、modem版を記録。PBの殻を開けない。
2. **PB単体**：Pi/modemをつながずC1/C2へ適合USB-C負荷を接続。5Vで2.50Aと1.50Aの同時負荷、0→上限、片側脱着、低残量、再起動を評価。端子で4.75〜5.25Vを保つことを設計受入値とする。140WのPD高電圧をPiへ要求しない。
3. **hubの電源方向**：外部給電のみ、hostのみ、両方、PB停止、C2断を試す。逆給電がPiを意図せず起動しないこと、host側から0.90Aを超えて引かないこと、C2喪失で負荷がhostへ移った場合もPi合計1.20Aを超えないこと。超える／状態不明なら全搭載試験中止。hot-plug任せに継続しない。
4. **USB契約**：まずGNSSとI2/I1だけ。I1≤50mA、I2込み≤100mAを実測。modemはR04の正規電力契約と最大値確認後に追加。legacy USB2の500mA超をhubの総3Aで正当化しない。
5. **全負荷**：最大CPU＋Wi-Fi、LTE-M送信またはNTN送信、GNSS、火災接点変化・保存を組み合わせ、電圧波形・電流・温度・reset・USB再列挙を記録。無線試験は日本のR01〜03承認条件後。上記20W枠超なら設計改版。
6. **独立性**：Core保存停止・全電池切れ・USB断でも固定側の警報継続。PB.C1/C2の抜差しで消防側を再起動させない。接点OPENはhealthyにしない。
7. **機械・完成品**：電池632gだけでも既設head全体約125gより重いため、現評価部品を既設baseに吊るす試験はしない。OEM専用軽量電池・難燃区画・支持部品・ロック・脱落防止・最終寸法を決めてから荷重／熱／煙／音響試験へ進む。支持具やOEM headの未確定型番を架空BOMで埋めない。

## 7. 残作業を閉じる証拠

| Gate | 今回進めた部分 | 閉じるために必要なもの |
| --- | --- | --- |
| F-E01 接点 | F2の実端子・絶縁を維持 | FSOJ001B-Sの微小負荷／OFF漏れ／ON抵抗、I1との正式適合と実測 |
| F-E02 電源 | 型番付き2出力・外部給電hub配線、20W枠・試験手順 | USB契約、2C同時5V/過渡/熱/持続/逆流/停止の実測、製品電池の別選定 |
| F-E03 機構 | 既設base・荷重を分離。現PBは天井搭載対象外と決定 | 最終OEM図面・専用電池・支持荷重・脱落防止・煙流/音響、対象物件 |
| F-E04 施設 | P/R/base/headの対応・除外を明記 | S4接続承諾、実物件回路図・台帳、消防設備専門担当／管轄の取扱い |
| F-E05 検定 | 現行規程と条項・数値・明細書・量産検定の区別 | OEM完成品・申請主体・全試験仕様・成績・承認／合格表示 |
| R01〜04 無線 | 不適合antenna候補を排除。Quectel回答は部分受領 | 日本NTN原証明と附属書、band/gain/FW、exact EVK電流、同居／Skylo接続受入 |

Soracomは会社メール検索で受付メールのみ確認、技術回答は確認できていない。Quectelはアンテナ質問だけ部分回答、他の質問は回答待ち。追加送信・購入・契約・申請・実機作業は行っていない。製品の「工事不要で消防基準をクリア済み」は未達であり、現物とOEM審査なしに文書だけで完了できない。

## 8. 原本・再生成

- [P1 Anker A1289公式仕様](https://www.ankerjapan.com/products/a1289)、[取扱説明書](https://lp.ankerjapan.com/hubfs/aoos/manual/A1289Manual.pdf)、[QSG](https://lp.ankerjapan.com/hubfs/aoos/manual/A1289QSG.pdf)、[回収情報入口](https://www.ankerjapan.com/pages/product-support)。今回入口でA1289掲載は見つからないが、受領個体の対象外証明ではない。
- [P2 Raspberry Pi公式Hub説明](https://www.raspberrypi.com/documentation/accessories/usb.html)、[product brief](https://datasheets.raspberrypi.com/usb-3-hub/usb-3-hub-product-brief.pdf)、[正規販売店のSC1636注文識別子](https://thepihut.com/products/raspberry-pi-usb-3-hub)。電気仕様はメーカー原本を使用。
- [P3 StarTech USB2CC50CM](https://www.startech.com/en-us/cables/usb2cc50cm)
- [P4 Anker A2663115](https://www.ankerjapan.com/products/a2663)
- [L1 住宅用警報器規格省令](https://laws.e-gov.go.jp/law/417M60000008011)、[公式XML](https://laws.e-gov.go.jp/api/1/lawdata/417M60000008011)
- [L2 感知器・発信機規格省令](https://laws.e-gov.go.jp/law/356M50000008017)、[公式XML](https://laws.e-gov.go.jp/api/1/lawdata/356M50000008017)
- [L3 JFEII資料入口](https://www.jfeii.or.jp/download/)、[検定業務規程R8.4.1](https://www.jfeii.or.jp/download/kitei/Kentei-Gyoumu-R08-04-01.pdf)
- [L4 消防庁・軽微な工事](https://www.fdma.go.jp/laws/tutatsu/items/e7ed89c8437d7e29f0cc26e846d0f3bf4fc164a4.pdf)
- [B1 FDK246承認図](https://www.nohmi.co.jp/shoninzu/007/bl7g6v0000001bcf-att/bl7g6v0000001bdf.pdf)、[B2 FZBJ014-R-2取扱方法](https://www.nohmi.co.jp/shoninzu/009/bl7g6v0000001eln-att/TN52041.pdf)
- B3 ホーチキ2026–27カタログ：[head/base組合せ149頁](https://www.hochiki.co.jp/support/business/catalog/kahou/digital/149/)、[SLV157頁](https://www.hochiki.co.jp/support/business/catalog/kahou/digital/157/)、[base199頁](https://www.hochiki.co.jp/support/business/catalog/kahou/digital/199/)。頁URLの版表記に差があるため[2026-05-12正誤表](https://www.hochiki.co.jp/pdf/catalog/kahou/business_kahou_union_catalog_errata.pdf)も照合。SLV/DSCとDSV/DFVを混同しない。
- [B4 RPP-EDW受信機112頁](https://www.hochiki.co.jp/support/business/catalog/kahou/digital/112/)、B5 公式FAQ：[S端子用途](https://faq.hochiki.co.jp/faq/show/338?category_id=10&site_domain=default)、[L/C極性](https://faq.hochiki.co.jp/faq/show/768?site_domain=default)
- B6 ニッタン[新旧対応表2026-05-08](https://www.nittan.com/contact/pdf/%E4%BB%A3%E8%A1%A8%E7%9A%84%E3%81%AA%E6%84%9F%E7%9F%A5%E5%99%A8%E3%81%AE%E6%96%B0%E6%97%A7%E7%A2%BA%E8%AA%8D%E8%A1%A8_2026.05.08.pdf)、B7 [製品ページ](https://www.nittan.com/products/sk010lc0905023.html)のCK2B-016／CK2B-P-032「仕様」各ボタン。CK2B-016機器図E0320832（2021-07-13）も目視照合。公式仕様取得URL：[016](https://www.nittan.com/useful/search.php?product_id=25777&mode=get_spec)、[P-032](https://www.nittan.com/useful/search.php?product_id=25789&mode=get_spec)。図面ダウンロードtokenは製品ページから再取得する。
- B8 パナソニック2025–27防災：[145–146頁](https://esctlg.panasonic.biz/iportal/CatalogPageGroupDetail.do?catalogID=7670470000&method=initial_screen&pageGroupID=74&volumeID=PEWJ0001)、B9 [161–162頁の互換・結線](https://esctlg.panasonic.biz/iportal/CatalogPageGroupDetail.do?catalogID=7670470000&method=initial_screen&pageGroupID=82&volumeID=PEWJ0001)、[base寸法図](https://www2.panasonic.biz/jp/densetsu/ha/bousai_net/gijyutu1/ninshou/1nkanti/pdfs/SBCT1B62_p115.pdf)。B10 [現行シンプルP-1一覧](https://www2.panasonic.biz/jp/densetsu/ha/bousai_net/products/41_list.html)、[旧BVJ10105H販売終了・後継](https://www2.panasonic.biz/scvb/a2A/opnItemDetail?item_no=BVJ10105H)
- [機械可読BOM／配線](fire-f3/bom-netlist.json)、[静的照合](fire-f3/check.py)、[PDF生成](fire-f3/render.py)、[hardware profile](../../../systems/rock-star-os/targets/mii-fire-f3/README.md)。`python3 docs/mii/design/fire-f3/check.py`。PDFは`render.py`をreportlab環境で実行。静的検証は通電／検定を行わない。

7–24V産業用hub案も調べたが、既存3Sからの新しい電源ハーネスと取付荷重が必要になるためF3へは採らない。公開Murata資料のDM/DMS/DMSB差も未解消で、旧EVKの5V端子を現SKUへ無条件に転記しない。
