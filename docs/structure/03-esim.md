# 03 eSIM — 「eSIMを入れる手間だけでRockstarOSが入る」の設計

現行位置づけ（2026-11-20本人確認）: SIM/eSIMはOS導入時に使う仕組み。主商品はmii、最小構成はNoah。以下は導入方式の設計であり、実回線発行・自動導入・全OS受入の実績ではない。料金・provider条件は既存の個別gateで確認する。

**2026-11-21 の決め（0章）が、この文書の1〜7章より優先する。** 1〜7章は消さずに残し、0章と食い違う所には「→ 0章」と印を付けた。

## 0. 載せる先と回線の型（2026-11-21）

### 0.1 一言で（2026-11-21 22:31 の本人の回答で更新）

**eSIM は、人のスマホと、自社の端末（mii の Hub・専用端末・車）の両方に出す。** 同じ「回線の profile」でも、入る場所が違うので、できることが違う（0.3）。

- 自社の端末では、自社クラウドへ届く唯一の回線であり、鍵でもある。
- スマホでは、今の回線の横に入る 2 本目の回線になる。主な役目は契約と入口。型は S（0.3.2）。
- OS 本体と Agent は、どちらの SIM にも入らない（0.2）。

同日 17:55 版の「スマホに売らない」は、本人の「1 は取り下げない」（22:31）で取り消した。

### 0.2 何が SIM に入り、何が入らないか

| 物 | 大きさ | eSIM に入るか |
| --- | --- | --- |
| eUICC（eSIM のチップ）全体の記憶域 | 約 400KB〜1MB（製品の公開値: ST33j 420KB、ST33j1m 1MB、Soracom industrial 最大 400kB） | — |
| 回線の profile（IMSI・ICCID・鍵・網の設定・小さな SIM アプリ） | 数十 KB | 入る |
| 端末アプリの署名の hash（Android の carrier privileges。ARA-M／ARF の規則 1 件は 20〜32 バイトの hash ＋ 8 バイトの権限） | 数十バイト | 入る |
| RockstarOS 本体・client・Agent・モデル | MB〜GB | **入らない** |
| 「plugin」 | — | 入るのは**利用権と鍵**だけ。Agent 本体は Hub・クラウドで動く |

### 0.3 スマホの eSIM と、自社の端末の eSIM の違い

| 項目 | スマホの eSIM | 自社の端末（Hub・専用端末・車）の eSIM |
| --- | --- | --- |
| 規格 | SGP.22（消費者向け）。スマホの中の LPA が、利用者の操作（QR・コード・iPhone の URL）で profile を入れる | SGP.32（IoT 向け）。サーバー側の eIM と端末の IPA が、人の操作なしで入れる・切り替える。工場で入れておく形もある |
| チップ | スマホのメーカーが選んだ物。こちらは profile を 1 枚入れるだけ | こちらが選ぶ（MFF2 のチップ型）。SIM の中のアプリ（applet）と鍵を、チップの供給元と決められる |
| profile の中身 | 回線の鍵（IMSI・ICCID・Ki/OPc）、網の設定、表示される回線名、Android 用の署名の hash（ARA-M の規則） | 同じ物 ＋ 端末の鍵を SIM の中に持たせる applet（GSMA IoT SAFE。SIM を信頼の起点にして、クラウドと相互 TLS）。無効化・削除を禁止するルール（PPR1・PPR2。企業が管理する端末で使われる物）も付けられる |
| OS から読めるか | iPhone: アプリからも Web からも、ICCID・EID・IMSI は読めない。Android: SIM に署名の hash を入れた自社アプリだけが読める（carrier privileges） | 自社の OS なので全部読める。account へ EID・ICCID で束ねる |
| データ通信 | **ふつうのスマホは、データ通信に同時に使える回線が 1 本だけ**（Apple 公式「one cellular data network at a time」。Android も多くの機種が同じ。実機で確かめる）。2 本目として入れた eSIM は、利用者がデータ回線に選ばない限り通信に使われない | 唯一の回線。自社クラウド行きの通信は全部ここを通る |
| 鍵としての働き | iPhone: 普段は通信に使われないので、SIM で本人を確かめられない（本人の確認はパスキー）。Android: 自社アプリが ICCID を account に束ねられる。どちらも、データ回線にした間は、網の側で SIM を確かめられる（SORACOM Endorse の署名付きトークン。取った後は Wi-Fi でも使える） | 網の側で常に SIM を確かめられる（Endorse・Beam）＋ SIM の中の鍵で相互 TLS（IoT SAFE） |
| 入れる人 | 利用者 | 工場か、自社の OS |
| 回線の種類 | 消費者向けのデータ回線。SMS を付けると、2026-05 の法改正で本人確認の対象になりうる（0.5） | IoT 向け。SMS なし。本人確認の対象外の方向（0.5） |
| 消す・やめる | 利用者が設定から profile を消せる。消しても契約は残り、請求は契約の解約で止まる | 端末の部品なので、利用者は消さない。やめるのは機器のサービスの解約 |

