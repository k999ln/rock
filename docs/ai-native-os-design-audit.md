# avocadoOS AIネイティブOS設計—Sol独立監査

監査日: 2026-09-16  
監査範囲: 初回正本 v1.70、最終作業tree v1.71、基準source `678e9c9a14e8de9cd61dfd1cad8e71e342783c4f` からの今回作業差分  
監査モデル: `gpt-5.6-sol`  
分業: AstraがAIネイティブOSの共通設計を具体化し、Solが正本、契約、Android実装、進捗証拠との整合を独立監査した。

## 結論

設計は **条件付き合格** とする。RQ48の製品中核、SkyとZemaの責任分離、model/runtime交換、model非依存記憶、offline復旧、外部作用照合、app/OS保証差、Game/IPの独立trackは、実装可能な契約と受入に分解された。月50万円は将来の検証指標であり保証ではない。Pixel 10 GL066 / `frankel` が最初の物理対象で、GMS、カメラ、Game、実収益、FundはCore起動の必須依存ではない。

これは **設計の合格** である。交換可能runtime、限定記憶、外部作用outbox、多端末Sky、Game/IP縦断、avocadoOS imageの完成を実装済みとする判定ではない。

## 2026-09-19追補 — LLM分類とJev

追加監査で、端末内LLM、WebのOpenAI接続、Jev、AI SDK dependencyを一つの「LLM接続」とみなす誤読を確認した。修正後の正本は[LLM・評価モデル設計](llm-evaluation-architecture.md)と[`data/llm-capabilities.json`](../data/llm-capabilities.json)である。

- 端末内Qwen / llama.rnは固定profileの非信頼planner。Broker / Engineが実行・再試行・保存を担う。
- OpenAI接続はSkyの法務受付と特許アシスタントの2 Tool内部だけ。catalogの`ready`はcredential接続済みや本番合格ではない。
- JevはSkyから明示利用するremote evaluatorとして設計し、local plannerや汎用generatorに数えない。結果は`advisory-only`。
- 現行`ai@7.0.99`に`experimental_evaluate` exportはなく、Jev runtimeは未実装。公式API互換、privacy、料金、失敗縮退をAI07で受け入れる。
- `AGENTS.md`、README、prompt playbookの削除済みbranch参照、Sky role 6→10、RockstarOS→avocadoOSのcurrent表記を同期対象とした。

この追補は設計・正本訂正の合格であり、Jev provider接続、API key設定、route、UI、catalog `ready`、production利用の完了判定ではない。

## 監査対象

- 要求正本: `data/product-baseline.json` 初回v1.70・最終v1.71 / RQ48、`docs/product-baseline.md`、`docs/product-north-star-20260915.md`
- 設計正本: `docs/ai-native-os-architecture.md`、`docs/rockstaros-1.0-architecture.md`、`docs/rockstaros-1.0-strategy.md`、`docs/system-composition.md`、`data/system-composition-audit.json`
- 実装契約: `contracts/local-ai-runtime.json`、`contracts/platform-api.json`、Android Binder / Broker / Engine / SQLite schema / SELinux / Operator Agent
- 現在地と入口: `AGENTS.md`、`README.md`、`docs/prompts/rock-current-next-20260911.md`、`data/project-status.json`、`project.md`

## 解決済みの重大指摘

1. **交換可能LLMと現行固定runtimeの混同**  
   現行実装はpackage、versionCode、API、signerを固定する。新設計はこれを `PINNED_SINGLE_RUNTIME` と明記し、`ModelProfile`、`RuntimeManifest`、Broker所有のactivation、atomic generation、旧job pin、失敗rollbackを将来契約に分離した。1.0は一runtime上の少なくとも2互換profileで交換性を受け入れ、別runtime間交換は拡張とした。

2. **model交換で壊れない記憶schemaの欠落**  
   現行はopaqueな `contextJson` と固定仕事schemaのみで、汎用長期記憶は未実装である。新設計はcanonical memoryとmodel固有projectionを分け、provenance、owner/scope、revision、保持・削除、`copy → validate → atomic switch`、migration journal、power-loss受入を定義した。

