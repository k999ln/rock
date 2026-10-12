# RockstarOS コロニー中核化の実装監査

2026-09-23 / 読取監査。対象repoは変更していない。

対象: `/Users/kaiya/Documents/Codex/2026-09-20/mo/work/rock-mini200-e1`
HEAD: `5d5f3dc4f73ac3389c8dbc00f9ca6e8beba526e0` / branch `codex/readme-navigation` / clean: `True`

**結論: RockstarOSには使える運用基盤の実コードがある。コロニーの中核を、操作者・仕事・権限・記録・通信をまとめる監督層として構築できる。ただし、生命維持、電源保護、飛行制御の実装・認定が既にあるという意味ではない。**

この監査ではネットワーク・GitHub照合・原repo編集・端末操作・実機試験を実施していない。リポジトリの保存証拠と今回のコード確認を区別する。

## 1. 今回と過去の証拠

- 今回再実行: 公開 Control Core の純粋な Node 単体テスト 4/4。外部通信・実機なし。
- 過去の保存証拠: QEMU rc2 の開発鍵による起動、A/B、復旧。対象sourceは b7d819cd 系で、今回HEAD全体の再受入ではない。
- 過去の保存証拠: Pixel 10 / GL066 の試験署名APK、2工程Tool、保存、実再起動、暗号化backup export。完成OS image、flash、OTA、全損復旧の受入ではない。
- OS本文の全体状態図や計画を、個別runtimeの実装済み状態へ読み替えない。

## 2. 再利用する実装と不足

### OS01 Platform 登録・権限・承認

証拠段階: `runtime_source_inspected_and_recorded_apk_acceptance`

**確認したこと:** PlatformStore の component 登録、UID/署名/版の境界、PROPOSED→ISSUED→CONSUMED 承認、世代変更による旧承認停止。owner/request key、payload digest、action、期限、費用上限を照合する実装。

**再利用:** 新規 colony component を既存 dev.rock の capability 境界へ接続。操作者の要求と装置の実行権限を分ける。

**不足:** 現行の TOOL/MCP/PROVIDER と Android owner 権限を、そのまま設備管理の役職、二者承認、ローカル非常操作へ転用できない。専用契約と署名・時刻・現場優先権の実装が必要。

根拠: `android/core/src/main/java/dev/rock/core/platform/PlatformStore.java` / `contracts/platform-api.json` / `docs/platform-core.md`

### OS02 Web の仕事状態・競合検査

証拠段階: `runtime_source_and_tests_inspected_not_rerun`

**確認したこと:** WorkJob は active/review/completed/cancelled。command ID 冪等性、revision 競合、工程順序、sample を工程成功に数えない処理がある。

**再利用:** 保守作業・点検・資材調達・検査承認のUIと仕事状態に再利用。

**不足:** 設計書の draft/ready/waiting/failed を全て現行 Web runtime 実装済みとしない。生命維持の高速ループ、搭載機のGNC、秒以下保証はない。

根拠: `lib/workflow.ts` / `tests/workflow.test.mjs`

### OS03 Android Engine・Zema・固定 Local AI plan

証拠段階: `runtime_source_inspected_and_recorded_physical_apk_evidence`

**確認したこと:** SQLite 上の work/run/event、選択済み Tool token、固定 article-preparation@1 入力の非信頼 planner と独立検証。Pixel APK記録は2工程、実再起動、結果・履歴回復を含む。

**再利用:** 操作者の要求を説明可能な有限作業へ整える構造。AIは提案だけを返し、機械検証後に仕事を生成。

**不足:** 汎用設備プランナー、最適運転、異常診断の物理妥当性は未実装・未受入。LLMを直接 actuator に接続しない。

根拠: `android/core/src/main/java/dev/rock/core/Engine.java` / `android/automation/src/main/java/dev/rock/automation/ZemaOrchestrator.java` / `android/tool-sdk/src/main/java/dev/rock/sdk/ZemaToolPlan.java` / `docs/evidence/android-pixel-10-prefull-physical-20260916.json`

### OS04 MCP Broker の永続状態・結果不明照合

証拠段階: `runtime_source_and_owned_fixture_tests_inspected_not_rerun`

**確認したこと:** Private SQLite、FULL同期、単一writer flock、subject/device/alias/epoch、immutable consent、容量上限。sending 再起動後は unknown、送信claim済みは execute を再送せず reconcile を使用。

**再利用:** 遅延・切断を伴う設備への指令意図と照合の考え方を再利用。capability の有限集合と generation fence を維持。

**不足:** 現行は所有fixture中心。物理装置の at-most-once 作用保証、時刻同期、実無線、宇宙リンク、複数拠点 consensus は提供しない。

