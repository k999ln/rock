# avocadoMini — 内部部品と機能の採否 R0

主担当 MAT15 / JOINT。2026-10-19時点。これはメーカー公開仕様と既存R5の仮寸法を対照した判定であり、現物購入、Mini試作、実測、部品採用、製造承認ではない。

## 先に答える

**Mini本体の中で使用を確認できた部品・完成機能は0。** 実在する候補部品は机上/個別benchの入力に使えるが、同じ閉箱に入れて通電・通信・表示・通話まで動かした証拠がない。したがって現時点に「工場がこの型番で組み立てる」確定BOM、回路図、PCB、OS imageはない。[設計開発依頼](README.md)は実現性と試作の見積入口に限る。

ここでの「部品単体」は**メーカーが仕様を公開している**意味で、Rockが現物を試験した意味ではない。「除外」は**今のL-T仮寸法とそのままの部品**に対する結論で、全方式で不可能という主張ではない。

| 系統 | 実在候補と単体でできること | 現L-Tでの判定 | Miniで使えると言う前に必要な証拠 |
| --- | --- | --- | --- |
| 主演算・保存・地上Wi-Fi | [Raspberry Pi CM5](https://www.raspberrypi.com/products/compute-module-5/)は55×40×4.7mm、eMMCとWi-Fi付き型番を選べる。開発kitでLinux処理を個別評価できる。 | **机上配置候補**。基板対角約68mmは仮内径72mm未満だが、carrier、connector、放熱、antennaの体積を含まない。公称idle 5V×0.4A≒2Wの常時稼働は既存の仮24h電力条件に合わない。 | carrier付き3D CAD、Wi-Fi AP実測、wake/sleep電力、保存/復旧、RockstarOS Mini port、閉箱熱。CM5は衛星modemや電話回線を内蔵しない。 |
| 電池 | [Molicel M65A](https://www.molicel.com/wp-content/uploads/Product-Data-Sheet-of-INR-21700-M65A-80153-0.1_250805.pdf)は1本23.4Wh、公称直径最大21.7mm・長さ最大71mm。 | **cellのみ仕様確認**。2本で公称46.8Wh。仮76mm電池区画の軸余白は5mmで、タブ、絶縁、固定、保護基板を含むpackとしての適合は未証明。 | pack実図、2S/2P決定、保護・充電・温度・peak・輸送/安全条件、実負荷持続。 |
| 衛星通信 9523 | [Iridium Core 9523](https://www.iridium.com/products/iridium-core-9523)は狭帯域の双方向音声/データmodule。 | **裸moduleの個別bench候補**。専用carrier、電源/VBOOST、antenna、IP service条件がない。 | 選定boardのCAD、RF/電源trace、米国Mini型式のIP・一般clientへの共有許可と料金停止条件。moduleの音声/データ能力を「衛星ポケットWi-Fi」に換算しない。 |
| 衛星通信 9523の既製基板 | [PLANET 9523 OEM Board](https://www.iridium.com/products/planet-9523-oem-board)はIP/MQTT等を掲載し、Wi-Fiはoption。外形112×75×20mm。 | **現L-T仮内径72mmではそのまま除外**。幅だけで3mm超過する。 | 異なる筐体、別基板、または別通信方式を再設計した後に再判定。既製基板のIP記載はMiniの任意client tethering契約を証明しない。 |
| 衛星通信 9770 | [Iridium Certus 9770](https://www.iridium.com/products/iridium-certus-9770)は双方向IP/音声の比較候補。140×60×16mm、185g、入力9.5〜14.5V。 | **比較・個別bench候補**。仮2S cellの5.0〜8.4Vからは昇圧が必要。現行の光学・電池と同居するCADがない。 | antenna、昇圧/送信peak、熱、重量、米国のIP/共有/音声契約を同一機で確認。 |
| 裸眼の空中表示 | [ASKA3D-200NT](https://aska3d.com/ja/aska3d-200nt.html)は200×200×6.3mm・280gの**光学板だけ**。像源、計算機、手センサーは含まれない。 | **この既製板をD140仮襟へそのまま入れる案は除外**。四枚に縮める案も現寸法で停止。板の切断/折畳で同じ光学性能が出る証拠はない。 | 代替の小型像源＋光路＋指入力を選定し、実像の幅、可読性、視域、明るさ、遅延、光安全をbench実測。 |
| 手・距離・本人確認 | camera/ToF/指紋/PIN等は**機能方式の候補**。Mini向け型番と配置は未確定。 | **未選定・未試験**。センサー検出を本人承認に代えない。 | window/視野/死角、手位置誤差、誤tap、他人・暗所、登録/失効、privacyと閉箱での実測。 |
| 電話・地上回線 | マイク、スピーカー、cellular modem、eSIM/SIM、番号/音声providerの接続が必要。現R0に確定module/契約なし。 | **未選定・未試験**。衛星moduleの音声仕様だけで着信・発信は成立しない。 | 実番号と回線、ring→表示→本人tap→双方向音声→切断の一周、緊急通報条件、費用。 |
| 安全・電源・dock | AON MCU、charger/BMS、物理MIC OFF、停止、latch、離脱接点は[回路入力](electrical-architecture.md)に機能を定義。 | **回路部品未選定**。16経路のpin/電圧は全未割当。 | 回路図/ERC、pack保護、接点順序、独立停止、故障注入、閉箱熱・復旧。 |
| RockstarOS / Sky / Zema / Game | 共通の仕事/権限/保存契約と別環境の実装がある。 | **Miniへの移植・実機起動0**。外部GameやGTA VIのMini動作、PC不要の作品完成は未受入。 | 選んだSoC/OSでdriver・boot・更新/復旧、入力→承認→成果保存、対象Game別性能/ライセンスを実測。 |

## いま組める検証構成と、組めない製品構成

実在部品を机上に並べ、CM5の計算、M65Aのpack設計、9523/9770の通信、光学方式を**別々にbench評価する計画**は立てられる。これを一本のMini、手ぶら電話、着脱ポケットWi-Fi、空中tap端末として結線・製造する確定設計にはできない。仮2本のM65Aを使用可能率0.8・変換効率0.9と仮定すると負荷側33.696Wh。衛星APを8Wで2時間動かす仮定では残り22時間の全待機負荷は平均0.804W以下となる。CM5の2W idle常時給電はこの**仮シナリオ**で不合格だが、起床型の主SoC案は未評価のまま残す。

## 回路図へ進める最短の順番

1. **機械/光学E0:** 既製9523基板と四枚光学案を除外し、採用候補ごとの正式型番、STEP/外形公差、antenna空間、保護packを一つの全高200mm以下CADに置く。置けなければ回路詳細へ進めない。
2. **個別bench E1:** 代替光学の可読像＋tap、選んだ衛星radioのIP/音声・実電力、Wi-Fi AP、battery/charger、安全停止を別々に実測。米国providerからMini型式の双方向IP、一般client共有、料金上限を書面で得る。
3. **回路E2:** E0/E1で採用した同一型番だけでrail/peak/熱とpinを確定し、回路図・ERC・BOM・PCB/stackupを発行する。
4. **同一閉箱E3:** 通話、空中表示とtap、衛星→Wi-Fi、RockstarOSの仕事/保存/復旧、電池/熱/安全を同じ試作個体で受け入れる。OI 0/7、MP 0/6の現在値を証拠なしに進めない。

この採否は工場の**設計開発担当**との見積と反証のための入力であり、部品発注・量産組立の指示ではない。


## Mini光学/像源の型番選定と5V配線source（2026-10-23・MAT15／OS10／WEB04）

E0はASKA3D-200NT＋Waveshare 5.5inch HDMI AMOLED/SKU16103＋D405を選定、CM5参照hostを再利用。少数全範囲の最終部品ではない。実部品寸法/45度仮光路の24,336姿勢で1/2/4cellの未達22,256/20,176/16,568、四枚案を全範囲として不採用。E1の立体像源候補はLooking Glass Go＋拡大LeAIRRで、中継適合・lens型番・視域・glare未受入。selected-cell.jsonとselected-cell-model.pyへ保存。

D405固有のSDK2.56.5取得sourceとprivate子process/OS readerを追加。実機なし、点観測だけ、位置誤差/時計対応不明、操作適格false。TPS22965DSGRの5V評価回路/28×23mm配線含むKiCad sourceを追加したが、ERC/DRC/DFM・実板未受入、dummy loadのみ。current limit/reverse isolation/watchdog/独立光学停止/HDMI回り込みは未対応。新しい最終Mini回路・配線済みmainboard完成ではない。料金維持、購入/公開なし。次は実光学/像源の光と停止、D405精度、E1光路を測り、全範囲と最終回路を閉じる。新共通ロゴをPDFへ参照。

### E1 Looking Glass Go + 拡大LeAIRR

章40〜43 / e1-leairr-prescription.json / e1-leairr-model.pyを参照。FRLN-300S-300PとFRLN-300S-150Pはcatalog候補、BSは400×300mm特注要求・stock品番未選定、RF-ACは切出し未確定。横倍率2・BSから像450mm。開口計算は限定水平断面で実eyebox/全範囲の証拠ではない。Goはメーカー5V3A経路を検討し2A couponへ無検証接続しない。leairr-prewarp.mjsは計画sourceのみ。Bridge/実sensor/独立停止と光学の受入後に最終回路とPCBを閉じる。料金維持、製造リリースなし。

### E1両眼の再追跡とGo/D405 host source

章44〜46、e1-binocular-layout.py、spatial/GO-D405.md参照。3×3m/507位置の小立体必要条件でも少数全範囲に未達。大開口/低倍率を完成方式として採用しない。Goのscalar観測とD405点を同じ校正/placeへ束ねる限定host sourceを追加。SDK/実機/画素出力/空間tap/低眩しさ未受入。Goの自律再生/逆給電を含む独立停止と光学が未確定のため、最終net/配線PCB/製造releaseへ進めた記録はしない。既存料金を維持。

### Mini参考2動画と板・膜なしの接続開発

本人は像の場所に板/膜を置かない条件を確定。動画再生から見え方と手→scene反応を採用し、光学/型番/低眩しさは未推定。hand_landmark_observer.pyとhand-preview/hostを追加、既存一時下書きにrevision/読戻しでつなぐsourceだが実行未受入。free-space-exit-bound.pyで4側面/理想操舵でも有限出口による未達を記録。hardware/reference-interface-map.jsonへPico2接点/LEDとGo active adapter参照を記録、routing変更/最終Mini基板/光学停止の合格なし。章47〜50とHAND-PREVIEW.md参照。既存料金維持。

### Mini上下6面とCM接続

章48/51参照。optical-exits.mjs/calculate-six-exits.mjsを追加。上下付き6面全体80㎡で有限組0未達、10mm guardで708未達という理想幾何であり、少数小型head/Go/低glareの採用解ではない。CMは受入体験へ対応づけ、40mm収納は未実証。光学/像源/独立停止/実hand/引継ぎと最終回路/配線PCBは未完成、料金維持。
