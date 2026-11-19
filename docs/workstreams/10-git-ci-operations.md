## 営業・開発・品質・運用の全社分担

2026-11-03の本人訂正「開発は？これで完全なの？」により、営業18役だけだった一覧を[全社役割台帳](../../data/company-role-map.json)へつなぐ。CEOに加え、営業・顧客運営18役と開発・品質・運用21役を定義する。旧来の開発4設定と既存11lane/95unitは再利用し、担当チャットの作り直しや実行指示の送信は行わない。

### 開発21役

| ID | 役割 | 所有責任 | 成果物 |
| --- | --- | --- | --- |
| DEV00 | [開発統括・技術責任](../../.cursor/agents/rock-engineering-lead.md) | 開発優先順位、依存関係、実装担当・検収担当・資源の割当 | 既存unit ID・候補・編集path・局所試験・検収担当を示す実行票 |
| DEV01 | [製品企画・要件・優先順位](../../.cursor/agents/rock-product-manager.md) | 顧客課題の要件化、受入条件、製品backlogとscope変更案 | 顧客課題・RQ・既存unit・成果指標・対象外を結ぶ要件票 |
| DEV02 | [UX・UI・アクセシビリティ設計](../../.cursor/agents/rock-product-designer.md) | 初回利用、依頼、承認、成果、費用、失敗・復旧の画面設計 | 状態別導線、画面仕様、文言、操作・a11y受入シナリオ |
| DEV03 | [アーキテクチャ・共通契約設計](../../.cursor/agents/rock-system-architect.md) | API、本人境界、状態遷移、保存・移行、停止・復旧の共通契約 | 責任境界、互換・移行・失敗復旧・承認・負例付きの設計差分 |
| DEV04 | [OS・Pixel・QEMU・端末](../../.cursor/agents/rock-os-device-engineer.md) | OS runtime、Broker、隔離、driver接続、端末保存・更新・復旧 | 対象source/imageと環境を固定した実装・起動・停止・保存復旧の証拠 |
| DEV05 | [Noah・接続・MCP・ストア](../../.cursor/agents/rock-sky-eve-engineer.md) | Agent/LLM/Toolの発見・追加・接続・更新・削除、MCP/SDKと権限差分 | 版・本人・scope付き構成と、Eveへ引き継ぐ接続契約・試験 |
| DEV06 | [Eve・仕事・成果・編集](../../.cursor/agents/rock-eve-workflow-engineer.md) | 目的から仕事作成、承認、実行、成果、編集、保存、停止・再開の共通体験 | owner/job/revisionが一致する仕事と型付き成果、原本保持・復旧の実装証拠 |
| DEV07 | [AI・LLM・学習・品質評価](../../.cursor/agents/rock-ai-model-engineer.md) | モデル適合、推論経路、品質・速度・資源・費用評価、許諾付き学習実験 | 固定入力・model/hash・評価分離・対照・採用/不採用理由付きの測定票 |
| DEV08 | [Web・フロントエンド・PWA](../../.cursor/agents/rock-web-experience-engineer.md) | 共通UI、mobile、a11y、PWA、3ドメインの画面と導線 | 同一sourceの画面実装・browser操作・build/asset検証 |
| DEV09 | [API・DB・同期・データ移行](../../.cursor/agents/rock-api-data-engineer.md) | API認証、owner分離、revision競合、DB migration、同期・backup互換 | 既存schema/移行履歴を保全するAPI・データ変更と正負例・復旧試験 |
| DEV10 | [独立セキュリティ・権限検収](../../.cursor/agents/rock-security-release-reviewer.md) | 本人性、scope、秘密、署名、料金・Wallet境界、悪用と失効の独立検収 | 同一候補hash・脅威/負例・再現条件・重大度付き合否 |
| DEV11 | [独立QA・回帰・実利用受入](../../.cursor/agents/rock-qa-engineer.md) | 正常・異常・復旧・回帰・端末/UIの受入設計と独立検収 | candidate/hash・手順・期待値・実測・未実行・不具合付き試験報告 |
| DEV12 | [Git・CI・統合・リリース](../../.cursor/agents/rock-release-engineer.md) | source保全、共用path統合、migration採番、固定候補、CI、配布・切戻し準備 | source/artifact manifest、検収・CI、保存/統合/配備readbackと復旧記録 |
| DEV13 | [SRE・監視・障害・サポート連携](../../.cursor/agents/rock-site-reliability-engineer.md) | 観測、期限管理、障害切分け、復旧runbook、支援から開発への不具合移管 | 影響・原因・停止/復旧・観測指標・連絡先・再発防止付き運用票 |
| DEV14 | [SIM・eSIM・利用開始・回線](../../.cursor/agents/rock-esim-engineer.md) | 回線/profile/本人利用権/client状態、端末鍵、親子接続、失効・再開 | issuer/サービス利用開始・取消・失効・復旧のadapterと環境別証拠 |
| DEV15 | [使用量・料金・請求・作者精算](../../.cursor/agents/rock-billing-engineer.md) | 単価版、見積、予算予約、usage、Invoice、入金/返金、作者精算の実装 | 一意予約・照合・台帳/receipt・失敗復旧の料金実装と試験 |
| DEV16 | [Wallet・台帳・真正収益照合](../../.cursor/agents/rock-wallet-engineer.md) | 予約・台帳・照合・取消・二重使用防止・外部Wallet adapter | owner別台帳、Provider receipt照合、互換・失効・復旧の実装証拠 |
| DEV17 | [Game・World・作者SDK](../../.cursor/agents/rock-game-sdk-engineer.md) | 非金融Game/World、作者API/SDK、sandbox、動くsample、導入診断 | 作者が導入から実行・成果・復旧まで試せるSDKと測定証拠 |
| DEV18 | [Mini・光学・回路・空間入出力](../../.cursor/agents/rock-mini-hardware-engineer.md) | 光学成立、手/声/センサー、回路・PCB、電源・熱・独立停止、機種adapter | 設計計算・反証・部品/CAD/BOM・bench・同一個体の安全/機能証拠 |
| DEV19 | [Pro・PC構成・実機・製造出荷連携](../../.cursor/agents/rock-pro-hardware-engineer.md) | 正確なSKU/BOM、非破壊データ移行、GPU/driver、熱・電力、共通runtime適合 | 同一実機の性能・更新復旧・QA、供給/販売gateの技術証拠 |
| DEV20 | [Material Invention・科学検証・CAD/BIM](../../.cursor/agents/rock-material-invention-engineer.md) | 物質/空間の仮説、再計算、CAD/BIM原本照合、Patent AIへ渡すprovenance | 入力権利・出典・再計算・不確実性・反証・成果来歴付きprivate packet |

