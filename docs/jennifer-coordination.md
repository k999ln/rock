# Jennifer Coordination

更新: 2026-10-13

## 現在の実装と到達契約の読み分け

PR #113のsourceはmain `01d2e418`へ統合済み。以下の役割・画面・fixtureは存在するが、真正な独立reviewの本番受入は未完了である。現在のWorkbench検収はownerの手動booleanで、AMC APIは認証済みA2A reviewer artifact / usageとowner・Goal revision・leaf・delegation・成果hashをserverで横断照合していない。別reviewer名や別delegationの存在から「検収済み」と推測せず、manual verdictとverified independent reviewを分ける。

8projectは内部開発/運営portfolioで、一般顧客tenantの権限ではない。Jenniferは会話窓口で、Sky直接操作やhost appの有限処理に会話を必須にしない。現行のparent別費用gateはaccount月/Goal全体の階層予算を保証せず、後払い・署名見積・Provider設定の未受入条件も省略しない。実dispatch/課金を有効にする前に、[横断整合契約と12受入](service-design/06-consistency-contracts.md)のserver相関・取消・予算・価格・真正review・保存/復旧を対象実装で受け入れる。

Jenniferは利用者が常に話す、Rockstar全体のプロジェクト統括窓口である。ZemaはJenniferの裏で依頼、進捗、承認、停止、成果物、利用額、Receipt、履歴を管理する仕事systemであり、競合する別人格として前面へ出さない。Jenniferは権限主体ではなく、Brokerと既存の実行境界を越えない。

## 責任分界

| 主体 | 責務 |
| --- | --- |
| Sky | Tool、A2A Agent、利用条件の発見と接続 |
| Jennifer | COLOMBIAとproject正本を参照したGoalの言語化、プロジェクト選択、担当siの割当、確認待ち、成果受領の統括 |
| プロジェクト担当si | 一つのプロジェクトの正本、進捗、依存、合格証拠を確認し、必要な作業担当を束ねる |
| Zema | Job／Task／Run、進捗、承認表示、停止、成果物、費用、Receipt、履歴 |
| Zema内AMC | 確認済みGoalから逆算し、依存付きのmilestone、work package、task、stepへ分解して専門担当へ割り当てる |
| 専門担当si | 一つのleaf taskだけを実行し、成果と証拠をZemaへ提出する。自分の成果を受入済みにしない |
| Broker / Platform Core | owner、権限、費用、入力digest、期限、失効の強制 |
| Tool / A2A Agent / AMC | 許可済みの個別作業とReceiptの生成 |

プロジェクト台帳は[`data/jennifer-projects.json`](../data/jennifer-projects.json)で、現時点ではRockstarOS、Hardware、rocketstar、Jennifer / Zema、AMC、Spider Security、Business / Wallet、Governance / Releaseの8件を持つ。各projectは`managerAgentId`を一つ持つ。担当siは常時稼働processや独自credentialではなく、依頼時に起動する論理的な責任者profileである。

WebのJennifer計画は常に`authority: advisory-only`、`status: proposed`である。計画を作っただけでは、データ閲覧、Tool実行、A2A dispatch、費用予約、外部送信、Job完了を行わない。各工程の実行は既存のTool、A2A、AMCとBrokerの見積・承認・Receipt契約を通す。

## COLOMBIAとGoal Contract

COLOMBIAはJenniferが曖昧な依頼をGoalへ変換するときに参照する上位contextとして[`data/jennifer-knowledge.json`](../data/jennifer-knowledge.json)へ登録した。現repositoryにはCOLOMBIAの原本、URL、file、versionがないため、状態は`awaiting-source`である。内容を名称から推測せず、Goalへ適用したとは表示しない。原本を受領した後はsource reference、version、content hashを固定し、どの原則をGoalへ適用したか追跡する。COLOMBIAは知識であり、実行権限、本人承認、完成証拠ではない。

Jenniferは依頼をGoal、意図、対象、対象外、成功条件、仮定、未決事項へ言語化する。本人確認前の状態は`draft`である。Zema内AMCはそのGoalから逆算し、`Goal → milestone → work package → task → step`の方向で分解する。現在のWeb previewはmilestone、domain別work package、leaf taskを生成し、最大depth 5、1親12子、100 node、初回実行候補8 leafの上限を保持する。domainを「backendを実装する」の一件で止めず、少なくとも契約確定、実装、専門検証へ分ける。各leafには専門担当、依存、参照するcode／data／docs、変更候補path、返却物、合格条件を付ける。担当profileは必要時だけ起動し、直接Jenniferへ完了報告せず、ZemaへTaskReport、artifact、evidence、Receiptを戻す。