#### 0.3.1 ここから分かること

- スマホの eSIM の役目は、**契約（請求）と入口**が中心。鍵の働きは、Android の自社アプリと、データ回線にした間だけ。
- 自社の端末の eSIM は、**回線・鍵・入口の全部**を持つ。

#### 0.3.2 スマホの型（決定: S。2026-11-21 22:54「規定で進めて」）

| 型 | 中身 | できること | 引き換え |
| --- | --- | --- | --- |
| **S 2 本目（既定）** | 今の回線の横に入る 2 本目。SMS なし。通信は少量 | 契約と請求の形、iPhone の URL 1 つで入る入口、Android の自社アプリでの本人の束ね | 普段は通信に使われない。原価は基本料（例: SORACOM planX1 は月 $1.8 ≒ 282 円 ＋ 1MiB $0.02。eSIM profile は承認制） |
| M 主のデータ回線 | 利用者がデータ回線に選ぶ。全部の通信が通る | 網の側で常に SIM を確かめられる。回線として毎日使われる | GB を売ることになり、§1「GB を売らない」と衝突する。通信の質・サポート・値段で格安 SIM と比べられる。届出が要る |

#### 0.3.3 離脱率（本人の仮説として残し、測る。2026-11-21 22:31）

本人の言葉は「データでも eSIM は、アプリに比べて離脱率が低いはず」。17:55 版の取り下げは取り消した。

公開の数字:

- 米国の主回線（音声つきの後払い）の解約率は月 0.86〜0.92%（2026 年 4〜6 月期。Verizon 0.92%、AT&T 0.86%、T-Mobile は推計 0.9%）。
- サブスクのアプリの解約率は、中央値で月 7.5%（動画配信は 5.2%）。主回線との差は 8 倍ほど。
- データだけの 2 本目の回線の解約率は、公開の数字が見つかっていない。

データでも残る効き目:

- 毎日目に入るアイコンが無い。
- 「通信費」の枠で見られる。
- やめる操作が契約の手続きになる。

データでは弱まる効き目:

- 番号の持ち運び・端末の分割払い・家族割が無い。
- カードで請求すると、明細の見え方はアプリと同じ。口座振替やキャリア決済にすると強まる。

決まり:

- 解約を難しくする仕組みは作らない（§7）。PPR で消せなくする物を、スマホには付けない。
- **測り方（決定）**: 同じ値段・同じ機能で「eSIM つき」と「カードだけ（PWA）」を出し、月ごとの解約率と 3 か月の継続を比べる。
  - eSIM を入れた人だけの機能は作らない。機能が違うと、eSIM そのものの効き目と混ざる。
  - 請求は、どちらもカード。支払い方法（口座振替など）の比較は別の試験にする。
  - 2 つは Stripe の別の price（同じ額）で分ける。集計は `lib/churn-cohort.ts`（[task 103](../../codex/tasks/103-esim-churn-measure.md)）。

### 0.4 Hub の回線の型

