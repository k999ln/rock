# 天井設置「スマートパック」設計調査（工事不要・火災警報器兼用）

調査日: 2026-11-05　前提: φ150–200 mm、≤2 kg、≤30–60 W、工事なし取付、住宅用煙/熱/CO警報機能を兼ねる。
凡例: 「不明」= 今回の検索・取得範囲で一次情報を確認できなかった項目。価格は取得時点の表示値。
注: 検索回数の上限に達したため、一部（EN 54-10 の試験距離詳細、MLX90640 を使った学術論文の数値、日本の住警器年間出荷台数、国内 OEM モジュール外販の有無など）は未確認のまま「不明」としている。

---

## 1. 日本：引掛シーリング／引掛埋込ローゼット

| 項目 | 数値/事実 | 設計への意味 | 出典URL |
|---|---|---|---|
| 規格 | JIS C 8310（シーリングローゼット）。1977年改定でワンタッチ着脱の引掛式が登場、1979年に日本配線器具工業会が業界規格化（JWDS0015）。1980年代中盤以降に普及 | 1980年代以降の住宅ではほぼ標準装備。既存住宅のリプレース市場が狙える | https://ja.wikipedia.org/wiki/引掛シーリング |
| 定格 | 6 A、定格電圧 125 V（旧表記 250 V は現在非推奨）、50/60 Hz。現行製品の表記は「6A 125V」 | 100 V × 6 A = 最大 600 W。本製品の 30–60 W は余裕大。ただしローゼットの定格が器具全体の上限 | https://ja.wikipedia.org/wiki/引掛シーリング ／ https://gigaplus.makeshop.jp/tarotodenki/site/pdf/012/118.pdf ／ https://detail.chiebukuro.yahoo.co.jp/qa/question_detail/q14110734989 |
| PSE | 引掛シーリングは電気用品安全法の「特定電気用品」（◇PSE 菱形マーク対象） | 本体側の「引掛シーリングキャップ」部も配線器具として PSE 対象になる可能性が高い（下記アダプタ事例参照） | https://ja.wikipedia.org/wiki/引掛シーリング |
| 耐荷重（内線規程 3205-3） | 吊り下げ: 通常ビニルコード 3 kg 以下、補強（袋打ち）コード 5 kg 以下。直付け: ローゼット本体のみで支持 5 kg 未満（「5 kg まで」）、ツバ付き高荷重形（フル引掛/カチットP等）10 kg 以下。耳付きローゼットの金属ハンガにネジ固定で 10 kg まで。10 kg 超は不可 | ≤2 kg の本製品はどの種類でも引掛のみで支持可能（5 kg 以内）。LED シーリングライトは通常 2–3 kg | https://ja.wikipedia.org/wiki/引掛シーリング ／ https://note.com/illumica_ikegami/n/n4dfef268ce90 ／ https://gigaplus.makeshop.jp/tarotodenki/site/pdf/012/118.pdf ／ https://www.motom-jp.com/2021/01/22/引掛けシーリング・ローゼットについて/ |
| JIS 強度試験 | JIS C 8310 で 50 N（約 5 kgf）の引張に耐えること | 「5 kg」の根拠。2 kg なら安全係数 2.5 | https://note.com/illumica_ikegami/n/n4dfef268ce90 |
| 種類（5種） | 角型引掛シーリング（短辺約 25 mm、木造住宅に多い）、丸型露出引掛シーリング、丸型フル引掛シーリング（高荷重）、引掛埋込ローゼット（薄型、耳付きが多い）、フル引掛ローゼット（露出・埋込兼用、高荷重） | アダプタは全5種に嵌合する必要。Aladdin は「出しろ 21 mm 以下の角型/丸型」「出しろ 10 mm 以下の埋込ローゼット」を非対応にしている（奥行き不足）→ 本製品も出しろ依存を設計で吸収すべき | https://ja.wikipedia.org/wiki/引掛シーリング ／ https://www.rentio.jp/products/pa2p22u02dj?type=m |
| 普及率 | 具体的な世帯普及率の統計は不明。「1980年代中盤以降普及、既存住宅も照明交換時に置換」 | 市場規模推定には別途統計が必要 | https://ja.wikipedia.org/wiki/引掛シーリング |
| 照明器具以外の接続 | 法令で「照明専用」と明記した条文は確認できず。Wikipedia は「コンセントアダプタで照明器具以外を接続する場合は 6 A の許容電流に注意」と記述。パナソニック等は「引掛シーリング→コンセント」アダプタ（角型コンセントアダプタ、丸型引掛シーリングアダプタ増設電源端子付、コンセント付き埋込ローゼット）を正規に販売。カタログにはトイレの温水便座電源用途も記載 | 「引掛から給電する非照明機器」は市販アダプタの範囲で既に成立している。禁止規定は確認できなかったが、PSE 区分と 6 A 制限は守る必要あり | https://ja.wikipedia.org/wiki/引掛シーリング ／ https://gigaplus.makeshop.jp/tarotodenki/site/pdf/012/118.pdf |
| アダプタの PSE 区分（経産省判断例） | 引掛シーリングに付けて下面に刃受けを持ち、リモコン/音声で ON/OFF する LED 常夜灯付きアダプタ（刃受け AC100V 3A）は「特定電気用品 → 配線器具 → その他の差込み接続器」に該当と判断 | 本製品の「引掛キャップ＋内部電源」部が同様に差込み接続器扱いになる場合、特定電気用品として登録検査機関の適合性検査が要る。器具一体型（照明器具扱い）にできるかは設計次第 | https://www.meti.go.jp/policy/consumer/seian/denan/file/08_subject/10_wd/LED_jouyatou_tsuki_ceiling_adapter.pdf |
| 工事資格 | 引掛シーリング本体の交換・直結配線は第二種電気工事士が必要。器具のキャップ着脱は無資格可 | 「工事なし」= ユーザーがキャップで差すだけ、という前提が成立 | https://note.com/illumica_ikegami/n/n4dfef268ce90 |

