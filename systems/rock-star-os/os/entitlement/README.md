# Purchase entitlement and monthly billing simulator

This module persists the relationship between a synthetic purchased device, its
owner, a verification reference inherited at handoff, explicit recurring-billing
consent and a monthly billing authorization. The fee is **USD 8.88 = 888 cents**,
including the first month. It uses UTC calendar months with no proration. Payment
success grants access until the next UTC month boundary. No provider, jurisdiction
or real identity verification policy has been selected.

All accepted owner/device/purchase/verification values use `fixture-` references.
No ID document, legal name, address, birth date, bank account or private credential
is accepted or stored. The schema rejects unknown fields. Inheriting a reference
does **not** establish that a real Wallet provider will accept a previous identity
check or exempt the customer from its verification requirements.

The module has no ledger, balance or network listener. `wallet_bridge.py` calls
the existing `blackberryrock.wallet.Wallet`; no existing Wallet file was edited.
Synthetic credit used by tests/demo is explicitly simulated, not Tool revenue.

`device.py` now adds the OS-specific registration/consent adapter and a persistent
local monthly scheduler. Its socket integration and read-only target observer
contract are documented in [DEVICE-CONTRACT.md](DEVICE-CONTRACT.md). Target daemon,
UI and build integration are owned separately; host tests do not establish their
execution in an OS guest.

## Actual implementation and limits

SQLite WAL, `synchronous=FULL`, `BEGIN IMMEDIATE`, uniqueness constraints and
append-only audit triggers protect normal process crashes and concurrent callers.
Authentication tests use separate public role tokens and domain-separated HMAC
webhooks. Every token is intentionally known (`protocol.PUBLIC_TOKENS`); this is
**not production authentication**, real purchaser verification, device binding or
a deployment-ready closed service. No new private key was generated.

The following remain **NOT RUN / unimplemented**: real purchase or KYC providers,
production authorizer and secrets, real payment authorization/settlement, hardware
attestation, secure clock, hardware antirollback, remote HTTP/TLS service,
off-device billing scheduler, native UI integration and guest execution by this
module task. UTC comes from the caller's
OS clock. Disk rollback and privileged local tampering are outside this simulator's
protection. Do not expose the public-fixture tokens to a real customer workflow.

## Parent integration contract

Import with `PYTHONPATH=src:os`:

```python
from entitlement.store import EntitlementStore
from entitlement.protocol import PUBLIC_TOKENS, TERMS_VERSION
from entitlement.wallet_bridge import WalletBridge
```

`EntitlementStore(db_path, clock=None, max_records=10000, max_pending=64,
authorization_ttl=300)` takes a dedicated owned directory that is not group/world
writable. `clock` returns UTC epoch seconds. Limits are bounded and persisted
records are not silently deleted to make room.

| Method | Authentication and result |
| --- | --- |
| `ingest(signed_event)` | HMAC issuer `fulfillment` or `wallet`; immutable acceptance receipt. **Acceptance is not application success**; inspect `event_status`. |
| `event_status(event_id, token)` | Same issuer only; `{event_id,status: QUEUED/APPLIED/REJECTED,outcome}`. |
| `register(device_ref, key, token)` | Owner token bound to handoff owner; returns `{account_id,device_ref,verification_ref,identity_inherited:true,additional_personal_fields_required:[],simulation_only:true}`. |
| `consent(account_id, accepted, terms_version, key, token)` | Matching owner; explicit Boolean and exact `TERMS_VERSION`. Receipt includes consent ID, amount 888, currency, and inflight authorization IDs. `False` cancels future billing. |
| `entitlement(account_id, token)` | Matching owner or Wallet role; current derived state listed below. |
| `authorize_month(account_id, period, key, token)` | Wallet role, current `YYYY-MM` only, current eligible device and accepted consent. Stable authorization ID per account/month. |
| `claim_authorization(authorization_id, key, token)` | Wallet role; commits one claim attempt while consent, identity and TTL are current. |
| `authorization(authorization_id, token)` | Wallet role; **current** authorization state. |
| `WalletBridge(store, wallet, account_id, token).execute(authorization_id,key,token)` | Optional adapter; requires a committed claim and enforces one Wallet DB per account. Rechecks current state, calls existing Wallet, records authenticated result, returns `{authorization,wallet_bill_id,event_status,simulation_only}`. |

Keys are scoped to the authenticated actor and conflict if reused for another
operation/body. Replay returns the original historical receipt, even after time
or state changes. **Never treat an old claim receipt as current authorization.**
Use the bridge, which reads current state inside a serialized transaction, or
implement equivalent current-state checks before calling a payment executor.

`entitlement()` returns exactly:

```text
account_id, device_ref, device_eligible, identity_inherited,
verification_ref, verification_valid_until, subscription_state,
access_allowed, access_until, auto_renew, consent_id,
monthly_fee_minor: 888, currency: USD, simulation_only: true
```

`device_eligible` requires an active purchase handoff and unexpired inherited
verification. `access_allowed` additionally requires an observed paid period.
`subscription_state` is one of `DEVICE_SUSPENDED`, `IDENTITY_EXPIRED`,
`CONSENT_REQUIRED`, `AWAITING_FIRST_PAYMENT`, `ACTIVE`, `PAST_DUE`,
`CANCEL_AT_PERIOD_END`, `CANCELED`. Device suspension overrides paid access; renewal
of the synthetic verification does not invent billing consent.

