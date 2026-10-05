# Sky Cloud — 端末切断中の継続実行

2026-09-30、利用者は「クラウドのAIは、先に頼まれた仕事を続ける」を採用し、その準備を指示した。本書は開発の必須契約・受入条件。A2A 1.0 dispatch／reconciliation／one-shot cancel とlocal Cloudflare Workflow fixturesは一部実装済み。**これはクラウド本番配備、実LLM、契約Provider上の停止・課金受け入れを示さない。**

制御プレーン候補と公式料金の同条件比較、実行sandboxの候補、契約前質問は[Cloud agent provider comparison](cloud-agent-provider-comparison-20261001.md)を参照。比較表は2026-10-02に公式料金・制限を再確認した公開料金で、契約見積・LLM料金・本番確定額ではない。Durable Workflowの30日default retention、1 MiB step/event境界、Cloudflare Containersのregional egress、AgentCore V2のregion/8-hour session上限を反映した。Rockstarのdurable job ledgerを実行sandboxの一時sessionやWorkflow retentionで置き換えない。

主担当はSky / MCPのROCK、既存SKY07に関連する。既存のSky Package、Zema、Broker、Walletの契約を再利用する。eSIMは接続と導入の入口で、クラウドのジョブ所有者は認証済みアカウント。eSIM交換・端末変更・複数端末で仕事や費用を重複させない。

2026-10-02の現行製品方針では、物理SIM/eSIM購入がRockstarOS service accessの入口であり、OS binaryやLLMをSIMへ保存する要件ではない。端末上のSky/Zema/Agentは一つのRockstar identityを共有し、回線プラン料金とcloud AI/agent/compute料金を別明細にする。直接Cloud LLMのWorkbenchは署名rate-cardからmodel単位単価、rate source/pricing version、依頼別最大見積、本人指定cap、予約額、完了後のitemized usageを表示する。直接Cloud LLMは有料dispatch gateがfalseの間は送信しない。追加実装ではResponses streamingの出力byteから入力token上限を使った暫定金額を計算し、Cloud D1へ定期保存してWorkbenchとAndroid Shellへ配信する。これはprovider-reported usageではなく、byte/3のtoken proxyを含む概算で、請求額・確定meterには使わない。確定明細はstream終端後のProvider response usageだけで算定し、不明なら上限予約を保持する。A2Aのlive meter表示はProvider署名callbackで受けた暫定usageで、invoice照合前である。A2AのProvider単価/依頼別quoteは未接続なので、その経路も有料実行を無効にする。直接LLMのsigned rate-card/estimate API、quote store、承認/予約/queue source、stream estimate、単価・itemized usage表示、A2A署名meter/receiptのUIは実装しローカルfixtureを検証済み。production pricing/dispatch/meter/invoice, funded Wallet debit, carrier billing and device acceptance remain unproven. 実行中meterを提供しないProviderでは予約上限を実費として表示しない。

## 実装・検証・本番受入の区分

- 実装済みsource: channel-neutral entitlement claim、owner-scoped account/device session、capability-based OS/client/browser route、Cloud A2A durable job/recovery、signed rate-card verification、request-bound quote、budget reservation、approved-input persistence、Zema progress/result/usage screens.
- ローカル検証済み: Worker/D1/Workflow recovery and no-replay fixtures, signed quote/rate-card/meter tests, local API/D1 assertions, full repository verification as recorded in [Product / UX workstream](workstreams/01-product-ux.md).
- 外部受入待ち: carrier/retailer purchase linkage and activation, production cloud durability and provider task reconciliation, live price/meter/invoice and funded Wallet settlement, Android SDK/APK/device acceptance, exact-SKU RockstarOS installation and recovery.

Local tests and synthetic usage records are not production billing, actual carrier activation, or successful OS installation evidence.

2026-10-02 satellite continuity boundary: KDDI's current au Starlink Direct path requires an eligible plan/SIM/eSIM, exact supported handset and permitted app traffic; it is not assumed to provide generic Internet access to the Rockstar cloud. Normal voice calls and 110/118/119 voice calls remain unsupported. A separate, domestic-only SOS message relay exists through approved apps and an SOS center; it is not a Rockstar safety integration or rescue guarantee. Android satellite data use requires Android 16+ and an app opt-in/low-bandwidth UX path; Rockstar has not received app approval and must not enable the opt-in until constrained-link behavior is implemented and tested. See [current satellite/provider evidence](provider-contract-readiness-20260930.md#衛星通信-日本のmvpは既存キャリアのdirect-to-cell連携) and [source snapshot](evidence/satellite-connectivity-research-20261002.json).

