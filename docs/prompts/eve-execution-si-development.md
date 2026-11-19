# Eve 実行SI全体：詳細開発プロンプト

## 0. この指示の目的と完成の意味

Eveを、本人の目的を受け取り、実行可能な計画を作り、適切なLLM/Agent/Sky Toolへ仕事を渡し、結果を検査し、必要な修正を行い、途中状態を保存して再開できる実行システムとして開発する。使用量表示やチャット回答だけで完成としない。この文書の「実行SI」は製品上の呼称であり、人間を超える汎用知能が実証されたという意味ではない。

最初の必須縦断は **Eveで依頼 → 計画候補 → Brokerによる検証/権限/予算確認 → Skyの実Tool → 成果の独立検査 → 同一仕事と会話へ保存 → 再読込/別の承認済み端末で継続 → 停止/復旧**。まず実行証拠が得られる限定Toolを通し、同じ契約をAgent/Cloud/端末へ広げる。

利用者はGPUをまだ借りられない。既存モデルと決定的処理で実行基盤を完成へ進め、独自重みの学習をその前提にしない。Eveは製品名、内部モデルは版/hash付きの交換可能な構成要素。独自Eve重み、追加学習、超知能、一般公開、実機OS完成、実収益は証拠なしに宣言しない。

## 1. 最初に読む・保持する正本

AGENTS.md、docs/product-baseline.md、data/product-baseline.json、README.md、project.md、data/project-status.json。続いてdocs/workstreams/README.md、00-responsibility-boundaries.md、02-sky-mcp.mdを主担当入口として読む。主担当は **Sky / MCP・ROCK**、関連task AI02/AI05/SKY14/SKY21、Web統合WEB04、共通実行OS10、請求BIL02。既存taskの定義を確認して範囲を対応付け、未達のtaskを文書作成でdoneへ変えない。

設計正本はdocs/rockstaros-design-portal.md、rockstaros-complete-design.md、sky-tools-complete-design.md、rockstaros-avocado-mini-complete-design.md。AIの境界はdocs/llm-evaluation-architecture.md、data/llm-capabilities.json、独自モデル設計は同文書#execution-si-owned-model、学習条件は#eve-training-prerequisites。料金はdocs/sky-billing.md、今回の共通計量は#cross-provider-usage-observationとdocs/prompts/eve-sky-usage-routing-settlement.md。共通Coreはdocs/prompts/rockstaros-common-core-development.mdと現在のruntime証拠を参照する。

docs/execution-approval-20260909.md、data/execution-approval.json、docs/design-implementation-alignment-20260909.md、status.phaseGatesを確認する。設計v1.1実装は承認済み。過去のQEMU/単一owner/fixture合格を現行候補の実機/複数owner/Provider合格へ移さない。main由来の確定要望や引継ぎ入口が作業branchへ未反映なら最初に同期する。

共有dirty checkoutのreset/一括置換をしない。現在別チャットで進んでいる「自分のSky」管理、Home発見、Eve接続、共通host導入を保持し、重複実装を避ける。この文書は全体の分野別実行指示であり、他担当が使用しているglobal nextPromptを無断で変更しない。

## 2. 責任と製品体験

- ROCK：目的/計画schema、状態遷移、権限検証、予算/資源制限、実行配送、検収、保存/復旧、本人画面、監査、adapter実装。
- EXTERNAL：モデルの真の応答、Provider料金/請求/稼働、外部Agent/Toolのreceipt、OS権限、端末ABI、実決済の状態。
- JOINT：同じ候補による外部Agent/Provider sandbox、実端末、停止/再開、請求照合の縦断受入。
- OWNER：目的/素材の利用権、データ持出し範囲、権限/費用上限、外部送信/公開等の必要な最終承認、契約/販売国/作者分配の確定。

Homeは発見、自分のSkyは追加済みAgent/LLM/Toolと設定、Eveは依頼/計画/実行中状況/承認/停止/成果/費用。同一owner・会話・仕事の識別を保ち、機能ごとに別のアカウントや仕事台帳を増やさない。Eveの画面ではモデル名、担当、実行先、接続/実行可否を別々に読めるようにする。登録済みでも実行資格・接続・権限がなければ理由と次の操作を示す。

## 3. 今あるコードと限界（再確認して使う）

