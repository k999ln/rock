# Sky専用AMCの取り込みとローンチ判定

## 2026-10-05 mainへの統合範囲

本人の「mainにあげて」により、AMCの画面・API・Goal reducer・ローカルCLI・3役定義・fixture自律ループを最新mainへ統合する。Sky/Zema全体の旧ルート移行、ライブラリDB migration、CSV修正、接続画面の別変更はこの統合に含めない。会話は現在のmainの `/chat`、仕事は `/work`、AMCは `/zema/amc`、発見は `/sky/marketplace` を使う。

Sky計画原本の参照先には、今回含めないルート移行・ライブラリ・OSポリシーの5ファイルがある。`data/amc/integration-input-status.json`に明示し、画面にも未統合と表示する。実行時の`observeSkyTask`は該当任務をRequired source unavailableで拒否する。原本や正式Goalの条件を変更して実行可にしない。

mainの既存WorkPlanとCloud Agentの検収・署名見積チェックを保持する。AMCの専用APIでも新規保存時に既存Zemaのservice entitlement判定を通す。Goal正本r46、実行枠、正式受入は変更しない。

2026-10-04の実起動はCLIの永続フォルダ信頼確認で終了し、実行部隊と独立検収は未起動。設定・fixtureの試験合格を実モデル完走・Web同期・本番受入へ換算しない。下記の以前のルート・候補・ローカル検証記録は履歴であり、この統合で未採用の変更も含む。


## Codex用AMCエージェント

2026-10-02の本人指示「これエージェント化して」により、まずこのプロジェクトのCodexから呼び出せるAMCエージェントを追加した。正本は `data/amc/agent-definitions.json`。`amc` はGoal/意図/任務分割/部隊/成果回収を担当し、`amc-worker` は指定範囲を実行、`amc-reviewer` は読み取り専用で独立照合する。保存済みGoalの認証・実行枠・正式検収をプロンプトの自己申告で置き換えない。

`npm run amc:agent -- install` はprojectの `.codex/agents/` へ3役のTOMLを生成する。既存の異なる内容とsymlinkを拒否し、モデル/認証/global設定は変更しない。現在のチャットのworkspace rootにも同じ生成物を登録した。Codexで「AMCで、○○をGoalにして進めて」と依頼するか、`npm run amc:agent -- run --goal '○○'` で通常の対話Codexを開始する。`--preview` は起動引数だけを表示する。利用者のGoalをshellへ展開せず、既存のCLIのモデル・承認設定を使う（このチャットの一時的な設定とは同期しない）。カスタムエージェントのモデルは親セッションから継承する。

別チャットの `amc-autonomy.mjs` / `amc-autonomy-store.mjs` / `amc-autonomy-fixture.mjs` と3つの回帰試験をhash一致で取り込んだ。出典は `data/amc/agent-runtime-source.json`。これらはfixture専用の制約を保持する。実Codexをfixtureへ偽装接続せず、ネイティブCodexの委任を使う役割定義と、Web用の実行サービスの完成を区別する。新たな永続実行台帳は追加しない。

合格条件は、役割定義の構文、literal Goal引数、既存設定の保持、重複インストール、symlink拒否、既存自律ループの回帰。実ユーザーGoalの自律完走・Web起動/同期・公開は未受入。定義を利用可能な新規セッションで呼び出す。既存セッションの自動再読込は環境依存。[利用と復旧](../toolkits/amc-agent/README.md)。

## Goalを維持する司令部と並列部隊

2026-10-02の本人指示により、AMCの主画面は「Goal → 司令部 → 部隊 → 成果の検収」とする。簡略化は指示と確認の手数を減らすことであり、軍隊型の指揮系統を手動ToDoへ置き換えない。各部隊が同じGoal・意図・禁止事項・完了条件を参照して独立した任務を同時進行する。主担当は ROCK / WEB04。

