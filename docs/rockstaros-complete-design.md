# RockstarOS 全体詳細設計

版: 1.0 / 2026-09-18
対象: RockstarOS Core、Web／PC、Linux／QEMU、Android／Pixel、Sky、Zema、Local AI、Tool、Wallet、運用、更新・復旧。

> 2026-09-24更新: rocketstar、A-LINK、avokado、colonyまで含む最新の統合設計基準は[RockstarOS 設計書完全版 v1.0](rockstaros-complete-design-v1.0.pdf)。本Markdownはrepository実装、既存component、詳細正本への入口として保持する。PDFの全文検索用[抽出テキスト](rockstaros-complete-design-v1.0.txt)と[完全性記録](../data/rockstaros-complete-design-v1.0.json)を同じ版として参照する。PDFの「完全版」は設計範囲の被覆であり、実装・実機・飛行・量産の完成宣言ではない。

2026-09-24追加保存: [rocketstar完全版 R1.0・全付録](rocketstar-design/README.md)は、44ページ・35章のロケット統合設計と、A-LINK、OS、コロニー、端末ボタンの設計履歴をまとめる。ロケットの製造・実機・飛行受入は未完了。これらは設計資料であり、このrepositoryのOS componentやToolを追加した記録ではない。

[OS v1.0付録原本](rocketstar-design/outputs/RockstarOS_Complete_Design_v1_0/README.md)を今回受領し、既存PDFとのSHA-256一致と付録manifest 59件を確認した。7 schema、DDL、例、要求台帳、構造検査・再現記録を設計アーカイブとして保存する。当初の「付属原本未受領」は受領済みに更新するが、runtime導入や追加の実機受入は行っていない。原本のE3・別Hub前提は[現行R5](avocado-mini-r5/README.md)へ適用せず、R5 Device Profile・adapter統合は未完了のまま保持する。

この文書は「OSに何が入っているか」だけでなく、利用者の操作がどのcomponentを通り、どこへ保存され、失敗時にどう止まり、どの証拠で合格するかを一続きに説明する。各機能のfield単位・機種単位の正本はリンク先に置き、この文書を全体の読み方と依存方向の正本とする。

## 1. 一言でいうと

2026-10-01の製品方針更新: **物理SIM/eSIMを購入・有効化するとRockstarOSと統合サービスへ簡単にアクセスできる製品**を中心にする。SIMは通信とサービス利用権の提供入口であり、RockstarOSバイナリをSIM内に格納する前提ではない。正確な端末に署名済みOS導入・復旧経路が成立する場合はOS版、それ以外は既存OS上のclientまたはブラウザ版へ案内する。既存のゲーム、生活、ハードウェア設計は応用先として維持し、このSIM/eSIM主導サービス導線と競合する優先入口にはしない。

**RockstarOSは、SIM/eSIMをきっかけに一度だけ本人登録し、Sky・Zema・Agentへ接続して、cloud作業の進捗・費用・成果を同じ利用体験で扱うAIサービス基盤である。**

Skyは「誰に頼むか」を選ぶ場所、Zemaは「頼んだ仕事を最後まで管理する」場所、Platform Coreは「本当に許可された仕事だけを動かす」中心である。

## 2. 利用者の一周

2026-09-27のSky Market決済追加: 有料の審査済みPackageは「購入」→Stripeの支払い画面→購入履歴で照合→接続先確認へ進む。作者は「販売する」で受取先と価格・条件を登録する。Web API／D1が注文と利用権を管理し、Stripe Connectが決済と10%のSky手数料配分を担う。カード・銀行情報はStripe画面で扱い、LLMの判断だけで支払いを成立させない。これはAgent/Tool marketplace決済の再利用可能な部品であり、SIM/eSIMによるRockstarOS利用権購入とは別商品・別契約である。後者は販売チャネル、通信料金、サービス権利、cloud AI usageを明細上で分離する。[決済設計](sky-billing.md)は有料Package用であり、SIM/eSIMのcarrier billingやクラウドAIのproduction usage billingを受け入れた証拠ではない。

```text
購入チャネルでRockstarOS対応SIM/eSIMを選ぶ
  ↓ 通信条件・利用権・料金を確認する
SIM有効化／対応SIM追加を行う
  ↓
Rockstar identityへ一度サインインし、購入権利を結ぶ
  ↓ 正確な端末・型番のOS導入条件を判定
署名済みOS導入（対応時）または既存OS client/browserで開く
  ↓
HomeからSky・Zema・Agentsを直接使う
  ↓ 料金・見積・上限を確認
Zemaで依頼し、必要予算を明示承認
  ↓ 足りない情報を確認
計画・単価・概算を見る
実行前に予算を承認する
実行する
  ↓ 端末 / PC / Cloud / Provider
進捗を見る・止める
  ↓
結果を確認する
  ↓
成果、実行receipt、費用、検証済み収益を別々に保存する
```