- lib/workflow.ts：既存WorkJobとrevision/commandによる遷移。statusはactive/review/completed/cancelled。新しい仕事機能はこれを通す。下記の細かい実行phaseをトップレベルstatusの無断置換で実装しない。
- lib/work-composition.ts、work-composition-executor.ts、app/api/work-jobs/composition/route.ts：型付きDAG・成果・検査。接続済みはmr-citations、mr-free-article、rockstar-csv-cleanup、compose-join、compose-checkに限定。他catalog項目はavailableと実adapterを確認する。引用整形は事実確認ではなく、文字数/必須語検査は意味品質の保証ではない。
- lib/sky-planner-bridge.ts：限定ローカルPlannerとの受渡し。汎用目的理解エンジンの完成ではない。既存Agent Control Plane/Decision Layerの実コードも探索して統合点を固定する。
- lib/sky-model-selector.ts：ローカル候補を4種の小さな合成課題で評価する限定実装。全Provider・全用途の最適選択ではない。公開モデルcatalogやニュースは候補発見で、能力証明ではない。
- lib/a2a-parent-controller.ts：親の状態を投影するread-only snapshot。自律的な開始/再実行/承認/停止は行わない。a2a-client/delegation-store/authorization/broker/receipt/recovery等を再利用して実行制御へ接続する。
- lib/eve-history.ts、eve-device-sync.ts、eve-runtime-sync.ts、eve-device-replicas.ts、rockstar-linked-execution.ts：既存のowner-scoped履歴・端末実行・同期・成果。端末モデルの文章応答はexternalToolSuccess:falseを保持し、Tool実行成功へ昇格させない。
- lib/llm-providers.ts、remote-ai-text-execution.ts、remote-ai-text-http.ts、sky-usage-observation.ts：モデルadapter、既存Cloud実行/料金と共通usage投影。Agent receiptは既存署名検証storeから投影。観測/単価計算/Provider請求/顧客入金/作者配分/送金を別状態にする。
- lib/settlement.tsと既存Wallet/Marketplace/請求：新しい並列金融台帳を作らず拡張する。Sky作者売上手数料10%をLLM原価へ一律適用しない。

docs/evidence/sky-cross-provider-usage.jsonは当時のhost/fixture集中43件・表示6件・full verify exit0の証拠。直前のプロンプト変更後full verifyは既存activation試験10秒timeoutでexit1、対象再試験4/4 pass。最新候補の全体成功ではない。証拠内hashと現在のソースを照合する。status内の既存Pixel/アカウント/host受入も記載された候補・範囲に限定する。

### 3.1 先行実装の現在地（2026-10-22追記）

初版以降の同じ共有checkoutには`lib/eve-tool-work.ts`、`eve-plan-candidate.ts`、`eve-agent-work.ts`と専用API/既存Workbench接続がある。重複したrunnerを作らず、[実装証拠](../evidence/eve-execution-si.json)の各source hashと当該pathを読んで再開する。第17節は初版の作成時点の記録で、後続実装の公開/CI受入を意味しない。

- SI01：実mr-citations→独立URL保持検査→既存SQL/暗号化会話→再読込/停止のlocalhost縦断は受入済み。原稿は既存work_jobsの保存契約なので非秘密素材に限定する。
- SI02：導入済みQwen2.5:1.5bの実候補を一度拒否し次候補を採用→実Tool→独立検査→保存を限定受入。候補は非信頼、`plannerModel`表示は申告ラベルで、真のモデル/権利/請求の証明ではない。引用仕事では候補生成の最大2attempt/90秒lease/結果不明/本人採用を既存WorkJobへ永続化し、同じ仕事で再開する。汎用background plannerは未一般化。
- SI03：実際の重複結合の容量失敗→失敗保存→合格済み同一成果を維持した冗長結合除去→再検査までの限定修正。厳しい完成条件を緩めず、一般意味修正は未受入。
- SI04/SI05：既存cloud-agent仕事の同一thread接続、SQLによる停止後作成/承認/claim/send拒否、外部取消未確認の保持、履歴鍵停止中の停止、既存Agent workerによるintent回収と限定件数scanの公平性を実装。host/実workerd再起動/制御Workflowの証拠を別記し、今回の実UI・独立外部Agent・端末・公開を未受入のまま保持する。
- SI06〜08：共通usage投影は先行して存在するが、全Providerの永続計量/請求/作者契約・入金/配分、評価に基づく選択、ニュース実務、CPU学習実験、公開運用は残る。GPU/有料契約待ちで独立する開発を止めない。

最新メタデータ再取得：2026-10-22T07:27:38.923Z、`npm run prompt:context`成功。main `7304e449cd7938b098b0b1ce481a06501db8d795`、作業branch `codex/esim-cloud-access` は`951d82d5a491a284aed4e0d4d280171d835d4b43`。dirty実装のGit保存/merge/公開は未実施。main同SHAのchecksとbranchのsource-preparationを、未保存候補のCIへ転用しない。最新検証結果は証拠JSONを参照する。

## 4. 実装前に作る契約と設計成果

既存設計へ以下を追記し、重複した正本/汎用runner/台帳を増やさない。必須項目は目的、本人の操作、ROCK/EXTERNAL/JOINT/OWNER、入出力、状態、保存、失敗、復旧、承認、合格条件、未決の決め方。ファイル候補名だけで実装完了としない。