| 項目 | 決め | 理由 |
| --- | --- | --- |
| 回線 | 国内 LTE、IoT 向けデータ専用、SMS なし。試作はカード、量産はチップ型で SGP.32 対応 | 10-10 の決めのまま |
| 通信先 | **自社クラウド（RockstarOS の制御・Agent・音声）だけ**に絞る（私設 APN か、端末側の宛先制限）。OS・モデルの更新、映像は Wi-Fi | 500MB に収まる。下の届出と本人確認で「他人の通信を媒介しない」側に寄せられる |
| 原価の目安 | 500MB を含んで月 385 円（SORACOM plan-K2 K2-500MB の定価・税込、使用中）。準備完了・休止中は月 192.5 円。初期費用はチップ型 1,111 円 | 2026-11-21 取得。卸値は見積りで変わる |
| 請求 | 回線料は機器のサービス料に含め、別の明細にしない（10-10 のまま）。決済は Stripe のカード | キャリア決済は通信会社と組む時だけ |
| 付ける順 | Wi-Fi が無い所（引渡し前の建築、車、工場、屋外、施設）から | 家庭は Wi-Fi があり、回線の価値が小さい |

### 0.5 制度（確かめていない。専門家と総合通信局に確認する）

- **電気通信事業の届出。** 総務省の参入マニュアル（追補版）は、回線の料金や条件を自分で決めて提供すると届出・登録が要り、変えずに機器と一緒に提供するだけなら要らない、通信を媒介しない IoT サービス（位置管理など）は要らない、と整理している。Hub の通信先を自社クラウドに絞り、回線料を機器のサービス料に含める形がどちらに当たるかは、総合通信局に聞く。
- **スマホの型 S は SMS を付けない**（下の本人確認の対象から外れる側に寄せる）。
- **本人確認（改正携帯電話不正利用防止法）。** 2026-05-22 成立・05-29 公布、公布から 1 年以内に施行。データ専用 SIM が対象に入る。総務省の制度整備の方向性（2026-07）は、SMS つきを対象にし、IoT 向けは対象外とする方向で検討中（範囲は未定）。**SMS なし・自社クラウド行きだけ**の Hub 回線は外れる側に寄せる。政令・省令が出たら確かめ直す。1〜7 章の「音声回線でなければ軽い」（§7）はこの改正で古くなる。

### 0.6 iPhone の人の入口（22:31 の回答で更新）

1. **eSIM の追加は URL 1 つ。** `esimsetup.apple.com` の universal link で、iOS 17.4 以降。
2. 追加の後に、Noah・Eve の PWA を開く。
3. eSIM を入れない人には、PWA の URL 1 つだけを見せる。

App Store のアプリは作らない（10-16「携帯はリモコン感覚。アプリは作らなくてよい」のまま。22:54 に決定）。iPhone の Web の通知は、ホーム画面に追加した時だけ届く。だから初回に「ホーム画面に追加」を 1 回だけ案内する（task 90 の通知と同じ扱い）。

### 0.6.1 回線の仕入れ先（決定 14。22:54）

- **第一候補は SORACOM。** Hub（IoT SIM のチップ型）と、スマホの型 S（eSIM profile。承認制）を同じ事業者でそろえる。SIM の証明（Endorse・Beam）と閉域（VPG）も同じ所で使える。
- 比べる候補は IIJ と 1GLOBAL（[provider-contract-readiness](../provider-contract-readiness-20260930.md) の比較のまま）。
- 問い合わせ・見積りの依頼は、本人の許可の後に送る（AGENTS.md §6）。質問票は [task 10](../../codex/tasks/10-esim-provider-research.md)。

### 0.7 既存コードの扱い

消費者向け eSIM のコード（`app/api/esim/**`、`lib/esim-*.ts`、`lib/esimgo-*.ts`、`toolkits/esim-bootstrap/`）は消さない。発行の gate（`providerDebitEnabled`）は既定で閉じたまま。Hub の回線は、端末の接続状態（[avocado-mini-cellular.md](../avocado-mini-cellular.md) の状態）と、account への端末束縛（`lib/rockstar-entitlement-*.ts`）で扱う。ICCID・EID を束縛キーに足す計画（02 §3）はそのまま。

### 0.8 この決めが変わる条件

- 0.3.3 の測り方で、eSIM つきの解約率がカードだけより低くなかった時。スマホの eSIM を続けるか考え直す。
- スマホの型を M にする時。§1 の「GB を売らない」を本人が変える。
- 政令で、SMS なし・IoT 向けも本人確認の対象になった時。Hub の回線にも本人確認の流れが要る。
- 総合通信局の答えが「届出が要る」だった時。届出をしてから出す（届出は登録より軽い）。

