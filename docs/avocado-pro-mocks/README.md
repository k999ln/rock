# avocadoPro AI専用PC — 外観モック20案

2026-10-18。利用者の「NVIDIAのチップを積極的に使い、価格でも競争する」という構想を視覚化した**比較用コンセプト**。続く「Mac Studioみたいなのがいい」という好みに合わせ、低く角の丸いアルミ筐体を軸に10案を追加した。Apple製品の形状や意匠をそのまま複製する指示ではなく、avocadoPro固有の通気・状態灯・拡張の表現を検討する。下記のGPU名・構成は設計検討の目安であり、部品選定、熱設計、価格、NVIDIAとの提携、製造・販売の決定ではない。RockstarOS／Sky／Zemaの共通仕事契約とProの現状は[機種別設計](../device-support-architecture.md#shared-si-device-profiles)を参照する。

## Studio方向：今回の好みに合わせた10案

利用者の「どれも一緒だがいいね」という評価どおり、この10枚は**共通の外観言語を確認する系列**で、色・通気口・積層の差が中心。異なる製品形状10種類の比較ではない。次の筐体設計では (A) 小型単GPU、(B) 高性能単GPUで高さ・奥行きを増したもの、(C) 増設GPUを別筐体にしたもの、という3つの外形と実寸を明確に分ける。部品寸法と熱・電源を先に合わせ、好まれた角丸アルミの印象は共通に保つ。

| 案 | モック | 違い |
| --- | --- | --- |
| 11 Compact | ![11 Compact](11-studio-compact.webp) | 最小の机上サイズ。高消費電力の内蔵GPUには容積不足の可能性。 |
| 12 Performance | ![12 Performance](12-studio-performance.webp) | 高さを増し、単GPUと大きめの風路を想定。現時点の第一候補。 |
| 13 Stack | ![13 Stack](13-studio-stack.webp) | 小型本体と下部アクセラレータを積む構成。接続方式は未設計。 |
| 14 Side Gills | ![14 Side Gills](14-studio-side-gills.webp) | 側面吸気の意匠で単GPUの風量を確保する案。 |
| 15 Graphite | ![15 Graphite](15-studio-graphite.webp) | 落ち着いた濃色。大きな下部吸気帯を持つ静音志向。 |
| 16 Plinth | ![16 Plinth](16-studio-plinth.webp) | 銀色の低い本体と黒い通気台座を一体化。 |
| 17 Chimney | ![17 Chimney](17-studio-chimney.webp) | 背面側を高くして排気領域を設ける案。 |
| 18 Accelerator Base | ![18 Accelerator Base](18-studio-accelerator-base.webp) | 本体下部に別モジュールを追加。熱・接続・保守は要検証。 |
| 19 Sidecar | ![19 Sidecar](19-studio-sidecar.webp) | 横並びのGPUモジュール。外部接続帯域・安全は未検証。 |
| 20 Value | ![20 Value](20-studio-value.webp) | 広い前面メッシュと外せる上蓋を想定した価格重視案。 |

**第一候補:** 12はStudioらしい低い輪郭と、NVIDIA単GPU向けの容積を両立させやすそうな見た目。20を価格重視の比較対象、18／19を拡張案として残す。これは外観選考であり、GPU搭載可能性や排熱を証明するものではない。次は具体的なGPUカード寸法、電源、メモリ、基板、風路、騒音、部品原価を同一筐体条件で検証する。

## 初回の幅広い探索10案

| 案 | モック | 狙い |
| --- | --- | --- |
| 01 Value Tower | ![01 Value Tower](01-value-tower.webp) | 単GPU、素直な通気と交換性。価格重視の起点。 |
| 02 Desk Brick | ![02 Desk Brick](02-desk-brick.webp) | 横置きの机上PC。入口構成の省スペース案。 |
| 03 Studio Monolith | ![03 Studio Monolith](03-studio-monolith.webp) | 単体高性能GPU向けの静かな銀色筐体。 |
| 04 Serviceable Frame | ![04 Serviceable Frame](04-serviceable-frame.webp) | 部品交換・保守を外観から分かるようにする案。 |
| 05 Quiet Wood | ![05 Quiet Wood](05-quiet-wood.webp) | 建築・インテリア・音響の仕事場になじむ案。木製前面の熱・防火は未検証。 |
| 06 Creator White | ![06 Creator White](06-creator-white.webp) | 制作向けの明るい外観と見える単GPU構成。 |
| 07 Rack Node | ![07 Rack Node](07-rack-node.webp) | 法人・スタジオ向けのラック設置候補。 |
| 08 Dual GPU Atlas | ![08 Dual GPU Atlas](08-dual-gpu-atlas.webp) | 複数NVIDIA GPUの大型筐体候補。電源・排熱・model分割は未検証。 |
| 09 Modular Sidecar | ![09 Modular Sidecar](09-modular-sidecar.webp) | 本体とGPU増設筐体を分ける案。外部接続帯域・安全は未検証。 |
| 10 Flagship Factory | ![10 Flagship Factory](10-flagship-factory.webp) | 上位構成の象徴的な外観。計算bay・排熱の成立は未検証。 |

初回案は外観の探索履歴として保持する。現在の優先方向は上記Studio系10案。どの案も同じjobをlocal／cloudで使い分け、費用承認・停止・成果復旧を保つPCとして評価する。

画像は組立図・寸法図ではない。NVIDIA GPU、カード枚数、PCIe配置、PSU、風量、温度、騒音、規格適合、部品原価、量産性は別途計測と設計が必要。画像内の無銘グラフィックスカード風の形状は、特定製品の正確な外形や供給を示さない。[生成プロンプト](PROMPTS.md)。