## 利用体験

接続中に「この作業を、指定した上限まで、端末が圏外でも続ける」と依頼する。クラウド受付を確認した後は、端末を閉じても、圏外になっても、その範囲内で処理を続ける。再接続すると途中経過、成果、使用量を取得し、同じ仕事として再開する。

携帯が切断中に新しい指示・停止・承認をクラウドへ届けることはできない。クラウド自体と必要なProviderに通信経路があることが前提。端末内AIの仕事とは独立し、再接続時に差分を照合する。端末内処理で代替した仕事をクラウドにも自動投入しない。

## 受付時に固定する契約

- 認証済みowner、job ID、一意な要求キー、入力と指示のhash、元のZema仕事ID。
- 明示された`continueWhileDeviceOffline`、承認ID、承認時刻、有効期限。設定をLLMの推測やeSIM開通から付与しない。
- 圏外継続許可は既定false。Zema画面で本人が明示的に選んだ場合だけCloud A2A委任を作成し、承認digest・Broker proof・Wallet予約・実行前検査へ固定する。未選択・古いrecord・改変proofは外部送信前に拒否する。
- Tool / agent / model / MCPのID、版、必要なhash、送信先、許可されたデータ範囲・操作。
- 通貨と単価版、合計予算上限、実行期限、最大手順数、最大model token、再試行回数、同時実行数。
- 外部書込み等に必要な個別承認。新たな権限・費用増・未知の送信先は自動承認しない。
- 停止に要する費用の予約、クラウドやモデル側で強制できる制限と、その限界。

クラウド側の永続保存後に受付receiptを返す。receiptは完了ではない。受付応答が失われたら、同じownerと要求キーでstatusを照合する。同じキーで入力hashが違う要求は拒否する。結果不明を新しいキーで再投入しない。

## 制御と保存

1. 受付・認可・予算予約・ジョブ状態を、端末接続とは独立したクラウドcontrollerに保存する。ブラウザや携帯プロセスをschedulerにしない。
2. エージェントはworkerで実行する。生成コードは別の隔離環境で動かし、モデルや第三者Toolへ包括的な認証情報を渡さない。
3. LLM/API/MCPの各手順の前に、認可の有効性、deadline、予算予約、停止要求、必要な承認を再確認する。並列子エージェントは親の共通予算から原子的に予約する。
4. 指示、作業状態、結果のhash、実行先ID、費用予約、観測した利用量、確定した利用量を永続化する。請求確定は別状態とする。
5. 未実行のqueuedは復旧可能。dispatch後に結果不明となった処理はindeterminateとし、Provider照合まで再実行しない。古いworkerの遅延完了と新workerの競合を防ぐ。
6. 権限の追加や承認が必要ならawaiting_approvalで待機し、待機中の計算資源を停止・休止する。単にLLMループを回し続けない。追加承認の対象を本人が確認してから再開する。

`systems/rock-star-os/os/runner/README.md`にあるowner/key/request hash、受付receipt、queued復旧、indeterminateの再送禁止を継承する。ただし既存runnerは有限recipe向けで、汎用LLMクラウド実行器とは扱わない。WebのZema仕事は`lib/workflow.ts`の業務状態を維持し、worker成功を本人確認済みcompletedへ直接置き換えない。

## 停止・制限と費用

- 端末内の停止要求は、未送信、クラウド受領済み、worker停止確認済みを区別する。
- queuedへの停止はdispatchを禁止する。runningへの停止はキャンセル意思を先に永続化し、新規手順を禁止し、実行adapterへ停止を要求する。
- 実行中の通信や隔離環境を停止するためのadapterと期限を用意する。DBの状態名を書き換えただけでは停止成功としない。
- 端末が圏外のままでもdeadlineと予約済み費用で自律停止できるようにする。Providerが応答しない場合は停止未確認・照合待ちを保持する。
- 「画面を閉じた」「端末が圏外」「停止を送った」「workerが止まった」「利用量が確定した」「請求が確定した」を別々に扱う。
- リアルタイム上限は自前の予約台帳とProvider制限で制御する。遅延する請求集計を上限判定の唯一の根拠にしない。既存Walletの予約・照合方式を再利用する。
- 通信費、LLM API費、cloud compute費、作者料金を分ける。架空の単価で実請求しない。停止後にも残る保存費等を明示する。

## 再接続と画面