Jenniferは`approve_plan`、dispatch、repository write、公開、課金を自動実行しない。専門担当の報告は`submitted`相当であり、別担当の証拠検収とownerのGoal受入まで`done`にしない。

## 今すぐCodexで使う

このrepositoryをCodexで開き、次のどちらかでJenniferを呼ぶ。

```text
$jennifer-project-manager RockstarOSの現在地を確認して、次の1件を担当siへ割り振って
Jennifer、Hardwareプロジェクトの未完了と依存を確認して、今日進める1件を実装して
```

repo-local skillは[`.codex/skills/jennifer-project-manager/SKILL.md`](../.codex/skills/jennifer-project-manager/SKILL.md)である。新しいCodex chatでrepositoryを開くと自動検出される。まず次のread-only CLIで実台帳を確認する。

```sh
npm run jennifer:projects -- overview
npm run jennifer:projects -- project spider-security
npm run jennifer:projects -- map
```

CLIは`data/project-status.json`をprojectへ集計するだけで、Agent起動、Job変更、`done`判定はしない。実装依頼ではJennifer skillが対象project、担当si、Goal、変更範囲、合格検査を固定し、必要なときだけboundedなsubagentを起動する。Git、既存進捗台帳、現物の差分と試験が永続的な正本である。

## Web Previewでの使い方

1. Jenniferを開き、担当を「自動で選ぶ」にする。
2. 「管理するプロジェクト」から8件のprojectまたは「全体・自動判定」を選ぶ。
3. 複数工程を先に確認したい場合は「計画を整理」を有効にする。
4. 目的、使ってよい資料、必要な調査、欲しい成果物を一つの依頼として送る。
5. 「Goal Contract」と「Zema内AMCの逆算分解」で、Goal、専門担当、依存、参照context、変更path、期待成果、合格条件を確認する。
6. 「Goalを確認してZemaへ保存」を押すと、同じGoal IDを使った再試行安全なAMC Goalがowner本人の台帳へ保存される。保存前には外部送信しない。
7. `ready`になったleafだけを「担当siへ実行準備」で一件ずつCloud Agent Workbenchへ移す。担当siと独立reviewerは別delegation、別Receiptである。
8. Workbenchで署名済み見積、Broker証明、予算上限を確認して本人が承認すると、Zema runtimeが実A2A `SendMessage`を一度だけ行う。曖昧な応答を自動再送しない。
9. 到達契約では、担当siのartifactとProvider署名済みusage ReceiptをZemaが保存し、認証済み別reviewerの成果・合否をserverで相関照合した後だけleafをverified review済みにする。現行Workbenchの`done`はowner手動検収の記録で、この真正reviewの保証ではない。全leaf完了後もJenniferの最終報告を本人が受け入れるまでGoalは受入済みにならない。

JenniferのGoal整理とAMC分解は端末内のplan-only機能なので、実行serviceへ未接続・未認証でも利用できる。画面上部に接続状態を表示し、Tool実行、Job、ReceiptだけはZemaの接続確認後に利用する。生成された長い計画は会話欄内で縮まず、そのままスクロールして全taskを確認できる。

直接ToolまたはMCP Botを選んだ依頼は、Jenniferが利用者窓口のまま既存Zema経路へ渡す。計画依頼は単一Toolへ自動で誤ルーティングしない。

## データと保存

- 既定のデータアクセスは`none`。計画中の「本人の選択データ」は、実行時に本人が対象を指定することを意味し、Jenniferが全データを読めることを意味しない。
- 計画は既存Zema sessionと同じ`sessionStorage`へ保存する。最大8 session、24 message、10分TTLの境界を維持し、独自DBや長期memoryは作らない。
- 計画schemaは未知field、権限昇格、未知の担当・effect、前工程を参照しない依存を拒否する。approval token、credential、秘密鍵、成果物本文は計画schemaに持たせない。
- project一覧と担当siはGit管理する。taskの状態は既存`data/project-status.json`と`data/mission-control.json`を使い、Jennifer専用の重複台帳を作らない。
- 長期Goalへ昇格する場合はJennifer独自保存を追加せず、本人確認後に既存AMCへdraftとして渡す。

## 実dispatchとReceipt契約

