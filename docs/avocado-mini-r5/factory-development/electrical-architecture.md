# avocadoMini — 電気設計入力・回路境界 R0

主担当: MAT15 / JOINT。ROCKはOS・Broker・仕事・予算・止める経路、EXTERNALは部品・RF・光学・電池・回路・施工、JOINTは同一個体受入、OWNERは要求変更・契約・実機導入判断。これは**回路図の入力仕様**であって、pin番号、抵抗値、銅箔幅を確定した製造回路ではない。

## 1. 本体とdockの責任

持出すcoreに演算、保存、本人鍵、低電力制御、電池、充電保護、マイク・スピーカー、センサー、空中表示、地上通信、衛星modemと携行用antenna、Wi-Fi AP、物理停止を残す。dockは保持、場所ID、電力供給、位置校正、着脱検知を担当する。dockから外れた後に通話とjobを続けられない構成は不可。衛星modemやWi-Fi routingをdockや隠れた外部hubへ移した案は別製品として差分を明示する。

## 2. 機能ブロックと信号方向

```text
dock電源 --過電圧/逆流保護-- 充電制御 --保護付き2-cell pack候補
                                              |-- 常時給電domain → 監視MCU → 匿名通知/着信wake
                                              |                    |--物理停止/温度/異物/位置/爪
                                              |                    `--光出力/機構のhardware許可
                                              `-- 切替電源domain → 主SoC/保存/RockstarOS
                                                               |-- secure key path
                                                               |--顔/手/距離sensorと指紋/PIN
                                                               |--音声入出力、物理MIC OFF
                                                               |--承認後の光学表示driver
                                                               |--地上WAN/voice radio
                                                               |--衛星IP radio+antenna
                                                               `--Wi-Fi AP radio+antenna
