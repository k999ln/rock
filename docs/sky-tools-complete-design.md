# Sky／Zema／全Tool詳細設計

版: 1.1 / 2026-09-21
対象: Skyにある12件のready Tool、22件の導入候補、native開発Tool、Tool追加基盤。

この文書は、Tool名の一覧ではなく、各Toolについて「誰が何を入力し、どこで動き、何を保存し、どこから外部作用になり、何をもって完了とするか」を同じ形で説明する。カタログの機械可読正本は`lib/catalog.ts`。この文書とカタログの欠落は`npm run design:check`で検出する。

## 1. SkyとZemaの役割

```text
Sky                                    Zema
Toolを探す                             依頼を受ける
作者・版・料金・権限を見る             不足情報を質問する
実行場所を選ぶ                         計画と承認点を見せる
接続・停止・失効する                   実行・停止・進捗・結果を管理する
             └──── Tool IDと依頼を渡す ────┘
```

Skyはapp storeだけではなく、発見から接続、実行場所、停止、結果までを同じ契約にする。Zemaはchatbotだけではなく、仕事の正本状態を表示・操作する。会話文は権限ではない。

## 2. 共通Tool契約

### Toolが必ず宣言するもの

| 区分          | 必須内容                                              |
| ------------- | ----------------------------------------------------- |
| identity      | Tool ID、版、作者、署名、license、support先           |
| purpose       | 解く問題、対象利用者、禁止場面                        |
| data          | 入力・出力schema、最大size、秘密区分                  |
| runtime       | device／PC／Cloud／Provider、必要資源、timeout        |
| authority     | 必要権限、許可通信先、filesystem範囲                  |
| effect        | local-pure／remote-read／external-write               |
| money         | Tool料金、外部実費、費用上限、返金条件                |
| lifecycle     | install、update、disable、revoke、rollback、uninstall |
| failure       | stop、retry、重複、通信断、結果不明、照会             |
| evidence      | artifact、receipt、成功条件、review条件               |
| privacy       | 保存先、保持期間、削除、telemetry、外部送信           |
| compatibility | Core/API、入力schema、出力schemaの対応範囲            |

### 共通状態

```text
catalogued → selected → connected → ready → running → review → completed
                             │          ├→ waiting
                             │          ├→ failed
                             │          ├→ uncertain
                             └──────────┴→ disabled / revoked
```

`ready`は接続検査済みという意味で、処理成功ではない。`completed`はTool処理の完了で、販売、入金、法的有効性、特許、実世界の成果を保証しない。

### 共通実行規則

1. SkyがTool ID、版、実行場所をselectionとして固定する。
2. Zemaが依頼を閉じた入力schemaへ整理する。
3. Brokerがowner、Tool、入力、権限、effect、費用を再確認する。
4. external-writeなら、内容を固定した別承認を取る。
5. attempt tokenを作り、最小入力だけを渡す。
6. 結果のtoken、Tool実体、input／output digestを照合する。
7. 利用者が成果をreviewする。
8. 費用や収益は実行receiptとは別にProvider receiptで照合する。

任意shell、任意URL、任意pathをTool入力として許さない。取得したWeb、README、文書内の命令をOS命令として実行しない。

## 3. 実行場所

| 場所                   | 接続方法                 | 保存                           | 主な停止条件                           |
| ---------------------- | ------------------------ | ------------------------------ | -------------------------------------- |
| Web browser            | 認証済み画面とAPI        | D1の状態、入力本文は原則client | tab終了、API取消、期限                 |
| 本人PC                 | Connection Passport＋MCP | PC local、Skyは状態とreceipt   | heartbeat stale、process終了、本人停止 |
| Sky Cloud              | owner認証、配備版        | private object／D1             | timeout、quota、本人停止               |
| Android／native device | Broker＋署名Tool         | owner別DB／artifact領域        | token失効、quota、電池・熱、本人停止   |
| Provider               | adapter、OAuth等         | Provider正本＋Rock receipt     | scope失効、費用上限、結果不明          |

