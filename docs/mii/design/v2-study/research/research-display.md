# 裸眼3D／空中像／ボリューメトリック表示技術 市場調査（2026-11-05 時点）

目的：「ホログラムテーブル」（机上に3D物体が浮き、周囲を歩いて回れ、指で指し、ズームできる）および「部屋スケール没入空間」（眼鏡・ゴーグル・フォグ無し）をハード設計する前提で、2026年に**実際に買えるもの**・見え方・限界・実売価格を整理する。
価格は調査日に確認できたページの表示値。「不明」は公開情報が見つからなかったもの。通貨は出典のまま。

凡例：視点＝同時に正しい立体像を見られる人数／方向。「2D浮遊」＝像は空中に見えるが平面（視差なし）。

---

## 1. ライトフィールド（レンチキュラー多視点／視線追跡型）

| 製品/技術 | 何が見える（視点・サイズ・色・輝度） | 限界 | 単価 | ロット/OEM | 出典URL |
|---|---|---|---|---|---|
| Looking Glass 16" Light Field Display | 15.6″ 4K OLED（3840×2160）、45〜100視点を同時生成、最適視野角 53°（全体 150°）、60 Hz、10億色、視距離 1 ft〜。フルカラー、多人数同時視聴可（視野角内） | 像は**パネル面の前後数cm〜十数cm**に見える「窓」型。横方向の視差のみ（上下視差なし）。53°外では像が破綻。歩いて裏側へ回ることは不可 | US$4,000（定価）→ セール US$3,000 | 単品販売（公式ストア／ChannelXR）。OEM価格は非公開（sales へ問合せ） | https://lookingglassfactory.com/product-overview , https://channelxr.com/products/looking-glass-16in-light-field-display , https://www.jonpeddie.com/news/glasses-free-3d-visualization-pick-your-monitor-size/ |
| Looking Glass 27" Light Field Display（2025年4月発表） | 27″ 5K（5120×2880）、45〜100視点、視野角 53°、縦横両対応。多人数可 | 同上（横視差のみ、面前後の浅い奥行き）。2026-11時点で公式ストアは Sold out 表示 | US$10,000（早期予約 US$8,000） | 数量注文は Contact Us フォーム。OEM価格非公開 | https://checkout.lookingglassfactory.com/products/27-lightfield-display , https://petapixel.com/2025/04/17/new-27-inch-looking-glass-light-field-3d-display-is-its-most-powerful-yet/ |
| Looking Glass 32" Spatial Display | 32″ 8K（7680×4320）、45〜100視点、視野角 53°。駆動に 2×DisplayPort で 8K 出力できる GPU が必要 | 同上。価格非公開（要見積） | 不明（sales@lookingglassfactory.com へ） | 要見積 | https://looking-glass.helpscoutdocs.com/article/310-how-much-does-the-32-spatial-display-cost , https://www.jonpeddie.com/news/glasses-free-3d-visualization-pick-your-monitor-size/ |
| Looking Glass 65" | 65″ 8K（7680×4320）、最大100視点、最適視野角 53°、視距離 1 ft〜∞、本体 1462×843×82 mm、48.2 kg | 同上（最大級だが「窓」型）。価格非公開 | 不明（要見積） | 要見積 | https://checkout.lookingglassfactory.com/products/looking-glass-65 |
| Looking Glass HLD（Hololuminescent Display）16"/27"/86"（2026年5〜9月出荷予定） | 「固定ホログラム・エッチング背景＋4K/FHD 2D画面」。視線追跡不要、1人でも数十人でも同じに見えると謳う。16″=FHD、奥行き 1.7 cm；27″=4K、2.2 cm；86″=4K、約5 cm | 奥行きは**物理的に 1.7〜5 cm**。多視点視差を持つライトフィールドではなく、2D映像を固定ホログラム層に重ねる方式。製品写真に3D眼鏡装着者が写っており、眼鏡要否の明記なし | 16″ US$2,000／27″ US$4,000（表記揺れ：$2,000–4,000）／86″ US$20,000 | 2″〜200″ の特注可、ボリューム・特注は sales へ | https://lookingglassfactory.com/hld-overview |
| Sony Spatial Reality Display ELF-SR2 | 27″ 4K（3840×2160）、400 cd/m²、視線センサーで**1人**の両眼位置に合わせてレンチキュラー描画。視距離 50〜100 cm、視野角 水平±25°・垂直 −40°/+20°。フルカラー、実像的な飛び出し感は強い | **同時に立体視できるのは1人**（2人目は「切替」で交互視聴のみ）。ITmedia も「1人だけでしか使えず」。推奨 PC：RTX 2070 SUPER 以上。歩いて回ることは不可（視野角外で破綻） | US$5,000（発表時、3年保証）／市場実売 US$4,750（AVI-SPL）／日本 市場推定 55万円（税込、2023年6月発売） | B2B販路（Sony Pro）。OEM価格不明 | https://www.sony.co.jp/en/Products/Developer-Spatial-Reality-display/manual/ja-jp/recommended-pc-specs/ , https://shop.avispl.com/products/sony-elf-sr2-27-inch-4k-spatial-reality-display , https://av.watch.impress.co.jp/docs/news/1491196.html , https://www.itmedia.co.jp/pcuser/articles/2305/13/news063.html , https://www.bhphotovideo.com/c/product/1761839-REG/sony_elf_sr2_27_4k_spatial.html |
| Leia Inc（現 Immersity）／Lume Pad 2、ZTE nubia Pad 3D | 12.4″ 2.5K タブレット、スイッチャブル・レンチキュラー＋視線追跡。1人向け。Leia は 2024年に Immersity へ社名変更しソフト（2D→3D変換 AI）とライセンス中心へ | 1人向けの小型パネル。テーブル型・部屋型には不適。2026年の新ハード情報は確認できず（Lume Pad 2 の継続販売状況 不明） | Lume Pad 2：US$1,099（2023）。nubia Pad 3D II：不明 | ライセンス事業（ZTE 等）。価格不明 | https://liliputing.com/this-1099-android-tablet-has-a-12-4-inch-glasses-free-3d-display/ , https://immersity.ai/company |
| 同系統の裸眼3Dモニタ（Samsung Odyssey 3D G90XF 27″、Lenovo ThinkVision 27 3D、Acer SpatialLabs View Pro 27） | いずれも 27″ 4K、視線追跡＋レンチキュラー、**1人視聴**。Lenovo：3D時 片眼 1920×2160、310 nit、€2,999。Acer：400 nit、価格未確定。Samsung：米国 US$1,700〜2,000 と報道 | 1人専用。机上の飛び出しは数〜十数 cm | Lenovo €2,999／Samsung 約 US$1,700–2,000／Acer 不明 | 量販品（OEM不可） | https://tftcentral.co.uk/news/lenovo-launch-thinkvision-27-3d-monitor-with-glasses-free-3d-and-4k-resolution , https://www.etcentric.org/?p=191728 , https://tftcentral.co.uk/news/acer-announce-new-spatiallabs-view-pro-27-3d-display-with-27-4k-160hz-panel |
| Brelyon Ultra Reality Extend／Ultra Reality Mini（CES 2026） | 「ヘッドセット無しの没入モニタ」。Extend：30″ ベゼルの開口から、0.7〜2.5 m 後方に最大 122″ 相当の湾曲仮想画面（OLED、4K60、8K対応、1-bit 単眼深度）。Mini：16″ 開口、86° FOV、約1 m 後方に 55″ 相当 | **1人用の覗き込み型**（「personal immersive bubble」）。像は画面の**奥**に見える（手前に浮かない）。テーブル型には不適 | 不明（Mini は 2026-01 から予約受付、価格非公開；Extend は企業向け、非公開） | 企業向け直販。日本は丸文が取扱（価格非公開） | https://www.auganix.org/?p=17988 , https://3dnews.ru/1116459 , https://www.marubun.co.jp/info/2025/57993 |