---

## 2. 引掛シーリング利用の先行製品

| 製品 | 数値/事実 | 設計への意味 | 出典URL |
|---|---|---|---|
| Aladdin X2 Plus（PA2P22U02DJ） | 質量 4.9 kg、φ476×H145 mm、定格 160 W、AC100–110 V、プロジェクター 900 ANSI lm、フルHD、短焦点、スピーカー内蔵、動作温度 5–35 ℃。発売時 129,800 円、実売 89,798–129,800 円（2026-11）。照明 3,800 lm/8畳（X2 Light 記事の比較記述）。取付: 家庭用引掛シーリングのみで追加工事不要。非対応: 出しろ 21 mm 以下の角型/丸型、出しろ 10 mm 以下の埋込ローゼット | 4.9 kg が引掛のみで実売されている事実 = 5 kg 枚内なら市場実績あり。160 W も 6 A 枠内。寸法 φ476 は本製品（φ150–200）より大幅に大きい | https://www.rentio.jp/products/pa2p22u02dj?type=m ／ https://kakaku.com/item/K0001513296/ ／ https://kaden.watch.impress.co.jp/docs/news/1632511.html |
| Aladdin X2 Light（AX2P24U03DJ） | 2024-10-21 発売 99,800 円、質量 4.7 kg、φ456×H121 mm、160 W、AC100–240 V、照明 5,500 lm（〜14畳）、2,700–6,500 K、Ra80 未満、プロジェクター 700 ANSI lm、DLP 0.23"、騒音 32 dB、Wi-Fi/BT。実売 60,280–68,200 円 | 照明一体で 5,500 lm。放熱設計の参考値（160 W 級で H121 mm） | https://kaden.watch.impress.co.jp/docs/news/1632511.html ／ https://kakaku.com/item/K0001659566/spec/ |
| Aladdin X3 / X3 Laser 4K / Marca / Poca | 公式サイト価格: X3 99,800 円、X2 Light 99,800 円、X2 Plus 129,800 円、Marca 149,800 円（100 インチ）、Poca 69,900 円 | 「天井・工事不要」カテゴリの価格帯 7–15 万円 | https://www.aladdinx.jp/ |
| 累計販売台数 | 2018-11 一般発売。累計 20 万台超（〜2022）、21 万台（2022-12）、23 万台（2023-06）、30 万台突破（2018-12〜2025-07）。家庭用プロジェクターブランド 4 年連続 1 位（2018–21）。popIn Aladdin 2 は予約 2 万台（2020-09） | 引掛シーリング給電の非照明機器が約 7 年で 30 万台 → 「天井に機能を置く」需要は実証済み | https://www.aladdinx.jp/ ／ https://ascii.jp/elem/000/004/116/4116487/ ／ https://ascii.jp/elem/000/004/144/4144232/ ／ https://www.bcnretail.com/news/detail/20200901_188486.html |
| Panasonic AIR PANEL LED THE SOUND（HH-XCC1287A 等） | 2018-02-21 発売、質量 4.9 kg、46.7 W（〜12畳 5,499 lm）/37 W（〜8畳 4,299 lm）、ステレオ 10 W×2、Bluetooth、オープン価格。引掛シーリング 5 kg 制限内に設計 | 大手が「5 kg 制限内」を明示して設計している | https://news.panasonic.com/jp/press/data/2018/01/jn180115-1/jn180115-1.pdf |
| SwitchBot シーリングライト / プロ | 2022-07 発売。6畳: φ390×H96 mm、1.1 kg、36 W、3,500 lm（プロ 3,699 lm）、8畳: φ480×H102 mm、1.7 kg、43 W、4,000 lm（プロ 4,299 lm）。価格 4,980/5,480 円、プロ 8,980/9,980 円。Wi-Fi/BT、プロは赤外線リモコン＋ハブ機能内蔵。引掛シーリング各種対応・工事不要 | 1.1–1.7 kg・36–43 W で「天井のスマートハブ」が 1 万円以下で成立している。本製品の質量・電力レンジの直接比較対象 | https://kaden.watch.impress.co.jp/docs/news/1423049.html |
| 山善 LED シーリングファン TLFL-08/12 | 2026-06 発売、約 2.2 kg、48 W（灯 35 W＋ファン 13 W）/63 W、約 12,800/15,800 円。既存引掛シーリング取付・工具不要 | 可動部品付き 2.2 kg でも引掛取付が製品化されている | https://kyodonewsprwire.jp/release/202606150884 |
| 日立 スピーカー付シーリングライト | 不明（今回未取得） | — | — |
| 引掛シーリング取付のカメラ/センサー製品 | 専用製品は今回確認できず（不明）。市販アダプタで引掛→コンセント化は可能 | 競合不在 or 市場未形成。ただし「天井カメラ」はプライバシー面の懸念を設計に織込む必要 | https://gigaplus.makeshop.jp/tarotodenki/site/pdf/012/118.pdf |

---

## 3. 日本：住宅用火災警報器（住警器）

### 3-1 技術基準（平成17年総務省令第11号「住宅用防災警報器及び住宅用防災報知設備に係る技術上の規格を定める省令」）