## 1. eSIMは何で、何ではないか

| | 決定 |
| --- | --- |
| 何のためか | **すでに持っているスマホに RockstarOS（＝Eve・Sky・本人の仕事）を入れる最短の手段。** OSをダウンロードして設定する手間を、「eSIMを入れる」一回に置き換える（→ 0章。スマホでは契約と入口、自社の端末では回線と鍵） |
| 売るもの | **RockstarOS の回線付き利用権**。月額。データ残量（GB）は売らない。通信は RockstarOS のcloudに届くための最小限で、GBで数えない |
| 売らないもの | 旅行用データeSIM、通話番号、他社回線の再販 |
| プロバイダと契約する理由 | 技術的に不可避だから（eSIM profileはMNO/MVNOのSM-DP+からしか出せない）。特にiOSは、Appleの規約上、アプリから直接eSIMを書くには通信事業者としての契約が要る |
| 契約の強さ | （→ 0.3.3。本人の仮説として残し、測る）回線契約と同じ重さ（カード/口座引落し、未払い時は回線停止）。**これを売り文句にはしない**。ユーザーには「使い続けたくなる価値」を見せる（2026-10-10 YouTube Premium型の結論を維持） |
| OS本体をeSIMに入れるか | **入れない。** eSIM profile は数十KBで、鍵・回線設定・アクセス規則しか入らない。OSの実体はcloud（RockstarOS runtime）とスマホ側のclient。eSIMは「鍵と回線」 |

導入の目標は、**eSIMをRockstarOSの鍵付き回線として使い、適合確認後にEveへ進めること**。自動導入は下記のprovider・端末・配布条件が整った場合に限る。

## 2. 条件付きの導入設計（Android / iOS）

```mermaid
flowchart LR
  A[購入/申込 avoado.si] --> B[SM-DP+ がprofileを用意<br/>（MVNOパートナー）]
  B --> C{端末}
  C -->|Android| D[eSIM有効化<br/>profile内ARF/BF76に<br/>avokado clientの署名証明書]
  D --> E[Play がcarrier appとして<br/>RockstarOS clientを自動導入<br/>（Google carrier partner）]
  E --> F[client が carrier privileges で<br/>APN・回線・本人束縛を設定]
  C -->|iOS| G[Universal Link<br/>esimsetup.apple.com で<br/>profileをワンタップ導入]
  G --> H[Eve を PWA / App Store app で開く<br/>（carrier app自動提示はAppleとの契約が要る）]
  F --> I[account ← EID/ICCID 束縛<br/>Eve が即使える]
  H --> I
```

- **Android**: eSIM profile のアクセス規則（ARF / BF76）に avokado client の署名証明書を入れると、client は *carrier privileges* を得る（APN・回線設定・`EuiccManager` 操作）。Google の carrier partner になると、SIM検出時に Play がその carrier app を自動導入する。これが「入れるだけでOSが入る」の実体。**（2026-11-21 訂正）** AOSP の公開資料と標準のコード（`InstallCarrierAppTrampolineActivity`）で確かめられたのは、SIM 検出時に「アプリを入れますか」の画面を出し、入れていなければ既定 24 時間後に通知し、押すと Play のページを開く所まで。**無言の自動導入は確認できていない**（Google との個別契約や OEM の実装次第で、未確認）。「入れるだけでOSが入る」とは書かない。Pixel向け native RockstarOS（GrapheneOSベース）は別系統で、eSIMはそちらにも同じ鍵を渡す。
- **iOS**: アプリ内でeSIMを書く `CTCellularPlanProvisioning` は Apple の entitlement（通信事業者契約が前提）が要る。無くても iOS 17.4+ の universal link（`esimsetup.apple.com/esim_qrcode_provisioning?carddata=LPA:1$...`）でワンタップ導入できる。導入後の「OS」は Eve の PWA または App Store app。iOSは client を深く入れられないので、**eSIMが本人と回線を束ね、Eveはcloud側で動く**。
- **共通**: account が正本（2026-10-15決定を維持）。eSIMは account に EID/ICCID を束ねる「鍵」。機種変更・mii・Pro・将来のロケットでも、同じ account の続きから動く（Apple の iCloud と同じ役割）。