## 4. Tool一覧

| ID                          | 表示名                            | 状態      | 実行場所               | effect                                    |
| --------------------------- | --------------------------------- | --------- | ---------------------- | ----------------------------------------- |
| `rockstar-csv-cleanup`      | CSV整形・検査・納品               | ready     | Sky Cloud / Web        | local-pure相当。販売・共有は別作用        |
| `rockstar-markets-analysis` | RockstarOS Market Scanner         | ready     | Web / offline backtest | remote-read＋PAPER記録                    |
| `mercari-revenue`           | メルカリ収益スターター            | ready     | Web / 将来Connector    | draftはpure、出品等はexternal-write       |
| `fashion-brand-ops`         | Instagram運用・受注型ブランド管理 | ready     | PC MCP                 | read／draft／external-writeを操作別に分離 |
| `rockstar-ip-studio`        | IP Studio — SNS・ゲーム運用        | candidate | PC / Provider          | 生成・配信・ゲーム提出を別capability化   |
| `coconala`                  | ココナラ案件チェック              | ready     | Web                    | local-pure                                |
| `mr-free-article`           | 記事の無料版メーカー              | ready     | Web                    | local-pure                                |
| `mr-citations`              | 出典整理ツール                    | ready     | Web / PC               | local-pure                                |
| `mr-delivery`               | 納品記録の照合                    | ready     | PC                     | local-pure                                |
| `rockstar-ledger`           | サブスク顧問                      | ready     | PC MCP                 | local read-only                           |
| `rockstar-legal-intake`     | 法務受付                          | ready     | Web / 任意AI           | local整理＋同意後remote-read              |
| `rockstar-patent-assistant` | 特許出願アシスタント              | ready     | Web / 任意AI           | local draft＋同意後remote-read            |
| `faster-whisper`            | 文字起こし候補                    | candidate | PC                     | 未接続                                    |
| `transformers-js`           | ブラウザAI候補                    | candidate | browser                | 未接続                                    |
| `playwright`                | 許可Web操作候補                   | candidate | PC / Cloud             | 未許可                                    |
| `jev-ultrafast`             | 選択型browser agent候補           | candidate | 本人PC                 | 未接続・未実行                            |
| `openjev`                   | local typed-decision候補          | candidate | GPU PC                 | 未導入                                    |
| `jevlike`                   | 判断model研究候補                 | candidate | AI Lab                 | 研究限定                                  |
| `jev-trader`                | 市場判断研究候補                  | candidate | PAPER sandbox          | LIVE禁止                                  |
| `awesome-jev-by-typesafe`   | Jev開発reference                  | candidate | 文書                   | 実行しない                                |
| `typesafe-computer-use`     | Mac画面操作候補                   | candidate | 隔離macOS              | observeから開始                           |
| `jev-review`                | code review候補                   | candidate | 本人PC                 | 自動変更禁止                              |
| `jev-router`                | model routing候補                 | candidate | 本人PC                 | routing-only                              |
| `jev-browser`               | 連続browser操作候補               | candidate | 本人PC                 | 未接続・未実行                            |
| `mobile-jev`                | Android操作候補                   | candidate | 隔離試験端末           | 個人端末禁止                              |

## 5. CSV整形・検査・納品

### 目的と一周

利用者がCSV一件と、列名、列順、空白、重複、並び、文字codeの指示を送る。受付がsizeと変換可能性を検査し、決定的に変換する。別検査が入力、出力、変更報告を照合し、結果CSV、変更報告、検査JSONを一組で渡す。

### 詳細契約

