## Noahの接続・共有設計（SKY21 / SKY14、HOME01 / WEB04連携）

v0.4の[Noahストア・端末管理](../noah-agent-model-store-design.md)を主導線にする。Eveは共通知能、NoahはAgent構成とストア、AMC/Broker/Work/Jevは工程・権限・実行・評価を担い、独立したSkyは置かない。Agent/LLMの検索→端末へ追加→Eveで仕事・編集→更新/削除を既存モデル管理へ接続する。旧sky系識別子とv0.3の3機能DB/APIを保持。計62件の受入設計で、新runtime・導入・配備は未実行。

既存SMITH-01〜06/MCP-01を継承する[Noah設計](../noah-connection-sharing-design.md)を入口とする。ROCKは発見/選択/出典/能力照合/共有と保存復旧、EXTERNALはfeed/model/Tool/機器の実能力、JOINTは同候補の実接続一周、OWNERは素材・共有先・権限・予算の確認を担当する。目的から成果・共有までの11設計項目、62受入ケース（実装後の合格条件）、未決定事項を記載。今回は文書整理で製品完成率を上げない。

main `7bbb4b27` / PR305 `ee87a643` / Root / Site v138を区別する。次はmain/PR/配備の契約差同期、投稿選択→Eve保存の固定候補、実行/停止/復旧、別owner共有の順に受け入れる。v0.2で限定投稿の外部送信条件、下書きの保存/削除/復元、招待の期限/一回利用/撤回を具体化。v0.3でschema/APIを定義済み。次は固定候補の正式migration・store/APIと32追加受入の実装、Hosting/Providerの条件照合。完了条件と実在する局所試験は同書§10、今回の結果は[証拠](../evidence/noah-connection-sharing-design.json)。文書検証は `npm run project:update` / `npm run project:check` / `npm run baseline:check` / `npm run design:check` / `npm run verify`。

## Eve / si研究からの改善評価（AI02/AI05/SKY21・ROCK）

2026-10-28の5時間調査は継続中。既存Eveの計画・観測・workflow・同一ID復旧を再利用し、重み固定の比較基盤と、後続の検証済み短判断SFT/局所修復蒸留を検討する。自己一致・JSON適合・model judgeを、権限/課金/外部効果/完了receiptへ昇格しない。見積承認期限と既存入力の実行期限、pure plannerと状態付きfixture、native/Pixel/本番受入を区別する。

固定版runtimeのSchema対応、Providerが送信/採点時にSchemaを変える条件、benchmarkの引数検査と分母、モデル/データの利用条件を確認中。合格条件案は元仕様・送信仕様・受入仕様のhash固定、family単位holdout、全失敗と費用の記録、能力保持、独立検収。現時点は調査と比較設計で、学習・推論比較・runtime変更・main統合・実機/公開の新規受入は未実行。

途中資料は[ローカル調査状態](../../work/development-backups/eve-si-world-research-20261028/state.json)と同directoryの証拠台帳/実験案/英語引継ぎに保存中。Git管理外の資料でありGitHub保存済みとはしない。進捗正本は`data/project-status.json`の`eveSiWorldResearch`。`npm run project:update`と`project:check`は成功。最終要件監査・main/同一SHA CI再確認・完了前の`npm run verify`は調査終了時のgateとして残る。

追加確認（2026-10-28）: 84研究系列/固定コード178件、21手法比較。最新原文の17問へ回答/根拠を対応し、first-experiment-draft.mdを5条件の小pilotへ事前改訂（上限750呼出し/出力900,000tokens、未実行/未承認）。EvoMasterのoverlay採用条件、AfroBenchのF1、AfriE5の公開artifact差、TAIDE/Arabic/Indic音声の適用限界を記録。中立文脈対照・不変oracle・全費用・結論保留を保持。旧4条件大規模案は別名保存し、自動実行や採用の根拠にしない。

## Eve月次作者料候補の照合API（SKY21/BIL02/OS10・ROCK）

共通Coreのread=null停止を既存fenceへ接続する修正はOS10/SKY21/WEB04・ROCK。元handleを残し、claimedはreceiptまでunknown、確認後だけ待機。[修正証拠](../evidence/eve-core-missing-delivery-stop.json)。Root/Source/SDKと実Worker/実機を別記録する。


隔離Source19fe452では観測を既存Invoiceの2 nullable列へ保存。最新snapshotのCASと独立した負の証拠の保留により、遅延/unknown/再起動で反転記録を失わない。関連57・DB台帳/移行16・Source全verify、同一ビルド実D1再起動を受入。再現は`node --experimental-strip-types scripts/check-eve-author-monthly-worker.mjs --project work/eve-v115-agent-integration --payment-evidence`。合成Providerのみ、実Provider/ブラウザ/送金/返金/回収とRoot runtime統合は未受入。[保存と復旧の証拠](../evidence/eve-monthly-payment-observation.json)。


Source候補に既存Invoice行→署名契約/receipt/quote/同意→作者料候補のread-only APIを実装。localhost既存月次APIのGET `?settlement=<invoiceId>`。失効時は古い受取先/金額を返さず、paidでも返金/異議未照合としてtransferAllowed=false。集中31/31・型/lint・Source全verify exit0、Node2711/2710pass/1skip。ローカルcommit9961761、push/公開/送金なし。[証拠](../evidence/eve-author-monthly-settlement-report.json)。新API専用compiled Worker/UI、Provider照合/返金/送金の永続統合は未完。

## Eve永続保存のoffline復元（OS10/SKY21/WEB04・ROCK）

既存固定Source Workerを`scripts/check-eve-repair-source-worker.mjs --project work/eve-v115-agent-integration --backup-restore`で検証。停止済みMiniflare永続保存の全filehashを固定→snapshot→新規保存先copy→同じWorker/外部keyringでHTTP読戻し。完了/中止仕事・暗号化会話完全一致、owner分離、終端再実行拒否、原本無変更。[証拠](../evidence/eve-offline-persistence-restore.json)。ライブDBcopyに転用しない。本番D1はProviderの整合snapshot/restore、旧snapshotは削除/失効tombstone照合を別gateにする。

## Eve共通予算の永続D1検証（SKY21/OS10/BIL02）

ROCK担当。既存Sourceの原子予約を`scripts/check-eve-shared-budget-d1.mjs --project work/eve-v115-agent-integration`（node --experimental-strip-types）で検証。Cloud同士/CloudとA2A予約SQLの競合、cap維持、owner分離、取消重複、再起動を合格。追加で合成timeout後の予約保持・取消/期限解放拒否・再送禁止、合成遅延usageの重複確定防止、計4回D1再起動を確認。既存設計・台帳の変更なし。EXTERNAL/JOINTの実Provider請求・receipt・OWNER契約/支払は未受入。[証拠](../evidence/eve-shared-budget-d1.json)。

## ユーザー作成Agentを3方式で実現する環境（2026-10-22）

SKY12/14/21・DSP01 / ROCK、Sky/MCPが主担当。用途選定を開発側の固定リストにせず、既存Eve役割と実能力/権限へ接続する。Pixel camera→共通観測→本人確認→同じ担当の引継ぎをsource/hostで確認済み（開始時点の全verify exit0、並行依存更新後はlicense hash再同期/現行verify未完、実カメラも未受入）、Miniは同じ入力契約へのdriverを別受入。内蔵・外付け・周辺観測は詳細正本`smis-three-connection-ways`を参照。集中`tests/smis-visual-input.test.mjs`、portable build/test、type/lint、camera policy実応答、全verify、実Pixelを分けて検証する。画面操作のnative pipe復旧後にPixel実物/カメラ許可/停止UIを確認する。用途は利用者がEveで作るため、固定用途の選択を開発再開条件にしない。証拠は既存sky-agent-library.json#physicalEnvironment。一般ローンチは保留。

## smisへの改名と無機物・有機物への共通接続（2026-10-22）

SKY12/14/21・DSP01 / ROCK。最新の本人指示で製品表示名をsmis（旧Sky）にし、Eveの作成→smisの接続→OSの権限/仕事を維持する。対象名の自由記述を有機物にも適用し、実能力がない状態を接続済みにしない。Web表示/manifest/成果/エラー、作成画面を更新する。旧API/schema/header/DB名は互換のため保持。正本は全Tool設計の`sky-object-attachment`、根拠は既存`docs/evidence/sky-agent-library.json`。物理部品/生体接続/公開は別gate。検証は集中object/library/manifest、type/lint、portable package、全verifyと隔離ローカルUI。

## 物に付ける共通部品と困りごとからのAgent作成（SKY12/14/21・DSP01・ROCK）