3. **offline復旧と外部副作用の二重実行**  
   現行 `Engine` のlease回収と再queueは、副作用のない固定2工程の範囲で受入済みであり、現在の実証済み脆弱性とは判定しない。一方、外部変更Toolへそのまま一般化できない設計blockerである。新設計は `local-pure / remote-read / external-write`、outbox、`uncertain`、provider operation key、照会優先、保証がある場合のみ同一key再送を要求し、一般networkのexactly-onceを保証しない。

4. **LLMへの過大な権限と更新途中のauthority**  
   Brokerを唯一の権限判定者とし、Local AI adapterはBrokerがpinしたprofileのload・推論・plan生成だけを担う。profile activationはBrokerの管理transactionに限定し、非active領域へのstaging、署名/hash/容量/互換再検査、atomic pointer、journal、crash後resume/rollbackを必須化した。

5. **Sky appとOS保証の混同**  
   SkyはOS専用UIではなく、スマホ、Web、PCの選択・接続面とした。OS Brokerの永続selection、SELinux/privapp、Device Owner、AVB/OTA/純正復旧はapp-only成功から推測しない。capability response、期限、generation、submit/claim時の再検査、単一authority device/writer epochが設計された。

6. **GameをFund/収益完成後に直列化**  
   Game/IPの非金融な制作、試遊、save復旧はCore共通契約の独立trackとなった。金融交換を追加する場合だけWallet/Providerの別受入を必要とし、Fund完成をGame/IPの必須後工程にしない。

7. **正本の不一致と実装済み証拠の混同**  
   Hub＋Wallet中心、BlackBerry優先、Pixel再起動待ち、Operator Agentがserver-only、固定runtimeを交換可能実装とする古い現行表示は修正された。`requiredForV1` はOS Core 1.0の意味に限定し、実収益は別の公開gate、Game/IPは非金融と金融拡張を分離した。既存Pixel 23/23は試験署名APK、固定runtime、固定2工程、非破壊backupの証拠に留まり、汎用交換、OS image、production受入へ転用されていない。収益Provider gateも削除されていない。

## 未確定だが設計合格を妨げない項目

- 比較採用する2つのModelProfileと、品質、p95、電池、熱の出荷数値
- 長期記憶の保持期間と一般Tool capability schema
- 遠隔device enrollment、多端末writer移送のtransport
- Game/IP候補の素材・成果schemaと権利受入
- 外部Providerの照会、冪等性、返金、chargeback、払出し契約

未確定値を高性能達成、本番対応、収益達成と表示しない限り、これらは現段階の設計blockerではない。

## 実装・物理受入待ち

- `AI02`: RuntimeManifest / ModelProfile、2 profile切替、旧job pin、失敗rollback
- `AI03`: 限定canonical memory、projection再構成、migration/power-loss受入
- `AI04`: effect分類、external-write outbox、uncertain照合。現行pure Engineの脆弱性修正ではなく、外部作用一般化の事前条件
- `AI05`: Sky capability交渉、単一authority device、古いcache・二重writer拒否
- `AI06`: 非金融Game/IP fixture、owner/project分離、save復旧
- `AI07`: Jev SDK/API互換、Skyの明示同意、allowlist rubric、Evaluation Receipt、privacy/料金/失敗縮退
- GL066同一OS候補でのfull build、正式署名、flash、SELinux enforcing、OTA/rollback、純正復旧、物理的な鍵喪失/wipe復元
- production WebAuthn/StrongBox/Device Owner、外部収益Provider sandbox、最初の管理されたtransfer

## 最終判定条件

Core 1.0のAI契約受入とDevice配布受入を別々に追跡し、製品配布には両方を要求する。app-onlyの合格をOS完成とせず、設計正本の追加を実装済みとせず、実収益・Fund・Game/IP・動画・VRを一本の必須完成順に戻さないことを継続条件とする。