再接続はまずstatus・receipt・差分の取得を行い、submitを繰り返さない。端末に保存した古い状態をクラウドの正本へ上書きしない。結果と入力revisionを照合し、ローカルで変更した原稿等と衝突する場合は両方を保持して解決する。外部送信・決済等はオフラインoutboxから無条件に再生しない。

画面には「クラウド受付確認済み」「最後に確認した時刻」「圏外のため最新状態は未確認」「追加承認待ち」「停止未確認」「停止確認済み」「使用量照合中」を区別して表示する。切断中は最終観測状態を示し、現在も実行中だと断定しない。

## Android Broker端末鍵の登録境界

Cloud APIの`/api/rockstar/broker-devices`は、ログイン済みownerに限定したchallenge発行、端末attestation verifierを通したP-256公開鍵の登録、owner別登録一覧、鍵失効を実装している。challengeはdeviceRef・nonce・有効期限へ結び、owner外からの登録とchallenge再利用を拒否する。登録一覧は公開鍵の生データを返さず、失効鍵はA2A trust resolverで認証に使えない。端末鍵は以後のBroker proofとWallet handoffの署名に使う設計で、Wallet決済権やCloud jobの広い権限を鍵登録だけで付与しない。

2026-10-02の`npm run test:api`はビルド済みWorker routeとローカルD1を用い、認証・Origin拒否・owner分離・challenge expiry shape・attestation binding・一回性・一覧・失効を含む914 assertionsを通過した。attestation verifierは合成fixtureで、これはAPI契約とローカルD1動作の検査である。Shell AIDL v11とBroker sourceは、ログイン済みownerのP-256 enrollment・失効・既存reservationのreceipt同期まで接続し、未承認jobのdispatch口は追加しない。Android SDK/APK/Binder/実機で未compile・未受入であり、Provider receipt trust keysetはアプリへまだ設定されず、approved Cloud A2A quoteから端末Wallet holdを作る経路もないため、Wallet同期はtrust不在で必ずfail-closedする。合成verifier試験を実機信頼・本番認証・本番billingの証拠に数えない。

## 必須受入シナリオ（未実行）

1. 接続中に受付receiptを受け取り、端末を機内モード／アプリ終了にする。クラウド側で仕事が進み、再接続後に同じjob IDの成果が戻る。
2. 受付応答だけを落とす。同じキーで照合し、実行・予算予約が一回だけになる。
3. 別owner・別端末からの越境取得、停止、再開を拒否する。正当な同一ownerの複数端末では仕事を共有できる。
4. 接続中の停止と圏外中の停止を分けて試験する。圏外中には「停止済み」と表示しない。
5. 圏外のまま予算・時間・token・手順上限へ達する。新規処理の停止とProvider側の実停止／照合を確認する。
6. 複数子エージェントが同時に予約し、親の上限を二重使用しない。予測より実費が大きい場合も証拠を捨てず照合する。
7. 追加承認が必要な操作は待機する。待機中に計算が無制限継続しない。
8. controller/workerを再起動し、保存状態から復旧する。dispatch後の結果不明は自動再実行しない。2026-10-01にローカルWrangler/Workerdプロセス終了後、同じlocal D1からprepared jobをscheduled scannerが決定的IDで再開し、proof拒否で送信前停止する部分fixtureは合格。Cloudflare本番controller/worker再起動、外部task照合とcancelは未受入。
9. 停止と完了、古いworkerと新worker、利用量通知の重複／順序逆転が競合しても、外部処理と費用を二重計上しない。
10. 端末内で同じ文書を編集して再接続する。クラウド成果で勝手に上書きせず、revision衝突を扱う。
11. 回線・eSIMを交換しても、アカウントに結びついた受付済みの仕事と予算が重複しない。
12. ログ・保存物・エラーにeSIM設定コード、API key、アクセストークンが混入しない。

host fixture、Provider sandbox、実際のcloud worker、実機を別々に記録する。既存eSIM試験15件をこれらの合格数へ算入しない。

### ローカル証拠の対応表（全体受け入れ数には算入しない）

12件の「必須受入シナリオ」はCloudflare本番、契約Provider、端末再接続まで含む縦断試験である。下表は既存のhost / local D1 / local Workflowがどの部品を確認しているかを示す。部分カバレッジはシナリオ合格ではなく、`acceptanceScenariosExecuted` はこの表を追加しても 0 のまま。

