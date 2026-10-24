# avokado

<p align="center">
  <img src="docs/assets/readme/avokado-header.svg" alt="avokado — Mini / OS / Eve / Sky / Pro" width="100%" />
</p>

avokadoは、暮らしや空間で使うMini、共通の実行基盤となるOS、会話と仕事をつなぐEve、情報や機能に出会うSky、AI専用PCのProを開発しています。

Miniは暮らしとまちづくりへの貢献を目指します。ProはAIを使うためのPCを届け、その事業を通じて半導体や関連部品を確保できる基盤づくりを目指します。OS・Eve・Skyは、それぞれの製品やサービスを本人の権限と仕事につなぐ役割を持ちます。

このページでは **Mini → OS → Eve → Sky → Pro** の順に、何のための製品なのか、どう使うのか、どこまで開発できているのかを説明します。

[Mini](#mini)　／　[OS](#os)　／　[Eve](#eve)　／　[Sky](#sky)　／　[Pro](#pro)

詳しい確定要望は[製品ベース](docs/product-baseline.md)と[製品方針JSON](data/product-baseline.json)、全体の進捗は[project.md](project.md)にあります。設計があること、コードがあること、公開されていること、実機や本番で使えることは、それぞれ分けて説明します。

<br>

---

<a id="mini"></a>

## Mini — 暮らしとまちづくり

<p align="center">
  <img src="docs/assets/readme/mini-architectural-hero-v1.png" alt="石と木のある建築空間になじむMini R5の製品コンセプト" width="100%" />
</p>

<p align="center"><sub>Mini R5の形状を踏まえて制作したコンセプトビジュアル。実機写真や性能の受入証拠ではありません。</sub></p>

<br>


### 目的と使う場面

Miniは、家庭や地域の空間に置いて使うことを考えた端末です。暮らしとまちづくりに貢献することを目的にしています。

R5を現行設計として、1本で使える構成を目指し、Proや建物Hubを必須にしません。

たとえば家庭では、声や手の動きを入口に、連絡や創作、遊び、許可した機器の操作を助けることを考えています。地域の施設では、案内や学び、住民が場所の使い方について意見を伝える入口などを活用案にしています。

まちづくりへの貢献は、機器を置くだけで成立するものではありません。その場所を使う人と管理する人が用途を決め、同意やプライバシー、手動で操作できる方法を含めて、一つの場所から確かめていく設計です。

### 設計の考え方

Miniは1本で使えることを基本にし、必要に応じて同型のMiniやProと連携する方向です。建物に取り付ける場合も、住民個人の情報と施設共通の設定を分けます。

- [R5の設計](docs/avocado-mini-r5/README.md)

- [製品目的・住民と施設の責任・受入条件](docs/service-design/03-product-profiles.md#mini-pro-purpose)

- [Material InventionとMiniの詳細](docs/rockstaros-avocado-mini-complete-design.md)

200mm以内の目標、任意の建築一体型取付、任意の国内LTE/IoT data SIMを扱います。

### コードの場所

現在公開している製品紹介と、ブラウザで動くゲーム制作・投稿受付のコードです。実機を動かす完成済みファームウェアを示す一覧ではありません。

- [製品ページ](sites/avocado-mini/src/pages/mini/index.astro)

- [ゲーム制作ページ](sites/avocado-mini/src/pages/create/index.astro)

- [動くブラウザゲームの雛形](sites/avocado-mini/creator-kit/)

- [投稿受付Worker](sites/avocado-mini/worker/participation.mjs)

ブラウザの制作機能とMini実機のソフトウェアは別の受入対象です。

### 現在の開発状況

[Mini公開サイト](https://avocadomini.si/)にR5と製品目的を掲載。ブラウザゲームとアイデア・ゲーム投稿の受付があります。製造承認は**保留中**で、R5実機試験の完了実績は0件です。

実機の表示・入力・通話・電源・熱・保存/復旧、地域での実証、建築施工は未受入。R5の価格・発売日は未確定で、予約・決済は停止中です。

公開した版と確認結果は[公開確認の記録](data/mini-pro-purpose-publication.json)に保存しています。

Material Inventionは2D候補比較とSky/Zema接続がある段階で、シミュレーション・実験室接続は未実装です。

<br>

---

<a id="os"></a>

## OS — RockstarOS

<p align="center">
  <img src="public-release/rockstaros/rockstaros-motion.gif" alt="RockstarOSの共通基盤を表したコンセプトアニメーション" width="100%" />
</p>

<p align="center"><sub>RockstarOSの世界観を表す既存GIF。OSの動作録画や実機受入の証拠ではありません。</sub></p>

<br>


### 目的と使う場面

RockstarOSは、各製品とサービスに共通する実行基盤です。本人性、権限、AI・Agentの実行、費用上限、端末適合、保存・復旧を共通のルールで扱います。製品名は **RockstarOS 1.0**、内部識別子は `dev.rock`、最初の配布ラベルはDeveloper Previewです。

OSは、誰の依頼なのか、どの機能を動かしてよいのか、費用はいくらまでか、結果をどこに保存するかを共通に扱います。別々の製品でも、こうした確認や仕事の引継ぎを最初から作り直さずに済む基盤を目指しています。

利用できる形は端末によって異なります。今あるPCやスマートフォンから使うWeb/clientと、端末そのものへ導入するnative OSを分けて開発しています。

### 設計の考え方

端末内のAI、本人用Linux、許可したCloudなど、仕事を実行する場所が異なっても、本人確認・権限・予算・成果の扱いを揃える設計です。ローカルLLMは対応端末の能力の一つで、全機種の必須条件ではありません。

- [全設計ポータル](docs/rockstaros-design-portal.md)

- [OS本体の詳細](docs/rockstaros-complete-design.md)

- [1.0構成](docs/rockstaros-1.0-architecture.md)

- [端末別設計](docs/device-support-architecture.md)

- [「RockstarOSを再設計」チャット](codex://threads/01a14d54-daee-7c30-87a8-faea84641a40)

OS本体の設計は、上記の「RockstarOSを再設計」チャットで確定した方針を大元にしています。

### コードの場所

端末で動くOSのコードと、既存OSやWebから使う画面・接続層のコードを分けて保存しています。対象端末に合う系列から確認してください。

- [native/Linux・QEMU](systems/rock-star-os/)

- [Android](android/)

- [OS接続層](os/)

- [Webの画面](app/)

- [共通業務の状態遷移](lib/workflow.ts)

- [native統合手順](docs/native-os-integration.md)

- [Linux toolkit](toolkits/sky-linux-local/README.md)

native統合手順にはOS系列ごとの実装・検証方法、Linux toolkitには開発用の接続手順をまとめています。

### 現在の開発状況

Web runtime、Linux/serviceとPixel/Lab adapterのコードをmainへ統合済み。Pixel 10 GL066 / frankelでは純正OS上の試験署名APKで非破壊の実再起動受入23/23が根拠です。

全OS build・正式署名・flash/boot・data/Keystore全損復元は未完了。[Pixelの境界](docs/phone-preview-20260911.md)。QEMU Developer Previewは独立した系列として保持し、最新候補の配布受入は[QEMU担当](docs/workstreams/06-native-qemu-release.md)で管理します。

eSIMは本人用Cloud Sky・Eve・Linuxサービスへの入口です。OS binaryをeSIMへ格納しません。既存OSのclient/browserと、機種ごとに署名・起動・復旧が受け入れられたnative OSを分けます。回線、SIM profile、利用権、client導入、OS導入も別の状態です。

<br>

---

<a id="eve"></a>

## Eve — 会話から仕事と成果へ

<p align="center">
  <img src="docs/assets/readme/eve-workflow.svg" alt="Eveの会話・承認・仕事・成果をつなぐ概念図" width="100%" />
</p>

<p align="center"><sub>Eveの仕事の流れを表した設計図。実際の画面や自動実行の成功を示す画像ではありません。</sub></p>

<br>


### 目的と使う場面

会話、依頼、承認、進捗、停止、成果、利用額を同じ本人・同じ仕事に結び付け、対応端末へ引き継ぐ窓口です。

Eveは「話して終わり」にせず、その会話から依頼した仕事が今どうなっているか、何を承認する必要があるか、成果はどこにあるかを追える窓口を目指しています。

たとえばSkyで見つけたAgentへ仕事を頼む場合、Eveから依頼内容や条件を確認し、進捗を見て、必要なら停止し、できた成果と使用額を確認する、という流れです。会話したこと自体を、外部送信や有料実行の許可にはしません。

### 設計の考え方

会話の履歴と実行中の仕事は結び付けつつ、別の状態として扱います。保存した履歴を開く操作と、仕事をもう一度動かす操作を分け、再読込や端末の変更で意図せず再実行しないようにします。

- [Eveを含むOSの最新設計](docs/rockstaros-complete-design.md#redesign-thread-home-sky-eve)

- [サービス間の共通契約](docs/service-design/02-system-contracts.md)

- [Agent・Toolと仕事の詳細](docs/sky-tools-complete-design.md)

既存Zema系の仕事・承認・費用契約を再利用します。

### コードの場所

会話を表示する画面、本人別に履歴を保存するAPI、暗号化や仕事の状態管理を行う処理が主な入口です。

- [会話と仕事の画面](components/sky-chat-workspace.tsx)

- [履歴パネル](components/eve-history-panel.tsx)

- [履歴API](app/api/eve/history/route.ts)

- [暗号化履歴](lib/eve-history.ts)

- [仕事の状態遷移](lib/workflow.ts)

### 現在の開発状況

会話の明示保存・読戻し・削除と、本人の成果をHTMLへ持ち出すコードをmainへ統合済み。

アカウント履歴には本人認証と運営側の `EVE_HISTORY_KEYRING` 設定が必要で、設定不足を保存成功と表示しません。履歴を開いても仕事は再実行しません。

実アカウントの別端末引継ぎは未受入です。

保存・復旧コードの統合範囲は[統合記録](data/runtime-integration-audit.json)を参照してください。

<br>

---

<a id="sky"></a>

## Sky — 情報とAgent・Toolの発見・接続

<p align="center">
  <img src="docs/assets/cover-sky.gif" alt="Sky — 役に立つAIを見つけるコンセプトアニメーション" width="340" />
</p>

<p align="center"><sub>発見と接続を表す既存GIF。実際の画面録画ではありません。</sub></p>

<br>


### 目的と使う場面

Skyは、情報やModel・Agent・Toolを投稿から見つけ、追加・接続するサービスです。仕事の依頼はEveへ引き継げます。Sky単体でも利用できる設計です。

Skyは、どんな機能があるかを知り、誰が作ったものか、何に接続するのか、どの権限と費用が必要かを確認する場所です。情報の投稿から、使ってみたいModel・Agent・Toolを見つける体験を目指しています。

見つけた機能を追加すること、サービスへ接続すること、実際に仕事を実行することは、それぞれ別の操作です。必要な設定や条件を確認したうえで、Eveへ依頼を引き継ぎます。

### 設計の考え方

Skyを使うためにMiniやProの購入、native OSの導入を必須にはしません。既存OSやブラウザからの単体利用も想定し、接続先ごとの互換性・権限・費用を確認します。

- [Tool全体の詳細](docs/sky-tools-complete-design.md)

- [MCPと接続の設計](docs/sky-mcp-architecture.md)

- [料金・usage・上限の契約](docs/sky-billing.md)

投稿の出典、作者・版・互換性、権限、費用、保存・復旧を扱います。

### コードの場所

画面、接続先を管理するAPI、コミュニティーで共有するOS版、配信・データ移行の処理をそれぞれ確認できます。

- [Sky画面と各Tool](app/sky/)

- [投稿型Home](components/home-screen.tsx)

- [接続hub API](app/api/sky/hub/route.ts)

- [共有OS版API](app/api/sky/community-os/route.ts)

- [Web配信とmigration](services/sky-web/)

### 現在の開発状況

投稿型Home/Sky、本人別保存、コミュニティーOSの版と鍵を扱うWebコードはmainへ統合済み。[総合・Sky入口](https://avoado.si/)があります。

実X投稿・独自For You・実MCP Providerの接続や、本番の料金・請求受入を一括で完了とは扱いません。[Web担当と公開記録](docs/workstreams/05-web-pwa-sites.md)。

機能の追加、商品の購入、仕事の実行、外部送信、課金は別の操作です。Cloud利用は事前見積・上限承認と明細を必要とし、許可済み予算を超えて実行しません。モデルの出力や作者の署名を権限承認へ昇格させません。mainと旧作業branchの料金案の差は[Git統合監査](docs/workstreams/10-git-ci-operations.md#redesign-thread-git)で別に照合します。

<br>

---

<a id="pro"></a>

## Pro — AI専用PCと半導体・関連部品の確保

<p align="center">
  <img src="docs/assets/readme/pro-studio-hero-v1.png" alt="銀色のAI専用PC avocadoProのStudio筐体コンセプト" width="100%" />
</p>

<p align="center"><sub>Studio筐体のコンセプトビジュアル。最初の試作候補A4-H2Oの実機写真ではありません。</sub></p>

<br>


### 目的と使う場面

Proは、AIモデルやAgent、制作・計算のための専用PCです。その製造・販売事業を通じて、半導体と関連部品を継続的に確保できる調達基盤を育てます。Miniなしで使う独立PCです。

利用者にとっては、AIモデルやAgent、制作処理を動かすための専用PCです。どのような仕事をしたいかに合わせて構成を考え、実際の性能・冷却・消費電力・保守性を確かめて製品にしていきます。

事業としては、PCの需要を把握し、検証した構成を継続的に製造・販売することで、GPU、CPU、メモリーなどの半導体と関連部品の調達につなげることを目指します。必要な部品や量を明確にし、供給元との関係や供給の継続性を育てる考え方です。

### 設計の考え方

ProはMiniの必須Hubではなく、単独で使うPCです。構成候補、見積、発注、納品、動作確認を分けて管理し、候補に挙げた部品をすでに確保した在庫として表示しません。

- [Proの詳細設計](docs/avokado-pro-pc-design.md)

- [製品目的・調達の責任と受入条件](docs/service-design/03-product-profiles.md#mini-pro-purpose)

- [部品・販売準備の台帳](data/avocado-pro-sales-readiness.json)

需要把握、構成検証、供給元との調整、発注・納品・品質検収を分けて扱います。

### コードの場所

公開ページの部品選択や構成保存、購入希望の受付を実装しているコードです。PC実機の組立・性能検証の完了を示すものではありません。

- [製品ページ](sites/avocado-mini/src/pages/pro/index.astro)

- [部品・構成選択](sites/avocado-mini/src/components/ProAssemblyWorkbench.astro)

- [構成操作と保存](sites/avocado-mini/src/pro-experience.js)

- [購入希望受付Worker](sites/avocado-mini/worker/pro-interest.mjs)

Miniと同じWebソース内にあります。

### 現在の開発状況

[Pro公開サイト](https://avocadopro.si/)で構成検討・保存・購入希望受付と事業目的を案内。最初の実機は銀色Lian Li A4-H2Oで試作する候補です。

実機組立・部品適合・供給契約・在庫確保・最終価格・決済・配送は未受入。半導体確保は事業目的であり、確保済みの実績ではありません。有料注文は開始していません。

公開した版と確認結果は[公開確認の記録](data/mini-pro-purpose-publication.json)に保存しています。

<br>

---

## 開発と検証

Node.js 22.13以降とnpmを使用します。Webのローカル起動:

    npm ci
    npx wrangler d1 migrations apply DB --local --config wrangler.local.jsonc
    npm run dev

Mini/ProのWebソースは [sites/avocado-mini](sites/avocado-mini/) に共通で保存します。正式ドメインのrootはWorkerで各製品へ振り分け、旧 `/mini/`・`/pro/` は正式URLへ転送します。

変更の検証:

    npm ci --prefix sites/avocado-mini
    npm run project:update
    npm run design:check
    npm run verify

実装の承認・受入gate、次の作業、検証結果は [project.md](project.md)、[進捗JSON](data/project-status.json)、[作業分野](docs/workstreams/README.md)を確認してください。[全タスクの進捗](project.md#全taskの作業進捗)も参照できます。作業数は製品の完成率を表しません。GitHub保存、mainへの統合、各サイトの配備は別に記録します。

<!-- project-overview:start -->
Updated: 2026-10-21 / 393 task records (32 parents, 192 children, 169 standalone; 361 execution units excluding parents): 114 done, 48 in progress, 230 planned, 1 blocked
<!-- project-overview:end -->

## 権利と公開・実機の境界

公開サイトは、総合・Skyの [avoado.si](https://avoado.si/)、Miniの [avocadomini.si](https://avocadomini.si/)、Proの [avocadopro.si](https://avocadopro.si/) です。各サイトの配備・DNS/TLS・表示の証拠と、実機・実Provider・本番課金の受入を区別します。本人用localhost Labや秘密情報は公開サイトへ移しません。

端末初期化・bootloader解除・flash、契約、実資金、外部送信は対象ごとの条件を確認します。Gitへ秘密鍵、原稿、本人データを保存しません。[配布計画](docs/release-minimum-gates.md) / [権利と配布物](public-release/rockstaros/README.md)。

Development: the explicit offline D1 alias helper is documented in [Git operations](docs/workstreams/10-git-ci-operations.md#git-04-explicit-local-d1-filename-alias-compatibility). It does not perform remote migrations or complete the Root/main schema union.

The offline alias helper requires SQLite authorizer/serialize/deserialize APIs (tested Node26.12.1), reviewed reference profiles and a second independently reviewed candidate before adoption. It never executes source SQL during planning.

Repository verification (`npm run verify`) uses Node26.12.1, matching the verify workflow and the accepted offline SQLite helper API boundary. `package.json` retains the existing application engine floor; it does not declare older engines capable of the offline helper. Tests are not skipped to emulate missing authorizer/serialization APIs.

Offline apply now requires an owned private0700 parent for both source copy and backup, trusted directory ancestry and a single-link complete rollback-journal SQLite copy with no recovery/WAL sidecars. It does not repair or modify a live database into that state. Backup snapshot bytes are saved, synced and restored through one O_EXCL/no-follow fd, held through the guarded commit; detected namespace replacement/disappearance refuses the operation. Single-operator offline copies are the scope; arbitrary root/same-UID host code is not isolated by this helper.