根拠: `systems/rock-star-os/os/mcp_broker/broker.py` / `systems/rock-star-os/tests/test_mcp_broker_core.py` / `systems/rock-star-os/tests/test_mcp_broker_lifecycle.py`

### OS05 MCP Runtime の fixture 明示

証拠段階: `runtime_source_inspected`

**確認したこと:** runtime metadata は simulation_only=true/provider_connected=false。再開時の authority・設定・CA hash・保存fileを確認し、履歴欠損を新規状態として自動初期化しない。

**再利用:** SIM_ONLY と実機接続状態を外観上も契約上も分離する方式。保持履歴喪失時の閉鎖を新設計にも使う。

**不足:** 本番Provider、機器認証局、コロニー内認証局、衛星間切替は未接続。

根拠: `systems/rock-star-os/os/mcp_broker/runtime.py`

### OS06 SQLite データ保存境界

証拠段階: `runtime_source_and_design_inspected`

**確認したこと:** Web D1、Operator Dock D1、Wallet、Android Engine、Android Platform を異なる正本として分離。Store に冪等job・制限された状態遷移とSQLite WAL。

**再利用:** 運用指令台帳、telemetry、資材台帳、操作者私有データを別に保管し用途ごとの retention を定義。

**不足:** 既存金融台帳を酸素・水・電力計測に流用しない。多拠点 replication、長期断線、測定時刻品質、校正情報、災害復旧は追加が必要。

根拠: `docs/data-storage-boundaries.md` / `systems/rock-star-os/src/blackberryrock/storage.py` / `android/core/src/main/resources/schema.sql`

### OS07 Backup と復元後の権限停止

証拠段階: `runtime_source_inspected_and_recorded_partial_physical_evidence`

**確認したこと:** AES-GCM backup、独立回復secret、空のowner対象へのtransaction復元、automation停止、Sky token rotation、旧承認停止、component authorityを復元しない。Pixelはhardware-backed exportと非破壊再起動の記録。

**再利用:** 復元を新たな設備操作権限として扱わず、ローカル監査を経て再有効化する。

**不足:** Pixel全損・Keystore喪失の実機復旧は未実施。コロニー冗長ノード、全拠点喪失、長期オフライン鍵回復、RT制御の無停止切替は未受入。

根拠: `android/core/src/main/java/dev/rock/core/platform/EncryptedBackup.java` / `android/core/src/main/java/dev/rock/core/platform/PlatformStore.java` / `contracts/platform-api.json` / `docs/evidence/android-pixel-10-prefull-physical-20260916.json`

### OS08 Linux/QEMU A/B更新・復旧

証拠段階: `source_present_and_recorded_qemu_candidate_evidence`

**確認したこと:** rc2 b7d819cd候補のA/B更新、失敗rollback、backup、current-copy二重使用防止の内部証拠を記録。開発鍵、draft_not_public。

**再利用:** 監督端末のイメージ署名、互換schema確認、段階更新、失敗回復のパターン。

**不足:** 正式署名、最終同一候補受入、flight computer、耐放射線メモリ、宇宙環境、停電/部分故障の生存性は未証明。現在HEADの全機能がrc2に含まれるとは言えない。

根拠: `systems/rock-star-os/os/update/rock_update.py` / `data/qemu-release-audit.json` / `docs/rockstaros-1.0-architecture.md`

### OS09 Tool package・隔離Runner・Registry

証拠段階: `runtime_source_present_design_and_records_inspected`

**確認したこと:** 署名manifest、有限recipe、hash/期限/失効検査、実行隔離とresource制限のLinux系実装。接続先はfixtureの範囲を持つ。

**再利用:** 保守Toolと分析Toolの配布、版固定、権限差分、sandbox分離。

**不足:** 宇宙搭載機に対するWCET・RT scheduling・認定toolchain・故障隔離保証はない。一般Toolの導入が設備制御権限を増やさない接続審査が必要。

根拠: `systems/rock-star-os/os/runner/README.md` / `systems/rock-star-os/os/runner/executor.py` / `systems/rock-star-os/os/registry/README.md` / `systems/rock-star-os/os/registry/client.py` / `docs/rockstaros-1.0-architecture.md`

### OS10 Operator Agent の限定署名命令

証拠段階: `source_present_and_recorded_partial_apk_evidence`

**確認したこと:** 署名、replay、monotonic counterのAndroid試験記録。Device Owner無しのfactory resetは拒否。

**再利用:** 管理命令の出所・再送・単調counterを分ける参考。

