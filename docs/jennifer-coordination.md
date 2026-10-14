# Jennifer Coordination

更新: 2026-10-14

## 現在の実装と到達契約の読み分け

PR #113のsourceはmain `01d2e418`へ統合済み。この更新では、保存即承認とowner手動booleanによる検収を廃止し、AMC APIが認証済みA2A worker／reviewer artifact、usage Receipt、owner、Goal revision、leaf、delegation、成果hashをserverで横断照合する。reviewerはworkerと異なるprincipal、同じpredecessor委任、正確なworker report digestへ結び付け、ブラウザのactor名や合否文字列から「検収済み」と推測しない。

8projectは内部開発/運営portfolioで、一般顧客tenantの権限ではない。Jenniferは会話窓口で、Sky直接操作やhost appの有限処理に会話を必須にしない。現行のparent別費用gateはaccount月/Goal全体の階層予算を保証せず、後払い・署名見積・Provider設定の未受入条件も省略しない。外部Provider送信はoperator flag、暗号化鍵、信頼鍵、allowlist、見積、Broker証明、owner個別承認が揃うまで無効である。課金を有効にする前に、[横断整合契約と12受入](service-design/06-consistency-contracts.md)の予算・価格・保存/復旧を対象実装で受け入れる。

Jenniferは利用者が常に話す、Rockstar全体のプロジェクト統括窓口である。ZemaはJenniferの裏で依頼、進捗、承認、停止、成果物、利用額、Receipt、履歴を管理する仕事systemであり、競合する別人格として前面へ出さない。Jenniferは権限主体ではなく、Brokerと既存の実行境界を越えない。保存、承認、実行、検収、最終受入は別操作である。

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

Jenniferは依頼をGoal、意図、対象、対象外、成功条件、仮定、未決事項へ言語化する。本人確認前の状態は`draft`であり、保存しても承認やdispatchは起きない。COLOMBIAの未決事項は一件ずつ回答するか、理由を書いて延期しなければGoal Contractを承認できない。Zema内AMCはそのGoalから逆算し、`Goal → milestone → work package → task → step`の方向で分解する。現在のWebはmilestone、domain別work package、leaf taskを生成し、最大depth 5、1親12子、100 nodeを上限とする。初回は既存資産を確認するinventory leaf一件だけを開き、全Goalで外部委任を同時一件に制限する。inventoryの型付き報告を別Agentが検収し、ownerがdelivery段階を承認した後だけ残りのleafを依存順に開く。domainを「backendを実装する」の一件で止めず、少なくとも契約確定、実装、専門検証へ分ける。各leafには専門担当、依存、参照するcode／data／docs、変更候補path、返却物、合格条件を付ける。担当profileは必要時だけ起動し、直接Jenniferへ完了報告せず、ZemaへTaskReport、artifact、evidence、Receiptを戻す。

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

1. `https://columbia.avoado.si/chat`を開く。通常はJennifer専用passkeyと端末のロック解除で本人領域へ入る。最初の登録または端末紛失時だけ「本人用データを引き継いで設定」から既存Sites accountを一度照合する。復旧登録が成功すると以前のJennifer passkeyとsessionはすべて失効する。
2. Jenniferを開き、担当を「自動で選ぶ」にする。
3. 「管理するプロジェクト」から8件のprojectまたは「全体・自動判定」を選ぶ。
4. 複数工程を先に確認したい場合は「計画を整理」を有効にする。
5. 目的、使ってよい資料、必要な調査、欲しい成果物を一つの依頼として送る。
6. 「Goal Contract」と「Zema内AMCの逆算分解」で、Goal、専門担当、依存、参照context、変更path、期待成果、合格条件を確認する。
7. 「草案をZemaへ保存」を押すと、再試行安全なAMC draftとplan revision 1が同じD1 batchでowner本人の台帳へ保存される。片方だけは残らず、保存だけでは`approve_plan`を発行しない。
8. COLOMBIAの各未決事項へ回答または延期理由を入力し、「Goal Contractを承認」を押す。これでinventoryだけが`ready`になる。
9. inventoryを「担当siへ実行準備」でCloud Agent Workbenchへ移す。署名済み見積、Broker証明、予算上限を確認して本人が承認すると、Zema runtimeが実A2A `SendMessage`を一度だけ行う。曖昧な応答を自動再送しない。
10. 担当siのartifactとProvider署名済みusage ReceiptをZemaが照合し、`TaskReport`をサーバー生成する。別principalのreviewerはそのworker委任とreport digestに結び付いた型付き判定を返す。ブラウザの合否文字列ではleafを完了できない。
11. inventory検収後にownerがdelivery段階を承認すると、残りのleafを依存順・同時一件で実行できる。全leaf完了後もJenniferの`GoalReceipt`付き最終報告をownerが受け入れるまでGoalは受入済みにならない。
12. 一時停止は新規dispatchを止め、再開は停止前の段階だけへ戻る。「停止」はさらに実行中委任へ取消要求を送る。計画変更は停止後、実行中／停止未確認がゼロのときだけ新revisionとして保存し、旧承認を無効にする。