SIM/eSIM profileの有効化はRockstarOSの導入成功・service entitlement・Agent権限を意味しない。チャネルから受け取る注文/activation proofを本人、対象プラン、端末、service entitlementへ束ね、通信事業者の回線状態とOS/client導入状態を独立に表示する。未対応機種はeSIMが入ってもfull OS版とは表示せず、利用可能なclient/browserへ案内する。

利用者の会話中の「はい」だけで、送金、外部投稿、広告、DM、物理実験、出願等を承認しない。承認画面には対象、変更内容、送信先、費用上限、期限を固定して表示する。

## 2026-10-02 共通契約の実装統合

Webと公開PreviewのSky→Zemaは、公開package内の`handoff.js`を共通sourceとして使用する。v1のTool ID、本文上限、local provider正規化とsession上限を共有し、WebのUUID/一回消費/10分TTLはhostが強制する。不正・期限切れの保存は除去し、再依頼で復旧する。公開Previewは既存の`local`表記を維持し、remote・不正timestampは共通validatorで拒否する。双方の契約試験と公開packageの試験をroot verifyに含める。UIのセッションがready/completedであることは、Broker権限・本人承認・実機受入の代わりにはならない。

AI通信、MCP、owner/revision保存、Stripe通信の共通化も同じ原則で行う。業務状態や商品別価格/在庫を共通helperへ埋め込まず、[Tool詳細の共通基盤](sky-tools-complete-design.md#共通基盤の統合2026-10-02g04)と[統合記録](git-consolidation.md#2026-10-02-共通実装の統合g04)を実装入口とする。DB migration、OS image変更、backup format変更はない。既存schema/versionとPR revertを復旧経路にし、Node/mockの合格をnative/Provider/本番の合格へ昇格させない。

## 3. 三つの実装を一つと呼ばない

### Web／PC

現在のHome、Sky、Zema、CSV、Wallet、Market、Studio、Settings、各APIを提供する。認証された利用者ごとにD1へ仕事状態や台帳を保存し、原稿・相談本文・秘密鍵は必要以上にserver保存しない。PC ToolはMCP Connectorを介して本人PCで実行する。

SkyのココナラToolは応募前チェックと本人用案件台帳を一つの画面で提供する。代表者の受注と制作担当者への発注・支払を別の記録にし、固定報酬・支払期日・権利・修正範囲・顧客説明・規約確認の参照を担当開始前に保存する。見込収支と手入力の入出金を分離し、ココナラの実取引、外部送金、Walletの検証済み収益には接続しない。[Tool詳細](sky-tools-complete-design.md#9-ココナラ)。

### Linux／QEMU

Buildroot、read-only rootfs、書込みdata disk、専用UID、local IPC、署名Tool、Registry、Runner、Wallet、A/B更新、backup、復旧のnative契約を検証する。QEMU合格はPixel合格ではない。

### Android／Pixel

`dev.rock.shell`を利用者UI、`dev.rock.automation`をheadless Broker、Local AI、Tool、Operator Agentを別APK／別UIDにする。現在は既存Android上の試験署名APK受入までで、Pixel向けRockstarOS full imageは未完成。

#### eSIM device entitlement gateway

端末はeSIMチップ内でRockstarOSを実行せず、Sky注文で指定された初期Agent Packの利用権を、検証済みprofile導入証拠と注文ownerに結び付ける。Workerの5分challengeにはowner、order、profile digest、device ref、install receipt hash、starter pack ID/version/manifest hashをまとめた`receiptContext`を含める。Android Coreの`EsimDeviceEntitlement`はそのchallengeと、privileged installer adapterから受けた同一profileの`verified + installedEnabled`証拠を照合し、hardware-backed P-256鍵だけでdomain-separated ES256 receiptを署名する。署名はAndroid JCAのDERからWebCryptoの64-byte P1363へ変換し、server canonical field orderで送る。profile secret、ICCID、EID、SIM状態一覧を読む処理は含まず、`READ_PHONE_STATE`も要求しない。

Brokerは署名APIを本人の認証済み注文へだけ結び、serverは一度だけentitlementを保存する。challenge期限切れ、owner/order/profile/device/install hash不一致、installer証拠なし、software/revoked/non-P-256 key、package hash driftは停止し、key/installer authorityの受入前にactive表示へ昇格しない。鍵と証拠はclient側へ永続保存せず、serverは署名対象hashと利用権状態を注文と共に保持する。同じ注文の再送は既存状態照合にし、二重有効化しない。

Android Shell API v5は、サインイン済み注文画面から受け渡されたchallenge JSONをexact-package/signer検査済みShellからBrokerへ渡し、BrokerがUUID、5分以内の期限、canonical 32-byte nonce、Google attestation authority、`dev.rock.automation`を検査してnonce由来aliasのAndroidKeyStore P-256鍵を準備するsource経路を持つ。同じnonceでの応答消失・再試行では同じalias/keyを再利用し、公開鍵と上限付きDER証明書チェーンをShellへ返す。結果は常に`pending_server_and_install_proof_verification`であり、回線・利用権を有効化しない。AIDLにowner IDを書き込む引数は設けない。Brokerがchallenge JSON内のowner値を本人確認に使うこともなく、Workerの認証owner・challenge store・server verifierが最終判断を続ける。現在のShell操作は開発用の貼り付け手順であり、ブラウザ認証からアプリへの自動handoffやAIDLからWorkerへの投稿ではない。

Android Core JUnit 51件とJava／TypeScript共有canonical vector、Worker/D1 API 424 assertions、隔離JVM verifierのunit/upstream試験は合格。これはJVM／host fixture受入である。今回AIDL v5、Broker nonce-bound key preparation、Shell開発UI、同一challenge retry sourceを追加し、OS source-contract／Android architecture checksは通過したが、Android SDK platform/build-toolsがなく、AIDL/APK compileとinstrumentationは未実施。OEM/carrier eUICC install evidence source、challenge自動handoff、receiptを伴うサーバーsubmit、private TLS verifier ingress、provider sandbox、実機利用権表示は未受入。完成条件は同じowner・注文・profile・device・starter packを結ぶattested hardware-key receiptと実機profile install evidenceを契約sandboxで受け入れ、署名失効・端末交換・再起動・再送を検証すること。詳細は[Android/device workstream](workstreams/07-android-device-local-ai.md#esim-device-entitlement-gateway)と[provider contract readiness](provider-contract-readiness-20260930.md)を参照する。

## 4. component構造

| component | 持つ責任 | 持たない権限 |
| --- | --- | --- |
| Device Support Package | boot、driver、電源、熱、hardware鍵、AVB、OTA、純正復旧 | Toolや特定modelの業務判断 |
| Shell / Home | 画面、入力、accessibility、信頼済み承認画面への導線 | DB、鍵、Wallet、任意Toolへの直接権限 |
| Platform Core / Broker | owner、component認証、capability、承認、仕事、receipt、保存、更新gate | UIの都合による権限省略 |
| Local AI Adapter | 選択されたmodelを読み、閉じたschemaのplanを返す | Tool直接実行、権限付与、台帳書込み |
| Agent Runtime | plan検証、有限step、queue、停止、再開 | manifest外の操作、無制限自律実行 |
| Sky | Tool発見、比較、接続、実行場所選択 | Broker管理権限、秘密の無断送信 |
| Zema | 依頼、質問、計画、進捗、停止、結果、履歴 | 会話だけによる高risk承認 |
| Tool | 宣言した個別処理 | 他Tool、他owner、OS内部への横断アクセス |
| MCP Connector | 本人PCのMCPを認証付きで接続 | 任意host・任意commandの暗黙実行 |
| Provider Adapter | 外部serviceのcapabilityとreceiptを共通化 | 未宣言機能の擬似実装 |
| Wallet | 収益、費用、hold、取消、精算の照合 | seed保管、包括送金、推定収益の残高化 |
| Operator Agent | 端末状態、限定命令、監査 | 任意shell、私的内容、Wallet、backup鍵 |

依存方向は`UI → Broker → Runtime → Tool／Provider`。ToolやUIがCore DBへ直接書く逆方向を作らない。

## 5. identityとauthority

混同してはいけないID:

- `ownerRef`: データと仕事の所有者。
- `deviceRef`: 実行端末。
- `componentId`: Shell、Broker、Tool、Provider等。
- `workId`: 利用者が確認する一つの仕事。
- `runId`: 一回の実行。
- `attemptId`: retryを含む一回の試行。
- `operationId`: 外部作用を重複させないID。
- `artifactId`: 入力・成果の参照。
- `receiptId`: 実行や照合の証拠。

componentはpackage、署名者、UID、version、API range、capabilityをBrokerが実体と照合する。表示名やmanifestの自己申告だけを信頼しない。ownerは認証gatewayまたは端末の信頼済みidentityから決め、request本文のowner IDを採用しない。

## 6. capabilityとTool接続

Toolは少なくとも次を宣言する。

- Tool ID、版、作者、署名、license
- 入力・出力schemaと最大size
- 必要な権限と外部送信先
- 実行場所: device、PC、Sky Cloud、Provider
- effect: `local-pure`、`remote-read`、`external-write`
- timeout、停止、retry、結果不明の照会方法
- 料金、費用上限、課金単位
- 成功確認とreceipt形式
- 保存内容、保持期間、削除方法
- offline可否、resource上限、対応Core/API範囲

導入時と実行直前の両方でcapabilityを確認する。古いcache、未知の必須capability、署名・版不一致では動かさない。

## 7. 仕事の状態

利用者向け状態:

```text
draft → ready → active → review → completed
  │       │       │         └→ active（修正）
  │       │       ├→ waiting
  │       │       ├→ failed
  └───────┴───────┴→ cancelled
```

実行step状態:

```text
pending → queued → running → succeeded
                    ├→ needs_review
                    ├→ failed
                    ├→ cancelled
                    └→ uncertain
```

`waiting`にはapproval、network、resource、provider、reconciliation等の理由を付ける。`uncertain`は外部で成立したか分からない状態であり、失敗として自動再送しない。完了したstepを別の結果で上書きせず、新revisionまたは取消eventを追加する。

## 8. 一回の実行

1. owner、Tool selection、request hash、revisionを保存する。
2. Local AIまたは有限recipeが閉じたschemaでplanを作る。
3. BrokerがTool、入力、権限、effect、費用、実行先を再検証する。
4. 必要なら信頼済み承認画面でapprovalを発行する。
5. transaction内でattempt、boot identity、期限、fencing tokenを保存する。
6. Toolへ最小入力だけをdispatchする。
7. callbackのowner、run、token、generation、入力hash、実UIDを照合する。
8. artifact、receipt、状態、次queue、eventを一transactionで確定する。
9. 利用者が成果をreviewする。
10. 外部収益は別の署名済みEarning Receiptを受けて初めてWalletへ進む。

停止は新規dispatchを止め、tokenを失効し、協調停止を要求する。既に成立した外部作用を「停止済み」と消さず、Provider照会または補償操作へ進める。

## 9. Local AIとmodel

OSへ組み込むLocal AI APKは、上流commitに加えてbase overlayと順序付きextensionのSHA-256をartifact lockへ結合する。stageとbuild直前のverifyで現行sourceと一致しないAPK、版・権限・署名用途を貼り替えたstage metadataを拒否し、同一sourceからの再build・検査・レビューで復旧する。旧v2実機受入はv4の受入に流用しない。入出力・保存・承認・合格条件は[APK/overlay一致契約](local-ai-os-integration-20260915.md#apkとoverlay版の一致2026-10-05)を参照する。


`ModelProfile`はmodel ID、版、weight・tokenizer・template hash、license、形式、context、plan schema、RAM／storage、測定条件、品質結果を一組にする。仕事開始時にprofileを固定し、途中でmodelを差し替えない。

更新順は`download → hash/license/容量/API検査 → 隔離試験 → 待機時切替 → health確認`。失敗時は互換性を確認した旧profileへ戻す。失効modelへは戻さず仕事を停止し、新modelでのreplanを新revisionにする。

現在のAndroid Local AIは固定package、version、API、署名と一つのQwen構成による限定受入。汎用model/runtime交換、二profile比較、共通長期記憶は未実装である。

## 10. Agentの記憶

記憶を三つに分ける。

| 種類 | 内容 | 規則 |
| --- | --- | --- |
| 仕事記録 | request、plan、step、attempt、結果、event | 状態の正本。消してはならない |
| 短期context | 現在の会話や検索結果 | cache。消えても権限・完了は変わらない |
| 長期記憶 | 本人確認済みの好み、手順、参照 | 出所、用途、期限、訂正、削除を持つ |

model固有tokenやembeddingはprojection cache。canonical記憶としない。AIの推測を本人の事実や承認へ昇格させない。credential、seed、秘密鍵を記憶本文へ入れない。

## 11. 実行場所とnetwork

| 実行場所 | 利用条件 | 通信断時 |
| --- | --- | --- |
| device | 導入済みTool、端末capability、resource余裕 | `local-pure`は継続可能 |
| PC | Connection Passport、本人PC、fresh health | 接続不明で停止。別PCへ自動移送しない |
| Sky Cloud | 認証owner、配備版、送信同意 | requestを再照合し、完了を推測しない |
| Provider | adapter、scope、費用、idempotency、照会 | `uncertain`から照会で解消する |

Cloud／PC fallbackで送信先が変わる場合は別同意を必要とする。local不足を理由に自動で外部送信しない。

## 12. external-write

外部投稿、広告、DM、請求、送金、出願、物理実験等は`external-write`である。

状態は`prepared → dispatched → confirmed | rejected | uncertain`。送信前にoperation ID、payload hash、対象、費用、approval ID／期限、Provider idempotency keyを永続化する。同じkeyで異なるpayloadを拒否する。

送信直後に切断しても「失敗」と決めて再送しない。Provider referenceまたは同じkeyで照会する。照会も冪等再送も保証されない場合は`uncertain`で止め、人またはProviderへ解決を求める。

## 13. artifactとreceipt

artifactは原稿、CSV、画像、候補graph等の成果。receiptは「誰が、どの版で、何を実行し、どうなったか」を照合する記録である。成果物の内容と実行証拠を同じfieldへ混ぜない。

receiptには少なくともowner、work、run、Tool／Provider、version、input digest、output digest、environment、時刻、outcome、費用、署名または照合根拠を持たせる。environmentはfixture、sandbox、Web、QEMU、emulator、試験署名実機、OS image、本番を区別する。

## 14. 保存とdatabase

保存の原則:

- owner IDを全読書きの条件にする。
- 原記録を上書きせず、revision、event、取消で変更する。
- request keyと内容hashを組にし、同じkeyの別内容を拒否する。
- 私的本文、原稿、raw camera、秘密、credentialを既定telemetryへ入れない。
- serverに不要な入力・成果は端末memoryまたはowner領域に限定する。
- 金額は浮動小数でなく最小通貨単位の整数を使う。
- migrationは旧reader互換、backup、rollback可能性を検査する。

WebのD1、Android SQLite、Linux data diskは別の正本であり、自動的に同期済みとは扱わない。同期機能を追加するときはauthority deviceとwriter epochを固定する。

## 15. backupと復旧

backupはowner、schema、generation、artifact hash、authority状態を含み暗号化する。復元時は空のtarget、所有者phrase、integrity、schema rangeを検査し、新しいKeystoreへ再bindingする。

復元後は仕事をpausedにし、旧tokenをrotateし、active approvalを停止する。旧端末と復元端末を同時writerにしない。物理wipe、鍵喪失、clone拒否、owner再結合を別々に試験する。

現在はAndroid emulatorでtransactional import、所有Pixelで非破壊exportまで確認済み。物理wipe後の全損復元は未完了。

## 16. updateとrollback

OS、runtime、model、Tool、policyを別の更新単位にする。

| 更新 | 主な検査 | rollback |
| --- | --- | --- |
| OS image | AVB、partition、SELinux、API、data migration | Virtual A/Bとrollback index |
| runtime | signer、API range、対応profile、health | 前の互換runtime |
| model | 全hash、license、容量、品質profile | 検査済み旧profile |
| Tool | author署名、manifest、権限差分、schema | Tool単位の旧版 |
| policy | signer、generation、期限、対象 | 既知の安全policy。失効版へ戻さない |

OSのtrial slotではmark-good前にhardware rollback indexを進めない。bootだけで健康とせず、UI challenge、必要service、保存、権限、rollback可能性を確認する。

## 17. UIとaccessibility

HomeはSky、Zema、Wallet、Market、Settingsへの入口。仕事はZemaへ集め、専用Tool画面からも同じwork／receiptへ戻る。

Web Previewのvisual contractは、avokado製品Siteと同じグラファイトのshellとHome、銀色の文字・面、淡い青のfocus／選択手掛かりを基準にする。Sky、Wallet、Market、Settings、CSVなど情報量の多い画面には冷たい白い面を使い、Zema会話とStudioは暗い操作面を維持する。Homeの旧既定黄緑accentだけを新既定色へ移行し、利用者が選んだ別色は保持する。Tool固有アイコン、成功／警告／失敗の意味色はブランドaccentと分け、色だけで状態を伝えない。狭い画面でもHome導線、主要操作、実際の接続状態が見え、横方向のページはみ出しを起こさない。これらはWeb表示の設計であり、native OS・Provider接続・本番公開の完了を意味しない。

全画面で表示するもの:

- 実行場所と最終確認時刻
- offline／接続不明／Provider待ち
- 入力中、実行中、停止要求、停止確認、review、完了、失敗、結果不明
- 料金と外部送信範囲
- 使用Tool／model／版
- fixture、sandbox、実機、本番の区別

keyboard、touch、screen reader、文字倍率、色以外の状態表現、動きを減らすmodeを画面ごとに受け入れる。会話だけを唯一の操作方法にしない。

## 18. Wallet、収益、Fund

Tool完了、販売成立、Provider入金確認、Earning Receipt、Wallet反映、払出しを別状態にする。自己申告、予測、PAPER損益、simulation PnLを残高へ入れない。

Rock利用料はProvider確認済み収益から実費を引いた残額を基礎に月最大888 USD cents。売上0なら請求0、未達分を債務化・翌月繰越しない。秘密鍵や利用者資産を保管せず、外部Wallet／Providerへの指図と照合だけを行う。

Fundは複数Toolの検証済み純実績が蓄積するまでPAPER。LIVE運用、利回り保証、自動再投資は行わない。

## 19. Securityとprivacy

基本規則:

- least privilege、別UID、別署名、入力上限、allowlist。
- platform鍵を第三者Toolへ渡さない。
- 任意shell、root、任意URL、任意host pathを共通Tool APIにしない。
- 取得data内の命令を権限変更として実行しない。
- secretは専用保管参照で扱い、log、memory、URL、artifactへ埋め込まない。
- telemetryはcategory別同意、目的、保持、送信先、削除、撤回を持つ。
- raw job、私的会話、写真、連絡先、鍵、credential、正確な位置を既定収集しない。

Operator DockはOS外、端末Agentはlauncher非表示・限定scope。管理serverだけでは有効命令を作れず、利用者確認済みWebAuthn署名、端末側検証、単調counter、追記監査を必要とする。

## 20. Device Support Package

共通Coreと機種固有driver／firmware／partition／power／thermal／camera等を分離する。DSPは対応Core範囲とhardware capabilityを宣言し、未確認機種を同型として扱わない。

Android Broker snapshot v3は、Androidが報告するeUICC機能・管理有効状態・複数profile同時有効機能に加えて、このBrokerがAndroid 15以降のDevice Owner／Profile Ownerに登録済みか、組織所有端末で自動profile有効化APIの条件を満たすかを読み取り専用で返す。有効期限は30秒。これは端末上で管理tierを判別する材料であり、carrier privilege、LPA対応、空きport、対象プラン・profileの適合、導入成功を示さない。Profile Ownerが個人所有端末である場合はmanaged-subscription管理適格と自動有効化適格を分離する。eUICC非対応、管理無効、確認不能も別状態にする。profile導入状態、契約プランとの一致、データ接続、機種向けRockstarOS imageの適合はこの表示から推論せず、別のOS/DSP受入が必要である。subscriber identifierを取得せず、診断結果を保存・送信しない。汎用Capability APIはBrokerが所有し、端末の測定値と試験保証範囲を版付きで返す。

最初の物理対象はPixel 10、model GL066、product `frankel`。Google stock factory imageとfull OTA、vendor inventory、正式署名、full build、flash、SELinux、CTS/VTS、OTA rollback、純正復旧が揃うまで完成対応を表示しない。

## 21. 運用と診断

利用者画面、開発診断、運営緊急保護を分離する。診断bundleには版、component health、失敗code、receipt参照、resource状態を含められるが、私的入力・成果・秘密を既定含有しない。

重大incidentは検知、影響範囲、失効、停止、利用者表示、復旧、証拠保全、再発防止の順に扱う。運営が不在でも端末は期限切れ命令を拒否し、基本offline機能と利用者による停止・exportを維持する。

## 22. application systems

| system | Coreとの接続 | 独立受入 |
| --- | --- | --- |
| Sky / Zema | Tool selection、work、approval、event、artifact | 一台／多端末、Web／nativeを分ける |
| Wallet / Fund | receipt、Earning Receipt、reconciliation | 実Provider、実資金、地域ごと |
| Game / IP | owner、job、artifact、save、receipt | game本体、金融交換、動画、VRを分ける |
| Material Invention / avocadoMini | work、Tool、safety、evidence、Patent AI | XR、sensor、simulation、lab、材料、特許を分ける |
| Business Tools | 共通Tool contractとZema | Toolごとに入力、外部作用、品質を受け入れる |

応用systemをCore bootの必須依存へ入れない。応用が未完成でもCoreを試験でき、Core合格だけで応用完成とも呼ばない。

## 23. 代表的な失敗と挙動

| 失敗 | 表示・状態 | 自動でしてはいけないこと |
| --- | --- | --- |
| modelをloadできない | model利用不可、仕事を保持 | Cloudへ送る、入力を削除する |
| Tool署名・版不一致 | 実行拒否 | 警告だけで続行 |
| PC接続が古い | 接続不明 | onlineと表示、別PCへ移送 |
| 通信切断 | waiting／uncertain | 外部作用を失敗として再送 |
| callback重複 | 既存receiptを返す | 二重成果・二重課金 |
| 保存容量不足 | 開始前拒否または安全停止 | 旧modelや成果を勝手に削除 |
| backup復元 | paused、token rotate | 旧端末と同時writer |
| update失敗 | trial拒否、旧slotへ戻る | 壊れた版をmark-good |
| Provider未確認収益 | pending | Wallet残高へ記帳 |
| sensor／AIの低confidence | preview／needs info | 確定操作へ昇格 |

## 24. 合格matrix

| gate | 必須証拠 |
| --- | --- |
| host test | pure logic、schema、異常入力、決定性 |
| Web | 認証、owner分離、revision、API、build、asset closure |
| QEMU | boot、UID、IPC、保存、再起動、更新、rollback、backup |
| Android emulator | Binder、UID、DB、backup import、異常callback |
| 試験署名Pixel APK | 機内モード、実再起動、熱、hardware Keystore、非破壊export |
| RockstarOS Pixel image | full build、AVB、SELinux、CTS/VTS、OTA、stock recovery、wipe restore |
| Provider sandbox | auth、冪等性、照会、返金、結果不明、失効 |
| production | 正式鍵、契約、地域、監視、incident、復旧訓練、本人の公開判断 |

一つのgateの合格を別gateへ転用しない。

## 25. 現在未確定の設計値

| 未確定 | 決める方法 | 決定前の挙動 |
| --- | --- | --- |
| 比較採用するLocal AI model | 同じ入力、品質、p95、電池、熱で比較 | 現行固定runtime以外を対応表示しない |
| 一般Tool capability schemaの最終版 | SDK、native、MCPのfixtureを相互変換 | P1固定contract外を拒否 |
| 多端末writer移送transport | offline競合、fencing、旧端末停止を試験 | 自動移送しない |
| production identity／key ceremony | owner、HSM、別人検証、復旧訓練 | test鍵を本番扱いしない |
| 最初の外部収益Provider | 契約、sandbox、返金、照会を受入 | fixture収益だけを表示 |
| Pixel OS hardware budget | full build後に容量、RAM、電池、熱を実測 | 仮目標を出荷値にしない |

## 26. 詳細正本

- [AIネイティブOS共通設計](ai-native-os-architecture.md)
- [RockstarOS 1.0構成](rockstaros-1.0-architecture.md)
- [Platform Core](platform-core.md)
- [Android production architecture](android-production-architecture.md)
- [Device Support Package](device-support-architecture.md)
- [Native OS統合](native-os-integration.md)
- [Sky／Zema／全Tool詳細設計](sky-tools-complete-design.md)
- [保存境界](data-storage-boundaries.md)
- [backup・復旧](android-backup-recovery.md)
- [緊急保護](security-incident-response.md)
- [Material Invention／avocadoMini](rockstaros-avocado-mini-complete-design.md)
- [release gate](release-minimum-gates.md)

## 27. Web画面とAPIの配置

| 入口 | 責任 | 正本・境界 |
| --- | --- | --- |
| `/` | Home、主要systemへの入口、現在状態 | `components/home-screen.tsx` |
| `/sky` | Tool発見、比較、選択、Zema引継ぎ | `components/sky-workspace.tsx` |
| `/sky/network` | 接続経済、MCP／Provider状態 | `components/sky-network.tsx` |
| `/sky/publish` | ToB掲載、Package、診断 | `components/sky-publisher-form.tsx` |
| `/chat` | Zema、MCP bot、方向修正、停止、結果 | `components/sky-chat-workspace.tsx` |
| `/work` | 仕事作成、step、review、履歴 | `lib/workflow.ts`、`lib/work-store.ts` |
| `/activity` | 実行・仕事の確認 | event／job APIのread model |
| `/csv` | CSV Tool専用受付・成果取得 | CSV設計とjob store |
| `/wallet` | owner別残高、売上、経費、取消 | Wallet API。秘密鍵を持たない |
| `/market` | typed PAPER market | LIVE取引なし |
| `/polymarket` | 公開市場read-onlyとbacktest | 注文・秘密鍵なし |
| `/fund` | PAPER fund構成と測定 | LIVE運用なし |
| `/income/mercari` | 出品draftと収益loop | 外部操作は本人／Connector別承認 |
| `/studio` | Tool Package生成、登録、MCP公開 | [Sky Tool SDK](sky-tool-sdk.md) |
| `/settings` | 利用者設定、接続、privacy入口 | 権限付与はBroker／Provider側で再検査 |
| `/settings/system` | backup、更新、診断等のsystem操作 | `components/system-maintenance.tsx` |
| `/rockstaros` | Developer Preview説明 | 実装環境とgateを過大表示しない |
| `/rockstaros/guide` | 導入・利用案内 | release状態に応じる |

APIは領域別に分ける。

- 仕事: `/api/jobs`、`/api/work-jobs`、`/api/runs`、`/api/tool-controls`。
- Sky: `/api/sky/connections`、`developer-tokens`、`mcp/inspect`、`submissions`、`tool-events`、`tool-packages`、`tool-publications`、`tool-registry`。
- Tool固有: `/api/csv-jobs`、`legal-guidance`、`patent-research`、`revenue/mercari`、`markets/analysis`、`markets/bot/assess`。
- 金融: `/api/wallet`、`earnings/receipts`、`billing/token`、`fund`、`automation-funds`、`market`。
- 端末・運用: `/api/devices`、`operations`。

更新APIは認証ownerとsame-originを必須にし、body size、未知field、revision、idempotencyを検査する。routeがあることを本番Provider接続やOS機能完成の証拠にしない。

## 28. Android package配置

| package／module | 役割 | 現在地 |
| --- | --- | --- |
| `dev.rock.shell` | Home、Sky、Zemaの薄いUI | 試験署名APK。広い権限なし |
| `dev.rock.automation` | Platform Broker、owner DB、仕事、Tool dispatch、Wallet fixture | emulator／所有Pixel限定受入 |
| Local AI package | API v2で閉じたplanを返す | 固定runtime／model |
| `dev.rock.tools.article` | citationsとfree-article固定2工程 | P1専用。同署名、INTERNETなし |
| `dev.rock.operator.agent` | 限定緊急命令の端末側検証 | 本番credential／Device Owner未受入 |
| `shell-api` | ShellからBrokerへの署名限定AIDL | API v5。Sky selection、owner recovery、開発用eSIM nonce-bound key preparation。実ビルド・Binder受入待ち |
| `tool-sdk` | BrokerからToolへのP1 AIDLと型 | 第三者公開SDKではない |

最終OS imageではpackage、privapp許可、SELinux domain、signer、UID、version、permissionを同じbuild artifactで検査する。単体APKの成功だけでproduct imageへの搭載を主張しない。

## 29. Linux／QEMU service配置

| service領域 | 役割 |
| --- | --- |
| `platform` / `core` | local IPC、identity、state、receipt |
| `registry` | catalog、署名、hash、revision、失効 |
| `runner` | Tool隔離、limit、result |
| `service_access` / `mcp_broker` | owned serviceとMCP接続 |
| `wallet_backend` / `wallet_auth` | owner台帳、資格、reconciliation |
| `settlement` / `atm` | 合成精算、ATM simulator |
| `game_exchange` | GX00／GX01の合成交換 |
| `ai_routes` | local／cloud／PC route policy |
| `update` / `system` | A/B、health、rollback、電源、backup |
| `operations` / `security` | 診断、保護、監査 |
| `ui` | framebuffer native UI |

各serviceを専用UIDと有限IPCで接続し、UIへdatabase socketやroot権限を渡さない。QEMUのservice配置をAndroidへpath単位で移植せず、契約とfixtureを比較してplatform固有実装へ写す。

## 2026-10-05 旧PRと現行Coreの互換統合

AI02〜AI06の旧host fixtureを現行のSIM/eSIM・署名付きPlatform Coreへ併存させる。`ModelProfiles` の試験用schemaは `fixture_model_*` に分離し、署名・失効・版固定を持つ `PlatformStore` の製品registryを置き換えない。限定記憶、external-write outbox、単一executorのfixtureは入力版・owner/project・operation keyを照合し、競合や結果不明を実行成功へ変換しない。既存の共通DBを使い、復旧時は同じ仕事とkeyを照合する。host SQLite/JUnitの成功とAndroid Binder/実機受入は別に記録する。実機のモデル交換・記憶移行・外部作用の本番運用は受入が残る。

非金融Game fixtureはseed固定・粒子world・保存再読込を検証する試験基盤であり、外部ゲームの残高や資金を変更しない。Decision FabricのRouter/Harnessと任意Jev providerは提案だけを返し、Brokerの権限や本人承認を付与しない。Agent Control Plane公開APIは認証済みdry-runのみを受け付け、見積・owner予算予約・冪等dispatch・Provider receiptの接続までremote起動を拒否する。詳細は[LLM境界](llm-evaluation-architecture.md)と[Agent Control Plane](agent-control-plane.md)を参照する。

統合対象・除外理由・検証環境は[PR統合証拠](evidence/pr-consolidation-20261005.json)に保存する。旧仕様へのrollbackはmerge履歴から追跡し、現行署名registry、SIM entitlement、本人別保存、課金上限を失う一括巻戻しをしない。