---

## 2. スウェプトボリューム／ボリューメトリック、ホログラムファン

| 製品/技術 | 何が見える（視点・サイズ・色・輝度） | 限界 | 単価 | ロット/OEM | 出典URL |
|---|---|---|---|---|---|
| Voxon Photonics VX2（voxel3d.co） | 直径 25.6 cm × 高さ 25.6 cm の円筒空間に**真の3D像**（800万ボクセル／巻、30 volumes/s）。**360° 全方向から何人でも**、上から覗き込める。スウェプトボリューム LED 方式。6DoF コントローラ同梱 | 像は**筐体ガラス内**にあり机上の空気中には出ない。空間 25 cm と小さい。輝度・色数の公式値は不明（VX2-XL は「1,600万色ボクセル」と記載）。半透明でオクルージョン無し（奥が透けて見える）。回転機構＝騒音・摩耗 | US$6,800（送料・税別、約100万円） | 単品、納期 10〜12 週。カスタム機は要相談 | https://voxel3d.co/ , https://gigazine.net/gsc_news/en/20241218-voxon-3d-volumetric-hologram/ , https://www.notebookcheck.net/Voxon-VX2-brings-major-upgrades-to-hologram-display-technology.889726.0.html |
| Voxon VX2-XL | 直径 51.2 cm × 高さ 25.6 cm、20 volumes/s、最大1,600万色ボクセル、360° | 同上（筐体内）。高さは 25.6 cm のまま | 不明（要見積） | 要見積、納期 10〜12 週 | https://voxel3d.co/ , https://80.lv/articles/voxon-shipped-vx2-xl-world-s-largest-3d-volumetric-display |
| HYPERVSN SmartV Solo M／Solo L（LED ホログラムファン） | 回転 LED ブレードによる **2D 浮遊像**（黒背景で切り抜き映像が宙に浮いて見える）。Solo M = 22″/56.7 cm、Solo L = 30″/75 cm、最大 3,000 nit。壁面タイル化（SmartV Wall）可 | **立体ではない**（視差なし、裏から見ると左右反転）。回転ブレードの安全柵・騒音、暗背景必須。像面は固定 | Solo M：€3,076.56（visunext.de）／Solo Classic 75（旧型, EOL）：€2,866.90 ＋ レンタル €72.64/月。CloudPro サブスク別 | 公式ストアは価格非公開（フォーム）。欧州代理店で単品購入可 | https://www.visunext.de/p/hypervsn-solo-m-holo-display-1000011243 , https://www.officeeasy.fr/helice-holographique-hypervsn-solo-classic-75.html , https://hypervsn.com/smartv-solo |
| 中国製ホログラムファン（Alibaba） | 100 cm ファン：1600×1024、約5,000 lux。65 cm 2×3 スプライシング（6枚で壁）：「4K」表記 | 同上（2D 浮遊、ブレード安全性、表記スペックの揺れ大） | 100 cm：US$330（1–9）→$310（10–29）→$290（30–49）→$270（50+）。65 cm スプライシング：US$1,500（1–49）→$1,400（50–99）→$1,300（100–999）→$1,200（1,000+） | MOQ 1。ロゴ・梱包カスタムは 100〜500 個から | https://www.alibaba.com/product-introduction/hologram-3D-fan-advertising-display-100cm_1600950247121.html , https://www.alibaba.com/product-introduction/High-Resolution-65cm-2X3-Splicing-Fan_1600790854654.html |
| ホログラム機材の市場相場（参考） | ファン・レンタル €300–500/日、HoloBox €1,500–5,000/イベント、ホロウォール €3,000–12,000/イベント、業務機購入 €1,500–15,000 | — | 上記 | — | https://www.hologramme.co/blog/how-much-does-a-hologram-cost |