**不足:** これは端末管理用であり、気密扉、弁、与圧、推進制御の仕様ではない。コロニー緊急命令へそのまま転用しない。

根拠: `android/operator-agent/src/main/java/dev/rock/operator/agent/OperatorCommandVerifier.java` / `android/operator-agent/src/main/java/dev/rock/operator/agent/OperatorCommandExecutor.java` / `docs/evidence/android-pixel-10-prefull-physical-20260916.json`

### OS11 Decision Provider 契約

証拠段階: `schema_design_present_generic_runtime_not_proved`

**確認したこと:** requestId/ownerRef/workId/stateDigest/policyVersion、effect、offlineRequired/cloudAllowed、maxLatency/maxCost/maxAttemptsをJSON Schemaで定義。answered/abstained/blocked/failed。

**再利用:** AI予測結果を制御許可と区別する共通要求・根拠ハッシュの形を維持。

**不足:** 契約ファイルは全Provider統合やcolony判断精度の証拠ではない。実設備を動かす制御則・物理限界は別の決定的コードと試験が必要。

根拠: `contracts/decision-provider.json` / `docs/rockstaros-complete-design.md`

### OS12 Material Invention sandbox

証拠段階: `runtime_source_present_fixture_scope`

**確認したこと:** 二物質候補・制約・単位・危険性チェックの装置非接続sandbox。契約は物理実験の承認・実行をしないと明示。

**再利用:** コロニーの研究・資材候補・発明履歴に使う上位アプリ候補。

**不足:** 生命維持材、構造材、燃料、食品や水の製造適合、実材料性能を証明しない。物理simulationモデルやラボ測定は別。

根拠: `contracts/material-invention.json` / `lib/material-invention.ts` / `tests/material-invention.test.mjs`

### OS13 公開 Control Core

証拠段階: `pure_reference_code_tested_this_audit`

**確認したこと:** createActionRequest/approveAction/canExecute/recordOutcome。read/write/external と succeeded/failed/interrupted/unknownを区別。今回Node単体4/4合格。

**再利用:** 利用者へ承認と結果の違いを示す最小参照と表示用の概念。

**不足:** actorは文字列であり認証主体ではない。メモリ内Objectだけで、DB・暗号署名・ネットワーク・安全制御はない。READMEはreuse terms not grantedと明記。新パッケージへコピーせず契約上の考え方のみ参照。

根拠: `public-release/rockstaros/packages/control-core/src/index.js` / `public-release/rockstaros/packages/control-core/test/index.test.js` / `public-release/rockstaros/packages/control-core/README.md`

### OS14 avokado Edge Hub のOS位置付け

証拠段階: `hardware_concept_and_os_design_not_hardware_accepted`

**確認したこと:** このrepoの正本は4本の銀色200mm Motion Towerと別Edge Hub。RockstarOSが入力、AI、作品、権限、履歴を管理する製品構想。

**再利用:** コロニーのローカル表示・生活UI・作業計画端末。通信断でも現地状況と未確認命令を区別する。

**不足:** avokado実機受入なし。現repoより新しいE3成果物が別作業にあるため、寸法・電力部品はそちらの版を別途参照。生活端末を単独の生命維持安全装置にしない。

根拠: `README.md` / `docs/avocado-mini-tower20/README.md`

## 3. 新しいコロニー監督モジュールの境界

新規 component ID は `dev.rock.colony.supervisor`、独立試作の module は `rockstaros_colony_sim` を提案する。これは既存OSに組込み済みの名前ではない。実装はこの設計作業の別フォルダへ置き、元repoへ無断コピー・mergeしない。

schemaは `rockstaros-colony-command/1`、`telemetry/1`、`receipt/1`、`policy/1` をそれぞれ完全名で版管理する。`contracts/platform-api.json` の既存apiVersionを暗黙変更しない。

命令必須field: `schema`, `commandId`, `requestId`, `ownerRef`, `siteId`, `nodeId`, `workId`, `componentId`, `componentGeneration`, `capability`, `payload`, `payloadDigest`, `policyVersion`, `expectedRevision`, `issuedAt`, `expiresAt`, `mode`。

測定必須field: `schema`, `siteId`, `nodeId`, `sensorId`, `sequence`, `observedAt`, `receivedAt`, `clockQuality`, `value`, `unit`, `quality`, `calibrationRef`, `simulated`。

保存時の受付、通信相手の受領、実作用の完了確認を分ける。`acknowledged`だけで`succeeded`にしない。送信後に結果不明になった指令は、同じ作用を再送せず、機器側の照会/現地確認へ進める。