| 項目 | 数値/事実 | 設計への意味 | 出典URL |
|---|---|---|---|
| 煙式・光電式 感度（2種） | 作動試験: 減光率 15 %/m、風速 20–40 cm/s で 60 秒以内に作動。不作動試験: 減光率 5 %/m で 5 分以上作動しない。（1種: 作動 7.5 %/m、不作動 2.5 %/m） | 「鈍すぎず敏感すぎず」の窓が規定されている。UL 品は 5 %/m で作動し日本の不作動試験に不適合（東京消防庁検証）→ 日米両対応は感度切替が必要 | https://www.tfd.metro.tokyo.lg.jp/hp-gijyutuka/shyohou2/44/44-14.pdf |
| 煙式・イオン化式 | 省令に規定あり（電圧降下方式）。数値は今回未確認（不明） | 光電式を選べばよい | https://laws.e-gov.go.jp/law/417M60000008011 |
| 熱式（定温式） | 作動温度 65 ℃（省令項目、パナソニック「ねつ当番」も 65 ℃級）。作動時間の秒数は不明 | 本体内部が LED/SoC で発熱すると熱センサが誤差を持つ → 熱センサは外気側に熱分離して配置 | https://laws.e-gov.go.jp/law/417M60000008011 |
| 音圧 | 無響室で前方 1 m にて 70 dB 以上を 1 分間以上継続（電池式は有効電圧下限、AC 式は定格 90–110 %）。市販品実測はパナソニック 87–90 dB/m、ホーチキ約 90 dB/m | 85 dB@1 m 級のサウンダが必要（スピーカー兼用は要検証） | https://www.jfeii.or.jp/pdf/lecture/11.pdf ／ https://panasonic.jp/bosai/products/fire_alarm/alone2022.html ／ https://www.ksdenki.com/shop/g/g4560184701019/ |
| 電池切れ警報 | 電圧が下限に達したら点滅または音で 72 時間以上報知。市販品は専用リチウムで約 10 年 | AC 給電型でも停電時バックアップ電池と電池監視が必要 | https://www.jfeii.or.jp/pdf/lecture/11.pdf |
| 自動試験機能 | 故障時は点滅または音で 72 時間以上報知。パナソニックは約 1 時間に 1 回自動試験、感度の自動補正あり | 煙室の汚れ補正・自己診断をファームに実装 | https://www.jfeii.or.jp/pdf/lecture/11.pdf ／ https://panasonic.jp/bosai/products/fire_alarm/alone2022.html |
| 警報停止 | 停止後、感知側は 15 分以内に監視復帰 | 「アプリで消音」は 15 分上限 | https://www.jfeii.or.jp/pdf/lecture/11.pdf |
| 無線連動 | 電波法施行規則第 6 条第 4 項第 4 号の「小電力セキュリティシステム」無線を使用。3 m での電界強度が設計値を満たすこと。市販品: パナソニック 426.6625–426.7375 MHz（親機は 426.7625–426.8375 MHz も）、見通し 100 m、親 1＋子 7。新コスモス FM-1/2: ARIB RCR STD-30 準拠、見通し 100 m、最大 32 台。ホーチキ SS-2LRA: 最大 15 台 | 連動は 920 MHz ではなく 426 MHz 帯（STD-30）。Wi-Fi/BLE/Thread だけでは「連動型住警器」の検定要件を満たせない。既存他社機との連動はメーカー独自プロトコルで非互換 | https://www.jfeii.or.jp/pdf/lecture/11.pdf ／ https://panasonic.jp/bosai/products/SH4902/spec.html ／ https://www.new-cosmos.co.jp/wp/wp-content/uploads/2016/03/FM-1・2カタログ改訂番号E.pdf ／ https://www.ksdenki.com/shop/g/g4560184701019/ |
| 環境試験 | 周囲温度 0–40 ℃、湿度・振動・衝撃・腐食・絶縁抵抗の各試験（数値は不明） | 天井付近は夏季 40 ℃近くになる。内部発熱 30–60 W と合わせ熱設計が重要 | https://laws.e-gov.go.jp/law/417M60000008011 |
| 表示 | 検定合格表示（型式番号「住警第○○～○○号」）、合格ラベル外径約 8 mm。防虫網開口 1 mm 以下 | 煙室の防虫網 1 mm メッシュが必須 | https://www.jfeii.or.jp/pdf/lecture/11.pdf |
| ガス漏れ複合型 | 天井下 15–30 cm、ガス機器から水平 8 m 以内 | 複合型にすると設置条件が追加される | https://www.jfeii.or.jp/pdf/lecture/11.pdf |

### 3-2 検定（日本消防検定協会）

| 項目 | 数値/事実 | 設計への意味 | 出典URL |
|---|---|---|---|
| 制度 | 住警器は消防法の「検定対象機械器具等」12 品目の一つ。型式承認（型式試験＝第1試験＋工場・品質管理審査＝第2試験 → 総務大臣承認）→ 個別の型式適合検定（JIS 抜取）。合格表示なしは販売・陳列・工事使用が禁止。2014-04-01 から検定制度（旧 NS マーク品は 2019-03-31 まで販売可） | 「火災警報器」と名乗って売るなら検定は回避不能。ソフト更新で感知ロジックを変えると型式変更試験の対象になり得る | https://www.kaigai-shobo.jp/files/internationalforum/20201001_FirePreventionMeasuresAndFireProtectionEquipmentCertification.pdf ／ https://www.jfeii.or.jp/_20250317_BK/knowledge/for_house2.html |
| 手数料 | 型式試験 148,100 円/件、型式変更試験 49,300 円/件、型式適合検定 1 個につき 41/36/30 円（区分別） | 認証コストは UL と比べ桁違いに安い。量産 1 台あたり 30–41 円 | https://www.jfeii.or.jp/_20250317_BK/document/Cost-Kentei-R01-08-20.pdf |
| 標準処理期間 | 型式試験: 住警器 2.5 か月（多機能型 3.5 か月）。型式適合検定: 受検希望日から 10 日 | 「多機能型」（本製品はこれ）で約 3.5 か月。設計手戻りを含め 6 か月以上を見込む | https://www.jfeii.or.jp/_20250317_BK/document/pdf/hyojyun_syori_kentei-H26-03-26.pdf |
| 補助警報装置・中継装置 | 協会規格 jfeii-2014-01-00 で技術基準あり | 本体を「住警器」ではなく「補助警報装置」として位置づける選択肢（連動する別の検定品を使う） | https://www.jfeii.or.jp/_20250317_BK/document/jfeii-2014-01-00.pdf |