| # | 部品レベルの証拠 | まだシナリオ全体を受け入れていない範囲 |
|---|---|---|
| 1 owner・端末分離 | `tests/a2a-delegation-store.test.mjs`, `scripts/check-work-api.mjs` | 実Broker端末、複数の実認証主体、切断中の操作・表示 |
| 2 受付応答消失・同一要求復旧 | `tests/a2a-delegation-recovery.test.mjs`, `services/sky-agent-runtime/test/a2a-workflow.positive.test.mjs` | 本番D1と実Providerの応答消失後のrequest-reference照合 |
| 3 remote受理後の応答不明・再送禁止 | `services/sky-agent-runtime/test/a2a-workflow.positive.test.mjs`, `tests/a2a-client.test.mjs` | Provider task IDが未取得のときのProvider固有照会・最終結果 |
| 4 接続中／圏外の停止表示 | `tests/a2a-delegation-store.test.mjs`, `tests/a2a-client.test.mjs`, `services/sky-agent-runtime/test/a2a-workflow.positive.test.mjs` | 実端末の切断中UI、契約Providerでの取消受付・実停止確認 |
| 5 予算・期限・利用上限 | `tests/a2a-authorization.test.mjs`, `systems/rock-star-os/tests/test_spend_runtime.py` | Provider実メーター、強制停止の実遅延・最終料金 |
| 6 並列子taskの共通予算予約 | `tests/a2a-authorization.test.mjs`, `tests/a2a-delegation-store.test.mjs` | 複数の本番workerと funded Wallet を用いた同時負荷 |
| 7 追加承認と待機 | `tests/a2a-authorization.test.mjs`, `services/sky-agent-runtime/test/a2a-workflow.positive.test.mjs` | 実Provider呼出しの前後での承認停止・再開と待機費用 |
| 8 controller／worker再起動 | `docs/evidence/sky-a2a-workflow-local-20260930.json` | 本番永続化、dispatch途中のprocess loss、Provider task照合 |
| 9 停止・完了・利用量の競合 | `tests/a2a-usage-receipt.test.mjs`, `tests/a2a-delegation-store.test.mjs`, `services/sky-agent-runtime/test/a2a-workflow.positive.test.mjs` | 実worker競合と遅延・重複Provider receiptの運用負荷 |
| 10 端末内編集との競合 | 既存Zema/Coreのrevision・保存試験 | cloud成果と同一文書のnative編集を再接続時にマージする縦断実装・受入 |
| 11 eSIM交換後の同一job・予算 | `tests/a2a-delegation-store.test.mjs`, `tests/esim-bootstrap.test.mjs` | eSIM実発行・別回線への切替をまたぐ実端末同期 |
| 12 秘密情報の非混入 | `tests/a2a-input-crypto.test.mjs`, `tests/a2a-artifacts.test.mjs`, `tests/esim-install-material.test.mjs` | production observability、実Provider error、実端末diagnostic全経路 |

この表の「部品レベルの証拠」は出荷判定には使えない。特に 3、8、10、11 はProvider照会、production recovery、native文書競合、実eSIM切替を含む実装／統合が残っている。契約後はsandbox、production相当のcloud、代表実機の各列へ独立した証拠を追加してから全体受け入れ数を更新する。

## 次の実装と契約準備

Cloud入口では同じowner/job/quote/cap/deadlineを端末Wallet hold・approval digest・P-256 Broker proof・offline-continuation consent・最終Cloud承認へ結ぶsourceを接続済み。Shell API v16は明示送信、同じdelegation IDの結果不明readback、INDETERMINATE hold保持、受理readback後のWallet DISPATCHED同期を実装し、Home/detailはforeground bounded pollingと再接続readbackで状態・meter・receipt・artifactを表示する。これらはlocal source/fixtureまでで、Cloud A2A execution flagは閉じており、provider dispatch・production履行を意味しない。次はJDK/Android SDK CIでCore JUnit、AIDL/APK、Broker/Shell instrumentationを通し、一つの管理Agent fixtureによるquote→hold→offline consent→approval→device disconnection→same-job result recoveryを受入する。Provider trust inventory未設定の`RockApplication`がWallet settlementを拒否する境界は維持する。実Provider task ID照会/cancel、signed usage receipt、meter/invoice/funded Walletを契約sandboxで受入する。

供給元候補・公開価格/制限・契約質問は[Provider contract readiness](provider-contract-readiness-20260930.md)に記録する。Cloudflareは既存D1/Workflow sourceとdurable controllerに使い、heavy inference/任意コードの実行は隔離した別runtime候補とする。価格は公開単価であり利用見積ではない。

現時点で新しいクラウド契約・配備・API呼出し・請求はない。契約前の実装・試験準備を進め、未契約を理由に独立した作業を止めない。実費が発生する契約・実行は、その対象・費用の確認後に行う。

