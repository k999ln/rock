# Sky A2A Bridge — agent間委任adapter

更新日: 2026-10-02

## 目的と責任

Skyで発見・比較した外部agentへ、Zemaの親jobから許可された範囲の子taskを委任し、同じ接続経由で状態を照会・取消できるようにする。MCPはTool／データ接続として維持し、A2Aは独立agentとの非同期job委任に用いる。

- SkyはAgent Card、提供者、skill、接続条件、版を候補として表示する。Cardの自己申告は能力審査や承認ではない。
- Zemaは親job・子task・進捗・納品・本人確認を管理する。remote taskの`COMPLETED`だけで親jobを完了にしない。
- Core/Brokerは接続origin、本人、対象agent、入力hash、許可、期限、予算を検査する。本clientの`authorizeDelegation` hookへ、永続化されたBroker承認の照合を渡す。hook未設定なら送信拒否。
- ProviderはA2A taskを実行する。RockstarOSは相手の申告状態と成果を保持し、実行・費用・納品物を独立に照合する。

## Sky個人接続帳

`POST /api/sky/a2a-agents`は、ログイン中の本人が明示した公開HTTPS originの`/.well-known/agent-card.json`をGETし、A2A 1.0 JSON-RPC interface、サイズ、originを検査する。IP literal、localhost/internal/test系host、非443 port、redirectは拒否する。加えて`A2A_EGRESS_ALLOWED_ORIGINS`へ運営が登録した最大64件のcanonical HTTPS originと完全一致しなければ、外部fetch前に拒否する。未設定・不正設定は全件拒否。取得したCardのcanonical digest、name/version、snapshot、時刻を`sky_a2a_agent_connections`へowner-scopedに保存し、同じowner/origin/nameは再取得で更新する。取得操作はownerごとに1分20回へ制限し、GET／DELETEもowner境界を持つ。

これは公開Cardの自己申告を候補として記録する個人接続帳で、Sky全体の検索、提供者確認、能力審査、署名検証ではない。Cardを取得・選択してもProvider実行は起きない。サイトWorkerと`services/sky-agent-runtime`の両方に同じ`A2A_EGRESS_ALLOWED_ORIGINS`を設定する。未設定の既定では候補発見・dispatch・remote status/cancelのすべてを実行しない。A2A実行の`A2A_DELEGATION_EXECUTION_ENABLED`は別のgateであり、許可originを設定しただけでは外部送信を有効化しない。