### 3-3 設置・運用

| 項目 | 数値/事実 | 設計への意味 | 出典URL |
|---|---|---|---|
| 設置位置（天井） | 中心を壁・梁から 60 cm 以上（熱式は 40 cm）、エアコン・換気口の吹出しから 1.5 m 以上、台所は煙・蒸気が直撃しない場所 | 引掛シーリングは部屋中央にあることが多く、60 cm 条件は満たしやすい。エアコン直下の照明位置はリスク | https://www.tfd.metro.tokyo.lg.jp/lfe/kasai/jyuukeiki/p1_3.html ／ https://www.city.yokohama.lg.jp/bousai-kyukyu-bohan/shobo/kasaisonae/keihoki/3ichi.html |
| 設置位置（壁） | 天井から 15–50 cm | — | 同上 |
| 照明器具からの離隔 | 消防庁・東京消防庁・横浜市ページに照明器具との離隔規定は見当たらず（不明）。省令にも照明近接の禁止条文は今回確認できず | 照明一体型を妨げる明文規定は見つからなかったが、LED の発熱・気流が煙室に与える影響は検定試験で問われる | 同上 |
| 設置義務箇所 | 全国: 寝室、寝室のある階の階段、7 m²（4.5 畳）以上の居室 5 室以上の階の廊下。東京都条例: 常時使用する全居室・台所・階段（居室・階段は煙式、台所は煙式か熱式）。名古屋など 20 市町は台所も義務 | 「一部屋一個」が原則。本製品を全居室に置くモデルなら 1 住戸 3–6 台 | https://www.jfeii.or.jp/_20250317_BK/knowledge/for_house2.html ／ https://www.tfd.metro.tokyo.lg.jp/lfe/kasai/jyuukeiki/p1_9.html ／ https://www.pref.aichi.jp/bousai/shobo/juukeiki4.html |
| 義務化 | 新築 2006-06、既存 2011-06（東京は 2010-04-01 全住宅） | 既存住宅の 1 回目交換期（10 年）が 2021 年以降に到来 | https://www.kaigai-shobo.jp/files/... ／ https://www.tfd.metro.tokyo.lg.jp/lfe/kasai/jyuukeiki/p1_9.html |
| 交換 | 本体 10 年が目安。作動確認世帯の約 3.5 % で電池切れ・故障 | 10 年寿命設計 or センサモジュール交換可能構造 | https://www.jfeii.or.jp/learn/alarm/ ／ https://www.fdma.go.jp/singi_kento/kento/items/post-187/02/shiryou3.pdf |
| 設置率 | 全国設置率 84.9 %、条例適合率 65.8 %（令和 7 年 6 月 1 日）。令和 6 年: 84.5 % / 66.2 %。平成 30 年: 81.6 % / 66.5 % | 約 15 % 未設置 ＋ 34 % 条例不適合 → 「照明と一緒に付けたら自動的に適合」は訴求力あり | https://www.fdma.go.jp/singi_kento/kento/items/post-187/02/shiryou3.pdf ／ https://www.fdma.go.jp/publication/hakusho/r6/chapter1/section1/para2/68004.html |
| 効果 | 設置で死者数・損害額おおむね半減、焼損床面積約 6 割減。令和 6 年住宅火災 11,839 件、死者 1,109 人（7 割超が 65 歳以上） | 高齢者世帯向け見守り機能との親和性 | https://www.fdma.go.jp/singi_kento/kento/items/post-187/02/shiryou3.pdf |
| 市販価格 | ホーチキ無線連動 煙式 SS-2LRA-10HCP 5,478 円（155 g、10 年電池、約 90 dB）。パナソニック電池交換 1,300 円 | 単機能住警器は 3–6 千円。本製品は「住警器を内包した上位機」として価格差を正当化する必要 | https://www.ksdenki.com/shop/g/g4560184701019/ ／ https://panasonic.jp/bosai/products/SH4902/spec.html |
| OEM センサモジュール | 国内メーカー（ホーチキ、パナソニック、ニッタン、新コスモス、ヤマトプロテック）が住警器用センサ「モジュール」を外販している公開情報は確認できず（不明）。ホーチキアメリカは「ほぼ全ての火災報知メーカーへ OEM 供給してきた」「米国最後のセンサメーカー」と自称（完成感知器の OEM）。半導体側: ADI ADPD188BI（青 470 nm＋IR 850 nm 二波長光学モジュール）＋ CN0537/CN0583 リファレンス（UL 217 8版 Intertek 試験合格）、アルゴリズムライセンス 27,500 USD、データパッケージ 11,000 USD、評価ボード 101.20＋63.25 USD。CO: フィガロ TGS5141（φ15 mm、高さ 7 mm、10 年寿命、UL 2075 認定部品、UL 2034 の 1 年長期試験免除） | 「検定済み煙室モジュール」を買って組み込む道は見当たらない → 自社で煙室設計＋検定、または既存検定品メーカーと OEM/共同開発。センサ IC レベルなら ADI/フィガロ等で調達可 | https://www.securityindustry.org/2022/07/11/sia-new-member-profile-hochiki/ ／ https://www.analog.com/en/resources/reference-designs/circuits-from-the-lab/CN0583.html ／ https://www.mouser.lt/pdfDocs/intertek_test_report_on_eval-cn0537-algo-2.pdf ／ https://www.figarosensor.com/product/feature/tgs5141.html |
| 年間出荷台数 | 不明（検索上限） | — | — |

---

## 4. 米国：UL 217 / UL 2034 / NFPA 72 / スマート警報器

