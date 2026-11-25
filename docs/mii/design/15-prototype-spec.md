# 15 試作機の部品・接続・電力仕様

本体の最新選定品・端子配線は[19章 HW1](19-body-hardware.md)。本章の製品目標/段階試験を保持し、HW-A01〜08と同一実機で対応付ける。18章のMac/Pi検証装置を本体受入へ転用しない。

V1.1設計追補 / 2026-11-02。**製品全体の設計入力。市販品を使うP0b/P1aの選定BOMと端子間配線は[18章](18-parts-wiring.md)で具体化済み。** 製品PCB/trigger回路の確定pinout・製造図は未完了。 [14章](14-common-os.md)の共通OSへ接続し、[16章](16-prototype-acceptance.md)で受け入れる。購入価格・提供確約は含めない。

## 1. 試作の単位

| 段階 | 実物 | 終了条件 |
| --- | --- | --- |
| P0 操作・保存 | 開発host 1台、camera 1台、mic 1台、確認用display | 実声/指先→依頼内容確認→保存→再起動読戻し。画面は測定用で製品表示の代替合格にしない |
| P1 空間入力 | P0＋同型camera/Nodeを2台へ、校正治具、同期観測 | 同時刻・同座標の観測、精度、遮蔽時の拒否。60fps試作を120fps合格にしない |
| P2 室内拡張 | Nodeを4台へ、switch、Hub候補、表示治具 | 帯域/電力/遅延/1台故障/LLM負荷時の同一job継続 |
| P3 製品光学・携帯/機構 | 光学cell、遮断回路、選定後の電池/dock/筐体 | 4表示条件と採用した構成の電源/熱/保持/復旧。P0〜2で代替しない |

P0のカメラとPCをTower製品の最終部品にしない。P3の携帯機構はC-01の決定対象。四週間の日程は部品受領・接続可否確認後の計画であり納期保証ではない。

## 2. 最初のBOM（採用評価リスト）

数量は一式の試作計画。所持/提供/購入の実在は別途記録する。

| ID | 部品・数量 P0 / P1 / P2 | 必須条件 | 候補と採否条件 |
| --- | --- | --- | --- |
| B01 | 開発host 1 / 1 / 1 | 対応OS、RAM、camera入力、保存、表示出力 | 本人画像でM4 MacBook Pro 14-inch/16GB/macOS15.7.4を確認、P0 hostに採用。製品HubはJetson系等を実負荷で比較 |
| B02 | camera 1 / 2 / 4 | 同じsensor/driver版、時刻と露光、固定レンズ | P0bはBRIO 500 960-001493、P1aはPi Global Shutter Camera SC0715を可視光評価用に選定。120fps NIR製品の代用品にはしない |
| B03 | camera host 0〜1 / 2 / 4 | 対応CSI/USB、帯域、適合電源、冷却 | P1aはPi 5 4GB＋公式電源/Active Coolerを選定。別Node方式なら台数分必要 |
| B04 | lens・camera cable・固定具 各camera分 | mount、sensorサイズ、FoV、焦点、端子向き | P1aは6mm CS、公式Standard-Mini Camera Cable 200mm、MTPIXI-B。現物board版は受領時確認 |
| B05 | mic 1 / 1 / 1 | hostで録音可能、停止/表示 | P0bはBRIO内蔵mic。多Node同期arrayは別評価 |
| B06 | monitorまたは既存projector 1 | 入力端子、実解像度/Hz、表示遅延 | P0はMac内蔵画面を使用。projector型番は引き続き未確認。明るさ/低遅延/センサーAPIは未確認 |
| B07 | 認証済み電源・電力測定 各給電経路分 | 端子、極性、定格、保護、機器仕様との適合 | P0/P1は各評価kit指定電源。独自電池・昇圧回路は後段 |
| B08 | Ethernet cable・switch 0〜1 / 1 / 1 | 同時stream、管理可能性、集約帯域 | 4 Nodeの現予算ではHub向け10GbE等。2.5GbEは減量したprofileで再評価 |
| B09 | 校正板、測定尺、時刻/波形測定器 0 / 1式 / 同左 | 実寸/測定不確かさ、再現可能な配置 | 借用も可。試験記録へ型番/校正状態を残す |
| B10 | 安全停止操作器・状態表示 1式 | host停止と出力遮断を区別して確認 | P0はUI停止。発光/actuator追加前に独立遮断を別受入 |
| B11 | radar・IMU・SE・IR評価kit 0 / 条件付き / 条件付き | 明確な未解決項目を一つ測れる | 基本操作に必須とせず、型番/SDK/熱/発光条件確定後に追加 |

