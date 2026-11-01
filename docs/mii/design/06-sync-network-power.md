# 06 同期・通信・電源

## 1. 同期（二重構成）

| 仕組み | 役割 | 目標 |
| --- | --- | --- |
| **PTP（IEEE 1588）** | 時刻合わせ。Hub が grandmaster、Node の PHY がハード時刻スタンプ | Node 間 ≤ 10 µs |
| **露光トリガー** | 撮影の同時性。Hub からの 120 Hz トリガーを各 Node の MCU が受け、カメラ露光と IR パルスを駆動 | **Inter-node exposure skew ≤ 100 µs（量産検査で実測）** |

トリガーの配り方: PoE ケーブルに別線は無いので、**PTP で合わせた時刻に対する「次の露光時刻」を Hub がスケジュール配信**し、各 Node MCU が自分の PTP 時計でトリガーを生成する（有線トリガー線なし）。試作では USB/有線トリガー線でよい。

```text
t = T_exp − Δ   IR ON（Δ = 0.2 ms）
t = T_exp       露光開始（2–4 ms）
t = T_exp + e + Δ  IR OFF
```

IR パルスは Node ごとに位相をずらすこともできる（干渉低減）が、三角測量は同時露光が前提なので**基本は全 Node 同時露光・同時 IR**。

## 2. レーダー TDM

4 本同時送信は干渉。Hub が 1 ms 周期で TDM:

```text
0.00 ms Node1 TX / 0.25 ms Node2 / 0.50 ms Node3 / 0.75 ms Node4 / 1.00 繰返し
```

採用レーダーのフレーム時間を測ってから確定。chirp slope / 開始周波数の分離も併用可。**各 Node が勝手に送信しない**（Hub master）。8 本構成では 0.125 ms 刻み、または周波数分離。

## 3. 映像の帯域

| ストリーム | 解像度 × fps × bit | 生 | 送る形 |
| --- | --- | --- | --- |
| 全身 NIR | 1920×1280×120×8 | 2.36 Gbps | **2×2 ビニング 960×640** → 590 Mbps |
| 頭 ROI NIR | 320×240×120×8（フル解像度の切出し） | 74 Mbps | そのまま |
| RGB 文脈 | 1920×1080×60×12（YUV420） | 1.5 Gbps | H.264/HEVC intra 50 Mbps（意味理解用、遅延は許容） |
| レーダー・音・IMU | — | <20 Mbps | そのまま |
| 合計 / Node | | | **≈ 750 Mbps → 1GbE で可** |

Hub 側は 4 Node で 3 Gbps → 内蔵 PoE+ スイッチ → Hub SoC へ 2.5/10GbE。
頭 ROI の位置は前フレームの頭位置から Hub が Node へ指示（1 フレーム遅れで追従、消失時は全身ビニング画像から再検出）。

## 4. 配線（製品）

```text
Hub ──PoE+ Cat6A ≤ 30 m──► Node 1
    ──PoE+ ───────────────► Node 2
    ──PoE+ ───────────────► Node 3
    ──PoE+ ───────────────► Node 4
    ──HDMI 2.1 ≤ 5 m (光 HDMI で 15 m)──► 投影エンジン 1
    ──HDMI ──────────────────────────► 投影エンジン 2
    ──RJ45 ──► 家の LAN / WAN
    ──Display Bus（予備, Gen2）──► Optical Head A–D
```

- Column: 床を這うケーブル 1 本（PoE）。または 12 V アダプタ＋LAN の 2 本。新築なら床・壁から PoE を出す。
- Puck / Slot: 天井裏・壁内に Cat6A。PoE+ のみ。
- 無線 Node は作らない（同期と帯域のため）。

## 5. 電源

| 機器 | 入力 | 消費 |
| --- | --- | --- |
| Node | PoE+（25.5 W 供給）または 12 V 3 A | 12 W 平均 / 20 W ピーク |
| Hub（Home） | AC 100–240 V | 25 W ＋ PoE 給電 4×12 W = 73 W 平均、ピーク 110 W |
| Hub（Pro） | AC | 250 W ＋ PoE 8×12 W |
| 投影エンジン | AC（別電源） | 100–200 W |

- Node は電池を持たない。停電時は Hub が UPS（任意）で Room Model と校正を保存して停止。
- 4 本を USB-C PD で動かさない。将来 PoE++（802.3bt）版で IR 6 W・Depth 搭載 Pro Node に対応。

## 6. Display Bus（Gen2 の予約）

Hub → Optical Head A–D。各 Head は「光学素子＋光変調＋ドライバ＋MCU＋温度」だけなので、映像信号（DP/HDMI または独自 LVDS）＋ 12–24 V 電源 ＋ 同期線。共有 Light Engine 案なら光ファイバー/中空導波で光を配る案も併記（光学試作で決める）。Gen1 筐体には **コネクタ位置だけ予約**する。