`components/amc-command-center.tsx` は現在選択したGoalの方針、編成、着手記録/設定枠、検収待ち、検収済み任務と着手候補を表示する。未保存のSky原本と本人の保存記録を区別し、一般依頼の入力中にSkyのGoalを表示しない。部隊名を表示し、任務から詳細へ移動する。既存Goalの認証・revision CAS・独立検収を維持する。画面の記録は実プロセスの稼働確認ではない。

### ローカルの並列実行

`scripts/amc-parallel.mjs` は既存reducer/指示照合/Codex CLIを使い、承認済みGoalのready任務を一回の並列実行に渡す。本人がGoalの外部送信を明示するCLI経路であり、Webの閲覧・保存では起動しない。入力はGoal JSON、原本repository、任務IDと隔離Git作業場所の対応JSON、新しい出力先。`maxParallel` は承認済みGoalから読み、既存の保存Goalや部隊数を変更しない。

```sh
npm run amc:parallel -- --goal /path/goal.json --repo /path/source --workspaces /path/workspaces.json --out /path/new-run --allow-codex-upload
```

`workspaces.json` は `{"TASK-ID":"/path/isolated-checkout"}` の形式。事前に独立したGit作業場所を用意し、追跡ファイルと非ignoreファイルの内容が原本と一致することを検査する。原本や他部隊と親子関係のある作業場所、共有作業場所、symlinkを拒否する。作業場所の自動作成・統合は未接続。

- Goalの依存検収・保留・実行枠・成果物path排他に加え、Skyの指示仕様と共有契約の読取/書込path競合を照合する。競合任務は後続へ残す。既にrunning/submittedの任務があれば、先に照合が必要として新規waveを拒否する。
- 一つの司令部が着手と提出を順番に最新revisionへ反映し、実作業だけを同時実行する。別部隊の結果や指示IDを上書きしない。汎用Goalでは宣言済み成果物だけを編集範囲とする。Skyでは既存の信頼観測・実行者別directiveを経由し、Webの自己申告制限を迂回しない。
- 全部隊へ同じGoal原本hash、意図、規則、完了条件、対象任務と編集範囲を渡す。原本Goal/コードの変化を既定1秒間隔と提出直前に照合し、変化や失敗・範囲外編集でwave全体をpause、子プロセスへ停止を通知する。Codex子プロセスはTERM後5秒でKILLする。意味的な方向性の正しさをLLMだけで保証する機能ではない。
- `goal-rN.json`、`latest-goal.json`、部隊別prompt/report/run-result、`wave-result.json`を保存する。元のGoalは変更しない。提出結果は隔離作業場所の成果で、原本へ統合済み・検収済み・一般公開可能とはしない。検収者はwave-resultの作業場所と同一成果を参照する。
- 二重起動を防ぐclaimを元Goalの隣に排他的に作成し、成功/停止/異常終了でも保持する。停止後はclaimと保存revision、残ったプロセス、部隊成果を照合し、最新Goalから復旧する。同じJSONを別の出力先で再実行する操作も拒否する。別名にコピーしたGoalや別runnerまでを束ねるサービス全体のleaseは未実装。

合格条件は、独立した2部隊の同時稼働、結果の一元保存、設定枠と依存の遵守、Goal/原本変更での停止、範囲外変更での停止、共有作業場所/二重起動の拒否、Sky担当者別指示の照合、独立検収前にdone/acceptedにならないこと。ローカルfixtureで検証し、実Codex・Web連動・本番受入に換算しない。

残作業は、Webとローカルrunnerの本人認証付き接続、作業場所の準備、稼働/停止/結果の自動同期、独立検収と原本への統合後に次の任務へ進む循環である。保存済みSky Goal r46の`maxParallel=1`、履歴と受入は維持する。初期部隊数を決める場合も新規計画の設定として扱い、既存実行Goalへ無断適用しない。

### 既存の自律ループとの統合先