### 4.1 目的と完成条件

Goalはowner、workspace、thread、job、依頼文、期待成果、対象/除外、素材参照、期限、通貨、承認済み予算、データ境界、完成条件、版を持つ。外部資料から取り込んだ命令を本人の目的/承認にしない。曖昧さが出力や外部影響を変える場合だけ本人へ確認し、推測可能な低影響の選択は仮定を記録して進める。期限はtimezoneと絶対時刻へ解決する。

### 4.2 計画と依存関係

Planはschema版、plan revision、親Goal、node ID、依存入力/成果型、使うcapability、model/agent/実行先候補、必要scope、見積、timeout、失敗方針、検収項目を持つ。循環、存在しないTool、入力型違い、権限超過、予算不足、期限超過を実行前に拒否。LLMの出力は非信頼の候補としてparse/検証し、不正JSONは修正上限内で再提案、越権案は拒否する。

### 4.3 実行単位と監査イベント

既存job下のexecution/attempt/commandを使い、plan revision、入力artifact hash、adapter/model/tool版、owner/device、scope、予算予約、idempotency key、配送識別、時刻、receiptを関連付ける。必要なschema拡張のみ追加し、既存IDを二重発行しない。イベントはrevision/順序/重複検出を持ち、権限のあるserverが遷移を確定。LLM本文・ブラウザlocalStorageを実行/請求の正本にしない。

内部phaseは計画候補、検証待ち、承認待ち、実行可能、配送中、実行中、検査中、修正待ち、結果不明、照合中、停止要求、停止確認待ち、完了/失敗/中止を表現する。既存WorkJobと既存A2A/runtime状態への対応を先に設計する。cancelを押したことと外部実行が止まったことを分ける。

## 5. 実行ループを完成させる

1. 同一ownerの目的・素材・既存状態を読む。本人が削除/停止した仕事を再起動しない。
2. 実行可能なTool/Agent/端末能力を取得し、期限/接続/失効/契約を検査する。
3. 決定的recipeまたはLLM plannerから計画候補を得る。recipe baselineを必ず保持する。
4. 構造・型・scope・予算・依存関係をserverで検証する。
5. 必要な本人承認を、対象・入力hash・計画版・scope・金額・期限へ結び付ける。計画変更時は承認の適用範囲を再検査する。
6. 既存原子予約/command重複排除を通して実行する。独立nodeのみ制限付き並列にし、同じ外部副作用を競合送信しない。
7. 結果/receiptを取り込み、schema/hash/本人/実行IDを照合する。取得した本文は非信頼データとして扱う。
8. 完成条件を独立検査する。コード/CSVは決定的試験を優先、文章は出典・制約・独立評価を組み合わせる。
9. 失敗原因を分類し、修正可能なら影響nodeだけ再計画する。既存の成功成果を不用意に再実行しない。
10. 各段階を保存し、再読込/worker再起動後はreceiptと既存attemptを確認して再開する。
11. 完成条件を満たした成果・検査・使用額を返す。足りなければ未解決条件を示して保留/失敗へ進む。

上限を設定する：計画再生成回数、総step数、同時実行、外部呼出回数、Toolあたりtimeout、総wall time、入出力容量、token、修正回数、累積予算。初期値は既存制限を保持し、未定値はfixtureで測って設定化する。ループが進展しない場合は理由を出して停止する。上限到達で成功にしない。

## 6. LLM/Agentの担当選択

本人固定指定を保持し、適格性を先に判断する。必要Tool、権限、コンテキスト、構造化出力、言語、端末メモリ/ABI、data residency、外部送信同意、利用権、可用性、料金/capを照合。条件を満たす候補がなければ理由と選択肢を示し、無断でCloud/別業者へ切り替えない。

適格候補を実測の仕事成功率、独立品質、待ち時間、失敗率、仕事当たり費用で比較する。評価suite版・model digest/Provider版・測定日・課題数・環境を記録。古い/不明な評価は未評価として扱う。Providerのmodel alias変更やrate更新では評価/見積の適用を再検査する。合成課題の成績を実務全体の知能へ一般化しない。

Planner/Executor/Reviewerは論理役割として分離し、必要時に異なるモデル/決定的検査を用いる。同じモデルを別system promptで呼んだだけで独立検証が保証されたとしない。Jevは既存Sky経由の明示remote evaluatorで、権限や採否の最終決定者にしない。AMCとの接点は仕事の目的/任務/独立検収/引継ぎとして揃え、別製品の二重job管理を作らない。

## 7. Tool/Agent接続と作者体験

Catalog登録、作者同一性/署名、入力出力schema、必要scope、料金版、実行環境、停止/timeout、データ取扱い、版/失効、healthを整備。署名は安全性保証ではない。第三者ToolをOS platform鍵で署名しない。任意shell/rootを共通実行APIにしない。

