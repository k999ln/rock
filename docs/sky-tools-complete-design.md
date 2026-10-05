## Sky focused公開判定の修正（2026-10-02）

ROCK/WEB04: 2026-10-02: 既存Sky v28（source cb55411549649bd57429fa1afeb974139fc024da）公開成功。CSV専用Stripeはliveで、既存JPY50円受付はcompleted/stripe_verified/attempt1/revision3を公開D1で再確認した。新しい決済はしていない。一般MarketplaceのStripe/Connect受入とは別。クラウドProvider keyと信頼料金は未設定、pricing gateはfalse、production Cloud executionは0件。Pixelは接続済みだがロック中。保存回答管理と会話引継ぎの合成受入を本番owner/実AIの証明にしない。

`focused` stageを追加し、既存basic条件に実Cloud AIの応答・所要時間・項目別usage/cost・上限/timeout、同じ公開sourceのdesktop/Pixel顧客導線、全34 Toolの個別分類、対応端末のApple Payを加えた。既存paid-marketplace/clients scopeを省略せず独立して保持する。`node scripts/check-sky-launch.mjs --require-stage focused` は不足が残る限りexit 1で、設定キーの存在やmockだけでは合格にしない。検査自体の整合は`npm run verify`へ追加した。必要stage/gateの削除、基本受入の省略、合成環境のpassed、根拠欠落、依存cycle、未完了でのlaunch claimを7件の試験で拒否する。

## Skyクラウド回答の取得と会話からの仕事引継ぎ（2026-10-02）

会話の現在の依頼文だけをcomponent memoryで仕事画面へ引き継ぎ、仕事選択・見積・承認は本人の操作とする。URL/新しいbrowser storage/D1へ依頼本文を追加保存せず、reloadで未送信の下書きは消える。保存済み回答は本人認証付きMarkdown attachment（private/no-store）で取得でき、未保存/削除済み/別本人は拒否する。本文削除は対象と不可逆性をdialogで確認し、state・usage・予算台帳は保持する。共有予算の確定額は請求書照合済みと表示しない。ローカルbuilt Siteの合成アカウントで引継ぎ/再読込/削除dialog取消/135byteのダウンロード一致を確認、Worker/D1で24項目合格。実AI/本番ownerログイン/Apple Payは未受入、追加課金なし。正本の全verifyと同一Site公開は次の検証。
証拠: [local results verification](evidence/sky-cloud-results-verification.json)。

## Skyサービスのローンチ設計

[Skyサービス設計とローンチ受入](sky-launch-design.md)を、独立Sky・OS/他アプリ接続・作者公開・有料市場の実用化設計として追加。既存のデザインと状態機械・本人認証・課金gateを維持し、設定状態と本番合格を分離する。設定状態APIは秘密や本人情報を返さず、必要サービスの利用条件を各画面へ反映する。利用者向け入口は `/sky/help`。

### クラウド文章生成の見積と使用量（2026-10-01）

ROCK／WEB04の準備として、OpenAI標準tierの文字入力・文字出力に署名料金表v2を追加した。既存v1の署名byte列と登録・失効は維持するが、v1は入力・出力だけの参考見積で実行用quoteへ昇格させない。v2は通常入力、キャッシュ読込、キャッシュ作成、出力の4単価とtext-only/defaultの範囲を署名する。入力のキャッシュ区分が実行前に不明なため、見積は3種類の入力単価の最大値を予約候補とする。単価は信頼鍵で署名した料金表から読み、公式ページの例示倍率やfixture単価を本番価格にしない。

`lib/remote-ai-text-pricing.ts`は本人・request ID・実送信と一致するtrim済み入力のhash・出力上限・承認上限・料金表digestへ5分以内のquoteを束縛する。quoteに本文を含めず、同じ入力の再確認ではhashを照合する。期限切れ、変更、別本人、別料金版は拒否する。0046 migrationと`RemoteAiTextStore`はquoteをD1へ永続化し、owner/requestの冪等性、親job単位の共有budget、原子的な予約、send claimの一回性、結果不明時のhold、使用量確定と明細再取得を実装する。`/api/llm/quotes`と`/api/llm/quotes/{id}`は見積保存・本人承認/取消・状態照会・保存成果削除を接続し、`/api/llm/text`はquote ID・approval digest・同一入力を再検証して送信する実行経路を持つ。

Zema Workbenchの選択中jobからdirect-text quoteを作成し、親jobの残予算と依頼別capを照合して、永続quote、状態readback、保存結果、itemized cost計算を表示するUIを接続した。回答保存は初期offで利用者が選ぶ。quoteは入力hashへ束縛し、画面再読込後に実行する場合は依頼文を再入力して同一hashを確認する。承認/送信は実行gateが有効な場合に限り表示する。現在`remoteAiPricingGateAccepted()`は常にfalseのため承認ボタンは無効であり、送信されない。reserved/sending時に表示できるのは予約capまでで、直接LLMの実行中provider meterは未接続。完了後の項目別額もprovider usageからの計算結果であり、Provider invoice、production billing、funded Walletの証拠ではない。ローカルのbuilt Worker/D1と合成アカウントで、仕事作成→見積保存→reload時に同じ仕事/履歴復元→認証期限切れの案内→同じ仕事へ復帰→見積取消→別jobへの切替時に履歴を混在させないことをブラウザで確認した。これは本番OAuth・実Provider・実課金の受入ではない。履歴APIは本人/parent単位で50件を取得し、未送信の期限切れ予約だけを解放する。sending/unreconciledは保持する。POSTの応答が不明な場合は自動再送せず、状態読込へ案内する。残る受入は実Provider/費用/資金gateが有効な縦断、保存成果のUI readback/delete、Sky会話composerから仕事への導線、本番配備と本人の実ログイン、invoice照合・funded Wallet統合。

応答のキャッシュ読込と作成は総入力の互いに重ならない区分として保存用metadataへ保持する。標準文章生成は`service_tier=default`を送信し、実応答tierを別に保持する。使用量計算は各区分をBigIntで加算し、通貨minor unitへの切上げを総額で一度だけ行い、項目ごとのtoken数・署名単価・正確な分子を返す。欠落した使用量を0と推定せず、別model/tier、未知のTool、検索、入力/出力上限超過、quote条件不一致はunreconciledとする。これらは予約保持と照合が必要な状態であり、支払い・請求書照合の成功を意味しない。

保存・復旧は正本ローカルでrequest-bound quoteのD1保存、本人別の原子的予約、一度だけのsend claim、送信結果不明時のhold、明細の一度限り確定と再取得を実装した。取消はD1のtriggerを含む更新件数ではなく本人の保存状態で確認し、共有budgetを一度だけ解放する。本文はquoteへ保存せず、成果本文も明示opt-in時だけ保存し、本文削除後も使用量と会計記録を保持する。未完了点はSky会話composerからの引継ぎ、保存成果のUI受入、Sitesへのmigration/実装配備、実Provider応答・invoice照合と資金接続の受入。既存A2A台帳はProvider署名receiptを要求するため、OpenAIの通常JSON応答をその署名receiptと偽って流用しない。資金接続・使用額承認の未受入も維持する。法務・特許の検索追加費用はこのtext-only料金表に含まれず、従来の停止gateを通す。実Provider credential、実測のframing上限、実応答・invoice照合はJOINT/OWNERの受入が残る。

