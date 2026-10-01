# OS Wallet membership and monthly scheduler

The new module is a **public-fixture simulator** for the UID 1003 Wallet daemon.
It uses the existing Wallet ledger. No real purchase/KYC/payment provider, real
identity proof, private production key, external message or real charge exists.
The caller's trusted Unix-socket peer UID is checked; a UID or token sent in JSON
is rejected. Actual kernel peer credentials and UI routing belong to the platform
socket integration, not this module's host unit-test proof.

## Small target adapter

```python
from entitlement.device import DeviceWalletAdapter

membership = DeviceWalletAdapter(
    '/data/wallet/membership', existing_wallet,
    provisioning_file='/usr/share/rock/development-device-handoff.json',
    start_scheduler=True,
)

# actual_peer_uid must come from the trusted socket handler, never JSON.
reply = membership.dispatch(request, peer_uid=actual_peer_uid)

# Other existing Wallet calls must hold this guard through their completion.
with membership.admission_guard(request['op'], peer_uid=actual_peer_uid):
    result = existing_wallet.reserve(request['amount_minor'], request['key'])

with membership.snapshot_guard(peer_uid=actual_peer_uid):
    snapshot = existing_wallet.snapshot()
    snapshot['membership'] = membership.membership()
    snapshot['billing'] = membership.billing_status()
```

Constructor options: `clock=None`, `start_scheduler=True`, `poll_seconds=5`,
`retry_seconds=60`. Production-shaped target construction uses the OS clock and
starts the scheduler. Unit/isolated target tests may explicitly supply a test
clock and `start_scheduler=False`; there is no environment override or public
JSON clock/tick operation. Call `close()` at daemon shutdown. `start()` replaces
a dead thread reference and `tick()` performs at most one internal work cycle.

`require_entitlement(operation, *, peer_uid)` remains available for an immediate
eligibility check. For actual Wallet mutation use `admission_guard` to keep the
same thread/process lock across the check and operation. All device lifecycle,
consent, due processing and guarded Wallet actions share this scope. A single
daemon owns the state and Wallet; no independent writer may bypass this scope.
`snapshot_guard(*, peer_uid)` keeps all three financial/membership/due reads in
the same scope, so a scheduler commit cannot split a combined UI snapshot. The
current recurring intent is `membership.entitlement.auto_renew`; old Wallet
consent ledger records remain historical and are not deleted or relabeled.

| Operation | Exact request fields in addition to `v:1,op` |
| --- | --- |
| `wallet.register` | `key`; device/owner/verification are taken from provisioned evidence. |
| `wallet.consent` | `key,accepted,terms_version`; explicit Boolean, exact `simulator-monthly-usd-8.88-v1`. |
| `wallet.bill` | `key,period`; **current UTC `YYYY-MM` only** for a new request. |
| `wallet.membership` | None; read-only registration and qualification state. |
| `wallet.billing.status` | None; read-only due history and worker state. |

Dispatch accepts authenticated peer UIDs **0 or 1002**, matching the existing
Wallet socket boundary. Successful responses are `{ok:true,result:...}`. Known
policy rejections are `{ok:false,code:'rejected',error,retry_with_new_key:true}`
and remain the same on replay. Reusing a key with different request content
raises `Conflict(ValueError)`. Malformed fields and unauthorized peers fail
before mutation. JSON carries no bearer token, device selection, owner selection
or personal identity data.

An I/O/SQLite failure whose result cannot be established leaves a pending API
receipt and raises to the existing socket handler. Its response must say
`unavailable` and request **the same key** for reconciliation. This is uncertainty,
not a durable rejection. Registration/consent replay uses the backend's original
immutable receipt even if its first API acknowledgement was lost.

## Receipt and actual payment are separate

`wallet.bill` returns exactly this **acceptance**, not a successful payment:

```text
accepted: true
operation: <request key>
period: <current UTC month>
schedule_id: <stable account/month ID>
simulation_only: true
meaning: scheduled; inspect wallet.billing.status for actual result
```

Due insertion and acceptance response commit in one SQLite transaction. Later
payment failures do not change that response. All different request keys for
the same month refer to the same schedule and Wallet authorization key. A paid
month is never charged again. Replaying an old month's accepted key returns
history; a new request for that old month is rejected.