MCPは既存接続/認証/認可adapter、A2Aは既存directory/quote/consent/authorization/delegation/receipt/recoveryを使う。protocol変更時に現行の公式一次資料を確認し、宣言したprotocol版とwire互換を試験する。再送可否は操作の副作用・Provider idempotency・結果照合で決める。ネットワークtimeout後の無条件再送は禁止する。

作者は「目的/得意な仕事→Tool/LLM選択→入力/成果型→scope/価格→試験→保存/Add」の順に直感的に作れるようにする。既存AgentLibraryと作成UIを再利用する。下書き/私有/Add済み/審査/公開/失効を区別。Tool追加やscope変更はrevisionを更新し、古い承認を使い回さない。sandboxの実サンプル、検証エラー、導入時間/成功率/復旧時間を測れる診断を用意する。

## 8. 権限・本人性・データ・安全な停止

認証済みownerとworkspaceをserverで固定。会話/Goal/Agent/端末/receipt/artifactごとにowner照合し、URLのIDを知っていても他人の保存へ入れない。端末追加、期限付きgrant、失効、再認証、OS権限は既存契約を使う。署名/credential設定済み/ready/実機受入を混同しない。

外部送信、投稿/メール送信、課金、削除、端末操作等は既存承認境界を守る。許可済みの低影響処理は繰返し承認で止めない。資料やTool出力のprompt injection、偽の本人指示、credentialの出力誘導、SSRF/redirect、過大payload、script付きartifactを拒否/隔離する。鍵は既存vaultへ、usage/監査にはallowlistのメタデータだけを入れる。

停止時は新規配送停止→進行中commandの停止要求→receipt/残処理の照合→予算予約の確定/解除→保存を行う。外部cancel未確認なら停止確認待ちを表示し、成功または0円へ置換しない。金融/投稿等は副作用を勝手にrollbackせず、取消可否を調べ別の承認済み補償操作として扱う。

## 9. 記憶・成果・複数端末・復旧

作業記憶（現Goal/plan/attempt）、会話履歴、本人が保存した好み、検索可能な資料、学習用datasetを分ける。好みの推測には出典と訂正/削除を用意し、ユーザー文を無断で全利用者へ共有しない。

既存Eve履歴/replica/共通runtimeを拡張し、conversation/jobの同一性、artifact hash、revision競合、暗号化、retention、削除/持出しを保持。大きな成果は既存artifact保存へ置き、会話には参照を保存する。モデルの思考全文や秘密を保存要件にせず、短い判断理由・行動・証拠を残す。

ブラウザ閉鎖、端末offline、worker crash、lease失効、重複/逆順report、応答喪失後receipt到着、DB移行中断で再開を検証。再起動後に既存operationを再発行しない。旧clientの互換readerと復旧手順を用意する。Web/native/Pixel/他host/Miniの対応は同じversioned契約とfixtureで確認し、対応外ABIを起動可能と表示しない。

## 10. 使用量・価格・作者還元

既存共通計量を永続job/attemptへ接続。input/output/cache/reasoning/totalはProviderの意味に従い、二重加算を防ぐ。token未報告や金額未確定はnull。local inferenceのtokenを有料Cloud枠から引かないが、必要なら本人用資源計測と区別して表示する。BYOK/OSS/Provider実費/商品料金/通信料/月額を分ける。

実行前に料金版と見積/最大額、実行中に予約/使用/残額、終了後に明細を示す。見積と実請求の差、失敗/再試行、cache、為替/通貨、締め時刻、価格変更を扱う。費用上限を原子的に強制し、複数Agentで上限をすり抜けない。予約額を作者売上にしない。

作者/権利/サービスと契約版を原始usageへ結び、既存settlementで重複のない配分/返金/支払状況を管理。請求未照合・未入金・作者契約未登録を支払済みにしない。月次請求・未払い制限/復帰・同契約複数端末の重複防止を既存BIL02へ接続。実送金は対象/額/通貨/契約/本人承認が確定した別gateで受け入れる。

## 11. ニュースの仕事と学習

ニュース取得/比較/下書き/掲載は代表用途の一つとして既存eve-news/feedを使う。出典、取得/公開時刻、重複、主張、根拠、意見/事実、対立する証拠、訂正を追跡。特定の政治的立場だけを隠さない方針と、虚偽・著作権・個人情報・情報源の利用条件を分ける。中立性をモデル名だけで保証せず、政治立場を入れ替えた対照評価と情報源/扱いの偏りを測る。news生成成功を投稿成功へ昇格させない。

学習準備は同意済みの依頼/計画/Tool呼出/観測/修正/検収から権利を確認したdatasetを構成。秘密除去、owner別同意/撤回、重複除去、train/eval分離、汚染確認、正確なmodel revision/license、dataset hashと学習configを固定。公開HF/GitHub/X情報は発見資料であり、公開されているだけで学習利用権があると扱わない。