Authorization dictionaries return exactly:

```text
authorization_id, account_id, period, consent_id, expires_at, period_end,
state: ISSUED/CLAIMED/FAILED/CANCELED/PAID, attempt, claimed_at, wallet_bill_id,
wallet_idempotency_key: authorization_id, amount_minor: 888, currency: USD,
terms_version: simulator-monthly-usd-8.88-v1, simulation_only: true
```

Cancellation invalidates unclaimed authorization. A claimed operation remains
inflight until its outcome is known. The bridge stops an unexecuted fresh debit
if cancellation/expiry has already won the transaction lock. If execution won,
cancellation follows it and keeps paid access to month end. An existing confirmed
Wallet bill is reconciled even after cancellation; it never restores auto-renew.
Definite failure can be rearmed with a new operation key under fresh consent;
the month keeps the **same Wallet idempotency key**. Unknown exceptions leave
`CLAIMED`, requiring reconciliation, never a new charge ID.

Each claim attempt retains its own append-only timestamp. A delayed authenticated
success is checked against the attempt it actually reports, even if a later retry
has already been claimed. It can reconcile the paid month after cancellation
without restoring auto-renew. Results dated before their own claim are rejected.
When opening a database from the earlier schema, the store restores these times
from immutable claim receipts in one transaction; it does not substitute the
latest attempt's timestamp for unknown history. Conflicting history fails closed.

The bridge is not a two-database atomic commit. If Wallet commits and the backend
crashes before its receipt, the next call observes the original Wallet bill and
finishes the backend record. Tests inject exactly this window. Bridge consent
mirroring uses an already explicit backend consent; registration or handoff alone
does not consent. External producers must preserve this rule when using the raw
authorization interface.

## Authenticated webhook schema

`sign_fixture_event(issuer,event_id,stream,sequence,occurred_at,kind,payload)` is
the public test SDK helper. It returns the exact envelope fields:
`schema_version:1,issuer,event_id,stream,sequence,occurred_at,kind,payload,signature`.
Signature is lowercase HMAC-SHA256 over `b"RockEntitlementWebhook-v1\0" +
canonical(envelope_without_signature)` using the issuer's known public token.
This has no relationship to a selected provider's actual webhook protocol.

| Issuer / kind | Stream and exact payload |
| --- | --- |
| fulfillment / handoff | `device:<device_ref>`; `device_ref,owner_ref,purchase_ref,verification_ref,verified_at,valid_until` |
| fulfillment / suspend | Same device stream; `device_ref` |
| fulfillment / restore | Same device stream; `device_ref,verification_ref,verified_at,valid_until` |
| wallet / payment_succeeded | `billing:<authorization_id>`; `authorization_id,attempt,period,amount_minor:888,currency:USD,wallet_bill_id` |
| wallet / payment_failed | Same billing stream; `authorization_id,attempt,period,amount_minor:888,currency:USD,reason` where reason is `insufficient_funds` or `definite_failure`. Unknown outcomes must not be sent as failure. |

Sequences start at 1 within each subject's stream. Out-of-order events wait in a
bounded persistent inbox. Exact event replay returns the same receipt; changed
body or sequence collisions conflict. Stream subject and issuer role are checked
before acceptance. Timestamps may be at most 30 seconds ahead and cannot decrease
within an applied stream. Authenticated but invalid state transitions become
durably `REJECTED`, consume their sequence, and allow later correct events to
proceed. Inspect statuses; receipt acceptance alone is insufficient.

Later failure cannot reverse a paid month. A different bill ID for an already
paid month is rejected. Handoff cannot reassign an existing device or reuse a
purchase for a second device. Account balance/ledger assertions are never accepted
by this schema.

## Run the repeatable fixture and tests

From the repository root, choose a dedicated simulator directory. Registration
alone does not request billing:

```sh
PYTHONPATH=src:os python3 -m entitlement.demo --state /tmp/rock-entitlement-fixture
```

For explicitly consented synthetic billing, use another dedicated directory:

```sh
PYTHONPATH=src:os python3 -m entitlement.demo \
  --state /tmp/rock-entitlement-billing-fixture \
  --accept-fixture-monthly-terms --simulate-settled-credit-minor 3000
PYTHONPATH=src:os python3 -m entitlement.verify_host
```

The demo uses a fixed simulated clock, **2026-09-08 09:00 UTC**. Repeating identical
arguments returns durable receipts and does not add another credit or fee. If a
test with zero balance failed, use normal new retry keys to rearm; replaying the
same failed demo operation intentionally returns the prior receipt.

Host evidence is in `evidence/host-verification.json` and `host-suite.log`. The
focus suite checks scoped authentication, tampering, strict fields and amounts,
reordering, bounded capacity, conflict/replay after restart, purchase uniqueness,
verification expiry/restoration, cancellation races, concurrent real Wallet calls,
injected post-Wallet crash and lost acknowledgement, delayed earlier-attempt success
after a retry and cancellation, per-attempt history recovery across schema upgrades,
and absence of a second ledger.