公開説明画面は認証なしで読めるが、JenniferのGoal整理とAMC分解はprivate project contextを扱うためJennifer Accessの後に利用する。Tool実行、Job、ReceiptはさらにZemaの接続・権限・承認を確認する。生成された長い計画は会話欄内で縮まず、そのままスクロールして全taskを確認できる。

直接ToolまたはMCP Botを選んだ依頼は、Jenniferが利用者窓口のまま既存Zema経路へ渡す。計画依頼は単一Toolへ自動で誤ルーティングしない。

## データと保存

- 既定のデータアクセスは`none`。計画中の「本人の選択データ」は、実行時に本人が対象を指定することを意味し、Jenniferが全データを読めることを意味しない。
- 未保存の会話previewは既存Zema session境界を使う。Zemaへ保存したJennifer Goalは`work_jobs`、`jennifer_plan_revisions`、`jennifer_task_attempts`へowner別に永続化し、別browser／deviceでも再構成する。計画変更は親digestとsemantic diffを持つ新revisionにし、旧版を`superseded`にする。
- Jennifer Accessは`jennifer_passkey_challenges`、`jennifer_passkey_credentials`、`jennifer_passkey_sessions`、`jennifer_passkey_events`へchallenge、server検証済みcredential、hash化session、登録／復旧auditをowner別に保存する。RPとoriginは`columbia.avoado.si`へ固定し、Sites accountは初回登録と復旧だけに使う。native端末sessionとは混在させない。
- 計画schemaは未知field、権限昇格、未知の担当・effect、前工程を参照しない依存を拒否する。approval token、credential、秘密鍵、成果物本文は計画schemaに持たせない。
- project一覧と担当siはGit管理する。taskの状態は既存`data/project-status.json`と`data/mission-control.json`を使い、Jennifer専用の重複台帳を作らない。
- credential、秘密鍵、artifact本文は計画台帳へ保存しない。A2A入力とartifactは既存暗号化保存、署名Receipt、owner bindingを使う。

## 実dispatchとReceipt契約

Webの実行経路は `Jennifer proposal → durable draft → COLOMBIA解決 → owner inventory承認 → inventory worker → server TaskReport → workerに結び付いた独立reviewer → owner delivery承認 → leaf単位のCloud Agent job → 見積 → Broker証明 → owner承認 → Zema runtime → A2A Agent → 暗号化artifact／署名済みReceipt → server ReviewReport → Jennifer GoalReceipt付き統合報告 → owner最終受入` である。

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
- 保存と承認の分離、COLOMBIA未解決時のfail-closed、inventory／delivery二段階承認
- D1の版付きplan、semantic diff、task attempt台帳と別端末からの復元
- plan状態とAMC Goalを同じD1 batchで更新するrevision guard
- 決定的dispatch key、全Goal同時一件、同一task／role／revisionの重複attempt拒否
- worker委任、artifact hash、署名済みusage Receiptへ結び付くサーバー生成TaskReport
- workerと異なるprincipal、predecessor委任、worker report digestへ結び付く型付きReviewReport
- 通貨別の見積・上限・予約・暫定meter・精算・不明件数、pause／stop／resume／revision UI。stopの取消要求は一件ごとに再試行でき、失敗対象を成功表示せず残す

配備・入力待ち:

- COLOMBIA原本のsource reference、version、content hashと適用原則
- owner-scoped context grantとartifact referenceの細粒度選択UI
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
