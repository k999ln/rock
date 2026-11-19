# Harness²を参照したSky Agent改善基盤の開発実行プロンプト

作成: 2026-10-21（America/New_York）。主担当: Sky / MCP、ROCK。既存taskはSKY14・SKY15・SKY21、AI07・AI08、OS10を使う。SecurityとBIL02は横断gate。これは次の実装担当への指示であり、保存だけでAgent品質、実Provider、Pixel、一般公開の合格にはしない。

## 目的と製品内の位置

RockstarOSの共通runtimeに従い、**Skyで追加したAgentの仕事の進め方を、本人の一件のEve仕事に対して比較し、検証された改善案だけを版付きで採用できる開発基盤**を作る。モデルの重みは変更しない。最初の縦断は、既存の読み取り・生成系Sky Toolを使う合成の公開資料整理一件とする。同じ入力snapshot、Tool版、実行先、予算条件で、現行設定と候補設定を比較する。改善前後で仕事の完了率、引用の正確さ、本人の修正回数、遅延、token/費用、停止と復旧を測る。ユーザーがHome/Skyの投稿からAgentを追加してEveへ依頼する現行体験を保ち、評価機構を仕事の実行権限にしない。

参照チャット[「RockstarOSを再設計」](codex://threads/01a14d54-daee-7c30-87a8-faea84641a40)の現行方針では、RockstarOSが本人性・権限・利用権・保存/復旧の大元で、SkyがAgent/Toolを登録・接続し、Eve（旧称Zema）が依頼・承認・進捗・停止・成果・使用額の窓口である。Home全体は投稿から発見・追加・実行へ進む。X本人投稿の実取得、For You、eSIM実issuer、端末OS、実請求は別の未受入gateであり、この任務の成果へ含めない。RQ01〜RQ49、月額/従量の既存契約、本人別保存、一般ローンチ保留を維持する。

## 外部研究から採るものと採らないもの

固定参照: [google-research/harness2](https://github.com/google-research/harness2/tree/1cfe254e8d25b15f37048c3730134686abe60335) (`main` `1cfe254e8d25b15f37048c3730134686abe60335`、Apache-2.0)。[README](https://github.com/google-research/harness2/blob/1cfe254e8d25b15f37048c3730134686abe60335/README.md)は、task内のPropose–Probe–Composeと、仕事をまたぐ改善履歴の反映を説明する。編集候補はsystem prompt、guardrails、memory、Tool guidance、subagents、skills、scripts、pluginsの8種。Linux/Python 3.12のcredential不要demo、Codex/OpenCode executor、JobBench/LAB/WorkBuddy-Benchを提供する。

本実装ではこの**比較手順**を取り入れる。最初の候補編集はSky Agentの仕事別instructionとTool guidanceの限定された版付きfieldだけ。候補probeと採用判断を明示し、実行traceの差分から理由を残す。persistentな学習は、採用済み版・評価条件・要約された根拠を次回の提案材料として保管する範囲に限る。本人の会話原文、秘密、第三者資料を汎用改善memoryへ自動投入しない。guardrail、Broker policy、scope、承認、予算、料金、接続先、秘密の扱いは候補編集対象から外す。subagent・script・pluginの自動追加、任意shell/root、自己公開、自己課金を許可しない。

上流の[実験説明](https://github.com/google-research/harness2/blob/1cfe254e8d25b15f37048c3730134686abe60335/docs/EXPERIMENTS.md#web-access)はexecutorのnetwork制限が標準でなく、Codexのsandboxが無効と明記する。上流を既存の本人データ・本番資格情報のある環境へ直接走らせない。公開benchmarkのrubric取得による汚染も考慮し、基準とheld-out課題を候補executorから隔離する。上流の報告値をRockstarOSの改善実績に転記せず、ここで同条件の結果を測る。採用/移植するcodeと第三者datasetのlicense、依存、hashを確認し、必要最小限のadapter以外を製品runtimeへ持ち込まない。

## 実行前に読む正本とGit入力

1. `AGENTS.md`、`docs/product-baseline.md`、`data/product-baseline.json`、`README.md`、`project.md`、`data/project-status.json`、`docs/workstreams/README.md`、`docs/workstreams/00-responsibility-boundaries.md`、`docs/workstreams/02-sky-mcp.md`、`docs/workstreams/04-security-identity-compliance.md`、`docs/prompt-playbook.md`、`docs/execution-approval-20260909.md`、`data/execution-approval.json`、`data/project-status.json.phaseGates`を読む。全体入口は`docs/rockstaros-design-portal.md`、OS詳細は`docs/rockstaros-complete-design.md`、Tool詳細は`docs/sky-tools-complete-design.md`、LLM/Jev境界は`docs/llm-evaluation-architecture.md`と`data/llm-capabilities.json`。設計v1.1の実装承認は済んでいる。
2. `git status --short --branch`で共有dirty差分を保護し、`npm run prompt:context`または同等の読取りで最新main・実在branch・PR・**同一SHA** CIを再取得する。取得失敗やチェックなしを合格にしない。mainの入口/優先順位とDB migrationが作業branchへ未反映なら、最初に分離checkoutで採用差分と互換を同期する。共有checkoutをreset/上書きしない。
3. `lib/decision/harness.ts`、`lib/decision/policy.ts`、`lib/decision/router.ts`、`lib/decision/types.ts`、`lib/workflow.ts`、`lib/a2a-delegation-store.ts`、`lib/jev-evaluation.ts`、`lib/sky-model-selector.ts`、`services/sky-agent-runtime/src/worker.ts`、Agent/Package/Studioの既存実装と対応API、DB/migration、試験を直接読む。main上のPixel Agent Tool chainもPR #167/#169の実際のsourceと証拠で確認する。PR #105/#110の未統合仕事/復旧差分を既にmainへあるものとして扱わない。

**作成時の確認**: GitHub `main` `01b6aecd8b4d8bd2385665232dfb4b57029f991f`は同一SHAの`verify`と5つのsecurity/repair checkがsuccess。実在する`codex/esim-cloud-access` `951d82d5a491a284aed4e0d4d280171d835d4b43`は`source-preparation`一件だけsuccessで、全体CI合格ではない。両者はmain側652 commit、branch側3 commitでdiverged。作成時のlocal HEADは後者でdirty 562 path。`npm run prompt:context`は最新文脈を確定できず、GitHub connectorでbranch・open PR・同一SHA CI・compareを読戻した。open PR #105/#110は未統合、#160/#167/#169はmerged。実行開始時に再確認する。`docs/design-implementation-alignment-20260909.md`の旧監査SHA `7cdbb5fedc86ee3978ed329d9312147d137c9199`、`fcedcfec4dd2a242a1ba8fd7ff5eebba97b8ecd5`、`de5b102d3525daccf604efd5685bdf8c14ad5d50`は履歴であり、現行branchではない。

## 現行sourceに対する差分と修正順

| ID | 原因と現行根拠 | 実装順 | 合格証拠・未解決条件 |
| --- | --- | --- | --- |
| H2-01 仕事内の比較契約 | `DecisionHarness`は一件のtyped adviceを最大2 providerから得る。候補のAgent instruction/tool guidanceを版付きで複数probeして採用する契約はない。 | 既存Agent/Package版に紐づく`HarnessCandidate`、固定task snapshot、許可field、差分digest、基準版を定義。学習案はproposalであり本人のAgent設定へ自動反映しない。 | baselineと候補2案を同じ公開/合成fixtureで実行し、入力/Tool/版/費用条件を固定して比較。権限・scope・予算・料金・接続先変更をschemaとserver側で拒否。 |
| H2-02 probeの実行分離 | 上流Codex executorはsandbox無効・network無制限。現在のRockstarOS Broker/Workflowは仕事実行を別に扱う。 | 一仕事一隔離run、固定allowlistの読み取り専用fixture、外向き通信禁止、実credentialなし、CPU/RAM/時間/token上限、kill/cleanupを持つ評価runnerを作る。最初は上流credential不要demoを隔離Linuxで再現し、その後Rockのadapterだけを使用。 | 別owner/秘密/ネットワーク/書込/任意commandの拒否、timeout・停止・再起動後cleanup、実費0の記録。上流demo成功をSky製品受入としない。 |
| H2-03 判定と汚染 | 評価結果はJev/LLMと同様advisoryで、仕事成功やBroker許可ではない。公開rubricへのnetwork参照は比較を汚す。 | 課題群を作成/調整/held-outに分離し、独立の決定論的assertion・人手review・必要時のadvisory evaluatorを併用。probe trace、成果hash、失敗理由、rubric版を保存し、採用規則を先に固定。 | hidden rubricをexecutorへ渡さず、合成課題の過学習・出典捏造・指示注入・承認回避を負例で拒否。測定値の信頼区間/件数を明示し、改善なし・同率・悪化は不採用。 |
| H2-04 費用/継続memory | `workflow.ts`とA2A台帳はowner/job/revision・予算を持つが、再帰probeの全attempt費用/停止と、次taskへ残す改善履歴は別契約。 | candidate/attemptごとに見積・予約・実使用・成果/usage receiptを既存費用基盤へ紐づける。probe総額が本人承認上限を越える前に停止。履歴は版/metric/根拠の最小化要約と保持期限、owner削除/持出しを持つ。 | 再送・同時候補・中断復旧で二重実行/二重課金0。上限超過前停止、別owner閲覧0、削除/失効後の新規学習0、旧Agent版のjob/receipt読戻し。実Provider単価/receipt未接続なら有料probeを閉じる。 |
| H2-05 採用/公開 | 既存SkyはPackage審査・Add・購入・実行を分ける。改善候補を正式Agent版へ昇格する審査経路は未受入。 | 変更差分/検証結果を作者と本人に提示し、本人設定への採用は明示操作、公開商品版への採用は既存審査/署名/hash/rollbackを通す。既存Agent IDと過去成果を維持する。 | 候補生成だけでAdd/購入/実行/公開が0。採用後もBrokerが毎回scope・実行先・予算を再判定。旧版へ戻せ、過去jobの版が変わらない。 |

## 作業段階と責任

1. **保全と計測基準**: 最新main/branch/PRを同期し、Sky Agent一件の既存動作を同じfixtureで再現する。成功率、引用/出典の正確さ、利用者修正回数、遅延、token/費用、停止/復旧をbaselineとして保存。課題数と評価条件を先に固定する。
2. **限定候補と隔離probe**: H2-01/02を実装。候補はinstruction/tool guidanceのみ。baseline・一般候補・仕事領域候補を独立に走らせ、traceを同じschemaへ。最初は公開合成資料か本人が明示した無害な入力に限る。実Provider、実X、本人の秘密、Wallet/決済、端末AXは投入しない。
3. **比較・採用・復旧**: H2-03/04/05を実装。候補同士の行動差分を示し、held-out課題で再確認してから一つの版を本人が採用できるようにする。学習履歴の次taskへの読み込みはscope/owner/retentionで分離し、逆効果ならrollbackする。Eveは理由、費用、現在版、停止、成果を示す。
4. **独立受入**: PC host/隔離Linux/Pixel Linux/Cloud/実Provider/本番は別々に記録する。Skyの商品・Toolを変更する場合は`data/design-document-index.json`とOS/Tool詳細設計を同じ変更で更新し`npm run design:check`を通す。公開や外部送信を始める前に、対象/資格/契約/費用/復旧gateを別に受け入れる。

ROCKは評価契約、runner隔離、Broker/費用/仕事接続、版・証拠・削除を担当。EXTERNALは上流研究/モデル/Tool providerの仕様と価格、JOINTは隔離環境/Provider sandbox/端末別の同一候補受入、OWNERは本人データ投入、費用上限、改善版の採用と公開範囲を決める。上流の著者による製品安全保証はない。

## 検証と引継ぎ

まず変更箇所の契約/隔離/費用/失効試験を実行し、既存`tests/decision-layer.test.mjs`、`tests/workflow.test.mjs`、`tests/a2a-delegation-store.test.mjs`、Sky Agent/Packageの対象試験で互換を確認する。実行前にpathとscriptを再確認し、存在しない試験を成功扱いしない。二人のowner、予算境界、停止後の遅延結果、同一job/revisionの重複、旧版読戻し、prompt injection、network漏出を負例に含める。必要なら隔離Linuxで上流demoと独立probeを再現し、実行コマンド、上流commit、依存hash、network policy、出力hashを記録する。最後に`npm run baseline:check`、`npm run design:check`、`npm run project:update`、`npm run project:check`、`npm run verify`を実施し、長いログはGit外へ置く。UIが加わればEve/Sky/投稿入口を操作する。host fixture成功を実Pixel・Provider・本番の合格へ転用しない。

`project.md`と`data/project-status.json`には対象source SHA、実行環境、候補版、課題集合、metric、コマンド/結果、未受入gate、次の作業を残す。READMEの利用方法が変われば同じcommitで更新する。文書保存、作業branch commit、main統合、配布readbackを別々に記録する。公開/実課金は現行gateのまま。RQ01〜RQ49の対応と矛盾を再点検し、既存SIM/eSIM導入、QEMU/Pixel実機、Wallet/Game/Material、作者SDK、ATM手数料0、月額上限の契約をこのAgent評価作業で変更しない。