本人が指定したチャット「AMCの自律実行を整備」（01a0fe25-2ce9-73ad-99c2-1c8864d7a035）の実装を2026-10-02に照合した。保存場所は `/Users/kaiya/Documents/Codex/2026-10-02/task/work/rock`。`scripts/amc-autonomy.mjs` と `amc-autonomy-store.mjs` に、Goal契約の固定、永続化/CAS/排他、停止/取消/再開、有限retry、独立検収後に次の任務へ進むfixture用の循環が存在する。現在は `readyTaskIds[0]` を1件ずつ処理するため、同時進行の実装とは区別する。

AMC全体の継続制御はこの既存自律ループを再利用し、本変更の並列処理をworker接続候補とする。両者の保存/停止/claim管理を本番の二重正本にしない。統合時は単一のoperation台帳、複数in-flight状態、子プロセス停止、全Goalの共有排他、独立reviewerとSky信頼観測を一つのadapter境界で照合する。現在は別checkoutで未統合であり、fixture限定の制限を外すだけで実Codexへ渡してはならない。相手側の572テスト/37追加という検証記録はその候補専用で、この変更の合格には転用しない。共通ファイルの一括コピーを避け、before hashと差分を照合する。

### 補助メモ

手動チェックリストは主画面の下の「補助メモ」に残し、既存タブの入力を保持する。30件×100作業、入力16,000字、担当100字、メモ8,000字。`sessionStorage`のタブ内保存とテキスト書き出しに対応し、本人別サーバー保存/AI実行/正式検収へ昇格させない。破損や保存容量超過はエラーを表示する。Skyの7分類テンプレートは既存36任務への参照であり、既存Goalや権限を変更しない。

主担当は ROCK / WEB04。目的はSkyの商品発見・決済・接続を完全ローンチできる状態へ進めることで、AMC商品の掲載完了ではない。会話・ライブラリ・仕事はZemaに置く。現状の機械可読棚卸しは `data/amc/sky-launch-audit.json`。これは実装・証拠の観測記録であり、ローンチ合格証ではない。

## 現在地

ローカルのSky検索・商品詳細・Zemaへの移動、本人別ライブラリ、接続設定は利用できる。決済コードとProvider代替fixtureはあるが、実Stripe sandbox、本番、第三者MCPの購入権強制、OS別プロフィール/端末権限は未受入。完全ローンチ可能とは表示しない。

最新GitHub mainは棚卸しJSONの40桁SHAに固定した。mainのCIはcollect成功、prototype/verify失敗。ローカル変更は未commitであり、その変更へmainのCI結果を転用しない。`prompt:context` は既存baseline検査で停止したため、GitHub APIからmain・branch・PR・mainのcheck-runsを読み取り、main SHAを再照合した。PRの中身と各headの試験までは未監査である。

現行AMCは `lib/amc-tool.ts`、`scripts/amc-goal-engine.mjs`、`app/api/amc/route.ts` を再利用できる。ユーザー別保存、revision CAS、依存作業の検収、pathの排他、独立reviewがある。汎用4役割7工程はSkyの網羅的な完了計画ではない。ローカルの指示仕様/共有契約の変化照合は実装済みだが、Webの信頼観測と自動同期は未接続である。

## 受領する計画

別の計画作成タスクから実ファイルを受け取り、次の対応関係を確認してから独立したSky専用計画として取り込む。既存32部隊snapshotや正本プロジェクト台帳を置き換えない。

- Goal ID・版・確定要求ID、対象環境、Sky/Zema境界、明示的な除外範囲。
- Sky固有の部隊、主担当、実在する関連task ID、成果物、依存task、編集対象path。
- 各作業の合格条件と必要証拠の段階。host/fixture、Provider sandbox、実機、本番を別々に記録する。
- API、schema/migration、価格・手数料、認証/購入権、実行先、Zema handoffの共有契約IDと版。
- 外部Providerや本人判断に依存する条件、停止条件、未決事項。未決を既定値で合格にしない。