---

## 3. AIRR／空中結像プレート（再帰反射＋ビームスプリッタ、ASKA3D、Parity Mirror）

原理メモ：ASKA3D・Parity Mirror は二面コーナーリフレクタ・アレイ（DCRA）系、AIRR は再帰反射シート＋ハーフミラー。いずれも**ソース画面とプレートに対して面対称の位置に実像**を結ぶ（浮遊距離＝画面〜プレート距離）。ソースが 2D 画面なら像も 2D 平面（視差なし）。ソースを立体（Voxon 等やレンチキュラー）にすれば空中3D像になるが、見える角度はプレートの受光角で制限される。

| 製品/技術 | 何が見える（視点・サイズ・色・輝度） | 限界 | 単価 | ロット/OEM | 出典URL |
|---|---|---|---|---|---|
| Asukanet ASKA3D-Plate（ガラス製）200／310／420／630／840／1050 | 光学ガラス積層をスライスした DCRA。200×200×5.9 mm（525 g、推奨 7″画面）〜1050×1050×9.0 mm（23.5 kg、推奨 32〜37″画面）。表示可能像はプレート面積の約70%。フルカラー、空中に**ガラス無しの実像** | 像は 2D 平面（ソースが2D）。像が正しく見える角度域は限られる（斜め方向から覗く設計）。輝度低下あり。ガラス大型は手作業的製法で高価 | 公式は全サイズ「要見積」。過去に「大型ガラス 1枚約100万円」と言及（株主ノート）。 | 筐体・画面・PC・センサー別売。ユニット品：KC-310G（12.1″）、KC-420G（15.6″）、研究開発用 KC-W1（7″）価格非公開 | https://aska3d.com/ja/aska3d-200.html , https://aska3d.com/ja/aska3d-1050.html , https://aska3d.com/ja/aska3d-unit.html , https://note.com/aska3d_news/n/n1796f0af9bde , https://pub-mediabox-storage.rxweb-prd.com/exhibitor/products/exh-37fb7a89-8fd8-4b42-9cb6-9b0be0ff746d/product-documents/pro-4e193ea0-708c-41f3-a966-4efff1f91a0a/c0cec78e-bc86-4d76-b287-1a960eb8f72d.pdf |
| Asukanet ASKA3D-Plate（樹脂製）200NT／250NT | 200×200×6.3 mm（7″）、250×250×6.3 mm（10″）。ミラー密度が高く精細。量産立上げ時 月産 3,000〜7,000 枚想定（2021） | 最大 250 mm と小さい。2026-03 に中国 Yesar と現地生産準備開始＝**本格量産はまだ**。公式価格非公開 | サンプルは「数万円/枚」との記述。量産時 1 枚 約4,000〜5,000 円（株主ノートの推定、公式値ではない） | ライセンス（イニシャル＋売上ロイヤリティ）形態を 2026-03 発表 | https://www.asukanet.co.jp/contents/news/2021/20210308.html , https://www.asukanet.co.jp/contents/ir/pdf/2026/20260306-2.pdf , https://note.com/aska3d_news/n/n1796f0af9bde |
| Asukanet 完成品「浮空ライブステージ 匠」（2025-12 発表） | 高さ約 2 m の筐体で等身大級キャラを空中表示。商業施設の受付・IP プロモ向け、年10台目標 | 受注生産、1 視点方向前提 | 約 500万円〜 | 受注生産 | https://news.mynavi.jp/techplus/article/20251225-3869465/ |
| Parity Innovations Parity Mirror（NICT 特許、樹脂成形） | 凸レンズ＋平面鏡の性質を持つ樹脂光学素子。背後の物体・画面の実像を空中に結像。非接触タッチ UI 用途 | 樹脂のため反射率・コントラストはガラス DCRA に劣る（遮光マスク必要）。公式価格・サイズ表非公開。量産パートナー募集中（2024） | 15 cm 角サンプル 約25,000円、量産目標 10 cm 角 約1,000円（いずれも2次情報） | 要問合せ | https://thebridge.jp/2024/05/parity-innovations-05event-mugenlabo-magazine , https://note.com/aska3d_news/n/n1796f0af9bde |
| Alibaba の空中結像（aerial imaging）モジュール | 「holographic touch screen」「air hologram」等の名目で透明スクリーン投影・ペッパーズゴースト箱が多数。**DCRA/AIRR プレート単体の出品は確認できず** | 名称が「hologram」でも実際はペッパーズゴースト／透明 LCD が大半 | 不明（該当品を特定できず） | 不明 | https://www.alibaba.com/showroom/holographic-touch-screen.html |
| 再帰反射シート（AIRR 自作用）：エンジニアグレード・マイクロプリズム（Alibaba） | PVC/PET、EGP（Engineer Grade Prismatic） | AIRR の像品質はシートのビーズ／プリズム精度に直結。エンジニアグレードは拡散大＝像がぼける。3M Diamond Grade 4090（24″×50 yd ロール）はサインサプライで販売、価格は要問合せ | **US$3.66〜4.20 /m²** | MOQ 100 m² | https://www.alibaba.com/product-introduction/Microprism-EGP-Reflective-Film-Reflective-Vinyl_1600924067291.html , https://www.egrimesdirect.com/products/3m-4000-4090-24x50 |
| ビームスプリッタ（ハーフミラー）フィルム | 片面ミラー窓フィルム（VLT 30〜40%）：US$41.8〜49.5/ロール（幅不明）。ペッパーズゴースト用「phantom imaging」PET フォイル：幅 3〜8 m、MOQ 90（単位不明、小計 US$3,066.30 → 約 US$34/単位） | 窓用フィルムは 50:50 ではなく反射率不明。光学用 50/50 ガラスは大判で高価 | 上記 | 窓フィルム MOQ 1 ロール | https://www.alibaba.com/product-introduction/Multi-size-One-Way-Mirror-Window_60592224183.html , https://sourcing.ship4wd.com/product/3-8-m-phantom-imaging-projection-film-high-transparent-large-stage-product-display-45-degree-positive-projection-3d-stereo-effect |
| ホログラフィック背面投影フィルム（透明スクリーン） | 透過率 85%、ガラス面に貼って透明投影 | 2D 投影（浮遊感はペッパーズゴースト構成でのみ） | US$50/m²（3–7 m²）→$45（8–44 m²）→$30（45 m²+） | MOQ 1 枚（1 m²〜、特注寸法） | https://www.alibaba.com/product-introduction/High-Contrast-Rear-Projection-Film-Transparent_60742946593.html |