合格条件はv1互換署名、v2単価改ざん拒否、最高単価での見積、本人/入力/予算/期限の束縛、4区分の正確な計算と未知使用量拒否、D1料金表登録から見積APIの一致、全文verify。公開v24の更新や実AI実行の証拠へは転用しない。公式仕様: [Prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching)、[Responses create](https://developers.openai.com/api/reference/cli/resources/responses/methods/create)。


## 2026-10-01 Sky文章ツールの成果再利用

ROCK／WEB04: Sky Market経由の出典整理・無料記事・応募前チェックの既存実行画面に「この端末に保存」、保存成果再表示・削除を追加。原稿は端末処理、成果は本人が選んだ同一ブラウザのlocalStorageへ全Tool合計20件、サーバーには本文を送らない。共有端末の閲覧可能性とMarkdown代替を明示。関連15試験・typecheck成功。独立作業コピーの全verifyは519 tests・265 API assertions・build等完走（既存database-status期待件数101→102の整合を含む）。実ブラウザでMarket検索→出典整理→保存→再読込→再表示、無料記事作成・保存を確認。稼働コピーは2026-10-01チャットのwork/sky-service。共有作業treeの以後の変更はこの合格へ算入しない。本番未配備。配備元7c79e43のSiteは一般公開設定で、以前のOS管理者限定要求との相違があるため公開範囲の回答待ち。アカウント別クラウド成果同期・実Provider接続の合格ではない。

# Sky／Zema／全Tool詳細設計

版: 1.2 / 2026-09-27
対象: Skyにある12件のready Tool、22件の導入候補、native開発Tool、Tool追加基盤。

この文書は、Tool名の一覧ではなく、各Toolについて「誰が何を入力し、どこで動き、何を保存し、どこから外部作用になり、何をもって完了とするか」を同じ形で説明する。カタログの機械可読正本は`lib/catalog.ts`。この文書とカタログの欠落は`npm run design:check`で検出する。

## 共通基盤の統合（2026-10-02、G04）

同じ処理への修正がToolごとにずれないよう、法務/特許の送信・HTTP失敗処理・公式HTTPS引用parserは`lib/research-ai.ts`、Jevの既存Gateway呼出しは`lib/jev-transport.ts`へ集約する。認証、外部送信の明示許可、4000/12000文字の入力上限、緊急停止、Tool固有prompt/rubricは呼出元が維持する。引用はHTTPS・userinfoなし・公式domainのみ、失敗時は各Tool既存のHTTP応答へ戻し、自動remote fallbackやAI結果による承認は加えない。

PC/FashionのMCP session・RPC・handshakeは`lib/mcp-client.ts`を使い、世代が変わった接続結果は採用しない。両adapterのorigin/token/protocol条件、個別の変更承認は保持する。Tool IDはcatalogからJob/connection一覧を導出し、IP Studioは一回だけ登録する。Fashion件数はregistryから検査する。

Workとココナラのowner別JSON/revision保存は`lib/owner-revision-json-store.ts`を共有し、本人ownerと期待revisionをSQL更新条件に維持する。Stripe低水準通信/署名は`shared/stripe.mjs`を共通sourceとし、SkyのConnect配分・Mini在庫・Fashion請求書は各adapterに残す。ネットワーク結果不明を成功にせず、既存の再送keyと照合を維持する。

Sky→Zemaは公開Previewにも同梱する`handoff.js`の共通契約を使う。v1の`local`表記/省略は`local-model`へ正規化し、remoteを拒否する。WebはsessionStorageのUUID、10分TTL、Tool一致、一回消費を追加適用する。入力不正・期限切れは保存から除去、別Toolの依頼は保持、再作成で復旧する。本文をtelemetryへ送らない。既存key/versionは維持し、session作成は`ready`で実行承認ではない。

合格条件は各adapterの既存回帰と共通helperの異常系、公開Preview/本体の互換試験、配布物一致、`npm run verify`の成功。実Provider/実機/本番受入は別gate。未mergeの新機能・native実行器の意味の違いは[統合記録](git-consolidation.md#2026-10-02-共通実装の統合g04)で区別する。残る統合の決定者はROCK、商品条件/外部作用は既存のOWNER/JOINT受入による。

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

`/sky/marketplace`はSky内のAI・自動化Tool発見面。名称・用途・作者の検索、カテゴリ、SkyのTool／導入候補／審査済み外部Packageの状態別表示を持つ。ホームとMarketは共通カードを使い、アイコンまたは「機能・利用条件」から説明・現在の接続状態・環境・費用をその場で開く。ホームの主ボタンは実際の対応状況に応じて起動・接続・条件確認へ進み、Marketの主ボタンは`/sky/tools/<id>`へ進む。個別画面のアイコンも同じ概要を開き、手順・license・補足は「使い方・ライセンス」から展開する。外部Packageは公開Registryの有効な`verified`だけを表示し、作者・版・権限・料金・実行先を見せる。

アイコンの開閉は画面内の一時状態で保存や外部作用はなく、閉じる・再度開く操作で復旧できる。掲載、`ready`、`verified`は利用者の接続完了や実処理成功ではない。候補22件の本体実行や公開remote MCPの自動導入は有効にしない。有料Packageの明示購入だけは§1.4の条件付き決済入口へ分離する。Registry取得失敗時はSky catalogを残して外部件数を未確認と示す。合格条件はアイコンがキーボードから開閉可能で、カードの主操作と混同せず、候補の未接続表示が残ること。

### 1.1 共通カードと狭い画面のレイアウト

2026-09-27の表示修正では、Skyホームの45px列に56pxアイコンを配置していたため、片側約5.5pxが本文へ重なる問題を対象とする。旧グローバルCSSによるmain・footerへの干渉も同時に除く。担当はProduct / UXのROCK、既存WEB04。

- 実装: `components/sky-tool-card.tsx`と同CSSで、ホームとMarketのアイコン、名称、状態、説明、主操作を共通化する。架空の作者handleと重複する役割名は表示しない。`lib/sky-tool-ui.ts`の実状態を入力にし、カード表示から新しい接続状態を推測しない。
- 画面境界: `components/workspace-shell.tsx`の`tone="sky"`と`components/sky-surface.module.css`でSkyの暗色面を限定し、ホーム、Market、Tool詳細、ココナラを揃える。ホーム固有の配置は`components/sky-workspace.module.css`で管理する。アイコン列は実サイズを確保し、名称列は縮小・折返し可能にする。
- 利用体験: 検索を常時表示する。Marketは短い見出しと検索を先に置き、利用環境の説明は展開する。Tool詳細は実行欄を先に表示し、重複する情報sidebarと大きな導入説明を外す。ココナラは余白とmain landmarkの二重化を解消し、既存の報酬・取引条件は展開欄に保持する。
- 表示情報: `components/sky-tool-overview.tsx`と同CSSで概要を共有する。全Tool共通の抽象的な注意書きは重ねず、未接続・認証・対象外端末など、そのToolに必要な利用条件を表示する。実行器、入力保存、認証、案件管理、送金の挙動は変更しない。
- 受入（2026-09-27）: ローカル実ブラウザのホームとMarketは320／390／440／768／1280pxで横はみ出し0、アイコンと本文の間隔12／14px。Jev Routerとココナラは320／390／768／1280pxで横はみ出し0、main landmark各1個。ホームの全Tool検索でJev Routerへ到達し、ホームとMarketから同じ概要を開閉、Escとfocus復帰を確認した。ココナラのBase UI Dialogは320／390pxでfocus trap・Esc・元のボタンへの復帰を確認し、保存失敗は入力画面内に表示する。出典整理のサンプル実行と結果表示も確認した。
- 検証範囲: 関連17試験、typecheck、`lint:product`、`sky:check`、buildは合格。2026-09-30に製品ベースとbaseline validatorのアクセント期待値を現行workspace CSSのice-blue `#bedce6`へ合わせ、R5文書・DB status testを含む該当テストを通した。全体verifyはこの更新後に未実施。無限定lintは未変更vendor・生成物のエラーを含みうる。本番配備、Tool本体接続、決済は未実施。

### 1.2 全入口・開閉画面の監査と実行導線

2026-09-27の追加監査は、一覧の外観だけでなく、ホームとMarketから34 Tool詳細、概要、サービス接続、PC/MCP接続、掲載フォームまでを対象にする。主担当はProduct / UXのROCK、既存WEB04。初期画面が表示できることと、実行器・外部Providerの成功は別に受け入れる。

- 目的と操作: ready Toolは不要な登録確認を挟まず、`launchPath`があればその専用アプリ、なければTool詳細の入力画面を開く。自然文の依頼は選択Toolと依頼文をZemaへ引き継ぐ。ココナラも依頼文ありならZemaへ保持し、依頼文なしなら案件台帳を開く。アイコンの機能概要も同じ主操作にする。PC実行が必須のToolは既存PC接続条件を保持する。
- 登録と状態: 候補のSky登録は利用許可の記録であり、本体やProviderの接続を意味しない。登録失敗は概要内に表示し、成功していない処理を完了扱いにしない。提供元がURLでない場合はリンク化しない。ホームとMarketで同じ端末適合判定を使い、Fashionのブラウザ簡易版はPC専用として除外しない。Marketと詳細は`lib/use-sky-tool-context.ts`でホームと同じPC・Fashion・登録記録を参照する。ブラウザから確認できないCLI導入・秘密設定・外部契約は推測しない。
- 表示境界: Fashionの入力、簡易プラン結果、MCP詳細は`components/fashion-brand-ops-runner.module.css`で自己完結させ、Tool詳細・Zemaの親画面に依存しない余白、暗色面、可読性、折返しを保つ。ホーム概要では共通の主操作から専用入力画面へ進む。サービス接続は長い設定を固定見出し下でスクロールでき、MCPタブは矢印キーで選択内容も更新する。掲載フォームは入力欄へのfocus、成功後reset、ヘルプアイコンを修正し、単独画面のmain landmarkを一つにする。
- 保存・権限・失敗: 表示と画面遷移の変更に限り、既存の本人認証、ジョブ保存、scope、外部送信・課金の承認条件は維持する。利用者は画面を閉じて再度開ける。エラーは関連する入力・操作の近くで示し、結果未確認の外部作用は成功表示しない。
- 画面受入: 390pxで全34 Tool詳細の見出し、横はみ出し0、エラーoverlayなしを確認。修正後のホーム全34アイコンで概要の開閉、画面内表示、横はみ出し0、初期scrollTop 0、Escapeで戻ることを確認した。サービス接続・MCP・埋込掲載フォームは320／390／768／1280pxで画面内表示と内部横はみ出し0。長いrouting設定の保存位置までのスクロール、MCP右矢印タブ切替、空掲載フォームで名前欄focusを確認。単独`/sky/register`は390pxでmain landmark 1個、横はみ出し0。全Toolの外部接続・個別実行合格とは扱わない。
- 代表実行: ホームのFashionアイコン→主操作→専用画面でローカル簡易プランを生成。出典整理の主操作→専用画面でサンプル実行と結果成功を確認。法務詳細の暗色表示も目視した。Provider資格情報入力、掲載申請送信、実MCP接続、料金操作、本番配備は未実施。
- 検査と残る範囲: 主要Sky修正後の関連26試験、`sky:check`、typecheck、`lint:product`、build、差分空白検査、設計チェック、進捗同期は合格。単独掲載画面は1280pxでも目視し、直近ブラウザエラー照会8件の範囲でアプリエラーなし。全体verifyは既存baselineのvisual system期待値不一致で停止し、掲載フォームresetのD1試験も無応答で未合格。API key発行も未実施。
- 追加入口: `/sky/network`のMCP画面と`/sky/publish`の暗色・横はみ出し0を確認。Studioのコピー失敗表示とAPI key発行401時のサインイン入口を修正し、公開SDKのコピー成功を実画面で確認した。追加Studio 2試験・対象lint・typecheck・差分検査は合格。key発行と401の実環境再現は未実施。

### 1.3 全Toolの実行器棚卸しと管理runtime（進行中）

利用者の要求範囲は、Sky／Zema／OSの全Toolを実用にし、個別サーバー管理を利用者へ要求せず、ローカルLLMを優先すること。次の分類は2026-09-27のsourceにある最小機能の棚卸しであり、全件のruntime受入、外部接続成功、`ready`の再認定ではない。

| 分類 | 件数 | 対象と実際の処理 |
| --- | ---: | --- |
| ブラウザ決定処理 | 6 | ココナラ案件チェック、記事無料版、出典整理、法務ローカルガイド、特許ドラフト、Fashion簡易プラン |
| Web API／DB主体 | 3 | CSV整形、市場PAPER検証、メルカリ出品支援 |
| 別PCサービス必須 | 2 | 納品照合（38479）、サブスク顧問（8765） |
| 外部AI必須 | 1 | Jev評価。料金見積・支出上限・usage照合の受入まで外部実行を停止 |
| 候補・固定下書き | 11 | 旧Mr.11件。入力を差し込む下書きであり、モデル推論ではない |
| 候補・接続計画 | 10 | faster-whisper、Transformers.js、Playwright、Jev Ultrafast／Trader／Review／Router／Browser、TypeSafe Computer Use、Mobile Jev。本体adapter未接続 |
| 候補・別アプリ入口 | 1 | IP Studio。18767のアプリを開く経路であり、Skyからの本体起動・実行成功を保証しない |

合計34件。複数機能を持つToolは最小経路で一度だけ数えた。ココナラ案件台帳は案件チェックとは別にDBを要し、Fashionの実運用は簡易プランとは別のMCP、法務・特許のオンライン調査は別の外部AI経路である。根拠は`lib/catalog.ts`、各runner、`components/sky-candidate-runner.tsx`の`outputFor`。ローカルLLMを起動しても、候補22件の本体adapter、ブラウザ操作権限、予定や通知Providerは自動で実装・接続されない。

- 共通blocker: `lib/operations-client.ts`は記事・出典・ココナラチェックと候補下書きの計算前にジョブの作成・開始を保存する。ローカル処理でも本人認証とDB migrationが必要。CSVは`lib/csv-job-store.ts`のDB＋BUCKETを要する。モデルAPIも`app/api/llm/text/route.ts`で本人確認とDBの利用上限記録を通る。これらを無効にして「動いた」とは扱わない。
- 最初の実用milestone: ローカルViteから同梱Connector／Fashionの起動・health・停止を共通runtimeで管理する実装を確認した。再利用するConnectorはstdioのMr.／FashionとSDK descriptorを扱う。管理対象の正確なローカルoriginを許可し、3107の接続拒否を解消したが、任意originや任意shellは許可しない。実装・試験根拠は`scripts/sky-local-runtime.mjs`、`lib/sky-local-runtime.ts`、`tests/sky-local-runtime.test.mjs`。Sky接続操作から手動サーバー起動なしで基本4機能を検出した。
- Fashion実行と保存: 実ブラウザの「プランを作って保存」から自動起動→本物のProducer→合成TシャツのDB書込を行い、「保存した下書きを再確認」の`instagram.calendar.list`で一致した（run_id `cc7dc198-718a-47d6-bec6-47594978f301`）。簡易テンプレート生成とは別の保存経路である。Provider4件はmock未接続で、LLM推論や実投稿は行っていない。ページ再読込後の結果復元UIは未実装。本人別データ、Passport、scope、一回承認、停止、receiptの既存条件は維持する。
- 納品Runner: `components/delivery-runner.tsx`の、Zemaに存在しない「右上PC接続」への案内と未接続時disabledを修正。サンプルの一操作から共通runtimeで自動接続し、`verify_delivery`の実照合`PASS`と会話内結果表示を確認した。合成サンプルの照合であり、品質承認・実案件完了・外部への納品ではない。
- 検証結果: runtime／device／MCP／Fashion関連35件が合格。origin拒否、再起動、停止、readback、Producerの冪等性に加え、isolated Vite起動→両サービス自動起動→`await server.close()`後の両port停止を確認した。isolated Worker／D1のAPI回帰172項目、最終build、typecheck、対象lint、package一致、差分検査も合格。全体`npm test`は389件中378合格・11失敗で、既存visual baseline条件、README日本語文言期待、migration-unionの期待32件と現状33件の差が残る。全体`verify`も既存visual baselineで停止し、全体合格には数えない。今回の合格のために既存基準を変更していない。
- 推論と配備境界: ローカル推論runtime／モデルは未導入で、新規導入は本人回答待ち。LLM APIのloopbackはWebサーバー自身を指すため、ローカルWebと公開Web→本人PC relayを同一視しない。Ledger、IP Studio、候補22件の個別adapter、外部Provider、native常駐搭載には個別の起動・保存・復旧受入が残る。外部AIへの無断fallbackやモデルの権限昇格は行わない。
- 担当・受入: ROCKのSKY14継続、SDK掲載はSKY15と連携。既存task状態を変更せず、最初の実用milestoneの検証結果として記録する。全体作業は進行中であり、全34 Tool実行、本番配備、native OS、外部Provider、モデル推論の完了とは記録しない。

### 1.4 Sky Marketの購入・販売・返金

- 目的・責任: BIL02のROCK実装として、審査済みAI・自動化Tool・LLM Packageの購入と10%手数料配分を扱う。StripeはHosted Checkout・受取先確認と決済処理、提供者は商品条件・履行・有料MCP側のアクセス制御、Skyは所有者確認・金額固定・購入記録と返金状態の照合を担う。決済記録はTool成功や銀行着金を証明しない。
- 利用体験: Marketカードにserver側の有効価格がある場合だけ購入操作を出す。販売条件・返金条件を見てStripe画面へ進み、`/sky/purchases`で戻り通知を照合する。作者は`/sky/sell`の「受取先登録→価格設定」。既存候補や無料機能は購入せず使う。設定未完了・未ログイン・テスト決済は通常状態と明確に分ける。
- 入出力: 作者は審査済み`external_contract` Package、円価格、HTTPS販売条件、返金条件、公開状態を送る。購入者はPackage keyと見た価格revisionだけを送る。買い切りJPYのみで、無料・月額・従量を自動変換しない。金額・10%・販売者・送金先はserverが決定し、購入確認後だけ接続先を返す。
- 状態・保存: D1 `sky_commerce_sellers/offers/orders/events`に環境別の受取先ID、価格版、固定注文条件、Provider ID、返金済み額、状態遷移を保存する。カード・銀行情報は保存しない。`pending→paid`で購入権を得るが、審査期限切れ・失効・manifest変更・部分/全額返金・異議申立てでは利用権を返さない。同一購入者/商品/環境の有効注文は一件にする。
- 失敗・復旧: 通知の署名だけでなくStripeから現在のCheckout/PaymentIntent/Chargeを再取得し、金額・通貨・mode・metadata・10%・送金先を照合する。遅れたpaid通知で返金状態を巻き戻さない。支払い画面の中止は注文失敗と決めず履歴から再確認できる。API応答を失った処理は同一idempotency keyを再利用し、安全な20時間を過ぎた不明処理は新規決済を作らず運営照合へ止める。
- 承認: 価格変更時は購入を止め、新価格を表示して再操作を求める。支払いの確定はStripe画面。返金は販売者本人が注文・残額を確認するdialogで明示する。LLM・閲覧・戻りURLだけで金銭処理や購入完了を成立させない。外部MCPの接続許可と購入は別である。
- 実装: `components/sky-commerce.tsx`と同CSS、`components/sky-marketplace.tsx`、`app/api/sky/commerce/[action]/route.ts`、`lib/sky-commerce.ts`、`lib/sky-commerce-store.ts`、`lib/sky-stripe.ts`。共有手数料は`lib/sky-marketplace-policy.ts`。migrationは`drizzle/0018_sky_commerce.sql`。
- 合格条件・未完了の決め方: SQLite/API・Provider代替fixtureで改ざん/重複/失効/部分返金/所有者分離を検証する。実Stripe sandboxで購入→通知→権利→返金、公開Webhook到達、認証gateway、提供者認可、実売上配分と銀行払出しは別の受入。現在はStripe資格情報未設定、Provider sandbox・本番配備は未実施で、BIL02を完了扱いにしない。設定手順と運営確認は[決済設計](sky-billing.md)を正本にする。

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
| `rockstar-ip-studio`        | IP Studio — SNS・ゲーム・音声      | candidate | PC / Provider          | 生成・配信・ゲーム提出を別capability化   |
| `coconala`                  | ココナラ                        | ready     | Web                    | 応募前チェック＋owner別の案件記録         |
| `mr-free-article`           | 記事の無料版メーカー              | ready     | Web                    | local-pure                                |
| `mr-citations`              | 出典整理ツール                    | ready     | Web / PC               | local-pure                                |
| `mr-delivery`               | 納品記録の照合                    | ready     | PC                     | local-pure                                |
| `rockstar-ledger`           | サブスク顧問                      | ready     | PC MCP                 | local read-only                           |
| `rockstar-legal-intake`     | 法務受付                          | ready     | Web / 任意AI           | local整理＋料金gate受入後にremote-read     |
| `rockstar-patent-assistant` | 特許出願アシスタント              | ready     | Web / 任意AI           | local draft＋料金gate受入後にremote-read   |
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

公開接続状態の`csvPayments`はCSV専用Webhook、同一originのStripe設定、DB/R2を確認し、一般Marketplaceの`payments`とは別に返す。CSV専用secretをMarketplaceへ転用しない。利用案内は「購入・販売」と「CSVの50円試験」を分けて表示する。`live`は設定確認であり、新規実決済や全商品の販売受入を証明しない。

### 目的と一周

利用者がCSV一件と、列名、列順、空白、重複、並び、文字codeの指示を送る。受付がsizeと変換可能性を検査し、決定的に変換する。別検査が入力、出力、変更報告を照合し、結果CSV、変更報告、検査JSONを一組で渡す。

### 詳細契約

- 入力: CSV一件、最大10 MB／50,000行／100列、変換指示。
- 出力: 変換CSV、変更report、独立inspection JSON。
- 保存: 暗号化private storage。受付から7日で取得拒否、または本人削除。
- 受付衝突: 同owner・同入力/指示の再送は同じ受付を返す。別ownerまたは異なる入力は409。R2入力keyは受付IDだけで共有せず、挿入試行ごとのUUIDを保存rowへ結ぶ。同時受付の敗者は自分の未採用objectだけを削除し、INSERT応答が不明なら保存rowを照合する。照合不能時は先に入力を削除しない。旧固定keyの受付も保存rowのinput_keyで読み戻す。
- 合格条件: `scripts/check-csv-storage.mjs`で既存ID攻撃・同時受付・private成果4種・別owner拒否・再起動・本人削除・期限切れを実Worker/D1/R2で確認する。合成ownerを本番ログイン受入へ換算しない。
- 再試行の期限: initial/quality_failed retryともprocessing claim前に保管期限を確認する。期限切れならowner rowとR2 objectsを削除し410を返し、attemptを増やさず処理しない。期限内の再試行成功、匿名/別ownerの拒否、期限切れの不実行と物理削除を同じAPI回帰で確認する。
- 禁止: 値の推測、文字列の勝手な数値化、複数file結合、外部市場代理操作。
- effect: 変換はTool内。buyer共有、販売、入金、返金は別adapter／承認。
- 完了: 3成果のhashと検査合格。手入力入金をWallet収益にしない。
- 失敗: 破損、上限超過、曖昧指示、非決定変換は`needs_review`または拒否。

正本: [CSV business v1](csv-business-v1.ja.md)、`lib/csv-transform.ts`、`lib/csv-job-store.ts`、`data/csv-business-tasks.json`。

50円試験はROCKの受付・Stripeの決済・本人の最終支払いを分ける。CheckoutはJPY 50を送り、Adaptive Pricingをsession単位で無効化して換算表示を出さない。決済復帰URLのjob IDは本人の保存済み受付と一致した場合だけ対象を表示・focusする。`stripe_verified`かつ`completed`で成果取得、`canceled=1`かつ`unpaid`で未払い案内、それ以外は照合待ちを表示する。URLだけで入金・成功を認定しない。ページ更新は同じ受付を復元し、再課金・再実行を行わない。受入は実機で金額・店舗名・キャンセル／成功の復帰・成果物hashを照合し、通知重複とowner分離はAPI fixtureと本番再送で別検証する。Apple Payは対応環境で本人が確認し、未試験を合格にしない。

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

公開Skyの専用画面では、スマートフォンと端末判定前／判定不能時にPC内アプリへのリンクを出さず、PCの起動とスマートフォン連携未実装を案内する。PCでは起動確認が未取得であることを表示して既存loopback入口を維持する。ライセンスのloopbackリンクも同じ条件で非表示にする。本人のPC／スマートフォンのloopbackをクラウド実行先と見なさず、外部生成・投稿・ゲーム提出には接続と個別承認が必要。受入はPixelでPC条件が表示され、専用画面ボタンがないこと、PCで起動条件と入口が保たれること。

2026-09-30追加：人・端末・サービスへの適合とGTAを含むadapter要件を[Sky MCP設計](sky-mcp-architecture.md#2026-09-30-人端末サービスへの適合とgta)へ追記。個人profile、端末能力、接続先capabilityを分離し、GTAの版・起動・入力・ゲーム内AI・制作・経済を個別に受け入れる。今回の追記は要件で、GTA adapterの実装・実ゲーム受入ではない。

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

### IPキャラクターの音声会話・電話連携（2026-10-04）

利用者の「IPのやつに追加」により、RQ48のIP StudioへLiveKit Agentsを接続候補として追加した。制作した同じIPキャラクターと音声で話し、必要に応じて電話で応対することを目指す。主担当はSky / MCPのROCK、既存SKY07／SKY14に接続する。今回の実装は設定の保存・表示・依頼振分けであり、別アプリIP Studioの実行器、Agent配備、音声送受信、電話発着信は未実装・未受入。

- 利用体験: SkyのIP Studio詳細→「音声・電話の接続設定」→「LiveKit — IP音声・電話」で環境、サーバーURL、Agent名を保存。ルーティングの「IPの音声会話」「IPの電話連携」は独立した任意選択で、初期値は未選択。SIP参照IDは電話利用時のみ必要。Zemaでも同じ候補を選べる。
- 入出力と保存: owner別の既存`sky_provider_connections`へ環境、URL、Agent名、任意の発信用Trunk ID／着信用Dispatch Rule IDを保存。秘密情報、宛先番号、音声、会話本文は含めない。設定APIは未知field、資格情報やquery/hash/path入りURL、外部の平文WebSocketを拒否し、自己hostのloopback検証だけ`ws://`を許す。
- 状態: `setup_required`は下書き、既存DBの`ready`は画面上「設定保存済み」。設定保存を実接続へ昇格させず、catalogは`candidate`を維持する。番号取得・回線契約・発信を実行するAPIは追加しない。
- 後続runtime契約: IP／character IDと版、声の権利参照、言語、モデル、送信先、予算・時間上限をsessionへ固定する。`voice.session`、`telephony.inbound`、`telephony.outbound`を別capabilityとし、UIの`realtime_voice`／`telephony`は候補選択用の分類とする。本人・room限定の短命tokenをserverで発行し、AgentとMCPは既存Brokerの許可範囲内で実行する。発話や電話接続だけを外部Tool実行の承認にしない。
- 権限: マイク、カメラ、外部音声送信、録音、文字起こし保存を分けて同意し、録音・会話保存は既定OFF。発信は宛先、対象IP、目的、時間・費用上限を固定した一回承認、着信は承認済み番号・IP・応対条件に限定する。投稿やゲーム提出と承認を流用しない。
- 失敗・停止・復旧: 保存失敗は理由を表示して再編集する。後続runtimeは切断・失効・時間超過で送信を停止し、結果不明の発信を自動再送せずProvider session／call IDを照会する。再起動後は通話を自動再開せず、別Providerへ無断fallbackしない。
- 完了条件: 今回は設定のowner分離、任意電話設定、秘密情報拒否、旧routing互換、Zema振分けを検証。実用受入は本体adapter、声・IPの権利、LiveKit環境、モデル、番号・回線と費用の確定後、日本語会話、割込み、停止、取消、再接続、発着信と費用receiptを別途検証する。
- 外部依存と未決: LiveKit・Agent・音声モデル・電話回線はEXTERNAL、本体との縦断接続はJOINT。OWNERが利用先と契約・費用上限を決める。Manus Cueの投稿はクラウドPC／電話番号という体験の参考で、公式API・利用条件が未確認のため実行adapterや接続済みProviderには登録しない。

実装: `lib/sky-connections.ts`、`lib/operations.ts`、`components/sky-connection-center.tsx`、`components/sky-chat-workspace.tsx`、`lib/sky-routing.ts`。検証: `tests/operations.test.mjs`、`tests/sky-routing.test.mjs`。公式資料: [LiveKit Agents](https://docs.livekit.io/agents/)、[電話連携](https://docs.livekit.io/telephony/)、[OSS](https://github.com/livekit/agents)。

## 9. ココナラ

Skyで`coconala`を選ぶと`/sky/tools/coconala`へ直接進む。同じ画面の「案件管理」と「応募前チェック」で下記2機能を切り替えられる。独立した「受託チーム」アプリや別のSky Toolは作らない。旧`/coconala-team`はこのSky画面へ転送する。

### 応募前チェック

- 目的: 依頼文と提案文から、単発・非同期案件として条件が合うかを送信前に確認する。
- 入力: 依頼文、提案文、契約形態、発注率等の本人確認情報。
- 出力: eligibility、理由、要確認事項。
- 実行・保存: browser local処理。本文を永続化・外部送信しない。
- 禁止: 自動応募、返信、受注判断、入金確認。
- 完了: 判定理由を表示し、本人が元pageの条件と規約を確認する。
- 限界: 規約適合、受注、報酬を保証しない。

正本: `lib/mr-tools.ts`、`toolkits/mr/rock_star_tools.py`、固定Mr.原本hash。

### 案件管理

- 目的: 代表者が顧客の受注・入金と担当者への発注・支払を、案件ごとに分けて管理する。複数担当者へ割り振る場合も、担当者ごとに個別案件と事前合意を作る。
- 入力: 顧客の案件参照、委託範囲、納期、検査、修正、権利、受注額、販売手数料の見込率、担当者の固定報酬と支払期日。規約確認、顧客へのチーム制作説明、担当者への条件明示の参照記録を必須とする。
- 状態: `draft → assigned → delivered → accepted`。担当開始後の報酬条件は黙って変更せず、新しい合意を別案件として記録する。入金、返金、担当者支払は状態と独立した記録であり、顧客入金を担当者への支払条件にしない。
- 保存: 認証されたownerごとにD1の`coconala_team_cases`へ保存。操作IDとrevisionの照合で重複・競合更新を防ぐ。画面は`/sky/tools/coconala`、APIは`/api/coconala-team`。
- 計算: 通常サービス22%を編集可能な見込率として初期表示する。3%は手数料後の見込手取りから逆算する参考ボタンのみ。税、追加費用、返金・修正リスクを含まず、見込差額を利益や実売上としない。
- 外部作用: ココナラの契約・メッセージ・入金照合、銀行送金、担当者への発注書送付は行わない。金額と参照番号は本人の手入力で、Provider確認済みの収益やWallet残高へ昇格しない。
- 失敗・受入: 未認証、他owner案件、古いrevision、過払記録、入力上限違反を拒否する。受入は下書き、事前合意、進行、個別入出金、owner分離と画面を確認する。実規約上の再委託可否、実際の入金・送金、税務・法務判断は別gate。

Pixelで保存済み成果を開き直したときの出力textareaは、背景と本文色をSkyの暗色面へ明示して可読性を保つ。復元した出力のスクリーンショットを合格証拠とする。

Pixelで結果の保存ボタンが縦に細く伸びる問題を確認したため、760px以下のチェック結果は見出しと操作列を縦配置し、ボタン列は折り返す。

案件保存の401・サインイン転送は本人認証切れとして扱い、開いている入力画面を保持する。ダイアログ内にも別タブのサインインと接続再確認を表示する。再確認はGETだけで、下書きの再送や契約・送金を行わない。チェック本文のserver永続保存は追加せず、案件管理の17項目と変更履歴は本人別D1へ保存する。10秒の通信期限と不正なJSON応答の検出は共通requestへ揃える。合格条件は匿名画面で保存不可・入力保持・Skyへの復帰先を確認し、認証済み端末でチェックと保存・再読込を別々に検証する。


#### 発注前の下書き削除

不要な案件内容を本人が消せるよう、発注前の詳細画面に「下書きを削除」を置く。既存のSky配色・レイアウト・同一workspaceを保ち、対象名と取り消せないことを確認した後だけDELETEを送る。入力はcaseIdと最後に確認したrevision、出力はdeletedCaseId。本人セッションと同一originを要求し、D1のid・user_id・revision・draftを一つのDELETE条件で照合する。成功時は17項目の内容と変更履歴を含むその行を削除し、一覧から外す。担当開始済みの記録は消さない。

未認証は確認画面を保持して別タブ認証へ復帰する。別owner/不存在は404、古いrevisionや状態変更は409、不正入力は400。通信結果不明の場合は確認画面を閉じてGETで一覧を確認し、再読込からDELETEを自動送信しない。受入はowner分離・競合・状態変更のAPI/DB試験、実機で取消→記録保持→明示削除→再読込→D1行不在を照合する。削除はSky内だけで、ココナラの契約・連絡・送金を変更しない。進行済み案件の保持期間・削除方針と外部実取引の受入は未完了として分ける。

実装正本: `lib/coconala-team.ts`、`lib/coconala-team-store.ts`、`app/api/coconala-team/route.ts`、`components/coconala-team-workspace.tsx`、`tests/coconala-team.test.mjs`。参考: [ココナラ販売ガイド](https://coconala.com/pages/guide_sell)、[利用規約](https://coconala.com/pages/terms_user)、[公取委のフリーランス法案内](https://www.jftc.go.jp/freelancelaw_2025/)。

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

法務・特許のオンライン処理は共通Responses transportを利用する。資格情報はserverだけで使用し、20秒のabort、redirect拒否、`store:false`、失敗時の自動再送なしを維持する。未完了・不正JSON・公式citationなしを成功にしない。成功応答には実model・経過時間・検証済みtoken数（欠落/不整合ならnull）・観測したweb検索call数を返す。これらは応答metadataであり、D1利用台帳・請求額・provider invoice照合の完了ではない。入力本文を追加保存しない。trusted料金表、検索料金、本人の予算予約、精算が同じ経路へ接続するまで料金gateは閉じ、資格情報だけで実行を開始しない。本人認証とRockstarサービス利用権checkを保持する。公開版では既存のpreview設定を維持し、利用権enforcementの有効化とclaim用D1 migration受入は別作業である。Fixture合格と実provider実行を区別する。公式schema: https://developers.openai.com/api/reference/cli/resources/responses/methods/create 。

- 目的: 状況を整理し、政府・裁判所等の公式情報と無料窓口を案内し、必要なら専門家への引継ぎを準備する。
- 入力: 分野、地域、危険、逮捕、公的書類、期限、状況、希望。
- 出力: 緊急案内、確認事項、公式source、一般情報、引継ぎsummary。
- 保存: 相談本文をSky serverに保存しない。AI利用時は明示同意した内容だけ送る。
- 禁止: 法的助言の断定、期限確定、勝敗予測、自動連絡、受任保証。
- 緊急: 差し迫る危険は通常Tool flowより緊急serviceを優先表示する。
- 完了: allowlistされた公式citationを持ち、本人が専門家連絡内容を確認する。
- 失敗: jurisdiction不明、公式sourceなし、緊急性不明では追加確認または安全案内へ止める。

- 外部実行: 現在の`/api/legal-guidance`はSky service scopeを確認後、料金見積・上限・利用明細が未受入ならProvider送信前に503で停止する。ローカルガイドは利用できる。
正本: [Sky legal intake](sky-legal-intake-20260912.md)、`lib/legal-intake.ts`、`lib/legal-ai.ts`。

## 15.5 Jev品質評価

`jev-evaluation` は本来、本人が送信対象・送信先・料金・保持条件を確認した後に、最小化した入力を評価するremote evaluatorとして設計する。現在はprovider price quote、owner cap、usage receipt settlementがAPI経路へ未接続のため、server routeをfail-closedにし外部送信を拒否する。料金gate、Sky scope entitlement、明示同意をserver側で受け入れた後に限り再有効化する。評価Receiptはreview signalであり、権限付与、Tool成功、仕事完了、専門家判断の代替にはしない。

## 15. 特許出願アシスタント

- 目的: 発明情報、先行技術候補、差分、明細書、請求項、要約のdraftを準備する。
- 入力: 発明者／出願人候補、公開状況、課題、仕組み、構成、効果、既存技術差。
- 出力: disclosure、official DB search plan、citation候補、claim chart、filing packet draft。
- 保存: 発明本文をSky serverへ保存しない。AI調査は明示同意後だけ送信する。
- 外部実行: 現在の`/api/patent-research`はSky service scopeを確認後、料金見積・上限・利用明細が未受入ならProvider送信前に503で停止する。端末内ドラフトは利用できる。
- source: 公式特許DB等のallowlist。引用なしのAI断定を受け入れない。
- 禁止: 特許性、登録、侵害回避、法的発明者、権利帰属、期限の確定。自動署名、支払、提出。
- 完了: public disclosure警告、source付き比較、human／professional review gateを持つ。
- Material連携: avocadoMini eventの人、AI、simulation、文献、実測を分けたpacketを受ける。bridgeは未実装。

正本: [Patent assistant](sky-patent-assistant-20260912.md)、`lib/patent-assistant.ts`、`lib/patent-ai.ts`。

## 16. 導入候補22件

### Zemaでの個別入口（2026-09-25）

ZemaのBot一覧と担当選択には22候補を個別Tool IDで表示する。各候補はSky/Zema共通の固有アイコンを持ち、検索、選択、状態確認ができる。選択だけでSky接続済み、Provider接続済み、`ready`にはならない。Zemaで書いた依頼は、同じTool IDの確認画面へ引き継ぐ。ローカル下書きと接続計画はSky共通ジョブとして記録し、外部作用は起こさない。

| 区分 | 現在の入力・出力 | 完了表示の意味 | 残る受入 |
| --- | --- | --- | --- |
| 旧Mr.由来11件 | 本人が入力した文から、Tool別のローカル下書き・整理結果を作る | 下書きの作成と表示のみ | 元Service Cell、Coconala、Calendar、Telegram、Product Hunt等の本体接続・権限・成果照合 |
| 外部研究Tool10件 | 本人の目的から、Tool別の実行環境・最初の安全な試験・停止条件を整理する | 接続計画の作成と表示のみ | upstream導入、資格情報、実runtime、権限、fixture、失敗・停止試験 |
| IP Studio 1件 | 専用ローカルアプリへの入口 | 起動・実行成功を意味しない | PC serviceの稼働、素材・生成・投稿の個別受入 |

入力本文と出力はZemaの同一タブ会話に一時復元され、共通ジョブには状態と実行量を記録する。外部Toolの音声、画面、Git差分、個人アカウント、秘密情報はこの確認処理では取得しない。失敗時は結果を成功扱いせず、入力と接続状態を見直して再実行する。将来の本体接続は各ToolのPassport、effect、本人承認、独立した結果検証を通す。合格条件は全22件が個別アイコンと担当として見え、依頼から正しい個別画面へ進めること、旧Mr.の下書きと外部Toolの接続計画を混同しないこと。外部サービスの実行合格は別証拠を要する。

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

現行Sky詳細は候補の状態・対応PC環境・料金・公式導入先を示すだけで、従来の「接続条件の下書き」実行欄をJev Routerでは表示しない。機能・料金・提供元は押せるアイコン内の情報パネルにまとめ、本文には未接続とPC CLI導入条件を残す。アイコンを押しても導入・認証・外部送信は始まらない。対象は本人PCのCodex CLIまたはClaude Code、Node.js 20.12以上、TypeSafeの認証済み環境であり、Sky Web／native OS／スマホからのワンクリック接続は未実装。入力となる依頼文を外部へ送る場合は本人の同意と費用上限が必要で、ブラウザへAPIキーを入力させない。対応環境の表示と実際のCLI導入・認証・実行成功は別状態として扱う。将来の接続完了条件は、PC側の限定adapterによる存在・版・認証状態の検証、routing-only試験、既存CLI権限の維持、失敗時のfallback、費用と選択理由のreceiptを本人が確認できること。未達なら接続済みと表示しない。

### Jev Browser

既存browser toolの観測・操作・検証loopでJevが要素を選ぶ候補。installerを自動実行せず、専用profileとowned siteのread-only試験から始め、各stepをBrowser Brokerで検査する。

### Mobile Jev

Mobilerun経由のAndroid操作候補。Rock所有のwipe可能な試験端末と許可appだけを使い、個人端末、SIM、連絡先、写真、password、決済、予約確定、権限変更を拒否する。TypeSafeの意味判断を端末から使う実装候補として、`android/jev-provider`にpublic-only typed request、固定公式endpoint、bounded response、cost／timeout gate、advisory-only resultのsourceを追加した。ただしpackageは専用UID／network domainでmanifest-disabled、product既定除外であり、safe key provisioning、Mobile操作、Broker／Tool統合、実機受入は未実施である。既存の`android/jev-preview` loopback debug clientはMobile JevやOS componentの受入証拠に数えない。

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

## Sky単独アプリの配布入口（2026-10-01）

SkyはOS内と単独Webアプリで同じマーケットプレイスを共有する。OS導入を利用前提にせず、単独アプリはSky専用manifestから `/sky/marketplace` を開く。詳細な起動範囲、本人認証、未接続Tool、オンライン条件、Mini実機との境界は[Sky仕様](sky.md#単独アプリとos内の共通マーケットプレイス)に従う。元のデザインとOSの起動設定は保持する。公開配備・実端末導入は未受入。

### 法務・特許の任意ローカル実行履歴（2026-10-01）

ROCK／WEB04・SKY21: 既存の端末内ガイドを維持し、初期値オフの明示チェックでのみ既存jobs状態機械へ記録する。入力は端末内、出力は画面／本人によるダウンロードに保持し、serverへはTool ID、browser実行、日時、成否、処理時間、入出力バイト数を送る。本文・名前・発明内容は送らない。緊急の法務案内は履歴・認証を待たず表示する。オンライン調査の送信同意とは独立し、この履歴はlocal実行だけを対象とする。

ログイン失効、通信断、曖昧なstart応答では純粋なlocal計算を一度だけ実行し、履歴未保存を表示する。別タブでサインインして元画面の入力を保持し、本人の再実行で復旧する。完了通知の再送はmetadataのみで、生成処理を再実行しない。完了保存失敗でも結果を保持し、保存済みとは表示しない。合格条件は未同意時に通信0、同意時に本人別完了記録が残ること、未認証でも結果が返ること、本文非送信、二重生成なし。provider応答・cloud usage・本文の復元はこの記録では保証しない。自動試験と公開UI/D1の受入を別々に記録する。

Market `/market` の認証失効はHTTP 401で判定し、同じ画面に別タブのサインインと再読込を表示する。入力画面を維持し、認証後は既存GETで状態を再取得する。法務のlocal履歴保存中はオンライン調査と表示せず、本文の端末内処理とmetadataの通信を区別する。公開UI受入を別記する。

受入追記: Sky公開v15、Pixelの両Tool completed metadataをD1で確認。特許の初回保存は未確認（原因未特定）、入力保持後の明示再実行は保存成功。desktop未認証法務の結果保持・未保存表示と、Market 401の別タブsignin/reload・検索入力保持を確認。全体verify620件、Fashion19件、API540項目合格。cloud実応答、owner再認証、Apple Pay、未試験Toolは残る。

履歴保存の診断: owned JSON APIのHTTP status、TIMEOUT、NETWORK、INVALID_RESPONSE、CLIENT_ERRORだけを表示し、応答本文・元例外messageは診断へ転記しない。非JSONの401も認証失効として扱い、redirectを追わない。完了通知失敗は本人の受付IDと固定codeで履歴を照合できる。local計算自体の例外は保存失敗と混同せず、一度だけ失敗を返し、成功結果や自動再実行を捏造しない。初回Pixel特許保存失敗の過去原因は未特定のまま保持する。関連14試験合格、公開受入は実施中。

### PAPER市場の実行結果とサンプル表示

`/market`の既定6対象はPAPERのサンプル。架空の出来高・騰落率・VERIFIEDを表示せず、参照価格と実売買実績でないことを明示する。APIの所有者別proposal／receipt／positionを使い、提案内容（方向・数量・単価・合計）を承認前に提示する。提案成功後は入力チケットを閉じて同じ画面の承認欄へ移動する。実行済みは最新20件を履歴に残し、レシートを再読込後も表示する。JSON応答、401転送、10秒期限は共通requestで確認し、通信失敗を実行成功としない。外部注文、送金、実資金の承認には使わない。合格証拠はPixelでPAPER提案→承認→実行の状態とD1の対応する3記録、公開UIの再読込とreceipt一致。現在Cloud AI／外部サービスの実行受入を意味しない。

PixelのPAPER実行履歴受入で、旧Market共通CSSの絶対配置により検索欄が仮想残高へ重なる問題を確認した。800px以下のPAPER workspaceに限定して検索をheader gridの2行目へ通常配置する。合格条件は検索・仮想残高・保存済み履歴の公開実機スクリーンショットで重なりがないこと。既存Skyカードと他Market面の配置は変更しない。

2026-10-02配備受入: 同じSky v27/source 3e895271f4b01542109882fa6c7af521d8166f1bへ上記quote/history UIを配備。schema version 2/quote 0件/旧50円完了保持とdesktop未認証案内を確認。正本full verify663/19/858、Site対象30＋更新15項目合格。raw trigger SQLのnative分割は失敗したため、起動時D1 batchへstatement全体を渡し全guard適用後にAPIを開く。これを実Provider価格・請求、本人quote作成、Pixel UI受入へ転用しない。Pixelはowner解除待ち。

### 掲載候補の入力忠実性と個別受入（2026-10-02）

全34件の画面をSky v28のbuildで個別確認し、20候補を合成ownerの実Worker/D1で実行・完了記録・結果バイト数まで照合した。11件は端末内の定型下書き、9件は接続計画。サービスとしては過去の限定本番受入3／local14／接続必須16／当環境で利用不可1に分類する。各IDと環境・保存範囲は`docs/evidence/sky-individual-tool-verification.json`へ記録し、これだけで同じ公開版の全顧客導線や外部サービス成功を合格にしない。

顧客インタビューの固定テーマ・仮説と予定調整の固定日時・時間・形式が入力に反することを再現した。候補処理はAI分析済みと表示せず、入力を添えた記入用テンプレートであることを画面と出力へ示す。2 Toolは未検証のテーマ・仮説・日時を自動確定せず、確認欄を未記入にする。本文・結果はserverへ送らず、共通jobsへ状態・処理時間・サイズを記録する。reloadで候補の本文は復元されないため、Markdownを手元へ保存する。クラウドAIの実接続とカレンダーOAuthは残る。合格条件は異なる合成入力でも固定の事実を捏造せず、入力保持、外部未実行表示、metadataと出力サイズ一致を再buildしたUIで確認すること。

候補の認証失効試験では、旧共通signinが同じタブを遷移させ、直接Tool画面の入力がサンプルへ戻る不具合を再現した。共通ExecutionSigninは元画面を保持し、別タブsigninと明示GET接続確認へ変更する。成功はowner jobsのJSON配列を読み戻して判定し、401/redirect・通信失敗・不正JSONでは既知の失効を解除しない。接続確認はjob作成/実行を再送せず、本人の次の実行まで入力をメモリへ保持する。全Toolの本文を10分保存すると誤って約束していた共通説明も訂正した。候補と記事Toolで未認証→別タブsignin→接続確認→一度だけの実行、確認失敗時の停止を再buildしたUIで受け入れる。

配備受入: 既存Sky v30/source 5bdb4ecc0a1f12eb7036163818c4bbb86e224e78、env rev2で公開成功。20候補の処理と保存サイズ照合、2入力反例、candidate/articleの別タブsignin復帰・503時停止・手動2回だけの記録を合成Worker/D1/UIで確認。公開未認証UIで新案内・別タブtarget・実行停止を読み戻した。正本verify692/19/948・exit0、Site type/lint/build/bundle/assets合格。Site全設計検査は元v28に欠けているeSIM設計参照で失敗し、全体greenに換算しない。旧50円completed/stripe_verified/attempt1/rev3を配備後も確認し、新規課金なし。実Cloudは0件/資格情報なし、Pixel 10は現時点Keyguard showing=true。owner desktop/Pixel、Apple Payと実Providerは未受入。GitHub mainはb3e2676、今回の正本変更は未pushでSitesソース保存と区別する。

## 接続確認とサインイン復旧（共通Web実行）

目的は、認証と履歴保存先を確認してからToolを起動し、通信失敗・認証期限切れでも現在の画面の入力を保持すること。ROCK/WEB04が共通hookと画面を管理し、本人認証はSites gateway、外部OAuth・実行権は各Providerの責任とする。

- 入力: `/api/jobs` の本人別一覧取得。出力: `checking` / `ready` / `signin` / `unavailable`。一覧の配列応答だけを接続確認成功とし、401/認証redirectはサインイン、その他のHTTP失敗・通信切断・10秒timeout・不正な応答は接続未確認とする。
- `checking`・`signin`・`unavailable`では実行/設定保存を停止。別タブのサインインから戻り、同じ画面で読取専用の再確認を行い、本人が改めて実行する。再確認は仕事/課金/外部送信を作成せず、古い確認応答で後発の認証失効を解除しない。
- 入力の保持は開いている画面のcomponent memoryのみ。新しいbrowser storage、URL本文、サーバー本文保存は追加しない。再読み込みは未保存入力を失うため案内する。既存の端末成果保存と本人別server実行metadataは別の保存範囲。
- 接続設定は認証復旧後に本人別一覧を再取得する。編集済み入力を取得応答で上書きしない。取得失敗中は設定保存を止め、読取専用の再取得を提供する。設定保存をOAuth/外部実行成功と表示しない。
- 合格条件: 通信切断/503/不正配列/timeout/401で実行停止、入力保持、再確認のwrite 0、復旧後の明示実行1件、metadata保存、結果の端末保存/再取得、接続設定の再取得と編集保持。秘密値/実ユーザー本文を障害fixtureへ入れず、合成ローカル受入を本人実機/本番へ換算しない。
- 未決: 本人desktopとPixelの現行公開版での再受入、Apple Pay対応端末、実AI資格情報/信頼済み料金/予算。公開済みの判定はnative deployment結果を別に記録する。
