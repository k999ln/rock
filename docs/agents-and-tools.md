# エージェント・Tool総覧 — 何があって、それぞれ何をするか

時点: 2026-10-06（main `0fbf688b`）／ 作成: 2026-10-07

このプロジェクトにある **Tool・エージェント・部隊を全部並べて、それぞれの機能を一か所で読める** ようにした一覧です。

- **機械可読の正本はここではありません。** SkyのToolは [`lib/catalog.ts`](../lib/catalog.ts)、部隊は [`data/mission-control.json`](../data/mission-control.json)、LLMの役割は [`data/llm-capabilities.json`](../data/llm-capabilities.json) が正本です。この文書の第2章と第8章の表は、その正本から書き出したものです。
- 各Toolの入出力・保存・失敗時の扱いまで知りたいときは [Sky／Zema／全Tool詳細設計](sky-tools-complete-design.md) を開いてください。
- `ready` は「Skyの一覧から使い始められる」という状態で、外部サービスや本番決済までつながっているという意味ではありません。`candidate`（導入候補）は、まだ実行できません。

**目次**

1. [まず用語：「エージェント」は5種類ある](#1-まず用語エージェントは5種類ある)
2. [SkyのTool 35件](#2-skyのtool-35件)
3. [Skyの役割エージェント（担当）](#3-skyの役割エージェント担当)
4. [Toolの中にあるサブシステム](#4-toolの中にあるサブシステム)
5. [OSに入っているAIとAgent](#5-osに入っているaiとagent)
6. [クラウドのAgent](#6-クラウドのagent)
7. [LLM・モデルの役割](#7-llmモデルの役割)
8. [開発を進めるエージェント（AMC）](#8-開発を進めるエージェントamc)
9. [native OSに同梱した開発用Tool](#9-native-osに同梱した開発用tool)
10. [Toolkitとサービス](#10-toolkitとサービス)
11. [数え方の注意と、文書どうしの食い違い](#11-数え方の注意と文書どうしの食い違い)
12. [Toolを追加・変更したときに直す場所](#12-toolを追加変更したときに直す場所)

---

## 1. まず用語：「エージェント」は5種類ある

文書によって「エージェント」「Agent」「担当」「部隊」「Tool」が違うものを指しています。混ざると分からなくなるので、最初に分けます。

| 呼び名 | 何か | 数 | 利用者から見えるか | この文書の章 |
| --- | --- | ---: | --- | --- |
| **Tool**（商品） | Skyの一覧に並ぶ自動化。1つの仕事をする部品 | 35（ready 13＋候補22） | 見える。Skyで選ぶ | [第2章](#2-skyのtool-35件) |
| **役割エージェント**（担当） | 「サブスク顧問」「法務受付」のように、役割を持って会話で仕事を進める担当。許可されたToolだけを使う | 7（実装3＋構成案4） | 見える。Sky／Zemaで話す | [第3章](#3-skyの役割エージェント担当) |
| **OS内のAgent** | 端末の中で計画・実行・監視をする仕組み（ローカルLLMのplanner、Agent runtime、Security Agentのクモ、Operator Agent） | 4 | 一部見える | [第5章](#5-osに入っているaiとagent) |
| **クラウドのAgent** | 端末が圏外でも仕事を続ける、クラウド側の実行者。外部のAgentへ委任する経路（A2A）を含む | — | 見える。見積と承認のあとに動く | [第6章](#6-クラウドのagent) |
| **部隊**（AMC） | このプロジェクト自体を開発する体制。3製品＋OSを5師団32部隊に分けたもの。Codexの司令官・実行担当・検収担当を含む | 32部隊＋3エージェント＋10担当Bot | 開発者向け | [第8章](#8-開発を進めるエージェントamc) |

もう一つの原則として、**LLM・Agent・Toolは別物** です。LLMは「案を出す」、Agentは「許可された手順を進める」、Toolは「個別の処理をする」。権限を決めるのはどれでもなく、OSのBroker（Platform Core）です。

```text
利用者 ──→ Sky で Tool／担当を選ぶ ──→ Zema で依頼する
                                          │
                              LLM が計画の候補を返す（権限なし）
                                          │
                       Broker が owner・権限・費用・承認を確認する
                                          │
              Agent が許可済みの手順だけを進める ──→ Tool が処理する
                                          │
                     結果・receipt が Zema に戻る／費用と収益は Wallet へ
```

---

## 2. SkyのTool 35件

Skyに登録されているToolは **35件** です。使い始められる `ready` が13件、まだ実行できない導入候補 `candidate` が22件あります。

| 区分 | 件数 | 内訳 |
| --- | ---: | --- |
| ready | 13 | Rock側で作成 9件（AMCを含む）＋ `Mr.` 由来 4件 |
| candidate | 22 | Rock構想 1件 ＋ `Mr.` 由来 11件 ＋ 第三者 10件 |

Toolを使う前後の共通の仕組みは [Sky](sky.md) にあります：外部サービスの[接続情報の登録とProviderの差し替え](sky.md#接続情報の登録と再利用)、[Telegramから自作Toolを有効化するコード](sky.md#telegramからの有効化)、[サインイン切れや公開判定などの利用時の注意](sky.md#利用時の注意と復旧readmeに置かれていた案内)。

### 2.1 使い始められる13件（ready）

| # | Sky ID | 表示名 | 分類 | 由来 | 一言でいうと |
| ---: | --- | --- | --- | --- | --- |
| 1 | [`rockstar-amc`](#rockstar-amc) | AMC · Goalと部隊の進捗 | 計画・進捗管理 | Rock | 作りたいものとGoal・意図から計画を準備し、部隊・作業・確認待ちをZemaで管理します。 |
| 2 | [`rockstar-csv-cleanup`](#rockstar-csv-cleanup) | CSV整形・検査・納品 | 販売・収益化 | Rock | 1ファイルのCSVを指定どおりに整形し、結果・変更報告・独立検査を一つの受付から納品します。 |
| 3 | [`rockstar-markets-analysis`](#rockstar-markets-analysis) | avocadoOS Market Scanner | 市場・商品設計 | Rock | 型付きの価値対象をavocadoOS Marketへ登録し、価格・需要・PAPER取引履歴を検証します。 |
| 4 | [`mercari-revenue`](#mercari-revenue) | メルカリ収益スターター | 販売・収益化 | Rock | 手元の在庫から、出品原稿・実費後の見込み利益・確認事項・取引完了までを一つの収益フローで管理します。 |
| 5 | [`fashion-brand-ops`](#fashion-brand-ops) | Instagram運用・受注型ブランド管理 | ブランド運営 | Rock | 売上・数量・粗利目標からInstagram施策、DM接客、受注、決済、制作・発送、改善までを進める承認付きブランド経営MCPです。 |
| 6 | [`coconala`](#coconala) | ココナラ | 案件・納品支援 | `Mr.` | 応募前の案件チェックから、代表受注・制作担当者への発注条件、納品、入金と支払いの管理まで。 |
| 7 | [`mr-free-article`](#mr-free-article) | 記事の無料版メーカー | 記事制作 | `Mr.` | 完全版の原稿から無料の紹介記事を作成。要点と出典を残し、noteへの案内を添えます。 |
| 8 | [`mr-citations`](#mr-citations) | 出典整理ツール | 記事制作 | `Mr.` | 本文中の出典リンクを一覧に整理。同じURLをまとめ、コードや非リンクの出典は保ちます。 |
| 9 | [`mr-delivery`](#mr-delivery) | 納品記録の照合 | 案件・納品支援 | `Mr.` | 契約条件・成果物・制作記録・レビューを照合。納品前の記録の不一致を見つけます。 |
| 10 | [`rockstar-ledger`](#rockstar-ledger) | サブスク顧問 | 経費・契約管理 | Rock | 契約、更新日、支払い失敗を一元管理。カード明細から定期課金候補も見つけます。 |
| 11 | [`jev-evaluation`](#jev-evaluation) | Jev品質評価 | 品質・レビュー | Rock | 確認済みの最小出力をJevで評価し、根拠性・安全性・次の人手レビューの目安を返します。 |
| 12 | [`rockstar-legal-intake`](#rockstar-legal-intake) | 法務受付 | 法律・生活支援 | Rock | 日本語で状況を話すと、公式情報と無料窓口を案内。必要な案件だけ弁護士への引継ぎを準備します。 |
| 13 | [`rockstar-patent-assistant`](#rockstar-patent-assistant) | 特許アシスタント | 法律・生活支援 | Rock | システム発明を整理し、先行技術候補の調査、特許性の予備評価、明細書・請求項・要約のドラフトを一つにまとめます。 |

> 表示名の「avocadoOS」は 2026-09-15〜16 の旧製品名が catalog に残っているものです（[食い違い](#11-数え方の注意と文書どうしの食い違い)参照）。

### 2.2 導入候補22件（candidate）

実行可能な標準Toolや本番接続として数えません。Skyの一覧には表示されますが、本人接続・権限・保存・外部作用・結果確認をToolごとに受け入れるまで動きません。

| # | Sky ID | 表示名 | 分類 | 由来 | 一言でいうと |
| ---: | --- | --- | --- | --- | --- |
| 14 | [`rockstar-ip-studio`](#rockstar-ip-studio) | IP Studio — SNS・ゲーム・音声 | IP・コンテンツ運用 | Rock | キャラクター・スキンの制作からSNS・ゲーム展開を管理します。LiveKitによるIPキャラクターとの音声会話・電話対応の接続設定も用意しています（本体連携は未接続）。 |
| 15 | [`coconala-proposal-draft`](#coconala-proposal-draft) | ココナラ提案文の下書き | 案件・納品支援 | `Mr.` | 案件条件から提案文と確認リストを作る既存の端末内処理。 |
| 16 | [`gig-workflow`](#gig-workflow) | 受託案件ワークフロー | 案件・納品支援 | `Mr.` | 応募・交渉・制作・納品・売上確認の既存処理を段階ごとに支援。 |
| 17 | [`coconala-inbox`](#coconala-inbox) | ココナラの依頼・添付整理 | 案件・納品支援 | `Mr.` | 本人の依頼文と添付を整理する既存処理。 |
| 18 | [`youtube-script-writer`](#youtube-script-writer) | YouTube台本 | 動画制作 | `Mr.` | タイトル案、冒頭、台本、撮影キューを作る既存Service Cell。 |
| 19 | [`seo-blueprint`](#seo-blueprint) | SEO・記事構成 | 記事制作 | `Mr.` | 検索意図、キーワード、構成案を整理する既存Service Cell。 |
| 20 | [`landing-page-sprint`](#landing-page-sprint) | LP・販売ページ制作 | 販売・収益化 | `Mr.` | 情報設計、コピー、画面と公開前確認を扱う既存Service Cell。 |
| 21 | [`sales-objection-reply-builder`](#sales-objection-reply-builder) | 商談返信・見積り支援 | 販売・収益化 | `Mr.` | 正式な商品条件から返信文と確認事項を作る既存Service Cell。 |
| 22 | [`user-interview-synthesizer`](#user-interview-synthesizer) | 顧客インタビュー分析 | 市場・商品設計 | `Mr.` | 発言をテーマ、根拠、仮説と次の検証に整理する既存Service Cell。 |
| 23 | [`calendar-coordination`](#calendar-coordination) | 予定・カレンダー連携 | 生活・予定 | `Mr.` | 既存Coreの予定解釈とカレンダー連携処理。 |
| 24 | [`telegram-notifications`](#telegram-notifications) | Telegram通知・承認 | 通知・連絡 | `Mr.` | 既存Botの依頼受付、通知、進捗確認をSkyの仕事につなぐ処理。 |
| 25 | [`producthunt-discovery`](#producthunt-discovery) | 外部ツール候補の発見 | 市場・商品設計 | `Mr.` | Product Hunt公式API向けの候補検索処理。 |
| 26 | [`faster-whisper`](#faster-whisper) | faster-whisper | 文字起こし | 第三者 | 音声から、編集できるテキストへ。PCで使える文字起こしエンジン。 |
| 27 | [`transformers-js`](#transformers-js) | Transformers.js | ブラウザAI | 第三者 | ブラウザでモデルを実行。分類・要約などのワークフローの土台に。 |
| 28 | [`playwright`](#playwright) | Playwright | ブラウザ操作 | 第三者 | 許可されたWeb操作を再現。確認作業や繰り返しのテストを効率化。 |
| 29 | [`jev-ultrafast`](#jev-ultrafast) | Jev Ultrafast | ブラウザ操作AI | 第三者 | Web画面の操作候補を番号付きで整理し、AIが許可された一手を選ぶ高速ブラウザエージェント。 |
| 30 | [`jev-trader`](#jev-trader) | Jev Trader | 市場判断研究 | 第三者 | order bookから売買方向を選ぶJev実験を、RockstarOSのPAPER市場で検証する候補。 |
| 31 | [`typesafe-computer-use`](#typesafe-computer-use) | TypeSafe Computer Use | PC画面操作AI | 第三者 | Mac画面を決定的に読み取り、Jevが次の操作を選ぶcomputer-use候補。 |
| 32 | [`jev-review`](#jev-review) | Jev Review | コードレビューAI | 第三者 | Git差分または指定scopeのcodebaseを、段階的なJev判断でreviewする候補。 |
| 33 | [`jev-router`](#jev-router) | Jev Router | AIモデルルーティング | 第三者 | Codex／Claude Codeの各turnを、速いmodelまたは強いmodelへ振り分ける候補。 |
| 34 | [`jev-browser`](#jev-browser) | Jev Browser | ブラウザ操作AI | 第三者 | 既存browser toolの観測・操作・検証loop内で、Jevが画面要素を選ぶruntime候補。 |
| 35 | [`mobile-jev`](#mobile-jev) | Mobile Jev | Android操作AI | 第三者 | Mobilerun経由のAndroid端末で、Jevが次のmobile操作を選ぶagent候補。 |

### 2.3 各Toolの機能（ready 13件）

<a id="rockstar-amc"></a>
#### 1. AMC · Goalと部隊の進捗 — `rockstar-amc`

- **状態・由来**：ready／Rock／分類「計画・進捗管理」
- **何をするか**：作りたいものとGoal・意図から計画を準備し、部隊・作業・確認待ちをZemaで管理します。
- **どこで動くか**：Sky / Zema / 保存・再開にはサインイン必須
- **費用**：計画作成ではLLMや有料の外部実行を呼びません。工数はテンプレートによる参考値です。
- **使い方の流れ**：1) 依頼・Goal・意図を確認する → 2) 計画を保存し、部隊と作業順を確認する → 3) 作業の開始・提出・検収を記録する → 4) 人の判断が必要な項目を確認し、Goalを受け入れる
- **やらないこと・注意**：利用可能なのは計画作成と手動の進捗記録です。AIによる実装・自律実行・自動通知は未接続。OS・ハードウェアの32部隊は参照用で、依頼の計画と混同しません。
- **開く場所**：`/zema/amc`
- **元になったもの**：avocadoOS built-in（license: avocadoOS code）
- **実装**：[`app/amc/`](../app/amc/)・[`app/api/amc/`](../app/api/amc/)・[`lib/amc-tool.ts`](../lib/amc-tool.ts)
- **詳細設計**：[全Tool詳細設計の該当節](sky-tools-complete-design.md#45-amc--goal部隊進捗) / [AMC Goal Orchestrator](amc-goal-orchestrator.md)

<a id="rockstar-csv-cleanup"></a>
#### 2. CSV整形・検査・納品 — `rockstar-csv-cleanup`

- **状態・由来**：ready／Rock／分類「販売・収益化」
- **何をするか**：1ファイルのCSVを指定どおりに整形し、結果・変更報告・独立検査を一つの受付から納品します。
- **どこで動くか**：Sky Cloud / サインイン必須 / 暗号化された非公開ストレージ
- **費用**：購入者向け試験価格は税込3,000円。販売者向けの8.88 USD料金案は収益動線が決まるまで保留中です。
- **使い方の流れ**：1) CSVと列名・列順・空白・重複・並び順・出力文字コードを指定する → 2) 10MB・50,000行・100列の範囲と変換可能性を検査し、見積りを固定する → 3) 外部市場または契約済み経路の入金を本人が確認して照合番号を記録する → 4) 文字列を勝手に数値化せず、決定的な順番で変換する → 5) 独立検査に合格した結果CSV・変更報告・検査JSONを納品する → 6) 受付から7日後は取得を拒否し、または本人の削除操作で入力と成果物を消す
- **やらないこと・注意**：値の推測・補完、複数ファイル結合、外部市場の代理操作はしません。手入力した入金番号だけではWalletの確認済み収益に計上しません。
- **開く場所**：`/csv`
- **元になったもの**：avocadoOS built-in（license: avocadoOS code）
- **実装**：[`app/csv/`](../app/csv/)・[`lib/csv-transform.ts`](../lib/csv-transform.ts)
- **詳細設計**：[全Tool詳細設計の該当節](sky-tools-complete-design.md#5-csv整形検査納品) / [CSV仕事 v1](csv-business-v1.ja.md)

<a id="rockstar-markets-analysis"></a>
#### 3. avocadoOS Market Scanner — `rockstar-markets-analysis`

- **状態・由来**：ready／Rock／分類「市場・商品設計」
- **何をするか**：型付きの価値対象をavocadoOS Marketへ登録し、価格・需要・PAPER取引履歴を検証します。
- **どこで動くか**：ブラウザ内 / avocadoOS PAPER市場
- **費用**：追加料金なし。PAPER残高は実資金ではなく、換金・送金・外部注文はできません。
- **使い方の流れ**：1) 自動化、制作物、サービス、商品、稼働枠から対象の型を選ぶ → 2) 価格、供給量、説明を登録する → 3) 注文提案とrisk判定を確認する → 4) 同一digestを本人承認してPAPER取引を実行する → 5) receipt、position、eventから結果を確認する → 6) PAPER損益を実収益や将来利回りとして扱わない
- **やらないこと・注意**：取引はavocadoOS内のPAPER検証だけです。秘密鍵、LIVE切替、外部注文、実Wallet操作を受け付けず、simulation PnL、含み益、見積もり、取引量をファンド収益へ計上しません。
- **開く場所**：`/market`
- **元になったもの**：avocadoOS built-in（license: avocadoOS code）
- **実装**：[`app/market/`](../app/market/)・[`lib/markets-adapter.ts`](../lib/markets-adapter.ts)
- **詳細設計**：[全Tool詳細設計の該当節](sky-tools-complete-design.md#6-rockstaros-market-scanner) / [Market・自律型ファンド](everything-market-and-autonomous-fund-20260913.md)

<a id="mercari-revenue"></a>
#### 4. メルカリ収益スターター — `mercari-revenue`

- **状態・由来**：ready／Rock／分類「販売・収益化」
- **何をするか**：手元の在庫から、出品原稿・実費後の見込み利益・確認事項・取引完了までを一つの収益フローで管理します。
- **どこで動くか**：個人メルカリはブラウザ内の出品支援 / Shops自動連携は日本国内の固定IPを持つConnectorが必要
- **費用**：Skyの出品準備は追加料金なし。販売手数料・送料・仕入原価は利用者が実額を入力し、売上から先に差し引いて計算します。
- **使い方の流れ**：1) 自分が保有する商品と、状態・価格・実費を入力する → 2) Skyが出品原稿と見込み手取りを作り、禁止物・誤表示・在庫を確認する → 3) 個人メルカリは本人が公式画面で出品する。Shopsは公式API Connector接続後に個別承認する → 4) 取引完了と入金をProviderで確認できた売上だけをWalletへ記録する。収益料金は保留中
- **やらないこと・注意**：販売や利益は保証しません。個人アカウントの認証情報を預からず、無人出品・大量再出品・購入・メッセージ・発送・出金は行いません。自己申告の売上は検証済み収益として精算しません。
- **開く場所**：`/income/mercari`
- **元になったもの**：<https://api.mercari-shops.com/docs/index.html>（license: service terms / avocadoOS code MIT）
- **実装**：[`app/income/mercari/`](../app/income/mercari/)・[`lib/mercari-revenue.ts`](../lib/mercari-revenue.ts)
- **詳細設計**：[全Tool詳細設計の該当節](sky-tools-complete-design.md#7-メルカリ収益スターター) / [メルカリ収益ループ](mercari-revenue-loop.md)

<a id="fashion-brand-ops"></a>
#### 5. Instagram運用・受注型ブランド管理 — `fashion-brand-ops`

- **状態・由来**：ready／Rock／分類「ブランド運営」
- **何をするか**：売上・数量・粗利目標からInstagram施策、DM接客、受注、決済、制作・発送、改善までを進める承認付きブランド経営MCPです。
- **どこで動くか**：簡易プランはブラウザで利用可能。本格運用はPC / Node.js 22.13以上 / MCP接続が必要
- **費用**：初期状態はmockで外部費用なし。Higgsfield、Meta、Stripe等の外部料金は各契約に従い、実行前に確認します。
- **使い方の流れ**：1) ブランド方針と商品を登録し、数量・売上・粗利・期限・広告上限を目標にする → 2) Campaign Autopilotが市場、広告仮説、投稿ペース、次の操作を組み立てる → 3) Sales Conciergeが顧客履歴と購入意向から返信案・見積りへの次の一手を作る → 4) 入金確認後、Production Cockpitで資材・原価・能力・納期・工程を管理する → 5) 投稿・広告・DM・請求の外部作用はSkyで内容を確認して個別承認する → 6) 広告・DM・売上・制作結果を経営画面と次回creativeへ反映する
- **やらないこと・注意**：計画と下書きは自動化しますが、価格変更、外部生成、投稿・広告出稿、DM送信、請求、返金は署名付きの個別承認が必要です。paid/refundedは検証済み決済event以外から変更できません。
- **元になったもの**：<https://github.com/k999ln/rock/tree/main/toolkits/fashion-brand-ops>（license: repository）
- **実装**：[`toolkits/fashion-brand-ops/`](../toolkits/fashion-brand-ops/)
- **詳細設計**：[全Tool詳細設計の該当節](sky-tools-complete-design.md#8-instagram運用受注型ブランド管理) / [Fashion Brand Ops統合](fashion-brand-ops-integration.md)

<a id="coconala"></a>
#### 6. ココナラ — `coconala`

- **状態・由来**：ready／`Mr.`／分類「案件・納品支援」
- **何をするか**：応募前の案件チェックから、代表受注・制作担当者への発注条件、納品、入金と支払いの管理まで。
- **どこで動くか**：Skyの専用画面 / サインイン必須 / 本人別の非公開案件台帳
- **費用**：Sky Marketの売上手数料は10%。ココナラ手数料と担当者報酬は案件ごとに確認します。
- **使い方の流れ**：1) 応募前に依頼文と提案文をチェックし、元ページの条件・規約を確認する → 2) 代表者の受注額と担当者の固定報酬・支払期日を事前登録する → 3) 規約・顧客説明・担当者への条件明示を記録し、納品と検収を管理する → 4) 顧客入金・返金と担当者への支払いを分けて記録する
- **やらないこと・注意**：応募前チェックはMr.の単発・非同期案件向けルールです。3%は見積りの参考値でSky手数料ではありません。ココナラの応募・契約・納品・入金照合、銀行振込は自動実行しません。手入力の入金は検証済み収益ではありません。
- **開く場所**：`/sky/tools/coconala`
- **PC MCPの操作名**：`coconala_check`
- **元になったもの**：<https://github.com/k999ln/Mr./blob/26a39d2c31ea5246cb78dbe42d86e333922db60c/skills/earn/gig/scripts/application_eligibility.py>（license: MIT）
- **実装**：[`vendor/mr/application_eligibility.py`](../vendor/mr/application_eligibility.py)・[`toolkits/mr/`](../toolkits/mr/)
- **詳細設計**：[全Tool詳細設計の該当節](sky-tools-complete-design.md#9-ココナラ)

<a id="mr-free-article"></a>
#### 7. 記事の無料版メーカー — `mr-free-article`

- **状態・由来**：ready／`Mr.`／分類「記事制作」
- **何をするか**：完全版の原稿から無料の紹介記事を作成。要点と出典を残し、noteへの案内を添えます。
- **どこで動くか**：ブラウザ内 / Rockへのサインインが必要
- **費用**：外部AIや有料APIを使わず、端末内で文章を処理します。
- **使い方の流れ**：1) 自分が利用できる原稿を用意する → 2) 無料にする範囲・まとめ・完全版のリンクを入力する → 3) 作成結果と残したい有料部分を確認する → 4) 必要な形式で保存し、本人が公開する
- **やらないこと・注意**：まとめは入力した文章を使用します。記事の自動執筆・noteへの投稿・販売は行いません。
- **PC MCPの操作名**：`make_free_article`
- **元になったもの**：<https://github.com/k999ln/Mr./blob/26a39d2c31ea5246cb78dbe42d86e333922db60c/skills/writer-agent/scripts/_shared/make-free-version.py>（license: MIT）
- **実装**：[`vendor/mr/make-free-version.py`](../vendor/mr/make-free-version.py)・[`toolkits/mr/`](../toolkits/mr/)
- **詳細設計**：[全Tool詳細設計の該当節](sky-tools-complete-design.md#10-記事の無料版メーカー)

<a id="mr-citations"></a>
#### 8. 出典整理ツール — `mr-citations`

- **状態・由来**：ready／`Mr.`／分類「記事制作」
- **何をするか**：本文中の出典リンクを一覧に整理。同じURLをまとめ、コードや非リンクの出典は保ちます。
- **どこで動くか**：ブラウザ内 / Rockへのサインインが必要
- **費用**：端末内のテキスト処理のみ。外部APIや追加サービスは不要です。
- **使い方の流れ**：1) 出典リンクを含むMarkdownを貼り付ける → 2) 出典整理を実行する → 3) 本文と出典の対応を自分で確認する → 4) 結果をコピーまたはMarkdownで保存する
- **やらないこと・注意**：出典の事実確認は行いません。引用元との対応が必要な記事では、整理後の表記を確認してください。
- **PC MCPの操作名**：`format_citations`
- **元になったもの**：<https://github.com/k999ln/Mr./blob/26a39d2c31ea5246cb78dbe42d86e333922db60c/skills/writer-agent/scripts/_shared/citation-strip.py>（license: MIT）
- **実装**：[`vendor/mr/citation-strip.py`](../vendor/mr/citation-strip.py)・[`toolkits/mr/`](../toolkits/mr/)
- **詳細設計**：[全Tool詳細設計の該当節](sky-tools-complete-design.md#11-出典整理ツール) / [PC出典整理adapter](pc-citations-adapter.md)

<a id="mr-delivery"></a>
#### 9. 納品記録の照合 — `mr-delivery`

- **状態・由来**：ready／`Mr.`／分類「案件・納品支援」
- **何をするか**：契約条件・成果物・制作記録・レビューを照合。納品前の記録の不一致を見つけます。
- **どこで動くか**：PC / Python 3.10以上
- **費用**：PC内でファイルを読み照合します。追加の通信・API料金はありません。
- **使い方の流れ**：1) 無料パックを展開し、Python環境を用意する → 2) 同梱サンプルで実行方法を確認する → 3) 成果物・契約・制作記録・別レビューのデータを用意する → 4) 照合結果を確認してから、本人が納品する
- **やらないこと・注意**：内容の品質を自動判断するのではなく、別途作成したレビューとファイルを照合します。検出対象は限定的で、秘密情報の不在も保証しません。
- **PC MCPの操作名**：`verify_delivery`
- **元になったもの**：<https://github.com/k999ln/Mr./blob/26a39d2c31ea5246cb78dbe42d86e333922db60c/skills/earn/gig/scripts/deliverable_verifier.py>（license: MIT）
- **実装**：[`vendor/mr/deliverable_verifier.py`](../vendor/mr/deliverable_verifier.py)・[`toolkits/mr/`](../toolkits/mr/)
- **詳細設計**：[全Tool詳細設計の該当節](sky-tools-complete-design.md#12-納品記録の照合)

<a id="rockstar-ledger"></a>
#### 10. サブスク顧問 — `rockstar-ledger`

- **状態・由来**：ready／Rock／分類「経費・契約管理」
- **何をするか**：契約、更新日、支払い失敗を一元管理。カード明細から定期課金候補も見つけます。
- **どこで動くか**：PC接続 / ローカル台帳
- **費用**：追加API料金なし。契約データと明細はPC内のSQLiteに保存し、Skyは読み取り専用で接続します。
- **使い方の流れ**：1) Rockstar LedgerをPCへ展開する → 2) Python 3.10以上でローカル台帳を起動する → 3) Skyでサブスク顧問を開き、接続状態を確認する → 4) 要対応と更新予定を確認し、変更は本人が各契約先で行う
- **やらないこと・注意**：Skyは契約状況の確認を支援します。解約、支払い、税務申告を自動実行せず、通貨も勝手に合算しません。
- **元になったもの**：<https://github.com/k999ln/rock/tree/codex/sky-rockstar-ledger-20260912/toolkits/rockstar-ledger>（license: MIT）
- **実装**：[`toolkits/rockstar-ledger/`](../toolkits/rockstar-ledger/)
- **詳細設計**：[全Tool詳細設計の該当節](sky-tools-complete-design.md#13-サブスク顧問) / [サブスク顧問の接続](sky-rockstar-ledger-20260912.md)

<a id="jev-evaluation"></a>
#### 11. Jev品質評価 — `jev-evaluation`

- **状態・由来**：ready／Rock／分類「品質・レビュー」
- **何をするか**：確認済みの最小出力をJevで評価し、根拠性・安全性・次の人手レビューの目安を返します。
- **どこで動くか**：Sky Cloud / Vercel AI Gateway / 明示同意が必要
- **費用**：AI Gatewayのprovider料金・無料枠・保持条件に従います。送信前に表示を確認します。
- **使い方の流れ**：1) 評価対象を最小化し、個人情報・法務相談・未公開発明・秘密情報を除く → 2) 送信先、料金、保持条件を確認して本人が同意する → 3) Jevが根拠性・安全性・有用性をtyped resultで評価する → 4) Evaluation Receiptをreview signalとして確認し、最終判断は本人が行う
- **やらないこと・注意**：Jevは文章生成器ではありません。評価結果は助言であり、権限判定、本人承認、Tool成功、仕事完了を決めません。
- **元になったもの**：<https://vercel.com/ai-gateway/models/jev>（license: TypeSafe AI / Vercel AI Gateway terms）
- **実装**：[`lib/jev-evaluation.ts`](../lib/jev-evaluation.ts)・[`app/api/jev-evaluation/`](../app/api/jev-evaluation/)
- **詳細設計**：[全Tool詳細設計の該当節](sky-tools-complete-design.md#155-jev品質評価) / [LLM・評価モデル設計](llm-evaluation-architecture.md)

<a id="rockstar-legal-intake"></a>
#### 12. 法務受付 — `rockstar-legal-intake`

- **状態・由来**：ready／Rock／分類「法律・生活支援」
- **何をするか**：日本語で状況を話すと、公式情報と無料窓口を案内。必要な案件だけ弁護士への引継ぎを準備します。
- **どこで動くか**：Skyは相談内容を保存しません / 標準は端末内処理、オンライン検索は本人が明示許可した場合だけ
- **費用**：利用者への料金は0円で提供できます。法令AI接続時のAPI利用料は運営側に発生し、連絡・依頼後の弁護士費用は別途確認が必要です。
- **使い方の流れ**：1) 危険・逮捕・公的書類・期限の有無を確認する → 2) 法務受付との会話で、分野・地域・状況と希望を整理する → 3) 政府・裁判所の公式情報に限定した回答と無料窓口を確認する → 4) 刑事弁護が必要な案件は藤原茜弁護士を第一連絡候補として、本人確認後に連絡する
- **やらないこと・注意**：法令AIの回答は一般情報であり、法的助言、期限計算、勝敗予測、受任保証ではありません。自動送信は行わず、受任可否・利益相反・料金・対応地域は弁護士へ直接確認します。差し迫った危険がある場合は米国内では911へ連絡してください。
- **元になったもの**：<https://github.com/k999ln/rock/tree/codex/sky-legal-intake-20260912>（license: MIT）
- **実装**：[`lib/legal-intake.ts`](../lib/legal-intake.ts)・[`app/api/legal-guidance/`](../app/api/legal-guidance/)
- **詳細設計**：[全Tool詳細設計の該当節](sky-tools-complete-design.md#14-法務受付) / [法務受付の実装と安全境界](sky-legal-intake-20260912.md)

<a id="rockstar-patent-assistant"></a>
#### 13. 特許アシスタント — `rockstar-patent-assistant`

- **状態・由来**：ready／Rock／分類「法律・生活支援」
- **何をするか**：システム発明を整理し、先行技術候補の調査、特許性の予備評価、明細書・請求項・要約のドラフトを一つにまとめます。
- **どこで動くか**：Skyは発明内容を保存しません / 標準は端末内で書類作成、オンライン調査は本人が明示許可した場合だけ
- **費用**：書類ドラフトはブラウザ内で作成します。AI調査を選んだ場合だけ運営側にAPI利用料が発生し、出願料・弁理士費用は別です。
- **使い方の流れ**：1) 発明者・出願人候補と、公開済みかどうかを確認する → 2) 技術課題、仕組み、構成、効果、既存技術との差を入力する → 3) 公式特許情報の候補と原文を確認し、差分を記録する → 4) 明細書・請求項・要約のドラフトを専門家と本人が確認し、本人が提出する
- **やらないこと・注意**：特許性、登録、侵害回避、期限を保証しません。AI調査は漏れを含む可能性があり、電子署名、料金支払、特許庁への提出は自動実行しません。公開済みの場合は公開記録を保存し、弁理士へ早急に確認してください。
- **元になったもの**：<https://github.com/k999ln/rock/tree/codex/sky-legal-intake-20260912>（license: MIT）
- **実装**：[`lib/patent-assistant.ts`](../lib/patent-assistant.ts)・[`app/api/patent-research/`](../app/api/patent-research/)
- **詳細設計**：[全Tool詳細設計の該当節](sky-tools-complete-design.md#15-特許出願アシスタント) / [特許出願アシスタント](sky-patent-assistant-20260912.md)


### 2.4 各Toolの機能（candidate 22件）

<a id="rockstar-ip-studio"></a>
#### 14. IP Studio — SNS・ゲーム・音声 — `rockstar-ip-studio`

- **状態・由来**：candidate／Rock／分類「IP・コンテンツ運用」
- **何をするか**：キャラクター・スキンの制作からSNS・ゲーム展開を管理します。LiveKitによるIPキャラクターとの音声会話・電話対応の接続設定も用意しています（本体連携は未接続）。
- **どこで動くか**：このPCのIP Studio / Skyで接続状態と承認を管理
- **費用**：ローカル利用は追加料金なし。生成・SNS・ゲームに加え、LiveKit、音声モデル、電話番号・通話回線の料金と契約は利用前に確認します。
- **使い方の流れ**：1) 参考画像と「何をしたいか」を入力してIPの制作依頼を作る → 2) Higgsfieldで画像・動画を生成するか、完成素材を登録する → 3) 権利・利用条件・ゲーム導入先を確認してゲーム版を記録する → 4) Instagram・YouTubeの投稿案を確認し、本人承認後にMakeへ送る → 5) 投稿結果とゲームへの導線を同じIPの履歴へ戻す → 6) 音声会話・電話を使う場合はSkyの接続管理でLiveKitとAgentを登録する（本体との通話連携は未接続）
- **やらないこと・注意**：Skyは本人・接続・承認・停止状態を管理します。IP Studioは素材と生成・投稿案を扱います。APIキー、Cookie、SNSログイン情報はSkyの入力欄や仕事本文へ保存しません。投稿、広告、DM、ゲームへの提出は1回ごとの本人承認が必要です。音声送信・録音・電話発信の許可は別々に扱います。LiveKit設定を保存しても通話や番号取得は始まりません。
- **開く場所**：`http://127.0.0.1:18767/`
- **元になったもの**：avocadoOS built-in / Kaiya IP Studio（license: avocadoOS / Kaiya IP Studio）
- **実装**：[catalog登録](../lib/catalog.ts)（Sky実行器は未接続）
- **詳細設計**：[全Tool詳細設計の該当節](sky-tools-complete-design.md#85-ip-studio--交換可能な制作配信ゲーム展開)

<a id="coconala-proposal-draft"></a>
#### 15. ココナラ提案文の下書き — `coconala-proposal-draft`

- **状態・由来**：candidate／`Mr.`／分類「案件・納品支援」
- **何をするか**：案件条件から提案文と確認リストを作る既存の端末内処理。
- **どこで動くか**：既存コード・設計あり / Sky実行器は未接続
- **費用**：接続先、モデル、外部サービスの実費を接続時に確認します。
- **使い方の流れ**：1) 既存のローカル実行器をSky SDKへ接続する → 2) Sky SDKでPackageとMCPを登録する → 3) 接続先、権限、副作用、結果を確認して使う
- **やらないこと・注意**：Mr.の旧Automation Hubの在庫から移した導入候補です。Skyからの実行と外部サービスへの接続は、実装・検証後に有効になります。
- **元になったもの**：<https://github.com/k999ln/Mr.>（license: MIT）
- **詳細設計**：[導入候補22件](sky-tools-complete-design.md#16-導入候補22件) / [旧Mr. Hub自動化のSky導入設計](sky-mr-automation-candidates.md)

<a id="gig-workflow"></a>
#### 16. 受託案件ワークフロー — `gig-workflow`

- **状態・由来**：candidate／`Mr.`／分類「案件・納品支援」
- **何をするか**：応募・交渉・制作・納品・売上確認の既存処理を段階ごとに支援。
- **どこで動くか**：既存コード・設計あり / Sky実行器は未接続
- **費用**：接続先、モデル、外部サービスの実費を接続時に確認します。
- **使い方の流れ**：1) 所有者設定を移し、外部操作に個別承認を付ける → 2) Sky SDKでPackageとMCPを登録する → 3) 接続先、権限、副作用、結果を確認して使う
- **やらないこと・注意**：Mr.の旧Automation Hubの在庫から移した導入候補です。Skyからの実行と外部サービスへの接続は、実装・検証後に有効になります。
- **元になったもの**：<https://github.com/k999ln/Mr.>（license: MIT）
- **詳細設計**：[導入候補22件](sky-tools-complete-design.md#16-導入候補22件) / [旧Mr. Hub自動化のSky導入設計](sky-mr-automation-candidates.md)

<a id="coconala-inbox"></a>
#### 17. ココナラの依頼・添付整理 — `coconala-inbox`

- **状態・由来**：candidate／`Mr.`／分類「案件・納品支援」
- **何をするか**：本人の依頼文と添付を整理する既存処理。
- **どこで動くか**：既存コード・設計あり / Sky実行器は未接続
- **費用**：接続先、モデル、外部サービスの実費を接続時に確認します。
- **使い方の流れ**：1) 本人の接続と保存範囲を確認する → 2) Sky SDKでPackageとMCPを登録する → 3) 接続先、権限、副作用、結果を確認して使う
- **やらないこと・注意**：Mr.の旧Automation Hubの在庫から移した導入候補です。Skyからの実行と外部サービスへの接続は、実装・検証後に有効になります。
- **元になったもの**：<https://github.com/k999ln/Mr.>（license: MIT）
- **詳細設計**：[導入候補22件](sky-tools-complete-design.md#16-導入候補22件) / [旧Mr. Hub自動化のSky導入設計](sky-mr-automation-candidates.md)

<a id="youtube-script-writer"></a>
#### 18. YouTube台本 — `youtube-script-writer`

- **状態・由来**：candidate／`Mr.`／分類「動画制作」
- **何をするか**：タイトル案、冒頭、台本、撮影キューを作る既存Service Cell。
- **どこで動くか**：既存コード・設計あり / Sky実行器は未接続
- **費用**：接続先、モデル、外部サービスの実費を接続時に確認します。
- **使い方の流れ**：1) 台本生成と品質確認の実行器を接続する → 2) Sky SDKでPackageとMCPを登録する → 3) 接続先、権限、副作用、結果を確認して使う
- **やらないこと・注意**：Mr.の旧Automation Hubの在庫から移した導入候補です。Skyからの実行と外部サービスへの接続は、実装・検証後に有効になります。
- **元になったもの**：<https://github.com/k999ln/Mr.>（license: MIT）
- **詳細設計**：[導入候補22件](sky-tools-complete-design.md#16-導入候補22件) / [旧Mr. Hub自動化のSky導入設計](sky-mr-automation-candidates.md)

<a id="seo-blueprint"></a>
#### 19. SEO・記事構成 — `seo-blueprint`

- **状態・由来**：candidate／`Mr.`／分類「記事制作」
- **何をするか**：検索意図、キーワード、構成案を整理する既存Service Cell。
- **どこで動くか**：既存コード・設計あり / Sky実行器は未接続
- **費用**：接続先、モデル、外部サービスの実費を接続時に確認します。
- **使い方の流れ**：1) 調査元と生成実行器を接続する → 2) Sky SDKでPackageとMCPを登録する → 3) 接続先、権限、副作用、結果を確認して使う
- **やらないこと・注意**：Mr.の旧Automation Hubの在庫から移した導入候補です。Skyからの実行と外部サービスへの接続は、実装・検証後に有効になります。
- **元になったもの**：<https://github.com/k999ln/Mr.>（license: MIT）
- **詳細設計**：[導入候補22件](sky-tools-complete-design.md#16-導入候補22件) / [旧Mr. Hub自動化のSky導入設計](sky-mr-automation-candidates.md)

<a id="landing-page-sprint"></a>
#### 20. LP・販売ページ制作 — `landing-page-sprint`

- **状態・由来**：candidate／`Mr.`／分類「販売・収益化」
- **何をするか**：情報設計、コピー、画面と公開前確認を扱う既存Service Cell。
- **どこで動くか**：既存コード・設計あり / Sky実行器は未接続
- **費用**：接続先、モデル、外部サービスの実費を接続時に確認します。
- **使い方の流れ**：1) 制作実行器を接続し、公開は本人確認を通す → 2) Sky SDKでPackageとMCPを登録する → 3) 接続先、権限、副作用、結果を確認して使う
- **やらないこと・注意**：Mr.の旧Automation Hubの在庫から移した導入候補です。Skyからの実行と外部サービスへの接続は、実装・検証後に有効になります。
- **元になったもの**：<https://github.com/k999ln/Mr.>（license: MIT）
- **詳細設計**：[導入候補22件](sky-tools-complete-design.md#16-導入候補22件) / [旧Mr. Hub自動化のSky導入設計](sky-mr-automation-candidates.md)

<a id="sales-objection-reply-builder"></a>
#### 21. 商談返信・見積り支援 — `sales-objection-reply-builder`

- **状態・由来**：candidate／`Mr.`／分類「販売・収益化」
- **何をするか**：正式な商品条件から返信文と確認事項を作る既存Service Cell。
- **どこで動くか**：既存コード・設計あり / Sky実行器は未接続
- **費用**：接続先、モデル、外部サービスの実費を接続時に確認します。
- **使い方の流れ**：1) 返信生成実行器を接続する → 2) Sky SDKでPackageとMCPを登録する → 3) 接続先、権限、副作用、結果を確認して使う
- **やらないこと・注意**：Mr.の旧Automation Hubの在庫から移した導入候補です。Skyからの実行と外部サービスへの接続は、実装・検証後に有効になります。
- **元になったもの**：<https://github.com/k999ln/Mr.>（license: MIT）
- **詳細設計**：[導入候補22件](sky-tools-complete-design.md#16-導入候補22件) / [旧Mr. Hub自動化のSky導入設計](sky-mr-automation-candidates.md)

<a id="user-interview-synthesizer"></a>
#### 22. 顧客インタビュー分析 — `user-interview-synthesizer`

- **状態・由来**：candidate／`Mr.`／分類「市場・商品設計」
- **何をするか**：発言をテーマ、根拠、仮説と次の検証に整理する既存Service Cell。
- **どこで動くか**：既存コード・設計あり / Sky実行器は未接続
- **費用**：接続先、モデル、外部サービスの実費を接続時に確認します。
- **使い方の流れ**：1) 発言と分析結果を結ぶ実行器を接続する → 2) Sky SDKでPackageとMCPを登録する → 3) 接続先、権限、副作用、結果を確認して使う
- **やらないこと・注意**：Mr.の旧Automation Hubの在庫から移した導入候補です。Skyからの実行と外部サービスへの接続は、実装・検証後に有効になります。
- **元になったもの**：<https://github.com/k999ln/Mr.>（license: MIT）
- **詳細設計**：[導入候補22件](sky-tools-complete-design.md#16-導入候補22件) / [旧Mr. Hub自動化のSky導入設計](sky-mr-automation-candidates.md)

<a id="calendar-coordination"></a>
#### 23. 予定・カレンダー連携 — `calendar-coordination`

- **状態・由来**：candidate／`Mr.`／分類「生活・予定」
- **何をするか**：既存Coreの予定解釈とカレンダー連携処理。
- **どこで動くか**：既存コード・設計あり / Sky実行器は未接続
- **費用**：接続先、モデル、外部サービスの実費を接続時に確認します。
- **使い方の流れ**：1) 本人のアカウント接続と権限確認を行う → 2) Sky SDKでPackageとMCPを登録する → 3) 接続先、権限、副作用、結果を確認して使う
- **やらないこと・注意**：Mr.の旧Automation Hubの在庫から移した導入候補です。Skyからの実行と外部サービスへの接続は、実装・検証後に有効になります。
- **元になったもの**：<https://github.com/k999ln/Mr.>（license: MIT）
- **詳細設計**：[導入候補22件](sky-tools-complete-design.md#16-導入候補22件) / [旧Mr. Hub自動化のSky導入設計](sky-mr-automation-candidates.md)

<a id="telegram-notifications"></a>
#### 24. Telegram通知・承認 — `telegram-notifications`

- **状態・由来**：candidate／`Mr.`／分類「通知・連絡」
- **何をするか**：既存Botの依頼受付、通知、進捗確認をSkyの仕事につなぐ処理。
- **どこで動くか**：既存コード・設計あり / Sky実行器は未接続
- **費用**：接続先、モデル、外部サービスの実費を接続時に確認します。
- **使い方の流れ**：1) 本人確認済みBotと送信範囲を接続する → 2) Sky SDKでPackageとMCPを登録する → 3) 接続先、権限、副作用、結果を確認して使う
- **やらないこと・注意**：Mr.の旧Automation Hubの在庫から移した導入候補です。Skyからの実行と外部サービスへの接続は、実装・検証後に有効になります。
- **元になったもの**：<https://github.com/k999ln/Mr.>（license: MIT）
- **詳細設計**：[導入候補22件](sky-tools-complete-design.md#16-導入候補22件) / [旧Mr. Hub自動化のSky導入設計](sky-mr-automation-candidates.md)

<a id="producthunt-discovery"></a>
#### 25. 外部ツール候補の発見 — `producthunt-discovery`

- **状態・由来**：candidate／`Mr.`／分類「市場・商品設計」
- **何をするか**：Product Hunt公式API向けの候補検索処理。
- **どこで動くか**：既存コード・設計あり / Sky実行器は未接続
- **費用**：接続先、モデル、外部サービスの実費を接続時に確認します。
- **使い方の流れ**：1) API利用条件と商用許諾を確認する → 2) Sky SDKでPackageとMCPを登録する → 3) 接続先、権限、副作用、結果を確認して使う
- **やらないこと・注意**：Mr.の旧Automation Hubの在庫から移した導入候補です。Skyからの実行と外部サービスへの接続は、実装・検証後に有効になります。
- **元になったもの**：<https://github.com/k999ln/Mr.>（license: MIT）
- **詳細設計**：[導入候補22件](sky-tools-complete-design.md#16-導入候補22件) / [旧Mr. Hub自動化のSky導入設計](sky-mr-automation-candidates.md)

<a id="faster-whisper"></a>
#### 26. faster-whisper — `faster-whisper`

- **状態・由来**：candidate／第三者／分類「文字起こし」
- **何をするか**：音声から、編集できるテキストへ。PCで使える文字起こしエンジン。
- **どこで動くか**：PC / Python。CPUまたは対応GPU
- **費用**：モデルの初回ダウンロードで通信量が増えます。実行中はPCの電力を使用。
- **使い方の流れ**：1) 公式READMEでOS・Python・ハードウェア要件を確認する → 2) 音声を扱う権限とモデルの利用条件を確認する → 3) CodexでREADMEに沿ってローカル環境を準備する → 4) 短い音声で試し、誤変換を確認してから納品する
- **やらないこと・注意**：OSSの導入候補です。avocadoOSからの自動実行や収益連携は未対応です。
- **元になったもの**：<https://github.com/SYSTRAN/faster-whisper>（license: MIT）
- **詳細設計**：[導入候補22件](sky-tools-complete-design.md#16-導入候補22件)

<a id="transformers-js"></a>
#### 27. Transformers.js — `transformers-js`

- **状態・由来**：candidate／第三者／分類「ブラウザAI」
- **何をするか**：ブラウザでモデルを実行。分類・要約などのワークフローの土台に。
- **どこで動くか**：対応ブラウザ / JavaScript・WebGPU等
- **費用**：モデルをダウンロードします。対応状況とメモリ・通信量はモデルごとに異なります。
- **使い方の流れ**：1) 公式READMEで対象タスクとブラウザ対応を確認する → 2) 使用モデルのカードとライセンスを個別に確認する → 3) CodexでREADMEに沿ってローカル環境を準備する → 4) 小さな入力で結果・処理時間・端末負荷を確認する
- **やらないこと・注意**：ライブラリのライセンスとモデルのライセンスは別です。モデルを自動配布・実行しません。
- **元になったもの**：<https://github.com/huggingface/transformers.js>（license: Apache-2.0）
- **詳細設計**：[導入候補22件](sky-tools-complete-design.md#16-導入候補22件)

<a id="playwright"></a>
#### 28. Playwright — `playwright`

- **状態・由来**：candidate／第三者／分類「ブラウザ操作」
- **何をするか**：許可されたWeb操作を再現。確認作業や繰り返しのテストを効率化。
- **どこで動くか**：PC / Node.js・対応ブラウザ
- **費用**：ブラウザのダウンロードとページ読込で通信量が増えます。実行中はPCの電力を使用。
- **使い方の流れ**：1) 操作先の規約と自分の操作権限を確認する → 2) 公式READMEに沿ってCodexで環境を準備する → 3) 自分のテスト環境で操作を検証する → 4) 送信・購入等は本人が内容と実行を確認する
- **やらないこと・注意**：ココナラ等の第三者サイトの無人操作を許諾するものではありません。
- **元になったもの**：<https://github.com/microsoft/playwright>（license: Apache-2.0）
- **詳細設計**：[導入候補22件](sky-tools-complete-design.md#16-導入候補22件)

<a id="jev-ultrafast"></a>
#### 29. Jev Ultrafast — `jev-ultrafast`

- **状態・由来**：candidate／第三者／分類「ブラウザ操作AI」
- **何をするか**：Web画面の操作候補を番号付きで整理し、AIが許可された一手を選ぶ高速ブラウザエージェント。
- **どこで動くか**：本人PC / Python 3.12以上・uv・Chrome remote debugging・Browser Harness・TypeSafe API・text model API
- **費用**：本体はMIT。選択したTypeSafe APIとtext model APIの利用料、通信量、本人PCの電力が別に発生する場合があります。
- **使い方の流れ**：1) source版・依存関係・MIT表示を固定し、offline testを通す → 2) 普段使いと分離した専用Chrome profileと、操作してよいsiteだけを設定する → 3) 閲覧だけの試験から始め、click・入力・送信を別の権限として確認する → 4) 送信・投稿・予約・購入等は実行直前に内容を表示し、本人が一回だけ許可する → 5) Jevの完了申告とは別に、RockstarOSが結果を読み直してreceiptを保存する
- **やらないこと・注意**：導入候補であり、まだ自動導入・実行できません。既存Chrome profile、password・OTP・決済情報、任意site、任意JavaScript、無人の投稿・予約・購入は許可しません。
- **元になったもの**：<https://github.com/browser-use/jev-ultrafast>（license: MIT）
- **詳細設計**：[導入候補22件](sky-tools-complete-design.md#16-導入候補22件) / [Jev ecosystem全体詳細設計](jev-ecosystem-integration-design.md) / [Jev Ultrafast統合設計](jev-ultrafast-integration-design.md)

<a id="jev-trader"></a>
#### 30. Jev Trader — `jev-trader`

- **状態・由来**：candidate／第三者／分類「市場判断研究」
- **何をするか**：order bookから売買方向を選ぶJev実験を、RockstarOSのPAPER市場で検証する候補。
- **どこで動くか**：隔離PC / Bun・TypeSafe API。RockstarOSではPAPER／replay限定
- **費用**：本体はMIT。market data、TypeSafe API、network、計算費用が別に発生する場合があります。
- **使い方の流れ**：1) PRIVATE_KEYなし、dry-run、固定market replayで起動する → 2) 価格、判断、仮想注文、仮想約定、費用をPAPER台帳へ分離保存する → 3) look-ahead、再現性、slippage、手数料、損失上限を検査する → 4) 実注文・実資金・Wallet接続は独立した金融release gateまで拒否する
- **やらないこと・注意**：LIVE取引、秘密鍵、実注文、実資金移動、自動収益化は許可しません。利益を保証せず、PAPER候補としてのみ登録します。
- **元になったもの**：<https://github.com/jarrodwatts/jev-trader>（license: MIT）
- **詳細設計**：[導入候補22件](sky-tools-complete-design.md#16-導入候補22件) / [Jev ecosystem全体詳細設計](jev-ecosystem-integration-design.md)

<a id="typesafe-computer-use"></a>
#### 31. TypeSafe Computer Use — `typesafe-computer-use`

- **状態・由来**：candidate／第三者／分類「PC画面操作AI」
- **何をするか**：Mac画面を決定的に読み取り、Jevが次の操作を選ぶcomputer-use候補。
- **どこで動くか**：隔離したmacOS account / Python・uv・OCR・TypeSafe API・画面操作権限
- **費用**：本体はMIT。TypeSafe API、text model、OCR、通信、本人PCの電力が別に発生します。
- **使い方の流れ**：1) 専用macOS accountと許可appだけでobserve modeを試す → 2) 画面読取、click、入力、外部送信の権限を分離する → 3) 座標と対象の再確認、confidence下限、緊急停止を検査する → 4) 送信・購入・削除・設定変更は直前の本人承認なしに実行しない
- **やらないこと・注意**：普段使いaccount、password manager、system設定、決済、任意appを操作させません。repositoryの費用・速度値はRockstarOSで再測定します。
- **元になったもの**：<https://github.com/awlevin/typesafe-computer-use>（license: MIT）
- **詳細設計**：[導入候補22件](sky-tools-complete-design.md#16-導入候補22件) / [Jev ecosystem全体詳細設計](jev-ecosystem-integration-design.md)

<a id="jev-review"></a>
#### 32. Jev Review — `jev-review`

- **状態・由来**：candidate／第三者／分類「コードレビューAI」
- **何をするか**：Git差分または指定scopeのcodebaseを、段階的なJev判断でreviewする候補。
- **どこで動くか**：本人PC / Node.js 24以上・Git・TypeSafe API。dashboardはloopback限定
- **費用**：本体はMIT。review対象量に応じたTypeSafe API利用料が発生する場合があります。
- **使い方の流れ**：1) review対象repository、path、commit、diff範囲を固定する → 2) 秘密file、生成物、vendor、鍵を送信対象から除外する → 3) 指摘ごとにfile、位置、根拠、severity、confidenceを保存する → 4) 修正、commit、push、mergeは自動実行せず、人が確認する
- **やらないこと・注意**：review結果は補助判断です。秘密情報の外部送信、全filesystem走査、自動修正・commit・push・mergeを許可しません。
- **元になったもの**：<https://github.com/devagrawal09/jev-review>（license: MIT）
- **詳細設計**：[導入候補22件](sky-tools-complete-design.md#16-導入候補22件) / [Jev ecosystem全体詳細設計](jev-ecosystem-integration-design.md)

<a id="jev-router"></a>
#### 33. Jev Router — `jev-router`

- **状態・由来**：candidate／第三者／分類「AIモデルルーティング」
- **何をするか**：Codex／Claude Codeの各turnを、速いmodelまたは強いmodelへ振り分ける候補。
- **どこで動くか**：本人PC / Node.js 20.12以上・対応CLI・TypeSafe API
- **費用**：本体はMIT。TypeSafe APIと、選択されたCLI／modelの契約・利用枠が必要です。
- **使い方の流れ**：1) 対応CLI、model ID、reasoning、費用、fallbackをallowlist化する → 2) 既存session、permission、authenticationを変更しないことを確認する → 3) routing理由、confidence、選択model、実費をreceiptへ記録する → 4) 品質・費用・latencyを固定taskで比較し、本人が無効化できるようにする
- **やらないこと・注意**：routerにshell権限や認証情報を渡しません。model選択は権限拡大ではなく、既存CLIの承認境界を必ず維持します。
- **元になったもの**：<https://github.com/gargpratyush/jev-router>（license: MIT）
- **詳細設計**：[導入候補22件](sky-tools-complete-design.md#16-導入候補22件) / [Jev ecosystem全体詳細設計](jev-ecosystem-integration-design.md)

<a id="jev-browser"></a>
#### 34. Jev Browser — `jev-browser`

- **状態・由来**：candidate／第三者／分類「ブラウザ操作AI」
- **何をするか**：既存browser toolの観測・操作・検証loop内で、Jevが画面要素を選ぶruntime候補。
- **どこで動くか**：本人PC / Node.js 22以上・対応browser tool・TypeSafe API
- **費用**：本体はMIT。TypeSafe API、browser実行、接続先通信の費用が別に発生します。
- **使い方の流れ**：1) installerとskill内容を読取り、source版と権限差分を固定する → 2) 専用browser profileとowned siteでread-only navigationを試す → 3) 連続runnerの各操作をRockstarOS Browser Brokerへ通す → 4) 外部作用は一手ごとの承認と独立結果検証がない限り止める
- **やらないこと・注意**：既存agentへ無条件installせず、default browser agentにも自動設定しません。Jev Ultrafastと同じ外部作用境界を適用します。
- **元になったもの**：<https://github.com/vlad-terin/jev-browser>（license: MIT）
- **詳細設計**：[導入候補22件](sky-tools-complete-design.md#16-導入候補22件) / [Jev ecosystem全体詳細設計](jev-ecosystem-integration-design.md)

<a id="mobile-jev"></a>
#### 35. Mobile Jev — `mobile-jev`

- **状態・由来**：candidate／第三者／分類「Android操作AI」
- **何をするか**：Mobilerun経由のAndroid端末で、Jevが次のmobile操作を選ぶagent候補。
- **どこで動くか**：隔離Android試験端末 / Node.js 22.16以上・pnpm 10.30.1・Mobilerun API・TypeSafe API
- **費用**：本体はMIT。Mobilerun端末／service、TypeSafe API、通信、端末利用料が別に発生します。
- **使い方の流れ**：1) Rock所有のwipe可能な試験端末と許可appだけを接続する → 2) device ID、app、操作、goal、step上限を一仕事へ固定する → 3) 観察から開始し、入力・送信・購入・予約・権限変更を分離する → 4) 停止、通信断、端末再起動、重複操作、trace削除を試験する
- **やらないこと・注意**：個人端末、SIM、連絡先、写真、password、決済情報へ接続しません。demoは支払選択画面までで、予約完了の証明ではありません。
- **元になったもの**：<https://github.com/droidrun/mobile-jev>（license: MIT）
- **詳細設計**：[導入候補22件](sky-tools-complete-design.md#16-導入候補22件) / [Jev ecosystem全体詳細設計](jev-ecosystem-integration-design.md)


### 2.5 catalogにはないが、設計書に出てくる3件

[全Tool詳細設計](sky-tools-complete-design.md) と [Jev ecosystem設計](jev-ecosystem-integration-design.md) には、次の3件も研究・参考対象として書かれています。現行の `lib/catalog.ts` には登録されていないため、上の35件には含めません。

| 名前 | 何か | 扱い |
| --- | --- | --- |
| OpenJev（`openjev`） | 公開4Bモデル等で、文章を生成せず選択肢の確率を読むローカル判断の候補 | GPU PCが必要。未導入 |
| Jevlike（`jevlike`） | 変化する選択肢を採点する小型モデルの学習・評価候補 | AI Labの研究限定 |
| Awesome Jev by TypeSafe（`awesome-jev-by-typesafe`） | コミュニティのuse case・pattern・promptの資料集 | 実行しない。参考資料のみ |

---

## 3. Skyの役割エージェント（担当）

Skyは「ツールの一覧」だけでなく、**役割を持つ担当と会話して仕事を進める** 形へ段階的に移す方針です（2026-09-12）。利用者はツール名を覚えなくても、相談内容から担当へつながり、担当は許可されたMCP toolだけを使います。

| 担当 | 何をするか | 使うTool | 状態 |
| --- | --- | --- | --- |
| **サブスク顧問** | 契約、定期課金、更新、支払い失敗を確認する。PC内の台帳だけから回答 | `rockstar-ledger` | 実装済み。読み取り専用 |
| **法務受付** | 相談の安全性と緊急度を先に確認し、公式情報と無料窓口を案内する。弁護士が必要な場合だけ引継ぎ要約と候補を表示。自動送信しない | `rockstar-legal-intake` | 実装済み。オンライン検索は明示同意後だけ |
| **特許出願担当** | 発明を整理し、公式特許情報の候補調査と出願書類のドラフトを作る。特許性を保証しない | `rockstar-patent-assistant` | 実装済み。AI送信は明示同意、提出は本人 |
| 営業担当 | 案件条件と応募可否を確認する。応募の送信は本人確認 | `coconala` ほか | 構成案 |
| 編集担当 | 記事の無料版、出典整理、納品前の照合を行う | `mr-free-article`・`mr-citations`・`mr-delivery` | 構成案 |
| Wallet担当 | 認証済み収益、実行費用、留保を説明する。送金は本人確認 | Wallet | 構成案 |
| Sky受付 | 相談を分類し、1担当または複数担当の順序を提案する。無断で実行しない | — | 構成案 |

**すべての担当が持つ項目（会話契約）**

| 項目 | 意味 |
| --- | --- |
| role | 担当名と利用者に対する責任 |
| objective | 何を完了状態とするか |
| tools | 使用を許可するMCP toolのallowlist |
| dataScope | 読み取れる保存領域と外部送信の可否 |
| approval | 支払い、送信、公開、削除など本人確認が必要な操作 |
| memory | 会話中だけ／端末内／アカウント保存のいずれか |
| receipt | 参照データ、実行tool、結果、未完了理由の記録 |

会話の順序は、①相談を理解して担当とデータ範囲を示す → ②読み取り専用toolで状況確認 → ③結果と根拠を返す → ④外部変更が必要ならプレビューして本人確認 → ⑤許可された操作だけを1回実行してreceiptを残す、です。

ZemaにはSky Auto（依頼内容から接続済みの役割を自動で選ぶ）が既定で入っています。判別できない・未接続・入力不足のときは勝手に実行せず、追加情報かSkyでの接続を案内します（RQ18）。

くわしく: [役割エージェント仕様](sky-role-agents-20260912.md) / [Sky Assistant・Sky Memory設計](sky-assistant-and-memory.md) / [Toolチームと開発者還元](sky-network-economy.md)

---

## 4. Toolの中にあるサブシステム

1件のToolの中に、役割の違う仕組みが複数入っているものがあります。Toolの数には数えませんが、機能としては独立しています。

### 4.1 Fashion Brand Ops の4システム

`fashion-brand-ops` は catalog 上は1件ですが、中に4つのシステムと **41個のMCP操作** を持ちます。操作数をチームの人数や製品数に加算しません。

| システム | 何をするか |
| --- | --- |
| **Campaign Autopilot** | 売上・数量・粗利・期限・広告上限の目標から、市場仮説、content plan、下書き、承認要求を作る |
| **Sales Concierge** | DM履歴と購入意向から、返信案、見積り、次の一手を作る |
| **Production Cockpit** | 入金確認済みの注文から、資材、原価、能力、納期、工程、発送を管理する |
| **Management Dashboard** | 広告、DM、注文、粗利、制作結果を次の仮説へ返す |

計画と下書きは自動化しますが、価格変更・外部生成・投稿・広告・DM送信・請求・返金は操作ごとの署名付き承認が必要です。`paid`／`refunded` は検証済みの決済eventだけが変更できます。

### 4.2 IP Studio の capability

`rockstar-ip-studio`（候補）は、特定のサービス専用の画面ではなく、同じIPを画像・動画・3D・音声・ゲームAsset・SNS素材へ派生させる仕組みです。接続先は共通の capability で選びます。

| 種類 | capability |
| --- | --- |
| 生成 | `image.generate`・`video.generate`・`model3d.generate`・`voice.generate`・`asset.transform` |
| 展開 | `game.asset.publish`・`game.experience.publish`・`social.publish`・`reward.grant`・`analytics.read` |

Higgsfield、Runway、Roblox、GTA／FiveM、YouTube、Instagramは接続先の **例** で、対応製品・公式提携・動作保証の一覧ではありません。2026-10-04に、LiveKit Agentsによる音声会話・電話対応の接続設定が加わりました（本体との通話連携は未接続）。

### 4.3 通常のToolとは区別するもの

| 名前 | なぜToolと数えないか |
| --- | --- |
| **Material Invention Studio** | Core・sensor・XR・Safety・Simulation・Patent AI・labを束ねる application system。Skyで組み合わせる「発明チーム」の複合機能で、単体のcatalog Toolではない。Coreのsandboxは実装済み、操作画面とSky接続は未実装 |
| **Game** | 本体は application。生成や変換だけをToolにできる |
| **Wallet** | 金融台帳とProviderの境界。Toolの自己申告で残高を変更しない |
| **Fund** | 確認済みの実績から構成を比較する system。Tool自身に配分の権限を与えない |
| **ATM** | Walletとは別のadapter。ATM手数料0を他のTool料金へ転用しない |
| **Market / Polymarket** | `rockstar-markets-analysis` はcatalogのready Tool。`/polymarket` は `/market` への転送で、外部市場のPAPER試作は別のToolkit |

---

## 5. OSに入っているAIとAgent

端末（Android／native OS）の中で動く仕組みです。

| 名前 | 役割 | 権限 | 状態 |
| --- | --- | --- | --- |
| **Local Action Assistant**（local planner） | 端末内LLM（Qwen3-0.6B Q8_0、llama.rn）。Zemaの依頼から **計画の候補だけ** を返す | なし（plan only）。通信禁止。Tool実行・再試行・成果保存・権限判定はしない | 試験署名APKで所有Pixel 10の実機確認済み。OS imageへの組込みは未完了 |
| **Agent runtime / Broker / Engine** | planの検証、有限のTool実行、再試行、確認待ち、成果保存。通信がない間も続ける | owner・Tool・入力・権限・費用を再確認する唯一の判定者 | Platform Coreとして実装。実機OSでの受入は未完了 |
| **Security Agent（Spider／クモ）** | `id: spider`、`role: security`。①固定のPlatformデータを継続検査（watch）②送信前に検査（inspect）③機密の送信を拒否（deny）④状態を報告（report） | 独立したLLM判断・外部送信・root・任意ファイルの修正はしない | native OSのsourceに実装。変更後の同一image boot・Pixel実機・24時間連続運転は未受入 |
| **Operator Agent** | 運営側のOperator Dockから届く緊急保護の命令（端末ロック、紛失mode、Sky/Zema停止、session失効、OTA停止、通信隔離、診断、最大15分の保守）を、端末側で独立に検証して実行する | hardware credentialの署名が必要。任意shell・私的内容の閲覧・Wallet・鍵への経路なし | emulatorで確認。production credentialとPixel実機は未完了 |

**Security Agentの状態**は、`starting`／`stopped`／`unavailable`／`watching`／`sensitive_data_detected`／`recent_block`（実際の拒否から30秒）のいずれかです。検出した値そのものは画面にも記録にも出しません。

くわしく: [AIネイティブOS設計](ai-native-os-architecture.md) / [Local Action Assistantの導入](local-ai-os-integration-20260915.md) / [Platform Core](platform-core.md) / [Spider Guard](spider-guard.md) / [緊急アクセスとインシデント対応](security-incident-response.md)

---

## 6. クラウドのAgent

2026-10-02の現行方針では、主商品の価値の一つ目が「クラウドLLM・Agentへ速く簡単にアクセスできること」です。

| 仕組み | 何をするか | 状態 |
| --- | --- | --- |
| **統合Agent**（SIM/eSIM offerに含む初期構成） | SIM/eSIMを買うと使える、最初から用意されたAgentの組み合わせ。販売claimの `issuerId + offerId` をSkyの固定packageへ対応させる。利用者が選んだあとにだけ導入・実行する。追加はSky Marketから | 合成packageでWorker/D1とunit testのみ検証。実package・issuerのoffer設定・端末での導入は未受入 |
| **クラウド継続実行**（Sky Cloud） | 受付確認済み・事前承認済みの仕事を、端末が圏外でも予算と期限の範囲で続ける。再接続すると同じjobの進捗・結果・項目別の利用明細を受け取る | 要件と受入計画。ローカルのWorker/D1/Workflow fixtureで検証。実クラウド実行・本番課金は未受入 |
| **A2A Bridge**（Agent間の委任） | 外部のAgentを見つけ、接続し、仕事を委任するadapter。署名付き見積、親jobの共通予算、委任の深さ・fan-out・同時実行の上限、暗号化した引継ぎ | NodeとPythonのA2A server fixture間で相互運用を確認。本番のdispatch運用は未確認 |
| **Sky PackageのクラウドAgent実行** | 審査済みのSky PackageをクラウドのAgentとして実行するbinding | ローカルでpositive dispatchを確認 |
| **Agent runtime サービス** | Cloudflare Worker。`RemoteAiTextWorkflow`（リモートAIのテキスト処理）と `A2ADelegationWorkflow`（委任）、1分ごとの期限sweep | [`services/sky-agent-runtime/`](../services/sky-agent-runtime/)。本番D1・secret・cronは未設定 |
| **Agent Control Plane** | 開発作業をCursor Cloud Agentへ委任する境界。architecture reviewer／implementation／independent verifier／security reviewerの役割に分け、成果はpull requestだけ。Jevはworkflowの形を選ぶ助言役 | `dryRun: true` の決定的なプレビューのみ。リモート実行は料金・予算の統合まで閉じている |

**料金の約束（クラウドの有料実行すべてに共通）**：実行前に単価と見積範囲、実行中に予約額と照合済み額、完了後に項目別の利用明細を見せる。利用者が決めた上限を超える実行は、新しい見積と明示承認なしには行わない。通信プランの料金とAI・Agent・computeの費用は別項目にする。

くわしく: [SIM/eSIM-led architecture](sim-led-product-architecture.md) / [Sky Cloud継続実行](sky-cloud-continuity.md) / [A2A Bridge](sky-a2a-bridge.md) / [A2A価格見積拡張](a2a-pricing-extension.md) / [クラウド運用・復旧runbook](sky-cloud-operations-runbook.md) / [Agent Control Plane](agent-control-plane.md) / [クラウドAgent供給元の比較](cloud-agent-provider-comparison-20261001.md)

---

## 7. LLM・モデルの役割

「どのモデルが、どこで、何の役で使われているか」の一覧です。どのモデルの結果も、Brokerの権限・本人承認・Toolの成功へは昇格しません。

| ID | 使う場所 | 役割 | モデル／提供元 | 通信 | 権限 | 状態 |
| --- | --- | --- | --- | --- | --- | --- |
| `native-local-planner` | Platform Core | ローカルplanner | Qwen3-0.6B-Q8_0-GGUF（llama.rn 0.12.9） | 禁止 | 計画のみ | 実機APKで確認済み |
| `sky-openai-legal` | Sky Tool `rockstar-legal-intake` | 任意のクラウド生成 | OpenAI | 明示同意後に任意 | 助言のみ | 実装済み・設定が必要 |
| `sky-openai-patent` | Sky Tool `rockstar-patent-assistant` | 任意のクラウド生成 | OpenAI | 明示同意後に任意 | 助言のみ | 実装済み・設定が必要 |
| `sky-jev-evaluator` | Sky Tool `jev-evaluation` | リモート評価器 | TypeSafe AI `jev`（Vercel AI Gateway経由） | 明示同意後に必須 | 助言のみ | 実装済み・設定が必要 |
| `canonical-long-term-memory` | Platform Core | 記憶 | 未選定 | — | Brokerの範囲内のデータのみ | 設計のみ・未実装 |

- **文章モデルの接続先**（[`lib/llm-providers.ts`](../lib/llm-providers.ts)）：`local-model`（既定）／`ollama`／`openai`／`anthropic`／`google`／`openai-compatible`。資格情報はサーバーの環境変数だけ。リモートは `SKY_REMOTE_LLM_ENABLED=true` と要求ごとの同意が必要。自動fallbackなし。
- **Decision Fabric**（設計）：deterministic code・Jev／TypeSafe・Local Qwen・Cloud LLM・Codex・RAG・Market・Wallet・MCPを一つの判断基盤にまとめる構想。Jevは小さな意味判断、Local Qwenは秘密・offline、Cloud LLMは明示同意済みの複雑な推論、Policy Engineが唯一の実行権限の判定者。共通contractと安全policyは追加済み、Router／Harness・TypeSafe／Cloud／RAGの接続は未実装。
- **avokado専用モデル**（研究）：ゼロから事前学習する専用モデル。random-initの小型モデルをCPUで学習・保存・再開する試作（`avokado-byte-lm-v1`）まで。実用LLM・端末・クラウド配備は未完成。

くわしく: [LLM・評価モデル設計](llm-evaluation-architecture.md) / [Decision Fabric完成設計](jev-local-qwen-decision-fabric-design.md) / [記憶とモデル投影](ai-memory-architecture.md) / [専用モデルの事前学習設計](avokado-llm-pretraining.md) / [Local LLM接続監査](local-llm-connection-audit-20260920.md)

---

## 8. 開発を進めるエージェント（AMC）

AMC（avokado Mission Control）は、**このプロジェクト自体を開発するための体制** です。利用者向けのToolとしても `rockstar-amc` が catalog に入っていますが、下の32部隊は「製品を作る側」の担当表です。

### 8.1 5師団

| 師団 | 役割 | 部隊数 |
| --- | --- | ---: |
| 統合司令部 | 製品優先順位、Interface、予算、合格条件を一つに保つ。 | 1 |
| RockstarOS師団 | 全製品へ共通の権限、AI、仕事、Tool、保存、更新、復旧を提供する。 | 7 |
| avocadoMini師団 | Mini単独で空間入力、game、保存、停止を成立させ、任意で同型miniやProと連携する。 | 7 |
| avokadoPro師団 | ゲームとサービスをローカルで実行し、Miniの入力を体験へ変換する。 | 7 |
| rocketstar師団 | Payloadを運び、帰還、回収、再使用できる打上げsystemを成立させる。 | 10 |

### 8.2 32部隊

段階は 0 要件整理／1 基本設計あり／2 試作済み／3 一部統合／4 実機受入／5 本番受入 です。**部隊ごとの対象範囲に限った評価** で、製品全体の完成度ではありません。

| ID | 師団 | 部隊 | 目的（Goal） | 達成すると | 段階 |
| --- | --- | --- | --- | --- | ---: |
| H1 | 統合司令部 | 製品・Interface統合 | Mini、Pro、RockstarOS、rocketstarの優先順位、正本、Interface、合格条件を同期する。 | 全作業が一つの製品目的と受入条件へ結び付き、重複と責任不明を防ぐ。 | 3 |
| O1 | RockstarOS師団 | 権限・Security | 本人だけが許可した操作を実行し、全変更を監査・失効できるようにする。 | AI、Tool、Provider、運営者が権限を越えず、事故時に停止できる。 | 3 |
| O2 | RockstarOS師団 | Work・Data | 仕事、状態、成果物、Receiptを競合なく保存し、再起動後も復元する。 | 仕事の途中と結果を失わず、何が実行されたか追跡できる。 | 3 |
| O3 | RockstarOS師団 | AI・Agent | 交換可能なローカルAIが権限を持たずに計画し、Agentが許可済み手順だけを実行する。 | オフラインでも支援でき、model変更時も仕事と安全境界を維持する。 | 3 |
| O4 | RockstarOS師団 | Tool・MCP | Toolを審査、登録、接続、実行、停止、失効し、結果をReceiptで照合する。 | Toolを追加してもOSの権限・保存・費用境界が崩れない。 | 3 |
| O5 | RockstarOS師団 | Sky・Zema・Wallet | Tool選択、依頼、進捗、承認、成果、費用、確認済み収益を一つの利用体験にする。 | 利用者が一つの仕事を最後まで理解し、止め、再開し、結果と費用を確認できる。 | 3 |
| O6 | RockstarOS師団 | Device Adapter | 共通Coreを作り直さず、各hardwareをDevice ProfileとAdapterで接続する。 | Mini、Pro、Pixel、QEMUへ同じ権限・仕事・復旧契約を展開できる。 | 2 |
| O7 | RockstarOS師団 | Release・運用 | 同一候補を再現配布し、更新失敗や端末喪失から安全に復旧する。 | 導入、更新、停止、rollback、supportを証拠付きで運用できる。 | 3 |
| M1 | avocadoMini師団 | 製品設計・ICD | R5の要求、構成、BOM、接続、未決定、受入条件を一つの正本へ固定する。 | Miniの全小隊が同じ現行製品を作り、旧E1/E2/E3と混同しない。 | 1 |
| M2 | avocadoMini師団 | 筐体・機構 | 200mm以内で安全に設置、組立、清掃、保守できる筐体を成立させる。 | 生活空間へ無理なく置け、転倒や滑りを抑えた物理製品になる。 | 1 |
| M3 | avocadoMini師団 | Sensor・Tracking | 身体、手、物体の動きを時刻付き空間入力Eventへ変換する。 | ゲーム、研究、生活機能が同じ入力契約を利用できる。 | 1 |
| M4 | avocadoMini師団 | 空間表示・出力 | 入力結果と体験状態を空間表示、音、または2D fallbackで理解可能に返す。 | 利用者が何を選び、何が起き、なぜ止まったかを理解できる。 | 1 |
| M5 | avocadoMini師団 | 組込み・Firmware | Mini単体でboot・入力・game・保存・停止・復旧を成立させる。 | Proや外部Hubなしで基本体験を実行し、同型mini増設を任意で行える。 | 1 |
| M6 | avocadoMini師団 | 電源・熱・通信 | Miniを安全に連続運転し、複数MiniとProへ時刻付きで接続する。 | 長時間の利用と増設時にも入力品質と安全を維持する。 | 1 |
| M7 | avocadoMini師団 | Calibration・安全・受入 | 校正、privacy、入力停止、故障、復旧を実機で受け入れる。 | 誤入力や故障時に危険な動作へ進まず、安全に再開できる。 | 1 |
| P1 | avokadoPro師団 | Pro統合設計 | Proの要求、構成、BOM、接続、受入条件を一つの正本へ固定する。 | Proを商品説明だけでなく、実装可能で検証可能な製品へ変える。 | 0 |
| P2 | avokadoPro師団 | Compute・基板 | ゲーム、サービス、ローカルAIを所定性能と電力内で実行する。 | Pro単体で主要体験を安定して実行できる。 | 0 |
| P3 | avokadoPro師団 | Game Runtime・SDK | Pro単体とMini連携のgameを作者が導入、実行、保存、削除できるようにする。 | 外部game作者が安全にPro向け体験を提供できる。 | 0 |
| P4 | avokadoPro師団 | Service・Storage | 利用者別のservice、session、assetを暗号化して保存・復元する。 | ゲームと生活serviceの状態を端末内で安全に継続できる。 | 0 |
| P5 | avokadoPro師団 | 映像・Audio・I/O | Pro単体でdisplay、audio、controller、network、外部機器を接続する。 | 追加構築なしでgameとserviceを開始できる。 | 0 |
| P6 | avokadoPro師団 | Mini接続・時刻同期 | 一台以上のMiniを発見・pairingし、Poseを正しい順序と遅延でProへ届ける。 | Miniの動きがProのgameとserviceへ安定して反映される。 | 0 |
| P7 | avokadoPro師団 | 筐体・電源・Security・受入 | Proを家庭内で安全に連続利用し、更新失敗から復旧できる製品へする。 | 熱、電源、鍵、筐体、保守を含む販売可能性を検証できる。 | 0 |
| R1 | rocketstar師団 | Mission・System | Mission、要求、質量、Interface、成功条件を一つのsystem基準へ固定する。 | 全rocket部隊が同じMissionと凍結入力で設計・検証する。 | 1 |
| R2 | rocketstar師団 | 構造・Tank | 荷重、圧力、振動、熱に耐える構造、Tank、取付部を成立させる。 | 製造可能で検査可能な機体構造を作れる。 | 1 |
| R3 | rocketstar師団 | 推進 | 上昇と帰還に必要な推力を安全に発生、供給、停止、再始動する。 | Missionに必要な推進性能を再現可能な試験で示す。 | 1 |
| R4 | rocketstar師団 | 空力・熱 | 上昇、分離、再突入、帰還時の空力・熱環境へ耐える。 | 機体形状と熱防護の成立範囲を根拠付きで決める。 | 1 |
| R5 | rocketstar師団 | GNC・Avionics・Flight SW | 姿勢、軌道、分離、帰還を一般OSから独立した安全系で制御する。 | 故障時も安全状態へ移れる飛行制御systemになる。 | 1 |
| R6 | rocketstar師団 | Payload・分離 | 衛星・貨物を保持し、状態を確認し、安全に分離する。 | Payloadと機体双方のInterfaceと異常処理が追跡できる。 | 1 |
| R7 | rocketstar師団 | 電源・Data・A-LINK | 機体、Payload、地上間で電源、時刻、記録、通信を維持する。 | 通信断でも状態を失わず、復旧後に重複なく照合できる。 | 1 |
| R8 | rocketstar師団 | 地上・Launch | 輸送、設置、燃料、発射準備、hold、abortを安全に運用する。 | 飛行前の状態と責任が明確になり、危険時に中止できる。 | 1 |
| R9 | rocketstar師団 | 帰還・回収・再使用 | 同じ個体を帰還、回収、検査、整備し、再飛行可否を判定する。 | 再使用を宣言ではなく個体別証拠で判断できる。 | 1 |
| R10 | rocketstar師団 | 製造・品質・安全試験 | 設計どおりの機体を再現し、部品からflightまで構成と不適合を追跡する。 | 製造、検査、試験、releaseの根拠を同じ個体へ結び付けられる。 | 1 |

各部隊の「次の1タスク」と6件ずつの子作業（計192件）は [Mission Control](mission-control.md) にあります。

### 8.3 Codexの3エージェント

AMCをCodexから使うための役割定義です。正本は [`data/amc/agent-definitions.json`](../data/amc/agent-definitions.json)。

| 名前 | 役割 | やること | やらないこと |
| --- | --- | --- | --- |
| `amc`（司令官） | Goalと意図を維持し、任務を分割・割当・回収・検証する | 既存計画と進捗の照合、任務ごとの担当・入力・編集範囲・合格証拠の定義、独立した任務の並列委任（新規Goalはまず最大3部隊） | 元Goalの条件を勝手に変えない。JSONを直接編集してdone／acceptedを付けない。本人の受入を代行しない |
| `amc-worker`（実行担当） | 司令官が指定したGoal版・編集範囲・合格条件に沿って一つの任務を実施し、成果と証拠を提出する | 実装・調査・検査まで自分で進め、実在する差分と再現可能な検査証拠を添えて提出する | 範囲を勝手に広げない。他部隊と同じpathを変更しない。自分の成果を検収済み・本番合格にしない |
| `amc-reviewer`（独立検収担当） | 実行者の自己申告ではなく、合格条件と現物を照合する | 読み取りと非破壊の検査（設定はread-only）。pass／needs_changes／blocked を条件ごとの根拠つきで返す | 実装を変更しない。passはレビュー所見で、Skyの認証済み検収や本人の最終受入の代わりにならない |

起動は `npm run amc:agent -- run --goal '…'`。Zema Webからの起動、自動同期、無人の常時稼働は未接続です。

#### プロジェクト別の10担当Bot

正本は [`data/amc/project-bots.json`](../data/amc/project-bots.json)。Sky、Zema、Wallet、RockstarOS、Game、Security、avocadoMini、avokadoPro、rocketstar、Operationsを依頼窓口とし、32部隊のtaskAssignmentsを維持する。`npm run bot -- run sky --goal '…'` はGitHubと担当コードの履歴・task資料を収集してからCodexを起動する。Botが対象コードを読み、既存taskを選択／新規taskを具体化し、既存engineのAMC計画→任務遂行→別担当の検収→Git commit／PR→AMC結果記録を進める。計画作成だけで稼働・検収済みにはしない。`run/prepare <bot> --goal-file <AMC JSON>` は既存Goalを保持したコピーとengine生成の指示書を渡す。入力state・承認記録を新しい実行実績や権限へ変換しない。[利用・復旧・検証](../toolkits/amc-agent/README.md#プロジェクト別bot)。開発用の入口で、Sky catalog Toolの実行権限やWeb保存先は変更しない。

### 8.4 新しい依頼に使う4役割・7工程

SkyのTool `rockstar-amc` で新規の依頼を保存すると、**設計・実装・検証・統括** の4役割と7工程の共通テンプレートに置かれます。保存しても7工程はすべて `pending` で、AIや作業processは動きません。これは依頼の意味を理解して分解した結果ではなく、共通の準備計画です。

### 8.5 設計と監査の役割名

- **Astra** — AIネイティブOSの共通設計を具体化した設計担当（2026-09-16、RQ48）
- **Sol** — 正本・契約・Android実装・進捗証拠との整合を独立に監査した担当

くわしく: [Mission Control](mission-control.md) / [AMC Goal Orchestrator](amc-goal-orchestrator.md) / [AMC agentの使い方](../toolkits/amc-agent/README.md) / [Sky専用AMCの取り込み](amc-sky-launch-integration.md) / [AMCの有限fixture実行](amc-autonomy-fixture.md) / [Sol独立監査](ai-native-os-design-audit.md)

---

## 9. native OSに同梱した開発用Tool

Web／PCのcatalogとは別に、Linux／QEMU版のOS imageには **6種類・9バージョン** の開発用Toolが入っています。すべて端末内の有限処理、価格0、公開RFC試験鍵を使う開発用packageです。本番の作者identity・商用の安全性・Android移植を証明するものではありません。

| package ID | 内容 | バージョン | 入出力 |
| --- | --- | --- | --- |
| `org.example.action-checklist` | 共有用チェックリスト | 1.0.0 / 2.0.0 | text → Markdown checklist |
| `org.rockstar.citation-organizer` | 引用整理 | 1.0.0 | text → 整理済みtext |
| `org.rockstar.proposal-draft` | 提案下書き | 1.0.0 / 1.1.0 | 募集条件 → draft |
| `org.rockstar.text-tidy` | 文章を整える | 1.0.0 / 2.0.0 | text → 空白整理text |
| `org.rockstar.unique-list` | リストの重複を整理 | 1.0.0 | lines → unique sorted lines |
| `org.rockstar.utf8-sha256` | 入力テキストのSHA-256 | 1.0.0 | text → hashとbyte数 |

権限はどれも `text.input` / `text.output` だけです。場所は [`systems/rock-star-os/examples/registry/`](../systems/rock-star-os/examples/registry/)、作り方は [Tool SDK](../systems/rock-star-os/docs/TOOL-SDK.md)。

関連する端末側の実装:

- Androidの [`article-tool`](../android/article-tool/) — `mr-free-article` と `mr-citations` に対応する端末側の実装。[Android Tool SDK](../android/tool-sdk/) を使う
- nativeの [`hello` サンプル](../systems/rock-star-os/examples/tools/hello/) — Toolの作成例

これらをSky catalogの新しいTool IDや6種類へ重複して数えません。

---

## 10. Toolkitとサービス

### 10.1 Toolkit 13個（`toolkits/`）

Toolの実装、SDK、connector、PAPER試作をまとめた場所です。チームから独立した製品一覧ではありません。

| Toolkit | 種類 | 何か |
| --- | --- | --- |
| [`sky-tool-sdk`](../toolkits/sky-tool-sdk/) | SDK | Tool作者向けのpackage、サンプル、契約。既存ツールにコードを足してSkyの商品にする |
| [`sky-mcp-connector`](../toolkits/sky-mcp-connector/) | connector | MCPの接続先と権限を管理するPC内の共通Connector。`servers → connect → prepare → execute` |
| [`mr`](../toolkits/mr/) | adapter | `Mr.` の固定原本（[`vendor/mr/`](../vendor/mr/)）をSkyへ接続するRock側の実装 |
| [`fashion-brand-ops`](../toolkits/fashion-brand-ops/) | Tool実装 | 受注型ブランド運営の独立MCPサービス（41操作） |
| [`rockstar-ledger`](../toolkits/rockstar-ledger/) | Tool実装 | サブスク顧問のローカル台帳 |
| [`amc-agent`](../toolkits/amc-agent/) | エージェント定義 | Codexの司令官・実行担当・独立検収とCLI入口 |
| [`spider-guard`](../toolkits/spider-guard/) | 共通部品 | 機密情報の検出、外部送信前の検査、端末内コード検査。独立したcatalog Toolではない |
| [`esim-bootstrap`](../toolkits/esim-bootstrap/) | 試験fixture | eSIM provider接続を試すhost fixtureとadapter。製品形態を限定しない |
| [`avokado-llm`](../toolkits/avokado-llm/) | 研究試作 | random-initのCPU学習・保存・再開のhost試作 |
| [`mini-game-client`](../toolkits/mini-game-client/) | 診断launcher | 本人の明示操作で公式Remote Play（PS5／Xbox）へ渡す。実game／consoleは未受入 |
| [`polymarket-bot-sandbox`](../toolkits/polymarket-bot-sandbox/) | PAPER試作 | 外部市場を動かさないbacktest |
| [`meme-intelligence-sandbox`](../toolkits/meme-intelligence-sandbox/) | PAPER試作 | ミームコイン候補評価のPAPER sandbox |
| [`avocado-farm-sandbox`](../toolkits/avocado-farm-sandbox/) | PAPER試作 | 集中流動性LPの候補評価・レンジ計画・リスク制御（Robinhood Chain Testnet向け）。実トランザクション送信は未接続 |

### 10.2 サービス 5個（`services/`）

Webアプリ本体とは別に配備する単位です。

| サービス | 何か |
| --- | --- |
| [`sky-agent-runtime`](../services/sky-agent-runtime/) | クラウドAgentの実行Worker（リモートAIのテキスト処理、A2A委任、期限sweep） |
| [`sky-billing`](../services/sky-billing/) | 収益・費用の照合と請求のWorker。Walletの実資金受入とは別 |
| [`sky-web`](../services/sky-web/) | Sky専用Siteの配備adapter。既存のOS用DBを初期化・置換しない |
| [`operator-dock`](../services/operator-dock/) | 利用者向けOSと分離した、運営専用の端末管理面 |
| [`android-attestation-verifier`](../services/android-attestation-verifier/) | AndroidのKey Attestationを検証する独立JVMサービス |

---

## 11. 数え方の注意と、文書どうしの食い違い

### 数えるときの決まり

- `ready` 13件はSky catalog上の状態。外部Providerや本番決済まで接続済みという意味ではない。
- `candidate` 22件を、稼働中の担当・対応機能・収益機会へ数えない。
- Fashion Brand Opsの41操作、nativeの6種類9版、AndroidのToolを、Sky catalogの35件へ足さない。
- 一覧にある全Toolが同時に稼働するという意味ではない。チームの構成は利用者の選択と受入状態で変わる。
- Toolの完了は、販売・入金・法的有効性・特許・実世界の成果を保証しない。

### 見つかった食い違い（2026-10-07時点）

整理の途中で、文書どうしが合っていない箇所を見つけました。どちらが正しいかを決めるのはownerなので、ここでは **事実だけ** を並べます。

| # | 場所 | 食い違い |
| --- | --- | --- |
| 1 | [全Tool詳細設計 §4 Tool一覧](sky-tools-complete-design.md#4-tool一覧) | 表は26行。catalogにない `openjev`・`jevlike`・`awesome-jev-by-typesafe` を含み、catalogにある `jev-evaluation` と `Mr.` 由来の候補11件が表にない（本文の§15.5と§16には記載あり）。冒頭の「ready 13・候補22」とは行数が合わない |
| 2 | [`lib/catalog.ts`](../lib/catalog.ts) | `rockstar-markets-analysis` の表示名が「avocadoOS Market Scanner」、複数のToolで `source` が「avocadoOS built-in」、`license` が「avocadoOS code」。製品名は09-17にRockstarOSへ戻っている（RQ43） |
| 3 | [`data/llm-capabilities.json`](../data/llm-capabilities.json)・[LLM・評価モデル設計](llm-evaluation-architecture.md) | `product.displayName` と文書の題名が「avocadoOS」のまま |
| 4 | [全Tool詳細設計 §21](sky-tools-complete-design.md#21-現在の共通未完成点) | 「candidate 13件の採否」とあるが、現在の候補は22件 |
| 5 | [製品ベース](product-baseline.md) の並び | 新しい判断を上へ足してきたため、H1が2つあり、日付順でもない。検査（`npm run baseline:check`）が本文と結び付いているので並べ替えず、冒頭に読み方の案内だけ足した。[`sky.md`](sky.md) と [進捗ログ](../project.md) にあった「題名より上の追記」は2026-10-07に本文へ移した |
| 6 | [`sky.md`](sky.md)「Skyに表示する導入候補22件」 | 見出しは22件だが、従来の表は13行で、catalogにない資料・研究用の3件を含み、`Mr.` 由来11件とIP Studioが無かった。2026-10-07に、統合で落ちていたID付きの22行の表を復元して並べた。従来の表は残してある |
| 7 | 復元した2026-10-01〜10-05の記述 | [全Tool詳細設計 §1.3](sky-tools-complete-design.md#13-全toolの実行器棚卸しと管理runtime進行中) やREADMEの復元箇所には「全34件」「built-in 12件」とある。AMC（`rockstar-amc`）が13件目のreadyとして入る前の数で、現在は35件・ready 13件 |
| 8 | avokadoProの価格 | 2026-09-25の本人決定と公開Siteは「From ¥880,000」、2026-10-05の[Pro PC設計](avokado-pro-pc-design.md)とREADMEは「販売目標80万円／台」。どちらが現行かの記録がない |
| 9 | task台帳と設計台帳 | [`data/project-status.json`](../data/project-status.json) にSIM/eSIMを題名に持つtaskが無い（`main` にあった `SIM01` などが2026-10-05の統合で消えた）。[`data/design-document-index.json`](../data/design-document-index.json) もToolごとの実装・試験の対応が大きく減っている。詳細は[統合で失われた情報の監査](merge-loss-audit-20261007.md) |

---

## 12. Toolを追加・変更したときに直す場所

Toolを1件足すと、次の場所が連動します。上の4つは既存のルール（`npm run design:check` と `npm run sky:check` が欠落を検出）、最後の1つがこの文書です。

| 順 | 直す場所 | 何を書くか |
| ---: | --- | --- |
| 1 | [`lib/catalog.ts`](../lib/catalog.ts)（nativeなら [registry](../systems/rock-star-os/examples/registry/)） | identity、状態、実行環境、費用、手順、注意 |
| 2 | [全Tool詳細設計](sky-tools-complete-design.md) | 共通Tool契約の全区分（目的、入出力、実行場所、権限、effect、費用、lifecycle、失敗、証拠、privacy、互換） |
| 3 | [`data/design-document-index.json`](../data/design-document-index.json) | 設計台帳への登録 |
| 4 | [プロジェクト別ガイド](../PROJECTS.md) | チーム一覧とToolの表 |
| 5 | **この文書** | 第2章の表と機能、件数、必要なら第3章の担当 |

Tool追加の完了条件10項目は [全Tool詳細設計 §20](sky-tools-complete-design.md#20-tool追加の完了条件) にあります。