---

## 4. 真のホログラフィック（位相変調／ライトフィールド高密度）

| 製品/技術 | 何が見える（視点・サイズ・色・輝度） | 限界 | 単価 | ロット/OEM | 出典URL |
|---|---|---|---|---|---|
| Light Field Lab SolidLight（Surface Panel／Volumetric） | 28″ パネル 1 枚あたり約25億画素（約100億画素/m²）、タイル化して任意サイズ。ヘッドセット・視線追跡不要で**実像が面の前方に飛び出す**と主張。2024-12 に SETI と「宇宙人ホログラム」デモ、「SolidLight Volumetric は受注開始、2025 年納入開始予定」 | **2026-11 時点で納入実績・価格・一般展示の確認が取れず**（最新の公式発信は 2025 年分まで）。受注生産＋専用メディアサーバ。視野角・飛び出し距離の公開値なし。総資金 US$85M（Series B $50M、2023） | 不明（非公開） | 受注生産、一般販売なし | https://getcoai.com/news/light-field-lab-unveils-holographic-displays-that-dont-require-eyewear , https://www.ravepubs.com/light-field-lab-solidlight-holographic-display-platform/ , https://yespress.io/light-field-lab-inc.md |
| VividQ（英、計算ホログラフィ） | SLM（LCoS/DMD/PLM）に干渉パターンを描き、レーザー/LED 照明で多焦点ホログラム。JVCKenwood 等と複数年パートナーシップ、対象は AR/VR ヘッドセット・車載 HUD・家電 | **自社製品なし**（IP・ソフトのライセンス）。大型テーブル用途の製品は存在しない。追加 Series A US$7.5M（累計 US$30M+、2024） | 不明（ライセンス） | B2B ライセンスのみ | https://www.photonics.com/Articles/VividQ_Secures_75M_to_Commercialize_Holographi/a70257 |
| Swave Photonics HXR（ベルギー、ホログラフィック SLM チップ） | 位相変調ピクセルが通常の 1/170 サイズ、最大 64 ギガピクセル、60 PPD。主用途は AR グラス。壁サイズのボリューメトリックも「検討中」 | **チップのみ**、自社製品は出さず、2026 年「消費者向け登場も」は製造パートナー次第。CES 2025/2026 Innovation Award。BOM 目標「片眼 US$50」 | 不明（チップ価格非公開） | B2B（部材） | https://www.digitaltrends.com/computing/swave-holographic-ar-glasses/ , https://www.businesswire.com/news/home/20251105283360/en/Swave-Photonics-Honored-with-CES-2026-Innovation-Award-for-Groundbreaking-Holographic-eXtended-Reality-Spatial-Light-Modulator |