2026-10-01 restart checkpoint: `npm run sky:a2a:workflow:test` starts a local Wrangler/Workerd process with `A2A_DELEGATION_EXECUTION_ENABLED=false`, triggers the documented `/cdn-cgi/local/scheduled` endpoint, and proves three prepared D1 rows remain queued with zero send claims. It terminates that process, starts a new process against the same `--persist-to` directory with execution enabled, triggers the scheduled controller, and observes each deterministic Workflow fail closed before Agent discovery because its Broker proof is missing, expired, or revoked. D1 records three `PREFLIGHT_FAILED_BEFORE_SEND` states and zero remote send claims. This proves local prepared-job recovery across an actual Wrangler/Workerd process restart; it does not prove Cloudflare production state durability or remote task reconciliation after an accepted-but-unanswered request. Cloudflare's [Wrangler scheduled-event test endpoint](https://developers.cloudflare.com/workers/wrangler/commands/workers/) is used only on localhost.

2026-10-01 explicit offline-continuation authorization: Zema's A2A form now defaults the checkbox off and shows the online-control limitation. Cloud delegation creation requires `continueWhileDeviceOffline: true`; D1 stores the choice, idempotency binds it, Broker proof schema was advanced to `/2` and its Ed25519 payload binds the choice, and native Wallet proof checks and Worker preflight require true. Legacy rows migrate to false and cannot dispatch. A validly signed false-consent row stops before Agent discovery/send claim and releases its synthetic reservation. A2A fixtures 44/44, Cloudflare Workflow cases 3/3, Python Broker 33/33, Spend 17/17, and API Worker/D1 291 assertions pass. This closes the consent field's local authorization path; it does not prove real device presence, production deployment, or end-to-end offline service acceptance.

2026-10-01 lost-acceptance-response recovery: after a POST response is ambiguous, Zema now queries with the same parent job ID, idempotency key, and SHA-256 of the exact request text. The API returns only an owner-scoped matching row; a wrong input hash, parent, or owner yields no row. UI recovery checks that the returned ID, target, budget, deadline, consent, and hashes exactly match the retained request before presenting the existing approval digest. It does not create a new request key or submit again. Store and request-matching recovery tests pass; the full A2A host suite is 46/46, and Worker/D1 API integration passes 301 assertions. Provider-accepted remote-task reconciliation remains a separate unverified step.

2026-10-01 positive Workflow acceptance re-run: `npm run sky:a2a:workflow:positive` passes 4/4 under Cloudflare Workers Vitest/local Miniflare. The cases cover one authorized A2A send with encrypted result persistence and owner-scoped decryption, submitted→working→completed reconciliation with a signed usage receipt, fail-closed refusal without offline-continuation consent, and an ambiguous accepted-send response held as `indeterminate` without retry after Workflow restart while its synthetic budget reservation remains held. The first case restarts a completed Workflow and confirms no second send claim; the fourth restarts an errored Workflow and confirms its one existing claim is retained. This is local controlled fixture evidence only; the remote fixture deliberately simulates a lost response and does not return a real provider task identifier, so remote task lookup/cancel, production durability, and funded Wallet behavior remain unverified.

2026-10-01 active-task Workflow restart recovery: the same `npm run sky:a2a:workflow:positive` suite now restarts the durable reconciliation Workflow after it has persisted `TASK_STATE_WORKING` and a remote task ID. On restart it reconciles that same task to completion, captures the encrypted artifact, settles only the signed fixture usage, and retains exactly one remote-send claim. The suite passes 4/4; [evidence](evidence/a2a-active-task-workflow-restart-20261001.json). Miniflare emits engine-abort diagnostics for explicit restart and deliberate non-retryable fixtures even though Vitest exits 0. This verifies a local durable-workflow checkpoint restart, not process loss mid-activity, Cloudflare production durability, or an external provider's task lookup/cancel contract.

2026-10-01 device Wallet settlement handoff: `GET /api/sky/a2a-delegations/{id}/wallet-settlement` now returns an owner-authenticated, read-only `rock-a2a-wallet-settlement-handoff/1` only after the remote task is terminal, the Cloud D1 child reservation is settled to the stored receipt amount, and the Provider's Ed25519 usage signature and all job/agent bindings verify again. It returns the exact native `a2a.budget.settle` command with a deterministic idempotency key, receipt hash, and reservation binding. The native Wallet must still independently verify the same Provider receipt and settle the exact local held funds; repeated handoff reads do not mutate either ledger. `npm run typecheck`, production `npm run build`, and `npm run test:api` pass; Worker/D1 API suite reports 404 assertions, including unauthenticated/foreign-owner rejection, unsettled-state rejection, successful signed handoff, and stable repeated key. This does not wire the Android Gateway to fetch and apply the handoff, prove a funded Wallet, or accept production/provider keys. The Wallet integration seam is now explicit and testable, but funded end-to-end settlement remains unaccepted.