カメラ公式資料はGS CameraをIMX296、1456×1088p60、IR filter付きとする。初回は可視光で評価する。850nm照明を足せばそのままNIR系になる、とは扱わない。フィルタ除去を初回組立手順に含めない。[Raspberry Pi公式camera仕様](https://www.raspberrypi.com/documentation/accessories/camera.html)（2026-11-02確認）。

Jetsonのmoduleとcarrier board／開発kitは別物。既存04章のTOPSやSoC電力を、HDMI本数・PoE・NIC・SSD・冷却を含む完成Hubの能力へ転用しない。[NVIDIA公式module/kit区分](https://www.nvidia.com/en-us/autonomous-machines/embedded-systems/jetson-orin/)（同日確認）。

## 3. 製品全体の接続表

P0b/P1aは18章W01〜W09で端子・cableを具体化した。以下は同期・製品拡張も含む上位interfaceで、全I項目を実装済みとしない。P1aではI04/I07は未接続。

| ID | 接続元→接続先 | 信号/給電 | 接続前に埋める欄 | 検証 |
| --- | --- | --- | --- | --- |
| I01 | camera→Node/host | CSIまたはUSB | exact model、connector、pinout出典、向き、電圧、cable長 | capture/sequence/drop/露光実測 |
| I02 | mic→host | USB等 | model、sample rate、channel、mic-off方式 | 原音保存off、同意、切断/再接続 |
| I03 | Node→switch→Hub | Ethernet、選定後のみPoE | NIC/PHY、port速度、MTU、PD/PSE適合、clock | full-load throughput/drop/sync |
| I04 | 同期源→camera trigger | 信号線＋基準GND、必要な絶縁/level変換 | trigger電圧、極性、pulse幅、負荷、最大rate | oscilloscope等で露光のずれを測定 |
| I05 | Hub→display | HDMI/DP等 | EDID、実解像度/Hz、色形式、cable、入力遅延 | pattern/視点/blackout読戻し |
| I06 | 適合電源→各評価board | kit指定DC | 電圧、電流、極性、保護、起動peak | meter/温度/瞬断/逆給電経路 |
| I07 | 停止/監視→出力電源 | watchdog＋独立遮断（後段） | cutoff回路、残留発光、他portからの回り込み | process停止・cable断でも出力停止 |

I04は「GPIOを直接つなぐ」で確定しない。board版と公式電気仕様を揃えてから回路担当がpinを記入する。PoE cableへ独自の電源/trigger配線を追加しない。

## 4. 通信の計算と採否

06章の圧縮後RGB上限50Mbps、その他20Mbpsを**仮の上限**としたpayload計算:

- NIR: `960 × 640 × 120 × 8 / 10^6 = 589.824 Mbps`
- 頭ROI: `320 × 240 × 120 × 8 / 10^6 = 73.728 Mbps`
- 1 Node: `589.824 + 73.728 + 50 + 20 = 733.552 Mbps`
- 4 Node: `2934.208 Mbps`、8 Node: `5868.416 Mbps`。いずれもpacket overhead、burst、再送、制御通信を除く。

したがって4 Node全streamに2.5GbE集約を採用しない。10GbE uplink等の候補でも実測合格が必要。1GbE/Nodeも「可」と確定せず、RGB圧縮上限、実encoder、packet化と連続負荷を記録する。MCU候補だけではCSI取り込み/ISP/encoderの存在を満たさない。P1の60fps設定は独立profileとして実byte数を採る。

## 5. 電力・熱の計算

既存03章のNode設計予算12W平均/20Wpeakを統一入力にする。採用部品の実測値ではない。旧04章の`25 + 4×5 = 45W`はこのNode予算と不一致なので使用しない。

| 構成 | 末端負荷の平均目安 | 未計上 |
| --- | --- | --- |
| 仮Home演算25W＋Node1 | 37W | carrier、switch、変換/cable損、SSD、fan、display |
| 同Node2 | 49W | 同上 |
| 同Node4 | 73W | 同上 |
| 同Node8（算術比較のみ） | 121W | 同上。Homeが8台処理可能という意味ではない |

AC入力は `P_host_board / η_host + Σ(P_node_input / η_delivery) + P_switch_input + P_other_input` とし、測定境界を明記して二重計上しない。Node4のpeakは `P_host_peak + 80W + 損失・その他`。旧110WをAC電源定格として固定しない。displayは別電源でもシステム総量に加える。

携帯案の電池候補は `必要Wh = 平均負荷W × 目標h / (変換効率 × 使用可能容量率)`。例えば仮15W・2h・0.90・0.80なら約41.7Wh。これは比較用の算術例で、目標稼働時間・電池選定・筐体収容の決定ではない。実測負荷、温度、瞬間電流、保護pack仕様が揃ってから容量を決める。

### IRのdutyと電力の未整合

03章のIR電気peak10W・duty10%と、06章の120Hz・露光2〜4ms・前後各0.2msは一致しない。後者の点灯時間2.4〜4.4msならdutyは28.8〜52.8%、仮10W一定pulseの時間平均は2.88〜5.28Wになる。放射Wと電気入力Wも区別する。pulse幅・電流・sensor感度・熱を測るまで1W平均やNode12Wを成立値にしない。120Hzでduty10%を選ぶなら点灯時間は最大約0.833msとなるため、露光設計も同時に再評価する。

## 6. 機構・回路を固定する前の出力物

- 型番/board revision付きBOM、I01〜I07のpinoutと回路ブロック図、電力の実測表。
- 部品実寸、connector/cable曲げ半径、視野、遮蔽物、放熱/吸排気、保守空間を入れた配置図。
- 最終回路図・ERC、PCB・DRC/DFM、key/firmware更新と復旧、組立/検査票。既存評価couponを製品mainboardへ昇格しない。
- 光学cell、発光停止、低眩しさ、電池/保持機構の同一構成試験。受入前に製造releaseへ進めた記録をしない。