- 入力: CSV一件、最大10 MB／50,000行／100列、変換指示。
- 出力: 変換CSV、変更report、独立inspection JSON。
- 保存: 暗号化private storage。受付から7日で取得拒否、または本人削除。
- 禁止: 値の推測、文字列の勝手な数値化、複数file結合、外部市場代理操作。
- effect: 変換はTool内。buyer共有、販売、入金、返金は別adapter／承認。
- 完了: 3成果のhashと検査合格。手入力入金をWallet収益にしない。
- 失敗: 破損、上限超過、曖昧指示、非決定変換は`needs_review`または拒否。

正本: [CSV business v1](csv-business-v1.ja.md)、`lib/csv-transform.ts`、`lib/csv-job-store.ts`、`data/csv-business-tasks.json`。

## 6. RockstarOS Market Scanner

- 目的: 型付き価値対象を登録し、価格・需要・PAPER履歴を検証する。
- 入力: 対象type、説明、価格、供給量、注文案、本人承認digest。
- 出力: PAPER quote、risk判定、position、event、receipt。
- 実行: Web市場。外部Polymarketは公開dataのread-onlyと固定commit offline backtest。
- 保存: market、order、position、eventをownerとmodeで分離。
- 禁止: 秘密鍵、LIVE切替、外部注文、実Wallet移動、simulation PnLの実収益化。
- 完了: 同一digestの本人承認後にPAPER台帳が一度だけ更新される。
- 失敗: 外部取得失敗をsampleで補完しない。unknown marketや不正数値を拒否。

正本: [Everything Market / Fund](everything-market-and-autonomous-fund-20260913.md)、[Polymarket sandbox](polymarket-bot-sandbox-20260913.md)。

## 7. メルカリ収益スターター

- 目的: 所有在庫から出品原稿、実費後見込み、確認、取引完了までを管理する。
- 入力: 所有商品、状態、価格、販売手数料、送料、仕入原価。
- 出力: 出品draft、見込み手取り、確認事項、取引状態。
- 個人メルカリ: 本人が公式画面で出品・連絡・発送・出金する。
- Shops: 日本固定IP、公式API契約、token、個別承認後だけConnectorを使用する。
- 保存: owner別listing draft、費用、状態。個人credentialは保存しない。
- 禁止: 無人出品、大量再出品、購入、message、発送、出金。
- 完了: Providerが取引完了と入金を確認した売上だけEarning Receipt候補になる。
- 失敗: 自己申告売上は未検証のまま。販売や利益を保証しない。

正本: [Mercari revenue loop](mercari-revenue-loop.md)、`lib/mercari-revenue.ts`。

## 8. Instagram運用・受注型ブランド管理

### 中の四system

1. Campaign Autopilot: 目標、商品、予算から市場仮説、content plan、draft、approval requestを作る。
2. Sales Concierge: DM履歴と購入意向から返信案、見積り、次の一手を作る。
3. Production Cockpit: paid orderから資材、原価、能力、納期、工程、発送を管理する。
4. Management Dashboard: 広告、DM、注文、粗利、制作結果を次の仮説へ返す。

### 詳細契約

- 入力: brand policy、product、goal、asset、social account ref、顧客event、決済event。
- 出力: plan、draft、approval request、DM draft、order、production task、analytics。
- 実行: 本人PCのNode MCP。初期Providerはmock。
- secret: `env://`またはvault参照。access token本文をDBやmetadataへ保存しない。
- external-write: 価格変更、外部生成、投稿、広告、DM送信、請求、返金、通知は操作別の署名付きapprovalが必要。
- money: `paid`／`refunded`は署名検証済みProvider eventだけが変更できる。
- 冪等性: provider event ID、run ID、approval digestで重複を拒否。
- 完了: draft作成と外部投稿成功を分け、productionはpaid orderと能力計画を結ぶ。

正本: [Fashion Brand Ops integration](fashion-brand-ops-integration.md)、`toolkits/fashion-brand-ops/README.md`、同toolkitのruntime／tests。

## 8.5 IP Studio — 交換可能な制作・配信・ゲーム展開