| 項目 | 数値/事実 | 設計への意味 | 出典URL |
|---|---|---|---|
| UL 217 版と発効 | 8 版 UL 217:2015（+R 2016-11-23）、9 版 UL 217:2020（+R 2022-02-09）。2024-06-30 以降製造品は 8/9 版必須（未移行レポートは撤回）。10 版 2024-11-27 発行、ANSI 承認 2026-01-14、ULC S531 と整合、低周波可聴要件追加 | 新規設計は 10 版準拠で始めるべき | https://cdn.intertek.com/www-intertek-com/dms-legacy/UL-217-SUN-Rev-10-30-2015-11-23-2016-1-2-2020-and-2-9-2022-ED-6-30-2024-Amendment-1.pdf ／ https://wcsafety.com/blogs/reference/ul-217-smoke-alarm-standard-explained ／ https://www.heimantech.com/blog/ul-217-10th-edition-explained-how-smoke-alarms-get-certified-through-etl |
| 新試験（8/9 版） | 調理ニューセンス試験（Sec.54: 電気レンジから 10 ft、冷凍ハンバーグをブロイル。1.5 %/ft 到達前に鳴ってはならない）、燻焼ポリウレタン（Sec.53、上限 10 %/ft）、燃焼ポリウレタン（Sec.51.4、上限 5 %/ft）、Go/No-Go 燃焼ポリウレタン。NIST: 旧世代 45 機種は全て不合格 | アルゴリズムで「調理煙を無視し、ソファ火災は捕まえる」必要 → 二波長＋機械学習が事実上標準に | 同上 ／ https://www.nist.gov/news-events/news/2024/09/new-smoke-alarms-are-better-detecting-fires-still-beep-bacon |
| 感度・環境 | 感度 概ね 0.5–4 %/ft 窓（ADI 設計の実測 2.0–2.6 %/ft）、感度シフト許容 ±1 %/ft（±3.3 %/m）、風速 32→300 fpm、周囲温度 0 ℃/49 ℃、湿度試験。試験火: 紙・木クリブは 240 s 以内、燻焼木は 10 %/ft 以内 | 日本 2 種（15 %/m = 約 4.6 %/ft 作動、5 %/m = 1.5 %/ft 不作動）より米国は高感度側。両市場同一ハードなら感度を地域設定で切替 | https://www.mouser.lt/pdfDocs/intertek_test_report_on_eval-cn0537-algo-2.pdf ／ Intertek SUN 上記 |
| 寿命表示 | 「Replace after X years」X ≤ 10 年、終寿命信号必須（8 版） | 10 年 EOL タイマー実装 | Intertek SUN 上記 |
| 音圧 | 業界標準 85 dB @ 10 ft（3 m）（Nest Protect ホーン、First Alert SC5、BRK SMI100 など全て 85 dB@10 ft 表記） | 85 dB@3 m ≒ 95 dB@1 m 相当のサウンダが必要（日本の 70 dB@1 m より厳しい） | https://store.google.com/us/product/nest_protect_2nd_gen_specs ／ https://www.firstalertstore.com/store/products/hardwire-smart-smoke-and-carbon-monoxide-alarm-sc5.htm |
| 低周波 520 Hz | NFPA 72 2010 版導入、2014-01-01 から寝室系で適用。枕元 75 dB。住宅単独警報器では難聴者向けの場合のみ要求（NFPA 72）。NFPA 101 は新築ホテル・寮・アパートで必須。520 Hz は消費電力・体積が大きい | 本製品のスピーカー容量なら 520 Hz 対応が差別化になり得る | https://www.meyerfire.com/university/what-is-low-frequency-notification |
| UL 2034（CO） | 70 ppm: 60–240 分、150 ppm: 10–50 分、400 ppm: 4–15 分で警報。30 ppm 連続 30 日では鳴らない。UL 2075 認定部品（例 TGS5141）使用で 1 年長期試験免除 | 電気化学 CO セルは 7–10 年寿命。本体 10 年寿命と整合させる | https://www.brkelectronics.com/faqs/diy/what_levels_of_co_cause_an_alarm ／ https://www.figarosensor.com/product/feature/tgs5141.html |
| NFPA 72 住宅要件 | 各寝室、寝室エリア外（寝室ドアから 21 ft 以内）、各階（地下・居住可能屋根裏含む）。調理器具から 10 ft 排除帯、浴室ドアから 3 ft、HVAC 吹出し・天井ファン羽先から 36 in、傾斜天井は頂部から 12 in 以内。複数台は連動必須（リスト済み無線可）、電源は建物配線＋電池バックアップ | 米国は「一部屋一個＋連動」が法制度化。天井ファン 36 in 条件は「ファン一体型」設計に不利 | https://ecmweb.com/safety/article/21261271/smoke-alarm-and-carbon-monoxide-detector-location-requirements |
| 配線・取付 | 有線機は 120 V AC、3 線（黒/白＋連動線 橙または赤）、連動は最大 12 台（＋6 台の互換機器）、9 V または 10 年封止リチウムのバックアップ。取付は 4 in 八角/3.5 in ボックス上のブラケットに回し込み（twist-lock）。BRK SMI100-AC: 5.6×5.6×1.9 in、0.6 lb、85 dB@10 ft、UL 217 8 版 | 米国版は引掛シーリングがなく、代わりに照明用ジャンクションボックスへの「既設照明置換」設計になる（ブラケット＋クイックコネクタ）。日本版と筐体は共通化できても給電機構は別 | https://www.brkelectronics.com/products/smi100-ac-brk-hardwire-interconnect-smoke-alarm-with-battery-backup |
| Nest Protect 2 世代 | 2015-06-17 発表、99 USD（後に 119–129 USD）。135×135×39.5 mm、379 g（電池式 6×AA リチウム）/375 g（有線 120 V＋3×AA）。センサ: 分割スペクトラム煙（2 波長）、電気化学 CO（10 年）、温度、湿度（Steam Check）、人感 120°/20 ft（Pathlight）、照度、加速度、マイク（Sound Check）。スピーカー 80 dB@1 m、ホーン 85 dB@10 ft。Wi-Fi 2.4 GHz b/g/n、802.15.4（Weave）、BLE。4–38 ℃、20–80 %RH。UL 217/UL 2034/NFPA 72。2025-03-28 生産終了、First Alert（Resideo）と Google 提携 | 「多センサ＋音声＋スマホ」の先行完成形。寸法 135 mm・379 g は本製品 φ150–200 の中に収まる参考値。動作上限 38 ℃ → 発熱体との同居は要注意 | https://store.google.com/us/product/nest_protect_2nd_gen_specs ／ https://support.google.com/googlenest/answer/9251133 ／ https://www.engadget.com/2015/06/17/nest-second-gen-protect ／ https://www.androidauthority.com/nest-protect-retired-3539328/ |
| First Alert SC5（SMCO600NV / -AC） | 129.95 USD（定価 149.95）。光電式煙＋電気化学 CO、有線版 120 V＋3 V リチウム（非交換）/電池版 2×CR123A。85 dB@10 ft、音声で種類と場所を告知、Heads-Up 事前警告、Wi-Fi、Nest Weave で既存 Nest Protect と連動、有線連動対応、Matter 非対応。5.75×1.6×5.75 in、0.93 lb。UL 217 9 版＋UL 2034 | 2025 年時点の「Google 公式後継」でも 9 版。10 版は Heiman Matter 機などが先行 | https://www.firstalertstore.com/store/products/hardwire-smart-smoke-and-carbon-monoxide-alarm-sc5.htm ／ https://knowledgelib.io/home/smart-home/smart-smoke-co-detectors/2026 |
| Kidde × Ring | CES 2025 発表、2025-04 Home Depot 専売。煙 54.97 USD、煙＋CO 74.97 USD、Wi-Fi、電池 7 日前警告、24 時間監視 5 USD/月 | スマート機の価格下限 55–75 USD | https://www.engadget.com/home/smart-home/ring-and-kidde-launch-connected-smoke-and-carbon-monoxide-alarms-140052259.html |
| X-Sense XS01-WX | 23.99 USD（1 個）、光電式のみ、電池約 1 年（Wi-Fi 使用時）、UL 217 版表記なし | 低価格 Wi-Fi 機は 24 USD | https://knowledgelib.io/home/smart-home/smart-smoke-co-detectors/2026 |
| その他 | Heiman Matter 煙（Thread、UL 217 10 版、39.99 USD）、First Alert SMCO410 Z-Wave（64.98 USD）、Gentex Place Any Space（139 USD） | — | 同上 |
| 認証コスト・期間 | UL 217 固有の公開見積りは不明。一般の UL リスティング: 初回試験 5,000–50,000 USD（単純電気製品 5–10k）、年間ライセンス 1,000–3,000 USD＋ラベル 0.03–0.15 USD/個、工場監査 3,000–5,000 USD/回（四半期）、特急 +50–100 %、全体 3–6 か月。ETL/Intertek は UL より速いと主張（数値なし）。試験項目は Intertek 報告書で 12 項目（感度、方向性、風速、紙・木・PU 燃焼、燻焼、調理ニューセンス、0/49 ℃、湿度） | 日本の検定（約 15 万円）に対し米国は数百万円＋継続費。多機能複合機は「複合リスティング」になり工数増 | https://nichesources.com/ul-certification-cost.html ／ https://www.mouser.lt/pdfDocs/intertek_test_report_on_eval-cn0537-algo-2.pdf |
| FCC | Wi-Fi/BLE/Thread 搭載機は FCC Part 15 認証（Kidde は「UL 217 と FCC 準拠」表記）。無線モジュール認証済み品の流用で簡略化可能 | UL と FCC は別個。日本は技適 | https://knowledgelib.io/home/smart-home/smart-smoke-co-detectors/2026 |

