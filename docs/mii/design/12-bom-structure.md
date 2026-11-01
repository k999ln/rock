# 12 BOM の構造（価格は書かない）

価格・ロット単価・工場は後（本人の指示）。ここは**何が要るか**と候補の列だけ。RFQ は codex/tasks/20。

## 1. Node（Column）

| 区分 | 部品 | 要求 | 候補（型番は task 20 で確定） |
| --- | --- | --- | --- |
| センサー | NIR GS カメラモジュール | 1920×1280、120 fps、GS、MIPI | OmniVision OG02B1B / OG02D1B 系 |
| | レンズ | HFOV 100°、F2.0、850 nm 対応、低歪み | M12 |
| | 850 nm バンドパスフィルタ | FWHM 40 nm | |
| | RGB 魚眼カメラ | 160–180°、60 fps、2–5 MP | |
| | 60 GHz レーダー | FMCW 3Tx/4Rx、外部トリガー | TI IWR6843 / Infineon BGT60TR13C |
| | MEMS マイク ×2 | 同期 ADC | |
| | IMU 6 軸 | | |
| | 温度センサー | | |
| 光源 | 850 nm IR LED アレイ | 3 W 放射、90°、パルス駆動 | OSRAM SFH 47xx 系 |
| | 定電流ドライバ＋電流制限＋watchdog | | |
| 演算 | MCU | Cortex-M7 級、PTP 時刻保持、トリガー生成 | STM32H7 / RP2350 |
| | ISP / ビニング / 軽圧縮 | MCU 内蔵 or 小型 FPGA | |
| | Secure Element | | |
| 通信・電源 | 1GbE PHY（PTP ハード時刻スタンプ） | | |
| | PoE+ PD コントローラ、12 V 入力、DC-DC（5 V / 3.3 V / 1.8 V） | | |
| 機構 | Head 筐体（アルミダイカスト or 樹脂＋金属フレーム）、NIR 透過黒窓（PMMA）、レーダー窓（誘電体）、機械式シャッター、回転機構 | | |
| | 柱（アルミ押出し φ60）、ベース（鋼板 2.5 kg＋樹脂カバー φ260） | | |
| | 状態 LED、録画中サイン LED | | |
| 組立 | 基板 ×2（センサー基板・電源/通信基板）、ケーブル、ねじ | | |
| 校正 | 工場校正治具、検査票 | | |

Puck: Head＋天井金具＋化粧リング。Slot: Head（NIR 1 本＋RGB）＋埋込ボックス＋IP65 窓。

## 2. Hub（Home）

| 区分 | 部品 |
| --- | --- |
| 演算 | Jetson Orin NX 16 GB 級モジュール＋キャリア基板、NVMe 1 TB |
| 通信 | PoE+ スイッチ IC（4 ポート、PTP 対応）、2.5GbE、Wi-Fi 6/BT、WAN RJ45 |
| 表示 | HDMI 2.1 ×2、Sync out、Display Bus 予備コネクタ |
| 電源 | AC アダプタ 120 W、PoE 給電電源 |
| 機構 | 筐体 250×200×60、ファン、壁掛け金具 |

Pro: x86＋dGPU（avokado Pro と共通基板）、PoE+ 8 ポート、HDMI ×4、10GbE。

## 3. Gen1 表示

市販の投影エンジン（3,000 lm、UST、120 Hz、低遅延）。または OEM 光学エンジン（Full-HD/4K DLP、$40–50 クラスの光学エンジン＋LED/レーザー＋ドライバ＋レンズ＋冷却）で「映像を出すだけの Light Engine」を作る（Android・電池・スピーカー・Wi-Fi は入れない）。

## 4. Gen2 Optical Head（R&D、決定仕様にしない）

Display source（10–15" 高輝度 LCD/OLED or 共有 Light Engine からの光）、beam splitter、microprismatic retroreflector、PMMA Fresnel、AR 膜、光学フレーム、ドライバ基板、校正カメラ、小型 MCU、温度センサー。

## 5. 同梱品

校正ターゲット（反射球 3 個の棒＋床ターゲット）、PoE ケーブル 4 本（10 m）、床ねじ止め金具、簡易説明（Eve が案内するので紙は 1 枚）。