---

## 5. 頭部追跡視差／CAVE 系（※いずれも眼鏡を使う）

| 製品/技術 | 何が見える（視点・サイズ・色・輝度） | 限界 | 単価 | ロット/OEM | 出典URL |
|---|---|---|---|---|---|
| Axiom Holographics Hologram Table（旧 Euclideon） | 2.16 m 角テーブル（表示面 1.27 m 角）。像はテーブル上 約50 cm／内側 1 m 以上。**追跡 3D 眼鏡**＋3D ワンドで**2 人が独立視点**で操作、コビューワ眼鏡で最大 4 人が追加視聴（計 6 人）。明室可、Delta プロジェクタ＋標準 PC | **眼鏡必須**（要件「no glasses」に不適合）。直射日光・強い天井照明で劣化。上から見下ろす用途向け | 非公開（構成見積）。2017 年の初号機想定価格 US$47,000（4 人同時） | ターンキー、設置・訓練込み | https://axiomholographics.com/devices/hologram-table/ , https://www.archdaily.com/878348/the-worlds-first-hologram-table-is-here-and-could-be-yours-for-47000-dollars |
| Axiom Hologram Room | 5 m × 2.9 m × 奥行 4.5 m の自立暗室、投影面 2 m × 5 m 台形。業務用：1 名主操作＋最大 6〜7 名共有。娯楽用：最大 5 名/セッション（ミニ体験は 1 名） | **3D 眼鏡必須**。暗室。1 体験 1 名の制約 | 非公開 | ターンキー | https://axiomholographics.com/devices/hologram-room/ |
| Visbox VisCube CAVE | 4〜6 面背面投影 CAVE、アクティブ/パッシブ立体眼鏡＋頭部追跡 | 眼鏡必須、1 名の追跡視点が正解（他は歪む）。設置・空調コスト大 | 不明（要見積）。参考：CAVE 一般に「US$1〜2M 超」（Igloo 白書）、UIC CAVE2 の NSF 補助 US$701,815 | 受注 | http://www.visbox.com/products/cave/ , https://www.igloovision.com/Documents/Igloo%20vs%20CAVE%20white%20paper%20final.pdf , https://grantome.com/grant/NSF/CNS-0959053 |
| Igloo Vision シリンダー／キューブ／ドーム | 標準 6 m シリンダー（360/300/240/180°、高 2.67 m）、12 人程度、12508×1200 px（UQ 事例）。基本は **2D パノラマ前面投影**、3D はアクティブ眼鏡＋3D 対応プロジェクタのオプション。ドーム 6〜21 m、キューブ 2.5〜3 m | 標準は 2D（立体感なし）。3D 化すると眼鏡必須。頭部追跡は追加モジュール | 公式非公開。白書「エントリーは US$100,000 を十分下回る、CAVE の 5〜10%」。寄贈事例：22.5 ft 径シリンダーで US$90,000 相当（Texas A&M、2023） | 受注 | https://www.igloovision.com/products/cylinders-and-cubes , https://www.igloovision.com/Documents/Igloo%20vs%20CAVE%20white%20paper%20final.pdf , https://pvfa.tamu.edu/news/2023/04/19/exxonmobil-donation-brings-immersive-igloo-cylinder-to-school-of-performance-visualization-and-fine-arts/ , https://adp.uq.edu.au/igloo-360-specs |
| zSpace Inspire 2（教育向け AR/VR ラップトップ） | 専用 3D 画面＋頭部追跡（**マーカー付き受動眼鏡**）＋スタイラス。1 人用 | 眼鏡必須、1 人用、小画面 | 目標 US$1,500（教育/企業向け、2019 報道）。2025 年の Inspire 2 価格は非公開 | 教育チャネル | https://www.3dtested.com/news/zspace-laptop-specs-pricing,38279.html |