GPUが用意できた時に、小規模追加学習から現行モデル/recipeと同一課題で比較し、改善・悪化・費用・端末資源・復旧可能性を確認して切替える。GPU契約/長時間job/新モデルdownloadをこの文書作成だけで開始しない。独自重み開発と実行runtime完成は別の受入とする。

### 11.1 本人指定microgpt教材の取り込み

[GrEarl/microgpt-lesson](https://github.com/GrEarl/microgpt-lesson/tree/af735511e13af5881ade5dee0c15151ac23ca2a5)のcommit `af735511e13af5881ade5dee0c15151ac23ca2a5`を参照する。Tokenizer、損失、自動微分、Attention、正規化/残差、Adam、生成を分解して検証する順序を、[CPU基礎実験契約](../llm-evaluation-architecture.md#eve-microgpt-reference)へ反映済み。GPUを借りる前に、自作合成データ・小さなCPUモデルで学習/評価分離、有限値/勾配、checkpoint保存/中断復元、同条件baseline比較まで実証する。単なるコード読了やloss低下でEve本体を学習済みにしない。実験はSI07の学習準備であり、SI01〜06の実行基盤を止める前提にしない。

教材は小規模な人名生成であり、仕事用の指示学習・Tool権限・事実性/政治的公平性・継続実行は別途設計/評価が必要。教材コードのLICENSE未確認のまま転載せず、datasetのMITと分ける。学習配列を明示分離し、step数を増やしてもheld-out例を学習へ混入させない。生成候補は常に非信頼で既存Broker/完成検査を通す。現時点は参照調査と設計反映のみで、CPU/GPU学習未実行。

## 12. 運用・評価・リリース

観測する指標：目的完了率、独立検査合格率、Tool成功/失敗、無効計画率、修正回数、停止確認時間、結果不明件数、再実行重複、owner越境、予算違反、初回成果までの時間、p50/p95、成功仕事当たり費用、作者明細一致率。監査ログはsecretを除き同じjob/attempt/receiptへ辿れること。未取得値は未測定とする。

feature flag、owner限定→複数owner sandbox→限定公開の順で進め、queue/concurrency/quota、health、障害通知、価格/モデル失効、credential失効、移行/backup/restore、旧版への切戻しを用意。ローカル成功、GitHub CI、本番配備、本人UI読戻し、外部Provider、端末、課金を別々に記録する。

正式domainはavoado.si（総合/Sky）、avocadomini.si、avocadopro.si。一般ローンチ保留を維持。最新Sites sourceと正しいproject appgprj_6abdfad4c5648191bcae957913bd02faを取得し、公開版の新しいSky管理修正を保持。root hosting設定や古いversionをそのまま公開先にしない。DNS/TLS/実配備とUI読戻し前に公開済みにしない。

## 13. 実装段階・GAP管理と終了条件

### SI00 現状固定と統合設計
原因：部品/branch/公開source/受入範囲が分散。関連コード・schema・既存task・証拠hashを読む。mainと対象branchの最新40桁SHA、PR/同一SHA CI、dirty差分、Site版を記録。原因/対象/担当/依存/検証/未決をGAP一覧として既存関連設計へ保存。合格は実在する再利用箇所と不足が明確で、次の工程がAPI/保存/試験単位へ落ちていること。

### SI01 決定的な最初の縦断
既存Tool1件でEveから実行・独立検査・保存・再表示・停止を通す。推奨は非秘密CSVの明示的な整形条件と行/列/値保存検査、または引用整形とURL保持検査。planだけ・mockだけ・自己申告だけでは不合格。既存完成条件が不足すれば追加する。これをLLMなしのbaselineとして残す。

### SI02 非信頼Plannerと型付き計画
同一仕事で既存LLMを接続し、候補parse/型/権限/予算検証→既存workflow実行へ接続する。壊れたJSON、不明Tool、循環、入力不足、injectionを拒否。適切な計画だけでSI01と同じ成果・証拠に到達する。追加学習は不要。

### SI03 検収・修正の閉ループ
異常を含む入力で独立検査を落とし、原因分類→必要nodeのみ修正→再検査を通す。上限/進展なしでは明示停止。Reviewerに権限追加を許さず、形式合格と意味品質を分ける。検査を外して成功率を上げない。

### SI04 保存/再開と制御の堅牢化
並行worker、revision競合、再起動、応答喪失、重複/逆順receipt、停止未確認、失効を試験。副作用の二重実行0、保存済み成果保持、費用予約照合、別owner拒否を証拠にする。結果不明は照合前に再送しない。

### SI05 Agent/Provider/端末への拡張
既存A2Aと共通host/runtimeへ同じjob契約を接続。まず独立テストAgent/Provider sandbox、次に承認済み実接続。主画面で同じ会話・成果・停止・明細を読めること。Pixel等の受入は同一候補のABI/モデル/権限/資源/保存復旧まで別記録。単体APK/文章生成で全OS完成としない。

### SI06 使用量・予算・作者精算
分野別計量プロンプトU01〜U03を取り込む。複数Providerでも原始usage→料金版→予約/確定→請求照合→入金→作者配分を追跡。fixture/Provider sandbox/実入金/送金を別gateにする。実契約待ちを他のruntime開発の停止理由にしない。

### SI07 モデル選択・作者UI・ニュース実務
U04/U05とAgent作成UIを接続。本人選択/適格性/評価根拠を表示し、モデルを替えてもGoal/権限/完成条件は維持。ニュースは出典付き下書きから限定受入。用途/モデル/業者ごとの評価を比較でき、未測定を隠さない。

### SI08 リリース受入と継続改善
全体回帰、migration/rollback、公開same-owner縦断、複数owner分離、運用/復旧手順を完了。GPU待ちの独自重み学習、未契約課金、未対応端末のgateを残し、受入済みscopeだけ案内。改善候補は実測を見て選び、需要/利益/超知能を未実証で宣言しない。

SI01〜04はGPU不要の最優先。独立する計量/作者UI/評価dataset準備は関連実行契約を崩さず進められる。受入条件を緩めて段階を飛ばさない。各段階で利用者が実際に触れる成果を示し、文書だけで終わらない。

## 14. 最低限の受入シナリオ

- T01 正常：Eve依頼→計画→既存Tool実実行→検査→同一job保存→再読込。モデル/Tool/成果/使用額の参照一致。
- T02 修正：不適切な成果を検査で拒否→限定修正→再検査。修正上限到達時は保留/失敗。
- T03 越権：他owner ID、過剰scope、失効grant、Tool出力内の命令、外部持出し未同意を拒否。
- T04 予算：同時実行/価格改定/見積超過/usage欠落で無断超過しない。localとCloudを混ぜない。
- T05 停止：配送前/配送中/実行中/結果不明に停止。外部停止未確認はそのまま表示。
- T06 復旧：worker crash/ブラウザ閉鎖/端末offlineから同じ仕事へ復帰。二重送信/二重課金/二重配分を防ぐ。
- T07 Agent：独立Agentが返す正常/偽receipt/過大payload/誤job/逆順結果を検査。
- T08 保存：CAS競合、旧版移行/中断、export/delete/restore、権利撤回。既存成果を保持。
- T09 選定：本人固定指定、未評価モデル、利用不可Provider、Cloud fallback未同意、digest変更を扱う。
- T10 ニュース：対立する情報/出典欠落/訂正/古い記事/重複を扱い、下書きと公開を分ける。
- T11 作者：登録/設定変更/Add/失効、本人別明細、未契約/未入金/返金/端数/再通知の整合。
- T12 UI：依頼→承認→実行中→停止/成果→明細/再開を実ブラウザで操作。空/未接続/失敗/復旧も確認。

各Tに対象候補hash、環境、入力fixture、期待/実結果、ログ参照、未実行を残す。host/fixtureからProvider/実機/本番へ合格を繰り上げない。

## 15. 検証コマンドと記録

変更前baselineとして既存対象試験を選ぶ：

```sh
node --experimental-strip-types --test tests/workflow.test.mjs tests/system-composition.test.mjs tests/sky-model-selector.test.mjs tests/a2a-parent-controller.test.mjs tests/a2a-delegation-recovery.test.mjs tests/eve-runtime-sync.test.mjs tests/sky-usage-observation.test.mjs
```

追加実装に合わせた異常系と実配送/保存の結合試験を加える。a2a-client/authorization/receipt、remote-ai、Eve history/device、settlement、AgentLibraryの該当試験を選択。低影響文言だけに実装をなぞる試験を増やさない。

```sh
npm run typecheck
npm run design:check
npm run baseline:check
npm run project:update
npm run project:check
PATH=/opt/homebrew/opt/openssl@3/bin:$PATH npm run verify
```

全体verifyはlocalhost fixtureの実行権が必要。失敗を成功へ書き換えず、原因/変更範囲/対象再試験/残るgateを記録。UI実装受入は実画面操作と読戻しを含む。native変更時はそのbranchのLinux検証、Android変更はdocs/os-prototype.md、実機はphone-preview/release gateに従う。

project.md/status/READMEと設計index・対応全体/Tool設計を同じ変更で同期。ソース/設定/小fixture/要約証拠/復旧手順をGitへ、build image/大量ログ/秘密/原稿は入れない。GitHub保存、main merge、Sites公開、実機、実請求を分けて最終報告する。

## 16. 保持する製品条件・未決の扱い

RQ01〜RQ49を保持する。特にRQ01〜15のOS/全Tool/Wallet/ゲーム/作者SDK/ATMの境界、RQ12 QEMU独立系列とPixel 10 GL066/frankel、RQ13未確定のゲーム交換gate、RQ14作者ポイント権限と実資金の分離、RQ15 ATM自社手数料0と外部実費/OS月額の分離を維持。SIM/eSIMはサービス利用権の入口でOS binary格納の前提ではない。端末/回線/profile/本人契約/導入状態を分ける。Mini/Proの物理受入は本SIのhost試験で代替しない。

未決は「必要な判断・候補・測定方法・担当・影響するgate」を記録する。ROCK内で可逆な設計/fixtureは進める。Provider契約、価格/販売地域、支払条件、公開の準備条件、不可逆な端末操作は既存了承と具体的対象を照合する。独自モデル方式や最適なモデルを先に断言せず、同一仕事の比較から決める。

最終報告は、実際に通ったT番号、候補SHA/hash、実行環境、残るgate、次のコマンドを含む。全工程の完了を単一の架空パーセントや「SI完成」で表さない。

## 17. 作成時点のGitHub入力

取得日時 2026-10-22T05:25:17.783Z。npm run prompt:contextの最新取得とref再照合成功。main `7304e449cd7938b098b0b1ce481a06501db8d795`、実在作業branch codex/esim-cloud-access `951d82d5a491a284aed4e0d4d280171d835d4b43`。ローカルは共有dirty sourceで、本文の機能がこのbranch SHAに保存済みとは限らない。main9 checks成功、branchはsource-preparationのみ成功で、今回の機能のCI合格ではない。関連#185/#184/#183/#182はmerged、#130 main-catchupほかopen PRは未統合。全量metadataはGit外/private/tmp/eve-si-full-prompt-context.log。

```json
[
  {
    "sha": "7304e449cd7938b098b0b1ce481a06501db8d795",
    "state": "PASS",
    "checks": [
      {
        "name": "collect",
        "conclusion": "success"
      },
      {
        "name": "collect",
        "conclusion": "success"
      },
      {
        "name": "collect",
        "conclusion": "success"
      },
      {
        "name": "SPIDER / repair regressions",
        "conclusion": "success"
      },
      {
        "name": "SPIDER / production web security measurement",
        "conclusion": "success"
      },
      {
        "name": "SPIDER CodeQL (javascript-typescript)",
        "conclusion": "success"
      },
      {
        "name": "SPIDER CodeQL (python)",
        "conclusion": "success"
      },
      {
        "name": "SPIDER / secrets",
        "conclusion": "success"
      },
      {
        "name": "verify",
        "conclusion": "success"
      }
    ]
  },
  {
    "sha": "951d82d5a491a284aed4e0d4d280171d835d4b43",
    "state": "PASS",
    "checks": [
      {
        "name": "source-preparation",
        "conclusion": "success"
      }
    ]
  }
]
```

このプロンプト作成ではruntime実装、Git commit/merge、公開配備、GPU/Provider契約、送金を行わない。文書作成後の検証はstatus.eveExecutionSiDevelopmentPromptへ記録する。

## 18. 本人追加方針：AMCによる開発目標と詳細タスクの追跡

本人は、AMCによって開発の詳細タスクを明確化し、それぞれの進捗へ合わせて作業を更新することで、差分・取りこぼしを検出し指定成果へ近づけることを求めた（参照チャット `01a14052-2091-7703-9d6b-c47e08dba61b`）。これは完了保証の宣言ではなく、検証可能な開発ループの要件である。

- 要望・完成条件を版付きで固定し、各条件を既存AMC Goal/Taskの入力、対象path、期待成果、依存、担当、合格条件、証拠へ対応付ける。未対応の条件を未割当として表示し、黙って除外しない。
- 既存`AmcGoal`/`AmcTask`と`amc_event`、Jennifer分解、既存WorkJobを再利用する。AMCは目的・詳細計画・進捗/差分/検収、Eveは会話・依頼・承認・実行/成果、smis（旧Sky）は能力接続、OSは本人/権限/予算/保存を担う。別job台帳を作らない。
- 実装・試験・検収・統合・配備を別状態で記録する。worker提出を独立review合格へ、テスト件数を要望網羅へ自動変換しない。
- 変更/失敗/進捗遅延時は原因、影響する完成条件・依存タスク、再検証対象を示し、現在revisionへCASで再計画を保存する。成功済み成果はhash/版が依然適合する限り保持し、外部作用を無条件再送しない。
- 最新の公開Source/候補/要求版を照合し、未着手・未検証・競合・未反映を一覧化する。承認済み範囲/予算を変える計画変更は既存Broker境界を通す。
- 最終検収では「指定結果の条件→タスク→成果hash/版→試験/独立検収→統合/公開先」を辿り、未証明条件を残して完了扱いにしない。意図的な対象外は理由と本人の決定を記録する。

今回の追記は設計/実行プロンプトの具体化であり、AMC→Eve自動接続や要望の完全網羅のruntime受入ではない。既存SI00〜08/T01〜12と公開/実機/実資金gateを維持する。

## 19. Computer Useの参考画面と実行経路

利用者が共有したInstagramの静止画には、指示からAIがPCを操作するComputer Useの紹介がある。静止画を確認した範囲であり、動画全体の実演や製品の能力は未確認。既存SI05/T05/T06/T12へ画面観測→対象確認→許可された操作→結果読戻し→同job保存の経路を対応付ける。既存Sky typesafe-computer-useはcandidate/observe-onlyであり、catalog登録を操作adapterの完成へ置換しない。

Eveは目的・手順・同じjobを保持し、Skyの対応host adapterが観測ID/対象app/画面版/操作/結果を返す。モデルの座標提案は非信頼入力。Brokerが本人/対象app/scope/期限/停止を検証し、古い観測や対象変化は再観測へ戻す。許可済みの低影響操作を繰返し確認で止めず、投稿・送信・購入等は既存承認境界を使う。操作の送信と画面上の成功を分け、結果不明のclickを盲目的に再送しない。

最初の受入は隔離された非秘密のテスト画面で、文字入力/保存/読戻しと停止・再開・owner分離・同job成果を実測する。shell/rootを汎用操作APIにしない。現セッションのCUA native pipe接続は失敗しており、実画面受入は未実施。既存API Tool経路と同じ仕事契約へ接続し、別の実行台帳を作らない。

### Miniとの共通実行経路

参照チャット「miniの設計を確認」（01a15026-972f-7f32-945a-2c2045c1f14e）と現物の `docs/rockstaros-complete-design.md#mini-spatial-computer-use` を確認。Computer Useをdesktop内に限定せず、空間対象を手/声で選択→Eveの同一目的/仕事→Skyの対応app/Tool→Broker検証→実結果読戻し→空間表示/保存へ結ぶ。Miniは場所/表示/入力、Eveは目的/計画/検査/修正、Skyは能力/接続/配送、RockstarOSは本人/権限/予算/停止/保存を担当する。

空間のobject ID/place epoch/scene revision/job artifact revisionを、現在の表示surface/active app/観測版へ解決した後だけ操作候補を作る。空間座標をそのままdesktopのclick座標へ渡さない。移設・校正喪失・focus変更は再観測へ戻し、仕事の継続と物理出力の再開を区別する。Mini側のまぶしくない表示・光学/校正/実機gateをEveのWeb/API試験で合格にしない。別のjob/請求台帳は作らない。

## 20. 共通OSの現行入口とPixel音声一周の主担当引継ぎ

人間の元指示をチャット「smis」（01a14ff2-50d6-75d1-bf5f-aadcf37e934e）で確認。「MiniもProも共通OS」「今のアプリの入口も全部つなぐ」「PixelでHey Eveから依頼・担当作成・実行・成果の普通の文章での保存、Thanks Eveで同じ仕事を停止/確認して待機へ」「一般公開まだしない」、主担当はこのeveチャット（01a15b7f-e98c-7c32-ae03-8cb61be8bd7d）。SI00〜08/T01〜12の範囲を維持し、この現行入口の縦断を次の優先工程とする。

主担当Android/Device/Local AI・ROCK、既存OS10/DSP01/CORE02/03/05/SKY21。lib/rockstar-eve-interaction.ts、components/eve-interaction-panel.tsx、現行eve-runtime-sync/account/mTLS/同owner仕事を再利用する。legacy5199 UIのadapter試験を現行全入口・実音声の合格へしない。Eveが担当を作成し、smisが道具/実行先をつなぐ。渡された /private/tmp/eve-runtime-work-port-handoff.patch は未検証案で、選択済み担当の利用だけ。担当作成済みとしない。

最初は現行runtime enqueue/read/stopのowner/pending pins/同ID/個別読戻し/stop receiptとprepare/create責任を確認し、共通WorkPortへ結ぶ。新DB・台帳・端末別仕事処理は作らない。Native13fとguestの現物/ハッシュ/鍵/停止journalを確認してからstageし、古いwork sourceを上書き導入しない。既存JDK/SDK/Gradle/cacheを使い、未確認を不存在として再downloadしない。

UI接続はnative pipe不通、ASRは未合格。合成認識文字・instrumentationを実発話へ換算しない。必要ASRは出所/用途/容量/licenseと既存候補を確認し、無断のCloud送信や重複取得をしない。本人/目的/担当/仕事/成果/費用/停止の同一性をtyped inputと実音声で確認し、保存された普通の文章のhash、Thanks Eve後の同仕事の停止receipt/結果読戻し/待機を同一候補で記録する。一般公開は保留。
