# avokado / mii

miiは、声でEveに頼み、部屋に映った成果を手で操作するために開発している空間コンピューターです。

**[NoahでAgentを試す](https://avoado.si/noah/agents)**　·　[18秒で操作を見る](#catalog)

<a href="https://avocadomini.si/#technology">
  <picture>
    <source media="(prefers-reduced-motion: reduce)" srcset="docs/assets/readme/mii-tower-on-dock.webp">
    <img src="docs/assets/readme/mii-body-motion.webp" alt="円形ドックに載ったmiiの全景から、筐体の内部に寄っていく公式デザイン映像" width="100%">
  </picture>
</a>

*miiの外観と内部構造を描いたコンセプト映像。* [公式サイトで構造を見る](https://avocadomini.si/#technology)

<a name="contents"></a>

[暮らしの短編](#films) · [miiの構造](#mii) · [Eveに頼む](#eve) · [Noahで探す](#catalog) · [Macで試す](#noah-mac) · [全体構成](#architecture) · [開発状況](#status) · [コードと検証](#development)

<a name="films"></a>

## 暮らしの中のmii

料理で両手がふさがっているとき、手を止めずに残り時間を確かめる。公式サイトの短編「料理」は、その使い心地を描いています。

[![キッチンで調理を続けながら、手元の横にあるタイマーを確認する5秒間のコンセプト映像](docs/assets/readme/mii-kitchen.webp)](https://avocadomini.si/#quick-scenes)

*公式サイトの5本の短編。朝の光、集中するときの日よけ、外での制作、料理中のタイマー、夜の足元の灯りを描いたコンセプト映像です。*

[朝](https://d8j0ntlcm91z4.cloudfront.net/user_3ImsN7zDg5XAxCTCNf16qVkxzVQ/hf_20261028_201649_fe60d9fe-0cb2-4101-b833-4afbc7cfe769.mp4)　·　[集中](https://d8j0ntlcm91z4.cloudfront.net/user_3ImsN7zDg5XAxCTCNf16qVkxzVQ/hf_20261028_201649_1efcbbf2-15f6-4650-8089-16a7679b7ce3.mp4)　·　[創作](https://d8j0ntlcm91z4.cloudfront.net/user_3ImsN7zDg5XAxCTCNf16qVkxzVQ/hf_20261028_202029_48890df7-1fdf-49bf-b749-eae800aacdd5.mp4)　·　[料理](https://d8j0ntlcm91z4.cloudfront.net/user_3ImsN7zDg5XAxCTCNf16qVkxzVQ/hf_20261028_201647_7fafb347-3f1d-47e2-97fd-67e407a11d1c.mp4)　·　[夜](https://d8j0ntlcm91z4.cloudfront.net/user_3ImsN7zDg5XAxCTCNf16qVkxzVQ/hf_20261028_201650_242a20a0-0837-4b0a-827b-c90c76088834.mp4)

<a name="mii"></a>

## 声と手を受け取る、4本のTowerとHub

部屋の中で表示を指すと、四方向のTowerが手の位置を捉えます。別体のHub上でRockstarOSが入力をまとめ、表示層に渡す設計です。表示層は使う空間に合わせて差し替えられます。Towerが1本のときは、Eveの機能を限定して使う想定です。

[![miiのセンサー部の接写。黒い帯の中にレンズが並び、上下を銀色の筐体が挟んでいる](docs/assets/readme/mii-sensor-detail.webp)](https://avocadomini.si/#product-details)

*Tower上部のセンサー帯のデザイン案。* [miiの構造](docs/structure/01-mii.md) · [R5設計](docs/avocado-mini-r5/README.md) · [V2の比較研究](docs/mii/design/v2-study/README.md)

<details>
<summary>空間入力とMaterial Inventionの実装を見る</summary>

空間入力の実装と機種設定から、手の入力がどこで処理されるかを追えます。Material Inventionには再計算用sandboxと設計資料があり、シミュレーション・実験室接続は未実装です。[空間入力のコード](lib/mii-spatial-input.ts) · [機種設定](systems/rock-star-os/targets/avocado-mini/) · [Material Inventionの設計](docs/rockstaros-avocado-mini-complete-design.md) · [製品サイトのコード](sites/avocado-mini/)

</details>

<a name="eve"></a>

## Eveに、やりたいことを伝える

「今週の学習メモを、次に調べたいことと一緒に整理したい」。Eveでは、まず依頼を自分の言葉で書きます。入力欄の下で実行先・担当・基盤モデルを確認し、その仕事をどこに任せるか選びます。

![Eveに学習メモの整理を入力し、実行先・担当・基盤モデルの確認欄を開いた画面](docs/assets/readme/eve-request.png)

*Web版の実画面。依頼を書いたところで、実行先はまだ接続していません。* 会話は履歴から、依頼した仕事と成果は「仕事と成果」から開けます。実行には本人確認とToolへの接続・権限が必要です。[Eveを開く](https://avoado.si/os/eve)

<details>
<summary>Eveが依頼を工程に分け、成果を検収する仕組み</summary>

### 仕事の工程と検収

<img src="docs/assets/readme/eve-workflow.svg" alt="Eveの仕事環境のコンセプト" width="100%" />

Eveが目的を受け取り、Noaが道具とAgentをつなぎ、AMCが工程・担当・合格条件を決め、Jevが結果を検収します。下のデモでAMCの実行、別プロセスでの検収、差し戻しと再計画を試せます。成果の編集・持ち出しは、その仕事の保存方式に従います。

```sh
npm run amc:cycle -- demo
```

工程の組み合わせ、見積り、会社受注の分配を計算するライブラリと、募集文面を判定するCLIがあります。外部への応募・契約・納品・送金までの接続は開発中です。[仕事の計画](docs/sky-work-loop.md) · [実行・停止・復旧](docs/amc-goal-orchestrator.md#goalから逆算するローカル実行と再計画)

</details>

<details>
<summary>Eveのコードと担当設定</summary>

| コード | 内容 |
| --- | --- |
| [app/os/eve/](app/os/eve/) / [components/sky-chat-workspace.tsx](components/sky-chat-workspace.tsx) | 会話・仕事・Toolの画面 |
| [lib/workflow.ts](lib/workflow.ts) / [lib/work-store.ts](lib/work-store.ts) | 状態遷移・本人別保存・revision競合判定 |
| [docs/structure/04-eve-noa-amc-sky.md](docs/structure/04-eve-noa-amc-sky.md) | Eveと担当構成・実行・評価の責任 |

担当設定は[全社役割台帳](data/company-role-map.json)、[営業担当台帳](data/revenue-role-map.json)、[担当別の設定](.cursor/agents/)にあります。

</details>

<a name="catalog"></a>

## Noahで、仕事に合うAgentを探す

Noahはmiiの最小構成です。会議のメモを整理したいなら、公開カタログで「CowAgent」と検索して「詳細を見る」を開きます。配布元・費用・ライセンスを確認し、「Noahで接続して使う」から自分のMacを選ぶ画面へ進めます。

<a href="https://avoado.si/noah/agents">
  <picture>
    <source media="(prefers-reduced-motion: reduce)" srcset="docs/assets/readme/noah-first-agent-poster.jpg">
    <img src="docs/assets/readme/noah-first-agent-preview.webp" alt="公開中のNoahでCowAgentを検索し、詳細の接続ボタンからサインイン画面へ進む18秒の操作動画" width="440">
  </picture>
</a>

**[NoahでAgentを試す](https://avoado.si/noah/agents)**。閲覧・検索はスマホからできます。仕事を実行するには、サインインして自分のApple Silicon MacにRunnerを設定します。[Macの接続手順](#noah-mac)

[動画をダウンロード（MP4・18秒）](https://raw.githubusercontent.com/k999ln/rock/main/docs/assets/readme/noah-first-agent.mp4) · [オンラインサロン用の投稿文](docs/noah/online-salon-trial.md)

<a name="noah-tools"></a>

<details>
<summary>タイムライン、本人のライブラリ、セレクト・リセール</summary>

### タイムラインと本人のライブラリ

タイムラインの「Agent」「ニュース」「コミュニティー」で表示を切り替え、検索欄で絞り込めます。投稿やフォローにはサインインが必要です。保存した担当、端末、成果、購入・販売は「機能一覧」から開きます。[タイムライン](https://avoado.si/noah) · [機能一覧](https://avoado.si/noah/features)

<img src="docs/assets/cover-sky.gif" alt="Noahの発見と接続を表すコンセプト" width="340" />

*Noahの発見と接続を表すコンセプト。* 公開カタログは公開資料を使います。個人が登録したAgentは固定版を保存し、別の権限を持つ担当が審査してから公開版に追加します。公開審査には担当の設定、決済にはサービス接続と個別の確認が必要です。

### 本人用セレクト・リセール

ストリート、アーカイブ、オブジェの3担当が、候補・採算・共有予算・在庫・出品原稿・収支を扱います。Webの入口は `/noah/resale`。CLIのデモは外部通信なしで動きます。

```sh
npm --prefix toolkits/noah-resale-agent run demo
```

初期予算は0です。実購入・実出品にはAPI利用権、接続設定、予算、具体的条件を確認した記録が必要です。WebはD1、CLIはSQLiteに保存します。入金同期と無人運用は未検証です。[CLIの使い方](toolkits/noah-resale-agent/README.md) · [実行・停止・照合の仕様](docs/services/noah-select-resale.md)

</details>

<details>
<summary>Noahの画面・接続・Toolのコード</summary>

| コード | 内容 |
| --- | --- |
| [app/noah/](app/noah/) / [components/noah-timeline.tsx](components/noah-timeline.tsx) | 公開タイムラインと機能画面 |
| [lib/noah-surface.ts](lib/noah-surface.ts) | 公開側とMac側の遷移 |
| [services/sky-web/noah-page-routes.mjs](services/sky-web/noah-page-routes.mjs) | 現行URLと互換URLの対応 |
| [Mac API接続](scripts/noah-local-api.mjs) / [コード取得](scripts/noah-source-bytes.mjs) | 既存機能で共有する通信・容量照合。本人・招待・公開版の条件は各経路で保持 |
| [Tool詳細設計](docs/sky-tools-complete-design.md) | 入出力・権限・保存・失敗・復旧・受入 |

</details>

<a name="architecture"></a>

## 部屋、Mac、外部サービスのつながり

**Noah** でAgentを選び、**Eve** で依頼や成果を扱います。どちらも **RockstarOS** の本人確認・権限・予算・保存を使います。RockstarOSから右に伸びる実線が本人Mac、点線がスマホ向け公開版で使う提供者のAgentです。[全体の設計と各層の役割](docs/structure/00-overview.md)

```mermaid
flowchart LR
  B[スマホ・PCのブラウザ] --> N[Noah：Agentを選ぶ・つなぐ]
  B --> E[Eve：依頼・仕事・成果]
  M[miiのマイク・空間表示] -. 開発中 .-> E
  N --> R
  E --> R[RockstarOS：本人・権限・予算・成果の保存]
  R <-->|接続・実行・停止| L[本人のMac：Noah Runner]
  R -. スマホ向け公開版で接続予定 .-> A[外部サービス：提供者のAgent]
```

<details>
<summary>製品ごとの入口と開発状況</summary>

| 製品 | 役割 | 入口・現在の範囲 |
| --- | --- | --- |
| Noah | miiへ進む最小構成。Agentを集める・つなげる・載せる | [avoado.si/noah](https://avoado.si/noah)。公開カタログ・Agentの選択 |
| Eve | 依頼、担当設定、仕事、成果、停止、使用量の確認 | [avoado.si/os/eve](https://avoado.si/os/eve)。実行には本人確認と対象Toolの接続・権限が必要 |
| RockstarOS 1.0 | 本人性、権限、予算、仕事の状態、保存・復旧を共有するruntime | Developer Preview。Web、Linux/QEMU、Android/機種別OSを別々に受入 |
| mii | 声・手・表示・センサーを共通の仕事へつなぐ空間端末 | [avocadomini.si](https://avocadomini.si)。設計・ソフト試作段階 |

</details>

<a name="noah-mac"></a>

## 選んだAgentを、自分のMacで動かす

最初の実行先は本人のApple Silicon Macです。Runnerを入れ、自分のアカウントとMacを結ぶと、Noahの管理画面でAgentへの依頼、成果の確認、停止に進めます。

![NoahのMac接続画面。RunnerのダウンロードからMacの登録までが中央に並ぶ](docs/assets/readme/noah-mac-handoff.png)

*Web版のMac接続画面。中央にRunnerの入手先と、Macを承認する手順が並びます。* [Macを接続する](https://avoado.si/noah/mac)

<details>
<summary>Macの導入・実行・停止コマンドを開く</summary>

**画面**　[自分のMacをNoahにつなぐ](https://avoado.si/noah/mac)　·　**対象**　Apple Silicon Mac

1. 接続画面で「Mac用Noah Runnerをダウンロード」を選び、ZIPを展開して `Install.command` を開きます。
2. ターミナルで次のコマンドを順に使います。`noah doctor` の診断で不足したものがあれば、接続画面の導入手順を確認します。`noah pair` で表示されたURLを開き、自分のアカウントでこのMacを承認します。

```sh
noah doctor
noah pair
noah start
```

### 仕事を実行し、成果を確認して停止する

[Agentを使う](https://avoado.si/noah/launch)で自分のMacとAgentを選びます。依頼した仕事の成果と停止操作は同じ管理画面にあります。初めてサインインする場合は、本人確認を終えると登録やMac承認の画面に戻ります。

実行器全体を止めるには `noah stop` を使います。回線が切れた仕事は自動で再実行されません。再接続したら `noah receipts` で同じ仕事の報告を照合できます。

```sh
noah stop
noah status
noah receipts
```

</details>

<a name="noah-public"></a>

## スマホから頼んで、成果を受け取る

スマホ向けの公開版では、利用者がブラウザでAgentを選び、提供者のサーバーが処理を引き受ける設計です。「接続」を押し、入力を送り、成果を開き、使い終わったら接続を切る。この一周を公開に向けて開発しています。

<details>
<summary>スマホでの操作と、手元で試せる検索例</summary>

1. **選ぶ。** カードを開き、提供者と「入力はどこへ送られるか」を読みます。
2. **つなぐ。** 「接続」を押します。サインインが必要な場合は、認証後に同じ操作へ戻ります。
3. **頼む。** 道具を選び、必要な項目だけを埋めます。初回に確認が必要な道具は、送る内容を確かめてから依頼します。
4. **受け取って切る。** 仕事の一覧から成果を開きます。使い終えたAgentとの接続を切った後も成果は残ります。

### 入力が成果になる例

参照試験の検索用Tool `lookup` に、検索語 `mizan` と上限 `５` を入力すると、上限は数値に直して次の形で渡されます。

```json
{"name": "lookup", "arguments": {"query": "mizan", "limit": 5}}
```

この試験の接続先が返す表示は「mizan は 3 件」と「（画像 1 件）」です。手元で次を実行すると、外部に入力を送らずに同じ例を確認できます。

```sh
node --experimental-strip-types --test docs/design-validation/noah/noah-loop.test.mjs
```

公開の条件は、初めての利用者が自分のスマホで一周できることです。[公開までに作る順番](docs/noah/mvp-launch.md) · [各機能の仕様書](docs/noah/README.md)

</details>

<a name="rockstaros"></a>

## RockstarOSが仕事と端末をつなぐ

Eveに頼んだ仕事を別の画面で開くために、RockstarOSは本人のアカウントに権限・予算・仕事・成果を結び付けます。部屋のHub、Web、機種別OSで共有するのはこの仕組みです。端末ごとの入力・表示・更新・復旧は個別に検証します。

<details>
<summary>RockstarOS 1.0の対応端末と次の実機試験</summary>

**配布段階**　Developer Preview　·　**内部識別子**　`dev.rock`

| 対象 | 現在の範囲 | 次の受入 |
| --- | --- | --- |
| Web / 既存OS client | Eve・Noahと共通の仕事・保存・権限の実装 | 本人アカウント、外部Tool、別端末引継ぎの同条件確認 |
| Linux / QEMU | 独立したDeveloper Preview系列 | 配布する同一artifactの導入・保存・再起動・復旧 |
| Pixel 10 GL066 / frankel | Android clientと機種別OS準備 | 現候補での接続・復旧、正式署名、全OS build、flashと同一image受入 |
| mii | 共通runtimeへ接続するprofileと設計 | 実機の入出力・電源・停止・保存・復旧 |

端末内モデルの出力を外部操作に使う際も、実行先の権限と本人の承認を確認します。[native OS](systems/rock-star-os/README.md) · [Androidとnativeの区分](docs/native-os-integration.md) · [対応機種](docs/device-support-architecture.md) · [リリース条件](docs/release-minimum-gates.md) · [モデルの評価](docs/llm-evaluation-architecture.md)

</details>

<a name="esim"></a>

<details>
<summary>OS導入時のSIM・eSIMと使用料金</summary>

SIM/eSIMはRockstarOS導入時の回線に使います。対象機種と署名・復旧条件がそろった端末にはnative OSを案内し、そのほかの対応端末ではclientやブラウザを使います。OS本体は端末に置き、本人確認・回線・サービス利用権・インストール状態をそれぞれ管理します。

Cloud agentの実行前に単価・見積りと予算上限を確認し、実行後に項目別の使用量を照合します。商品料金、通信料、si使用料、外部実費、利用者自身の鍵での費用は個別に扱います。回線発行・本番決済は各providerとの接続試験が残っています。[SIM/eSIM設計](docs/structure/03-esim.md) · [料金と使用量](docs/sky-billing.md) · [導入試作](toolkits/esim-bootstrap/README.md)

</details>

<a name="status"></a>

## 今どこまで動くか

| 対象 | 確認できていること | 次に確かめること |
| --- | --- | --- |
| mii | R5を現行設計として試作中。製造承認は**保留中**です。R5実機試験の完了実績は0件です。 | 同じ実機で光学、熱、電源、停止、取り付け、警報を確認する。V2・天井型は比較研究の段階 |
| Noah・本人のMac | ローカルAPIと実コンテナで接続・実行・成果受領・停止を確認。配布ZIPは空の保存領域で導入を確認 | 初めて導入する別のMacと本番HTTPSを通して同じ一周を確認する |
| Noah・スマホ公開版 | 参照試験で検索の入力から成果までを確認 | 初めての利用者が本番で接続・依頼・成果受領・切断まで進めることを確認する |
| Eve・RockstarOS | Webの会話・仕事・成果の画面と共通の保存処理を実装。RockstarOS 1.0はDeveloper Preview | 本人アカウントと実行先を接続し、端末を替えて同じ仕事を再開する |

miiの販売・予約は受け付けておらず、価格と発売日は未定です。MacのRunnerは電源が入り、ネットワークにつながっている間に動作します。 [導入と実行の仕様](docs/services/noah-standalone-launch.md) · [検証記録](codex/tasks/71-noah-standalone-launch.md) · [進捗](project.md) · [mii公式の開発状況](https://avocadomini.si/#status)

<a name="development"></a>

## 開発と検証

### この作業フォルダで始める

複数の作業フォルダを使うときは、最初に `git status -sb` で現在のブランチと未コミットの変更を確認します。共通の作業方針は[GitHubのmainのREADME](https://github.com/k999ln/rock/blob/main/README.md)で確認できます。

リポジトリのルートで依存を入れて開発サーバーを起動し、ターミナルに表示されたURLの `/noah/features` または `/os/eve` を開きます。Node.js・npmと依存の指定は[package.json](package.json)と[package-lock.json](package-lock.json)にあります。

```sh
npm ci
npm run dev
```

### 変更した内容を検証する

`project:update` は進捗文書を同期します。`verify` は型、lint、テスト、設計、ビルド、ローカルAPIを検査します。本人の秘密情報は環境変数かGit外の保存先に置きます。

```sh
npm run project:update
npm run verify
```

macOSでHomebrewのOpenSSL 3を使う場合は `PATH=/opt/homebrew/opt/openssl@3/bin:$PATH npm run verify` で実行できます。DBやproviderの設定は対象機能の手順に従います。

| 作業 | 入口 |
| --- | --- |
| 製品要件・現在の名称 | [product-baseline](docs/product-baseline.md) / [名称正本](docs/structure/06-naming.md) |
| 現在の作業と設計 | [Codex task一覧](codex/tasks/00-index.md) / [文書地図](docs/README.md) |
| 分野別の実装・検証 | [workstreams](docs/workstreams/README.md) / [責任分界](docs/workstreams/00-responsibility-boundaries.md) |
| DBのschema・適用状態 | [database status](docs/database-status.md) |
| 製品全体・Tool詳細 | [design portal](docs/rockstaros-design-portal.md) / [Tool詳細](docs/sky-tools-complete-design.md) |

<!-- project-overview:start -->
更新日: 2026-11-20。現在の受入範囲と次の作業は[進捗](project.md)、全タスクは[全タスクの進捗](project.md#全taskの作業進捗)を参照してください。
<!-- project-overview:end -->

個々の変更とPRは[変更履歴](CHANGELOG.md)にあります。コードに残る `sky`・`zema` は互換性のための識別子です。公開サービス名はEveとNoahです。

ページの途中から別の項目に移るときは、GitHubのファイル上部にある「Outline」から各章や操作の見出しを選べます。[GitHubの目次の使い方](https://docs.github.com/ja/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-readmes#auto-generated-table-of-contents-for-markdown-files)

[目次に戻る](#contents)