DEV00は開発統括、REV00は営業・事業進行の窓口。CEOが製品の目的・優先順位・予算・最終判断を持ち、DEV01が実装可能な要件と受入条件へ落とす。DEV03が共通契約、専門実装者がexact pathの変更、DEV10/11が独立検収、DEV12が保存・統合・配布、DEV13が運用と顧客障害の引継ぎを担当する。

### 既存11lane・95unitとの対応

| 既存lane | 主担当role | 既存unit数 | 既存入口 |
| --- | --- | --- | --- |
| git | DEV12 | 8 | [packet](../prompts/rockstaros-development-chats/git.md) |
| os-pixel | DEV04 | 24 | [packet](../prompts/rockstaros-development-chats/os-pixel.md) |
| smith | DEV05 | 7 | [packet](../prompts/rockstaros-development-chats/smith.md) |
| eve | DEV06 | 17 | [packet](../prompts/rockstaros-development-chats/eve.md) |
| mini | DEV18 | 9 | [packet](../prompts/rockstaros-development-chats/mini.md) |
| pro | DEV19 | 4 | [packet](../prompts/rockstaros-development-chats/pro.md) |
| esim | DEV14 | 8 | [packet](../prompts/rockstaros-development-chats/esim.md) |
| billing | DEV15 | 8 | [packet](../prompts/rockstaros-development-chats/billing.md) |
| wallet | DEV16 | 3 | [packet](../prompts/rockstaros-development-chats/wallet.md) |
| game | DEV17 | 2 | [packet](../prompts/rockstaros-development-chats/game.md) |
| web-ops | DEV08 | 5 | [packet](../prompts/rockstaros-development-chats/web-ops.md) |

上表は責任を見えるようにした対応表。unit ID、全95unit、sourceOwnership、各lane JSON、チャットID、進捗状態、model指定、実機/Provider/Sites leaseは既存registryとunit台帳を優先し、今回の役割追加で移管・再起動・完了にしない。AI/LLMはeve/os-pixel、Material Inventionはminiの既存unitを使い、別の重複laneを作らない。Web実装DEV08と運用DEV13、料金system実装DEV15と業務入金照合REV16、試用成果REV14とQA DEV11を区別する。

### 共通writerと独立検収

共有pathのwriterは`data/rockstaros-development-chats.json#globalWriterCurrent`と明示された引継ぎで決める。現在参照値はgit。DEV12はこの既存Git系列の役割名であり、権限移管の証拠にはならない。REV00は営業pipeline、DEV00は開発queueの変更要求を集約し、project/status/README/共用schema/migration/CIへの更新は現在のglobal writerまたは当該変更の引継ぎ済みrootへ渡す。専門担当は専用成果物・所有pathだけを編集する。

合計activeは営業・開発・統括・Git・検収・既存実機担当を含め最大3。新しいroleを一斉に起動せず、現在地に必要な一unitだけを割り当てる。DEV10/11は実装者と別担当で同じcandidate/hashと固定合格条件を照合する。実装者がrole名を変更して自分を最終検収することは独立性に数えない。

### 営業から開発・運用へ

REV09の顧客仕事/提供範囲 → DEV01/00の要件・優先順位 → DEV02/03の設計 → 該当専門実装 → DEV10/11の検収 → DEV12の保存・統合・配布 → DEV13の運用 → REV13/14/15の導入・成果・継続へつなぐ。提供できる範囲、手作業、未実装、外部待ち、未合格gateはREV09へ返し、販売上の約束を更新する。

各引継ぎにはcase/unit ID、目的、candidate/hash、exact write set、現在owner、権限/予算、局所試験、独立検収、残件、次行動、期限を付ける。顧客に影響する障害はREV14/15からDEV13へ、再現できる不具合は該当laneへ戻す。社内準備の既承認範囲は進め、価格・契約・支出・公開・実機作用の判断は既存OWNER条件に従う。

