# Cardless ATM simulator — SIMULATOR ONLY

This is a local test state machine using the existing `blackberryrock.wallet.Wallet` journal. It does not connect to a physical ATM, dispense cash, transfer real funds, perform KYC, or establish production ATM authentication. The operating-system integration and guest acceptance test are **NOT_RUN** for this module's handoff.

`simulator.py` creates credential metadata in the same private SQLite database as the existing Wallet. Each mutation commits the credential, withdrawal, journal postings and idempotency receipt in one `Wallet._transaction()` (`BEGIN IMMEDIATE`). There is no second balance ledger, network listener, worker, signing key, or production provider integration. The implementation is local project code; no third-party implementation was imported.

## Integration boundary

Construct `CardlessATMSimulator(wallet, *, clock=time.time, max_credentials=10000)` around the Wallet already owned by the Wallet daemon. The database parent must be owned by the daemon UID and have no group/other permissions; the main database must be an owned regular file. The constructor tightens existing database/WAL/SHM files to mode `0600`. A daemon-owned `0700` parent is required. Root or compromise of that UID remains outside this protection.

Owner methods require the separate keyword `context=TrustedWalletContext(owner_id, device_id, eligible_for_new_withdrawals)`. The OS must authenticate its socket peer and derive these fields from protected membership while holding the membership admission guard until `issue()` completes. Never construct this context from request JSON. The dataclass is an integration contract, not independent identity evidence. The first successful issue binds this Wallet database to that owner/device; changing either is rejected. Device transfer and recovery are not implemented here.

An eligible member can issue a new withdrawal. An ineligible/expired member with the same owner/device can inspect and resolve existing holds. Membership cancellation must not prevent resolution of money already held. Active eligibility is checked before an issuance receipt can be replayed; inactive callers should use owner-scoped status/history for recovery.

ATM methods require a separately provided `actor=ATMActor(actor_id, token)`. The two accepted fixtures are exposed by `PUBLIC_ATM_FIXTURES`:

| ATM ID | Actor ID | Public test token |
| --- | --- | --- |
| `SIM-ATM-001` | `PUBLIC-ATM-ACTOR-001` | `PUBLIC-FIXTURE-ATM-001-TOKEN-v1` |
| `SIM-ATM-002` | `PUBLIC-ATM-ACTOR-002` | `PUBLIC-FIXTURE-ATM-002-TOKEN-v1` |

These tokens are intentionally public. They demonstrate actor/ATM routing and rejection boundaries in the simulator; they are **not secure production credentials**. The user-facing owner channel must never supply these actors or call ATM assertion operations. A future transport must authenticate a separate ATM actor and pass it outside the JSON payload. No such external transport is implemented here.

The existing ordinary `Wallet.reserve`, `dispense`, `mark_unknown` and `reconcile` APIs have not been secured or changed by this module. They must not be exposed as alternative routes around these checks. Detected divergence between credential and Wallet withdrawal state fails closed, but this does not make those independent APIs authenticated.

## API contract

Methods return dictionaries. Authentication and rejected transitions raise `AuthenticationError`/`ATMError` (both inherit `WalletError`); insufficient funds raises the existing `InsufficientFunds`; changed idempotency payloads raise the existing `IdempotencyConflict`. SQLite and I/O exceptions propagate. The caller must present an uncertain result as uncertain, retain the same key and payload, then retry/status-check; it must not assume an exception proves rollback.

| Owner method | Arguments before trusted context | Meaning |
| --- | --- | --- |
| `issue` | `amount_minor, atm_id, key` | Reserve available settled funds and create one credential atomically. |
| `status` | `withdrawal_id` | Current state and amounts; contains only the code hash. |
| `history` | keyword `limit=50` | Owner-scoped current items, total and truncation flag; limit 1–100. |
| `cancel` | `withdrawal_id, key` | Release only an unconsumed hold; consumed withdrawals become `UNKNOWN`. |
| `expire` | `withdrawal_id, key` | Enforce the expiry boundary; consumed withdrawals retain the hold as `UNKNOWN`. |
| `timeout` | `withdrawal_id, key` | Mark a consumed withdrawal `UNKNOWN`; unconsumed timeout is rejected. |
| `expire_due` | `key`, keyword `limit=64` | Atomically process up to 64 expired credentials for this owner/device. |

| ATM method | Arguments before trusted actor | Meaning |
| --- | --- | --- |
| `redeem` | `code, atm_id, key` | Consume once at the bound ATM; does not assert any cash was dispensed. |
| `dispense` | `withdrawal_id, dispensed_minor, atm_id, key` | Record an authenticated fixture's cumulative observed cash amount. |
| `reconcile` | `withdrawal_id, total_dispensed_minor, atm_id, key` | Record the final cumulative fixture assertion and release the confirmed remainder. |

Despite the short name, `dispensed_minor` is **cumulative**, not an increment. Assertions cannot decrease, exceed the reserved amount, or contradict an already final amount. All amounts are integer USD cents; booleans/floats/strings are rejected. Issuance is `$10`–`$500`, in `$10` increments (1000–50000 cents). Partial/final observations can be any integer cent amount within the reservation; they simulate assertions and do not claim physical note denominations.

`dispatch(request, *, context=None, actor=None)` returns `{"ok": true, "result": ...}`. The request must contain integer `v: 1`, `op`, and exactly the fields below; extra identity, actor, token or other fields are rejected. All methods are local and do no external sending.

