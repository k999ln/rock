# Sky cloud execution operations and recovery runbook

Status: operator procedure for local preparation and future contracted acceptance, 2026-10-02. This is not authorization to deploy production execution or billing. The runtime currently has no accepted production provider contract, production D1 readback, funded Wallet path, or device acceptance.

## Service boundary

The SIM/eSIM is the service-distribution and entitlement entry. Carrier activation, RockstarOS/client installation, cloud task acceptance, LLM/provider execution, metering, and settlement are separate states. A paid task may run after a device disconnects only after the cloud has durably accepted the exact request, saved its authorization and budget reservation, and returned the same job ID. An unsent draft does not run offline. A local usage record is not an invoice or payment.

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

See [cloud continuity contract](sky-cloud-continuity.md), [SIM/eSIM-led product architecture](sim-led-product-architecture.md), and [provider contract readiness](provider-contract-readiness-20260930.md).