## 3. これが成り立つ条件（Codexに調べさせる・決めさせない）

| 条件 | 現状 | 誰が決める |
| --- | --- | --- |
| profile metadata に自社証明書（ARF/BF76）を入れられる MVNE/MVNO | 未確認。esim-go のような再販APIでは普通できない。候補: 日本 IIJ（自社SM-DP+）, SORACOM, 海外 1GLOBAL/Truphone, Telna, Kigen, Thales | Codex task 10 で候補比較表 → 本人が選ぶ |
| Google carrier partner（Playの自動導入） | 未申請 | 本人 |
| Apple carrier entitlement（任意。無くても universal link で可） | 未申請 | 本人 |
| 電気通信事業の届出（日本: 届出電気通信事業者。米国: MVNOのFCC登録/CPNI/USF） | 未着手 | 本人（法務） |
| 私設APN / 通信をRockstarOS cloudに限定する設計（GBを売らない根拠） | 設計なし | Codex task 10 |
| 月額の請求と未払い停止（Stripe or carrier billing） | services/sky-billing に月次・後払いの骨格あり | Codex task 11 |

## 4. 現行コードとの対応

| 役割 | 現行 | 扱い |
| --- | --- | --- |
| カタログ/注文/発行/QR/導入証明/端末利用権/照合/webhook | app/api/esim/**, lib/esim-*.ts, lib/esimgo-*.ts（esim-go前提） | 骨格は再利用。**esim-go は「profileを出せる相手」としては暫定**。provider adapter 境界（lib/esimgo-provider.ts）を `lib/esim/providers/<name>.ts` に切り直し、ARF対応providerに差し替えられる形にする |
| 端末束縛・利用権 | lib/rockstar-entitlement-*.ts, lib/esim-device-entitlement*.ts, lib/esim-attested-device-activation.ts（Android key attestation） | 維持。eSIMの EID/ICCID を entitlement の束縛キーに追加 |
| 利用開始UI | app/connect, components/esim-purchase-setup.tsx, components/rockstar-service-setup.tsx | 文言を本定義に合わせる（「データ」「GB」を出さない） |
| 旧定義の文書 | docs/service-design/08-*, docs/native-os-integration.md の「通信＋si利用権bundle」節 | 本ファイルを正本にし、旧節は「2026-10-15版」と明記して残す |

## 5. 料金

候補額・月額・仕事の収益からの天引きは[05-business.md](05-business.md)を正本とする。ここで別の料金を定義しない。既存Wallet/settlement契約を使い、商品料金・通信・si使用料・外部実費を分ける。データ残量の販売を主商品にしない。

## 6. OS導入系統の検証順

製品全体の最初の受入は[00 全体像](00-overview.md#1-一言で)の本人Mac上のNoah。以下はその前提条件にはしない。

1. 準備済みsandboxで、発行・導入案内・Eveへの導線・account束縛を個別に確認。実回線発行や端末自動導入の合格へ読み替えない。
2. task10でproviderへの質問票と適合条件を整理。契約・申込・問い合わせの送信は本人の明示許可が必要。
3. provider・配布条件が確定してから対応adapterとAndroid/iOSの導入経路を検証する。
4. 請求・利用権・回線停止は既存課金契約とproviderの個別受入を通す。

## 7. 法務・規約の注意（売り文句にしない理由）

- 「解約しにくい」を売りにすると、日本の特定商取引法・電気通信事業法の説明義務、米国の州消費者保護法（自動更新・解約容易性）に抵触しやすい。設計上は普通の回線契約と同じ重さで良いが、**UIと広告では「いつでも解約できる」を明記**する。
- 回線を提供する時点で、日本では届出電気通信事業者（届出のみ、免許不要）。本人確認は音声回線でなければ軽い（→ 0.5。2026-05 の法改正でデータ SIM も対象に入る。この文は古い）。米国はMVNOとしてFCC登録・CPNI義務。これらは provider との契約形態（再販か、自社MVNOか）で変わる。