`wallet.billing.status.result` contains `simulation_only:true`,
`backend_connected:false`, `monthly_fee_minor:888`, `currency:'USD'`,
`period_basis:'UTC calendar month'`, `history` (at most 12 rows),
`pending_api_receipts`, `worker_alive`, `worker_error`, `worker_failures`,
`retry_at_unix`. Each history row has `period,schedule_id,account_id,status,
generation,authorization_id,next_attempt,failures,last_error,updated_at`.
Statuses are `due`, `processing`, `retry_wait`, `paid`, `blocked`.

After explicit consent, the live scheduler creates the current month's due even
without a manual bill request. It persists the work generation before issuing
authorization, then claim, then calls **WalletBridge**, then records the due
result. Restarts preserve the same generation during an unknown result. A known
failure may use a new generation after the retry delay, but keeps the month’s
same Wallet idempotency key. A new explicit bill request expedites a known failed
due; its original acceptance remains immutable.

SQLite/OSError does not silently kill the worker. Diagnostic errors are visible
and the outer retry delay is bounded at 30 seconds. The due's configured payment
retry delay bounds reattempt frequency. Existing Store record/claim limits still
apply; this development module has no automatic audit deletion. The software
remembers the highest observed UTC month and refuses new billing after a month
rollback. This is **not** a secure clock or hardware antirollback mechanism.

An OS that is powered off cannot run this local scheduler. On restart it may
reconcile an older unknown claim, but never creates fresh retroactive debits for
missed offline months. A real always-on backend billing policy remains unselected.

## Cancellation and expiry boundary

Cancellation stops **future billing**. Unclaimed dues are blocked. A processing
claim is reconciled: an already committed Wallet bill is recorded, while a fresh
debit is refused after cancellation or verification expiry. Prior bills and
paid-period history remain intact. A re-consent is explicit and does not create
a second charge in the same month.

`wallet.sale` and `wallet.reserve` require registration and current purchased-
device eligibility inside `admission_guard`. Cancellation by itself does not
freeze existing funds. Resolving an already created sale or hold through
`wallet.settle`, `wallet.dispense`, `wallet.unknown`, `wallet.reconcile` requires
the registered account but remains possible after cancellation/expiry. The
existing Wallet still validates the referenced record and prevents overpayment
or duplicate observations. No resolution operation creates a fresh withdrawal.

## Provisioning and minimum registration

`fixtures/device-handoff.json` is a fixed public development HMAC bundle. It
asserts synthetic handoff at **2026-09-08 00:00 UTC**, valid for 90 days; startup
does not renew it. The file uses only opaque `fixture-` references. The loader
accepts an owned/root-owned regular file that is not group/world writable,
rejects symlinks and unknown fields, and validates all signatures before applying
its bounded ordered event bundle in one transaction.

The first device/owner/handoff identity is immutable. A later signed synthetic
verification renewal may be appended to that original bundle and applied on
restart; it does not undo a saved cancellation. No identity document or extra
personal registration field is retained. An actual provider may require its own
verification; this fixture makes no legal exemption claim.

`wallet.membership.result` identifies the simulation and unconnected backend,
reports `registered` and `registration_status`, and includes the standalone
Store's current `entitlement` after registration. It always has
`registration_input_fields:[]` and `real_identity_verified:false`.

## Tests and read-only target observer

Run the complete module suite with `PYTHONPATH=src:os python3 -m
entitlement.verify_host`. New tests are in `tests/test_device_wallet.py` within
this module. They use real SQLite and the existing Wallet, cover consent and
period boundaries, bad peers/fields/evidence, restart, concurrent requests,
lost acknowledgement, atomic due acceptance, final result failure and hold
resolution after cancellation/expiry.

`guest_observer.py` only calls `wallet.membership`, `wallet.billing.status` and
Wallet `snapshot` using the existing authenticated socket helper. It checks
simulation labels, fixed fee, unique periods, paid rows against actual Wallet
bills and ledger balance. It neither registers nor consents nor funds nor bills
nor ticks. Its main entry requires Linux ARM64 root and prints
`ROCK_ENTITLEMENT_OBSERVER_PASS` only after those real target reads succeed.
Host validation of the observer contract is separate from guest execution.

Parent integration owns service.py, the native UI, build hook and actual guest
test invocation. This module task has not executed its new adapter in a guest.