---

## 6. レーザープラズマ空中描画（Aerial Burton／Fairy Lights）

| 製品/技術 | 何が見える（視点・サイズ・色・輝度） | 限界 | 単価 | ロット/OEM | 出典URL |
|---|---|---|---|---|---|
| Burton Inc.「Aerial 3D／Aerial Burton」 | 高出力レーザーを空中集光し空気をプラズマ化、約 50,000 点/秒、10〜15 fps で**何も無い空中に点描の 3D 像**。デモは**緑単色**、RGB 合成で多色化は「可能」との主張。360° どこからでも見える真の空中像 | 点数が少なく線画レベル、破裂音・オゾン発生、**高出力レーザーの集光点は人体に危険**（触れる設計不可）。2011〜2015 年のデモ以降、製品化・販売・2020 年代の活動を確認できず（事実上休眠） | 不明（製品なし） | なし | https://www.guru3d.com/story/true-3d-technology-emits-50000-dots-in-3d-space/ , https://blair-neal.gitbook.io/survey-of-alternative-displays/experimental-other/plasma-combustion |
| Fairy Lights（落合ら、フェムト秒レーザー、2015） | 数 mm 角の触れられるプラズマ・ボクセル、約 22 dB のポップ音 | 像サイズ数 mm〜cm、研究実証のみ | 不明 | なし | https://blair-neal.gitbook.io/survey-of-alternative-displays/experimental-other/plasma-combustion |

---

## 7. 空中ハプティクス（超音波）／ハンドトラッキング

| 製品/技術 | 何が見える／何が触れる | 限界 | 単価 | ロット/OEM | 出典URL |
|---|---|---|---|---|---|
| Ultraleap（会社の 2026 年状況） | 2024-06 大規模リストラ・分割方針 → 2025-11-11 音楽テック ROLI が買収（Tom Carter が ROLI CTO）→ **2026-10-19 Ultraleap Limited が管財（administration）入り**、RSM が管財人、資産・IP 売却交渉中 | ハプティクス・ハンドトラッキングとも**新規購入・サポートの継続性が不確実**。ハプティクス IP の譲渡先は未確認 | — | — | https://www.aol.co.uk/articles/bristol-touch-free-tech-firm-073600000.html , https://www.auganix.org/?p=17841 , https://roadtovr.com/hand-tracking-ultraleap-layoff-2024/ , https://www.thebusinessdesk.com/south-west/news/48577-ultraleap-bristol-administration-roli-takeover |
| Leap Motion Controller 2（ハンドトラッキング） | FOV 160°×160°、追跡距離 10〜110 cm。テーブル上で指差し・ピンチ・ズームのジェスチャ検出に十分 | RobotShop では**Discontinued** 表示（在庫限り US$217、関税込）。ソフトは Gemini/Hyperion の継続性が不透明 | US$217（在庫限り） | 単品 | https://www.robotshop.com/products/ultraleap-leap-motion-controller-2 |
| Ultraleap TOUCH Development Kit UHDK5（STRATOS Explore 後継、超音波 192 素子） | 192 トランスデューサ、221×186 mm、手の皮膚に「触感」を空中提示（圧覚・テクスチャ）。Leap Motion カメラ内蔵 | Arrow で**在庫切れ**、価格非表示。触感は弱く（数十 mN）、提示距離 ~20〜60 cm、素子上方のみ | 不明（在庫なし） | 旧梱包単位 100 | https://www.arrow.com/en/products/uhdk5/ultraleap |
| 超音波ハプティクス汎用モジュール | Ultraleap 以外の**市販モジュールは確認できず**（研究用自作：40 kHz トランスデューサ＋FPGA 位相制御が一般的） | 市販品なし | 不明 | — | （該当品なし） |