IP StudioはHiggsfield専用の生成画面でも、Roblox／GTA専用の投稿画面でもない。同じIPを画像、動画、3D、音声、ゲームAsset、SNS素材へ派生させ、元IP、入力素材、権利、生成条件、版、公開先、反応を一つのlineageで管理する。Zemaが依頼と進行を持ち、Skyがcapabilityに合う接続先を選び、IP StudioがAssetの正本を持つ。

- 入力: IP／character ID、参考Asset、目的、必要capability、出力要件、品質条件、予算上限、privacy、商用権利、期限、許可送信先。
- Provider選択: 毎回選択、優先Provider＋許可済みfallback、本人policy内の自動選択。Higgsfield等の固有名は候補であり、job schemaへ固定しない。
- 生成capability: `image.generate`、`video.generate`、`model3d.generate`、`voice.generate`、`asset.transform`。
- 展開capability: `game.asset.publish`、`game.experience.publish`、`social.publish`、`reward.grant`、`analytics.read`。
- 出力: 共通Asset ID、出力hash、元IP／入力digest、Provider／model／版、provenance、権利条件、費用、Provider receipt、review状態、公開・ゲーム導入状態。
- external-write: SNS公開、広告、ゲーム提出、公開Asset更新、報酬付与は対象と内容を固定した別承認を必須とする。
- fallback: 新しい送信先、費用、権利条件、公開範囲へ変わる場合は再承認し、別attemptとして親jobへ結ぶ。
- 完了: 生成完了、review合格、公開成功、ゲーム反映、売上／反応取得を別状態にし、前段成功から後段を推測しない。
- 失敗: timeoutや結果不明はProviderへ照会し、同じ外部作用を自動再送しない。Provider失効後も過去Assetのprovenanceとreceiptを保持する。

接続契約の正本は[Sky MCP接続設計](sky-mcp-architecture.md)。現在のcatalog／接続画面は候補と設定面であり、Higgsfield、Roblox、YouTube、GTA等の本番成功を意味しない。

## 9. ココナラ案件チェック

- 目的: 依頼文と提案文から、単発・非同期案件として条件が合うかを送信前に確認する。
- 入力: 依頼文、提案文、契約形態、発注率等の本人確認情報。
- 出力: eligibility、理由、要確認事項。
- 実行・保存: browser local処理。本文を永続化・外部送信しない。
- 禁止: 自動応募、返信、受注判断、入金確認。
- 完了: 判定理由を表示し、本人が元pageの条件と規約を確認する。
- 限界: 規約適合、受注、報酬を保証しない。

正本: `lib/mr-tools.ts`、`toolkits/mr/rock_star_tools.py`、固定Mr.原本hash。

## 10. 記事の無料版メーカー

- 目的: 本人が使用権を持つ完全版原稿から、無料紹介版を作る。
- 入力: Markdown、無料範囲、summary、価格、残す有料内容、案内URL。
- 出力: 無料版Markdown。
- 実行: browserまたはAndroid固定Toolのlocal-pure処理。
- 保存: 入力と出力はclient／owner artifact。本文をtelemetryへ送らない。
- 禁止: 自動執筆、権利未確認原稿の利用、note投稿、販売。
- 完了: 入力schema、出力size、本人review。sample結果だけでは次stepへ進めない。
- 互換: `article-preparation@1`の二工程では出典整理後に実行する。

正本: [`contracts/article-tool.json`](../contracts/article-tool.json)、[`contracts/article-fixtures.json`](../contracts/article-fixtures.json)、`lib/mr-tools.ts`。

## 11. 出典整理ツール

- 目的: Markdown本文内のURLを重複整理し、codeや非link出典を壊さず一覧化する。
- 入力／出力: UTF-8 Markdown。PC Connectorは入出力各65,536 byte、3秒、同時1件。
- 実行: browser、PC固定CLI、Android固定Tool。
- effect: local-pure。network先の記事内容は読まず、URLを整理するだけ。
- 禁止: 出典の事実確認、引用妥当性の保証、本文内容の外部送信。
- 完了: 同じ入力から同じ出力、重複URL、CRLF、code、絵文字fixtureが一致する。
- 失敗: size、timeout、原本hash不一致、未知入力を拒否する。

