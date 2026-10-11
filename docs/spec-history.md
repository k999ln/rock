# 仕様変遷 — いつ、何が、どう変わったか

対象期間: 2026-09-04（最初のcommit）〜 2026-10-10 ／ 作成: 2026-10-07、更新: 2026-10-10

この文書は、プロジェクトの仕様が **何日に、何から何へ変わったか** を人が読める順番に並べ直したものです。

- **正本ではありません。** 確定要望の正本は [製品ベース](product-baseline.md)（RQ01〜RQ50と日付付きの判断）、機械可読の正本は [`data/product-baseline.json`](../data/product-baseline.json) です。ここは、その内容とGitの履歴を日付順に引き直した **読むための索引** です。
- 各項目の `v1.xx` は製品ベースの版番号です。全文を読みたいときは、製品ベースをその番号か日付で検索してください。
- 「決めた」と「作った」と「動いた」は別です。この文書の「仕様の決定」は利用者（owner）が指示した内容、「この日に作ったもの」はGitに入った成果です。実機・本番・実資金で合格したかどうかは [現在地](#2-いま有効な仕様2026-10-06時点) と各設計書を見てください。
- **2026-09-24〜10-05の一部は、統合（merge）で消えていた記録を戻したうえで書いています。** `main` の作業記録と一部の決定は2026-10-05の統合で文書から落ちていました。何が落ち、何を戻したかは [統合で失われた情報の監査](merge-loss-audit-20261007.md) にあります。この文書で戻した記録に基づく項目には「〔復元した記録〕」と付けています。

**目次**

1. [30秒でわかる変遷](#1-30秒でわかる変遷)
2. [いま有効な仕様（2026-10-06時点）](#2-いま有効な仕様2026-10-06時点)
3. [テーマ別：何から何へ変わったか](#3-テーマ別何から何へ変わったか)
4. [日付順の全記録](#4-日付順の全記録)
5. [撤回・上書きされた仕様の一覧](#5-撤回上書きされた仕様の一覧)
6. [未確定・検討中のアイデア](#6-未確定検討中のアイデア)
7. [この文書の更新ルール](#7-この文書の更新ルール)

---

## 2026-10-09 — SPIDERをSkyで提供

利用者は「セキュリティーで開発したい」「skyでしたい」と指定。既存OS常駐を保持し、Skyで選びZemaでコード／テキストを端末内検査する提供面を追加する。現行仕様は下のセキュリティ行と[Tool設計](sky-tools-complete-design.md#spider--skyのセキュリティ検査)。

## 2026-10-10 — Sky Compute Grid

利用者は、cloud serverを借りる代わりに、世界中の人が使っていない時間の携帯を計算資源として束ね、需要と供給のmatchingをSkyに含める方針を指定した。初期供給は充電中・idle・unmetered・低温のAndroid arm64、初期需要はpublic/synthetic text embeddingの固定lot、単価はCPU時間ではなくverified lotとする。任意code、個人情報、秘密、exact location／owner identity公開、無断cloud fallback、未検証収益化、live billing/payoutを許可しない。`RQ50`と[専用設計](sky-compute-grid.md)へ固定した。

## 1. 30秒でわかる変遷

約1か月で、製品の中心は **5回** 大きく動いています。

| 期 | 期間 | 製品の中心 | 一言でいうと |
| --- | --- | --- | --- |
| 0 | 09-04 〜 09-08 | **LOOP / Rock star** — 自動化HubのWebアプリ | AI自動化ツールを見つけて動かすWebアプリとして始まった。`Mr.` のツール4件、ファンド、MCPのワンボタン実行。5日目に「自動化に特化したAndroid（AOSP）OS」の構想が加わる |
| 1 | 09-09 〜 09-11 | **Rock star OS → RockstarOS 1.0** — 自動化ツール専用の端末OS | 確定要望RQ01〜RQ17を固定。Linux/QEMUで動くnative OS、Hub＋Wallet、ゲーム通貨交換、CM発表に向けたDeveloper Preview。端末はBlackBerry優先 |
| 2 | 09-12 〜 09-16 | **Sky / Zema / Wallet** — AI自動化チームを持つためのOS | Hubを **Sky** と命名、Chatを **Zema** と命名。MCP接続、収益からの8.88 USD精算、メルカリ、Fashion Brand Ops、Wallet。実機はPixel 10に確定。名前が一時 **avocadoOS** になる。最後に「AIネイティブOS」が中核になる（RQ48） |
| 3 | 09-17 〜 09-26 | **avocadoMini** — ハードウェアを表の主役に | 名前がRockstarOSへ戻る。物質発明（Material Invention）とavocadoMiniが登場し、7日間に8つの案を経てR5に落ち着く。rocketstarの設計も保存。8.88 USDは保留。最後に「Mini・Pro・rocketstarの3製品＋共通OS」に整理 |
| 4 | 09-27 〜 10-06 | **SIM/eSIMを入口にしたサービス**（現行） | Sky Market（手数料10%）と決済、Campus、AMC。クラウドAgentの継続実行。10-02に **「SIM/eSIMを買うとRockstarOS・Sky・Zema・Agentが使える」** が主商品になる。Spider Guard、ProのPC化、Mini本体SIM、専用モデル |
| 5 | 10-10 〜 | **Sky Compute Gridを追加**（現行追加） | SIM/eSIM主商品を置換せず、未使用Androidの余剰計算を固定・検証可能なlotとして仲介する供給networkをSkyへ追加 |

名前の変遷だけを抜き出すと、こうなります。

```text
製品名   LOOP ─→ Rock star ─→ Rock star OS ─→ RockstarOS 1.0 ─→ avocadoOS ─→ RockstarOS
         09-04    09-05         09-05〜09        09-09             09-15        09-17（現行）

Tool入口 Hub（Automation Hub）───────────────→ Sky
                                                09-12（現行）

仕事管理 Work / Activity ─→ Chat ─→ Zema
                            09-12    09-15（現行）
```

---

## 2. いま有効な仕様（2026-10-06時点）

「結局いまはどうなっているのか」をテーマごとに一行で示します。右端が正本です。

| テーマ | いま有効な内容 | 決めた日 | 正本 |
| --- | --- | --- | --- |
| 主商品 | 物理SIMまたはeSIMの購入を入口に、RockstarOS・Sky・Zema・統合Agentの利用権を提供するサービス。OSのbinaryをSIMへ入れる前提にはしない | 10-02 | [製品ベース冒頭](product-baseline.md) / [SIM/eSIM-led architecture](sim-led-product-architecture.md) |
| 選ばれる理由 | ①クラウドLLM・Agentへ速く簡単に ②料金と使用量が透明 ③Sky/Zemaを最小設定で | 10-02 | 同上 |
| Skyの提供形態 | OSの導入を必須としない独立サービスとしても提供する。OS内と単独Web（`/sky/marketplace`）で同じcatalog・本人認証・履歴・実行条件を共有 | 10-01 | [Sky](sky.md#単独アプリとos内の共通マーケットプレイス) / [Skyローンチ設計](sky-launch-design.md) |
| Sky Compute Grid | 充電中・未使用のAndroid余剰計算を、public/synthetic text embeddingの固定lotへmatchingする。検証済みlotだけを精算候補にし、実端末dispatchとlive billing/payoutは未開始 | 10-10 | [製品ベース RQ50](product-baseline.md#rq50-使われていないスマートフォンの計算余力をskyで仲介する) / [Compute Grid設計](sky-compute-grid.md) |
| 最上位の目的 | 利用者が自分専用のAI自動化チームを持ち、その効率を上げて便利さと検証可能な収益機会を増やす（RQ47） | 09-15 | [製品北極星](product-north-star-20260915.md) |
| 製品名 | 表示は **RockstarOS**（共通版は `RockstarOS 1.0 Developer Preview`）。内部識別子は `dev.rock`。ブランドは avokado | 09-17 | 製品ベース RQ43・RQ44 |
| OSの位置づけ | AI・Agent実行、権限、本人性、端末適合、保存・復旧の共通runtime。ローカルLLMは対応端末向けの追加能力で、必須ではない（RQ48） | 09-16 / 10-02 | [AIネイティブOS設計](ai-native-os-architecture.md) |
| 標準の入口 | Home（`/`）→ **Sky**（Toolを探す・接続）／**Zema**（仕事を頼む・止める・確認）／**Wallet**（費用と確認済み収益）＋ Market、Campus、設定、追加（`/add`） | 09-12〜10-06 | [Sky](sky.md) / [全Tool設計](sky-tools-complete-design.md) |
| ハードウェア製品 | **avocadoMini**（現行R5：200mm以内、1本自律、別Hub不要、本体SIM）／**avokadoPro**（NVIDIA搭載の小型PC、Miniなしで単独動作）／**rocketstar**（R1.0、別プログラム） | 09-24 / 09-26 / 10-05 | [R5設計](avocado-mini-r5/README.md) / [Pro設計](avokado-pro-pc-design.md) / [rocketstar](rocketstar-design/README.md) |
| 最初の実機 | Google Pixel 10（日本向け GL066 / `frankel`）。Linux/QEMU版は独立したDeveloper Previewとして保持 | 09-16 | [端末preview](phone-preview-20260911.md) |
| 端末の分岐 | 署名済みOSと復旧経路が受入済みの正確な機種だけnative OS。それ以外は既存OS上のアプリまたはブラウザ | 10-02 | [SIM/eSIM-led architecture](sim-led-product-architecture.md) |
| クラウドAIの料金 | 使用量ベース。実行前に単価と見積、実行中に予約額、完了後に項目別の利用明細。上限を超える実行はしない。通信料とは別表示 | 10-02 | 製品ベース冒頭 |
| Sky Marketの手数料 | 登録・接続・公開・基本利用料は0円。検証済みTool売上の手数料は **10%**。第三者実費は別表示 | 09-27 | [Sky経済設計](sky-network-economy.md) / [決済](sky-billing.md) |
| 8.88 USDの収益料金 | **保留**。収益を得る動線が確定するまで計上・請求・回収しない | 09-24 | 製品ベース「収益料金の保留」 |
| 公開製品ラインの参考価格 | avocadoMini 1本 ¥160,000、4本 ¥410,000、avokadoPro From ¥880,000（税・送料別、公開Siteの表記どおり）。販売・決済は停止のまま。**R5の価格は未確定**で、R5とこの製品ラインの関係はowner判断待ち。Proは10-05の「販売目標80万円／台」と並んでいて、どちらが現行かは未整理 | 09-25 | [製品ベース 2026-09-25の節](product-baseline.md) |
| Miniゲームの分配 | クリエイター80%：Mini運営20%（比率のみ確定。何を分けるかは未決） | 09-27 | [会話仕様アーカイブ](avocado-mini-conversation-2026-09-27/README.md) |
| ATM | Rockが徴収するATM手数料は0（RQ15）。ゲーム料金とは別 | 09-09 | 製品ベース RQ15 |
| クラウド実行 | 受付・承認済みの仕事は、端末が圏外でも予算と期限の範囲でクラウドが続ける | 09-30 | [継続実行契約](sky-cloud-continuity.md) |
| セキュリティ | SPIDERをSkyのToolとして提供。Zemaで明示入力を端末内検査。既存のOS常駐guardも保持し、受入は区別する | 10-09 | [SPIDER](spider-guard.md) / [Tool詳細](sky-tools-complete-design.md#spider--skyのセキュリティ検査) |
| 開発の進め方 | 3製品＋共通OSを5師団32部隊に分け、Goal・段階・証拠で管理（AMC） | 09-26 | [Mission Control](mission-control.md) |
| 公開サイト | `https://avocadomini.si`（Mini／Proの製品ホーム）。OSの作業画面とは別 | 10-05 | [Web workstream](workstreams/05-web-pwa-sites.md) |

> **読み方の注意** — 上の表は「決めた仕様」です。実機・本番・実資金で合格した範囲はずっと狭く、たとえばR5の実機試験は0件、Pixelの初回flash gateは未合格、実課金・実払出しは未開始です。到達点は [README の Where it stands](../README.md#where-it-stands) と [進捗の全task表](../project.md) を見てください。

---

## 3. テーマ別：何から何へ変わったか

同じテーマを横に並べると、どこで方針が切り替わったかが分かります。**太字が現行**です。

### 3.1 何を売るのか（製品の中心）

| 日付 | 中心に置いたもの | きっかけ |
| --- | --- | --- |
| 09-04 | 自動化Hub（LOOP）。ツールを見つけて動かすWebアプリ | 初期実装 |
| 09-05 | 自動化に特化したAOSPベースのOS（Rock star） | 設計 `6c593ae1` |
| 09-09 | AI自動化ツールに特化した端末OS。入口はSky（当時Hub）とWallet（RQ01） | v1.0 |
| 09-15 | 利用者が自分専用のAI自動化チームを所有すること。OSや端末は手段（RQ47） | v1.57 |
| 09-16 | 高性能で交換可能なローカルLLMを持つAIネイティブOS（RQ48） | v1.70 |
| 09-19 | 表の主役はハードウェア。最初の製品構想はavocadoMini。OS・LLM・Sky/Zemaは支える技術基盤 | v1.83 |
| 09-21 | ゲーム機を入口に、生活全体を豊かにするOSへ | v1.89 |
| 09-26 | ハードウェアは avocadoMini・avokadoPro・rocketstar の3製品。RockstarOSは3製品共通のOS | v1.95 |
| 09-30 | 製品をeSIMで完結させる（eSIM専用）。この段階は開発だけ行い、物理SIM・回線契約・課金は扱わない | owner指示〔復元した記録〕 |
| 10-01 | 物理SIM／eSIMの購入にRockstarOS・Sky・Zema・Agentの利用権を含めるサービスを主製品に。eSIMのみ・OS内のeSIM store・ハードウェア先行の前提を退ける | owner指示〔復元した記録〕。翌日に製品ベースへ |
| **10-02** | **SIM/eSIMの購入を入口に、RockstarOS・Sky・Zema・Agentへの利用権を提供するサービス**。ハードウェア先行・端末内LLM主商品より優先 | 現行方針 |

### 3.2 基本アプリと画面

| 日付 | 変更 | 版 |
| --- | --- | --- |
| 09-04 | 自動化Hub、ファンド、ワンボタンMCP、PWA | — |
| 09-09 | 標準の入口は Hub ＋ Wallet で十分、と固定 | v1.0 |
| 09-12 | 自動化ツールの入口を **Sky** と命名。内部名 `hub` は互換のため維持 | v1.12 |
| 09-12 | 基本アプリを **Sky / Chat / Wallet / Polymarket** の4つに分離 | v1.13 |
| 09-12 | MCPの接続・管理をSkyの中へ統合。Skyの常設sidebarをやめる | v1.17 |
| 09-12 | `/` をiPhoneに着想を得たホーム画面に。Sky本体は `/sky` へ。設定アプリを追加 | v1.22〜v1.25 |
| 09-13 | Polymarketの掲載・再販売ではなく、独自の **Market**（PAPER限定）と自律ファンドへ | v1.33 |
| 09-13 | 全画面からHomeへ直接戻れる導線を必須に | v1.32 |
| 09-15 | 仕事・実行履歴・CSVをホームの独立アプリから外し、Sky内へ | v1.43 |
| 09-15 | 常設サイドバーを廃止 | v1.44 |
| 09-15 | 仕事の作成〜履歴をChatへ集約。SkyはToolを探す場、Chatは動かす場 | v1.46〜v1.48 |
| 09-15 | **Chat → Zema** に表示名を変更（URL `/chat` と内部IDは維持） | v1.49 |
| 09-15 | Skyで選んだToolと依頼を、Zemaへ一回だけ引き継ぐ | v1.50 |
| 09-27 | **Campus** を追加（大学ごとのPeople / Projects / Events、NFC・QR入口） | — |
| 10-05 | Skyの商品詳細は確認だけ。実行は「Zemaで開く」から | — |
| **10-06** | **既存OSへの機能追加**：Homeの「追加」（`/add`）からSky・データ回収・LLMを選ぶ | — |

### 3.3 料金・手数料

ここが最も多く変わっています。

| 日付 | 料金の考え方 | 版・根拠 |
| --- | --- | --- |
| 〜09-09 | native OSの契約は同一ownerにつき月 888 cents 固定。複数端末でも1回 | 旧native方針（RQ05に保持） |
| 09-09 | ATMでRockが徴収する手数料は **0**。ゲーム料金は未定のまま | v1.4 / RQ15 |
| 09-12 | Skyで月額 8.88 USD を実際に回収する（Stripe Checkoutの先払い定期購読） | v1.15 / RQ20初版 |
| 09-12 | tob（Tool提供側）の登録・接続・公開・売上手数料は 0円 | v1.16 / RQ21 |
| 09-12 | **訂正**：先払いをやめ、自動化が生んだ **検証済み収益からだけ** 最大 888 cents を回収。売上0なら0、債務化・繰越なし | v1.19 / RQ20 |
| 09-15 | CSV販売者だけの限定条件：月の純入金が30 USD以上の月だけ 8.88 USD | CSV販売実証 |
| 09-17 | **訂正（条件確認中）**：固定の利用料ではなく、Sky経由の利益に対する割合の成功報酬へ。開発者還元はその一部から | 料金方針の訂正 |
| 09-19 | 理念として「無料配布」と「OSは従量課金」。単価・計量単位は未確定 | v1.84 |
| 09-20 | avocadoMiniの予約価格：1本16万円、4本41万円（税別） | 予約販売価格の新指定 |
| 09-24 | **8.88 USDの収益料金案を保留**。請求・回収・新規計上を止める | 収益料金の保留 |
| 09-25 | 公開Siteの製品ラインと参考価格を正式化：avocadoMini 1本 ¥160,000／4本 ¥410,000、avokadoPro From ¥880,000（US$5,800）。税・送料別。販売は停止のまま、R5の価格は未確定 | 本人決定 2026-09-25 00:49〔復元した記録〕 |
| 09-27 | **Sky Marketの手数料は10%**。登録・接続・公開・基本利用料は0円。Stripe Connectの決済を実装 | 現行手数料 |
| 09-27 | Mini対応ゲームの分配はクリエイター80%：運営20% | 会話仕様アーカイブ |
| **10-02** | **クラウドAI・Agentは使用量ベースで課金**。事前見積・上限・項目別明細。通信料とは別項目 | 現行方針 |
| 10-05 | avokadoProの販売目標は80万円／台（税・送料は未定）。09-25の参考価格 From ¥880,000 を上書きするのかは記録がなく、要確認 | Pro方針 |

### 3.4 対象端末

| 日付 | 対象 | 版 |
| --- | --- | --- |
| 09-05 | Android/AOSPの試作（emulatorでBinder・SQLite） | P1 |
| 〜09-09 | 初期製品端末は **BlackBerry優先**（機種未定）。動いているのはLinux / Buildroot / ARM64 QEMU | native統合 |
| 09-11 | スマホ本体へ書き込めるOS版の開発を開始。Pixel 10は候補 | v1.10 |
| 09-12 | 多機種対応：共通Core＋機種別Device Support Package。iPhone/iPadはOS置換ではなくclient | v1.11 |
| 09-15 | Pixel 10を最初の実機対象に選定 | `9ba88959` |
| 09-16 | **Pixel 10 日本向け GL066 / `frankel` に確定**。BlackBerry-firstは退役 | v1.59 / v1.63 |
| 09-26 | PC/Web・QEMU・Pixelは「開発・検証環境」であり販売製品ではない、と整理 | v1.95 |
| **10-02** | native OSは受入済みの正確な機種だけ。それ以外は既存OSのアプリ／ブラウザ | 現行方針 |

### 3.5 avocadoMiniの形

09-18から09-24の7日間に、8つの案を経ています。**現行はR5**で、それ以前は設計履歴として保存されています。

| 日付 | 名前 | 形・構成 | 価格の扱い | 資料 |
| --- | --- | --- | --- | --- |
| 09-18 | Spatial Invention Studio / avocadoMini | 四方向のセンサーで手を追跡し、物質のdigital twinを操作する発明端末 | — | [端末設計](avocado-mini-spatial-invention.md) |
| 09-18 | Full-scale | ビリヤード台規模（約3.0×1.7×0.9 m）の空間発明台 | — | [Full-scale設計](avocado-mini-hardware-design.md) |
| 09-19 | （製品訴求） | 「考える時間を、つくる時間に」 | 希望参考価格41万円 | v1.87 |
| 09-20 | 伸縮式センサータワー | 銀色の三段伸縮式タワー（収納850mm・伸長1,800mmは構想値） | 41万円 | 製品形状の修正 |
| 09-20 | **Motion Tower P0.2** | タワー4本＋Edge Hub 1台。収納850mm、自立1,200mm、固定時1,800mm | 41万円はキット目標価格 → 同日「1本16万円・4本41万円（税別）」 | P0.2採用 |
| 09-21 | **Mini200 E1** | 使用時20cmのゲーム機。本体内ゲーム処理、日本語音声 | 旧価格を引き継がない | [E1](avocado-mini-mini200-e1/README.md) |
| 09-21 | **Mini200 E2** | 銀色の伸縮式タワー4本＋低い中央ユニット | 41万円＋税 | [E2](avocado-mini-mini200-e2/README.md) |
| 09-22 | **Tower20 E3** | 200mm以下の固定式タワー4本＋別筐体Edge Hub | 1本16万円＋税、4本＋Hub 41万円＋税 | [E3](avocado-mini-tower20-e3/README.md) |
| **09-24** | **R5（現行）** | **200mm以内の銀色円筒1本で自律動作。別Edge Hub不要。同型miniを増設可能。外部給電、電池なし** | **未定**（E3の価格は引き継がない） | [R5](avocado-mini-r5/README.md) |
| 09-25 | 公開製品ライン（Mini／Pro） | 公開Siteの構成：avocadoMini単体、Mini 4本、avokadoPro（別売）。形はSiteの表記どおりで、R5と同一か・後継か・別系列かは未決（owner判断待ち） | Mini 1本 ¥160,000、4本 ¥410,000（参考価格、税・送料別）。R5の価格は未確定のまま | [製品ベース 2026-09-25の節](product-baseline.md)〔復元した記録〕 |
| 09-27 | R5追補 | Mini単体で独立。本体形状と背面下部の洋梨形ボタン・蔦の意匠を固定 | — | [会話仕様](avocado-mini-conversation-2026-09-27/README.md) |
| 10-05 | R5追補 | **Mini本体に物理SIMとmodem**。ProなしでMini単体が通信する | — | [Mini cellular](avocado-mini-cellular.md) |

### 3.6 avokadoProとrocketstar

| 日付 | 変更 |
| --- | --- |
| 09-21 | avokado Proの「compute server」構想を追加 → 同日revert |
| 09-21 | Rocket Starのミッション紹介ページを追加 |
| 09-24 | rocketstar 設計書完全版 R1.0（44ページ・35章）と全付録を保存。RockstarOS 設計書完全版 v1.0（41ページ・32章）も保存 |
| 09-25 | 公開SiteでMiniとProの製品ページを分離。avokadoProの参考価格 From ¥880,000（US$5,800、税・送料別）を公開Siteどおり正式化〔復元した記録〕 |
| 09-26 | Proを「単体でgame・service・compute・storage・audioを扱い、任意でMiniと接続する製品」と定義。専用設計は未作成（段階0） |
| **10-05** | **Proは「NVIDIA搭載のMac miniのような据え置き小型PC」**。AIとPCゲームを重視、販売目標80万円／台（09-25の From ¥880,000 との関係は要確認） |

### 3.7 AI・LLM・Agent

| 日付 | 変更 | 版 |
| --- | --- | --- |
| 09-12 | Skyに役割エージェント（サブスク顧問、法務受付、特許出願）を追加。WebのOpenAI接続は法務・特許の2 Toolだけ | [役割エージェント仕様](sky-role-agents-20260912.md) |
| 09-15 | Local Action Assistantを物理Android版のローカルLLMに（RQ41） | v1.41 |
| 09-16 | 所有Pixel 10でQwen3-0.6Bの機内モード推論・再起動後の保持・33分の熱試験に合格 | v1.60 |
| 09-16 | ローカルLLMは「計画候補だけを返す非信頼planner」。権限判定とTool実行はBrokerが行う | v1.64 |
| 09-18 | Jev ecosystem 10件をSkyの候補に。Decision Fabric（code・Jev・Local Qwen・Cloud LLM・RAG・Marketを一つの判断基盤へ）を設計 | v1.79〜v1.81 |
| 09-20 | LLMの現在地を整理：端末内Qwen＝planner、OpenAI＝2 Tool内、Jev＝明示利用のremote evaluator | [LLM設計](llm-evaluation-architecture.md) |
| 09-27 | Agent Control Plane（Cursor Cloud Agentへの委任境界。dry-runのみ） | [Agent Control Plane](agent-control-plane.md) |
| 09-27 | AMC Goal Orchestrator（指示→部隊→Goal）。Codexの司令官・実行担当・検収担当 | v1.96 |
| 09-30 | エージェント間の発見・接続・委任（A2A）。クラウドAgentの継続実行 | [A2A Bridge](sky-a2a-bridge.md) |
| 10-02 | クモ（Spider）に「セキュリティーエージェント」の役割を割り当て | [Spider Guard](spider-guard.md) |
| 10-04 | IP StudioにLiveKit Agentsの音声会話・電話対応を追加 | — |
| **10-05** | **avokado専用モデルをゼロから事前学習**（端末内とクラウドの両方で使う。初回は追加費用なしの小型試作） | [事前学習設計](avokado-llm-pretraining.md) |

### 3.8 公開・配布・ライセンス

| 日付 | 変更 |
| --- | --- |
| 09-09 | CM発表に向け、導入できる配布単位（QEMU Developer Preview）を作る（RQ16）。「RockstarOS 1.0」として発表（RQ17） |
| 09-10 | 利用者申告でCM制作は完成。8時間のリリース作業。判定は BLOCKED_FOR_LAUNCH |
| 09-11 | 権利者名 kaiya。自作部分の改変・再配布を許可する方向（MIT案）。新規Sitesを本人限定で公開 |
| 09-12 | 公開の最低条件を機械判定に（RQ30）。QEMU rc2を10要件へ固定（RQ31） |
| 09-19 | 既存Webサイトを本人限定から一般公開へ変更する方針（v1.86） |
| 09-20 | avocadoMini製品サイトをOSサイトと別ドメインで一般公開。OSの作業画面は管理者限定 |
| 09-21 | 公開Siteを全面英語化 |
| 09-22 | 公開用のRockstarOSコードをMITで公開（`418735f2`） |
| 09-24 | 公開SiteをAstroへ移行し、R5へ同期 |
| 09-25 | GitHubのREADMEを英語化 |
| **10-05** | **`https://avocadomini.si` を公開**（Mini／Proの製品ホーム） |

---

## 4. 日付順の全記録

日ごとに「仕様の決定」と「この日に作ったもの」を分けています。commit数は merge を含む総数です。

### 期0 — LOOP / Rock star（09-04 〜 09-08）

#### 2026-09-04（4 commit）

**この日に作ったもの**
- LOOP automation hub の初期製品と発見ワークフロー（最初のcommit `2ec40b3d`）
- `Mr.` の自動化ツール4件を、ブラウザと持ち運べるローカル実行器で統合
- ファンドのマーケットプレイス（計画の保存、ワンボタンのMCP実行）
- LOOPをインストールできるアプリ（PWA）に

くわしく: [初期仕様](product.md) / [実装と次の接続点](architecture.md) / [ファンドとワンボタン実行](fund-and-mcp.md) / [Mr.からの取り込み](mr-integration.md)

#### 2026-09-05（13 commit）

**仕様の決定**
- Rock starを「自動化に特化したAOSPベースのOS」として設計する

**この日に作ったもの**
- 認証付きの自動化操作と手動会計のbackend、仕事の実行とプロジェクト追跡
- 永続する自動化coreとAndroid OS統合の試作。emulatorでBinderとSQLiteの流れを検証

くわしく: [OS開発設計書](os-development-design.md) / [P1実装と検証手順](os-prototype.md) / [LOOPバックエンド設計](backend-design.md)

#### 2026-09-07（2 commit）

**仕様の決定**
- 複数のGitリポジトリの役割と統合の境界を決める。正本は `k999ln/rock`

くわしく: [Gitプロジェクト統合方針](git-consolidation.md) / [参照元と採用判断](reference-repositories.md)

### 期1 — Rock star OS → RockstarOS 1.0（09-09 〜 09-11）

#### 2026-09-09（72 commit）— 確定要望の初回決定日

**仕様の決定**
- **v1.0**：「tobの商品をSkyで管理」「現在のツールも商品」「SkyとWalletで十分」「実行場所・課金・OSSへの対応」「Gitから最新進捗を調べて正確なプロンプトを作る」を固定 → **RQ01〜RQ11**
- **v1.1**：指摘した問題を解決する内容を次のプロンプトへ含める（RQ10）
- **v1.2**：現設計を最低限のベースとしてOS稼働まで進める（**RQ12**）。OS/ゲームとWallet・ゲーム通貨の交換、ATMとは独立（**RQ13**）
- **v1.3**：自作ゲーム作者が組み込みやすいWallet基盤（**RQ14**）。初稿は「手数料0＝ゲーム向け」と解釈したが、次の補足で訂正
- **v1.4**：「atm手数料の話」→ ATMでRockが徴収する手数料は0（**RQ15**）
- **v1.5**：進め方を「プロンプト作成 → 設計書を提示 → 確認・承認 → 実行」に
- **v1.6**：現進捗と設計を再照合して訂正（RQは不変）
- **v1.7**：CM発表に向けて導入できるOSにする（**RQ16**）
- **v1.8**：まず **RockstarOS 1.0** として発表し、現段階をベースに継続改善する（**RQ17**）。同版の補足でGTAのようなゲーム経済との接点、自動化で挑戦を増やす目的をRQ01へ明記
- **v1.9**：8原則に基づく製品・事業・開発設計
- **設計v1.1の実装承認を受領**。公開・実機・MetaMask実資金は「準備が整うこと」を条件に了承

**この日に作ったもの**
- native OS（Linux / Buildroot / ARM64 QEMU）のソースをRockへ統合（N01）。当時の方針は「初期製品端末はBlackBerry優先」「月888 cents固定」
- 凍結したOSで実boot・GUI・電源・復元を検証。WalletとATMの認証付きnative UI、A/B更新の失敗注入
- 合成ゲーム接続（GX00）の署名契約と複数ownerの分離

くわしく: [製品ベース RQ01〜RQ17](product-baseline.md) / [承認記録](execution-approval-20260909.md) / [native OS統合](native-os-integration.md) / [1.0構成](rockstaros-1.0-architecture.md) / [1.0戦略（8原則）](rockstaros-1.0-strategy.md) / [導入・リリース計画](release-installation-plan-20260909.md) / [Game API契約](game-api-contract-draft.md)

#### 2026-09-10（112 commit）— リリース実行の日

**仕様の決定**
- 利用者の申告でCM制作は完成済み。既存CMの確認と導入案内への接続が次の作業に

**この日に作ったもの**
- 約8時間のRockstarOSリリース実行。QEMU imageを「RockstarOS 1.0 Developer Preview」と識別
- 検証済みのpreview packagerと、隔離したLimaでの導入ライフサイクル
- Gameの見積・本人同意・復旧UI、参照SDKと空のsandbox、作者向けサンプル（GX01 / DX01）
- 凍結候補 `9abf78a` の同一候補受入（D0〜D6）。native CIの分割
- Webで自動化Hubを主作業画面に（`d713e504`）
- ローンチ判定は **BLOCKED_FOR_LAUNCH**（原TLS原因・LICENSE・既存Sitesアクセスが未解決）

くわしく: [実行checkpoint](release-execution-20260910.md) / [8時間作業の完了記録](release-followup-20260910.md) / [ローンチ準備](launch-readiness-20260910.md) / [同一候補の受入報告](os-acceptance-9abf78a-20260910.md) / [Game・Wallet・SDK作業記録](game-wallet-release-checkpoint-20260910.md)

#### 2026-09-11（16 commit）

**仕様の決定**
- **v1.10**：スマホ本体へ書き込めるOS版の作成を明示。Pixel 10は候補（機種・SKUは未確認）
- kaiyaの決定：権利者名 kaiya、自作部分の改変・再配布許可、新規Sitesの作成。MITの具体条文と署名方式は準備段階
- 多機種対応の方針（共通Core＋機種別package）を選択（製品ベース上は v1.11・09-12付）

**この日に作ったもの**
- rc2の導入・復旧の検証。本人限定のRockstarOS Site
- Pixelの固定source・端末product組込み・Linux build入口

くわしく: [スマホへ書き込むRockstarOS](phone-preview-20260911.md) / [kaiyaの決定と残る設定](owner-setup-20260911.md) / [MIT採用案](license-proposal-20260911.md) / [現在の開発状態（当時）](current-state-20260911.md) / [多機種対応設計](device-support-architecture.md)

### 期2 — Sky / Zema / Wallet（09-12 〜 09-16）

#### 2026-09-12（91 commit）— Skyの誕生日

この日だけで版が v1.11 から v1.29 まで進みました。

**仕様の決定**
- **v1.11**：Instagram運用・受注型ファッションブランド管理を商品として追加
- **v1.12**：自動化ツールの入口を **Sky** と命名
- **v1.13**：基本アプリを **Sky / Chat / Wallet / Polymarket** の4つに（**RQ18**）
- **v1.14**：Fashion Brand Opsを目標駆動のブランド経営エージェントへ（**RQ19**）— Campaign Autopilot、AI Sales Concierge、Production Cockpit
- **v1.15**：Skyで月額8.88 USDを実際に回収する（**RQ20**初版・Stripe先払い）
- **v1.16**：tobからSky利用料と売上手数料を取らない（**RQ21**）
- **v1.17**：MCPの機能はSkyの中に入れる。sidebarをやめる（**RQ22**）
- **v1.18**：実在するローカルMCPと導入・利用の導線を一致させる（**RQ23**）
- **v1.19**：**RQ20を訂正** — 先払いではなく、稼いだ後だけ最大8.88 USDを精算
- **v1.20**：MCPごとの接続先を「このPC／Sky Cloud／提供者のMCP」から選ぶ（**RQ24**）
- **v1.21**：MCP接続を自動化ツール共通のConnectorに（**RQ25**）
- **v1.22**：ホーム画面と設定アプリをOSの標準入口に（**RQ26**）
- **v1.23**：OS保全機能（診断・暗号化バックアップ・復元・更新確認）を設定へ（**RQ27**）
- **v1.24**：メルカリを最初の収益経路に（**RQ28**）
- **v1.25**：最低限のOS運用と公開条件を設定へ（**RQ29**）
- **v1.26**：公開の最低条件を機械判定し、完了まで追跡（**RQ30**）
- **v1.27〜v1.29**：QEMU rc2を同一byte列の証拠へ固定（**RQ31**）。10要件中6件合格

**この日に作ったもの**
- Skyのタイムラインとツール掲載、役割ベースの入口、ワンタップのTool接続
- Rockstar Ledger（サブスク顧問）、日本語の法務受付、特許出願アシスタント
- Fashion Brand OpsのMCP、メルカリ収益スターター
- カスタマイズできるHome、設定の診断と暗号化復旧、動的な自動化ファンド

くわしく: [Sky](sky.md) / [役割エージェント仕様](sky-role-agents-20260912.md) / [MCPアーキテクチャ](sky-mcp-architecture.md) / [MCP Connector](sky-mcp-connector.md) / [Sky経済設計](sky-network-economy.md) / [収益精算](sky-billing.md) / [メルカリ収益ループ](mercari-revenue-loop.md) / [Fashion Brand Ops統合](fashion-brand-ops-integration.md) / [最低公開条件](release-minimum-gates.md) / [QEMU配布完了監査](qemu-release-completion-audit-20260912.md)

#### 2026-09-13（35 commit）— Walletと市場

**仕様の決定**
- **v1.30**：Android物理端末を5つの必須gate、マイナンバーを7つの必須gateへ固定
- **v1.31**：分散した良い実装を正本へ統合し、GitHubと本人限定Siteを同一commitへ収束（**RQ32**）。Chatは接続済み商品と任意MCPをbotとして扱う
- **v1.32**：全画面からHomeへ直接戻れる（RQ26へ追加）
- **v1.33**：Polymarketの再販売ではなく、あらゆる価値を扱う独自のPAPER市場と、実績で更新する自律ファンド（**RQ33**）
- **v1.34**：Wallet会社・ファンド会社の固有機能はOSが抱えず、交換可能な外部Providerとして受け入れる（**RQ34**）
- **v1.35**：最初のProviderはRock自身のSettlement Wallet（**RQ35**）
- **v1.36**：Base MainnetのUSDCを本番受取レールとして接続（**RQ36**）

**この日に作ったもの**
- 本人別の永続Wallet台帳、収入・経費の作業画面
- Chatでの接続MCP botの管理
- 汎用PAPER市場と自律ファンド、nativeのValue/Spend runtime

くわしく: [Market / 自律型ファンド](everything-market-and-autonomous-fund-20260913.md) / [外部Provider境界](external-wallet-fund-provider-boundary-20260913.md) / [Settlement Wallet](rock-first-party-settlement-wallet-20260913.md) / [本番受取レール](rock-wallet-production-rail-20260913.md) / [Android実機・マイナンバーgate](android-and-personal-number-gates-20260913.md)

#### 2026-09-14（3 commit）

**この日に作ったもの**
- Base USDCの精算レールと、本番配備の記録

#### 2026-09-15（52 commit）— Zema、avocadoOS、目的の固定

**仕様の決定**
- **v1.37 / v1.38**：Rock Studioを「Skyのコードを既存ツールへ付けてTool化する」画面に（**RQ37**）。最初は「コードかファイルを貼る」方式、同日「やっぱコードがあってそれをつける方が楽」でSDK方式へ
- **CSV販売実証**：最初の販売実証をCSV整形に絞る（購入者試験価格 税込3,000円）
- **v1.38**：製品紹介を主役にし、Developer Previewの導入を案内（**RQ38**）
- **v1.39 / v1.40**：紹介ページ・Rock Studio・OS全体のvisual systemを統一（**RQ39・RQ40**）
- **v1.41**：Local Action AssistantをOSのローカルLLMに（**RQ41**）
- **v1.42**：OS Platform Coreへ登録・承認・Wallet・更新の安全境界を入れる（**RQ42**）
- **v1.43〜v1.48**：仕事とCSVをSky内へ、サイドバー廃止、スマホ幅対応、仕事管理をChatへ集約
- **v1.49**：**Chat → Zema**
- **v1.50**：SkyからZemaへ依頼を一回だけ引き継ぐ
- **v1.51**：正式製品名を **avocadoOS** へ変更（09-17に復元）
- **v1.52**：共通製品版を `1.0`、段階を `Developer Preview` に固定（**RQ44**）
- **v1.53**：運営1名による緊急保護と限定保守アクセス（**RQ45**）
- **v1.54 → v1.55**：端末管理画面を利用者Web内の `/operator` として実装 → 同日、利用者OSから分離した **Operator Dock** へ訂正（**RQ46**）
- **v1.56**：有料のOS full buildと実機flashは最後に行う
- **v1.57**：最上位目的を「AI自動化チームの所有と効率化」へ固定（**RQ47**）
- **v1.58**：Tool完了 → 署名付きEarning Receipt → Walletへ一度だけ反映、のbridgeが合格
- Pixel 10を最初の実機対象に選定

**この日に作ったもの**
- チャット形式のSky tool studio → SDK優先のStudio
- CSVの有料整形ワークフロー、Platform Coreと保存境界
- Operator Dock、Android事前試験

くわしく: [Sky Tool SDK / Rock Studio](sky-tool-sdk.md) / [CSV仕事 v1](csv-business-v1.ja.md) / [Local Action Assistantの導入](local-ai-os-integration-20260915.md) / [Platform Core](platform-core.md) / [緊急アクセスとインシデント対応](security-incident-response.md) / [製品北極星](product-north-star-20260915.md) / [フロント機能性監査](frontend-usability-audit-20260915.md)

#### 2026-09-16（20 commit）— Pixel実機とAIネイティブOS

**仕様の決定**
- **v1.59**：最初の物理対象を日本向け **Pixel 10 GL066 / `frankel`** へ確定
- **v1.62**：外部Providerは初回OS full buildへ焼き込まず、更新可能なアプリ／サーバー側へ分離
- **v1.63**：全体構成監査。**BlackBerry-firstとQEMU-firstのスマホ優先順位を退役**
- **v1.70**：製品中核を「高性能で交換可能なローカルLLMとoffline agent runtimeを持つAIネイティブOS」へ（**RQ48**）
- **v1.71**：Astraが設計、Solが独立監査

**この日に作ったもの（実機で確認できたもの）**
- **v1.60**：所有Pixel 10でQwen3-0.6Bの機内モード推論、再起動後の保持、33分22秒・15推論の熱試験（最大34.4℃）
- **v1.61**：PixelのTool／端末Walletと、署名済みBilling Walletを同じ実行IDで相関
- **v1.64**：Local AI plan v2 → Zemaの計画 → 2つのTool → 結果・履歴までPixelで完走
- **v1.65**：native Skyの選択をBrokerへ永続化
- **v1.66**：backup v2（24単語のrecovery secret）
- **v1.67 / v1.68**：hardware credential署名のOperator Agent
- **v1.69**：full buildの入力freeze

くわしく: [AIネイティブOS設計](ai-native-os-architecture.md) / [Sol独立監査](ai-native-os-design-audit.md) / [全体構成監査](system-composition.md) / [Android production architecture](android-production-architecture.md) / [バックアップ・全損復元](android-backup-recovery.md) / [初回flash前の固定gate](android-first-flash-gate-20260916.md)

### 期3 — avocadoMini（09-17 〜 09-26）

#### 2026-09-17（4 commit）

**仕様の決定**
- **v1.72**：正式製品名を **RockstarOS** へ戻す（**RQ43**）。avocadoOSは09-15〜16の旧表示名として履歴と署名済み証拠の中にだけ残す
- **v1.72**：物質同士を組み合わせて発明候補を作る **Material Invention Core** を追加（**RQ49**）
- **料金方針の訂正**（条件確認中・未実装）：Sky経由で利益が出た分に対する割合の成功報酬へ

**この日に作ったもの**
- **v1.73**：二物質・複数比率・工程条件から候補graphを作る、装置非接続のsandbox Core

くわしく: [Material Invention Core](material-invention-core.md)

#### 2026-09-18（10 commit）— 設計書の日

**仕様の決定**
- **v1.74〜v1.77**：四方向センサーで物質のdigital twinを操作する **Spatial Invention Studio** と端末 **avocadoMini** を設計。「見て分かる」構成へ全面改訂
- **v1.78**：OS本体から全Toolまでの詳細設計を正本化（全設計ポータル）
- **v1.79 / v1.80**：Jev UltrafastとJev ecosystem 10件をSkyの候補に（当時 ready 11・candidate 13・計24）
- **v1.81**：Decision Fabricの完成設計
- **v1.82**：最終製品目標をビリヤード台規模のFull-scaleへ具体化

くわしく: [全設計ポータル](rockstaros-design-portal.md) / [OS全体詳細設計](rockstaros-complete-design.md) / [全Tool詳細設計](sky-tools-complete-design.md) / [見て分かる空間発明システム設計](rockstaros-avocado-mini-complete-design.md) / [Jev ecosystem設計](jev-ecosystem-integration-design.md) / [Decision Fabric](jev-local-qwen-decision-fabric-design.md)

#### 2026-09-19（17 commit）— ハードウェアを表の主役に

**仕様の決定**
- **v1.83**：表に出す主役はハードウェア製品。最初の製品構想はavocadoMini。技術開発の優先順位は変えない
- **v1.84**：無料配布を理念とし、OSは従量課金制
- **v1.85**：売りはRock側の収益方法からではなく、利用者が何をしたいかから説明する
- **v1.86**：既存Webを本人限定から一般公開へ
- **v1.87**：最上位の入口は3つ — 製品紹介・OS導入のホームページ、作業するアプリ、OS本体。avocadoMiniは「考える時間を、つくる時間に」、希望参考価格41万円
- 製品・OS導入ホーム `/rockstaros` に8つの利用領域を追加。クラウドファンディングの企画案

くわしく: [製品・サービス・システム関係図](rockstaros-product-system-map.md) / [クラウドファンディング案](avocado-mini-crowdfunding.md) / [LLM・評価モデル設計](llm-evaluation-architecture.md)

#### 2026-09-20（87 commit）— 製品サイトとMotion Tower

**仕様の決定**
- 製品形状を、提供画像に合わせて銀色の三段伸縮式センサータワーへ修正
- `/` はOSの利用画面、`/rockstaros` は製品ホームとして分離。さらに製品サイトを別ドメインで一般公開し、OSの作業画面は管理者限定に
- **Motion Tower P0.2** の設計書を採用（タワー4本＋Edge Hub 1台）。旧160mmベース・単体塔41万円・無条件1,800mmの表示は撤回
- 予約販売価格を **1本16万円、4本41万円（税別）** に指定。旧「41万円税込の目標価格」は撤回
- 製品ページ最下部を「RockstarOS」と導入ボタンだけに（Screwと同じようなWeb導入体験）。ただしPixel向けfactory imageは未作成
- **GTA6連携の訂正**：「提携できるのはRockstarと話がついているから」。合意の対象と公表できる表現は未特定
- 製品サイトの見た目を4回指定（センサー正面の光 → 全体を青へ統一 → 黒い製品写真へ戻す → 回転ツアーの再配置）
- **v1.73（LLM実装追記）**：端末内Qwenは非信頼planner、OpenAIは2 Tool内、Jevはremote evaluator

**この日に作ったもの**
- スタンドアロンのavocadoMini製品サイト、全画面の回転ツアー、予約販売の店舗とbackend（決済は未開始）
- SkyのTelegram tool activation、ローカルモデルのcatalog、ZemaのチャットルームのUI修正
- JevのDecision Fabric host層、PixelでのJev preview

くわしく: [Web workstream](workstreams/05-web-pwa-sites.md) / [Local LLM接続監査](local-llm-connection-audit-20260920.md) / [旧Mr. Hub自動化のSky導入設計](sky-mr-automation-candidates.md)

#### 2026-09-21（33 commit）— 1日で3つのMini

**仕様の決定**
- **v1.88**：使用時20cm、ゲーム機から開発・創作・研究・生活へ広げる **Mini200 E1**。日本語音声認識
- **v1.89**：ゲーム機を主な入口とし、生活全体をより豊かにするOSへ。端末内自律動作と衛星通信の設計追補
- **v1.90**：公開Siteの画像を示し、形を「銀色の伸縮式タワー4本と低い中央ユニット」に確定（**Mini200 E2**）
- **IP／動画／ゲームの交換可能Provider方針**：Higgsfield・Roblox・YouTube・GTAを固定の型にせず、共通capabilityで選べる構成に

**この日に作ったもの**
- 公開Siteを全面英語化、予約backendの強化
- Rocket Starのミッションページ、Sky/Zemaのpublic previewインストーラー
- avokado Proのcompute server構想（同日revert）

くわしく: [Mini200 E1](avocado-mini-mini200-e1/README.md) / [ゲームを入口に生活全体を豊かにするOS](avocado-mini-mini200-e1/game-first-life-connectivity.md) / [Mini200 E2](avocado-mini-mini200-e2/README.md)

#### 2026-09-22（8 commit）

**仕様の決定**
- **v1.91**：**Tower20 E3** を現行製品基準に採用。200mm以下の固定式タワー4本＋別筐体Edge Hub。1本16万円＋税、4本＋Hub 41万円＋税

**この日に作ったもの**
- 公開用RockstarOSコードをMITで公開。Sky toolの審査と利用収集の強化

くわしく: [Tower20 E3](avocado-mini-tower20-e3/README.md)

#### 2026-09-23（6 commit）

**この日に作ったもの**
- Tower20 E3のハイライト画像、写実的な180°回転、npm導入手順

#### 2026-09-24（49 commit）— R5、設計書完全版、料金保留

**仕様の決定**
- **v1.92**：**RockstarOS 設計書完全版 v1.0**（41ページ・32章）を新しい設計書として保存
- **v1.94**：**avocadoMini R5** を現行製品基準に。200mm以内の銀色円筒、1本で自律、別Edge Hub不要、同型mini増設、眼鏡なしで周囲に粒子が舞う表示、身体・手・日本語音声、ゲームから生活支援へ。E3の4本＋別Hub必須・旧価格は引き継がない
- **v1.94**：**rocketstar 設計書完全版 R1.0**（44ページ・35章）と全履歴を「漏れなく」保存
- **収益料金の保留**：8.88 USDの収益料金案は、収益を得る動線が確定するまで保留
- **端末の対外表示名を「avokado mini」に**〔復元した記録〕：ownerの訂正で、事業ブランド「avokado」と製品「avokado mini」を区別する変更がPR #40で作られた。`main` へは入らず、10-05に「現行のSIM起点の製品ページで上書き済み」として記録だけ統合された。現行表記は avocadoMini／avokadoPro のままで、**製品名はowner判断待ち**

**この日に作ったもの**
- プロジェクト別ガイド（`PROJECTS.md`）を新設し、全ToolをAIチームとして整理
- 公開SiteをAstroへ移行、R5へ同期、英語中心へ統一
- READMEをR5の製品画像とブランドGIFで刷新

くわしく: [R5統合基本設計](avocado-mini-r5/README.md) / [OS設計書完全版 v1.0（PDF）](rockstaros-complete-design-v1.0.pdf) / [rocketstar設計アーカイブ](rocketstar-design/README.md) / [プロジェクト別ガイド](../PROJECTS.md)

#### 2026-09-25（32 commit）— 参考価格の正式化

**仕様の決定**〔復元した記録〕
- **00:49 公開製品ラインと参考価格の正式化**：公開中のavocadoMini／avokadoProの構成と参考価格（1本 ¥160,000、4本 ¥410,000、Pro From ¥880,000／US$5,800、税・送料別）を正式とする。販売・決済は開かない。実機0件、R5の価格未確定は維持
- **01:26 先行開発の許可**：Coreのoffline仕事loopとGame最小loopを、OS統合（OS10）の完了前にhost／fixture段階で先に進めてよい。emulator・実機・OS統合の合格には転用しない
- **owner判断待ちとして残した項目**：R5とMini／Pro製品ラインの関係（MAT16）、外部製品名「avokado mini」（WEB21）、保留中の8.88 USDの後継条件（BIL04）、優先系列の一本化（ORG02）

**この日に作ったもの**
- READMEを英語へ翻訳（`2cd7c96b`）
- 公開SiteでavocadoMiniとavokadoProの製品ページを分離
- Core側のhost fixture：モデルprofileの登録と仕事への版固定（AI02）、範囲付き記憶（AI03）、外部書込みのoutbox（AI04）、capability交渉（AI05）、2D粒子sandbox（GAME01）

#### 2026-09-26（1 commit）— 3製品＋共通OS

**仕様の決定**
- **v1.95**：現行のハードウェア製品は **avocadoMini・avokadoPro・rocketstar** の3つ。RockstarOSは3製品に共通するOS。PC/Web・QEMU・Pixelは開発・検証環境
- P0.2・E1・E2・E3はMini／Proへ至る設計履歴であり、現行製品を増やさない
- 3製品とOSを責任単位へ分け、**avokado Mission Control**（AMC）で管理
- **ココナラをSkyの1つのToolへ統合**〔復元した記録〕：独立した「受託チーム」アプリをやめ、Skyの `coconala` の中で「応募前チェック」と「案件管理」（代表者が受注し、制作担当者へ個別に発注する記録）を切り替える
- OS全体の画面をavokadoのトーン（graphite・silver・pale blue）へ揃える〔復元した記録〕

くわしく: [Mission Control](mission-control.md)

### 期4 — SIM/eSIMを入口にしたサービス（09-27 〜 10-06）

#### 2026-09-27（167 commit）— 最もcommitが多い日

**仕様の決定**
- **v1.96**：指示をまず部隊へ分けて問題を細分化し、全進捗と過程・Goalを把握して、GPT等の目標へ一括で渡す管理ツール → **AMC Goal Orchestrator**
- Mission Controlの段階を 0〜5（要件整理／基本設計あり／試作済み／一部統合／実機受入／本番受入）へ明確化
- **Sky Marketの現行手数料は10%**。登録・接続・公開・基本利用料は0円。同日「決済もできるようにして」でStripe Connectの受取先登録・円の買い切り・Checkout・返金を実装
- **Campusレイヤー**：NYU / FIT / Columbia / Fordham / John Jay の文脈ごとにPeople・Projects・Opportunities・Events・Communities・Portfolio・Resources。NFC／QRタグから開く
- **avocado Miniの会話仕様**：Mini単体で独立、空間での個人登録、テレビやスマホを必須にしない、洋梨形ボタンと蔦の意匠を固定、**クリエイター80%：Mini運営20%**、GTA／Robloxは対応対象として検討

**この日に作ったもの**
- Agent Control Plane（Cursor Cloud Agentへの委任境界）
- Campusのデータモデル・API・画面・NFC入口
- PAPER専用のsandbox：Avocado Farm（集中流動性LP）、Meme Intelligence（ミームコイン候補評価）

くわしく: [AMC Goal Orchestrator](amc-goal-orchestrator.md) / [Sky経済設計](sky-network-economy.md) / [決済の実装と設定](sky-billing.md) / [Campus layer](campus-layer.md) / [Agent Control Plane](agent-control-plane.md) / [会話仕様アーカイブ](avocado-mini-conversation-2026-09-27/README.md)

#### 2026-09-29（3 commit）

**この日に作ったもの**
- avocado Miniの会話仕様をアーカイブ
- Skyの自動化マーケットプレイスと決済、AMCのGoal orchestrationとCodex bridgeをmainへ

#### 2026-09-30（mainへのcommitなし。作業はbranchで進行し10-05に統合）— eSIMとクラウド継続

この日と翌日の記録は、統合で `project.md` から落ちていたものを戻して書いています〔復元した記録〕。

**仕様の決定**
- **eSIM専用製品の開発着手**：製品をeSIMで完結させ、この段階では開発だけ行う。物理SIM購入・回線契約・課金は行わない（**10-02に撤回**）
- **端末圏外中のクラウド継続実行を必須要件へ**：受付・承認済みの仕事は、端末が圏外でもクラウドが続ける。受付receipt、親子共通の予算と期限、追加承認待ち、停止未確認、再接続時の照合
- **人・端末・サービス・ゲームへの適合**：GTAを含め「みんなに適合するシステム」。共通Coreとadapter、個人profile・端末能力・接続先仕様を分ける。eSIMの種別で機能を固定しない
- **エージェント間接続の要件**：Skyが能力の発見・比較・接続、Zemaが委任と成果管理、Core／Brokerが権限と共通予算。MCPを維持し、A2Aを公開仕様の候補にする
- **自社衛星網の構想**：衛星を飛ばして通信範囲を広げる方針を記録。長期の調査対象で、地域・速度・端末・周波数・費用・契約は未確定

**この日に作ったもの**
- eSIM発行・利用権連携のhost fixture（`toolkits/esim-bootstrap`）、A2A委任adapterと本人承認API、Brokerの承認証明
- eSIM・クラウド契約候補の公式APIと公開価格の比較

くわしく: [Sky Cloud継続実行](sky-cloud-continuity.md) / [A2A Bridge](sky-a2a-bridge.md) / [接続設計](sky-mcp-architecture.md) / [供給元の契約準備](provider-contract-readiness-20260930.md)

#### 2026-10-01（mainへのcommitなし。作業はbranchで進行し10-05に統合）— SIM/eSIMを入口に、Skyを独立サービスに

**仕様の決定**〔復元した記録〕
- **SIM/eSIMをRockstarOSサービスの入口とする製品方針**：物理SIM／eSIMの購入にRockstarOS・Sky・Zema・Agentの利用権を含めるサービスを主製品にする。OS binaryをSIMへ格納する想定、eSIMのみ、OS内のeSIM store、ハードウェア先行の前提を退ける（翌10-02に製品ベースの「現行製品方針」になる）
- **SkyをOS導入なしの独立サービスとしても提供**：OS内と単独アプリで同じマーケットプレイスを共有。同日、Sky専用サービスを一般公開
- **衛星接続のMVP経路**：自社衛星網を初期製品の前提にせず、既存携帯網のdirect-to-cell連携を先に調べる
- MCPの料金と直接実行の境界（価格不明・従量課金のToolは実行しない）、A2A委任の深さ・fan-out・同時実行の上限

**この日に作ったもの**
- 販売チャネル共通の利用権claim、SIM利用権の返金・失効、料金見積APIとZemaの見積表示、A2Aの価格quote・署名meter・Wallet hold
- Skyの `/sky/esim` ページ（購入は無効のまま）、Sky Market決済とWalletの統合詳細設計、Skyサービスのローンチ設計
- Local AIの記憶store、モデルprofileのZema接続

くわしく: [SIM/eSIM-led architecture](sim-led-product-architecture.md) / [購入とサービス利用権](sim-service-entitlement-claims.md) / [クラウドAgent供給元の比較](cloud-agent-provider-comparison-20261001.md) / [Skyローンチ設計](sky-launch-design.md) / [Sky Market決済・Wallet統合設計](sky-commerce-design.md)

#### 2026-10-02（25 commit）— 現行方針の日

**仕様の決定**
- **現行製品方針：SIM/eSIMを入口にRockstarOSサービスへ接続**。これ以前の「eSIM専用」「eSIM商品をOS内で販売」「ハードウェア先行」「交換可能な端末内LLM／OS自体を主商品とする」より優先
  - 物理SIMまたはeSIMの購入にサービス利用権を含める。購入先は直販に限らず、通信事業者・端末販売店・オンライン
  - 回線・SIM profile・利用権・OS/client導入状態を別々に追跡
  - 販売claimは購入明細ごとに一度だけアカウントへ結合。端末の共通認証はDevice Authorization方式
- **過去のeSIM限定方針を撤回**：「eSIMのみを配布形態にし、物理SIMを扱わない」は取り消し
- **Spider Guard**（新規 SYS15）：クモが秘密コード・個人情報のある場所を優先して守る継続監視を、表示デモではなくOS本体へ実装。同日の追加指示で、①クモの見た目（発光する関節脚・青い足先の輪・pink／cyanのcore）、②「セキュリティーエージェント」の役割、③自分のコードを貼ると自動検査するoffline HTMLとOS API

**この日に作ったもの**
- nativeのSpider Guardと送信前保護、offlineのコード検査、リポジトリの秘密スキャナ、CodeQL
- AI・MCP・保存・決済・Sky/Zemaの共通契約を集約するrefactor

くわしく: [SIM/eSIM-led architecture](sim-led-product-architecture.md) / [購入とサービス利用権](sim-service-entitlement-claims.md) / [Spider Guard](spider-guard.md)

#### 2026-10-03（23 commit）

**この日に作ったもの**
- SPIDERの修復サイクル（MCPのHTTPS空CA拒否、SDKの不正認証ヘッダー対策、旧MCP入口を同梱4機能へ限定 など）と依存更新

#### 2026-10-04（2 commit）

**仕様の決定**
- **IP Studioの音声・電話連携**：LiveKit Agentsによる音声会話と電話対応を追加。音声会話・発着信・録音・外部作用は別権限

#### 2026-10-05（163 commit）— 統合の日

**仕様の決定**
- **公開ホームページの独自ドメイン**：`avocadomini.si` に正本GitHubのホームページを公開。対象はMini／Proホーム
- **専用モデルの追加指示**：avokado専用モデルをゼロから事前学習し、端末内とクラウドの両方で使う。初回は追加費用なしで試作
- **GTA VIのプレイ対応要求**：「出来るようにして」。PS5／Xbox公式clientへのhandoffと、Proの将来PC版を分ける
- **Mini単体の携帯回線**：SIMをMini本体へ入れ、ProなしでMini単体が通信する
- **avokadoProの独立小型PC方針**：NVIDIA搭載のMac miniのような据え置き小型PC。AIとPCゲームを重視、販売目標80万円／台
- 「pr全部開発しきって」→ 残る全PR（15件）を統合
- **この日の統合で記録の一部が消えた**：05:09の統合（`ecb4b2af`）で、README・進捗ログ・全Tool設計などが09-29時点の内容へ戻り、09-25〜10-05の追記が落ちた。2026-10-07に文書を復元（[監査](merge-loss-audit-20261007.md)）。task台帳と設計台帳は戻していない

**この日に作ったもの**
- SIM/eSIM-led RockstarOS accessをmainへ（`97d185ea`）
- random-initの小型モデル学習の試作、ProのPC設計、Mini cellular設計、Miniのgame client（公式Remote Playへのhandoff）
- Sky Market決済とWalletの統合詳細設計、AMCの司令センターとCodexのエージェント役割
- Skyの商品詳細からZemaへの引継ぎ、Skyライブラリ、CSVの保持

くわしく: [事前学習設計](avokado-llm-pretraining.md) / [MiniからGTA VIを遊ぶための接続](mini-game-client.md) / [Mini cellular](avocado-mini-cellular.md) / [avokadoPro PC設計](avokado-pro-pc-design.md) / [Sky Market決済・Wallet統合設計](sky-commerce-design.md) / [Wallet統合詳細設計](wallet-commerce-design.md) / [Skyローンチ設計](sky-launch-design.md)

#### 2026-10-06（18 commit）

**仕様の決定**
- **既存OSへの機能追加**：「機能追加としてSky・データ回収・LLMをadd」。端末交換やOS書込みを求めず、既存OS上のWeb/PWAへ追加の入口を作る
- 「OS完成」の指示で、Pixel 10のcompile用sourceを署名検証済みの安定版 `2026100200` へ更新

**この日に作ったもの**
- Homeの「追加」（`/add`）と、暗号化した `.rockdata` を書き出すデータ回収（`/add/data`）
- Pixelのbuild成果物の検証、依存の脆弱性修正

くわしく: [既存端末への機能追加](sim-led-product-architecture.md) / [端末preview](phone-preview-20260911.md)

---

## 5. 撤回・上書きされた仕様の一覧

「昔そう決めたが、いまは違う」ものだけを集めました。古い文書を読むときの照合用です。資料そのものは履歴として保存されています。

| 以前の仕様 | 決めた日 | 上書きした日 | いまの扱い |
| --- | --- | --- | --- |
| 製品名 LOOP / Rock star / Rock star OS | 09-04〜09-09 | 09-09 | RockstarOS |
| 入口の名前 Hub / Automation Hub | 09-04 | 09-12 | Sky。`hub` は内部名としてのみ残る |
| 仕事管理の名前 Chat | 09-12 | 09-15 | Zema。`/chat` と `chat` は互換名 |
| 製品名 avocadoOS | 09-15 | 09-17 | RockstarOS。avocadoOSは09-15〜16の署名済み証拠の中にだけ残す |
| 初期製品端末はBlackBerry優先 | 〜09-09 | 09-16 | Pixel 10 GL066を最初の対象に。BlackBerry-firstは退役 |
| 手数料0はゲーム向け（初稿の解釈） | 09-09 | 09-09 | ATMの手数料の話（RQ15）。ゲーム料金は未定 |
| Skyの月額8.88 USDをStripeで先払い | 09-12 | 09-12 | 成果連動（検証済み収益からだけ回収）→ 09-24に保留 |
| tobの売上手数料は0% | 09-12 | 09-27 | Sky Marketの手数料は10% |
| 4つ目の基本アプリはPolymarket（外部市場の枠） | 09-12 | 09-13 | 独自のPAPER市場（Market）を提供。`/polymarket` は `/market` へ転送。Polymarketはデザイン参考。外部市場の接続・注文は未承認のまま |
| 仕事・CSVをホームの独立アプリに | 〜09-15 | 09-15 | Sky内のTool、管理はZema |
| 端末管理をWeb内の `/operator` に | 09-15 | 09-15 | 別配備のOperator Dock |
| Rock Studioはコード／ファイルを貼る方式 | 09-15 | 09-15 | SDKのコードを既存ツールへ付ける方式 |
| 固定の利用料（月上限888 cents） | 09-12 | 09-17 | 利益に対する成功報酬の方向（条件は未確定） |
| avocadoMini＝四方向の発明台・Full-scale | 09-18 | 09-21 | 別の研究profileとして保持 |
| 単体塔41万円・収納850mm／伸長1,800mm・ベース160mm | 09-20 | 09-20 | P0.2で撤回 |
| Motion Tower P0.2（4本＋Edge Hub、850〜1,800mm） | 09-20 | 09-21 | 設計履歴 |
| 41万円（税込の目標価格） | 09-20 | 09-20 | 1本16万円・4本41万円（税別）→ R5では未定 |
| Mini200 E1（20cm単体筐体） | 09-21 | 09-21 | 外観部分はE2で上書き。設計履歴 |
| Mini200 E2（4本＋中央ユニット） | 09-21 | 09-22 | 設計履歴 |
| Tower20 E3（4本＋別Edge Hub必須、旧価格） | 09-22 | 09-24 | 設計履歴。R5へ自動継承しない |
| 端末の対外表示名「avokado mini」（PR #40） | 09-24 | —（`main` へ入らず。10-05に上書き済みと記録） | 現行表記は avocadoMini／avokadoPro。製品名はowner判断待ち |
| 並行ブランチで付けた要望番号（RQ18、RQ26、RQ27、RQ32〜RQ34の別版） | 09-12〜09-15 | 09-12〜09-15の統合 | 番号は現在のRQと対応しない。内容は現行RQ19・RQ25・RQ33・RQ37などへ。全文は[監査の添付](merge-loss-audit-20261007/dropped-text.md#並行ブランチで書かれ番号が重なって落ちた要望全文) |
| 表の主役はハードウェア（avocadoMini） | 09-19 | 10-02 | SIM/eSIM主導のサービスが主商品。Miniは製品群の一つ |
| 交換可能な端末内LLM／OS自体が主商品 | 09-16 | 10-02 | ローカルLLMは対応端末向けの追加能力 |
| eSIMのみを配布形態にし、物理SIMを扱わない | 09-30 | 10-01〜10-02 | 物理SIM・eSIMの両方、複数チャネル |
| eSIM商品をOS内で販売する | 09-30〜10-01（Skyに `/sky/esim` を用意） | 10-01〜10-02 | SIM購入は入口。OS内のstoreを主商品にしない |
| avokadoProはMiniの入力を体験へ変える接続先 | 09-26 | 10-05 | 単独で動くNVIDIA搭載の小型PC |
| Skyの商品詳細画面でそのまま実行 | 〜10-05 | 10-05 | 詳細は確認だけ、実行は「Zemaで開く」から |

---

## 6. 未確定・検討中のアイデア

ここは **まだ確定要望（RQ）になっていない** ものの置き場です。製品ベースへ昇格するときは、ownerの明示指示と日付を付けて移します。

### 2026-10-07 会話メモ：無料Agentと「eSIMの解約ロック」

2026-10-07にownerから共有された会話の書き起こしの要点です。**決定事項ではなく、検討のたたき台**として記録します。

- **仕組みの案**：eSIMの中のOSにAgentが入っている。Agent自体は無料で使える代わりに、そのAgentを契約すると一定期間（例：3週間）は **eSIMの解約ができなくなる**。「3週間ロックする」とは、Agentの利用ではなくeSIM契約の解約をロックする意味
- **継ぎ足し**：契約更新日が10-16の人が10-10に「3週間使ってください」というAgentを契約すると、更新日を越えて解約できない期間が延びる。Agentを足すたびに継ぎ足される
- **開発者に見せる例**：まずRock側が標準の便利なAgentを「無料・3週間ロック」で出し、Agentを作る開発者に「こういう設定もできる」と分かるようにする
- **手数料の考え方**：Rockは手数料を取らず、他社は取るだろう、という前提で話されている。開発者にもお金が回るようにする
- **たとえ**：YouTube Premiumの中で各チャンネルのサブスクを契約していて、それを続けたいからPremiumもやめられない、という関係
- **心理面**：お金を払うと人は元を取ろうとして使ってみる

**製品ベースへ入れる前に決める・確かめること**

1. 現行のSky Market手数料10%（09-27）との関係。「手数料を取らない」をこのAgentロックの対象だけに適用するのか、Sky Market全体を変えるのか
2. 現行方針（10-02）は「OSのbinaryをSIMへ入れる前提にしない」。会話の「eSIMの中にOS、その中にAgent」という言い方との整合
3. ロック期間の上限、継ぎ足しの上限、利用者への事前表示と同意の取り方
4. 通信契約の解約を制限する条件は、提供地域ごとの法規制（解約制限・違約金・表示義務など）の確認が必要。販売・開通の連携は契約前
5. ロック中に利用者が解約を求めたときの扱い（返金、Agentの停止、例外）

---

## 7. この文書の更新ルール

- 仕様が変わったら、まず [製品ベース](product-baseline.md) と [`data/product-baseline.json`](../data/product-baseline.json) を更新する（従来どおり）。そのうえで、この文書の3か所に追記する。
  1. [日付順の全記録](#4-日付順の全記録) の該当日に「仕様の決定」を1行
  2. 既存の方針を変えた場合は [テーマ別](#3-テーマ別何から何へ変わったか) の表に1行、[撤回・上書き](#5-撤回上書きされた仕様の一覧) に1行
  3. 現行の内容が変わった場合は [いま有効な仕様](#2-いま有効な仕様2026-10-06時点) の該当行と日付
- 「決めた」ことだけを書く。実装や試験の結果は [進捗ログ](../project.md) と各設計書へ。
- 提案やまだ決まっていない案は [未確定・検討中のアイデア](#6-未確定検討中のアイデア) に置き、確定仕様の表へ混ぜない。
- 古い行は消さない。上書きされたら「上書きした日」を足す。