---

## 8. プロジェクター／DLP 光学エンジン

| 製品/技術 | 何が見える（輝度・解像度） | 限界 | 単価 | ロット/OEM | 出典URL |
|---|---|---|---|---|---|
| Hisense PX3-PRO（UST トリプルレーザー） | 3,000 ANSI lm、4K、80〜150″、Dolby Vision、4K/120Hz | 家庭用筐体（19.8 lb）。テーブル投影には光路改造が必要 | US$2,497.97（Amazon、2026-11-03 時点） | 量販 | https://www.compareprojector.com/ultra-short-throw-projectors , https://www.compareprojector.com/versus/hisense-px3-pro-vs-formovie-theater-premium |
| Epson EpiqVision Ultra LS800（UST 3LCD レーザー） | 4,000 lm、4K PRO-UHD、入力遅延 16.7 ms | 27.6 lb | US$2,658.47 | 量販 | https://www.compareprojector.com/ultra-short-throw-projectors |
| Formovie Theater Premium（UST ALPD トリプルレーザー） | 2,200 lm（要件 3,000 lm 未満）、4K、暗室の画質評価が高い | 輝度不足 | US$2,999 | 量販 | https://www.compareprojector.com/versus/hisense-px3-pro-vs-formovie-theater-premium |
| JMGO O2S Ultra／AWOL Vision Aetherion Max（参考） | 3,600 lm／3,300 lm、いずれも 4K UST | — | US$2,199／US$3,399（セール） | 量販 | https://www.compareprojector.com/ultra-short-throw-projectors |
| TI DLP LightCrafter Display 471TP EVM（DLPDLCR471TPEVM） | 0.47″ 4K UHD DMD（DLP471TP）＋DLPC6540＋DLPA3005、Anhua 製光学エンジン、Osram RGB LED で**約 500 lm**（4 A 時） | 500 lm は机上表示には暗い（周囲光要管理）。TI 直販はログイン必要 | US$1,198.80（ICHome、在庫 1） | 評価用単品。Anhua の量産エンジン（DF10Z50T10AS 等、4K・3Dプリンタ向け）は Anhua へ直接見積 | https://ichome.com/product-detail/texas-instruments/dlpdlcr471tpevm , https://www.ti.com/tool/DLPDLCR471TPEVM , https://www.ti.com/document-viewer/lit/html/DLPU105A/GUID-471C180B-6FAE-4C9E-8DB7-5DF9B397B31B , https://www.ti.com/tool/ANHUA-3P-DLP471TP-I |
| Alibaba DLP 光学エンジン（Xiamen Zhisen ZS 405） | 2,000 ANSI lm、1080p/4K 表記揺れ、UV LED（3D プリンタ向け）表記 | 表示用 RGB か UV かの確認必須 | US$3,000/台 | MOQ 10 | https://www.alibaba.com/product-introduction/Leading-Manufacturer-of-DLP-Light-Engine_60841661383.html |
| Alibaba DLP ピコモジュール（完成品寄り） | 300〜390 lm、720p〜4K 表記 | 低輝度 | US$385 | MOQ 1、カスタムは 1,000 個 | https://www.alibaba.com/product-introduction/best-laser-pico-projector-pico-projector_62541449316.html |
| Alibaba カテゴリ相場（同サイト集計） | 密閉型 1080p エンジン 800〜1,300 ANSI lm：US$300〜800／レーザー 4K 2,000 lm 超：US$1,000〜7,000+ | 100 台／1,000 台の段階価格は**公開ページに無く要見積**（確認できた段階価格は上記 ZS405 の MOQ 10 のみ） | 上記 | 要見積 | https://electronics.alibaba.com/product/projector-electronic-module-china |

---

## 本当に「空中に浮く・歩いて回れる・触れる」ができるもの（今日に近い順）

要件を分解：A=像が物理スクリーンの外の空気中にある、B=360°（少なくとも大きく）回り込んで多人数が同時に正しく見える、C=眼鏡・ゴーグル・フォグ無し、D=指で触れる位置に像がある（手が像を遮らない／像を突き抜けられる）。

