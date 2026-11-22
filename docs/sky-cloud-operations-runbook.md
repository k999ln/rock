# Sky cloud execution operations and recovery runbook

Status: operator procedure for local preparation and future contracted acceptance. Service-entry wording reconciled on 2026-10-13 with the confirmed 2026-10-10 account policy; older execution evidence below remains a historical snapshot. This is not authorization to deploy production execution or billing. The runtime currently has no accepted production provider contract, production D1 readback, funded Wallet path, or device acceptance.

## Service boundary

A free account is the service entry; a SIM/eSIM is optional connectivity, not a prerequisite for using RockstarOS, Sky or Zema. Carrier activation, account/service entitlement, RockstarOS/client installation, cloud task acceptance, LLM/provider execution, metering, and settlement are separate states. A paid task may run after a device disconnects only after the cloud has durably accepted the exact request, saved its authorization and budget reservation, and returned the same job ID. An unsent draft does not run offline. A local usage record is not an invoice or payment.

The Cloudflare service is `services/sky-agent-runtime/wrangler.jsonc`. It binds the shared D1 database, one-minute scheduled controller, `REMOTE_AI_TEXT_WORKFLOW`, and `A2A_DELEGATION_WORKFLOW`. D1 rows hold job, consent, quote, reservation, send-claim, status, artifact, and usage evidence. Workflows perform bounded dispatch and reconciliation. Client reconnect reads the existing job; it must not create a replacement when a response is lost.

## Configuration inventory

Set values through the deployment platform's secret/configuration manager. Never commit credentials, private signing keys, raw eSIM install material, or customer prompts to the repository or incident notes. The table describes source contracts; it does not imply that a production value or contract exists.

| Runtime setting | Purpose and safe release condition |
|---|---|
| `A2A_DELEGATION_EXECUTION_ENABLED` | Must remain unset/false during preparation. Set true only after Provider sandbox acceptance, production D1 and trust-key readback, durable cancellation/reconciliation acceptance, and explicit release approval. |
| `A2A_EGRESS_ALLOWED_ORIGINS` | Exact HTTPS origin allowlist for reviewed Agents. Keep empty until each origin, certificate/identity, Agent version, and request scope is reviewed. Never use a wildcard. |
| `A2A_INPUT_ENCRYPTION_KEY` | Encrypts persisted A2A task inputs. Generate and back up using an approved secret manager. Loss makes retained ciphertext unrecoverable; rotation is unsafe until key-versioned decrypt support and a migration procedure are accepted. |
| `A2A_TRUSTED_BROKER_KEYS` | Public trust inventory for device Broker proofs. Load only verified public keys and lifecycle metadata; do not put private signing material here. |
| `A2A_TRUSTED_USAGE_KEYS` | Public trust inventory for Provider-signed final usage receipts. Do not treat a self-reported task state or local synthetic receipt as billable proof. |
| `A2A_PRICE_QUOTES_REQUIRED` | Require quote-bound paid A2A execution. Keep true for any paid release; a missing/untrusted quote or receipt must fail closed. |
| `REMOTE_AI_TEXT_INPUT_ENCRYPTION_KEY` | Encrypts durable direct-LLM task input. Protect and back up separately from A2A key material. Existing ciphertext requires its original key; loss prevents recovery. |
| `REMOTE_AI_TRUSTED_RATE_KEYS` | Public keys for signed rate cards used by the direct-LLM path. A missing, expired, or invalid rate card must block paid execution. |
| `OPENAI_API_KEY` | Provider credential for direct LLM execution. Do not configure before provider terms, rate/meter semantics, spend caps, and invoice reconciliation are accepted. |
| `SKY_REMOTE_LLM_ENABLED` | Additional direct-LLM gate. Keep disabled until production release gates pass. |
| `ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED` | Enforces service entitlement on cloud task entry. Enable after issuer keys, purchase claim recovery, revocation/refund behavior, and production entitlement readback are accepted. |
| `SKY_PACKAGE_RUNTIME_BINDING_TRUSTED_KEYS`, `SKY_PACKAGE_RUNTIME_EXTENSION_URI` | Trust and protocol settings for reviewed Package runtime bindings. Enable only for reviewed, pinned provider/package versions. |

Other `ESIMGO_*` settings belong to the separate carrier/eSIM adapter. They must not be interpreted as cloud-LLM credentials or enabled without provider contract, endpoint idempotency/reconciliation acceptance, and carrier sandbox approval.

Before any production release, record the deployment ID, source revision, migration range, D1 database identity, secret-version identifiers (not values), trusted-key fingerprints, egress origins, execution gates, rollback owner, and acceptance evidence. Apply migrations to a disposable local D1 first, then a contracted sandbox. Production migration and secret changes require an approved change window and a readback of the target identity before writing.

## Release sequence