```

`secure key path`は保護方式の要求名で、特定IC採用ではない。本人照合・OSの承認・Providerの結果を監視MCUの単一信号へ短絡しない。監視MCUは安全な停止とwakeを担い、家電作用・料金支出・Tool実行を承認しない。

## 3. 電源domainと故障時の初期値

- **PACK/CHARGE:** 2Sか2Pかも採用前。cell選定後に保護回路、充電方式、balanceの要否、電流制限、温度監視、dock接点の順序、短絡・逆接・接点露出、製造交換方針を回路図へ落とす。OSが停止しても充電保護は働くこと。未選定の充電ICと抵抗値を仮で固定しない。
- **AON:** 着信wake、位置・爪・温度・停止入力、単純な匿名合図とjournal保持に必要な最小domain。衛星を含む実際のpaging方式が常時接続を要求する場合は、そのidle電力もここへ入れる。24h比較profileでAPを2h使った後の残り22hは、**全待受負荷合計で0.804W以下**という仮の上限であり、監視MCUだけの予算ではない。
- **MAIN:** 本人操作か真のProvider着信で起こす主SoC、保存、センサー、音声。署名・revision・Brokerの状態を復元できるまで権限がある出力を許さない。電源喪失時は保存の原子性と中途jobの照合を測る。
- **RADIO:** 衛星、地上、Wi-Fiを別enable、別計測点、別故障状態で記録。三つを同時送信できるかはRF共存と電池peak試験で判断。衛星の登録とIP疎通、client共有を別状態とする。
- **OPTIC/MOTION:** 光出力と可動cup駆動は主SoCのGPIOだけで通電できない設計を工場に求める。独立停止・異物・温度・位置・保持・校正の許可信号が揃うまで出力OFF。低電圧・断線・起動直後はOFF。人体近接の衛星送信と指入力はRF曝露審査前に同時有効化しない。

各railの目標電圧、連続/瞬間電流、起動順、hold-up、突入、ripple、ESD、fuse、線幅は**採用部品の正式datasheetと実負荷波形後に記入**する。既製9770は12V±2.5V、2S cell仮範囲は5.0〜8.4Vなので昇圧が必要。具体的converterを決める前に送信peakと温度の測定値を取る。既製9523裸moduleには別のVBOOST入力があり、現在の基板/rail仮定を転用しない。

## 4. 回路シートとinterface controlの必須成果

工場のECADには少なくとも次の独立したシートを要求する: battery/charger/protection、power tree/measurement、AON/safety/latch、main compute/storage/key、terrestrial voice、satellite RF、Wi-Fi/GNSS、sensor/biometric/audio、optical driver、dock interface/test points。未選定部品のシートは`NOT_RELEASED`として空欄と理由を残し、汎用pinで埋めない。

全connectorとFPCについて、端子ごとに`net名、方向、電圧範囲、最大電流、boot/故障時値、ESD/保護、隣接RF/光学との距離、相手基板・ケーブル版`を一覧化する。主SoCとAON間はwake/heartbeat/stop要求/状態読戻しを分け、stop要求は監視側で独立に確認する。dock離脱の**早切れ信号**で家の`placeEpoch`と充電経路を切り、本体の本人鍵・job・電池を保持する。電力接点は信号端子より安全な離脱順とし、実接点構造を図面で示す。

各回路シートにERC、電源レール表、ネットリスト、実BOM・代替/廃番情報、基板stackup、制御インピーダンス、antenna keep-out、shield/ground計画、熱via・放熱経路、テストポイントを付ける。RF系は選定modemとantennaのreference design/許可条件に従い、光学・金属殻・手・石材を含む3D OTA評価で配置を確定する。moduleの認証を完成機の認可へ転用しない。

## 5. pin割当やPCB配線を今固定しない理由

選定L-Tでは仮の72mm内径へ幅75mmの既製9523 IP基板は入らない。四枚光学案はhinge/封止の余白がほぼなく採用品から除外済み。衛星の別board、地上voice、Wi-Fi、antenna、光学driver、保護pack、第二latchを積んだ同一200mm CADもない。ここでpin表やGerberを発行すると、基板と光学・RFの重大な干渉を隠す。工場へはまず**部品型番と実寸の配置・通信/光学benchが通った版だけ**を回路詳細設計へ進める条件で依頼する。

## 6. 電気・firmwareの受入trace

1. dockで停止状態から起動: 物理停止、出力OFF、cell保護、温度、位置、爪、鍵、保存の順に自己検査。未校正なら光・機構・家電作用はOFF。
2. 真の着信event: AONが匿名合図、MAIN wake、本人照合、空中card、本人tap、Provider receiptを別時刻/IDで記録。ring期限内に双方向音声まで通った回だけ通話成功。
3. Readyへの可動: `g+δ+e≤6mm`を全途中位置で満たす実CAD。異物、片側爪、停電、過電流、温度異常、手の接近で光/駆動を安全側へ停止。復旧は自動再動作にしない。
4. 離脱: 電力/場所接点と早切れ信号の順序を実測。旧dock権限を失効し、本体の通話/保存を保持。接点chatterと再装着を繰り返しても二重承認しない。
5. 米国屋外衛星AP: Mini自身の網登録→IP→DNS/TLS→市販client共有を一台で実測。費用とprovider側hard stopの条件が不明なら有料共有OFF。空中表示とRFを同時に動かす姿勢も測る。
6. 電池/熱/更新: 低電池、充電中、RF peak、AP+光学、Game、再起動/更新失敗で表面・cell・RF/SoC各温度、電流波形、保存復旧を同一閉箱で測る。規格適合の判断は対象市場の専門担当が行う。

これらはDVP&Rの入力であり実施済みではない。各traceの実個体番号、回路/PCB版、OS版、modem FW版、契約、温度・姿勢、計測器校正、raw traceのhash、合否を残す。

## 7. 工場側のOS接続と納入条件（共通runtime対応）

[RockstarOS共通runtime](../../../packages/rockstaros-runtime/README.md)はEveの履歴・仕事・利用権・既存料金経路へ接続するclient softwareである。工場は選定SoCのBSP、boot、driver、OS基盤、署名更新/復旧とともに適合を示す。packageの導入だけでIF08〜16や衛星/空中表示が接続される構成にはしない。電源/pack保護、物理停止、光/駆動の遮断はOS停止中も有効とする。

IF08/09はwake原因、bootごとの連番、heartbeat timeout、停止要求と停止読戻しを別信号/状態にする。IF14はsensor識別/校正版/観測時刻/単位/誤差をdriver経由で報告し、生の生体streamをCloudへ送らない。IF16の早切れで場所epochと旧入力座標を失効させる。USB/UART/SPI等の物理bus、connector、logic level、checksum/通信遅延の確定は選定SoC/MCUのdatasheetと干渉測定後に行う。現在のinterface台帳のpin未割当を採用済みに変えない。

工場納入では①BSP/driver source・license/SBOM、②OS image/firmware/回路/PCB/部品版のmanifestとhash、③復旧手順とtest fixture、④同一個体のEve仕事/成果再取得と課金上限、⑤MCU停止・dock離脱・通信喪失・再起動のraw traceを要求する。純粋hostのpackage試験と製造回路の受入は別証拠である。`contracts/rockstaros-portable-runtime.json`と`packages/rockstaros-runtime/README.md`をsoftware側の引継ぎへ含める。


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
