# 20 mii 構造の部品調査 — Tower / Hub / 表示層（価格は決めない）

正本: docs/structure/01-mii.md。出典: 「3Dプロジェクション技術説明」チャット（本人保管）、docs/avocado-mini-*。

## やること（成果は docs/mii/ 配下、各 1 ファイル）
1. `docs/mii/tower-components.md`: Tower 1 本の部品候補。global-shutter / NIR camera（fps・解像度・価格帯）、IR 照明、mmWave レーダー（部屋形状・人体の候補）、ハード同期（trigger line / PTP）、MCU、secure element、温度・電源監視。各 3 候補、メーカー・型番・公開価格・入手先 URL。
2. `docs/mii/hub-compute.md`: Hub の演算候補 3 段（Jetson Orin 級 / x86 mini PC / Pro と共通の基板）。4 カメラの 3D fusion ＋ 頭追跡 ＋ local LLM（Qwen3 小型）を同時に回す要求を数字で置く（fps、ms、W）。
3. `docs/mii/display-tier-a.md`: Tier A（運動視差プロジェクション）の光学エンジン候補。pico projector module（Full-HD LCD/DLP engine、$40〜50 クラス）、明るさ（lm）、投影距離、床投影の歪み補正。完成プロジェクターを買う案との比較。
4. `docs/mii/display-tier-b-c.md`: AIRR（display source → beam splitter → retroreflector → Fresnel）の 30〜50cm module の部品候補と、「4 光学ヘッド＋共有 Light Engine（時分割 240Hz）」案の実現性。Fresnel 1m 級 PMMA の OEM 価格例、retroreflector film、beam splitter film。**原価の合計は書かない**（本人が後で RFQ を投げる）。
5. `docs/mii/calibration.md`: 4 Tower の相互キャリブレーション手順（施工時／引越し時）、必要なターゲット、所要時間の目標。
6. `docs/mii/enclosure-three-forms.md`: Column / Puck / Slot の各筐体に必要な IP 等級、電源（PoE か AC か）、冷却、施工上の寸法制約（天井厚、壁厚）。PDF Issue01 の寸法感を参照。
7. 各ファイル末尾に「本人が決めること」を箇条書き。

## 合格条件
- 6 ファイル。全候補に出典 URL。
- 「価格を決める」文が 1 つもない（候補の公開価格の列挙は可）。

## やらないこと
- ロット単価・工場選定・発注。

## 入力

設計書 docs/mii/design/ の 03（Node）、04（Hub）、05（表示）、12（BOM 構造）を入力にする。候補の型番と公開価格を 12 章の表の「候補」列へ書き戻す。