1. Keep execution disabled and all external origins empty. Run `npm run typecheck`, `npm run lint:product`, `npm run sky:agent-runtime:check`, `npm run sky:a2a:workflow:test`, and `npm run sky:a2a:workflow:positive`. Run the Worker/D1 API and CSV storage suites where the host has adequate temporary-disk capacity. These are local checks only.
2. In a provider sandbox, verify accepted quote/rate-card versions, exact request digest, task identity, bounded deadlines/retries, signed terminal usage receipt, status lookup after lost responses, cancellation acknowledgment, artifact capture, and duplicate-send prevention. Do not route production user work to a fixture origin.
3. Configure production D1 and secrets with execution disabled. Verify account/database identity, migrations, backup/restore, scheduled trigger, trust-key fingerprints, entitlement checks, egress policy, observability, and operator access. Never test by submitting a paid production job.
4. Enable one reviewed Agent or model for an internal, explicitly capped acceptance job only after its provider contract and settlement path are accepted. Validate itemized provider usage against the provider invoice. Expand access only after the complete acceptance record is reviewed.

## Monitor and alert

Use Worker/Workflow logs and D1 read-only queries scoped by job ID. Do not log prompts, tokens, private keys, eSIM activation secrets, or decrypted artifacts. Alert an operator and stop new paid dispatch when any of these occur:

- execution is enabled while required quote, Broker, usage, encryption, or provider configuration is missing;
- queue age exceeds the accepted service target, scheduled sweeps stop, or Workflow failures/retries grow unexpectedly;
- a task is `dispatch_submitting` or otherwise ambiguous without a matching remote task reference;
- a parent reservation exceeds its cap, a reservation has no matching terminal disposition, or usage receipts conflict/replay;
- a Provider reports a terminal state without the expected signed usage receipt or captured artifact;
- cancellation remains unconfirmed past the accepted Provider deadline;
- a quote/rate-card signature, version, currency, owner, request digest, authorization, or deadline does not match;
- an egress origin or runtime/package version differs from its reviewed allowlist.

Show customers confirmed provider-reported usage and reserved/estimated spend with their status. If live usage is unavailable, say so and show the authorized maximum reservation; do not invent a current charge. Mark itemized usage as calculated or provider-reported until invoice reconciliation, and mark settlement only after the payment rail confirms it.

## Stop and recover

1. Disable new paid dispatch by setting the runtime execution gate false and disabling direct remote LLM execution. Verify the deployed configuration readback. Do not delete D1 rows or encryption keys.
2. Keep status, reconciliation, and already-authorized cancellation paths available. A local UI stop click is only a request; report `cancel_requested` until the remote Provider confirms a terminal cancellation. Continue holding the reserved budget while remote execution or cancellation is uncertain.
3. For each affected job, use its owner, parent job ID, request key/digest, quote ID, and remote task ID to query the same remote task. Do not submit a new task when acceptance is unknown. Preserve both local and provider evidence for reconciliation.
4. On restart, let the deterministic Workflow/controller reconcile queued and prepared rows. A queued task may resume only if its saved owner, entitlement, exact input, quote/rate version, authorization, budget reservation, and deadline are still valid. A send-claimed or ambiguous task must be looked up remotely and must never be blindly resent.
5. If an additional approval is needed, leave the task waiting. Device disconnection is not approval. After reconnect, show the existing job and ask for a new explicit approval tied to a fresh quote before any higher spend.
6. Reconcile the final signed usage receipt with provider records and then the invoice and funded Wallet settlement as separate steps. Record any difference; do not edit or overwrite the original receipt.
7. Re-enable dispatch only after the incident is understood, affected holds are reconciled, keys/origins/configuration are verified, and the release owner records acceptance. If key compromise or ciphertext key loss is suspected, keep dispatch disabled and follow the security/retention response; do not rotate the active encryption key in place.

## Acceptance record and current status

For each accepted release retain the exact source revision, D1 migration/readback evidence, secret/key fingerprints, Provider and Agent versions, quote and receipt schema versions, test job IDs, request-loss/duplicate/cancel/restart results, invoice reconciliation, budget-limit result, and device reconnect evidence. Keep customer data out of the record.

Locally implemented and verified: durable job/recovery source, owner scoping, signed quote and usage verification, shared budget reservations, immutable send claims, encrypted task input/artifacts, deadline sweep, explicit approval waits, receipt-backed progress, and Zema's versioned plan gates. Current local API rerun passes 1,048 Worker/D1 assertions. Earlier full `npm run verify` passed 1,028 Worker/D1 and 113 CSV Worker/D1/R2 assertions. The latest separate CSV rerun could not initialize Miniflare SQLite because the host volume returned `SQLITE_IOERR_SHMSIZE` at 171 MiB free.

Not accepted: production D1 migration/readback, production secret custody, live Provider sandbox or invoice matching, funded production Wallet settlement, carrier activation, Android APK/device runtime, and exact-model RockstarOS install/recovery. Local tests, usage rows, or successful SIM entitlement claims do not prove any of these.

See [cloud continuity contract](sky-cloud-continuity.md), [current account-led product baseline](product-baseline.md), and [provider contract readiness](provider-contract-readiness-20260930.md).

## 自社クラウドの運用（task 105）

### 費用上限と受付