[全Tool正本](../sky-tools-complete-design.md#sky-object-attachment)。Eveの下書き確認/既存Agent保存、物の同一owner入口、Host/Executor/Outputの能力候補照合を担当する。物理部品の製作/実観測はDSP/EXTERNAL/JOINT、送信先/予算/検収はOWNER。検証入口は`node --experimental-strip-types --test tests/sky-object-attachment.test.mjs tests/sky-agent-library.test.mjs packages/rockstaros-runtime/test/executor.test.mjs`、portable build/test、全体verify。source/ローカルUIと能動部品の実機合格を分け、一般ローンチを保留する。

## Eve：同意済みNews仕事の集約・全参照保持・実JSON保存を限定受入

Sky/MCP・ROCK、SI07/T03/T08/T10/T12。集中19/19・型/lint・full exit0（Node1475/1474pass/1skip、API2061/CSV113/assets212欠損0）。実Worker/UIで個別同意2仕事→完全一致1記録/重複1/全2参照、選択順不変SHA0b16136c…、JSON3651bytes/fileSHA7badfaa9…/API同一を確認。片方撤回後は集約403、UI旧選択409/旧preview消去。両同意撤回後同byte Worker/D1再起動で全job一致・集約403・model呼出0。新DB/実学習/公開なし。本人のドメイン確認に対し正式設定avoado.siと公開https://avoado.si/os/eveのHTTP200/titleを読戻し、今回の新機能はlocalhost検証のみ・公開未反映を明示。近似重複/外部dataset/license/config/全SI gateは残る。証拠docs/evidence/eve-execution-si.json#SI07_newsLearningPreparation.collection。

## Eve：別News仕事にコピーした評価素材の混入防止を限定受入

Sky/MCP・ROCK、SI07/T03/T08/T10/T12。集中15/15・型/lint・full exit0（Node1471/1470pass/1skip、API2061/CSV113/assets212欠損0）。初回lintのtest let→const修正後合格。実Workerで同owner別jobのdataSHA相違/contentSHA一致を確認し、候補preview200→別job評価grant→候補403、評価withdraw後も拒否。実UIで理由と取得無効、候補も撤回後同byte Worker/D1再起動で両全job一致・評価履歴拒否維持・モデル呼出0。SQLの候補UPDATEと最終export SELECTで同じowner評価履歴の不存在を検査し、別ownerを検索しない。近似重複/外部dataset/実license/config/実学習/公開・全Goalは未受入。証拠docs/evidence/eve-execution-si.json#SI07_newsLearningPreparation.ownerCrossJobEvaluationFence。次は同意再照合付きのdataset集約・重複/train-eval分離を、別台帳を作らず既存仕事契約へ接続。

## Eve：準備JSONの実ダウンロードと撤回後拒否を確認

Sky/MCP・ROCK、SI07/T08/T10/T12。前turnは鍵/利用権停止中の撤回と復旧のprogress。実browserのdownload待機で保存完了を取得し、4776bytesのJSONを解析。評価用1件/trainingAllowed=false/対象SHA92e65107…/job revision14/現行資料と草稿の一致、全履歴・思考非収録を確認。file SHA c87b50288268eb251f62648cf6f2ff4fe415756a6e0a38e5148af3e29223ce6e。UIで撤回revision15、準備表示/保存無効、API403。コピー済みfileの消去保証なし。runtime sourceは前検証候補hash一致、実モデル呼出0/GPU・実学習・公開・送金なし。次は横断重複/train-eval汚染/正確なmodel license/configの準備とSI全体の未受入gate。証拠docs/evidence/eve-execution-si.json#SI07_newsLearningPreparation。

## Eve：鍵・利用権停止中の学習準備同意撤回を実Workerで確認

Sky/MCP・ROCK、SI07/T03/T08/T12。前turnは同意/撤回/replay/再起動読戻しのprogress。同じ保存済み架空ownerの仕事へ準備同意revision12を作り、同byte Worker/D1で履歴鍵なし・サービス利用権必須へ切替。通常check403、preview503、撤回だけ200/revision13/historySaved=falseを確認し、資料/草稿/検査/過去usage/旧版は全一致。鍵復旧後もpreview403、既存syncでhistorySaved=trueとなり撤回を会話へ反映。runtime sourceは前full候補からhash一致、変更なし。JSON保存の実ファイル完了/bytes確認と全SIの他gateは残る。GPU/学習/実推論/公開/送金なし。証拠docs/evidence/eve-execution-si.json#SI07_newsLearningPreparation。

## Eve：serverで計画使用量を保存（2026-10-22 / AI02・AI05・SKY14・SKY21・BIL02 / ROCK）

既存LLM API/adapterとWorkJobへ送信marker・共通usage・候補を接続。端末内の同一model/leaseだけを1回実行し、browser未受領でも保存する。停止後の遅着usageは保持し、候補採用や仕事を復活しない。集中16/16、型/lintを確認。実Qwen試験は今回は結果不明で停止し、成功にせず記録。次は制御Ollama HTTP fixtureでの実workerd再起動/重複拒否と全体verify。公開/実機/支払を未受入のまま保持。[契約](../sky-tools-complete-design.md#eve-execution-si)。

## Eve：永続計画生成（2026-10-22 / AI02・AI05・SKY14・SKY21 / ROCK）

既存WorkJob/workflowへdraft/lease/attempt/候補/本人採用を保存し、同じowner/thread/jobで再開する。画面だけの上限をserverの最大2回へ移す。新runner・仕事/金融台帳なし。集中14/14、実Qwenの最初の試験は2候補拒否で停止、追加診断試験は1候補で型検証→採用→実Tool→検収/保存合格。両試験を残しモデル安定性は未実証とする。次は実Worker再起動API/全体verify。最新UI/有料Provider/実機・公開は別受入。[契約](../sky-tools-complete-design.md#eve-execution-si)。

## Eve実行SIのAgent停止復旧・学習参照（2026-10-22 / AI02・AI05・SKY14・SKY21 / ROCK）

既存Agent仕事をEveの同一threadへ接続し、親stop intentをSQLで作成/承認/送信へ反映。取消未確認は保持し、既存定期workerで回収する。履歴鍵停止中も停止でき、復旧時に会話へ再反映する。host/実workerd/制御Workflow/最新UI/公開の証拠を[SI証拠](../evidence/eve-execution-si.json)で分ける。本人指定[microgpt参照契約](../llm-evaluation-architecture.md#eve-microgpt-reference)を全体promptへ追加。GPU不要の基礎学習と検収を先行設計し、モデル本体の採用・Provider課金・作者精算・実機は別gateに保持。現時点で学習は未実行。

## 共通計量の配信Source統合（SKY21/BIL02・O5/ROCK）

公開v111へ保存済み無料Cloud/直接LLM/署名済みAgent receiptの共通表示を接続。結果不明では観測だけを保持し、再送/成功/請求へ昇格させない。Source集中65/65、型/lint/build、Root全体1258pass/1skip・API1823/CSV113、正式ドメイン200/匿名401を記録。Source全体は旧evidence参照欠落で停止し、本人UIはCUA接続障害で未確認。保留中料金/実入金/作者払出しは未実行。次は本人UIとU02永続明細/版付き料金/予約照合。[証拠とSource差分](../evidence/sky-usage-public-integration.json)。

## EveとSkyの担当・基盤モデル・実行先をつなぐ（SKY12/14/21・ROCK）

2026-10-21の明示指示。Skyの本人別設定と既存の端末能力報告を一つの管理画面から使い、EveへID/版/hashだけを渡す。[全Tool正本](../sky-tools-complete-design.md#sky-agent-library)が接続契約。ROCKは表示・参照・同意の版束縛、EXTERNALはmodel/Tool処理、JOINTはPixel/外部経路一周、OWNERは送信先/費用/実行の承認。`node --experimental-strip-types --test tests/sky-eve-connections.test.mjs tests/eve-device-sync.test.mjs tests/sky-agent-library.test.mjs`、型/lint/designと全体verifyを検証入口にする。新しい一般公開・実課金を開始しない。次は同一候補のSky→Eve→Pixel実一周と配信元の個別照合。

## 投稿ソースの受け皿（HOME01/WEB04/SKY14/15/21・ROCK）

本人訂正に従いAPI/MCP接続とXの投稿供給元を分離。既存Connectorのslot/passport/prepare/executeを再利用し、sky_timeline_read→sky.timeline.v1→native Homeを追加。X OAuthは任意設定。source/結合fixtureと実X未接続を分ける。次は供給元のAdd/本人認可/本物の投稿/更新/停止のJOINT受入。正本は[全Tool設計](../sky-tools-complete-design.md#投稿ソースのapimcp受け皿sky-timeline-receiver)、設定は[運用](../x-account-setup.md)。検証は新parser/MCP結合、npm run design:check、npm run verify。

## 市場・MCP接続の一周（SKY14/15/20/21・BIL02 / ROCK）

本人の2026-10-20明示要件は[全Tool詳細設計](../sky-tools-complete-design.md#sky-marketplace-mcp-lifecycle)を正本とする。ROCKは既存Package/Registry/Studio/Connector/Commerceを使い、商品版・作者/配布元/license/依存、署名/hash、入力/出力/権限/実行先、商品価格/外部実費/Rock料金、Add/購入/実行の別状態、Connection Passport・変更差分・再承認・結果照合・失効・記録を担当する。EXTERNALはMCP server/OAuth issuer/商品条件、JOINTはPC・Sky Cloud・提供者MCPの各sandbox一周、OWNERはscope/購入/外部作用/公開を担当する。PCの部分的なsource・fixtureと、実Cloud/OAuth/Provider受入を分ける。次は未受入経路の状態表示と契約試験、同一版sandboxのinitialize→list→prepare→call→失敗/取消/結果不明→失効を検証する。ローカルはConnector/Package/Commerce対象試験、`npm run design:check`、`npm run baseline:check`、`npm run verify`で確認する。

参照チャット全体からの統合開発入口は[Sky統合マーケット・API/MCP受信・Eve連携の開発実行プロンプト](../prompts/sky-integrated-marketplace-development.md)。Home投稿型入口、HF型のModel/Agent/Tool市場、作者導入、担当/LLM選択、専用Linux、Eve成果、月次枠付き料金とAPI/MCP受信をSKY-I01〜06へ対応付けた。既存実装の限定受入を維持し、実投稿/Provider OAuth/実請求/本番を分ける。旧[市場・MCP一周プロンプト](../prompts/sky-marketplace-mcp-development.md)は接続詳細の参照資料として残す。プロンプト保存は実装やProvider受入ではない。

現行の製品名は **Eve（イヴ、旧称Zema）**。2026-10-20の本人指示による改名で、以下のZemaは同じ製品を指す。既存契約・保存・利用権/SDK識別子は互換性を保持する。

## 全体コード確認と取得物の案内（SKY14/15/21 / O5 / ROCK）

2026-10-20の本人依頼。全体verifyを止めた入力/同意/試験/料金設定/共通エラー表示と、追加済みLinux保存2表の古い検査を修正し、root全verifyをexit0（Node1024/1023合格/1skip、API1330、CSV113）。WebとPixelで必要な取得の目的・容量・内部保存・通信・再利用を案内する。キャッシュ再利用時の専用.part回収、owner試験のUUID一時成果の自動回収、353377byteだけの更新転送と回収を実装/実機確認。本人の保存済み成果と6担当/17仕事は保持。新APKは同一画面/保存の受入で、旧実推論の受入を新APKに流用しない。一般公開・実課金は保留。[記録](../evidence/sky-multi-model-pixel.json#codeCheckAndDownloadGuidance)。

## Sky Linux 16の共通実装（2026-10-20）

初期プランは月額16 USDで一定のAI・Linux利用枠を含め、対象枠の超過分だけを事前単価/本人承認上限で課金する。枠の量・対象・超過単価は未確定。既存Package審査・eSIM grant・Zema workflowを専用Linuxの使用量、月次Invoice、入金確認後の作者精算へつなぐ。未払いの新規実行制限とデータ保持/支払復帰、電子契約とsalt付きchain証明を採用。[11項目の正本](../sky-tools-complete-design.md#sky-linux-marketplace)。主担当Sky/MCPのROCK、既存SKY14/15/21・SIM01・BIL02。source/local fixtureのみで、Provider sandbox・実Linux/Pixel・本番・chain公開は未受入。新しい従量単価/無料量/上限は未確定。既存の別商品/旧台帳を新プランへ自動変更しない。

## 複数モデルと担当のPixel内追加（SKY14/15/21 / O5 / ROCK）

2026-10-20の本人指示。[共通追加契約](../sky-tools-complete-design.md#sky-multi-model-pixel)に従い、model版/容量/形式/RAMを持つデータ定義と可搬な担当設定を追加し、既存workflow/成果/停止を再利用する。ROCKは互換・準備・停止・UI、EXTERNALはHF/llama.cpp/Android、JOINTは同一Pixel一周、OWNERは条件/素材/保存/内容を担う。一般公開保留。集中`tests/sky-linux-models.test.mjs`と既存Linux試験、Android build/実機、独立保存読戻し、design/baseline/verifyで確認する。実装/合成/実機を分け、別モデルが追加できることと全モデル対応を混同しない。


同一最終APKでPixel実推論22.225秒、665byte保存/終了後の独立読戻し、実停止、設定保存/再取込み、Terminal入力なしの起動を受入。旧担当4件/仕事12件保持。Downloadの指摘で必要資材をLinux専用領域へ移し、重複導入物約1GBと試験fixtureを回収。起動時のMainActivity NPEは画面生成後のbar設定で修正。本人の内容/使いやすさ、全モデル、電池/熱、全OSは別gate。証拠 [実機記録](../evidence/sky-multi-model-pixel.json)。
## エージェントスミス10時間開発プロンプト（SKY14・SKY15・SKY21 / ROCK）

利用者の「10時間エージェントスミスの開発に関するプロンプトを作成して」を受け、[正味600分の開発指示](../prompts/agent-smith-ten-hour-development.md)を次の入口にした。先行する研究automationは一時停止し、実働7分を開発へ算入しない。ROCKはローカル未コミット差分保全、main基盤同期、自作Agent/PackageとZema job、macOS Zoomの未送信下書き・readback・停止を担当。EXTERNALはOS/Zoom公式能力、JOINTは実Zoomと二利用者、OWNERは対象/OS許可/外部作用/費用を担当。branch CIはsource-preparationのみで全体合格ではなく、実行時にGitHub SHA/CIを再取得する。今回の完了条件はプロンプト保存と整合チェックであり、開発0/600分、実Zoom新操作、main統合、公開は未完了。

## 本人用Linuxへの追加・配置・実行（SKY14/15/21・BIL02 / ROCK）

2026-10-19の本人指定は**Pixel本体のLinuxで実行**。同じUI/仕事契約を既存Terminal Debian guestへまとめる`npm run sky:linux:pixel:build`と固定Node/runtime/model導入を追加した。本人の「任せた」で操作を引継ぎ、実Pixelのモデル/3担当追加、実依頼、料金、実Download703byte、実PID停止とSky終了後読戻しを限定受入。host集中28/28、全verify合格（Node1003/API1330/CSV113）。同時操作が再開した後は画面入力を停止し、現画面を変えずにSky/guestを終了した。Terminalのbackground/転送復旧と起動入口の簡略化、一般品質は後続課題。PC計算の先行受入は別証拠とし、一般公開しない。[追加契約11項目](../sky-tools-complete-design.md#sky-private-linux-deployment)。

[11項目の正本](../sky-tools-complete-design.md#sky-private-linux-deployment)と[本人用手順](../../toolkits/sky-linux-local/README.md)を入口とする。モデル条件を確認→専用Linux準備→文章担当追加→料金/保存を確認→実推論→review→持出し/確認→実プロセス/VM停止を実装する。既存workflow/owner/revisionを保持し、fixture、同一Linux実推論、Web/Pixel/Cloud/OS imageの受入を分ける。ROCKは固定環境/制御/保存、EXTERNALはLima/Debian/llama.cpp/Qwen、JOINTは同一Linuxの一周、OWNERはmodel条件/素材/料金と保存を担当。検証は`node --experimental-strip-types --test tests/sky-linux-local.test.mjs tests/sky-app-foundation.test.mjs`、`npm run typecheck`、`npm run lint:product`、`npm run design:check`、`npm run verify`と実browser。一般公開は保留。

## エージェントスミス実アプリ接続調査（2026-10-19 / SKY14・SKY15・SKY21 / ROCK）

[一次資料と既存sourceの比較](../sky-tools-complete-design.md#sky-agent-smith-research-20261019)を更新。Zoom本人だけの会議チャット読取・成果持出しは限定受入済みだが、AX操作probeは型検査とCLI確認だけでBroker job・操作後読戻しへ未接続。Zoom Plugin SDKはZoom 7.0.2以降のネイティブIPC候補で、現MacのZoom 7.1.9は版条件だけ満たす。SDK取得・OAuth・実操作は未実施。最初の実証は本人だけの会議で既存Chat入力欄への未送信下書きと同欄読戻しを一件のSky jobへ結び、対象変更・OS許可失効・停止時の拒否を確認する。ROCKはlease/Broker/成果、EXTERNALはApple/Zoom API、JOINTは実画面・二利用者、OWNERはOS権限・素材・外部作用を担当。`npm run design:check`、`npm run verify`と実Zoomの操作前後記録で受け入れる。一般公開、送信、RTMS、Plugin SDK採用はこの調査で認定しない。

10時間研究の第1チェックポイントではSlack shortcut、Teams message extension、Chrome activeTab、Windows UI Automation、Android Accessibilityの一次資料を比較。Sky内部Add、host App/拡張導入、hostデータ許可、Brokerのjob実行承認を別状態にする。特にGoogle Playの一般assistant向けAccessibility自律操作制限により、PixelのPlay配布経路を汎用画面操作で成立すると扱わない。根拠とhost別の未受入は上記詳細設計に記録。次は既存Package/Registry/Zema/Brokerの契約にhost別leaseと失効・費用をどう結ぶかを調べる。現在は研究中で、host adapter追加・実操作・本番受入はない。

第2チェックポイント: host fit・capability envelope・Zoom owner link・型付き成果の部品と、審査済みPackage runtime binding、private Zema jobは別経路。Zoom試作の固定候補/手入力結果を縦断受入と扱わない。集中17/17試験合格。次の合格証拠は同じowner/job/revisionで実host grant、package digest、費用上限、対象操作、成果readback、停止/失効を結ぶこと。詳細な接続順は上記設計節。

## Sky全体の表示ルール

[Product / UXのUXRS01](01-product-ux.md)が主担当。[共通契約](../sky-tools-complete-design.md#sky-plain-language)に従い、接続・実行・成果の専門語を普通の説明へ変更し、エラーと未確認状態を共通処理する。接続先や権限、費用、失効、元の記録は保持する。表示の修正は外部提供元の受入や一般公開を意味しない。

## Sky基盤とZoom/Planner共通契約（SKY14・SKY15・SKY21 / ROCK）

ローカル受入: [同一sourceの証拠](../evidence/sky-foundation-local.json)。集中30、Node971、API1328、CSV113、全体verify exit0、既存Planner engine/syntaxとpatch dry-run合格。COOPを維持して実Plannerボタン→共通Sky→本人確認→元task確認待ち、完了0/12の維持を最終sourceで再実測。Zoom途中停止/再実行/確認、本人A/B・保存/読戻し/export、production/default閉鎖は合成環境の受入。実Zoom/実owner設定/OS実機/本番は未受入。

最新の明示指示はSky基盤→RockstarOS→機種別adapter、Zoom/Plannerを共通基盤へ接続すること。ROCKは共通request/result、workflow/owner保存、scope/停止/持出し、私的local受渡しを担当。EXTERNAL/JOINTは実Zoom/OS/Provider/本番SSO、OWNERは素材・採用・費用・公開条件を決める。[正本11項目](../sky-tools-complete-design.md#sky-foundation)。本人用永続APIは未設定で404、Lab/channelは本番404、一般公開しない。Planner sourceは指定チャットの既存checkoutにlocal-only分岐とcompanionを追加し、公開版分岐/個人データ/配備を変更しない。元task fingerprintとSky job/revisionを照合して確認待ちへ戻す。COOP保持のため短命窓口を使う。検証は集中`tests/sky-app*.test.mjs`/Zoom/export、既存Planner AMC試験、Worker/D1 API、実browser、project/database同期、baseline/design/全体verify。

## Zoom本人用Agent Lab（SKY14・SKY15・SKY21 / ROCK）

受入結果: [限定証拠](../evidence/sky-private-zoom-lab-local.json)。実browserで独自recipe作成/Add/途中停止/再実行/成果確認、編集のAdd解除、設定JSON読込み・再Add、3domainリンクを確認。集中9/9、全体verify exit0（Node960/API1220/CSV113）、production Worker404合格。download保存完了は検査toolで未確認。全体logは`/private/tmp/sky-private-zoom-domains-final-verify.log`。

最新指示の作成→Add→実行→成果確認→停止を、development/loopback限定の手入力recipeとして実装。ROCKはtab内のUI/parser/workflow/停止/持出し、OWNERは素材とAdd、EXTERNAL/JOINTは実Zoom/端末連携の別gateを担当する。端末Agent優先を維持し、一般公開しない。[責任/状態/失敗/受入](../sky-tools-complete-design.md#sky-private-zoom-lab)。検証は`node --experimental-strip-types --test tests/sky-private-zoom-lab.test.mjs`、実browser、`npm run typecheck`、`npm run lint:product`、`npm run design:check`、OpenSSL3で`npm run verify`。永続Zema job/Registry審査/実Zoomは未受入。

## 2026-10-05 SKY07 / ROCK — AWSクラウド導入・提携準備

費用方針の訂正: 本人/avokado自己負担0。大規模な支援枠を相談し、超過/対象外/期限後/税/撤収まで相手側負担を確定してから実証する。開発対価は別途交渉。自社負担の月額上限を再度求めず、未成立なら有料環境を作らない。

利用者指定でAWSを優先相談先とし、avokado llc／米国名義の構成レビュー・代表Agent実証・クレジット支援を準備する。[相談範囲、構成、責任、合格条件](../provider-contract-readiness-20260930.md#aws-partnership-preparation)と[比較の更新](../cloud-agent-provider-comparison-20261001.md)が入口。初回hybrid実証から、永続API/DB/workflowのAWS移行を段階受入する案。A2A wire仕様・認証・quote/usage拡張の相違をadapterで検証し、既存の本人・予算・二重送信拒否を緩めない。ROCKは準備/adapter、EXTERNALはAWS提供条件、JOINTはsandbox受入、OWNERは連絡先/予算/契約。請求はBIL02へ接続する。

完了条件は相談原稿・移行境界・実証合格条件・未決定条件の明記。提携成立・runtime受入は別。`npm run project:update`、`npm run baseline:check`、`npm run design:check`、`npm run verify`で文書整合を検査する。GitHub main 592daeeaとlocal 37c06cecは異なり、runtime実装前にmain/引継ぎ入口を同期する。問い合わせ・AWS作成・実model実行は未実施。

## 2026-10-01 SKY21 / JOINT — Pixelのサービス受入

[実機受入記録](../evidence/sky-pixel-service-acceptance.json): USB承認済みPixel 10／GL066／frankel、Android17を限定propertyで確認。Rock3アプリは0.1.0。Web27・CSV8・端末reader3試験合格、全体verifyはNode550・Fashion19・合成API376合格。PixelのSky画面操作は本人から明示許可済み。Vanadiumで公開Marketの表示、Android向け絞り込み、CSV検索1件、詳細からCSV専用画面への移動と未ログイン時のサインイン案内を実機確認した。本人ログイン、受付・処理・保存・再表示・ダウンロード、本番利用者の分離は未受入。スクリーンショットと結果を受入JSONへ記録した。本人の実機・本番サインインと、fixtureの成功を分離する。

## 2026-10-01 SKY21 / ROCK — 独立Skyのサービスローンチ

[ローンチ設計](../sky-launch-design.md)と`data/sky-service-launch.json`を追加。基本利用、外部作者市場、有料販売、別client/実機対応を別々に受け入れる。service-status APIと同じ利用条件をSky home/market/detailへ反映し、標準ガイドと外部AIを分離。`/sky/help`で現在の保存場所と制限を案内し、公開readback済み。作者申請は入力前に本人条件を確認し、401はサインインへ案内、接続失敗は再確認可能。運用・受入手順を `docs/sky-launch-operations.md` に追加。source/fixture/publication/authenticated productionの証拠を分け、未設定の決済や未受入のMCP公開を完成扱いにしない。

# Sky / MCP

## Sky Addの端末Agent優先経路（2026-10-18 / SKY14・SKY15・SKY21 / ROCK）

利用者の追加指示で、Zoom App事前導入を前提にした経路を主経路から外した。Sky／RockstarOSの端末AgentがOSのAccessibility許可を得て、本人が使っているZoomの画面要素を観測・操作する。対象アプリのZoom Pluginは不要だが、Sky側runtimeとOS権限は必要。Zoom Apps SDK／OAuthは会議データや専用パネルが必要な時の追加経路。ROCKはtarget固定、Brokerの一回承認、Zema job/artifact/停止、OS adapterを担当。EXTERNALはOS APIとZoom UI、JOINTはZoom版ごとの実動作、OWNERは対象画面・読取り・入力・送信・費用を承認する。

限定macOS研究probe `scripts/sky-add-macos-ax.swift`は前面Zoom `us.zoom.xos`のAX要素を値なしで観測し、明示CLI実行・TTY確認・対象再確認の一操作を試すsource。`CLANG_MODULE_CACHE_PATH=/private/tmp/sky-add-clang-cache SWIFT_MODULECACHE_PATH=/private/tmp/sky-add-swift-cache swiftc -typecheck scripts/sky-add-macos-ax.swift`で型検査する。次の合格条件は、isolated accountでAX許可/拒否/失効、window変更、外部作用の別承認、実Zoom版で本人二人分離、同一jobのZema成果保存/読戻し/停止を実測すること。現状は型検査のみで、実Zoom操作・Broker接続・本人承認・収益・公開を合格としない。[入力、状態、復旧と受入](../sky-tools-complete-design.md#sky-add-agent-ecosystem)。

## 最新の実装優先: 本人job持出し・独立閲覧、一般ローンチ保留（2026-10-18 / SKY21・ROCK）

実装結果: [限定受入証拠](../evidence/sky-owner-export-local.json)。集中17件と全体verify（API1218/CSV113）合格、API取得HTMLの独立parserで6 fileの整合を確認。独立browserのfile閲覧はツールpolicyで未実施、SF03/04全範囲と本番は未合格。

利用者の最新明示指示で、本人主導・退出を主軸、オフィシャル/ユーザー作成Agentの対応hostへのAddを応用層とする。まず成果画面の「この仕事を持ち出す」とowner別read-only export APIを実装し、一件のjob/保存text/usage要約を自己完結HTMLへ回収する。型付きmanifest/hash/省略、認証と二利用者、revision競合、改変、容量、script禁止、Skyなしの閲覧を確認する。主担当ROCK、Provider/別clientはJOINT、利用者の回収範囲と共有先はOWNER。既存workflow/委任/保存/usageを再利用し、migrationは追加しない。[契約と実装範囲](../sky-tools-complete-design.md#sky-user-freedom)。

一般ローンチは保留し、`data/sky-service-launch.json`と検査CLIで明示する。[国への共有説明](../sky-launch-design.md#sky-private-review)は米国/スペイン/日本/韓国を候補とし、「人の中にAgent」は未実証の研究目標として別管理。政府窓口未確定、送付未実施。最新main/branch SHAとmainのP0〜P4を読み、実行プロンプトの入口/優先順位を先に同期した。未反映のmain workflow/store/migrationを上書き/mergeしたとはしない。検証は`node --experimental-strip-types --test tests/sky-owner-export*.test.mjs tests/sky-launch-audit.test.mjs`、`npm run typecheck`、`npm run lint:product`、`npm run project:update`、`npm run design:check`、`PATH=/opt/homebrew/opt/openssl@3/bin:$PATH npm run verify`。SF03/04は今回の限定scope、全account移行/終了後回収/本番は別gate。


## 本人主導・退出可能性（2026-10-18 / SKY07・SKY14・SKY15・SKY21）

利用者の明示指示で、Skyを本人の選択・拒否・実行できる力を増やし、Sky自体からも退出できる製品へ設計する。[全Tool詳細設計のSF01〜SF08](../sky-tools-complete-design.md#sky-user-freedom)を受入基準とする。主担当ROCKは既存Connector/Broker/workflow/成果/usageで、選択・透明性・停止・版付き持出し・独立閲覧・回収/削除を実装する。EXTERNALはProvider停止/失効・保持・license、JOINTは実接続と独立client取込み、OWNERは範囲・移行先・契約終了を決める。AI02のローカル適合、BIL02のeSIM/料金/終了後回収、Securityの本人分離と保持条件へリンクする。

今回の完了範囲は設計と受入条件の保存。既存taskの実装済み範囲は維持し、追加のSF受入を完了へ進めない。GitHub mainの最新SHAは`70c3e3ef3a05d6f0c9d068616a98f47a38b96d4a`、対象branch `codex/esim-cloud-access`とlocal HEADは`951d82d5a491a284aed4e0d4d280171d835d4b43`（2026-10-18に`git ls-remote`で確認）。mainはlocal HEADのancestorではない。次のruntime実装は先行dirty差分とDB履歴を保全してmainの入口/migrationを同期後、SKY21で本人一件の持出しとSky通信なしの閲覧（SF03/04）、SKY07/14の停止/失効、BIL02の終了後回収、SKY15の別client互換性へ進む。文書保存、branch commit、main統合、公開は別記録とし、CIは今回未確認。検証は`npm run project:update`、`npm run baseline:check`、`npm run design:check`、`npm run verify`。SF runtime試験は未実施。

## Sky Add Moment / Zoom内での瞬間導入（2026-10-18 / SKY14・SKY15・SKY21）

利用者はZoom等を操作中に欲しい機能を思いついた瞬間、Sky Agentをその場で探してAddし、成果をアプリ内で受け取る製品を指定。主担当ROCKはhost入口、Agent適合、Broker／Zema／artifact契約とローカル試作を実装する。EXTERNALはZoom等の正式SDK・API・OAuth・審査、JOINTは実アプリ内の本人別取得・処理・返却・失効、OWNERは接続先・scope・会議データ・外部作用を承認する。`/sky/add/zoom`の手入力試作は同画面結果まで動作、Zoom本接続は未受入。[設計・一次資料・10時間調査条件](../sky-tools-complete-design.md#sky-add-agent-ecosystem)。次はZoomの正式app登録・配布とsandboxでの実context検証、Sky Registry／Zema接続、他appへの共通化を進める。検証は`npm run typecheck`、`npm run lint:product`、browser画面操作、`npm run verify`を使う。

08:25 UTC追補: Zoom公式のTeam Chat shortcutは既存message／composeからWebViewを開き、会議中はZoom App side panelが入口。Agent内部Add、Zoom App初回追加、Zoom OAuth同意、Chatへの投稿、RTMS開始は別状態・別承認にする。最初の受入は私的な同画面プレビュー。`X-Zoom-App-Context`をbackendで復号・期限検証し、ownerと起点を結んだ後だけZema/Brokerへ渡す。Chat送信とRTMSは後続gateで、Developer Pack creditsとhost/admin/参加者制御を別見積・別試験にする。公式根拠、実装順、未受入条件は上記設計へ記録。次はhost surface／入力source適合契約、実Zoom context拒否試験、Registry→Zema一件を実装・検証する。

09:22 UTC追補: Slack shortcutsは署名済みHTTP payload・3秒ack・modal、Teamsはmessage extension action／meeting side panelという正式入口を確認。`lib/sky-add-host-contract.ts`にsurface／input source／return slotの静的適合判定を追加し、Zoom手入力試作へ適用した。Slack／Teamsは型の候補のみで実adapterはない。次はhost別context検証とowner結合、既存Registry/PassportとのAgent宣言照合、Zema/Brokerの予算・job・型付き成果・失効へつなぐ。ROCKが契約と実装、EXTERNALがhostのAPI/配布条件、JOINTが各appの実受入、OWNERがデータscopeと共有・有料実行を決める。詳細と公式根拠は上記設計を参照。

10:28 UTC追補: Zoom公式の暗号化`X-Zoom-App-Context`をWeb Cryptoで復号し`exp`を検査するサーバー用部品を追加。合成fixtureで有効・期限切れ・鍵違い・形式不正を確認した。Zoom UIDはSky本人IDではなく、既存`requestRockstarUser`経路・権限・quote/予算へ直結しない。ROCKの次作業はnonce付き本人結合、短命host session、owner別Registry照合と失効。EXTERNALのZoom Client Secret／OAuth／実header、JOINTの二利用者・meeting/panel受入は未着手。既存の90日端末sessionをZoom WebViewへ渡さない。設計と公式根拠は上記全Tool詳細設計へ追記。

11:30 UTC追補: Zoom Marketplace公式は隠れた機能と将来機能用scopeの先取りを禁じ、scope追加にfunctional/security審査と利用者の再認可を求める。ROCKはZoom Appの申告済み用途・承認済みscope・実grant・data class・surface・返却先の積集合をAgent適合条件へ追加し、超過時は実行可能表示を止める。EXTERNALはApp更新／審査／OAuth、JOINTは正式App上の権限・機能・成果返却、OWNERはデータ利用目的と第三者共有の条件を決める。現行の静的三項照合にこのenvelopeは未実装。US11126446B2請求項は自然言語のskill選択、surface manifest、tenant承認を含み、一般的な「欲しい機能→Add」を独自性として扱わない。詳細な請求項比較と実受入条件は上記設計に記録。

12:29 UTC追補: `lib/sky-add-capability-envelope.ts`へ申告済み目的／scope／data class／surfaceと利用者grant／role別SDK methodの発見用判定を追加。App更新、再認可、session不足、SDK method不可を別理由にする。ZoomのGuest Modeは未認証／認証済みだがApp未追加／許可済みを区別し、role別`getSupportedJsApis`をOAuth scopeとは別に確認する。合成宣言の判定は実Zoom認可でもBroker実行許可でもない。次は検証済みApp設定・grant・SDK method状態をserver側で取得し、nonce付きSky owner結合とZema jobへ渡す。EXTERNAL/JOINTの正式Zoom App受入は引き続き未完了。

同時刻のcontext追補: 公式Guest Modeでは起動headerに`uid`がないため、現行Sky owner結合用verifierはguestを拒否する。breakoutの`mid`はroom UUID、`pid`は親meeting UUIDとして別保存し、数値Meeting IDを本人・会議instanceの結合キーにしない。合成headerのbreakout保持とguest拒否を確認。実Zoom Clientでのguest／breakout受入は未完了。

失効追補: Zoom公開Appは`app_deauthorized`を受信するが、private／開発中Appでは通知が来ない。ROCKは短命host lease、本人失効、実行直前の認可readbackを先に設計し、公開後は署名・時刻を検証したWebhookを追加失効経路にする。EXTERNAL/JOINTは配布形態ごとの解除、Webhook遅延、進行job停止・費用照合を試験する。endpointと実失効は未実装。

13:33 UTC追補: `/sky/add/zoom`のHome URL server pageで`X-Zoom-App-Context`を検証部品へ接続し、clientへは検証状態と`typ`だけを渡す。secretなし・不正header・SDK画面不一致ではZoom候補を出さず、一般browserの手入力試作は残す。ROCKの次段階はZoom UIDとSky ownerのnonce付き短命session結合、認可grantのserver readback、既存Zema jobの一件接続。EXTERNALはZoom App設定／実header、JOINTは実Zoom HTML headers・画面・二利用者と失効の受入。合成header試験は実Zoom起動の証拠ではない。

実Zoomへの最初の進路はDevelopment AppのLocal Testで本人Clientへ追加する公式経路。公開Marketplace審査を待たずに起動headerと画面を試せるが、App作成・HTTPS Home URL・開発secret・本人認可は未実施。外部testerのBeta／Private共有は別条件。ROCKは試作の受入手順を用意し、EXTERNAL/OWNERのApp設定後にJOINTが同一開発版で検証する。

14:33 UTC追補: Zoom公式の第三者OAuth警告を踏まえ、`lib/sky-add-owner-binding.server.ts`にHMAC化したhost利用者とSky owner、App、画面、期限・失効のserver側照合を追加。合成二利用者・期限・画面切替・失効を拒否した。ROCKはnonce付きlink record発行・短命lease・実行直前のreadback、EXTERNALはZoom OAuth／実header、JOINTは二利用者と再認可・解除を受け入れる。現在の判定は信頼済みlink recordを受け取る前提の部品で、本人リンク／Zoom実行許可は未実装。

15:35 UTC追補: 第一者`SkyAppOutputSlot`の本人別A2A成果取得・schema検査を確認。Zoom試作の手入力結果を`sky.zoom.meeting-notes/1`、`manual.text`、`embedded.private`の型付き一時成果として検査し、共有slotや別schemaを拒否する。ROCKの次作業は実Zema job/revisionとhost leaseへ内容成果を結ぶこと。EXTERNAL/JOINTのZoom WebView本人sessionと再読込・失効時の配達受入は未実施。現状の型付き成果はbrowser内のみで保存済みAgent artifactではない。

16:31 UTC追補: Zoom Surface公式表ではMeeting内SDK＋Chat shortcutの候補はuser-managed Appで、admin-managed Meeting欄にSDKはない。Chat shortcutはApp当たり最大20なので、Sky入口一つから内部Agentを探す。直接Meeting起動deep linkは公開済み・本人追加済みAppが前提。ROCKは初回導入と再利用を別計測、EXTERNALはuser-managed Development App、Home URL／allowlist／scope、JOINTは同一実Zoom Clientで起動時間・候補時間・成果時間と二利用者を受け入れる。local 200 HTMLで4安全headerの存在だけ確認し、HTTPS・WebViewの受入は未完了。具体的な計測点と公式根拠は全Tool設計を参照。

17:38 UTC最終: 約10時間18分の一次資料調査窓を終了。ROCKのローカル試作はbrowserの手入力→候補→型付き私的成果を同じパネルに表示、合成host header／owner／grant境界と既存回帰を確認。EXTERNALのZoom App作成・配布・OAuth・実header、JOINTのZoom Client二利用者／会議・Chat入力／Zema job・成果／停止・失効、OWNERの実データ・有料契約・外部送信条件は未受入。次はDevelopment AppのLocal Testで最小の手入力・私的成果から受け入れ、実測後に正規データscopeと共有を別gateで検討する。調査終了を本番Zoom対応や発明の独自性確定に読み替えない。

## Sky Addと作者向けAgent導線（2026-10-18 / SKY14・SKY15・SKY21）

主担当ROCK。Skyを対応するアプリ／仕事／端末へAgentを追加する層にし、ユーザーの実際の悩みから成果を返せるAgentを簡単に作り、審査済みMarketplaceで販売・収益確認できる設計へ更新。既存Studio／SDK／Package／App Output Plugins／Zemaを再利用し、Terminal/Linux・任意ローカルLLMの出力は本人別の型付きartifactとして扱う。[目的、入出力、状態、失敗・復旧、料金、合格条件](../sky-tools-complete-design.md#sky-add-agent-ecosystem)。EXTERNALは接続先app／Provider、JOINTは外部app・決済sandbox、OWNER／作者は公開・scope・価格・有料実行を承認。次は非金融Agent一件と第一者app slotを選び、作者の雛形作成→local試験→Add→実job→成果表示→停止／失効を測る。外部app、任意model交換、Linux成果取込み、作者払出しは別gate。`npm run baseline:check`、`npm run design:check`、`npm run sky:check`、`npm run billing:check`、`npm run verify`で設計と既存契約を照合する。

2026-10-18利用者補足: 入口は対象アプリで欲しい機能からAgentを見つけてAddする。Zoomの会議後処理を例に、対応能力・scope・出力先をAdd前に照合する。ROCKは発見／権限／成果契約、EXTERNALは接続先の正規API・拡張口、JOINTは実アプリでの取得・処理・表示・失効、OWNERは接続と会議データ・外部作用の承認を担当する。Zoom本接続やZoom内UIをこの設計追記で合格扱いしない。

## 2026-10-01 MCP直接実行の料金gate

全MCPのTool一覧に料金方式を持たせ、価格申告をPassport digestへ含めた。Sky Tool SDKは料金未定義・未知方式のTool登録を拒否する。PC ConnectorはローカルSDK descriptorまたはremote MCPの`_meta['rockstaros.dev/pricing']`から料金方式を読み、欠落は`unknown`として実行を停止する。`free`であってもUIは提供元申告と表示し、Rockstar独立検証済みとは主張しない。さらに遠隔MCPの`free`自己申告は、署名見積・予算予約の共通経路がないため直接実行不可とする。local SDK descriptorは別境界であり、表示上の`free`は外部料金がない証明ではない。subscription/usage/external contractも直接実行不可。料金条件の変更はPassport digestを変え、承認を更新させる。

この変更は、MCP tool callを直接呼び出すとProvider料金が発生しうる一方、MCP標準自体には価格見積とusage finalityの共通契約がないという既存設計上の穴を閉じる。料金付きcloud agentはA2Aのquote/cap/live usage/receipt経路へ接続する。確認対象はSDK登録、provider metadataの表示・欠落時拒否、遠隔free自己申告も含むapproval前の実行拒否である。Node connector/SDK tests、typecheck、product lint、buildでローカル検証する。これはprovider metadataの真実性、production billing、第三者MCPの契約受入を証明しない。

2026-10-01の追加回帰試験では、remote MCP fixtureが`free`と自己申告してもPassport表示だけに留まり、`prepare`が自己申告理由付きで拒否することを確認する。Cloud LLM/legal/patent/Jevの直接remote routesは、価格・予算・settlementが未接続の間はfail-closed。これは列挙した経路とローカルfixtureの再確認で、全repoの任意background egressが不存在であることの証明ではない。

## 目的

自動化Toolを安全に発見、登録、接続、権限確認、実行、停止、結果確認できる共通面を提供する。MCPごとの個別例外ではなく、Connection Passportと一回承認を共通契約にする。

## 現在地

- 2026-10-04 SKY07／SKY14（ROCK）: IP StudioへLiveKit音声・電話の接続設定・Zema候補選択・依頼振分けを追加。設定保存は実接続ではなく、別アプリ本体と音声・電話runtimeの受入は未完了。[契約と残る作業](../sky-tools-complete-design.md#ipキャラクターの音声会話電話連携2026-10-04)。

- 2026-09-27 SKY14 / ROCK（SKY15連携、全体進行中）: 全Sky／Zema／OS Tool実用化・サーバー管理不要・ローカルLLM優先の最初の実用milestoneを確認。ローカルViteの共通管理runtimeから同梱Connector／Fashionを自動起動・健康確認し、実ブラウザのFashion保存操作→ProducerのDB書込→`instagram.calendar.list`再読込一致を確認した。Sky接続操作から基本4機能の検出、Zema納品サンプルから自動接続→`verify_delivery`の実照合`PASS`も確認。`components/delivery-runner.tsx`の非実在接続導線と未接続時disabledを修正した。合成入力のみで外部納品なし。関連35試験（isolated Vite終了後の両port停止を含む）、API回帰172項目、最終build・型・対象lint・package一致・差分検査は合格。全体testは389件中378合格・11失敗（既存visual baseline、README文言、migration-union件数差）、全体verifyも既存baseline停止で未合格。34件の最小経路棚卸しはブラウザ6、Web API／DB3、PC2、外部AI1、候補22で、LLM起動だけで候補adapterは実装されない。FashionのProvider4件はmock、ページ再読込後の結果復元UIは未実装。推論runtime／モデル導入は本人回答待ちで未導入。Ledger、IP Studio、候補22件、native常駐・公開Web→本人PC relay・外部Providerの受入は残る。既存SKY14／SKY15の状態は過去の範囲のまま保持し、全34 Tool完成へ読み替えない。[実装根拠・実行分類・受入範囲](../sky-tools-complete-design.md#13-全toolの実行器棚卸しと管理runtime進行中)。

- 2026-09-27: Sky Marketの各catalogカードと個別詳細に「アイコンを押して機能を見る」導線を追加。機能説明・現在の状態・利用環境・費用をダイアログで確認できる。カードの他の場所は詳細へ進むまま維持。Jev Routerの詳細は重複した情報欄を閉じた表示にしても、未接続・PC CLI条件と公式導入先を本文に残す。アイコン操作は接続・実行・認証を開始しない。対象9試験、typecheck、lint、Sky/設計チェック、buildに合格。Chromeのローカル画面で開閉・詳細遷移・Enter/Escape・console errorなしを確認。全体verifyは既存visual systemとavokado配色の不一致で`baseline:check`停止。
- 2026-09-27: マーケットの端末適合表示を追加。ブラウザのOSから明確に不適合なPC専用・macOS専用Toolだけを初期非表示にし、対象外も理由付きで再表示できる。判定不能な端末や未検証のソフト・アカウント・実接続を「対応済み」と扱わない。Jev Router詳細は接続に見える汎用の下書き欄を外し、本人PCのCLI・Node・TypeSafe認証が必要な未接続候補と明記。PC Connector/CLI adapter・秘密管理・外部送信同意・routing receipt・失敗時fallback・E2E受入が揃うまでSkyワンクリック接続は未提供。対象7試験、型、lint、Sky/設計チェック、build合格。Browser Useからlocalhostへ到達できず目視未確認。全体verifyは既存visual systemと現行avokado配色の不一致で`baseline:check`停止。
- 登録入口の区別: Sky Marketの「開発したツールを登録」はWebの`/sky/register`掲載申請。`/sky/publish`は既存のStudio/SDK設定であり、掲載フォームではない。Sky本体の「掲載」ボタンからも同じ掲載フォームを開ける。
- 2026-09-27: Sky Marketの登録CTAを実際の掲載申請へ直結。申請者本人の前回提出から提供者名・サポートURLのみ明示操作で再利用し、遠隔MCPが応答した場合だけサーバー名をツール名の下書きに入れる。権利・ライセンス・料金・データ利用は自動推定しない。料金の「無料」初期値を撤去して選択を必須化し、審査済み外部Packageの料金方式を一覧に表示。購入者決済・開発者払出しは有効化せず、商流とProvider条件の決定後に別受入とする。対象のマーケット試験4件、typecheck、lint、build、Sky/設計チェック合格。全体verifyは既存visual system期待値と現行avokado配色の不一致で`baseline:check`にて停止。
- 2026-09-27: Sky内に`/sky/marketplace`を追加。ROCK担当で、34件の既存catalogと有効な`verified`公開Registryを検索・カテゴリ・状態別に分け、各Sky Tool詳細とStudioの入口をつなぐ。Tool詳細も提供元・license・料金・実行先・手順を確認できる画面へ更新。22件の導入候補は本体未接続と表示し、公開Packageの購入や自動インストールは有効化しない。対象18試験、typecheck、lint、build、PC/390pxブラウザで検索と候補絞り込みを確認。全体verifyは既存visual system期待値と現行avokado配色の不一致で`baseline:check`にて停止。外部Providerの本番接続と一般公開は別受入。
- 2026-09-25: Sky/Zemaの34 catalog Toolに固有アイコンを割り当て、Zemaから候補22件を個別に選べるようにした。Zemaの依頼文は候補のローカル確認画面へ引き継ぐ。旧Mr.11件は下書き、外部研究Tool10件はTool別の接続計画、IP Studioは専用アプリ入口として表示し、いずれも本体未接続・外部実行未確認の境界を保持。ローカルD1初期化後、YouTube台本の下書き表示とfaster-whisperの接続条件表示を実画面で確認。固有アイコン試験・対象6試験・buildは合格。全体verifyはREADME日本語文言を期待する既存の文書試験2件で停止。残りの外部本体接続と22件個別受入は未完了。
- Sky公開RegistryとTelegram配布を、有効期限内の証拠付き`verified` Packageだけへ限定した。開発者の`published_declared`は審査待ちとして非公開にし、固定source revision／SHA-256、権利、license、権限、privacy、料金、Sandbox、出力品質、証拠URL、reviewerを追記専用台帳へ保存する。失効時は既存grantも即時に一覧・再取得から除外する。利用イベントはEvent IDで冪等化し、一時失敗を最大3回再送する。sourceの型・schema・lint・対象15試験は合格。Web D1 migration `0016`、server-side審査credential、本番readbackは未実施のため`SKY20`は進行中。
- Product Hunt候補から公開URLをSky掲載申請へ引き継ぐ導線を追加。URLのホスト・経路・認証情報を検証し、提供者・接続先・ライセンス・権限を本人が確認する審査キューで止める。Product Hunt APIの無断収集・自動公開は行わない。
- 候補収集は`npm run discover`でGitHubとHugging Faceの公開メタデータを取得し、`npm run discover:watch`またはGitHub Actionsの6時間間隔で再実行できる。`data/discovered.json`は同一候補を更新して最大500件まで保持し、すべて`reviewStatus: pending`・`executionEnabled: false`のままSkyの審査前データとして保存する。Product Huntは`PRODUCT_HUNT_ACCESS_TOKEN`と事業利用承認フラグの両方がある場合だけ収集し、トークンはWebアプリへ渡さない。
- 2026-09-20の再受入: 起動済みPC ConnectorをSky画面から接続し、MCP 45機能（基本4、Fashion 41）を認識。基本MCP4機能を合成入力で実呼び出しし、全4件で非エラーの成果本文を確認。Sky→Zema→PC納品照合→`PASS`本文も完走し、サブスク顧問はPC台帳への接続と質問回答を確認。Marketはサインイン済み画面でPAPER提案・承認・実行・レシート保存まで完走。ready 12件中、ローカル/合成データで成果を確認できたのは10件。メルカリは実在庫確認を要するため実画面の作成を保留、Jevは外部AI設定と本人同意が未充足。候補22件には本体実行器がなく、下書きのみ。Sky/Zemaで候補を「接続済み」「完了」と誤読しない表示に修正し、PC接続後の納品照合カードからZemaへ直接進めるようにした。
- 同修正後の`npm run verify`はローカル接続を許可した環境で完走。型、lint、ビルド、仕事API149項目を含む全gateが合格。外部Providerの本番成功はこの合格へ算入しない。
- 2026-09-20の34件実行監査: ready 12件中、Sky/Zemaの実画面でサンプル成果本文またはCSV成果物を確認できたのは7件（CSV、Fashion簡易プラン、ココナラ案件チェック、記事無料版、出典整理、法務受付、特許アシスタント）。Marketとメルカリは個別自動試験合格だが実画面で完走していない。納品照合・顧問はPC未接続、JevはProvider接続と利用同意が必要。candidate 22件は共通ローカル下書き経路で本体実行の成功なし。候補画面の操作文言を「接続確認の下書き」に修正し、実画面で再確認した。対象試験32件、SDK/市場14件、メルカリ等13件、CSVチェック・型・lint・buildは合格。通常の制限環境では全体verify中のローカルサーバー試験が進まなかったため、ローカル接続を許可して再実行し、全体verify合格（自動試験346件、Fashion別枠19件、仕事API149項目）を確認した。この合格を外部Provider/候補本体の実成功へ換算しない。
- Catalogの34件それぞれについて`/sky/tools/<id>`をローカルサーバーから取得し、34/34件がHTTP 200。これは個別画面の到達確認であり、候補や未接続Toolの本体実行合格ではない。
- 2026-09-20のlocalhost:3001実画面監査: PC未接続、MCP 0機能、Telegram公開Tool 0件。catalogの`ready` 12件は本番成功件数ではなく、`candidate` 22件は外部サービスの実行成功に数えない。ココナラ案件チェック、記事の無料版メーカー、出典整理ツールはサンプルでローカル成果本文を確認。IP Studioは起動したがHiggsfieldとMake未設定、登録IP 0件。
- Zemaへ個別runnerの結果通知を接続し、MCP空応答を失敗、候補の成果を「下書き」と表示する変更を実施。型、lint、production build、MCP結果4件、PC Connector 6件は合格。全体`verify`は`remote_ai_rate_limits`分類欠落で中断。個別`sky:check`は旧製品名Hub、`design:check`はcatalogと設計台帳の不一致で失敗。PC／Provider／外部投稿の実成功は未受入。
- Sky内のPC Connector、MCP initialize、tools/list、必須4機能、heartbeat、実行履歴を実装済み。
- stdioとStreamable HTTPのregistry、掲載前inspect、Tool Package、Studioからの登録・公開を実装済み。
- PC内Sky Tool SDK 0.1.2のAppをConnectorが自動検出し、Sky一覧のカードからPassport確認後に接続できる。旧Mr. Hubの11件は候補表示のみで、実行器は未接続。
- Chatは接続済みToolをbotとして扱い、方向修正、承認、停止、receipt表示を行う。
- ZemaでMCPの`isError: true`を失敗として表示し、成功時は成果本文を表示する。Skyからの依頼とZemaで直接始めるbot依頼は仕事ごとのチャットを作り、同じタブのsessionStorageで最大10分だけ会話と結果を復元する。本人別の長期履歴は未実装。
- Zemaの会話画面は履歴を開閉でき、自由文は文章モデルのAPIへ渡す。ローカルBinder未接続時は利用不可を明示し、外部文章モデルへの送信は依頼ごとの許可とserver側の有効化を必須にする。Tool実行の確認・承認は従来どおり維持する。
- 現在実接続可能と扱える標準経路は「このPC」。Sky Cloudとprovider MCPは未受入。

主なtask: `SKY02`〜`SKY09`, `SKY11`, `SKY14`, `SKY15`, `SKY20`, `N05`。

## 次に進める順番

0. 検証済みのローカル管理runtimeを起点に、Fashionの再読込後の結果復元、Ledger／IP Studio、候補22件の本体adapter、外部Provider、native常駐／公開Web relayを個別に受け入れる。本人回答前に推論runtime／モデルを新規導入しない。全体test／verifyの既存不整合は、基準を無断で緩めず別途整合する。
1. 現在のmergeを解消し、PC Connectorの既存試験を同一sourceで再実行する。
2. Sky Cloudとprovider MCPのOAuth 2.1、audience、権限差分、失効、再同意を設計・実装する。
3. 本人別の長期履歴、結果不明時の再送禁止と照合、connection replacement、lease失効を外部MCPで受け入れる。
4. 任意shellや秘密値貼付を許さず、審査済みregistryからのみ起動する。
5. Android/nativeへの搭載は端末ストリームの受入と分ける。

## 完了条件

- initialize、capability、schema、OAuth、実行先、費用、作者、版がPassportに固定される。
- 引数に結び付いた本人承認後だけ変更系Toolを実行する。
- disconnect、失効、schema変更、timeout、結果不明を安全に処理する。
- 「接続候補」と「接続済み」をUIと証拠で区別する。

## 関連資料

- [Sky設計](../sky.md)
- [MCP Connector](../sky-mcp-connector.md)
- [MCP architecture](../sky-mcp-architecture.md)
- [MCP usability](../sky-mcp-usability-20260912.md)
- [Sky Tool SDK](../sky-tool-sdk.md)
- [MCP inspection](../../lib/mcp-inspection.ts)

## 検証

- `npm run sky:check`
- `npm run mcp:package:check`
- `node --experimental-strip-types --test tests/mcp-connector.test.mjs tests/mcp-inspection.test.mjs tests/sky-mcp-onboarding.test.mjs`

## 端末圏外中のクラウド継続実行

2026-09-30の明示指示を[継続実行契約・受入計画](../sky-cloud-continuity.md)へ固定。既存SKY07、primaryOwner ROCK。rockDeliverableは受付receipt、永続controller、予算・期限、承認待ち、停止確認、再接続照合。externalDependencyはcloud/model/MCP provider、ownerActionは契約・費用確定後の実接続判断。承認本文の暗号保存とlocal Cloudflare Workflow dispatch controllerまで実装・fixture確認済みだが、本番runtimeは未接続で12受入シナリオは未実行。ROCK_READYにはしない。

2026-10-01 provider候補再調査: Cloudflare Workers/Workflows/D1は既存controller継続候補。Cloudflare Containers/SandboxesはGA済みの隔離Linux候補（公開上限4 vCPU/12 GiB、GPUなし）、Google Cloud RunはGPU推論候補として比較表へ追加。Cloudflare料金はWorkflows step/storage課金開始を含め公式単価へ更新。実際のdata region・account terms・負荷試験・契約見積は未取得。[Provider readiness](../provider-contract-readiness-20260930.md)。

2026-09-30追加：人・端末・サービスとGTAへの適合は[Sky MCP設計](../sky-mcp-architecture.md)へ記録。既存SKY07／SKY15とGame側DX01に関連する要件準備。GTAとの実接続・動作試験は未実施。

2026-09-30 A2A agent接続基盤のROCK進捗：端末・アプリ・サービス・ゲームがagentとして参加しうる前提で、Skyを発見／接続、Zemaを委任job管理、Core/Brokerをidentity・権限・予算の強制、MCP/A2Aを交換可能なprotocolとして整理。`lib/a2a-client.ts`のA2A 1.0 JSON-RPC discovery／send／get／cancel、本人指定originからのAgent Card取得・owner-scoped snapshot/digest保存と`services/sky-agent-runtime`のscheduled Cloudflare Workflow dispatch／status reconciliation／one-shot cancelを実装。D1 migrations `0019`〜`0023`はowner-scoped委任、承認digest、期限・予算、idempotency、one-shot marker、append-only event、暗号化入力と成果を保存する。remote text artifactは32 KB以内に正規化・暗号化し、owner-only `GET /api/sky/a2a-delegations/{id}/artifacts`で取得可能。Zema Workbenchに委任draft・条件digest表示・状態確認・停止要求・成果レビューを接続したが、Wallet／Provider acceptanceまでは実行承認UIを無効にし、APIとWorkerのdispatch双方も明示enable flagがなければ停止する。`rock-a2a-broker-authorization/1`のEd25519 proofについて、Web検証器に加え`Broker.authorize_a2a_delegation()`の発行methodを実装。本文をBroker receiptへ保存せず、exact consent・owner/device・target・input hash・budget・deadlineを短命proofへ束ね、同じkeyの再要求には同一receiptを返す。Ed25519鍵は外部signer adapterからのみ利用する。Python Broker 45件、Web proof verifier/trust fixture 3件はcross-language固定signing bytes vectorを含め成功。実機signer／Wallet-WebAuthn、owner/device key登録・失効、native OS UIとHub wire公開、owner-scoped proof API、operator-managed trust resolver、Runtime Worker認可hookはfixture接続済み。実鍵管理とWallet連携は未実装。A2A関連テスト35件、API統合251 assertionsも成功。旧Worker local smoke（origin allowlist追加前）はAgent Card到達失敗→`remote_failed/PREFLIGHT_FAILED_BEFORE_SEND`を確認した。現在の空listはauth fixture、Worker dry-run、サイトAPIの認証済みdiscovery 403で検証し、実Providerへは未送信。Sky全体の検索・Agent Card審査・提供者認証、本番egress経路の受入、Wallet予約、同一production D1・secret、異社SDK interoperability、Provider sandbox受入、remote file artifact取得、鍵rotation／KMSは未完了。production readback 0/6、remote migration未適用。SKY07はin_progressを保持する。詳細は[Sky A2A Bridge](../sky-a2a-bridge.md)、[native Broker](../../systems/rock-star-os/docs/MCP-BROKER.md)、[継続実行契約](../sky-cloud-continuity.md)。
# 2026-09-30 Broker proofをA2A承認・送信境界へ接続

`POST /api/sky/a2a-delegations/{id}/broker-authorization`は本人・署名鍵・owner/device・現在の依頼本文と委任条件を検証し、承認待ち中にproofを一度保存する。通常のWeb承認は、現在の信頼鍵でproofが再検証できる場合だけ`prepared`へ進む。Runtime WorkerもAgent Card取得前、one-shot外部送信marker前、A2A `message/send`直前に同じproofを照合する。不在・期限切れ・失効鍵・intent差替え時は外部HTTP要求前に停止する。`A2A_TRUSTED_BROKER_KEYS`はoperator-managed JSON allowlistで、現在のhost fixture以外の鍵は設定されていない。検証器は既存Ed25519 raw鍵に加え、Android Key Attestationと適合するuncompressed P-256 SEC1点を受け付ける。Android公式attestation schemaではattested asymmetric algorithmにRSA/EC/ML-DSAが列挙されるため、Android Broker実装はP-256 hardware keyへ移行し、Java DER ECDSA署名をCloud WebCrypto用P1363へ変換する。これはattestation・trust registrationの完了を意味しない。HubGateway/device wire、実device鍵登録・失効authority、Wallet原子的予算予約、本番D1/secret、Provider sandbox実接続は未完了。

2026-10-01 Cloud usage receiptのWorkflow縦断fixture：`services/sky-agent-runtime/vitest.config.ts`は専用Ed25519 fixture provider keyで、A2A completed task metadataへRockstar usage receiptを署名して返す。Runtime Workerは`A2A_TRUSTED_USAGE_KEYS`で署名とtask/owner/agent/通貨/capを検証し、D1 receiptと子予約settlementを一括反映する。`npm run sky:a2a:workflow:positive` 3/3、`npm run typecheck`成功。USD 100 centsの内部予約から37 centsだけをsettleし、親pool `reserved=0 / settled=37`、同じprovider receipt reference、再起動後のone-shot dispatchを確認。これはlocal fixture／D1内部poolだけで、実provider請求やnative Wallet残高の予約・settlement handoffではない。

2026-10-01 cancellation Workflow縦断fixture：`CancelTask`の署名済み最終利用量11から内部50単位予約を精算し、`cancel_requested`と`remote_cancelled`を分けて確認。再起動で終端状態を読んだcontrollerがProviderへ再照会しないよう修正し、取消claimが一度だけであることを確認。さらに取消要求と完了が競合し、Providerが`TASK_STATE_COMPLETED`・成果物・署名済み利用量を返すケースで、completed状態と暗号化成果を維持し、一度だけ精算することを追加確認。`npm run sky:a2a:workflow:positive` 6/6。証拠は[local cancellation fixture](../evidence/a2a-cancel-workflow-local-20261001.json)と[cancel/completion race fixture](../evidence/a2a-cancel-completion-race-local-20261001.json)。これはcontrolled local A2A agentであり、契約Providerの取消意味・実停止・請求仕様や本番クラウドの合格ではない。

再現検査: `npm run typecheck`、`npm run schema:check`、A2A fixture suite（35件）、`npm run build`、`npm run test:api`（Miniflare Worker/D1 251 assertions）、`npm run sky:agent-runtime:check`。Miniflare APIは所有loopbackで実行する。runtime dry-runはbundle構成の確認でありWorkflow dispatchの実行試験ではない。Workflow付きMiniflareはbinding RPC取得時に停止したためno-proof dispatchのend-to-endは未検証。

# 2026-09-30 親job共通予算予約とWorkflow preflightの更新

D1 migration `0025_a2a_shared_budget_reservations.sql`を追加。parent job単位のcurrency／budget capと子delegationごとの予約を保持し、承認条件digestへ親capも含める。承認時はD1 batch内で子上限を予約し、triggerが同時予約による上限超過を拒否する。承認前cancel、期限切れ、`PREFLIGHT_FAILED_BEFORE_SEND`は予約を解放し、remote send marker後のindeterminate／remote taskは利用量receiptが照合されるまで予約を保持する。これは内部A2A上限の排他で、Wallet残高の実予約、Provider utilization receipt、settlementとは区別する。

`tests/a2a-delegation-store.test.mjs`へ同時承認・親cap超過・owner分離・pre-send解放・indeterminate保持の5 assertion群を追加。D1 triggerのmetadataが複数rowを数える場合に正常状態遷移を失敗扱いしたため、guarded update／reservation insertの成功条件を「少なくとも1行が変化」に修正し、event row自体は厳密に検査する。Workflow local E2Eを新schemaに追随させ、proofなし・期限切れ・失効鍵の全3ケースで予約を保持したままpreflight拒否、`remote_send_claimed=0`、Agent Card discovery未到達、予約解放を検証した。

今回の検査: A2A関連Node tests 38/38、native Broker loopback tests 30/30、Cloudflare Wrangler local Workflow/D1 3/3、`npm run typecheck`成功、`npm run schema:check` 45 tables/25 migrations。`npm run database:status`は93 tables・production readback 0/6を記録した。migrationはsourceにありremote D1未適用。Wallet台帳との実予約・receipt settlement、production secrets/D1、端末signer/key lifecycle、Provider sandbox dispatch・利用量確認・cancel acceptance、A2A異社実装interoperabilityは未完了。旧上のWorkflow試験未検証メモはこのlocal fixture範囲では置き換える。SKY07は`in_progress`のまま。

# 2026-10-01 圏外継続の本人同意をZemaからWorkerまで固定

ZemaのA2A draftで「受付・承認後に端末が圏外／アプリ終了中もクラウドで続ける」本人選択を既定offで追加。falseのままではUIがdraft作成を止め、APIとstoreも拒否する。同意値をD1 `agent_delegations.continue_while_device_offline`へ保存し、idempotency比較とapproval digestへ含める。既存recordのmigration defaultはfalse。

`rock-a2a-broker-authorization/2`へschema/domainを上げ、Web・Pythonの署名fieldに同意値を加えた。RockstarOS Brokerとnative Wallet reservation checkはtrue以外を拒否する。Runtime Workerも署名検証の前に同意を確認し、古い／false rowはAgent Card取得やremote send claim前に`PREFLIGHT_FAILED_BEFORE_SEND`で停止する。

確認: A2A fixture 46/46、Cloudflare Wrangler/Workerd Workflow 3/3、Python Broker 33/33、Wallet/Spend 17/17、API Worker/D1 301 assertions、typecheck、schema check、design check、product lint、Runtime Worker dry-run、web buildを通過。Worker local testは有効な署名を持つoffline consent=false draftをAgent discovery／send claim前に`PREFLIGHT_FAILED_BEFORE_SEND`として拒否し、予約を解放する。Python/TypeScript固定proof vectorも一致。Provider sandbox、production D1/Secrets、実機Broker signer/owner presence、端末圏外継続の12受入シナリオは未実施。SKY07は`in_progress`を保持する。

2026-10-01 lost-response recovery: draft POST応答が失われた場合、Zemaは保持している同じparent job・idempotency keyと本文SHA-256でowner-scoped status lookupを行う。戻ったdelegationのID、message、target、budget、deadline、同意、input digestを元の依頼と一致照合し、`awaiting_approval`なら既存のauthorization digestを再表示する。結果が見つからない／一致しない時は新しいキーで再送しない。store/API・UIの実装を追加し、A2A fixture 45/45、API Worker/D1 301 assertions、typecheck、product lint、buildを確認。Providerが受付後に応答を落としたremote `messageId`照合とは別であり、契約sandboxが必要。

## メインSIM通信を使う共通クラウド設計（2026-10-07）

主担当ROCK、既存SKY19/BIZ01/BIL02。[共通設計](../sim-led-product-architecture.md#main-sim-cloud-service)にメインSIM/Wi-Fi、共通テンプレート、利用者隔離、eSIM発行adapter、利用量/請求の境界を追記。EXTERNALはprofile/LPA/Provider、JOINTはexact端末から請求までの受入、OWNERは回線設定・権限/上限・商用条件を担当。まずmainと引継ぎを同期し、既存service_only claimのfixture→同じcloud jobと予算/usage→実eSIM引渡し→実端末→Provider sandbox/請求を検証する。完成条件は設計節の8項、検証は`npm run baseline:check`、`npm run design:check`、`npm run project:check`、`npm run verify`。文書整合の成功をruntime/実eSIM/実請求へ転用しない。

## 2026-10-02 SIM-led product correction and Package dispatch acceptance

The SIM/eSIM is the distribution and service-entitlement offer; RockstarOS binaries are delivered through supported device routes, not stored on the SIM. The app/Home provides direct Sky, Zema and Agent entry points, while shared identity, durable cloud jobs, offline continuation consent, recovery and itemized usage remain the implementation base. `npm run sky:a2a:workflow:positive` now passes 12/12 Worker/D1/Workflow tests. The new positive case carries a reviewed Package binding through quote/delegation/Broker authorization/dispatch, preserves required extension declarations across Workflow serialization, and validates a completed result plus a synthetic signed usage receipt and local logical settlement. A controlled service binding stands in for the Provider; external execution, paid production billing, physical SIM/eSIM activation and exact-device RockstarOS installation remain unaccepted. Earlier entries describing the positive Package executor as absent or all positive Worker dispatch as unverified are superseded by this checkpoint only for the local fixture scope. See [SIM-led architecture](../sim-led-product-architecture.md), [A2A bridge](../sky-a2a-bridge.md), and [evidence](../evidence/sim-led-product-correction-20261002.json).

# 2026-10-01 A2A非同期task進捗・最終成果・利用量の縦断fixture

Cloudflare Workers Vitest／local D1上で、制御されたservice-binding上のA2A 1.0 test agent fixtureが`SendMessage`へ`TASK_STATE_SUBMITTED`を返し、別Workflow reconciliationで`TASK_STATE_WORKING`、次回に`TASK_STATE_COMPLETED`・成果artifact・Provider署名usage receiptを返す非同期fixtureを追加。Zema側では受付時点でremote task IDを保存し、作業中は子予算reservationを保持、terminal完了時にowner/task/agent/budgetへ束縛したusage receipt 42 centsだけを一度settle。最終成果物はowner-scoped encryptionでD1へ保管し、remote send claimは全過程で一回。Workers Vitest 4/4、A2A clientの独立Node/Python HTTP agent相互運用7/7、typecheck、Worker dry-runが成功。これはCloudflare/fixture構成上の縦断契約検証であり、実Provider sandbox、Provider task IDの実仕様、production D1/secrets、異なる実企業agent二者の契約接続ではない。Providerの結果不明後のGetTask/CancelTask・usage invoice意味論と秘密鍵運用は契約後に受入する。

2026-10-01 post-change verification: `npm run verify` passed after the asynchronous workflow fixture was added: repository-wide Node tests 530/530, release-signing checks 64/64, type/lint/build, Worker/D1 API 301 assertions, bundle/assets checks; targeted Workers Vitest 4/4 and independent Node/Python A2A interop 7/7 also pass. Product gates are still declared honestly: public targets ready 0/6, production D1 readback 0/6 and Pixel first-flash 0/4. This does not constitute a contracted provider, live cloud, funded Wallet or physical-device acceptance.


2026-10-01追加受入: 公開Sky v8（632ac3eb…）でPixel本人ログイン、サンプルCSV処理、検査合格・納品可能の表示、サーバー再読込後の同受付復元を確認。result.csv 0.09KBの既存ダウンロード確認がブラウザに出た。CSVバイト/hash、別本人隔離、削除は未受入。50円試験の入口は公開済みだが、本番キー・CSV署名secretが未登録で無効。Stripe本番有効化は本人情報確認の途中で本人作業待ち。


Stripe最新readback: 本番ダッシュボードへ到達したが支払いが一時停止。追加情報タスクはセキュリティ対策措置状況申告書で、担当者の本人確認書類タスクも残る。申告の実施者・実施済み対策は本人が確認し提出する。フォームを本人操作用に残し、未確認の対策や本人情報は代理入力していない。Sky非公開設定には本番API keyとCSV専用署名secretが未登録。実課金は未実施。


## 2026-10-02 Zema-supervised follow-up Agent draft

Added `lib/a2a-result-handoff.ts` and a Workbench action on an owner-scoped completed delegation with captured text results. Zema serializes the prior Agent identity and complete text artifacts as JSON marked untrusted; the prompt explicitly says prior output is not instruction, authorization or proof and cannot transfer permissions. Truncated artifacts or omitted non-text parts are refused. The action only prefills a new sibling-task draft, clears the prior target and quote consent, retains the same parent job's shared budget cap, and requires selecting another Agent plus a fresh Provider quote, cap and approval. It does not dispatch or re-delegate from inside the Agent; depth remains one and child count/concurrency remain bounded. Focused tests cover the composition limits and UI source contract; typecheck/lint and full `npm run verify` pass locally. The local two-Agent Worker/D1 composition is now covered in the following section; it does not turn this user-mediated draft into an autonomous parent controller or prove external Provider interoperability.

## 2026-10-02 Two-Agent Cloudflare Worker/D1 handoff fixture

Extended the controlled Agent endpoint fixture with a second origin and separately versioned Agent Card. The positive Workflow test runs two separately approved sibling delegations under the same owner/parent/currency cap. It captures the first signed completion artifact encrypted in D1, reads it through the test, builds the same untrusted-result prompt used by Zema, and sends that as the second delegation to the other origin. The first child settles 31 cents and the second 29 cents; while the second is held the parent has 60 reserved + 31 settled against a 100-cent cap, and after completion it has 0 reserved + 60 settled. Restarting each completed durable Workflow returns `not_dispatchable`, with exactly one remote send claim per child.

Verification: `npm run sky:a2a:workflow:positive` 13/13, `npm run typecheck`, `npm run lint:product`, and `node --test tests/a2a-result-handoff.test.mjs` 3/3. This establishes the local Cloudflare Worker/D1 composition across two separately addressed fixture Agents; the endpoints and receipts are synthetic. The second task remains separately approved, so this is not an autonomous parent controller. Commercial Provider interoperability, production D1/secrets/invoices, funded Wallet settlement, and device acceptance remain open. Evidence: [two-Agent Cloudflare workflow fixture](../evidence/a2a-two-agent-cloud-workflow-local-20261002.json).

## 2026-10-02 Zema parent progress and budget controller snapshot

Added `lib/a2a-parent-controller.ts` and extended the existing owner/job-scoped delegation list API to return a derived controller snapshot. Zema Home now shows parent-state, per-child approval/dispatch/run/reconciliation/result counts, remaining parent budget, and the next safe user action; it refreshes through the existing progress poll. The snapshot is read-only and derived from current delegation, budget, and reservation records. It does not persist a separate parent state machine, automatically submit or sequence children, grant approvals, or treat local usage records as invoices. Every paid child still needs an explicit fresh approval.

Local checks: `node --test tests/a2a-parent-controller.test.mjs` 9/9; `npm run typecheck`; `npm run lint:product`; rebuilt app plus `npm run test:api` 1021 assertions and CSV 113 assertions. Evidence: [parent controller local fixture](../evidence/a2a-parent-controller-local-20261002.json). Production Provider execution/receipts/invoices, durable autonomous parent orchestration, production data deployment, and device acceptance remain open.

## 2026-10-02 Scheduled A2A deadline enforcement

Closed a deadline gap in the one-minute scheduled Worker sweep. `expireOverdueBeforeDispatch` now transitions overdue approval, prepared, and pre-send dispatch records to `expired`; the existing D1 trigger releases a held child reservation exactly once. Overdue remote tasks, including an in-flight `dispatch_submitting` with an uncertain task receipt, move to `cancel_requested` and enter the existing reconciliation/cancel path. The UI and parent snapshot distinguish expired work. A cancellation request remains unconfirmed until the remote Agent reports a terminal result; a possibly accepted task never releases its budget hold just because its deadline passed.

Local store tests verify expiry/idempotency, budget release, overdue task selection, and reservation retention for remote cancellation. This proves local store logic and Worker schedule wiring only. Actual Provider clock/deadline guarantees, cancellation semantics, incurred usage after cancellation, production scheduler operation, and contract sandbox acceptance remain open.

2026-10-02 A2A runtime recheck: the Worker/D1 positive suite passes 13/13; Node/Python A2A client interoperability tests pass 10/10; canonical authorization, reservation, and quote vectors pass 12/12. Wrangler process-restart test now claims only that prepared D1 rows survive two local process boots and that remote-send claims remain zero. It does not verify scheduled dispatch/recovery; a previous progress entry overstated that harness. See [runtime recheck evidence](../evidence/a2a-runtime-recheck-20261002.json). Production scheduler, external Provider, invoice/funded settlement, carrier activation, and exact-device acceptance remain unverified.

## 2026-10-02 Persisted reviewed-result successor link

Added `predecessor_delegation_id` to A2A child rows and a D1 uniqueness/consistency guard. When Zema prepares a follow-up from a complete, captured result, it carries the source delegation ID into the successor draft. API and database both require the predecessor to belong to the same owner and parent job, be `remote_completed`, and have captured artifacts. A reviewed result can have only one direct successor, and the stored link is returned in the parent child list after reload. Lost-response recovery also binds the predecessor ID, so it cannot accept an otherwise matching child with different provenance.

This persists a user-mediated linear chain while retaining a fresh quote, child cap, explicit approval, and normal independent dispatch for every successor. It does not make an Agent invoke another Agent or autonomously execute a plan. Local checks: A2A store/result-handoff/recovery tests 28/28; typecheck and product lint; schema and database checks; rebuilt Worker API 1024 assertions and CSV 113 assertions. Evidence: [persisted handoff edge fixture](../evidence/a2a-persisted-handoff-link-local-20261002.json). Migration `0057` has no production D1 readback; commercial Provider handoff, billing, and device acceptance remain open.

### 2026-10-02 Enforce the redelegation depth limit

`A2A_MAX_REDELEGATION_DEPTH` was declared as one but was not enforced. Successor creation now computes lineage depth in the owner-scoped store, the API rejects a second follow-up, and migration `0057`'s D1 insert trigger refuses a predecessor that already has a predecessor. One user-approved follow-up remains allowed; another agent in that follow-up chain must start a new independent parent job. The per-parent fan-out limit and four-active-task limit still apply independently.

For an uncertain cloud task, query the same owner/parent, idempotency key, and exact input hash. Do not submit a replacement while acceptance is unknown. If a remote task ID exists, reconcile that task; treat a cancellation request as pending until the provider reports a terminal cancellation. Keep its shared-budget reservation held while execution or cancellation is uncertain. Require a terminal state and encrypted artifact capture before showing a result as ready or allowing the one follow-up. Further work after that follow-up starts in a separate independent job. These are local source-backed controls; production Provider deadline, cancel, usage receipt, and invoice matching still need contract acceptance.

### Persisted Zema plan steps bind to A2A evidence

The existing `cloud-agent` WorkJob template persists an ordered brief/approval step and result-review step. A step event now stores the A2A delegation ID it refers to. The authenticated `/api/work-jobs` PATCH checks that the row belongs to the same owner and parent before accepting progress: the first step needs the persisted signed quote; the result step and final review need remote terminal completion, captured artifact rows, and a stored usage receipt. A client cannot mark a Cloud Agent plan complete with a generic success event or a random delegation ID. The receipt is a provider-usage record, not an invoice or paid-settlement proof. The independent parent controller remains read-only and continues to derive active/reconciliation state from durable D1 children/reservations.

Local verification includes a forged-progress API regression (valid-shaped but nonexistent delegation ID rejected), serialized WorkJob event coverage, and the existing successful local parent/child workflow fixtures. This still is not an autonomous LLM-authored plan: the two-step cloud-agent template is fixed and user-directed. Multi-step authoring beyond the version-1 objective editor, production Provider acceptance, and actual customer/device acceptance remain open.

### 2026-10-02 Versioned editable Zema plan v1

`WorkJob` now stores `plan.schemaVersion`, the owner-editable objective, and a fixed `approvalGates` list in its existing persisted JSON payload. The objective can be revised while the job is active and before its first step is recorded; each edit is an owner-authenticated, revision-checked event. Gate requirements are generated from the server template and are not accepted from client input: Cloud Agent work requires a signed quote, native Wallet reservation and explicit Cloud approval before paid execution, then terminal Cloud status, captured result and a stored usage receipt before result review. Editing the objective never reuses an execution approval or changes the separate Agent request text.

Legacy WorkJob payloads without a plan are read with a version-1 default, and altered/mismatched gate definitions are repaired to the server-derived requirements. Local Node/SQLite tests cover edit-before-start, edit rejection after work begins, unsupported version and client-supplied gate rejection, migration of legacy payloads, and persistence. Focused suite: `tests/workflow.test.mjs` and `tests/sim-service-entry.test.mjs`; TypeScript and product lint pass. This version only allows editing the goal; arbitrary step authoring, runtime A2A dispatch, Android acceptance and production Provider billing remain separate work.

## 大学別NFC Sky（2026-10-12、WEB06 / SKY21）

利用者の追加指示で5大学別のbrowser入口と大学別brief、一般MCP5枠・対象学生6枠を追加。主担当Web / PWA / Sites、ROCK。OS完成を必須にせず、NFCはURL入口とする。本人単位の枠管理を実装し、有料拡張の価格・cloud MCP実行・公開同一artifact・実NFC/端末の受入は別gateに残す。[目的・状態・保存・失敗/復旧・責任・合格条件](../sky-tools-complete-design.md#大学別nfc-sky2026-10-12)。

## 実Zoomの本人用接続と作業別model選定（2026-10-18 / SKY14・15・21）

2026-10-19の利用者修正: Zoom標準の翻訳字幕とVoice Translatorがあるなら自作通訳は不要。ROCKは[設定案内](../sky-tools-complete-design.md#sky-zoom-interpretation)だけを残し、開発用字幕bridge・音声認識・翻訳runtime・手動字幕URL送信を撤去する。EXTERNALはZoomの対応言語/利用権/会議設定、JOINTは二人の実会議で相手側の字幕/音声受信、OWNERは会議と対象言語の選択を担当する。`npm run typecheck`、`npm run design:check`、`npm run verify`を実行し、Zoomの実受信をhost試験と分離する。

ROCKはmacOS private readerとSkyの作業別ローカルmodel比較を実装。本人がZoom windowを選び、読取範囲とAddを確認し、選定したモデルで実行・共通jobの成果確認・停止・回収を行う。EXTERNALはOS/Zoom/OllamaのAX/推論提供、JOINTは実会議・版別の読取品質、OWNERはOS権限・素材利用・model/licenseの選択。GPT/Cloud必須ではない。一般公開保留。[11項目の詳細契約](../sky-tools-complete-design.md#sky-zoom-local-runtime)。再現: `node --experimental-strip-types --test tests/sky-model-selector.test.mjs tests/sky-zoom-local-runtime.test.mjs`、Swift型検査、localhost本人画面、`npm run verify`。fixture/実モデル/実Zoomの証拠を分ける。

Zoom先行版の追加決定: 本人了承のsuite v2は「要約LLM＋明示見出し抽出コード」を同じ合成3問で評価する。MacはCPU/推定RAM25%/候補cache解放。研究チャット「RockstarOSを再設計」（01a14d54-daee-7c30-87a8-faea84641a40）は独立調査が進行中で、研究仮説をruntime合格や独自性の証明に転用しない。作者の任意機能の受け皿は共通Sky契約を使い、現在の対応範囲はZoom表示文章のメモ整理に限定する。

本人一人のZoom7.1.9実会議chat→確認済job→本人保存HTML→Skyタブ/サーバー終了後のChrome読戻しを受入。新AX形式と目的文echoを修正。持出しの最初の表示は普通の言葉の決定/担当/未定事項とし、処理記録は詳細へ折り畳む。合格は送信済みchatの限定試験で、音声字幕/複数参加者/許可失効へ転用しない。既存`docs/evidence/sky-zoom-local-runtime.json`に同一file/source hashと試験を記録。

SKY21/O5・ROCK: Pixel native Sky入口の実装と実機検証は[共通設計](../sky-tools-complete-design.md#sky-private-linux-deployment)、[証拠](../evidence/sky-pixel-linux-entry.json)へ記録する。起動は公開Launcherと固定guest unit、仕事は共通workflow、保存は本人選択URI。一般公開保留。

## マイエージェントとLLM設定（SKY12・SKY14・SKY21 / ROCK）

管理入口は`/sky/agents`。本人の新指示により用途例→役割→LLM→確認の作成導線を追加し、接続済みTool担当は既存接続とIDを使う。新規自分用担当にTool権限を自動付与しない。本人別設定/版競合、追加済みToolとの整合、EveへのID/版参照、LLM APIの再束縛をROCKが担当する。Tool内部LLMと会話/依頼整理を区別する。[11項目の詳細](../sky-tools-complete-design.md#sky-agent-library)と[証拠](../evidence/sky-agent-library.json)を参照。検証は`node --experimental-strip-types --test tests/sky-agent-library.test.mjs tests/zema-chat-session.test.mjs`、`npm run schema:check`、`npm run design:check`、`npm run verify`。実UI・Pixel・Provider・本番の合格をhost結果から推論しない。

同じSKY12/14/21でWallet/MarketのSky任意追加を実装し、本人別D1設定・Home/共通ナビ・直URLの追加入口を確認した。ニュース配信元plugin→Home timelineと[Eve News 1.0](../llm-evaluation-architecture.md#eve-news-1-0)は原文/根拠/主張/訂正を分ける設計段階で、学習済みmodelと記事掲載runnerは未実装。XのPixel account viewerは本人確認済みだがWeb内投稿表示、X API/OAuth、ニュース記事化の合格とは分ける。詳細/残課題は[任意機能](../sky-tools-complete-design.md#sky-optional-features)、[ニュース](../sky-tools-complete-design.md#news-source-plugins)。

## 統合Sky情報マーケット（SKY12・SKY14・SKY21 / ROCK、2026-10-20）

本人がHomeとSkyの統合、HF公開カタログ中心、検索/Add無料、X source pluginを明示。主担当ROCK、EXTERNALはHF/X、JOINTは同じartifactの実配信/対応runtime応答、OWNERはsource/外部条件/有料実行承認。[詳細11項目](../sky-tools-complete-design.md#sky-information-market)と[証拠](../evidence/unified-sky-information-market.json)を正本にする。local実browserでHF検索→reference/sha追加→Eve draft、導入済みOllamaの担当保存→Eve実応答を確認。Xは本人Add済み、公式iframe429で投稿未受入。元のSKY21完了gateを進めない。検証は `node --experimental-strip-types --test tests/sky-hub.test.mjs tests/database-status.test.mjs tests/migration-union.test.mjs`、`npm run design:check`、`npm run verify`。次は公式Xの制限解除後の本文確認、各HFモデル/Spaceの既存runtimeへの個別導入、公開/Pixel/providerは別受入。発見と暮らしの成果をつなぐ価値を設計基準にする。

## Xの本人アカウント表示（SKY12/14/21、2026-10-20）

主担当ROCK。公式widget lifecycleと失敗/待機を修正したが、公開syndicationの429は解消未確認。本人の希望を優先し、Web Homeには公式Xアカウント入口、Pixelには独立session/UIDの専用viewerを追加。本人がログイン後の実投稿を目視確認した。Web内混在feed/OS Shell統合/full imageは未受入。API adapterは初期OFFで、契約や有料取得を行っていない。[11項目の契約とbuild方法](../sky-tools-complete-design.md#x-account-view)、[証拠](../evidence/x-account-integration.json)。fixtureは `node --experimental-strip-types --test tests/sky-hub.test.mjs tests/sky-x-feed.test.mjs tests/sky-x-session.test.mjs`。公開/実課金/本番OSのgateは進めない。
## Harness²を参照したAgent改善基盤（SKY14/15/21・AI07/08・OS10 / ROCK）

[開発実行プロンプト](../prompts/sky-harness2-development.md)を入口とする。既存Sky Agent一件の公開/合成資料仕事で、版付きinstructionとTool guidanceの候補を隔離probeし、同条件の成果・費用・停止/復旧を比較する。ROCKは候補/隔離/証拠/版とBroker接続、EXTERNALは研究/Provider仕様、JOINTは隔離環境とProvider/端末別受入、OWNERは本人データ・費用上限・採用/公開を担当。最初は文書保存のみ。実装時はH2-01〜05を順に進め、本人の明示採用とSky審査を通す。上流のsandbox無効・network無制限のexecutorは本番環境へ直接持ち込まない。集中試験、`npm run design:check`、`npm run baseline:check`、`npm run verify`で検証し、実品質改善/Provider/Pixel/本番を別証拠で判定する。

## Eve実行SIの全体開発プロンプト（2026-10-22）

主担当ROCK、AI02/AI05/SKY14/SKY21とWEB04/OS10/BIL02連携。[詳細開発プロンプト](../prompts/eve-execution-si-development.md)を既存設計への実装手順として使用する。目的・計画・実Tool・独立検収・修正・保存再開・停止を最初の縦断にし、使用量表示だけで完成にしない。本文SI00〜08とT01〜12、既存workflow/合成/A2A/runtime試験およびnpm run verifyを合格入口にする。文書保存はruntime受入ではない。

実行SI先行実装の[SI01証拠](../evidence/eve-execution-si.json)：localhost実Tool/API/UI、保存/再読込/完了/停止を受入。全体Goalは継続、SI02のLLM候補検証へ進む。公開/実機/有料Providerの証拠ではない。

Eve実行SIのSI02実ローカルモデル/候補検証、SI03失敗保存/同一成果の冗長結合だけを除く限定修正は[証拠](../evidence/eve-execution-si.json)へ分離記録。最新full verify/API1773/CSV113はhost/Worker fixture。CUA接続断で新UI未受入。全体Goalを維持しSI04以降へ進む。

### SI05/T07 独立プロセスのA2A通信試験

既存client/delegation store/Eve親制御に、Rock実装をimportしない別NodeプロセスのAgentを接続する。合成owner・一時鍵・0 USDでSendMessage/GetTask/CancelTask、成果暗号化、署名と仕事相関、古いrevision拒否、結果不明時の再送防止、停止照合を確認する。論理HTTPS originを試験transportでloopbackへ写すため、本番TLS・公開Provider・物理Broker・production Workflow・本人UIの受入には転用しない。実行は `node --experimental-strip-types --test tests/eve-a2a-process-integration.test.mjs`。証拠は [SI05独立プロセス](../evidence/eve-execution-si.json)、次はproduction Workflowと同一会話/成果/明細の現行UIへ接続する。

SI05/T07 Workflow接続: `npm run sky:a2a:workflow:positive` は15/15合格。既存workerd Workflow/D1が別Node Agentへ送信し、暗号化成果と署名receiptを保存、0 USD予約を照合。test service bindingのみloopbackへ写像し、本番egress/credential policyは変更しない。型/lint合格。証拠SI05_workflowProcessAgent、canonical Eve UI・異常/停止の同process縦断・本番接続は未完。

SI05/T05-T07独立Agent異常/停止: Workflow suite19/19合格。実応答喪失/過大応答はWorkflow再起動でもindeterminate/保持予約/送信1回。誤job/偽署名receiptは拒否し予約保持。Eve停止から独立AgentへCancelTaskを送り、確定時のみ親停止、working応答ではcancel_unconfirmed/親active/予約保持。繰返しreconcileでも送信/cancel各1回をAgent別カウンタで確認。test transport loopbackの受入で、本番TLS/Provider/実機/UI発行/請求とは別。証拠SI05_workflowProcessFailures。

SI05/T06-T08承認待ち再開: 新tableを作らず既存A2A入力保管を暗号化draftへ再利用。GET review=1だけ本文を復号照合し、親/子revision・停止/削除を最終DBで再確認。古い本文未保存は明示し勝手に再生成しない。local built UIで同DB実再起動後の同一本文/digest、候補restore、予約/送信0を確認。集中29/29・Workflow19/19・full verify exit0（Node1297中1296pass/1skip、API1992/CSV113）。証拠SI05_pendingReviewResume。次は同candidate UI→実Workflow配送→成果を接続し、物理/Provider/公開は別gate。

SI05同環境E2E受入: Web/既存Workflowが同DB、独立Node Agentが自前鍵でquote/receiptを署名。画面の依頼/確認/予約から既存Workflow binding（local fixture trigger）で配送し、同jobの成果/明細確認/親完了/会話/reloadへ到達。普通の本文にIDを埋めず、A2A 1.0 metadataのRock固有usage contextを明示設定/宣言時だけ渡す。client18/18・Workflow20/20・full exit0（Node1301中1300pass/1skip、API1992/CSV113）。実Provider/実機/公開/cronは別gate、metadataのnative開示/対応版確認前に有効化しない。証拠SI05_sameEnvironmentAgentE2e。次は一般検収/修正と同UIの実行中停止。

Eve実行中Agent停止の追加証拠（AI02/AI05/SKY14/SKY21、ROCK）: 通常WorkJobの取消経路も設定済み成果復号鍵を既存会話投影へ渡し、停止時に完了済みsiblingの成果抜粋を保持する。鍵不足でも停止を妨げない。同環境built Web/Workflow/独立AgentのUIでworking→停止確認待ち→取消応答/署名usage→会話sync/reloadを確認し、送信/取消各1回・予約settled。合成Broker/loopback/ローカルWorkflow起動に限定し、取消未確認UI・実Provider・実機・公開は別gate。[証拠](../evidence/eve-execution-si.json#SI05_workingStopUi)。

Eve停止未確認と保存条件の再開（AI02/AI05/SKY14/SKY21、ROCK）: 独立合成Agent/既存WorkflowとUIで取消未確認・予約held・使用額未確定を再読込まで確認。予約後に消える一時reviewへの依存を外し、保存済みの同じ親子quote条件で第一手順を記録できるよう修正。UI send0・serverの本人/親/署名quote検証維持、full verify exit0（1300pass/1skip、API1995/CSV113）。[証拠](../evidence/eve-execution-si.json#SI05_briefResumeUi)。次はSI03実UIと一般Agent独立検収/限定修正。公開/実機/Provider契約/送金は別gate。

Eve限定修正UIの追加受入（AI02/AI05/SKY14/SKY21、ROCK）: 合成planner→実引用Tool/重複結合失敗→reload→既存成果と条件/予算を保持した1回修正→検査/完了を実UIで確認。必須語不足は拒否し、不足条件を既存artifact checksから画面/暗号化会話へ表示するsource修正を追加。集中3/3、全体1301pass/1skip・API1995/CSV113。新build+同DB Worker再起動でも未達条件/停止/保存を確認。[証拠](../evidence/eve-execution-si.json#SI03_repairUi)。一般Agent検収/修正と意味品質・選定・SI06〜08、公開/実機/Providerは未完了。

Agent固定成果条件の限定受入（AI02/AI05/SKY14/SKY21・ROCK）: 作成時固定criteria→実Agent成果のserver復号/hash/完全性/文字数/必須語→既存成果記録/完了CAS→同会話reloadを実UIで確認。API異常系はremote_completedでも条件未達を拒否し、原job保持/停止。集中18/18、full1308pass/1skip・API2000/CSV113。省略/欠落や追加artifactを成功にしない。真偽/一般意味品質、同親の修正/supersession/成果nodeごとの条件、Provider/実機/公開は未完了。[証拠](../evidence/eve-execution-si.json#SI03_agentResultCriteria)。


## Eve：同一仕事のAgent限定修正をローカルUI受入（2026-10-22 / AI02・AI05・SKY14・SKY21 / ROCK）

[証拠](../evidence/eve-execution-si.json#SI03_sameParentAgentRepair)。完全な保存本文の文字数/必須文言未達を固定条件のまま修正。元成果・receipt・料金を保持し、別の見積/合成Broker/原子予約→既存Workflow→独立Agentの署名receipt→修正成果の独立検査→本人UI確認/完了→同じ会話/仕事を再読込。各message送信1回（合計2）、元依頼の再送0。準備だけで新規child/送信なし。元依頼/first briefはAPI seed、修正以降は実UI、Workflow起動はローカルcontroller。fixtureが修正prefixでREADYを返すため意味品質やLLM修正能力の証拠ではない。集中28/28、全体verify exit0（Node1320/1319pass/1skip、API2000、CSV113、assets212missing0）。先行全体は既存PC adapter回収検査で失敗、単独/全体再試験合格、原因未確定を保持。修正1回/一段/8KB/親8件上限。一般修正、Provider/実機/本番/精算、全SI goalは未完了。共通デザインは本ちゃん担当と共有し独自配色変更なし。次は修正途中の応答喪失・再読込で保存済みIDを再利用する実UIと、SI06原始usage/精算への接続を進める。


## Eve：Agent修正途中の再開・停止を実UI受入（2026-10-22 / AI02・AI05・SKY14・SKY21 / ROCK）

[証拠](../evidence/eve-execution-si.json#SI04_agentRepairResume)。修正準備保存→tab閉鎖→新tabの同一job/threadで再開、修正ID/本文/固定条件/revision不変・送信追加0。新見積から保存した承認待ちchildもtab再訪後は既存暗号化reviewへ戻り、新child増加0。本人UI中止で修正cancelled_before_dispatch、停止確認・再読込、元の未達成果/usage保持。独立fixture Agentへの元message送信1・cancel0、修正は未送信。root/first briefはAPI seed、修正以降は実UI。worker/host再起動・実Provider/端末/本番の証拠へ繰上げない。前回UI候補から対象runtime hash変更なし。全体verifyは/private/tmp/eve-agent-repair-resume-full.logで進行中。全SI goalは未完了。


## Eve SI06：利用元追跡の検証結果（2026-10-22 / SKY21・BIL02 / ROCK）

[証拠](../evidence/eve-execution-si.json#SI06_agentUsageProvenance)。集中16/16、最終type/lint exit0、全体verify exit0（Node1326/1325pass/1skip、API2000、CSV113、assets212missing0）。実Workflow/独立Agent署名receiptをAPIで保存し、実UIの会話反映→再読込で元receipt参照/hash・契約未登録/nullを確認。追加送信0、元usage不変。Package一致作者表示/改変/失効/壊れたbindingはSQLite合成既検証rowの投影試験のみ。登録作者の現registry投影であり、作者報酬契約版の永続結合・請求/入金/返金/配分/送金は未実装。新金融台帳なし。次は既存契約にsource linkageを追加し、同じreceiptの一度だけ結合と契約/通貨/価格版/owner照合を進める。全SI goal継続、未commit/未公開/実機未受入。


## Eve SI06：利用元初回固定の実UI受入（2026-10-22 / SKY21・BIL02 / ROCK）

[証拠](../evidence/eve-execution-si.json#SI06_usageSourceCapture)。集中25/25、独立Agent＋投影12/12（投影8件は重複）、全体verify exit0（Node1330/1329pass/1skip、API2000、CSV113、assets212missing0）。実Workflow/独立Agent署名receipt→本人UI syncでusageSources1件/revision3を保存→再sync/再読込で同一内容/revision、元usage不変・追加送信0。作者変更/失効/同時保存はSQLite合成試験、実UI正例はPackage未登録Agent。初回全体の古いrevision停止409は試験へ明示し、最新版読戻しで独立Agent停止合格。作者報酬の契約は未成立、金額nullを保持。次は契約版・作者/運営の明示同意証拠の登録と、固定sourceとの一度だけの結合を実装する。配賦/送金/公開/実機/全SIの完了ではない。


## Eve SI06：契約署名/source結合の検証（2026-10-22 / SKY21・BIL02 / ROCK）

[証拠](../evidence/eve-execution-si.json#SI06_authorUsageAgreement)。集中30/30、全体再実行exit0（Node1336/1335pass/1skip、API2014、CSV113、assets212missing0）。初回は外側routerのCSP nullで失敗、当方変更なし・現在sourceのwrapper/単独再試験合格を確認して再実行。合成の二つの実Ed25519鍵/既検証source rowで署名・原子保存・再通知・失効・historyを検証、HTTPは偽同意/認証/Origin/owner/未固定sourceの拒否。実作者同意/正例HTTP/UI/条件本文登録・hash対応/契約単位失効/共通版台帳/請求入金配分は未受入。公開鍵設定は本番へ追加していない。generic停止への任意公開鍵設定引継ぎの最終差分はfull build開始後のtype/lint合格まで、configured-key HTTP受入を主張しない。金額null、送金なし。次は契約本文・不変な版登録と明示同意画面を作り、署名/sourceの正例をHTTP/UIで通す。全SI goal継続、未commit/未公開。


## Eve SI06：契約本文HTTP/読取UIの受入（2026-10-22 / SKY21・BIL02 / ROCK）

[証拠](../evidence/eve-execution-si.json#SI06_authorAgreementDocuments)。集中33/33、移行/署名17/17（署名8件重複）、DB台帳/X12/12。全体verify exit0（Node1340/1339pass/1skip、API2018、CSV113、assets212missing0）。0080 SQL/journal/snapshot/schema/生成DB状況を同期し、114表/80 migrations、過去2系列とfreshをfilename/Drizzle各6経路でデータ保持確認。初期のjournal/生成状況/固定件数の不整合を修正、XテストのA-prefix no-opを必ず異なる文字へ修正（暗号実装変更なし）。実HTTPで合成の二者署名/本文を登録→同版再通知不変→結合前にEveで本文表示→API結合→再読込/署名照合表示→fixture内部失効→原本文保持/失効表示→別仕事は空表示・旧本文なし。scriptタグはliteral文字で表示。本文は明示terms読取時だけ返す。source Package/receiptは既検証row合成fixtureで、実Provider署名受入ではない。外部Agent送信0、実契約/本人署名/料金計算/入金/配賦/送金なし、本番鍵なし。次は本人/作者/運営の条件確認と鍵登録/署名導線、既存請求・配分へ進める。全SI goal継続、未commit/未公開/実機未受入。

## Eveの同job明細を共通画面内に表示（SI05/SI06/T12・ROCK）

[全Tool設計](../sky-tools-complete-design.md#同じeve仕事内の利用明細si05si06t12)。既存SkyPayments/WorkJob/0081記録を再利用、owner+parent jobで取得し会話sidebarを保持。集中32/32・型/lint合格、最終実UIと全verify exit0（Node1361pass/1skip、API2018/CSV113、assets212欠損0）を限定受入。公開Sourceへの適応は別gate。月次請求・公開・入金/送金を未受入のまま維持。検証はtests/sky-author-usage-agreement.test.mjs、tests/sky-usage-payment.test.mjs、実Eve開閉/再読込、npm run verify。

## 資料付きニュース草稿を同じEveへ（SI07/T10/T12・ROCK）

[全Tool契約](../sky-tools-complete-design.md#資料付きnews草稿のeve仕事接続si07t10t12)。既存news parserとWorkJob/historyを拡張、取込元草稿を非信頼のまま参照検査/人による確認待ちへ接続。真偽/政治的公平性/公開を合格にせず、投稿/原文fetch/新推論は取込APIから呼ばない。集中20/20・型/lint合格、実Worker/UI/fullは次gate。検証: eve-news-work/eve-news/eve-tool-work/workflow tests、npm run verify。既存ローカルCLI --bundleから資料付きJSONを作成できる。


## 共通Nodeホストの初回接続・別プロセス再開（CORE02 / OS10・SKY21 / ROCK）

[11項目の契約](../rockstaros-complete-design.md#runtime-host-enrollment)、[受入証拠](../evidence/rockstar-runtime-host-enrollment.json)。既存dev.5 setup/connect/run/status、device auth、encrypted vault、runtime/replica/historyを再利用。明示owner_deniedだけ再接続準備へ戻し、消費済みコード/応答不明はuncertain保持。npm symlink/macOS aliasのCLI entryを修正。合成owner・実SQLite/HTTP・repo外同一tgz・別2processでreport応答喪失→同一job/会話/成果・追加推論0を確認。Package59/59、Root最終verify exit0（Node1380pass/1skip、API2029/CSV113、assets212欠損0）。一般CLI/source unitは`npm --prefix packages/rockstaros-runtime test`、実Worker APIは`npm run verify`。公開Sourceのbinding適応、本人Mac grant/同じEve会話、Pixel共通ABI/解除後実同期、hard isolation/常駐/生体vault/本番請求は未受入。承認待ちasset Source候補は変更せず、配備/実grant/実推論0。全体Goalは維持。

News草稿接続の限定受入: docs/evidence/eve-execution-si.json SI07_newsWorkIntegration。集中20/20、実Worker9 assertion groups、実UIでlocal Qwen草稿の参照検査失敗保持・同D1再起動/同job/thread復元・会話反映・停止。Root全verify exit0: Node1397中1396pass/1skip、API2029/CSV113、assets212欠損0。生成使用量未報告、真偽/政治的公平性未検証、未掲載。次は同jobの限定修正履歴・再検査、取得/生成usage、意味/対照評価、timelineと同意dataset。全Goal/公開/実請求/実機News未完。

News同一仕事の修正（SI03/SI07、ROCK）: `eveNewsWorkStore.command(revise)`→中央workflow reducer→既存CAS→暗号化履歴を使う。元packet/初回hash/旧draft+auditを保持し、本人修正2回上限。集中 `node --experimental-strip-types --test tests/eve-news-work.test.mjs tests/eve-news.test.mjs tests/eve-tool-work.test.mjs tests/workflow.test.mjs` は21/21。型/lint成功（初回はevent noteの型違反を修正）。現在は実Worker/UI/full検証待ち。本人編集は自動モデル修正の受入ではない。

News本人修正の最終限定受入: docs/evidence/eve-execution-si.json SI03_SI07_newsDraftRevision。集中21/21、実Worker/D1と最終UI/同byte再起動で同job/thread/旧版・失敗audit保持。Root最終verify exit0: Node1398中1397pass/1skip、API2029/CSV113、assets212欠損0。修正版はowner-edited、未掲載・人確認待ち。自動モデル修正は未実装、JSON編集UIは暫定。次は通常入力へ改善、既存実行/usageで限定自動修正、semantic/political/timeline/learningと全Goalを継続。

Newsローカルモデル修正の限定受入: docs/evidence/eve-execution-si.json SI03_SI07_newsLocalModelRepair。集中19/19、全verify exit0（Node1403中1402pass/1skip、API2029/CSV113、assets212欠損0）。実HTTP fixture/Worker/D1/UIで1呼出・原稿保持・再検査・usage・true in-flight stop/late withheld・同byte再起動を確認。実Qwen1回は944入力/176出力、schema不合格で旧稿保持。モデル品質・意味/政治・公開/実請求/全Goalは未受入。再現: `node --experimental-strip-types scripts/check-eve-news-local-repair.mjs <installed-model> /private/tmp/proof.json`（1回のみ、架空資料、downloadなし）。次は拒否原因診断と通常入力、適格model選定、semantic/political/timeline/learning。

News構造化本文node修正の限定受入: docs/evidence/eve-execution-si.json SI03_SI07_newsStructuredRepair。集中31/31、全verify exit0（Node1408中1407pass/1skip、API2059/CSV113、assets212欠損0）。最終実Worker/D1/実UIから実Qwen1回、986入力/54出力/cache116subset、同job/thread/旧draft/失敗audit/初回hash/ledger/未解決保持、同command再送と同byte再起動で追加推論0。全schema実試験20秒unknown/500cancelidleも保持。受信検査は緩和なし。ledger外statement記述と旧prefixがあり、真偽/網羅/政治/掲載品質は未受入。次は主張網羅・資料整合/通常editor/適格model選定・全Goal。集中コマンドは上記証拠nextCommand、実モデルCLIは既存check-eve-news-local-repair。

News逐語coverage/通常editor限定受入: docs/evidence/eve-execution-si.json SI03_SI07_newsLiteralCoverage。集中20/20、最終全verify exit0（Node1412中1411pass/1skip、API2059/CSV113、assets212欠損0）。実Qwen既存草稿の未対応3文を新検査で保留、本人UI編集→3文文字対応、同job/thread/初回hash/元2稿/失敗audit/usage維持、同byte Worker/D1再起動・追加推論0。旧audit未検査表示、unit/metadata上限、否定/数値/Unicode、未確認/unknown既定を検証。文字一致は意味支持/真偽/政治/見出しの合格ではない。次は意味抽出/資料整合/対照評価・選定・取得/timeline/同意学習と全Goal。検証コマンドは証拠nextCommand。

### Eve News資料照合モデル提案の限定受入

AI02/AI05/SKY14/SKY21・ROCK。同一仕事の提案保存・本人訂正・旧稿scope・同byte Worker/D1再起動を制御HTTP fixtureで確認。集中44/44、Root全verify成功。実Qwenの意味品質は誤判定/最終回答未成立で不合格。真偽/政治公平性/公開/全SIは未完。[証拠](../evidence/eve-execution-si.json#SI03_SI07_newsClaimEvidenceReview)。次は実モデルの既存仕事への照合UIと用途適格性評価。

Eve News実Qwen jobの同byte再起動・同command再提示でrevision10全状態一致、追加推論0を確認。formを既存縦配置へ揃えbrowser読戻し、Root全verify再成功（Node1426pass/1skip、API2059/CSV113）。意味品質不合格・公開保留は継続。

### News照合の用途別評価（SI07/T09/T10）

既存ローカル評価scriptの`--suite`で架空8ケースを実測。Qwen2.5:1.5bは2/8、未採用。政治ラベル入替の同一誤答を中立性の証明にしない。期待assessmentだけでなく必要な出典/関係も照合し、draft/audit/status/usageを保持。[証拠](../evidence/eve-execution-si.json#SI07_newsEvidenceModelSuite)。次は担当選択UIへの根拠表示と評価範囲拡張。

### Eve Newsの用途別モデル評価表示

SI07/T09/T10/T12・ROCK。既存capabilitiesの測定記録をreaderで名前/digest/suite/日時/8caseに照合し、formへ適用可否/2of8未採用/評価範囲を表示。未測定/別版/古い評価へ成績を移さず、架空case全件一致でも自動reviewerAccepted=false。送信/権限契約は既存のまま。集中5/5、実UIと全verifyは受入中。

Newsモデル評価表示は最終browserで該当2/8・別digest・suite記録なしを受入。同job全状態維持/追加推論0。最終全verify成功（Node1431pass/1skip、API2059/CSV113）。証拠SI07_newsReviewAdvice。モデル品質/政治公平性/公開と全Goalは未完。

### News出典リンクから本人資料メモの限定受入

SI07/T10/T12・ROCK。制御feed→実browser→保存同意→既存News job→参照検査→同artifact再起動を確認。検出/公開不明/転記日時と原文hashを保持、未分解2文はactiveのまま、実モデル0。旧本人job保持。集中17/17、最終全verify成功（Node1441pass/1skip、API2061/CSV113、assets213欠損0）。共有runtime移行の期待件数と旧presence保持のAPI試験を現行契約へ合わせた。実記事取得・掲載・学習利用・全SIは未完。[証拠](../evidence/eve-execution-si.json#SI07_newsSourceNote)。

### 同一News仕事の追加資料/訂正と旧提案scopeの限定受入

SI03/SI07/T02/T06/T08/T10/T12・ROCK。制御HTTP/実browserで追加前の提案→訂正資料保存→再検査/旧packet/draft/audit保持→過去資料への提案表示→同artifact再起動。新規fixtureの出典ID誤りは拒否し、その失敗usageも保持。source append/replay/元create再送は既存jobを巻き戻さない。集中18/18、全verify成功（Node1444pass/1skip、API2061/CSV113、assets213欠損0）。[証拠](../evidence/eve-execution-si.json#SI03_SI07_newsSourceAddition)。実意味品質/実取得/掲載/学習/全SIは未完。

### 訂正を本人の本文/台帳へ反映する限定受入

同じNews仕事の実editorで元記録/訂正を帰属付き2主張へ分解、両方disputedのまま保存/再検査。revision9/review・5形式検査成功・未対応0でも対立warning/真偽未検証/未掲載を保持。旧稿/旧source/audit/usage保持とreplay/同artifact再起動/UI読戻しを確認、モデル0。集中19/19、full成功（Node1445pass/1skip、API2061/CSV113）。[証拠](../evidence/eve-execution-si.json#SI03_SI07_newsCorrectionEditor)。実意味品質/実取得/公開/学習/全SIは未完。

### v112 SourceのNews統合候補と本人同意・撤回の受入

SI07/SI08・SKY14/SKY21/WEB04・ROCK。本人のSource取得/照合許可に基づき公式open-only helperで最新160ff13dを取得しclean保持。News49ファイルpatchはapply --check成功、Home/認証/料金等8対象は同byte。候補のbuild/type/lint成功。合成本人資料2仕事の個別同意前拒否、同意後1記録/重複1/全参照2、APIと実Eve UIの同じSHA、両同意撤回後拒否、同一build/D1再起動後の全仕事一致を受入。モデル/訓練/実課金0。Root fullは1478中1477pass/1skip、API2061/CSV113/assets212missing0、Source fullは別途実行中で以前の2失敗を合格へ換算しない。外部保存/新配備・公開same-owner受入と全SIは未完。[証拠](../evidence/eve-execution-si.json#SI07_SI08_newsPublicSourceIntegration)。

News v112候補の追記：Source full exit0（主要2483/2482pass/1skip、API1530/CSV385/assets214missing0）。Mini依存関係不足を元Source同lockの依存関係で補い全再試験。49ファイルpatchは不変。外部保存/公開・公開same-owner・全SIは未完。

### Source別候補のEve→Tool実行

SI01/02/04・T01/06/08/09/12・ROCK。News49ファイルを固定した別候補でSourceのrecipe/auth等を保持し、Tool/計画/保存を適応。集中25/25、型/build成功、制御モデル1回→本人採用→実引用Tool/URL独立検査→同会話成果/usage→同byte Worker/ブラウザ再起動で全job2件一致。実モデル0/課金0、全体Source gate/公開未受入。[証拠](../evidence/eve-execution-si.json#SI01_SI04_sourceToolIntegration)。

Source Tool一覧修正後のfullはRoot1485/1484pass/1skipとSource2509/2508pass/1skipでexit0。最終buildで実Qwen2.5候補は不合格、usage381/234を保持してTool未実行/停止。再起動後完成2+停止1の全job一致・旧試行409・実モデル呼出合計1。実モデル計画成功とはしない。次は構造化出力の指示と同じ固定検査で改善を測定。

公開v113/Source1f4d3904を公式metadata/取得で照合。別候補へ上流13変更を3-way統合、37/37と型検査成功。Pixel helper等8対象同byte。v112全体/UI受入はv113へ流用せず、v113 full/UIを次gateとする。

構造化Plannerの実Source受入：[証拠](../evidence/eve-execution-si.json#SI02_structuredSourcePlanner)。20秒unknownと不要語の提案を未採用で保持し、実Tool仕様の指示/localhost40秒を追加。Qwen2.5の新合成jobが1試行9.1秒→元条件の採用→実Tool/URL検査→同会話完了/usage→5job全体再起動一致、旧試行409。型/集中37とbuild成功、最終fullは未完。一般能力/公開/実機/精算/全SIではない。

[Planner空応答usage](../evidence/eve-execution-si.json#SI06_plannerEmptyResponseUsage)：実Source adapter/HTTP/Worker/D1/画面で本文空でも17/8tokensを保持、候補/Toolなし・停止/旧試行409・同byte再起動後6job全体一致/追加provider0を受入。Root12/Source39集中・型/build成功、最終full未完。全Provider/請求/報酬/公開へ一般化しない。

空本文usage修正後の最終Root full1487/1486pass/1skip・Source full2514/2513pass/1skipでexit0、API2061/1530、CSV113/385、assets212/214欠損0。実モデルの限定Tool縦断/空応答使用量/同byte復旧の証拠を保持。公開Source Agent統合と実請求等は未完、未保存/未公開。

Eve Source継続: SI05_sourceWorkerProcessApiVerticalは実Worker/Workflow/独立Node Agentのloopback API縦断に合格。UI未受入、取消draftを含み親active。次はclean job親完了とworking Agent停止。full verify8成功と実課金/公開を分離。

## 個人Agent共有の追加経路（HOME01/SKY21/WEB04/OS10）

ROCKが版付きmanifest/権利preview/投稿/Add/親派生/公開停止と既存Agentへの保存を担当。EXTERNALはProvider/Tool、JOINTは実UI/同一公開候補/Pixel、OWNERは共有license/範囲/実行設定を確認する。対象コード・状態・入出力・復旧・同意・受入は[共通設計](../rockstaros-complete-design.md#smis-network-effects)と[証拠](../evidence/smis-agent-shares.json)。検証は `node --experimental-strip-types --test tests/sky-agent-shares.test.mjs`、typecheck/lint/schema、全verify、`node scripts/check-sky-agent-shares-api.mjs`。制御/合成の結果を実成長/実支払へ読み替えない。

## Noahの世界Agent調査

[公開情報の調査台帳](../evidence/noah-world-agent-research.json)（2026-11-15）は57の製品/基盤/カタログ/接続規約を分類。掲載entry、template、企業内instanceを加算せず、旧Anicca転送・Smithery停止等を記録した。AI02/AI05・ROCKの調査資料で、catalog追加・API実行・接続試験・公開の受入ではない。次は200〜300候補の重複/一次資料精査、上位20候補の成果・停止・費用の試験。調査20〜40時間＋20件試験20〜40時間は計画値で、account準備とadapter実装時間は別。

追加の[件数集計](../evidence/noah-world-agent-census.json)では公開5catalogから11,979 source別紹介URLを取得し、名称/slugの正規化で7,149groupを抽出した（2026-11-15）。AgentHunter内の同一URL40件を除外し、必須340 responseのHTTP200/hashと全件分割を検証。全件検索Canvas/JSONとGit管理外のraw snapshot/scriptを保存。42同source衝突、非Agent、別名・同名異製品の判定は残り、7,149を世界の独立Agent製品数やNoah接続数にしない。次は分類・公式URL/作者による同一性確認、上位200〜300候補の個別精査。全7149名義の精査を1件5〜10分と仮定すると約600〜1200作業時間で、従来20〜40時間は上位候補の範囲。

Hugging Face・GitHub・Xの[一次配布元調査](../evidence/noah-primary-source-discovery.json)を追加。HF search=agentの72page末尾まででSpaces52,432/Models11,606/Datasets6,718、学習template名一致31,757。GitHub topic公表144,921hitは全件取得とせず、4query計1300hit→1243repo IDをseed保存。Xの3索引leadを公式配布元へ照合、元投稿は3件403。製品数への加算なし。次はowner/正規URL/派生元による同一性、Agent本体とSDK/Tool/template/model/datasetの分類、未掲載・名称非一致・X本文の確認。世界総数やNoah接続済み数は未確定のまま。

継続する[一次資料の分類・X本文確認](../evidence/noah-agent-primary-review.json)ではGitHub213 repoとHF87 Spaceを7つの配布物区分へ整理した。Agentアプリ/runtime候補はGH39・HF21で、動作合格や世界総数ではなく相互に加算不可。HF追加10検索888 Space中630は前回検索外、固定SHAの259 textfileを確認。同講座template名の抽出20件中13件はapp.pyのみ原本と完全一致。OpenManus名でも単発phi-2 APIのSpace、computer操作が結果文字列だけのdemo、同名Graphifyの別用途、fork:falseでもREADMEで派生を宣言するDexter JPを記録した。Xは4検索23投稿の可視本文を読み、3公式/作者詳細を全文確認、10投稿の9repoを照合。過去Web403は方法別の履歴。全300配布物の分類/理由/URLを既存Canvasへ追加。残件は全体の製品同一性と権利/費用/認証/停止・Noah接続試験で、投稿やrepo件数を接続数へ昇格しない。検証はevidence.verificationと進捗noahWorldAgentResearch.deepSearchへ保存。


追加の[Agent本体の重複除去台帳](../evidence/noah-agent-registry.json)は302種類・19用途区分（2026-11-15）。GitHub228/HF12/公式Web62は1本体を主な確認元へ一度だけ配分した内訳。旧系統6件と本体に加算しない35関係、追加GH424対象の採否を別記録。9言語で一次資料を探索し、419新README本文と主要/補完repoを確認。公開実行アプリ・研究実装を含む資料上の本体判定で、全世界総数、全件稼働、OSS適合、Noah接続合格ではない。ROCKが同一性と調査台帳、EXTERNALが製品提供、JOINTが実接続/停止/費用、OWNERが契約・有料利用の個別条件を担当する。成果物はlocal保存、raw873 fileはGit管理外archiveへ退避。次は未判定候補の一次照合と、選定後の価格/権利/認証・成果/停止/費用の受入を分けて進める。