2026-10-01 Cloud-to-Python Wallet contract test: `scripts/check-work-api.mjs` now passes its API-generated handoff object to an isolated RockstarOS Python `ValueSpendRuntime`/`Wallet` through `systems/rock-star-os/scripts/accept-cloud-wallet-handoff.py`. The Python side verifies the exact Ed25519 receipt against the per-run fixture trust key, reserves the matching owner/job/currency/cap/authorization/deadline, settles 37 synthetic minor units, releases the remaining 213, and returns the same result for the repeated idempotency key. The Worker/D1 API suite passes 410 assertions. Evidence: `docs/evidence/a2a-cloud-python-wallet-handoff-20261001.json`. This closes a local cross-runtime serialization and settlement test only; it does not connect the Android Broker/Gateway, reconcile the independent Cloud D1 pool with a funded production Wallet, or prove Provider/device/offline acceptance.

2026-10-01 SIM/eSIM product direction and device handoff update: the primary offer is now SIM/eSIM-led RockstarOS service access with one Rockstar identity and included access to Sky/Zema/agents; the OS binary is not stored on the SIM. The native Wallet path also now has a device-key-authenticated `POST /api/sky/a2a-delegations/{id}/wallet-settlement`. It requires an active operator-trusted owner/device/key tuple, the matching stored Broker authorization, and offline-continuation approval, then returns the same provider-verified, already-settled, read-only command as the owner-session `GET`. `node --test tests/a2a-wallet-handoff-auth.test.mjs` passes 3/3; Worker/D1 API suite passes 433 assertions. This is local fixture/API-boundary evidence only: it does not connect an Android caller, prove a funded Wallet, or accept production provider/offline service.

2026-10-02 device readback and direct-text pricing update: Android Shell source reads owner-only service home, LLM itemized result/rate detail and A2A state/meter/artifacts using its protected Rockstar session; its native LLM composer creates a signed-rate quote with a user cap and requires a second explicit consent. Public records omit prompt and trust-key data; the current hard price gate remains false. No Provider call is possible in this state.

2026-10-02 native same-job recovery after app restart: Android Agent detail now offers an explicit read-only Cloud/Wallet reconciliation by the existing delegation ID. Before changing local Wallet state, Broker rebuilds the exact v2 native Wallet reservation payload digest from owner/delegation/parent IDs, agent identity, currency, pricing version, input hash, quote hash, child/parent caps, quote issue time and deadline, then compares it with the durable owner-scoped reservation. It also uses the authenticated owner session to read the Cloud task and applies only supported Cloud states. Missing or mismatched reservations remain held and are reported as unknown; no task is resubmitted. If Cloud authoritatively reports `expired` or `cancelled_before_dispatch` and the exact local hold still matches, the user may separately request release; Broker rechecks both records before releasing. The binding contract was moved into Android-independent Core with JUnit cases for absent/foreign holds, changed terms, invalid digest and non-active Wallet states. The JUnit source is authored but not run because this host lacks Java/Gradle; Node source-contract and Cloud no-replay tests pass. Android APK/Binder/device acceptance remains open, and this path has not been shown to recover a production Wallet or Provider charge.

2026-10-02 durable direct-text queue source: the remote OpenAI branch of `/api/llm/text` now revalidates the approved quote/input, encrypts prompt material with an owner/execution-bound AES-GCM envelope, stores it in `remote_ai_text_inputs`, and returns an accepted-job response without waiting for inference. The saved reservation has a fixed 24-hour maximum execution window after quote expiry; a queued approved job remains eligible beyond the short quote-approval window, while the current signed rate card, owner scope, parent job, reservation and deadline are checked again before send. The Sky Agent Runtime scheduled controller scans only reserved rows with saved input and uses deterministic `llm-{executionId}` Workflow IDs. `RemoteAiTextWorkflow` rechecks entitlement, decryption binding and current signed rate card, uses the existing shared parent-budget reservation, and claims a unique immutable provider-send row before making the provider request. Callback replay or ambiguous provider outcomes do not automatically resend; completed or uncertain terminal paths delete the encrypted prompt. Quote/status APIs and Android Shell distinguish `queued`, `running_or_reconciling`, `completed`, and reconciliation-required states; acceptance returns the fixed deadline. During execution the public record explicitly shows confirmed current charge as unknown and the maximum amount still reserved; it does not invent a live Provider meter. After a priced response it shows the itemized calculated charge, separate from invoice settlement. Migration 0047 and schema definitions are present. This is source implementation, not proven cloud durability: TypeScript, encryption/store tests, database schema checks and diff checks pass, while Cloudflare Workflow/Vitest and API/D1 acceptance could not start because localhost binding returned `listen EPERM`. Provider pricing acceptance is hard-disabled; provider metering/invoice reconciliation, Worker deployment/secrets, production queue durability and Android SDK/device acceptance remain outstanding.