### 役割表と実運営の完成条件

現在の結論は**責任を定義した段階であり、実運営は未完成**。役割台帳は会社全体の無条件な完全性や製品完成を証明しない。現在の既知範囲として営業18役・開発21役・11lane/95unitの対応を検査する。

| まだ実運営で必要なもの | 責任者・接続先 |
| --- | --- |
| 実案件、原本とCRM/private保存先、送信accountと許可 | CEO、REV00/06/07 |
| 実行担当、予算、候補と編集権、資源lease、独立review枠 | CEO、DEV00/12、既存lane |
| 監視・通知・当番、顧客窓口、復旧訓練 | DEV13、REV14/15 |
| 会計・税務、金融Provider、現金予算と資金調達 | CEO、REV16/17、実在する専門家。投資家交渉の専任担当は未設定 |
| 採用・人事・労務、実作業者と採用予算 | CEO、DEV00/REV00/17、必要な専門家。専任担当は未設定 |
| 法務・権利・資格判断と署名 | CEO、REV17、外部専門家 |
| 部品調達・製造・物流・安全検査の実契約と受入 | CEO、REV12/17、DEV18/19/20、OEM/組立/物流/検査機関 |

稼働の合格は実案件一件を通し、誰が何を受け取り、成果・検収・提供/復旧・顧客支援・入金照合までどう引き継いだかの証拠で判定する。設定file、bootstrap、host試験、実機、Provider、本番、一般公開の結果を交換しない。次はREV00/DEV00が既存の実成果物と進捗を照合し、必要な担当へ一件ずつ渡す。

## OS受入sourceの保全とmain適合比較（G04 / ROCK）

[16sourceの保存読戻し](../evidence/development-execution/os-reviewed-source-github-checkpoint.json)と[main7既存/9未追加・具体差分/依存/最小候補/試験](../evidence/development-execution/os-main-adoption-feasibility.json)から再開する。main固有download allowlist/legacy/workflow/stopを保持し、Source不存在だけで不可とも一括置換可とも判断しない。凍結保存、main runtime採用、実機性能/P02、Source完全D1baseを区別する。

## 開発モデル割当と有限実行（G04 / ROCK）

[モデル指定付き入口](../prompts/rockstaros-development-chats.md)と[unit別model/effort](../../data/development-model-routing.json)を使う。通常実装93unitはGPT-6.1 Sol、OS-17/MINI-02の設計はAstra、読取補助はLuna。別担当の検収、同候補・固定合格条件、切替を含む総試行3回、統合/Git/元Smith/実装/補助/検収を合計したactive3枠を守る。実行時はmodel/thinkingを構造化引数へ渡し、適用未確認を切替済みと記録しない。プロンプト作成と既存チャットへの実装指示送信・GitHub保存・製品受入は別。初回5受入batchの実装・検収・手戻りの総消費で配分を見直す。

## GIT-02/03：main契約と統合checkout（2026-10-24 / G04・DOC01・DB01 / ROCK）

第2試行：保存時の同一transaction fenceと停止失効tombstone、boolean/scoped listの厳密正規化・owner隔離・main専用reader保持、固定race/負例をrevision2へ追補。revision1/独立レビューはhistory receiptから追跡できる。runtime受入はまだなく、Astra再検収後にGIT-04へ進む。ESIM-01のsetup/testは単独writerへ保持し、CI連動配備副作用を最終merge前に確認する。

[固定契約revision2とhash](../evidence/development-execution/git-02.json)、[checkout・PR依存・所有](../evidence/development-execution/git-03.json)を今回の再開入口とする。main7304e449にRootのEve差分をadditiveに統合し、mainのAMC/物質/構成検証、RQ50/compute-grid、既存setup/attachmentとowner/CAS/予約を保持する。Root0064/0065はmain0030/0031とbyte一致するため二重CREATEを避け、適用DB/journalはGIT-04で確認する。140USD案と16USD契約の未解決境界を自動採用しない。managed checkoutは`/Users/kaiya/.codex-work/worktrees/rock-main-integration/avokdo`、branchは`codex/rock-main-integration-20261024`。Root branch/indexはそのまま。局所28passはRoot hostのみ、runtime移植/CI/GitHub保存/main統合/実機/公開は未受入。独立検収を経てGIT-04へ進む。

## 履歴成果の再利用と有限dispatch（G04 / ROCK）

[成果台帳](../../data/rockstaros-chat-achievements.json)の自laneと短いpacketを先に読み、元23チャットの採用/反証/同artifact証拠/現source差を維持する。source保全・main契約照合→single-writer引継ぎ→一unit実装→独立検収→小保存→次eligible unitを有限に回す。全95unitの実行状態は[unit台帳](../../data/development-unit-progress.json)へ統合担当だけが反映する。元Smithが実機操作中なら合計3枠に算入。初回bootstrapと既存実装の受入、未知/不成立/外部待ちと全製品完成を分ける。MATERIAL-01のRQ49/MAT06 bridge詳細を含むが、今回の文書追補からruntimeや実機/実課金の実行を始めない。

## 作業別の軽量チャットと全機能照合（2026-10-24 / G04 / ROCK）

