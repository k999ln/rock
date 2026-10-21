# RockstarOS — 現行製品方針と確定要望

## MiniとProの製品目的（2026-10-21本人確定）

本人の明示指示「miniは暮らしやまちづくり、proはAI専用PCと半導体確保」を採用する。Miniは暮らしとまちづくりに貢献する空間端末、ProはAI専用PCであり、その製造・販売事業を通じて半導体と関連部品を継続的に確保できる調達基盤を育てる。確保量・供給契約・購入予算の確定や、半導体の製造能力を保有するという意味ではない。既存RQ、R5単独動作、Pro独立PC、ゲーム、権限・料金・物理受入gateは保持する。


## 2026-10-21 RockstarOS本体の最新設計方針

[「RockstarOSを再設計」チャット](codex://threads/01a14d54-daee-7c30-87a8-faea84641a40)で本人が明示した内容を、RockstarOS本体の最新設計の大元として採用する。OS以外の既存RQと料金契約は分けて照合する。Sky/Homeは投稿を情報・発見・追加・依頼の単位にする。Skyは外部API/MCPから投稿を受ける入口とし、Xの投稿取得に利用者ごとのdeveloper app契約を要求しない。Eveは会話・仕事・成果を本人別に引き継ぐ。利用者とコミュニティーはルール・見た目・モデル・Agentを版として作り、鍵で参加を制御する。eSIMは本人のCloud Sky/Eve/Linuxサービスへの入口であり、OS binaryの格納先ではない。

この更新はOS設計の正本化であり、GitHub mainへの実装統合、X本人の実投稿・X独自のFor You、外部MCP実接続、別端末復元、Pixel全OS、一般公開の合格ではない。mainのRQ50・月額140 USD案と作業branchのRQ49・月額16 USD案は未照合として保持し、料金契約とRQを一括上書きしない。[Web担当](workstreams/05-web-pwa-sites.md#redesign-thread-web)と[Git担当](workstreams/10-git-ci-operations.md#redesign-thread-git)に実装順・合格証拠を記録する。

2026-10-17追加指示: 1時間の合成契約とは別に、月額140ドル・利用枠100ドルの月次プランへ無料Cloud自動選択を接続し、上限停止と入金後復旧をSandboxで検証する。本番課金は無効。仕様と受入範囲は[請求設計](sky-billing.md#月額プランと無料cloudの統合sandbox2026-10-17)。

Skyの会話モデルは「自動（作業に合わせる）」が標準です。「自分で選ぶ」からProviderとモデルIDを指定できます。自動候補はローカルと、送信同意・プラン確認済みの匿名無料Cloudです。公開Skyの実アカウントと1時間限定の合成検証契約で、自動選択・実Cloud応答・使用量表示を確認しました。本番課金は無効です。詳しくは [LLM設計](llm-evaluation-architecture.md)を参照。


2026-10-15確定: RockstarOSはJennifer・Sky・Zemaを統合し、各サービスは単体でも利用できる。Sky単体でAgentの選択・接続・実行・usage計測・月次請求・入金確認まで成立させ、Jennifer/Zema/native OS/Mini/SIMを必須にしない。Zemaは同じ明細を参照する。[責任・保存・復旧・独立利用の受入](sky-billing.md)は設計であり、本番課金受入ではない。

更新: 2026-10-15。利用者が確定した製品要望の正本。機械可読の正本は[`data/product-baseline.json`](../data/product-baseline.json)、読み進める入口は[サービス統合設計](service-design/README.md)である。実装・配備・受入の現在値は[`project.md`](../project.md)、[進捗JSON](../data/project-status.json)、同一artifactの証拠で判断する。

利用者は「やりたいことは変わっていない。設計書を最初から組み直したい」「それぞれ辻褄を合わせる」「全部表記siに変えてai→si」「古く紛らわしい不要な内容は削除」と明示した。このため本書を**現行方針 → RQ01〜RQ50 → 現在の未受入gate**へ再構成する。旧SIM購入入口、旧Mini構成・価格、日付付き変更ログは現行本文から削除し、Git履歴へ残す。復元先は[Git整理方針](git-consolidation.md)で管理する。固定原本・vendor・受入証拠は変更しない。

新しい明示指示がある場合だけ、理由と根拠を正本へ記録する。優先順位は新しい利用者の明示指示、本書の現行方針と要望、対象sourceの検証済み契約の順。過去の要望を更新する決定は該当RQへ明示し、旧本文を現在の料金・対応・許可として重複掲載しない。

2026-10-14の明示依頼「関連性・どのsystemがどう動くか・不足の補完・戦略・データ・取引を全部調査して作成」により、[横断調査設計](service-design/07-ecosystem-strategy-and-data.md)と[機械可読台帳](../data/ecosystem-research.json)を追加する。RQ追加や価格変更ではなく、既存50要望を実装・証拠・外部条件へ対応する設計更新である。

## 現行製品方針

### 公開コードを根拠にPixel si専用端末を設計する

2026-10-17の本人メモ「デザインがダサい、通知と、仕事の操作性が直感的じゃない」を、[Pixelの体験改善項目](workstreams/07-android-device-local-ai.md#pixel-usability-feedback)として記録する。続く本人の「改善して、Pixelで直感的に使えるように」「操作性がもっと直感的に」の実装指示により、[一覧/詳細/通知の導線](native-os-integration.md#pixel-intuitive-experience)を改修する。同一APKの実機成績は[専用台帳](evidence/pixel-intuitive-experience.json)で確認し、設計だけで改善受入済みにしない。機能が動くことを操作性の合格に置き換えず、既存RQの体験改善として扱う。

2026-10-15、本人の追加依頼により[Pixel実装設計](native-os-integration.md#pixel-si専用端末の実装設計)を具体化する。GrapheneOSの公開構成/差分を根拠に、既存OSの防御・回線・標準appを引き継ぎ、Home/音声/能力選択/仕事/費用/復旧を既存Rock実装へ接続する。端末とcloudの仕事正本を分け、混合工程には同root authorityのadapter受入を必要とする。SpeechServicesの正しいremoteとv3 TTSを確認し、日本語ASR/TTSの不足を別途扱う。調査版2026100600で採用lock2026100200を自動更新しない。機械可読判断は`pixelSiReferenceDesignIntent`、調査根拠は[コード台帳](evidence/grapheneos-source-audit.json)。新しいRQ/価格/実行許可を増やさず、PX01〜12は未実行の受入条件とする。

<a id="2026-10-10-現行製品方針-アカウントを入口にしsimは機器の任意部品にする"></a>

### Skyで話した内容を自動図解する

2026-10-15、本人は「話した内容を自動的に図解するシステムをSkyに追加」と明示した。Skyの`visual-scribe`を、会話・文字起こしを貼ると空行ごとの段落をフロー図へ変えるready Toolとする。初版はブラウザ内の決定的ルール処理で、入力と結果を送信・保存せず、テキストコピーとSVG持出しを提供する。図解は発言を表現するもので、意味推論・事実確認・意図補完・話者分離・音声文字起こしは行わない。

リアルタイム音声、speaker/timecode、意味単位の結合、編集、本人別成果保存、cloud/local modelによる要約は後続候補。音声や文字起こしProviderをcatalog entryへ重複加算せず、データ送信・料金・停止・重複防止・元発言spanを別に受け入れる。[詳細](sky-tools-complete-design.md#会話図解--visual-scribe)と`visualScribeIntent`を正本とし、host実装だけで公開Siteや音声経路の合格にしない。

### siクラウド利用の料金プランを提供する

2026-10-15の本人指示「料金プランはsiを使うクラウド代で通信事業者みたいな形にする」により、avokadoはsi cloudの契約・利用枠・使用量・支出上限・明細を提供するサービス事業者を目指す。通信事業者のような利用体験という方針で、法的な事業区分や契約取得の完了宣言ではない。Skyで選ぶmodel/Agentのcloud利用を料金プランへ結び、回線料・Tool代・端末代・外部実費とは別明細にする。端末内だけの推論をcloud usageへ計上しない。

本人の追加指示によりSkyの月額140 USDプランを設計する。2026-10-16の本人指示で米国向け・利用枠100 USD（差額40 USD）を確定。携帯契約のように契約同意・継続回収・未払い時の利用権制限を結ぶ。税、超過単価、州別の販売条件は未確定で、本指示だけで旧30%/1,000円等の数値を変更しない。無制限利用やconsumer stored balanceを作らず、見積・並列予約・account上限・usage/請求照合・停止/解約を同じplan版へ結ぶ。[料金契約](service-design/02-system-contracts.md#siクラウドのサービス事業者としての料金プラン)と`cloudServicePlanIntent`が具体化の正本。本番課金/paid実行gateは未受入のまま。

### 使いたい能力を追加・交換するSky

2026-10-18本人の追加指示により、Skyで追加したAgentから実Toolを実行して成果物を作る経路を実装する。使用Tool・順序・モデル・保存範囲を本人が確認し、Brokerが宣言と実行/結果を検査する。まず既存の端末内文書ToolでPixel受入し、モデルの文章やAgentの宣言を権限・Tool成功に昇格しない。[実Tool契約](llm-evaluation-architecture.md#pixelの追加agentから実toolを使う)。

2026-10-17本人の実装指示「Skyで見つけたLLMやエージェントを、固定カタログに縛られず追加してPixelで実際に使えるように」により、[owner別の動的追加](llm-evaluation-architecture.md#pixelでのllmagentの動的追加)を実装する。固定作者/モデルIDを持たず、対応GGUFと宣言型local Agentから拡張する。未知形式・任意コード・追加権限・実課金を自動許可せず、実機の可否は同一APKの証拠で判定する。

2026-10-17本人指示: Skyは、みんなが使いたい能力を持ち寄り、ソフト・機器・家具・建築へ追加・交換するaddプラグインの入口。機能・作者・接続先を固定せず、公式専用枠を設けない。「公式」を必須条件や自動選択の優遇理由にしない。LLM/Agent/Tool/recipe/表示/host adapterは各能力契約で接続する。作者・版・互換・権限・費用・検証実績を共通条件で扱い、Pixel固定catalogは検証範囲として区別する。[目的・体験・責任・保存・状態・復旧・承認・未実行受入](sky-mcp-architecture.md#使いたいものを追加するaddプラグイン基盤)。

### ソフト・家具・建築へ開くマーケットプレイスとハブ

2026-10-15の本人指示でSkyはAgent/LLMのマーケットプレイス兼ハブを製品の中心定義とする。RockstarOS以外のapp/Web/機器/家具/インテリア/建築へ、共通の能力宣言と本人/データ/費用/停止契約で接続する。Miniは空間の任意host、Pixelは第一者端末、Pro/cloudは選べる計算先。ソファー例は実センサー→荷重adapter→Sky→有効性/本人確認→ヘルスケアAgentの記録/傾向表示とし、計測・校正・共有同意を分ける。[詳細・責任・未実行SF01〜05](sky-mcp-architecture.md#家具建築まで開くskyの融合)を参照。catalog掲載や製品名だけで実機接続・健康計測・協業契約の成立にしない。

### Skyでlocal・cloud・明示した組合せを選ぶ

2026-10-17の追加指示により、LLMを手動でも選べるようにし、通常は作業に適合する利用可能なmodelを自動選択する。Codex loginを唯一の前提にしない。[要求・現在の不足・合格条件](llm-evaluation-architecture.md#selectable-models-and-automatic-default)は実装待ち。モデルの自動選択と、本人の実行承認・外部送信許可・費用上限を分ける。

2026-10-15、本人はcloud Agentの利用とlocal LLM導入の双方を選択可能にし、「だからskyがある」と明示した。Skyをmodel/Agent/Toolの発見・導入/接続・実行先選択の入口とし、cloud固定や全機種local必須にしない。modelの推論先とAgent runnerを区別し、準備状態・実host・送信範囲・費用・必要資源を提示する。選んだ経路は同じZemaのJob/成果/上限へ結び、未接続時の自動fallbackや無断送信を行わない。[詳細と未実行SC01〜05](llm-evaluation-architecture.md#skyでmodelとagent実行先を選ぶ)および`skyExecutionChoiceDecision`を正本にする。既存6 adapter/固定local modelの証拠は保持し、全選択肢の利用可能・本番合格を宣言しない。

### Pixel先行、iOSはeSIM商品から機能追加

2026-10-15、本人が「端末はまずピクセル」「iosとかはesimで機能プラグイン」と明示した。最初の物理商品はPixel 10 GL066 / frankelへGrapheneOSベースのRockstarOSを統合する専用si端末とし、iOSは通信＋si利用権商品からclient/Web/対応native連携で機能を使う後続経路にする。account/仕事/成果/費用は共通、OS権限/対応機能は端末別。eSIM開通だけでOS/code/client/native権限が導入されたとはしない。詳細・Apple一次資料・未実行IP01〜04は[多機種契約](device-support-architecture.md#pixel先行とiosへの機能追加)、機械可読判断は`pixelFirstIosPluginStrategy`。独自OSの導入可能性と同image実機合格は別で、flashや有料gateは開かない。

### si専用端末を目指す

2026-10-15の本人指示「ai専用端末に変えたいんだよね」により、Pixel 10 GL066 / frankelの参照profileはJenniferとの対話・制作・仕事を通常の入口とするsi専用端末を目指す。GrapheneOSベースのOS、Skyの能力接続、Zemaの仕事/成果/費用、Brokerの本人/権限/予算を接続し、unlock後のsi Homeから扱う。一般app制限の強さは未決定で、設定/復旧/mute/手動停止を確保する。専用端末の携行をMini利用の条件にせず、通信＋si利用権商品・既存client経路・ゲーム要求を維持する。[詳細と未実行の6受入](native-os-integration.md#si専用端末の利用体験と実装境界)を`dedicatedSiTerminalIntent`へ対応する。本更新は体験の具体化で、全OS導入や有料gate解除の完了ではない。

### PC・対象の実物・携帯に拘束されない制作と対話

2026-10-15の明示指示「pcのやリアルの物の前にたたなくてもものが作れる状態をつくる、携帯を持たなくてもやり取りができる状態を作る」を、製品を横断する体験要件として固定する。PC前の着席や携帯の携行/取り出しを通常の制作・対話の必須操作にしない。Miniや対応する空間hostからJenniferと話し、案を作り、直し、比較・保存し、進捗を聞き、確認・停止・再開する。許可した相手との連絡も同じ本人・宛先・送信内容の確認へつなぐ。利用範囲は受入済みの部屋/端末/能力に限り、あらゆる場所で常時使えるという保証にしない。

PCやPro/cloudは必要に応じた計算先であり、利用者がその前にいる条件ではない。Mini単独のlocal基本動作を維持し、自然文理解や重い制作の能力・接続・データ送信・費用は個別に受け入れる。携帯を必須にしないことと、計算機/入力・応答装置/給電/必要な通信を不要にすることは別である。

物を作る流れは `意図 → 案/編集 → 検査済み版 → 見積/承認 → 製作引渡し → 製作/測定/受取照合` とする。対象物の前にいない時は許可された図面・寸法・計測を使い、情報不足を推測で製作可にしない。現物には実際の設備/製作者が必要であり、案の生成・製作指示・現物完成を別の証拠にする。声や在室だけで本人承認にせず、電話に依存しない本人確認を別途成立させる。未成立なら草案を保存して外部送信/支出/設備作用を保留する。

[体験と6受入ケース](service-design/01-service-experience.md#携帯を持たずpcや対象物の前にもいない制作体験)を正本の具体化とし、RQ37/40/42/48/49、既存Mini R5/建築取付/host契約へ接続する。新たなTool登録・製造開始・本番接続の合格ではない。

### 通信とsi利用権をまとめる商品を入口にする

2026-10-15、利用者はeSIMの役割として**「通信とsi利用権をまとめて提供する商品の入口」**を選んだ。2026-10-10の無料account先行・consumer eSIM販売保留という商品設計方針を更新する。accountは本人・契約・利用権・Job・成果・予算の正本として維持し、回線profileを本人IDや実行許可の代わりにしない。無料accountと対応Toolの試用は残し、商品の購入と既存OS app/browserの利用経路を分ける。

売り手はavokado。商品は通信とRockstarOS/Sky/Zema/si利用権を組み合わせ、LLM従量・通信料・Tool/外部実費を別明細にする。利用権の同梱を無制限のtoken/GPU利用にせず、従来の料金率や上限を本選択だけで変更しない。対象国/通信partner/plan/quota/再発行/解約と本番課金条件を確定するまで実発行/有料cloud gateは無効のままにする。

eSIMへOS binary/LLMを格納せず、回線開通、本人/利用権、OS/client導入状態、cloud job/使用量を別々に追跡する。GrapheneOSの改変・Pixel導入・自社OTAとcloudの関係は[基盤設計と32項目の調査](native-os-integration.md)を正本の具体化とする。独自全OSはexact機種・署名・復旧の受入が揃う場合に案内し、それ以外は対応client/browserへ分岐する。公開Home `https://avoado.si/os`、Sky `https://avoado.si/os/sky`、成果 `/os/sky/outputs`は維持する。

### Jennifer、Sky、Zema、OSの役割

Jenniferは利用者が話す全体のプロジェクト統括窓口。第一者の製品表示は`Jennifer`へ統一し、過去資料の`Jenniffer`は検索・履歴用の旧表記としてだけ保持する。SkyはAgent/Toolの発見・掲載・購入・接続、ZemaはJenniferの裏で依頼・計画・進捗・承認・停止・成果・費用・Receipt・履歴を持つ仕事system、RockstarOSは本人・権限・実行・保存・復旧の共通runtimeである。JevはSkyから明示利用するremote evaluatorで、Jenniferとは別system。

Jennifer sourceはPR #113のhead `3349c2475468443bc7ecd94a4e3782343f514a8f`からmain `01d2e41857e8e713bd5df31476deaea8c942e983`へ統合済み。[Jennifer Coordination](jennifer-coordination.md)に従い、8projectは運営の内部portfolioとし、一般利用者のtenant案件と権限・保存を分ける。計画や担当profileに実行権を与えず、Brokerの本人・権限・費用境界を通す。COLOMBIA原本、資料grant、native UI、実Providerは未受入条件として残る。

Jenniferは依頼、COLOMBIA、project正本からGoal Contractを作り、AMCでdomain別leafへ逆算し、project担当siと専門siへ割り当て、検収済み成果と未完了を最終報告へ統合する。保存は草案であり承認ではない。COLOMBIAの未決事項を回答または理由付き延期し、ownerがGoal Contractを承認して初めてinventory一件を実行可能にする。inventoryの型付き報告を別principalが検収し、ownerがdelivery段階を承認してから残りを依存順に進める。外部委任は全Goalで同時一件とする。

Zemaは版付きplan、semantic diff、task attempt、artifact hash、署名済みusage Receipt、費用状態、停止、取消未確認、独立review、Goal受入をowner別D1へ保持する。ブラウザのactor名、evidence文字列、合否ボタンだけではAMC状態を進めない。workerの`TaskReport`とreviewerの`ReviewReport`はサーバーが既存A2A台帳から生成し、reviewerはworkerと異なるprincipal、同じpredecessor委任、正確なworker report digestへ結び付ける。計画とGoalの状態遷移は同じD1 batchでrevision guardする。remote完了だけを完成扱いせず、全leafの独立検収とownerの最終受入を必要とする。実Provider送信はoperator flag、暗号化鍵、信頼鍵、allowlist、見積、Broker証明、owner個別承認が揃うまで無効のままにする。

`/chat`の製品名と会話はJenniferを窓口に統一し、Zemaは同じ画面の`仕事`表示と裏側のwork controlとして示す。AMCはZema内の逆算分解engineで、担当siは作業実行時だけ起動する。Sky直接操作・host app・ゲストの純粋処理に会話は強制せず、各入口から同じ仕事・権限契約を使う。親WorkJobは`active / review / completed / cancelled`の四状態を維持し、AMC・A2A・金融・review・削除の状態を混ぜない。Jennifer Accessの唯一の正本origin/RPは`https://avoado.si` / `avoado.si`とし、Sites accountはpasskey登録・復旧後に実行権へ暗黙昇格しない。Columbiaと生成Site hostの共有work画面は正本へ転送し、private APIを別D1へ書かない。

### Skyをさまざまな製品・環境へ融合させる

2026-10-14の明示指示により、Skyの到達像を「Agentを並べるMarketplace」より広く固定する。Skyはアプリ、Web、PC、ゲーム、家電、ロボット等のhostが持つ能力と、複数の専門Agentを組み合わせる接続・選択面である。冷蔵庫なら在庫を読んで不足を提案し、本人が選んだ店舗・予算・品目の条件で買い物へ進む体験を想定する。特定の冷蔵庫、在庫sensor、店舗API、購入権限の実接続が完成したという意味ではない。NFC、OS、Miniの所有はSky利用の必須条件にしない。

柔軟性は無制限アクセスを意味しない。hostごとに版付きの能力宣言と入力/成果schemaを持ち、`観測 → 提案 → 本人確認 → 実行 → 結果照合`を分ける。複数Agentは能力・データ権限・実行先・費用・失敗時の復旧を満たす時だけZemaの同じ仕事へ委任し、Agentの提案から接続権・購入権・機器操作権を自動生成しない。家電の在庫推定は不確かさと取得時刻を示し、誤認時に本人が修正できる。購入・注文変更・物理動作は対象と金額を示した個別承認、冪等性、取消/結果不明の照合を通す。[横断接続設計](sky-mcp-architecture.md#異種hostと複数agentの融合契約)と[サービス受入](sky-launch-design.md#異種hostへの融合とagent構成)に従う。

### 透明な料金と実行保留

- アカウントは無料。期間パスは前払い・有効期間6か月未満、自動更新は既定オンを購入画面へ明示し更新前に通知、途中返金は既定なし。
- 従量は累計しきい値または月末の登録カードへの後払い。初期しきい値は1,000円、上乗せは30%。本人が月の上限を決め、回線つき機器には別の月額基本料を設ける。消費者のstored balanceは持たない。
- SkyのTool売上手数料は当面10%。従量の粗利が固定費を3か月連続で上回った時に取り分0へ切り替える。0は決済実費まで0という意味ではない。作者払出しは月末締め・翌月末払い。
- 期間パス・従量・Tool購入・外部API/決済実費・回線料・OSS/BYOKを別表示する。1,000円は請求triggerで、支出許可ではない。30%と10%を同じ明細へ無条件に二重適用しない。
- 見積、承認上限、予約、観測usage、照合済み請求を分ける。全端末・worker/reviewer・直接LLMを含む月/Goal予算と後払いadapterは未受入で、現行funded Walletのpaid dispatch gateを文書だけで解除しない。
- RQ20等の8.88 USD成果連動料金とCSV販売者料金は収益経路確定まで**保留**。新規計上・請求・回収をしない。888 cents、実費優先、同契約複数端末の重複防止等は歴史的契約・回帰fixtureであり現行価格ではない。

やめ方は自動更新off、上限0、機器回線の解約を別操作とする。停止前usage・債務・結果不明holdは消さない。税、通貨、丸め、FX、請求期間、pass範囲、Provider再販・支払条件は確定・外部受入前にpaid実行を有効化しない。[現行account・料金契約](service-design/02-system-contracts.md)、[Sky課金](sky-billing.md)、[横断契約](service-design/06-consistency-contracts.md)を使う。

### Mini、Pro、rocketstarと配布対象

現行hardwareはavocadoMini R5、avokadoPro、rocketstarの三program。Miniは使用時全高200mm以内の銀色円筒、1本自律、別Edge Hub不要、同型Mini増設、設置中給電＋携帯電源（部品未選定）、眼鏡なしの周囲空間表示、身体・手・日本語音声、ゲームから生活支援への展開を目指す。Proやスマホ、インターネットを基本操作・保存の必須条件にしない。[R5正本](avocado-mini-r5/README.md)の光学・精密入力・収納・熱・電源・安全・製造gateは未受入。

2026-10-14の明示方針として、Miniには**建築一体型の設置profile**を加える。新築の設計段階から建築・設備・内装側と設置条件を調整し、天井への収納・展開を複数の天井構成に合わせて検討する。これはR5単体coreを置き換える別製品や建物制御Hubの必須化ではなく、取外し・点検できる設置方式の追加である。居住者のlocal利用・停止・保存を建物所有者や施工者の権限と分離する。天井構造、給電、熱、落下/可動部、光・音・camera、保守、消防・建築上の適合は対象物件ごとに有資格者と確認し、実施工・販売・対応天井の確定を設計記載だけで宣言しない。[建築一体型の設計条件](avocado-mini-r5/README.md#建築一体型miniの設置profile2026-10-14)を正本とする。

Miniの回線は任意の別model/optionで、国内LTEのみ、IoT data専用SIM、試作カード・量産chip、SGP.32対応とし、遠隔profile切替を自作しない。Pro・phone tether不要。回線料は自社名義の機器service料に含め、一次supportはavokadoが受ける。consumer eSIMを商品入口として設計する方針は2026-10-15に再開した。実発行は未受入で既存codeのgateは既定無効のままにする。[Mini通信](avocado-mini-cellular.md)で回線と機器適合を別受入にする。

ProはNVIDIAのGPU/chipを使う高性能si PCが主眼で、独立据置PC・PCゲーム目標を維持し、Mini接続は任意。販売目標は80万円/台、税込/税別等は未定で、確定販売価格ではない。最終BOM、性能、冷却、販売条件、調達・製造は[Pro設計](avokado-pro-pc-design.md)の未受入条件。旧Mini構成や参考価格を新しい販売契約へ転用しない。

rocketstarは衛星輸送・帰還・回収・再使用を目指す独立工学program。A-LINK、衛星、地上設備、回収は内部system。自社衛星網で通信を広げる構想は研究開発準備として保持する。RockstarOSの地上支援と独立飛行安全系を分け、一般Agentに管制権を与えない。[R1.0固定原本](rocketstar-design/README.md)を保持し、資料保存を製造・飛行・世界中の常時通信の合格にしない。

Web/PC、Linux/Buildroot/ARM64 QEMU、Pixelは開発・配布profileで、三hardware製品へ追加する販売機種ではない。最初の物理OS対象はPixel 10 GL066 / `frankel`。QEMU Developer Preview、Android単体APK、Pixel全OS imageを別に検証し、exact機種・署名・boot・復旧が合格した時だけnative OSを案内する。その他は対応client/browserへ分岐する。

### 現在の追加機能を同じ契約へつなぐ

<a id="2026-10-13-skyの成果をアプリ内へ渡す"></a>

#### Sky成果の同一originアプリ表示

利用者の明示指示により、OS上の仕事管理はZema、Sky単体はAgent/Toolの選択・接続と保存済み成果のアプリ内表示を担う。本人別のSky成果一覧を設け、第一者同一originのFitnessアプリを `sky.fitness.plan/1` の表示例にする。型が合わない文章を運動プランに変換せず、NFCや大学名を成果への権限としない。外部アプリ向け認証SDK、実Fitness Agent、Provider出力と本番受入は別条件。[詳細](sky-launch-design.md#sky-app-output-plugins)。

<a id="2026-10-13-sky公開入口の変更"></a>

#### 公開Home・Sky・製品domainの分離

利用者はドメインの綴りを `avoado.si` と確認した後、RockstarOS Homeを `https://avoado.si/os`、Skyを `https://avoado.si/os/sky` にするよう明示した。旧 `avoado.si/sky` は同じドメインの新URLへ転送する。Sky専用Siteが同ドメインを保持し、Skyパスは同一originで処理する。トップと予約ページはavocadoMini Siteからサーバー内で代理取得する。トップのMini・Proリンクは `avocadomini.si` と `avocadopro.si` の各製品ページへ移ることを公開ブラウザで確認した。NFCタグへ入口URLを書けることと、大学別の本人確認・権限・6接続枠が本番で動くことは別の合格条件とする。

<a id="2026-10-13-skyからzemaのローカルagentを使えるようにする"></a>

#### Zema Webの有限ローカルAgent
Sky単体はTool／Agentを発見・保存・接続する入口で、依頼の受け皿と実行履歴はZemaが担う。Web版Zemaは、同じPCで動くOllamaまたはOpenAI互換のloopback endpointを選んだとき、ローカルLLMを権限のないplannerとして利用できる。planner出力は閉じたJSON schemaで検査し、最大3手、`sky_route`／`format_citations`／`coconala_check`の副作用がない3処理だけを許可する。shell、任意file、network、購入、投稿、送信、権限変更は許可しない。Cloudへの自動fallbackも行わない。

2026-10-13のlocal previewではOllama `qwen3:0.6b`を導入し、Zema画面から通常会話が完了することを確認した。軽量modelのTool選択品質は限定的であり、未実行処理を実行済みと数えない。`chatgpt.site`上の公開Workerから利用者PCの`127.0.0.1`へは到達できないため、公開版でこのlocal Agentを使うには将来の端末companion／local bridgeが必要。local preview用の固定userはloopback hostだけで有効で、公開hostの認証を迂回しない。

<a id="2026-10-13-skyをtwitter--x型の1列フィードにする"></a>

#### Skyの1列フィードと本人同意のおすすめ学習

利用者は、Skyの一覧をPinterest型ではなくTwitter / Xのような1列フィードにすると決めた。主表示は「おすすめ」と「マイフィード」。マイフィードは明示保存または接続済みのToolだけを新しい関係順に表示し、明示フォローをまだ持たない初版で「フォロー中」とは呼ばない。

初版の固定順位 `sky-usefulness-v1` に加え、同日の追加指示でX Phoenixの設計をSky用へ縮小した `sky-phoenix-v1` を実装する。本人が「おすすめ学習」をオンにした場合だけ、qualified impression、詳細、依頼先選択、Tool開始、保存／解除、接続と、本人の正本Tool runの完了／失敗を30日・最大800件で保持し、detail／launch／save／connect／skipの確率、直近性、Tool／category affinityを順位へ反映する。履歴0件・保存不可・同期失敗・未知versionではv1へ戻す。依頼本文、Zema会話、結果本文、device token、account identifier、raw scroll、人気、収益は入力にしない。本人は画面から停止・全削除できる。フィード履歴はランキングだけに使い、実行権限、job、支払い、購入、Agent promptを作らない。実作業はZemaが担う。詳細は [Sky](sky.md#個人化した1列フィード2026-10-13) 。

Sky Compute GridはRQ50に従うAndroid余剰計算のmatchingで、公開/合成textの固定embedding lotだけを独立検証する。現在は`sky_test_credits`のhold preview。実請求・実払出しや自動cloud fallbackを開始しない。

SPIDERは本人の明示入力をブラウザ内で静的検査するSky Toolと、OS本体UID 1002の固定範囲監視・対応送信前拒否を分ける。入力原文・ファイル名・検出値の非送信/非保存、実worker状態表示を維持し、画面をOS全通信遮断・安全保証・24時間運用証拠にしない。Skyコード投稿は本人が全文・license・版・保護方式を確認した明示公開で、単体検査と区別する。SPIDER標準保護の交換・取り外しを実行権変更にしない。

Campusは人・project・機会・event・community・portfolio・resourceの入口で、既存Sky/Zema/Walletを複製しない。Columbia NFCカードはavokadoが書き込み配布するURL入口。`avocadomini.si/t/<tagId>`から英語の出典整理・AMC・米国特許案内を開き、無料下書きを先に示す。大学の文字名を使い紋章・ロゴを使わず、カードに本人情報・鍵・利用権を入れない。匿名tag集計はIP・email・正確な位置・raw User-Agentを保存しない。 Columbia入口も`design/sky-twitter-feed-mobile-v2.png`を基準とする英語のFor you／Saved・端末内の依頼振分け・単列3 Tool投稿・browser内保存・実Tool CTA・下部navigationへ揃える。入力をserver/LLMへ送らず、無料local処理と特許si調査停止を保持する。印刷・枚数・費用・配布許可は未定。[Campus](campus-layer.md)、[NFC設計](sky-nfc-columbia.md)に従う。

2026-10-14の追加指示: `columbia.avoado.si`と本体`avoado.si/os/sky`の差分を解消する。Columbiaの視覚言語を本体Skyへ展開してよいが、大学別Homeと本体Sky Homeは別の役割・画面として維持する。大学Homeの無料ブラウザ内下書きと任意の端末内保存はその場の体験として残し、購入、本人別ライブラリ、接続、Zemaの仕事、Agent成果の正本は本体Skyへ集約する。大学hostの独立DBを、同じAPI pathや同じGit sourceだけで共有済みと呼ばない。既存データの移行はbackup、互換schema、本人A/B、復旧試験を経てから行う。

Campus所属は認証済みemail domainとの一致を`domain_verified`として扱い、在籍・肩書き・大学公式承認にしない。emailをCampus tableへ保存せず、profile公開範囲、block/report、投稿archive、tag停止・集計削除、Campus本人データ削除を維持する。原典のない外部情報はcommunity投稿として区別する。

既存OSへのSky・本人が選ぶfile/メモ回収・LLM追加、IP Studioの音声/電話は既存adapterへ接続する。録音、発着信、外部Tool作用、送信先・権利・費用は別承認とする。通常の会話やsource実装を全データ閲覧・実通話・端末内model導入の受入にしない。

## 確定要望 RQ01〜RQ50

番号は変更しない。以下は要望の意味と現在有効な契約を一つの場所へ整理したもの。完了判定は末尾gateと現物証拠を使い、要望の掲載を実装済み表示にしない。

## RQ01 製品の中心

自分専用のsi自動化チームで時間・負担を減らし、仕事・創作・学習・ゲーム・新しい挑戦の余地を増やす。Skyで商品を選び、Zemaで仕事を管理し、Walletで収益と費用を照合する。利益・値上がり・社会的効果を保証せず、負担削減・実費後収支・本人が選べる行動で検証する。

現行契約は無料account入口とJenniferの会話窓口。OSは共通runtimeで、専用端末所有を利用条件にしない。無関係な一般アプリの品揃えや旧ファンド試算を主商品へ戻さない。

## RQ02 ツール供給とOSの責任

tobは商品を開発・更新・保守する供給側の役割で、特定企業の独占や法人名・契約先を意味しない。RockはSDK/adapter、認証・権限・互換性、実行、資格・料金、成果、収支照合の共通基盤を持つ。商品固有のsi・業務ロジックをOSチームの義務へ拡張しない。

## RQ03 現在開発しているツールも商品

既存・開発中ToolはSky内の独立商品とし、CSVもホームの独立アプリではなくSky Tool、仕事はZemaに集約する。原本・owner・license・版を保持し、掲載・接続・許可・実行・更新・停止・削除を商品単位で管理する。通常更新にOS再buildを要求しない。

Mr.ユーティリティ、記事APK、native recipe等の同名機能はsource/ref/hashと契約・fixtureで対応を確認する。全商品をsi推論・収益化・完成済みと表示しない。

CSV専用仕事は1file・10 MiB・50,000行・100列、UTF-8/BOM/CP932と明示した列/空白/重複/順序/encodingだけを扱い、先頭0・長い数・引用内改行を保持して推測補完をしない。owner付き成果は受付から7日または本人削除で消し、buyer共有は認証・期限grantの受入まで無効。無料compositionとは別の[CSV業務契約](csv-business-v1.ja.md)として維持し、旧CSV販売者料金の保留を解除しない。

## RQ04 実行方式の違いを吸収する

端末内、本人PC、Provider cloud、self-host、複数工程の混成を対応adapterで扱う。実行場所、運用者、接続方式、工程を別項目にし、MCPだけや同一OAuthへの強制統一をしない。Mac miniは候補で、PC/cloudを一律先送りしない。

offline継続、PC sleep、再接続・結果不明の復旧範囲を商品ごとに示す。開始済みcloud jobは承認済み条件内で継続・再照合し、実行先・送信先・費用変更を黙ってfallbackしない。

## RQ05 料金・権利・資格を混同しない

料金、OSS/license、契約・資格、API keyのowner、実行費を別軸にし、BYOKを無料と扱わない。モデル・依存物・再配布条件も確認し、動く場所・契約・支払先・送信データ・停止能力・不足理由・復旧方法を提示する。

現行料金は本書のaccount/pass/従量/Tool売上契約。旧同一購入契約の月888 centsや重複防止は歴史的契約・回帰として区別し、成功報酬保留と第三者実費を混ぜない。

## RQ06 Walletで得たお金を管理する

自動化の売上、確定/保留、入金先、実行費、手数料、返金、払出し、照合を本人別に管理し、tob販売収益・利用者仕事収益・Rock料金のownerと資金の流れを分ける。既存native台帳・資格・同意・重複防止・不明照合を再利用する。

実行成功や手入力を検証売上にせず、Providerの認証済み記録へ照合する。通貨・custody・銀行/暗号資産・払出しは契約と証拠で決める。消費者stored balanceを持たない現行サービス方針と金融履歴の表示を区別する。

## RQ07 OS標準機能は自動化の周辺へ集中する

商品/資格、認証情報保護、実行先、永続job、停止/照合、費用、成果/履歴、Wallet、重要通知、紛失時の失効、更新/復旧を標準化する。外出中に進捗・停止理由・費用・成果・お金を短時間で把握できることを目指す。通知は完了・停止・予算/契約問題・差異・必要確認に結び、無関係な利用頻度を増やさない。

## RQ08 接続・費用・停止の保証範囲

第三者へrootや包括的送金権を渡さず、同意を商品版・入力・送信先・操作・費用へ固定する。更新差分を再確認し、全工程に同じ確認を強要することも、無制限無人送信も要望にしない。

取消要求と外部停止確認を分け、停止APIや最大費用が不明なら保証しない。不明応答は同operationで照合し、二重実行・請求を避ける。未解決holdと既発生費用を取消だけで消さない。

## RQ09 進捗はbranchと証拠を伴う

GitHub main、対象branch、PR、SHA、同一SHA CI、コードと証拠で判断し、mainだけで未実装と決めない。open PRをmain反映済みにしない。source・host・fixture・仮想OS・Provider sandbox・実機・本番を分け、試験件数を完成率へ換算しない。

## RQ10 ベースを繰り返し聞き直さず改善する

[prompt規約](prompt-playbook.md)で最新実装との差を調べ、確定要望を再質問しない。提案は対象RQ、再利用実装、不足、組合せの効果、検証指標、導入条件を持つ。相違は原因・修正順・合格証拠・残条件を[次の実行prompt](prompts/rock-current-next-20261002.md)へ渡す。

ベースと実装branchが分かれた時は引継ぎ入口・優先順位の同期を先に行う。prompt保存、実装、GitHub保存、main統合、公開を別記録にし、未解決問題を次回へ残す。

## RQ11 端末を持つことで減る不便を実商品の利用で検証する

契約/設定の迷い、PC/cloudの画面切替、出先の停止不能、成果の散在・重複、費用/入金不明を既存Toolで減らせるか検証する。最初の成果までの時間・操作数・設定数、探索/原因特定/復旧時間、通知対処、消失/重複/二重計上、説明できる受取額を測る。需要・改善は未測定で宣言しない。

Gitの実Toolを棚卸しし、提案/記事/納品の少なくとも一件を、発見→準備→接続→承認→実処理→保存/再表示→停止/復旧→費用照合まで通す。hash表示や固定デモで代用せず、合成案件を既存ロジックで処理し、不便・原因・修正・再試験を残す。PC単体と比較し、専用OSと管理Webの価値を分ける。

## RQ12 現設計をOSとして稼働・検証できる最低限のベースにする

native OSをbuild・boot・操作・保存・再起動・更新失敗復旧まで検証し、版・環境・範囲・結果・証拠・残リスクを[受入雛形](templates/os-acceptance-report.md)へ保存する。QEMU開発OSは独立系列として保持し、模擬Wallet・試験鍵・合成データを実機・本番・実資金へ転用しない。未実行・skipをPASSにしない。

基本操作・保存成果・復旧を外部契約切れで失わせず、Web管理画面をOS bootの代替にしない。設計v1.1の実装は[承認済み](execution-approval-20260909.md)で、旧「承認待ち」を現在の停止理由にしない。公開・実機・実資金は準備条件と対象を確認して別gateを通す。

## RQ13 OSとゲームを連動しWalletとゲーム内通貨を交換する

ゲームaccount・通貨とWalletを正式adapterで結び、発行元・game・資産を分離して交換条件を本人が確認する。認証・同意・予約・台帳・冪等性・照合を共有し、client自己申告で実残高を動かさない。

game/API、方向、換金可否、原資、rate・費用・上限・端数・返金・地域は未確定で、本番は無効。合成通貨sandboxを先行し、ゲーム本編開発や無条件換金へ拡張しない。ATMは別adapter/同意/試験で独立性を守り、同Walletを使う時だけ二重使用防止を共有する。

## RQ14 自作ゲーム作者が組み込みやすいWallet基盤

共通API/SDK、合成通貨sandbox、動く最小例、導入手順、診断、取引/照合履歴を提供する。作者権限とplayer Wallet権限を分け、keyをclientへ埋め込まず、作者に実資金mint権を与えない。複数game/asset/playerを分離し、換金原資はWallet/清算先で確認・留保する。

初見導入時間・設定/コード量・成功率・原因特定/復旧時間を測り、首位を未実証で宣言しない。OS再build・金融台帳自作・本番契約をsandbox開始の前提にしない。SDK環境・料金・運用原資は別決定とし、非金融Gameを金融完成待ちで止めない。

## RQ15 ATMでRockが徴収する手数料は0

RockのATM利用/払出手数料は0で、別名目や換算差で同じ費用を徴収しない。外部ATM/決済/送金実費は存在・負担者・金額・事前同意を別表示し、総額無料や無制限補填を約束しない。ゲーム料金0へ読み替えず、ATM独立性・既存契約を守り、要望保存を物理ATM・実資金試験の実行にしない。

## RQ16 CM発表に向けて導入可能なOSにする

fresh Mac/PCから再現可能な導入・起動・終了・再開・backup・削除・復旧手順を持つLinux/Buildroot/ARM64 QEMU Developer Previewを配布単位にする。既存VM・秘密・個人pathへ依存させない。

物理Previewはexact機種/地域、unlock、BSP/firmware/driver、partition、署名、rollback、純正復旧を別受入。配布物に版・対応・hash/署名・制限を含め、CMは合格範囲だけを実演する。QEMU/APKをphone OS、本番金融や未確認機種を対応済みにしない。[現行導入・受入計画](service-design/04-delivery-and-acceptance.md)を使う。

## RQ17 現段階をRockstarOS 1.0のベースとして発表し継続改善する

Sky、署名Tool、local実行、合成Wallet、native UI、A/B更新・復旧、backup、開発remoteを1.0のベースとして継続改善する。Developer Previewの段階を維持し、保存・manifest・Receipt・台帳・復旧の互換性を明示する。版だけで実機・本番金融・一般公開を合格にしない。[1.0構成](rockstaros-1.0-architecture.md)に従う。

## RQ18 基本アプリをSky / Zema / Wallet / Polymarketに分離する

Skyは発見・掲載・接続、Zemaは仕事、Walletは収支・費用・入出金、Polymarketは外部adapterとして責任を分ける。現行会話窓口はJenniferで、Zemaを競合人格にしない。役割自動選択は事前選択を強制せず、接続済み能力だけを提示し、不明/不足/未接続は確認を求める。受付文を実行Receiptにしない。

Polymarketの枠と未接続画面を持つが、実市場データ・注文・清算・Wallet移動は地域・年齢・本人・規約・規制・資金の個別gateが揃うまで無効。包括的送金権、自動取引、自動再投資を付与しない。

## RQ19 目標駆動のブランド経営エージェントへ拡張する

Fashion Brand Opsは数量・売上・粗利・期間・広告上限から仮説/広告実験/投稿/営業/制作の次案を優先するCampaign Autopilotを持つ。tickはcampaign・承認・DM・署名済み売上・制作状態を照合し、外部作用を直接行わない。

Sales Conciergeはtenant内の顧客履歴・意向・注文・確認済みprofileからstage、segment、不足情報、下書き、人への引継ぎを作る。DM返信は`instagram.dm.reply.prepare`と個別approvalを通し、無差別DM/follow/自動送信をしない。Production Cockpitは署名済みpaid注文だけから原価・能力・納期・資材・品質/発送を追い、手動paid/refundedや金額不一致を拒否する。発注・購入・配送・通知は別Provider gate。

<a id="rq20-skyの自動化収益から最大888-usdを回収する"></a>

## RQ20 自動化収益を照合し、成果連動料金を別gateにする

要望は、実注文・納品・Provider入金をExecution/Earning Receiptへ結び、実費後の成果から料金・払出しを説明すること。Tool成功・手入力・未確定決済を収益へ昇格させず、Receipt/実行/入金再送を二重計上しない。

現行契約は8.88 USD料金案の保留。旧UTC月最大888 cents、売上0なら0、実費優先、残額内回収、未達債務/繰越/カード先払いなしは回帰条件として保持し、今の請求条件にしない。対象利益、料率、回収・開発者還元・返金、主体/custody/地域/本人/税/Providerを確定・受入するまで新規請求・回収・払出しを有効にしない。

## RQ21 tob無料と接続・貢献・分配を一体化したSky Network

登録・接続・公開・基本検査/分析は無料で、商品代は作者の収益。現行売上手数料は10%、条件達成後0へ切替で、旧0%を現在へ重複適用しない。外部実費・貢献/分配・受取人を分け、無料を無審査やRockの無制限負担にしない。

Connection Passportで作者/版、schema、OAuth audience、scope、実行先、価格、受取人を確認し、権限を増やさない子lease、Receipt、取消/不明、分配を一つの導線へ結ぶ。料率・最低払出し・税・返金責任はProviderごとに決め、実売上・custody・報酬は個別受入前に有効化しない。

## RQ22 MCP接続・管理をSky本体の機能にする

MCPを別製品/標準navigationにせず、Skyで内蔵/外部の状態、URL/registry/package、安全確認、Passport、範囲、料金、受取人、分配Receiptへ進む。掲載もSky内で行い、説明ページや常設sidebarを必須にしない。`/sky/network`と`/sky/publish`の既存入口を保ち、合成Passportを実接続にしない。

## RQ23 実在するローカルMCPと導入・利用導線を一致させる

PC接続状態は`127.0.0.1`の実sessionから読む。ZIP取得・展開/起動・Sky確認の三段階で、initialize、initialized、tools/listによる対象四機能を検出する。案件check・出典整理・無料記事・納品照合を既存実行/履歴へ接続する。

browser内処理とPC必須処理を区別し、ダミーURLを接続にしない。任意remote MCP、Fashion実Provider、Ledger常駐、native/Android実機組込は各受入前に利用可能と表示しない。

## RQ24 MCPごとの接続先を選び、対応先へ最短で接続する

このPC、Sky Cloud、Provider MCPを商品ごとに選び、推奨・動作/停止条件・実費を提示する。PCの秘密性、cloud継続、Streamable HTTP/OAuthの能力を分け、非対応先を自動選択しない。

審査済みmetadata→必要なOAuth→復帰→initialize/能力/scope・料金差分/証跡を通して接続済みにする。資格情報を入力欄へ貼らせず、更新・失効・不明を追う。未受入のSky Cloud/remoteをPCの合格で有効表示しない。

## RQ25 MCP接続を自動化ツール共通のConnectorにする

審査済みregistryを読むPC Connectorがstdio/Streamable HTTPをserver IDで扱い、protocol/capability、pagination対応tools/list、schema digest、時刻をPassportへ返す。四機能/四十機能の異なるMCPでも実接続を検証する。

操作は`servers → connect → prepare → execute`。未信頼annotationsを許可根拠にせず、内容/引数に結び付いた一回承認、改変/再利用/直接tools/call拒否、送信後timeoutの`outcome_unknown`を持つ。任意command/secret入力やshell起動を避け、HTTPS・redirect/private network拒否・環境変数の認証参照を維持する。OAuth/remote/失効/cloud常駐は別受入。

## RQ26 ホーム画面と設定アプリをOSの標準入口にする

タッチ向けHome `/`からSky `/sky`、Zema、Wallet、Market等へ進み、設定は標準utilityにする。全画面にkeyboard/touchで使えるHome導線を置き、未保存作業の契約を守る。

壁紙、色、iconサイズ/名前/順の端末設定は本人・MCP権限・Wallet・Receiptから分離する。設定は外観、PWA、account、PC/MCP接続、実行先、再読込、導入/backup/復旧をまとめ、Web/QEMU/物理OSと実操作/説明を区別する。

## RQ27 OS保全機能を設定へ実装する

通信、保存、Web Crypto、Service Worker、API、Connectorの実状態を診断する。許可された端末Home設定だけをPBKDF2-SHA256・310,000回とAES-GCM-256で暗号化backupし、改ざん/誤passphraseを拒否する。login/token/Wallet/server Receipt/未知keyを含めない。

Web/PWA更新確認をnative image書換えにしない。QEMU受入、exact機種/BSP/unlock/recovery、production鍵、外部Provider資格情報を個別gateで扱い、UIだけで未設定を解消済みにしない。

<a id="rq28-メルカリを最初の収益経路にする"></a>

## RQ28 メルカリ収益スターターを正式な販売経路へつなぐ

保有在庫の事実・状態・価格・手数料・送料・原価・実費から原稿と見込み利益を作り、在庫・正確性・禁止物を本人が確認する。販売/利益を保証せず、無在庫・虚偽・大量再出品・外部決済誘導を自動化しない。最初の客の現行方針は文章納品の個人で、メルカリToolの要求は維持する。

個人取引はkeyを取得せず公式画面へ原稿・計算・記録を渡す。手入力完了は未照合。Shopsは公式GraphQL/webhook、契約/token/User-Agent/国内固定IP Connector、sandbox、取消/部分返金/不明照合を受け入れ、Provider金額と実行を一意に結ぶ。Sitesから固定IP条件を迂回せず、RQ20保留も維持する。[収益loop](mercari-revenue-loop.md)に従う。

## RQ29 最低限のOS運用と公開条件を設定へまとめる

設定に安全な接続、通知の明示許可/試験、永続保存要求、PWA状態、確認付きHome設定初期化を追加する。診断JSONに本人content・token・Wallet・マイナンバーを含めず、初期化は許可済み外観だけを消す。

公開条件は日常操作から折り畳み、Web/PWA、QEMU、CDD/CTS/GMS、機種/BSP/復旧、production鍵、SBOM/OSS、地域/無線、特定個人情報を別gateで扱う。iPhone/iPadは置換OSではなくclient/Web profile。単一の審査や表示だけで全配布をreadyにしない。

## RQ30 公開最低条件を機械判定し、完了まで追跡する

本人限定/一般Web Preview、QEMU、物理Android、Apple client、マイナンバーを分け、必須gateと同一候補の証拠が揃った時だけreadyにする。`data/release-readiness.json`と[最低公開条件](release-minimum-gates.md)で宣言不一致・欠落・license未決・署名未実施・依存metadata不足・未審査機能を拒否する。

Web/npmのCycloneDX生成とnative inventoryのscopeを分け、大量生成物はGit外へ置く。ownerのlicense/鍵/公開/機器/flash/契約/法務を代行決定せず、先に実装・検証を固め、必要操作を具体化する。

## RQ31 QEMU配布候補を同一byte列の証拠へ固定する

版・source・archive名/size/hash、導入/復旧、inventory、Web表示を同じ候補へ固定する。安全基礎・更新/rollback・backup・bootは観測範囲だけ合格とする。targetとhost依存を分けたCycloneDX 1.6、legal bundle、manifestをarchiveへ結ぶ。

旧候補のSBOM比較を現候補のlicense clearanceにせず、QEMU十gateを`data/qemu-release-audit.json`とrelease-readinessで一致させる。製品license、production署名、署名後受入、公開は個別確認を残す。

## RQ32 完成版を正本と本人限定Webへ同一commitで収束する

main/branch/PR/Siteを比較し、保存互換・approval・Receipt・各gateを守る実装を統合する。Skyの接続済み能力をJennifer/Zemaへ渡し、依頼・方向修正・引数・一回承認・結果・停止を同じ仕事で扱う。live steering非対応なら修正は次回実行、停止は未使用承認を失効し、不明送信を再実行しない。

Sky引継ぎは同tabの一回券、Tool IDだけをURLに載せ、本文は対象Tool/期限へ結ぶ。browser eventは即時表示だけで本人jobを再照合する。必要stylesheetと全参照assetをbuild/archiveで検査し、Git sourceと配備sourceを合わせ実responseを読む。main merge・一般公開・金融・実機・特定個人情報の許可を統合から推測しない。

## RQ33 汎用PAPER市場と実績更新型の自律ファンド

型付きasset registryへ自動化・成果・service・商品・稼働枠を置き、PAPERだけを許可する。proposal/exact digest、24時間以内期限、注文/exposure上限へ本人承認を結び、immutable simulation Receipt・position・eventを本人別保存する。未知field・失効・重複・LIVEを拒否する。

fund/Tool数を固定せず、署名済み収益/実費とrun Receiptから純収益・失敗・観測return・構成案を30秒ごとに再計算する。原資/根拠なしは算定待ちで、手入力・PAPER・合成を実収益や将来利回りにしない。nativeも同じ複式台帳・予約/不明照合を持ち、外部注文・Wallet移動・再投資・料金先取りをしない。Polymarketはdesign参考/外部adapterと分け、LIVEはProvider・地域・custody・法務等の別gate。

## RQ34 外部Wallet／ファンドProviderを受け入れるOS境界

version付きmanifestで`custody / receive / payout / exchange / fund_catalog / subscribe / redeem / reporting`等の実能力、地域、料金、本人・契約を示す。Rockは発見・条件提示・exact同意・指図・署名Receipt・取消/不明/照合を持ち、未宣言機能を代行しない。

Providerがcustody・運用・注文/清算・価格・KYC/AML・税/法定帳票の正本を持つ。任意shell/key/直接台帳書込/包括送金を与えず、内製も例外にしない。合成→sandboxでschema/認証/冪等/失効/exportを受入し、実資金/LIVEは契約・地域・主体・原資・owner承認等が揃うまで無効。[Provider境界](external-wallet-fund-provider-boundary-20260913.md)を使う。

## RQ35 Rock First-party Settlement Walletを最初のProviderにする

`org.rockstar.settlement-wallet`を共通Financial Providerの最初の内製実装とし、`collect_platform_fee / reporting`だけでRock料金の債権・回収状態を記録する。利用者全資産のcustody、任意receive/payout/exchange、fund運用、秘密鍵や任意transferを持たない。

Earning Receiptからの対象料金はRQ20の現行保留を守る。旧上限等はsandbox回帰で保持し、内製専用の認証/照合迂回路を作らない。LIVEは主体・実受取先・契約・本人/受益者・税/会計・資格情報・sandbox・owner承認を別gateで受け入れる。[Settlement設計](rock-first-party-settlement-wallet-20260913.md)に従う。

## RQ36 Base Mainnet USDCの本番受取レールを接続する

外部EIP-1193 WalletでBase Mainnet、5分origin-bound所有署名によりRock受取先を登録する。秘密鍵・seed・transfer/token approvalを要求せず、owner初回登録と他人の上書き拒否を持つ。

Billing Workerは署名済み`SKY_SERVICE_FEE`と一意の指図/transaction hashを結び、公式USDC Transferの宛先・6桁換算額・成功receipt・finalized blockをexact照合する。未登録/待ち/不明/着金を分け、自動再送しない。RQ20保留を解除せず、利用者custody/payout/交換/税務へ拡張しない。source・配備・owner署名・実transferを別に記録する。[受取レール](rock-wallet-production-rail-20260913.md)を使う。

## RQ37 Rock StudioはSkyコードを既存ツールへ付けてTool化する

作者の既存ToolへSky SDKと短い組込codeを追加し、環境変数の開発者keyでTool Package・owner登録・宣言公開・MCP・fund候補・匿名利用記録を同じ定義から作る。source/file貼付を必須にしない。

registryへ`sky-tool-package/1`だけを送り、handler入力/出力・会話・key・source本文を保存しない。sideEffectsとauthorizeで危険/金融作用を個別承認し、再試行を制限する。宣言公開は署名・sandbox・審査の代わりではなく、失敗を登録完了にしない。

## RQ38 製品紹介を主役にし、Developer Preview導入を案内する

紹介は利用体験と製品構想を主役に、Mini・OS・LLM、SDK最小例、`/sky/publish`、Developer Preview/復旧へ導く。現行主商品はaccount serviceで、Mini購入を入口にしない。設計画像を実機写真と誤認させず、配布URL/署名のない候補をinstall可能にしない。

Home `/`を紹介に置換せず、既存機能/routeを残す。StudioはPackage登録と本文非送信を守り、公開・検証・導入の段階を分ける。

## RQ39 紹介ページとRock Studioのvisual systemを統一する

ブランド名・wordmark・太い見出し・monospace補助・境界・丸い主操作・読みやすさを共有する。作業chrome/Studioは黒と酸味のある黄緑、製品紹介は明るい外観という指定を両立する。SDK command、code copy、key発行、MCP確認をdesktop/mobileで使いやすくする。外観で本文非送信・登録/検証境界・Sky/導入導線を変えない。

## RQ40 RockstarOS全体のvisual systemとフロント機能性を改善する

共通shell/Home/紹介/Studioのfocus・主操作を揃え、contentは明るく可読性を優先し、機能・状態を隠さない。通信/電池をWebで推測せず、Home設定失敗で全体を壊さない。

dialogのEscape/外側click/閉じる、nested navigation、処理中disabled/accessibility、mobile横overflow防止・通常label13px以上を守る。装飾改善で金融・実行・CSV・保存・公開契約を変えない。

## RQ41 Local Action Assistantを物理Android OSのローカルLLMにする

上流commit/license/runtime/source hashをlockし、レビュー済みoverlayの署名限定Binder/Headless JS推論を導入する。固定package/同署名/API/component、payload/timeout/単一tool callを検査する。読取allowlistと変更proposal/別の本人確認を分ける。

arm64 APKは通信権限なし、hash/size検査後Soongへstageし、GGUFは同梱せずlicense/hash/RAM/速度/熱を確認してimportする。試験署名APK、emulator、Pixel offline推論・再起動の既存証拠は保持するが、正式OS image・production署名・SELinux boot・OTA/rollback/全損復旧を代替しない。[local runtime](local-ai-os-integration-20260915.md)と[実機証拠](evidence/android-pixel-10-gl066-local-ai-20260916.json)を使う。

## RQ42 OS Platform Coreへ登録・承認・Wallet・更新の安全境界を入れる

Tool/MCP/Providerをversioned Binderで登録し、導入APKのUID・版・証明書を照合、種別allowlistを強制する。runtime登録からSELinux domainを与えず、platform署名を第三者Toolへ流用しない。

変更/費用proposalをOS画面で本人credentialと一回承認へ結び、owner・generation・action・digest・上限・期限へ固定する。承認消費とWallet Receiptは同transaction。owner別追記/相殺台帳、request/Provider/取消unique、schema拒否、Keystore非export keyのAES-GCM backupを持つ。更新/rollbackは同identity/署名/API/schema互換を検査し、source試験をimage/実機受入へ換算しない。[Platform Core](platform-core.md)に従う。

## RQ43 正式製品名をRockstarOSへ戻し、内部識別子をdev.rockで固定する

正式製品名はRockstarOS、共通releaseはRockstarOS 1.0、内部は`dev.rock`。製品向け知能表記は小文字siとする。旧表示名を新UIへ使わず、package/permission、`org.rockstar`、schema/storage key、`@rockstaros`、URL、artifact、署名・backup domain等の互換識別子を一括renameしない。

OpenAI等の外部固有名、Git原本、hash、署名manifest、archive、証拠を改変しない。名称変更は鍵・release・実機/OTA合格ではない。[identity](../data/product-identity.json)と[表記契約](../data/product-terminology.json)を使う。

## RQ44 共通製品版を一元管理しminor・major更新を可能にする

`data/product-identity.json`の`1.0 / Developer Preview`を共通参照する。major.minorで互換追加はminor、非互換API/権限/schema/trust rootはmigration・backup/restore・rollback・端末/Tool/Provider互換を同一候補で受け入れてmajorへ進む。Device Support PackageのCore版範囲を宣言し、版変更だけで各release gateを合格にしない。

## RQ45 運営1名による緊急保護と限定保守アクセスを設ける

事前登録端末へ認定運営者1名が緊急のlock/lost mode、実行/OTA停止、session失効、接続隔離、非個人診断、最大15分保守を開始できる。端末がhardware operator署名、宛先、nonce、scope、時刻/期限を独立検証し、replay/未知commandを拒否する。offline即時実行は保証せず、初期化に最低30分取消猶予を持つ。

任意shell/root、私的本文、送金/承認、key抽出、録音/撮影、未署名code、Verified Boot/SELinux無効化を禁止する。LLM/Tool/MCPは緊急権を持たない。端末/運営に追記監査・利用者表示/通知を残し、production credential・StrongBox・Device Owner・実機/侵入/復旧を別受入にする。[incident契約](security-incident-response.md)を使う。

## RQ46 運営専用の端末管理画面と永続命令キューを実装する

Operator Dockを利用者Webと別配備/D1にし、Home/route/PWAへ管理入口を入れない。model/版/hardware/接続/監査を示し、事故IDと理由を必須にRQ45 commandだけを選ぶ。

全asset/APIをAccess JWTのissuer/audience/期限/単一subjectで保護し、命令をP-256 WebAuthnのRP/origin/challenge/本人flag/署名/counterへ固定する。未設定、他人/他端末/他origin、未検証identity、期限/replay/異payloadを拒否し、監査更新/削除をDBで禁止する。source/emulator成功を配備・端末到達にせず、hostname・専用D1・operator・credential・attestation・Device Owner・実機を別受入にする。

<a id="rq47-ai自動化チームの効率化から収益walletファンドゲームへ逆算する"></a>

## RQ47 si自動化チームの効率化から収益・Wallet・ファンド・ゲームへ逆算する

自分のsiチームの効率を継続改善し、便利さ・検証可能な収益機会・豊かさへつなぐ。OSは実現基盤、Pixelはreference、Wallet/fund/game/機器は接続層。一般phone機能・カメラ競争を1.0完成条件にしない。

offlineでplan検証・有限処理・確認待ち・保存を行い、非信頼LLMは閉じたschemaの候補だけを返す。接続時に案件・外部作用・納品・収益/Walletを重複なく照合する。一Toolの経済loopから複数Tool構成へ進み、月50万円は実収益/全費用を持つ長期目標で保証・将来利回りではない。税準備は記録/分類/集計/export/専門家確認まで、カテゴリ同意・保持/削除/撤回を持ち、本文/会話/写真/key/credential/位置を既定収集しない。

## RQ48 RockstarOS CoreでSky・便利機能・ゲームを接続して発展させる

Coreはcloud/local runtime、権限、記憶、仕事、停止/再開、Tool、Receipt、更新/rollback/復旧を共通化する。ローカルLLMは対応端末の追加能力で全機種必須ではない。主商品はaccount service、Jennifer窓口・Sky能力選択・Zema仕事契約へつなぐ。

便利機能、Game、IP/動画、VRを独立adapterとして発展させ、固有ProviderをOS imageへ直書きしない。IP/素材/権利/版→能力router→生成/配信/game→Asset Registry→品質/権利/費用/本人確認→公開/導入→Receipt/反応を同job/lineageへ結ぶ。`image.generate`、`video.generate`、`model3d.generate`、`voice.generate`、`asset.transform`、`game.asset.publish`、`game.experience.publish`、`social.publish`、`reward.grant`、`analytics.read`は別capability。Providerを固定せず、送信/保持/商用権利/価格/地域/取消/不明をmanifestで示す。

Asset ID、入力/生成条件、model/版、hash、権利、費用、Receipt、承認を保存し、Tool成功を公開・売上・権利取得へ昇格させない。Pixel上のoffline一周・交換可能model・OS搭載は同一imageで受入し、APK証拠と分ける。Jev/local planner/OpenAI接続二Tool/Broker authorityも別に扱う。[native設計](ai-native-os-architecture.md)、[LLM境界](llm-evaluation-architecture.md)、[全Tool詳細](sky-tools-complete-design.md)に従う。

## RQ49 物質同士を組み合わせて発明候補を作るMaterial Invention Coreを設ける

物質・配合・順序・温度/圧力/雰囲気・加工/時間を型付きで組み、目的特性に対する材料/用途/工程候補を作る。由来・単位・不確かさ・根拠・model/版/作者を保持し、si文章を発明実証にしない。

目的→物質→候補→SDS/危険/法規/設備screening→simulation/既知比較→本人承認→資格ある外部ラボ→署名測定Receipt→順位/版更新を通す。不足時は物理実行へ進めず、無人危険合成・simulationからの性能/安全断定・専門家代替・IP無断共有をしない。Coreはprovenance/権限/再現/rollback、Skyは計算/DB/装置/ラボadapter、Zemaは仕事を持つ。[Material設計](material-invention-core.md)に従う。

四方向sensor・Invention Volume・物質digital twin・差分再計算・VR/ARは研究profileとして保持し、現在のMini R5製品profileと混同しない。操作・si提案・simulation・文献・実験を分けてPatent siへ発明開示/先行技術/専門家packetを渡す。gestureやcameraを実験/共有/出願承認にせず、特許性・侵害・発明者/帰属・支払/出願を自動確定しない。[XR契約](material-invention-xr.md)を使う。

## RQ50 使われていないスマートフォンの計算余力をSkyで仲介する

CapacityOffer、ComputeOrder、短命ComputeLeaseで余剰端末と固定workloadをmatchingする。capability、hash、benchmark、availability、粗い地域、trust、price/data policy、期限/予算/検証条件をhard filterし、ownerの使用を優先する。

初期供給はAndroid arm64、充電/idle/unmetered/thermal none-light、初期処理は公開/合成textの固定embeddingのみ。任意code/shell/root、秘密/個人情報/credential/会話/写真を配らず、owner identity/正確な位置を買い手へ開示しない。iOSを供給合格にしない。

CPU時間ではなくverified Compute Lotで計量し、入力/出力hash・環境・期限を独立参照または別lease quorumで検証する。未検証/timeout不明/重複を収益にせず、test credit hold previewと実資金を分ける。実端末dispatch/storage/課金/払出し/attestation/法務/通信/fraudは各gate前に有効化せず、無承認cloud fallbackをしない。[Grid正本](sky-compute-grid.md)を使う。

## 現在の未受入gateと再開条件

- **サービスの一周** — 同じ公開source/artifactで本人が文章素材→処理→検査→review→download完了→再取得→レシピ再利用を通す。既存compositionの実装/host受入と、本番本人認証・実downloadを分ける。
- **横断runtime** — realm/owner/root/leaf/delegation/artifact相関、親取消fence、account期間/Goal予算、価格/pass snapshotと後払い、真正reviewer証拠、context grant、削除journal/鍵喪失復旧、authority epochを既存fixtureで受け入れる。設計7冊の整合を実装完了にしない。
- **料金・外部契約** — Stripe/Providerのsandbox、見積/meter/invoice、請求/返金/払出し、再販規約、通信・本人確認・資金決済・特商法・無線等の確認を完了する。consumer eSIMは商品設計を再開したが実発行は未受入。888料金保留、Game/LIVEと有料cloudの個別無効gateを維持する。
- **Pixel全OS** — Pixel 10 GL066 / frankel、署名検証済みsource `2026100200`、専用x86_64 Linux、build予算/アカウントを固定する。試験署名APKの非破壊実再起動23/23は[既存証拠](evidence/android-pixel-10-prefull-physical-20260916.json)だけの受入。全OS build、正式鍵、初回flash四gate、同じimageのboot/保存/OTA/純正復旧、data/Keystore全損復元は未完了。[phone計画](phone-preview-20260911.md)を使う。
- **QEMU/配布** — RQ12の独立Developer Previewを保持し、同archiveの署名・fresh導入・更新/rollback/backup/削除・license受入を行う。Pixel/APK/他候補のPASSを転用しない。
- **Mini/Pro** — R5の単独ゲーム/保存/停止、光学/入力/熱/給電/安全/製造、任意LTE、ProのNVIDIA閉箱BOM/QVL/si/game/熱/復旧を別受入。実機・販売・予約/決済を文書保存で開始しない。
- **Game/発明/rocketstar** — 非金融Game/作者SDK/合成digital twinは金融完成を待たず開発する。実交換・原資・公式game/API/rate、ラボ実験、管制/製造/飛行は個別gate。GTA VIは正規client/実行機器/title版を固定し、未確認PC版やMini性能から対応を推定しない。
- **Gitと公開** — 本書・baseline JSON・設計index・進捗を同じ変更へ同期し、`npm run design:check`と`npm run verify`を通す。GitHub保存・main統合・Sites配備・実responseを別記録。古いsnapshotや取得失敗を最新確認済みにしない。

8原則による優先順位とpilot指標は[1.0 strategy](rockstaros-1.0-strategy.md)の検証仮説であり、需要・独占・市場首位・収益を保証しない。次の担当は[作業入口](workstreams/README.md)と[責任分界](workstreams/00-responsibility-boundaries.md)から既存taskと検証条件を選び、[最新prompt](prompts/rock-current-next-20261002.md)を最新Gitに照合して再開する。

## 2026-10-15 Mini着脱・衛星Wi-FiとAgent月次請求

利用者が建築/家具へ埋め込む着脱Mini、衛星WANによる携帯Wi-Fi、携帯料金に近いAgent利用の月次後払いを明示。R5の1本自律を維持し、外部給電のみの前提を設置中給電＋携帯電源へ更新。battery部品・衛星方式・料金数値は未確定。未払い時は通知/異議/有料実行制限/適法な回収で扱い、OSに銀行口座凍結権を与えない。[統合設計](service-design/08-mini-connectivity-and-billing.md)。

2026-10-17追加指示: 無料Cloudの402待機時間を表示し、無料枠回復後に自動続行する。生成前拒否の確認・同一ID/CAS・本人同意・有限回数/期限を条件とし、結果不明の再送と本番課金は無効。[実装契約](llm-evaluation-architecture.md#無料cloudの待機と自動続行2026-10-17)。


2026-10-17の明示指示: 無料Cloudは画面を閉じても待機・自動続行し、再訪で結果確認。本人同意を永続保存、同ID/CASで二重実行を防止、実アカウントのSandbox請求不変を検証。本番課金はしない。従来の画面内限定を更新する。仕様はdocs/llm-evaluation-architecture.mdの画面外継続。