正本: [PC citations adapter](pc-citations-adapter.md)、`toolkits/mr/pc_citations.py`、Android `article-tool`。

## 12. 納品記録の照合

- 目的: 契約条件、成果物、制作記録、独立reviewの不一致を納品前に発見する。
- 入力: 構造化された契約、成果物参照、制作log、別review。
- 出力: 一致、不一致、欠落のcheck report。
- 実行: 本人PCのPython。指定file以外を走査しない。
- 禁止: 品質の自動保証、秘密情報不在の保証、自動納品。
- 完了: 全参照file digestと照合結果を表示し、本人が納品判断する。
- 失敗: file欠落、schema不一致、別成果のdigestを拒否する。

正本: `toolkits/mr/rock_star_tools.py`、[Mr integration](mr-integration.md)。

## 13. サブスク顧問

- 目的: 契約、更新日、支払い失敗、定期課金候補を通貨別に確認する。
- 入力: PC local SQLiteの契約とcard明細由来候補。
- 出力: 要対応、更新予定、通貨別月額。異通貨を勝手に合算しない。
- 実行: PC MCP。Sky側はread-only。
- 保存: 契約dataは本人PC。Skyは入力本文を保存しない。
- 禁止: 解約、支払い、税務申告、card操作。
- 完了: Connection Passportとfresh health後にqueryし、最終確認時刻を表示する。
- 失敗: 接続staleをoffline／unknownとし、古い値を最新と表示しない。

正本: `toolkits/rockstar-ledger/README.md`、`lib/subscription-advisor.ts`。

## 14. 法務受付

- 目的: 状況を整理し、政府・裁判所等の公式情報と無料窓口を案内し、必要なら専門家への引継ぎを準備する。
- 入力: 分野、地域、危険、逮捕、公的書類、期限、状況、希望。
- 出力: 緊急案内、確認事項、公式source、一般情報、引継ぎsummary。
- 保存: 相談本文をSky serverに保存しない。AI利用時は明示同意した内容だけ送る。
- 禁止: 法的助言の断定、期限確定、勝敗予測、自動連絡、受任保証。
- 緊急: 差し迫る危険は通常Tool flowより緊急serviceを優先表示する。
- 完了: allowlistされた公式citationを持ち、本人が専門家連絡内容を確認する。
- 失敗: jurisdiction不明、公式sourceなし、緊急性不明では追加確認または安全案内へ止める。

正本: [Sky legal intake](sky-legal-intake-20260912.md)、`lib/legal-intake.ts`、`lib/legal-ai.ts`。

## 15.5 Jev品質評価

`jev-evaluation` は、本人が送信対象・送信先・料金・保持条件を確認した後に、最小化した入力を評価するremote evaluatorである。評価Receiptはreview signalとして保存し、権限付与、Tool成功、仕事完了、専門家判断の代替にはしない。

## 15. 特許出願アシスタント

- 目的: 発明情報、先行技術候補、差分、明細書、請求項、要約のdraftを準備する。
- 入力: 発明者／出願人候補、公開状況、課題、仕組み、構成、効果、既存技術差。
- 出力: disclosure、official DB search plan、citation候補、claim chart、filing packet draft。
- 保存: 発明本文をSky serverへ保存しない。AI調査は明示同意後だけ送信する。
- source: 公式特許DB等のallowlist。引用なしのAI断定を受け入れない。
- 禁止: 特許性、登録、侵害回避、法的発明者、権利帰属、期限の確定。自動署名、支払、提出。
- 完了: public disclosure警告、source付き比較、human／professional review gateを持つ。
- Material連携: avocadoMini eventの人、AI、simulation、文献、実測を分けたpacketを受ける。bridgeは未実装。