| `op` | Exact additional JSON fields |
| --- | --- |
| `atm.issue` | `amount_minor`, `atm_id`, `key` |
| `atm.status` | `withdrawal_id` |
| `atm.history` | `limit` |
| `atm.cancel`, `atm.expire`, `atm.timeout` | `withdrawal_id`, `key` |
| `atm.expire_due` | `key`, `limit` |
| `atm.redeem` | `code`, `atm_id`, `key` |
| `atm.dispense` | `withdrawal_id`, `dispensed_minor`, `atm_id`, `key` |
| `atm.reconcile` | `withdrawal_id`, `total_dispensed_minor`, `atm_id`, `key` |

The core owns no persistent connections or threads; no `close()` is needed. Cleanup is caller-driven. Use a new stable cleanup key for each new scheduled `expire_due` pass, and preserve that key when retrying the same pass. Reads do not implicitly release expired funds. Expired codes are rejected immediately by the clock check even before cleanup runs. For a consistent combined Wallet/ATM/membership snapshot, the OS should hold its existing shared adapter snapshot guard across those reads and serialize its ATM mutations with that guard.

## State and money

| Event | Credential result | Existing Wallet effect |
| --- | --- | --- |
| Issue | `ISSUED` | `AVAILABLE → WITHDRAW_HOLD`; withdrawal `RESERVED`. |
| Cancel/expire before consumption | `CANCELED` / `EXPIRED` | Full hold returned to `AVAILABLE`; zero dispensed. |
| Redeem before expiry | `AUTHORIZED_NOT_DISPENSED` | Code consumed; full hold remains; no cash posting. |
| Cancel/timeout/expire after consumption | `UNKNOWN` | Remaining hold stays held. |
| Non-final partial assertion | `PARTIAL_DISPENSED` | Only new cumulative delta moves from hold to `CASH_DISPENSED`; remainder held. |
| Partial/zero assertion while unknown | `UNKNOWN` | Record any new delta; do not claim the uncertainty resolved. |
| Full cumulative assertion | `DISPENSED` | Entire reservation accounted as fixture cash; no hold remains. |
| Final zero assertion | `REVERSED` | Release the entire remaining hold. |
| Final partial assertion | `PARTIAL_REVERSED` | Account for asserted cash and release only the confirmed remainder. |

Terminal states are never reopened by late cancellation, expiry, timeout, or conflicting final assertions. After consumption, time alone cannot release funds. Only the separately authenticated fixture's final reconciliation can confirm an unspent remainder. These assertions carry `observation_source: PUBLIC_ATM_FIXTURE_ASSERTION`, not provider settlement evidence.

SQLite serialization determines cancel/redeem races: cancellation first prevents consumption and returns funds; consumption first means cancellation keeps the hold as `UNKNOWN`. Batch cleanup and final reconciliation roll back all associated credential/ledger/receipt changes if a pre-commit storage failure occurs. A lost reply after a successful commit is recovered with the original key.

## Receipts, credential privacy and limits

Each code is `secrets.token_urlsafe(24)` (32 URL-safe characters) with a 300-second deadline. It is a short-lived test bearer code, not a generated signing key. Redemption requires both the code and the matching public ATM fixture actor. A new key cannot consume a code twice; retrying the original key returns the original authorization receipt with the same `authorization_id`.

An issuance receipt is explicitly historical: `receipt_kind: immutable_issuance`, `state_at_issue: ISSUED`. Replaying it after expiry or settlement does not make the code usable again. Authorization and mutation receipts likewise represent the original accepted operation. Always use current `status()` to render current state. A repeated authorization receipt is not a second dispense instruction; any future ATM adapter must durably deduplicate the stable authorization ID on its own side.

The code hash is stored in `atm_credentials`; the raw code is retained only in the private issuance result in existing `wallet_idempotency.result_json` so an interrupted issuance response can be recovered exactly. Status, history, journal postings and ordinary Wallet snapshots do not include raw codes. Do not log issue responses, redeem requests, private SQLite files or bearer codes. Evidence files contain source hashes and test results only.

Encryption at rest, secure deletion, receipt retention expiry, backup scrubbing and production secret management are **NOT_IMPLEMENTED**. Database/WAL/backups may retain the raw issuance receipt after expiry. The default limit is 10000 retained credentials, including terminal ones; reaching it blocks new issuance but permits existing same-key recovery. History is bounded to 100 entries per read and cleanup to 64 transitions per pass. Existing Wallet journal/idempotency retention is unchanged. There is no secure clock or hardware antirollback; the clock is injected for tests and defaults to the system UTC clock.

## Verification

From the repository root:

```sh
PYTHONPATH=src:os python3 -W error::ResourceWarning -m unittest discover -s os/atm/tests -v
```

The focused suite covers amount boundaries, owner/device scope, inactive membership, changed-payload retries, wrong actor/ATM/token, single use, exact expiry, partial/final reconciliation, restart, cancellation/consumption races, conflicting concurrent final assertions, pre-commit rollback including batch cleanup, post-commit lost responses, privacy and credential retention limits. It uses temporary Wallet databases and synthetic settled balances; no real funds, production credentials or external calls are used.

See `evidence/host-verification.json` for the actual focused run and source hashes, and `handoff.json` for the OS integration contract. A host unit pass does not establish target-guest acceptance, real ATM connectivity, provider authentication, KYC compliance, cash dispensing or production readiness.