[軽量分岐入口](../prompts/rockstaros-development-chats.md)から11担当へ進む。元P01〜13/75unitを保持し、追加機能棚卸しの56不足項目＋2算法を20unitへ補って95unitとする。チャットID/所有/依存は[registry](../../data/rockstaros-development-chats.json)、進捗は各lane JSON、全行は[180項目＋10算法](../../data/rockstaros-full-function-coverage.json)。Git担当がglobal schema/workflow/移行採番/正本/CIをsingle-writerで統合する。初回は小さいsource/contract bootstrap、以後も一つのunitずつ。元SmithのPixel実機leaseを守り、OS広域所有からWallet/Game/Miniのsubtreeを除外する。全verifyは固定統合候補で集約し、前版の検証を新prompt SHAへ転用しない。文書作成・bootstrap・GitHub保存・main統合・配備・実機/本番受入を分離する。

## 5領域・元13件の詳細実装とGit保存/統合（2026-10-23 / G04・ROCK）

[詳細統合プロンプト](../prompts/rockstaros-remaining-work-development.md)と[対応表](../../data/rockstaros-remaining-work-plan.json)へ進む。Git・eSIM・請求・Smith・Eve/OS・Mini/Proの75子作業を既存taskへ結び、最初にdirty/別Source/公開/mainの差分保全と再開先を同期する。mainにあるeSIM/setup/monthlyを再実装せず、Root限定Remix/media・最新Mini v08/PDF52・Pro localStorage移行を共通workflowへ統合する。同一候補の局所/全verify・CI・独立検収後、通常GitHub保存とmain readbackを閉じ、配備・実機・Provider/本番は別gate。今回文書改訂は実装/Git統合の実行ではない。

## 未完了13件の引継ぎ・Git入力（2026-10-23 / G04・OS10 / ROCK）

[統合開発プロンプト](../prompts/rockstaros-remaining-work-development.md)と[対応表](../../data/rockstaros-remaining-work-plan.json)へ進む。P01〜P13を既存taskと結び、eSIM・請求・Mini/Proを含む。main7304e449/branch951d82d5の669/3分岐とRoot/別Sourceを保全・照合し、最初に引継ぎ入口を同期する。ROCK実装と外部/本人/実機/本番の受入を分ける。作成時の検証は[証拠](../evidence/rockstaros-remaining-work-prompt.json)へ記録し、文書保存をruntime/main統合の完了にしない。

# Git / CI / Operations

<a id="operations-acceptance-20261020"></a>
## 開発・配布・日々の運営の照合と実行順（2026-10-20）

本人の列挙を既存`G04`・`LCH06`・`DB01`、Security、Release、Business Pilotの横断受入へ結ぶ。主担当はGit / CI / OperationsのROCK。GitHub/Sites/配布/監視/決済ProviderはEXTERNAL、同一artifactの配備・読戻し・障害訓練はJOINT、main統合・公開・契約・実機操作・本番課金はOWNERの既存条件で扱う。

| 順 | 実行と合格証拠 |
| --- | --- |
| 1 sourceと移行 | source、設計、data schema、API contractを版とSHAへ結び、migration journal・旧data読取り・中断/再実行・rollback可否を照合する。現branchはmainより625 commit遅れ、3 commit先行のため、まずmainの引継ぎ入口と優先順位を同期し、共有dirty差分を保全する。 |
| 2 環境別検証 | 単体→結合→悪意ある作者codeを含むsandbox→QEMU→対象実機→本番を別結果にする。同じsource SHA・配布物SHAとCI/checkを固定し、未実行/skip/checkなしを合格にしない。旧image/APK/PWA/Linux workerの証拠を相互転用しない。 |
| 3 配布と切戻し | OS image、APK、PWA、Linux workerごとに署名・互換・段階配布・rollback/データ復旧・実応答読戻しを記録する。GitHub保存、main統合、Sites配備、一般公開、実機対応、本番課金を別eventにする。 |
| 4 観測と事故 | owner/job/artifact/usage/provider取引IDを結び、稼働率、遅延、失敗率、queue滞留、請求差額、資源費用を測る。監視閾値と担当/連絡経路を決め、失効・障害・悪意ある作者商品・端末紛失の隔離、停止、照合、復旧訓練を行う。監査は改ざん検知付きで保護し、診断には本文・個人情報・秘密値を入れない。 |
| 5 継続運営 | 鍵/証明書/ドメイン/Provider資格情報の期限とrotation、脆弱性/依存/SBOM/license、通報/悪用停止、契約終了/返金/持出し/紛失時の手順を受け入れる。導入時間・成功率・再利用率・復旧時間、真正な売上/入金/直接費/支援時間を同一顧客/仕事単位で照合する。 |

完了判定は対象を固定したrunbook、source/artifact SHA、同一候補の試験/CI、配備読戻し、失敗時のrollback証拠、監視・support担当を揃えた範囲だけに限る。公開・実機・本番課金の表示は各gate合格後に行う。検証入口は`npm run project:check`、`npm run database:check`、`npm run repository:check`、`npm run verify`、対象branchのOS/Android試験。今回の照合は運用開始や本番合格ではない。

## 2026-10-17 ローカル参照の安全な整理（G04 / ROCK）