1. **Voxon VX2／VX2-XL（US$6,800／要見積、納期 10〜12 週）** — B・C を完全に満たす唯一の購入可能品。像は筐体ガラス内（A は×、D は×）。直径 25〜51 cm。「テーブルの上のガラス円筒の中に 3D 物体が回って見える」型。ハンドトラッカーを併用すれば「指差し・ズーム」は可能。
2. **ASKA3D／Parity Mirror 等の空中結像プレート（ガラス 1 枚 〜約100万円級、樹脂サンプル数万円；量産樹脂で 4,000〜5,000 円の推定）** — A・C・D を満たす（像は本当に空気中、手を突き抜けられ、IR センサで空中タッチ可：Asukanet KC シリーズ）。ただし像は**ソースの形**＝2D 画面なら 2D 平面像で、見える角度域も限定（B は×）。ソースに Voxon やレンチキュラーを置けば「空中 3D」になるが、受光角の制約でさらに狭くなる。
3. **AIRR 自作（再帰反射シート US$3.66〜4.20/m² ＋ ハーフミラー）** — 原理は 2 と同じで大型化が安価。エンジニアグレードでは像がぼける（高精度プリズムシートは要見積）。A・C・D ○、B ×。
4. **Looking Glass 16"/27"/32"/65"（US$3,000〜10,000、32/65 は要見積）** — C ○、横 53° 内なら多人数 B △。像はパネル前後の浅い奥行き（A ×、D ×：触ろうとするとガラスに当たる）。「窓の向こうの 3D」。
5. **Sony ELF-SR2（US$4,750〜5,000／55万円）・27″ 裸眼 3D モニタ群（€2,999 等）** — 1 人専用（B ×）。飛び出し感は強いが A・D ×。
6. **HYPERVSN／中国製ホログラムファン（US$270〜3,000）** — 「浮いて見える」が **2D**（B ×、視差なし）。安価な演出用。
7. **Axiom Hologram Table／Room、Visbox CAVE、Igloo 3D オプション、zSpace** — 多人数で像がテーブル上 50 cm に浮くが**追跡 3D 眼鏡が必須**（C ×）。眼鏡を許容するなら「ホログラムテーブル」に最も近い市販品（Axiom：2 人独立視点＋4 人、価格非公開、2017 年想定 US$47,000）。
8. **Light Field Lab SolidLight** — 眼鏡無しで面の前方に実像を出す設計で、理論上 A・B・C を同時に狙う唯一の商用プロジェクトだが、**2026-11 時点で納入・価格・一般展示の確認が取れない**（受注受付中の表記のみ）。

「触れる」感覚（ハプティクス）は、Ultraleap が 2026-10 に管財入りし、UHDK5 在庫切れ・Leap Motion Controller 2 も Discontinued 表示のため、**2026 年に市販で揃えられる空中ハプティクスは事実上無い**（研究自作のみ）。ハンドトラッキングは Leap Motion 2 の在庫品（US$217）か、汎用深度カメラ＋MediaPipe 等で代替。

---

## 2026 年時点で物理的に不可能／未製品化

- **何も無い空中に、多人数が 360° から見られるフルカラー 3D 像を、安全に出す**：レーザープラズマ（Aerial Burton）は緑単色・点描・騒音・オゾン・高出力レーザーの危険があり、2015 年以降製品化の形跡なし。Fairy Lights は mm 級の研究実証のみ。フォグ・水・粒子スクリーン無しで空中に不透明な実体像を作る手段は存在しない。
- **眼鏡なし・追跡なしで、視点ごとに正しいオクルージョン（手前の物が奥を隠す）を持つ像を空中に出す**：空中結像プレートは像が半透明で手を突き抜けるが「手が像を隠す」等の相互オクルージョンは物理的に不可能。Voxon も半透明像（オクルージョン無し）。
- **真のホログラフィック大型ディスプレイの市販品**：VividQ・Swave は IP／チップのライセンスのみで製品無し。Light Field Lab は価格・納入実績が未確認（受注生産表記）。
- **大判ガラス DCRA プレートの量産**：ASKA3D ガラスは 1,050 mm が最大で 23.5 kg、価格非公開（過去「1 枚約100万円」）。樹脂は 250 mm まで、中国現地生産は 2026-03 に準備開始段階。
- **市販の空中ハプティクス・モジュール**：Ultraleap の管財入り（2026-10-19）で供給途絶、代替メーカーの市販品は確認できず。
- **数万円で買える「ホログラムテーブル」**：Looking Glass HLD 16″（US$2,000）は奥行き 1.7 cm の疑似立体、ホログラムファンは 2D。多人数・360°・本物の奥行きを満たす最安は Voxon VX2（US$6,800）。

---

### 調査メモ（出典アクセスの制約）
- Alibaba 検索結果ページ（robots 制限）と https://www.leiainc.com/news-articles/from-leia-inc-to-immersity-our-journey-of-immersive-innovation は取得不可（Leia→Immersity の社名変更詳細は未検証）。
- Visbox 公式ページは取得に失敗（価格は Igloo 白書・NSF 補助額で代替）。
- Looking Glass 32″/65″、Hypervsn SmartV、Axiom、Igloo、Brelyon、Light Field Lab、ASKA3D は公式価格を公開しておらず、本書の価格は代理店表示・報道・2 次情報。
