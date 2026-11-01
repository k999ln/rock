# 13 試作計画（最初の 4 週間と、その先）

目的: **Spatial Engine を先に完成させる**。表示（AIRR）が高いことを開発停止の理由にしない（チャット回答 65 §33）。

## 0. 手持ち機材の使い方

- 本人の手持ちプロジェクター（センサー付き）: Gen1 表示出口として使う。自動台形・オートフォーカスを切り、HDMI ゲームモード。1,000 lm 以上なら 2×1.5 m の壁で 300 lux。
- Node は市販部品で「Node 相当」を組む: Raspberry Pi 5 ＋ GS カメラ（Raspberry Pi Global Shutter Camera 1456×1088、IMX296、最大 60 fps）＋ 850 nm LED ＋ USB レーダー評価ボード。120 fps は本番センサー待ち。**フレーム同期は GPIO トリガー線で**（PTP は後）。
- Hub: 手持ち PC（NVIDIA GPU）で可。Jetson は Week 3 以降。

## 1. 4 週間

| 週 | 目標 | 成果物 | 受入 |
| --- | --- | --- | --- |
| 1 | Node 相当 ×2 を組み、GPIO 同期で 60 fps 同時露光。2D 姿勢（RTMPose）を 2 視点で動かす | `systems/rock-star-os/experiments/mii-spatial/` に取り込み＋2D | 2 視点の露光 skew ≤ 1 ms（LED ストロボで実測） |
| 2 | 校正（反射球ターゲット）→ 三角測量 → 3D 骨格。Demo 1 | 校正ツール、fusion の最初の版 | T-8 相当（再投影 ≤ 2 px）、Demo 1 の動画 |
| 3 | 頭追跡パイプライン → ViewerPose → 手持ちプロジェクターで運動視差（Demo 4） | render-service の最初の版（Three.js off-axis） | D-1 の実測値を記録（目標 ≤ 50 ms、この段階では未達でよい） |
| 4 | Node 4 本相当（Pi ×4）。Demo 2・3（遮蔽）。本人評価 D-4 の最初の試行 | 報告書 docs/mii/gen1-prototype-report.md、動画 | Demo 1–4 が動く |

## 2. その後（2–6 ヶ月）

| 段階 | 内容 |
| --- | --- |
| EVT | 本番センサー（OG02B1B 120 fps）＋MCU 基板の Node V1 ×4、PoE＋PTP、Jetson Hub。T-1〜T-8、D-1〜D-7 を実測 |
| 光学 | AIRR 30 cm モジュール 1 個を部品から設計、RFQ 5–10 社（task 20）。共有 Light Engine の光学試作 |
| 筐体 | Column の意匠試作（黒い柱＋薄ベース）、Puck/Slot の金具 |
| DVT | 10 台ロットで出荷検査票（N-1〜N-8）。眼安全・電波の予備試験 |
| 建築 | 1 軒に Puck/Slot を埋め込む実例（PDF の世界観。docs/structure/05 の Q3） |

## 3. 置き場所（リポ）

- 実験コード: `systems/rock-star-os/experiments/mii-spatial/`（capture, calib, fusion, viewer, render）。
- 設計書: `docs/mii/design/`（本書）。更新は日付付き節で追記。
- hardware profile: `systems/rock-star-os/targets/mii/`（task 22）。
- Codex task: 20（部品調査）、21（運動視差試作）、22（profile）。本書の各章が task の入力。

## 4. 本人が決めること（試作前）

1. Week 1 の部品購入（Pi 5 ×4、GS カメラ ×4、850 nm LED、レーダー評価ボード ×1〜2、反射球）— 候補と入手先は task 20 の最初の成果物。
2. 試作する部屋（ブルックリン）の実寸と、基準壁をどれにするか。
3. Gen2 の光学試作を Week 4 後に始めるか、EVT と並行するか。