最新の `origin/main` をfetchし、G04のdirty保全・main同期を再確認した。local `codex/esim-cloud-access` は `951d82d5a491a284aed4e0d4d280171d835d4b43`、fetch後の `origin/main` は `f2a2fba8`。merge-base `9f64aee3` からlocal-only 3 commits / main-only 555 commits。作業treeの未commit変更9 paths（tracked 8、untracked 1）と18 worktreesを維持した。

`git remote prune origin` で、origin上に存在しないremote-tracking refs 8件を除去。local branch削除はしない。origin/mainへ到達可能でworktree非使用の候補44本は見つかったが、通常の `git branch -d` が現在のcheckout基準で未mergeとして拒否したため、force削除せず保持。未統合のcurrent branchとworktree利用中branchも保持した。fetch/pruneはremote branch、commit、PRを削除・変更しない。mainへのmerge/rebase、stash、commit、push、worktree pruneは未実施。

検証: `npm run project:update`, `project:check`（104/163）, `baseline:check`（RQ01〜RQ49）, `design:check`（18領域 / catalog 34 Tool / native 6 family）, `git diff --check` 合格。必須の `npm run verify` は既存 `data/database-status.json` と `docs/database-status.md` の再生成要求で `database:check` がexit 1、後続stage未実行。remote prune後も元の未コミット9 pathsを保持し、記録追補差分も保持。次はdirty変更をtopic単位に読み合わせて保存/commitし、最新main起点の新branchへ必要差分を移す。555 commitの古いbranchへ直接mainをmergeしない。`git worktree list`・PR/CI・DB migration履歴と対応を取り、同一候補を検証してからGitHub保存/main統合へ進む。今回のlocal参照整理は本作業treeの変更や製品受入を意味しない。

## 2026-10-13 Notion図解ガイド（G04 / ROCK）

現行main `4273ef02`の実装・進捗・設計・schemaを4つの詳細資料、5つのPNG図、Mermaid構成/sequence/ERへ整理し、既存avocadoの子資料として配置する。料金方針と確認できない実売上を分け、Mini/Pro設計、Pixel APK、QEMU、公開Webを同じ受入へ換算しない。実catalogは37件/ready15件、PROJECTS.mdの36件/14件は旧集計。個別の本文・共有URLはGitへ転載せず、範囲と読戻し・検証結果は`data/project-status.json#notionVisualGuide`に残す。既存G04のdirty保全・main/branch/DB同期は継続し、Notion整理をruntime修正や公開受入として扱わない。


表示改訂：入口を全体図・7領域の現在地・次の3作業へ再構成。詳細4ページの重複表示を削り、Mermaid5図はプレビューのみへ変更。新入口の導線・画像・表をブラウザで確認し、旧案内と空フォルダを退役した。証拠は同じnotionVisualGuideに追記する。

## 目的

設計、実装、証拠、branch、PR、CI、Sites配備、release artifactを追跡可能にし、別候補や別環境の成功を混同しない。

## 2026-10-13 Notionの重複整理（G04 / ROCK）

利用者の明示削除指示により、類似旧企画・旧依頼・別repo案内・例示DB等23件をNotionのゴミ箱へ移動し、全件の復元表示を確認。共同作業トップとavocado現行ページの正本リンクを`k999ln/rock`へ統一し、削除ページへの案内を除去した。例示DB配下サンプルは23件に含めず、元の議事録・日報は履歴として保持する。GitHub repo本体や他の独立事業の削除、公開権限変更ではない。私的本文は保存せず、範囲と検証だけを`data/project-status.json#notionCleanup`に記録する。G04のGit/DB同期と個別受入gateは未完了のまま。

## 2026-10-13 Notion進捗の同期（G04 / ROCK）

利用者の更新指示に基づき、main `4273ef02`と同一SHAの6 checks success、Grid PR #103のopen状態を再取得。Notionのavocado専用現行進捗、日報2件、旧提案タスクの4ページを更新し、証拠リンク・未受入領域・関連プロジェクトを読戻し確認した。誤った未完了0件と予定の完了ラベルを訂正。私的本文はGitへ保存せず、Notionの履歴は保持する。今回の手動同期を自動化の完成へ換算しない。既存G04のGit/DB統合やruntimeの受入状態は変更せず、検証結果は`data/project-status.json#notionProgressSync`へ記録する。

## 2026-10-13 Notion進捗との照合（G04 / ROCK）

利用者指定の正本は`k999ln/rock`。main `4273ef02da9dbb28ede8ba8862b874615fa8a0d7`を取得し、PR #109のColumbia入口とPR #111の品質/複数Tool統合を確認した。PR #111の検証headは15/15 success、後続mainの取得6 checksは全success。共有Notionの個別内容はチャットで報告し、私的な本文・他事業の記録はここへ転載しない。Notionは未編集。

local baseline v1.97/160 taskに対しmainはv1.98/393 task。local `codex/esim-cloud-access` / `37c06cec`は先行dirty差分があり同名remoteなし。G04の順序は保全→最新main/引継ぎ/DB履歴の同期→個別差分の照合→統合候補検証を維持する。既存のlocal/公開/実機証拠をmainの受入へ移さない。