Webの実行経路は `Jennifer proposal → owner確認済みAMC Goal → leaf単位のCloud Agent job → 見積 → Broker証明 → owner承認 → Zema runtime → A2A Agent → 暗号化artifact／署名済みReceipt → 独立reviewer → Jennifer統合報告` である。

Zema runtimeは1分ごとのbounded workerで、送信直前に接続済みAgent Cardのhash、公開HTTPS origin allowlist、暗号化本文digest、Broker署名と期限、Provider署名済み見積、親予算とleaf予約、任意のSky Package runtime bindingを再照合する。`SendMessage`の前にone-shot stateを永続化し、送信後の切断・5xx・不正応答は`indeterminate`として保持する。同じmessageを自動再送しない。remote taskは`GetTask`で再照合し、取消は一回だけ`CancelTask`へ送り、確認できなければ`cancel_unconfirmed`のまま残す。

text artifactだけを32 KiB以下の正規化documentにして暗号化保存する。file URIや外部bytesを自動取得しない。usage Receiptはtask metadataの`org.rockstar.a2a-usage-receipt.v1`または署名検証付きcallbackで受け、owner、親job、delegation、remote task、Agent、pricing version、通貨、capを一致させてから予約をsettleする。remote完了、artifact受領、Receipt精算、独立review、owner最終受入は別状態である。

実Providerへ送るには、runtimeを同じD1へ配備し、`A2A_DELEGATION_EXECUTION_ENABLED=true`、暗号化鍵、Broker／Provider信頼鍵、価格extension、許可originをoperatorが設定し、利用者が接続済みAgentを選び、各leafを明示承認する必要がある。repository内で経路が実装済みでも、Provider設定や配備のない環境を「実行済み」と表示しない。

## 現在の実装範囲

実装済み:

- 決定論的でboundedなplan-only schema
- Goal Contractと、Zema内AMCによるdomain-awareな逆算分解
- frontend、backend、data、security、payment、agentなど必要な専門担当profileのleaf割当
- COLOMBIAのversion付きknowledge接続口。原本未登録を`awaiting-source`として明示
- code／data／docsの参照、変更許可path、期待成果、合格条件を持つ最大100 taskの開発graph
- project lead / data librarian / research / analysis / deliveryの工程候補
- 既存Agent Control Planeと共通のdata class、危険effectの分類
- 8projectと各project一つの担当si profile、task prefixの一意な対応
- Codexで使うrepo-local Jennifer skillとread-only portfolio CLI
- Jenniferを表にしたWeb、project picker、計画カード、Zema session復元、再編集
- 単一Tool routingとの分離、権限境界と未完了表示
- pathと固定keywordで検査深度を上げるmetadata-only Spider risk plan
- owner確認から既存AMC Goalへの永続化、依存順leaf状態、per-leaf Cloud Agent job相関
- 担当siと独立reviewerへの別A2A delegation、Broker／Wallet／見積の明示gate
- one-shot SendMessage、GetTask／CancelTask再照合、暗号化artifact回収、署名済みReceipt精算を行うZema runtime
- remote完了だけでは受入にしないAMC提出／検収と、Jenniferの決定論的な最終統合報告

配備・入力待ち:

- COLOMBIA原本のsource reference、version、content hashと適用原則
- owner-scoped context grantとartifact referenceの選択UI
- native Zemaへの同等UI
- production runtimeのD1 binding、secret／trust key、実Provider、callback公開URLの設定と外部受入

したがって、Webからowner確認済みleafを実dispatchできる実装になったが、project pickerだけで複数Agentが無承認に自律実行するわけではない。「全情報を管理済み」「常時監視中」「Provider受入済み」を示すものでもない。

## 検証

対象の最小回帰:

```sh
node --experimental-strip-types --test \
  tests/jennifer-coordination.test.mjs \
  tests/jennifer-amc-execution.test.mjs \
  tests/jennifer-projects.test.mjs \
  tests/zema-chat-session.test.mjs \
  tests/sky-zema-contract.test.mjs \
  tests/sky-zema-handoff.test.mjs \
  tests/web-route-style-contract.test.mjs
npm run jennifer:projects -- overview
npm run spider:plan -- --changed
npm run typecheck
npm run sky:agent-runtime:check
npx oxlint lib/jennifer-coordination.ts lib/jennifer-projects.ts lib/zema-chat-session.ts components/sky-chat-workspace.tsx scripts/jennifer-projects.mjs scripts/spider-risk-plan.mjs toolkits/spider-guard/risk-policy.mjs
```

全体`npm run verify`と配備済みreadbackは別のrelease gateである。
