# GX00 v3 owner routing

This is a public development backend profile. Each contract keeps its own
existing Wallet and Entitlement database pair. One managed TLS listener selects
an already opened ContractRuntime from an authenticated device. The HTTP body
cannot select an owner, ledger, account, path or peer UID. The existing v1/v2
single-contract profile remains separate; it never falls back to this router.

This unit does not implement game connections, game consent, currency exchange,
production device credentials, hardware verification or real funds. Source tests
are not acceptance of the already frozen Rock OS image. Writer identity,
adoption and restore permission come from the separate coordinator and runtime;
the device credential registry does not replace their fence.

## Protected registry

Create `OwnerRouter(state_dir, credentials_file, clock=...)` only from trusted
backend setup. The router directory must be owned mode 0700, and the credential
file an owned mode 0600 regular file with one link. The fixed profile is:

```json
{
  "schema_version": 3,
  "kind": "public-development-owner-device-credentials",
  "devices": [
    {
      "ledger_ref": "ledger-alice",
      "owner_actor": "alice",
      "owner_ref": "fixture-owner-alice",
      "device_ref": "fixture-gx00-alice-1",
      "credential_revision": 1,
      "active": true,
      "expires_at": 1796601600,
      "token": "PUBLIC-FIXTURE-GX00-ALICE-ONE-v1"
    }
  ]
}
```

Only the existing matching Alice/Bob public owner principals are supported.
There are at most 32 devices, one contract per owner, and one globally unique
token per device. Unknown fields, duplicate JSON keys, noninteger revisions or
expiry values, symlinks, hardlinks and broad file permissions are rejected.
These public fixture credentials are not production secrets or purchased-device
cryptographic attestations. Signed fulfillment eligibility remains mandatory
inside the selected runtime, independently of the router mapping.

The lifetime `router.lock` prevents two supported router writers. Private
`OWNER-DEVICES.json` retains only credential hashes, revision/expiry/state,
immutable device-to-owner/ledger bindings, stable contract identities and its
canonical registry path/UUID. `registry_identity()` exposes only that path/UUID
to trusted coordinator setup; a copied directory at another path is refused.
Missing history in a used directory refuses startup. A changed configuration
cannot remove an old device, rebind its owner/contract, reuse a prior token,
lower a revision or silently reactivate a revoked credential. Rotation uses
the exact next revision with a new public token; revocation uses the next
revision with the same token and expiry. The bounded history retains up to
512 token hashes. Capacity exhaustion is an explicit refusal.

`revoke_device_credential(device_ref, expected_revision)` is a trusted management
method, never an owner HTTP operation. It enters the selected runtime's write
admission before the short registry lock, persists the new inactive revision,
and then exposes it to authentication. Repeating the same revocation is
idempotent. A failed/uncertain registry save poisons this router until explicit
recovery; it cannot continue granting stale access. On restart, the protected
configuration must match the persisted revision or declare a valid rotation.

The current credential registry remains an independent canonical authority when
Wallet databases are restored. The coordinator pins its path/UUID; a new empty
registry cannot replace it through supported runtime opening. This unit provides
no registry backup, restore, rollback or reactivation operation. Restoring an old
copy at the same path with the same UUID is **NOT_IMPLEMENTED** as a protected
operation: path/UUID alone does not prove its revision is current. A durable
revision high-water protocol and interrupted two-party update recovery would
be separate work. Wallet writer fencing does not prove credential rollback safety.

## Runtime integration

Create the router before opening managed runtimes and pass it as their
`verifier`. `bind_runtimes(tuple)` requires the complete configured contract set,
matching owner/primary device and distinct ledger UUID, authority UUID and
canonical path. It persists stable identities and freezes the mapping once.
Restored writer paths/epochs remain the coordinator's responsibility; stable
owner, ledger UUID and authority UUID cannot change through router binding.

The managed handler checks duplicate/missing HTTP headers and exact Bearer
syntax, then calls `authenticate(device_ref, bearer_token, authority_id)`.
Authentication uses constant-time digest comparison and current activation,
expiry and revision checks. The credential selects the runtime; the supplied
authority UUID is only a pin against that selected runtime. `resolve(principal)`
returns the existing runtime without holding the registry lock during contract
admission. Inside admission, `assert_current(principal, descriptor)` rechecks
the credential and frozen descriptor before the actual Wallet dispatch.

Principals are immutable internal values, not self-authenticating capabilities.
Constructing the dataclass in trusted Python does not authenticate a caller.
No principal-valued field is accepted over HTTP. Runtime and registry locks
always follow coordinator admission → registry/device → Store → Wallet order.

The server must stop accepting requests, join its real workers and close every
runtime before `router.close()`. The caller closes the shared coordinator only
after all runtime permits are released. A socket timeout is not worker
termination and does not authorize another writer.

## Explicit client opt-in

`HTTPSWalletTransport(..., authority_id=..., device_ref=...,
protocol_version=3)` uses only `/v3/wallet`. Omitting the new argument retains
the exact old v1/v2 choice and cache fingerprint. Protected OS proxy
configuration uses `schema_version: 3`, the existing
`mode: "development-remote-authority"`, origin/CA/token/authority fields, and
the required `device_ref`; no owner or path-selection fields are allowed.
The v3 configuration and token must be private. Version 3 is included in the
cache fingerprint, so an existing v1/v2 cache cannot be relabelled or reused.
Existing local Wallet databases still require a separate explicit migration.
Version 3 also refuses retained DB sidecars, managed authority/transition markers,
authority locks and dangling storage links before creating any proxy cache.

Successful v3 replies and authenticated failures require both exact authority
and device acknowledgements. Before authentication, the managed gateway has
no request-local identity to disclose. Only a verified TLS 401/403 with both
acknowledgements absent and the exact bounded unauthorized-error shape is
accepted as a denial. This marks the proxy denied and hides stale cached data
while preserving unresolved requests and receipts. A partial acknowledgement,
malformed denial, missing identity on success or other unbound response remains
unresolved; it never acknowledges a financial write.

## Validation boundaries

`test_wallet_owner_router.py` exercises real protected files and locks, principal
and revision rejection, restart history and contract bindings. Its dummy runtime
checks call ordering only; it does not prove the writer fence.
`test_wallet_client_v3.py` checks explicit profiles, unchanged legacy fingerprints,
cache rebinding refusal and strict denial framing. Mock HTTP cases do not claim
TLS verification.

`test_wallet_managed_tls.py` requires the actual A runtime and C coordinator:
two owners, three signed purchased-device fixtures, one real TLS listener,
software-test enrollment, separate terms and balances, one monthly charge for
Alice's shared contract, parallel ATM operations with the same keys across
owners, cross-owner rejection, credential revocation and exact receipt recovery
after a complete managed backend restart. It has no substitute coordinator,
skip or local-ledger fallback. Run it only after A/B/C are integrated, and keep
its result distinct from OS, backup/restore, game and real-money acceptance.