合格証拠はGitHubの同一SHA、PR merge readback、対象source/受入資料の対応。初回取得時の統合前snapshotは、後続mainで`mainMerged:true`へ更新済み。Notion整理では履歴と現行要約を分け、repo・task ID・SHA・実装/検証/公開/実機/本番段階を明示する。文書検査は合格、local全体verifyは既存DB集計ファイル2件の不一致で停止。記録と検証結果は`data/project-status.json#notionProgressAudit`と`project.md`。今回の記録のcommit/push/main反映、Notion更新は未実施。

## 2026-10-07 Git全体監査（G04 / ROCK）

結論は「監査完了、Git整理は未完了」。以下は監査文書を追記する前のsnapshot。元worktreeのmerge/reset、branch削除、commit/push、公開、GitHub設定変更は実施していない。[機械可読証拠](../evidence/git-organization-audit-20261007.json)にSHA、全branch/worktree、比較対象path、競合、CI、検証ログhashを保存した。

- **GitHub**: 全91 PRは74 merged、5 open、12 closed。main `0fbf688b4585b829f9e34d37799d446cb5a66b32` の取得11 check-runsは全success。open #84/#88/#89/#90はmergeable、#85はconflicting。5件とも各PR候補のチェックは成功しているが、統合済みではない。#69のbuild出力除外はmainへ統合済み。
- **作業木**: 全8 worktree中3つに計127変更file（同じpathの別worktree出現を含む）。rootは64 tracked変更＋33 untracked＝97。Pro PCは5、portable-runtimeは25。portableの20 fileはmainとblob一致、残りはmain側の3記録と2試験の`void test`修正が新しい。未commit件数を新規未統合機能数にしない。stashと現在のunmerged indexは0。
- **rootの分岐**: `codex/esim-cloud-access` / `37c06cec` はlocal-only2、main-only165 commit。同名remote/PRはないが、関連するPR #85にはroot変更の21 fileと同一内容がある。rootの4 fileは既にmainと同一。既存PRと後続実装を照合し、再作成を避ける。
- **競合**: 隔離cloneの`merge-tree`で、PR #85対mainは8 file、root作業snapshot対mainは31 file競合。#85の対象は`.github/spider/gitleaks.toml`、`.github/spider/public-value-provenance.json`、`.github/workflows/spider.yml`、`app/connect/page.tsx`、`data/database-status.json`、`data/project-status.json`、`docs/database-status.md`、`project.md`。
- **DB移行**: mainは`0059_sky_library`、PR #85はそれに`0060_esim_cloud_access_keys`を追加。rootは`0059_esim_cloud_access_keys`、`0060_sky_usage_payments`、`0061_esim_cloud_proof_uses`を持つ。適用済みDB履歴を確認し、番号・journal・schema・snapshot・migration union試験を統合する。既適用migrationを無条件に改名しない。
- **進捗正本**: rootは160 task、mainは378 task。共通ID156、rootだけのIDは`B06/G04/SIM01/SKY21`、mainだけのIDは222。両者のbaselineはv1.96だが内容は異なる。taskの後継関係と合格証拠を確認して同期する。
- **branch整理**: local16 branch、実在remote10 branch、削除済みremote tracking38参照。local `main` は426 commit遅れ。remoteの`codex/jev-decision-layer-20260920`と`codex/pixel10-compile-bringup-20260917`はmainの祖先。`codex/os-completion-prompts`（1 commit）と`fix/readme-english-ci`（3 commit）はmainへ一致するpatchがなく、open PRもないため回収判断が必要。
- **生成物**: mainから削除済みの`services/sky-billing/work/sky-billing-dry-run/worker.js`と`.map`がrootでは追跡・変更されている。古いtreeから再導入しない。固定vendor原本・依頼済み設計archiveとは区別する。
- **履歴と設定**: closed12 PRのうち5 headはmainの祖先、#59はpatch同等で#60へ置換。#5の署名workflow、#6の署名script/testはmainとblob一致。#14/#11/#9/#4には現行実装・文書への置換理由が記録されており、patch非同等だけで紛失扱いしない。GitHubはmainの`protected=false`、ruleset一覧なし、merge後branch自動削除ON。設定は変更していない。

検証: `git fsck --connectivity-only --no-dangling`、`git diff --check`ともexit0。`TMPDIR=/private/tmp npm run verify`は初回sandboxでlocalhost `listen EPERM`によりexit1、通常権限で再実行してexit0（Node897、Worker/D1 1178、CSV113、Web asset missing0）。署名アクセス証拠の9 source hash、共通決済証拠の8 source hashも現在のsourceと一致。ローカルruntimeのfixture合格であり、main統合候補・Provider・実機・本番配備の受入ではない。監査後の文書同期チェックは証拠JSONへ別記する。

次の順序: (1) 全dirty treeを保全して最新main/引継ぎ入口を同期、(2) 依存/security PRを同一候補で検証して統合、(3) #85の競合を解き、後続の署名・決済・compositionを必要差分だけ回収、(4) migrationと進捗/設計正本を照合、(5) 統合候補の全体verifyと同一SHA CI、(6) GitHub保存・main読戻し後に既統合worktreeと不要branch/参照を整理。Claudeのアカウント主導案は提案資料であり、本監査で製品方針・料金を変更した事実はない。

## 2026-10-05 未統合PRの現行mainへの収束