- 集計は UTC の暦月。実費の計算は `lib/cloud-cost.ts` の定価表を使用する。表示額は計測した Containers と Workers AI の定価換算で、税・地域差・無料枠・通信・ログを含む請求書の額とは別に照合する。
- `CLOUD_MONTHLY_CAP_USD` の既定は USD 30。「1 文で頼む」の開始時に承認された場合だけ USD 150 を設定する。`CLOUD_USER_MONTHLY_CAP_USD` は承認された 1 人の上限。個別設定が空なら全体上限を適用する。
- 実行担当が計測した利用量を内部 API `POST /api/internal/cloud-operations?source=usage` に送る。専用の `CLOUD_USAGE_INGEST_TOKEN` で認証し、`id`、`userId`、`usage` を送る。`id` は計測元で一意な不変の ID、`usage` は `lib/cloud-cost.ts` の `CloudUsage`、`at` は Unix ミリ秒。ユーザーに帰属する利用には実行主体と同じ内部 ID を使い、共有の Containers 利用に限り `userId: null` が使える。同じ ID と内容の再送は重複計上しない。
- 記録済みの実費が全体または本人の上限に達したら、承認・新規受付 API は理由付きで 429 を返す。単価未確定の行がある場合は不足分を確認するまで新規受付を保留する。受付済みの仕事の結果取得・再照会・取消・照合は続ける。進行中や遅れて届く実費の分だけ、最終請求は受付時の集計を上回り得る。
- 上限に達したら `/noah/review` の「クラウド運営」で月・記録済み費用・未確定単価を確認し、計測元との照合と実行中の仕事の把握を行う。全体枠や個人枠の変更は本人の承認後。上限に達した仕事を別 ID で作り直さない。

### 受付・最初の成果・通知

- 独立した試験環境から、5 分ごとに `CLOUD_PROBE_TOKEN` を使って `node scripts/probe-cloud-admission.mjs <試験サイトのオリジン>` を実行する。プローブは受付と同じ D1 の実費クエリを使い、上限判定が応答することを確かめる。意図どおり上限で受付が閉じていても、判定が正常に返れば成功。合成の見積、仕事、外部送信は発生しない。
- 観測 JSON は試験側に保管し、同じプローブ資格情報で `POST /api/internal/cloud-operations?source=probe` に送る。アプリに届かない間の失敗も試験側に残し、復旧後に送る。各 UTC 5 分枠の最初の観測を保持する。プローブの資格情報では費用イベントを書けない。
- `/noah/review` では、受付の成功・観測・予定を日別に照合する。月 99.5% が目標で、観測のない枠は未計測。最初の成果の目標は受け付けた実行の 95% が 30 秒以内。受付から 30 秒が過ぎても成果がない実行は未達に数え、成果を観測できた実行の p95 秒数も表示する。保存データの消失の目標は 0 件で、下の復元練習で試験データの同一性を確かめる。
- 消失・お金・安全は今すぐ、ほかは朝のまとめへ振り分ける。送信は運用担当が通知先を承認してから開始する。

### 障害時

1. **黒殿の停止**。lease が切れた仕事は結果不明として、同じ job ID と既存の受領記録を照合する。二重実行を避け、新規だけを承認済みの Cloudflare 実行先へ回す。復旧後に記録と実行先を確認して戻す。
2. **Cloudflare の停止**。新規受付を閉じ、端末では下書きを保持し、別系統の状態ページに停止を掲載する。復旧時は受付と D1 の健全性を確認し、受付済みの仕事は同じ ID の状態を問い合わせる。記録のない依頼も自動で二重送信しない。
3. **データ・お金・安全への影響**。上の振り分けに従い運用担当へ引き継ぐ。Spider は閲覧まで。運用担当は状況確認・通知・許可済み復旧を行い、破壊的操作・費用変更・本番 DB の操作は本人が承認する。

### D1 の日次 R2 バックアップと復元練習

1. 承認後の日次ジョブでは D1 の SQL エクスポートを要求し、完了後に期限付き URL から取得する。D1 の識別子、UTC の取得時刻、SQL の SHA-256、保存先の世代を記録し、アクセス制御した非公開の R2 へ保管する。アップロード後にサイズと SHA-256 を照合する。エクスポートが他の D1 リクエストをブロックする時間を考慮して実行枠を決める。[D1 のエクスポートとインポート](https://developers.cloudflare.com/d1/best-practices/import-export-data/) · [Cloudflare の D1 → R2 バックアップ例](https://developers.cloudflare.com/workflows/examples/backup-d1/)
2. 月に 1 回、隔離した空の試験 D1 に R2 の書き出しを戻す。主キー順の行とスキーマの SHA-256、表ごとの行数、参照関係を照合する。異なる場合はバックアップ成功として扱わず、障害の時系列と失敗した世代を保存する。D1 Time Travel は有料枠で 30 日で、対象 DB を上書きするため本番への適用は承認後。[D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/)
3. ローカルで `node scripts/check-cloud-d1-restore.mjs` を実行すると、一時 D1 を SQL に書き出し、一時 R2 を経由して空の一時 D1 に戻す。合成データ 2 表の行数と、スキーマと行を含む SHA-256 を検証する。黒殿への複製は task 101 の後に扱う。

試験環境の計測元と上記手順を検証してから、本番の計測元、通知先、定期実行、書き出し先の承認へ進む。