---

## 5. 熱画像・炎検知・映像式検知

| 項目 | 数値/事実 | 設計への意味 | 出典URL |
|---|---|---|---|
| Melexis MLX90640 | 32×24 画素（768 px）、FOV 55°×35°（BAB）/110°×75°（BAA）、NETD 0.1 K RMS @1 Hz、対象温度 −40〜300 ℃、0.5–64 Hz、I²C、3.3 V・約 20 mA、動作 −40〜85 ℃ | 110° 広角版なら天井 2.4 m から床面約 6.9×3.7 m（≒6–8 畳）をカバー。300 ℃上限は炎の直視で飽和するが「ホットスポット検出」には十分。プライバシー上カメラより受容性高い | https://www.melexis.com/-/media/files/documents/datasheets/mlx90640-datasheet-melexis.pdf |
| Teledyne FLIR Lepton UW | 120×120 実効解像度、FOV 160°、感度 <50 mK、シーンダイナミックレンジ最大 400 ℃、「火災検知に適する」と訴求、価格は要問合せ | 広角 LWIR モジュールが火災検知用途で商品化されている | https://www.laserfocusworld.com/detectors-imaging/article/14301348/lwir-microthermal-camera-module-suits-fire-detection |
| 研究（熱赤外による火災検知） | PMC7730462: FLIR SC660（640×480）/Vue Pro（336×256）で生値 max/min/avg と色域比率を特徴量化。NUC リセットによる段差を 15 フレーム中央値フィルタで除去（約 1 s 遅延）。定量的精度・誤報率は本文に記載なし。屋内（藁）と屋外（キャラバン・山林） | 低解像度 LWIR の定量的誤報率データは今回未確認（不明）。暖房器具・調理器・人体との判別がアルゴリズム課題 | https://pmc.ncbi.nlm.nih.gov/articles/PMC7730462 |
| MLX90640 を用いた火災検知論文 | 取得失敗（robots 拒否）／検索上限。数値は不明 | — | https://www.hrpub.org/download/20191230/UJEEEA11-14991095.pdf（未取得） |
| Bosch AVIOTEC IP starlight 8000 / 8000i IR | 映像式炎・煙検知。最低照度 2 lux（IR 照明で 0 lux 可、8000i は IR 内蔵）、例: TF5 火を 90° レンズで 23 m まで検知、検知時間は炎サイズと検証時間設定依存（秒数非公開）、吸引式より約 3 倍速いと主張。VdS 認証 G217090、CSIRO 認証。EN/ISO レベルの製品規格は存在せず（VdS 3847 ガイドライン、UL/FM に関連文書）。誤報主因は振動。用途は高天井・粉塵・多湿など「通常感知器が適さない補助」、住宅用途の記述なし | 映像式は現状「補助」扱いで住宅の法定警報器にはならない。本製品でも映像/熱は「早期予兆・補助」機能、法定部分は光電式煙＋熱に分ける構成が妥当 | https://community.boschsecurity.com/t5/Fire/Frequently-Asked-Questions-FAQ-AVIOTEC-IP-starlight-8000/m-p/59116 ／ https://internationalfireandsafetyjournal.com/bosch-unveils-aviotec-8000i-ir-camera/ |
| EN 54-10（点型炎感知器） | クラス: X（>25 m）、1（25 m）、2（17 m）、3（12 m）、複数クラス可変は P。試験火 TF5 n-ヘプタン（黄色すす炎）、TF6 メチル化アルコール（ほぼ不可視炎）。試験: 眩惑（dazzling）、窓監視、EMC（EN 50130-4）、乾熱・寒冷・湿熱・SO₂・衝撃・振動。Type B（屋外）は IP54 | 住宅用規格ではなく産業用。炎センサ（IR3/UV）を積んでも住宅法定要件には寄与しない | https://cdn.standards.iteh.ai/samples/37035/1c457b2e3d274d949f4ecda32143b01d/oSIST-prEN-54-10-2012.pdf ／ https://en.wikipedia.org/wiki/EN_54 |
| EN 54-7 / 54-5 | 煙（散乱光・透過光・イオン化、TF2–TF5）、熱 | 欧州展開時の参考 | https://en.wikipedia.org/wiki/EN_54 |