既存 `compileGoal` へ専用mission/projectから変換するadapterを設け、`validateGoal` を通す案を優先する。履歴上doneの作業も新Goalでは既存証拠のreview候補として扱い、実行完了へ自動換算しない。取り込み前に重複ID、参照漏れ、循環、要求の未被覆、親子と依存の混同、証拠段階の誤昇格を拒否する。UIで取り込むだけで課金・公開・外部AI起動を始めない。

## 指示発行と成果提出の照合契約（実装予定）

指示はGoal版、要求版、task仕様、共有契約版、前提作業の検収版/証拠hash、関連担当の作業範囲、対象ソースSHAまたは作業ツリーhashへ結び付ける。現在の全体Goal revisionだけを固定すると無関係な更新まで失効するため、関連入力の集合を明示する。

発行前に最新状態を取得し、要求との対応、依存検収、共有契約、同時編集、保留、費用と承認境界を照合する。欠落・未確認がある場合は「指示案」のままとし、実行可能な指示として発行しない。

成果提出時にも同じ照合を行う。API/schema/価格/所有者/依存証拠などが変わった場合、旧指示を失効させ、差分と影響範囲を記録して新しい指示へ更新する。成果物は未検収として保持する。担当者が古い指示に従ったことだけを理由に合格させない。新しい指示は旧IDを参照し、履歴を削除しない。

照合はサーバーの信頼できる入力で強制する。ブラウザが送った「一致」フラグで代用しない。CLI経路にも同じ条件を適用し、別経路で失効を回避できないようにする。同期の鮮度・失敗・観測元を表示し、常時監視や自動照合が未接続ならその状態を明示する。

## 検証と受け入れ

版変更、依存の検収取り消し、証拠差し替え、同時更新、他担当とのpath競合、観測の欠落、期限切れで発行/提出を拒否することを試験する。無関係な作業の進捗更新は不要な失効を起こさないことも確認する。本人別保存、CAS、同一操作再送、既存Goal import/exportを維持する。

Skyローンチの合格には商品審査、実sandboxの決済/返金/紛争/再送、購入権の付与と失効、共有端末分離、本番認証、監視、backup/restore、ロールバック、同一artifactの画面とAPI受入を必要とする。外部サービス・公開条件の未達をfixtureで埋めない。

受領ファイルの取り込みadapterと検査、Sky専用画面、本人別draft保存、範囲確認後の計画承認を実装した。原本の36準備作業と公開後確認1件を維持し、skyBriefは専用metadataとして検証する。原資料のlib/db.ts・lib/schema.ts・wrangler.jsoncは現行参照へ補正し、原本は保持する。次はS0-03の信頼できる最新入力取得・版照合・指示失効runtimeを実装する。これらの自動化と完全ローンチ受入は未完了。

## SKY-DIR-002/003 の実装と残条件

36件の拡張指示と7共有契約は原本外に追加済み。照合器・失効記録・CLIの発行/着手/提出・本人偽装のHTTP拒否を実装。関連71試験、型/lint/build、隔離Worker/D1 API191 assertionsはローカルで合格。API試験の合成本人は配備先の実サインイン証拠ではない。全体verifyは旧表示/役割数を正本へ照合して修正中で、全体合格ではない。

SkyのWeb実行は `observer_unavailable`。未接続を架空のサービスadapterやブラウザの整合フラグで埋めない。観測と保存を同じlease/transactionで行う配備adapter、全Goalを横断するpath lock、実行中checkpoint、検収取消と依存再検収の完全な状態遷移、実行記録付きGoalの署名/信頼移行が残る。保存済みGoalのstatus/result/evidence/eventLogは保持し、別版の指示を追記する。初回実Codexの失敗はtask結果とattemptsへ記録済みで、本番・S0-03受入には換算しない。

## 2026-09-30 S0-01の独立検収差戻しからの再準備

実Codexの成果を独立検収し、RQ01〜49本文と全候補の差分観測が不足したため差し戻した。Provider/本番未受入そのものを棚卸し作業の不合格理由にはしない。最新review済みGoal revision 13から正式resume_taskでrevision 14へ進め、提出とreviewをattemptsへ保存。原報告や受領plan/sourceを訂正して合格にしない。

