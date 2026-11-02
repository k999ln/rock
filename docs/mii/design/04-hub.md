# 04 Hub

## 1. 役割と二層構造

```text
                         HUB
┌───────────────────────────────────────────────┐
│ REALTIME DOMAIN（常時・120Hz・独立プロセス群）      │
│  capture · sync(PTP master, trigger) · radar     │
│  audio · 2D pose · head/eye · 3D fusion · room   │
│  → SpatialFrame を shared-memory ring に置く      │
├───────────────────────────────────────────────┤
│ AI / OS DOMAIN（非同期）                          │
│  RockstarOS runtime（identity · permission ·     │
│  Work/Job/Receipt · sync）· Eve · Noa · AMC · Jev │
│  local LLM · Vision-language · Game runtime      │
│  Wallet · Display scene                          │
└───────────────────────────────────────────────┘
```

REALTIME は AI/OS が重くても止まらない。CPU コアと GPU の割当を分ける（cgroup / GPU partition）。

## 2. 演算要求（4 Node、基準部屋）

| 処理 | 負荷 | 備考 |
| --- | --- | --- |
| 映像取り込み | 4 × (960×640×120fps + 頭 ROI 320×240×120fps + RGB 1080p×60fps) | 1GbE ×4 → Hub 側 2.5/10GbE or 4 ポート |
| 2D 姿勢（全身 133 点） | 4 視点 × 60 Hz、軽量モデル（RTMPose/ViTPose-small 級）、**INT8 で 1 視点 3–5 ms** | GPU 推論 |
| 頭ランドマーク | 4 視点 × 120 Hz、ROI 入力、1 視点 <1 ms | 別パイプライン |
| 三角測量＋骨格ソルバ | CPU、<2 ms | |
| レーダー処理 | CPU/DSP、4 Node TDM | |
| 音声（8ch ビームフォーミング＋ウェイクワード「ヘイ、エヴァ」） | CPU/NPU | |
| 描画（Gen1 投影 1–2 台、4K 120Hz） | GPU | REALTIME 側に置く（ViewerPose 直結） |
| local LLM（Qwen3 小型〜中型） | GPU/NPU、非同期 | AI/OS 側 |

→ **Home Hub**: Jetson Orin NX 16GB 級（100 TOPS、25 W）＋ 4 Nodeの現stream予算を収容する10GbE等の集約経路。PoE/表示port/SSD/冷却はcarrier全体で選定し、SoC名から確定しない（15章）。
→ **Pro Hub**: x86＋RTX 級 dGPU（avokado Pro と基板共通）、10GbE、HDMI ×4。local LLM 大、8 Node。

## 3. I/O

| ポート | 数 | 用途 |
| --- | --- | --- |
| RJ45 PoE+ 給電（802.3at） | 4（Pro 8） | Node。PTP ハード時刻スタンプ対応 PHY |
| HDMI 2.1 / DP | 2（Pro 4） | Gen1 投影エンジン。Gen2 は Display Bus（06 章） |
| Sync out（3.5 mm or RJ45） | 1 | 投影エンジンの V-sync / 外部機器 |
| USB-C | 2 | 保守、試作時のカメラ直結 |
| Wi-Fi 6 / BT | 内蔵 | 本人のスマホ（eSIM 経由の account）、照明制御、リモコン |
| WAN | RJ45 ×1 | RockstarOS cloud。衛星回線はオプション（docs/avocado-mini-r5/satellite-hardware-trial-plan.md） |
| ストレージ | NVMe 1 TB | Room Model、本人の校正、Receipt の cache。生映像は保存しない |

## 4. 熱・設置

- 消費: Homeの仮演算25W＋Node 4×12W = **73Wは末端負荷の小計**。switch/carrier/変換・配線損/表示を加えてAC入力を実測する。旧45WはNode予算と不一致のため不使用。Pro 250Wも演算部の仮置きで、Nodeと損失を別計上する（15章）。
- 置き場所: 分電盤脇・テレビ台裏・天井裏。**見えない場所**（PDF の世界観）。ファンあり（Node と離れているのでマイクに影響しない）。
- 筐体: 250 × 200 × 60 mm（Home）。壁掛け金具。

## 5. 起動・回復

- 起動 ≤ 20 s で REALTIME が立ち上がり、校正済みなら追跡開始。AI/OS はその後。
- 電源断からの復帰で Room Model・校正・本人の体型プロファイルは NVMe から復元。
- account に紐づくもの（Eve の文脈・Job・Wallet）は cloud が正本、Hub は cache（docs/structure/02 §3）。
- Hub交換: accountで再認証→Node再ペアリング→room/device配置/版に束縛した校正recordを読戻す→配置と精度を確認。SEは鍵/同一性の保護に使い、校正全量の保存場所とは仮定しない。Node移動/交換時は再校正する（14章）。

## 6. 1 本構成の Hub

Node 1 本＋小型 Hub（Jetson Orin Nano 級、PoE 1 ポート）を「mii Solo」とする。追跡は 1 視点（09 章）。製品としては Hub を共通にして Node を後から足せる方が良いので、**Home Hub を 1 種類**にし、Solo は Node 1 本＋Home Hub の構成名にする。

## 2026-11-02 — 共通OSと部品選定境界

Hubの業務契約は[14章](14-common-os.md)の共通OS。CPU/GPU分離・120Hz・4K出力・local LLM併用は構成を選び実測する目標であり、候補SoCの製品仕様保証ではない。Hubに入れるOSを別製品として作らず、I/O・資源・表示だけをprofileで指定する。