---

## 6. 天井の幾何条件

| 項目 | 数値/事実 | 設計への意味 | 出典URL |
|---|---|---|---|
| 日本 天井高 | 建築基準法施行令 21 条: 居室 2.1 m 以上。建売住宅の事実上の標準 2.4 m、在来木造 2.2–2.3 m、注文住宅 2.5–2.6 m | 2.4 m 天井で床から 2.1–2.2 m に筐体下面。110° 熱アレイで床 6.9×3.7 m 視野 | https://crexgroup.com/ja/home-building/planning/built-house-ceiling-height-average/ |
| 日本 部屋サイズ | 8 畳洋室 ≒ 12.96 m² 以上（1 畳 1.62 m² 換算）、和室は 11.5–14.5 m²（団地間が最小、京間が最大） | 6 畳 ≒ 9.7 m²、8 畳 ≒ 13 m²。1 台で 1 室カバーが妥当 | https://www.athome.co.jp/contents/for-lessees/bukken-choose/eightmatroom/ |
| 米国 天井高 | 標準 8 ft（2.44 m）、新築は 9–10 ft（2.74–3.05 m）が一般的、最低は多くの管轄で 7 ft 6 in | 米国は 2.7–3.0 m を想定。センサ到達距離・音圧余裕に影響 | https://www.angi.com/articles/height-of-average-ceiling.htm |
| 米国 部屋サイズ | 寝室平均 11×12 ft（132 ft² ≒ 12.3 m²）、主寝室 14×16 ft（224 ft² ≒ 20.8 m²）、第 2 寝室 10×12 ft（120 ft² ≒ 11.1 m²） | 20 m² 超の主寝室でも NFPA 72 は 1 台でよいが、熱アレイの視野は端が欠ける | https://cedreo.com/blog/average-bedroom-size/ |
| 一部屋一個の規範 | 日本: 寝室ごと・階段ごと（東京は全居室・台所）。米国: 各寝室＋寝室外＋各階、連動必須 | 両国とも「寝室 1 台」が最小単位。リビングは日本（東京以外）では義務外 | 上記 3-3、4 参照 |

---

## 工事なしで天井に付けて火災警報器も兼ねる製品が満たすべき条件（箇条書き）

**機械・電気（引掛シーリング）**
- 総質量 5 kg 未満（本体 ≤2 kg は余裕。ハンガ固定不要）。JIS C 8310 の 50 N 引張を前提に、安全率 2 以上。
- 角型・丸型・丸型フル・埋込ローゼット・フル引掛ローゼットの 5 種すべてに嵌合し、天井からの出しろ（10–21 mm 以下の薄型）でも接触できるキャップ機構（Aladdin が非対応にしたケースを吸収）。
- 入力 AC100 V、6 A 以下（≤600 W）。本製品 30–60 W は十分余裕。
- 引掛キャップ＋電源部は電気用品安全法の区分確認（「差込み接続器」なら特定電気用品、「照明器具」扱いなら PSE 丸）。無線部は技適（日本）/FCC Part 15（米国）。
- 停電時バックアップ電池（警報器部のみ数日〜10 年）と電池監視・72 時間以上の電池切れ報知。