利用者のmain反映指示により、G04で未統合20 PRを照合する。SIM/eSIM利用開始、本人認証、署名付きモデル、見積・上限の現行契約を保持する。依存PR #53/#54/#55/#56/#60を統合し、Cloudflare peer型とlockを整合させる。依存変更後は `node scripts/sync-web-license-inventory.mjs --write` でlock由来の在庫だけを再生成し、法的clearance・公開gateは独立して維持する。全体verifyと同じSHAのCIが完了するまでmain統合完了とは記録しない。

## 2026-10-02 共通実装統合

G04では[重複実装の統合記録](../git-consolidation.md#2026-10-02-共通実装の統合g04)に従い、既存mainとPR #39/#51、AI/MCP/保存/決済/公開Previewの共通処理を一つの検証経路へまとめる。下記の「open PR 0」は2026-09-15時点の履歴であり現在値ではない。今回固有機能を持つ未merge PRを削除せず、共通処理の更新後に各branchをrebaseする。

## 現在地

- 正本は `k999ln/rock`、originはGitHub、Sitesは配信用と定義済み。
- 進捗は `data/project-status.json`、要望は `docs/product-baseline.md`、再開条件は `docs/current-state-20260911.md` に分離されている。
- DB状態は5境界のsource inventoryと本番readbackを分離し、`database:status`でJSONと文書へ同期する。
- 2026-09-15にsites/mainとの競合を解消し、統合commit `acd7ab0`へ収束した。
- 2026-09-15にGitHubのPR #1〜#23を再監査し、13件はmain統合済み、10件はmainへ同一または後継実装が統合済みの旧PRとして閉じた。open PRは0件である。
- GitHub remoteの旧作業branchと一時archive branchを削除し、remote branchを`main`だけへ収束した。repository設定のmerge後branch自動削除も有効化した。
- 最新mainの版境界、repository map、schema、DB source、進捗、全体CIを照合した。GitHub保存と本人限定Sites配備・本番D1 readbackは別であり、Sitesのowner workspace access blockerは未解決である。
- 別のローカル作業履歴はGitHub正本へ自動採用しない。mainへ既に入った変更、確定要望を増やす名称・要件変更、採用根拠のない差分を分け、必要な変更だけを最新main起点の単一branchへ移す。

主なtask: `R02`, `R04`, `R05`, `G01`, `G02`, `B04`, `LCH06`, `DB01`。

## 次に進める順番

1. 新規作業は最新`origin/main`から一つのtask branchを作り、既存task IDと完了条件へ結び付ける。
2. 正本5ファイルのversion、task状態、nextActionを同じ変更単位で一致させる。
3. 対象試験から始め、最後に`npm run verify`を完走する。
4. PRの同じsource SHAでCIを確認してmainへ統合し、merge済みbranchは自動削除する。
5. Sites配備・本番readback・一般公開・release公開はGitHub保存とは別に記録する。

## 完了条件

- GitHub remoteのopen PRと未整理branchが0で、正本branchが`main`へ収束している。
- README、project、product baseline、project statusが同じ現在地を示す。
- 同じsource SHAのCI結果を保存し、古いsnapshotを最新確認に使わない。
- GitHub保存、Sites配備、一般公開、release公開を別イベントとして記録する。

## 関連資料

- [rocketstar・衛星・OS・ボタンの完全保存アーカイブ](../rocketstar-design/README.md) — DOC03。利用者の保存指示により原本・生成元・旧版・QA画像を保持し、全ファイルのhashを検査する。現行R5要件とアーカイブ内E3前提は分ける。

- [Git consolidation](../git-consolidation.md)
- [Prompt playbook](../prompt-playbook.md)
- [Design/implementation alignment](../design-implementation-alignment-20260909.md)
- [Current state](../current-state-20260911.md)
- [Project status](../../data/project-status.json)
- [Database status](../database-status.md)

## 検証

- `git status --short --branch`
- `npm run project:check`
- `npm run repository:check`
- `npm run database:check`
- `npm run verify`

## 開発チームの担当と引継ぎ（2026-10-21 / G04 / ROCK）

開発チームの統合責任はこのworkstreamが持つ。各実装は既存task IDと主担当workstreamを一つ選び、編集pathを宣言してから進める。共有作業木の未コミット差分は先行作業として保全し、他担当の変更を戻さない。4つのproject agent設定は以下のとおり。

| 役割 | agent設定 | 主担当・最初の既存task | 最初の納品と合格証拠 |
| --- | --- | --- | --- |
| 統合・優先順位 | このチャットの統合担当 | Git / CI / Operations、`G04` | dirty差分と最新main/branch/PR/CI、DB migrationの照合。編集pathと統合順を固定し、`project:check`、`repository:check`、`database:check`で検証 |
| OS・端末 | [rock-os-device-engineer](../../.cursor/agents/rock-os-device-engineer.md) | Android / Device / Local AI、`OS02`・`OS10`・`N03`・`RLS02` | Pixel一件の能力、本人承認、保存/復旧の契約差分とhost/Android証拠。実機boot・flashは別gate |
| Sky・Eve | [rock-sky-eve-engineer](../../.cursor/agents/rock-sky-eve-engineer.md) | Sky / MCP、`SKY21`・`SKY20`・`UXRS01` | 同一owner/jobのSky発見・Add→Eve依頼/承認→実行→成果/費用/停止・復旧fixture |
| Web体験 | [rock-web-experience-engineer](../../.cursor/agents/rock-web-experience-engineer.md) | Web / PWA / Sites、`HOME01`・`WEB04`・`WEB06`・`WEB13` | 同じjobの画面導線、PWA、3正式ドメインの役割。source/build/Sites/実responseを別々に照合 |
| 独立検収 | [rock-security-release-reviewer](../../.cursor/agents/rock-security-release-reviewer.md) | Git / CI / Operations、`G04`。横断gateは`SIM01`・`SYS13`・`BIL02` | owner越境、replay、失効、費用上限、二重使用、migration、同一SHAのCIを実装担当と別に判定 |

実装順は(1) G04で最新mainと共有branchの引継ぎを同期、(2) Sky/Eveの一件縦断契約とOS adapterの対象pathを確定、(3) Web画面を同じ契約へ接続、(4) 独立検収と統合候補の`npm run verify`。Sky/Eveは仕事・権限契約、Webは画面を所有し、共通componentや進捗正本は統合担当が編集順を調整する。QEMU Developer Preview、Pixel Physical Device Preview、Provider sandbox、本番配備はそれぞれ別の受入である。

現時点ではagent設定と担当割当をローカルに保存した段階。これを実装、branch commit、main統合、実機、公開済みとは記録しない。GitHub main、PR、同一SHAのCIは実装開始時に再取得する。

### GIT-04: explicit local D1 filename alias compatibility

`scripts/sqlite-migration-aliases.mjs` prepares an **offline SQLite copy** for the existing Wrangler filename migrator. `data/migration-aliases.json` pins 11 exact Root/main SQL aliases, including Root0064/main0030 and Root0065/main0031. Existing SQL and Drizzle timestamps are never changed. This helper is exported through `scripts/sites-migration-lineage.mjs`; build, start and deployment do not invoke it automatically.

Read a plan with an explicit complete frozen source lineage and target lineage:

```sh
node scripts/sqlite-migration-aliases.mjs --database /absolute/offline-copy.sqlite --source /absolute/frozen-root/drizzle --target /absolute/integration/drizzle
```

Only after reviewing that plan, use the same arguments plus `--backup /absolute/unused-backup.sqlite --plan-digest DIGEST` to record verified aliases. A separate backup is exclusively created and logically read back before `BEGIN IMMEDIATE`; state/source drift, filename-byte mismatch, incomplete source schema, unknown audit records and concurrent writers refuse the operation. Backup files contain private database contents and stay outside Git. Failures roll back all filename/audit inserts; retries require a new plan and unused backup path. Keep the backup and original store. Restoring a backup over a newer live database can erase tombstones: restore into a separate copy and re-review, never overwrite current state automatically.

The helper adds only missing canonical names to `d1_migrations` plus an immutable alias audit. It does not replay application SQL, weaken constraints, rewrite `__drizzle_migrations`, perform remote operations, enable billing, or grant runtime completion. Old pending jobs, receipts, stop/revocation records and deletion tombstones remain in place. A high Drizzle timestamp is **not** reconciled by filename aliases.

`remainingMigrations` is an unresolved gate, not permission to call `npm start` or apply those SQL files to Root. The frozen complete Root has 8 target migrations still pending after alias normalization; missing additive CSV/provider columns, partially overlapping Jennifer objects and same-name guard differences need a separate reviewed schema/trigger union. The separate Eve Source lineage also needs its explicit complete base before application. GIT-02 revision2 save fences and list compatibility remain runtime-port requirements.

Verify with `node --test tests/migration-aliases.test.mjs tests/sites-migration-lineage.test.mjs`, the existing `tests/migration-union.test.mjs` (localhost/workerd), and `npm run schema:check`. These are host/SQLite/D1 fixture checks; production readback and runtime acceptance remain separate.

GIT-04 attempt2 (2026-10-24): planner executes zero source SQL. Complete reviewed `data/migration-reference-profiles.json` pins all journal/SQL bytes and expected alias objects. Read snapshots are query-only/defensive with deny-by-default SQLite authorizer; write authorization is metadata-only, unknown metadata triggers refuse, and precommit domain/history/audit invariants must match. Replay revalidates schema/index/trigger/provenance/history every time. The offline helper requires SQLite authorizer/serialize/deserialize APIs (tested Node26.12.1); older runtimes fail closed. Attempt1 audit provenance is unaccepted and is never silently upgraded. New source evolution requires a reviewed profile, not automatic regeneration. 20 focused+13 existing D1 tests pass; second independent review and complete union remain pending.

## DB派生進捗の検証再受入（G04/WEB04、ROCK）

2026-11-02、共有Rootの派生文書は着手時点で再生成済み。`npm run database:check`で6境界/189 tables/source6/6/current production readback0/6を確認し、`PATH=/opt/homebrew/opt/openssl@3/bin:$PATH npm run verify`がexit0。本体1858件/失敗0/skip1、API2152/CSV113。以後進捗・schema・migrationを変更した際は`npm run database:status`でJSON/文書を生成し、checkを行う。この操作は実DBへのmigration適用ではない。[同一作業木の証拠](../evidence/database-progress-verification.json)と過去のPixel-specific検証を分け、古い失敗履歴を消さず解消追記でつなぐ。GitHub main統合・公開・Pixel再導入は行っていない。