正本: [Patent assistant](sky-patent-assistant-20260912.md)、`lib/patent-assistant.ts`、`lib/patent-ai.ts`。

## 16. 導入候補22件

### 追加された候補

`rockstar-ip-studio` はSNS・ゲーム運用の候補。`coconala-proposal-draft`、`gig-workflow`、`coconala-inbox`、`youtube-script-writer`、`seo-blueprint`、`landing-page-sprint`、`sales-objection-reply-builder`、`user-interview-synthesizer`、`calendar-coordination`、`telegram-notifications`、`producthunt-discovery` は旧Mr. Automation由来の候補である。いずれもSkyのcatalogには登録済みだが、本人接続、権限、保存、外部作用、結果確認をToolごとに受入するまで、実行済み・接続済みとは表示しない。

### faster-whisper

音声を本人PC内で文字起こしする候補。採用前にmodel license、download、CPU／GPU、音声形式、言語、精度、処理時間、保存、削除、speaker情報、MCP schemaを固定する。現時点は自動導入・実行・収益連携なし。

### Transformers.js

browser内分類・要約等の候補。library licenseと個別model licenseを分け、model hash、WebGPU fallback、memory、download容量、cache、input privacy、出力schemaをToolごとに受け入れる。現時点は特定modelも処理も未選定。

### Playwright

許可されたWebテスト・操作の候補。origin allowlist、credential保管、操作schema、screenshot、download、外部送信、CAPTCHA／MFA、利用規約、external-write承認、結果不明を設計するまで第三者siteの無人操作を許可しない。

### Jev Ultrafast

構造化したWeb操作候補からAIが一手を選ぶbrowser agent候補。RockstarOSでは専用Chrome profile、一仕事一tab、origin allowlist、`observe`／`prepare`／`act`の三段階、有限operation、秘密入力拒否、external-write直前の一回承認、完了の独立検証を必須にする。upstream sourceとMIT license、Python 3.12以上、Browser Harness、外部APIを確認済みだが、source取得、依存導入、API key接続、MCP adapter、Chrome操作は未実施。詳細は[Jev Ultrafast統合設計](jev-ultrafast-integration-design.md)。

### OpenJev

公開4B model等を使い、文章を生成せずruntime-defined optionの確率を読むlocal decision候補。Python 3.10以上、CUDA、GPU、model downloadが必要。model revision、prompt hash、calibrationを固定し、結果から外部作用を直接実行しない。

### Jevlike

変化する選択肢を採点する小型modelの学習・評価候補。dataset／checkpoint provenance、train／validation分離、model card、誤選択を検証するAI Lab用途とし、game demoを一般的な判断能力の証明にしない。

### Jev Trader

order bookから売買方向を選ぶ市場研究候補。RockstarOSでは`PRIVATE_KEY`を渡さず、固定replayとPAPERだけに限定する。実注文、実資金、LIVE、収益実績への計上を禁止する。

### Awesome Jev by TypeSafe

communityによるuse case、pattern、prompt、starter codeの資料集。実行ToolではなくDesign Libraryのreference-onlyとして登録し、紹介先のlicense、価格、model、外部作用を個別に確認する。

### TypeSafe Computer Use

OCR等でMac画面を読み、Jevが次のactionを選ぶPC操作候補。専用macOS account、許可app、observe mode、emergency stopを必須とし、Terminal、system設定、credential、決済、無承認送信を拒否する。

### Jev Review

Git差分または指定codebaseを段階的にreviewする候補。scopeとcommitを固定し、秘密fileを除外する。report作成までで、自動修正、commit、push、merge、issue投稿は行わない。

### Jev Router

Codex／Claude Codeの新しいturnをmodelへ振り分ける候補。既存CLIのsession、permission、authenticationを維持し、routingを権限拡大やprompt改変に使わない。

### Jev Browser