**火災警報器（日本・検定）**
- 「住宅用火災警報器」と称して販売するなら日本消防検定協会の型式承認＋型式適合検定が必須（多機能型: 型式試験 148,100 円、標準 3.5 か月、適合検定 30–41 円/個、10 日）。
- 光電式 2 種: 15 %/m・60 s 以内作動、5 %/m・5 分不作動。熱式併用なら定温 65 ℃。防虫網 1 mm 以下。
- 音圧 70 dB 以上 @1 m を 1 分以上（市販品は 87–90 dB）。米国同時対応なら 85 dB @3 m。
- 自動試験機能（故障 72 時間報知）、警報停止後 15 分以内の復帰、10 年の交換目安表示、合格表示ラベル。
- 周囲温度 0–40 ℃ で感度維持 → LED/SoC の発熱（30–60 W）から煙室・熱センサを熱的に分離し、気流（LED 放熱の上昇流）が煙室への流入を妨げない配置。
- 連動型にするなら 426 MHz 帯 小電力セキュリティシステム（ARIB STD-30）無線が必要。Wi-Fi/BLE/Thread は「連動」の代替にならない。他社機との連動はメーカー独自で非互換。
- 設置位置: 壁・梁から 60 cm 以上、エアコン吹出から 1.5 m 以上。引掛シーリング位置が条件を満たさない部屋への注意表示。
- 検定済みセンサ「モジュール」の外販は確認できず → 自社煙室設計＋検定、または既存住警器メーカーとの OEM/共同開発が現実的。センサ IC は ADI ADPD188BI（二波長）＋アルゴリズム（27,500 USD ライセンス）、CO は Figaro TGS5141 等で調達可。

**火災警報器（米国）**
- UL 217 10 版（調理ニューセンス、PU 燻焼/燃焼、終寿命信号、感度 ±1 %/ft）、CO 搭載なら UL 2034（70/150/400 ppm 応答窓）。費用目安 数万 USD＋年間ライセンス＋四半期工場監査、3–6 か月以上。
- 日本 2 種の 15 %/m と米国の高感度側（UL 品は 5 %/m で作動）は両立しないため、地域別感度設定（ハード共通・ファーム切替）。
- 米国版は引掛シーリングがないため、4 in 八角ボックス用ブラケット＋120 V 3 線（連動線）＋クイックコネクタで「既設照明/警報器置換」構造に。
- NFPA 72: 寝室ごと設置・連動必須・HVAC/天井ファンから 36 in・調理器から 10 ft。

**付加センサ（熱画像・映像）**
- LWIR アレイ（MLX90640 110°版や Lepton UW 160°）は 2.4 m 天井から 6–8 畳をカバーでき「予兆検知・見守り」に使えるが、法定警報器の代替にはならない（映像式も VdS 認証のみで EN/ISO 規格なし、住宅用途外）。
- 誤報源（暖房器具・調理・人体・振動）の抑制アルゴリズムと、カメラを積む場合のプライバシー設計（熱アレイ優先が受容性高い）。

**その他**
- 10 年寿命（CO セルは 7–10 年）とスマート部品（SoC、Wi-Fi）の陳腐化をどう整合させるか → 警報器モジュールを交換可能カートリッジにする設計が有効。
- 既存市場価格: 単機能住警器 3–6 千円、スマート煙/CO（米）55–130 USD、スマートシーリングライト 5–10 千円、天井プロジェクター 7–15 万円。

---

## 判定: 今日できる / 認証が要る / 無理

| 要素 | 判定 | 理由 |
|---|---|---|
| 引掛シーリングから給電し、≤2 kg・≤60 W の天井パックを工事なしで付ける | **今日できる** | 5 kg/6 A の枚内。SwitchBot（1.1–1.7 kg, 36–43 W）、Aladdin（4.9 kg, 160 W）、山善ファン（2.2 kg）に実売実績。PSE 区分の確認とキャップ嵌合設計のみ |
| スマートライト・スピーカー・人感・温湿度・照度・Wi-Fi/BLE/Thread ハブ機能 | **今日できる**（技適/FCC は要） | Nest Protect・SwitchBot で確立。無線モジュールは認証済み品流用可 |
| 熱画像（MLX90640/Lepton）や映像による「火災予兆・見守り」通知（法定警報器と称さない） | **今日できる**（誤報設計は要検証） | 部品は入手可。ただし定量的誤報率の公開データは乏しく、自社検証が必要。製品表現は「補助」に留める |
| 「住宅用火災警報器」として日本で販売（煙/熱、単独型） | **認証が要る** | 検定必須（型式試験 148,100 円・多機能型 3.5 か月・適合検定 30–41 円/個）。技術的障壁は低いが、発熱体との同居を検定試験で証明する熱・気流設計が鍵。モジュール外販がないため自社煙室開発か OEM 提携 |
| 無線連動型住警器として他室の警報器と鳴動連動 | **認証が要る＋制約** | 426 MHz 帯 STD-30 無線の追加と検定。他社既設機とは非互換のため、自社機同士の連動に限定される |
| 米国で UL 217 10 版／UL 2034 リスト品として販売 | **認証が要る（高コスト）** | 数万 USD〜＋継続費、3–6 か月以上。日本と感度窓が異なるため地域別設定が必須。引掛がないので取付機構は別設計 |
| CO 警報の内蔵 | **認証が要る** | UL 2034（米）。日本は住警器検定の範囲外だが JIS/ガス警報器検定の扱いを別途確認（不明） |
| 映像/熱画像「だけ」で法定火災警報器要件を満たす | **無理（現行法規）** | 日本の省令は煙（イオン化/光電）・熱（定温）方式のみ。米国 UL 217 も光学/イオン化煙室の試験体系。映像式は EN/ISO 規格なし、VdS 認証でも「補助」扱い |
| 引掛シーリング 1 口で 600 W 超（大出力プロジェクター＋ヒーター等） | **無理** | 6 A 定格 |
| 5 kg 超の本体を工事なしで引掛のみに吊る | **無理** | 内線規程 5 kg（ハンガ固定で 10 kg、超は不可） |
| 既設他社住警器との無線連動 | **実質無理** | 各社独自プロトコル、相互接続規格なし |