S0-01のsource指示revision 3は、RQ本文、責任境界、system map、workstream、実在する原本plan/source/goalを読む。隔離入力では、全dirty trackedとnonignored untrackedの二重観測manifest、RQ01〜49索引、入力hash台帳だけを追加したrevision 4を使う。出力権限はs0-01.jsonのみ。ビルド/cache・未変更tracked・remote未観測を明示し、旧観測と差戻し成果を履歴に残す。次のCLI起動は依頼元に集約し、起動時の最新観測で指示を再発行する。

CLI報告のdeliverables/evidenceには実在する相対ファイルパスだけを返し、説明はsummaryへ記す。説明/fragment付き参照を自動修正せず拒否し、元報告を保持する回帰試験を追加した。対象10試験と全体verify（API191項目を含む）が合格。実課金・本番公開・Webへの実run同期の受入ではない。

### 期限後のowner復旧

失敗・blocked状態の最新指示が期限切れ/staleでも、ownerは新鮮な信頼済み観測と現行specを照合して再計画へ戻せる。現在の要求ID、依存検収とreview revision、入力/契約hash形式、書込競合、holdを再評価する。旧仕様・契約の変更自体は復旧を永久拒否する理由にせず、観測内容を回復記録へ保存する。旧指示のvalidUntilを延長せず、当該taskの全旧指示をstaleにし、履歴をattemptsへ残す。復旧は実行許可ではなく、着手には新しい指示とその時点の再観測が必要。Webのobserver_unavailable拒否はそのままであり、観測adapter/worker認証の完成を意味しない。期限後・仕様変更・権限/観測偽装・競合・依存/hold・transaction観測変更/CASの回帰試験を追加。


S0-03の未実装事項: 受入済みtaskのsource候補更新後、旧検収履歴を保持して再検証へ戻す正式engine遷移。S10-01の検収はその候補のみに適用し、CSV修正後へ自動転用しない。CSV局所修正はS8-02の先行候補であり、依存未検収の正式着手/完了を意味しない。S9ではwranglerのsource/生成物/installed workerdの互換日付差を別途照合する。


### 明示的な検収更新（revalidate_task）

候補更新後の過去合格を現行合格として残さないため、active Sky Goalのdone taskを認証済みownerが再検証へ戻す。revalidationImpactで逆依存の全影響taskを算出し、その完全なaffectedTaskIds、reason、実在するevidenceを明示する。targetとdone下流それぞれに最新spec・要求参照・source hash・契約・依存検収・lockの信頼観測を必須とする。対象依存が現在done/独立検収済みでない場合は拒否する。

全影響先にrunning/submittedがあれば、操作全体を拒否し実行/history/lockを保持する。done先は旧result/review/evidence/acceptanceCriteriaをattemptsへ保存してpendingにし、criterionをnot_verifiedへ戻す。その他の下流状態やholdは保持してrevalidation.requiredを付ける。閉包の全旧指示をstale化し、新規指示→worker提出→独立検収を必須とする。新検収が合格したtaskのみrequiredからsatisfiedへ進む。無関係taskは変更しない。再検証操作自体にaccepted/outcome/criterionResultsを付けて成功を付与することはできない。

権限はJSON内の自己申告ではなく、process-local trusted adapterからのprincipal/observationを使う。transactDirectiveはexclusive transaction内の二度の観測、二度目の鮮度、全下流観測materialの一致、revision CASを必須とする。Webのtrusted observerは未接続のため、HTTP経由は409を維持する。実Goal30はrootの独立確認後に別途操作する。全体accepted Goalの再開や自動cascade停止は対象外。操作例と新しいS10隔離入力はoutputs/sky-amc-execution/maintenance-revalidation/に保存し、以前のS8/S10原本証拠を上書きしない。