SIM_ONLYを初期値とし、physical effectはfalse固定。SIM_ONLY・READ_ONLY・COMMISSIONING・OPERATEの切替は設計上の将来状態であり、この試作が実機へ接続できることを意味しない。

LLMは要約・比較・計画候補。許容範囲・期限・現在状態を確定コードが確認する。安全系の自動応答は、通信やWeb画面の承認待ちで止めない。安全域は本物の設備から決定し、例示閾値を飛行/生命維持値と呼ばない。

## 4. 新規開発が必要な領域

- **G01 故障しても生命維持を続ける層:** RockstarOS監督機、通信、AIが停止しても現地安全制御器が動き続ける。watchdog、独立電源、最低機能、手動切替と隔離を設備ごとに設計・実測。
- **G02 設備ドライバと意味:** O2/CO2、圧力、水、電力、熱、火災、気密扉の telemetry/capability を単位・測定時刻・品質・校正・許容域付きで定義。値は対象設備から決める。
- **G03 リアルタイム性能と環境:** deadline、最悪実行時間、jitter、電磁、真空/熱/振動/放射線、SEU対策は監督OSと安全制御器それぞれに要求・試験が必要。
- **G04 複数拠点と断線:** site/node identity、store-and-forward、priority/TTL/expiry、telemetry stale判定、clock品質、単一command authorityとfencingを定義。リンク復帰で期限切れ指令を実行しない。
- **G05 多人数の権限:** 現在のownerモデルからcrew/operator/maintenance/medical/safetyを別に設計。緊急手動権限と事前承認された自動応答は毎回Web承認を待たない。
- **G06 資源と可用性:** 総発電/蓄電/ピーク、最低換気・水・熱余裕、冗長性、故障時の負荷遮断順を実設備モデルで算定。合成simから人命維持日数を保証しない。
- **G07 搭載系と地上系の分離:** ロケット flight/GNC、衛星TT&C、コロニー環境制御、avokado住民UIの安全境界を分ける。RockstarOS共通管理を単一故障点にしない。
- **G08 署名・復旧・更新の現地運用:** offline信頼根、鍵失効・交換、rollback/data互換、更新中の現地制御維持、事故ログ保存、物理改ざんを最終機体で受入。
- **G09 受入証拠:** 単体→ソフト閉ループ→controller HIL→装置試験→無人実証→有人運用の証拠を別に保存。現在の数十/数百テスト数はコロニー適合率ではない。

## 5. 独立試作で検証する契約

- duplicate same command returns retained receipt
- changed payload for same command rejected
- stale telemetry cannot authorize unsafe increase
- expired command rejected after offline queue
- AI proposal cannot bypass policy
- dispatched command interrupted becomes unknown, never automatically resent
- generation change fences queued old command
- local controller continues when supervisor or satellite link unavailable
- restore clears actuation authority until recommissioned
- sim receipt never claims hardware effect

## 6. 成果の読み方

原repoの更新日と今回の設計版を混ぜない。4/4は公開参照関数のロジックテストであり、飛行、ハード、衛星、生命維持の合格数ではない。今後追加するcolony simulationの成功も、その仮定と状態機械の範囲に限定する。

公開Control Core READMEは再利用許諾未付与と記すため、そのソースを新規成果物へコピーしない。この監査は自分のシステムを設計するための実装確認であり、外部へのライセンス許諾や公開を追加しない。

## 7. 既存Web仕事へのadapter mapping

今回の独立実装は、非重要な模擬負荷設定だけを持つSIM_ONLY試作とする。重要設備の任意writeや実機driverは持たない。既存MCP Brokerとコードを共有・統合・搭載したとは表示しない。

- `WorkJob.active`: `prepared`, `queued`, `dispatched`, `acknowledged`, `unknown`。unknown は failed/completed に丸めず、仕事activeの照合待ち理由として保持する。Web現行enumへwaitingを勝手に追加しない。
- `WorkJob.review`: `succeeded`。必要工程が simulation receipt として整合した後の成果確認。physical_effect_verified=falseの表示を維持する。
- `WorkJob.completed`: 。レビュー完了の仕事状態。設備実作用の成功を示す状態には使わない。
- `WorkJob.cancelled`: `cancelled`。未dispatchなら取消。既送信なら結果不明の照合を残し、仕事取消で未確認作用を消さない。

本線統合時は、既存の認証主体からownerRefを導き、要求hashとrevisionを共通fixtureで往復検証する。`sample=true`は既存WorkJob工程を完了させないため、simulationを実工程へ記録する場合もsampleを維持する。SIM作業専用templateを別versionで追加するまで、現行article/coconala templateのTool名を置き換えない。