2026-09-30 実装checkpoint：owner承認後の依頼本文をAES-256-GCMで暗号化してD1へ保存し、`services/sky-agent-runtime`にCloudflare Workflows、minutely prepared-task scanner、期限切れ本文cleanupを実装した。Workflowはdispatch marker前の失敗を`remote_failed`、marker後の結果不明を`indeterminate`へ分け、後者を自動再送しない。task status照合と一回cancel markerも実装し、terminal taskのtext artifactはowner/task/hashへ結び付けて暗号化保存し、成果capture前のtaskは再照合対象へ残す。owner-scoped artifact取得APIを追加した。これらの新しい成果経路はhost fixtureとtypecheck段階で、Provider result実受信は未試験。dry-runとisolated local D1/Workflowでは、cron手動起動→決定的Workflow instance作成→loopback targetの発見失敗→D1のpreflight failure記録を確認した。外部Provider送信はゼロ。Workflow bindingとstep retryの公式設定を参照：[Build your first Workflow](https://developers.cloudflare.com/workflows/get-started/guide/)、[Sleeping and retrying](https://developers.cloudflare.com/workflows/build/sleeping-and-retrying/)。

このcheckpointは本番cloud継続を意味しない。runtime Workerがshared production D1・同一暗号secretへ未接続で、remote Agent Cardの実取得、A2A `message/send`成功、Providerでのtask polling／cancel結果／artifact受入、native Broker照合、Wallet使用量予約・照合、圏外実機受入も未実施。残る必須12シナリオを通すまでは完了表示しない。

## ローカル受入の再検証 — 2026-10-02

以前loopback `EPERM`で起動できなかった試験を、今回ターン限定の隔離ローカルlistener権限で再実行した。`npm run test:api`は862 Worker/D1 assertions、`npm run sky:a2a:workflow:positive`は10 Workflow tests、暗号化入力・store・公開record・A2A clientのfocused testsは23件、`npm run typecheck`は成功。A2A試験は管理されたagent fixtureのみで、Remote AI Workflow試験は現在のhard pricing gateが閉じた時に`execution_disabled`となり、send claimが0件であることだけを確認する。APIハーネスは承認済みのsynthetic promptを暗号化してからcoordinatorを直接呼ぶ形へ更新した。追加で、キュー取消が成立した時に暗号化済みpromptを即時削除するよう修正し、再度の取消要求も安全に復旧することをテストした。

この結果はローカルsource/D1/Workflow fixtureの検証である。Remote AIの公開paid execution gateは依然falseで、Remote AI Workflowの成功dispatch、外部Provider通信、Cloudflare本番durability、Provider invoice照合、実Wallet請求、carrier activation/fulfillment、Android APK/Binder、OS installationは未検証。詳細は[受入記録](evidence/remote-ai-cloud-workflow-local-20261002.json)。

## 衛星通信への拡張方針

2026-10-01の公式資料調査では、RockstarOSのMVPは自社衛星網の構築ではなく、携帯事業者direct-to-cellの対応端末・回線・アプリ制度へ接続できるか調べる。日本の具体候補はKDDI au Starlink Direct。au以外向けにもeSIMの専用プランがあるが、一般向け利用契約であり、自動発行API・Rockstar再販権・卸条件が公開資料で確認できたわけではない。[KDDI 専用プラン](https://www.au.com/mobile/service/starlink-direct/exclusive-plan-plus/) · [KDDI開発者案内](https://starlink-direct-support.au.com/TOP.html)

これは通常の主データeSIMとは別のcapabilityとしてモデル化する。通常eSIMがデータ通信できても、端末modem、OS/API、契約、キャリア網、アプリ承認が揃わなければdirect-to-cellは使えない。KDDIの開発者案内はPixel 10のシミュレーション試験掲載を示すが、RockstarOSのGL066実機適合や衛星フィールド受入を証明しない。実装にはprovider/network adapter、対応SKU・OS情報、地上/衛星/オフラインの状態遷移、アプリ許可、低帯域向けqueueが必要。一般Capability Registryとこのadapterは未実装。

Androidアプリを衛星モードへ載せるには、対応端末・利用可能なSIM/eSIMプランに加え、アプリ本体が衛星向けに最適化済みとmanifestで宣言する必要がある。Android公式は制約付き衛星回線を既定ではアプリに使わせず、`PROPERTY_SATELLITE_DATA_OPTIMIZED`のopt-in後にのみ利用可能にする設計を示す。これはOS全体の切替やRockstarOS化ではなく、対象アプリが低帯域を受け入れる宣言である。重い画像・モデル取得・動画・常時同期は抑制し、queue、状態表示、再試行、結果要約を実装・検証してからmanifestを有効化する。[Android constrained satellite networks](https://developer.android.com/develop/connectivity/satellite/constrained-networks?hl=ja)

KDDIの公開開発者フローではアプリ掲載と検証代行は申込制で、掲載・検証の受付は実施保証ではなく、別契約やNDAが必要となる場合がある。掲載基準にはアプリ提供開始から6か月経過が明記されている。疑似環境は遅延・帯域・切断復帰を模擬できる一方、衛星固有の電波特性は再現しない。Pixel 10は疑似検証の実績機種として掲載されるが、端末SKUのRockstar適合や実地接続を証明しない。したがって開発順は、(1) オフライン時の端末内機能とjob queue、(2) 低帯域モード実装、(3) manifest opt-inを試験ビルドで評価、(4) 正確なKDDI対応SKUで疑似試験、(5) 契約・審査後の実地試験とする。KDDIとの照会・申込・契約は未実施。[KDDI開発者ポータル](https://starlink-direct-support.au.com/TOP.html)

圏外継続cloud jobとの接点は接続手段の切替であり、衛星回線自体がLLMを動かすわけではない。すでに受理済みcloud jobはcloud側で継続し、端末が衛星等へ再接続した際に、同じjob IDに対して短い進捗・cancel・結果要約を同期する。衛星がSMS/RCS/許可アプリ等の制限通信しか使えない場合はその許可経路に限定し、大きなartifact・model downloadをqueueから外す。接続/圏外を認証や実行許可の証明にしない。

接続モードは「地上携帯/データ」「direct-to-cell」「専用衛星端末経由」「完全オフライン」を区別し、端末能力snapshotは期限付き・出所付きにする。実際の圏外判定や端末許可はprovider/OEM APIから取得し、eSIMの存在や電波アイコンから推定しない。KDDI公開サービスの空の見通し・対応機種・地域/混雑制限、非対応通話・緊急番号等をユーザー向け提供条件に反映する。料金も一般eSIM data bundleから独立して表示し、契約/請求者が定まるまで購入・有効化しない。

RockstarOSの接続経路が地上回線から衛星に変わっても、受付済みjob IDと本人・予算を維持する。短い指示・停止要求・進捗・結果要約の優先転送を設計し、限られた回線で大容量モデルを無条件に取得しない。全ての回線を失っても、端末内AIと受付済みcloud作業の独立継続を維持する。

「どこでも」は目標であり、地下・屋内・遮蔽・提供地域外・混雑時まで保証しない。MVPでは既存事業者連携/専用端末/自社衛星を比較し、後者は対象地域・可用性・速度・同時利用者・端末・予算、周波数認可/国際調整、衛星・地上局・携帯網、製造/打上げ/運用を別々に実現性評価する。ITU非静止衛星の手続きは主管庁による申請・周波数/軌道調整を伴う。[ITU non-GSO procedures](https://www.itu.int/en/ITU-R/space/support/nonGSO/Pages/default.aspx) 独自衛星の技術・規制・資金feasibility、製造・打上げ・無線送信・運用契約、実接続は未実施。外部事業者の技術実証はRockstarの受入証拠ではない。

既存の[衛星通信設計](avocado-mini-mini200-e1/game-first-life-connectivity.md)とrocketstar原本を参照するが、旧ハードウェア形状・打上げ能力・通信payload受入を継承しない。技術的参考は[AST SpaceMobile](https://ast-science.com/how-it-works/)と[Starlinkの直接通信説明](https://starlink.com/public-files/DIRECT_TO_CELL_FIRST_TEXT_UPDATE.pdf)。他社の技術実証はRockstarの受入証拠ではない。