Cloudflare公式資料によるとWorkerの`fetch()`は外向きHTTP subrequestとして扱われ、private networkへの接続はVPC binding経由で明示的に構成する。runtimeのwrangler設定にはVPC bindingを追加しない。したがってアプリの完全一致origin許可とCloudflareのegress制御を重ねる。自前のホスト環境へ移す場合は、同等のpublic-only outbound制御とDNS rebinding対策が別途必要。許可originを取り消すと、その先の稼働中taskの照会・停止も止まるため、未完了taskがある間は緊急遮断の意図を記録し、remote状態を未確認と表示する。[Workers Fetch](https://developers.cloudflare.com/workers/runtime-apis/fetch/)（2026-09-30確認）、[Workers VPC Services](https://developers.cloudflare.com/workers-vpc/configuration/vpc-services/)（2026-09-30確認）。

契約後の接続準備では、ProviderからAgent Card originとJSON-RPC endpointを受領して検査し、サイトWorkerとRuntime Worker両方の`A2A_EGRESS_ALLOWED_ORIGINS`へcanonical originを設定する。許可を二つのWorkerで一致させ、`npm run sky:agent-runtime:check`でbindingを確認する。`A2A_INPUT_ENCRYPTION_KEY`はsecretとして別管理する。origin設定後もexecution flagを有効にせず、まずAgent Cardだけを取得する。その後にnative Broker照合、Wallet予約、Provider sandbox条件を検証して初めて別途実行を有効化する。現在はProvider origin未確定のためallowlistは空で、実接続・外部送信は未実施。

## 実装済みadapter契約

`lib/a2a-client.ts`はA2A Protocol 1.0.0のJSON-RPC bindingを対象にする。仕様入口: [A2A 1.0.0 specification](https://a2a-protocol.org/v1.0.0/specification/)。確認日: 2026-09-30。

- well-known URIまたは明示card URLからAgent Cardを取得する。
- `supportedInterfaces`からA2A 1.0 JSONRPC interfaceを選び、HTTPSと本人が許可したexact originを確認する。開発fixture用localhost HTTPは許可リストに明記された場合のみ使える。
- A2A 1.0 JSON-RPCの`SendMessage`、`GetTask`、`CancelTask`を実行し、A2A-Version headerとJSON-RPC response IDを照合する。A2A 1.0のJSON-RPC bindingはPascalCaseメソッド名を規定する。
- Agent Cardに未対応の必須extensionがある場合はfail closed。
- endpoint redirectを拒否し、tokenをログへ出さない。Provider資格情報はconnection単位で呼出し元から渡し、moduleに永続化しない。
- `SendMessage`前にBroker照合hookを呼ぶ。照合入力にはmessage ID、target origin／Agent／version、送信本文SHA-256、protocol versionを渡す。
- `POST /api/sky/a2a-delegations`は、認証済みownerのactive parent job、本文hash、target identity、予算・期限を結ぶ確認待ちレコードだけを作る。依頼本文は承認前には保存しない。サーバーがownerを含む全条件のSHA-256を計算し、ブラウザー申告のapproval flag／digestは採用しない。
- `PATCH /api/sky/a2a-delegations/{id}`の`approve`は、owner-scoped readback後に本文と全条件のdigestを再計算する。完全一致した場合だけWorker secret `A2A_INPUT_ENCRYPTION_KEY`でAES-256-GCM暗号化し、owner・委任ID・本文hashをAADで結び付けて期限付きでD1へ保存する。同一D1 batchのinsert条件でも保存対象のintent digestが現在値と一致することを検査し、append-only eventとCAS状態遷移`awaiting_approval → prepared`を行う。dispatch claimは`prepared`のみを受け付けるため、未承認・期限切れ・取消済みはdispatch不可。secret未設定や暗号化失敗時は承認を進めない。本文をAPI response／監査eventへ出さない。
- `agent_delegation_inputs`はowner-scoped読出し・削除・期限切れ削除を備える。Runtime Workerのminutely cronは期限切れ本文を削除するが、workerがdeploy・同一DBへ接続されていることが前提。cancel、remote完了／失敗時の即時消去、暗号鍵rotation、KMS連携は未接続。データベース管理者は暗号文とmetadataを閲覧できる。
- Web承認はowner-scopedの短命なnative Broker proofを保存・再検証し、Runtime Workerも外部Agent Card取得前、送信marker前、`SendMessage`直前に同じproofを照合する。Cloud verifierは従来のEd25519 trust keyと、Android Key Attestation用のP-256 trust keyをpublic-key wire lengthで区別する。未登録・失効・期限切れ・条件不一致は送信前に拒否する。これは実端末key enrollment、Walletの残高予約・請求とは別で、後者は未接続。
- `SendMessage`の通信失敗、巨大／不正応答、5xxは結果不明として同じmessage IDを返す。自動再送しない。A2A 1.0ではmessage IDによる重複排除はProviderが実装してよい（MAY）仕様で、保証されない。また新規task IDはサーバーが生成するため、応答前に`GetTask`する標準手段はない。Provider sandboxでmessage ID照合またはProvider固有request-reference照会を確認できなければ、結果不明のtaskを再送せず`indeterminate`のまま保持する。
- `GetTask`／`CancelTask`の応答はtask状態・取消要求の結果であり、remote workerの停止や費用確定を単独で証明しない。
- `lib/a2a-delegation-store.ts`とD1 migrations `0019`〜`0025`が、owner・active parent job・入力／認可digest・子上限・親job共通予算・期限・remote task・暗号化成果本文とappend-only状態遷移eventを永続化する。`sky_a2a_agent_connections`は本人指定HTTPS originから取得したAgent Card snapshot、canonical digest、版、時刻をowner-scopedで保存する。owner+idempotency keyの一意制約とintent一致を確認し、別payloadで同じkeyを再利用できない。
- A2A用の`agent_delegation_budget_pools`は親jobごとのcurrency／上限／予約額／settled額を保持し、`agent_delegation_budget_reservations`は承認済み子taskの上限をD1 transaction内で予約する。親capは承認digestに束縛され、並行承認はSQLite/D1制約とtriggerで上限超過を拒否する。承認前キャンセル・期限切れ・外部送信前失敗では予約を解放し、送信marker後のindeterminate／remote作業中は重複使用を避けるため予約を維持する。これは**A2A親子task間の論理的な上限予約**であり、Wallet残高を拘束する処理や実請求ではない。Provider署名usage receiptの検証と論理budget settlementのコードはあり、local Worker/D1 fixtureで確認するが、実Providerの費用照合・Wallet残高への原子的反映・資金決済は未受入。
- 初期状態は`awaiting_approval`。一致するowner承認後だけ`prepared → dispatching`を一回claimできる。timeout後は`indeterminate`となり再claimできず、remote task照合だけで復帰する。期限切れ、承認前取消、取消要求、remote cancellation確認、remote completionを別状態にする。親jobはremote completionだけで完了しない。
- Workerは`GetTask`／`CancelTask`で得たtaskのtext artifactを32 KB以内に正規化し、owner・delegation・remote task・artifact hashをAES-256-GCMのAADへ結び付けて保存する。非text part（file bytes／URI／data）は保存も自動取得もしない。完了状態でも成果capture前はschedulerが再照合し、暗号化保存・capture記録後に終端タスクを再poll対象から外す。
- `GET /api/sky/a2a-delegations/{id}/artifacts`は同じ認証ownerに限って成果を復号して返す。成果本文をWorkflowのstep resultや通常eventへ書き戻さない。これはtext resultの保護と再取得APIであり、remote file artifactの署名検証・認可付きdownloadは別途必要。
- 外部実行はfail-closed feature gate `A2A_DELEGATION_EXECUTION_ENABLED=true`がAPIとRuntime Workerの両方に設定された場合だけ有効。未設定・不一致では承認APIは503、Workerはdispatchを開始しない。サイトWorkerとRuntime Workerの両方で`A2A_EGRESS_ALLOWED_ORIGINS`に対象のcanonical HTTPS originが完全一致していることも必要。現在のruntime `wrangler.jsonc`は空の許可listで、execution gateもdefault-off。API fixtureは空list時の認証済みdiscovery要求を403で拒否し、ローカルWorkflowでは証明不在等をAgent Card取得前に拒否する。productionでの有効化には実device key enrollment/revocation、Wallet残高予約・利用量settlement、Provider契約と費用・取消受入がまだ必要。

本実装はProtocol、owner別task-store、Agent Card候補、native Broker proof発行／検証、local Workflow dispatch/reconciliationを含む。productionのdispatch運用、実端末Broker signer/key enrollment、Wallet残高予約・利用量settlement、streaming、push通知、OAuth 2.1、provider固有認証、remote file成果URLの安全な取得、署名Agent Card検証は未実装。別Worker `services/sky-agent-runtime`にCloudflare Workflow型minutely scanner、dispatch、status reconciliation、一回cancel経路を実装し、dry-runとlocal Worker/D1/Workflowを検証した。scannerは期限切れ本文を削除し、preparedを最大50件読み、決定的Workflow IDで起動する。WorkflowはD1上で`prepared → dispatching → dispatch_submitting`を分け、外部送信前に永続one-shot markerを置く。送信前に失敗した委任は`remote_failed`、marker後の結果不明は`indeterminate`へ記録し、自動再送しない。negative local Workflow試験は3種類の無効proofで送信claim 0件・Agent Card discovery未到達を確認する。positive local Worker/D1/Workflow suiteは制御fixture service bindingへ送信し、通常taskの完了、Package runtime extension bindingとの一致、暗号化artifact保存、およびsynthetic Provider署名receiptの検証・logical usage settlementを確認する。実在Providerへの送信・契約・実請求はない。runtime Workerはproduction共通D1／secretへdeployされておらず、production dispatch受入とはしない。Cloudflare Workflowsはstep状態をdurableに保持するが外部HTTP作用との原子的commitは提供しないため、[Cloudflare Workflow retry model](https://developers.cloudflare.com/workflows/build/sleeping-and-retrying/)に対しD1 one-shot markerで重複送信を防ぐ。

## 続く縦断実装

1. 本人指定の公開HTTPS originからA2A 1.0 Agent Cardを取得し、origin一致・応答上限・JSON-RPC版を検査して、card digest・版・更新時刻を`sky_a2a_agent_connections`へowner-scopedに保存する。取得APIは20回/分のowner rate limitを持ち、接続候補の削除もowner-scoped。Card記載能力は自己申告の未審査候補としてのみ表示する。未完了はSky全体の検索・審査・提供者認証・信頼評価とproduction egress経路の実測・監査。
2. draft作成とowner向けdigest確認はZemaに接続した。短命native Broker proofの検証は実装済みだが実端末signer/key lifecycleは未完了。最終実行gateはdefault-offのため無効。Wallet残高reservation／funded settlementと実Providerの費用・停止条件受入後に明示承認をproduction実行認可へ結ぶ。local D1 fixture上のsynthetic usage receipt settlementは実装・検証済み。
3. cleanup scheduler、terminal-state消去、鍵rotation／KMSを接続し、provider connectionとOAuth 2.1相当の認証を保存する前に秘密鍵管理方式を決める。
4. `services/sky-agent-runtime`をshared D1へ接続し、秘密鍵を同じsecretとして設定する。cron scanner／Workflowのschedule・起動・retry・重複ID・停止・ログをProvider sandboxで検証する。A2A `SendMessage`は一回dispatch claim後の結果不明を自動再送せず、明示照合で復旧する。
5. remote taskの状態照合、text artifactの暗号化保存・owner-scoped取得API、既存Zema Workbenchの委任一覧／停止要求／成果確認、入力した接続条件からのdraft作成・digest確認画面を実装した。実行gateはdefault-off。本人指定originのAgent Card候補は未審査の個人接続帳であり、Sky全体の検索・提供者審査・信頼評価ではない。未実装は実端末Broker鍵lifecycle、Wallet連携、委任成果の利用量照合・settlement、最終照合時刻・省略されたfile/data partの表示、成果検証と本人確認の状態管理。
6. 子task上限を親job共通枠から原子的に論理予約するD1 pool/reservationを実装し、同時承認でcapを超えないこと、pre-send cancel/failureで解放すること、indeterminateは保持することをテストした。これはWallet残高reservationではない。providerの実利用量をreceiptで照合してWallet請求へ反映する必要がある。A2A task statusを支払確定へ直接昇格させない。
7. fixtureの後に、異なる実装のA2A 1.0 server/client双方を使う相互運用試験を行う。Provider sandbox、本番、契約は各段階を分離する。

## RockstarOS Broker承認証明の境界

2026-10-01に証明schemaを`rock-a2a-broker-authorization/2`へ更新し、owner・device・delegation・親job・message・入力hash・target origin／Agent／version・A2A版・通貨／上限・`continueWhileDeviceOffline`・期限・承認digestを署名に束ねる。Cloud A2A委任ではoffline継続への明示同意を必須とし、false/default/legacy rowをWorkerの外部送信前に拒否する。schema/domain prefixとも2へ上げ、旧v1 proofを受理しない。短命性、厳密なorigin、未知field拒否、trusted-key resolverも引き続き検査する。2026-10-02にCloud verifierはoperator inventoryでowner/device/key IDへ厳密に結び付けたEd25519 raw keyとP-256 uncompressed pointの両方を検証可能にした。端末向けP-256 sign pathはNode interoperability fixtureで通過したが、Android SDK/実機では未検証。

native `Broker.authorize_a2a_delegation()`も追加した。明示exact consent後に注入された署名adapterだけを呼び、入力本文を永続化せず、署名proofとrequest digestをappend-only control receiptへ保管し、同じkeyの再要求へ同じproofを返す。Python Broker側45 testsとWeb verifier側2 testsは共有のcross-language signing-bytes vectorを検証する。

これは**発行・検証の契約とfixture**であり、Broker内蔵の実機署名器、Wallet／WebAuthn鍵との接続、端末公開鍵のowner-scoped enrollment／失効管理、development HubGateway/device-client wire、D1からの証明読出し、A2A `authorizeDelegation` hookへの接続は未実装。証明が無い・未登録鍵・検証不能ならdispatch前に拒否しなければならない。control receiptやWeb loginを署名済み端末承認と読み替えない。テスト署名器と生成keypairはfixtureのみで、本番鍵は作成・保存していない。

受入テスト: `PYTHONPATH=src:os python3 -B -m unittest discover -s tests -p 'test_mcp_broker*.py' -v`（owned loopback fixtureを含む45件）、`node --experimental-strip-types --test tests/a2a-broker-authorization.test.mjs`（3件）。公開鍵の信頼源とkey lifecycle、runtime hookが接続されるまで`A2A_DELEGATION_EXECUTION_ENABLED`を有効化しない。

## 現在の証拠

### Node／Python A2A server fixture間のpositive client interoperability（2026-09-30）

`tests/a2a-client.test.mjs`はNode built-in HTTPと独立したPython stdlib HTTP serverへ実loopback接続し、同じA2A 1.0 clientでAgent Card discovery、本人認可hook、`SendMessage`、`GetTask`、`CancelTask`を確認する。Node側は送信時completed、Python側はsubmitted後pollでcompletedとなる異なる応答順序を持ち、各serverのartifact本文、JSON-RPC ID、A2A-Version、message ID、origin／input digestを検証する。

これは二つのローカルfixture implementationによるprotocol interoperabilityであり、二社の実Provider、Cloudflare Workflow positive dispatch、署名usage receipt、Wallet残高予約、実端末Broker鍵、本番継続性の合格証拠ではない。現在の実行gateはdefault-off、実接続試験は契約後に別途必要。

### Broker proofを送信境界へ接続（2026-09-30）

owner-scoped `POST /api/sky/a2a-delegations/{id}/broker-authorization`で、端末Brokerから受けたproofをD1へ一度保存する。APIは承認待ちdraftのowner・委任条件・本文hashを受信本文から再計算し、active鍵を運営設定`A2A_TRUSTED_BROKER_KEYS`から解決して署名を検証する。proofはWeb承認前に保存され、Web承認はproofが現在も有効な場合だけ受け付ける。Runtime Workerも外部Agent Card取得前、送信marker前、A2A送信直前に保存proof、鍵状態、owner/device、入力hash、接続先、版、予算、期限、authorization digestを検証する。proof不在・期限切れ・失効鍵・条件不一致は外部HTTP要求より前に`PREFLIGHT_FAILED_BEFORE_SEND`で止める。D1にはproofをowner-scopedに保存し、異なるproofへの後日差替えを拒否する。

`A2A_TRUSTED_BROKER_KEYS`はJSON配列の運営管理設定で、各項目は`authorityId`、`ownerUserId`、`deviceRef`、`keyId`、Ed25519なら32-byte raw公開鍵、Android P-256なら`04`から始まる65-byte uncompressed SEC1点をhex化した`publicKeyHex`、`status` (`active`/`revoked`)を持つ。未知field・不正JSON・重複key・大きすぎる設定は一覧全体を無効にする。サイトWorkerとRuntime Workerへ同じ設定を管理者が明示設定する必要があり、現在は未設定。API proof受渡しのMiniflare統合251 assertions、proof verifier/trust fixture 3件、typecheckとRuntime dry-run bundleは成功。`npm run sky:a2a:workflow:test`を追加し、Wrangler local Workflow＋専用local D1でproofなし・期限切れproof・失効鍵の3ケースを実行した。3件すべてが`verify-native-broker-authorization-before-egress=false`で完了し、D1状態は`remote_failed / PREFLIGHT_FAILED_BEFORE_SEND`、`remote_send_claimed`は0件、`discover-approved-agent` stepは未到達。証拠は[local Workflow試験記録](evidence/sky-a2a-workflow-local-20260930.json)。これはCloudflare本番上のdurability・再起動・本番secrets、実端末鍵登録・失効authority、WebAuthn signer、端末Gateway wire、Wallet予約、Provider sandboxでのproof付きdispatchを証明しない。過去の「Workflow未検証」という記述はlocal fixtureの範囲で更新し、production acceptanceは未完了。

### 親job共通予算予約（2026-09-30）

Migration `0025_a2a_shared_budget_reservations.sql`は、同じ親jobから並列委任する子taskの上限を一つのowner-scoped poolで管理する。承認時に子taskの最大額をatomicにholdし、同じcurrency・親capであることと、予約合計がpool上限以下であることをD1 triggerとtransactionで強制する。親capはBroker authorization digestにも含める。未dispatchのcancel・期限切れ・preflight failureはholdを解放し、remote-send marker後はindeterminate／remote taskの費用二重使用を避けるためholdを維持する。

`node --experimental-strip-types --test tests/a2a-authorization.test.mjs tests/a2a-broker-authorization.test.mjs tests/a2a-delegation-store.test.mjs tests/a2a-agent-directory.test.mjs tests/a2a-artifacts.test.mjs tests/a2a-client.test.mjs tests/a2a-input-crypto.test.mjs`: 39/39成功。同時承認の上限競合、owner境界、cancel/preflightの解放、remote不確実時のhold維持を含む。`PYTHONPATH=systems/rock-star-os/os:systems/rock-star-os/src python3 -B -m unittest discover -s systems/rock-star-os/tests -p test_mcp_broker_core.py`: 30/30成功し、親cap差替えを署名条件不一致として拒否する。`npm run sky:a2a:workflow:test`: Cloudflare Wrangler local Workflow/D1 3/3成功、proof不在・期限切れ・失効鍵それぞれで送信claim 0件、Agent Card discovery未到達を確認する。D1 trigger作動時はmetadata上の変更行数に副作用が含まれる場合があるため、guarded state updateは対象行の更新有無で成功を判定する。

### 委任の深さ・fan-out・同時実行上限（2026-10-01）

現在の委任モデルは、本人が認可したZema root jobから外部A2A agentへ一段だけ委任する。外部agentにRockstar owner credentialや新しいBroker proofを渡さず、外部agentがRockstarOSの子委任を自律作成する経路は提供しない。循環は委任graphを作らないことで防ぎ、将来recursive delegationを追加する場合は専用のchild-of-delegation binding、深さ予算、循環検出、親からの権限/予算縮小を先に実装する。

Migration `0043_a2a_delegation_fanout_limits.sql`はD1 insert triggerでroot jobあたり最大8 delegation、一度にactiveなdelegationを4件へ制限する。`awaiting_approval`、`prepared`、`indeterminate`、remote作業中、取消照合中はactive枠を占有し、終端後にslotを解放する。結果不明jobはslotとbudget holdを維持して重複task作成を防ぐ。同じowner/idempotency keyの再照合はlimit triggerより先に認識されるため、上限到達後も既存requestを安全に復旧できる。APIは上限をHTTP 429と機械可読codeで返し、Workbenchにも一段・8件・4並行の上限を表示する。

上限はlocal D1 migrationとWorker/API fixtureで検証する。production D1へ適用したことや、外部provider自身の内部再委任を制御することの証拠ではない。

このpoolは**A2A共通上限の内部予約**であり、Rockstar Wallet残高を拘束しない。2026-09-30にprovider署名付きusage receiptのfixture契約と内部予算精算を追加した。A2A Taskの汎用metadata map ([A2A specification](https://github.com/a2aproject/A2A/blob/main/docs/specification.md))にRockstar固有の`org.rockstar.usageReceipt`を載せる。これはA2A標準の課金receiptではなく、Rockstar独自extension契約。信頼済みEd25519 keyで署名を検証する。receiptはowner／parent job／委任／remote task／Agent origin・name・version／currency／予約上限、meter明細合計、pricing versionに束縛される。terminal taskと一致するreceiptだけを受け付け、予約上限以下の実額を`settled_minor`へ一度だけ移し、子reservationの残りcapを返す。親poolの`reserved_minor + settled_minor`は上限内に保たれる。重複は冪等で、別receipt、無効署名、上限超過、未終端taskは精算せず、receiptが欠落・不正のtaskは予約を保持する。本人向けGETは検証済みreceiptをowner-scopedに返す。

2026-10-01 Cloudflare Workers Vitest/local Miniflareで、A2A terminal taskのmetadataから署名receiptをWorkerが取り出し、trusted-key allowlistでEd25519を検証した後にD1へ一度保存・予約精算する縦断ケースを追加した。`npm run sky:a2a:workflow:positive`は3/3。synthetic child cap USD 1.00のうち署名済みreceipt USD 0.37のみをsettledにし、親poolを`reserved=0, settled=37`へ更新、owner/task/provider receipt IDを一致確認した。completed Workflow再起動後に二重send/settleがないこと、応答不明では予約を保ったまま再送しないことも同じsuiteで確認した。これは署名鍵を使うfixtureとCloudflare local D1の試験である。

これは**内部A2A予算のusage-receipt精算**であり、まだnative Rockstar Walletの実残高を予約・引落しせず、実provider invoice／rate cardとの照合もしない。信頼鍵`A2A_TRUSTED_USAGE_KEYS`はRuntime Workerの運営設定で、`providerId`、`keyId`、`agentOrigin`、Ed25519 `publicKeyHex`、`status`を含むJSON配列。provider別sandbox receipt、価格条件の共同受入、native Wallet残高台帳とのsettlement receipt handoff、実額二重計上防止、遠隔停止・deadline強制は未完了。実行gateは引き続きdefault-off。migrationはsourceに存在し、remote D1へ適用していない。

- `node --experimental-strip-types --test tests/a2a-broker-authorization.test.mjs tests/a2a-client.test.mjs tests/a2a-delegation-store.test.mjs tests/a2a-authorization.test.mjs tests/a2a-input-crypto.test.mjs tests/a2a-artifacts.test.mjs tests/a2a-agent-directory.test.mjs`: 36/36成功。client fixture、owner別store、承認digest、本文／成果暗号化、owner境界、Agent Card directory、one-shot send/cancel、短命Broker証明の署名・owner/device/budget/target/期限照合を検証。
- API: `GET/POST /api/sky/a2a-delegations`、`GET/PATCH /api/sky/a2a-delegations/{id}`、`GET /api/sky/a2a-delegations/{id}/artifacts`、`POST /api/sky/a2a-delegations/{id}/broker-authorization`を追加。認証、same-origin、owner境界、body size boundを実装。承認時の依頼本文とProviderから受けたtext resultはserver-sideでdigest照合・暗号化してD1へ保存する。`npm run test:api`: Miniflare Worker/D1統合251 assertions成功。承認本文の差替えを409で拒否し、合成暗号化artifactのowner-only復号取得と他ownerの404を確認。
- `npm run typecheck`, 対象`oxlint`, `npm run build`, `npm run schema:check`, `npm run database:status`成功。A2A関連テスト36件とWorker/D1 API 251 assertionsが成功。承認前Broker proof受渡し、認証・owner分離・改ざん拒否をMiniflareで検査した。`npm run sky:a2a:workflow:test`はlocal Workflow dispatchのproof不在・期限切れ・失効3ケースを検査する。Worker dry-runはbundle構成の検査で、本番Workflow dispatchとは分ける。
- `npm run schema:check`: 43 tables、25 migrations、journal一致。`npm run database:status`: 91 tables、production readback 0/6境界。migrationはsource schemaのみで、remote D1へ未適用。
- `npm run sky:agent-runtime:check`: Worker/Workflow bindingとcron構成をdry-run bundle。
- `npm run sky:a2a:workflow:test`: local Wrangler Workflow/D1 end-to-end 3/3成功。専用一時D1をmigrationし、署名proofなし・期限切れ署名proof・失効済み署名鍵を使う。各ケースでAgent Card discoveryより前に拒否し、D1のone-shot remote-send claimが0件であることを確認する。
- 以前のlocal `wrangler dev` + temp D1 smokeではloopback port 9のAgent Card到達失敗後、D1が`remote_failed / PREFLIGHT_FAILED_BEFORE_SEND`となり外部送信前に終わることを確認した。このsmokeは運営origin allowlistを追加する前の証拠。現在の空listはA2A認可fixture、Worker dry-runの空binding、サイトAPIの認証済みdiscovery 403（外部fetch前）で検証し、旧loopback smokeを最新Runtimeの外向き接続合格に転用しない。
- `services/sky-agent-runtime`の同一production D1・secret設定、production cron稼働、実Provider sandbox dispatch／task poll／cancel／artifact受信は未確認。artifact APIは合成暗号化fixtureのowner境界と復号をMiniflareで検証し、Zema Workbenchに読み取り・停止要求UIを追加したが、Providerから受領した実成果を通す受入は未実施。
- 実Provider、独立SDK実装、cloud worker、Zema連携、外部請求での試験は0件。

## Sky Packageのcloud Agent実行binding

`rockstar-sky-package-runtime-binding/2`は、Providerが署名するAgent Card identity、Package keyとmanifest hash、operation ID、A2A JSON-RPC runtime、Provider-declared runtime extension URI、input/output JSON Schema hash、pricing version、必須usage meters、有効期限を固定する。Ed25519のdomain-separated signatureを検証し、信頼鍵はProvider・key ID・Agent originおよびexact Package key/hash pinへ束縛する。binding有効期間は最大30日。Agent Cardの自己申告だけを実行能力の根拠にしない。

`POST /api/internal/sky-package-runtime-bindings`は運営Bearer tokenで認証後、Provider署名と設定済みtrust keyを確認し、D1の現行審査済みPackage版・manifest hash・Schema hashとの一致を確認してからmigration `0055_sky_package_runtime_bindings.sql`へimmutable保存する。同じbinding IDと同じdigestの再送は冪等。同じIDの異なるdigest、失効済みIDの再登録、署名不正、Package/Schema差異は拒否する。`PATCH`の`{"action":"revoke","bindingId":"..."}`は失効を記録し、active lookupから除外する。DBの署名済みJSONはbinding情報であり、Providerの秘密鍵や利用者データを含めない。

Packageを指定したA2A見積では、現行審査済みPackageのkey・manifest hash・入出力Schema hashを`GetPriceQuote`要求に含め、Provider署名付きbindingが無ければ見積を成立させない。検証したbindingはimmutable registryへ登録し、id/digestをquote responseとWorkbench draftへ返す。Migration `0056_a2a_package_runtime_binding_refs.sql`でdelegation rowにもid/digestを保存し、owner approvalとnative Broker proofのauthorization digestにbinding digestを含める。通常のA2A依頼は従来どおりPackage bindingを要求しない。

設定する項目:

- `SKY_PACKAGE_BINDING_OPERATOR_TOKEN`: 32〜256文字のrandom base64url tokenをWorker secretとして設定する。ログや画面に出さず、運営担当者だけが保持する。
- `SKY_PACKAGE_BINDING_OPERATOR_ID`: 監査記録に残す安全なoperator ID。
- `SKY_PACKAGE_RUNTIME_EXTENSION_URI`: Providerと契約したcanonical HTTPS extension URI。Provider Agent Cardのcapability declaration、署名binding、quote、Worker dispatchで完全一致を要求する。現在のテスト値`https://rockstar.example/...`はfixture専用で、本番設定に使わない。正式なRockstar管理domainとProviderの相互接続受入が揃うまで実行を有効にしない。
- `SKY_PACKAGE_RUNTIME_BINDING_TRUSTED_KEYS`: 下記形式のJSON配列。Provider Ed25519 public keyのみを置く。各鍵はexact Package versionとmanifest hashへpinし、信頼を止める場合は`status: "revoked"`に変更する。Providerから受け取る署名済みbinding、Package審査hash、Agent originを照合してから設定する。

```json
[
  {
    "providerId": "provider-assigned-id",
    "keyId": "provider-key-version",
    "agentOrigin": "https://agent.example.com",
    "publicKeyHex": "64桁のEd25519 public key hex",
    "packagePins": [
      { "packageKey": "publisher.tool@1.2.3", "manifestSha256": "64桁のmanifest hash" }
    ],
    "status": "active"
  }
]
```

Operator token未設定、不正なtrust JSON、未登録鍵はfail closed。key rotationでは新key IDとpublic keyを先に登録する。旧鍵を止めると旧bindingも使えなくなるため、Providerのrotation時刻・稼働job照合を運用記録へ残す。失効後の再登録は別binding IDを使う。ローカル再現は`npm run verify`でschema/migration、署名とAPI認証、冪等保存、Schema一致、失効を検査する。

quote acquisitionからdelegation保存・approval digest・Broker proofまではsourceへ接続済み。Cloud Workflowは外部送信前にactive registry status、署名、最新Agent Card hash、現行審査Package/Schema、quoteのProvider・pricing version・必須meterを再照合し、失効・版変更時はfail closedする。A2A Clientはbindingのextension URIをAgent Cardと一致させ、`A2A-Extensions` header、`message.extensions`および`org.rockstar.sky-package-runtime.v2` invocation metadataを`SendMessage`へ含める。metadataにはbinding id/digest、exact Package/manifest/operation/schema/pricing version、request hashを含める。これはProvider側実装を要するRockstar protocol proposalであり、A2A標準のPackage executorでも、Providerが受理・実行した証明でもない。Package-bound Worker/D1 fixtureでは署名bindingを登録・委任へ固定した後に失効させ、WorkflowがAgent Card取得・remote sendより前に拒否し、remote-send claimが0件のままであることを確認した。これは失効拒否のローカル受入であり、有効Packageの成功実行やProvider executorの受入ではない。bound operationを実際に呼び出し、input/output schemaを検証し、Provider署名済み実行receiptを返すexecutorは未実装。Cloudflare本番D1へのmigration、production secrets、Provider鍵custody、実Provider quote/execution、production billing、SIM activation、device/OS acceptanceは証拠なし。local fixtureはこれらの本番証拠ではない。


### Package-bound positive dispatch local acceptance (2026-10-02)

`npm run sky:a2a:workflow:positive` passed 12/12 Cloudflare Worker/D1/Workflow tests. The positive Package case uses a controlled service-binding Provider fixture (not an external Provider): it registers and verifies a signed runtime binding, pins the binding digest into the approved delegation, discovers and preserves the Agent Card extension declaration across durable Workflow steps, sends the exact binding and request digest, receives a completed task/artifact and synthetic signed usage receipt, verifies the receipt, and settles the local logical budget. The fixture also asserts the extension URI in `A2A-Extensions`, `message.extensions`, and `org.rockstar.sky-package-runtime.v2` metadata. This is local source/fixture evidence only; it does not establish external Provider implementation, interoperability, production egress, invoice issuance, carrier activation, or funded Wallet settlement.


### Sequential handoff between two independent local agents (2026-10-02)

`tests/a2a-client.test.mjs` runs an independent Node HTTP agent and Python stdlib HTTP agent. After the Node result is read, the test obtains a distinct authorization intent for the Python endpoint and dispatches a second task with the reviewed first output explicitly delimited as untrusted input. It checks different origins, separate message IDs, exact per-stage SHA-256 authorization digests, `SUBMITTED → COMPLETED` progress on the Python agent, and result retrieval. The next task is not sent automatically from the prior Agent output. `node --test tests/a2a-client.test.mjs` passes 10/10 with loopback permission. This establishes a local protocol handoff between two implementations only; parent-job atomic budget reservation, Cloud D1 durability across both tasks, provider contracts and device UI remain separate acceptance items.