既存browser toolの観測・操作・検証loopでJevが要素を選ぶ候補。installerを自動実行せず、専用profileとowned siteのread-only試験から始め、各stepをBrowser Brokerで検査する。

### Mobile Jev

Mobilerun経由のAndroid操作候補。Rock所有のwipe可能な試験端末と許可appだけを使い、個人端末、SIM、連絡先、写真、password、決済、予約確定、権限変更を拒否する。

10件のJev ecosystem全体の役割分離、共通schema、Tool別権限、受入順は[Jev ecosystem全体詳細設計](jev-ecosystem-integration-design.md)を正本とする。

候補はready Tool数、対応機能、収益機会へ数えない。

## 17. native開発Tool

Linux／QEMU imageには次の6 family・9 versionがある。

| family               | version       | 入出力                    | 権限                         |
| -------------------- | ------------- | ------------------------- | ---------------------------- |
| 共有用チェックリスト | 1.0.0 / 2.0.0 | text→Markdown checklist   | `text.input` / `text.output` |
| 引用整理             | 1.0.0         | text→整理済みtext         | 同上                         |
| 提案下書き           | 1.0.0 / 1.1.0 | 募集条件→draft            | 同上                         |
| 文章を整える         | 1.0.0 / 2.0.0 | text→空白整理text         | 同上                         |
| リストの重複を整理   | 1.0.0         | lines→unique sorted lines | 同上                         |
| SHA-256              | 1.0.0         | text→hashとbyte数         | 同上                         |

すべて端末内の有限処理、価格0、公開RFC test鍵の開発package。本番作者identity、商用安全性、Android移植を証明しない。

正本: `systems/rock-star-os/examples/registry/`、`systems/rock-star-os/docs/TOOL-SDK.md`。

## 18. Material Inventionは通常Tool一個ではない

Material Invention／avocadoMiniは、Core、sensor、XR、Safety、Simulation、Patent AI、labを束ねるapplication systemである。SkyからsimulationやPatent AI等をTool／Providerとして選ぶが、候補graphと証拠の正本はMaterial Invention Coreに置く。詳細は[空間発明システム設計](rockstaros-avocado-mini-complete-design.md)。

## 19. Game、Wallet、Fundも通常Toolと区別する

- Game本体はapplication。生成や変換だけをToolにできる。
- Walletは金融台帳・Provider境界。通常Toolの自己申告で残高を変更しない。
- Fundは確認済み実績から構成を比較するsystem。Tool自身に配分authorityを与えない。
- ATMはWalletとは別adapter。ATM手数料0を他Tool料金へ転用しない。

## 20. Tool追加の完了条件

1. `lib/catalog.ts`またはnative Registryへidentityを追加する。
2. 共通Tool契約11区分を全て記載する。
3. 入力・出力schemaと正常fixtureを追加する。
4. size、unknown field、重複、timeout、cancel、通信断の負例を追加する。
5. effectと承認点を分類する。
6. secret、保存、保持、削除、telemetryを記載する。
7. artifactとreceiptを分ける。
8. Zemaで開始、進捗、停止、review、結果を扱えるようにする。
9. fixture、Web、PC、QEMU、APK、OS image、Provider、本番の合格を分ける。
10. 全設計台帳と本書へ追加し、`npm run design:check`を通す。

## 21. 現在の共通未完成点

- 第三者Toolの本番author identity、署名登録、失効、review、sandbox。
- 一般Tool capability schemaとAndroid P1 AIDL／native package／MCPの相互運用。
- CPU、memory、storage、network、電池、熱の強制quota。
- external-write outboxとProvider照会の全Tool共通実装。
- 多端末selectionと一つの仕事のauthority移送。
- 本番料金、返金、dispute、receiptのProvider横断契約。
- candidate 13件の採否と具体的Tool schema。Jev ecosystem 10件は統合schemaを設計済みだがruntime未実装。

これらを未決定のまま「全Tool platform完成」と表示しない。
